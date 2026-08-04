// ============================================================
// 💵 test-cash-hand — تبويب "معاك في إيدك" (office)
//
// المالك بيحدد الكاش اللي معاه دلوقتي، والنظام بيمشي لوحده:
// + كاش الفروع · − سلف · − رواتب اتصرفت · − مكافآت · − مصاريف
//
// ⚠️ ده رقم فلوس بيتبني عليه قرار — فالاختبارات هنا مركّزة على
//    الحاجات اللي لو غلطت الرقم يطلع كذب:
//    · الفيزا مش كاش · النافذة الزمنية · المستحق ≠ المتصرف
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT,'Office','office.js'),'utf8');
const html = fs.readFileSync(path.join(ROOT,'Office','index.html'),'utf8');

function extractFn(s, header){
  const i = s.indexOf(header);
  if(i < 0) return null;
  let d = 0, st = false;
  for(let j = s.indexOf('{', i); j < s.length; j++){
    if(s[j] === '{'){ d++; st = true; }
    else if(s[j] === '}'){ d--; if(st && d === 0) return s.slice(i, j + 1); }
  }
  return null;
}

// بنشغّل الدوال النقية من الملف نفسه
const box = { Date: Date, Number: Number, Math: Math, String: String, isNaN: isNaN, console: console };
box.globalThis = box;
vm.createContext(box);
vm.runInContext('const OH_STALE_DAYS = '
  + Number((src.match(/OH_STALE_DAYS = (\d+)/) || [])[1]) + ';', box);
['function _saleMs(', 'function _ohTs(', 'function cashOnHand(',
 'function cashDaily(', 'function cashBaseStale('].forEach(function(h){
  const f = extractFn(src, h);
  assert(!!f, 'لقينا ' + h);
  if(f) vm.runInContext(f, box);
});
const cashOnHand = vm.runInContext('cashOnHand', box);
const cashDaily = vm.runInContext('cashDaily', box);
const stale = vm.runInContext('cashBaseStale', box);

const DAY = 86400000;
const T0 = new Date(2026, 6, 10, 12, 0).getTime();     // لحظة تحديد الرصيد
const NOW = T0 + 3 * DAY;
const BASE = { amount: 5000, atMs: T0 };
const sale = (ms, cash, visa)=> ({ createdAt: { toMillis: ()=> ms }, payments: { cash: cash||0, visa: visa||0 } });

// ============================================================
// ١) 💳 الفيزا مش كاش — أهم سطر في الحساب
// ============================================================
(function(){
  const c = cashOnHand(BASE, { sales:[ sale(T0 + DAY, 300, 700) ] }, NOW);
  assertEq(c.cashIn, 300, '⭐⭐ الكاش بس اللي بيدخل الإيد — الفيزا بتروح لحساب Paymob');
  assertEq(c.now, 5300, 'والرصيد زاد بالكاش بس');
  const visaOnly = cashOnHand(BASE, { sales:[ sale(T0 + DAY, 0, 1000) ] }, NOW);
  assertEq(visaOnly.cashIn, 0, '⭐ فاتورة فيزا بالكامل = صفر كاش');
  assertEq(visaOnly.now, 5000, 'والرصيد زي ما هو');
})();

// ============================================================
// ٢) ⏱️ النافذة الزمنية: قبل ما يحدد رصيده مش بتاعنا
// ============================================================
(function(){
  const c = cashOnHand(BASE, { sales:[
    sale(T0 - DAY, 900, 0),        // قبل التحديد — مفروض متدخلش (هو عدّها في الـ5000)
    sale(T0, 400, 0),              // نفس اللحظة بالظبط — برضه لأ
    sale(T0 + DAY, 100, 0),        // بعده ✅
    sale(NOW + DAY, 500, 0)        // في المستقبل — برّه
  ] }, NOW);
  assertEq(c.cashIn, 100,
    '⭐⭐ الفواتير اللي قبل لحظة العدّ مش بتتحسب تاني (وإلا الرقم بيتضاعف)');
})();

// ============================================================
// ٣) 🔁 المرتجع بيقلّل الكاش
// ============================================================
(function(){
  const c = cashOnHand(BASE, { sales:[
    sale(T0 + DAY, 500, 0),
    sale(T0 + 2*DAY, -200, 0)      // فاتورة عكس: مدفوعاتها سالبة
  ] }, NOW);
  assertEq(c.cashIn, 300, '⭐ الفلوس رجعت للعميلة فعلًا → الكاش قلّ');
  assertEq(c.now, 5300, 'والرصيد بيعكس ده');
})();

// ============================================================
// ٤) 💸 المصروفات: كل بند بيخصم مرة واحدة
// ============================================================
(function(){
  const c = cashOnHand(BASE, {
    sales: [ sale(T0 + DAY, 1000, 0) ],
    advances:   [ { amount:200, ts: T0 + DAY }, { amount:150, date:'2026-07-09' } ],  // التانية قبل العدّ
    salaryPays: [ { amount:800, paidAt: T0 + 2*DAY } ],
    expenses:   [ { amount:120, ts: T0 + DAY } ],
    rewards:    [ { amount:100, earnedAt: T0 + DAY, status:'approved' },
                  { amount:400, earnedAt: T0 + DAY, status:'pending' } ]
  }, NOW);
  assertEq(c.advances, 200, '⭐ السلفة اللي قبل العدّ مش بتتخصم تاني');
  assertEq(c.salaries, 800, 'الرواتب المتصرفة');
  assertEq(c.expenses, 120, 'والمصاريف');
  assertEq(c.rewards, 100, '⭐⭐ المكافآت **المعتمدة** بس — المستنية موافقة لسه ماتصرفتش');
  assertEq(c.out, 1220, 'إجمالي الخارج');
  assertEq(c.now, 4780, 'الصافي: 5000 + 1000 − 1220');
})();

// ============================================================
// ٥) 💼 المستحق ≠ المتصرف
//    الرواتب بتتقرا من sales_salary_payments (الصرف الفعلي)
//    مش من baseSalary — المستحق عمره ما خرج من الدرج
// ============================================================
(function(){
  const c = cashOnHand(BASE, {
    sales: [],
    employees: [ { baseSalary: 3000, active:true }, { baseSalary: 4000, active:true } ],
    salaryPays: []
  }, NOW);
  assertEq(c.salaries, 0, '⭐⭐ مرتبات مستحقة 7000 ومتصرفش منها حاجة = صفر خصم');
  assertEq(c.now, 5000, 'والرصيد ما اتلمسش');
  // والدالة أصلًا مبتلمسش employees
  const fn = extractFn(src, 'function cashOnHand(');
  assert(!!fn && !/employees|baseSalary/.test(fn),
    '⛔ الحساب مبيقربش من المرتبات المستحقة خالص');
})();

// ============================================================
// ٦) الرصيد ممكن يبقى سالب — ومبيتخبّاش
// ============================================================
(function(){
  const c = cashOnHand({ amount: 100, atMs: T0 }, {
    sales: [], expenses: [ { amount: 900, ts: T0 + DAY } ]
  }, NOW);
  assertEq(c.now, -800, '⭐ صرف أكتر من اللي معاه → رقم سالب صريح مش صفر');
})();

// ============================================================
// ٧) 📅 الحركة يوم بيوم
// ============================================================
(function(){
  const days = cashDaily(BASE, {
    sales: [ sale(T0 + DAY, 600, 0), sale(T0 + 2*DAY, 400, 0) ],
    advances: [ { amount: 100, ts: T0 + 2*DAY } ]
  }, NOW, 7);
  assert(days.length >= 3, 'بيرجّع أيام');
  const byDay = {};
  days.forEach(function(d){ byDay[new Date(d.dayMs).getDate()] = d; });
  assertEq(byDay[11].inAmt, 600, 'يوم 11: دخل 600');
  assertEq(byDay[12].inAmt, 400, 'يوم 12: دخل 400');
  assertEq(byDay[12].outAmt, 100, 'وخرج 100');
  assertEq(byDay[12].net, 300, '⭐ والصافي 300');
  // ⛔ الأيام اللي قبل ما يحدد رصيده مبتظهرش
  assert(!days.some(function(d){ return d.dayMs < new Date(2026,6,10).getTime(); }),
    '⛔ مفيش أيام قبل لحظة العدّ');
})();

// ============================================================
// ٨) ⚠️ التحذير: office بيحمّل مبيعات آخر 30 يوم بس
//    لو الرصيد الافتتاحي أقدم، الفواتير بتقع بره النافذة والرقم يبوظ
// ============================================================
(function(){
  const n = Number((src.match(/OH_STALE_DAYS = (\d+)/) || [])[1]);
  assert(n > 0 && n < 30, '⭐ حد التحذير أقل من الـ30 يوم اللي بتتحمّل — ' + n);
  assertEq(stale({ atMs: NOW - 5*DAY }, NOW), false, 'رصيد جديد = مفيش تحذير');
  assertEq(stale({ atMs: NOW - (n + 1)*DAY }, NOW), true, '⭐⭐ رصيد قديم = تحذير يعدّ من تاني');
  assertEq(stale(null, NOW), false, 'ومفيش رصيد أصلًا = مفيش تحذير (الشاشة بتطلب التحديد)');
  // 🔄 بدل ما نطلب منه يعدّ: الرصيد بيترحّل لوحده بنفس الرقم بتاريخ جديد
  assert(/if\(cashBaseStale\(base, now\)\) \{ ofRollCashBase\(c\.now\)/.test(src),
    '⭐⭐ نقطة البداية بتترحّل تلقائي قبل ما تقع بره نافذة الـ30 يوم');
  const roll = extractFn(src, 'async function ofRollCashBase(');
  assert(!!roll && /_ofRolling/.test(roll), '⛔ والترحيل مرة واحدة بس (مفيش لوب كتابة)');
  assert(!!roll && /by: 'auto_roll'/.test(roll), 'وبيتعلّم إنه ترحيل تلقائي مش عدّ يدوي');
})();

// ============================================================
// ٩) الشاشة والتبويب
// ============================================================
(function(){
  assert(/id="page-cash"/.test(html), 'صفحة التبويب موجودة');
  assert(/data-page="cash"/.test(html), 'وزراره في الشريط السفلي');
  assert(/id="cashHandBody"/.test(html), 'ومكان العرض');
  const set = extractFn(src, 'async function ofSetCashBase(');
  assert(!!set, 'لقينا ofSetCashBase');
  assert(!!set && /confirm\(/.test(set), '⭐ فيه تأكيد قبل ما يتغيّر الرصيد');
  assert(!!set && /amount < 0/.test(set), 'ورقم سالب مرفوض');
  assert(!!set && /\{ merge: true \}/.test(set), 'والكتابة merge');
  assert(!!set && !/D\.cashBase *=/.test(set),
    '⛔ مبيحدّثش الحالة يدوي — الـsnapshot هو مصدر الحقيقة (وإلا جهازين يختلفوا)');
  assert(/الفيزا مش محسوبة هنا/.test(src), '⭐ والشاشة بتقول صراحة إن الفيزا مش هنا');
})();


// ============================================================
// ١١) 💳 عمولة Paymob — من إيصالين حقيقيين
//     525.00 → 10.19 رسوم · 1205.00 → 23.38 رسوم
//     الفرق: 13.19 ÷ 680 = 1.9397% والرسم الثابت = 0.006 ≈ صفر
// ============================================================
(function(){
  ['function paymobFeeOn(', 'function paymobGrossFromNet(',
   'function paymobEffectivePct(', 'function paymobLedger('].forEach(function(h){
    const f = extractFn(src, h);
    assert(!!f, 'لقينا ' + h);
    if(f) vm.runInContext(f, box);
  });
  vm.runInContext('const PAYMOB_FEE_PCT = '
    + Number((src.match(/PAYMOB_FEE_PCT = ([\d.]+)/) || [])[1]) + ';', box);
  const feeOn = vm.runInContext('paymobFeeOn', box);
  const grossFromNet = vm.runInContext('paymobGrossFromNet', box);
  const pct = vm.runInContext('PAYMOB_FEE_PCT', box);

  assertEq(pct, 1.94, 'النسبة 1.94% (مأخوذة من إيصالين مش تخمين)');
  assertEq(feeOn(525), 10.19, '⭐⭐ إيصال Paymob الأول: 525 → 10.19 بالمليم');
  assertEq(feeOn(1205), 23.38, '⭐⭐ والتاني: 1205 → 23.38 بالمليم');
  assertEq(feeOn(495), 9.60, '⭐⭐ والتالت: 495 → 9.60 بالمليم');

  // 🔁 الاتجاه العكسي: نزل عندك الصافي → يقابل كام مبيعات
  /* ⚠️ الاتجاه العكسي بيقرّب قرش: العمولة نفسها متقرّبة لقرشين
     (525 × 1.94% = 10.185 → اتسجّلت 10.19)، فالصافي 514.81 بيرجّع
     524.99 مش 525 بالظبط. ومفيش طريقة تصلّح ده أصلًا — التحويل
     الحقيقي بيبقى مجمّع لمئات العمليات كل واحدة متقرّبة لوحدها.
     الفرق قروش والاختبار بيثبّته صراحة بدل ما ندّعي دقة مش موجودة. */
  assertEq(grossFromNet(514.81), 524.99, '514.81 صافي ≈ 525 مبيعات (فرق قرش من التقريب)');
  assertEq(grossFromNet(1181.62), 1205, 'و1181.62 = 1205 بالظبط');
  assert(Math.abs(grossFromNet(514.81) - 525) <= 0.02, '⭐ والفرق ماينفعش يعدّي قرشين');
  assertEq(grossFromNet(0), 0, 'وصفر = صفر');
})();

// ============================================================
// ١٢) 💳 دفتر Paymob: اللي ليك عندهم
// ============================================================
(function(){
  const ledger = vm.runInContext('paymobLedger', box);
  const data = {
    sales: [ sale(T0 + DAY, 100, 1000), sale(T0 + 2*DAY, 0, 205),
             sale(T0 - DAY, 0, 5000) ],            // قبل نقطة البداية — مش بتاعنا
    settlements: [ { net: 514.81, ts: T0 + 2*DAY } ]
  };
  const p = ledger(BASE, data, NOW);
  assertEq(p.visaSales, 1205, '⭐ الفيزا بس (الكاش مش عند Paymob)');
  assertEq(p.grossCleared, 524.99, 'التحويل اللي وصل يقابل ~525 مبيعات');
  assertEq(p.fees, 10.18, 'والعمولة عليه ~10.19');
  assertEq(p.due, 680.01, '⭐⭐ لسه ليك عندهم ~680');
  assert(Math.abs(p.due - 680) <= 0.05, '⭐ والفرق قروش مش أكتر');

  // والكاش بياخد **الصافي بس** — العمولة عمرها ما دخلت الدرج
  const c = cashOnHand(BASE, data, NOW);
  assertEq(c.settled, 514.81, '⭐⭐ اللي دخل إيدك = الصافي مش الإجمالي');
  assertEq(c.cashIn, 100, 'والكاش من الفروع منفصل');
  assertEq(c.now, 5614.81, 'الرصيد: 5000 + 100 + 514.81');
})();

// ============================================================
// ١٣) 📄 تسجيل التحويل: بالأرقام المكتوبة مش بالحساب
//
// ⚠️ الدرس من تحويل حقيقي: العمولة **مش نسبة ثابتة**.
//   · عملية ماستركارد واحدة: 525 → 10.19 = 1.94%
//   · تحويل مجمّع: 74,033.39 → 1,305.16 = 1.763%
//   لأن التحويل بيجمّع كروت بنسب مختلفة (ميزة أرخص). وكمان فيه بند
//   "تسويات" (395 ج) مالوش علاقة بالعمولة أصلًا.
//   فالمالك بيكتب الإجمالي والصافي من شاشة Paymob والفرق = الخصومات.
// ============================================================
(function(){
  const fn = extractFn(src, 'async function ofAddSettlement(');
  assert(!!fn, 'لقينا ofAddSettlement');
  if(!fn) return;
  assert(!/paymobGrossFromNet\(net/.test(fn),
    '⭐⭐ مفيش تخمين للإجمالي من الصافي — النسبة بتتغير من تحويل للتاني');
  assert(/المبلغ الإجمالي/.test(fn) && /الصافي/.test(fn),
    '⭐ بيطلب الرقمين من شاشة التحويل');
  assert(/net > gross/.test(fn),
    '⭐⭐ صافي أكبر من الإجمالي = غلط في الكتابة، بيترفض');
  assert(/gross <= 0/.test(fn) && /net <= 0/.test(fn), 'وأرقام صفر أو سالبة مرفوضة');
  assert(/deductions: ded/.test(fn), 'والخصومات بتتخزن');
  assert(/feePct: pct/.test(fn),
    '⭐ والنسبة الفعلية للتحويل ده بتتحسب وتتخزن (مش الافتراضية)');
  assert(/confirm\(/.test(fn), 'وفيه تأكيد بيوري الأرقام قبل الحفظ');
  assert(!/D\.settlements *=/.test(fn), '⛔ مفيش تحديث يدوي للحالة');
})();

// ============================================================
// ١٤) 💳 التحويل الحقيقي بأرقامه
// ============================================================
(function(){
  const ledger = vm.runInContext('paymobLedger', box);
  const real = { gross: 74033.39, net: 72333.23, deductions: 1700.16, ts: T0 + DAY };
  const ded = Math.round((real.gross - real.net) * 100) / 100;
  assertEq(ded, 1700.16, '⭐ الخصومات = 1,305.16 رسوم + 395.00 تسويات');
  assertEq(Math.round((ded / real.gross) * 10000) / 100, 2.3,
    'النسبة الفعلية للتحويل ده 2.3% (رسوم + تسويات)');

  const p = ledger(BASE, { sales: [ sale(T0 + DAY, 0, 80000) ], settlements: [ real ] }, NOW);
  assertEq(p.grossCleared, 74033.39, '⭐⭐ الإجمالي بيتاخد زي ما هو مش محسوب');
  assertEq(p.netReceived, 72333.23, 'والصافي زي ما هو');
  assertEq(p.fees, 1700.16, 'والفرق هو الخصومات');
  assertEq(p.due, 5966.61, '⭐ الباقي عند Paymob = 80,000 − 74,033.39');

  const c = cashOnHand(BASE, { sales: [ sale(T0 + DAY, 0, 80000) ], settlements: [ real ] }, NOW);
  assertEq(c.settled, 72333.23, '⭐⭐ اللي دخل الدرج = الصافي بالظبط');
  assertEq(c.cashIn, 0, 'ومفيش كاش من الفروع في المثال ده');
  assertEq(c.now, 77333.23, 'الرصيد: 5000 + 72,333.23');
})();

// ============================================================
// ١٥) الدالة التقديرية لسه موجودة — للتقدير بس مش للتسجيل
// ============================================================
(function(){
  const ledger = vm.runInContext('paymobLedger', box);
  // تحويل قديم اتسجّل من غير gross → بنقدّره (فولباك)
  const p = ledger(BASE, { sales: [], settlements: [ { net: 514.81, ts: T0 + DAY } ] }, NOW);
  assert(p.grossCleared > 0, '⭐ تحويل قديم من غير إجمالي: بيتقدّر بالنسبة الافتراضية');
  assert(Math.abs(p.grossCleared - 525) <= 0.05, 'والتقدير قريب من الحقيقة');
})();

// ============================================================
// ١٦) الكاش والقاعدة الذهبية
// ============================================================
(function(){
  assert(/cashOnHand:cashOnHand/.test(src), 'الدوال معروضة للاختبارات');
  assert(/window\.renderCashHand = renderCashHand/.test(src), 'renderCashHand معروضة');
  assert(/window\.ofAddSettlement = ofAddSettlement/.test(src), 'ofAddSettlement معروضة');
  const sw = fs.readFileSync(path.join(ROOT,'Office','sw.js'),'utf8');
  const m = sw.match(/echarpe-office-v(\d+)/);
  assert(!!m && Number(m[1]) >= 33, 'office: CACHE_NAME v33+');
})();

// ============================================================
// ١٧) 📈 النسبة بتتعلّم من التحويلات مش رقم ثابت
//
// العملية الواحدة بالكارت 1.94% (3 إيصالات)، لكن التحويل المجمّع
// طلع 1.763% لأن جواه عمليات بنسبة أقل (ميزة). فأي رقم ثابت هيبقى
// غلط — بناخد المتوسط الموزون من اللي اتسجّل فعلًا.
// ============================================================
(function(){
  const eff = vm.runInContext('paymobEffectivePct', box);
  assertEq(eff([], 1.94), 1.94, '⭐ مفيش تحويلات لسه → النسبة الافتراضية');
  assertEq(eff([{ gross:74033.39, net:72333.23 }], 1.94), 2.3,
    '⭐⭐ أول تحويل حقيقي: 2.3% (رسوم + تسويات) مش الافتراضية');
  // متوسط موزون: التحويل الكبير بيوزن أكتر من الصغير
  const two = eff([{ gross:74033.39, net:72333.23 }, { gross:495, net:485.40 }], 1.94);
  assert(two > 2.2 && two < 2.31, '⭐ المتوسط موزون بالمبالغ مش متوسط بسيط — ' + two);
  // بيانات ناقصة أو غلط مبتفسدش الحساب
  assertEq(eff([{ net:500 }], 1.94), 1.94, '⛔ تحويل من غير إجمالي بيتتجاهل');
  assertEq(eff([{ gross:100, net:200 }], 1.94), 1.94, '⛔ وصافي أكبر من الإجمالي بيتتجاهل');
})();

// ============================================================
// ١٨) 💡 المتوقع يوصلك من الباقي
// ============================================================
(function(){
  const ledger = vm.runInContext('paymobLedger', box);
  const p = ledger(BASE, { sales: [ sale(T0 + DAY, 0, 1000) ], settlements: [] }, NOW);
  assertEq(p.due, 1000, 'ليك عندهم 1000');
  assertEq(p.effPct, 1.94, 'بالنسبة الافتراضية');
  assertEq(p.dueNet, 980.6, '⭐ المتوقع يوصلك ≈ 980.60');
  // وبعد ما يتسجّل تحويل حقيقي، التقدير بيتغيّر معاه
  const p2 = ledger(BASE, { sales: [ sale(T0 + DAY, 0, 80000) ],
    settlements: [ { gross:74033.39, net:72333.23, ts: T0 + DAY } ] }, NOW);
  assertEq(p2.effPct, 2.3, '⭐⭐ النسبة اتعلّمت من التحويل الحقيقي');
  assert(p2.dueNet < p2.due, 'والمتوقع أقل من الإجمالي');
})();
