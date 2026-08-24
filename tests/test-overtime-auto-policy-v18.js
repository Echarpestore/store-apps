'use strict';
const assert=require('assert');
const { loadSalesApp }=require('./helpers/load-sales');
const S=loadSalesApp().sandbox;
const base=Date.UTC(2026,7,24,10,0,0);
const mk=(dur,ot,extra={})=>Object.assign({
  clockInTs:base, clockOutTs:base+dur*60000, shiftMinutes:dur,
  overtimeMinutes:ot, otRequiresApproval:true, overtimeDecision:'pending', forgotClockOut:false
},extra);

let x=S.window.overtimeReviewInfo(mk(555,60));
assert.equal(x.needsReview,false,'60m normal overtime auto');
assert.equal(S.window.autoApprovedOvertimeMinutes(mk(555,60)),60,'normal pending is payable automatically');
assert.deepEqual(S.window.pendingOvertimeShifts([mk(555,60)]).map(x=>x.id||'normal'),[],'normal does not bother owner');

x=S.window.overtimeReviewInfo(mk(735,240));
assert.equal(x.needsReview,true,'4h overtime needs review');
assert.equal(x.reason,'too_much_overtime');
assert.equal(S.window.autoApprovedOvertimeMinutes(mk(735,240)),0,'suspicious pending not paid');

x=S.window.overtimeReviewInfo(mk(555,120));
assert.equal(x.needsReview,true,'mismatched overtime needs review');
assert.equal(x.reason,'calc_mismatch');

x=S.window.overtimeReviewInfo(mk(900,405,{forgotClockOut:true}));
assert.equal(x.needsReview,true,'forgot clockout needs review');
assert.equal(x.reason,'forgot_clockout');

console.log('overtime auto policy v18: PASS');
