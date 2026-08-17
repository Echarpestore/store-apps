// ============================================================
// 🧪 test-cart-final-polish.js — زرار شات عائم واحد اتشال، السلة
// دلوقتي فوق يسار، صورة صغيرة جنب كل صنف، والتوصيل للمنزل متاح
// ------------------------------------------------------------
// كل فحص سلبي: لو رجّعت الإصلاح لازم يقع.
//   ١) 🔴 زرار الشات العائم اتشال بالكامل (HTML+CSS+JS) — الشات لسه
//      متاح من تبويب "تواصل" بس
//   ٢) السلة هي الزرار العائم الوحيد، وانتقلت لمكان الشات (يسار)
//   ٣) صورة صغيرة لكل منتج في سطر السلة (كانت ناقصة تمامًا)
//   ٤) التوصيل للمنزل مفعّل افتراضيًا + سعر شحن مبدئي (كان مقفول)
//   ٥) رفع الكاش + الفحص النحوي الفعلي
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

function syntaxCheckAll(html, label) {
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const tmp = path.join(require('os').tmpdir(), 'finalpolish_chk.js');
  blocks.forEach((b, i) => {
    fs.writeFileSync(tmp, b);
    try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
    catch (e) { assert(false, `${label} <script> #${i} خطأ نحوي: ` + e.stderr.toString().split('\n')[0]); }
  });
}

function checkApp(brand, filePath) {
  if (!fs.existsSync(filePath)) { assert(false, filePath + ' لازم يكون موجود'); return; }
  const H = fs.readFileSync(filePath, 'utf8');

  // ---------- ١) 🔴 زرار الشات العائم اتشال بالكامل ----------
  assert(H.indexOf('id="chatFab"') === -1, brand + ': 🔴 زرار الشات العائم اتشال من الـHTML');
  assert(H.indexOf('.chat-fab{') === -1, brand + ': 🔴 CSS الشات العائم اتشال');
  assert(H.indexOf('chatFabDot') === -1, brand + ': 🔴 مفيش أي أثر JS لشارة الشات العائم');
  // الشات لسه شغّال من غير الزرار العائم (openChat + تبويب تواصل)
  assert(/function openChat\(\)\{/.test(H), brand + ': الشات لسه شغّال (openChat موجودة) — بس من تبويب تواصل');

  // ---------- ٢) السلة الزرار الوحيد، في مكان الشات القديم ----------
  assert(H.indexOf('id="cartFab"') >= 0, brand + ': زرار السلة موجود');
  const cartFabCss = (H.match(/\.cart-fab\{[\s\S]*?\}/) || [''])[0];
  // ⚠️ اتحوّل من عائم لعنصر جوّه الشريط العلوي (التفاصيل في
  //    test-cart-polish.js) — بياخد الطرف المقابل للوجو تلقائيًا.
  assert(!/position:fixed/.test(cartFabCss), brand + ': 🔴 السلة مش عائمة (جوّه الشريط العلوي)');
  assert(!/right:14px;/.test(cartFabCss), brand + ': مفيش أي أثر للموضع القديم (يمين)');

  // ---------- ٣) صورة صغيرة في سطر السلة ----------
  const fn = (H.match(/function renderShop\(\)\{[\s\S]*?\nwindow\.renderShop = renderShop;/) || [''])[0];
  assert(/cl-img/.test(fn), brand + ': صورة صغيرة موجودة في سطر السلة');
  assert(/l\.img \? '<img class="cl-img"/.test(fn), brand + ': الصورة بتتعرض لو موجودة');
  assert(/cl-img-ph/.test(fn), brand + ': فيه بديل (أيقونة) لو مفيش صورة — مش فراغ');

  // الصورة بتتسحب فعليًا من المصدرين (كتالوج + مخزون حقيقي)
  const linesFn = (H.match(/function shopCartLines\(\)\{[\s\S]*?\n\}/) || [''])[0];
  assert(/img: p\.img \|\| ''/.test(linesFn), brand + ': shopCartLines بترجّع الصورة مع كل سطر');
  const verifyFn = (H.match(/function tryonVerifyCartItem\(bc\)\{[\s\S]*?\n\}/) || [''])[0];
  assert(/img: p\.img \|\| _prev\.img \|\| ''/.test(verifyFn), brand + ': التحقق من المخزون مبيمسحش صورة الشات (مستندات المخزون مفيهاش صور)');

  // ---------- ٤) التوصيل مفعّل افتراضيًا ----------
  assert(/var shopCfg = \{ pickupEnabled:true, deliveryEnabled:true, shippingFee:40,/.test(H),
    brand + ': 🔴 التوصيل للمنزل مفعّل افتراضيًا + سعر شحن مبدئي (كان متقفل بصفر)');

  syntaxCheckAll(H, brand);
}

checkApp('loyalty', path.join(ROOT, 'loyalty', 'index.html'));
checkApp('glow', path.join(ROOT, 'glow', 'index.html'));

// ================= رفع الكاش =================
function read(rel) { const f = path.join(ROOT, rel); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; }
function verAtLeast(str, re, min) {
  const n = Number((str.match(re) || [])[1]);
  return Number.isFinite(n) && n >= min;
}
assert(verAtLeast(read('loyalty/sw.js'), /echarpe-loyalty-v(\d+)/, 64), 'كاش loyalty ≥ v64');
assert(verAtLeast(read('glow/sw.js'), /glow-loyalty-v(\d+)/, 58), 'كاش glow ≥ v58');
