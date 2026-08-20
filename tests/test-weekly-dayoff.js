// ============================================================
// 🗓️ test-weekly-dayoff — رصيد الإجازات الأسبوعي
// ------------------------------------------------------------
// قاعدة المالك بالنص: «يوم إجازة في الأسبوع. خد يوم زيادة يتخصم.»
// الأسبوع **من السبت للجمعة**، وكل أسبوع بيتحاسب **لوحده** —
// مفيش تجميع ولا تعويض بين الأسابيع.
//
// 🔴 التلات باجات اللي المحرك ده بيلغيهم:
//   ١) `extraOffDays = max(0, absenceDays − dayOffOccurrences)` —
//      `absenceDays` أصلًا مستبعد منه يوم الإجازة والإجازات المعتمدة،
//      وبعدين بيتطرح منه عدد الجمعات (٤) **تاني**. النتيجة: كل موظفة
//      ليها **٤ أيام غياب مجانية مستخبية** كل شهر. غياب ٣ أيام = خصم صفر.
//   ٢) `changeDayoff` كان بيشيل **يومين** (اليوم الجديد + الجمعة اللي
//      لسه `emp.dayOff`) — نقل الإجازة كان بيدي يوم ببلاش.
//   ٣) الإجازة المعتمدة كانت **بلا حد**: أي عدد أيام، صفر خصم.
//
// ⚠️ الاختبار ده **بيشغّل** المحرك على تقويم حقيقي (أغسطس ٢٠٢٦،
//    أول الشهر سبت) — مش بيدوّر على نصوص. حساب مرتبات = فلوس.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'sales', 'sales-app.js'), 'utf8');

// ⚠️ استخراج بالأقواس المتوازنة (§0) + mustExtract عشان لو الأداة
//    اتكسرت الاختبار يقع **صراحةً** مش يعدّي أخضر على لا حاجة.
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
function mustExtract(header, label){
  const fn = extractFn(src, header);
  assert(!!fn, '🔧 أداة الاستخراج: ' + label + ' اتلقت (لو دي وقعت، كل اللي تحتها وهمي)');
  return fn || '';
}

// ---------- بيئة تشغيل ----------
// الاختبار بيشتغل بتوقيت القاهرة (run.js بيثبّته)، فـ cai = هوية.
const ctx = { console: { warn(){}, log(){} } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext([
  "function cai(t){ return new Date(new Date(t).getTime()); }",
  "function _fmtKey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }",
  "function caiDayKey(ts){ return _fmtKey(new Date(ts)); }",
  mustExtract('function weekStartKeyOf(', 'weekStartKeyOf'),
  mustExtract('function shiftCountsAsDay(', 'shiftCountsAsDay'),
  mustExtract('function weeklyOffBalance(', 'weeklyOffBalance')
].join('\n'), ctx);

const EMP = { id:'e1' };
const D = (s)=> new Date(s + 'T00:00:00');
const CFG = { weekOffDays:1, weekStartDow:6, minShiftHours:8, minShiftGraceMin:15 };
// أغسطس ٢٠٢٦: يوم ١ = **السبت** (بداية أسبوع نضيفة)
const MS = D('2026-08-01'), ME = D('2026-08-31');
const day = (n)=> '2026-08-' + String(n).padStart(2, '0');
function shifts(days, hours){
  return days.map(function(d){
    return { employeeId:'e1', clockInTs: D(d).getTime(),
             clockOutTs: D(d).getTime() + (hours == null ? 9 : hours) * 3600000 };
  });
}
// كل أيام الشهر ما عدا الجمعات (٧ · ١٤ · ٢١ · ٢٨) = التزام كامل
const FRIDAYS = [7, 14, 21, 28];
const ALL = [];
for(let i = 1; i <= 31; i++) if(FRIDAYS.indexOf(i) < 0) ALL.push(day(i));
const run = (sh)=> ctx.weeklyOffBalance(EMP, MS, ME, sh, CFG);

// ============================================================
// ١) 📅 الأسبوع من السبت للجمعة
// ============================================================
{
  const L = '📅 الأسبوع: ';
  // ١ أغسطس سبت → أول أسبوع بيبدأ بيه
  assertEq(ctx.weekStartKeyOf(D('2026-08-01'), 6), '2026-08-01', L + '⭐ السبت بيبدأ أسبوعه');
  assertEq(ctx.weekStartKeyOf(D('2026-08-07'), 6), '2026-08-01', L + '⭐⭐ والجمعة بتقفله (نفس الأسبوع)');
  assertEq(ctx.weekStartKeyOf(D('2026-08-08'), 6), '2026-08-08', L + '⭐ والسبت اللي بعده أسبوع جديد');
  assertEq(ctx.weekStartKeyOf(D('2026-08-05'), 6), '2026-08-01', L + 'والأربع في النص');
  // لو حد غيّر البداية للأحد
  assertEq(ctx.weekStartKeyOf(D('2026-08-05'), 0), '2026-08-02', L + 'والإعداد بيغيّر البداية فعلًا');
}

// ============================================================
// ٢) ✅ ملتزمة تمامًا — صفر خصم وصفر مكافأة
// ============================================================
{
  const L = '✅ ملتزمة: ';
  const r = run(shifts(ALL));
  assertEq(r.shortfallDays, 0, L + '⭐⭐ مفيش خصم');
  assertEq(r.surplusDays, 0, L + '⭐⭐ ومفيش مكافأة');
  assertEq(r.weeks.length, 5, L + 'الشهر ٥ أسابيع (٤ كاملة + ناقص)');
  assertEq(r.weeks[0].required, 6, L + '⭐ الأسبوع الكامل: ٦ شغل + يوم إجازة');
  assertEq(r.weeks[0].entitled, 1, L + 'ويوم إجازة مستحق');
}

// ============================================================
// ٣) 🔴 يوم زيادة في أسبوع = خصم يوم
// ------------------------------------------------------------
// ده الباج الأصلي: بالنظام القديم غياب ٣ أيام كان خصمه **صفر**.
// ============================================================
{
  const L = '🔴 يوم زيادة: ';
  const one = run(shifts(ALL.filter(function(d){ return d !== day(4); })));
  assertEq(one.shortfallDays, 1, L + '⭐⭐ يوم واحد زيادة = خصم يوم');

  // ٣ أيام في ٣ أسابيع مختلفة
  const three = run(shifts(ALL.filter(function(d){
    return d !== day(4) && d !== day(11) && d !== day(18);
  })));
  assertEq(three.shortfallDays, 3,
    L + '⭐⭐ ٣ أيام = خصم ٣ (النظام القديم كان بيخصم **صفر** — دي كانت الفجوة)');

  // ٣ أيام في **نفس** الأسبوع
  const same = run(shifts(ALL.filter(function(d){
    return d !== day(4) && d !== day(5) && d !== day(6);
  })));
  assertEq(same.shortfallDays, 3, L + '⭐ و٣ أيام في نفس الأسبوع = خصم ٣ برضه');
}

// ============================================================
// ٤) 🎁 اشتغلت يوم إجازتها = مكافأة يوم
// ============================================================
{
  const L = '🎁 المكافأة: ';
  const r = run(shifts(ALL.concat([day(21)]).sort()));
  assertEq(r.surplusDays, 1, L + '⭐⭐ اشتغلت الجمعة = يوم فلوس زيادة');
  assertEq(r.shortfallDays, 0, L + 'ومفيش خصم');
}

// ============================================================
// ٥) 🔄 التبديل جوه نفس الأسبوع = ولا لك ولا عليك
// ------------------------------------------------------------
// اشتغلت الجمعة (٢١) وارتاحت التلات (١٨) — نفس الأسبوع.
// ============================================================
{
  const L = '🔄 التبديل: ';
  const swap = ALL.filter(function(d){ return d !== day(18); }).concat([day(21)]).sort();
  const r = run(shifts(swap));
  assertEq(r.shortfallDays, 0, L + '⭐⭐ مفيش خصم');
  assertEq(r.surplusDays, 0, L + '⭐⭐ ومفيش مكافأة — العدد متساوي');
}

// ============================================================
// ٦) ⛔ مفيش تعويض **بين** الأسابيع (قرار المالك)
// ------------------------------------------------------------
// أخدت يوم زيادة في الأسبوع الأول، واشتغلت يوم إجازتها في التالت.
// بالحساب الشهري كانوا هيلغوا بعض. بالأسبوعي: خصم يوم + مكافأة يوم.
// ============================================================
{
  const L = '⛔ التعويض: ';
  const mix = ALL.filter(function(d){ return d !== day(4); }).concat([day(21)]).sort();
  const r = run(shifts(mix));
  assertEq(r.shortfallDays, 1, L + '⭐⭐ الخصم فاضل (الأسبوع الأول)');
  assertEq(r.surplusDays, 1, L + '⭐⭐ والمكافأة فاضلة (الأسبوع التالت)');
  assert(!(r.shortfallDays === 0 && r.surplusDays === 0),
    L + '⭐⭐ الاتنين **مالغوش** بعض — ده الفرق بين الأسبوعي والشهري');
}

// ============================================================
// ٧) 📆 الأسبوع اللي على حدّ الشهر — **بيتحاسب في الشهر اللي بيخلص فيه**
// ------------------------------------------------------------
// 🔴 مشكلتين متضادين طلعوا وأنا بجرب:
//   · آخر الشهر: أغسطس بيخلص اتنين، فآخر أسبوع ٣ أيام. الموظفة
//     الملتزمة اشتغلت التلاتة والمطلوب ٢ → **يوم مكافأة ببلاش لكل
//     موظفة كل شهر**. وهي أصلًا مااشتغلتش يوم إجازتها.
//   · أول الشهر: يوليو بيبدأ أربع والأسبوع بدأ ٢٧ يونيو. اشتغلت يوم
//     إجازتها ٣ يوليو → الأسبوع بان ناقص و**ضاعت مكافأتها**.
//
// ✅ القاعدة: الأسبوع بيتحاسب في الشهر اللي **بيخلص** فيه.
//   · البداية بتتمدّ لورا لسبت الأسبوع اللي فيه `start`.
//   · والأسبوع الأخير لو ناقص **بيتأجّل** للشهر اللي بعده.
//   كده كل أسبوع بيتحاسب **مرة واحدة وكامل**، ومفيش يوم بيضيع ولا
//   بيتحسب مرتين، وكل بياناته موجودة وقت الصرف.
// ============================================================
{
  const L = '📆 حدّ الشهر: ';
  const r = run(shifts(ALL));
  const last = r.weeks[r.weeks.length - 1];
  assertEq(last.days, 3, 'آخر أسبوع ٣ أيام');
  assertEq(last.deferred, true, L + '⭐⭐ ومتأجّل للشهر اللي بعده');
  assertEq(last.required, 0, L + 'فمش داخل حساب الشهر ده');
  assertEq(last.surplus, 0, L + '⭐⭐ ومفيش مكافأة ببلاش');
  assertEq(r.shortfallDays, 0, L + 'والملتزمة صفر خصم');

  // ⏳ في المعاينة الحية الأسبوع الناقص **بيبان** عشان الغياب يظهر أول بأول
  const live = ctx.weeklyOffBalance(EMP, MS, ME, shifts(ALL), CFG, { live:true });
  const liveLast = live.weeks[live.weeks.length - 1];
  assertEq(liveLast.deferred, false, L + '⭐ وفي المعاينة الحية بيتحسب');
  assertEq(liveLast.entitled, 1, L + 'وبياخد إجازته');
  assertEq(liveLast.required, 2, L + 'فالمطلوب يومين');
  assertEq(liveLast.surplus, 0, L + '⭐⭐ بس **من غير مكافأة** — لسه ماخلصش');

  // ويومين غياب في الأسبوع الناقص بيبانوا في المعاينة
  const twoLive = ctx.weeklyOffBalance(EMP, MS, ME,
    shifts(ALL.filter(function(d){ return d !== day(30) && d !== day(31); })),
    CFG, { live:true });
  assertEq(twoLive.shortfallDays, 1, L + '⭐ ويومين في أسبوع ٣ أيام = خصم يوم (معاينة)');
}

// ٧ب) 📅 البداية بتتمدّ لورا لسبت الأسبوع
// ------------------------------------------------------------
// يوليو ٢٠٢٦ بيبدأ **أربع**، فأسبوعه الأول بدأ ٢٧ يونيو.
// ============================================================
{
  const L = '📅 المدّ لورا: ';
  const JS = new Date('2026-07-01T00:00:00'), JE = new Date('2026-07-31T00:00:00');
  const jday = (n)=> '2026-07-' + String(n).padStart(2, '0');
  // اشتغلت من ٢٧ يونيو لآخر يوليو ما عدا الجمعات
  const days = [];
  ['2026-06-27','2026-06-28','2026-06-29','2026-06-30'].forEach(function(d){ days.push(d); });
  for(let i = 1; i <= 31; i++){
    const dw = new Date(2026, 6, i).getDay();
    if(dw !== 5) days.push(jday(i));
  }
  const sh = days.map(function(d){
    return { employeeId:'e1', clockInTs: new Date(d + 'T00:00:00').getTime(),
             clockOutTs: new Date(d + 'T00:00:00').getTime() + 9*3600000 };
  });
  const r = ctx.weeklyOffBalance(EMP, JS, JE, sh, CFG);
  assertEq(r.weeks[0].week, '2026-06-27',
    L + '⭐⭐ أول أسبوع في مرتب يوليو بيبدأ ٢٧ يونيو (الأسبوع بيخلص ٣ يوليو)');
  assertEq(r.weeks[0].days, 7, L + '⭐ وكامل ٧ أيام — مش مقطوع');
  assertEq(r.shortfallDays, 0, L + 'ومفيش خصم على الملتزمة');

  // ⭐ واشتغلت يوم إجازتها ٣ يوليو → مكافأة (دي اللي كانت بتضيع)
  const withFri = sh.concat([{ employeeId:'e1',
    clockInTs: new Date('2026-07-03T00:00:00').getTime(),
    clockOutTs: new Date('2026-07-03T00:00:00').getTime() + 9*3600000 }]);
  const r2 = ctx.weeklyOffBalance(EMP, JS, JE, withFri, CFG);
  assertEq(r2.surplusDays, 1,
    L + '⭐⭐ واشتغلت يوم إجازتها ٣ يوليو = مكافأة (كانت بتضيع لما الأسبوع بان ناقص)');
}

// ============================================================
// ٨) ⏱️ الحد الأدنى ٨ ساعات — **للمكافأة بس** (قرار المالك)
// ------------------------------------------------------------
// ⚠️ القرار ده مهم: لو اليوم القصير اتحسب غياب كامل، الموظفة اللي
//    مشيت بدري بإذن كانت هتتخصم **يوم كامل** — وهي أصلًا بيتخصم
//    منها رصيد وقت على الانصراف البدري. عقوبتين على نفس الحاجة،
//    والتانية أقسى ٧ مرات.
// فالحد الأدنى بيقفل باب واحد بالظبط: "أدخل ٥ دقايق يوم إجازتي وأقبض يوم".
// ============================================================
{
  const L = '⏱️ الـ8 ساعات: ';

  // اشتغلت يوم إجازتها ٥ ساعات بس → مفيش مكافأة
  const short = run(shifts(ALL).concat(shifts([day(21)], 5)));
  assertEq(short.surplusDays, 0, L + '⭐⭐ ٥ ساعات يوم الإجازة = **مفيش** مكافأة');
  assertEq(short.shortfallDays, 0, L + 'ومفيش خصم كمان');

  // ٥ دقايق بالظبط — الباب اللي المالك خايف منه
  const tiny = run(shifts(ALL).concat(shifts([day(21)], 5/60)));
  assertEq(tiny.surplusDays, 0, L + '⭐⭐ و٥ دقايق = صفر (ده الباب اللي اتقفل)');

  // يوم عادي ٥ ساعات (انصراف بدري) → **مش** غياب
  const early = run(shifts(ALL.filter(function(d){ return d !== day(5); }))
                    .concat(shifts([day(5)], 5)));
  assertEq(early.shortfallDays, 0,
    L + '⭐⭐ انصراف بدري **مش** غياب (رصيد الوقت بيحاسبه لوحده)');

  // ٨ ساعات بالظبط → مكافأة
  const exact = run(shifts(ALL).concat(shifts([day(21)], 8)));
  assertEq(exact.surplusDays, 1, L + '⭐ ٨ ساعات بالظبط = مكافأة');

  // ٧:٥٥ → جوه السماح (ده شكل الشيفت الحقيقي: 14:10 → 22:05)
  const grace = run(shifts(ALL).concat(shifts([day(21)], 7 + 55/60)));
  assertEq(grace.surplusDays, 1,
    L + '⭐⭐ و٧:٥٥ كمان — ده شكل الشيفت الحقيقي، ووقت تسجيل الانصراف مش تحايل');

  // ٧:٤٥ = الحد بالظبط (٨ ساعات − ١٥ دقيقة)
  const edge = run(shifts(ALL).concat(shifts([day(21)], 7.75)));
  assertEq(edge.surplusDays, 1, L + 'و٧:٤٥ (الحد بالظبط) جوه');

  // ٧:٤٤ → بره
  const under = run(shifts(ALL).concat(shifts([day(21)], 7 + 44/60)));
  assertEq(under.surplusDays, 0, L + '⭐ و٧:٤٤ بره السماح');

  /* 🔢 الحساب بالدقايق الصحيحة مش بالساعات الكسرية.
     🔴 الاختبار مسك ده: الحد كان `hrs >= min - 5/60` وشيفت ٧:٥٥ بالظبط
        كان بيقع على حافة المقارنة (7.916666… ≥ 7.916666…) — نفس الشيفت
        ياخد مكافأة أو ماياخدش حسب الفاصلة العائمة. */
  const fn = mustExtract('function shiftCountsAsDay(', 'shiftCountsAsDay');
  assert(/Math\.round\(/.test(fn), L + '⭐⭐ الحساب بالدقايق الصحيحة (مفيش حافة عشرية)');
  assert(!/\/ 3600000/.test(fn), L + '⭐ ومفيش قسمة على الساعات الكسرية');
}

// ============================================================
// ٩) 🔓 الشيفت المفتوح بيتعدّ حضور
// ------------------------------------------------------------
// مدته لسه مش معروفة — لو اتحسب غياب، اللي واقفة بتشتغل دلوقتي
// كانت هتظهر غايبة.
// ============================================================
{
  const L = '🔓 الشيفت المفتوح: ';
  assertEq(ctx.shiftCountsAsDay({ clockInTs: Date.now(), clockOutTs: null }, 8), true,
    L + '⭐⭐ شيفت مفتوح = حضور');
  assertEq(ctx.shiftCountsAsDay(null, 8), false, L + 'ومفيش شيفت = لأ');
  // ومن غير حد أدنى، كله بيعدّي
  assertEq(ctx.shiftCountsAsDay({ clockInTs:0, clockOutTs: 3600000 }, 0), true,
    L + 'والحد الأدنى صفر = كل الشيفتات بتعدّي');
}

// ============================================================
// ١٠) 🧮 المحرك مبيبصّش على نوع اليوم خالص
// ------------------------------------------------------------
// ده اللي بيلغي باجّي `changeDayoff` والإجازة المعتمدة بلا حد: الدالة
// مبتقراش `emp.dayOff` ولا `approvedLeaveFor` أصلًا — بتعدّ أيام وبس.
// ============================================================
{
  const L = '🧮 مستقل: ';
  const fn = mustExtract('function weeklyOffBalance(', 'weeklyOffBalance');
  assert(!/approvedLeaveFor/.test(fn),
    L + '⭐⭐ مبيقراش الإجازات المعتمدة (فالإجازة الزيادة بتتخصم)');
  assert(!/emp\.dayOff/.test(fn),
    L + '⭐⭐ ولا `emp.dayOff` (فنقل يوم الإجازة بقى صفر تلقائي)');
  assert(!/dayOffOccurrences/.test(fn), L + '⭐ ولا العدّاد القديم');

  // نفس النتيجة مهما كان يوم إجازتها — لأنه مش داخل الحساب
  const a = run(shifts(ALL));
  const b = ctx.weeklyOffBalance({ id:'e1', dayOff:2 }, MS, ME, shifts(ALL), CFG);
  assertEq(b.shortfallDays, a.shortfallDays, L + '⭐ النتيجة مستقلة عن يوم الإجازة المسجّل');
}

// ============================================================
// ١١) 🔗 التوصيل في حساب المرتب
// ============================================================
{
  const L = '🔗 المرتب: ';
  assert(/const extraOffDays = absenceDays;/.test(src),
    L + '⭐⭐ الخصم من محرك الحضور الموحد (كل غياب يوم عمل = يوم)');
  assert(/const dayOffBonusHours = attendance\.workedDayOffHours;/.test(src),
    L + '⭐⭐ مكافأة يوم الإجازة من الساعات الفعلية');
  assert(!/const extraOffDays = Math\.max\(0, absenceDays - dayOffOccurrences\)/.test(src),
    L + '⭐⭐ والسطر القديم (٤ أيام مجانية) **اتشال** من الحساب');
  // القديم لسه بيتحسب — للمقارنة بس
  assert(/legacyExtraOffDays = Math\.max\(0, absenceDays - dayOffOccurrences\)/.test(src),
    L + '⭐ والقديم لسه بيتحسب في `legacy` للمقارنة');
  assert(/legacyExtraOffDays, legacyDeduction,/.test(src), L + 'وبيرجع في النتيجة');
  assert(/weekRows,/.test(src), L + 'وتفصيل الأسابيع بيرجع كمان');
  // §18
  assert(/window\.weeklyOffBalance = weeklyOffBalance/.test(src), L + 'المحرك على window (§18)');
  assert(/window\.shiftCountsAsDay = shiftCountsAsDay/.test(src), L + 'وكذلك فحص الشيفت');
  assert(/window\.weekStartKeyOf = weekStartKeyOf/.test(src), L + 'وحساب الأسبوع');
  // الإعدادات
  assert(/weekOffDays: 1/.test(src), L + 'إعداد أيام الإجازة موجود');
  assert(/weekStartDow: 6/.test(src), L + '⭐ وبداية الأسبوع السبت');
  assert(/minShiftHours: 8/.test(src), L + '⭐ والحد الأدنى ٨ ساعات');
  // العرض
  assert(/الأسابيع \(السبت→الجمعة\)/.test(src), L + '⭐ وتفصيل الأسابيع بيتعرض للمالك');
  assert(/الحساب اتغيّر/.test(src), L + '⭐⭐ ومقارنة القديم بالجديد قبل الصرف');
}

// ============================================================
// ١٢) 🧪 اختبارات سلبية
// ============================================================
{
  const L = '🧪 سلبي: ';

  // (أ) شيل قاعدة الأسبوع الناقص → المكافأة الوهمية بترجع
  const noPartial = mustExtract('function weeklyOffBalance(', 'weeklyOffBalance')
    .replace(/const extra = complete \? Math\.max\(0, w\.full - req\) : 0;/,
             'const extra = Math.max(0, w.full - req);');
  assert(/const extra = Math\.max\(0, w\.full - req\);/.test(noPartial), L + 'نجحنا نرجّع الباج');
  const c2 = { console:{ warn(){} } }; c2.window = c2;
  vm.createContext(c2);
  vm.runInContext([
    "function cai(t){ return new Date(new Date(t).getTime()); }",
    "function _fmtKey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }",
    "function caiDayKey(ts){ return _fmtKey(new Date(ts)); }",
    mustExtract('function weekStartKeyOf(', 'weekStartKeyOf'),
    mustExtract('function shiftCountsAsDay(', 'shiftCountsAsDay'), noPartial
  ].join('\n'), c2);
  assertEq(c2.weeklyOffBalance(EMP, MS, ME, shifts(ALL), CFG, { live:true }).surplusDays, 1,
    L + '⭐⭐ من غير القاعدة: موظفة ملتزمة بتاخد يوم مكافأة ببلاش');

  // (ب) شيل الحد الأدنى → ٥ دقايق بتقبض يوم
  const c3 = { console:{ warn(){} } }; c3.window = c3;
  vm.createContext(c3);
  vm.runInContext([
    "function cai(t){ return new Date(new Date(t).getTime()); }",
    "function _fmtKey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }",
    "function caiDayKey(ts){ return _fmtKey(new Date(ts)); }",
    mustExtract('function weekStartKeyOf(', 'weekStartKeyOf'),
    mustExtract('function shiftCountsAsDay(', 'shiftCountsAsDay'),
    mustExtract('function weeklyOffBalance(', 'weeklyOffBalance')
  ].join('\n'), c3);
  const noMin = c3.weeklyOffBalance(EMP, MS, ME, shifts(ALL).concat(shifts([day(21)], 5/60)),
                                    { weekOffDays:1, weekStartDow:6, minShiftHours:0 });
  assertEq(noMin.surplusDays, 1,
    L + '⭐⭐ من غير حد أدنى: ٥ دقايق يوم الإجازة بتقبض يوم كامل');
}
