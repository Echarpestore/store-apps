// 🧪 v778 — الجمعة البيضاء: الفاتورة (بلوك «وفّرتي» + شريط WHITE FRIDAY) + الثيم في POS/Sales/التابلت
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'pos', 'app.js'), 'utf8');
const WF = fs.readFileSync(path.join(ROOT, 'white-friday.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m)=>{ if(c){ pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
function fn(src, name){ const s = src.indexOf('function ' + name + '('); let i = src.indexOf('{', s), d = 0; for(; i < src.length; i++){ if(src[i]==='{') d++; else if(src[i]==='}'){ d--; if(!d) return src.slice(s, i+1); } } }
function rl(src, name){ const s = src.indexOf('const ' + name); const e = src.indexOf(src[src.indexOf('=', s)+2] === '[' ? '\n];' : '\n};', s); return src.slice(s, e + 3); }
const ctx = { console, Math, Number, String, JSON, Date, currentBranch:'echarpe El Rehab', receiptDesignConfig:null, _brandOfBranch:()=> 'echarpe', receiptBarcodeImg:()=> '<div>[barcode]</div>', receiptQrImg:()=> '', escapeHtml:(x)=> String(x) };
vm.createContext(ctx);
vm.runInContext([rl(APP,'RECEIPT_ELEMENTS'), rl(APP,'RECEIPT_LABELS'), fn(APP,'currencyLabel'), fn(APP,'_deviceBrand'), fn(APP,'receiptBranchDisplayName'), fn(APP,'defaultReceiptConfig'), fn(APP,'buildReceiptHTML'), 'this.build = buildReceiptHTML;'].join('\n'), ctx);
const items = [
  { name:'ميسي شيفون', qty:1, barcode:'902', unit:'490.00', line:'490.00', wf:true, wfOrig:700 },
  { name:'بندانة', qty:4, barcode:'187', unit:'37.50', line:'150.00', wf:true, wfOrig:50 },
  { name:'شنطة', qty:1, barcode:'B1', unit:'300.00', line:'300.00', wf:false, wfOrig:null }
];
const base = { dateStr:'26/11/2026', empName:'Rawan', totalStr:'940.00', payStr:'كاش', invoiceNo:'9001', scanCode:'9001', branch:'echarpe El Rehab' };
let html = ''; try{ html = ctx.build(Object.assign({ items }, base)); }catch(e){ console.log(e); }
ok(/>White</.test(html) && />Friday</.test(html) && />Offers</.test(html) && /THU\. 26 - SUN\. 29 NOVEMBER/.test(html), 'الفاتورة فيها شكل White · Friday · Offers + التاريخ');
ok(/White Friday Offers · SAVINGS/.test(html) && /وفّرتي مع الجمعة البيضاء/.test(html), 'وبلوك «وفّرتي مع الجمعة البيضاء»');
ok(/900\.00/.test(html) && /640\.00/.test(html) && /260\.00/.test(html), 'الحساب: قبل 900 · بعد 640 · وفّرتي 260 (الأصناف المخفّضة بس)');
ok(html.indexOf('SAVINGS') > html.indexOf('940.00'), 'بلوك التوفير تحت الإجمالي');
ok(html.indexOf('تخفيضات الجمعة البيضاء') < html.indexOf('<table'), 'الشريط فوق جدول الأصناف');
const gift = ctx.build(Object.assign({ items, giftMode:true }, base));
ok(!/SAVINGS/.test(gift) && !/260\.00/.test(gift), 'سلبي: إيصال الهدية مفيهوش التوفير (مفيش فلوس)');
const plain = ctx.build(Object.assign({ items:[items[2]] }, base));
ok(!/>Offers</.test(plain), 'سلبي: فاتورة من غير أصناف العرض = مفيش شريط');
ok(/wf: !!\(it\.promoOn && !it\.isReturn\), wfOrig:/.test(APP), 'الطباعة بتبعت السعر قبل العرض لكل صنف');
fs.writeFileSync(path.join(require('os').tmpdir(), 'wf-receipt.html'), '<!doctype html><meta charset="utf-8"><body style="width:72mm;margin:0 auto;background:#fff">' + html + '</body>');
// الثيم
const wctx = { console, Intl, Date, document:{ currentScript:{ getAttribute:()=> 'sales' }, readyState:'loading', addEventListener(){} }, localStorage:{ getItem:(k)=> wctx._ls[k] || null }, _ls:{}, setInterval(){} };
wctx.window = wctx; vm.createContext(wctx); vm.runInContext(WF, wctx);
const T = Date.parse('2026-11-26T09:00:00Z');
ok(wctx.wfActive(T, 'echarpe El Rehab') === true, 'الثيم شغال الخميس في فرع إيشارب');
ok(wctx.wfActive(T, 'Glow') === true, 'Glow كمان (v779)');
ok(wctx.wfActive(T, 'echarpe office') === false, 'سلبي: المكتب لأ');
ok(wctx.wfActive(Date.parse('2026-11-29T22:30:00Z'), 'echarpe Madinaty') === false, 'سلبي: الاتنين (القاهرة) اختفى لوحده');
ok(wctx.wfActive(Date.parse('2026-11-25T21:00:00Z'), 'echarpe Madinaty') === false, 'سلبي: قبل الخميس لأ');
for(const [f, app] of [['pos/index.html','pos'],['sales/index.html','sales'],['feedback/index.html','feedback']]){
  ok(new RegExp('<script src="\\.\\./white-friday\\.js\\?v=\\d+" data-wf-app="' + app + '"></script>').test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f + ' بيحمّل الثيم');
}
console.log(`\n${fail ? '❌' : '✅'} white friday v778: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
