/** OpenSSH ControlMaster arguments and the small process bridge used by the SSH provider. */
import { spawn } from 'node:child_process';
import { lstatSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { TextRetainer } from '@deepseek-ai/dsh-output-retention';
import { assertScpRemotePath } from "./transfer.js";
import { NATIVE_SSH_CLIENT, controlMasterSupported, controlPathForHost, sshClientHasSyncLiveness, sshClientInvocation, } from "./ssh-client.js";
// The platform/client capability helpers and the control-path derivation now
// live in the dependency-free `ssh-client.ts` module so this process bridge can
// depend on it without a module cycle. Re-exported here so existing consumers
// (and the suites that import them from this module) keep one import site.
export { controlMasterSupported, controlPathForHost };
/**
 * Build the terminal argv that creates or reuses the provider-owned master.
 * @param target - validated SSH and control-socket fields.
 * @param mode - create a master or attach as a multiplexed client.
 * @returns shell-free OpenSSH argv.
 */
export function sshControlTerminalArgs(target, mode) {
    const args = ['-tt'];
    if (mode === 'create')
        args.push('-M');
    args.push('-S', target.controlPath);
    if (mode === 'create') {
        args.push('-o', `ControlPersist=${target.controlPersistSeconds}s`, '-o', `ServerAliveInterval=${target.serverAliveIntervalSeconds}`, '-o', `ServerAliveCountMax=${target.serverAliveCountMax}`);
    }
    if (target.identityFile !== undefined)
        args.push('-i', target.identityFile);
    if (target.port !== 22)
        args.push('-p', String(target.port));
    args.push(`${target.username}@${target.host}`);
    return args;
}
/**
 * Build the non-interactive status command for one control socket.
 * @param target - validated SSH and control-socket fields.
 * @returns shell-free OpenSSH argv.
 */
export function sshControlStatusArgs(target) {
    return [
        '-S', target.controlPath,
        '-O', 'check',
        '-p', String(target.port),
        `${target.username}@${target.host}`,
    ];
}
/**
 * Build the command that asks the master to exit.
 * @param target - validated SSH and control-socket fields.
 * @returns shell-free OpenSSH argv.
 */
export function sshControlExitArgs(target) {
    return [
        '-S', target.controlPath,
        '-O', 'exit',
        '-p', String(target.port),
        `${target.username}@${target.host}`,
    ];
}
/**
 * Build a stdin-backed, non-interactive command routed through the master.
 * @param target - validated SSH and control-socket fields.
 * @returns shell-free OpenSSH argv; the script is written to stdin.
 */
export function sshControlExecArgs(target) {
    const args = [
        '-T',
        '-S', target.controlPath,
        '-o', 'ControlMaster=no',
        '-o', 'BatchMode=yes',
    ];
    if (target.identityFile !== undefined)
        args.push('-i', target.identityFile);
    if (target.port !== 22)
        args.push('-p', String(target.port));
    args.push(`${target.username}@${target.host}`, 'sh -s');
    return args;
}
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
export function sshControlScpArgs(target, direction, localPath, remotePath) {
    assertScpRemotePath(remotePath);
    const args = [
        '-o', 'ControlMaster=no',
        '-o', `ControlPath=${target.controlPath}`,
        '-o', 'BatchMode=yes',
    ];
    if (target.identityFile !== undefined)
        args.push('-i', target.identityFile);
    if (target.port !== 22)
        args.push('-P', String(target.port));
    const remote = `${target.username}@${target.host}:${remotePath}`;
    args.push(...direction === 'upload' ? [localPath, remote] : [remote, localPath]);
    return args;
}
/**
 * Check whether OpenSSH left a filesystem entry for the control socket.
 *
 * Windows OpenSSH can append `=` to a control path. Both forms are checked,
 * and directories are excluded so a malformed path cannot be treated as a
 * live socket.
 * @param controlPath - configured control path.
 * @returns true when a non-directory socket entry exists.
 */
export function controlSocketExists(controlPath) {
    return [controlPath, `${controlPath}=`].some((candidate) => {
        try {
            return !lstatSync(candidate).isDirectory();
        }
        catch {
            return false;
        }
    });
}
/**
 * Prepare the parent directory for one control socket.
 * @param controlPath - configured control path.
 */
export function ensureControlSocketDirectory(controlPath) {
    mkdirSync(dirname(controlPath), { recursive: true });
}
/**
 * Remove stale socket entries without following directory links.
 * @param controlPath - configured control path.
 */
export function removeControlSocket(controlPath) {
    for (const candidate of [controlPath, `${controlPath}=`]) {
        try {
            if (!lstatSync(candidate).isDirectory())
                unlinkSync(candidate);
        }
        catch {
            // A missing or already-removed control entry is the desired outcome.
        }
    }
}
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
export async function isControlMasterActive(target, run, signal) {
    const client = target.client ?? NATIVE_SSH_CLIENT;
    if (sshClientHasSyncLiveness(client) && !controlSocketExists(target.controlPath))
        return false;
    try {
        const invocation = sshClientInvocation(client, 'ssh', sshControlStatusArgs(target));
        await run(invocation.command, invocation.args, signal);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Execute one POSIX script through an existing ControlMaster.
 * @param invocation - resolved local invocation from {@link sshClientInvocation}.
 * @param script - script written to the SSH process stdin.
 * @param options - cancellation, deadline, output cap, and child environment.
 * @returns bounded command outcome with independent timeout and abort flags.
 */
export const runControlMasterScript = (invocation, script, options) => new Promise((resolve, reject) => {
    const stdout = new TextRetainer({ kind: 'tail', maxBytes: options.maxOutputBytes });
    const stderr = new TextRetainer({ kind: 'tail', maxBytes: options.maxOutputBytes });
    let child;
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let exitCode = null;
    let exitSignal = null;
    const cleanup = () => {
        clearTimeout(deadline);
        options.signal?.removeEventListener('abort', onAbort);
    };
    const resolveOnce = () => {
        if (settled)
            return;
        settled = true;
        cleanup();
        resolve({
            exitCode,
            signal: exitSignal,
            timedOut,
            aborted,
            stdout: stdout.finish(),
            stderr: stderr.finish(),
        });
    };
    const rejectOnce = (error) => {
        if (settled)
            return;
        settled = true;
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
    };
    const terminate = () => {
        if (child.killed)
            return;
        child.kill();
    };
    const onAbort = () => {
        aborted = true;
        terminate();
    };
    const deadline = setTimeout(() => {
        timedOut = true;
        terminate();
    }, options.timeoutMs);
    deadline.unref();
    try {
        child = spawn(invocation.command, [...invocation.args], {
            env: options.env,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });
    }
    catch (error) {
        rejectOnce(error);
        return;
    }
    child.once('error', rejectOnce);
    child.stdout?.on('data', chunk => stdout.push(chunk));
    child.stderr?.on('data', chunk => stderr.push(chunk));
    child.once('close', (code, signal) => {
        exitCode = code;
        exitSignal = signal;
        resolveOnce();
    });
    if (options.signal?.aborted === true) {
        aborted = true;
        terminate();
        return;
    }
    options.signal?.addEventListener('abort', onAbort, { once: true });
    child.stdin?.end(script);
});
//# sourceMappingURL=control-master.js.map