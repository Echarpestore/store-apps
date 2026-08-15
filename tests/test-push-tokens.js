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

// ⚠️ استخراج بالأقواس المتوازنة — regex اتكسر قبل كده وطلّع فشل وهمي (§0)
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
function mustExtract(src, header, label){
  const fn = extractFn(src, header);
  assert(!!fn, '🔧 أداة الاستخراج: ' + label + ' اتلقت (لو دي وقعت، كل اللي تحتها وهمي)');
  return fn || '';
}


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
// ٩) 🔴 الدوال بتتنفّذ فعلًا — مش بس موجودة في الملف
// ------------------------------------------------------------
// الباج اللي القسم ده اتكتب عشانه (شكرًا للسكرين شوت):
//   `esc()` كانت متنادية في **١٠ مواضع** في requests-ui.js وفي
//   pos-sale.js — و**مش معرّفة في POS خالص**. كل النداءات جوّه
//   `try{}` فالـReferenceError كان بيتبلع، ولوحة الطلبات في «استلام
//   بضاعة» وشاشة «فيه ناس كانوا طالبين ده» وتلميحات شريط الفرصة
//   كانوا **فاضيين من غير أي رسالة**. شكلهم مبني وعمرهم ما اشتغلوا.
//
// ⚠️ الفحص النصي **مبيمسكش ده أبدًا** — الكود مكتوب صح، المشكلة إن
//    دالة مساعدة مش موجودة وقت التشغيل. عشان كده القسم ده **بينفّذ**
//    الدوال في VM على بيانات حقيقية.
//
// 🔴 القاعدة: أي دالة عرض جديدة تتحط هنا. `try{}` حوالين عرض بيخفي
//    الباجات مش بيمنعها.
// ============================================================
{
  const L = '🔴 تنفيذ: ';
  const vm2 = require('vm');
  const uiSrc = fs.readFileSync(path.join(ROOT, 'pos', 'requests-ui.js'), 'utf8');
  const coreSrc2 = R('pos', 'pos-core.js');

  // esc لازم تبقى معرّفة في pos-core (أول ملف بيتحمّل)
  assert(/function esc\(/.test(coreSrc2), L + '⭐⭐ `esc()` معرّفة في pos-core.js');
  assert(/window\.esc = esc/.test(coreSrc2), L + 'ومتعرّضة على window (§18)');

  // ---------- بيئة DOM مصغّرة ----------
  function el(){
    return { innerHTML:'', textContent:'', value:'', style:{}, dataset:{},
             classList:{ add(){}, remove(){}, toggle(){} } };
  }
  const nodes = {};
  ['requestsBody','requestsScreenWrap','reqSummary','reqSearch','reqScope',
   'reqSort','navReqBadge','sideReqBadge'].forEach(function(id){ nodes[id] = el(); });

  const ctx = {
    console: { warn(){}, log(){}, error(){} },
    document: {
      getElementById: function(id){ return nodes[id] || null; },
      createElement: el,
      querySelectorAll: function(){ return []; },
      body: { appendChild(){} }, head: { appendChild(){} },
      addEventListener(){}, readyState:'complete'
    },
    setTimeout: function(){}, setInterval: function(){},
    localStorage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
    currentBranch: 'الرحاب',
    currentEmployee: { id:'e1', name:'روان' },
    allInventory: [{ id:'p1', name:'طرحة شيفون بيضا', barcode:'ECH1',
                     qtyByBranch:{ 'الرحاب': 3 } }],
    showToast: function(){},
    db: { collection: function(){ return { where(){ return this; }, onSnapshot(){ return function(){}; } }; } },
    reqIsStale: function(){ return true; },
    reqMatch: function(){ return { level:'none' }; },
    reqNormalize: function(s){ return s; },
    reqKeywords: function(){ return ['x']; }
  };
  ctx.window = ctx;
  vm2.createContext(ctx);
  // نحمّل esc من pos-core زي ما المتصفح بيعمل بالظبط (أول ملف)
  // ⚠️ جوّه try: لو esc مش موجودة، عايزين **فشل مقروء** مش انهيار
  //    الملف كله بـstack trace (اللي بيخلي باقي الاختبارات متتشغّلش).
  let loaded = true;
  try{
    vm2.runInContext(mustExtract(coreSrc2, 'function esc(', 'esc') + '\n; window.esc = esc;', ctx);
    vm2.runInContext(uiSrc, ctx);
  }catch(e){
    loaded = false;
    assert(false, L + '⭐⭐ تحميل ملفات الطلبات وقع: ' + e.message
      + ' — دالة مساعدة ناقصة (ده بالظبط باج `esc` اللي حصل)');
  }

  // 📋 طلب فيه محارف HTML — لازم تتهرّب مش ترمي
  const REQ = [{ id:'r1', text:'طرحة <b>بيضا</b> شيفون', name:'منى & أختها',
                 phone:'01000000000', branch:'الرحاب', barcode:'ECH1',
                 createdAt: Date.now() - 3*86400000, by:'e1', byName:'روان' }];
  ctx._reqCache = REQ;

  // الطريقة الوحيدة لحقن الكاش: المستمع. بنستدعي العرض بعد ما نزرعه
  // في نطاق الملف عن طريق إعادة تعريف المتغير جوّه نفس السياق.
  vm2.runInContext('_reqCache = ' + JSON.stringify(REQ) + ';', ctx);

  if(!loaded){
    // من غير تحميل، باقي القسم مالوش معنى — بنوقف هنا بفشل واضح فوق
  } else {
  let threw = null;
  try{ ctx.renderRequestsTab(); }catch(e){ threw = e; }
  assert(!threw, L + '⭐⭐ `renderRequestsTab` بتشتغل من غير ما ترمي'
    + (threw ? ' — ' + threw.message : ''));
  assert(nodes.requestsBody.innerHTML.indexOf('شيفون') >= 0,
    L + '⭐ وبتكتب الطلب فعلًا (مش فاضية)');

  threw = null;
  try{ ctx.renderRequestsScreen(); }catch(e){ threw = e; }
  assert(!threw, L + '⭐⭐ و`renderRequestsScreen` كمان'
    + (threw ? ' — ' + threw.message : ''));
  assert(nodes.requestsScreenWrap.innerHTML.indexOf('شيفون') >= 0,
    L + '⭐ وبتعرض الطلب');

  threw = null;
  try{ ctx.renderRequestsBadge(); }catch(e){ threw = e; }
  assert(!threw, L + 'و`renderRequestsBadge`' + (threw ? ' — ' + threw.message : ''));
  assertEq(nodes.navReqBadge.textContent, '1', L + 'والبادچ بيعدّ صح');

  // 🛡️ والتهريب شغال فعلًا — مش بس مش بيرمي
  const out = nodes.requestsScreenWrap.innerHTML;
  assert(out.indexOf('<b>بيضا</b>') < 0, L + '⭐⭐ وسم HTML في نص الطلب **متهرّب**');
  assert(out.indexOf('&lt;b&gt;') >= 0, L + 'واتحوّل للشكل الآمن');
  assert(out.indexOf('&amp;') >= 0, L + 'و`&` في الاسم كمان');

  // 🧪 سلبي: شيل esc → الدالة لازم ترمي
  const ctx2 = Object.assign({}, ctx);
  const bad = uiSrc.replace(/function reqEsc\(s\)\{[\s\S]*?\n\}/, 'function reqEsc(s){ return esc(s); }');
  assert(bad !== uiSrc, L + '🧪 نجحنا نرجّع الاعتماد على esc الخارجية');
  }
}

// ============================================================
// ١٠) ⛔ مفيش نداء لدالة غير معرّفة في ملفات الطلبات
// ------------------------------------------------------------
// حارس ثابت: `esc(` العارية اتشالت من requests-ui، وأي رجوع ليها
// (أو لأي مساعد مش معرّف) لازم يقع هنا.
// ============================================================
{
  const L = '⛔ نداء يتيم: ';
  const uiSrc = fs.readFileSync(path.join(ROOT, 'pos', 'requests-ui.js'), 'utf8');
  const code = uiSrc.replace(/^[ \t]*\/\/[^\n]*/gm, ' ')
                    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  const bare = (code.match(/(^|[^A-Za-z0-9_$.])esc\(/g) || []).length;
  assertEq(bare, 0, L + '⭐⭐ مفيش `esc(` عارية في requests-ui.js (استخدم reqEsc)');
  assert(/function reqEsc\(/.test(code), L + 'و`reqEsc` معرّفة جوّه الملف نفسه');

  // 🔇 ومفيش catch فاضي حوالين العرض — ده اللي خفى الباج أصلًا
  const empty = (code.match(/catch\s*\(\s*e\s*\)\s*\{\s*\}/g) || []).length;
  assertEq(empty, 0,
    L + '⭐⭐ مفيش `catch(e){}` فاضي — الـcatch الصامت بيخفي الباجات مش بيمنعها');
}

