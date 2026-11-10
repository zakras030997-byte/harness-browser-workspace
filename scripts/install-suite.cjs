const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const source=path.resolve(__dirname,'..'),q=s=>"'"+s.replaceAll("'","'\\''")+"'";
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{stdio:'inherit',...options});if(r.status!==0)throw Error('Step failed: '+path.basename(cmd));}
function assertClosed(){const r=spawnSync('/bin/ps',['-axo','pid,comm='],{encoding:'utf8'});if(r.status!==0)throw Error('Cannot confirm Harness is closed');if(r.stdout.split('\n').some(s=>Number(s.trim().split(/\s+/,1)[0])!==process.pid&&/DeepSeek Harness(?:[^/]*)\.app\/Contents\/MacOS\/DeepSeek Harness$/.test(s.trim())))throw Error('Quit Harness with Command-Q first. The installer never stops it.');}
async function install(app){if(process.platform!=='darwin')throw Error('macOS Desktop only');if(!app||!fs.existsSync(app))throw Error('Select the original DeepSeek Harness.app');assertClosed();const asar=require('../internal/scripts/asar-overlay.cjs'),m=JSON.parse(asar.read(path.join(app,'Contents/Resources/app.asar'),'package.json'));if(m.version!=='0.2.2-rc.1'||m.dshBuildCommit!=='c59d10aff167ad7eefead4b3a9082fb57c8fbfe8')throw Error('Unsupported Harness build. No changes made.');
 const home=process.env.DSH_HOME||path.join(os.homedir(),'.dsh'),profile=path.join(home,'profiles/desktop'),destination=path.join(home,'extensions/anodhas-browser-workspace'),carrier=path.join(os.homedir(),'Applications/DeepSeek Harness ANODHAS Browser.app'),migrate=process.argv.includes('--migrate');
 if(fs.existsSync(destination)||fs.existsSync(carrier))throw Error('Prepared destination already exists. Review it before replacing.');
 const pnpm=path.join(app,'Contents/Resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.cjs');if(!fs.existsSync(pnpm))throw Error('Bundled pnpm missing');
 // Check conflict policy before downloading or touching the profile. yaml is loaded from the source after bootstrap below.
 fs.mkdirSync(destination,{recursive:true,mode:0o700});for(const entry of ['package.json','pnpm-lock.yaml','index.mjs','package','internal','computer','chrome','lib','scripts','cordis.patch.yml','README.md','LICENSE','NOTICE','docs','runtime'])if(fs.existsSync(path.join(source,entry)))fs.cpSync(path.join(source,entry),path.join(destination,entry),{recursive:true});
 const env={...process.env,ELECTRON_RUN_AS_NODE:'1',PLAYWRIGHT_SKIP_BROWSER_GC:'1'};
 run(process.execPath,[pnpm,'install','--prod','--ignore-scripts','--frozen-lockfile'],{cwd:destination,env});
 const profiles=require(path.join(destination,'scripts/profile.cjs'));profiles.plan(fs.readFileSync(path.join(profile,'package.json'),'utf8'),fs.readFileSync(path.join(profile,'cordis.patch.yml'),'utf8'),destination,{migrate});
 run(process.execPath,[path.join(destination,'scripts/install-browser.cjs')],{env});
 const runtime=path.join(destination,'runtime');if(!fs.existsSync(path.join(runtime,'cua-driver')))require(path.join(destination,'scripts/fetch-runtime.cjs')).fetchRuntime(runtime);
 const prepared=require(path.join(destination,'internal/scripts/prepare-macos-app.cjs')).prepare(app,carrier,runtime);
 // Host executable and plugin paths are stable, independent of the downloaded archive's location.
 run('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',['-f',carrier]);
 const chrome=require(path.join(destination,'scripts/setup-chrome.cjs')).install({runtime:path.join(carrier,'Contents/MacOS/DeepSeek Harness')});
 assertClosed();const receipt=profiles.commit(profile,destination,{migrate});fs.writeFileSync(path.join(destination,'installation.json'),JSON.stringify({...receipt,carrier,prepared,chrome},null,2)+'\n',{mode:0o600});
 console.log('\nInstalled. Start '+carrier+'\nChrome: Load unpacked '+chrome.extension+' and click Connect.\nMac windows: allow Harness Accessibility and Screen Recording in System Settings, then use computer_permissions. '+'\nOriginal application and unrelated profile entries are preserved.');
}
module.exports={assertClosed};if(require.main===module)install(process.argv[2]).catch(e=>{console.error(e.message);console.error('The original app is preserved. A failed preparation directory may remain; inspect it before rerunning.');process.exitCode=1;});
