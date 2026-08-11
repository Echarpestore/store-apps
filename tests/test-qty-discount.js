// ============================================================
// 🎁 test-qty-discount — تحليل "من كام قطعة نبدأ الخصم؟"
//
// المالك عايز عرض: أرخص قطعة بنص التمن — بس مش عارف يبدأ من كام قطعة.
// الرقم ده مينفعش يتخمّن:
//   · واطي أوي → بتديّ خصم لفواتير كانت هتحصل من غيره = خسارة صافية
//   · عالي أوي → محدش بيوصله = مفيش أي أثر
// فالتقرير بيحسب من فواتير المحل نفسه. والاختبار ده بيحرس الحسبة،
// لأن رقم غلط هنا = قرار تسعير غلط على كل فاتورة في المحل.
//
// ⚠️ أهم حتة: **المرتجعات والكميات السالبة مالهاش دعوة** — لو دخلت
//    الحسبة، أرخص قطعة تبقى بسعر سالب والتكلفة تطلع بالعكس.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'pos', 'pos-reports.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'pos', 'index.html'), 'utf8');

function extractFn(s, header){
  const i = s.indexOf(header);
  if(i < 0) return null;
  let d = 0, st = false;
  for(let j = s.indexOf('{', i); j < s.length; j++){
    if(s[j] === '{'){ d++; st = true; }
    else if(s[j] === '}'){ d--; if(st && d === 0) return s.slice(i, j + 1); }
  }
  return null;
}

const parts = ['function _qdCheapestUnit(', 'function _qdPieces(', 'function qtyDiscountAnalysis(']
  .map(h=> extractFn(src, h));
assert(parts.every(Boolean), 'دوال التحليل اتلقت');

const ctx = { console: { warn(){}, log(){} } };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(parts.join('\n'), ctx, { timeout: 5000 });

const inv = (items, total)=> ({ items, total: total != null ? total
  : items.reduce((a,i)=> a + (i.price*i.qty), 0) });
const it = (price, qty)=> ({ price, qty: qty == null ? 1 : qty });

// ============================================================
// ١) 🔢 عدّ القطع وأرخص قطعة
// ============================================================
(function(){
  assert(ctx._qdPieces([it(100,2), it(50,3)]) === 5, 'القطع = مجموع الكميات (5)');
  assert(ctx._qdCheapestUnit([it(100,2), it(50,3)]) === 50, 'أرخص قطعة بالسعر مش بالكمية');
  assert(ctx._qdCheapestUnit([it(100), it(80), it(120)]) === 80, 'وأرخص واحدة من التلاتة');

  // ⛔ المرتجع والصفريات
  assert(ctx._qdPieces([it(100,2), it(50,-1)]) === 2,
    '⭐⭐ الكميات السالبة (مرتجع) مش بتتعدّ قطع');
  assert(ctx._qdCheapestUnit([it(100,1), it(30,-2)]) === 100,
    '⭐⭐ وسطر المرتجع مش بيبقى \"أرخص قطعة\"');
  assert(ctx._qdCheapestUnit([it(0,1), it(90,1)]) === 90,
    '⭐ وسطر بسعر صفر (هدية/استبدال) مش بيتحسب أرخص قطعة');
  assert(ctx._qdCheapestUnit([]) === 0 && ctx._qdPieces([]) === 0, 'سلة فاضية = صفر');
})();

// ============================================================
// ٢) 📊 التوزيع بيعدّ صح
// ============================================================
(function(){
  const a = ctx.qtyDiscountAnalysis([
    inv([it(100)]),                       // قطعة
    inv([it(100), it(80)]),               // قطعتين
    inv([it(100,2), it(80)]),             // 3
    inv([it(100,2), it(80,2)]),           // 4
    inv([it(50,9)]),                      // 9 → بتتجمّع تحت 8
  ]);
  assert(a.total === 5, '5 فواتير');
  assert(a.dist[1] === 1 && a.dist[2] === 1 && a.dist[3] === 1 && a.dist[4] === 1,
    'التوزيع صح');
  assert(a.dist[8] === 1, '⭐ اللي فوق 8 بيتجمّعوا في خانة واحدة');
  assert(a.avgPieces === 3.8, 'متوسط السلة 3.8 (' + a.avgPieces + ')');
})();

// ============================================================
// ٣) ⭐⭐ التكلفة = نص أرخص قطعة × الفواتير اللي بتوصل الحد
// ============================================================
(function(){
  const a = ctx.qtyDiscountAnalysis([
    inv([it(100), it(60), it(40)]),       // 3 قطع · أرخص 40
    inv([it(100), it(100), it(80)]),      // 3 قطع · أرخص 80
    inv([it(100), it(50)]),               // قطعتين — مش بتوصل 3
  ], [3]);
  const r = a.rows[0];
  assert(r.n === 3, 'الحد 3');
  assert(r.reach === 2, 'فاتورتين بيوصلوا 3 قطع');
  assert(r.near === 1, '⭐ وفاتورة واحدة على بُعد قطعة (قطعتين)');
  assert(r.cost === 60, '⭐⭐ التكلفة = (40÷2) + (80÷2) = 60 (لقينا ' + r.cost + ')');
  assert(r.needConv > 0, 'وفيه رقم للتعادل');
})();

// ============================================================
// ٤) 🎯 التعادل: كام فاتورة لازم تزوّد قطعة
// ============================================================
(function(){
  // كل الفواتير 4 قطع بأرخص 100 → متوسط القطعة 100
  const many = Array.from({ length: 10 }, ()=> inv([it(100,4)]));
  const near = Array.from({ length: 20 }, ()=> inv([it(100,3)]));
  const a = ctx.qtyDiscountAnalysis(many.concat(near), [4]);
  const r = a.rows[0];
  assert(r.reach === 10 && r.near === 20, 'العدّ صح');
  assert(r.cost === 500, 'التكلفة = 10 × (100÷2) = 500');
  assert(r.gainPer === 50, '⭐ المكسب من فاتورة زوّدت = 100 − 50 = 50');
  assert(r.needConv === 10, '⭐⭐ محتاج 10 فواتير تزوّد عشان تتعادل (500 ÷ 50)');
  assert(r.needPct === 50, '⭐ يعني نص اللي على بُعد قطعة — الرقم ده هو القرار');
})();

// ============================================================
// ٥) ⛔ الفواتير الملغية والمرتجعة بره التحليل كله
// ============================================================
(function(){
  const good = inv([it(100,3)]);
  const a1 = ctx.qtyDiscountAnalysis([good]);
  const a2 = ctx.qtyDiscountAnalysis([
    good,
    Object.assign({ isRefund: true }, inv([it(100,5)])),
    Object.assign({ reversalOf: 'x' }, inv([it(100,5)])),
    { items: [], total: 0 },
    { total: 100 },                       // من غير أصناف خالص
  ]);
  assert(a1.total === 1 && a2.total === 1,
    '⛔⛔ المرتجع وفاتورة العكس والفواتير الفاضية مالهمش أي أثر على التحليل');
})();

// ============================================================
// ٦) الوصلات
// ============================================================
(function(){
  assert(/data-rtype="qtydisc"/.test(html), 'زرار التقرير في الشاشة');
  assert(/currentReportType === 'qtydisc'/.test(src), 'ومربوط بالراسم');
  assert(/window\.qtyDiscountAnalysis = qtyDiscountAnalysis/.test(src), 'الدالة معروضة للاختبار');
  const view = extractFn(src, 'async function buildQtyDiscountReport(');
  assert(!!view, 'اتلقى التقرير');
  if(view){
    assert(/على بُعد قطعة/.test(view), 'وبيوضّح عمود الفرصة');
    assert(/تقديرية/.test(view),
      '⭐ ومكتوب إن الأرقام تقديرية — مش توقّع دقيق');
  }
  const sw = fs.readFileSync(path.join(ROOT, 'pos', 'sw.js'), 'utf8');
  const m = sw.match(/store-apps-shell-v(\d+)/);
  assert(!!m && Number(m[1]) >= 286, 'pos/sw.js: v286+ (لقينا ' + (m ? m[1] : '—') + ')');
})();
