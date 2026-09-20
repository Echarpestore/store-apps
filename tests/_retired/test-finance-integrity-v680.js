'use strict';
// Real behavioural tests of pure validation, including adversarial tampering.
const {cents,validateCreditSale,validateInstaSale,validateBase}=require('../functions/financeIntegrity');
const assert=require('assert');
let passed=0;
function check(name, fn){fn();passed++;console.log('  ✓ '+name);}
function rejects(name,fn){check(name,()=>assert.throws(fn));}
const item={barcode:'A1',name:'طرح',qty:1,price:850};
const approved={phone:'01012345678',branch:'madinaty',amountCents:50000,invoiceTotalCents:85000};
const validCredit=()=>({invoiceCode:'FTM123456',branch:'madinaty',customerPhone:approved.phone,items:[{...item},{name:'رصيد',qty:1,price:-500,isCreditSpend:true}],payments:{cash:350,visa:0},total:350});
const validInsta=()=>({invoiceCode:'FTM123457',branch:'madinaty',customerPhone:'01012345678',items:[{...item}],payments:{instapay:850},total:850});
const is={branch:'madinaty',amountCents:85000,invoiceTotalCents:85000};
check('valid credit plus cash',()=>assert(validateCreditSale(validCredit(),approved)));
check('valid full InstaPay',()=>assert(validateInstaSale(validInsta(),is)));
check('valid negative return invoice with negative payment',()=>assert.equal(validateBase({invoiceCode:'FTRET123',branch:'madinaty',items:[{...item,price:-850,isReturn:true,fromInvoice:'FTM123457'}],total:-850,payments:{credit_return:-850}}).total,-85000));
rejects('reject NaN',()=>cents(NaN));rejects('reject absent amount',()=>cents(undefined));
rejects('reject fraction of piaster',()=>cents(.001));rejects('reject numeric infinity',()=>cents(Infinity));
rejects('reject tampered basket total',()=>{let x=validCredit();x.items[0].price=900;validateCreditSale(x,approved);});
rejects('reject under-reported cash',()=>{let x=validCredit();x.payments.cash=300;validateCreditSale(x,approved);});
rejects('reject fabricated credit line',()=>{let x=validCredit();x.items[1].price=-600;validateCreditSale(x,approved);});
rejects('reject duplicate credit line',()=>{let x=validCredit();x.items.push({...x.items[1]});x.total=-150;x.payments.cash=-150;validateCreditSale(x,approved);});
rejects('reject other negative reward lines',()=>{let x=validCredit();x.items[0].price=900;x.items.push({price:-50,qty:1,isRedemption:true});validateCreditSale(x,approved);});
rejects('reject refund hidden within credit sale',()=>{let x=validCredit();x.items[0].isReturn=true;validateCreditSale(x,approved);});
rejects('reject credit cashout',()=>{let x=validCredit();x.total=-10;x.payments.cash=-10;validateCreditSale(x,approved);});
rejects('reject cross-customer checkout',()=>{let x=validCredit();x.customerPhone='01000000000';validateCreditSale(x,approved);});
rejects('reject cross-branch checkout',()=>{let x=validCredit();x.branch='rehab';validateCreditSale(x,approved);});
rejects('reject concurrent InstaPay + credit',()=>{let x=validCredit();x.payments={instapay:350};validateCreditSale(x,approved);});
rejects('reject InstaPay split payment',()=>{let x=validInsta();x.payments={instapay:700,cash:150};validateInstaSale(x,is);});
rejects('reject InstaPay negative return',()=>{let x=validInsta();x.items[0].isReturn=true;validateInstaSale(x,is);});
rejects('reject InstaPay wrong amount',()=>{let x=validInsta();x.payments.instapay=849;validateInstaSale(x,is);});
rejects('reject InstaPay after total changed',()=>{let x=validInsta();x.total=800;x.items[0].price=800;x.payments.instapay=800;validateInstaSale(x,is);});
rejects('reject unsupported payment key',()=>{let x=validInsta();x.payments.fake=0;validateInstaSale(x,is);});
rejects('reject gift card sold with InstaPay',()=>{let x=validInsta();x.items[0].isGiftCard=true;validateInstaSale(x,is);});
rejects('reject invalid item qty',()=>{let x=validInsta();x.items[0].qty=1.5;validateInstaSale(x,is);});
console.log('FINANCE INTEGRITY '+passed+'/'+passed+' behavioural tests PASS');
