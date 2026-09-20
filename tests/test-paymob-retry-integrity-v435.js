require('./helpers/swv');   // إصدار الكاش ≥ N بدل رقم مثبّت
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname,'../pos/pos-sale.js'),'utf8');
let pass=0, fail=0;
function ok(name, cond){ if(cond){ console.log('PASS',name); pass++; } else { console.error('FAIL',name); fail++; } }
ok('v435 fast path documented', src.includes('Fast path: العملية وصلت Success كاملة بالفعل'));
ok('normal complete approved leg needs no server check', src.includes("return leg.status === 'manual' || !t.transactionId || !(Number(t.amountCents) > 0);"));
ok('failed server status invalidates leg', src.includes("d.status === 'failed' || d.status === 'voided' || d.status === 'refunded'"));
ok('failed attempt txn is cleared', src.includes("leg.status = 'failed'; leg.txn = null; invalid++;"));
ok('failed attempts removed before retry/save', src.includes("filter(function(l){ return l && l.status !== 'failed'; })"));
ok('amount mismatch blocks wrong linkage', src.includes("mismatches++; invalid++;"));
ok('pre-save guard blocks invalid invoice', src.includes("if(_pmSafe && _pmSafe.invalid)"));
ok('short suspicious-only timeout', src.includes('paymobReconcileCardTxnsBeforeSale(1200)'));
ok('retry order ref remains unique', src.includes("const orderRef = currentBranch + '-' + Date.now();"));
ok('manual recovery retained', src.includes("leg.status = 'manual';"));
// v710: زرار الإنقاذ بعد 8ث (pmPendingApprovedBtn · v386) اتقفل بقرار المالك 20-09 — مش هيرجع.
ok('rescue button stays removed (owner decision)', !src.includes('pmPendingApprovedBtn'));
ok('idempotent success guard retained', src.includes('if(paymobApproved) return true;'));
const sw=fs.readFileSync(path.join(__dirname,'../pos/sw.js'),'utf8');
ok('SW bumped v435', swAtLeast(sw, 435));
console.log(`\n${pass}/${pass+fail} PASS`); process.exit(fail?1:0);
