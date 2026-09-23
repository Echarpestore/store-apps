/* 🧪 اختبارات قراءة إيصال إنستاباي — منهجية الاختبار السلبي:
   لكل حماية، اختبار بيثبت إنها **بترفض** لما تتكسر. */
const C = require('../functions/instapayCore.js');

// نص الإيصال الحقيقي زي ما Vision بيرجّعه (العيّنة المصوّرة)
const REAL = `تم التحويل بنجاح
1,600 EGP
مبلغ التحويل
من
zogzog2000@instapay
CIB BANK TO TRUST
ACCOUNT XXXX6818
إلى المحفظه الالكترونية
Nada N T******
01105822087
الرقم المرجعي
462046147040
التاريخ
14 Sep 2026 11:42 PM
ملاحظة
مصاريف المعيشة
POWERED BY IPN`;

// إيصال بالشكل اللي هيوصلنا فعلًا: العميلة بتحوّل **لينا**
const TO_US = REAL
  .replace('من\nzogzog2000@instapay', 'من\nsara.m@instapay')
  .replace('إلى المحفظه الالكترونية\nNada N T******\n01105822087',
           'إلى\nzogzog2000@instapay\nECHARPE');

const START = C.civilMinutes({ y: 2026, m: 9, d: 14, hh: 23, mm: 41 });
const base = { amountCents: 160000, windowMin: 5, startedCivilMin: START, aliases: ['zogzog2000@instapay'] };

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { fail++; console.log('  ❌ ' + name + ' → ' + e.message); }
}
function eq(a, b, m) { if (a !== b) throw Error((m || '') + ' توقعنا ' + JSON.stringify(b) + ' وجه ' + JSON.stringify(a)); }

console.log('\n🧾 قراءة الحقول');
t('المبلغ بيتقرا بالقروش', () => eq(C.extractAmountCents(REAL).includes(160000), true));
t('رقم الموبايل مش بيتقرا كمبلغ', () => eq(C.extractAmountCents(REAL).includes(110582208700), false));
t('الرقم المرجعي', () => eq(C.extractReference(REAL), '462046147040'));
t('رقم الموبايل مش بيتقرا كرقم مرجعي', () => eq(C.extractReference('01105822087 فقط'), null));
t('التاريخ والوقت 12 ساعة PM', () => {
  const r = C.extractReceiptTime(REAL);
  eq(r.y, 2026); eq(r.m, 9); eq(r.d, 14); eq(r.hh, 23); eq(r.mm, 42);
});
t('12:30 AM بتبقى منتصف الليل', () => eq(C.extractReceiptTime('1 Jan 2026 12:30 AM').hh, 0));
t('الأرقام الهندية بتتطبّع', () => eq(C.extractAmountCents('١٦٠٠ EGP').includes(160000), true));

console.log('\n🟢 الحالة الناجحة');
t('إيصال سليم بيعدّي', () => eq(C.inspectReceipt(TO_US, base).ok, true));
t('كل الحقول خضرا', () => {
  const c = C.inspectReceipt(TO_US, base).checks;
  eq(c.success && c.amount && c.reference && c.time && c.beneficiary, true);
});

console.log('\n🔴 اختبارات سلبية — كل واحد لازم يرفض');
t('مبلغ مختلف يترفض', () => eq(C.inspectReceipt(TO_US, { ...base, amountCents: 150000 }).ok, false));
t('إيصال قيد التنفيذ يترفض', () =>
  eq(C.inspectReceipt(TO_US.replace('تم التحويل بنجاح', 'جاري تنفيذ التحويل'), base).checks.success, false));
t('إيصال فشل يترفض', () =>
  eq(C.inspectReceipt(TO_US.replace('تم التحويل بنجاح', 'فشل التحويل'), base).ok, false));
t('تحويل لحد تاني يترفض', () =>
  eq(C.inspectReceipt(TO_US.replace('zogzog2000@instapay\nECHARPE', 'someone.else@instapay'), base).checks.beneficiary, false));
t('إيصال احنا المرسلين فيه يترفض', () => {
  const r = C.inspectReceipt(REAL, base);
  eq(r.checks.beneficiary, false);
  eq(r.beneficiaryReason, 'ALIAS_IS_SENDER');
});
t('إيصال قديم (ساعة فاتت) يترفض', () =>
  eq(C.inspectReceipt(TO_US, { ...base, startedCivilMin: START + 60 }).checks.time, false));
t('إيصال بعد النافذة بدقيقة يترفض', () =>
  eq(C.inspectReceipt(TO_US, { ...base, startedCivilMin: START - 6 }).checks.time, false));
t('تحويل قبل الطلب بـ37 دقيقة يعدّي (نافذة 40)', () =>
  eq(C.inspectReceipt(TO_US, { ...base, windowMin: 40, startedCivilMin: START + 37 }).checks.time, true));
t('تحويل قبل الطلب بـ41 دقيقة يترفض (نافذة 40)', () =>
  eq(C.inspectReceipt(TO_US, { ...base, windowMin: 40, startedCivilMin: START + 42 }).checks.time, false));
t('إيصال إمبارح يترفض مهما كانت النافذة', () =>
  eq(C.inspectReceipt(TO_US, { ...base, windowMin: 60, startedCivilMin: START + 1440 }).checks.time, false));
t('إيصال جوّه النافذة بالظبط يعدّي', () =>
  eq(C.inspectReceipt(TO_US, { ...base, startedCivilMin: START - 4 }).checks.time, true));

console.log('\n⏱️ النافذة في الاتجاهين');
t('إيصال من 4 دقايق قبل الطلب يعدّي', () =>
  eq(C.inspectReceipt(TO_US, { ...base, startedCivilMin: START + 4 }).checks.time, true));
t('37 دقيقة قبل الطلب ونافذة 40 يعدّي', () =>
  eq(C.inspectReceipt(TO_US, { ...base, windowMin: 40, startedCivilMin: START + 37 }).checks.time, true));
t('سلبي: 41 دقيقة قبل ونافذة 40 يترفض', () =>
  eq(C.inspectReceipt(TO_US, { ...base, windowMin: 40, startedCivilMin: START + 42 }).checks.time, false));
t('سلبي: 6 دقايق قبل ونافذة 5 يترفض', () =>
  eq(C.inspectReceipt(TO_US, { ...base, startedCivilMin: START + 7 }).checks.time, false));
t('مفيش عنوان متسجّل = رفض مش قبول', () =>
  eq(C.inspectReceipt(TO_US, { ...base, aliases: [] }).checks.beneficiary, false));
t('رقمين مرجعيين محتملين = مبنخمّنش', () =>
  eq(C.extractReference('123456789012 و 987654321098'), null));
t('نص فاضي يترفض', () => eq(C.inspectReceipt('', base).ok, false));

console.log('\n⛔ تصنيف الرفض: نهائي ولا مؤقت');
// نفس منطق الدالة: نهائي = قرينا الحقل فعلًا ولقيناه غلط
function classify(text, exp){
  const v = C.inspectReceipt(text, exp);
  if (v.ok) return 'ok';
  if (v.checks.failed) return 'fatal';
  if (v.beneficiaryReason === 'ALIAS_IS_SENDER') return 'fatal';
  if (v.beneficiaryReason === 'ALIAS_NOT_FOUND' && (v.reference || v.amountsSeen.length)) return 'fatal';
  if (v.amountsSeen.length && !v.checks.amount) return 'fatal';
  if (v.receiptTime && v.driftMin != null && !v.checks.time && Math.abs(v.driftMin) > 120) return 'fatal';
  return 'retry';
}
t('مبلغ مقروء ومختلف = نهائي',()=>eq(classify(TO_US,{...base,amountCents:35000}),'fatal'));
t('تحويل صادر منك = نهائي',()=>eq(classify(REAL,base),'fatal'));
t('إيصال من يوم فات = نهائي',()=>eq(classify(TO_US,{...base,startedCivilMin:START+1440}),'fatal'));
t('إيصال فشل = نهائي',()=>eq(classify(TO_US.replace('تم التحويل بنجاح','فشل التحويل'),base),'fatal'));
t('صورة مقلوبة/فاضية = مؤقت مش نهائي',()=>eq(classify('',base),'retry'));
t('نص مقصوص من غير مبلغ = مؤقت',()=>eq(classify('تم التحويل بنجاح zogzog2000@instapay إلى',base),'retry'));
t('متأخر دقيقتين بس = مؤقت مش نهائي',()=>eq(classify(TO_US,{...base,startedCivilMin:START-7}),'retry'));
t('الإيصال السليم لسه بيعدّي',()=>eq(classify(TO_US,base),'ok'));
t('v707: غياب عبارة النجاح يحتاج لقطة أوضح ولا يعتمد آليًا',()=>eq(classify(TO_US.replace('تم التحويل بنجاح',''),base),'retry'));
t('سلبي: قيد التنفيذ لسه بيترفض',()=>eq(classify(TO_US.replace('تم التحويل بنجاح','قيد التنفيذ'),base),'fatal'));
t('سلبي: صورة فاضية لسه مؤقتة مش نهائية',()=>eq(classify('',base),'retry'));

console.log('\n👥 عناوين متعددة للفرع');
const multi = { ...base, aliases: ['zogzog2000@instapay', '01144155987'] };
const TO_WALLET = REAL
  .replace('من\nzogzog2000@instapay', 'من\nsara.m@instapay')
  .replace('إلى المحفظه الالكترونية\nNada N T******\n01105822087',
           'إلى المحفظه الالكترونية\nECHARPE\n01144155987');
t('تحويل على رقم المحفظة يعدّي', () => eq(C.inspectReceipt(TO_WALLET, multi).ok, true));
t('الرقم بمسافات في الإيصال يعدّي', () =>
  eq(C.inspectReceipt(TO_WALLET.replace('01144155987','0114 415 5987'), multi).checks.beneficiary, true));
t('رقم محفظة تاني يترفض', () =>
  eq(C.inspectReceipt(TO_WALLET.replace('01144155987','01099887766'), multi).checks.beneficiary, false));
t('العنوان الأساسي لسه شغال', () => eq(C.inspectReceipt(TO_US, multi).ok, true));

console.log('\n🧩 تجميع الحقول عبر الفريمات (منطق السيرفر)');
t('الحقول تتجمع لنفس المرجع',()=>{
  const first=C.mergeReading({},C.inspectReceipt(TO_US.replace('1,600 EGP',''),base));
  const last=C.mergeReading(first,C.inspectReceipt(TO_US.replace('تم التحويل بنجاح',''),base));
  eq(last.success&&last.amount&&last.time&&last.beneficiary,true);
});
t('مرجع مختلف لا يرث المبلغ',()=>{
  const first=C.mergeReading({},C.inspectReceipt(TO_US,base));
  const last=C.mergeReading(first,C.inspectReceipt(TO_US.replace('462046147040','462046147041').replace('1,600 EGP',''),base));
  eq(last.amount,false);
});
t('صورة بلا مرجع لا تضيف دليلًا',()=>eq(Object.keys(C.mergeReading({},C.inspectReceipt('1600 EGP',base))).length,0));
t('الفشل يمسح الحقول المؤكدة',()=>{
  const first=C.mergeReading({},C.inspectReceipt(TO_US,base));
  eq(C.mergeReading(first,C.inspectReceipt(TO_US.replace('تم التحويل بنجاح','فشل التحويل'),base)).success,false);
});
t('مبلغ مخالف لا يرث الموافقة السابقة',()=>{
  const first=C.mergeReading({},C.inspectReceipt(TO_US,base));
  eq(C.mergeReading(first,C.inspectReceipt(TO_US.replace('1,600','1,800'),base)).amount,false);
});

console.log('\n===============================');
console.log('النتيجة: ' + pass + ' ناجح · ' + fail + ' فاشل');
console.log('===============================\n');
process.exit(fail ? 1 : 0);
