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

// ============================================================
// ٧) 🔑 مفتاح الأسبوع لازم يطابق بين Office وتطبيق الحضور
// الباج: تطبيق الحضور كان بيكتب `sales_tasks` بس من غير أسبوع، فOffice
// (اللي بيقرا `sales_task_weeks`) مكانش بيشوف التاسك خالص. دلوقتي
// الاتنين بيكتبوا — ولو الحسبة اختلفت ولو بيوم، كل تطبيق هيكتب مستند
// أسبوع مختلف لنفس الأسبوع والتاريخ يتفرتك.
// ============================================================
{
  const SALES = path.resolve(__dirname, '..', 'sales', 'sales-app.js');
  const salesSrc = fs.readFileSync(SALES, 'utf8');

  function weekKeyAt(nowMs){
    const FakeDate = new Proxy(Date, { get(t, k){ return k === 'now' ? ()=> nowMs : t[k]; } });

    // --- Office ---
    const ob = { Intl, Date: FakeDate, Number, String, Math, OF_TZ: 'Africa/Cairo',
                 OF_WEEK_START: 6, _ofDayCut: 6, console };
    vm.createContext(ob);
    ['_ofShopParts', 'ofWeekStartMs', 'ofWeekKey'].forEach(n=>{
      vm.runInContext(extractFn(src, n), ob);
    });
    const off = vm.runInContext('ofWeekKey(ofWeekStartMs(0))', ob);

    // --- sales ---
    const sbx = { Intl, Date: FakeDate, Number, String, Math, console,
                  SL_TZ: 'Africa/Cairo', SL_WEEK_START: 6, SL_DAY_CUT: 6 };
    vm.createContext(sbx);
    ['slShopParts', 'slWeekStartMs', 'slWeekKey'].forEach(n=>{
      const code = extractFn(salesSrc, n);
      assert(code.length > 0, `الدالة ${n} موجودة في sales-app.js`);
      vm.runInContext(code, sbx);
    });
    const sal = vm.runInContext('slWeekKey()', sbx);
    return { off, sal };
  }

  // نلف على أسبوعين كاملين كل ساعتين — بيغطي كل الأيام والفجر وقلب الأسبوع
  let checked = 0, mismatch = null;
  const start = Date.UTC(2026, 6, 27, 0, 0);          // الاتنين 27 يوليو 2026
  for(let h = 0; h < 24 * 14 && !mismatch; h += 2){
    const t = start + h * 3600000;
    const r = weekKeyAt(t);
    checked++;
    if(r.off !== r.sal) mismatch = new Date(t).toISOString() + ' → Office ' + r.off + ' / sales ' + r.sal;
  }
  assert(checked > 100, 'اتفحص ' + checked + ' وقت على مدار أسبوعين');
  assertEq(mismatch, null, '🔑 نفس مفتاح الأسبوع في التطبيقين في كل وقت اتفحص');

  // وفحص محدد: فجر السبت (٤ صباحًا) لسه **الأسبوع اللي فات** — فاصلة الـ6
  const satDawn = weekKeyAt(Date.UTC(2026, 7, 1, 1, 0));   // 4 ص بتوقيت القاهرة
  const satNoon = weekKeyAt(Date.UTC(2026, 7, 1, 9, 0));   // 12 ظ بتوقيت القاهرة
  assert(satDawn.off !== satNoon.off,
    '🕕 فجر السبت أسبوع، وظهر السبت أسبوع جديد — فاصلة يوم الشغل شغالة');
  assertEq(satDawn.sal, satDawn.off, 'وتطبيق الحضور ماشي على نفس الفاصلة');

  // --- الكتابة نفسها ---
  const save = salesSrc.slice(salesSrc.indexOf('.saveTaskBtn'));
  const block = save.slice(0, save.indexOf('function ') > 0 ? save.indexOf('function ') : 3000);
  // ⚠️ §0: الفحص لازم يمسك **النداء** مش الاسم — الاسم مكتوب في تعليق فوقه
  //    والاختبار كان بينجح والباج راجع.
  assert(/setDoc\(doc\(db,'sales_task_weeks'/.test(block),
    "🔴 تطبيق الحضور بقى بيكتب مستند الأسبوع كمان — من غيره Office أعمى");
  assert(/weekKey:\s*wk/.test(block), 'وبيكتب weekKey جوه sales_tasks نفسه');
}

// ============================================================
// ٨) Office بيشوف التاسك المتحدد من تطبيق الحضور (للأسابيع القديمة)
// ============================================================
{
  const load2 = extractFn(src, 'ofLoadTasks');
  assert(/collection\('sales_tasks'\)/.test(load2),
    'Office بيقرا sales_tasks كمصدر احتياطي');
  const rend2 = extractFn(src, 'ofRenderTasks');
  assert(/_tkLive\[e\.id\]/.test(rend2), 'وبيستخدمه لما مافيش مستند أسبوع');
  assert(/_tkOffset === 0/.test(rend2),
    '🔴 للأسبوع الحالي **بس** — وإلا التاسك الحالي هيظهر غلط في أسبوع فات');
  assert(/lv\.weekKey === wk/.test(rend2),
    'ولو التاسك مكتوب عليه أسبوع، لازم يطابق الأسبوع المعروض');
  assert(/fromLive/.test(rend2), 'وبيتعلّم إنه جاي من تطبيق الحضور');
}
