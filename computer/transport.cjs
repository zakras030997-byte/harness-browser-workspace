const {spawn}=require('node:child_process');
const readline=require('node:readline');
const path=require('node:path');
const DIRECT_ARGS=Object.freeze(['mcp','--direct','--embedded','--host-bundle-id','com.deepseek.dsh']);
function transport(connection,{spawnImpl=spawn,timeoutMs=30000,closeTimeoutMs=5000}={}){
 const {binary,mode,hostBundleId}=connection??{};
 if(!path.isAbsolute(binary??'')||mode!=='direct'||hostBundleId!=='com.deepseek.dsh'||connection.socket)throw Error('Package-owned direct Computer Use helper required');
 // Do not use bare `mcp`: on macOS it may auto-launch CuaDriver.app. No approval
 // bypass, permissions grant, persistent service, or automatic retry is used.
 // `--no-automation-prompts` is serve-only in 0.44.0. Direct mode instead
 // disables script execution entirely; this plugin exposes only window tools.
 const env={...process.env,CUA_DRIVER_EMBEDDED:'1',CUA_DRIVER_HOST_BUNDLE_ID:hostBundleId,CUA_DRIVER_TELEMETRY_DISABLED:'1',CUA_DRIVER_PERMISSION_MODE:'standard',CUA_DRIVER_DISABLE_UNRESTRICTED:'1',CUA_DRIVER_DISABLE_RUN_SCRIPT:'1'};
 delete env.CUA_DRIVER_DANGEROUSLY_BYPASS_APPROVALS;
 const child=spawnImpl(binary,[...DIRECT_ARGS],{stdio:['pipe','pipe','pipe'],env}),pending=new Map();let seq=0,closing=false,ended=false,exitObserved=false,spawnFailed=false,initialized=false,closePromise;
 child.stderr.on('data',()=>{});
 const lines=readline.createInterface({input:child.stdout});
 function rejectPending(message){for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error(message));}pending.clear();}
 let resolveExit;const exited=new Promise(resolve=>{resolveExit=resolve;});
 function fail(kind){ended=true;if(kind==='exit')exitObserved=true;if(kind==='spawn')spawnFailed=true;rejectPending('Computer Use helper ended; an admitted action outcome may be UNKNOWN. Read state before retry.');lines.close();if(exitObserved||spawnFailed)resolveExit();}
 child.once('error',()=>fail('spawn'));child.once('exit',()=>fail('exit'));child.stdin.on('error',()=>fail('io'));
 lines.on('line',s=>{let m;try{m=JSON.parse(s)}catch{return;}const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(String(m.error.message??'Helper request failed').slice(0,500))):p.resolve(m.result);});
 function request(method,params){if(closing||ended)return Promise.reject(Error('Computer Use helper is closed'));return new Promise((resolve,reject)=>{
  const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Computer Use helper timeout; action outcome UNKNOWN. Do not automatically repeat.'));},timeoutMs);
  pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n',error=>{if(!error)return;const p=pending.get(id);if(p){pending.delete(id);clearTimeout(timer);p.reject(Error('Computer Use request was not confirmed; outcome UNKNOWN'));}});
 });}
 const ready=request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'anodhas-window-workspace',version:'0.3.0'}}).then(()=>{if(closing||ended)throw Error('Computer Use helper closed during initialization');child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');initialized=true;});
 // Initialization can fail before the first caller awaits it; keep the rejection
 // handled while preserving the original rejected promise for the actual caller.
 ready.catch(()=>{});
 return {
  ready,
  status(){return {running:!exitObserved&&!spawnFailed,available:!ended,initialized,closing,mode:'stdio-direct',separateApplication:false,foregroundFallback:false};},
  async call(name,args){await ready;if(name==='check_permissions')args={...args,prompt:false};return request('tools/call',{name,arguments:args});},
  async close(){return closePromise??=(async()=>{closing=true;rejectPending('Computer Use helper is closing; admitted action outcome may be UNKNOWN.');if(!exitObserved&&!spawnFailed&&!child.stdin.destroyed)child.stdin.end();let timer;try{await Promise.race([exited,new Promise(resolve=>{timer=setTimeout(resolve,closeTimeoutMs);})]);}finally{clearTimeout(timer);}return {stopped:exitObserved||spawnFailed,method:'stdin-eof',forceUsed:false};})();}
 };
}
function value(result){if(result.isError)throw Error(result.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n')||'Driver refused');if(result.structuredContent)return result.structuredContent;for(const b of result.content??[])if(b.type==='text'){try{return JSON.parse(b.text)}catch{}}return {text:result.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n')};}
module.exports={transport,value,DIRECT_ARGS};
