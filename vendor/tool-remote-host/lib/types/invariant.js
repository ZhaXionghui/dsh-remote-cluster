/** Package-owned invariant companion for the remote-host model Consumer. */
const PACKAGE_NAME = '@deepseek-ai/dsh-tool-remote-host';
/** Cordis companion plugin name. */
export const name = 'tool-remote-host-invariant';
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants'];
/** No runtime invariant: the Consumer emits no independent durable events; tool runtime owns call records. */
const install = () => { };
/** Register this package's invariant companion. */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map