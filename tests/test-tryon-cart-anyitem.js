// ============================================================
// 🧪 test-tryon-cart-anyitem.js — الشات يقدر يبيع أي صنف في المحل
// ------------------------------------------------------------
// كل فحص سلبي: لو رجّعت الإصلاح لازم يقع.
//   ١) POS: معاينة السعر لحظية بالباركود من الكاش المحلي (findByBarcode)
//   ٢) العميلة: tryonVerifyCartItem بيقرا المخزون الحقيقي (pos_test_inventory)
//      مش كتالوج البيع أونلاين المنسّق — مفيش رفض لصنف حقيقي
//   ٣) shopCartLines بيرجع للـ_extraCartProducts (مش بيسيب الصنف يختفي بصمت)
//   ٤) لو الصنف مش موجود أصلًا: بيتشال من السلة + رسالة واضحة (مش سكوت)
//   ٥) فشل الشبكة ≠ الصنف مش موجود — السلة مبتتفرغش
//   ٦) رفع الكاش
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---------- ١) POS: معاينة السعر ----------
const POS = path.join(ROOT, 'pos', 'chat-staff-ui.js');
if (!fs.existsSync(POS)) {
  assert(false, 'pos/chat-staff-ui.js لازم يكون موجود');
} else {
  const P = fs.readFileSync(POS, 'utf8');
  assert(/oninput="ccTryBcPreview\(\)"/.test(P), 'حقل الباركود بينادي المعاينة وإحنا بنكتب');
  assert(/function ccTryBcPreview\(\)\{[\s\S]*?\n  \}/.test(P), 'دالة المعاينة موجودة');
  const prevFn = (P.match(/function ccTryBcPreview\(\)\{[\s\S]*?\n  \}/) || [''])[0];
  assert(/window\.findByBarcode/.test(prevFn), 'بتستخدم الكاش المحلي (findByBarcode) — مفيش نداء شبكة');
  assert(/includeOut:\s*true/.test(prevFn), '🔴 بتدوّر حتى على الأصناف outofstock — الشات ميرفضش صنف حقيقي');
  assert(/p\.price/.test(prevFn) || /ccBcInfoShow/.test(prevFn), 'بتعرض السعر والاسم (عن طريق ccBcInfoShow)');
  assert(/مفيش صنف بالكود ده/.test(prevFn), 'رسالة واضحة لو الكود غلط');
  assert(P.indexOf("var _bi = document.getElementById('ccTryBcInfo')") >= 0,
    'مسح الصورة بيصفّر معاينة السعر كمان');
}

// ---------- ٢-٥) العميلة (loyalty + glow) ----------
[['loyalty', path.join(ROOT, 'loyalty', 'index.html')], ['glow', path.join(ROOT, 'glow', 'index.html')]]
  .forEach(function (t) {
    const brand = t[0], p = t[1];
    if (!fs.existsSync(p)) { assert(false, p + ' لازم يكون موجود'); return; }
    const H = fs.readFileSync(p, 'utf8');

    assert(/var _extraCartProducts = \{\};/.test(H), brand + ': _extraCartProducts متعرّفة');

    const linesFn = (H.match(/function shopCartLines\(\)\{[\s\S]*?\n\}/) || [''])[0];
    assert(linesFn.indexOf('_extraCartProducts[bc]') >= 0,
      brand + ': shopCartLines بترجع لمنتجات الشات (مش بس الكتالوج المنسّق)');

    const verifyFn = (H.match(/function tryonVerifyCartItem\(bc\)\{[\s\S]*?\n\}/) || [''])[0];
    assert(verifyFn, brand + ': tryonVerifyCartItem موجودة');
    // 🔴 مفيش رفض بناءً على الكتالوج المنسّق (orderFindByBarcode(shopItems()...) اتشالت)
    assert(!/orderFindByBarcode\(shopItems\(\)/.test(verifyFn),
      brand + ': مفيش رفض بناءً على كتالوج البيع أونلاين — أي صنف حقيقي يتقبل');
    assert(!/مش متاح للطلب أونلاين/.test(verifyFn),
      brand + ': اتشالت رسالة "مش متاح أونلاين" الخطأ (كانت بترفض صنف حقيقي)');
    // بيقرا من مخزون حقيقي
    assert(/db\.collection\(COL_INVENTORY\)\.doc\(bc\)\.get\(\)/.test(verifyFn),
      brand + ': بيقرا من pos_test_inventory الحقيقي');
    // ٤) صنف مش موجود أصلًا → بيتشال من السلة + رسالة واضحة (مش سكوت)
    assert(/delete _shopCart\[bc\]/.test(verifyFn), brand + ': صنف مش موجود بيتشال من السلة');
    assert(/مش لاقيين منتج بالباركود ده/.test(verifyFn), brand + ': رسالة واضحة لصنف غير موجود');
    // ٥) فشل الشبكة ما يمسحش السلة
    const catchBlock = (verifyFn.match(/\.catch\(function\(\)\{[\s\S]*?\n  \}\);/) || [''])[0];
    assert(catchBlock.indexOf('delete _shopCart') === -1,
      brand + ': فشل الشبكة مبيمسحش السلة (مختلف عن "صنف مش موجود")');

    // tryonAddToCart بينادي verify من غير tries (النسخة المبسّطة)
    assert(/tryonVerifyCartItem\(bc\);/.test(H) && !/tryonVerifyCartItem\(bc, 0\)/.test(H),
      brand + ': tryonAddToCart بينادي النسخة المبسّطة (من غير polling)');
  });

// ---------- ٦) رفع الكاش ----------
function read(rel) { const f = path.join(ROOT, rel); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; }
function verAtLeast(str, re, min) {
  const n = Number((str.match(re) || [])[1]);
  return Number.isFinite(n) && n >= min;
}
assert(verAtLeast(read('loyalty/sw.js'), /echarpe-loyalty-v(\d+)/, 58), 'كاش loyalty ≥ v58');
assert(verAtLeast(read('glow/sw.js'), /glow-loyalty-v(\d+)/, 52), 'كاش glow ≥ v52');
assert(verAtLeast(read('pos/sw.js'), /store-apps-shell-v(\d+)/, 320), 'كاش POS ≥ v320');
