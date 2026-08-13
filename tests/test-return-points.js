// ============================================================
// ↩️🎁 test-return-points — نقط المرتجع (باج مولّد النقط)
//
// 🔴 الباج اللي الملف ده موجود عشانه:
//    الخصم كان `floor(قيمة المرتجع ÷ المعدل)` لكل مرتجع لوحده.
//    floor بيرمي الكسر كل مرة → تقسيم المرتجع بيقلّل الخصم،
//    ولو التقسيم صغير كفاية الخصم بيبقى **صفر**:
//
//      اشترت بـ٩٩٠ → كسبت ٩ نقط
//      رجّعتها ١٠ مرات × ٩٩ → صفر خصم كل مرة
//      البضاعة رجعت كلها وفضل معاها ٩ نقط من العدم
//
//    والنقط بتتحوّل كاش عن طريق الاستبدال → ده باب فلوس مفتوح.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');

function extractFn(s, header){
  const i = s.indexOf(header);
  if(i < 0) return null;
  let d = 0, st = false;
  for(let j = s.indexOf('{', i); j < s.length; j++){
    if(s[j] === '{'){ d++; st = true; }
    else if(s[j] === '}'){ d--; if(st && d === 0) return s.slice(i, j + 1); }
  }
  return null;
}

const fnSrc = extractFn(src, 'function returnPointsDeduction(');
assert(!!fnSrc, 'لقينا returnPointsDeduction');
const box = { Math: Math, Number: Number };
vm.createContext(box);
vm.runInContext(fnSrc, box);
const deduct = vm.runInContext('returnPointsDeduction', box);

// ============================================================
// ١) ⭐⭐ المرتجع المقسّم — الباج الأصلي
// ============================================================
(function(){
  // اشترت بـ٩٩٠ وكسبت ٩ نقط (معدل ١٠٠)
  const EARNED = 9, TOTAL = 990;
  let refundedBefore = 0, pointsRefunded = 0;
  for(let i = 0; i < 10; i++){
    const d = deduct(EARNED, TOTAL, refundedBefore, 99, pointsRefunded);
    refundedBefore += 99;
    pointsRefunded += d;
  }
  assertEq(pointsRefunded, 9,
    '⭐⭐ رجّعت الـ٩٩٠ على ١٠ مرات × ٩٩ → اتخصم كل الـ٩ نقط (كان صفر قبل الإصلاح)');

  // 🔴 نيجاتيف — الحساب القديم بيسيب النقط
  let old = 0;
  for(let i = 0; i < 10; i++) old += Math.floor(99 / 100);
  assertEq(old, 0, '🔴 نيجاتيف — الحساب القديم كان بيخصم صفر فعلًا');
})();

// ============================================================
// ٢) التقسيم مبيغيّرش النتيجة أبدًا
// ============================================================
(function(){
  const EARNED = 9, TOTAL = 990;
  // مرة واحدة
  assertEq(deduct(EARNED, TOTAL, 0, 990, 0), 9, 'مرتجع كامل مرة واحدة = ٩');
  // مرتين
  let a = deduct(EARNED, TOTAL, 0, 500, 0);
  let b = deduct(EARNED, TOTAL, 500, 490, a);
  assertEq(a + b, 9, '⭐ ومقسّم على مرتين = ٩ برضه');
  // ٣٣ مرة × ٣٠
  let ref = 0, pts = 0;
  for(let i = 0; i < 33; i++){ const d = deduct(EARNED, TOTAL, ref, 30, pts); ref += 30; pts += d; }
  assertEq(pts, 9, '⭐⭐ ومقسّم على ٣٣ مرة = ٩ برضه — التقسيم مبيفيدش');
})();

// ============================================================
// ٣) المرتجع الجزئي بنصيبه
// ============================================================
(function(){
  assertEq(deduct(10, 1000, 0, 500, 0), 5, 'رجّعت نص الفاتورة = نص النقط');
  assertEq(deduct(10, 1000, 0, 100, 0), 1, 'وعُشرها = عُشر النقط');
  assertEq(deduct(9, 990, 0, 99, 0), 1,
    '⭐ ومرتجع ٩٩ (اللي كان بيدي صفر) بقى بياخد نصيبه نقطة');
})();

// ============================================================
// ٤) 🔒 حراس — مفيش خصم زيادة ولا نقط من مرتجع
// ============================================================
(function(){
  assertEq(deduct(5, 500, 500, 100, 5), 0,
    '🔒 اترجّعت كلها خلاص → مفيش خصم زيادة');
  assertEq(deduct(5, 500, 0, 99999, 0), 5,
    '🔒 ومرتجع أكبر من الفاتورة بيتقصّ عند حد نقط الفاتورة');
  assertEq(deduct(0, 500, 0, 500, 0), 0,
    'فاتورة مكسبتش نقط = مفيش خصم');
  assertEq(deduct(5, 0, 0, 100, 0), 0, 'وفاتورة بإجمالي صفر مبتكسرش الحساب');
  assert(deduct(5, 500, 0, 100, 0) >= 0, '⛔ والناتج عمره ما يبقى سالب');
  assertEq(deduct(-5, 500, 0, 100, 0), 0, 'ونقط سالبة على الأصلية مبتضيفش');
  assertEq(deduct(5, 500, 0, -100, 0), 0, 'ومرتجع سالب مبيضيفش نقط');
})();

// ============================================================
// ٥) 🔁 idempotent — إعادة نفس المرتجع مبتخصمش تاني
// ============================================================
(function(){
  const d1 = deduct(10, 1000, 0, 400, 0);
  assertEq(d1, 4, 'أول مرتجع ٤٠٠ → ٤ نقط');
  // نفس المرتجع اتسجّل خلاص (refundedBefore=400, pointsRefunded=4)
  const d2 = deduct(10, 1000, 400, 0, 4);
  assertEq(d2, 0, '⭐ ومفيش مرتجع جديد = مفيش خصم جديد');
})();

// ============================================================
// ٦) 🔌 متوصّل فعلًا — مش دالة مبنية ومحدش بينديها (§4ب)
// ============================================================
(function(){
  assert(/_retPointsDeduct \+= _ptsDeduct/.test(src),
    '⭐ الخصم بيتجمّع في مسار المرتجع');
  assert(/- _retPointsDeduct/.test(src),
    '⭐⭐ وبيتخصم فعلًا من رصيد العميلة');
  assert(/pointsRefunded: \(Number\(orig\.pointsRefunded\)\|\|0\) \+ _ptsDeduct/.test(src),
    '⭐⭐ وبيتحفظ على الفاتورة الأصلية — ده اللي بيمنع التقسيم');
  assert(/refundedValue: \(Number\(orig\.refundedValue\)\|\|0\) \+ _thisRefund/.test(src),
    'والمرجّع بالقيمة كمان');
  assert(/window\.returnPointsDeduction = returnPointsDeduction/.test(src),
    '§18 معروضة على window');

  // ⭐ لازم تعيش بره الـtry وإلا أي استثناء بيضيّع الخصم
  const decl = src.indexOf('let _retPointsDeduct = 0;');
  const tryAt = src.indexOf('try{', decl);
  const useAt = src.indexOf('- _retPointsDeduct');
  assert(decl > 0 && tryAt > decl && useAt > tryAt,
    '⭐⭐ العدّاد متعرّف بره الـtry — استثناء في تتبّع المرتجع مايضيّعش الخصم');
})();

// ============================================================
// ٧) ⚖️ الشراء والمرتجع في نفس الفاتورة
//    المكتسب بياخد الموجب بس، والمرتجع بيتخصم بنصيبه —
//    من غير كده الخصم بيحصل مرتين.
// ============================================================
(function(){
  assert(/const _earnedPart = Math\.max\(0, loyaltyPointsEarned\)/.test(src),
    '⭐⭐ المكتسب بياخد الموجب بس — مفيش خصم مزدوج');
  assert(/_earnedPart\s*\n?\s*- \(pendingRedemption/.test(src)
      || /const netPointsChange = _earnedPart/.test(src),
    'وبيدخل في المعادلة النهائية');
})();
