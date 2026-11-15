const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {publicURL}=require('../chrome/discovery-policy.cjs');
const {instantiate,fieldsOf}=require('../chrome/learned-reads.cjs');
const DAY=86400000,hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const DEFAULTS=Object.freeze({routeBytes:20*1024*1024,privateBytes:256*1024,publicCount:936,privateCount:64,recordBytes:32*1024,auditBytes:10*1024*1024,auditDays:7,temporaryDays:7,familiarDays:180});
function fault(code){return Object.assign(Error(code),{code});}
function operationName(v){if(typeof v!=='string'||!/^[a-z][a-z0-9.-]{0,63}$/.test(v))throw fault('INVALID_OPERATION');return v;}
function pageKey(v){const u=publicURL(v);return u.origin+u.pathname;}
function contractOf(v){
 fieldsOf(v.fields);const u=publicURL(v.sourcePage),fields=[...v.fields].sort();
 if(u.origin!==v.origin||v.transport!=='public-http'||v.credentialFreeReplayVerified!==true||v.verifiedSamples!==2||!fields.includes(v.echoField))throw fault('UNVERIFIED_CONTRACT');
 const sampleURL=instantiate(v,'__INPUT__'),types=Object.fromEntries(fields.map(f=>{if(!['string','number','boolean','null'].includes(v.types?.[f]))throw fault('INVALID_FIELD_TYPE');return [f,v.types[f]];}));
 return {origin:u.origin,sourcePage:pageKey(v.sourcePage),sampleURL,parameter:v.parameter.kind==='path'?{kind:'path',index:v.parameter.index}:{kind:'query',key:v.parameter.key},fields,types,echoField:v.echoField,transport:'public-http',credentialFreeReplayVerified:true,verifiedSamples:2};
}
class Catalog{
 constructor({directory,now=Date.now,limits={}}={}){
  if(!directory||!path.isAbsolute(directory))throw fault('EXPLICIT_LOCAL_DIRECTORY_REQUIRED');
  fs.mkdirSync(directory,{recursive:true,mode:0o700});const st=fs.lstatSync(directory);
  if(st.isSymbolicLink()||!st.isDirectory()||(st.mode&0o077)||st.uid!==process.getuid())throw fault('PRIVATE_DIRECTORY_REQUIRED');
  this.directory=directory;this.now=now;this.limits={...DEFAULTS,...limits};this.closed=false;this.file=path.join(directory,'catalog.sqlite');
  if(fs.existsSync(this.file)&&fs.lstatSync(this.file).isSymbolicLink())throw fault('DATABASE_SYMLINK_DENIED');
  this.db=new DatabaseSync(this.file);fs.chmodSync(this.file,0o600);
  this.db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  const version=this.db.prepare('PRAGMA user_version').get().user_version;
  if(version!==0&&version!==1){this.db.close();throw fault('CATALOG_VERSION_UNSUPPORTED');}
  if(version===0)this.db.exec('PRAGMA auto_vacuum=INCREMENTAL;');
  this.db.exec(`CREATE TABLE IF NOT EXISTS sites(origin TEXT PRIMARY KEY,tier TEXT NOT NULL,last_used INTEGER NOT NULL,days TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS recipes(key TEXT PRIMARY KEY,origin TEXT NOT NULL,operation TEXT NOT NULL,page TEXT NOT NULL,payload TEXT NOT NULL,revision INTEGER NOT NULL,health TEXT NOT NULL,updated INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS private_refs(key TEXT PRIMARY KEY,origin TEXT NOT NULL,scope TEXT NOT NULL,provider TEXT NOT NULL,reference TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,event TEXT NOT NULL,origin TEXT);
   CREATE TABLE IF NOT EXISTS profiles(path TEXT PRIMARY KEY,client TEXT NOT NULL,instance TEXT NOT NULL,pid INTEGER NOT NULL);
   PRAGMA user_version=1;`);
 }
 transaction(fn){if(this.closed)throw fault('CATALOG_CLOSED');this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 sweepInside(){
  const n=this.now();for(const s of this.db.prepare('SELECT * FROM sites').all())if(s.tier!=='important'&&n-s.last_used>(s.tier==='familiar'?this.limits.familiarDays:this.limits.temporaryDays)*DAY){this.db.prepare('DELETE FROM recipes WHERE origin=?').run(s.origin);this.db.prepare('DELETE FROM private_refs WHERE origin=?').run(s.origin);this.db.prepare('DELETE FROM sites WHERE origin=?').run(s.origin);}
  this.db.prepare('DELETE FROM audit WHERE at<? OR at>?').run(n-this.limits.auditDays*DAY,n);
 }
 touchInside(origin){
  const old=this.db.prepare('SELECT * FROM sites WHERE origin=?').get(origin),day=Math.floor(this.now()/DAY),days=[...new Set([...(old?JSON.parse(old.days):[]).filter(d=>day-d<30&&d<=day),day])];
  const tier=origin==='https://www.youtube.com'||old?.tier==='important'?'important':old?.tier==='familiar'||days.length>=3?'familiar':'temporary';
  this.db.prepare('INSERT OR REPLACE INTO sites VALUES(?,?,?,?)').run(origin,tier,this.now(),JSON.stringify(days));
 }
 auditInside(event,origin){
  if(!['learned','replayed','invalidated','private-replayed','expired'].includes(event))throw fault('INVALID_AUDIT_EVENT');
  this.db.prepare('INSERT INTO audit(at,event,origin) VALUES(?,?,?)').run(this.now(),event,origin??null);
  while(this.db.prepare('SELECT coalesce(sum(length(event)+length(coalesce(origin,\'\'))+32),0) AS bytes FROM audit').get().bytes>this.limits.auditBytes)this.db.prepare('DELETE FROM audit WHERE id=(SELECT min(id) FROM audit)').run();
 }
 keyFor({url,operation,fields}){fieldsOf(fields);return hash({page:pageKey(url),operation:operationName(operation),fields:[...fields].sort()});}
 revision(request){return this.db.prepare('SELECT revision FROM recipes WHERE key=?').get(this.keyFor(request))?.revision??0;}
 publish({operation,contract,expectedRevision}){
  operationName(operation);const safe=contractOf(contract),key=this.keyFor({url:safe.sourcePage,operation,fields:safe.fields}),payload=JSON.stringify(safe),bytes=Buffer.byteLength(payload);
  if(bytes>this.limits.recordBytes)throw fault('RECORD_TOO_LARGE');
  return this.transaction(()=>{this.sweepInside();const old=this.db.prepare('SELECT * FROM recipes WHERE key=?').get(key);
   if((old?.revision??0)!==expectedRevision)throw fault('REVISION_CONFLICT');
   const sum=this.db.prepare('SELECT coalesce(sum(length(cast(payload AS BLOB))),0) AS bytes,count(*) AS count FROM recipes WHERE key<>?').get(key);
   if(sum.bytes+bytes>this.limits.routeBytes-this.limits.privateBytes||sum.count+1>this.limits.publicCount)throw fault('CATALOG_FULL');
   const revision=(old?.revision??0)+1;this.db.prepare('INSERT OR REPLACE INTO recipes VALUES(?,?,?,?,?,?,?,?)').run(key,safe.origin,operation,safe.sourcePage,payload,revision,'healthy',this.now());this.touchInside(safe.origin);this.auditInside('learned',safe.origin);return {key,revision};
  });
 }
 select(request){return this.transaction(()=>{this.sweepInside();const key=this.keyFor(request),row=this.db.prepare('SELECT * FROM recipes WHERE key=?').get(key);if(!row||row.health!=='healthy')return {matched:false,reason:row?'needs-validation':'not-learned'};return {matched:true,key,revision:row.revision,contract:contractOf(JSON.parse(row.payload))};});}
 markSuccess(key){this.transaction(()=>{const row=this.db.prepare('SELECT origin FROM recipes WHERE key=?').get(key);if(row){this.touchInside(row.origin);this.auditInside('replayed',row.origin);}});}
 invalidate(key,revision){this.transaction(()=>{const row=this.db.prepare('SELECT origin FROM recipes WHERE key=? AND revision=?').get(key,revision);if(row){this.db.prepare("UPDATE recipes SET health='needs-validation' WHERE key=? AND revision=?").run(key,revision);this.auditInside('invalidated',row.origin);}});}
 privateKey({client,chat,account,origin}){if(![client,chat,account].every(x=>typeof x==='string'&&x.length>0&&x.length<=160))throw fault('EXACT_PRIVATE_SCOPE_REQUIRED');return hash({client,chat,account,origin:publicURL(origin).origin});}
 putPrivateReference(scope,{provider,reference}){
  if(!/^[a-z][a-z0-9.-]{0,63}$/.test(provider)||!/^[a-zA-Z0-9_-]{1,128}$/.test(reference))throw fault('OPAQUE_REFERENCE_REQUIRED');
  const origin=publicURL(scope.origin).origin,key=this.privateKey(scope),json=JSON.stringify({provider,reference});
  this.transaction(()=>{this.sweepInside();const m=this.db.prepare('SELECT count(*) AS count,coalesce(sum(length(reference)+length(provider)+length(scope)+length(key)+length(origin)),0) AS bytes FROM private_refs WHERE key<>?').get(key);
   if(m.count+1>this.limits.privateCount||m.bytes+Buffer.byteLength(json)+Buffer.byteLength(origin)+128>this.limits.privateBytes)throw fault('PRIVATE_CATALOG_FULL');
   this.db.prepare('INSERT OR REPLACE INTO private_refs VALUES(?,?,?,?,?)').run(key,origin,key,provider,reference);this.touchInside(origin);
  });
 }
 privateReference(scope){const key=this.privateKey(scope);return this.transaction(()=>{this.sweepInside();return this.db.prepare('SELECT provider,reference FROM private_refs WHERE key=?').get(key)??null;});}
 claimProfile(profile,client,instance){return this.transaction(()=>{if(!path.isAbsolute(profile))throw fault('ABSOLUTE_PROFILE_REQUIRED');const old=this.db.prepare('SELECT * FROM profiles WHERE path=?').get(profile);if(old){let gone=false;try{process.kill(old.pid,0);}catch(e){gone=e.code==='ESRCH';}if(!gone)throw fault('PROFILE_ALREADY_LEASED');this.db.prepare('DELETE FROM profiles WHERE path=? AND instance=?').run(profile,old.instance);}this.db.prepare('INSERT INTO profiles VALUES(?,?,?,?)').run(profile,client,instance,process.pid);});}
 releaseProfile(profile,instance){this.transaction(()=>this.db.prepare('DELETE FROM profiles WHERE path=? AND instance=?').run(profile,instance));}
 stats(){return this.transaction(()=>{this.sweepInside();return {schemaVersion:1,routes:this.db.prepare('SELECT count(*) AS count,coalesce(sum(length(cast(payload AS BLOB))),0) AS bytes FROM recipes').get(),privateReferences:this.db.prepare('SELECT count(*) AS count FROM private_refs').get().count,audit:this.db.prepare('SELECT count(*) AS count,coalesce(sum(length(event)+length(coalesce(origin,\'\'))+32),0) AS bytes FROM audit').get(),physicalBytes:fs.statSync(this.file).size,sites:this.db.prepare('SELECT origin,tier,last_used FROM sites').all(),limits:this.limits,cleanup:'on-use',browserProfileBytesIncluded:false};});}
 compact(){this.transaction(()=>this.sweepInside());this.db.exec('PRAGMA incremental_vacuum;');return this.stats();}
 close(){if(!this.closed){this.closed=true;this.db.close();}}
}
module.exports={Catalog,DEFAULTS,fault,contractOf,operationName,pageKey};
