#!/usr/bin/env node
// v790 — فحص السيستم الكامل (27-11): رصيد الوقت لشيفتين في يوم · كروت الهدية · عروض العميلة · أمان الأوردرات · عرض الجمعة مع شراء الموظف
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const ok = (c, m)=>{ if(c){ pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
function fn(src, name){ const i = src.indexOf('function ' + name + '('); if(i < 0) throw new Error('missing ' + name); let d = 0, j = src.indexOf('{', i); for(let k = j; k < src.length; k++){ if(src[k] === '{') d++; else if(src[k] === '}'){ d--; if(!d) return src.slice(i, k + 1); } } }

/* ---- 1) رصيد الوقت ---- */
const TB = require(path.join(ROOT, 'sales', 'time-bank.js'));
const H = 3600000, base = Date.UTC(2026, 10, 10, 8, 0);   // 10:00 القاهرة
const cfg = { bankGraceMin: 5 };
const two = [ { id:'a', clockInTs: base, clockOutTs: base + 6*H, shiftMinutes: 360 }, { id:'b', clockInTs: base + 7.5*H, clockOutTs: base + 9.75*H, shiftMinutes: 135 } ];
let m = TB.monthSummary(two, cfg, ()=> 495);
ok(m.balanceMin === 0 && m.minusMin === 0, 'شيفتين في نفس اليوم (6س + 2س15د) = يوم كامل، مفيش خصم (كان −495)');
ok(m.rows[1].reason === 'same_day' && m.rows[1].delta === 0, 'الشيفت التاني متعلّم same_day ومش بيتحاسب لوحده');
m = TB.monthSummary([two[0]], cfg, ()=> 495);
ok(m.balanceMin === -135, 'سلبي: شيفت واحد ناقص لسه بيتخصم (−135)');
m = TB.monthSummary([two[0], { id:'c', clockInTs: base + 24*H, clockOutTs: base + 30*H, shiftMinutes: 360 }], cfg, ()=> 495);
ok(m.balanceMin === -270, 'سلبي: شيفتين في يومين مختلفين مش بيتجمعوا (−270)');
m = TB.monthSummary([ { id:'a', clockInTs: base, clockOutTs: base + 6*H, shiftMinutes: 360, lateMinutes: 20 }, { id:'b', clockInTs: base + 7*H, clockOutTs: base + 12*H, shiftMinutes: 300, lateMinutes: 400 } ], cfg, ()=> 495);
ok(m.balanceMin === 165 && m.lateCount === 1 && m.lateMinTotal === 20, 'اليوم المجمّع: الزيادة أوفرتايم والتأخير بتاع أول حضور بس');
m = TB.monthSummary([ { id:'a', clockInTs: base, clockOutTs: base + 6*H, shiftMinutes: 360 }, { id:'b', clockInTs: base + 7*H, clockOutTs: base + 12*H, shiftMinutes: 300, bankAutoEnd: true } ], cfg, ()=> 495);
ok(m.balanceMin === 0 && m.forgotCount === 1, 'سلبي: لو شيفت منهم منسي → مفيش أوفرتايم على اليوم');
m = TB.monthSummary([ { id:'a', clockInTs: base, clockOutTs: base + 2*H, shiftMinutes: 120, manual: true }, { id:'b', clockInTs: base + 3*H, clockOutTs: base + 5*H, shiftMinutes: 120 } ], cfg, ()=> 495);
ok(m.balanceMin === -375, 'الشيفت اليدوي مش بيدخل في التجميع');
const sa = rd('sales/sales-app.js'), su = rd('sales/sales-ui.js');
ok(/bankAutoEnd: false, bankAutoReason: null/.test(fn(sa, 'ownerCloseShift')), 'تعديل المالك لوقت الانصراف بيشيل علامة «منسي» (الأوفرتايم يتحسب)');
ok(/window\.caiStamp\(b\.getFullYear\(\)/.test(su), 'قفل «نهاية المعاد» بتوقيت القاهرة مش توقيت الجهاز');

/* ---- 2) كروت الهدية ---- */
const g = new Function(fn(rd('pos/credit-ui.js'), 'giftCardsToActivate') + '; return giftCardsToActivate;')();
const pend = [ { cardId:'A', value:500 }, { cardId:'B', value:300 }, { cardId:'C', value:200 }, { cardId:'D', value:100 } ];
const plan = g(pend, [ { isGiftCard:true, giftCardId:'A', qty:1, price:500 }, { isGiftCard:true, giftCardId:'B', qty:1, price:1 }, { isGiftCard:true, giftCardId:'D', qty:2, price:100 } ], [ { isGiftCard:true, giftCardId:'C', qty:1, price:200 } ]);
ok(plan.activate.length === 1 && plan.activate[0].cardId === 'A', 'الكارت بيتفعّل بس لو سطره في الفاتورة بسعره الكامل');
ok(plan.drop.map(x=>x.cardId).join() === 'B,D', 'سلبي: كارت سعره اتعدّل لـ1ج أو كميته 2 → مش بيتفعّل');
ok(plan.keep.length === 1 && plan.keep[0].cardId === 'C', 'كارت في سلة معلّقة بيفضل مستني');
ok(g(pend, [], []).activate.length === 0, 'سلبي: فاتورة من غير سطور كروت → مفيش تفعيل');

/* ---- 3) عروض العميلة: set+merge بمفاتيح منقّطة ---- */
const ps = rd('pos/pos-sale.js');
const nd = new Function(fn(ps, '_nestDotted') + '; return _nestDotted;')();
const n = nd({ points: 5, 'offerUses.123': 1, 'activatedOffers.123.uses': 2 });
ok(n.points === 5 && n.offerUses['123'] === 1 && n.activatedOffers['123'].uses === 2 && !('offerUses.123' in n), 'المفاتيح المنقّطة بتتحول لخريطة متداخلة (كانت بتتكتب كاسم حقل حرفي)');
ok(/batch\.set\(custRef, _nestDotted\(custUpdate\)/.test(ps), 'حفظ العميلة بيستخدم _nestDotted');
ok(/_confirmDidSave === true/.test(ps) && /_lastConfirmSaved/.test(ps), 'الفاتورة بتتعتبر محفوظة بس عند نقطة النجاح الحقيقية');
ok(/_lastConfirmSaved !== false/.test(rd('pos/refund-credit.js')) && /_lastConfirmSaved !== false/.test(rd('pos/instapay-pos.js')), 'رصيد المرتجع وإنستاباي مش بيتنفذوا لو الحفظ فشل');
const rv = fn(ps, 'reverseReceipt');
ok(/refundedValue/.test(rv) && /returnedQty/.test(rv) && /isGiftCard/.test(rv), 'سلبي: عكس فاتورة اترجع منها أو فيها كارت هدية = مرفوض');

/* ---- 4) أمان الأوردرات والشات ---- */
const oi = new Function(fn(rd('pos/orders-ui.js'), 'ordSafeImg') + fn(rd('pos/orders-ui.js'), 'ordSafeId') + '; return { img: ordSafeImg, id: ordSafeId };')();
ok(oi.img('data:image/png;base64,AAAA') !== '' , 'صورة سليمة بتعدّي');
ok(oi.img('data:image/png;base64,AA" onerror="alert(1)') === '' && oi.img('data:image/svg+xml;base64,AAAA') === '' && oi.img('javascript:alert(1)') === '', 'سلبي: صورة فيها حقن / SVG / javascript = مرفوضة');
ok(oi.id('abc_DEF-123') === 'abc_DEF-123' && oi.id("x');alert(1);('") === '' && oi.id('a&#39;b') === '', 'سلبي: id فيه علامات تنصيص أو entities = مرفوض');

/* ---- 5) عرض الجمعة البيضاء مع شراء الموظف ---- */
function promoCtx(extra){
  const calls = []; const w = Object.assign({ cart: [ { id:'p1', barcode:'5', qty:1, price:100 } ], currentBranch: 'echarpe Madinaty', staffPurchase: null }, extra || {});
  w.window = w; w.console = console; w.Intl = Intl; w.Date = function(x){ return x == null ? new Date(Date.UTC(2026, 10, 27, 12)) : new Date(x); }; w.Date.now = ()=> Date.UTC(2026, 10, 27, 12);
  w.renderCart = function(){ calls.push(1); };
  vm.runInNewContext(rd('pos/promo-weekend.js'), w); w.renderCart(); return w;
}
ok(promoCtx().cart[0].price === 85, 'بيع عادي أيام العرض: 15%');
ok(promoCtx({ staffPurchase: { id:'e1' } }).cart[0].price === 100, 'سلبي: شراء الموظف مش بياخد العرض فوق خصمه');
ok(promoCtx({ _ordDelivering: { id:'o1' } }).cart[0].price === 100, 'سلبي: أوردر الأونلاين بسعره المتفق عليه');

/* ---- 6) Office ---- */
const o2 = rd('office2/office2.js');
ok(/PAY_WINDOW_DAYS = 75/.test(o2) && /watch\('sales_shifts', 'clockInTs', paySince/.test(o2), 'Office: الحضور محمّل 75 يوم (مرتب الشهر اللي فات من غير غياب وهمي)');
ok(/e\.commissionPerPoint/.test(fn(o2, 'commOf')), 'Office: العمولة بسعر نقطة الموظف نفسه');
ok(/_payCommBusy\[_k\]/.test(o2), 'Office: دفع العمولة مرتين ورا بعض = مرة واحدة');
ok(/!S\.dataLoaded \|\| S\.loading \|\| S\.err/.test(fn(rd('office2/m-cash.js'), 'autoFreeze')), 'سلبي: الخزنة مش بتجمّد يوم والبيانات ناقصة');
ok(/function dcDayKey/.test(rd('pos/pos-reports.js')) && /dcDayKey\(\)/.test(rd('pos/dayclose-plus.js')), 'قفل اليوم بيوم العمل (مش نص الليل)');
console.log(`\n${fail ? '❌' : '✅'} audit v790: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
