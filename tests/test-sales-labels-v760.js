// v760 — ليبلات الاستلام من موبايل Sales بتتطبع على Zebra الفرع (عن طريق POS)
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const C = require(path.join(root, 'pos', 'receive-core.js'));
let L = C.recvLabelItems([{ barcode:'555', name:'لاصق', price:40, qty:2 }, { barcode:'555', name:'لاصق', price:40, qty:1 }, { barcode:'777', name:'طرحة', price:350, qty:1 }]);
assertEq(L.items.map(i => [i.barcode, i.qty]), [['555', 3], ['777', 1]], 'نفس الصنف بيتجمع وبنفس الترتيب');
assertEq(L.total, 4, 'إجمالي الليبلات');
L = C.recvLabelItems([{ barcode:'555', qty:-2 }, { barcode:'', qty:3 }, { barcode:'777', qty:0 }]);
assertEq(L.items.length, 0, 'سلبي: إخراج، أو من غير كود، أو صفر = مفيش ليبل');
assert(C.recvLabelItems([{ barcode:'1', qty:301 }]).tooMany && !C.recvLabelItems([{ barcode:'1', qty:300 }]).tooMany, 'تحذير فوق 300 ليبل');
const e = C.recvNewEntry({ id:'p', name:'x', barcode:'9', price:125, qtyByBranch:{} }, 'B', 1, 1);
assertEq(e.price, 125, 'سطر الاستلام فيه السعر (للّيبل)');

const run = m => JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, '_helpers', 'pos-label-jobs-run.js'), m], { encoding:'utf8', timeout:15000 }));
let r = run('ok');
assert(r.updates[0].status === 'printing' && r.updates[0].claimedBy === 'dev_A', 'POS حجز المهمة قبل الطباعة (جهاز واحد بس يطبع)');
assertEq(r.printed.length, 1, 'اتطبعت مرة واحدة');
assert(r.printed[0].remote === true, 'طباعة «من بعيد» (مفيش نافذة طباعة)');
assertEq(r.printed[0].items.map(i => [i.barcode, i.qty, i.price]), [['555', 2, 40], ['777', 300, 350]], 'الصنف من غير كود اتشال · السعر من مخزون POS · سقف 300 للصنف');
assert(r.updates[1].status === 'printed' && r.updates[1].printedCount === 302, 'المهمة اتعلّمت «اتطبعت» بالعدد');
r = run('noprinter');
assert(!r.printed.length && !r.updates.length, 'سلبي: جهاز من غير Zebra مبيحجزش المهمة (تفضل لجهاز عليه طابعة)');
r = run('browser');
assert(!r.printed.length && !r.updates.length, 'سلبي: POS من المتصفح (مش برنامج الويندوز) مبياخدش المهمة');
r = run('taken');
assert(!r.printed.length, 'سلبي: جهاز تاني حجزها قبلنا = مفيش طباعة مكررة');
r = run('fail');
assert(r.updates[r.updates.length - 1].status === 'failed' && /Printer offline/.test(r.updates[r.updates.length - 1].error), 'الطابعة فشلت → «failed» والسبب يوصل للموبايل');

const APP = fs.readFileSync(path.join(root, 'pos', 'app.js'), 'utf8');
assert(/\.catch\(e=>\{ showToast\('فشل طباعة الليبل: '\+e\.message, 'err'\); if\(opts\.remote\) throw e; \}\)/.test(APP), 'زرار الليبل العادي في POS مبيطلّعش خطأ مش متعامل معاه');
assert(/else if\(opts\.remote\)\{[\s\S]{0,300}Promise\.reject/.test(APP), 'مهمة من بعيد من غير طابعة = رفض بالسبب (مش نافذة)');
const SA = fs.readFileSync(path.join(root, 'sales', 'sales-app.js'), 'utf8');
assert(/queueLabels: function\(branch, employeeName, items\)\{[\s\S]{0,200}type: 'labels'[\s\S]{0,80}status: 'pending'/.test(SA), 'Sales بيبعت المهمة في نفس طابور طباعة الفرع');
const SI = fs.readFileSync(path.join(root, 'sales', 'index.html'), 'utf8'), PI = fs.readFileSync(path.join(root, 'pos', 'index.html'), 'utf8');
assert(/receive-core\.js\?v=760/.test(SI) && /receive-core\.js\?v=760/.test(PI) && /app\.js\?v=760/.test(PI) && /sales-receive\.js\?v=63[2-9]/.test(SI), 'الإصدارات اترفعت');
