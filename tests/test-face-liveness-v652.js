// ============================================================
// 🟢 test-face-liveness-v652 — «بص يمين / بص شمال» في حضور الوش
//
// بيشغّل منطق التحقق الحقيقي من sales-app.js على تسلسل قراءات:
//   · لازم الاتجاهين، بالترتيب المطلوب، وكل واحد يثبت لقطتين
//   · البص في الاتجاه الغلط مايملاش الشريط
//   · صورة ثابتة (نسبة مابتتغيّرش) عمرها ما تعدّي — ده اختبار الأمان السلبي
//   · وضع البداية لازم يتاخد والوش قدام
// ============================================================
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'sales', 'sales-app.js'), 'utf8').replace(/\r\n/g, '\n');
const grab = (re, what)=>{ const m = src.match(re); assert.ok(m, what + ' مش موجود في sales-app.js'); return m[0]; };
const consts = grab(/const FACE_TURN_DELTA=[^\n]+/, 'ثوابت التحقق') + '\n' + grab(/const FACE_MIN_SCORE=[^\n]+/, 'ثوابت الوش');
const fns = grab(/function faceTurnProgress\(base,ratio,dir\)\{[\s\S]*?\n\}/, 'faceTurnProgress') + '\n' + grab(/function faceLivenessNew\(order\)\{[\s\S]*?\n\}/, 'faceLivenessNew') + '\n' + grab(/function faceLivenessStep\(s,ratio\)\{[\s\S]*?\n\}/, 'faceLivenessStep');
const L = new Function(consts + '\n' + fns + '\nreturn { faceTurnProgress, faceLivenessNew, faceLivenessStep, FACE_TURN_DELTA };')();
const run = (order, ratios)=>{ const s = L.faceLivenessNew(order); ratios.forEach(r=> L.faceLivenessStep(s, r)); return s; };

// التقدّم: يمين الشخص = النسبة بتقل
assert.strictEqual(L.faceTurnProgress(0.5, 0.5, 'right'), 0);
assert.strictEqual(L.faceTurnProgress(0.5, 0.5 - L.FACE_TURN_DELTA, 'right'), 1);
assert.ok(Math.abs(L.faceTurnProgress(0.5, 0.5 - L.FACE_TURN_DELTA / 2, 'right') - 0.5) < 1e-9);
assert.strictEqual(L.faceTurnProgress(0.5, 0.62, 'right'), 0, 'البص شمال مايملاش شريط اليمين');
assert.strictEqual(L.faceTurnProgress(0.5, 0.62, 'left'), 1);
assert.strictEqual(L.faceTurnProgress(NaN, 0.3, 'left'), 0);

// المسار السليم: قدام ×3 ← يمين ×2 ← شمال ×2
let s = run(['right','left'], [0.5,0.51,0.49, 0.40,0.39, 0.5, 0.61,0.62]);
assert.strictEqual(s.phase, 'done'); assert.ok(s.done.right && s.done.left);
// الترتيب العكسي
s = run(['left','right'], [0.5,0.5,0.5, 0.62,0.62, 0.38,0.38]);
assert.strictEqual(s.phase, 'done');

// 🔒 صورة ثابتة: مهما اتكررت القراءة مفيش تحقق
s = run(['right','left'], new Array(200).fill(0.5));
assert.strictEqual(s.phase, 'turn'); assert.strictEqual(s.done.right, false); assert.strictEqual(s.done.left, false);
// 🔒 اتجاه واحد بس مايكفيش
s = run(['right','left'], [0.5,0.5,0.5, 0.38,0.38,0.38,0.38, 0.5,0.5]);
assert.strictEqual(s.phase, 'turn'); assert.strictEqual(s.done.right, true); assert.strictEqual(s.done.left, false);
// 🔒 الاتجاه الغلط الأول مايتحسبش (المطلوب يمين وهو بص شمال)
s = run(['right','left'], [0.5,0.5,0.5, 0.62,0.62,0.62]);
assert.strictEqual(s.done.left, false, 'الشمال مايتحسبش قبل دوره'); assert.strictEqual(s.done.right, false); assert.strictEqual(s.i, 0);
// لقطة واحدة عابرة مش كفاية — لازم يثبت لقطتين
s = run(['right','left'], [0.5,0.5,0.5, 0.39, 0.5, 0.39, 0.5]);
assert.strictEqual(s.done.right, false);
// وضع البداية لازم يتاخد والوش قدام: لقطة ملفوفة بتصفّر العدّ
s = run(['right','left'], [0.5,0.5,0.2, 0.5,0.5]);
assert.strictEqual(s.phase, 'base');
s = run(['right','left'], [0.2,0.2,0.2,0.2]);
assert.strictEqual(s.phase, 'base', 'وش ملفوف من الأول مايبدأش التحقق');
// قراءات بايظة ماتكسرش حاجة
s = run(['right','left'], [NaN, undefined, 0.5,0.5,0.5]);
assert.strictEqual(s.phase, 'turn');

// الواجهة موصولة: runActiveLiveness بيستخدم الشريطين والترتيب العشوائي
assert.ok(/const ui=faceLiveUi\(video\);/.test(src) && /Math\.random\(\)<0\.5\?\['right','left'\]:\['left','right'\]/.test(src));
// اللي لسه ساري من اختبار v602 (اتنقل لـ_retired لأنه كان بيتأكد من نص «افتح بُقك» القديم):
assert.ok(src.includes('function mouthOpenRatio'), 'mouthOpenRatio لسه مستخدمة في جودة لقطات التسجيل');
assert.ok(!src.includes('er<maxEye*0.72'), 'تحقق الرمش القديم مايرجعش');
assert.ok(src.includes('async function verifyFaceWithSilentRetry') && src.includes('await verifyFaceWithSilentRetry(emp,video)'), 'إعادة المحاولة الصامتة لازم تفضل');
assert.ok(!src.includes('(maxMouth-minMouth)>=0.055'), 'شرط فتح البُق القديم اتشال');

console.log('  ✓ face liveness: بص يمين/شمال بالترتيب · الصورة الثابتة مابتعدّيش');
