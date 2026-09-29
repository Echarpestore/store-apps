/* test-loyalty-auth-client.js — اختبار هيكلي لـ loyalty/index.html و glow/index.html
   يتأكد إن الرقم السري مبيتقارنش في المتصفح ولا بيتكتب من العميل، وإن الدخول بيمر بالسيرفر.
   سلبي: لو رجّعت النسخة القديمة (أو شلت أي hook) الاختبار بيقع. */
"use strict";
const fs = require("fs"), path = require("path");
const assert = global.assert || function (c, m) { if (!c) throw new Error("ASSERT: " + m); };
const ROOT = path.join(__dirname, "..");
function block(s, start) { const i = s.indexOf(start); if (i < 0) throw new Error("missing " + start); const j = s.indexOf("\n}\n", i); return s.slice(i, j + 3); }
let n = 0;
for (const [file, brand, code] of [["loyalty/index.html", "echarpe", "loyaltyCode"], ["glow/index.html", "glow", "loyaltyCode_glow"]]) {
  const s = fs.readFileSync(path.join(ROOT, file), "utf8");
  const T = (m) => file + ": " + m;
  assert(s.includes("LOYALTY-AUTH-v1"), T("marker"));
  assert(s.includes("var LOYALTY_BRAND = '" + brand + "';"), T("brand const"));
  assert(!s.includes("pinToMatch = String(d.loyaltyPin)"), T("no client PIN read"));
  assert(!s.includes("if(pin !== pinToMatch)"), T("no client PIN compare"));
  assert(!/loyaltyPin:\s*pin/.test(s), T("client never writes loyaltyPin"));
  const enter = block(s, "function stepEnterPin(){");
  assert(enter.includes("action:'login'") && enter.includes("loyaltySignIn(r.token)"), T("login via server + custom token"));
  const phone = block(s, "function stepPhone(){");
  assert(phone.includes("action:'lookup'") && !phone.includes("collection(COL_CUSTOMERS)"), T("lookup via server, no doc read before login"));
  const setpin = block(s, "function stepSetPin(){");
  assert(setpin.includes("action:'set_pin'") && !setpin.includes("collection(COL_CUSTOMERS)"), T("set_pin via server"));
  const reg = block(s, "function createCustomer(phone, name, pin){");
  assert(reg.includes("action:'register'") && !reg.includes("collection(COL_CUSTOMERS)") && reg.includes("'" + (brand === "glow" ? "glow" : "loyalty") + "_app'"), T("register via server"));
  const ens = block(s, "function ensureLoyaltyCode(phone){");
  assert(ens.includes("action:'ensure_code'") && !ens.includes(".where(") && ens.includes("currentCustomer." + code), T("ensure_code via server"));
  assert(s.includes("if(!_authRestored || fbAuth.currentUser || _anonPending) return;"), T("anon waits for restored session"));
  assert(!/\nensureAnonAuth\(\);\ntry\{ fbAuth\.onAuthStateChanged/.test(s), T("no immediate anon sign-in"));
  assert(s.includes("loyaltySessionFor(saved).then("), T("session restore checks claims"));
  const lo = block(s, "function logout(silent){");
  assert(lo.includes("fbAuth.signOut()"), T("logout signs out firebase session"));
  const acc = block(s, "function renderAccount(){");
  assert(acc.includes('onclick="openDeleteAccount()"') && acc.includes('onclick="openChangePin()"'), T("account has delete + change pin"));
  assert(block(s, "function openDeleteAccount(){").includes("action:'delete_account'"), T("delete calls server"));
  assert(s.includes("httpsCallable('loyaltyAuth')"), T("callable name"));
  n++;
}
console.log("test-loyalty-auth-client: " + n + " files OK");
