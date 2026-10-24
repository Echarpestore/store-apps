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
  var ROUND_SIZE = 6;        // ٦ قطع في النداء الواحد
  var BASE_ROUNDS = 1;       // تجربة واحدة ببلاش في اليوم
  var BONUS_ROUNDS = 1;      // 🎁 + تجربة لما تحط قطعة في الحقيبة
  var MAX_ROUNDS = BASE_ROUNDS + BONUS_ROUNDS;   // = lookbookCapPerUser على السيرفر

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
               line: h[2], family: h[2], kind: h[2] === "isdal" ? "isdal" : "hijab", price: 0,
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
               family: String(it.family || "").trim() || (kind === "isdal" ? "isdal" : line),
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

  /* 🎨 الموديل = القطع اللي بنفس الشكل بألوان مختلفة. من صفحة الإدارة
     (خانة «الموديل»)، وإلا النوع نفسه (كريب/مونوجرام/…). */
  function familyOf(p) { return String(p && (p.family || p.line) || ""); }

  /* جولة واحدة = ٦ قطع: القطعة اللي اختارتها + ألوانها (نفس الموديل)
     + نفس النوع + الباقي. كلها من نفس الصنف (طرح مع طرح، إسدال مع
     إسدال)، ومن غير اللي إطلالته جاهزة أو بيتجهّز. */
  function buildRound(focus, products, looks, busy, size) {
    var n = size || ROUND_SIZE;
    var kind = focus ? (focus.kind || "hijab") : "hijab";
    var free = (products || []).filter(function (p) {
      return p && p.tryable && (p.kind || "hijab") === kind && !(looks && looks[p.id]) && !(busy && busy[p.id]);
    });
    if (!focus) return free.slice(0, n);
    var fam = familyOf(focus), line = focus.line;
    var rank = function (p) { return p === focus ? 0 : familyOf(p) === fam ? 1 : p.line === line ? 2 : 3; };
    return free.map(function (p, i) { return { p: p, r: rank(p), i: i }; })
      .sort(function (a, b) { return a.r - b.r || a.i - b.i; })
      .slice(0, n).map(function (x) { return x.p; });
  }

  /* عدّاد التجارب على الجهاز — بيتصفّر كل يوم. bonus = اتكسبت من
     الحقيبة. السيرفر هو الحَكَم الحقيقي (سقف MAX_ROUNDS). */
  function roundsState(rec, today) {
    var same = rec && rec.day === today;
    var used = same ? Math.max(0, Number(rec.n) || 0) : 0, bonus = !!(same && rec.bonus);
    var allowed = BASE_ROUNDS + (bonus ? BONUS_ROUNDS : 0);
    return { used: used, bonus: bonus, allowed: allowed, left: Math.max(0, allowed - used) };
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
    BASE_ROUNDS: BASE_ROUNDS,
    BONUS_ROUNDS: BONUS_ROUNDS,
    MAX_ROUNDS: MAX_ROUNDS,
    familyOf: familyOf,
    buildRound: buildRound,
    roundsState: roundsState,
    gridLayout: gridLayout,
    gridCells: gridCells,
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
