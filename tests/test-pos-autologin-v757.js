// v757 — POS كان بيعلق على «إعداد الجهاز» ولازم يتقفل ويتفتح. بنشغّل كود الدخول الحقيقي.
'use strict';
const path = require('path');
const run = s => JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, '_helpers', 'pos-autologin-run.js'), s], { encoding:'utf8', timeout:20000 }));
let r = run('net2');
assert(r.onLogin && !r.onSetup && r.user === 'branch', 'النت هنّج مرتين: رجع لوحده لشاشة الدخول من غير قفل وفتح');
assertEq(r.signIns, 3, 'جرّب 3 مرات (فشل، فشل، نجح)');
r = run('restore');
assert(r.onLogin && r.signIns === 0, 'الجلسة المحفوظة رجعت: مفيش دخول بالباسورد خالص (كان بيدخل بالباسورد كل مرة الصفحة تفتح)');
r = run('anon');
assert(r.onLogin && r.user === 'branch' && r.signIns === 1, 'صفحة تانية عملت دخول «مجهول»: حساب الفرع رجع لوحده');
r = run('wrong');
assert(!r.onLogin && r.onSetup && /باسورد حساب الفرع اتغيّر/.test(r.status) && !r.credsKept, 'سلبي: باسورد اتغيّر = يقف ويقول السبب ويمسح المحفوظ');
assertEq(r.signIns, 1, 'سلبي: مبيفضلش يجرّب باسورد غلط (حساب الفرع ميتقفلش)');
r = run('nocreds');
assert(!r.onLogin && r.onSetup && r.signIns === 0, 'سلبي: جهاز جديد من غير حساب محفوظ = شاشة الإعداد عادي');
