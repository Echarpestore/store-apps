// ============================================================
// 🧪 test-reward-once.js — الفوز يظهر **يوم واحد** مش كل يوم
// ------------------------------------------------------------
// 🔴 اللي المالك شافه: مكافأة الأسبوع بتفضل تظهر على كارت الموظفة
//    كل يوم، والاحتفال بيتعاد من الأول.
//
// السبب: `awardPeriod` كانت بتكتب `earnedAt: Date.now()` و`seen:false`
//    في **كل** مرة تشتغل. والحارس `done` بيعدّي لو أي موظفة جديدة
//    أهّلت في نص الأسبوع — وساعتها اللوب بيلف على **كل** الفايزين
//    ويرجّع طوابعهم لليوم الحالي.
//
// اللي الاختبار ده بيقفله:
//   ١) `earnedAt` بيتغيّر بعد الإنشاء → الفوز يظهر كل يوم
//   ٢) `seen` بيترجع false → دوسة الموظفة بتتلغي والاحتفال بيتعاد
//   ٣) المبلغ **مايتجمّدش**: لو موظفة جديدة أهّلت، القسمة بتتغيّر
//      للكل والفلوس لازم تفضل صح
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'sales', 'sales-app.js'), 'utf8');

function extractFn(s, name){
  const start = s.indexOf('async function ' + name + '(');
  if(start < 0) return '';
  const open = s.indexOf('{', start);
  let depth = 0;
  for(let i = open; i < s.length; i++){
    if(s[i] === '{') depth++;
    else if(s[i] === '}'){ depth--; if(depth === 0) return s.slice(start, i + 1); }
  }
  return '';
}
const AW = extractFn(SRC, 'awardPeriod');
assert(AW.length > 0, 'mustExtract: awardPeriod اتلقت');

/* ============================================================
   ١) ⭐⭐ الطابع بيتكتب مرة واحدة بس
   ============================================================ */
(function(){
  /* ⚠️ الفحص كان مربوط بـ`const existing = ...` حرفيًا. الكاش المحلي
     لوحده مكانش كفاية (لو اللقطة ماوصلتش، الفوز بيتكتب من الأول كل
     يوم — وده اللي شافه المالك فعلًا)، فبقى `let` ومعاه تأكيد من
     السيرفر. الفحص هنا بقى على **السلوك**: بنتأكد الأول، وبنستعمل
     المصدرين. */
  assert(/let existing = \(allRewards \|\| \[\]\)\.find\(r=> r && r\.id === id\)/.test(AW),
    '⭐⭐ بنشوف الأول في الكاش إذا كانت المكافأة موجودة');
  assert(/getDoc\(doc\(db,'sales_rewards', id\)\)/.test(AW),
    '⭐⭐ وبنأكّد من السيرفر لو مش في الكاش (الكاش وحده كان بيرجّع الطابع)');
  assert(/existing \? money : Object\.assign\(\{\}, money, \{ earnedAt: Date\.now\(\), seen: false \}\)/.test(AW),
    '⭐⭐ `earnedAt` و`seen` بيتكتبوا **عند الإنشاء بس**');

  // والطابع مش موجود في الحقول اللي بتتحدّث كل مرة
  const money = AW.slice(AW.indexOf('const money = {'), AW.indexOf('// 🔒 معرّف ثابت'));
  assert(money.length > 0, 'mustExtract: بلوك الحقول المتحدّثة اتقص');
  assert(!/earnedAt/.test(money), '⭐⭐ `earnedAt` مش في الحقول اللي بتتكتب كل مرة');
  assert(!/seen/.test(money), '⭐⭐ ولا `seen` — دوسة الموظفة مبتتلغيش');
})();

/* ============================================================
   ٢) ⭐ الفلوس بتفضل صح
   ============================================================ */
(function(){
  const money = AW.slice(AW.indexOf('const money = {'), AW.indexOf('// 🔒 معرّف ثابت'));
  assert(/amount: share\.amount/.test(money),
    '⭐ المبلغ بيتحدّث — موظفة جديدة أهّلت = القسمة اتغيّرت للكل');
  assert(/winners: share\.count/.test(money) && /budget: share\.budget/.test(money),
    '⭐ وعدد الفايزين والميزانية كمان');
  assert(/status: share\.overBudget \? 'pending' : 'approved'/.test(money),
    '⭐ وحالة الموافقة (فوق الميزانية = مستنية قرار المالك)');
})();

/* ============================================================
   ٣) الدفع مرة واحدة — المعرّف الثابت زي ما هو
   ============================================================ */
(function(){
  assert(/const id = key \+ '_' \+ e\.id/.test(AW),
    '⭐⭐ المعرّف ثابت (جهازين في فرعين = مستند واحد مش صرف مرتين)');
  assert(/setDoc\(doc\(db,'sales_rewards', id\)/.test(AW), 'الكتابة على نفس المعرّف');
  assert(/\{ merge: true \}/.test(AW), 'ودمج مش استبدال');
})();

/* ============================================================
   ٤) العرض — يوم الكسب بس
   ============================================================ */
(function(){
  const i = SRC.indexOf('function todaysRewardWinners');
  const body = SRC.slice(i, i + 500);
  assert(/caiDayKey\(r\.earnedAt\) === today/.test(body),
    '⭐ الكارت بيبان في يوم الكسب بس — والطابع بقى ثابت فالفوز يوم واحد');
  assert(/caiDayKey/.test(body), '⭐ واليوم بتوقيت القاهرة');
  assert(/visibleRewards\(/.test(body),
    '⭐ والمستنية موافقة الميزانية مبتظهرش (وعد ممكن يترفض أسوأ من مفيش وعد)');
})();
