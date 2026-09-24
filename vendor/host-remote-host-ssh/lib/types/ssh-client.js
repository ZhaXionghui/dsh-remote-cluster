/**
 * Local OpenSSH client selection for the SSH provider.
 *
 * The provider can own its multiplexed ControlMaster through either the
 * platform's native OpenSSH client or, on Windows, a WSL client. Win32-OpenSSH
 * implements no multiplexing, so the WSL client is the only way to reuse a
 * ControlMaster on Windows while the native client stays the default wherever
 * the two are interchangeable. This module is dependency-free and
 * side-effect-free so the provider and its suites can resolve a client
 * deterministically.
 *
 * @module @deepseek-ai/dsh-host-remote-host-ssh/ssh-client
 */
import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
/** The native client singleton, so callers can compare identity cheaply. */
export const NATIVE_SSH_CLIENT = { kind: 'native' };
/**
 * Well-known Windows `wsl.exe` locations: the System32 launcher first, then
 * every PATH entry. PATH entries may carry surrounding quotes from
 * `setx`-style definitions.
 * @param env - the environment to probe.
 * @returns candidate `wsl.exe` paths in resolution order.
 */
function candidateWslPaths(env) {
    const systemRoot = env.SystemRoot ?? 'C:\\Windows';
    const candidates = [join(systemRoot, 'System32', 'wsl.exe')];
    for (const entry of (env.PATH ?? '').split(';')) {
        const trimmed = entry.trim().replace(/^"|"$/g, '');
        if (trimmed.length === 0)
            continue;
        candidates.push(join(trimmed, 'wsl.exe'));
    }
    return candidates;
}
/**
 * Whether a candidate can be spawned. lstat opens the entry itself instead of
 * following reparse points, so it sees the Store app execution alias where
 * `stat` hits the target's ACL (EACCES); Node reports that alias as a symlink
 * on current releases and as a plain file on older ones, and CreateProcess
 * resolves either shape. A real directory never matches.
 * @param candidate - absolute path to probe.
 * @returns true when the entry is a file or symlink.
 */
function executableExists(candidate) {
    try {
        const stat = lstatSync(candidate);
        return stat.isFile() || stat.isSymbolicLink();
    }
    catch {
        // ENOENT (the candidate vanished between listing and probing) is the only
        // expected failure; any other error names an unspawnable path, so false is
        // the safe answer for it too.
        return false;
    }
}
/**
 * Resolve the Windows `wsl.exe` launcher.
 * @param env - the environment to probe; defaults to the process environment.
 * @param platform - the platform to probe for; defaults to the process platform.
 * @returns the first existing launcher path, or `undefined` off Windows or when
 *   no launcher is installed.
 */
export function wslExecutablePath(env = process.env, platform = process.platform) {
    if (platform !== 'win32')
        return undefined;
    for (const candidate of candidateWslPaths(env)) {
        if (executableExists(candidate))
            return candidate;
    }
    return undefined;
}
/**
 * Resolve the configured client preference into one local OpenSSH client.
 *
 * `auto` prefers the WSL client on Windows because Win32-OpenSSH cannot
 * multiplex, and falls back to the native client wherever the WSL launcher is
 * unavailable. An explicit `wsl` request fails loudly instead of silently
 * downgrading, and the WSL client is rejected outright off Windows where it
 * cannot exist.
 * @param choice - configured preference; `undefined` behaves like `auto`.
 * @param options - platform, environment, and distribution overrides.
 * @returns the resolved client.
 * @throws {Error} when `wsl` is requested off Windows, or explicitly requested
 *   on Windows without a usable `wsl.exe`.
 */
export function resolveSshClient(choice, options = {}) {
    const resolved = choice ?? 'auto';
    const platform = options.platform ?? process.platform;
    if (platform !== 'win32') {
        if (resolved === 'wsl') {
            throw new Error('remote-host-ssh: the WSL SSH client is only available on Windows');
        }
        return NATIVE_SSH_CLIENT;
    }
    if (resolved === 'native')
        return NATIVE_SSH_CLIENT;
    const wslExecutable = wslExecutablePath(options.env ?? process.env, platform);
    if (wslExecutable === undefined) {
        if (resolved === 'wsl') {
            throw new Error('remote-host-ssh: the WSL SSH client was requested but wsl.exe is not installed');
        }
        return NATIVE_SSH_CLIENT;
    }
    return options.distro === undefined ? { kind: 'wsl' } : { kind: 'wsl', distro: options.distro };
}
/**
 * Whether this platform's OpenSSH client can own a reusable ControlMaster.
 *
 * Win32-OpenSSH implements no multiplexing: the mux client needs Unix-domain
 * socket ancillary data Windows cannot pass, so `ssh -M -S <path>` fails with
 * `getsockname failed: Not a socket` as soon as it starts and never leaves a
 * socket behind. Reporting the capability once here keeps every control path
 * out of the transport decisions instead of stripping flags from each argv
 * builder.
 * @param platform - platform to test; defaults to the running process.
 * @returns true when the local OpenSSH client can carry a master.
 */
export function controlMasterSupported(platform = process.platform) {
    return platform !== 'win32';
}
/**
 * Whether the resolved client can carry a reusable ControlMaster.
 *
 * The native client inherits its platform's capability (Win32-OpenSSH cannot
 * multiplex); a WSL client always can, which is the reason it exists.
 * @param client - the resolved local client.
 * @param platform - platform to test for the native client; defaults to the
 *   running process.
 * @returns true when the client can own a control socket.
 */
export function sshClientSupportsMultiplexing(client, platform = process.platform) {
    return client.kind === 'wsl' ? true : controlMasterSupported(platform);
}
/**
 * Whether the provider can observe this client's control socket synchronously.
 *
 * A native client's socket is an ordinary local filesystem entry, so a
 * Windows-side `lstat` is authoritative. A WSL client's socket lives in the
 * Linux filesystem across the WSL boundary, which Windows cannot stat;
 * liveness there is decided only by the client's own `ssh -O check` exit code.
 * @param client - the resolved local client.
 * @returns true when synchronous liveness checks are valid.
 */
export function sshClientHasSyncLiveness(client) {
    return client.kind === 'native';
}
/**
 * Derive a short, stable control-socket path for one configured host.
 *
 * The path is not a credential. The native client keeps it below `$DSH_HOME`
 * when available so a restart can reuse a still-live ControlPersist session,
 * and below the local user's `.dsh` directory otherwise. The WSL client keeps
 * it flat in the Linux user's home so no directory has to be created across the
 * WSL boundary — the WSL-side OpenSSH expands the leading `~` itself.
 * @param hostId - configured host identity.
 * @param client - the local client that owns the socket; defaults to native.
 * @returns the control path in the owning client's own filesystem.
 */
export function controlPathForHost(hostId, client = NATIVE_SSH_CLIENT) {
    const digest = createHash('sha256').update(hostId).digest('hex').slice(0, 24);
    if (client.kind === 'wsl')
        return `~/.dsh-control-${digest}.sock`;
    const root = process.env.DSH_HOME ?? join(homedir(), '.dsh');
    return join(root, 'remote-host', 'control', `${digest}.sock`);
}
/**
 * Build the local process invocation that runs one OpenSSH tool.
 *
 * The native client runs the tool directly, byte-for-byte as before. The WSL
 * client runs it inside `wsl.exe`, optionally pinned to a distribution, with
 * `--` separating the WSL launcher's own argv from the Linux command so no
 * distribution flag can consume one of the tool's arguments.
 * @param client - the resolved local client.
 * @param tool - the OpenSSH tool to run.
 * @param args - the tool's native argv.
 * @returns the command and argv to spawn.
 */
export function sshClientInvocation(client, tool, args) {
    if (client.kind === 'native')
        return { command: tool, args };
    const prefix = client.distro === undefined ? [] : ['-d', client.distro];
    return { command: 'wsl.exe', args: [...prefix, '--', tool, ...args] };
}
//# sourceMappingURL=ssh-client.js.map