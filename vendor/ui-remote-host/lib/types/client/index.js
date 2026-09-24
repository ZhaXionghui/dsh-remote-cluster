/** Localized Remote hosts inventory and authentication surface registered in the right workbench. */
import { createElement } from 'react';
import { RemoteHostsPanel } from "./RemoteHostsPanel.js";
import { en, zh } from "./locales.js";
/** Dictionary namespace owned by this plugin. */
export const NS = 'remoteHosts';
/** Services required by the right-workbench contribution and generated Remote face. */
export const inject = ['locale', 'betterSidebar', 'remote', 'remote.remoteHosts'];
/**
 * Contribute the Remote hosts surface without owning any Host connection resource.
 * @param ctx - browser Cordis root carrying the right-workbench service and generated Remote namespaces.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-remote-host: dictionaries');
    const list = async () => {
        const result = await ctx.remote.remoteHosts.list();
        if (!result.ok)
            throw result.error;
        return result.value;
    };
    const inspect = async (hostId, signal) => {
        const result = await ctx.remote.remoteHosts.inspect(hostId, signal);
        if (!result.ok)
            throw result.error;
        return result.value;
    };
    const authenticate = async (request) => {
        const result = await ctx.remote.remoteHosts.authenticate(request);
        if (!result.ok)
            throw result.error;
        return result.value;
    };
    const authenticationStatus = async (authId) => {
        const result = await ctx.remote.remoteHosts.authenticationStatus(authId);
        if (!result.ok)
            throw result.error;
        return result.value;
    };
    const answerAuthentication = async (request) => {
        const result = await ctx.remote.remoteHosts.answerAuthentication(request);
        if (!result.ok)
            throw result.error;
        return result.value;
    };
    const cancelAuthentication = async (authId) => {
        const result = await ctx.remote.remoteHosts.cancelAuthentication(authId);
        if (!result.ok)
            throw result.error;
    };
    const openTerminal = async (hostId) => {
        const result = await ctx.remote.remoteHosts.openTerminal(hostId);
        if (!result.ok)
            throw result.error;
    };
    const connect = async (hostId, signal) => {
        const result = await ctx.remote.remoteHosts.connect(hostId, signal);
        if (!result.ok)
            throw result.error;
        return result.value;
    };
    const remove = async (hostId) => {
        const result = await ctx.remote.remoteHosts.delete(hostId);
        if (!result.ok)
            throw result.error;
    };
    const t = ctx.locale.bind(NS);
    function RemoteHostsTab(_props) {
        return createElement(RemoteHostsPanel, {
            list, inspect, authenticate, authenticationStatus, answerAuthentication, cancelAuthentication, openTerminal, connect, remove, t,
        });
    }
    ctx.effect(() => ctx.betterSidebar.registerTab({
        id: 'remote-hosts',
        title: () => t('title'),
        order: 10,
        single: true,
        component: RemoteHostsTab,
    }), 'ui-remote-host: right-workbench Tab');
    ctx.effect(() => {
        let initializedSessionId;
        const openDefaultTab = () => {
            const { sessionId } = ctx.betterSidebar.getSnapshot();
            if (sessionId === undefined || sessionId === initializedSessionId)
                return;
            initializedSessionId = sessionId;
            ctx.betterSidebar.openTab({ type: 'remote-hosts' }, { sessionId });
        };
        openDefaultTab();
        return ctx.betterSidebar.subscribeState(openDefaultTab);
    }, 'ui-remote-host: default right-workbench Tab');
}
//# sourceMappingURL=index.js.map