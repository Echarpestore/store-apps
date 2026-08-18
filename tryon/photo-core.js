/* ============================================================
   🧕✨ photo-core.js — منطق صفحة تجربة الطرحة بالصورة (Photo AI)
   ------------------------------------------------------------
   دوال **نقية** بس (مفيش DOM ولا شبكة) عشان تتختبر بالهارنس في node.
   الصفحة نفسها (photo.html) بتستخدمها عن طريق window.PhotoCore.

   القاعدة الذهبية: بنعرّض على window **و** module.exports — عشان
   الملف يشتغل في المتصفح وفي اختبار node بنفس الوقت.
   ============================================================ */
(function (root) {
  "use strict";

  // مفاتيح sessionStorage المشتركة مع تطبيق العميلة (chatTryOn بيكتبها)
  // مفتاح صورة الوش المحفوظة — localStorage عمدًا مش sessionStorage:
  // كل "جرّبيها" بيفتح تاب/نداء window.open جديد، وsessionStorage مش
  // مضمون يتوارث بين نداءات window.open منفصلة. localStorage بيتشارك
  // بين كل تابات نفس الأصل بثبات. برضه ١٠٠٪ على جهاز العميلة —
  // مبيتبعتش لحد غير سيرفرنا وقت التوليد (زي ما كان دايمًا).
  var FACE_KEY = "echarpe_tryon_face";

  var SS_KEYS = {
    img:   "echarpe_tryon_img",    // صورة المنتج (data:image) — الموظفة بعتتها في الشات
    phone: "echarpe_tryon_phone",  // تليفون العميلة (لسقف التكلفة)
    pid:   "echarpe_tryon_pid",    // productId لو اتبعت (مش موجود في سكيمة الشات الحالية)
    // 🧢 وضع شبكة البندانة — الموظفة بتحدد الألوان المتاحة مع المنتج.
    //    وجود ٢ لون فأكتر هو اللي بيحوّل الصفحة لوضع الشبكة.
    bandanaColors: "echarpe_tryon_bandana_colors", // JSON array من أسماء الألوان
    bandanaPid:    "echarpe_tryon_bandana_pid"     // باركود البندانة نفسها (منتج منفصل عن الطرحة)
  };

  var BRANDS = ["loyalty", "glow", "site"];

  // حدود ضغط صورة العميلة قبل الإرسال — أرخص وأسرع + تحت سقف الدالة (٨ ميجا)
  var TARGET_MAX_DIM = 1024;       // أطول ضلع
  var JPEG_QUALITY = 0.85;
  var MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

  // نفس الرسالة الودّية بتاعت الدالة — الخطأ الخام عمره ما بيظهر
  var FRIENDLY_ERR = "مقدرناش نجهّز التجربة دلوقتي. جرّبي مرة تانية ❤️";

  function appName(brand) {
    return BRANDS.indexOf(brand) >= 0 ? brand : "loyalty";
  }

  /* قراءة الباراميترات من الـquery — brand افتراضي loyalty، productId اختياري */
  function parseParams(search) {
    var out = { brand: "loyalty", productId: null };
    var s = String(search || "");
    if (s.charAt(0) === "?") s = s.slice(1);
    s.split("&").forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf("=");
      var k = i < 0 ? kv : kv.slice(0, i);
      var v = i < 0 ? "" : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " "));
      if (k === "brand") out.brand = appName(v);
      else if (k === "product" || k === "productId") out.productId = v || null;
    });
    return out;
  }

  function isImageDataUrl(s) {
    return typeof s === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(s);
  }

  /* قراءة صورة المنتج من sessionStorage والتأكد إنها data:image سليمة */
  function readProductImage(store) {
    try {
      var v = store && store.getItem ? store.getItem(SS_KEYS.img) : null;
      return isImageDataUrl(v) ? v : "";
    } catch (e) { return ""; }
  }

  /* ============================================================
     🧢 ألوان البندانة — نفس منطق التنضيف اللي في hijabTryOn.js
     بالظبط (نصوص قصيرة، بحد أقصى ٦، من غير محارف غريبة). لازم
     يتطابق مع السيرفر: لو العميل نضّف بطريقة مختلفة، ممكن يبعت
     ألوان متقبلش هناك أو العكس. القص بعدين (grid-split) بيعتمد
     على إن العدد هنا نفس العدد اللي السيرفر رجّعه في bandanaColors.
     ============================================================ */
  function cleanColorName(c) {
    return String(c || "").replace(/[^a-zA-Z \-]/g, "").trim().slice(0, 24);
  }

  /* raw ممكن يكون array جاهزة أو نص JSON من sessionStorage */
  function parseBandanaColors(raw) {
    var arr = raw;
    if (typeof raw === "string") {
      try { arr = JSON.parse(raw); } catch (e) { return []; }
    }
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(function (c) { return typeof c === "string"; })
      .map(cleanColorName)
      .filter(function (c) { return c.length >= 2; })
      .slice(0, 6);
  }

  function readBandanaColors(store) {
    try {
      var v = store && store.getItem ? store.getItem(SS_KEYS.bandanaColors) : null;
      return v ? parseBandanaColors(v) : [];
    } catch (e) { return []; }
  }

  /* باركود البندانة (منتج منفصل عن الطرحة نفسها) — نص بسيط بس */
  function readBandanaPid(store) {
    try {
      var v = store && store.getItem ? store.getItem(SS_KEYS.bandanaPid) : null;
      return (typeof v === "string" && v) ? v : "";
    } catch (e) { return ""; }
  }

  /* وضع الشبكة = ٢ لون فأكتر. لون واحد أو صفر = صورة عادية */
  function isGridMode(colors) {
    return Array.isArray(colors) && colors.length >= 2;
  }

  /* 🎨 خريطة اسم→hex لعرض دوائر لون تقريبية في صف الاختيار.
     أفضل محاولة بس — أي اسم مش موجود بياخد رمادي محايد ويتعرض
     نصه زي ما هو، مش بيتمنع أو يتلغي. */
  var COLOR_HEX = {
    "off-white": "#f3ece0", "offwhite": "#f3ece0", "white": "#f7f5f2",
    "black": "#23211f", "navy": "#1f2a44", "beige": "#c9ac86",
    "grey": "#8c8a86", "gray": "#8c8a86", "brown": "#6b4a34",
    "rose": "#d8a0a8", "pink": "#e6b3c0", "red": "#b83b3b",
    "olive": "#6b6f4a", "green": "#4a6b52", "blue": "#3a5a8c",
    "mocha": "#7d5a44", "cream": "#fbf3df", "burgundy": "#6e2436",
    "mustard": "#c9a233", "camel": "#b08a5f"
  };
  function colorSwatchHex(name) {
    var k = String(name || "").toLowerCase().trim().replace(/\s+/g, "-");
    return COLOR_HEX[k] || COLOR_HEX[k.replace(/-/g, "")] || "#b7aca3";
  }

  /* مقاس بعد التصغير — بيصغّر بس (مفيش تكبير)، ويحافظ على النسبة */
  function computeResize(w, h, maxDim) {
    var W = Math.max(1, Math.round(w || 0));
    var H = Math.max(1, Math.round(h || 0));
    var m = maxDim || TARGET_MAX_DIM;
    var longest = Math.max(W, H);
    if (longest <= m) return { w: W, h: H }; // مفيش تكبير
    var scale = m / longest;
    return { w: Math.max(1, Math.round(W * scale)), h: Math.max(1, Math.round(H * scale)) };
  }

  /* عدد بايتات تقريبي لـdata-URL base64 (نفس حساب الدالة) */
  function dataUrlBytes(dataUrl) {
    var s = String(dataUrl || "");
    var i = s.indexOf("base64,");
    if (i < 0) return 0;
    var b64 = s.slice(i + 7).replace(/\s+/g, "");
    if (!b64) return 0;
    var pad = b64.slice(-2) === "==" ? 2 : (b64.slice(-1) === "=" ? 1 : 0);
    return Math.floor(b64.length * 3 / 4) - pad;
  }

  /* أزرار شاشة النتيجة — "أضيفيها للسلة" بتظهر بس لو فيه productId.
     🧢 bandanaPid اختياري: لو موجود، زرار سلة تاني بيظهر للبندانة
     نفسها (منتج منفصل عن الطرحة، ومطلوب اللون معاه). */
  function resultActions(productId, bandanaPid) {
    return {
      addToCart: !!productId,
      addBandanaToCart: !!bandanaPid,
      tryAnother: true,
      retry: true,
      backToChat: true
    };
  }

  /* 🔙 مسار الرجوع — الموقع الرئيسي مفهوش فولدر فرعي (tryon/ جنب
     loyalty/ وglow/ بالظبط تحت الجذر)، فـ'site' بيرجع لـ'../' مباشرة. */
  function backPath(brand) {
    return brand === "site" ? "../" : ("../" + appName(brand) + "/");
  }

  /* قراءة صورة الوش المحفوظة من زيارة سابقة — data:image سليمة بس */
  function readFace(store) {
    try {
      var v = store && store.getItem ? store.getItem(FACE_KEY) : null;
      return isImageDataUrl(v) ? v : "";
    } catch (e) { return ""; }
  }
  function saveFace(store, dataUrl) {
    try { if (store && store.setItem && isImageDataUrl(dataUrl)) store.setItem(FACE_KEY, dataUrl); }
    catch (e) { /* التخزين ممنوع (خاص/سعة) — مش قاتل، هتتسأل تاني وخلاص */ }
  }
  function clearFace(store) {
    try { if (store && store.removeItem) store.removeItem(FACE_KEY); } catch (e) { }
  }

  /* ============================================================
     💾 كاش النتايج — نفس التركيبة متتولّدش مرتين
     ------------------------------------------------------------
     العميلة بتلف وترجع وهي بتقارن ("أسود… لأ بيج… طب ورّيني الأسود
     تاني"). كل رجعة كانت توليد جديد = تكلفة جديدة. الكاش بيخلي
     الرجعة **فورية ومجانية**.

     🔒 الخصوصية: التخزين على **جهاز العميلة هي** بس — لا Firestore
        ولا Storage. ده مش تفصيلة: النظام واعد صراحة إن صورة العميلة
        متتخزّنش عندنا، والنتيجة فيها وشها برضه. الكاش السيرفري كان
        هيكسر الوعد ده، فاتحط هنا عن قصد.

     🔑 المفتاح = المنتج + بصمة صورة العميلة. لو غيّرت صورتها،
        المفتاح بيتغيّر والنتايج القديمة مبتتعرضش على وش جديد.

     ⚠️ localStorage مساحته ~٥ ميجا والصور data:url تقيلة، فبنسيب
        **آخر ٦ نتايج بس** ونرمي الأقدم. من غير الحد ده أول ٣-٤
        صور بتملا التخزين وكل حاجة بعدها بتفشل بصمت.
     ============================================================ */
  var CACHE_KEY = "echarpe_tryon_results";
  var CACHE_MAX = 6;

  /* بصمة خفيفة لصورة العميلة — مش هاش تشفيري، بس كفاية إننا نفرّق
     بين صورتين. بناخد الطول + عيّنات من أماكن ثابتة. */
  function faceSig(dataUrl) {
    var s = String(dataUrl || "");
    if (!s) return "";
    var out = s.length + "";
    var pts = [0.2, 0.4, 0.6, 0.8];
    for (var i = 0; i < pts.length; i++) {
      var at = Math.floor(s.length * pts[i]);
      out += "_" + s.slice(at, at + 12);
    }
    return out;
  }

  /* 🧢 colors اختياري — لو موجود بيدخل في المفتاح، عشان لو باركود
     البندانة اتغيّرت ألوانه المتاحة، النتيجة القديمة (بألوان تانية)
     ما تتلخبطش مع الطلب الجديد. من غيره (طرحة عادية) المفتاح زي
     ما كان بالظبط — توافق كامل مع الكاش القديم. */
  function colorsSig(colors) {
    return (Array.isArray(colors) && colors.length) ? colors.join(",") : "";
  }
  function cacheKey(productId, faceDataUrl, colors) {
    return String(productId || "") + "|" + faceSig(faceDataUrl) + "|" + colorsSig(colors);
  }

  function _readCache(store) {
    try {
      var raw = store && store.getItem ? store.getItem(CACHE_KEY) : null;
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  /* نتيجة محفوظة لنفس التركيبة — أو "" لو مفيش */
  function readResult(store, productId, faceDataUrl, colors) {
    if (!productId || !faceDataUrl) return "";
    var k = cacheKey(productId, faceDataUrl, colors);
    var arr = _readCache(store);
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].k === k && isImageDataUrl(arr[i].v)) return arr[i].v;
    }
    return "";
  }

  function saveResult(store, productId, faceDataUrl, imageDataUrl, colors) {
    try {
      if (!store || !store.setItem) return false;
      if (!productId || !faceDataUrl || !isImageDataUrl(imageDataUrl)) return false;
      var k = cacheKey(productId, faceDataUrl, colors);
      var arr = _readCache(store).filter(function (e) { return e && e.k !== k; });
      arr.push({ k: k, v: imageDataUrl, t: Date.now() });
      // الأحدث يفضل — بنرمي الأقدم لما نعدّي الحد
      while (arr.length > CACHE_MAX) arr.shift();
      // ⚠️ لو التخزين اتملى، بنرمي الأقدم ونحاول تاني بدل ما نفشل خالص
      for (var tries = 0; tries < CACHE_MAX; tries++) {
        try { store.setItem(CACHE_KEY, JSON.stringify(arr)); return true; }
        catch (e) { if (arr.length <= 1) return false; arr.shift(); }
      }
      return false;
    } catch (e) { return false; }
  }

  function clearResults(store) {
    try { if (store && store.removeItem) store.removeItem(CACHE_KEY); } catch (e) { }
  }

  var API = {
    SS_KEYS: SS_KEYS,
    BRANDS: BRANDS,
    TARGET_MAX_DIM: TARGET_MAX_DIM,
    JPEG_QUALITY: JPEG_QUALITY,
    MAX_UPLOAD_BYTES: MAX_UPLOAD_BYTES,
    FRIENDLY_ERR: FRIENDLY_ERR,
    appName: appName,
    parseParams: parseParams,
    isImageDataUrl: isImageDataUrl,
    readProductImage: readProductImage,
    cleanColorName: cleanColorName,
    parseBandanaColors: parseBandanaColors,
    readBandanaColors: readBandanaColors,
    readBandanaPid: readBandanaPid,
    isGridMode: isGridMode,
    colorSwatchHex: colorSwatchHex,
    computeResize: computeResize,
    dataUrlBytes: dataUrlBytes,
    resultActions: resultActions,
    backPath: backPath,
    FACE_KEY: FACE_KEY,
    readFace: readFace,
    saveFace: saveFace,
    clearFace: clearFace,
    CACHE_KEY: CACHE_KEY,
    CACHE_MAX: CACHE_MAX,
    faceSig: faceSig,
    colorsSig: colorsSig,
    cacheKey: cacheKey,
    readResult: readResult,
    saveResult: saveResult,
    clearResults: clearResults
  };

  root.PhotoCore = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : this);
