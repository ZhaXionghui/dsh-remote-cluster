/** Single-file transfer validation and the `ssh2` SFTP bridge used by the SSH provider. */
import { RemoteHostError, type RemoteHostId, type RemoteHostTransferDirection, type RemoteHostTransferRequest, type RemoteHostTransferResult } from '@deepseek-ai/dsh-host-remote-host';
import type { Client } from 'ssh2';
/** Minimal single-file SFTP surface consumed by the provider; the native `ssh2` wrapper adapts to it. */
export interface SftpTransferClient {
    /** Size in bytes of one remote regular file, or undefined when it is absent or unreadable. */
    statSize(remotePath: string): Promise<number | undefined>;
    /** Copy one local file to a remote path, replacing the destination. */
    put(localPath: string, remotePath: string): Promise<void>;
    /** Copy one remote file to a local path, replacing the destination. */
    get(remotePath: string, localPath: string): Promise<void>;
    /** Release the SFTP channel. */
    end(): void;
}
/** Resolved transfer bounds applied by the provider before and after the copy. */
export interface SftpTransferLimits {
    /** Maximum accepted file size in bytes. */
    readonly maxTransferBytes: number;
    /** Complete-copy deadline in milliseconds. */
    readonly timeoutMs: number;
    /** Caller cancellation. */
    readonly signal?: AbortSignal;
}
/**
 * Wrap one copy-stage failure so a transport-layer error never becomes the
 * caller's stable failure code.
 *
 * `ssh2` and `scp` reject with their own `code` (for example `EACCES` or
 * `ETIMEDOUT`) and a message naming local transport internals. Re-throwing one
 * verbatim lets that vocabulary leak into the unified tool envelope, where a
 * model would have to branch on transport errno instead of a service code, so
 * the copy stage reports one stable `TRANSFER_FAILED` and keeps the original
 * failure only as the error `cause`.
 * @param cause - the raw transport failure that aborted the copy.
 * @returns a {@link RemoteHostError} carrying `TRANSFER_FAILED`.
 */
export declare function transferCopyFailure(cause: unknown): RemoteHostError;
/**
 * Reject a request whose local or remote path cannot be addressed without a shell.
 * @param request - caller transfer request carrying both paths.
 * @throws {RemoteHostError} `TRANSFER_PATH_INVALID` for a relative, empty, or control-character path.
 */
export declare function assertTransferPaths(request: Pick<RemoteHostTransferRequest, 'localPath' | 'remotePath'>): void;
/**
 * Reject a remote path the ControlMaster `scp` route cannot hand over safely.
 *
 * The `ssh2`/SFTP route is exempt on purpose: it names files through the SFTP
 * protocol, so whitespace and shell syntax are ordinary filename bytes there
 * and restricting them would cost real capability for no gain.
 * @param remotePath - absolute POSIX remote file path.
 * @throws {RemoteHostError} `TRANSFER_PATH_INVALID` for whitespace, a control
 * character, or any character a POSIX shell reinterprets.
 */
export declare function assertScpRemotePath(remotePath: string): void;
/**
 * Reject a planned or observed byte count outside the configured cap.
 * @param bytes - file size in bytes.
 * @param maxTransferBytes - configured maximum accepted size.
 * @throws {RemoteHostError} `TRANSFER_TOO_LARGE` above the cap, `TRANSFER_PATH_INVALID` for a non-integer size.
 */
export declare function assertWithinTransferLimit(bytes: number, maxTransferBytes: number): void;
/**
 * Read the size of one readable local regular file.
 * @param localPath - absolute local file path.
 * @returns size in bytes.
 * @throws {RemoteHostError} `TRANSFER_PATH_INVALID` when the path is missing, unreadable, or not a regular file.
 */
export declare function localFileBytes(localPath: string): number;
/**
 * Adapt one `ssh2` SFTP channel to the provider's single-file surface.
 * @param client - an authenticated `ssh2` client.
 * @returns the resolved adapter, or a rejection when the channel cannot be opened.
 */
export declare function createSsh2Sftp(client: Client): Promise<SftpTransferClient>;
/**
 * Perform one bounded single-file transfer over an already-authenticated SFTP channel.
 * @param sftp - provider-owned SFTP adapter; the caller closes it.
 * @param direction - upload or download.
 * @param request - resolved target paths, overwrite choice, and caller cancellation.
 * @param limits - byte cap, deadline, and caller cancellation.
 * @returns the ssh2-labelled transfer outcome.
 */
export declare function runSftpTransfer(sftp: SftpTransferClient, direction: RemoteHostTransferDirection, request: RemoteHostTransferRequest, limits: SftpTransferLimits): Promise<RemoteHostTransferResult>;
/**
 * Assemble one completed transfer outcome.
 * @param hostId - configured target identity.
 * @param direction - direction actually attempted.
 * @param bytes - transferred size in bytes.
 * @param request - resolved target paths.
 * @param transport - connection path that carried the copy.
 * @param startedAt - epoch milliseconds when the copy was accepted.
 * @returns the provider-neutral transfer result.
 */
export declare function transferResult(hostId: RemoteHostId, direction: RemoteHostTransferDirection, bytes: number, request: Pick<RemoteHostTransferRequest, 'localPath' | 'remotePath'>, transport: RemoteHostTransferResult['transport'], startedAt: number): RemoteHostTransferResult;
//# sourceMappingURL=transfer.d.ts.map