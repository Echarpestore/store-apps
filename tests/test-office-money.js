// ============================================================
// 💰 test-office-money — تطابق فلوس Office مع Sales (سياسة 2026)
//
// القاعدة الحاكمة: نفس الموظف + نفس الشهر + نفس البيانات = نفس المرتب
// في الشاشتين. يغطي 28/29/31، 8 ساعات، الغياب المصرح، تبديل الإجازة،
// شغل الإجازة بالساعات، السلف، والأوفرتايم.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadSalesApp } = require('./helpers/load-sales');
const { sandbox: S } = loadSalesApp();

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'Office', 'office.js'), 'utf8');

function extractFn(s, name){
  const st = s.indexOf('function ' + name + '(');
  if(st < 0) return '';
  const op = s.indexOf('{', st); let d = 0;
  for(let i=op;i<s.length;i++){
    if(s[i]==='{') d++;
    else if(s[i]==='}'){ d--; if(d===0) return s.slice(st,i+1); }
  }
  return '';
}

const ctx = { Number, String, Math, Date, Object, Array, isNaN, console:{log(){},warn(){}} };
ctx.globalThis = ctx; vm.createContext(ctx);
[
  'ofMonthDateRange','ofMonthRange','ofMonthLabel',
  'ofCountDayOffInRange','ofCountRequiredInRange','ofCountAttendedInRange',
  'ofTcAmnestied','ofTcCounts','ofMonthlyTimeSummary','ofIsSetupShift',
  'ofDateKey','ofEffectiveDayOffKey','ofApprovedLeaveFor','ofPayrollAttendanceBalance','ofPayCycleKeyOfAdvance',
  'ofComputeSalary','ofCommissionCalc'
].forEach(function(n){
  const f=extractFn(src,n); assert(f.length>30,'استخرجنا '+n+' من office.js'); vm.runInContext(f,ctx);
});

const EMP={ id:'e1',name:'سارة',branch:'الرحاب',baseSalary:3000,attendanceTrackingStart:'2026-08-01' };
const ts=(y,m,d,h)=>new Date(y,m-1,d,h==null?12:h,0,0,0).getTime();

function salesRange(key){ return S.payPeriodRange(key); }
function officeRange(y,m){ return ctx.ofMonthDateRange(new Date(y,m-1,15,12)); }
function salesCalc(key,emp,opts){
  opts=opts||{}; const r=salesRange(key);
  vm.runInContext('allShifts='+JSON.stringify(opts.shifts||[])+';',S);
  vm.runInContext('allAdvances='+JSON.stringify(opts.advances||[])+';',S);
  S.window.allTimeCredit=opts.timeCredit||[];
  S.window.deductions=opts.deductions||[];
  S.window.allLeaveReqs=opts.leaves||[];
  S.window.timeCfg=opts.timeCfg||S.timeCfgDefaults;
  return vm.runInContext('computeSalary('+JSON.stringify(emp)+',new Date('+r.start.getTime()+'),new Date('+r.end.getTime()+'))',S);
}
function officeCalc(y,m,emp,opts){
  opts=opts||{}; const r=officeRange(y,m);
  return ctx.ofComputeSalary(emp,r.start,r.end,{
    shifts:opts.shifts||[], timeCredit:opts.timeCredit||[], deductions:opts.deductions||[],
    advances:opts.advances||[], leaves:opts.leaves||[], timeCfg:opts.timeCfg||S.timeCfgDefaults,
    shiftDefs:opts.shiftDefs||{}, payDay:6
  });
}
const FIELDS=['proratedBase','overtimeMinutes','overtimePay','extraOffDays','deductionAmount',
  'timeCreditHours','timeCreditDays','timeCreditDeduction','adminDeductions','dayOffBonusHours',
  'dayOffBonusAmount','advancesTotal','advCash','advOrders','netSalary','daysInCalc','notYetHired'];
function bothSame(key,y,m,name,emp,opts){
  const a=salesCalc(key,emp,opts), b=officeCalc(y,m,emp,opts);
  FIELDS.forEach(f=>assertEq(b[f],a[f],name+' — '+f+': Office = Sales'));
  return a;
}

// 1) شهر كامل: 31 يوم حضور في الفترة لكن الأساسي الشهري لا يزيد عن 3000.
{
  const a=bothSame('2026-07',2026,7,'يوليو 31 يوم',EMP,{});
  assertEq(a.daysInCalc,31,'يوليو = 31 يوم فعلي في الفترة');
  assertEq(a.proratedBase,3000,'الشهر الكامل = نفس الأساسي، مش 31×قيمة اليوم');
  assertEq(a.netSalary,3000,'من غير خصومات/إضافات = الأساسي');
}
// فبراير 28 + سنة كبيسة 29 — لا تسريب لمارس ولا تخفيض للأساسي.
{
  const a=bothSame('2025-02',2025,2,'فبراير 28',Object.assign({},EMP,{attendanceTrackingStart:'2025-03-01'}),{});
  assertEq(a.daysInCalc,28,'فبراير 2025 = 28 يوم'); assertEq(a.proratedBase,3000,'فبراير الكامل = 3000');
  const b=bothSame('2024-02',2024,2,'فبراير كبيس',Object.assign({},EMP,{attendanceTrackingStart:'2024-03-01'}),{});
  assertEq(b.daysInCalc,29,'فبراير 2024 = 29 يوم'); assertEq(b.proratedBase,3000,'الكبيس الكامل = 3000');
}
// رصيد الوقت: 8 ساعات = يوم واحد في المحركين.
{
  const a=bothSame('2026-07',2026,7,'رصيد 15 ساعة',EMP,{timeCredit:[
    {employeeId:'e1',type:'late',hours:8,date:'2026-07-05'},
    {employeeId:'e1',type:'break',hours:4,date:'2026-07-10'},
    {employeeId:'e1',type:'early',hours:3,date:'2026-07-20'}
  ]});
  assertEq(a.timeCreditDays,1,'15 ساعة = يوم واحد كامل + 7 ساعات رصيد');
  assertEq(a.timeCreditDeduction,100,'خصم يوم = 100');
}
// إدارية + أوفرتايم معتمد.
{
  bothSame('2026-07',2026,7,'إدارية وإضافي',EMP,{
    deductions:[{employeeId:'e1',amount:150,ts:ts(2026,7,8)}],
    shifts:[{employeeId:'e1',clockInTs:ts(2026,7,10,10),clockOutTs:ts(2026,7,10,18),overtimeMinutes:120}]
  });
}
// سلفة يوم 31 تدخل في شهرها/دورتها ولا تضيع.
{
  const a=bothSame('2026-07',2026,7,'سلفة يوم 31',EMP,{advances:[
    {employeeId:'e1',amount:500,date:'2026-07-31',ts:ts(2026,7,31,15)},
    {employeeId:'e1',amount:200,date:'2026-07-10',ts:ts(2026,7,10),source:'staff_order_x'}
  ]});
  assertEq(a.advancesTotal,700,'سلفة 31 + المشتريات دخلوا نفس الدورة');
}
// تعيين منتصف شهر 31: قيمة اليوم ÷30، لكن الشهر الكامل بعد ذلك يظل أساسي كامل.
{
  const mid=Object.assign({},EMP,{hireDate:'2026-07-16',attendanceTrackingStart:'2026-08-01'});
  const a=bothSame('2026-07',2026,7,'تعيين نص الشهر',mid,{});
  assertEq(a.daysInCalc,16,'16→31 = 16 يوم'); assertEq(a.proratedBase,1600,'16 × 100 = 1600');
}
// غياب مصرح به = خصم يوم، بينما changeDayoff ينقل يوم الإجازة.
{
  const e=Object.assign({},EMP,{dayOff:5,attendanceTrackingStart:'2026-07-01'});
  const shifts=[];
  for(let d=1;d<=31;d++){
    const dow=new Date(2026,6,d).getDay(); if(dow===5) continue;
    if(d===12) continue; // غياب مصرح
    shifts.push({employeeId:'e1',clockInTs:ts(2026,7,d,10),clockOutTs:ts(2026,7,d,18)});
  }
  const leaves=[{empId:'e1',status:'approved',type:'dayoff',dateKey:'2026-07-12'}];
  const a=bothSame('2026-07',2026,7,'غياب مصرح',e,{shifts,leaves});
  assertEq(a.extraOffDays,1,'الغياب المصرح = يوم خصم واحد');
}
// شغل الإجازة بالساعات: 4 ساعات = نصف يوم = 50 جنيه.
{
  const e=Object.assign({},EMP,{dayOff:5,attendanceTrackingStart:'2026-07-01'});
  const sh=[{employeeId:'e1',clockInTs:ts(2026,7,10,10),clockOutTs:ts(2026,7,10,14)}]; // جمعة
  const a=bothSame('2026-07',2026,7,'4 ساعات يوم الإجازة',e,{shifts:sh});
  assertEq(a.dayOffBonusHours,4,'4 ساعات فعلية'); assertEq(a.dayOffBonusAmount,50,'4 × 12.5 = 50');
}

// عمولة النقط — نفس الحساب القديم، مع الوزن الكسري.
{
  const s0=new Date(2026,6,1).getTime(),e0=new Date(2026,7,0,23,59).getTime();
  const pts=[{employeeId:'e1',ts:ts(2026,7,5)},{employeeId:'e1',ts:ts(2026,7,6),value:.5},{employeeId:'e1',ts:ts(2026,7,7),value:2}];
  const pays=[{employeeId:'e1',monthLabel:'2026-07',pointsCount:1,commissionAmount:10}];
  const c=ctx.ofCommissionCalc(pts,pays,'e1',s0,e0,'2026-07',10);
  assertEq(c.pointsMonth,3.5,'وزن النقط 3.5'); assertEq(c.newPoints,2.5,'المستحق 2.5'); assertEq(c.newAmount,25,'المبلغ 25');
}

// توصيل Office: نفس البيانات + منع الصرف المكرر على مستوى قاعدة البيانات.
{
  assert(/q\('sales_leave_requests'\)/.test(src),'Office بيحمّل طلبات الإجازة/التبديل للحسبة');
  const hm=src.slice(src.indexOf('window.ofHubMoney'),src.indexOf('window.ofHubPayComm'));
  assert(/leaves: ec\.leaves/.test(hm) && /payDay: cfg\.payDay/.test(hm),'Office بيمرر leaves/payDay للمحرك');
  const ps=src.slice(src.indexOf('window.ofHubPaySalary'),src.indexOf('window.ofRenderPresent ='));
  assert(/db\.runTransaction/.test(ps),'⭐ صرف Office داخل transaction');
  assert(/\.doc\(safeEmp \+ '_' \+ safePeriod\)/.test(ps),'⭐ معرف ثابت employee+period');
  assert(/if\(prev\.length\)/.test(ps) && /تسوية منفصلة/.test(ps),'⛔ مفيش confirm يسمح بصرف مرتب ثاني');
  assert(/incompleteShifts/.test(ps),'⛔ الشيفت المفتوح يمنع الصرف من Office أيضًا');
}
