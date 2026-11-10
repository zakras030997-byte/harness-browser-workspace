// Prepares a separate, locally signed carrier. Never edits the source app or starts it.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');const asar=require('./asar-overlay.cjs'),{makePatch,sha}=require('../native/patch.cjs');
function run(command,args){const r=spawnSync(command,args,{encoding:'utf8'});if(r.status!==0)throw Error(command+': '+(r.stderr||r.stdout).slice(-1500));return r.stdout;}
function prepare(source,destination,runtimeDirectory){
 if(process.platform!=='darwin')throw Error('macOS only');source=path.resolve(source);destination=path.resolve(destination);
 if(source===destination||destination.startsWith(source+path.sep)||fs.existsSync(destination))throw Error('Destination must be a new app path outside the original');
 const archive=path.join(source,'Contents/Resources/app.asar'),manifest=JSON.parse(asar.read(archive,'package.json'));
 if(manifest.version!=='0.2.2-rc.1'||manifest.dshBuildCommit!=='c59d10aff167ad7eefead4b3a9082fb57c8fbfe8')throw Error('Unsupported Harness carrier build; do not apply this overlay blindly');
 const main=asar.read(archive,'lib/main.js'),preload=asar.read(archive,'lib/preload-app.cjs'),browserPatched=makePatch(main.toString(),preload.toString()),patched=runtimeDirectory?require('../../computer/native/patch.cjs').makePatch(browserPatched.main,browserPatched.preload):browserPatched;
 const replacements={'lib/main.js':Buffer.from(patched.main),'lib/preload-app.cjs':Buffer.from(patched.preload),'lib/anodhas-browser-control.mjs':fs.readFileSync(path.join(__dirname,'../native/control.mjs'))};
 if(runtimeDirectory)replacements['lib/anodhas-computer-host.mjs']=fs.readFileSync(path.join(__dirname,'../../computer/native/host.mjs'));
 fs.mkdirSync(path.dirname(destination),{recursive:true});run('/bin/cp',['-cR',source,destination]);
 const copied=path.join(destination,'Contents/Resources/app.asar'),temp=copied+'.anodhas-new';
 const receipt=asar.patch(archive,temp,replacements);fs.renameSync(temp,copied);
 run('/usr/libexec/PlistBuddy',['-c',`Set :ElectronAsarIntegrity:Resources/app.asar:hash ${receipt.headerHash}`,path.join(destination,'Contents/Info.plist')]);
 if(runtimeDirectory){const target=path.join(destination,'Contents/Resources/anodhas-computer');fs.mkdirSync(target,{recursive:true});for(const name of ['cua-driver','LICENSE','THIRD_PARTY_NOTICES.md'])fs.copyFileSync(path.join(runtimeDirectory,name),path.join(target,name));fs.chmodSync(path.join(target,'cua-driver'),0o755);}
 run('/usr/libexec/PlistBuddy',['-c','Set :CFBundleIdentifier com.anodhas.dsh.browser-workspace',path.join(destination,'Contents/Info.plist')]);
 const displayKey=run('/usr/libexec/PlistBuddy',['-c','Print',path.join(destination,'Contents/Info.plist')]).includes('CFBundleDisplayName');
 run('/usr/libexec/PlistBuddy',['-c',(displayKey?'Set':'Add')+' :CFBundleDisplayName '+(displayKey?'':'string ')+'DeepSeek Harness ANODHAS Browser',path.join(destination,'Contents/Info.plist')]);
 run('/usr/bin/codesign',['--force','--sign','-','--preserve-metadata=entitlements',destination]);
 run('/usr/bin/codesign',['--verify','--strict',destination]);
 const result={harness:manifest.version,build:manifest.dshBuildCommit,sourceUnchanged:asar.read(archive,'lib/main.js').equals(main)&&asar.read(archive,'lib/preload-app.cjs').equals(preload),...receipt,signing:'local ad hoc, not vendor notarization',mainBefore:sha(main),mainAfter:sha(replacements['lib/main.js'])};
 fs.writeFileSync(destination+'.browser-receipt.json',JSON.stringify(result,null,2)+'\n');return result;
}
module.exports={prepare};
if(require.main===module){try{if(![4,5].includes(process.argv.length))throw Error('Usage: node prepare-macos-app.cjs source.app new-destination.app');console.log(prepare(process.argv[2],process.argv[3],process.argv[4]));}catch(e){console.error(e.message);process.exitCode=1;}}
