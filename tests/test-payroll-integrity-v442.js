const fs = require('fs');
const vm = require('vm');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname,'../sales/sales-app.js'),'utf8');
let pass=0, fail=0;
function t(name, cond){ if(cond){console.log('PASS',name);pass++;} else {console.error('FAIL',name);fail++;} }
function grab(name,next){
  const a=src.indexOf('function '+name+'('); const b=src.indexOf('\nfunction '+next+'(',a+1);
  if(a<0||b<0) throw new Error('missing '+name); return src.slice(a,b);
}
const code = grab('payrollMoneyBreakdown','payrollIntegrityCheck') + '\n' + grab('payrollIntegrityCheck','renderSalaryPanel');
const sandbox={window:{}}; vm.createContext(sandbox); vm.runInContext(code,sandbox);
const calc={proratedBase:9000,overtimePay:791.88,dayOffBonusAmount:600,deductionAmount:1800,timeCreditDeduction:1000,adminDeductions:0,advancesTotal:0,netSalary:7591.88};
const due={totalDue:1418};
const b=sandbox.payrollMoneyBreakdown(calc,due);
t('salary formula 9000 + 1391.88 - 2800 = 7591.88', b.salaryNet===7591.88);
t('salary additions are 1391.88', b.salaryAdditions===1391.88);
t('salary deductions are 2800', b.salaryDeductions===2800);
t('commissions kept separate', b.commissionsDue===1418 && b.payoutIfAllCommissions===9009.88);
t('matching engine passes integrity', sandbox.payrollIntegrityCheck(calc,due).ok===true);
t('mismatching engine is blocked', sandbox.payrollIntegrityCheck({...calc,netSalary:9009.88},due).ok===false);
t('top KPI labels salary net, not combined due', src.includes('صافي الراتب<b class="good">${_payMoney(pb.salaryNet)}</b>'));
t('pay dialog requires review checkbox', src.includes('id="poReviewed"') && src.includes("راجع الحضور والغياب والسلف والإضافات الأول"));
t('pay dialog requires approval checkbox', src.includes('id="poApproved"') && src.includes('لازم تعتمد المبلغ النهائي قبل الصرف'));
t('payment stores payroll audit', src.includes('payrollAudit: {') && src.includes('formulaOk: true'));
t('payment amount uses canonical salary net', src.includes('periodLabel: pk, amount: liveIntegrity.salaryNet'));
t('receipt prints salary formula', src.includes("add('الصافي','معادلة الراتب'"));
t('cache bust updated', fs.readFileSync(path.join(__dirname,'../sales/index.html'),'utf8').includes('sales-app.js?v=442'));
t('service worker cache bumped', fs.readFileSync(path.join(__dirname,'../sales/sw.js'),'utf8').includes('store-apps-shell-v442'));
console.log(`RESULT ${pass}/${pass+fail}`); process.exit(fail?1:0);
