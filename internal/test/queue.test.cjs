const {test}=require('node:test'),assert=require('node:assert/strict');const {startQueue}=require('../lib/queue.cjs');
test('queue binds chat and result owner, rejects foreign origins and never redelivers',async()=>{
 const q=await startQueue();const post=(url,v,origin='dsh-app://app')=>fetch(q.url+url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Anodhas-Browser':'1'},body:JSON.stringify(v)});
 try{
  assert.equal((await post('poll',{windowId:'a',sessionId:'chat-a',native:true},'https://untrusted.invalid')).status,403);
  await post('poll',{windowId:'a',sessionId:'chat-a',native:true});assert(q.status('chat-a').nativeControl);assert(!q.status('chat-b').nativeControl);
  await assert.rejects(q.call('chat-b',{},AbortSignal.timeout(2000)),/Open this chat/);
  const work=q.call('chat-a',{action:'tabs'},AbortSignal.timeout(2000));const first=await(await post('poll',{windowId:'a',sessionId:'chat-a',native:true})).json();assert(first.job);
  assert.equal((await(await post('poll',{windowId:'a',sessionId:'chat-a',native:true})).json()).job,null);
  assert.equal((await post('result',{windowId:'b',id:first.job.id,result:{}})).status,400);
  await post('result',{windowId:'a',id:first.job.id,result:{ok:true}});assert.deepEqual(await work,{ok:true});
 }finally{await q.close();}
});
