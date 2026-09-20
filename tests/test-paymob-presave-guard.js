#!/usr/bin/env node
// ============================================================
// test-paymob-presave-guard.js (v709) — سلوك فعلي لحارس Paymob قبل الحفظ (رجوع v434/v435)
// اختبارات v434/v435 الأصلية فحص نصوص بس. ده بيشغّل الدوال نفسها على سيرفر وهمي.
// يتشغّل لوحده: node tests/test-paymob-presave-guard.js
// ============================================================
'use strict';
require('./helpers/swv');
const fs = require('fs'), path = require('path'), vm = require('vm');
const sale = fs.readFileSync(path.join(__dirname, '..', 'pos', 'pos-sale.js'), 'utf8');
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
  throw new Error('extractFn: أقواس مش متوازنة');
}
const code = ['function paymobCardLegNeedsServerCheck(', 'function paymobCardLegIntegrity(', 'async function paymobReconcileCardTxnsBeforeSale(']
  .map(h => extractFn(sale, h)).join('\n');

function mk(legs, server){
  const st = { reads:[], logs:[], synced:0 };
  const ctx = { st, window:{}, console:{ warn(){} }, Math, Number, String, Object, Promise, setTimeout,
    paymobTerminalId: () => 'T1', syncCardPayment: () => { st.synced++; }, _logActivity: (t, d) => st.logs.push([t, d]),
    db: { collection: name => ({ doc: id => ({ get: opts => {
      st.reads.push([name, id, opts && opts.source]);
      const r = server[id];
      if(r === 'hang') return new Promise(() => {});
      if(r === 'throw') return Promise.reject(new Error('unavailable'));
      return Promise.resolve(r ? { exists:true, data: () => r } : { exists:false, data: () => ({}) });
    } }) }) } };
  vm.createContext(ctx);
  vm.runInContext('let cardLegs = ' + JSON.stringify(legs) + '; let paymobCardTxns = []; let paymobCardInfo = null;\n' + code
    + ';this.state = () => ({ legs: cardLegs, txns: paymobCardTxns, info: paymobCardInfo });', ctx);
  return ctx;
}
const full = (o) => Object.assign({ seq:1, amount:500, ref:'R-1', status:'approved', txn:{ transactionId:'111', amountCents:50000, orderRef:'R-1' } }, o || {});
const manual = (o) => Object.assign({ seq:1, amount:500, ref:'R-1', status:'manual', txn:{ manual:true, transactionId:null, amountCents:null, orderRef:'R-1' } }, o || {});

(async function(){
  console.log('\n⚡ 1) المسار الطبيعي مبيلمسش الشبكة');
  let c = mk([full()], {}); let r = await c.paymobReconcileCardTxnsBeforeSale(400);
  ok(r.fastPath === true && r.invalid === 0 && c.st.reads.length === 0, 'كارت مؤكد كامل = صفر قراءات (مفيش تأخير على كل فاتورة فيزا)');
  c = mk([full(), full({ seq:2, ref:'R-2', amount:200, txn:{ transactionId:'222', amountCents:20000 } })], {});
  r = await c.paymobReconcileCardTxnsBeforeSale(400);
  ok(r.fastPath === true && c.st.reads.length === 0, 'كارتين مؤكدين = برضه صفر قراءات');

  console.log('🔒 2) المبلغ المحلي مش مطابق');
  c = mk([full({ txn:{ transactionId:'111', amountCents:45000 } })], {}); r = await c.paymobReconcileCardTxnsBeforeSale(400);
  ok(r.invalid === 1 && r.reason === 'amount-mismatch' && c.st.reads.length === 0, 'شريحة 500 واللي اتسحب 450 = ممنوع الحفظ');
  ok(c.state().legs.length === 1, 'والشريحة **بتفضل ظاهرة** (الفلوس اتسحبت — متختفيش من قدام الكاشير)');
  c = mk([{ seq:1, amount:500, ref:'R-1', status:'pending' }], {}); r = await c.paymobReconcileCardTxnsBeforeSale(400);
  ok(r.invalid === 1 && r.reason === 'pending', 'شريحة لسه معلّقة وصلت للحفظ = ممنوع');

  console.log('✍️ 3) شريحة يدوية — السيرفر هو الحكم');
  c = mk([manual()], { 'R-1': { status:'failed' } }); r = await c.paymobReconcileCardTxnsBeforeSale(400);
  ok(r.invalid === 1 && c.state().legs.length === 0 && c.st.synced === 1, 'Paymob بيقول Failed = الشريحة بتتشال والحفظ بيتمنع (كانت هتبقى عجز في التقفيل)');
  ok(c.st.logs.some(l => l[0] === 'paymob_presave_rejected_attempt' && l[1].status === 'failed'), 'وبتتسجل في النشاط');
  ok(c.st.reads[0][0] === 'pos_paymob_txns' && c.st.reads[0][1] === 'R-1' && c.st.reads[0][2] === 'server', 'القراءة من السيرفر مش الكاش، وبنفس مرجع الطلب');
  for(const s of ['voided', 'refunded']){
    c = mk([manual()], { 'R-1': { status:s } }); r = await c.paymobReconcileCardTxnsBeforeSale(400);
    ok(r.invalid === 1, 'Paymob بيقول ' + s + ' = ممنوع');
  }
  c = mk([manual()], { 'R-1': { status:'success', amountCents:50000, transactionId:'987', cardLast4:'4242', cardScheme:'VISA', approvalCode:'A1', rrn:'RR' } });
  r = await c.paymobReconcileCardTxnsBeforeSale(400);
  let leg = c.state().legs[0];
  ok(r.invalid === 0 && r.refreshed === 1 && leg.status === 'approved', 'Success بنفس المبلغ = اليدوية بتترقّى لمؤكدة');
  ok(leg.txn.transactionId === '987' && leg.txn.last4 === '4242' && leg.txn.manual === false && leg.txn.amountCents === 50000, 'وبتاخد رقم العملية وبيانات الكارت (الفاتورة تتطبع صح)');
  ok(c.state().txns.length === 1 && c.state().info && c.state().info.transactionId === '987', 'و`paymobCardTxns`/`paymobCardInfo` بيتحدّثوا قبل الحفظ');
  c = mk([manual()], { 'R-1': { status:'success', amountCents:30000, transactionId:'987' } }); r = await c.paymobReconcileCardTxnsBeforeSale(400);
  ok(r.invalid === 1 && r.mismatches === 1 && r.reason === 'amount-mismatch', 'Success بمبلغ تاني = ممنوع يتربط بالفاتورة');
  ok(c.state().legs.length === 1 && c.state().legs[0].status === 'manual', 'والشريحة زي ما هي (مبتترقّاش ومبتتشالش)');
  ok(c.st.logs.some(l => l[0] === 'paymob_presave_amount_mismatch' && l[1].expectedCents === 50000 && l[1].gotCents === 30000), 'وبيتسجل المتوقع والفعلي');

  console.log('📴 4) الشبكة لا تحبس الكاشير');
  c = mk([manual()], { 'R-1': 'hang' }); const t0 = Date.now(); r = await c.paymobReconcileCardTxnsBeforeSale(400);
  ok(r.invalid === 0 && c.state().legs[0].status === 'manual', 'السيرفر مبيردّش = الحفظ بيكمّل والشريحة يدوية للمراجعة');
  ok(Date.now() - t0 < 1500, 'والمهلة قصيرة فعلًا (' + (Date.now() - t0) + 'ms)');
  c = mk([manual()], { 'R-1': 'throw' }); r = await c.paymobReconcileCardTxnsBeforeSale(400);
  ok(r.invalid === 0, 'أوفلاين (القراءة رمت خطأ) = مبيمنعش');
  c = mk([manual()], {}); r = await c.paymobReconcileCardTxnsBeforeSale(400);
  ok(r.invalid === 0 && c.state().legs.length === 1, 'المستند مش موجود = مبيمنعش');
  c = mk([manual()], { 'R-1': { status:'pending' } }); r = await c.paymobReconcileCardTxnsBeforeSale(400);
  ok(r.invalid === 0 && c.state().legs[0].status === 'manual', 'لسه pending عند Paymob = زي ما هي');

  console.log('🔁 5) رقم العملية اتغيّر + كارتين');
  c = mk([full({ txn:{ transactionId:'111', amountCents:null } })], { 'R-1': { status:'success', amountCents:50000, transactionId:'999' } });
  r = await c.paymobReconcileCardTxnsBeforeSale(400);
  ok(c.state().legs[0].txn.transactionId === '999' && c.st.logs.some(l => l[0] === 'paymob_txn_id_reconciled' && l[1].from === '111' && l[1].to === '999'), 'webhook حدّث رقم العملية = الفاتورة بتاخد الأحدث وبيتسجل');
  c = mk([full(), manual({ seq:2, ref:'R-2', amount:200 })], { 'R-2': { status:'failed' } }); r = await c.paymobReconcileCardTxnsBeforeSale(400);
  ok(r.invalid === 1 && c.state().legs.length === 1 && c.state().legs[0].ref === 'R-1', 'كارتين: الفاشل بس اللي بيتشال والمؤكد سليم');
  ok(c.st.reads.length === 1 && c.st.reads[0][1] === 'R-2', 'وقراءة واحدة بس (للمشكوك فيه)');

  console.log('📍 6) مكان النداء في الحفظ');
  const save = extractFn(sale, 'async function _doConfirmPayment(');
  const iGuard = save.indexOf('await paymobReconcileCardTxnsBeforeSale(1200)');
  ok(iGuard > 0, 'الحارس متنادى في `_doConfirmPayment`');
  ok(iGuard > save.indexOf('normalizePayments(paymentsEntered, total)'), 'بعد ما المدفوعات تتحدد');
  ok(iGuard < save.indexOf('generateInvoiceNumber(') && iGuard < save.indexOf('preOpenCashDrawerForSale('), '**قبل** رقم الفاتورة وفتح الدرج (فاتورة مرفوضة متحرقش رقم ومتفتحش درج)');
  ok(iGuard < save.indexOf('saleRef.set('), 'وقبل الكتابة');
  const blk = save.slice(save.lastIndexOf('if(Number(payments.visa', iGuard), save.indexOf('const phone', iGuard));
  ok(/if\(Number\(payments\.visa \|\| 0\) > 0\)/.test(blk), 'بيشتغل بس لو فيه فيزا (الكاش مبيتأخرش)');
  ok(/if\(_pmSafe && _pmSafe\.invalid\)\{[\s\S]{0,420}return;/.test(blk), 'invalid = `return` قبل أي حفظ');
  ok(/catch\(e\)\{ console\.warn\('paymob pre-save guard'/.test(blk), 'خطأ في الحارس نفسه مبيوقّفش البيع');
  ok(/bankTransactionIds: Array\.from\(new Set\(/.test(save), 'v432: `bankTransactionIds` بيتكتب على الفاتورة (البحث برقم العملية)');
  ok(swAtLeast(fs.readFileSync(path.join(__dirname, '..', 'pos', 'sw.js'), 'utf8'), 709), 'CACHE_NAME ≥ v709');

  console.log('\n' + (fail ? '❌' : '✅') + ' test-paymob-presave-guard: ' + pass + ' ناجح · ' + fail + ' فاشل');
  if(fail) process.exitCode = 1;
})().catch(e => { console.error('💥', e); process.exitCode = 1; });
