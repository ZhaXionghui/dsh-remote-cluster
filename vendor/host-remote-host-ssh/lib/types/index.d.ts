/** `ssh2` Service Provider for the DSH remote-host capability. */
import type { Context } from '@deepseek-ai/cordis';
import type { RemoteHostKind } from '@deepseek-ai/dsh-host-remote-host';
import z from '@deepseek-ai/schemastery';
import type { SshRemoteHostLimits } from './provider.ts';
import { type SshClientChoice } from './ssh-client.ts';
export { SshRemoteHostBackend } from './provider.ts';
export type { SshRemoteHostBackendOptions, SshRemoteHostLimits } from './provider.ts';
export { openSshRemoteTerminal, sshRemoteTerminalArgs } from './terminal.ts';
export type { SshRemoteTerminalMode, SshRemoteTerminalTarget } from './terminal.ts';
/** Host configuration writer exposed to the model-facing Consumer. */
export interface RemoteHostSshConfigWriter {
    /**
     * Persist one host and activate it in the provider registry.
     * @param host - validated SSH host configuration with one local authentication reference or password mode.
     * @returns the safe host summary published by the remote-host registry.
     */
    createHost(host: SshRemoteHostConfig): Promise<RemoteHostSshHostView>;
}
/** Safe result returned after a conversational host configuration is stored. */
export interface RemoteHostSshHostView {
    readonly id: string;
    readonly label: string;
    readonly kind: RemoteHostKind;
    readonly hostname: string;
    readonly port: number;
    readonly user: string;
}
/** One configured SSH target and exactly one authentication source. */
export interface SshRemoteHostConfig {
    /** Stable service identity. */
    readonly id: string;
    /** Operator-facing display name. */
    readonly label: string;
    /** Server or cluster login-node classification. */
    readonly kind?: RemoteHostKind;
    /** DNS name or IP address. */
    readonly hostname: string;
    /** SSH protocol port. */
    readonly port?: number;
    /** Remote login principal. */
    readonly user: string;
    /** Optional trusted server host-key SHA-256 hash; omitted until the user confirms the first key. */
    readonly hostKeySha256?: string;
    /** Local private-key file read once during plugin startup. */
    readonly identityFile?: string;
    /** SSH agent socket path or `pageant` on Windows. */
    readonly agentSocket?: string;
    /** Select password-based authentication without placing the password in settings. */
    readonly passwordAuth?: boolean;
    /** Per-host override for the password-only ControlMaster default. */
    readonly controlMaster?: boolean;
    /** Per-host ControlMaster retention in seconds. */
    readonly controlPersistSeconds?: number;
}
/** Provider inventory and lifecycle limits, all configurable through `cordis.yml`. */
export interface Config extends Partial<SshRemoteHostLimits> {
    /** Fixed target inventory owned by this provider fiber. */
    readonly hosts: SshRemoteHostConfig[];
    /** Prefer the OpenSSH ControlMaster path for password-only targets; defaults to true. */
    readonly passwordControlMaster?: boolean;
    /** ControlMaster retention in seconds; defaults to 900, matching the source HSAgent configuration. */
    readonly controlPersistSeconds?: number;
    /** Local OpenSSH client that owns provider multiplexing; defaults to `auto`. */
    readonly sshClient?: SshClientChoice;
    /** WSL distribution used when the resolved client is the WSL client. */
    readonly wslDistro?: string;
}
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "remote-host-ssh";
/** Remote-host registry required before provider registration. */
export declare const inject: string[];
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Host-side writer used by the conversational remote-host Consumer. */
        remoteHostSshConfig: RemoteHostSshConfigWriter;
    }
}
/** Loader schema with explicit, deployment-overridable defaults. */
export declare const Config: z<Config>;
/**
 * Validate the complete inventory, load private keys, and register one backend per host.
 * @param ctx - Cordis context carrying the remote-host registry.
 * @param config - loader-populated provider configuration.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map