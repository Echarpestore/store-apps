/* 🧪 v623 — القرايات: تطبيق الحضور مايحمّلش تاريخ 190 يوم كامل مع كل فتحة
   (بلاغ 24-09: 13M قراية/يوم). الشرط: سجلات جديدة اتكتبت والتطبيق مقفول ← **مفيش** تحميل كامل
   (بتيجي من لستنر آخر يومين) · سجل قديم ناقص فعلًا من الكاش ← تحميل كامل زي الأول. */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'sales', 'sales-app.js'), 'utf8');
let P = 0, F = 0;
const ok = (c, m) => { if(c){ P++; console.log('  ✅ ' + m); } else { F++; console.log('  ❌ ' + m); } };
function extractFn(header){
  const at = src.indexOf(header); if(at < 0) throw new Error('مش لاقي ' + header);
  let i = src.indexOf('{', at), d = 0;
  for(; i < src.length; i++){ if(src[i] === '{') d++; else if(src[i] === '}'){ d--; if(d === 0) break; } }
  return src.slice(at, i + 1);
}
const DAY = 86400000, NOW = Date.now(), START = NOW - 190 * DAY;
function run(serverDocs, cacheDocs){
  const calls = { full: 0, counts: [] };
  const col = { name: 'sales_points' };
  const where = (f, op, v) => ({ f, op, v });
  const query = (c, ...w) => ({ c, w });
  const match = (q, d) => q.w.every(x => x.op === '>=' ? d.ts >= x.v : x.op === '<' ? d.ts < x.v : true);
  const snap = (docs) => ({ empty: !docs.length, size: docs.length, docs: docs.map(d => ({ id: d.id, data: () => d })) });
  const env = {
    _salesInitialAuthReady: Promise.resolve(), _lf431Authed: () => true, _lf431Pending: new Map(),
    lf431Report(){}, lf431Mark(){}, lf431Last: () => NOW, lf431Merge: (a, b) => b, lf431Docs: (s) => s.docs.map(d => d.data()),
    getDocsFromCache: async (q) => snap(cacheDocs.filter(d => match(q, d))),
    getDocsFromServer: async (q) => { calls.full++; return snap(serverDocs.filter(d => match(q, d))); },
    getDocs: async (q) => snap(serverDocs.filter(d => match(q, d))),
    getCountFromServer: async (q) => { const n = serverDocs.filter(d => match(q, d)).length; calls.counts.push(n); return { data: () => ({ count: n }) }; },
    query, where, onSnapshot: () => () => {}, LF431_RECENT_MS: 2 * DAY, console: { warn(){} }
  };
  const code = 'const _lf431Meta = new WeakMap();\n' + extractFn('function _lf431ToMs(') + '\n' + extractFn('function lf431History(')
    + '\nconst q = query(col, where("ts", ">=", START)); _lf431Meta.set(q, { col, field: "ts", start: START });'
    + '\nlf431History("points190", q, query(col, where("ts", ">=", Date.now() - LF431_RECENT_MS)), () => [], () => {});';
  const names = Object.keys(env);
  new Function('col', 'START', ...names, code)(col, START, ...names.map(n => env[n]));
  return new Promise(r => setTimeout(() => r(calls), 30));
}
const old = Array.from({ length: 500 }, (_, i) => ({ id: 'o' + i, ts: START + (i + 1) * 3600000 }));   // قديم
const fresh = Array.from({ length: 40 }, (_, i) => ({ id: 'n' + i, ts: NOW - (i + 1) * 60000 }));      // آخر ساعة

(async () => {
  console.log('\n💸 v623 — فحص الاكتمال');
  let c = await run(old.concat(fresh), old);
  ok(c.full === 0, '🔴 40 سجل جديد اتكتبوا والتطبيق مقفول ← مفيش تحميل 190 يوم (كان: تحميل كامل مع كل فتحة)');
  ok(c.counts.length === 1 && c.counts[0] === 500, 'العدّ على السيرفر للجزء القديم بس (' + c.counts + ')');
  c = await run(old.concat(fresh), old.slice(1));
  ok(c.full === 1, '🔴 سجل قديم ناقص فعلًا من الكاش ← تحميل كامل زي الأول');
  c = await run(old, old);
  ok(c.full === 0, 'كاش كامل ← صفر تحميل');
  ok(/const _scoped = \(col, field\)=>\{[^}]*_lf431Meta\.set/.test(src) && /const _scopedDays = [^;]*\{[^}]*_lf431Meta\.set/.test(src), 'نوافذ المجموعات بتسجّل الحقل (من غيره الفحص بيرجع للعد الكامل)');
  ok(/if\(\(Date\.now\(\)-lf431Last\(name\)\)>=ttlMs\)\{\s*runServerFetch\(false\);/.test(src), 'التحديث الكامل كل 24 ساعة زي ما هو (تعديلات السجلات القديمة)');
  console.log(`\nالنتيجة: ${P} ناجح · ${F} فاشل`);
  if(typeof assert === 'function') assert(F === 0, 'test-sales-reads-v623: ' + F);
  else if(F) process.exitCode = 1;
})();
