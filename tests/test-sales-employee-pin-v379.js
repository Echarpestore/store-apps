const fs=require('fs'), path=require('path');
const app=fs.readFileSync(path.join(__dirname,'../sales/sales-app.js'),'utf8');
const sw=fs.readFileSync(path.join(__dirname,'../sales/sw.js'),'utf8');
const checks=[
 ['PIN field visible', /id="erPin"/.test(app)],
 ['PIN is 4 digits', /\^\\d\{4\}\$/.test(app) && app.includes("كلمة المرور لازم تكون 4 أرقام")],
 ['PIN saved to employee', /if\(pinChanged\) patch\.pin=pin/.test(app)],
 ['PIN not written to audit changes', /delete auditChanges\.pin/.test(app)],
 ['PIN change audit marker', /pinChanged/.test(app)],
 ['SW v379', /store-apps-shell-v379/.test(sw)]
];
let fail=0; for(const [n,ok] of checks){console.log((ok?'PASS ':'FAIL ')+n); if(!ok)fail++;}
if(fail) throw new Error(`test-sales-employee-pin-v379: ${fail} فحص فشل`);
