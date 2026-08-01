// ============================================================
// ✅ test-office-tasks — مراجعة تسليمات التاسك الأسبوعي من Office
// الشكاوى اللي الاختبار ده بيقفلها:
//   ١) شاشة التاسكات كانت بتموت كلها لو قراءة التسليمات فشلت
//      (permission-denied) — وكانت تشتغل عادي لو مافيش تسليمات، فالباج
//      كان شكله عشوائي.
//   ٢) مكانش فيه قبول/رفض ولا عرض للصور من المكتب أصلًا.
//   ٣) الـid بتاع التسليم كان بيتضيع (`d.data()` بس) — من غيره مفيش تعديل.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const OF = path.resolve(__dirname, '..', 'Office');
const src = fs.readFileSync(path.join(OF, 'office.js'), 'utf8');
console.log('  (المصدر: Office/office.js)');

function extractFn(s, name){
  const start = s.indexOf('function ' + name + '(');
  if(start < 0) return '';
  const open = s.indexOf('{', start);
  let depth = 0;
  for(let i = open; i < s.length; i++){
    if(s[i] === '{') depth++;
    else if(s[i] === '}'){ depth--; if(depth === 0) return s.slice(start, i + 1); }
  }
  return '';
}
function load(names){
  const sb = { Object, Number, String, Date, Math, JSON, console };
  vm.createContext(sb);
  names.forEach(n=>{
    const code = extractFn(src, n);
    assert(code.length > 0, `الدالة ${n} موجودة في office.js`);
    vm.runInContext(code, sb);
  });
  return sb;
}
const SB = load(['esc', 'ofTaskPatch', 'ofSubCard']);
const call = (expr)=> vm.runInContext(expr, SB);

// ============================================================
// ١) شكل القرار — كل قرار بيلغي المضاد صراحة
// ============================================================
{
  const ok = call(`ofTaskPatch('ok', 1700000000000)`);
  assertEq(ok.confirmed, true, '✅ القبول بيعلّم confirmed');
  assertEq(ok.confirmedAt, 1700000000000, 'وبيسجّل وقت القبول');
  assertEq(ok.rejected, false,
    '🔴 والأهم: بيلغي أي رفض قديم — تسليم اترفض وبعدين اتقبل مايفضلش مرفوض');
  assertEq(ok.rejectedAt, null, 'وبيمسح وقت الرفض القديم');

  const rej = call(`ofTaskPatch('rej', 1700000000000)`);
  assertEq(rej.rejected, true, '✖ الرفض بيعلّم rejected');
  assertEq(rej.rejectedAt, 1700000000000, 'وبيسجّل وقت الرفض');
  assertEq(rej.confirmed, false,
    '🔴 وبيلغي القبول القديم — وإلا التسليم يفضل محسوب مقبول وهو مرفوض');
  assertEq(rej.confirmedAt, null, 'وبيمسح وقت القبول القديم');

  // أي حاجة غير 'ok' = رفض (مفيش حالة ثالثة بتعدّي من غير قرار)
  assertEq(call(`ofTaskPatch('حاجة غلط', 1)`).confirmed, false,
    'أي أمر مش مفهوم مبيقبلش التسليم بالغلط');
}

// ============================================================
// ٢) كارت التسليم — الصورة والحالة وأزرار القرار
// ============================================================
{
  const wait = call(`ofSubCard({ id:'S1', employeeName:'سارة', photoURL:'data:image/jpeg;base64,AAA', submittedAt: 1700000000000 })`);
  assert(/data-id="S1"/.test(wait), '🔑 زرار القرار شايل id التسليم');
  assert(/data-act="ok"/.test(wait) && /data-act="rej"/.test(wait), 'وفيه قبول ورفض');
  assert(/class="tkThumb"/.test(wait), '🖼️ وصورة التسليم بتتعرض');
  assert(/data-full="data:image\/jpeg;base64,AAA"/.test(wait),
    'وفيها نسخة كاملة للتكبير عند الدوس');
  assert(wait.indexOf('مستني قرارك') >= 0, '⏳ والحالة بتقول إنه مستني قرار');

  const ok = call(`ofSubCard({ id:'S2', confirmed:true, photoURL:'data:image/jpeg;base64,BBB', submittedAt: 1700000000000 })`);
  assert(ok.indexOf('اتقبل') >= 0, '✅ المقبول بيبان مقبول');
  assert(ok.indexOf('مستني قرارك') < 0, 'ومش بيفضل مكتوب عليه مستني');
  assert(/data-act="ok"/.test(ok) && /data-act="rej"/.test(ok),
    '🔁 والأزرار فاضلة بعد القرار — عشان تقدر تعدّل لو غلطت');

  const rej = call(`ofSubCard({ id:'S3', rejected:true, submittedAt: 1700000000000 })`);
  assert(rej.indexOf('اترفض') >= 0, '✖ والمرفوض بيبان مرفوض');
  assert(/class="tkThumb"/.test(rej) === false && rej.indexOf('مفيش صورة') >= 0,
    'وتسليم من غير صورة بيقول كده بدل صورة مكسورة');
}

// تهريب HTML: اسم أو تاسك فيه وسوم مايكسرش الشاشة
{
  const evil = call(`ofSubCard({ id:'<img src=x onerror=alert(1)>', employeeName:'<b>x</b>', submittedAt:1 })`);
  assert(evil.indexOf('data-id="<img') < 0, '🛡️ الـid بيتهرّب (مفيش حقن HTML)');
  assert(evil.indexOf('&lt;img') >= 0, 'وبيتحوّل لنص عادي');
}

// ============================================================
// ٣) الاستعلامين اتفصلوا — فشل التسليمات مايوقّفش الشاشة
// ============================================================
{
  const load = extractFn(src, 'ofLoadTasks');
  assert(load.length > 0, 'ofLoadTasks موجودة');
  assert(!/Promise\.all\(\[[\s\S]*sales_task_submissions/.test(load),
    '🔴 الاستعلامين مابقوش في Promise.all واحدة (كانت بتقتل الشاشة كلها)');
  // التسليمات في try لوحدها، ومفيهاش return — يعني الرندر بيكمّل
  const subsPart = load.slice(load.indexOf('sales_task_submissions'));
  const subsCatch = subsPart.slice(subsPart.indexOf('catch'));
  assert(subsCatch.indexOf('return') < 0,
    '🔴 فشل التسليمات مابقاش بيوقف الدالة — التاسكات بتتعرض برضه');
  assert(/_tkSubsErr\s*=/.test(subsCatch), 'وبيتسجّل سبب الفشل عشان يبان للمالك');
  assert(/o\.id\s*=\s*d\.id/.test(load),
    '🔑 الـid بيتحفظ مع كل تسليم — من غيره القبول والرفض مستحيلين');
  // ترتيب مهم: الرندر بينادى بعد المحاولتين مش جوه try التسليمات
  assert(load.lastIndexOf('ofRenderTasks') > load.indexOf('sales_task_submissions'),
    'والرندر بينادى في الآخر بعد الاتنين');
}

// ============================================================
// ٤) القرار بيتكتب على المستند الصح + وراه تأكيد
// ============================================================
{
  const dec = extractFn(src, 'ofTaskDecide');
  assert(dec.length > 0, 'ofTaskDecide موجودة');
  assert(/confirm\(/.test(dec), '⛔ فيه تأكيد قبل القرار');
  assert(/employeeName/.test(dec) && /taskDescription/.test(dec),
    'والتأكيد بيقول الاسم والتاسك — مش «متأكد؟» وخلاص');
  assert(/sales_task_submissions'\)\.doc\(id\)\.update\(/.test(dec),
    'وبيعدّل نفس مستند التسليم اللي تطبيق الحضور بيقراه');
  assert(/ofTaskPatch\(act/.test(dec), 'وبيستخدم دالة الشكل المختبَرة فوق');
  // لو المستند مش موجود في اللستة، مايعملش حاجة
  assert(/if\(!s\)\s*return/.test(dec), 'وتسليم مش موجود = مفيش أي كتابة');
}

// ============================================================
// ٥) الكارت بتاع الموظفة بيعرض تسليماتها + الأحدث فوق
// ============================================================
{
  const rend = extractFn(src, 'ofRenderTasks');
  assert(/ofSubCard/.test(rend), 'كارت الموظفة بيعرض التسليمات');
  assert(/\.sort\(function\(a,b\)\{ return \(b\.submittedAt\|\|0\) - \(a\.submittedAt\|\|0\); \}\)/.test(rend),
    'والأحدث فوق');
  assert(/_tkSubsErr/.test(rend), 'ولو التسليمات فشلت بيظهر تحذير مكان الصمت');
  assert(/tkThumb/.test(rend) && /ofLightbox/.test(rend), '🖼️ والدوس على الصورة بيكبّرها');
}

// ============================================================
// ٦) الكاش
// ============================================================
{
  const sw = fs.readFileSync(path.join(OF, 'sw.js'), 'utf8');
  const v = (sw.match(/echarpe-office-v(\d+)/) || [])[1];
  assert(!!v && Number(v) >= 17, 'CACHE_NAME بتاع Office ≥ v17 (الحالي v' + (v || '?') + ')');
}
