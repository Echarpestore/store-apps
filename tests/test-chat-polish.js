// ============================================================
// 🧪 test-chat-polish.js — شكل الشات + زرار الرجوع + الردود السريعة
// الذكية + تقييم ما بعد الاستلام
// ------------------------------------------------------------
// كل فحص سلبي: لو رجّعت الإصلاح لازم يقع.
//   ١) 🔴 زرار الرجوع بيقفل **الشات** مش التطبيق كله (باج حقيقي)
//   ٢) هيدر الشات فيه لوجو البراند ومربوط بالصورة الفعلية
//   ٣) الردود السريعة **ذكية**: بتتغيّر حسب مرحلة المحادثة، والنص
//      بيتحط في خانة الكتابة (مش بيتبعت على طول)
//   ٤) 🔴 قراءة الإعدادات عن طريق طبقة CDB — `db.collection` المباشر
//      بيكسر تطبيق sales (modular SDK)
//   ٥) تقييم بعد الاستلام: على الأوردرات المستلمة بس، ومرة واحدة
//   ٦) الصياغة الجديدة لرسالة خارج المواعيد
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

// ================= ١+٢+٥) تطبيقات العميلة =================
[['loyalty', path.join(ROOT, 'loyalty', 'index.html')],
 ['glow', path.join(ROOT, 'glow', 'index.html')]].forEach(function (t) {
  const brand = t[0], p = t[1];
  if (!fs.existsSync(p)) { assert(false, p + ' لازم يكون موجود'); return; }
  const H = fs.readFileSync(p, 'utf8');

  // ---------- ١) زرار الرجوع ----------
  const openFn = (H.match(/function openChat\(\)\{[\s\S]*?\n\}/) || [''])[0];
  assert(/history\.pushState\(\{ chat: 1 \}/.test(openFn),
    brand + ': 🔴 فتح الشات بيسجّل خطوة في التاريخ (وإلا زرار الرجوع بيقفل التطبيق كله)');
  assert(/window\.addEventListener\('popstate'/.test(H),
    brand + ': فيه مستمع لزرار الرجوع');
  const popFn = (H.match(/window\.addEventListener\('popstate'[\s\S]*?\}\);/) || [''])[0];
  assert(/closeChat\(true\)/.test(popFn),
    brand + ': الرجوع بيقفل الشات (بعلامة fromPop عشان ميعملش back تاني)');
  const closeFn = (H.match(/function closeChat\(fromPop\)\{[\s\S]*?\n\}/) || [''])[0];
  assert(closeFn.length > 0, brand + ': closeChat بتاخد fromPop');
  assert(/if\(!fromPop && wasOn\)/.test(closeFn),
    brand + ': 🔴 القفل بزرار ✕ بيستهلك الخطوة الوهمية (وإلا ضغطتين رجوع بعدين)');

  // ---------- ٢) لوجو الشات ----------
  assert(H.indexOf('id="chatLogo"') >= 0, brand + ': لوجو الشات موجود في الهيدر');
  assert(/_cl\.src = logoSrc/.test(H), brand + ': اللوجو مربوط بصورة البراند الفعلية');
  assert(/\.ch-head \.ch-logo\{/.test(H), brand + ': فيه تنسيق للوجو');

  // ---------- ٥) التقييم ----------
  const rateHtmlFn = (H.match(/function orderRatingHtml\(o\)\{[\s\S]*?\n\}/) || [''])[0];
  assert(rateHtmlFn.length > 0, brand + ': دالة التقييم موجودة');
  // 🔴 على الأوردرات المستلمة بس
  assert(/if\(st !== 'collected'\) return '';/.test(rateHtmlFn),
    brand + ': 🔴 التقييم بيظهر بس بعد الاستلام (مش على أوردر معلّق أو ملغي)');
  // 🔴 مرة واحدة بس
  assert(/if\(o\.rating\)\{/.test(rateHtmlFn),
    brand + ': 🔴 اللي قيّمت مبتتسألش تاني');
  const rateFn = (H.match(/function orderRate\(orderId, stars\)\{[\s\S]*?\n\}/) || [''])[0];
  assert(/Math\.max\(1, Math\.min\(5,/.test(rateFn), brand + ': التقييم محصور بين ١ و٥');
  assert(/_myOrders\[i\]\.rating = n/.test(rateFn), brand + ': تحديث محلي فوري (مش بيرجع يطلب التقييم)');
  assert(/\.set\(\{ rating: n/.test(rateFn), brand + ': بيتسجّل على نفس مستند الأوردر (صفر مجموعات جديدة)');

  // الصياغة الجديدة
  assert(H.indexOf('مقفولين دلوقتي') === -1, brand + ': الصياغة القديمة اتشالت');
  assert(/أول ما نفتح نرد عليكي فورًا/.test(H), brand + ': الصياغة الجديدة موجودة');
});

// ================= ٣+٤) الردود السريعة (شات الموظفين) =================
const POS = path.join(ROOT, 'pos', 'chat-staff-ui.js');
if (!fs.existsSync(POS)) { assert(false, 'pos/chat-staff-ui.js لازم يكون موجود'); }
else {
  try { execFileSync(process.execPath, ['--check', POS], { stdio: 'pipe' }); }
  catch (e) { assert(false, 'chat-staff-ui.js خطأ نحوي: ' + e.stderr.toString().split('\n')[0]); }
  const P = fs.readFileSync(POS, 'utf8');

  // النصوص اللي طلبها المالك موجودة
  assert(/أهلاً بيكي في echarpe 🤍/.test(P), 'رد البداية موجود');
  assert(/شايفة إن الاختيار ده هيكون مناسب جداً/.test(P), 'رد الوسط موجود');
  assert(/طلبك اتأكد/.test(P), 'رد الإنهاء موجود');

  // 🔴 ذكية: بتحدد المرحلة من الرسايل الفعلية
  const stageFn = (P.match(/function ccQuickStage\(\)\{[\s\S]*?\n  \}/) || [''])[0];
  assert(stageFn.length > 0, 'دالة تحديد المرحلة موجودة');
  assert(/CST\.msgs/.test(stageFn), '🔴 المرحلة بتتحدد من رسايل المحادثة الفعلية (مش قايمة ثابتة)');
  assert(/m\.from === 'staff'/.test(stageFn), 'بداية = الموظفة لسه مردتش');
  assert(/hasOrder \? 'end' : 'mid'/.test(stageFn), 'نهاية = فيه أوردر/باركود في المحادثة');
  assert(/CST\.msgs = arr;/.test(P), 'الرسايل بتتخزن عشان المرحلة تتحسب');
  assert(/ccQuickRender\(\);/.test(P), 'الردود بتتجدد مع كل رسالة جديدة');

  // 🔴 بتحط في خانة الكتابة، مبتبعتش على طول
  const useFn = (P.match(/function ccQuickUse\(i\)\{[\s\S]*?\n  \}/) || [''])[0];
  assert(/el\.value = /.test(useFn), '🔴 الرد بيتحط في خانة الكتابة — الموظفة تراجع وتعدّل');
  assert(useFn.indexOf('ccSend') === -1, '🔴 مبيبعتش على طول (خطر إرسال رد غلط)');
  assert(/replace\(\/\\\[اسم\\\]\/g, myName\(\)/.test(useFn), '[اسم] بيتبدل باسم الموظفة تلقائيًا');

  // التعقيم
  assert(/function ccEsc\(s\)\{/.test(P), 'فيه تعقيم لنصوص الشرائح');
  assert(/ccEsc\(label\)/.test(P), 'اللابل بيتعقّم قبل الطباعة');

  // 🔴 ٤) طبقة CDB مش db.collection مباشر
  const loadFn = (P.match(/function ccQuickLoad\(\)\{[\s\S]*?\n  \}/) || [''])[0];
  assert(/CDB\.getSetting\('chat_quick'\)/.test(loadFn),
    '🔴 قراءة الإعدادات عن طريق CDB (db.collection المباشر بيكسر sales — modular SDK)');
  assert(loadFn.indexOf('db.collection') === -1, '🔴 مفيش db.collection مباشر في دالة التحميل');
  assert(/getSetting: function\(docId\)\{/.test(P), 'getSetting متضافة في طبقة CDB');
}

// ================= ٦) الرد الآلي =================
const CORE = path.join(ROOT, 'pos', 'chat-core.js');
if (fs.existsSync(CORE)) {
  const C = fs.readFileSync(CORE, 'utf8');
  assert(C.indexOf('إحنا مقفولين دلوقتي') === -1, 'chat-core: الصياغة القديمة اتشالت');
  assert(/أهلاً بيكي في echarpe 🤍/.test(C), 'chat-core: الترحيب الجديد');
  assert(/أول ما نفتح نرد عليكي فورًا/.test(C), 'chat-core: الوعد بالرد');
}
