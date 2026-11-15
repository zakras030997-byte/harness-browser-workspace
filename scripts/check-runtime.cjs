const path=require('node:path'),{pathToFileURL}=require('node:url');
process.resourcesPath=process.argv[2];
if(!process.resourcesPath)throw Error('Pass official Harness Contents/Resources');
(async()=>{for(const file of ['package/provider.mjs','package/chrome-provider.mjs','package/chrome-chain.mjs','computer/index.mjs']){await import(pathToFileURL(path.resolve(__dirname,'..',file)).href);console.log('Imported '+file);}let count=0;require('../package/use-tools.cjs').registerUseTools({tools:{register(){count++}},systemPrompt:{section(){}}},async()=>{});if(count!==11)throw Error('Unexpected global tool count');console.log('Official runtime imports and11global schemas passed');})().catch(e=>{console.error(e.message);process.exitCode=1});
