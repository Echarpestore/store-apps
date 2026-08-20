// ============================================================
// 📅 test-attendance-money — الغياب ومكافأة يوم الإجازة
//
// باجين اتقفلوا هنا:
//  ١) الغياب كان بيتحسب من **دلوقتي** مش من نهاية الشيفت. الساعة 11 الصبح
//     وشيفتها بيبدأ 2 الضهر → اليوم محسوب يوم شغل مطلوب وهي لسه ماجتش
//     → غياب وخصم وهمي في لوحة المرتب قبل معادها أصلًا.
//  ٢) مكافأة "اشتغلت يوم إجازتك" كانت بتتحسب **كل مرة**: اشتغلت الجمعة
//     وارتاحت التلات بدلها (تبديل) → كانت بتاخد يوم زيادة مدفوع على
//     تبديل مش على شغل إضافي. دلوقتي بالصافي آخر الشهر.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadSalesApp } = require('./helpers/load-sales');

const ROOT = path.resolve(__dirname, '..');
const { sandbox: S } = loadSalesApp();
const appSrc = fs.readFileSync(path.join(ROOT,'sales','sales-app.js'),'utf8');
const CFG = S.window.timeCfgDefaults;

const DAY = 86400000;
const Y = 2026, M = 6;   // يوليو 2026

// ============================================================
// ١) نهاية الشيفت هي الفاصل — مش الساعة دلوقتي
// ============================================================
(function(){
  const emp = { scheduledStartTime:'14:00', scheduledEndTime:'22:00' };
  const day = new Date(Y, M, 10);
  const endTs = S.window.shiftEndTsForDay(emp, day, { shifts:{} });
  assertEq(new Date(endTs).getHours(), 22, 'نهاية شيفت اليوم 22:00');
  assertEq(new Date(endTs).getDate(), 10, 'ومن نفس اليوم');

  // شيفت بيعدّي نص الليل
  const night = { scheduledStartTime:'18:00', scheduledEndTime:'02:00' };
  const nEnd = S.window.shiftEndTsForDay(night, day, { shifts:{} });
  assertEq(new Date(nEnd).getDate(), 11, '⭐ شيفت ليلي: بيخلص تاني يوم مش نفس اليوم');
  assertEq(new Date(nEnd).getHours(), 2, 'الساعة 2 الفجر');
})();

(function(){
  const emp = { scheduledStartTime:'14:00', scheduledEndTime:'22:00' };
  const cc = { shifts:{} };
  // الساعة 11 الصبح — شيفتها لسه مابدأش
  const morning = new Date(Y, M, 10, 11, 0).getTime();
  const j1 = S.window.lastAbsenceJudgeDay(emp, morning, cc);
  assertEq(j1.getDate(), 9, '⭐ الساعة 11 الصبح: آخر يوم يتحكم عليه هو امبارح');

  // الساعة 9 بالليل — لسه في الشيفت
  const inShift = new Date(Y, M, 10, 21, 0).getTime();
  assertEq(S.window.lastAbsenceJudgeDay(emp, inShift, cc).getDate(), 9,
    '⭐ وهي لسه في الشيفت: النهاردة لسه مش محسوب');

  // بعد ما خلص
  const after = new Date(Y, M, 10, 22, 30).getTime();
  assertEq(S.window.lastAbsenceJudgeDay(emp, after, cc).getDate(), 10,
    '⭐ بعد ما الشيفت خلص: النهاردة بقى محسوب');

  // مفيش ميعاد مسجّل → اليوم بيتحسب بعد ما يخلص بالكامل
  const noSched = {};
  assertEq(S.window.lastAbsenceJudgeDay(noSched, new Date(Y,M,10,13,0).getTime(), cc).getDate(), 9,
    'موظفة من غير ميعاد: النهاردة مبيتحسبش قبل ما يخلص');
  assertEq(S.window.lastAbsenceJudgeDay(noSched, new Date(Y,M,10,23,59,59,999).getTime(), cc).getDate(), 10,
    'وبيتحسب آخر اليوم');
})();

// ============================================================
// ٢) الحساب الكامل: غياب ومكافأة إجازة
// ============================================================
const _period = S.payPeriodRange('2026-07');
const periodStart = _period.start;
const periodEnd   = _period.end;
// 1 يوليو 2026 = الأربع · يوم الإجازة = الجمعة (5)
const EMP = { id:'e1', name:'سارة', branch:'الرحاب', baseSalary:3000, dayOff:5,
              scheduledStartTime:'14:00', scheduledEndTime:'22:00' };

function calc(shifts, empOverride, leaves){
  vm.runInContext('allShifts = ' + JSON.stringify(shifts||[]) + ';', S);
  vm.runInContext('allAdvances = [];', S);
  S.window.allTimeCredit = []; S.window.deductions = []; S.window.allLeaveReqs = leaves || [];
/* 🛡️ حارس أول شهر — بنجرّبه هنا بالظبط.
   المحرك الأسبوعي بيمدّ لورا ويحاسب أسبوع ٢٧ يونيو→٣ يوليو في مرتب
   يوليو. السيناريو ده مفيهوش بيانات يونيو خالص (زي أول شهر تشغيل)،
   فمن غير الحارس الموظفة الملتزمة بتظهر غايبة ٤ أيام وبيتخصم منها
   ٤٠٠ ج.م حقيقية. weeklyStartFloor بيمنع الحكم قبل تاريخه. */
S.window.timeCfg = Object.assign({}, S.window.timeCfgDefaults, { weeklyStartFloor: '2026-07-01' }); S.window.timeCfg = CFG;
  const e = Object.assign({}, EMP, empOverride||{});
  return vm.runInContext('computeSalary(' + JSON.stringify(e)
    + ', new Date(' + periodStart.getTime() + '), new Date(' + periodEnd.getTime() + '))', S);
}
// شيفت في يوم معيّن
function sh(day){ return { employeeId:'e1', clockInTs: new Date(Y,M,day,14,0).getTime(),
                           clockOutTs: new Date(Y,M,day,22,0).getTime(), overtimeMinutes:0 }; }
// 🗓️ شيفت في يوم من يونيو (الشهر اللي قبله)
// ⚠️ لازم: المحرك الأسبوعي بيحاسب الأسبوع في الشهر اللي **بيخلص** فيه،
//    فمرتب يوليو بيقرا آخر أيام يونيو (أسبوع ٢٧ يونيو → ٣ يوليو).
//    من غير الأيام دي الموظفة الملتزمة بتبان غايبة ٤ أيام.
function shJun(day){ return { employeeId:'e1', clockInTs: new Date(Y,M-1,day,14,10).getTime(),
                              clockOutTs: new Date(Y,M-1,day,22,5).getTime(), overtimeMinutes:0 }; }
// كل أيام الشهر ما عدا الجمعات (يوم إجازتها) + ذيل يونيو
function allWorkDays(){
  const out = [];
  for(let d = 27; d <= 30; d++){          // ٢٧→٣٠ يونيو (مفيهمش جمعة)
    if(new Date(Y,M-1,d).getDay() !== 5) out.push(shJun(d));
  }
  for(let d = 1; d <= 31; d++){
    if(new Date(Y,M,d).getDay() !== 5) out.push(sh(d));
  }
  return out;
}

(function(){
  // حضرت كل أيام الشغل، وماشتغلتش ولا جمعة → مفيش غياب ومفيش زيادة
  const c = calc(allWorkDays());
  assertEq(c.deductionAmount, 0, 'حضور كامل = مفيش خصم غياب');
  assertEq(c.dayOffBonusDays, 0, 'وماشتغلتش إجازة = مفيش زيادة');
  assertEq(c.netSalary, 3000, 'المرتب زي ما هو');
})();

(function(){
  // 🔄 تبديل **جوه نفس الأسبوع**: اشتغلت جمعة 10 وارتاحت الاتنين 6
  //    (الاتنين في أسبوع ٤→١٠ يوليو)
  const shifts = allWorkDays().filter(s=>{
    const d = new Date(s.clockInTs);
    return !(d.getMonth() === M && d.getDate() === 6);
  });
  shifts.push(sh(10));   // الجمعة 10 يوليو — يوم عمل بعد نقل الإجازة للاتنين 6
  const leaves = [{ empId:'e1', status:'approved', type:'changeDayoff', dateKey:'2026-07-06', decidedAt:1 }];
  const c = calc(shifts, null, leaves);
  assertEq(c.dayOffBonusDays, 0,
    '⭐⭐ تبديل جوه نفس الأسبوع = صفر أيام زيادة (كان بياخد يوم مدفوع بالغلط)');
  assertEq(c.dayOffBonusAmount, 0, 'وصفر جنيه زيادة');
  assertEq(c.extraOffDays, 0, 'وصفر خصم');
  assertEq(c.netSalary, 3000, 'المرتب زي ما هو بالظبط — لا زيادة ولا نقصان');
})();

(function(){
  /* ⛔ تبديل **بين أسبوعين** — مش بيتعوّض (قرار المالك: كل أسبوع لوحده)
     اشتغلت جمعة ١٠ (أسبوع ٤→١٠) وارتاحت الاتنين ١٣ (أسبوع ١١→١٧).
     أسبوع فيه زيادة وأسبوع فيه نقص — والاتنين **مبيلغوش بعض**.
     المرتب في الآخر زي ما هو (يوم بيوم)، بس التفصيل بيبان صح. */
  const shifts = allWorkDays().filter(s=>{
    const d = new Date(s.clockInTs);
    return !(d.getMonth() === M && d.getDate() === 13);
  });
  shifts.push(sh(10));
  const c = calc(shifts);
  assertEq(c.dayOffBonusDays, 1, '⭐⭐ الأسبوع اللي اشتغلت فيه إجازتها = يوم زيادة');
  assertEq(c.extraOffDays, 1,   '⭐⭐ والأسبوع اللي ارتاحت فيه يوم زيادة = يوم خصم');
  assertEq(c.netSalary, 3000,   'والصافي زي ما هو — بس التفصيل مش متخبّي');
})();

(function(){
  // 💪 شغل إضافي حقيقي: حضرت كل أيام الشغل + جمعة كمان من غير ما ترتاح بدلها
  const shifts = allWorkDays();
  shifts.push(sh(10));
  const c = calc(shifts);
  assertEq(c.dayOffBonusDays, 1, '⭐ شغل فوق المطلوب فعلًا = يوم زيادة');
  assertEq(c.dayOffBonusAmount, 100, 'بقيمة اليوم (3000 ÷ 30)');
  assertEq(c.netSalary, 3100, 'والمرتب زاد 100');
})();

(function(){
  // اشتغلت جمعتين زيادة
  const shifts = allWorkDays();
  shifts.push(sh(10)); shifts.push(sh(17));
  assertEq(calc(shifts).dayOffBonusDays, 2, 'جمعتين زيادة = يومين');
})();

(function(){
  // يوم الإجازة المحدد هو مصدر الحقيقة: الجمعة off، والأحد off لموظفة مختلفة.
  const fri = calc(allWorkDays(), { dayOff:5 });
  const sun = calc(allWorkDays(), { dayOff:0 });
  assert(fri.dayOffDates.some(function(d){ return d === '2026-07-10'; }),
    '⭐ يوم الإجازة المحدد للموظفة ظاهر صراحة في كشف المرتب');
  assert(sun.dayOffDates.some(function(d){ return d === '2026-07-12'; }),
    '⭐ تغيير يوم الإجازة يغيّر اليوم المعفى فعليًا — مش إجازة عامة عشوائية');
})();

// ============================================================
// ٣) الغياب في شهر لسه شغال: اليوم الحالي مبيتحسبش قبل ما الشيفت يخلص
//    (بنشغّل الحساب في عملية منفصلة بساعة مزيّفة)
// ============================================================
const RUNNER = `
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const [ , , root, nowIso, shiftsJson, empJson ] = process.argv;
const NOW = new Date(nowIso).getTime();
// ساعة مزيّفة قبل ما الملف يتحمّل — computeSalary بتنادي new Date() جواها
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(){ if(arguments.length === 0) super(NOW); else super(...arguments); }
  static now(){ return NOW; }
}
global.Date = FakeDate;
const { loadSalesApp } = require(path.join(root, 'tests', 'helpers', 'load-sales'));
const { sandbox: S } = loadSalesApp();
S.Date = FakeDate;
vm.runInContext('allShifts = ' + shiftsJson + ';', S);
vm.runInContext('allAdvances = [];', S);
S.window.allTimeCredit = []; S.window.deductions = []; S.window.allLeaveReqs = [];
/* 🛡️ حارس أول شهر — بنجرّبه هنا بالظبط.
   المحرك الأسبوعي بيمدّ لورا ويحاسب أسبوع ٢٧ يونيو→٣ يوليو في مرتب
   يوليو. السيناريو ده مفيهوش بيانات يونيو خالص (زي أول شهر تشغيل)،
   فمن غير الحارس الموظفة الملتزمة بتظهر غايبة ٤ أيام وبيتخصم منها
   ٤٠٠ ج.م حقيقية. weeklyStartFloor بيمنع الحكم قبل تاريخه. */
S.window.timeCfg = Object.assign({}, S.window.timeCfgDefaults, { weeklyStartFloor: '2026-07-01' });
const start = new RealDate(2026, 6, 1, 0,0,0,0).getTime();
const end   = new RealDate(2026, 6, 30, 23,59,59,999).getTime();
const c = vm.runInContext('computeSalary(' + empJson + ', new Date(' + start + '), new Date(' + end + '))', S);
process.stdout.write(JSON.stringify({ absence: c.extraOffDays, deduction: c.deductionAmount, bonus: c.dayOffBonusDays }));
`;
const runnerPath = path.join(require('os').tmpdir(), 'att-now-' + process.pid + '.js');
fs.writeFileSync(runnerPath, RUNNER);
function calcAtNow(nowIso, shifts, emp){
  const out = require('child_process').execFileSync(process.execPath,
    [runnerPath, ROOT, nowIso, JSON.stringify(shifts), JSON.stringify(emp || EMP)],
    { encoding:'utf8', timeout: 20000 });
  return JSON.parse(out);
}

(function(){
  // 15 يوليو الساعة 11 الصبح — حضرت كل الأيام اللي فاتت، والنهاردة لسه بدري
  const shifts = [];
  for(let d = 1; d <= 14; d++){ if(new Date(Y,M,d).getDay() !== 5) shifts.push(sh(d)); }
  const r = calcAtNow('2026-07-15T11:00:00', shifts);
  assertEq(r.absence, 0, '⭐⭐ الساعة 11 الصبح: مفيش غياب — شيفتها لسه مابدأش');
  assertEq(r.deduction, 0, '⭐ ومفيش خصم وهمي في لوحة المرتب');
})();

(function(){
  /* ⭐ الفرق بين قبل نهاية الشيفت وبعدها = يوم خصم كامل.
     حضرت لحد ١٤ يوليو بس، ودلوقتي ٢٨ يوليو (تلات).
     ⚠️ اليوم اتغيّر من ٢٥ لـ٢٨ عن قصد: **٢٥ يوليو سبت** = أول يوم في
        الأسبوع، فهو إجازتها المستحقة وغيابه فيه **مش** خصم. الاختبار
        القديم كان بيفترض إن أي يوم زيادة = خصم، وده مش صح مع القاعدة
        الأسبوعية. (السبت نفسه متختبر تحت.) */
  const shifts = [];
  for(let d = 1; d <= 14; d++){ if(new Date(Y,M,d).getDay() !== 5) shifts.push(sh(d)); }
  const before = calcAtNow('2026-07-28T11:00:00', shifts);   // شيفتها لسه مابدأش
  const after  = calcAtNow('2026-07-28T23:00:00', shifts);   // بعد ما خلص وماجتش
  assertEq(before.deduction, 1100, '⭐ الساعة 11 الصبح: النهاردة لسه مش محسوب عليها');
  assertEq(after.deduction, 1200,  '⭐ بعد نهاية الشيفت وماجتش: اليوم اتحسب غياب');
  assertEq(after.deduction - before.deduction, 100,
    '⭐⭐ الفرق يوم واحد بالظبط — الحكم بيتأجل لنهاية الشيفت مش بيتلغي');
})();

(function(){
  /* 🗓️ الإجازة الأسبوعية هي اليوم المحدد للموظفة (الجمعة)، مش أول يوم في الأسبوع.
     ٢٥ يوليو ٢٠٢٦ سبت = يوم عمل، فغيابه لازم يزوّد الخصم يومًا. */
  const shifts = [];
  for(let d = 1; d <= 14; d++){ if(new Date(Y,M,d).getDay() !== 5) shifts.push(sh(d)); }
  const sat = calcAtNow('2026-07-25T23:00:00', shifts);
  const fri = calcAtNow('2026-07-24T23:00:00', shifts);
  assertEq(sat.deduction - fri.deduction, 100,
    '⭐⭐ السبت يوم عمل لأن إجازتها الجمعة — غيابه يزوّد خصم يوم واحد');
})();

try{ fs.unlinkSync(runnerPath); }catch(e){}

// ============================================================
// ٤) نيجاتيف: الكود القديم اتشال فعلًا (مفيش عدّ لكل مرة)
// ============================================================
(function(){
  assert(!/if\(workedThatDay\) dayOffBonusDays\+\+/.test(appSrc),
    '⛔ العدّ القديم (كل مرة = يوم) اتشال');
  assert(/const dayOffBonusHours = attendance\.workedDayOffHours;/.test(appSrc),
    '⭐ مكافأة يوم الإجازة من ساعات الحضور الفعلية في محرك المرتب الواحد');
  assert(!/const extraOffDays = Math\.max\(0, absenceDays - dayOffOccurrences\)/.test(appSrc),
    '⭐⭐ والسطر اللي كان بيدي ٤ أيام غياب مجانية اتشال');
  assert(/lastAbsenceJudgeDay\(emp/.test(appSrc), 'والغياب مربوط بنهاية الشيفت');
})();

// ============================================================
// ٥) القاعدة الذهبية + الكاش
// ============================================================
(function(){
  ['shiftEndTsForDay','lastAbsenceJudgeDay'].forEach(function(n){
    assert(new RegExp('window\\.' + n + ' *= *' + n).test(appSrc), n + ' معروضة على window');
  });
  const sw = fs.readFileSync(path.join(ROOT,'sales','sw.js'),'utf8');
  const m = sw.match(/store-apps-shell-v(\d+)/);
  assert(!!m && Number(m[1]) >= 92, 'sales: CACHE_NAME v92+');
})();
