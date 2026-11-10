const fs=require('node:fs'),path=require('node:path'),YAML=require('yaml'),crypto=require('node:crypto');
const name='@anodhas/dsh-browser-workspace';
const oldIDs=new Set(['anodhas-internal-browser','anodhas-computer-window','anodhas-browser-live-provider','anodhas-browser-preview-ui','browser-playwright-isolated','anodhas-chrome-connector','anodhas-chrome-chain']);
function rows(patch){const out=[];function visit(v){if(!v||typeof v!=='object')return;if(v.id&&v.name)out.push(v);for(const x of Object.values(v))if(x&&typeof x==='object'){if(Array.isArray(x))x.forEach(visit);else visit(x);}}visit(patch);return out;}
function plan(jsonText,patchText,destination,{migrate=false}={}){
 const manifest=JSON.parse(jsonText),doc=YAML.parseDocument(patchText);if(doc.errors.length||!Array.isArray(doc.toJSON()))throw Error('Profile patch must be a YAML sequence');if(manifest.dependencies?.[name])throw Error('Bundle is already registered; uninstall it before upgrading');
 const all=rows(doc.toJSON()),conflicts=all.filter(r=>r.disabled!==true&&(oldIDs.has(r.id)||/anodhas-(?:browser|chrome)/.test(r.id)));
 if(conflicts.length&&!migrate)throw Error('Older ANODHAS browser plugins found. Review --migrate in README; no changes made.');
 if(conflicts.some(r=>!oldIDs.has(r.id)))throw Error('Unknown browser registration; refusing automatic migration');
 function disable(node){if(!YAML.isMap(node)&&!YAML.isSeq(node))return;if(YAML.isMap(node)&&oldIDs.has(node.get('id')))node.set('disabled',true);for(const item of node.items??[]){if(YAML.isPair(item))disable(item.value);else disable(item);}}
 if(migrate)disable(doc.contents);
 const own=YAML.parse(fs.readFileSync(path.join(__dirname,'../cordis.patch.yml'),'utf8'));for(const row of own)doc.contents.add(row);
 manifest.dependencies={...manifest.dependencies,[name]:'link:'+destination};return {json:JSON.stringify(manifest,null,2)+'\n',patch:doc.toString(),disabled:conflicts.map(r=>r.id)};
}
function commit(profile,destination,options={}){const j=path.join(profile,'package.json'),p=path.join(profile,'cordis.patch.yml'),before={json:fs.readFileSync(j,'utf8'),patch:fs.readFileSync(p,'utf8')},after=plan(before.json,before.patch,destination,options),backup=path.join(profile,'.anodhas-browser-backups',new Date().toISOString().replaceAll(':','-'));fs.mkdirSync(backup,{recursive:true,mode:0o700});fs.writeFileSync(path.join(backup,'package.json'),before.json,{mode:0o600});fs.writeFileSync(path.join(backup,'cordis.patch.yml'),before.patch,{mode:0o600});
 const link=path.join(profile,'node_modules/@anodhas/dsh-browser-workspace');if(fs.existsSync(link))throw Error('Module link exists; refusing replacement');fs.mkdirSync(path.dirname(link),{recursive:true});
 if(fs.readFileSync(j,'utf8')!==before.json||fs.readFileSync(p,'utf8')!==before.patch)throw Error('Profile changed concurrently');
 try{fs.symlinkSync(destination,link,'dir');fs.writeFileSync(j+'.anodhas-new',after.json,{mode:0o600});fs.writeFileSync(p+'.anodhas-new',after.patch,{mode:0o600});fs.renameSync(j+'.anodhas-new',j);fs.renameSync(p+'.anodhas-new',p);}catch(e){fs.writeFileSync(j,before.json,{mode:0o600});fs.writeFileSync(p,before.patch,{mode:0o600});if(fs.lstatSync(link,{throwIfNoEntry:false})?.isSymbolicLink())fs.unlinkSync(link);throw e;}
 if(fs.readFileSync(j,'utf8')!==after.json||fs.readFileSync(p,'utf8')!==after.patch)throw Error('Profile readback mismatch');
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex');const receipt={backup,destination,disabled:after.disabled,jsonSHA256:hash(after.json),patchSHA256:hash(after.patch)};fs.writeFileSync(path.join(backup,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});return receipt;
}
module.exports={plan,commit,rows};
