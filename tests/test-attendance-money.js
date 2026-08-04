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
const periodStart = new Date(Y, M, 1, 0,0,0,0);
const periodEnd   = new Date(Y, M, 30, 23,59,59,999);
// 1 يوليو 2026 = الأربع · يوم الإجازة = الجمعة (5)
const EMP = { id:'e1', name:'سارة', branch:'الرحاب', baseSalary:3000, dayOff:5,
              scheduledStartTime:'14:00', scheduledEndTime:'22:00' };

function calc(shifts, empOverride){
  vm.runInContext('allShifts = ' + JSON.stringify(shifts||[]) + ';', S);
  vm.runInContext('allAdvances = [];', S);
  S.window.allTimeCredit = []; S.window.deductions = []; S.window.timeCfg = CFG;
  const e = Object.assign({}, EMP, empOverride||{});
  return vm.runInContext('computeSalary(' + JSON.stringify(e)
    + ', new Date(' + periodStart.getTime() + '), new Date(' + periodEnd.getTime() + '))', S);
}
// شيفت في يوم معيّن
function sh(day){ return { employeeId:'e1', clockInTs: new Date(Y,M,day,14,10).getTime(),
                           clockOutTs: new Date(Y,M,day,22,5).getTime(), overtimeMinutes:0 }; }
// كل أيام الشهر ما عدا الجمعات (يوم إجازتها)
function allWorkDays(){
  const out = [];
  for(let d = 1; d <= 30; d++){
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
  // 🔄 تبديل: اشتغلت جمعة 3 وارتاحت الاتنين 6 بدلها
  const shifts = allWorkDays().filter(s=> new Date(s.clockInTs).getDate() !== 6);
  shifts.push(sh(3));   // الجمعة 3 يوليو
  const c = calc(shifts);
  assertEq(c.dayOffBonusDays, 0,
    '⭐⭐ تبديل إجازة = صفر أيام زيادة (كان بياخد يوم مدفوع بالغلط)');
  assertEq(c.dayOffBonusAmount, 0, 'وصفر جنيه زيادة');
  assertEq(c.netSalary, 3000, 'المرتب زي ما هو بالظبط — لا زيادة ولا نقصان');
})();

(function(){
  // 💪 شغل إضافي حقيقي: حضرت كل أيام الشغل + جمعة كمان من غير ما ترتاح بدلها
  const shifts = allWorkDays();
  shifts.push(sh(3));
  const c = calc(shifts);
  assertEq(c.dayOffBonusDays, 1, '⭐ شغل فوق المطلوب فعلًا = يوم زيادة');
  assertEq(c.dayOffBonusAmount, 100, 'بقيمة اليوم (3000 ÷ 30)');
  assertEq(c.netSalary, 3100, 'والمرتب زاد 100');
})();

(function(){
  // اشتغلت جمعتين زيادة
  const shifts = allWorkDays();
  shifts.push(sh(3)); shifts.push(sh(10));
  assertEq(calc(shifts).dayOffBonusDays, 2, 'جمعتين زيادة = يومين');
})();

(function(){
  // موظفة من غير يوم إجازة مسجّل: مفيش مكافأة إجازة أصلًا
  const c = calc(allWorkDays(), { dayOff:'' });
  assertEq(c.dayOffBonusDays, 0, 'من غير يوم إجازة مسجّل = مفيش زيادة');
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
S.window.allTimeCredit = []; S.window.deductions = [];
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
  // ⭐ الفرق بيبان لما السماح الشهري يخلص: حضرت 12 يوم بس (لحد 14 يوليو)
  //    ودلوقتي 25 يوليو. الفرق بين قبل نهاية الشيفت وبعدها = يوم خصم كامل.
  const shifts = [];
  for(let d = 1; d <= 14; d++){ if(new Date(Y,M,d).getDay() !== 5) shifts.push(sh(d)); }
  const before = calcAtNow('2026-07-25T11:00:00', shifts);   // شيفتها لسه مابدأش
  const after  = calcAtNow('2026-07-25T23:00:00', shifts);   // بعد ما خلص وماجتش
  assertEq(before.deduction, 400, '⭐ الساعة 11 الصبح: النهاردة لسه مش محسوب عليها');
  assertEq(after.deduction, 500,  '⭐ بعد نهاية الشيفت وماجتش: اليوم اتحسب غياب');
  assertEq(after.deduction - before.deduction, 100,
    '⭐⭐ الفرق يوم واحد بالظبط — الحكم بيتأجل لنهاية الشيفت مش بيتلغي');
})();

try{ fs.unlinkSync(runnerPath); }catch(e){}

// ============================================================
// ٤) نيجاتيف: الكود القديم اتشال فعلًا (مفيش عدّ لكل مرة)
// ============================================================
(function(){
  assert(!/if\(workedThatDay\) dayOffBonusDays\+\+/.test(appSrc),
    '⛔ العدّ القديم (كل مرة = يوم) اتشال');
  assert(/dayOffBonusDays = Math\.max\(0, attendedDays - elapsedWorkDays\)/.test(appSrc),
    '⭐ المكافأة بقت بالصافي (حضور − مطلوب)');
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
