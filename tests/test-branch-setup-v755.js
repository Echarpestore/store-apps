// v755 — «جارٍ تحميل الفروع…» كانت بتقف للأبد والفرع واقف بيع. القايمة لازم تبان فورًا.
'use strict';
const path = require('path');
const run = m => JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, '_helpers', 'branch-setup-run.js'), m], { encoding:'utf8', timeout:20000 }));
let r = run('hang');
assert(/echarpe El Rehab/.test(r.instant) && /Glow/.test(r.instant) && /فرع جديد/.test(r.instant), 'السيرفر معلّق: القايمة ظاهرة فورًا من الجهاز');
assert(!/جارٍ تحميل/.test(r.instant), 'مفيش «جارٍ تحميل» بعد أول لحظة');
assert(/value="Glow" selected/.test(r.instant), 'فرع الجهاز متعلّم جاهز');
assert(r.ms >= 4900 && r.ms < 8000, 'السيرفر المعلّق بيتساب بعد 5 ثواني (مش للأبد): ' + r.ms + 'ms');
r = run('nocache');
assert(/value="Glow" selected/.test(r.instant) && /فرع جديد/.test(r.instant), 'جهاز من غير قايمة محفوظة + سيرفر معلّق: فرعه + Glow + فرع جديد');
r = run('ok');
assert(/echarpe City Centre/.test(r.final) && !/الإدارة/.test(r.final) && !/value="X"/.test(r.final), 'السيرفر رد: القايمة اتحدّثت (من غير الإدارة والأدمن)');
assert(/echarpe City Centre/.test(r.cache || ''), 'والقايمة الجديدة اتحفظت للمرة الجاية');
assert(/value="Glow" selected/.test(r.final), 'فرع الجهاز لسه متعلّم بعد التحديث');
r = run('deny');
assert(/echarpe El Rehab/.test(r.final) && r.ms < 1000, 'سلبي: رفض الصلاحية = القايمة المحفوظة على طول');
