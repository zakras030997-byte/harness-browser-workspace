// Adapted from DeepSeek Harness dsh-experimental-browser-use-runtime 0.2.2-rc.1 (MIT).
// Local addition: expose the same scoped initialization for an existing live Agent.
// No synthetic lifecycle events or mutation of another Agent's context/registry.
import * as McpClient from '@deepseek-ai/dsh-mcp-client';
import {createScope} from '@deepseek-ai/dsh-scope';
import {SessionResources} from '@deepseek-ai/dsh-experimental-browser-use-runtime';
export function mountSessionMcp(ctx, options) {
    const workingDirectory = ctx.get('workingDirectory');
    if (workingDirectory === undefined)
        throw new Error(`${options.name}: browser MCP requires a working-directory provider`);
    let resources;
    const clients = new Map();
    const toolPrefix = `mcp__${options.name}__`;
    const resourceTools = new Set(['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource']);
    let stopping = false;
    let refreshingMasks = false;
    const refreshBlockedMasks = () => {
        if (stopping || refreshingMasks)
            return;
        refreshingMasks = true;
        try {
            for (const [agent, state] of clients) {
                if (state.status !== 'blocked')
                    continue;
                const inherited = ctx.tools.schemas(agent).filter(tool => tool.name.startsWith(toolPrefix));
                if (inherited.length === 0)
                    continue;
                state.mask ??= createScope(ctx, agent);
                state.mask.ctx.tools.restrict({ deny: inherited.map(tool => tool.name) });
            }
        }
        finally {
            refreshingMasks = false;
        }
    };
    ctx.effect(function* () {
        // Additional explicit Chrome connector; leaves the default BrowserUse provider unchanged.
        resources = new SessionResources(ctx, {
            label: options.name,
            exclusive: options.exclusive,
            async open(agent, signal) {
                const scope = createScope(ctx, agent);
                let cancellation;
                const cancel = () => { cancellation = scope.dispose(); };
                signal.addEventListener('abort', cancel, { once: true });
                try {
                    signal.throwIfAborted();
                    scope.ctx.on('tools/execute', async (exec, next) => {
                        if (!exec.name.startsWith(toolPrefix))
                            return next();
                        if (exec.agent !== agent) {
                            if (ctx.tools.get(exec.name, exec.agent) !== ctx.tools.get(exec.name, agent))
                                return next();
                            throw new Error(`${options.name}: browser tool belongs to another Session`);
                        }
                        return next();
                    });
                    await scope.ctx.plugin(McpClient, McpClient.Config({
                        transport: 'stdio',
                        serverName: options.name,
                        command: options.command,
                        args: options.args,
                        ...options.envForAgent ? {env:options.envForAgent(agent)} : options.env === undefined ? {} : { env: options.env },
                        cwd: await workingDirectory.ensure(agent, signal),
                        ...options.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: options.toolCallTimeoutMs },
                        failOnStartupError: true,
                        reconnect: { enabled: false },
                    }));
                    signal.throwIfAborted();
                    return {
                        value: scope,
                        close() {
                            clients.delete(agent);
                            return scope.dispose();
                        },
                    };
                }
                catch (error) {
                    await (cancellation ?? scope.dispose());
                    throw error;
                }
                finally {
                    signal.removeEventListener('abort', cancel);
                }
            },
        });
        yield async () => {
            stopping = true;
            await resources.dispose();
            clients.clear();
        };
    }, `${options.name}.sessions`);
    async function activate(agent, signal) {
        if (clients.has(agent)) return;
        const state = { status: resources.available(agent) ? 'ready' : 'blocked' };
        agent.ctx.effect(() => async () => {
            clients.delete(agent);
            await state.mask?.dispose();
        }, `${options.name}.activation`);
        if (state.status === 'blocked') {
            clients.set(agent, state);
            refreshBlockedMasks();
            return;
        }
        await resources.get(agent, signal);
        clients.set(agent, state);
    }
    // Explicit chrome_browser_enable only; no extra Chrome process per unrelated chat.

    ctx.on('tools/change', refreshBlockedMasks);
    ctx.on('tools/execute', async (exec, next) => {
        const ownResource = resourceTools.has(exec.name)
            && typeof exec.arguments === 'object' && exec.arguments !== null
            && exec.arguments.server === options.name;
        if (!exec.name.startsWith(toolPrefix) && !ownResource)
            return next();
        const agent = exec.agent;
        if (agent === undefined || clients.get(agent)?.status !== 'ready') {
            throw new Error(`${options.name}: browser tool belongs to another Session`);
        }
        return resources.run(agent, exec.signal, async (_scope, combined) => {
            const original = exec.signal;
            exec.signal = combined;
            try {
                return await next();
            }
            finally {
                exec.signal = original;
            }
        });
    });
    ctx.on('system-prompt/assemble', async (_assembly, { agent }, next) => {
        const assembly = await next();
        if (agent === undefined || clients.get(agent)?.status === 'ready')
            return assembly;
        return { ...assembly, sections: assembly.sections.filter(section => section.name !== `mcp:${options.name}`) };
    });
    return activate;
}
