const fs=require('fs'),assert=require('assert');
let c=fs.readFileSync(__dirname+'/../Office/cctv.js','utf8');
function checks(s){
  assert(s.includes("var useMse=b().id==='glow'?false:"));
  assert(s.includes("useMse=x.id==='glow'?false:"));
}
checks(c);
let broken=c.replace("var useMse=b().id==='glow'?false:","var useMse=")
            .replace("useMse=x.id==='glow'?false:","useMse=");
let failed=false;try{checks(broken)}catch(e){failed=true}
assert(failed,'negative regression must fail if Glow MSE path is restored');
console.log('NEGATIVE_REGRESSION_V633=PASS');
