const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const config=require('../lib/config.cjs');
const q=s=>"'"+s.replaceAll("'","'\\''")+"'";
function install({home=os.homedir(),runtime=process.execPath,state=config.stateDir(),platform=process.platform}={}) {
  if(platform!=='darwin')throw Error('This release supports macOS Desktop only');
  config.privateDirectory(state);
  const pairing=config.defaults(),launch=path.join(state,'native-host');
  const configPath=path.join(state,'config.json');
  const contents='#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexport ANODHAS_BROWSER_CONFIG='+q(configPath)+'\nexec '+q(runtime)+' '+q(path.join(config.root,'chrome/native-host.cjs'))+' "$@"\n';
  fs.writeFileSync(configPath,JSON.stringify(pairing,null,2)+'\n',{mode:0o600});
  fs.writeFileSync(launch,contents,{mode:0o700});
  const dir=path.join(home,'Library/Application Support/Google/Chrome/NativeMessagingHosts');
  fs.mkdirSync(dir,{recursive:true});
  const manifestPath=path.join(dir,config.hostName+'.json');
  const manifest={name:config.hostName,description:'ANODHAS Browser Workspace scoped bridge',path:launch,type:'stdio',allowed_origins:[pairing.extensionOrigin]};
  if(fs.existsSync(manifestPath)){
    const previous=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    if(previous.path!==launch)throw Error('An existing Browser Workspace host points elsewhere. Review it before replacing it.');
  }
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
  return {manifestPath,extension:path.join(config.root,'chrome/extension'),extensionId:pairing.extensionId};
}
module.exports={install};
if(require.main===module){try{console.log(JSON.stringify(install(),null,2));console.log('Next: Chrome → chrome://extensions → Developer mode → Load unpacked (path above) → pin extension → Connect. This command has not opened or changed Chrome tabs. Keep this package at its current path.');}catch(e){console.error(e.message);process.exitCode=1;}}
