const {publicURL,safeInput}=require('./discovery-policy.cjs');
const {fieldsOf}=require('./learned-reads.cjs');
function makeUseRouter({shared,learned,openAndObserve,privateReads}){
 return async function route({url,input,fields,intent='public-data'}){
  publicURL(url);safeInput(input);fieldsOf(fields);
  if(!['public-data','account-identity'].includes(intent))throw Error('Unsupported read intent');
  if(intent==='account-identity'){
   if(new URL(url).origin!=='https://www.youtube.com'||fields.some(f=>!['name','handle'].includes(f)))throw Error('Private router currently supports only authorized YouTube account name/handle');
   if(!privateReads)throw Error('Private read provider unavailable');
   const saved=await privateReads.list();const ops=saved.operations.filter(o=>o.site==='https://www.youtube.com'&&o.kind==='account-menu-read');
   if(ops.length===1){try{const r=await privateReads.replay(ops[0].operationId);return {...r,data:Object.fromEntries(fields.map(k=>[k,r.data[k]])),route:'saved-private-request',browserOpened:false};}catch(e){if(/timeout|timed out|outcome unknown|deadline|disconnected/i.test(e.message))throw e;return {...await privateReads.openAndObserve(url),route:'private-browser-learning',reason:'saved-account-read-needs-validation',previousReadError:String(e.message).slice(0,200),next:'Read only the visible account menu once, then harness_use_youtube_discover; do not invent endpoints or change account.'};}}
   return {...await privateReads.openAndObserve(url),route:'private-browser-learning',reason:ops.length?'ambiguous-private-recipes':'no-private-recipe',next:'Read only the visible account menu once, then harness_use_youtube_discover. If multiple accounts are saved, do not guess an identity; use the visible current account.'};
  }
  const selected=shared.select(url,fields);
  let reason=selected.reason,error;
  if(selected.matched){
   try{const value=learned.replayPublic?await learned.replayPublic(selected.contract,input):(learned.adoptPublic(selected.contract),await learned.replay(selected.contract.id,input));
    return {...value,data:Object.fromEntries(fields.map(k=>[k,value.data[k]])),route:'saved-request',scope:'shared-public-contract',browserOpened:false};
   }catch(e){if(/outcome unknown|deadline|disconnected/i.test(e.message))throw e;const contractChanged=/schema|contract|field|origin|primitive|Expected JSON/i.test(String(e.message));if(contractChanged)shared.invalidate(selected.contract.id);reason=contractChanged?'saved-contract-needs-browser':'saved-read-unavailable-for-input';error=String(e.message).slice(0,300);}
  }
  const page=await openAndObserve(url,input);
  return {...page,route:'browser-learning',reason,...error?{previousReadError:error}:{},input,fields,
   needsBrowser:true,observationStarted:true,
   next:'Read through the visible site form. Observe two different authorized public inputs using browser_api_sample_read, then browser_api_discover with the requested fields. A verified public contract is automatically shared. Retry harness_use for the requested input. If the requested input cannot fit this read contract, perform that exact input through the visible page and return its actual result; never return a training example as the requested result. Close tabs created for this task when done. Report the limitation; never invent an API or broaden owner permissions.'};
 };
}
module.exports={makeUseRouter};
