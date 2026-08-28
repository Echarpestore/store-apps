const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(cond, msg){ if(cond){ pass++; } else { fail++; console.error('FAIL:', msg); } }
function eq(a,b,msg){ ok(JSON.stringify(a)===JSON.stringify(b), msg + ' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }

const ROOT = path.join(__dirname, '..');
const sale = fs.readFileSync(path.join(ROOT,'pos','pos-sale.js'),'utf8');
const fn = fs.readFileSync(path.join(ROOT,'functions','index.js'),'utf8');
const sw = fs.readFileSync(path.join(ROOT,'pos','sw.js'),'utf8');

function extractFunction(src, name){
  const start = src.indexOf('function ' + name + '(');
  if(start < 0) return '';
  const brace = src.indexOf('{', start);
  let depth = 0;
  for(let i=brace;i<src.length;i++){
    if(src[i]==='{') depth++;
    else if(src[i]==='}'){
      depth--;
      if(depth===0) return src.slice(start, i+1);
    }
  }
  return '';
}

const rankFn = extractFunction(fn, 'paymobStatusRank');
const keepFn = extractFunction(fn, 'paymobShouldKeepCurrentStatus');
ok(rankFn && keepFn, 'backend monotonic status helpers exist');
if(rankFn && keepFn){
  const ctx = { String };
  vm.createContext(ctx);
  vm.runInContext(rankFn + '\n' + keepFn, ctx);
  eq(vm.runInContext("paymobShouldKeepCurrentStatus('success','pending')",ctx), true,
    'late pending cannot regress success');
  eq(vm.runInContext("paymobShouldKeepCurrentStatus('success','failed')",ctx), true,
    'late failed cannot regress success');
  eq(vm.runInContext("paymobShouldKeepCurrentStatus('pending','success')",ctx), false,
    'success can advance pending');
  eq(vm.runInContext("paymobShouldKeepCurrentStatus('failed','success')",ctx), false,
    'later success can advance failed if bank finalizes');
  eq(vm.runInContext("paymobShouldKeepCurrentStatus('success','success')",ctx), false,
    'same status can enrich transaction details');
}

ok(/db\.runTransaction\(async \(tx\) =>/.test(fn), 'webhook update is atomic');
ok(/paymobShouldKeepCurrentStatus\(prevStatus, status\)/.test(fn), 'webhook compares old and incoming status');
ok(/lastIgnoredStatus:\s*status/.test(fn), 'late callback is logged for diagnosis');
ok(/lastIgnoredDiagnostic:\s*diagnostic/.test(fn), 'late callback diagnostic is preserved');
ok(/tx\.set\(txnRef, incoming, \{ merge: true \}\)/.test(fn), 'normal/newer callback still updates payment doc');

const watch = extractFunction(sale, 'paymobWatch');
ok(/const _paidCentsReady = Number\(d\.amountCents\)/.test(watch), 'POS validates success amount before finalizing');
ok(/!Number\.isFinite\(_paidCentsReady\) \|\| _paidCentsReady <= 0/.test(watch), 'missing success amount is treated as incomplete');
ok(/بنستنى تفاصيل التأكيد/.test(watch), 'cashier gets explicit waiting message');
ok(/return false;[\s\S]{0,180}paymobApproved = true/.test(watch), 'incomplete success keeps watcher alive before approved flag');
ok(/paymobCanAutoFinish\(amountEGP, d, orderRef\)/.test(watch), 'normal complete success still auto-finishes and prints');
ok(sw.includes("store-apps-shell-v374"), 'POS service worker bumped to v374');

console.log(`v374 Paymob PIN auto-print: ${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
