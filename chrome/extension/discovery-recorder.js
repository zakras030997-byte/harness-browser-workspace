// Observe only explicitly started, owned, same-origin public JSON GET reads.
const secret = /token|secret|password|passwd|auth|cookie|session|csrf|nonce|signature|api.?key|email/i;
const destructive = /(?:^|\/)(?:delete|remove|destroy|logout|signout|revoke|purge|reset|unsubscribe|create|update|submit|transfer|checkout|pay|purchase|confirm|send|login|oauth)(?:\/|$)/i;
export function makeDiscoveryRecorder(chrome, send) {
 const active=new Map();
 const end=async(tabId)=>{const s=active.get(tabId);if(!s)return;active.delete(tabId);clearTimeout(s.timer);await send(tabId,'Network.disable').catch(()=>{});return s;};
 chrome.debugger.onEvent.addListener(({tabId},method,p)=>{
  const s=active.get(tabId);if(!s)return;
  if(method==='Network.requestWillBeSent'){
   try{
    const u=new URL(p.request.url);
    if(!['Fetch','XHR'].includes(p.type)||p.request.method!=='GET'||u.origin!==s.origin||u.username||u.password||u.hash
      ||destructive.test(u.pathname)||u.href.length>2048||s.requests.size>=24||s.observations.length>=16)return;
    const entries=[...u.searchParams];
    if(entries.length>12||entries.some(([k,v])=>secret.test(k)||v.length>120||!/^[A-Za-z0-9 _.-]*$/.test(v)))return;
    if(sensitivePath(u.pathname))return;
    s.requests.set(p.requestId,{url:u.href,input:s.input});
   }catch{}
  }
  if(method==='Network.responseReceived'){
   const r=s.requests.get(p.requestId);
   if(!r)return;
   if(p.response.status!==200||!/^application\/(?:[^;]+\+)?json$/i.test(p.response.mimeType))s.requests.delete(p.requestId);
   else r.accepted=true;
  }
  if(method==='Network.loadingFailed')s.requests.delete(p.requestId);
  if(method==='Network.loadingFinished'){
   const r=s.requests.get(p.requestId);s.requests.delete(p.requestId);
   if(!r?.accepted||p.encodedDataLength>524288)return;
   const pending=send(tabId,'Network.getResponseBody',{requestId:p.requestId}).then(body=>{
    if(active.get(tabId)!==s)return;
    // Do not retain the body: project small public primitive fields immediately.
    const text=body.base64Encoded?atob(body.body):body.body;
    if(text.length>524288)return;
    const data=JSON.parse(text);
    if(!data||Array.isArray(data)||typeof data!=='object')return;
    const scalars={};
    for(const [key,value]of Object.entries(data).slice(0,80)){
     if(secret.test(key)||!/^\w{1,64}$/.test(key))continue;
     if(typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean'||value===null)scalars[key]=value;
     else if(typeof value==='string'&&value.length<=120&&/^[\w .-]*$/.test(value))scalars[key]=value;
    }
    if(Object.keys(scalars).length&&s.observations.length<16)s.observations.push({...r,method:'GET',status:200,scalars});
   }).catch(()=>{}).finally(()=>s.pending.delete(pending));
   s.pending.add(pending);
  }
 });
 function sensitivePath(p){return /(?:^|\/)(?:token|session|oauth|password|credentials|api-key)(?:\/|$)/i.test(p);}
 function input(v){if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(v))throw Error('Controlled input must be a simple public word/identifier');return v;}
 return {
  async start(tabId,pageUrl,{input:label}){
   const u=new URL(pageUrl);
   if(u.protocol!=='https:'||u.port||u.username||u.password||u.hostname==='localhost'||/^[\d.]+$/.test(u.hostname)||u.hostname.includes(':'))
    throw Error('Discovery requires an explicit public HTTPS site, no auth or local addresses');
   if(active.has(tabId))throw Error('Discovery is already active on this tab');
   const s={origin:u.origin,input:input(label),requests:new Map(),observations:[],pending:new Set()};
   s.timer=setTimeout(()=>{void end(tabId)},300000);active.set(tabId,s);
   try{await send(tabId,'Network.enable');}catch(e){await end(tabId);throw e;}
   return {recording:true,origin:u.origin,input:s.input,endpointPreconfigured:false,expiresAfterSeconds:300};
  },
  mark(tabId,{input:label}){const s=active.get(tabId);if(!s)throw Error('No discovery recording');s.input=input(label);return {input:s.input};},
  async stop(tabId){const s=active.get(tabId);if(!s)throw Error('No discovery recording');await Promise.all([...s.pending]);await end(tabId);return {origin:s.origin,observations:s.observations};},
  forget(tabId){const s=active.get(tabId);if(s)clearTimeout(s.timer);active.delete(tabId);}
 };
}
