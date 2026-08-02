// ============================================================
// ⛔ test-outofstock-scan — الصنف المعلّم «نافد» لازم يتباع بالكود
//
// الشكوى (المالك): «بكتب كود بيقول مش متوفر الصنف».
// السبب: `findByBarcode` كانت بتستبعد `status==='outofstock'` تمامًا، فالكود
// الصح يرجّع «لا يوجد صنف بهذا الكود» — رسالة **غلط**، الصنف موجود بس معلّم.
// وده كان بيناقض سياسة المحل المكتوبة في نفس الملف: البيع مسموح حتى لو
// المخزون مايكفيش (الكمية تنزل بالسالب).
//
// القاعدة الصح: العلامة معناها «ميظهرش في الاقتراحات» مش «مش موجود».
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const POS = path.resolve(__dirname, '..', 'pos');
const src = fs.readFileSync(path.join(POS, 'pos-sale.js'), 'utf8');

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

const INV = [
  { id:'P1', name:'خمار سادة', barcode:'11',  status:'active',     branches:['الرحاب'] },
  { id:'P2', name:'ايس فرو',   barcode:'256', status:'outofstock', branches:['الرحاب'] },
  { id:'P3', name:'قطن كويتي', barcode:'832', status:'hidden',     branches:['الرحاب'] },
  { id:'P4', name:'صنف مشترك', barcode:'900', status:'outofstock' },
  { id:'P5', name:'فرع تاني',  barcode:'901', status:'outofstock', branches:['مدينتي'] }
];

const ctx = { console, allInventory: INV, currentBranch: 'الرحاب', window: {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
['stripZeros', 'inMyBranch', 'isBranchOwned', 'findByBarcode'].forEach(n=>{
  const f = extractFn(src, n);
  assert(f.length > 20, 'استخرجنا ' + n);
  vm.runInContext(f, ctx);
});
const find = ctx.findByBarcode;

// (١) العادي شغّال زي ما هو
assert(find('11') && find('11').id === 'P1', 'الصنف العادي بيتلاقى');

// (٢) 🔴 الباج: المعلّم نافد
assertEq(find('256'), null, 'المعلّم نافد لسه مستبعد من البحث العادي (الاقتراحات)');
const m = find('256', { includeOut: true });
assert(!!m && m.id === 'P2',
  '🔴 لكن بالكود بالظبط بيتلاقى — الكاشير ماسك القطعة في إيده، مينفعش «مش موجود»');

// (٣) المخفي يدويًا يفضل مخفي — ده إخفاء مقصود مش نفاد
assertEq(find('832', { includeOut: true }), null,
  '🚫 المخفي (hidden) يفضل مخفي حتى بالكود — قرار إداري مختلف عن النفاد');

// (٤) الصنف المشترك بين الفروع
assert(find('900', { includeOut: true }), 'الصنف المشترك المعلّم نافد بيتلاقى');

// (٥) 🏬 صنف فرع تاني مبيعديش — العلامة مش شيك مفتوح
assertEq(find('901', { includeOut: true }), null,
  '🏬 وصنف فرع تاني مبيعديش حتى مع includeOut');

// (٦) الأصفار البادئة لسه شغّالة مع النافد
assert(find('000256', { includeOut: true }),
  '0️⃣ والأصفار البادئة لسه بتشتغل مع المعلّم نافد');

// (٧) 🧪 سلبي: من غير includeOut المسار القديم بيرجع null — يعني الفرق حقيقي
assertEq(find('256'), null, '🧪 سلبي: المسار القديم لسه بيرجع null (الفرق مش وهمي)');

// (٨) شاشة البيع بتجرب المسارين وبتنبّه
assert(src.indexOf('includeOut: true') >= 0, 'شاشة البيع بتجرب البحث الشامل');
assert(src.indexOf('متعلّم نافد في النظام') >= 0,
  '⚠️ وبتنبّه الكاشير إن الصنف معلّم نافد بدل ما تقول «مش موجود»');
