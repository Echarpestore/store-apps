const fs=require('fs'),assert=require('assert'),vm=require('vm');
let c=fs.readFileSync(__dirname+'/../Office/cctv.js','utf8');
function checks(s){
  assert(s.includes('var valid=localBranch?order.slice()'));
  assert(s.includes('Math.max(coverageStart,coverageEnd-90000)'));
}
checks(c);
let broken=c.replace('var valid=localBranch?order.slice()',"var valid=order.filter(function(k){var x=shots[k]||{};return localBranch?!!x.available:true;})")
            .replace('Math.max(coverageStart,coverageEnd-90000)', 'coverageStart');
let failed=false;try{checks(broken);}catch(e){failed=true;}
assert(failed,'negative regression must fail when old bugs are restored');
console.log('NEGATIVE_REGRESSION_V629=PASS');
