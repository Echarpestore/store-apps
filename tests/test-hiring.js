// ============================================================
// 🧑‍💼 test-hiring — التوظيف من رابط الدعوة
// قرار المالك: **الرابط مش مفتوح**. الاختبار ده بيقفل:
//   ١) صفحة التسجيل تفتح من غير كود دعوة صالح
//   ٢) الفرع/الوظيفة يبقوا اختيار للمتقدِّمة بدل ما ييجوا من الدعوة
//   ٣) الحماية تبقى في الصفحة بس والقواعد سايبة الباب مفتوح
//   ٤) الاعتماد يسجّل الموظف مرتين
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const join  = fs.readFileSync(path.join(ROOT, 'join', 'index.html'), 'utf8');
const off   = fs.readFileSync(path.join(ROOT, 'Office', 'office.js'), 'utf8');
const offH  = fs.readFileSync(path.join(ROOT, 'Office', 'index.html'), 'utf8');
const rules = fs.readFileSync(path.join(ROOT, 'security', 'firestore-phase2.rules'), 'utf8');

function extractFn(src, name){
  const start = src.indexOf('function ' + name + '(');
  if(start < 0) return '';
  const open = src.indexOf('{', start);
  let depth = 0;
  for(let i = open; i < src.length; i++){
    if(src[i] === '{') depth++;
    else if(src[i] === '}'){ depth--; if(depth === 0) return src.slice(start, i + 1); }
  }
  return '';
}

// ============================================================
// ١) 🔐 القواعد هي الحماية — مش الصفحة
// ============================================================
{
  assert(/function inviteOpen\(code\)/.test(rules), 'دالة فحص الدعوة موجودة في القواعد');
  const fn = rules.slice(rules.indexOf('function inviteOpen'), rules.indexOf('}', rules.indexOf('function inviteOpen')) + 1);
  assert(/exists\(/.test(fn), '🔴 بتتأكد إن الدعوة **موجودة**');
  assert(/usedAt == null/.test(fn), '🔴 وإنها **مش مستعملة** — الرابط لمرة واحدة');
  assert(/expiresAt > request\.time\.toMillis\(\)/.test(fn),
    '🔴 وإنها **مش منتهية** — بتوقيت السيرفر مش جهاز المتقدِّمة');

  // تسجيل جديد: إما موظف داخلي، أو دعوة مفتوحة — مفيش طريق تالت
  const reg = rules.slice(rules.indexOf('match /sales_registrations/'),
                          rules.indexOf('}', rules.indexOf('allow update, delete', rules.indexOf('match /sales_registrations/'))));
  assert(!/allow read, create: if signedIn\(\)/.test(reg),
    '🔴 القاعدة القديمة (أي حد داخل يقدر يسجّل) اتشالت');
  assert(/inviteOpen\(request\.resource\.data\.inviteCode\)/.test(reg),
    '🔴 التسجيل الخارجي لازم دعوة مفتوحة');
  assert(/request\.resource\.data\.source == 'join'/.test(reg),
    'وبيتعلّم إنه جاي من الرابط عشان يتفرّق عن تسجيل الفرع');

  // المستندات
  const docs = rules.slice(rules.indexOf('match /staff_docs/'));
  const docsBlock = docs.slice(0, docs.indexOf('\n    }'));
  assert(/inviteOpen\(/.test(docsBlock), '🔴 رفع المستندات كمان محتاج دعوة مفتوحة');
  assert(/allow read: if isStaff\(\)/.test(docsBlock),
    '🔒 صور البطاقات تتقري للموظفين بس — دي بيانات شخصية حساسة');

  // الدعوات نفسها
  const inv = rules.slice(rules.indexOf('match /staff_invites/'));
  const invBlock = inv.slice(0, inv.indexOf('\n    }'));
  assert(/allow list: if isStaff\(\)/.test(invBlock),
    '🔴 مفيش استعلام على المجموعة لغير الموظفين — وإلا حد ينزّل كل الأكواد المفتوحة');
  assert(/allow get:\s*if signedIn\(\)/.test(invBlock), 'والمتقدِّمة بتقرا كودها هي بس');
  assert(/hasOnly\(\['usedAt','regId','usedBy'\]\)/.test(invBlock),
    '🔴 المتقدِّمة تقدر **تقفل** الدعوة بس — مش تغيّر الفرع ولا الوظيفة ولا تاريخ الانتهاء');
  assert(/resource\.data\.usedAt == null/.test(invBlock), 'ومرة واحدة بس');
}

// ============================================================
// ٢) الصفحة: مفيش اختيار فرع ولا وظيفة — بييجوا من الدعوة
// ============================================================
{
  assert(/const STEPS = \[/.test(join), 'قايمة الخطوات موجودة');
  const steps = join.slice(join.indexOf('const STEPS = ['), join.indexOf('];', join.indexOf('const STEPS = [')));
  assert(steps.indexOf("'brand'") < 0 && steps.indexOf("'branch'") < 0 && steps.indexOf("'role'") < 0,
    '🔴 خطوات اختيار البراند والفرع والوظيفة اتشالت — بييجوا من الدعوة');
  assert(steps.indexOf("'trial'") > 0, 'وخطوة فترة الاختبار باقية');
  assert(!/window\.pickBrand/.test(join), 'ومفيش دالة اختيار براند فاضلة');

  assert(/D\.branch = d\.branch/.test(join), '🔑 الفرع بيتاخد من مستند الدعوة');
  assert(/D\.role\s*=\s*d\.role/.test(join), 'والوظيفة كمان');
  assert(/signInAnonymously/.test(join), 'الدخول مجهول عشان القواعد تعرف تفرّق');
}

// ============================================================
// ٣) البوابة بترفض في الحالات الأربعة
// ============================================================
{
  const gate = join.slice(join.indexOf('async function openGate()'), join.indexOf('async function submitAll'));
  assert(/if\(!INVITE_CODE\)/.test(gate), '⛔ رابط من غير كود = مرفوض');
  assert(/if\(d\.usedAt\)/.test(gate), '⛔ دعوة مستعملة = مرفوضة');
  assert(/Date\.now\(\) > Number\(d\.expiresAt\)/.test(gate), '⛔ دعوة منتهية = مرفوضة');
  assert(/if\(!ROLES\[d\.role\]\)/.test(gate), '⛔ وظيفة مش معروفة = مرفوضة');
  // الصفحة مبتظهرش غير بعد النجاح
  const showAt = gate.indexOf("getElementById('page').style.display = ''");
  assert(showAt > gate.indexOf('INVITE = d'),
    '🔴 النموذج مبيظهرش غير **بعد** ما الدعوة تتأكد');
}

// ============================================================
// ٤) الإرسال: الترتيب والمستندات المنفصلة
// ============================================================
{
  const sub = join.slice(join.indexOf('async function submitAll'), join.indexOf('let SENT_ID'));
  const iReg  = sub.indexOf("collection('sales_registrations')");
  const iDocs = sub.indexOf("collection('staff_docs')");
  const iUsed = sub.indexOf('usedAt: Date.now()');
  assert(iReg > 0 && iDocs > iReg, 'الطلب الأول ثم المستندات');
  assert(iUsed > iDocs,
    '🔴 الدعوة بتتقفل **آخر حاجة** — لو اتقفلت الأول، القواعد هترفض المستندات وتضيع');
  assert(/for\(let i = 0; i < keys\.length; i\+\+\)/.test(sub),
    '📎 كل صورة في مستند مستقل — حد المستند مليون بايت والصور مش هتدخل مع بعض');
  assert(/inviteCode: INVITE_CODE/.test(sub), 'وكل مستند شايل كود الدعوة عشان القاعدة تتأكد منه');
  // الحقول اللي تطبيق الحضور بيقراها لازم تفضل بنفس الأسماء
  ['name:', 'gender:', 'shift:', 'dayOff:', 'pin:', 'branch:', "status: 'pending'"].forEach(k=>{
    assert(sub.indexOf(k) > 0, 'حقل ' + k + ' موجود بنفس اسم تطبيق الحضور');
  });
  assert(/scheduledStartTime: SHIFTS\[D\.shift\]\.raw24from/.test(sub),
    '🕐 مواعيد الشيفت بصيغة 24 ساعة — ده اللي حساب التأخير بيقراه');
}

// مواعيد الشيفت: نص العرض عربي والقيمة المخزّنة 24 ساعة
{
  const sb = { window:{} };
  vm.createContext(sb);
  const block = join.slice(join.indexOf('const SHIFTS = {'), join.indexOf('};', join.indexOf('const SHIFTS = {')) + 2);
  vm.runInContext(block, sb);
  const S = vm.runInContext('SHIFTS', sb);
  assertEq(S.morning.raw24from, '10:00', 'الصباحي بيبدأ 10:00');
  assertEq(S.morning.raw24to,   '18:00', '🔴 وبينتهي 18:00 مش "6:00" — لو اتخزن بصيغة العرض التأخير هيتحسب غلط');
  assertEq(S.evening.raw24from, '14:00', 'والمسائي 14:00');
  assertEq(S.evening.raw24to,   '22:00', 'لـ22:00');
  assert(S.morning.label.indexOf('شيفت') >= 0, 'والاسم المعروض «شيفت» مش «وردية»');
}

// ============================================================
// ٥) Office: توليد الكود والاعتماد
// ============================================================
{
  const sb = { window:{}, Math, Uint32Array, String };
  vm.createContext(sb);
  vm.runInContext(extractFn(off, 'hvCode'), sb);
  const codes = {};
  for(let i = 0; i < 400; i++){
    const c = vm.runInContext('hvCode()', sb);
    assertEq(c.length, 6, 'الكود ٦ خانات');
    assert(/^[A-Z2-9]+$/.test(c), 'حروف كبيرة وأرقام بس');
    assert(c.indexOf('O') < 0 && c.indexOf('0') < 0 && c.indexOf('I') < 0 && c.indexOf('1') < 0,
      '🔴 من غير O/0 و I/1 — دول أكتر حاجة بتتلخبط لما الكود يتقري بالصوت');
    codes[c] = (codes[c] || 0) + 1;
  }
  const dupes = Object.keys(codes).filter(k=> codes[k] > 1).length;
  assert(dupes <= 2, 'التكرار نادر في 400 كود (' + dupes + ')');

  const ap = extractFn(off, 'hrApprove') || off.slice(off.indexOf('window.hrApprove'), off.indexOf('window.hrReject'));
  // ⚠️ §0: فحص وجود الكلمة بس بينجح حتى لو المكالمة اتلغت بشرط —
  //    لازم نمسك النداء نفسه في أول السطر ومنتظر (await).
  assert(/\n\s*await db\.runTransaction\(/.test(ap),
    '🔴 الاعتماد بحجز transaction منتظَر — من غيره دوستين على الزرار = موظف متسجّل مرتين');
  const iTx  = ap.indexOf('runTransaction');
  const iAdd = ap.indexOf("collection('sales_employees').add");
  assert(iAdd > iTx, '🔴 الموظف بيتعمل **بعد** نجاح الحجز مش قبله');
  assert(/'__ALREADY__'/.test(ap), 'والطلب المعتمد قبل كده بيترفض برسالة واضحة');
  assert(/trialDays/.test(ap) && /trialFrom/.test(ap),
    '⏳ فترة الاختبار بتتسجّل على الموظف — بتاريخ بدايتها');

  // العرض
  assert(/source === 'join'/.test(off), 'شاشة التوظيف بتعرض طلبات الرابط بس');
  assert(/hrThumb/.test(off) && /ofLightbox/.test(off), '🖼️ والمستندات بتتعرض وبتكبر بالدوس');
  assert(/hvKill/.test(off), 'وفيه إلغاء للدعوة قبل ما تتستعمل');
  assert(/where\('ts', '>=', Date\.now\(\) - 60\*86400000\)/.test(off),
    '💸 المستندات بتتقرا بنافذة زمنية — الصور تقيلة والمجموعة كلها هتاكل قراءات');
}

// ============================================================
// ٦) شاشة Office موجودة فعلًا
// ============================================================
{
  ['hvBrand','hvBranch','hvRole','hvDays','hvMake','hvOut','hvList','hrList'].forEach(id=>{
    assert(offH.indexOf('id="' + id + '"') > 0, 'العنصر ' + id + ' موجود في Office/index.html');
  });
  const sw = fs.readFileSync(path.join(ROOT, 'Office', 'sw.js'), 'utf8');
  const v = (sw.match(/echarpe-office-v(\d+)/) || [])[1];
  assert(!!v && Number(v) >= 18, 'CACHE_NAME بتاع Office ≥ v18 (الحالي v' + (v || '?') + ')');
}
