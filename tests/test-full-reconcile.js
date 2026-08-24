// ============================================================
// 🧹 test-full-reconcile — التنضيف الشامل (دمج المكرر + الاستيراد
// في خطوة واحدة)
//
// السياق (المالك): "ملفات كل براند دخلت ع بعض، كل حاجة اتكررت ٤-٥
// مرات، الموضوع مزعج جدًا في البيع والاستلام". طلب صريح: "ابني جديد
// يقفل الموضوع بشكل كامل" — أداة واحدة، مش خطوتين منفصلتين (دمج يدوي
// بعده استيراد يدوي).
//
// planFullReconcile بتعمل الاتنين بالترتيب الصح: دمج التكرار الموجود
// أصلًا (نفس قاعدة "أكواد متكررة" الآمنة بالظبط) → استيراد اسم/سعر من
// الملف فوق النسخة الناجية، **من غير ما تلمس الكمية خالص**.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const POS = path.resolve(__dirname, '..', 'pos');
const importSrc = fs.readFileSync(path.join(POS, 'import.js'), 'utf8');
const adminSrc = fs.readFileSync(path.join(POS, 'pos-admin.js'), 'utf8');

function extractFn(s, name){
  const st = s.indexOf('function ' + name + '(');
  if(st < 0) return '';
  const op = s.indexOf('{', st);
  let d = 0;
  for(let i = op; i < s.length; i++){
    if(s[i] === '{') d++;
    else if(s[i] === '}'){ d--; if(d === 0) return s.slice(st, i + 1); }
  }
  return '';
}

const ctx = {
  console: { warn(){}, log(){} },
  Object: Object, Array: Array, String: String, Math: Math,
  parseInt: parseInt, parseFloat: parseFloat, Date: Date
};
ctx.globalThis = ctx;
vm.createContext(ctx);

// من pos-admin.js — آلة الدمج (نقية بالكامل)
['findDupGroups', 'planDupMerge', '_dupTotalQty', 'planBulkMerge'].forEach(function(n){
  const f = extractFn(adminSrc, n);
  assert(f.length > 30, 'استخرجنا ' + n + ' من pos-admin.js');
  vm.runInContext(f, ctx);
});
// من import.js — آلة الاستيراد + الدالة الموحّدة الجديدة
['indexInventoryByCode', 'planInventoryWrites', 'planFullReconcile'].forEach(function(n){
  const f = extractFn(importSrc, n);
  assert(f.length > 30, 'استخرجنا ' + n + ' من import.js');
  vm.runInContext(f, ctx);
});

const MAPPING = { name:'Item Name', barcode:'Item Number', price:'Regular Price', quantity:'Qty 1' };
function row(name, code, qty, price){
  return { 'Item Name': name, 'Item Number': code, 'Qty 1': qty, 'Regular Price': price || 100 };
}

// ============================================================
// ١) 🔴🔴🔴🔴⭐ الحالة الأساسية: كود متكرر ٣ مرات، نسخة واحدة بس
//    فيها كمية → يتدمجوا تلقائي، وبعدها اسم/سعر الملف يتطبّق على الناجي
// ============================================================
(function(){
  const catalog = [
    // ⚠️ ترتيب مقصود: 'اسم قديم تاني' (id=832__الرحاب) هو اللي
    // indexInventoryByCode العادي كان هيختاره (بيفضّل المعرّف
    // القياسي {كود}__{فرع})، بس هو **مفيهوش كمية**. النسخة اللي
    // فيها الكمية معرّفها عشوائي (RANDOM_QTY) — عشان الفحص يفرّق
    // فعليًا بين "الفهرس الخام" و"الفهرس بعد الدمج".
    { id:'a1', barcode:'832', name:'اسم قديم غلط', price:50, qtyByBranch:{'الرحاب':0}, branches:['الرحاب'] },
    { id:'832__الرحاب', barcode:'832', name:'اسم قديم تاني', price:60, qtyByBranch:{'الرحاب':0}, branches:['الرحاب'] },
    { id:'RANDOM_QTY', barcode:'832', name:'نسخة فيها الكمية', price:40, qtyByBranch:{'الرحاب':12}, branches:['الرحاب'] },
  ];
  const rows = [ row('الاسم الصح من كويك بوكس', '832', 999, 230) ];
  const plan = ctx.planFullReconcile(catalog, rows, MAPPING, 'الرحاب', null);

  assertEq(plan.stats.mergedGroups, 1, '🔴 كود ٨٣٢ اتدمج (نسخة واحدة بس فيها كمية = تلقائي)');
  assertEq(plan.stats.mergedClosed, 2, 'ونسختين اتقفلوا (الأصل ٣، فضلت وحدة)');

  // 🔴🔴🔴🔴⭐ الناجية هي اللي فيها الكمية (RANDOM_QTY)، مش
  // "832__الرحاب" (اللي كان indexInventoryByCode الخام هيختاره
  // بمعزل عن الدمج، رغم إنه مفهوش كمية أصلًا)
  const mergeForKeeper = plan.mergeWrites[0].plan.keeper;
  assertEq(mergeForKeeper.id, 'RANDOM_QTY',
    '🔴🔴🔴🔴⭐ الناجية هي اللي فيها الكمية (مش اللي بمعرّف قياسي بمعزل عن الدمج)');

  // كتابة الاستيراد لازم تستهدف **نفس** الناجية دي (RANDOM_QTY)،
  // مش "832__الرحاب" اللي اتقفلت (merged) واللي الفهرس الخام كان
  // هيختارها لو الدمج مبيتفحصش قبل الاستيراد
  const importWrite = plan.importWrites.filter(function(w){ return w.data.barcode === '832'; })[0];
  assert(importWrite, 'فيه كتابة استيراد لكود ٨٣٢');
  assertEq(importWrite.id, 'RANDOM_QTY',
    '🔴🔴🔴🔴⭐ الاستيراد بيستهدف الناجية بعد الدمج (RANDOM_QTY)، مش نسخة اتقفلت أو نسخة خام مختلفة');
  assertEq(importWrite.data.name, 'الاسم الصح من كويك بوكس', 'والاسم بقى من الملف');
  assertEq(importWrite.data.price, 230, 'والسعر بقى من الملف');
  assert(!('qtyByBranch' in importWrite.data),
    '🔴🔴🔴🔴⭐ مفيش qtyByBranch في كتابة الاستيراد — الكمية (١٢، من الدمج) متتلمسش');
})();

// ============================================================
// ٢) 🔴🔴 كود فيه أكتر من نسخة بكمية — يتساب للمراجعة اليدوية،
//    ومايتكتبش عليه استيراد تلقائي حتى لو موجود في الملف
// ============================================================
(function(){
  const catalog = [
    { id:'b1', barcode:'900', name:'نسخة أ', qtyByBranch:{'الرحاب':5}, branches:['الرحاب'] },
    { id:'b2', barcode:'900', name:'نسخة ب', qtyByBranch:{'الرحاب':7}, branches:['الرحاب'] },
  ];
  const rows = [ row('اسم من الملف', '900', 50, 100) ];
  const plan = ctx.planFullReconcile(catalog, rows, MAPPING, 'الرحاب', null);

  assertEq(plan.stats.mergedGroups, 0, 'مفيش دمج تلقائي — نسختين بكمية = ملتبس');
  assertEq(plan.manualGroups.length, 1, '🔴🔴 كود ٩٠٠ اتساب لمراجعة يدوية');
  const importWrite = plan.importWrites.filter(function(w){ return w.data.barcode === '900'; })[0];
  assert(!importWrite,
    '🔴🔴 مفيش كتابة استيراد تلقائية لكود محتاج مراجعة يدوية — حتى لو موجود في الملف');
  assertEq(plan.skippedManual, ['900'], 'وبيتبلّغ إنه اتستبعد لسبب المراجعة اليدوية');
})();

// ============================================================
// ٣) كود جديد بالكامل (مفيش أي نسخة قديمة) — بييجي عادي من الاستيراد،
//    الكمية من الملف بتتكتب طالما مفيش حاجة قديمة نحميها
// ============================================================
(function(){
  const plan = ctx.planFullReconcile([], [ row('صنف جديد', '999', 15, 80) ], MAPPING, 'الرحاب', null);
  assertEq(plan.stats.mergedGroups, 0, 'مفيش أي دمج — الكتالوج فاضي');
  const w = plan.importWrites[0];
  assertEq(w.data.qtyByBranch, { 'الرحاب': 0 }, 'صنف جديد بالكامل — يبدأ صفر وكمية الملف تتجاهل');
})();

// ============================================================
// ٤) فروع تانية غير المستهدف متتأثرش — نفس قاعدة الدمج العادي
//    (ملحوظة: withQty بتحسب إجمالي كل الفروع، فلازم نسخة واحدة بس
//    عندها أي كمية في أي فرع عشان تبقى حالة تلقائية واضحة)
// ============================================================
(function(){
  const catalog = [
    { id:'c1', barcode:'500', name:'أ', qtyByBranch:{'الرحاب':0}, branches:['الرحاب','مدينتي'] },
    { id:'500__الرحاب', barcode:'500', name:'ب', qtyByBranch:{'الرحاب':4,'مدينتي':30}, branches:['الرحاب'] },
  ];
  const plan = ctx.planFullReconcile(catalog, [ row('اسم جديد', '500', 999, 50) ], MAPPING, 'الرحاب', null);
  assertEq(plan.stats.mergedGroups, 1, 'دمج تلقائي — نسخة واحدة بس عندها كمية (في أي فرع)');
  const keeperUpdate = plan.mergeWrites[0].plan.keeper.update;
  assertEq(keeperUpdate.qtyByBranch, { 'الرحاب': 4, 'مدينتي': 30 },
    '⭐ كمية مدينتي محفوظة بعد الدمج (بتتجمع لكل الفروع، مش تتشال)');
})();

// ============================================================
// ٥) 🧪 فحص سلبي مدمج: لو planFullReconcile استخدمت indexInventoryByCode
//    العادي (قبل الدمج) بدل الفهرس المُحدَّث بعده، الاستيراد كان هيكتب
//    على نسخة ممكن تكون اتقفلت (status:'merged') — نتأكد إن ده مش بيحصل
// ============================================================
(function(){
  const catalog = [
    // نفس المبدأ: النسخة اللي فيها الكمية معرّفها مش القياسي، عشان
    // نتأكد إن الاستيراد بيلحق الفهرس بعد الدمج مش الخام
    { id:'111__الرحاب', barcode:'111', name:'قديم تاني', qtyByBranch:{'الرحاب':0}, branches:['الرحاب'] },
    { id:'d_qty', barcode:'111', name:'قديم', qtyByBranch:{'الرحاب':9}, branches:['الرحاب'] },
  ];
  const plan = ctx.planFullReconcile(catalog, [ row('اسم الملف', '111', 1, 1) ], MAPPING, 'الرحاب', null);
  const closedIds = plan.mergeWrites[0].plan.losers.map(function(l){ return l.id; });
  const importWrite = plan.importWrites.filter(function(w){ return w.data.barcode === '111'; })[0];
  assert(closedIds.indexOf(importWrite.id) === -1,
    '🔴🔴🔴🔴⭐ الاستيراد مش بيكتب على نسخة اتقفلت (merged) — بيستهدف الناجية بس');
  assertEq(importWrite.id, 'd_qty', 'والناجية هي اللي فيها الكمية، مش المعرّف القياسي');
})();
