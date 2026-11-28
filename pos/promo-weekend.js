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
    fixed: { '902':399,   /* v783: 902 بـ399 في كل الفروع (قرار المالك 26-11) */ '832':299, '60':550, '582':199, '749':99 },
    // v777: سيتي سنتر بيبيع نفس الصنف بكود 772 (بدل 832) → 772 بـ299 هناك، و832 للفروع التانية
    // المفتاح = جزء من اسم الفرع (من غير حروف كبيرة/صغيرة) — 'madinaty' بيمسك 'echarpe Madinaty' و'echarpe Madinaty-1'
    pctByCode: { '138':10, '746':10 },   // v788: 746 خصم 10% في كل الفروع (قرار المالك)                        // v784: كود 138 خصم 10% (بدل 595 ثابت) — مش الـ15%
    pctByBranch: {},
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
  function pctFor(br){
    var out = {}; Object.keys(PROMO.pctByCode || {}).forEach(function(k){ out[k] = PROMO.pctByCode[k]; });
    var lb = String(br || '').trim().toLowerCase();
    Object.keys(PROMO.pctByBranch || {}).forEach(function(b){
      if(lb.indexOf(b.toLowerCase()) >= 0){ var o = PROMO.pctByBranch[b]; Object.keys(o).forEach(function(k){ out[k] = o[k]; }); }
    });
    return out;
  }
  /* v791 (قرار المالك 28-11): مرتجع **من غير فاتورة** في الـ14 يوم اللي بعد العرض بيرجع بسعر العرض مش السعر الكامل
     (قطعة اتباعت بـ85 كانت بترجع بـ100). المرتجع من الفاتورة نفسها مش بيتلمس — بيرجع باللي اتدفع فعلًا.
     لو الكاشير عدّلت السعر بإيدها (edited) سعرها هو اللي يمشي. */
  var RETURN_DAYS = 14;
  function addDays(key, n){ var p = key.split('-').map(Number); var d = new Date(Date.UTC(p[0], p[1]-1, p[2] + n)); return d.toISOString().slice(0,10); }
  function returnWindow(now, br){
    if(!now || !isEcharpeBranch(br)) return false;
    var d = cairoDay(now); return d > PROMO.to && d <= addDays(PROMO.to, RETURN_DAYS);
  }
  function promoUnitPrice(code, base, br){
    var PCT = pctFor(br), FIX = fixedFor(br);
    if(code === PROMO.bundle.code) return Math.min(base, PROMO.bundle.price / PROMO.bundle.qty);
    if(Object.prototype.hasOwnProperty.call(PCT, code)) return base * (1 - PCT[code]/100);
    if(Object.prototype.hasOwnProperty.call(FIX, code)) return Math.min(base, FIX[code]);
    return base * (1 - PROMO.pct/100);
  }
  function applyReturnWindow(cart, now, br){
    var win = returnWindow(now, br);
    (cart || []).forEach(function(c){
      if(!c) return;
      if(c.retPromoFull != null && (!win || !c.isReturn || c.fromInvoice || c.edited)){   // رجع بيع عادي / اتعدّل بإيدها
        if(!c.edited && Math.abs(Math.abs(Number(c.price)) - c.retPromoSet) < 0.005) c.price = (c.isReturn ? -1 : 1) * c.retPromoFull;
        if(c.discountName === RETURN_LABEL) c.discountName = c.retPromoNameBefore;
        c.retPromoFull = null; c.retPromoSet = null; return;
      }
      if(!win || !c.isReturn || c.fromInvoice || c.fromInvoiceId || c.edited) return;
      if(c.isRedemption || c.isRewardDiscount || c.isGiftCard || c.isCreditSpend || String(c.id || '').startsWith('__')) return;
      if(c.retPromoFull != null) return;
      var full = Math.abs(Number(c.price) || 0); if(!(full > 0)) return;
      var p = r2(promoUnitPrice(String(c.barcode || '').trim(), full, br));
      if(!(p < full - 0.004)) return;
      c.retPromoFull = full; c.retPromoSet = p; c.retPromoNameBefore = c.discountName == null ? null : c.discountName;
      c.price = -p; c.discountName = RETURN_LABEL;
    });
    return win;
  }
  var RETURN_LABEL = 'مرتجع من غير فاتورة — بسعر الجمعة البيضاء';
  window.weekendPromoReturnWindow = returnWindow;
  function applyWeekendPromo(cart, now, br){
    cart = cart || [];
    var on = promoActive(now, br);
    applyReturnWindow(cart, now, br);
    var FIX = fixedFor(br);
    var bundleLines = [];
    cart.forEach(function(c){
      if(!c) return;
      detectExternal(c);
      if(!on || !eligible(c)){ undo(c); return; }
      remember(c);
      var code = String(c.barcode || '').trim();
      if(code === PROMO.bundle.code){ bundleLines.push(c); return; }
      var PCT = pctFor(br);
      if(Object.prototype.hasOwnProperty.call(PCT, code)){
        var pc = PCT[code];
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
          var _c = typeof cart !== 'undefined' ? cart : [];
          /* v789 (فحص 27-11): شراء الموظف وأوردر الأونلاين ليهم سعرهم — العرض بيتشال منهم بالكامل.
             قبل كده لو الأصناف اتمسحت قبل كارت الموظف كان بياخد الـ15% + خصم الموظف فوقها (ترتيب المسح بيغيّر الإجمالي). */
          var _skip = (typeof staffPurchase !== 'undefined' && staffPurchase) || !!window._ordDelivering;
          if(_skip) applyWeekendPromo(_c, 0, '');
          else applyWeekendPromo(_c, Date.now(), typeof currentBranch !== 'undefined' ? currentBranch : '');
        }
      }catch(e){ console.warn('weekend promo', e); }
      return _orig.apply(this, arguments);
    };
    wrapped.__promoWrapped = true;
    window.renderCart = wrapped;
    try{ renderCart = wrapped; }catch(e){}
  }
})();
