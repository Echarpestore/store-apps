'use strict';
// Static integration guards, not a replacement for Firestore Emulator or real-device acceptance.
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(R,p),'utf8');
const credit=read('functions/financeCheckout.js'),insta=read('functions/instaEvidence.js');
const pos=read('pos/pos-sale.js'),bridge=read('pos/finance-pos.js'),tablet=read('feedback/finance-tablet.js');
const old=read('functions/giftCredit.js'),rules=read('security/firestore-phase2.rules'),office=read('Office/finance-office.js');
const guards=[
 ['legacy debit disabled', /exports\.creditSpend[\s\S]{0,650}throw new HttpsError\('failed-precondition'/.test(old)],
 ['PIN secret declared', /defineSecret\('CREDIT_PIN_PEPPER'\)/.test(credit)],
 ['PIN callable secret attached for submit', /exports\.creditPinSubmit=callable\([\s\S]*?\n\},true\);/.test(credit)],
 ['PIN callable secret attached for statement', /exports\.creditCustomerStatement=callable\([\s\S]*?\n\},true\);/.test(credit)],
 ['PIN six digits', /\^\\d\{6\}\$/.test(credit)],
 ['PIN digest scrypt', /crypto\.scryptSync/.test(credit)],
 ['PIN held off cashier', /financeCreditAuthorize/.test(read('pos/credit-ui.js')) && !/creditPinSubmit/.test(bridge)],
 ['tablet handles PIN', /creditPinSubmit/.test(tablet)],
 ['ledger spend and invoice atomic transaction', /creditFinalizeSale=callable[\s\S]*?runTransaction[\s\S]*?tx\.create\(inv,[\s\S]*?tx\.create\(db\(\)\.collection\('credit_ledger'\)/.test(credit)],
 ['returns use atomic transaction', /creditReturnFinalizeSale=callable[\s\S]*?runTransaction[\s\S]*?tx\.create\(inv,[\s\S]*?tx\.create\(ledger/.test(credit)],
 ['credit receipt not spending token', /financeLookupCreditReceipt=callable/.test(credit) && !/creditFinalizeSale[\s\S]*?receiptRef/.test(credit.slice(credit.indexOf('exports.creditFinalizeSale'),credit.indexOf('exports.creditReturnFinalizeSale')))],
 ['server prevents repeated InstaPay references', /instapay_references/.test(insta) && /tx\.create\(ref,/.test(insta)],
 ['bank status pending until owner reconciliation', /PENDING_BANK_RECONCILIATION/.test(insta) && /instaReconcile=fn/.test(insta)],
 ['manual approval linked to photo', /instaManualApprove=fn[\s\S]*?!doc\.data\(\)\.photoPath/.test(insta)],
 ['cashier cannot self publish ledger', /match \/credit_ledger\/\{entryId\}[\s\S]{0,250}allow create, update, delete: if false/.test(rules)],
 ['finance rules deny direct client operations', /match \/instapay_references\/\{id\} \{ allow read, write: if false; \}/.test(rules)],
 ['POS finance write gated', /window\.financeSaleWrite\(_salePayload\)/.test(pos)],
 ['Office reconciliation UI exists', /instaReconcile/.test(office)],
 ['tablet remains feedback page', /finance-tablet\.js/.test(read('feedback/index.html'))],
];
for(const [name,pass] of guards)global.assert?global.assert(pass,'FINANCE '+name):(()=>{if(!pass)throw Error(name);})();
console.log('FINANCE '+guards.filter(x=>x[1]).length+'/'+guards.length+' static integration guards pass (not live validation)');
