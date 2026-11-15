// One private, demand-started owner of the existing agent Chrome profile.
const fs=require('node:fs'),net=require('node:net'),readline=require('node:readline'),crypto=require('node:crypto');
const {createRuntime}=require('./runtime.cjs');const ipc=require('./shared-ipc.cjs');
const directory=process.argv[2],profileAt=process.argv.indexOf('--profile-directory'),options={windowMode:process.argv.includes('--single-window')?'shared':'separate',headless:process.argv.includes('--headless'),profileDirectory:profileAt>=0?process.argv[profileAt+1]:undefined};
const files=ipc.stateFiles(directory),auth=ipc.credentials(files.auth),key=ipc.settingsKey(options),nonce=crypto.randomUUID();
const runtime=createRuntime({directory,...options,separateClientWindows:options.windowMode==='separate',backgroundWindows:true});const peers=new Set(),chats=new Map(),releaseTimers=new Map();let idle,closing=false;
function output(socket,value){const line=JSON.stringify(value);if(Buffer.byteLength(line)>5*1024*1024){socket.destroy();return;}socket.write(line+'\n');}
function armIdle(){clearTimeout(idle);if(!peers.size)idle=setTimeout(()=>void shutdown(),5000);}
async function shutdown(){if(closing)return;closing=true;clearTimeout(idle);for(const timer of releaseTimers.values())clearTimeout(timer);releaseTimers.clear();for(const p of peers){for(const c of p.pending.values())c.abort();p.socket.end();}await runtime.close();await new Promise(resolve=>server.close(resolve));try{const owner=ipc.privateJSON(files.owner);if(owner.nonce===nonce){fs.unlinkSync(files.owner);if(fs.existsSync(files.socket))fs.unlinkSync(files.socket);}}catch{};}
const server=net.createServer(socket=>{clearTimeout(idle);const peer={socket,pending:new Map(),client:null};peers.add(peer);const lines=readline.createInterface({input:socket,crlfDelay:Infinity});let authTimer=setTimeout(()=>socket.destroy(),3000),bytes=0;
 lines.on('error',()=>{});lines.on('line',line=>{if(Buffer.byteLength(line)>65536){socket.destroy();return;}let m;try{m=JSON.parse(line);}catch{socket.destroy();return;}
  if(!peer.client){if(m.type!=='hello'||!['harness','opencode'].includes(m.client)||!ipc.equal(m.token,auth[m.client])){socket.destroy();return;}if(m.settings!==key){output(socket,{type:'hello',error:'SHARED_OPTIONS_CONFLICT'});socket.end();return;}clearTimeout(authTimer);peer.client=m.client;clearTimeout(releaseTimers.get(peer.client));releaseTimers.delete(peer.client);output(socket,{type:'hello',ok:true,pid:process.pid,sharedBrowser:true});return;}
  if(m.command==='cancel'){peer.pending.get(m.cancelId)?.abort();return;}if(closing||typeof m.id!=='string'||m.id.length>80||peer.pending.has(m.id)||peer.pending.size>=8){output(socket,{id:m.id,error:'SHARED_REQUEST_REJECTED'});return;}
  let scoped;try{scoped=ipc.scope(peer.client,m.chat);}catch{output(socket,{id:m.id,error:'HOST_SCOPE_REQUIRED'});return;}
  chats.set(scoped,peer.client);const c=new AbortController();peer.pending.set(m.id,c);
  void runtime.execute(m.command,scoped,m.args??{},c.signal).then(result=>{if(c.signal.aborted)throw Object.assign(Error('CANCELLED'),{code:'CANCELLED'});output(socket,{id:m.id,result});}).catch(e=>output(socket,{id:m.id,error:e.code??'OPERATION_FAILED',...e.details?{details:e.details}:{},unknown:!!e.unknown||/UNKNOWN|timeout|timed out|disconnected/i.test(e.message)})).finally(()=>peer.pending.delete(m.id));
 });
 socket.on('error',()=>{});socket.on('close',()=>{clearTimeout(authTimer);peers.delete(peer);for(const c of peer.pending.values())c.abort();if(peer.client&&![...peers].some(p=>p.client===peer.client)){const client=peer.client;releaseTimers.set(client,setTimeout(()=>{releaseTimers.delete(client);if(closing||[...peers].some(p=>p.client===client))return;for(const [chat,owner]of chats)if(owner===client){void runtime.releaseChat(chat).catch(()=>{});chats.delete(chat);}},2000));}armIdle();});
});
server.on('error',()=>{void runtime.close().finally(()=>{process.exitCode=1;});});
server.listen(files.socket,()=>{fs.chmodSync(files.socket,0o600);fs.writeFileSync(files.owner,JSON.stringify({version:1,pid:process.pid,nonce,settings:key}),{mode:0o600});armIdle();});
process.once('SIGTERM',()=>void shutdown());process.once('SIGINT',()=>void shutdown());
