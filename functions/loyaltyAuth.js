"use strict";
/* loyaltyAuth.js — دالة واحدة موجّهة بالـaction لدخول نادي العملاء (echarpe/Glow)
   ───────────────────────────────────────────────────────────────────────
   actions (كلها POST من التطبيق على us-central1 زي creditSpend):
     lookup         {brand, phone}                 → {exists, hasPin}
     login          {brand, phone, pin}            → {token, phone}
     set_pin        {brand, phone, pin}            → {token}   حساب من الكاشير من غير رقم سري
     register       {brand, phone, name, pin, source?, lang?} → {token}
     change_pin     {brand, oldPin, newPin}        (لازم دخول)  → {ok}
     ensure_code    {brand}                        (لازم دخول)  → {code}
     delete_account {brand, pin}                   (لازم دخول)  → {ok}
   الرقم السري بيتقارن هنا بس. القفل: 5 محاولات غلط ← 15 دقيقة (لكل رقم)،
   و40 غلط من نفس الـIP في 15 دقيقة. الدخول بيرجّع Custom Token
   بمطالبات {phone, brand, loyalty:true} — قواعد الأمان بتقفل مستند العميلة عليها.
   ⚠️ `initializeApp()` بيتنادى في index.js مش هنا.
   ⚠️ في index.js: Object.assign(exports, require("./loyaltyAuth"));
*/
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const crypto = require("crypto");
const C = require("./loyaltyAuthCore");

const COL_CUSTOMERS = "pos_test_customers";
const COL_ATTEMPTS = "loyalty_auth_attempts";   // مقفول على العملاء في الرولز
const COL_LOG = "loyalty_auth_log";             // مقفول على العملاء في الرولز
const COL_DELETIONS = "loyalty_deletions";      // مقفول على العملاء في الرولز

const db = () => getFirestore();
const fail = (code, http) => new HttpsError(http || "failed-precondition", C.ERR[code] || code, { code });

function ipKey(req) {
  const ip = (req.rawRequest && (req.rawRequest.headers["x-forwarded-for"] || req.rawRequest.ip)) || "";
  return "ip_" + crypto.createHash("sha256").update(String(ip).split(",")[0].trim()).digest("hex").slice(0, 24);
}
async function log(entry) { try { await db().collection(COL_LOG).add(Object.assign({ at: Date.now() }, entry)); } catch (e) { console.warn("loyaltyAuth log", e.message); } }

/* بيشغّل التحقق جوّه transaction: يقرا العدّاد، لو مقفول يرفض، يقارن،
   يحدّث العدّاد، ويرجّع نتيجة المقارنة + المستند. */
async function guardedVerify({ brand, phone, pin, req }) {
  const now = Date.now();
  const attRef = db().collection(COL_ATTEMPTS).doc(brand + "__" + phone);
  const ipRef = db().collection(COL_ATTEMPTS).doc(ipKey(req));
  const custRef = db().collection(COL_CUSTOMERS).doc(phone);
  /* ⚠️ عدّاد الـIP **برّه** الـtransaction وبيتكتب على الغلط بس:
     جوّه transaction كان كل تسجيل دخول (حتى الناجح) بيقفل مستند الـIP، ومئات العملاء على نفس
     IP شبكة الموبايل كانوا هيتحوّلوا لطابور واحد. دلوقتي القراية عادية والكتابة على الفشل بس
     (تقريبي عن قصد — الهدف إيقاف التخمين الآلي، مش عدّ دقيق). */
  const ipS = await ipRef.get();
  const ipA = ipS.exists ? ipS.data() : {};
  if (C.attemptState(ipA, now).locked) return { locked: true };
  const r = await db().runTransaction(async (t) => {
    const [attS, custS] = await Promise.all([t.get(attRef), t.get(custRef)]);
    const att = attS.exists ? attS.data() : {};
    if (C.attemptState(att, now).locked) return { locked: true };
    const doc = custS.exists ? custS.data() : null;
    const v = doc && !doc.deleted ? C.verifyPin(doc, pin) : { ok: false, noPin: !doc };
    t.set(attRef, C.nextAttempt(att, v.ok, now, C.MAX_FAILS), { merge: true });
    if (v.ok && v.migrate) t.set(custRef, C.pinWrite(pin, now), { merge: true });   // ترحيل تلقائي للهاش
    return { locked: false, ok: !!v.ok, noPin: !!v.noPin, doc, ref: custRef };
  });
  if (!r.locked && !r.ok) {
    try { await ipRef.set(C.nextAttempt(ipA, false, now, C.IP_MAX_FAILS), { merge: true }); } catch (e) { console.warn("ip counter", e.message); }
  }
  return r;
}
async function issueToken(brand, phone) {
  const uid = C.uidFor(brand, phone);
  return getAuth().createCustomToken(uid, { phone, brand, loyalty: true });
}
function requireSession(req, brand) {
  const t = req.auth && req.auth.token;
  if (!t || !t.loyalty || t.brand !== brand || !t.phone) throw fail("unauth", "unauthenticated");
  return String(t.phone);
}
async function uniqueCode(brand) {
  const field = C.BRANDS[brand].codeField;
  for (let i = 0; i < 6; i++) {
    const code = C.genCode(brand);
    const s = await db().collection(COL_CUSTOMERS).where(field, "==", code).limit(1).get();
    if (s.empty) return code;
  }
  return C.genCode(brand);
}

const handlers = {
  async lookup({ brand, phone }) {
    const s = await db().collection(COL_CUSTOMERS).doc(phone).get();
    const d = s.exists ? s.data() : null;
    if (!d || d.deleted) return { exists: false, hasPin: false };
    return { exists: true, hasPin: C.hasPin(d) };
  },
  async login({ brand, phone, pin, req }) {
    if (!C.validPin(pin)) throw fail("bad_pin", "invalid-argument");
    const r = await guardedVerify({ brand, phone, pin, req });
    if (r.locked) { await log({ brand, phone, ev: "locked" }); throw fail("locked", "resource-exhausted"); }
    if (!r.doc || r.doc.deleted) throw fail("not_found", "not-found");
    if (r.noPin) throw fail("wrong_pin", "permission-denied");   // حساب من غير رقم سري: المسار set_pin
    if (!r.ok) { await log({ brand, phone, ev: "wrong_pin" }); throw fail("wrong_pin", "permission-denied"); }
    return { token: await issueToken(brand, phone), phone };
  },
  async set_pin({ brand, phone, pin, req }) {
    if (!C.validPin(pin)) throw fail("bad_pin", "invalid-argument");
    const ref = db().collection(COL_CUSTOMERS).doc(phone);
    const now = Date.now();
    await db().runTransaction(async (t) => {
      const s = await t.get(ref); const d = s.exists ? s.data() : null;
      if (!d || d.deleted) throw fail("not_found", "not-found");
      if (C.hasPin(d)) throw fail("has_pin", "already-exists");   // ممنوع تبديل رقم موجود من غير القديم
      t.set(ref, C.pinWrite(pin, now), { merge: true });
    });
    /* ⚠️ ثغرة معروفة (قرار مؤجل للمالك): حساب اتعمل من الكاشير من غير رقم سري
       أي حد يعرف الرقم يقدر يعيّن له رقم سري. بنسجّلها عشان تبان في Office. */
    await log({ brand, phone, ev: "pin_set_first_time", ip: ipKey(req) });
    return { token: await issueToken(brand, phone) };
  },
  async register({ brand, phone, name, pin, source, lang, req }) {
    if (!C.validPin(pin)) throw fail("bad_pin", "invalid-argument");
    if (!String(name || "").trim()) throw fail("bad_name", "invalid-argument");
    const ref = db().collection(COL_CUSTOMERS).doc(phone);
    const code = await uniqueCode(brand);
    const now = Date.now();
    await db().runTransaction(async (t) => {
      const s = await t.get(ref); const d = s.exists ? s.data() : null;
      if (d && !d.deleted) throw fail("exists", "already-exists");
      if (d && d.deleted) t.set(ref, C.reactivateDoc({ name, pin, brand, source, lang, code, now }), { merge: true });
      else t.set(ref, C.registerDoc({ phone, name, pin, brand, source, lang, code, now }), { merge: true });
    });
    await log({ brand, phone, ev: "register", ip: ipKey(req) });
    return { token: await issueToken(brand, phone) };
  },
  async change_pin({ brand, oldPin, newPin, req }) {
    const phone = requireSession(req, brand);
    if (!C.validPin(newPin)) throw fail("bad_pin", "invalid-argument");
    const r = await guardedVerify({ brand, phone, pin: oldPin, req });
    if (r.locked) throw fail("locked", "resource-exhausted");
    if (!r.ok) throw fail("wrong_pin", "permission-denied");
    await r.ref.set(C.pinWrite(newPin, Date.now()), { merge: true });
    await log({ brand, phone, ev: "pin_changed" });
    return { ok: true };
  },
  async ensure_code({ brand, req }) {
    const phone = requireSession(req, brand);
    const field = C.BRANDS[brand].codeField;
    const ref = db().collection(COL_CUSTOMERS).doc(phone);
    const s = await ref.get(); const d = s.exists ? s.data() : {};
    if (d[field]) return { code: d[field] };
    const code = await uniqueCode(brand);
    await ref.set({ [field]: code }, { merge: true });
    return { code };
  },
  async delete_account({ brand, pin, req }) {
    const phone = requireSession(req, brand);
    const r = await guardedVerify({ brand, phone, pin, req });
    if (r.locked) throw fail("locked", "resource-exhausted");
    if (!r.doc) throw fail("not_found", "not-found");
    if (!r.ok) throw fail("wrong_pin", "permission-denied");
    const now = Date.now();
    const { update, audit } = C.deletionPlan(r.doc, { brand, phone, now, FieldDelete: FieldValue.delete() });
    const batch = db().batch();
    batch.set(r.ref, update, { merge: true });
    batch.set(db().collection(COL_DELETIONS).doc(String(now) + "_" + phone), audit);
    batch.delete(db().collection(COL_ATTEMPTS).doc(brand + "__" + phone));
    await batch.commit();
    // إبطال الجلسات على البراندين (نفس الرقم = نفس العميلة)
    for (const b of Object.keys(C.BRANDS)) {
      const uid = C.uidFor(b, phone);
      try { await getAuth().revokeRefreshTokens(uid); await getAuth().deleteUser(uid); } catch (e) { if (e.code !== "auth/user-not-found") console.warn("delete auth", uid, e.message); }
    }
    await log({ brand, phone, ev: "account_deleted" });
    return { ok: true };
  },
};

exports.loyaltyAuth = onCall({ region: "us-central1", cors: true, memory: "256MiB", timeoutSeconds: 30 }, async (req) => {
  const d = req.data || {};
  const action = String(d.action || "");
  if (!handlers[action]) throw fail("bad_action", "invalid-argument");
  const brand = String(d.brand || "");
  if (!C.validBrand(brand)) throw fail("bad_action", "invalid-argument");
  const phone = C.normPhone(d.phone);
  const needsPhone = ["lookup", "login", "set_pin", "register"].includes(action);
  if (needsPhone && !C.validPhone(phone)) throw fail("bad_phone", "invalid-argument");
  return handlers[action]({ brand, phone, pin: d.pin, name: d.name, source: d.source, lang: d.lang, oldPin: d.oldPin, newPin: d.newPin, req });
});
