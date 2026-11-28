/* ============================================================
   🎨 color-match-core.js — v1 — «ألوانك»: الألوان اللي تليق على العميلة (بالكود، من غير AI ولا سيرفر)
   ------------------------------------------------------------
   طلب المالك (28-11-2026): حاجة في تطبيق إيشارب و Glow تساعد العميلة تعرف الألوان اللي تليق عليها.
   الفكرة (تحليل الألوان الموسمي المبسّط):
     · درجة البشرة تحت الجلد (undertone): دافي / بارد / محايد — من ٣ أسئلة سريعة
       (لون العروق · الدهب ولا الفضة · الأبيض الناصع ولا الأوف وايت) + قراية اختيارية
       من صورة: العميلة بتدوس على خدّها وبنقيس اللون (Lab) — وزنها أقل من الأسئلة
       لأن إضاءة الموبايل بتغيّر اللون.
     · العمق: فاتحة / قمحي / سمرا.
     ⇒ ٦ نتايج: ربيع · خريف · صيف · شتا · محايد هادي · محايد عميق — لكل واحدة ألوان
       قريبة من الوش، ألوان تبعد عنه، وترتيب عائلات الألوان بتاعة الكتالوج (نفس TONES بتاعة الأتيليه).
   ملف «منطق بس» (من غير DOM) — بيتختبر في Node وبيشتغل في المتصفح.
   ============================================================ */
(function (root) {
  "use strict";

  /* ---------- ١) اللون: sRGB → Lab ---------- */
  function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
  function rgbToLab(rgb) {
    var r = lin(rgb[0]), g = lin(rgb[1]), b = lin(rgb[2]);
    var x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    var y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
    var z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    var fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  /* ---------- ٢) قراية البشرة من نقطة في الصورة ----------
     hue في Lab: البشرة غالبًا بين ٤٠° و٧٥° (وصور الموبايل بتميل للأصفر، فنقطة النص ٥٧°). أصفر أكتر (زاوية أعلى) = دافي · وردي أكتر = بارد.
     القراية تقريبية (إضاءة الموبايل) → الناتج بين −١ و+١ وبيدخل بوزن أقل من الأسئلة.
     لون مش بشرة (رمادي/أزرق/غامق أوي) → ok:false وبيتجاهل. */
  var SKIN_MID = 57, SKIN_SPAN = 9;
  function readSkin(rgb) {
    if (!rgb || rgb.length < 3) return { ok: false };
    var lab = rgbToLab(rgb), L = lab[0], a = lab[1], b = lab[2];
    var chroma = Math.sqrt(a * a + b * b), hue = Math.atan2(b, a) * 180 / Math.PI;
    if (!(L >= 12 && L <= 93) || chroma < 7 || a < 2 || hue < 18 || hue > 88) return { ok: false, L: L, hue: hue };
    var warm = Math.max(-1, Math.min(1, (hue - SKIN_MID) / SKIN_SPAN));
    return { ok: true, L: L, hue: hue, warm: warm, depth: L >= 67 ? "light" : (L >= 52 ? "medium" : "deep"),
      lean: warm > 0.33 ? "warm" : (warm < -0.33 ? "cool" : "neutral") };
  }
  /* متوسط دايرة حوالين الدوسة من بيانات canvas (بيرمي أغمق وأفتح ١٥٪ — شعرة/لمعة). */
  function sampleCircle(data, w, h, cx, cy, radius) {
    var px = [], r2 = radius * radius;
    for (var y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(h - 1, Math.ceil(cy + radius)); y++) {
      for (var x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(w - 1, Math.ceil(cx + radius)); x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > r2) continue;
        var i = (y * w + x) * 4; if (data[i + 3] < 200) continue;
        px.push([data[i], data[i + 1], data[i + 2], data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114]);
      }
    }
    if (px.length < 12) return null;
    px.sort(function (p, q) { return p[3] - q[3]; });
    var cut = Math.floor(px.length * 0.15), keep = px.slice(cut, px.length - cut), s = [0, 0, 0];
    keep.forEach(function (p) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; });
    return [Math.round(s[0] / keep.length), Math.round(s[1] / keep.length), Math.round(s[2] / keep.length)];
  }

  /* ---------- ٣) الأسئلة ---------- */
  var QUESTIONS = [
    { id: "veins", q: "بصّي على عروق إيدك في نور النهار — لونها أقرب لإيه؟", opts: [
      { v: "green", t: "أخضر / زيتوني", w: 1 }, { v: "blue", t: "أزرق / بنفسجي", w: -1 }, { v: "mix", t: "الاتنين أو مش واضح", w: 0 }] },
    { id: "metal", q: "أنهي إكسسوار بينوّر وشّك أكتر؟", opts: [
      { v: "gold", t: "الدهبي", w: 1 }, { v: "silver", t: "الفضي", w: -1 }, { v: "both", t: "الاتنين زي بعض", w: 0 }] },
    { id: "white", q: "لما تلبسي طرحة بيضا — أنهي أحلى عليكي؟", opts: [
      { v: "off", t: "الأوف وايت / الكريمي", w: 1 }, { v: "pure", t: "الأبيض الناصع", w: -1 }, { v: "both", t: "مش فارقة", w: 0 }] },
    { id: "depth", q: "لون بشرتك؟", opts: [
      { v: "light", t: "فاتحة" }, { v: "medium", t: "قمحي" }, { v: "deep", t: "سمرا" }] }
  ];
  var PHOTO_WEIGHT = 0.75;

  /* ---------- ٤) النتايج ---------- */
  var SEASONS = {
    spring: { ar: "الربيع الدافي", line: "بشرتك دافية وفاتحة — الألوان المنوّرة الدافية بتدّي وشّك إشراقة.",
      best: [["مشمشي", "#F4B183"], ["كورال", "#F08A6B"], ["أوف وايت دافي", "#F5EBDD"], ["كاميل فاتح", "#D9B382"], ["أخضر تفاحي", "#A8C686"], ["تركواز فاتح", "#6CC5B0"], ["أصفر زبدة", "#F3DE8A"], ["وردي خوخي", "#F5B5A8"]],
      avoid: [["أسود", "#1D1C1C"], ["رمادي بارد", "#8E949C"], ["أبيض ناصع", "#FFFFFF"]],
      tones: ["beige", "white", "pink", "green", "brown", "navy"] },
    autumn: { ar: "الخريف الدافي", line: "بشرتك دافية — ألوان الأرض الغنية (زيتي، موكا، خردلي) بتطلّع جمالها.",
      best: [["زيتي", "#6B6B3A"], ["موكا", "#7A5A44"], ["كاميل", "#C19A6B"], ["خردلي", "#C9A227"], ["قرميدي", "#A6502E"], ["بيج دافي", "#D8C3A5"], ["تيل غامق", "#1F6F6B"], ["نبيتي دافي", "#7B2D26"]],
      avoid: [["وردي فاتح بارد", "#F3C6D8"], ["رمادي فضي", "#B8BEC6"], ["أبيض ناصع", "#FFFFFF"]],
      tones: ["brown", "green", "beige", "white", "pink", "navy"] },
    summer: { ar: "الصيف الهادي", line: "بشرتك باردة — الألوان الهادية المطفية (روز، لافندر، سماوي) أرقّ حاجة عليكي.",
      best: [["روز هادي", "#D8A7B1"], ["لافندر", "#B9A7D1"], ["أزرق سماوي", "#9DB7D5"], ["رمادي لؤلؤي", "#C9CCD1"], ["منت بارد", "#A8D5C5"], ["توتي هادي", "#A8627A"], ["كحلي هادي", "#4A5A7A"], ["أوف وايت بارد", "#EEF0F2"]],
      avoid: [["برتقالي", "#E8792B"], ["خردلي", "#C9A227"], ["بني محروق", "#7A4A24"]],
      tones: ["pink", "purple", "navy", "grey", "white", "green"] },
    winter: { ar: "الشتا الواضح", line: "بشرتك باردة وعميقة — الألوان الصريحة القوية (أسود، كحلي، نبيتي) بتليق عليكي جدًا.",
      best: [["أسود", "#1D1C1C"], ["أبيض ناصع", "#FFFFFF"], ["كحلي", "#1F2A4D"], ["نبيتي", "#6E1E3A"], ["زمردي", "#0F6B4F"], ["فوشيا", "#C2186B"], ["بنفسجي ملكي", "#5B2A86"], ["رمادي فحمي", "#3C3F44"]],
      avoid: [["بيج مصفر", "#D9C08C"], ["كاميل", "#C19A6B"], ["برتقالي", "#E8792B"]],
      tones: ["black", "navy", "purple", "pink", "white", "grey", "green"] },
    neutral_soft: { ar: "المحايد الهادي", line: "بشرتك بين الدافي والبارد — الدرجات الهادية المطفية (نود، روز خشبي، مريمي) أضمن اختيار.",
      best: [["نود", "#D9BFA9"], ["روز خشبي", "#C08E8A"], ["توب", "#A3968A"], ["أخضر مريمي", "#9CAF98"], ["أزرق دخاني", "#7F97A8"], ["موف هادي", "#A892A6"], ["أوف وايت", "#F1EBE1"], ["كاكاو بلبن", "#9A7B6A"]],
      avoid: [["ألوان نيون", "#D7F205"], ["برتقالي فاقع", "#FF6A13"], ["أسود قريب من الوش", "#1D1C1C"]],
      tones: ["beige", "pink", "grey", "green", "white", "brown", "purple"] },
    neutral_deep: { ar: "المحايد العميق", line: "بشرتك بين الدافي والبارد وعميقة — الألوان الغامقة الغنية (كحلي، زيتي، شوكولا) بتليق عليكي.",
      best: [["كحلي", "#24304F"], ["زيتي غامق", "#4F5637"], ["شوكولا", "#5A3E33"], ["نبيتي", "#6A2434"], ["تيل", "#1E5F63"], ["رمادي فحمي", "#44474C"], ["أوف وايت", "#EFE9DD"], ["باذنجاني", "#4E2A4F"]],
      avoid: [["باستيل باهت", "#F1E3EA"], ["بيج بلون البشرة", "#C9A886"], ["أصفر فاتح", "#F6EDA8"]],
      tones: ["navy", "green", "brown", "pink", "grey", "white", "purple", "black"] }
  };

  /* answers: {veins, metal, white, depth} (أي واحد ممكن يبقى ناقص) · skin: ناتج readSkin أو null */
  function analyze(answers, skin) {
    answers = answers || {};
    var score = 0, answered = 0;
    QUESTIONS.forEach(function (Q) {
      if (Q.id === "depth") return;
      var o = Q.opts.filter(function (x) { return x.v === answers[Q.id]; })[0];
      if (o) { score += o.w; answered++; }
    });
    var usedPhoto = !!(skin && skin.ok);
    if (usedPhoto) score += skin.warm * PHOTO_WEIGHT;
    if (!answered && !usedPhoto) return null;
    var undertone = score >= 1 ? "warm" : (score <= -1 ? "cool" : "neutral");
    var depth = /^(light|medium|deep)$/.test(answers.depth || "") ? answers.depth : (usedPhoto ? skin.depth : "medium");
    var season = undertone === "warm" ? (depth === "light" ? "spring" : "autumn")
      : undertone === "cool" ? (depth === "deep" ? "winter" : "summer")
      : (depth === "deep" ? "neutral_deep" : "neutral_soft");
    return { season: season, undertone: undertone, depth: depth, score: Math.round(score * 100) / 100, usedPhoto: usedPhoto,
      sure: Math.abs(score) >= 2 ? "high" : (Math.abs(score) >= 1 || undertone === "neutral" ? "mid" : "low") };
  }

  /* ---------- ٥) ربط بالكتالوج: عائلة اللون من اسم اللون/المنتج (نفس كلمات الأتيليه) ---------- */
  var TONE_WORDS = [["black", /أسود|اسود|نوار|ليلي/], ["purple", /بنفسج|ليلك|موف|لافندر/], ["pink", /روز|وردي|بينك|أحمر|احمر|بورجندي|نبيتي|فوشيا|خوخي|كورال/],
    ["navy", /كحلي|أزرق|ازرق|لبني|نيفي|سماوي|تركواز|بترولي/], ["green", /أخضر|اخضر|زيتي|منت|زيتون|مريمي|زمردي|فستقي/], ["brown", /بني|موكا|كاميل|شوكولا|قهوة|كافيه|جملي|قرميدي|خردلي/],
    ["beige", /بيج|رملي|كريمي|توب|نود|كاكي|حجري|مشمشي/], ["white", /أبيض|ابيض|أوف|اوف|لؤلؤي|سكري/], ["grey", /رمادي|رصاصي|فضي|فحمي|دخاني|سيلفر/]];
  function toneFromName(name) {
    var n = String(name || ""); if (!n) return "";
    for (var i = 0; i < TONE_WORDS.length; i++) if (TONE_WORDS[i][1].test(n)) return TONE_WORDS[i][0];
    return "";
  }
  /* items: [{id, title, toneText, ...}] → اللي لونهم من ألوان الموسم، بترتيب أولوية الألوان، وقطعة واحدة لكل (عنوان+لون). */
  function pick(items, season, max) {
    var S = SEASONS[season]; if (!S) return [];
    var out = [], seen = {};
    (items || []).forEach(function (it, idx) {
      if (!it) return;
      var tone = it.tone || toneFromName(it.toneText);
      var rank = S.tones.indexOf(tone); if (rank < 0) return;
      var k = String(it.title || it.id) + "|" + tone; if (seen[k]) return; seen[k] = 1;
      out.push({ item: it, tone: tone, rank: rank, idx: idx });
    });
    out.sort(function (a, b) { return a.rank - b.rank || a.idx - b.idx; });
    return out.slice(0, max || 12).map(function (x) { return x.item; });
  }

  var API = { rgbToLab: rgbToLab, readSkin: readSkin, sampleCircle: sampleCircle, QUESTIONS: QUESTIONS, SEASONS: SEASONS,
    analyze: analyze, toneFromName: toneFromName, pick: pick, PHOTO_WEIGHT: PHOTO_WEIGHT };
  root.ColorMatch = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
