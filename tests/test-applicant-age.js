// ============================================================
// 🧪 test-applicant-age.js — «بقاله كام» في شاشة المتقدّمين
// ------------------------------------------------------------
// اللي المالك سأله بالنص: «ليه مش بتعرفني الطلب بتاع apply من مدة
// قد إيه». الشاشة كانت بتعرض تاريخ مطلق (١٥ أغسطس) بس — محتاج
// حساب في الدماغ عشان تعرف قد إيه ده قديم.
//
// اللي الاختبار ده بيقفله:
//   ١) عرض تاريخ مطلق بس من غير «بقاله»
//   ٢) عتبة التنبيه بالساعات — طلب إمبارح يتخوّف منه غلط
//   ٣) طلب اتوظف أو اتقفل من زمان بيتحسب «مستني» برضه
//   ٤) الترتيب الافتراضي يتغيّر — كان بيبوّظ سلوك موجود
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'Office', 'office.js'), 'utf8');

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
const sb = { Object, Math, Number, String, Array, JSON, Date, console };
vm.createContext(sb);
['agoStr', 'agoStale'].forEach(function(n){
  const code = extractFn(SRC, n);
  assert(code.length > 0, 'mustExtract: ' + n + ' اتلقت');
  vm.runInContext(code, sb);
});
const ago = function(ts){ return vm.runInContext('agoStr(' + ts + ')', sb); };
const stale = function(ts, d){ return vm.runInContext('agoStale(' + ts + ',' + (d == null ? '' : d) + ')', sb); };

const NOW = Date.now();
sb.Date.now = function(){ return NOW; };   // ⚠️ ثبات الوقت وقت الاختبار

/* ============================================================
   ١) ⭐⭐ النص المقروء بدل التاريخ المطلق بس
   ============================================================ */
(function(){
  assertEq(ago(NOW - 30 * 60000), 'من 30 دقيقة', 'نص ساعة');
  assertEq(ago(NOW - 3 * 3600000), 'من 3 ساعات', '⭐ ٣ ساعات');
  assertEq(ago(NOW - 25 * 3600000), 'من يوم', 'يوم واحد بالمفرد الصح');
  assertEq(ago(NOW - 3 * 86400000), 'من 3 أيام', '⭐ ٣ أيام');
  assertEq(ago(NOW - 21 * 86400000), 'من 3 أسابيع', '⭐ ٣ أسابيع');
  assertEq(ago(NOW - 90 * 86400000), 'من 3 شهور', 'وشهور لما يكبر أكتر');
  assertEq(ago(0), '', '⭐ طلب من غير طابع وقت مبيكسرش (مفيش تاريخ سالب غريب)');
})();

/* ============================================================
   ٢) ⭐⭐ العتبة بالأيام — إمبارح لسه طازة
   ============================================================ */
(function(){
  assertEq(stale(NOW - 20 * 3600000, 7), false,
    '⭐⭐ طلب من ٢٠ ساعة لسه مش «قديم» — المالك مايتخوّفش منه غلط');
  assertEq(stale(NOW - 6 * 86400000, 7), false, 'ولا بعد ٦ أيام');
  assertEq(stale(NOW - 8 * 86400000, 7), true, '⭐ بعد أسبوع بقى «قديم»');
  assertEq(stale(0, 7), false, 'طلب من غير طابع وقت مش «قديم» (مفيش بيانات أصلًا)');
})();

/* ============================================================
   ٣) ⭐⭐ العرض مربوط بالحالة كمان — «اتوظف» مش «مستني»
   ============================================================ */
(function(){
  const i = SRC.indexOf('function ofRenderApplicants');
  const j = SRC.indexOf('window.apSet');
  const body = SRC.slice(i, j);
  assert(/agoStale\(a\.ts, 7\) && \(a\.status \|\| 'new'\) === 'new'/.test(body),
    "⭐⭐ التحذير بس للطلبات اللي لسه 'new' — مش لكل طلب قديم");
  assert(/⏳ لسه من غير رد/.test(body), 'ونص التحذير واضح ليه محتاج قرار');
  assert(/agoStr\(a\.ts \|\| 0\)/.test(body), '⭐ و«بقاله» بتتعرض جنب كل متقدّم');
})();

/* ============================================================
   ٤) ⭐ ملخّص العدد + الترتيب الافتراضي زي ما كان
   ============================================================ */
(function(){
  const i = SRC.indexOf('function ofRenderApplicants');
  const body = SRC.slice(i, SRC.indexOf('window.apSet'));
  assert(/staleCount/.test(body), 'عدّاد المستنيين من غير رد موجود');
  assert(/_apSortOldest \? \(a\.ts\|\|0\) - \(b\.ts\|\|0\) : \(b\.ts\|\|0\) - \(a\.ts\|\|0\)/.test(body),
    '⭐⭐ الترتيب الافتراضي لسه الأحدث فوق (زي ما كان) — التبديل اختياري');
  assert(/let _apSortOldest = false;/.test(SRC), 'والافتراضي false صراحةً');
  assert(/window\.apToggleSort = function/.test(SRC), 'وفيه زرار للتبديل');
})();
