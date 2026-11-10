// Owner-authorized local registration. Refuses while the Desktop main process runs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
function install({source=path.resolve(__dirname,'..'),dshHome=process.env.DSH_HOME||path.join(require('node:os').homedir(),'.dsh')}={}){
 const ps=spawnSync('/bin/ps',['-axo','command='],{encoding:'utf8'});if(ps.status!==0)throw Error('Cannot confirm Harness is closed');
 if(ps.stdout.split('\n').some(s=>/DeepSeek Harness(?: ANODHAS)?\.app\/Contents\/MacOS\/DeepSeek Harness(?:\s|$)/.test(s)))throw Error('Close DeepSeek Harness normally before registering the native-browser addon; no process will be stopped');
 const profile=path.join(dshHome,'profiles/desktop'),jsonPath=path.join(profile,'package.json'),patchPath=path.join(profile,'cordis.patch.yml');
 const beforeJSON=fs.readFileSync(jsonPath,'utf8'),beforePatch=fs.readFileSync(patchPath,'utf8'),manifest=JSON.parse(beforeJSON),name='@anodhas/dsh-internal-browser';
 if(beforePatch.includes('id: anodhas-internal-browser')||manifest.dependencies?.[name])throw Error('Internal browser registration already exists; inspect it before changing');
 const destination=path.join(dshHome,'extensions/anodhas-internal-browser'),link=path.join(profile,'node_modules/@anodhas/dsh-internal-browser');
 if(fs.existsSync(destination)||fs.existsSync(link))throw Error('Destination or module link already exists; refusing to replace it');
 const installed=JSON.parse(fs.readFileSync(path.join(source,'package.json')));if(installed.name!==name)throw Error('Wrong plugin source');
 fs.mkdirSync(destination,{recursive:true,mode:0o700});
 for(const entry of ['package.json','index.mjs','client.js','lib','native','scripts','README.md','LICENSE','VALIDATION.md','cordis.patch.yml'])if(fs.existsSync(path.join(source,entry)))fs.cpSync(path.join(source,entry),path.join(destination,entry),{recursive:true});
 const backup=path.join(dshHome,'anodhas/internal-browser/backups',new Date().toISOString().replaceAll(':','-'));fs.mkdirSync(backup,{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(backup,'package.json'),beforeJSON,{mode:0o600});fs.writeFileSync(path.join(backup,'cordis.patch.yml'),beforePatch,{mode:0o600});
 const after={...manifest,dependencies:{...manifest.dependencies,[name]:'link:'+destination}};
 const suffix='\n- insert:\n    - id: anodhas-internal-browser\n      name: "@anodhas/dsh-internal-browser"\n';
 fs.mkdirSync(path.dirname(link),{recursive:true});fs.symlinkSync(destination,link,'dir');
 // Check concurrent edits immediately before committing our two known changes.
 if(fs.readFileSync(jsonPath,'utf8')!==beforeJSON||fs.readFileSync(patchPath,'utf8')!==beforePatch)throw Error('Profile changed concurrently; configuration not overwritten. Prepared plugin and link remain for review.');
 fs.writeFileSync(jsonPath,JSON.stringify(after,null,2)+'\n');fs.writeFileSync(patchPath,beforePatch+suffix);
 const check=JSON.parse(fs.readFileSync(jsonPath));delete check.dependencies[name];const expected=structuredClone(manifest);expected.dependencies??={};if(JSON.stringify(check)!==JSON.stringify(expected)||fs.readFileSync(patchPath,'utf8')!==beforePatch+suffix)throw Error('Profile readback differs beyond the intended addon');
 const result={installed:true,backup,destination,otherProfileSettingsPreserved:true,chromeEntriesPreserved:true,modelSettingsPreserved:true,sourceSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(source,'index.mjs'))).digest('hex')};
 fs.writeFileSync(path.join(backup,'receipt.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});return result;
}
module.exports={install};
if(require.main===module){try{console.log(install());}catch(e){console.error(e.message);process.exitCode=1;}}
