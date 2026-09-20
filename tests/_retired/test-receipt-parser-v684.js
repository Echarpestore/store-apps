'use strict';
const assert=require('node:assert/strict'), Module=require('module');
const orig=Module._load;
class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
Module._load=function(name,parent,isMain){
 if(name==='firebase-admin/firestore')return {getFirestore:()=>({}),FieldValue:{}};
 if(name==='firebase-admin/storage')return {getStorage:()=>({})};
 if(name==='firebase-functions/v2/https')return {onCall:(options,fn)=>fn,HttpsError};
 if(name==='firebase-functions/params')return {defineSecret:()=>({value:()=>''})};
 if(name==='google-auth-library')return {GoogleAuth:class{}};
 return orig.apply(this,arguments);
};
let insta;try{insta=require('../functions/instaEvidence')}finally{Module._load=orig;}
const {extractReceipt,autoCheck}=insta.__instaTest;
let passed=0;function check(name,fn){fn();passed++;console.log('OK',name);}
const date=Date.parse('2026-09-18T09:42:00+03:00');
const fixture=(amount='350.00 EGP',to='zogzog2000@instapay',time='18 Sep 2026 09:42 AM')=>`تم التحويل بنجاح\n${amount}\nمن\nsender@instapay\nإلى المحفظة الإلكترونية\nECHARPE RECIPIENT\n${to}\nالرقم المرجعي\n123456789012\nالتاريخ\n${time}\nملاحظة\nشكرا للتحويل`;
const cfg={alias:'zogzog2000@instapay'},meta={amountCents:35000,createdAt:date};
check('canonical receipt auto-matches same amount, recipient, reference and date',()=>assert.equal(autoCheck(fixture(),meta,cfg,.98).ok,true));
check('English EGP prefix and transaction reference',()=>{
 const text='Transaction successful\nEGP 350.00\nFrom\nsender@instapay\nTo account\nzogzog2000@instapay\nTransaction reference: 123456789012\n18 Sep 2026 09:42 AM\nThank you for transferring';
 const result=autoCheck(text,meta,cfg,.98);assert.equal(result.ok,true,JSON.stringify(result.checks));
});
check('Arabic digits accepted and amount label prioritized over fee',()=>{
 const text=fixture('المبلغ: ٣٥٠٫٠٠ جنيه\nالرسوم 0 EGP').replace('تم التحويل بنجاح','تمت عملية التحويل بنجاح');
 assert.equal(extractReceipt(text).amountCents,35000);assert.equal(autoCheck(text,meta,cfg,.98).ok,true);
});
check('24-hour clock matched if valid',()=>assert.equal(autoCheck(fixture('350.00 EGP','zogzog2000@instapay','18 Sep 2026 09:42'),meta,cfg,.98).ok,true));
check('wrong recipient rejected',()=>assert.equal(autoCheck(fixture('350.00 EGP','other@instapay'),meta,cfg,.98).checks.beneficiary,false));
check('sender alone is never the recipient',()=>{
 const text=fixture('350.00 EGP','other@instapay').replace('sender@instapay','zogzog2000@instapay');assert.equal(autoCheck(text,meta,cfg,.98).ok,false);
});
check('mismatched amount rejected',()=>assert.equal(autoCheck(fixture('351 EGP'),meta,cfg,.98).ok,false));
check('conflicting unlabeled amounts go to manual review',()=>assert.equal(extractReceipt(fixture('350 EGP\n450 EGP')).amountCents,null));
check('historical date rejected',()=>assert.equal(autoCheck(fixture('350 EGP','zogzog2000@instapay','17 Sep 2026 09:42 AM'),meta,cfg,.98).checks.date,false));
check('fuzzy OCR confidence never approves',()=>assert.equal(autoCheck(fixture(),meta,cfg,.87).ok,false));
check('missing reference never approves',()=>assert.equal(autoCheck(fixture().replace('123456789012','xxxxxxxxxxxx'),meta,cfg,.98).ok,false));
console.log('RECEIPT PARSER v684 '+passed+'/'+passed+' PASS (SYNTHETIC; NOT REAL RECEIPTS)');
