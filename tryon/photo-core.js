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

  /* 🖼️⭐ نفس لوجو PNG المستخدم فعليًا في loyalty/index.html و
     glow/index.html بالحرف — مش خط منفصل مخترع، عشان صفحة التجربة
     تبان جزء من نفس التطبيق مش تطبيق تاني. */
  var LOGO_B64_LOYALTY = "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";
  var LOGO_B64_GLOW = "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";


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

  /* 🏷️ اسم عربي للعرض تحت الدايرة — نفس قايمة CC_BAND_COLORS في
     pos/chat-staff-ui.js حرفيًا (القيمة v هي اللي بترجع من الباك
     إند). لون مش موجود هنا بيتعرض بالاسم الخام اللي جاي (فولباك آمن،
     مش بيتخفي). ⚠️ زي COLOR_HEX بالظبط: أي لون يتضاف في القايمتين
     التانيين لازم يتضاف هنا كمان. */
  var COLOR_LABEL_AR = {
    "none": "بدون بندانة",
    "off-white": "أوف وايت", "offwhite": "أوف وايت", "white": "أبيض",
    "black": "أسود", "navy": "كحلي", "beige": "بيج",
    "grey": "رمادي", "gray": "رمادي", "brown": "بني",
    "rose": "وردي", "red": "أحمر",
    "olive": "زيتوني", "green": "أخضر", "blue": "أزرق",
    "mocha": "موكا", "cream": "كريمي", "burgundy": "عنابي",
    "mustard": "خردلي", "camel": "جملي"
  };
  function colorSwatchLabel(name) {
    var k = String(name || "").toLowerCase().trim().replace(/\s+/g, "-");
    return COLOR_LABEL_AR[k] || COLOR_LABEL_AR[k.replace(/-/g, "")] || name;
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
    try {
      if (!store || !store.setItem || !isImageDataUrl(dataUrl)) return false;
      try { store.setItem(FACE_KEY, dataUrl); return true; }
      catch (e) {
        /* 🔴⭐ التخزين مليان (غالبًا من كاش نتايج قديمة) — الوش أهم:
           هو اللي بيخلي "تجربة تانية" بضغطة واحدة من غير تصوير جديد.
           نفضّي أقدم نتيجة نتيجة ونحاول تاني بدل ما نستسلم على طول. */
        try {
          var arr = _readCache(store);
          while (arr.length > 0) {
            arr.shift();
            try {
              store.setItem(CACHE_KEY, JSON.stringify(arr));
              store.setItem(FACE_KEY, dataUrl);
              return true;
            } catch (e2) { /* لسه مليان — كمّل تفضية */ }
          }
        } catch (e3) { /* تجاهل */ }
        return false;
      }
    } catch (e) { return false; }
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

     ⚠️ localStorage مساحته ~٥-١٠ ميجا حسب المتصفح والصور data:url
        تقيلة، فبنحسب المساحة **بالبايت الفعلي** مش بعدد العناصر —
        صورة شبكة بـ٦ ألوان أتقل من صورة عادية، فحد عدد ثابت (كان ٦)
        كان بيرمي نتايج قبل ما المساحة تتملى فعلاً، وده اللي كان
        بيسبب "بيولّد من جديد" لما كانت بتلف بين منتجات كتير.
        ============================================================ */
  var CACHE_KEY = "echarpe_tryon_results";
  var CACHE_MAX = 20;                        // سقف عدد أمان — نادرًا ما يوصله قبل سقف البايت
  var CACHE_BYTES_BUDGET = 4 * 1024 * 1024;  // ~٤ ميجا فعلية للنتايج (مساحة لباقي بيانات التطبيق برضه)

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
      // الأحدث يفضل — بنرمي الأقدم لما نعدّي حد العدد **أو** ميزانية البايت
      while (arr.length > CACHE_MAX) arr.shift();
      while (arr.length > 1 && _totalBytes(arr) > CACHE_BYTES_BUDGET) arr.shift();
      // ⚠️ لو التخزين اتملى فعليًا (حصل رغم فحص الميزانية)، بنرمي الأقدم ونحاول تاني
      for (var tries = 0; tries < CACHE_MAX; tries++) {
        try { store.setItem(CACHE_KEY, JSON.stringify(arr)); return true; }
        catch (e) { if (arr.length <= 1) return false; arr.shift(); }
      }
      return false;
    } catch (e) { return false; }
  }

  function _totalBytes(arr) {
    var sum = 0;
    for (var i = 0; i < arr.length; i++) sum += dataUrlBytes(arr[i] && arr[i].v);
    return sum;
  }

  function clearResults(store) {
    try { if (store && store.removeItem) store.removeItem(CACHE_KEY); } catch (e) { }
  }

  /* 📐 أبعاد الشبكة — **نفس الحسبة بالظبط** اللي في hijabTryOn.js
     (buildTryOnPrompt) عشان اللي بنقصّه يطابق اللي اتطلب في البرومبت. */
  function computeGridLayout(n) {
    var gw = n <= 2 ? 2 : (n <= 4 ? 2 : 3);
    var gh = Math.ceil(n / gw);
    return { cols: gw, rows: gh };
  }

  /* 📐 تقسيم رياضي متساوي — بديل **مضمون** لكشف الفواصل (splitGrid).
     ⚠️ الدرس اللي طلعناه من تجربة حقيقية: الموديل مش دايمًا بيرسم
     فواصل واضحة كفاية عشان الكشف بالتباين يلقطها، فكان بيفشل
     ويرجع الصورة الشبكة كاملة من غير قص — العميلة تشوف ٤ وشوش
     صغيرة بدل صورة واحدة واضحة قابلة لتبديل اللون. التقسيم
     الرياضي مش محتاج يلاقي حاجة في الصورة أصلًا: بيفترض إن
     الموديل التزم بترتيب "N by M" اللي اتطلب في البرومبت (نفس
     أبعاد computeGridLayout) ويقسم بالحساب. inset صغير بياخد
     مسافة أمان من حواف الخانة (فاصل تقيل أو محاذاة مش مظبوطة ١٠٠٪).

     🔴🔴⭐ درس تاني من تجربة حقيقية (أوحش من الأول): الموديل أحيانًا
     مش بيلتزم **باتجاه** الشبكة المطلوبة — طلبنا ٢ عمود × ١ صف (جنب
     بعض)، ورجّع ١ عمود × ٢ صف (فوق بعض). القص بافتراض عمياني كان
     بيقطع خانة نص-نص غلط: نص صورة فوقانية + نص صورة تحتانية في
     نفس الكروب — "شكل بشع" فعلًا. الحل: نقارن نسبة الصورة الفعلية
     (عرض/ارتفاع) بنسبة الشكل المتوقع، ولو معكوسين تمامًا (متوقع
     عريض والصورة طولية أو العكس) نبدّل الصفوف بالأعمدة قبل القص. */
  function resolveGridOrientation(w, h, cols, rows) {
    if (cols === rows) return { cols: cols, rows: rows }; // مربّع — مفيش اتجاه يتلخبط
    var expectedRatio = cols / rows;      // > 1 = المتوقع عريض (جنب بعض)
    var actualRatio = (w || 1) / (h || 1); // > 1 = الصورة الفعلية عريضة
    var expectedWide = expectedRatio > 1.15, expectedTall = expectedRatio < 0.87;
    var actualWide = actualRatio > 1.15, actualTall = actualRatio < 0.87;
    if ((expectedWide && actualTall) || (expectedTall && actualWide)) {
      return { cols: rows, rows: cols }; // معكوسين — نبدّل
    }
    return { cols: cols, rows: rows };
  }

  function sliceGridProportional(w, h, cols, rows, n, insetFrac) {
    var inset = insetFrac != null ? insetFrac : 0.035;
    var resolved = resolveGridOrientation(w, h, cols, rows);
    cols = resolved.cols; rows = resolved.rows;
    var cellW = w / cols, cellH = h / rows;
    var cells = [];
    for (var i = 0; i < n; i++) {
      var col = i % cols, row = Math.floor(i / cols);
      var x0 = col * cellW, y0 = row * cellH;
      var ix = cellW * inset, iy = cellH * inset;
      cells.push({
        x: Math.round(x0 + ix), y: Math.round(y0 + iy),
        w: Math.round(cellW - ix * 2), h: Math.round(cellH - iy * 2),
        row: row, col: col
      });
    }
    return cells;
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
    LOGO_B64_LOYALTY: LOGO_B64_LOYALTY,
    LOGO_B64_GLOW: LOGO_B64_GLOW,
    cleanColorName: cleanColorName,
    parseBandanaColors: parseBandanaColors,
    readBandanaColors: readBandanaColors,
    readBandanaPid: readBandanaPid,
    isGridMode: isGridMode,
    colorSwatchHex: colorSwatchHex,
    colorSwatchLabel: colorSwatchLabel,
    computeGridLayout: computeGridLayout,
    sliceGridProportional: sliceGridProportional,
    resolveGridOrientation: resolveGridOrientation,
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
    CACHE_BYTES_BUDGET: CACHE_BYTES_BUDGET,
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
