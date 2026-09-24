/** POSIX host-information probe and strict parser for the SSH provider. */
import type { RemoteHostFacts, RemoteHostId } from '@deepseek-ai/dsh-host-remote-host';
/** Fixed probe delivered through `sh -s`; every emitted value occupies one tab-delimited line. */
export declare const INSPECTION_SCRIPT: string;
/**
 * Parse independent probe rows so an invalid or unavailable fact does not discard its companions.
 * @param id - configured host identity.
 * @param output - bounded probe stdout.
 * @param observedAt - local observation timestamp.
 * @param latencyMs - complete probe round-trip.
 * @returns the safe partial fact record.
 */
export declare function parseRemoteHostFacts(id: RemoteHostId, output: string, observedAt: number, latencyMs: number): RemoteHostFacts;
//# sourceMappingURL=facts.d.ts.map