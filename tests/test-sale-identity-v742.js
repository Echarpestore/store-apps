/* 🧪 v742 — «فشل حفظ الفاتورة» + حفظ تاني = نفس الفاتورة مش فاتورتين (بلاغ 26-09). */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pos', 'pos-sale.js'), 'utf8');
let P = 0, F = 0;
const ok = (c, m) => { if (c) { P++; console.log('  ✅ ' + m); } else { F++; console.log('  ❌ ' + m); } };
const blk = src.slice(src.indexOf('let _saleAttempt = null;'), src.indexOf('window._resolveSaleIdentity = _resolveSaleIdentity;'));

function setup(){
  const docs = new Set(); let seq = 0, numbers = 0;
  const env = {
    _cartSid: 'cart_A', TEST_SALES: 'pos_test_sales', currentBranch: 'Glow',
    db: { collection: () => ({ doc: (id) => { const _id = id || ('auto' + (++seq)); return { id: _id, get: async () => ({ exists: docs.has(_id) }) }; } }) },
    _raceTimeout: (p) => p,
    generateInvoiceNumber: async () => String(8190 + (++numbers)),
    buildInvoiceCode: (b, n) => 'GLW-' + n, buildScanCode: (id) => 'S' + id,
  };
  const names = Object.keys(env);
  const api = new Function(...names, blk + '\nreturn { resolve: _resolveSaleIdentity, setSid: (x) => { _cartSid = x; }, attempt: () => _saleAttempt, clear: () => { _saleAttempt = null; } };')(...names.map((n) => env[n]));
  return { api, docs, used: () => numbers };
}

(async () => {
  console.log('\n🔐 v742 — هوية الفاتورة ثابتة للسلة');
  {
    const { api, docs, used } = setup();
    const a = await api.resolve();
    docs.add(a.saleId);                                    // الحفظ الأول نجح فعلًا (والشاشة قالت «فشل»)
    const b = await api.resolve();                         // الكاشير داس حفظ تاني
    ok(b.alreadySaved === true && b.saleId === a.saleId && b.invoiceCode === a.invoiceCode, '🔴 الفاتورة اتحفظت + حفظ تاني = «اتحفظت خلاص» بنفس الرقم (مش فاتورة جديدة)');
    ok(used() === 1, 'مفيش رقم فاتورة اتحرق للمحاولة التانية');
  }
  {
    const { api, used } = setup();
    const a = await api.resolve();                         // الحفظ الأول فشل فعلًا (مفيش مستند)
    const b = await api.resolve();
    ok(b.alreadySaved === false && b.saleId === a.saleId && b.invoiceCode === a.invoiceCode && used() === 1, 'الحفظ فشل فعلًا ← المحاولة التانية بتكمّل بنفس الرقم');
  }
  {
    const { api, docs } = setup();
    const a = await api.resolve(); docs.add(a.saleId);
    api.clear();                                           // الفاتورة خلصت بنجاح
    api.setSid('cart_B');                                  // سلة جديدة
    const b = await api.resolve();
    ok(b.saleId !== a.saleId && b.alreadySaved === false, 'سلة جديدة = فاتورة جديدة برقم جديد');
  }
  {
    const { api, docs } = setup();
    api.setSid(null);                                      // سلة من غير معرّف
    const a = await api.resolve(); docs.add(a.saleId);
    const b = await api.resolve();
    ok(b.saleId !== a.saleId, 'من غير معرّف سلة: مبنعيدش استخدام رقم (عشان سلتين مختلفتين ميتلخبطوش)');
  }
  const body = src.slice(src.indexOf('async function _doConfirmPayment(){'));
  ok(/const _ident = await _resolveSaleIdentity\(\);/.test(body) && /if\(_ident\.alreadySaved\)\{[\s\S]{0,700}goToSale\(\);\s*return;/.test(body), '_doConfirmPayment بيستخدم الهوية الثابتة ويقف لو الفاتورة اتحفظت');
  ok(/_saleAttempt = null;\s*\/\/ v742: الفاتورة خلصت/.test(body), 'بعد النجاح الهوية بتتصفّر (السلة الجاية تاخد رقم جديد)');
  console.log(`\nالنتيجة: ${P} ناجح · ${F} فاشل`);
  if (typeof assert === 'function') assert(F === 0, 'test-sale-identity-v742: ' + F);
  else if (F) process.exitCode = 1;
})();
