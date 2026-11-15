import path from 'node:path';
import {pathToFileURL} from 'node:url';
export function runtimeSdk(name){
 if(!/^@deepseek-ai\/dsh-[a-z-]+$/.test(name))throw Error('Unsupported SDK module');
 if(!process.resourcesPath)return import(name);
 return import(pathToFileURL(path.join(process.resourcesPath,'app.asar/dsh/node_modules',name,'lib/index.js')).href);
}
