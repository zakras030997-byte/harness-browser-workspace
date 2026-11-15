const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),readline=require('node:readline'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const ipc=require('./shared-ipc.cjs');const fault=code=>Object.assign(Error(code),{code});
class SharedClient{
 constructor({directory,client,nodeExecutable='node',headless=false,profileDirectory,windowMode='separate',timeoutMs=60000}={}){if(!['harness','opencode'].includes(client))throw fault('EXPLICIT_CLIENT_REQUIRED');if(!['separate','shared'].includes(windowMode))throw fault('INVALID_WINDOW_MODE');Object.assign(this,{directory,client,nodeExecutable,headless,profileDirectory,windowMode,timeoutMs});this.pending=new Map();this.closed=false;this.socket=null;}
 async connect(){if(this.closed)throw fault('SHARED_CLIENT_CLOSED');if(this.socket&&!this.socket.destroyed)return;return this.connecting??=(async()=>{
  const files=ipc.stateFiles(this.directory),token=ipc.credentials(files.auth)[this.client],settings=ipc.settingsKey(this),deadline=Date.now()+12000;let launched=false;
  while(Date.now()<deadline){try{await this.attach(files.socket,token,settings);return;}catch(e){if(!['ENOENT','ECONNREFUSED'].includes(e.code))throw e;}
   if(!launched){let lock;try{lock=fs.openSync(files.lock,'wx',0o600);fs.writeFileSync(lock,JSON.stringify({pid:process.pid}));}catch(e){if(e.code!=='EEXIST')throw e;try{const owner=ipc.privateJSON(files.lock);try{process.kill(owner.pid,0);}catch(missing){if(missing.code==='ESRCH')fs.unlinkSync(files.lock);}}catch{}}
    if(lock!==undefined){fs.closeSync(lock);try{
      if(fs.existsSync(files.socket)){let old;try{old=ipc.privateJSON(files.owner);}catch{throw fault('UNKNOWN_SHARED_SOCKET');}let dead=false;try{process.kill(old.pid,0);}catch(e){dead=e.code==='ESRCH';}if(!dead)throw fault('SHARED_SERVER_UNAVAILABLE');fs.unlinkSync(files.socket);fs.unlinkSync(files.owner);}
      const env=Object.fromEntries(['PATH','HOME','TMPDIR','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
      const child=spawn(this.nodeExecutable,[path.join(__dirname,'shared-server.cjs'),this.directory,...this.windowMode==='shared'?['--single-window']:[],...this.headless?['--headless']:[],...this.profileDirectory?['--profile-directory',this.profileDirectory]:[]],{env,stdio:'ignore',detached:true});child.on('error',()=>{});child.unref();launched=true;
      // Hold the launch lock until the server is listening, preventing races.
      const until=Date.now()+6000;while(Date.now()<until&&!fs.existsSync(files.socket))await new Promise(r=>setTimeout(r,50));
     }finally{fs.unlinkSync(files.lock);}}
   }
   await new Promise(r=>setTimeout(r,100));
  }throw fault('SHARED_START_TIMEOUT');
 })().finally(()=>{this.connecting=null;});}
 attach(socketPath,token,settings){return new Promise((resolve,reject)=>{const socket=net.createConnection(socketPath),timer=setTimeout(()=>{socket.destroy();reject(fault('SHARED_HANDSHAKE_TIMEOUT'));},3000);let ready=false;const lines=readline.createInterface({input:socket});
  socket.once('connect',()=>socket.write(JSON.stringify({type:'hello',client:this.client,token,settings})+'\n'));
  socket.on('error',e=>{if(!ready){clearTimeout(timer);reject(e);}});
  socket.on('close',()=>{clearTimeout(timer);if(!ready)reject(fault('SHARED_CONNECTION_CLOSED'));if(this.socket===socket)this.socket=null;for(const p of this.pending.values())p.reject(fault('SHARED_CONNECTION_LOST_OUTCOME_UNKNOWN'));this.pending.clear();});
  lines.on('error',()=>{});lines.on('line',line=>{let m;try{m=JSON.parse(line);}catch{socket.destroy();return;}if(!ready){clearTimeout(timer);if(m.type!=='hello'||!m.ok){socket.destroy();reject(fault(m.error??'SHARED_HANDSHAKE_REJECTED'));return;}ready=true;this.socket=socket;this.serverPid=m.pid;resolve();return;}const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.error?p.reject(Object.assign(fault(m.error),{unknown:!!m.unknown,...m.details?{details:m.details}:{}})):p.resolve(m.result);});
 });}
 async call(command,chat,args={},signal){if(signal?.aborted)throw fault('CANCELLED');await this.connect();if(this.closed||signal?.aborted)throw fault('CANCELLED');const id=crypto.randomUUID();return new Promise((resolve,reject)=>{let timer;const clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};const cancel=()=>{this.pending.delete(id);if(this.socket&&!this.socket.destroyed)this.socket.write(JSON.stringify({command:'cancel',cancelId:id})+'\n');};const abort=()=>{cancel();clean();reject(fault('CANCELLED_OUTCOME_MAY_BE_UNKNOWN'));};signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>{cancel();clean();reject(fault('SHARED_TIMEOUT_OUTCOME_UNKNOWN'));},this.timeoutMs);this.pending.set(id,{resolve:v=>{clean();resolve(v);},reject:e=>{clean();reject(e);}});const line=JSON.stringify({id,command,chat,args});if(Buffer.byteLength(line)>65536){this.pending.delete(id);clean();reject(fault('INPUT_TOO_LARGE'));return;}this.socket.write(line+'\n',error=>{if(error){this.pending.delete(id);clean();reject(fault('SHARED_WRITE_OUTCOME_UNKNOWN'));}});});}
 async close(){if(this.closed)return {released:true};this.closed=true;await this.connecting?.catch(()=>{});this.socket?.end();this.socket=null;for(const p of this.pending.values())p.reject(fault('SHARED_CLIENT_CLOSED'));this.pending.clear();return {released:true,otherClientPreserved:true};}
}
module.exports={SharedClient};
