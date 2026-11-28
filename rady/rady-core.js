/* ============================================================
 * rady-core.js — «راضي؟» المنطق الصافي (من غير DOM ولا Firebase)
 * ------------------------------------------------------------
 * بيشتغل في المتصفح (window.RadyCore) وفي Node للاختبارات.
 * كل حسابات الوقت على توقيت القاهرة، ويوم الشغل بيبدأ من الساعة
 * الفاصلة (افتراضي 6 الصبح) — زي الكاشير بالظبط.
 * ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RadyCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TZ = 'Africa/Cairo';

  /* الوشوش الأربعة — الترتيب ثابت (1 = وحش جدًا … 4 = ممتاز).
     الألوان متحققة بأداة فحص الألوان (عمى الألوان + التباين) للخلفية
     الفاتحة والغامقة. اللون عمره ما بيشيل المعنى لوحده: الوش والكلمة معاه. */
  var FACES = [
    { v: 1, key: 'awful', label: 'وحش جدًا', light: '#dc3c3d', dark: '#dc3c3d', weight: 0 },
    { v: 2, key: 'bad',   label: 'مش حلو',   light: '#f39a3d', dark: '#c98f12', weight: 1 / 3 },
    { v: 3, key: 'good',  label: 'كويس',     light: '#4cb7a5', dark: '#2a9c8a', weight: 2 / 3 },
    { v: 4, key: 'great', label: 'ممتاز',    light: '#2370cd', dark: '#338ced', weight: 1 }
  ];

  /* أنواع الشغل — كل نوع ليه سؤال وأسباب جاهزة باللهجة المصرية.
     صاحب الشغل يقدر يعدّل أي حاجة فيهم من لوحة التحكم. */
  var BUSINESS_TYPES = {
    shop: {
      label: 'محل / بوتيك',
      question: 'تجربتك معانا النهارده كانت عاملة إزاي؟',
      bad: ['التعامل', 'الأسعار', 'المقاس أو اللون مش موجود', 'الانتظار عند الكاشير', 'البضاعة مش مترتبة', 'الاستبدال والاسترجاع'],
      good: ['التعامل', 'التشكيلة', 'الأسعار', 'السرعة', 'شكل المحل']
    },
    restaurant: {
      label: 'مطعم / كافيه',
      question: 'الأكل والخدمة كانوا عاملين إزاي؟',
      bad: ['الطلب اتأخر', 'طعم الأكل', 'الأسعار', 'النظافة', 'التعامل', 'الطلب جه غلط'],
      good: ['طعم الأكل', 'السرعة', 'التعامل', 'المكان', 'الأسعار']
    },
    clinic: {
      label: 'عيادة / مركز طبي',
      question: 'زيارتك النهارده كانت عاملة إزاي؟',
      bad: ['الانتظار طويل', 'الاستقبال', 'المواعيد', 'النظافة', 'الأسعار', 'الشرح مكانش واضح'],
      good: ['الدكتور', 'الاستقبال', 'المواعيد', 'النظافة', 'الشرح']
    },
    service: {
      label: 'خدمة عملاء / فرع خدمة',
      question: 'اتخدمت النهارده كويس؟',
      bad: ['الانتظار طويل', 'الموظف', 'المشكلة متحلتش', 'الزحمة', 'الإجراءات كتير'],
      good: ['السرعة', 'الموظف', 'المشكلة اتحلت', 'التنظيم']
    },
    restroom: {
      label: 'حمامات / مرافق',
      question: 'المكان نضيف؟',
      bad: ['مش نضيف', 'ريحة', 'مفيش مناديل أو صابون', 'حاجة بايظة', 'مفيش مية'],
      good: []
    }
  };

  /* ---------- أرقام ---------- */
  var AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
                    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
  function toLatinDigits(s) { return String(s == null ? '' : s).replace(/[٠-٩۰-۹]/g, function (d) { return AR_DIGITS[d]; }); }

  /* موبايل مصري: 010 / 011 / 012 / 015 + 8 أرقام. بيقبل +20 و0020 والأرقام العربي.
     بيرجّع 01xxxxxxxxx أو null. */
  function normalizeEgPhone(input) {
    var s = toLatinDigits(input).replace(/[\s\-().]/g, '');
    if (s.indexOf('+20') === 0) s = '0' + s.slice(3);
    else if (s.indexOf('0020') === 0) s = '0' + s.slice(4);
    else if (s.indexOf('20') === 0 && s.length === 12) s = '0' + s.slice(2);
    else if (s.length === 10 && s.charAt(0) === '1') s = '0' + s;
    return /^01[0125]\d{8}$/.test(s) ? s : null;
  }

  function waLink(phone, text) {
    var p = normalizeEgPhone(phone);
    if (!p) return null;
    return 'https://wa.me/20' + p.slice(1) + (text ? '?text=' + encodeURIComponent(text) : '');
  }

  /* ---------- الوقت ---------- */
  var _fmt = null;
  function cairoParts(ts) {
    if (!_fmt) {
      _fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
    }
    var o = {};
    _fmt.formatToParts(new Date(ts)).forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, min: +o.minute, wd: o.weekday };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* يوم الشغل: لو الساعة قبل الساعة الفاصلة، التقييم بيتحسب على اليوم اللي قبله
     (محل قافل 2 بالليل → تقييم 1 بالليل تبع امبارح). */
  function workday(ts, cutoffHour) {
    var c = cutoffHour == null ? 6 : cutoffHour;
    var p = cairoParts(ts);
    if (p.h < c) p = cairoParts(ts - (p.h + 1) * 3600000); // ارجع لليوم اللي قبله
    return p.y + '-' + pad(p.m) + '-' + pad(p.d);
  }
  function cairoHour(ts) { return cairoParts(ts).h; }

  function addDays(dayStr, n) {
    var a = dayStr.split('-').map(Number);
    var d = new Date(Date.UTC(a[0], a[1] - 1, a[2] + n, 12));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function dayRange(fromDay, toDay) {
    var out = [], d = fromDay, guard = 0;
    while (d <= toDay && guard++ < 400) { out.push(d); d = addDays(d, 1); }
    return out;
  }
  var WEEKDAYS_AR = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
  function weekdayAr(dayStr) {
    var a = dayStr.split('-').map(Number);
    return WEEKDAYS_AR[new Date(Date.UTC(a[0], a[1] - 1, a[2], 12)).getUTCDay()];
  }

  /* ---------- المؤشرات ---------- */
  /* مؤشر الرضا 0–100: متوسط موزون (وحش جدًا = 0، مش حلو = 33، كويس = 67، ممتاز = 100).
     null لو مفيش تقييمات — عمره ما يطلع 0 بالغلط. */
  function satisfactionIndex(counts) {
    var total = 0, sum = 0;
    for (var i = 0; i < FACES.length; i++) {
      var c = counts[FACES[i].v] || 0;
      total += c; sum += c * FACES[i].weight;
    }
    return total ? Math.round((sum / total) * 100) : null;
  }
  function happyShare(counts) {
    var t = (counts[1] || 0) + (counts[2] || 0) + (counts[3] || 0) + (counts[4] || 0);
    return t ? Math.round((((counts[3] || 0) + (counts[4] || 0)) / t) * 100) : null;
  }
  function emptyCounts() { return { 1: 0, 2: 0, 3: 0, 4: 0 }; }

  /* ---------- منع التلاعب ----------
     العيال بتخبط على التابلت، أو موظف بيدوس «ممتاز» 20 مرة.
     التقييم مبيتمسحش — بيتعلّم (flag) ويطلع من المؤشر، ويتعدّ لوحده. */
  var SPAM = { minGapMs: 1500, burstWindowMs: 20000, burstMax: 5 };
  function spamFlag(recentTs, nowTs) {
    var last = recentTs.length ? recentTs[recentTs.length - 1] : null;
    if (last != null && nowTs - last < SPAM.minGapMs) return 'fast';
    var inWin = 0;
    for (var i = 0; i < recentTs.length; i++) if (nowTs - recentTs[i] <= SPAM.burstWindowMs) inWin++;
    if (inWin >= SPAM.burstMax) return 'burst';
    return null;
  }

  /* ---------- التنبيه ----------
     3 تقييمات وحشة أو أكتر في آخر 10 دقايق على نفس النقطة، وهي نص التقييمات
     أو أكتر → تنبيه لمدير الفرع. */
  var ALERT = { windowMs: 10 * 60000, minBad: 3, minShare: 0.5 };
  function checkAlert(votes, pointId, nowTs) {
    var bad = 0, all = 0;
    for (var i = 0; i < votes.length; i++) {
      var v = votes[i];
      if (v.pointId !== pointId || v.flag) continue;
      if (nowTs - v.ts > ALERT.windowMs || v.ts > nowTs) continue;
      all++; if (v.v <= 2) bad++;
    }
    return bad >= ALERT.minBad && bad / all >= ALERT.minShare ? { bad: bad, all: all } : null;
  }

  /* ---------- التجميع للوحة التحكم ---------- */
  function aggregate(votes, opts) {
    opts = opts || {};
    var from = opts.fromDay || '0000-00-00', to = opts.toDay || '9999-99-99';
    var cutoff = opts.cutoffHour == null ? 6 : opts.cutoffHour;
    var res = {
      total: 0, flagged: 0, counts: emptyCounts(),
      byHour: {}, byDay: {}, byPoint: {}, byWeekday: {},
      reasonsBad: {}, reasonsGood: {}, callbacks: []
    };
    for (var i = 0; i < votes.length; i++) {
      var v = votes[i];
      if (opts.pointId && v.pointId !== opts.pointId) continue;
      var day = v.workday || workday(v.ts, cutoff);
      if (day < from || day > to) continue;
      if (v.flag) { res.flagged++; continue; }
      res.total++;
      res.counts[v.v] = (res.counts[v.v] || 0) + 1;
      var h = v.hour != null ? v.hour : cairoHour(v.ts);
      (res.byHour[h] = res.byHour[h] || emptyCounts())[v.v]++;
      (res.byDay[day] = res.byDay[day] || emptyCounts())[v.v]++;
      (res.byPoint[v.pointId] = res.byPoint[v.pointId] || emptyCounts())[v.v]++;
      var wd = weekdayAr(day);
      (res.byWeekday[wd] = res.byWeekday[wd] || emptyCounts())[v.v]++;
      if (v.reason) {
        var bucket = v.v <= 2 ? res.reasonsBad : res.reasonsGood;
        bucket[v.reason] = (bucket[v.reason] || 0) + 1;
      }
      if (v.phone) res.callbacks.push(v);
    }
    res.index = satisfactionIndex(res.counts);
    res.happy = happyShare(res.counts);
    res.callbacks.sort(function (a, b) { return b.ts - a.ts; });
    return res;
  }

  function topReasons(map, n) {
    return Object.keys(map).map(function (k) { return { reason: k, count: map[k] }; })
      .sort(function (a, b) { return b.count - a.count || (a.reason < b.reason ? -1 : 1); })
      .slice(0, n || 6);
  }

  /* ---------- تصدير ---------- */
  function csvCell(x) {
    var s = x == null ? '' : String(x);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(votes, pointsById) {
    var rows = [['التاريخ', 'الساعة', 'يوم الشغل', 'النقطة', 'التقييم', 'الرقم', 'السبب', 'موبايل', 'مستبعد']];
    votes.slice().sort(function (a, b) { return a.ts - b.ts; }).forEach(function (v) {
      var p = cairoParts(v.ts);
      var face = FACES[v.v - 1];
      rows.push([p.y + '-' + pad(p.m) + '-' + pad(p.d), pad(p.h) + ':' + pad(p.min), v.workday || '',
        (pointsById && pointsById[v.pointId] && pointsById[v.pointId].name) || v.pointId,
        face ? face.label : '', v.v, v.reason || '', v.phone || '', v.flag ? 'نعم' : '']);
    });
    return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }

  /* ---------- بناء التقييم قبل الحفظ ---------- */
  function buildVote(input, ctx) {
    var v = +input.v;
    if (!(v >= 1 && v <= 4)) throw new Error('bad rating');
    var ts = ctx.now;
    var out = { pointId: ctx.pointId, v: v, ts: ts, workday: workday(ts, ctx.cutoffHour), hour: cairoHour(ts) };
    if (input.reason) out.reason = String(input.reason).slice(0, 60);
    if (input.phone) { var p = normalizeEgPhone(input.phone); if (p) out.phone = p; }
    var f = spamFlag(ctx.recentTs || [], ts);
    if (f) out.flag = f;
    return out;
  }

  /* بيانات تجريبية واقعية: زحمة بالليل وآخر الأسبوع، وشوية زعل وقت الذروة. */
  function demoVotes(points, days, nowTs, seed) {
    var s = seed || 7;
    function rnd() { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }
    var out = [];
    var today = workday(nowTs);
    var hourW = { 10: 1, 11: 2, 12: 3, 13: 4, 14: 4, 15: 4, 16: 5, 17: 6, 18: 8, 19: 9, 20: 10, 21: 10, 22: 8, 23: 5, 0: 2 };
    for (var d = days - 1; d >= 0; d--) {
      var day = addDays(today, -d);
      var a = day.split('-').map(Number);
      var wdIdx = new Date(Date.UTC(a[0], a[1] - 1, a[2], 12)).getUTCDay();
      var weekend = wdIdx === 4 || wdIdx === 5; // خميس وجمعة
      points.forEach(function (pt, pi) {
        var t = BUSINESS_TYPES[pt.type] || BUSINESS_TYPES.shop;
        Object.keys(hourW).forEach(function (hs) {
          var h = +hs, n = Math.round(hourW[h] * (weekend ? 1.6 : 1) * (0.6 + rnd() * 0.8) * (pi === 0 ? 1 : 0.6));
          for (var k = 0; k < n; k++) {
            var rush = hourW[h] >= 9 ? 0.12 : 0;
            var r = rnd(), v;
            var p1 = 0.06 + rush * 0.6 + (pi === 1 ? 0.04 : 0), p2 = p1 + 0.10 + rush, p3 = p2 + 0.34;
            v = r < p1 ? 1 : r < p2 ? 2 : r < p3 ? 3 : 4;
            var dayOff = h < 6 ? 1 : 0;
            var b = day.split('-').map(Number);
            // ساعة القاهرة → UTC (القاهرة +2 أو +3 صيفي، الفرق هنا مش مهم للعرض)
            var ts = Date.UTC(b[0], b[1] - 1, b[2] + dayOff, h - 2, Math.floor(rnd() * 60), Math.floor(rnd() * 60));
            if (ts > nowTs) continue;
            var vote = { id: 'd' + out.length, pointId: pt.id, v: v, ts: ts, workday: day, hour: h };
            var list = v <= 2 ? t.bad : t.good;
            if (list.length && rnd() < (v <= 2 ? 0.75 : 0.35)) vote.reason = list[Math.floor(Math.pow(rnd(), 1.6) * list.length)];
            if (v === 1 && rnd() < 0.08) vote.phone = '01' + ['0', '1', '2', '5'][Math.floor(rnd() * 4)] + String(Math.floor(10000000 + rnd() * 89999999));
            if (rnd() < 0.01) vote.flag = 'burst';
            out.push(vote);
          }
        });
      });
    }
    return out;
  }

  return {
    TZ: TZ, FACES: FACES, BUSINESS_TYPES: BUSINESS_TYPES, SPAM: SPAM, ALERT: ALERT,
    toLatinDigits: toLatinDigits, normalizeEgPhone: normalizeEgPhone, waLink: waLink,
    cairoParts: cairoParts, workday: workday, cairoHour: cairoHour, addDays: addDays, dayRange: dayRange, weekdayAr: weekdayAr,
    satisfactionIndex: satisfactionIndex, happyShare: happyShare, emptyCounts: emptyCounts,
    spamFlag: spamFlag, checkAlert: checkAlert, aggregate: aggregate, topReasons: topReasons,
    toCSV: toCSV, buildVote: buildVote, demoVotes: demoVotes
  };
});
