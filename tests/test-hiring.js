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
  assert(!!v && Number(v) >= 23, 'CACHE_NAME بتاع Office ≥ v23 (الحالي v' + (v || '?') + ')');
}

// ============================================================
// ٧) 🗂️ ملف الموظفة — الرجوع للبيانات في أي وقت
// المشكلة: شاشة الطلبات بتقرا آخر ٦٠ يوم بس (الصور تقيلة)، فبعد
// شهرين المستندات موجودة في الداتابيز ومش ظاهرة في التطبيق.
// ============================================================
{
  const open = off.slice(off.indexOf('async function efOpen'), off.indexOf('function efTrialLine'));
  assert(open.length > 0, 'دالة فتح الملف موجودة');
  assert(/where\('regId', '==', regId\)\.get\(\)/.test(open),
    '🔴 المستندات بتتجاب **بالطلب** على رقم الطلب — مفيش نافذة زمنية هنا');
  assert(!/Date\.now\(\) - \d+\*86400000/.test(open),
    '🔴 ومفيش أي حد زمني في الملف — ده كان أصل الشكوى');
  assert(/onSnapshot/.test(open) === false,
    '💸 قراءة لمرة واحدة مش اشتراك دائم — الصور تقيلة');
  assert(/مفيش مستندات مرفوعة/.test(open),
    'وموظفة اتسجّلت من التابلت بيقول عليها كده بدل تحميل فاضي');

  const m = extractFn(off, 'efMatch');
  assert(m.length > 0, 'البحث بالاسم أو الرقم موجود');
  const sb = { window:{}, String, Number };
  vm.createContext(sb);
  vm.runInContext(m, sb);
  const hit = (q, o)=> vm.runInContext(`efMatch(${JSON.stringify(q)}, ${JSON.stringify(o)})`, sb);
  const rec = { name:'سارة أحمد محمود', phone:'01012345678' };
  assertEq(hit('سارة', rec), true, 'بيلاقي بجزء من الاسم');
  assertEq(hit('محمود', rec), true, 'وبأي جزء مش الأول بس');
  assertEq(hit('1234', rec), true, 'وبجزء من الرقم');
  assertEq(hit('0101 234 5678', rec), true, '📱 والمسافات في الرقم مبتفرقش');
  assertEq(hit('س', rec), false, '🔴 وحرف واحد مبيدوّرش — وإلا بيرجّع الكل');
  assertEq(hit('12', rec), false, 'ورقمين كمان لأ');
  assertEq(hit('منى', rec), false, 'واسم تاني مبيلاقيش');

  const tl = extractFn(off, 'efTrialLine');
  const sb2 = { window:{}, String, Number, Math, Date, esc:(x)=>String(x), dstr:()=>'' };
  vm.createContext(sb2);
  vm.runInContext(tl, sb2);
  const trial = (e)=> vm.runInContext(`efTrialLine(${JSON.stringify(e)})`, sb2);
  const day = 86400000;
  assert(trial({ trialDays:30, trialFrom: Date.now() - 10*day }).indexOf('20 يوم') >= 0,
    '⏳ بقالها 10 أيام من 30 → فاضل 20');
  assert(trial({ trialDays:30, trialFrom: Date.now() - 40*day }).indexOf('خلّصت') >= 0,
    '✅ وبعد ما تعدّي المدة بتبان دائمة');
  assertEq(trial({}), '', 'وموظف من غير فترة اختبار مبيظهرش السطر');
  assertEq(trial({ trialDays:30 }), '', 'ولا من غير تاريخ بداية');
}

// ============================================================
// 💸 Office — سحب المبيعات بقى تراكمي مش كامل كل مرة
// الواقع: 963 ألف قراءة/يوم. `loadSales` كانت بتسحب **٣٠ يوم فواتير
// كاملة كل ٢٠ دقيقة** طول ما التطبيق مفتوح = ٧٢ سحبة كاملة في اليوم.
// ============================================================
{
  const ls = extractFn(off, 'loadSales');
  assert(ls.length > 0, 'loadSales موجودة');
  assert(/_salesTo \? Math\.max\(cutMs, _salesTo - 60000\) : cutMs/.test(ls),
    '🔴 السحبة الأولى ٣٠ يوم، واللي بعدها من آخر فاتورة اتحمّلت بس');
  assert(/_salesTo - 60000/.test(ls),
    '🛡️ وبنرجع دقيقة ورا — فواتير الأوفلاين بتوصل متأخرة وطابعها ممكن يسبق');
  assert(/o\._id = d\.id/.test(ls) && /seen\[x\._id\]/.test(ls),
    '🔑 والدمج بالـid — فمفيش فاتورة بتتكرر ولا نسخة قديمة بتفضل');
  assert(/_saleMs\(x\) >= cutMs/.test(ls),
    '🧹 والأقدم من ٣٠ يوم بيتشال — الذاكرة مبتكبرش مع الوقت');
  assert(/setInterval\(function\(\)\{ if\(!document\.hidden\) loadSales\(\); \}, 20\*60\*1000\)/.test(off),
    'والتحديث لسه كل ٢٠ دقيقة — بس بقى رخيص');

  // الدمج سلوكيًا
  const vm7 = require('vm');
  const sb = { D:{ sales:[] }, _salesTo:0, Math, Number };
  vm7.createContext(sb);
  vm7.runInContext(extractFn(off, '_saleMs'), sb);
  const ms = (o)=> vm7.runInContext(`_saleMs(${JSON.stringify(o)})`, sb);
  assertEq(ms({ createdAtMs: 123 }), 123, 'بيقرا الطابع المحلي لفواتير الأوفلاين');
  assertEq(ms({}), 0, 'وفاتورة من غير طابع = صفر (مش بتكسر الحسبة)');
  assertEq(ms(null), 0, 'ولا حتى فاتورة فاضية');
}

// ============================================================
// 🔔 إشعارات Office — التشخيص كان مقفول
// الشكوى: "التوكن متسجل صح · الدوال منشورة · الدالة بترجع 200" ومفيش
// إشعار. السبب: `sendToOffice` كانت بتتجاهل **أي** فشل غير التوكن
// الباطل — فالدالة بتنجح والإرسال فاشل ومحدش شايف.
// ============================================================
{
  const fnFile = path.join(ROOT, 'FUNCTIONS-NOT-GITHUB', 'index.js');
  const fnSrc = fs.existsSync(fnFile) ? fs.readFileSync(fnFile, 'utf8') : '';
  if(fnSrc){
    const send = extractFn(fnSrc, 'sendToOffice');
    assert(send.length > 0, 'sendToOffice موجودة');
    assert(/errs\.push\(\{ code:/.test(send),
      '🔴 كل فشل بيتسجّل بكوده — مش اللي إحنا فاهمينه بس');
    assert(/ok: res\.successCount/.test(send) && /fail: res\.failureCount/.test(send),
      'ونجح كام وفشل كام');
    assert(/lastSend: diag/.test(send),
      '🔑 والنتيجة بتتكتب في المستند — يعني تتشاف من الموبايل من غير Cloud Logging');
    assert(/console\.log\("sendToOffice"/.test(send), 'وفي السجل كمان');
    // التوكن مبيتسجّلش كامل في التشخيص
    assert(/\.slice\(-12\)/.test(send),
      '🔒 وآخر ١٢ حرف من التوكن بس — مش التوكن كامل في مستند بيتقرا');

    assert(/exports\.onOfficePushTest = onDocumentUpdated/.test(fnSrc),
      '🧪 وفيه دالة إشعار تجربة');
    const test = fnSrc.slice(fnSrc.indexOf('exports.onOfficePushTest'));
    assert(/if \(!after\.test \|\| after\.test === before\.test\) return;/.test(test),
      '🔴 وبتقف لو `test` مااتغيّرش — من غير ده حلقة لا نهائية:'
      + ' الدالة بتكتب lastSend في نفس المستند فبتشغّل نفسها');
  }

  // شاشة التجربة في Office
  const pt = extractFn(off, 'ofPushTest');
  assert(pt.length > 0, 'زرار التجربة موصّل');
  assert(/set\(\{ test: Date\.now\(\) \}/.test(pt), 'بيغيّر الحقل اللي بيشغّل الدالة');
  assert(/ls\.at !== before/.test(pt),
    '🔴 وبيستنى نتيجة **جديدة** — مش بيقرا نتيجة قديمة ويقول نجح');
  assert(/for\(let i = 0; i < 12; i\+\+\)/.test(pt), 'وبمهلة محدودة');
  assert(/الدالة ماردّتش/.test(pt),
    'ولو الدالة مش منشورة بيقول كده صراحة بدل انتظار مفتوح');
  assert(/مفيش أي جهاز متسجّل/.test(pt),
    'ولو مفيش أجهزة متسجّلة بيقول قبل ما يبعت أصلًا');

  const hint = extractFn(off, 'ofPushHint');
  assert(/third-party-auth/.test(hint) && /VAPID/.test(hint),
    '🔑 وبيترجم كود VAPID لسبب مفهوم — ده أرجح سبب في الحالة دي');
  assert(/not-registered/.test(hint), 'وكود التوكن الباطل');
  assert(offH.indexOf('id="notifTestBtn"') > 0, 'والزرار موجود في الشاشة');
}

// ============================================================
// 💼 التقديم على وظيفة — الحلقة كاملة
// إعلان ← تقديم ← فرز ← مقابلة ← دعوة تسجيل ← تسجيل بالمستندات
// ============================================================
{
  const ap = fs.readFileSync(path.join(ROOT, 'apply', 'index.html'), 'utf8');

  // مرحلة فرز مش توظيف — مفيش بيانات حساسة
  // ⚠️ الفحص على الكود اللي بيشتغل — التعليقات ممكن تذكر الكلمة نفيًا
  const apCode = ap.replace(/\/\/[^\n]*/g, '');
  ['nid','staff_docs','capture="environment"','sigPad','toDataURL'].forEach(function(k){
    assert(apCode.indexOf(k) < 0,
      '🔴 استمارة التقديم مفيهاش `' + k + '` — دي مرحلة فرز، المستندات بعد المقابلة');
  });

  // 🔑 رقم الموبايل مفتاح المستند
  assert(/collection\('job_applications'\)\.doc\(phone\)/.test(ap),
    '🔑 الرقم مفتاح المستند — الرقم الواحد = طلب واحد مش عشرة');
  assert(/days < 30/.test(ap),
    '🔁 وإعادة التقديم بعد ٣٠ يوم — بيمنع التكرار من غير ما يمنع اللي ظروفه اتغيّرت');
  assert(/status: 'new'/.test(ap), 'وكل طلب بيبدأ جديد');

  // الشيفت الجديد موجود في الاختيارات
  assert(/setup:\s*'🧹 تظبيط/.test(ap), '🧹 شيفت التظبيط ٧–١٠ في الاستمارة');
  assert(/تظبيط الفرع \(٧–١٠ ص · قبل الفتح\)/.test(ap), 'وكوظيفة كمان');

  // الأسئلة اللي بتفرق في الفرز
  ['commute','startWhen','studying','classes','transport','source','notes','portfolio']
    .forEach(function(f){
      assert(ap.indexOf("'" + f + "'") > 0 || ap.indexOf(f + ':') > 0,
        '📋 سؤال `' + f + '` موجود');
    });

  // شاشة Office
  assert(/ofRenderApplicants/.test(off), '💼 شاشة المتقدّمين في Office');
  assert(/apStatus[\s\S]{0,400}apBranch[\s\S]{0,400}apShift/.test(offH),
    'وفلترة بالحالة والفرع والشيفت');
  assert(/where\('ts','>=', Date\.now\(\) - 90\*86400000\)/.test(off),
    '💸 والقراءة بنافذة ٩٠ يوم — الطلبات بتتراكم');
  assert(/wa\.me\/2/.test(off), '💬 وزرار واتساب مباشر');

  // 🔗 الحلقة بتقفل: متقدّم → دعوة
  const inv = off.slice(off.indexOf('window.apInvite'), off.indexOf('function ofWireApplicants'));
  assert(/collection\('staff_invites'\)\.doc\(code\)\.set/.test(inv),
    '🔗 زرار الدعوة بيولّد دعوة حقيقية بنفس نظام التوظيف');
  assert(/applicantPhone/.test(inv) && /applicantName/.test(inv),
    'والدعوة بتفضل مربوطة بالمتقدّم');
  assert(/status:'hired'/.test(inv), 'وحالته بتتحدّث تلقائي');
  assert(/\/glow\/i\.test\(br\)/.test(inv), 'والبراند بيتحدد من الفرع');

  // 🧹 شيفت التظبيط خارج المكافأة ورصيد الوقت
  const sa = fs.readFileSync(path.join(ROOT, 'sales', 'sales-app.js'), 'utf8');
  assert(/setup:\s*\{ label: '🧹 تظبيط الفرع', start: '07:00', end: '10:00', noBonus: true \}/.test(sa),
    '🧹 الشيفت متعرّف بمواعيده وعلامة noBonus');
  const iss = extractFn(sa, 'isSetupShift');
  assert(iss.length > 0 && /sh\.noBonus/.test(iss),
    'ودالة واحدة بتحدد الاستثناء — مش شرط مكرر في كل مكان');
  assert(/if\(latePenalized && !isSetupShift\(emp\)\)/.test(sa),
    '🔴 التأخير مبيتحوّلش رصيد وقت — مفيش عميل بيتأثر بتأخيره');
  assert(/if\(isSetupShift\(emp\)\) return false;\s*\/\/ 🧹 التظبيط خارج رصيد الوقت/.test(sa),
    '🔴 وخارج خصم رصيد الوقت في المرتب');
  // شاشة اختيار الشيفت بقت من الإعدادات — عشان أي شيفت جديد يبان لوحده
  assert(/Object\.keys\(S\)\.map/.test(sa),
    '🔴 قايمة الشيفتات بقت من الإعدادات — كانت مكتوبة بالإيد فالشيفت الجديد مكانش هيبان');
}
