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
                   createElement: stubEl, getElementById: ()=>null,
                   querySelector: ()=>null, querySelectorAll: ()=>[] };
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

// ---------- 📦 تارجت بعدد القطع ----------
{
  const rowsP = [
    { sellerEmployeeId:'a', total:500, items:[{qty:3},{qty:2}] },              // 5 قطع
    { sellerEmployeeId:'b', total:300, items:[{qty:4}] },                      // 4 قطع
    { sellerEmployeeId:'a', total:900, items:[{qty:10}], reversed:true },      // فاتورة مرتجعة
    { sellerEmployeeId:'a', total:-100, items:[{qty:5}], isReversal:true },    // صف العكس
    { sellerEmployeeId:'z', total:400, items:[{qty:9}] },                      // برة الفريق
    { sellerEmployeeId:'a', total:200, items:[{qty:2},{qty:1, isReturn:true}] },// 2 − 1 = 1
    { sellerEmployeeId:'b', total:0,   items:[{qty:1, isRedemption:true}] },   // استبدال بنقط = مش قطعة مبيعة
    { sellerEmployeeId:'a', total:150 },                                       // فاتورة من غير items
  ];
  assertEq(PF.teamPieces(rowsP, ['a','b']), 10, 'عدّ القطع: 5+4+1 = 10 (مع استبعاد المرتجع والعكس والاستبدال)');
  assertEq(PF.teamPieces(rowsP, []), 0, 'فريق فاضي = صفر قطع');
  assertEq(PF.teamPieces(null, ['a']), 0, 'مفيش مبيعات = صفر آمن');
  assertEq(PF.teamMetric(rowsP, ['a','b'], 'pieces'), 10, 'المقياس بالقطع');
  assertEq(PF.teamMetric(rowsP, ['a','b'], 'amount'), 1150, 'المقياس بالفلوس (500+300+200+150)');
  assertEq(PF.teamMetric(rowsP, ['a','b'], undefined), 1150, 'الافتراضي = فلوس');

  const empsP = [{ id:'a', shift:'morning', active:true }, { id:'b', shift:'morning', active:true }];
  const nowP = new Date('2026-07-27T11:00:00');
  const cfgPieces = { morning:{ target:10, metric:'pieces', start:'10:00', end:'18:00' }, evening:{ target:0 } };
  const stP = PF.computeShiftStatus(rowsP, empsP, cfgPieces, nowP);
  assert(stP.morning.hit === true, '10 قطع = التارجت متضروب بالظبط');
  assertEq(stP.morning.metric, 'pieces', 'المقياس متسجّل في الحالة');
  assertEq(stP.morning.net, 10, 'الصافي بالقطع');

  const cfg11 = { morning:{ target:11, metric:'pieces', start:'10:00', end:'18:00' }, evening:{ target:0 } };
  assert(PF.computeShiftStatus(rowsP, empsP, cfg11, nowP).morning.hit === false, '11 قطعة = لسه');

  // نفس البيانات بتارجت فلوس بتدي نتيجة مختلفة — المقياسين مستقلين
  const cfgAmt = { morning:{ target:1200, metric:'amount', start:'10:00', end:'18:00' }, evening:{ target:0 } };
  assert(PF.computeShiftStatus(rowsP, empsP, cfgAmt, nowP).morning.hit === false, 'تارجت فلوس 1200 لسه (1150)');
}

// ---------- 📊 شريط التقدم: أنهي شيفت يتعرض ----------
{
  const empsW = [{ id:'a', shift:'morning', active:true }];
  const rowsW = [{ sellerEmployeeId:'a', total:400, items:[{qty:4}] }];
  const nowW  = new Date('2026-07-27T11:00:00');
  const cfgW  = { morning:{ target:1000, start:'10:00', end:'18:00' }, evening:{ target:1000, start:'14:00', end:'22:00' } };
  const stW   = PF.computeShiftStatus(rowsW, empsW, cfgW, nowW);
  assertEq(PF.shiftsInWindow(stW, nowW), ['morning'], 'التقدم بيبان للشيفت اللي جوه نافذته');
  assertEq(PF.activeCelebrations(stW, nowW), [], 'التقدم بيبان من غير احتفال (التارجت لسه)');
  // الساعة 3 العصر: الاتنين جوه النافذة (تداخل الشيفتات)
  assertEq(PF.shiftsInWindow(stW, new Date('2026-07-27T15:00:00')), ['morning','evening'],
    'وقت التداخل بيظهر الشيفتين');
  assertEq(PF.shiftsInWindow(stW, new Date('2026-07-27T23:00:00')), [], 'برة كل النوافذ = مفيش تقدم');
  // تارجت صفر = مفيش شريط أصلًا
  const stZero = PF.computeShiftStatus(rowsW, empsW, { morning:{target:0, start:'10:00', end:'18:00'}, evening:{target:0} }, nowW);
  assertEq(PF.shiftsInWindow(stZero, nowW), [], 'تارجت صفر = مفيش شريط تقدم');
  assertEq(PF.shiftsInWindow(null, nowW), [], 'مفيش حالة = آمن');
  // النسبة المعروضة
  assertEq(Math.round(stW.morning.net / stW.morning.target * 100), 40, 'التقدم 40% (400 من 1000)');
}

// ---------- 📍 مكان شريط التقدم: فوق بار البحث في شاشة البيع ----------
{
  const vm3 = require('vm'), fs3 = require('fs');
  const placed = [];
  // .sale-top عنده display:flex → لازم الشريط يتحط قبله في العمود اللي فوقه
  const col = { tag:'qbx-center',
    insertBefore(n, ref){ placed.push({ id:n.id, beforeTag:ref.tag }); n.parentNode = col; } };
  const saleTop = { tag:'sale-top', parentNode: col };
  const dash = { firstChild:{}, insertBefore(n){ n.parentNode = dash; }, appendChild(n){ n.parentNode = dash; } };
  const ctx3 = { console:{log(){},warn(){}}, window:{},
    setTimeout:(fn)=>{ try{ fn(); }catch(e){} return 0; }, setInterval:()=>0 };
  ctx3.window.window = ctx3.window;
  ctx3.document = { head:{appendChild(){}}, body:{appendChild(){}, classList:{toggle(){}}},
    createElement: ()=>({ style:{}, className:'', innerHTML:'', id:'',
      classList:{toggle(){},add(){},remove(){}}, querySelector:()=>null, appendChild(){},
      setAttribute(){}, removeAttribute(){} }),
    getElementById: (id)=> id === 'dashboardScreen' ? dash : null,
    querySelector: (sel)=> sel === '#saleScreen .sale-top' ? saleTop : null,
    querySelectorAll: ()=>[] };
  vm3.createContext(ctx3);
  vm3.runInContext("const db={}; let currentBranch='الرحاب';", ctx3);
  vm3.runInContext(fs3.readFileSync(path.resolve(__dirname,'..','pos','frames.js'),'utf8'), ctx3, {filename:'frames.js'});
  const hit = placed.filter(p=> p.id === 'pfProgSale' && p.beforeTag === 'sale-top');
  assert(hit.length === 1, 'شريط التقدم اتحط كسطر كامل فوق بار البحث (قبل .sale-top)');
  assert(!placed.some(p=> p.id === 'pfProg'), 'شريط الشاشة الرئيسية اتشال خلاص');
}
