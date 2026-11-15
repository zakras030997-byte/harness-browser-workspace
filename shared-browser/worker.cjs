// Private stdio transport for local tests and backward-compatible single-client operation.
const readline=require('node:readline');
const {createRuntime}=require('./runtime.cjs');
const profileIndex=process.argv.indexOf('--profile-directory');
const runtime=createRuntime({directory:process.argv[2],headless:process.argv.includes('--headless'),profileDirectory:profileIndex>=0?process.argv[profileIndex+1]:undefined});
const pending=new Map();let closed=false;
function send(value){const line=JSON.stringify(value);if(Buffer.byteLength(line)>5*1024*1024)throw fault('RESULT_TOO_LARGE');process.stdout.write(line+'\n');}
const lines=readline.createInterface({input:process.stdin});
lines.on('line',line=>{if(Buffer.byteLength(line)>65536){send({error:'INPUT_TOO_LARGE'});return;}let m;try{m=JSON.parse(line);}catch{return;}
 if(m.command==='cancel'){pending.get(m.cancelId)?.abort();return;}if(closed||typeof m.id!=='string'||pending.has(m.id))return;
 const c=new AbortController();pending.set(m.id,c);
 void runtime.execute(m.command,m.chat,m.args??{},c.signal).then(result=>{if(c.signal.aborted)throw fault('CANCELLED');send({id:m.id,result});}).catch(e=>send({id:m.id,error:e.code??(/Target.*closed|browser.*closed|Connection closed/i.test(e.message)?'BROWSER_TARGET_CLOSED':'OPERATION_FAILED'),...e.details?{details:e.details}:{},unknown:/UNKNOWN|timeout|timed out|disconnected/i.test(e.message)})).finally(()=>pending.delete(m.id));
});
lines.on('close',()=>{closed=true;for(const c of pending.values())c.abort();void runtime.close();});
