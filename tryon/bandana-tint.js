/* ============================================================
   🎨 bandana-tint.js — تغيير لون البندانة في صورة الـAI
   ------------------------------------------------------------
   الفكرة: بنولّد صورة **واحدة** فيها بندانة فاتحة محايدة، وبعدين
   بنغيّر لونها بالكود على جهاز العميلة. النتيجة: كل الألوان
   بتكلفة توليد واحد.

   ⚠️ ليه ده شغّال أصلًا: إحنا مش بندوّر على البندانة باللون (ده
      مستحيل — الخلفية والجلد فاتحين برضه). إحنا **عارفين مكانها**
      من معالم الوش، فبنلوّن جوّه المنطقة دي بس.

   🔑 الحفاظ على الجودة: بنغيّر الصبغة والتشبّع، وبنسيب **الإضاءة
      النسبية** زي ما هي — فالطيّات والظلال والكرمشة كلها بتفضل.
      لو استبدلنا البكسل باللون مباشرة، كانت هتبقى رقعة مسطّحة.

   📦 مستقل عن أي مكتبة — كانفاس عادي، وبيشتغل على الموبايل.
   ============================================================ */
(function (root) {
  'use strict';

  /* ---------- تحويلات اللون ---------- */
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  function hslToRgb(h, s, l) {
    if (s === 0) { var v = Math.round(l * 255); return [v, v, v]; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return [Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
            Math.round(hue2rgb(p, q, h) * 255),
            Math.round(hue2rgb(p, q, h - 1 / 3) * 255)];
  }
  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
  }

  /* ---------- منطقة البندانة من معالم الوش ----------
     البندانة شريط بيمشي على خط الشعر. بنبنيه من ٣ نقط زي باقي
     المحرك (صدغ شمال · صدغ يمين · الجبهة) عشان يلف مع ميل الراس.
     ⚠️ مش مستطيل: قوس بيعلى في النص — الشكل الطبيعي لخط الشعر. */
  function bandRegion(an, opts) {
    opts = opts || {};
    var widen = opts.widen != null ? opts.widen : 1.06;
    var up = opts.up != null ? opts.up : 0.22;      // فوق الجبهة
    var down = opts.down != null ? opts.down : 0.06; // تحتها شوية
    var cx = (an.l[0] + an.r[0]) / 2, cy = (an.l[1] + an.r[1]) / 2;
    var ux = an.top[0] - an.chin[0], uy = an.top[1] - an.chin[1];
    var fh = Math.hypot(ux, uy) || 1;
    ux /= fh; uy /= fh;
    var wide = function (p) { return [cx + (p[0] - cx) * widen, cy + (p[1] - cy) * widen]; };
    var L = wide(an.l), R = wide(an.r);
    var mv = function (p, k) { return [p[0] + ux * k * fh, p[1] + uy * k * fh]; };
    return {
      outer: [mv(L, up * 0.45), mv(an.top, up), mv(R, up * 0.45)],
      inner: [mv(L, -down), mv(an.top, down * 0.5), mv(R, -down)],
      up: [ux, uy], faceH: fh
    };
  }

  /* ---------- الرسم ---------- */
  // بيرسم القناع كمسار منحني بين القوسين
  function pathRegion(g, reg) {
    var o = reg.outer, i = reg.inner;
    g.beginPath();
    g.moveTo(o[0][0], o[0][1]);
    g.quadraticCurveTo(o[1][0], o[1][1] - reg.faceH * 0.05, o[2][0], o[2][1]);
    g.lineTo(i[2][0], i[2][1]);
    g.quadraticCurveTo(i[1][0], i[1][1], i[0][0], i[0][1]);
    g.closePath();
  }

  /* 🎨 التلوين نفسه — على بكسلات القناع بس.
     targetHex = اللون المطلوب · mask = ألفا 0..255 لكل بكسل */
  function tintPixels(data, mask, w, h, targetHex) {
    var t = hexToRgb(targetHex);
    if (!t) return false;
    var thsl = rgbToHsl(t[0], t[1], t[2]);
    var th = thsl[0], ts = thsl[1], tl = thsl[2];

    // متوسط إضاءة المنطقة + **مداها الحقيقي** — الاتنين لازمين:
    // المتوسط هو نقطة الصفر، والمدى بيحدد قد إيه نزحزح للون الطرفي.
    var sum = 0, n = 0, i;
    var mnL = 9, mxL = -1;
    for (i = 0; i < mask.length; i++) {
      if (mask[i] > 8) {
        var li = rgbToHsl(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])[2];
        sum += li; n++;
        if (li < mnL) mnL = li;
        if (li > mxL) mxL = li;
      }
    }
    if (!n) return false;
    var medL = sum / n;
    // نص المدى — بنستخدم المئين ٩٠ تقريبًا عن طريق قص الأطراف
    var dev = (mxL - mnL) / 2;

    for (i = 0; i < mask.length; i++) {
      var m = mask[i] / 255;
      if (m <= 0.03) continue;
      var p = i * 4;
      var hsl = rgbToHsl(data[p], data[p + 1], data[p + 2]);
      /* 🔑 هنا سر الجودة: بنستبدل الصبغة، وبنسيب **انحراف** الإضاءة
         عن المتوسط زي ما هو. الطيّة اللي كانت أغمق ٠.١ بتفضل أغمق
         ٠.١ باللون الجديد — فالكرمشة والظل بيعيشوا.

         ⚠️ اللون الطرفي (أبيض/أسود) إضاءته الهدف قريبة من الحافة،
            فالطيّات بتتقص عند السقف/القاع وتتمسح.
         ✅ الحل: نزحزح المركز لجوّه **بقد ما الطيّات الفعلية تحتاج
            بس**. جربنا قبل كده نضغط النطاق (ضيّع ٩٨٪ من التباين)
            وجربنا مدى ثابت عريض (خلّى كل الألوان بنفس الدرجة —
            الأبيض مابقاش أبيض). الصح: نقيس المدى **الحقيقي** بتاع
            الطيّات ونزحزح بيه هو، فاللون بيفضل هو واللمعة بتفضل. */
      var half = (dev > 0 ? dev : 0.08) * 0.85;   // نص المدى الحقيقي
      if (half > 0.30) half = 0.30;               // حارس لصور غريبة
      var mid = tl;
      if (tl - half < 0.04) mid = 0.04 + half;
      else if (tl + half > 0.96) mid = 0.96 - half;
      var nl = mid + (hsl[2] - medL) * 0.85;
      if (nl < 0.02) nl = 0.02;
      if (nl > 0.98) nl = 0.98;
      // التشبّع بيتبع الهدف، وبيقل شوية في المناطق الرمادية أصلًا
      var ns = ts * (0.6 + 0.4 * Math.min(1, hsl[1] * 2.5));
      var rgb = hslToRgb(th, ns, nl);
      data[p]     = Math.round(data[p]     * (1 - m) + rgb[0] * m);
      data[p + 1] = Math.round(data[p + 1] * (1 - m) + rgb[1] * m);
      data[p + 2] = Math.round(data[p + 2] * (1 - m) + rgb[2] * m);
    }
    return true;
  }

  /* ============================================================
     الواجهة: صورة + معالم + لون → كانفاس ملوّن
     ============================================================ */
  function recolorBandana(img, anchors, targetHex, opts) {
    opts = opts || {};
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    var c = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    if (!c) return null;
    c.width = w; c.height = h;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);

    // ١) قناع المنطقة على كانفاس منفصل — بحافة ناعمة
    var mc = document.createElement('canvas');
    mc.width = w; mc.height = h;
    var mg = mc.getContext('2d', { willReadFrequently: true });
    var reg = bandRegion(anchors, opts);
    mg.fillStyle = '#fff';
    // الحافة الناعمة بتخلي الانتقال مايبانش كقص
    if (mg.filter !== undefined) mg.filter = 'blur(' + (opts.feather || 6) + 'px)';
    pathRegion(mg, reg);
    mg.fill();
    var mask = mg.getImageData(0, 0, w, h).data;

    // نحوّل القناع لمصفوفة ألفا واحدة (أخف في اللوب)
    var flat = new Uint8Array(w * h);
    for (var i = 0; i < flat.length; i++) flat[i] = mask[i * 4 + 3];

    // ٢) التلوين
    var im = g.getImageData(0, 0, w, h);
    var ok = tintPixels(im.data, flat, w, h, targetHex);
    if (!ok) return null;
    g.putImageData(im, 0, 0);
    return c;
  }

  var API = {
    rgbToHsl: rgbToHsl,
    hslToRgb: hslToRgb,
    hexToRgb: hexToRgb,
    bandRegion: bandRegion,
    tintPixels: tintPixels,
    recolorBandana: recolorBandana
  };
  root.BandanaTint = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
