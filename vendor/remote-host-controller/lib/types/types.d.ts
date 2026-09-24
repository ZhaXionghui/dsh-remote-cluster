/** Client-safe Remote views for configured remote hosts. */
import type { RemoteHostAuthId, RemoteHostAuthRequest, RemoteHostFacts as ProviderRemoteHostFacts, RemoteHostSnapshot } from '@deepseek-ai/dsh-host-remote-host/types';
export type { RemoteHostAuthId, RemoteHostAuthPrompt, RemoteHostAuthRequest, RemoteHostAuthSnapshot, RemoteHostConnectionSnapshot, RemoteHostId, RemoteHostKind, RemoteHostSnapshot, RemoteHostSummary, RemoteHostTransferDirection, RemoteHostTransferResult, RemoteHostTransport, } from '@deepseek-ai/dsh-host-remote-host/types';
/** Basic facts for one configured remote machine; named distinctly from the API carrier Host facts. */
export type RemoteMachineFacts = ProviderRemoteHostFacts;
/** Host facts returned together with the connection state after inspection releases its lease. */
export interface RemoteHostInspectionView {
    /** Partial basic facts collected by the configured provider. */
    readonly facts: RemoteMachineFacts;
    /** Fresh safe host state after inspection completed. */
    readonly host: RemoteHostSnapshot;
}
/** Client request for a user-driven SSH authentication attempt. */
export interface RemoteHostAuthenticationRequest extends RemoteHostAuthRequest {
    /** Configured host id. */
    readonly hostId: string;
}
/** Client request carrying one keyboard-interactive answer set. */
export interface RemoteHostAuthenticationAnswer {
    /** Authentication attempt id returned by `authenticate`. */
    readonly authId: RemoteHostAuthId;
    /** Answers matching the current SSH prompt order. */
    readonly responses: readonly string[];
}
/**
 * Browser-safe failure vocabulary of the configured remote hosts.
 *
 * Declared beside the client-safe views rather than the Host controller so the
 * Client compilation face (which reads this module through `/types`) can branch
 * on the exact code instead of matching message text.
 */
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface RemoteErrorDetailsMap {
        /** No configured remote host carries the requested id. */
        'remote-host/not-found': {
            readonly hostId: string;
        };
        /** The configured provider could not inspect the selected host. */
        'remote-host/unavailable': {
            readonly hostId: string;
        };
        /** The configured provider could not open a native interactive terminal. */
        'remote-host/terminal-unavailable': {
            readonly hostId: string;
        };
        /** The configured provider requires an interactive native-terminal login first. */
        'remote-host/interactive-login-required': {
            readonly hostId: string;
        };
        /** The configured provider cannot remove a configured host. */
        'remote-host/remove-unsupported': {
            readonly hostId: string;
        };
    }
}
//# sourceMappingURL=types.d.ts.map