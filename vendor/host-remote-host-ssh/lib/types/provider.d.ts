/** SSH backend with leased `ssh2` and OpenSSH ControlMaster connection paths. */
import { type NativeCommandRunner } from '@deepseek-ai/dsh-native-command';
import { type RemoteHostAuthPrompt, type RemoteHostAuthRequest, type RemoteHostBackend, type RemoteHostConnectionSnapshot, type RemoteHostFacts, type RemoteHostRunRequest, type RemoteHostRunResult, type RemoteHostRunSpec, type RemoteHostSummary, type RemoteHostTransferDirection, type RemoteHostTransferRequest, type RemoteHostTransferResult } from '@deepseek-ai/dsh-host-remote-host';
import { Client } from 'ssh2';
import { type SshControlMasterScriptRunner } from './control-master.ts';
import { type SftpTransferClient } from './transfer.ts';
import type { SshRemoteTerminalMode } from './terminal.ts';
import { type ResolvedSshClient } from './ssh-client.ts';
/** Validated runtime limits shared by every configured SSH backend. */
export interface SshRemoteHostLimits {
    /** Delay after the last lease before the connection is reclaimed. */
    readonly idleDisconnectMs: number;
    /** Maximum SSH handshake duration. */
    readonly connectTimeoutMs: number;
    /** Grace period before graceful disconnect escalates to socket destruction. */
    readonly disconnectTimeoutMs: number;
    /** Default and maximum foreground command duration. */
    readonly commandTimeoutMs: number;
    /** Byte limit independently applied to stdout and stderr. */
    readonly maxOutputBytes: number;
    /** Maximum accepted size of one single-file transfer. */
    readonly maxTransferBytes: number;
    /** Interval between SSH keepalive requests; zero disables them. */
    readonly keepaliveIntervalMs: number;
    /** Consecutive unanswered keepalives before disconnect. */
    readonly keepaliveCountMax: number;
}
/** Fully resolved construction inputs for one configured SSH target. */
export interface SshRemoteHostBackendOptions {
    /** Safe target summary published through the service. */
    readonly summary: RemoteHostSummary;
    /** Trusted SHA-256 server host-key hash; omitted until a user confirms the pending key. */
    readonly hostKeySha256?: string;
    /** Persist a user-confirmed host-key hash in the provider configuration. */
    readonly onHostKeyTrust?: (hostKeySha256: string) => Promise<void>;
    /** Remove this host from the provider's durable configuration and release it. */
    readonly remove?: () => Promise<void>;
    /** Configured agent endpoint, mutually exclusive with `privateKey`. */
    readonly agentSocket?: string;
    /** In-memory private key loaded at plugin startup, mutually exclusive with `agentSocket`. */
    readonly privateKey?: Buffer;
    /** Resolve a previously persisted password without exposing it outside Host. */
    readonly resolvePassword?: () => Promise<string | undefined>;
    /** Persist a password only after a successful authenticated connection. */
    readonly savePassword?: (password: string) => Promise<void>;
    /** Open a user-visible native SSH terminal without passing password or MFA values. */
    readonly openTerminal?: (mode?: SshRemoteTerminalMode) => Promise<void>;
    /** Provider-owned OpenSSH control socket reused by the native terminal path. */
    readonly controlPath?: string;
    /** Resolved private-key path reused by OpenSSH control commands. */
    readonly identityFile?: string;
    /** Prefer the provider-owned ControlMaster path for a password-only target; defaults to true. */
    readonly passwordControlMaster?: boolean;
    /** Control master retention in seconds; defaults to 900. */
    readonly controlPersistSeconds?: number;
    /** Testable no-shell runner for ControlMaster status and exit requests. */
    readonly controlStatusRunner?: NativeCommandRunner;
    /** Testable stdin-backed runner for ControlMaster execution. */
    readonly controlScriptRunner?: SshControlMasterScriptRunner;
    /** Testable no-shell runner for ControlMaster `scp` transfers. */
    readonly transferRunner?: NativeCommandRunner;
    /** Testable SFTP adapter factory for `ssh2`-backed transfers. */
    readonly sftpFactory?: (client: Client) => Promise<SftpTransferClient>;
    /** Validated deployment limits. */
    readonly limits: SshRemoteHostLimits;
    /** Optional client constructor used by deterministic lifecycle tests. */
    readonly clientFactory?: () => Client;
    /** Local OpenSSH client that owns this transport; defaults to the native client. */
    readonly client?: ResolvedSshClient;
}
/** One provider-owned host and its persistent, multiplexed SSH connection paths. */
export declare class SshRemoteHostBackend implements RemoteHostBackend {
    readonly summary: RemoteHostSummary;
    private readonly options;
    private readonly clientFactory;
    private readonly sshClient;
    private readonly controlStatusRunner;
    private readonly controlProbeRunner;
    private readonly controlScriptRunner;
    private readonly transferRunner;
    private readonly sftpFactory;
    private client;
    private connectPromise;
    private closePromise;
    private connectedAt;
    private failedAt;
    private failureMessage;
    private activeLeases;
    private idleTimer;
    private reclaimAt;
    private disconnecting;
    private disposing;
    private disposed;
    private disposePromise;
    private readonly commands;
    private authPassword;
    private authPrompt;
    private connectionDurationMs;
    private interactiveAuthRequired;
    private trustedHostKeySha256;
    private pendingHostKeySha256;
    private controlRequested;
    private controlConnectedAt;
    private controlProbePending;
    /**
     * @param options - validated target, authentication material, lifecycle limits, and optional test seams.
     */
    constructor(options: SshRemoteHostBackendOptions);
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
    private clientAwareRunner;
    /**
     * Decide whether this target's default transport is the provider-owned ControlMaster.
     *
     * A target is password-only when it configures neither a private key nor an
     * agent; only then can the OpenSSH client own the interactive login, and only
     * then does `passwordControlMaster` apply.
     * @returns true when the ControlMaster path is preferred over `ssh2`.
     */
    private preferControlMaster;
    /** Resolve the ControlPersist retention for this target's provider-owned socket. */
    private controlPersistSeconds;
    private controlTarget;
    private observeControlSocket;
    /** Label the connection path that currently carries operations. */
    private currentTransport;
    /** @returns a fresh provider lifecycle snapshot without authentication data. */
    snapshot(): RemoteHostConnectionSnapshot;
    /**
     * Establish or reuse the connection, then retain it as idle.
     * @param signal - cancellation while awaiting shared connection setup.
     */
    connect(signal?: AbortSignal): Promise<void>;
    /** Authenticate with an optional password and answer keyboard-interactive MFA prompts. */
    authenticate(request: RemoteHostAuthRequest & {
        readonly signal?: AbortSignal;
    }, onPrompt: (prompt: RemoteHostAuthPrompt) => Promise<readonly string[]>): Promise<void>;
    /** Open a native terminal that can create or reuse the provider-owned control socket. */
    openTerminal(): Promise<void>;
    /** Persist and apply the host key captured by the last failed handshake. */
    trustHostKey(): Promise<void>;
    /**
     * Remove this configured host through the provider-installed hook.
     *
     * The provider owns the durable write and this backend's own unpublish, so
     * the method only delegates; a target built without the hook cannot be
     * removed.
     * @throws {RemoteHostError} `REMOVE_UNSUPPORTED` when no removal hook is installed.
     */
    remove(): Promise<void>;
    /**
     * Close an idle connection and await socket closure.
     * @param reason - diagnostics-only caller reason; never sent to the remote host.
     */
    disconnect(reason: string): Promise<void>;
    /**
     * Collect independent POSIX facts through one bounded foreground command.
     * @param signal - caller cancellation.
     * @returns partial facts and the complete probe latency.
     */
    inspect(signal?: AbortSignal): Promise<RemoteHostFacts>;
    /**
     * Apply this provider's command deadline and output cap.
     * @param request - raw service request.
     * @returns a complete specification that cannot exceed provider limits.
     */
    resolve(request: RemoteHostRunRequest): RemoteHostRunSpec;
    /**
     * Execute a resolved POSIX command through a leased SSH channel.
     * @param spec - result of {@link resolve} for this configured host.
     * @returns bounded stream text and independent completion flags.
     */
    run(spec: RemoteHostRunSpec): Promise<RemoteHostRunResult>;
    /**
     * Transfer one single file over the provider's current connection path.
     * @param direction - upload or download.
     * @param request - resolved target paths, overwrite choice, and caller cancellation.
     * @returns transferred size, resolved paths, carrying transport, and duration.
     */
    transfer(direction: RemoteHostTransferDirection, request: RemoteHostTransferRequest): Promise<RemoteHostTransferResult>;
    /** Reject new work and idempotently await all channels and the shared connection. */
    dispose(): Promise<void>;
    private disposeOnce;
    private assertAvailable;
    private withLease;
    private withControlLease;
    /**
     * Confirm or clear the provider-owned control master.
     * @param signal - cancellation for the liveness probe.
     * @param options - set `preservePendingLogin` only for a passive peek, which
     *   must not turn a slow first check into a dead socket (see below).
     * @returns true when the control master is live.
     */
    private refreshControlMaster;
    /** Accept the provider-owned socket path and mark the pending interactive login. */
    private beginControlRequest;
    /**
     * Start the one-time OpenSSH login that creates the provider-owned master.
     *
     * The OpenSSH client owns password and MFA entry, so the provider cannot
     * complete this login unattended; it only removes the need for the operator
     * to discover the terminal action first.
     */
    private initiateControlMasterLogin;
    private launchTerminal;
    private clearControlMasterState;
    private ensureConnected;
    private connectConfig;
    private scheduleIdleTimer;
    private cancelIdleTimer;
    private closeConnection;
    private closeManagedConnections;
    private closeControlMaster;
    private recordFailure;
    private clearFailure;
    private executeThroughControlMaster;
    private controlEnvironment;
    /** Bound one transfer by the request deadline and this provider's command cap. */
    private transferTimeoutMs;
    /** Combine caller cancellation with one transfer deadline. */
    private transferSignal;
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
    private controlProbe;
    /** Run one fixed, stdin-fed probe with the target path supplied through the environment. */
    private runControlProbe;
    private transferThroughControlMaster;
    private transferThroughSftp;
    private execute;
}
//# sourceMappingURL=provider.d.ts.map