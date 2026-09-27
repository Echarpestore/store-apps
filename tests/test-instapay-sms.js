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
{
  const bidi = IN1.replace('بمبلغ ', 'بمبلغ \u200F').replace('755.00', '\u202A755.00\u202C').replace('بـ ', 'بـ\u00A0').replace('6818', '\u200E6818');
  const pb = C.parseCibSms(bidi);
  ok(pb && pb.amountCents === 75500 && pb.last4 === '6818' && pb.direction === 'in', '🔴 علامات الاتجاه المخفية بتاعة الآيفون مبتبوّظش القراية');
  ok(C.parseCibSms(IN1.replace('755.00', '٧٥٥٫٠٠'))?.amountCents === 75500, 'فاصلة عشرية عربي (٫)');
}
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

console.log('\n🏦 من غير تصوير (طلب لسه مفتوح)');
const op = (sid, cents, dtMin, extra) => Object.assign({ sid, amountCents: cents, startedAt: T + dtMin * 60000, expiresAt: T + (dtMin + 20) * 60000 }, extra || {});
ok(C.matchOpen(a, [op('o1', 75500, -3)], [])?.sid === 'o1', 'طلب مفتوح واحد بنفس المبلغ = يتأكد من البنك');
ok(Array.isArray(C.matchOpen(a, [op('o1', 75500, -3), op('o2', 75500, -1)], [])?.ambiguous), '🔴 طلبين مفتوحين بنفس المبلغ = مفيش تخمين (يرجع للتصوير)');
ok(Array.isArray(C.matchOpen(a, [op('o1', 75500, -3)], [{ amountCents: 75500, approvedAt: T - 60000 }])?.ambiguous), '🔴 فيه طلب تاني بنفس المبلغ اتقبل ومستني البنك = مفيش تخمين');
ok(C.matchOpen(a, [op('o1', 75500, -3, { bankLast4: '1234' })], []) === null, '🔴 حساب الفرع غير الحساب اللي وصله التحويل = لأ');
ok(C.matchOpen(a, [op('o1', 75500, -3, { bankLast4: '6818' })], [])?.sid === 'o1', 'حساب الفرع = نفس الحساب = أيوه');
ok(C.matchOpen(a, [op('o1', 75500, 5)], []) === null, '🔴 طلب اتفتح بعد التحويل = مش بتاعه');
ok(C.matchOpen(a, [op('o1', 75500, -40)], []) === null, '🔴 طلب قديم = مش بتاعه');
ok(C.matchOpen(a, [op('o1', 75500, -3)], [], { maxAgeMin: 4 })?.sid === 'o1', '⏱️ التحويل وصل بعد 3 دقايق من الطلب = يتأكد');
ok(C.matchOpen(a, [op('o1', 75500, -5)], [], { maxAgeMin: 4 }) === null, '🔴 ⏱️ بعد 5 دقايق = مش من البنك (العميلة تصوّر الإيصال)');
ok(/const BANK_FIRST_MAX_MIN = 4;/.test(fs.readFileSync(path.join(__dirname, '..', 'functions', 'instapaySms.js'), 'utf8')) && /matchOpen\(sms, open, busy, \{ maxAgeMin: BANK_FIRST_MAX_MIN \}\)/.test(fs.readFileSync(path.join(__dirname, '..', 'functions', 'instapaySms.js'), 'utf8')), 'الدالة مربوطة بحد الـ4 دقايق');
ok(C.matchOpen(a, [op('o1', 75500, -30, { expiresAt: T - 60000 })], []) === null, '🔴 طلب منتهي = لأ');
ok(C.matchOpen(a, [op('o1', 75400, -3)], []) === null && C.matchOpen(o, [op('o1', 100000, -1)], []) === null, '🔴 مبلغ مختلف بجنيه · رسالة صادر = لأ');

console.log('\n🔢 بصمة عند التصادم بس');
const fp = (sid, pay, req, dtMin) => ({ sid, amountCents: pay, requestedCents: req, startedAt: T + dtMin * 60000, expiresAt: T + (dtMin + 20) * 60000 });
const inAmt = (cents) => Object.assign({}, a, { amountCents: cents });
ok(C.matchOpen(inAmt(75500), [fp('f1', 75500, 75500, -2), fp('f2', 75437, 75500, -1)], [])?.ambiguous, '🔴 طلب بـ755 بالظبط + طلب تاني خد 754.37 · وصل 755 = مفيش تخمين (يمكن التانية حوّلت الكامل)');
ok(C.matchOpen(inAmt(75437), [fp('f1', 75500, 75500, -2), fp('f2', 75437, 75500, -1)], [])?.sid === 'f2', 'وصل 754.37 = الطلب اللي خد البصمة بالظبط');
ok(C.matchOpen(inAmt(75500), [fp('f2', 75437, 75500, -1)], [])?.sid === 'f2', 'طلب واحد خد بصمة والعميلة حوّلت الكامل = يتأكد');
ok(C.matchSms(inAmt(75500), [{ sid: 'x', amountCents: 75437, requestedCents: 75500, approvedAt: T - 60000, ocrText: '' }])?.sid === 'x', 'تأكيد البنك لطلب اتقبل بالإيصال: المبلغ الكامل مقبول');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'functions', 'instapay.js'), 'utf8');
  const i = src.indexOf('async function pickPayAmount('); let j = src.indexOf('{', i), dd = 0;
  for (; j < src.length; j++) { if (src[j] === '{') dd++; else if (src[j] === '}') { dd--; if (dd === 0) break; } }
  const fnSrc = src.slice(i, j + 1);
  const mk = (docs) => new Function('db', 'crypto', 'console', fnSrc + '\nreturn pickPayAmount;')(
    () => ({ collection: () => ({ where: () => ({ get: async () => ({ forEach: (cb) => docs.forEach((u) => cb({ data: () => u })) }) }) }) }),
    require('crypto'), { warn(){} });
  (async () => {
    ok(await mk([])(75500, Date.now()) === 75500, 'مفيش طلب تاني = مبلغ الفاتورة بالظبط (الحالة العادية)');
    ok(await mk([{ status: 'finalized', bankState: 'BANK_CONFIRMED', amountCents: 75500 }])(75500, Date.now()) === 75500, 'طلب قديم خلص واتأكد من البنك = مش تصادم');
    const v = await mk([{ status: 'waiting', amountCents: 75500 }])(75500, Date.now());
    ok(v >= 75401 && v <= 75499, '🔴 طلب تاني مفتوح بنفس المبلغ = الطلب الجديد ياخد قروش مختلفة');
    const many = [{ status: 'waiting', amountCents: 75500 }].concat(Array.from({ length: 98 }, (_, k) => ({ status: 'scanning', amountCents: 75500 - (k + 1) })));
    ok(await mk(many)(75500, Date.now()) === 75401, '🔴 القروش عمرها ما تتكرر مع طلب مفتوح');
    ok(await mk([{ status: 'approved', bankState: 'PENDING_BANK_RECONCILIATION', amountCents: 75500 }])(75500, Date.now()) !== 75500, 'طلب اتقبل ولسه البنك ماأكدهوش = لسه بيتحسب تصادم');
  })();
  ok(/const payCents = await pickPayAmount\(requestedCents, now\);/.test(src) && /amountCents: payCents, requestedCents, fingerprintCents: requestedCents - payCents/.test(src), 'الطلب بيتسجل بمبلغ الدفع + مبلغ الفاتورة + الفرق');
  ok(/const vFull = core\.inspectReceipt\(text, _insOpts\(s\.requestedCents\)\);/.test(src), 'إيصال بمبلغ الفاتورة الكامل مقبول');
}

console.log('\n🧾 المطابقة بعد الحفظ (كل الفروع)');
{
  const inv = (cents, dtMin, extra) => Object.assign({ id: 'i' + cents + dtMin, amountCents: cents, createdAt: T + dtMin * 60000, status: 'pending' }, extra || {});
  const sm = (id, cents, dtMin, extra) => Object.assign({ id, direction: 'in', amountCents: cents, at: T + dtMin * 60000 }, extra || {});
  ok(C.matchInvoiceSms(inv(75500, 3), [sm('m1', 75500, 0)])?.id === 'm1', 'العميلة حوّلت وبعد 3 دقايق الكاشير حفظ = اتربطت');
  ok(C.matchSmsInvoice(sm('m1', 75500, 2), [inv(75500, 0)])?.id === 'i755000', 'الكاشير حفظ الأول والرسالة وصلت بعدها = اتربطت');
  ok(C.matchInvoiceSms(inv(75500, 3), [sm('m1', 75000, 0)]) === null, '🔴 مبلغ مختلف = مفيش ربط (هيطلع تنبيه)');
  ok(C.matchInvoiceSms(inv(75500, 3), [sm('m1', 75500, 0, { invoiceId: 'other' })]) === null, '🔴 رسالة اتربطت بفاتورة تانية مبتتستخدمش مرتين');
  ok(C.matchInvoiceSms(inv(75500, 30), [sm('m1', 75500, 0)]) === null, '🔴 رسالة من نص ساعة = مش بتاعتها');
  ok(C.matchInvoiceSms(inv(75500, 5), [sm('m1', 75500, 0), sm('m2', 75500, 4)])?.id === 'm2', 'رسالتين بنفس المبلغ = الأقرب في الوقت');
  ok(C.matchInvoiceSms(inv(100000, 1), [Object.assign(sm('o', 100000, 0), { direction: 'out' })]) === null, '🔴 رسالة صادر عمرها ما تأكد فاتورة');
  ok(C.matchSmsInvoice(sm('m1', 75500, 2), [inv(75500, 0, { status: 'bank_missing' })]) !== null, 'رسالة اتأخرت في الوصول (بعد التنبيه) بتتربط برضه وبتتعلّم «متأخرة»');
  ok(C.matchSmsInvoice(sm('m1', 75500, 1), [inv(75500, 0, { status: 'bank_ok' })]) === null, 'فاتورة اتربطت خلاص مبتتربطش تاني');
  const fn2 = fs.readFileSync(path.join(__dirname, '..', 'functions', 'instapaySms.js'), 'utf8');
  ok(/onDocumentCreated\(\{ document: 'pos_test_sales\/\{saleId\}', region: 'europe-west1' \}/.test(fn2) && /if \(!sale \|\| !\(insta > 0\) \|\| Number\(sale\.total \|\| 0\) < 0\) return;/.test(fn2), 'كل فاتورة فيها إنستاباي (أي فرع) بتدخل المطابقة · المرتجع لأ');
  ok(/type: 'instapay_invoice_bank_missing'/.test(fn2) && /if \(s\.status === 'finalized'\) continue;/.test(fn2), 'فاتورة من غير رسالة = تنبيه في Office · ومن غير تنبيه مكرر للطلب');
  ok(/await tryInvoicesForSms\(smsId, sms\)/.test(fn2), 'الرسالة لما توصل بتدوّر على الفاتورة كمان');
  ok(/status: 'unreadable'/.test(fn2), 'رسالة مقدرناش نقراها بتتسجل «unreadable» عشان نعرف السبب');
}

console.log('\n🔐 الدالة');
const fn = fs.readFileSync(path.join(__dirname, '..', 'functions', 'instapaySms.js'), 'utf8');
ok(/defineSecret\('INSTAPAY_SMS_KEY'\)/.test(fn) && /timingSafeEqual/.test(fn), 'مفتاح سري من Secret Manager ومقارنة آمنة');
ok(/if \(\(await tx\.get\(ref\)\)\.exists\) return false;/.test(fn) && /tx\.create\(ref,/.test(fn), 'نفس الرسالة مرتين = مرة واحدة');
ok(/if \(!s \|\| s\.bankState === CONFIRMED\) return false;/.test(fn), 'طلب اتأكد مبيتأكدش تاني برسالة تانية');
ok(!/where\([^)]*\)\.where\(/.test(fn), 'كل الاستعلامات بحقل واحد (من غير index مركّب)');
ok(/if \(!s \|\| !\['waiting', 'scanning'\]\.includes\(s\.status\)\) return false;/.test(fn) && /\(live\.data\(\) \|\| \{\}\)\.sid === sid/.test(fn), 'التأكيد من البنك جوّه معاملة: الطلب لسه مفتوح + التابلت بيتحدّث بس لو لسه على نفس الطلب');
ok(/if \(!\(m && m\.ambiguous\)\) \{/.test(fn), 'لو طلبات «اتقبلت» متلخبطة بنفس المبلغ، مبنروحش نأكد طلب مفتوح');
ok(/const DONE = \['approved', 'finalized'\]/.test(fn) && (fn.match(/DONE\.includes\(s\.status\)/g) || []).length === 2, '🔴 الطلب اللي فاتورته اتحفظت (finalized) لسه بيتطابق ويتراقب — مش approved بس');

setTimeout(() => {   // فحوص البصمة async — النتيجة بعدها
  console.log(`\nالنتيجة: ${P} ناجح · ${F} فاشل`);
  if (typeof assert === 'function') assert(F === 0, 'test-instapay-sms: ' + F);
  else if (F) process.exitCode = 1;
}, 100);
