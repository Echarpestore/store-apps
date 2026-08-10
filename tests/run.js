#!/usr/bin/env node
// ============================================================
// run.js — مشغّل الاختبارات: node tests/run.js
// بيلاقي كل ملفات test-*.js ويشغّلها بالترتيب ويطبع ملخص
// ============================================================
'use strict';
// 🕒 كل حسابات الوقت في التطبيق مثبّتة على القاهرة، وأجهزة الفروع في مصر.
//    الهارنس لازم يشتغل على نفس التوقيت وإلا نتايج الاختبارات تتغيّر حسب
//    ساعة الجهاز اللي بيشغّلها (المالك بيشغّلها من بره مصر أحيانًا).
//    ⚠️ test-timezone.js بيغيّر TZ عمدًا جوه نفسه وبيرجّعه — ده مقصود.
process.env.TZ = process.env.TZ || 'Africa/Cairo';
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname).filter(f=>/^test-.*\.js$/.test(f)).sort();
let pass=0, fail=0; const failures=[];

global.assert = function(cond, msg){
  if(cond){ pass++; }
  else { fail++; failures.push(msg); console.error('  ❌', msg); }
};
global.assertEq = function(actual, expected, msg){
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if(ok){ pass++; }
  else { fail++; const m = `${msg} — expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`; failures.push(m); console.error('  ❌', m); }
};

console.log(`🧪 تشغيل ${files.length} ملف اختبار...\n`);
for(const f of files){
  const before = fail;
  console.log('▶ ' + f);
  try { require(path.join(__dirname, f)); }
  catch(e){ fail++; failures.push(`${f} crashed: ${e.message}`); console.error('  💥 crash:', e.message); }
  console.log(before===fail ? '  ✅ تمام\n' : '  ⚠️ فيه فشل فوق\n');
}
console.log('===============================');
console.log(`النتيجة: ${pass} ناجح · ${fail} فاشل`);
if(fail){ console.log('الفشل:'); failures.forEach(m=>console.log(' -', m)); process.exit(1); }
process.exit(0); // أي مؤقتات باقية متمنعش الخروج
