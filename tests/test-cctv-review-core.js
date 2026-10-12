// ============================================================
// 📼 test-cctv-review-core — مراجعة اليوم (شريط الأحداث + السلة المتزامنة)
//
// بيتأكد إن:
//   · حذف صنف / تقليل كمية بيطلع حدث «أحمر» ومعاه قيمة اللي اتشال
//   · السلة عند أي لحظة في الفيديو هي بالظبط آخر حالة قبل اللحظة دي
//   · برّه وقت الفاتورة مفيش سلة (مايفضلش عارض سلة فاتورة خلصت)
//   · الصفوف المخزنة كـmap {'0':..} (شكل Firestore) بتتقري زي المصفوفة
//   · أحداث pos_activity_log المهمة بتدخل والضوضاء بتتساب
// اختبار سلبي: لو buildEvents بطّل يحسب قيمة المحذوف، أو basketAt رجّع
// السلة بعد نهاية الفاتورة، الاختبار ده يقع.
// ============================================================
'use strict';
const assert = require('assert');
const path = require('path');
const R = require(path.join(__dirname, '..', 'office2', 'cctv-review-core.js'));

const T0 = 1791700000000;
const catalog = { 'A#1':{ name:'طرحة سادة', barcode:'111' }, 'B#1':{ name:'بندانة', barcode:'222' }, 'C#1':{ name:'شراب', barcode:'333' } };
// فاتورة 1: إضافة A، إضافة B (كمية 2)، تقليل B لـ1، حذف A، حفظ
const inv1 = { invoiceCode:'INV1', invoiceNo:'491', sid:'s1', branch:'مدينتي', startedAtMs:T0, endedAtMs:T0+60000, catalog, events:[
  { seq:1, atMs:T0,        kind:'item_added',    cart:[['A#1',1,165,0]], total:165 },
  { seq:2, atMs:T0+10000,  kind:'item_added',    cart:[['A#1',1,165,0],['B#1',2,45,0]], total:255 },
  { seq:3, atMs:T0+20000,  kind:'qty_decreased', cart:[['A#1',1,165,0],['B#1',1,45,0]], total:210 },
  { seq:4, atMs:T0+30000,  kind:'item_removed',  cart:[['B#1',1,45,0]], total:45 },
  { seq:5, atMs:T0+60000,  kind:'sale_saved',    cart:[['B#1',1,45,0]], total:45 } ] };
// فاتورة 2 بشكل Firestore (map بدل مصفوفة) وأحداثها مش مرتبة
const inv2 = { invoiceCode:'INV2', invoiceNo:'492', sid:'s2', branch:'مدينتي', startedAtMs:T0+300000, endedAtMs:T0+330000, catalog, events:[
  { seq:2, atMs:T0+330000, kind:'sale_saved', cart:[{ '0':'C#1','1':3,'2':20,'3':0 }], total:60 },
  { seq:1, atMs:T0+300000, kind:'item_added', cart:[{ '0':'C#1','1':3,'2':20,'3':0 }], total:60 } ] };
const activity = [
  { type:'manual_discount', ts:T0+25000, branch:'مدينتي', amount:20, employeeName:'Aya', sid:'s1' },
  { type:'manual_drawer_open', ts:T0+200000, branch:'مدينتي', employeeName:'Aya' },
  { type:'print_latency', ts:T0+61000, branch:'مدينتي' },          // ضوضاء — لازم تتساب
  { type:'sale_saved', ts:T0+60000, branch:'مدينتي' } ];            // مكرر مع التايملاين — لازم يتساب

const ev = R.buildEvents([inv2, inv1], activity);

// الترتيب بالوقت + مفيش ضوضاء
assert.deepStrictEqual(ev.map(e=> e.kind), ['item_added','item_added','qty_decreased','manual_discount','item_removed','sale_saved','manual_drawer_open','item_added','sale_saved']);
for(let i = 1; i < ev.length; i++) assert.ok(ev[i].atMs >= ev[i-1].atMs, 'الأحداث لازم تبقى مرتبة بالوقت');

// تقليل الكمية: قطعة واحدة بـ45 اتشالت
const dec = ev.find(e=> e.kind==='qty_decreased');
assert.strictEqual(dec.removedValue, 45); assert.strictEqual(dec.tone, 'del'); assert.ok(dec.detail.includes('بندانة'));
// حذف الصنف: الطرحة بـ165 اتشالت
const del = ev.find(e=> e.kind==='item_removed');
assert.strictEqual(del.removedValue, 165); assert.strictEqual(del.tone, 'del'); assert.ok(del.detail.includes('طرحة سادة'));
// الإضافة مش محسوبة حذف
assert.strictEqual(ev[0].removedValue, 0); assert.strictEqual(ev[0].tone, 'add');
// أحداث الـPOS المهمة «تنبيه»
assert.strictEqual(ev.find(e=> e.kind==='manual_discount').tone, 'alert');
assert.strictEqual(ev.find(e=> e.kind==='manual_drawer_open').source, 'activity');

// الملخص
const sum = R.summary(ev);
assert.strictEqual(sum.removed, 2); assert.strictEqual(sum.removedValue, 210); assert.strictEqual(sum.alerts, 2); assert.strictEqual(sum.sales, 2);

// السلة المتزامنة
assert.strictEqual(R.basketAt([inv1, inv2], T0-1), null, 'قبل أول صنف مفيش سلة');
let b = R.basketAt([inv1, inv2], T0+5000);  assert.deepStrictEqual(b.rows.map(r=> r.name), ['طرحة سادة']); assert.strictEqual(b.total, 165);
b = R.basketAt([inv1, inv2], T0+15000);     assert.deepStrictEqual(b.rows.map(r=> [r.name, r.qty]), [['طرحة سادة',1],['بندانة',2]]); assert.strictEqual(b.total, 255);
b = R.basketAt([inv1, inv2], T0+20000);     assert.strictEqual(b.rows[1].qty, 1, 'عند لحظة الحدث بالظبط السلة لازم تبقى بعد التغيير');
b = R.basketAt([inv1, inv2], T0+45000);     assert.deepStrictEqual(b.rows.map(r=> r.name), ['بندانة']); assert.strictEqual(b.invoiceNo, '491'); assert.strictEqual(b.saved, false);
b = R.basketAt([inv1, inv2], T0+60000);     assert.strictEqual(b.saved, true);
assert.strictEqual(R.basketAt([inv1, inv2], T0+60001), null, 'بعد حفظ الفاتورة السلة لازم تفضى');
assert.strictEqual(R.basketAt([inv1, inv2], T0+200000), null, 'بين فاتورتين مفيش سلة');
b = R.basketAt([inv1, inv2], T0+310000);    assert.deepStrictEqual(b.rows.map(r=> [r.name, r.qty, r.price]), [['شراب',3,20]], 'صفوف Firestore (map) لازم تتقري'); assert.strictEqual(b.total, 60);

// أقرب حدث + حدود الشريط
assert.strictEqual(R.nearestIndex(ev, T0-1), -1);
assert.strictEqual(R.nearestIndex(ev, T0), 0);
assert.strictEqual(R.nearestIndex(ev, T0+26000), 3);
assert.strictEqual(R.nearestIndex(ev, T0+99999999), ev.length-1);
const sp = R.span(ev, T0-3600000, T0+3600000, 60000);
assert.strictEqual(sp.start, T0-60000); assert.strictEqual(sp.end, T0+330000+60000);
assert.deepStrictEqual(R.span([], 5, 9), { start:5, end:9 });

// مدخلات بايظة ماتكسرش حاجة
assert.deepStrictEqual(R.buildEvents(null, null), []);
assert.deepStrictEqual(R.buildEvents([{ events:[] }, null, { invoiceCode:'X' }], [null, {}]), []);
assert.strictEqual(R.basketAt(null, T0), null);

// فاتورة من غير تايملاين: سلة نهائية من أصناف الفاتورة (من غير أحداث حذف وهمية)
const syn = R.fromSale({ id:'S9', invoiceCode:'INV9', invoiceNo:'499', branch:'مدينتي', total:210, items:[{ name:'طرحة', qty:1, price:165 },{ name:'بندانة', qty:1, price:45 },{ name:'نقط', isRedemption:true, qty:1, price:-10 }] }, T0+900000);
assert.strictEqual(syn.synthetic, true); assert.strictEqual(syn.startedAtMs, T0+900000-30000);
const synEv = R.buildEvents([syn], []);
assert.deepStrictEqual(synEv.map(e=> e.kind), ['invoice_cart','sale_saved']);
assert.strictEqual(R.summary(synEv).removed, 0, 'الفاتورة المبنية من الأصناف ماينفعش تطلع حذف');
b = R.basketAt([syn], T0+900000-10000); assert.deepStrictEqual(b.rows.map(r=> r.name), ['طرحة','بندانة']); assert.strictEqual(b.total, 210);
assert.strictEqual(R.fromSale({ items:[] }, T0), null); assert.strictEqual(R.fromSale({ items:[{ name:'x', qty:1, price:1 }] }, 0), null);
// 🗑 مسح القطع من pos_activity_log (المصدر الأساسي للحذف)
//   · فاتورة سلتها نهائية بس / سلة اتسابت: الحذف لازم يظهر من سجل النشاط
//   · حذف متسجل في المصدرين: يتعدّ مرة واحدة بس، وياخد علامة «متأخر» من سجل النشاط
const rmAct = [
  { type:'item_removed', ts:T0+900000-12000, branch:'مدينتي', name:'شال', qty:1, price:300, value:300, inCartSec:20, sid:'s9', employeeName:'Aya' },
  { type:'item_qty_reduced', ts:T0+1500000, branch:'مدينتي', name:'شراب', qty:2, price:20, value:40, inCartSec:8, sid:'sX' },
  { type:'item_removed_late', ts:T0+30500, branch:'مدينتي', name:'طرحة سادة', qty:1, price:165, value:165, inCartSec:150, sid:'s1' } ];   // توأم حذف inv1 (T0+30000)
const evRm = R.buildEvents([inv1, syn], rmAct);
const sRm = R.summary(evRm);
assert.strictEqual(sRm.removed, 4, 'حذفين من خطوات inv1 + حذفين من سجل النشاط (التوأم مايتعدّش مرتين)');
assert.strictEqual(sRm.removedValue, 45 + 165 + 300 + 40);
const fromAct = evRm.filter(e=> e.source==='activity' && e.removedValue > 0);
assert.strictEqual(fromAct.length, 2);
assert.ok(fromAct[0].detail.includes('شال') && fromAct[0].tone === 'del');
const twin = evRm.find(e=> e.kind==='item_removed' && e.source==='cart');
assert.strictEqual(twin.late, true, 'التوأم لازم ياخد علامة الحذف المتأخر'); assert.ok(twin.detail.includes('في السلة'));
assert.strictEqual(R.summary(R.buildEvents([], rmAct)).removed, 3, 'من غير أي تايملاين الحذف كله لازم يظهر من سجل النشاط');

// ربط أحداث سجل النشاط بفاتورتها عن طريق sid (عشان تظهر في مراجعة الفاتورة الواحدة)
const linked = R.buildEvents([inv1], [{ type:'manual_discount', ts:T0+25000, branch:'مدينتي', amount:20, sid:'s1' }, { type:'item_removed', ts:T0+5000000, name:'x', qty:1, price:10, value:10, sid:'orphan' }]);
assert.strictEqual(linked.find(e=> e.kind==='manual_discount').invoiceCode, 'INV1'); assert.strictEqual(linked.find(e=> e.kind==='manual_discount').invoiceNo, '491');
assert.strictEqual(linked.find(e=> e.sid==='orphan').invoiceCode, '', 'سلة اتسابت من غير فاتورة تفضل من غير رقم');
assert.strictEqual(R.fromSale({ id:'S1', invoiceCode:'C1', cartSid:'sidA', items:[{ name:'a', qty:1, price:5 }] }, T0).sid, 'sidA');

console.log('  ✓ cctv review core: ' + ev.length + ' أحداث · محذوف ' + sum.removedValue + ' ج · السلة متزامنة');
