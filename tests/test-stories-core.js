// ============================================================
// 🧪 test-stories-core.js — الستوري: الدور + نقط الموظفات من البيع
// ------------------------------------------------------------
// قرار المالك (10-10-2026):
//   ١) كل ٥ قطع تتباع من الباركود اللي الموظفة صوّرته = نقطة.
//   ٢) لو موظفتين صوّروا نفس الباركود — البيع يتقسم بينهم.
//   ٣) نفس الباركود يتصور عادي تاني (مفيش منع تكرار).
//   ٤) كل يوم موظفة واحدة عليها الدور (واللي إجازتها النهارده تتعدّى).
// ============================================================
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const S = require(path.join(ROOT, 'pos', 'stories-core.js'));

const T0 = Date.UTC(2026, 9, 10, 9, 0);   // 10 أكتوبر — 12 الضهر القاهرة
const DAY = 86400000;
const st = (o)=> Object.assign({ brand:'echarpe', status:'published', approvedAt:T0, branch:'echarpe Rehab' }, o);
const sale = (ms, items, branch)=> ({ ms, branch: branch || 'echarpe Rehab', items });

/* ١) ٥ قطع = نقطة · ٤ قطع = لسه */
{
  const stories = [st({ id:'a', barcode:'B1', employeeId:'e1', employeeName:'منى' })];
  let r = S.computeCredits(stories, [sale(T0 + 1000, [{ barcode:'B1', qty:4 }])], {});
  assertEq(r.awards.length, 0, '٤ قطع لسه مش نقطة');
  r = S.computeCredits(stories, [sale(T0 + 2000, [{ barcode:'B1', qty:1 }])], r.credits);
  assertEq(r.awards.length, 1, 'القطعة الخامسة = نقطة');
  assertEq(r.awards[0].ts, T0 + 2000, 'وقت النقطة = وقت البيعة اللي كمّلت الخمسة (عشان تنزل في شهرها)');
  assertEq(r.credits.e1.awarded, 1, 'الرصيد اتسجّل');
  r = S.computeCredits(stories, [sale(T0 + 3000, [{ barcode:'B1', qty:12 }])], r.credits);
  assertEq(r.awards.map(a=>a.k), [2,3], '١٢ قطعة كمان → نقطتين (المجموع ١٧ = ٣ نقط) والترقيم بيكمل');
}

/* ٢) القسمة بين موظفتين */
{
  const stories = [st({ id:'a', barcode:'B2', employeeId:'e1', employeeName:'منى' }), st({ id:'b', barcode:'B2', employeeId:'e2', employeeName:'سارة', approvedAt:T0 + 10 })];
  const r = S.computeCredits(stories, [sale(T0 + 100, [{ barcode:'B2', qty:10 }])], {});
  assertEq([r.credits.e1.credit, r.credits.e2.credit], [5, 5], '١٠ قطع بين اتنين = ٥ لكل واحدة');
  assertEq(r.awards.length, 2, 'نقطة لكل واحدة');
  // قبل ما التانية تصوّر: الأولى بس
  const r2 = S.computeCredits(stories, [sale(T0 + 5, [{ barcode:'B2', qty:5 }])], {});
  assertEq(Object.keys(r2.credits), ['e1'], 'البيع قبل صورة التانية بيتحسب للأولى بس');
  // نفس الموظفة صوّرت نفس الباركود مرتين = مش بتاخد ضعف
  const r3 = S.computeCredits([st({ id:'a', barcode:'B3', employeeId:'e1' }), st({ id:'c', barcode:'B3', employeeId:'e1' })], [sale(T0 + 9, [{ barcode:'B3', qty:5 }])], {});
  assertEq(r3.credits.e1.credit, 5, 'صورتين لنفس الموظفة على نفس الكود = مش بيتضاعف');
}

/* ٣) النافذة · البراند · المرتجع · الحالة */
{
  const stories = [st({ id:'a', barcode:'B4', employeeId:'e1' })];
  assertEq(S.computeCredits(stories, [sale(T0 - 1, [{ barcode:'B4', qty:5 }])], {}).awards.length, 0, 'بيع قبل الموافقة ما بيتحسبش');
  assertEq(S.computeCredits(stories, [sale(T0 + 31*DAY, [{ barcode:'B4', qty:5 }])], {}).awards.length, 0, 'بعد ٣٠ يوم ما بيتحسبش');
  assertEq(S.computeCredits(stories, [sale(T0 + 1, [{ barcode:'B4', qty:5 }])], {}, { windowDays: 0.00001 }).awards.length, 1, 'النافذة بتتظبط من الإعدادات');
  assertEq(S.computeCredits(stories, [sale(T0 + 1, [{ barcode:'B4', qty:5 }], 'Glow')], {}).awards.length, 0, 'بيع Glow ما بيتحسبش لصورة إيشارب');
  const r = S.computeCredits(stories, [sale(T0 + 1, [{ barcode:'B4', qty:4 }]), sale(T0 + 2, [{ barcode:'B4', qty:1, isReturn:true }]), sale(T0 + 3, [{ barcode:'B4', qty:1 }])], {});
  assertEq([r.credits.e1.credit, r.awards.length], [4, 0], 'المرتجع بينقص الرصيد');
  assertEq(S.computeCredits([st({ id:'a', barcode:'B5', employeeId:'e1', status:'pending' })], [sale(T0 + 1, [{ barcode:'B5', qty:9 }])], {}).awards.length, 0, 'اللي لسه مستنية موافقة ما بتحسبش');
  assertEq(S.computeCredits([st({ id:'a', barcode:'B6', employeeId:'e1', status:'archived' })], [sale(T0 + 1, [{ barcode:'B6', qty:5 }])], {}).awards.length, 1, 'الستوري اللي اتشالت من التطبيق لسه بتحسب لحد آخر النافذة');
  assertEq(S.computeCredits(stories, [sale(T0 + 1, [{ barcode:'B4', qty:5, isRedemption:true }])], {}).awards.length, 0, 'سطور الاستبدال مش بيع');
  // الترتيب: مبيعات جاية مش مترتبة
  const rr = S.computeCredits(stories, [sale(T0 + 50, [{ barcode:'B4', qty:3 }]), sale(T0 + 20, [{ barcode:'B4', qty:2 }])], {});
  assertEq(rr.awards[0].ts, T0 + 50, 'بيترتب بالوقت قبل الحساب');
}

/* ٤) الدور */
{
  const emps = [
    { id:'a', branch:'echarpe Rehab' }, { id:'b', branch:'echarpe Madinaty' }, { id:'c', branch:'Glow' },
    { id:'d', branch:'echarpe City', deletedAt: 1 }, { id:'e', branch:'الإدارة' }, { id:'f', branch:'echarpe City', active:false }
  ];
  assertEq(S.eligible(emps, 'echarpe').map(e=>e.id), ['a','b'], 'الدور على موظفات إيشارب الشغالين بس');
  assertEq(S.eligible(emps, 'glow').map(e=>e.id), ['c'], 'Glow ليها دورها');
  const t1 = S.turnFor(emps, 'echarpe', T0), t2 = S.turnFor(emps, 'echarpe', T0 + DAY);
  assert(t1 && t2 && t1.id !== t2.id, 'يومين ورا بعض = موظفتين مختلفين');
  assertEq(S.turnFor(emps, 'echarpe', T0 + 2*DAY).id, t1.id, 'الدور بيلف');
  assertEq(S.turnFor(emps, 'echarpe', T0 + 3600000).id, t1.id, 'نفس اليوم = نفس الموظفة');
  const off = emps.map(e=> e.id === t1.id ? Object.assign({}, e, { dayOff: S.dow(T0) }) : e);
  assertEq(S.turnFor(off, 'echarpe', T0).id, t2.id, 'اللي إجازتها النهارده بتتعدّى للي بعدها');
  assertEq(S.turnFor([], 'echarpe', T0), null, 'مفيش موظفات = مفيش دور');
  assertEq(S.dayKey(T0), '2026-10-10', 'يوم القاهرة');
  assertEq(S.dayKey(Date.UTC(2026, 9, 10, 22, 30)), '2026-10-11', '١٢:٣٠ بالليل القاهرة = اليوم اللي بعده');
}

/* ٥) الربط: الملفات بتستعمل المحرك ده (مش نسخة تانية) */
{
  const O2 = fs.readFileSync(path.join(ROOT, 'office2', 'stories.js'), 'utf8');
  const SAL = fs.readFileSync(path.join(ROOT, 'sales', 'sales-stories.js'), 'utf8');
  assert(/var C = window\.StoriesCore/.test(O2) && /C\.computeCredits\(/.test(O2), 'Office 2 بيحسب النقط بالمحرك المشترك');
  assert(/C\.turnFor\(/.test(O2) && /return window\.StoriesCore/.test(SAL) && /core\(\)\.turnFor\(/.test(SAL), 'الدور نفسه في Sales وOffice 2');
  assert(/'sales_points'/.test(O2) && /value:\s*1/.test(O2), 'النقطة بتنزل في sales_points زي نقط البيع');
  assert(/story_'\s*\+/.test(O2), 'معرّف النقطة ثابت (story_<موظفة>_<رقم>) — لو الحساب اتعاد ما تتكررش');
  assert(/runTransaction/.test(O2) && /_cursor/.test(O2), 'الحساب جوه معاملة بمؤشر — جهازين مش هيحسبوا نفس البيع مرتين');
  assert(/status:\s*'pending'/.test(SAL), 'اللي الموظفة بترفعه بيبدأ «مستني موافقة» — مفيش نشر من Sales');
  assert(!/status:\s*'published'/.test(SAL), 'Sales عمره ما بينشر');
  const HTML = fs.readFileSync(path.join(ROOT, 'sales', 'index.html'), 'utf8');
  const OHTML = fs.readFileSync(path.join(ROOT, 'office2', 'index.html'), 'utf8');
  assert(/pos\/stories-core\.js/.test(HTML) && /sales-stories\.js/.test(HTML), 'Sales بيحمّل ملفات الستوري');
  assert(/pos\/stories-core\.js/.test(OHTML) && /stories\.js/.test(OHTML), 'Office 2 بيحمّل ملفات الستوري');
  const RULES = fs.readFileSync(path.join(ROOT, 'security', 'firestore-phase2.rules'), 'utf8');
  assert(/match \/app_stories\/\{id\}/.test(RULES) && /match \/app_story_images\/\{id\}/.test(RULES) && /match \/app_story_credit\/\{id\}/.test(RULES), 'قواعد الستوري موجودة');
  const m = RULES.match(/match \/app_stories\/\{id\}\s*\{([\s\S]*?)\n    \}/);
  assert(m && /resource\.data\.status == 'published'/.test(m[1]) && /allow write: if isStaff\(\)/.test(m[1]), 'العميلة بتشوف المنشور بس · الكتابة للموظفين');
}

