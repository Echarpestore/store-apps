const A=require('node:assert/strict');
const C=require('../functions/instapayCore');
const G=require('../feedback/instapay-scan-core');
const opts={amountCents:160000,aliases:['shop@instapay','01144155987'],windowMin:5,
  startedCivilMin:C.civilMinutes({y:2026,m:9,d:23,hh:14,mm:41})};
const receipt=`تم التحويل بنجاح
1,600 EGP
من
customer@instapay
إلى
shop@instapay
الرقم المرجعي
462046147040
التاريخ
23 Sep 2026 2:41 PM`;
let count=0;
function check(name,fn){fn();count++;console.log('PASS '+name);}
check('valid full receipt',()=>A.equal(C.inspectReceipt(receipt,opts).ok,true));
check('missing success never authorizes',()=>A.equal(C.inspectReceipt(receipt.replace('تم التحويل بنجاح',''),opts).ok,false));
check('failed wins even with a success phrase elsewhere',()=>A.equal(C.inspectReceipt(receipt+'\nfailed',opts).ok,false));
check('unsuccessful is not successful',()=>A.equal(C.checkSuccess('Unsuccessful transfer 1600 EGP'),false));
check('Arabic numeric datetime',()=>A.equal(C.inspectReceipt(receipt.replace('23 Sep 2026 2:41 PM','٢٣/٠٩/٢٠٢٦ ٢:٤١ م'),opts).ok,true));
check('ISO datetime',()=>A.equal(C.inspectReceipt(receipt.replace('23 Sep 2026 2:41 PM','2026-09-23 14:41'),opts).ok,true));
check('impossible date is unreadable',()=>A.equal(C.extractReceiptTime('31 Feb 2026 14:41'),null));
check('invalid 12-hour time is unreadable',()=>A.equal(C.extractReceiptTime('23 Sep 2026 15:41 PM'),null));
check('fees cannot match instead of transfer amount',()=>{
  const r=receipt.replace('1,600 EGP','1,600 EGP\nمبلغ التحويل\n5 EGP\nرسوم التحويل');
  A.equal(C.inspectReceipt(r,opts).ok,true);
  A.equal(C.inspectReceipt(r,{...opts,amountCents:500}).ok,false);
});
check('English label before amount with separate fees',()=>{
  A.deepEqual(C.extractAmountCents('Transfer amount\n1600 EGP\nFees\n5 EGP'),[160000]);
});
check('ambiguous unlabelled amounts never select the expected one',()=>{
  A.equal(C.inspectReceipt(receipt.replace('1,600 EGP','1600 EGP\n1800 EGP'),opts).ok,false);
});
check('pre-v707 accumulated success is not trusted after upgrade',()=>{
  const r=C.mergeReading({reference:'462046147040',success:true,amount:true,time:true,beneficiary:true},inspect(receipt.replace('تم التحويل بنجاح','')));
  A.equal(r.success,false);
});
check('spaced labelled reference',()=>A.equal(C.extractReference('رقم العملية: 4620 4614 7040'),'462046147040'));
check('phone and unlabelled account are not references',()=>A.equal(C.extractReference('+201144155987\nAccount 462046147040'),null));
check('conflicting references fail closed',()=>A.equal(C.extractReference('Reference 462046147040\nTransaction ID 462046147041'),null));
check('international recipient exact',()=>A.equal(C.checkBeneficiary('To: +20 114 415 5987\nReference 462046147040',opts.aliases).ok,true));
check('sender-only alias does not pass',()=>A.equal(C.checkBeneficiary('From: shop@instapay\nTo: other@instapay',opts.aliases).ok,false));
check('alias substring does not pass',()=>A.equal(C.checkBeneficiary('To: badshop@instapay',opts.aliases).ok,false));
check('truncated alias does not pass',()=>A.equal(C.checkBeneficiary('To: shop',opts.aliases).ok,false));
check('notes do not establish recipient',()=>A.equal(C.checkBeneficiary('To: other@instapay\nNote\nshop@instapay',opts.aliases).ok,false));
check('reference digits cannot establish recipient',()=>A.equal(C.checkBeneficiary('To: other@instapay\nReference 01144155987',opts.aliases).ok,false));
check('missing To remains unreadable',()=>A.equal(C.checkBeneficiary('shop@instapay',opts.aliases).ok,false));
check('one wrong phone digit never auto-corrected',()=>A.equal(C.checkBeneficiary('To: 01144155988',opts.aliases).ok,false));
function inspect(t){return C.inspectReceipt(t,opts);}
check('same reference accumulates missing fields',()=>{
  const first=C.mergeReading({},inspect(receipt.replace('1,600 EGP','')));
  const last=C.mergeReading(first,inspect(receipt.replace('تم التحويل بنجاح','')));
  A.equal(last.success&&last.amount&&last.time&&last.beneficiary,true);
});
check('unbound frame cannot donate fields',()=>{
  const first=C.mergeReading({},inspect(receipt.replace('1,600 EGP','')));
  A.equal(C.mergeReading(first,inspect('تم التحويل بنجاح\n1600 EGP')).amount,false);
});
check('different reference resets evidence',()=>{
  const first=C.mergeReading({},inspect(receipt));
  const last=C.mergeReading(first,inspect(receipt.replace('462046147040','462046147041').replace('1,600 EGP','')));
  A.equal(last.amount,false);
});
check('contradiction cannot borrow green amount',()=>{
  const first=C.mergeReading({},inspect(receipt));
  A.equal(C.mergeReading(first,inspect(receipt.replace('1,600','1,800'))).amount,false);
});
check('one OCR mismatch is retryable; two matching observations confirm it',()=>{
  const bad=inspect(receipt.replace('1,600','1,800'));
  const a=C.rejectionEvidence(bad,null);A.equal(a.confirmed,false);
  A.equal(C.rejectionEvidence(bad,a).confirmed,true);
  A.equal(C.rejectionEvidence(inspect(receipt),a).confirmed,false);
});
check('different receipt cannot confirm a mismatch',()=>{
  const a=C.rejectionEvidence(inspect(receipt.replace('1,600','1,800')),null);
  A.equal(C.rejectionEvidence(inspect(receipt.replace('1,600','1,800').replace('462046147040','462046147041')),a).confirmed,false);
});
check('landscape sensor crop matches portrait preview frame',()=>{
  A.deepEqual(G.cropRect(1920,1080,450,600,.06),{sx:604,sy:65,sw:713,sh:950});
});
check('portrait sensor crop remains centered',()=>A.deepEqual(G.cropRect(1080,1920,450,600,.06),{sx:65,sy:326,sw:950,sh:1267}));
check('zero-size video has no crop',()=>A.equal(G.cropRect(0,0,450,600,.06),null));
check('blank frame filtered',()=>A.equal(G.quality(new Uint8Array(96*128).fill(120),96,128).contrast,0));
check('old success=true alone cannot disable mirror detection',()=>A.equal(G.hasReading({success:true},{}),false));
check('actual extracted amount counts as reading',()=>A.equal(G.hasReading({}, {seenCents:[160000]}),true));
console.log('InstaPay scan v707: '+count+' behavioral checks passed');
