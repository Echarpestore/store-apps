const fs=require('fs'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..');
const staff=fs.readFileSync(path.join(root,'pos/cctv-staff-state.js'),'utf8');
const html=fs.readFileSync(path.join(root,'pos/index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'pos/sw.js'),'utf8');
function checks(src){
  assert(src.includes("if(s.indexOf('glow')>=0)return {id:'glow'};"),'Glow branch mapping missing');
  assert(src.includes('version:624,source:SOURCE,sourceHealthy:true'),'v624 healthy POS payload missing');
  assert(src.includes("branch:(branchProfile(activeBranch)||{}).id||''"),'payload branch mapping missing');
  assert(src.includes('shiftReady=true'),'shift readiness missing');
  assert(src.includes('breakReady=true'),'break readiness missing');
  assert(src.includes('setTimeout(fallbackGet,BOOTSTRAP_RETRY_MS)'),'bootstrap fallback missing');
  assert(src.includes("lastError='shift_get_'"),'independent shift failure marker missing');
  assert(src.includes("lastError='break_get_'"),'independent break failure marker missing');
}
checks(staff);
assert(html.includes('cctv-staff-state.js?v=624'),'POS HTML cache-bust not v624');
assert(sw.includes("store-apps-shell-v624"),'POS SW cache not v624');
// Negative regression: recreate the old Glow-blind branch mapper; the test must fail.
let regressed=staff.replace("if(s.indexOf('glow')>=0)return {id:'glow'};",'');
let failed=false;try{checks(regressed);}catch(e){failed=true;}
assert(failed,'negative regression did not detect removal of Glow support');
console.log('GLOW_POS_STAFF_SOURCE_V624=PASS');
console.log('NEGATIVE_REGRESSION_GLOW_MAPPING=PASS');
