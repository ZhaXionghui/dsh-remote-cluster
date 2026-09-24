/** Package-owned invariant companion for the Remote hosts Client contribution. */
const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-remote-host';
/** Cordis companion plugin name. */
export const name = 'client-ui-remote-host-invariant';
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants'];
/** No runtime invariant: this package owns one workbench contribution. */
const install = () => { };
/**
 * Register the Client contribution's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map