#!/usr/bin/env node
// v791 — قرارات المالك 28-11: نقطة الموظف بعد المرتجع/العكس · نقط العميلة في التبديل · كارت الهدية مش مبيعات ·
// مرتجع من غير فاتورة بعد العرض · سلف التصفية · يوم الإجازة اللي اتشتغل
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const ok = (c, m)=>{ if(c){ pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
function fn(src, name){ const i = src.indexOf('function ' + name + '('); if(i < 0) throw new Error('missing ' + name); let d = 0, j = src.indexOf('{', i); for(let k = j; k < src.length; k++){ if(src[k] === '{') d++; else if(src[k] === '}'){ d--; if(!d) return src.slice(i, k + 1); } } }
const ps = rd('pos/pos-sale.js');

/* ---- 1) نقطة الموظف ---- */
const SP = new Function(['staffPieceCount','staffPiecesLeft','staffPointShouldVoid','staffPointDocsFor'].map(n=> fn(ps, n)).join('\n') + '; return { left: staffPiecesLeft, should: staffPointShouldVoid, docs: staffPointDocsFor };')();
const inv = { invoiceNo: 120, branch: 'echarpe Madinaty', sellerEmployeeId: 'e1', createdAtMs: 1e12, items: [ { id:'a', barcode:'1', name:'A', qty:3, price:100 }, { id:'b', barcode:'2', name:'B', qty:2, price:50 }, { id:'__loyalty_redemption__', name:'نقط', qty:1, price:-20, isRedemption:true } ] };
ok(SP.left(inv, {}) === 5 && SP.should(inv, {}, 4) === false, 'سلبي: 5 قطع من غير مرتجع → النقطة تفضل');
ok(SP.should(inv, { '1|A': 1 }, 4) === false, 'سلبي: رجّعت قطعة وفضل 4 (الحد) → النقطة تفضل');
ok(SP.should(inv, { '1|A': 2 }, 4) === true, 'رجّعت قطعتين وفضل 3 (أقل من الحد) → النقطة تتسحب');
ok(SP.should(inv, { '1|A': 3, '2|B': 2 }, 4) === true, 'رجّعت كله → النقطة تتسحب');
const pts = [ { id:1, auto:true, invoiceNumber:'120', branch:'echarpe Madinaty', employeeId:'e1', ts:1e12 + 5000 },
  { id:2, auto:true, invoiceNumber:'120', branch:'Glow', employeeId:'e9', ts:1e12 }, { id:3, invoiceNumber:'120', branch:'echarpe Madinaty', employeeId:'e1', ts:1e12 },
  { id:4, auto:true, invoiceNumber:'120', branch:'echarpe Madinaty', employeeId:'e1', ts:1e12 - 400*86400000 }, { id:5, auto:true, invoiceNumber:'121', branch:'echarpe Madinaty', employeeId:'e1', ts:1e12 } ];
ok(SP.docs(inv, pts).map(p=>p.id).join() === '1', 'سلبي: بيتسحب نقطة الفاتورة دي بس — مش فرع تاني · مش يدوية · مش نفس الرقم من سنة فاتت · مش فاتورة تانية');
ok(/voidStaffPointForInvoice\(sale, 'reversal'\)/.test(fn(ps, 'reverseReceipt')) && /staffPointShouldVoid\(orig, returnedMap, _spMinItems\)/.test(ps), 'متوصّل في عكس الفاتورة وفي المرتجع من فاتورة');

/* ---- 2) نقط العميلة ---- */
const ex = new Function(fn(ps, 'exchangeEarnedPoints') + '; return exchangeEarnedPoints;')();
const N = { id:'n', price:500, qty:1 }, R = { id:'r', price:-300, qty:1, isReturn:true };
ok(ex([N, R], 200, 100) === 5, 'تبديل: جديد 500 + مرتجع 300 → الكسب 5 نقط على الجديد (خصم المرتجع بيتحسب لوحده، كان بيتخصم مرتين)');
ok(ex([{ id:'n', price:200, qty:1 }, R], -100, 100) === 2, 'تبديل إجماليه سالب: الكسب على الجديد (2)');
ok(ex([N], 500, 100) === 5, 'سلبي: بيع عادي زي ما هو (5)');
ok(ex([R], -300, 100) === -3, 'سلبي: مرتجع صافي زي ما هو (−3)');
ok(ex([N, R, { id:'__loyalty_redemption__', price:-50, qty:1, isRedemption:true }], 150, 100) === 4, 'استبدال النقط في فاتورة التبديل بيقلّل الكسب (4)');
ok(/_retOtherCust\[_op\]/.test(ps) && /batch\.set\(db\.collection\(TEST_CUSTOMERS\)\.doc\(_op\)/.test(ps), 'نقط المرتجع بتتخصم من صاحبة الفاتورة الأصلية لو الرقم اتغيّر');

/* ---- 3) كارت الهدية مش مبيعات ---- */
const rs = rd('pos/pos-reports.js');
const agg = new Function(fn(rs, 'saleGiftCardValue') + fn(rs, 'repAggregate') + '; return repAggregate;')();
let a = agg([ { total:500, payments:{ cash:500 }, items:[ { name:'كارت هدية', isGiftCard:true, price:500, qty:1 } ] }, { total:500, payments:{ credit:500 }, items:[ { name:'طرحة', price:500, qty:1 } ] } ]);
ok(a.salesTotal === 500 && a.giftCardsSold === 500 && a.itemsSold === 1, 'كارت 500 اتباع واتصرف → المبيعات 500 مرة واحدة (كانت 1000) والكارت في سطر لوحده');
ok(a.byMethod.cash === 500 && a.byMethod.credit === 500, 'سلبي: طرق الدفع زي ما هي (الكاش الحقيقي مبيتغيرش)');
a = agg([ { total:700, payments:{ cash:700 }, items:[ { name:'كارت هدية', isGiftCard:true, price:500, qty:1 }, { name:'طرحة', price:200, qty:1 } ] } ]);
ok(a.salesTotal === 200 && a.giftCardsSold === 500, 'فاتورة فيها كارت + قطعة → المبيعات قيمة القطعة بس');
a = agg([ { total:300, payments:{ cash:300 }, items:[ { name:'طرحة', price:300, qty:1 } ] } ]);
ok(a.salesTotal === 300 && a.giftCardsSold === 0, 'سلبي: فاتورة من غير كروت زي ما هي');
const o2 = rd('office2/office2.js');
const sn = new Function(fn(o2, 'gcSoldOf') + fn(o2, 'saleNet') + '; return saleNet;')();
ok(sn({ total:700, payments:{ cash:700 }, items:[ { isGiftCard:true, price:500, qty:1 }, { price:200, qty:1 } ] }) === 200 && sn({ total:300, payments:{ points:50 }, items:[] }) === 250, 'Office: نفس القاعدة في saleNet');

/* ---- 4) مرتجع من غير فاتورة بعد العرض ---- */
function promo(day, cart, extra){
  const w = Object.assign({ cart, currentBranch:'echarpe Madinaty', staffPurchase:null }, extra || {});
  const t = Date.UTC(2026, day[0]-1, day[1], 12); w.window = w; w.console = console; w.Intl = Intl;
  w.Date = function(x){ return x == null ? new Date(t) : new Date(x); }; w.Date.now = ()=> t; w.Date.UTC = Date.UTC; w.renderCart = function(){};
  vm.runInNewContext(rd('pos/promo-weekend.js'), w); w.renderCart(); return w;
}
let c = promo([12,3], [ { id:'p', barcode:'5', qty:1, price:-100, isReturn:true } ]).cart[0];
ok(c.price === -85 && /من غير فاتورة/.test(c.discountName), 'بعد العرض بـ4 أيام: مرتجع من غير فاتورة بيرجع بـ85 مش 100');
ok(promo([12,3], [ { id:'p', barcode:'832', qty:1, price:-350, isReturn:true } ]).cart[0].price === -299, 'كود بسعر ثابت (832) بيرجع بـ299');
ok(promo([12,3], [ { id:'p', barcode:'187', qty:1, price:-45, isReturn:true } ]).cart[0].price === -37.5, 'البندانة 187 بترجع بسعر العرض (150÷4)');
ok(promo([12,3], [ { id:'p', barcode:'5', qty:1, price:-100, isReturn:true, fromInvoice:'120' } ]).cart[0].price === -100, 'سلبي: مرتجع من فاتورة مش بيتلمس');
ok(promo([12,3], [ { id:'p', barcode:'5', qty:1, price:-100, isReturn:true, edited:true } ]).cart[0].price === -100, 'سلبي: الكاشير عدّلت السعر بإيدها → سعرها يمشي');
ok(promo([12,3], [ { id:'p', barcode:'5', qty:1, price:100 } ]).cart[0].price === 100, 'سلبي: البيع بعد العرض بالسعر الكامل');
ok(promo([12,20], [ { id:'p', barcode:'5', qty:1, price:-100, isReturn:true } ]).cart[0].price === -100, 'سلبي: بعد 14 يوم من العرض → السعر الكامل');
{ const w = promo([12,3], [ { id:'p', barcode:'5', qty:1, price:-100, isReturn:true } ]); const l = w.cart[0]; l.isReturn = false; l.price = Math.abs(l.price); w.renderCart();
  ok(l.price === 100 && l.discountName == null, 'رجع بيع عادي → السعر الكامل بيرجع'); }

/* ---- 5) رصيد الوقت: يوم الإجازة اللي اتشتغل ---- */
const TB = require(path.join(ROOT, 'sales', 'time-bank.js'));
const H = 3600000, base = Date.UTC(2026, 10, 10, 8, 0);
const sh = [ { id:'a', clockInTs: base, clockOutTs: base + 6*H, shiftMinutes: 360 } ];
ok(TB.monthSummary(sh, {}, ()=> 495, { dayOffKeys: ['2026-11-10'] }).balanceMin === 0, 'اشتغل 6 ساعات يوم إجازته → مفيش خصم من الرصيد (بياخدهم بونص)');
ok(TB.monthSummary(sh, {}, ()=> 495, { dayOffKeys: ['2026-11-11'] }).balanceMin === -135 && TB.monthSummary(sh, {}, ()=> 495).balanceMin === -135, 'سلبي: يوم شغل عادي لسه بيتخصم');
ok(TB.monthSummary([ { id:'a', clockInTs: base, clockOutTs: base + 10*H, shiftMinutes: 600 } ], {}, ()=> 495, { dayOffKeys: ['2026-11-10'] }).balanceMin === 105, 'سلبي: الأوفرتايم في يوم الإجازة زي ما هو');
const sa = rd('sales/sales-app.js');
ok(/dayOffKeys: \(attendance\.workedDayOffDates/.test(sa) && /dayOffKeys:\(\(att&&att\.workedDayOffDates/.test(rd('office2/payroll.js')) && /dayOffKeys:\(\(att&&att\.workedDayOffDates/.test(rd('Office/office.js')), 'متوصّل في المبيعات وOffice 2 وOffice القديم');

/* ---- 6) سلف التصفية ---- */
ok(/if\(!_fullPeriod && _payDay > 0 && typeof advPayCycleOf === 'function'\)/.test(sa) && /periodAdvances = _mine;/.test(sa) && /_hadPrev/.test(sa), 'التصفية: سلف دورة الشهر اللي فات مش بتتخصم تاني (إلا لو الموظف ملوش شهر قبله)');
console.log(`\n${fail ? '❌' : '✅'} audit2 v791: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
