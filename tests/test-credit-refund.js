#!/usr/bin/env node
// ============================================================
// test-credit-refund.js (POS v723) — 3 طلبات المالك 21-09:
//   1) إشعار لما رصيد يتضاف · 2) فاتورة مدفوعة رصيد مرتجعها يرجع رصيد · 3) طريقة الدفع في شاشة المرتجع
// يتشغّل لوحده: node tests/test-credit-refund.js
// ============================================================
'use strict';
require('./helpers/swv');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sale = rd('pos/pos-sale.js'), rc = rd('pos/refund-credit.js'), gift = rd('functions/giftCredit.js');
const SN = require(path.join(ROOT, 'functions', 'spendNotice.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; } else { fail++; console.error('  ❌ ' + m); } };
function extractFn(src, header){
  const at = src.indexOf(header); if(at < 0) throw new Error('مش لاقي «' + header + '»');
  let i = src.indexOf('{', at + header.length - 1), depth = 0, q = null;
  for(; i < src.length; i++){ const c = src[i];
    if(q){ if(c === '\\'){ i++; continue; } if(c === q) q = null; continue; }
    if(c === '/' && src[i+1] === '/'){ while(i < src.length && src[i] !== '\n') i++; continue; }
    if(c === '"' || c === "'" || c === '`'){ q = c; continue; }
    if(c === '{') depth++; else if(c === '}'){ depth--; if(depth === 0) return src.slice(at, i + 1); } }
  throw new Error('أقواس');
}
const ctx = { window:{}, Math, Number, String, Object }; vm.createContext(ctx);
vm.runInContext(sale.slice(sale.indexOf('const RET_PAY_LABELS'), sale.indexOf('window.retRequiredCredit = retRequiredCredit;')), ctx);

console.log('\n💵 1) طريقة الدفع في شاشة المرتجع');
let pi = ctx.retPayInfo({ payments:{ credit:325, cash:25 }, items:[{ price:350, qty:1 }] });
ok(pi.parts.length === 2 && pi.parts.some(p => p.key === 'credit' && p.label === 'رصيد العميلة' && p.amount === 325) && pi.parts.some(p => p.label === 'كاش' && p.amount === 25), 'فاتورة #4471 بتاعة المالك: «رصيد العميلة 325» + «كاش 25» — بالعربي');
ok(pi.creditPaid === 325 && pi.creditLeft === 325, 'والرصيد المدفوع 325 كله لسه مارجعش');
pi = ctx.retPayInfo({ payments:{ visa1:200, instapay:150 } });
ok(pi.parts.map(p => p.label).join() === 'فيزا 1,إنستاباي' && pi.creditPaid === 0, 'فيزا وإنستاباي بيظهروا، ومفيش رصيد');
pi = ctx.retPayInfo({ payments:{ cash:25 }, items:[{ price:350, qty:1 }, { price:-325, qty:1, isCreditSpend:true }] });
ok(pi.creditPaid === 325 && pi.parts.some(p => p.key === 'credit'), 'الشكل القديم (سطر خصم رصيد بالسالب) برضه بيتقري');
pi = ctx.retPayInfo({ payments:{ credit:325 }, creditRefunded:125 });
ok(pi.creditLeft === 200, 'رجع منها 125 قبل كده ← الباقي 200');
const view = sale.slice(sale.indexOf('async function openInvoiceForReturn('), sale.indexOf('// 💵 v723 — ملخص دفع'));
ok(/\$\{payBanner\}\s*\n\s*\$\{creditBanner\}/.test(view) && /اتدفعت بـ:/.test(view), 'البانر متحط في شاشة المرتجع');
ok(/timeZone:'Africa\/Cairo'/.test(view) && /invTs\(s\)/.test(view), 'والتاريخ بتوقيت القاهرة ومن `invTs` (فاتورة أوفلاين مبقتش «—»)');

console.log('💰↩️ 2) المرتجع بيرجع رصيد');
const R = (cart, map, net) => ctx.retRequiredCredit(cart, map, net);
const L = (inv, price, qty) => ({ isReturn:true, fromInvoice:inv, price:-Math.abs(price), qty:qty || 1 });
let r = R([L('4472', 325)], { '4472':{ left:325 } }, -325);
ok(r.need === 325 && r.alloc['4472'] === 325, '⭐ فاتورة مدفوعة 325 رصيد ← المرتجع كله لازم يرجع رصيد');
r = R([L('4471', 350)], { '4471':{ left:325 } }, -350);
ok(r.need === 325, 'فاتورة 325 رصيد + 25 كاش ← 325 رصيد، والـ25 بأي طريقة');
r = R([L('100', 500)], { '100':{ left:0 } }, -500);
ok(r.need === 0, 'فاتورة كاش عادية ← مفيش إلزام');
r = R([L('4472', 325), { price:400, qty:1 }], { '4472':{ left:325 } }, 75);
ok(r.need === 0, 'استبدال والعميلة هتدفع فرق (الصافي موجب) ← مفيش فلوس راجعة أصلًا');
r = R([L('4472', 325), { price:200, qty:1 }], { '4472':{ left:325 } }, -125);
ok(r.need === 125, 'استبدال والراجع 125 بس ← 125 رصيد (مش 325)');
r = R([L('A', 300), L('B', 200)], { A:{ left:100 }, B:{ left:200 } }, -500);
ok(r.need === 300 && r.alloc.A === 100 && r.alloc.B === 200, 'فاتورتين في مرتجع واحد ← كل واحدة بحصتها');
r = R([L('4472', 325)], { '4472':{ left:200 } }, -325);
ok(r.need === 200, 'رجع منها 125 رصيد قبل كده ← المطلوب 200 بس');
const guard = rc.slice(rc.indexOf('v723 — فاتورة اتدفعت'), rc.indexOf('lastCtx = { phone: ph'));
ok(/if \(_reqCredit\.need > 0\.009 && chosen \+ 0\.01 < _reqCredit\.need\) \{[\s\S]{0,900}return;/.test(guard), '⛔ الحفظ بيتمنع لو المكتوب على «رصيد» أقل من المطلوب');
ok(guard.indexOf('return;') < rc.indexOf('const out = await _origConfirm.apply'), 'والمنع **قبل** الحفظ');
ok(/creditRefunded: firebase\.firestore\.FieldValue\.increment\(ctx\.alloc\[inv\]\)/.test(rc), 'والفاتورة الأصلية بتتعلّم باللي رجع (مرتجع تاني ميطلبش نفس الرصيد)');
ok(/source: 'refund'/.test(rc) && /idem: idem/.test(rc), 'ومسار إضافة الرصيد نفسه زي ما هو (idem + source refund)');

console.log('🔔 3) إشعار لما رصيد يتضاف');
let n = SN.buildCreditAddNotice({ phone:'0101', added:350, balanceAfter:675, brand:'glow', kind:'change_kept' });
ok(n && /باقي فاتورتك اتحفظ رصيد: \+350 ج\.م/.test(n.body) && /رصيدك دلوقتي 675 ج\.م/.test(n.body) && n.brand === 'glow', 'باقي محفوظ — ' + n.body);
ok(n.link === './?go=credit', 'والدوسة بتفتح كشف الرصيد');
ok(/مرتجعك اتحط رصيد/.test(SN.buildCreditAddNotice({ phone:'1', added:325, kind:'refund' }).body) && /اتضاف رصيد لحسابك/.test(SN.buildCreditAddNotice({ phone:'1', added:50, kind:'manual' }).body), 'مرتجع / إضافة من الإدارة — كل واحد بنصّه');
ok(SN.buildCreditAddNotice({ phone:'1', added:0 }) === null && SN.buildCreditAddNotice({ phone:'1', added:-50 }) === null, 'خصم إداري (سالب) = مفيش إشعار «اتضاف»');
ok(/async function notifyCreditAdded\(/.test(gift) && !/exports\.notifyCreditAdded/.test(gift), 'هيلبر داخلي — **مش دالة سحابية جديدة**');
ok(/if\(!out \|\| out\.repeat \|\| !\(Number\(added\) > 0\)\) return;/.test(gift), 'مش في إعادة المحاولة');
ok(/await notifyCreditAdded\(phone, amount, _adj,/.test(gift) && /await notifyCreditAdded\(phone,amount,_kept,'change_kept'\)/.test(gift), 'متوصّل في `creditAdjust` (يدوي/مرتجع) و`creditKeepChange` (الباقي)');
ok(/return _adj;/.test(gift) && /return _kept;/.test(gift), 'والنتيجة بترجع لـPOS زي ما هي');
['loyalty/index.html', 'glow/index.html'].forEach(f => ok(/credit:'💰 رصيدك'/.test(rd(f)), f.split('/')[0] + ': «credit» في الفاتورة بقت «💰 رصيدك»'));
ok(swAtLeast(rd('pos/sw.js'), 723), 'POS ≥ v723');

console.log('\n' + (fail ? '❌' : '✅') + ' test-credit-refund: ' + pass + ' ناجح · ' + fail + ' فاشل');
if(fail) process.exitCode = 1;
