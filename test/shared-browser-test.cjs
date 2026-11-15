const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Catalog,createHarnessAdapter,createOpenCodeAdapter}=require('../shared-browser/index.cjs');
const {ManagedChrome}=require('../shared-browser/managed-chrome.cjs');
const {inferCandidates}=require('../chrome/learned-reads.cjs');
const origin='https://example.test',url=origin+'/form',fields=['name','height'];
const data=input=>({name:input,height:input.length});
const observations=(prefix='/api/')=>['alpha','bravo'].map(input=>({method:'GET',status:200,input,url:origin+prefix+input,scalars:data(input)}));
function contract(prefix='/api/'){return {...inferCandidates(observations(prefix),fields)[0],sourcePage:url,transport:'public-http',credentialFreeReplayVerified:true,verifiedSamples:2};}
function setup(t,options={}){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'shared-browser-test-'));fs.chmodSync(directory,0o700);const catalog=new Catalog({directory,...options});t.after(()=>{catalog.close();fs.rmSync(directory,{recursive:true,force:true});});return {directory,catalog};}
class FakeBrowser{
 constructor(){this.opens=0;this.closed=false;this.observations=observations();}
 async open(){this.opens++;return {tabId:'owned-fixture-tab'};}
 async capture(){return {origin,sourcePage:url,observations:this.observations};}
 async sample(){return {observed:true};}
 async release(){return {released:true};}
 async close(){this.closed=true;}
}
const reader=async u=>data(new URL(u).pathname.split('/').at(-1));
const req={chat:'chat-a',url,operation:'creature-info',input:'charlie',fields};
test('Harness learns, OpenCode repeats through the same catalog without opening its browser; reverse direction too',async t=>{
 const {directory,catalog}=setup(t),second=new Catalog({directory});t.after(()=>second.close());const aBrowser=new FakeBrowser(),bBrowser=new FakeBrowser();
 const a=createHarnessAdapter({catalog,browser:aBrowser,authorize:async()=>true,readJSON:reader}),b=createOpenCodeAdapter({catalog:second,browser:bBrowser,authorize:async()=>true,readJSON:reader});
 assert.equal((await a.read(req)).route,'browser-learning');assert.equal((await a.learn(req)).learned,true);
 const result=await b.read({...req,chat:'chat-b'});assert.equal(result.route,'shared-public-request');assert.deepEqual(result.data,data('charlie'));assert.equal(result.cache,false);assert.equal(bBrowser.opens,0);
 await b.learn({...req,operation:'another-public-read'});assert.equal((await a.read({...req,operation:'another-public-read'})).route,'shared-public-request');assert.equal(aBrowser.opens,1);
 await a.close();await b.close();assert(aBrowser.closed&&bBrowser.closed);
});
test('verified replacement is one revision, field-order independent; stale writers cannot replace newer work',t=>{
 const {catalog}=setup(t);catalog.publish({operation:req.operation,contract:contract(),expectedRevision:0});catalog.publish({operation:req.operation,contract:contract('/v2/'),expectedRevision:1});
 const selected=catalog.select({...req,fields:[...fields].reverse()});assert.equal(selected.revision,2);assert(selected.contract.sampleURL.includes('/v2/'));assert.equal(catalog.stats().routes.count,1);
 assert.throws(()=>catalog.publish({operation:req.operation,contract:contract(),expectedRevision:1}),/REVISION_CONFLICT/);catalog.invalidate(selected.key,1);assert.equal(catalog.select(req).matched,true);
});
test('incidental, familiar and pinned retention is based on successful use, with bounded audit',t=>{
 let n=Date.UTC(2026,0,1);const {catalog}=setup(t,{now:()=>n,limits:{auditBytes:300}});const c=contract();let saved=catalog.publish({operation:req.operation,contract:c,expectedRevision:0});
 n+=8*86400000;assert.equal(catalog.select(req).matched,false);
 saved=catalog.publish({operation:req.operation,contract:c,expectedRevision:0});for(let i=0;i<2;i++){n+=86400000;catalog.markSuccess(saved.key);}assert.equal(catalog.stats().sites[0].tier,'familiar');
 n+=40*86400000;assert(catalog.select(req).matched);for(let i=0;i<30;i++)catalog.markSuccess(saved.key);assert(catalog.stats().audit.bytes<=300);
 const yt={...contract(),origin:'https://www.youtube.com',sourcePage:'https://www.youtube.com/form',sampleURL:'https://www.youtube.com/api/__INPUT__'};catalog.publish({operation:'youtube-public',contract:yt,expectedRevision:0});n+=181*86400000;assert(!catalog.select(req).matched);assert(catalog.select({url:yt.sourcePage,operation:'youtube-public',fields}).matched);
});
test('capacity refuses new records and preserves useful ones; no response or credential bodies persisted',t=>{
 const {catalog,directory}=setup(t,{limits:{publicCount:1}});catalog.publish({operation:req.operation,contract:{...contract(),cookies:'DO_NOT_STORE',samples:[{secret:'DO_NOT_STORE'}],headers:{authorization:'DO_NOT_STORE'}},expectedRevision:0});
 assert.throws(()=>catalog.publish({operation:'another',contract:contract(),expectedRevision:0}),/CATALOG_FULL/);assert(catalog.select(req).matched);assert(!fs.readFileSync(path.join(directory,'catalog.sqlite')).includes(Buffer.from('DO_NOT_STORE')));
});
test('private references stay client/chat/account scoped, and cannot contain raw request objects',async t=>{
 const {catalog}=setup(t),scope={client:'harness',chat:'chat-a',account:'account-a',origin};catalog.putPrivateReference(scope,{provider:'youtube-menu',reference:'opaque123'});
 assert(catalog.privateReference(scope));for(const change of [{client:'opencode'},{chat:'other'},{account:'other'}])assert.equal(catalog.privateReference({...scope,...change}),null);
 assert.throws(()=>catalog.putPrivateReference(scope,{provider:'cookie=secret',reference:'x'}),/OPAQUE/);
 let replayed=0;const b=createOpenCodeAdapter({catalog,browser:new FakeBrowser(),authorize:async()=>true,privateProvider:{validateIdentity:async()=>false,replay:async()=>{replayed++;}}});
 await assert.rejects(b.readPrivate({chat:'chat-a',url,account:'account-a',fields}),/IDENTITY_MISMATCH/);assert.equal(replayed,0);await b.close();
});
test('authorization denial precedes browser, lookup and network; unsupported captures never become recipes',async t=>{
 const {catalog}=setup(t),browser=new FakeBrowser();let reads=0;const e=createHarnessAdapter({catalog,browser,authorize:async()=>false,readJSON:async()=>reads++});await assert.rejects(e.read(req),/NOT_AUTHORIZED/);assert.equal(reads,0);assert.equal(browser.opens,0);await e.close();
 const bad=new FakeBrowser();bad.observations=observations().map(x=>({...x,method:'POST'}));const a=createHarnessAdapter({catalog,browser:bad,authorize:async()=>true,readJSON:reader});assert.equal((await a.learn(req)).learned,false);assert.equal(catalog.stats().routes.count,0);await a.close();
});
test('temporary and unknown errors do not invalidate or retry a route; schema change opens browser for validation',async t=>{
 const {catalog}=setup(t);catalog.publish({operation:req.operation,contract:contract(),expectedRevision:0});
 for(const message of ['Observed public read returned HTTP 429','action outcome UNKNOWN timeout']){const browser=new FakeBrowser();let attempts=0;const a=createHarnessAdapter({catalog,browser,authorize:async()=>true,readJSON:async()=>{attempts++;throw Error(message);}});await assert.rejects(a.read(req));assert.equal(attempts,1);assert.equal(browser.opens,0);assert(catalog.select(req).matched);await a.close();}
 const browser=new FakeBrowser(),a=createHarnessAdapter({catalog,browser,authorize:async()=>true,readJSON:async()=>({wrong:'schema'})});assert.equal((await a.read(req)).route,'browser-learning');assert.equal(catalog.select(req).reason,'needs-validation');await a.close();
});
test('cancellation and disposal prevent late learned-route publication',async t=>{
 const {catalog}=setup(t);let finish,started;const ready=new Promise(r=>started=r),blocked=new Promise(r=>finish=r),browser=new FakeBrowser(),c=new AbortController();const a=createHarnessAdapter({catalog,browser,authorize:async()=>true,readJSON:async u=>{started();await blocked;return reader(u);}});
 const learning=a.learn({...req,signal:c.signal});await ready;c.abort();finish();await assert.rejects(learning);assert.equal(catalog.stats().routes.count,0);await a.close();await assert.rejects(a.read(req),/ENGINE_CLOSED/);
});
test('profile leases are exclusive and release only the exact instance; unsupported schema fails closed',t=>{
 const {catalog,directory}=setup(t),profile=path.join(directory,'browser-profiles/harness');catalog.claimProfile(profile,'harness','instance-a');assert.throws(()=>catalog.claimProfile(profile,'opencode','instance-b'),/ALREADY_LEASED/);catalog.releaseProfile(profile,'instance-b');assert.throws(()=>catalog.claimProfile(profile,'harness','instance-c'),/ALREADY_LEASED/);catalog.releaseProfile(profile,'instance-a');catalog.claimProfile(profile,'harness','instance-c');catalog.releaseProfile(profile,'instance-c');
 catalog.db.exec('PRAGMA user_version=99');assert.throws(()=>new Catalog({directory}),/VERSION_UNSUPPORTED/);
});

test('separate processes commit to one SQLite catalog without lost updates',async t=>{
 const {spawn}=require('node:child_process'),{catalog,directory}=setup(t),modulePath=require.resolve('../shared-browser/catalog.cjs'),c=contract();
 const workers=Array.from({length:3},(_,i)=>new Promise((resolve,reject)=>{const code=`const {Catalog}=require(${JSON.stringify(modulePath)});const c=new Catalog({directory:process.argv[1]});for(let n=0;n<10;n++)c.publish({operation:'worker-${i}-'+n,contract:${JSON.stringify(c)},expectedRevision:0});c.close();`;
  const child=spawn(process.execPath,['-e',code,directory],{stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',x=>error+=x);child.once('error',reject);child.once('exit',s=>s===0?resolve():reject(Error('Worker failed: '+error.slice(0,200))));}));await Promise.all(workers);assert.equal(catalog.stats().routes.count,30);
});
test('closing while host authorization is pending cannot dispatch a late read',async t=>{
 const {catalog}=setup(t);let allow,started;const ready=new Promise(r=>started=r),permission=new Promise(r=>allow=r),browser=new FakeBrowser();const e=createHarnessAdapter({catalog,browser,authorize:async()=>{started();return permission;},readJSON:reader});const read=e.read(req);await ready;await e.close();allow(true);await assert.rejects(read,/ENGINE_CLOSED/);assert.equal(browser.opens,0);
});
test('an existing Chrome profile requires a private owner registry; no arbitrary-profile fallback exists',t=>{
 const {catalog,directory}=setup(t),profile=path.join(directory,'existing');fs.mkdirSync(profile,{mode:0o700});assert.throws(()=>new ManagedChrome({catalog,client:'opencode',profileDirectory:profile}));
 const marker=path.join(directory,'profile-registry.json');fs.writeFileSync(marker,JSON.stringify({version:1,profiles:{opencode:profile}}),{mode:0o600});const b=new ManagedChrome({catalog,client:'opencode',profileDirectory:profile});assert.equal(b.profile,profile);assert.throws(()=>new ManagedChrome({catalog,client:'harness',profileDirectory:profile}),/NOT_REGISTERED/);fs.chmodSync(marker,0o644);assert.throws(()=>new ManagedChrome({catalog,client:'opencode',profileDirectory:profile}),/PRIVATE_PROFILE_REGISTRY/);
});
