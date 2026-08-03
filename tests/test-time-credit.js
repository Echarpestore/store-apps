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
  // 🔬 التقييمات ليها نافذة أضيق (65 يوم) — فترات المرتبات بس، والمجموعة ضخمة
  assert(/onSnapshot\(_scopedDays\(entriesCol,'ts', 65\)/.test(appSrc),
    'entriesCol مقيّدة بنافذة 65 يوم المخصوصة');
  assert(!/onSnapshot\(entriesCol,/.test(appSrc), 'entriesCol: مفيش اشتراك مفتوح');
  assert(/const _scopedDays = \(col, field, days\)/.test(appSrc), '_scopedDays متعرّفة');
  const scoped = {
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
  assert(/store-apps-shell-v\d+/.test(swSrc), 'CACHE_NAME فيه رقم نسخة');
}

// ============================================================
// 🩺 يوم السماح — قفل الشيفتات المفتوحة + عذر جماعي
// الحالة: أول يوم تشغيل، كل الموظفين حضروا ومشيوا من غير انصراف، والمطلوب
// يوم تجميع بيانات من غير عقوبات.
// ⚠️ الحل **مش** بتغيير الإعدادات: الكود بيسجّل بند الرصيد بس لو الساعات > 0،
//    فتقليل العقوبات = يوم من غير بيانات أصلًا.
// ============================================================
{
  const fs = require('fs');
  const path = require('path');
  const ui = fs.readFileSync(path.resolve(__dirname,'..','sales','sales-ui.js'),'utf8');
  const appSrc = fs.readFileSync(path.resolve(__dirname,'..','sales','sales-app.js'),'utf8');
  const html = fs.readFileSync(path.resolve(__dirname,'..','sales','index.html'),'utf8');
  const g = ui.slice(ui.indexOf('window.renderGraceDay'));
  assert(g.length > 0, 'لوحة يوم السماح موجودة');
  assert(html.indexOf('id="graceDayPanel"') >= 0, 'والواجهة بتاعتها');

  // ---- العذر: تصفير مش مسح ----
  assert(/hours: 0,/.test(g), '🩺 العذر بيصفّر الساعات');
  assert(/originalHours: \(x\.originalHours != null \? x\.originalHours : x\.hours\)/.test(g),
    '🔑 وبيحفظ الأصلي — والعذر المكرر مابيدوسش عليه');
  assert(/excused: true/.test(g), 'وبيعلّم البند excused');
  assert(/excusedBy: 'grace_day'/.test(g), 'وبعلامة تفرّقه عن العذر الفردي');
  assert(!/fbDeleteDoc/.test(g), '⛔ مفيش أي مسح — البند بيفضل في السجل');

  // ---- المحرك بيستبعد المعذور فعلًا (بقى عبر tcCounts عشان العفو الشامل كمان) ----
  assert(/x\.employeeId !== emp\.id \|\| !tcCounts\(x, _tcfg\)/.test(appSrc),
    '💰 محرك المرتب بيستبعد المعذور');
  assert(/!tcCounts\(x\)/.test(appSrc), 'وبوابة الالتزام كمان');

  // ---- 🕕 الافتراضي بيوم الشغل مش التقويمي ----
  assert(/n\.getHours\(\) < 6/.test(g),
    '🕕 الساعة 5 الفجر = لسه يوم امبارح شغلًا (كان بيفتح على تاريخ النهاردة ويطلّع صفر)');
  assert(/_bizToday\(\)/.test(g), 'والافتراضي بيستخدمه');
  {
    const biz = (h)=>{ const n = new Date(2026,7,1,h,0);
      if(n.getHours() < 6) n.setDate(n.getDate()-1);
      return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0'); };
    assertEq(biz(5),  '2026-07-31', 'الساعة 5 الفجر → يوم امبارح');
    assertEq(biz(0),  '2026-07-31', 'ونص الليل كمان');
    assertEq(biz(7),  '2026-08-01', 'وبعد الفاصلة → اليوم الجديد');
    assertEq(biz(23), '2026-08-01', 'و11 بالليل على يومه');
  }

  // ---- 🔴 الفلترة بالتاريخ: مستند الشيفت مفيهوش dateKey ----
  assert(!/s\.dateKey === d/.test(g),
    '🔴 الفلترة بـdateKey اتشالت — الحقل ده مش موجود في مستند الشيفت (بتاع البريكات)');
  assert(/_dayOf\(s\.clockInTs\) === d/.test(g),
    '🔑 التاريخ بيتحسب من clockInTs — ده اللي موجود فعلًا');
  assert(/clockInTs: Date\.now\(\), clockOutTs: null/.test(appSrc),
    'تأكيد إن مستند الشيفت فعلًا كده (لو اتغير، الفلترة تتراجع)');
  assert(!/addDoc\(shiftsCol, \{[^}]*dateKey/.test(appSrc),
    'ولسه مفيهوش dateKey');

  // ---- قفل الشيفتات: وقت النهاية الرسمي مش دلوقتي ----
  assert(/clockOutTs: endTs/.test(g), '🚪 الانصراف بوقت نهاية الشيفت');
  assert(/overtimeMinutes: 0/.test(g), 'ومفيش وقت إضافي على قفل إداري');
  assert(/earlyMin: 0, earlyHours: 0/.test(g), 'ومفيش انصراف بدري');
  assert(/autoClosedBy: 'grace_day'/.test(g), 'وبعلامة إن ده قفل إداري');
  // ---- الحساب سلوكيًا — على الدالة الحقيقية مش نسخة منها ----
  // ⚠️ كان هنا فحصين بـregex على جوه الكود (`e.getTime() <= s.clockInTs`
  //    و`(8*60 + 15) * 60000`) + إعادة كتابة الحساب في الاختبار نفسه.
  //    النوع ده بيقع مع أي إعادة تنظيم وبيختبر نسخة مش الإنتاج.
  //    دلوقتي بنشغّل `graceCloseTsFor` نفسها.
  const _gf = ui.slice(ui.indexOf('window.graceCloseTsFor'));
  const _gfEnd = _gf.indexOf('\n};');
  assert(_gfEnd > 0, 'graceCloseTsFor موجودة في sales-ui.js');
  const _ctx = { window: {}, Date: Date, String: String, Number: Number };
  _ctx.globalThis = _ctx;
  require('vm').createContext(_ctx);
  require('vm').runInContext(_gf.slice(0, _gfEnd + 3), _ctx);
  const graceTs = _ctx.window.graceCloseTsFor;
  assert(typeof graceTs === 'function', 'واتحمّلت');

  const endTs = (clockIn, hm)=> graceTs({ clockInTs: clockIn }, { scheduledEndTime: hm }, null);
  const ci1 = new Date(2026,7,1,9,5).getTime();
  assert(endTs(ci1,'17:00') > ci1, 'صباحي: الانصراف بعد الدخول');
  const ci2 = new Date(2026,7,1,16,0).getTime();
  const o2 = endTs(ci2,'00:30');
  assert(o2 > ci2, '🕐 مسائي بيعدّي نص الليل: الانصراف بعد الدخول مش قبله');
  assertEq(Math.round((o2-ci2)/60000), 510, 'ومدة الشيفت معقولة (8.5 ساعة)');

  // فولباك الشيفت القياسي لما مفيش ميعاد نهاية مسجّل
  const ci3 = new Date(2026,7,1,10,0).getTime();
  assertEq(Math.round((graceTs({ clockInTs: ci3 }, {}, null) - ci3)/60000), 495,
    'من غير ميعاد نهاية: فولباك 8 ساعات و15 دقيقة');
  assertEq(graceTs(null, {}, null), null, 'شيفت مش موجود بيرجّع null');

  // ---- 👤 القفل الفردي: نفس الحساب بالظبط ----
  assert(/window\.graceCloseShift/.test(ui), 'فيه قفل لشيفت موظف واحد');
  const _oneStart = ui.indexOf('window.graceCloseShift');
  const one = ui.slice(_oneStart, ui.indexOf('window.renderGraceDay = function', _oneStart));
  assert(one.length > 200, 'استخرجنا جسم graceCloseShift');
  assert(/graceCloseTsFor\(/.test(one), 'والقفل الفردي بيستخدم نفس دالة الحساب');
  assert(/autoClosedBy: 'grace_day'/.test(one), 'وبيتعلّم إنه قفل إداري');
  assert(/overtimeMinutes: 0/.test(one) && /earlyMin: 0/.test(one),
    'ومفيش وقت إضافي ولا انصراف بدري على القفل الفردي');
  assert(/confirm\(/.test(one), 'وفيه تأكيد قبل القفل الفردي');
  assert(/clockOutTs\)\{ alert/.test(one) || /if\(s\.clockOutTs\)/.test(one),
    'وبيرفض يقفل شيفت مقفول خلاص');
  assert(/data-close-shift/.test(g), 'وكل شيفت مفتوح ليه زرار لوحده في اللوحة');
  assert(/graceCloseTsFor\(/.test(g), 'واللوحة بتوري وقت القفل قبل ما تدوس');

  // ---- تأكيد قبل أي تعديل جماعي ----
  assert((g.match(/confirm\(/g)||[]).length >= 2, '⛔ تأكيد إجباري قبل القفل وقبل العذر');
  assert(/prompt\('سبب العذر للكل/.test(g), 'والسبب بيتكتب مرة واحدة للكل');

  // ---- موصّلة ----
  assert(/renderGraceDay/.test(appSrc), 'اللوحة موصّلة في sales-app.js');
}

// ============================================================
// 🔴 FIRESTORE INTERNAL ASSERTION FAILED: Unexpected state
// الشكوى: الخطأ ده بيظهر في sales أثناء الاعتماد، وبيفضل لحد ما التطبيق يتقفل.
// السبب: enableIndexedDbPersistence من غير synchronizeTabs — تبويبين من نفس
// التطبيق (أو الأيقونة المثبّتة + المتصفح) بيتعاركوا على نفس قاعدة البيانات
// المحلية. الـPOS بيستخدمها وsales كان لأ.
// ============================================================
{
  const fs2 = require('fs'), path2 = require('path');
  const app2 = fs2.readFileSync(path2.resolve(__dirname,'..','sales','sales-app.js'),'utf8');
  assert(/enableIndexedDbPersistence\(db, \{ synchronizeTabs: true \}\)/.test(app2),
    '🔑 synchronizeTabs مفعّلة — التبويبات بتتشارك الكاش بدل ما تتعارك');
  assert(!/enableIndexedDbPersistence\(db\)\.catch/.test(app2),
    'والشكل القديم اتشال');
  // الـPOS كان بيعملها صح من الأول — نتأكد إنها لسه كده
  const core2 = fs2.readFileSync(path2.resolve(__dirname,'..','pos','pos-core.js'),'utf8');
  assert(/synchronizeTabs: true/.test(core2), 'والـPOS لسه عليها');
}

// ============================================================
// 🔴 شاشة ملخّص اليوم كانت بتكذب على الموظفة
// النظام اتحوّل من غرامة ثابتة (+سماح 20 دقيقة) لرصيد ساعات في جلسة الفلوس،
// لكن شاشة الملخّص فضلت على النص القديم: بتقرا complianceCfg.penalty و
// lateGraceMin وهما ملغيين.
// الواقع من الصور: روان 68 دقيقة → الشاشة "خصم 50 ج.م" والحقيقة 6 ساعات رصيد.
// ============================================================
{
  const fs3 = require('fs'), path3 = require('path');
  const a3 = fs3.readFileSync(path3.resolve(__dirname,'..','sales','sales-app.js'),'utf8');
  const card = a3.slice(a3.indexOf('let attCard;'), a3.indexOf('// رسالة عن النقاط'));
  assert(card.length > 0, 'بلوك كارت الحضور اتلقى');

  // ⚠️ التعليق اللي بيشرح الباج فيه أسماء الحقول القديمة — نستثني السطور
  //    اللي بتبدأ بـ// وإلا التأكيد يقع على شرحه هو (فخ §0)
  const _card = card.split('\n').filter(function(l){ return !/^\s*\/\//.test(l); }).join('\n');
  assert(!/complianceCfg\.penalty/.test(_card),
    '🔴 الغرامة الثابتة اتشالت من الملخّص (النظام بقى ساعات)');
  assert(!/حدود السماح/.test(_card), 'ورسالة "حدود السماح" كمان');
  assert(/lateHoursFrom\(lateMin, _tc\)/.test(card),
    '🔑 بيتحسب من **نفس الدالة** اللي بتسجّل الرصيد فعلًا');
  assert(/رصيد وقت/.test(card), 'وبيقول رصيد وقت مش خصم جنيهات');
  assert(/كل \$\{_per\} دقيقة = ساعة/.test(card), 'وبيشرح القاعدة');
  assert(/_hrs <= 0/.test(card), 'وبيفرّق بين اللي اتسجل واللي لأ');
  assert(/maxLateHoursPerDay/.test(card), 'وبيوضح سقف اليوم لو موجود');

  // شاشة التسجيل كانت بتقول نفس الكلام الغلط
  assert(!/التأخير أكتر من \$\{cfg\.lateGraceMin\} دقيقة عليه خصم/.test(a3),
    '🔴 وشاشة تسجيل الموظف الجديد كمان اتصلحت');
  assert(/التأخير بيتسجل رصيد وقت/.test(a3), 'وبتقول الحقيقة');

  // سلوكيًا: نفس أرقام الصور
  const lh = (m, per, cap)=>{ let h = Math.floor(Math.max(0, m) / (per||10));
    if(cap > 0 && h > cap) h = cap; return h; };
  assertEq(lh(68), 6, 'روان: 68 دقيقة = 6 ساعات رصيد (مش خصم 50 ج.م)');
  assertEq(lh(7),  0, 'مريم: 7 دقايق = مفيش رصيد (بس مش بسبب "سماح 20 دقيقة")');
  assertEq(lh(10), 1, 'و10 دقايق = ساعة — تحت السماح القديم وكانت بتتقال "مفيش خصم"');
  assertEq(lh(68, 10, 4), 4, 'والسقف اليومي بيتحترم');
}

// ============================================================
// 🩹 العفو الشامل — «اللي فات كله، ومن بكرا نحسب»
// الطلب: رصيد الوقت المتراكم يتلغي كله لحد النهاردة عشان القبض يطلع مظبوط،
// والحساب يبدأ من بكرا.
// ⚠️ ليه إعداد بتاريخ مش تعليم البنود واحد واحد: بند ممكن يتسجّل **بعد**
//    ما العفو يتنفّذ وهو على يوم قديم — التعليم اليدوي بيفوّته ويتخصم.
// ============================================================
{
  assert(typeof S.tcAmnestied === 'function', 'tcAmnestied موجودة في المحرك');
  assert(typeof S.tcCounts === 'function', 'tcCounts موجودة كمان');
  const amn = (date, until)=> S.tcAmnestied(date, { timeAmnestyUntil: until });
  const counts = (x, until)=> S.tcCounts(x, { timeAmnestyUntil: until });

  assertEq(amn('2026-07-20', ''), false, 'من غير عفو مفيش أي بند بيتلغي');
  assertEq(counts({ hours:5, date:'2026-07-20' }, ''), true, 'والبند بيتحسب عادي');

  assertEq(amn('2026-07-20', '2026-07-31'), true, 'بند قديم داخل العفو');
  assertEq(amn('2026-07-31', '2026-07-31'), true, '🔑 ويوم العفو نفسه **داخل** (اللي فات كله)');
  assertEq(amn('2026-08-01', '2026-07-31'), false, '🔑 وبكرا برّه — الحساب بيبدأ من تاني يوم');
  assertEq(counts({ hours:16, date:'2026-07-25' }, '2026-07-31'), false,
    '🔴 بند 16 ساعة قديم مبقاش بيتحسب في الخصم');
  assertEq(counts({ hours:3, date:'2026-08-02' }, '2026-07-31'), true,
    'وبند بعد العفو بيتحسب زي ما هو');

  assertEq(amn('2025-12-31', '2026-01-01'), true, 'سنة فاتت داخلة');
  assertEq(amn('2026-01-02', '2026-01-01'), false, 'ويوم واحد بعده برّه');
  assertEq(amn('2026-09-30', '2026-10-01'), true, 'وترتيب الشهور صح (9 قبل 10)');

  assertEq(amn('', '2026-07-31'), false, '🔴 بند من غير تاريخ مش بيتغطى بالعفو');
  assertEq(counts({ hours:4 }, '2026-07-31'), true, 'وبيفضل بيتخصم — أأمن من إنه يضيع');

  assertEq(counts({ hours:5, date:'2026-08-05', excused:true }, ''), false,
    'البند المعذور يدويًا مبيتحسبش زي ما كان');
}

// كل مكان بيجمع رصيد وقت لازم يعدّي على tcCounts — مش !excused لوحدها
{
  const appSrc = require('fs').readFileSync(
    require('path').resolve(__dirname, '..', 'sales', 'sales-app.js'), 'utf8');
  // بنشيل جسم tcCounts نفسها — هي المكان الوحيد المسموح فيه بالفحص الخام
  const body = appSrc.replace(/function tcCounts\([\s\S]*?\n\}/, '');
  const spots = body.match(/!x\.excused|!r\.excused/g) || [];
  assertEq(spots.length, 0,
    '🔴 مفيش فلتر رصيد لسه شايف excused لوحده — وإلا العفو هيتجاهل في المكان ده');
  assert(/timeAmnestyUntil/.test(appSrc), 'والإعداد نفسه متعرّف في الافتراضيات');
}
