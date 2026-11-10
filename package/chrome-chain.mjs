import {defineTool} from '@deepseek-ai/dsh-tools';
import config from '../lib/config.cjs';
import clients from '../chrome/agent-client.cjs';
import previews from '../chrome/preview.cjs';
export const name = 'anodhas-browser-workspace-chain';
export const inject = ['tools','agents'];
export function apply(ctx) {
  const states=new Map(),pairing=config.loadConfig();
  async function get(agent) {
    let state=states.get(agent);
    if(state)return state;
    state=(async()=>{const client=clients.connectAgent(pairing.socketPath,agent.id);try {if(!(await client.call('status')).connected)throw Error('Chrome extension disconnected');const preview=await previews.startPreview(client);return {preview,client};}catch(e){client.close();states.delete(agent);throw e;}})();
    states.set(agent,state);
    agent.ctx.effect(()=>async()=>{const s=await state.catch(()=>null);await s?.preview.close();s?.client.close();states.delete(agent);},'chrome-chain-owner');
    return state;
  }
  ctx.effect(()=>async()=>{for(const pending of states.values()){const s=await pending.catch(()=>null);await s?.preview.close();s?.client.close();}states.clear();},'chrome-chain-dispose');
  ctx.tools.register(defineTool({name:'chrome_browser_chain_view',description:'Show a compact stack of Chrome tabs created by THIS chat. Does not create or focus tabs. Owner double-click reveals the exact page; close closes only that source page. Use for existing Chrome chats.',parameters:{},output:{schema:{type:'object',additionalProperties:true},render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]},async execute(_a,e){if(!e.agent)throw Error('Live chat required');const {preview}=await get(e.agent),tabs=await preview.pages();return {kind:'chrome-browser-chain',previewUrl:preview.url,pages:tabs.map(t=>({pageId:t.pageId,title:t.title,color:t.color})),readOnly:true};}}));
}
