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

/* 💾 الربط في photo.html — الكاش لازم يتفحص **قبل** النداء */
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

  // نفس تنضيف السيرفر بالظبط — نصوص، بحد أقصى ٦، بحروف بس
  assertEq(PC.parseBandanaColors(['off-white', 'black', 'navy', 'beige']),
    ['off-white', 'black', 'navy', 'beige'], 'تنضيف قايمة سليمة بيسيبها زي ما هي');
  assertEq(PC.parseBandanaColors(['a', 'ok!!', '  navy blue  ']),
    ['ok', 'navy blue'], '🔴 حرف واحد بيترفض + المحارف الغريبة بتتشال');
  assertEq(PC.parseBandanaColors(['1', '2', '3']), [],
    'أرقام بس (مفيهاش حروف) بترجع فاضية بعد التنضيف');
  assertEq(PC.parseBandanaColors('["red","blue","green","navy","beige","black","white"]').length, 6,
    '🔴 سقف ٦ ألوان حتى لو الأصل أكتر');
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

// ---------- ٧) الربط في photo.html: وضع الشبكة + صف الألوان ----------
(function () {
  const H = fs.readFileSync(PAGE, 'utf8');

  assert(H.indexOf('grid-split.js') >= 0, '🧢 photo.html بيحمّل grid-split.js');
  assert(H.indexOf('PC.readBandanaColors') >= 0, 'بيقرا ألوان البندانة من sessionStorage');
  assert(H.indexOf('PC.readBandanaPid') >= 0, 'بيقرا باركود البندانة من sessionStorage');
  assert(H.indexOf('withBandana') >= 0 && H.indexOf('bandanaColors') >= 0,
    'بيبعت withBandana + bandanaColors للدالة');
  assert(H.indexOf('GridSplit.splitGrid') >= 0, 'بيستخدم GridSplit.splitGrid على النتيجة');
  assert(H.indexOf('GridSplit.labelCells') >= 0, 'وبيلبّل الخانات بالألوان بترتيبها');
  assert(H.indexOf('id="bandRow"') >= 0, 'عنصر صف الألوان موجود في الصفحة');
  assert(H.indexOf('id="bandCartBtn"') >= 0, 'زرار سلة البندانة موجود');
  // 🔴 فشل القص لازم يسيب الصورة كاملة (فولباك آمن) مش يفضل عالق فاضي
  assert(H.indexOf('hideBandRow') >= 0, 'فيه مسار واضح لإخفاء صف الألوان (فشل القص أو منتج عادي)');
  // مفيش innerHTML — نفس القاعدة العامة، الكود الجديد لازم يلتزم بيها برضه
  assert(!/\.innerHTML\s*=/.test(H), '🔒 الكود الجديد برضه ملتزم: مفيش innerHTML في الصفحة كلها');
})();

// ---------- ٨) الربط في الشات (loyalty/glow): إرسال ألوان البندانة ----------
[['loyalty', LOY], ['glow', GLW]].forEach(function (pair) {
  const brand = pair[0], p = pair[1];
  const H = fs.readFileSync(p, 'utf8');
  assert(H.indexOf('chatBandanaColors') >= 0, brand + ': متغيّر ألوان البندانة موجود');
  assert(H.indexOf('chatBandanaPid') >= 0, brand + ': متغيّر باركود البندانة موجود');
  assert(H.indexOf('echarpe_tryon_bandana_colors') >= 0, brand + ': chatTryOn بيبعت الألوان لصفحة التجربة');
  assert(H.indexOf('echarpe_tryon_bandana_pid') >= 0, brand + ': chatTryOn بيبعت باركود البندانة');
  // 🔴 تنضيف الألوان في الشات لازم يطابق حدود السيرفر (نفس الحد الأقصى ٦)
  assert(/slice\(0,\s*6\)/.test(H.slice(H.indexOf('chatBandanaColors[m.id]') - 400, H.indexOf('chatBandanaColors[m.id]') + 100)),
    brand + ': تنضيف الألوان في رسالة الشات بسقف ٦');
  // tryonAddToCart بقى بياخد note ويضيفه للملاحظات
  const fnStart = H.indexOf('function tryonAddToCart(');
  const fnBody = H.slice(fnStart, H.indexOf('window.tryonAddToCart = tryonAddToCart;'));
  assert(/tryonAddToCart\(barcode,\s*imgFallback,\s*note\)/.test(fnBody), brand + ': tryonAddToCart بياخد note');
  assert(fnBody.indexOf('_shopInfo.notes') >= 0, brand + ': اللون بيتضاف لملاحظات الأوردر');
  // فولباك addcart بقى بيقرا note كمان
  assert(H.indexOf("/[?&]note=([^&]+)/") >= 0, brand + ': فولباك addcart بيقرا اللون من الرابط');
});
