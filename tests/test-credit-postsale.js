#!/usr/bin/env node
// test-credit-postsale.js (POS v726) — الباج: `sale.items` مش متعرّف بعد الحفظ ← ولا رصيد اتخصم ولا كارت هدية اتفعّل
'use strict';
require('./helpers/swv');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const sale = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8'), cu = fs.readFileSync(path.join(ROOT, 'pos', 'credit-ui.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if(c){ pass++; } else { fail++; console.error('  ❌ ' + m); } };
function extractFn(src, header){ const at = src.indexOf(header); if(at < 0) throw new Error('مش لاقي ' + header); let i = src.indexOf('{', at + header.length - 1), d = 0, q = null;
  for(; i < src.length; i++){ const c = src[i]; if(q){ if(c === '\\'){ i++; continue; } if(c === q) q = null; continue; }
    if(c === '/' && src[i+1] === '/'){ while(src[i] !== '\n') i++; continue; } if(c === '"' || c === "'" || c === '`'){ q = c; continue; }
    if(c === '{') d++; else if(c === '}'){ d--; if(!d) return src.slice(at, i + 1); } } throw new Error('أقواس'); }

(async function(){
  console.log('\n🔴 1) نداء الخصم بعد الحفظ');
  const call = sale.match(/await commitCreditSpend\(invoiceCode, total, (\w+), (\w+)\);/);
  ok(!!call, 'النداء موجود');
  const arg = call && call[1];
  const before = sale.slice(0, sale.indexOf(call[0]));
  ok(arg && new RegExp('\\b(const|let|var)\\s+' + arg + '\\s*=').test(before), '⭐ المتغيّر `' + arg + '` **متعرّف قبل النداء** (كان `sale` — مش موجود ← ReferenceError صامت)');
  const arg2 = call && call[2];
  ok(arg2 && new RegExp('\\b(const|let|var)\\s+' + arg2 + '\\s*=').test(before), 'و`' + arg2 + '` كمان');
  ok(/const \{ applied: payments, changeGiven \} = normalizePayments/.test(before.slice(-30000)) && before.indexOf('const _savedPaymentsForCredit = Object.assign({}, payments || {});') > before.lastIndexOf('const { applied: payments'), 'و`payments` متعرّفة قبل ما ناخد نسختها');
  ok(sale.indexOf('const _savedItemsForCredit = cart.slice();') > 0 && sale.indexOf('const _savedItemsForCredit = cart.slice();') < sale.indexOf('const _saleW = await _waitWrite(saleRef.set(') && sale.indexOf('const _saleW = await _waitWrite(saleRef.set(') - sale.indexOf('const _savedItemsForCredit = cart.slice();') < 3000, 'ونسخة الأصناف بتتاخد **لحظة الحفظ** (قبل ما السلة تتفضّى)');
  const cat = sale.slice(sale.indexOf(call[0]), sale.indexOf(call[0]) + 1600);
  ok(/_logActivity\('credit_post_sale_error'/.test(cat) && /showToast\('⚠️⚠️ خطأ بعد حفظ الفاتورة/.test(cat), 'وأي خطأ هناك بيتسجّل ويظهر للكاشير — مش console بس');

  console.log('💳 1ب) v727 — مسار الدفع الحقيقي (tender): الرصيد بيبقى `payments.credit` مش سطر');
  {
    const TC = require(path.join(ROOT, 'pos', 'tender-core.js'));
    const cartBefore = [{ name:'قطن تايلاندي', price:350, qty:1 }, { name:'💳 خصم من الرصيد', price:-350, qty:1, isCreditSpend:true, isRedemption:true }];
    const sp = TC.tenderSplit(cartBefore);
    ok(sp.items.length === 1 && !sp.items.some(l => l.isCreditSpend) && sp.payments.credit === 350, 'tenderSplit الحقيقي: السطر اتشال والرصيد بقى payments.credit=350 (شكل فاتورة #4528)');
    const st2 = { calls:[], logs:[] };
    const c2 = { window:{}, console:{ warn(){}, error(){} }, Date, Math, Number, String, Promise, Array, Object, JSON, TEST_SALES:'s', showToast(){},
      _logActivity: (t) => st2.logs.push(t), askConfirm: async () => true, esc: x => x, creditRetryPush(){}, creditRetryRun(){},
      callCreditEx: async (fn, p) => { st2.calls.push(p); return { ok:true, data:{ repeat:false, balance:0, spent:p.amount } }; },
      db: { collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ empty:true, docs:[] }) }) }) }) }, setTimeout: () => 0 };
    vm.createContext(c2);
    vm.runInContext('let pendingCreditSpend = { phone:"0100", amount:350, approvalId:null };\n' + extractFn(cu, 'function creditIdem(') + '\n' + extractFn(cu, 'async function commitCreditSpend('), c2);
    const r2 = await c2.commitCreditSpend('FTGLO4528-PDWKWG', 350, sp.items, sp.payments);
    ok(st2.calls.length === 1 && st2.calls[0].amount === 350 && !st2.logs.includes('credit_spend_orphan_dropped'), '⭐⭐ الفاتورة دي **بتتخصم** (v724–v726 كانت بتتعلّم «يتيمة» وتتلغي — 3 فواتير المالك)');
    vm.runInContext('pendingCreditSpend = { phone:"0100", amount:350, approvalId:null };', c2);
    await c2.commitCreditSpend('FTGLO9-CASH', 350, [{ price:350, qty:1 }], { cash:350 });
    ok(st2.calls.length === 1 && st2.logs.includes('credit_spend_orphan_dropped'), 'وفاتورة كاش من غير رصيد (السلة اللي اتمسحت) لسه بتتلغي صح');
  }

  console.log('🩹 2) استرجاع اللي ضاع');
  const docs = [
    { invoiceCode:'A', customerPhone:'0100', total:25, items:[{ price:350, qty:1 }, { price:-325, qty:1, isCreditSpend:true }] },          // ضاع
    { invoiceCode:'B', customerPhone:'0100', total:0, items:[{ price:100, qty:1 }, { price:-100, qty:1, isCreditSpend:true }], creditSpendCommittedAt:1 }, // اتعمل
    { invoiceCode:'C', customerPhone:'0100', total:350, items:[{ price:350, qty:1 }] },                                                      // كاش
    { invoiceCode:'D', customerPhone:'0100', total:0, reversed:true, items:[{ price:-50, qty:1, isCreditSpend:true }] },                     // معكوسة
    { invoiceCode:'E', customerPhone:'0100', total:350, items:[{ price:350, qty:1 }], payments:{ credit:350 } },                             // tender — #4528
  ];
  const st = { calls:[], updates:[] };
  const ctx = { window:{ currentBranch:'Glow' }, console:{ log(){}, warn(){} }, Date, Math, Number, String, Promise, currentBranch:'Glow', TEST_SALES:'s',
    showToast(){}, _logActivity(){},
    callCreditEx: async (fn, p) => { st.calls.push(p); return { ok:true, data:{ repeat: p.invoiceCode === 'X', balance:0 } }; },
    db: { collection: () => ({ where: () => ({ where: () => ({ get: async () => ({ docs: docs.map(d => ({ data: () => d, ref:{ update: async u => st.updates.push([d.invoiceCode, u]) } })) }) }) }) }) } };
  vm.createContext(ctx);
  vm.runInContext(extractFn(cu, 'function creditIdem(') + '\n' + extractFn(cu, 'async function creditRecoverMissing('), ctx);
  const r = await ctx.creditRecoverMissing(4);
  ok(st.calls.length === 2 && st.calls[0].invoiceCode === 'A' && st.calls[0].amount === 325 && st.calls[1].invoiceCode === 'E' && st.calls[1].amount === 350, '⭐ بيعيد اللي ضاعت بس — **ومنهم فواتير الدفع بالرصيد (payments.credit)**');
  ok(st.calls[0].idem === 'spend:A:0100:325', 'بنفس `idem` اللي كان المفروض يتبعت ← لو اتخصم قبل كده السيرفر بيرد `repeat` ومبيخصمش تاني');
  ok(st.calls[0].invoiceTotal === 350, 'وإجمالي الفاتورة صح (السيرفر بيرفض خصم أكبر منه)');
  ok(st.updates.some(u => u[0] === 'A' && u[1].creditSpendCommittedAt), 'وبيعلّم الفاتورة عشان متتعادش');
  ok(r.recovered === 2, 'النتيجة: 2 اتخصموا');
  ok(/setTimeout\(function\(\)\{ creditRecoverMissing\(4\); \}, 30000\)/.test(cu), 'بيشتغل لوحده بعد فتح POS بـ30 ثانية');
  const cm = extractFn(cu, 'async function commitCreditSpend(');
  ok(/creditSpendCommittedAt: Date\.now\(\)/.test(cm), 'والخصم العادي بيعلّم الفاتورة كمان (الاسترجاع ميلفّش عليها)');
  ok(swAtLeast(fs.readFileSync(path.join(ROOT, 'pos', 'sw.js'), 'utf8'), 727), 'POS ≥ v727');
  console.log('\n' + (fail ? '❌' : '✅') + ' test-credit-postsale: ' + pass + ' ناجح · ' + fail + ' فاشل');
  if(fail) process.exitCode = 1;
})().catch(e => { console.error('💥', e); process.exitCode = 1; });
