/** Shell-free argv construction for opening one configured SSH target in a native terminal. */
import { RemoteHostError } from '../../host-remote-host/lib/index.js';
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
 *
 * This file is build residue: `./types/*` is absent from the package's
 * `exports` table (only `.` and `./invariant` are published) and nothing
 * imports it, so it is unreachable at runtime. The live implementation is
 * `openSshRemoteTerminal` in `lib/index.js`; this copy only has to stop
 * importing a symbol that does not exist in any published release.
 *
 * The upstream symbol this used to call — `openNativeTerminal` — was added by
 * `c36edb349f` and never released. A missing native launcher is the documented
 * optional-capability path: the service definition raises `TERMINAL_UNAVAILABLE`
 * (`vendor/host-remote-host/lib/index.js:125`), so raising the same error here
 * keeps the two copies in agreement.
 */
export function openSshRemoteTerminal() {
    throw new RemoteHostError('the vendored SSH provider has no native terminal launcher: the harness API it needs was never published', 'TERMINAL_UNAVAILABLE');
}
//# sourceMappingURL=terminal.js.map