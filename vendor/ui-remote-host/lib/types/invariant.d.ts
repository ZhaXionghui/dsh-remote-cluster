/** Package-owned invariant companion for the Remote hosts Client contribution. */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion plugin name. */
export declare const name = "client-ui-remote-host-invariant";
/** Service required before the companion can reserve package ownership. */
export declare const inject: string[];
/**
 * Register the Client contribution's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map