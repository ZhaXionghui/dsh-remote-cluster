//#region lib/types/invariant.js
/** Package-owned invariant companion for the remote-host model Consumer. */
const PACKAGE_NAME = "@deepseek-ai/dsh-tool-remote-host";
/** Cordis companion plugin name. */
const name = "tool-remote-host-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/** No runtime invariant: the Consumer emits no independent durable events; tool runtime owns call records. */
const install = () => {};
/** Register this package's invariant companion. */
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
