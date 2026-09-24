/** Remote hosts workbench surface with on-demand inspection and authentication. */
import { type ReactNode } from 'react';
import type { RemoteHostAuthId, RemoteHostAuthSnapshot, RemoteHostAuthenticationAnswer, RemoteHostAuthenticationRequest, RemoteHostInspectionView, RemoteHostSnapshot } from '@deepseek-ai/dsh-api-remotes/client';
import type { RemoteHostLocaleKey } from './locales.ts';
/** Registration-side Remote methods used by the panel. */
export interface RemoteHostsPanelInjected {
    /** Read a fresh safe host inventory. */
    list: () => Promise<RemoteHostSnapshot[]>;
    /** Inspect one host and return its post-operation connection state. */
    inspect: (hostId: string, signal?: AbortSignal) => Promise<RemoteHostInspectionView>;
    /** Start a user-owned password or MFA authentication attempt. */
    authenticate: (request: RemoteHostAuthenticationRequest) => Promise<RemoteHostAuthSnapshot>;
    /** Poll the safe state of one authentication attempt. */
    authenticationStatus: (authId: RemoteHostAuthId) => Promise<RemoteHostAuthSnapshot>;
    /** Submit one complete keyboard-interactive response set. */
    answerAuthentication: (request: RemoteHostAuthenticationAnswer) => Promise<RemoteHostAuthSnapshot>;
    /** Cancel one pending authentication attempt. */
    cancelAuthentication: (authId: RemoteHostAuthId) => Promise<void>;
    /** Open a Host-native SSH terminal that can create or reuse a provider-owned session. */
    openTerminal: (hostId: string) => Promise<void>;
    /** Establish or reuse the provider-owned connection; a ControlMaster default hands the login off to the terminal. */
    connect: (hostId: string, signal?: AbortSignal) => Promise<RemoteHostSnapshot>;
    /** Remove one configured host and its stored credential through the Host. */
    remove: (hostId: string) => Promise<void>;
}
/** Full props supplied by the registered right-workbench Tab. */
export interface RemoteHostsPanelProps extends RemoteHostsPanelInjected {
    /** Localized Remote host dictionary lookup. */
    t: (key: RemoteHostLocaleKey, params?: Record<string, string>) => string;
}
/** Render configured hosts and fetch basic information only when a row is opened or refreshed. */
export declare function RemoteHostsPanel({ list, inspect, authenticate, authenticationStatus, answerAuthentication, cancelAuthentication, openTerminal, connect, remove, t, }: RemoteHostsPanelProps): ReactNode;
//# sourceMappingURL=RemoteHostsPanel.d.ts.map