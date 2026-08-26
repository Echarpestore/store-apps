'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
const src=fs.readFileSync(path.resolve(__dirname,'..','pos','products.js'),'utf8');
function extractFn(name){const st=src.indexOf('function '+name+'(');if(st<0)return'';const op=src.indexOf('{',st);let d=0;for(let i=op;i<src.length;i++){if(src[i]==='{')d++;else if(src[i]==='}'){d--;if(d===0)return src.slice(st,i+1)}}return''}
function ok(x,m){if(typeof global.assert==='function')return global.assert(!!x,m);if(!x)throw new Error(m);console.log('  ✅ '+m)}
function eq(a,b,m){if(typeof global.assertEq==='function')return global.assertEq(a,b,m);if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(m+' expected '+JSON.stringify(b)+' got '+JSON.stringify(a));console.log('  ✅ '+m)}
const ctx={Object,Array,String,Number,Math}; ctx.branchQty=x=>Number((x.qtyByBranch||{})['Nasr City']||0); vm.createContext(ctx);
for(const n of ['receiveInventoryVisible','receiveCanonicalItems']) vm.runInContext(extractFn(n),ctx);
const items=[
 {id:'old0',barcode:'832',name:'قديم صفر',status:'merged',branches:['(مستبعد)'],qtyByBranch:{'Nasr City':0}},
 {id:'keeper',barcode:'832',name:'الصنف الصح',status:'active',branches:['Nasr City'],qtyByBranch:{'Nasr City':435}},
 {id:'other',barcode:'832',name:'نسخة فرع تاني',status:'active',branches:['Rehab'],qtyByBranch:{Rehab:20}},
 {id:'shared-stale',barcode:'832',name:'قديم مشترك',status:'hidden',qtyByBranch:{'Nasr City':0}},
 {id:'x',barcode:'900',name:'صنف تاني',status:'outofstock',branches:['Nasr City'],qtyByBranch:{'Nasr City':0}}
];
ok(!ctx.receiveInventoryVisible(items[0],'Nasr City'),'merged نفسه مرفوض قبل dedupe');
ok(!ctx.receiveInventoryVisible(items[2],'Nasr City'),'مستند فرع تاني مرفوض قبل dedupe');
ok(ctx.receiveInventoryVisible(items[4],'Nasr City'),'outofstock في نفس الفرع يظل قابل للاستلام');
const can=ctx.receiveCanonicalItems(items,'Nasr City');
const b832=can.filter(x=>x.barcode==='832');
eq(b832.length,1,'بحث الاستلام يرجع نتيجة واحدة فقط لكل باركود');
eq(b832[0].id,'keeper','يختار مستند الفرع الحالي الفعلي صاحب الرصيد 435');
ok(!can.some(x=>x.id==='old0'),'المستند merged لا يظهر في استلام البضاعة');
ok(!can.some(x=>x.id==='other'),'مستند فرع آخر لا يظهر');
ok(can.some(x=>x.id==='x'),'الصنف النافد يظل قابلًا للاستلام وإعادة التنشيط');
ok(src.includes('const candidates = receiveCanonicalItems(allInventory, currentBranch);'),'Enter يستخدم نفس القائمة canonical ولا يرجع لأول duplicate عشوائي');
const sw=fs.readFileSync(path.resolve(__dirname,'..','pos','sw.js'),'utf8'); ok(/store-apps-shell-v\d+/.test(sw),'POS cache version موجود');
console.log('  ✅ test-receive-dedupe كامل');
