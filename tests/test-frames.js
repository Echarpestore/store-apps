// ============================================================
// اختبارات نظام الإطارات — الجزء الحسابي في التطبيقين
//  sales: يومي / أسبوعي / سلسلة / أسبوع الشغل
//  POS  : صافي فريق الشيفت / حالة الشيفت / نوافذ الاحتفال
// ============================================================
'use strict';
const path = require('path');
const { loadSalesApp } = require('./helpers/load-sales');
const { sandbox: S } = loadSalesApp();

// ---------- 📅 أسبوع الشغل المصري: السبت → الجمعة ----------
const wkOfSat = S.frameWeekStart(new Date('2026-07-25T12:00:00')); // السبت نفسه
assertEq(wkOfSat.getDay(), 6, 'بداية الأسبوع = السبت');
assertEq(S.frameWeekStart(new Date('2026-07-27T12:00:00')).getDate(), 25, 'الاتنين بيرجع لسبت 25');
assertEq(S.frameWeekStart(new Date('2026-07-31T23:00:00')).getDate(), 25, 'الجمعة لسه في نفس الأسبوع');
assertEq(S.frameWeekStart(new Date('2026-08-01T00:30:00')).getDate(), 1, 'السبت الجديد = أسبوع جديد');

// ---------- 🟢 الإطار اليومي ----------
const DK = '2026-07-27';
const shiftsToday = [{ employeeId:'a', clockInTs: new Date('2026-07-27T10:00:00').getTime() }];
assert(S.dailyCleanFrame('a', DK, [], shiftsToday) === true, 'حضر وصفر رصيد = إطار يومي');
assert(S.dailyCleanFrame('b', DK, [], shiftsToday) === false, 'مجاش النهارده = مفيش إطار');
assert(S.dailyCleanFrame('a', DK, [{employeeId:'a', date:DK, hours:1}], shiftsToday) === false,
  'نزل عليه ساعة رصيد → الإطار بيتسحب (حي)');
assert(S.dailyCleanFrame('a', DK, [{employeeId:'a', date:DK, hours:2, excused:true}], shiftsToday) === true,
  'الرصيد المعذور مش بيكسر الإطار');
assert(S.dailyCleanFrame('a', DK, [{employeeId:'a', date:'2026-07-26', hours:3}], shiftsToday) === true,
  'رصيد إمبارح مش بيأثر على النهارده');

// ---------- 🏅 الإطار الأسبوعي + حد أدنى أيام ----------
const wkStart = new Date('2026-07-18T00:00:00');   // سبت
function daysOf(n, id){
  const out = [];
  for(let i=0;i<n;i++){ const d = new Date(wkStart); d.setDate(d.getDate()+i); d.setHours(11);
    out.push({ employeeId:id, clockInTs: d.getTime() }); }
  return out;
}
assert(S.weeklyCleanFrame('a', wkStart, [], daysOf(6,'a')) === true, '6 أيام وصفر رصيد = أسبوع نضيف');
assert(S.weeklyCleanFrame('a', wkStart, [], daysOf(5,'a')) === true, '5 أيام = الحد الأدنى بالظبط');
assert(S.weeklyCleanFrame('a', wkStart, [], daysOf(2,'a')) === false,
  'يومين بس = مفيش إطار (ثغرة أسبوع الأذونات مقفولة)');
assert(S.weeklyCleanFrame('a', wkStart, [{employeeId:'a', date:'2026-07-20', hours:1}], daysOf(6,'a')) === false,
  'ساعة واحدة في الأسبوع بتكسر الإطار');
assert(S.weeklyCleanFrame('a', wkStart, [{employeeId:'a', date:'2026-07-20', hours:5, excused:true}], daysOf(6,'a')) === true,
  'المعذور مش بيكسر الأسبوع');
// نفس اليوم مرتين (شيفت مقسوم) ميتحسبش يومين
const dup = daysOf(4,'a').concat(daysOf(1,'a'));
assert(S.weeklyCleanFrame('a', wkStart, [], dup) === false, 'تكرار نفس اليوم ميعدّش كأيام مختلفة');

// ---------- 🥈🥇 السلاسل ----------
assertEq(S.streakLevel(0), 0, 'صفر = مفيش سلسلة');
assertEq(S.streakLevel(3), 0, '3 أسابيع = لسه');
assertEq(S.streakLevel(4), 1, '4 أسابيع = فضي');
assertEq(S.streakLevel(7), 1, '7 = لسه فضي');
assertEq(S.streakLevel(8), 2, '8 أسابيع = دهبي');

// ---------- 🎯 صافي فريق الشيفت (sales-side) ----------
const rows = [
  { sellerEmployeeId:'a', total:500 },
  { sellerEmployeeId:'b', total:300 },
  { sellerEmployeeId:'a', total:200, reversed:true },     // اترجعت
  { sellerEmployeeId:'a', total:-200, isReversal:true },  // صف العكس
  { sellerEmployeeId:'z', total:900 },                    // مش من الفريق
  { total:400 },                                          // من غير بياع
];
assertEq(S.shiftTeamNet(rows, ['a','b']), 800, 'الصافي بيستبعد المرتجع وصف العكس ومن برة الفريق');
assertEq(S.shiftTeamNet(rows, []), 0, 'فريق فاضي = صفر');
assertEq(S.shiftTeamNet(null, ['a']), 0, 'مفيش مبيعات = صفر آمن');

// ---------- 🖥️ محرك POS ----------
const vm = require('vm');
const fs = require('fs');
const posSrc = fs.readFileSync(path.resolve(__dirname,'..','pos','frames.js'), 'utf8');
const ctx = { window:{}, console };
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(posSrc, ctx, { filename:'frames.js' });
const PF = ctx.window.posFrames;
assert(!!PF, 'محرك POS اتحمّل (والجزء الرسومي اتخطى من غير document)');

// نوافذ الشيفت
assert(PF.inWindow('11:00','10:00','18:00') === true,  'جوه الشيفت الصباحي');
assert(PF.inWindow('18:00','10:00','18:00') === false, 'نهاية الشيفت = خلاص برة');
assert(PF.inWindow('23:30','22:00','02:00') === true,  'شيفت بيعدّي نص الليل');
assert(PF.inWindow('03:00','22:00','02:00') === false, 'بعد نص الليل وبرة النافذة');

// الفريق
const emps = [
  { id:'a', shift:'morning', active:true },
  { id:'b', shift:'morning' },
  { id:'c', shift:'evening', active:true },
  { id:'d', shift:'morning', active:false },   // موقوف
];
assertEq(PF.teamOf(emps,'morning'), ['a','b'], 'فريق الصبح من غير الموقوف');
assertEq(PF.teamOf(emps,'evening'), ['c'], 'فريق المسا');

// الصافي + الحالة
const posRows = [
  { sellerEmployeeId:'a', total:600 },
  { sellerEmployeeId:'b', total:500 },
  { sellerEmployeeId:'a', total:1000, reversed:true },
  { sellerEmployeeId:'c', total:400 },
];
assertEq(PF.teamNet(posRows, ['a','b']), 1100, 'صافي الصبح بعد استبعاد المرتجع');
const now = new Date('2026-07-27T11:00:00');
const cfg = { morning:{ target:1000, start:'10:00', end:'18:00' }, evening:{ target:1000, start:'14:00', end:'22:00' } };
const stat = PF.computeShiftStatus(posRows, emps, cfg, now);
assert(stat.morning.hit === true,  'الصبح ضرب التارجت (1100 ≥ 1000)');
assert(stat.evening.hit === false, 'المسا لسه (400 < 1000)');
assertEq(stat.morning.team, ['a','b'], 'الفريق متسجّل في الحالة');
assertEq(stat.dateKey, '2026-07-27', 'مفتاح اليوم مظبوط');
// تارجت صفر = مفيش تارجت
const zero = PF.computeShiftStatus(posRows, emps, { morning:{target:0}, evening:{target:0} }, now);
assert(zero.morning.hit === false, 'تارجت صفر = مفيش احتفال');

// نافذة الاحتفال
assertEq(PF.activeCelebrations(stat, now), ['morning'], 'الاحتفال شغال جوه الشيفت');
assertEq(PF.activeCelebrations(stat, new Date('2026-07-27T19:00:00')), [],
  'بعد نهاية الشيفت الاحتفال بيقف لوحده');
assertEq(PF.activeCelebrations(stat, new Date('2026-07-28T11:00:00')), [],
  'حالة إمبارح متشتغلش النهارده');
assertEq(PF.activeCelebrations(null, now), [], 'مفيش حالة = مفيش احتفال');

// 🔒 الثغرة: فاتورة وهمية بتترجع → التارجت بيتسحب
const faked = posRows.concat([{ sellerEmployeeId:'a', total:5000 }]);
assert(PF.computeShiftStatus(faked, emps, cfg, now).morning.hit === true, 'قبل الترجيع: متضروب');
const afterReverse = faked.map(r=> r.total===5000 ? { ...r, reversed:true } : r)
                          .concat([{ sellerEmployeeId:'a', total:-5000, isReversal:true }]);
assertEq(PF.teamNet(afterReverse, ['a','b']), 1100, 'بعد الترجيع الصافي رجع لـ1100 (الغش مش بينفع)');

// ---------- 🌍 حماية من باج الـ cross-block: الوصول لـ db/currentBranch ----------
// pos-core.js معرّفهم بـ const/let (مش على window) — لازم frames.js يلاقيهم برضه
{
  const vm2 = require('vm'), fs2 = require('fs');
  const ctx = { console:{log(){},warn(){},error(){}}, window:{}, setTimeout:()=>0, setInterval:()=>0 };
  ctx.window.window = ctx.window;
  const stubEl = ()=>({ style:{}, classList:{toggle(){},add(){},remove(){}}, querySelector:()=>null,
                        appendChild(){}, setAttribute(){}, removeAttribute(){}, remove(){} });
  ctx.document = { head:{appendChild(){}}, body:{appendChild(){}, classList:{toggle(){}}},
                   createElement: stubEl, getElementById: ()=>null, querySelectorAll: ()=>[] };
  vm2.createContext(ctx);
  // نحاكي pos-core.js بالظبط: const/let على المستوى الأعلى
  vm2.runInContext("const db={_tag:'db'}; let currentBranch='الرحاب';", ctx);
  vm2.runInContext(fs2.readFileSync(path.resolve(__dirname,'..','pos','frames.js'),'utf8'), ctx, {filename:'frames.js'});
  assert(ctx.window.db === undefined, 'المحاكاة صحيحة: db مش على window (زي الواقع)');
  assert(!!ctx.window.posFrames, 'frames.js اتحمّل والجزء الرسومي اشتغل مع DOM وهمي');
  assert(typeof ctx.window.pfDiag === 'function', 'دالة التشخيص pfDiag متاحة');
  assert(typeof ctx.window.pfDecorateLoginTiles === 'function', 'دالة تزيين كروت الدخول متعرّضة');
}

// ---------- 🎭 الأفاتارات ----------
// (معرّفين بـ const → مش بيبقوا globals، فبنقراهم من window زي ما الـ HTML بيعمل)
const AV = S.window.AVATAR_CHOICES, avatarOf = S.window.avatarOf;
assert(Array.isArray(AV) && AV.length >= 12, 'قايمة الأشكال متاحة');
assert(new Set(AV).size === AV.length, 'مفيش شكل مكرر');
assertEq(avatarOf({ name:'Rawan Ahmed', avatarEmoji:'🦋' }), '🦋', 'اختيار الموظف بيتعرض');
assertEq(avatarOf({ name:'Rawan Ahmed' }), 'RA', 'من غير اختيار = الحروف الأولى');
assertEq(avatarOf({ name:'Noha', avatarEmoji:'' }), 'N', 'الرجوع للحروف بيشتغل (اختيار فاضي)');
assertEq(avatarOf(null), '', 'موظف مش موجود = آمن');
assert(typeof S.window.openAvatarPicker === 'function', 'منتقي الأشكال متعرّض على window');
