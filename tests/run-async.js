#!/usr/bin/env node
// ============================================================
// run-async.js — الاختبارات اللي `run.js` **مبيشوفش فشلها**
// `run.js` بيعمل require للملف ويعدّ الـassert المتزامن. الملفات اللي جوّاها `(async function(){…})()` بتخلص بعد ما run.js
// يكون عدّى — فلو فحص جوّاها وقع، run.js بيقول «تمام». اتكشف 21-09: `test-tender` و`test-credit-brand-split` كانوا
// واقعين (بسبب شغل كود الرصيد) والسويت بيقول صفر فشل جديد. الملف ده بيشغّل كل ملف async لوحده وبيبص على كود الخروج.
//   node tests/run-async.js
// ============================================================
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const DIR = __dirname;
const retired = new Set(fs.existsSync(path.join(DIR, '_retired')) ? fs.readdirSync(path.join(DIR, '_retired')) : []);
const files = fs.readdirSync(DIR).filter(f => /^test-.*\.js$/.test(f) && !retired.has(f))
  .filter(f => /\(async\b/.test(fs.readFileSync(path.join(DIR, f), 'utf8'))).sort();
let ok = 0; const bad = [], skipped = [];
files.forEach(f => {
  const r = spawnSync(process.execPath, [path.join(DIR, f)], { cwd: path.join(DIR, '..'), encoding: 'utf8', timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || '');
  if(/assert is not defined/.test(out)){ skipped.push(f + ' (محتاج run.js)'); return; }                 // بيتغطّى في run.js
  if(/ENOENT[^\n]*(branch-tools\/|INSTALL-AUTOSTART\.ps1)/.test(out)){ skipped.push(f + ' (ملف فرع)'); return; }
  if(r.status === 0 && !/^\s*❌ /m.test(out.replace(/^\s*❌ test-[^\n]*$/gm, ''))) { ok++; return; }
  bad.push(f + ' → ' + ((out.match(/^\s*(❌[^\n]*|💥[^\n]*|Error:[^\n]*)/m) || [,''])[1] || ('exit ' + r.status)).slice(0, 130));
});
console.log('\n=== run-async: ' + ok + ' ملف تمام · ' + bad.length + ' واقع · ' + skipped.length + ' متخطّى ===');
bad.forEach(b => console.log('  ❌ ' + b));
if(bad.length) process.exitCode = 1;
