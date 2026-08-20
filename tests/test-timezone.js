// ============================================================
// 🕒 test-timezone — التوقيت مثبّت على القاهرة مهما كان الجهاز فين
//
// الباج (اتكشف والمالك في البرازيل، فرق 6 ساعات):
// تطبيق sales كان بيحسب كل حاجة بـ`getHours/getDate` بتاعت الجهاز.
//   · شيفت 10:08ص → 6:14م بالقاهرة ظهر 4:08ص → 12:14م
//   · والانصراف بدري اتحسب بميعاد النهاية بتوقيت البرازيل → 285 دقيقة
//     \"بدري\" = 28 ساعة رصيد = **4 أيام خصم** من موظفة شغّالة شيفتها كامل
//   · وأي حاجة تتسجّل من جهازه بتاخد تاريخ البرازيل
//   · وسجل أيام الشغل (بديل جهاز البصمة) بيحط الشيفت في اليوم الغلط
//
// ⚠️ الاختبار ده بيشغّل **نفس الكود مرتين**: مرة والجهاز على توقيت
//    ساو باولو ومرة على القاهرة، وبيتأكد إن كل رقم طلع **متطابق**.
//    ده اختبار سلوكي بمعنى الكلمة: لو حد رجّع أي `getHours()` محلية،
//    النتيجتين هيختلفوا والاختبار يقع.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'sales', 'sales-app.js'), 'utf8');

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

const tzc = src.match(/const CAI_TZ = '([^']+)'/);
assert(!!tzc && tzc[1] === 'Africa/Cairo', 'التوقيت مثبّت على Africa/Cairo في المصدر');

const WANTED = [
  'function caiParts(', 'function caiOffsetMs(', 'function cai(', 'function caiNow(',
  'function caiStamp(', 'function caiDayStart(', 'function caiDayEnd(',
  'function _fmtKey(', 'function caiDayKey(', 'function _dayKeyOf(', 'function todayStr(',
  'function _hm2min(', 'function approvedLeaveFor(', 'function effectiveStartHM(',
  'function effectiveEndHM(', 'function computeLate(', 'function scheduledShiftMinutes(',
  'function earlyLeaveFromWorked(', 'function countAttendedDaysInRange(',
  'function attendedDaysDetail(', 'function countDayOffOccurrencesInRange(',
  'function payPeriodRange(', 'function getMonthLabel(', 'function payCycleKeyOfDate(',
  'function defaultPayPeriodKey(', 'function _mkKey(', 'function payDayOfMonth(',
];
const parts = [];
let missing = null;
WANTED.forEach(h=>{
  const f = extractFn(src, h);
  if(!f && !missing) missing = h;
  if(f) parts.push(f);
});
assert(!missing, 'كل دوال الوقت اتلقت' + (missing ? ' — ناقص: ' + missing : ''));

const PRE = `
const CAI_TZ = '${tzc[1]}';
const _caiFmt = new Intl.DateTimeFormat('en-GB', { timeZone: CAI_TZ, year:'numeric',
  month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
const PAYDAY_FALLBACK = 6;
var complianceCfg = { shifts: { m: { start: '10:00', end: '17:00' } }, lateGraceMin: 15 };
var timeCfgDefaults = { earlyMinPerHour: 10, earlyGraceMin: 5, maxEarlyHoursPerDay: 7 };
`;

function build(shifts){
  const win = { advCfg: { closeDay: 6 }, allShifts: shifts || [], allLeaveReqs: [] };
  const ctx = { window: win, allShifts: shifts || [], console: { warn(){}, log(){} } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(PRE + '\n' + parts.join('\n'), ctx, { timeout: 5000 });
  return ctx;
}

// ── حالة حقيقية: شيفت 6 أغسطس 2026 بتوقيت القاهرة ──
const IN_TS  = Date.UTC(2026, 7, 6, 7, 8);    // 10:08 ص بالقاهرة (+3)
const OUT_TS = Date.UTC(2026, 7, 6, 15, 14);  // 6:14 م بالقاهرة
const EMP = { id: 'e1', name: 'حبيبة', shift: 'm', dayOff: 5 };
const SHIFTS = [
  { employeeId: 'e1', clockInTs: IN_TS, clockOutTs: OUT_TS },
  { employeeId: 'e1', clockInTs: Date.UTC(2026, 6, 31, 21, 30) },  // 1 أغسطس 00:30 بالقاهرة
];

// نجمع كل الأرقام المهمة في بصمة واحدة — لو أي حاجة اتحسبت بساعة الجهاز هتختلف
function snapshot(tz){
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try{
    const c = build(SHIFTS);
    const july = c.payPeriodRange('2026-07');
    const aug  = c.payPeriodRange('2026-08');
    const late = c.computeLate(new Date(IN_TS), EMP, c.globalThis.complianceCfg || undefined);
    const req  = c.scheduledShiftMinutes(EMP, undefined, c.caiDayKey(IN_TS));
    const worked = Math.round((OUT_TS - IN_TS) / 60000);
    const early = c.earlyLeaveFromWorked(worked, req, late.lateMin, undefined);
    const rows = c.attendedDaysDetail('e1', aug.start, aug.end, EMP);
    return {
      dayKeyIn:   c.caiDayKey(IN_TS),
      dayKeyOut:  c.caiDayKey(OUT_TS),
      dayKeyLate: c.caiDayKey(Date.UTC(2026, 6, 31, 21, 30)),
      julyStart:  july.start.getTime(), julyEnd: july.end.getTime(),
      monthLabel: c.getMonthLabel(july.start),
      lateMin:    late.lateMin,
      requiredMin: req,
      earlyMin:   early.earlyMin, earlyHours: early.hours,
      attended:   c.countAttendedDaysInRange('e1', aug.start, aug.end),
      rowKeys:    rows.map(r=> r.key).join(','),
      rowDow:     rows.map(r=> r.dow).join(','),
      cycle3Aug:  c.payCycleKeyOfDate(Date.UTC(2026, 7, 3, 9, 0), 6),
      cycle9Aug:  c.payCycleKeyOfDate(Date.UTC(2026, 7, 9, 9, 0), 6),
      defaultKey: c.defaultPayPeriodKey(Date.UTC(2026, 7, 6, 9, 0)),
      todayKey:   c.todayStr(Date.UTC(2026, 7, 6, 22, 30)),   // 1:30 فجر 7 أغسطس بالقاهرة
    };
  } finally {
    if(prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
  }
}

const BR  = snapshot('America/Sao_Paulo');   // المالك في البرازيل (−3)
const EG  = snapshot('Africa/Cairo');        // الجهاز في الفرع (+3)
const JP  = snapshot('Asia/Tokyo');          // جهاز قدّام القاهرة كمان
const UTC = snapshot('UTC');

// ============================================================
// ١) ⭐⭐ نفس الأرقام بالظبط من أي مكان في الدنيا
// ============================================================
Object.keys(EG).forEach(k=>{
  assert(BR[k] === EG[k],  '⭐⭐ ' + k + ': البرازيل = القاهرة (' + BR[k] + ' / ' + EG[k] + ')');
  assert(JP[k] === EG[k],  '⭐ ' + k + ': طوكيو = القاهرة (' + JP[k] + ' / ' + EG[k] + ')');
  assert(UTC[k] === EG[k], k + ': UTC = القاهرة');
});

// ============================================================
// ٢) والقيم نفسها صح — مش بس متطابقة
// ============================================================
assert(EG.dayKeyIn === '2026-08-06', 'الشيفت في يوم 6 أغسطس (' + EG.dayKeyIn + ')');
assert(EG.dayKeyOut === '2026-08-06', 'والانصراف نفس اليوم');
assert(EG.dayKeyLate === '2026-08-01',
  '⭐ شيفت 12:30 بعد نص الليل بيتحسب يوم 1 أغسطس مش 31 يوليو (' + EG.dayKeyLate + ')');
assert(EG.monthLabel === '2026-07', 'عنوان الفترة 2026-07 (كان بيرجع 06 من البرازيل)');
assert(EG.lateMin === 8, 'اتأخرت 8 دقايق (10:08 على شيفت 10:00) — لقينا ' + EG.lateMin);
assert(EG.requiredMin === 420, 'مدة الشيفت المجدولة 7 ساعات');
assert(EG.cycle3Aug === '2026-07' && EG.cycle9Aug === '2026-08', 'دورة السلف صح');
assert(EG.defaultKey === '2026-08', 'يوم 6 أغسطس شاشة الرواتب تفتح أغسطس');
assert(EG.todayKey === '2026-08-07', '⭐ 1:30 بالفجر لسه يوم 7 (بتوقيت القاهرة)');

// ============================================================
// ٣) ⭐⭐ حالة حبيبة — اشتغلت شيفتها كامل يبقى مفيش انصراف بدري
// ============================================================
assert(EG.earlyMin === 0 && EG.earlyHours === 0,
  '⭐⭐ جت بدري وكمّلت 8 ساعات ومشيت → صفر خصم (كان 285 دقيقة = 28 ساعة = 4 أيام)');

(function(){
  const prev = process.env.TZ; process.env.TZ = 'America/Sao_Paulo';
  try{
    const c = build([]);
    const cfg = { earlyMinPerHour: 10, earlyGraceMin: 5, maxEarlyHoursPerDay: 7 };

    // مشيت فعلًا بدري: شيفت 7 ساعات واشتغلت 4
    const real = c.earlyLeaveFromWorked(240, 420, 0, cfg);
    assert(real.earlyMin === 175, 'نقص حقيقي 175 دقيقة (420−240−5 سماح)');
    assert(real.hours === 7, '🧢 والسقف اليومي 7 ساعات (يوم واحد) مش 17 ساعة');

    // ⭐ اتأخرت 3 ساعات ومشيت في ميعادها → التأخير بس، مش عقوبتين
    const lateOnly = c.earlyLeaveFromWorked(240, 420, 180, cfg);
    assert(lateOnly.earlyMin === 0,
      '⭐⭐ اتأخرت ومشيت في ميعادها → مفيش انصراف بدري كمان (مش عقوبتين لنفس الغياب)');

    // سماح بسيط مش بيتحاسب
    assert(c.earlyLeaveFromWorked(416, 420, 0, cfg).hours === 0, 'نقص 4 دقايق جوه السماح');
    assert(c.earlyLeaveFromWorked(400, 420, 0, cfg).earlyMin === 15, 'نقص 20 دقيقة = 15 بعد السماح');

    // ملوش شيفت مجدول = مفيش حكم أصلًا
    assert(c.earlyLeaveFromWorked(60, 0, 0, cfg).hours === 0, 'من غير شيفت مجدول مفيش خصم');

    // 🔴 نيجاتيف: القاعدة القديمة (ساعة الخروج vs ميعاد النهاية) كانت هتطلّع 28 ساعة
    const oldEarlyMin = 285;
    const oldHours = Math.floor(oldEarlyMin / 10);
    assert(oldHours === 28 && EG.earlyHours !== oldHours,
      '🔴 نيجاتيف — القاعدة القديمة كانت بتطلّع 28 ساعة لنفس الشيفت');
  } finally { if(prev === undefined) delete process.env.TZ; else process.env.TZ = prev; }
})();

// ============================================================
// ٤) 🌍 التوقيت الصيفي — الحدود مش بتزحلق ساعة
// ============================================================
(function(){
  const prev = process.env.TZ; process.env.TZ = 'America/Sao_Paulo';
  try{
    const c = build([]);
    [['2026-01', 1, 31], ['2026-05', 5, 31], ['2026-07', 7, 31], ['2026-11', 11, 30]].forEach(([key, mo, lastDay])=>{
      const r = c.payPeriodRange(key);
      const ps = c.caiParts(r.start.getTime()), pe = c.caiParts(r.end.getTime());
      assert(ps.m === mo && ps.d === 1 && ps.hh === 0 && ps.mi === 0,
        key + ': البداية 00:00 يوم 1 بالقاهرة (شتاء وصيف)');
      assert(pe.m === mo && pe.d === lastDay && pe.hh === 23,
        key + ': والنهاية آخر يوم فعلي في الشهر بالقاهرة');
    });
  } finally { if(prev === undefined) delete process.env.TZ; else process.env.TZ = prev; }
})();

// ============================================================
// ٥) مفيش قراءات وقت محلية ناجية في الملفات الحرجة
// ============================================================
(function(){
  const bare = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  [
    ['function computeLate(', 'التأخير'],
    ['function countAttendedDaysInRange(', 'عدّ أيام الحضور'],
    ['function attendedDaysDetail(', 'سجل الأيام'],
    ['function payPeriodRange(', 'حدود فترة القبض'],
    ['function getMonthDateRange(', 'حدود الشهر'],
    ['function getMonthLabel(', 'عنوان الشهر'],
    ['function payCycleKeyOfDate(', 'دورة السلف'],
    ['function todayStr(', 'مفتاح النهاردة'],
    ['function _dayKeyOf(', 'مفتاح اليوم'],
  ].forEach(([h, label])=>{
    const fn = extractFn(bare, h);
    assert(!!fn, 'اتلقت: ' + label);
    if(fn) assert(/cai|_fmtKey|_dayKeyOf|getMonthLabel/.test(fn),
      '⭐ ' + label + ': بيمشي على القاهرة مش على ساعة الجهاز');
  });
  const sw = fs.readFileSync(path.join(ROOT, 'sales', 'sw.js'), 'utf8');
  const m = sw.match(/store-apps-shell-v(\d+)/);
  assert(!!m && Number(m[1]) >= 104, 'sales/sw.js: CACHE_NAME v104+ (لقينا ' + (m ? m[1] : '—') + ')');
})();
