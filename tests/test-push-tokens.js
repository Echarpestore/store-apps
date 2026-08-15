// ============================================================
// 🔔 test-push-tokens — إشعارات العملاء: الرول لازم يسمح بشكل التوكن
//                       الجديد + الشات نص الشاشة + شاشة الطلبات
// ------------------------------------------------------------
// الباج اللي الملف ده اتكتب عشانه (إشعارات العملاء = صفر):
//   الولاء/Glow غيّروا شكل تخزين التوكن من خريطة `fcmTokens` لمصفوفة
//   لكل براند: `fcmTokens_echarpe` / `fcmTokens_glow` + `fcmTokenAt`.
//   قاعدة `pos_test_customers` في الرول فضلت `hasOnly([... 'fcmTokens'])`
//   القديم بس → **كل** كتابة توكن بترجع permission-denied، والتطبيق
//   بيبلعها في console.warn. صفر توكن جديد اتخزّن = صفر إشعار.
//
// ⚠️ ليه ماتمسكش قبل كده:
//   ١) `test-customer-profile` بيتأكد إن **التطبيق** بيكتب الشكل الجديد
//      — ومحدش تأكد إن **الرول** بيسمح بيه. الطرفين لازم يتفحصوا مع بعض.
//   ٢) محاكي الرول في `test-rules` **بيتجاهل hasOnly** عن قصد (سطر ٧٣)،
//      فأقفال الحقول لازم تتأكد **بفحص نصي صريح** — وده اللي هنا (§6).
//
// 🔴 القاعدة المستخلصة: أي حقل التطبيق بيكتبه تحت دخول مجهول لازم يبقى
//    له سطر في الاختبار ده. الحقول اللي مش في الرول = ميزة ميتة بصمت.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const R = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const rules = R('security', 'firestore-phase2.rules');
const loyalty = R('loyalty', 'index.html');
const glow = R('glow', 'index.html');

// استخراج بلوك قاعدة العملاء — لحد أول `allow delete` جوّه البلوك
function custBlock(src){
  const at = src.indexOf('match /pos_test_customers/');
  if(at < 0) return '';
  return src.slice(at, src.indexOf('allow delete', at));
}
// الشرط المسموح للدخول المجهول (hasOnly) — بالنص
function anonHasOnly(src){
  const b = custBlock(src);
  const at = b.indexOf('hasOnly(');
  if(at < 0) return '';
  // ⚠️ استخراج بالأقواس المتوازنة — الشرط فيه مصفوفة وتعليقات عربية
  //    جواها أقواس، وregex بسيط بيكسر عليها.
  let depth = 0, i = at + 'hasOnly'.length;
  const start = i;
  for(; i < b.length; i++){
    if(b[i] === '(') depth++;
    else if(b[i] === ')'){ depth--; if(depth === 0){ i++; break; } }
  }
  return b.slice(start, i);
}

// ============================================================
// ١) 🔴 الحقول التلاتة اللي كانت مقفولة
// ============================================================
{
  const L = '🔔 الرول: ';
  const cond = anonHasOnly(rules);
  assert(cond.length > 20, L + 'بلوك hasOnly اتلقى واتفكّ صح');

  // ⚠️ التعليقات جوه الشرط ممكن تذكر أسماء الحقول — فلازم نشيلها
  //    الأول، وإلا الاختبار بينجح على رول لسه مقفول (فخ الفحص الفضفاض).
  const clean = cond.replace(/\/\/[^\n]*/g, ' ');

  assert(/'fcmTokens_echarpe'/.test(clean),
    L + "⭐⭐ `fcmTokens_echarpe` مسموح — من غيره إشعارات الولاء ميتة تمامًا");
  assert(/'fcmTokens_glow'/.test(clean),
    L + "⭐⭐ `fcmTokens_glow` مسموح — من غيره إشعارات Glow ميتة تمامًا");
  assert(/'fcmTokenAt'/.test(clean),
    L + "⭐ `fcmTokenAt` مسموح — التطبيق بيكتبه في **نفس** العملية، "
      + "فغيابه لوحده كفاية يرفض الكتابة كلها");
  assert(/'fcmTokens'/.test(clean),
    L + "و`fcmTokens` القديم فاضل — عملاء لسه ماحدّثوش التطبيق");

  // 🔒 والحقول المالية لسه برّه القايمة
  assert(!/'credit'/.test(clean), L + "🔒 و`credit` **مش** في قايمة المجهول");
  assert(!/'points'/.test(clean), L + "🔒 ولا `points`");
  assert(!/'rewards'/.test(clean), L + "🔒 ولا `rewards`");
}

// ============================================================
// ٢) 🧪 الاختبار السلبي — رجّع الرول القديم واتأكد إن الفحص بيقع
// ------------------------------------------------------------
// من غير ده، الفحص فوق ممكن يعدّي على أي نص فيه اسم الحقل في تعليق.
// ============================================================
{
  const L = '🧪 سلبي: ';
  const broken = rules.replace(
    /'fcmTokens','fcmTokens_echarpe','fcmTokens_glow','fcmTokenAt'/,
    "'fcmTokens'"
  );
  assert(broken !== rules, L + 'نجحنا نرجّع الرول لشكله القديم');
  const clean = anonHasOnly(broken).replace(/\/\/[^\n]*/g, ' ');
  assert(!/'fcmTokens_echarpe'/.test(clean),
    L + '⭐ الفحص بيقع على الرول القديم (يعني بيمسك الباج فعلًا)');
  assert(!/'fcmTokenAt'/.test(clean), L + 'وبيقع على fcmTokenAt كمان');
}

// ============================================================
// ٣) التطبيق والرول لازم يتكلموا نفس اللغة
// ------------------------------------------------------------
// بنستخرج أسماء الحقول اللي التطبيق **بيكتبها** فعلًا في مستند العميلة
// وقت تسجيل التوكن، وبنتأكد إن كل واحد فيهم مسموح في الرول.
// ============================================================
{
  const cond = anonHasOnly(rules).replace(/\/\/[^\n]*/g, ' ');
  [['loyalty', loyalty], ['glow', glow]].forEach(function(pair){
    const L = '🔗 ' + pair[0] + ': ';
    const html = pair[1];
    assert(/u\['fcmTokens_' \+ CATALOG_BRAND\]/.test(html),
      L + 'بيكتب المصفوفة باسم البراند');
    assert(/u\['fcmTokenAt'\]/.test(html), L + 'وبيكتب fcmTokenAt معاها');
    // الحقلين بيتكتبوا في **نفس** الـset — فأي واحد مرفوض يوقّع العملية كلها
    assert(/'fcmTokenAt'/.test(cond),
      L + '⭐ والحقل ده مسموح في الرول (بيتكتب في نفس العملية)');
  });
}

// ============================================================
// ٤) 🩺 التشخيص — الفشل ميتبلعش تاني
// ------------------------------------------------------------
// الباج عاش شهور لأن `catch(e){ console.warn(...) }` كان بيبلع
// permission-denied. أي فشل دلوقتي لازم يتسجّل بسبب مقروء.
// ============================================================
{
  [['loyalty', loyalty], ['glow', glow]].forEach(function(pair){
    const L = '🩺 ' + pair[0] + ': ';
    const html = pair[1];
    assert(/window\.pushDiag\s*=/.test(html), L + '`pushDiag()` متعرّضة على window (§18)');
    assert(/_pushSay\('save-failed:'/.test(html), L + 'فشل الحفظ بيتسجّل بكوده');
    assert(/_pushSay\('token-failed:'/.test(html), L + 'وفشل جلب التوكن كمان');
    assert(/permission-denied/.test(html),
      L + '⭐ و`permission-denied` ليه ترجمة صريحة — ده السبب اللي كان مخفي');
    assert(/_pushSay\('ok'/.test(html), L + 'والنجاح بيتسجّل برضه (عشان نفرّق)');
    // ⚠️ مفيش catch صامت فاضل في مسار التوكن
    assert(!/\.catch\(function\(e\)\{ console\.warn\('fcm token save', e\); \}\)/.test(html),
      L + '⛔ الـcatch الصامت القديم اتشال');
  });
}

// ============================================================
// ٥) Office/sw.js — مستمع `notificationclick` **واحد** بس
// ------------------------------------------------------------
// كان فيه اتنين في نفس الملف. المتصفح بينادي الاتنين، والقديم
// (اللي بيرمي data.url ويفتح './' دايمًا) كان بيسبق — فاللينك بيضيع.
// نفس باج قمع التقييم بالظبط، بس في Office.
// ============================================================
{
  const L = '🔔 Office sw: ';
  const sw = R('Office', 'sw.js');
  const n = (sw.match(/addEventListener\('notificationclick'/g) || []).length;
  assertEq(n, 1, L + '⭐ مستمع notificationclick **واحد** (كانوا اتنين)');
  assert(/notification\.data && event\.notification\.data\.url/.test(sw),
    L + 'والمستمع الفاضل هو اللي بيحترم data.url');
  const v = (sw.match(/echarpe-office-v(\d+)/) || [])[1];
  assert(!!v && Number(v) >= 49, L + 'CACHE_NAME v49+ (لقينا v' + (v || '?') + ')');
}

// ============================================================
// ٦) الكاش اتزوّد في تطبيقات العملاء
// ------------------------------------------------------------
// من غير كده الإصلاح مايوصلش للأجهزة أصلًا — والرول لوحده مش كفاية
// لأن الكود القديم هو اللي هيفضل شغال.
// ============================================================
{
  [['loyalty', 'echarpe-loyalty-v', 48], ['glow', 'glow-loyalty-v', 39]].forEach(function(a){
    const sw = R(a[0], 'sw.js');
    const v = (sw.match(new RegExp(a[1] + '(\\d+)')) || [])[1];
    assert(!!v && Number(v) >= a[2],
      '🔔 ' + a[0] + ': CACHE_NAME ' + a[1] + a[2] + '+ (لقينا v' + (v || '?') + ')');
  });
}

// ============================================================
// ٧) 💬 شات POS — لوحة جانبية مش أوفرلاي كامل
// ------------------------------------------------------------
// الشكوى: الشات بيفتح على الشاشة كلها فبيغطي السلة والفاتورة،
// فالكاشير بتقفله عشان تشوف اللي قدامها والرد بيتأخر.
// ============================================================
{
  const L = '💬 شات POS: ';
  const cc = R('pos', 'chat-staff-ui.js');
  // البلوك بيتبني كسلسلة نصوص — بنجمّعها الأول
  const cssAt = cc.indexOf('#ccWrap{');
  assert(cssAt > 0, L + 'قاعدة #ccWrap اتلقت');
  const css = cc.slice(cssAt, cssAt + 400).replace(/'\s*\+\s*'/g, '');

  assert(/width:50vw/.test(css), L + '⭐ العرض نص الشاشة');
  assert(!/#ccWrap\{position:fixed; inset:0;/.test(cc.replace(/'\s*\+\s*'/g, '')),
    L + '⭐ و`inset:0` (الشاشة الكاملة) اتشال');
  assert(/min-width:340px/.test(css), L + 'وبحد أدنى معقول للكتابة');
  assert(/max-width:620px/.test(css), L + 'وبحد أقصى — الشاشة العريضة مش محتاجة نصها');
  assert(/inset-inline-start:0/.test(css),
    L + 'مرصوص ناحية الزرار العايم (والاتجاه بيتقلب لوحده في RTL)');

  // 📱 الموبايل بيرجع كامل — نص الشاشة على شاشة صغيرة مبيبقاش كفاية
  assert(/@media \(max-width:760px\)\{#ccWrap\{width:100vw/.test(cc.replace(/'\s*\+\s*'/g, '')),
    L + '⭐ وعلى الشاشات الصغيرة بيرجع كامل');

  // ↔️ التكبير/التصغير
  assert(/window\.ccWideToggle = ccWideToggle/.test(cc), L + '`ccWideToggle` على window (§18)');
  assert(/localStorage\.setItem\('cc_wide'/.test(cc), L + 'والاختيار محفوظ للجهاز');
  assert(/ccApplyWidth\(\);/.test(cc), L + 'وبيتطبّق مع كل فتح');
}

// ============================================================
// ٨) 🔖 طلبات العملاء — أيقونة وشاشة مستقلة
// ------------------------------------------------------------
// كانت مدفونة جوه شاشة «استلام بضاعة» بس، يعني مبتتشافش غير وقت
// الاستلام — والمتابعة اليومية مكانتش موجودة أصلًا.
// ============================================================
{
  const L = '🔖 الطلبات: ';
  const html = R('pos', 'index.html');
  const ui = R('pos', 'requests-ui.js');

  assert(/id="customerRequestsScreen"/.test(html), L + 'الشاشة المستقلة موجودة');
  assert(/id="navCustRequests"/.test(html), L + '⭐ والأيقونة في الداشبورد');
  assert(/onclick="goToCustomerRequests\(\)"/.test(html), L + 'وبتنادي دالة التنقل');
  assert(/id="navReqBadge"/.test(html) && /id="sideReqBadge"/.test(html),
    L + 'والبادچ في الاتنين (الأيقونة والقايمة الجانبية)');
  assert(/id="requestsScreenWrap"/.test(html), L + 'ومكان العرض');

  // اللوحة القديمة **مبتتشالش** — دي لحظة وصول البضاعة
  assert(/id="requestsBody"/.test(html),
    L + '⭐ ولوحة الاستلام القديمة فاضلة زي ما هي (مش بديل — إضافة)');

  assert(/window\.goToCustomerRequests = goToCustomerRequests/.test(ui), L + 'الدالة على window (§18)');
  assert(/window\.renderRequestsScreen = renderRequestsScreen/.test(ui), L + 'وكذلك العرض');
  assert(/window\.renderRequestsBadge = renderRequestsBadge/.test(ui), L + 'وكذلك البادچ');

  // 💰 صفر قراءات جديدة — بيقرا من الكاش اللي المستمع محمّله
  const scr = ui.slice(ui.indexOf('function renderRequestsScreen'),
                       ui.indexOf('window.renderRequestsScreen'));
  assert(/_reqCache/.test(scr), L + '⭐ بيقرا من `_reqCache`');
  assert(!/db\.collection/.test(scr),
    L + '⭐⭐ **صفر** استعلام Firestore جديد في الشاشة — القراءات فلوس');
  assert(!/onSnapshot/.test(scr), L + 'ولا مستمع تاني');

  // البادچ بيعدّ الفرع الحالي بس
  const badge = ui.slice(ui.indexOf('function renderRequestsBadge'),
                         ui.indexOf('window.renderRequestsBadge'));
  assert(/currentBranch/.test(badge),
    L + '⭐ البادچ بيعدّ فرعه بس — رقم من كل الفروع بيخلي الكاشير تبطّل تفتحها');

  // بيتحدّث مع كل لقطة
  assert(/renderRequestsBadge\(\);/.test(ui) && /renderRequestsScreen\(\);/.test(ui),
    L + 'والاتنين بيتحدّثوا من لقطة المستمع');

  const v = (R('pos', 'sw.js').match(/store-apps-shell-v(\d+)/) || [])[1];
  assert(!!v && Number(v) >= 299, L + 'CACHE_NAME v299+ (لقينا v' + (v || '?') + ')');
}

// ============================================================
// ٩) 🧪 اختبار سلبي للشات والطلبات
// ============================================================
{
  const L = '🧪 سلبي: ';
  const cc = R('pos', 'chat-staff-ui.js').replace(/'\s*\+\s*'/g, '');
  const back = cc.replace(/#ccWrap\{position:fixed; top:0; bottom:0; inset-inline-start:0; width:50vw;/,
                          '#ccWrap{position:fixed; inset:0;');
  assert(back !== cc, L + 'نجحنا نرجّع الشات لشاشة كاملة');
  assert(!/width:50vw/.test(back.slice(back.indexOf('#ccWrap{'), back.indexOf('#ccWrap{') + 200)),
    L + '⭐ والفحص بيقع لما الباج يرجع');

  const ui = R('pos', 'requests-ui.js');
  const brokenUi = ui.replace(/window\.goToCustomerRequests = goToCustomerRequests;/, '');
  assert(!/window\.goToCustomerRequests = goToCustomerRequests/.test(brokenUi),
    L + '⭐ وفحص §18 بيقع لو التعريض اتشال (الأيقونة كانت هتفشل بصمت)');
}
