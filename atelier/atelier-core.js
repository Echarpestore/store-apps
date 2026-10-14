/* ============================================================
   ✨👑 atelier-core.js — منطق صفحة «الأتيليه» (دوال نقية بس)
   ------------------------------------------------------------
   مفيش DOM ولا شبكة هنا عشان تتختبر في node. الصفحة نفسها
   (atelier/index.html + atelier.js) بتستخدمها من window.AtelierCore.
   ============================================================ */
(function (root) {
  "use strict";

  var BATCH_SIZE = 4;        // منتجات في النداء الواحد (شبكة ٢×٢)
  var AUTO_LIMIT = 12;       // أول ١٢ منتج بيتولّدوا لوحدهم بعد الرفع
  var SESSION_LIMIT = 24;    // بعد كده: زرار «جرّبيها» يدوي على الكارت

  /* 🏛️ مجموعة الدار — صور المنتجات الحقيقية (atelier/collection).
     بتظهر لما «منتجات البيع أونلاين» تكون فاضية، وبعد منتجات البيع
     لما تبقى موجودة. line = الخط اللي بيتفلتر بيه في الصفحة. */
  var HOUSE = [
    ["crepe-minuit",      "كريب كحلي",               "crepe"],
    ["mono-anthracite",   "مونوجرام فحمي",           "mono"],
    ["isdal-violet",      "إسدال بنفسجي مورّد",      "isdal"],
    ["zebre-sable",       "زيبرا رملي",              "zebre"],
    ["plisse-noir",       "بليسيه أسود",             "plisse"],
    ["crepe-pierre",      "كريب رمادي",              "crepe"],
    ["mono-sable",        "مونوجرام رملي",           "mono"],
    ["isdal-gris",        "إسدال رمادي مورّد",       "isdal"],
    ["zebre-camel",       "زيبرا كاميل",             "zebre"],
    ["mono-gris",         "مونوجرام رمادي",          "mono"],
    ["crepe-noir-volant", "كريب أسود بحافة مموّجة",  "crepe"],
    ["mono-moka",         "مونوجرام موكا",           "mono"],
    ["zebre-argent",      "زيبرا فضّي",              "zebre"],
    ["mono-perle",        "مونوجرام لؤلؤي",          "mono"],
    ["plisse-nuit",       "بليسيه ليلي",             "plisse"],
    ["mono-taupe",        "مونوجرام توب",            "mono"],
    ["zebre-fume",        "زيبرا دخاني",             "zebre"]
  ];
  var LINES = [
    { id: "all",    ar: "الكل" },
    { id: "crepe",  ar: "الكريب" },
    { id: "plisse", ar: "البليسيه" },
    { id: "mono",   ar: "المونوجرام" },
    { id: "zebre",  ar: "الزيبرا" },
    { id: "isdal",  ar: "الإسدال" }
  ];
  function lineName(id) {
    for (var i = 0; i < LINES.length; i++) if (LINES[i].id === id) return LINES[i].ar;
    return "";
  }
  function houseCollection(base) {
    var dir = base || "collection/";
    return HOUSE.map(function (h) {
      return { id: "house-" + h[0], galleryId: "", barcode: "", name: h[1],
               line: h[2], kind: h[2] === "isdal" ? "isdal" : "hijab", price: 0,
               img: dir + h[0] + ".jpg", tryable: true, house: true };
    });
  }

  /* 🧥 الإسدال — بيتعرف من الاسم (أو kind في المنتج). البرومبت بتاعه
     مختلف (قطعة طويلة بغطاء راس متصل)، وبيتولّد بس في نداءات منفصلة
     عن الطرح عشان الشبكة متتلخبطش. */
  function kindOf(p) {
    if (p && (p.kind === "isdal" || p.category === "isdal")) return "isdal";
    return /إسدال|اسدال|أسدال|isdal|prayer/i.test(String(p && p.name || "")) ? "isdal" : "hijab";
  }

  function isImageDataUrl(s) {
    return typeof s === "string" && /^data:image\/(jpeg|png|webp);base64,/i.test(s);
  }

  /* منتجات البيع أونلاين — **نفس شرط shopItems في loyalty بالظبط**
     (active + onlineQty > 0 + barcode + سعر). المنتج من غير صورة
     data-URL بيتعرض بس مش بيتجرّب (الدالة بترفض أي حاجة غير كده). */
  function shopItemsFrom(doc) {
    var items = (doc && Array.isArray(doc.items)) ? doc.items : [];
    return items.filter(function (p) {
      return p && p.active === true && Number(p.onlineQty) > 0 &&
        p.barcode && Number(p.price) > 0;
    }).map(normalize);
  }

  /* الكتالوج (عرض) — فولباك لو مفيش منتجات بيع أونلاين */
  function catalogItemsFrom(doc) {
    var items = (doc && Array.isArray(doc.items)) ? doc.items : [];
    return items.filter(function (p) { return p && p.img; }).map(normalize);
  }

  function normalize(p, i) {
    var id = String(p.id || p.barcode || p.name || ("p" + i));
    var kind = kindOf(p);
    return {
      id: id, kind: kind, line: kind === "isdal" ? "isdal" : "shop",
      galleryId: p.id ? String(p.id) : "",
      barcode: p.barcode ? String(p.barcode) : "",
      name: String(p.name || "طرحة").slice(0, 80),
      price: Number(p.price) || 0,
      img: String(p.img || ""),
      tryable: isImageDataUrl(p.img)
    };
  }

  /* تقسيم قائمة لدفعات — الترتيب محفوظ (ترتيب الخانات في الشبكة) */
  function buildBatches(list, size) {
    var n = Math.max(1, Number(size) || BATCH_SIZE), out = [];
    for (var i = 0; i < (list || []).length; i += n) out.push(list.slice(i, i + n));
    return out;
  }

  /* الدفعة الجاية من الطابور — كلها من نفس النوع (طرح مع طرح، إسدال
     مع إسدال) وبحد BATCH_SIZE. بترجع { batch, rest } من غير ما تغيّر
     الطابور الأصلي. */
  function takeBatch(queue, size) {
    var n = Math.max(1, Number(size) || BATCH_SIZE), batch = [], rest = [];
    var kind = queue.length ? (queue[0].kind || "hijab") : "";
    queue.forEach(function (p) {
      if (batch.length < n && (p.kind || "hijab") === kind) batch.push(p); else rest.push(p);
    });
    return { batch: batch, rest: rest, kind: kind };
  }

  /* هل نولّد المنتج ده لوحده؟ — أول AUTO_LIMIT بس. الباقي لما يبان
     على الشاشة لحد SESSION_LIMIT، وبعدها يدوي. */
  function autoPolicy(index, requestedSoFar, visible) {
    if (requestedSoFar >= SESSION_LIMIT) return "manual";
    if (index < AUTO_LIMIT) return "auto";
    return visible ? "auto" : "wait";
  }

  /* مفتاح الكاش — منفصل عن hijabTryOn عشان صورة الشبكة المقصوصة
     (جودة أقل) متتخلطش مع صورة «الجودة العالية». */
  function cacheProductId(p, hq) {
    return (hq ? "atelier-hq:" : "atelier:") + String(p && p.id || "");
  }

  /* هل الخطأ معناه إن hijabLookbook مش منشورة؟ → ننزل لوضع
     المنتج الواحد. السقف (resource-exhausted) **مش** سبب نزول. */
  function shouldFallbackToSingle(err) {
    var code = String(err && err.code || "").replace(/^functions\//, "");
    return code === "not-found" || code === "internal" || code === "unimplemented" ||
      code === "unauthenticated" || code === "";
  }

  function fmtPrice(n) {
    var v = Math.round(Number(n) || 0);
    return v ? v.toLocaleString("ar-EG") + " ج.م" : "";
  }

  var API = {
    BATCH_SIZE: BATCH_SIZE,
    HOUSE: HOUSE,
    LINES: LINES,
    houseCollection: houseCollection,
    lineName: lineName,
    kindOf: kindOf,
    takeBatch: takeBatch,
    AUTO_LIMIT: AUTO_LIMIT,
    SESSION_LIMIT: SESSION_LIMIT,
    isImageDataUrl: isImageDataUrl,
    shopItemsFrom: shopItemsFrom,
    catalogItemsFrom: catalogItemsFrom,
    buildBatches: buildBatches,
    autoPolicy: autoPolicy,
    cacheProductId: cacheProductId,
    shouldFallbackToSingle: shouldFallbackToSingle,
    fmtPrice: fmtPrice
  };
  root.AtelierCore = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : this);
