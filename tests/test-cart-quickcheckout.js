// ============================================================
// 🧪 test-cart-quickcheckout.js — ثبات السلة + تكبير الصورة + إتمام
// الطلب السريع من الشات (بدل ما تخرج لتبويب تاني)
// ------------------------------------------------------------
// كل فحص سلبي: لو رجّعت الإصلاح لازم يقع.
//   ١) loyalty/glow: ثبات السلة (localStorage) — save/restore لكل رقم
//      تليفون لوحده، وبيتحفظ مع كل تغيير حقيقي في السلة
//   ٢) tryonAddToCart بيفتح شاشة إتمام الطلب السريعة فورًا (مش تبويب)
//   ٣) شاشة إتمام الطلب: نفس renderShop (صفر تكرار منطق)، مقفولة
//      بالـ✕، وswitchTab بينضّفها دايمًا لو فاضلة عالقة
//   ٤) بعد نجاح الأوردر: السلة المحفوظة بتتفضّى + الـoverlay بيتقفل
//   ٥) تكبير الصورة بضغطة — لكل صور الشات (عادي + كروت الطقم)
//   ٦) الموقع الرئيسي: نفس ثبات السلة + نفس اللايت بوكس
//   ٧) رفع الكاش + الفحص النحوي الفعلي
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

function syntaxCheckAll(html, label) {
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const tmp = path.join(require('os').tmpdir(), 'qc_chk.js');
  blocks.forEach((b, i) => {
    fs.writeFileSync(tmp, b);
    try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
    catch (e) { assert(false, `${label} <script> #${i} خطأ نحوي: ` + e.stderr.toString().split('\n')[0]); }
  });
}

function checkApp(brand, filePath) {
  if (!fs.existsSync(filePath)) { assert(false, filePath + ' لازم يكون موجود'); return; }
  const H = fs.readFileSync(filePath, 'utf8');

  // ---------- ١) ثبات السلة ----------
  assert(/function cartSave\(\)\{/.test(H), brand + ': cartSave موجودة');
  assert(/function cartRestore\(phone\)\{/.test(H), brand + ': cartRestore موجودة');
  const saveFn = (H.match(/function cartSave\(\)\{[\s\S]*?\n\}/) || [''])[0];
  assert(/currentCustomer\.phone/.test(saveFn), brand + ': الحفظ لكل رقم تليفون لوحده (مش مشترك بين العملاء)');
  assert(/localStorage\.setItem/.test(saveFn), brand + ': بيستخدم localStorage فعليًا');
  assert(/JSON\.stringify\(\{ cart: _shopCart, extra: _extraCartProducts \}\)/.test(saveFn),
    brand + ': بيحفظ الكمية + بيانات منتجات الشات مع بعض');

  // shopAdd و tryonVerifyCartItem بينادوا cartSave فعليًا
  const shopAddFn = (H.match(/function shopAdd\(bc, d\)\{[\s\S]*?\n\}/) || [''])[0];
  assert(shopAddFn.indexOf('cartSave();') >= 0, brand + ': shopAdd بيحفظ السلة بعد كل تغيير');
  const verifyFn = (H.match(/function tryonVerifyCartItem\(bc\)\{[\s\S]*?\n\}/) || [''])[0];
  assert((verifyFn.match(/cartSave\(\);/g) || []).length >= 2,
    brand + ': التحقق من المخزون بيحفظ في الحالتين (لقى/مالقاش)');

  // enterApp بيسترجع السلة عند الدخول
  const enterFn = (H.match(/function enterApp\(phone\)\{[\s\S]*?\n  cartRestore\(phone\);/) || [''])[0];
  assert(enterFn.length > 0, brand + ': enterApp بيسترجع سلة نفس الرقم عند الدخول');

  // ---------- ٢+٣) إتمام الطلب السريع ----------
  // ⚠️ v62: بارامتر note اختياري بقى (لون البندانة) في تعريف الدالة
  const bridgeFn = (H.match(/function tryonAddToCart\(barcode, imgFallback,\s*note\)\{[\s\S]*?\n\}/) || [''])[0];
  assert(bridgeFn.indexOf('openQuickCheckout(bc)') >= 0,
    brand + ': 🔴 tryonAddToCart بيفتح إتمام الطلب على طول (مش تبويب)');
  assert(bridgeFn.indexOf('switchTab') === -1, brand + ': مفيش تبديل تبويب — overlay بس');

  const qcOpenFn = (H.match(/function openQuickCheckout\(barcode\)\{[\s\S]*?\n\}/) || [''])[0];
  assert(qcOpenFn.indexOf("classList.add('shop-overlay')") >= 0, brand + ': فتح الـoverlay بيضيف الكلاس');
  assert(qcOpenFn.indexOf('renderShop()') >= 0, brand + ': بيستخدم renderShop الأصلية (صفر تكرار منطق تشيك أوت)');
  assert(qcOpenFn.indexOf('lazyLoadTab') >= 0, brand + ': بيحمّل الكتالوج لو أول مرة (حتى من غير زيارة التبويب)');

  const qcCloseFn = (H.match(/function closeQuickCheckout\(\)\{[\s\S]*?\n\}/) || [''])[0];
  assert(qcCloseFn.indexOf("classList.remove('shop-overlay')") >= 0, brand + ': القفل بيشيل الكلاس');

  // 🔴 switchTab بينضّف overlay عالق (دفاعي — رجوع متصفح بدل ✕)
  const switchFn = (H.match(/function switchTab\(tab\)\{[\s\S]*?\n  currentTab = tab;[\s\S]{0,400}/) || [''])[0];
  assert(switchFn.indexOf("shop-overlay") >= 0 && switchFn.indexOf('classList.remove') >= 0,
    brand + ': switchTab العادي بينضّف overlay عالق دايمًا');

  // ---------- ٤) بعد نجاح الأوردر ----------
  assert(/cartSave\(\);\s*\/\/ 💾 السلة المحفوظة اتفضّت/.test(H), brand + ': السلة المحفوظة بتتفضّى بعد أوردر ناجح');
  assert(/closeQuickCheckout\(\);\s*\/\/ لو الطلب اتفتح كـoverlay/.test(H), brand + ': الـoverlay بيتقفل بعد نجاح الطلب');

  // ---------- ٥) تكبير الصورة ----------
  assert(/function chatImgZoom\(src\)\{/.test(H), brand + ': دالة تكبير الصورة موجودة');
  assert((H.match(/onclick="chatImgZoom\(this\.src\)"/g) || []).length >= 2,
    brand + ': التكبير مربوط في الصورة العادية وكروت الطقم مع بعض');

  // ---------- ٧ (جزء) الفحص النحوي ----------
  syntaxCheckAll(H, brand);
}

checkApp('loyalty', path.join(ROOT, 'loyalty', 'index.html'));
checkApp('glow', path.join(ROOT, 'glow', 'index.html'));

// ================= ٦) الموقع الرئيسي =================
const SITE = path.join(ROOT, 'index.html');
if (!fs.existsSync(SITE)) { assert(false, 'index.html لازم يكون موجود'); }
else {
  const S = fs.readFileSync(SITE, 'utf8');
  assert(/function wsCartSave\(\)\{/.test(S), 'site: wsCartSave موجودة');
  assert(/function wsCartRestore\(\)\{/.test(S), 'site: wsCartRestore موجودة');
  assert(/wsCartRestore\(\);\s*\/\/ 💾 سلة محفوظة/.test(S), 'site: السلة بترجع تتحمّل عند فتح الموقع');
  const wsAddFn = (S.match(/function wsAdd\(bc, d\)\{[\s\S]*?\n  \}/) || [''])[0];
  assert(wsAddFn.indexOf('wsCartSave();') >= 0, 'site: wsAdd بيحفظ السلة');
  assert(/function cwImgZoom\(src\)\{/.test(S), 'site: تكبير الصورة في شات الموقع موجود');
  assert((S.match(/onclick="cwImgZoom\(this\.src\)"/g) || []).length >= 2,
    'site: التكبير مربوط في الصورة العادية وكروت الطقم');
  syntaxCheckAll(S, 'site');
}

// ================= ٧) رفع الكاش =================
function read(rel) { const f = path.join(ROOT, rel); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; }
function verAtLeast(str, re, min) {
  const n = Number((str.match(re) || [])[1]);
  return Number.isFinite(n) && n >= min;
}
assert(verAtLeast(read('loyalty/sw.js'), /echarpe-loyalty-v(\d+)/, 61), 'كاش loyalty ≥ v61');
assert(verAtLeast(read('glow/sw.js'), /glow-loyalty-v(\d+)/, 55), 'كاش glow ≥ v55');
