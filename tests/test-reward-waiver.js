// ============================================================
// 🎫 test-reward-waiver — إسقاط شرط المهام لأسبوع بعينه
//
// المشكلة: المكافأة الأسبوعية كانت بتشترط إن **كل يوم شغل** في الأسبوع
// يكون فيه صورة مهمة **معتمدة من الأدمن**. ستة أيام شغل = ستة اعتمادات.
// اعتماد واحد اتنسي = الأسبوع كله ضاع مهما كان الالتزام والتقييم
// والمبيعات. ولو الميزة مش مستخدمة أصلًا → **محدش بيأهل أبدًا**، وده
// اللي كان حاصل فعلًا (ولا مكافأة واحدة اتصرفت).
//
// القرار: المالك يقدر **يسقّط شرط المهام لأسبوع معيّن** — من غير ما
// يلمس باقي الشروط. الاختبار بيحرس الحتة الخطيرة: إن الإسقاط
// **مايفتحش الباب لغير المستحقين** — رصيد الوقت والتقييم والنقط
// لازم يفضلوا يمنعوا زي ما هم.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'sales', 'sales-app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'sales', 'index.html'), 'utf8');

function stripComments(s){
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
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
const WANTED = [
  'function caiParts(', 'function caiOffsetMs(', 'function cai(', 'function caiStamp(',
  'function caiDayStart(', 'function caiDayEnd(', 'function _fmtKey(', 'function caiDayKey(',
  'function pointWeight(', 'function sumPoints(', 'function fmtPts(',
  'function approvedLeaveFor(', 'function effectiveDayOffKey(', 'function countRequiredWorkDaysInRange(',
  'function countConfirmedDaysInRange(', 'function totalCalendarDaysInRange(',
  'function rewardEligibility(', 'function rewardPeriodKey(', 'function taskGateWaived(',
  'function rewardEmploymentStartMs(', 'function rewardFullPeriodEligible(',
  'function rewardGateReport(', 'function qualifiesForReward(', 'function computeWeekComposite(',
  'function countElapsedWorkDaysInRange(', 'function _fbOwner(', 'function _fbIsFor(', 'function computeAvgRatingInRange(',
];
const parts = [];
let missing = null;
WANTED.forEach(h=>{
  const f = extractFn(src, h);
  if(!f && !missing) missing = h;
  if(f) parts.push(f);
});
assert(!missing, 'كل الدوال اتلقت' + (missing ? ' — ناقص: ' + missing : ''));

const PRE = `
const CAI_TZ = '${tzc ? tzc[1] : 'Africa/Cairo'}';
const _caiFmt = new Intl.DateTimeFormat('en-GB', { timeZone: CAI_TZ, year:'numeric',
  month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
const MIN_RATING_FOR_REWARD = 2.5;
var timeCfgDefaults = { commitGate: 90, allowedHoursWeek: 2, allowedHoursMonth: 8 };
var allSubmissions = [];
var allShifts = [];
var allFeedback = [];
function tcCounts(x){ return !x.excused; }
`;

function build(o){
  const win = {
    timeCfg: null, allTimeCredit: o.credit || [], points: o.points || [],
    rewardWaivers: { periods: o.waived || [] }, allLeaveReqs: [],
    currentBranch: 'الرحاب', allEmployees: [EMP],
  };
  const ctx = {
    window: win, console: { warn(){}, log(){} },
    allSubmissions: o.subs || [], allShifts: o.shifts || [], allFeedback: o.feedback || [],
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(PRE + '\n' + parts.join('\n'), ctx, { timeout: 5000 });
  ctx.window.rewardEligibility = ctx.rewardEligibility;
  ctx.allSubmissions = o.subs || [];
  ctx.allShifts = o.shifts || [];
  ctx.allFeedback = o.feedback || [];
  return ctx;
}

// أسبوع 27 يوليو → 2 أغسطس 2026 (الاثنين → الأحد)
function weekRange(c){ return { start: new Date(c.caiDayStart(2026,7,27)), end: new Date(c.caiDayEnd(2026,8,2)) }; }
const EMP = { id:'e1', name:'سارة', active:true, dayOff:5 };   // إجازتها الجمعة
const sub = (dateStr, confirmed)=> ({ employeeId:'e1', date: dateStr, confirmed: !!confirmed });
const ALL_DAYS = ['2026-07-27','2026-07-28','2026-07-29','2026-07-30','2026-08-01','2026-08-02'];
const fullSubs = ALL_DAYS.map(d=> sub(d, true));


// ============================================================
// ٠) 🆕 الموظف الجديد لا يأخذ مكافأة أسبوع كامل بدأ في منتصفه
// ============================================================
(function(){
  const c = build({ subs: fullSubs });
  const r = weekRange(c);
  const newbie = Object.assign({}, EMP, { hireDate:'2026-07-30', attendanceTrackingStart:'2026-07-30' });
  c.window.allEmployees = [newbie];
  assert(c.rewardFullPeriodEligible(newbie, r) === false,
    '🆕 بداية العمل داخل الأسبوع = الفترة غير كاملة للموظف');
  assert(c.qualifiesForReward(newbie, r, 'weekly') === false,
    '⛔ الموظف الجديد اللي اشتغل يومين لا يأخذ مكافأة الأسبوع الكامل');
  const next = { start:new Date(c.caiDayStart(2026,8,3)), end:new Date(c.caiDayEnd(2026,8,9)) };
  assert(c.rewardFullPeriodEligible(newbie, next) === true,
    '✅ يبدأ استحقاق المكافأة من أول فترة كاملة بعد التعيين');
})();

// ============================================================
// ١) 🔴 الوضع اللي كان: مهمة واحدة ناقصة = الأسبوع ضاع
// ============================================================
(function(){
  const c = build({ subs: fullSubs });
  const r = weekRange(c);
  const req = c.countRequiredWorkDaysInRange(EMP, r.start, r.end);
  assert(req === 6, 'ستة أيام شغل في الأسبوع (الجمعة إجازتها) — لقينا ' + req);
  assert(c.qualifiesForReward(EMP, r, 'weekly') === true, 'بستة اعتمادات = مؤهّلة');

  const c2 = build({ subs: fullSubs.slice(0, 5) });
  assert(c2.qualifiesForReward(EMP, weekRange(c2), 'weekly') === false,
    '🔴 اعتماد واحد ناقص من ستة → الأسبوع كله ضاع (ده اللي كان بيحصل)');

  // معمولة ومش معتمدة = مش محسوبة
  const c3 = build({ subs: ALL_DAYS.map(d=> sub(d, false)) });
  assert(c3.qualifiesForReward(EMP, weekRange(c3), 'weekly') === false,
    'صور مرفوعة من غير اعتماد الأدمن مش بتتحسب');
})();

// ============================================================
// ٢) ⭐⭐ الإسقاط بيفتح الباب للمستحقين
// ============================================================
(function(){
  const r0 = weekRange(build({}));
  const key = build({}).rewardPeriodKey('weekly', r0);
  assert(/^weekly_2026072[67]$/.test(key), 'مفتاح الفترة متولّد من بداية الأسبوع (' + key + ')');

  const c = build({ subs: [], waived: [key] });
  const r = weekRange(c);
  assert(c.taskGateWaived(r, 'weekly') === true, 'الأسبوع ده مسقّط');
  assert(c.qualifiesForReward(EMP, r, 'weekly') === true,
    '⭐⭐ من غير أي مهام خالص → مؤهّلة لأن الشرط مسقّط');

  // أسبوع تاني مش مسقّط — الإسقاط **مش** بيعدّي على غيره
  const c2 = build({ subs: [], waived: ['weekly_20260601'] });
  assert(c2.qualifiesForReward(EMP, weekRange(c2), 'weekly') === false,
    '⛔ إسقاط أسبوع تاني مالوش أي أثر على الأسبوع ده');
  const c3 = build({ subs: [], waived: [] });
  assert(c3.qualifiesForReward(EMP, weekRange(c3), 'weekly') === false,
    '⛔ ومن غير إسقاط الشرط شغّال زي ما هو');
})();

// ============================================================
// ٣) ⭐⭐ الإسقاط مبيفتحش الباب لغير المستحقين — أخطر جزء
// ============================================================
(function(){
  const key = build({}).rewardPeriodKey('weekly', weekRange(build({})));

  // رصيد وقت فوق المسموح (2 ساعة أسبوعيًا)
  const late = build({ subs: [], waived: [key],
    credit: [{ employeeId:'e1', date:'2026-07-28', hours: 5 }] });
  assert(late.qualifiesForReward(EMP, weekRange(late), 'weekly') === false,
    '⭐⭐ الإسقاط مبيلغيش بوابة الالتزام — 5 ساعات رصيد لسه بتمنع');

  // وعند الحد بالظبط لسه مؤهّلة
  const edge = build({ subs: [], waived: [key],
    credit: [{ employeeId:'e1', date:'2026-07-28', hours: 2 }] });
  assert(edge.qualifiesForReward(EMP, weekRange(edge), 'weekly') === true,
    'عند المسموح بالظبط (ساعتين) لسه مؤهّلة');

  // رصيد معذور مش بيتحسب
  const exc = build({ subs: [], waived: [key],
    credit: [{ employeeId:'e1', date:'2026-07-28', hours: 9, excused: true }] });
  assert(exc.qualifiesForReward(EMP, weekRange(exc), 'weekly') === true,
    'الرصيد اللي الأدمن عذره مش بيمنع');

  // تقييم واطي
  // التقييم لازم يكون **منسوب صراحةً** للموظفة وفي نفس الفرع
  const bad = build({ subs: [], waived: [key],
    feedback: ['2026-07-28','2026-07-29'].map(d=> ({ branch:'الرحاب', r: 1,
      servedByEmployeeId: 'e1', ts: new Date(d + 'T12:00:00Z').getTime() })) });
  assert(bad.qualifiesForReward(EMP, weekRange(bad), 'weekly') === false,
    '⭐⭐ والتقييم الواطي لسه بيمنع كمان');

  // حد أدنى للنقط
  const emp2 = Object.assign({}, EMP, { minWeeklyPoints: 10 });
  const few = build({ subs: [], waived: [key],
    points: [{ employeeId:'e1', ts: new Date('2026-07-28T12:00:00Z').getTime(), value: 2 }] });
  assert(few.qualifiesForReward(emp2, weekRange(few), 'weekly') === false,
    '⭐ والحد الأدنى للنقط لسه بيمنع');
})();

// ============================================================
// ٤) 🔍 التشخيص بيقول البوابة الصح بالاسم
// ============================================================
(function(){
  const c = build({ subs: fullSubs.slice(0, 4),
    credit: [{ employeeId:'e1', date:'2026-07-28', hours: 5 }] });
  const r = weekRange(c);
  const rep = c.rewardGateReport(EMP, r, 'weekly');
  assert(rep.passed === false, 'مش مؤهّلة');
  const byKey = {}; rep.gates.forEach(g=> byKey[g.key] = g);
  assert(byKey.tasks && byKey.tasks.ok === false && byKey.tasks.txt.indexOf('4 من 6') >= 0,
    '⭐ بيقول المهام 4 من 6 (مش مجرد ❌)');
  assert(byKey.commit && byKey.commit.ok === false && byKey.commit.txt.indexOf('5') >= 0,
    '⭐ وبيقول رصيد الوقت 5 من 2');
  assert(byKey.rating && byKey.rating.ok === true && byKey.rating.txt.indexOf('مفيش') >= 0,
    'ومن غير تقييمات البوابة دي مفتوحة');

  const key = c.rewardPeriodKey('weekly', r);
  const w = build({ subs: fullSubs.slice(0, 4), waived: [key] });
  const rep2 = w.rewardGateReport(EMP, weekRange(w), 'weekly');
  const t2 = rep2.gates.find(g=> g.key === 'tasks');
  assert(t2.ok === true && t2.waived === true && t2.txt.indexOf('ساقط') >= 0,
    '⭐ وبعد الإسقاط البوابة بتتعلّم "ساقط" مش بتختفي');
  assert(rep2.passed === true, 'وبقت مؤهّلة');

  // التشخيص لازم يطابق القرار الحقيقي — مش شاشة بتقول حاجة والصرف بيعمل حاجة
  [c, w].forEach((ctx, i)=>{
    const rr = weekRange(ctx);
    assert(ctx.rewardGateReport(EMP, rr, 'weekly').passed === ctx.qualifiesForReward(EMP, rr, 'weekly'),
      '⭐⭐ التشخيص = قرار الصرف بالظبط (حالة ' + (i+1) + ')');
  });
})();

// ============================================================
// ٥) 🗓️ الدرجة المركّبة (الشهرية): بند المهام يتشال مش يتحسب 100%
// ============================================================
(function(){
  const shifts = ALL_DAYS.map(d=> ({ employeeId:'e1', clockInTs: new Date(d + 'T08:00:00Z').getTime(), lateMinutes: 0 }));
  const c0 = build({ subs: [], shifts });
  const r = weekRange(c0);
  const key = c0.rewardPeriodKey('weekly', r);
  const noWaiver = c0.computeWeekComposite(EMP, r.start, r.end);

  const c1 = build({ subs: [], shifts, waived: [key] });
  const withWaiver = c1.computeWeekComposite(EMP, r.start, r.end);
  assert(withWaiver > noWaiver, '⭐ الإسقاط بيرفع الدرجة (بند المهام الصفر اتشال)');
  assert(withWaiver <= 100, 'والدرجة مفيش حاجة فوق 100');

  const c2 = build({ subs: fullSubs, shifts, waived: [key] });
  assert(c2.computeWeekComposite(EMP, r.start, r.end) === withWaiver,
    '⭐⭐ الإسقاط بيشيل البند خالص — مش بيحسبه 100% (وإلا كان هيرفع الدرجة بالغلط)');
})();

// ============================================================
// ٦) الوصلات والتخزين
// ============================================================
(function(){
  const bare = stripComments(src);
  assert(/reward_waivers/.test(bare), 'الإعداد بيتخزن في مستند مستقل');
  assert(/onSnapshot\(doc\(db,'pos_test_settings','reward_waivers'\)/.test(bare),
    '⭐ وبيتحدّث لحظيًا على كل الأجهزة');
  const setter = extractFn(src, 'async function setTaskGateWaiver(');
  assert(!!setter && /periods: cur/.test(setter), 'الإسقاط بيتسجل كقايمة فترات مش سويتش عام');
  assert(/id="rewardGatesPanel"/.test(html), 'مكان اللوحة في الشاشة');
  const ui = extractFn(src, 'function renderRewardGates(');
  assert(!!ui, 'اتلقت اللوحة');
  if(ui){
    assert(/confirm\(/.test(ui), 'الإسقاط بتأكيد');
    assert(/nIfWaived/.test(ui), '⭐ بتقولك هيبقى كام مؤهّل قبل ما تدوس (قرار مش تخمين)');
    assert(/dataset\.busy/.test(ui), 'وحارس الضغطة المزدوجة');
  }
  ['taskGateWaived','rewardGateReport','setTaskGateWaiver','renderRewardGates'].forEach(n=>{
    assert(new RegExp('window\\.' + n + ' *= *' + n).test(bare), '§18 ' + n + ' على window');
  });
  const sw = fs.readFileSync(path.join(ROOT, 'sales', 'sw.js'), 'utf8');
  const m = sw.match(/store-apps-shell-v(\d+)/);
  assert(!!m && Number(m[1]) >= 105, 'sales/sw.js: v105+ (لقينا ' + (m ? m[1] : '—') + ')');
})();
