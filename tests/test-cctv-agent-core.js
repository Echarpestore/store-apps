// ============================================================
// 🤖 test-cctv-agent-core — مراجع الكاميرات الذكي
//
// بيتأكد إن:
//   · نسخة cctvReviewCore في functions/ هي نفس office2/cctv-review-core.js بالبايت
//     (الدوال بتترفع لوحدها فمحتاجة نسخة — لو اتعدّل واحد ونسينا التاني الاختبار يقع)
//   · الملخص بيفصل الفروع، وبيطلّع الحذف والتنبيهات بس بأرقام مراجع e1, e2…
//   · تقرير الوكيل: أي ref مش موجود بيتشال، والوقت والمبلغ بييجوا من الحدث نفسه مش من الوكيل
//   · قرارات المالك القديمة بتتلخّص للوكيل
//   · الدالة متوصّلة في index.js والـSDK في package.json
// ============================================================
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'functions', 'cctvAgentCore.js'));

// 1) النسختين متطابقين
assert.strictEqual(fs.readFileSync(path.join(ROOT, 'functions', 'cctvReviewCore.js'), 'utf8'), fs.readFileSync(path.join(ROOT, 'office2', 'cctv-review-core.js'), 'utf8'), 'functions/cctvReviewCore.js لازم يكون نسخة من office2/cctv-review-core.js');

// 2) الملخص
const T0 = Date.UTC(2026, 10, 1, 10, 0, 0);   // 12:00 القاهرة
const catalog = { 'A#1': { name: 'طرحة شيفون' }, 'B#1': { name: 'بندانة' } };
const timelines = [
  { invoiceCode: 'M1', invoiceNo: '101', sid: 's1', branch: 'echarpe مدينتي', startedAtMs: T0, endedAtMs: T0 + 90000, catalog, events: [
    { seq: 1, atMs: T0, kind: 'item_added', cart: [['A#1', 1, 450, 0], ['B#1', 1, 120, 0]], total: 570 },
    { seq: 2, atMs: T0 + 60000, kind: 'item_removed', cart: [['B#1', 1, 120, 0]], total: 120 },
    { seq: 3, atMs: T0 + 90000, kind: 'sale_saved', cart: [['B#1', 1, 120, 0]], total: 120 } ] },
  { invoiceCode: 'R1', invoiceNo: '7', sid: 's9', branch: 'الرحاب', startedAtMs: T0, endedAtMs: T0 + 5000, catalog, events: [
    { seq: 1, atMs: T0, kind: 'item_removed', cart: [], total: 0 } ] },
];
const activity = [
  { type: 'manual_drawer_open', ts: T0 + 3600000, branch: 'echarpe مدينتي', employeeName: 'سارة' },
  { type: 'item_added', ts: T0 + 10, branch: 'echarpe مدينتي' },   // ضوضاء
  { type: 'manual_discount', ts: T0 + 70000, branch: 'الرحاب', employeeName: 'منى' },
];
const sales = [{ id: 'M1', invoiceCode: 'M1', invoiceNo: '101', branch: 'echarpe مدينتي', createdAtMs: T0 + 90000, total: 120, employeeName: 'سارة', cartSid: 's1', payments: { cash: 120 }, items: [{ name: 'بندانة', qty: 1, price: 120 }] }];
const d = C.digest({ branchId: 'madinaty', dayKey: '2026-11-01', timelines, activity, sales, incidents: [{ ts: T0, branch: 'Glow', note: 'x' }] });
assert.strictEqual(d.branchName, 'مدينتي');
assert.strictEqual(d.stats.invoices, 1);
assert.strictEqual(d.incidents.length, 0, 'بلاغ Glow مايظهرش في مدينتي');
assert.deepStrictEqual(d.events.map((e) => e.ref), ['e1', 'e2'], 'حذف + فتح درج بس — من غير الإضافة العادية ولا أحداث الرحاب');
assert.strictEqual(d.events[0].removedValue, 450);
assert.strictEqual(d.events[0].time, '12:01:00', 'الوقت بتوقيت القاهرة');
assert.strictEqual(d.events[0].employee, 'سارة', 'الموظفة من sid الفاتورة');
assert.strictEqual(d.events[1].kind, 'manual_drawer_open');
const txt = C.digestText(d);
assert.ok(txt.includes('"ref":"e1"') && txt.includes('"invoiceNo":"101"'), 'النص فيه المراجع والفواتير');

// 3) تقرير الوكيل
const rep = C.parseReport({ headline: 'فتح درج من غير بيع', risk: 'weird', moments: [
  { ref: 'e2', severity: 'high', title: 'درج', why: 'مفيش بيع', watchFor: 'إيد في الدرج' },
  { ref: 'e99', severity: 'high', title: 'مخترع', why: '', watchFor: '' },
  { ref: 'e2', severity: 'low', title: 'مكرر', why: '', watchFor: '' },
  { ref: 'e1', severity: 'low', title: 'حذف', why: 'قطعة 450 ج', watchFor: '', atMs: 1 } ], patterns: ['a'], clear: [] }, d);
assert.strictEqual(rep.risk, 'medium', 'خطورة غلط → medium');
assert.deepStrictEqual(rep.moments.map((m) => m.ref), ['e2', 'e1'], 'المخترع والمكرر اتشالوا');
assert.strictEqual(rep.dropped, 2);
assert.strictEqual(rep.moments[1].atMs, d.events[0].atMs, 'الوقت من الحدث مش من الوكيل');
assert.strictEqual(rep.moments[1].amount, 450);
assert.strictEqual(C.parseReport(null, d).moments.length, 0, 'رد فاضي مايوقعش');
assert.ok(C.pushText(rep, 'مدينتي').body.includes('2 لحظة'));

// 4) قرارات المالك
const fb = C.feedbackDigest([{ dayKey: '2026-10-30', moments: [{ ref: 'e1', title: 'حذف', employee: 'سارة' }, { ref: 'e2', title: 'درج' }], feedback: { e1: 'ok' } }]);
assert.deepStrictEqual(fb, [{ day: '2026-10-30', title: 'حذف', employee: 'سارة', owner: 'طلع طبيعي' }]);

// 5) سكيمة التقرير صالحة للـstrict tool use
const walk = (s) => { if (s.type === 'object') { assert.strictEqual(s.additionalProperties, false); assert.deepStrictEqual(s.required.slice().sort(), Object.keys(s.properties).sort()); Object.values(s.properties).forEach(walk); } if (s.type === 'array') walk(s.items); };
walk(C.REPORT_SCHEMA);

// 6) التوصيل
const idx = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
assert.ok(/require\("\.\/cctvAgent"\)/.test(idx) && idx.includes('useNotifier(sendToOffice)'), 'index.js بيصدّر الوكيل');
assert.ok(require(path.join(ROOT, 'functions', 'package.json')).dependencies['@anthropic-ai/sdk'], 'SDK في package.json');
const office = fs.readFileSync(path.join(ROOT, 'Office', 'index.html'), 'utf8');
assert.ok(office.indexOf('m-cctv-ai.js') > office.indexOf('m-cctv.js'), 'الشاشة بتتحمّل بعد m-cctv.js');

console.log('✅ test-cctv-agent-core');
