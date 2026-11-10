const path=require('node:path'),{spawnSync}=require('node:child_process');
const {root,stateDir,privateDirectory}=require('../lib/config.cjs');
const cache=path.join(stateDir(),'playwright');
privateDirectory(stateDir());
const cli=path.join(path.dirname(require.resolve('playwright/package.json')),'cli.js');
const result=spawnSync(process.execPath,[cli,'install','chromium'],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:'1',PLAYWRIGHT_BROWSERS_PATH:cache,PLAYWRIGHT_SKIP_BROWSER_GC:'1'}});
process.exitCode=result.status??1;
