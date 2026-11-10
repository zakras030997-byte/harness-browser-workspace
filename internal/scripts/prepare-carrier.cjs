// Creates a reviewable carrier overlay in a separate directory. Never modifies a live app.
const fs=require('node:fs'),path=require('node:path');const {makePatch,sha}=require('../native/patch.cjs');
function prepare({main,preload,output}){
 const patched=makePatch(fs.readFileSync(main,'utf8'),fs.readFileSync(preload,'utf8'));
 fs.mkdirSync(output,{recursive:true});
 fs.writeFileSync(path.join(output,'main.js'),patched.main);fs.writeFileSync(path.join(output,'preload-app.cjs'),patched.preload);fs.copyFileSync(path.join(__dirname,'../native/control.mjs'),path.join(output,'anodhas-browser-control.mjs'));
 const receipt={harness:'0.2.2-rc.1',original:{main:sha(fs.readFileSync(main)),preload:sha(fs.readFileSync(preload))},patched:{main:sha(patched.main),preload:sha(patched.preload)},bridgeVersion:1};fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}
module.exports={prepare};
if(require.main===module){try{if(process.argv.length!==5)throw Error('Usage: node prepare-carrier.cjs main.js preload-app.cjs output');console.log(prepare({main:process.argv[2],preload:process.argv[3],output:process.argv[4]}));}catch(e){console.error(e.message);process.exitCode=1;}}
