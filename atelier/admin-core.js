/* ============================================================
   🗂️ admin-core.js — منطق صفحة إدارة الأتيليه (دوال نقية بس)
   ------------------------------------------------------------
   · تجميع الصور المتشابهة (نفس المنتج متصوّر كذا مرة) — بصمة شكل
     (dHash) + لون القماش.
   · اسم مبدئي من لون القماش («طرحة كحلي»).
   · تحويل القايمة لشكل المستند اللي بيتحفظ.
   الصفحة (admin.html) بتحسب البصمات من الـcanvas وتنادي الدوال دي.
   ============================================================ */
(function (root) {
  "use strict";

  /* dHash ٩×٨: كل بكسل أفتح من اللي جنبه = ١. gray = مصفوفة ٧٢ قيمة
     (٩ عرض × ٨ ارتفاع) بالترتيب صف صف. بيرجّع نص ٦٤ حرف 0/1. */
  function dHash(gray) {
    var bits = "";
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 8; x++) bits += gray[y * 9 + x] > gray[y * 9 + x + 1] ? "1" : "0";
    }
    return bits;
  }
  function hamming(a, b) {
    var d = 0;
    for (var i = 0; i < a.length; i++) if (a.charAt(i) !== b.charAt(i)) d++;
    return d;
  }
  function colorDist(a, b) {
    var dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  /* مشابهتين = نفس المنتج: الشكل قريب جدًا **واللون قريب**، أو الشكل
     قريب واللون شبه متطابق (لقطتين لنفس الطرحة من زاوية تانية).
     ⚠️ اللون شرط دايمًا: إسدالين على نفس المانيكان ونفس الخلفية
        شكلهم واحد تقريبًا — اللي بيفرّقهم اللون بس. */
  function isSimilar(a, b) {
    var h = hamming(a.hash, b.hash), c = colorDist(a.color, b.color);
    return (h <= 8 && c <= 40) || (h <= 18 && c <= 14);
  }

  /* تجميع بـunion-find — بيرجّع مجموعات من الأرقام (index) بنفس ترتيب
     أول ظهور. features = [{hash, color:[r,g,b]}] */
  function groupSimilar(features) {
    var parent = features.map(function (_, i) { return i; });
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    for (var i = 0; i < features.length; i++) {
      for (var j = i + 1; j < features.length; j++) {
        if (isSimilar(features[i], features[j])) {
          var a = find(i), b = find(j);
          if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
        }
      }
    }
    var groups = {}, order = [];
    features.forEach(function (_, i) {
      var r = find(i);
      if (!groups[r]) { groups[r] = []; order.push(r); }
      groups[r].push(i);
    });
    return order.map(function (r) { return groups[r]; });
  }

  /* أسماء الألوان — أقرب لون للون القماش (من غير الخلفية البيضا) */
  var COLORS = [
    ["أسود", [28, 27, 28]], ["فحمي", [62, 60, 60]], ["رمادي", [128, 128, 126]], ["فضّي", [186, 186, 184]],
    ["أوف وايت", [236, 230, 218]], ["بيج", [214, 196, 168]], ["رملي", [190, 166, 130]], ["كاميل", [168, 128, 86]],
    ["موكا", [120, 92, 74]], ["بني", [92, 62, 44]], ["كحلي", [40, 48, 82]], ["أزرق", [62, 96, 160]],
    ["لبني", [160, 192, 220]], ["زيتي", [96, 102, 66]], ["أخضر", [64, 120, 84]], ["منت", [170, 206, 186]],
    ["روز", [214, 160, 166]], ["بينك", [226, 130, 160]], ["بنفسجي", [120, 70, 140]], ["ليلكي", [178, 150, 196]],
    ["بورجندي", [96, 30, 44]], ["أحمر", [176, 40, 44]], ["مستردة", [200, 160, 50]], ["برتقالي", [214, 120, 60]]
  ];
  function colorName(rgb) {
    var best = COLORS[0], bd = Infinity;
    COLORS.forEach(function (c) { var d = colorDist(rgb, c[1]); if (d < bd) { bd = d; best = c; } });
    return best[0];
  }
  function defaultName(line, rgb) {
    var noun = line === "isdal" ? "إسدال" : "طرحة";
    return noun + " " + colorName(rgb);
  }

  /* أسماء مكررة → نضيف رقم (طرحة كحلي ٢) عشان العميلة تفرّق */
  function uniqueNames(names) {
    var seen = {};
    return names.map(function (n) {
      var k = String(n || "").trim() || "قطعة";
      seen[k] = (seen[k] || 0) + 1;
      return seen[k] === 1 ? k : k + " " + Number(seen[k]).toLocaleString("ar-EG");
    });
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* تنظيف عنصر قبل الحفظ — أرقام وأطوال مضبوطة، ومفيش صور في المستند */
  function cleanItem(it) {
    var price = Math.max(0, Math.round(Number(it.price) || 0));
    return {
      id: String(it.id || newId()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40),
      name: String(it.name || "قطعة").trim().slice(0, 60),
      price: price,
      line: String(it.line || "other").replace(/[^a-z]/g, "").slice(0, 12) || "other",
      barcode: String(it.barcode || "").replace(/[^\w-]/g, "").slice(0, 40),
      // 🎨 الموديل: القطع اللي ليها نفس الموديل = ألوان لبعض (التجربة بتجيبهم مع بعض)
      family: String(it.family || "").replace(/[<>"]/g, "").trim().slice(0, 40),
      active: it.active !== false
    };
  }

  var API = {
    dHash: dHash, hamming: hamming, colorDist: colorDist, isSimilar: isSimilar,
    groupSimilar: groupSimilar, colorName: colorName, defaultName: defaultName,
    uniqueNames: uniqueNames, cleanItem: cleanItem, newId: newId
  };
  root.AdminCore = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : this);
