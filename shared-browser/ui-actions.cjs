const {fault}=require('./catalog.cjs');
const roles=new Set(['button','textbox','link','checkbox','radio','combobox','option','menuitem','tab','switch','spinbutton','searchbox','slider']);
function roleLocator(page,role,name){if(!roles.has(role)||name!==undefined&&(typeof name!=='string'||name.length>300))throw fault('INVALID_ROLE_TARGET');return page.getByRole(role,{...(name!==undefined?{name,exact:true}:{})});}
function targetLocator(page,args){
 const {selector,role,name}=args;
 if(role!==undefined){if(selector!==undefined)throw fault('CHOOSE_ROLE_OR_SELECTOR');return roleLocator(page,role,name??(args.action==='click'?args.value:undefined));}
 if(typeof selector!=='string'||!selector||selector.length>500||name!==undefined)throw fault('EXPLICIT_ELEMENT_TARGET_REQUIRED');
 if(selector.startsWith('css='))return page.locator(selector.slice(4));
 const named=/^(?:role=)?([a-z]+)\s+("(?:[^"\\]|\\.)*")$/.exec(selector);
 if(named){let n;try{n=JSON.parse(named[2]);}catch{throw fault('INVALID_ROLE_TARGET');}return roleLocator(page,named[1],n);}
 const roleSyntax=/^role=([a-z]+)(?:\[name=("(?:[^"\\]|\\.)*")\])?$/.exec(selector);
 if(roleSyntax)return roleLocator(page,roleSyntax[1],roleSyntax[2]===undefined?undefined:JSON.parse(roleSyntax[2]));
 if(roles.has(selector))return roleLocator(page,selector,args.action==='click'?args.value:undefined);
 return page.locator(selector);
}
function uiError(error){if(error.code)return error;
 const message=String(error.message??'');if(/Unexpected token|Unknown engine|Error while parsing selector|is not a valid selector|Malformed selector/i.test(message))return fault('INVALID_ELEMENT_SELECTOR');
 if(/Timeout.*exceeded|timed out/i.test(message))return Object.assign(fault('UI_TIMEOUT_OUTCOME_UNKNOWN'),{unknown:true});
 if(/Target.*closed|browser.*closed|Connection closed/i.test(message))return fault('BROWSER_TARGET_CLOSED');
 if(/not an <input>|not an input|not editable/i.test(message))return fault('ELEMENT_NOT_EDITABLE');
 return fault('UI_ACTION_FAILED');
}
async function interact(browser,chat,args,signal){
 if(!['click','fill','key'].includes(args.action))throw fault('UNSUPPORTED_UI_ACTION');
 return browser.serial(chat,async()=>{
  const {guardPage}=require('./tab-policy.cjs'),e=guardPage(browser,chat,args);if(e.outcomeUnknown)throw fault('TAB_OUTCOME_UNKNOWN_CLOSE_REQUIRED');signal?.throwIfAborted();
  try{const target=targetLocator(e.page,args),count=await target.count();if(count!==1)throw Object.assign(fault(count===0?'ELEMENT_NOT_FOUND':'AMBIGUOUS_ELEMENT'),{details:{performed:false,matches:count,hint:count===0?'Refresh snapshot; use role plus exact accessible name, or an explicit CSS selector.':'Use role plus exact accessible name or a unique CSS selector; no click was sent.'}});
   signal?.throwIfAborted();if(args.action==='click')await target.click({timeout:5000});
   if(args.action==='fill'){if(typeof args.value!=='string'||args.value.length>8000)throw fault('INVALID_INPUT');await target.fill(args.value,{timeout:5000});}
   if(args.action==='key'){if(!['Enter','Escape','Tab','ArrowUp','ArrowDown'].includes(args.value))throw fault('UNSUPPORTED_KEY');await target.press(args.value,{timeout:5000});}
   signal?.throwIfAborted();return {sent:true,verified:false,next:'Read a fresh snapshot and check the actual result; do not automatically repeat.'};
  }catch(error){const result=uiError(error);if(result.unknown)e.outcomeUnknown=true;throw result;}
 },args.tabId);
}
module.exports={targetLocator,interact,uiError};
