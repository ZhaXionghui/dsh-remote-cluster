import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Remote hosts workbench surface with on-demand inspection and authentication. */
import { useEffect, useRef, useState } from 'react';
import css from './RemoteHostsPanel.module.css';
const STATE_KEYS = {
    disconnected: 'stateDisconnected',
    connecting: 'stateConnecting',
    closing: 'stateClosing',
    failed: 'stateFailed',
};
function connectionLabel(host, t) {
    const connection = host.connection;
    if (connection.state === 'connected-active')
        return t('stateActive', { count: String(connection.activeLeases) });
    if (connection.state === 'connected-idle') {
        return t('stateIdle', { time: new Date(connection.reclaimAt).toLocaleTimeString() });
    }
    return t(STATE_KEYS[connection.state]);
}
/**
 * Name the connection path that currently carries a host, when one is live.
 * @param host - current safe host snapshot.
 * @returns the carrying transport, or undefined while disconnected.
 */
function transportValue(host) {
    const { connection } = host;
    if (connection.state !== 'connected-active' && connection.state !== 'connected-idle')
        return undefined;
    return connection.transport;
}
/**
 * Map a live transport to its dictionary key.
 * @param transport - carrying connection path, when a connection is established.
 * @returns the display key, or undefined when no known transport is published.
 */
function transportKey(transport) {
    if (transport !== 'ssh2' && transport !== 'control-master')
        return undefined;
    return transport === 'control-master' ? 'transportControlMaster' : 'transportSsh2';
}
function needsAuthentication(host) {
    return host.connection.state === 'disconnected' || host.connection.state === 'failed';
}
/** Remote failure code reporting that the provider handed the login to the native terminal. */
const INTERACTIVE_LOGIN_REQUIRED = 'remote-host/interactive-login-required';
/**
 * Read the stable Remote failure code from a rejected call.
 *
 * Discrimination is by `code`, never by message text: the Terminal handoff and a
 * real failure would otherwise be indistinguishable.
 * @param error - value thrown by a Remote method.
 * @returns the code when the failure carries one, otherwise undefined.
 */
function failureCode(error) {
    if (typeof error === 'object' && error !== null && typeof error.code === 'string') {
        return error.code;
    }
    return undefined;
}
function sameAuthenticationPrompt(left, right) {
    if (left.name !== right.name || left.instructions !== right.instructions || left.prompts.length !== right.prompts.length) {
        return false;
    }
    return left.prompts.every((prompt, index) => {
        const other = right.prompts[index];
        return other !== undefined && prompt.prompt === other.prompt && prompt.echo === other.echo;
    });
}
function formatBytes(value) {
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let scaled = value;
    let index = 0;
    while (scaled >= 1024 && index < units.length - 1) {
        scaled /= 1024;
        index += 1;
    }
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: index === 0 ? 0 : 1 }).format(scaled)} ${units[index]}`;
}
function factRows(facts, t) {
    const rows = [];
    if (facts.hostname !== undefined)
        rows.push([t('remoteHostname'), facts.hostname]);
    if (facts.operatingSystem !== undefined)
        rows.push([t('operatingSystem'), facts.operatingSystem]);
    if (facts.kernel !== undefined)
        rows.push([t('kernel'), facts.kernel]);
    if (facts.architecture !== undefined)
        rows.push([t('architecture'), facts.architecture]);
    if (facts.uptimeSeconds !== undefined) {
        const days = Math.floor(facts.uptimeSeconds / 86_400);
        const hours = Math.floor((facts.uptimeSeconds % 86_400) / 3_600);
        rows.push([t('uptime'), t('uptimeValue', { days: String(days), hours: String(hours) })]);
    }
    if (facts.loadAverage !== undefined)
        rows.push([t('loadAverage'), facts.loadAverage.join(' / ')]);
    if (facts.logicalCpuCount !== undefined)
        rows.push([t('logicalCpuCount'), String(facts.logicalCpuCount)]);
    if (facts.memoryTotalBytes !== undefined && facts.memoryAvailableBytes !== undefined) {
        rows.push([t('memory'), t('memoryValue', {
                available: formatBytes(facts.memoryAvailableBytes),
                total: formatBytes(facts.memoryTotalBytes),
            })]);
    }
    if (facts.rootDiskTotalBytes !== undefined && facts.rootDiskUsedBytes !== undefined) {
        rows.push([t('rootDisk'), t('diskValue', {
                used: formatBytes(facts.rootDiskUsedBytes),
                total: formatBytes(facts.rootDiskTotalBytes),
            })]);
    }
    rows.push([t('latency'), t('latencyValue', { value: String(facts.latencyMs) })]);
    rows.push([t('observedAt'), new Date(facts.observedAt).toLocaleString()]);
    return rows;
}
/** Render configured hosts and fetch basic information only when a row is opened or refreshed. */
export function RemoteHostsPanel({ list, inspect, authenticate, authenticationStatus, answerAuthentication, cancelAuthentication, openTerminal, connect, remove, t, }) {
    const [request, setRequest] = useState(0);
    const [state, setState] = useState({ status: 'loading' });
    const [expanded, setExpanded] = useState(null);
    const [facts, setFacts] = useState({});
    const [authentication, setAuthentication] = useState(null);
    const [terminal, setTerminal] = useState(null);
    const [connectingHostId, setConnectingHostId] = useState(null);
    const [armedDeleteHostId, setArmedDeleteHostId] = useState(null);
    const [deletingHostId, setDeletingHostId] = useState(null);
    const [deleteError, setDeleteError] = useState(null);
    const inspections = useRef(new Map());
    useEffect(() => () => {
        for (const controller of inspections.current.values())
            controller.abort();
        inspections.current.clear();
    }, []);
    const inspectHost = (hostId) => {
        inspections.current.get(hostId)?.abort();
        const controller = new AbortController();
        inspections.current.set(hostId, controller);
        setFacts(current => ({ ...current, [hostId]: { status: 'loading' } }));
        void Promise.resolve().then(() => inspect(hostId, controller.signal)).then((view) => {
            if (controller.signal.aborted || inspections.current.get(hostId) !== controller)
                return;
            inspections.current.delete(hostId);
            setFacts(current => ({ ...current, [hostId]: { status: 'ready', facts: view.facts } }));
            setState(current => current.status === 'ready'
                ? { status: 'ready', hosts: current.hosts.map(host => host.id === hostId ? view.host : host) }
                : current);
        }, () => {
            if (controller.signal.aborted || inspections.current.get(hostId) !== controller)
                return;
            inspections.current.delete(hostId);
            setFacts(current => ({ ...current, [hostId]: { status: 'error' } }));
        });
    };
    const refreshList = () => {
        for (const controller of inspections.current.values())
            controller.abort();
        inspections.current.clear();
        setFacts({});
        // A refresh is a fresh read: any transient terminal guidance — the row lines
        // and the identical notice inside the authentication section — must not survive it.
        setTerminal(null);
        setArmedDeleteHostId(null);
        setDeleteError(null);
        setAuthentication((current) => {
            if (current === null)
                return current;
            const { terminalError: _terminalError, ...withoutTerminalError } = current;
            return { ...withoutTerminalError, terminalOpening: false, terminalOpened: false };
        });
        setState({ status: 'loading' });
        setRequest(value => value + 1);
    };
    const beginAuthentication = (hostId) => {
        setAuthentication({
            hostId,
            password: '',
            persistPassword: false,
            connectionDurationMs: 18_000_000,
            responses: [],
        });
    };
    const connectHost = (hostId) => {
        setConnectingHostId(hostId);
        void connect(hostId).then(() => {
            setConnectingHostId(null);
            refreshList();
        }, (error) => {
            setConnectingHostId(null);
            if (failureCode(error) === INTERACTIVE_LOGIN_REQUIRED) {
                // The provider already opened the native terminal, so surface that terminal
                // guidance for this row instead of a password form that cannot succeed.
                setAuthentication(current => current?.hostId === hostId ? null : current);
                setTerminal({ hostId, opened: true });
                return;
            }
            // The provider still owns the in-process ssh2 path (for example when
            // ControlMaster is disabled), so fall back to the browser password form.
            beginAuthentication(hostId);
            setAuthentication(current => current?.hostId === hostId
                ? { ...current, error: error instanceof Error ? error.message : String(error) }
                : current);
        });
    };
    const launchTerminal = (hostId) => {
        setTerminal({ hostId, opening: true });
        setAuthentication((current) => {
            if (current?.hostId !== hostId)
                return current;
            const { terminalError: _terminalError, ...withoutTerminalError } = current;
            return { ...withoutTerminalError, terminalOpening: true, terminalOpened: false };
        });
        void openTerminal(hostId).then(() => {
            setTerminal(current => current?.hostId === hostId ? { hostId, opened: true } : current);
            setAuthentication(current => current?.hostId === hostId
                ? (() => {
                    const { terminalError: _terminalError, ...withoutTerminalError } = current;
                    return { ...withoutTerminalError, terminalOpening: false, terminalOpened: true };
                })()
                : current);
        }, (error) => {
            const message = error instanceof Error ? error.message : String(error);
            setTerminal(current => current?.hostId === hostId ? { hostId, error: message } : current);
            setAuthentication(current => current?.hostId === hostId
                ? { ...current, terminalOpening: false, terminalOpened: false, terminalError: message }
                : current);
        });
    };
    const confirmDelete = (hostId) => {
        if (armedDeleteHostId !== hostId) {
            // First click arms this row; the single armed id also disarms any other row.
            setArmedDeleteHostId(hostId);
            setDeleteError(null);
            return;
        }
        setDeletingHostId(hostId);
        setDeleteError(null);
        void remove(hostId).then(() => {
            setDeletingHostId(null);
            setArmedDeleteHostId(null);
            refreshList();
        }, (error) => {
            setDeletingHostId(null);
            setArmedDeleteHostId(null);
            setDeleteError(error instanceof Error ? error.message : String(error));
        });
    };
    const cancelDelete = () => {
        setArmedDeleteHostId(null);
        setDeleteError(null);
    };
    const submitAuthentication = () => {
        const current = authentication;
        if (current === null)
            return;
        void authenticate({
            hostId: current.hostId,
            ...(current.password.length > 0 ? { password: current.password } : {}),
            persistPassword: current.persistPassword,
            connectionDurationMs: current.connectionDurationMs,
        }).then(snapshot => setAuthentication(previous => previous === null ? null : {
            ...previous,
            snapshot,
            password: '',
            responses: snapshot.state === 'prompt' ? snapshot.prompt.prompts.map(() => '') : previous.responses,
        }), error => setAuthentication(previous => previous === null ? null : {
            ...previous,
            error: error instanceof Error ? error.message : String(error),
        }));
    };
    const submitAuthenticationResponses = () => {
        const current = authentication;
        const authId = current?.snapshot?.state === 'prompt' ? current.snapshot.id : undefined;
        if (current === null || authId === undefined)
            return;
        void answerAuthentication({ authId, responses: current.responses }).then(snapshot => setAuthentication(previous => previous === null ? null : { ...previous, snapshot, responses: [] }), error => setAuthentication(previous => previous === null ? null : {
            ...previous,
            error: error instanceof Error ? error.message : String(error),
        }));
    };
    const cancelAuthAttempt = () => {
        const authId = authentication?.snapshot?.id;
        if (authId !== undefined)
            void cancelAuthentication(authId);
        setAuthentication(null);
    };
    useEffect(() => {
        const current = authentication;
        const snapshot = current?.snapshot;
        if (snapshot === undefined || (snapshot.state !== 'pending' && snapshot.state !== 'prompt'))
            return;
        let disposed = false;
        const poll = async () => {
            try {
                const next = await authenticationStatus(snapshot.id);
                if (disposed)
                    return;
                if (next.state === 'connected') {
                    setAuthentication(null);
                    setState({ status: 'loading' });
                    setRequest(value => value + 1);
                    return;
                }
                setAuthentication((previous) => {
                    if (previous === null)
                        return null;
                    // The server repeats the same challenge while the operator types; preserve those values.
                    const promptChanged = next.state === 'prompt'
                        && (previous.snapshot?.state !== 'prompt' || !sameAuthenticationPrompt(previous.snapshot.prompt, next.prompt));
                    return {
                        ...previous,
                        snapshot: next,
                        responses: promptChanged ? next.prompt.prompts.map(() => '') : previous.responses,
                    };
                });
            }
            catch (error) {
                if (!disposed)
                    setAuthentication(previous => previous === null ? null : {
                        ...previous,
                        error: error instanceof Error ? error.message : String(error),
                    });
            }
        };
        void poll();
        const timer = setInterval(() => { void poll(); }, 300);
        return () => {
            disposed = true;
            clearInterval(timer);
        };
    }, [authentication?.snapshot?.id, authentication?.snapshot?.state, authenticationStatus]);
    useEffect(() => {
        let current = true;
        void Promise.resolve().then(() => list()).then((hosts) => {
            if (!current)
                return;
            setState({ status: 'ready', hosts });
            // The auth-poll → connected route re-lists without a full refresh, so drop
            // the terminal guidance here as soon as the host reports a live transport.
            setTerminal(existing => existing !== null
                && hosts.some(host => host.id === existing.hostId && transportValue(host) !== undefined)
                ? null
                : existing);
            if (expanded !== null && hosts.some(host => host.id === expanded))
                inspectHost(expanded);
        }, () => { if (current)
            setState({ status: 'error' }); });
        return () => { current = false; };
    }, [list, request]);
    const toggle = (hostId) => {
        if (expanded === hostId) {
            inspections.current.get(hostId)?.abort();
            inspections.current.delete(hostId);
            setExpanded(null);
            return;
        }
        setExpanded(hostId);
        if (facts[hostId] === undefined)
            inspectHost(hostId);
    };
    if (state.status === 'loading')
        return _jsx("p", { className: css.status, children: t('loading') });
    if (state.status === 'error') {
        return (_jsxs("div", { className: css.failure, role: "alert", children: [_jsx("p", { children: t('error') }), _jsx("button", { type: "button", onClick: refreshList, children: t('retry') })] }));
    }
    return (_jsxs("section", { className: css.section, "aria-labelledby": "remote-hosts-title", children: [_jsxs("header", { className: css.header, children: [_jsxs("div", { children: [_jsx("h2", { id: "remote-hosts-title", children: t('title') }), _jsx("p", { children: t('subtitle') })] }), _jsx("button", { type: "button", onClick: refreshList, children: t('refreshList') })] }), authentication !== null ? (_jsxs("section", { className: css.authentication, "aria-labelledby": "remote-host-auth-title", children: [_jsxs("div", { className: css.authenticationHeader, children: [_jsxs("div", { children: [_jsx("h3", { id: "remote-host-auth-title", children: t('authTitle') }), _jsx("p", { children: t('authHint') })] }), _jsxs("div", { className: css.authenticationActions, children: [_jsx("button", { type: "button", disabled: authentication.terminalOpening === true, onClick: () => { launchTerminal(authentication.hostId); }, children: authentication.terminalOpened === true ? t('terminalOpened') : t('openTerminal') }), _jsx("button", { type: "button", onClick: cancelAuthAttempt, children: t('cancel') })] })] }), authentication.error !== undefined ? _jsx("p", { className: css.hostFailure, role: "alert", children: authentication.error }) : null, authentication.terminalError !== undefined ? _jsx("p", { className: css.hostFailure, role: "alert", children: authentication.terminalError }) : null, authentication.terminalOpened === true ? _jsx("p", { className: css.status, children: t('terminalHint') }) : null, authentication.snapshot?.state === 'prompt' ? (_jsxs("div", { className: css.authTerminal, role: "log", "aria-live": "polite", children: [_jsx("div", { className: css.authTerminalTitle, children: authentication.snapshot.prompt.name || t('authTerminal') }), authentication.snapshot.prompt.instructions ? _jsx("p", { children: authentication.snapshot.prompt.instructions }) : null, authentication.snapshot.prompt.prompts.map((prompt, index) => (_jsxs("label", { className: css.authPrompt, children: [_jsx("span", { children: prompt.prompt }), _jsx("input", { autoFocus: index === 0, type: prompt.echo ? 'text' : 'password', value: authentication.responses[index] ?? '', onChange: event => setAuthentication(current => current === null ? null : {
                                            ...current,
                                            responses: current.responses.map((response, responseIndex) => responseIndex === index ? event.target.value : response),
                                        }) })] }, `${prompt.prompt}-${index}`))), _jsx("button", { type: "button", onClick: submitAuthenticationResponses, children: t('authSubmit') })] })) : authentication.snapshot?.state === 'pending' ? (_jsx("p", { className: css.status, children: t('authConnecting') })) : authentication.snapshot?.state === 'failed' ? (_jsxs("div", { className: css.authFailure, children: [_jsx("p", { className: css.hostFailure, children: authentication.snapshot.message || t('authFailed') }), _jsx("button", { type: "button", onClick: () => { launchTerminal(authentication.hostId); }, children: t('openTerminal') })] })) : authentication.snapshot?.state === 'cancelled' ? (_jsx("p", { className: css.status, children: t('authCancelled') })) : (_jsxs("div", { className: css.authForm, children: [_jsxs("label", { children: [_jsx("span", { children: t('password') }), _jsx("input", { type: "password", value: authentication.password, autoFocus: true, onChange: event => setAuthentication(current => current === null ? null : { ...current, password: event.target.value }) })] }), _jsxs("label", { className: css.checkbox, children: [_jsx("input", { type: "checkbox", checked: authentication.persistPassword, onChange: event => setAuthentication(current => current === null ? null : {
                                            ...current,
                                            persistPassword: event.target.checked,
                                        }) }), _jsx("span", { children: t('persistPassword') })] }), _jsxs("label", { children: [_jsx("span", { children: t('connectionDuration') }), _jsxs("select", { value: authentication.connectionDurationMs, onChange: event => setAuthentication(current => current === null ? null : {
                                            ...current,
                                            connectionDurationMs: Number(event.target.value),
                                        }), children: [_jsx("option", { value: 900_000, children: t('duration15m') }), _jsx("option", { value: 3_600_000, children: t('duration1h') }), _jsx("option", { value: 18_000_000, children: t('duration5h') })] })] }), _jsx("button", { type: "button", onClick: submitAuthentication, children: t('authConnect') })] }))] })) : null, deleteError !== null ? _jsx("p", { className: css.hostFailure, role: "alert", children: `${t('deleteError')} ${deleteError}` }) : null, state.hosts.length === 0 ? (_jsxs("div", { className: css.status, children: [_jsx("p", { children: t('empty') }), _jsx("p", { children: t('emptyHint') })] })) : (_jsx("ul", { className: css.hosts, children: state.hosts.map((host) => {
                    const open = expanded === host.id;
                    const factState = facts[host.id];
                    const rows = factState?.status === 'ready' ? factRows(factState.facts, t) : [];
                    const transport = transportValue(host);
                    const transportLabel = transportKey(transport);
                    return (_jsxs("li", { className: css.host, "data-host-id": host.id, "data-connection": host.connection.state, "data-transport": transport, children: [_jsxs("div", { className: css.hostSummary, children: [_jsxs("div", { className: css.identity, children: [_jsxs("div", { className: css.titleRow, children: [_jsx("strong", { children: host.label }), _jsx("span", { children: t(host.kind) })] }), _jsxs("code", { children: [host.user === undefined ? host.hostname : `${host.user}@${host.hostname}`, host.port === 22 ? '' : `:${host.port}`] })] }), _jsxs("div", { className: css.connectionLine, children: [_jsx("span", { className: css.connection, "data-state": host.connection.state, children: connectionLabel(host, t) }), transportLabel === undefined ? null : (_jsx("span", { className: css.transport, "data-transport": transport, children: t(transportLabel) }))] }), _jsxs("div", { className: css.hostActions, children: [_jsx("button", { type: "button", disabled: connectingHostId === host.id, "aria-expanded": needsAuthentication(host) ? undefined : open, onClick: () => {
                                                    if (needsAuthentication(host)) {
                                                        connectHost(host.id);
                                                    }
                                                    else {
                                                        toggle(host.id);
                                                    }
                                                }, children: needsAuthentication(host) ? t('connect') : open ? t('close') : t('inspect') }), _jsx("button", { type: "button", disabled: terminal?.hostId === host.id && terminal.opening === true, onClick: () => { launchTerminal(host.id); }, children: terminal?.hostId === host.id && terminal.opened === true ? t('terminalOpened') : t('openTerminal') }), _jsx("button", { type: "button", "data-danger": armedDeleteHostId === host.id, disabled: deletingHostId === host.id, onClick: () => { confirmDelete(host.id); }, children: armedDeleteHostId === host.id ? t('confirmDelete') : t('delete') }), armedDeleteHostId === host.id ? (_jsx("button", { type: "button", onClick: cancelDelete, children: t('cancel') })) : null] })] }), host.connection.state === 'failed' ? _jsx("p", { className: css.hostFailure, children: host.connection.message }) : null, terminal?.hostId === host.id && terminal.error !== undefined ? _jsx("p", { className: css.hostFailure, role: "alert", children: terminal.error }) : null, terminal?.hostId === host.id && terminal.opened === true ? _jsx("p", { className: css.status, children: t('interactiveLoginRequired') }) : null, terminal?.hostId === host.id && terminal.opened === true ? _jsx("p", { className: css.status, children: t('terminalHint') }) : null, open ? (_jsxs("div", { className: css.details, children: [_jsxs("div", { className: css.detailActions, children: [_jsxs("span", { children: [t('configuredTarget'), ": ", host.hostname, ":", host.port] }), transportLabel === undefined ? null : _jsxs("span", { children: [t('transport'), ": ", t(transportLabel)] }), _jsx("button", { type: "button", disabled: factState?.status === 'loading', onClick: () => { inspectHost(host.id); }, children: t('refreshFacts') })] }), factState === undefined || factState.status === 'loading' ? _jsx("p", { className: css.status, children: t('inspecting') }) : null, factState?.status === 'error' ? _jsx("p", { className: css.hostFailure, role: "alert", children: t('inspectError') }) : null, factState?.status === 'ready' ? (_jsx("dl", { className: css.facts, children: rows.map(([label, value]) => _jsxs("div", { children: [_jsx("dt", { children: label }), _jsx("dd", { children: value })] }, label)) })) : null] })) : null] }, host.id));
                }) }))] }));
}
//# sourceMappingURL=RemoteHostsPanel.js.map