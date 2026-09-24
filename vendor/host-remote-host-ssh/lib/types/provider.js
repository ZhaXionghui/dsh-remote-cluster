/** SSH backend with leased `ssh2` and OpenSSH ControlMaster connection paths. */
import { existsSync } from 'node:fs';
import { TextRetainer } from '@deepseek-ai/dsh-output-retention';
import { runNativeCommand } from '@deepseek-ai/dsh-native-command';
import { RemoteHostError, } from '../../../host-remote-host/lib/index.js';
import { Client } from 'ssh2';
import { INSPECTION_SCRIPT, parseRemoteHostFacts } from "./facts.js";
import { controlSocketExists, ensureControlSocketDirectory, isControlMasterActive, removeControlSocket, runControlMasterScript, sshControlExecArgs, sshControlExitArgs, sshControlScpArgs, } from "./control-master.js";
import { assertTransferPaths, assertWithinTransferLimit, createSsh2Sftp, localFileBytes, runSftpTransfer, transferCopyFailure, transferResult, } from "./transfer.js";
import { NATIVE_SSH_CLIENT, sshClientHasSyncLiveness, sshClientInvocation, } from "./ssh-client.js";
const POSIX_STDIN_COMMAND = 'sh -s';
/** Control-master retention used when a deployment states nothing else. */
const DEFAULT_CONTROL_PERSIST_SECONDS = 900;
/** Environment variable carrying one remote path to a stdin-fed probe script. */
const CONTROL_TRANSFER_PATH_VAR = 'DSH_TRANSFER_PATH';
const CONTROL_PATH_EXISTS_SCRIPT = `if [ -e "$${CONTROL_TRANSFER_PATH_VAR}" ]; then printf present; else printf absent; fi`;
const CONTROL_FILE_BYTES_SCRIPT = `if [ -f "$${CONTROL_TRANSFER_PATH_VAR}" ]; then wc -c < "$${CONTROL_TRANSFER_PATH_VAR}"; fi`;
/** Byte cap for the two fixed control-master probe scripts. */
const CONTROL_PROBE_MAX_OUTPUT_BYTES = 64;
function abortError(signal) {
    return signal.reason instanceof Error
        ? signal.reason
        : new DOMException('The operation was aborted', 'AbortError');
}
/**
 * Fire-and-forget continuation for a settled promise whose outcome is not
 * consumed here.
 *
 * A background probe publishes its result through the next synchronous
 * snapshot, so neither settlement needs a reaction; sharing one no-op keeps
 * that intent explicit and keeps the continuation covered on the satisfied
 * path (the probe converts its own failures into `false`, so it never rejects).
 */
function ignoreOutcome() { }
async function waitWithAbort(promise, signal) {
    if (signal === undefined)
        return await promise;
    if (signal.aborted)
        throw abortError(signal);
    return await new Promise((resolve, reject) => {
        const onAbort = () => { reject(abortError(signal)); };
        signal.addEventListener('abort', onAbort, { once: true });
        void promise.then(resolve, reject).finally(() => {
            signal.removeEventListener('abort', onAbort);
        });
    });
}
function connectionFailure(error) {
    return `SSH connection failed: ${error.message}`;
}
function isPasswordPrompt(prompt) {
    const text = prompt.prompt.toLowerCase();
    return prompt.echo !== true
        && /\bpassword\b/u.test(text)
        && !/\b(?:otp|one[- ]time|verification|code|token)\b/u.test(text);
}
/** One provider-owned host and its persistent, multiplexed SSH connection paths. */
export class SshRemoteHostBackend {
    summary;
    options;
    clientFactory;
    sshClient;
    controlStatusRunner;
    controlProbeRunner;
    controlScriptRunner;
    transferRunner;
    sftpFactory;
    client;
    connectPromise;
    closePromise;
    connectedAt;
    failedAt;
    failureMessage;
    activeLeases = 0;
    idleTimer;
    reclaimAt;
    disconnecting = false;
    disposing = false;
    disposed = false;
    disposePromise;
    commands = new Set();
    authPassword;
    authPrompt;
    connectionDurationMs;
    interactiveAuthRequired = false;
    trustedHostKeySha256;
    pendingHostKeySha256;
    controlRequested = false;
    controlConnectedAt;
    controlProbePending = false;
    /**
     * @param options - validated target, authentication material, lifecycle limits, and optional test seams.
     */
    constructor(options) {
        if (options.summary.user === undefined || options.summary.user.trim().length === 0) {
            throw new Error('remote-host-ssh: SSH backend summary must include a non-empty user');
        }
        this.options = options;
        this.summary = options.summary;
        this.clientFactory = options.clientFactory ?? (() => new Client());
        this.sshClient = options.client ?? NATIVE_SSH_CLIENT;
        // Two views of the status runner: the client-aware wrapper for this
        // provider's own `ssh -O exit` call, and the raw seam for
        // `isControlMasterActive`, which performs its own prefixing (see that
        // function) so an injected recording runner observes the exact argv once.
        const baseStatusRunner = options.controlStatusRunner ?? runNativeCommand;
        this.controlProbeRunner = baseStatusRunner;
        this.controlStatusRunner = this.clientAwareRunner(baseStatusRunner);
        this.controlScriptRunner = options.controlScriptRunner ?? runControlMasterScript;
        this.transferRunner = this.clientAwareRunner(options.transferRunner ?? runNativeCommand);
        this.sftpFactory = options.sftpFactory ?? createSsh2Sftp;
        this.trustedHostKeySha256 = options.hostKeySha256?.toLowerCase();
    }
    /**
     * Wrap a no-shell runner so an OpenSSH tool command carries the resolved
     * client's argv prefix.
     *
     * The mapping wraps the caller-supplied runner, so a recording runner in a
     * suite still observes the exact argv the real process would spawn — the
     * prefix included. It serves this provider's own `ssh -O exit` and `scp`
     * calls; the `ssh -O check` probe is prefixed inside
     * `isControlMasterActive`, which therefore receives the raw runner.
     * @param base - the underlying runner (injected seam or `runNativeCommand`).
     * @returns a runner that translates `ssh`/`scp` into the client invocation.
     */
    clientAwareRunner(base) {
        return (command, args, signal) => {
            const invocation = sshClientInvocation(this.sshClient, command === 'scp' ? 'scp' : 'ssh', args);
            return base(invocation.command, invocation.args, signal);
        };
    }
    /**
     * Decide whether this target's default transport is the provider-owned ControlMaster.
     *
     * A target is password-only when it configures neither a private key nor an
     * agent; only then can the OpenSSH client own the interactive login, and only
     * then does `passwordControlMaster` apply.
     * @returns true when the ControlMaster path is preferred over `ssh2`.
     */
    preferControlMaster() {
        if (this.options.privateKey !== undefined || this.options.agentSocket !== undefined)
            return false;
        if (this.options.passwordControlMaster === false)
            return false;
        return this.options.controlPath !== undefined;
    }
    /** Resolve the ControlPersist retention for this target's provider-owned socket. */
    controlPersistSeconds() {
        if (this.connectionDurationMs !== undefined) {
            return Math.max(1, Math.ceil(this.connectionDurationMs / 1_000));
        }
        return Math.max(1, Math.trunc(this.options.controlPersistSeconds ?? DEFAULT_CONTROL_PERSIST_SECONDS));
    }
    controlTarget() {
        const controlPath = this.options.controlPath;
        const username = this.summary.user;
        if (controlPath === undefined || username === undefined)
            return undefined;
        return {
            host: this.summary.hostname,
            port: this.summary.port,
            username,
            ...this.options.identityFile === undefined ? {} : { identityFile: this.options.identityFile },
            controlPath,
            controlPersistSeconds: this.controlPersistSeconds(),
            serverAliveIntervalSeconds: Math.max(1, Math.ceil(this.options.limits.keepaliveIntervalMs / 1_000)),
            serverAliveCountMax: this.options.limits.keepaliveCountMax,
            client: this.sshClient,
        };
    }
    observeControlSocket() {
        const target = this.controlTarget();
        if (target === undefined || this.controlConnectedAt !== undefined)
            return;
        if (sshClientHasSyncLiveness(this.sshClient)) {
            if (!controlSocketExists(target.controlPath))
                return;
            this.controlConnectedAt = Date.now();
            this.clearFailure();
            this.scheduleIdleTimer();
            return;
        }
        // A cross-boundary client (WSL) exposes no synchronous liveness signal, so
        // a pending interactive login is confirmed with ONE background probe whose
        // result the NEXT synchronous snapshot publishes as the control-master
        // transport. `controlProbePending` keeps repeated snapshots from stacking
        // probes, while each snapshot that still finds no master starts a fresh one
        // (so a slow login is retried, never abandoned), and the probe joins
        // `commands` so dispose() awaits it. This is the ONLY path that preserves
        // the pending-login marker: a passive peek must not consume it, whereas a
        // user- or operation-initiated refresh must still clear a dead master.
        if (!this.controlRequested || this.controlProbePending)
            return;
        this.controlProbePending = true;
        const probe = this.refreshControlMaster(undefined, { preservePendingLogin: true })
            .then(ignoreOutcome, ignoreOutcome);
        this.commands.add(probe);
        void probe.finally(() => {
            this.commands.delete(probe);
            this.controlProbePending = false;
        });
    }
    /** Label the connection path that currently carries operations. */
    currentTransport() {
        return this.controlConnectedAt !== undefined ? 'control-master' : 'ssh2';
    }
    /** @returns a fresh provider lifecycle snapshot without authentication data. */
    snapshot() {
        this.observeControlSocket();
        if (this.failedAt !== undefined
            && this.failureMessage !== undefined
            && this.client === undefined
            && this.controlConnectedAt === undefined) {
            return { state: 'failed', failedAt: this.failedAt, message: this.failureMessage };
        }
        const connectedAt = this.connectedAt ?? this.controlConnectedAt;
        if (this.closePromise !== undefined && connectedAt !== undefined) {
            return { state: 'closing', connectedAt };
        }
        if (this.connectPromise !== undefined && this.connectedAt === undefined)
            return { state: 'connecting' };
        if (this.controlRequested && this.controlConnectedAt === undefined)
            return { state: 'connecting' };
        if (connectedAt !== undefined && (this.client !== undefined || this.controlConnectedAt !== undefined)) {
            if (this.activeLeases > 0) {
                return {
                    state: 'connected-active',
                    connectedAt,
                    activeLeases: this.activeLeases,
                    transport: this.currentTransport(),
                };
            }
            if (this.reclaimAt !== undefined) {
                return {
                    state: 'connected-idle',
                    connectedAt,
                    reclaimAt: this.reclaimAt,
                    transport: this.currentTransport(),
                };
            }
        }
        return { state: 'disconnected' };
    }
    /**
     * Establish or reuse the connection, then retain it as idle.
     * @param signal - cancellation while awaiting shared connection setup.
     */
    async connect(signal) {
        if (await this.refreshControlMaster(signal))
            return;
        if (this.client !== undefined && this.connectedAt !== undefined) {
            await this.withLease(signal, async () => { });
            return;
        }
        if (this.controlRequested) {
            throw new RemoteHostError(`remote host "${this.summary.id}" is waiting for the native terminal login to create its control socket`, 'AUTH_INTERACTIVE_REQUIRED');
        }
        if (this.preferControlMaster()) {
            await this.initiateControlMasterLogin();
            throw new RemoteHostError(`remote host "${this.summary.id}" uses the OpenSSH ControlMaster path by default; complete the one-time login in the opened terminal, then reconnect`, 'AUTH_INTERACTIVE_REQUIRED');
        }
        const resolvedPassword = this.authPassword === undefined
            ? await this.options.resolvePassword?.()
            : undefined;
        if (resolvedPassword !== undefined)
            this.authPassword = resolvedPassword;
        try {
            await this.withLease(signal, async () => { });
        }
        finally {
            if (resolvedPassword !== undefined)
                this.authPassword = undefined;
        }
    }
    /** Authenticate with an optional password and answer keyboard-interactive MFA prompts. */
    async authenticate(request, onPrompt) {
        if (await this.refreshControlMaster(request.signal))
            return;
        if (this.controlRequested) {
            throw new RemoteHostError(`remote host "${this.summary.id}" is waiting for the native terminal login to create its control socket`, 'AUTH_INTERACTIVE_REQUIRED');
        }
        // Align this entry point with connect(): when the configured default is the
        // provider-owned OpenSSH ControlMaster, the in-process ssh2 client cannot
        // carry server-driven interactive MFA, because browser-delivered answers
        // travel over a polled Remote path (see the native-terminal Agent Note),
        // which races the server's prompt timing. Hand the one-time login to the
        // native terminal instead of falling back to ssh2.
        if (this.preferControlMaster()) {
            await this.initiateControlMasterLogin();
            throw new RemoteHostError(`remote host "${this.summary.id}" uses the OpenSSH ControlMaster path by default; complete the one-time login in the opened terminal, then reconnect`, 'AUTH_INTERACTIVE_REQUIRED');
        }
        this.authPassword = request.password ?? await this.options.resolvePassword?.();
        this.authPrompt = onPrompt;
        this.connectionDurationMs = request.connectionDurationMs;
        try {
            await this.withLease(request.signal, async () => { });
            if (request.persistPassword && request.password !== undefined)
                await this.options.savePassword?.(request.password);
        }
        finally {
            this.authPrompt = undefined;
            this.authPassword = undefined;
        }
    }
    /** Open a native terminal that can create or reuse the provider-owned control socket. */
    async openTerminal() {
        const target = this.controlTarget();
        if (target === undefined) {
            await this.launchTerminal(undefined);
            return;
        }
        const active = await this.refreshControlMaster();
        if (!active)
            this.beginControlRequest(target);
        try {
            await this.launchTerminal(active ? 'reuse' : 'create');
        }
        catch (error) {
            if (!active)
                this.controlRequested = false;
            throw error;
        }
    }
    /** Persist and apply the host key captured by the last failed handshake. */
    async trustHostKey() {
        this.assertAvailable();
        const pending = this.pendingHostKeySha256;
        if (pending === undefined) {
            throw new RemoteHostError(`remote host "${this.summary.id}" has no pending host key`, 'HOST_KEY_UNTRUSTED');
        }
        await this.options.onHostKeyTrust?.(pending);
        this.trustedHostKeySha256 = pending;
        this.pendingHostKeySha256 = undefined;
        this.clearFailure();
    }
    /**
     * Remove this configured host through the provider-installed hook.
     *
     * The provider owns the durable write and this backend's own unpublish, so
     * the method only delegates; a target built without the hook cannot be
     * removed.
     * @throws {RemoteHostError} `REMOVE_UNSUPPORTED` when no removal hook is installed.
     */
    async remove() {
        const remove = this.options.remove;
        if (remove === undefined) {
            throw new RemoteHostError(`remote host "${this.summary.id}" cannot be removed by its provider`, 'REMOVE_UNSUPPORTED');
        }
        await remove();
    }
    /**
     * Close an idle connection and await socket closure.
     * @param reason - diagnostics-only caller reason; never sent to the remote host.
     */
    async disconnect(reason) {
        void reason;
        if (this.activeLeases > 0) {
            throw new RemoteHostError(`remote host "${this.summary.id}" has active operations`, 'HOST_BUSY');
        }
        this.disconnecting = true;
        try {
            await this.closeControlMaster();
            await this.closeConnection();
            this.clearFailure();
        }
        finally {
            this.disconnecting = false;
        }
    }
    /**
     * Collect independent POSIX facts through one bounded foreground command.
     * @param signal - caller cancellation.
     * @returns partial facts and the complete probe latency.
     */
    async inspect(signal) {
        const startedAt = Date.now();
        const result = await this.run(this.resolve({
            hostId: this.summary.id,
            command: INSPECTION_SCRIPT,
            ...signal !== undefined ? { signal } : {},
        }));
        const observedAt = Date.now();
        return parseRemoteHostFacts(this.summary.id, result.stdout.text, observedAt, observedAt - startedAt);
    }
    /**
     * Apply this provider's command deadline and output cap.
     * @param request - raw service request.
     * @returns a complete specification that cannot exceed provider limits.
     */
    resolve(request) {
        const requested = request.timeoutMs ?? this.options.limits.commandTimeoutMs;
        if (!Number.isFinite(requested) || requested <= 0) {
            throw new Error('remote-host-ssh: timeoutMs must be a positive finite number');
        }
        return {
            ...request,
            timeoutMs: Math.min(requested, this.options.limits.commandTimeoutMs),
            maxOutputBytes: this.options.limits.maxOutputBytes,
        };
    }
    /**
     * Execute a resolved POSIX command through a leased SSH channel.
     * @param spec - result of {@link resolve} for this configured host.
     * @returns bounded stream text and independent completion flags.
     */
    async run(spec) {
        if (spec.hostId !== this.summary.id)
            throw new Error('remote-host-ssh: run spec targets a different host');
        const controlActive = await this.refreshControlMaster(spec.signal);
        if (controlActive) {
            const operation = this.withControlLease(spec.signal, async () => await this.executeThroughControlMaster(spec));
            this.commands.add(operation);
            try {
                return await operation;
            }
            finally {
                this.commands.delete(operation);
            }
        }
        if (this.controlRequested) {
            throw new RemoteHostError(`remote host "${this.summary.id}" is waiting for the native terminal login to create its control socket`, 'AUTH_INTERACTIVE_REQUIRED');
        }
        const operation = this.withLease(spec.signal, async (client) => await this.execute(client, spec));
        this.commands.add(operation);
        try {
            return await operation;
        }
        finally {
            this.commands.delete(operation);
        }
    }
    /**
     * Transfer one single file over the provider's current connection path.
     * @param direction - upload or download.
     * @param request - resolved target paths, overwrite choice, and caller cancellation.
     * @returns transferred size, resolved paths, carrying transport, and duration.
     */
    async transfer(direction, request) {
        if (request.hostId !== this.summary.id)
            throw new Error('remote-host-ssh: transfer request targets a different host');
        assertTransferPaths(request);
        const timeoutMs = this.transferTimeoutMs(request);
        const startedAt = Date.now();
        const controlActive = await this.refreshControlMaster(request.signal);
        if (controlActive) {
            const operation = this.withControlLease(request.signal, async () => await this.transferThroughControlMaster(direction, request, timeoutMs, startedAt));
            this.commands.add(operation);
            try {
                return await operation;
            }
            finally {
                this.commands.delete(operation);
            }
        }
        if (this.controlRequested) {
            throw new RemoteHostError(`remote host "${this.summary.id}" is waiting for the native terminal login to create its control socket`, 'AUTH_INTERACTIVE_REQUIRED');
        }
        const operation = this.withLease(request.signal, async (client) => await this.transferThroughSftp(client, direction, request, timeoutMs));
        this.commands.add(operation);
        try {
            return await operation;
        }
        finally {
            this.commands.delete(operation);
        }
    }
    /** Reject new work and idempotently await all channels and the shared connection. */
    async dispose() {
        this.disposePromise ??= this.disposeOnce();
        await this.disposePromise;
    }
    async disposeOnce() {
        this.disposing = true;
        this.cancelIdleTimer();
        await this.closeControlMaster();
        await this.closeConnection();
        const results = await Promise.allSettled([...this.commands]);
        this.disposed = true;
        const failures = results
            .filter((result) => result.status === 'rejected')
            .map(result => result.reason);
        if (failures.length > 0)
            throw new AggregateError(failures, `failed to quiesce remote host "${this.summary.id}"`);
    }
    assertAvailable() {
        if (this.disposing || this.disposed) {
            throw new RemoteHostError(`remote host "${this.summary.id}" provider is disposing`, 'SERVICE_DISPOSING');
        }
        if (this.disconnecting)
            throw new RemoteHostError(`remote host "${this.summary.id}" is disconnecting`, 'HOST_BUSY');
    }
    async withLease(signal, body) {
        this.assertAvailable();
        this.cancelIdleTimer();
        const client = await waitWithAbort(this.ensureConnected(), signal);
        this.assertAvailable();
        this.cancelIdleTimer();
        this.activeLeases += 1;
        try {
            return await body(client);
        }
        finally {
            this.activeLeases -= 1;
            if (!this.disposing && this.activeLeases === 0 && this.client === client)
                this.scheduleIdleTimer();
        }
    }
    async withControlLease(signal, body) {
        this.assertAvailable();
        this.cancelIdleTimer();
        const active = await this.refreshControlMaster(signal);
        if (!active)
            throw new RemoteHostError(`remote host "${this.summary.id}" control socket is not active`, 'AUTH_INTERACTIVE_REQUIRED');
        this.activeLeases += 1;
        try {
            return await body();
        }
        finally {
            this.activeLeases -= 1;
            if (!this.disposing && this.activeLeases === 0 && this.controlConnectedAt !== undefined)
                this.scheduleIdleTimer();
        }
    }
    /**
     * Confirm or clear the provider-owned control master.
     * @param signal - cancellation for the liveness probe.
     * @param options - set `preservePendingLogin` only for a passive peek, which
     *   must not turn a slow first check into a dead socket (see below).
     * @returns true when the control master is live.
     */
    async refreshControlMaster(signal, options) {
        const target = this.controlTarget();
        if (target === undefined)
            return false;
        // Only a client whose socket Windows can stat may short-circuit on a
        // missing entry; a WSL client's socket is invisible here, so its liveness
        // is decided solely by the `ssh -O check` probe below.
        if (sshClientHasSyncLiveness(this.sshClient) && !controlSocketExists(target.controlPath)) {
            if (this.controlConnectedAt !== undefined)
                this.clearControlMasterState();
            return false;
        }
        const active = await isControlMasterActive(target, this.controlProbeRunner, signal ?? AbortSignal.timeout(this.options.limits.connectTimeoutMs));
        if (!active) {
            const pendingLogin = this.controlRequested && this.controlConnectedAt === undefined;
            // A passive peek that finds no master yet must not consume the pending
            // interactive login: the operator may still be at the password prompt,
            // and a slow first check must read as "not yet observed", not as a dead
            // socket. A master that WAS observed and has since died is still cleared
            // (pendingLogin is then false), so the transport cannot stay pinned to a
            // dead socket. Only the passive snapshot probe asks for this
            // preservation; every user- or operation-initiated refresh (connect,
            // authenticate, openTerminal, run, transfer, and the `-O exit` close
            // path) keeps clearing the state as before.
            if (!(options?.preservePendingLogin === true && pendingLogin)) {
                this.clearControlMasterState();
                if (sshClientHasSyncLiveness(this.sshClient))
                    removeControlSocket(target.controlPath);
            }
            return false;
        }
        if (this.controlConnectedAt === undefined) {
            this.controlConnectedAt = Date.now();
            this.clearFailure();
        }
        this.cancelIdleTimer();
        if (this.activeLeases === 0)
            this.scheduleIdleTimer();
        return true;
    }
    /** Accept the provider-owned socket path and mark the pending interactive login. */
    beginControlRequest(target) {
        // The native client's socket needs a pre-created parent directory and a
        // cleared stale entry. The WSL client's path is flat in the Linux user's
        // home, so there is no directory to create, and OpenSSH's muxserver_listen
        // unlinks a stale control path before binding anyway; liveness across the
        // boundary is decided only by `ssh -O check`.
        if (sshClientHasSyncLiveness(this.sshClient)) {
            ensureControlSocketDirectory(target.controlPath);
            removeControlSocket(target.controlPath);
        }
        this.controlRequested = true;
        this.clearFailure();
    }
    /**
     * Start the one-time OpenSSH login that creates the provider-owned master.
     *
     * The OpenSSH client owns password and MFA entry, so the provider cannot
     * complete this login unattended; it only removes the need for the operator
     * to discover the terminal action first.
     */
    async initiateControlMasterLogin() {
        const target = this.controlTarget();
        /* v8 ignore next -- preferControlMaster() gates this call on a configured control path, so controlTarget() is never undefined here. */
        if (target === undefined)
            return;
        this.beginControlRequest(target);
        try {
            await this.launchTerminal('create');
        }
        catch (error) {
            // A refused terminal launch must not wedge the host: clear the pending
            // login exactly like openTerminal() does, otherwise every later
            // connect()/authenticate() reports "waiting for the native terminal
            // login" even though no terminal ever opened.
            this.controlRequested = false;
            throw error;
        }
    }
    async launchTerminal(mode) {
        const open = this.options.openTerminal;
        if (open === undefined) {
            throw new RemoteHostError(`remote host "${this.summary.id}" has no native terminal launcher`, 'TERMINAL_UNAVAILABLE');
        }
        await open(mode);
    }
    clearControlMasterState() {
        this.controlConnectedAt = undefined;
        this.reclaimAt = undefined;
        this.controlRequested = false;
    }
    async ensureConnected() {
        if (this.closePromise !== undefined)
            await this.closePromise;
        if (this.client !== undefined && this.connectedAt !== undefined)
            return this.client;
        if (this.connectPromise !== undefined)
            return await this.connectPromise;
        const client = this.clientFactory();
        this.client = client;
        this.connectedAt = undefined;
        this.interactiveAuthRequired = false;
        const connecting = new Promise((resolve, reject) => {
            let ready = false;
            let settled = false;
            const rejectOnce = (error) => {
                if (settled)
                    return;
                settled = true;
                const failure = this.pendingHostKeySha256 !== undefined
                    ? new RemoteHostError(`remote host "${this.summary.id}" presented untrusted host key ${this.pendingHostKeySha256}; confirm trust before reconnecting`, 'HOST_KEY_UNTRUSTED', { cause: error })
                    : this.interactiveAuthRequired
                        ? new RemoteHostError(`remote host "${this.summary.id}" requires interactive authentication; enter the password or MFA response in the Remote hosts panel before reconnecting`, 'AUTH_INTERACTIVE_REQUIRED', { cause: error })
                        : error;
                this.recordFailure(failure);
                client.destroy();
                reject(failure);
            };
            client.on('error', (error) => {
                if (!ready)
                    rejectOnce(error);
                else if (this.client === client && this.closePromise === undefined) {
                    this.recordFailure(error);
                    client.destroy();
                }
            });
            client.once('close', () => {
                if (this.client === client)
                    this.client = undefined;
                if (!ready)
                    rejectOnce(new Error('SSH connection closed before authentication completed'));
                else if (this.closePromise === undefined && !this.disposing) {
                    this.recordFailure(new Error('SSH connection closed unexpectedly'));
                }
            });
            client.once('ready', () => {
                if (settled) {
                    client.destroy();
                    return;
                }
                ready = true;
                settled = true;
                this.connectedAt = Date.now();
                this.clearFailure();
                this.scheduleIdleTimer();
                resolve(client);
            });
            client.on('keyboard-interactive', (name, instructions, _lang, prompts, finish) => {
                const challenge = prompts.map(prompt => ({ prompt: prompt.prompt, echo: prompt.echo ?? false }));
                const automatic = new Map();
                const pending = [];
                challenge.forEach((prompt, index) => {
                    if (this.authPassword !== undefined && isPasswordPrompt(prompt))
                        automatic.set(index, this.authPassword);
                    else
                        pending.push(prompt);
                });
                const mergeResponses = (responses) => {
                    let responseIndex = 0;
                    return challenge.map((_prompt, index) => {
                        const automaticResponse = automatic.get(index);
                        if (automaticResponse !== undefined)
                            return automaticResponse;
                        return responses[responseIndex++] ?? '';
                    });
                };
                if (pending.length === 0) {
                    finish(mergeResponses([]));
                    return;
                }
                const callback = this.authPrompt;
                if (callback === undefined) {
                    this.interactiveAuthRequired = true;
                    finish([]);
                    return;
                }
                void callback({
                    name,
                    instructions,
                    prompts: pending,
                }).then(responses => finish(mergeResponses(responses)), () => finish([]));
            });
            try {
                client.connect(this.connectConfig());
            }
            catch (error) {
                rejectOnce(error instanceof Error ? error : new Error(String(error)));
            }
        });
        this.connectPromise = connecting;
        try {
            return await connecting;
        }
        finally {
            /* v8 ignore next -- only this frame assigns connectPromise; a concurrent ensureConnected awaits it instead. */
            if (this.connectPromise === connecting)
                this.connectPromise = undefined;
        }
    }
    connectConfig() {
        const expectedHash = this.trustedHostKeySha256;
        const username = this.summary.user;
        /* v8 ignore next -- the constructor rejects an empty user, so summary.user is always defined by the time connectConfig() runs. */
        if (username === undefined)
            throw new Error('remote-host-ssh: configured SSH user is unavailable');
        return {
            host: this.summary.hostname,
            port: this.summary.port,
            username,
            hostHash: 'sha256',
            hostVerifier: (candidate) => {
                const normalized = candidate.toLowerCase();
                if (expectedHash !== undefined && normalized === expectedHash)
                    return true;
                this.pendingHostKeySha256 = normalized;
                return false;
            },
            readyTimeout: this.options.limits.connectTimeoutMs,
            keepaliveInterval: this.options.limits.keepaliveIntervalMs,
            keepaliveCountMax: this.options.limits.keepaliveCountMax,
            tryKeyboard: true,
            authHandler: this.options.agentSocket === undefined
                ? (this.options.privateKey === undefined ? ['password', 'keyboard-interactive'] : ['publickey', 'password', 'keyboard-interactive'])
                : ['agent', 'keyboard-interactive'],
            ...this.options.agentSocket !== undefined ? { agent: this.options.agentSocket } : {},
            ...this.authPassword !== undefined ? { password: this.authPassword } : {},
            ...this.options.privateKey !== undefined ? { privateKey: this.options.privateKey } : {},
        };
    }
    scheduleIdleTimer() {
        const connected = (this.client !== undefined && this.connectedAt !== undefined) || this.controlConnectedAt !== undefined;
        if (!connected || this.activeLeases > 0 || this.disposing)
            return;
        this.cancelIdleTimer();
        const idleDisconnectMs = this.connectionDurationMs ?? this.options.limits.idleDisconnectMs;
        this.reclaimAt = Date.now() + idleDisconnectMs;
        this.idleTimer = setTimeout(() => {
            this.idleTimer = undefined;
            this.reclaimAt = undefined;
            void this.closeManagedConnections().catch((error) => {
                this.recordFailure(error instanceof Error ? error : new Error(String(error)));
            });
        }, idleDisconnectMs);
        this.idleTimer.unref();
    }
    cancelIdleTimer() {
        if (this.idleTimer !== undefined)
            clearTimeout(this.idleTimer);
        this.idleTimer = undefined;
        this.reclaimAt = undefined;
    }
    async closeConnection() {
        if (this.closePromise !== undefined) {
            await this.closePromise;
            return;
        }
        this.cancelIdleTimer();
        const client = this.client;
        if (client === undefined) {
            this.connectedAt = undefined;
            return;
        }
        const closing = new Promise((resolve) => {
            const escalation = setTimeout(() => { client.destroy(); }, this.options.limits.disconnectTimeoutMs);
            escalation.unref();
            client.once('close', () => {
                clearTimeout(escalation);
                resolve();
            });
            try {
                client.end();
            }
            catch {
                // Only the synchronous end request is swallowed; destroy still owns socket closure.
                client.destroy();
            }
        });
        this.closePromise = closing;
        try {
            await closing;
        }
        finally {
            if (this.client === client)
                this.client = undefined;
            this.connectedAt = undefined;
            /* v8 ignore next -- only this frame assigns closePromise; a re-entrant closeConnection awaits it instead. */
            if (this.closePromise === closing)
                this.closePromise = undefined;
        }
    }
    async closeManagedConnections() {
        await this.closeControlMaster();
        await this.closeConnection();
    }
    async closeControlMaster() {
        const target = this.controlTarget();
        if (target === undefined)
            return;
        this.cancelIdleTimer();
        const syncLiveness = sshClientHasSyncLiveness(this.sshClient);
        if (syncLiveness && !this.controlConnectedAt && !controlSocketExists(target.controlPath)) {
            this.clearControlMasterState();
            return;
        }
        try {
            await this.controlStatusRunner('ssh', sshControlExitArgs(target), AbortSignal.timeout(this.options.limits.disconnectTimeoutMs));
        }
        catch {
            // A dead master is already closed; stale entries are removed below.
        }
        finally {
            // A cross-boundary client's socket is not a Windows filesystem entry, so
            // only the native client unlinks it locally; the WSL side unlinks its own
            // stale control path on the next `ssh -M` bind.
            if (syncLiveness)
                removeControlSocket(target.controlPath);
            this.clearControlMasterState();
        }
    }
    recordFailure(error) {
        this.failedAt = Date.now();
        this.failureMessage = connectionFailure(error);
    }
    clearFailure() {
        this.failedAt = undefined;
        this.failureMessage = undefined;
    }
    async executeThroughControlMaster(spec) {
        const target = this.controlTarget();
        /* v8 ignore next -- run() only reaches this after refreshControlMaster() confirmed a control target, which cannot change afterwards. */
        if (target === undefined)
            throw new RemoteHostError(`remote host "${this.summary.id}" has no control socket`, 'AUTH_INTERACTIVE_REQUIRED');
        const env = this.controlEnvironment();
        const invocation = sshClientInvocation(this.sshClient, 'ssh', sshControlExecArgs(target));
        const result = await this.controlScriptRunner(invocation, spec.command, {
            ...spec.signal === undefined ? {} : { signal: spec.signal },
            timeoutMs: spec.timeoutMs,
            maxOutputBytes: spec.maxOutputBytes,
            ...env === undefined ? {} : { env },
        });
        return { hostId: this.summary.id, ...result };
    }
    controlEnvironment() {
        const socket = this.options.agentSocket;
        if (socket === undefined || socket.toLowerCase() === 'pageant')
            return undefined;
        return { ...process.env, SSH_AUTH_SOCK: socket };
    }
    /** Bound one transfer by the request deadline and this provider's command cap. */
    transferTimeoutMs(request) {
        const requested = request.timeoutMs ?? this.options.limits.commandTimeoutMs;
        if (!Number.isFinite(requested) || requested <= 0) {
            throw new Error('remote-host-ssh: transfer timeoutMs must be a positive finite number');
        }
        return Math.min(requested, this.options.limits.commandTimeoutMs);
    }
    /** Combine caller cancellation with one transfer deadline. */
    transferSignal(signal, timeoutMs) {
        const deadline = AbortSignal.timeout(timeoutMs);
        return signal === undefined ? deadline : AbortSignal.any([signal, deadline]);
    }
    /**
     * Run one control probe and keep a transport failure out of the caller's
     * stable code.
     *
     * Only a THROWN probe is a transport failure. A probe that returns something
     * other than a byte count says the remote target is not a readable file,
     * which stays `TRANSFER_PATH_INVALID`: that is a fact about the destination,
     * not a broken connection.
     * @param target - validated SSH and control-socket fields.
     * @param script - fixed probe script sent on stdin.
     * @param remotePath - absolute POSIX remote file path, passed by environment.
     * @param timeoutMs - probe deadline in milliseconds.
     * @param signal - caller cancellation.
     * @returns the probe's trimmed standard output.
     * @throws {RemoteHostError} `TRANSFER_FAILED` when the probe itself fails.
     */
    async controlProbe(target, script, remotePath, timeoutMs, signal) {
        try {
            return await this.runControlProbe(target, script, remotePath, timeoutMs, signal);
        }
        catch (cause) {
            throw transferCopyFailure(cause);
        }
    }
    /** Run one fixed, stdin-fed probe with the target path supplied through the environment. */
    async runControlProbe(target, script, remotePath, timeoutMs, signal) {
        const base = this.controlEnvironment() ?? process.env;
        const invocation = sshClientInvocation(this.sshClient, 'ssh', sshControlExecArgs(target));
        const result = await this.controlScriptRunner(invocation, script, {
            ...signal === undefined ? {} : { signal },
            timeoutMs,
            maxOutputBytes: CONTROL_PROBE_MAX_OUTPUT_BYTES,
            env: { ...base, [CONTROL_TRANSFER_PATH_VAR]: remotePath },
        });
        return result.stdout.text.trim();
    }
    async transferThroughControlMaster(direction, request, timeoutMs, startedAt) {
        const target = this.controlTarget();
        /* v8 ignore start -- transfer() only reaches this after refreshControlMaster() confirmed a live control target. */
        if (target === undefined) {
            throw new RemoteHostError(`remote host "${this.summary.id}" has no control socket`, 'AUTH_INTERACTIVE_REQUIRED');
        }
        /* v8 ignore stop */
        const maxTransferBytes = this.options.limits.maxTransferBytes;
        let bytes;
        if (direction === 'upload') {
            bytes = localFileBytes(request.localPath);
            assertWithinTransferLimit(bytes, maxTransferBytes);
            if (request.overwrite !== true) {
                const probe = await this.controlProbe(target, CONTROL_PATH_EXISTS_SCRIPT, request.remotePath, timeoutMs, request.signal);
                if (probe === 'present') {
                    throw new RemoteHostError(`transfer remote path "${request.remotePath}" already exists and overwrite was not requested`, 'TRANSFER_PATH_INVALID');
                }
            }
        }
        else {
            if (request.overwrite !== true && existsSync(request.localPath)) {
                throw new RemoteHostError(`transfer local path "${request.localPath}" already exists and overwrite was not requested`, 'TRANSFER_PATH_INVALID');
            }
            const reported = await this.controlProbe(target, CONTROL_FILE_BYTES_SCRIPT, request.remotePath, timeoutMs, request.signal);
            const parsed = /^\d+$/u.test(reported) ? Number.parseInt(reported, 10) : Number.NaN;
            if (!Number.isSafeInteger(parsed) || parsed < 0) {
                throw new RemoteHostError(`transfer remote path "${request.remotePath}" is not a readable file`, 'TRANSFER_PATH_INVALID');
            }
            assertWithinTransferLimit(parsed, maxTransferBytes);
            bytes = parsed;
        }
        try {
            await this.transferRunner('scp', sshControlScpArgs(target, direction, request.localPath, request.remotePath), this.transferSignal(request.signal, timeoutMs));
        }
        catch (cause) {
            // Same contract as the SFTP copy: `scp`'s own errno and stderr never
            // become the caller's stable failure code.
            throw transferCopyFailure(cause);
        }
        return transferResult(this.summary.id, direction, bytes, request, 'control-master', startedAt);
    }
    async transferThroughSftp(client, direction, request, timeoutMs) {
        let sftp;
        try {
            sftp = await this.sftpFactory(client);
        }
        catch (cause) {
            // An unusable SFTP channel is a transport failure, not a caller mistake:
            // the raw `ssh2` errno must not become the envelope's stable code.
            throw transferCopyFailure(cause);
        }
        try {
            return await runSftpTransfer(sftp, direction, request, {
                maxTransferBytes: this.options.limits.maxTransferBytes,
                timeoutMs,
                ...request.signal === undefined ? {} : { signal: request.signal },
            });
        }
        finally {
            sftp.end();
        }
    }
    async execute(client, spec) {
        const stdout = new TextRetainer({ kind: 'tail', maxBytes: spec.maxOutputBytes });
        const stderr = new TextRetainer({ kind: 'tail', maxBytes: spec.maxOutputBytes });
        let exitCode = null;
        let exitSignal = null;
        let timedOut = false;
        let aborted = false;
        return await new Promise((resolve, reject) => {
            let settled = false;
            let channel;
            const result = () => {
                const retainedStdout = stdout.finish();
                const retainedStderr = stderr.finish();
                return {
                    hostId: this.summary.id,
                    exitCode,
                    signal: exitSignal,
                    timedOut,
                    aborted,
                    stdout: { text: retainedStdout.text, truncated: retainedStdout.truncated },
                    stderr: { text: retainedStderr.text, truncated: retainedStderr.truncated },
                };
            };
            const cleanup = () => {
                clearTimeout(deadline);
                spec.signal?.removeEventListener('abort', onAbort);
            };
            const resolveOnce = () => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                resolve(result());
            };
            const rejectOnce = (error) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                reject(error);
            };
            const terminate = () => {
                if (channel === undefined) {
                    resolveOnce();
                    return;
                }
                try {
                    channel.signal('TERM');
                }
                catch {
                    // Only the best-effort SSH signal request is swallowed; channel destruction follows.
                }
                channel.destroy();
            };
            const onAbort = () => {
                aborted = true;
                terminate();
            };
            const deadline = setTimeout(() => {
                timedOut = true;
                terminate();
            }, spec.timeoutMs);
            deadline.unref();
            /* v8 ignore start -- reaching execute() means the lease already cleared this signal, so this is a no-op. */
            if (spec.signal?.aborted === true) {
                aborted = true;
                terminate();
                return;
            }
            /* v8 ignore stop */
            spec.signal?.addEventListener('abort', onAbort, { once: true });
            client.exec(POSIX_STDIN_COMMAND, (error, openedChannel) => {
                if (settled) {
                    openedChannel.destroy();
                    return;
                }
                if (error !== undefined) {
                    rejectOnce(error);
                    return;
                }
                channel = openedChannel;
                channel.on('data', (chunk) => stdout.push(chunk));
                channel.stderr.on('data', (chunk) => stderr.push(chunk));
                channel.on('exit', (code, signal) => {
                    exitCode = code;
                    exitSignal = signal ?? null;
                });
                channel.once('error', rejectOnce);
                channel.once('close', resolveOnce);
                /* v8 ignore start -- an elapsed deadline or abort always settles before this callback fires. */
                if (timedOut || aborted) {
                    terminate();
                    return;
                }
                /* v8 ignore stop */
                channel.end(spec.command);
            });
        });
    }
}
//# sourceMappingURL=provider.js.map