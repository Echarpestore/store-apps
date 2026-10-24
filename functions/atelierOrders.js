/* ============================================================
   🛍️ atelierOrders.js — أوردرات غرفة القياس (الأتيليه)
   ------------------------------------------------------------
   قرار المالك: كل قطعة بتتباع من غرفة القياس **توصله إشعار بالصورة**
   على Office، ومفيش أي حاجة بتروح الـPOS. (الاستلام من الفرع جوّه
   التطبيق بيمشي في السلة العادية → onlineOrderPlace → POS.)

   الدوال:
     · atelierOrderPlace  (onCall) — العميلة بتطلب. التحقق والأسعار
       والشحن **على السيرفر** — مفيش رقم بيتصدّق من الموبايل.
     · atelierOrdersAdmin (onCall) — صفحة الإدارة: عرض + تغيير الحالة.
       للموظفين بس (دخول email/password).
     · atelierImg (onRequest) — صورة المنتج المصغّرة كـJPEG عشان
       الإشعار يقدر يعرضها (الإشعار محتاج لينك مش data-URL).
       صور المنتجات عامة أصلًا (أي حد مسجّل يقرا مستنداتها).

   🔒 الأوردرات في مجموعة atelier_orders — مفيش قاعدة أمان ليها في
      Firestore، يعني **محدش يقراها من الموبايل خالص** (فيها عناوين
      وأرقام). القراية بس عن طريق atelierOrdersAdmin.
   🔒 الخصوصية: الأوردر فيه صورة **المنتج** بس — صورة العميلة وهي
      لابسة القطعة **مبتتبعتش ومبتتخزّنش** (وعد صفحة الخصوصية).

   🔴 نفس قواعد النشر (v2 بس، من غير initializeApp). الربط في index.js:
       Object.assign(exports, require("./atelierOrders"));
   📌 النشر:
       firebase deploy --only functions:atelierOrderPlace,functions:atelierOrdersAdmin,functions:atelierImg
   ============================================================ */
"use strict";

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

const COL_ORDERS = "atelier_orders";
const COL_GUARD = "atelier_order_guard";
const COL_SETTINGS = "pos_test_settings";
const ADMIN_DOC = "atelier_echarpe";
const SITE = "https://www.echarpe.store";
const IMG_FN = "https://us-central1-customer-feedback-8ac1d.cloudfunctions.net/atelierImg";
const STATUSES = ["new", "confirmed", "shipped", "done", "cancelled"];
const MAX_ITEMS = 10;
const GUARD_MAX = 5;                 // أوردرات للرقم في الساعة
const GUARD_WINDOW = 60 * 60 * 1000;
/* 🏷️ أسعار صور الموقع الثابتة (atelier/collection) — بالاسم.
   ⚠️ لازم تطابق العمود السادس في HOUSE بـatelier/atelier-core.js (فيه
   اختبار بيقارنهم). القطع اللي من صفحة الإدارة سعرها من Firestore. */
const HOUSE_PRICES = {
  "linen-noir": 490, "linen-violet": 490, "linen-taupe": 490, "linen-fume": 490, "linen-rose": 490
};
const FRIENDLY = "مقدرناش نسجّل الطلب دلوقتي — جرّبي تاني أو كلّمينا على واتساب 🤍";

/* ============================================================
   دوال نقية — بتتختبر
   ============================================================ */
function cleanText(v, max) {
  return String(v == null ? "" : v).replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max || 120);
}
/* رقم مصري: 01xxxxxxxxx (أو +20/0020) → 01xxxxxxxxx */
function cleanPhone(v) {
  let d = String(v || "").replace(/[^\d]/g, "");
  if (d.indexOf("0020") === 0) d = d.slice(4);
  else if (d.indexOf("20") === 0 && d.length === 12) d = d.slice(2);
  if (d.length === 10 && d.charAt(0) === "1") d = "0" + d;
  return /^01[0125]\d{8}$/.test(d) ? d : "";
}

/* صورة الإشعار: قطعة من صفحة الإدارة → atelierImg، صورة من الموقع →
   لينكها، غير كده مفيش. أي حاجة تانية جاية من الموبايل بتتجاهل. */
function imageUrlFor(it) {
  if (it.docId && /^[a-zA-Z0-9_-]{1,40}$/.test(it.docId)) return IMG_FN + "?id=" + it.docId;
  if (typeof it.img === "string" && /^collection\/[a-z0-9-]{1,40}\.jpg$/.test(it.img)) return SITE + "/atelier/" + it.img;
  return "";
}

/* الأسعار من السيرفر: قطع الإدارة بالـdocId، ومنتجات البيع بالباركود.
   القطعة اللي مالهاش سعر معروف بتتسجّل بـ0 (المالك بيأكّد بالتليفون). */
function priceItems(raw, adminItems, shopItems) {
  const byDoc = {}, byBc = {};
  (adminItems || []).forEach((x) => { if (x && x.id) byDoc[String(x.id)] = x; });
  (shopItems || []).forEach((x) => { if (x && x.barcode) byBc[String(x.barcode)] = x; });
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_ITEMS).map((r) => {
    const docId = /^[a-zA-Z0-9_-]{1,40}$/.test(String(r && r.docId || "")) ? String(r.docId) : "";
    const barcode = String(r && r.barcode || "").replace(/[^\w-]/g, "").slice(0, 40);
    const a = docId ? byDoc[docId] : null, s = barcode ? byBc[barcode] : null;
    const hm = /^collection\/([a-z0-9-]{1,40})\.jpg$/.exec(String(r && r.img || ""));
    const hp = hm ? HOUSE_PRICES[hm[1]] : 0;
    const price = Math.max(0, Math.round(Number((a && a.price) || (s && s.price) || hp || 0)));
    const item = {
      name: cleanText((a && a.name) || (s && s.name) || (r && r.name) || "قطعة", 60),
      model: cleanText((a && a.family) || (r && r.model) || "", 40),
      color: Math.max(0, Math.min(99, Math.floor(Number(r && r.color) || 0))),
      price: price, docId: docId, barcode: barcode || (a && a.barcode) || "",
      img: typeof (r && r.img) === "string" ? r.img : ""
    };
    item.imgUrl = imageUrlFor(item);
    delete item.img;
    return item;
  }).filter((x) => x.name);
}

function shippingFor(cfg, fulfillment, subtotal) {
  if (fulfillment !== "delivery") return 0;
  const fee = Math.max(0, Math.round(Number(cfg && cfg.shippingFee) || 40));
  const freeOver = Math.max(0, Number(cfg && cfg.freeOver) || 0);
  return freeOver && subtotal >= freeOver ? 0 : fee;
}

function validateOrder(d) {
  const name = cleanText(d && d.name, 60), phone = cleanPhone(d && d.phone);
  const fulfillment = d && d.fulfillment === "pickup" ? "pickup" : "delivery";
  if (name.length < 2) return { error: "NAME" };
  if (!phone) return { error: "PHONE" };
  const out = { name, phone, fulfillment, notes: cleanText(d && d.notes, 300) };
  if (fulfillment === "delivery") {
    out.governorate = cleanText(d && d.governorate, 30);
    out.address = cleanText(d && d.address, 300);
    if (!out.governorate || out.address.length < 6) return { error: "ADDRESS" };
  } else {
    out.branch = cleanText(d && d.branch, 30);
    if (!out.branch) return { error: "BRANCH" };
  }
  return out;
}

function guardDecide(entry, now) {
  const e = entry || {};
  let start = Number(e.windowStart) || 0, count = Math.max(0, Number(e.count) || 0);
  if (!start || now - start >= GUARD_WINDOW) { start = now; count = 0; }
  if (count >= GUARD_MAX) return { allow: false, count, windowStart: start };
  return { allow: true, count: count + 1, windowStart: start };
}

function orderCode(now, rnd) {
  const r = typeof rnd === "number" ? rnd : Math.random();
  return "A" + String(now).slice(-4) + String(Math.floor(r * 90 + 10));
}

function pushText(o) {
  const n = o.items.length;
  const what = n === 1 ? o.items[0].name : o.items[0].name + " + " + (n - 1) + " قطع";
  const how = o.fulfillment === "pickup" ? "استلام " + o.branch : "توصيل " + o.governorate;
  return {
    title: "🛍️ أوردر جديد من غرفة القياس" + (o.total ? " — " + o.total + " ج.م" : ""),
    body: o.name + " · " + what + " · " + how
  };
}

function isStaff(req) {
  const t = req && req.auth && req.auth.token;
  return !!(t && t.firebase && t.firebase.sign_in_provider === "password");
}

/* ============================================================
   🔔 إشعار Office — نفس مستند office_push بتاع sendToOffice في
   index.js، بس بصورة ولينك لصفحة الأوردرات.
   ============================================================ */
async function notifyOffice(db, title, body, imageUrl) {
  const snap = await db.collection(COL_SETTINGS).doc("office_push").get();
  if (!snap.exists) return;
  const d = snap.data() || {};
  let tokens = Array.isArray(d.list) ? d.list.map((x) => x && x.token).filter(Boolean) : [];
  if (!tokens.length && d.tokens) tokens = Object.keys(d.tokens);
  tokens = tokens.filter((t, i) => tokens.indexOf(t) === i);
  if (!tokens.length) return;
  const n = { title, body, dir: "rtl", lang: "ar", tag: "atelier-order-" + Date.now() };
  if (imageUrl) n.image = imageUrl;
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: imageUrl ? { title, body, imageUrl } : { title, body },
    webpush: { notification: n, fcmOptions: { link: SITE + "/atelier/admin.html#orders" } }
  });
  console.log("atelier order push", res.successCount, "/", tokens.length);
}

/* ============================================================
   ☁️ الدوال
   ============================================================ */
exports.atelierOrderPlace = onCall({ region: "us-central1" }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", FRIENDLY);
  const db = getFirestore();
  const data = (req && req.data) || {};
  const v = validateOrder(data);
  if (v.error) throw new HttpsError("invalid-argument", v.error);

  const col = db.collection(COL_SETTINGS);
  const [adm, shop, cfg] = await Promise.all([
    col.doc(ADMIN_DOC).get(), col.doc("online_shop_echarpe").get(), col.doc("online_shop_echarpe_cfg").get()
  ]).catch(() => [null, null, null]);
  const items = priceItems(data.items,
    adm && adm.exists ? (adm.data().items || []) : [],
    shop && shop.exists ? (shop.data().items || []) : []);
  if (!items.length) throw new HttpsError("invalid-argument", "ITEMS");
  const subtotal = items.reduce((s, x) => s + x.price, 0);
  const shipping = shippingFor(cfg && cfg.exists ? cfg.data() : null, v.fulfillment, subtotal);

  // 🚦 سقف لكل رقم في الساعة — الطلب مجاني فلوب بسيط يغرّق الإشعارات
  const now = Date.now();
  const gref = db.collection(COL_GUARD).doc(v.phone);
  try {
    await db.runTransaction(async (tx) => {
      const g = await tx.get(gref);
      const dec = guardDecide(g.exists ? g.data() : null, now);
      if (!dec.allow) throw new HttpsError("resource-exhausted", "اتسجّلت طلبات كتير من الرقم ده — هنكلمكِ قريب 🤍");
      tx.set(gref, { count: dec.count, windowStart: dec.windowStart });
    });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    throw new HttpsError("unavailable", FRIENDLY);
  }

  const order = Object.assign({}, v, {
    code: orderCode(now), status: "new", source: data.source === "app" ? "app" : "web",
    uid: req.auth.uid, items, subtotal, shipping, total: subtotal + shipping,
    createdAt: FieldValue.serverTimestamp(), createdMs: now
  });
  await db.collection(COL_ORDERS).add(order);
  try {
    const t = pushText(order);
    await notifyOffice(db, t.title, t.body, (items.find((x) => x.imgUrl) || {}).imgUrl || "");
  } catch (e) { console.warn("atelier push", e && e.message); }
  return { code: order.code, total: order.total, shipping };
});

exports.atelierOrdersAdmin = onCall({ region: "us-central1" }, async (req) => {
  if (!isStaff(req)) throw new HttpsError("permission-denied", "للموظفين بس");
  const db = getFirestore();
  const data = (req && req.data) || {};
  if (data.action === "status") {
    const id = String(data.id || "");
    if (!/^[a-zA-Z0-9]{10,40}$/.test(id) || STATUSES.indexOf(data.status) < 0) throw new HttpsError("invalid-argument", "BAD");
    await db.collection(COL_ORDERS).doc(id).update({ status: data.status, statusAt: Date.now(), statusBy: req.auth.uid });
    return { ok: true };
  }
  const snap = await db.collection(COL_ORDERS).orderBy("createdMs", "desc").limit(150).get();
  return { orders: snap.docs.map((d) => { const o = d.data(); delete o.createdAt; delete o.uid; o.id = d.id; return o; }) };
});

exports.atelierImg = onRequest({ region: "us-central1", cors: true }, async (req, res) => {
  const id = String(req.query.id || "");
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)) { res.status(400).send("bad"); return; }
  try {
    const d = await getFirestore().collection(COL_SETTINGS).doc(ADMIN_DOC + "_t_" + id).get();
    const m = d.exists && /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(d.data().img || ""));
    if (!m) { res.status(404).send("none"); return; }
    res.set("Content-Type", m[1]).set("Cache-Control", "public, max-age=86400").send(Buffer.from(m[2], "base64"));
  } catch (e) { res.status(500).send("err"); }
});

if (typeof module !== "undefined" && module.exports) {
  module.exports.cleanPhone = cleanPhone;
  module.exports.cleanText = cleanText;
  module.exports.priceItems = priceItems;
  module.exports.shippingFor = shippingFor;
  module.exports.validateOrder = validateOrder;
  module.exports.guardDecide = guardDecide;
  module.exports.orderCode = orderCode;
  module.exports.pushText = pushText;
  module.exports.imageUrlFor = imageUrlFor;
  module.exports.isStaff = isStaff;
  module.exports.STATUSES = STATUSES;
  module.exports.HOUSE_PRICES = HOUSE_PRICES;
}
