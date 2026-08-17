// ============================================================
// 🧪 test-tryon-cart-customer.js — ربط التجربة بالسلة: جزء العميلة
// ------------------------------------------------------------
// كل فحص سلبي: لو رجّعت الإصلاح لازم يقع.
//   ١) orderFindByBarcode (pos/orders-core.js) — دالة نقية
//   ٢) chatTryOn: بيحفظ باركود المنتج **ويمسحه** لو مفيش (منع تسرّب
//      باركود قديم لمنتج تاني) — في التطبيقين
//   ٣) tryonAddToCart: بيضيف للسلة الحقيقية + يفتح تبويب المتجر +
//      بيتحقق من التوفر (مش بيضيف بصمت من غير تأكيد للعميلة)
//   ٤) فولباك ?addcart= بيتقرا عند التحميل + بينضّف الرابط
//   ٥) photo.html: زر السلة بيفضّل window.opener، وفولباك التنقّل موجود
//   ٦) رفع الكاش: loyalty v57 · glow v51 · tryon sw v38 + TRYON_VER v38
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---------- ١) orderFindByBarcode ----------
const OC_PATH = path.join(ROOT, 'pos', 'orders-core.js');
if (!fs.existsSync(OC_PATH)) {
  assert(false, 'pos/orders-core.js لازم يكون موجود');
} else {
  const OC = require(OC_PATH);
  assert(typeof OC.orderFindByBarcode === 'function', 'orderFindByBarcode متصدّرة');
  const items = [{ barcode: 'A1', name: 'طرحة حمرا' }, { barcode: 'B2', name: 'طرحة زرقا' }];
  assertEq(OC.orderFindByBarcode(items, 'B2').name, 'طرحة زرقا', 'بيلاقي الصنف بالباركود');
  assertEq(OC.orderFindByBarcode(items, 'ZZZ'), null, 'باركود مش موجود → null');
  assertEq(OC.orderFindByBarcode(items, ''), null, 'باركود فاضي → null');
  assertEq(OC.orderFindByBarcode(null, 'A1'), null, 'قايمة null → null (مش استثناء)');
  // 🔴 المقارنة نصّية (barcode ممكن يكون رقم في مصدر ونص في التاني)
  assertEq(OC.orderFindByBarcode([{ barcode: 123 }], '123').barcode, 123, 'المقارنة بتتعامل مع رقم/نص');
}

// ---------- ٢) و ٣) و ٤) chatTryOn + tryonAddToCart + addcart bootstrap ----------
[
  ['loyalty', path.join(ROOT, 'loyalty', 'index.html'), 'loyalty'],
  ['glow', path.join(ROOT, 'glow', 'index.html'), 'glow']
].forEach(function (t) {
  const brand = t[0], p = t[1];
  if (!fs.existsSync(p)) { assert(false, p + ' لازم يكون موجود'); return; }
  const H = fs.readFileSync(p, 'utf8');

  // chatBarcodes: معرّفة ومتصفّرة مع chatImgs (مش خزّانة عالقة)
  assert(/var chatBarcodes = \{\};/.test(H), brand + ': chatBarcodes متعرّفة');
  assert((H.match(/chatBarcodes = \{\};/g) || []).length >= 3,
    brand + ': chatBarcodes بتتصفّر مع كل تصفير لـchatImgs (تعريف + ريسيتين)');
  assert(/if\(m\.barcode\) chatBarcodes\[m\.id\] = String\(m\.barcode\);/.test(H),
    brand + ': الباركود بيتسجّل مع رسائل الشات');

  // 🔴 chatTryOn لازم يمسح echarpe_tryon_pid لو مفيش باركود على الرسالة دي
  //    (منع تسرّب باركود من رسالة سابقة لتجربة تانية)
  const ctFn = (H.match(/function chatTryOn\(id\)\{[\s\S]*?\n\}/) || [''])[0];
  assert(ctFn.indexOf('removeItem') >= 0 && ctFn.indexOf('echarpe_tryon_pid') >= 0,
    brand + ': chatTryOn بيمسح echarpe_tryon_pid لو مفيش باركود');
  assert(/if\(bc\) sessionStorage\.setItem\('echarpe_tryon_pid', bc\);/.test(ctFn),
    brand + ': chatTryOn بيحفظ الباركود لو موجود');
  // بيفتح البراند الصح
  assert(ctFn.indexOf("photo.html?brand=" + brand) >= 0, brand + ': chatTryOn بيفتح البراند الصح');

  // tryonAddToCart: بيضيف فعليًا للسلة الحقيقية + يفتح تبويب المتجر
  const bridgeFn = (H.match(/function tryonAddToCart\(barcode, imgFallback\)\{[\s\S]*?\n\}/) || [''])[0];
  // ⚠️ من v61: بيفتح إتمام الطلب السريع (overlay) بدل تبديل تبويب —
  //    التفاصيل الكاملة في test-cart-quickcheckout.js
  assert(bridgeFn.indexOf('openQuickCheckout(bc)') >= 0, brand + ': tryonAddToCart بيفتح إتمام الطلب السريع');
  assert(H.indexOf('window.tryonAddToCart = tryonAddToCart;') >= 0, brand + ': tryonAddToCart متعرّضة على window (القاعدة الذهبية)');

  // tryonVerifyCartItem: بيقرا المخزون الحقيقي (نسخة v2 — راجع
  // test-tryon-cart-anyitem.js للتفاصيل الكاملة؛ هنا فحص وجودها بس)
  const verifyFn = (H.match(/function tryonVerifyCartItem\(bc\)\{[\s\S]*?\n\}/) || [''])[0];
  assert(verifyFn.length > 0, brand + ': تحقق الإضافة موجود');
  assert(/showToast\('اتضافت للسلة/.test(verifyFn), brand + ': رسالة نجاح لو الصنف موجود');

  // فولباك ?addcart= — بيتقرا عند load وبينضّف الرابط
  assert(/addcart=/.test(H), brand + ': فيه قارئ addcart');
  assert(/history\.replaceState/.test(H), brand + ': الرابط بيتنضّف بعد الإضافة (مفيش تكرار عند الريفريش)');
});

// ---------- ٥) photo.html: window.opener أولًا ----------
const PAGE = path.join(ROOT, 'tryon', 'photo.html');
if (!fs.existsSync(PAGE)) {
  assert(false, 'tryon/photo.html لازم يكون موجود');
} else {
  const P = fs.readFileSync(PAGE, 'utf8');
  const cartFn = (P.match(/cartBtn"\)\.addEventListener\("click", function\(\)\{[\s\S]*?\n\s*\}\);/) || [''])[0];
  assert(cartFn.indexOf('window.opener') >= 0, 'زر السلة بيدوّر على window.opener الأول');
  assert(cartFn.indexOf('tryonAddToCart') >= 0, 'زر السلة بينادي tryonAddToCart في الأصل الأصلي');
  assert(cartFn.indexOf('window.close()') >= 0, 'بعد الإضافة بيقفل تاب التجربة');
  // فولباك موجود لو مفيش opener
  assert(cartFn.indexOf('addcart=') >= 0, 'فولباك التنقّل بـ?addcart= موجود لو مفيش opener');
}

// ---------- ٦) رفع الكاش ----------
function read(rel) { const f = path.join(ROOT, rel); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; }
function verAtLeast(str, re, min) {
  const n = Number((str.match(re) || [])[1]);
  return Number.isFinite(n) && n >= min;
}
assert(verAtLeast(read('loyalty/sw.js'), /echarpe-loyalty-v(\d+)/, 57), 'كاش loyalty ≥ v57');
assert(verAtLeast(read('glow/sw.js'), /glow-loyalty-v(\d+)/, 51), 'كاش glow ≥ v51');
assert(verAtLeast(read('tryon/sw.js'), /echarpe-tryon-v(\d+)/, 38), 'كاش tryon ≥ v38');
assert(verAtLeast(read('tryon/tryon-app.js'), /TRYON_VER = 'v(\d+)'/, 38), 'TRYON_VER ≥ v38 (تناسق مع sw)');
