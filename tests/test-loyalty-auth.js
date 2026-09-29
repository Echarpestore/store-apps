/* test-loyalty-auth.js — اختبارات بحتة لـ functions/loyaltyAuthCore.js
   بتشتغل مع node tests/run.js (assert/assertEq عامّة) أو مستقلة: node tests/test-loyalty-auth.js */
"use strict";
const path = require("path");
const assert = global.assert || function (c, m) { if (!c) throw new Error("ASSERT: " + m); };
const assertEq = global.assertEq || function (a, b, m) { if (a !== b) throw new Error("ASSERT_EQ: " + m + " → " + JSON.stringify(a) + " !== " + JSON.stringify(b)); };
const C = require(path.join(__dirname, "..", "functions", "loyaltyAuthCore.js"));
const N = Date.now();
let n = 0; const t = (name, fn) => { fn(); n++; };

t("normPhone/validPhone", () => {
  assertEq(C.normPhone("+20 (10) 123-4567"), "20101234567", "digits only");
  assert(C.validPhone("01012345678"), "egypt phone ok");
  assert(!C.validPhone("1234567"), "7 digits rejected");
  assert(!C.validPhone("0101234567890123"), "16 digits rejected");
});
t("validPin", () => { assert(C.validPin("1234"), "4 digits"); assert(!C.validPin("123"), "3"); assert(!C.validPin("12a4"), "letters"); assert(!C.validPin(""), "empty"); });
t("brands", () => { assert(C.validBrand("echarpe") && C.validBrand("glow"), "both"); assert(!C.validBrand("office"), "office no"); assert(!C.validBrand("__proto__"), "proto no"); });
t("uid", () => assertEq(C.uidFor("glow", "0100"), "loy_glow_0100", "uid"));

t("hash: same pin same salt = same hash; different salt = different", () => {
  const a = C.hashPin("1234"), b = C.hashPin("1234", a.salt), c = C.hashPin("1234");
  assertEq(a.hash, b.hash, "deterministic"); assert(a.hash !== c.hash, "salted"); assert(a.hash !== "1234", "not plaintext");
});
t("verifyPin: hashed doc", () => {
  const w = C.pinWrite("4321", N);
  assert(C.verifyPin(w, "4321").ok, "correct"); assert(!C.verifyPin(w, "4322").ok, "wrong");
  assertEq(C.verifyPin(w, "4321").migrate, false, "no migrate when hashed");
});
t("verifyPin: legacy plaintext migrates", () => {
  const r = C.verifyPin({ loyaltyPin: "9999" }, "9999");
  assert(r.ok && r.migrate, "legacy ok + migrate");
  assert(!C.verifyPin({ loyaltyPin: "9999" }, "9998").ok, "legacy wrong");
  assert(!C.verifyPin({ loyaltyPin: 9999 }, "9999").migrate === false, "numeric legacy pin accepted");
});
t("verifyPin: hash wins over stale plaintext", () => {
  const w = Object.assign(C.pinWrite("1111", N), { loyaltyPin: "2222" });
  assert(C.verifyPin(w, "1111").ok, "hash pin"); assert(!C.verifyPin(w, "2222").ok, "stale plaintext rejected");
});
t("verifyPin: no pin / bad input", () => {
  assert(C.verifyPin({}, "1234").noPin === true, "noPin flag"); assert(!C.verifyPin({ loyaltyPin: "1234" }, "12").ok, "short pin");
  assert(!C.verifyPin(null, "1234").ok, "null doc");
});
t("hasPin", () => { assert(!C.hasPin({}), "none"); assert(C.hasPin({ loyaltyPin: "1" }), "legacy"); assert(C.hasPin(C.pinWrite("1234", N)), "hashed"); assert(!C.hasPin({ loyaltyPin: "" }), "empty string"); });

t("lock: 5 fails → locked 15 min, then free", () => {
  let att = {};
  for (let i = 0; i < 4; i++) { att = C.nextAttempt(att, false, N + i); assert(!C.attemptState(att, N + i).locked, "not locked at " + (i + 1)); }
  att = C.nextAttempt(att, false, N + 4);
  assert(C.attemptState(att, N + 5).locked, "locked after 5");
  assert(C.attemptState(att, N + 5).retryAfterSec > 0 && C.attemptState(att, N + 5).retryAfterSec <= 900, "retry seconds");
  assert(!C.attemptState(att, N + 4 + C.LOCK_MIN * 60000 + 1).locked, "free after lock");
});
t("lock: success resets counter", () => {
  let att = C.nextAttempt({}, false, N); att = C.nextAttempt(att, false, N); att = C.nextAttempt(att, true, N);
  assertEq(att.fails, 0, "reset"); assertEq(att.lockedUntil, 0, "no lock");
});
t("lock: window expiry resets fails", () => {
  let att = {}; for (let i = 0; i < 4; i++) att = C.nextAttempt(att, false, N);
  att = C.nextAttempt(att, false, N + C.WINDOW_MIN * 60000 + 1);
  assertEq(att.fails, 1, "old fails forgotten"); assert(!C.attemptState(att, N + C.WINDOW_MIN * 60000 + 2).locked, "not locked");
});
t("lock: ip threshold is larger", () => {
  let ip = {}; for (let i = 0; i < 39; i++) ip = C.nextAttempt(ip, false, N, C.IP_MAX_FAILS);
  assert(!C.attemptState(ip, N).locked, "39 ok"); ip = C.nextAttempt(ip, false, N, C.IP_MAX_FAILS); assert(C.attemptState(ip, N).locked, "40 locks");
});

t("genCode per brand", () => { assert(/^ECH\d{8}$/.test(C.genCode("echarpe")), "ECH"); assert(/^GLW\d{8}$/.test(C.genCode("glow")), "GLW"); });
t("registerDoc echarpe", () => {
  const d = C.registerDoc({ phone: "0100", name: "  منى ", pin: "1234", brand: "echarpe", source: "loyalty_app:qr", lang: "ar", code: "ECH00000001", now: N });
  assertEq(d.name, "منى", "trim"); assertEq(d.loyaltyCode, "ECH00000001", "code field"); assert(!("loyaltyCode_glow" in d), "no glow code");
  assertEq(d.points, 0, "points"); assert(d.loyaltyPinHash && d.loyaltyPinSalt, "hashed"); assertEq(d.deleted, false, "not deleted");
  assert(!("credit" in d), "never writes credit");
});
t("registerDoc glow uses loyaltyCode_glow", () => {
  const d = C.registerDoc({ phone: "0100", name: "x", pin: "1234", brand: "glow", code: "GLW1", now: N });
  assertEq(d.loyaltyCode_glow, "GLW1", "glow code"); assertEq(d.source, "glow_app", "default source"); assertEq(d.lang, "ar", "default lang");
});
t("reactivateDoc keeps money untouched", () => {
  const d = C.reactivateDoc({ name: "n", pin: "1234", brand: "echarpe", code: "ECH2", now: N });
  assert(!("points" in d) && !("credit" in d) && !("totalSpent" in d), "no money fields"); assertEq(d.deleted, false, "undeleted"); assertEq(d.deletedAt, null, "cleared");
});

t("deletionPlan wipes personal data, keeps credit, forfeits points", () => {
  const DEL = "__DELETE__";
  const doc = { name: "منى", phone: "0100", notes: "vip", points: 120, credit: 50, credit_glow: 10, loyaltyPin: "1234", loyaltyPinHash: "h", loyaltyPinSalt: "s",
    fcmTokens_echarpe: ["a"], fcmTokens_glow: ["b"], pendingRedeem: {}, activatedOffers: [], loyaltyCode: "ECH1", loyaltyCode_glow: "GLW1", totalSpent: 900, branch: "rehab" };
  const { update, audit } = C.deletionPlan(doc, { brand: "glow", phone: "0100", now: N, FieldDelete: DEL });
  assertEq(update.deleted, true, "flag"); assertEq(update.name, "عميلة محذوفة", "name anonymized"); assertEq(update.points, 0, "points zeroed"); assertEq(update.pointsAtDeletion, 120, "audit points");
  for (const f of ["notes", "loyaltyPin", "loyaltyPinHash", "loyaltyPinSalt", "fcmTokens_echarpe", "fcmTokens_glow", "pendingRedeem", "activatedOffers", "loyaltyCode", "loyaltyCode_glow"]) assertEq(update[f], DEL, "deleted " + f);
  assert(!("credit" in update) && !("credit_glow" in update), "credit untouched"); assert(!("totalSpent" in update) && !("branch" in update), "accounting untouched");
  assertEq(audit.creditLeft.credit, 50, "audit credit"); assertEq(audit.creditLeft.credit_glow, 10, "audit credit glow"); assertEq(audit.brand, "glow", "brand");
});
t("deletionPlan: missing fields are not sent as delete (no-op merge safety)", () => {
  const { update } = C.deletionPlan({ name: "x" }, { brand: "echarpe", phone: "1", now: N, FieldDelete: "D" });
  assert(!("fcmTokens_glow" in update), "absent field not touched");
});
/* اختبار سلبي: لو حد رجّع المقارنة النصية بس (شال الهاش) لازم يقع */
t("negative: pinWrite must never store only plaintext", () => {
  const w = C.pinWrite("1234", N); assert(w.loyaltyPinHash && w.loyaltyPinHash.length === 64 && w.loyaltyPinSalt, "hash present");
});
console.log("test-loyalty-auth: " + n + " passed");
