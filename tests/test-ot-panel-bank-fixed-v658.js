#!/usr/bin/env node
// v658 — لوحة الموافقات: الشيفت المنسي اللي السيستم قفله تلقائي (bankAutoEnd) مبيظهرش للمراجعة + زرار «اقفل المنسيين كلهم»
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const ok = (c, m)=>{ if(c){ pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
const src = fs.readFileSync(path.join(ROOT,'sales','sales-app.js'),'utf8');
const html = fs.readFileSync(path.join(ROOT,'sales','index.html'),'utf8');
ok(/sales-app\.js\?v=(65[8-9]|6[6-9]\d|[7-9]\d\d)/.test(html), 'sales بيحمّل النسخة الجديدة');
const fn = src.match(/function overtimeReviewInfo\(s, cfg\)\{[\s\S]*?\n\}/)[0];
const ctx = { timeCfgDefaults:{}, window:undefined, Number, Math }; vm.runInNewContext(fn + '; this.f = overtimeReviewInfo;', ctx);
const IN = Date.parse('2026-11-05T08:00:00Z');
ok(ctx.f({ bankAutoEnd:true, forgotClockOut:true, autoClosedAt1:true, clockInTs:IN, clockOutTs:IN+8*3600e3, overtimeMinutes:0 }, {}).needsReview === false, 'اتقفل تلقائي على ميعاده → مش محتاج مراجعة (حتى لو كان اتقفل 1ص قبلها)');
ok(ctx.f({ forgotClockOut:true, clockInTs:IN, clockOutTs:IN+15*3600e3, overtimeMinutes:400 }, {}).needsReview === true, 'سلبي: منسي ومااتحسمش → لسه مراجعة');
ok(ctx.f({ autoClosedAt1:true, needsClockOutReview:true, clockInTs:IN, clockOutTs:IN+17*3600e3, overtimeMinutes:500 }, {}).needsReview === true, 'سلبي: اتقفل 1ص ومااتحسمش → مراجعة');
ok(ctx.f({ clockInTs:IN, clockOutTs:IN+(8*60+15+60)*60000, shiftMinutes:8*60+15+60, overtimeMinutes:60 }, { autoOvertimeMaxMin:120 }).needsReview === false, 'الموظف سجّل انصراف بنفسه وأوفرتايم ساعة → بيتعتمد لوحده (زي ما هو)');
ok(/\.filter\(sh=> sh && !sh\.voided && !sh\.bankAutoEnd\)/.test(src), 'اللوحة بتشيل الشيفتات المحسومة تلقائي والملغية');
ok(/id="otBulkClose"/.test(src) && /bankFinalizeForgotten\(\{ force:true, ids: needTime\.map/.test(src), 'زرار «⚡ اقفل المنسيين كلهم» بيقفلهم بنفس القاعدة');
ok(/async function bankFinalizeForgotten\(opt\)/.test(src) && /if\(!opt\.force && !/.test(src), 'force بيتخطى شرط تاريخ تشغيل الرصيد للزرار بس');
ok(/overtimeMinutes: 0, overtimeApprovedMin: 0, overtimeDecision: 'none'/.test(src), 'سلبي: القفل التلقائي مبيدّيش أوفرتايم');
ok(/bankAutoBy: 'owner_bulk'/.test(src), 'بيتسجّل إن المالك هو اللي قفل بالجملة');
console.log(`\n${fail ? '❌' : '✅'} ot panel bank-fixed v658: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
