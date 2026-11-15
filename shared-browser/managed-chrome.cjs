const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {publicURL,safeInput}=require('../chrome/discovery-policy.cjs');
const {project,fieldsOf}=require('../chrome/learned-reads.cjs');
const {fault,pageKey}=require('./catalog.cjs');
const {browserURL,browserPageKey,currentPage,guardPage}=require('./tab-policy.cjs');
class ManagedChrome{
 constructor({catalog,client,headless=false,channel='chrome',launch,configurePage,profileDirectory,separateClientWindows=false,backgroundWindows=false}={}){
  if(!catalog||!['harness','opencode'].includes(client))throw fault('EXPLICIT_BROWSER_OWNER_REQUIRED');
  // No port probing, attachment to an arbitrary running Chrome, pkill, personal
  // profile discovery, cookie export or automatic profile migration.
  Object.assign(this,{catalog,client,headless,channel,launch,configurePage,separateClientWindows,backgroundWindows});this.instance=crypto.randomUUID();this.context=null;this.starting=null;this.closed=false;this.tabs=new Map();this.parked=new Map();this.tails=new Map();this.initialPage=null;this.windowTails=new Map();
  this.profileRoot=path.join(catalog.directory,'browser-profiles');this.profile=path.join(this.profileRoot,client);
  if(profileDirectory){const marker=path.join(catalog.directory,'profile-registry.json'),st=fs.lstatSync(marker);if(st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077))throw fault('PRIVATE_PROFILE_REGISTRY_REQUIRED');const registered=JSON.parse(fs.readFileSync(marker,'utf8'));if(registered.version!==1||registered.profiles?.[client]!==profileDirectory||!path.isAbsolute(profileDirectory))throw fault('PROFILE_NOT_REGISTERED');const ps=fs.lstatSync(profileDirectory);if(!ps.isDirectory()||ps.isSymbolicLink()||ps.uid!==process.getuid()||(ps.mode&0o022))throw fault('UNSAFE_PROFILE_DIRECTORY');this.profile=profileDirectory;this.profileRoot=path.dirname(profileDirectory);}
 }
 async start(){
  if(this.closed)throw fault('BROWSER_CLOSED');if(this.context)return this.context;
  return this.starting??=(async()=>{fs.mkdirSync(this.profileRoot,{recursive:true,mode:0o700});if(fs.lstatSync(this.profileRoot).isSymbolicLink())throw fault('PROFILE_SYMLINK_DENIED');if(fs.existsSync(this.profile)&&fs.lstatSync(this.profile).isSymbolicLink())throw fault('PROFILE_SYMLINK_DENIED');this.catalog.claimProfile(this.profile,this.client,this.instance);
   try{const launch=this.launch??((profile,options)=>require('playwright').chromium.launchPersistentContext(profile,options));const context=await launch(this.profile,{headless:this.headless,...this.channel?{channel:this.channel}:{},viewport:{width:1100,height:800},...(this.separateClientWindows||this.backgroundWindows)&&!this.headless?{ignoreDefaultArgs:true,args:['--user-data-dir='+this.profile,'--remote-debugging-pipe','--no-startup-window','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-popup-blocking','--disable-search-engine-choice-screen','--password-store=basic','--use-mock-keychain']}:{}});
    if(this.closed){await context.close();throw fault('BROWSER_CLOSED');}context.setDefaultTimeout(5000);this.initialPage=context.pages().find(p=>p.url()==='about:blank')??null;this.context=context;context.on('close',()=>{if(this.context!==context)return;this.context=null;this.starting=null;this.initialPage=null;this.tabs.clear();this.parked.clear();this.catalog.releaseProfile(this.profile,this.instance);});return context;
   }catch(e){this.catalog.releaseProfile(this.profile,this.instance);throw e;}
  })().catch(e=>{this.starting=null;throw e;});
 }
 async nativePermission({request=false,signal}={}){
  const context=await this.start(),control=await context.browser().newBrowserCDPSession();try{signal?.throwIfAborted();const processes=await control.send('SystemInfo.getProcessInfo'),pid=processes.processInfo.find(p=>p.type==='browser')?.id;if(!pid)throw fault('OWNED_BROWSER_PID_UNAVAILABLE');const helper=path.join(__dirname,'native/chrome-tab');return await new Promise((resolve,reject)=>require('node:child_process').execFile(helper,[String(pid),String(process.pid),this.profile,'0','about:blank#anodhas-'+crypto.randomUUID(),'--permission-only',...request?['--request-permission']:[]],{signal,timeout:request?120000:5000,maxBuffer:4096},(error,stdout)=>{let value;try{value=JSON.parse(stdout);}catch{}if(error||!value?.permission)reject(fault(value?.error??'AUTOMATION_SETUP_FAILED'));else resolve(value);}));}finally{await control.detach().catch(()=>{});}
 }
 async clientPage(context,chat){
  const requestedClient=chat.split(':')[0];if(!['harness','opencode'].includes(requestedClient))throw fault('WINDOW_CLIENT_REQUIRED');const client=this.separateClientWindows?requestedClient:'shared';
  const previous=this.windowTails.get('create')??Promise.resolve();const next=previous.catch(()=>{}).then(async()=>{
   const marker='about:blank#anodhas-'+crypto.randomUUID(),entries=[...this.tabs.values(),...this.parked.values()],anchor=entries.find(e=>(client==='shared'||e.chat.startsWith(client+':'))&&!e.page.isClosed());
   let control,createdTargetId;try{
    if(anchor&&this.separateClientWindows){
     if(this.headless)await anchor.cdp.send('Runtime.evaluate',{expression:'window.open('+JSON.stringify(marker)+', "_blank"); void 0',userGesture:false});
     else{control=await context.browser().newBrowserCDPSession();const processes=await control.send('SystemInfo.getProcessInfo'),pid=processes.processInfo.find(p=>p.type==='browser')?.id,window=await anchor.cdp.send('Browser.getWindowForTarget');if(!pid)throw fault('OWNED_BROWSER_PID_UNAVAILABLE');
      const before=await control.send('Target.getTargets'),known=new Set(before.targetInfos.map(t=>t.targetId));const helper=path.join(__dirname,'native/chrome-tab');await new Promise((resolve,reject)=>require('node:child_process').execFile(helper,[String(pid),String(process.pid),this.profile,String(window.windowId),marker],{timeout:5000,maxBuffer:4096},(error,stdout)=>{let value;try{value=JSON.parse(stdout);}catch{}if(error||!value?.created)reject(Object.assign(fault(value?.error??'BACKGROUND_TAB_CREATION_FAILED'),{details:{nativeCode:value?.nativeCode,exception:value?.exception,stage:value?.stage}}));else resolve();}));const after=await control.send('Target.getTargets'),fresh=after.targetInfos.filter(t=>!known.has(t.targetId)&&t.type==='page');if(fresh.length!==1)throw fault('AMBIGUOUS_NATIVE_TAB_CREATION');createdTargetId=fresh[0].targetId;}
    }else{control=await context.browser().newBrowserCDPSession();await control.send('Target.createTarget',{url:marker,newWindow:!anchor,background:true,focus:false});}
    const deadline=Date.now()+5000;let page;while(Date.now()<deadline&&!page){if(createdTargetId){for(const candidate of context.pages()){if(candidate.isClosed())continue;const session=await context.newCDPSession(candidate);try{const info=await session.send('Target.getTargetInfo');if(info.targetInfo.targetId===createdTargetId){page=candidate;break;}}finally{await session.detach().catch(()=>{});}}}else page=context.pages().find(p=>p.url()===marker&&!p.isClosed());if(!page)await new Promise(r=>setTimeout(r,25));}if(page&&createdTargetId)await page.goto(marker,{waitUntil:'domcontentloaded',timeout:5000});if(!page)throw fault('OWNED_WINDOW_TARGET_TIMEOUT_UNKNOWN');
    if(anchor){const cdp=await context.newCDPSession(page);try{const a=await anchor.cdp.send('Browser.getWindowForTarget'),b=await cdp.send('Browser.getWindowForTarget');if(a.windowId!==b.windowId){await page.close({runBeforeUnload:false});throw fault('CLIENT_WINDOW_MISMATCH');}}finally{await cdp.detach().catch(()=>{});}}return page;
   }finally{await control?.detach().catch(()=>{});}
  });this.windowTails.set('create',next);next.finally(()=>{if(this.windowTails.get('create')===next)this.windowTails.delete('create');}).catch(()=>{});return next;
 }

 lease(chat,id){const current=this.tabs.get(chat),entry=!id||current?.id===id?current:this.parked.get(id);if(!entry||entry.chat!==chat||entry.page.isClosed())throw fault('NO_OWNED_TAB');return entry;}
 serial(chat,fn,tabId){if(this.closed)return Promise.reject(fault('BROWSER_CLOSED'));if(!chat)return Promise.reject(fault('EXACT_CHAT_REQUIRED'));const lane=tabId?chat+'::'+tabId:chat;const old=this.tails.get(lane)??Promise.resolve();const next=old.catch(()=>{}).then(fn);this.tails.set(lane,next);next.finally(()=>{if(this.tails.get(lane)===next)this.tails.delete(lane);}).catch(()=>{});return next;}
 async open({chat,url,signal,newTab=false}){browserURL(url);return this.serial(chat,async()=>{
  signal?.throwIfAborted();const context=await this.start();signal?.throwIfAborted();let e=this.tabs.get(chat);
  if(newTab&&e&&!e.page.isClosed()){this.parked.set(e.id,e);e=null;}
  if(!e||e.page.isClosed()){
   // All pages belong to this newly launched dedicated profile. Reuse its
   // sole initial blank tab once; never adopt user-created tabs thereafter.
   const initial=this.initialPage;this.initialPage=null;
   const page=(this.separateClientWindows||this.backgroundWindows)?await this.clientPage(context,chat):initial&&!initial.isClosed()?initial:await context.newPage();if((this.separateClientWindows||this.backgroundWindows)&&initial&&!initial.isClosed()&&initial!==page)await initial.close({runBeforeUnload:false});let cdp;try{cdp=await context.newCDPSession(page);}catch(error){await page.close({runBeforeUnload:false}).catch(()=>{});throw error;}
   e={chat,page,cdp,id:crypto.randomUUID(),origin:new URL(url).origin,sourcePage:browserPageKey(url),observations:[],sample:null,requests:new Map()};this.tabs.set(chat,e);
   try{await cdp.send('Network.enable',{maxTotalBufferSize:256*1024,maxResourceBufferSize:128*1024});}catch(error){this.tabs.delete(chat);await page.close({runBeforeUnload:false}).catch(()=>{});throw error;}
   cdp.on('Network.requestWillBeSent',r=>{if(!e.sample)return;try{const u=publicURL(r.request.url);if(r.request.method!=='GET'||u.origin!==e.origin)return;e.requests.set(r.requestId,{url:u.href,method:'GET',sample:e.sample});while(e.requests.size>32)e.requests.delete(e.requests.keys().next().value);}catch{}});
   cdp.on('Network.responseReceived',r=>{const q=e.requests.get(r.requestId);if(q){q.status=r.response.status;q.json=/^application\/(?:[^;]+\+)?json(?:;|$)/i.test(r.response.mimeType??'');}});
   cdp.on('Network.loadingFailed',r=>e.requests.delete(r.requestId));
   cdp.on('Network.loadingFinished',r=>{const q=e.requests.get(r.requestId);e.requests.delete(r.requestId);if(!q||q.sample!==e.sample||q.status!==200||!q.json||r.encodedDataLength>128*1024)return;
    void cdp.send('Network.getResponseBody',{requestId:r.requestId}).then(body=>{if(q.sample!==e.sample)return;const text=body.base64Encoded?Buffer.from(body.body,'base64').toString():body.body;if(Buffer.byteLength(text)>128*1024)return;const scalars=project(JSON.parse(text),q.sample.fields);e.observations.push({url:q.url,method:'GET',status:200,input:q.sample.input,scalars});while(e.observations.length>16)e.observations.shift();q.sample.resolve();}).catch(()=>{});
   });
   await this.configurePage?.(page);
  }
  if(e.sourcePage!==browserPageKey(url)){e.observations=[];e.requests.clear();}
  e.origin=new URL(url).origin;e.sourcePage=browserPageKey(url);
  // No bringToFront or activation fallback. Visible first launch may activate
  // Chrome; steady-state UI focus requires a separate native acceptance test.
  if(currentPage(e)!==browserPageKey(url))await e.page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
  signal?.throwIfAborted();const windowInfo=(this.separateClientWindows||this.backgroundWindows)?await e.cdp.send('Browser.getWindowForTarget'):{};return {tabId:e.id,...windowInfo.windowId?{windowId:windowInfo.windowId,windowOwner:this.separateClientWindows?chat.split(':')[0]:'shared-agent'}:{},window:'dedicated-google-chrome',profileScope:(this.separateClientWindows||this.backgroundWindows)?'shared-agent':this.client,ownedByChat:true,url:currentPage(e),requestedURL:e.sourcePage,redirected:currentPage(e)!==e.sourcePage};
 });}
 async sample({chat,url,input,fields,perform,signal,tabId}){safeInput(input);fieldsOf(fields);if(typeof perform!=='function')throw fault('EXPLICIT_READ_ACTION_REQUIRED');return this.serial(chat,async()=>{
  const e=this.lease(chat,tabId);if(e.sourcePage!==pageKey(url)||pageKeySafe(e.page.url())!==e.sourcePage)throw fault('CAPTURE_PAGE_MISMATCH');signal?.throwIfAborted();let resolve;const observed=new Promise(r=>resolve=r),sample={input,fields,resolve};e.sample=sample;let timer,abort;
  try{const cancelled=new Promise((_,reject)=>{abort=()=>reject(fault('CANCELLED'));signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>reject(fault('OBSERVATION_TIMEOUT_UNKNOWN')),5000);});
   // Attach rejection handling immediately, including while perform is pending.
   const waiting=Promise.race([observed,cancelled]);waiting.catch(()=>{});
   await Promise.race([perform(e.page,signal),cancelled]);signal?.throwIfAborted();await waiting;signal?.throwIfAborted();if(pageKeySafe(e.page.url())!==e.sourcePage)throw fault('CAPTURE_PAGE_MISMATCH');return {observed:true,input,retainedObservations:e.observations.length,persisted:false};
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);e.sample=null;e.requests.clear();}
 });}
 async capture({chat,url,tabId}){return this.serial(chat,async()=>{const e=this.lease(chat,tabId);if(e.sourcePage!==pageKey(url)||pageKeySafe(e.page.url())!==e.sourcePage)throw fault('CAPTURE_PAGE_MISMATCH');return {origin:e.origin,sourcePage:e.sourcePage,observations:structuredClone(e.observations)};});}
 async snapshot(chat,tabId,url){return this.serial(chat,async()=>{const e=url?guardPage(this,chat,{tabId,url}):this.lease(chat,tabId);const tree=(await e.page.locator('body').ariaSnapshot({timeout:5000})).slice(0,48000);if(url)guardPage(this,chat,{tabId,url});return {tabId:e.id,url:currentPage(e),tree};},tabId);}
 async screenshot(chat,tabId,url){return this.serial(chat,async()=>{const e=url?guardPage(this,chat,{tabId,url}):this.lease(chat,tabId),data=await e.page.screenshot({type:'png',timeout:5000});if(url)guardPage(this,chat,{tabId,url});return data;},tabId);}
 async consoleEvaluate(chat,expression,tabId,url){if(typeof expression!=='string'||expression.length>8000)throw fault('INVALID_CONSOLE_EXPRESSION');return this.serial(chat,async()=>{const e=url?guardPage(this,chat,{tabId,url}):this.lease(chat,tabId);if(e.outcomeUnknown)throw fault('CONSOLE_OUTCOME_UNKNOWN_CLOSE_REQUIRED');let timer;try{return await Promise.race([e.page.evaluate(({expression,key})=>{if(key&&location.origin+location.pathname!==key)throw Error('TAB_NAVIGATED');return (0,eval)(expression);},{expression,key:url?browserPageKey(url):null}),new Promise((_,reject)=>{timer=setTimeout(()=>{e.outcomeUnknown=true;reject(fault('CONSOLE_TIMEOUT_OUTCOME_UNKNOWN'));},5000);})]);}finally{clearTimeout(timer);}},tabId);}

 list(chat){return [...this.tabs.values(),...this.parked.values()].filter(e=>e.chat===chat&&!e.page.isClosed()).map(e=>({tabId:e.id,sourcePage:e.sourcePage,currentURL:currentPage(e),redirected:currentPage(e)!==e.sourcePage,preserved:!!e.preserved}));}
 async release(chat,{tabId,keep=false}={}){return this.serial(chat,async()=>{const current=this.tabs.get(chat),e=!tabId||current?.id===tabId?current:this.parked.get(tabId);if(!e||e.chat!==chat){if(tabId)throw fault('NO_OWNED_TAB');return {released:true};}e.sample=null;e.requests.clear();if(keep&&!e.page.isClosed()){e.preserved=true;return {released:false,preserved:true,tabId:e.id};}if(!e.page.isClosed())await e.page.close({runBeforeUnload:false});await e.cdp.detach().catch(()=>{});this.parked.delete(e.id);if(this.tabs.get(chat)===e)this.tabs.delete(chat);return {released:true,applicationClosed:false};},'close:'+String(tabId??'current'));}
 async closeChat(chat){for(const entry of this.list(chat))await this.release(chat,{tabId:entry.tabId});return {released:true};}
 async close(){if(this.closed)return;this.closed=true;for(const e of [...this.tabs.values(),...this.parked.values()]){e.sample?.resolve();e.sample=null;}await this.starting?.catch(()=>{});if(this.context){await this.context.close();this.context=null;}await Promise.allSettled([...this.tails.values()]);this.tabs.clear();this.parked.clear();this.catalog.releaseProfile(this.profile,this.instance);}
}
function pageKeySafe(v){try{return pageKey(v);}catch{return null;}}
module.exports={ManagedChrome};
