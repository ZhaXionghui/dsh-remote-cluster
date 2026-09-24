/** Localized Remote hosts inventory and authentication surface registered in the right workbench. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type RemoteHostLocaleKey } from './locales.ts';
export type { RemoteHostsPanelInjected, RemoteHostsPanelProps } from './RemoteHostsPanel.tsx';
export type { RemoteHostLocaleKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Remote host inventory and basic-fact copy. */
        remoteHosts: RemoteHostLocaleKey;
    }
}
/** Dictionary namespace owned by this plugin. */
export declare const NS = "remoteHosts";
/** Services required by the right-workbench contribution and generated Remote face. */
export declare const inject: string[];
/**
 * Contribute the Remote hosts surface without owning any Host connection resource.
 * @param ctx - browser Cordis root carrying the right-workbench service and generated Remote namespaces.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map