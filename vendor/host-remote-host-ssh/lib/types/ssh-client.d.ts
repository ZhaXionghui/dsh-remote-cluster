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
/** Configured client preference exposed through provider settings. */
export type SshClientChoice = 'auto' | 'native' | 'wsl';
/** The platform's own OpenSSH client. */
export interface NativeSshClient {
    readonly kind: 'native';
}
/** The Windows WSL OpenSSH client, optionally pinned to one distribution. */
export interface WslSshClient {
    readonly kind: 'wsl';
    /** Distribution passed to `wsl -d`; omitted to use the default distribution. */
    readonly distro?: string;
}
/** A resolved local OpenSSH client that owns one multiplexed transport. */
export type ResolvedSshClient = NativeSshClient | WslSshClient;
/** The native client singleton, so callers can compare identity cheaply. */
export declare const NATIVE_SSH_CLIENT: NativeSshClient;
/**
 * Resolve the Windows `wsl.exe` launcher.
 * @param env - the environment to probe; defaults to the process environment.
 * @param platform - the platform to probe for; defaults to the process platform.
 * @returns the first existing launcher path, or `undefined` off Windows or when
 *   no launcher is installed.
 */
export declare function wslExecutablePath(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform): string | undefined;
/** Optional resolution inputs for {@link resolveSshClient}. */
export interface ResolveSshClientOptions {
    /** WSL distribution pinned via `wsl -d`; only meaningful for the WSL client. */
    readonly distro?: string;
    /** Platform to resolve for; defaults to the process platform. */
    readonly platform?: NodeJS.Platform;
    /** Environment to probe for `wsl.exe`; defaults to the process environment. */
    readonly env?: NodeJS.ProcessEnv;
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
export declare function resolveSshClient(choice: SshClientChoice | undefined, options?: ResolveSshClientOptions): ResolvedSshClient;
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
export declare function controlMasterSupported(platform?: NodeJS.Platform): boolean;
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
export declare function sshClientSupportsMultiplexing(client: ResolvedSshClient, platform?: NodeJS.Platform): boolean;
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
export declare function sshClientHasSyncLiveness(client: ResolvedSshClient): boolean;
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
export declare function controlPathForHost(hostId: string, client?: ResolvedSshClient): string;
/** One resolved local process invocation for an OpenSSH tool. */
export interface SshClientInvocation {
    /** Executable the child process is spawned from. */
    readonly command: string;
    /** Direct argv passed to the executable. */
    readonly args: readonly string[];
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
export declare function sshClientInvocation(client: ResolvedSshClient, tool: 'ssh' | 'scp', args: readonly string[]): SshClientInvocation;
//# sourceMappingURL=ssh-client.d.ts.map