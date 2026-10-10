#!/usr/bin/env node
// ============================================================
// v640 — 🏦 رصيد الوقت بدل «كل 10 دقايق = ساعة»: المحرك + الانصراف + المرتب + الحافز الأسبوعي
// قرار المالك 10-10. سلوكي: بيشغّل clockOut وcomputeSalary الحقيقيين في VM.
// ============================================================
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const TB = require(path.join(ROOT, 'sales', 'time-bank.js'));
const src = fs.readFileSync(path.join(ROOT, 'sales', 'sales-app.js'), 'utf8');
function extractFn(s, header){ const i = s.indexOf(header); if(i < 0) return null; let d = 0, st = false; for(let j = s.indexOf('{', i); j < s.length; j++){ if(s[j] === '{'){ d++; st = true; } else if(s[j] === '}'){ d--; if(st && d === 0) return s.slice(i, j + 1); } } return null; }

// ---------- ١) المحرك الخالص ----------
const D = (y,m,d,h,mi) => new Date(y, m-1, d, h||0, mi||0).getTime();
let r = TB.shiftDelta({ clockInTs: D(2026,10,5,14,20), clockOutTs: D(2026,10,5,22,0), shiftMinutes: 460, lateMinutes: 20 }, 480);
assertEq(r.delta, -20, 'اتأخر 20 ومشي في معاده = −20 د');
assertEq(r.lateMin, 20, 'التأخير محسوب');
r = TB.shiftDelta({ clockInTs: D(2026,10,5,14,20), clockOutTs: D(2026,10,5,22,30), shiftMinutes: 490, lateMinutes: 20 }, 480);
assertEq(r.delta, 10, 'اتأخر 20 وقعد 30 زيادة = +10 (التأخير اتعوّض لوحده)');
r = TB.shiftDelta({ clockInTs: D(2026,10,5,14,3), clockOutTs: D(2026,10,5,22,2), shiftMinutes: 479, lateMinutes: 3 }, 480);
assertEq(r.delta, 0, 'سلبي: 3 دقايق تأخير وفرق دقيقة = جوه السماح = صفر');
assertEq(r.lateMin, 0, 'سلبي: التأخير جوه السماح مش محسوب كتأخير');
r = TB.shiftDelta({ clockInTs: D(2026,10,5,14,0), clockOutTs: D(2026,10,6,14,0), shiftMinutes: 1440, lateMinutes: 0, forgotClockOut: true, bankAutoEnd: true }, 480);
assertEq(r.delta, 0, 'سلبي: شيفت منسي مفيهوش أوفرتايم أبدًا');
r = TB.shiftDelta({ clockInTs: D(2026,10,5,14,40), clockOutTs: D(2026,10,5,22,0), shiftMinutes: 440, lateMinutes: 40, forgotClockOut: true, bankAutoEnd: true }, 480);
assertEq(r.delta, -40, 'شيفت منسي اتقفل على الميعاد: التأخير بيتحسب بس');
r = TB.shiftDelta({ clockInTs: D(2026,10,5,14,0), clockOutTs: null, lateMinutes: 0 }, 480);
assert(!r.counted && r.reason === 'open', 'سلبي: شيفت مفتوح مش محسوب');
r = TB.shiftDelta({ clockInTs: D(2026,10,5,14,0), clockOutTs: D(2026,10,6,1,0), needsClockOutReview: true }, 480);
assert(!r.counted && r.reason === 'needs_review', 'سلبي: مقفول 1ص ولسه مش متصلّح = مش محسوب');
r = TB.shiftDelta({ clockInTs: D(2026,10,5,14,0), clockOutTs: D(2026,10,5,20,0), shiftMinutes: 360, manual: true }, 480);
assertEq(r.delta, 0, 'الشيفت اليدوي (المالك كتبه) = يوم كامل');
r = TB.shiftDelta({ clockInTs: D(2026,10,5,14,0), clockOutTs: D(2026,10,5,22,15), shiftMinutes: 495 }, 0);
assertEq(r.requiredMin, 495, 'من غير معاد مكتوب: المطلوب 8:15');

const shifts = [
  { id:'a', employeeId:'e1', clockInTs: D(2026,10,5,14,20), clockOutTs: D(2026,10,5,22,0), shiftMinutes:460, lateMinutes:20 },
  { id:'b', employeeId:'e1', clockInTs: D(2026,10,6,14,0),  clockOutTs: D(2026,10,6,23,0), shiftMinutes:540, lateMinutes:0 },
  { id:'c', employeeId:'e1', clockInTs: D(2026,10,7,14,30), clockOutTs: D(2026,10,7,22,0), shiftMinutes:450, lateMinutes:30 },
  { id:'d', employeeId:'e1', clockInTs: D(2026,10,8,14,0),  clockOutTs: null },
];
const ms = TB.monthSummary(shifts, {}, () => 480);
assertEq(ms.balanceMin, 10, 'الشهر: −20 +60 −30 = +10');
assertEq(ms.lateCount, 2, 'تأخيرين');
assertEq(ms.lateMinTotal, 50, 'إجمالي التأخير 50 د');
assertEq(ms.countedShifts, 3, 'المفتوح مش محسوب');
const mo = TB.money(-40, 12.5);
assert(Math.abs(mo.deduction - 8.33) < 0.01 && mo.overtimePay === 0, '−40 د بسعر 12.5 ج/ساعة = 8.33 ج خصم');
const mo2 = TB.money(90, 12.5);
assert(Math.abs(mo2.overtimePay - 18.75) < 0.01 && mo2.deduction === 0 && mo2.overtimeMin === 90, '+90 د = 18.75 ج أوفرتايم');

// الشيفت المنسي
let fx = TB.forgottenFix({ clockInTs: D(2026,10,5,14,0) }, D(2026,10,5,22,0), 0);
assertEq(fx.clockOutTs, D(2026,10,5,22,0), 'منسي: يتقفل على نهاية الشيفت');
assertEq(fx.reason, 'scheduled_end', '…والسبب متسجّل');
fx = TB.forgottenFix({ clockInTs: D(2026,10,5,14,0) }, D(2026,10,5,22,0), D(2026,10,5,23,30));
assertEq(fx.clockOutTs, D(2026,10,5,23,45), 'عيد: آخر فاتورة 23:30 → يتقفل 23:45');
assertEq(fx.reason, 'last_sale', '…بسبب آخر فاتورة');
fx = TB.forgottenFix({ clockInTs: D(2026,10,5,14,0) }, D(2026,10,5,22,0), D(2026,10,5,21,0));
assertEq(fx.clockOutTs, D(2026,10,5,22,0), 'سلبي: فاتورة قبل الميعاد مبتمدش الشيفت');
fx = TB.forgottenFix({ clockInTs: D(2026,10,5,14,0) }, D(2026,10,5,22,0), D(2026,10,6,13,0));
assertEq(fx.clockOutTs, D(2026,10,6,6,0), 'سلبي: فاتورة تاني يوم (جهاز غلط) — سقف 16 ساعة');
assert(TB.isForgottenOpen({ clockInTs: D(2026,10,5,14,0) }, D(2026,10,6,7,0)) && !TB.isForgottenOpen({ clockInTs: D(2026,10,5,14,0) }, D(2026,10,5,23,0)), 'منسي = مفتوح أكتر من 16 ساعة');

// الحافز الأسبوعي
let b = TB.weekBonus({ lateMinTotal: 5, forgotCount: 0, avgRating: 3.8, ratingCount: 6, points: 30 }, {});
assertEq(b.score, 100, 'أسبوع مثالي = 100');
assertEq(b.amount, 200, '…= أعلى حافز (200 — قرار المالك 10-10)');
b = TB.weekBonus({ lateMinTotal: 15, forgotCount: 0, avgRating: 3.8, ratingCount: 6, points: 30 }, {});
assertEq(b.parts.commit, 20, 'تأخير 15 د (≤ ضعف المسموح) = نص الالتزام');
assertEq(b.amount, 150, '80 نقطة → 150 ج (خطّي 100→200 بين 60 و100)');
b = TB.weekBonus({ lateMinTotal: 40, forgotCount: 0, avgRating: 3.8, ratingCount: 6, points: 30 }, {});
assertEq(b.parts.commit, 0, 'سلبي: تأخير 40 د = صفر التزام');
assertEq(b.amount, 100, '60 نقطة = الحد الأدنى → 100 ج');
b = TB.weekBonus({ lateMinTotal: 0, forgotCount: 1, avgRating: 3.8, ratingCount: 6, points: 30 }, {});
assertEq(b.parts.commit, 0, 'سلبي: شيفت منسي = صفر التزام');
b = TB.weekBonus({ lateMinTotal: 0, forgotCount: 0, avgRating: null, ratingCount: 0, points: 0 }, { bonusPointsWeek: 50 });
assertEq(b.score, 40, 'من غير تقييم ولا نقاط: الالتزام بس 40');
assertEq(b.amount, 0, '⭐ سلبي: الالتزام لوحده (40) مش كفاية — مفيش حافز من غير تقييم أو مبيعات (قرار المالك 10-10)');
b = TB.weekBonus({ lateMinTotal: 0, forgotCount: 0, avgRating: null, ratingCount: 0, points: 0 }, { bonusPointsWeek: 50, bonusMinScore: 40 });
assertEq(b.amount, 100, 'لو المالك نزّل الحد لـ40: الالتزام لوحده = أقل حافز (100)');
b = TB.weekBonus({ lateMinTotal: 0, forgotCount: 0, avgRating: 2.0, ratingCount: 3, points: 25 }, { bonusPointsWeek: 50 });
assertEq(b.parts.rating, 17, 'تقييم 2/3.5 = 17 من 30 (نسبي)');
assertEq(b.parts.sales, 15, 'نقاط 25/50 = 15 من 30');
const wk = TB.weeksInPeriod(D(2026,10,1), D(2026,10,31,23,59), D(2026,10,20));
assert(wk.length === 3 && wk.every(w => new Date(w.start).getDay() === 6 && new Date(w.end).getDay() === 5), 'أسابيع سبت→جمعة اللي جمعتها جوه الشهر وخلصت (3 لحد 20 أكتوبر — أولها 26 سبتمبر→2 أكتوبر)');
assertEq(TB.weeksInPeriod(D(2026,10,1), D(2026,10,31,23,59), D(2026,10,8)).length, 1, 'سلبي: الأسبوع اللي لسه مخلصش (3→9 أكتوبر) مش محسوب يوم 8');
const al = TB.lateAlerts([1,2,3,4].map(i => ({ employeeId:'e1', employeeName:'سارة', clockInTs: D(2026,10,i,14,20), lateMinutes: 20 })).concat([{ employeeId:'e2', employeeName:'نهى', clockInTs: D(2026,10,3,14,0), lateMinutes: 3 }]), {}, D(2026,10,9));
assert(al.length === 1 && al[0].name === 'سارة' && al[0].count === 4 && al[0].avgMin === 20, 'إنذار: سارة 4 مرات في 14 يوم · نهى (جوه السماح) لا');
assertEq(TB.lateAlerts([1,2,3].map(i => ({ employeeId:'e1', employeeName:'سارة', clockInTs: D(2026,10,i,14,20), lateMinutes: 20 })), {}, D(2026,10,9)).length, 0, 'سلبي: 3 مرات مش إنذار');
assert(TB.enabledFor({ bankEnabled: true, bankFrom: '2026-10-01' }, D(2026,10,1)) && !TB.enabledFor({ bankEnabled: true, bankFrom: '2026-10-01' }, D(2026,9,1)) && !TB.enabledFor({ bankEnabled: false }, D(2026,10,1)), 'سبتمبر على القديم · أكتوبر على الجديد · مقفول = قديم');
assertEq(TB.fmtMin(-95), '−1 س 35 د', 'تنسيق الدقايق'); assertEq(TB.fmtMin(60), '+1 س', 'ساعة كاملة من غير «0 د»');

// ---------- ٢) clockOut الحقيقي في وضع الرصيد ----------
const RUNNER = `
'use strict';
const fs=require('fs'), vm=require('vm');
const [,, appPath, tbPath, inTs, nowTs, lastSale] = process.argv;
const src=fs.readFileSync(appPath,'utf8');
function extractFn(s, header){ const i=s.indexOf(header); let d=0, st=false; for(let j=s.indexOf('{',i); j<s.length; j++){ if(s[j]==='{'){d++;st=true;} else if(s[j]==='}'){d--; if(st&&d===0) return s.slice(i,j+1);} } return null; }
const NOW=Number(nowTs), IN=Number(inTs);
const written={}; const shift={ id:'s1', employeeId:'e1', clockInTs:IN, clockOutTs:null, lateMinutes: 20, attendanceShiftKey:'evening', scheduledStartTime:'14:00', scheduledEndTime:'22:00' };
const box={ window:{ timeCfg:{ bankEnabled:true, bankFrom:'2026-01-01' }, allTimeCredit:[], points: lastSale!=='0' ? [{ employeeId:'e1', ts:Number(lastSale) }] : [], employees:[{ id:'e1', name:'سارة', shift:'evening' }] },
  TimeBank: require(tbPath), timeCfgDefaults:{}, complianceCfg:{ shifts:{ evening:{ start:'14:00', end:'22:00' } } },
  getOpenShift:()=>shift,
  caiDayKey:(ms)=>{ const d=new Date(ms); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); },
  expectedShiftEndTs:(s)=>{ const d=new Date(s.clockInTs); return new Date(d.getFullYear(),d.getMonth(),d.getDate(),22,0).getTime(); },
  scheduledShiftMinutes:()=>480, earlyLeaveFromWorked:()=>({earlyMin:99,hours:9}), lateCompensation:()=>({coveredMin:0,remainingMin:0,hours:0}),
  overtimeReviewInfo:()=>({needsReview:true}), fixedAttendanceTs:()=>NOW, attendanceDocId:(k,e,s)=>k+'_'+e+'_'+s,
  queueAttendanceMutation:(m)=>{ (m.durableOps||[]).forEach(op=>{ if(op.collection==='sales_shifts') Object.assign(written, op.data); else (written._credits=written._credits||[]).push(op.data); }); written._text=m.successText; return Promise.resolve({ok:true}); },
  Math, JSON, Number, String, Promise, Date, console };
box._timeCfgNow=()=>box.window.timeCfg; box.globalThis=box; vm.createContext(box);
vm.runInContext(extractFn(src,'function _bankOn(ms)')+'\\n'+extractFn(src,'function bankLastSaleTs(')+'\\n'+extractFn(src,'function _bankShiftEmp(')+'\\n'+extractFn(src,'async function clockOut(')+'\\n;clockOut;', box);
vm.runInContext('clockOut("e1", null)', box).then(()=>process.stdout.write(JSON.stringify(written))).catch(e=>process.stdout.write(JSON.stringify({error:e.message+' '+e.stack})));
`;
const runnerPath = path.join(require('os').tmpdir(), 'tb-clockout-' + process.pid + '.js');
fs.writeFileSync(runnerPath, RUNNER);
function clockOutWritten(inTs, nowTs, lastSale){
  return JSON.parse(require('child_process').execFileSync(process.execPath, [runnerPath, path.join(ROOT,'sales','sales-app.js'), path.join(ROOT,'sales','time-bank.js'), String(inTs), String(nowTs), String(lastSale||0)], { encoding:'utf8', timeout:15000 }));
}
// أ) شيفت عادي: جه 14:20 (تأخير 20) مشي 22:30
let w = clockOutWritten(D(2026,10,5,14,20), D(2026,10,5,22,30));
assert(!w.error, 'clockOut اشتغلت — ' + (w.error||''));
assertEq(w.earlyMin, 0, 'سلبي: مفيش «انصراف بدري» في وضع الرصيد');
assert(!(w._credits||[]).length, 'سلبي: مفيش بنود رصيد وقت (late/early) بتتكتب');
assertEq(w.overtimeDecision, 'none', 'مدة 8:10 < 8:15 = مفيش أوفرتايم بالطريقة القديمة (الرصيد هو اللي بيحسب)');
assertEq(w.needsClockOutReview, false, 'مش محتاج مراجعة');
assert(/رصيد وقتك \+10 د/.test(w._text), 'الرسالة: رصيد وقتك +10 د (اتأخر 20 وقعد 30)');
// ب) نسي الانصراف وسجّله تاني يوم 14:00 — يتقفل 22:00 نفس اليوم
w = clockOutWritten(D(2026,10,5,14,20), D(2026,10,6,14,0));
assertEq(w.clockOutTs, D(2026,10,5,22,0), '⭐ الشيفت المنسي اتقفل على 22:00 (نهاية شيفته) مش على وقت ما افتكر');
assertEq(w.shiftMinutes, 460, 'مدته 7:40 (دخل 14:20)');
assertEq(w.bankAutoEnd, true, 'متعلّم إنه اتقفل تلقائي');
assertEq(w.bankAutoReason, 'scheduled_end', '…على الميعاد');
assertEq(w.needsClockOutReview, false, '⭐ ومش محتاج مراجعة المالك');
assertEq(w.overtimeMinutes, 0, 'سلبي: مفيش أوفرتايم على المنسي');
assertEq(w.forgotClockOut, true, 'لكنه متعلّم نسيان (للحافز والإنذار)');
assert(/اتقفل على ميعاد نهاية شيفتك/.test(w._text), 'الرسالة بتقوله');
// ج) عيد: عمل فاتورة 23:40 بعد الميعاد — يتقفل 23:55
w = clockOutWritten(D(2026,10,5,14,0), D(2026,10,6,13,0), D(2026,10,5,23,40));
assertEq(w.clockOutTs, D(2026,10,5,23,55), '⭐ سهر عيد: اتقفل على آخر فاتورة ليه + 15 د');
assertEq(w.bankAutoReason, 'last_sale', '…والسبب آخر فاتورة');

// ---------- ٣) computeSalary في وضع الرصيد ----------
const WANTED = ['function caiParts(', 'function caiOffsetMs(', 'function cai(', 'function caiNow(', 'function caiStamp(', 'function caiDayStart(', 'function caiDayEnd(', 'function _fmtKey(', 'function caiDayKey(',
  'function advCycleStartDay(', 'function payDayOfMonth(', 'function _mkKey(', 'function payCycleKeyOfDate(', 'function advPayCycleOf(', 'function payPeriodRange(', 'function defaultPayPeriodKey(', 'function payPeriodOptions(', 'function _nextMonthKey(',
  'function attendedDaysDetail(', 'function getMonthDateRange(', 'function getMonthLabel(', 'function countDayOffOccurrencesInRange(', 'function countAttendedDaysInRange(', 'function countRequiredWorkDaysInRange(', 'function countAbsenceDaysInRange(', 'function _timeCfgNow(',
  'function effectiveDayOffKey(', 'function payrollAttendanceBalance(', 'function weekStartKeyOf(', 'function shiftCountsAsDay(', 'function weeklyOffBalance(', 'function overtimeReviewInfo(', 'function autoApprovedOvertimeMinutes(',
  'function payrollDateFromKey(', 'function payrollCalendarDaysInRange(', 'function _bankOn(ms)', 'function _bankShiftEmp(', 'function _bankReqMin(', 'function bankMonthFor(', 'function computeSalary(', 'function payrollMoneyBreakdown('];
const parts = []; let missing = null;
WANTED.forEach(h => { const f = extractFn(src, h); if(!f && !missing) missing = h; if(f) parts.push(f); });
assert(!missing, 'كل الدوال اتلقت' + (missing ? ' — ناقص: ' + missing : ''));
const STUBS = `
const CAI_TZ='Africa/Cairo'; const _caiFmt=new Intl.DateTimeFormat('en-GB',{timeZone:CAI_TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const PAYDAY_FALLBACK=6; var timeCfgDefaults={ hoursPerDay:8 }; var complianceCfg={ shifts:{} };
function isSetupShift(){ return false; } function tcCounts(x){ return !x.excused; }
function monthlyTimeSummary(list){ const h=list.reduce((n,x)=>n+(Number(x.hours)||0),0); return { totalHours:h, days:Math.floor(h/8) }; }
function lastAbsenceJudgeDay(){ return new Date(0); }   // مفيش حكم غياب في الاختبار ده
function approvedLeaveFor(){ return null; }
function scheduledShiftMinutes(){ return 480; }
function bankBonusFor(){ return { weeks:[{ key:'2026-10-03', amount:100, decision:'approved', paid:100 },{ key:'2026-10-10', amount:150, decision:'pending', paid:0 }], total:100, pending:[{ key:'2026-10-10' }] }; }
`;
function salaryCtx(shifts, credits){
  const win = { advCfg:{ maxPerMonth:0, openDay:12, closeDay:6, cycleStartDay:0 }, deductions:[], allTimeCredit: credits||[], allLeaveReqs:[], timeCfg:{ bankEnabled:true, bankFrom:'2026-10-01' } };
  const ctx = { window: win, console:{ warn(){}, log(){} }, allShifts: shifts, allAdvances:[], allDeductions:[], TimeBank: TB, Intl, Math, Date };
  win.allShifts = shifts; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(STUBS + '\n' + parts.join('\n'), ctx, { timeout: 5000 });
  return ctx;
}
const EMP = { id:'e1', name:'سارة', baseSalary:3000, dayOff:5, branch:'الرحاب' };
const OCT = { start: new Date(D(2026,10,1)), end: new Date(D(2026,10,31,23,59)) };
let ctx = salaryCtx([
  { id:'a', employeeId:'e1', clockInTs:D(2026,10,5,14,20), clockOutTs:D(2026,10,5,22,0), shiftMinutes:460, lateMinutes:20 },
  { id:'b', employeeId:'e1', clockInTs:D(2026,10,6,14,0),  clockOutTs:D(2026,10,6,22,20), shiftMinutes:500, lateMinutes:0 },
  { id:'c', employeeId:'e1', clockInTs:D(2026,10,7,14,30), clockOutTs:D(2026,10,7,22,0), shiftMinutes:450, lateMinutes:30 },
], [{ id:'late_old', employeeId:'e1', type:'late', hours:3, date:'2026-10-07' }, { id:'brk', employeeId:'e1', type:'break', hours:8, date:'2026-10-08' }]);
let c = vm.runInContext('computeSalary(EMP, S, E)', Object.assign(ctx, { EMP, S: OCT.start, E: OCT.end }));
assert(c.bank && c.bank.balanceMin === -30, 'المرتب: الرصيد −20 +20 −30 = −30 د');
assert(Math.abs(c.timeCreditDeduction - (30/60*12.5 + 100)) < 0.01, '⭐ الخصم = 30 د × سعر الدقيقة (6.25) + يوم بريك (100) — بند التأخير القديم (3 ساعات) متجاهل');
assertEq(c.overtimePay, 0, 'مفيش أوفرتايم والرصيد سالب');
assertEq(c.weeklyBonusAmount, 100, '⭐ الحافز المعتمد بس هو اللي داخل المرتب (المستني اعتماد لا)');
assert(Math.abs(c.netSalary - (3000 - 106.25 + 100)) < 0.01, 'الصافي = 3000 − 106.25 + 100');
const pb = vm.runInContext('payrollMoneyBreakdown(C, {})', Object.assign(ctx, { C: c }));
assert(pb.ok && Math.abs(pb.salaryAdditions - 100) < 0.01, 'التجميع متطابق مع المحرك (الحافز ضمن الإضافات)');
ctx = salaryCtx([
  { id:'a', employeeId:'e1', clockInTs:D(2026,10,5,14,0), clockOutTs:D(2026,10,5,23,30), shiftMinutes:570, lateMinutes:0 },
  { id:'b', employeeId:'e1', clockInTs:D(2026,10,6,14,0), clockOutTs:D(2026,10,7,14,0), shiftMinutes:1440, lateMinutes:0, forgotClockOut:true, needsClockOutReview:true, autoClosedAt1:true },
], []);
c = vm.runInContext('computeSalary(EMP, S, E)', Object.assign(ctx, { EMP, S: OCT.start, E: OCT.end }));
assertEq(c.overtimeMinutes, 90, '+90 د أوفرتايم من غير أي موافقة');
assert(Math.abs(c.overtimePay - 18.75) < 0.01, '…= 18.75 ج');
assertEq(c.overtimePendingMin, 0, 'سلبي: مفيش «مستني موافقة» في وضع الرصيد');
assert(c.bank.rows.find(r=>r.id==='b').reason === 'needs_review', 'سلبي: المقفول 1ص ولسه متصلّحش مش بيدخل الرصيد (لحد ما bankFinalizeForgotten يصلّحه)');
// سبتمبر = النظام القديم
ctx = salaryCtx([{ id:'a', employeeId:'e1', clockInTs:D(2026,9,5,14,20), clockOutTs:D(2026,9,5,22,0), shiftMinutes:460, lateMinutes:20 }], [{ id:'l', employeeId:'e1', type:'late', hours:8, date:'2026-09-05' }]);
c = vm.runInContext('computeSalary(EMP, S, E)', Object.assign(ctx, { EMP, S: new Date(D(2026,9,1)), E: new Date(D(2026,9,30,23,59)) }));
assert(!c.bank && c.timeCreditDeduction === 100, 'سلبي: سبتمبر لسه على القديم (8 ساعات = يوم = 100 ج)');

// ---------- ٤) الربط ----------
assert(/function bankFinalizeForgotten\(/.test(src) && /setTimeout\(bankFinalizeForgotten, 1500\)/.test(src) && /bankAutoEnd: true, bankAutoReason: fix\.reason/.test(src), 'الشيفت المنسي بيتصلّح تلقائي بعد تحميل الشيفتات');
assert(/const lateHours = \(latePenalized && !isSetupShift\(emp\) && !\(typeof _bankOn/.test(src), 'clockIn: مفيش بند تأخير في وضع الرصيد');
assert(/function bankCardHtml\(emp\)/.test(src) && /wrap\.innerHTML = bankCardHtml\(emp\)/.test(src), 'كارت الرصيد والحافز للموظف');
assert(/function bankAlertsHtml\(/.test(src) && /_alerts \+ emps\.map/.test(src), 'إنذار التأخير المتكرر فوق المرتبات');
assert(/openPayrollBankDetails/.test(src), 'تفاصيل الرصيد للمالك');
assert(!/قبل نهاية شيفته بـ15|متنساش تسجّل الخروج/.test(src), 'سلبي: مفيش تنبيه ربع ساعة قبل نهاية الشيفت (قرار المالك)');
const ui = fs.readFileSync(path.join(ROOT,'sales','sales-ui.js'),'utf8');
assert(/id="tsBankOn"/.test(ui) && /tsBankGrace/.test(ui) && /tsBonusMin/.test(ui) && /tsAlertLate/.test(ui) && /bankEnabled, bankFrom,/.test(ui), 'إعدادات رصيد الوقت والحافز');
const html = fs.readFileSync(path.join(ROOT,'sales','index.html'),'utf8');
assert(html.indexOf('time-bank.js?v=647') > 0 && html.indexOf('time-bank.js?v=647') < html.search(/sales-app\.js\?v=6\d\d/) && /sales-ui\.js\?v=647/.test(html), 'time-bank.js قبل sales-app.js v641');
assert(/store-apps-shell-v64[7-9]/.test(fs.readFileSync(path.join(ROOT,'sales','sw.js'),'utf8')), 'sw v641');
// v641 — طلب المالك: مفيش مبلغ بالجنيه للموظف، والمكافآت القديمة بتختفي في وضع الرصيد
const _card = extractFn(src, 'function bankCardHtml(');
assert(!/TimeBank\.money|هيتخصم <b>|أوفرتايم لحد دلوقتي <b>/.test(_card), 'سلبي: كارت الموظف مفيهوش مبلغ الخصم/الأوفرتايم بالجنيه');
assert(/id="dh_legacyRewards"/.test(html) && /_lg\.style\.display = _bankNow \? 'none' : ''/.test(src), 'مكافأة الأسبوع/الشهر/السباق القديمة مخفية في وضع الرصيد');
// ---------- ٥) Office بنفس المحرك ----------
const of = fs.readFileSync(path.join(ROOT,'Office','office.js'),'utf8');
assert(/TimeBank\.enabledFor\(cfg, start\.getTime\(\)\)/.test(of) && /bank=TimeBank\.monthSummary\(rangeShifts,cfg,_req\)/.test(of) && /x\.type!=='late'&&x\.type!=='early'/.test(of), 'Office: المرتب بنفس محرك الرصيد وبيتجاهل بنود التأخير القديمة');
assert(/\.\.\/sales\/time-bank\.js\?v=647/.test(fs.readFileSync(path.join(ROOT,'Office','index.html'),'utf8')) && /office\.js\?v=701/.test(fs.readFileSync(path.join(ROOT,'Office','index.html'),'utf8')), 'Office بيحمّل time-bank.js · office v700');

// ---------- ٦) v642 — الهدف الأسبوعي التلقائي لكل موظف (متوسطه + متوسط الفرع) ----------
(function(){
  const W0 = D(2026,10,10);   // سبت 10 أكتوبر = بداية الأسبوع الحالي
  const wk = TB.weeksBefore(W0, 8);
  assert(wk.length === 8 && wk[0].start === D(2026,10,3) && wk[7].start === D(2026,8,15), '8 أسابيع ورا بداية الأسبوع (3 أكتوبر … 15 أغسطس)');
  // سارة: 20 نقطة في كل أسبوع من 4 · نهى: 10 نقاط في 4 أسابيع · مريم جديدة (مفيش شيفتات)
  const pts = [], sh = [];
  wk.slice(0,4).forEach(w => { for(let i=0;i<20;i++) pts.push({ employeeId:'s', ts: w.start + 3600000 }); for(let i=0;i<10;i++) pts.push({ employeeId:'n', ts: w.start + 3600000 }); sh.push({ employeeId:'s', clockInTs: w.start + 3600000 }, { employeeId:'n', clockInTs: w.start + 3600000 }); });
  // أسبوع إجازة لنهى: مفيش شيفت ومفيش نقاط — مش بيوقّع متوسطها
  const st = TB.weeklyPointStats(pts, sh, ['s','n','m'], W0, {});
  assertEq(st.branchAvg, 15, 'متوسط الفرع = (20+10)/2 = 15 نقطة/أسبوع');
  assertEq(st.per.s.avg, 20, 'متوسط سارة 20 (4 أسابيع)');
  assertEq(st.per.n.avg, 10, 'متوسط نهى 10 — أسبوع الإجازة مش محسوب');
  assertEq(st.per.s.target, 18, 'هدف سارة = (20+15)/2 ≈ 18');
  assertEq(st.per.n.target, 13, 'هدف نهى = (10+15)/2 ≈ 13 (بتتشد ناحية الفرع)');
  assertEq(st.per.m.target, 15, 'موظفة جديدة: هدفها متوسط الفرع');
  assertEq(TB.weeklyPointStats(pts, sh, ['s'], W0, { autoTargetFactor: 1.1 }).per.s.target, 22, 'المعامل 110%: (20+20)/2 × 1.1 = 22');
  assertEq(TB.targetFor({ bonusPointsMode:'fixed', bonusPointsWeek: 7 }, st, 's'), 7, 'الوضع الثابت بيتجاهل التلقائي');
  assertEq(TB.targetFor({}, st, 's'), 18, 'الافتراضي تلقائي');
  assertEq(TB.targetFor({}, { branchAvg: 15, per: {} }, 'zz'), 15, 'موظف مش في الإحصاء: متوسط الفرع');
  const b = TB.weekBonus({ lateMinTotal:0, forgotCount:0, avgRating:4, ratingCount:3, points: 9 }, { bonusPointsWeek: 18 });
  assertEq(b.parts.sales, 15, '9 من هدف 18 = 15/30');
  assert(/function bankTargetFor\(emp, weekStartMs\)/.test(src) && /target: bankTargetFor\(emp, ws\)/.test(src) && /bonusPointsWeek: Number\(st && st\.target\) \|\| 0/.test(src), 'الحافز بيتحسب بهدف الموظف نفسه');
  assert(/bankTargetsReportHtml/.test(src) && /id="tsBonusPtsMode"/.test(ui) && /tsAutoFactor/.test(ui), 'شاشة الإعدادات: تلقائي/ثابت + جدول الاقتراح');
})();

// ---------- ٧) v644 — الحافز مبيظهرش للموظف ولا بيتصرف غير باعتماد المالك ----------
(function(){
  const card = extractFn(src, 'function bankCardHtml(');
  assert(!/\$\{b\.amount\}/.test(card) && /\$\{b\.score\} \/ 100/.test(card), 'سلبي: كارت الموظف مفيهوش مبلغ الحافز — النقاط بس');
  assert(/x\.decision==='approved' && x\.paid > 0/.test(card) && /\$\{x\.paid\} ج/.test(card), 'المبلغ بيظهر للموظف بس بعد اعتماد المالك');
  assert(/total: out\.reduce\(\(n,w\)=> n \+ w\.paid, 0\)/.test(src), 'المرتب بياخد المعتمد بس');
  // v645: الاعتماد تلقائي — المالك مش بيعمل حاجة، بس يقدر يلغي
  assertEq(TB.cfgOf({}).bonusApproval, 'auto', 'الافتراضي: اعتماد تلقائي');
  assert(/const autoOk = TimeBank\.cfgOf\(cfg\)\.bonusApproval !== 'manual'/.test(src) && /\(autoOk \? 'approved' : 'pending'\)/.test(src), 'اللي يستحق بيتعتمد لوحده (إلا لو المالك اختار يدوي)');
  assert(/d \? d\.status :/.test(src) && /bankDecideBonus\('\$\{e\.id\}','\$\{w\.key\}',false,0,\$\{w\.score\}\)[^<]*>✖ إلغاء/.test(src), 'قرار الرفض/الإلغاء المحفوظ بيغلب التلقائي');
  assert(/id="tsBonusApproval"/.test(ui), 'إعداد تلقائي/يدوي');
  assert(/function bankPendingBonusesHtml\(/.test(src) && /bankDecideBonus\('\$\{e\.id\}','\$\{w\.key\}',true/.test(src) && /window\.bankDecideBonus = async function/.test(src) && /sales_bonus_week/.test(src), 'لوحة الاعتماد للمالك + قرار بيتحفظ في sales_bonus_week');
  assert(/match \/sales_bonus_week\/\{id\}/.test(fs.readFileSync(path.join(ROOT,'security','firestore-phase2.rules'),'utf8')), 'قاعدة Firestore للمجموعة الجديدة');
  assertEq(TB.cfgOf({}).bonusMin, 100, 'الافتراضي: من 100');
  assertEq(TB.cfgOf({}).bonusMax, 200, '…لـ200');
})();

// ---------- ٨) v646 — مفيش حافز على أسبوع بدأ قبل bankFrom ----------
assert(/\.filter\(w=> !_bf \|\| TimeBank\.keyOf\(w\.start\) >= _bf\)/.test(src), 'أسبوع 26 سبتمبر→2 أكتوبر مش بيتحسب (بدأ قبل تشغيل النظام)');
assert(TB.keyOf(D(2026,9,26)) < '2026-10-01' && TB.keyOf(D(2026,10,3)) >= '2026-10-01', 'مفتاح الأسبوع بيتقارن بتاريخ التشغيل صح');
