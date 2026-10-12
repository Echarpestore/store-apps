// ============================================================
// 🎯 test-face-accuracy-v653 — مطابقة أدق من غير ما حد يسجّل مكان حد
//
// بيشغّل دوال المطابقة الحقيقية من sales-app.js على بصمات صناعية المسافة بينها معروفة:
//   · موظفة شكلها اتغيّر: بترفضها البصمة الواحدة، وبتعدّي بعد ما البصمة المضافة تتسجل
//   · 🔒 غريب بعيد: مرفوض مهما كان عدد البصمات
//   · 🔒 غريب قريب من بصمة مضافة بس بعيد عن بصمة التسجيل: مرفوض (المرساة)
//   · 🔒 البصمة المضافة ماتتضافش من مطابقة ضعيفة، ولا لو بعيدة عن بصمة التسجيل، ولا أكتر من 4
// ============================================================
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'sales', 'sales-app.js'), 'utf8').replace(/\r\n/g, '\n');
const grab = (re, what)=>{ const m = src.match(re); assert.ok(m, what + ' مش موجود في sales-app.js'); return m[0]; };
const code = [
  grab(/const FACE_MATCH_THRESHOLD=[^\n]+/, 'الحد'), grab(/const FACE_MIN_SCORE=[^\n]+/, 'ثوابت'), grab(/const FACE_ENROLL_TARGET=[^\n]+/, 'ثوابت التسجيل'), grab(/const FACE_ANCHOR_MAX=[^\n]+/, 'ثوابت v653'),
  grab(/function faceDistance\(a,b\)\{[\s\S]*?\n\}/, 'faceDistance'), grab(/function avgFaceDescriptors\(rows\)\{[\s\S]*?\n\}/, 'avgFaceDescriptors'),
  grab(/function pickStableDescriptors\(rows,maxDist\)\{[\s\S]*?\n\}/, 'pickStableDescriptors'), grab(/function faceProfileTemplates\(profile\)\{[\s\S]*?\n\}/, 'faceProfileTemplates'),
  grab(/function faceMatchProfile\(profile,samples\)\{[\s\S]*?\n\}/, 'faceMatchProfile'), grab(/function faceAdaptProfile\(profile,samples,match,nowMs\)\{[\s\S]*?\n\}/, 'faceAdaptProfile'),
  grab(/function faceQualityIssue\(q\)\{[\s\S]*?\n\}/, 'faceQualityIssue'), grab(/function faceStatsNext\(prev,entry\)\{[\s\S]*?\n\}/, 'faceStatsNext')].join('\n');
const F = new Function(code + '\nreturn { FACE_MATCH_THRESHOLD, faceMatchProfile, faceAdaptProfile, faceProfileTemplates, faceQualityIssue, faceStatsNext, faceDistance };')();

// بصمة على بُعد x من بصمة التسجيل (على محور واحد) — طول 1 عشان المتوسط المُطبَّع مايغيّرش المسافات كتير
const unit = ()=>{ const v = new Array(128).fill(0); v[0] = 1; return v; };
const at = (x, axis)=>{ const v = unit(); v[axis || 1] = x; return v; };       // المسافة عن unit() = x بالظبط
const three = (x, axis)=> [at(x, axis), at(x + 0.004, axis), at(x - 0.004, axis)];
const DAY = 86400000, T0 = 1791800000000;
const base = { v:2, descriptor: unit(), enrolledAt: T0 };
assert.strictEqual(F.FACE_MATCH_THRESHOLD, 0.5, 'الحد نفسه مايتغيّرش');

// 1) يوم عادي: مطابقة قوية
let m = F.faceMatchProfile(base, three(0.30));
assert.strictEqual(m.ok, true); assert.ok(Math.abs(m.dist - 0.296) < 0.01);
// 2) شكلها اتغيّر (0.56): البصمة الواحدة بترفض — ده «مش مطابق» اللي بيحصل دلوقتي
assert.strictEqual(F.faceMatchProfile(base, three(0.56)).ok, false);
// 3) مطابقة قوية فيها جديد (0.36) بتضيف بصمة
m = F.faceMatchProfile(base, three(0.36));
let p1 = F.faceAdaptProfile(base, three(0.36), m, T0 + DAY);
assert.ok(p1 && p1.templates.length === 1 && p1.v === 3, 'المفروض بصمة تتضاف');
assert.strictEqual(F.faceProfileTemplates(p1).length, 2);
assert.deepStrictEqual(p1.descriptor, base.descriptor, 'بصمة التسجيل الأصلية ماتتغيّرش');
// 4) دلوقتي نفس الشكل المتغيّر (0.56) بيعدّي عن طريق البصمة المضافة — ولسه جوّه المرساة
m = F.faceMatchProfile(p1, three(0.56));
assert.strictEqual(m.ok, true, 'الموظفة الحقيقية لازم تعدّي بعد البصمة المضافة'); assert.ok(m.dist < 0.25 && m.primaryDist <= 0.6);

// 🔒 5) غريب بعيد (0.75 على محور تاني): مرفوض ببصمة واحدة وبخمس بصمات
const full = { v:3, descriptor: unit(), templates: [0.30,0.36,0.42,0.48].map((x, i)=> ({ d: at(x), at: T0 + i * DAY, kind:'auto' })) };
assert.strictEqual(F.faceMatchProfile(base, three(0.75, 2)).ok, false);
assert.strictEqual(F.faceMatchProfile(full, three(0.75, 2)).ok, false, 'كتر البصمات مايدخّلش غريب');
// 🔒 6) غريب قريب من بصمة مضافة (0.48) بس بعيد عن بصمة التسجيل (0.80): مرفوض بالمرساة
m = F.faceMatchProfile(full, three(0.80));
assert.ok(m.dist <= 0.5, 'هو فعلًا قريب من البصمة المضافة'); assert.strictEqual(m.ok, false); assert.strictEqual(m.reason, 'anchor');

// 🔒 7) البصمة ماتتضافش من مطابقة ضعيفة (0.46 > 0.40)
m = F.faceMatchProfile(base, three(0.46)); assert.strictEqual(m.ok, true);
assert.strictEqual(F.faceAdaptProfile(base, three(0.46), m, T0 + DAY), null);
// 🔒 8) ولا من مطابقة مرفوضة
assert.strictEqual(F.faceAdaptProfile(base, three(0.75, 2), F.faceMatchProfile(base, three(0.75, 2)), T0 + DAY), null);
// 🔒 9) ولا لو اللقطة بعيدة عن بصمة التسجيل حتى لو قريبة من بصمة مضافة (سلسلة الانحراف)
const drift = { v:3, descriptor: unit(), templates: [{ d: at(0.45), at: T0, kind:'auto' }] };
m = F.faceMatchProfile(drift, three(0.58)); assert.strictEqual(m.ok, true);
assert.strictEqual(F.faceAdaptProfile(drift, three(0.58), m, T0 + 5 * DAY), null, 'بصمة على بُعد 0.58 من التسجيل ماتتضافش');
// 10) شبه بصمة موجودة = مفيش جديد · وأقل من يوم = استنى
assert.strictEqual(F.faceAdaptProfile(base, three(0.05), F.faceMatchProfile(base, three(0.05)), T0 + DAY), null);
m = F.faceMatchProfile(p1, three(0.20, 3));
assert.strictEqual(F.faceAdaptProfile(p1, three(0.20, 3), m, T0 + DAY + 3600000), null, 'بصمة واحدة في اليوم بالكتير');
assert.ok(F.faceAdaptProfile(p1, three(0.20, 3), m, T0 + 3 * DAY));
// 11) بالكتير 4 بصمات مضافة — الأقدم بتتشال
let prof = base, when = T0;
[[0.30,1],[0.30,2],[0.30,3],[0.30,4],[0.30,5],[0.30,6]].forEach(([x, ax])=>{ when += 2 * DAY; const mm = F.faceMatchProfile(prof, three(x, ax)); const nx = F.faceAdaptProfile(prof, three(x, ax), mm, when); assert.ok(nx, 'بصمة جديدة على محور ' + ax); prof = nx; });
assert.strictEqual(prof.templates.length, 4); assert.strictEqual(F.faceProfileTemplates(prof).length, 5);
assert.ok(prof.templates.every(t=> t.at > T0 + 4 * DAY), 'الأقدم اتشالت');

// جودة الصورة + سجل المحاولات
assert.strictEqual(F.faceQualityIssue({ luma:30, boxW:200, frameW:640 }), 'dark');
assert.strictEqual(F.faceQualityIssue({ luma:120, boxW:90, frameW:640 }), 'far');
assert.strictEqual(F.faceQualityIssue({ luma:120, boxW:600, frameW:640 }), 'close');
assert.strictEqual(F.faceQualityIssue({ luma:120, boxW:260, frameW:640 }), '');
assert.strictEqual(F.faceQualityIssue(null), '');
let st = {}; for(let i = 0; i < 25; i++) st = F.faceStatsNext(st, { at:T0 + i, ok: i % 5 !== 0, d:0.3 });
assert.strictEqual(st.n, 25); assert.strictEqual(st.fail, 5); assert.strictEqual(st.recent.length, 20);

// التحقق لازم يستخدم المطابقة الجديدة، ومفيش منطقة وسط بتعدّي غير المطابق
assert.ok(/const m=faceMatchProfile\(emp\.faceProfile,samples\);/.test(src));
assert.ok(/if\(!m\.ok\)\{ const e=new Error\('face-mismatch'\)/.test(src), 'غير المطابق لازم يترفض');
console.log('  ✓ face accuracy: كذا بصمة + تحديث آمن · الغريب مرفوض · الحد 0.50 زي ما هو');
