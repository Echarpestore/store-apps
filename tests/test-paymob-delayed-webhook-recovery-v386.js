'use strict';
const fs=require('fs'), path=require('path');
const s=fs.readFileSync(path.join(__dirname,'..','pos','pos-sale.js'),'utf8');
const sw=fs.readFileSync(path.join(__dirname,'..','pos','sw.js'),'utf8');
let pass=0, fail=0;
function ok(c,m){ if(c){pass++;} else {fail++; console.error('FAIL:',m);} }
function fn(name){ const st=s.indexOf('function '+name+'('); if(st<0)return ''; const b=s.indexOf('{',st); let d=0; for(let i=b;i<s.length;i++){ if(s[i]==='{')d++; else if(s[i]==='}'&&--d===0)return s.slice(st,i+1);} return ''; }
ok(/PM_PENDING_RECOVERY_MS\s*=\s*8000/.test(s),'quick recovery appears after 8s, not minutes');
const render=fn('paymobPendingRecoveryRender');
ok(/APPROVED/.test(render) && /confirmPayment\(\)/.test(render),'recovery explicitly requires terminal APPROVED and uses normal save path');
ok(/paymob_stuck_rescue/.test(render),'manual rescue is logged');
ok(!/\.add\(|setDoc|TEST_SALES/.test(render),'recovery never writes invoice directly');
const reset=fn('paymobResetActive');
ok(/paymobPendingRecoveryClear\(\)/.test(reset),'new transaction/reset clears stale recovery UI');
const watch=fn('paymobWatch');
ok(/paymobPendingRecoveryClear\(\)/.test(watch),'success/failure clears recovery UI');
ok(/clearTimeout\(_manualRecoveryT\)/.test(watch),'watch cleanup clears recovery timer');
ok(/cardLegToManual/.test(s) && /manual:\s*true/.test(s),'manual confirmation remains auditable, not fake approved');
ok(/if\(_confirmSaving\)/.test(s),'duplicate save guard still present');
ok(/if\(_saved && typeof paymobReset === 'function'\)/.test(s),'successful save still resets Paymob state for next sale');
ok(/store-apps-shell-v(?:38[6-9]|3[9]\d|[4-9]\d{2,})/.test(sw),'POS SW is v386 or newer');
console.log(`v386 delayed-webhook recovery: ${pass} passed, ${fail} failed`);
if(fail) throw new Error(`test-paymob-delayed-webhook-recovery-v386: ${fail} فحص فشل`);
