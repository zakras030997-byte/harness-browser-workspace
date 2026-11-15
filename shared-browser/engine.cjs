const assert=require('node:assert/strict');
const {inferCandidates,instantiate,project,fieldsOf}=require('../chrome/learned-reads.cjs');
const {publicURL,safeInput}=require('../chrome/discovery-policy.cjs');
const {publicJSON}=require('../chrome/public-json.cjs');
const {fault,operationName,pageKey}=require('./catalog.cjs');
function failureKind(e){
 if(e.code==='CANCELLED'||e.name==='AbortError')return 'cancelled';
 if(/unknown|timeout|deadline|disconnected/i.test(e.message))return 'unknown';
 if(/HTTP (401|403)/.test(e.message))return 'authorization';
 if(/HTTP (429|5\d\d)|DNS|ENOTFOUND|ECONNREFUSED|ECONNRESET/.test(e.message))return 'temporary';
 if(/schema|contract|field|primitive|Expected JSON|non-JSON|mismatch/i.test(e.message))return 'contract';
 return 'unavailable';
}
function verify(data,op,input){const result=project(data,op.fields);if(result[op.echoField]!==input||op.fields.some(f=>(result[f]===null?'null':typeof result[f])!==op.types[f]))throw fault('Outcome contract mismatch');return result;}
class Engine{
 constructor({client,catalog,browser,authorize,readJSON=publicJSON,privateProvider}={}){if(!['harness','opencode'].includes(client)||!catalog||!browser||typeof authorize!=='function')throw fault('EXPLICIT_ADAPTER_AND_AUTHORIZATION_REQUIRED');Object.assign(this,{client,catalog,browser,authorize,readJSON,privateProvider});this.closed=false;this.pending=new Set();}
 async allowed(chat,url,action){if(this.closed)throw fault('ENGINE_CLOSED');if(typeof chat!=='string'||!chat||chat.length>160)throw fault('EXACT_CHAT_REQUIRED');const origin=publicURL(url).origin;if(await this.authorize({client:this.client,chat,origin,action})!==true)throw fault('NOT_AUTHORIZED');if(this.closed)throw fault('ENGINE_CLOSED');return origin;}
 async guarded(signal,fn){if(this.closed)throw fault('ENGINE_CLOSED');const c=new AbortController(),abort=()=>c.abort();if(signal?.aborted)c.abort();signal?.addEventListener('abort',abort,{once:true});this.pending.add(c);try{c.signal.throwIfAborted();const result=await fn(c.signal);c.signal.throwIfAborted();if(this.closed)throw fault('ENGINE_CLOSED');return result;}finally{this.pending.delete(c);signal?.removeEventListener('abort',abort);}}
 async read({chat,url,operation,input,fields,signal,newTab=false}){
  await this.allowed(chat,url,'public-read');operationName(operation);safeInput(input);fieldsOf(fields);
  return this.guarded(signal,async s=>{const chosen=this.catalog.select({url,operation,fields});
   if(chosen.matched){try{const data=verify(await this.readJSON(instantiate(chosen.contract,input),{signal:s}),chosen.contract,input);s.throwIfAborted();if(this.closed)throw fault('ENGINE_CLOSED');this.catalog.markSuccess(chosen.key);return {route:'shared-public-request',data,cache:false,browserPageOpened:false,requiresRunningBrowser:false,revision:chosen.revision};}
    catch(e){const kind=failureKind(e);if(s.aborted||this.closed||kind!=='contract')throw Object.assign(e,{readFailure:kind});this.catalog.invalidate(chosen.key,chosen.revision);}
   }
   s.throwIfAborted();const view=await this.browser.open({chat,url,signal:s,newTab});s.throwIfAborted();return {route:'browser-learning',...view,operation,input,fields,sourcePage:pageKey(url),readOnlyLearning:true,browserPageOpened:true};
  });
 }
 async sample({chat,url,input,fields,perform,signal,tabId}){await this.allowed(chat,url,'browser-read');safeInput(input);fieldsOf(fields);return this.guarded(signal,s=>this.browser.sample({chat,url,input,fields,perform,signal:s,tabId}));}
 async learn({chat,url,operation,fields,signal,tabId}){
  await this.allowed(chat,url,'learn-public-read');operationName(operation);fieldsOf(fields);
  return this.guarded(signal,async s=>{
   const expectedRevision=this.catalog.revision({url,operation,fields}),capture=await this.browser.capture({chat,url,tabId});
   if(capture.sourcePage!==pageKey(url)||capture.origin!==publicURL(url).origin)throw fault('CAPTURE_PAGE_MISMATCH');
   const candidates=inferCandidates(capture.observations,fields).filter(o=>o.origin===capture.origin);
   if(candidates.length!==1)return {learned:false,reason:candidates.length?'ambiguous':'unsupported-observations'};
   const op=candidates[0];for(const probe of op.samples){s.throwIfAborted();assert.deepEqual(verify(await this.readJSON(instantiate(op,probe.input),{signal:s}),op,probe.input),probe.data,'Credential-free replay mismatch');}
   s.throwIfAborted();if(this.closed)throw fault('ENGINE_CLOSED');const saved=this.catalog.publish({operation,expectedRevision,contract:{...op,sourcePage:pageKey(url),transport:'public-http',credentialFreeReplayVerified:true,verifiedSamples:2}});
   return {learned:true,...saved,sharedBetweenClients:true,persistedResponses:false};
  });
 }
 async readPrivate({chat,url,account,fields,signal}){
  const origin=await this.allowed(chat,url,'private-read');fieldsOf(fields);const scope={client:this.client,chat,account,origin};this.catalog.privateKey(scope);
  if(!this.privateProvider)throw fault('PRIVATE_PROVIDER_NOT_CONFIGURED');
  return this.guarded(signal,async s=>{if(await this.privateProvider.validateIdentity(scope,{signal:s})!==true)throw fault('PRIVATE_IDENTITY_MISMATCH');const ref=this.catalog.privateReference(scope);if(!ref)return {route:'private-browser-learning',...await this.browser.open({chat,url,signal:s}),sharedBetweenClients:false};const data=await this.privateProvider.replay(ref,scope,{fields,signal:s});return {route:'private-session-request',data,browserPageOpened:false,requiresRunningBrowser:true,sharedBetweenClients:false};});
 }
 async rememberPrivate(scope,reference){await this.allowed(scope.chat,scope.origin,'private-read');if(scope.client!==this.client||!this.privateProvider||await this.privateProvider.validateIdentity(scope,{})!==true)throw fault('PRIVATE_IDENTITY_MISMATCH');this.catalog.putPrivateReference(scope,reference);}
 async release(chat){return this.browser.closeChat?this.browser.closeChat(chat):this.browser.release(chat);}
 async close(){if(this.closed)return;this.closed=true;for(const c of this.pending)c.abort();await this.browser.close();}
}
module.exports={Engine,verify,failureKind};
