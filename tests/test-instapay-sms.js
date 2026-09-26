/* 🧪 مطابقة إنستاباي برسايل CIB — على رسايل حقيقية من موبايل المالك (26-09). */
'use strict';
const fs = require('fs'), path = require('path');
const C = require('../functions/instapaySmsCore');
let P = 0, F = 0;
const ok = (c, m) => { if (c) { P++; console.log('  ✅ ' + m); } else { F++; console.log('  ❌ ' + m); } };
const IN1 = 'يرجى العلم انه تم تنفيذ تحويل لحظي بمبلغ 755.00 جم إلى حسابك المنتهي بـ ********6818 من HEBA MAHMOUD AHMED MAHM برقم مرجعي 034e738a بتاريخ 2026-09-25 23:38 للمزيد، برجاء الاتصال بـ 19666';
const IN2 = 'يرجى العلم انه تم تنفيذ تحويل لحظي بمبلغ 50.00 جم إلى حسابك المنتهي بـ ********6818 من HEBA MAHMOUD AHMED MAHM برقم مرجعي a5facde0 بتاريخ 2026-09-25 23:39 للمزيد، برجاء الاتصال بـ 19666';
const OUT = 'يرجى العلم انه تم تنفيذ تحويل لحظي بمبلغ 1000.00 جم من حسابك المنتهي بـ ********6818 برقم مرجعي cb3fc216 بتاريخ 2026-09-25 23:57 للمزيد، برجاء الاتصال بـ 19666';
const AR = 'يرجى العلم انه تم تنفيذ تحويل لحظي بمبلغ 1850.00 جم إلى حسابك المنتهي بـ ********6818 من عمرو عيد سلامه محمد عبد برقم مرجعي 933831ec بتاريخ 2026-09-26 00:26 للمزيد، برجاء الاتصال بـ 19666';

console.log('\n📩 قراءة الرسالة');
const a = C.parseCibSms(IN1);
ok(a && a.direction === 'in' && a.amountCents === 75500 && a.last4 === '6818' && a.ref === '034e738a' && a.fromName === 'HEBA MAHMOUD AHMED MAHM', 'وارد: المبلغ بالقروش + آخر 4 + المرجع + اسم المحوّل');
ok(new Date(a.at).toISOString() === '2026-09-25T20:38:00.000Z', 'الوقت بتوقيت القاهرة (23:38 = 20:38 UTC)');
const o = C.parseCibSms(OUT);
ok(o && o.direction === 'out' && o.amountCents === 100000 && o.fromName === '', '🔴 صادر (من حسابك) بيتعرف إنه صادر — عمره ما يأكد طلب');
const ar = C.parseCibSms(AR);
ok(ar && ar.fromName === 'عمرو عيد سلامه محمد عبد' && ar.amountCents === 185000, 'اسم عربي');
ok(C.parseCibSms('كود التحقق 123456') === null && C.parseCibSms('') === null, 'رسايل تانية بتتجاهل');
ok(C.parseCibSms(IN1.replace('755.00', '٧٥٥٫٠٠'.replace('٫', '.'))).amountCents === 75500, 'أرقام عربي');

console.log('\n🔗 المطابقة');
const T = a.at;
const sess = (sid, cents, dtMin, ocr) => ({ sid, amountCents: cents, approvedAt: T + dtMin * 60000, ocrText: ocr || '' });
ok(C.matchSms(a, [sess('s1', 75500, -3)])?.sid === 's1', 'نفس المبلغ ووقت قريب = اتأكد');
ok(C.matchSms(a, [sess('s1', 75000, -3)]) === null, '🔴 مبلغ مختلف (ولو 5 جنيه) = مفيش تأكيد');
ok(C.matchSms(a, [sess('s1', 75500, -120)]) === null, '🔴 طلب من ساعتين = مش بتاعه');
ok(C.matchSms(o, [sess('s1', 100000, -1)]) === null, '🔴 رسالة صادر عمرها ما تأكد طلب');
const two = [sess('s1', 75500, -4, 'MOHAMED REDA MORSY YOUNES elsamarkady@instapay'), sess('s2', 75500, -2, 'من HEBA MAHMOUD AHMED MAHMOUD heba@instapay')];
ok(C.matchSms(a, two)?.sid === 's2', '🔴 طلبين بنفس المبلغ: اسم المحوّل في الإيصال بيحدد (حتى لو آخر اسم مقصوص «MAHM»)');
const amb = [sess('s1', 75500, -4, 'X'), sess('s2', 75500, -2, 'Y')];
ok(Array.isArray(C.matchSms(a, amb)?.ambiguous), '🔴 طلبين بنفس المبلغ ومفيش اسم يفرّق = «محتاج مراجعة» مش تخمين');
const sa = (sid, ocr) => ({ sid, amountCents: 185000, approvedAt: ar.at - 60000, ocrText: ocr });
ok(C.matchSms(ar, [sa('x', 'from: عَمرو عيد سلامة محمد'), sa('y', 'أحمد علي')])?.sid === 'x', 'اسم عربي بتشكيل وة/ه بيتطابق');

console.log('\n🔐 الدالة');
const fn = fs.readFileSync(path.join(__dirname, '..', 'functions', 'instapaySms.js'), 'utf8');
ok(/defineSecret\('INSTAPAY_SMS_KEY'\)/.test(fn) && /timingSafeEqual/.test(fn), 'مفتاح سري من Secret Manager ومقارنة آمنة');
ok(/if \(\(await tx\.get\(ref\)\)\.exists\) return false;/.test(fn) && /tx\.create\(ref,/.test(fn), 'نفس الرسالة مرتين = مرة واحدة');
ok(/if \(!s \|\| s\.bankState === CONFIRMED\) return false;/.test(fn), 'طلب اتأكد مبيتأكدش تاني برسالة تانية');
ok(!/where\([^)]*\)\.where\(/.test(fn), 'كل الاستعلامات بحقل واحد (من غير index مركّب)');

console.log(`\nالنتيجة: ${P} ناجح · ${F} فاشل`);
if (typeof assert === 'function') assert(F === 0, 'test-instapay-sms: ' + F);
else if (F) process.exitCode = 1;
