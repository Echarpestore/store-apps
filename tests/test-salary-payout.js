// ============================================================
// 💵 test-salary-payout — صرف المرتب والنقط مع بعض يوم القبض
//
// القرار: النقط بتتصرف **مع المرتب** آخر الشهر مش من شاشة لوحدها.
// وده بيفتح أخطر باب في النظام كله: **نفس النقط تتصرف مرتين** (مرة مع
// المرتب ومرة من شاشة العمولات). فالاختبارات هنا كلها على الحارس ده:
//   • شاشة العمولات وشاشة المرتب بيقروا من **دالة واحدة** (commissionDueFor)
//   • أول ما الصرف يتسجل، المستحق يبقى صفر فورًا
//   • خانة عدد النقط مستحيل تعدّي المستحق مهما اتكتب فيها
//
// والإيصال لازم يطلع بكل التفاصيل: الاسم · الأساسي · أيام الشغل · الأوفرتايم
// · الغياب · رصيد الوقت · السلف · المشتريات · النقط · الإجمالي المستلم.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'sales', 'sales-app.js'), 'utf8');

function stripComments(s){
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
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
  'function pointWeight(', 'function sumPoints(', 'function fmtPts(', 'function commissionDueFor(',
  'function payoutBreakdown(', 'function buildSalaryReceiptPayload(',
  'function payPeriodLabelAr(', 'function defaultPayPeriodKey(', 'function _mkKey(',
];
const parts = [];
let missing = null;
WANTED.forEach(h=>{
  const f = extractFn(src, h);
  if(!f && !missing) missing = h;
  if(f) parts.push(f);
});
assert(!missing, 'الدوال المطلوبة اتلقت' + (missing ? ' — ناقص: ' + missing : ''));

const STUBS = `
var commissionPerPoint = 5;
var _tgtCache = { month: '2026-07', rows: [], loading: false };
var _targetTo = null;
function _refIsActive(r){ return !r.status || r.status === 'active'; }
function _targetInfoFor(){ return _targetTo; }
`;

function ctxWith(o){
  const win = { points: o.points || [], appReferrals: o.refs || [] };
  const ctx = {
    window: win, console: { warn(){}, log(){} },
    allCommissionPayments: o.payments || [],
    allSalaryPayments: o.salaryPayments || [],
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(STUBS + '\n' + parts.join('\n'), ctx, { timeout: 5000 });
  if(o.target !== undefined) ctx._targetTo = o.target;
  if(o.tgtMonth !== undefined) ctx._tgtCache.month = o.tgtMonth;
  return ctx;
}

const EMP = { id: 'e1', name: 'سارة', branch: 'الرحاب' };
const JUL = new Date(2026, 6, 15).getTime();
const pt = (w)=> ({ employeeId: 'e1', ts: JUL, value: w });

// ============================================================
// ١) المستحق = الكل ناقص اللي اتدفع
// ============================================================
(function(){
  const c = ctxWith({ points: [pt(10), pt(5.5)] });
  const d = c.commissionDueFor(EMP, '2026-07');
  assert(d.ptsTotal === 15.5, 'إجمالي النقط بالوزن الكسري (' + d.ptsTotal + ')');
  assert(d.ptsDue === 15.5 && d.ptsDueAmt === 77.5, 'المستحق 15.5 نقطة × 5 = 77.5');
  assert(d.totalDue === 77.5, 'وإجمالي المستحق');
})();

// ============================================================
// ٢) ⭐⭐ الصرف مرة واحدة — الحارس الأهم
// ============================================================
(function(){
  const paid = [{ employeeId:'e1', monthLabel:'2026-07', pointsCount:15.5, commissionAmount:77.5, withSalary:true }];
  const c = ctxWith({ points: [pt(10), pt(5.5)], payments: paid });
  const d = c.commissionDueFor(EMP, '2026-07');
  assert(d.ptsDue === 0 && d.ptsDueAmt === 0,
    '⭐⭐ بعد ما اتصرفت مع المرتب، شاشة العمولات مبقاش عندها مستحق (' + d.ptsDue + ')');
  assert(d.ptsPaid === 15.5 && d.ptsPaidAmt === 77.5, 'وبتفضل ظاهرة إنها اتدفعت');
  assert(d.totalDue === 0, 'وإجمالي المستحق صفر');

  // دفع جزئي: الباقي بس هو اللي يفضل مستحق
  const c2 = ctxWith({ points: [pt(10), pt(5.5)],
    payments: [{ employeeId:'e1', monthLabel:'2026-07', pointsCount:10, commissionAmount:50 }] });
  const d2 = c2.commissionDueFor(EMP, '2026-07');
  assert(d2.ptsDue === 5.5 && d2.ptsDueAmt === 27.5, '⭐ الدفع الجزئي بيسيب الباقي بالظبط (5.5 نقطة)');

  // شهر تاني مش بيأثر
  const c3 = ctxWith({ points: [pt(10)],
    payments: [{ employeeId:'e1', monthLabel:'2026-06', pointsCount:10, commissionAmount:50 }] });
  assert(c3.commissionDueFor(EMP, '2026-07').ptsDue === 10, 'دفع شهر 6 مبيقفلش مستحق شهر 7');

  // موظف تاني مش بيأثر
  const c4 = ctxWith({ points: [pt(10)],
    payments: [{ employeeId:'e2', monthLabel:'2026-07', pointsCount:10, commissionAmount:50 }] });
  assert(c4.commissionDueFor(EMP, '2026-07').ptsDue === 10, 'ودفع موظف تاني كمان');
})();

// ============================================================
// ٣) 🛡️ خانة عدد النقط — مستحيل تعدّي المستحق
// ============================================================
(function(){
  const c = ctxWith({ points: [pt(20)] });
  const due = c.commissionDueFor(EMP, '2026-07');       // 20 نقطة = 100 ج.م
  const calc = { netSalary: 2800 };

  const all = c.payoutBreakdown(calc, due, { pts: 20, ref: false, tgt: false }, 5);
  assert(all.total === 2900 && all.ptsAmt === 100, 'الكل: 2800 + 100 = 2900');
  assert(all.ptsLeft === 0, 'ومش فاضل حاجة');

  const part = c.payoutBreakdown(calc, due, { pts: 8, ref: false, tgt: false }, 5);
  assert(part.ptsAmt === 40 && part.total === 2840, 'عدد معيّن: 8 نقط = 40 ج.م');
  assert(part.ptsLeft === 12, '⭐ و12 نقطة بتفضل مستحقة');

  const over = c.payoutBreakdown(calc, due, { pts: 999, ref: false, tgt: false }, 5);
  assert(over.pts === 20 && over.total === 2900,
    '⭐⭐ كتب 999 نقطة → اتقصّت على المستحق (' + over.pts + ') مش على 999');
  const neg = c.payoutBreakdown(calc, due, { pts: -5, ref: false, tgt: false }, 5);
  assert(neg.pts === 0 && neg.total === 2800, '⛔ رقم سالب = صفر مش خصم من المرتب');
  const junk = c.payoutBreakdown(calc, due, { pts: NaN, ref: false, tgt: false }, 5);
  assert(junk.pts === 0 && junk.total === 2800, 'خانة فاضية/غلط = صفر');
})();

// ============================================================
// ٤) 📱🎯 التنزيلات والتارجت اختياريين
// ============================================================
(function(){
  const c = ctxWith({
    points: [], refs: [{ employeeId:'e1', ts: JUL, amount: 20 }, { employeeId:'e1', ts: JUL, amount: 20 }],
    target: { achieved: true, amount: 150, empSales: 15000 }, tgtMonth: '2026-07',
  });
  const due = c.commissionDueFor(EMP, '2026-07');
  assert(due.refDueCount === 2 && due.refDueAmt === 40, 'تنزيلين = 40 ج.م');
  assert(due.tgtDueAmt === 150, 'وتارجت 150');
  const calc = { netSalary: 3000 };
  assert(c.payoutBreakdown(calc, due, { pts:0, ref:true,  tgt:true  }, 5).total === 3190, 'الاتنين داخلين');
  assert(c.payoutBreakdown(calc, due, { pts:0, ref:false, tgt:true  }, 5).total === 3150, 'من غير تنزيلات');
  assert(c.payoutBreakdown(calc, due, { pts:0, ref:false, tgt:false }, 5).total === 3000, 'من غير الاتنين');

  // 🎯 تارجت من فترة تانية لسه بيتحمّل → مبيتحسبش (كان هيصرف تارجت الشهر الغلط)
  const stale = ctxWith({ target: { achieved: true, amount: 150, empSales: 15000 }, tgtMonth: '2026-08' });
  assert(stale.commissionDueFor(EMP, '2026-07').tgtDueAmt === 0,
    '⭐ بيانات تارجت لسه ماتحمّلتش للفترة دي = مبتتصرفش');
})();

// ============================================================
// ٥) 🧾 الإيصال — كل التفاصيل والإجمالي المستلم
// ============================================================
(function(){
  const c = ctxWith({ points: [pt(20)] });
  const calc = {
    daysInCalc: 30, proratedBase: 3000, netSalary: 2350,
    attendedDays: 27, elapsedWorkDays: 26,
    overtimePay: 100, overtimeMinutes: 120,
    dayOffBonusAmount: 100, dayOffBonusDays: 1,
    deductionAmount: 100, extraOffDays: 1,
    timeCreditDeduction: 50, timeCreditHours: 7, timeCreditDays: 1,
    adminDeductions: 100, advCash: 500, advOrders: 200, advPrevCycle: 300,
  };
  const p = c.buildSalaryReceiptPayload(EMP, calc, '2026-07');
  const label = (t)=> p.lines.some(l=> l[0].indexOf(t) >= 0);

  assert(p.empName === 'سارة' && p.branch === 'الرحاب', 'الاسم والفرع');
  assert(p.period.indexOf('1 → 30') >= 0, 'وفترة الشغل مكتوبة');
  ['الراتب الأساسي','أيام الشغل','أوفرتايم','يوم إجازة','خصم غياب','رصيد الوقت',
   'خصومات إدارية','سلف كاش','مشتريات','صافي الراتب','عمولة نقط'].forEach(t=>{
    assert(label(t), '⭐ الإيصال فيه سطر: ' + t);
  });
  assert(p.lines.some(l=> l[0].indexOf('أيام الشغل') >= 0 && String(l[1]).indexOf('27') >= 0),
    'أيام الشغل بالرقم الفعلي (27)');
  assert(p.net.value === '2450 ج.م',
    '⭐⭐ الإجمالي المستلم = صافي 2350 + عمولة 100 (لقينا ' + p.net.value + ')');
  assert(p.net.label === 'الإجمالي المستلم', 'ومكتوب إنه الإجمالي مش الصافي');
  assert(p.extraNote.indexOf('300') >= 0, '⚠️ تنبيه سلف الدورة السابقة على الإيصال');

  // لو الصرف اتسجل خلاص، الإيصال بيطبع **اللي اتصرف** مش المستحق
  const c2 = ctxWith({
    points: [pt(20)],
    payments: [{ employeeId:'e1', monthLabel:'2026-07', pointsCount:8, commissionAmount:40 }],
    salaryPayments: [{ employeeId:'e1', periodLabel:'2026-07', amount:2350 }],
  });
  const p2 = c2.buildSalaryReceiptPayload(EMP, calc, '2026-07');
  assert(p2.net.value === '2390 ج.م',
    '⭐ إيصال بعد الصرف بيطبع المدفوع فعلًا (8 نقط = 40) مش المستحق — لقينا ' + p2.net.value);
})();

// ============================================================
// ٦) الوصلات في الشاشة
// ============================================================
(function(){
  const bare = stripComments(src);
  assert(/openSalaryPayoutDialog\('\$\{e\.id\}'/.test(bare), 'زرار الصرف بيفتح شاشة الصرف');
  assert(!/data-act="paysalary"/.test(bare), '⛔ الزرار القديم (صرف المرتب لوحده) اتشال');
  const dlg = extractFn(src, 'window.openSalaryPayoutDialog = function(');
  assert(!!dlg, 'اتلقت شاشة الصرف');
  if(dlg){
    assert(/btn\.dataset\.busy/.test(dlg), '🛡️ حارس الضغطة المزدوجة');
    assert(/periodLabel === pk/.test(dlg), '🛡️ تحذير لو الفترة دي اتصرفت قبل كده');
    assert(/salaryPaymentsCol/.test(dlg) && /commissionPaymentsCol/.test(dlg),
      '⭐⭐ بيكتب صرف المرتب **ومستند العمولة** — من غير التاني النقط تتصرف تاني من شاشة العمولات');
    assert(/monthLabel: pk/.test(dlg), 'ومستند العمولة بنفس مفتاح الفترة');
    assert(/if\(s\.pts > 0\)/.test(dlg), 'مبيكتبش مستند عمولة من غير نقط');
    assert(/openSalaryPrintDialog\(emp\.id, pk\)/.test(dlg), 'وبيفتح الطباعة بعد التسجيل');
  }
  const panel = extractFn(src, 'function renderCommissionPanel(');
  assert(!!panel && /commissionDueFor\(e, monthLabel\)/.test(panel),
    '⭐⭐ شاشة العمولات بتقرا من نفس الدالة (مستحيل الرقمين يختلفوا)');
  ['commissionDueFor','payoutBreakdown','openSalaryPayoutDialog'].forEach(n=>{
    assert(new RegExp('window\\.' + n + ' *= *' + (n === 'openSalaryPayoutDialog' ? 'function' : n)).test(bare),
      '§18 ' + n + ' على window');
  });
  const sw = fs.readFileSync(path.join(ROOT, 'sales', 'sw.js'), 'utf8');
  const m = sw.match(/store-apps-shell-v(\d+)/);
  assert(!!m && Number(m[1]) >= 103, 'sales/sw.js: CACHE_NAME v103+ (لقينا ' + (m ? m[1] : '—') + ')');
})();
