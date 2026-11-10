const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http');
const {createBrowserService}=require('../package/server.cjs');
(async()=>{
  let service;
  const fixture=http.createServer((_q,r)=>r.end('<title>Local browser check</title><input id="text"><button onclick="document.querySelector(\'#result\').textContent=document.querySelector(\'input\').value">Apply</button><div id="result"></div>'));
  await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
  try {
    service=await createBrowserService();
    const context=await service.getContext(),page=await context.newPage();
    await page.goto('http://127.0.0.1:'+fixture.address().port);
    await page.locator('input').fill('ISOLATED_BROWSER_OK');await page.locator('button').click();
    assert.equal(await page.locator('#result').textContent(),'ISOLATED_BROWSER_OK');
    assert((await service.frame()).buffer.length>100);
    const state=await (await fetch(service.viewerUrl+'state')).json();
    assert(state.open&&state.pageId);
    const post=(origin,pageId,action)=>fetch(service.viewerUrl+'control',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Anodhas-Viewer':'1'},body:JSON.stringify({action,pageId})});
    assert.equal((await post('https://untrusted.invalid',state.pageId,'close')).status,403);
    assert.equal((await post('dsh-app://app','stale-page','close')).status,409);
    assert.equal((await post('dsh-app://app',state.pageId,'close')).status,200);
    assert(page.isClosed());
    fs.writeFileSync(__dirname+'/headless-test.json',JSON.stringify({isolatedContext:true,navigateInputClick:true,realScreenshot:true,exactPageClose:true,untrustedOriginDenied:true,stalePageDenied:true},null,2));
    console.log('Headless local fixture passed');
  } finally {await service?.close();await new Promise(r=>fixture.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
