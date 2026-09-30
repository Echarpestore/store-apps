// 30-09-2026 — علم ignoreBranchStock: إيشارب تبيع أونلاين/شات حتى لو جرد الفرع صفر (قرار المالك)
'use strict';
const path = require('path');
// الملف بيحمّل firebase-functions/admin وقت الـrequire — بنستبدلهم بمحاكيات فاضية (نفس نمط spec-finance-transaction-mock)
const Module = require('module');
const _orig = Module._load;
Module._load = function(name, parent, isMain){
  if(name === 'firebase-functions/v2/https') return { onCall: (_o, h) => h, HttpsError: class extends Error { constructor(c, m){ super(m); this.code = c; } } };
  if(name === 'firebase-functions/v2/firestore') return { onDocumentUpdated: () => () => {} };
  if(name === 'firebase-functions/v2/scheduler') return { onSchedule: () => () => {} };
  if(name === 'firebase-admin/firestore') return { getFirestore: () => ({}), FieldValue: {} };
  if(name === 'firebase-admin/app') return { getApps: () => [1], initializeApp: () => {} };
  return _orig.apply(this, arguments);
};
let M;
try { M = require(path.join(__dirname, '..', 'functions', 'onlineOrderPlace.js')); }
finally { Module._load = _orig; }
const item = { barcode: '111', name: 'لاصق', price: 50, active: true, onlineQty: 5 };
const invZero = { qtyByBranch: { 'الرحاب': 0 } };
const invNone = null;
const invSome = { qtyByBranch: { 'الرحاب': 2 } };
const ON = { ignoreBranchStock: true };

// من غير العلم — السلوك القديم حرفيًا (Glow)
assertEq(M.serverAvailable(item, invZero, 'الرحاب'), 0, 'من غير العلم: فرع صفر = 0');
assertEq(M.serverAvailable(item, invNone, 'الرحاب'), 0, 'من غير العلم: مفيش مستند مخزون = 0');
assertEq(M.serverAvailable(item, invSome, 'الرحاب'), 2, 'من غير العلم: الأقل بين 5 و 2 = 2');
assertEq(M.serverAvailable(item, invZero, 'الرحاب', {}), 0, 'cfg فاضي = نفس القديم');
assertEq(M.serverAvailable(item, invZero, 'الرحاب', { ignoreBranchStock: 'true' }), 0, 'سلبي: نص "true" مش true = القديم');
assertEq(M.serverAvailable(item, invZero, 'الرحاب', { ignoreBranchStock: 1 }), 0, 'سلبي: 1 مش true = القديم');

// بالعلم — المتاح = المخصّص أونلاين بس
assertEq(M.serverAvailable(item, invZero, 'الرحاب', ON), 5, 'بالعلم: فرع صفر = 5 (المخصّص)');
assertEq(M.serverAvailable(item, invNone, 'الرحاب', ON), 5, 'بالعلم: مفيش مستند مخزون = 5');
assertEq(M.serverAvailable(Object.assign({}, item, { onlineQty: 0 }), invSome, 'الرحاب', ON), 0, 'سلبي: المخصّص أونلاين صفر = 0 حتى بالعلم');
assertEq(M.serverAvailable(Object.assign({}, item, { active: false }), invSome, 'الرحاب', ON), 0, 'سلبي: صنف موقوف = 0 حتى بالعلم');

// فحص السلة كامل
const okChk = M.serverValidateCart([{ barcode: '111', qty: 2 }], [item], { '111': invZero }, 'الرحاب', ON);
assert(okChk.ok && okChk.items.length === 1 && okChk.items[0].price === 50, 'بالعلم: السلة تعدّي وفرع صفر، والسعر من الكتالوج');
const oldChk = M.serverValidateCart([{ barcode: '111', qty: 2 }], [item], { '111': invZero }, 'الرحاب');
assert(!oldChk.ok && /خلص من الرحاب/.test(oldChk.errors[0]), 'من غير العلم: نفس الرفض القديم بنفس الرسالة');
const zeroAlloc = M.serverValidateCart([{ barcode: '111', qty: 1 }], [Object.assign({}, item, { onlineQty: 0 })], { '111': invSome }, 'الرحاب', ON);
assert(!zeroAlloc.ok && /خلص من الكتالوج أونلاين/.test(zeroAlloc.errors[0]), 'بالعلم: مخصّص صفر = رسالة الكتالوج مش الفرع');
const over = M.serverValidateCart([{ barcode: '111', qty: 9 }], [item], { '111': invZero }, 'الرحاب', ON);
assert(!over.ok && /متاح 5 بس/.test(over.errors[0]), 'بالعلم: سقف المخصّص لسه شغال');
const notInShop = M.serverValidateCart([{ barcode: '999', qty: 1 }], [item], {}, 'الرحاب', ON);
assert(!notInShop.ok && /مش معروض/.test(notInShop.errors[0]), 'سلبي: صنف مش في الكتالوج لسه بيترفض حتى بالعلم');

// الدالة الحية بتمرّر cfg فعلًا
const src = require('fs').readFileSync(path.join(__dirname, '..', 'functions', 'onlineOrderPlace.js'), 'utf8');
assert(src.includes('serverValidateCart(cart, shopItems, invByBarcode, branch, cfg)'), 'onlineOrderPlace بتبعت cfg لفحص السلة');

// ================= العميل — orders-core (نفس العلم) =================
const OC = require(path.join(__dirname, '..', 'pos', 'orders-core.js'));
const prodZero = { barcode: '111', name: 'دبل فيس بوكس', price: 50, qtyByBranch: { 'مدينتي': 0 } };
const cOld = OC.orderValidateCart([{ barcode: '111', qty: 1 }], [prodZero], 'مدينتي', Date.now());
assert(!cOld.ok && /مش موجود في مدينتي/.test(cOld.errors[0]), 'العميل من غير العلم: «مش موجود في مدينتي» زي القديم');
const cOn = OC.orderValidateCart([{ barcode: '111', qty: 1 }], [prodZero], 'مدينتي', Date.now(), { ignoreBranchStock: true });
assert(cOn.ok && cOn.items[0].price === 50, 'العميل بالعلم: بيعدّي وفرع صفر');
const cStr = OC.orderValidateCart([{ barcode: '111', qty: 1 }], [prodZero], 'مدينتي', Date.now(), { ignoreBranchStock: 'true' });
assert(!cStr.ok, 'سلبي: نص "true" مش بيفعّل على العميل');
const cMissing = OC.orderValidateCart([{ barcode: '999', qty: 1 }], [prodZero], 'مدينتي', Date.now(), { ignoreBranchStock: true });
assert(!cMissing.ok && /مش موجود في الكتالوج/.test(cMissing.errors[0]), 'سلبي: صنف مش في الكتالوج لسه بيترفض بالعلم');
const cNoBranch = OC.orderValidateCart([{ barcode: '111', qty: 1 }], [prodZero], '', Date.now(), { ignoreBranchStock: true });
assert(!cNoBranch.ok, 'سلبي: الفرع لسه مطلوب بالعلم');
const fsx = require('fs');
for(const [f, cfgVar] of [['loyalty/index.html', 'shopCfg'], ['glow/index.html', 'shopCfg'], ['index.html', 'wsCfg']]){
  const h = fsx.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert(h.includes('{ ignoreBranchStock: ' + cfgVar + '.ignoreBranchStock === true }'), f + ': بيبعت العلم من إعدادات المتجر لفحص العميل');
  assert(h.includes('orders-core.js?v=2'), f + ': orders-core بإصدار جديد');
}

// ================= sellAllInventory — أي صنف في المحل من الشات =================
const inv = { name: 'دبل فيس بوكس', price: 50, qtyByBranch: { 'مدينتي': 0 } };
const ALL = { sellAllInventory: true, ignoreBranchStock: true };
const a1 = M.serverValidateCart([{ barcode: '777', qty: 2 }], [item], { '777': inv }, 'مدينتي', ALL);
assert(a1.ok && a1.items[0].price === 50 && a1.items[0].name === 'دبل فيس بوكس', 'sellAll: صنف مش في الكتالوج بيعدّي بسعر المخزون');
const a2 = M.serverValidateCart([{ barcode: '777', qty: 1 }], [item], { '777': inv }, 'مدينتي', { ignoreBranchStock: true });
assert(!a2.ok && /مش معروض/.test(a2.errors[0]), 'سلبي: من غير sellAllInventory = الرفض القديم');
const a3 = M.serverValidateCart([{ barcode: '777', qty: 1 }], [item], { '777': inv }, 'مدينتي', { sellAllInventory: 'true', ignoreBranchStock: true });
assert(!a3.ok, 'سلبي: نص "true" مش بيفعّل sellAll');
const a4 = M.serverValidateCart([{ barcode: '777', qty: 1 }], [item], {}, 'مدينتي', ALL);
assert(!a4.ok, 'سلبي: باركود مش في المخزون أصلًا = رفض');
const a5 = M.serverValidateCart([{ barcode: '777', qty: 1 }], [item], { '777': Object.assign({}, inv, { price: 0 }) }, 'مدينتي', ALL);
assert(!a5.ok && /سعره مش متسجل/.test(a5.errors[0]), 'سلبي: صنف من غير سعر = رفض (مفيش أوردر بـ٠)');
const a6 = M.serverValidateCart([{ barcode: '777', qty: 1, price: 1 }], [item], { '777': inv }, 'مدينتي', ALL);
assert(a6.ok && a6.items[0].price === 50, 'سلبي: سعر العميلة بيتجاهل — سعر المخزون بس');
const a7 = M.serverValidateCart([{ barcode: '777', qty: 1 }], [item], { '777': Object.assign({}, inv, { status: 'hidden' }) }, 'مدينتي', ALL);
assert(!a7.ok && /مش متاح/.test(a7.errors[0]), 'سلبي: صنف مخفي = رفض');
const a8 = M.serverValidateCart([{ barcode: '777', qty: 1 }], [item], { '777': inv }, 'مدينتي', { sellAllInventory: true });
assert(!a8.ok && /خلص من مدينتي/.test(a8.errors[0]), 'sellAll من غير ignoreBranchStock: كمية الفرع بتتفحص');
const a9 = M.serverValidateCart([{ barcode: '777', qty: 3 }], [item], { '777': { name: 'x', price: 10, qtyByBranch: { 'مدينتي': 2 } } }, 'مدينتي', { sellAllInventory: true });
assert(!a9.ok && /متاح 2 بس/.test(a9.errors[0]), 'sellAll من غير ignoreBranchStock: سقف كمية الفرع');
const mix = M.serverValidateCart([{ barcode: '111', qty: 1 }, { barcode: '777', qty: 1 }], [item], { '111': invZero, '777': inv }, 'مدينتي', ALL);
assert(mix.ok && mix.items.length === 2, 'سلة مخلوطة (كتالوج + مخزون) بتعدّي');
const shopAfter = M.applyQtyDelta([item], mix.items, -1);
assert(shopAfter[0].onlineQty === 4 && shopAfter.length === 1, 'الخصم على صنف الكتالوج بس — صنف المخزون مش بيتضاف للكتالوج');
