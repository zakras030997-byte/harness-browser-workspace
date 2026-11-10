const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const skip=new Set(['node_modules','.git','artifacts','.test-state','runtime']);
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>skip.has(e.name)?[]:e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of walk(root)){
  if(file===__filename)continue;
  if(!/\.(?:js|mjs|cjs|json|md|yml|txt)$/.test(file))continue;
  const s=fs.readFileSync(file,'utf8');
  if(/\/Users\/|GOCSPX-|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(s))throw Error('Private machine data in '+path.relative(root,file));
}
const m=JSON.parse(fs.readFileSync(path.join(root,'chrome/extension/manifest.json')));
if(!m.key)throw Error('Stable public extension identity missing');
for(const target of Object.values(JSON.parse(fs.readFileSync(path.join(root,'package.json'))).exports))if(!fs.existsSync(path.join(root,target)))throw Error('Missing export '+target);
console.log('Package entry points and private-path checks passed.');
