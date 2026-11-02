/* ============================================================
   🔐 atelierAdmins.js — مين يدخل صفحة إدارة غرفة القياس
   ------------------------------------------------------------
   القايمة في Firestore: atelier_admins/config
     owners: ["mail@…"]   ← المالكة (بتتحط من Firebase Console بس)
     emails: ["mail@…"]   ← اللي المالكة بتضيفهم من صفحة الإدارة
   🔒 مفيش قاعدة أمان للمجموعة دي = محدش يقراها أو يكتبها من الموبايل
      ولا حتى الموظفين. الكتابة من هنا (Admin SDK) أو من الكونسول بس.
   ⚠️ لو المستند لسه مش موجود → أي حساب موظفين يدخل (زي الأول) لحد
      ما المالكة تعمله. ونفس الشرط في القواعد (firestore-phase2.rules).
   النشر:
     firebase deploy --only functions:atelierAdmins
   ============================================================ */
"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const COL = "atelier_admins", DOC = "config";
const MAX_EMAILS = 20;

function normEmail(e) {
  const s = String(e || "").trim().toLowerCase();
  return /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,24}$/.test(s) ? s : "";
}
function isStaff(req) {
  const t = req && req.auth && req.auth.token;
  return !!(t && t.firebase && t.firebase.sign_in_provider === "password");
}
/* القرار نفسه (دالة نقية) */
function decide(req, cfg) {
  if (!isStaff(req)) return { admin: false, owner: false, setup: !!cfg };
  if (!cfg) return { admin: true, owner: false, setup: false };          // لسه متقفلتش
  const email = normEmail(req.auth.token.email);
  const owners = (cfg.owners || []).map(normEmail), emails = (cfg.emails || []).map(normEmail);
  const owner = !!email && owners.indexOf(email) >= 0;
  return { admin: owner || (!!email && emails.indexOf(email) >= 0), owner, setup: true };
}
async function readCfg(db) {
  const d = await db.collection(COL).doc(DOC).get();
  return d.exists ? d.data() : null;
}
/* للدوال التانية: يرمي permission-denied لو مش مسموح */
async function requireAtelierAdmin(req, db) {
  const r = decide(req, await readCfg(db || getFirestore()));
  if (!r.admin) throw new HttpsError("permission-denied", "الحساب ده مش مسموح له بصفحة الإدارة");
  return r;
}

exports.atelierAdmins = onCall({ region: "us-central1" }, async (req) => {
  if (!isStaff(req)) throw new HttpsError("permission-denied", "للموظفين بس");
  const db = getFirestore();
  const data = (req && req.data) || {};
  const cfg = await readCfg(db);
  const me = decide(req, cfg);
  if (data.action === "me" || !data.action) {
    return Object.assign({ email: normEmail(req.auth.token.email) }, me,
      me.owner ? { owners: cfg.owners || [], emails: cfg.emails || [] } : {});
  }
  if (!me.owner) throw new HttpsError("permission-denied", "المالكة بس اللي تضيف أو تشيل");
  const email = normEmail(data.email);
  if (!email) throw new HttpsError("invalid-argument", "EMAIL");
  const ref = db.collection(COL).doc(DOC);
  if (data.action === "add") {
    if ((cfg.emails || []).length >= MAX_EMAILS) throw new HttpsError("resource-exhausted", "MAX");
    await ref.update({ emails: FieldValue.arrayUnion(email), updatedAt: Date.now(), updatedBy: req.auth.uid });
  } else if (data.action === "remove") {
    await ref.update({ emails: FieldValue.arrayRemove(email), updatedAt: Date.now(), updatedBy: req.auth.uid });
  } else throw new HttpsError("invalid-argument", "ACTION");
  const after = await readCfg(db);
  return { ok: true, owners: after.owners || [], emails: after.emails || [] };
});

exports.requireAtelierAdmin = requireAtelierAdmin;
if (typeof module !== "undefined" && module.exports) {
  module.exports.decide = decide;
  module.exports.normEmail = normEmail;
}
