const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const CHANNEL='anodhas:sidebar-browser-control';
function one(source,needle,replace){if(source.split(needle).length!==2)throw Error('Unsupported carrier source or already patched: '+needle.slice(0,70));return source.replace(needle,replace);}
function makePatch(main,preload){
 if(main.includes(CHANNEL)||preload.includes(CHANNEL))throw Error('Browser control patch already present; use its receipt');
 main=one(main,'import { BrowserWindow,', 'import {createBrowserControl as createAnodhasBrowserControl} from "./anodhas-browser-control.mjs";\nimport { BrowserWindow,');
 const anchor='\tipcMain.handle(DESKTOP_IPC.browserAcquire, (event, workspace) => {';
 main=one(main,anchor,`\tconst anodhasBrowserControl=createAnodhasBrowserControl();\n\tipcMain.handle(${JSON.stringify(CHANNEL)}, (event, id, command) => {\n\t\tassertProductSender(event);\n\t\tconst lease=browserGuests.leases.get(id);\n\t\tif(!lease || lease.owner!==event.sender || !lease.guest || lease.guest.isDestroyed()) throw new Error("Browser control rejected: not this window's sidebar guest");\n\t\tif(command?.action==='navigate' && !browserGuests.allowedNavigation(command.url)) throw new Error('Browser navigation rejected by carrier policy');\n\t\treturn anodhasBrowserControl.execute(lease.guest,command);\n\t});\n`+anchor);
 const p='\t\tacquire: (workspace) => electron.ipcRenderer.invoke(DESKTOP_IPC.browserAcquire, workspace),';
 preload=one(preload,p,p+`\n\t\tcontrolVersion: 1,\n\t\tcontrol: (lease, command) => electron.ipcRenderer.invoke(${JSON.stringify(CHANNEL)}, lease, command),`);
 return {main,preload};
}
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
module.exports={makePatch,sha,CHANNEL};
