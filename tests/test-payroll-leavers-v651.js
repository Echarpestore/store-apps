// ============================================================
// 🚪 test-payroll-leavers-v651 — اللي ساب الشغل مايفضلش في الرواتب
//
// الباج: شاشة الرواتب والعمولات كانت بتعرض كل موظفي الفرع، فالمغادر يفضل
// ظاهر كل شهر ومعاه راتب محسوب، مع إن مستحقاته اتحسبت في التصفية.
// الاختبار بيشغّل الدالة الحقيقية من sales-app.js. لو حد رجّع القايمة
// لـreviewEmployeesFor أو شال شرط شهر الخروج، الاختبار يقع.
// ============================================================
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'sales', 'sales-app.js'), 'utf8');
const m = src.match(/function payrollLeaverVisible\(emp, leftAtMs, startMs, endMs, kind, nowMs\)\{[\s\S]*?\n\}/);
assert.ok(m, 'payrollLeaverVisible مش موجودة في sales-app.js');
const visible = new Function(m[0] + '; return payrollLeaverVisible;')();

const D = 86400000, sep = Date.UTC(2026, 8, 1), oct = Date.UTC(2026, 9, 1), nov = Date.UTC(2026, 10, 1), dec = Date.UTC(2026, 11, 1);
const now = oct + 11 * D;                         // 12 أكتوبر
const active = { id:'a', active:true }, leaver = { id:'b', active:false };
const left = sep + 15 * D;                        // خرجت 16 سبتمبر

// الموظف الحالي ظاهر دايمًا
assert.strictEqual(visible(active, 0, oct, nov - 1, 'salary', now), true);
// الراتب: شهر الخروج نفسه (سبتمبر) بتاع التصفية → مايظهرش، وبعده مايظهرش
assert.strictEqual(visible(leaver, left, sep, oct - 1, 'salary', now), false, 'شهر الخروج متغطي بالتصفية');
assert.strictEqual(visible(leaver, left, oct, nov - 1, 'salary', now), false, 'بعد الخروج مايظهرش في الرواتب');
// الراتب: شهر خلص قبل الخروج (أغسطس) لسه ظاهر — ممكن يكون ليها راتب متأخر
assert.strictEqual(visible(leaver, left, Date.UTC(2026, 7, 1), sep - 1, 'salary', now), true);
// العمولات: شهر الخروج لسه ظاهر (العمولة مش في التصفية)، وبعده لأ
assert.strictEqual(visible(leaver, left, sep, oct - 1, 'commission', now), true);
assert.strictEqual(visible(leaver, left, oct, nov - 1, 'commission', now), false);
// موظف متمسوح (deletedAt) من غير تصفية: نفس القاعدة بتاريخ المسح
assert.strictEqual(visible({ id:'c', deletedAt:left }, 0, oct, nov - 1, 'salary', now), false);
// مغادر من غير أي تاريخ: يختفي من الشهر الجاري والجاي، ويفضل في القديم
assert.strictEqual(visible(leaver, 0, oct, nov - 1, 'salary', now), false);
assert.strictEqual(visible(leaver, 0, nov, dec - 1, 'salary', now), false);
assert.strictEqual(visible(leaver, 0, sep, oct - 1, 'salary', now), true);
assert.strictEqual(visible(null, 0, oct, nov - 1, 'salary', now), false);

// القايمتين لازم يستخدموا الفلتر (مش reviewEmployeesFor مباشرة)
assert.ok(/const emps = payrollEmployeesFor\(viewBranch, range, 'salary'\)/.test(src), 'قايمة الرواتب لازم تتفلتر');
assert.ok(/payrollEmployeesFor\(viewBranch, payPeriodRange\(monthLabel\), 'commission'\)/.test(src), 'قايمة العمولات لازم تتفلتر');
console.log('  ✓ payroll leavers: المغادر بيختفي من الرواتب بعد شهر خروجه');
