// ============================================================
// 💗 test-glow-parity — Glow لازم يكون فيه نفس ميزات الولاء
// ------------------------------------------------------------
// 🔴 اللي كان ناقص (المالك اكتشفه من التطبيق نفسه):
//    Glow **مفهوش** «🔖 طلباتي» ولا «🎁 عندي كود كارت هدية» ولا
//    «📒 كشف حساب الرصيد» — كلهم اتبنوا في الولاء بس.
//    والرصيد وكروت الهدايا **مشتركين بين البراندين** (حقل `credit`
//    واحد ومجموعة `gift_cards` واحدة)، يعني عميلة Glow ليها رصيد
//    فعلًا ومش شايفاه ولا قادرة تستلم كارت.
//
// ⚠️ الملفان **مش نسخة واحدة** — Glow ليه تطبيق Firebase مسمّى
//    مختلف وحقل نقط مختلف. فالاختبار بيقارن **السلوك** مش النص.
//
// 🔴 الدرس المتكرر: ميزة بتتبني في تطبيق وتتنسى في التاني. أي ميزة
//    جديدة في جانب العميلة لازم يبقى ليها سطر هنا.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const R = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const glow = R('glow', 'index.html');
const loyalty = R('loyalty', 'index.html');
const rules = R('security', 'firestore-phase2.rules');

// ============================================================
// ١) 🔖 طلباتي
// ============================================================
{
  const L = '🔖 طلباتي: ';
  assert(/onclick="openMyRequests\(\)"/.test(glow), L + '⭐⭐ الزرار موجود في شاشة الحساب');
  assert(/function openMyRequests\(\)/.test(glow), L + 'والدالة معرّفة');
  assert(/window\.openMyRequests = openMyRequests/.test(glow), L + 'ومتعرّضة على window (§18)');
  assert(/function watchMyRequests\(phone\)/.test(glow), L + 'والمستمع معرّف');
  // 💰 المفتوحة بس + سقف — المقفولة بتتراكم والقراءات فلوس
  const w = glow.slice(glow.indexOf('function watchMyRequests'), glow.indexOf('window.watchMyRequests'));
  assert(/where\('status','==','open'\)/.test(w), L + '⭐ المفتوحة بس');
  assert(/where\('phone','==', String\(phone\)\)/.test(w), L + '⭐⭐ ومقصورة على رقمها هي');
  assert(/limit\(30\)/.test(w), L + '⭐ وبسقف ٣٠ (القراءات فلوس)');
  // العدد على الزرار
  assert(/_myRequests\.length \? ' \(' \+ _myRequests\.length/.test(glow),
    L + 'والعدد بيبان على الزرار');
}

// ============================================================
// ٢) 🎁 كارت الهدية
// ============================================================
{
  const L = '🎁 الكارت: ';
  assert(/onclick="openClaimGift\(\)"/.test(glow), L + '⭐⭐ الزرار موجود');
  assert(/function openClaimGift\(\)/.test(glow), L + 'والشاشة معرّفة');
  assert(/async function claimGift\(\)/.test(glow), L + 'ودالة الاستلام');
  assert(/window\.claimGift = claimGift/.test(glow), L + 'ومتعرّضة (§18)');

  const c = glow.slice(glow.indexOf('async function claimGift'), glow.indexOf('window.claimGift'));
  /* ⚠️⚠️ أهم سطر في الملف: التطبيق المسمّى لازم يكون **'glow'**.
     نسخة الولاء بتستخدم 'loyalty' — لو اتنسخت زي ما هي، الدالة
     بتشتغل بجلسة تانية أو تفشل (درس عزل الجلسات). */
  assert(/firebase\.app\('glow'\)/.test(c),
    L + "⭐⭐ بتنادي على التطبيق المسمّى **'glow'**");
  assert(!/firebase\.app\('loyalty'\)/.test(c),
    L + "⭐⭐ و**مش** 'loyalty' (فخ النسخ المباشر)");
  assert(/httpsCallable\('giftCardClaim'\)/.test(c), L + 'وبتنادي نفس الدالة السحابية');

  // 🔒 التطبيق مبيكتبش رصيد — الاستلام من Cloud Function بس
  assert(!/\.update\(\{[^}]*credit/.test(glow) && !/set\(\{[^}]*credit:/.test(glow),
    L + '⭐⭐ والتطبيق **مبيكتبش** رصيد خالص (لو كتب، يبقى باب خلفي)');
  // حراس عملية
  assert(/navigator\.onLine/.test(c), L + '⭐ وبيتأكد من النت قبل ما يحاول');
  assert(/_gcBusy/.test(c), L + '⭐ وحارس ضد الضغط المتكرر (استلام مرتين)');
}

// ============================================================
// ٣) 📒 الرصيد وكشف الحساب
// ============================================================
{
  const L = '📒 الرصيد: ';
  assert(/💰 رصيدي/.test(glow), L + '⭐⭐ الرصيد بيبان في شاشة الحساب');
  assert(/onclick="openCreditStatement\(\)"/.test(glow), L + 'وزرار الكشف');
  assert(/function watchCredit\(phone\)/.test(glow), L + 'والمستمع');
  const w = glow.slice(glow.indexOf('function watchCredit'), glow.indexOf('window.watchCredit'));
  assert(/where\('phone','==', String\(phone\)\)/.test(w), L + '⭐⭐ مقصور على رقمها هي');
  assert(/limit\(50\)/.test(w), L + '⭐ وبسقف ٥٠');
  assert(/orderBy\('at','desc'\)/.test(w), L + 'وأحدث الأول');
  // الرصيد منفصل عن النقط
  assert(/النقط بتتكسب بقاعدة، والرصيد فلوس اتدفعت/.test(glow),
    L + '⭐ والفرق بين النقط والرصيد موثّق');
}

// ============================================================
// ٤) 📄 عنصر الشيت — كان **ناقص خالص** في Glow
// ------------------------------------------------------------
// 🔴 الستايلات (`.inv-sheet` · `.ish-h`) كانت موجودة والعنصر لأ.
//    يعني لو الكود اتنقل من غير العنصر، `showSheet` كانت هتخرج
//    بصمت (`if(!sh || !ov) return;`) والزرار يبان ميت.
// ⚠️ الدرس: أي دالة بننديها لازم نتأكد إن **عناصرها** موجودة كمان،
//    مش بس إن الدالة معرّفة.
// ============================================================
{
  const L = '📄 الشيت: ';
  assert(/id="crOverlay"/.test(glow), L + '⭐⭐ عنصر الأوفرلاي موجود');
  assert(/id="crSheet"/.test(glow), L + '⭐⭐ وعنصر الشيت');
  assert(/function showSheet\(title, bodyHtml\)/.test(glow), L + 'والدالة');
  assert(/window\.showSheet = showSheet/.test(glow), L + 'ومتعرّضة (§18)');
  assert(/closeSheet\(\)/.test(glow), L + 'والقفل شغّال');
  // الأوفرلاي بيتقفل بالضغط برّه
  assert(/id="crOverlay" onclick="if\(event\.target===this\) closeSheet\(\)"/.test(glow),
    L + '⭐ وبيتقفل بالضغط برّه');
}

// ============================================================
// ٥) 🔗 المستمعين بيشتغلوا وبيتقفلوا
// ------------------------------------------------------------
// 🔴 خطران مختلفين:
//   · مايشتغلوش عند الدخول → الميزة مبنية والشاشة فاضية للأبد
//   · مايتقفلوش عند الخروج → عميلة تانية على نفس الجهاز تشوف
//     **حركات فلوس وطلبات مش بتاعتها**
// ============================================================
{
  const L = '🔗 الدورة: ';
  assert(/creditUnsub = watchCredit\(phone\)/.test(glow),
    L + '⭐⭐ مستمع الرصيد بيشتغل عند الدخول');
  assert(/reqUnsub = watchMyRequests\(phone\)/.test(glow),
    L + '⭐⭐ ومستمع الطلبات');

  const lo = glow.slice(glow.indexOf('function logout(silent)'), glow.indexOf('function logout(silent)') + 900);
  assert(/creditUnsub\(\); creditUnsub=null/.test(lo),
    L + '⭐⭐ والرصيد بيتقفل عند الخروج (خصوصية)');
  assert(/reqUnsub\(\); reqUnsub=null/.test(lo), L + '⭐⭐ والطلبات كمان');
  assert(/_creditRows = \[\]/.test(lo) && /_myRequests = \[\]/.test(lo),
    L + '⭐ والبيانات المخزّنة بتتمسح من الذاكرة');
}

// ============================================================
// ٦) 🔐 القواعد بتسمح فعلًا
// ------------------------------------------------------------
// من غير ده الميزة بتتسلّم "شغالة" وبترجع permission-denied على
// موبايل العميلة — نفس باج توكنات الإشعارات بالظبط.
// ============================================================
{
  const L = '🔐 القواعد: ';
  const req = rules.slice(rules.indexOf('match /customer_requests/'), rules.indexOf('match /customer_requests/') + 260);
  assert(/allow read: if signedIn\(\)/.test(req), L + '⭐⭐ العميلة تقدر تقرا طلباتها');
  const led = rules.slice(rules.indexOf('match /credit_ledger/'), rules.indexOf('match /credit_ledger/') + 240);
  assert(/allow read: if signedIn\(\)/.test(led), L + '⭐⭐ وتقرا كشف الرصيد');
  assert(/allow create, update, delete: if false/.test(led),
    L + '⭐⭐ والدفتر **مقفول للكتابة تمامًا** (الدوال بس)');
}

// ============================================================
// ٧) ⚖️ التكافؤ — نفس ميزات الولاء
// ============================================================
{
  const L = '⚖️ التكافؤ: ';
  ['openMyRequests', 'watchMyRequests', 'openClaimGift', 'claimGift',
   'watchCredit', 'openCreditStatement', 'creditRowLabel', 'showSheet'].forEach(function(fn){
    assert(new RegExp('function ' + fn + '\\b').test(loyalty), L + '(الولاء فيه ' + fn + ')');
    assert(new RegExp('function ' + fn + '\\b').test(glow),
      L + '⭐ وGlow فيه `' + fn + '` كمان');
  });
  // نفس نص الوعد — "وعد بمحاولة مش وعد بنتيجة"
  assert(/هنكلّمك على رقمك/.test(glow),
    L + '⭐⭐ ونص الطلبات وعد **بمحاولة** مش بنتيجة');
  /* ⚠️ الفحص على الكود **بعد شيل التعليقات**: التعليق اللي بيشرح
     المنع نفسه بيذكر الكلمة الممنوعة، فالفحص الخام بيقع عليها.
     ده فخ الفحص الفضفاض بالمقلوب — والاختبار وقع عليه فعلًا. */
  const glowCode = glow.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/[^\n]*/gm, ' ');
  assert(!/هنجيبهولك|هيوصل قريبًا/.test(glowCode),
    L + '⭐ ومفيش وعد بنتيجة ولا ميعاد في النص المعروض');
}

// ============================================================
// ٨) 🗄️ الكاش اتزوّد
// ============================================================
{
  const v = (R('glow', 'sw.js').match(/glow-loyalty-v(\d+)/) || [])[1];
  assert(!!v && Number(v) >= 40, '🗄️ Glow: CACHE_NAME v40+ (لقينا v' + (v || '?') + ')');
}

// ============================================================
// ٩) 🧪 اختبارات سلبية
// ============================================================
{
  const L = '🧪 سلبي: ';
  // (أ) لو الكود اتنسخ من الولاء من غير تغيير اسم التطبيق
  /* ⚠️ الكسر لازم يبقى **جوه `claimGift` بالذات**: بقى فيه أكتر من
     نداء لـ`firebase.app('glow').functions` في الملف (الأوردرات
     كمان)، والاستبدال العام كان بيضرب أول واحد ويسيب الهدية سليمة —
     فالاختبار السلبي يعدّي وهو مش بيختبر حاجة. */
  const ci = glow.indexOf('async function claimGift'), ce = glow.indexOf('window.claimGift');
  assert(ci > 0 && ce > ci, 'mustExtract: بلوك claimGift اتقص صح');
  const broken = glow.slice(ci, ce).replace(/firebase\.app\('glow'\)\.functions/,
                                            "firebase.app('loyalty').functions");
  const wrongApp = glow.slice(0, ci) + broken + glow.slice(ce);
  assert(wrongApp !== glow, L + 'نجحنا نرجّع فخ النسخ');
  const c = wrongApp.slice(wrongApp.indexOf('async function claimGift'), wrongApp.indexOf('window.claimGift'));
  assert(!/firebase\.app\('glow'\)/.test(c),
    L + "⭐⭐ والفحص بيقع لو اتنادت على 'loyalty'");

  // (ب) شيل عنصر الشيت
  const noSheet = glow.replace(/id="crSheet"/, 'id="__gone"');
  assert(!/id="crSheet"/.test(noSheet),
    L + '⭐⭐ والفحص بيقع لو العنصر اتشال (الزرار كان هيبان ميت)');

  // (ج) شيل تشغيل المستمع
  const noWatch = glow.replace(/reqUnsub = watchMyRequests\(phone\);/, '');
  assert(!/reqUnsub = watchMyRequests\(phone\)/.test(noWatch),
    L + '⭐⭐ والفحص بيقع لو المستمع مااشتغلش (الشاشة كانت هتفضل فاضية)');
}

/* ============================================================
   🎨 ألوان Glow — متغيّراته مش زي إيشارب
   ------------------------------------------------------------
   🔴 اللي حصل: نسخت CSS من إيشارب واستعملت `var(--gold)` كخلفية
      مع `color:#1a1414`. بس `--gold` في Glow **أسود** (#1A1315)
      و`--card` **مش معرّف خالص** — فالزراير طلعت سودا من غير كلام
      والعميلة شايفة أقراص سودا مش عارفة تدوس على إيه.
   ⚠️ الدرس: التطبيقين شكلهم واحد بس متغيّراتهم مختلفة — أي CSS
      منقول لازم يتأكد إن كل متغيّر فيه **موجود** وقيمته متوقعة.
   ============================================================ */
(function(){
  const fsg = require('fs'), pg = require('path');
  const G = fsg.readFileSync(pg.join(__dirname, '..', 'glow', 'index.html'), 'utf8');

  assert(!/var\(--card\)/.test(G),
    '⭐⭐ مفيش `--card` — المتغيّر ده مش معرّف في Glow (بيطلّع خلفية باظت)');
  /* ⚠️ الفحص على الكود **من غير كومنتات**: الجملة اللي بنمنعها
     مكتوبة في الكومنت اللي بيشرح المنع. (فخ الفحص الفضفاض
     بالمقلوب — كان بيفشّل إصلاح سليم.) */
  const Gcode = G.replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert(!/color:#1a1414/.test(Gcode),
    '⭐⭐ مفيش نص أسود فوق خلفية `--gold` (وهي أسود في Glow)');

  // كل متغيّر مستعمل لازم يكون معرّف في :root
  const root = G.slice(G.indexOf(':root{'), G.indexOf('}', G.indexOf(':root{')));
  const defined = new Set((root.match(/--[a-z-]+/g) || []));
  const used = new Set((G.match(/var\((--[a-z-]+)\)/g) || [])
    .map(function(x){ return x.replace(/var\(|\)/g, ''); }));
  const missing = [...used].filter(function(v){ return !defined.has(v); });
  assert(missing.length === 0,
    '⭐⭐ كل متغيّر مستعمل معرّف في :root — الناقص: ' + missing.join(', '));
})();
