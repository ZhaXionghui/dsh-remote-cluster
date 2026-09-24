/** Registry Service Definition for configured remote hosts and their replaceable providers. */
import { Context, Service } from '@deepseek-ai/cordis';
import type { RemoteHostBackend, RemoteHostAuthId as RemoteHostAuthIdBrand, RemoteHostAuthRequest, RemoteHostAuthSnapshot, RemoteHostFacts, RemoteHostId as RemoteHostIdBrand, RemoteHostRunRequest, RemoteHostRunResult, RemoteHostRunSpec, RemoteHostSnapshot, RemoteHostTransferRequest, RemoteHostTransferResult } from './types.ts';
export type { RemoteHostAuthPrompt, RemoteHostAuthRequest, RemoteHostAuthSnapshot, RemoteHostBackend, RemoteHostConnectionSnapshot, RemoteHostFacts, RemoteHostKind, RemoteHostOutput, RemoteHostRunRequest, RemoteHostRunResult, RemoteHostRunSpec, RemoteHostSnapshot, RemoteHostSummary, RemoteHostTransferDirection, RemoteHostTransferRequest, RemoteHostTransferResult, RemoteHostTransport, } from './types.ts';
/** Opaque configured-host identity. */
export type RemoteHostId = RemoteHostIdBrand;
/** Opaque authentication attempt identity. */
export type RemoteHostAuthId = RemoteHostAuthIdBrand;
declare module '@deepseek-ai/cordis' {
    interface Context {
        remoteHosts: RemoteHostRegistry;
    }
}
/** Machine-routable remote-host service failures. */
export type RemoteHostErrorCode = 'AUTH_INVALID_RESPONSE' | 'AUTH_INTERACTIVE_REQUIRED' | 'AUTH_SESSION_BUSY' | 'AUTH_SESSION_NOT_FOUND' | 'DUPLICATE_HOST' | 'HOST_BUSY' | 'HOST_KEY_UNTRUSTED' | 'HOST_NOT_FOUND' | 'REMOVE_UNSUPPORTED' | 'SERVICE_DISPOSING' | 'TERMINAL_UNAVAILABLE' | 'TRANSFER_FAILED' | 'TRANSFER_PATH_INVALID' | 'TRANSFER_TOO_LARGE' | 'TRANSFER_UNSUPPORTED';
/** Failure carrying a stable remote-host service code. */
export declare class RemoteHostError extends Error {
    readonly code: RemoteHostErrorCode;
    /**
     * @param message - operator-facing failure description.
     * @param code - stable service failure code.
     * @param options - optional error cause.
     */
    constructor(message: string, code: RemoteHostErrorCode, options?: ErrorOptions);
}
/**
 * Brand one validated configuration key as a remote-host identity.
 * @param value - non-empty id admitted by the configuration parser.
 * @returns the unchanged string with the remote-host brand.
 */
export declare function RemoteHostId(value: string): RemoteHostIdBrand;
/**
 * Brand a registry-minted authentication attempt identity.
 * @param value - registry-issued authentication attempt id.
 * @returns the unchanged string with the authentication-id brand.
 */
export declare function RemoteHostAuthId(value: string): RemoteHostAuthIdBrand;
/** Effect-scoped registry and dispatch service for configured remote hosts. */
export declare class RemoteHostRegistry extends Service {
    private readonly backends;
    private readonly authSessions;
    private nextAuthId;
    private disposing;
    /**
     * Install the registry and its service-wide quiescent teardown.
     * @param ctx - owning Cordis context.
     */
    constructor(ctx: Context);
    /**
     * Register one configured backend for the calling plugin fiber.
     * @param backend - provider-owned host whose id must be unique.
     * @returns exact Cordis effect disposer that unpublishes and closes exactly this backend.
     */
    register(backend: RemoteHostBackend): () => Promise<void>;
    /**
     * Return fresh safe snapshots in provider registration order.
     * @returns configured hosts and their current connection states.
     */
    list(): RemoteHostSnapshot[];
    /**
     * Return one fresh safe snapshot.
     * @param id - configured host identity.
     * @returns configuration summary and current connection state.
     * @throws {RemoteHostError} `HOST_NOT_FOUND` when no provider owns the id.
     */
    status(id: RemoteHostIdBrand): RemoteHostSnapshot;
    /**
     * Establish or reuse one host connection.
     * @param id - configured host identity.
     * @param signal - caller cancellation while connection setup is unpublished.
     * @returns fresh state after the provider accepts the connection.
     */
    connect(id: RemoteHostIdBrand, signal?: AbortSignal): Promise<RemoteHostSnapshot>;
    /**
     * Open a native terminal for direct operator-driven authentication and provider-specific session handoff.
     * @param id - configured host identity.
     * @returns after the provider accepts the terminal launch request.
     */
    openTerminal(id: RemoteHostIdBrand): Promise<void>;
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
    remove(id: RemoteHostIdBrand): Promise<void>;
    /**
     * Start an asynchronous password or keyboard-interactive authentication attempt.
     * @param id - configured host identity.
     * @param request - operator-supplied password and connection-retention choices.
     * @returns the initial safe authentication state.
     */
    beginAuthentication(id: RemoteHostIdBrand, request: RemoteHostAuthRequest): RemoteHostAuthSnapshot;
    /**
     * Return the current safe state of one authentication attempt.
     * @param id - authentication attempt identity.
     * @returns current prompt or terminal state.
     */
    authenticationStatus(id: RemoteHostAuthIdBrand): RemoteHostAuthSnapshot;
    /**
     * Deliver keyboard-interactive answers to the pending SSH handshake.
     * @param id - authentication attempt identity.
     * @param responses - answers in the order requested by the SSH server.
     * @returns the pending state after the answers are delivered.
     */
    answerAuthentication(id: RemoteHostAuthIdBrand, responses: readonly string[]): RemoteHostAuthSnapshot;
    /**
     * Cancel one pending authentication attempt.
     * @param id - authentication attempt identity.
     */
    cancelAuthentication(id: RemoteHostAuthIdBrand): void;
    /**
     * Accept a provider-reported pending host key after a user confirmation.
     * @param id - configured host identity.
     * @returns the host snapshot after the provider records the pending key.
     */
    trustHostKey(id: RemoteHostIdBrand): Promise<RemoteHostSnapshot>;
    /**
     * Explicitly close one host connection and await cleanup.
     * @param id - configured host identity.
     * @param reason - operator or consumer reason for diagnostics.
     * @returns fresh disconnected state.
     */
    disconnect(id: RemoteHostIdBrand, reason: string): Promise<RemoteHostSnapshot>;
    /**
     * Inspect one host through its provider.
     * @param id - configured host identity.
     * @param signal - caller cancellation.
     * @returns partial typed basic facts.
     */
    inspect(id: RemoteHostIdBrand, signal?: AbortSignal): Promise<RemoteHostFacts>;
    /**
     * Apply the selected provider's execution defaults and caps.
     * @param request - raw foreground execution request.
     * @returns fully specified execution request.
     */
    resolve(request: RemoteHostRunRequest): RemoteHostRunSpec;
    /**
     * Execute one provider-resolved foreground request.
     * @param spec - result of {@link resolve}.
     * @returns bounded output and independent exit, timeout, and abort facts.
     */
    run(spec: RemoteHostRunSpec): Promise<RemoteHostRunResult>;
    /**
     * Upload one local file to a configured host through its provider.
     * @param request - target, absolute local and remote paths, and overwrite choice.
     * @returns transferred byte count, resolved paths, transport, and duration.
     * @throws {RemoteHostError} `TRANSFER_UNSUPPORTED` when the provider implements no transfer.
     */
    upload(request: RemoteHostTransferRequest): Promise<RemoteHostTransferResult>;
    /**
     * Download one remote file from a configured host through its provider.
     * @param request - target, absolute local and remote paths, and overwrite choice.
     * @returns transferred byte count, resolved paths, transport, and duration.
     * @throws {RemoteHostError} `TRANSFER_UNSUPPORTED` when the provider implements no transfer.
     */
    download(request: RemoteHostTransferRequest): Promise<RemoteHostTransferResult>;
    private dispatchTransfer;
    private assertActive;
    private expect;
    private disposeAll;
}
export default RemoteHostRegistry;
//# sourceMappingURL=index.d.ts.map