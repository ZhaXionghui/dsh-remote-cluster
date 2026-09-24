//#region lib/types/invariant.js
/** Package-owned invariant companion for the SSH remote-host provider. */
const PACKAGE_NAME = "@deepseek-ai/dsh-host-remote-host-ssh";
/** Cordis companion plugin name. */
const name = "remote-host-ssh-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/** No runtime invariant: the provider publishes its lifecycle through the owning registry. */
const install = () => {};
/**
* Register the provider invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
