// Operates only on an already authenticated sidebar guest supplied by the carrier.
// No process-wide enumeration, external browser connection, or Node in page worlds.
export function createBrowserControl() {
 const tails=new WeakMap();
 function site(guest,url=guest.getURL()) {const current=new URL(guest.getURL()),target=new URL(url);if(!['http:','https:'].includes(current.protocol)||target.origin!==current.origin||target.username||target.password)throw Error('Cookies are limited to the current guest site');return target.href;}
 async function execute(guest,command) {
  if(!guest||guest.isDestroyed())throw Error('Browser guest is closed');
  if(!command||typeof command!=='object'||Array.isArray(command))throw Error('Invalid browser command');
  const c=command;
  switch(c.action){
   case 'state':return {url:guest.getURL(),title:guest.getTitle(),loading:guest.isLoading(),canGoBack:guest.navigationHistory?.canGoBack()??guest.canGoBack(),canGoForward:guest.navigationHistory?.canGoForward()??guest.canGoForward(),webContentsId:guest.id};
   case 'navigate':{const u=new URL(c.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Only HTTP(S) browser pages');await guest.loadURL(u.href);return execute(guest,{action:'state'});}
   case 'reload':guest.reload();return {requested:true};
   case 'back':if(guest.navigationHistory?.canGoBack())guest.navigationHistory.goBack();return {requested:true};
   case 'forward':if(guest.navigationHistory?.canGoForward())guest.navigationHistory.goForward();return {requested:true};
   case 'evaluate':if(typeof c.script!=='string'||c.script.length>100000)throw Error('Invalid page script');return guest.executeJavaScript(c.script,false);
   case 'text':if(typeof c.text!=='string'||c.text.length>100000)throw Error('Invalid text');await guest.insertText(c.text);return {inserted:true};
   case 'mouse':{const size=await guest.executeJavaScript('({width:innerWidth,height:innerHeight})');if(!['mouseMove','mouseDown','mouseUp','mouseWheel'].includes(c.type)||!Number.isFinite(c.x)||!Number.isFinite(c.y)||c.x<0||c.y<0||c.x>=size.width||c.y>=size.height)throw Error('Mouse position outside this page');const e={type:c.type,x:Math.round(c.x),y:Math.round(c.y),modifiers:Array.isArray(c.modifiers)?c.modifiers:[]};if(c.type==='mouseDown'||c.type==='mouseUp'){if(!['left','right','middle'].includes(c.button??'left'))throw Error('Invalid mouse button');e.button=c.button??'left';e.clickCount=c.clickCount===2?2:1;}if(c.type==='mouseWheel'){if(!Number.isFinite(c.deltaX??0)||!Number.isFinite(c.deltaY))throw Error('Invalid wheel delta');e.deltaX=Math.max(-3000,Math.min(3000,c.deltaX??0));e.deltaY=Math.max(-3000,Math.min(3000,c.deltaY));e.canScroll=true;}guest.sendInputEvent(e);return {sent:true};}
   case 'key':{if(typeof c.key!=='string'||c.key.length>40||!Array.isArray(c.modifiers??[])||(c.modifiers??[]).some(m=>!['shift','control','alt','meta'].includes(m)))throw Error('Invalid key');guest.sendInputEvent({type:'keyDown',keyCode:c.key,modifiers:c.modifiers??[]});guest.sendInputEvent({type:'keyUp',keyCode:c.key,modifiers:c.modifiers??[]});return {sent:true};}
   case 'screenshot':{const image=await guest.capturePage();const data=image.toJPEG(80);if(data.length>6000000)throw Error('Screenshot too large');return {mimeType:'image/jpeg',data:data.toString('base64')};}
   case 'cookies_get':{const cookies=await guest.session.cookies.get({url:site(guest,c.url)});const selected=c.name?cookies.filter(x=>x.name===c.name):cookies;return {cookies:selected.map(x=>c.includeValues===true?x:({...x,value:undefined})),valuesIncluded:c.includeValues===true};}
   case 'cookies_set':{const url=site(guest,c.url);if(typeof c.name!=='string'||!c.name||typeof c.value!=='string')throw Error('Cookie name and value required');const cookie={url,name:c.name,value:c.value,path:c.path??'/',httpOnly:c.httpOnly===true,secure:new URL(url).protocol==='https:'};if(c.sameSite!==undefined){if(!['unspecified','no_restriction','lax','strict'].includes(c.sameSite))throw Error('Invalid SameSite');cookie.sameSite=c.sameSite;}if(c.expirationDate!==undefined){if(!Number.isFinite(c.expirationDate))throw Error('Invalid cookie expiration');cookie.expirationDate=c.expirationDate;}await guest.session.cookies.set(cookie);return {set:true,name:c.name};}
   case 'cookies_remove':if(typeof c.name!=='string'||!c.name)throw Error('Cookie name required');await guest.session.cookies.remove(site(guest,c.url),c.name);return {removed:true,name:c.name};
   default:throw Error('Unsupported browser operation');
  }
 }
 return {execute(guest,c){const pending=(tails.get(guest)??Promise.resolve()).then(()=>execute(guest,c));tails.set(guest,pending.catch(()=>{}));return pending;}};
}
