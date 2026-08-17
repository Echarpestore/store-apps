// ============================================================
// 🧪 test-tryon-outfit.js — اقتراح طقم (٣ طرح) + تذكّر صورة الوش
// ------------------------------------------------------------
// كل فحص سلبي: لو رجّعت الإصلاح لازم يقع.
//   ١) POS: خانات الطقم التلاتة + الضغط المنفصل (700/280KB) + منع
//      إرسال طرحة بصورة من غير باركود صح
//   ٢) العميلة (loyalty/glow/site): زرار الطقم + رسم الكروت + جسر
//      الشراء المباشر (اطلبيها = tryonAddToCart) + جربيها عليكي
//   ٣) 🔴 صفر تداخل بين مسار الطقم ومسار الصورة الواحدة العادي
//   ٤) تذكّر صورة الوش: localStorage مش sessionStorage + auto-start +
//      "غيّري صورتك" بيمسح ويوقف البدء التلقائي
//   ٥) تعقيم كل حقول كروت الطقم
//   ٦) رفع الكاش
//   ٧) الفحص النحوي الفعلي لكل الملفات المتأثرة
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

function syntaxCheckBlocks(html, label) {
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const tmp = path.join(require('os').tmpdir(), 'outfit_chk.js');
  blocks.forEach((b, i) => {
    fs.writeFileSync(tmp, b);
    try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
    catch (e) { assert(false, `${label} <script> #${i} خطأ نحوي: ` + e.stderr.toString().split('\n')[0]); }
  });
  return blocks.length;
}

// ================= ١) POS =================
const POS_PATH = path.join(ROOT, 'pos', 'chat-staff-ui.js');
if (!fs.existsSync(POS_PATH)) {
  assert(false, 'pos/chat-staff-ui.js لازم يكون موجود');
} else {
  const P = fs.readFileSync(POS_PATH, 'utf8');
  try { execFileSync(process.execPath, ['--check', POS_PATH], { stdio: 'pipe' }); }
  catch (e) { assert(false, 'chat-staff-ui.js خطأ نحوي: ' + e.stderr.toString().split('\n')[0]); }

  assert(/onclick="ccOutfitToggle\(\)"/.test(P), 'زرار تفعيل وضع الطقم موجود');
  assert(/function ccOutfitPrevHtml\(\)\{/.test(P), 'دالة بناء خانات الطقم موجودة');
  // 🔴 3 خانات بالظبط
  assert((P.match(/ccOutFile' \+ i/g) || []).length >= 3, 'فيه ٣ خانات صور (بُنيت بالحلقة [0,1,2])');
  assert(P.indexOf("[0, 1, 2].forEach") >= 0 || P.indexOf("[0,1,2].forEach") >= 0 || /\[0, 1, 2\]\.map/.test(P),
    'الخانات مبنية من مصفوفة [0,1,2] — ٣ بالظبط');
  assert(P.indexOf("'ccOutBc' + i") >= 0, 'حقل الباركود مبني بنفس نمط الحلقة');
  // 🔴 ضغط أصغر من الصورة الواحدة عشان ٣ صور متعديش سقف مستند Firestore
  const pickFn = (P.match(/function ccOutfitPick\(i, e\)\{[\s\S]*?\n  \}/) || [''])[0];
  assert(/ccCompressImage\(f,\s*700,\s*280000/.test(pickFn), '🔴 ضغط خانات الطقم أصغر (700px/280KB) من الصورة الواحدة');
  const singleFn = (P.match(/function onPickImage\(e\)\{[\s\S]*?\n  \}/) || [''])[0];
  assert(/ccCompressImage\(f,\s*900,\s*650000/.test(singleFn), 'الصورة الواحدة العادية لسه بنفس الحجم القديم (900px/650KB)');

  const sendFn = (P.match(/function ccOutfitSend\(\)\{[\s\S]*?\n  \}/) || [''])[0];
  assert(sendFn.length > 0, 'دالة إرسال الطقم موجودة');
  assert(/outfit:\s*true/.test(sendFn), 'الرسالة معلّمة outfit:true');
  assert(/products:\s*products/.test(sendFn), 'المنتجات بتترسل كمصفوفة products');
  // 🔴 طرحة بصورة من غير باركود صح بترفض الإرسال كله (مش بتتبعت ناقصة)
  assert(/if\(!it\.barcode\)\{ toast\(/.test(sendFn), 'طرحة بصورة من غير باركود صح بتوقف الإرسال');
  assert(/if\(!products\.length\)\{ toast\(/.test(sendFn), 'صفر طرح مختارة بيترفض');

  // 🔴 صفر تداخل مع CST.imgData (مسار الصورة الواحدة العادي)
  assert(sendFn.indexOf('CST.imgData') === -1, 'ccOutfitSend مش بيلمس CST.imgData — مسار منفصل تمامًا');
}

// ================= ٢+٣) العميلة =================
function checkCustomerApp(brand, filePath, tryonOpenPattern) {
  if (!fs.existsSync(filePath)) { assert(false, filePath + ' لازم يكون موجود'); return; }
  const H = fs.readFileSync(filePath, 'utf8');

  assert(H.indexOf('اختاري طرحة لطقمك') >= 0, brand + ': زرار الطقم موجود');

  // رسم الكروت — بيتفعّل بس لو outfit:true
  assert(/m\.outfit === true && Array\.isArray\(m\.products\)/.test(H), brand + ': الكروت بترسم بس لو outfit:true');
  assert(/\.slice\(0, 3\)/.test(H), brand + ': مقصوصة على ٣ بالظبط حتى لو جالها أكتر');

  // زرين لكل كارت
  assert(/جربيها عليكي/.test(H), brand + ': زرار التجربة موجود في الكارت');
  assert(/اطلبيها/.test(H), brand + ': زرار الطلب المباشر موجود في الكارت');

  // اطلبيها = tryonAddToCart مباشرة (مفيش فتح تجربة الأول)
  const buyFnMatch = H.match(new RegExp('function (cw)?OutfitBuy\\(msgId, idx\\)\\{[\\s\\S]*?\\n  \\}', 'i'))
    || H.match(/function chatOutfitBuy\(msgId, idx\)\{[\s\S]*?\n\}/);
  assert(buyFnMatch, brand + ': دالة الطلب المباشر موجودة');
  if (buyFnMatch) {
    assert(/tryonAddToCart\(it\.barcode, it\.productImg \|\| it\.img\)/.test(buyFnMatch[0]), brand + ': اطلبيها بتنادي tryonAddToCart ومعاها صورة المنتج');
    assert(buyFnMatch[0].indexOf('photo.html') === -1, brand + ': اطلبيها ما بتفتحش صفحة التجربة خالص');
  }

  // جربيها عليكي = بتفتح التجربة بنفس صورة/باركود المنتج المحدد
  assert(tryonOpenPattern.test(H), brand + ': جربيها عليكي بتفتح photo.html بالبراند الصح');
}

checkCustomerApp('loyalty', path.join(ROOT, 'loyalty', 'index.html'), /photo\.html\?brand=loyalty/);
checkCustomerApp('glow', path.join(ROOT, 'glow', 'index.html'), /photo\.html\?brand=glow/);
checkCustomerApp('site', path.join(ROOT, 'index.html'), /photo\.html\?brand=site/);

// ================= ٥) تعقيم كروت الطقم =================
[['loyalty', path.join(ROOT, 'loyalty', 'index.html')], ['glow', path.join(ROOT, 'glow', 'index.html')],
 ['site', path.join(ROOT, 'index.html')]].forEach(function (t) {
  const H = fs.readFileSync(t[1], 'utf8');
  const m = H.match(/outfit-(card|wrap)[\s\S]{0,900}/);
  // 🔴 اسم المنتج بيتعقّم قبل الطباعة (esc)
  assert(/esc\(p\.name/.test(H), t[0] + ': اسم المنتج في الكارت بيتعقّم');
});

// ================= ٤) تذكّر صورة الوش =================
const PC_PATH = path.join(ROOT, 'tryon', 'photo-core.js');
const PC = require(PC_PATH);
assertEq(PC.FACE_KEY, 'echarpe_tryon_face', 'مفتاح صورة الوش المحفوظة');

function fakeStore() {
  const m = {};
  return {
    getItem: k => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = v; },
    removeItem: k => { delete m[k]; },
    _dump: () => m
  };
}
const img1 = 'data:image/jpeg;base64,AAAA';
let st = fakeStore();
assertEq(PC.readFace(st), '', 'فاضي في الأول');
PC.saveFace(st, img1);
assertEq(PC.readFace(st), img1, 'بتتحفظ وترجع زي ما هي');
PC.saveFace(st, 'not-an-image');
assertEq(PC.readFace(st), img1, 'صورة غير صالحة متحفظش (القديمة تفضل)');
PC.clearFace(st);
assertEq(PC.readFace(st), '', 'المسح بيشتغل');
// مقاومة أخطاء التخزين (خاص/سعة) — مبيرميش
let threw = false;
try { PC.saveFace({ setItem: () => { throw new Error('quota'); } }, img1); } catch (e) { threw = true; }
assert(!threw, 'فشل التخزين ما بيوقفش الصفحة (catch جوّه)');

const PH = fs.readFileSync(path.join(ROOT, 'tryon', 'photo.html'), 'utf8');
// 🔴 localStorage مش sessionStorage — السبب مكتوب في الكومنت والكود
assert(/PC\.readFace\(window\.localStorage\)/.test(PH), 'قراءة الوش من localStorage (مش sessionStorage)');
assert(/PC\.saveFace\(window\.localStorage, lastCustomer\)/.test(PH), 'الحفظ بعد نجاح التوليد من localStorage');
assert(/if\(productImg && rememberedFace\)\{\s*generate\(rememberedFace\);/.test(PH),
  '🔴 بدء تلقائي بالصورة المحفوظة — بضغطة واحدة للطرحة التانية');
assert(/id="changeFaceBtn"/.test(PH), 'زرار «غيّري صورتك» موجود');
assert(/PC\.clearFace\(window\.localStorage\)/.test(PH), 'غيّري صورتك بيمسح الذاكرة فعليًا');
assert(/rememberedFace = ""/.test(PH), 'غيّري صورتك بيصفّر متغيّر الجلسة كمان (مش localStorage بس)');

// ================= ٦) رفع الكاش =================
function read(rel) { const f = path.join(ROOT, rel); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; }
function verAtLeast(str, re, min) {
  const n = Number((str.match(re) || [])[1]);
  return Number.isFinite(n) && n >= min;
}
assert(verAtLeast(read('pos/sw.js'), /store-apps-shell-v(\d+)/, 321), 'كاش POS ≥ v321');
assert(verAtLeast(read('loyalty/sw.js'), /echarpe-loyalty-v(\d+)/, 59), 'كاش loyalty ≥ v59');
assert(verAtLeast(read('glow/sw.js'), /glow-loyalty-v(\d+)/, 53), 'كاش glow ≥ v53');
assert(verAtLeast(read('tryon/sw.js'), /echarpe-tryon-v(\d+)/, 40), 'كاش tryon ≥ v40');
assert(verAtLeast(read('tryon/tryon-app.js'), /TRYON_VER = 'v(\d+)'/, 40), 'TRYON_VER ≥ v40 (تناسق)');

// ================= ٧) الفحص النحوي الفعلي =================
syntaxCheckBlocks(fs.readFileSync(path.join(ROOT, 'loyalty', 'index.html'), 'utf8'), 'loyalty');
syntaxCheckBlocks(fs.readFileSync(path.join(ROOT, 'glow', 'index.html'), 'utf8'), 'glow');
syntaxCheckBlocks(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), 'site');
syntaxCheckBlocks(fs.readFileSync(path.join(ROOT, 'tryon', 'photo.html'), 'utf8'), 'photo.html');
try { execFileSync(process.execPath, ['--check', POS_PATH], { stdio: 'pipe' }); }
catch (e) { assert(false, 'chat-staff-ui.js فحص نحوي أخير: ' + e.stderr.toString().split('\n')[0]); }
