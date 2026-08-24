// ============================================================
// 🔁 test-import-dedupe — الاستيراد ميعملش نسخة تانية من صنف موجود
//
// الشكوى (المالك): «ليه كل حاجه ٢» — كود 832 طالع مرتين بأسمين مختلفين
// بعد استيراد ملف QuickBooks.
//
// السبب: الصنف اللي بيتضاف من شاشة المخزون بياخد مفتاح عشوائي
// (`.doc()`/`.add()` في pos-admin.js)، والاستيراد بيكتب بمفتاح
// `الباركود__الفرع` — المفتاحين عمرهم ما يتقابلوا، فكل صنف كان موجود قبل
// الاستيراد بيتسجّل مرة تانية والمخزون بيتقسّم على نسختين: الكاشير بتبيع
// من واحدة والتانية بتفضل بكميتها الأصلية → الجرد غلط.
//
// القاعدة الصح: نفهرس الموجود بالباركود ونكتب على نفس المستند —
// **بشرط** إنه ظاهر لفرعي، لأن كود 271 في فرع ممكن يكون صنف تاني خالص
// في فرع تاني (ده سبب إن المفتاح اتعمل بالفرع من الأساس).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const POS = path.resolve(__dirname, '..', 'pos');
const src = fs.readFileSync(path.join(POS, 'import.js'), 'utf8');

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
['indexInventoryByCode', 'planInventoryWrites'].forEach(function(n){
  const f = extractFn(src, n);
  assert(f.length > 40, 'استخرجنا ' + n + ' من import.js');
  vm.runInContext(f, ctx);
});

const FV = {
  arrayUnion: function(v){ return { __arrayUnion: v }; },
  serverTimestamp: function(){ return { __ts: true }; }
};
const MAPPING = { name:'Item Name', barcode:'Item Number', price:'Regular Price', quantity:'Qty 1' };
function row(name, code, qty, price){
  return { 'Item Name': name, 'Item Number': code, 'Qty 1': qty, 'Regular Price': price || 100 };
}
// نفس اللي بيحصل في الإنتاج: فهرسة الكتالوج ثم تخطيط الكتابة
function importInto(catalog, rows, branch){
  const idx = ctx.indexInventoryByCode(catalog, branch);
  return ctx.planInventoryWrites(rows, MAPPING, branch, idx, FV);
}

// ============================================================
// 1) الفهرسة بتلقط الصنف اليدوي بمفتاحه العشوائي
// ============================================================
(function(){
  const idx = ctx.indexInventoryByCode([
    { id:'aB9xQ2', barcode:'832', name:'قطن تايلاندي كويتي لينن', branches:['الرحاب'] }
  ], 'الرحاب');
  assertEq(idx['832'] && idx['832'].id, 'aB9xQ2', 'الفهرس بيلقط الصنف اليدوي بمفتاحه العشوائي');
  assertEq(idx['832'] && idx['832'].count, 1, 'مفيش تكرار');
})();

// ============================================================
// 2) 🔴 الباج الأصلي: استيراد على كتالوج فيه الصنف = تحديث مش نسخة تانية
// ============================================================
(function(){
  const catalog = [
    { id:'aB9xQ2', barcode:'832', name:'قطن تايلاندي كويتي لينن', branches:['الرحاب'], qtyByBranch:{ 'الرحاب': 7 } }
  ];
  const out = importInto(catalog, [ row('قطن تايلاندي كويت ليدي', '832', 12) ], 'الرحاب');
  assertEq(out.writes.length, 1, 'كتابة واحدة بس');
  assertEq(out.writes[0].id, 'aB9xQ2', '🔁 الاستيراد بيكتب على نفس المستند الموجود');
  assert(out.writes[0].id !== '832__الرحاب', '⛔ ماعملش مستند تاني بمفتاح الباركود+الفرع');
  assertEq(out.stats.updated, 1, 'محسوبة كتحديث');
  assertEq(out.stats.created, 0, 'مفيش صنف جديد اتعمل');
})();

// ============================================================
// 3) صنف جديد فعلًا = مستند جديد بالباركود+الفرع
// ============================================================
(function(){
  const out = importInto([], [ row('خمار سادة', '900', 5) ], 'الرحاب');
  assertEq(out.writes[0].id, '900__الرحاب', 'الصنف الجديد بياخد مفتاح الباركود+الفرع');
  assertEq(out.stats.created, 1, 'محسوب كصنف جديد');
  assertEq(out.stats.updated, 0, 'مش تحديث');
})();

// ============================================================
// 4) ⚠️ الأهم: كود موجود في **فرع تاني بس** = صنف مختلف — ممنوع الكتابة عليه
// ============================================================
(function(){
  const catalog = [
    { id:'271__مدينتي', barcode:'271', name:'صنف مدينتي', branches:['مدينتي'], qtyByBranch:{ 'مدينتي': 4 } }
  ];
  const out = importInto(catalog, [ row('صنف الرحاب', '271', 9) ], 'الرحاب');
  assertEq(out.writes[0].id, '271__الرحاب', '⛔ ماكتبش على صنف فرع تاني بنفس الكود');
  assertEq(out.stats.created, 1, 'اتعمل صنف خاص بفرعي');
})();

// ============================================================
// 5) الصنف المشترك (من غير branches) بيتحدّث مش بيتكرر
// ============================================================
(function(){
  const out = importInto([{ id:'SHARED1', barcode:'500', name:'صنف مشترك' }],
    [ row('صنف مشترك', '500', 3) ], 'الرحاب');
  assertEq(out.writes[0].id, 'SHARED1', 'الصنف المشترك بيتحدّث في مكانه');
})();

// ============================================================
// 6) الأولوية: لو فيه مستند استيراد قديم لنفس الفرع، هو الهدف الثابت
// ============================================================
(function(){
  const catalog = [
    { id:'SHARED9',     barcode:'520', name:'مشترك' },
    { id:'520__الرحاب', barcode:'520', name:'استيراد قديم', branches:['الرحاب'] }
  ];
  const out = importInto(catalog, [ row('استيراد جديد', '520', 4) ], 'الرحاب');
  assertEq(out.writes[0].id, '520__الرحاب', 'بيثبت على هدف الاستيراد السابق');
  assertEq(out.stats.dupCodes, ['520'], 'وبيبلّغ إن الكود متكرر');
})();

// ============================================================
// 7) branches بـarrayUnion مش استبدال — فروع تانية مبتتشالش
// ============================================================
(function(){
  const out = importInto([{ id:'MULTI1', barcode:'600', name:'في فرعين', branches:['الرحاب','مدينتي'] }],
    [ row('في فرعين', '600', 2) ], 'الرحاب');
  const b = out.writes[0].data.branches;
  assert(b && b.__arrayUnion === 'الرحاب', 'branches اتكتبت بـarrayUnion');
  assert(!Array.isArray(b), '⛔ مش مصفوفة ثابتة — الاستبدال كان بيشيل باقي الفروع');
})();

// ============================================================
// 8) 🔴🔴🔴🔴⭐ قرار المالك: الكمية القديمة **بتفضل زي ما هي** —
//    مفيش qtyByBranch في الكتابة خالص لصنف موجود (merge:true بيحميها)
// ============================================================
(function(){
  const out = importInto([{ id:'X1', barcode:'700', branches:['الرحاب','مدينتي'], qtyByBranch:{ 'الرحاب':1, 'مدينتي':50 } }],
    [ row('صنف', '700', 8) ], 'الرحاب');
  assert(!('qtyByBranch' in out.writes[0].data),
    '🔴🔴🔴🔴⭐ مفيش qtyByBranch في كتابة صنف موجود — الكمية القديمة (١) بتفضل زي ما هي، رقم الملف (٨) يتجاهل');
})();

// ============================================================
// 8ب) 🔴 صنف جديد فعلًا — يبدأ صفر وكمية الملف تتجاهل
// ============================================================
(function(){
  const out = importInto([], [ row('صنف جديد', '701', 8) ], 'الرحاب');
  assertEq(out.writes[0].data.qtyByBranch, { 'الرحاب': 0 },
    '⭐ صنف جديد بالكامل — يبدأ صفر لأن كمية الملف لا تدخل المخزون');
})();

// ============================================================
// 9) المكرر الموجود من قبل بيتبلّغ عنه ومبيتضاعفش تالت مرة
// ============================================================
(function(){
  const catalog = [
    { id:'aB9xQ2',      barcode:'832', name:'كويتي لينن', branches:['الرحاب'] },
    { id:'832__الرحاب', barcode:'832', name:'كويت ليدي',  branches:['الرحاب'] }
  ];
  const out = importInto(catalog, [ row('كويت ليدي', '832', 3) ], 'الرحاب');
  assertEq(out.writes.length, 1, 'كتابة واحدة مش اتنين');
  assertEq(out.stats.dupCodes, ['832'], '⚠️ بيبلّغ إن الكود متكرر عشان الأدمن يدمج');
  assertEq(out.stats.created, 0, 'ومعملش تالت');
})();

// ============================================================
// 10) الصنف المدموج (status:'merged') مش هدف للكتابة
// ============================================================
(function(){
  const out = importInto([{ id:'OLD1', barcode:'810', name:'اتدمج', status:'merged', branches:['الرحاب'] }],
    [ row('صنف', '810', 4) ], 'الرحاب');
  assertEq(out.writes[0].id, '810__الرحاب', 'المدموج ما اتكتبش عليه تاني');
})();

// ============================================================
// 11) صفين بنفس الكود في نفس الملف = مستند واحد
// ============================================================
(function(){
  const out = importInto([], [ row('صنف أ', '901', 2), row('صنف أ مكرر', '901', 3) ], 'الرحاب');
  assertEq(out.writes.map(function(w){ return w.id; }), ['901__الرحاب','901__الرحاب'], 'الصفين على نفس المستند');
  assertEq(out.stats.created, 1, 'محسوب صنف جديد واحد');
})();

// ============================================================
// 12) صف من غير اسم بيتخطّى · واللي من غير باركود بياخد مفتاح تلقائي
// ============================================================
(function(){
  const out = importInto([], [
    row('', '902', 1),
    { 'Item Name':'من غير كود', 'Item Number':'', 'Qty 1':2, 'Regular Price':50 }
  ], 'الرحاب');
  assertEq(out.stats.failed, 1, 'الصف الفاضي اتخطّى');
  assertEq(out.stats.done, 1, 'صف واحد بس اتكتب');
  assertEq(out.writes[0].id, null, 'اللي من غير باركود بياخد مفتاح تلقائي');
})();

// ============================================================
// 13) فهرس فاضي (فشل قراءة الكتالوج) = رجوع آمن للسلوك القديم
// ============================================================
(function(){
  const out = ctx.planInventoryWrites([ row('صنف', '903', 1) ], MAPPING, 'الرحاب', {}, FV);
  assertEq(out.stats.done, 1, 'الاستيراد بيكمّل رغم فشل الفهرسة');
  assertEq(out.writes[0].id, '903__الرحاب', 'ورجع للمفتاح القديم');
})();

// ============================================================
// 14) الكمية السالبة بتبقى صفر (سلوك قديم لازم يفضل)
// ============================================================
(function(){
  const out = importInto([], [ row('صنف', '904', -5) ], 'الرحاب');
  assertEq(out.writes[0].data.qtyByBranch['الرحاب'], 0, 'السالب اتحوّل صفر');
})();

// ============================================================
// 15) الدالة الحقيقية بتستعمل المخطِّط (مش نسخة تانية من المنطق)
// ============================================================
(function(){
  const wf = extractFn(src, 'writeInventoryRows');
  assert(wf.length > 100, 'استخرجنا writeInventoryRows');
  assert(wf.indexOf('planInventoryWrites(') > 0, 'writeInventoryRows بتنادي planInventoryWrites');
  assert(wf.indexOf('indexInventoryByCode(') > 0, 'وبتفهرس الكتالوج قبل الكتابة');
  assert(/merge:\s*true/.test(wf), 'والكتابة بـmerge');
})();
