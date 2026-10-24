/* ============================================================
   ✨👑 atelier-core.js — منطق صفحة «الأتيليه» (دوال نقية بس)
   ------------------------------------------------------------
   مفيش DOM ولا شبكة هنا عشان تتختبر في node. الصفحة نفسها
   (atelier/index.html + atelier.js) بتستخدمها من window.AtelierCore.
   ============================================================ */
(function (root) {
  "use strict";

  var BATCH_SIZE = 4;        // منتجات في النداء الواحد (شبكة ٢×٢)
  /* 💰 جولتين في اليوم بس = نداءين توليد لكل عميلة:
     الجولة الأولى لوحدها (أول ٤ طرح)، والتانية هي اللي بتختار
     قطعها الـ٤. نفس السقف على السيرفر (lookbookCapPerUser = 2). */
  var ROUND_SIZE = 6;        // ٦ قطع في النداء = ١٢ إطلالة في اليوم بنفس التكلفة
  var ROUNDS_PER_DAY = 2;

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
    { id: "isdal",  ar: "الإسدال" },
    { id: "other",  ar: "قطع أخرى" }
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

  /* 🗂️ مجموعة صفحة الإدارة (pos_test_settings/atelier_echarpe) — لو
     فيها قطع، بتحل محل صور الدار الثابتة. الصور في مستندات منفصلة:
     atelier_echarpe_t_<id> (مصغّرة) و atelier_echarpe_f_<id> (كاملة). */
  var ADMIN_DOC = "atelier_echarpe";
  function atelierItemsFrom(doc) {
    var items = (doc && Array.isArray(doc.items)) ? doc.items : [];
    return items.filter(function (it) { return it && it.id && it.active !== false; }).map(function (it) {
      var line = String(it.line || "other");
      var kind = line === "isdal" ? "isdal" : kindOf(it);
      return { id: "at-" + it.id, docId: String(it.id), galleryId: "", barcode: String(it.barcode || ""),
               name: String(it.name || "قطعة").slice(0, 60), price: Number(it.price) || 0,
               line: kind === "isdal" ? "isdal" : line, kind: kind, img: "", tryable: true, admin: true };
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

  /* 📐 نفس lookbookLayout في functions/hijabLookbook.js بالظبط */
  function gridLayout(n) {
    var k = Math.max(1, Math.min(9, Number(n) || 1));
    if (k <= 3) return { cols: k, rows: 1 };
    if (k === 4) return { cols: 2, rows: 2 };
    if (k <= 6) return { cols: 3, rows: 2 };
    return { cols: 3, rows: 3 };
  }
  /* قص الخانات بالحساب (من غير كشف) — أول n خانة من شمال لليمين ومن فوق لتحت */
  function gridCells(w, h, n, inset) {
    var l = gridLayout(n), cw = w / l.cols, ch = h / l.rows, k = inset == null ? 0.02 : inset, out = [];
    for (var i = 0; i < n; i++) {
      var c = i % l.cols, r = Math.floor(i / l.cols);
      out.push({ x: Math.round(c * cw + cw * k), y: Math.round(r * ch + ch * k), w: Math.round(cw * (1 - 2 * k)), h: Math.round(ch * (1 - 2 * k)) });
    }
    return out;
  }

  /* الجولة الأولى: أول ROUND_SIZE طرح ممكن تتجرّب ومالهاش إطلالة جاهزة
     (الإسدال بيتجرّب في جولة لوحده لما العميلة تختاره). */
  function firstRound(products, looks) {
    return (products || []).filter(function (p) {
      return p && p.tryable && p.kind !== "isdal" && !(looks && looks[p.id]);
    }).slice(0, ROUND_SIZE);
  }

  /* عدّاد الجولات على الجهاز — بيتصفّر كل يوم. السيرفر هو الحَكَم
     الحقيقي؛ ده عشان الصفحة تعرض المتبقّي من غير ما تسأل. */
  function roundsUsedToday(rec, today) {
    return rec && rec.day === today ? Math.max(0, Number(rec.n) || 0) : 0;
  }

  /* تقدر تضيف القطعة دي للاختيار؟ ok | full | kind | done */
  function canSelect(sel, p, looks) {
    if (!p || !p.tryable || (looks && looks[p.id])) return "done";
    if ((sel || []).length >= ROUND_SIZE) return "full";
    if (sel && sel.length && (sel[0].kind || "hijab") !== (p.kind || "hijab")) return "kind";
    return "ok";
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
    ADMIN_DOC: ADMIN_DOC,
    atelierItemsFrom: atelierItemsFrom,
    lineName: lineName,
    kindOf: kindOf,
    takeBatch: takeBatch,
    ROUND_SIZE: ROUND_SIZE,
    ROUNDS_PER_DAY: ROUNDS_PER_DAY,
    firstRound: firstRound,
    gridLayout: gridLayout,
    gridCells: gridCells,
    roundsUsedToday: roundsUsedToday,
    canSelect: canSelect,
    isImageDataUrl: isImageDataUrl,
    shopItemsFrom: shopItemsFrom,
    catalogItemsFrom: catalogItemsFrom,
    buildBatches: buildBatches,
    cacheProductId: cacheProductId,
    shouldFallbackToSingle: shouldFallbackToSingle,
    fmtPrice: fmtPrice
  };
  root.AtelierCore = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : this);
