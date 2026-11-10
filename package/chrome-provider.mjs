import path from 'node:path';
import {defineTool} from '@deepseek-ai/dsh-tools';
import config from '../lib/config.cjs';
import brokerModule from '../chrome/broker.cjs';
import {mountSessionMcp} from './chrome-session-mcp.mjs';
export const name = 'anodhas-browser-workspace-chrome';
export const inject = ['tools', 'agents', 'systemPrompt', 'workingDirectory'];
export async function apply(ctx) {
  const pairing = config.loadConfig();
  config.privateDirectory(path.dirname(pairing.socketPath));
  let broker;
  try { broker = await brokerModule.startBroker(pairing.socketPath, pairing.extensionOrigin); }
  catch (error) { throw new Error('Browser Workspace bridge could not bind its private socket; do not remove a socket belonging to another running Harness. ' + error.message); }
  ctx.effect(() => () => broker.close(), 'anodhas-browser-workspace-broker');
  const activate = mountSessionMcp(ctx, {name: 'chrome-agent', exclusive: false, command: process.execPath, args: [path.join(config.root, 'chrome/chrome-mcp.cjs')], toolCallTimeoutMs: 45000, envForAgent: agent => ({ELECTRON_RUN_AS_NODE: '1', ANODHAS_BROWSER_SESSION: agent.id, ANODHAS_BROWSER_STATE_DIR: config.stateDir(), ...(process.env.ANODHAS_BROWSER_CONFIG ? {ANODHAS_BROWSER_CONFIG: process.env.ANODHAS_BROWSER_CONFIG} : {})})});
  ctx.tools.register(defineTool({name: 'chrome_browser_enable', description: 'Enable the external Chrome connector only when the owner explicitly requests Chrome. Requires the owner-installed extension and Connect. Check browser_status. Only this chat’s inactive robot-group tabs; never adopt personal tabs, focus Chrome or use OS input as fallback.', parameters: {}, output: {schema: {type: 'object', additionalProperties: true}, render: (_a,v) => [{type:'text',text:JSON.stringify(v)}]}, async execute(_a,e) {
    if (!e.agent) throw new Error('Live chat required');
    await activate(e.agent,e.signal);
    return {enabled:true,tools:ctx.tools.schemas(e.agent).filter(t=>t.name.startsWith('mcp__chrome-agent__')).map(t=>t.name)};
  }}));
}
