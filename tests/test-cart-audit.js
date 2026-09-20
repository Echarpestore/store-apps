#!/usr/bin/env node
// ============================================================
// test-cart-audit.js (v710) — سجل تدقيق السلة: كل طريق لشيل صنف بيسيب أثر
// سلوك فعلي: بنشغّل دوال السلة نفسها ونعدّ اللي اتسجل.
// يتشغّل لوحده: node tests/test-cart-audit.js
// ============================================================
'use strict';
require('./helpers/swv');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const sale = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');
const office = fs.readFileSync(path.join(ROOT, 'Office', 'office.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; } else { fail++; console.error('  ❌ ' + m); } };
function extractFn(src, header){
  const at = src.indexOf(header);
  if(at < 0) throw new Error('extractFn: مش لاقي «' + header + '»');
  let i = src.indexOf('{', at + header.length - 1), depth = 0, q = null;
  for(; i < src.length; i++){
    const c = src[i];
    if(q){ if(c === '\\'){ i++; continue; } if(c === q) q = null; continue; }
    if(c === '/' && src[i+1] === '/'){ while(i < src.length && src[i] !== '\n') i++; continue; }
    if(c === '/' && src[i+1] === '*'){ i = src.indexOf('*/', i) + 1; continue; }
    if(c === '"' || c === "'" || c === '`'){ q = c; continue; }
    if(c === '{') depth++;
    else if(c === '}'){ depth--; if(depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error('extractFn: أقواس مش متوازنة «' + header + '»');
}
const a0 = sale.indexOf('const CART_LATE_REMOVAL_SEC'), a1 = sale.indexOf('window._cartStamp = _cartStamp;');
if(a0 < 0 || a1 < a0) throw new Error('بلوك التدقيق مش موجود في pos-sale.js');
const code = sale.slice(a0, a1) + '\n' + ['function cartSetQty(', 'function cartQty(', 'function cartRemove(', 'function changeQty(', 'function removeFromCart(']
  .map(h => extractFn(sale, h)).join('\n');

function mk(){
  const st = { logs:[], now: 1000000 };
  const ctx = { st, window:{}, WeakMap, Math, Number, String, Object, parseInt, isNaN,
    Date: { now: () => st.now },
    _logActivity: (t, d) => st.logs.push(Object.assign({ type:t }, JSON.parse(JSON.stringify(d)))),
    blockCartEditAfterCard: () => false, renderCart(){}, _trackEditAfterCard(){}, cartTotal: () => 100,
    searchBar: { focus(){} }, showToast(){}, updatePaySummary(){}, document:{ getElementById: () => null } };
  vm.createContext(ctx);
  vm.runInContext('let cart = []; let selectedCartIdx = null; let pendingRedemption = null; let _cartFirstItemAt = 0;\n' + code
    + ';this.add = function(o){ cart.push(o); _cartStamp(o); return o; }; this.cartRef = () => cart; this.setFirst = v => { _cartFirstItemAt = v; };', ctx);
  return ctx;
}
const item = (o) => Object.assign({ id:'p1', name:'طرحة شيفون', barcode:'ECH100', price:250, qty:3 }, o || {});

console.log('\n🕳️ 1) الطرق اللي كانت **من غير أي أثر** قبل v710');
let c = mk(); c.add(item()); c.st.now += 5000; c.removeFromCart(0);
ok(c.st.logs.length === 1 && c.st.logs[0].type === 'item_removed', 'زرار «حذف» / مفتاح Delete = بيتسجل');
ok(c.st.logs[0].qty === 3 && c.st.logs[0].value === 750 && c.st.logs[0].name === 'طرحة شيفون', 'بالكمية والقيمة (3 × 250 = 750)');
ok(/Delete/.test(c.st.logs[0].how), 'والطريقة مكتوبة');
ok(c.cartRef().length === 0, 'والصنف اتشال فعلًا');
c = mk(); c.add(item()); c.st.now += 5000; c.changeQty(0, -1);
ok(c.st.logs.length === 1 && c.st.logs[0].type === 'item_qty_reduced' && c.st.logs[0].qtyBefore === 3 && c.st.logs[0].qtyAfter === 2 && c.st.logs[0].qty === 1, '− في شريط الأدوات: تقليل 3→2 بيتسجل');
c = mk(); c.add(item({ qty:1 })); c.changeQty(0, -1);
ok(c.st.logs.length === 1 && c.st.logs[0].type === 'item_removed' && c.cartRef().length === 0, '− لحد الصفر = شيل كامل بيتسجل');
c = mk(); c.add(item()); c.cartSetQty(0, '1');
ok(c.st.logs.length === 1 && c.st.logs[0].type === 'item_qty_reduced' && c.st.logs[0].qty === 2 && c.st.logs[0].value === 500, 'كتابة الكمية 3→1 = تقليل قطعتين بقيمة 500');
c = mk(); c.add(item()); c.cartQty(0, -1);
ok(c.st.logs.length === 1 && c.st.logs[0].type === 'item_qty_reduced', 'زرار − في السطر بيتسجل');
c = mk(); c.add(item()); c.cartRemove(0);
ok(c.st.logs.length === 1 && c.st.logs[0].type === 'item_removed' && c.st.logs[0].cartCountAfter === 0, 'زرار 🗑️ لسه بيتسجل (وبنفس حقل `cartCountAfter` القديم)');
c = mk(); c.add(item({ qty:1 })); c.cartQty(0, -1);
ok(c.st.logs.length === 1 && c.cartRef().length === 0, '− في السطر لحد الصفر = تسجيل **واحد** مش اتنين');
c = mk(); c.add(item()); c.cartSetQty(0, '0');
ok(c.st.logs.length === 1 && c.st.logs[0].type === 'item_removed', 'كتابة صفر = شيل كامل، تسجيل واحد');

console.log('⏱️ 2) عمر القطعة في السلة');
c = mk(); c.add(item()); c.st.now += 4000; c.cartRemove(0);
ok(c.st.logs[0].inCartSec === 4 && c.st.logs[0].type === 'item_removed', 'اتشال بعد 4 ثواني = مسحة غلط، نوع عادي');
c = mk(); c.add(item()); c.st.now += 89000; c.cartRemove(0);
ok(c.st.logs[0].type === 'item_removed', '89 ثانية = لسه عادي');
c = mk(); c.add(item()); c.st.now += 90000; c.removeFromCart(0);
ok(c.st.logs[0].type === 'item_removed_late' && c.st.logs[0].inCartSec === 90, '90 ثانية = `item_removed_late` (hot عند المالك)');
c = mk(); c.add(item()); c.st.now += 200000; c.cartSetQty(0, '1');
ok(c.st.logs[0].type === 'item_removed_late' && c.st.logs[0].qtyAfter === 1, 'تقليل كمية متأخر = برضه late، ومعاه قبل/بعد');
c = mk(); const l1 = c.add(item({ id:'a' })); c.st.now += 300000; const l2 = c.add(item({ id:'b', name:'بيچامة' })); c.st.now += 3000; c.cartRemove(1);
ok(c.st.logs[0].name === 'بيچامة' && c.st.logs[0].inCartSec === 3 && c.st.logs[0].type === 'item_removed', 'الوقت **لكل سطر لوحده** — صنف جديد في سلة قديمة مش late');
c = mk(); c.setFirst(1000000 - 600000); c.cartRef().push(item()); c.cartRemove(0);
ok(c.st.logs[0].inCartSec === 600 && c.st.logs[0].type === 'item_removed_late', 'سلة مسترجعة من مسودة (مفيش طابع) = الوقت من أول صنف في السلة');
c = mk(); c.add(item()); c.st.now += 100000; c.cartQty(0, +1); c.st.now += 2000; c.cartRemove(0);
ok(c.st.logs.length === 1 && c.st.logs[0].inCartSec === 102, 'الزيادة مبتتسجلش ومبتصفّرش عمر السطر');

console.log('🧹 3) اللي **مبيتسجلش** + نظافة البيانات');
c = mk(); c.add({ id:'redeem-1', isRedemption:true, name:'استبدال نقط', price:-50, qty:1 }); c.removeFromCart(0);   // id عادي عمدًا: القاعدتين (isRedemption و`__`) كل واحدة بتتختبر لوحدها
ok(c.st.logs.length === 0, 'شيل سطر استبدال النقط = مش بضاعة، مبيتسجلش');
c = mk(); c.add({ id:'__reward_1', name:'خصم مكافأة', price:-30, qty:1 }); c.cartRemove(0);
ok(c.st.logs.length === 0, 'شيل خصم المكافأة = مبيتسجلش');
c = mk(); c.add(item({ isReturn:true, price:-250 })); c.cartRemove(0);
ok(c.st.logs.length === 1 && c.st.logs[0].isReturn === true && c.st.logs[0].value === 750, 'سطر مرتجع بيتسجل بعلامته والقيمة موجبة');
c = mk(); const ln = c.add(item()); c.cartQty(0, -1);
ok(Object.keys(ln).every(k => k[0] !== '_'), 'مفيش حقول `_` بتتحط على سطر السلة (`items: cart` بتتحفظ خام في الفاتورة)');
c = mk(); c.add(item()); c.changeQty(5, -1); c.cartQty(9, -1); c.cartRemove(9); c.removeFromCart(9);
ok(c.st.logs.length === 0 && c.cartRef().length === 1, 'فهرس غلط = مفيش تسجيل ولا كراش');

console.log('🔌 4) التوصيل');
const add = extractFn(sale, 'function addToCart(');
ok(/existing\.qty \+= 1; _cartStamp\(existing\);/.test(add) && /_cartStamp\(cart\[cart\.length - 1\]\);/.test(add), 'المسح بيطبع الوقت (سطر جديد وزيادة كمية) — من غير أي كتابة Firestore');
ok(!/_logActivity\(/.test(add.slice(add.indexOf('const existing'))), 'ومفيش `_logActivity` لكل مسحة (التكلفة بس لحظة الشيل)');
ok(/if\(v\.qty < _oq\) _cartLogRemoval\(line, _oq - v\.qty, 'شاشة تعديل الصنف'/.test(sale), 'شاشة تعديل الصنف: تقليل الكمية بيتسجل');
ok(!/_logActivity\('item_removed'/.test(sale), 'مفيش تسجيل شيل برّه `_cartLogRemoval` (مصدر واحد)');
['item_qty_reduced', 'item_removed_late'].forEach(t => {
  ok(new RegExp('\\n\\s*' + t + ':\\s*\\{ t:\'').test(office), 'Office: `' + t + '` ليه اسم عربي');
  ok(office.includes("if(type === '" + t + "') return "), 'Office: `' + t + '` ليه شرح للمالك');
});
ok(/item_removed_late:\s*\{[^}]*hot:true/.test(office), 'Office: الشيل المتأخر **hot**');
['inCartSec', 'value', 'how', 'qtyBefore', 'qtyAfter'].forEach(k => ok(new RegExp('\\b' + k + ":'").test(office), 'Office: الحقل `' + k + '` بالعربي'));
ok(swAtLeast(fs.readFileSync(path.join(ROOT, 'pos', 'sw.js'), 'utf8'), 710), 'POS CACHE_NAME ≥ v710');
ok(swAtLeast(fs.readFileSync(path.join(ROOT, 'Office', 'sw.js'), 'utf8'), 681), 'Office CACHE_NAME ≥ v681');

console.log('\n' + (fail ? '❌' : '✅') + ' test-cart-audit: ' + pass + ' ناجح · ' + fail + ' فاشل');
if(fail) process.exitCode = 1;
