const fs=require('fs'),assert=require('assert');
const c=fs.readFileSync(__dirname+'/../Office/cctv.js','utf8');
function guard(s){
  assert(s.includes("x&&x.id==='glow'?'webrtc':'mse'"));
  assert(!s.includes("b().id==='glow'?false"));
}
guard(c);
const broken=c.replace("x&&x.id==='glow'?'webrtc':'mse'","x&&x.id==='glow'?'mse':'mse'");
let failed=false;try{guard(broken)}catch(e){failed=true}
assert(failed,'test must fail if Glow is regressed to MSE');
console.log('NEGATIVE_REGRESSION_V635=PASS');
