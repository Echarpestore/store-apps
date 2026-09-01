const fs = require('fs');
const assert = require('assert');
const path = require('path');
const root = path.join(__dirname, '..');
const office = fs.readFileSync(path.join(root,'Office','office.js'),'utf8');
const officeHtml = fs.readFileSync(path.join(root,'Office','index.html'),'utf8');
const officeSw = fs.readFileSync(path.join(root,'Office','sw.js'),'utf8');
const sales = fs.readFileSync(path.join(root,'sales','sales-app.js'),'utf8');
const salesHtml = fs.readFileSync(path.join(root,'sales','index.html'),'utf8');
const salesSw = fs.readFileSync(path.join(root,'sales','sw.js'),'utf8');
let n=0;
function ok(v,msg){assert.ok(v,msg); n++; console.log('PASS',n,msg);}

ok(office.includes("q.get({source:'cache'})") && office.includes("q.get({source:'server'})"), 'Office renders cache first and explicitly throttles server sync');
ok(office.includes("OF_LF_PREFIX = 'office_lf_v431_'") && office.includes('ofLfLast'), 'Office persists per-dataset sync timestamps locally');
for (const c of ['office_merchant_txns','office_expenses','sales_salary_payments','sales_rewards','office_paymob_settlements','office_cash_days','sales_advances']) {
  ok(!office.includes(`db.collection('${c}').onSnapshot`), `Office no permanent full listener: ${c}`);
}
ok(office.includes("ofLfOnce(db.collection('pos_test_inventory'),'inventory'"), 'Office inventory is cache-first instead of full server read at every boot');
ok(office.includes("q.get({source:'cache'})") && office.includes("ofLfLast('customers')"), 'Office customer reporting uses persistent cache with a 24h server TTL');
ok(office.includes("baseQ.get({source:'cache'})") && office.includes("get({source:'server'})"), 'Office sales hydrate 30d locally then request only incremental server data');
ok(office.includes("where('clockOutTs','==', null).onSnapshot"), 'Office keeps tiny open-shifts realtime listener');
ok(office.includes("where('status','==','pending').onSnapshot"), 'Office keeps pending operational data realtime');
ok(officeHtml.includes('office.js?v=79') && officeSw.includes('echarpe-office-v75'), 'Office cache bust versions updated');

ok(sales.includes('getDocsFromCache') && sales.includes('getDocsFromServer'), 'Sales uses explicit IndexedDB cache/server APIs');
ok(sales.includes("const LF431_RECENT_MS=2*24*3600000"), 'Sales realtime window is limited to two days');
for (const name of ['points190','feedback65','shifts190','submissions190','rewards190','vio190','attdec190','breaks190','timecredit190','deductions190','commission190','salary190','advances190']) {
  ok(sales.includes(`lf431History('${name}'`), `Sales local-first history enabled: ${name}`);
}
ok(!sales.includes("onSnapshot(_scoped(pointsCol,'ts')"), 'Sales removed 190-day points listener');
ok(!sales.includes("onSnapshot(_scopedDays(entriesCol,'ts', 65)"), 'Sales removed 65-day feedback listener');
ok(!sales.includes("onSnapshot(_scoped(shiftsCol,'clockInTs')"), 'Sales removed 190-day shifts listener');
ok(salesHtml.includes('sales-app.js?v=24') && salesSw.includes('store-apps-shell-v394'), 'Sales cache bust versions updated');
console.log(`Local-first v431: ${n}/${n} PASS`);
