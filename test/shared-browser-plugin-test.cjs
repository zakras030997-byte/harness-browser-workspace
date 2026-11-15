const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {WorkerClient}=require('../shared-browser/worker-client.cjs');
test('native OpenCode plugin binds actual host identity, honors denial, shares one lazy worker and cleans up exactly once',async()=>{
 const {setup}=await import('../shared-browser/opencode-plugin/index.mjs');const tools=[],calls=[],dir=path.join(os.tmpdir(),'plugin-'+Date.now());let made=0,closed=0,disposed=0,denied=false;
 const ctx={options:{stateDirectory:dir},tool:{transform:async fn=>{fn({namespace(){},add:t=>tools.push(t)});return {dispose:async()=>disposed++};}},permission:{assert:async()=>{if(denied)throw Error('denied');}}};
 const makeWorker=()=>{made++;return {call:async(...args)=>{calls.push(args);return {ok:true};},close:async()=>{closed++;return {stopped:true};}};};
 const closeA=await setup(ctx,{makeWorker}),closeB=await setup(ctx,{makeWorker});assert.equal(made,1);assert(!fs.existsSync(dir));assert.equal(tools.length,22);
 const tool=tools.find(t=>t.name==='read');assert.equal(tool.input.additionalProperties,false);assert(!Object.hasOwn(tool.input.properties,'chat'));
 const input={url:'https://example.test/form',operation:'read',input:'alpha',fields:['name']},host={sessionID:'actual-host-chat',agent:'build',messageID:'fixture-message',id:'fixture-call',signal:new AbortController().signal};
 await tool.execute(input,host);assert.equal(calls[0][1],'actual-host-chat');denied=true;await assert.rejects(tool.execute(input,host),/denied/);assert.equal(calls.length,1);
 await assert.rejects(tool.execute(input,{...host,sessionID:''}),/Actual host/);await closeA();assert.equal(closed,0);await closeB();await closeB();assert.equal(closed,1);assert.equal(disposed,2);
});
test('real Node worker is lazy, implements bounded stdio requests and exits by EOF without browser launch', {timeout:15000},async t=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'shared-worker-')),directory=path.join(parent,'state');const worker=new WorkerClient({directory,nodeExecutable:process.execPath,headless:true});t.after(async()=>{await worker.close();fs.rmSync(parent,{recursive:true,force:true});});
 assert.equal(worker.child,null);assert(!fs.existsSync(directory));const s=await worker.call('memory_status','host-chat',{});assert.equal(s.routes.count,0);assert.deepEqual(await worker.call('tabs','host-chat',{}),{tabs:[]});
 await assert.rejects(worker.call('shell','host-chat',{command:'never runs'}),/UNSUPPORTED_COMMAND/);await assert.rejects(worker.call('memory_status','host-chat',{chat:'foreign'}),/UNSUPPORTED_ARGUMENT/);
 const stop=await worker.close();assert.equal(stop.stopped,true);assert.equal(stop.forceUsed,false);assert(!fs.existsSync(path.join(directory,'browser-profiles')));await assert.rejects(async()=>worker.call('memory_status','host-chat',{}),/WORKER_CLOSED/);
});

test('own browser permission remains guarded and distinct from the Desktop browser gate',async()=>{
 const {setup}=await import('../shared-browser/opencode-plugin/index.mjs');const tools=[],checks=[],calls=[];let effect='allow';
 const ctx={options:{stateDirectory:path.join(os.tmpdir(),'permission-fixture-'+Date.now())},tool:{transform:async fn=>{fn({namespace(){},add:t=>tools.push(t)});return {dispose:async()=>{}};}},permission:{assert:async request=>{checks.push(request);if(request.action==='browser'||request.action==='anodhas_browser_script'||effect!=='allow')throw Error('Permission denied: '+request.action);}}};
 const stop=await setup(ctx,{makeWorker:()=>({call:async(...a)=>{calls.push(a);return{}},close:async()=>({stopped:true})})});
 try{const host={sessionID:'fixture-session',agent:'build',messageID:'m',id:'t'};const memory=tools.find(t=>t.name==='memory_status'),consoleTool=tools.find(t=>t.name==='console');
 assert.equal(memory.options.permission,'anodhas_browser');assert.equal(consoleTool.options.permission,'anodhas_browser_script');await memory.execute({},host);assert.equal(checks[0].action,'anodhas_browser');assert.deepEqual(checks[0].resources,['shared-catalog']);
 await assert.rejects(consoleTool.execute({url:'https://example.com',tabId:'x',expression:'1'},host),/Permission denied/);assert.equal(calls.length,1);
 effect='deny';await assert.rejects(memory.execute({},host),/Permission denied/);assert.equal(calls.length,1);
 effect='ask';await assert.rejects(memory.execute({},host),/Permission denied/);assert.equal(calls.length,1);
 }finally{await stop();}
});
