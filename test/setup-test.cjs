const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const config=require('../lib/config.cjs'),{install}=require('../scripts/setup-chrome.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'anodhas-setup-'));
try {
  const state=path.join(temp,'state'),runtime=process.execPath;
  const out=install({home:temp,state,runtime,platform:'darwin'});
  const manifest=JSON.parse(fs.readFileSync(out.manifestPath));
  assert.deepEqual(manifest.allowed_origins,[config.defaults().extensionOrigin]);
  assert.equal(manifest.name,'com.anodhas.browser_workspace');
  assert.equal(fs.statSync(state).mode&0o777,0o700);
  assert.equal(fs.statSync(path.join(state,'config.json')).mode&0o777,0o600);
  const launch=fs.readFileSync(manifest.path,'utf8');
  assert(launch.includes('ELECTRON_RUN_AS_NODE=1')&&launch.includes(runtime));
  assert.equal(install({home:temp,state,runtime,platform:'darwin'}).manifestPath,out.manifestPath);
  assert.throws(()=>install({home:temp,state,runtime,platform:'win32'}),/macOS/);
  console.log('Native host setup in temporary home passed; real Chrome untouched');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
