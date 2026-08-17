// ============================================================
// 🧪 test-chat-cart-visibility.js — اسم/سعر جنب "جرّبيها" + السلة
// ظاهرة + زرار الشات العائم فوق يسار (loyalty/glow)
// ------------------------------------------------------------
// كل فحص سلبي: لو رجّعت الإصلاح لازم يقع.
//   ١) POS: اسم/سعر المنتج بيتحطوا مع الرسالة وقت الإرسال (من الكاش
//      المحلي) — بس لو تجربة مفعّلة وباركود اتلقى
//   ٢) العميلة: الاسم/السعر وزرار «أضيفيها للسلة» بيظهروا بس **جوه**
//      حارس m.tryon (مش لأي صورة عادية)
//   ٣) chatQuickBuy بينادي tryonAddToCart مباشرة (زي outfit بالظبط)
//   ٤) شارة تبويب "اطلبي" بقت متوصّلة فعليًا بعدد قطع السلة
//   ٥) زرار الشات العائم: فوق يسار، صغير، أنيميشن يحترم reduced-motion،
//      وشارة العدد متوصّلة بنفس منطق chatUpdateBadge
//   ٦) رفع الكاش + الفحص النحوي الفعلي
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

function syntaxCheckAll(html, label) {
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const tmp = path.join(require('os').tmpdir(), 'cartvis_chk.js');
  blocks.forEach((b, i) => {
    fs.writeFileSync(tmp, b);
    try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
    catch (e) { assert(false, `${label} <script> #${i} خطأ نحوي: ` + e.stderr.toString().split('\n')[0]); }
  });
}

// ================= ١) POS =================
const POS_PATH = path.join(ROOT, 'pos', 'chat-staff-ui.js');
if (!fs.existsSync(POS_PATH)) { assert(false, 'pos/chat-staff-ui.js لازم يكون موجود'); }
else {
  try { execFileSync(process.execPath, ['--check', POS_PATH], { stdio: 'pipe' }); }
  catch (e) { assert(false, 'chat-staff-ui.js خطأ نحوي: ' + e.stderr.toString().split('\n')[0]); }
  const P = fs.readFileSync(POS_PATH, 'utf8');
  const sendFn = (P.match(/function ccSend\(\)\{[\s\S]*?\n  \}/) || [''])[0];
  assert(sendFn.length > 0, 'ccSend موجودة');
  // 🔴 الاسم/السعر جوه حارس msg.tryon بس — مش بيتحطوا لأي صورة
  assert(/if\(msg\.tryon\)\{[\s\S]*?msg\.productName[\s\S]*?msg\.productPrice[\s\S]*?\}/.test(sendFn),
    'الاسم/السعر بيتحطوا جوه حارس msg.tryon (مش لأي صورة عادية)');
  assert(/findByBarcode\(_bc, \{ includeOut: true \}\)/.test(sendFn), 'بيدوّر بنفس منطق المعاينة اللحظية');
  assert(/msg\.productName = _p\.name \|\| 'صنف'/.test(sendFn), 'اسم المنتج بيتحط');
  assert(/msg\.productPrice = Number\(_p\.price\) \|\| 0/.test(sendFn), 'سعر المنتج بيتحط');
}

// ================= ٢+٣) العميلة =================
function checkApp(brand, filePath) {
  if (!fs.existsSync(filePath)) { assert(false, filePath + ' لازم يكون موجود'); return; }
  const H = fs.readFileSync(filePath, 'utf8');

  // 🔴 الاسم/السعر وزرار الشراء جوه حارس m.tryon && chatImgs[m.id] بس
  const guardMatch = H.match(/if\(m\.tryon && chatImgs\[m\.id\]\)\{[\s\S]*?\n    \}/);
  assert(guardMatch, brand + ': اسم/سعر/زرار الشراء جوه حارس m.tryon');
  if (guardMatch) {
    const block = guardMatch[0];
    assert(/m\.productName/.test(block), brand + ': اسم المنتج بيتعرض');
    assert(/esc\(m\.productName\)/.test(block), brand + ': اسم المنتج بيتعقّم');
    assert(/m\.productPrice/.test(block), brand + ': السعر بيتعرض');
    assert(/chatQuickBuy/.test(block), brand + ': زرار الشراء المباشر موجود');
    // 🔴 زرار الشراء بس لو فيه باركود حقيقي
    assert(/if\(m\.barcode\)\{/.test(block), brand + ': زرار الشراء بس لو فيه باركود');
  }

  // chatQuickBuy تنادي tryonAddToCart مباشرة (زي outfit)
  const buyFn = (H.match(/function chatQuickBuy\(msgId\)\{[\s\S]*?\n\}/) || [''])[0];
  assert(buyFn.length > 0, brand + ': chatQuickBuy موجودة');
  assert(/tryonAddToCart\(bc, chatImgs\[msgId\]\)/.test(buyFn), brand + ': chatQuickBuy بتنادي tryonAddToCart ومعاها صورة الشات للسلة');
  assert(buyFn.indexOf('photo.html') === -1, brand + ': مبتفتحش صفحة التجربة');

  // ٤) شارة السلة متوصّلة
  const renderShopFn = (H.match(/function renderShop\(\)\{[\s\S]*?\n  var box[\s\S]{0,400}/) || [''])[0];
  assert(/setTabBadge\('shop',/.test(renderShopFn), brand + ': شارة تبويب اطلبي متوصّلة بعدد السلة');
  assert(/_shopCart/.test(renderShopFn) && /shopQty\(bc\)/.test(renderShopFn),
    brand + ': العدّاد فعلي من _shopCart مش رقم ثابت');

  // ⚠️ زرار الشات العائم اتشال بالكامل في دفعة لاحقة (تفضيل المالك:
  //    أيقونة عائمة واحدة بس — السلة). التفاصيل في
  //    test-cart-final-polish.js. الشات لسه شغّال من تبويب "تواصل".
}

checkApp('loyalty', path.join(ROOT, 'loyalty', 'index.html'));
checkApp('glow', path.join(ROOT, 'glow', 'index.html'));

// ================= ٦) الكاش + الفحص النحوي =================
function read(rel) { const f = path.join(ROOT, rel); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; }
function verAtLeast(str, re, min) {
  const n = Number((str.match(re) || [])[1]);
  return Number.isFinite(n) && n >= min;
}
assert(verAtLeast(read('pos/sw.js'), /store-apps-shell-v(\d+)/, 322), 'كاش POS ≥ v322');
assert(verAtLeast(read('loyalty/sw.js'), /echarpe-loyalty-v(\d+)/, 60), 'كاش loyalty ≥ v60');
assert(verAtLeast(read('glow/sw.js'), /glow-loyalty-v(\d+)/, 54), 'كاش glow ≥ v54');

syntaxCheckAll(read('loyalty/index.html'), 'loyalty');
syntaxCheckAll(read('glow/index.html'), 'glow');
