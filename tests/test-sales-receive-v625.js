// v625 Sales / v753 POS — استلام/إخراج المنتجات من موبايل Sales + ظهوره في سجل POS
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const C = require(path.join(root, 'pos', 'receive-core.js'));
const BR = 'echarpe Madinaty';

// ===== ١) اختيار المستند الصحيح لنفس الباركود (نفس أفضلية POS) =====
const docs = [
  { id:'a', barcode:'555', name:'قديم مدموج', status:'merged', qtyByBranch:{ [BR]:9 } },
  { id:'b', barcode:'555', name:'فرع تاني', branches:['echarpe Rehab'], qtyByBranch:{} },
  { id:'c', barcode:'555', name:'عام', qtyByBranch:{ [BR]:1 } },
  { id:'d', barcode:'555', name:'بتاع الفرع', branches:[BR], qtyByBranch:{ [BR]:0 } }
];
assertEq(C.recvPickProduct(docs, BR, '555').id, 'd', 'المستند المربوط بالفرع صراحة يكسب');
assertEq(C.recvPickProduct(docs.slice(0, 3), BR, '555').id, 'c', 'مدموج وفرع تاني مستبعدين');
assertEq(C.recvPickProduct(docs.slice(0, 2), BR, '555'), null, 'سلبي: مفيش مستند ظاهر للفرع = null');
assertEq(C.recvPickProduct(docs, BR, '55'), null, 'سلبي: كود ناقص مش بيطابق (تطابق تام بس)');
assertEq(C.recvPickProduct(docs, BR, ''), null, 'سلبي: كود فاضي = null');
assertEq(C.recvPickProduct(docs, BR, ' 555 ').id, 'd', 'مسافات حوالين الكود بتتشال');

// ===== ٢) الحالة بعد الحركة =====
assertEq(C.recvStatusAfter(0, 5, 'outofstock'), 'active', 'نافد + استلام = active');
assertEq(C.recvStatusAfter(3, -3, 'active'), 'outofstock', 'إخراج لحد الصفر = نافد');
assertEq(C.recvStatusAfter(3, 2, 'active'), null, 'موجب لموجب = مفيش تغيير');
assertEq(C.recvStatusAfter(3, 2, 'hidden'), null, 'سلبي: صنف مخفي مش بيتفعّل بالاستلام');

// ===== ٣) الفحص قبل التأكيد =====
const cart = [
  { id:'x', name:'طرحة', currentQty:2, qty:3 },
  { id:'y', name:'لاصق', currentQty:1, qty:0 },
  { id:'x', name:'طرحة', currentQty:2, qty:-4 }
];
let v = C.recvValidate(cart, false);
assert(v.ok && v.rows.length === 2, 'سطر الصفر بيتشال، والصنف المتكرر مجموعه 2+3-4=1 ≥ 0 يعدّي');
v = C.recvValidate([{ id:'x', name:'طرحة', currentQty:2, qty:-3 }], false);
assert(!v.ok && /مينفعش تخرج/.test(v.error), 'سلبي: إخراج أكتر من الرصيد مرفوض والإعداد مقفول');
v = C.recvValidate([{ id:'x', name:'طرحة', currentQty:2, qty:-3 }], true);
assert(v.ok && v.negatives.length === 1 && v.negatives[0].after === -1, 'بالإعداد مفتوح: يعدّي ويتعلّم إنه سالب');
v = C.recvValidate([], false); assert(!v.ok, 'سلبي: قايمة فاضية');
v = C.recvValidate([{ id:'', qty:3 }], false); assert(!v.ok, 'سلبي: سطر من غير صنف بيتشال');
v = C.recvValidate([{ id:'x', currentQty:0, qty:'2.6' }], false); assertEq(v.rows[0].qty, 3, 'الكمية بتتقرّب لرقم صحيح');

// ===== ٤) سطر السجل = نفس حقول POS =====
const e = C.recvNewEntry({ id:'x', name:'طرحة', barcode:'555', qtyByBranch:{ [BR]:4 }, status:'active' }, BR, 1, 1000);
assert(e.entryId.indexOf('recv_1000_') === 0 && e.currentQty === 4 && e.qty === 1, 'سطر جديد بمعرّف ثابت ورصيد الفرع');
const lr = C.recvLogRow(e, BR, 'Amira', 5);
assertEq([lr.type, lr.delta, lr.branch, lr.employeeName, lr.source, lr.productBarcode, lr.receiveEntryId], ['receipt', 1, BR, 'Amira', 'sales', '555', e.entryId], 'الاستلام = receipt بنفس حقول POS + source');
const lo = C.recvLogRow(Object.assign({}, e, { qty:-2 }), BR, 'Amira', -1);
assert(lo.type === 'adjustment' && /سالب \(-1\)/.test(lo.reason), 'الإخراج = adjustment ومعلّم لو نزل سالب');
assert(!('createdAt' in lr), 'الطابع الزمني بيتحط من السيرفر مش هنا');

// ===== ٥) السجل (POS وSales نفس الدالة) =====
const logDocs = [
  { _id:'1', branch:BR, type:'receipt', delta:2, productName:'أ', receiveEntryId:'r1', receivedAtMs:100, source:'sales' },
  { _id:'2', branch:BR, type:'adjustment', delta:-1, productName:'ب', receiveEntryId:'r2', receivedAtMs:300 },
  { _id:'3', branch:BR, type:'adjustment', delta:-1, productName:'تسوية يدوية', createdAtMs:400 },
  { _id:'4', branch:'echarpe Rehab', type:'receipt', delta:5, receivedAtMs:500 },
  { _id:'5', branch:BR, type:'sale', delta:-1, createdAtMs:600 },
  { _id:'1b', branch:BR, type:'receipt', delta:2, productName:'أ', receiveEntryId:'r1', receivedAtMs:100 }
];
const rows = C.recvLogRowsFromDocs(logDocs, BR, 20);
assertEq(rows.map(r => r.id), ['r2', 'r1'], 'استلام + إخراج شاشة الاستلام بس، الأحدث الأول، ومن غير تكرار');
assertEq(rows[1].source, 'sales', 'علامة المصدر sales');
assertEq(C.recvLogRowsFromDocs(logDocs, BR, 1).length, 1, 'الحد بيتطبق');
assert(!rows.some(r => r.name === 'تسوية يدوية'), 'سلبي: تسوية يدوية من غير شاشة استلام مش بتظهر');
assert(!rows.some(r => r.qtyChange === 5), 'سلبي: فرع تاني مش بيظهر');

// ===== ٦) الواجهة: التوصيل =====
const H = fs.readFileSync(path.join(root, 'sales', 'index.html'), 'utf8');
const iCore = H.indexOf('../pos/receive-core.js?v=753'), iUi = H.indexOf('sales-receive.js?v=626');
assert(iCore > 0 && iUi > iCore, 'Sales: receive-core قبل sales-receive');
assert(/id="openReceive"[^>]*salesRecvOpen/.test(H), 'Sales: زرار 📥 استلام في الشاشة الرئيسية');
const UI = fs.readFileSync(path.join(root, 'sales', 'sales-receive.js'), 'utf8');
require('child_process').execFileSync(process.execPath, ['--check', path.join(root, 'sales', 'sales-receive.js')]);
assert(/BarcodeDetector/.test(UI) && /zxing-browser/.test(UI), 'سكان بالكاميرا: BarcodeDetector ومعاه ZXing للآيفون');
assert(/S\.emp = e;\s*\n\s*enterMain\(\);/.test(UI), 'v626: دوسة على الاسم = دخول على طول (من غير كود)');
assert(/c === S\.lastCode && now - S\.lastAt < 1800/.test(UI), 'نفس الكود قدام الكاميرا مش بيتضاف مرتين ورا بعض');
assert(!/salesRecvPinKey|renderPin/.test(UI), 'v626: شاشة الكود اتشالت خالص');
assert(/if\(S\.sending \|\| !S\.emp\) return;/.test(UI), 'حماية الضغطة المزدوجة على التأكيد');
assert(/recvValidate\(S\.cart, S\.allowNeg\)/.test(UI) && /allowNegativeStock/.test(UI), 'نفس إعداد الرصيد السالب بتاع POS');
assert(/localStorage\.setItem\(draftKey\(\)/.test(UI), 'مسودة محفوظة لكل فرع');
const APP = fs.readFileSync(path.join(root, 'sales', 'sales-app.js'), 'utf8');
const apiBlock = APP.slice(APP.indexOf('window.salesRecvApi = {'), APP.indexOf('window.salesRecvApi = {') + 3000);
assert(/writeBatch\(db\)/.test(apiBlock) && /increment\(Number\(r\.qty\)\)/.test(apiBlock) && /'pos_test_stock_log'/.test(apiBlock), 'الكمية والسجل في batch واحد بزيادة ذرّية');
assert(/'qtyByBranch\.' \+ br/.test(apiBlock), 'الكتابة على رصيد الفرع بس');
assert(/where\('barcode', '==', bc\)/.test(apiBlock), 'البحث بالباركود (مش قراءة المخزون كله)');
assert(!/getDocs\(collection\(db, 'pos_test_inventory'\)\)/.test(apiBlock), 'سلبي: مفيش قراءة للمخزون كله في الاستلام');
assert(/i \+= 200/.test(apiBlock), 'تقسيم الـbatch (سقف ٥٠٠ عملية)');

// ===== ٧) POS: السجل بيعرض حركات Sales =====
const PX = fs.readFileSync(path.join(root, 'pos', 'products.js'), 'utf8');
assert(/RecvCore\.recvLogRowsFromDocs\(_docs, currentBranch, 20\)/.test(PX), 'POS بيستخدم نفس دالة السجل');
assert(/where\('type','==','adjustment'\)/.test(PX), 'POS بيجيب الإخراج كمان');
assert(/l\.source==='sales'\?' 📱'/.test(PX), 'POS بيعلّم حركات الموبايل 📱');
const PI = fs.readFileSync(path.join(root, 'pos', 'index.html'), 'utf8');
assert(PI.indexOf('receive-core.js?v=753') > 0 && PI.indexOf('receive-core.js?v=753') < PI.indexOf('products.js?v=753'), 'POS: receive-core قبل products');
assert(/pos-shell-v75[3-9]/.test(fs.readFileSync(path.join(root, 'pos', 'sw.js'), 'utf8')), 'POS CACHE_NAME اترفع');
assert(/store-apps-shell-v6(2[6-9]|[3-9]\d)/.test(fs.readFileSync(path.join(root, 'sales', 'sw.js'), 'utf8')), 'Sales CACHE_NAME اترفع');
