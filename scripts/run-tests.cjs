const {spawnSync}=require('node:child_process');
const path=require('node:path');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(require('../lib/config.cjs').stateDir(),'playwright');
process.env.ANODHAS_CHROMIUM_EXECUTABLE ||= require('playwright').chromium.executablePath();
const files=['core-test','setup-test','bridge-test','chain-preview-test','headless-test','extension-browser-test','chain-ui-browser-test','preview-close-test'];
for(const name of files){const r=spawnSync(process.execPath,[path.join(__dirname,'../test',name+'.cjs')],{stdio:'inherit',env:process.env,timeout:60000});if(r.status!==0){console.error(name+' failed',r.error?.message||'');process.exit(r.status||1);}}
console.log('Eight browser check suites passed.');
