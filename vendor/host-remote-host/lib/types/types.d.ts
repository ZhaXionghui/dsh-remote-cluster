/** Provider-neutral values for configured remote hosts, live connections, inspection, bounded execution, and single-file transfer. */
import type { Branded } from '@deepseek-ai/dsh-brand';
/** Opaque configured-host identity. */
export type RemoteHostId = Branded<'RemoteHostId'>;
/** Opaque identity for one interactive SSH authentication attempt. */
export type RemoteHostAuthId = Branded<'RemoteHostAuthId'>;
/** Operator-facing role of a configured SSH target. */
export type RemoteHostKind = 'server' | 'cluster';
/** Connection path currently carrying one configured host. */
export type RemoteHostTransport = 'ssh2' | 'control-master';
/** Direction of one single-file transfer. */
export type RemoteHostTransferDirection = 'upload' | 'download';
/** Safe configured facts returned to tools and browser clients. */
export interface RemoteHostSummary {
    /** Stable configured identity. */
    readonly id: RemoteHostId;
    /** Operator-facing name. */
    readonly label: string;
    /** Whether the target is a server or a cluster login node. */
    readonly kind: RemoteHostKind;
    /** Configured network hostname, without credentials. */
    readonly hostname: string;
    /** Configured SSH port. */
    readonly port: number;
    /** Configured login name, when one is explicit. */
    readonly user?: string;
}
/** Live lifecycle state of one configured host connection. */
export type RemoteHostConnectionSnapshot = {
    readonly state: 'disconnected';
} | {
    readonly state: 'connecting';
} | {
    readonly state: 'connected-active';
    readonly connectedAt: number;
    readonly activeLeases: number;
    readonly transport: RemoteHostTransport;
} | {
    readonly state: 'connected-idle';
    readonly connectedAt: number;
    readonly reclaimAt: number;
    readonly transport: RemoteHostTransport;
} | {
    readonly state: 'closing';
    readonly connectedAt: number;
} | {
    readonly state: 'failed';
    readonly failedAt: number;
    readonly message: string;
};
/** Safe current view of one configured host. */
export interface RemoteHostSnapshot extends RemoteHostSummary {
    /** Current provider lifecycle state. */
    readonly connection: RemoteHostConnectionSnapshot;
}
/** One SSH keyboard-interactive challenge projected to the operator after automatic password responses are removed. */
export interface RemoteHostAuthPrompt {
    /** Optional server-provided display title. */
    readonly name: string;
    /** Optional server-provided instructions. */
    readonly instructions: string;
    /** Prompts in the order expected by the SSH server. */
    readonly prompts: readonly {
        readonly prompt: string;
        readonly echo: boolean;
    }[];
}
/** Authentication request accepted by the Host provider; the password is never returned. */
export interface RemoteHostAuthRequest {
    /** One-time password supplied by the operator, when needed. */
    readonly password?: string;
    /** Store the supplied password in the provider-managed credential store after success. */
    readonly persistPassword?: boolean;
    /** Idle retention selected for this authenticated connection. */
    readonly connectionDurationMs?: number;
}
/** Safe state of one interactive SSH authentication attempt. */
export type RemoteHostAuthSnapshot = {
    readonly id: RemoteHostAuthId;
    readonly hostId: RemoteHostId;
    readonly state: 'pending';
} | {
    readonly id: RemoteHostAuthId;
    readonly hostId: RemoteHostId;
    readonly state: 'prompt';
    readonly prompt: RemoteHostAuthPrompt;
} | {
    readonly id: RemoteHostAuthId;
    readonly hostId: RemoteHostId;
    readonly state: 'connected';
    readonly host: RemoteHostSnapshot;
} | {
    readonly id: RemoteHostAuthId;
    readonly hostId: RemoteHostId;
    readonly state: 'failed';
    readonly message: string;
} | {
    readonly id: RemoteHostAuthId;
    readonly hostId: RemoteHostId;
    readonly state: 'cancelled';
};
/** Partial basic facts collected from one POSIX remote host. */
export interface RemoteHostFacts {
    /** Configured host identity. */
    readonly id: RemoteHostId;
    /** Host clock timestamp when inspection completed. */
    readonly observedAt: number;
    /** Complete inspection round-trip in milliseconds. */
    readonly latencyMs: number;
    /** Remote hostname reported by the operating system. */
    readonly hostname?: string;
    /** Operating-system display label. */
    readonly operatingSystem?: string;
    /** Kernel name and release. */
    readonly kernel?: string;
    /** Machine architecture. */
    readonly architecture?: string;
    /** Uptime in whole seconds. */
    readonly uptimeSeconds?: number;
    /** One-, five-, and fifteen-minute load averages. */
    readonly loadAverage?: readonly [number, number, number];
    /** Online logical processor count. */
    readonly logicalCpuCount?: number;
    /** Total physical memory in bytes. */
    readonly memoryTotalBytes?: number;
    /** Currently available physical memory in bytes. */
    readonly memoryAvailableBytes?: number;
    /** Root filesystem size in bytes. */
    readonly rootDiskTotalBytes?: number;
    /** Root filesystem used bytes. */
    readonly rootDiskUsedBytes?: number;
}
/** Caller request before the provider applies execution defaults and caps. */
export interface RemoteHostRunRequest {
    /** Configured target. */
    readonly hostId: RemoteHostId;
    /** POSIX command string delivered to the remote shell through stdin. */
    readonly command: string;
    /** Requested deadline in milliseconds. */
    readonly timeoutMs?: number;
    /** Caller cancellation. */
    readonly signal?: AbortSignal;
}
/** Fully resolved execution specification accepted by a provider. */
export interface RemoteHostRunSpec {
    /** Configured target. */
    readonly hostId: RemoteHostId;
    /** POSIX command string delivered to the remote shell through stdin. */
    readonly command: string;
    /** Positive finite execution deadline in milliseconds. */
    readonly timeoutMs: number;
    /** Positive byte limit applied independently to stdout and stderr. */
    readonly maxOutputBytes: number;
    /** Caller cancellation. */
    readonly signal?: AbortSignal;
}
/** One bounded remote stream. */
export interface RemoteHostOutput {
    /** Retained UTF-8 text. */
    readonly text: string;
    /** Whether bytes outside the retained result were discarded. */
    readonly truncated: boolean;
}
/** Completed foreground execution outcome. */
export interface RemoteHostRunResult {
    /** Configured target. */
    readonly hostId: RemoteHostId;
    /** Remote SSH process exit code. */
    readonly exitCode: number | null;
    /** Remote SSH process terminating signal. */
    readonly signal: string | null;
    /** Whether the provider-owned deadline caused termination. */
    readonly timedOut: boolean;
    /** Whether caller cancellation caused termination. */
    readonly aborted: boolean;
    /** Bounded standard output. */
    readonly stdout: RemoteHostOutput;
    /** Bounded standard error. */
    readonly stderr: RemoteHostOutput;
}
/** Caller request for one single-file transfer over an existing or reusable connection. */
export interface RemoteHostTransferRequest {
    /** Configured target. */
    readonly hostId: RemoteHostId;
    /** Absolute local file path; read for an upload and written for a download. */
    readonly localPath: string;
    /** Absolute POSIX remote file path; written for an upload and read for a download. */
    readonly remotePath: string;
    /** Replace an existing destination; defaults to false. */
    readonly overwrite?: boolean;
    /** Requested deadline in milliseconds. */
    readonly timeoutMs?: number;
    /** Caller cancellation. */
    readonly signal?: AbortSignal;
}
/** Completed single-file transfer outcome. */
export interface RemoteHostTransferResult {
    /** Configured target. */
    readonly hostId: RemoteHostId;
    /** Transfer direction actually attempted. */
    readonly direction: RemoteHostTransferDirection;
    /** Transferred file size in bytes. */
    readonly bytes: number;
    /** Local file path from the request. */
    readonly localPath: string;
    /** Remote POSIX file path from the request. */
    readonly remotePath: string;
    /** Connection path that carried the transfer. */
    readonly transport: RemoteHostTransport;
    /** Complete transfer round-trip in milliseconds. */
    readonly durationMs: number;
}
/** One provider-owned configured host registered with the service. */
export interface RemoteHostBackend {
    /** Safe stable configuration summary. */
    readonly summary: RemoteHostSummary;
    /** Return a fresh lifecycle snapshot. */
    snapshot(): RemoteHostConnectionSnapshot;
    /** Establish or reuse the background connection. */
    connect(signal?: AbortSignal): Promise<void>;
    /** Start one interactive authentication attempt with operator-supplied answers. */
    authenticate(request: RemoteHostAuthRequest & {
        readonly signal?: AbortSignal;
    }, onPrompt: (prompt: RemoteHostAuthPrompt) => Promise<readonly string[]>): Promise<void>;
    /** Open a user-visible terminal that may create or reuse a provider-owned SSH session. */
    openTerminal?(): Promise<void>;
    /** Accept the currently pending server key after an explicit user confirmation. */
    trustHostKey?(): Promise<void>;
    /**
     * Remove this host from its provider's durable configuration and release it.
     *
     * The provider owns the durable write: it filters the host out of its
     * configuration, reconciles (which disposes and unpublishes this backend via
     * its own registration effect), and deletes any stored credential record.
     * Omitted by a provider that cannot remove a configured host; the registry
     * then refuses with `REMOVE_UNSUPPORTED`.
     */
    remove?(): Promise<void>;
    /** Transfer one single file through the provider's existing connection path. */
    transfer?(direction: RemoteHostTransferDirection, request: RemoteHostTransferRequest): Promise<RemoteHostTransferResult>;
    /** Close the background connection and await complete cleanup. */
    disconnect(reason: string): Promise<void>;
    /** Collect partial basic host facts. */
    inspect(signal?: AbortSignal): Promise<RemoteHostFacts>;
    /** Apply provider defaults and caps before execution. */
    resolve(request: RemoteHostRunRequest): RemoteHostRunSpec;
    /** Execute one fully resolved request. */
    run(spec: RemoteHostRunSpec): Promise<RemoteHostRunResult>;
    /** Reject new work, close the connection, and await complete cleanup; repeated calls are safe. */
    dispose(): Promise<void>;
}
//# sourceMappingURL=types.d.ts.map