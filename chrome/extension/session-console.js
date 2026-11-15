const sensitive=/token|secret|password|passwd|authorization|cookie|csrf|api.?key/i;
function clean(value,cookies,depth=0){
 if(depth>6)return '[depth limit]';
 if(typeof value==='string'){let text=value.slice(0,6000);for(const c of cookies)if(c.value?.length>=6)text=text.split(c.value).join('[cookie redacted]');return text.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[token redacted]');}
 if(Array.isArray(value))return value.slice(0,100).map(v=>clean(v,cookies,depth+1));
 if(value&&typeof value==='object'){const out={};for(const [k,v]of Object.entries(value).slice(0,100))if(!sensitive.test(k)&&!['__proto__','constructor','prototype'].includes(k))out[k]=clean(v,cookies,depth+1);return out;}
 return value;
}
export function makeSessionConsole(chrome,send,isOwned){
 const logs=new Map(),enabled=new Set();
 chrome.debugger.onEvent.addListener(({tabId},method,p)=>{
  if(method!=='Runtime.consoleAPICalled'||!enabled.has(tabId)||!isOwned(tabId))return;
  const list=logs.get(tabId)??[];list.push({level:p.type,text:(p.args??[]).map(x=>String(x.value??x.description??'')).join(' ').slice(0,2000)});logs.set(tabId,list.slice(-30));
 });
 const cookies=async id=>(await send(id,'Network.getCookies',{urls:[(await chrome.tabs.get(id)).url]})).cookies??[];
 async function evaluate(id,expression){const r=await send(id,'Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,timeout:10000});if(r.exceptionDetails)throw Error('Browser JavaScript failed: '+(r.exceptionDetails.text??'exception'));return r.result?.value??null;}
 async function sanitized(id,result){const cookieData=await cookies(id);const value=clean(result,cookieData);if(JSON.stringify(value).length>24000)return {truncated:true,reason:'Browser result exceeds 24 KiB'};return value;}
 return {
  async status(id){const tab=await chrome.tabs.get(id),list=await cookies(id);return {origin:new URL(tab.url).origin,cookies:list.map(c=>({name:c.name,domain:c.domain,path:c.path,httpOnly:c.httpOnly,secure:c.secure,sameSite:c.sameSite,session:c.session})),valuesReturned:false,cookieJar:'existing-chrome-profile',isolatedPerChat:false};},
  async console(id,expression){
   if(typeof expression!=='string'||!expression.trim()||expression.length>8000)throw Error('JavaScript expression required, up to 8000 characters');
   enabled.add(id);await send(id,'Runtime.enable');const value=await evaluate(id,expression);
   return await sanitized(id,{value,console:logs.get(id)??[],runtime:'browser-page-javascript',osShell:false});
  },
  async logs(id){enabled.add(id);await send(id,'Runtime.enable');return sanitized(id,{messages:logs.get(id)??[]});},
  async read(id,pageUrl,{url,fields}){
   const page=new URL(pageUrl),target=new URL(url);
   if(!['http:','https:'].includes(target.protocol)||target.origin!==page.origin||target.username||target.password||target.hash)throw Error('Only same-origin owned-page GET is allowed');
   if(/(?:^|\/)(delete|remove|destroy|logout|signout|revoke|purge|reset|unsubscribe|create|update|submit|transfer|checkout|pay|purchase|confirm|send)(?:\/|$)/i.test(target.pathname)||[...target.searchParams].some(([k,v])=>sensitive.test(k)||/^(action|operation|method)$/i.test(k)&&!/^(get|read|list|search|query)$/i.test(v)))throw Error('Use the browser and explicit current-task authorization for site actions');
   if(!Array.isArray(fields)||!fields.length||fields.length>8||fields.some(k=>typeof k!=='string'||!/^\w{1,64}$/.test(k)||sensitive.test(k)||['__proto__','constructor','prototype'].includes(k)))throw Error('Select 1..8 non-credential JSON fields');
   const expression=`(async()=>{const r=await fetch(${JSON.stringify(target.href)},{method:'GET',credentials:'include',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});if(r.status!==200||!/^application\\/(?:[^;]+\\+)?json(?:;|$)/i.test(r.headers.get('content-type')||''))throw Error('Expected HTTP 200 JSON');const reader=r.body.getReader(),parts=[];let n=0;for(;;){const {value,done}=await reader.read();if(done)break;n+=value.length;if(n>524288){await reader.cancel();throw Error('JSON too large')}parts.push(value)}const bytes=new Uint8Array(n);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}const data=JSON.parse(new TextDecoder().decode(bytes)),result={};for(const key of ${JSON.stringify(fields)}){if(!Object.hasOwn(data,key))throw Error('Missing requested field');result[key]=data[key]}return result})()`;
   return await sanitized(id,{data:await evaluate(id,expression),via:'browser-session-get',credentialsRemainInBrowser:true,shared:false});
  },
  forget(id){enabled.delete(id);logs.delete(id);}
 };
}
