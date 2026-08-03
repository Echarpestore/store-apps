// ============================================================
// 👥 test-office-present — «الحاضرين دلوقتي» في تطبيق office
//
// الشيفت المفتوح = فيه clockInTs ومفيش clockOutTs. اللوحة بتعرض
// الشغالين متجمعين بالفرع مع مدة كل واحد.
//
// القواعد اللي لازم تفضل صح:
//  • الشيفت المقفول عمره ما يظهر كحاضر
//  • الشيفت اللي فات عليه أكتر من 16 ساعة = نسي انصراف، مش حاضر فعلًا
//  • الاستعلام بيجيب المفتوحين بس (مش كل الشيفتات) — القراءات
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

const ctx = { console: { warn(){}, log(){} }, Date: Date, Math: Math, Object: Object, Number: Number, String: String };
ctx.globalThis = ctx;
vm.createContext(ctx);
{
  const m = src.match(/const OF_STALE_SHIFT_MS = [^;]+;/);
  assert(!!m, 'حد الشيفت المنسي معرّف');
  vm.runInContext(m[0], ctx);
}
['ofPresentRows', 'ofPresentDur'].forEach(function(n){
  const f = extractFn(src, n);
  assert(f.length > 30, 'استخرجنا ' + n + ' من office.js');
  vm.runInContext(f, ctx);
});

const NOW = new Date(2026, 7, 3, 14, 0).getTime();
const H = 3600000;
const EMPS = [
  { id:'e1', name:'سارة' },
  { id:'e2', name:'منى' },
  { id:'e3', name:'هدى' }
];

// ============================================================
// 1) الشغالين دلوقتي بيظهروا بفرعهم
// ============================================================
(function(){
  const rows = ctx.ofPresentRows([
    { id:'s1', employeeId:'e1', branch:'الرحاب', clockInTs: NOW - 3*H, clockOutTs:null },
    { id:'s2', employeeId:'e2', branch:'الرحاب', clockInTs: NOW - 1*H, clockOutTs:null },
    { id:'s3', employeeId:'e3', branch:'مدينتي', clockInTs: NOW - 2*H, clockOutTs:null }
  ], EMPS, NOW);
  assertEq(rows.length, 2, 'فرعين');
  assertEq(rows.map(function(g){ return g.branch; }), ['الرحاب','مدينتي'], 'متجمعين بالفرع');
  assertEq(rows[0].people.length, 2, 'اتنين في الرحاب');
  assertEq(rows[0].people.map(function(p){ return p.name; }), ['سارة','منى'], 'بالاسم ومرتبين بوقت الحضور');
  assertEq(rows[0].people[0].minutes, 180, 'المدة محسوبة صح (3 ساعات)');
})();

// ============================================================
// 2) 🔴 الشيفت المقفول عمره ما يظهر كحاضر
// ============================================================
(function(){
  const rows = ctx.ofPresentRows([
    { id:'s1', employeeId:'e1', branch:'الرحاب', clockInTs: NOW - 5*H, clockOutTs: NOW - 1*H },
    { id:'s2', employeeId:'e2', branch:'الرحاب', clockInTs: NOW - 2*H, clockOutTs: null }
  ], EMPS, NOW);
  assertEq(rows.length, 1, 'فرع واحد');
  assertEq(rows[0].people.length, 1, 'اللي انصرف مش بيتحسب');
  assertEq(rows[0].people[0].name, 'منى', 'الشغالة بس هي اللي ظاهرة');
})();

// ============================================================
// 3) ⚠️ شيفت فات عليه أكتر من 16 ساعة = نسي انصراف، مش حاضر
// ============================================================
(function(){
  const rows = ctx.ofPresentRows([
    { id:'s1', employeeId:'e1', branch:'الرحاب', clockInTs: NOW - 20*H, clockOutTs:null },
    { id:'s2', employeeId:'e2', branch:'الرحاب', clockInTs: NOW - 2*H,  clockOutTs:null }
  ], EMPS, NOW);
  const p = rows[0].people;
  assertEq(p.length, 2, 'الاتنين بيظهروا في القايمة');
  assertEq(p[0].stale, true, '⚠️ اللي 20 ساعة متعلّم كمنسي');
  assertEq(p[1].stale, false, 'واللي ساعتين شغالة عادي');
  assertEq(p.filter(function(x){ return !x.stale; }).length, 1, 'العدد الحقيقي واحد بس');
})();

// ============================================================
// 4) الحدود: 15 ساعة لسه شغال · 17 ساعة منسي
// ============================================================
(function(){
  const mk = function(hrs){
    return ctx.ofPresentRows([{ id:'x', employeeId:'e1', branch:'ب', clockInTs: NOW - hrs*H, clockOutTs:null }], EMPS, NOW)[0].people[0];
  };
  assertEq(mk(15).stale, false, '15 ساعة لسه محسوب شغال');
  assertEq(mk(17).stale, true,  '17 ساعة منسي');
})();

// ============================================================
// 5) شيفت من غير حضور أصلًا بيتشال
// ============================================================
(function(){
  const rows = ctx.ofPresentRows([
    { id:'s1', employeeId:'e1', branch:'الرحاب', clockInTs: null, clockOutTs: null }
  ], EMPS, NOW);
  assertEq(rows.length, 0, 'مستند ناقص مش بيكسر اللوحة');
  assertEq(ctx.ofPresentRows(null, null, NOW), [], 'مفيش داتا = قايمة فاضية');
})();

// ============================================================
// 6) موظف اتشال من الجدول: الشيفت بيفضل ظاهر باسم بديل
// ============================================================
(function(){
  const rows = ctx.ofPresentRows([
    { id:'s1', employeeId:'مش-موجود', branch:'الرحاب', clockInTs: NOW - H, clockOutTs:null }
  ], EMPS, NOW);
  assertEq(rows[0].people[0].name, 'موظف', 'اسم بديل بدل ما السطر يختفي');
})();

// ============================================================
// 7) شيفت من غير فرع بيتجمع تحت خانة واضحة (مش بيضيع)
// ============================================================
(function(){
  const rows = ctx.ofPresentRows([
    { id:'s1', employeeId:'e1', clockInTs: NOW - H, clockOutTs:null }
  ], EMPS, NOW);
  assertEq(rows.length, 1, 'ظهر');
  assertEq(rows[0].branch, 'من غير فرع', 'تحت خانة واضحة');
})();

// ============================================================
// 8) صيغة المدة
// ============================================================
(function(){
  assertEq(ctx.ofPresentDur(45), '45 د', 'أقل من ساعة');
  assertEq(ctx.ofPresentDur(60), '1 س 0 د', 'ساعة');
  assertEq(ctx.ofPresentDur(185), '3 س 5 د', 'ساعات ودقايق');
})();

// ============================================================
// 9) التوصيل: الاستعلام على المفتوحين بس + اللوحة موجودة في الصفحة
// ============================================================
(function(){
  assert(/collection\('sales_shifts'\)\s*\.where\('clockOutTs','==', null\)/.test(src),
    '⚡ الاستعلام بيجيب الشيفتات المفتوحة بس — مش كل الشيفتات');
  assert(/openShifts:\s*\[\]/.test(src), 'مكان تخزينها متعرّف في D');
  assert(/ofRenderPresent\(\)/.test(src), 'اللوحة بتترسم');
  assert(/id="dayPresent"/.test(html), 'مكان اللوحة موجود في صفحة اليوم');
  assert(/window\.ofPresentRows\s*=/.test(src), 'الدالة متعرّضة على window');
  assert(/document\.hidden/.test(src), 'التحديث الدوري بيقف والتطبيق في الخلفية');
})();

// ============================================================
// 10) الكاش اترفع (وإلا التعديل مش هيوصل للأجهزة)
// ============================================================
(function(){
  const sw = fs.readFileSync(path.join(OFF, 'sw.js'), 'utf8');
  const v = (sw.match(/echarpe-office-v(\d+)/) || [])[1];
  assert(!!v && Number(v) >= 29, 'CACHE_NAME بتاع office ≥ v29 (الحالي v' + (v || '?') + ')');
})();
