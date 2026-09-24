/** Typert Remote Consumer for configured remote hosts and user-driven authentication. */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { RemoteHostError, RemoteHostId, } from '../../../host-remote-host/lib/index.js';
import { Remote, RemoteError, TypertRemoteService, } from '@deepseek-ai/dsh-typert-protocol';
/** Remote-only service exposing safe inventory and on-demand basic facts. */
let RemoteHostController = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _list_decorators;
    let _inspect_decorators;
    let _openTerminal_decorators;
    let _delete_decorators;
    let _connect_decorators;
    let _authenticate_decorators;
    let _authenticationStatus_decorators;
    let _answerAuthentication_decorators;
    let _cancelAuthentication_decorators;
    return class RemoteHostController extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _list_decorators = [Remote('list')];
            _inspect_decorators = [Remote('inspect')];
            _openTerminal_decorators = [Remote('openTerminal')];
            _delete_decorators = [Remote('delete')];
            _connect_decorators = [Remote('connect')];
            _authenticate_decorators = [Remote('authenticate')];
            _authenticationStatus_decorators = [Remote('authenticationStatus')];
            _answerAuthentication_decorators = [Remote('answerAuthentication')];
            _cancelAuthentication_decorators = [Remote('cancelAuthentication')];
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _inspect_decorators, { kind: "method", name: "inspect", static: false, private: false, access: { has: obj => "inspect" in obj, get: obj => obj.inspect }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _openTerminal_decorators, { kind: "method", name: "openTerminal", static: false, private: false, access: { has: obj => "openTerminal" in obj, get: obj => obj.openTerminal }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _delete_decorators, { kind: "method", name: "delete", static: false, private: false, access: { has: obj => "delete" in obj, get: obj => obj.delete }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _connect_decorators, { kind: "method", name: "connect", static: false, private: false, access: { has: obj => "connect" in obj, get: obj => obj.connect }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _authenticate_decorators, { kind: "method", name: "authenticate", static: false, private: false, access: { has: obj => "authenticate" in obj, get: obj => obj.authenticate }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _authenticationStatus_decorators, { kind: "method", name: "authenticationStatus", static: false, private: false, access: { has: obj => "authenticationStatus" in obj, get: obj => obj.authenticationStatus }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _answerAuthentication_decorators, { kind: "method", name: "answerAuthentication", static: false, private: false, access: { has: obj => "answerAuthentication" in obj, get: obj => obj.answerAuthentication }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _cancelAuthentication_decorators, { kind: "method", name: "cancelAuthentication", static: false, private: false, access: { has: obj => "cancelAuthentication" in obj, get: obj => obj.cancelAuthentication }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['remoteHosts'];
        /** @param ctx - Host context carrying the provider-neutral remote-host registry. */
        constructor(ctx) {
            super(ctx, 'remoteHostController', { namespace: 'remoteHosts' });
            __runInitializers(this, _instanceExtraInitializers);
        }
        /**
         * Read the current configured-host projection without establishing a connection.
         * @returns current safe host summaries and connection states in registration order.
         */
        async list() {
            return await Promise.resolve(this.ctx.remoteHosts.list());
        }
        /**
         * Collect partial basic facts and return the post-operation idle state.
         * @param hostId - configured target identity from a preceding list result.
         * @param signal - carrier cancellation, always the final parameter.
         * @returns partial facts plus a fresh safe host snapshot.
         */
        async inspect(hostId, signal) {
            const id = RemoteHostId(hostId);
            try {
                const facts = await this.ctx.remoteHosts.inspect(id, signal);
                return { facts, host: this.ctx.remoteHosts.status(id) };
            }
            catch (error) {
                signal.throwIfAborted();
                if (error instanceof RemoteHostError && error.code === 'HOST_NOT_FOUND') {
                    throw new RemoteError('remote-host/not-found', `no remote host "${hostId}" is configured`, { hostId });
                }
                throw new RemoteError('remote-host/unavailable', `remote host "${hostId}" is unavailable`, { hostId }, { cause: error });
            }
        }
        /**
         * Open a Host-native SSH terminal that can create or reuse a provider-owned session.
         * @param hostId - configured target identity from a preceding list result.
         * @returns after the operating system accepts the detached terminal launch.
         */
        async openTerminal(hostId) {
            const id = RemoteHostId(hostId);
            try {
                await this.ctx.remoteHosts.openTerminal(id);
            }
            catch (error) {
                if (error instanceof RemoteHostError && error.code === 'HOST_NOT_FOUND') {
                    throw new RemoteError('remote-host/not-found', `no remote host "${hostId}" is configured`, { hostId });
                }
                throw new RemoteError('remote-host/terminal-unavailable', `could not open a native terminal for remote host "${hostId}"`, { hostId }, { cause: error });
            }
        }
        /**
         * Remove one configured host and its provider-owned stored credential.
         *
         * The provider owns the durable delete and its own unpublish, so this method
         * only maps the provider-neutral failure vocabulary onto the browser-safe one.
         * @param hostId - configured target identity from a preceding list result.
         */
        async delete(hostId) {
            const id = RemoteHostId(hostId);
            try {
                await this.ctx.remoteHosts.remove(id);
            }
            catch (error) {
                if (error instanceof RemoteHostError && error.code === 'HOST_NOT_FOUND') {
                    throw new RemoteError('remote-host/not-found', `no remote host "${hostId}" is configured`, { hostId });
                }
                if (error instanceof RemoteHostError && error.code === 'REMOVE_UNSUPPORTED') {
                    throw new RemoteError('remote-host/remove-unsupported', `remote host "${hostId}" cannot be removed by its provider`, { hostId }, { cause: error });
                }
                throw new RemoteError('remote-host/unavailable', `remote host "${hostId}" could not be removed`, { hostId }, { cause: error });
            }
        }
        /**
         * Establish or reuse one configured host connection.
         *
         * A provider whose default transport is a native ControlMaster session cannot
         * finish the login unattended: it opens or reuses the terminal and reports the
         * stable `remote-host/interactive-login-required` code, which lets the panel
         * route the operator to that terminal instead of guessing from a message.
         * @param hostId - configured target identity from a preceding list result.
         * @param signal - carrier cancellation, always the final parameter.
         * @returns the fresh safe host snapshot after the provider accepts the connection.
         */
        async connect(hostId, signal) {
            const id = RemoteHostId(hostId);
            try {
                return await this.ctx.remoteHosts.connect(id, signal);
            }
            catch (error) {
                signal.throwIfAborted();
                if (error instanceof RemoteHostError && error.code === 'HOST_NOT_FOUND') {
                    throw new RemoteError('remote-host/not-found', `no remote host "${hostId}" is configured`, { hostId });
                }
                if (error instanceof RemoteHostError && error.code === 'AUTH_INTERACTIVE_REQUIRED') {
                    throw new RemoteError('remote-host/interactive-login-required', error.message, { hostId }, { cause: error });
                }
                throw new RemoteError('remote-host/unavailable', `remote host "${hostId}" is unavailable`, { hostId }, { cause: error });
            }
        }
        /**
         * Start a Host-owned password or keyboard-interactive authentication attempt.
         * @param request - browser-supplied authentication mode, retention, and optional password.
         * @returns safe pending or terminal authentication state.
         */
        authenticate(request) {
            return this.ctx.remoteHosts.beginAuthentication(RemoteHostId(request.hostId), request);
        }
        /**
         * Return the current prompt or terminal state for an authentication attempt.
         * @param authId - authentication attempt identity returned by {@link authenticate}.
         * @returns safe prompt or terminal authentication state.
         */
        authenticationStatus(authId) {
            return this.ctx.remoteHosts.authenticationStatus(authId);
        }
        /**
         * Submit the current keyboard-interactive response set.
         * @param request - authentication attempt identity and ordered responses.
         * @returns the safe pending or terminal state after submission.
         */
        answerAuthentication(request) {
            return this.ctx.remoteHosts.answerAuthentication(request.authId, request.responses);
        }
        /**
         * Cancel a pending authentication attempt.
         * @param authId - authentication attempt identity returned by {@link authenticate}.
         */
        cancelAuthentication(authId) {
            this.ctx.remoteHosts.cancelAuthentication(authId);
        }
    };
})();
export { RemoteHostController };
export default RemoteHostController;
//# sourceMappingURL=index.js.map