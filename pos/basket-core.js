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
}
if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    BASKET_DEFAULTS, basketInvoiceItems, basketBuildModel, basketSuggest,
    basketReason, basketTopPairs, basketIsStale, basketModelSize
  };
}
