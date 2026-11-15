const fs=require('node:fs'),path=require('node:path'),YAML=require('yaml'),crypto=require('node:crypto');
const name='@anodhas/dsh-browser-workspace';
const oldIDs=new Set(['anodhas-internal-browser','anodhas-computer-window','anodhas-browser-live-provider','anodhas-browser-preview-ui','browser-playwright-isolated','anodhas-chrome-connector','anodhas-chrome-chain']);
const ownIDs=new Set(['anodhas-browser-use','anodhas-browser-isolated','anodhas-browser-workspace-ui','anodhas-browser-chrome','anodhas-browser-chrome-chain','anodhas-browser-computer']);
function rows(v){const out=[];function visit(x){if(!x||typeof x!=='object')return;if(x.id&&x.name)out.push(x);for(const y of Object.values(x))if(y&&typeof y==='object')Array.isArray(y)?y.forEach(visit):visit(y);}visit(v);return out;}
function plan(jsonText,patchText,destination,{migrate=false}={}){
 const manifest=JSON.parse(jsonText),doc=YAML.parseDocument(patchText);if(doc.errors.length||!Array.isArray(doc.toJSON()))throw Error('Profile patch must be a YAML sequence');
 const dependency=manifest.dependencies?.[name];if(dependency&&dependency!=='link:'+destination)throw Error('Existing bundle uses another destination; review before upgrade');
 const all=rows(doc.toJSON()),conflicts=all.filter(r=>r.disabled!==true&&!ownIDs.has(r.id)&&(oldIDs.has(r.id)||r.id==='anodhas-browser-native'||/anodhas-(?:browser|chrome)/.test(r.id)));
 if(conflicts.length&&!migrate)throw Error('Older ANODHAS browser plugins found. Quit Harness and use --migrate after reading the migration notes.');
 if(conflicts.some(r=>!oldIDs.has(r.id)&&r.id!=='anodhas-browser-native'))throw Error('Unknown browser registration; refusing automatic migration');
 function disable(node){if(!YAML.isMap(node)&&!YAML.isSeq(node))return;if(YAML.isMap(node)&&(oldIDs.has(node.get('id'))||node.get('id')==='anodhas-browser-native'))node.set('disabled',true);for(const item of node.items??[])disable(YAML.isPair(item)?item.value:item);}
 if(migrate)disable(doc.contents);
 const own=YAML.parse(fs.readFileSync(path.join(__dirname,'../cordis.patch.yml'),'utf8'));for(const row of own){const id=row.insert?.[0]?.id;if(!id)throw Error('Invalid bundle registration');const existing=all.find(x=>x.id===id);if(existing){if(existing.name!==row.insert[0].name)throw Error('Conflicting bundle registration');}else doc.contents.add(row);}
 manifest.dependencies={...manifest.dependencies,[name]:'link:'+destination};return {json:JSON.stringify(manifest,null,2)+'\n',patch:doc.toString(),disabled:conflicts.map(r=>r.id)};
}
function commit(profile,destination,options={}){const j=path.join(profile,'package.json'),p=path.join(profile,'cordis.patch.yml'),before={json:fs.readFileSync(j,'utf8'),patch:fs.readFileSync(p,'utf8')},after=plan(before.json,before.patch,destination,options);
 const link=path.join(profile,'node_modules/@anodhas/dsh-browser-workspace'),st=fs.lstatSync(link,{throwIfNoEntry:false});if(st&&(!st.isSymbolicLink()||path.resolve(path.dirname(link),fs.readlinkSync(link))!==path.resolve(destination)))throw Error('Conflicting existing module link');
 const backup=path.join(profile,'.anodhas-browser-backups',new Date().toISOString().replaceAll(':','-'));fs.mkdirSync(backup,{recursive:true,mode:0o700});for(const [file,value]of Object.entries({'package.json':before.json,'cordis.patch.yml':before.patch}))fs.writeFileSync(path.join(backup,file),value,{mode:0o600});
 if(fs.readFileSync(j,'utf8')!==before.json||fs.readFileSync(p,'utf8')!==before.patch)throw Error('Profile changed concurrently');let linked=false;
 try{if(!st){fs.mkdirSync(path.dirname(link),{recursive:true});fs.symlinkSync(destination,link,'dir');linked=true;}fs.writeFileSync(j+'.anodhas-new',after.json,{mode:0o600});fs.writeFileSync(p+'.anodhas-new',after.patch,{mode:0o600});fs.renameSync(j+'.anodhas-new',j);fs.renameSync(p+'.anodhas-new',p);}catch(e){fs.writeFileSync(j,before.json,{mode:0o600});fs.writeFileSync(p,before.patch,{mode:0o600});if(linked)fs.unlinkSync(link);throw e;}
 if(fs.readFileSync(j,'utf8')!==after.json||fs.readFileSync(p,'utf8')!==after.patch)throw Error('Profile readback mismatch');const hash=s=>crypto.createHash('sha256').update(s).digest('hex');return {backup,destination,disabled:after.disabled,jsonSHA256:hash(after.json),patchSHA256:hash(after.patch)};
}
module.exports={plan,commit,rows};
