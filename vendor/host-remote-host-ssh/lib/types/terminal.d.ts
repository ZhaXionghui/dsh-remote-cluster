/** Shell-free argv construction for opening one configured SSH target in a native terminal. */
import { type NativeTerminalInternals } from '@deepseek-ai/dsh-native-command';
import { type ResolvedSshClient } from './ssh-client.ts';
/** Provider request for opening a new or already-authenticated control session. */
export type SshRemoteTerminalMode = 'create' | 'reuse';
/** Safe target fields needed by the native SSH terminal launcher. */
export interface SshRemoteTerminalTarget {
    /** Display name used as the Windows Terminal tab title. */
    readonly label: string;
    /** SSH hostname or address. */
    readonly hostname: string;
    /** SSH protocol port. */
    readonly port: number;
    /** Remote login principal. */
    readonly user: string;
    /** Optional local private-key path. */
    readonly identityFile?: string;
    /** Optional local SSH agent endpoint. */
    readonly agentSocket?: string;
    /** Provider-owned OpenSSH control socket used to reuse terminal authentication. */
    readonly controlPath?: string;
    /** Retention applied to the OpenSSH control master. */
    readonly controlPersistSeconds?: number;
    /** Keepalive interval for the OpenSSH control master. */
    readonly serverAliveIntervalSeconds?: number;
    /** Maximum unanswered keepalives before OpenSSH closes the master. */
    readonly serverAliveCountMax?: number;
    /** Whether this terminal creates or reuses the provider-owned control master. */
    readonly controlMasterMode?: SshRemoteTerminalMode;
    /** Local OpenSSH client that opens this terminal; defaults to the native client. */
    readonly client?: ResolvedSshClient;
}
/**
 * Build direct OpenSSH argv without including any password or MFA response.
 * @param target - validated SSH target fields used to construct the destination.
 * @returns direct OpenSSH arguments for the configured target.
 */
export declare function sshRemoteTerminalArgs(target: SshRemoteTerminalTarget): string[];
/**
 * Open a native terminal for one configured SSH target.
 * @param target - validated target summary and local authentication reference.
 * @param signal - cancellation checked before the terminal process is started.
 * @param internals - native-terminal platform and launcher seams for tests.
 * @returns after the operating system accepts the detached terminal launch.
 */
export declare function openSshRemoteTerminal(target: SshRemoteTerminalTarget, signal?: AbortSignal, internals?: NativeTerminalInternals): Promise<void>;
//# sourceMappingURL=terminal.d.ts.map