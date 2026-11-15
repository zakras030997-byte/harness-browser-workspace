import {makeYoutubePrivate} from './youtube-private.js';
import {makeSessionConsole} from './session-console.js';
import {makeDiscoveryRecorder} from './discovery-recorder.js';
import {makeReadRecorder} from './read-recorder.js';
export const palette={purple:'#a78bfa',blue:'#60a5fa',cyan:'#22d3ee',green:'#4ade80',orange:'#fb923c',pink:'#f472b6',yellow:'#facc15',red:'#f87171',grey:'#a1a1aa'};
export function makeController(chrome){
 const records=new Map(),attached=new Set(),paused=new Set(),queues=new Map(),colorReservations=new Map();let ready=chrome.storage.session.get('owned').then(x=>{for(const r of x.owned??[])records.set(r.tabId,r)});
 const save=()=>chrome.storage.session.set({owned:[...records.values()]});
 async function send(tabId,method,params={}){if(paused.has(tabId))throw Error('Debugger stopped by owner; explicit reconnect required');if(!attached.has(tabId)){await chrome.debugger.attach({tabId},'1.3');attached.add(tabId);}return chrome.debugger.sendCommand({tabId},method,params);}
 const youtubePrivate=makeYoutubePrivate(chrome,send,(session,id)=>owned(session,id).then(()=>true).catch(()=>false));
 const sessionConsole=makeSessionConsole(chrome,send,id=>records.has(id));
 const readRecorder=makeReadRecorder(chrome,send);
 const discoveryRecorder=makeDiscoveryRecorder(chrome,send);
 async function owned(session,tabId){await ready;const r=records.get(tabId);if(!r||r.session!==session)throw Error('Tab is not owned by this chat');const tab=await chrome.tabs.get(tabId);if(tab.groupId!==r.groupId)throw Error('Tab removed from agent group; control revoked');return {r,tab};}
 const outline=color=>`(()=>{if(window!==top)return;const draw=()=>{let e=document.getElementById('__anodhas_agent_outline');if(!e){e=document.createElement('div');e.id='__anodhas_agent_outline';e.setAttribute('aria-hidden','true');document.documentElement.append(e)}e.style.cssText='position:fixed;inset:0;border:1px solid ${color};pointer-events:none;z-index:2147483647;box-sizing:border-box;opacity:.65'};if(document.documentElement)draw();else document.addEventListener('DOMContentLoaded',draw,{once:true})})()`;
 async function mark(r){await send(r.tabId,'Page.addScriptToEvaluateOnNewDocument',{source:outline(palette[r.color])});await send(r.tabId,'Runtime.evaluate',{expression:outline(palette[r.color])});}
 async function evaluate(tabId,expression){const v=await send(tabId,'Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(v.exceptionDetails)throw Error('Page evaluation failed');return v.result?.value;}
 async function waitLoad(id){const end=Date.now()+20000;while(Date.now()<end){const t=await chrome.tabs.get(id);if(t.status==='complete')return;await new Promise(r=>setTimeout(r,200));}throw Error('Tab navigation timeout');}
 function url(value){const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Only HTTP(S) without embedded credentials');return u.href;}
 async function dispatch(session,method,p={}){await ready;if(typeof session!=='string'||session.length>200)throw Error('Invalid chat identity');
  if(method==='create'){const previous=queues.get(session)??Promise.resolve();const task=previous.catch(()=>{}).then(()=>dispatch(session,'create-owned',p));queues.set(session,task);try{return await task}finally{if(queues.get(session)===task){queues.delete(session);if(![...records.values()].some(r=>r.session===session))colorReservations.delete(session)}}}
  if(method==='create-owned'){const existing=[...records.values()].find(r=>r.session===session&&Number.isInteger(r.windowId));const used=new Set([...records.values()].map(r=>r.color).concat([...colorReservations.values()])),color=existing?.color??colorReservations.get(session)??[...records.values()].find(r=>r.session===session)?.color??Object.keys(palette).find(c=>!used.has(c))??Object.keys(palette)[colorReservations.size%Object.keys(palette).length];colorReservations.set(session,color);let t;if(existing){const previous=await chrome.tabs.get(existing.tabId);t=await chrome.tabs.create({windowId:previous.windowId,url:'about:blank',active:false})}else{const window=await chrome.windows.create({url:'about:blank',focused:false,type:'normal'});t=window.tabs?.[0];if(!t){const tabs=await chrome.tabs.query({windowId:window.id});t=tabs[0]}if(!t)throw Error('Owned Chrome window has no initial tab')}let groupId;try{groupId=await chrome.tabs.group({...existing?{groupId:existing.groupId}:{createProperties:{windowId:t.windowId}},tabIds:[t.id]});await chrome.tabGroups.update(groupId,{title:'🤖',color,collapsed:false});const r={session,tabId:t.id,windowId:t.windowId,groupId,color,label:String(p.label??session).slice(0,120)};records.set(t.id,r);await save();await mark(r);await chrome.tabs.update(t.id,{url:url(p.url)});await waitLoad(t.id);await mark(r);return {tabId:t.id,groupId,color,colorHex:palette[color]};}catch(e){records.delete(t.id);await save();await chrome.tabs.remove(t.id);throw e;}}
  if(method==='list')return [...records.values()].filter(r=>r.session===session).map(r=>({tabId:r.tabId,windowId:r.windowId,groupId:r.groupId,color:r.color,label:r.label}));
  if(method==='youtube_private_replay')return youtubePrivate.replay(session,p.operationId);
  if(method==='youtube_private_saved')return youtubePrivate.list(session);
  if(method==='youtube_private_stats')return youtubePrivate.stats();
  const {r,tab}=await owned(session,p.tabId),id=tab.id;
  if(method==='youtube_private_start')return youtubePrivate.start(id,tab.url);
  if(method==='youtube_private_discover')return youtubePrivate.discover(session,id);
  if(method==='session_status')return sessionConsole.status(id);
  if(method==='session_read')return sessionConsole.read(id,tab.url,p);
  if(method==='console_eval')return sessionConsole.console(id,p.expression);
  if(method==='console_logs')return sessionConsole.logs(id);
  if(method==='api_discovery_start')return discoveryRecorder.start(id,tab.url,p);
  if(method==='api_discovery_mark')return discoveryRecorder.mark(id,p);
  if(method==='api_discovery_stop')return discoveryRecorder.stop(id);
  if(method==='api_record_start')return readRecorder.start(id,tab.url,p);
  if(method==='api_record_stop')return readRecorder.stop(id);
  if(method==='state')return {open:true,pageId:String(id),url:tab.url,title:tab.title,source:'chrome',color:r.color,colorHex:palette[r.color],threadLabel:r.label,capabilities:{close:true,reveal:true}};
  if(method==='navigate'){await chrome.tabs.update(id,{url:url(p.url)});await waitLoad(id);await mark(r);return {url:(await chrome.tabs.get(id)).url};}
  if(method==='reveal'){if(p.userGesture!==true)throw Error('Reveal requires owner gesture');await chrome.tabs.update(id,{active:true});await chrome.windows.update(tab.windowId,{focused:true});return {revealed:true};}
  if(method==='close'){if(attached.has(id)){await chrome.debugger.detach({tabId:id}).catch(()=>{});attached.delete(id)}await chrome.tabs.remove(id);records.delete(id);await save();return {closed:true};}
  if(method==='frame'){const v=await send(id,'Page.captureScreenshot',{format:'jpeg',quality:50});if(v.data.length>900000)throw Error('Screenshot exceeds native messaging limit');return {data:v.data,mimeType:'image/jpeg'};}
  if(method==='snapshot')return evaluate(id,`(()=>{let n=0;const nodes=[...document.querySelectorAll('a,button,input,textarea,select,[role="button"]')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height).slice(0,250);return {url:location.href,title:document.title,text:document.body.innerText.slice(0,16000),elements:nodes.map(e=>{const ref='agent-'+(++n);e.setAttribute('data-anodhas-ref',ref);return {ref,tag:e.tagName,name:(e.getAttribute('aria-label')||e.innerText||e.getAttribute('placeholder')||'').slice(0,200),type:e.type}})}})()`);
  if(method==='click'||method==='type'||method==='fill'){
   if(typeof p.ref!=='string'||!/^agent-\d+$/.test(p.ref))throw Error('Snapshot ref required');
   if((method==='type'||method==='fill')&&(typeof p.text!=='string'||p.text.length>20000))throw Error('Invalid text');
   return evaluate(id,`(()=>{const e=document.querySelector('[data-anodhas-ref='+${JSON.stringify(p.ref)}+']');if(!e||!e.getBoundingClientRect().width||!e.getBoundingClientRect().height)throw Error('Stale or hidden ref');if(e.disabled||e.getAttribute('aria-disabled')==='true')throw Error('Element disabled');e.scrollIntoView({block:'center'});${method==='click'?'e.click();':`e.focus({preventScroll:true});const text=${JSON.stringify(p.text)};if(e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement){const start=e.selectionStart??e.value.length,end=e.selectionEnd??start;const proto=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${method==='fill'?'text':'e.value.slice(0,start)+text+e.value.slice(end)'});try{e.setSelectionRange(${method==='fill'?'text.length':'start+text.length'},${method==='fill'?'text.length':'start+text.length'})}catch{}e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));e.dispatchEvent(new Event('change',{bubbles:true}));}else if(e.isContentEditable){if(!document.execCommand('insertText',false,text))throw Error('Editor insert unsupported');}else throw Error('Ref is not editable');`}return {ok:true,interaction:'background-dom',nativeInput:false}})()`);
  }
  if(method==='pointer'){if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0)throw Error('Invalid coordinates');for(const type of ['mousePressed','mouseReleased'])await send(id,'Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',clickCount:1});return {ok:true};}
  if(method==='text'){if(typeof p.text!=='string'||p.text.length>20000)throw Error('Invalid text');await send(id,'Input.insertText',{text:p.text});return {ok:true};}
  if(method==='wheel'){if(!Number.isFinite(p.x)||!Number.isFinite(p.y))throw Error('Invalid wheel');await send(id,'Input.dispatchMouseEvent',{type:'mouseWheel',x:1,y:1,deltaX:Math.max(-2000,Math.min(2000,p.x)),deltaY:Math.max(-2000,Math.min(2000,p.y))});return {ok:true};}
  if(method==='key'){if(typeof p.key!=='string'||p.key.length>40||!Array.isArray(p.modifiers)||p.modifiers.some(v=>!['Control','Meta','Alt','Shift'].includes(v)))throw Error('Invalid key');const mods=p.modifiers.reduce((m,k)=>m|({Alt:1,Control:2,Meta:4,Shift:8}[k]),0);if(p.key.length===1&&!mods)return dispatch(session,'text',{tabId:id,text:p.key});const codes={Enter:13,Tab:9,Backspace:8,Escape:27,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Delete:46,Home:36,End:35};const code=codes[p.key]??(p.key.length===1?p.key.toUpperCase().charCodeAt(0):0);if(!code)throw Error('Unsupported key');for(const type of ['keyDown','keyUp'])await send(id,'Input.dispatchKeyEvent',{type,key:p.key,modifiers:mods,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code});return {ok:true};}
  throw Error('Unsupported operation');
 }
 chrome.tabs.onRemoved.addListener(id=>{youtubePrivate.forget(id);readRecorder.forget(id);discoveryRecorder.forget(id);sessionConsole.forget(id);const previous=records.get(id);records.delete(id);if(previous&&!queues.has(previous.session)&&![...records.values()].some(r=>r.session===previous.session))colorReservations.delete(previous.session);attached.delete(id);paused.delete(id);save()});
 chrome.debugger.onDetach.addListener(({tabId},reason)=>{youtubePrivate.forget(tabId);readRecorder.forget(tabId);discoveryRecorder.forget(tabId);sessionConsole.forget(tabId);attached.delete(tabId);if(reason==='canceled_by_user')paused.add(tabId)});
 return {dispatch,summary:async()=>{await ready;return [...records.values()].map(r=>({label:r.label,color:r.color,groupId:r.groupId,tabId:r.tabId}))},resume(){paused.clear()}};
}
