/** Single-file transfer validation and the `ssh2` SFTP bridge used by the SSH provider. */
import { existsSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { RemoteHostError, } from '../../../host-remote-host/lib/index.js';
const POSIX_ABSOLUTE = /^\//;
function abortError(signal) {
    return signal.reason instanceof Error
        ? signal.reason
        : new DOMException('The operation was aborted', 'AbortError');
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
export function transferCopyFailure(cause) {
    return new RemoteHostError('file transfer failed', 'TRANSFER_FAILED', { cause });
}
/**
 * Reject a request whose local or remote path cannot be addressed without a shell.
 * @param request - caller transfer request carrying both paths.
 * @throws {RemoteHostError} `TRANSFER_PATH_INVALID` for a relative, empty, or control-character path.
 */
export function assertTransferPaths(request) {
    const { localPath, remotePath } = request;
    if (localPath.length === 0 || localPath.includes('\0') || localPath.includes('\n') || !isAbsolute(localPath)) {
        throw new RemoteHostError('transfer local_path must be a non-empty absolute path without NUL or newline', 'TRANSFER_PATH_INVALID');
    }
    if (remotePath.length === 0 || remotePath.includes('\0') || remotePath.includes('\n') || !POSIX_ABSOLUTE.test(remotePath)) {
        throw new RemoteHostError('transfer remote_path must be a non-empty absolute POSIX path without NUL or newline', 'TRANSFER_PATH_INVALID');
    }
}
/**
 * Characters the ControlMaster route can accept in one remote path.
 *
 * `scp` hands the path to the remote side as an unquoted operand, and the
 * OpenSSH dialect in force decides what that side does with it: OpenSSH 9.0 and
 * later drive the SFTP protocol end to end, while older releases and legacy
 * modes still run `scp -t <path>` through the remote login shell. Quoting is
 * not a fix — under the SFTP dialect the quote characters become literal path
 * bytes and break ordinary names — so the route admits only path-safe
 * characters and fails closed on everything a POSIX shell could reinterpret.
 */
const SCP_SAFE_REMOTE_PATH = /^[A-Za-z0-9/._+\-=@%,~:]+$/u;
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
export function assertScpRemotePath(remotePath) {
    if (!SCP_SAFE_REMOTE_PATH.test(remotePath)) {
        throw new RemoteHostError(`transfer remote path "${remotePath}" must not contain whitespace, control, or shell-syntax characters: the ControlMaster route passes it to scp unquoted, so only path-safe characters are accepted`, 'TRANSFER_PATH_INVALID');
    }
}
/**
 * Reject a planned or observed byte count outside the configured cap.
 * @param bytes - file size in bytes.
 * @param maxTransferBytes - configured maximum accepted size.
 * @throws {RemoteHostError} `TRANSFER_TOO_LARGE` above the cap, `TRANSFER_PATH_INVALID` for a non-integer size.
 */
export function assertWithinTransferLimit(bytes, maxTransferBytes) {
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
        throw new RemoteHostError('transfer byte count must be a non-negative safe integer', 'TRANSFER_PATH_INVALID');
    }
    if (bytes > maxTransferBytes) {
        throw new RemoteHostError(`transfer of ${bytes} bytes exceeds the configured limit of ${maxTransferBytes} bytes`, 'TRANSFER_TOO_LARGE');
    }
}
/**
 * Read the size of one readable local regular file.
 * @param localPath - absolute local file path.
 * @returns size in bytes.
 * @throws {RemoteHostError} `TRANSFER_PATH_INVALID` when the path is missing, unreadable, or not a regular file.
 */
export function localFileBytes(localPath) {
    let stats;
    try {
        stats = statSync(localPath);
    }
    catch (cause) {
        throw new RemoteHostError(`transfer local path "${localPath}" is not readable`, 'TRANSFER_PATH_INVALID', { cause });
    }
    if (!stats.isFile()) {
        throw new RemoteHostError(`transfer local path "${localPath}" is not a regular file`, 'TRANSFER_PATH_INVALID');
    }
    return stats.size;
}
/**
 * Adapt one `ssh2` SFTP channel to the provider's single-file surface.
 * @param client - an authenticated `ssh2` client.
 * @returns the resolved adapter, or a rejection when the channel cannot be opened.
 */
export async function createSsh2Sftp(client) {
    const sftp = await new Promise((resolve, reject) => {
        client.sftp((error, opened) => {
            if (error === undefined)
                resolve(opened);
            else
                reject(error);
        });
    });
    return {
        statSize: async (remotePath) => await new Promise((resolve) => {
            sftp.stat(remotePath, (error, stats) => {
                // A failed stat cannot distinguish a missing file from an unreadable
                // one; callers treat "unknown" as absent and the copy fails loudly.
                if (error === undefined)
                    resolve(stats.size);
                else
                    resolve(undefined);
            });
        }),
        put: async (localPath, remotePath) => await new Promise((resolve, reject) => {
            sftp.fastPut(localPath, remotePath, (error) => {
                if (error === undefined || error === null)
                    resolve();
                else
                    reject(error);
            });
        }),
        get: async (remotePath, localPath) => await new Promise((resolve, reject) => {
            sftp.fastGet(remotePath, localPath, (error) => {
                if (error === undefined || error === null)
                    resolve();
                else
                    reject(error);
            });
        }),
        end: () => { sftp.end(); },
    };
}
/** Reject one operation when its deadline or the caller's signal settles first. */
async function raceDeadline(operation, limits) {
    // A throwaway signal keeps the listener wiring single-pathed: the caller's
    // signal is used when present, and an un-abortable stand-in otherwise.
    const { signal = new AbortController().signal, timeoutMs } = limits;
    if (signal.aborted)
        throw abortError(signal);
    return await new Promise((resolve, reject) => {
        let settled = false;
        const onAbort = () => {
            finish(() => reject(abortError(signal)));
        };
        const finish = (settle) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            settle();
        };
        const timer = setTimeout(() => {
            finish(() => reject(new Error(`file transfer exceeded its ${timeoutMs} ms deadline`)));
        }, timeoutMs);
        timer.unref();
        signal.addEventListener('abort', onAbort, { once: true });
        void operation.then((value) => { finish(() => resolve(value)); }, (error) => { finish(() => reject(error instanceof Error ? error : new Error(String(error)))); });
    });
}
/** Validate, size-check, and perform one single-file copy over SFTP. */
async function planSftpTransfer(sftp, direction, request, limits) {
    if (direction === 'upload') {
        const bytes = localFileBytes(request.localPath);
        assertWithinTransferLimit(bytes, limits.maxTransferBytes);
        if (request.overwrite !== true && await sftp.statSize(request.remotePath) !== undefined) {
            throw new RemoteHostError(`transfer remote path "${request.remotePath}" already exists and overwrite was not requested`, 'TRANSFER_PATH_INVALID');
        }
        try {
            await sftp.put(request.localPath, request.remotePath);
        }
        catch (cause) {
            throw transferCopyFailure(cause);
        }
        return bytes;
    }
    if (request.overwrite !== true && existsSync(request.localPath)) {
        throw new RemoteHostError(`transfer local path "${request.localPath}" already exists and overwrite was not requested`, 'TRANSFER_PATH_INVALID');
    }
    const bytes = await sftp.statSize(request.remotePath);
    if (bytes === undefined) {
        throw new RemoteHostError(`transfer remote path "${request.remotePath}" is not a readable file`, 'TRANSFER_PATH_INVALID');
    }
    assertWithinTransferLimit(bytes, limits.maxTransferBytes);
    try {
        await sftp.get(request.remotePath, request.localPath);
    }
    catch (cause) {
        throw transferCopyFailure(cause);
    }
    return bytes;
}
/**
 * Perform one bounded single-file transfer over an already-authenticated SFTP channel.
 * @param sftp - provider-owned SFTP adapter; the caller closes it.
 * @param direction - upload or download.
 * @param request - resolved target paths, overwrite choice, and caller cancellation.
 * @param limits - byte cap, deadline, and caller cancellation.
 * @returns the ssh2-labelled transfer outcome.
 */
export async function runSftpTransfer(sftp, direction, request, limits) {
    assertTransferPaths(request);
    if (limits.signal?.aborted === true)
        throw abortError(limits.signal);
    const startedAt = Date.now();
    const bytes = await raceDeadline(planSftpTransfer(sftp, direction, request, limits), limits);
    return transferResult(request.hostId, direction, bytes, request, 'ssh2', startedAt);
}
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
export function transferResult(hostId, direction, bytes, request, transport, startedAt) {
    return {
        hostId,
        direction,
        bytes,
        localPath: request.localPath,
        remotePath: request.remotePath,
        transport,
        durationMs: Date.now() - startedAt,
    };
}
//# sourceMappingURL=transfer.js.map