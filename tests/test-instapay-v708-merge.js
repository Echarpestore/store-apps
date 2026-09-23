/* 🧪 v708 — مراجعة حزمة ChatGPT v707 (إنستاباي)
   1) بديل عبارة النجاح: لقطتين «نضاف» ورا بعض بنفس الرقم المرجعي = نجاح.
      لقطة واحدة، أو رقمين مختلفين، أو أي كلمة فشل/جاري، أو شاشة تأكيد = لأ.
   2) العنوان المقصوص «zogzog2000@» (كان شغال قبل v707 واتكسر فيها). */
'use strict';
const path = require('path');
const C = require(path.join(__dirname, '..', 'functions', 'instapayCore.js'));
let pass = 0, fail = 0;
const t = (n, fn) => { try{ fn(); pass++; console.log('  ✅ ' + n); }catch(e){ fail++; console.log('  ❌ ' + n + ' → ' + e.message); } };
const ok = (c, m) => { if(!c) throw Error(m || 'fail'); };

const ALIASES = ['zogzog2000@instapay', '01144155987'];
const EXP = { amountCents: 1000, windowMin: 30, aliases: ALIASES,
  startedCivilMin: Date.UTC(2026, 8, 23, 2, 0) / 60000 };
// نفس إيصال الفرع — من غير سطر «تمت العملية بنجاح» (الكاميرا ضيّعته)
const body = (ref, extra) => (extra || '') + ' 10 EGP المبلغ المحول من MOHAMED REDA elsamarkady@instapay إلى انستاباي AHMED R*** zogzog2000@instapay'
  + '\nالرقم المرجعي ' + ref + '\nالتاريخ 23 Sep 2026 02:01 AM';
const scan = (prev, text) => C.mergeReading(prev, C.inspectReceipt(text, EXP));
const accepted = (m) => !!(m.success && m.amount && m.time && m.beneficiary && m.reference);

console.log('\n🟡 بديل عبارة النجاح');
t('لقطة واحدة من غير العبارة = لسه مش مقبول', () => {
  const m = scan(null, body('803683947330'));
  ok(!accepted(m) && m.cleanRun === 1, JSON.stringify(m));
});
t('🔴 لقطتين نضاف بنفس الرقم = مقبول (successBy=twoCleanFrames)', () => {
  const m = scan(scan(null, body('803683947330')), body('803683947330'));
  ok(accepted(m) && m.successBy === 'twoCleanFrames', JSON.stringify(m));
});
t('🔴 لقطتين برقمين مرجعيين مختلفين = مش مقبول', () => {
  const m = scan(scan(null, body('803683947330')), body('803683947999'));
  ok(!accepted(m) && m.cleanRun === 1, JSON.stringify(m));
});
t('🔴 «جاري التحويل» عمره ما يعدّي', () => {
  let m = null; for(let i = 0; i < 4; i++) m = scan(m, body('803683947330', 'جاري التحويل'));
  ok(!accepted(m), JSON.stringify(m));
});
t('🔴 شاشة «تأكيد التحويل» عمرها ما تعدّي بالبديل', () => {
  let m = null; for(let i = 0; i < 4; i++) m = scan(m, body('803683947330', 'تأكيد التحويل'));
  ok(!accepted(m) && m.cleanRun === 0, JSON.stringify(m));
});
t('🔴 مبلغ مختلف في اللقطة التانية = العدّاد يرجع صفر', () => {
  const bad = body('803683947330').replace('10 EGP', '100 EGP');
  const m = scan(scan(null, body('803683947330')), bad);
  ok(!accepted(m) && m.cleanRun === 0, JSON.stringify(m));
});
t('🔴 نجاح البديل مبيتورّثش: لقطة تالتة مش نضيفة = مش مقبول', () => {
  let m = scan(scan(null, body('803683947330')), body('803683947330'));
  m = scan(m, body('803683947330').replace('02:01 AM', '09:01 AM'));   // وقت برّه النافذة
  ok(!accepted(m) && m.successBy === null, JSON.stringify(m));
});
t('العبارة لوحدها لسه شغالة من أول لقطة (successBy=phrase)', () => {
  const m = scan(null, body('803683947330', 'تمت العملية بنجاح'));
  ok(accepted(m) && m.successBy === 'phrase', JSON.stringify(m));
});

console.log('\n✂️ العنوان المقصوص');
const rc = (to) => 'تمت العملية بنجاح 10 EGP من elsamarkady@instapay إلى انستاباي AHMED ' + to + '\nالمرجع 803683947330';
t('🔴 «zogzog2000@» = عنواننا', () => ok(C.checkBeneficiary(rc('zogzog2000@'), ALIASES).ok));
t('العنوان كامل لسه شغال', () => ok(C.checkBeneficiary(rc('zogzog2000@instapay'), ALIASES).ok));
t('🔴 نفس الاسم بدومين تاني = مرفوض', () => ok(!C.checkBeneficiary(rc('zogzog2000@evilpay'), ALIASES).ok));
t('🔴 اسم أطول بيبدأ بنفس الحروف = مرفوض', () => ok(!C.checkBeneficiary(rc('zogzog20001@'), ALIASES).ok));
t('🔴 العنوان في ناحية «من» مش بيتحسب', () => {
  const r = C.checkBeneficiary('تمت العملية بنجاح من zogzog2000@ إلى انستاباي AHMED other@instapay\nالمرجع 1', ALIASES);
  ok(!r.ok, JSON.stringify(r));
});

console.log('\n' + (fail ? '❌' : '✅') + ' test-instapay-v708-merge: ' + pass + ' ناجح · ' + fail + ' فاشل');
if(typeof assert === 'function') assert(fail === 0, 'test-instapay-v708-merge: ' + fail + ' فشل');
else if(fail) process.exitCode = 1;
