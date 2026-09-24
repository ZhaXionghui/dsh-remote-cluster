import { existsSync, lstatSync, mkdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { credentialKey } from "@deepseek-ai/dsh-credentials";
import { RemoteHostError, RemoteHostId } from "../../host-remote-host/lib/index.js";
import { runNativeCommand } from "@deepseek-ai/dsh-native-command";
import { deepEqualJson } from "@deepseek-ai/dsh-util-values";
import z from "@deepseek-ai/schemastery";
import { TextRetainer } from "@deepseek-ai/dsh-output-retention";
import { Client } from "ssh2";
import { spawn } from "node:child_process";
//#region lib/types/ssh-client.js
/**
* Local OpenSSH client selection for the SSH provider.
*
* The provider can own its multiplexed ControlMaster through either the
* platform's native OpenSSH client or, on Windows, a WSL client. Win32-OpenSSH
* implements no multiplexing, so the WSL client is the only way to reuse a
* ControlMaster on Windows while the native client stays the default wherever
* the two are interchangeable. This module is dependency-free and
* side-effect-free so the provider and its suites can resolve a client
* deterministically.
*
* @module @deepseek-ai/dsh-host-remote-host-ssh/ssh-client
*/
/** The native client singleton, so callers can compare identity cheaply. */
const NATIVE_SSH_CLIENT = { kind: "native" };
/**
* Well-known Windows `wsl.exe` locations: the System32 launcher first, then
* every PATH entry. PATH entries may carry surrounding quotes from
* `setx`-style definitions.
* @param env - the environment to probe.
* @returns candidate `wsl.exe` paths in resolution order.
*/
function candidateWslPaths(env) {
	const candidates = [join(env.SystemRoot ?? "C:\\Windows", "System32", "wsl.exe")];
	for (const entry of (env.PATH ?? "").split(";")) {
		const trimmed = entry.trim().replace(/^"|"$/g, "");
		if (trimmed.length === 0) continue;
		candidates.push(join(trimmed, "wsl.exe"));
	}
	return candidates;
}
/**
* Whether a candidate can be spawned. lstat opens the entry itself instead of
* following reparse points, so it sees the Store app execution alias where
* `stat` hits the target's ACL (EACCES); Node reports that alias as a symlink
* on current releases and as a plain file on older ones, and CreateProcess
* resolves either shape. A real directory never matches.
* @param candidate - absolute path to probe.
* @returns true when the entry is a file or symlink.
*/
function executableExists(candidate) {
	try {
		const stat = lstatSync(candidate);
		return stat.isFile() || stat.isSymbolicLink();
	} catch {
		return false;
	}
}
/**
* Resolve the Windows `wsl.exe` launcher.
* @param env - the environment to probe; defaults to the process environment.
* @param platform - the platform to probe for; defaults to the process platform.
* @returns the first existing launcher path, or `undefined` off Windows or when
*   no launcher is installed.
*/
function wslExecutablePath(env = process.env, platform = process.platform) {
	if (platform !== "win32") return void 0;
	for (const candidate of candidateWslPaths(env)) if (executableExists(candidate)) return candidate;
}
/**
* Resolve the configured client preference into one local OpenSSH client.
*
* `auto` prefers the WSL client on Windows because Win32-OpenSSH cannot
* multiplex, and falls back to the native client wherever the WSL launcher is
* unavailable. An explicit `wsl` request fails loudly instead of silently
* downgrading, and the WSL client is rejected outright off Windows where it
* cannot exist.
* @param choice - configured preference; `undefined` behaves like `auto`.
* @param options - platform, environment, and distribution overrides.
* @returns the resolved client.
* @throws {Error} when `wsl` is requested off Windows, or explicitly requested
*   on Windows without a usable `wsl.exe`.
*/
function resolveSshClient(choice, options = {}) {
	const resolved = choice ?? "auto";
	const platform = options.platform ?? process.platform;
	if (platform !== "win32") {
		if (resolved === "wsl") throw new Error("remote-host-ssh: the WSL SSH client is only available on Windows");
		return NATIVE_SSH_CLIENT;
	}
	if (resolved === "native") return NATIVE_SSH_CLIENT;
	if (wslExecutablePath(options.env ?? process.env, platform) === void 0) {
		if (resolved === "wsl") throw new Error("remote-host-ssh: the WSL SSH client was requested but wsl.exe is not installed");
		return NATIVE_SSH_CLIENT;
	}
	return options.distro === void 0 ? { kind: "wsl" } : {
		kind: "wsl",
		distro: options.distro
	};
}
/**
* Whether this platform's OpenSSH client can own a reusable ControlMaster.
*
* Win32-OpenSSH implements no multiplexing: the mux client needs Unix-domain
* socket ancillary data Windows cannot pass, so `ssh -M -S <path>` fails with
* `getsockname failed: Not a socket` as soon as it starts and never leaves a
* socket behind. Reporting the capability once here keeps every control path
* out of the transport decisions instead of stripping flags from each argv
* builder.
* @param platform - platform to test; defaults to the running process.
* @returns true when the local OpenSSH client can carry a master.
*/
function controlMasterSupported(platform = process.platform) {
	return platform !== "win32";
}
/**
* Whether the resolved client can carry a reusable ControlMaster.
*
* The native client inherits its platform's capability (Win32-OpenSSH cannot
* multiplex); a WSL client always can, which is the reason it exists.
* @param client - the resolved local client.
* @param platform - platform to test for the native client; defaults to the
*   running process.
* @returns true when the client can own a control socket.
*/
function sshClientSupportsMultiplexing(client, platform = process.platform) {
	return client.kind === "wsl" ? true : controlMasterSupported(platform);
}
/**
* Whether the provider can observe this client's control socket synchronously.
*
* A native client's socket is an ordinary local filesystem entry, so a
* Windows-side `lstat` is authoritative. A WSL client's socket lives in the
* Linux filesystem across the WSL boundary, which Windows cannot stat;
* liveness there is decided only by the client's own `ssh -O check` exit code.
* @param client - the resolved local client.
* @returns true when synchronous liveness checks are valid.
*/
function sshClientHasSyncLiveness(client) {
	return client.kind === "native";
}
/**
* Derive a short, stable control-socket path for one configured host.
*
* The path is not a credential. The native client keeps it below `$DSH_HOME`
* when available so a restart can reuse a still-live ControlPersist session,
* and below the local user's `.dsh` directory otherwise. The WSL client keeps
* it flat in the Linux user's home so no directory has to be created across the
* WSL boundary — the WSL-side OpenSSH expands the leading `~` itself.
* @param hostId - configured host identity.
* @param client - the local client that owns the socket; defaults to native.
* @returns the control path in the owning client's own filesystem.
*/
function controlPathForHost(hostId, client = NATIVE_SSH_CLIENT) {
	const digest = createHash("sha256").update(hostId).digest("hex").slice(0, 24);
	if (client.kind === "wsl") return `~/.dsh-control-${digest}.sock`;
	return join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "remote-host", "control", `${digest}.sock`);
}
/**
* Build the local process invocation that runs one OpenSSH tool.
*
* The native client runs the tool directly, byte-for-byte as before. The WSL
* client runs it inside `wsl.exe`, optionally pinned to a distribution, with
* `--` separating the WSL launcher's own argv from the Linux command so no
* distribution flag can consume one of the tool's arguments.
* @param client - the resolved local client.
* @param tool - the OpenSSH tool to run.
* @param args - the tool's native argv.
* @returns the command and argv to spawn.
*/
function sshClientInvocation(client, tool, args) {
	if (client.kind === "native") return {
		command: tool,
		args
	};
	return {
		command: "wsl.exe",
		args: [
			...client.distro === void 0 ? [] : ["-d", client.distro],
			"--",
			tool,
			...args
		]
	};
}
//#endregion
//#region lib/types/terminal.js
/** Shell-free argv construction for opening one configured SSH target in a native terminal. */
/**
* Build direct OpenSSH argv without including any password or MFA response.
* @param target - validated SSH target fields used to construct the destination.
* @returns direct OpenSSH arguments for the configured target.
*/
function sshRemoteTerminalArgs(target) {
	const args = ["-tt"];
	if (target.controlPath !== void 0) {
		if (target.controlMasterMode !== "reuse") args.push("-M");
		args.push("-S", target.controlPath);
		if (target.controlMasterMode !== "reuse") {
			if (target.controlPersistSeconds !== void 0) args.push("-o", `ControlPersist=${target.controlPersistSeconds}s`);
			if (target.serverAliveIntervalSeconds !== void 0) args.push("-o", `ServerAliveInterval=${target.serverAliveIntervalSeconds}`);
			if (target.serverAliveCountMax !== void 0) args.push("-o", `ServerAliveCountMax=${target.serverAliveCountMax}`);
		}
	}
	if (target.identityFile !== void 0) args.push("-i", target.identityFile);
	if (target.port !== 22) args.push("-p", String(target.port));
	args.push(`${target.user}@${target.hostname}`);
	return args;
}
/**
* Open a native terminal for one configured SSH target.
*
* The upstream commit that added this (`c36edb349f`, "feat(remote-host):
* project remote hosts into tools, API, and the web client") also added
* `openNativeTerminal` to `@deepseek-ai/dsh-native-command` — and that symbol
* was never released. The published `0.1.5-rc.3` exports only
* `canOpenNativePath`, `nativeFileManager`, `openNativePath`,
* `openNativeTextFile`, `revealNativePath` and `runNativeCommand`.
*
* So this launcher cannot be provided here. It is OPTIONAL by design: the
* remote-host Service Definition treats a missing `openTerminal` as
* `TERMINAL_UNAVAILABLE` (`vendor/host-remote-host/lib/index.js:125`), the
* backend reaches the same branch at `:1247`, and the controller maps it to
* `remote-host/terminal-unavailable`. Callers already handle that — the native
* terminal is only a shortcut that bypasses browser polling for password / MFA
* / host-key / passphrase prompts, and the panel-side authentication path stays
* available without it.
*
* @returns never; kept so the `openTerminal` seam still fails loudly rather
* than silently resolving to an undefined launch.
*/
function openSshRemoteTerminal() {
	throw new RemoteHostError("the vendored SSH provider has no native terminal launcher: the harness API it needs was never published", "TERMINAL_UNAVAILABLE");
}
//#endregion
//#region lib/types/facts.js
/** POSIX host-information probe and strict parser for the SSH provider. */
/** Fixed probe delivered through `sh -s`; every emitted value occupies one tab-delimited line. */
const INSPECTION_SCRIPT = String.raw`set +e
dsh_value() {
  dsh_key="$1"
  shift
  dsh_output="$($@ 2>/dev/null)" || return
  dsh_output="$(printf '%s' "$dsh_output" | tr '\t\r\n' '   ')"
  printf '%s\t%s\n' "$dsh_key" "$dsh_output"
}
dsh_value hostname hostname
dsh_value kernel uname -sr
dsh_value architecture uname -m
if [ -r /etc/os-release ]; then
  dsh_os="$(sed -n 's/^PRETTY_NAME=//p' /etc/os-release 2>/dev/null | head -n 1)"
  dsh_os="$(printf '%s' "$dsh_os" | sed 's/^"//; s/"$//')"
  dsh_os="$(printf '%s' "$dsh_os" | tr '\t\r\n' '   ')"
  [ -n "$dsh_os" ] && printf 'operatingSystem\t%s\n' "$dsh_os"
fi
if [ -r /proc/uptime ]; then
  awk '{ printf "uptimeSeconds\t%d\n", $1 }' /proc/uptime 2>/dev/null
fi
if [ -r /proc/loadavg ]; then
  awk '{ printf "loadAverage\t%s\t%s\t%s\n", $1, $2, $3 }' /proc/loadavg 2>/dev/null
fi
dsh_value logicalCpuCount getconf _NPROCESSORS_ONLN
if [ -r /proc/meminfo ]; then
  awk '/^MemTotal:/ { total=$2 * 1024 } /^MemAvailable:/ { available=$2 * 1024 } END { if (total > 0) printf "memory\t%.0f\t%.0f\n", total, available }' /proc/meminfo 2>/dev/null
fi
df -Pk / 2>/dev/null | awk 'NR == 2 { printf "rootDisk\t%.0f\t%.0f\n", $2 * 1024, $3 * 1024 }'
`;
function finiteNonNegative(value) {
	if (value === void 0 || value.trim().length === 0) return void 0;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : void 0;
}
function positiveInteger(value) {
	const parsed = finiteNonNegative(value);
	return parsed !== void 0 && Number.isInteger(parsed) && parsed > 0 ? parsed : void 0;
}
/**
* Parse independent probe rows so an invalid or unavailable fact does not discard its companions.
* @param id - configured host identity.
* @param output - bounded probe stdout.
* @param observedAt - local observation timestamp.
* @param latencyMs - complete probe round-trip.
* @returns the safe partial fact record.
*/
function parseRemoteHostFacts(id, output, observedAt, latencyMs) {
	const facts = {};
	for (const line of output.split("\n")) {
		const [key, ...values] = line.split("	");
		if (key !== void 0 && key.length > 0 && facts[key] === void 0) facts[key] = values;
	}
	const load = facts.loadAverage;
	const loadAverage = load === void 0 ? void 0 : load.slice(0, 3).map((value) => finiteNonNegative(value));
	const memory = facts.memory;
	const disk = facts.rootDisk;
	const uptimeSeconds = finiteNonNegative(facts.uptimeSeconds?.[0]);
	const logicalCpuCount = positiveInteger(facts.logicalCpuCount?.[0]);
	const memoryTotalBytes = finiteNonNegative(memory?.[0]);
	const memoryAvailableBytes = finiteNonNegative(memory?.[1]);
	const rootDiskTotalBytes = finiteNonNegative(disk?.[0]);
	const rootDiskUsedBytes = finiteNonNegative(disk?.[1]);
	return {
		id,
		observedAt,
		latencyMs,
		...facts.hostname?.[0] ? { hostname: facts.hostname[0] } : {},
		...facts.operatingSystem?.[0] ? { operatingSystem: facts.operatingSystem[0] } : {},
		...facts.kernel?.[0] ? { kernel: facts.kernel[0] } : {},
		...facts.architecture?.[0] ? { architecture: facts.architecture[0] } : {},
		...uptimeSeconds !== void 0 ? { uptimeSeconds } : {},
		...loadAverage?.length === 3 && loadAverage.every((value) => value !== void 0) ? { loadAverage } : {},
		...logicalCpuCount !== void 0 ? { logicalCpuCount } : {},
		...memoryTotalBytes !== void 0 ? { memoryTotalBytes } : {},
		...memoryAvailableBytes !== void 0 ? { memoryAvailableBytes } : {},
		...rootDiskTotalBytes !== void 0 ? { rootDiskTotalBytes } : {},
		...rootDiskUsedBytes !== void 0 ? { rootDiskUsedBytes } : {}
	};
}
//#endregion
//#region lib/types/transfer.js
/** Single-file transfer validation and the `ssh2` SFTP bridge used by the SSH provider. */
const POSIX_ABSOLUTE = /^\//;
function abortError$1(signal) {
	return signal.reason instanceof Error ? signal.reason : new DOMException("The operation was aborted", "AbortError");
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
function transferCopyFailure(cause) {
	return new RemoteHostError("file transfer failed", "TRANSFER_FAILED", { cause });
}
/**
* Reject a request whose local or remote path cannot be addressed without a shell.
* @param request - caller transfer request carrying both paths.
* @throws {RemoteHostError} `TRANSFER_PATH_INVALID` for a relative, empty, or control-character path.
*/
function assertTransferPaths(request) {
	const { localPath, remotePath } = request;
	if (localPath.length === 0 || localPath.includes("\0") || localPath.includes("\n") || !isAbsolute(localPath)) throw new RemoteHostError("transfer local_path must be a non-empty absolute path without NUL or newline", "TRANSFER_PATH_INVALID");
	if (remotePath.length === 0 || remotePath.includes("\0") || remotePath.includes("\n") || !POSIX_ABSOLUTE.test(remotePath)) throw new RemoteHostError("transfer remote_path must be a non-empty absolute POSIX path without NUL or newline", "TRANSFER_PATH_INVALID");
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
function assertScpRemotePath(remotePath) {
	if (!SCP_SAFE_REMOTE_PATH.test(remotePath)) throw new RemoteHostError(`transfer remote path "${remotePath}" must not contain whitespace, control, or shell-syntax characters: the ControlMaster route passes it to scp unquoted, so only path-safe characters are accepted`, "TRANSFER_PATH_INVALID");
}
/**
* Reject a planned or observed byte count outside the configured cap.
* @param bytes - file size in bytes.
* @param maxTransferBytes - configured maximum accepted size.
* @throws {RemoteHostError} `TRANSFER_TOO_LARGE` above the cap, `TRANSFER_PATH_INVALID` for a non-integer size.
*/
function assertWithinTransferLimit(bytes, maxTransferBytes) {
	if (!Number.isSafeInteger(bytes) || bytes < 0) throw new RemoteHostError("transfer byte count must be a non-negative safe integer", "TRANSFER_PATH_INVALID");
	if (bytes > maxTransferBytes) throw new RemoteHostError(`transfer of ${bytes} bytes exceeds the configured limit of ${maxTransferBytes} bytes`, "TRANSFER_TOO_LARGE");
}
/**
* Read the size of one readable local regular file.
* @param localPath - absolute local file path.
* @returns size in bytes.
* @throws {RemoteHostError} `TRANSFER_PATH_INVALID` when the path is missing, unreadable, or not a regular file.
*/
function localFileBytes(localPath) {
	let stats;
	try {
		stats = statSync(localPath);
	} catch (cause) {
		throw new RemoteHostError(`transfer local path "${localPath}" is not readable`, "TRANSFER_PATH_INVALID", { cause });
	}
	if (!stats.isFile()) throw new RemoteHostError(`transfer local path "${localPath}" is not a regular file`, "TRANSFER_PATH_INVALID");
	return stats.size;
}
/**
* Adapt one `ssh2` SFTP channel to the provider's single-file surface.
* @param client - an authenticated `ssh2` client.
* @returns the resolved adapter, or a rejection when the channel cannot be opened.
*/
async function createSsh2Sftp(client) {
	const sftp = await new Promise((resolve, reject) => {
		client.sftp((error, opened) => {
			if (error === void 0) resolve(opened);
			else reject(error);
		});
	});
	return {
		statSize: async (remotePath) => await new Promise((resolve) => {
			sftp.stat(remotePath, (error, stats) => {
				if (error === void 0) resolve(stats.size);
				else resolve(void 0);
			});
		}),
		put: async (localPath, remotePath) => await new Promise((resolve, reject) => {
			sftp.fastPut(localPath, remotePath, (error) => {
				if (error === void 0 || error === null) resolve();
				else reject(error);
			});
		}),
		get: async (remotePath, localPath) => await new Promise((resolve, reject) => {
			sftp.fastGet(remotePath, localPath, (error) => {
				if (error === void 0 || error === null) resolve();
				else reject(error);
			});
		}),
		end: () => {
			sftp.end();
		}
	};
}
/** Reject one operation when its deadline or the caller's signal settles first. */
async function raceDeadline(operation, limits) {
	const { signal = new AbortController().signal, timeoutMs } = limits;
	if (signal.aborted) throw abortError$1(signal);
	return await new Promise((resolve, reject) => {
		let settled = false;
		const onAbort = () => {
			finish(() => reject(abortError$1(signal)));
		};
		const finish = (settle) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal.removeEventListener("abort", onAbort);
			settle();
		};
		const timer = setTimeout(() => {
			finish(() => reject(/* @__PURE__ */ new Error(`file transfer exceeded its ${timeoutMs} ms deadline`)));
		}, timeoutMs);
		timer.unref();
		signal.addEventListener("abort", onAbort, { once: true });
		operation.then((value) => {
			finish(() => resolve(value));
		}, (error) => {
			finish(() => reject(error instanceof Error ? error : new Error(String(error))));
		});
	});
}
/** Validate, size-check, and perform one single-file copy over SFTP. */
async function planSftpTransfer(sftp, direction, request, limits) {
	if (direction === "upload") {
		const bytes = localFileBytes(request.localPath);
		assertWithinTransferLimit(bytes, limits.maxTransferBytes);
		if (request.overwrite !== true && await sftp.statSize(request.remotePath) !== void 0) throw new RemoteHostError(`transfer remote path "${request.remotePath}" already exists and overwrite was not requested`, "TRANSFER_PATH_INVALID");
		try {
			await sftp.put(request.localPath, request.remotePath);
		} catch (cause) {
			throw transferCopyFailure(cause);
		}
		return bytes;
	}
	if (request.overwrite !== true && existsSync(request.localPath)) throw new RemoteHostError(`transfer local path "${request.localPath}" already exists and overwrite was not requested`, "TRANSFER_PATH_INVALID");
	const bytes = await sftp.statSize(request.remotePath);
	if (bytes === void 0) throw new RemoteHostError(`transfer remote path "${request.remotePath}" is not a readable file`, "TRANSFER_PATH_INVALID");
	assertWithinTransferLimit(bytes, limits.maxTransferBytes);
	try {
		await sftp.get(request.remotePath, request.localPath);
	} catch (cause) {
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
async function runSftpTransfer(sftp, direction, request, limits) {
	assertTransferPaths(request);
	if (limits.signal?.aborted === true) throw abortError$1(limits.signal);
	const startedAt = Date.now();
	const bytes = await raceDeadline(planSftpTransfer(sftp, direction, request, limits), limits);
	return transferResult(request.hostId, direction, bytes, request, "ssh2", startedAt);
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
function transferResult(hostId, direction, bytes, request, transport, startedAt) {
	return {
		hostId,
		direction,
		bytes,
		localPath: request.localPath,
		remotePath: request.remotePath,
		transport,
		durationMs: Date.now() - startedAt
	};
}
//#endregion
//#region lib/types/control-master.js
/** OpenSSH ControlMaster arguments and the small process bridge used by the SSH provider. */
/**
* Build the non-interactive status command for one control socket.
* @param target - validated SSH and control-socket fields.
* @returns shell-free OpenSSH argv.
*/
function sshControlStatusArgs(target) {
	return [
		"-S",
		target.controlPath,
		"-O",
		"check",
		"-p",
		String(target.port),
		`${target.username}@${target.host}`
	];
}
/**
* Build the command that asks the master to exit.
* @param target - validated SSH and control-socket fields.
* @returns shell-free OpenSSH argv.
*/
function sshControlExitArgs(target) {
	return [
		"-S",
		target.controlPath,
		"-O",
		"exit",
		"-p",
		String(target.port),
		`${target.username}@${target.host}`
	];
}
/**
* Build a stdin-backed, non-interactive command routed through the master.
* @param target - validated SSH and control-socket fields.
* @returns shell-free OpenSSH argv; the script is written to stdin.
*/
function sshControlExecArgs(target) {
	const args = [
		"-T",
		"-S",
		target.controlPath,
		"-o",
		"ControlMaster=no",
		"-o",
		"BatchMode=yes"
	];
	if (target.identityFile !== void 0) args.push("-i", target.identityFile);
	if (target.port !== 22) args.push("-p", String(target.port));
	args.push(`${target.username}@${target.host}`, "sh -s");
	return args;
}
/**
* Build a single-file `scp` command routed through the master's socket.
*
* Both endpoints travel as `scp` path operands. The local operand is an
* ordinary local argv element, but the remote operand is only shell-free under
* the SFTP dialect OpenSSH 9.0 and later use: older and legacy `scp` modes
* hand it to `scp -t <path>` on the remote side, which the remote login shell
* parses. Because the dialect is a property of the far host rather than of
* this process, the remote path is admitted only when it carries no
* shell-syntax, whitespace, or control character. `scp` takes its port through
* `-P`, unlike `ssh`'s `-p`.
* @param target - validated SSH and control-socket fields.
* @param direction - upload copies the local file out, download copies it in.
* @param localPath - absolute local file path.
* @param remotePath - absolute POSIX remote file path.
* @returns `scp` argv whose remote operand no remote shell can reinterpret.
* @throws {RemoteHostError} `TRANSFER_PATH_INVALID` when the remote path is not
* safe to pass unquoted.
*/
function sshControlScpArgs(target, direction, localPath, remotePath) {
	assertScpRemotePath(remotePath);
	const args = [
		"-o",
		"ControlMaster=no",
		"-o",
		`ControlPath=${target.controlPath}`,
		"-o",
		"BatchMode=yes"
	];
	if (target.identityFile !== void 0) args.push("-i", target.identityFile);
	if (target.port !== 22) args.push("-P", String(target.port));
	const remote = `${target.username}@${target.host}:${remotePath}`;
	args.push(...direction === "upload" ? [localPath, remote] : [remote, localPath]);
	return args;
}
/**
* Check whether OpenSSH left a filesystem entry for the control socket.
*
* Windows OpenSSH can append `=` to a control path. Both forms are checked,
* and directories are excluded so a malformed path cannot be treated as a
* live socket.
* @param controlPath - configured control path.
* @returns true when a non-directory socket entry exists.
*/
function controlSocketExists(controlPath) {
	return [controlPath, `${controlPath}=`].some((candidate) => {
		try {
			return !lstatSync(candidate).isDirectory();
		} catch {
			return false;
		}
	});
}
/**
* Prepare the parent directory for one control socket.
* @param controlPath - configured control path.
*/
function ensureControlSocketDirectory(controlPath) {
	mkdirSync(dirname(controlPath), { recursive: true });
}
/**
* Remove stale socket entries without following directory links.
* @param controlPath - configured control path.
*/
function removeControlSocket(controlPath) {
	for (const candidate of [controlPath, `${controlPath}=`]) try {
		if (!lstatSync(candidate).isDirectory()) unlinkSync(candidate);
	} catch {}
}
/**
* Verify an existing control socket without opening a new SSH connection.
*
* A native client's socket is stat-ed first (its local filesystem entry is
* authoritative and lets a missing socket skip the probe); a WSL client's
* socket is invisible to Windows, so its liveness is decided only by the
* client's own `ssh -O check` exit code.
* @param target - validated SSH and control-socket fields.
* @param run - no-shell command runner.
* @param signal - cancellation for the status probe.
* @returns true when the OpenSSH master confirms it is alive.
*/
async function isControlMasterActive(target, run, signal) {
	const client = target.client ?? NATIVE_SSH_CLIENT;
	if (sshClientHasSyncLiveness(client) && !controlSocketExists(target.controlPath)) return false;
	try {
		const invocation = sshClientInvocation(client, "ssh", sshControlStatusArgs(target));
		await run(invocation.command, invocation.args, signal);
		return true;
	} catch {
		return false;
	}
}
/**
* Execute one POSIX script through an existing ControlMaster.
* @param invocation - resolved local invocation from {@link sshClientInvocation}.
* @param script - script written to the SSH process stdin.
* @param options - cancellation, deadline, output cap, and child environment.
* @returns bounded command outcome with independent timeout and abort flags.
*/
const runControlMasterScript = (invocation, script, options) => new Promise((resolve, reject) => {
	const stdout = new TextRetainer({
		kind: "tail",
		maxBytes: options.maxOutputBytes
	});
	const stderr = new TextRetainer({
		kind: "tail",
		maxBytes: options.maxOutputBytes
	});
	let child;
	let settled = false;
	let timedOut = false;
	let aborted = false;
	let exitCode = null;
	let exitSignal = null;
	const cleanup = () => {
		clearTimeout(deadline);
		options.signal?.removeEventListener("abort", onAbort);
	};
	const resolveOnce = () => {
		if (settled) return;
		settled = true;
		cleanup();
		resolve({
			exitCode,
			signal: exitSignal,
			timedOut,
			aborted,
			stdout: stdout.finish(),
			stderr: stderr.finish()
		});
	};
	const rejectOnce = (error) => {
		if (settled) return;
		settled = true;
		cleanup();
		reject(error instanceof Error ? error : new Error(String(error)));
	};
	const terminate = () => {
		if (child.killed) return;
		child.kill();
	};
	const onAbort = () => {
		aborted = true;
		terminate();
	};
	const deadline = setTimeout(() => {
		timedOut = true;
		terminate();
	}, options.timeoutMs);
	deadline.unref();
	try {
		child = spawn(invocation.command, [...invocation.args], {
			env: options.env,
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			],
			windowsHide: true
		});
	} catch (error) {
		rejectOnce(error);
		return;
	}
	child.once("error", rejectOnce);
	child.stdout?.on("data", (chunk) => stdout.push(chunk));
	child.stderr?.on("data", (chunk) => stderr.push(chunk));
	child.once("close", (code, signal) => {
		exitCode = code;
		exitSignal = signal;
		resolveOnce();
	});
	if (options.signal?.aborted === true) {
		aborted = true;
		terminate();
		return;
	}
	options.signal?.addEventListener("abort", onAbort, { once: true });
	child.stdin?.end(script);
});
//#endregion
//#region lib/types/provider.js
/** SSH backend with leased `ssh2` and OpenSSH ControlMaster connection paths. */
const POSIX_STDIN_COMMAND = "sh -s";
/** Control-master retention used when a deployment states nothing else. */
const DEFAULT_CONTROL_PERSIST_SECONDS = 900;
/** Environment variable carrying one remote path to a stdin-fed probe script. */
const CONTROL_TRANSFER_PATH_VAR = "DSH_TRANSFER_PATH";
const CONTROL_PATH_EXISTS_SCRIPT = `if [ -e "$${CONTROL_TRANSFER_PATH_VAR}" ]; then printf present; else printf absent; fi`;
const CONTROL_FILE_BYTES_SCRIPT = `if [ -f "$${CONTROL_TRANSFER_PATH_VAR}" ]; then wc -c < "$${CONTROL_TRANSFER_PATH_VAR}"; fi`;
/** Byte cap for the two fixed control-master probe scripts. */
const CONTROL_PROBE_MAX_OUTPUT_BYTES = 64;
function abortError(signal) {
	return signal.reason instanceof Error ? signal.reason : new DOMException("The operation was aborted", "AbortError");
}
/**
* Fire-and-forget continuation for a settled promise whose outcome is not
* consumed here.
*
* A background probe publishes its result through the next synchronous
* snapshot, so neither settlement needs a reaction; sharing one no-op keeps
* that intent explicit and keeps the continuation covered on the satisfied
* path (the probe converts its own failures into `false`, so it never rejects).
*/
function ignoreOutcome() {}
async function waitWithAbort(promise, signal) {
	if (signal === void 0) return await promise;
	if (signal.aborted) throw abortError(signal);
	return await new Promise((resolve, reject) => {
		const onAbort = () => {
			reject(abortError(signal));
		};
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then(resolve, reject).finally(() => {
			signal.removeEventListener("abort", onAbort);
		});
	});
}
function connectionFailure(error) {
	return `SSH connection failed: ${error.message}`;
}
function isPasswordPrompt(prompt) {
	const text = prompt.prompt.toLowerCase();
	return prompt.echo !== true && /\bpassword\b/u.test(text) && !/\b(?:otp|one[- ]time|verification|code|token)\b/u.test(text);
}
/** One provider-owned host and its persistent, multiplexed SSH connection paths. */
var SshRemoteHostBackend = class {
	summary;
	options;
	clientFactory;
	sshClient;
	controlStatusRunner;
	controlProbeRunner;
	controlScriptRunner;
	transferRunner;
	sftpFactory;
	client;
	connectPromise;
	closePromise;
	connectedAt;
	failedAt;
	failureMessage;
	activeLeases = 0;
	idleTimer;
	reclaimAt;
	disconnecting = false;
	disposing = false;
	disposed = false;
	disposePromise;
	commands = /* @__PURE__ */ new Set();
	authPassword;
	authPrompt;
	connectionDurationMs;
	interactiveAuthRequired = false;
	trustedHostKeySha256;
	pendingHostKeySha256;
	controlRequested = false;
	controlConnectedAt;
	controlProbePending = false;
	/**
	* @param options - validated target, authentication material, lifecycle limits, and optional test seams.
	*/
	constructor(options) {
		if (options.summary.user === void 0 || options.summary.user.trim().length === 0) throw new Error("remote-host-ssh: SSH backend summary must include a non-empty user");
		this.options = options;
		this.summary = options.summary;
		this.clientFactory = options.clientFactory ?? (() => new Client());
		this.sshClient = options.client ?? NATIVE_SSH_CLIENT;
		const baseStatusRunner = options.controlStatusRunner ?? runNativeCommand;
		this.controlProbeRunner = baseStatusRunner;
		this.controlStatusRunner = this.clientAwareRunner(baseStatusRunner);
		this.controlScriptRunner = options.controlScriptRunner ?? runControlMasterScript;
		this.transferRunner = this.clientAwareRunner(options.transferRunner ?? runNativeCommand);
		this.sftpFactory = options.sftpFactory ?? createSsh2Sftp;
		this.trustedHostKeySha256 = options.hostKeySha256?.toLowerCase();
	}
	/**
	* Wrap a no-shell runner so an OpenSSH tool command carries the resolved
	* client's argv prefix.
	*
	* The mapping wraps the caller-supplied runner, so a recording runner in a
	* suite still observes the exact argv the real process would spawn — the
	* prefix included. It serves this provider's own `ssh -O exit` and `scp`
	* calls; the `ssh -O check` probe is prefixed inside
	* `isControlMasterActive`, which therefore receives the raw runner.
	* @param base - the underlying runner (injected seam or `runNativeCommand`).
	* @returns a runner that translates `ssh`/`scp` into the client invocation.
	*/
	clientAwareRunner(base) {
		return (command, args, signal) => {
			const invocation = sshClientInvocation(this.sshClient, command === "scp" ? "scp" : "ssh", args);
			return base(invocation.command, invocation.args, signal);
		};
	}
	/**
	* Decide whether this target's default transport is the provider-owned ControlMaster.
	*
	* A target is password-only when it configures neither a private key nor an
	* agent; only then can the OpenSSH client own the interactive login, and only
	* then does `passwordControlMaster` apply.
	* @returns true when the ControlMaster path is preferred over `ssh2`.
	*/
	preferControlMaster() {
		if (this.options.privateKey !== void 0 || this.options.agentSocket !== void 0) return false;
		if (this.options.passwordControlMaster === false) return false;
		return this.options.controlPath !== void 0;
	}
	/** Resolve the ControlPersist retention for this target's provider-owned socket. */
	controlPersistSeconds() {
		if (this.connectionDurationMs !== void 0) return Math.max(1, Math.ceil(this.connectionDurationMs / 1e3));
		return Math.max(1, Math.trunc(this.options.controlPersistSeconds ?? DEFAULT_CONTROL_PERSIST_SECONDS));
	}
	controlTarget() {
		const controlPath = this.options.controlPath;
		const username = this.summary.user;
		if (controlPath === void 0 || username === void 0) return void 0;
		return {
			host: this.summary.hostname,
			port: this.summary.port,
			username,
			...this.options.identityFile === void 0 ? {} : { identityFile: this.options.identityFile },
			controlPath,
			controlPersistSeconds: this.controlPersistSeconds(),
			serverAliveIntervalSeconds: Math.max(1, Math.ceil(this.options.limits.keepaliveIntervalMs / 1e3)),
			serverAliveCountMax: this.options.limits.keepaliveCountMax,
			client: this.sshClient
		};
	}
	observeControlSocket() {
		const target = this.controlTarget();
		if (target === void 0 || this.controlConnectedAt !== void 0) return;
		if (sshClientHasSyncLiveness(this.sshClient)) {
			if (!controlSocketExists(target.controlPath)) return;
			this.controlConnectedAt = Date.now();
			this.clearFailure();
			this.scheduleIdleTimer();
			return;
		}
		if (!this.controlRequested || this.controlProbePending) return;
		this.controlProbePending = true;
		const probe = this.refreshControlMaster(void 0, { preservePendingLogin: true }).then(ignoreOutcome, ignoreOutcome);
		this.commands.add(probe);
		probe.finally(() => {
			this.commands.delete(probe);
			this.controlProbePending = false;
		});
	}
	/** Label the connection path that currently carries operations. */
	currentTransport() {
		return this.controlConnectedAt !== void 0 ? "control-master" : "ssh2";
	}
	/** @returns a fresh provider lifecycle snapshot without authentication data. */
	snapshot() {
		this.observeControlSocket();
		if (this.failedAt !== void 0 && this.failureMessage !== void 0 && this.client === void 0 && this.controlConnectedAt === void 0) return {
			state: "failed",
			failedAt: this.failedAt,
			message: this.failureMessage
		};
		const connectedAt = this.connectedAt ?? this.controlConnectedAt;
		if (this.closePromise !== void 0 && connectedAt !== void 0) return {
			state: "closing",
			connectedAt
		};
		if (this.connectPromise !== void 0 && this.connectedAt === void 0) return { state: "connecting" };
		if (this.controlRequested && this.controlConnectedAt === void 0) return { state: "connecting" };
		if (connectedAt !== void 0 && (this.client !== void 0 || this.controlConnectedAt !== void 0)) {
			if (this.activeLeases > 0) return {
				state: "connected-active",
				connectedAt,
				activeLeases: this.activeLeases,
				transport: this.currentTransport()
			};
			if (this.reclaimAt !== void 0) return {
				state: "connected-idle",
				connectedAt,
				reclaimAt: this.reclaimAt,
				transport: this.currentTransport()
			};
		}
		return { state: "disconnected" };
	}
	/**
	* Establish or reuse the connection, then retain it as idle.
	* @param signal - cancellation while awaiting shared connection setup.
	*/
	async connect(signal) {
		if (await this.refreshControlMaster(signal)) return;
		if (this.client !== void 0 && this.connectedAt !== void 0) {
			await this.withLease(signal, async () => {});
			return;
		}
		if (this.controlRequested) throw new RemoteHostError(`remote host "${this.summary.id}" is waiting for the native terminal login to create its control socket`, "AUTH_INTERACTIVE_REQUIRED");
		if (this.preferControlMaster()) {
			await this.initiateControlMasterLogin();
			throw new RemoteHostError(`remote host "${this.summary.id}" uses the OpenSSH ControlMaster path by default; complete the one-time login in the opened terminal, then reconnect`, "AUTH_INTERACTIVE_REQUIRED");
		}
		const resolvedPassword = this.authPassword === void 0 ? await this.options.resolvePassword?.() : void 0;
		if (resolvedPassword !== void 0) this.authPassword = resolvedPassword;
		try {
			await this.withLease(signal, async () => {});
		} finally {
			if (resolvedPassword !== void 0) this.authPassword = void 0;
		}
	}
	/** Authenticate with an optional password and answer keyboard-interactive MFA prompts. */
	async authenticate(request, onPrompt) {
		if (await this.refreshControlMaster(request.signal)) return;
		if (this.controlRequested) throw new RemoteHostError(`remote host "${this.summary.id}" is waiting for the native terminal login to create its control socket`, "AUTH_INTERACTIVE_REQUIRED");
		if (this.preferControlMaster()) {
			await this.initiateControlMasterLogin();
			throw new RemoteHostError(`remote host "${this.summary.id}" uses the OpenSSH ControlMaster path by default; complete the one-time login in the opened terminal, then reconnect`, "AUTH_INTERACTIVE_REQUIRED");
		}
		this.authPassword = request.password ?? await this.options.resolvePassword?.();
		this.authPrompt = onPrompt;
		this.connectionDurationMs = request.connectionDurationMs;
		try {
			await this.withLease(request.signal, async () => {});
			if (request.persistPassword && request.password !== void 0) await this.options.savePassword?.(request.password);
		} finally {
			this.authPrompt = void 0;
			this.authPassword = void 0;
		}
	}
	/** Open a native terminal that can create or reuse the provider-owned control socket. */
	async openTerminal() {
		const target = this.controlTarget();
		if (target === void 0) {
			await this.launchTerminal(void 0);
			return;
		}
		const active = await this.refreshControlMaster();
		if (!active) this.beginControlRequest(target);
		try {
			await this.launchTerminal(active ? "reuse" : "create");
		} catch (error) {
			if (!active) this.controlRequested = false;
			throw error;
		}
	}
	/** Persist and apply the host key captured by the last failed handshake. */
	async trustHostKey() {
		this.assertAvailable();
		const pending = this.pendingHostKeySha256;
		if (pending === void 0) throw new RemoteHostError(`remote host "${this.summary.id}" has no pending host key`, "HOST_KEY_UNTRUSTED");
		await this.options.onHostKeyTrust?.(pending);
		this.trustedHostKeySha256 = pending;
		this.pendingHostKeySha256 = void 0;
		this.clearFailure();
	}
	/**
	* Remove this configured host through the provider-installed hook.
	*
	* The provider owns the durable write and this backend's own unpublish, so
	* the method only delegates; a target built without the hook cannot be
	* removed.
	* @throws {RemoteHostError} `REMOVE_UNSUPPORTED` when no removal hook is installed.
	*/
	async remove() {
		const remove = this.options.remove;
		if (remove === void 0) throw new RemoteHostError(`remote host "${this.summary.id}" cannot be removed by its provider`, "REMOVE_UNSUPPORTED");
		await remove();
	}
	/**
	* Close an idle connection and await socket closure.
	* @param reason - diagnostics-only caller reason; never sent to the remote host.
	*/
	async disconnect(reason) {
		if (this.activeLeases > 0) throw new RemoteHostError(`remote host "${this.summary.id}" has active operations`, "HOST_BUSY");
		this.disconnecting = true;
		try {
			await this.closeControlMaster();
			await this.closeConnection();
			this.clearFailure();
		} finally {
			this.disconnecting = false;
		}
	}
	/**
	* Collect independent POSIX facts through one bounded foreground command.
	* @param signal - caller cancellation.
	* @returns partial facts and the complete probe latency.
	*/
	async inspect(signal) {
		const startedAt = Date.now();
		const result = await this.run(this.resolve({
			hostId: this.summary.id,
			command: INSPECTION_SCRIPT,
			...signal !== void 0 ? { signal } : {}
		}));
		const observedAt = Date.now();
		return parseRemoteHostFacts(this.summary.id, result.stdout.text, observedAt, observedAt - startedAt);
	}
	/**
	* Apply this provider's command deadline and output cap.
	* @param request - raw service request.
	* @returns a complete specification that cannot exceed provider limits.
	*/
	resolve(request) {
		const requested = request.timeoutMs ?? this.options.limits.commandTimeoutMs;
		if (!Number.isFinite(requested) || requested <= 0) throw new Error("remote-host-ssh: timeoutMs must be a positive finite number");
		return {
			...request,
			timeoutMs: Math.min(requested, this.options.limits.commandTimeoutMs),
			maxOutputBytes: this.options.limits.maxOutputBytes
		};
	}
	/**
	* Execute a resolved POSIX command through a leased SSH channel.
	* @param spec - result of {@link resolve} for this configured host.
	* @returns bounded stream text and independent completion flags.
	*/
	async run(spec) {
		if (spec.hostId !== this.summary.id) throw new Error("remote-host-ssh: run spec targets a different host");
		if (await this.refreshControlMaster(spec.signal)) {
			const operation = this.withControlLease(spec.signal, async () => await this.executeThroughControlMaster(spec));
			this.commands.add(operation);
			try {
				return await operation;
			} finally {
				this.commands.delete(operation);
			}
		}
		if (this.controlRequested) throw new RemoteHostError(`remote host "${this.summary.id}" is waiting for the native terminal login to create its control socket`, "AUTH_INTERACTIVE_REQUIRED");
		const operation = this.withLease(spec.signal, async (client) => await this.execute(client, spec));
		this.commands.add(operation);
		try {
			return await operation;
		} finally {
			this.commands.delete(operation);
		}
	}
	/**
	* Transfer one single file over the provider's current connection path.
	* @param direction - upload or download.
	* @param request - resolved target paths, overwrite choice, and caller cancellation.
	* @returns transferred size, resolved paths, carrying transport, and duration.
	*/
	async transfer(direction, request) {
		if (request.hostId !== this.summary.id) throw new Error("remote-host-ssh: transfer request targets a different host");
		assertTransferPaths(request);
		const timeoutMs = this.transferTimeoutMs(request);
		const startedAt = Date.now();
		if (await this.refreshControlMaster(request.signal)) {
			const operation = this.withControlLease(request.signal, async () => await this.transferThroughControlMaster(direction, request, timeoutMs, startedAt));
			this.commands.add(operation);
			try {
				return await operation;
			} finally {
				this.commands.delete(operation);
			}
		}
		if (this.controlRequested) throw new RemoteHostError(`remote host "${this.summary.id}" is waiting for the native terminal login to create its control socket`, "AUTH_INTERACTIVE_REQUIRED");
		const operation = this.withLease(request.signal, async (client) => await this.transferThroughSftp(client, direction, request, timeoutMs));
		this.commands.add(operation);
		try {
			return await operation;
		} finally {
			this.commands.delete(operation);
		}
	}
	/** Reject new work and idempotently await all channels and the shared connection. */
	async dispose() {
		this.disposePromise ??= this.disposeOnce();
		await this.disposePromise;
	}
	async disposeOnce() {
		this.disposing = true;
		this.cancelIdleTimer();
		await this.closeControlMaster();
		await this.closeConnection();
		const results = await Promise.allSettled([...this.commands]);
		this.disposed = true;
		const failures = results.filter((result) => result.status === "rejected").map((result) => result.reason);
		if (failures.length > 0) throw new AggregateError(failures, `failed to quiesce remote host "${this.summary.id}"`);
	}
	assertAvailable() {
		if (this.disposing || this.disposed) throw new RemoteHostError(`remote host "${this.summary.id}" provider is disposing`, "SERVICE_DISPOSING");
		if (this.disconnecting) throw new RemoteHostError(`remote host "${this.summary.id}" is disconnecting`, "HOST_BUSY");
	}
	async withLease(signal, body) {
		this.assertAvailable();
		this.cancelIdleTimer();
		const client = await waitWithAbort(this.ensureConnected(), signal);
		this.assertAvailable();
		this.cancelIdleTimer();
		this.activeLeases += 1;
		try {
			return await body(client);
		} finally {
			this.activeLeases -= 1;
			if (!this.disposing && this.activeLeases === 0 && this.client === client) this.scheduleIdleTimer();
		}
	}
	async withControlLease(signal, body) {
		this.assertAvailable();
		this.cancelIdleTimer();
		if (!await this.refreshControlMaster(signal)) throw new RemoteHostError(`remote host "${this.summary.id}" control socket is not active`, "AUTH_INTERACTIVE_REQUIRED");
		this.activeLeases += 1;
		try {
			return await body();
		} finally {
			this.activeLeases -= 1;
			if (!this.disposing && this.activeLeases === 0 && this.controlConnectedAt !== void 0) this.scheduleIdleTimer();
		}
	}
	/**
	* Confirm or clear the provider-owned control master.
	* @param signal - cancellation for the liveness probe.
	* @param options - set `preservePendingLogin` only for a passive peek, which
	*   must not turn a slow first check into a dead socket (see below).
	* @returns true when the control master is live.
	*/
	async refreshControlMaster(signal, options) {
		const target = this.controlTarget();
		if (target === void 0) return false;
		if (sshClientHasSyncLiveness(this.sshClient) && !controlSocketExists(target.controlPath)) {
			if (this.controlConnectedAt !== void 0) this.clearControlMasterState();
			return false;
		}
		if (!await isControlMasterActive(target, this.controlProbeRunner, signal ?? AbortSignal.timeout(this.options.limits.connectTimeoutMs))) {
			const pendingLogin = this.controlRequested && this.controlConnectedAt === void 0;
			if (!(options?.preservePendingLogin === true && pendingLogin)) {
				this.clearControlMasterState();
				if (sshClientHasSyncLiveness(this.sshClient)) removeControlSocket(target.controlPath);
			}
			return false;
		}
		if (this.controlConnectedAt === void 0) {
			this.controlConnectedAt = Date.now();
			this.clearFailure();
		}
		this.cancelIdleTimer();
		if (this.activeLeases === 0) this.scheduleIdleTimer();
		return true;
	}
	/** Accept the provider-owned socket path and mark the pending interactive login. */
	beginControlRequest(target) {
		if (sshClientHasSyncLiveness(this.sshClient)) {
			ensureControlSocketDirectory(target.controlPath);
			removeControlSocket(target.controlPath);
		}
		this.controlRequested = true;
		this.clearFailure();
	}
	/**
	* Start the one-time OpenSSH login that creates the provider-owned master.
	*
	* The OpenSSH client owns password and MFA entry, so the provider cannot
	* complete this login unattended; it only removes the need for the operator
	* to discover the terminal action first.
	*/
	async initiateControlMasterLogin() {
		const target = this.controlTarget();
		/* v8 ignore next -- preferControlMaster() gates this call on a configured control path, so controlTarget() is never undefined here. */
		if (target === void 0) return;
		this.beginControlRequest(target);
		try {
			await this.launchTerminal("create");
		} catch (error) {
			this.controlRequested = false;
			throw error;
		}
	}
	async launchTerminal(mode) {
		const open = this.options.openTerminal;
		if (open === void 0) throw new RemoteHostError(`remote host "${this.summary.id}" has no native terminal launcher`, "TERMINAL_UNAVAILABLE");
		await open(mode);
	}
	clearControlMasterState() {
		this.controlConnectedAt = void 0;
		this.reclaimAt = void 0;
		this.controlRequested = false;
	}
	async ensureConnected() {
		if (this.closePromise !== void 0) await this.closePromise;
		if (this.client !== void 0 && this.connectedAt !== void 0) return this.client;
		if (this.connectPromise !== void 0) return await this.connectPromise;
		const client = this.clientFactory();
		this.client = client;
		this.connectedAt = void 0;
		this.interactiveAuthRequired = false;
		const connecting = new Promise((resolve, reject) => {
			let ready = false;
			let settled = false;
			const rejectOnce = (error) => {
				if (settled) return;
				settled = true;
				const failure = this.pendingHostKeySha256 !== void 0 ? new RemoteHostError(`remote host "${this.summary.id}" presented untrusted host key ${this.pendingHostKeySha256}; confirm trust before reconnecting`, "HOST_KEY_UNTRUSTED", { cause: error }) : this.interactiveAuthRequired ? new RemoteHostError(`remote host "${this.summary.id}" requires interactive authentication; enter the password or MFA response in the Remote hosts panel before reconnecting`, "AUTH_INTERACTIVE_REQUIRED", { cause: error }) : error;
				this.recordFailure(failure);
				client.destroy();
				reject(failure);
			};
			client.on("error", (error) => {
				if (!ready) rejectOnce(error);
				else if (this.client === client && this.closePromise === void 0) {
					this.recordFailure(error);
					client.destroy();
				}
			});
			client.once("close", () => {
				if (this.client === client) this.client = void 0;
				if (!ready) rejectOnce(/* @__PURE__ */ new Error("SSH connection closed before authentication completed"));
				else if (this.closePromise === void 0 && !this.disposing) this.recordFailure(/* @__PURE__ */ new Error("SSH connection closed unexpectedly"));
			});
			client.once("ready", () => {
				if (settled) {
					client.destroy();
					return;
				}
				ready = true;
				settled = true;
				this.connectedAt = Date.now();
				this.clearFailure();
				this.scheduleIdleTimer();
				resolve(client);
			});
			client.on("keyboard-interactive", (name, instructions, _lang, prompts, finish) => {
				const challenge = prompts.map((prompt) => ({
					prompt: prompt.prompt,
					echo: prompt.echo ?? false
				}));
				const automatic = /* @__PURE__ */ new Map();
				const pending = [];
				challenge.forEach((prompt, index) => {
					if (this.authPassword !== void 0 && isPasswordPrompt(prompt)) automatic.set(index, this.authPassword);
					else pending.push(prompt);
				});
				const mergeResponses = (responses) => {
					let responseIndex = 0;
					return challenge.map((_prompt, index) => {
						const automaticResponse = automatic.get(index);
						if (automaticResponse !== void 0) return automaticResponse;
						return responses[responseIndex++] ?? "";
					});
				};
				if (pending.length === 0) {
					finish(mergeResponses([]));
					return;
				}
				const callback = this.authPrompt;
				if (callback === void 0) {
					this.interactiveAuthRequired = true;
					finish([]);
					return;
				}
				callback({
					name,
					instructions,
					prompts: pending
				}).then((responses) => finish(mergeResponses(responses)), () => finish([]));
			});
			try {
				client.connect(this.connectConfig());
			} catch (error) {
				rejectOnce(error instanceof Error ? error : new Error(String(error)));
			}
		});
		this.connectPromise = connecting;
		try {
			return await connecting;
		} finally {
			/* v8 ignore next -- only this frame assigns connectPromise; a concurrent ensureConnected awaits it instead. */
			if (this.connectPromise === connecting) this.connectPromise = void 0;
		}
	}
	connectConfig() {
		const expectedHash = this.trustedHostKeySha256;
		const username = this.summary.user;
		/* v8 ignore next -- the constructor rejects an empty user, so summary.user is always defined by the time connectConfig() runs. */
		if (username === void 0) throw new Error("remote-host-ssh: configured SSH user is unavailable");
		return {
			host: this.summary.hostname,
			port: this.summary.port,
			username,
			hostHash: "sha256",
			hostVerifier: (candidate) => {
				const normalized = candidate.toLowerCase();
				if (expectedHash !== void 0 && normalized === expectedHash) return true;
				this.pendingHostKeySha256 = normalized;
				return false;
			},
			readyTimeout: this.options.limits.connectTimeoutMs,
			keepaliveInterval: this.options.limits.keepaliveIntervalMs,
			keepaliveCountMax: this.options.limits.keepaliveCountMax,
			tryKeyboard: true,
			authHandler: this.options.agentSocket === void 0 ? this.options.privateKey === void 0 ? ["password", "keyboard-interactive"] : [
				"publickey",
				"password",
				"keyboard-interactive"
			] : ["agent", "keyboard-interactive"],
			...this.options.agentSocket !== void 0 ? { agent: this.options.agentSocket } : {},
			...this.authPassword !== void 0 ? { password: this.authPassword } : {},
			...this.options.privateKey !== void 0 ? { privateKey: this.options.privateKey } : {}
		};
	}
	scheduleIdleTimer() {
		if (!(this.client !== void 0 && this.connectedAt !== void 0 || this.controlConnectedAt !== void 0) || this.activeLeases > 0 || this.disposing) return;
		this.cancelIdleTimer();
		const idleDisconnectMs = this.connectionDurationMs ?? this.options.limits.idleDisconnectMs;
		this.reclaimAt = Date.now() + idleDisconnectMs;
		this.idleTimer = setTimeout(() => {
			this.idleTimer = void 0;
			this.reclaimAt = void 0;
			this.closeManagedConnections().catch((error) => {
				this.recordFailure(error instanceof Error ? error : new Error(String(error)));
			});
		}, idleDisconnectMs);
		this.idleTimer.unref();
	}
	cancelIdleTimer() {
		if (this.idleTimer !== void 0) clearTimeout(this.idleTimer);
		this.idleTimer = void 0;
		this.reclaimAt = void 0;
	}
	async closeConnection() {
		if (this.closePromise !== void 0) {
			await this.closePromise;
			return;
		}
		this.cancelIdleTimer();
		const client = this.client;
		if (client === void 0) {
			this.connectedAt = void 0;
			return;
		}
		const closing = new Promise((resolve) => {
			const escalation = setTimeout(() => {
				client.destroy();
			}, this.options.limits.disconnectTimeoutMs);
			escalation.unref();
			client.once("close", () => {
				clearTimeout(escalation);
				resolve();
			});
			try {
				client.end();
			} catch {
				client.destroy();
			}
		});
		this.closePromise = closing;
		try {
			await closing;
		} finally {
			if (this.client === client) this.client = void 0;
			this.connectedAt = void 0;
			/* v8 ignore next -- only this frame assigns closePromise; a re-entrant closeConnection awaits it instead. */
			if (this.closePromise === closing) this.closePromise = void 0;
		}
	}
	async closeManagedConnections() {
		await this.closeControlMaster();
		await this.closeConnection();
	}
	async closeControlMaster() {
		const target = this.controlTarget();
		if (target === void 0) return;
		this.cancelIdleTimer();
		const syncLiveness = sshClientHasSyncLiveness(this.sshClient);
		if (syncLiveness && !this.controlConnectedAt && !controlSocketExists(target.controlPath)) {
			this.clearControlMasterState();
			return;
		}
		try {
			await this.controlStatusRunner("ssh", sshControlExitArgs(target), AbortSignal.timeout(this.options.limits.disconnectTimeoutMs));
		} catch {} finally {
			if (syncLiveness) removeControlSocket(target.controlPath);
			this.clearControlMasterState();
		}
	}
	recordFailure(error) {
		this.failedAt = Date.now();
		this.failureMessage = connectionFailure(error);
	}
	clearFailure() {
		this.failedAt = void 0;
		this.failureMessage = void 0;
	}
	async executeThroughControlMaster(spec) {
		const target = this.controlTarget();
		/* v8 ignore next -- run() only reaches this after refreshControlMaster() confirmed a control target, which cannot change afterwards. */
		if (target === void 0) throw new RemoteHostError(`remote host "${this.summary.id}" has no control socket`, "AUTH_INTERACTIVE_REQUIRED");
		const env = this.controlEnvironment();
		const invocation = sshClientInvocation(this.sshClient, "ssh", sshControlExecArgs(target));
		const result = await this.controlScriptRunner(invocation, spec.command, {
			...spec.signal === void 0 ? {} : { signal: spec.signal },
			timeoutMs: spec.timeoutMs,
			maxOutputBytes: spec.maxOutputBytes,
			...env === void 0 ? {} : { env }
		});
		return {
			hostId: this.summary.id,
			...result
		};
	}
	controlEnvironment() {
		const socket = this.options.agentSocket;
		if (socket === void 0 || socket.toLowerCase() === "pageant") return void 0;
		return {
			...process.env,
			SSH_AUTH_SOCK: socket
		};
	}
	/** Bound one transfer by the request deadline and this provider's command cap. */
	transferTimeoutMs(request) {
		const requested = request.timeoutMs ?? this.options.limits.commandTimeoutMs;
		if (!Number.isFinite(requested) || requested <= 0) throw new Error("remote-host-ssh: transfer timeoutMs must be a positive finite number");
		return Math.min(requested, this.options.limits.commandTimeoutMs);
	}
	/** Combine caller cancellation with one transfer deadline. */
	transferSignal(signal, timeoutMs) {
		const deadline = AbortSignal.timeout(timeoutMs);
		return signal === void 0 ? deadline : AbortSignal.any([signal, deadline]);
	}
	/**
	* Run one control probe and keep a transport failure out of the caller's
	* stable code.
	*
	* Only a THROWN probe is a transport failure. A probe that returns something
	* other than a byte count says the remote target is not a readable file,
	* which stays `TRANSFER_PATH_INVALID`: that is a fact about the destination,
	* not a broken connection.
	* @param target - validated SSH and control-socket fields.
	* @param script - fixed probe script sent on stdin.
	* @param remotePath - absolute POSIX remote file path, passed by environment.
	* @param timeoutMs - probe deadline in milliseconds.
	* @param signal - caller cancellation.
	* @returns the probe's trimmed standard output.
	* @throws {RemoteHostError} `TRANSFER_FAILED` when the probe itself fails.
	*/
	async controlProbe(target, script, remotePath, timeoutMs, signal) {
		try {
			return await this.runControlProbe(target, script, remotePath, timeoutMs, signal);
		} catch (cause) {
			throw transferCopyFailure(cause);
		}
	}
	/** Run one fixed, stdin-fed probe with the target path supplied through the environment. */
	async runControlProbe(target, script, remotePath, timeoutMs, signal) {
		const base = this.controlEnvironment() ?? process.env;
		const invocation = sshClientInvocation(this.sshClient, "ssh", sshControlExecArgs(target));
		return (await this.controlScriptRunner(invocation, script, {
			...signal === void 0 ? {} : { signal },
			timeoutMs,
			maxOutputBytes: CONTROL_PROBE_MAX_OUTPUT_BYTES,
			env: {
				...base,
				[CONTROL_TRANSFER_PATH_VAR]: remotePath
			}
		})).stdout.text.trim();
	}
	async transferThroughControlMaster(direction, request, timeoutMs, startedAt) {
		const target = this.controlTarget();
		/* v8 ignore start -- transfer() only reaches this after refreshControlMaster() confirmed a live control target. */
		if (target === void 0) throw new RemoteHostError(`remote host "${this.summary.id}" has no control socket`, "AUTH_INTERACTIVE_REQUIRED");
		/* v8 ignore stop */
		const maxTransferBytes = this.options.limits.maxTransferBytes;
		let bytes;
		if (direction === "upload") {
			bytes = localFileBytes(request.localPath);
			assertWithinTransferLimit(bytes, maxTransferBytes);
			if (request.overwrite !== true) {
				if (await this.controlProbe(target, CONTROL_PATH_EXISTS_SCRIPT, request.remotePath, timeoutMs, request.signal) === "present") throw new RemoteHostError(`transfer remote path "${request.remotePath}" already exists and overwrite was not requested`, "TRANSFER_PATH_INVALID");
			}
		} else {
			if (request.overwrite !== true && existsSync(request.localPath)) throw new RemoteHostError(`transfer local path "${request.localPath}" already exists and overwrite was not requested`, "TRANSFER_PATH_INVALID");
			const reported = await this.controlProbe(target, CONTROL_FILE_BYTES_SCRIPT, request.remotePath, timeoutMs, request.signal);
			const parsed = /^\d+$/u.test(reported) ? Number.parseInt(reported, 10) : NaN;
			if (!Number.isSafeInteger(parsed) || parsed < 0) throw new RemoteHostError(`transfer remote path "${request.remotePath}" is not a readable file`, "TRANSFER_PATH_INVALID");
			assertWithinTransferLimit(parsed, maxTransferBytes);
			bytes = parsed;
		}
		try {
			await this.transferRunner("scp", sshControlScpArgs(target, direction, request.localPath, request.remotePath), this.transferSignal(request.signal, timeoutMs));
		} catch (cause) {
			throw transferCopyFailure(cause);
		}
		return transferResult(this.summary.id, direction, bytes, request, "control-master", startedAt);
	}
	async transferThroughSftp(client, direction, request, timeoutMs) {
		let sftp;
		try {
			sftp = await this.sftpFactory(client);
		} catch (cause) {
			throw transferCopyFailure(cause);
		}
		try {
			return await runSftpTransfer(sftp, direction, request, {
				maxTransferBytes: this.options.limits.maxTransferBytes,
				timeoutMs,
				...request.signal === void 0 ? {} : { signal: request.signal }
			});
		} finally {
			sftp.end();
		}
	}
	async execute(client, spec) {
		const stdout = new TextRetainer({
			kind: "tail",
			maxBytes: spec.maxOutputBytes
		});
		const stderr = new TextRetainer({
			kind: "tail",
			maxBytes: spec.maxOutputBytes
		});
		let exitCode = null;
		let exitSignal = null;
		let timedOut = false;
		let aborted = false;
		return await new Promise((resolve, reject) => {
			let settled = false;
			let channel;
			const result = () => {
				const retainedStdout = stdout.finish();
				const retainedStderr = stderr.finish();
				return {
					hostId: this.summary.id,
					exitCode,
					signal: exitSignal,
					timedOut,
					aborted,
					stdout: {
						text: retainedStdout.text,
						truncated: retainedStdout.truncated
					},
					stderr: {
						text: retainedStderr.text,
						truncated: retainedStderr.truncated
					}
				};
			};
			const cleanup = () => {
				clearTimeout(deadline);
				spec.signal?.removeEventListener("abort", onAbort);
			};
			const resolveOnce = () => {
				if (settled) return;
				settled = true;
				cleanup();
				resolve(result());
			};
			const rejectOnce = (error) => {
				if (settled) return;
				settled = true;
				cleanup();
				reject(error);
			};
			const terminate = () => {
				if (channel === void 0) {
					resolveOnce();
					return;
				}
				try {
					channel.signal("TERM");
				} catch {}
				channel.destroy();
			};
			const onAbort = () => {
				aborted = true;
				terminate();
			};
			const deadline = setTimeout(() => {
				timedOut = true;
				terminate();
			}, spec.timeoutMs);
			deadline.unref();
			/* v8 ignore start -- reaching execute() means the lease already cleared this signal, so this is a no-op. */
			if (spec.signal?.aborted === true) {
				aborted = true;
				terminate();
				return;
			}
			/* v8 ignore stop */
			spec.signal?.addEventListener("abort", onAbort, { once: true });
			client.exec(POSIX_STDIN_COMMAND, (error, openedChannel) => {
				if (settled) {
					openedChannel.destroy();
					return;
				}
				if (error !== void 0) {
					rejectOnce(error);
					return;
				}
				channel = openedChannel;
				channel.on("data", (chunk) => stdout.push(chunk));
				channel.stderr.on("data", (chunk) => stderr.push(chunk));
				channel.on("exit", (code, signal) => {
					exitCode = code;
					exitSignal = signal ?? null;
				});
				channel.once("error", rejectOnce);
				channel.once("close", resolveOnce);
				/* v8 ignore start -- an elapsed deadline or abort always settles before this callback fires. */
				if (timedOut || aborted) {
					terminate();
					return;
				}
				/* v8 ignore stop */
				channel.end(spec.command);
			});
		});
	}
};
//#endregion
//#region lib/types/index.js
/** `ssh2` Service Provider for the DSH remote-host capability. */
const MAX_NODE_TIMER_DELAY_MS = 2147483647;
const HOST_KEY_SHA256 = /^[0-9a-f]{64}$/u;
const SSH_CLIENT_CHOICES = [
	"auto",
	"native",
	"wsl"
];
/** Cordis plugin name used by loader diagnostics. */
const name = "remote-host-ssh";
/** Remote-host registry required before provider registration. */
const inject = [
	"remoteHosts",
	"credentials",
	"settings"
];
const SETTINGS_NAMESPACE = "remote-host-ssh";
const hostConfig = z.object({
	id: z.string().required(),
	label: z.string().required(),
	kind: z.union(["server", "cluster"]).default("server"),
	hostname: z.string().required(),
	port: z.number().step(1).min(1).max(65535).default(22),
	user: z.string().required(),
	hostKeySha256: z.string().role("secret"),
	identityFile: z.string().role("secret"),
	agentSocket: z.string().role("secret"),
	passwordAuth: z.boolean().default(false),
	controlMaster: z.boolean(),
	controlPersistSeconds: z.number().step(1).min(1)
});
/** Loader schema with explicit, deployment-overridable defaults. */
const Config = z.object({
	hosts: z.array(hostConfig).default([]),
	idleDisconnectMs: z.number().default(18e6),
	connectTimeoutMs: z.number().default(2e4),
	disconnectTimeoutMs: z.number().default(5e3),
	commandTimeoutMs: z.number().default(6e4),
	maxOutputBytes: z.number().default(256e3),
	maxTransferBytes: z.number().default(268435456),
	passwordControlMaster: z.boolean().default(true),
	controlPersistSeconds: z.number().default(900),
	keepaliveIntervalMs: z.number().default(15e3),
	keepaliveCountMax: z.number().default(3),
	sshClient: z.union([
		"auto",
		"native",
		"wsl"
	]).default("auto"),
	wslDistro: z.string()
});
function sameRuntimeConfig(left, right) {
	const withoutTrust = (config) => ({
		...config,
		hosts: config.hosts.map(({ hostKeySha256: _hostKeySha256, ...host }) => host)
	});
	return deepEqualJson(withoutTrust(left), withoutTrust(right));
}
function assertNonEmpty(name, value) {
	if (value.trim().length === 0) throw new Error(`remote-host-ssh: ${name} must be non-empty`);
}
function assertPositiveTimer(name, value) {
	if (!Number.isFinite(value) || value <= 0 || value > MAX_NODE_TIMER_DELAY_MS) throw new Error(`remote-host-ssh: ${name} must be a positive finite number no greater than ${MAX_NODE_TIMER_DELAY_MS}`);
}
function assertPositiveInteger(name, value) {
	if (!Number.isInteger(value) || value <= 0) throw new Error(`remote-host-ssh: ${name} must be a positive integer`);
}
function resolveAuthReference(value) {
	const normalized = value.replace(/^\\~(?=[\\/]|$)/u, "~");
	if (normalized === "~") return homedir();
	if (normalized.startsWith("~/") || normalized.startsWith("~\\")) return join(homedir(), normalized.slice(2));
	return normalized;
}
function passwordCredentialKey(hostId) {
	return credentialKey("remote-host-ssh", `host-${createHash("sha256").update(hostId).digest("hex")}`);
}
function validateHostKey(host) {
	if (host.hostKeySha256 !== void 0 && !HOST_KEY_SHA256.test(host.hostKeySha256)) throw new Error(`remote-host-ssh: host "${host.id}" hostKeySha256 must be a lowercase hexadecimal SHA-256 hash`);
}
function validate(config) {
	assertPositiveTimer("idleDisconnectMs", config.idleDisconnectMs);
	assertPositiveTimer("connectTimeoutMs", config.connectTimeoutMs);
	assertPositiveTimer("disconnectTimeoutMs", config.disconnectTimeoutMs);
	assertPositiveTimer("commandTimeoutMs", config.commandTimeoutMs);
	if (!Number.isInteger(config.maxOutputBytes) || config.maxOutputBytes <= 0) throw new Error("remote-host-ssh: maxOutputBytes must be a positive integer");
	assertPositiveInteger("maxTransferBytes", config.maxTransferBytes);
	assertPositiveInteger("controlPersistSeconds", config.controlPersistSeconds);
	if (typeof config.passwordControlMaster !== "boolean") throw new Error("remote-host-ssh: passwordControlMaster must be a boolean");
	if (!Number.isInteger(config.keepaliveIntervalMs) || config.keepaliveIntervalMs < 0) throw new Error("remote-host-ssh: keepaliveIntervalMs must be a non-negative integer");
	if (!Number.isInteger(config.keepaliveCountMax) || config.keepaliveCountMax <= 0) throw new Error("remote-host-ssh: keepaliveCountMax must be a positive integer");
	const sshClient = config.sshClient;
	if (sshClient !== void 0 && !SSH_CLIENT_CHOICES.includes(sshClient)) throw new Error("remote-host-ssh: sshClient must be one of \"auto\", \"native\", or \"wsl\"");
	if (config.wslDistro !== void 0) assertNonEmpty("wslDistro", config.wslDistro);
	const ids = /* @__PURE__ */ new Set();
	for (const host of config.hosts) {
		assertNonEmpty("host id", host.id);
		assertNonEmpty(`host "${host.id}" label`, host.label);
		assertNonEmpty(`host "${host.id}" hostname`, host.hostname);
		assertNonEmpty(`host "${host.id}" user`, host.user);
		if (ids.has(host.id)) throw new Error(`remote-host-ssh: duplicate host id "${host.id}"`);
		ids.add(host.id);
		validateHostKey(host);
		if ([
			host.identityFile !== void 0,
			host.agentSocket !== void 0,
			host.passwordAuth === true
		].filter(Boolean).length !== 1) throw new Error(`remote-host-ssh: host "${host.id}" must configure exactly one of identityFile, agentSocket, or passwordAuth`);
		if (host.identityFile !== void 0) assertNonEmpty(`host "${host.id}" identityFile`, host.identityFile);
		if (host.agentSocket !== void 0) assertNonEmpty(`host "${host.id}" agentSocket`, host.agentSocket);
		if (host.controlMaster !== void 0 && typeof host.controlMaster !== "boolean") throw new Error(`remote-host-ssh: host "${host.id}" controlMaster must be a boolean`);
		if (host.controlPersistSeconds !== void 0) assertPositiveInteger(`host "${host.id}" controlPersistSeconds`, host.controlPersistSeconds);
	}
}
/**
* Validate the complete inventory, load private keys, and register one backend per host.
* @param ctx - Cordis context carrying the remote-host registry.
* @param config - loader-populated provider configuration.
*/
function apply(ctx, config) {
	let current = () => config;
	let activeConfig;
	let activeDisposers = [];
	let reconcileTail = Promise.resolve();
	let settingsScope;
	let persistHostKey = async () => {};
	let removeConfiguredHost = async () => {
		throw new Error("remote-host-ssh: conversational host removal requires a writable settings provider");
	};
	const limitsOf = (resolved) => ({
		idleDisconnectMs: resolved.idleDisconnectMs,
		connectTimeoutMs: resolved.connectTimeoutMs,
		disconnectTimeoutMs: resolved.disconnectTimeoutMs,
		commandTimeoutMs: resolved.commandTimeoutMs,
		maxOutputBytes: resolved.maxOutputBytes,
		maxTransferBytes: resolved.maxTransferBytes,
		keepaliveIntervalMs: resolved.keepaliveIntervalMs,
		keepaliveCountMax: resolved.keepaliveCountMax
	});
	const buildBackends = (resolved) => {
		validate(resolved);
		const limits = limitsOf(resolved);
		const client = resolveSshClient(resolved.sshClient, resolved.wslDistro === void 0 ? {} : { distro: resolved.wslDistro });
		return resolved.hosts.map((host) => {
			const identityFile = host.identityFile === void 0 ? void 0 : resolveAuthReference(host.identityFile);
			const controlPath = sshClientSupportsMultiplexing(client) ? controlPathForHost(host.id, client) : void 0;
			const controlPersistSeconds = host.controlPersistSeconds ?? resolved.controlPersistSeconds;
			return new SshRemoteHostBackend({
				summary: {
					id: RemoteHostId(host.id),
					label: host.label,
					kind: host.kind ?? "server",
					hostname: host.hostname,
					port: host.port ?? 22,
					user: host.user
				},
				...host.hostKeySha256 !== void 0 ? { hostKeySha256: host.hostKeySha256 } : {},
				onHostKeyTrust: (hostKeySha256) => persistHostKey(host.id, hostKeySha256),
				remove: async () => {
					await removeConfiguredHost(host.id);
				},
				limits,
				...controlPath === void 0 ? {} : { controlPath },
				passwordControlMaster: host.controlMaster ?? resolved.passwordControlMaster,
				controlPersistSeconds,
				...identityFile === void 0 ? {} : { identityFile },
				client,
				openTerminal: (mode) => openSshRemoteTerminal({
					label: host.label,
					hostname: host.hostname,
					port: host.port ?? 22,
					user: host.user,
					...identityFile === void 0 ? {} : { identityFile },
					...host.agentSocket === void 0 ? {} : { agentSocket: resolveAuthReference(host.agentSocket) },
					...controlPath === void 0 ? {} : { controlPath },
					controlPersistSeconds,
					serverAliveIntervalSeconds: Math.max(1, Math.ceil(limits.keepaliveIntervalMs / 1e3)),
					serverAliveCountMax: limits.keepaliveCountMax,
					client,
					...mode === void 0 ? {} : { controlMasterMode: mode }
				}),
				...identityFile === void 0 ? {} : { privateKey: readFileSync(identityFile) },
				...host.agentSocket !== void 0 ? { agentSocket: resolveAuthReference(host.agentSocket) } : {},
				resolvePassword: async () => {
					const record = await ctx.credentials.readRecord(passwordCredentialKey(host.id));
					return record?.kind === "api-key" ? record.key : void 0;
				},
				savePassword: async (password) => {
					await ctx.credentials.modifyRecord(passwordCredentialKey(host.id), async () => ({
						kind: "api-key",
						key: password
					}));
				}
			});
		});
	};
	const reconcile = () => {
		reconcileTail = reconcileTail.then(async () => {
			const next = current();
			if (activeConfig !== void 0 && sameRuntimeConfig(next, activeConfig)) return;
			const candidates = buildBackends(next);
			const old = activeDisposers;
			activeDisposers = [];
			await Promise.all(old.map((dispose) => dispose()));
			const registered = [];
			try {
				for (const backend of candidates) registered.push(ctx.remoteHosts.register(backend));
			} catch (error) {
				await Promise.allSettled(registered.map((dispose) => dispose()));
				throw error;
			}
			activeDisposers = registered;
			activeConfig = next;
		});
		return reconcileTail;
	};
	const initial = current();
	activeDisposers = buildBackends(initial).map((backend) => ctx.remoteHosts.register(backend));
	activeConfig = initial;
	ctx.provide("remoteHostSshConfig", { createHost: async (host) => {
		const settings = settingsScope;
		if (settings === void 0) throw new Error("remote-host-ssh: conversational host creation requires a writable settings provider");
		const resolved = current();
		if (resolved.hosts.some((candidate) => candidate.id === host.id)) throw new Error(`remote-host-ssh: duplicate host id "${host.id}"`);
		const next = {
			...resolved,
			hosts: [...resolved.hosts, host]
		};
		buildBackends(next);
		await settings.update({ hosts: next.hosts });
		await reconcile();
		return {
			id: host.id,
			label: host.label,
			kind: host.kind ?? "server",
			hostname: host.hostname,
			port: host.port ?? 22,
			user: host.user
		};
	} });
	const installSettings = (settingsCtx) => {
		if (settingsScope !== void 0) return;
		settingsScope = settingsCtx.settings.register(SETTINGS_NAMESPACE, Config, {
			base: config,
			validate: (value) => {
				validate(value);
			}
		});
		persistHostKey = async (hostId, hostKeySha256) => {
			const scope = settingsScope;
			/* v8 ignore next -- settingsScope is assigned above before this disposer exists, so the guard only re-widens the closure type. */
			if (scope === void 0) return;
			const hosts = scope.get().hosts.map((host) => host.id === hostId ? {
				...host,
				hostKeySha256
			} : host);
			await scope.update({ hosts });
		};
		removeConfiguredHost = async (hostId) => {
			const scope = settingsScope;
			/* v8 ignore next -- installSettings runs before this closure exists; the guard only re-widens the closure type. */
			if (scope === void 0) return;
			const resolved = scope.get();
			if (!resolved.hosts.some((host) => host.id === hostId)) throw new RemoteHostError(`remote host "${hostId}" is not configured`, "HOST_NOT_FOUND");
			const next = {
				...resolved,
				hosts: resolved.hosts.filter((host) => host.id !== hostId)
			};
			await scope.update({ hosts: next.hosts });
			await reconcile();
			await ctx.credentials.deleteRecord(passwordCredentialKey(hostId));
		};
		current = () => {
			const scope = settingsScope;
			/* v8 ignore next -- current() runs only after installSettings assigned settingsScope, so the composition fallback is unreachable. */
			return scope === void 0 ? config : scope.get();
		};
		reconcile().catch((error) => {
			ctx.logger.error("remote-host-ssh: keeping the previous inventory after a settings update failed");
			ctx.logger.error(error);
		});
		settingsScope.watch(() => {
			reconcile().catch((error) => {
				ctx.logger.error("remote-host-ssh: keeping the previous inventory after a settings update failed");
				ctx.logger.error(error);
			});
		});
	};
	if (ctx.get("settings") !== void 0) installSettings(ctx);
	ctx.inject(["settings"], installSettings);
}
//#endregion
export { Config, SshRemoteHostBackend, apply, inject, name, openSshRemoteTerminal, sshRemoteTerminalArgs };
