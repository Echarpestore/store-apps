// ============================================================
// 🧪 test-pieces.js — «القطعة الواحدة» (10-10-2026)
//   صورة الموظفة = قطعة بعدد معروف من اللون اللي في الصورة.
//   ١) اتنين أونلاين على آخر قطعة → السيرفر بيرفض التانية (جوه الـtransaction)
//   ٢) البيع في الفرع: الـPOS بيسأل «نفس اللون؟» · المحجوزة = تحذير · مفيش كتابة جوه batch الفاتورة
//   ٣) الإلغاء/الانتهاء بيرجّع القطعة · الاستلام بيقفلها
// ============================================================
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const Module = require('module'); const _orig = Module._load;
Module._load = function(name){
  if(name === 'firebase-functions/v2/https') return { onCall: () => () => {}, HttpsError: Error };
  if(name === 'firebase-functions/v2/firestore') return { onDocumentUpdated: () => () => {} };
  if(name === 'firebase-functions/v2/scheduler') return { onSchedule: () => () => {} };
  if(name === 'firebase-admin/firestore') return { getFirestore: () => ({}), FieldValue: {} };
  return _orig.apply(this, arguments);
};
let M; try { M = require(path.join(ROOT, 'functions', 'onlineOrderPlace.js')); } finally { Module._load = _orig; }
const rd = (f)=> fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ١) فحص السيرفر */
{
  const piece = (o)=> Object.assign({ online:true, status:'live', brand:'echarpe', pieceBranch:'echarpe El Rehab', qtyLeft:1, qtyReserved:0, title:'لينن بيج' }, o);
  const it = (q, pid)=> ({ barcode:'111', qty:q, price:350, pieceId:pid });
  assert(M.pieceCheck([it(1,'p1')], { p1: piece() }, 'echarpe', 'echarpe El Rehab').ok, 'قطعة متاحة = مقبولة');
  const r0 = M.pieceCheck([it(1,'p1')], { p1: piece({ qtyLeft:0, qtyReserved:1 }) }, 'echarpe', 'echarpe El Rehab');
  assert(!r0.ok && /اتحجزت أو اتباعت/.test(r0.errors[0]), 'آخر قطعة اتحجزت = التانية بترفض برسالة واضحة');
  assert(!M.pieceCheck([it(2,'p1')], { p1: piece() }, 'echarpe', 'echarpe El Rehab').ok, 'أكتر من المتاح = رفض');
  assert(!M.pieceCheck([it(1,'p1'), it(1,'p1')], { p1: piece() }, 'echarpe', 'echarpe El Rehab').ok, 'سطرين لنفس القطعة بيتجمعوا (مش تحايل على العدد)');
  assert(/فرع echarpe El Rehab/.test(M.pieceCheck([it(1,'p1')], { p1: piece() }, 'echarpe', 'echarpe Madinaty').errors[0] || ''), 'القطعة في فرع تاني = رفض بيقول فرعها');
  assert(!M.pieceCheck([it(1,'p1')], { p1: piece({ online:false }) }, 'echarpe', 'echarpe El Rehab').ok, 'المالك شالها من الأونلاين = رفض');
  assert(!M.pieceCheck([it(1,'p1')], { p1: piece({ status:'pending' }) }, 'echarpe', 'echarpe El Rehab').ok, 'لسه مستنية موافقة = رفض');
  assert(!M.pieceCheck([it(1,'p1')], { p1: null }, 'echarpe', 'echarpe El Rehab').ok, 'قطعة مش موجودة = رفض');
  assert(!M.pieceCheck([it(1,'p1')], { p1: piece() }, 'glow', 'echarpe El Rehab').ok, 'براند تاني = رفض');
  assert(M.pieceCheck([{ barcode:'111', qty:3, price:1 }], {}, 'echarpe', 'x').ok, 'سطر من غير قطعة = مايتأثرش');
  assertEq(M.withPiece({ a:1 }, { pieceId:'abc_1' }), { a:1, pieceId:'abc_1' }, 'pieceId بيتنقل للسطر');
  assertEq(M.withPiece({ a:1 }, { pieceId:'x/../y' }), { a:1 }, 'pieceId غريب بيتجاهل (مسار مستند)');
  const shop = [{ barcode:'111', name:'ت', price:350, onlineQty:5, active:true }];
  const v = M.serverValidateCart([{ barcode:'111', qty:1, pieceId:'p9' }], shop, { '111': { qtyByBranch:{ b:5 } } }, 'b', {});
  assert(v.ok && v.items[0].pieceId === 'p9', 'فحص السلة بيحتفظ بـpieceId');
  const src = rd('functions/onlineOrderPlace.js');
  const place = src.slice(src.indexOf('exports.onlineOrderPlace'), src.indexOf('exports.onlineOrderRelease'));
  assert(place.indexOf('pieceCheck(chk.items') > 0 && place.indexOf('pieceCheck(chk.items') < place.indexOf('tx.set(orderRef'), 'الفحص قبل إنشاء الأوردر جوه نفس الـtransaction');
  assert(place.indexOf('tx.get(db.collection(COL_PIECES)') < place.indexOf('tx.set(shopRef'), 'قراءة القطع قبل أي كتابة (شرط transactions)');
  assert(/qtyReserved: Math\.max\(0, Math\.floor\(Number\(p\.qtyReserved\) \|\| 0\)\) \+ q/.test(place), 'الحجز بيزوّد المحجوز');
  const rel = src.slice(src.indexOf('exports.onlineOrderRelease'), src.indexOf('exports.onlineOrderExpire'));
  assert(/becameDead\) upd\.qtyLeft = /.test(rel) && /soldOnline/.test(rel), 'الإلغاء بيرجّع المتاح · الاستلام بيسجلها مباعة');
  assert(/patch\.piecesHeld = false/.test(rel), 'مرة واحدة بس (piecesHeld) — مفيش إرجاع مضاعف');
  assert(/const releaseQty = becameDead && after\.qtyHeld === true/.test(rel), 'إرجاع كمية الكتالوج القديم زي ما هو');
}

/* ٢) POS */
{
  const sale = rd('pos/pos-sale.js'), pc = rd('pos/pos-pieces.js'), html = rd('pos/index.html');
  assert(/pos-pieces\.js/.test(html), 'POS بيحمّل pos-pieces.js');
  const add = sale.slice(sale.indexOf('function addToCart(item)'), sale.indexOf('let selectedCartIdx'));
  assert(/PosPieces\.onAdd\(item, existing \|\| cart\[cart\.length - 1\]\)/.test(add), 'المسح بيسأل عن القطعة');
  const bStart = sale.indexOf('const stockLines = cart.filter'), bCommit = sale.indexOf('const _stockP = batch.commit();');
  assert(bStart > 0 && sale.slice(bStart, bCommit).indexOf('app_stories') < 0, '🔴 مفيش كتابة على القطع جوه batch الفاتورة (لو وقعت البيع مايتأثرش)');
  assert(sale.indexOf('PosPieces.afterSale(stockLines)') > bCommit, 'خصم القطعة بعد حفظ الفاتورة');
  assert(/window\._ordDelivering/.test(pc), 'تسليم أوردر أونلاين مايسألش (القطعة محجوزة له أصلًا)');
  assert(/محجوزة لعميلة أونلاين — ماتتباعش/.test(pc) && /شيليها من الفاتورة/.test(pc), 'المحجوزة = تحذير + شيليها');
  assert(/اتحجزت أونلاين/.test(pc) && /r > \(was \|\| 0\)/.test(pc), 'تنبيه الحجز للفرع لما المحجوز يزيد');
  assert(!/confirm\(|alert\(/.test(pc), 'مفيش confirm/alert (بيقفوا في Electron)');
  assert(/it\.img/.test(rd('pos/orders-ui.js')), 'صورة القطعة بتظهر في كارت الأوردر');
}

/* ٣) Sales · Office · التطبيق */
{
  const sal = rd('sales/sales-stories.js'), off = rd('office2/stories.js'), app = rd('pos/stories-app.js'), loy = rd('loyalty/index.html');
  assert(/\['online','🛒 بيع مباشر بعدد'\]/.test(sal) && /\['offers','🏷️ العروض'\]/.test(sal), 'الموظفة بتختار تظهر فين (ستوري/رئيسية/عروض/أونلاين)');
  assert(/story\.qty = /.test(sal) && /story\.pieceBranch = /.test(sal), 'عدد القطع من اللون ده + فرعها');
  assert(/if\(online && s\.qtyLeft === undefined\)/.test(off), 'العدد بيتحط أول موافقة بس (مايمسحش حجز قائم)');
  assert(/if\(online\) home = true/.test(off), 'الأونلاين بيظهر في «مختارة ليكي»');
  assert(/catalog_' \+ b/.test(off) && /950000/.test(off), 'العروض = كتالوج POS نفسه · مع حماية حجم المستند');
  assert(/online:false/.test(off.slice(off.indexOf('async function unhome'))), 'الشيل من الرئيسية بيقفل الطلب');
  assert(/StoriesApp\.order\(\)/.test(app) && /اتباعت 💔/.test(app), 'التطبيق: «اطلبيها» أو «اتباعت»');
  assert(/StoriesApp\.ask\(\)/.test(app) && /window\.chatImgData = img/.test(app) && /متاحة؟/.test(app), 'من غير عدد = «اطلبيها من الشات» بصورة القطعة ورسالة جاهزة');
  assert(/_cartPieces\[s\.barcode\] = s\.id/.test(app) && /pieceId: pid/.test(loy), 'رقم القطعة بيوصل للسيرفر مع الطلب');
}
