const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname,'../pos/pos-sale.js'),'utf8');
function ok(v,m){ if(!v) throw new Error(m); console.log('PASS',m); }
ok(src.includes('async function paymobReconcileCardTxnsBeforeSale'), 'pre-save reconciler exists');
ok(src.includes("doc(String(leg.ref)).get({ source:'server' })"), 'reads exact Paymob order from server');
ok(src.includes("if(d.status !== 'success') return"), 'only accepts successful bank result');
ok(src.includes('got !== want'), 'requires exact amount match');
ok(src.includes('transactionId:d.transactionId || oldTxn.transactionId || null'), 'refreshes transaction id from latest server doc');
ok(src.includes("_logActivity('paymob_txn_id_reconciled'"), 'audits changed transaction id');
ok(src.includes('await paymobReconcileCardTxnsBeforeSale(1200)'), 'reconciles suspicious card state immediately before sale write');
ok(src.includes('الشبكة لا تحبس الكاشير'), 'network failure does not block sale');
const sw=fs.readFileSync(require('path').join(__dirname,'../pos/sw.js'),'utf8');
ok(/store-apps-shell-v43[45]/.test(sw),'POS service worker is v434 or newer');
console.log('9/9 PASS');
