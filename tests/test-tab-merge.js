// ============================================================
// 🗂️ test-tab-merge — دمج «آخر العروض» في تبويب «عروضي»
// ------------------------------------------------------------
// قرار المالك: تلات شاشات لنفس الفكرة (مكافآت · عروض · كتالوج)
// بتفرّق الانتباه. اتدمجوا في تبويب واحد، والخانة اللي فضيت
// هتبقى **شراء أونلاين**.
//
// 🔴 الدمج بيفتح ٤ أبواب للفشل الصامت — كلهم متغطّيين هنا:
//   ١) نداء `renderProducts` فاضل بعد ما الدالة اتشالت → ReferenceError
//   ٢) تحميل الكتالوج فاضل مربوط بتبويب **مش موجود** → قسم فاضي للأبد
//   ٣) `setTabBadge('products')` بيحدّث عنصر مش موجود → منتج جديد
//      يوصل من **غير أي إشعار**
//   ٤) `return` في `lazyLoadTab` بيوقف تحميل الخصومات → العروض تختفي
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APPS = [
  ['loyalty', fs.readFileSync(path.join(ROOT, 'loyalty', 'index.html'), 'utf8')],
  ['glow',    fs.readFileSync(path.join(ROOT, 'glow',    'index.html'), 'utf8')]
];
function code(s){
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/[^\n]*/gm, ' ');
}

APPS.forEach(function(pair){
  const app = pair[0], src = pair[1], c = code(src);
  const L = '🗂️ ' + app + ': ';

  // ============================================================
  // ١) التبويب القديم اتشال بالكامل
  // ============================================================
  assert(!/data-tab="products"/.test(src), L + '⭐⭐ زرار «آخر العروض» اتشال');
  assert(!/id="tab-products"/.test(src), L + '⭐⭐ وعنصره كمان');
  assert(!/id="badge-products"/.test(src), L + 'وشارته');
  assert(/data-tab="offers"/.test(src), L + 'وتبويب العروض موجود');
  assert(/<span class="tl">عروضي<\/span>/.test(src), L + '⭐ والاسم اتغيّر لـ«عروضي»');

  // ============================================================
  // ٢) ⛔ مفيش نداء ليتيم لدالة اتشالت
  // ------------------------------------------------------------
  // ده أخطر واحد: `renderProducts` كانت متندهة في **٤ أماكن**
  // (switchTab · lazyLoadTab · catch · activateOffer). أي واحدة
  // فاضلة = ReferenceError وقت التشغيل.
  // ============================================================
  assert(!/renderProducts/.test(c),
    L + '⭐⭐ مفيش أي نداء لـ`renderProducts` (اتشالت)');
  assert(/function catalogHTML\(\)/.test(c),
    L + '⭐ والكتالوج بقى `catalogHTML()` بترجّع HTML');
  assert(/catalogHTML\(\)/.test(c), L + 'و`renderOffers` بتركّبها');

  // الكتالوج بيتركّب في **الحالتين** — فيه عروض ومفيش
  const ro = c.slice(c.indexOf('function renderOffers()'), c.indexOf('function catalogHTML('));
  const uses = (ro.match(/catalogHTML\(\)/g) || []).length;
  assert(uses >= 2,
    L + '⭐⭐ الكتالوج بيبان حتى لو مفيش عروض (لقينا ' + uses + ' استخدام)');

  // ============================================================
  // ٣) تحميل الكتالوج مربوط بالتبويب الجديد
  // ------------------------------------------------------------
  // لو فضل على `products`، بيستنى تبويب مش موجود = قسم فاضي للأبد.
  // ============================================================
  const lz = c.slice(c.indexOf('function lazyLoadTab('), c.indexOf('function switchTab('));
  assert(/if\(tab==='offers'\)\{/.test(lz),
    L + "⭐⭐ الكتالوج بيتحمّل مع تبويب `offers`");
  assert(!/if\(tab==='products'\)/.test(lz),
    L + '⭐ ومش مربوط بالتبويب المشيل');
  assert(/catalog_/.test(lz), L + 'وبيقرا مستند الكتالوج');

  /* ⚠️ لازم **مفيش return** بعد تحميل الكتالوج: تبويب العروض محتاج
     كمان الخصومات من `tabRef('offers')`. الـreturn القديم كان
     هيوقف التحميل التاني والعروض تختفي خالص بعد الدمج. */
  const branch = lz.slice(lz.indexOf("if(tab==='offers'){"), lz.indexOf('var ref = tabRef(tab)'));
  assert(!/\breturn;/.test(branch),
    L + '⭐⭐ ومفيش `return` بيوقف تحميل الخصومات');
  assert(/var ref = tabRef\(tab\)/.test(lz), L + 'والخصومات لسه بتتحمّل');

  // ============================================================
  // ٤) 🔔 الشارة اتجمعت — مفيش تنبيه ضاع
  // ------------------------------------------------------------
  // أول ما اتدمجوا، شارة الكتالوج اتشالت بالغلط — يعني منتج جديد
  // يوصل من **غير أي إشعار**. الدمج بيلمّ الشاشات مش بيلغي التنبيهات.
  // ============================================================
  const rb = c.slice(c.indexOf('function refreshBadges()'), c.indexOf('function markTabSeen('));
  assert(/_badgeProductIds/.test(rb),
    L + '⭐⭐ شارة الكتالوج لسه محسوبة (المنتج الجديد بيتنبّه عليه)');
  assert(/_rewardIds\(\)/.test(rb), L + 'وشارة المكافآت');
  assert(/_badgeOfferIds/.test(rb), L + 'وشارة العروض');
  assert(/setTabBadge\('offers'/.test(rb), L + '⭐ وكلهم على تبويب واحد');
  assert(!/setTabBadge\('products'/.test(rb),
    L + '⭐⭐ ومفيش تحديث لشارة عنصر مش موجود');
  // المجموع مش واحد منهم بس
  assert(/nOff \+ nPr/.test(rb), L + '⭐⭐ والشارة **مجموع** التلاتة مش واحد');

  // ولما يفتح التبويب، الاتنين بيتعلّموا مقروء
  const mts = c.slice(c.indexOf('function markTabSeen('), c.indexOf('function markTabSeen(') + 400);
  assert(/_saveSeen\('offers'/.test(mts) && /_saveSeen\('products'/.test(mts),
    L + '⭐ وفتح التبويب بيصفّر الشارتين مع بعض');

  // ============================================================
  // ٥) قايمة التبويبات نضيفة
  // ============================================================
  assert(/\['card','offers','invoices','account','contact'\]/.test(c),
    L + '⭐ قايمة التبويبات من غير `products`');
  assert(!/'card','offers','products'/.test(c), L + 'والقديمة اتشالت');
});

// ============================================================
// ٦) 🧪 اختبارات سلبية
// ============================================================
{
  const L = '🧪 سلبي: ';
  const src = APPS[0][1];

  // (أ) رجّع نداء يتيم
  const broken = code(src).replace(/catalogHTML\(\)/, 'renderProducts()');
  assert(/renderProducts/.test(broken),
    L + '⭐⭐ الفحص بيمسك أي نداء لدالة اتشالت');

  // (ب) رجّع الشارة لعنصر مش موجود
  const b2 = code(src).replace(/setTabBadge\('offers', currentTab==='offers' \? 0 : \(nOff \+ nPr\)\)/,
                               "setTabBadge('offers', nOff)");
  assert(!/nOff \+ nPr/.test(b2),
    L + '⭐⭐ والفحص بيقع لو شارة الكتالوج اتشالت (المنتج كان هيوصل بصمت)');

  // (ج) رجّع الـreturn اللي بيوقف تحميل الخصومات
  const b3 = code(src).replace(/\.then\(function\(\)\{ showTopLoad\(false\); \}\);/,
                               '.then(function(){ showTopLoad(false); });\n    return;');
  const lz3 = b3.slice(b3.indexOf('function lazyLoadTab('), b3.indexOf('function switchTab('));
  const br3 = lz3.slice(lz3.indexOf("if(tab==='offers'){"), lz3.indexOf('var ref = tabRef(tab)'));
  assert(/\breturn;/.test(br3),
    L + '⭐⭐ والفحص بيقع لو الـreturn رجع (العروض كانت هتختفي)');
}
