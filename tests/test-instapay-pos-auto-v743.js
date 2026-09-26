/* 🧪 v743 — التأكيد (بنك/إيصال) = حفظ وطباعة لوحدهم · اليدوي لأ · مرة واحدة لكل طلب */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pos', 'instapay-pos.js'), 'utf8');
let P = 0, F = 0;
const ok = (c, m) => { if (c) { P++; console.log('  ✅ ' + m); } else { F++; console.log('  ❌ ' + m); } };
ok(/if \(firstTime && st\.mode !== 'manual'\) autoFinish\(st\);/.test(src), 'التأكيد من البنك/الإيصال بينادي الحفظ التلقائي — واليدوي لأ');
ok(/if \(!S \|\| autoFiredFor === S\.sid\) return;\s*autoFiredFor = S\.sid;/.test(src), 'مرة واحدة لكل طلب');
ok(/if \(!usingInsta \|\| !hasCart \|\| !approved \|\| finalizing\) return;/.test(src), 'مبيحفظش لو السلة فضيت أو الإنستاباي اتشال أو الحفظ شغال');
ok(/autoFiredFor = null;/.test(src), 'السلة الجديدة بتصفّر العلامة');
ok(/st\.mode === 'bank'/.test(src) && /البنك أكّد/.test(src), 'رسالة «البنك أكّد» للكاشير');
const tab = fs.readFileSync(path.join(__dirname, '..', 'feedback', 'instapay-tablet.js'), 'utf8');
ok(/s\.mode === 'bank'\) \? 'التحويل وصل ✓'/.test(tab), 'التابلت بيقول «التحويل وصل ✓» لما البنك يأكد');
console.log(`\nالنتيجة: ${P} ناجح · ${F} فاشل`);
if (typeof assert === 'function') assert(F === 0, 'test-instapay-pos-auto-v743: ' + F);
else if (F) process.exitCode = 1;
