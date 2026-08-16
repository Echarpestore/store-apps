// ============================================================
// 🧪 test-site-shop.js — قسم «اطلبي أونلاين» على الموقع الرئيسي (ضيف)
// ------------------------------------------------------------
// كل فحص سلبي: لو رجّعت الإصلاح لازم يقع.
//   ١) البنية: SDKs (functions + orders-core) متحمّلة، القسم موجود
//      ومقفول صح، حاوية التوست موجودة
//   ٢) نفس مصادر البيانات بالظبط اللي التطبيق بيقراها (صفر مستندات جديدة)
//   ٣) الإرسال: source:'web'، brand:'echarpe'، اسم الدالة الصح،
//      app('site') مش app('loyalty')
//   ٤) 🔴 مفيش فولباك كتابة مباشرة (فرق مقصود عن التطبيق)
//   ٥) الاسم/التليفون بيتحطوا من غير renderCart (درس فوكس الكيبورد)
//   ٦) التحقق قبل الإرسال: orderValidateContact + سلة فاضية + فرع/محافظة
//   ٧) تعقيم: esc() موجودة ومستخدمة في كل مكان بيطبع بيانات من السيرفر
//   ٨) الفحص النحوي لكل الـ<script> بلوكات (اتفحص فعليًا مش افتراض)
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const P = path.join(ROOT, 'index.html');

if (!fs.existsSync(P)) {
  assert(false, 'index.html (الموقع الرئيسي) لازم يكون موجود');
} else {

const H = fs.readFileSync(P, 'utf8');

// ---------- ١) البنية ----------
assert(H.indexOf('firebase-functions-compat.js') >= 0, 'Functions SDK متحمّل (مطلوب لنداء onlineOrderPlace)');
assert(H.indexOf('src="pos/orders-core.js"') >= 0, 'orders-core.js متحمّل (مسار من الجذر بلا ../)');
assert(H.indexOf('id="wsShop"') >= 0, 'قسم المتجر موجود');
assert(H.indexOf('id="wsGrid"') >= 0 && H.indexOf('id="wsCartWrap"') >= 0, 'حاويات الشبكة والسلة موجودة');
assert(H.indexOf('id="wsToastBox"') >= 0, 'حاوية التوست موجودة');
// القسم لازم يكون مقفول (فحص توازن تقريبي: نفس عدد <section> و</section>)
assertEq((H.match(/<section\b/g) || []).length, (H.match(/<\/section>/g) || []).length, 'كل section له إغلاق');

// ---------- ٢) نفس مصادر البيانات بالظبط ----------
assert(/SHOP_DOC = 'online_shop_echarpe';/.test(H), 'نفس مستند الكتالوج اللي التطبيق بيقراه');
assert(/SHOP_CFG_DOC = 'online_shop_echarpe_cfg';/.test(H), 'نفس مستند إعدادات الشحن');
assert(/COL_INVENTORY = 'pos_test_inventory';/.test(H), 'نفس كوليكشن المخزون للتحقق وقت الإرسال');
assert(/CATALOG_BRAND = 'echarpe';/.test(H), 'براند echarpe بس (الموقع مش بيغطي Glow)');

// ---------- ٣) الإرسال ----------
const submitFn = (H.match(/function wsSubmit\(\)\{[\s\S]*?\n  \}\n  window\.wsSubmit/) || [''])[0];
assert(/source:\s*'web'/.test(submitFn), "🔴 source:'web' (مش app ولا glow) — كده بس onlineOrderPlace بيميّزه");
assert(/brand:\s*CATALOG_BRAND/.test(submitFn), 'brand بيتبعت echarpe');
assert(/httpsCallable\('onlineOrderPlace'\)/.test(submitFn), 'بينادي onlineOrderPlace (نفس دالة التطبيق، صفر تكرار منطق)');
assert(/firebase\.app\('site'\)/.test(submitFn), "بيستخدم firebase app('site') — التطبيق المعزول بتاع الموقع");
assert(submitFn.indexOf("firebase.app('loyalty')") === -1, 'مش بيستخدم تطبيق loyalty الخطأ');

// ---------- ٤) 🔴 مفيش فولباك كتابة مباشرة ----------
assert(!/db\.collection\(ORD_COL\)\.add/.test(submitFn), 'مفيش كتابة مباشرة فولباك (قرار مقصود لغياب حساب عميلة)');
assert(!/\.add\(doc\)/.test(submitFn), 'مفيش .add(doc) فولباك في مسار الإرسال');

// ---------- ٥) فوكس الكيبورد (درس shopInfoSet) ----------
const infoSetFn = (H.match(/function wsInfoSet\(k, v\)\{[^}]*\}/) || [''])[0];
assert(infoSetFn.length > 0, 'wsInfoSet موجودة');
assert(infoSetFn.indexOf('renderCart') === -1 && infoSetFn.indexOf('renderShopGrid') === -1,
  '🔴 wsInfoSet مبيعملش renderCart (وإلا الكيبورد يقفل مع كل حرف على الموبايل)');
assert(/oninput=\\"wsInfoSet\(\\'name\\'|oninput="wsInfoSet\(\\'name\\'/.test(H) || H.indexOf("wsInfoSet(\\'name\\'") >= 0,
  'حقل الاسم بيستخدم wsInfoSet (مش إعادة رسم فورية)');
assert(H.indexOf("wsInfoSet(\\'phone\\'") >= 0, 'حقل التليفون بيستخدم wsInfoSet');
assert(H.indexOf("wsInfoSet(\\'address\\'") >= 0, 'حقل العنوان بيستخدم wsInfoSet');

// ---------- ٦) التحقق قبل الإرسال ----------
assert(submitFn.indexOf('orderValidateContact') >= 0, 'بيتحقق من الاسم/التليفون بنفس دالة التطبيق');
assert(/lines\.length\)\{ wsToast\('السلة فاضية'/.test(submitFn) || /!lines\.length.*السلة فاضية/.test(submitFn),
  'سلة فاضية بترفض بوضوح');
assert(/wsFulfill === 'pickup' && !wsBranch/.test(submitFn), 'استلام من غير فرع مختار بيترفض');
assert(/wsFulfill === 'delivery' && !wsGov/.test(submitFn), 'شحن من غير محافظة بيترفض');

// ---------- ٧) تعقيم ----------
assert(/function esc\(s\)\{/.test(H), 'دالة esc موجودة (تعقيم النصوص من الكتالوج)');
// كل مكان بيطبع p.name/p.img/p.price لازم يكون معقّم
const gridFn = (H.match(/function renderShopGrid\(\)\{[\s\S]*?\n  \}/) || [''])[0];
assert(/esc\(p\.name/.test(gridFn) && /esc\(p\.img/.test(gridFn) && /esc\(p\.price/.test(gridFn),
  'بيانات المنتج (اسم/صورة/سعر) كلها بتتعقّم قبل الطباعة');

// ---------- ٨) الفحص النحوي الفعلي ----------
const blocks = [...H.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
assert(blocks.length >= 2, 'فيه بلوكات <script> inline (المتجر + الإعدادات الأصلية)');
const tmp = path.join(require('os').tmpdir(), 'site_shop_chk.js');
blocks.forEach((b, i) => {
  fs.writeFileSync(tmp, b);
  try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
  catch (e) { assert(false, `بلوك <script> رقم ${i} فيه خطأ نحوي: ` + e.stderr.toString().split('\n')[0]); }
});

}
