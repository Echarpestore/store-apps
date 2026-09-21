#!/usr/bin/env node
// ============================================================
// test-cust-live-actions.js (POS v717)
//   1) عميلة عندها رصيد **و** طلب استبدال: كان بيظهر زرار الرصيد بس.
//   2) طلب الاستبدال اللي اتبعت **بعد** مسح الكارت مكانش بيوصل غير لما الكارت يتمسح تاني.
// سلوك فعلي. يتشغّل لوحده: node tests/test-cust-live-actions.js
// ============================================================
'use strict';
require('./helpers/swv');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const sale = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'pos', 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; } else { fail++; console.error('  ❌ ' + m); } };
function extractFn(src, header){
  const at = src.indexOf(header);
  if(at < 0) throw new Error('extractFn: مش لاقي «' + header + '»');
  let i = src.indexOf('{', at + header.length - 1), depth = 0, q = null;
  for(; i < src.length; i++){
    const c = src[i];
    if(q){
      if(c === '\\'){ i++; continue; }
      if(q === '`' && c === '$' && src[i+1] === '{'){ let d = 1; i += 2; while(i < src.length && d){ if(src[i] === '{') d++; else if(src[i] === '}') d--; i++; } i--; continue; }
      if(c === q) q = null; continue;
    }
    if(c === '/' && src[i+1] === '/'){ while(i < src.length && src[i] !== '\n') i++; continue; }
    if(c === '/' && src[i+1] === '*'){ i = src.indexOf('*/', i) + 1; continue; }
    if(c === '"' || c === "'" || c === '`'){ q = c; continue; }
    if(c === '{') depth++;
    else if(c === '}'){ depth--; if(depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error('extractFn: أقواس مش متوازنة «' + header + '»');
}
const FN = ['function custPickPendingRedeem(', 'function custPickReward(', 'function custLiveStop(', 'function custLiveApply(', 'function custLiveStart(', 'function refreshCustomerActionUI(']
  .map(h => extractFn(sale, h)).join('\n');

function mk(o){
  o = o || {};
  const st = { action:null, toasts:[], logs:[], listeners:[], unsubbed:0, pts:{ textContent:'' } };
  const ctx = { st, window:{ custCreditBalance: o.credit || 0, pendingCreditSpend:null }, console:{ warn(){} }, Math, Number, String, Object, Array, Date,
    currentBranch: o.branch || 'echarpe El Rehab', TEST_CUSTOMERS:'c',
    pointsFieldFor: b => (b === 'Glow' ? 'points_glow' : 'points'), creditFieldFor: b => (b === 'Glow' ? 'credit_glow' : 'credit'),
    redeemReqFresh: (p, now) => !!p && (now - (p.ts || 0)) < 20 * 60000,
    loyaltyRedemptionConfig: { pointsPerRedemption:10, redemptionValueEGP:10 },
    _redeemSanitize: (pts, bal, per, val) => { const u = Math.floor(Math.min(pts, bal) / per); return { points:u * per, value:u * val }; },
    setCustAction: h => { st.action = h; }, showToast: (m, t) => st.toasts.push(m), _logActivity: (t, d) => st.logs.push(t), esc: x => x,
    document: { getElementById: id => id === 'customerInfo' ? {} : id === 'custPts' ? st.pts : id === 'customerPhone' ? { value:'01011111111' } : null },
    db: { collection: () => ({ doc: id => ({ onSnapshot: (cb, err) => { const L = { id, cb, alive:true }; st.listeners.push(L); return () => { L.alive = false; st.unsubbed++; }; } }) }) } };
  vm.createContext(ctx);
  vm.runInContext('let cart = ' + JSON.stringify(o.cart || [{ price:500, qty:1 }]) + '; let custBaseText = "loaded"; let custPointsBalance = ' + (o.points || 0)
    + '; let custPendingRedeem = ' + JSON.stringify(o.req || null) + '; let pendingRedemption = ' + JSON.stringify(o.applied || null)
    + '; let custReward = ' + JSON.stringify(o.reward || null) + '; let _custMatchedPhone = "01011111111"; let _custLivePhone = ""; let _custLiveUnsub = null;\n'
    + FN + ';this.peek = () => ({ req:custPendingRedeem, pts:custPointsBalance, reward:custReward, livePhone:_custLivePhone }); this.setMatched = p => { _custMatchedPhone = p; };', ctx);
  return ctx;
}
const NOW = Date.now();
const REQ = { brand:'echarpe', points:50, valueEGP:50, ts:NOW };
const count = (h, re) => ((h || '').match(re) || []).length;

console.log('\n🧩 1) كل الأزرار المتاحة مع بعض');
let c = mk({ credit:325, points:52, req:REQ }); c.refreshCustomerActionUI();
ok(/useCustomerCredit\(\)/.test(c.st.action) && /applyPendingRedeem\(\)/.test(c.st.action), '⭐ رصيد + طلب استبدال = **الزرارين** ظاهرين (كان: الرصيد بس)');
ok(/^<div class="act-row">/.test(c.st.action) && count(c.st.action, /<button/g) === 2, 'جوّه صف واحد — `setCustAction` بياخد أول عنصر بس');
ok(/استخدمي الرصيد \(325\.00 ج\.م\)/.test(c.st.action) && /استبدال 50 نقطة \(50 ج\.م\)/.test(c.st.action), 'والأرقام صح');
c = mk({ credit:325, points:52, req:REQ, reward:{ type:'amount', value:30, minInvoice:0, brand:'echarpe' } }); c.refreshCustomerActionUI();
ok(count(c.st.action, /<button/g) === 3 && /applyCustomerReward\(\)/.test(c.st.action), 'رصيد + استبدال + مكافأة = التلاتة');
c = mk({ credit:900, points:0 }); c.refreshCustomerActionUI();
ok(/\(500\.00 ج\.م\)/.test(c.st.action) && count(c.st.action, /<button/g) === 1, 'الرصيد لوحده: مسقوف بقيمة الفاتورة (500 مش 900)');
c = mk({ credit:300, points:52, req:REQ, cart:[{ price:500, qty:1 }, { price:-300, qty:1, isCreditSpend:true }] }); c.refreshCustomerActionUI();
ok(!/useCustomerCredit/.test(c.st.action) && /applyPendingRedeem/.test(c.st.action), 'الرصيد اتطبّق خلاص = زراره يختفي والاستبدال يفضل');
c = mk({ credit:0, points:52, req:REQ, applied:{ points:50 } }); c.refreshCustomerActionUI();
ok(c.st.action === '' , 'الاستبدال اتطبّق ومفيش حاجة تانية = الخانة فاضية');
c = mk({ points:52, reward:{ type:'percent', value:10, minInvoice:800, brand:'echarpe' } }); c.refreshCustomerActionUI();
ok(/act-wait/.test(c.st.action) && /من 800 ج\.م/.test(c.st.action), 'مكافأة لسه الفاتورة أقل من حدّها = زرار رمادي زي الأول');
c = mk({ credit:100, points:52, req:{ brand:'echarpe', points:50, valueEGP:500, ts:NOW } }); c.refreshCustomerActionUI(); c.refreshCustomerActionUI(); c.refreshCustomerActionUI();
ok(/🚩/.test(c.st.pts.textContent) && /استبدال 50 نقطة \(50 ج\.م\)/.test(c.st.action), '🛡️ طلب متلاعب فيه (50 نقطة = 500ج): الزرار بالقيمة **الصح** + 🚩');
ok(c.st.logs.filter(x => x === 'redeem_value_mismatch').length === 1, 'والتلاعب بيتسجّل **مرة واحدة** مش مع كل رسم (كان بيتكرر)');
ok(/#custAction \.act-row\{[^}]*display:flex/.test(idx), 'والـCSS بتاع الصف موجود');

console.log('📡 2) طلب الاستبدال بيوصل لايف');
c = mk({ points:52 }); c.custLiveStart('01011111111');
ok(c.st.listeners.length === 1 && c.st.listeners[0].id === '01011111111', 'مستمع واحد على مستند العميلة المربوطة');
c.custLiveStart('01011111111'); ok(c.st.listeners.length === 1, 'نفس العميلة تاني = مفيش مستمع تاني');
const L = c.st.listeners[0];
L.cb({ exists:true, data: () => ({ points:52, pendingRedeem:REQ }) });
ok(c.peek().req === null, 'أول snapshot بيتجاهل (هو نفس اللي `get` قراه)');
L.cb({ exists:true, data: () => ({ points:52, credit:0, pendingRedeem:REQ }) });
ok(c.peek().req && c.peek().req.points === 50 && /applyPendingRedeem/.test(c.st.action || ''), '⭐ العميلة بعتت الطلب **بعد** المسح = زرار الاستبدال يظهر لوحده (من غير مسح الكارت تاني)');
ok(c.st.toasts.some(t => /وصل طلب استبدال/.test(t)), 'وتنبيه للكاشير');
L.cb({ exists:true, data: () => ({ points:52, credit:0, pendingRedeem:REQ }) });
ok(c.st.toasts.filter(t => /وصل طلب استبدال/.test(t)).length === 1, 'نفس الطلب تاني = مفيش تنبيه مكرر');
L.cb({ exists:true, data: () => ({ points:70, credit:120 }) });
ok(c.peek().pts === 70 && c.window.custCreditBalance === 120 && c.peek().req === null, 'والنقط والرصيد بيتحدّثوا، والطلب اللي اتسحب بيختفي');
console.log('🛡️ 3) نفس فحوصات الأمان على اللايف');
L.cb({ exists:true, data: () => ({ points:30, pendingRedeem:REQ }) });
ok(c.peek().req === null, 'طلب أكبر من الرصيد (50 > 30) = مرفوض');
L.cb({ exists:true, data: () => ({ points:90, pendingRedeem:{ brand:'glow', points:50, ts:NOW } }) });
ok(c.peek().req === null, 'طلب براند تاني (Glow في فرع echarpe) = مرفوض');
L.cb({ exists:true, data: () => ({ points:90, pendingRedeem:{ brand:'echarpe', points:50, ts:NOW - 3 * 3600e3 } }) });
ok(c.peek().req === null, 'طلب قديم (3 ساعات) = مرفوض');
const g = mk({ branch:'Glow', points:0 }); g.custLiveStart('01011111111'); g.st.listeners[0].cb({ exists:true, data: () => ({}) });
g.st.listeners[0].cb({ exists:true, data: () => ({ points:999, points_glow:40, credit:500, credit_glow:60, pendingRedeem:{ brand:'glow', points:40, ts:NOW } }) });
ok(g.peek().pts === 40 && g.window.custCreditBalance === 60 && g.peek().req.points === 40, 'فرع Glow بيقرا `points_glow`/`credit_glow` — مش بتوع echarpe');

console.log('🔌 4) دورة حياة المستمع');
c = mk({ points:52 }); c.custLiveStart('01011111111'); const L1 = c.st.listeners[0];
c.custLiveStart('01099999999');
ok(L1.alive === false && c.st.listeners.length === 2 && c.peek().livePhone === '01099999999', 'عميلة جديدة = القديم يتقفل والجديد يفتح');
c.setMatched('01099999999'); L1.cb({ exists:true, data: () => ({ points:5 }) }); L1.cb({ exists:true, data: () => ({ points:5, pendingRedeem:REQ }) });
ok(c.peek().pts === 52 && c.peek().req === null, '⛔ snapshot متأخر من العميلة **القديمة** مبيكتبش على الجديدة');
c.custLiveStop(); ok(c.st.listeners[1].alive === false && c.peek().livePhone === '', '`custLiveStop` بيقفل');
ok(/function clearCustomer\(\)\{\s*\n\s*if\(typeof custLiveStop === 'function'\) custLiveStop\(\);/.test(sale) && /function clearCustomerContext\(\)\{\s*\n\s*if\(typeof custLiveStop === 'function'\) custLiveStop\(\);/.test(sale), 'ومتوصّل في شيل العميلة وتصفير الفاتورة (مفيش مستمعين يتاموا)');
const rci = extractFn(sale, 'async function refreshCustomerInfo(');
ok(/custPendingRedeem = custPickPendingRedeem\(d, _brand, custPointsBalance, _now\);/.test(rci) && /custLiveStart\(phone\);/.test(rci), 'القراءة الأولى واللايف من **نفس** القاعدتين');
ok(swAtLeast(fs.readFileSync(path.join(ROOT, 'pos', 'sw.js'), 'utf8'), 717), 'CACHE_NAME ≥ v717');

console.log('\n' + (fail ? '❌' : '✅') + ' test-cust-live-actions: ' + pass + ' ناجح · ' + fail + ' فاشل');
if(fail) process.exitCode = 1;
