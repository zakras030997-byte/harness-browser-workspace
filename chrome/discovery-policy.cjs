const net=require('node:net');
const secret=/token|secret|password|passwd|auth|cookie|session|csrf|nonce|signature|api.?key|email/i;
function safeInput(v){if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(v))throw Error('Invalid controlled input');return v;}
function publicURL(value){
 const u=new URL(value);
 if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||net.isIP(u.hostname)||u.hostname==='localhost'||u.hostname.endsWith('.localhost')||u.hostname.endsWith('.local')||u.href.length>2048)
  throw Error('Only public credential-free HTTPS origins are supported');
 if(!/^\/[A-Za-z0-9_./~-]*$/.test(u.pathname)||u.pathname.includes('..')
  ||/(?:^|\/)(?:delete|remove|destroy|logout|signout|revoke|purge|reset|unsubscribe|create|update|submit|transfer|checkout|pay|purchase|confirm|send|login|oauth|token|session|password|credentials)(?:\/|$)/i.test(u.pathname))throw Error('Unsupported/non-read path');
 const entries=[...u.searchParams];
 if(entries.length>12||new Set(entries.map(x=>x[0])).size!==entries.length||entries.some(([k,v])=>secret.test(k)||!/^\w{1,50}$/.test(k)||v.length>120||!/^[A-Za-z0-9 _.-]*$/.test(v)))throw Error('Sensitive/unsupported query');
 for(const [k,v]of entries)if(/^(action|operation|method)$/i.test(k)&&!/^(get|read|list|search|query)$/i.test(v))throw Error('Unsupported query action');
 return u;
}
function publicAddress(address){
 if(net.isIP(address)===4){const p=address.split('.').map(Number),[a,b,c]=p;
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&b>=18&&b<=19||a===192&&b===0||a===192&&b===2||a===198&&b===51&&c===100||a===203&&b===0&&c===113);
 }
 return net.isIP(address)===6&&/^[23][0-9a-f]{3}:/i.test(address)&&!/^2001:(?:db8|0*0):/i.test(address);
}
module.exports={safeInput,publicURL,publicAddress,secret};
