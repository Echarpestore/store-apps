'use strict';
const fs=require('fs'), path=require('path');
const root=path.join(__dirname,'..');
const live=fs.readFileSync(path.join(root,'pos','pos-live.js'),'utf8');
const sale=fs.readFileSync(path.join(root,'pos','pos-sale.js'),'utf8');
const office=fs.readFileSync(path.join(root,'Office','office.js'),'utf8');
const oi=fs.readFileSync(path.join(root,'Office','index.html'),'utf8');
const pi=fs.readFileSync(path.join(root,'pos','index.html'),'utf8');
const psw=fs.readFileSync(path.join(root,'pos','sw.js'),'utf8');

assert(live.includes('db.runTransaction') && live.includes('countedSaleIds'), 'v411 daily KPI update is transactional + idempotent per invoice');
assert(live.includes("queueSale(ev); // queue first"), 'v411 queues KPI event before network so close/offline cannot lose it');
assert(live.includes("timeZone:'Africa/Cairo'"), 'v411 daily counters use Cairo business day');
assert(live.includes('statsDayKey') && live.includes('netSales') && live.includes('paymentTotals') && live.includes('lastSale'), 'v411 stores daily KPIs, payment totals and last sale in live branch doc');
assert(live.includes('HEARTBEAT_MS=5*60*1000'), 'v411 keeps low-cost five-minute idle heartbeat');

const saveOk=sale.indexOf('if(_saleW.error) throw _saleW.error');
const liveHook=sale.indexOf("typeof posLiveRecordSale === 'function'");
const activity=sale.indexOf("_logActivity('sale_saved'", liveHook);
assert(saveOk>=0 && liveHook>saveOk && activity>liveHook, 'v411 records dashboard sale only after successful sale save, before later best-effort work');
assert(sale.slice(liveHook,liveHook+900).includes('payments: payments'), 'v411 dashboard receives normalized saved payment breakdown');

const block=office.slice(office.indexOf('// 🔴 POS Live v411'), office.indexOf('function ofGoPage'));
assert((block.match(/collection\('office_pos_live'\)\.onSnapshot/g)||[]).length===1, 'Office v411 still uses exactly one POS Live listener');
assert(!block.includes("collection('pos_test_sales')") && !block.includes('TEST_SALES'), 'Office live dashboard does not query sales history');
assert(block.includes('ملخص الفروع اليوم') && block.includes('صافي اليوم') && block.includes('آخر بيع') && block.includes('طرق الدفع اليوم'), 'Office v411 renders useful branch/global KPIs and payment method info');
assert(oi.includes('مبيعات اليوم، آخر بيع، طرق الدفع والسلة الحالية'), 'Office POS Live copy describes operational dashboard');
assert(pi.includes('pos-live.js?v=411') && /store-apps-shell-v(?:41[1-9]|4[2-9]\d|[5-9]\d{2,})/.test(psw), 'POS keeps v411 live module under a v411+ application cache');

console.log('PASS POS Live operational dashboard v411');
