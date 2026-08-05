// ============================================================
// 🚨 test-overtime-guard — ثغرة "نسيت الانصراف"
//
// الحادثة: موظفة نسيت تسجّل الانصراف وسجّلته بعد ~24 ساعة.
//   · الأوفرتايم كان (المدة − 8:15) **من غير أي سقف ولا موافقة**
//     → 1440 − 495 = 945 دقيقة ≈ 15.75 ساعة **مدفوعة** في شيفت واحد.
//   · وفي نفس اللحظة earlyLeaveHours كان بيقارن **ساعة اليوم** بس، فالخروج
//     الساعة 11 صباحًا وشيفتها بينتهي 22:00 كان بيتقري "مشيت بدري 11 ساعة"
//     = 66 ساعة رصيد = 9 أيام خصم. نفس النسيان يدفع أو يمسح المرتب.
//
// القرارات (المالك):
//   ١) الأوفرتايم مبيتدفعش غير بموافقته — والقديم زي ما هو (مفيش أثر رجعي)
//   ٢) الشيفت المنسي مبيتقفلش تلقائي — تنبيه بس
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadSalesApp } = require('./helpers/load-sales');

const ROOT = path.resolve(__dirname, '..');
const { sandbox: S } = loadSalesApp();
const appSrc = fs.readFileSync(path.join(ROOT,'sales','sales-app.js'),'utf8');
const htmlSrc = fs.readFileSync(path.join(ROOT,'sales','index.html'),'utf8');

function extractFn(src, header){
  const i = src.indexOf(header);
  if(i < 0) return null;
  let depth = 0, started = false;
  for(let j = src.indexOf('{', i); j < src.length; j++){
    const c = src[j];
    if(c === '{'){ depth++; started = true; }
    else if(c === '}'){ depth--; if(started && depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}

const MIN = 60000, HOUR = 3600000;
const CFG = S.window.timeCfgDefaults;

// ============================================================
// ١) 🚪 الانصراف بدري بالطابع الزمني — الخروج بعد الميعاد ≠ "بدري"
// ============================================================
(function(){
  // شيفت 14:00 → 22:00 يوم 10 يوليو
  const shift = { clockInTs: new Date(2026,6,10,14,0,0).getTime() };
  const emp = { scheduledEndTime:'22:00' };
  const endTs = S.window.expectedShiftEndTs(shift, emp, { shifts:{} });
  assertEq(new Date(endTs).getHours(), 22, 'نهاية الشيفت الساعة 22 من نفس اليوم');

  // سجّلت الانصراف تاني يوم الساعة 11 صباحًا (نسيان)
  const out = new Date(2026,6,11,11,0,0);
  const withTs = S.window.earlyLeaveHours(out, '22:00', CFG, endTs);
  assertEq(withTs.earlyMin, 0, '⭐ خرجت بعد نهاية الشيفت بكتير = صفر "انصراف بدري"');
  assertEq(withTs.hours, 0,   '⭐ ومفيش أي ساعات رصيد');

  // 🔴 السلوك القديم (من غير الطابع الزمني) — ده اللي كان بيحصل فعلًا
  const oldWay = S.window.earlyLeaveHours(out, '22:00', CFG);
  assert(oldWay.earlyMin > 600,
    'إثبات الباج القديم: نفس الحالة كانت بتطلّع أكتر من 10 ساعات "بدري"');
  assert(oldWay.hours >= 60, 'يعني ~66 ساعة رصيد = تسعة أيام خصم');
})();

// ============================================================
// ٢) والانصراف بدري الحقيقي لسه شغال زي ما هو (مش عطّلناه)
// ============================================================
(function(){
  const shift = { clockInTs: new Date(2026,6,10,14,0,0).getTime() };
  const endTs = S.window.expectedShiftEndTs(shift, { scheduledEndTime:'22:00' }, { shifts:{} });
  const out = new Date(2026,6,10,21,20,0);    // مشيت 40 دقيقة بدري فعلًا
  const r = S.window.earlyLeaveHours(out, '22:00', CFG, endTs);
  assertEq(r.earlyMin, 40, 'مشيت 40 دقيقة بدري = 40 دقيقة');
  assertEq(r.hours, 4, 'و4 ساعات رصيد (كل 10 دقايق ساعة) — العقوبة زي ما هي');
})();

// شيفت بيعدّي نص الليل: نهايته تاني يوم مش نفس اليوم
(function(){
  const shift = { clockInTs: new Date(2026,6,10,18,0,0).getTime() };
  const endTs = S.window.expectedShiftEndTs(shift, { scheduledEndTime:'02:00' }, { shifts:{} });
  assert(endTs > shift.clockInTs, 'شيفت بيعدّي نص الليل: النهاية بعد البداية');
  assertEq(new Date(endTs).getDate(), 11, 'النهاية تاني يوم');
  const out = new Date(2026,6,11,2,0,0);
  assertEq(S.window.earlyLeaveHours(out, '02:00', CFG, endTs).earlyMin, 0,
    'خرجت في ميعادها بالظبط = مفيش بدري');
})();

// ============================================================
// ٣) 💰 الأهم: الأوفرتايم مبيتدفعش من غير موافقة
// ============================================================
const Y = 2026, M = 6;
const periodStart = new Date(Y, M, 1, 0,0,0,0);
const periodEnd   = new Date(Y, M, 30, 23,59,59,999);
const EMP = { id:'e1', name:'سارة', branch:'الرحاب', baseSalary:3000,
              attendanceTrackingStart:'2026-08-01' };
function calc(shifts){
  vm.runInContext('allShifts = ' + JSON.stringify(shifts||[]) + ';', S);
  vm.runInContext('allAdvances = [];', S);
  S.window.allTimeCredit = []; S.window.deductions = [];
  S.window.timeCfg = CFG;
  return vm.runInContext('computeSalary(' + JSON.stringify(EMP)
    + ', new Date(' + periodStart.getTime() + '), new Date(' + periodEnd.getTime() + '))', S);
}
// المرتب 3000 → اليوم 100 → الساعة 12.5

(function(){
  // الحادثة الحقيقية: شيفت 24 ساعة → 945 دقيقة أوفرتايم مسجّلة
  const forgotten = { employeeId:'e1', clockInTs: new Date(Y,M,10,14,0).getTime(),
    clockOutTs: new Date(Y,M,11,14,0).getTime(), overtimeMinutes: 945,
    otRequiresApproval: true, overtimeApprovedMin: 0, overtimeDecision:'pending',
    shiftMinutes: 1440, forgotClockOut: true };
  const c = calc([forgotten]);
  assertEq(c.overtimeMinutes, 0, '⭐ من غير موافقة = صفر دقيقة مدفوعة');
  assertEq(c.overtimePay, 0,     '⭐⭐ صفر جنيه — الحادثة اللي كلّفت 15 ساعة مقفولة');
  assertEq(c.overtimePendingMin, 945, 'والرقم متسجّل ومعروض إنه مستني موافقة');
  assertEq(c.netSalary, 3000, 'المرتب مالوش أي زيادة وهمية');
})();

(function(){
  // المالك اعتمد ساعة واحدة بس من الـ945 دقيقة
  const approved = { employeeId:'e1', clockInTs: new Date(Y,M,10,14,0).getTime(),
    clockOutTs: new Date(Y,M,11,14,0).getTime(), overtimeMinutes: 945,
    otRequiresApproval: true, overtimeApprovedMin: 60, overtimeDecision:'approved' };
  const c = calc([approved]);
  assertEq(c.overtimeMinutes, 60, 'المدفوع = المعتمد بالظبط');
  assertEq(c.overtimePay, 12.5,  'ساعة × (3000÷30÷8) = 12.5 ج');
  assertEq(c.overtimePendingMin, 0, 'وخرج من قايمة المستني');
  assertEq(c.netSalary, 3012.5, 'الصافي زاد بالمعتمد بس');
})();

(function(){
  // 🕰️ الشيفتات القديمة (قبل التحديث) زي ما هي — قرار المالك: مفيش أثر رجعي
  const legacy = { employeeId:'e1', clockInTs: new Date(Y,M,12,14,0).getTime(),
    clockOutTs: new Date(Y,M,12,23,0).getTime(), overtimeMinutes: 120 };
  const c = calc([legacy]);
  assertEq(c.overtimeMinutes, 120, '⭐ شيفت قديم من غير علامة الموافقة = بيتدفع زي الأول');
  assertEq(c.overtimePay, 25, 'ساعتين × 12.5 = 25 ج');
  assertEq(c.overtimePendingMin, 0, 'ومش بيظهر كمستني موافقة');
})();

(function(){
  // مرفوض صراحةً
  const rejected = { employeeId:'e1', clockInTs: new Date(Y,M,13,14,0).getTime(),
    clockOutTs: new Date(Y,M,14,10,0).getTime(), overtimeMinutes: 700,
    otRequiresApproval: true, overtimeApprovedMin: 0, overtimeDecision:'rejected' };
  const c = calc([rejected]);
  assertEq(c.overtimePay, 0, 'المرفوض = صفر');
  assertEq(c.overtimePendingMin, 0, 'ومش بيفضل معلّق في القايمة');
})();

// ============================================================
// ٤) 🚪 كشف الشيفتات المنسية — تنبيه بس، من غير قفل تلقائي
// ============================================================
(function(){
  const now = new Date(2026,6,11,12,0).getTime();
  const shifts = [
    { id:'s1', clockInTs: now - 20*HOUR, clockOutTs: null },      // منسي
    { id:'s2', clockInTs: now - 6*HOUR,  clockOutTs: null },      // شغال عادي
    { id:'s3', clockInTs: now - 30*HOUR, clockOutTs: now - 20*HOUR }, // مقفول
    { id:'s4', clockInTs: now - 14*HOUR - MIN, clockOutTs: null } // فوق 14 بدقيقة
  ];
  const f = S.window.forgottenShifts(shifts, CFG, now).map(s=> s.id);
  assertEq(f, ['s1','s4'], '⭐ بيكشف المفتوح اللي فات 14 ساعة بس');
  assertEq(S.window.forgottenShifts(shifts, { maxShiftHours: 24 }, now).map(s=>s.id), [],
    'والحد نفسه إعداد (maxShiftHours)');
  // ⛔ مفيش قفل تلقائي للشيفتات (قرار المالك: نبّهني بس)
  const co = extractFn(appSrc, 'function forgottenShifts(');
  assert(!!co && !/updateDoc|clockOutTs *:/.test(co),
    '⛔ الكاشف بيقرا بس — مبيكتبش ولا بيقفل أي شيفت');
})();

// ============================================================
// ٥) قايمة الأوفرتايم المستني
// ============================================================
(function(){
  const list = S.window.pendingOvertimeShifts([
    { id:'a', otRequiresApproval:true, overtimeMinutes:100, overtimeDecision:'pending' },
    { id:'b', otRequiresApproval:true, overtimeMinutes:100, overtimeDecision:'approved' },
    { id:'c', otRequiresApproval:true, overtimeMinutes:0,   overtimeDecision:'pending' },
    { id:'d', overtimeMinutes:300 }   // قديم — مالوش علاقة بالموافقات
  ]).map(s=> s.id);
  assertEq(list, ['a'], 'المستني بس (مش المعتمد ولا الصفر ولا القديم)');
})();

// ============================================================
// ٦) clockOut بيكتب العلامات الصح — والشيفت المنسي مبياخدش خصم بدري
//
// ⚠️ clockOut دالة async، والـ harness متزامن (بيطبع الملخّص ويخرج قبل ما
//    أي await يرجع). فلو شغّلناها هنا الاختبارات هتعدي **من غير ما تشتغل**
//    — نجاح وهمي. عشان كده بتتشغّل في عملية منفصلة ونستنى نتيجتها.
// ============================================================
const RUNNER = `
'use strict';
const fs = require('fs'), vm = require('vm');
const [ , , appPath, cfgJson, inTs, nowTs ] = process.argv;
const src = fs.readFileSync(appPath, 'utf8');
function extractFn(s, header){
  const i = s.indexOf(header); if(i < 0) return null;
  let d = 0, st = false;
  for(let j = s.indexOf('{', i); j < s.length; j++){
    if(s[j] === '{'){ d++; st = true; }
    else if(s[j] === '}'){ d--; if(st && d === 0) return s.slice(i, j + 1); }
  }
  return null;
}
const CFG = JSON.parse(cfgJson);
const IN = Number(inTs), NOW = Number(nowTs);
// بنجيب الدالتين النقيتين من الملف نفسه (مش نسخة تانية)
const box0 = { window:{}, timeCfgDefaults: CFG, _hm2min: function(x){ var p = String(x).split(':'); return (+p[0])*60 + (+p[1]); } };
vm.createContext(box0);
vm.runInContext(extractFn(src, 'function expectedShiftEndTs(') + '\\n' + extractFn(src, 'function earlyLeaveHours('), box0);

const written = {};
const box = {
  getOpenShift: function(){ return { id:'s1', clockInTs: IN }; },
  window: { employees:[{ id:'e1', name:'سارة', scheduledEndTime:'22:00' }],
            timeCfg: CFG, currentBranch:'الرحاب',
            fbAddDoc: function(){ return Promise.resolve(); }, fbCollection: function(){ return {}; }, db:{} },
  complianceCfg: { shifts:{} },
  timeCfgDefaults: CFG,
  expectedShiftEndTs: box0.expectedShiftEndTs,
  earlyLeaveHours: box0.earlyLeaveHours,
  todayStr: function(){ return '2026-07-11'; },
  doc: function(){ return {}; }, db: {}, alert: function(){}, console: console,
  updateDoc: function(ref, payload){ Object.assign(written, payload); return Promise.resolve(); },
  Math: Math, JSON: JSON, Number: Number, String: String, Promise: Promise,
  Date: class extends Date {
    constructor(v){ super(v === undefined ? NOW : v); }
    static now(){ return NOW; }
  }
};
box.globalThis = box;
vm.createContext(box);
vm.runInContext(extractFn(src, 'async function clockOut(') + '\\n;clockOut;', box);
vm.runInContext('clockOut("e1", null)', box)
  .then(function(){ process.stdout.write(JSON.stringify(written)); })
  .catch(function(e){ process.stdout.write(JSON.stringify({ error: e.message })); });
`;
const runnerPath = path.join(require('os').tmpdir(), 'ot-clockout-' + process.pid + '.js');
fs.writeFileSync(runnerPath, RUNNER);
function clockOutWritten(inTs, nowTs){
  const out = require('child_process').execFileSync(process.execPath,
    [runnerPath, path.join(ROOT,'sales','sales-app.js'), JSON.stringify(CFG), String(inTs), String(nowTs)],
    { encoding:'utf8', timeout: 15000 });
  return JSON.parse(out);
}

(function(){
  // الحادثة الحقيقية: دخلت 2 الضهر وسجّلت الانصراف تاني يوم 2 الضهر
  const w = clockOutWritten(new Date(2026,6,10,14,0).getTime(), new Date(2026,6,11,14,0).getTime());
  assert(!w.error, 'clockOut اشتغلت من غير استثناء — ' + (w.error || ''));
  assertEq(w.overtimeMinutes, 945, 'الرقم الخام متسجّل زي ما هو (للمراجعة)');
  assertEq(w.otRequiresApproval, true, '⭐ متعلّم إنه محتاج موافقة');
  assertEq(w.overtimeApprovedMin, 0, '⭐ والمعتمد صفر لحد ما المالك يقرر');
  assertEq(w.overtimeDecision, 'pending', 'وحالته "مستني"');
  assertEq(w.forgotClockOut, true, '🚨 ومتعلّم إنه نسيان انصراف');
  assertEq(w.earlyMin, 0, '⭐⭐ ومفيش خصم "انصراف بدري" على النسيان');
  assertEq(w.earlyHours, 0, 'ولا ساعات رصيد');
  assertEq(w.shiftMinutes, 1440, 'ومدة الشيفت متسجّلة للمراجعة');
})();

(function(){
  // شيفت عادي 8 ساعات وربع بالظبط
  const w = clockOutWritten(new Date(2026,6,10,13,45).getTime(), new Date(2026,6,10,22,0).getTime());
  assertEq(w.overtimeMinutes, 0, 'شيفت قياسي = صفر أوفرتايم');
  assertEq(w.forgotClockOut, false, 'ومش نسيان');
  assertEq(w.earlyMin, 0, 'وخرجت في ميعادها');
  assertEq(w.overtimeDecision, 'none', 'ومفيش حاجة مستنية موافقة');
})();

try{ fs.unlinkSync(runnerPath); }catch(e){}

// ============================================================
// ٧) الموظفة بتعرف إن الأوفرتايم مستني موافقة (مش بتفتكره مضمون)
// ============================================================
(function(){
  const fn = extractFn(appSrc, 'async function clockOut(');
  assert(!!fn && /مستني موافقة/.test(fn),
    'رسالة الانصراف بتقول إن الوقت الإضافي مستني موافقة');
})();

// ============================================================
// ٨) لوحة الاعتماد: صلاحية فلوس + الاعتماد مسقوف بالمسجّل
// ============================================================
(function(){
  assert(/id="overtimeApprovals"/.test(htmlSrc), 'لوحة الاعتماد موجودة في الشاشة');
  assert(/أوفرتايم مستني موافقتك/.test(htmlSrc), 'وبعنوان واضح');
  // 🔐 لوحة فلوس → المدير محجوب عنها (زي باقي لوحات الفلوس)
  assertEq(S.window.permOfPanelTitle('⏱️ أوفرتايم مستني موافقتك'), 'money',
    '⭐ اللوحة تحت صلاحية الفلوس — المدير مبيشوفهاش');
  const dec = extractFn(appSrc, 'async function decideOvertime(');
  assert(!!dec, 'لقينا decideOvertime');
  assert(!!dec && /Math\.min\(asked/.test(dec),
    '⭐ المعتمد مسقوف بالمسجّل — مينفعش يعتمد أكتر مما اتسجّل');
  assert(!!dec && /confirm\(/.test(dec), 'وفيه تأكيد قبل الحفظ');
})();

// ============================================================
// ٩) شريط "محتاج منك" بينبّه على الاتنين
// ============================================================
(function(){
  const pa = extractFn(appSrc, 'function pendingActions(');
  assert(!!pa, 'لقينا pendingActions');
  assert(!!pa && /forgottenShifts/.test(pa), 'بينبّه على الشيفتات المنسية');
  assert(!!pa && /pendingOvertimeShifts/.test(pa), 'وعلى الأوفرتايم المستني');
  assert(!!pa && /'money','money','⏱️'/.test(pa),
    'وتنبيه الأوفرتايم تحت صلاحية الفلوس (المالك بس)');
})();

// ============================================================
// ١٠) القاعدة الذهبية + إصدار الكاش
// ============================================================
(function(){
  ['expectedShiftEndTs','forgottenShifts','pendingOvertimeShifts','renderOvertimeApprovals','decideOvertime']
    .forEach(function(n){
      assert(new RegExp('window\\.' + n + ' *= *' + n).test(appSrc), n + ' معروضة على window');
    });
  assert(typeof S.window.forgottenShifts === 'function', 'وفعلًا موجودة بعد التحميل');
  const sw = fs.readFileSync(path.join(ROOT,'sales','sw.js'),'utf8');
  const m = sw.match(/store-apps-shell-v(\d+)/);
  assert(!!m && Number(m[1]) >= 91, 'sales: CACHE_NAME v91+');
})();

// ============================================================
// ١١) 🖥️ اللوحة لازم تعرض اللي البانر بيعدّه — بالظبط
//
// الحادثة: البانر قال "4 مستنية موافقتك" واللوحة طلعت **فاضية**.
// سببين اتصلحوا: اللوحة كانت مفلترة بفرع الجهاز، وكانت بتترسم في
// سلسلة طويلة — أي دالة تقع قبلها توقفها.
// ============================================================
(function(){
  const panel = extractFn(appSrc, 'function renderOvertimeApprovals(');
  assert(!!panel, 'لقينا renderOvertimeApprovals');
  if(!panel) return;
  assert(!/s\.branch === br/.test(panel),
    '⛔ اللوحة مش مفلترة بفرع الجهاز (المالك بيعتمد على الشبكة كلها)');
  assert(/pendingOvertimeShifts\(window\.allShifts \|\| \[\]\)/.test(panel),
    '⭐ بتقرا كل الشيفتات');
  assert(/s\.branch \?/.test(panel), '⭐ واسم الفرع ظاهر في كل سطر');

  // البانر بنفس النطاق — وإلا رقم يقول حاجة وشاشة تقول تانية
  const pa = extractFn(appSrc, 'function pendingActions(');
  assert(!!pa && /pendingOvertimeShifts\(window\.allShifts\|\|\[\]\)/.test(pa),
    '⭐⭐ البانر بيعدّ نفس نطاق اللوحة بالظبط');

  // معزولة عن السلسلة
  assert(/try\{ renderOvertimeApprovals\(\); \}catch/.test(appSrc),
    '⭐⭐ الرسم معزول في try — دالة تانية تقع مبتوقفهاش');
  assert(/try\{ renderRewardBudget\(\); \}catch/.test(appSrc), 'ونفس الحاجة للمكافآت');
  assert(/if\(id === 'money'\)/.test(appSrc),
    '⭐ وبتترسم من تاني مع فتح تبويب الفلوس مش مرة واحدة عند التحميل');
})();
