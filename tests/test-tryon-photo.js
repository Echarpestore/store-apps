// ============================================================
// 🧪 test-tryon-photo.js — صفحة تجربة الطرحة بالصورة (Photo AI) + الربط
// ------------------------------------------------------------
// كل فحص سلبي: لو رجّعت الإصلاح لازم يقع.
//   ١) منطق photo-core نقي (params/resize/validation/actions)
//   ٢) الزر في التطبيقين بيفتح photo.html (مش الوضع الحي) + بيبعت التليفون
//   ٣) الصفحة: input صورة، **مفيش كاميرا حية تلقائية**، بتنادي hijabTryOn،
//      ملاحظة خصوصية، مفيش innerHTML لبيانات جاية من بره، الوضع الحي كـBeta،
//      وصورة العميلة **متتخزّنش**
//   ٤) الكاش اترفع في الـ3 (loyalty/glow/tryon) + photo في precache
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const CORE = path.join(ROOT, 'tryon', 'photo-core.js');
const PAGE = path.join(ROOT, 'tryon', 'photo.html');
const LOY = path.join(ROOT, 'loyalty', 'index.html');
const GLW = path.join(ROOT, 'glow', 'index.html');

// ---------- ١) منطق photo-core ----------
if (!fs.existsSync(CORE)) {
  assert(false, 'tryon/photo-core.js لازم يكون موجود');
} else {
  const PC = require(CORE);

  // parseParams
  assertEq(PC.parseParams('?brand=glow&product=12'), { brand: 'glow', productId: '12' }, 'parseParams glow+product');
  assertEq(PC.parseParams(''), { brand: 'loyalty', productId: null }, 'parseParams افتراضي loyalty');
  assertEq(PC.parseParams('?brand=hack').brand, 'loyalty', 'براند غير معروف → loyalty');

  // appName
  assertEq(PC.appName('glow'), 'glow', 'appName glow');
  assertEq(PC.appName('nope'), 'loyalty', 'appName افتراضي');

  // isImageDataUrl
  assert(PC.isImageDataUrl('data:image/png;base64,AAA') === true, 'data:image/png مقبول');
  assert(PC.isImageDataUrl('data:text/html;base64,AAA') === false, 'data:text مرفوض');
  assert(PC.isImageDataUrl('http://x/y.png') === false, 'رابط عادي مش data-url');

  // readProductImage
  const okStore = { getItem: function (k) { return k === PC.SS_KEYS.img ? 'data:image/png;base64,AAA' : null; } };
  assertEq(PC.readProductImage(okStore), 'data:image/png;base64,AAA', 'بيقرا صورة المنتج');
  const badStore = { getItem: function () { return 'not-an-image'; } };
  assertEq(PC.readProductImage(badStore), '', 'قيمة مش صورة → فاضي');

  // computeResize — تصغير بس، بيحافظ على النسبة
  assertEq(PC.computeResize(800, 600, 1024), { w: 800, h: 600 }, 'أصغر من الحد → مفيش تكبير');
  assertEq(PC.computeResize(2048, 1024, 1024), { w: 1024, h: 512 }, 'أفقي بيتصغّر بالنسبة');
  assertEq(PC.computeResize(1024, 2048, 1024), { w: 512, h: 1024 }, 'رأسي بيتصغّر بالنسبة');
  assertEq(PC.computeResize(2000, 2000, 1024), { w: 1024, h: 1024 }, 'مربّع بيتصغّر');

  // dataUrlBytes
  assertEq(PC.dataUrlBytes('data:image/png;base64,AAAA'), 3, 'حساب البايتات ٤ أحرف = ٣ بايت');
  assertEq(PC.dataUrlBytes('no-base64'), 0, 'من غير base64 → صفر');

  // resultActions — أضيفيها للسلة بس مع productId
  assert(PC.resultActions('12').addToCart === true, 'مع productId: زر السلة يظهر');
  assert(PC.resultActions(null).addToCart === false, 'من غير productId: زر السلة يختفي');

  // الرسالة الودّية موحّدة
  assert(/جرّبي مرة تانية/.test(PC.FRIENDLY_ERR), 'رسالة ودّية موحّدة');
}

// ---------- ٢) الربط في التطبيقين ----------
[['loyalty', LOY], ['glow', GLW]].forEach(function (pair) {
  const brand = pair[0], p = pair[1];
  if (!fs.existsSync(p)) { assert(false, p + ' لازم يكون موجود'); return; }
  const H = fs.readFileSync(p, 'utf8');
  // 🔴 الزر بيفتح Photo AI للبراند الصح
  assert(H.indexOf('../tryon/photo.html?brand=' + brand) >= 0, brand + ': chatTryOn بيفتح photo.html للبراند الصح');
  // 🔴 مبقاش بيفتح الوضع الحي مباشرة من الشات
  assert(H.indexOf("'../tryon/?imgkey=1'") === -1, brand + ': الشات مبقاش بيفتح الوضع الحي مباشرة');
  // التليفون بيتبعت لسقف التكلفة
  assert(H.indexOf('echarpe_tryon_phone') >= 0, brand + ': التليفون بيتحفظ للتجربة');
  // اللابل الجديد
  assert(H.indexOf('جرّبيها ✨') >= 0, brand + ': لابل الزر الجديد');
  assert(H.indexOf('جرّبيها بنفسك') === -1, brand + ': اللابل القديم اتشال');
});

// ---------- ٣) الصفحة نفسها ----------
if (!fs.existsSync(PAGE)) {
  assert(false, 'tryon/photo.html لازم يكون موجود');
} else {
  const P = fs.readFileSync(PAGE, 'utf8');
  // مدخل صورة (معرض + كاميرا) — accept صور بس
  assert((P.match(/accept="image\/\*"/g) || []).length >= 2, 'مدخلين صورة (معرض + كاميرا)');
  // 🔴 مفيش كاميرا حية تلقائية
  assert(P.indexOf('getUserMedia') === -1, 'ممنوع كاميرا حية تلقائية (getUserMedia)');
  // بتنادي الدالة الصح
  assert(/httpsCallable\(\s*["']hijabTryOn["']\s*\)/.test(P), 'بتنادي hijabTryOn');
  // ملاحظة خصوصية
  assert(P.indexOf('متتخزّنش') >= 0, 'ملاحظة الخصوصية موجودة');
  // 🔴 مفيش إسناد innerHTML (بيانات النتيجة/الخطأ بـtextContent و src بس)
  assert(!/\.innerHTML\s*=/.test(P), 'ممنوع إسناد innerHTML في الصفحة');
  // النتيجة والخطأ بيتحطوا آمن
  assert(/errText"\)\.textContent/.test(P) || /errText"\)\s*\.textContent/.test(P), 'الخطأ بـtextContent');
  assert(/resultImg"\)\.src\s*=/.test(P), 'صورة النتيجة عن طريق src');
  // الوضع الحي متاح كـBeta
  assert(/\.\/\?imgkey=1/.test(P), 'الوضع الحي متاح كـBeta جوه الصفحة');
  // 🔴 صورة العميلة متتخزّنش (مفيش setItem بيحمل صورة العميلة)
  assert(!/setItem\([^)]*customer/i.test(P), 'صورة العميلة متتخزّنش في التخزين');
}

// ---------- ٤) رفع الكاش + precache ----------
function sw(rel) { const f = path.join(ROOT, rel); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; }
// ⚠️ بالرقم مش بالنص الثابت (نفس منهج test-tryon.js) — عشان كل دفعة
//    جديدة بترفع النسخة متكسرش الفحص ده وتحوّله لطقس.
function verAtLeast(str, re, min) {
  const n = Number((str.match(re) || [])[1]);
  return Number.isFinite(n) && n >= min;
}
assert(verAtLeast(sw('loyalty/sw.js'), /echarpe-loyalty-v(\d+)/, 57), 'كاش loyalty ≥ v57');
assert(verAtLeast(sw('glow/sw.js'), /glow-loyalty-v(\d+)/, 51), 'كاش glow ≥ v51');
const TSW = sw('tryon/sw.js');
assert(verAtLeast(TSW, /echarpe-tryon-v(\d+)/, 38), 'كاش tryon ≥ v38');
assert(TSW.indexOf('./photo.html') >= 0 && TSW.indexOf('./photo-core.js') >= 0, 'photo في precache بتاع tryon');
