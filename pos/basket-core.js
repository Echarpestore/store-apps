/* ============================================================
   🧺 basket-core.js — «اللي بيتاخد مع» (منطق خالص)
   ------------------------------------------------------------
   بيتعلّم من الفواتير القديمة إيه اللي بيتشري مع إيه، وبيقترح على
   الكاشير حاجة واحدة تعرضها على العميلة وهي واقفة.

   ⚠️ **مفيش Firestore ولا DOM هنا.** القراءة والعرض في الملف
      التاني — ده منطق بيتختبر بأرقام حقيقية.

   🔑 القواعد الحاكمة (نفس درس شريط الفرصة):
     · **اقتراح واحد** في المرة. تلاتة = الكاشير تبطّل تبص خالص.
     · **ماتقولش حاجة مش أكيدة.** اقتراح غلط قدام العميلة أوحش من
       مفيش اقتراح — فيه حد أدنى للتكرار، وتحته الشريط بيفضل فاضي.
     · **ماتقترحش حاجة مش موجودة في الفرع.** أسوأ اقتراح ممكن هو
       اللي العميلة تقول «آه هاخده» وتلاقيه مش موجود.

   📐 الحسبة — ليه مش «الأكتر مبيعًا»:
     الأكتر مبيعًا بيقترح **نفس الحاجة لكل الناس** (الأكياس، الجوارب).
     احنا عايزين اللي بيتشري **مع ده بالذات**. فبنستعمل:
       · `support`    = كام فاتورة فيها الاتنين
       · `confidence` = من اللي اشتروا A، كام % اشتروا B
       · `lift`       = confidence ÷ نسبة B في كل الفواتير
     `lift > 1` معناه إن وجود A بيزوّد احتمال B فعلًا — مش إن B
     بيتباع كتير على أي حال. الترتيب بالـlift هو اللي بيمنع اقتراح
     «الكيس» مع كل حاجة.
   ============================================================ */
'use strict';

/* الحدود الافتراضية — كلها قابلة للتغيير من الإعدادات.
   ⚠️ `minPairCount` هو الفرق بين معرفة وصدفة: صنفين اتشروا مع بعض
      مرة واحدة مش نمط، ده يوم. */
var BASKET_DEFAULTS = {
  minPairCount: 4,      // أقل عدد فواتير جمعت الاتنين
  minLift: 1.15,        // أقل من كده = مفيش علاقة حقيقية
  topPerItem: 4,        // كام اقتراح نحفظ لكل صنف
  maxAnchors: 600,      // سقف حجم الموديل (مستند الإعدادات محدود)
  windowDays: 120       // الفواتير الأقدم من كده بتغيّر الموسم مش بتفيده
};

/* 🧹 أصناف الفاتورة → باركودات فريدة.
   ⚠️ الاستبعادات مهمة: سطر الاستبدال والمكافأة والمرتجع **مش شراء**.
      من غيرها الموديل بيتعلّم إن «الاستبدال بيتاخد مع كل حاجة». */
function basketInvoiceItems(sale){
  var out = {};
  var items = (sale && sale.items) || [];
  for(var i = 0; i < items.length; i++){
    var it = items[i];
    if(!it) continue;
    if(it.isReturn || it.isRedemption || it.isRewardDiscount) continue;
    var bc = String(it.barcode || '').trim();
    if(!bc) continue;
    if(Number(it.qty) <= 0) continue;
    out[bc] = true;
  }
  return Object.keys(out);
}

/* 🏗️ بناء الموديل من الفواتير.
   بيرجّع { pairs, itemCount, invoices, builtAt } — شكل مضغوط
   يتحفظ في مستند واحد. */
function basketBuildModel(sales, opts){
  var o = Object.assign({}, BASKET_DEFAULTS, opts || {});
  var itemCount = {};      // كام فاتورة فيها الصنف ده
  var pairCount = {};      // 'a|b' → كام فاتورة فيها الاتنين
  var invoices = 0;

  (sales || []).forEach(function(sale){
    /* ⚠️ فاتورة العكس (المرتجع) **مستبعدة بالكامل**: هي مرآة لفاتورة
       أصلية، وحسابها بيضاعف كل نمط فيها. */
    if(sale && (sale.isReverse || sale.reverseOf)) return;
    var items = basketInvoiceItems(sale);
    // فاتورة بصنف واحد مالهاش أي معلومة عن «مع إيه»
    if(items.length < 2){
      if(items.length === 1){ itemCount[items[0]] = (itemCount[items[0]] || 0) + 1; invoices++; }
      return;
    }
    invoices++;
    items.sort();
    for(var i = 0; i < items.length; i++){
      itemCount[items[i]] = (itemCount[items[i]] || 0) + 1;
      for(var j = i + 1; j < items.length; j++){
        var k = items[i] + '|' + items[j];
        pairCount[k] = (pairCount[k] || 0) + 1;
      }
    }
  });

  /* 📊 من العدّ للعلاقات — الاتجاهين (A→B وB→A) لأن الثقة مش متماثلة:
     كل من اشترى «شال» اشترى «دبوس» ≠ العكس. */
  var byAnchor = {};
  Object.keys(pairCount).forEach(function(k){
    var n = pairCount[k];
    if(n < o.minPairCount) return;
    var parts = k.split('|');
    [[parts[0], parts[1]], [parts[1], parts[0]]].forEach(function(pair){
      var a = pair[0], b = pair[1];
      var ca = itemCount[a] || 0, cb = itemCount[b] || 0;
      if(!ca || !cb || !invoices) return;
      var confidence = n / ca;
      var lift = confidence / (cb / invoices);
      if(lift < o.minLift) return;
      (byAnchor[a] = byAnchor[a] || []).push({
        b: b, n: n,
        c: Math.round(confidence * 100) / 100,
        l: Math.round(lift * 100) / 100
      });
    });
  });

  /* ✂️ التقليم — الموديل بيتحفظ في مستند واحد، والسقف بيمنعه يكبر
     لحد ما الحفظ يفشل صامت. */
  var anchors = Object.keys(byAnchor).sort(function(a, b){
    return (itemCount[b] || 0) - (itemCount[a] || 0);
  }).slice(0, o.maxAnchors);

  var pairs = {};
  anchors.forEach(function(a){
    pairs[a] = byAnchor[a].sort(function(x, y){
      return (y.l - x.l) || (y.n - x.n);
    }).slice(0, o.topPerItem);
  });

  return {
    pairs: pairs,
    itemCount: itemCount,
    invoices: invoices,
    builtAt: (opts && opts.now) || Date.now(),
    windowDays: o.windowDays
  };
}

/* 💡 الاقتراح للكاشير — **واحد بس**.
   بيرجّع { barcode, name, price, reason, from } أو null. */
function basketSuggest(model, ctx){
  ctx = ctx || {};
  var cart = ctx.cart || [];
  if(!model || !model.pairs || !cart.length) return null;

  var inCart = {};
  cart.forEach(function(c){ if(c && c.barcode) inCart[String(c.barcode)] = true; });

  var products = ctx.products || [];
  var byBc = {};
  products.forEach(function(p){ if(p && p.barcode) byBc[String(p.barcode)] = p; });

  var branch = ctx.branch || '';
  var scored = [];

  /* 🎯 آخر صنف اتضاف له الأولوية: الكاشير لسه ماسكاه ومتكلمة فيه.
     اقتراح مبني على أول صنف في سلة من ٦ حاجات بيبان عشوائي. */
  var order = cart.slice().reverse();
  order.forEach(function(line, idx){
    var a = String(line && line.barcode || '');
    var list = model.pairs[a];
    if(!list) return;
    list.forEach(function(r){
      if(inCart[r.b]) return;                    // موجود في السلة خلاص
      var p = byBc[r.b];
      if(!p) return;                             // مش في الكتالوج/المخزون
      /* ⚠️ الفحص ده هو أهم حاجة في الدالة: اقتراح حاجة مش موجودة
         في الفرع بيخلي العميلة تقول «هاخده» وتتخذل. */
      var qty = (p.qtyByBranch && Number(p.qtyByBranch[branch])) || 0;
      if(qty <= 0) return;
      scored.push({
        barcode: r.b,
        name: p.name || '',
        price: Number(p.price) || 0,
        id: p.id,
        lift: r.l, conf: r.c, n: r.n,
        from: line.name || '',
        fromBarcode: a,
        rank: r.l * (1 - idx * 0.08)             // الأحدث في السلة أقوى
      });
    });
  });

  if(!scored.length) return null;
  scored.sort(function(x, y){ return y.rank - x.rank; });
  var best = scored[0];

  /* 🗣️ السبب بلغة الكاشير مش بلغة الإحصاء.
     «lift 2.4» مبتقولش حاجة لحد واقف على الماكينة. */
  best.reason = basketReason(best);
  return best;
}

function basketReason(s){
  if(!s) return '';
  var pct = Math.round((Number(s.conf) || 0) * 100);
  if(pct >= 50) return 'أغلب اللي أخدوا «' + (s.from || '') + '» أخدوا ده معاه';
  if(pct >= 25) return 'كتير بياخدوه مع «' + (s.from || '') + '»';
  return 'بيتاخد مع «' + (s.from || '') + '»';
}

/* 📈 معلومات للمالك — أقوى الارتباطات في المحل كله.
   ⚠️ الاتجاه الواحد بس (A→B) عشان الجدول ميتكررش مرتين لكل زوج. */
function basketTopPairs(model, limit){
  if(!model || !model.pairs) return [];
  var seen = {}, out = [];
  Object.keys(model.pairs).forEach(function(a){
    model.pairs[a].forEach(function(r){
      var key = [a, r.b].sort().join('|');
      if(seen[key]) return;
      seen[key] = true;
      out.push({ a: a, b: r.b, n: r.n, lift: r.l, conf: r.c });
    });
  });
  out.sort(function(x, y){ return (y.lift - x.lift) || (y.n - x.n); });
  return out.slice(0, Math.max(1, Number(limit) || 20));
}


/* ============================================================
   📊 معلومات المالك — من **نفس** مسحة الفواتير
   ------------------------------------------------------------
   ⚠️ بتتحسب مع بناء الموديل بالظبط، ومن نفس القراءة. تقرير منفصل
      معناه مسحة تانية لنفس الفواتير — ضِعف الفاتورة مقابل صفر
      معلومة جديدة.
   ⚠️ كل الأوقات **بتوقيت القاهرة صراحةً**: المالك بيفتح من بره
      مصر، وساعة الجهاز كانت هتقول إن الذروة الساعة ٤ العصر بينما
      هي ١٠ بالليل. (نفس درس سجل النشاط.)
   ============================================================ */
var CAIRO_TZ = 'Africa/Cairo';

function saleTimeMs(sale){
  if(!sale) return 0;
  if(Number(sale.createdAtMs)) return Number(sale.createdAtMs);
  var c = sale.createdAt;
  if(c && typeof c.toMillis === 'function'){ try{ return c.toMillis(); }catch(e){} }
  if(c && Number(c.seconds)) return Number(c.seconds) * 1000;
  if(Number(c)) return Number(c);
  return 0;
}

/* 🕒 الساعة واليوم بتوقيت القاهرة.
   ⚠️ `getHours()` بيرجّع ساعة **الجهاز** — القراءة دي هي الفرق بين
      «الذروة ٨ مساءً» و«الذروة ٢ ظهرًا» للمالك اللي بره مصر. */
function cairoParts(ms){
  try{
    var f = new Intl.DateTimeFormat('en-GB', {
      timeZone: CAIRO_TZ, hour:'2-digit', hour12:false, weekday:'short'
    }).formatToParts(new Date(ms));
    var h = 0, wd = '';
    f.forEach(function(p){
      if(p.type === 'hour') h = parseInt(p.value, 10) || 0;
      if(p.type === 'weekday') wd = p.value;
    });
    var map = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
    return { hour: h, dow: (map[wd] != null ? map[wd] : 0) };
  }catch(e){
    var d = new Date(ms);
    return { hour: d.getHours(), dow: d.getDay() };
  }
}

var BASKET_DOW_AR = ['الحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];

function basketInsights(sales, model, opts){
  var o = opts || {};
  var byHour = [], byDow = [], hourMoney = [], dowMoney = [];
  var i;
  for(i = 0; i < 24; i++){ byHour.push(0); hourMoney.push(0); }
  for(i = 0; i < 7; i++){ byDow.push(0); dowMoney.push(0); }

  var single = 0, counted = 0, pieces = 0, money = 0;
  var itemSold = {}, itemMoney = {};

  (sales || []).forEach(function(sale){
    if(sale && (sale.isReverse || sale.reverseOf)) return;
    var items = basketInvoiceItems(sale);
    if(!items.length) return;
    counted++;
    if(items.length === 1) single++;

    var t = saleTimeMs(sale);
    if(t){
      var p = cairoParts(t);
      byHour[p.hour]++; byDow[p.dow]++;
      var tot = Math.abs(Number(sale.total) || 0);
      hourMoney[p.hour] += tot; dowMoney[p.dow] += tot;
      money += tot;
    }

    (sale.items || []).forEach(function(it){
      if(!it || it.isReturn || it.isRedemption || it.isRewardDiscount) return;
      var bc = String(it.barcode || ''); if(!bc) return;
      var q = Math.max(0, Math.floor(Number(it.qty) || 0));
      itemSold[bc] = (itemSold[bc] || 0) + q;
      itemMoney[bc] = (itemMoney[bc] || 0) + q * (Number(it.price) || 0);
      pieces += q;
    });
  });

  /* 🎯 «فرصة عرض» — صنف **بطيء** بس ليه ارتباط قوي بصنف **ماشي**.
     ⚠️ دي أنفع معلومة في الشاشة كلها: الراكد لوحده معلومة محبطة،
        والماشي لوحده معلومة معروفة. الاتنين مع بعض = تصرّف واضح
        (حطه جنبه / قوليلها تعرضه معاه). */
  var opportunities = [];
  if(model && model.pairs){
    var sold = Object.keys(itemSold).map(function(k){ return itemSold[k]; }).sort(function(a,b){ return a-b; });
    var median = sold.length ? sold[Math.floor(sold.length / 2)] : 0;
    Object.keys(model.pairs).forEach(function(a){
      var aSold = itemSold[a] || 0;
      if(aSold < median) return;                  // المرساة لازم تكون ماشية
      model.pairs[a].forEach(function(r){
        var bSold = itemSold[r.b] || 0;
        if(bSold >= median) return;               // والمقترح لازم يكون بطيء
        opportunities.push({ fast: a, slow: r.b, lift: r.l, conf: r.c,
                             fastSold: aSold, slowSold: bSold });
      });
    });
    opportunities.sort(function(x, y){ return y.lift - x.lift; });
    opportunities = opportunities.slice(0, 12);
  }

  return {
    invoices: counted,
    pieces: pieces,
    money: Math.round(money),
    avgBasket: counted ? Math.round((pieces / counted) * 100) / 100 : 0,
    avgTicket: counted ? Math.round(money / counted) : 0,
    singlePct: counted ? Math.round((single / counted) * 100) : 0,
    byHour: byHour, byDow: byDow,
    hourMoney: hourMoney.map(function(x){ return Math.round(x); }),
    dowMoney: dowMoney.map(function(x){ return Math.round(x); }),
    opportunities: opportunities,
    at: o.now || Date.now()
  };
}

/* 🏆 أعلى قيمة في مصفوفة — للرسم النسبي. */
function basketPeak(arr){
  var best = 0, idx = 0;
  (arr || []).forEach(function(v, i){ if(v > best){ best = v; idx = i; } });
  return { idx: idx, value: best };
}

/* 🕐 الموديل قديم؟ — الموسم بيتغيّر والاقتراحات معاه.
   ⚠️ «قديم» مش «غلط»: بنقول للمالك يحدّثه، ومبنوقفش الاقتراحات. */
function basketIsStale(model, nowMs, maxDays){
  if(!model || !model.builtAt) return true;
  var days = ((nowMs || Date.now()) - Number(model.builtAt)) / 86400000;
  return days > (Number(maxDays) || 14);
}

function basketModelSize(model){
  try{ return JSON.stringify(model || {}).length; }catch(e){ return 0; }
}

if(typeof window !== 'undefined'){
  window.BASKET_DEFAULTS = BASKET_DEFAULTS;
  window.basketInvoiceItems = basketInvoiceItems;
  window.basketBuildModel = basketBuildModel;
  window.basketSuggest = basketSuggest;
  window.basketReason = basketReason;
  window.basketTopPairs = basketTopPairs;
  window.basketIsStale = basketIsStale;
  window.basketModelSize = basketModelSize;
  window.basketInsights = basketInsights;
  window.basketPeak = basketPeak;
  window.BASKET_DOW_AR = BASKET_DOW_AR;
  window.saleTimeMs = saleTimeMs;
  window.cairoParts = cairoParts;
}
if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    BASKET_DEFAULTS, basketInvoiceItems, basketBuildModel, basketSuggest,
    basketReason, basketTopPairs, basketIsStale, basketModelSize,
    basketInsights, basketPeak, BASKET_DOW_AR, saleTimeMs, cairoParts, CAIRO_TZ
  };
}
