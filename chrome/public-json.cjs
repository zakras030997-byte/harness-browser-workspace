const https=require('node:https'),dns=require('node:dns/promises');
const {publicURL,publicAddress}=require('./discovery-policy.cjs');
async function publicJSON(value,{signal}={}){
 const u=publicURL(value),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
 if(signal?.aborted)controller.abort();
 try{
  controller.signal.throwIfAborted();
  let cancelLookup;
  const cancelled=new Promise((_,reject)=>{cancelLookup=()=>reject(Error('Public DNS lookup cancelled'));controller.signal.addEventListener('abort',cancelLookup,{once:true});});
  let addresses;
  try{addresses=await Promise.race([dns.lookup(u.hostname,{all:true}),cancelled]);}
  finally{controller.signal.removeEventListener('abort',cancelLookup);}
  controller.signal.throwIfAborted();
  if(!addresses.length||addresses.some(x=>!publicAddress(x.address)))throw Error('Private/non-public DNS target denied');
  // Pin the vetted addresses for this request; no DNS re-resolution or redirects.
  return await new Promise((resolve,reject)=>{
   const req=https.request(u,{method:'GET',signal:controller.signal,agent:false,
    headers:{Accept:'application/json','User-Agent':'Harness-Use-Observed-Read/0.1'},
    lookup(host,opts,cb){if(host!==u.hostname)return cb(Error('Unexpected lookup host'));if(opts?.all)cb(null,addresses);else cb(null,addresses[0].address,addresses[0].family);}
   },res=>{
    if(res.statusCode!==200||!/^application\/(?:[^;]+\+)?json(?:;|$)/i.test(res.headers['content-type']||'')){res.resume();return reject(Error('Observed public read returned HTTP '+res.statusCode+' or non-JSON; no retry/redirect'));}
    let bytes=0;const chunks=[];
    res.on('data',b=>{bytes+=b.length;if(bytes>524288){res.destroy(Error('JSON exceeds 512 KiB'));return;}chunks.push(b)});
    res.on('error',reject);res.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch(e){reject(e)}});
   });req.on('error',reject);req.end();
  });
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
module.exports={publicJSON};
