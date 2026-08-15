// ============================================================
// 🧪 test-multi-branch-staff.js — الموظفة اللي بتساعد في فرع تاني
// ------------------------------------------------------------
// اللي الاختبار ده بيقفله:
//   ١) تغيير `branch` بتاع الموظفة عشان تسجّل في الفرع التاني —
//      ده بينقلها من فرع لفرع في **كل** تقرير: عدد الموظفين،
//      الرواتب، إحصاءات الفرع. الحل الصح: فرعها الأساسي ثابت،
//      و`alsoBranches` بيضيف الظهور على الكشك بس.
//   ٢) الزائرة تتحسب في إحصاءات الفرع اللي بتزوره → الفرع يبان
//      عنده موظفين أكتر مما عنده، والفرع الأصلي أقل.
//   ٣) اختيار فرعها الأساسي جوه فروع المساعدة (زائرة عند نفسها).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'sales', 'sales-app.js'), 'utf8');

/* ============================================================
   ١) الفلتر — الظهور على كشك الفرعين
   ============================================================ */
(function(){
  const i = SRC.indexOf('window.employees = allEmployees.filter');
  assert(i > 0, 'mustExtract: فلتر الكشك اتلقى');
  const blk = SRC.slice(i, i + 400);
  assert(/e\.branch === window\.currentBranch/.test(blk), 'فرعها الأساسي لسه بيبيّنها');
  assert(/Array\.isArray\(e\.alsoBranches\) && e\.alsoBranches\.indexOf\(window\.currentBranch\) >= 0/.test(blk),
    '⭐⭐ وفروع المساعدة كمان — دي اللي بتخليها تسجّل حضور وهي هناك');
  assert(/e\.active !== false/.test(blk), '⭐ والموظفة الموقوفة مبتبانش في الحالتين');

  // ⭐⭐ ممنوع الحل يبقى بتغيير الفرع نفسه
  assert(!/branch:\s*window\.currentBranch/.test(SRC.slice(i, i + 400)),
    '⭐⭐ `branch` مبيتغيّرش — تغييره بينقلها من فرع لفرع في كل تقرير');
})();

/* ============================================================
   ٢) ⭐⭐ إحصاءات الفرع لسه على الفرع الأساسي
   ============================================================ */
(function(){
  /* الزائرة موجودة في `window.employees` دلوقتي، فأي حتة بتعدّ
     موظفين الفرع لازم تفضل بتفلتر بـ`e.branch` — وإلا الفرع اللي
     بتزوره يبان عنده عدد أكبر من الحقيقة. */
  assert(/const emps = \(window\.employees\|\|\[\]\)\.filter\(e=> e\.branch===br\)/.test(SRC),
    '⭐⭐ عدد موظفين الفرع لسه بالفرع الأساسي');
  assert(/const empIds = new Set\(\(window\.employees\|\|\[\]\)\.filter\(e=> e\.branch===br\)/.test(SRC),
    '⭐⭐ ومجموعة الفرع كمان');
  assert(/window\.isVisitingEmp = \(e\)=> !!\(e && e\.branch !== window\.currentBranch\)/.test(SRC),
    '⭐ وفيه طريقة نعرف مين زائرة (مسؤول الفرع لازم يعرف إنها مش من فريقه)');
})();

/* ============================================================
   ٣) ⭐ النقط والساعات بتتجمع لوحدها — من غير أي تعديل
   ------------------------------------------------------------
   ده مش كود جديد، ده **تأكيد** إن الحساب بالموظفة مش بالفرع.
   لو اتغيّر يوم لفلترة بالفرع، ساعات الزيارة هتختفي من المرتب
   والنقط تضيع — والاختبار ده بيقع.
   ============================================================ */
(function(){
  const i = SRC.indexOf('function computeSalary');
  assert(i > 0, 'mustExtract: computeSalary اتلقت');
  const body = SRC.slice(i, i + 3000);
  const m = body.match(/const rangeShifts = allShifts\.filter\(([^)]+)\)/);
  assert(!!m, 'mustExtract: فلتر شيفتات المرتب اتلقى');
  assert(/s\.employeeId===emp\.id/.test(m[1]),
    '⭐⭐ ساعات المرتب بتتفلتر بالموظفة — فساعات الفرع التاني بتتحسب');
  assert(!/s\.branch/.test(m[1]),
    '⭐⭐ ومفيش فلتر بالفرع (لو اتضاف، ساعات الزيارة تختفي من المرتب)');

  // والنقط كمان
  assert(/window\.points\.filter\(pp=> pp\.employeeId===emp\.id/.test(SRC),
    '⭐⭐ النقط بتتجمع بالموظفة — بتتراكم من الفرعين');
})();

/* ============================================================
   ٤) شاشة التحديد
   ============================================================ */
(function(){
  assert(/data-also-id="\$\{e\.id\}"/.test(SRC), 'خانة اختيار الفروع في شاشة الموظفين');
  assert(/multiple/.test(SRC.slice(SRC.indexOf('data-also-id'), SRC.indexOf('data-also-id') + 200)),
    '⭐ اختيار أكتر من فرع');
  assert(/allBranchNames\(\)\.filter\(b=> b !== e\.branch\)/.test(SRC),
    '⭐⭐ فرعها الأساسي مستبعد من القايمة — اختياره = «زائرة عند نفسها»');
  assert(/updateDoc\(doc\(db,'sales_employees', id\), \{ alsoBranches: vals \}\)/.test(SRC),
    '⭐ الحفظ فوري زي الشيفت (مفيش زرار حفظ يتنسي)');
  assert(/function allBranchNames/.test(SRC) && /window\.allBranchNames = allBranchNames/.test(SRC),
    '⭐ القاعدة الذهبية: قايمة الفروع على window');
  const ab = SRC.slice(SRC.indexOf('function allBranchNames'), SRC.indexOf('function allBranchNames') + 400);
  assert(/allEmployees/.test(ab) && /allShifts/.test(ab),
    '⭐ الفروع من نفس مصدر شاشة التسجيل — مفيش قايمة تانية تتنسى تتحدّث');
})();

/* ============================================================
   ٥) 🔁 البياعة الزائرة لازم تبان في POS كمان
   ------------------------------------------------------------
   🔴 الباج اللي المالك سأل عنه بنفسه: الموظفة بتسجّل حضور في الفرع
      التاني عادي، بس قايمة «مين اللي باعت؟» في POS كانت بتتفلتر
      بـ`branch` بس — و`branch` بتاعها **لسه فرعها الأساسي** (وده
      مقصود عشان الرواتب). النتيجة: بتحضر ومتبانش في القايمة، فكل
      بيعاتها هناك تروح «من غير بياعة» ومتتحسبش لحد.
      يعني نص الميزة كان شغال ونصها لأ: بتحضر ومبتكسبش.
   ============================================================ */
(function(){
  const fs2 = require('fs'), p2 = require('path');
  const APP = fs2.readFileSync(p2.join(__dirname, '..', 'pos', 'app.js'), 'utf8');
  const i = APP.indexOf('async function loadClockedInStaff');
  assert(i > 0, 'mustExtract: بناء قايمة البياعات اتلقى');
  const body = APP.slice(i, APP.indexOf('function focusSearchBar'));

  assert(/where\('alsoBranches','array-contains', currentBranch\)/.test(body),
    '⭐⭐ القايمة بتشمل الموظفات المحوّلات للفرع ده');
  assert(/where\('branch','==', currentBranch\)/.test(body),
    '⭐ وموظفات الفرع الأصليين طبعًا');
  assert(/_seenEmp\.has\(d\.id\)/.test(body),
    '⭐ ومفيش تكرار لو الموظفة طلعت في الاستعلامين');
  assert(/\.catch\(function\(\)\{ return \{ docs: \[\] \}; \}\)/.test(body),
    '⭐⭐ فشل استعلام المحوّلات مبيكسرش القايمة كلها — الفرع يفضل شغّال');
  assert(/d\.data\(\)\.active !== false/.test(body),
    '⭐ والموقوفة متبانش في أي فرع (الشرط زي ما هو)');
  assert(/_visiting \? '🔁 ' : ''/.test(body),
    '⭐⭐ الزائرة عليها علامة — الكاشير لازم تعرف إنها مش من فريق الفرع');

  // ⚠️ والحل **مش** بتغيير الفرع
  assert(!/branch:\s*currentBranch/.test(body),
    '⭐⭐ `branch` مبيتغيّرش — تغييره بينقلها من فرع لفرع في كل تقرير');
})();
