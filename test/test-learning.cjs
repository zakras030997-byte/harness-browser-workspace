const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {makeLearnedReads,inferCandidates}=require('../chrome/learned-reads.cjs');
const {publicURL,publicAddress}=require('../chrome/discovery-policy.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harness-observed-read-unit-'));
 const observation=(input,id,url='https://catalog.example/v3/creatures/'+input)=>({input,url,method:'GET',status:200,scalars:{id,name:input}});
 const capture={origin:'https://catalog.example',observations:[observation('red',1),observation('blue',2)]};
 let calls=0;const readJSON=async url=>{calls++;const name=new URL(url).pathname.split('/').at(-1);return {name,id:{red:1,blue:2,green:3}[name]};};
 const file=path.join(dir,'saved.json');
 try{
  const store=makeLearnedReads({session:'a',storeFile:file,readJSON});
  assert.equal(store.list().operations.length,0);
  const learned=await store.learn(capture,['id','name']);assert(learned.learned);assert.equal(learned.parameter.kind,'path');
  assert.equal(calls,2);assert.equal(fs.statSync(file).mode&0o777,0o600);
  const fresh=await store.replay(learned.operationId,'green');assert.deepEqual(fresh.data,{id:3,name:'green'});assert.equal(fresh.via,'observed-http');assert.equal(calls,3);
  const reloaded=makeLearnedReads({session:'a',storeFile:file,readJSON:async()=>{throw Error('No request expected for cached read')}});
  assert.equal(reloaded.list().operations[0].operationId,learned.operationId);
  assert.equal((await reloaded.replay(learned.operationId,'green')).via,'local-cache');
  assert.throws(()=>makeLearnedReads({session:'b',storeFile:file}).list(),/another chat/);
  await assert.rejects(store.replay(learned.operationId,'red/../../private'));
  const query=[observation('red',1,'https://catalog.example/find?term=red&limit=3'),observation('blue',2,'https://catalog.example/find?term=blue&limit=3')];
  assert.equal(inferCandidates(query,['id','name'])[0].parameter.key,'term');
  assert.equal(inferCandidates([capture.observations[0]],['id','name']).length,0);
  assert.equal(inferCandidates([{...capture.observations[0],method:'POST'},capture.observations[1]],['id','name']).length,0);
  assert.equal(inferCandidates([capture.observations[0],observation('blue',2,'https://other.example/v3/creatures/blue')],['id','name']).length,0);
  assert.equal(inferCandidates([capture.observations[0],observation('blue',2,'https://catalog.example/v4/creatures/blue')],['id','name']).length,0);
  assert.throws(()=>publicURL('https://127.0.0.1/read'));assert.throws(()=>publicURL('https://catalog.example/delete/red'));
  assert.throws(()=>publicURL('https://catalog.example/find?token=private'));assert.throws(()=>publicURL('https://catalog.example/find?action=delete'));
  for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.2','::1','::ffff:127.0.0.1'])assert(!publicAddress(address));
  assert(publicAddress('1.1.1.1'));assert(publicAddress('2606:4700:4700::1111'));
  const bad=makeLearnedReads({session:'bad',storeFile:path.join(dir,'bad.json'),readJSON:async()=>({id:1,name:'different'})});
  await assert.rejects(bad.learn(capture,['id','name']),/contract/);assert(!fs.existsSync(path.join(dir,'bad.json')));
  console.log('PASS: learned path/query, fresh third input, disk reload/cache, ownership, 0600, no fixed endpoint, no ambiguous/private/destructive/sensitive requests');
 }finally{fs.rmSync(dir,{recursive:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
