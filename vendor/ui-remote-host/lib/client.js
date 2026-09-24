window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-remote-host",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0dsh-css:D:\Dev\deepseek-harness\packages\client\ui-remote-host\src\client\RemoteHostsPanel.module.css.mjs
		const css = ".Mi_Gbq_section{box-sizing:border-box;width:100%;max-width:900px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:20px;padding:20px 20px 28px;display:flex}.Mi_Gbq_header{justify-content:space-between;align-items:flex-start;gap:20px;display:flex}.Mi_Gbq_header h2,.Mi_Gbq_header p,.Mi_Gbq_status,.Mi_Gbq_failure p,.Mi_Gbq_hostFailure{margin:0}.Mi_Gbq_header h2{font-size:20px;line-height:28px}.Mi_Gbq_header p,.Mi_Gbq_status{color:var(--dsw-alias-label-tertiary);margin-top:4px;font-size:13px;line-height:20px}.Mi_Gbq_header button,.Mi_Gbq_failure button,.Mi_Gbq_hostSummary button,.Mi_Gbq_detailActions button{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;border-radius:7px;padding:6px 10px;font-size:12px}.Mi_Gbq_header button:focus-visible,.Mi_Gbq_failure button:focus-visible,.Mi_Gbq_hostSummary button:focus-visible,.Mi_Gbq_detailActions button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.Mi_Gbq_detailActions button:disabled{cursor:default;opacity:.55}.Mi_Gbq_failure{color:var(--dsw-alias-state-error-primary);align-items:center;gap:12px;display:flex}.Mi_Gbq_hosts{grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin:0;padding:0;list-style:none;display:grid}.Mi_Gbq_host{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;min-width:0;overflow:hidden}.Mi_Gbq_hostSummary{grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:9px 16px;padding:16px 18px;display:grid}.Mi_Gbq_identity{min-width:0}.Mi_Gbq_titleRow{align-items:center;gap:8px;display:flex}.Mi_Gbq_titleRow strong{text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;overflow:hidden}.Mi_Gbq_titleRow span{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border-radius:5px;flex:none;padding:1px 6px;font-size:11px;line-height:17px}.Mi_Gbq_identity code{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;margin-top:4px;font-size:11px;display:block;overflow:hidden}.Mi_Gbq_connectionLine{flex-wrap:wrap;grid-column:1;align-items:center;gap:8px;display:flex}.Mi_Gbq_connection{color:var(--dsw-alias-label-secondary);font-size:12px}.Mi_Gbq_connection[data-state=connected-active],.Mi_Gbq_connection[data-state=connected-idle]{color:var(--dsw-alias-state-success-primary)}.Mi_Gbq_connection[data-state=failed]{color:var(--dsw-alias-state-error-primary)}.Mi_Gbq_transport{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary);border-radius:5px;padding:1px 6px;font-size:11px;line-height:17px}.Mi_Gbq_hostActions{flex-wrap:wrap;grid-area:1/2/span 2;justify-content:flex-end;gap:6px;display:flex}.Mi_Gbq_hostActions button[data-danger=true]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}.Mi_Gbq_hostFailure{color:var(--dsw-alias-state-error-primary);padding:0 18px 14px;font-size:12px;line-height:18px}.Mi_Gbq_details{border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);padding:14px 18px 18px}.Mi_Gbq_detailActions{color:var(--dsw-alias-label-tertiary);justify-content:space-between;align-items:center;gap:12px;font-size:11px;display:flex}.Mi_Gbq_authentication{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:12px;flex-direction:column;gap:14px;padding:16px 18px 18px;display:flex}.Mi_Gbq_authenticationHeader{justify-content:space-between;align-items:flex-start;gap:16px;display:flex}.Mi_Gbq_authenticationActions{flex-wrap:wrap;justify-content:flex-end;gap:6px;display:flex}.Mi_Gbq_authenticationHeader h3,.Mi_Gbq_authenticationHeader p{margin:0}.Mi_Gbq_authenticationHeader h3{font-size:15px;line-height:22px}.Mi_Gbq_authenticationHeader p{color:var(--dsw-alias-label-tertiary);margin-top:3px;font-size:12px;line-height:18px}.Mi_Gbq_authForm{gap:11px;max-width:460px;display:grid}.Mi_Gbq_authForm label{color:var(--dsw-alias-label-secondary);gap:5px;font-size:12px;display:grid}.Mi_Gbq_authForm input[type=password],.Mi_Gbq_authForm select,.Mi_Gbq_authPrompt input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);min-width:0;color:var(--dsw-alias-label-primary);font:inherit;border-radius:7px;padding:7px 9px}.Mi_Gbq_checkbox{grid-template-columns:none;align-items:center;gap:7px!important;display:flex!important}.Mi_Gbq_checkbox input{margin:0}.Mi_Gbq_authTerminal{color:#e6edf3;background:#101418;border-radius:8px;gap:10px;padding:12px;font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;display:grid}.Mi_Gbq_authTerminalTitle{color:#8bd5ff;font-weight:600}.Mi_Gbq_authTerminal p{color:#b4c0cc;white-space:pre-wrap;margin:0}.Mi_Gbq_authPrompt{gap:4px;display:grid}.Mi_Gbq_authPrompt input{color:#f3f6f8;background:#1c252d;border-color:#42515d;font-family:inherit}.Mi_Gbq_authTerminal button{color:#e6edf3;font:inherit;cursor:pointer;background:#203846;border:1px solid #48687d;border-radius:6px;justify-self:start;padding:6px 10px}.Mi_Gbq_authFailure{flex-wrap:wrap;align-items:center;gap:10px;display:flex}.Mi_Gbq_facts{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px;margin:14px 0 0;display:grid}.Mi_Gbq_facts div{min-width:0}.Mi_Gbq_facts dt{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}.Mi_Gbq_facts dd{overflow-wrap:anywhere;margin:2px 0 0;font-size:12px;line-height:18px}@media (width<=760px){.Mi_Gbq_hosts{grid-template-columns:1fr}.Mi_Gbq_header{flex-direction:column}.Mi_Gbq_facts{grid-template-columns:1fr}}";
		const tagId = "@deepseek-ai/dsh-client-ui-remote-host/RemoteHostsPanel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-remote-host";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var RemoteHostsPanel_module_css_default = {
			"authFailure": "Mi_Gbq_authFailure",
			"authForm": "Mi_Gbq_authForm",
			"authPrompt": "Mi_Gbq_authPrompt",
			"authTerminal": "Mi_Gbq_authTerminal",
			"authTerminalTitle": "Mi_Gbq_authTerminalTitle",
			"authentication": "Mi_Gbq_authentication",
			"authenticationActions": "Mi_Gbq_authenticationActions",
			"authenticationHeader": "Mi_Gbq_authenticationHeader",
			"checkbox": "Mi_Gbq_checkbox",
			"connection": "Mi_Gbq_connection",
			"connectionLine": "Mi_Gbq_connectionLine",
			"detailActions": "Mi_Gbq_detailActions",
			"details": "Mi_Gbq_details",
			"facts": "Mi_Gbq_facts",
			"failure": "Mi_Gbq_failure",
			"header": "Mi_Gbq_header",
			"host": "Mi_Gbq_host",
			"hostActions": "Mi_Gbq_hostActions",
			"hostFailure": "Mi_Gbq_hostFailure",
			"hostSummary": "Mi_Gbq_hostSummary",
			"hosts": "Mi_Gbq_hosts",
			"identity": "Mi_Gbq_identity",
			"section": "Mi_Gbq_section",
			"status": "Mi_Gbq_status",
			"titleRow": "Mi_Gbq_titleRow",
			"transport": "Mi_Gbq_transport"
		};
		//#endregion
		//#region lib/types/client/RemoteHostsPanel.js
		/** Remote hosts workbench surface with on-demand inspection and authentication. */
		const STATE_KEYS = {
			disconnected: "stateDisconnected",
			connecting: "stateConnecting",
			closing: "stateClosing",
			failed: "stateFailed"
		};
		function connectionLabel(host, t) {
			const connection = host.connection;
			if (connection.state === "connected-active") return t("stateActive", { count: String(connection.activeLeases) });
			if (connection.state === "connected-idle") return t("stateIdle", { time: new Date(connection.reclaimAt).toLocaleTimeString() });
			return t(STATE_KEYS[connection.state]);
		}
		/**
		* Name the connection path that currently carries a host, when one is live.
		* @param host - current safe host snapshot.
		* @returns the carrying transport, or undefined while disconnected.
		*/
		function transportValue(host) {
			const { connection } = host;
			if (connection.state !== "connected-active" && connection.state !== "connected-idle") return void 0;
			return connection.transport;
		}
		/**
		* Map a live transport to its dictionary key.
		* @param transport - carrying connection path, when a connection is established.
		* @returns the display key, or undefined when no known transport is published.
		*/
		function transportKey(transport) {
			if (transport !== "ssh2" && transport !== "control-master") return void 0;
			return transport === "control-master" ? "transportControlMaster" : "transportSsh2";
		}
		function needsAuthentication(host) {
			return host.connection.state === "disconnected" || host.connection.state === "failed";
		}
		/** Remote failure code reporting that the provider handed the login to the native terminal. */
		const INTERACTIVE_LOGIN_REQUIRED = "remote-host/interactive-login-required";
		/**
		* Read the stable Remote failure code from a rejected call.
		*
		* Discrimination is by `code`, never by message text: the Terminal handoff and a
		* real failure would otherwise be indistinguishable.
		* @param error - value thrown by a Remote method.
		* @returns the code when the failure carries one, otherwise undefined.
		*/
		function failureCode(error) {
			if (typeof error === "object" && error !== null && typeof error.code === "string") return error.code;
		}
		function sameAuthenticationPrompt(left, right) {
			if (left.name !== right.name || left.instructions !== right.instructions || left.prompts.length !== right.prompts.length) return false;
			return left.prompts.every((prompt, index) => {
				const other = right.prompts[index];
				return other !== void 0 && prompt.prompt === other.prompt && prompt.echo === other.echo;
			});
		}
		function formatBytes(value) {
			const units = [
				"B",
				"KiB",
				"MiB",
				"GiB",
				"TiB"
			];
			let scaled = value;
			let index = 0;
			while (scaled >= 1024 && index < units.length - 1) {
				scaled /= 1024;
				index += 1;
			}
			return `${new Intl.NumberFormat(void 0, { maximumFractionDigits: index === 0 ? 0 : 1 }).format(scaled)} ${units[index]}`;
		}
		function factRows(facts, t) {
			const rows = [];
			if (facts.hostname !== void 0) rows.push([t("remoteHostname"), facts.hostname]);
			if (facts.operatingSystem !== void 0) rows.push([t("operatingSystem"), facts.operatingSystem]);
			if (facts.kernel !== void 0) rows.push([t("kernel"), facts.kernel]);
			if (facts.architecture !== void 0) rows.push([t("architecture"), facts.architecture]);
			if (facts.uptimeSeconds !== void 0) {
				const days = Math.floor(facts.uptimeSeconds / 86400);
				const hours = Math.floor(facts.uptimeSeconds % 86400 / 3600);
				rows.push([t("uptime"), t("uptimeValue", {
					days: String(days),
					hours: String(hours)
				})]);
			}
			if (facts.loadAverage !== void 0) rows.push([t("loadAverage"), facts.loadAverage.join(" / ")]);
			if (facts.logicalCpuCount !== void 0) rows.push([t("logicalCpuCount"), String(facts.logicalCpuCount)]);
			if (facts.memoryTotalBytes !== void 0 && facts.memoryAvailableBytes !== void 0) rows.push([t("memory"), t("memoryValue", {
				available: formatBytes(facts.memoryAvailableBytes),
				total: formatBytes(facts.memoryTotalBytes)
			})]);
			if (facts.rootDiskTotalBytes !== void 0 && facts.rootDiskUsedBytes !== void 0) rows.push([t("rootDisk"), t("diskValue", {
				used: formatBytes(facts.rootDiskUsedBytes),
				total: formatBytes(facts.rootDiskTotalBytes)
			})]);
			rows.push([t("latency"), t("latencyValue", { value: String(facts.latencyMs) })]);
			rows.push([t("observedAt"), new Date(facts.observedAt).toLocaleString()]);
			return rows;
		}
		/** Render configured hosts and fetch basic information only when a row is opened or refreshed. */
		function RemoteHostsPanel({ list, inspect, authenticate, authenticationStatus, answerAuthentication, cancelAuthentication, openTerminal, connect, remove, t }) {
			const [request, setRequest] = (0, react.useState)(0);
			const [state, setState] = (0, react.useState)({ status: "loading" });
			const [expanded, setExpanded] = (0, react.useState)(null);
			const [facts, setFacts] = (0, react.useState)({});
			const [authentication, setAuthentication] = (0, react.useState)(null);
			const [terminal, setTerminal] = (0, react.useState)(null);
			const [connectingHostId, setConnectingHostId] = (0, react.useState)(null);
			const [armedDeleteHostId, setArmedDeleteHostId] = (0, react.useState)(null);
			const [deletingHostId, setDeletingHostId] = (0, react.useState)(null);
			const [deleteError, setDeleteError] = (0, react.useState)(null);
			const inspections = (0, react.useRef)(/* @__PURE__ */ new Map());
			(0, react.useEffect)(() => () => {
				for (const controller of inspections.current.values()) controller.abort();
				inspections.current.clear();
			}, []);
			const inspectHost = (hostId) => {
				inspections.current.get(hostId)?.abort();
				const controller = new AbortController();
				inspections.current.set(hostId, controller);
				setFacts((current) => ({
					...current,
					[hostId]: { status: "loading" }
				}));
				Promise.resolve().then(() => inspect(hostId, controller.signal)).then((view) => {
					if (controller.signal.aborted || inspections.current.get(hostId) !== controller) return;
					inspections.current.delete(hostId);
					setFacts((current) => ({
						...current,
						[hostId]: {
							status: "ready",
							facts: view.facts
						}
					}));
					setState((current) => current.status === "ready" ? {
						status: "ready",
						hosts: current.hosts.map((host) => host.id === hostId ? view.host : host)
					} : current);
				}, () => {
					if (controller.signal.aborted || inspections.current.get(hostId) !== controller) return;
					inspections.current.delete(hostId);
					setFacts((current) => ({
						...current,
						[hostId]: { status: "error" }
					}));
				});
			};
			const refreshList = () => {
				for (const controller of inspections.current.values()) controller.abort();
				inspections.current.clear();
				setFacts({});
				setTerminal(null);
				setArmedDeleteHostId(null);
				setDeleteError(null);
				setAuthentication((current) => {
					if (current === null) return current;
					const { terminalError: _terminalError, ...withoutTerminalError } = current;
					return {
						...withoutTerminalError,
						terminalOpening: false,
						terminalOpened: false
					};
				});
				setState({ status: "loading" });
				setRequest((value) => value + 1);
			};
			const beginAuthentication = (hostId) => {
				setAuthentication({
					hostId,
					password: "",
					persistPassword: false,
					connectionDurationMs: 18e6,
					responses: []
				});
			};
			const connectHost = (hostId) => {
				setConnectingHostId(hostId);
				connect(hostId).then(() => {
					setConnectingHostId(null);
					refreshList();
				}, (error) => {
					setConnectingHostId(null);
					if (failureCode(error) === INTERACTIVE_LOGIN_REQUIRED) {
						setAuthentication((current) => current?.hostId === hostId ? null : current);
						setTerminal({
							hostId,
							opened: true
						});
						return;
					}
					beginAuthentication(hostId);
					setAuthentication((current) => current?.hostId === hostId ? {
						...current,
						error: error instanceof Error ? error.message : String(error)
					} : current);
				});
			};
			const launchTerminal = (hostId) => {
				setTerminal({
					hostId,
					opening: true
				});
				setAuthentication((current) => {
					if (current?.hostId !== hostId) return current;
					const { terminalError: _terminalError, ...withoutTerminalError } = current;
					return {
						...withoutTerminalError,
						terminalOpening: true,
						terminalOpened: false
					};
				});
				openTerminal(hostId).then(() => {
					setTerminal((current) => current?.hostId === hostId ? {
						hostId,
						opened: true
					} : current);
					setAuthentication((current) => current?.hostId === hostId ? (() => {
						const { terminalError: _terminalError, ...withoutTerminalError } = current;
						return {
							...withoutTerminalError,
							terminalOpening: false,
							terminalOpened: true
						};
					})() : current);
				}, (error) => {
					const message = error instanceof Error ? error.message : String(error);
					setTerminal((current) => current?.hostId === hostId ? {
						hostId,
						error: message
					} : current);
					setAuthentication((current) => current?.hostId === hostId ? {
						...current,
						terminalOpening: false,
						terminalOpened: false,
						terminalError: message
					} : current);
				});
			};
			const confirmDelete = (hostId) => {
				if (armedDeleteHostId !== hostId) {
					setArmedDeleteHostId(hostId);
					setDeleteError(null);
					return;
				}
				setDeletingHostId(hostId);
				setDeleteError(null);
				remove(hostId).then(() => {
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
				if (current === null) return;
				authenticate({
					hostId: current.hostId,
					...current.password.length > 0 ? { password: current.password } : {},
					persistPassword: current.persistPassword,
					connectionDurationMs: current.connectionDurationMs
				}).then((snapshot) => setAuthentication((previous) => previous === null ? null : {
					...previous,
					snapshot,
					password: "",
					responses: snapshot.state === "prompt" ? snapshot.prompt.prompts.map(() => "") : previous.responses
				}), (error) => setAuthentication((previous) => previous === null ? null : {
					...previous,
					error: error instanceof Error ? error.message : String(error)
				}));
			};
			const submitAuthenticationResponses = () => {
				const current = authentication;
				const authId = current?.snapshot?.state === "prompt" ? current.snapshot.id : void 0;
				if (current === null || authId === void 0) return;
				answerAuthentication({
					authId,
					responses: current.responses
				}).then((snapshot) => setAuthentication((previous) => previous === null ? null : {
					...previous,
					snapshot,
					responses: []
				}), (error) => setAuthentication((previous) => previous === null ? null : {
					...previous,
					error: error instanceof Error ? error.message : String(error)
				}));
			};
			const cancelAuthAttempt = () => {
				const authId = authentication?.snapshot?.id;
				if (authId !== void 0) cancelAuthentication(authId);
				setAuthentication(null);
			};
			(0, react.useEffect)(() => {
				const snapshot = authentication?.snapshot;
				if (snapshot === void 0 || snapshot.state !== "pending" && snapshot.state !== "prompt") return;
				let disposed = false;
				const poll = async () => {
					try {
						const next = await authenticationStatus(snapshot.id);
						if (disposed) return;
						if (next.state === "connected") {
							setAuthentication(null);
							setState({ status: "loading" });
							setRequest((value) => value + 1);
							return;
						}
						setAuthentication((previous) => {
							if (previous === null) return null;
							const promptChanged = next.state === "prompt" && (previous.snapshot?.state !== "prompt" || !sameAuthenticationPrompt(previous.snapshot.prompt, next.prompt));
							return {
								...previous,
								snapshot: next,
								responses: promptChanged ? next.prompt.prompts.map(() => "") : previous.responses
							};
						});
					} catch (error) {
						if (!disposed) setAuthentication((previous) => previous === null ? null : {
							...previous,
							error: error instanceof Error ? error.message : String(error)
						});
					}
				};
				poll();
				const timer = setInterval(() => {
					poll();
				}, 300);
				return () => {
					disposed = true;
					clearInterval(timer);
				};
			}, [
				authentication?.snapshot?.id,
				authentication?.snapshot?.state,
				authenticationStatus
			]);
			(0, react.useEffect)(() => {
				let current = true;
				Promise.resolve().then(() => list()).then((hosts) => {
					if (!current) return;
					setState({
						status: "ready",
						hosts
					});
					setTerminal((existing) => existing !== null && hosts.some((host) => host.id === existing.hostId && transportValue(host) !== void 0) ? null : existing);
					if (expanded !== null && hosts.some((host) => host.id === expanded)) inspectHost(expanded);
				}, () => {
					if (current) setState({ status: "error" });
				});
				return () => {
					current = false;
				};
			}, [list, request]);
			const toggle = (hostId) => {
				if (expanded === hostId) {
					inspections.current.get(hostId)?.abort();
					inspections.current.delete(hostId);
					setExpanded(null);
					return;
				}
				setExpanded(hostId);
				if (facts[hostId] === void 0) inspectHost(hostId);
			};
			if (state.status === "loading") return (0, react_jsx_runtime.jsx)("p", {
				className: RemoteHostsPanel_module_css_default.status,
				children: t("loading")
			});
			if (state.status === "error") return (0, react_jsx_runtime.jsxs)("div", {
				className: RemoteHostsPanel_module_css_default.failure,
				role: "alert",
				children: [(0, react_jsx_runtime.jsx)("p", { children: t("error") }), (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: refreshList,
					children: t("retry")
				})]
			});
			return (0, react_jsx_runtime.jsxs)("section", {
				className: RemoteHostsPanel_module_css_default.section,
				"aria-labelledby": "remote-hosts-title",
				children: [
					(0, react_jsx_runtime.jsxs)("header", {
						className: RemoteHostsPanel_module_css_default.header,
						children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("h2", {
							id: "remote-hosts-title",
							children: t("title")
						}), (0, react_jsx_runtime.jsx)("p", { children: t("subtitle") })] }), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: refreshList,
							children: t("refreshList")
						})]
					}),
					authentication !== null ? (0, react_jsx_runtime.jsxs)("section", {
						className: RemoteHostsPanel_module_css_default.authentication,
						"aria-labelledby": "remote-host-auth-title",
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								className: RemoteHostsPanel_module_css_default.authenticationHeader,
								children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("h3", {
									id: "remote-host-auth-title",
									children: t("authTitle")
								}), (0, react_jsx_runtime.jsx)("p", { children: t("authHint") })] }), (0, react_jsx_runtime.jsxs)("div", {
									className: RemoteHostsPanel_module_css_default.authenticationActions,
									children: [(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										disabled: authentication.terminalOpening === true,
										onClick: () => {
											launchTerminal(authentication.hostId);
										},
										children: authentication.terminalOpened === true ? t("terminalOpened") : t("openTerminal")
									}), (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: cancelAuthAttempt,
										children: t("cancel")
									})]
								})]
							}),
							authentication.error !== void 0 ? (0, react_jsx_runtime.jsx)("p", {
								className: RemoteHostsPanel_module_css_default.hostFailure,
								role: "alert",
								children: authentication.error
							}) : null,
							authentication.terminalError !== void 0 ? (0, react_jsx_runtime.jsx)("p", {
								className: RemoteHostsPanel_module_css_default.hostFailure,
								role: "alert",
								children: authentication.terminalError
							}) : null,
							authentication.terminalOpened === true ? (0, react_jsx_runtime.jsx)("p", {
								className: RemoteHostsPanel_module_css_default.status,
								children: t("terminalHint")
							}) : null,
							authentication.snapshot?.state === "prompt" ? (0, react_jsx_runtime.jsxs)("div", {
								className: RemoteHostsPanel_module_css_default.authTerminal,
								role: "log",
								"aria-live": "polite",
								children: [
									(0, react_jsx_runtime.jsx)("div", {
										className: RemoteHostsPanel_module_css_default.authTerminalTitle,
										children: authentication.snapshot.prompt.name || t("authTerminal")
									}),
									authentication.snapshot.prompt.instructions ? (0, react_jsx_runtime.jsx)("p", { children: authentication.snapshot.prompt.instructions }) : null,
									authentication.snapshot.prompt.prompts.map((prompt, index) => (0, react_jsx_runtime.jsxs)("label", {
										className: RemoteHostsPanel_module_css_default.authPrompt,
										children: [(0, react_jsx_runtime.jsx)("span", { children: prompt.prompt }), (0, react_jsx_runtime.jsx)("input", {
											autoFocus: index === 0,
											type: prompt.echo ? "text" : "password",
											value: authentication.responses[index] ?? "",
											onChange: (event) => setAuthentication((current) => current === null ? null : {
												...current,
												responses: current.responses.map((response, responseIndex) => responseIndex === index ? event.target.value : response)
											})
										})]
									}, `${prompt.prompt}-${index}`)),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: submitAuthenticationResponses,
										children: t("authSubmit")
									})
								]
							}) : authentication.snapshot?.state === "pending" ? (0, react_jsx_runtime.jsx)("p", {
								className: RemoteHostsPanel_module_css_default.status,
								children: t("authConnecting")
							}) : authentication.snapshot?.state === "failed" ? (0, react_jsx_runtime.jsxs)("div", {
								className: RemoteHostsPanel_module_css_default.authFailure,
								children: [(0, react_jsx_runtime.jsx)("p", {
									className: RemoteHostsPanel_module_css_default.hostFailure,
									children: authentication.snapshot.message || t("authFailed")
								}), (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => {
										launchTerminal(authentication.hostId);
									},
									children: t("openTerminal")
								})]
							}) : authentication.snapshot?.state === "cancelled" ? (0, react_jsx_runtime.jsx)("p", {
								className: RemoteHostsPanel_module_css_default.status,
								children: t("authCancelled")
							}) : (0, react_jsx_runtime.jsxs)("div", {
								className: RemoteHostsPanel_module_css_default.authForm,
								children: [
									(0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("span", { children: t("password") }), (0, react_jsx_runtime.jsx)("input", {
										type: "password",
										value: authentication.password,
										autoFocus: true,
										onChange: (event) => setAuthentication((current) => current === null ? null : {
											...current,
											password: event.target.value
										})
									})] }),
									(0, react_jsx_runtime.jsxs)("label", {
										className: RemoteHostsPanel_module_css_default.checkbox,
										children: [(0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: authentication.persistPassword,
											onChange: (event) => setAuthentication((current) => current === null ? null : {
												...current,
												persistPassword: event.target.checked
											})
										}), (0, react_jsx_runtime.jsx)("span", { children: t("persistPassword") })]
									}),
									(0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("span", { children: t("connectionDuration") }), (0, react_jsx_runtime.jsxs)("select", {
										value: authentication.connectionDurationMs,
										onChange: (event) => setAuthentication((current) => current === null ? null : {
											...current,
											connectionDurationMs: Number(event.target.value)
										}),
										children: [
											(0, react_jsx_runtime.jsx)("option", {
												value: 9e5,
												children: t("duration15m")
											}),
											(0, react_jsx_runtime.jsx)("option", {
												value: 36e5,
												children: t("duration1h")
											}),
											(0, react_jsx_runtime.jsx)("option", {
												value: 18e6,
												children: t("duration5h")
											})
										]
									})] }),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: submitAuthentication,
										children: t("authConnect")
									})
								]
							})
						]
					}) : null,
					deleteError !== null ? (0, react_jsx_runtime.jsx)("p", {
						className: RemoteHostsPanel_module_css_default.hostFailure,
						role: "alert",
						children: `${t("deleteError")} ${deleteError}`
					}) : null,
					state.hosts.length === 0 ? (0, react_jsx_runtime.jsxs)("div", {
						className: RemoteHostsPanel_module_css_default.status,
						children: [(0, react_jsx_runtime.jsx)("p", { children: t("empty") }), (0, react_jsx_runtime.jsx)("p", { children: t("emptyHint") })]
					}) : (0, react_jsx_runtime.jsx)("ul", {
						className: RemoteHostsPanel_module_css_default.hosts,
						children: state.hosts.map((host) => {
							const open = expanded === host.id;
							const factState = facts[host.id];
							const rows = factState?.status === "ready" ? factRows(factState.facts, t) : [];
							const transport = transportValue(host);
							const transportLabel = transportKey(transport);
							return (0, react_jsx_runtime.jsxs)("li", {
								className: RemoteHostsPanel_module_css_default.host,
								"data-host-id": host.id,
								"data-connection": host.connection.state,
								"data-transport": transport,
								children: [
									(0, react_jsx_runtime.jsxs)("div", {
										className: RemoteHostsPanel_module_css_default.hostSummary,
										children: [
											(0, react_jsx_runtime.jsxs)("div", {
												className: RemoteHostsPanel_module_css_default.identity,
												children: [(0, react_jsx_runtime.jsxs)("div", {
													className: RemoteHostsPanel_module_css_default.titleRow,
													children: [(0, react_jsx_runtime.jsx)("strong", { children: host.label }), (0, react_jsx_runtime.jsx)("span", { children: t(host.kind) })]
												}), (0, react_jsx_runtime.jsxs)("code", { children: [host.user === void 0 ? host.hostname : `${host.user}@${host.hostname}`, host.port === 22 ? "" : `:${host.port}`] })]
											}),
											(0, react_jsx_runtime.jsxs)("div", {
												className: RemoteHostsPanel_module_css_default.connectionLine,
												children: [(0, react_jsx_runtime.jsx)("span", {
													className: RemoteHostsPanel_module_css_default.connection,
													"data-state": host.connection.state,
													children: connectionLabel(host, t)
												}), transportLabel === void 0 ? null : (0, react_jsx_runtime.jsx)("span", {
													className: RemoteHostsPanel_module_css_default.transport,
													"data-transport": transport,
													children: t(transportLabel)
												})]
											}),
											(0, react_jsx_runtime.jsxs)("div", {
												className: RemoteHostsPanel_module_css_default.hostActions,
												children: [
													(0, react_jsx_runtime.jsx)("button", {
														type: "button",
														disabled: connectingHostId === host.id,
														"aria-expanded": needsAuthentication(host) ? void 0 : open,
														onClick: () => {
															if (needsAuthentication(host)) connectHost(host.id);
															else toggle(host.id);
														},
														children: needsAuthentication(host) ? t("connect") : open ? t("close") : t("inspect")
													}),
													(0, react_jsx_runtime.jsx)("button", {
														type: "button",
														disabled: terminal?.hostId === host.id && terminal.opening === true,
														onClick: () => {
															launchTerminal(host.id);
														},
														children: terminal?.hostId === host.id && terminal.opened === true ? t("terminalOpened") : t("openTerminal")
													}),
													(0, react_jsx_runtime.jsx)("button", {
														type: "button",
														"data-danger": armedDeleteHostId === host.id,
														disabled: deletingHostId === host.id,
														onClick: () => {
															confirmDelete(host.id);
														},
														children: armedDeleteHostId === host.id ? t("confirmDelete") : t("delete")
													}),
													armedDeleteHostId === host.id ? (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														onClick: cancelDelete,
														children: t("cancel")
													}) : null
												]
											})
										]
									}),
									host.connection.state === "failed" ? (0, react_jsx_runtime.jsx)("p", {
										className: RemoteHostsPanel_module_css_default.hostFailure,
										children: host.connection.message
									}) : null,
									terminal?.hostId === host.id && terminal.error !== void 0 ? (0, react_jsx_runtime.jsx)("p", {
										className: RemoteHostsPanel_module_css_default.hostFailure,
										role: "alert",
										children: terminal.error
									}) : null,
									terminal?.hostId === host.id && terminal.opened === true ? (0, react_jsx_runtime.jsx)("p", {
										className: RemoteHostsPanel_module_css_default.status,
										children: t("interactiveLoginRequired")
									}) : null,
									terminal?.hostId === host.id && terminal.opened === true ? (0, react_jsx_runtime.jsx)("p", {
										className: RemoteHostsPanel_module_css_default.status,
										children: t("terminalHint")
									}) : null,
									open ? (0, react_jsx_runtime.jsxs)("div", {
										className: RemoteHostsPanel_module_css_default.details,
										children: [
											(0, react_jsx_runtime.jsxs)("div", {
												className: RemoteHostsPanel_module_css_default.detailActions,
												children: [
													(0, react_jsx_runtime.jsxs)("span", { children: [
														t("configuredTarget"),
														": ",
														host.hostname,
														":",
														host.port
													] }),
													transportLabel === void 0 ? null : (0, react_jsx_runtime.jsxs)("span", { children: [
														t("transport"),
														": ",
														t(transportLabel)
													] }),
													(0, react_jsx_runtime.jsx)("button", {
														type: "button",
														disabled: factState?.status === "loading",
														onClick: () => {
															inspectHost(host.id);
														},
														children: t("refreshFacts")
													})
												]
											}),
											factState === void 0 || factState.status === "loading" ? (0, react_jsx_runtime.jsx)("p", {
												className: RemoteHostsPanel_module_css_default.status,
												children: t("inspecting")
											}) : null,
											factState?.status === "error" ? (0, react_jsx_runtime.jsx)("p", {
												className: RemoteHostsPanel_module_css_default.hostFailure,
												role: "alert",
												children: t("inspectError")
											}) : null,
											factState?.status === "ready" ? (0, react_jsx_runtime.jsx)("dl", {
												className: RemoteHostsPanel_module_css_default.facts,
												children: rows.map(([label, value]) => (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("dt", { children: label }), (0, react_jsx_runtime.jsx)("dd", { children: value })] }, label))
											}) : null
										]
									}) : null
								]
							}, host.id);
						})
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** Locale dictionaries for the Remote hosts workbench panel. */
		/** Simplified Chinese dictionary and key source of truth. */
		const zh = {
			title: "远程主机",
			subtitle: "查看服务器和集群登录节点的连接状态与基础信息。",
			loading: "正在读取远程主机…",
			error: "暂时无法读取远程主机。",
			retry: "重试",
			refreshList: "刷新主机列表",
			empty: "尚未配置远程主机。",
			emptyHint: "可以在对话中发送 OpenSSH 配置块；模型会先展示未保存的草稿，确认后才会连接并记录服务器密钥。",
			server: "服务器",
			cluster: "集群登录节点",
			stateDisconnected: "未连接",
			stateConnecting: "正在连接",
			stateActive: "正在使用（{count}）",
			stateIdle: "连接空闲，将在 {time} 回收",
			stateClosing: "正在断开",
			stateFailed: "连接失败",
			transport: "连接通道",
			transportSsh2: "ssh2 库",
			transportControlMaster: "OpenSSH 多路复用",
			inspect: "查看基础信息",
			close: "收起基础信息",
			refreshFacts: "刷新基础信息",
			inspecting: "正在读取基础信息…",
			inspectError: "无法读取这台主机的信息。",
			connect: "连接",
			cancel: "取消",
			delete: "删除",
			confirmDelete: "确认删除",
			deleteError: "无法删除这台主机。",
			authTitle: "连接远程主机",
			authHint: "密码只在本次连接中使用；勾选保存后会写入本地凭据存储。服务器再次通过交互提示索要密码时会自动复用，面板只要求输入后续 MFA。",
			password: "密码",
			persistPassword: "保存密码，供后续连接使用",
			connectionDuration: "连接保持时间",
			duration15m: "15 分钟",
			duration1h: "1 小时",
			duration5h: "5 小时",
			authConnect: "开始连接",
			authConnecting: "正在建立连接…",
			authTerminal: "SSH 验证终端",
			authSubmit: "发送回答",
			authFailed: "连接认证失败，请检查密码或重新输入验证信息。",
			authCancelled: "连接已取消。",
			openTerminal: "在终端中连接",
			terminalOpened: "终端已打开",
			terminalHint: "本机 SSH 终端已打开。请在该终端完成登录；登录后刷新主机列表，DSH 才会复用它建立的持久连接。",
			interactiveLoginRequired: "这台主机默认通过 OpenSSH 多路复用连接，密码与 MFA 需要在终端里完成。已为你打开本机终端，登录后刷新主机列表。",
			configuredTarget: "配置目标",
			remoteHostname: "主机名",
			operatingSystem: "操作系统",
			kernel: "内核",
			architecture: "架构",
			uptime: "运行时间",
			uptimeValue: "{days} 天 {hours} 小时",
			loadAverage: "平均负载",
			logicalCpuCount: "逻辑 CPU",
			memory: "内存",
			memoryValue: "{available} 可用 / {total} 总量",
			rootDisk: "根磁盘",
			diskValue: "{used} 已用 / {total} 总量",
			latency: "检查延迟",
			latencyValue: "{value} 毫秒",
			observedAt: "采集时间"
		};
		/** English dictionary checked against the Chinese key set. */
		const en = {
			title: "Remote hosts",
			subtitle: "Inspect connection state and basic facts for servers and cluster login nodes.",
			loading: "Reading remote hosts…",
			error: "Remote hosts are temporarily unavailable.",
			retry: "Retry",
			refreshList: "Refresh host list",
			empty: "No remote hosts are configured.",
			emptyHint: "Send an OpenSSH block in chat; the model shows an unsaved draft first and records the server key only after confirmation.",
			server: "Server",
			cluster: "Cluster login node",
			stateDisconnected: "Disconnected",
			stateConnecting: "Connecting",
			stateActive: "In use ({count})",
			stateIdle: "Idle; reclaim at {time}",
			stateClosing: "Disconnecting",
			stateFailed: "Connection failed",
			transport: "Connection path",
			transportSsh2: "ssh2 library",
			transportControlMaster: "OpenSSH multiplex",
			inspect: "View basic information",
			close: "Hide basic information",
			refreshFacts: "Refresh basic information",
			inspecting: "Reading basic information…",
			inspectError: "This host information is unavailable.",
			connect: "Connect",
			cancel: "Cancel",
			delete: "Delete",
			confirmDelete: "Confirm delete",
			deleteError: "Could not delete this host.",
			authTitle: "Connect to remote host",
			authHint: "The password is used only for this connection; saving stores it in the local credential store. If SSH asks for it again interactively, DSH reuses it and asks only for the remaining MFA response.",
			password: "Password",
			persistPassword: "Save password for later connections",
			connectionDuration: "Keep connection for",
			duration15m: "15 minutes",
			duration1h: "1 hour",
			duration5h: "5 hours",
			authConnect: "Connect",
			authConnecting: "Connecting…",
			authTerminal: "SSH verification terminal",
			authSubmit: "Send response",
			authFailed: "Authentication failed. Check the password or enter the verification response again.",
			authCancelled: "Connection cancelled.",
			openTerminal: "Connect in terminal",
			terminalOpened: "Terminal opened",
			terminalHint: "The native SSH terminal is open. Finish the login in that terminal; DSH reuses the persistent session it creates only after you refresh the host list.",
			interactiveLoginRequired: "This host connects through OpenSSH multiplexing by default; password and MFA prompts belong in the terminal. The native terminal is now open — refresh the host list after you log in.",
			configuredTarget: "Configured target",
			remoteHostname: "Hostname",
			operatingSystem: "Operating system",
			kernel: "Kernel",
			architecture: "Architecture",
			uptime: "Uptime",
			uptimeValue: "{days} d {hours} h",
			loadAverage: "Load average",
			logicalCpuCount: "Logical CPUs",
			memory: "Memory",
			memoryValue: "{available} available / {total} total",
			rootDisk: "Root disk",
			diskValue: "{used} used / {total} total",
			latency: "Inspection latency",
			latencyValue: "{value} ms",
			observedAt: "Observed"
		};
		//#endregion
		//#region lib/types/client/index.js
		/** Localized Remote hosts inventory and authentication surface registered in the right workbench. */
		/** Dictionary namespace owned by this plugin. */
		const NS = "remoteHosts";
		/** Services required by the right-workbench contribution and generated Remote face. */
		const inject = [
			"locale",
			"betterSidebar",
			"remote",
			"remote.remoteHosts"
		];
		/**
		* Contribute the Remote hosts surface without owning any Host connection resource.
		* @param ctx - browser Cordis root carrying the right-workbench service and generated Remote namespaces.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-remote-host: dictionaries");
			const list = async () => {
				const result = await ctx.remote.remoteHosts.list();
				if (!result.ok) throw result.error;
				return result.value;
			};
			const inspect = async (hostId, signal) => {
				const result = await ctx.remote.remoteHosts.inspect(hostId, signal);
				if (!result.ok) throw result.error;
				return result.value;
			};
			const authenticate = async (request) => {
				const result = await ctx.remote.remoteHosts.authenticate(request);
				if (!result.ok) throw result.error;
				return result.value;
			};
			const authenticationStatus = async (authId) => {
				const result = await ctx.remote.remoteHosts.authenticationStatus(authId);
				if (!result.ok) throw result.error;
				return result.value;
			};
			const answerAuthentication = async (request) => {
				const result = await ctx.remote.remoteHosts.answerAuthentication(request);
				if (!result.ok) throw result.error;
				return result.value;
			};
			const cancelAuthentication = async (authId) => {
				const result = await ctx.remote.remoteHosts.cancelAuthentication(authId);
				if (!result.ok) throw result.error;
			};
			const openTerminal = async (hostId) => {
				const result = await ctx.remote.remoteHosts.openTerminal(hostId);
				if (!result.ok) throw result.error;
			};
			const connect = async (hostId, signal) => {
				const result = await ctx.remote.remoteHosts.connect(hostId, signal);
				if (!result.ok) throw result.error;
				return result.value;
			};
			const remove = async (hostId) => {
				const result = await ctx.remote.remoteHosts.delete(hostId);
				if (!result.ok) throw result.error;
			};
			const t = ctx.locale.bind(NS);
			function RemoteHostsTab(_props) {
				return (0, react.createElement)(RemoteHostsPanel, {
					list,
					inspect,
					authenticate,
					authenticationStatus,
					answerAuthentication,
					cancelAuthentication,
					openTerminal,
					connect,
					remove,
					t
				});
			}
			ctx.effect(() => ctx.betterSidebar.registerTab({
				id: "remote-hosts",
				title: () => t("title"),
				order: 10,
				single: true,
				component: RemoteHostsTab
			}), "ui-remote-host: right-workbench Tab");
			ctx.effect(() => {
				let initializedSessionId;
				const openDefaultTab = () => {
					const { sessionId } = ctx.betterSidebar.getSnapshot();
					if (sessionId === void 0 || sessionId === initializedSessionId) return;
					initializedSessionId = sessionId;
					ctx.betterSidebar.openTab({ type: "remote-hosts" }, { sessionId });
				};
				openDefaultTab();
				return ctx.betterSidebar.subscribeState(openDefaultTab);
			}, "ui-remote-host: default right-workbench Tab");
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map