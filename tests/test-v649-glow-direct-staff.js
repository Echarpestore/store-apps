const fs=require('fs'),assert=require('assert');
const c=fs.readFileSync(__dirname+'/../Office/cctv.js','utf8');
const h=fs.readFileSync(__dirname+'/../Office/index.html','utf8');
const sw=fs.readFileSync(__dirname+'/../Office/sw.js','utf8');

function guard(x){
  assert(x.includes("/echarpe-playback/staff-state?_="),'direct staff endpoint missing');
  assert(x.includes("directStaff=pair[2]||null"),'direct staff response missing');
  assert(x.includes("directStaff.activeStaffCount"),'direct count not used');
  assert(x.includes("directStaff.sourceHealthy!==false"),'direct health not used');
  assert(x.includes("staffSource==='pos_firestore'?'POS مباشر'"),'POS direct label missing');
  assert(x.includes("branch||directStaff.branchId"),'branch guard missing');
  assert(x.includes("branchId==='glow'?160:900"),'v645 fast Glow live must remain');
}
guard(c);
assert(h.includes('cctv.js?v=649'),'Office ref not v649');
assert(sw.includes('echarpe-office-v649'),'Office SW cache not v649');

let broken=c.replace("fetchJsonRetry(base+'/echarpe-playback/staff-state?_='+Date.now(),x.id,2).catch(function(){return null;})","Promise.resolve(null)");
let failed=false;try{guard(broken)}catch(e){failed=true}
assert(failed,'negative regression failed to catch removal of direct staff route');

console.log('GLOW_OFFICE_DIRECT_STAFF_V649=PASS');
console.log('NEGATIVE_REGRESSION_ACTIVITY_ONLY_STAFF_V649=PASS');
