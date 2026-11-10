const http=require('http'),crypto=require('crypto');const viewer=require('../package/viewer.cjs');
async function startPreview(client,activeTab=()=>undefined,onClosed=()=>{}){
 const token=crypto.randomBytes(24).toString('hex');let base,closing;
 async function pages(){const rows=await client.call('list');return Promise.all(rows.map(async r=>{try{const state=await client.call('state',{tabId:r.tabId});return {...state,previewUrl:base+'tab/'+r.tabId+'/'}}catch{return null}})).then(a=>a.filter(Boolean));}
 const s=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');const origin='http://127.0.0.1:'+s.address().port;
  if(req.headers.host!==new URL(origin).host){res.writeHead(403).end();return;}const u=new URL(req.url,origin);if(!u.pathname.startsWith('/'+token+'/')){res.writeHead(404).end();return;}
  const segments=u.pathname.slice(token.length+2).split('/');let pinned;
  if(segments[0]==='tab'){if(!/^\d+$/.test(segments[1]??'')){res.writeHead(404).end();return;}pinned=Number(segments[1]);segments.splice(0,2);}
  const leaf=segments.join('/'),allowed=['dsh-app://app',origin].includes(req.headers.origin);
  if(allowed){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Anodhas-Viewer');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS')}
  if(req.method==='OPTIONS'){res.writeHead(allowed?204:403).end();return;}
  try{
   if(req.method==='GET'&&leaf==='tabs'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({source:'chrome',tabs:await pages()}));return;}
   let tabId=pinned??activeTab();if(!tabId){const owned=await client.call('list');tabId=owned[0]?.tabId;}
   if(req.method==='POST'&&leaf==='control'){
    if(!allowed||req.headers['x-anodhas-viewer']!=='1'||!req.headers['content-type']?.startsWith('application/json')){res.writeHead(403).end();return;}
    let raw='';for await(const b of req){raw+=b;if(raw.length>30000)throw Error('Too large')}const p=JSON.parse(raw);
    if(p.pageId!==String(tabId)){res.writeHead(409).end();return;}const methods={close:'close',reveal:'reveal',click:'pointer',key:'key',text:'text',wheel:'wheel'};
    if(!methods[p.action]){res.writeHead(400).end();return;}const result=await client.call(methods[p.action],{...p,tabId,userGesture:p.action==='reveal'});if(p.action==='close')onClosed(tabId);res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result));return;
   }
   if(req.method!=='GET'){res.writeHead(405).end();return;}
   if(leaf==='state'){const state=tabId?await client.call('state',{tabId}):{open:false,source:'chrome',capabilities:{close:true,reveal:true},pageId:null};res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(state));return;}
   if(leaf==='frame'){if(!tabId){res.writeHead(204).end();return;}const f=await client.call('frame',{tabId});res.writeHead(200,{'Content-Type':'image/jpeg'}).end(Buffer.from(f.data,'base64'));return;}
   if(leaf!==''){res.writeHead(404).end();return;}
   res.setHeader('Content-Security-Policy',"default-src 'none'; img-src 'self' blob:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'");res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(viewer(false));
  }catch{res.writeHead(409).end('Browser tab unavailable; no retry performed');}
 });
 await new Promise((r,j)=>{s.once('error',j);s.listen(0,'127.0.0.1',r)});base=`http://127.0.0.1:${s.address().port}/${token}/`;
 return {url:base,pages,close(){return closing??=Promise.resolve().then(async()=>{s.closeAllConnections();await new Promise(r=>s.close(r))})}};
}
module.exports={startPreview};
