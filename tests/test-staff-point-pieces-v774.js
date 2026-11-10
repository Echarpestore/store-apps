// 🧪 v774 — ثغرة «4 قطع + مسح كارت العميلة = نقطة للبياعة»
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SALE = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'pos', 'index.html'), 'utf8');
function extractFn(src, name){
  const start = src.indexOf('function ' + name + '('); if(start < 0) return '';
  let i = src.indexOf('{', start), d = 0;
  for(; i < src.length; i++){ if(src[i] === '{') d++; else if(src[i] === '}'){ d--; if(d === 0) return src.slice(start, i + 1); } }
  return '';
}
const ctx = {}; vm.createContext(ctx);
vm.runInContext(extractFn(SALE, 'staffPieceCount') + '\n' + extractFn(SALE, 'calcStaffPoint') + '\nthis.cnt = staffPieceCount; this.pt = calcStaffPoint;', ctx);
let pass = 0, fail = 0; const ok = (c, m)=>{ if(c){ pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
const four = [{ id:'a', price:300, qty:2 }, { id:'b', price:250, qty:2 }];
const point = (lines)=> ctx.pt(ctx.cnt(lines), 1100, 5, 0, true, false);
ok(ctx.cnt(four) === 4 && point(four) === 0, '4 قطع = مفيش نقطة');
ok(point(four.concat([{ id:'__loyalty_redemption__', price:-50, qty:1, isRedemption:true, redeemSource:'app' }])) === 0, 'سلبي: 4 قطع + مسح كارت العميلة (استبدال من التطبيق) = مفيش نقطة');
ok(point(four.concat([{ id:'__loyalty_redemption__', price:-50, qty:1, isRedemption:true, redeemSource:'manual' }])) === 0, 'سلبي: 4 قطع + استبدال يدوي = مفيش نقطة');
ok(point(four.concat([{ id:'__reward__', price:-100, qty:1, isRewardDiscount:true }])) === 0, 'سلبي: 4 قطع + مكافأة = مفيش نقطة');
ok(point(four.concat([{ id:'__credit_spend__', price:-80, qty:1, isRedemption:true, isCreditSpend:true }])) === 0, 'سلبي: 4 قطع + خصم رصيد = مفيش نقطة');
ok(point(four.concat([{ id:'__gift_card__x', price:500, qty:1, isGiftCard:true }])) === 0, 'سلبي: 4 قطع + كارت هدية = مفيش نقطة');
ok(point(four.concat([{ id:'r', price:-300, qty:1, isReturn:true }])) === 0, 'سلبي: 4 قطع + قطعة مرتجعة (تبديل) = مفيش نقطة');
ok(point(four.concat([{ id:'f', price:0, qty:1 }])) === 0, 'سلبي: قطعة ببلاش مش بتتعد');
ok(point(four.concat([{ id:'c', price:200, qty:1 }])) === 1, '5 قطع حقيقية = نقطة');
ok(point([{ id:'a', price:300, qty:6 }, { id:'r', price:-300, qty:1, isReturn:true }]) === 1, 'تبديل: 6 قطع ناقص 1 مرتجع = 5 = نقطة');
ok(/const staffPieces = staffPieceCount\(cart\);/.test(SALE) && /calcStaffPoint\(staffPieces,/.test(SALE), 'الحفظ بيحسب النقطة من القطع الحقيقية');
ok(/itemCount: staffPieces, cartLines: itemCount/.test(SALE), 'سجل النقطة بيكتب عدد القطع الحقيقي');
ok(/pos-sale\.js\?v=(77[4-9]|7[89]\d|[89]\d\d)/.test(HTML), 'POS بيحمّل النسخة الجديدة');
console.log(`\n${fail ? '❌' : '✅'} staff point pieces v774: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
