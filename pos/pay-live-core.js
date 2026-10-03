/* ============================================================
   ⏳ pay-live-core.js — محرك شاشة «في انتظار التأكيد» (v757 · 03-10-2026)
   ------------------------------------------------------------
   مشترك بين POS والتابلت. منطق خالص من غير DOM ولا Firestore.
   - etaFrom(samples, kind): المدة المعتادة للتأكيد في الفرع ده = وسيط آخر 20
     تأكيد حقيقي × 1.1 (عشان 100% متجيش قبل التأكيد في أغلب المرات).
   - progressAt(elapsed, eta): 1% → ~95% عند المدة المعتادة (سريع في الأول، هادي
     قرب الآخر)، وبعدها زحف بطيء لحد 99%. **100% بس لما التأكيد يوصل فعلًا.**
   - phase(elapsed, eta): الكلام اللي بيظهر في كل مرحلة.
   - reasonAr(raw): سبب رفض البنك بالعربي (كود ISO أو نص Paymob).
   ============================================================ */
(function(){
  'use strict';
  var DEF = { instapay: 40000, card: 25000 };          // لحد ما يتجمّع 3 تأكيدات حقيقية
  var MIN = 8000, MAX = 180000, KEEP = 20;

  function median(a){
    var s = a.slice().sort(function(x, y){ return x - y; }), n = s.length;
    return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0;
  }
  function cleanSamples(arr){
    return (Array.isArray(arr) ? arr : []).map(Number).filter(function(x){ return x >= 1500 && x <= 15 * 60000; });
  }
  function etaFrom(samples, kind){
    var s = cleanSamples(samples);
    if(s.length < 3) return DEF[kind] || DEF.card;
    return Math.round(Math.min(MAX, Math.max(MIN, median(s.slice(-KEEP)) * 1.1)));
  }
  function addSample(samples, ms){
    var s = cleanSamples(samples);
    var v = Math.round(Number(ms) || 0);
    if(v >= 1500 && v <= 15 * 60000) s.push(v);
    return s.slice(-KEEP);
  }

  function easeOutCubic(x){ return 1 - Math.pow(1 - x, 3); }
  /* % صحيح من 1 لـ99 — ومبيرجعش لورا أبدًا مع الوقت */
  function progressAt(elapsed, eta){
    var t = Math.max(0, Number(elapsed) || 0), e = Math.max(1000, Number(eta) || DEF.card);
    var p = (t <= e) ? 1 + 94 * easeOutCubic(t / e)
                     : 95 + 4 * (1 - Math.exp(-(t - e) / e));
    return Math.max(1, Math.min(99, Math.floor(p)));
  }

  /* المراحل — نفس الكلام على POS والتابلت (التابلت بصيغة العميلة) */
  function phase(elapsed, eta, kind, who){
    var r = (Number(elapsed) || 0) / Math.max(1000, Number(eta) || 1);
    var cust = who === 'customer';
    if(kind === 'instapay'){
      if(r < 0.35) return cust ? 'بنستلم تحويلك من البنك…' : 'مستنيين رسالة البنك…';
      if(r < 0.75) return 'البنك بيأكد العملية…';
      if(r < 1.05) return 'ثواني وبنأكد…';
      if(r < 3) return cust ? 'البنك متأخر شوية — شكرًا لصبرك 🌷' : 'البنك متأخر عن العادي — لسه مستنيين';
      return cust ? 'لسه مستنيين البنك — الكاشير معاكي' : 'التأكيد اتأخر كتير — راجعي الإيصال ولو سليم أكّدي يدوي';
    }
    if(r < 0.35) return cust ? 'حطّي الكارت في الماكينة' : 'العميلة بتحط الكارت…';
    if(r < 0.75) return 'البنك بيراجع العملية…';
    if(r < 1.05) return 'ثواني وبنأكد…';
    if(r < 3) return cust ? 'البنك بياخد وقت شوية…' : 'البنك متأخر عن العادي — لسه بنتابع';
    return cust ? 'لسه مستنيين البنك — الكاشير معاكي' : 'مفيش رد — بص على الماكينة: لو طبعت APPROVED احفظ يدوي';
  }
  function isLate(elapsed, eta){ return (Number(elapsed) || 0) > 3 * Math.max(1000, Number(eta) || 1); }

  /* ❌ أسباب رفض البنك — أكواد ISO 8583 الشائعة + نصوص Paymob */
  var CODES = {
    '05': 'البنك رفض العملية — جرّبي كارت تاني أو كلّمي البنك',
    '51': 'الرصيد مش كفاية',
    '54': 'الكارت منتهي',
    '55': 'الرقم السري غلط',
    '75': 'الرقم السري اتكتب غلط كذا مرة — الكارت اتقفل مؤقتًا',
    '61': 'المبلغ أكبر من حد الكارت',
    '65': 'الكارت عدّى عدد العمليات المسموح النهارده',
    '57': 'الكارت مش مسموح له بالعملية دي',
    '58': 'الكارت مش مسموح له بالعملية دي',
    '62': 'الكارت عليه قيود من البنك',
    '14': 'رقم الكارت مش صحيح',
    '41': 'الكارت مبلّغ عنه — متكمّلش بيه',
    '43': 'الكارت مبلّغ عنه — متكمّلش بيه',
    '12': 'العملية مش مقبولة',
    '13': 'المبلغ مش مقبول',
    '91': 'بنك الكارت مش بيرد — جرّبي تاني بعد شوية',
    '96': 'عطل عند البنك — جرّبي تاني'
  };
  var TEXT = [
    [/insufficient|not\s*sufficient|nsf/i, '51'],
    [/expired/i, '54'],
    [/(incorrect|invalid|wrong)\s*pin|pin\s*(incorrect|invalid|error)/i, '55'],
    [/pin\s*tries|exceed(ed)?\s*pin/i, '75'],
    [/do\s*not\s*hono/i, '05'],
    [/(exceeds?|over)\s*(withdrawal\s*)?(amount\s*)?limit|limit\s*exceed/i, '61'],
    [/lost|stolen/i, '41'],
    [/restricted/i, '62'],
    [/not\s*permitted|not\s*allowed/i, '57'],
    [/issuer.*(unavailable|inoperative)|switch.*down/i, '91']
  ];
  function reasonAr(raw){
    var s = String(raw == null ? '' : raw).trim();
    if(!s) return 'البنك رفض العملية';
    var m = s.match(/^\D*?(\d{1,3})\D*$/);
    if(m){ var c = ('0' + m[1]).slice(-2); if(CODES[c]) return CODES[c]; }
    for(var i = 0; i < TEXT.length; i++) if(TEXT[i][0].test(s)) return CODES[TEXT[i][1]];
    if(/time\s*out|timed\s*out/i.test(s)) return 'الماكينة أو البنك ما ردّش في الوقت — جرّبي تاني';
    if(/cancel/i.test(s)) return 'العملية اتلغت من على الماكينة';
    return 'البنك رفض العملية (' + s.slice(0, 40) + ')';
  }

  var api = { etaFrom: etaFrom, addSample: addSample, progressAt: progressAt, phase: phase, isLate: isLate, reasonAr: reasonAr, median: median, DEF: DEF };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  if(typeof window !== 'undefined') window.PayLiveCore = api;
})();
