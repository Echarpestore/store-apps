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
  // 🖼️⭐ chatTryOn بيفتح الـoverlay (iframe) بدل تنقّل مباشر
  assert(H.indexOf("tryonOverlayOpen('" + brand + "')") >= 0, brand + ': chatTryOn بيفتح الـoverlay للبراند الصح');
  assert(H.indexOf("photo.html?brand=' + brand + '&embed=1'") >= 0,
    brand + ': tryonOverlayOpen بيبني رابط الـiframe الصح');
  // 🔴 مبقاش بيفتح الوضع الحي مباشرة من الشات
  assert(H.indexOf("'../tryon/?imgkey=1'") === -1, brand + ': الشات مبقاش بيفتح الوضع الحي مباشرة');
  // التليفون بيتبعت لسقف التكلفة
  assert(H.indexOf('echarpe_tryon_phone') >= 0, brand + ': التليفون بيتحفظ للتجربة');
  // اللابل الجديد — 🔴 بقى SVG + نص (مفيش إيموجي، مفيش "بنفسك")
  assert(H.indexOf('class="m-try"') >= 0, brand + ': زرار "جرّبيها" موجود');
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
assert(/photo-core\.js\?v=61/.test(fs.readFileSync(path.join(ROOT, 'tryon', 'photo.html'), 'utf8')),
  '🔴 photo-core عليه cache-bust v61 عشان إصلاح قص البندانة يوصل فورًا');
assert(fs.readFileSync(path.join(ROOT, 'tryon', 'photo.html'), 'utf8').indexOf('dataUrl === lastGridImage') >= 0,
  '🔴 ممنوع عرض صورة الـgrid الأصلية لو crop البندانة فشل');


/* ============================================================
   🔴🔴🔴🔴⭐ بصمة صورة العميلة (faceSig) — لازم تفرّق صورتين
   مختلفتين حتى لو ليهم نفس الطول ونفس البداية
   ------------------------------------------------------------
   الباج الحقيقي اللي ظهر في الاستخدام: "على صورة جديدة بيجيب
   الصورة اللي اتولدت قبلها". السبب: البصمة القديمة كانت بتاخد
   ٤ عيّنات × ١٢ حرف من أماكن نسبية ثابتة + الطول — وصورتين من نفس
   الموبايل في نفس الإضاءة بيطلعوا بنفس الطول تقريبًا ونفس المقاطع
   دي، فالبصمة تتطابق والكاش يرجّع نتيجة صورة قديمة لصورة جديدة.
   ============================================================ */
(function(){
  const path = require('path');
  const PC = require(path.join(__dirname, '..', 'tryon', 'photo-core.js'));
  const base = 'data:image/jpeg;base64,';

  // 🔴🔴🔴🔴⭐ الحالة اللي كانت بتفشل بالظبط: نفس الطول، نفس البداية،
  // نفس المقاطع عند ٢٠٪/٤٠٪/٦٠٪/٨٠٪ تقريبًا — بس محتوى مختلف
  const a = base + '/9j/4AAQSkZJRg' + 'A'.repeat(500) + 'XYZ' + 'B'.repeat(500);
  const b = base + '/9j/4AAQSkZJRg' + 'A'.repeat(500) + 'QRS' + 'B'.repeat(500);
  assert(a.length === b.length, '(تمهيد) الصورتين بنفس الطول بالظبط');
  assert(PC.faceSig(a) !== PC.faceSig(b),
    '🔴🔴🔴🔴⭐ صورتين مختلفتين بنفس الطول والبداية → بصمتين مختلفتين (كان الباج: نفس البصمة)');

  // اختلاف بحرف واحد جوه الصورة لازم يتمسك
  const c = a.slice(0, 700) + 'Z' + a.slice(701);
  assert(PC.faceSig(a) !== PC.faceSig(c),
    '⭐ اختلاف بحرف واحد في النص بيغيّر البصمة');

  // ثبات: نفس الصورة بالظبط لازم تدي نفس البصمة دايمًا (وإلا الكاش ميشتغلش خالص)
  assert(PC.faceSig(a) === PC.faceSig(a), 'نفس الصورة بتدي نفس البصمة (ثبات)');
  assert(PC.faceSig('') === '', 'صورة فاضية → بصمة فاضية');

  // 🔒 وعلى مستوى الكاش نفسه: صورة جديدة مالهاش نتيجة محفوظة
  const d = {};
  const st = { getItem:(k)=> d[k]===undefined?null:d[k], setItem:(k,v)=>{d[k]=v;}, removeItem:(k)=>{delete d[k];} };
  PC.saveResult(st, 'prod1', a, base + 'RESULT_FOR_A');
  assert(PC.readResult(st, 'prod1', a) !== '', 'نفس الصورة بترجّع نتيجتها المحفوظة');
  assert(PC.readResult(st, 'prod1', b) === '',
    '🔴🔴🔴🔴⭐ صورة جديدة (نفس الطول) **مالهاش** نتيجة — بتتولّد من جديد زي ما المفروض');
})();

/* ============================================================
   💾 كاش النتايج — نفس التركيبة متتولّدش مرتين
   ------------------------------------------------------------
   السبب: العميلة بتلف وترجع وهي بتقارن، وكل رجعة كانت توليد
   جديد بتكلفة. الكاش بيخلي الرجعة فورية ومجانية.
   🔒 على جهازها هي بس — الوعد إن صورتها متتخزّنش عندنا لازم يفضل صح.
   ============================================================ */
(function(){
  const path = require('path');
  const PC = require(path.join(__dirname, '..', 'tryon', 'photo-core.js'));
  const img = (n) => 'data:image/png;base64,' + 'A'.repeat(n);

  function store(limit){
    const d = {};
    return { getItem:(k)=> d[k]===undefined?null:d[k],
             setItem:(k,v)=>{ if(limit && v.length>limit){ const e=new Error('q'); e.name='QuotaExceededError'; throw e; } d[k]=v; },
             removeItem:(k)=>{ delete d[k]; } };
  }

  const face = img(400), face2 = img(500);

  // ---------- الأساسي ----------
  let s = store();
  assert(PC.readResult(s, 'p1', face) === '', '💾 كاش فاضي بيرجّع فاضي');
  assert(PC.saveResult(s, 'p1', face, img(200)) === true, 'والحفظ بينجح');
  assert(PC.readResult(s, 'p1', face) !== '', '✅ ونفس التركيبة بترجع من الكاش');

  // ---------- العزل: منتج مختلف أو وش مختلف = نتيجة مختلفة ----------
  assert(PC.readResult(s, 'p2', face) === '',
    '🔑 منتج تاني **مش** بياخد نتيجة منتج تاني');
  assert(PC.readResult(s, 'p1', face2) === '',
    '🔑⭐ صورة عميلة مختلفة **مش** بتاخد نتيجة محفوظة — ده كان هيعرض وش على وش تاني');

  // ---------- الحد ----------
  s = store();
  for(let i = 0; i < PC.CACHE_MAX + 3; i++) PC.saveResult(s, 'x'+i, face, img(100));
  const arr = JSON.parse(s.getItem(PC.CACHE_KEY));
  assert(arr.length === PC.CACHE_MAX,
    '📦 عدد المحفوظ مش بيعدّي الحد (' + PC.CACHE_MAX + ')');
  assert(PC.readResult(s, 'x0', face) === '', 'والأقدم بيترمي');
  assert(PC.readResult(s, 'x' + (PC.CACHE_MAX + 2), face) !== '', 'والأحدث بيفضل');

  // ---------- 🔴⭐ ميزانية البايت — صور كبيرة (شبكة ألوان) بترمي أبكر من عدّها ----------
  // ده الإصلاح اللي كان بيحل مشكلة "بيولّد من جديد" لما العميلة تلف
  // بين منتجات كتير — الحد القديم كان عدد ثابت (٦) مش حجم فعلي.
  s = store();
  const bigImg = img(400000); // ~٤٠٠ ألف بايت للصورة الواحدة (زي صورة شبكة حقيقية)
  for(let i = 0; i < 15; i++) PC.saveResult(s, 'big'+i, face, bigImg);
  const bigArr = JSON.parse(s.getItem(PC.CACHE_KEY));
  let totalBytes = 0;
  bigArr.forEach(e => { totalBytes += Math.floor(String(e.v).length * 3/4); });
  assert(bigArr.length < 15,
    '🔴⭐ صور كبيرة بترمي أبكر من ١٥ (مش بتستنى العدد يوصل للحد)');
  assert(totalBytes <= PC.CACHE_BYTES_BUDGET * 1.05,
    '⭐ إجمالي البايت متلزّمش بالميزانية تقريبًا (' + PC.CACHE_BYTES_BUDGET + ')');
  // صور صغيرة (زي القديم) لسه بتاخد أكتر — الميزانية مش بتضيّق من غير داعي
  s = store();
  const smallImg = img(200);
  for(let i = 0; i < 15; i++) PC.saveResult(s, 'sm'+i, face, smallImg);
  const smallArr = JSON.parse(s.getItem(PC.CACHE_KEY));
  assert(smallArr.length > bigArr.length,
    '⭐ صور صغيرة بتفضل عدد أكبر جوه نفس الميزانية (مش سقف ثابت للعدد)');

  // ---------- التخزين اتملى ----------
  // 🔴 الحالة دي كانت هتخلي الحفظ يفشل بصمت للأبد بعد ٣-٤ صور
  s = store(900);
  let lastOk = false;
  for(let i = 0; i < 5; i++) lastOk = PC.saveResult(s, 'q'+i, face, img(300));
  assert(lastOk === true, '💾⭐ التخزين اتملى → بيرمي الأقدم ويحاول تاني مش بيفشل');
  assert(PC.readResult(s, 'q4', face) !== '', 'وآخر نتيجة بتتحفظ فعلًا');

  // ---------- تخزين مرفوض (تصفح خاص) ----------
  const blocked = { getItem(){ throw new Error('x'); },
                    setItem(){ throw new Error('x'); }, removeItem(){} };
  assert(PC.saveResult(blocked, 'p', face, img(10)) === false,
    '🕵️ تصفح خاص: الحفظ بيرجّع false من غير ما يرمي');
  assert(PC.readResult(blocked, 'p', face) === '',
    'والقراءة بترجّع فاضي — التجربة بتشتغل عادي من غير كاش');

  // ---------- مدخلات بايظة ----------
  s = store();
  assert(PC.saveResult(s, 'p', face, 'javascript:alert(1)') === false,
    '🔒 حاجة مش data:image متتحفظش');
  assert(PC.saveResult(s, '', face, img(10)) === false, 'ومن غير منتج متتحفظش');
  assert(PC.readResult(s, 'p', '') === '', 'ومن غير صورة عميلة مفيش قراءة');
})();

/* 💾 الربط في photo.html — الكاش لازم يتفحص **قبل** النداء
   (المسار العادي من غير بندانة، والمسار مع البندانة نفس المنطق) */
(function(){
  const fs = require('fs'), path = require('path');
  const H = fs.readFileSync(path.join(__dirname, '..', 'tryon', 'photo.html'), 'utf8');
  const fn = H.slice(H.indexOf('function generate('), H.indexOf('function fail('));

  const iHit  = fn.indexOf('PC.readResult');
  const iCall = fn.indexOf('httpsCallable');
  assert(iHit > -1, '💾 photo.html بيفحص الكاش');
  assert(iHit < iCall,
    '⭐ والفحص **قبل** النداء — بعده مالوش أي لازمة، التكلفة بتكون اتدفعت');
  assert(/if\(hit\)\{\s*succeed\(hit,\s*true\);\s*return;\s*\}/.test(fn),
    'وعند الإصابة بيعرض ويرجع من غير ما ينادي');
  assert(fn.indexOf('PC.saveResult') > -1, 'والنتيجة الجديدة بتتحفظ');
  // 🔴 مايتحفظش اللي جاي من الكاش — ده كان هيقلّب الترتيب كل عرض
  assert(/if\(!fromCache && lastCustomer\)/.test(fn) ||
         H.indexOf('if(!fromCache && lastCustomer)') > -1,
    '🔴 واللي جاي من الكاش **مش** بيتعاد حفظه (وإلا الترتيب بيتقلب)');
})();

/* ============================================================
   🧢 تجربة البندانة — وضع الشبكة (٥) منطق نقي + (٦) الربط في photo.html
   + (٧) الربط في الشات (loyalty/glow) + (٨) تسجيل الألوان في الكاش
   ============================================================ */

// ---------- ٥) photo-core: تنضيف وقراءة ألوان البندانة ----------
(function () {
  const PC = require(CORE);

  // نفس تنضيف السيرفر بالظبط — نصوص، بحد أقصى ٣ (قرار معماري)، بحروف بس
  assertEq(PC.MAX_BANDANA_COLORS, 3, '🔴🔴🔴🔴⭐ الحد الأقصى ٣ ألوان (قرار معماري نهائي)');
  assertEq(PC.parseBandanaColors(['off-white', 'black', 'navy']),
    ['off-white', 'black', 'navy'], 'تنضيف قايمة سليمة (٣ بالظبط) بيسيبها زي ما هي');
  assertEq(PC.parseBandanaColors(['a', 'ok!!', '  navy blue  ']),
    ['ok', 'navy blue'], '🔴 حرف واحد بيترفض + المحارف الغريبة بتتشال');
  assertEq(PC.parseBandanaColors(['1', '2', '3']), [],
    'أرقام بس (مفيهاش حروف) بترجع فاضية بعد التنضيف');
  assertEq(PC.parseBandanaColors('["red","blue","green","navy","beige","black","white"]').length, 3,
    '🔴🔴🔴🔴⭐ سقف ٣ ألوان حتى لو الأصل أكتر (كان ٦، اتقلل لقرار معماري)');
  assertEq(PC.parseBandanaColors('not json'), [], 'JSON بايظ → فاضي مش استثناء');
  assertEq(PC.parseBandanaColors(null), [], 'قيمة فاضية → فاضي');

  // isGridMode — ٢ فأكتر بس
  assert(PC.isGridMode(['a', 'b']) === true, '٢ لون = وضع شبكة');
  assert(PC.isGridMode(['a']) === false, 'لون واحد = مش شبكة');
  assert(PC.isGridMode([]) === false, 'صفر لون = مش شبكة');

  // readBandanaColors — من sessionStorage (JSON string)
  const s1 = { getItem: (k) => k === PC.SS_KEYS.bandanaColors ? JSON.stringify(['off-white', 'black']) : null };
  assertEq(PC.readBandanaColors(s1), ['off-white', 'black'], 'بيقرا الألوان من sessionStorage');
  assertEq(PC.readBandanaColors({ getItem: () => null }), [], 'مفيش قيمة → فاضي');
  assertEq(PC.readBandanaColors({ getItem: () => { throw new Error('x'); } }), [],
    'تخزين مرفوض → فاضي مش استثناء');

  // readBandanaPid
  const s2 = { getItem: (k) => k === PC.SS_KEYS.bandanaPid ? 'BND123' : null };
  assertEq(PC.readBandanaPid(s2), 'BND123', 'بيقرا باركود البندانة');
  assertEq(PC.readBandanaPid({ getItem: () => null }), '', 'مفيش باركود → فاضي');

  // colorSwatchHex — أفضل محاولة، مايرميش على اسم غريب
  assert(/^#[0-9a-f]{6}$/i.test(PC.colorSwatchHex('black')), 'لون معروف بيرجع hex صالح');
  assert(/^#[0-9a-f]{6}$/i.test(PC.colorSwatchHex('لون غريب تمامًا')), '🔴 اسم غير معروف لسه بيرجع hex صالح (فولباك)');

  // resultActions — زرار البندانة بيظهر بس مع بندانة باركود
  assert(PC.resultActions('12', 'BND1').addBandanaToCart === true, 'مع bandanaPid: زر سلة البندانة يظهر');
  assert(PC.resultActions('12').addBandanaToCart === false, 'من غير bandanaPid: زر سلة البندانة مختفي');
  assert(PC.resultActions('12', 'BND1').addToCart === true, 'زر سلة الطرحة لسه شغال زي ما هو');
})();

// ---------- ٦) photo-core: الكاش بيفرّق بين تركيبات ألوان مختلفة ----------
(function () {
  const PC = require(CORE);
  const img = (n) => 'data:image/png;base64,' + 'A'.repeat(n);
  function store() {
    const d = {};
    return { getItem: (k) => d[k] === undefined ? null : d[k], setItem: (k, v) => { d[k] = v; }, removeItem: (k) => { delete d[k]; } };
  }
  const face = img(400);
  let s = store();

  assert(PC.saveResult(s, 'p1', face, img(200)) === true, '💾 حفظ طرحة عادية (من غير ألوان) بينجح');
  assert(PC.readResult(s, 'p1', face) !== '', 'وبيترجع من غير ألوان زي ما اتحفظ');
  assert(PC.readResult(s, 'p1', face, ['black', 'navy']) === '',
    '🔴⭐ نفس المنتج بس بطلب ألوان مختلف عن اللي اتحفظ بيه → مفيش تطابق (مفتاح مختلف)');

  assert(PC.saveResult(s, 'p1', face, img(300), ['black', 'navy']) === true, '💾 حفظ نسخة تانية بألوان');
  assert(PC.readResult(s, 'p1', face, ['black', 'navy']) !== '', 'ونفس الألوان بترجع نتيجتها');
  assert(PC.readResult(s, 'p1', face, ['navy', 'black']) === '',
    '🔴 ترتيب الألوان بيفرق — لأن الترتيب هو اللي بيربط الخانة باللون');
  assert(PC.readResult(s, 'p1', face) !== '', 'والنسخة من غير ألوان لسه موجودة (مستقلة عن نسخة الألوان)');
})();

/* ============================================================
   📐 التقسيم الرياضي للشبكة + تصحيح الاتجاه المعكوس
   ------------------------------------------------------------
   🔴🔴⭐ درس من تجربة حقيقية (شكل بشع فعليًا): الموديل طلبنا منه
   ٢ عمود × ١ صف (جنب بعض) ورجّع ١ عمود × ٢ صف (فوق بعض) — القص
   بافتراض عمياني كان بيقطع خانة نص فوقاني + نص تحتاني في كروب واحد.
   ============================================================ */
(function () {
  const PC = require(CORE);

  // computeGridLayout — لازم يطابق حسبة hijabTryOn.js بالظبط
  assertEq(PC.computeGridLayout(2), { cols: 2, rows: 1 }, '٢ لون → ٢×١');
  assertEq(PC.computeGridLayout(4), { cols: 2, rows: 2 }, '٤ ألوان → ٢×٢');
  assertEq(PC.computeGridLayout(6), { cols: 3, rows: 2 }, '٦ ألوان → ٣×٢');

  // 🔴🔴⭐ resolveGridOrientation — نفس حالة السكرين شوت بالظبط
  assertEq(PC.resolveGridOrientation(600, 1400, 2, 1), { cols: 1, rows: 2 },
    '🔴🔴⭐ متوقع ٢×١ (عريض) لكن الصورة طولية فعليًا → بيبدّل لـ١×٢');
  assertEq(PC.resolveGridOrientation(1400, 600, 2, 1), { cols: 2, rows: 1 },
    '⭐ متوقع ٢×١ والصورة فعلًا عريضة → يسيبها زي ما هي (صح أصلًا)');
  assertEq(PC.resolveGridOrientation(700, 1000, 2, 2), { cols: 2, rows: 2 },
    'شبكة مربّعة (٢×٢) — مفيش اتجاه يتلخبط، مفيش تبديل أبدًا');
  assertEq(PC.resolveGridOrientation(750, 1000, 3, 2), { cols: 2, rows: 3 },
    '⭐ نفس المبدأ بيشتغل لأي شبكة مش مربّعة (٣×٢ ↔ ٢×٣)');

  // sliceGridProportional — القص الفعلي لازم يستخدم الاتجاه المصحّح
  const cellsFixed = PC.sliceGridProportional(600, 1400, 2, 1, 2);
  assertEq(cellsFixed.length, 2, 'خانتين لـ٢ لون زي المتوقع');
  assert(cellsFixed[0].row === 0 && cellsFixed[1].row === 1,
    '🔴🔴⭐ بعد التصحيح: الخانتين فوق بعض (row 0/1) مش جنب بعض (نفس الصورة الطولية الفعلية)');
  assert(cellsFixed[0].h < 1400 * 0.6,
    '🔴⭐ ارتفاع الخانة نص الصورة تقريبًا (مش الصورة كاملة كأنها خانة واحدة)');

  // عدد الخانات = عدد الألوان بالظبط، وكل خانة جوه حدود الصورة
  const cells4 = PC.sliceGridProportional(1000, 1000, 2, 2, 4);
  assertEq(cells4.length, 4, '٤ خانات لـ٤ ألوان');
  cells4.forEach(function (c) {
    assert(c.x >= 0 && c.y >= 0 && c.x + c.w <= 1000 && c.y + c.h <= 1000,
      'كل خانة جوه حدود الصورة (مفيش خروج برة)');
  });
  const cells5 = PC.sliceGridProportional(900, 600, 3, 2, 5);
  assertEq(cells5.length, 5, '٥ خانات بس لـ٥ ألوان (مش ٦ حتى لو الشبكة ٣×٢)');
})();

// ---------- ٧) الربط في photo.html: وضع الشبكة + صف الألوان ----------
(function () {
  const H = fs.readFileSync(PAGE, 'utf8');

  assert(H.indexOf('PC.readBandanaColors') >= 0, 'بيقرا ألوان البندانة من sessionStorage');
  assert(H.indexOf('PC.readBandanaPid') >= 0, 'بيقرا باركود البندانة من sessionStorage');
  assert(H.indexOf('withBandana') >= 0 && H.indexOf('bandanaColors') >= 0,
    'بيبعت withBandana + bandanaColors للدالة');
  // 🔴🔴⭐ درس تالت من تجربة حقيقية: كشف الفواصل بالتباين (GridSplit) اتشال
  // خالص — كان بيرجّع خانات مقاسات مش متساوية أحيانًا، وده سبب "الصورة
  // بتتحرك" (كل لون كروب مقاس مختلف) و"لون غلط بيظهر" (حدود كشف مش دقيقة).
  // التقسيم الرياضي وحده (PC.sliceGridProportional) هو مصدر القص الوحيد
  // دلوقتي — كل الخانات نفس المقاس بالظبط، صفر حركة بصرية، ونتيجة واحدة
  // متوقعة كل مرة (مش "أحيانًا كويس أحيانًا لأ").
  assert(H.indexOf('<script src="./grid-split.js">') === -1,
    '🔴🔴⭐ سكريبت grid-split.js (كشف غير مضمون) اتشال خالص من الصفحة');
  assert(H.indexOf('GridSplit.splitGrid(') === -1 && H.indexOf('GridSplit.labelCells(') === -1,
    '🔴🔴⭐ مفيش أي نداء فعلي لـGridSplit تاني — القص رياضي مضمون بس');
  assert(H.indexOf('PC.sliceGridProportional') >= 0 && H.indexOf('PC.computeGridLayout') >= 0,
    '⭐ القص بيعتمد على التقسيم الرياضي المضمون بس');
  assert(H.indexOf('id="bandRow"') >= 0, 'عنصر صف الألوان موجود في الصفحة');
  assert(H.indexOf('id="bandCartBtn"') >= 0, 'زرار سلة البندانة موجود');
  // 🔴 فشل تحميل الصورة (نادر جدًا) لازم يسيب مسار واضح لإخفاء الصف
  assert(H.indexOf('hideBandRow') >= 0, 'فيه مسار واضح لإخفاء صف الألوان (فشل تحميل أو منتج عادي)');
  // مفيش innerHTML — نفس القاعدة العامة، الكود الجديد لازم يلتزم بيها برضه
  assert(!/\.innerHTML\s*=/.test(H), '🔒 الكود الجديد برضه ملتزم: مفيش innerHTML في الصفحة كلها');
})();

/* ============================================================
   🔴🔴🔴🔴⭐ قرار معماري نهائي: نداء واحد، حد أقصى ٣ ألوان (٤ خانات
   كحد أقصى مع "بدون بندانة") — مش طلب مستقل لكل لون
   ------------------------------------------------------------
   جرّبنا "كل لون طلبه مستقل" وكان مكلّف قوي (نداء منفصل لكل لون
   تختاره العميلة). القرار النهائي: نداء واحد يغطي "بدون بندانة" +
   لحد ٣ ألوان، مع تصحيح الاتجاه المعكوس (resolveGridOrientation)
   لو الموديل قلب الصفوف بالأعمدة. الحد الأقصى ٣ (مش أكتر) هو اللي
   بيخلي الهندسة بسيطة بما يكفي للتصحيح.
   ============================================================ */
(function () {
  const H = fs.readFileSync(PAGE, 'utf8');
  assert(H.indexOf('PC.readBandanaColors') >= 0, 'بيقرا ألوان البندانة من sessionStorage');
  assert(H.indexOf('withBandana') >= 0 && H.indexOf('bandanaColors') >= 0,
    'بيبعت withBandana + bandanaColors للدالة');
  assert(H.indexOf('bandanaColors: gridMode ? bandanaColorsRequested : undefined') >= 0,
    '🔴🔴🔴🔴⭐ نداء واحد بيبعت كل الألوان المختارة مع بعض (لحد ٣) — مش لون واحد منفصل');
  assert(H.indexOf('generateForColor') === -1 && H.indexOf('onSwatchTap') === -1,
    '🔴 مفيش أثر للتصميم القديم (طلب مستقل لكل لون) — اتلغى بقرار المالك');

  // ✂️ القص: التقسيم الرياضي + تصحيح الاتجاه، على الصورة كلها مرة واحدة
  const trySplitFn = (H.match(/function trySplitGrid\(imageDataUrl, colors\)\{[\s\S]*?\n  \}/) || [''])[0];
  assert(trySplitFn.length > 0, 'trySplitGrid موجودة');
  assert(trySplitFn.indexOf('PC.computeGridLayout') >= 0 && trySplitFn.indexOf('PC.sliceGridProportional') >= 0,
    'بتستخدم نفس أبعاد الشبكة اللي في البرومبت + التقسيم المضمون');
  assert(H.indexOf('id="bandRow"') >= 0, 'عنصر صف الألوان موجود في الصفحة');
  assert(H.indexOf('id="bandCartBtn"') >= 0, 'زرار سلة البندانة موجود');
  assert(H.indexOf('hideBandRow') >= 0, 'فيه مسار واضح لإخفاء صف الألوان (فشل تحميل أو منتج عادي)');
  assert(!/\.innerHTML\s*=/.test(H), '🔒 الكود الجديد برضه ملتزم: مفيش innerHTML في الصفحة كلها');

  // 🔴 الافتراضي المعروض أول ما النتيجة تظهر: أول لون حقيقي، مش "بدون بندانة"
  const renderFn = (H.match(/function renderBandRow\(labeled, imgEl\)\{[\s\S]*?\n  \}/) || [''])[0];
  assert(renderFn.indexOf("e.label !== \"none\"") >= 0,
    '🔴 الافتراضي أول لون حقيقي (المنتج المعروض) مش غيابه');
})();

// ---------- ٨) الربط في الشات (loyalty/glow): إرسال ألوان البندانة ----------
[['loyalty', LOY], ['glow', GLW]].forEach(function (pair) {
  const brand = pair[0], p = pair[1];
  const H = fs.readFileSync(p, 'utf8');
  assert(H.indexOf('chatBandanaColors') >= 0, brand + ': متغيّر ألوان البندانة موجود');
  assert(H.indexOf('chatBandanaPid') >= 0, brand + ': متغيّر باركود البندانة موجود');
  assert(H.indexOf('echarpe_tryon_bandana_colors') >= 0, brand + ': chatTryOn بيبعت الألوان لصفحة التجربة');
  assert(H.indexOf('echarpe_tryon_bandana_pid') >= 0, brand + ': chatTryOn بيبعت باركود البندانة');
  // 🔴🔴🔴🔴⭐ تنضيف الألوان في الشات لازم يطابق حدود السيرفر (الحد الأقصى ٣ — قرار معماري نهائي)
  assert(/slice\(0,\s*3\)/.test(H.slice(H.indexOf('chatBandanaColors[m.id]') - 400, H.indexOf('chatBandanaColors[m.id]') + 100)),
    brand + ': تنضيف الألوان في رسالة الشات بسقف ٣');
  // tryonAddToCart بقى بياخد note ويضيفه للملاحظات
  const fnStart = H.indexOf('function tryonAddToCart(');
  const fnBody = H.slice(fnStart, H.indexOf('window.tryonAddToCart = tryonAddToCart;'));
  assert(/tryonAddToCart\(barcode,\s*imgFallback,\s*note\)/.test(fnBody), brand + ': tryonAddToCart بياخد note');
  assert(fnBody.indexOf('_shopInfo.notes') >= 0, brand + ': اللون بيتضاف لملاحظات الأوردر');
  // فولباك addcart بقى بيقرا note كمان
  assert(H.indexOf("/[?&]note=([^&]+)/") >= 0, brand + ': فولباك addcart بيقرا اللون من الرابط');
});

/* ============================================================
   💅 تصميم شاشة النتيجة الجديد — كارت بشارات + صف أيقونات
   (بديل الأزرار المكدّسة القديمة اللي كانت محتاجة سكرول)
   ============================================================ */
(function () {
  const H = fs.readFileSync(PAGE, 'utf8');
  assert(H.indexOf('class="resultCard"') >= 0, 'كارت النتيجة الجديد موجود');
  // 🔴🔴⭐ شارة اللون العائمة فوق الصورة اتشالت خالص — شكوى حقيقية:
  // "لون البندانه فوق مزعج ع الصورة". صف الدواير تحت بيوضّح اللون
  // المختار (حالة "on") من غير ما يتراكب على الصورة نفسها.
  assert(H.indexOf('id="colorBadge"') === -1, '🔴🔴⭐ شارة اللون العائمة اتشالت خالص');
  assert(H.indexOf('class="imgBadge"') === -1, '🔴 مفيش أثر لكلاس الشارة القديم برضه');
  // 🔴 عدّاد "١/٢" اتشال عمدًا — كان بيلخبط من غير سياق (شكوى حقيقية).
  //    صف الدواير تحت بيوضّح العدد/المكان بصريًا وكفاية.
  assert(H.indexOf('id="pageInd"') === -1, '🔴 عدّاد الصفحة المربك اتشال خالص');
  assert(H.indexOf('class="iconRow"') >= 0, 'صف الأيقونات (غيّري صورتك/إعادة/مشاركة/المزيد) موجود');
  assert(H.indexOf('id="shareBtn"') >= 0, 'زرار المشاركة موجود');
  assert(H.indexOf('id="moreMenu"') >= 0, 'قايمة "المزيد" موجودة');
  assert(H.indexOf('class="trustLine"') >= 0, 'سطر الثقة تحت الأزرار موجود');
  // زرار السلة الأساسي لسه بنفس الشكل الحرفي اللي بتفحصه test-tryon-cart-customer.js
  assert(/cartBtn"\)\.addEventListener\("click", function\(\)\{[\s\S]*?\n\s*\}\);/.test(H),
    'زرار السلة لسه بنفس الشكل المتوقع (window.opener أولًا)');
  // مفيش innerHTML برضه في التصميم الجديد (نفس القاعدة العامة)
  assert(!/\.innerHTML\s*=/.test(H), '🔒 التصميم الجديد كمان ملتزم: مفيش innerHTML');
})();

/* ============================================================
   📐 مقاس ثابت لكارت النتيجة — منع السكرول، من غير ما نقص الصورة
   ------------------------------------------------------------
   🔴⭐ أول محاولة استخدمت object-fit:cover — ده كان بيقص أجزاء من
   الصورة (الشكوى: "بقى يطير جزء من الصورة") لأي نسبة عرض/ارتفاع
   مختلفة عن الكارت (خصوصًا خانات البندانة). الإصلاح: object-fit:
   contain (الصورة كاملة دايمًا) + مساحة أكبر (44vh → 62vh، كانت
   "صغيرة أوي") + خلفية كريمي تملأ أي فراغ بدل رمادي فاجئ.
   ============================================================ */
(function () {
  const H = fs.readFileSync(PAGE, 'utf8');
  assert(/\.resultCard\{[^}]*aspect-ratio\s*:\s*4\s*\/\s*5/.test(H),
    '🔴⭐ كارت النتيجة بنسبة ثابتة (aspect-ratio) مش متغيّرة مع كل توليد');
  assert(/\.result img\{[^}]*object-fit\s*:\s*contain/.test(H),
    '🔴⭐ object-fit:contain — الصورة كاملة دايمًا، مفيش أي جزء بيتقص/"يطير"');
  assert(!/\.result img\{[^}]*object-fit\s*:\s*cover/.test(H),
    '🔴 مفيش رجوع لـcover (كانت هي سبب قص الصورة)');
  assert(/\.resultCard\{[^}]*max-height\s*:\s*62vh/.test(H),
    '⭐ سقف ارتفاع أكبر من المحاولة الأولى (44vh كانت صغيرة أوي)');
})();

/* ============================================================
   🎨🖼️⭐ الألوان واللوجو الحقيقيين — مش بالتة/خط مخترع منفصل
   ------------------------------------------------------------
   🔴⭐ الشكوى: "شكل البيج ده مش لايق ع البرنامج" + "حط نفس اللوجو
   مش خطوط مختلفة كده مزعجة". الحل: نفس متغيرات الألوان الحرفية من
   loyalty/index.html وglow/index.html + نفس LOGO_B64 (PNG حقيقي)
   بدل نص متخيّل بخط مختلف.
   ============================================================ */
(function () {
  const H = fs.readFileSync(PAGE, 'utf8');
  const LOY_H = fs.readFileSync(LOY, 'utf8');
  const GLW_H = fs.readFileSync(GLW, 'utf8');

  assert(H.indexOf('--ink:#3A2233;') >= 0, '🔴⭐ --ink نفس قيمة loyalty الحقيقية بالحرف');
  assert(H.indexOf('--bg:#FFF6FA;') >= 0, '⭐ --bg نفس قيمة loyalty الحقيقية بالحرف');
  assert(H.indexOf('html.glow{') >= 0 && H.indexOf('--ink:#1A1315;') >= 0,
    '🔴⭐ html.glow بياخد ألوان glow الحقيقية بالحرف (مش نفس ألوان loyalty)');

  assert(H.indexOf('id="hLogoImg"') >= 0, '🔴⭐ اللوجو بقى <img> حقيقي مش نص بخط مخترع');
  assert(H.indexOf('logoMain') === -1 && H.indexOf('logoSub') === -1,
    '🔴 مفيش أي أثر للنص/الخط القديم المخترع');
  assert(H.indexOf('PC.LOGO_B64_LOYALTY') >= 0 && H.indexOf('PC.LOGO_B64_GLOW') >= 0,
    'بيستخدم نفس ثابت اللوجو بتاع الاتنين حسب البراند');

  // 🔴⭐ الحرفين لازم يتطابقوا حرف بحرف مع الأصل — أي فرق يعني لوجو غلط
  const PC = require(CORE);
  const mLoy = LOY_H.match(/var LOGO_B64\s*=\s*'([^']*)'/);
  const mGlw = GLW_H.match(/var LOGO_B64\s*=\s*'([^']*)'/);
  assert(mLoy && PC.LOGO_B64_LOYALTY === mLoy[1],
    '🔴⭐ لوجو loyalty مطابق حرفيًا لأصل loyalty/index.html');
  assert(mGlw && PC.LOGO_B64_GLOW === mGlw[1],
    '🔴⭐ لوجو glow مطابق حرفيًا لأصل glow/index.html');
})();

/* ============================================================
   🔴⭐ saveFace بيقاوم زحمة التخزين — مش بيستسلم على أول فشل
   ------------------------------------------------------------
   الشكوى: "لما بخرج وأدخل بعد ساعات بيخليني أولّد من جديد". لو
   كاش النتايج ملا التخزين، حفظ صورة الوش (اللي بتخلي "تجربة تانية"
   بضغطة واحدة) كان بيفشل بصمت من غير أي محاولة تفضية.
   ============================================================ */
(function () {
  const PC = require(CORE);
  function tightStore(quota) {
    const d = {};
    return {
      getItem: (k) => d[k] === undefined ? null : d[k],
      setItem: (k, v) => {
        const total = Object.keys(d).reduce((s, kk) => s + (kk === k ? 0 : d[kk].length), 0) + v.length;
        if (total > quota) { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; }
        d[k] = v;
      },
      removeItem: (k) => { delete d[k]; },
      _raw: d
    };
  }
  const face = 'data:image/png;base64,' + 'A'.repeat(400);

  // تخزين مزنوق بنتيجة قديمة تاخد كل المساحة تقريبًا
  const s = tightStore(600);
  s._raw[PC.CACHE_KEY] = JSON.stringify([{ k: 'x', v: 'data:image/png;base64,' + 'Z'.repeat(400), t: 1 }]);
  const ok = PC.saveFace(s, face);
  assert(ok === true, '🔴⭐ saveFace بينجح حتى لو التخزين مزنوق (بيفضّي نتايج قديمة)');
  assert(PC.readFace(s) === face, 'والوش فعليًا اتحفظ ومتقروش فاضي');
  const remaining = JSON.parse(s.getItem(PC.CACHE_KEY) || '[]');
  assert(remaining.length === 0, 'النتيجة القديمة اتفضّت عشان تدّي مكان للوش (الوش أهم)');

  // تخزين فاضي عادي — لسه بيشتغل زي ما كان (مفيش ريجريشن)
  const s2 = tightStore(999999);
  assert(PC.saveFace(s2, face) === true, 'الحالة العادية (تخزين فاضي) لسه بتنجح زي ما كانت');
})();

/* ============================================================
   💅 أزرار "جرّبيها"/"أضيفيها للسلة" في رسايل الشات — SVG بدل إيموجي
   ------------------------------------------------------------
   🔴 الشكوى: "شكل الزراير وحش آوي و زحمة" — زرارين مصمتين (أسود +
   وردي) جنب بعض حسّوا "زحمة". الحل: زرار أساسي مصمت (جرّبيها) +
   زرار تانوي بإطار بس (أضيفيها للسلة) — نفس منطق التدرّج البصري
   المستخدم في tryon/photo.html (primary/outline).
   ============================================================ */
[['loyalty', LOY], ['glow', GLW]].forEach(function (t) {
  const brand = t[0], H = fs.readFileSync(t[1], 'utf8');
  assert(H.indexOf('🧕 جرّبيها ✨') === -1 && H.indexOf('🛍️ أضيفيها للسلة') === -1,
    brand + ': 🔴 إيموجي الأزرار القديمة اتشالت خالص');
  assert(/class="m-try"[\s\S]{0,220}<svg/.test(H), brand + ': زرار "جرّبيها" بقى SVG');
  assert(/class="m-buy"[\s\S]{0,220}<svg/.test(H), brand + ': زرار "أضيفيها للسلة" بقى SVG');
  // 🔴 التدرّج البصري: جرّبيها أساسي مصمت، أضيفيها للسلة تانوي بإطار
  assert(/\.msg \.m-buy\{[^}]*background:none;[^}]*border:1\.5px solid var\(--pink\);/.test(H),
    brand + ': 🔴 زرار السلة بقى بإطار بس (تانوي) مش مصمت (تقليل الزحمة البصرية)');
  assert(/\.msg \.m-try\{[^}]*background:var\(--ink\);/.test(H),
    brand + ': زرار جرّبيها لسه أساسي مصمت (أوضح فعل)');
});

/* ============================================================
   💅 زرار رفع الصورة "العجيب" + أزرار كارت الطقم — نفس التنضيف
   ------------------------------------------------------------
   🔴 الشكوى: "زر upload الصوره العجيب" — كان بيستخدم كلاس .ch-send
   بتاع زرار الإرسال نفسه مع override بـstyle inline وإيموجي 🖼️
   جواه، حاجة هجينة مش نضيفة. بقى كلاس مخصوص (.ch-upload) + SVG.
   ============================================================ */
[['loyalty', LOY], ['glow', GLW]].forEach(function (t) {
  const brand = t[0], H = fs.readFileSync(t[1], 'utf8');
  // 🔴 بنفحص منطقة الزرار نفسها بس (مش الملف كله — 🖼️ بتتستخدم في تعليقات تانية كتير)
  const uploadBtn = (H.match(/<button class="ch-upload"[\s\S]*?<\/button>/) || [''])[0];
  assert(uploadBtn.length > 0, brand + ': زرار رفع الصورة موجود');
  assert(uploadBtn.indexOf('🖼️') === -1, brand + ': 🔴 إيموجي زرار رفع الصورة اتشال من الزرار نفسه');
  assert(uploadBtn.indexOf('<svg') >= 0, brand + ': زرار رفع الصورة بقى SVG');
  assert(H.indexOf('style=') === -1 || !/class="ch-upload"[^>]*style=/.test(H),
    brand + ': 🔴 مفيش style inline هجين على زرار رفع الصورة بقى');
  const sendBtn = (H.match(/<button class="ch-send" id="chSend"[\s\S]*?<\/button>/) || [''])[0];
  assert(sendBtn.indexOf('<svg') >= 0, brand + ': زرار الإرسال بقى SVG بدل السهم النصي');
  // أزرار كارت الطقم — نفس تدرّج أساسي/تانوي، وإيموجي اتشالت
  assert(H.indexOf('🧕 جربيها عليكي') === -1 && H.indexOf('🛍️ اطلبيها') === -1,
    brand + ': إيموجي أزرار كارت الطقم اتشالت');
  assert(/\.outfit-card \.oc-buy\{background:none; border-color:var\(--pink\);/.test(H),
    brand + ': 🔴 زرار "اطلبيها" في كارت الطقم بقى بإطار (تانوي) زي باقي التصميم');
});
