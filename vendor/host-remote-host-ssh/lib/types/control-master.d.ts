/** OpenSSH ControlMaster arguments and the small process bridge used by the SSH provider. */
import type { NativeCommandRunner } from '@deepseek-ai/dsh-native-command';
import type { RemoteHostTransferDirection } from '@deepseek-ai/dsh-host-remote-host';
import { controlMasterSupported, controlPathForHost, type ResolvedSshClient, type SshClientInvocation } from './ssh-client.ts';
export { controlMasterSupported, controlPathForHost, type SshClientInvocation };
/** Target fields needed by a provider-owned OpenSSH control master. */
export interface SshControlMasterTarget {
    /** Configured host name used as the stable DSH session target. */
    readonly host: string;
    /** Configured SSH port. */
    readonly port: number;
    /** Configured login principal. */
    readonly username: string;
    /** Local private-key path, when the target uses a private key. */
    readonly identityFile?: string;
    /** Provider-owned control socket path. */
    readonly controlPath: string;
    /** Control master retention in seconds. */
    readonly controlPersistSeconds: number;
    /** Keepalive interval in seconds. */
    readonly serverAliveIntervalSeconds: number;
    /** Maximum unanswered keepalives. */
    readonly serverAliveCountMax: number;
    /** Local OpenSSH client that owns this transport; defaults to the native client. */
    readonly client?: ResolvedSshClient;
}
/** Bounded result from one command sent through an existing ControlMaster. */
export interface SshControlMasterCommandResult {
    /** Remote command exit code, or null when no exit code was reported. */
    readonly exitCode: number | null;
    /** Remote command signal, or null when no signal was reported. */
    readonly signal: string | null;
    /** Whether the local deadline terminated the command. */
    readonly timedOut: boolean;
    /** Whether the caller's signal terminated the command. */
    readonly aborted: boolean;
    /** Bounded standard output. */
    readonly stdout: {
        readonly text: string;
        readonly truncated: boolean;
    };
    /** Bounded standard error. */
    readonly stderr: {
        readonly text: string;
        readonly truncated: boolean;
    };
}
/** Runner seam used by provider tests for `ssh -O check` and `ssh -O exit`. */
export type SshControlMasterStatusRunner = NativeCommandRunner;
/**
 * Runner seam used by provider tests for stdin-backed ControlMaster commands.
 *
 * The resolved client's invocation (command plus any WSL prefix) is supplied by
 * the caller so this bridge never hard-codes the `ssh` executable.
 */
export type SshControlMasterScriptRunner = (invocation: SshClientInvocation, script: string, options: {
    readonly signal?: AbortSignal;
    readonly timeoutMs: number;
    readonly maxOutputBytes: number;
    readonly env?: NodeJS.ProcessEnv;
}) => Promise<SshControlMasterCommandResult>;
/**
 * Build the terminal argv that creates or reuses the provider-owned master.
 * @param target - validated SSH and control-socket fields.
 * @param mode - create a master or attach as a multiplexed client.
 * @returns shell-free OpenSSH argv.
 */
export declare function sshControlTerminalArgs(target: SshControlMasterTarget, mode: 'create' | 'reuse'): string[];
/**
 * Build the non-interactive status command for one control socket.
 * @param target - validated SSH and control-socket fields.
 * @returns shell-free OpenSSH argv.
 */
export declare function sshControlStatusArgs(target: SshControlMasterTarget): string[];
/**
 * Build the command that asks the master to exit.
 * @param target - validated SSH and control-socket fields.
 * @returns shell-free OpenSSH argv.
 */
export declare function sshControlExitArgs(target: SshControlMasterTarget): string[];
/**
 * Build a stdin-backed, non-interactive command routed through the master.
 * @param target - validated SSH and control-socket fields.
 * @returns shell-free OpenSSH argv; the script is written to stdin.
 */
export declare function sshControlExecArgs(target: SshControlMasterTarget): string[];
/**
 * Build a single-file `scp` command routed through the master's socket.
 *
 * Both endpoints travel as `scp` path operands. The local operand is an
 * ordinary local argv element, but the remote operand is only shell-free under
 * the SFTP dialect OpenSSH 9.0 and later use: older and legacy `scp` modes
 * hand it to `scp -t <path>` on the remote side, which the remote login shell
 * parses. Because the dialect is a property of the far host rather than of
 * this process, the remote path is admitted only when it carries no
 * shell-syntax, whitespace, or control character. `scp` takes its port through
 * `-P`, unlike `ssh`'s `-p`.
 * @param target - validated SSH and control-socket fields.
 * @param direction - upload copies the local file out, download copies it in.
 * @param localPath - absolute local file path.
 * @param remotePath - absolute POSIX remote file path.
 * @returns `scp` argv whose remote operand no remote shell can reinterpret.
 * @throws {RemoteHostError} `TRANSFER_PATH_INVALID` when the remote path is not
 * safe to pass unquoted.
 */
export declare function sshControlScpArgs(target: SshControlMasterTarget, direction: RemoteHostTransferDirection, localPath: string, remotePath: string): string[];
/**
 * Check whether OpenSSH left a filesystem entry for the control socket.
 *
 * Windows OpenSSH can append `=` to a control path. Both forms are checked,
 * and directories are excluded so a malformed path cannot be treated as a
 * live socket.
 * @param controlPath - configured control path.
 * @returns true when a non-directory socket entry exists.
 */
export declare function controlSocketExists(controlPath: string): boolean;
/**
 * Prepare the parent directory for one control socket.
 * @param controlPath - configured control path.
 */
export declare function ensureControlSocketDirectory(controlPath: string): void;
/**
 * Remove stale socket entries without following directory links.
 * @param controlPath - configured control path.
 */
export declare function removeControlSocket(controlPath: string): void;
/**
 * Verify an existing control socket without opening a new SSH connection.
 *
 * A native client's socket is stat-ed first (its local filesystem entry is
 * authoritative and lets a missing socket skip the probe); a WSL client's
 * socket is invisible to Windows, so its liveness is decided only by the
 * client's own `ssh -O check` exit code.
 * @param target - validated SSH and control-socket fields.
 * @param run - no-shell command runner.
 * @param signal - cancellation for the status probe.
 * @returns true when the OpenSSH master confirms it is alive.
 */
export declare function isControlMasterActive(target: SshControlMasterTarget, run: SshControlMasterStatusRunner, signal: AbortSignal): Promise<boolean>;
/**
 * Execute one POSIX script through an existing ControlMaster.
 * @param invocation - resolved local invocation from {@link sshClientInvocation}.
 * @param script - script written to the SSH process stdin.
 * @param options - cancellation, deadline, output cap, and child environment.
 * @returns bounded command outcome with independent timeout and abort flags.
 */
export declare const runControlMasterScript: SshControlMasterScriptRunner;
//# sourceMappingURL=control-master.d.ts.map