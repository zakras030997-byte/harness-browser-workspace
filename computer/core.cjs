const crypto=require('node:crypto'),schemas=require('./schemas.json'),{value}=require('./transport.cjs');
const actions=new Set(Object.keys(schemas));
class Windows {
 constructor(driver){this.driver=driver;this.owners=new Map();this.windows=new Map();this.busy=new Set();this.sessions=new Map();}
 async call(tool,args){return this.driver.call(tool,args);}
 session(owner,preview=false){let id=this.sessions.get(owner);if(!id){id='anodhas-'+crypto.createHash('sha256').update(owner).digest('hex').slice(0,12)+'-'+crypto.randomBytes(6).toString('hex');this.sessions.set(owner,id);}return id+(preview?'-preview':'');}
 async bind(owner,pid,window_id){if(!Number.isSafeInteger(pid)||pid<=0||!Number.isSafeInteger(window_id)||window_id<=0)throw Error('Positive exact pid/window_id required');const key=pid+':'+window_id,held=this.windows.get(key);if(held&&held!==owner)throw Error('Window is leased to another Harness chat');if(this.owners.has(owner))throw Error('Release the current window first');const result=value(await this.call('list_windows',{pid,on_screen_only:false,session:this.session(owner)}));if(!result.windows?.some(w=>w.window_id===window_id))throw Error('Exact window not found');const lease={pid,window_id,key};this.owners.set(owner,lease);this.windows.set(key,owner);return lease;}
 lease(owner){const l=this.owners.get(owner);if(!l)throw Error('Bind one exact window first');return l;}
 async run(owner,tool,args={}){const l=this.lease(owner);if(this.busy.has(owner))throw Error('A window operation is already in progress');this.busy.add(owner);try{
 const session=this.session(owner);
 if(tool==='state')return this.call('get_window_state',{pid:l.pid,window_id:l.window_id,session,include_accessibility_tree:true,include_screenshot:true,max_elements:250,max_dimension:1400});
 if(!actions.has(tool))throw Error('Only background window actions are exposed');const schema=schemas[tool];for(const k of Object.keys(args))if(!Object.hasOwn(schema.properties,k))throw Error('Unsupported argument: '+k);for(const k of schema.required??[])if(args[k]===undefined)throw Error('Required: '+k);
 // Fixed target, session and delivery are host-owned. Never accept escalation to desktop/foreground.
 const windows=value(await this.call('list_windows',{pid:l.pid,on_screen_only:false,session}));if(!windows.windows?.some(w=>w.window_id===l.window_id))throw Error('Bound window disappeared; release and bind again');
 const input={...args,pid:l.pid,window_id:l.window_id,session};if(tool!=='set_value'){input.delivery_mode='background';delete input.pid;delete input.window_id;input.target={kind:'window',pid:l.pid,window_id:l.window_id};}
 if(tool==='move_cursor'){delete input.pid;delete input.window_id;}
 const result=await this.call(tool,input);value(result);return result;
 }finally{this.busy.delete(owner);}}
 async frame(owner){const l=this.lease(owner);const result=await this.call('get_window_state',{pid:l.pid,window_id:l.window_id,session:this.session(owner,true),include_accessibility_tree:false,include_screenshot:true,max_dimension:1100,screenshot_format:'jpeg',screenshot_quality:65});value(result);const image=result.content?.find(b=>b.type==='image');if(!image)throw Error('No window frame; check Screen Recording permission and app support');return image;}
 async release(owner){if(this.busy.has(owner))throw Error('Wait for the admitted window action before releasing');const l=this.owners.get(owner),session=this.sessions.get(owner);if(l){this.owners.delete(owner);this.windows.delete(l.key);}if(session){this.sessions.delete(owner);for(const suffix of ['', '-preview'])try{await this.call('end_session',{session:session+suffix});}catch{}}return {released:true,applicationClosed:false};}
}
module.exports={Windows,actions};
