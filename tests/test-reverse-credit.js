/* 🧪 عكس فاتورة فيها رصيد — node tests/test-reverse-credit.js (من جذر الريبو) */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'pos/reverse-credit.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'pos/index.html'), 'utf8');
const sale = fs.readFileSync(path.join(ROOT, 'pos/pos-sale.js'), 'utf8');
const M = require(path.join(ROOT, 'pos/reverse-credit.js'));
let p = 0, f = 0;
const t = async (n, fn) => { try { await fn(); p++; console.log('  ✅ ' + n); } catch (e) { f++; console.log('  ❌ ' + n + ' → ' + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw Error((m || '') + ' وجه ' + JSON.stringify(a) + ' والمتوقع ' + JSON.stringify(b)); };
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

/* بيئة مصغّرة: فاتورة واحدة في "القاعدة" + reverseReceipt أصلية بتعلّم reversed */
function make(doc, opts) {
  opts = opts || {};
  const calls = [], toasts = [];
  const store = { S1: doc };
  const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
  ctx.window = ctx; ctx.TEST_SALES = 'sales'; ctx.currentBranch = 'الرحاب';
  ctx.showToast = (m, k) => toasts.push({ m, k });
  ctx.db = { collection: () => ({ doc: id => ({ get: async () => ({ exists: !!store[id], data: () => JSON.parse(JSON.stringify(store[id])) }) }) }) };
  ctx.firebase = { app: () => ({ functions: () => ({ httpsCallable: name => async payload => {
    calls.push({ name, payload }); if (opts.fnFail) throw new Error('net'); return { data: opts.fnResult || { balance: 1 } }; } }) }) };
  ctx.reverseReceipt = async id => { if (!opts.cancel) store[id].reversed = true; return 'orig'; };
  vm.runInContext(src, ctx);
  return { ctx, calls, toasts };
}
const NEW = { invoiceCode: 'INV-1', customerPhone: '01012345678', total: 350, payments: { credit: 350 }, items: [{ price: 350, qty: 1 }] };

(async () => {
  console.log('\n🧮 المبلغ');
  await t('الشكل الجديد: payments.credit موجب', () => eq(M.reverseCreditAmount(NEW), 350));
  await t('مرتجع لرصيد: سالب', () => eq(M.reverseCreditAmount({ payments: { credit: -350 } }), -350));
  await t('الشكل القديم: سطر isCreditSpend', () => eq(M.reverseCreditAmount({ payments: {}, items: [{ price: 350, qty: 1 }, { price: -120.5, qty: 1, isCreditSpend: true, isRedemption: true }] }), 120.5));
  await t('⭐ استبدال نقط (isRedemption بس) مش رصيد', () => eq(M.reverseCreditAmount({ items: [{ price: -50, qty: 1, isRedemption: true }] }), 0));
  await t('فاتورة كاش = صفر', () => eq(M.reverseCreditAmount({ payments: { cash: 350 } }), 0));
  await t('رقم العميلة بيتنضّف ويترفض لو غلط', () => { eq(M.reverseCreditPhone({ customerPhone: '010 1234-5678' }), '01012345678'); eq(M.reverseCreditPhone({ customerPhone: '123' }), ''); eq(M.reverseCreditPhone({}), ''); });

  console.log('\n↩️ العكس');
  await t('⭐⭐ فاتورة برصيد اتعكست → +350 للعميلة', async () => {
    const e = make({ ...NEW }); const out = await e.ctx.reverseReceipt('S1');
    eq(out, 'orig', 'نتيجة الأصلية'); eq(e.calls.length, 1);
    const c = e.calls[0]; eq(c.name, 'creditAdjust'); eq(c.payload.amount, 350); eq(c.payload.phone, '01012345678');
    eq(c.payload.source, 'refund'); eq(c.payload.invoiceCode, 'INV-1'); eq(c.payload.idem, 'reverse:INV-1:01012345678:350.00');
  });
  await t('⭐⭐ مرتجع لرصيد اتعكس → −350', async () => {
    const e = make({ ...NEW, total: -350, payments: { credit: -350 } }); await e.ctx.reverseReceipt('S1');
    eq(e.calls[0].payload.amount, -350); eq(e.calls[0].payload.idem, 'reverse:INV-1:01012345678:-350.00');
  });
  await t('السحب المستني موافقة بيتقال للكاشير', async () => {
    const e = make({ ...NEW, payments: { credit: -350 } }, { fnResult: { queued: true } }); await e.ctx.reverseReceipt('S1');
    if (!/موافقة المالك/.test(e.toasts[0].m)) throw Error('مفيش تنبيه');
  });
  await t('⭐⭐ الكاشير لغت التأكيد → ولا حركة رصيد', async () => {
    const e = make({ ...NEW }, { cancel: true }); await e.ctx.reverseReceipt('S1'); eq(e.calls.length, 0);
  });
  await t('⭐ فاتورة معكوسة من قبل → ولا حركة (مفيش رصيد مرتين)', async () => {
    const e = make({ ...NEW, reversed: true }); await e.ctx.reverseReceipt('S1'); eq(e.calls.length, 0);
  });
  await t('فاتورة كاش → الأصلية تشتغل وخلاص', async () => {
    const e = make({ ...NEW, payments: { cash: 350 } }); eq(await e.ctx.reverseReceipt('S1'), 'orig'); eq(e.calls.length, 0); eq(e.toasts.length, 0);
  });
  await t('من غير رقم عميلة → تنبيه عالي من غير نداء', async () => {
    const e = make({ ...NEW, customerPhone: '' }); await e.ctx.reverseReceipt('S1'); eq(e.calls.length, 0); eq(e.toasts[0].k, 'err');
  });
  await t('فشل السيرفر → تنبيه عالي والعكس مايتأثرش', async () => {
    const e = make({ ...NEW }, { fnFail: true }); eq(await e.ctx.reverseReceipt('S1'), 'orig'); eq(e.toasts[0].k, 'err');
  });

  console.log('\n🧾 عكس الفواتير القديمة (السطور الوهمية)');
  function invLoop() {
    const fi = sale.indexOf('async function reverseReceipt'); if (fi < 0) throw Error('reverseReceipt مش موجودة');
    const st = sale.indexOf('(sale.items||[]).forEach(it=>{', fi); if (st < 0) throw Error('حلقة المخزون مش موجودة');
    // الأقواس المتوازنة بتبدأ من قوس `forEach(` مش من `(sale.items` — الأول بيقفل بدري
    const open = sale.indexOf('.forEach(', st) + '.forEach'.length;
    let d = 0, k = open; for (; k < sale.length; k++) { if (sale[k] === '(') d++; else if (sale[k] === ')') { d--; if (!d) break; } }
    const body = sale.slice(st, k + 1);
    if (!/batch\.update/.test(body)) throw Error('الاستخراج ماجابش الحلقة كاملة');   // حارس الفشل الوهمي
    return body + ';';
  }
  function runLoop(items) {
    const ups = [];
    const ctx = vm.createContext({ sale: { items }, currentBranch: 'الرحاب', TEST_INVENTORY: 'inv',
      db: { collection: () => ({ doc: id => ({ id }) }) }, batch: { update: (ref, v) => ups.push({ id: ref.id, v }) },
      firebase: { firestore: { FieldValue: { increment: n => n } } } });
    vm.runInContext(invLoop(), ctx); return ups;
  }
  await t('⭐⭐ السطور الوهمية مبتلمسش المخزون', () => {
    const ups = runLoop([{ id: 'A1', qty: 2 }, { id: '__credit_spend__', qty: 1, isCreditSpend: true, isRedemption: true },
      { id: '__loyalty_redemption__', qty: 1, isRedemption: true }, { id: '__reward__', qty: 1, isRewardDiscount: true }]);
    eq(ups.length, 1); eq(ups[0].id, 'A1'); eq(ups[0].v['qtyByBranch.الرحاب'], 2);
  });
  await t('سطر المرتجع لسه بيتعكس بالسالب', () => { const u = runLoop([{ id: 'B2', qty: 1, isReturn: true }]); eq(u[0].v['qtyByBranch.الرحاب'], -1); });
  await t('سطر من غير id مبيكسرش', () => eq(runLoop([{ qty: 1 }, null, { id: 'A1', qty: 1 }]).length, 1));

  console.log('\n📦 التحميل');
  await t('بعد pos-sale.js وبعد tender-pos.js', () => { const h = html.replace(/<!--[\s\S]*?-->/g, ''); const i = n => { const k = h.indexOf('src="' + n); if (k < 0) throw Error(n); return k; }; if (!(i('pos-sale.js') < i('tender-pos.js') && i('tender-pos.js') < i('reverse-credit.js'))) throw Error('الترتيب'); });
  await t('pos-sale.js ماتلمسش', () => { if (/reverse-credit|reverseCreditAmount/.test(sale)) throw Error('دخل pos-sale'); });
  await t('ممنوع prompt/confirm/alert', () => { if (/\b(prompt|confirm|alert)\s*\(/.test(strip(src))) throw Error(); });
  await t('CACHE_NAME اترفع', () => { const v = +fs.readFileSync(path.join(ROOT, 'pos/sw.js'), 'utf8').match(/pos-shell-v(\d+)/)[1]; if (v < 699) throw Error('v' + v); });

  console.log('\n===============================\nالنتيجة: ' + p + ' ناجح · ' + f + ' فاشل\n===============================\n');
  if (f) process.exitCode = 1;
})();
