// ============================================================
// 🔴 شريط "محتاج منك" — بيجمع كل حاجة مستنية قرار
// ولازم يحترم الدور: المدير يشوف اللي يقدر يتصرف فيه بس
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeSandbox, makeFirebaseStubs, makeEl } = require('./helpers/dom-stubs');

const SB = makeSandbox(); Object.assign(SB, makeFirebaseStubs());
SB.document.getElementById = ()=> null;   // مش محتاجين DOM لاختبار الحساب
SB.document.querySelector = ()=> null;
SB.setInterval = ()=>0; SB.setTimeout = ()=>0;
vm.createContext(SB);
const src = fs.readFileSync(path.resolve(__dirname,'..','sales','sales-app.js'),'utf8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm,'');
try{ vm.runInContext(src, SB, {filename:'sales-app.js'}); }catch(e){}

const BR = 'الرحاب';
SB.window.currentBranch = BR;
SB.window.employees = [{ id:'a', branch:BR }, { id:'b', branch:BR }];
SB.window.allShifts = []; SB.window.allAttDecisions = [];
SB.window.allLeaveReqs = [
  { status:'pending',  branch:BR }, { status:'pending', branch:BR },
  { status:'approved', branch:BR },                       // متعالج
  { status:'pending',  branch:'مدينتي' },                 // فرع تاني
];
SB.window.allRegistrations = [{ status:'pending', branch:BR }];
SB.window.allSubmissions = [
  { employeeId:'a' },                                     // محتاج تأكيد
  { employeeId:'a', confirmed:true },                     // اتأكد
  { employeeId:'a', rejected:true },                      // اترفض
  { employeeId:'zz' },                                    // موظف من فرع تاني
];
SB.window.staffOrders = [
  { status:'pending', branch:BR }, { status:'pending', branch:BR }, { status:'pending', branch:BR },
  { status:'approved', branch:BR },
];
SB.window.detectAttendanceIssues = ()=> [];
SB.window.pairSwaps = ()=> ({ swaps:[{}], singles:[{},{}] });   // 3 مخالفات

// ---- المالك: بيشوف كل الأنواع ----
vm.runInContext("adminRole='owner';", SB);
let items = SB.window.pendingActions();
const byLabel = {}; items.forEach(i=> byLabel[i.label] = i.count);
assertEq(byLabel['طلبات إذن مستنية'], 2, 'الأذونات: المستنية في الفرع بس');
assertEq(byLabel['طلبات تسجيل مستنية'], 1, 'طلبات التسجيل');
assertEq(byLabel['مخالفات محتاجة مراجعة'], 3, 'المخالفات = تبديلات + فردية');
assertEq(byLabel['تاسكات محتاجة تأكيد'], 1, 'التاسكات: المتأكد والمرفوض والفرع التاني مش محسوبين');
assertEq(byLabel['أوردرات موظفين مستنية'], 3, 'أوردرات الموظفين');
assertEq(items.reduce((n,i)=> n+i.count, 0), 10, 'الإجمالي 10');

// ---- المدير: مايشوفش غير اللي في صلاحياته ----
vm.runInContext("adminRole='manager';", SB);
items = SB.window.pendingActions();
const perms = [...new Set(items.map(i=> i.perm))];
perms.forEach(p=> assert(['approvals','tasks','orders','day'].indexOf(p) >= 0,
  `المدير: بند مسموح (${p})`));
assert(items.some(i=> i.label === 'طلبات إذن مستنية'), 'المدير بيشوف الأذونات');
assert(!items.some(i=> ['money','settings','terminate','people'].indexOf(i.perm) >= 0),
  'المدير مش بيشوف أي بند من صلاحية ممنوعة');

// ---- مفيش حاجة مستنية = مفيش شريط ----
SB.window.allLeaveReqs = []; SB.window.allRegistrations = [];
SB.window.allSubmissions = []; SB.window.staffOrders = [];
SB.window.pairSwaps = ()=> ({ swaps:[], singles:[] });
vm.runInContext("adminRole='owner';", SB);
assertEq(SB.window.pendingActions().length, 0, 'صفر مستنيات = الشريط بيختفي');

// ---- بيانات ناقصة متكسرش الشريط ----
SB.window.allLeaveReqs = undefined; SB.window.staffOrders = undefined;
SB.window.detectAttendanceIssues = ()=>{ throw new Error('boom'); };
let safe = true; try{ SB.window.pendingActions(); }catch(e){ safe = false; }
assert(safe, 'بيانات ناقصة أو دالة بتقع → الشريط آمن');

// كل بند ليه تبويب يروحله
SB.window.allLeaveReqs = [{ status:'pending', branch:BR }];
SB.window.pairSwaps = ()=> ({ swaps:[], singles:[] });
SB.window.detectAttendanceIssues = ()=> [];
assert(SB.window.pendingActions().every(i=> !!i.tab), 'كل بند ليه تبويب للانتقال');
