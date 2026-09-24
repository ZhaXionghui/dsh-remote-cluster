/** Package-owned invariant companion for the remote-host controller. */
const PACKAGE_NAME = '@deepseek-ai/dsh-api-remote-host-controller';
/** Cordis companion plugin name. */
export const name = 'api-remote-host-controller-invariant';
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants'];
/** No runtime invariant: the controller reads each provider-owned snapshot directly. */
const install = () => { };
/**
 * Register the controller invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map