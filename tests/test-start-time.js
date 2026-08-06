// ============================================================
// ⏰ test-start-time — الميعاد الفردي يغلب بداية الشيفت
//
// الحادثة: موظف على شيفت صباحي (10:00 → 18:00)، والأدمن غيّر ميعاده
// الفردي لـ11:00. جه 11:09 — يعني متأخر 9 دقايق جوه السماح.
// النظام حسبها من **10:00** فطلّعت **69 دقيقة** = 6 ساعات رصيد
// ≈ يوم خصم على غير حق. ونفس الشاشة كانت بتقول "ميعاده 11:00"
// وتحتها "اتأخر 69 دقيقة".
//
// السبب: computeLate كانت بتاخد **مفتاح الشيفت** وتقرا cfg.shifts[key].start،
// والفولباك للميعاد الفردي كان بشرط `!complianceCfg.shifts[emp.shift]`
// يعني بيشتغل بس لو الموظف مالوش شيفت أصلًا.
//
// وكان فيه تناقض: نهاية الشيفت بتحترم scheduledEndTime الفردي والبداية لأ.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { loadSalesApp } = require('./helpers/load-sales');

const ROOT = path.resolve(__dirname, '..');
const { sandbox: S } = loadSalesApp();
const src = fs.readFileSync(path.join(ROOT,'sales','sales-app.js'),'utf8');

const CFG = { shifts: { morning: { start:'10:00', end:'18:00' },
                        night:   { start:'18:00', end:'02:00' } },
              lateGraceMin: 20 };
const at = (h, m)=> new Date(2026, 6, 10, h, m, 0, 0);

// ============================================================
// ١) ⭐ الحادثة بالظبط
// ============================================================
(function(){
  const emp = { id:'e1', shift:'morning', scheduledStartTime:'11:00' };
  const r = S.window.computeLate(at(11, 9), emp, CFG);
  assertEq(r.lateMin, 9, '⭐⭐ جه 11:09 وميعاده 11:00 = 9 دقايق (مش 69)');
  assertEq(r.penalized, false, '⭐⭐ وجوه السماح (20 د) = مفيش عقوبة ولا رصيد وقت');

  // 🔴 السلوك القديم للمقارنة: نفس الحالة بمفتاح الشيفت
  const oldWay = S.window.computeLate(at(11, 9), 'morning', CFG);
  assertEq(oldWay.lateMin, 69, 'إثبات الباج: من بداية الشيفت بتطلع 69 دقيقة');
  assertEq(oldWay.penalized, true, 'وبعقوبة — 6 ساعات رصيد ≈ يوم خصم');
})();

// ============================================================
// ٢) الشيفت لسه الافتراضي لما مفيش ميعاد فردي
// ============================================================
(function(){
  const emp = { id:'e2', shift:'morning' };
  assertEq(S.window.computeLate(at(10, 5), emp, CFG).lateMin, 5,
    'من غير ميعاد فردي: الحساب من بداية الشيفت زي الأول');
  assertEq(S.window.computeLate(at(9, 50), emp, CFG).lateMin, 0, 'وجه بدري = صفر');
  assertEq(S.window.computeLate(at(10, 45), emp, CFG).penalized, true,
    'و45 دقيقة بره السماح = عقوبة');
})();

// ============================================================
// ٣) effectiveStartHM — القاعدة في مكان واحد
// ============================================================
(function(){
  const eff = S.window.effectiveStartHM;
  assertEq(eff({ shift:'morning', scheduledStartTime:'11:00' }, CFG), '11:00',
    '⭐ الفردي يغلب');
  assertEq(eff({ shift:'morning' }, CFG), '10:00', 'ومن غيره الشيفت');
  assertEq(eff({ shift:'morning', scheduledStartTime:'' }, CFG), '10:00',
    'وقيمة فاضية = الشيفت (مش تجاهل الاتنين)');
  assertEq(eff({ shift:'morning', scheduledStartTime:'ابدأ بدري' }, CFG), '10:00',
    '⭐ ونص مش ميعاد بيتتجاهل — مبيكسرش الحساب');
  assertEq(eff({ scheduledStartTime:'11:00' }, CFG), '11:00',
    'موظف من غير شيفت + ميعاد فردي = الفردي');
  assertEq(eff({}, CFG), '', 'ومن غير الاتنين = مفيش ميعاد');
})();

// ============================================================
// ٤) مفيش ميعاد خالص = مفيش تأخير (مش صفر بالغلط)
// ============================================================
(function(){
  assertEq(S.window.computeLate(at(14, 0), { id:'e3' }, CFG).lateMin, 0,
    'موظف من غير شيفت ولا ميعاد: مفيش تأخير محسوب');
  assertEq(S.window.computeLate(null, { shift:'morning' }, CFG).lateMin, 0,
    'ومن غير وقت حضور مبتكسرش');
  assertEq(S.window.computeLate(at(11,0), 'شيفت مش موجود', CFG).lateMin, 0,
    'ومفتاح شيفت غلط = صفر مش استثناء');
})();

// ============================================================
// ٥) ⚖️ الاتساق: البداية والنهاية بنفس القاعدة
//    (كانت النهاية بتحترم الفردي والبداية لأ)
// ============================================================
(function(){
  const emp = { shift:'morning', scheduledStartTime:'11:00', scheduledEndTime:'19:00' };
  assertEq(S.window.effectiveStartHM(emp, CFG), '11:00', 'البداية بتاخد الفردي');
  const endTs = S.window.expectedShiftEndTs(
    { clockInTs: at(11, 5).getTime() }, emp, CFG);
  assertEq(new Date(endTs).getHours(), 19, '⭐ والنهاية كمان — نفس القاعدة');
})();

// ============================================================
// ٦) ⛔ الفولباك القديم اتشال فعلًا
// ============================================================
(function(){
  assert(!/!complianceCfg\.shifts\[emp\.shift\] && emp\.scheduledStartTime/.test(src),
    '⛔ الشرط اللي كان بيلغي الميعاد الفردي اتشال');
  assert(/computeLate\(new Date\(\), emp, complianceCfg\)/.test(src),
    '⭐⭐ clockIn بيبعت مستند الموظف مش مفتاح الشيفت');
  assert(/window\.effectiveStartHM = effectiveStartHM/.test(src),
    'effectiveStartHM معروضة على window');
  // شاشة "لسه محضرش" بنفس القاعدة كمان
  assert(/const hm = effectiveStartHM\(e, complianceCfg\)/.test(src),
    '⭐ وشاشة "فات ميعاده" بتستخدم نفس الدالة (مش نسخة تانية بتختلف)');
})();

// ============================================================
// ٧) الشيفت الليلي مش متأثر
// ============================================================
(function(){
  const emp = { shift:'night' };
  assertEq(S.window.computeLate(at(18, 10), emp, CFG).lateMin, 10, 'ليلي: 10 دقايق');
  const empOwn = { shift:'night', scheduledStartTime:'19:00' };
  assertEq(S.window.computeLate(at(19, 5), empOwn, CFG).lateMin, 5,
    'وبميعاد فردي: 5 دقايق');
})();

// ============================================================
// ٨) الكاش
// ============================================================
(function(){
  const sw = fs.readFileSync(path.join(ROOT,'sales','sw.js'),'utf8');
  const m = sw.match(/store-apps-shell-v(\d+)/);
  assert(!!m && Number(m[1]) >= 94, 'sales: CACHE_NAME v94+');
})();

// ============================================================
// ٩) 📩 الأذونات المعتمدة داخلة الحساب
//
// الفجوة: طلبات الإذن فيها type/dateKey/toShift ومحدش كان بيقراها.
//  · تبديل شيفت معتمد → الموظفة تيجي في ميعاد الشيفت الجديد
//    والنظام يحسبها متأخرة بفرق الشيفتين (8 ساعات = خصم أيام)
//  · إجازة معتمدة → اليوم يتحسب غياب رغم إن الأدمن وافق بنفسه
// ============================================================
const LV = [
  { empId:'e1', status:'approved', dateKey:'2026-07-10', type:'shiftSwap', toShift:'night' },
  { empId:'e1', status:'approved', dateKey:'2026-07-12', type:'dayoff' },
  { empId:'e1', status:'approved', dateKey:'2026-07-13', type:'changeDayoff' },
  { empId:'e1', status:'pending',  dateKey:'2026-07-14', type:'shiftSwap', toShift:'night' }
];

(function(){
  const find = S.window.approvedLeaveFor;
  assertEq(find('e1','2026-07-10', LV).type, 'shiftSwap', 'بيلاقي الإذن المعتمد');
  assertEq(find('e1','2026-07-14', LV), null, '⛔ والطلب المعلّق مش معتمد — مبيتحسبش');
  assertEq(find('e2','2026-07-10', LV), null, 'وموظف تاني مالوش علاقة');
  assertEq(find('e1','2026-07-11', LV), null, 'ويوم من غير إذن = null');
})();

(function(){
  S.window.allLeaveReqs = LV;
  const emp = { id:'e1', shift:'morning' };
  // 🔄 يوم فيه تبديل معتمد للشيفت الليلي (18:00)
  assertEq(S.window.effectiveStartHM(emp, CFG, '2026-07-10'), '18:00',
    '⭐⭐ يوم التبديل: الميعاد بتاع الشيفت الجديد');
  assertEq(S.window.effectiveEndHM(emp, CFG, '2026-07-10'), '02:00',
    '⭐ والنهاية كمان');
  // يوم عادي
  assertEq(S.window.effectiveStartHM(emp, CFG, '2026-07-11'), '10:00',
    'ويوم من غير إذن: الشيفت الأصلي');

  // ⭐ الحالة العملية: جت 18:05 يوم التبديل
  const at = (y,m,d,h,mi)=> new Date(y, m, d, h, mi, 0, 0);
  const r = S.window.computeLate(at(2026,6,10,18,5), emp, CFG);
  assertEq(r.lateMin, 5, '⭐⭐ جت في ميعاد الشيفت الجديد = 5 دقايق مش 485');
  assertEq(r.penalized, false, '⭐⭐ وجوه السماح = مفيش خصم');

  // 🔴 من غير قراءة الإذن (نفس اليوم بس بمفتاح الشيفت الأصلي)
  const oldWay = S.window.computeLate(at(2026,6,10,18,5), 'morning', CFG);
  assertEq(oldWay.lateMin, 485, 'إثبات: من غير الإذن كانت 485 دقيقة تأخير');

  S.window.allLeaveReqs = [];
})();

(function(){
  S.window.allLeaveReqs = LV;
  const emp = { id:'e1', dayOff:5 };   // الجمعة
  // 6→13 يوليو 2026: الاتنين → الاتنين. الجمعة 10 إجازته الأسبوعية
  const req = S.window.countRequiredWorkDaysInRange(emp,
    new Date(2026,6,6), new Date(2026,6,13));
  // 8 أيام − جمعة واحدة (10) − إجازتين معتمدتين (12 و13) = 5
  assertEq(req, 5, '⭐⭐ الأيام اللي فيها إذن معتمد مش أيام شغل مطلوبة');

  S.window.allLeaveReqs = [];
  assertEq(S.window.countRequiredWorkDaysInRange(emp, new Date(2026,6,6), new Date(2026,6,13)), 7,
    'ومن غير أذونات: 8 أيام − الجمعة = 7');
})();
