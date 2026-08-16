// ============================================================
// 🧪 test-tryon-cart.js — ربط التجربة بالسلة: جزء الـPOS (الباركود)
// ------------------------------------------------------------
// كل فحص سلبي: لو رجّعت الإصلاح لازم يقع.
//   ١) شات الـPOS فيه حقل باركود مع صورة الطرحة
//   ٢) الإرسال بيرفق msg.barcode — **بس لو جرّبيها مفعّل** وفيه صورة
//   ٣) مسح الصورة بيصفّر حقل الباركود
//   ٤) كاش POS اترفع (v319)
// ملاحظة: جزء العميلة (photo.html → السلة) في دفعة منفصلة لأنه بيترفع
//         على GitHub Pages مش مع POS/Electron.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const P = path.join(ROOT, 'pos', 'chat-staff-ui.js');

if (!fs.existsSync(P)) {
  assert(false, 'pos/chat-staff-ui.js لازم يكون موجود');
} else {
  const SRC = fs.readFileSync(P, 'utf8');
  // فحص الكود من غير الكومنتات (فخ الفحص الفضفاض)
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/[^\n]*/gm, ' ');

  // ١) حقل الباركود موجود في منطقة الصورة
  assert(/id="ccTryBc"/.test(CODE), 'حقل الباركود (ccTryBc) موجود في الشات');

  // ٢) 🔴 الباركود بيترفق **جوه** حارس msg.tryon (اللي جوه بلوك الصورة)
  assert(/msg\.barcode\s*=/.test(CODE), 'msg.barcode بيتحط');
  assert(/if\s*\(\s*msg\.tryon\s*\)\s*\{[\s\S]*?ccTryBc[\s\S]*?msg\.barcode\s*=/.test(CODE),
    'الباركود بيترفق بس لو جرّبيها مفعّل (جوه حارس msg.tryon)');
  // 🔴 والقيمة جاية من الحقل مش ثابتة
  assert(/ccTryBc[\s\S]{0,120}\.value/.test(CODE), 'قيمة الباركود جاية من حقل ccTryBc');

  // ٣) مسح الصورة بيصفّر الباركود (عشان ميتسربش لرسالة بعدها)
  assert(/ccImgClear[\s\S]*?ccTryBc[\s\S]{0,40}\.value\s*=\s*''/.test(CODE),
    'ccImgClear بيصفّر حقل الباركود');
}

// ٤) كاش POS اترفع
const sw = path.join(ROOT, 'pos', 'sw.js');
if (fs.existsSync(sw)) {
  assert(/store-apps-shell-v319/.test(fs.readFileSync(sw, 'utf8')), 'كاش POS اترفع لـv319');
} else {
  assert(false, 'pos/sw.js لازم يكون موجود');
}
