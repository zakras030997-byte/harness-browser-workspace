// The signed Harness application is never patched. A package-owned helper is
// started lazily by transport in stdio direct mode, without a standalone app.
const fs=require('node:fs'),path=require('node:path');
const defaultBinary=path.resolve(__dirname,'../runtime/cua-driver');
function validateBinary(binary){
 if(!path.isAbsolute(binary))throw Error('Computer Use helper path must be absolute');
 let st;try{st=fs.lstatSync(binary);}catch{throw Error('Computer Use helper is missing; run the Browser Workspace installer');}
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o022))throw Error('Computer Use helper must be a regular, non-writable-by-others package file');
 fs.accessSync(binary,fs.constants.X_OK);return binary;
}
async function start({binary=defaultBinary}={}){
 let disposed=false;
 return {
  async status(){let available=false;try{validateBinary(binary);available=true;}catch{}return {available,direct:true,embedded:false,separateApplication:false,backgroundDaemon:false,permissionOwner:'read-check_permissions-to-confirm',foregroundFallback:false,closed:disposed};},
  async connection(){if(disposed)throw Error('Computer Use helper provider is closed');return {binary:validateBinary(binary),mode:'direct',hostBundleId:'com.deepseek.dsh'};},
  async close(){disposed=true;}
 };
}
module.exports={start,validateBinary};
