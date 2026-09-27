/* 🧪 v745 — «عميلة سجّلت نفسها على التابلت» اتسجلت مرتين في Office (بلاغ 27-09) */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pos', 'pos-sale.js'), 'utf8');
let P = 0, F = 0;
const ok = (c, m) => { if (c) { P++; console.log('  ✅ ' + m); } else { F++; console.log('  ❌ ' + m); } };
function extractFn(h){ const at = src.indexOf(h); if (at < 0) throw new Error(h); let i = src.indexOf('{', at), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) break; } } return src.slice(at, i + 1); }
(async () => {
  const code = 'const _capRegInFlight = new Set();\n' + extractFn('async function capAutoRegister(') + '\n' + extractFn('async function _capAutoRegisterCore(') + '\nreturn capAutoRegister;';
  const logs = []; const store = new Set();
  const db = { collection: () => ({ doc: (id) => ({
    get: async () => { await new Promise((r) => setTimeout(r, 5)); return { exists: store.has(id) }; },
    set: async () => { await new Promise((r) => setTimeout(r, 5)); store.add(id); } }) }) };
  const reg = new Function('db', 'TEST_CUSTOMERS', 'normalizePhone', 'phoneRejectReason', 'firebase', 'currentBranch', '_logActivity', 'document', 'window', 'refreshCustomerInfo', 'console', 'setTimeout', code)(
    db, 'c', (x) => x, () => '', { firestore: { FieldValue: { serverTimestamp: () => 0 } } }, 'Glow', (t) => logs.push(t),
    { getElementById: () => null }, {}, () => {}, { warn(){} }, setTimeout);
  const [a, b] = await Promise.all([reg('01001234567', 'Mayar'), reg('01001234567', 'Mayar')]);
  ok(a === true && b === true, 'النداءين رجعوا «اتسجلت»');
  ok(logs.filter((t) => t === 'customer_self_registered').length === 1, '🔴 ردّين في نفس اللحظة = سطر واحد في Office (كان 2)');
  const lst = src.slice(src.indexOf('if(!_capFresh(data)) return;'), src.indexOf("if(data.mode === 'phone'){"));
  ok(/if\(_capHandledKey === _hk\) return;\s*_capHandledKey = _hk;/.test(lst) && !/await/.test(lst.replace(/\/\/.*$/gm, '')), '🔴 قفل الرد المكرر قبل أي await في مستمع التابلت');
  console.log(`\nالنتيجة: ${P} ناجح · ${F} فاشل`);
  if (typeof assert === 'function') assert(F === 0, 'test-cap-dedupe-v745: ' + F); else if (F) process.exitCode = 1;
})();
