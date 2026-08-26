// ============================================================
// 💳🔒 test-card-cart-freeze-v345
// يمنع تكرار سيناريو: الماكينة تستلم 1220، ثم السلة تنقص 350 إلى 870،
// فيتحفظ 870 بينما العميلة اتسحب منها 1220.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');

function assert(cond, msg){ if(!cond) throw new Error('FAIL: ' + msg); console.log('✅ ' + msg); }
function assertEq(a, b, msg){ assert(a === b, msg + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }

function extractFn(s, sig){
  const i = s.indexOf(sig); if(i < 0) return '';
  let j = s.indexOf('{', i), d = 0;
  for(let k=j; k<s.length; k++){
    if(s[k] === '{') d++;
    else if(s[k] === '}' && --d === 0) return s.slice(i, k+1);
  }
  return '';
}

// 1) السلوك نفسه: قبل إرسال الكارت التعديل مفتوح، وبعد الإرسال مقفول.
{
  const f1 = extractFn(src, 'function cardApprovedSum(legs)');
  const f2 = extractFn(src, 'function cardCartEditBlockReason()');
  assert(f1 && f2, 'لقينا حارس تجميد السلة ودالة مجموع الكارت');
  const box = { Math, Number };
  box.cardLegs = [];
  box._cardMoneyAtRiskAt = null;
  box._cardAdjustmentMode = false;
  vm.createContext(box);
  vm.runInContext(f1 + '\n' + f2, box);

  assertEq(vm.runInContext('cardCartEditBlockReason()', box), null,
    'قبل إرسال الفيزا: تعديل السلة مسموح');

  box._cardMoneyAtRiskAt = 123456;
  const pendingMsg = vm.runInContext('cardCartEditBlockReason()', box);
  assertEq(pendingMsg, 'pending',
    'بعد إرسال 1220 للماكينة: السلة تتقفل حتى قبل الموافقة');

  box.cardLegs = [{seq:1, amount:1220, status:'approved'}];
  const approvedMsg = vm.runInContext('cardCartEditBlockReason()', box);
  assertEq(approvedMsg, 'approved',
    'بعد سحب 1220 فعلًا: الحارس يحوّل المسار لتأكيد Smart Adjustment');
}

// 2) كل المداخل التي كانت تقدر تنقص/تغيّر السلة لازم تمر على نفس الحارس.
{
  const guarded = [
    'function addToCart(item)',
    'function cartSetQty(idx, val)',
    'function cartQty(idx, delta)',
    'function cartRemove(idx)',
    'function returnItemFromInvoice(itemIdx)',
    'function qbxReturnWholeInvoice()',
    'function returnCartItem(idx)',
    'function splitCartLine(idx)',
    'function changeQty(idx, delta)',
    'function removeFromCart(idx)',
    'async function openGiveDiscount()',
    'async function openRedeemPoints()',
    'function applyCustomerReward()',
    'function applyPendingRedeem()'
  ];
  guarded.forEach(sig => {
    const fn = extractFn(src, sig);
    assert(fn && fn.indexOf('blockCartEditAfterCard()') >= 0,
      sig + ' مقفولة بحارس الفيزا');
  });

  const offers = extractFn(src, 'function applyCustomerOffers()');
  assert(offers.indexOf('cardCartEditBlockReason()') >= 0,
    'العروض التلقائية لا تغيّر السعر أثناء انتظار/بعد سحب الفيزا');

  const editAt = src.indexOf('function qbxEditSel()');
  const editBlock = src.slice(editAt, editAt + 9000);
  assert(editBlock.indexOf('if(blockCartEditAfterCard()) return;') >= 0,
    'تعديل السعر/الكمية من نافذة Edit مقفول بعد إرسال الفيزا');
}

// 3) لو الطلب اتلغى قبل أي موافقة، السلة تتفتح تاني. لو اتسحب فعلًا تفضل مقفولة.
{
  const reset = extractFn(src, 'function paymobReset()');
  assert(reset.indexOf('if(!_cardFirstApprovedAt)') >= 0
      && reset.indexOf('_cardMoneyAtRiskAt = null') >= 0,
    'إلغاء طلب غير مدفوع يفك تجميد السلة فقط لو مفيش موافقة كارت');
}

console.log('✅ test-card-cart-freeze-v345 passed');
