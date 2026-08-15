/* ============================================================
   🛍️ orders-core.js — محرك أوردرات التطبيق (منطق خالص)
   ------------------------------------------------------------
   ملف **واحد مشترك** بين تطبيق العميلة (echarpe/Glow) وPOS —
   نفس قرار chat-core: مصدر واحد، مفيش نسخة تتنسى.

   ⚠️ **مفيش Firestore ولا DOM هنا خالص.** كله دوال نقية عشان
      تتختبر بالـharness. أي نداء قاعدة بيانات بيتعمل في المنادي.
      السبب: ده منطق **فلوس ومخزون** — لازم يتغطى باختبارات
      حقيقية مش بفحص نصوص.

   📌 القرارات المتفق عليها مع المالك:
     · «فيزا» = هتدفع بالفيزا **في الفرع** — مش دفع أونلاين.
       الدفع الأونلاين محتاج بوابة غير الـMPOS ومرتجعات وتسويات
       مختلفة تمامًا.
     · الحجز **٢٤ ساعة** وبعدها الأوردر بينتهي والكمية ترجع للبيع.
     · الأوردر بيتحوّل **فاتورة حقيقية** في POS — مخزون ونقط وكاش
       عادي. ممنوع مسار حفظ تاني (درس فاتورة العكس).
   ============================================================ */
'use strict';

/* 🔄 الحالات — والانتقالات المسموحة بس.
   ⚠️ الحالة بتتحرك **للأمام بس**. من غير الجدول ده، أي كتابة
      غلط (أو عميلة فتحت الكونسول) تقدر ترجّع أوردر متسلّم لـ
      «جاهز» وتستلمه تاني. */
var ORDER_FLOW = {
  placed:    ['preparing', 'cancelled', 'expired'],
  preparing: ['ready', 'cancelled', 'expired'],
  ready:     ['collected', 'cancelled', 'expired'],
  collected: [],          // 🔒 نهاية الطريق — مفيش رجوع
  cancelled: [],
  expired:   []
};

var ORDER_LABEL = {
  placed:    { t:'اتسجّل',   sub:'وصلنا طلبك',              icon:'📝' },
  preparing: { t:'بيتجهّز',  sub:'بنجهّزلك الحاجات',        icon:'🎁' },
  ready:     { t:'جاهز',     sub:'تعالي استلمي',            icon:'✅' },
  collected: { t:'اتسلّم',   sub:'اتمنى يعجبك 🌸',          icon:'🛍️' },
  cancelled: { t:'اتلغى',    sub:'الأوردر ده اتلغى',        icon:'✖️' },
  expired:   { t:'انتهى',    sub:'عدّت المدة والحجز رجع',   icon:'⏳' }
};

/* ⏳ مدة الحجز — ٢٤ ساعة.
   ⚠️ من غير حجز: العميلة تيجي الفرع تلاقي القطعة **اتباعت** —
      وعدناها وخذلناها، وده أوحش من إننا ماوعدناش.
   ⚠️ ومع حجز مفتوح: القطعة تتقفل ببلاش لو مجتش. */
var ORDER_HOLD_MS = 24 * 60 * 60 * 1000;
var ORDER_WARN_MS = 4 * 60 * 60 * 1000;   // ننبّهها قبل الانتهاء بـ٤ ساعات

function orderCanMove(from, to){
  var allowed = ORDER_FLOW[from];
  return !!allowed && allowed.indexOf(to) >= 0;
}

/* 💰 الإجمالي — بيتحسب **من الأسعار اللي في الأوردر** مش من اللي
   العميلة بعتته. القاعدة بتمنعها تكتب `total` أصلًا، بس الحساب
   هنا هو خط الدفاع التاني. */
function orderTotal(items){
  var t = 0;
  (items || []).forEach(function(it){
    var q = Math.max(0, Math.floor(Number(it && it.qty) || 0));
    var p = Number(it && it.price) || 0;
    if(p > 0 && q > 0) t += p * q;
  });
  return Math.round(t * 100) / 100;
}

function orderCount(items){
  var n = 0;
  (items || []).forEach(function(it){
    n += Math.max(0, Math.floor(Number(it && it.qty) || 0));
  });
  return n;
}

/* ⏳ انتهى؟ — بيتحسب من الوقت مش من حقل محفوظ.
   ⚠️ لو اعتمدنا على حقل `expired` محفوظ، هيحتاج حاجة تكتبه.
      والدالة السحابية لو وقعت يوم، الأوردرات هتفضل «جاهزة»
      للأبد والمخزون محجوز. الحساب من `reservedUntil` بيخلي
      الانتهاء صحيح حتى لو محدش كتب حاجة. */
function orderIsExpired(o, nowMs){
  if(!o) return false;
  if(o.status === 'collected' || o.status === 'cancelled') return false;
  var until = Number(o.reservedUntil) || 0;
  if(!until) return false;
  return (nowMs || Date.now()) > until;
}

function orderEffectiveStatus(o, nowMs){
  if(!o) return 'expired';
  if(orderIsExpired(o, nowMs)) return 'expired';
  return o.status || 'placed';
}

/* ⏱️ الوقت الباقي بصيغة مقروءة — «باقي ٣ ساعات» مش تاريخ خام.
   ⚠️ العميلة مش بتحسب فروق تواريخ. */
function orderTimeLeft(o, nowMs){
  var until = Number(o && o.reservedUntil) || 0;
  if(!until) return '';
  var ms = until - (nowMs || Date.now());
  if(ms <= 0) return 'انتهى';
  var h = Math.floor(ms / 3600000);
  if(h >= 1) return 'باقي ' + h + (h === 1 ? ' ساعة' : (h === 2 ? ' ساعتين' : (h <= 10 ? ' ساعات' : ' ساعة')));
  var m = Math.max(1, Math.floor(ms / 60000));
  return 'باقي ' + m + ' دقيقة';
}

function orderNearExpiry(o, nowMs){
  var until = Number(o && o.reservedUntil) || 0;
  if(!until) return false;
  var ms = until - (nowMs || Date.now());
  return ms > 0 && ms <= ORDER_WARN_MS;
}

/* 📦 الكمية المتاحة في فرع — نفس منطق POS بالظبط.
   ⚠️ `qtyByBranch` هو المصدر: `quantity` مجموع كل الفروع، وعرضه
      للعميلة معناه إنها تطلب حاجة موجودة في فرع تاني خالص. */
function orderBranchQty(product, branch){
  if(!product) return 0;
  var by = product.qtyByBranch;
  if(by && typeof by === 'object') return Math.max(0, Number(by[branch]) || 0);
  return 0;
}

/* ✅ فحص السلة قبل الإرسال — بيرجّع { ok, errors[], items[] }
   ⚠️ الفحص ده **لازم يتعاد في POS وقت التسليم**: بين لحظة الطلب
      ولحظة الاستلام ممكن القطعة تكون اتباعت في المحل. الفحص هنا
      بيمنع الطلب الغلط من الأول، مش بيضمن التسليم. */
function orderValidateCart(cart, products, branch, nowMs){
  var errors = [], items = [];
  var byBarcode = {};
  (products || []).forEach(function(p){ if(p && p.barcode) byBarcode[String(p.barcode)] = p; });

  if(!branch) errors.push('اختاري الفرع اللي هتستلمي منه');
  if(!cart || !cart.length) errors.push('السلة فاضية');

  (cart || []).forEach(function(line){
    var p = byBarcode[String(line && line.barcode)];
    var q = Math.max(0, Math.floor(Number(line && line.qty) || 0));
    if(!p){ errors.push('صنف مش موجود في الكتالوج'); return; }
    if(q <= 0) return;
    var have = orderBranchQty(p, branch);
    if(have <= 0){
      errors.push((p.name || 'صنف') + ' — مش موجود في ' + branch);
      return;
    }
    if(q > have){
      errors.push((p.name || 'صنف') + ' — متاح ' + have + ' بس');
      return;
    }
    items.push({
      barcode: String(p.barcode),
      name: String(p.name || ''),
      qty: q,
      price: Number(p.price) || 0
    });
  });

  return { ok: errors.length === 0 && items.length > 0, errors: errors, items: items };
}

/* 🧾 بناء مستند الأوردر — **مصدر واحد** للشكل.
   ⚠️ الأسعار بتتاخد من الكتالوج جوه `orderValidateCart` مش من
      المدخلات، والإجمالي بيتحسب هنا. لو سبنا العميلة تبعت
      `total`، تقدر تطلب بـ٠ جنيه. */
function orderBuild(o){
  o = o || {};
  var now = Number(o.nowMs) || Date.now();
  var items = o.items || [];
  return {
    phone: String(o.phone || ''),
    name: String(o.name || ''),
    brand: String(o.brand || ''),
    branch: String(o.branch || ''),
    items: items,
    count: orderCount(items),
    total: orderTotal(items),
    payMethod: (o.payMethod === 'visa') ? 'visa' : 'cash',
    status: 'placed',
    createdAt: now,
    reservedUntil: now + ORDER_HOLD_MS,
    code: o.code || orderCode(now, o.phone)
  };
}

/* 🔢 كود قصير للأوردر — العميلة بتقوله للكاشير، والكاشير بتدوّر بيه.
   ⚠️ الأرقام بس (من غير حروف): أسهل في القراءة الصوتية على
      التليفون، ومفيش لبس بين 0/O و1/I. */
function orderCode(nowMs, phone){
  var t = Number(nowMs) || Date.now();
  var tail = String(phone || '').replace(/\D/g, '').slice(-3) || '000';
  var mid = String(Math.floor(t / 1000) % 100000).padStart(5, '0');
  return mid + tail;
}

/* 📋 الخطوات اللي العميلة بتشوفها — رقم الخطوة الحالية وعنوانها.
   ⚠️ النص **وعد بحالة مش بميعاد**: "بنجهّزلك" مش "هيبقى جاهز
      خلال ساعة". الوعد بميعاد اللي مااتحققش أوحش من إننا
      ماوعدناش أصلًا (نفس قاعدة نص الطلبات). */
var ORDER_STEPS = ['placed', 'preparing', 'ready', 'collected'];
function orderStepIndex(status){
  var i = ORDER_STEPS.indexOf(status);
  return i < 0 ? 0 : i;
}
function orderNextHint(status){
  if(status === 'placed')    return 'بنراجع طلبك — هنبدأ نجهّزه حالًا';
  if(status === 'preparing') return 'لسه بنجهّز — هنقولك أول ما يخلص';
  if(status === 'ready')     return 'روحي الفرع واستلمي — قولي رقم الأوردر أو امسحي كارتك';
  if(status === 'collected') return 'اتسلّم — اتمنى يعجبك 🌸';
  if(status === 'expired')   return 'عدّت المدة والحجز رجع — تقدري تطلبي تاني';
  return '';
}

if(typeof window !== 'undefined'){
  window.ORDER_FLOW = ORDER_FLOW;
  window.ORDER_LABEL = ORDER_LABEL;
  window.ORDER_STEPS = ORDER_STEPS;
  window.ORDER_HOLD_MS = ORDER_HOLD_MS;
  window.orderCanMove = orderCanMove;
  window.orderTotal = orderTotal;
  window.orderCount = orderCount;
  window.orderIsExpired = orderIsExpired;
  window.orderEffectiveStatus = orderEffectiveStatus;
  window.orderTimeLeft = orderTimeLeft;
  window.orderNearExpiry = orderNearExpiry;
  window.orderBranchQty = orderBranchQty;
  window.orderValidateCart = orderValidateCart;
  window.orderBuild = orderBuild;
  window.orderCode = orderCode;
  window.orderStepIndex = orderStepIndex;
  window.orderNextHint = orderNextHint;
}
if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    ORDER_FLOW, ORDER_LABEL, ORDER_STEPS, ORDER_HOLD_MS, ORDER_WARN_MS,
    orderCanMove, orderTotal, orderCount, orderIsExpired, orderEffectiveStatus,
    orderTimeLeft, orderNearExpiry, orderBranchQty, orderValidateCart,
    orderBuild, orderCode, orderStepIndex, orderNextHint
  };
}
