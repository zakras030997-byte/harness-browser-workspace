const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {publicURL}=require('./discovery-policy.cjs');
const {instantiate,fieldsOf}=require('./learned-reads.cjs');
const {makeSiteMemory}=require('./site-memory.cjs');
function makeSharedReads({file=path.join(require('../lib/config.cjs').stateDir(),'shared-public-reads.json')}={}){
 const memory=makeSiteMemory({root:path.dirname(file)});
 function load(){memory.sweep();if(!fs.existsSync(file))return {version:1,operations:{}};const s=JSON.parse(fs.readFileSync(file,'utf8'));if(s.version!==1)throw Error('Unknown shared registry version');return s;}
 function update(fn){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const lock=file+'.lock',owner=crypto.randomUUID(),tmp=file+'.'+owner+'.tmp';
  fs.writeFileSync(lock,owner,{flag:'wx',mode:0o600});try{const s=load();fn(s);memory.save(file,s);}
  finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);if(fs.readFileSync(lock,'utf8')===owner)fs.unlinkSync(lock);}}
 function publish(contract){
  if(!contract?.credentialFreeReplayVerified||contract.transport!=='public-http'||!/^observed-[a-f0-9]{20}$/.test(contract.id))throw Error('Only verified credential-free contracts may be shared');
  fieldsOf(contract.fields);publicURL(contract.origin+'/');const sampleURL=instantiate(contract,'__INPUT__');
  // No captured inputs, responses, account data, cookies, sessions or cache cross chat boundaries.
  const safe={id:contract.id,origin:contract.origin,sampleURL,parameter:contract.parameter,
   fields:contract.fields,types:contract.types,echoField:contract.echoField,transport:'public-http',
   credentialFreeReplayVerified:true,verifiedSamples:2,...contract.sourcePage?{sourcePage:publicURL(contract.sourcePage).origin+publicURL(contract.sourcePage).pathname}:{},publishedAt:new Date().toISOString(),health:'healthy'};
  memory.touch(safe.origin);
  update(s=>{for(const [id,op]of Object.entries(s.operations)){const sameFields=JSON.stringify([...op.fields].sort())===JSON.stringify([...safe.fields].sort());const sameLogicalRead=safe.sourcePage&&op.sourcePage===safe.sourcePage&&op.echoField===safe.echoField;if(id!==safe.id&&op.origin===safe.origin&&sameFields&&(op.sampleURL===safe.sampleURL||sameLogicalRead)){safe.supersedes=id;safe.revision=(op.revision??1)+1;delete s.operations[id];}}if(!s.operations[safe.id]&&Object.keys(s.operations).length>=memory.limits.publicOperations)throw Error('Shared catalog is full');s.operations[safe.id]=safe;});
  return safe;
 }
 function select(url,fields){const page=publicURL(url),origin=page.origin,pageKey=origin+page.pathname;fieldsOf(fields);
  const eligible=Object.values(load().operations).filter(o=>o.origin===origin&&(!o.sourcePage||o.sourcePage===pageKey)&&o.transport==='public-http'&&o.credentialFreeReplayVerified&&o.health==='healthy'&&fields.every(k=>o.fields.includes(k)));
  const groups=new Map();for(const op of eligible){const key=instantiate(op,'__INPUT__');const previous=groups.get(key);if(!previous||op.fields.length<previous.fields.length)groups.set(key,op);}
  if(groups.size!==1)return {matched:false,reason:groups.size?'ambiguous-contracts':'no-saved-contract',candidates:[...groups.values()].map(o=>({operationId:o.id,pattern:o.sampleURL,fields:o.fields}))};
  return {matched:true,contract:[...groups.values()][0]};
 }
 return {publish,select,list:()=>({scope:'all-chats-public-contracts',operations:Object.values(load().operations).map(o=>({operationId:o.id,origin:o.origin,pattern:o.sampleURL,fields:o.fields,health:o.health}))}),
  invalidate(id){update(s=>{if(s.operations[id])s.operations[id].health='needs-browser-validation';});}};
}
module.exports={makeSharedReads};
