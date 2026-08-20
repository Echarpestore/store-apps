// ============================================================
// 💵 test-payroll-policy-2026 — سياسة الرواتب المعتمدة (أغسطس 2026)
//
// ده اختبار سياسة، مش مجرد regression قديم. يقفل القرارات المتفق عليها:
// الشهر التقويمي الحقيقي، قيمة اليوم ÷30، 8 ساعات، الغياب المصرح مخصوم،
// تبديل الإجازة، شغل الإجازة بالساعات، الموظف الجديد، الشيفت المفتوح،
// سجل تعديل الراتب، ومنع الصرف المكرر.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadSalesApp } = require('./helpers/load-sales');
const { sandbox:S } = loadSalesApp();
const ROOT = path.resolve(__dirname,'..');
const src = fs.readFileSync(path.join(ROOT,'sales','sales-app.js'),'utf8');
const officeSrc = fs.readFileSync(path.join(ROOT,'Office','office.js'),'utf8');

function cparts(ts){ return S.caiParts(ts); }
function sh(day, startH, hours){
  const start=S.caiDayStart(2026,7,day)+(startH==null?10:startH)*3600000;
  return { employeeId:'e1', clockInTs:start, clockOutTs:start+(hours==null?8:hours)*3600000, overtimeMinutes:0 };
}
function calc(emp,opts){
  opts=opts||{}; const r=S.payPeriodRange(opts.key||'2026-07');
  vm.runInContext('allShifts='+JSON.stringify(opts.shifts||[])+';',S);
  vm.runInContext('allAdvances='+JSON.stringify(opts.advances||[])+';',S);
  S.window.allTimeCredit=opts.timeCredit||[];
  S.window.deductions=opts.deductions||[];
  S.window.allLeaveReqs=opts.leaves||[];
  S.window.timeCfg=Object.assign({},S.timeCfgDefaults,{weeklyStartFloor:'2026-07-01'});
  return vm.runInContext('computeSalary('+JSON.stringify(emp)+',new Date('+r.start.getTime()+'),new Date('+r.end.getTime()+'))',S);
}

// 1) حدود الشهر الفعلية: فبراير لا يسرّب مارس + يوم 31 موجود.
{
  const cases=[['2025-02',28],['2024-02',29],['2026-04',30],['2026-07',31]];
  cases.forEach(([key,last])=>{
    const r=S.payPeriodRange(key), e=cparts(r.end.getTime());
    assertEq(e.d,last,key+' ينتهي في آخر يوم فعلي');
    assertEq(S.payrollCalendarDaysInRange(r.start,r.end),last,key+' عدد أيام الفترة صحيح');
  });
}

// 2) الأساسي الشهري ثابت؛ قيمة اليوم ÷30؛ التعيين منتصف الشهر يتناسب باليوم.
{
  const emp={id:'e1',baseSalary:3000,attendanceTrackingStart:'2026-08-01'};
  const full=calc(emp,{});
  assertEq(full.proratedBase,3000,'شهر 31 يوم كامل لا يرفع الأساسي فوق 3000');
  assertEq(full.daysInCalc,31,'لكن الحضور يشمل 31 يوم');
  const mid=calc(Object.assign({},emp,{hireDate:'2026-07-16'}),{});
  assertEq(mid.daysInCalc,16,'تعيين 16 يوليو = 16 يوم حتى 31');
  assertEq(mid.proratedBase,1600,'الجزئي = 16 × (3000÷30)');
}

// 3) 8 ساعات = يوم مالي واحد في الخصم والأوفرتايم.
{
  const emp={id:'e1',baseSalary:3000,attendanceTrackingStart:'2026-08-01'};
  const c=calc(emp,{timeCredit:[{employeeId:'e1',type:'late',hours:8,date:'2026-07-05'}],
    shifts:[Object.assign(sh(8,10,8),{overtimeMinutes:60})]});
  assertEq(c.timeCreditDays,1,'8 ساعات رصيد = يوم خصم');
  assertEq(c.timeCreditDeduction,100,'قيمة يوم الخصم = 3000÷30 = 100');
  assertEq(c.overtimePay,12.5,'ساعة أوفرتايم = 3000÷30÷8 = 12.5');
}

// 4) الغياب المعتمد في يوم عمل يخصم يوم واحد، لكنه يظل "مصرح" في التفاصيل.
{
  const emp={id:'e1',baseSalary:3000,dayOff:5,attendanceTrackingStart:'2026-07-01'};
  const shifts=[];
  for(let d=1;d<=31;d++){
    const k=S.caiDayKey(S.caiDayStart(2026,7,d));
    if(S.effectiveDayOffKey(emp,k,[])===k || d===12) continue;
    shifts.push(sh(d,10,8));
  }
  const leaves=[{empId:'e1',status:'approved',type:'dayoff',dateKey:'2026-07-12'}];
  const c=calc(emp,{shifts,leaves});
  assertEq(c.extraOffDays,1,'غياب مصرح = يوم خصم واحد');
  assertEq(c.deductionAmount,100,'الخصم = قيمة يوم واحدة');
  const a=c.absenceDates.find(x=>x.date==='2026-07-12');
  assert(!!a && a.approved===true,'التفاصيل تميّزه كمصرح بدل إخفائه');
}

// 5) changeDayoff ينقل الإجازة؛ شغل اليوم القديم لا يعطي Bonus إذا صار يوم عمل.
{
  const emp={id:'e1',baseSalary:3000,dayOff:5,attendanceTrackingStart:'2026-07-01'};
  const leaves=[{empId:'e1',status:'approved',type:'changeDayoff',dateKey:'2026-07-06',decidedAt:1}];
  assertEq(S.effectiveDayOffKey(emp,'2026-07-10',leaves),'2026-07-06','إجازة أسبوع 4→10 اتنقلت للاتنين 6');
  const c=calc(emp,{shifts:[sh(10,10,8)],leaves});
  assertEq(c.dayOffBonusAmount,0,'الجمعة بعد التبديل يوم عمل عادي — مفيش مكافأة إجازة');
}

// 6) شغل يوم الإجازة بالساعات: 4h = نصف يوم = 50 جنيه.
{
  const emp={id:'e1',baseSalary:3000,dayOff:5,attendanceTrackingStart:'2026-07-01'};
  const c=calc(emp,{shifts:[sh(17,10,4)]}); // الجمعة
  assertEq(c.dayOffBonusHours,4,'أربع ساعات فعلية محفوظة');
  assertEq(c.dayOffBonusAmount,50,'4 × 12.5 = 50');
}

// 7) الشيفت المفتوح لا يمر بصمت ويجب أن يمنع الصرف في الواجهة.
{
  const emp={id:'e1',baseSalary:3000,dayOff:5,attendanceTrackingStart:'2026-07-01'};
  const open={employeeId:'e1',id:'open1',clockInTs:S.caiDayStart(2026,7,20)+10*3600000,clockOutTs:null};
  const c=calc(emp,{shifts:[open]});
  assert(c.incompleteShifts.some(x=>x.shiftId==='open1'),'الشيفت المفتوح ظاهر في نتيجة المرتب');
  assert(/calc\.incompleteShifts[\s\S]{0,300}راجع/.test(src),'واجهة الصرف تمنع الشيفت المفتوح قبل الكتابة');
}

// 8) الموظف الجديد لا يأخذ مكافأة فترة بدأ في منتصفها.
{
  const r={start:new Date(S.caiDayStart(2026,7,27)),end:new Date(S.caiDayEnd(2026,8,2))};
  const newbie={id:'e1',hireDate:'2026-07-30',attendanceTrackingStart:'2026-07-30'};
  assertEq(S.rewardFullPeriodEligible(newbie,r),false,'بدأ منتصف الأسبوع = غير مؤهل للأسبوع الكامل');
  const next={start:new Date(S.caiDayStart(2026,8,3)),end:new Date(S.caiDayEnd(2026,8,9))};
  assertEq(S.rewardFullPeriodEligible(newbie,next),true,'أول أسبوع كامل بعد التعيين = مؤهل من ناحية مدة التوظيف');
}

// 9) تغيير الراتب: الشهر يستخدم آخر baseSalary، وكل تعديل له history.
{
  assert(/salaryHistory/.test(src) && /from: oldVal/.test(src) && /to: newVal/.test(src),
    'تعديل الراتب يسجل القديم والجديد');
  assert(/salaryUpdatedAt/.test(src),'تاريخ آخر تعديل محفوظ');
  assert(/salaryHistory/.test(src.slice(src.indexOf('openPayrollEmployee'),src.indexOf('buildSalaryReceiptPayload'))),
    'سجل تعديل الراتب ظاهر في تفاصيل الموظف');
}

// 10) الصرف المكرر ممنوع ذريًا من Sales وOffice.
{
  const payout=src.slice(src.indexOf('window.openSalaryPayoutDialog'),src.indexOf('window.openSalaryPrintDialog'));
  assert(/runTransaction/.test(payout),'Sales يستخدم transaction');
  assert(/safeEmp \+ '_' \+ pk/.test(payout),'Sales يستخدم employee+period كمعرف ثابت');
  assert(/__SALARY_ALREADY_PAID__/.test(payout),'Sales يقفل سباق جهازين');
  const op=officeSrc.slice(officeSrc.indexOf('window.ofHubPaySalary'),officeSrc.indexOf('window.ofRenderPresent ='));
  assert(/db\.runTransaction/.test(op),'Office يستخدم transaction أيضًا');
  assert(/safeEmp \+ '_' \+ safePeriod/.test(op),'Office نفس مبدأ المعرف الثابت');
}

// 11) UX: List مختصر + تفاصيل منظمة بالضغط.
{
  assert(/openPayrollEmployee/.test(src),'ضغط الموظف يفتح التفاصيل');
  assert(/خصم <b>-/.test(src) && /إضافة <b>\+/.test(src) && /الصافي/.test(src),
    'صف القائمة يعرض الخصم والإضافة والصافي بسرعة');
  assert(/تواريخ الغياب/.test(src) && /تواريخ الإجازة الأسبوعية/.test(src) && /سجل تعديل الراتب/.test(src),
    'التفاصيل تشرح مصدر الأرقام بالتاريخ');
}
