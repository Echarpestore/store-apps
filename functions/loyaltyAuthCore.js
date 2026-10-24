"use strict";
/* loyaltyAuthCore.js — منطق بحت لدخول عميلات نادي العملاء (echarpe / Glow)
   من غير Firebase ولا شبكة عشان يتختبر بالكامل.
   ─────────────────────────────────────────────────────────────
   المشكلة اللي بيحلها: التطبيق كان بيقرا `loyaltyPin` من مستند العميلة
   ويقارنه في المتصفح (Anonymous Auth). أي حد معاه رقم موبايل كان يقدر
   يقرا الرقم السري ويدخل. دلوقتي المقارنة على السيرفر + قفل بعد محاولات
   + Custom Token بمطالبة `phone` عشان قواعد الأمان تقفل المستند على صاحبته.
*/
const crypto = require("crypto");

const PIN_RE = /^\d{4}$/;
const MAX_FAILS = 5;            // محاولات غلط قبل القفل
const LOCK_MIN = 15;            // دقايق القفل
const WINDOW_MIN = 15;          // نافذة عدّ المحاولات
const IP_MAX_FAILS = 300;       // محاولات غلط من نفس الـIP (كل الأرقام) في النافذة.
                               // ⚠️ كان 40 — شبكات الموبايل في مصر بتشارك IP واحد لآلاف العملاء (CGNAT)،
                               //    فالقفل كان هيطلع على ناس أبرياء لما العملاء يزيدوا. 300 لسه بتوقف التخمين الآلي.
const SCRYPT_KEYLEN = 32;
const BRANDS = { echarpe: { codeField: "loyaltyCode", prefix: "ECH" }, glow: { codeField: "loyaltyCode_glow", prefix: "GLW" } };

function normPhone(v) { return String(v || "").replace(/[^0-9]/g, ""); }
function validPhone(p) { return p.length >= 8 && p.length <= 15; }
function validPin(p) { return PIN_RE.test(String(p || "")); }
function validBrand(b) { return Object.prototype.hasOwnProperty.call(BRANDS, String(b || "")); }
function uidFor(brand, phone) { return "loy_" + brand + "_" + phone; }

/* ── هاش الرقم السري ── */
function hashPin(pin, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const h = crypto.scryptSync(String(pin), salt, SCRYPT_KEYLEN, { N: 16384, r: 8, p: 1 }).toString("hex");
  return { salt, hash: h };
}
function safeEq(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
/* بيقبل الهاش لو موجود، وإلا القيمة القديمة النصية (ترحيل تلقائي).
   بيرجّع { ok, migrate } — migrate=true يعني لازم نكتب الهاش دلوقتي. */
function verifyPin(doc, pin) {
  doc = doc || {};
  if (!validPin(pin)) return { ok: false, migrate: false };
  if (doc.loyaltyPinHash && doc.loyaltyPinSalt) {
    const { hash } = hashPin(pin, doc.loyaltyPinSalt);
    return { ok: safeEq(hash, doc.loyaltyPinHash), migrate: false };
  }
  if (doc.loyaltyPin != null && String(doc.loyaltyPin) !== "") {
    const ok = safeEq(String(doc.loyaltyPin), String(pin));
    return { ok, migrate: ok };
  }
  return { ok: false, migrate: false, noPin: true };
}
function hasPin(doc) {
  doc = doc || {};
  return !!((doc.loyaltyPinHash && doc.loyaltyPinSalt) || (doc.loyaltyPin != null && String(doc.loyaltyPin) !== ""));
}
/* الحقول اللي بتتكتب مع أي تعيين/تغيير للرقم السري.
   ⚠️ `loyaltyPin` النصي لسه بيتكتب مؤقتًا عشان `creditSpend`/الكاشير بيعتمدوا
   عليه — بيتشال في المرحلة التانية بعد تحويلهم للهاش. */
function pinWrite(pin, now) {
  const { salt, hash } = hashPin(pin);
  return { loyaltyPin: String(pin), loyaltyPinHash: hash, loyaltyPinSalt: salt, loyaltyPinAt: now };
}

/* ── القفل ── attempts = { fails, windowStart, lockedUntil } */
function attemptState(att, now) {
  att = att || {};
  const lockedUntil = Number(att.lockedUntil) || 0;
  if (lockedUntil > now) return { locked: true, retryAfterSec: Math.ceil((lockedUntil - now) / 1000) };
  return { locked: false, retryAfterSec: 0 };
}
function nextAttempt(att, ok, now, maxFails) {
  att = att || {};
  maxFails = maxFails || MAX_FAILS;
  if (ok) return { fails: 0, windowStart: now, lockedUntil: 0, lastOkAt: now };
  const winStart = Number(att.windowStart) || 0;
  const inWindow = now - winStart < WINDOW_MIN * 60000;
  const fails = (inWindow ? (Number(att.fails) || 0) : 0) + 1;
  const out = { fails, windowStart: inWindow ? winStart : now, lockedUntil: 0, lastFailAt: now };
  if (fails >= maxFails) { out.lockedUntil = now + LOCK_MIN * 60000; out.fails = 0; out.windowStart = now; }
  return out;
}

/* ── التسجيل ── */
function genCode(brand) { return BRANDS[brand].prefix + String(crypto.randomInt(0, 1e8)).padStart(8, "0"); }
function registerDoc({ phone, name, pin, brand, source, lang, code, now }) {
  const b = BRANDS[brand];
  const d = {
    name: String(name).trim().slice(0, 80), phone, points: 0, totalSpent: 0, lastVisit: null, notes: "", branch: "",
    createdAt: now, source: String(source || (brand === "glow" ? "glow_app" : "loyalty_app")).slice(0, 60),
    lang: lang === "en" ? "en" : "ar", deleted: false,
  };
  d[b.codeField] = code;
  Object.assign(d, pinWrite(pin, now));
  return d;
}
/* حساب اتمسح وبيتسجّل تاني بنفس الرقم — بنرجّعه من غير ما نلمس الفلوس */
function reactivateDoc({ name, pin, brand, source, lang, code, now }) {
  const b = BRANDS[brand];
  const d = { name: String(name).trim().slice(0, 80), notes: "", createdAt: now, deleted: false, deletedAt: null,
    source: String(source || "").slice(0, 60) || (brand === "glow" ? "glow_app" : "loyalty_app"), lang: lang === "en" ? "en" : "ar" };
  d[b.codeField] = code;
  Object.assign(d, pinWrite(pin, now));
  return d;
}

/* ── حذف الحساب ──
   المستند مشترك بين البراندين (نفس الرقم = نفس العميلة) فالحذف بيمسح
   البيانات الشخصية كلها ويبطّل الدخول من الاتنين. بيرجّع:
   { update: الحقول, audit: سجل }
   ⚠️ الرصيد (credit*) مبيتلمسش — فلوس اتدفعت، قرار الاسترداد للمالك.
   الفواتير القديمة بتفضل (سجلات محاسبية) بس مش بتتربط باسم. */
const DELETE_FIELDS = ["name", "notes", "lang", "loyaltyPin", "loyaltyPinHash", "loyaltyPinSalt", "loyaltyPinAt",
  "fcmTokens", "fcmTokens_echarpe", "fcmTokens_glow", "fcmTokenAt", "pendingRedeem", "activatedOffers", "loyaltyCode", "loyaltyCode_glow"];
function deletionPlan(doc, { brand, phone, now, FieldDelete }) {
  doc = doc || {};
  const update = { deleted: true, deletedAt: now, deletedVia: brand + "_app", name: "عميلة محذوفة", points: 0, pointsAtDeletion: Number(doc.points) || 0 };
  for (const f of DELETE_FIELDS) if (f !== "name" && Object.prototype.hasOwnProperty.call(doc, f)) update[f] = FieldDelete;
  const audit = { phone, brand, at: now, pointsForfeited: Number(doc.points) || 0,
    creditLeft: Object.keys(doc).filter(k => /^credit/i.test(k)).reduce((o, k) => (o[k] = doc[k], o), {}) };
  return { update, audit };
}

/* ── ردود موحّدة (الرسايل بتظهر للعميلة) ── */
const ERR = {
  bad_phone: "اكتبي رقم موبايل صح",
  bad_pin: "الرقم السري لازم يكون ٤ أرقام",
  bad_name: "اكتبي اسمك عشان نكمّل",
  wrong_pin: "الرقم السري غلط",
  locked: "محاولات كتير غلط — استني شوية وجرّبي تاني",
  not_found: "الرقم ده مش مسجّل",
  exists: "الرقم ده مسجّل قبل كده — ادخلي بالرقم السري",
  has_pin: "الحساب ده عليه رقم سري بالفعل",
  unauth: "لازم تدخلي الأول",
  bad_action: "طلب غير معروف",
};
module.exports = { PIN_RE, MAX_FAILS, LOCK_MIN, WINDOW_MIN, IP_MAX_FAILS, BRANDS, ERR, DELETE_FIELDS,
  normPhone, validPhone, validPin, validBrand, uidFor, hashPin, verifyPin, hasPin, pinWrite,
  attemptState, nextAttempt, genCode, registerDoc, reactivateDoc, deletionPlan };
