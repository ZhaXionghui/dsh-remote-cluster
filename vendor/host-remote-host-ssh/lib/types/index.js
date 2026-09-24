/** `ssh2` Service Provider for the DSH remote-host capability. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import { RemoteHostError, RemoteHostId } from '../../../host-remote-host/lib/index.js';
import { openSshRemoteTerminal } from "./terminal.js";
import { deepEqualJson } from '@deepseek-ai/dsh-util-values';
import z from '@deepseek-ai/schemastery';
import { SshRemoteHostBackend } from "./provider.js";
import { controlPathForHost, resolveSshClient, sshClientSupportsMultiplexing, } from "./ssh-client.js";
export { SshRemoteHostBackend } from "./provider.js";
export { openSshRemoteTerminal, sshRemoteTerminalArgs } from "./terminal.js";
const MAX_NODE_TIMER_DELAY_MS = 2_147_483_647;
const HOST_KEY_SHA256 = /^[0-9a-f]{64}$/u;
const SSH_CLIENT_CHOICES = ['auto', 'native', 'wsl'];
/** Cordis plugin name used by loader diagnostics. */
export const name = 'remote-host-ssh';
/** Remote-host registry required before provider registration. */
export const inject = ['remoteHosts', 'credentials', 'settings'];
const SETTINGS_NAMESPACE = 'remote-host-ssh';
const hostConfig = z.object({
    id: z.string().required(),
    label: z.string().required(),
    kind: z.union(['server', 'cluster']).default('server'),
    hostname: z.string().required(),
    port: z.number().step(1).min(1).max(65_535).default(22),
    user: z.string().required(),
    hostKeySha256: z.string().role('secret'),
    identityFile: z.string().role('secret'),
    agentSocket: z.string().role('secret'),
    passwordAuth: z.boolean().default(false),
    controlMaster: z.boolean(),
    controlPersistSeconds: z.number().step(1).min(1),
});
/** Loader schema with explicit, deployment-overridable defaults. */
export const Config = z.object({
    hosts: z.array(hostConfig).default([]),
    idleDisconnectMs: z.number().default(18_000_000),
    connectTimeoutMs: z.number().default(20_000),
    disconnectTimeoutMs: z.number().default(5_000),
    commandTimeoutMs: z.number().default(60_000),
    maxOutputBytes: z.number().default(256_000),
    maxTransferBytes: z.number().default(268_435_456),
    passwordControlMaster: z.boolean().default(true),
    controlPersistSeconds: z.number().default(900),
    keepaliveIntervalMs: z.number().default(15_000),
    keepaliveCountMax: z.number().default(3),
    sshClient: z.union(['auto', 'native', 'wsl']).default('auto'),
    wslDistro: z.string(),
});
function sameRuntimeConfig(left, right) {
    const withoutTrust = (config) => ({
        ...config,
        hosts: config.hosts.map(({ hostKeySha256: _hostKeySha256, ...host }) => host),
    });
    return deepEqualJson(withoutTrust(left), withoutTrust(right));
}
function assertNonEmpty(name, value) {
    if (value.trim().length === 0)
        throw new Error(`remote-host-ssh: ${name} must be non-empty`);
}
function assertPositiveTimer(name, value) {
    if (!Number.isFinite(value) || value <= 0 || value > MAX_NODE_TIMER_DELAY_MS) {
        throw new Error(`remote-host-ssh: ${name} must be a positive finite number no greater than ${MAX_NODE_TIMER_DELAY_MS}`);
    }
}
function assertPositiveInteger(name, value) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`remote-host-ssh: ${name} must be a positive integer`);
    }
}
function resolveAuthReference(value) {
    const normalized = value.replace(/^\\~(?=[\\/]|$)/u, '~');
    if (normalized === '~')
        return homedir();
    if (normalized.startsWith('~/') || normalized.startsWith('~\\'))
        return join(homedir(), normalized.slice(2));
    return normalized;
}
function passwordCredentialKey(hostId) {
    const digest = createHash('sha256').update(hostId).digest('hex');
    return credentialKey('remote-host-ssh', `host-${digest}`);
}
function validateHostKey(host) {
    if (host.hostKeySha256 !== undefined && !HOST_KEY_SHA256.test(host.hostKeySha256)) {
        throw new Error(`remote-host-ssh: host "${host.id}" hostKeySha256 must be a lowercase hexadecimal SHA-256 hash`);
    }
}
function validate(config) {
    assertPositiveTimer('idleDisconnectMs', config.idleDisconnectMs);
    assertPositiveTimer('connectTimeoutMs', config.connectTimeoutMs);
    assertPositiveTimer('disconnectTimeoutMs', config.disconnectTimeoutMs);
    assertPositiveTimer('commandTimeoutMs', config.commandTimeoutMs);
    if (!Number.isInteger(config.maxOutputBytes) || config.maxOutputBytes <= 0) {
        throw new Error('remote-host-ssh: maxOutputBytes must be a positive integer');
    }
    assertPositiveInteger('maxTransferBytes', config.maxTransferBytes);
    assertPositiveInteger('controlPersistSeconds', config.controlPersistSeconds);
    if (typeof config.passwordControlMaster !== 'boolean') {
        throw new Error('remote-host-ssh: passwordControlMaster must be a boolean');
    }
    if (!Number.isInteger(config.keepaliveIntervalMs) || config.keepaliveIntervalMs < 0) {
        throw new Error('remote-host-ssh: keepaliveIntervalMs must be a non-negative integer');
    }
    if (!Number.isInteger(config.keepaliveCountMax) || config.keepaliveCountMax <= 0) {
        throw new Error('remote-host-ssh: keepaliveCountMax must be a positive integer');
    }
    // Validated against the raw runtime value, widened to `unknown`: a caller that
    // bypasses the loader schema (the composition tests build plain config objects
    // with no `sshClient`) leaves the field absent, while a loader-resolved config
    // always carries the schema default `auto`. Widening keeps the guard a real
    // check rather than a tautology over the literal union.
    const sshClient = config.sshClient;
    if (sshClient !== undefined && !SSH_CLIENT_CHOICES.includes(sshClient)) {
        throw new Error('remote-host-ssh: sshClient must be one of "auto", "native", or "wsl"');
    }
    if (config.wslDistro !== undefined)
        assertNonEmpty('wslDistro', config.wslDistro);
    const ids = new Set();
    for (const host of config.hosts) {
        assertNonEmpty('host id', host.id);
        assertNonEmpty(`host "${host.id}" label`, host.label);
        assertNonEmpty(`host "${host.id}" hostname`, host.hostname);
        assertNonEmpty(`host "${host.id}" user`, host.user);
        if (ids.has(host.id))
            throw new Error(`remote-host-ssh: duplicate host id "${host.id}"`);
        ids.add(host.id);
        validateHostKey(host);
        const authSources = [
            host.identityFile !== undefined,
            host.agentSocket !== undefined,
            host.passwordAuth === true,
        ].filter(Boolean).length;
        if (authSources !== 1) {
            throw new Error(`remote-host-ssh: host "${host.id}" must configure exactly one of identityFile, agentSocket, or passwordAuth`);
        }
        if (host.identityFile !== undefined)
            assertNonEmpty(`host "${host.id}" identityFile`, host.identityFile);
        if (host.agentSocket !== undefined)
            assertNonEmpty(`host "${host.id}" agentSocket`, host.agentSocket);
        if (host.controlMaster !== undefined && typeof host.controlMaster !== 'boolean') {
            throw new Error(`remote-host-ssh: host "${host.id}" controlMaster must be a boolean`);
        }
        if (host.controlPersistSeconds !== undefined) {
            assertPositiveInteger(`host "${host.id}" controlPersistSeconds`, host.controlPersistSeconds);
        }
    }
}
/**
 * Validate the complete inventory, load private keys, and register one backend per host.
 * @param ctx - Cordis context carrying the remote-host registry.
 * @param config - loader-populated provider configuration.
 */
export function apply(ctx, config) {
    let current = () => config;
    let activeConfig;
    let activeDisposers = [];
    let reconcileTail = Promise.resolve();
    let settingsScope;
    let persistHostKey = async () => { };
    // Declared before the initial publish below: buildBackends() captures this
    // binding, so the removal closure must reference an already-initialized `let`
    // rather than the later `writer` const (a temporal-dead-zone hazard).
    let removeConfiguredHost = async () => {
        throw new Error('remote-host-ssh: conversational host removal requires a writable settings provider');
    };
    const limitsOf = (resolved) => ({
        idleDisconnectMs: resolved.idleDisconnectMs,
        connectTimeoutMs: resolved.connectTimeoutMs,
        disconnectTimeoutMs: resolved.disconnectTimeoutMs,
        commandTimeoutMs: resolved.commandTimeoutMs,
        maxOutputBytes: resolved.maxOutputBytes,
        maxTransferBytes: resolved.maxTransferBytes,
        keepaliveIntervalMs: resolved.keepaliveIntervalMs,
        keepaliveCountMax: resolved.keepaliveCountMax,
    });
    const buildBackends = (resolved) => {
        validate(resolved);
        const limits = limitsOf(resolved);
        // Resolve the local client ONCE: the multiplexing decision now follows the
        // chosen client rather than the platform, and an explicit `wsl` request
        // fails here — before any backend registers — when it cannot be honored.
        const client = resolveSshClient(resolved.sshClient, resolved.wslDistro === undefined ? {} : { distro: resolved.wslDistro });
        return resolved.hosts.map((host) => {
            const identityFile = host.identityFile === undefined ? undefined : resolveAuthReference(host.identityFile);
            // A client without multiplexing (Win32-OpenSSH) cannot own a control
            // socket, so never hand one to the provider or the native terminal for
            // that client; a password-only host then keeps its ssh2 transport. The
            // WSL client CAN multiplex on Windows, so it keeps its ControlMaster.
            const controlPath = sshClientSupportsMultiplexing(client) ? controlPathForHost(host.id, client) : undefined;
            const controlPersistSeconds = host.controlPersistSeconds ?? resolved.controlPersistSeconds;
            return new SshRemoteHostBackend({
                summary: {
                    id: RemoteHostId(host.id),
                    label: host.label,
                    kind: host.kind ?? 'server',
                    hostname: host.hostname,
                    port: host.port ?? 22,
                    user: host.user,
                },
                ...host.hostKeySha256 !== undefined ? { hostKeySha256: host.hostKeySha256 } : {},
                onHostKeyTrust: hostKeySha256 => persistHostKey(host.id, hostKeySha256),
                remove: async () => { await removeConfiguredHost(host.id); },
                limits,
                ...controlPath === undefined ? {} : { controlPath },
                passwordControlMaster: host.controlMaster ?? resolved.passwordControlMaster,
                controlPersistSeconds,
                ...identityFile === undefined ? {} : { identityFile },
                client,
                openTerminal: mode => openSshRemoteTerminal({
                    label: host.label,
                    hostname: host.hostname,
                    port: host.port ?? 22,
                    user: host.user,
                    ...identityFile === undefined ? {} : { identityFile },
                    ...host.agentSocket === undefined ? {} : { agentSocket: resolveAuthReference(host.agentSocket) },
                    ...controlPath === undefined ? {} : { controlPath },
                    controlPersistSeconds,
                    serverAliveIntervalSeconds: Math.max(1, Math.ceil(limits.keepaliveIntervalMs / 1_000)),
                    serverAliveCountMax: limits.keepaliveCountMax,
                    client,
                    ...mode === undefined ? {} : { controlMasterMode: mode },
                }),
                ...identityFile === undefined ? {} : { privateKey: readFileSync(identityFile) },
                ...host.agentSocket !== undefined ? { agentSocket: resolveAuthReference(host.agentSocket) } : {},
                resolvePassword: async () => {
                    const record = await ctx.credentials.readRecord(passwordCredentialKey(host.id));
                    return record?.kind === 'api-key' ? record.key : undefined;
                },
                savePassword: async (password) => {
                    await ctx.credentials.modifyRecord(passwordCredentialKey(host.id), async () => ({ kind: 'api-key', key: password }));
                },
            });
        });
    };
    const reconcile = () => {
        reconcileTail = reconcileTail.then(async () => {
            const next = current();
            if (activeConfig !== undefined && sameRuntimeConfig(next, activeConfig))
                return;
            const candidates = buildBackends(next);
            const old = activeDisposers;
            activeDisposers = [];
            await Promise.all(old.map(dispose => dispose()));
            const registered = [];
            try {
                for (const backend of candidates)
                    registered.push(ctx.remoteHosts.register(backend));
            }
            catch (error) {
                await Promise.allSettled(registered.map(dispose => dispose()));
                throw error;
            }
            activeDisposers = registered;
            activeConfig = next;
        });
        return reconcileTail;
    };
    // Validate and publish the composition entry synchronously, preserving the
    // original fail-fast boot behavior when no settings provider is mounted.
    const initial = current();
    const initialBackends = buildBackends(initial);
    activeDisposers = initialBackends.map(backend => ctx.remoteHosts.register(backend));
    activeConfig = initial;
    const writer = {
        createHost: async (host) => {
            const settings = settingsScope;
            if (settings === undefined) {
                throw new Error('remote-host-ssh: conversational host creation requires a writable settings provider');
            }
            const resolved = current();
            if (resolved.hosts.some(candidate => candidate.id === host.id)) {
                throw new Error(`remote-host-ssh: duplicate host id "${host.id}"`);
            }
            const next = { ...resolved, hosts: [...resolved.hosts, host] };
            // Read identity files before mutating durable settings so a missing or
            // unreadable local key cannot leave an unusable row behind.
            buildBackends(next);
            await settings.update({ hosts: next.hosts });
            await reconcile();
            return {
                id: host.id,
                label: host.label,
                kind: host.kind ?? 'server',
                hostname: host.hostname,
                port: host.port ?? 22,
                user: host.user,
            };
        },
    };
    ctx.provide('remoteHostSshConfig', writer);
    const installSettings = (settingsCtx) => {
        if (settingsScope !== undefined)
            return;
        settingsScope = settingsCtx.settings.register(SETTINGS_NAMESPACE, Config, {
            base: config,
            validate: (value) => { validate(value); },
        });
        persistHostKey = async (hostId, hostKeySha256) => {
            const scope = settingsScope;
            /* v8 ignore next -- settingsScope is assigned above before this disposer exists, so the guard only re-widens the closure type. */
            if (scope === undefined)
                return;
            const currentConfig = scope.get();
            const hosts = currentConfig.hosts.map(host => host.id === hostId ? { ...host, hostKeySha256 } : host);
            await scope.update({ hosts });
        };
        removeConfiguredHost = async (hostId) => {
            const scope = settingsScope;
            /* v8 ignore next -- installSettings runs before this closure exists; the guard only re-widens the closure type. */
            if (scope === undefined)
                return;
            const resolved = scope.get();
            if (!resolved.hosts.some(host => host.id === hostId)) {
                throw new RemoteHostError(`remote host "${hostId}" is not configured`, 'HOST_NOT_FOUND');
            }
            const next = { ...resolved, hosts: resolved.hosts.filter(host => host.id !== hostId) };
            // Order matters: settings first, then reconcile (which disposes and
            // unpublishes the backend), and only then the credential delete, so the
            // removed host cannot re-save a password after its record is gone and a
            // host that might survive never loses its credential.
            await scope.update({ hosts: next.hosts });
            await reconcile();
            await ctx.credentials.deleteRecord(passwordCredentialKey(hostId));
        };
        current = () => {
            const scope = settingsScope;
            /* v8 ignore next -- current() runs only after installSettings assigned settingsScope, so the composition fallback is unreachable. */
            return scope === undefined ? config : scope.get();
        };
        void reconcile().catch((error) => {
            ctx.logger.error('remote-host-ssh: keeping the previous inventory after a settings update failed');
            ctx.logger.error(error);
        });
        settingsScope.watch(() => {
            void reconcile().catch((error) => {
                ctx.logger.error('remote-host-ssh: keeping the previous inventory after a settings update failed');
                ctx.logger.error(error);
            });
        });
    };
    if (ctx.get('settings') !== undefined)
        installSettings(ctx);
    ctx.inject(['settings'], installSettings);
}
//# sourceMappingURL=index.js.map