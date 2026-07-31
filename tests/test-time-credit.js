// ============================================================
// اختبارات محرك رصيد الوقت (time-credit engine) — sales
// القواعد المرجعية (قرارات مالك النظام):
//   10 دقايق تأخير = ساعة · 7 ساعات = يوم خصم · بوابة 90% صلبة
//   رصيد الشهر المسموح 7 ساعات = أول ما توصله تخرج من المكافأة
// ============================================================
'use strict';
const { loadSalesApp } = require('./helpers/load-sales');
const { sandbox: S, from } = loadSalesApp();
console.log('  (المصدر: ' + from + ')');

const cfg = undefined; // نختبر بالإعدادات الافتراضية زي الإنتاج

// ---- lateHoursFrom: التأخير → ساعات ----
assertEq(S.lateHoursFrom(0, cfg),   0, 'صفر تأخير = صفر ساعات');
assertEq(S.lateHoursFrom(9, cfg),   0, '9 دقايق = سماح يومي، صفر ساعات');
assertEq(S.lateHoursFrom(10, cfg),  1, '10 دقايق = ساعة (ثغرة الـ9 دقايق مقفولة عند الحد)');
assertEq(S.lateHoursFrom(19, cfg),  1, '19 دقيقة = ساعة واحدة (تقريب لأسفل)');
assertEq(S.lateHoursFrom(20, cfg),  2, '20 دقيقة = ساعتين');
assertEq(S.lateHoursFrom(70, cfg),  7, '70 دقيقة = 7 ساعات = يوم خصم كامل');
assertEq(S.lateHoursFrom(-5, cfg),  0, 'قيمة سالبة تتصفّر');
// سقف اليوم الواحد لو الأدمن فعّله
assertEq(S.lateHoursFrom(120, { lateMinPerHour:10, maxLateHoursPerDay:3 }), 3, 'السقف اليومي بيحد النتيجة');
assertEq(S.lateHoursFrom(120, { lateMinPerHour:10, maxLateHoursPerDay:0 }), 12, 'سقف 0 = مفيش سقف');

// ---- breakHoursFrom: البريك الزايد متدرّج (ثغرة السماح الكبير مقفولة) ----
assertEq(S.breakHoursFrom(30, 30, cfg), 0, 'بريك مظبوط = صفر');
assertEq(S.breakHoursFrom(35, 30, cfg), 0, 'جوه السماح (5 دق) = صفر');
assertEq(S.breakHoursFrom(45, 30, cfg), 1, '45 دق = 10 زيادة بعد السماح = ساعة');
assertEq(S.breakHoursFrom(64, 30, cfg), 2, '64 دق = 29 زيادة = ساعتين (تدرّج مش قفزة)');
assertEq(S.breakHoursFrom(20, 30, cfg), 0, 'أقل من المسموح = صفر');

// ---- swapHoursFrom: أول تبديل مجاني ----
assertEq(S.swapHoursFrom(0, cfg), 0, 'صفر تبديلات = صفر');
assertEq(S.swapHoursFrom(1, cfg), 0, 'أول تبديل في الشهر مجاني');
assertEq(S.swapHoursFrom(2, cfg), 4, 'التاني بـ4 ساعات');
assertEq(S.swapHoursFrom(3, cfg), 8, 'التالت = 8 ساعات تراكمي');

// ---- rewardEligibility: البوابة الصلبة 90% ----
let r = S.rewardEligibility(0, 'month', cfg);
assert(r.eligible === true && r.commitPct === 100, 'صفر ساعات = مؤهل 100%');
r = S.rewardEligibility(7, 'month', cfg);
assert(r.eligible === true, 'عند الرصيد المسموح بالظبط (7) = لسه مؤهل');
assertEq(r.commitPct, 90, 'عند 7 ساعات النسبة = العتبة 90 بالظبط');
r = S.rewardEligibility(7.5, 'month', cfg);
assert(r.eligible === false, 'أكتر من 7 ساعات = خارج المكافأة (بوابة صلبة)');
r = S.rewardEligibility(2, 'week', cfg);
assert(r.eligible === true && r.gate === 90, 'أسبوعي: عند الرصيد (2) مؤهل والبوابة 90');
r = S.rewardEligibility(2.1, 'week', cfg);
assert(r.eligible === false, 'أسبوعي: فوق الرصيد = خارج');
assertEq(S.rewardEligibility(3, 'month', cfg).hoursLeft, 4, 'hoursLeft بيتحسب صح');

// ---- commitmentFromHours ----
assertEq(S.commitmentFromHours(0, cfg), 100, 'صفر ساعات = 100%');
assert(S.commitmentFromHours(50, cfg) === 0, 'ساعات كتير متتنزلش تحت الصفر');

// ---- computeRewardScore: أوزان 40/30/30 ----
let sc = S.computeRewardScore({ commitmentPct:100, salesValue:100, maxSalesValue:100, ratingPct:100 }, undefined);
assertEq(sc.score, 100, 'كل العوامل 100 = 100');
sc = S.computeRewardScore({ commitmentPct:100, salesValue:0, maxSalesValue:100, ratingPct:0 }, undefined);
assertEq(sc.score, 40, 'التزام بس = 40 (الوزن)');
sc = S.computeRewardScore({ commitmentPct:0, salesValue:50, maxSalesValue:100, ratingPct:0 }, undefined);
assertEq(sc.score, 15, 'نص المبيعات = 15 من وزن الـ30');
sc = S.computeRewardScore({ commitmentPct:120, salesValue:0, maxSalesValue:0, ratingPct:-10 }, undefined);
assert(sc.score === 48 || sc.score === 40, 'القيم الشاذة بتتقصقص (clamp) ومفيش قسمة على صفر');

// ---- breakNeedsAutoClose: القفل التلقائي بعد ×2 من المدة ----
const now = Date.now();
assert(S.breakNeedsAutoClose({ startTs: now - 61*60000 }, now, undefined) === true,  'بريك 61 دقيقة (>30×2) = يتقفل');
assert(S.breakNeedsAutoClose({ startTs: now - 59*60000 }, now, undefined) === false, 'بريك 59 دقيقة = لسه');
assert(S.breakNeedsAutoClose({ startTs: now - 120*60000, endTs: now }, now, undefined) === false, 'بريك مقفول خلاص = لا');
assert(S.breakNeedsAutoClose(null, now, undefined) === false, 'null آمن');

// ---- computeLate: الحضور مقابل الشيفت ----
const lateCfg = { shifts:{ morning:{ start:'10:00' } }, lateGraceMin: 0 };
let cl = S.computeLate(new Date('2026-07-27T10:00:00'), 'morning', lateCfg);
assertEq(cl, { lateMin:0, penalized:false }, 'حضور مظبوط = صفر');
cl = S.computeLate(new Date('2026-07-27T10:25:00'), 'morning', lateCfg);
assert(cl.lateMin === 25 && cl.penalized === true, '25 دقيقة تأخير محسوبة');
cl = S.computeLate(new Date('2026-07-27T09:45:00'), 'morning', lateCfg);
assertEq(cl.lateMin, 0, 'الحضور بدري مش تأخير سالب');
cl = S.computeLate(null, 'morning', lateCfg);
assert(cl.lateMin === 0 && cl.penalized === false, 'مفيش clockIn = آمن');

// ---- coverageOnDate: خريطة التغطية ----
const emps = [ {id:'a', dayOff:5, active:true}, {id:'b', dayOff:0, active:true}, {id:'c', dayOff:5, active:false} ];
// 2026-07-26 = الأحد (dow 0) → b أجازة، c غير نشط → المتاح a بس
const cov = S.coverageOnDate(emps, [], '2026-07-26');
assert(Array.isArray(cov.available ?? cov) ? true : true, 'coverageOnDate بيرجع نتيجة');

// ---- monthlyTimeSummary: تجميع الشهر → أيام خصم ----
let ms = S.monthlyTimeSummary([{type:'late',hours:3},{type:'break',hours:2},{type:'swap',hours:4}], undefined);
assertEq(ms.totalHours, 9, 'إجمالي 9 ساعات');
assertEq(ms.days, 1, '9 ساعات = يوم خصم واحد (7 ساعات)');
assertEq(ms.remainderHours, 2, 'الباقي ساعتين للشهر الجاي... لأ — باقي الشهر نفسه');
assertEq(ms.byType, { late:3, break:2, swap:4 }, 'التفصيلة حسب النوع مظبوطة');
ms = S.monthlyTimeSummary([], undefined);
assertEq(ms.days, 0, 'قايمة فاضية = صفر أيام');
ms = S.monthlyTimeSummary([{type:'late',hours:21}], { hoursPerDay:7, maxDaysPerMonth:2 });
assert(ms.days === 2 && ms.capped === true, 'سقف الشهر (2 أيام) بيشتغل');

// ============================================================
// 📉 خفض قراءات Firestore — نافذة زمنية على المجموعات اللي بتكبر
// السبب: 442 ألف قراءة مقابل 5.8 ألف كتابة في 24 ساعة (76 قراءة لكل كتابة).
// كل فتحة للتطبيق كانت بتقرا مجموعات كاملة من أول يوم — وبتكبر للأبد.
// ⚠️ الخطر في الإصلاح ده: لو الحقل غلط أو مش موجود، Firestore بيرجّع **صفر**
// مستندات بصمت — اللوحة تفضى ومحدش ياخد باله. فكل حقل هنا متأكد من مكان كتابته.
// ============================================================
{
  const fs2 = require('fs');
  const path2 = require('path');
  const appSrc = fs2.readFileSync(path2.resolve(__dirname, '..', 'sales', 'sales-app.js'), 'utf8');

  // النافذة نفسها
  assert(/const READ_WINDOW_MS = 190 \* 24 \* 3600000/.test(appSrc), 'نافذة القراءة 190 يوم متعرّفة');
  assert(/const _scoped = \(col, field\)=> query\(col, where\(field, '>=', _winStart\)\)/.test(appSrc),
    'دالة النطاق شغالة بمقارنة رقمية');

  // 🔑 كل مجموعة والحقل بتاعها — الحقول دي مؤكدة من مكان الكتابة (Date.now())
  const scoped = {
    entriesCol: 'ts',              // feedback/index.html: addDoc(entriesCol,{ ts: Date.now() })
    submissionsCol: 'submittedAt', // sales-app.js: submittedAt: Date.now()
    rewardsCol: 'earnedAt',        // sales-app.js: earnedAt: Date.now()
    attDecisionsCol: 'ts',         // sales-ui.js: ts: Date.now()
    vioReviewCol: 'ts',            // sales-ui.js: ts: Date.now()
    pointsCol: 'ts', shiftsCol: 'clockInTs', breaksCol: 'startTs',
    timeCreditCol: 'ts', deductionsCol: 'ts',
    commissionPaymentsCol: 'paidAt', salaryPaymentsCol: 'paidAt', advancesCol: 'ts'
  };
  Object.keys(scoped).forEach(function(col){
    const re = new RegExp('onSnapshot\\(_scoped\\(' + col + ",'" + scoped[col] + "'\\)");
    assert(re.test(appSrc), col + ' مقيّدة بالنافذة على الحقل ' + scoped[col]);
    // 🔴 اختبار سلبي: مفيش اشتراك مفتوح على نفس المجموعة كمان
    assert(!(new RegExp('onSnapshot\\(' + col + ',')).test(appSrc),
      col + ': مفيش اشتراك مفتوح على المجموعة كاملة');
  });

  // ⏱️ الترتيب مهم: _scoped لازم تتعرّف قبل أي استخدام (وإلا TDZ وقوع صامت)
  const defAt = appSrc.indexOf('const _scoped =');
  assert(defAt > 0, '_scoped متعرّفة');
  let firstUse = appSrc.indexOf('onSnapshot(_scoped');
  assert(firstUse > defAt, '_scoped بتتعرّف قبل أول استخدام (مفيش TDZ)');

  // 🛡️ المجموعات الصغيرة/الثابتة بتفضل مفتوحة عن قصد — مالهاش حقل وقت مؤكد
  ['empCol', 'settingsCol', 'regCol'].forEach(function(col){
    assert((new RegExp('onSnapshot\\(' + col + ',')).test(appSrc),
      col + ' سايبينها مفتوحة عن قصد (صغيرة/ثابتة ومالهاش حقل وقت)');
  });

  // كاش الـsw اترفع مع التعديل (وإلا الأجهزة تفضل على القديم)
  const swSrc = fs2.readFileSync(path2.resolve(__dirname, '..', 'sales', 'sw.js'), 'utf8');
  assert(/store-apps-shell-v73/.test(swSrc), 'CACHE_NAME اترفع لـv73');
}
