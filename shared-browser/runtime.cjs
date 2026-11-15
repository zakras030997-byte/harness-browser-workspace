const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Catalog,ManagedChrome,createOpenCodeAdapter}=require('./index.cjs');
const {fault}=require('./catalog.cjs');
const {guardPage}=require('./tab-policy.cjs');
const uiActions=require('./ui-actions.cjs');
function createRuntime({directory,headless=false,profileDirectory,separateClientWindows=false,backgroundWindows=false,launch}={}){
const catalog=new Catalog({directory});
const browser=new ManagedChrome({catalog,client:'opencode',headless,profileDirectory,separateClientWindows,backgroundWindows,launch});
const engine=createOpenCodeAdapter({catalog,browser,authorize:async()=>true});
function owned(chat,args){return guardPage(browser,chat,args);}
function fieldsOnly(args,allowed){for(const k of Object.keys(args))if(!allowed.includes(k))throw fault('UNSUPPORTED_ARGUMENT');}
function captureFile(data){
 if(data.length>5*1024*1024)throw fault('CAPTURE_TOO_LARGE');const dir=path.join(directory,'captures');fs.mkdirSync(dir,{recursive:true,mode:0o700});if(fs.lstatSync(dir).isSymbolicLink())throw fault('CAPTURE_SYMLINK_DENIED');
 const files=fs.readdirSync(dir).filter(n=>/^[a-f0-9-]+\.png$/.test(n)).map(n=>({p:path.join(dir,n),s:fs.lstatSync(path.join(dir,n))})).filter(x=>x.s.isFile()&&!x.s.isSymbolicLink()).sort((a,b)=>a.s.mtimeMs-b.s.mtimeMs);
 let size=files.reduce((n,x)=>n+x.s.size,0);for(const x of files)if(Date.now()-x.s.mtimeMs>86400000||size+data.length>10*1024*1024){fs.unlinkSync(x.p);size-=x.s.size;}
 const file=path.join(dir,crypto.randomUUID()+'.png');fs.writeFileSync(file,data,{mode:0o600,flag:'wx'});return {path:file,bytes:data.length,retentionDays:1,captureBudgetBytes:10*1024*1024};
}
async function execute(command,chat,args,signal){
 if(typeof chat!=='string'||!chat||chat.length>160)throw fault('HOST_CHAT_REQUIRED');
 switch(command){
  case 'read':fieldsOnly(args,['url','operation','input','fields','newTab']);return engine.read({...args,chat,signal});
  case 'open':fieldsOnly(args,['url','newTab']);return browser.open({...args,chat,signal});
  case 'tabs':fieldsOnly(args,[]);return {tabs:browser.list(chat)};
  case 'setup_native_access':fieldsOnly(args,[]);return browser.nativePermission({request:true,signal});
  case 'memory_status':fieldsOnly(args,[]);return catalog.stats();
  case 'learn':fieldsOnly(args,['url','tabId','operation','fields']);owned(chat,args);return engine.learn({...args,chat,signal});
  case 'sample_read':fieldsOnly(args,['url','tabId','input','fields','fillSelector','submitSelector']);owned(chat,args);if(![args.fillSelector,args.submitSelector].every(x=>typeof x==='string'&&x.length>0&&x.length<=200))throw fault('EXPLICIT_SELECTORS_REQUIRED');return engine.sample({...args,chat,signal,perform:async page=>{signal.throwIfAborted();await page.locator(args.fillSelector).fill(args.input);signal.throwIfAborted();await page.locator(args.submitSelector).click();}});
  case 'snapshot':fieldsOnly(args,['url','tabId']);owned(chat,args);return browser.snapshot(chat,args.tabId,args.url);
  case 'screenshot':fieldsOnly(args,['url','tabId']);owned(chat,args);return captureFile(await browser.screenshot(chat,args.tabId,args.url));
  case 'console':fieldsOnly(args,['url','tabId','expression']);owned(chat,args);{const value=await browser.consoleEvaluate(chat,args.expression,args.tabId,args.url);return value===undefined?{value:null,wasUndefined:true}:value;}
  case 'close_tab':fieldsOnly(args,['url','tabId','keep']);return browser.release(chat,{tabId:args.tabId,keep:args.keep===true});
  case 'interact':fieldsOnly(args,['url','tabId','action','selector','role','name','value']);return uiActions.interact(browser,chat,args,signal);
  default:throw fault('UNSUPPORTED_COMMAND');
 }
}
return {execute,async close(){await engine.close();catalog.close();},releaseChat:chat=>browser.closeChat(chat)};
}
module.exports={createRuntime};
