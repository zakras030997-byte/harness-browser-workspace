const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {SharedClient}=require('../shared-browser/shared-client.cjs');
async function waitStopped(directory,pid){const end=Date.now()+12000;while(Date.now()<end){try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')return;}await new Promise(r=>setTimeout(r,100));}throw Error('Shared service did not stop normally');}
test('two real client transports share one private lazy runtime, reject foreign authentication and stop normally', {timeout:25000},async t=>{
 const directory=fs.mkdtempSync('/private/tmp/shared-ipc-');fs.chmodSync(directory,0o700);const opts={directory,headless:true,nodeExecutable:process.execPath};const a=new SharedClient({...opts,client:'harness'}),b=new SharedClient({...opts,client:'opencode'});let pid;
 t.after(async()=>{await a.close();await b.close();if(pid)await waitStopped(directory,pid);fs.rmSync(directory,{recursive:true,force:true});});
 const [x,y]=await Promise.all([a.call('memory_status','same-chat',{}),b.call('memory_status','same-chat',{})]);pid=a.serverPid;assert.equal(pid,b.serverPid);assert.equal(x.schemaVersion,1);assert.equal(y.routes.count,0);assert(!fs.existsSync(path.join(directory,'browser-profiles')));
 assert.deepEqual(await a.call('tabs','same-chat',{}),{tabs:[]});await assert.rejects(b.call('memory_status','same-chat',{chat:'harness:foreign'}),/UNSUPPORTED_ARGUMENT/);
 await new Promise((resolve,reject)=>{const socket=net.createConnection(path.join(directory,'shared.sock'));socket.once('connect',()=>socket.write(JSON.stringify({type:'hello',client:'harness',token:'wrong',settings:'wrong'})+'\n'));socket.once('close',resolve);socket.on('error',()=>{});setTimeout(()=>{socket.destroy();reject(Error('Bad auth was not closed'));},2000).unref();});
 await a.close();assert.equal((await b.call('memory_status','same-chat',{})).schemaVersion,1);
});
test('actual shared Chrome has separate client windows, shared test-cookie session and strictly owned chat tabs', {timeout:60000},async t=>{
 const directory=fs.mkdtempSync('/private/tmp/shared-chrome-');fs.chmodSync(directory,0o700);const opts={directory,headless:true,nodeExecutable:process.execPath};const a=new SharedClient({...opts,client:'harness'}),b=new SharedClient({...opts,client:'opencode'});let pid;
 t.after(async()=>{await a.close();await b.close();if(pid)await waitStopped(directory,pid);fs.rmSync(directory,{recursive:true,force:true});});
 const x=await a.call('open','same-chat',{url:'https://example.com'});pid=a.serverPid;const y=await b.call('open','same-chat',{url:'https://example.com'});assert.equal(pid,b.serverPid);assert.notEqual(x.windowId,y.windowId);assert.equal(x.windowOwner,'harness');assert.equal(y.windowOwner,'opencode');
 assert.equal((await a.call('snapshot','same-chat',{url:x.url,tabId:x.tabId})).tabId,x.tabId);await assert.rejects(b.call('snapshot','same-chat',{url:x.url,tabId:x.tabId}),/NO_OWNED_TAB/);
 await a.call('console','same-chat',{url:x.url,tabId:x.tabId,expression:"document.cookie='anodhas_shared_probe=localtest; Path=/; SameSite=Lax'; true"});
 assert.equal(await b.call('console','same-chat',{url:y.url,tabId:y.tabId,expression:"(()=>{const ok=document.cookie.split('; ').includes('anodhas_shared_probe=localtest');document.cookie='anodhas_shared_probe=; Path=/; Max-Age=0';return ok;})()"}),true);
 const next=await a.call('open','other-chat',{url:'https://example.com'});assert.equal(next.windowId,x.windowId);
 const more=await b.call('open','same-chat',{url:'https://example.com',newTab:true});assert.equal(more.windowId,y.windowId);
 await a.call('close_tab','same-chat',{url:'https://stale.example.test/login',tabId:x.tabId});assert.equal((await a.call('tabs','same-chat',{})).tabs.length,0);assert.equal((await b.call('tabs','same-chat',{})).tabs.length,2);
 await a.close();assert((await b.call('snapshot','same-chat',{url:more.url,tabId:more.tabId})).tree.length>200);
 await b.call('close_tab','same-chat',{url:y.url,tabId:y.tabId});await b.call('close_tab','same-chat',{url:more.url,tabId:more.tabId});
});
