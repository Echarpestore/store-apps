// ============================================================
// ♻️ Branch catalog replace — الملف هو الكتالوج، السيستم هو الكمية
// سياسة 24 أغسطس 2026
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.resolve(__dirname, '..', 'pos', 'import.js'), 'utf8');
function extractFn(s, name){
  const st = s.indexOf('function ' + name + '(');
  if(st < 0) return '';
  const op = s.indexOf('{', st); let d = 0;
  for(let i=op;i<s.length;i++){
    if(s[i]==='{') d++;
    else if(s[i]==='}'){ d--; if(d===0) return s.slice(st,i+1); }
  }
  return '';
}
function ok(cond,msg){
  if(typeof global.assert === 'function') return global.assert(!!cond,msg);
  if(!cond) throw new Error(msg); console.log('  ✅ ' + msg);
}
function eq(a,b,msg){
  if(typeof global.assertEq === 'function') return global.assertEq(a,b,msg);
  const A=JSON.stringify(a), B=JSON.stringify(b);
  if(A!==B) throw new Error(msg+' — expected '+B+' got '+A);
  console.log('  ✅ ' + msg);
}
const ctx={ console:{log(){},warn(){}}, Object,Array,String,Math,parseInt,parseFloat,Date };
ctx.globalThis=ctx;
ctx.IMPORT_EXCLUDED_TAG='(مستبعد)';
vm.createContext(ctx);
['_branchReplaceVisible','_branchReplaceKnownBranches','_branchReplaceSafeTarget','_branchReplaceDocId','_branchReplaceCleanup','planBranchCatalogReplace'].forEach(n=>{
  const f=extractFn(src,n); ok(f.length>40,'استخرجنا '+n); vm.runInContext(f,ctx);
});

const M={name:'Name',barcode:'Code',price:'Price',quantity:'Qty',cost:'Cost',supplier:'Supplier',minStock:'Min',department:'Dept'};
const row=(name,code,price,qty)=>({Name:name,Code:code,Price:price,Qty:qty,Cost:10,Supplier:'S',Min:2,Dept:'D'});
const BR=['الرحاب','مدينتي','مدينة نصر'];

// 1) نفس الكود متكرر: الكمية الحالية في الفرع تتجمع، وكمية الملف تتجاهل.
(function(){
  const items=[
    {id:'a',barcode:'100',name:'قديم1',branches:['الرحاب'],qtyByBranch:{'الرحاب':3}},
    {id:'b',barcode:'100',name:'قديم2',branches:['الرحاب'],qtyByBranch:{'الرحاب':7}}
  ];
  const p=ctx.planBranchCatalogReplace(items,[row('اسم الملف','100',250,999)],M,'الرحاب',BR);
  ok(p.ok,'الخطة صالحة');
  eq(p.keeperWrites.length,1,'نسخة واحدة فقط للكود بعد الاستبدال');
  eq(p.keeperWrites[0].data.qtyByBranch['الرحاب'],10,'الكمية = 3+7 من السيستم الحالي');
  ok(p.keeperWrites[0].data.qtyByBranch['الرحاب']!==999,'كمية الملف 999 اتتجاهلت');
  eq(p.keeperWrites[0].data.name,'اسم الملف','الاسم من الملف');
  eq(p.keeperWrites[0].data.price,250,'السعر من الملف');
  eq(p.cleanupWrites.length,1,'النسخة المكررة التانية تتقفل');
})();

// 2) صنف جديد: يبدأ صفر مهما الملف قال.
(function(){
  const p=ctx.planBranchCatalogReplace([], [row('جديد','200',100,55)], M, 'الرحاب', BR);
  eq(p.keeperWrites[0].data.qtyByBranch['الرحاب'],0,'الصنف الجديد يبدأ صفر');
})();

// 3) صنف مش في الملف: يختفي من الفرع الحالي.
(function(){
  const items=[{id:'x',barcode:'300',branches:['الرحاب'],qtyByBranch:{'الرحاب':8}}];
  const p=ctx.planBranchCatalogReplace(items, [row('غيره','301',100,1)], M, 'الرحاب', BR);
  const c=p.cleanupWrites.find(x=>x.id==='x');
  ok(!!c,'الصنف غير الموجود في الملف له cleanup');
  eq(c.data.qtyByBranch['الرحاب'],0,'كمية الفرع الحالي اتصفرت');
  eq(c.data.branches,['(مستبعد)'],'اختفى من الفرع');
})();

// 4) صنف مشترك مع فرع تاني: لا الاسم ولا السعر ولا كمية الفرع التاني تتغير.
(function(){
  const shared={id:'shared',barcode:'400',name:'اسم مدينتي',price:77,branches:['الرحاب','مدينتي'],qtyByBranch:{'الرحاب':4,'مدينتي':30}};
  const p=ctx.planBranchCatalogReplace([shared],[row('اسم الرحاب الجديد','400',200,999)],M,'الرحاب',BR);
  const k=p.keeperWrites[0];
  ok(k.id!=='shared','ما بنكتبش اسم/سعر الملف على مستند مشترك');
  eq(k.data.qtyByBranch['الرحاب'],4,'كمية الرحاب محفوظة في النسخة الجديدة');
  const c=p.cleanupWrites.find(x=>x.id==='shared');
  eq(c.data.branches,['مدينتي'],'المستند القديم فضل لمدينتي فقط');
  eq(c.data.qtyByBranch['مدينتي'],30,'كمية مدينتي محفوظة حرفيًا');
  eq(shared.name,'اسم مدينتي','الخطة ما عدلتش بيانات المصدر في الذاكرة');
})();

// 5) نفس الباركود موجود في فرع تاني فقط: ممنوع لمسه.
(function(){
  const other={id:'500__مدينتي',barcode:'500',name:'مدينتي',price:90,branches:['مدينتي'],qtyByBranch:{'مدينتي':6}};
  const p=ctx.planBranchCatalogReplace([other],[row('الرحاب','500',120,500)],M,'الرحاب',BR);
  ok(p.keeperWrites[0].id!=='500__مدينتي','عمل نسخة للرحاب بدل الكتابة على مدينتي');
  ok(!p.cleanupWrites.some(x=>x.id==='500__مدينتي'),'مستند مدينتي لم يدخل cleanup أصلًا');
  eq(other.qtyByBranch['مدينتي'],6,'كمية مدينتي لم تتغير');
})();

// 6) صنف متعدد الفروع ومش في الملف: يتشال من الرحاب فقط ويظل في مدينتي.
(function(){
  const item={id:'m',barcode:'600',branches:['الرحاب','مدينتي'],qtyByBranch:{'الرحاب':9,'مدينتي':11}};
  const p=ctx.planBranchCatalogReplace([item],[],M,'الرحاب',BR);
  const c=p.cleanupWrites[0];
  eq(c.data.branches,['مدينتي'],'غير الموجود في الملف اتشال من الرحاب فقط');
  eq(c.data.qtyByBranch['مدينتي'],11,'كمية مدينتي كما هي');
  eq(c.data.qtyByBranch['الرحاب'],0,'كمية الرحاب فقط اتصفرت');
})();

// 7) صنف مشترك من غير branches: يتحول لباقي الفروع المعروفة — مش يختفي عليهم.
(function(){
  const item={id:'global',barcode:'700',qtyByBranch:{'الرحاب':2,'مدينتي':5}};
  const p=ctx.planBranchCatalogReplace([item],[],M,'الرحاب',BR);
  const c=p.cleanupWrites[0];
  ok(c.data.branches.includes('مدينتي') && c.data.branches.includes('مدينة نصر'),'المشترك فضل ظاهر لباقي الفروع المعروفة');
  eq(c.data.qtyByBranch['مدينتي'],5,'كمية الفرع الآخر محفوظة');
})();

// 8) الملف نفسه فيه نفس الباركود مرتين: نقف بدل ما نخمن.
(function(){
  const p=ctx.planBranchCatalogReplace([], [row('أ','800',1,1),row('ب','800',2,2)], M, 'الرحاب', BR);
  ok(!p.ok,'الملف المكرر لا ينفذ');
  eq(p.duplicateFileCodes,['800'],'بيحدد الكود المكرر');
})();

// 9) الباركود إلزامي في Full Replace.
(function(){
  const m=Object.assign({},M,{barcode:''});
  const p=ctx.planBranchCatalogReplace([], [row('أ','900',1,1)], m, 'الرحاب', BR);
  ok(!p.ok,'الاستبدال الكامل يرفض من غير عمود باركود');
})();

// 10) عنصر بلا باركود في السيستم وغير موجود في الملف يتشال من الفرع فقط.
(function(){
  const item={id:'nocode',name:'قديم بلا كود',branches:['الرحاب'],qtyByBranch:{'الرحاب':3}};
  const p=ctx.planBranchCatalogReplace([item], [row('موجود','901',10,1)], M, 'الرحاب', BR);
  ok(p.cleanupWrites.some(x=>x.id==='nocode'),'العنصر بلا كود القديم بيتشال لأنه مش في الملف');
})();

// 11) العنصر المستبعد سابقًا يرجع لنفس الـID بدل ما نعمل duplicate جديد.
(function(){
  const old={id:'910__الرحاب',barcode:'910',status:'import_excluded',excludedByImportBranch:'الرحاب',branches:['(مستبعد)'],qtyByBranch:{'الرحاب':0}};
  const p=ctx.planBranchCatalogReplace([old],[row('رجع','910',44,99)],M,'الرحاب',BR);
  eq(p.keeperWrites[0].id,'910__الرحاب','إحياء نفس مستند الاستيراد السابق');
  eq(p.keeperWrites[0].data.qtyByBranch['الرحاب'],0,'ويرجع بكمية السيستم الحالية (صفر) لا كمية الملف');
})();

// 12) واجهة التنفيذ تعيد قراءة Firestore وقت التنفيذ، مش تعتمد على allInventory فقط.
(function(){
  const f=extractFn(src,'runBranchCatalogReplace');
  ok(/collection\(TEST_INVENTORY\)\.get\(\)/.test(f),'التنفيذ يقرأ أحدث مخزون من Firestore قبل الكتابة');
})();


// 13) صف ناقص اسم/باركود يوقف Full Replace بدل ما يختفي بصمت.
(function(){
  const bad={Name:'بدون كود',Code:'',Price:10,Qty:1};
  const p=ctx.planBranchCatalogReplace([], [bad], M, 'الرحاب', BR);
  ok(!p.ok,'الصف الناقص يوقف الاستبدال الكامل');
  ok(p.errors.some(x=>String(x).includes('ناقص اسم أو باركود')),'رسالة الخطأ واضحة');
})();

console.log('  ✅ test-branch-catalog-replace كامل');
