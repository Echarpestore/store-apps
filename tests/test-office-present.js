// ============================================================
// 👥 test-office-present — مركز موظفين الفرع في office (المرحلة 1)
//
// الكارت بيعرض الفرع المختار بس، والتصنيف من ofHubRows:
//   present = شيفت مفتوح مش منسي
//   away    = stale (نسي انصراف) · left (خلّص شيفته) ·
//             leave (أجازة معتمدة النهاردة) · absent (ماجاش)
// القواعد اللي لازم تفضل صح:
//  • موظف فرع تاني عمره ما يظهر
//  • الشيفت المقفول مش «حاضر» — بيظهر «خلّص شيفته» بمواعيده
//  • >16 ساعة مفتوح = نسي انصراف مش شغال
//  • الأجازة لازم تكون approved وبتاريخ النهاردة — pending أو تاريخ
//    تاني بيتحسب «ماجاش» (وإلا هيبان إن الغايب معذور وهو مش معذور)
//  • تبديل الشيفت (shiftSwap) مش أجازة
//  • النقط بنفس وزن sales (value>0 وإلا 1) — المرتب بيمشي عليها
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const OFF = path.resolve(__dirname, '..', 'Office');
const src = fs.readFileSync(path.join(OFF, 'office.js'), 'utf8');
const html = fs.readFileSync(path.join(OFF, 'index.html'), 'utf8');

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

const ctx = { console: { warn(){}, log(){} }, Date: Date, Math: Math, Object: Object,
              Number: Number, String: String, isNaN: isNaN };
ctx.globalThis = ctx;
vm.createContext(ctx);
{
  const m = src.match(/const OF_STALE_SHIFT_MS = [^;]+;/);
  assert(!!m, 'حد الشيفت المنسي معرّف');
  vm.runInContext(m[0], ctx);
}
['ofHubRows', 'ofHubPoints', 'ofPresentDur'].forEach(function(n){
  const f = extractFn(src, n);
  assert(f.length > 30, 'استخرجنا ' + n + ' من office.js');
  vm.runInContext(f, ctx);
});

const NOW = new Date(2026, 7, 3, 14, 0).getTime();
const H = 3600000;
const KEY = '2026-08-03';
const EMPS = [
  { id:'e1', name:'سارة', branch:'الرحاب', scheduledStartTime:'10:00' },
  { id:'e2', name:'منى',  branch:'الرحاب' },
  { id:'e3', name:'هدى',  branch:'الرحاب' },
  { id:'g1', name:'نور',  branch:'Glow' }
];
function run(shifts, breaks, leaves){
  return ctx.ofHubRows('الرحاب', EMPS, shifts||[], breaks||[], leaves||[], NOW, KEY);
}

// 1) الشيفت المفتوح = حاضر · وموظفة الفرع التاني مش بتظهر خالص
(function(){
  const r = run([
    { id:'s1', employeeId:'e1', clockInTs: NOW - 3*H, clockOutTs: null, lateMinutes: 25, latePenalized: true },
    { id:'sg', employeeId:'g1', clockInTs: NOW - 2*H, clockOutTs: null }
  ]);
  assertEq(r.present.length, 1, 'حاضرة واحدة');
  assertEq(r.present[0].name, 'سارة', 'وهي سارة');
  assertEq(r.present[0].minutes, 180, 'بقالها 3 ساعات');
  assertEq(r.present[0].lateMin, 25, 'والتأخير محمول على الصف');
  assert(r.present[0].latePenalized === true, 'ومتعلّم إنه بعد السماح');
  const names = r.present.concat(r.away).map(function(x){ return x.name; });
  assert(names.indexOf('نور') === -1, '⛔ موظفة Glow مش موجودة في كارت الرحاب');
})();

// 2) 🏁 الشيفت المقفول عمره ما يبقى «حاضر» — بيظهر خلّص شيفته بمواعيده
(function(){
  const r = run([
    { id:'s1', employeeId:'e1', clockInTs: NOW - 8*H, clockOutTs: NOW - 1*H }
  ]);
  assertEq(r.present.length, 0, 'مفيش حاضرين');
  const x = r.away.find(function(a){ return a.empId === 'e1'; });
  assertEq(x.reason, 'left', 'السبب: خلّص شيفته');
  assertEq(x.minutes, 420, 'اشتغل 7 ساعات');
})();

// 3) ⚠️ >16 ساعة مفتوح = نسي انصراف مش حاضر
(function(){
  const r = run([
    { id:'s1', employeeId:'e1', clockInTs: NOW - 17*H, clockOutTs: null }
  ]);
  assertEq(r.present.length, 0, 'مش محسوب حاضر');
  const x = r.away.find(function(a){ return a.empId === 'e1'; });
  assertEq(x.reason, 'stale', 'معلّم نسي انصراف');
})();

// 4) 🌴 الأجازة: approved + النهاردة بس
(function(){
  const ok = run([], [], [{ empId:'e1', status:'approved', dateKey: KEY, type:'leave', reason:'ظرف' }]);
  assertEq(ok.away.find(function(a){ return a.empId==='e1'; }).reason, 'leave', 'أجازة معتمدة النهاردة بتظهر');

  const pend = run([], [], [{ empId:'e1', status:'pending', dateKey: KEY, type:'leave' }]);
  assertEq(pend.away.find(function(a){ return a.empId==='e1'; }).reason, 'absent',
    '⛔ pending مش أجازة — يبان غايب مش معذور');

  const other = run([], [], [{ empId:'e1', status:'approved', dateKey:'2026-08-01', type:'leave' }]);
  assertEq(other.away.find(function(a){ return a.empId==='e1'; }).reason, 'absent',
    '⛔ أجازة يوم تاني مش النهاردة');

  const swap = run([], [], [{ empId:'e1', status:'approved', dateKey: KEY, type:'shiftSwap' }]);
  assertEq(swap.away.find(function(a){ return a.empId==='e1'; }).reason, 'absent',
    '⛔ تبديل الشيفت مش أجازة');
})();

// 5) ☕ البريكات بتتربط بصاحبها: المفتوح والمجاميع
(function(){
  const r = run(
    [{ id:'s1', employeeId:'e1', clockInTs: NOW - 5*H, clockOutTs: null }],
    [{ id:'b1', employeeId:'e1', startTs: NOW - 4*H, endTs: NOW - 4*H + 20*60000, durationMin: 20 },
     { id:'b2', employeeId:'e1', startTs: NOW - 10*60000, endTs: null },
     { id:'b3', employeeId:'e2', startTs: NOW - 1*H, endTs: NOW - 1*H + 15*60000, durationMin: 15 }]
  );
  const p = r.present[0];
  assertEq(p.brk.totalMin, 20, 'مجموع المقفول 20د');
  assert(!!p.brk.open, 'وفيه بريك مفتوح دلوقتي');
  const m = r.away.find(function(a){ return a.empId === 'e2'; });
  assertEq(m.brk.totalMin, 15, 'وبريك منى على منى مش على سارة');
})();

// 6) لو فيه شيفت مقفول وواحد مفتوح لنفس الموظفة — المفتوح بيغلب
(function(){
  const r = run([
    { id:'s1', employeeId:'e1', clockInTs: NOW - 9*H, clockOutTs: NOW - 6*H },
    { id:'s2', employeeId:'e1', clockInTs: NOW - 2*H, clockOutTs: null }
  ]);
  assertEq(r.present.length, 1, 'حاضرة (رجعت تاني)');
  assertEq(r.present[0].shiftId, 's2', 'بالشيفت المفتوح');
})();

// 7) الترتيب: نسي انصراف الأول ثم خلّص ثم أجازة ثم ماجاش
(function(){
  const r = run(
    [{ id:'s1', employeeId:'e1', clockInTs: NOW - 20*H, clockOutTs: null },
     { id:'s2', employeeId:'e2', clockInTs: NOW - 9*H, clockOutTs: NOW - 2*H }],
    [],
    [{ empId:'e3', status:'approved', dateKey: KEY, type:'leave' }]
  );
  assertEq(r.away.map(function(a){ return a.reason; }).join(','), 'stale,left,leave', 'ترتيب الأسباب ثابت');
})();

// 8) ⭐ النقط بوزن sales: value>0 وإلا 1
(function(){
  const pts = [
    { employeeId:'e1', ts: NOW },
    { employeeId:'e1', ts: NOW, value: 0.5 },
    { employeeId:'e1', ts: NOW, value: 0 },
    { employeeId:'e2', ts: NOW, value: 3 }
  ];
  const a = ctx.ofHubPoints(pts, 'e1');
  assertEq(a.count, 3, '3 عمليات لسارة');
  assertEq(a.weight, 2.5, 'الوزن 1 + 0.5 + 1 (الصفر بيتحسب 1 زي sales)');
  assertEq(ctx.ofHubPoints(pts, 'e2').weight, 3, 'ومنى بوزنها');
  assertEq(ctx.ofHubPoints(pts, 'e3').count, 0, 'وهدى مفيش');
})();

// 9) التوصيل في الواجهة
(function(){
  assert(/id="dayPresent"/.test(html), 'عنصر الكارت موجود في page-day');
  const rp = extractFn(src, 'ofRenderPresent');
  assert(/_ofHubBranch\(\)/.test(rp), 'الكارت بيقرا الفرع المختار');
  const hb = extractFn(src, '_ofHubBranch');
  assert(/#dayBranch/.test(hb), 'من نفس منسدلة اليوم');
  assert(/_ofHubOpen/.test(rp), 'ومقفول/بيتفتح بالدوسة');
  assert(/ofHubSheet/.test(rp), 'ودوسة الموظف بتفتح صفحته');
  assert(/window\.ofHubRows = ofHubRows/.test(src), 'الدالة النقية متعرّضة');
  // 📉 القراءات: النقط مش في التحميل الدوري — بتتقرا عند فتح الصفحة بس
  const load = extractFn(src, '_ofHubLoad');
  assert(!/sales_points/.test(load), '⛔ النقط مش بتتقرا كل 4 دقايق');
  const pl = extractFn(src, '_ofHubPtsLoad');
  assert(/sales_points/.test(pl), 'بتتقرا في صفحة الموظف بس');
})();
