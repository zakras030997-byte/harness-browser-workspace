window.__ModuleLoader__.load({id:'@anodhas/dsh-internal-browser',factory:()=>{
 const exports={inject:['uiSession','sidebarRight']};
 exports.apply=function(ctx){
  const bridge=globalThis.dshDesktop?.browser,config=globalThis.__ANODHAS_INTERNAL_BROWSER__,windowId=crypto.randomUUID(),activeTabs=new Map();let disposed=false;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const current=()=>ctx.uiSession.adapter.current.getSnapshot().key??null;
  const rows=sessionId=>ctx.sidebarRight.openTabs.getSnapshot().filter(r=>r.kind==='browser'&&r.sessionId===sessionId);
  function element(sessionId,tabId){return [...document.querySelectorAll('webview[data-sidebar-browser-frame]')].find(e=>e.closest('[data-sidebar-right-tab]')?.getAttribute('data-sidebar-right-tab')===tabId&&e.closest('[data-sidebar-right-session]')?.getAttribute('data-sidebar-right-session')===sessionId);}
  function target(sessionId,id){const all=rows(sessionId);const row=all.find(r=>r.tabId===(id??activeTabs.get(sessionId)))??(id?undefined:all.at(-1));if(!row)throw Error('No matching internal browser tab in this chat');return row;}
  async function guest(sessionId,id){const row=target(sessionId,id);const end=Date.now()+12000;while(Date.now()<end&&!disposed){if(current()!==sessionId)throw Error('Selected chat changed; browser operation stopped');if(!rows(sessionId).some(r=>r.tabId===row.tabId))throw Error('Native browser tab closed');const el=element(sessionId,row.tabId);if(el){try{if(el.getWebContentsId()>0&&el.getAttribute('name')){await bridge.control(el.getAttribute('name'),{action:'state'});return {row,el};}}catch{}}await sleep(40);}throw Error('Native webview is not attached; use internal_browser_select with restore=true for this saved tab');}
  async function call(sessionId,tabId,command){const {row,el}=await guest(sessionId,tabId);const result=await bridge.control(el.getAttribute('name'),command);activeTabs.set(sessionId,row.tabId);return result;}
  async function evaluate(sessionId,tabId,script){return call(sessionId,tabId,{action:'evaluate',script});}
  function refScript(ref,operation){return `(()=>{const s=globalThis.__anodhasBrowserRefs;if(!s||s.id!==${JSON.stringify(String(ref).split(':')[0])})throw Error('Stale element ref; take a new snapshot');const e=s.items[${JSON.stringify(Number(String(ref).split(':')[1]))}];if(!e||!e.isConnected)throw Error('Element is detached');${operation}})()`;}
  async function execute(sessionId,c){
   if(current()!==sessionId)throw Error('Open this chat in Harness Desktop; another chat will not be selected automatically');
   if(bridge?.controlVersion!==1||typeof bridge.control!=='function')throw Error('Native browser control bridge is not loaded; install the carrier addon and restart Harness when idle');
   if(c.action==='tabs')return {tabs:await Promise.all(rows(sessionId).map(async r=>{try{return {tab_id:r.tabId,...await call(sessionId,r.tabId,{action:'state'})};}catch(e){return {tab_id:r.tabId,attached:false,error:e.message};}}))};
   if(c.action==='new_tab'){
    const u=new URL(c.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Only HTTP(S) addresses');
    const before=new Set(rows(sessionId).map(r=>r.tabId));ctx.sidebarRight.openTab('browser',{params:{url:u.href},revealIfOpened:false});
    const end=Date.now()+12000;let row;while(Date.now()<end){if(current()!==sessionId)throw Error('Selected chat changed; tab creation outcome must be checked before retry');row=rows(sessionId).find(r=>!before.has(r.tabId));if(row)break;await sleep(40);}if(!row)throw Error('New tab was not confirmed; list tabs before retry');activeTabs.set(sessionId,row.tabId);const {el}=await guest(sessionId,row.tabId);while(Date.now()<end){try{const state=await bridge.control(el.getAttribute('name'),{action:'state'});if(state.url!=='about:blank'&&!state.url.startsWith('about:blank#')&&!state.loading)return {tab_id:row.tabId,...state};}catch{}await sleep(40);}return {tab_id:row.tabId,loading:true};
   }
   const row=target(sessionId,c.tabId);
   if(c.action==='select'){
    const title=[...document.querySelectorAll('[data-sidebar-right-tab]')].find(e=>e.getAttribute('data-sidebar-right-tab')===row.tabId&&e.closest('[role="tab"]'));
    const button=title?.closest('[role="tab"]');if(!button)throw Error('Native tab header is not mounted in this chat');
    button.click();for(let i=0;i<50;i++){if(current()!==sessionId)throw Error('Selected chat changed');if((typeof ctx.sidebarRight.active==='function'&&ctx.sidebarRight.active()?.id===row.tabId)||[...document.querySelectorAll('[data-sidebar-right-tab]')].some(e=>e.getAttribute('data-sidebar-right-tab')===row.tabId&&e.closest('[role="tab"]')?.getAttribute('aria-selected')==='true')){
      activeTabs.set(sessionId,row.tabId);
      if(c.restore===true&&!element(sessionId,row.tabId)){
       const body=[...document.querySelectorAll('[data-sidebar-right-tab]')].find(e=>e.getAttribute('data-sidebar-right-tab')===row.tabId&&!e.closest('[role="tab"]')&&e.querySelector('[class*="_restore"] button'));
       let restore=body?.querySelector('[class*="_restore"] button');
       for(let j=0;j<50&&!restore&&!element(sessionId,row.tabId);j++){await sleep(40);const body=[...document.querySelectorAll('[data-sidebar-right-tab]')].find(e=>e.getAttribute('data-sidebar-right-tab')===row.tabId&&!e.closest('[role="tab"]')&&e.querySelector('[class*="_restore"] button'));restore=body?.querySelector('[class*="_restore"] button');}
       if(restore)restore.click();else if(!element(sessionId,row.tabId))throw Error('Saved Browser page has no restore action');await guest(sessionId,row.tabId);
      }
      return {selected:true,tab_id:row.tabId};
     }await sleep(40);}throw Error('Native tab selection was not confirmed');
   }
   if(c.action==='close'){ctx.sidebarRight.close(row.tabId);for(let i=0;i<50;i++){if(!rows(sessionId).some(r=>r.tabId===row.tabId)){activeTabs.delete(sessionId);return {closed:true,tab_id:row.tabId};}await sleep(40);}throw Error('Native tab close not confirmed; do not repeat automatically');}
   if(c.action==='snapshot')return evaluate(sessionId,row.tabId,`(()=>{const id=Math.random().toString(36).slice(2),items=[...document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0}).slice(0,300);globalThis.__anodhasBrowserRefs={id,items};return {url:location.href,title:document.title,text:(document.body?.innerText??'').slice(0,24000),elements:items.map((e,i)=>({ref:id+':'+i,tag:e.tagName,type:e.type??'',label:(e.getAttribute('aria-label')||e.innerText||e.getAttribute('placeholder')||e.name||'').slice(0,160)}))};})()`);
   if(c.action==='click'){
    const point=await evaluate(sessionId,row.tabId,refScript(c.ref,"e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};"));
    await call(sessionId,row.tabId,{action:'mouse',type:'mouseMove',...point});await call(sessionId,row.tabId,{action:'mouse',type:'mouseDown',button:c.button??'left',...point});await call(sessionId,row.tabId,{action:'mouse',type:'mouseUp',button:c.button??'left',...point});return {clicked:true};
   }
   if(c.action==='fill'){
    await evaluate(sessionId,row.tabId,refScript(c.ref,"e.scrollIntoView({block:'center'});e.focus();if(e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement){e.select();}else if(e.isContentEditable){const r=document.createRange();r.selectNodeContents(e);const s=getSelection();s.removeAllRanges();s.addRange(r);}else throw Error('Element is not editable');return true;"));
    if(c.text==='')return evaluate(sessionId,row.tabId,refScript(c.ref,"if('value' in e)e.value='';else e.textContent='';e.dispatchEvent(new Event('input',{bubbles:true}));return {filled:true};"));
    await call(sessionId,row.tabId,{action:'text',text:c.text});return {filled:true};
   }
   if(c.action==='mouse_click'){await call(sessionId,row.tabId,{...c,action:'mouse',type:'mouseDown'});await call(sessionId,row.tabId,{...c,action:'mouse',type:'mouseUp'});return {clicked:true};}
   return call(sessionId,row.tabId,c);
  }
  async function post(action,body){const r=await fetch(config.url+action,{method:'POST',headers:{'Content-Type':'application/json','X-Anodhas-Browser':'1'},body:JSON.stringify({windowId,...body})});if(!r.ok)throw Error('Internal browser transport rejected request');return r.json();}
  async function loop(){while(!disposed){try{const {job}=await post('poll',{sessionId:current(),native:bridge?.controlVersion===1});if(job){let reply;try{reply={result:await execute(job.sessionId,job.command)};}catch(e){reply={error:e.message};}if(!disposed)await post('result',{id:job.id,...reply});}}catch{}await sleep(250);}}
  ctx.effect(()=>{if(config?.url)void loop();return ()=>{disposed=true;activeTabs.clear();};},'anodhas-internal-browser-client');
 };
 return exports;
}});
