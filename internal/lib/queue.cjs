const http=require('node:http'),crypto=require('node:crypto');
async function startQueue(){
 const pending=new Map(),windows=new Map();const token=crypto.randomBytes(24).toString('hex');let closing=false;
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const port=server.address().port,origin=req.headers.origin;
  if(req.headers.host!==`127.0.0.1:${port}`||!req.url.startsWith('/'+token+'/')){res.writeHead(404).end();return;}
  if(origin==='dsh-app://app'){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Anodhas-Browser');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');}
  if(req.method==='OPTIONS'){res.writeHead(origin==='dsh-app://app'?204:403).end();return;}
  if(origin!=='dsh-app://app'||req.method!=='POST'||req.headers['x-anodhas-browser']!=='1'||!req.headers['content-type']?.startsWith('application/json')){res.writeHead(403).end();return;}
  try {
   let raw='';for await(const b of req){raw+=b;if(raw.length>9000000)throw Error('Request too large');}const data=JSON.parse(raw),leaf=req.url.slice(token.length+2);
   if(typeof data.windowId!=='string'||data.windowId.length>100)throw Error('Window identity required');
   let result;
   if(leaf==='poll'){
    if(data.sessionId!==null&&typeof data.sessionId!=='string')throw Error('Invalid session identity');
    windows.set(data.windowId,{sessionId:data.sessionId,native:data.native===true,at:Date.now()});
    const job=[...pending.values()].find(j=>j.state==='queued'&&j.sessionId===data.sessionId&&data.native===true);
    if(job){job.state='delivered';job.windowId=data.windowId;result={job:{id:job.id,sessionId:job.sessionId,command:job.command}};}else result={job:null};
   }else if(leaf==='result'){
    const job=pending.get(data.id);
    if(!job||job.windowId!==data.windowId||job.state!=='delivered')throw Error('Unowned or expired browser result');
    pending.delete(job.id);clearTimeout(job.timer);job.state='finished';data.error?job.reject(Error(String(data.error).slice(0,500))):job.resolve(data.result);result={accepted:true};
   }else throw Error('Unknown browser route');
   res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result));
  }catch(e){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:e.message}));}
 });
 await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
 const ready=sessionId=>[...windows.values()].filter(w=>Date.now()-w.at<4000&&w.sessionId===sessionId);
 function status(sessionId){const rows=ready(sessionId);return {desktopConnected:rows.length>0,nativeControl:rows.some(x=>x.native),activeChatRequired:true};}
 function call(sessionId,command,signal){
  if(closing)return Promise.reject(Error('Browser bridge closing'));
  const s=status(sessionId);if(!s.nativeControl)return Promise.reject(Error(s.desktopConnected?'Native browser bridge is not installed or Harness needs restart':'Open this chat in Harness Desktop to use its internal browser; another chat will not be selected automatically'));
  signal?.throwIfAborted();
  return new Promise((resolve,reject)=>{const id=crypto.randomUUID(),job={id,sessionId,command,state:'queued',resolve:v=>{signal?.removeEventListener('abort',abort);resolve(v);},reject:e=>{signal?.removeEventListener('abort',abort);reject(e);}};
   const abort=()=>{pending.delete(id);clearTimeout(job.timer);job.reject(Error(job.state==='queued'?'Browser operation canceled before dispatch':'Browser operation canceled after dispatch; outcome unknown; do not repeat automatically'));};
   signal?.addEventListener('abort',abort,{once:true});job.timer=setTimeout(()=>{pending.delete(id);job.reject(Error(job.state==='queued'?'Browser client did not accept operation':'Browser reply timed out; outcome unknown; do not repeat automatically'));},25000);pending.set(id,job);
  });
 }
 return {url:`http://127.0.0.1:${server.address().port}/${token}/`,status,call,async close(){if(closing)return;closing=true;for(const j of pending.values()){clearTimeout(j.timer);j.reject(Error('Browser bridge disposed'));}pending.clear();windows.clear();server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
module.exports={startQueue};
