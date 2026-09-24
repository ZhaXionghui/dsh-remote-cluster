/** Model-facing remote host tools over the provider-neutral `ctx.remoteHosts` service. */
import { RemoteHostId, } from '../../../host-remote-host/lib/index.js';
import { HarnessError } from '@deepseek-ai/dsh-llm';
import { defineTool, TOOL_ABORTED } from '@deepseek-ai/dsh-tools';
import { withEnvelope } from "./envelope.js";
export const name = 'tool-remote-host';
export const inject = ['tools', 'remoteHosts', 'systemPrompt'];
const HOST_ID = {
    type: 'string',
    required: true,
    description: 'Exact configured host id returned by remote_host_list.',
};
const LOCAL_PATH = {
    type: 'string',
    required: true,
    description: 'Absolute local file path. The file is read for an upload and written for a download.',
};
const REMOTE_PATH = {
    type: 'string',
    required: true,
    description: 'Absolute POSIX remote file path. The file is written for an upload and read for a download.',
};
const TRANSFER_TIMEOUT = {
    type: 'number',
    description: 'Optional positive transfer deadline in milliseconds; the provider clamps it to its configured cap.',
};
function hostId(value) {
    if (value.trim().length === 0)
        throw new Error('host_id must be a non-empty string');
    return RemoteHostId(value);
}
function renderJson(value) {
    return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
}
function present(title) {
    return () => {
        const lower = title.toLowerCase();
        const mutating = ['run', 'connect', 'disconnect', 'create', 'delete', 'upload', 'download'].some(word => lower.includes(word));
        return { card: 'generic', title, kind: mutating ? 'execute' : 'read' };
    };
}
function throwIfAborted(result, exec) {
    if (result.aborted) {
        throw new HarnessError(`remote host operation aborted (${exec.name})`, TOOL_ABORTED);
    }
}
/** Read the transport currently carrying one host, if any. */
function transportOf(snapshot) {
    const { connection } = snapshot;
    if (connection.state === 'connected-active' || connection.state === 'connected-idle')
        return connection.transport;
    return undefined;
}
/** Envelope meta for one host-scoped tool result. */
function hostMeta(snapshot) {
    const transport = transportOf(snapshot);
    return {
        host_id: snapshot.id,
        ...transport === undefined ? {} : { transport },
    };
}
/** Envelope meta read after one operation completed. */
function currentHostMeta(ctx, id) {
    try {
        return hostMeta(ctx.remoteHosts.status(id));
    }
    catch {
        // Only the status read for diagnostics is swallowed; the completed operation stands.
        return { host_id: id };
    }
}
/** Envelope meta for one completed transfer. */
function transferMeta(result) {
    return { host_id: result.hostId, transport: result.transport, bytes: result.bytes };
}
/** Validate one transfer tool call and build the provider-neutral request. */
function transferRequest(hostValue, localPath, remotePath, overwrite, timeoutMs, signal) {
    if (localPath.trim().length === 0)
        throw new Error('local_path must be a non-empty string');
    if (remotePath.trim().length === 0)
        throw new Error('remote_path must be a non-empty string');
    if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
        throw new Error('timeout_ms must be a positive finite number');
    }
    return {
        hostId: hostId(hostValue),
        localPath,
        remotePath,
        ...overwrite === undefined ? {} : { overwrite },
        ...timeoutMs === undefined ? {} : { timeoutMs },
        signal,
    };
}
const REMOTE_HOST_PROMPT = [
    'Use remote_host_list before selecting a target. Remote host operations require an explicit user request; never invent a host id, credentials, or a command.',
    'When a user sends an OpenSSH block containing Host, HostName, User, IdentityFile, or IdentityAgent, treat it as a request to add a host.',
    'Map Host to id and the default label, HostName to hostname, User to user, Port to port, IdentityFile to identity_file, IdentityAgent to agent_socket, and a missing key or agent to password.',
    'Normalize a leading ~ or escaped \\~ in local paths, and first show a non-persistent draft with id, label, kind, hostname, port, user, auth_mode, and auth_path.',
    'Ask the user to correct or explicitly confirm that draft in a new message before calling remote_host_create, even when the block is otherwise complete.',
    'The user confirmation itself establishes trust for the first server key; do not ask the user to copy host_key_sha256. If a later connection presents a different key, stop and ask the user to confirm trust again.',
    'After that confirmation, call remote_host_connect with retrust=true; never invent a key or put a fingerprint into the create request.',
    'A password or MFA value supplied in chat is sensitive: never repeat it, place it in a tool argument, or store it in host settings. If remote_host_connect reports that interactive authentication is required, do not retry in the same turn; direct the user to the Remote hosts panel to choose the connection-retention time, enter the password, and answer MFA there.',
    'remote_host_create persists one SSH host configuration and always requires one-time user approval; if it is rejected, do not retry in the same turn and wait for a new user message.',
    'The create request carries only a local key-file or agent-socket reference, or password mode without a secret; never put private-key bytes or passwords into a model request.',
    'remote_host_delete removes one configured host, its stored password credential, and its provider registration, and always requires one-time user approval; if it is rejected, do not retry in the same turn and wait for a new user message.',
    'remote_host_run sends one POSIX command string to the selected configured host, is foreground-only, and returns bounded stdout/stderr.',
    'A password-only host defaults to the OpenSSH ControlMaster path: its first connection needs a one-time interactive login in the terminal, and later operations reuse that authenticated socket without asking for the password again.',
    'On that ControlMaster path the server key is verified by the local OpenSSH known_hosts decision instead of the harness host-key pin, so no host_key_sha256 confirmation applies; a key the OpenSSH client itself rejects still stops the connection.',
    'remote_host_upload and remote_host_download move one single file each between absolute local and remote paths, require one-time user approval, and are bounded by the provider transfer limit; they never accept directories, credentials, or transport options.',
    'A cluster is represented by its configured login node; scheduler submission is not part of this tool.',
].join(' ');
/** Register the remote-host inventory, lifecycle, inspection, execution, and transfer tools. */
export function apply(ctx) {
    ctx.systemPrompt.section({
        name: 'tool:remote-host',
        order: ctx.systemPrompt.getSectionOrder('TOOL_CORDIS') + 10,
        text: REMOTE_HOST_PROMPT,
    });
    ctx.on('tools/pre-execute', async (exec, next) => {
        if (exec.name === 'remote_host_connect' && typeof exec.arguments === 'object' && exec.arguments !== null
            && 'retrust' in exec.arguments && exec.arguments.retrust === true) {
            return {
                kind: 'ask',
                reason: 'The server presented a new SSH host key. The user must confirm trusting this changed key before reconnecting.',
            };
        }
        if (exec.name === 'remote_host_upload') {
            return {
                kind: 'ask',
                reason: 'Uploading reads a local file and sends its contents to the configured remote host.',
            };
        }
        if (exec.name === 'remote_host_download') {
            return {
                kind: 'ask',
                reason: 'Downloading writes a file from the configured remote host into the local filesystem.',
            };
        }
        if (exec.name === 'remote_host_delete') {
            return {
                kind: 'ask',
                reason: 'Deleting a remote-host configuration removes durable settings and its stored password credential.',
            };
        }
        if (exec.name !== 'remote_host_create')
            return await next();
        return {
            kind: 'ask',
            reason: 'Creating a remote-host configuration writes durable settings and may enable network access to the declared SSH target.',
        };
    });
    ctx.tools.register(defineTool({
        name: 'remote_host_create',
        description: 'Create and persist one SSH remote-host configuration after the user explicitly confirms the displayed draft. The first connection requires a separate trust confirmation for the server key; this changes durable settings and requires one-time approval. Provide a local identity-file or agent-socket reference, or password mode without a password value.',
        parameters: {
            id: { type: 'string', required: true, description: 'Stable non-empty host id.' },
            label: { type: 'string', required: true, description: 'Display name shown in the Remote hosts panel.' },
            kind: { type: 'string', required: true, description: 'Host classification: server or cluster.' },
            hostname: { type: 'string', required: true, description: 'DNS name or IP address.' },
            port: { type: 'number', required: true, description: 'SSH port from 1 to 65535.' },
            user: { type: 'string', required: true, description: 'Remote login user.' },
            auth_mode: { type: 'string', required: true, description: 'Authentication kind: identity_file, agent_socket, or password.' },
            auth_path: { type: 'string', description: 'Local path to the private-key file or SSH agent endpoint; omit for password mode.' },
        },
        output: { schema: { type: 'json' }, render: (_args, value) => renderJson(value) },
        execute: async (args) => await withEnvelope('remote_host_create', async () => {
            const writer = ctx.get('remoteHostSshConfig');
            if (writer === undefined) {
                throw new Error('remote_host_create is unavailable: the SSH remote-host provider or writable settings service is not mounted');
            }
            if (args.kind !== 'server' && args.kind !== 'cluster')
                throw new Error('kind must be "server" or "cluster"');
            if (args.auth_mode !== 'identity_file' && args.auth_mode !== 'agent_socket' && args.auth_mode !== 'password') {
                throw new Error('auth_mode must be "identity_file", "agent_socket", or "password"');
            }
            if (args.id.trim().length === 0 || args.label.trim().length === 0
                || args.hostname.trim().length === 0 || args.user.trim().length === 0) {
                throw new Error('id, label, hostname, and user must be non-empty strings');
            }
            if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65_535)
                throw new Error('port must be an integer from 1 to 65535');
            if (args.auth_mode !== 'password' && (args.auth_path === undefined || args.auth_path.trim().length === 0)) {
                throw new Error('auth_path must be a non-empty local path unless auth_mode is "password"');
            }
            const host = {
                id: args.id,
                label: args.label,
                kind: args.kind,
                hostname: args.hostname,
                port: args.port,
                user: args.user,
                ...(args.auth_mode === 'identity_file' && args.auth_path !== undefined ? { identityFile: args.auth_path } : {}),
                ...(args.auth_mode === 'agent_socket' && args.auth_path !== undefined ? { agentSocket: args.auth_path } : {}),
                ...(args.auth_mode === 'password' ? { passwordAuth: true } : {}),
            };
            return await writer.createHost(host);
        }),
        presentCall: args => present(`Create remote host ${args.id}`)(),
    }));
    ctx.tools.register(defineTool({
        name: 'remote_host_list',
        description: 'List configured remote servers and cluster login nodes without opening a connection.',
        parameters: {},
        output: { schema: { type: 'json' }, render: (_args, value) => renderJson(value) },
        execute: async () => await withEnvelope('remote_host_list', async () => ctx.remoteHosts.list(), value => ({ count: Array.isArray(value) ? value.length : 0 })),
        presentCall: present('List remote hosts'),
    }));
    ctx.tools.register(defineTool({
        name: 'remote_host_status',
        description: 'Read one configured remote host and its current connection lifecycle state, including the connection path in use.',
        parameters: { host_id: HOST_ID },
        output: { schema: { type: 'json' }, render: (_args, value) => renderJson(value) },
        execute: async (args) => await withEnvelope('remote_host_status', async () => ctx.remoteHosts.status(hostId(args.host_id)), hostMeta),
        presentCall: args => present(`Read remote host ${args.host_id}`)(),
    }));
    ctx.tools.register(defineTool({
        name: 'remote_host_inspect',
        description: 'Collect safe basic facts from one remote host, including OS, kernel, uptime, CPU, memory, load, and root disk when available.',
        parameters: { host_id: HOST_ID },
        output: { schema: { type: 'json' }, render: (_args, value) => renderJson(value) },
        execute: async (args, exec) => await withEnvelope('remote_host_inspect', async () => {
            const id = hostId(args.host_id);
            const facts = await ctx.remoteHosts.inspect(id, exec.signal);
            return { facts, host: ctx.remoteHosts.status(id) };
        }, value => hostMeta(value.host)),
        presentCall: args => present(`Inspect remote host ${args.host_id}`)(),
    }));
    ctx.tools.register(defineTool({
        name: 'remote_host_connect',
        description: 'Open or reuse the provider-owned connection for one configured remote host. Set retrust=true only after the user confirms a newly presented server key; the fingerprint is discovered by the provider. A password-only host defaults to the OpenSSH ControlMaster path, whose first connection needs a one-time interactive terminal login. This tool never accepts a password or MFA response; use the Remote hosts panel for interactive authentication.',
        parameters: { host_id: HOST_ID, retrust: { type: 'boolean', description: 'Set true only after the user explicitly confirms a newly presented server key.' } },
        output: { schema: { type: 'json' }, render: (_args, value) => renderJson(value) },
        execute: async (args, exec) => await withEnvelope('remote_host_connect', async () => {
            const id = hostId(args.host_id);
            if (args.retrust === true)
                await ctx.remoteHosts.trustHostKey(id);
            return await ctx.remoteHosts.connect(id, exec.signal);
        }, hostMeta),
        presentCall: args => present(`Connect remote host ${args.host_id}`)(),
    }));
    ctx.tools.register(defineTool({
        name: 'remote_host_disconnect',
        description: 'Close one remote host connection after the current leases finish; fails while foreground work is active.',
        parameters: { host_id: HOST_ID },
        output: { schema: { type: 'json' }, render: (_args, value) => renderJson(value) },
        execute: async (args) => await withEnvelope('remote_host_disconnect', async () => await ctx.remoteHosts.disconnect(hostId(args.host_id), 'model requested disconnect'), hostMeta),
        presentCall: args => present(`Disconnect remote host ${args.host_id}`)(),
    }));
    ctx.tools.register(defineTool({
        name: 'remote_host_delete',
        description: 'Remove one configured SSH remote host: its durable settings, its stored password credential, and its provider registration. This always requires one-time user approval; if the approval is rejected, do not retry in the same turn and wait for a new user message.',
        parameters: { host_id: HOST_ID },
        output: { schema: { type: 'json' }, render: (_args, value) => renderJson(value) },
        execute: async (args) => await withEnvelope('remote_host_delete', async () => {
            const id = hostId(args.host_id);
            // Capture the summary before removal so the result still describes the
            // host that was deleted.
            const summary = ctx.remoteHosts.status(id);
            await ctx.remoteHosts.remove(id);
            return summary;
        }, hostMeta),
        presentCall: args => present(`Delete remote host ${args.host_id}`)(),
    }));
    ctx.tools.register(defineTool({
        name: 'remote_host_run',
        description: 'Run one explicit POSIX command string in the foreground on a configured remote host. The command reaches the remote shell through stdin; no credentials or arbitrary local transport settings are accepted and output is bounded by the provider.',
        parameters: {
            host_id: HOST_ID,
            command: { type: 'string', required: true, description: 'POSIX shell command string sent through stdin.' },
            timeout_ms: { type: 'number', description: 'Optional positive execution deadline in milliseconds; the provider clamps it to its configured cap.' },
        },
        output: { schema: { type: 'json' }, render: (_args, value) => renderJson(value) },
        execute: async (args, exec) => {
            const id = hostId(args.host_id);
            return await withEnvelope('remote_host_run', async () => {
                if (args.command.trim().length === 0)
                    throw new Error('command must be a non-empty string');
                if (args.timeout_ms !== undefined && (!Number.isFinite(args.timeout_ms) || args.timeout_ms <= 0)) {
                    throw new Error('timeout_ms must be a positive finite number');
                }
                const spec = ctx.remoteHosts.resolve({
                    hostId: id,
                    command: args.command,
                    ...(args.timeout_ms !== undefined ? { timeoutMs: args.timeout_ms } : {}),
                    signal: exec.signal,
                });
                const result = await ctx.remoteHosts.run(spec);
                throwIfAborted(result, exec);
                return result;
            }, () => currentHostMeta(ctx, id));
        },
        presentCall: args => present(`Run command on remote host ${args.host_id}`)(),
    }));
    ctx.tools.register(defineTool({
        name: 'remote_host_upload',
        description: 'Upload one single local file to a configured remote host after one-time user approval. Both paths must be absolute and the provider bounds the transferred size; directories, credentials, and transport options are not accepted.',
        parameters: {
            host_id: HOST_ID,
            local_path: LOCAL_PATH,
            remote_path: REMOTE_PATH,
            overwrite: { type: 'boolean', description: 'Replace an existing remote file; defaults to false.' },
            timeout_ms: TRANSFER_TIMEOUT,
        },
        output: { schema: { type: 'json' }, render: (_args, value) => renderJson(value) },
        execute: async (args, exec) => await withEnvelope('remote_host_upload', async () => await ctx.remoteHosts.upload(transferRequest(args.host_id, args.local_path, args.remote_path, args.overwrite, args.timeout_ms, exec.signal)), transferMeta),
        presentCall: args => present(`Upload to remote host ${args.host_id}`)(),
    }));
    ctx.tools.register(defineTool({
        name: 'remote_host_download',
        description: 'Download one single remote file from a configured remote host after one-time user approval. Both paths must be absolute and the provider bounds the transferred size; directories, credentials, and transport options are not accepted.',
        parameters: {
            host_id: HOST_ID,
            local_path: LOCAL_PATH,
            remote_path: REMOTE_PATH,
            overwrite: { type: 'boolean', description: 'Replace an existing local file; defaults to false.' },
            timeout_ms: TRANSFER_TIMEOUT,
        },
        output: { schema: { type: 'json' }, render: (_args, value) => renderJson(value) },
        execute: async (args, exec) => await withEnvelope('remote_host_download', async () => await ctx.remoteHosts.download(transferRequest(args.host_id, args.local_path, args.remote_path, args.overwrite, args.timeout_ms, exec.signal)), transferMeta),
        presentCall: args => present(`Download from remote host ${args.host_id}`)(),
    }));
}
/** Default Cordis plugin descriptor for Loader composition. */
export default { name, inject, apply };
//# sourceMappingURL=index.js.map