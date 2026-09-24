/** Shell-free argv construction for opening one configured SSH target in a native terminal. */
import { openNativeTerminal, } from '@deepseek-ai/dsh-native-command';
import { NATIVE_SSH_CLIENT, sshClientInvocation, } from "./ssh-client.js";
/**
 * Build direct OpenSSH argv without including any password or MFA response.
 * @param target - validated SSH target fields used to construct the destination.
 * @returns direct OpenSSH arguments for the configured target.
 */
export function sshRemoteTerminalArgs(target) {
    const args = ['-tt'];
    if (target.controlPath !== undefined) {
        if (target.controlMasterMode !== 'reuse')
            args.push('-M');
        args.push('-S', target.controlPath);
        if (target.controlMasterMode !== 'reuse') {
            if (target.controlPersistSeconds !== undefined) {
                args.push('-o', `ControlPersist=${target.controlPersistSeconds}s`);
            }
            if (target.serverAliveIntervalSeconds !== undefined) {
                args.push('-o', `ServerAliveInterval=${target.serverAliveIntervalSeconds}`);
            }
            if (target.serverAliveCountMax !== undefined) {
                args.push('-o', `ServerAliveCountMax=${target.serverAliveCountMax}`);
            }
        }
    }
    if (target.identityFile !== undefined)
        args.push('-i', target.identityFile);
    if (target.port !== 22)
        args.push('-p', String(target.port));
    args.push(`${target.user}@${target.hostname}`);
    return args;
}
/**
 * Open a native terminal for one configured SSH target.
 * @param target - validated target summary and local authentication reference.
 * @param signal - cancellation checked before the terminal process is started.
 * @param internals - native-terminal platform and launcher seams for tests.
 * @returns after the operating system accepts the detached terminal launch.
 */
export function openSshRemoteTerminal(target, signal = new AbortController().signal, internals = {}) {
    const agentSocket = target.agentSocket !== undefined
        && target.agentSocket.toLowerCase() !== 'pageant'
        ? { SSH_AUTH_SOCK: target.agentSocket }
        : undefined;
    const invocation = sshClientInvocation(target.client ?? NATIVE_SSH_CLIENT, 'ssh', sshRemoteTerminalArgs(target));
    return openNativeTerminal({
        command: invocation.command,
        args: invocation.args,
        title: target.label,
    }, signal, {
        ...internals,
        ...agentSocket === undefined ? {} : { env: { ...internals.env, ...agentSocket } },
    });
}
//# sourceMappingURL=terminal.js.map