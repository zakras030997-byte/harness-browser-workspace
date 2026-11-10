const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),readline=require('node:readline');
function transport(connection){
 const {binary,socket,hostBundleId}=connection;
 if(!binary||!socket)throw Error('Embedded Harness host connection required');
 const child=spawn(binary,['mcp','--embedded','--socket',socket,'--host-bundle-id',hostBundleId],{stdio:['pipe','pipe','pipe'],env:{...process.env,CUA_DRIVER_TELEMETRY_DISABLED:'1'}}),pending=new Map();let seq=0,closed=false;
 child.stderr.on('data',()=>{});const lines=readline.createInterface({input:child.stdout});
 lines.on('line',s=>{let m;try{m=JSON.parse(s)}catch{return;}const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);});
 function fail(){closed=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Driver connection ended; action outcome may be unknown. Check state before retry.'));}pending.clear();}
 child.once('error',fail);child.once('exit',fail);
 function request(method,params){if(closed)return Promise.reject(Error('Driver closed'));return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Driver timeout; action outcome UNKNOWN. Do not replay without readback.'));},30000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
 const ready=request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'anodhas-window-workspace',version:'0.2.0'}}).then(()=>child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n'));
 return {async call(name,args){await ready;return request('tools/call',{name,arguments:args});},async close(){if(!closed){child.stdin.end();await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,2000))]);}lines.close();}};
}
function value(result){if(result.isError)throw Error(result.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n')||'Driver refused');if(result.structuredContent)return result.structuredContent;for(const b of result.content??[])if(b.type==='text'){try{return JSON.parse(b.text)}catch{}}return {text:result.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n')};}
module.exports={transport,value};
