'use strict';
// Negative source guards for v681 protections; companion to transaction mock.
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const credit=read('functions/financeCheckout.js'),insta=read('functions/instaEvidence.js');
const rules=read('security/firestore-phase2.rules');
let passed=0;
function check(label,condition){assert(condition,label);passed++;if(global.assert)global.assert(condition,'v681 '+label);}
check('PIN approval captures version',credit.includes('approvedPinVersion:pinNow.data().version'));
check('PIN reset checked again in final spending transaction',credit.includes('pin.data().version!==s.approvedPinVersion'));
check('invoice dedupe shared between credit and InstaPay',credit.includes("collection('finance_invoice_keys')")&&insta.includes("collection('finance_invoice_keys')"));
check('return dedupe uses global invoice key too',credit.includes("tx.create(invoiceKey,{invoiceCode:code,sessionId:null,kind:'credit_return'"));
check('invoice keys locked against direct access',/match \/finance_invoice_keys\/\{id\}\s*\{\s*allow read, write: if false/.test(rules));
check('InstaPay photo upload cannot overwrite concurrent capture',insta.includes("latest.data().status!=='pending'"));
check('stale OCR cannot overwrite approved session',insta.includes("current.data().status!=='reading'||current.data().photoPath!==path"));
const orders=rules.slice(rules.indexOf('match /online_orders/{id}'));
check('direct anonymous online order creation denied',/allow create: if false;/.test(orders));
for(const app of ['loyalty','glow']){
 const page=read(app+'/index.html'),start=page.indexOf('function shopSubmit'),end=page.indexOf('window.shopSubmit = shopSubmit;',start),body=page.slice(start,end);
 check(app+' only sends checkout through Cloud Function',body.includes("httpsCallable('onlineOrderPlace')")&&!/\.add\(doc\)/.test(body));
 check(app+' rejects uncertain outcomes without clearing cart',body.includes('راجعي أوردراتك قبل إعادة المحاولة')&&body.indexOf('}).then(function(doc){')>body.indexOf('httpsCallable'));
}
console.log('FINANCE HARDENING v681 '+passed+'/'+passed+' PASS (static guards, not live tests)');
