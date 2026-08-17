// ============================================================
// 💼 test-hire-tabs — تبويب التوظيف متقسّم لأربع شاشات
//
// الباج الأصلي: خمس لوحات مرصوصة في سكرول واحد بنفس الشكل، فـ«المتقدّمين
// للوظائف» (job_applications — اللي جه من الإعلان) كانوا تايهين وسط
// «طلبات التوظيف» (staff_docs — ورق اللي جاله دعوة). مجموعتين مختلفتين
// تمامًا وشكلهم واحد.
//
// ⚠️ الاختبار ده **بنيوي مش نصّي**: بيتأكد إن كل لوحة فعلًا **جوّه**
//    الحاوية بتاعتها بالأقواس، مش إن الكلمة موجودة في الملف في أي مكان.
//    الفحص الفضفاض (§14.2) كان هيعدّي حتى لو اللوحات لسه مرصوصة زي ما هي.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const OFFICE = path.resolve(__dirname, '..', 'Office');
const html = fs.readFileSync(path.join(OFFICE, 'index.html'), 'utf8');
const js   = fs.readFileSync(path.join(OFFICE, 'office.js'), 'utf8');

/* استخراج محتوى عنصر بالـid بالأقواس المتوازنة — بيمتد لآخر الـdiv
   الحاوي مهما اتغيّر جواه (نفس درس extractFn في test-admin-panels). */
function divById(src, id){
  const at = src.indexOf('id="' + id + '"');
  if(at < 0) return '';
  const open = src.lastIndexOf('<div', at);
  if(open < 0) return '';
  let depth = 0, i = open;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = open;
  let m;
  while((m = re.exec(src))){
    if(m[0] === '</div>'){ depth--; if(depth === 0) return src.slice(open, m.index + 6); }
    else depth++;
    i = m.index;
  }
  return '';
}

/* ── ١. القسم موجود وفيه شريط تبويبات ── */
assert(html.indexOf('id="page-hire"') > -1, 'تبويب التوظيف موجود');
assert(html.indexOf('id="hireSubNav"') > -1, 'وفيه شريط تبويبات فرعية');

/* ── ٢. الأربع أزرار بمفاتيحها ── */
['apps','docs','vac','files'].forEach(function(k){
  assert(new RegExp('class="hireSub[^"]*"[^>]*data-h="' + k + '"').test(html),
    'زرار التبويب الفرعي موجود: ' + k);
});

/* ── ٣. 🔑 لُبّ الشكوى: كل مجموعة في حاوية **لوحدها** ──
   المقدّمين (apList) لازم يكونوا جوه hireApps، وورق الدعوة (hrList)
   جوه hireDocs — مش الاتنين في نفس السكرول. */
const secApps  = divById(html, 'hireApps');
const secDocs  = divById(html, 'hireDocs');
const secVac   = divById(html, 'hireVac');
const secFiles = divById(html, 'hireFiles');

assert(secApps.length  > 0, 'حاوية المقدّمين متقفلة صح');
assert(secDocs.length  > 0, 'حاوية الورق متقفلة صح');
assert(secVac.length   > 0, 'حاوية الشواغر متقفلة صح');
assert(secFiles.length > 0, 'حاوية الملفات متقفلة صح');

assert(secApps.indexOf('id="apList"') > -1, '📋 المقدّمين جوه شاشة المقدّمين');
assert(secApps.indexOf('id="hrList"') < 0,  '⛔ وورق الدعوة **مش** معاهم — ده كان لُبّ اللخبطة');

assert(secDocs.indexOf('id="hrList"') > -1, '📄 طلبات التوظيف جوه شاشة الورق');
assert(secDocs.indexOf('id="hvMake"') > -1, 'ومعاها زرار الدعوة اللي بيولّدها');
assert(secDocs.indexOf('id="apList"') < 0,  '⛔ والمقدّمين مش معاهم');

assert(secVac.indexOf('id="opGrid"') > -1,  '📌 الشواغر لوحدها');
assert(secVac.indexOf('id="apList"') < 0,   '⛔ من غير المقدّمين');

assert(secFiles.indexOf('id="efQ"') > -1,   '🗂️ ملف الموظفة لوحده');

/* ── ٤. واحدة بس مفتوحة في البداية، والباقي مقفول ── */
assert(/id="hireApps" class="hireSec">/.test(html), 'شاشة المقدّمين هي المفتوحة افتراضيًا');
['hireDocs','hireVac','hireFiles'].forEach(function(id){
  assert(new RegExp('id="' + id + '"[^>]*display:none').test(html),
    'والباقي مقفول في البداية: ' + id);
});

/* ── ٥. المختار لازم يبان — من غير كده الأربعة شكل واحد ── */
assert(/\.hireSub\.on\s*\{[^}]*background:/.test(html),
  'الزرار المفتوح ليه شكل مختلف فعلًا (.hireSub.on)');

/* ── ٦. الهاندلر: بيبدّل الحالة والعرض ── */
const handler = js.slice(js.indexOf("querySelectorAll('.hireSub')"),
                         js.indexOf("document.getElementById('page-inbox')"));
assert(handler.length > 0, 'هاندلر التبويبات الفرعية موجود');
assert(handler.indexOf("classList.remove('on')") > -1, 'بيشيل الحالة من الباقي');
assert(handler.indexOf("classList.add('on')") > -1,    'وبيحطها على المضغوط');
assert(/\.hireSec'\)[\s\S]*display\s*=\s*'none'/.test(handler), 'وبيخفي كل الشاشات');
assert(/getElementById\('hire'/.test(handler), 'وبيفتح المطلوبة بالـid');

/* ── ٧. 🚫 اختبار سلبي: لو الرسم اتربط بالضغط، اللوحة المخفية هتبات فاضية
       لحد ما يدوس عليها. الاشتراكات الحية هي اللي بترسم — الهاندلر
       عرض/إخفاء بس. */
assert(handler.indexOf('renderApplicants') < 0 && handler.indexOf('loadApplic') < 0,
  '🚫 الهاندلر مش بيعيد الرسم — الاشتراك الحي هو اللي بيرسم');

/* ── ٨. مفيش لوحة ضاعت في النقل: الخمسة كلهم لسه موجودين ── */
['id="apList"','id="hrList"','id="opGrid"','id="efQ"','id="hvMake"','id="opSave"','id="efCard"','id="hvList"']
  .forEach(function(k){
    assert(html.indexOf(k) > -1, 'ماضاعش في النقل: ' + k);
  });

/* ── ٩. الكاش اتزوّد — من غيره الجهاز يفضل على النسخة القديمة ── */
const sw = fs.readFileSync(path.join(OFFICE, 'sw.js'), 'utf8');
const ver = (sw.match(/echarpe-office-v(\d+)/) || [])[1];
assert(Number(ver) >= 57, 'CACHE_NAME في Office اتزوّد لـv57 على الأقل (لقينا v' + ver + ')');
