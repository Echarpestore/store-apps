#!/usr/bin/env node
// v657 — كارت الموظف: حافز الأسبوع = النتيجة بس (X / 100). مفيش تفاصيل الحساب ولا الشروط ولا الاعتماد.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const ok = (c, m)=>{ if(c){ pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
const src = fs.readFileSync(path.join(ROOT,'sales','sales-app.js'),'utf8');
const html = fs.readFileSync(path.join(ROOT,'sales','index.html'),'utf8');
const m = src.match(/const bonus = `<div class="raceBlock">[\s\S]*?`;/); const blk = m ? m[0] : '';
ok(/sales-app\.js\?v=(65[7-9]|6[6-9]\d|[7-9]\d\d)/.test(html), 'sales بيحمّل النسخة الجديدة');
ok(blk.includes('🎁 حافز الأسبوع ده') && blk.includes('${b.score} / 100') && blk.includes('يوم ${_dayN} من 7'), 'الكارت بيعرض العنوان والنتيجة واليوم');
['الالتزام','تقييم العملاء','المبيعات','= الحافز الكامل','يوم الجمعة','بيعتمده المالك','هيوصلك','part(','${next}'].forEach(w=>
  ok(!blk.includes(w), 'سلبي: مفيش «' + w + '» في كارت الموظف'));
ok(!/const part = \(k, lbl\)|const next = b\.score/.test(src), 'سلبي: helpers التفاصيل اتشالت');
console.log(`\n${fail ? '❌' : '✅'} bonus card minimal v657: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
