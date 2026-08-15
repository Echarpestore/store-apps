// ============================================================
// 💰 test-office-money — فلوس مركز الموظفين في office (المرحلة 3)
//
// ⚠️ الاختبار الحاكم: بنشغّل **محرك sales الحقيقي** (computeSalary من
//    sales-app.js نفسه) ومحرك office (ofComputeSalary) على **نفس
//    البيانات بالظبط**، ولازم كل حقل يطلع نفس الرقم للقرش.
//    لو حد عدّل معادلة في تطبيق ونسي التاني — المرتب هيطلع رقمين
//    مختلفين حسب مين اللي فتح الشاشة — الاختبار ده بيقع فورًا.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadSalesApp } = require('./helpers/load-sales');
const { sandbox: S } = loadSalesApp();

const OFF = path.resolve(__dirname, '..', 'Office');
const src = fs.readFileSync(path.join(OFF, 'office.js'), 'utf8');

function extractFn(s, name){
  const st = s.indexOf('function ' + name + '(');
  if(st < 0) return '';
  const op = s.indexOf('{', st);
  let d = 0;
  for(let i = op; i < s.length; i++){
    if(s[i] === '{') d++;
    else if(s[i] === '}'){ d--; if(d === 0) return s.slice(st, i + 1); }
  }
  return '';
}
const ctx = { Number: Number, String: String, Math: Math, Date: Date, Object: Object, isNaN: isNaN };
ctx.globalThis = ctx;
vm.createContext(ctx);
['ofMonthDateRange', 'ofMonthRange', 'ofMonthLabel', 'ofCountDayOffInRange', 'ofCountRequiredInRange',
 'ofCountAttendedInRange', 'ofTcAmnestied', 'ofTcCounts', 'ofMonthlyTimeSummary', 'ofIsSetupShift',
 // 🗓️ المحرك الأسبوعي — لازم يتحمّل وإلا ofComputeSalary بتقع
 'ofWeekStartKey', 'ofShiftCountsAsDay', 'ofWeeklyOffBalance',
 'ofComputeSalary', 'ofCommissionCalc'].forEach(function(n){
  const f = extractFn(src, n);
  assert(f.length > 30, 'استخرجنا ' + n + ' من office.js');
  vm.runInContext(f, ctx);
});

// يوليو 2026 (31 يوم) — عشان ثغرة يوم 31 تتغطى في المقارنة
const Y = 2026, M = 6;
const periodStart = new Date(Y, M, 1, 0, 0, 0, 0);
const periodEnd = new Date(Y, M, 30, 23, 59, 59, 999);
const ts = function(day, hour){ return new Date(Y, M, day, hour || 12).getTime(); };

// تشغيل محرك sales الحقيقي على fixture
function salesCalc(emp, opts){
  opts = opts || {};
  vm.runInContext('allShifts = ' + JSON.stringify(opts.shifts || []) + ';', S);
  vm.runInContext('allAdvances = ' + JSON.stringify(opts.advances || []) + ';', S);
  S.window.allTimeCredit = opts.timeCredit || [];
  S.window.deductions = opts.deductions || [];
  S.window.timeCfg = opts.timeCfg || S.timeCfgDefaults;
  return vm.runInContext(
    'computeSalary(' + JSON.stringify(emp) + ', new Date(' + periodStart.getTime() + '), new Date(' + periodEnd.getTime() + '))', S);
}
// تشغيل محرك office على نفس الـfixture
function officeCalc(emp, opts){
  opts = opts || {};
  const tcfg = opts.timeCfg || vm.runInContext('timeCfgDefaults', S);
  return ctx.ofComputeSalary(emp, new Date(periodStart.getTime()), new Date(periodEnd.getTime()), {
    shifts: opts.shifts || [], timeCredit: opts.timeCredit || [],
    deductions: opts.deductions || [], advances: opts.advances || [],
    timeCfg: tcfg, shiftDefs: opts.shiftDefs || {}
  });
}
const FIELDS = ['proratedBase', 'overtimeMinutes', 'overtimePay', 'dayOffOccurrences', 'extraOffDays',
  'deductionAmount', 'timeCreditHours', 'timeCreditDays', 'timeCreditDeduction', 'adminDeductions',
  'dayOffBonusDays', 'dayOffBonusAmount', 'advancesTotal', 'advCash', 'advOrders', 'netSalary',
  'daysInCalc', 'notYetHired'];
function bothSame(name, emp, opts){
  const a = salesCalc(emp, opts), b = officeCalc(emp, opts);
  FIELDS.forEach(function(f){
    assertEq(b[f], a[f], name + ' — ' + f + ': office = sales بالظبط');
  });
  return a;
}

const EMP = { id:'e1', name:'سارة', branch:'الرحاب', baseSalary: 3000,
              attendanceTrackingStart: '2026-08-01' };

// ============================================================
// 1) 🔒 التطابق الحرفي بين المحركين — سيناريو سيناريو
// ============================================================
(function(){
  // شهر نضيف
  const a = bothSame('شهر نضيف', EMP, {});
  assertEq(a.netSalary, 3000, 'وصحّته: الصافي = الأساسي');

  // رصيد وقت 15 ساعة = يومين خصم
  bothSame('رصيد وقت', EMP, { timeCredit: [
    { employeeId:'e1', type:'late', hours: 8, date:'2026-07-05' },
    { employeeId:'e1', type:'break', hours: 4, date:'2026-07-10' },
    { employeeId:'e1', type:'early', hours: 3, date:'2026-07-20' }
  ]});

  // بند معذور + بند موظف تاني
  bothSame('معذور وموظف تاني', EMP, { timeCredit: [
    { employeeId:'e1', type:'late', hours: 14, date:'2026-07-05', excused: true },
    { employeeId:'e2', type:'late', hours: 14, date:'2026-07-06' }
  ]});

  // خصومات إدارية + وقت إضافي
  bothSame('إدارية وإضافي', EMP, {
    deductions: [{ employeeId:'e1', amount: 150, ts: ts(8) }],
    shifts: [{ employeeId:'e1', clockInTs: ts(10, 10), overtimeMinutes: 120 }]
  });

  // 💵 ثغرة يوم 31: سلفة يوم 31 لازم تتخصم في النسختين
  bothSame('سلفة يوم 31', EMP, { advances: [
    { employeeId:'e1', amount: 500, ts: ts(31, 15) },
    { employeeId:'e1', amount: 200, ts: ts(10), source:'staff_order_x' }
  ]});

  // تعيين نص الشهر (فترة جزئية)
  bothSame('تعيين نص الشهر', Object.assign({}, EMP, { hireDate: '2026-07-16' }), {});

  // اتعين بعد الفترة
  bothSame('لسه ماتعينش', Object.assign({}, EMP, { hireDate: '2026-09-01' }), {});

  // إجازة أسبوعية: غياب مسموح + مكافأة اشتغال يوم الإجازة
  const dEmp = Object.assign({}, EMP, { dayOff: 5, attendanceTrackingStart: '2026-07-01' });
  const shifts = [];
  for(let d = 1; d <= 30; d++){
    const dt = new Date(Y, M, d);
    if(dt > new Date()) break;
    shifts.push({ employeeId:'e1', clockInTs: ts(d, 10) });   // جه كل يوم حتى الجمعة
  }
  bothSame('إجازة أسبوعية ومكافأتها', dEmp, { shifts: shifts });

  // ✨ شيفت التجهيز: رصيد الوقت مش بيتحسب عليه
  bothSame('شيفت التجهيز', Object.assign({}, EMP, { shift: 'setup' }), { timeCredit: [
    { employeeId:'e1', type:'late', hours: 14, date:'2026-07-05' }
  ]});

  // 🩹 العفو الشامل
  bothSame('العفو الشامل', EMP, {
    timeCredit: [
      { employeeId:'e1', type:'late', hours: 7, date:'2026-07-03' },
      { employeeId:'e1', type:'late', hours: 7, date:'2026-07-20' }
    ],
    timeCfg: Object.assign({}, vm.runInContext('timeCfgDefaults', S), { timeAmnestyUntil: '2026-07-10' })
  });

  // 🧢 سقف أيام الخصم
  bothSame('سقف الخصم الشهري', EMP, {
    timeCredit: [{ employeeId:'e1', type:'late', hours: 30, date:'2026-07-05' }],
    timeCfg: Object.assign({}, vm.runInContext('timeCfgDefaults', S), { maxDaysPerMonth: 2 })
  });
})();

// ============================================================
// 2) ⭐ حساب العمولة — نفس لوحة sales
// ============================================================
(function(){
  const s0 = new Date(2026, 6, 1).getTime(), e0 = new Date(2026, 7, 0, 23, 59).getTime();
  const pts = [
    { employeeId:'e1', ts: ts(5) },
    { employeeId:'e1', ts: ts(6), value: 0.5 },
    { employeeId:'e1', ts: ts(7), value: 2 },
    { employeeId:'e1', ts: new Date(2026, 5, 20).getTime() },   // شهر فات
    { employeeId:'e2', ts: ts(8) }
  ];
  const pays = [
    { employeeId:'e1', monthLabel:'2026-07', pointsCount: 1, commissionAmount: 10 },
    { employeeId:'e1', monthLabel:'2026-07', pointsCount: 2, commissionAmount: 20, type:'referrals' },
    { employeeId:'e1', monthLabel:'2026-06', pointsCount: 5, commissionAmount: 50 }
  ];
  const c = ctx.ofCommissionCalc(pts, pays, 'e1', s0, e0, '2026-07', 10);
  assertEq(c.pointsMonth, 3.5, 'وزن الشهر: 1 + 0.5 + 2 (بره الشهر وموظف تاني مستبعدين)');
  assertEq(c.pointsAlreadyPaid, 1, '⛔ المدفوع = عمولة النقط بس — التنزيلات (referrals) ليها حسابها');
  assertEq(c.newPoints, 2.5, 'الجديد = 3.5 − 1');
  assertEq(c.newAmount, 25, '2.5 × 10 جنيه');

  const over = ctx.ofCommissionCalc(pts, [{ employeeId:'e1', monthLabel:'2026-07', pointsCount: 99, commissionAmount: 990 }],
    'e1', s0, e0, '2026-07', 10);
  assertEq(over.newPoints, 0, '⛔ المدفوع أكتر من المكتسب = صفر مش سالب');
})();

// ============================================================
// 3) التوصيل: كتابات الدفع بنفس حقول sales + الحراس
// ============================================================
(function(){
  const pc = src.slice(src.indexOf('window.ofHubPayComm'), src.indexOf('window.ofHubPaySalary'));
  assert(/sales_commission_payments/.test(pc), 'العمولة في نفس مجموعة sales');
  ['employeeId', 'employeeName', 'branch', 'monthLabel', 'pointsCount', 'commissionAmount', 'paidAt']
    .forEach(function(f){ assert(new RegExp(f).test(pc), 'حقل ' + f + ' موجود'); });
  assert(/confirm\(/.test(pc), 'وبتأكيد قبل الدفع');
  assert(/_ofPayBusy/.test(pc), '🛡️ وحارس الضغطتين');

  const ps = src.slice(src.indexOf('window.ofHubPaySalary'), src.indexOf('window.ofRenderPresent ='));
  assert(/sales_salary_payments/.test(ps), 'المرتب في نفس مجموعة sales');
  ['periodLabel', 'amount', 'paidAt'].forEach(function(f){ assert(new RegExp(f).test(ps), 'حقل ' + f); });
  assert(/if\(prev\.length\)\{[\s\S]{0,300}صرف متسجل بالفعل/.test(ps),
    '🛡️ تحذير الازدواج **مربوط فعلًا** بوجود صرف سابق — مش نص ميت');
  assert(/_ofPayBusy/.test(ps), '🛡️ وحارس الضغطتين');
  assert(!/\.delete\(\)/.test(pc) && !/\.delete\(\)/.test(ps), '⛔ الدفع مش بيمسح أي حاجة');

  const hm = src.slice(src.indexOf('window.ofHubMoney'), src.indexOf('window.ofHubPayComm'));
  assert(/ofComputeSalary\(/.test(hm), 'الشاشة بتحسب بالمحرك المتختبر');
  assert(/ofCommissionCalc\(/.test(hm), 'والعمولة كمان');
  assert(/egp\(/.test(hm), '🙈 وكل الفلوس بتعدي من إخفاء الأرقام');
  const sheet = extractFn(src, 'ofHubSheet') || src.slice(src.indexOf('window.ofHubSheet'), src.indexOf('window.ofHubExcuse'));
  assert(/ofHubMoney/.test(sheet) && /ofHubMoneyBox/.test(sheet),
    'الفلوس بتتحمّل بدوسة جوه الصفحة — مش مع كل فتحة (القراءات)');
})();
