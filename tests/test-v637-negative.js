const fs=require('fs'),assert=require('assert');
let c=fs.readFileSync(__dirname+'/../Office/cctv.js','utf8');
function guard(s){assert(s.includes("x&&x.id==='glow'?'mp4':'mse'"));assert(!s.includes("x&&x.id==='glow'?'webrtc':'mse'"));}
guard(c);
let broken=c.replace("x&&x.id==='glow'?'mp4':'mse'","x&&x.id==='glow'?'webrtc':'mse'");
let failed=false;try{guard(broken)}catch(e){failed=true}assert(failed,'negative regression catches WebRTC restoration');
console.log('NEGATIVE_REGRESSION_V637=PASS');
