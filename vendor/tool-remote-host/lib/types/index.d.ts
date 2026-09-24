/** Model-facing remote host tools over the provider-neutral `ctx.remoteHosts` service. */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "tool-remote-host";
export declare const inject: string[];
/** Register the remote-host inventory, lifecycle, inspection, execution, and transfer tools. */
export declare function apply(ctx: Context): void;
/** Default Cordis plugin descriptor for Loader composition. */
declare const _default: {
    name: string;
    inject: string[];
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=index.d.ts.map