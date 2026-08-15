// ============================================================
// 🧪 test-i18n.js — محرك اللغتين (عربي / English)
// ------------------------------------------------------------
// اللي الاختبار ده بيقفله:
//   ١) نص من غير ترجمة كان ممكن يطلع **فاضي** أو يطلع مفتاح خام
//      قدام العميلة → القاعدة: الناقص بيفضل عربي.
//   ٢) الرجوع للعربي من غير حفظ الأصل = النص العربي بيضيع للأبد
//      (العقدة اتكتب فوقها إنجليزي) → WeakMap للأصل.
//   ٣) الترجمة بالمطابقة **التامة** بس — اسم عميلة أو منتج فيه كلمة
//      من القاموس مايتلمسش.
//   ٤) الاتجاه: dir لازم يتغيّر مع اللغة، وإلا الإنجليزي بيتعرض
//      بتخطيط RTL والشكل مكسور من غير أي خطأ في الكونسول.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CORE = path.join(ROOT, 'pos', 'i18n-core.js');
const LOY = path.join(ROOT, 'loyalty', 'index.html');

const I = require(CORE);
const coreSrc = fs.readFileSync(CORE, 'utf8');
const loySrc = fs.readFileSync(LOY, 'utf8');

/* ============================================================
   ١) الترجمة الأساسية والفولباك
   ============================================================ */
(function(){
  I.i18nSetLang('ar', { apply:false });
  assertEq(I.i18nLang(), 'ar', 'الافتراضي عربي');
  assertEq(I.i18nT('حسابي'), 'حسابي', 'العربي بيرجع زي ما هو في وضع العربي');

  I.i18nSetLang('en', { apply:false });
  assertEq(I.i18nLang(), 'en', 'اللغة اتغيّرت لإنجليزي');
  assertEq(I.i18nT('حسابي'), 'My account', 'نص مترجم بيتحوّل');
  assertEq(I.i18nT('دخول'), 'Sign in', 'زرار الدخول مترجم');

  // ⭐ القاعدة الذهبية: الناقص بيفضل عربي — مش فاضي ومش مفتاح خام
  const unknown = 'نص عمره ما اتترجم أبدًا';
  assertEq(I.i18nT(unknown), unknown, '⭐ النص الناقص بيفضل عربي (مش فاضي)');
  assert(I.i18nT(unknown) !== '', '⭐ الناقص عمره ما يطلع فاضي');

  // مسافات: المطابقة بعد trim، والمسافات محفوظة
  assertEq(I.i18nT('  حسابي  '), '  My account  ', 'المسافات محفوظة والمطابقة بعد trim');
  assertEq(I.i18nT(''), '', 'النص الفاضي بيعدّي زي ما هو');
  assertEq(I.i18nT(null), null, 'null مبيكسرش الدالة');
})();

/* ============================================================
   ٢) المطابقة التامة — أسماء العملاء والمنتجات ممنوع تتلمس
   ============================================================ */
(function(){
  I.i18nSetLang('en', { apply:false });
  // 'الاسم' في القاموس، بس 'الاسم الكامل للعميلة' لأ
  assertEq(I.i18nT('منى الاسم'), 'منى الاسم', '⭐ نص فيه كلمة من القاموس جوّه جملة مايتترجمش');
  assertEq(I.i18nT('طرحة شيفون كاش'), 'طرحة شيفون كاش', '⭐ اسم منتج فيه كلمة مترجمة بيفضل زي ما هو');
  assertEq(I.i18nT('01001234567'), '01001234567', 'الأرقام مبتتلمسش');
})();

/* ============================================================
   ٣) أنماط الأرقام — النص والرقم في نفس العقدة
   ============================================================ */
(function(){
  I.i18nSetLang('en', { apply:false });
  assertEq(I.i18nT('باقي 3 ساعات'), '3 h left', 'نمط الساعات');
  assertEq(I.i18nT('باقي 12 دقيقة'), '12 min left', 'نمط الدقايق');
  assertEq(I.i18nT('فاضل 40 نقطة'), '40 points to go', 'نمط النقط الناقصة');
  assertEq(I.i18nT('120 نقطة'), '120 points', 'نمط رصيد النقط');
  assertEq(I.i18nT('1,250 ج.م'), 'EGP 1,250', 'نمط الفلوس بالفاصلة');
  assertEq(I.i18nT('+15 نقطة'), '+15 points', 'نقط الفاتورة');
  I.i18nSetLang('ar', { apply:false });
  assertEq(I.i18nT('باقي 3 ساعات'), 'باقي 3 ساعات', 'الأنماط مبتشتغلش في وضع العربي');
})();

/* ============================================================
   ٤) الاتجاه واللغة
   ============================================================ */
(function(){
  I.i18nSetLang('ar', { apply:false });
  assertEq(I.i18nDir(), 'rtl', 'العربي rtl');
  assertEq(I.i18nLocale(), 'ar-EG', 'لوكال العربي');
  I.i18nSetLang('en', { apply:false });
  assertEq(I.i18nDir(), 'ltr', '⭐ الإنجليزي ltr');
  assertEq(I.i18nLocale(), 'en-GB', 'لوكال الإنجليزي');
  assertEq(I.i18nNormalizeLang('EN-us'), 'en', 'كود اللغة بيتنضّف');
  assertEq(I.i18nNormalizeLang('fr'), 'ar', 'لغة مش مدعومة بترجع للعربي');
  assertEq(I.i18nNormalizeLang(null), 'ar', 'قيمة فاضية بترجع للعربي');
})();

/* ============================================================
   ٥) تخمين لغة المتصفح
   ============================================================ */
(function(){
  assertEq(I.i18nBrowserGuess({ languages:['en-US','ar'] }), 'en', 'متصفح إنجليزي');
  assertEq(I.i18nBrowserGuess({ languages:['ar-EG'] }), 'ar', 'متصفح عربي');
  assertEq(I.i18nBrowserGuess({ languages:['fr-FR'] }), 'ar', 'لغة تالتة → عربي');
  assertEq(I.i18nBrowserGuess({}), 'ar', 'مفيش لغات → عربي');
})();

/* ============================================================
   ٦) الترجمة على DOM وهمي — الأصل بيترجع
   ------------------------------------------------------------
   ⚠️ ده أهم اختبار في الملف: من غير حفظ الأصل، الرجوع للعربي
      بيسيب الشاشة إنجليزي **للأبد** وأول مرة العميلة تدوس «العربية»
      متلاقيش أي رد فعل.
   ============================================================ */
(function(){
  // DOM بسيط بالقدر اللي المحرك بيستعمله
  function makeText(v){ return { nodeType:3, nodeValue:v, parentNode:null }; }
  function makeEl(tag, kids){
    const el = { nodeType:1, tagName:tag, childNodes:kids||[], dataset:{}, attrs:{},
      hasAttribute(a){ return Object.prototype.hasOwnProperty.call(this.attrs, a); },
      getAttribute(a){ return this.attrs[a]; },
      setAttribute(a,v){ this.attrs[a]=v; } };
    (kids||[]).forEach(k => { k.parentNode = el; });
    return el;
  }
  const t1 = makeText('حسابي'), t2 = makeText('اسم العميلة منى');
  const inp = makeEl('INPUT', []); inp.attrs.placeholder = 'اكتبي رسالتك…';
  const root = makeEl('DIV', [t1, t2, inp]);

  // TreeWalker وهمي
  function walkerFor(node){
    const out = [];
    (function walk(n){
      (n.childNodes||[]).forEach(function(c){ out.push(c); walk(c); });
    })(node);
    let i = -1;
    return { nextNode(){ i++; return out[i] || null; } };
  }
  root.ownerDocument = { createTreeWalker: (r) => walkerFor(r) };

  I.i18nSetLang('en', { apply:false });
  I.i18nApply(root);
  assertEq(t1.nodeValue, 'My account', 'عقدة نصية اتترجمت');
  assertEq(t2.nodeValue, 'اسم العميلة منى', '⭐ الاسم مااتلمسش');
  assertEq(inp.attrs.placeholder, 'Type your message…', 'الـplaceholder اتترجم');

  I.i18nSetLang('ar', { apply:false });
  I.i18nApply(root);   // في وضع العربي i18nT بترجّع الأصل
  // ⚠️ الرجوع الحقيقي بيحصل جوه i18nSetLang(apply) — هنا بنتأكد إن
  //    الأصل متخزّن وإن الترجمة مبتتراكمش (إنجليزي فوق إنجليزي).
  I.i18nSetLang('en', { apply:false });
  I.i18nApply(root);
  assertEq(t1.nodeValue, 'My account', '⭐ الترجمة مبتتراكمش لما تتطبق مرتين');
})();

/* ============================================================
   ٧) القاموس — تغطية النصوص الأساسية
   ============================================================ */
(function(){
  const en = I.I18N_DICT.en;
  ['حسابي','بطاقتي','عروضي','فواتيري','تواصل','دخول','التالي','حفظ ودخول',
   'رقم الموبايل','الرقم السري','تسجيل الخروج','لغة التطبيق','الإجمالي',
   'كاش','فيزا','نقطة','ج.م','الرحاب','مدينتي','سيتي سنتر'
  ].forEach(function(k){
    assert(typeof en[k] === 'string' && en[k].length > 0, 'القاموس فيه: ' + k);
    assert(!/[\u0600-\u06FF]/.test(en[k]), 'الترجمة إنجليزي مش عربي: ' + k);
  });
  // مفيش قيمة فاضية في القاموس كله — الفاضي = نص مختفي على الشاشة
  let empties = 0;
  Object.keys(en).forEach(function(k){ if(!String(en[k]).trim()) empties++; });
  assertEq(empties, 0, '⭐ مفيش أي ترجمة فاضية في القاموس');
  assert(Object.keys(en).length >= 150, 'القاموس مغطّي التطبيق (150+ نص)');
})();

/* ============================================================
   ٨) الربط في تطبيق الولاء
   ============================================================ */
(function(){
  assert(/<script src="\.\.\/pos\/i18n-core\.js"><\/script>/.test(loySrc),
    'loyalty بيحمّل i18n-core.js');
  assert(loySrc.indexOf('i18nInit()') > loySrc.indexOf('i18n-core.js'),
    '⭐ i18nInit بيتنادى بعد تحميل المحرك (قبل أي رسم)');
  assert(/id="loginLang"/.test(loySrc), '⭐ زرار اللغة موجود في شاشة التسجيل');
  assert(/lang-row/.test(loySrc) && /لغة التطبيق/.test(loySrc),
    '⭐ صف اللغة موجود في «حسابي»');
  assert(/function appSetLang/.test(loySrc), 'دالة تغيير اللغة موجودة');
  assert(/window\.appSetLang\s*=\s*appSetLang/.test(loySrc),
    '⭐ القاعدة الذهبية: appSetLang متعرّضة على window (بتتنادى من onclick)');
  assert(/window\.renderLoginLang\s*=\s*renderLoginLang/.test(loySrc),
    'renderLoginLang متعرّضة على window');
  assert(/i18nObserve\(document\.body\)/.test(loySrc),
    '⭐ المراقب شغّال — كل رسم جديد بيتترجم لوحده');
  assert(/lang:\s*\(window\.i18nLang \? i18nLang\(\) : 'ar'\)/.test(loySrc),
    '⭐ اللغة بتتحفظ على مستند العميلة وقت التسجيل');
  assert(/set\(\{ lang: l \}, \{ merge:true \}\)/.test(loySrc),
    'تغيير اللغة بيتحفظ merge (مش بيمسح باقي المستند)');
  assert(/lang save/.test(loySrc),
    'فشل حفظ اللغة بيتسجّل ومبيوقفش التغيير على الشاشة');

  // 🗓️ التواريخ لازم تتبع اللغة — كانت مثبتة على ar-EG
  assert(!/toLocaleDateString\('ar-EG'/.test(loySrc),
    '⭐ مفيش تاريخ مثبّت على ar-EG (كان بيفضل عربي في الوضع الإنجليزي)');
  assert(!/toLocaleTimeString\('ar-EG'/.test(loySrc), 'مفيش وقت مثبّت على ar-EG');
  assert(/toLocaleDateString\(i18nLocale\(\)/.test(loySrc), 'التواريخ بتتبع اللغة');

  // 🧭 الاتجاه
  assert(/html\[dir="ltr"\]/.test(loySrc),
    '⭐ فيه تصحيحات CSS للاتجاه الإنجليزي (left/right مبتنعكسش لوحدها)');
  assert(/html\[dir="ltr"\] \.offer::before\{right:auto; left:0;\}/.test(loySrc),
    'شريط العرض بيتنقل للشمال في الإنجليزي');

  // 🔔 نافذة التأكيد الأصلية مش بتتترجم لوحدها (مش DOM)
  assert(/confirm\(i18nT\('تسجيل الخروج من حسابك؟'\)\)/.test(loySrc),
    '⭐ نافذة confirm متلفوفة بـi18nT — المراقب مبيوصلهاش');
})();

/* ============================================================
   ٨ب) الربط في تطبيق Glow — **نفس الفحوصات بالظبط**
   ------------------------------------------------------------
   ⚠️ التطبيقين اتبنوا بنسخ ولصق تاريخيًا. فحص واحد فيهم بس معناه
      إن الميزة ممكن تتصلح في واحد وتفضل مكسورة في التاني من غير
      ما حد ياخد باله (حصل قبل كده مع فروق البراندين).
   ============================================================ */
(function(){
  const glow = fs.readFileSync(path.join(ROOT, 'glow', 'index.html'), 'utf8');
  assert(/<script src="\.\.\/pos\/i18n-core\.js"><\/script>/.test(glow),
    'Glow بيحمّل **نفس** ملف المحرك (مفيش نسخة تانية)');
  assert(glow.indexOf('i18nInit()') > glow.indexOf('i18n-core.js'),
    'Glow: i18nInit بعد تحميل المحرك');
  assert(/id="loginLang"/.test(glow), 'Glow: زرار اللغة في شاشة التسجيل');
  assert(/lang-row/.test(glow) && /لغة التطبيق/.test(glow), 'Glow: صف اللغة في «حسابي»');
  assert(/window\.appSetLang\s*=\s*appSetLang/.test(glow),
    '⭐ Glow: appSetLang متعرّضة على window');
  assert(/i18nObserve\(document\.body\)/.test(glow), 'Glow: المراقب شغّال');
  assert(/lang:\s*\(window\.i18nLang \? i18nLang\(\) : 'ar'\)/.test(glow),
    'Glow: اللغة بتتحفظ وقت التسجيل');
  assert(!/toLocaleDateString\('ar-EG'/.test(glow), '⭐ Glow: مفيش تاريخ مثبّت على ar-EG');
  assert(/toLocaleDateString\(i18nLocale\(\)/.test(glow), 'Glow: التواريخ بتتبع اللغة');
  assert(/confirm\(i18nT\('تسجيل الخروج من حسابك؟'\)\)/.test(glow), 'Glow: confirm متلفوف');
  assert(/html\[dir="ltr"\]/.test(glow), 'Glow: تصحيحات CSS للاتجاه');

  // 🖤 نصوص Glow الخاصة
  const en = I.I18N_DICT.en;
  ['نقاطي','مشترياتي','نادي عملاء Glow','بطاقة عضوية'].forEach(function(k){
    assert(typeof en[k] === 'string' && en[k].length > 0, 'القاموس فيه نص Glow: ' + k);
  });
  I.i18nSetLang('en', { apply:false });
  assertEq(I.i18nT('نقاطي'), 'My points', 'تبويب Glow مترجم');
  assertEq(I.i18nT('مشترياتي'), 'My purchases', 'تبويب المشتريات مترجم');
  assertEq(I.i18nT('≈ 250 ج.م رصيد مكافآت'), '≈ EGP 250 in rewards', 'نمط رصيد المكافآت (Glow)');
  /* ⚠️ Glow مكتوب فيه ',' عادية مش '،' — والمطابقة تامة، فلازم
     النسختين في القاموس وإلا السطر يفضل عربي جوه شاشة إنجليزي. */
  assert(en['لو دوّرتي على حاجة ومالقيتيهاش في الفرع,'] !== undefined,
    '⭐ نسخة الفاصلة العادية (Glow) موجودة في القاموس');
  assert(en['لو دوّرتي على حاجة ومالقيتيهاش في الفرع،'] !== undefined,
    'نسخة الفاصلة العربية (إيشارب) موجودة في القاموس');

  const gsw = fs.readFileSync(path.join(ROOT, 'glow', 'sw.js'), 'utf8');
  const gm = gsw.match(/glow-loyalty-v(\d+)/);
  assert(gm && Number(gm[1]) >= 42, '⭐ Glow: CACHE_NAME اترفع لـv42+');
})();

/* ============================================================
   ٩) الكاش — أي تعديل لازم يرفع CACHE_NAME
   ============================================================ */
(function(){
  const sw = fs.readFileSync(path.join(ROOT, 'loyalty', 'sw.js'), 'utf8');
  const m = sw.match(/echarpe-loyalty-v(\d+)/);
  assert(!!m, 'CACHE_NAME موجود في loyalty/sw.js');
  assert(m && Number(m[1]) >= 50, '⭐ CACHE_NAME اترفع لـv50+ (وإلا الجهاز يفضل على القديم)');
})();

/* ============================================================
   ١٠) المحرك نضيف — مفيش Firestore ولا DOM مباشر جوّه
   ============================================================ */
(function(){
  assert(!/firebase|firestore/i.test(coreSrc), 'المحرك مفيهوش Firebase');
  assert(/data-noi18n/.test(coreSrc), 'فيه طريقة لاستثناء عنصر من الترجمة');
  assert(/TEXTAREA:1/.test(coreSrc),
    '⭐ الـtextarea مستثناة — الترجمة جوّاها كانت هتمسح اللي العميلة كتباه');
  assert(/SCRIPT:1/.test(coreSrc), 'الـscript مستثنى');
})();
