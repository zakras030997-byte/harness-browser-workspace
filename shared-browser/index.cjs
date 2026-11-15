const {Catalog}=require('./catalog.cjs');
const {Engine}=require('./engine.cjs');
const {ManagedChrome}=require('./managed-chrome.cjs');
// Development entry points only. No profile lookup, registration or process starts on import.
const createHarnessAdapter=options=>new Engine({...options,client:'harness'});
const createOpenCodeAdapter=options=>new Engine({...options,client:'opencode'});
module.exports={Catalog,ManagedChrome,createHarnessAdapter,createOpenCodeAdapter};
