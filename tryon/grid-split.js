/* ============================================================
   ✂️ grid-split.js — قص الخانات من صورة شبكية مولّدة
   ------------------------------------------------------------
   الفكرة: توليد **واحد** يطلّع صورة فيها نفس الطرحة بكل ألوان
   البندانة المتاحة. العميلة بتقلّب بينهم — كل تقليبة قص من صورة
   موجودة، يعني **فوري ومجاني** ومش بيتحسب على سقف التوليد.

   ⚠️ ليه كاشف مش مقاسات ثابتة: الموديل مش مضمون يطلّع نفس الشبكة
      كل مرة. لو افترضنا "٢×٢ بالظبط" وطلّع ٣ خانات أو غيّر
      الفواصل، القص هيقطع وشوش. فبندوّر على الفواصل الحقيقية
      في الصورة، وبنرجع فشل واضح لو الشكل مش متوقع — أحسن من
      خانات مقطوعة غلط.

   📐 الفاصل = صف/عمود **موحّد اللون** (تباينه شبه صفر) وممتد على
      طول الصورة. ده شكل الفواصل في كل الشبكات اللي اتجربت.
   ============================================================ */
(function (root) {
  'use strict';

  /* انحراف معياري لكل عمود (أو صف) — الفاصل تباينه واطي جدًا.
     data = بيانات RGBA من كانفاس */
  function lineVariance(data, w, h, vertical) {
    var outN = vertical ? w : h;
    var inN = vertical ? h : w;
    var out = new Float32Array(outN);
    for (var i = 0; i < outN; i++) {
      var sum = 0, sq = 0;
      for (var j = 0; j < inN; j++) {
        var x = vertical ? i : j, y = vertical ? j : i;
        var p = (y * w + x) * 4;
        var v = (data[p] + data[p + 1] + data[p + 2]) / 3;
        sum += v; sq += v * v;
      }
      var m = sum / inN;
      var varr = sq / inN - m * m;
      out[i] = varr > 0 ? Math.sqrt(varr) : 0;
    }
    return out;
  }

  /* تجميع الأسطر المتجاورة الواطية في "فواصل" */
  function findSeparators(varr, opts) {
    opts = opts || {};
    var thr = opts.threshold != null ? opts.threshold : 14;
    var minRun = opts.minRun != null ? opts.minRun : 2;
    var runs = [], start = -1, i;
    for (i = 0; i < varr.length; i++) {
      if (varr[i] < thr) { if (start < 0) start = i; }
      else { if (start >= 0 && i - start >= minRun) runs.push([start, i - 1]); start = -1; }
    }
    if (start >= 0 && varr.length - start >= minRun) runs.push([start, varr.length - 1]);
    return runs;
  }

  /* الفواصل الداخلية بس — بنشيل اللي على الحواف (إطار مش فاصل).
     ⚠️ الحواف بتبقى واطية التباين كتير (خلفية سادة)، ولو حسبناها
        فواصل هنطلّع خانات فاضية على الجناب. */
  function innerCuts(runs, total, opts) {
    opts = opts || {};
    var edge = opts.edge != null ? opts.edge : 0.12;   // ١٢٪ من الطول
    var lo = total * edge, hi = total * (1 - edge);
    var cuts = [];
    for (var i = 0; i < runs.length; i++) {
      var mid = (runs[i][0] + runs[i][1]) / 2;
      if (mid > lo && mid < hi) cuts.push(runs[i]);
    }
    return cuts;
  }

  /* حدود الخانات من الفواصل: [البداية, النهاية] لكل خانة */
  function spansFromCuts(cuts, total, opts) {
    opts = opts || {};
    var pad = opts.pad != null ? opts.pad : 2;   // ابعد عن الفاصل شوية
    var spans = [], prev = 0, i;
    for (i = 0; i < cuts.length; i++) {
      spans.push([prev, cuts[i][0] - pad]);
      prev = cuts[i][1] + pad;
    }
    spans.push([prev, total - 1]);
    // نشيل الشرايح الرفيعة (مش خانة حقيقية)
    var minSize = total * (opts.minFrac != null ? opts.minFrac : 0.12);
    return spans.filter(function (s) { return (s[1] - s[0]) >= minSize; });
  }

  /* ============================================================
     الواجهة: بيانات صورة → مصفوفة خانات
     بترجع { ok, cells:[{x,y,w,h}], cols, rows, why }
     ============================================================ */
  function splitGrid(data, w, h, opts) {
    opts = opts || {};
    var expect = opts.expect || 0;        // عدد الخانات المتوقع (٠ = أي عدد)

    var colVar = lineVariance(data, w, h, true);
    var rowVar = lineVariance(data, w, h, false);
    var colCuts = innerCuts(findSeparators(colVar, opts), w, opts);
    var rowCuts = innerCuts(findSeparators(rowVar, opts), h, opts);

    var xs = spansFromCuts(colCuts, w, opts);
    var ys = spansFromCuts(rowCuts, h, opts);

    var cells = [];
    for (var r = 0; r < ys.length; r++) {
      for (var c = 0; c < xs.length; c++) {
        cells.push({ x: xs[c][0], y: ys[r][0],
                     w: xs[c][1] - xs[c][0] + 1,
                     h: ys[r][1] - ys[r][0] + 1,
                     row: r, col: c });
      }
    }

    /* 🔴 الحارس: لو العدد مش المتوقع، **نفشل بوضوح** بدل ما نرجّع
       خانات غلط. عرض صورة مقطوعة على وش العميلة أسوأ بكتير من
       رسالة "حاولي تاني" — والاستدعاء بيقدر يرجع للصورة كاملة. */
    if (expect && cells.length !== expect) {
      return { ok: false, cells: cells, cols: xs.length, rows: ys.length,
               why: 'GRID_MISMATCH_' + cells.length + '_EXPECTED_' + expect };
    }
    if (cells.length < 2) {
      return { ok: false, cells: [], cols: xs.length, rows: ys.length,
               why: 'NO_GRID_FOUND' };
    }
    return { ok: true, cells: cells, cols: xs.length, rows: ys.length, why: '' };
  }

  /* ترتيب الخانات على الألوان — صف بصف من الشمال.
     ⚠️ الترتيب ده **لازم يطابق ترتيب الألوان في البرومبت**، لأنه
        الرابط الوحيد بين الخانة واللون. لو البرومبت اتغيّر، ده يتغيّر. */
  function labelCells(cells, labels) {
    var sorted = cells.slice().sort(function (a, b) {
      return (a.row - b.row) || (a.col - b.col);
    });
    var out = [];
    for (var i = 0; i < sorted.length && i < labels.length; i++) {
      out.push({ label: labels[i], cell: sorted[i] });
    }
    return out;
  }

  var API = {
    lineVariance: lineVariance,
    findSeparators: findSeparators,
    innerCuts: innerCuts,
    spansFromCuts: spansFromCuts,
    splitGrid: splitGrid,
    labelCells: labelCells
  };
  root.GridSplit = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
