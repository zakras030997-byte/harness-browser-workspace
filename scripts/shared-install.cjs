// Offline planning only. Never reads or writes OpenCode configuration.
const fs=require('node:fs'),path=require('node:path');
function assertIdle(directory){
 const socket=path.join(directory,'shared.sock'),owner=path.join(directory,'shared-owner.json');
 if(fs.existsSync(socket))throw Error('Shared browser is in use or has an unresolved socket. No update performed. Leave other clients running and install later.');
 if(fs.existsSync(owner)){const st=fs.lstatSync(owner);if(st.isSymbolicLink()||!st.isFile()||(st.mode&0o077))throw Error('Unknown shared runtime owner; no update performed');const v=JSON.parse(fs.readFileSync(owner));if(!Number.isSafeInteger(v.pid)||v.pid<2)throw Error('Invalid shared runtime owner');try{process.kill(v.pid,0);throw Error('Shared browser owner is running. No update performed.');}catch(e){if(e.code!=='ESRCH')throw e;}}
}
function options(app,home){const nodeExecutable=path.join(app,'Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node');if(!fs.existsSync(nodeExecutable))throw Error('Official bundled Node runtime missing');return {stateDirectory:path.join(home,'anodhas-browser-workspace/shared'),nodeExecutable,windowMode:'separate'};}
function directories(patch){const out=[];function walk(v){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'){if(['anodhas-browser-shared','anodhas-shared-chrome'].includes(v.id)&&v.config?.stateDirectory)out.push(v.config.stateDirectory);Object.values(v).forEach(walk);}}walk(patch);return out;}
module.exports={assertIdle,options,directories};
