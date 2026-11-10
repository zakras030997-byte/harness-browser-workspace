const {test}=require('node:test'),assert=require('node:assert/strict');
test('native control limits cookies to current origin and hides values by default',async()=>{
 const {createBrowserControl}=await import('../native/control.mjs');const c=createBrowserControl(),calls=[];const guest={isDestroyed:()=>false,getURL:()=> 'https://example.com/page',session:{cookies:{get:async q=>[{name:'session',value:'fixture',httpOnly:true}],set:async q=>calls.push(q),remove:async()=>{}}}};
 assert.equal((await c.execute(guest,{action:'cookies_get'})).cookies[0].value,undefined);
 assert.equal((await c.execute(guest,{action:'cookies_get',includeValues:true})).cookies[0].value,'fixture');
 await assert.rejects(c.execute(guest,{action:'cookies_get',url:'https://another.invalid/'}),/current guest site/);
 await c.execute(guest,{action:'cookies_set',name:'test',value:'fixture',httpOnly:true});assert(calls[0].httpOnly&&calls[0].secure);
 await assert.rejects(c.execute(guest,{action:'navigate',url:'file:///etc/passwd'}),/HTTP/);
});
test('carrier patch requires exact unique anchors and cannot be applied twice',()=>{
 const {makePatch}=require('../native/patch.cjs');const main='import { BrowserWindow, xx\n\tipcMain.handle(DESKTOP_IPC.browserAcquire, (event, workspace) => {',preload='\t\tacquire: (workspace) => electron.ipcRenderer.invoke(DESKTOP_IPC.browserAcquire, workspace),';
 const patched=makePatch(main,preload);assert(patched.main.includes('lease.owner!==event.sender'));assert(patched.preload.includes('controlVersion: 1'));
 assert.throws(()=>makePatch(patched.main,patched.preload),/already present/);assert.throws(()=>makePatch('wrong','wrong'),/Unsupported/);
});
