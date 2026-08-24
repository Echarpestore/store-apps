// Final import policy: update/add only; preserve system quantity; no missing-item removal.
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
const src=fs.readFileSync(path.resolve(__dirname,'..','pos','import.js'),'utf8');
function extractFn(name){const st=src.indexOf('function '+name+'(');if(st<0)return'';const op=src.indexOf('{',st);let d=0;for(let i=op;i<src.length;i++){if(src[i]==='{')d++;else if(src[i]==='}'){d--;if(d===0)return src.slice(st,i+1)}}return''}
function ok(x,m){if(typeof global.assert==='function')return global.assert(!!x,m);if(!x)throw new Error(m);console.log('  ✅ '+m)}
function eq(a,b,m){if(typeof global.assertEq==='function')return global.assertEq(a,b,m);if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(m+' expected '+JSON.stringify(b)+' got '+JSON.stringify(a));console.log('  ✅ '+m)}
const ctx={Object,Array,String,Math,parseInt,parseFloat,Date};vm.createContext(ctx);vm.runInContext(extractFn('planInventoryWrites'),ctx);
const mapping={name:'Name',barcode:'Code',price:'Price',quantity:'Qty'};
const FV={arrayUnion:x=>['AU',x],serverTimestamp:()=>123};
(function(){
 const idx={'100':{id:'old100',count:1}};
 const p=ctx.planInventoryWrites([{Name:'Updated',Code:'100',Price:'90',Qty:'999'},{Name:'New',Code:'200',Price:'50',Qty:'888'}],mapping,'الرحاب',idx,FV);
 const old=p.writes.find(x=>x.id==='old100'), neu=p.writes.find(x=>x.id==='200__الرحاب');
 ok(old && !Object.prototype.hasOwnProperty.call(old.data,'qtyByBranch'),'الموجود لا يكتب qtyByBranch وبالتالي يحتفظ بكمية السيستم');
 eq(neu.data.qtyByBranch['الرحاب'],0,'الجديد يبدأ صفر مهما كمية الملف');
})();
ok(!src.includes('id="impZeroMissing"'),'اختيار حذف/تصفير غير الموجود اتشال من الواجهة');
ok(!src.includes('const wantZero ='),'مسار تنفيذ حذف/تصفير غير الموجود اتشال من runImport');
ok(src.includes('أي صنف موجود في الفرع ومش موجود في الملف يفضل زي ما هو'),'الواجهة تشرح السياسة الجديدة بوضوح');
ok(src.includes("untouchedExisting:0"),'الخطة تتبع الأصناف الموجودة التي تُترك كما هي');
ok(/store-apps-shell-v336/.test(fs.readFileSync(path.resolve(__dirname,'..','pos','sw.js'),'utf8')),'POS cache v336');
console.log('  ✅ test-import-final-policy كامل');
