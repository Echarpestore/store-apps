'use strict';
// v661 — سجل أيام الموظف: زرار «🕐 عدّل وقت الانصراف» للمالك (مشيت 6 ورجعت داست حضور 7:30 فاتسجل انصراف)
const assert = require('assert'), fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname,'..','sales','sales-app.js'),'utf8');
const html = fs.readFileSync(path.join(__dirname,'..','sales','index.html'),'utf8');
let n=0; const ok=(c,m)=>{ assert.ok(c,m); n++; console.log('  ✅ '+m); };
ok(/sales-app\.js\?v=(66[1-9]|6[7-9]\d|[7-9]\d\d)/.test(html), 'sales بيحمّل النسخة الجديدة');
ok(/class="erFixOut"/.test(src) && /عدّل وقت الانصراف/.test(src), 'اليوم المفتوح في السجل فيه زرار تعديل وقت الانصراف');
ok(/querySelectorAll\('\.erFixOut'\)[\s\S]{0,120}await ownerCloseShift\(b\.dataset\.id\)/.test(src), 'الزرار بيستخدم نفس «حدّد ساعة المشي» بتاعة المالك');
ok(/prevClockOutTs: sh\.clockOutTs/.test(src), 'الوقت القديم بيتحفظ (prevClockOutTs) للمراجعة');
ok(/return true;\s*\}catch\(e\)\{ alert\('تعذر الحفظ: ' \+ \(e && e\.message \? e\.message : e\)\); return false; \}/.test(src), 'سلبي: فشل الحفظ → false ومفيش «اتعدّل»');
const fn = src.match(/async function ownerCloseShift\(shiftId\)\{[\s\S]*?\n\}/)[0];
ok(/if\(v === null\) return;/.test(fn) && /maxShiftMin/.test(fn), 'سلبي: إلغاء أو وقت أطول من 14 س = مفيش كتابة');
console.log('fix clock-out v661: '+n+' PASS');
