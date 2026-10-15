// ============================================================
// 🧪 test-videos.js — الفيديوهات القصيرة (قرار المالك 15-10-2026)
//   · الموظفة بتصوّر من Sales وتنشر على طول (من غير موافقة) — باركود صح إجباري
//   · الفيديو في Storage، والمستند في app_stories (kind:'video', status:'live', homeFeed)
//     عشان يقرا بقواعد Firestore الموجودة ويتحسب في نقط الموظفة ويتحجز زي «القطعة الواحدة»
//   · العميلة: صف «فيديوهات» → شاشة بالطول + «اشتريها» (استلام أو توصيل) / الشات / «اتباعت»
//   · إشعار واحد في اليوم بالكتير (نفس مستند stories_push مع الستوري)
// ============================================================
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SAL = R('sales/sales-stories.js'), APP = R('sales/sales-app.js'), CUS = R('pos/stories-app.js'), O2 = R('office2/stories.js'), FN = R('functions/index.js'), RULES = R('security/storage.rules');
const S = require(path.join(ROOT, 'pos', 'stories-core.js'));

// Sales
assert(/data-t="video"/.test(SAL) && /function recStart\(\)/.test(SAL) && /MediaRecorder/.test(SAL), 'Sales: تاب 🎬 فيديو بيسجّل من الكاميرا');
assert(/var MAXS = 60, MAXMB = 25;/.test(SAL) && /if\(s >= MAXS\) recStop\(\);/.test(SAL) && /< 5000\)\{ toast\('صوّري ٥ ثواني على الأقل'/.test(SAL), 'Sales: من ٥ لـ٦٠ ثانية (بيوقف لوحده)');
assert(/videoBitsPerSecond: 1500000/.test(SAL), 'Sales: الفيديو متضغوط وهو بيتسجّل (حوالي ٥ ميجا للدقيقة)');
assert(/if\(!\(V\.product && V\.product\.name\)\)\{ toast\('لازم باركود صح/.test(SAL), 'Sales: باركود صح إجباري (للشراء والنقط)');
assert(/kind: 'video', status: 'live'/.test(SAL) && /homeFeed: b/.test(SAL) && /approvedAt: now/.test(SAL), 'Sales: بينزل على طول (status live + homeFeed) من غير موافقة');
assert(/qtyLeft: sell \? qty : 0, qtyReserved: 0/.test(SAL) && /pieceBranch: pb/.test(SAL), 'Sales: العدد المتاح من اللون ده وفرعه (نفس منطق القطعة الواحدة)');
assert(/'app_videos\/' \+ b \+ '\/' \+ id/.test(SAL), 'Sales: مسار Storage = app_videos/<براند>/<id>');
assert(/import\("https:\/\/www\.gstatic\.com\/firebasejs\/10\.13\.0\/firebase-storage\.js"\)/.test(APP) && /uploadBytesResumable/.test(APP), 'Sales: رفع للـStorage بنفس نسخة Firebase');
assert(/cur\.data\(\)\.day !== data\.dayKey/.test(APP) && /seq: increment\(1\)/.test(APP), 'Sales: إشعار واحد في اليوم بالكتير');
assert(!/status:\s*'published'/.test(SAL), 'Sales لسه مبينشرش ستوري (الستوري بموافقة) — الفيديو بس live');

// Storage rules
assert(/match \/app_videos\/\{brand\}\/\{file\}/.test(RULES) && /sign_in_provider == 'password'/.test(RULES) && /30 \* 1024 \* 1024/.test(RULES) && /contentType\.matches\('video/.test(RULES), 'Storage: الموظفين بس يرفعوا فيديو ≤٣٠ ميجا');
assert(/match \/\{all=\*\*\} \{\s*allow read, write: if false;/.test(RULES), 'Storage: أي مكان تاني مقفول');

// Function
assert(/after\.kind === "video" \? "🎬 " : "📸 "/.test(FN), 'الإشعار: 🎬 للفيديو');

// Customer
assert(/S\.videos = hf\.filter\(function\(x\)\{ return x\.kind === 'video' && x\.videoUrl; \}\);/.test(CUS) && /S\.home = hf\.filter\(function\(x\)\{ return x\.kind !== 'video'; \}\);/.test(CUS), 'التطبيق: الفيديوهات صف لوحدها مش في «مختارة ليكي»');
assert(/return videosHtml\(\) \+ \(S\.home\.length \? homeRail\(\) : ''\);/.test(CUS), 'التطبيق: صف الفيديوهات فوق «مختارة ليكي»');
assert(/Math\.abs\(k - i\) <= 1 && !vd\.getAttribute\('src'\)/.test(CUS), 'التطبيق: الفيديو الحالي واللي جنبه بس بيحمّلوا (توفير النت)');
assert(/دوسي «اشتريها» ← اختاري استلام من الفرع أو توصيل للبيت/.test(CUS), 'التطبيق: بيشرح للعميلة تشتري إزاي');
assert(/function buyVideo\(i\)\{[^}]*orderItem\(v, v\.thumb, 'القطعة اللي في الفيديو'\)/.test(CUS) && /window\._cartPieces\[s\.barcode\] = s\.id;/.test(CUS), 'التطبيق: «اشتريها» = نفس حجز القطعة (السيرفر بيحجز وPOS بينبّه)');
assert(/اتباعت 💔/.test(CUS) && /اسألي عليها في الشات/.test(CUS), 'التطبيق: خلصت = اتباعت · من غير بيع = الشات');

// Office
assert(/\['videos', '🎬 فيديوهات'/.test(O2) && /O2Stories\.unhome\(/.test(O2) && /s\.homeFeed && s\.kind !== 'video'/.test(O2), 'Office 2: تاب الفيديوهات + «شيله» · مش متكرر في الرئيسية');

// النقط: الفيديو بيتحسب زي الستوري (status live + approvedAt)
{
  const T0 = Date.UTC(2026, 9, 15, 9, 0);
  const v = { id:'v1', kind:'video', status:'live', brand:'echarpe', barcode:'V1', employeeId:'e1', approvedAt:T0, branch:'echarpe Rehab' };
  const r = S.computeCredits([v], [{ ms:T0 + 1000, branch:'echarpe Rehab', items:[{ barcode:'V1', qty:5 }] }], {});
  assertEq(r.awards.length, 1, 'النقط: ٥ قطع من كود الفيديو = نقطة للموظفة');
}
