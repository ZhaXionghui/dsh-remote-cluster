/** Registry Service Definition for configured remote hosts and their replaceable providers. */
import { Service } from '@deepseek-ai/cordis';
import { brandString } from '@deepseek-ai/dsh-brand';
/** Failure carrying a stable remote-host service code. */
export class RemoteHostError extends Error {
    code;
    /**
     * @param message - operator-facing failure description.
     * @param code - stable service failure code.
     * @param options - optional error cause.
     */
    constructor(message, code, options) {
        super(message, options);
        this.code = code;
        this.name = 'RemoteHostError';
    }
}
/**
 * Brand one validated configuration key as a remote-host identity.
 * @param value - non-empty id admitted by the configuration parser.
 * @returns the unchanged string with the remote-host brand.
 */
export function RemoteHostId(value) {
    return brandString(value);
}
/**
 * Brand a registry-minted authentication attempt identity.
 * @param value - registry-issued authentication attempt id.
 * @returns the unchanged string with the authentication-id brand.
 */
export function RemoteHostAuthId(value) {
    return brandString(value);
}
const MAX_AUTH_CONNECTION_DURATION_MS = 2_147_483_647;
/** Effect-scoped registry and dispatch service for configured remote hosts. */
export class RemoteHostRegistry extends Service {
    backends = new Map();
    authSessions = new Map();
    nextAuthId = 0;
    disposing = false;
    /**
     * Install the registry and its service-wide quiescent teardown.
     * @param ctx - owning Cordis context.
     */
    constructor(ctx) {
        super(ctx, 'remoteHosts');
        ctx.effect(() => () => this.disposeAll(), 'remote-host registry teardown');
    }
    /**
     * Register one configured backend for the calling plugin fiber.
     * @param backend - provider-owned host whose id must be unique.
     * @returns exact Cordis effect disposer that unpublishes and closes exactly this backend.
     */
    register(backend) {
        const id = backend.summary.id;
        const dispose = this.ctx.effect(() => {
            this.assertActive();
            if (id.length === 0)
                throw new Error('remote host id must be non-empty');
            if (backend.summary.label.trim().length === 0)
                throw new Error(`remote host "${id}" label must be non-empty`);
            if (backend.summary.hostname.trim().length === 0)
                throw new Error(`remote host "${id}" hostname must be non-empty`);
            if (this.backends.has(id)) {
                throw new RemoteHostError(`remote host "${id}" is already registered`, 'DUPLICATE_HOST');
            }
            this.backends.set(id, backend);
            return async () => {
                if (this.backends.get(id) === backend)
                    this.backends.delete(id);
                await backend.dispose();
            };
        }, 'remoteHosts.register()');
        return dispose;
    }
    /**
     * Return fresh safe snapshots in provider registration order.
     * @returns configured hosts and their current connection states.
     */
    list() {
        return [...this.backends.values()].map(backend => ({
            ...backend.summary,
            connection: backend.snapshot(),
        }));
    }
    /**
     * Return one fresh safe snapshot.
     * @param id - configured host identity.
     * @returns configuration summary and current connection state.
     * @throws {RemoteHostError} `HOST_NOT_FOUND` when no provider owns the id.
     */
    status(id) {
        const backend = this.expect(id);
        return { ...backend.summary, connection: backend.snapshot() };
    }
    /**
     * Establish or reuse one host connection.
     * @param id - configured host identity.
     * @param signal - caller cancellation while connection setup is unpublished.
     * @returns fresh state after the provider accepts the connection.
     */
    async connect(id, signal) {
        this.assertActive();
        const backend = this.expect(id);
        await backend.connect(signal);
        return { ...backend.summary, connection: backend.snapshot() };
    }
    /**
     * Open a native terminal for direct operator-driven authentication and provider-specific session handoff.
     * @param id - configured host identity.
     * @returns after the provider accepts the terminal launch request.
     */
    async openTerminal(id) {
        this.assertActive();
        const backend = this.expect(id);
        if (backend.openTerminal === undefined) {
            throw new RemoteHostError(`remote host "${id}" has no native terminal launcher`, 'TERMINAL_UNAVAILABLE');
        }
        await backend.openTerminal();
    }
    /**
     * Remove one configured host through its provider.
     *
     * The provider's `remove` owns the durable write AND its own unpublish; this
     * registry only validates activity, presence, and capability, then awaits the
     * provider. It never disposes the backend itself — the provider's registration
     * effect disposes it during reconcile, so a second dispose cannot happen here.
     * @param id - configured host identity.
     * @throws {RemoteHostError} `HOST_NOT_FOUND` when no provider owns the id, or
     *   `REMOVE_UNSUPPORTED` when the provider cannot remove configured hosts.
     */
    async remove(id) {
        this.assertActive();
        const backend = this.expect(id);
        if (backend.remove === undefined) {
            throw new RemoteHostError(`remote host "${id}" cannot be removed by its provider`, 'REMOVE_UNSUPPORTED');
        }
        await backend.remove();
    }
    /**
     * Start an asynchronous password or keyboard-interactive authentication attempt.
     * @param id - configured host identity.
     * @param request - operator-supplied password and connection-retention choices.
     * @returns the initial safe authentication state.
     */
    beginAuthentication(id, request) {
        this.assertActive();
        const backend = this.expect(id);
        const duration = request.connectionDurationMs;
        if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0 || duration > MAX_AUTH_CONNECTION_DURATION_MS)) {
            throw new RemoteHostError(`authentication connection duration must be a positive finite number no greater than ${MAX_AUTH_CONNECTION_DURATION_MS}`, 'AUTH_INVALID_RESPONSE');
        }
        for (const session of this.authSessions.values()) {
            if (session.hostId === id && (session.snapshot.state === 'pending' || session.snapshot.state === 'prompt')) {
                throw new RemoteHostError(`remote host "${id}" already has an authentication attempt`, 'AUTH_SESSION_BUSY');
            }
        }
        const authId = RemoteHostAuthId(`remote-auth-${++this.nextAuthId}`);
        const controller = new AbortController();
        const session = {
            id: authId,
            hostId: id,
            controller,
            snapshot: { id: authId, hostId: id, state: 'pending' },
            answer: undefined,
        };
        this.authSessions.set(authId, session);
        void backend.authenticate({ ...request, signal: controller.signal }, async (prompt) => {
            if (controller.signal.aborted)
                throw controller.signal.reason;
            session.snapshot = { id: authId, hostId: id, state: 'prompt', prompt };
            return await new Promise((resolve, reject) => {
                session.answer = { resolve, reject };
                controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
            });
        }).then(() => {
            if (controller.signal.aborted)
                return;
            session.snapshot = { id: authId, hostId: id, state: 'connected', host: this.status(id) };
        }, (error) => {
            if (controller.signal.aborted) {
                session.snapshot = { id: authId, hostId: id, state: 'cancelled' };
                return;
            }
            session.snapshot = {
                id: authId,
                hostId: id,
                state: 'failed',
                message: error instanceof Error ? error.message : String(error),
            };
        });
        return session.snapshot;
    }
    /**
     * Return the current safe state of one authentication attempt.
     * @param id - authentication attempt identity.
     * @returns current prompt or terminal state.
     */
    authenticationStatus(id) {
        const session = this.authSessions.get(id);
        if (session === undefined)
            throw new RemoteHostError(`authentication session "${id}" was not found`, 'AUTH_SESSION_NOT_FOUND');
        return session.snapshot;
    }
    /**
     * Deliver keyboard-interactive answers to the pending SSH handshake.
     * @param id - authentication attempt identity.
     * @param responses - answers in the order requested by the SSH server.
     * @returns the pending state after the answers are delivered.
     */
    answerAuthentication(id, responses) {
        const session = this.authSessions.get(id);
        if (session === undefined)
            throw new RemoteHostError(`authentication session "${id}" was not found`, 'AUTH_SESSION_NOT_FOUND');
        if (session.snapshot.state !== 'prompt' || session.answer === undefined) {
            throw new RemoteHostError(`authentication session "${id}" is not waiting for input`, 'AUTH_INVALID_RESPONSE');
        }
        const expected = session.snapshot.prompt.prompts.length;
        if (responses.length !== expected) {
            throw new RemoteHostError(`authentication session "${id}" expected ${expected} response(s)`, 'AUTH_INVALID_RESPONSE');
        }
        const answer = session.answer;
        session.answer = undefined;
        session.snapshot = { id: session.id, hostId: session.hostId, state: 'pending' };
        answer.resolve([...responses]);
        return session.snapshot;
    }
    /**
     * Cancel one pending authentication attempt.
     * @param id - authentication attempt identity.
     */
    cancelAuthentication(id) {
        const session = this.authSessions.get(id);
        if (session === undefined)
            return;
        session.answer?.reject(new Error('authentication cancelled'));
        session.answer = undefined;
        session.controller.abort(new Error('authentication cancelled'));
        session.snapshot = { id: session.id, hostId: session.hostId, state: 'cancelled' };
    }
    /**
     * Accept a provider-reported pending host key after a user confirmation.
     * @param id - configured host identity.
     * @returns the host snapshot after the provider records the pending key.
     */
    async trustHostKey(id) {
        this.assertActive();
        const backend = this.expect(id);
        if (backend.trustHostKey === undefined) {
            throw new RemoteHostError(`remote host "${id}" does not support host-key trust`, 'HOST_KEY_UNTRUSTED');
        }
        await backend.trustHostKey();
        return { ...backend.summary, connection: backend.snapshot() };
    }
    /**
     * Explicitly close one host connection and await cleanup.
     * @param id - configured host identity.
     * @param reason - operator or consumer reason for diagnostics.
     * @returns fresh disconnected state.
     */
    async disconnect(id, reason) {
        this.assertActive();
        const backend = this.expect(id);
        await backend.disconnect(reason);
        return { ...backend.summary, connection: backend.snapshot() };
    }
    /**
     * Inspect one host through its provider.
     * @param id - configured host identity.
     * @param signal - caller cancellation.
     * @returns partial typed basic facts.
     */
    async inspect(id, signal) {
        this.assertActive();
        return await this.expect(id).inspect(signal);
    }
    /**
     * Apply the selected provider's execution defaults and caps.
     * @param request - raw foreground execution request.
     * @returns fully specified execution request.
     */
    resolve(request) {
        this.assertActive();
        return this.expect(request.hostId).resolve(request);
    }
    /**
     * Execute one provider-resolved foreground request.
     * @param spec - result of {@link resolve}.
     * @returns bounded output and independent exit, timeout, and abort facts.
     */
    async run(spec) {
        this.assertActive();
        return await this.expect(spec.hostId).run(spec);
    }
    /**
     * Upload one local file to a configured host through its provider.
     * @param request - target, absolute local and remote paths, and overwrite choice.
     * @returns transferred byte count, resolved paths, transport, and duration.
     * @throws {RemoteHostError} `TRANSFER_UNSUPPORTED` when the provider implements no transfer.
     */
    async upload(request) {
        this.assertActive();
        return await this.dispatchTransfer('upload', this.expect(request.hostId), request);
    }
    /**
     * Download one remote file from a configured host through its provider.
     * @param request - target, absolute local and remote paths, and overwrite choice.
     * @returns transferred byte count, resolved paths, transport, and duration.
     * @throws {RemoteHostError} `TRANSFER_UNSUPPORTED` when the provider implements no transfer.
     */
    async download(request) {
        this.assertActive();
        return await this.dispatchTransfer('download', this.expect(request.hostId), request);
    }
    async dispatchTransfer(direction, backend, request) {
        if (backend.transfer === undefined) {
            throw new RemoteHostError(`remote host "${backend.summary.id}" does not support file transfer`, 'TRANSFER_UNSUPPORTED');
        }
        return await backend.transfer(direction, request);
    }
    assertActive() {
        if (this.disposing)
            throw new RemoteHostError('remote host service is disposing', 'SERVICE_DISPOSING');
    }
    expect(id) {
        const backend = this.backends.get(id);
        if (backend === undefined)
            throw new RemoteHostError(`remote host "${id}" is not registered`, 'HOST_NOT_FOUND');
        return backend;
    }
    async disposeAll() {
        this.disposing = true;
        for (const authId of this.authSessions.keys())
            this.cancelAuthentication(authId);
        this.authSessions.clear();
        const backends = [...this.backends.values()];
        this.backends.clear();
        const results = await Promise.allSettled(backends.map(backend => backend.dispose()));
        const failures = results
            .filter((result) => result.status === 'rejected')
            .map(result => result.reason);
        if (failures.length > 0)
            throw new AggregateError(failures, 'failed to dispose remote host backends');
    }
}
export default RemoteHostRegistry;
//# sourceMappingURL=index.js.map