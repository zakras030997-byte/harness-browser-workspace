'use strict';
// Public Playwright MCP createConnection API; no OS input or personal browser profile.
const http=require('node:http'),crypto=require('node:crypto'),readline=require('node:readline');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= require('node:path').join(require('../lib/config.cjs').stateDir(),'playwright');
const {chromium}=require('playwright');
const {createConnection}=require('@playwright/mcp');
const executablePath=process.env.ANODHAS_CHROMIUM_EXECUTABLE || undefined;
const safeJson=v=>JSON.stringify(v).replaceAll('<','\\u003c');
async function createBrowserService(){
 let browser,context,launching,active,closing=false,frameWork;const pageIds=new WeakMap();
 function pageId(){if(!active||active.isClosed())return null;if(!pageIds.has(active))pageIds.set(active,crypto.randomUUID());return pageIds.get(active);}
 const token=crypto.randomBytes(24).toString('hex');
 async function getContext(){
  if(context)return context;
  if(!launching)launching=(async()=>{browser=await chromium.launch({headless:true,executablePath});context=await browser.newContext({viewport:{width:1280,height:800}});context.on('page',p=>{active=p;p.on('close',()=>{if(active===p)active=context?.pages().at(-1);});});context.on('close',()=>{context=undefined;launching=undefined;active=undefined;});return context;})().catch(e=>{launching=undefined;throw e;});
  return launching;
 }
 async function frame(){
  if(!active||active.isClosed())return null;
  if(!frameWork)frameWork=active.screenshot({type:'jpeg',quality:65,timeout:5000}).then(buffer=>({buffer,title:active.url()})).finally(()=>{frameWork=undefined;});
  return frameWork;
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  if(req.headers.host!==`127.0.0.1:${server.address().port}`){res.writeHead(403).end();return;}
  const u=new URL(req.url,'http://127.0.0.1');
  if(!u.pathname.startsWith('/'+token+'/')){res.writeHead(404).end();return;}
  const leaf=u.pathname.slice(token.length+2);
  const ownOrigin=`http://127.0.0.1:${server.address().port}`,origin=req.headers.origin;
  const allowed=origin==='dsh-app://app'||origin===ownOrigin;
  if(allowed){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Anodhas-Viewer');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');}
  if(req.method==='OPTIONS'){res.writeHead(allowed?204:403).end();return;}
  if(req.method==='POST'&&leaf==='control'){
   if(!allowed||req.headers['x-anodhas-viewer']!=='1'||!req.headers['content-type']?.startsWith('application/json')){res.writeHead(403).end();return;}
   try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>30000)throw Error('Request too large');}const command=JSON.parse(raw),p=active;
    if(!p||p.isClosed()){if(command.action==='close'&&command.pageId===null){res.writeHead(200,{'Content-Type':'application/json'}).end('{"closed":true}');return;}res.writeHead(409).end();return;}
    if(command.pageId!==pageId()){res.writeHead(409).end();return;}
    if(command.action==='close')await p.close({runBeforeUnload:false});
    else if(command.action==='click'){const size=p.viewportSize();if(!Number.isFinite(command.x)||!Number.isFinite(command.y)||command.x<0||command.y<0||command.x>size.width||command.y>size.height)throw Error('Invalid coordinates');await p.mouse.click(command.x,command.y);}
    else if(command.action==='wheel'){if(!Number.isFinite(command.x)||!Number.isFinite(command.y))throw Error('Invalid wheel');await p.mouse.wheel(Math.max(-2000,Math.min(2000,command.x)),Math.max(-2000,Math.min(2000,command.y)));}
    else if(command.action==='text'){if(typeof command.text!=='string'||command.text.length>20000)throw Error('Invalid text');await p.keyboard.insertText(command.text);}
    else if(command.action==='key'){if(typeof command.key!=='string'||command.key.length>40||!Array.isArray(command.modifiers)||command.modifiers.some(x=>!['Control','Meta','Alt','Shift'].includes(x)))throw Error('Invalid key');if(command.key.length===1&&!command.modifiers.some(x=>['Control','Meta','Alt'].includes(x)))await p.keyboard.insertText(command.key);else await p.keyboard.press([...command.modifiers,command.key===' '?'Space':command.key].join('+'));}
    else{res.writeHead(400).end();return;}
    res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({ok:true,closed:command.action==='close'}));
   }catch{res.writeHead(400).end('Invalid browser control or page no longer available');}return;
  }
  if(req.method!=='GET'){res.writeHead(405).end();return;}
  try{
   if(leaf==='frame'){const f=await frame();if(!f){res.writeHead(204).end();return;}res.writeHead(200,{'Content-Type':'image/jpeg'});res.end(f.buffer);return;}
   if(leaf==='state'){res.writeHead(200,{'Content-Type':'application/json'});res.end(safeJson({open:!!active&&!active.isClosed(),url:active?.url()??'',pageId:pageId(),source:'isolated-headless-chromium',capabilities:{close:true,reveal:true}}));return;}
   if(leaf!==''){res.writeHead(404).end();return;}
   res.setHeader('Content-Security-Policy',"default-src 'none'; img-src 'self' blob:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'");
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(require('./viewer.cjs')(u.searchParams.get('interactive')==='1'));
  }catch{res.writeHead(503).end('Страница временно недоступна');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const viewerUrl=`http://127.0.0.1:${server.address().port}/${token}/`;
 async function closeBrowser(){const b=browser;browser=undefined;context=undefined;launching=undefined;active=undefined;await b?.close();}
 return {getContext,frame,viewerUrl,closeBrowser,async close(){if(closing)return;closing=true;server.closeAllConnections();await new Promise(r=>server.close(r));await closeBrowser();},async view(){const f=await frame();return {content:[{type:'text',text:`[Открыть живую вкладку браузера внутри Harness](${viewerUrl})\nЭто изображение той же сессии, которой управляют browser_* инструменты. Покажи эту ссылку владельцу; не открывай её через системный open. Ссылка локальная, не публикуй и не сохраняй в Obsidian.`},...(f?[{type:'image',data:f.buffer.toString('base64'),mimeType:'image/jpeg'}]:[])]};}};
}
async function main(){
 const service=await createBrowserService();
 const server=await createConnection({browser:{browserName:'chromium'},imageResponses:'allow'},service.getContext);
 const closingCalls=new Set();
 const transport={async start(){const lines=readline.createInterface({input:process.stdin});lines.on('line',line=>{try{const m=JSON.parse(line);if(m.method==='tools/call'&&m.params?.name==='browser_live_view'){service.view().then(result=>this.send({jsonrpc:'2.0',id:m.id,result})).catch(e=>this.send({jsonrpc:'2.0',id:m.id,error:{code:-32603,message:e.message}}));}else {if(m.method==='tools/call'&&m.params?.name==='browser_close')closingCalls.add(m.id);this.onmessage?.(m);}}catch(e){this.onerror?.(e);}});lines.once('close',()=>{this.onclose?.();service.close().finally(()=>process.exit(0));});},async send(m){if(closingCalls.delete(m.id))await service.closeBrowser();if(m.result?.tools)m={...m,result:{...m.result,tools:[...m.result.tools,{name:'browser_live_view',description:'Return live local view and screenshot of this exact isolated browser session. Present its Markdown link to owner for the Harness sidebar. Never open in personal Chrome. No OS focus or input.',inputSchema:{type:'object',properties:{},additionalProperties:false}}]}};process.stdout.write(JSON.stringify(m)+'\n');},async close(){await service.close();}};
 await server.connect(transport);
 for(const sig of ['SIGTERM','SIGINT'])process.once(sig,()=>service.close().finally(()=>process.exit(0)));
}
module.exports={createBrowserService};if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
