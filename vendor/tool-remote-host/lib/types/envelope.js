/** Unified result envelope shared by every model-facing remote-host tool. */
import { TOOL_ABORTED } from '@deepseek-ai/dsh-tools';
/** Extract one stable failure code from a thrown value. */
function errorCode(error) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
        const { code } = error;
        if (typeof code === 'string' && code.length > 0)
            return code;
    }
    return 'TOOL_ERROR';
}
/** Extract one operator-facing failure message from a thrown value. */
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
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
export async function withEnvelope(tool, run, meta) {
    const startedAt = Date.now();
    try {
        const value = await run();
        const extra = typeof meta === 'function' ? meta(value) : meta;
        return {
            success: true,
            message: `${tool} succeeded`,
            data: value,
            error: null,
            meta: { tool, ...extra, duration_ms: Date.now() - startedAt },
        };
    }
    catch (error) {
        if (errorCode(error) === TOOL_ABORTED)
            throw error;
        const extra = typeof meta === 'function' ? undefined : meta;
        return {
            success: false,
            message: errorMessage(error),
            data: null,
            error: { code: errorCode(error), message: errorMessage(error) },
            meta: { tool, ...extra, duration_ms: Date.now() - startedAt },
        };
    }
}
//# sourceMappingURL=envelope.js.map