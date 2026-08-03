// ============================================================
// 🔗 test-dup-merge — دمج الأصناف المكررة (نفس الباركود)
//
// التكرار اتعمل إزاي: الصنف اليدوي مفتاحه عشوائي والاستيراد كان بيكتب
// بمفتاح `الباركود__الفرع` → نسختين لنفس الصنف، والمخزون اتقسّم عليهم.
// الأداة دي بتجمع الكميات في نسخة واحدة وتقفل الباقي (من غير حذف).
//
// القواعد اللي لازم تفضل صح:
//  • كود موجود في فرعين مختلفين ≠ تكرار (ممكن يكون صنفين مختلفين خالص)
//  • الكميات بتتجمع لكل فرع على حدة — مفيش كمية بتضيع
//  • النسخة المقفولة بتختفي من كل الفروع من غير ما تتمسح
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const POS = path.resolve(__dirname, '..', 'pos');
const src = fs.readFileSync(path.join(POS, 'pos-admin.js'), 'utf8');

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

const ctx = { console: { warn(){}, log(){} }, Object: Object, Array: Array, String: String, Number: Number, Date: Date };
ctx.globalThis = ctx;
vm.createContext(ctx);
['findDupGroups', 'planDupMerge'].forEach(function(n){
  const f = extractFn(src, n);
  assert(f.length > 40, 'استخرجنا ' + n + ' من pos-admin.js');
  vm.runInContext(f, ctx);
});

// ============================================================
// 1) الحالة الحقيقية: كود 832 مرتين في نفس الفرع
// ============================================================
(function(){
  const inv = [
    { id:'aB9xQ2',      barcode:'832', name:'قطن تايلاندي كويتي لينن', branches:['الرحاب'], qtyByBranch:{ 'الرحاب': 7 } },
    { id:'832__الرحاب', barcode:'832', name:'قطن تايلاندي كويت ليدي',  branches:['الرحاب'], qtyByBranch:{ 'الرحاب': 12 } }
  ];
  const g = ctx.findDupGroups(inv, 'الرحاب');
  assertEq(g.length, 1, 'لقى مجموعة مكررة واحدة');
  assertEq(g[0].code, '832', 'الكود 832');
  assertEq(g[0].items.length, 2, 'نسختين');
})();

// ============================================================
// 2) ⚠️ نفس الكود في فرعين = مش تكرار (ممنوع الدمج)
// ============================================================
(function(){
  const inv = [
    { id:'271__الرحاب', barcode:'271', name:'صنف الرحاب', branches:['الرحاب'] },
    { id:'271__مدينتي', barcode:'271', name:'صنف مدينتي', branches:['مدينتي'] }
  ];
  assertEq(ctx.findDupGroups(inv, 'الرحاب').length, 0, '⛔ صنف فرع تاني مش تكرار');
  assertEq(ctx.findDupGroups(inv, 'مدينتي').length, 0, 'ولا من ناحية الفرع التاني');
})();

// ============================================================
// 3) الصنف المشترك (من غير branches) بيتحسب مع فرعي
// ============================================================
(function(){
  const inv = [
    { id:'S1', barcode:'500', name:'مشترك' },
    { id:'500__الرحاب', barcode:'500', name:'من الاستيراد', branches:['الرحاب'] }
  ];
  assertEq(ctx.findDupGroups(inv, 'الرحاب').length, 1, 'المشترك + بتاع فرعي = تكرار');
})();

// ============================================================
// 4) المدموج قبل كده مش بيتحسب تكرار تاني
// ============================================================
(function(){
  const inv = [
    { id:'A', barcode:'600', name:'الأصلي', branches:['الرحاب'] },
    { id:'B', barcode:'600', name:'المقفول', status:'merged', branches:['(مدموج)'] }
  ];
  assertEq(ctx.findDupGroups(inv, 'الرحاب').length, 0, 'المقفول مش بيرجع في القايمة');
})();

// ============================================================
// 5) 💰 الدمج بيجمع الكميات — مفيش كمية بتضيع
// ============================================================
(function(){
  const items = [
    { id:'A', barcode:'832', name:'الأصلي',  branches:['الرحاب'], qtyByBranch:{ 'الرحاب': 7 } },
    { id:'B', barcode:'832', name:'الاستيراد', branches:['الرحاب'], qtyByBranch:{ 'الرحاب': 12 } }
  ];
  const plan = ctx.planDupMerge(items, 'A');
  assertEq(plan.keeper.id, 'A', 'النسخة المختارة هي اللي بتفضل');
  assertEq(plan.keeper.update.qtyByBranch, { 'الرحاب': 19 }, '7 + 12 = 19 — الكميات اتجمعت');
  assertEq(plan.losers.length, 1, 'نسخة واحدة اتقفلت');
  assertEq(plan.losers[0].id, 'B', 'وهي اللي مش مختارة');
})();

// ============================================================
// 6) كميات كل فرع بتتجمع لوحدها (مفيش خلط بين الفروع)
// ============================================================
(function(){
  const items = [
    { id:'A', barcode:'900', branches:['الرحاب','مدينتي'], qtyByBranch:{ 'الرحاب': 3, 'مدينتي': 10 } },
    { id:'B', barcode:'900', branches:['الرحاب'],          qtyByBranch:{ 'الرحاب': 4 } }
  ];
  const plan = ctx.planDupMerge(items, 'A');
  assertEq(plan.keeper.update.qtyByBranch, { 'الرحاب': 7, 'مدينتي': 10 }, 'كل فرع بكميته');
})();

// ============================================================
// 7) النسخة المقفولة: كمياتها صفر + مخفية من كل الفروع + مش متمسوحة
// ============================================================
(function(){
  const items = [
    { id:'A', barcode:'832', branches:['الرحاب'], qtyByBranch:{ 'الرحاب': 7 } },
    { id:'B', barcode:'832', branches:['الرحاب'], qtyByBranch:{ 'الرحاب': 12, 'مدينتي': 5 } }
  ];
  const plan = ctx.planDupMerge(items, 'A');
  const L = plan.losers[0].update;
  assertEq(L.status, 'merged', 'اتعلّمت مدموجة');
  assertEq(L.mergedInto, 'A', 'ومربوطة بالنسخة الباقية');
  assertEq(L.qtyByBranch, { 'الرحاب': 0, 'مدينتي': 0 }, '💰 كمياتها اتصفّرت — مفيش ازدواج');
  assertEq(L.branches, ['(مدموج)'], 'مخفية من كل الفروع');
  assert(!('deleted' in L), 'مش بتتمسح — قابلة للمراجعة');
})();

// ============================================================
// 8) الكمية الكلية قبل = بعد (الجرد ميتغيرش بالدمج)
// ============================================================
(function(){
  const items = [
    { id:'A', barcode:'832', branches:['الرحاب'], qtyByBranch:{ 'الرحاب': 7 } },
    { id:'B', barcode:'832', branches:['الرحاب'], qtyByBranch:{ 'الرحاب': 12 } },
    { id:'C', barcode:'832', branches:['الرحاب'], qtyByBranch:{ 'الرحاب': 1 } }
  ];
  const before = 7 + 12 + 1;
  const plan = ctx.planDupMerge(items, 'B');
  const after = (plan.keeper.update.qtyByBranch['الرحاب'] || 0)
    + plan.losers.reduce(function(s, l){ return s + (l.update.qtyByBranch['الرحاب'] || 0); }, 0);
  assertEq(after, before, 'إجمالي المخزون زي ما هو بعد الدمج');
  assertEq(plan.losers.length, 2, 'تلات نسخ → واحدة باقية واتنين مقفولين');
})();

// ============================================================
// 9) اختيار النسخة بيغيّر اللي بيفضل فعلًا
// ============================================================
(function(){
  const items = [
    { id:'A', barcode:'832', name:'الاسم القديم', price:100, branches:['الرحاب'], qtyByBranch:{ 'الرحاب': 7 } },
    { id:'B', barcode:'832', name:'اسم QuickBooks', price:120, branches:['الرحاب'], qtyByBranch:{ 'الرحاب': 12 } }
  ];
  assertEq(ctx.planDupMerge(items, 'B').keeper.id, 'B', 'لما أختار B هو اللي يفضل');
  assertEq(ctx.planDupMerge(items, 'B').losers[0].id, 'A', 'وA هي اللي تتقفل');
  // الاسم والسعر بتوع المختارة مش بيتغيروا (مفيش تحديث ليهم في الخطة)
  const upd = ctx.planDupMerge(items, 'B').keeper.update;
  assert(!('name' in upd), 'اسم النسخة المختارة زي ما هو');
  assert(!('price' in upd), 'وسعرها زي ما هو');
})();

// ============================================================
// 10) النسخة المختارة ناقصة اسم/سعر → بتاخدهم من التانية بدل ما يضيعوا
// ============================================================
(function(){
  const items = [
    { id:'A', barcode:'832', name:'', price:0, branches:['الرحاب'], qtyByBranch:{ 'الرحاب': 7 } },
    { id:'B', barcode:'832', name:'قطن كويتي', price:150, branches:['الرحاب'], qtyByBranch:{ 'الرحاب': 2 } }
  ];
  const upd = ctx.planDupMerge(items, 'A').keeper.update;
  assertEq(upd.name, 'قطن كويتي', 'الاسم الناقص اتعوّض');
  assertEq(upd.price, 150, 'والسعر كمان');
})();

// ============================================================
// 11) الفروع بتتوحّد — الصنف ميختفيش من فرع كان فيه
// ============================================================
(function(){
  const items = [
    { id:'A', barcode:'832', branches:['الرحاب'],  qtyByBranch:{ 'الرحاب': 1 } },
    { id:'B', barcode:'832', branches:['مدينتي'],  qtyByBranch:{ 'مدينتي': 2 } }
  ];
  const upd = ctx.planDupMerge(items, 'A').keeper.update;
  assertEq((upd.branches || []).sort(), ['الرحاب','مدينتي'].sort(), 'الفرعين اتجمعوا');
  assert((upd.branches || []).indexOf('(مدموج)') < 0, 'وعلامة المدموج مش بتتسرّب للنسخة الباقية');
})();

// ============================================================
// 12) مفتاح مش موجود في المجموعة = بيرجع لأول عنصر بدل ما يقع
// ============================================================
(function(){
  const items = [{ id:'A', barcode:'832', qtyByBranch:{ 'الرحاب': 1 } }];
  const plan = ctx.planDupMerge(items, 'مش-موجود');
  assertEq(plan.keeper.id, 'A', 'رجع لأول نسخة');
  assertEq(plan.losers.length, 0, 'ومفيش حاجة اتقفلت');
  assertEq(ctx.planDupMerge([], 'A'), null, 'مجموعة فاضية بترجّع null');
})();

// ============================================================
// 13) الشاشة والدمج متوصّلين على window (القاعدة الذهبية)
// ============================================================
(function(){
  ['openDupBarcodeCheck', 'mergeDupGroup', 'findDupGroups', 'planDupMerge'].forEach(function(n){
    assert(new RegExp('window\\.' + n + '\\s*=').test(src), n + ' متعرّضة على window');
  });
  const mf = extractFn(src, 'mergeDupGroup');
  assert(/hasPerm\('canEditInventory'\)/.test(mf), 'الدمج ورا صلاحية تعديل المخزون');
  assert(/askConfirm\(/.test(mf), 'وفيه تأكيد قبل التنفيذ');
  assert(!/\bprompt\(/.test(mf) && !/\bconfirm\(/.test(mf), '⛔ مفيش prompt/confirm — Electron مش بيدعمهم');
  assert(/_logActivity\(/.test(mf), 'والدمج بيتسجّل في سجل النشاط');
})();
