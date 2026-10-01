// v754 — الماكينة مش بتفتح: Paymob رجّع HTML («Unexpected token '<'»). بنشغّل الدالة الحقيقية بردود وهمية.
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
let pass = 0, fail = 0; const ok = (c, m) => { if(c) pass++; else { fail++; console.error('  ❌ ' + m); } };
const src = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
const a = src.indexOf('const PAYMOB_API_KEY = defineSecret("PAYMOB_API_KEY");');
const b = src.indexOf('exports.paymobTerminalOrder = onRequest(');
const c = src.indexOf('\n);', b) + 3;
const block = src.slice(a, c);
ok(!/paymobsolutions\.com\/api/.test(block), 'الدومين القديم مش مستخدم في أي fetch');

async function runCase(responses){
  const calls = [];
  const ctx = { console:{ error(){}, log(){} }, JSON, String, Number, Math, Date,
    defineSecret: () => ({ value: () => 'KEY' }),
    onRequest: (_o, h) => h,
    exports: {}, getFirestore: () => ({ collection: () => ({ doc: () => ({ set: () => Promise.resolve() }) }) }),
    FieldValue: { serverTimestamp: () => 0 },
    fetch: (url, opt) => { calls.push(url); const r = responses.shift(); return Promise.resolve({ ok: r.status < 400, status: r.status, text: () => Promise.resolve(r.body) }); } };
  vm.createContext(ctx);
  vm.runInContext(block + ';this.H=exports.paymobTerminalOrder;', ctx);
  let out = null, code = 200;
  const res = { status(s){ code = s; return this; }, json(o){ out = o; } };
  await ctx.H({ method:'POST', body:{ amount_cents:35000, terminal_id:123, merchant_order_id:'r1', branch:'echarpe El Rehab' } }, res);
  return { out, code, calls };
}
(async () => {
  let r = await runCase([{ status:301, body:'<html> <head><title>301 Moved Permanently</title></head></html>' }]);
  ok(r.code === 502 && /مش JSON \(auth · 301\)/.test(r.out.error), 'رد HTML في التوثيق = رسالة واضحة فيها الخطوة والكود: ' + (r.out && r.out.error));
  ok(r.calls[0] === 'https://accept.paymob.com/api/auth/tokens', 'التوثيق على accept.paymob.com');
  r = await runCase([{ status:200, body:'{"token":"T"}' }, { status:502, body:'<html>bad gateway</html>' }]);
  ok(r.code === 502 && /مش JSON \(order · 502\)/.test(r.out.error), 'HTML في تسجيل الأوردر = رسالة واضحة');
  r = await runCase([{ status:401, body:'{"detail":"bad key"}' }]);
  ok(r.code === 502 && /فشل توثيق Paymob \(401\)/.test(r.out.error), 'سلبي: مفتاح غلط = «فشل توثيق» بالكود');
  r = await runCase([{ status:200, body:'{"token":"T"}' }, { status:201, body:'{"id":999}' }]);
  ok(r.out && r.out.ok === true && /accept\.paymob\.com\/api\/ecommerce\/orders\?send_pay_notification_to_terminal_id=123/.test(r.calls[1]), 'المسار الطبيعي: الماكينة بتتبعتلها');
  console.log((fail ? '❌' : '✅') + ' test-paymob-terminal-v754: ' + pass + ' ناجح · ' + fail + ' فاشل');
  if(fail) process.exitCode = 1;
})();
// v756 — الدالة في الدوحة، وPOS بيكلّمها هناك
{
  const fsx = require('fs'), px = require('path');
  const fnSrc = fsx.readFileSync(px.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  const blk = fnSrc.slice(fnSrc.indexOf('exports.paymobTerminalOrder = onRequest('), fnSrc.indexOf('exports.paymobTerminalOrder = onRequest(') + 200);
  ok(/region: "me-central1"/.test(blk), 'paymobTerminalOrder في me-central1');
  ok(/exports\.paymobWebhook[\s\S]{0,400}region: "us-central1"/.test(fnSrc) || !/exports\.paymobWebhook/.test(fnSrc), 'سلبي: الـwebhook (Paymob بيكلّمنا) متنقلش');
  const sale = fsx.readFileSync(px.join(__dirname, '..', 'pos', 'pos-sale.js'), 'utf8');
  ok(/PAYMOB_FN_URL = 'https:\/\/me-central1-customer-feedback-8ac1d\.cloudfunctions\.net\/paymobTerminalOrder'/.test(sale), 'POS بيبعت للدوحة');
  ok(!/us-central1-customer-feedback-8ac1d\.cloudfunctions\.net\/paymobTerminalOrder/.test(sale), 'سلبي: مفيش أي استدعاء للعنوان القديم');
  ok(/pos-sale\.js\?v=7(5[6-9]|[6-9]\d)/.test(fsx.readFileSync(px.join(__dirname, '..', 'pos', 'index.html'), 'utf8')), 'pos-sale بإصدار جديد');
}
