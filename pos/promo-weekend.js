/* ============================================================
   🏷️ عرض الويك إند — فروع إيشارب (قرار المالك 26-11-2026)
   من الخميس 26-11 لحد الأحد 29-11 (بتوقيت القاهرة) · كل الفروع (إيشارب + Glow من v779).
   • أكواد بسعر ثابت (PROMO_FIXED)
   • البندانة 187: كل 4 قطع بـ150 (القطعة الزيادة بسعرها الكامل)
   • باقي المحل كله: خصم 15%
   القواعد:
   • السعر بيتحسب من سعر الصنف الأصلي، والعميلة بتاخد الأحسن ليها (العرض أو أي خصم تاني شغال) — مش بيتجمعوا.
   • مش بيلمس: المرتجع · استبدال النقط · المكافأة · الرصيد · كارت الهدية · سطر الكاشير عدّلت سعره بإيدها ·
     عرض العميلة من التطبيق · أوردر الموظف (خصمه بيتحسب لوحده).
   • بيتعاد حسابه كل ما السلة تتغير (renderCart) — فزيادة/نقصان القطع بيظبط سعر البندانة لوحده.
   ============================================================ */
(function(){
  'use strict';
  var PROMO = {
    name: 'الجمعة البيضاء',
    from: '2026-11-26', to: '2026-11-29',          // شامل اليومين
    pct: 15,                                        // باقي المحل
    // v776 (تصحيح المالك 26-11): السعر الثابت هو اللي بيتطبق (مش 15% حتى لو أرخص) · 832=299 · 749=99
    fixed: { '902':399,   /* v783: 902 بـ399 في كل الفروع (قرار المالك 26-11) */ '832':299, '60':550, '582':199, '749':99, '746':510 },
    // v777: سيتي سنتر بيبيع نفس الصنف بكود 772 (بدل 832) → 772 بـ299 هناك، و832 للفروع التانية
    // المفتاح = جزء من اسم الفرع (من غير حروف كبيرة/صغيرة) — 'madinaty' بيمسك 'echarpe Madinaty' و'echarpe Madinaty-1'
    pctByCode: { '138':10 },                        // v784: كود 138 خصم 10% (بدل 595 ثابت) — مش الـ15%
    fixedByBranch: {
      'city centre': { add: { '772':299, '1115':550 }, remove: ['832'] }   // v785: 1115 = نفس صنف 60 بكود سيتي سنتر
    },
    bundle: { code:'187', qty:4, price:150 }        // البندانة 187: كل 4 بـ150 · الزيادة بالسعر الكامل
  };
  window.PROMO_WEEKEND = PROMO;

  function cairoDay(ts){
    try{ return new Intl.DateTimeFormat('en-CA', { timeZone:'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(ts)); }
    catch(e){ var d = new Date(ts + 2*3600e3); return d.toISOString().slice(0,10); }
  }
  function isEcharpeBranch(br){
    br = String(br || '').trim();
    if(!br || /office/i.test(br)) return false;
    return true;   // v779 (قرار المالك 26-11): نفس العرض في Glow كمان — كل فروع البيع
  }
  function promoActive(now, br){
    var d = cairoDay(now == null ? Date.now() : now);
    return d >= PROMO.from && d <= PROMO.to && isEcharpeBranch(br);
  }
  function r2(x){ return Math.round(x * 100) / 100; }
  function eligible(c){
    if(!c || c.isReturn || c.isRedemption || c.isRewardDiscount || c.isGiftCard || c.isCreditSpend) return false;
    if(c.edited || c.offerApplied || c.promoLocked) return false;
    if(String(c.id || '').startsWith('__')) return false;
    return true;
  }
  /* بيرجّع السطر لحالته قبل العرض (لو العرض اتشال أو السطر بقى مش مؤهل) */
  function undo(c){
    if(!c || !c.promoOn || c.edited || c.promoLocked) return;   // الكاشير غيّرت السعر بإيدها = سعرها هو اللي يفضل
    c.price = c.promoEng; c.promoSet = c.promoEng;
    c.originalPrice = c.promoOrigBefore;
    c.discountName = c.promoNameBefore;
    c.promoOn = false;
  }
  function remember(c){
    if(c.promoBase != null) return;
    c.promoEng = Number(c.price);                                    // السعر بعد أي خصم تاني شغال
    c.promoBase = Number(c.originalPrice != null ? c.originalPrice : c.price);   // سعر الصنف الأصلي
    c.promoOrigBefore = c.originalPrice == null ? null : c.originalPrice;
    c.promoNameBefore = c.discountName == null ? null : c.discountName;
    c.promoSet = c.price;
  }
  /* حد غيّر السعر بعد ما العرض حسبه (خصم على إجمالي الفاتورة · تعديل الصنف) → منلمسوش تاني */
  function detectExternal(c){
    if(c && c.promoBase != null && c.promoSet != null && Math.abs(Number(c.price) - Number(c.promoSet)) > 0.004) c.promoLocked = true;
  }
  function setPrice(c, p, label){
    p = r2(p);
    if(p < c.promoEng - 0.004){
      c.price = p; c.originalPrice = c.promoBase; c.discountName = label; c.promoOn = true; c.promoSet = p;
    }else{ undo(c); c.promoSet = c.price; }
  }

  function fixedFor(br){
    var out = {}; Object.keys(PROMO.fixed).forEach(function(k){ out[k] = PROMO.fixed[k]; });
    var lb = String(br || '').trim().toLowerCase();
    var key = Object.keys(PROMO.fixedByBranch || {}).find(function(b){ return lb.indexOf(b.toLowerCase()) >= 0; });
    var o = key ? PROMO.fixedByBranch[key] : null;
    if(o){ (o.remove || []).forEach(function(k){ delete out[k]; }); Object.keys(o.add || {}).forEach(function(k){ out[k] = o.add[k]; }); }
    return out;
  }
  window.weekendPromoFixedFor = fixedFor;
  function applyWeekendPromo(cart, now, br){
    cart = cart || [];
    var on = promoActive(now, br);
    var FIX = fixedFor(br);
    var bundleLines = [];
    cart.forEach(function(c){
      if(!c) return;
      detectExternal(c);
      if(!on || !eligible(c)){ undo(c); return; }
      remember(c);
      var code = String(c.barcode || '').trim();
      if(code === PROMO.bundle.code){ bundleLines.push(c); return; }
      if(PROMO.pctByCode && Object.prototype.hasOwnProperty.call(PROMO.pctByCode, code)){
        var pc = PROMO.pctByCode[code];
        setPrice(c, c.promoBase * (1 - pc/100), PROMO.name + ' ' + pc + '%');
        return;
      }
      if(Object.prototype.hasOwnProperty.call(FIX, code)){
        setPrice(c, Math.min(c.promoBase, FIX[code]), PROMO.name + ' (' + FIX[code] + ' ج)');
        return;
      }
      setPrice(c, c.promoBase * (1 - PROMO.pct/100), PROMO.name + ' ' + PROMO.pct + '%');
    });
    if(bundleLines.length){
      var q = 0, base = 0, eng = Infinity;
      bundleLines.forEach(function(c){ q += Math.max(0, Math.floor(Number(c.qty)||0)); base = Math.max(base, c.promoBase); eng = Math.min(eng, c.promoEng); });
      if(q > 0){
        var unitOther = eng;                                               // القطع الزيادة عن مضاعفات 4 = سعرها الكامل (قرار المالك)
        var groups = Math.floor(q / PROMO.bundle.qty), rem = q - groups * PROMO.bundle.qty;
        var groupPrice = Math.min(PROMO.bundle.price, PROMO.bundle.qty * unitOther);
        var total = groups * groupPrice + rem * unitOther;
        var label = PROMO.name + ' — كل ' + PROMO.bundle.qty + ' بـ' + PROMO.bundle.price;
        bundleLines.forEach(function(c){ setPrice(c, total / q, label); });
      }
    }
    return on;
  }
  window.applyWeekendPromo = applyWeekendPromo;
  window.weekendPromoActive = promoActive;

  /* الربط: قبل كل رسم للسلة (renderCart) */
  if(typeof window.renderCart === 'function' && !window.renderCart.__promoWrapped){
    var _orig = window.renderCart;
    var wrapped = function(){
      try{
        if(typeof cardCartEditBlockReason !== 'function' || !cardCartEditBlockReason()){
          if(typeof staffPurchase === 'undefined' || !staffPurchase){
            applyWeekendPromo(typeof cart !== 'undefined' ? cart : [], Date.now(), typeof currentBranch !== 'undefined' ? currentBranch : '');
          }
        }
      }catch(e){ console.warn('weekend promo', e); }
      return _orig.apply(this, arguments);
    };
    wrapped.__promoWrapped = true;
    window.renderCart = wrapped;
    try{ renderCart = wrapped; }catch(e){}
  }
})();
