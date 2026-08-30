// 🧾 v407 — اسم الفرع runtime داخل تصميم البراند المشترك
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(ROOT,'pos','app.js'),'utf8');
const reports=fs.readFileSync(path.join(ROOT,'pos','pos-reports.js'),'utf8');
function extractFn(src, header){
  const i=src.indexOf(header); if(i<0)return null;
  let depth=0, started=false;
  for(let j=src.indexOf('{',i);j<src.length;j++){
    if(src[j]==='{'){depth++;started=true;} else if(src[j]==='}'){depth--;if(started&&depth===0)return src.slice(i,j+1);}
  }
  return null;
}
const fn=extractFn(app,'function receiptBranchDisplayName(');
assert(!!fn,'receiptBranchDisplayName موجودة كدالة مستقلة');
const ctx={_brandOfBranch:b=>String(b||'').toLowerCase().startsWith('glow')?'glow':'echarpe',window:{}}; vm.createContext(ctx);
vm.runInContext(fn,ctx);
const f=ctx.receiptBranchDisplayName;
assertEq(f('echarpe El Rehab'),'echarpe El Rehab','الرحاب تطبع باسم الفرع لا نص التصميم');
assertEq(f('Madinaty'),'echarpe Madinaty','مدينتي تاخد prefix البراند تلقائيا');
assertEq(f('مدينتي'),'echarpe Madinaty','اسم الفرع العربي يتوحّد للفاتورة');
assertEq(f('City Center'),'echarpe City Center','City Center صحيح');
assertEq(f('مكرم عبيد'),'echarpe City Center','فرع مكرم يطبع City Center');
assertEq(f('Glow'),'Glow','Glow لا يتكرر مرتين');
assert(/id:'branchName'.*kind:'auto'/.test(app),'اسم الفرع عنصر auto مش text ثابت مشترك بين الفروع');
assert(/const _branchRaw = d\.branch/.test(app) && /receiptBranchDisplayName\(_branchRaw/.test(app),'buildReceiptHTML يأخذ فرع الفاتورة من data');
assert(/branch:\s*\(typeof currentBranch/.test(app),'الفاتورة الأصلية تحفظ فرع الجهاز وقت البيع في بيانات الطباعة');
assert((reports.match(/branch:\s*s\.branch\s*\|\|\s*''/g)||[]).length>=2,'إعادة الطباعة وإيصال الهدية التاريخي يستخدمان branch الفاتورة الأصلية');
const sw=fs.readFileSync(path.join(ROOT,'pos','sw.js'),'utf8');
assert(/store-apps-shell-v408/.test(sw),'POS cache مرفوع إلى v408');
