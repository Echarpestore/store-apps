#!/usr/bin/env node
// ============================================================
// test-return-picker.js (POS v719) — قايمة «مرتجع برقم العميلة»
// بلاغ المالك: كل الفواتير بنفس التاريخ · آخر فاتورة مش ظاهرة · مفيش رجوع للقايمة.
// سلوك فعلي. يتشغّل لوحده: node tests/test-return-picker.js
// ============================================================
'use strict';
require('./helpers/swv');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const sale = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; } else { fail++; console.error('  ❌ ' + m); } };
function grab(startMarker, endMarker){ const a = sale.indexOf(startMarker), b = sale.indexOf(endMarker, a); if(a < 0 || b < 0) throw new Error('مش لاقي: ' + startMarker); return sale.slice(a, b); }
const code = grab('function invTs(s){', '// 📋 نسخ رقم العملية');

const ts = ms => ({ toMillis: () => ms });
const D = (y, m, d, h) => Date.UTC(y, m - 1, d, h || 10);
const DOCS = [   // بترتيب «عشوائي» زي ما Firestore بيرجّع بمعرّف المستند
  { id:'a', invoiceCode:'FTGLO4339-LHEE', invoiceNo:'4339', branch:'Glow', total:350, createdAt:ts(D(2026,9,18)), createdAtMs:D(2026,9,18), items:[{ name:'x', price:350, qty:1 }] },
  { id:'b', invoiceCode:'FTGLO4413-AFJD', invoiceNo:'4413', branch:'Glow', total:25,  createdAt:ts(D(2026,9,20,4)), createdAtMs:D(2026,9,20,4), items:[{ name:'x', price:325, qty:1 }, { name:'💳 خصم من الرصيد', price:-300, qty:1, isCreditSpend:true, isRedemption:true }] },
  { id:'c', invoiceCode:'FTGLO4500-ZZZZ', invoiceNo:'4500', branch:'Glow', total:0,   createdAtMs:D(2026,9,21,9), items:[{ name:'x', price:100, qty:1 }, { name:'💳 خصم من الرصيد', price:-100, qty:1, isCreditSpend:true, isRedemption:true }] },   // آخر فاتورة — كلها رصيد، أوفلاين (من غير createdAt)
  { id:'d', invoiceCode:'FTGLO4341-1JX2', invoiceNo:'4341', branch:'Glow', total:-350, createdAt:ts(D(2026,9,19)), items:[{ name:'x', price:-350, qty:1 }] },
  { id:'e', invoiceCode:'FTRH100-AAAA',  invoiceNo:'100',  branch:'echarpe El Rehab', total:500, createdAt:ts(D(2026,9,21,8)), items:[{ name:'x', price:500, qty:1 }] },
  { id:'f', invoiceCode:'FTGLO4501-REVR', branch:'Glow', total:-25, isReversal:true, createdAt:ts(D(2026,9,21,8)), items:[] },
  { id:'g', invoiceCode:'FTGLO0001-OLD0', branch:'Glow', total:90, items:[{ name:'x', price:90, qty:1 }] },                                      // من غير أي وقت
];
function mk(){
  const st = { body:'', opened:[], reads:0 };
  const el = { get innerHTML(){ return st.body; }, set innerHTML(v){ st.body = v; }, insertAdjacentHTML(pos, h){ st.body = h + st.body; }, classList:{ add(){}, remove(){} } };
  const ctx = { st, window:{}, console:{ warn(){} }, Date, Number, String, Object, Array, Math,
    GLOW_BRANCHES:['Glow'], currentBranch:'Glow', TEST_SALES:'s', returnInvoiceData:{ x:1 },
    hasPerm: () => true, showToast(){}, showScreen(){}, esc: x => String(x),
    saleTs: s => { const sv = s.createdAt && s.createdAt.toMillis ? s.createdAt.toMillis() : null; const lc = typeof s.createdAtMs === 'number' ? s.createdAtMs : null; return lc != null ? lc : sv; },
    openInvoiceForReturn: async c => { st.opened.push(c); st.body = '<div>تفاصيل ' + c + '</div>'; },
    document: { getElementById: id => (id === 'retBackBtn' ? (st.body.indexOf('id="retBackBtn"') >= 0 ? {} : null) : el) },
    db: { collection: () => ({ where: () => ({ get: async () => { st.reads++; return { empty:false, docs: DOCS.map(d => ({ id:d.id, data: () => d })) }; } }) }) } };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext('var returnInvoiceData = {x:1};\n' + code, ctx); return ctx;
}

(async function(){
  console.log('\n📅 1) التاريخ والترتيب');
  const c = mk(); await c.returnByPhone('01000669964');
  const html = c.st.body;
  const order = [...html.matchAll(/openInvoiceFromList\('([^']+)'\)/g)].map(m => m[1]);
  ok(order.join() === 'FTGLO4500-ZZZZ,FTGLO4413-AFJD,FTGLO4341-1JX2,FTGLO4339-LHEE,FTGLO0001-OLD0', '⭐ من الأحدث للأقدم — وآخر فاتورة (كلها رصيد، أوفلاين) **أول واحدة** — ' + order.join(' › '));
  const dates = [...html.matchAll(/margin-top:4px;">([^<·]+·[^·]+)·/g)].map(m => m[1].trim());
  ok(new Set(dates.slice(0, 4)).size === 4, '⭐ كل فاتورة بتاريخها هي (كان: الكل «دلوقتي») — ' + dates.slice(0, 2).join(' | '));
  ok(/من غير تاريخ/.test(html) && order[order.length - 1] === 'FTGLO0001-OLD0', 'فاتورة من غير أي وقت = «من غير تاريخ» وفي الآخر — مش متنكّرة في تاريخ النهارده');
  const rbp = code.slice(code.indexOf('window.returnByPhone'), code.indexOf('}catch(e){', code.indexOf('window.returnByPhone'))).replace(/^\s*\/\/.*$/gm, '');   // §0: من غير التعليقات
  ok(!/Date\.now\(\)/.test(rbp) && !/s\.ts\b/.test(rbp), 'ومفيش `Date.now()` كبديل للوقت ولا `s.ts` في القايمة');
  ok(order.indexOf('FTRH100-AAAA') < 0, 'فاتورة echarpe متظهرش في فرع Glow');
  ok(order.indexOf('FTGLO4501-REVR') < 0, 'سطر العكس مش فاتورة يترجّع منها');
  ok(/#4413 · FTGLO4413-AFJD/.test(html) && /💰 رصيد/.test(html), 'رقم الفاتورة ظاهر، والمدفوعة برصيد متعلّمة 💰');
  ok(/FTGLO4413-AFJD[\s\S]{0,400}1 صنف/.test(html), 'عدد الأصناف من غير سطر خصم الرصيد (كان بيتعدّ صنف)');

  const c0 = mk(); vm.runInContext('saleTs = undefined', c0); await c0.returnByPhone('01000669964');
  const order0 = [...c0.st.body.matchAll(/openInvoiceFromList\('([^']+)'\)/g)].map(m => m[1]);
  ok(order0[0] === 'FTGLO4500-ZZZZ' && order0.join() === order.join(), 'ولو `saleTs` (pos-reports) مش محمّلة: نفس الترتيب بالفولباك — فاتورة الأوفلاين لسه فوق');

  console.log('↩️ 2) الرجوع للقايمة');
  await c.openInvoiceFromList('FTGLO4413-AFJD');
  ok(c.st.opened[0] === 'FTGLO4413-AFJD' && /id="retBackBtn"/.test(c.st.body) && /تفاصيل FTGLO4413/.test(c.st.body), 'فتح فاتورة من القايمة = تفاصيلها + زرار «رجوع لقايمة الفواتير»');
  const readsBefore = c.st.reads; c.backToInvoiceList();
  ok(/اختار الفاتورة/.test(c.st.body) && !/تفاصيل/.test(c.st.body) && c.st.reads === readsBefore, '⭐ الرجوع بيرجّع القايمة **من غير قراءة جديدة** ومن غير ✕');
  await c.openInvoiceFromList('FTGLO4339-LHEE'); await c.openInvoiceFromList('FTGLO4339-LHEE');
  ok((c.st.body.match(/id="retBackBtn"/g) || []).length === 1, 'زرار الرجوع ميتكررش');
  ok(/onclick="openInvoiceFromList\(/.test(html) && !/onclick="openInvoiceForReturn\(/.test(html), 'القايمة بتفتح بالمسار اللي فيه رجوع');
  ok(swAtLeast(fs.readFileSync(path.join(ROOT, 'pos', 'sw.js'), 'utf8'), 719), 'CACHE_NAME ≥ v719');

  console.log('\n' + (fail ? '❌' : '✅') + ' test-return-picker: ' + pass + ' ناجح · ' + fail + ' فاشل');
  if(fail) process.exitCode = 1;
})().catch(e => { console.error('💥', e); process.exitCode = 1; });
