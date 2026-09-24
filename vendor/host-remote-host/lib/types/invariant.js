/** Package-owned invariant companion for the remote-host registry. */
const PACKAGE_NAME = '@deepseek-ai/dsh-host-remote-host';
/** Cordis companion plugin name. */
export const name = 'remote-host-invariant';
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants'];
const TRANSPORTS = ['ssh2', 'control-master'];
/** Reject a connected state that does not name one owning transport. */
function assertTransport(hostId, transport, fail) {
    if (!TRANSPORTS.includes(transport)) {
        fail(`remote host "${hostId}" connected state does not name an owning transport`);
    }
}
/**
 * Install checks over the registry's authoritative published projection: every
 * lease-bearing state must name its owning transport, and an idle deadline must
 * follow the moment its connection became reachable.
 */
const install = Object.assign((ctx, fail) => {
    for (const host of ctx.remoteHosts.list()) {
        const hostId = String(host.id);
        const { connection } = host;
        if (connection.state === 'connected-active') {
            if (!Number.isSafeInteger(connection.activeLeases) || connection.activeLeases < 1) {
                fail(`remote host "${hostId}" connected-active state requires a positive lease count`);
            }
            assertTransport(hostId, connection.transport, fail);
        }
        if (connection.state === 'connected-idle') {
            if (!(connection.reclaimAt > connection.connectedAt)) {
                fail(`remote host "${hostId}" idle reclaimAt must follow connectedAt`);
            }
            assertTransport(hostId, connection.transport, fail);
        }
    }
}, { inject: ['remoteHosts'] });
/**
 * Register the remote-host invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map