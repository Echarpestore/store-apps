/* ============================================================
   🏦 time-bank.js — v640 — «رصيد الوقت» بدل «كل 10 دقايق = ساعة خصم»
   ------------------------------------------------------------
   قرار المالك 10-10: السيستم القديم كان بيعاقب لحظيًا وبيطلع أرقام مش حقيقية،
   والمالك بيقعد آخر كل شهر يمسح. الجديد زي حساب البنك:
   · كل شيفت: الدقايق الفعلية (اللي اشتغلها − المطلوب) بتتكتب في رصيده، بالسالب أو بالموجب.
     التأخير بيتعوّض لوحده بالقعدة بعد الميعاد — في نفس اليوم أو أي يوم في الشهر.
   · فترة سماح صغيرة (bankGraceMin) مبتتحسبش أصلًا.
   · آخر الشهر: السالب بيتخصم بسعر الدقيقة الحقيقي (أساسي ÷ 30 ÷ 8 ÷ 60)، والموجب أوفرتايم
     بنفس السعر — من غير موافقات، طول ما الموظف هو اللي قفل شيفته.
   · الشيفت المنسي (مقفلش): بيتقفل على ميعاد نهاية شيفته، إلا لو هو نفسه عمل فواتير بعد
     الميعاد (سهر عيد) فبيتقفل على آخر فاتورة + 15 دقيقة. ومفيش أوفرتايم على شيفت منسي.
   · حافز أسبوعي (bonusMin → bonusMax) من 100 نقطة: التزام 40 · تقييم العملاء 30 · مبيعات 30.
   · إنذار للمالك: اللي بيتأخر كتير (alertLateCount مرة في alertWindowDays يوم).

   📐 منطق خالص — من غير Firestore — عشان نفس الرقم يطلع في sales وOffice والاختبارات.
   ============================================================ */
(function(){
  'use strict';
  var DEFAULTS = {
    bankEnabled: true, bankFrom: '2026-10-01',
    bankGraceMin: 5,            // أقل من كده (تأخير أو فرق) = مش محسوب
    bankStdShiftMin: 495,       // لو الموظف ملوش معاد مكتوب
    bankMaxShiftMin: 16 * 60,   // أطول من كده = نسيان
    bankLastSalePadMin: 15,     // الشيفت المنسي: آخر فاتورة + كده
    bonusMin: 50, bonusMax: 150,
    bonusLateMinWeek: 10,       // إجمالي تأخير الأسبوع المسموح للالتزام الكامل
    bonusRatingMin: 3.5,        // من 4 (مقياس تابلت التقييم)
    bonusPointsWeek: 0,         // هدف نقاط الأسبوع (الوضع الثابت) · 0 = جزء المبيعات مفتوح
    bonusPointsMode: 'auto',    // 'auto' = هدف لكل موظف من متوسطه ومتوسط الفرع · 'fixed' = الرقم فوق
    autoTargetWeeks: 8,         // كام أسبوع ورا بنحسب منهم المتوسط
    autoTargetFactor: 1.0,      // الهدف = ((متوسط الموظف + متوسط الفرع) ÷ 2) × المعامل
    bonusWeights: { commit: 40, rating: 30, sales: 30 },
    bonusMinScore: 60,          // أقل من كده = مفيش حافز (الالتزام لوحده 40 مش كفاية — لازم تقييم أو مبيعات)
    alertLateCount: 4, alertWindowDays: 14
  };
  function cfgOf(raw){
    var c = Object.assign({}, DEFAULTS, raw || {});
    c.bonusWeights = Object.assign({}, DEFAULTS.bonusWeights, (raw && raw.bonusWeights) || {});
    ['bankGraceMin','bankStdShiftMin','bankMaxShiftMin','bankLastSalePadMin','bonusMin','bonusMax','bonusLateMinWeek','bonusPointsWeek','bonusMinScore','alertLateCount','alertWindowDays','autoTargetWeeks','autoTargetFactor']
      .forEach(function(k){ var v = Number(c[k]); c[k] = isNaN(v) ? DEFAULTS[k] : v; });
    c.bonusRatingMin = isNaN(Number(c.bonusRatingMin)) ? DEFAULTS.bonusRatingMin : Number(c.bonusRatingMin);
    if(c.autoTargetWeeks < 1) c.autoTargetWeeks = DEFAULTS.autoTargetWeeks; if(c.autoTargetFactor <= 0) c.autoTargetFactor = 1;
    c.bonusPointsMode = c.bonusPointsMode === 'fixed' ? 'fixed' : 'auto';
    if(c.bonusMax < c.bonusMin) c.bonusMax = c.bonusMin;
    c.bankEnabled = c.bankEnabled !== false;
    return c;
  }
  function enabledFor(cfg, periodStartMs){
    var c = cfgOf(cfg); if(!c.bankEnabled) return false;
    if(!c.bankFrom) return true;
    var f = String(c.bankFrom).slice(0, 10);
    return keyOf(periodStartMs) >= f;
  }
  function keyOf(ms){
    var d = new Date(Number(ms) || Date.now());
    try{
      var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
      var o = {}; p.forEach(function(x){ o[x.type] = x.value; });
      return o.year + '-' + o.month + '-' + o.day;
    }catch(e){ return d.toISOString().slice(0, 10); }
  }

  /* ---------- الشيفت الواحد ---------- */
  // shift: {clockInTs, clockOutTs, shiftMinutes, lateMinutes, forgotClockOut, bankAutoEnd, needsClockOutReview, manual, voided}
  // requiredMin: المطلوب من معاده (0 = مش معروف)
  function shiftDelta(shift, requiredMin, cfg){
    var c = cfgOf(cfg); var out = { lateMin: 0, workedMin: 0, requiredMin: 0, delta: 0, counted: false, reason: '' };
    if(!shift || !shift.clockInTs){ out.reason = 'no_shift'; return out; }
    if(shift.voided){ out.reason = 'voided'; return out; }
    if(!shift.clockOutTs){ out.reason = 'open'; return out; }
    if(shift.needsClockOutReview && !shift.bankAutoEnd){ out.reason = 'needs_review'; return out; }
    var req = Number(requiredMin) || c.bankStdShiftMin;
    var worked = Number(shift.shiftMinutes) || Math.round((Number(shift.clockOutTs) - Number(shift.clockInTs)) / 60000);
    if(worked < 0) worked = 0;
    if(worked > c.bankMaxShiftMin) worked = c.bankMaxShiftMin;
    var late = Math.max(0, Number(shift.lateMinutes) || 0);
    if(late <= c.bankGraceMin) late = 0;
    out.requiredMin = req; out.workedMin = worked; out.lateMin = late; out.counted = true;
    if(shift.manual){ out.reason = 'manual'; out.delta = 0; return out; }   // المالك كتبه بإيده = يوم كامل
    var delta = worked - req;
    if(Math.abs(delta) <= c.bankGraceMin) delta = 0;
    if(shift.forgotClockOut || shift.bankAutoEnd){ if(delta > 0) delta = 0; out.reason = 'forgot'; }
    out.delta = delta;
    return out;
  }

  /* ---------- الشهر ---------- */
  // reqFn(shift) → requiredMin
  function monthSummary(shifts, cfg, reqFn){
    var c = cfgOf(cfg); var rows = [], plus = 0, minus = 0, lateCount = 0, lateMin = 0, forgot = 0, counted = 0;
    (shifts || []).forEach(function(s){
      var r = shiftDelta(s, reqFn ? reqFn(s) : 0, c);
      rows.push(Object.assign({ id: s && s.id, clockInTs: s && s.clockInTs, clockOutTs: s && s.clockOutTs, day: s && s.clockInTs ? keyOf(s.clockInTs) : '' }, r));
      if(!r.counted) return;
      counted++;
      if(r.delta > 0) plus += r.delta; else minus += -r.delta;
      if(r.lateMin > 0){ lateCount++; lateMin += r.lateMin; }
      if(s.forgotClockOut || s.bankAutoEnd) forgot++;
    });
    rows.sort(function(a, b){ return (Number(a.clockInTs) || 0) - (Number(b.clockInTs) || 0); });
    return { balanceMin: plus - minus, plusMin: plus, minusMin: minus, lateCount: lateCount, lateMinTotal: lateMin, forgotCount: forgot, countedShifts: counted, rows: rows };
  }
  // سعر الدقيقة = الأساسي ÷ 30 ÷ 8 ÷ 60 (نفس hourlyRate بتاع المرتب)
  function money(balanceMin, hourlyRate){
    var r = Number(hourlyRate) || 0; var b = Number(balanceMin) || 0;
    var round = function(x){ return Math.round(x * 100) / 100; };
    return { deduction: b < 0 ? round(-b / 60 * r) : 0, overtimePay: b > 0 ? round(b / 60 * r) : 0, overtimeMin: b > 0 ? b : 0, shortMin: b < 0 ? -b : 0 };
  }

  /* ---------- الشيفت المنسي ---------- */
  // scheduledEndTs: نهاية شيفته كطابع · lastSaleTs: آخر فاتورة الموظف نفسه بعد الحضور (0 = مفيش)
  function forgottenFix(shift, scheduledEndTs, lastSaleTs, cfg){
    var c = cfgOf(cfg); if(!shift || !shift.clockInTs) return null;
    var inTs = Number(shift.clockInTs); var cap = inTs + c.bankMaxShiftMin * 60000;
    var end = Number(scheduledEndTs) || 0; var reason = 'scheduled_end';
    if(!(end > inTs)){ end = inTs + c.bankStdShiftMin * 60000; reason = 'std_shift'; }
    var ls = Number(lastSaleTs) || 0;
    if(ls > end){ end = ls + c.bankLastSalePadMin * 60000; reason = 'last_sale'; }
    if(end > cap){ end = cap; reason = reason + '_capped'; }
    return { clockOutTs: end, shiftMinutes: Math.round((end - inTs) / 60000), reason: reason };
  }
  function isForgottenOpen(shift, nowMs, cfg){
    var c = cfgOf(cfg); if(!shift || !shift.clockInTs || shift.clockOutTs) return false;
    return (Number(nowMs) - Number(shift.clockInTs)) > c.bankMaxShiftMin * 60000;
  }

  /* ---------- الحافز الأسبوعي ---------- */
  // st: {lateMinTotal, lateCount, forgotCount, absences, avgRating (من 4 أو null), ratingCount, points}
  function weekBonus(st, cfg){
    var c = cfgOf(cfg); st = st || {}; var w = c.bonusWeights;
    var lateT = Number(st.lateMinTotal) || 0;
    var commit = 0;
    if((Number(st.forgotCount) || 0) === 0 && (Number(st.absences) || 0) === 0){
      if(lateT <= c.bonusLateMinWeek) commit = w.commit;
      else if(lateT <= c.bonusLateMinWeek * 2) commit = Math.round(w.commit / 2);
    }
    var rating = 0, avg = st.avgRating;
    if(avg != null && (Number(st.ratingCount) || 0) > 0){
      rating = avg >= c.bonusRatingMin ? w.rating : Math.max(0, Math.round(w.rating * (Number(avg) / c.bonusRatingMin)));
      if(rating > w.rating) rating = w.rating;
    }
    var sales = 0, pts = Number(st.points) || 0;
    if(c.bonusPointsWeek <= 0) sales = w.sales;
    else sales = Math.min(w.sales, Math.round(w.sales * pts / c.bonusPointsWeek));
    var score = commit + rating + sales;
    var amount = 0;
    if(score >= c.bonusMinScore){
      var span = 100 - c.bonusMinScore; var frac = span > 0 ? (score - c.bonusMinScore) / span : 1;
      amount = c.bonusMin + (c.bonusMax - c.bonusMin) * Math.max(0, Math.min(1, frac));
      amount = Math.round(amount / 5) * 5;
    }
    return { score: score, amount: amount, parts: { commit: commit, rating: rating, sales: sales }, max: w };
  }
  // الأسابيع (سبت→جمعة) اللي نهايتها جوه الفترة وخلصت فعلًا
  function weeksInPeriod(startMs, endMs, nowMs){
    var out = []; var now = Number(nowMs) || Date.now();
    var d = new Date(Number(startMs)); d.setHours(0, 0, 0, 0);
    // أول سبت ≤ البداية
    d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
    for(var i = 0; i < 8; i++){
      var ws = new Date(d); var we = new Date(d); we.setDate(we.getDate() + 7); we.setMilliseconds(-1);
      if(we.getTime() > Number(endMs)) break;
      if(we.getTime() >= Number(startMs) && we.getTime() <= now) out.push({ start: ws.getTime(), end: we.getTime(), key: keyOf(ws.getTime()) });
      d.setDate(d.getDate() + 7);
    }
    return out;
  }
  function currentWeek(nowMs){
    var d = new Date(Number(nowMs) || Date.now()); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
    var we = new Date(d); we.setDate(we.getDate() + 7); we.setMilliseconds(-1);
    return { start: d.getTime(), end: we.getTime(), key: keyOf(d.getTime()) };
  }

  /* ---------- الهدف التلقائي لنقاط الأسبوع ----------
     طلب المالك 10-10: السيستم يقترح لكل موظف هدف أسبوعي من متوسط الفرع ومتوسط الموظف نفسه.
     · لكل موظف: متوسط نقاطه في آخر N أسبوع كان فيها شيفت (الإجازة والتعيين الجديد مش بيوقّعوا المتوسط)
     · الفرع: متوسط كل (موظف×أسبوع) في نفس الفترة
     · الهدف = ((متوسط الموظف + متوسط الفرع) ÷ 2) × المعامل — الضعيف بيتشد ناحية الفرع، والقوي بيحافظ على مستواه */
  function weeksBefore(weekStartMs, n){
    var out = []; var d = new Date(Number(weekStartMs));
    for(var i = 0; i < n; i++){ d.setDate(d.getDate() - 7); var ws = new Date(d); var we = new Date(d); we.setDate(we.getDate() + 7); we.setMilliseconds(-1); out.push({ start: ws.getTime(), end: we.getTime(), key: keyOf(ws.getTime()) }); }
    return out;
  }
  // points: [{employeeId, ts, value}] · shifts: [{employeeId, clockInTs}] · empIds: موظفين الفرع
  function weeklyPointStats(points, shifts, empIds, weekStartMs, cfg){
    var c = cfgOf(cfg); var wks = weeksBefore(weekStartMs, c.autoTargetWeeks);
    var per = {}; var all = [];
    (empIds || []).forEach(function(id){
      var rows = [];
      wks.forEach(function(w){
        var worked = (shifts || []).some(function(s){ return s && s.employeeId === id && s.clockInTs >= w.start && s.clockInTs <= w.end && !s.voided; });
        if(!worked) return;
        var pts = 0; (points || []).forEach(function(p){ if(p && p.employeeId === id && p.ts >= w.start && p.ts <= w.end){ var v = Number(p.value); pts += (isNaN(v) || v <= 0) ? 1 : v; } });
        rows.push({ key: w.key, pts: Math.round(pts * 10) / 10 }); all.push(pts);
      });
      var avg = rows.length ? rows.reduce(function(n, r){ return n + r.pts; }, 0) / rows.length : 0;
      per[id] = { weeks: rows, avg: Math.round(avg * 10) / 10 };
    });
    var branchAvg = all.length ? all.reduce(function(n, x){ return n + x; }, 0) / all.length : 0;
    branchAvg = Math.round(branchAvg * 10) / 10;
    Object.keys(per).forEach(function(id){ per[id].target = autoTarget(per[id].avg, branchAvg, per[id].weeks.length, c); });
    return { branchAvg: branchAvg, per: per, weeks: wks.length };
  }
  function autoTarget(empAvg, branchAvg, weeksCount, cfg){
    var c = cfgOf(cfg); var e = Number(empAvg) || 0, b = Number(branchAvg) || 0;
    if(!(weeksCount > 0)) return Math.max(0, Math.round(b * c.autoTargetFactor));   // موظف جديد: هدف الفرع
    return Math.max(0, Math.round(((e + b) / 2) * c.autoTargetFactor));
  }
  function targetFor(cfg, stats, empId){
    var c = cfgOf(cfg);
    if(c.bonusPointsMode !== 'auto') return c.bonusPointsWeek;
    var p = stats && stats.per && stats.per[empId];
    return p ? p.target : Math.round((stats && stats.branchAvg || 0) * c.autoTargetFactor);
  }

  /* ---------- إنذار التأخير المتكرر ---------- */
  function lateAlerts(shifts, cfg, nowMs){
    var c = cfgOf(cfg); var now = Number(nowMs) || Date.now(); var since = now - c.alertWindowDays * 86400000;
    var by = {};
    (shifts || []).forEach(function(s){
      if(!s || !s.clockInTs || Number(s.clockInTs) < since || s.voided) return;
      var late = Math.max(0, Number(s.lateMinutes) || 0); if(late <= c.bankGraceMin) return;
      var k = s.employeeId; by[k] = by[k] || { employeeId: k, name: s.employeeName || '', count: 0, totalMin: 0 };
      by[k].count++; by[k].totalMin += late;
    });
    return Object.keys(by).map(function(k){ var x = by[k]; x.avgMin = Math.round(x.totalMin / x.count); return x; })
      .filter(function(x){ return x.count >= c.alertLateCount; })
      .sort(function(a, b){ return b.count - a.count; });
  }

  function fmtMin(m){ m = Math.round(Number(m) || 0); var s = m < 0 ? '−' : (m > 0 ? '+' : ''); m = Math.abs(m); var h = Math.floor(m / 60), r = m % 60; return s + (h ? h + ' س ' : '') + r + ' د'; }

  var TB = { DEFAULTS: DEFAULTS, cfgOf: cfgOf, enabledFor: enabledFor, keyOf: keyOf, shiftDelta: shiftDelta, monthSummary: monthSummary, money: money,
    forgottenFix: forgottenFix, isForgottenOpen: isForgottenOpen, weekBonus: weekBonus, weeksBefore: weeksBefore, weeklyPointStats: weeklyPointStats, autoTarget: autoTarget, targetFor: targetFor, weeksInPeriod: weeksInPeriod, currentWeek: currentWeek, lateAlerts: lateAlerts, fmtMin: fmtMin };
  if(typeof window !== 'undefined') window.TimeBank = TB;
  if(typeof module !== 'undefined' && module.exports) module.exports = TB;
})();
