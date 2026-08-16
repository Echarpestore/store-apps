// ============================================================
// 🧪 test-leave-context.js — صورة اليوم قبل الموافقة على إذن
// ------------------------------------------------------------
// 🔴 شكوى المالك حرفيًا: «بوافق وأنا مش فاهم ولا شايف حاجة».
//    الكارت كان بيقول **مين طلبت** بس — والقرار الحقيقي مش عن
//    الطالبة، هو عن **الفرع في اليوم ده**: مين صباحي، مين مسائي،
//    مين مش موجود، وهيفضل كام لو وافق.
//
// اللي الاختبار ده بيقفله:
//   ١) عرض العدد **الحالي** بدل اللي هيفضل بعد الموافقة — ده
//      بيطمّن غلط: ٣ موجودين دلوقتي معناها ٢ بعد ما توافق.
//   ٢) إهمال الإجازة الأسبوعية الثابتة — المالك يوافق ويلاقي
//      الفرع فاضي وهو شايف رقم بيقول إن فيه ناس.
//   ٣) عدّ الأذونات **المعلّقة** كغياب — دي لسه احتمال، وعدّها
//      بيخوّف من موافقة مش لازمة.
//   ٤) قراءات جديدة — البيانات محمّلة أصلًا، وأي استعلام جديد
//      هنا بيتكرر مع كل فتحة للـinbox.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'Office', 'office.js'), 'utf8');

function extractFn(s, name){
  const start = s.indexOf('function ' + name + '(');
  if(start < 0) return '';
  const open = s.indexOf('{', start);
  let depth = 0;
  for(let i = open; i < s.length; i++){
    if(s[i] === '{') depth++;
    else if(s[i] === '}'){ depth--; if(depth === 0) return s.slice(start, i + 1); }
  }
  return '';
}

const D = { employees: [], leaves: [] };
const sb = { Object, Math, Number, String, Array, JSON, Date, isNaN, console, D,
             window: {}, esc: function(x){ return String(x == null ? '' : x); } };
vm.createContext(sb);
const code = extractFn(SRC, 'ofLeaveContext');
assert(code.length > 0, 'mustExtract: ofLeaveContext اتلقت');
vm.runInContext(code, sb);
const ctxOf = function(req){
  return vm.runInContext('ofLeaveContext(' + JSON.stringify(req) + ')', sb);
};

/* الأحد = 0. خلّينا اليوم أحد: 2026-08-16 */
const DAY = '2026-08-16';
function setup(){
  sb.D.employees = [
    { id:'e1', name:'منى',  branch:'الرحاب', shift:'morning', active:true },
    { id:'e2', name:'سارة', branch:'الرحاب', shift:'morning', active:true },
    { id:'e3', name:'هدى',  branch:'الرحاب', shift:'evening', active:true },
    { id:'e4', name:'ندى',  branch:'الرحاب', shift:'evening', active:true, dayOff:0 },
    { id:'e5', name:'أمل',  branch:'مدينتي', shift:'morning', active:true },
    { id:'e6', name:'ريم',  branch:'الرحاب', shift:'morning', active:false }
  ];
  sb.D.leaves = [];
}

/* ============================================================
   ١) الأساسي — الشيفتات والفرع
   ============================================================ */
(function(){
  setup();
  const c = ctxOf({ id:'L1', branch:'الرحاب', dateKey:DAY, employeeId:'e1' });
  assertEq(c.morning.length, 2, 'الصباحي في الفرع ده اتنين');
  assertEq(c.evening.length, 2, 'والمسائي اتنين');
  assert(!c.rows.some(function(r){ return r.name === 'أمل'; }),
    '⭐⭐ موظفة فرع تاني مش داخلة الحسبة');
  assert(!c.rows.some(function(r){ return r.name === 'ريم'; }),
    '⭐ والموقوفة كمان');
  assertEq(c.requester.name, 'منى', 'الطالبة متحددة');
})();

/* ============================================================
   ٢) ⭐⭐ الرقم = اللي هيفضل **بعد** الموافقة
   ============================================================ */
(function(){
  setup();
  const c = ctxOf({ id:'L1', branch:'الرحاب', dateKey:DAY, employeeId:'e1' });
  assertEq(c.afterMorning, 1,
    '⭐⭐ صباحي بعد الموافقة = ١ (الطالبة مستبعدة) مش ٢');
  assertEq(c.afterEvening, 1,
    '⭐⭐ ومسائي = ١ — ندى إجازتها الأسبوعية يوم الأحد');
})();

/* ============================================================
   ٣) ⭐⭐ الإجازة الأسبوعية غياب فعلي
   ============================================================ */
(function(){
  setup();
  const c = ctxOf({ id:'L1', branch:'الرحاب', dateKey:DAY, employeeId:'e3' });
  const nada = c.rows.filter(function(r){ return r.name === 'ندى'; })[0];
  assertEq(nada.off, true, '⭐⭐ ندى مش موجودة (إجازتها الأسبوعية)');
  assertEq(nada.why, 'إجازتها الأسبوعية', 'والسبب مكتوب');
  assertEq(c.afterEvening, 0,
    '⭐⭐ لو وافقت لهدى، المسائي هيفضل **من غير حد** — ده الرقم اللي بيمنع القرار الغلط');

  // ويوم تاني، ندى موجودة عادي
  const c2 = ctxOf({ id:'L1', branch:'الرحاب', dateKey:'2026-08-17', employeeId:'e3' });
  assertEq(c2.afterEvening, 1, '⭐ ويوم الاتنين ندى موجودة');
})();

/* ============================================================
   ٤) ⭐⭐ المعلّق مش غياب
   ============================================================ */
(function(){
  setup();
  sb.D.leaves = [
    { id:'L2', branch:'الرحاب', dateKey:DAY, employeeId:'e2', empName:'سارة', status:'pending' }
  ];
  let c = ctxOf({ id:'L1', branch:'الرحاب', dateKey:DAY, employeeId:'e1' });
  assertEq(c.afterMorning, 1,
    '⭐⭐ الإذن المعلّق مبيتحسبش غياب (لسه احتمال — عدّه بيخوّف من موافقة لازمة)');

  sb.D.leaves[0].status = 'approved';
  c = ctxOf({ id:'L1', branch:'الرحاب', dateKey:DAY, employeeId:'e1' });
  assertEq(c.afterMorning, 0, '⭐⭐ وأول ما يتوافق عليه، الصباحي يبقى صفر');
  assert(c.offRows.some(function(r){ return r.name === 'سارة'; }), 'وبتظهر في «مش موجودين»');

  // إذن في يوم تاني أو فرع تاني مالوش دعوة
  sb.D.leaves = [
    { id:'L3', branch:'الرحاب', dateKey:'2026-08-20', employeeId:'e2', status:'approved' },
    { id:'L4', branch:'مدينتي', dateKey:DAY, employeeId:'e2', status:'approved' }
  ];
  c = ctxOf({ id:'L1', branch:'الرحاب', dateKey:DAY, employeeId:'e1' });
  assertEq(c.afterMorning, 1, '⭐ إذن بيوم تاني أو فرع تاني مبيأثرش');
})();

/* ============================================================
   ٥) الربط والقراءات
   ============================================================ */
(function(){
  assert(/function ofLeaveContextHtml\(req\)/.test(SRC), 'دالة العرض موجودة');
  assert(/ofLeaveContextHtml\(_r\)/.test(SRC), '⭐ بتترسم في كارت الإذن قبل الأزرار');
  assert(/ofLeaveContext\(r\)/.test(SRC), '⭐⭐ ونفس الأرقام في نافذة التأكيد');
  assert(/هيفضل \*\*من غير حد\*\*|هيفضل من غير حد/.test(SRC),
    '⭐⭐ تحذير صريح لو الشيفت هيفضل فاضي');

  // 💰 صفر قراءات جديدة
  const i = SRC.indexOf('function ofLeaveContext(');
  const body = SRC.slice(i, i + 2600);
  assert(!/db\.collection/.test(body),
    '⭐⭐ مفيش أي استعلام جديد — الموظفين والأذونات محمّلين أصلًا');
  assert(/D\.employees/.test(body) && /D\.leaves/.test(body),
    '⭐ الحساب من البيانات اللي في الذاكرة');
  assert(/window\.ofLeaveContext = ofLeaveContext/.test(SRC),
    '⭐ القاعدة الذهبية: على window');
})();

/* ============================================================
   🔐 عزل جلسة Office — نفس حكاية loyalty/glow/feedback
   ------------------------------------------------------------
   🔴 الباج الحقيقي اللي حصل: Office وPOS كانوا الاتنين على
      التطبيق الافتراضي (بدون اسم)، فأي تصادم بينهم في نفس المتصفح
      كان بيرجّع جلسة Office لمجهول → `office_gate` ترفض القراءة
      → شاشة "لحظة..." تقف للأبد لأن `refreshGate` عمرها ما بتوصل.
   ============================================================ */
(function(){
  const fsx = require('fs'), px = require('path');
  const SRC2 = fsx.readFileSync(px.join(__dirname, '..', 'Office', 'office.js'), 'utf8');

  assert(/var ofApp = firebase\.initializeApp\(firebaseConfig, 'office'\)/.test(SRC2),
    "⭐⭐ Office بقى على تطبيق مستقل باسمه — مش الافتراضي المشترك مع POS");
  assert(/var ofAuth = firebase\.auth\(ofApp\)/.test(SRC2), 'ودخوله من نفس التطبيق المسمّى');
  assert(/const db = firebase\.firestore\(ofApp\)/.test(SRC2), 'وقراءاته وكتابته كمان');

  // ⭐⭐ صفر استخدام لـ firebase.auth() الافتراضي في كل الملف
  assert(!/firebase\.auth\(\)/.test(SRC2),
    '⭐⭐ مفيش أي نداء لـ`firebase.auth()` الافتراضي — كله عدّى على ofAuth');
  assert(!/firebase\.app\(\)\.functions/.test(SRC2),
    '⭐⭐ ونداءات الدوال (creditAdjust) كمان على التطبيق المسمّى مش الافتراضي');

  // ⚠️ الافتراضي لسه موجود بس للإشعارات بس — مطابق لنمط loyalty/glow
  assert(/firebase\.initializeApp\(firebaseConfig\);\s*\/\/ FCM بس/.test(SRC2),
    '⭐ التطبيق الافتراضي لسه بيتهيّأ للإشعارات (توكن الأجهزة القديمة يفضل شغّال)');
  assert(/firebase\.messaging\(\)/.test(SRC2),
    'والإشعارات لسه بتشتغل من الافتراضي زي ما كانت');

  // ⭐ ofAuth واحد بس — مفيش تعريف مكرر يلخبط
  const defs = (SRC2.match(/var ofAuth = firebase\.auth\(ofApp\)/g) || []).length;
  assertEq(defs, 1, '⭐ ofAuth معرّفة مرة واحدة بس');
})();
