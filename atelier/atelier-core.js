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
    // 🧣 ميسي شيفون كويتي — موديل واحد بـ٥ ألوان بـ٤٩٠. العمود الرابع اسم
    //    اللون، والخامس صور زيادة لنفس اللون، والسادس السعر.
    //    ⚠️ السعر لازم يطابق HOUSE_PRICES في functions/atelierOrders.js.
    ["kinar-noir-blanc", "كينار لينن كويتي ليدي أسود بكنار أبيض",  "kinar", "أسود بكنار أبيض",  ["kinar-noir-blanc-2", "kinar-noir-blanc-3", "kinar-noir-blanc-4"], 680],
    ["kinar-noir-gris",  "كينار لينن كويتي ليدي أسود بكنار رمادي", "kinar", "أسود بكنار رمادي", ["kinar-noir-gris-2", "kinar-noir-gris-3", "kinar-noir-gris-4"], 680],
    ["kinar-noir-beige", "كينار لينن كويتي ليدي أسود بكنار بيج",   "kinar", "أسود بكنار بيج",   ["kinar-noir-beige-2"], 680],
    ["kinar-noir-lilas", "كينار لينن كويتي ليدي أسود بكنار ليلكي", "kinar", "أسود بكنار ليلكي", ["kinar-noir-lilas-2", "kinar-noir-lilas-3"], 680],
    ["kinar-ivoire",     "كينار لينن كويتي ليدي أوف وايت بكنار رمادي", "kinar", "أوف وايت بكنار رمادي", ["kinar-ivoire-2"], 680],
    ["kinar-taupe",      "كينار لينن كويتي ليدي توب بكنار أبيض",   "kinar", "توب بكنار أبيض",   ["kinar-taupe-2"], 680],
    ["kinar-beige-noir", "كينار لينن كويتي ليدي بيج بكنار أسود",   "kinar", "بيج بكنار أسود",   [], 680],
    ["kinar-beige-fume", "كينار لينن كويتي ليدي بيج بكنار فحمي",   "kinar", "بيج بكنار فحمي",   [], 680],
    ["linen-noir",       "ميسي شيفون كويتي أسود",        "chiffon", "أسود",        ["linen-noir-2"], 490],
    ["chiffon-charcoal", "ميسي شيفون كويتي رمادي فحمي",  "chiffon", "رمادي فحمي",  [], 490],
    ["chiffon-gris",     "ميسي شيفون كويتي رمادي فاتح",  "chiffon", "رمادي فاتح",  ["chiffon-gris-2", "chiffon-gris-3"], 490],
    ["linen-fume",       "ميسي شيفون كويتي رمادي دخاني", "chiffon", "رمادي دخاني", ["linen-fume-2", "linen-fume-3"], 490],
    ["linen-taupe",      "ميسي شيفون كويتي رمادي توب",  "chiffon", "رمادي توب",   ["linen-taupe-2"], 490],
    ["chiffon-khaki",    "ميسي شيفون كويتي كاكي",       "chiffon", "كاكي",        ["chiffon-khaki-2", "chiffon-khaki-3", "chiffon-khaki-4"], 490],
    ["chiffon-stone",    "ميسي شيفون كويتي بيج حجري",   "chiffon", "بيج حجري",    ["chiffon-stone-2", "chiffon-stone-3"], 490],
    ["chiffon-ivory",    "ميسي شيفون كويتي أوف وايت",   "chiffon", "أوف وايت",    ["chiffon-ivory-2"], 490],
    ["linen-rose",       "ميسي شيفون كويتي روز",        "chiffon", "روز",         [], 490],
    ["linen-violet",     "ميسي شيفون كويتي بنفسجي",     "chiffon", "بنفسجي",      ["linen-violet-2"], 490]
  ];
  var LINES = [
    { id: "all",    ar: "الكل",          en: "All" },
    { id: "crepe",  ar: "الكريب",        en: "Crepe" },
    { id: "plisse", ar: "البليسيه",      en: "Plissé" },
    { id: "mono",   ar: "المونوجرام",    en: "Monogram" },
    { id: "zebre",  ar: "الزيبرا",       en: "Zebra" },
    { id: "kinar",  ar: "الكينار لينن",  en: "Kinar Linen" },
    { id: "chiffon", ar: "الشيفون",      en: "Chiffon" },
    { id: "isdal",  ar: "الإسدال",       en: "Prayer Dresses" },
    { id: "other",  ar: "قطع أخرى",      en: "More Pieces" }
  ];
  function lineName(id, lang) {
    for (var i = 0; i < LINES.length; i++) if (LINES[i].id === id) return lang === "en" ? LINES[i].en : LINES[i].ar;
    return "";
  }
  function houseCollection(base) {
    var dir = base || "collection/";
    return HOUSE.map(function (h) {
      return { id: "house-" + h[0], houseKey: h[0], galleryId: "", barcode: "", name: h[1],
               line: h[2], family: h[2], kind: h[2] === "isdal" ? "isdal" : "hijab", price: Number(h[5]) || 0,
               img: dir + h[0] + ".jpg", tryable: true, house: true,
               colorName: h[3] || "", gallery: (h[4] || []).map(function (f) { return dir + f + ".jpg"; }) };
    });
  }

  /* 🆕 قطع الدار اللي لوحة الإدارة لسه ما شافتهاش. اللوحة بتكتب
     houseSeen (كل مفاتيح الدار وقت الحفظ) — فاللي اتمسح من اللوحة مبيرجعش،
     واللي اتضاف للدار بعد كده بيظهر على الموقع وفي اللوحة لوحده.
     حفظ قديم من غير houseSeen = شاف الشيفون التسعة بس. */
  var LEGACY_HOUSE = ["linen-noir", "chiffon-charcoal", "linen-fume", "linen-taupe", "chiffon-khaki",
                      "chiffon-stone", "chiffon-ivory", "linen-rose", "linen-violet"];
  function houseSeenFrom(doc) {
    if (doc && Array.isArray(doc.houseSeen)) return doc.houseSeen.map(String);
    return doc && Array.isArray(doc.items) && doc.items.length ? LEGACY_HOUSE.slice() : [];
  }
  function houseUnseen(doc, base) {
    var seen = houseSeenFrom(doc);
    return houseCollection(base).filter(function (h) { return seen.indexOf(h.houseKey) < 0; });
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
               // من غير موديل = قطعة لوحدها (مش كل الكريب في كارت واحد)
               family: String(it.family || "").trim() || ("solo-" + it.id),
               colorName: String(it.colorName || "").slice(0, 30),
               nameEn: String(it.nameEn || "").slice(0, 60), colorEn: String(it.colorEn || "").slice(0, 40),
               familyEn: String(it.familyEn || "").slice(0, 40), extras: Math.max(0, Number(it.extras) || 0),
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

  /* 🗂️ الموديلات: القطع اللي بنفس الموديل بتتعرض كارت واحد ورف ألوان،
     بدل عشرات الكروت المتشابهة. الترتيب = أول ظهور. */
  var LINE_TITLE = { crepe: "كريب", plisse: "بليسيه", mono: "مونوجرام", zebre: "زيبرا", chiffon: "ميسي شيفون كويتي", kinar: "كينار لينن كويتي ليدي",
                     isdal: "إسدال", other: "قطع مختارة", shop: "جديد" };
  var LINE_TITLE_EN = { crepe: "Crepe", plisse: "Plissé", mono: "Monogram", zebre: "Zebra", chiffon: "Messi Kuwaiti Chiffon",
                        kinar: "Kuwaiti Lady Kinar Linen", isdal: "Prayer Dress", other: "Selected Pieces", shop: "New" };
  function modelTitle(items) {
    var a = items[0] || {};
    var fam = String(a.family || "");
    if (items.length === 1) return a.name || "قطعة";
    if (a.modelTitle) return a.modelTitle;              // اسم الموديل بالإنجليزي (localize)
    if (fam && !LINE_TITLE[fam]) return fam;            // اسم موديل من صفحة الإدارة
    return LINE_TITLE[a.line] || a.name || "قطعة";
  }
  function groupModels(products) {
    var map = {}, out = [];
    (products || []).forEach(function (p) {
      var k = (p.kind || "hijab") + "|" + (familyOf(p) || p.id);
      if (!map[k]) { map[k] = { key: k, items: [] }; out.push(map[k]); }
      map[k].items.push(p);
    });
    out.forEach(function (m) { m.title = modelTitle(m.items); m.line = m.items[0].line; });
    return out;
  }

  /* 🎨 رف الألوان — درجات كتير صعب تتسمّى، فبنجمّعها في عائلات لون
     (من لون القماش في الصورة) والعميلة بتفلتر بيها بنقطة لون. */
  var TONES = [
    { id: "black",  ar: "أسود", en: "Black",         hex: "#1d1c1c", rgb: [30, 29, 30] },
    { id: "grey",   ar: "رمادي", en: "Grey",        hex: "#8d8b88", rgb: [135, 133, 130] },
    { id: "white",  ar: "أبيض وأوف", en: "White & Ivory",    hex: "#efe8dc", rgb: [236, 230, 218] },
    { id: "beige",  ar: "بيج ورملي", en: "Beige & Sand",    hex: "#cdb48e", rgb: [200, 176, 140] },
    { id: "brown",  ar: "بني وموكا", en: "Brown & Mocha",    hex: "#7a5a44", rgb: [118, 88, 66] },
    { id: "navy",   ar: "كحلي وأزرق", en: "Navy & Blue",   hex: "#2f3a5e", rgb: [48, 60, 100] },
    { id: "green",  ar: "أخضر وزيتي", en: "Green & Olive",   hex: "#5f6b4a", rgb: [92, 108, 74] },
    { id: "pink",   ar: "وردي وأحمر", en: "Pink & Red",   hex: "#c77f8e", rgb: [196, 120, 134] },
    { id: "purple", ar: "بنفسجي", en: "Purple",       hex: "#7b528f", rgb: [122, 80, 142] }
  ];
  /* لو اسم اللون معروف (مكتوب في المجموعة) بناخد العائلة منه — أدق من
     الصورة (الإضاءة بتخلّي البنفسجي يبان كحلي والروز يبان بيج). */
  var TONE_WORDS = [["black", /أسود|اسود|نوار|ليلي/], ["purple", /بنفسج|ليلك|موف/], ["pink", /روز|وردي|بينك|أحمر|بورجندي|نبيتي/],
    ["navy", /كحلي|أزرق|ازرق|لبني|نيفي/], ["green", /أخضر|اخضر|زيتي|منت|زيتون/], ["brown", /بني|موكا|كاميل|شوكولا|قهوة/],
    ["beige", /بيج|رملي|كريمي|توب|نود|كاكي|حجري/], ["white", /أبيض|ابيض|أوف|اوف|لؤلؤي|سكري/], ["grey", /رمادي|رصاصي|فضي|فحمي|دخاني/]];
  function toneFromName(name) {
    var n = String(name || "");
    // "رمادي توب" = رمادي (أول كلمة هي اللون الأساسي)
    var first = n.split(/\s+/)[0];
    for (var i = 0; i < TONE_WORDS.length; i++) if (TONE_WORDS[i][1].test(first)) return TONE_WORDS[i][0];
    for (var j = 0; j < TONE_WORDS.length; j++) if (TONE_WORDS[j][1].test(n)) return TONE_WORDS[j][0];
    return "";
  }
  function toneOf(rgb) {
    if (!rgb) return "";
    var best = TONES[0], bd = Infinity;
    TONES.forEach(function (t) {
      var d = Math.pow(rgb[0] - t.rgb[0], 2) + Math.pow(rgb[1] - t.rgb[1], 2) + Math.pow(rgb[2] - t.rgb[2], 2);
      if (d < bd) { bd = d; best = t; }
    });
    return best.id;
  }

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

  function fmtPrice(n, lang) {
    var v = Math.round(Number(n) || 0);
    if (!v) return "";
    return lang === "en" ? v.toLocaleString("en-US") + " EGP" : v.toLocaleString("ar-EG") + " ج.م";
  }

  /* 🌐 النسخة الإنجليزي — أسماء الألوان بتتترجم كلمة كلمة («أسود بكنار
     أبيض» → «Black with White Border»)، واسم الموديل من LINE_TITLE_EN أو
     اللي اتكتب في صفحة الإدارة. القيم العربي بتفضل في nameAr/colorAr. */
  var COLOR_WORDS = {
    "أسود": "Black", "اسود": "Black", "أبيض": "White", "ابيض": "White", "رمادي": "Grey", "فحمي": "Charcoal",
    "دخاني": "Smoke", "توب": "Taupe", "كاكي": "Khaki", "بيج": "Beige", "حجري": "Stone", "روز": "Rose",
    "بنفسجي": "Violet", "ليلكي": "Lilac", "كحلي": "Navy", "أزرق": "Blue", "ازرق": "Blue", "لبني": "Baby Blue",
    "زيتي": "Olive", "أخضر": "Green", "اخضر": "Green", "منت": "Mint", "بينك": "Pink", "وردي": "Pink",
    "بورجندي": "Burgundy", "نبيتي": "Wine", "أحمر": "Red", "احمر": "Red", "مستردة": "Mustard", "برتقالي": "Orange",
    "موكا": "Mocha", "بني": "Brown", "كاميل": "Camel", "رملي": "Sand", "فضّي": "Silver", "فضي": "Silver",
    "سكري": "Sugar", "كريمي": "Cream", "نود": "Nude", "موف": "Mauve", "زيتوني": "Olive", "قهوة": "Coffee"
  };
  var COLOR_MOD = { "فاتح": "Light", "غامق": "Dark", "داكن": "Dark" };
  function colorPhraseEn(ar) {
    var w = String(ar || "").trim().replace(/^أوف وايت|^اوف وايت/, "OFFWHITE").split(/\s+/).filter(Boolean);
    if (!w.length) return "";
    var out = [], mod = "";
    for (var i = 0; i < w.length; i++) {
      var x = w[i];
      if (x === "OFFWHITE") { out.push("Off-White"); continue; }
      if (COLOR_MOD[x]) { mod = COLOR_MOD[x]; continue; }
      if (COLOR_WORDS[x]) { out.push(COLOR_WORDS[x]); continue; }
      return "";                                         // كلمة مش معروفة → منترجمش نص
    }
    // العربي: الاسم قبل الصفة («رمادي فحمي») — الإنجليزي بالعكس (Charcoal Grey)
    return (mod ? mod + " " : "") + out.reverse().join(" ");
  }
  function colorToEn(ar) {
    var s = String(ar || "").trim();
    if (!s) return "";
    var m = /^(.+?)\s+بكنار\s+(.+)$/.exec(s);          // «X بكنار Y»
    if (m) { var a = colorPhraseEn(m[1]), b = colorPhraseEn(m[2]); return a && b ? a + " with " + b + " Border" : ""; }
    return colorPhraseEn(s);
  }
  function titleEnFor(p) {
    if (p.familyEn) return String(p.familyEn);
    var fam = String(p.family || "");
    if (LINE_TITLE_EN[fam]) return LINE_TITLE_EN[fam];
    for (var k in LINE_TITLE) if (LINE_TITLE[k] === fam && LINE_TITLE_EN[k]) return LINE_TITLE_EN[k];
    return "";
  }
  function localizeProduct(p, lang) {
    if (lang !== "en" || !p || p.nameAr !== undefined) return p;
    p.nameAr = p.name; p.colorAr = p.colorName || "";
    var title = titleEnFor(p), color = p.colorEn || colorToEn(p.colorName);
    p.colorName = color || p.colorName || "";
    if (title) p.modelTitle = title;
    p.name = p.nameEn || (title && color ? title + " — " + color : title || p.name);
    return p;
  }

  var API = {
    BATCH_SIZE: BATCH_SIZE,
    HOUSE: HOUSE,
    LINES: LINES,
    houseCollection: houseCollection,
    LINE_TITLE_EN: LINE_TITLE_EN,
    colorToEn: colorToEn,
    localizeProduct: localizeProduct,
    houseSeenFrom: houseSeenFrom,
    houseUnseen: houseUnseen,
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
    LINE_TITLE: LINE_TITLE,
    modelTitle: modelTitle,
    groupModels: groupModels,
    TONES: TONES,
    toneOf: toneOf,
    toneFromName: toneFromName,
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
