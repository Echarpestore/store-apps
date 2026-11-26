// 🧪 v775 — عرض الويك إند (26–29 نوفمبر) فروع إيشارب: أكواد بسعر ثابت · البندانة 4 بـ150 · الباقي 15%
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pos', 'promo-weekend.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'pos', 'index.html'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m)=>{ if(c){ pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
function boot(){
  const ctx = { console, Intl, Date, Math, Number, String, Object, window:{}, GLOW_BRANCHES:['Glow'] };
  ctx.window = ctx; ctx._brandOfBranch = (br)=> ctx.GLOW_BRANCHES.includes(br) ? 'glow' : 'echarpe';
  ctx.renderCart = function(){ ctx.rendered = (ctx.rendered||0) + 1; };
  ctx.cardCartEditBlockReason = ()=> ''; ctx.staffPurchase = null;
  vm.createContext(ctx); vm.runInContext(SRC, ctx); return ctx;
}
const C = boot(); const ap = C.applyWeekendPromo;
const THU = Date.parse('2026-11-26T08:00:00Z'), SUN_NIGHT = Date.parse('2026-11-29T21:30:00Z'), MON = Date.parse('2026-11-29T22:30:00Z'), WED = Date.parse('2026-11-25T21:00:00Z');
const R = 'echarpe El Rehab';
const L = (bc, price, qty, extra)=> Object.assign({ id:'p'+bc, barcode:bc, name:'x', price, qty:qty||1 }, extra||{});
const tot = (cart)=> Math.round(cart.reduce((s,c)=> s + c.price*c.qty, 0)*100)/100;

let cart = [L('902', 700), L('832', 420), L('60', 650), L('582', 250), L('138', 700), L('749', 180), L('746', 600)];
ap(cart, THU, R);
ok(cart.map(c=>c.price).join(',') === '490,350,550,199,595,135,510', 'الأكواد السبعة بالأسعار المطلوبة');
ok(cart.every(c=> c.originalPrice > c.price && /عرض الويك إند/.test(c.discountName)), 'الفاتورة بتوضح السعر الأصلي واسم العرض');
cart = [L('999', 200, 2)]; ap(cart, THU, R);
ok(cart[0].price === 170, 'أي صنف تاني = خصم 15%');
cart = [L('45', 50, 4)]; ap(cart, THU, R); ok(tot(cart) === 150, 'بندانة 4 قطع = 150');
cart = [L('45', 50, 8)]; ap(cart, THU, R); ok(tot(cart) === 300, 'بندانة 8 قطع = 300');
cart = [L('45', 50, 5)]; ap(cart, THU, R); ok(tot(cart) === 192.5, 'بندانة 5 = 150 + واحدة بخصم 15% (42.5)');
cart = [L('45', 50, 3)]; ap(cart, THU, R); ok(tot(cart) === 127.5, 'بندانة 3 = خصم 15% بس (لسه مكمّلوش 4)');
cart[0].qty = 4; ap(cart, THU, R); ok(tot(cart) === 150, 'زودت الرابعة → السعر اتظبط لوحده 150');
cart[0].qty = 2; ap(cart, THU, R); ok(tot(cart) === 85, 'شالت قطعتين → رجع 15% (85)');
cart = [L('45', 50, 2), L('45', 50, 2, { id:'p45b', noMerge:true })]; ap(cart, THU, R); ok(tot(cart) === 150, 'بندانة في سطرين (2+2) = 150');
cart = [L('45', 30, 4)]; ap(cart, THU, R); ok(tot(cart) === 102, 'لو سعرها أصلًا رخيص: الأحسن للعميلة (15% = 102 مش 150)');
cart = [L('832', 300)]; ap(cart, THU, R); ok(cart[0].price === 255, 'كود سعره أقل من سعر العرض → مايغلاش عليها (15% = 255)');
cart = [L('999', 200, 1, { price:150, originalPrice:200, discountName:'خصم الفرع' })]; ap(cart, THU, R);
ok(cart[0].price === 150 && cart[0].discountName === 'خصم الفرع', 'خصم تاني أحسن شغال → يفضل هو (مش بيتجمعوا)');
// سلبي
cart = [L('902', 700)]; ap(cart, WED, R); ok(cart[0].price === 700, 'سلبي: الأربع 25 = مفيش عرض');
cart = [L('902', 700)]; ap(cart, MON, R); ok(cart[0].price === 700, 'سلبي: الاتنين 30 (القاهرة) = مفيش عرض');
cart = [L('902', 700)]; ap(cart, SUN_NIGHT, R); ok(cart[0].price === 490, 'الأحد 11:30 بالليل القاهرة لسه شغال');
cart = [L('902', 700)]; ap(cart, THU, 'Glow'); ok(cart[0].price === 700, 'سلبي: فرع Glow = مفيش عرض');
cart = [L('902', 700)]; ap(cart, THU, 'echarpe office'); ok(cart[0].price === 700, 'سلبي: echarpe office مش فرع بيع');
cart = [L('902', -700, 1, { isReturn:true })]; ap(cart, THU, R); ok(cart[0].price === -700, 'سلبي: المرتجع بسعره');
cart = [{ id:'__loyalty_redemption__', price:-50, qty:1, isRedemption:true }]; ap(cart, THU, R); ok(cart[0].price === -50, 'سلبي: سطر الاستبدال ميتلمسش');
cart = [L('902', 600, 1, { edited:true })]; ap(cart, THU, R); ok(cart[0].price === 600, 'سلبي: الكاشير عدّلت السعر بإيدها → سعرها');
cart = [L('999', 200)]; ap(cart, THU, R); cart[0].price = cart[0].price * 0.9; ap(cart, THU, R);
ok(cart[0].price === 153, 'خصم على إجمالي الفاتورة بعد العرض → مايترجعش (153)');
cart = [L('999', 200)]; ap(cart, THU, R); ap(cart, MON, R); ok(cart[0].price === 200 && cart[0].discountName == null, 'العرض خلص والسلة مفتوحة → السعر يرجع');
cart = [L('999', 200)]; ap(cart, THU, R); ap(cart, THU, R); ap(cart, THU, R); ok(cart[0].price === 170, 'إعادة الرسم كتير مبتخصمش مرتين');
// الربط
C.cart = [L('902', 700)]; C.currentBranch = R; C.Date = { now: ()=> THU }; 
ok(C.renderCart.__promoWrapped === true, 'renderCart متلفوف بالعرض');
ok(/<script src="promo-weekend\.js\?v=\d+"><\/script>/.test(HTML) && HTML.indexOf('promo-weekend.js') > HTML.indexOf('pos-sale.js'), 'POS بيحمّل العرض بعد pos-sale.js');
console.log(`\n${fail ? '❌' : '✅'} weekend promo v775: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
