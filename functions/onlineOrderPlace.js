/* ============================================================
   🛍️ onlineOrderPlace.js — إنشاء أوردر أونلاين بحجز **ذرّي**
   ------------------------------------------------------------
   المشكلة اللي الملف ده موجود عشانها:
     العميلتين تطلبا آخر قطعة في نفس الثانية. الفحص من الموبايل
     بيقرا «متاح ١» عند الاتنين، والاتنين بينجحوا. واحدة منهم هتيجي
     الفرع تلاقي القطعة مشيت — **وعد اتكسر قدام عميلة**.

   الحل: الفحص والخصم والإنشاء **في transaction واحدة على السيرفر**.
   Firestore بيضمن إن الاتنين مايعدّوش على نفس الرقم: التانية
   بتتعاد وتلاقي المتاح صفر وترفض بسبب واضح.

   🔴 قواعد النشر (مش بتتفاوض):
     · **v2 بس.** خلط v1 وv2 في نفس النشر بيفشّل النشر كله.
     · **متندهش `initializeApp()` هنا** — بتتنادى في `index.js`.
     · الربط في index.js:
         Object.assign(exports, require("./onlineOrderPlace"));
       ملف موجود ومش مربوط = دالة **مش منشورة أصلًا** (درس
       goldPriceUpdate: فضل في الريبو شهور وهو مش منشور).

   📌 النشر:
       firebase deploy --only functions:onlineOrderPlace,functions:onlineOrderRelease,functions:onlineOrderExpire
   ============================================================ */
"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const COL_ORDERS = "online_orders";
const COL_SETTINGS = "pos_test_settings";
const COL_INVENTORY = "pos_test_inventory";
const COL_GUARD = "online_order_guard";
const HOLD_MS = 24 * 60 * 60 * 1000;

/* ============================================================
   دوال نقية — بتتختبر بالهارنس بالاستخراج بالأقواس المتوازنة
   ============================================================ */


/* ============================================================
   🔒 الحماية — الدالة دي **مش محكومة بقواعد الأمان**
   ------------------------------------------------------------
   🔴 الفرق اللي لازم يبقى واضح: `onCall` بتشتغل بـAdmin SDK، يعني
      قواعد Firestore **مبتتطبّقش عليها خالص**. الرول اللي بيطلب
      `signedIn()` للكتابة المباشرة مالوش أي أثر هنا.
      فالفحص لازم يتعمل بالإيد، وإلا الدالة بتبقى باب جنب الرول.

   🔴 والحجز الذرّي بيخلي الهجمة **مؤثرة**: كل نداء بيخصم كمية
      فعلًا، فلوب بسيط بيصفّر `onlineQty` على كل المنتجات — بضاعة
      في الرف والتطبيق بيقول «خلص».

   ⚠️ الدخول مجهول (anonymous)، فالـuid مش هوية حقيقية — بيتعمل
      جديد بسهولة. عشان كده السقف على **الرقم** كمان مش على الـuid
      لوحده: الرقم أغلى في التزوير.
   ============================================================ */
var GUARD_WINDOW_MS = 60 * 60 * 1000;   // ساعة
var GUARD_MAX_PER_PHONE = 5;            // أوردرات للرقم الواحد في الساعة
var MAX_QTY_PER_LINE = 10;              // سقف الكمية في السطر الواحد

/* 🚦 القرار: يعدّي ولا يترفض — دالة نقية عشان تتختبر بأرقام.
   بترجّع { allow, count, windowStart } — والنافذة بتتصفّر مع الوقت. */
function guardDecide(entry, nowMs, maxPerWindow, windowMs) {
  const now = Number(nowMs) || Date.now();
  const win = Number(windowMs) || GUARD_WINDOW_MS;
  const max = Number(maxPerWindow) || GUARD_MAX_PER_PHONE;
  const e = entry || {};
  let start = Number(e.windowStart) || 0;
  let count = Math.max(0, Number(e.count) || 0);

  // ⚠️ النافذة القديمة بتتصفّر — من غير ده الرقم بيتحظر للأبد بعد
  //    أول ٥ أوردرات في عمره كله.
  if (!start || now - start >= win) { start = now; count = 0; }

  if (count >= max) return { allow: false, count, windowStart: start };
  return { allow: true, count: count + 1, windowStart: start };
}

/* ✂️ سقف الكمية في السطر — نداء واحد ممنوع يفضّي التخصيص كله. */
function capCartQty(cart, maxPerLine) {
  const cap = Number(maxPerLine) || MAX_QTY_PER_LINE;
  return (cart || []).map((c) => Object.assign({}, c, {
    qty: Math.min(cap, Math.max(0, Math.floor(Number(c && c.qty) || 0)))
  }));
}

/* 💸 مصاريف الشحن — **نسخة السيرفر**.
   ⚠️ لازم تطابق `orderShippingFee` في orders-core بالظبط. لو
      اختلفوا، العميلة تشوف رقم والسيرفر يحفظ رقم تاني — وده أسوأ
      من غلط واضح لأنه بيعدّي بصمت. */
function serverShippingFee(cfg, subtotal, governorate) {
  cfg = cfg || {};
  if (!cfg.deliveryEnabled) return 0;
  const sub = Number(subtotal) || 0;
  const freeOver = Number(cfg.freeOver);
  if (freeOver > 0 && sub >= freeOver) return 0;
  const list = Array.isArray(cfg.governorates) ? cfg.governorates : [];
  for (let i = 0; i < list.length; i++) {
    if (list[i] && String(list[i].name) === String(governorate)) {
      return Math.max(0, Number(list[i].fee) || 0);
    }
  }
  return Math.max(0, Number(cfg.shippingFee) || 0);
}

/* 📦 المتاح — أقل رقم بين المخصّص للبيع أونلاين واللي في الفرع فعلًا. */
function serverAvailable(shopItem, invDoc, branch) {
  if (!shopItem || shopItem.active !== true) return 0;
  const alloc = Math.max(0, Math.floor(Number(shopItem.onlineQty) || 0));
  if (!invDoc) return 0;
  const by = invDoc.qtyByBranch || {};
  const inBranch = Math.max(0, Number(by[branch]) || 0);
  return Math.min(alloc, inBranch);
}

/* ✅ فحص السلة على السيرفر — **الأسعار من مستند البيع أونلاين**.
   ⚠️ أي سعر جاي من العميلة بيتجاهل تمامًا. ده خط الدفاع اللي
      بيمنع طلب بـ٠ جنيه. */
function serverValidateCart(cart, shopItems, invByBarcode, branch) {
  const errors = [];
  const items = [];
  const byBc = {};
  (shopItems || []).forEach((s) => {
    if (s && s.barcode) byBc[String(s.barcode)] = s;
  });

  if (!branch) errors.push("الفرع مطلوب");
  if (!cart || !cart.length) errors.push("السلة فاضية");

  (cart || []).forEach((line) => {
    const bc = String((line && line.barcode) || "");
    const q = Math.max(0, Math.floor(Number(line && line.qty) || 0));
    const s = byBc[bc];
    if (!s) { errors.push("صنف مش معروض للبيع أونلاين"); return; }
    if (q <= 0) return;
    const avail = serverAvailable(s, invByBarcode[bc], branch);
    if (avail <= 0) { errors.push((s.name || "صنف") + " — خلص من " + branch); return; }
    if (q > avail) { errors.push((s.name || "صنف") + " — متاح " + avail + " بس"); return; }
    items.push({
      barcode: bc,
      name: String(s.name || ""),
      qty: q,
      price: Number(s.price) || 0
    });
  });

  return { ok: errors.length === 0 && items.length > 0, errors, items };
}

function serverTotal(items) {
  let t = 0;
  (items || []).forEach((it) => {
    const q = Math.max(0, Math.floor(Number(it.qty) || 0));
    const p = Number(it.price) || 0;
    if (q > 0 && p > 0) t += q * p;
  });
  return Math.round(t * 100) / 100;
}

function serverOrderCode(nowMs, phone) {
  const t = Number(nowMs) || Date.now();
  const tail = String(phone || "").replace(/\D/g, "").slice(-3) || "000";
  const mid = String(Math.floor(t / 1000) % 100000).padStart(5, "0");
  return mid + tail;
}

/* 🔁 خصم/إرجاع الكميات على مستند البيع أونلاين.
   ⚠️ بيرجّع **نسخة جديدة** من المصفوفة: التعديل في المكان جوه
      transaction بيخلي إعادة المحاولة تخصم مرتين. */
function applyQtyDelta(shopItems, orderItems, sign) {
  const delta = {};
  (orderItems || []).forEach((it) => {
    const bc = String(it.barcode);
    delta[bc] = (delta[bc] || 0) + Math.max(0, Math.floor(Number(it.qty) || 0));
  });
  return (shopItems || []).map((s) => {
    const d = delta[String(s && s.barcode)];
    if (!d) return s;
    const cur = Math.max(0, Math.floor(Number(s.onlineQty) || 0));
    const next = Math.max(0, cur + sign * d);
    return Object.assign({}, s, { onlineQty: next });
  });
}

/* ============================================================
   🛒 الدالة — إنشاء الأوردر
   ============================================================ */
exports.onlineOrderPlace = onCall({ region: "us-central1" }, async (req) => {
  const db = getFirestore();

  /* 🔒 أول سطر في الدالة — من غيره أي حد على النت يقدر ينده عليها.
     ⚠️ `onCall` **مفتوحة للعامة افتراضيًا**، ومفيش قاعدة أمان
        بتغطيها. ده مش تشديد زيادة: ده السد الوحيد. */
  if (!req.auth || !req.auth.uid) {
    throw new HttpsError("unauthenticated", "لازم تفتحي التطبيق الأول");
  }
  const uid = req.auth.uid;

  const d = req.data || {};

  const brand = d.brand === "glow" ? "glow" : "echarpe";
  const source = ["app", "glow", "web"].indexOf(String(d.source)) >= 0 ? String(d.source) : "web";
  const branch = String(d.branch || "").trim();
  const phone = String(d.phone || "").replace(/\D/g, "");
  const fulfillment = d.fulfillment === "delivery" ? "delivery" : "pickup";
  const cart = capCartQty(Array.isArray(d.items) ? d.items.slice(0, 30) : [], MAX_QTY_PER_LINE);

  if (phone.length < 10) throw new HttpsError("invalid-argument", "رقم موبايل مش صح");
  if (!branch) throw new HttpsError("invalid-argument", "الفرع مطلوب");
  if (!cart.length) throw new HttpsError("invalid-argument", "السلة فاضية");

  /* 🚚 بيانات التوصيل — نفس فحص الواجهة، بس هنا مفيش تخطّي. */
  const name = String(d.name || "").trim();
  const address = String(d.address || "").trim();
  const governorate = String(d.governorate || "").trim();
  if (name.length < 2) throw new HttpsError("invalid-argument", "الاسم مطلوب");
  if (fulfillment === "delivery") {
    if (!governorate) throw new HttpsError("invalid-argument", "المحافظة مطلوبة");
    if (address.length < 10) throw new HttpsError("invalid-argument", "العنوان ناقص");
  }

  const shopRef = db.collection(COL_SETTINGS).doc("online_shop_" + brand);
  const cfgRef = db.collection(COL_SETTINGS).doc("online_shop_" + brand + "_cfg");
  const orderRef = db.collection(COL_ORDERS).doc();
  /* 🚦 السقف على **الرقم** — الـuid مجهول وبيتعمل جديد في ثانية. */
  const guardRef = db.collection(COL_GUARD).doc(phone);

  const result = await db.runTransaction(async (tx) => {
    const [shopSnap, cfgSnap, guardSnap] = await Promise.all([
      tx.get(shopRef), tx.get(cfgRef), tx.get(guardRef)
    ]);

    /* ⚠️ السقف **جوه الـtransaction** مش قبلها: لو اتفحص برّه،
       عشر نداءات متوازية بيقروا نفس العدّاد ويعدّوا كلهم. */
    const g = guardDecide(guardSnap.exists ? guardSnap.data() : null,
                          Date.now(), GUARD_MAX_PER_PHONE, GUARD_WINDOW_MS);
    if (!g.allow) {
      throw new HttpsError("resource-exhausted",
        "طلبت كتير في وقت قصير — استني شوية وحاولي تاني");
    }
    const shopItems = (shopSnap.exists && Array.isArray(shopSnap.data().items))
      ? shopSnap.data().items : [];
    const cfg = cfgSnap.exists ? cfgSnap.data() : {};

    /* 📦 المخزون — مستند لكل باركود (الباركود = مفتاح المستند).
       ⚠️ **كل القراءات قبل أي كتابة** — ده شرط في transactions،
          وكسره بيرمي خطأ وقت التشغيل مش وقت الكتابة. */
    const barcodes = [...new Set(cart.map((c) => String((c && c.barcode) || "")).filter(Boolean))];
    const invDocs = await Promise.all(
      barcodes.map((bc) => tx.get(db.collection(COL_INVENTORY).doc(bc)))
    );
    const invByBarcode = {};
    invDocs.forEach((s, i) => { invByBarcode[barcodes[i]] = s.exists ? s.data() : null; });

    const chk = serverValidateCart(cart, shopItems, invByBarcode, branch);
    if (!chk.ok) throw new HttpsError("failed-precondition", chk.errors[0] || "السلة مش صالحة");

    const subtotal = serverTotal(chk.items);
    const shipping = fulfillment === "delivery"
      ? serverShippingFee(cfg, subtotal, governorate) : 0;
    /* 💳 الشحن كاش إجباري — الماكينة في الفرع مش مع المندوب. */
    const payMethod = fulfillment === "delivery"
      ? "cash" : (d.payMethod === "visa" ? "visa" : "cash");

    const now = Date.now();
    const doc = {
      phone, name, brand, branch, source,
      items: chk.items,
      count: chk.items.reduce((n, it) => n + it.qty, 0),
      total: subtotal,
      fulfillment, shipping,
      grandTotal: Math.round((subtotal + shipping) * 100) / 100,
      governorate, address,
      notes: String(d.notes || "").slice(0, 300),
      contactPhone: String(d.contactPhone || phone).replace(/\D/g, ""),
      payMethod,
      status: "placed",
      createdAt: now,
      reservedUntil: now + HOLD_MS,
      code: serverOrderCode(now, phone),
      uid,                   // 🔑 مين ندهها — للمتابعة لو حصل استغلال
      qtyHeld: true          // 🔑 الكمية اتخصمت — الإرجاع بيعتمد عليه
    };

    // 🔒 الخصم والإنشاء في نفس الـtransaction
    tx.set(shopRef, { items: applyQtyDelta(shopItems, chk.items, -1) }, { merge: true });
    tx.set(guardRef, { count: g.count, windowStart: g.windowStart, lastAt: Date.now() },
           { merge: true });
    tx.set(orderRef, doc);
    return { id: orderRef.id, code: doc.code, total: doc.total, shipping: doc.shipping,
             grandTotal: doc.grandTotal };
  });

  return result;
});

/* ============================================================
   ↩️ إرجاع الكمية لما الأوردر يتلغي أو ينتهي
   ------------------------------------------------------------
   ⚠️ من غير الدالة دي، كل أوردر متلغي بياكل من الكمية للأبد —
      المالك يلاقي «متاح صفر» وهو عنده بضاعة في الرف.
   ⚠️ `qtyHeld` بيتشال بعد الإرجاع: من غيره أي تعديل تاني على نفس
      الأوردر بيرجّع الكمية تاني (إرجاع مضاعف).
   ============================================================ */
exports.onlineOrderRelease = onDocumentUpdated(
  { region: "us-central1", document: "online_orders/{id}" },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    const dead = ["cancelled", "expired"];

    if (dead.indexOf(before.status) >= 0) return;      // كانت ميتة خلاص
    if (dead.indexOf(after.status) < 0) return;        // لسه حية
    if (after.qtyHeld !== true) return;                // الكمية اترجّعت قبل كده

    const db = getFirestore();
    const brand = after.brand === "glow" ? "glow" : "echarpe";
    const shopRef = db.collection(COL_SETTINGS).doc("online_shop_" + brand);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(shopRef);
      const items = (snap.exists && Array.isArray(snap.data().items)) ? snap.data().items : [];
      tx.set(shopRef, { items: applyQtyDelta(items, after.items || [], +1) }, { merge: true });
      tx.set(event.data.after.ref, { qtyHeld: false, releasedAt: Date.now() }, { merge: true });
    });
  }
);

/* ============================================================
   ⏳ الانتهاء التلقائي — كل ساعة
   ⚠️ الحالة بتتكتب هنا، والإرجاع بيحصل من `onlineOrderRelease`
      فوق (مصدر واحد لإرجاع الكمية — مسارين معناهم إرجاع مضاعف).
   ============================================================ */
exports.onlineOrderExpire = onSchedule(
  { region: "us-central1", schedule: "every 60 minutes", timeZone: "Africa/Cairo" },
  async () => {
    const db = getFirestore();
    const now = Date.now();
    const snap = await db.collection(COL_ORDERS)
      .where("status", "in", ["placed", "preparing", "ready"])
      .limit(300)
      .get();

    const batch = db.batch();
    let n = 0;
    snap.docs.forEach((doc) => {
      const o = doc.data() || {};
      const until = Number(o.reservedUntil) || 0;
      if (!until || until > now) return;
      batch.set(doc.ref, { status: "expired", expiredAt: now }, { merge: true });
      n++;
    });
    if (n) await batch.commit();
    return null;
  }
);

/* للاختبارات: الدوال النقية بس (الدوال السحابية مش بتتنادى في الهارنس) */
if (typeof module !== "undefined" && module.exports) {
  module.exports.serverShippingFee = serverShippingFee;
  module.exports.serverAvailable = serverAvailable;
  module.exports.serverValidateCart = serverValidateCart;
  module.exports.serverTotal = serverTotal;
  module.exports.serverOrderCode = serverOrderCode;
  module.exports.applyQtyDelta = applyQtyDelta;
  module.exports.guardDecide = guardDecide;
  module.exports.capCartQty = capCartQty;
  module.exports.GUARD_MAX_PER_PHONE = GUARD_MAX_PER_PHONE;
  module.exports.MAX_QTY_PER_LINE = MAX_QTY_PER_LINE;
}
