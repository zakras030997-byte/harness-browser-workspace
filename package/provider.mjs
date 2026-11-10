import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {mountSessionMcp} from './session-mcp.mjs';
const dir = path.dirname(fileURLToPath(import.meta.url));
export const name = 'anodhas-browser-workspace-isolated';
export const inject = ['browserUse', 'agents', 'tools', 'systemPrompt', 'workingDirectory'];
export function apply(ctx) {
  const activate = mountSessionMcp(ctx, {name: 'playwright-mcp', exclusive: false, command: process.execPath, args: [path.join(dir, 'server.cjs')], env: {ELECTRON_RUN_AS_NODE: '1'}, toolCallTimeoutMs: 60000});
  ctx.tools.register(defineTool({
    name: 'browser_enable',
    description: 'Enable the isolated background browser in this live chat. Prefer this browser by default. Use browser_live_view to show the exact session inside Harness. External Chrome requires explicit owner permission; never use shell/open as a fallback.',
    parameters: {}, output: {schema: {type: 'object', additionalProperties: true}, render: (_a, v) => [{type: 'text', text: JSON.stringify(v)}]},
    async execute(_a, e) {
      if (!e.agent) throw new Error('Live chat required');
      await activate(e.agent, e.signal);
      return {enabled: true, tools: ctx.tools.schemas(e.agent).filter(t => t.name.startsWith('mcp__playwright-mcp__')).map(t => t.name), scope: 'this chat only'};
    }
  }));
}
