// ============================================================
// 📅 test-payroll-cycle — دورة القبض (يوم 6)
//
// اللي الاختبار ده اتكتب عشانه (3 باجات، أول شهر بيتصرف من البرنامج):
//   1) شاشة المرتبات كانت مربوطة بالشهر **الجاري**: يوم 6 أغسطس المالك
//      بيصرف شهر 7، والشاشة بتفتح على أغسطس وزرارها مقفول "لحد ما الشهر
//      يخلص" — يعني مرتب يوليو مكانش ليه طريق أصلًا في التطبيق.
//   2) نافذة السلف في المرتب كانت لآخر الشهر التقويمي، فسلفة 3 أغسطس
//      مكانتش بتتخصم من مرتب يوليو (اللي بيتصرف 6 أغسطس) وبتتأجل شهر —
//      **بينما سقفها الشهري كان محسوب على الدورة الصح**. تناقض بين
//      الحاجة اللي بتمنع السلفة والحاجة اللي بتخصمها.
//   3) `closeDay` كان بيتحفظ في الإعدادات و**مبيتقراش** في الليسنر —
//      فالنافذة والسقف وdورة كل سلفة جديدة كلهم اشتغلوا بنص إعداد.
//
// ⚠️ سلوكي: بيستخرج computeSalary الحقيقية ويشغّلها في VM على بيانات
//    فيها سلف على الحدود بالظبط (يوم 6 ويوم 7) — مش بيدوّر على نصوص.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'sales', 'sales-app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'sales', 'index.html'), 'utf8');

function stripComments(s){
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
// استخراج بالأقواس المتوازنة — مش regex (الدرس المتسجّل في الهاندوف)
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

const WANTED = [
  'function caiParts(', 'function caiOffsetMs(', 'function cai(', 'function caiNow(',
  'function caiStamp(', 'function caiDayStart(', 'function caiDayEnd(',
  'function _fmtKey(', 'function caiDayKey(', 'function payDayOfMonth(', 'function _mkKey(', 'function payCycleKeyOfDate(',
  'function advPayCycleOf(', 'function payPeriodRange(', 'function defaultPayPeriodKey(',
  'function payPeriodOptions(', 'function _nextMonthKey(', 'function attendedDaysDetail(',
  'function getMonthDateRange(', 'function getMonthLabel(', 'function countDayOffOccurrencesInRange(',
  'function countAttendedDaysInRange(', 'function countRequiredWorkDaysInRange(',
  // 🗓️ محرك الإجازات الأسبوعي — computeSalary بقت بتناديه، فمن غيره بتقع
  'function countAbsenceDaysInRange(', 'function _timeCfgNow(',
  'function effectiveDayOffKey(', 'function payrollAttendanceBalance(',
  'function weekStartKeyOf(', 'function shiftCountsAsDay(', 'function weeklyOffBalance(',
  'function payrollDateFromKey(', 'function payrollCalendarDaysInRange(', 'function computeSalary(',
];
const parts = [];
let missing = null;
WANTED.forEach(h=>{
  const f = extractFn(src, h);
  if(!f && !missing) missing = h;
  if(f) parts.push(f);
});
assert(!missing, 'كل الدوال المطلوبة اتلقت في المصدر' + (missing ? ' — ناقص: ' + missing : ''));

// يوم القبض الافتراضي بيتقرا من المصدر نفسه — مش رقم مكرر في الاختبار
const _pf = src.match(/const PAYDAY_FALLBACK = (\d+);/);
const _tzc = src.match(/const CAI_TZ = '([^']+)'/);
assert(!!_tzc && _tzc[1] === 'Africa/Cairo', 'التوقيت مثبّت على القاهرة');
assert(!!_pf && Number(_pf[1]) === 6, 'يوم القبض الافتراضي = 6');

const STUBS = `
const CAI_TZ = '${_tzc ? _tzc[1] : 'Africa/Cairo'}';
const _caiFmt = new Intl.DateTimeFormat('en-GB', { timeZone: CAI_TZ, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
const PAYDAY_FALLBACK = ${_pf ? Number(_pf[1]) : 6};
var timeCfgDefaults = { hoursPerDay: 8 };
var complianceCfg = null;
function isSetupShift(){ return false; }
function tcCounts(){ return false; }
function monthlyTimeSummary(){ return { totalHours: 0, days: 0 }; }
function lastAbsenceJudgeDay(){ return Date.now() + 1e12; }   // مفيش قص على الحكم
function approvedLeaveFor(){ return null; }
function _dayKeyOf(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
`;

function makeCtx(opts){
  const win = { advCfg: { maxPerMonth: 0, openDay: 12, closeDay: (opts.closeDay === undefined ? 6 : opts.closeDay) }, deductions: [], allTimeCredit: [], allLeaveReqs: [] };
  const ctx = {
    window: win, console: { warn(){}, log(){} },
    allShifts: opts.shifts || [], allAdvances: opts.advances || [],
  };
  win.allShifts = ctx.allShifts;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(STUBS + '\n' + parts.join('\n'), ctx, { timeout: 5000 });
  return ctx;
}

const EMP = { id: 'e1', name: 'سارة', baseSalary: 3000, dayOff: 5, branch: 'الرحاب' };  // إجازتها الجمعة
const adv = (id, dateStr, amount, src_) => ({
  id, employeeId: 'e1', amount, date: dateStr, source: src_ || 'cash',
  ts: new Date(dateStr + 'T12:00:00').getTime(),
});

// ============================================================
// ١) 🗓️ حدود الدورة — يوم 6 هو الفاصل
// ============================================================
(function(){
  const c = makeCtx({});
  const K = (s)=> c.payCycleKeyOfDate(new Date(s + 'T12:00:00'), 6);
  assert(K('2026-08-03') === '2026-07', 'سلفة 3 أغسطس على دورة يوليو (اللي بتتصرف 6 أغسطس)');
  assert(K('2026-08-06') === '2026-07', '⭐ يوم 6 نفسه لسه على يوليو (\"لحد يوم 6\")');
  assert(K('2026-08-07') === '2026-08', '⭐ يوم 7 أول يوم في دورة أغسطس');
  assert(K('2026-08-31') === '2026-08', 'آخر الشهر على أغسطس');
  assert(K('2026-01-02') === '2025-12', 'عبور السنة: 2 يناير على ديسمبر اللي فات');
  // من غير يوم قبض = الشهر التقويمي زي الأول (توافق)
  assert(c.payCycleKeyOfDate(new Date('2026-08-03T12:00:00'), 0) === '2026-08', 'payDay=0 → سلوك قديم');
})();

// ============================================================
// ٢) 📅 الفترة المعروضة = المستحقة مش الجارية
// ============================================================
(function(){
  const c = makeCtx({});
  assert(c.defaultPayPeriodKey(new Date(2026,7,6)) === '2026-08',
    '⭐ شاشة الرواتب تفتح على الشهر الجاري أغسطس');
  assert(c.defaultPayPeriodKey(new Date(2026,7,20)) === '2026-08', 'وسط أغسطس الشاشة الافتراضية = أغسطس');
  assert(c.defaultPayPeriodKey(new Date(2026,7,30)) === '2026-08', 'آخر أغسطس الشاشة الافتراضية = أغسطس');
  assert(c.defaultPayPeriodKey(new Date(2026,0,5)) === '2026-01', 'يناير يفتح يناير');
  const r = c.payPeriodRange('2026-07');
  // ⚠️ الحدود دلوقتي **طوابع زمنية بتوقيت القاهرة** — قراءتها بساعة الجهاز
  //    هتدي يوم تاني، وده بالظبط الباج اللي اتقفل. فبنقراها بالقاهرة.
  const ps = c.caiParts(r.start.getTime()), pe = c.caiParts(r.end.getTime());
  assert(ps.m === 7 && ps.d === 1 && ps.hh === 0, 'الفترة بتبدأ 1 يوليو 00:00 بتوقيت القاهرة');
  assert(pe.m === 7 && pe.d === 31 && pe.hh === 23, 'وبتنتهي 31 يوليو آخر اليوم بتوقيت القاهرة');
  assert(c._nextMonthKey('2026-07') === '2026-08' && c._nextMonthKey('2026-12') === '2027-01',
    'الشهر اللي بعده (بيعدّي السنة صح)');
  assert(c.payPeriodOptions(new Date(2026,7,6), 3).join(',') === '2026-08,2026-07,2026-06',
    'قائمة الشهور بترجع للورا');
})();

// ============================================================
// ٣) ⭐⭐ السلف بتتخصم من المرتب اللي بيتصرف فعلاً
// ============================================================
(function(){
  const advances = [
    adv('a1', '2026-07-03', 200),   // دورة يونيو — مش المفروض تتخصم هنا
    adv('a2', '2026-07-20', 300),   // جوه دورة يوليو
    adv('a3', '2026-08-03', 500),   // 🔴 قبل القبض بيومين → دورة يوليو
    adv('a4', '2026-08-06', 100),   // يوم القبض نفسه → يوليو
    adv('a5', '2026-08-09', 700),   // بعد القبض → أغسطس
  ];
  const c = makeCtx({ advances });
  const july = c.payPeriodRange('2026-07');
  const aug  = c.payPeriodRange('2026-08');
  const cj = c.computeSalary(EMP, july.start, july.end);
  const ca = c.computeSalary(EMP, aug.start, aug.end);

  assert(cj.advancesTotal === 900,
    '⭐⭐ مرتب يوليو فيه سلف 20/7 + 3/8 + 6/8 = 900 (لقينا ' + cj.advancesTotal + ')');
  assert(ca.advancesTotal === 700, 'ومرتب أغسطس فيه سلفة 9/8 بس = 700 (لقينا ' + ca.advancesTotal + ')');
  assert(cj.advPrevCycle === 200, '⭐ سلفة 3/7 معروضة كتنبيه (دورة الشهر اللي فات) مش متخصومة');

  // 🔴 الحارس الأهم: مفيش سلفة بتتخصم مرتين ولا بتضيع
  const total = advances.reduce((s,a)=> s + a.amount, 0);
  const covered = cj.advancesTotal + ca.advancesTotal + cj.advPrevCycle;
  assert(covered === total, '⛔ كل سلفة اتحسبت **مرة واحدة** بالظبط (' + covered + ' من ' + total + ')');

  // نيجاتيف: النمط القديم (لآخر الشهر التقويمي) كان بيسيب 3/8 و6/8 بره يوليو
  const oldJuly = advances.filter(a=> a.ts >= july.start.getTime()
    && a.ts <= new Date(2026,6,31,23,59,59,999).getTime()).reduce((s,a)=> s+a.amount, 0);
  assert(oldJuly === 500 && oldJuly !== cj.advancesTotal,
    '🔴 نيجاتيف — القاعدة القديمة كانت بتطلّع 500 بس (فرق ' + (cj.advancesTotal - oldJuly) + ' ج.م على موظفة واحدة)');
})();

// ============================================================
// ٤) 💵 الصافي بيتغير بالسلف فعلاً (مش عرض بس)
// ============================================================
(function(){
  const base = makeCtx({ advances: [] });
  const withAdv = makeCtx({ advances: [ adv('a1','2026-08-03', 500) ] });
  const july = base.payPeriodRange('2026-07');
  const n0 = base.computeSalary(EMP, july.start, july.end).netSalary;
  const n1 = withAdv.computeSalary(EMP, july.start, july.end).netSalary;
  assert(Math.round((n0 - n1)*100)/100 === 500,
    '⭐ سلفة 3 أغسطس نزّلت صافي مرتب يوليو 500 بالظبط (' + n0 + ' → ' + n1 + ')');
})();

// ============================================================
// ٥) 🗓️ سجل أيام الشغل — بديل جهاز البصمة
// ============================================================
(function(){
  const D = (s, h)=> new Date(s + 'T' + (h||'10:05') + ':00').getTime();
  const shifts = [
    { employeeId:'e1', clockInTs: D('2026-07-01'), clockOutTs: D('2026-07-01','22:10') },
    { employeeId:'e1', clockInTs: D('2026-07-01','15:00'), clockOutTs: D('2026-07-01','23:00') }, // نفس اليوم
    { employeeId:'e1', clockInTs: D('2026-07-02'), clockOutTs: D('2026-07-02','22:00') },
    { employeeId:'e1', clockInTs: D('2026-07-03'), clockOutTs: null },                            // جمعة = إجازتها
    { employeeId:'e2', clockInTs: D('2026-07-04'), clockOutTs: D('2026-07-04','22:00') },         // موظف تاني
    { employeeId:'e1', clockInTs: D('2026-08-02'), clockOutTs: D('2026-08-02','22:00') },         // بره الفترة
  ];
  const c = makeCtx({ shifts });
  const july = c.payPeriodRange('2026-07');
  const rows = c.attendedDaysDetail('e1', july.start, july.end, EMP);

  assert(rows.length === 3, '⭐ 3 أيام حضور (اليوم اللي فيه شيفتين اتعدّ مرة واحدة) — لقينا ' + rows.length);
  assert(rows.every(r=> r.key.indexOf('2026-07') === 0), 'مفيش يوم من بره الفترة');
  assert(!rows.some(r=> r.key === '2026-07-04'), 'ومفيش أيام موظف تاني');
  const fri = rows.find(r=> r.key === '2026-07-03');
  assert(!!fri && fri.isDayOff === true, '⭐⭐ اشتغلت يوم إجازتها (الجمعة) → متعلّم إنه إجازة، ومتحسوب يوم شغل');
  const dbl = rows.find(r=> r.key === '2026-07-01');
  assert(dbl.shifts === 2 && dbl.inTs === D('2026-07-01') && dbl.outTs === D('2026-07-01','23:00'),
    'اليوم المزدوج بياخد أول دخول وآخر خروج');
  assert(rows.find(r=> r.key==='2026-07-03').outTs === null, 'شيفت مقفلش بيفضل باين إنه مقفلش');

  // العدد في المرتب لازم يطابق السجل بالظبط — ده اللي المالك هيعتمد عليه
  const calc = c.computeSalary(EMP, july.start, july.end);
  assert(calc.attendedDays === rows.length,
    '⭐⭐ العدد اللي في المرتب = عدد الأيام في السجل (' + calc.attendedDays + ' / ' + rows.length + ')');
  assert(typeof calc.elapsedWorkDays === 'number' && calc.elapsedWorkDays > 0, 'وأيام الشغل المطلوبة معروضة');
})();

// ============================================================
// ٦) 🔧 closeDay بيتقرا من الإعدادات (الباج اللي كان بيعطّل الدورة كلها)
// ============================================================
(function(){
  const bare = stripComments(src);
  assert(/closeDay:\s*Number\(d\.closeDay\)/.test(bare),
    '⭐⭐ الليسنر بيقرا closeDay من المستند (كان بيرميه)');
  assert(/window\.advCfg\s*=\s*\{[^}]*closeDay/.test(bare), 'وadvCfg الابتدائية فيها closeDay');
  // نيجاتيف: لو رجع من غير closeDay، يوم القبض يرجع للافتراضي بس الإعداد يبقى ميت
  const c0 = makeCtx({ closeDay: 0 });
  assert(c0.payDayOfMonth() === 6, 'من غير إعداد بيرجع لـ 6 (مايوقعش)');
  const c9 = makeCtx({ closeDay: 9 });
  assert(c9.payDayOfMonth() === 9, '⭐ ولو المالك غيّره لـ 9 بيتغيّر فعلًا');
  assert(c9.payCycleKeyOfDate(new Date('2026-08-08T12:00:00'), c9.payDayOfMonth()) === '2026-07',
    'والدورة بتتحرك معاه (8 أغسطس بقت على يوليو)');
})();

// ============================================================
// ٧) 💰 الدفع الجزئي للنقط + الكسور
// ============================================================
(function(){
  const bare = stripComments(src);
  assert(/data-act="paypart"/.test(bare), 'زرار "ادفع عدد معيّن" موجود');
  assert(/\[data-act="paypart"\]/.test(bare), 'وله هاندلر');
  const h = extractFn(src, 'wrap.querySelectorAll(\'[data-act="paypart"]\')');
  assert(!!h, 'اتلقى بلوك الهاندلر');
  if(h){
    assert(/n > maxPts/.test(h), '⭐ مينفعش يدفع أكتر من المستحق');
    assert(/!\(n > 0\)/.test(h), '⭐ ولا صفر أو سالب');
    assert(/if\(raw === null\) return/.test(h), 'إلغاء البروبت = مفيش كتابة');
    assert(/btn\.dataset\.busy/.test(h), 'حارس الضغطة المزدوجة (صرفتين)');
    assert(/pointsCount: n\b/.test(h), 'بيتسجل العدد المدفوع فعلًا مش الكل');
  }
  // النقط كسرية (sumPoints بيجمع أوزان) — parseInt كانت بتقص الكسر
  // ويفضل معلّق للأبد. (عدّاد التنزيلات صحيح إنه parseInt — ده عدد فعلي.)
  const payAll = extractFn(src, "wrap.querySelectorAll('[data-act=\"pay\"]')");
  assert(!!payAll, 'اتلقى هاندلر دفع الكل');
  if(payAll){
    assert(!/parseInt\(btn\.dataset\.points\)/.test(payAll),
      '⭐ مفيش parseInt على النقط (4.5 كانت بتتسجل 4 والنص يفضل معلّق للأبد)');
    assert(/parseFloat\(btn\.dataset\.points\)/.test(payAll), 'بتتسجل بالكسر');
  }
})();

// ============================================================
// ٨) 🖨️ الإيصال وشاشة الطباعة على الفترة المختارة مش الشهر الجاري
// ============================================================
(function(){
  const rcpt = extractFn(src, 'function buildSalaryReceiptPayload(');
  assert(!!rcpt, 'اتلقت دالة الإيصال');
  if(rcpt){
    assert(!/getMonthRange\(new Date\(\)\)/.test(rcpt),
      '⭐⭐ الإيصال مبيقراش نقط الشهر الجاري (كان بيطبع نقط أغسطس على إيصال يوليو)');
    assert(/periodLabel \|\| defaultPayPeriodKey/.test(rcpt), 'بياخد الفترة من العنوان المطلوب');
    assert(/أيام الشغل/.test(rcpt), 'وفيه عدد أيام الشغل');
  }
  const dlg = extractFn(src, 'window.openSalaryPrintDialog = function(');
  assert(!!dlg && /payPeriodRange\(_pk\)/.test(dlg),
    '⭐⭐ شاشة الطباعة بتحسب المرتب على نفس الفترة (كانت بتحسب الشهر الجاري وتكتب عليه اسم شهر تاني)');
})();

// ============================================================
// ٩) الشاشة: قائمة الفترة + سجل الأيام + §18
// ============================================================
(function(){
  assert(/id="salaryPeriodSelect"/.test(html) && /id="commPeriodSelect"/.test(html),
    'قائمتين لاختيار الفترة في شاشتي المرتبات والعمولات');
  const bare = stripComments(src);
  assert(/_renderPeriodPicker\('salaryPeriodSelect'/.test(bare) && /_renderPeriodPicker\('commPeriodSelect'/.test(bare),
    'والاتنين متوصّلين');
  assert(/openAttendanceDaysDialog\(/.test(bare) && /openPayrollEmployee/.test(bare), 'سجل الأيام موجود داخل تفاصيل الموظف المنظمة');
  ['payDayOfMonth','payCycleKeyOfDate','advPayCycleOf','payPeriodRange','defaultPayPeriodKey','attendedDaysDetail','_nextMonthKey']
    .forEach(n=> assert(new RegExp('window\\.' + n + ' *= *' + n).test(bare), '§18 ' + n + ' معروضة على window'));
  assert(/window\.openAttendanceDaysDialog = function/.test(bare), '§18 openAttendanceDaysDialog على window');
  const sw = fs.readFileSync(path.join(ROOT, 'sales', 'sw.js'), 'utf8');
  const m = sw.match(/store-apps-shell-v(\d+)/);
  assert(!!m && Number(m[1]) >= 102, 'sales/sw.js: CACHE_NAME v102+ (لقينا ' + (m ? m[1] : '—') + ')');
})();
