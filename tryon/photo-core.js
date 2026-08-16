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
  var SS_KEYS = {
    img:   "echarpe_tryon_img",    // صورة المنتج (data:image) — الموظفة بعتتها في الشات
    phone: "echarpe_tryon_phone",  // تليفون العميلة (لسقف التكلفة)
    pid:   "echarpe_tryon_pid"     // productId لو اتبعت (مش موجود في سكيمة الشات الحالية)
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

  /* أزرار شاشة النتيجة — "أضيفيها للسلة" بتظهر بس لو فيه productId */
  function resultActions(productId) {
    return {
      addToCart: !!productId,
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
    computeResize: computeResize,
    dataUrlBytes: dataUrlBytes,
    resultActions: resultActions,
    backPath: backPath
  };

  root.PhotoCore = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : this);
