#!/usr/bin/env node
// ============================================================
// v761 — مرتجع بكود مكتوب بإيد الكاشير: O/0 في كود الفرع (FTGL05800 بدل FTGLO5800)
// بلاغ المالك 09-10: «مفيش فاتورة بالكود ده» رغم إن الفاتورة في تطبيق Glow.
// ============================================================
'use strict';
require('./helpers/swv');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const sale = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');
const core = fs.readFileSync(path.join(ROOT, 'pos', 'pos-core.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; } else { fail++; console.error('  ❌ ' + m); } };
function grab(src, a0, b0){ const a = src.indexOf(a0), b = src.indexOf(b0, a); if(a < 0 || b < 0) throw new Error('مش لاقي: ' + a0); return src.slice(a, b); }
const codeStr = grab(core, 'function branchCode(branch){', '// كمية المنتج') + grab(sale, 'function parseTypedInvoiceCode(code){', 'function buildInvoiceCode(');

const DOCS = [
  { id:'g1', invoiceCode:'FTGLO5800-CNNSTX', invoiceNo:5800, branch:'Glow' },
  { id:'r1', invoiceCode:'FTREH5800-AAAAAA', invoiceNo:5800, branch:'echarpe El Rehab' },
  { id:'m1', invoiceCode:'FTMAD5800-BBBBBB', invoiceNo:5800, branch:'echarpe Madinaty' },
  { id:'m2', invoiceCode:'FTMAD5801-CCCCCC', invoiceNo:5801, branch:'echarpe Madinaty' },
  { id:'m3', invoiceCode:'FTMAD5801-DDDDDD', invoiceNo:5801, branch:'echarpe Madinaty' },  // تكرار (مش مفروض يحصل) — لازم نرفض
];
function run(branch){
  const reads = [];
  const ctx = { window:{}, GLOW_BRANCHES:['Glow'], TEST_SALES:'pos_test_sales', currentBranch:branch,
    db:{ collection(){ return { where(f, op, v){ reads.push([f, v]); return { limit(){ return { async get(){ return { docs: DOCS.filter(d => d[f] === v).map(d => ({ id:d.id, data:() => d })) }; } }; } }; } }; } } };
  vm.createContext(ctx); vm.runInContext(codeStr, ctx); ctx.reads = reads; return ctx;
}
(async () => {
  const g = run('Glow');
  const p = g.parseTypedInvoiceCode('FTGL05800-CNNSTX');
  ok(p && p.branchCode === 'GLO' && p.invoiceNo === 5800 && p.token === 'CNNSTX', 'الصفر في كود الفرع بيتقري O ورقم الفاتورة 5800');
  ok(g.parseTypedInvoiceCode('ftgl05800-cnnstx').branchCode === 'GLO', 'حروف صغيرة بتتقبل');
  ok(g.parseTypedInvoiceCode('FTREH5800').invoiceNo === 5800, 'من غير توكن برضه');
  ok(g.parseTypedInvoiceCode('FT1234567890123') === null, 'كود المسح القصير (أرقام بس) مش كود مكتوب');
  ok(g.parseTypedInvoiceCode('') === null && g.parseTypedInvoiceCode('O123') === null, 'كود فاضي/غريب → null');
  let d = await g.findInvoiceByTypedCode('FTGL05800-CNNSTX');
  ok(d && d.id === 'g1', 'جهاز Glow: الكود المكتوب غلط بيوصل لفاتورة Glow 5800');
  ok(g.reads.every(r => r[0] === 'invoiceNo' && r[1] === 5800), 'الاستعلام برقم الفاتورة كرقم (مش نص)');
  d = await g.findInvoiceByTypedCode('FTREH5800-AAAAAA');
  ok(d === null, 'سلبي: جهاز Glow ميرجّعش فاتورة الرحاب حتى لو الرقم نفسه');
  const r = run('echarpe El Rehab');
  d = await r.findInvoiceByTypedCode('FTGLO5800-CNNSTX');
  ok(d === null, 'سلبي: كاشير echarpe ميلاقيش فاتورة Glow');
  d = await r.findInvoiceByTypedCode('FTMAD5800-XXXXXX');
  ok(d && d.id === 'm1', 'كود فرع تاني من نفس السلسلة (مدينتي) بيتلاقى حتى لو التوكن غلط');
  d = await r.findInvoiceByTypedCode('FTMAD5801-CCCCCC');
  ok(d === null, 'سلبي: فاتورتين بنفس الرقم والفرع → مبنخمّنش (null)');
  d = await r.findInvoiceByTypedCode('FTREH9999-AAAAAA');
  ok(d === null, 'سلبي: رقم مش موجود → null');
  // الربط في شاشة المرتجع + النسخة
  ok(/doc = await findInvoiceByTypedCode\(code\)/.test(sale), 'openInvoiceForReturn بتجرّب الكود المكتوب قبل «مفيش»');
  ok(/pos-sale\.js\?v=76[1-9]/.test(fs.readFileSync(path.join(ROOT,'pos','index.html'),'utf8')), 'pos-sale.js?v=761');
  console.log(`  ${pass} ناجح · ${fail} فاشل`);
  if(fail) process.exitCode = 1;
})();
