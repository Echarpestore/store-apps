/* 🧪 المستفيد في إيصال إنستاباي — المطابقة والرفض النهائي (23-09)
   السبب: رفض «التحويل مش للفرع — المستفيد مختلف» كان بيطلع على تحويلات سليمة.
   سببين: (1) الرقم في الإيصال بشكل دولي (+20…) والمطابقة نصية، (2) الرفض النهائي
   كان بيحصل حتى لو سطر «إلى» نفسه مش مقروء في اللقطة.
   كل فحص هنا بيشغّل الدوال الحقيقية على نص إيصال. */
'use strict';
const path = require('path');
const C = require(path.join(__dirname, '..', 'functions', 'instapayCore.js'));
let pass = 0, fail = 0;
const t = (n, fn) => { try{ fn(); pass++; console.log('  ✅ ' + n); }catch(e){ fail++; console.log('  ❌ ' + n + ' → ' + e.message); } };
const ok = (c, m) => { if(!c) throw Error(m || 'fail'); };

const ALIASES = ['zogzog2000@instapay', '01144155987'];
const receipt = (to) => 'تمت العملية بنجاح 10 EGP المبلغ المحول من MOHAMED REDA MORSY YOUNES '
  + 'elsamarkady@instapay إلى انستاباي AHMED R*** M**** Y***** ' + to
  + ' المرجع 803683947330 التاريخ 23 Sep 2026 02:01 AM';

console.log('\n👤 مطابقة المستفيد');
t('🔴 الرقم المحلي زي ما هو', () => ok(C.checkBeneficiary(receipt('01144155987'), ALIASES).ok));
t('🔴 الرقم بالشكل الدولي +20 (كان بيترفض)', () => {
  const r = C.checkBeneficiary(receipt('+201144155987'), ALIASES);
  ok(r.ok, 'reason=' + r.reason);
});
t('🔴 الرقم بـ0020 (كان بيترفض)', () => ok(C.checkBeneficiary(receipt('00201144155987'), ALIASES).ok));
t('🔴 الرقم بمسافات 0114 415 5987', () => ok(C.checkBeneficiary(receipt('0114 415 5987'), ALIASES).ok));
t('🔴 الأرقام الهندية ٠١١٤٤١٥٥٩٨٧', () => ok(C.checkBeneficiary(receipt('٠١١٤٤١٥٥٩٨٧'), ALIASES).ok));
t('العنوان بالحروف بيعدّي زي ما هو', () => ok(C.checkBeneficiary(receipt('zogzog2000@instapay'), ALIASES).ok));
t('العنوان واللاحقة اتقصت (zogzog2000@)', () => ok(C.checkBeneficiary(receipt('zogzog2000@'), ALIASES).ok));

console.log('\n🔒 اللي لازم يفضل مرفوض');
t('رقم تاني خالص = مرفوض', () => {
  const r = C.checkBeneficiary(receipt('01000000000'), ALIASES);
  ok(!r.ok && r.reason === 'ALIAS_NOT_FOUND', JSON.stringify(r));
});
t('رقم قريب بخانة واحدة = مرفوض', () => ok(!C.checkBeneficiary(receipt('01144155988'), ALIASES).ok));
t('عنوان الفرع في ناحية «من» = تحويل صادر مرفوض', () => {
  const txt = 'تمت العملية بنجاح 10 EGP من 01144155987 إلى انستاباي MONA 01000000000 المرجع 80368';
  const r = C.checkBeneficiary(txt, ALIASES);
  ok(!r.ok && r.reason === 'ALIAS_IS_SENDER', JSON.stringify(r));
});
t('مفيش عناوين متسجلة = مرفوض بسبب واضح', () => {
  ok(C.checkBeneficiary(receipt('01144155987'), []).reason === 'NO_ALIAS_CONFIGURED');
});

console.log('\n📸 سطر «إلى» مش مقروء ← مش رفض نهائي');
t('🔴 لقطة من غير سطر «إلى» بتتعلّم sawTo=false', () => {
  const cut = 'تمت العملية بنجاح 10 EGP AHMED R*** M**** 01000000000 المرجع 803683947330';
  const r = C.checkBeneficiary(cut, ALIASES);
  ok(!r.ok && r.sawTo === false, JSON.stringify(r));
});
t('🔴 لقطة فيها سطر «إلى» وعنوان تاني ← sawTo=true (رفض نهائي مسموح)', () => {
  const r = C.checkBeneficiary(receipt('01000000000'), ALIASES);
  ok(r.sawTo === true, JSON.stringify(r));
});
t('inspectReceipt بيمرّر beneficiarySawTo للسيرفر', () => {
  const v = C.inspectReceipt(receipt('01000000000'), { amountCents: 1000, windowMin: 5, startedCivilMin: 0, aliases: ALIASES });
  ok(v.beneficiarySawTo === true, 'الحقل مش موجود');
  const v2 = C.inspectReceipt('تمت العملية بنجاح 10 EGP المرجع 803683947330', { amountCents: 1000, windowMin: 5, startedCivilMin: 0, aliases: ALIASES });
  ok(v2.beneficiarySawTo === false, 'المفروض false من غير سطر إلى');
});
t('🔴 السيرفر مبيرفضش نهائي إلا لو شاف سطر «إلى»', () => {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'functions', 'instapay.js'), 'utf8');
  ok(/ALIAS_NOT_FOUND' && v\.beneficiarySawTo/.test(src), 'شرط sawTo مش في الرفض النهائي');
  ok(/المفروض لـ/.test(src), 'الرسالة مش بتقول العنوان المطلوب');
});

console.log('\n🤏 قراية مش مضبوطة (خانة واحدة) ← للكاشير مش رفض');
t('🔴 رقم بخانة غلط = ALIAS_NEAR مش ALIAS_NOT_FOUND', () => {
  const r = C.checkBeneficiary(receipt('01144155981'), ALIASES);   // آخر خانة 7→1
  ok(r.reason === 'ALIAS_NEAR', JSON.stringify(r));
  ok(!r.ok, 'المفروض مايعديش كمان');
});
t('🔴 الرقم اللي اتقرا بيترجع للتشخيص', () => {
  const r = C.checkBeneficiary(receipt('01000000000'), ALIASES);
  ok(r.seen && r.seen.length, 'مفيش أرقام متسجلة');
});
t('🔴 السيرفر مبيرفضش من أول لقطة (scans ≥ 2)', () => {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'functions', 'instapay.js'), 'utf8');
  ok(/\(s\.scans \|\| 0\) >= 2/.test(src), 'شرط اللقطة التانية مش موجود');
  ok(/ALIAS_NEAR'\) \? 'رقم المستفيد مش واضح/.test(src), 'رسالة القراية المش واضحة مش موجودة');
  ok(/قرينا ' \+ v\.beneficiarySeen\[0\]/.test(src), 'الرفض مش بيقول الرقم اللي اتقرا');
});

console.log('\n' + (fail ? '❌' : '✅') + ' test-instapay-beneficiary: ' + pass + ' ناجح · ' + fail + ' فاشل');
if(typeof assert === 'function') assert(fail === 0, 'test-instapay-beneficiary: ' + fail + ' فحص فشل');
else if(fail) process.exitCode = 1;
