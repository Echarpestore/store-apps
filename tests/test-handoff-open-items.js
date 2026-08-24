const fs=require('fs'),assert=require('assert');
const imp=fs.readFileSync('pos/import.js','utf8');
const prod=fs.readFileSync('pos/products.js','utf8');
const posSw=fs.readFileSync('pos/sw.js','utf8');
const glow=fs.readFileSync('glow/index.html','utf8');
const glowSw=fs.readFileSync('glow/sw.js','utf8');
const cname=fs.readFileSync('CNAME','utf8').trim();
function fn(src,name){
  const s=src.indexOf('function '+name+'('); if(s<0) return '';
  const o=src.indexOf('{',s); let d=0;
  for(let i=o;i<src.length;i++){ if(src[i]==='{')d++; else if(src[i]==='}'){d--;if(d===0)return src.slice(s,i+1);} }
  return '';
}
const plan=fn(imp,'planInventoryWrites');
const recv=fn(prod,'renderReceiveGoodsLog');
const checks=[
 ['CNAME canonical root domain', cname==='echarpe.store'],
 ['existing import preserves current quantity', plan.includes('const isExisting') && plan.includes('if(!isExisting)') && plan.includes('data.qtyByBranch = { [branch]: qtyNum }')],
 ['receive log reads Firestore stock log', recv.includes('db.collection(TEST_STOCK_LOG)') && recv.includes("x.type !== 'receipt'")],
 ['receive log shows last 20 not only today', recv.includes('limit(20)') && recv.includes('آخر 20 عملية استلام')],
 ['receive log has local-cache fallback', recv.includes('renderRows(receiveGoodsTodayLog') && recv.includes("console.warn('receive log firestore'")],
 ['POS cache bumped v337', posSw.includes("store-apps-shell-v337")],
 ['Glow tryon URL canonical', glow.includes("frame.src = '../tryon/photo.html?brand=' + brand + '&embed=1';") && !glow.includes("&embed=1&run=" )],
 ['Glow cache bumped v73', glowSw.includes('glow-loyalty-v73')]
];
checks.forEach(([n,ok])=>{assert.ok(ok,n);console.log('PASS',n)});
