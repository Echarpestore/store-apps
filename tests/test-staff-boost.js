// ============================================================
// 🧪 test-staff-boost.js — نقط الموظفة على منتج بعينه («حملة»)
// ------------------------------------------------------------
// اللي الاختبار ده بيقفله:
//   ١) الحملة تبقى **بديل** النقطة العادية بدل ما تتزاد فوقها —
//      كده الموظفة اللي بتبيع منتج الحملة بتخسر نقط القطع التانية،
//      فتبقى الحملة عقاب مش حافز.
//   ٢) حملة من غير تاريخ نهاية بتفضل شغالة نسيان — والموظفة تاخد
//      نقط على منتج المالك بطّل يهتم بيه من شهور.
//   ٣) المرتجع ياخد نقط حملة = مولّد نقط (اشتري ورجّع).
//   ٤) الكاشير متشوفش الحافز أصلًا — الشاشة اللي المالك بيظبط
//      منها مبتوصلش لحد.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SALE = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');
const UI = fs.readFileSync(path.join(ROOT, 'pos', 'basket-ui.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'pos', 'index.html'), 'utf8');
const ADMIN = fs.readFileSync(path.join(ROOT, 'pos', 'pos-admin.js'), 'utf8');

/* استخراج الدوال النقية بأقواس متوازنة — الregex بيتكسر مع الدوال
   اللي جواها أقواس، والفشل بيطلع ١٣ فشل وهمي (درس متكرر). */
function extractFn(src, name){
  const start = src.indexOf('function ' + name + '(');
  if(start < 0) return '';
  const open = src.indexOf('{', start);
  let depth = 0;
  for(let i = open; i < src.length; i++){
    if(src[i] === '{') depth++;
    else if(src[i] === '}'){ depth--; if(depth === 0) return src.slice(start, i + 1); }
  }
  return '';
}
const sb = { Object, Math, Number, String, Array, JSON, Date, console };
vm.createContext(sb);
['calcStaffPoint', 'calcStaffBonus', 'activeBoosts'].forEach(function(n){
  const code = extractFn(SALE, n);
  assert(code.length > 0, 'mustExtract: الدالة ' + n + ' اتلقت في المصدر');
  vm.runInContext(code, sb);
});
const bonus = function(cart, boosts, now, isRefund){
  return vm.runInContext('calcStaffBonus(' + JSON.stringify(cart) + ',' + JSON.stringify(boosts)
    + ',' + JSON.stringify(now) + ',' + JSON.stringify(!!isRefund) + ')', sb);
};

const NOW = 1770000000000;
const LIVE = { items:[{ barcode:'BOOST', name:'طرحة الحملة', points:1, until: NOW + 86400000, active:true }] };

/* ============================================================
   ١) الحساب الأساسي
   ============================================================ */
(function(){
  assertEq(bonus([{ barcode:'BOOST', qty:1 }], LIVE, NOW), 1, 'قطعة من منتج الحملة = نقطة');
  assertEq(bonus([{ barcode:'BOOST', qty:3 }], LIVE, NOW), 3, '⭐ ٣ قطع = ٣ نقط (بتتضرب في الكمية)');
  assertEq(bonus([{ barcode:'OTHER', qty:5 }], LIVE, NOW), 0, 'منتج تاني = صفر');
  assertEq(bonus([], LIVE, NOW), 0, 'سلة فاضية = صفر');
  assertEq(bonus([{ barcode:'BOOST', qty:1 }], null, NOW), 0, 'مفيش حملات = صفر');
  assertEq(bonus([{ barcode:'BOOST', qty:2 }],
    { items:[{ barcode:'BOOST', points:0.5, until: NOW + 1000, active:true }] }, NOW), 1,
    '⭐ الكسور شغالة (نص نقطة للقطعة)');
})();

/* ============================================================
   ٢) ⭐⭐ فوق النقطة العادية مش بدلها
   ============================================================ */
(function(){
  // فاتورة ٥ قطع فيها قطعة حملة، الحد ٥ → نقطة عادية + نقطة حملة
  const base = vm.runInContext('calcStaffPoint(5, 1000, 5, 0, true, false)', sb);
  assertEq(base, 1, 'النقطة العادية زي ما هي');
  const b = bonus([{ barcode:'BOOST', qty:1 }, { barcode:'X', qty:4 }], LIVE, NOW);
  assertEq(base + b, 2, '⭐⭐ المجموع = العادية + الحملة (مش بديل)');

  // والكود نفسه بيجمع مش بيستبدل
  assert(/const staffPointValue = \+\(staffBaseValue \+ staffBonusValue\)\.toFixed\(3\)/.test(SALE),
    '⭐⭐ الجمع مكتوب صراحةً في مسار الحفظ');
  assert(/staffBaseValue,/.test(SALE) && /staffBonusValue,/.test(SALE),
    '⭐ والتفصيل بيتحفظ على الفاتورة (عشان يتراجع بعدين)');
  assert(/base: staffBaseValue, bonus: staffBonusValue/.test(SALE),
    '⭐ وفي سجل النقط كمان');
})();

/* ============================================================
   ٣) ⭐⭐ التاريخ — الافتراضي الآمن هو «مفيش نقط»
   ============================================================ */
(function(){
  const expired = { items:[{ barcode:'BOOST', points:1, until: NOW - 1, active:true }] };
  assertEq(bonus([{ barcode:'BOOST', qty:2 }], expired, NOW), 0, '⭐⭐ الحملة المنتهية = صفر');

  const noDate = { items:[{ barcode:'BOOST', points:1, active:true }] };
  assertEq(bonus([{ barcode:'BOOST', qty:2 }], noDate, NOW), 0,
    '⭐⭐ حملة من غير تاريخ **مبتديش نقط** — الافتراضي الآمن مش نقط للأبد');

  const off = { items:[{ barcode:'BOOST', points:1, until: NOW + 86400000, active:false }] };
  assertEq(bonus([{ barcode:'BOOST', qty:2 }], off, NOW), 0, '⭐ الموقوفة = صفر');

  const zero = { items:[{ barcode:'BOOST', points:0, until: NOW + 86400000, active:true }] };
  assertEq(bonus([{ barcode:'BOOST', qty:2 }], zero, NOW), 0, 'نقط صفر = صفر');

  // والشاشة بتفرض المدة
  assert(/if\(days <= 0\)\{ showToast\('حدّد الحملة بتقف بعد كام يوم'/.test(UI),
    '⭐⭐ الشاشة بترفض حملة من غير مدة');
})();

/* ============================================================
   ٤) ⭐⭐ المرتجع وسطور الاستبدال = صفر
   ============================================================ */
(function(){
  assertEq(bonus([{ barcode:'BOOST', qty:2 }], LIVE, NOW, true), 0,
    '⭐⭐ فاتورة المرتجع مبتاخدش نقط حملة (وإلا اشتري ورجّع = مولّد نقط)');
  assertEq(bonus([{ barcode:'BOOST', qty:2, isReturn:true }], LIVE, NOW), 0,
    '⭐⭐ وسطر المرتجع جوه فاتورة عادية كمان');
  assertEq(bonus([{ barcode:'BOOST', qty:2, isRedemption:true }], LIVE, NOW), 0,
    '⭐ وسطر الاستبدال');
  assertEq(bonus([{ barcode:'BOOST', qty:2, isRewardDiscount:true }], LIVE, NOW), 0,
    '⭐ وسطر المكافأة');
  assertEq(bonus([{ barcode:'BOOST', qty:-3 }], LIVE, NOW), 0, '⭐ كمية سالبة مبتطلّعش نقط');
})();

/* ============================================================
   ٥) الكاشير بتشوف الحافز وهي بتبيع
   ============================================================ */
(function(){
  assert(/id="boostStrip"/.test(HTML), '⭐⭐ شريط الحملة فوق السلة');
  assert(/function boostRenderStrip/.test(UI), 'ودالته موجودة');
  assert(/try\{ if\(typeof boostRenderStrip === 'function'\) boostRenderStrip\(\); \}catch\(e\)\{\}/.test(SALE),
    '⭐⭐ بيترسم من renderCart جوه try (سقوطه ممنوع يعطّل السلة)');
  assert(/نقط إضافية ليكي/.test(UI), '⭐ والنص موجّه للموظفة مش للمالك');
  assert(/id="navBoosts"/.test(HTML), 'أيقونة الشاشة في الإدارة');
  assert(/id="boostScreen"/.test(HTML), 'والشاشة');
  ['goToStaffBoosts','boostAdd','boostStop','renderBoostScreen','boostRenderStrip',
   'boostInvSuggest','boostPickInv'
  ].forEach(function(fn){
    assert(new RegExp('window\\.' + fn + '\\s*=\\s*' + fn).test(UI),
      'القاعدة الذهبية — على window: ' + fn);
  });
  assert(/window\.calcStaffBonus = calcStaffBonus/.test(SALE), 'وcalcStaffBonus كمان');
})();

/* ============================================================
   ٦) القراءات
   ============================================================ */
(function(){
  assert(/loadStaffBoosts/.test(ADMIN), '⭐ الحملات بتتحمّل مع المخزون — مستند واحد لكل جلسة');
  assert(/\.doc\(id\)\.get\(\)/.test(SALE.slice(SALE.indexOf('async function loadStaffBoosts'),
    SALE.indexOf('async function loadStaffBoosts') + 500)),
    '⭐ مستند واحد مش استعلام');
  assert(/staff_point_boosts_/.test(SALE), 'اسم المستند لكل براند');
})();
