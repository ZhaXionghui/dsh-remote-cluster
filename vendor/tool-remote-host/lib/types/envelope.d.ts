/** Unified result envelope shared by every model-facing remote-host tool. */
import type { RemoteHostTransport } from '@deepseek-ai/dsh-host-remote-host';
/** Stable failure summary carried by one tool envelope. */
export interface EnvelopeError {
    /** Stable remote-host failure code, or the tool runtime's own code. */
    readonly code: string;
    /** Operator-facing failure description. */
    readonly message: string;
}
/** Non-sensitive execution diagnostics attached to every tool envelope. */
export interface EnvelopeMeta {
    /** Tool name that produced this result. */
    readonly tool: string;
    /** Configured target identity when the tool selected one. */
    readonly host_id?: string;
    /** Complete tool duration in milliseconds. */
    readonly duration_ms: number;
    /** Connection path that carried the operation, when the provider published one. */
    readonly transport?: RemoteHostTransport;
    /** Transferred byte count for a transfer tool. */
    readonly bytes?: number;
    /** Item count for an inventory tool. */
    readonly count?: number;
}
/** One unified envelope wrapping every `remote_host_*` tool result. */
export interface ToolEnvelope<T> {
    /** Whether the operation completed without a stable failure. */
    readonly success: boolean;
    /** Short outcome summary; the failure message when `success` is false. */
    readonly message: string;
    /** Tool-specific payload, or null on failure. */
    readonly data: T | null;
    /** Stable failure summary, or null on success. */
    readonly error: EnvelopeError | null;
    /** Non-sensitive execution diagnostics. */
    readonly meta: EnvelopeMeta;
}
/**
 * Run one tool operation and wrap its outcome in the unified envelope.
 *
 * A stable failure becomes an in-band `success: false` result so the model
 * reads the same five fields for every remote-host tool. Cancellation is not a
 * domain failure, so a {@link TOOL_ABORTED} code keeps propagating to the tool
 * runtime instead of being flattened into a success envelope.
 * @param tool - tool name recorded in `meta.tool`.
 * @param run - the operation to execute.
 * @param meta - additional diagnostics, either fixed or derived from the resolved payload.
 * @returns the envelope for the operation's outcome.
 */
export declare function withEnvelope<T>(tool: string, run: () => Promise<T>, meta?: Partial<EnvelopeMeta> | ((value: T) => Partial<EnvelopeMeta>)): Promise<ToolEnvelope<T>>;
//# sourceMappingURL=envelope.d.ts.map