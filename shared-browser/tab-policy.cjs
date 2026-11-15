const net=require('node:net');
const {fault}=require('./catalog.cjs');
// Browser navigation is not credential-free recipe replay. SSO paths and query
// strings are legal here; never include OAuth query/fragment values in metadata.
function browserURL(value){let u;try{u=new URL(value);}catch{throw fault('INVALID_BROWSER_URL');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||net.isIP(u.hostname)||u.hostname==='localhost'||u.hostname.endsWith('.localhost')||u.hostname.endsWith('.local')||u.href.length>16384)throw fault('UNSUPPORTED_BROWSER_URL');return u;}
function browserPageKey(value){const u=browserURL(value);return u.origin+u.pathname;}
function currentPage(entry){try{return browserPageKey(entry.page.url());}catch{return null;}}
function guardPage(browser,chat,args){const e=browser.lease(chat,args.tabId),currentURL=currentPage(e);
 if(!currentURL)throw fault('UNSUPPORTED_CURRENT_PAGE');
 if(browserPageKey(args.url)!==currentURL)throw Object.assign(fault('TAB_NAVIGATED'),{details:{tabId:e.id,currentURL,retry:'Review the new origin and use its URL with the same owned tabId; do not repeat a previous action.'}});
 return e;
}
module.exports={browserURL,browserPageKey,currentPage,guardPage};
