#!/usr/bin/env node
// ============================================================
// test-scan-code.js (v711) — باركود الفاتورة القصير (سريع القراءة)
// بيقيس **عدد موديولات CODE128 الفعلي** بـJsBarcode الحقيقية — مش تخمين.
// يتشغّل لوحده: node tests/test-scan-code.js   (القياس محتاج jsdom: `npm i`)
// ============================================================
'use strict';
require('./helpers/swv');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const sale = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'pos', 'app.js'), 'utf8');
const rep = fs.readFileSync(path.join(ROOT, 'pos', 'pos-reports.js'), 'utf8');
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
    if(c === '"' || c === "'" || c === '`'){ q = c; continue; }
    if(c === '{') depth++;
    else if(c === '}'){ depth--; if(depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error('extractFn: أقواس مش متوازنة');
}
const ctx = { window:{}, String, Number, Math, Date };
vm.createContext(ctx);
vm.runInContext(extractFn(sale, 'function buildScanCode(') + '\n' + extractFn(sale, 'function isShortScanCode(') + '\n' + extractFn(sale, 'function buildInvoiceCode(')
  + '\nfunction branchCode(){ return "R"; }', ctx);

console.log('\n🔢 1) شكل الكود');
const T = 1758342012345;
const a = ctx.buildScanCode('AbCdEfGhIjKlMnOpQrSt', T);
ok(/^FT\d{12}$/.test(a), 'FT + 12 رقم بالظبط — ' + a);
ok(a.slice(2, 12) === '1758342012', 'أول 10 أرقام = ثواني وقت الفاتورة');
ok(ctx.buildScanCode('AbCdEfGhIjKlMnOpQrSt', T) === a, 'نفس المستند ونفس اللحظة = نفس الكود (ثابت لو الكتابة اتعادت)');
ok(ctx.isShortScanCode(a) && !ctx.isShortScanCode('FTR123456-K7QX') && !ctx.isShortScanCode('FT12345') && !ctx.isShortScanCode('ECH1001') && !ctx.isShortScanCode(''), 'التمييز بين القصير والقديم وأكواد المنتجات');
ok(/^FT[A-Z0-9-]+$/.test(a) && /^FT/.test(a), 'بيعدّي فلتر السكانر وموجّه المسح الحاليين (FT…)');
// نفس الثانية — فواتير مختلفة (4 فروع بتبيع مع بعض)
const seen = {}; let clashes = 0;
for(let i = 0; i < 400; i++){ const id = 'doc' + Math.random().toString(36).slice(2) + i; const c = ctx.buildScanCode(id, T); if(seen[c]) clashes++; seen[c] = 1; }
ok(Object.keys(seen).length >= 95, 'الرقمين الأخيرين بيتوزّعوا على المدى كله (' + Object.keys(seen).length + '/100) — فاتورتين في نفس الثانية غالبًا مختلفين');
ok(ctx.buildScanCode('x', T) !== ctx.buildScanCode('x', T + 1000), 'ثانية مختلفة = كود مختلف');
ok(/^FT\d{12}$/.test(ctx.buildScanCode('', 0 / 0)) && /^FT\d{12}$/.test(ctx.buildScanCode(null)), 'مدخلات بايظة = برضه كود سليم الشكل (مفيش NaN يتطبع)');

console.log('📏 2) القياس الفعلي — موديولات CODE128');
let JSDOM = null; try{ JSDOM = require('jsdom').JSDOM; }catch(e){}
if(!JSDOM){ console.log('  ⏭️  تخطّي القياس — jsdom مش متسطّب (`npm i`)'); }
else{
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts:'outside-only' });
  dom.window.eval(fs.readFileSync(path.join(ROOT, 'pos', 'jsbarcode.min.js'), 'utf8'));
  const mods = code => { const d = {}; dom.window.JsBarcode(d, code, { format:'CODE128' }); return d.encodings[0].data.length; };
  const oldOnline = mods('FTR123456-K7QX'), v708Online = mods(ctx.buildInvoiceCode('Rehab', '123456', 'xxxxxxxxxxK7QX9A')),
        v708Offline = mods(ctx.buildInvoiceCode('Rehab', 'OABCDEF1234', 'xxxxxxxxxxK7QX9A')), short = mods(a);
  console.log('     القديم ' + oldOnline + ' · v708 أونلاين ' + v708Online + ' · v708 أوفلاين ' + v708Offline + ' · القصير ' + short);
  ok(short === 134, 'الكود القصير = 134 موديول (الأرقام اتحوّلت CODE128-C)');
  ok(short <= oldOnline * 0.78, 'أخف من الباركود القديم بـ≥22% ← الخطوط أعرض');
  ok(short <= v708Offline * 0.55, 'وأقل من نص باركود الأوفلاين بتاع v708 (' + v708Offline + ' — ده اللي كان هيبقى شبه مستحيل يتقري)');
  // على ورقة 80مم: ~72مم مطبوع × 90% × 8 نقطة/مم
  const dots = 72 * 0.9 * 8, perOld = dots / (oldOnline + 20), perNew = dots / (short + 20);
  ok(perNew >= 3.2, 'عرض الخط على 80مم ≈ ' + perNew.toFixed(2) + ' نقطة (كان ' + perOld.toFixed(2) + ') — نفس كثافة ليبل الأسعار');
  ok((short + 20) <= 58 * 0.85 * 8 / 2, 'ولسه بيتطبع بخطين-نقطة على ورقة 58مم لو فرع بيستخدمها');
}

console.log('🔌 3) التوصيل');
const save = extractFn(sale, 'async function _doConfirmPayment(');
ok(/const scanCode = buildScanCode\(saleRef\.id, Date\.now\(\)\);/.test(save), 'بيتولّد من معرّف المستند قبل الحفظ');
ok(/invoiceCode,\s*\n\s*scanCode,/.test(save), 'وبيتحفظ على الفاتورة');
ok(/printReceipt\(paymentsEntered, total, invoiceNo, invoiceCode, scanCode\)/.test(save), 'وبيتبعت للطباعة');
ok(/const invoiceCode = buildInvoiceCode\(currentBranch, invoiceNo, saleRef\.id\);/.test(save), '`invoiceCode` زي ما هو (الولاء/التقارير/الكاميرات معتمدين عليه)');
ok(/function printReceipt\(payments, total, invoiceNo, invoiceCode, scanCode\)/.test(app) && /scanCode: scanCode\|\|invoiceCode\|\|invoiceNo/.test(app), 'الفاتورة بتطبع القصير لو موجود، وإلا القديم');
ok((rep.match(/scanCode: s\.scanCode \|\| s\.invoiceCode/g) || []).length === 2 && /scanCode: s\.scanCode \|\| s\.invoiceCode,/.test(app), 'إعادة الطباعة (3 أماكن): فاتورة قديمة من غير scanCode بتطبع باركودها القديم');
const open = extractFn(sale, 'async function openInvoiceForReturn(');
ok(/where\(_short \? 'scanCode' : 'invoiceCode','==', code\)/.test(open), 'المسح: كود قصير ← `scanCode` · كود قديم ← `invoiceCode` (الفواتير المطبوعة قبل كده لسه بتتقري)');
ok(/if\(_short && snap\.size > 1\)\{[\s\S]{0,500}return;/.test(open), 'كودين متطابقين = مبيخمّنش (مرتجع على فاتورة حد تاني أخطر من رسالة)');
const rv = sale.slice(sale.indexOf('isReversal: true,'), sale.indexOf('isReversal: true,') + 1200);
ok(!/scanCode/.test(rv), 'فاتورة العكس مبتورّثش `scanCode` الأصلية (وإلا مسح الأصلية يلاقي اتنين)');
ok(swAtLeast(fs.readFileSync(path.join(ROOT, 'pos', 'sw.js'), 'utf8'), 711), 'CACHE_NAME ≥ v711');

console.log('\n' + (fail ? '❌' : '✅') + ' test-scan-code: ' + pass + ' ناجح · ' + fail + ' فاشل');
if(fail) process.exitCode = 1;
