/** Typert Remote Consumer for configured remote hosts and user-driven authentication. */
import type { Context } from '@deepseek-ai/cordis';
import type { RemoteHostAuthSnapshot, RemoteHostSnapshot } from '@deepseek-ai/dsh-host-remote-host/types';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { RemoteHostInspectionView } from './types.ts';
import type { RemoteHostAuthenticationAnswer, RemoteHostAuthenticationRequest } from './types.ts';
export type * from './types.ts';
/** Remote-only service exposing safe inventory and on-demand basic facts. */
export declare class RemoteHostController extends TypertRemoteService {
    static inject: string[];
    /** @param ctx - Host context carrying the provider-neutral remote-host registry. */
    constructor(ctx: Context);
    /**
     * Read the current configured-host projection without establishing a connection.
     * @returns current safe host summaries and connection states in registration order.
     */
    list(): Promise<RemoteHostSnapshot[]>;
    /**
     * Collect partial basic facts and return the post-operation idle state.
     * @param hostId - configured target identity from a preceding list result.
     * @param signal - carrier cancellation, always the final parameter.
     * @returns partial facts plus a fresh safe host snapshot.
     */
    inspect(hostId: string, signal: AbortSignal): Promise<RemoteHostInspectionView>;
    /**
     * Open a Host-native SSH terminal that can create or reuse a provider-owned session.
     * @param hostId - configured target identity from a preceding list result.
     * @returns after the operating system accepts the detached terminal launch.
     */
    openTerminal(hostId: string): Promise<void>;
    /**
     * Remove one configured host and its provider-owned stored credential.
     *
     * The provider owns the durable delete and its own unpublish, so this method
     * only maps the provider-neutral failure vocabulary onto the browser-safe one.
     * @param hostId - configured target identity from a preceding list result.
     */
    delete(hostId: string): Promise<void>;
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
    connect(hostId: string, signal: AbortSignal): Promise<RemoteHostSnapshot>;
    /**
     * Start a Host-owned password or keyboard-interactive authentication attempt.
     * @param request - browser-supplied authentication mode, retention, and optional password.
     * @returns safe pending or terminal authentication state.
     */
    authenticate(request: RemoteHostAuthenticationRequest): RemoteHostAuthSnapshot;
    /**
     * Return the current prompt or terminal state for an authentication attempt.
     * @param authId - authentication attempt identity returned by {@link authenticate}.
     * @returns safe prompt or terminal authentication state.
     */
    authenticationStatus(authId: string): RemoteHostAuthSnapshot;
    /**
     * Submit the current keyboard-interactive response set.
     * @param request - authentication attempt identity and ordered responses.
     * @returns the safe pending or terminal state after submission.
     */
    answerAuthentication(request: RemoteHostAuthenticationAnswer): RemoteHostAuthSnapshot;
    /**
     * Cancel a pending authentication attempt.
     * @param authId - authentication attempt identity returned by {@link authenticate}.
     */
    cancelAuthentication(authId: string): void;
}
export default RemoteHostController;
//# sourceMappingURL=index.d.ts.map