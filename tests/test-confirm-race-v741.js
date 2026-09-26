/* 🧪 v741 — فاتورة الفيزا اللي اتحفظت مرتين (8190/8191 · نفس TXN) — بلاغ 26-09.
   السيناريو الحقيقي: الكاشير داس «حفظ» والماكينة لسه ماأكدتش → سؤال «إيصال الموافقة طلع؟»
   مفتوح → تأكيد Paymob وصل → الحفظ التلقائي اتنادى → الكاشير داس «أيوه».
   الشرط: فاتورة واحدة بس. + نفس عملية الفيزا مبتتحفظش في فاتورة تانية. */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pos', 'pos-sale.js'), 'utf8');
let P = 0, F = 0;
const ok = (c, m) => { if (c) { P++; console.log('  ✅ ' + m); } else { F++; console.log('  ❌ ' + m); } };
function extractFn(header){
  const at = src.indexOf(header); if (at < 0) throw new Error('مش لاقي ' + header);
  let i = src.indexOf('{', at), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) break; } }
  return src.slice(at, i + 1);
}
const start = src.indexOf('let _confirmSaving = false;');
const helpers = src.slice(start, src.indexOf('window._cardRefAlreadySaved = _cardRefAlreadySaved;'));
const code = helpers + '\n' + extractFn('async function confirmPayment(){') + '\n' + extractFn('async function _confirmPaymentCore(){')
  + '\nreturn { confirmPayment, set: (k, v) => { if (k === "legs") cardLegs = v; }, saved: () => _savedCardRefs };';

function setup(){
  let resolveAsk; const calls = { saves: 0, toasts: [] };
  const env = {
    window: {}, cardLegs: [{ seq: 1, status: 'pending', ref: 'ord_777', amount: 1620 }], paymobCardTxns: [],
    paymentAmounts: { visa: 1620 }, selectedPayMethods: new Set(['visa']), cart: [{}],
    document: { getElementById: () => ({ disabled: false, dataset: {}, textContent: '' }) },
    confirmForeignBranchAction: async () => true, cartTotal: () => 1620,
    cardPendingLegs: (legs) => legs.filter((l) => l.status === 'pending'), cardPendingSum: () => 1620,
    cardApprovedSum: () => 1620, markWindowFocusRisk(){}, reclaimWindowFocus(){}, paymobTerminalId: () => 't1',
    askConfirm: () => new Promise((r) => { resolveAsk = r; }),
    cardLegToManual: (l) => (l.status === 'pending' ? (l.status = 'manual', { orderRef: l.ref }) : null),
    syncCardPayment(){}, _logActivity(){}, showToast: (m) => calls.toasts.push(m),
    _doConfirmPayment: async () => { calls.saves++; env.window._lastInvoiceCode = 'INV-' + calls.saves; await new Promise((r) => setTimeout(r, 5)); },
    showChangeAfterPrint(){}, paymobReset(){}, clearCardSaleCompleteState(){}, updatePaySummary(){},
    paymobCardInfo: null, cardOvercharge: () => 0, console: { warn(){}, log(){}, error(){} },
  };
  const names = Object.keys(env);
  const api = new Function(...names, 'let _cardMoneyAtRiskAt = 0;\n' + code)(...names.map((n) => env[n]));
  return { env, api, calls, ask: (v) => resolveAsk(v) };
}

(async () => {
  console.log('\n💳 v741 — حفظ الفيزا مرة واحدة');
  {
    const { env, api, calls, ask } = setup();
    const manual = api.confirmPayment();                       // الكاشير داس حفظ → السؤال مفتوح
    await new Promise((r) => setTimeout(r, 5));
    env.cardLegs[0].status = 'approved';                        // تأكيد Paymob وصل
    await api.confirmPayment();                                 // الحفظ التلقائي اتنادى والسؤال لسه مفتوح
    ask(true);                                                  // الكاشير داس «أيوه»
    await manual;
    ok(calls.saves === 1, '🔴 السؤال مفتوح + التأكيد وصل + الحفظ التلقائي = فاتورة واحدة بس (كانت 2) — اتحفظ ' + calls.saves);
    ok(calls.toasts.some((t) => /بتتحفظ/.test(t)), 'الحفظ التاني اتمنع برسالة');
  }
  {
    const { env, api, calls } = setup();
    env.cardLegs[0].status = 'approved';
    await api.confirmPayment();
    ok(calls.saves === 1, 'الحفظ العادي شغال');
    await api.confirmPayment();                                 // نفس عملية الفيزا (السلة/الحالة لسه ماتصفّرتش)
    ok(calls.saves === 1 && calls.toasts.some((t) => /اتحفظت قبل كده في فاتورة INV-1/.test(t)), '🔴 نفس عملية Paymob مبتتحفظش في فاتورة تانية');
  }
  {
    const { env, api, calls, ask } = setup();
    const manual = api.confirmPayment();
    await new Promise((r) => setTimeout(r, 5));
    ask(false);                                                 // «لأ، استنى»
    await manual;
    env.cardLegs[0].status = 'approved';
    await api.confirmPayment();
    ok(calls.saves === 1, 'بعد «لأ استنى» القفل بيتفك والحفظ يرجع يشتغل عادي');
  }
  console.log(`\nالنتيجة: ${P} ناجح · ${F} فاشل`);
  if (typeof assert === 'function') assert(F === 0, 'test-confirm-race-v741: ' + F);
  else if (F) process.exitCode = 1;
})();
