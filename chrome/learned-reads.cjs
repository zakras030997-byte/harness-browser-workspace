const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {publicURL,safeInput,secret}=require('./discovery-policy.cjs');
const {publicJSON}=require('./public-json.cjs');
const {makeSiteMemory}=require('./site-memory.cjs');
const hash=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
function fieldsOf(fields){
 if(!Array.isArray(fields)||fields.length<1||fields.length>8||new Set(fields).size!==fields.length
  ||fields.some(k=>typeof k!=='string'||!/^\w{1,64}$/.test(k)||secret.test(k)||['__proto__','constructor','prototype'].includes(k)))throw Error('Select 1..8 non-sensitive top-level primitive fields');
 return fields;
}
function project(data,fields){
 if(!data||Array.isArray(data)||typeof data!=='object')throw Error('Expected JSON object');
 const result={};for(const field of fields){
  if(!Object.hasOwn(data,field))throw Error('Learned output field disappeared: '+field);
  const value=data[field];
  if(!(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&value.length<=120&&/^[\w .-]*$/.test(value)))throw Error('Expected a small public primitive field');
  result[field]=value;
 }return result;
}
function instantiate(operation,input){
 safeInput(input);const u=publicURL(operation.sampleURL);
 if(u.origin!==operation.origin)throw Error('Learned origin changed');
 if(operation.parameter.kind==='path'){
  const parts=u.pathname.split('/');
  if(!Number.isInteger(operation.parameter.index)||operation.parameter.index<1||operation.parameter.index>=parts.length)throw Error('Invalid learned path');
  parts[operation.parameter.index]=input;u.pathname=parts.join('/');
 }else if(operation.parameter.kind==='query'){
  if(!u.searchParams.has(operation.parameter.key))throw Error('Invalid learned query');u.searchParams.set(operation.parameter.key,input);
 }else throw Error('Invalid learned parameter');
 publicURL(u.href);return u.href;
}
function inferCandidates(observations,fields){
 fieldsOf(fields);
 if(!Array.isArray(observations)||observations.length>16)throw Error('Invalid capture');
 const candidates=new Map();
 for(let i=0;i<observations.length;i++)for(let j=i+1;j<observations.length;j++){
  const a=observations[i],b=observations[j];
  try{
   if(a.method!=='GET'||b.method!=='GET'||a.status!==200||b.status!==200||a.input===b.input)continue;
   safeInput(a.input);safeInput(b.input);const x=publicURL(a.url),y=publicURL(b.url);if(x.origin!==y.origin)continue;
   project(a.scalars,fields);project(b.scalars,fields);
   const ap=x.pathname.split('/'),bp=y.pathname.split('/');if(ap.length!==bp.length)continue;
   const pathDiff=ap.flatMap((v,k)=>v!==bp[k]?[k]:[]);
   const aq=Object.fromEntries(x.searchParams),bq=Object.fromEntries(y.searchParams);
   if(JSON.stringify(Object.keys(aq).sort())!==JSON.stringify(Object.keys(bq).sort()))continue;
   const queryDiff=Object.keys(aq).filter(k=>aq[k]!==bq[k]);let parameter;
   if(pathDiff.length===1&&queryDiff.length===0&&ap[pathDiff[0]]===a.input&&bp[pathDiff[0]]===b.input)parameter={kind:'path',index:pathDiff[0]};
   else if(!pathDiff.length&&queryDiff.length===1&&aq[queryDiff[0]]===a.input&&bq[queryDiff[0]]===b.input)parameter={kind:'query',key:queryDiff[0]};
   else continue;
   const echoField=fields.find(f=>a.scalars[f]===a.input&&b.scalars[f]===b.input);if(!echoField)continue;
   if(fields.some(f=>typeof a.scalars[f]!==typeof b.scalars[f]||(a.scalars[f]===null)!==(b.scalars[f]===null)))continue;
   const op={origin:x.origin,sampleURL:x.href,parameter,fields:[...fields],echoField,
    types:Object.fromEntries(fields.map(f=>[f,a.scalars[f]===null?'null':typeof a.scalars[f]])),
    samples:[{input:a.input,data:project(a.scalars,fields)},{input:b.input,data:project(b.scalars,fields)}]};
   const id='observed-'+hash({url:instantiate(op,'__INPUT__'),fields:[...fields].sort(),echoField}).slice(0,20);
   candidates.set(id,{...op,id});
  }catch{}
 }
 return [...candidates.values()];
}
function makeLearnedReads({session,storeFile,readJSON=publicJSON}){
 if(!session||typeof session!=='string')throw Error('Actual chat identity required');
 const file=storeFile||path.join(require('../lib/config.cjs').stateDir(),'learned-reads',hash(session)+'.json');
 const memory=makeSiteMemory({root:storeFile?path.dirname(file):path.dirname(path.dirname(file))});
 function load(){memory.sweep();if(!fs.existsSync(file))return {version:1,session,operations:{}};
  const state=JSON.parse(fs.readFileSync(file,'utf8'));if(state.version!==1||state.session!==session)throw Error('Learned registry belongs to another chat');return state;}
 function update(fn){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const lock=file+'.lock',owner=crypto.randomUUID();
  fs.writeFileSync(lock,owner,{flag:'wx',mode:0o600});const tmp=file+'.'+owner+'.tmp';
  try{const state=load();fn(state);memory.save(file,state);}
  finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);if(fs.readFileSync(lock,'utf8')===owner)fs.unlinkSync(lock);}
 }
 const describe=o=>({operationId:o.id,origin:o.origin,requestPattern:instantiate(o,'__INPUT__'),parameter:o.parameter,fields:o.fields,echoField:o.echoField,samples:(o.samples??[]).map(s=>s.input),verifiedSamples:2});
 function verify(data,op,input){const values=project(data,op.fields);
  if(values[op.echoField]!==input||op.fields.some(f=>(values[f]===null?'null':typeof values[f])!==op.types[f]))throw Error('Learned outcome contract failed');return values;}
 return {
  async learn(capture,fields,candidateId){
   publicURL(capture.origin+'/');const candidates=inferCandidates(capture.observations,fields).filter(o=>o.origin===capture.origin);
   if(!candidates.length)throw Error('No unambiguous read with one varying path/query input and a matching output field was observed');
   if(!candidateId&&candidates.length>1)return {learned:false,candidates:candidates.map(describe)};
   const op=candidateId?candidates.find(o=>o.id===candidateId):candidates[0];if(!op)throw Error('Candidate was not observed');
   if(capture.sourcePage){const page=publicURL(capture.sourcePage);if(page.origin!==op.origin)throw Error('Learning page origin mismatch');op.sourcePage=page.origin+page.pathname;}
   const cache={};
   for(const sample of op.samples){
    const data=verify(await readJSON(instantiate(op,sample.input)),op,sample.input);
    assert.deepEqual(data,sample.data,'Credential-free replay differs from the browser observation');cache[sample.input]={data,at:Date.now()};
   }
   memory.touch(op.origin);op.learnedAt=new Date().toISOString();op.cache=cache;op.transport='public-http';op.credentialFreeReplayVerified=true;update(s=>{for(const [id,old]of Object.entries(s.operations))if(id!==op.id&&op.sourcePage&&old.sourcePage===op.sourcePage&&old.echoField===op.echoField&&JSON.stringify([...old.fields].sort())===JSON.stringify([...op.fields].sort()))delete s.operations[id];s.operations[op.id]=op});
   return {learned:true,...describe(op),source:'observed-browser-traffic',credentialFreeReplayVerified:true,persisted:true};
  },
  list(){return {operations:Object.values(load().operations).map(describe),scope:'this-chat',persistent:true};},
  async publicContracts({revalidateLegacy=false}={}){const result=[];for(const op of Object.values(load().operations)){
   if(op.transport&&op.transport!=='public-http')continue;
   if(!op.credentialFreeReplayVerified){if(!revalidateLegacy||op.samples?.length<2)continue;
    for(const sample of op.samples)assert.deepEqual(verify(await readJSON(instantiate(op,sample.input)),op,sample.input),sample.data);
   }
   result.push({...op,transport:'public-http',credentialFreeReplayVerified:true});
  }return result;},
  async replayPublic(op,input){
   if(!op?.credentialFreeReplayVerified||op.transport!=='public-http')throw Error('Invalid public contract');safeInput(input);fieldsOf(op.fields);const start=performance.now();const data=verify(await readJSON(instantiate(op,input)),op,input);memory.touch(op.origin);return {operationId:op.id,input,data,verified:true,via:'observed-http',cache:false,elapsedMs:Math.round((performance.now()-start)*100)/100};
  },
  memoryStats:()=>memory.stats(),
  adoptPublic(op){
   if(!op?.credentialFreeReplayVerified||op.transport!=='public-http'||!/^observed-[a-f0-9]{20}$/.test(op.id))throw Error('Invalid public contract');
   fieldsOf(op.fields);instantiate(op,'__INPUT__');
   update(s=>{if(!s.operations[op.id])s.operations[op.id]={...op,samples:[],cache:{}};});return op.id;
  },
  async replay(operationId,input){
   if(typeof operationId!=='string'||!/^observed-[a-f0-9]{20}$/.test(operationId))throw Error('Invalid saved operation id');safeInput(input);
   const op=load().operations[operationId];if(!op)throw Error('No saved operation in THIS chat');fieldsOf(op.fields);
   const url=instantiate(op,input),start=performance.now(),cached=op.cache?.[input];
   let data,via;
   if(cached&&Date.now()-cached.at>=0&&Date.now()-cached.at<86400000){data=verify(cached.data,op,input);via='local-cache';}
   else {data=verify(await readJSON(url),op,input);via='observed-http';update(s=>{
    const current=s.operations[operationId];if(!current)throw Error('Operation was removed');current.cache??={};
    current.cache[input]={data,at:Date.now()};const keys=Object.keys(current.cache);if(keys.length>16)delete current.cache[keys[0]];
   });}
   memory.touch(op.origin);return {operationId,input,data,verified:true,via,elapsedMs:Math.round((performance.now()-start)*100)/100};
  }
 };
}
module.exports={makeLearnedReads,inferCandidates,instantiate,project,fieldsOf};
