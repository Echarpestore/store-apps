// 💳 v407 — paymob_stuck القديم يتصالح مع sale_saved لنفس السلة
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(ROOT,'Office','office.js'),'utf8');
function extractFn(name){
 const head='function '+name+'('; const i=src.indexOf(head); if(i<0)return null;
 let d=0,st=false; for(let j=src.indexOf('{',i);j<src.length;j++){ if(src[j]==='{'){d++;st=true;} else if(src[j]==='}'){d--;if(st&&d===0)return src.slice(i,j+1);} } return null;
}
const linkSrc=extractFn('ofActLinkInvoices'), intelSrc=extractFn('ofActIntelligence');
assert(!!linkSrc&&!!intelSrc,'دوال ربط الفاتورة وذكاء النشاط موجودة');
const ctx={window:{}, esc:x=>String(x||''), ofMoney:x=>String(x||0)}; vm.createContext(ctx); vm.runInContext(linkSrc+'\n'+intelSrc,ctx);
const rows=[
 {type:'paymob_stuck',sid:'S1',reason:'الحفظ التلقائي اتوقف: المدفوعات ناقصة — مسجّل 515.00 من 1385.00'},
 {type:'sale_saved',sid:'S1',invoiceCode:'FTRH-1',total:1385}
];
ctx.ofActLinkInvoices(rows);
assertEq(rows[0]._linkedInvoice,'FTRH-1','الحدث القديم يرتبط بالفاتورة النهائية');
assertEq(rows[0]._resolvedBySale,true,'paymob_stuck يتعلم إن نفس السلة انتهت بنجاح');
const info=ctx.ofActIntelligence(rows[0]);
assertEq(info.level,'normal','Split payment المكتمل لا يفضل إنذار محتاج إجراء');
const open=ctx.ofActIntelligence({type:'paymob_stuck',sid:'S2',reason:'الدفع اتقبل والحفظ ماكملش'});
assertEq(open.level,'action','التعليق الحقيقي من غير sale_saved يفضل محتاج إجراء');
const html=fs.readFileSync(path.join(ROOT,'Office','index.html'),'utf8');
const sw=fs.readFileSync(path.join(ROOT,'Office','sw.js'),'utf8');
assert(/office\.js\?v=74/.test(html),'Office يحمل office.js v74');
assert(/echarpe-office-v64/.test(sw),'Office cache مرفوع v64');
