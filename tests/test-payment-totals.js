// ============================================================
// 💰 حسابات الفلوس: البيع + طرق الدفع + المرتجع + العكس + الفكة
// السبب: عجز/أوفر يومي متكرر. الباجات اللي الاختبار ده بيقفلها للأبد:
//   ١) الفكة كانت بتتسجل جوه payments.cash (المستلم مش المطبّق)
//   ٢) فاتورة العكس كانت من غير payments → كاش/فيزا التقفيل مش بيتصفّروا
//   ٣) التقارير كانت بتخصم العكس مرتين (الأصلية مستبعدة + السالبة محسوبة)
//   ٤) تقارير "النهاردة" كانت من نص الليل والتقفيل من يوم الشغل → فواتير الفجر
//      بتظهر في شاشة ومتظهرش في التانية
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const POS = path.resolve(__dirname, '..', 'pos');
const saleSrc = fs.readFileSync(path.join(POS, 'pos-sale.js'), 'utf8');
const repSrc  = fs.readFileSync(path.join(POS, 'pos-reports.js'), 'utf8');

// ---------- استخراج دالة بالأقواس المتوازنة (مش regex هش) ----------
function extractFn(src, name){
  const start = src.indexOf('function ' + name + '(');
  if(start < 0) return '';
  const open = src.indexOf('{', start);
  let depth = 0;
  for(let i = open; i < src.length; i++){
    if(src[i] === '{') depth++;
    else if(src[i] === '}'){ depth--; if(depth === 0) return src.slice(start, i + 1); }
  }
  return '';
}
function loadFns(src, names){
  const sb = { window:{}, Object, Math, Number, JSON };
  vm.createContext(sb);
  names.forEach(n=>{
    const code = extractFn(src, n);
    assert(code.length > 0, `الدالة ${n} موجودة في المصدر`);
    vm.runInContext(code, sb);
  });
  return sb;
}

const S = loadFns(saleSrc, ['normalizePayments']);
const R = loadFns(repSrc,  ['repAggregate', 'dcAggregate']);
const normalizePayments = (p,t)=> vm.runInContext(`normalizePayments(${JSON.stringify(p)}, ${t})`, S);
const repAggregate = (sales)=> vm.runInContext(`repAggregate(${JSON.stringify(sales)})`, R);
const dcAggregate  = (sales)=> vm.runInContext(`dcAggregate(${JSON.stringify(sales)})`, R);

// ============================================================
// ١) تطبيع الفكة
// ============================================================
{
  // كاش مظبوط: زي ما هو
  let r = normalizePayments({cash:500}, 500);
  assertEq(r.applied.cash, 500, 'كاش مظبوط بيتسجل زي ما هو');
  assertEq(r.changeGiven, 0, 'مفيش فكة لما المبلغ مظبوط');

  // كاش زيادة: الفكة بتتخصم — ده الباج الأصلي
  r = normalizePayments({cash:600}, 500);
  assertEq(r.applied.cash, 500, 'فاتورة 500 استلم 600 → المسجّل 500');
  assertEq(r.changeGiven, 100, 'الفكة 100 اتحسبت');

  // فيزا + كاش زيادة: الفكة بتتخصم من الكاش بس، الفيزا زي ما هي
  r = normalizePayments({visa:300, cash:300}, 500);
  assertEq(r.applied.visa, 300, 'الفيزا متتلمسش');
  assertEq(r.applied.cash, 200, 'الفكة اتخصمت من الكاش بس');
  assertEq(r.changeGiven, 100, 'فكة الدفع المشترك مظبوطة');

  // مجموع المطبّق = الإجمالي دايمًا لما فيه كاش يغطي الفكة
  const sum = Object.values(r.applied).reduce((n,v)=>n+v,0);
  assertEq(sum, 500, 'مجموع المدفوعات المسجلة = إجمالي الفاتورة');

  // فاتورة مرتجع (سالبة): مفيش مفهوم فكة — الأرقام متتلمسش
  r = normalizePayments({cash:-185}, -185);
  assertEq(r.applied.cash, -185, 'مرتجع كاش بيتسجل بالسالب زي ما هو');
  assertEq(r.changeGiven, 0, 'مفيش فكة في المرتجع');

  // كسور القروش
  r = normalizePayments({cash:100}, 99.75);
  assertEq(r.applied.cash, 99.75, 'كسور: المسجل = الإجمالي بالظبط');
  assertEq(r.changeGiven, 0.25, 'كسور: الفكة 0.25');

  // خصم راتب + كاش زيادة
  r = normalizePayments({salary:200, cash:400}, 500);
  assertEq(r.applied.salary, 200, 'خصم الراتب متتلمسش');
  assertEq(r.applied.cash, 300, 'الفكة اتخصمت من الكاش مع وجود راتب');
}

// ============================================================
// ٢) اليوم الكامل: بيع + مرتجع بكل طريقة + عكس — التقفيل
// ============================================================
{
  const day = [
    // بيع كاش صافي (بعد التطبيع)
    { total:500,  payments:{cash:500} },
    // بيع مشترك فيزا+كاش
    { total:800,  payments:{visa:600, cash:200} },
    // بيع انستاباي
    { total:185,  payments:{instapay:185} },
    // مرتجع كاش (فلوس خرجت من الدرج)
    { total:-120, payments:{cash:-120} },
    // مرتجع فيزا (بيترد على الكارت)
    { total:-90,  payments:{visa:-90} },
    // فاتورة اتعكست + فاتورة عكسها (لازم يصفّروا بعض في التقفيل)
    { total:1000, payments:{cash:1000}, reversed:true },
    { total:-1000, payments:{cash:-1000}, isReversal:true },
    // بيع بخصم راتب موظفة
    { total:300, payments:{salary:300} },
  ];
  const dc = dcAggregate(day);
  assertEq(dc.systemTotal, 1575, 'تقفيل: الإجمالي = 500+800+185−120−90+0+300');
  assertEq(dc.cashSales, 580, 'تقفيل: الكاش = 500+200−120 والعكس صفّر نفسه');
  assertEq(dc.visaSales, 510, 'تقفيل: الفيزا = 600−90');
  assertEq(dc.instaSales, 185, 'تقفيل: انستاباي 185');
  assertEq(dc.salarySales, 300, 'تقفيل: خصم الراتب 300');
  // 🔒 القاعدة الذهبية للدرج: مجموع الطرق = الإجمالي
  assertEq(+(dc.cashSales+dc.visaSales+dc.instaSales+dc.salarySales).toFixed(2),
           +dc.systemTotal.toFixed(2),
           'تقفيل: كاش+فيزا+انستا+راتب = إجمالي السيستم بالظبط');
}

// ============================================================
// ٣) نفس اليوم — التقارير (العكس = كأنه محصلش، مش خصم مزدوج)
// ============================================================
{
  const day = [
    { total:500,  payments:{cash:500},  items:[{name:'طرحة', qty:2, price:250}] },
    { total:-120, payments:{cash:-120}, items:[{name:'طرحة', qty:1, price:-120, isReturn:true}] },
    { total:1000, payments:{cash:1000}, reversed:true, items:[{name:'بيجامة', qty:2, price:500}] },
    { total:-1000, payments:{cash:-1000}, isReversal:true, items:[{name:'بيجامة', qty:2, price:500}] },
  ];
  const rep = repAggregate(day);
  assertEq(rep.netTotal, 380, 'تقارير: الصافي 500−120 — العكس مش متخصم مرتين');
  assertEq(rep.salesTotal, 500, 'تقارير: المبيعات 500 من غير المعكوسة');
  assertEq(rep.returnsTotal, -120, 'تقارير: المرتجعات −120 من غير فاتورة العكس');
  assertEq(rep.byMethod.cash, 380, 'تقارير: كاش صافي 380');
  assertEq(rep.invoiceCount, 1, 'تقارير: فاتورة بيع واحدة سليمة');
  assertEq(rep.itemsSold, 2, 'تقارير: القطع المتباعة من غير المعكوس والمرتجع');
  assert(!rep.itemAgg['بيجامة'], 'تقارير: صنف الفاتورة المعكوسة مش في ملخص الأصناف');
  // 🔒 مجموع طرق الدفع = الصافي (كان قبل الإصلاح أكبر بقيمة الفكة وأقل بقيمة العكس)
  const msum = Object.values(rep.byMethod).reduce((n,v)=>n+v,0);
  assertEq(+msum.toFixed(2), +rep.netTotal.toFixed(2), 'تقارير: مجموع الطرق = الصافي');
}

// ============================================================
// ٤) التقارير والتقفيل بيتفقوا على نفس اليوم (عكس نفس اليوم)
// ============================================================
{
  const day = [
    { total:250, payments:{cash:250}, items:[] },
    { total:400, payments:{visa:400}, items:[] },
    { total:700, payments:{cash:700}, reversed:true, items:[] },
    { total:-700, payments:{cash:-700}, isReversal:true, items:[] },
  ];
  assertEq(repAggregate(day).netTotal, dcAggregate(day).systemTotal,
    'العكس في نفس اليوم: صافي التقارير = إجمالي التقفيل');
}

// ============================================================
// ٦) 📴 saleTs: فواتير الأوفلاين متختفيش من الحسابات
// ============================================================
{
  const fns = loadFns(repSrc, ['saleTs']);
  // فاتورة اتباعت 8 مساءً واترفعت 11:30 (أوفلاين) — وقت البيع هو المرجع
  vm.runInContext('this._r = saleTs({ createdAt: { toMillis: function(){ return 1000000 + 3*3600000; } }, createdAtMs: 1000000 });', fns);
  assertEq(fns._r, 1000000, 'الأوفلاين المتأخر بيتحسب بوقت البيع الفعلي مش وقت الرفع');
  // 🛡️ فرق أكبر من 48 ساعة = ساعة جهاز متلعوب فيها → طابع السيرفر
  vm.runInContext('this._r = saleTs({ createdAt: { toMillis: function(){ return 1000000 + 60*3600000; } }, createdAtMs: 1000000 });', fns);
  assertEq(fns._r, 1000000 + 60*3600000, 'فرق 60 ساعة = تلاعب → السيرفر هو المرجع');
  // فاتورة أوفلاين لسه مرفعتش: serverTimestamp لسه null → الطابع المحلي
  vm.runInContext('this._r = saleTs({ createdAt: null, createdAtMs: 555 });', fns);
  assertEq(fns._r, 555, 'فاتورة الأوفلاين المعلقة بتتحسب بالطابع المحلي (كانت بتختفي)');
  // فاتورة قديمة (قبل التحديث): طابع السيرفر بس
  vm.runInContext('this._r = saleTs({ createdAt: { toMillis: function(){ return 111; } } });', fns);
  assertEq(fns._r, 111, 'الفواتير القديمة من غير createdAtMs بطابع السيرفر');
  // فاتورة من غير أي طابع
  vm.runInContext('this._r = saleTs({});', fns);
  assertEq(fns._r, null, 'من غير أي طابع = null (بتتستبعد بأمان)');

  // الحفظ بيكتب الطابع المحلي في البيع والعكس
  assertEq((saleSrc.match(/createdAtMs: Date\.now\(\)/g)||[]).length >= 2, true,
    'createdAtMs بيتسجل في فاتورة البيع وفاتورة العكس');
}

// ============================================================
// ٧) 🚫 حد الـ300/1500 اتشال: استعلام بنطاق زمني
// ============================================================
{
  const dcBody = extractFn(repSrc, 'goToEndOfDay');
  assert(!/\.limit\(300\)\.get\(\)/.test(dcBody), 'حد الـ300 في التقفيل اتشال');
  assert(/where\('createdAt','>=',/.test(dcBody), 'التقفيل بيستعلم بنطاق زمني');
  assert(/where\('createdAtMs','>=',/.test(dcBody), 'التقفيل بيكمّل فواتير الأوفلاين');
  assert(/fromCache/.test(dcBody) && /hasPendingWrites/.test(dcBody),
    'التقفيل بيكشف الكاش المحلي والفواتير المعلقة');
  assert(/sales = _allFetched\.filter\(s=>\{ const t = saleTs\(s\)/.test(dcBody),
    'فلتر مبيعات التقفيل نفسه بيستخدم saleTs (مش createdAt مباشرة)');
  assert(!/s\.createdAt && s\.createdAt\.toMillis && s\.createdAt\.toMillis\(\) >= dayMs/.test(dcBody),
    'الفلتر القديم اللي بيرمي فواتير الأوفلاين اتشال');
  const repBody = extractFn(repSrc, 'renderReportsScreen');
  // 🔴🔴🔴🔴⭐ الاستعلام اتنقل لدالة منفصلة loadReportSales — عشان
  // مايعتمدش على composite index (branch+createdAt) خالص. لو الـindex
  // ده مش متعمول في Firestore، كان بيقع لحد limit(1500) اللي ممكن
  // يطفّش فواتير النهاردة في فرع نشط. الحل: استعلام بحقل واحد
  // (createdAt بس) — ده مضمون Firestore يعمله تلقائي، والفرع بيتفلتر
  // على جهاز العميل بعد كده.
  assert(/sales = await loadReportSales\(from,\s*to\)/.test(repBody),
    '🔴🔴🔴🔴⭐ التقارير بتنادي loadReportSales (مش استعلام composite index مباشر)');
  const loadBody = extractFn(repSrc, 'loadReportSales');
  assert(loadBody.length > 0, 'دالة loadReportSales موجودة');
  assert(/where\('createdAt','>=',/.test(loadBody), 'بتستعلم بنطاق الفترة (حقل واحد، مضمون الفهرسة)');
  assert(/where\('createdAtMs','>=',/.test(loadBody), 'وبتكمّل فواتير الأوفلاين بالطابع المحلي');
  assert(!/\.limit\(1500\)/.test(loadBody) || /from \|\| to/.test(loadBody),
    '🔴 حد الـ1500 (لو موجود) مقصور على مسار "كل الفترات" بس، مش الفترات المحددة');
  assert(/o\.branch===currentBranch/.test(loadBody), 'الفرع بيتفلتر بعد الجلب، مش شرط جوه composite index');
  assert(/saleTs\(s\)/.test(repBody), 'فلتر الفترة في التقارير بيستخدم saleTs');
  // التقفيل مش بيتسجل والنت قاطع من غير تأكيد صريح
  const finBody = extractFn(repSrc, 'dcFinish');
  assert(/fromCache/.test(finBody) && /confirm\(/.test(finBody),
    'تقفيل والنت قاطع = تأكيد إجباري');
}

// ============================================================
// ١٤) 📉 خفض قراءات Firestore (كانت 254 ألف/يوم)
// ============================================================
{
  const gsSrc2 = fs.readFileSync(path.join(POS,'search.js'),'utf8');
  const salesSrc3 = fs.readFileSync(path.resolve(__dirname,'..','sales','sales-app.js'),'utf8');

  // البحث الشامل: مفيش قراءة كاملة للفواتير خالص
  assert(!/TEST_SALES\)\.where\('branch','==', currentBranch\)\.get\(\)/.test(gsSrc2),
    'المسح الكامل لفواتير الفرع اتشال من البحث');
  assert(/where\('invoiceNo','==', qU\)\.limit\(5\)/.test(gsSrc2),
    'الفواتير باستعلام مستهدف برقم الفاتورة (حد 5)');
  assert(/where\('customerPhone','==', q\)/.test(gsSrc2) && /limit\(5\)/.test(gsSrc2),
    'وبالتليفون بالظبط (حد 5)');
  assert(/_customersCached/.test(gsSrc2) && /10\*60000/.test(gsSrc2),
    'العملاء من كاش الجلسة (10 دقايق) مش قراءة كاملة كل بحثة');
  assert(/q\.length >= 3/.test(gsSrc2), 'مفيش استعلامات لحروف أقل من 3');

  // sales: الاشتراكات الزمنية الكبيرة متحددة بنافذة 190 يوم
  assert(/READ_WINDOW_MS = 190/.test(salesSrc3) && /_scoped = \(col, field\)=> query\(col, where\(field, '>=', _winStart\)\)/.test(salesSrc3),
    'نافذة القراءة معرّفة');
  ['pointsCol,\'ts\'','shiftsCol,\'clockInTs\'','timeCreditCol,\'ts\'','deductionsCol,\'ts\'',
   'advancesCol,\'ts\'','commissionPaymentsCol,\'paidAt\'','salaryPaymentsCol,\'paidAt\'','breaksCol,\'startTs\'']
  .forEach(c=> assert(salesSrc3.includes('_scoped('+c+')'), 'اشتراك متحدد النطاق: '+c));
  assert(!/onSnapshot\(shiftsCol,/.test(salesSrc3) && !/onSnapshot\(pointsCol,/.test(salesSrc3),
    'الاشتراكات الكاملة القديمة اتشالت');
}

// ============================================================
// ١٦) 🔢 بحث الأكواد بالبداية + شاشة المخزون + التكرار
// ============================================================
{
  const core2 = fs.readFileSync(path.join(POS,'pos-core.js'),'utf8');
  const admin2 = fs.readFileSync(path.join(POS,'pos-admin.js'),'utf8');
  const html2 = fs.readFileSync(path.join(POS,'index.html'),'utf8');

  // barcodePrefix سلوكيًا: 33 متلاقيش 533/833، وتلاقي 33 و330
  const bpFns = loadFns(core2, ['barcodePrefix']);
  const bp = (b,q)=> vm.runInContext(`barcodePrefix(${JSON.stringify(b)}, ${JSON.stringify(q)})`, bpFns);
  assertEq(bp('33','33'), true, '33 بتلاقي 33 نفسه');
  assertEq(bp('330','33'), true, '33 بتلاقي 330 (امتداد وانت بتكتب)');
  assertEq(bp('533','33'), false, '33 مش بتلاقي 533 (كان مصدر الإزعاج)');
  assertEq(bp('833','33'), false, '33 مش بتلاقي 833');
  assertEq(bp('33',''), false, 'بحث فاضي = لأ');
  // مستخدمة في المواضع الخمسة
  assert(/_bp\(it\.barcode, q\)/.test(fs.readFileSync(path.join(POS,'pos-sale.js'),'utf8')), 'بيع: كود بالبداية');
  const prod2 = fs.readFileSync(path.join(POS,'products.js'),'utf8');
  assert(/_bp\(it\.barcode, q\)/.test(prod2), 'استلام: كود بالبداية');
  assert(/_bp\(p\.barcode, q\)/.test(fs.readFileSync(path.join(POS,'search.js'),'utf8')), 'البحث الشامل: كود بالبداية');
  assert(/_bp\(it\.barcode, q\)/.test(admin2), 'قايمة المخزون: كود بالبداية');

  // شاشة المخزون: البحث فوق بخلفية + إضافة ورا زرار أخضر
  assert(html2.indexOf('id="invSearch"') < html2.indexOf('id="inventoryAddRow"'),
    'شريط البحث فوق صف الإضافة');
  assert(/rgba\(90,140,60,\.12\)/.test(html2), 'خلفية مميزة لصندوق البحث');
  assert(/toggleInvAddForm/.test(admin2) && /➕ إضافة منتج/.test(admin2),
    'الإضافة ورا زرار أخضر بيفرد الفورم');
  assert(/display:none; gap:6px/.test(admin2), 'الفورم مقفول افتراضيًا');

  // التكرار: منع + كشف
  assert(/متسجل بالفعل على/.test(admin2), 'إضافة باركود موجود بتترفض بالاسم');
  // ⚠️ كان هنا فحص على نص حرفي (`متسجل ${arr.length} مرات`) — النوع ده بيقع
  //    مع أي إعادة صياغة وميقيسش سلوك. السلوك نفسه متختبر في test-dup-merge.
  assert(/openDupBarcodeCheck/.test(admin2) && /function findDupGroups/.test(admin2),
    'أداة كشف الأكواد المتكررة موجودة');
  assert(/function mergeDupGroup/.test(admin2) && /function planDupMerge/.test(admin2),
    'وأداة الدمج موجودة معاها');
  assert(/الصنف ده عليه كمية/.test(admin2), 'حذف نسخة عليها كمية = تحذير صريح');
}

// ============================================================
// ١٥) 📜 تقفيل اليوم: تعبئة تلقائية للمدير + عمى الكاشير + السجل والطباعة
// ============================================================
{
  const repSrc3 = fs.readFileSync(path.join(POS,'pos-reports.js'),'utf8');
  // الفيزا/الانستا متكتبين تلقائي للمدير بس — الكاشير أعمى (يكتب من الماكينة)
  assert(/isMgr \? \(visaSales \? visaSales\.toFixed\(0\) : ''\) : ''/.test(repSrc3),
    'الفيزا متعبية تلقائي للمدير بس (قابلة للتعديل)');
  assert(/isMgr \? \(instaSales \? instaSales\.toFixed\(0\) : ''\) : ''/.test(repSrc3),
    'الانستا متعبية تلقائي للمدير بس');
  // الكاشير يشوف الحالة من غير أرقام
  const finSrc2 = extractFn(repSrc3, 'dcFinish');
  assert(/فيه عجز/.test(finSrc2) && /فيه زيادة \(أوفر\)/.test(finSrc2) && /تمام — مظبوط/.test(finSrc2),
    'الكاشير بيشوف الحالة (تمام/عجز/أوفر)');
  assert(!/\$\{Math\.abs\(overShort\)/.test(finSrc2.slice(finSrc2.indexOf('_cState'))),
    'من غير أي أرقام في نتيجة الكاشير');
  // السجل والطباعة
  assert(/function openDayCloseLog/.test(repSrc3) && /canViewReports/.test(extractFn(repSrc3,'openDayCloseLog')),
    'سجل التقفيلات موجود ومحمي بالصلاحية');
  assert(/function printDayCloseRec/.test(repSrc3) && /تقرير إغلاق اليوم/.test(repSrc3),
    'طباعة تقرير التقفيل موجودة');
  assert(/سجل التقفيلات \+ طباعة/.test(repSrc3), 'زرار السجل في شاشة الإغلاق (للمدير)');
}

// ============================================================
// ١٣) 💸 المصروفات المطاطة + التصفيتين + أثر حذف السلفة
// ============================================================
{
  const repSrc2 = fs.readFileSync(path.join(POS,'pos-reports.js'),'utf8');
  const salesSrc2 = fs.readFileSync(path.resolve(__dirname,'..','sales','sales-app.js'),'utf8');

  // التقفيل: مصروفات > 0 أو تعديل سلف = بيان إجباري متسجل
  const finSrc = extractFn(repSrc2, 'dcFinish');
  assert(/dc_expNote/.test(finSrc) && /exp > 0 \|\| advChanged/.test(finSrc),
    'مصروفات أو تعديل سلف من غير بيان = مرفوض');
  assert(/expNote, advSystem, advChanged,/.test(finSrc),
    'البيان ورقم سلف السيستم بيتسجلوا في سجل التقفيل');
  assert(/dc_expNote/.test(repSrc2.slice(repSrc2.indexOf('بيان المصروفات'))),
    'حقل البيان موجود في شاشة التقفيل');

  // إنهاء الخدمة: مفيش تصفيتين أبدًا
  assert(/_terminating/.test(salesSrc2), 'حارس انشغال على إنهاء الخدمة');
  assert(/متنهية خدمته خلاص/.test(salesSrc2), 'موظف غير نشط بيترفض');
  assert(/فيه تصفية متسجلة بالفعل/.test(salesSrc2), 'تصفية تانية لنفس الموظف بتترفض');

  // حذف السلفة بيسيب أثر
  assert(/sales_deleted_log/.test(salesSrc2) && /kind:'advance'/.test(salesSrc2),
    'حذف السلفة بيتسجل في سجل المحذوفات قبل التنفيذ');
}

// ============================================================
// ١٢) 🛡️ سباقات ازدواج الفلوس (دبل كليك / جهازين)
// ============================================================
{
  const salesAppSrc = fs.readFileSync(path.resolve(__dirname,'..','sales','sales-app.js'),'utf8');
  const trSrc = fs.readFileSync(path.join(POS,'transfers.js'),'utf8');

  // اعتماد أوردر الموظفة: معاملة ذرية بشرط pending — مش سلفتين أبدًا
  assert(/runTransaction/.test(salesAppSrc.slice(0, 800)), 'runTransaction مستوردة في sales');
  const soBlock = salesAppSrc.slice(salesAppSrc.indexOf('window.staffOrderDecide'), salesAppSrc.indexOf('window.staffOrderDecide') + 3000);
  assert(/runTransaction\(db, async \(tx\)=>\{/.test(soBlock), 'قرار الأوردر جوه معاملة ذرية');
  assert(/cur !== 'pending'/.test(soBlock) && /من جهاز تاني/.test(soBlock),
    'الأوردر المتقرر فيه بيترفض (شرط pending على السيرفر)');
  assert(/tx\.set\(doc\(advancesCol\)/.test(soBlock), 'السلفة بتتكتب جوه نفس المعاملة');
  assert(/_soDeciding/.test(soBlock), 'حارس انشغال ضد الدبل كليك');
  assert(!/await addDoc\(advancesCol, \{ employeeId:o\.employeeId/.test(salesAppSrc),
    'الكتابة القديمة المنفصلة (سلفة ثم حالة) اتشالت');

  // تأكيد التحويلة: معاملة ذرية بشرط in_transit — المخزون ميدخلش مرتين
  const ctBlock = trSrc.slice(trSrc.indexOf('async function confirmTransfer(id, confirmer)'), trSrc.indexOf('async function confirmTransfer(id, confirmer)') + 2600);
  assert(/db\.runTransaction\(async \(tx\)=>\{/.test(ctBlock), 'تأكيد التحويلة جوه معاملة ذرية');
  assert(/cur !== 'in_transit'/.test(ctBlock) && /اتأكدت خلاص من جهاز تاني/.test(ctBlock),
    'التحويلة المتأكدة بتترفض (شرط in_transit على السيرفر)');
  assert(/confirmTransfer\._busy/.test(ctBlock), 'حارس انشغال للتحويلة');
  assert(!/const batch = db\.batch\(\);/.test(ctBlock), 'الـ batch القديم (من غير شرط) اتشال');

  // أزرار الصرف الأربعة: حارس انشغال لكل واحد
  assertEq((salesAppSrc.match(/if\(btn\.dataset\.busy\) return;/g)||[]).length >= 4, true,
    'حراس انشغال على أزرار الصرف (مرتب + نقط + تنزيلات + تارجت)');
  assertEq((salesAppSrc.match(/finally\{ delete btn\.dataset\.busy; \}/g)||[]).length >= 4, true,
    'الحراس بيتفكوا بعد انتهاء الكتابة');
  // المرتب: تحذير الصرف المكرر لنفس الشهر
  // 🔀 اتنقل جوه شاشة الصرف الموحّدة (المرتب + النقط في عملية واحدة)
  assert(/if\(prev\.length\)/.test(salesAppSrc) && /تسوية منفصلة/.test(salesAppSrc) && /runTransaction/.test(salesAppSrc),
    'صرف مرتب تاني لنفس الشهر = ممنوع صراحة + transaction ضد السباق');
}

// ============================================================
// ١١) 🔎 البحث العربي + 🏷️ الليبل + 📟 Paymob
// ============================================================
{
  const coreSrc2 = fs.readFileSync(path.join(POS, 'pos-core.js'), 'utf8');
  const appSrc2 = fs.readFileSync(path.join(POS, 'app.js'), 'utf8');
  const prodSrc = fs.readFileSync(path.join(POS, 'products.js'), 'utf8');
  const gsSrc = fs.readFileSync(path.join(POS, 'search.js'), 'utf8');

  // البحث: التطبيع العربي بيشتغل فعليًا
  const sFns = loadFns(coreSrc2, ['searchNorm', 'searchMatch']);
  const match = (h, q)=> vm.runInContext(`searchMatch(${JSON.stringify(h)}, ${JSON.stringify(q)})`, sFns);
  assertEq(match('قطن تايلاندي كويت ليدي', 'تايلاندى'), true, 'ى/ي: تايلاندى بتلاقي تايلاندي');
  assertEq(match('بيجامة قطيفة', 'بيجامه'), true, 'ة/ه: بيجامه بتلاقي بيجامة');
  assertEq(match('إيشارب أسود', 'ايشارب اسود'), true, 'الهمزات: ا بتلاقي أ/إ');
  assertEq(match('قطن تايلاندي كويت ليدي', 'قطن كويت'), true, 'كلمتين بأي ترتيب');
  assertEq(match('قطن  تايلاندي', 'قطن تايلاندي'), true, 'المسافة الزيادة في الاسم مش مشكلة');
  assertEq(match('قطن تايلاندي', 'حرير'), false, 'اللي مش موجود مبيطلعش');
  assertEq(match('أي حاجة', ''), false, 'بحث فاضي = مفيش نتايج');
  // ومستخدم في المواضع الثلاثة
  assert(/_sm\(it\.name, q\)/.test(fs.readFileSync(path.join(POS,'pos-sale.js'),'utf8')), 'بحث البيع بالتطبيع');
  assert(/function receiveSearchItems\(/.test(prodSrc) && /_sm\(it\.name, q\)/.test(prodSrc) && /receiveSearchItems\(candidates, currentBranch, code\)/.test(prodSrc), 'بحث الاستلام بالتطبيع (اقتراحات + إنتر)');
  assert(/_sm\(p\.name, q\)/.test(gsSrc) && /_sm\(c\.name, q\)/.test(gsSrc), 'البحث الشامل بالتطبيع');
  // 🧷 حزام أمان النسخ المتلخبطة وقت التحديث: البحث ميموتش لو التطبيع مش متحمّل
  ['pos-sale.js','products.js','search.js'].forEach(f=>{
    const src = fs.readFileSync(path.join(POS, f),'utf8');
    assert(/typeof searchMatch === 'function'\) \? searchMatch/.test(src),
      'حزام أمان البحث موجود في ' + f);
  });

  // 💰 الدرج بيفتح فورًا بالتوازي مش بعد الطباعة
  const pbSrc = extractFn(appSrc2, '_printBuiltReceipt');
  assert(/openDrawer === 'function'[\s\S]{0,120}window\.posShell\.printReceipt\(/.test(pbSrc),
    'أمر الدرج المستقل بيطلع قبل أمر الطباعة');
  assert(!/\.then\(\(\)=>\{[\s\S]{0,200}openDrawer/.test(pbSrc),
    'أمر الدرج المتأخر (بعد اكتمال الطباعة) اتشال');
  // 📷 باركود الفاتورة: منطقة هدوء صحيحة + رسم حاد
  const rbSrc = extractFn(appSrc2, 'receiptBarcodeImg');
  assert(/margin:30/.test(rbSrc), 'منطقة الهدوء 30px (كانت 6 — سبب بطء القراءة)');
  assert(/background:'#ffffff', lineColor:'#000000'/.test(rbSrc), 'أبيض/أسود صريح');
  assert(/image-rendering:crisp-edges/.test(appSrc2), 'الصورة بتتعرض من غير تنعيم');

  // 📷 باركود الليبل: الإصلاح القديم (هدوء 33px + أرقام جوه الـSVG) اتلغى
  // بإصلاح أعمق — مقاس فيزيائي بالمليمتر وكل خط = نقط حرارية صحيحة.
  // التغطية الكاملة في test-labels.js؛ هنا بنتأكد بس إن المسار الجديد موصّل.
  assert(/sizeBarcodeForThermal/.test(appSrc2), 'ليبل: التثبيت الحراري بالمليمتر موجود');
  assert(/labelBarcodeMm/.test(appSrc2), 'ليبل: حساب الموديول بالنقط الصحيحة موجود');

  // 🔢 الأكواد بالبداية + المطابقة التامة الأول
  {
    const bpFns = loadFns(coreSrc2, ['barcodePrefix']);
    const bp = (bc,q)=> vm.runInContext(`barcodePrefix(${JSON.stringify(bc)}, ${JSON.stringify(q)})`, bpFns);
    assertEq(bp('33','33'), true, 'كود 33 بيطلع مع 33');
    assertEq(bp('330','33'), true, 'وامتداده 330');
    assertEq(bp('533','33'), false, '533 مش بتطلع مع 33 (الاحتواء اتشال)');
    assertEq(bp('833','33'), false, 'ولا 833');
    const saleS = fs.readFileSync(path.join(POS,'pos-sale.js'),'utf8');
    assert(/_bp\(it\.barcode, q\)/.test(saleS), 'بحث البيع بالبداية');
    assert(/\(\(qb===q\)-\(qa===q\)\) \|\| \(qa\.length - qb\.length\)/.test(saleS),
      'المطابقة التامة الأول ثم الأقصر');
    assert(/\(\(qb===q\)-\(qa===q\)\)/.test(fs.readFileSync(path.join(POS,'products.js'),'utf8')),
      'ونفس الترتيب في الاستلام');
  }

  // الليبل: رسم الكود مرة واحدة ونسخ الباقي (إصلاح اللاج)
  const lbl = extractFn(appSrc2, 'doPrintLabels');
  assert(/const prev = firstByCode\[c\.code\];[\s\S]{0,40}if\(prev\)\{[\s\S]{0,120}cloneNode\(true\)/.test(lbl),
    'الليبل: نفس الكود بيترسم مرة ويتنسخ (فرع النسخ سليم)');
  assert(!/codes\.forEach\(c=>\{ const el = tmp\.querySelector/.test(lbl), 'الرسم المتكرر القديم اتشال');

  // Paymob: رسالة الفرع غير المربوط + إعادة المحاولة بعد الدفع المقسم
  const saleSrc2 = fs.readFileSync(path.join(POS,'pos-sale.js'),'utf8');
  assert(/الماكينة مش مربوطة بالسيستم في الفرع ده/.test(saleSrc2), 'فرع من غير ماكينة = رسالة واضحة مش صمت');
  // 💳💳 بعد دعم الكارتين الشرط بقى \"مش اتبعت للماكينة\" بدل \"مش فيزا\" — عشان
  // الكارت التاني اللي اتسجل من غير ماكينة يعيد الفحص برضه
  assert(/if\(!sentToTerminal\n/.test(saleSrc2) && /paymobApproved[\s\S]{0,400}_paymobAutoFired = paymobPending\.ref;[\s\S]{0,120}المدفوعات كملت/.test(saleSrc2),
    'الدفع المقسم بيعيد فحص الطباعة التلقائية (الشرط والتنفيذ سليمين)');
  assert(/المدفوعات كملت — بيحفظ ويطبع/.test(saleSrc2), 'رسالة اكتمال الدفع المقسم موجودة');

  // 📟 مرونة مراقبة الماكينة: إعادة اتصال + استعلام احتياطي (سبب فاتورة/2 يوميًا مش بيطبعوا)
  const watchSrc = extractFn(saleSrc2, 'paymobWatch');
  assert(/paymobWatch\(orderRef, amountEGP, _retry \+ 1(, seq)?\)/.test(watchSrc),
    'المستمع بيعيد الاتصال لو وقع (مش بيموت نهائيًا)');
  assert(/setInterval/.test(watchSrc) && /\.get\(\)/.test(watchSrc),
    'استعلام احتياطي دوري بيلقط النتيجة لو المستمع مات');
  assert(/if\(paymobApproved\) return true;/.test(watchSrc),
    'النتيجة بتتعالج مرة واحدة (المستمع والاستعلام مش بيكرروا بعض');
  // تنضيف الحالة بعد أي حفظ ناجح — بيانات كارت قديمة متلوثش فاتورة جاية
  assert(/if\(_saved && typeof paymobReset === 'function'\)/.test(saleSrc2),
    'paymobReset بعد كل حفظ ناجح');
}

// ============================================================
// ١٠) 🌍 يوم الشغل بتوقيت المحل (القاهرة) — مش ساعة الجهاز
// المالك بيفتح من بره مصر والكاشير من مصر: لازم يشوفوا نفس الأرقام بالظبط
// ============================================================
{
  const coreSrc = fs.readFileSync(path.join(POS, 'pos-core.js'), 'utf8');
  const bStart = coreSrc.indexOf('const SHOP_TZ');
  const bEnd = coreSrc.indexOf('function isSameBizDay');
  assert(bStart > 0 && bEnd > bStart, 'بلوك توقيت المحل موجود في pos-core');
  const tzCode = 'let businessDayStartHour = 6;\n' + coreSrc.slice(bStart, bEnd);
  const sbTz = { Intl, Date, Math, Number, String, isNaN, console };
  vm.createContext(sbTz);
  vm.runInContext(tzCode + '\nthis._start = bizDayStartMs; this._key = bizDayKey;', sbTz);

  // 30 يوليو 2026 الساعة 02:00 فجر القاهرة (UTC+3 صيفي) = 29 يوليو 23:00 UTC
  const t = Date.UTC(2026, 6, 29, 23, 0, 0);
  assertEq(sbTz._key(t), '2026-07-29', 'الساعة 2 فجر القاهرة = يوم أمس (البداية 6 ص)');
  assertEq(sbTz._start(t), Date.UTC(2026, 6, 29, 3, 0, 0), 'بداية يوم الشغل بالملّي بتوقيت القاهرة');
  // بعد البداية: 7 ص القاهرة = اليوم الجديد
  assertEq(sbTz._key(Date.UTC(2026, 6, 30, 4, 0, 0)), '2026-07-30', '7 ص القاهرة = يوم جديد');
  // على الحد بالظبط: 6:00:00 ص القاهرة = أول لحظة في اليوم الجديد
  assertEq(sbTz._key(Date.UTC(2026, 6, 30, 3, 0, 0)), '2026-07-30', '6:00 بالظبط = بداية اليوم');
  // وقبلها بثانية = يوم أمس
  assertEq(sbTz._key(Date.UTC(2026, 6, 30, 2, 59, 59)), '2026-07-29', '5:59:59 = لسه يوم أمس');
  // الشتوي (مصر UTC+2): 15 يناير 2026 الساعة 3 فجر القاهرة = 1:00 UTC
  assertEq(sbTz._key(Date.UTC(2026, 0, 15, 1, 0, 0)), '2026-01-14', 'التوقيت الشتوي محسوب صح');
  // المرجع ثابت
  assert(/Africa\/Cairo/.test(tzCode), 'توقيت المحل ثابت: Africa/Cairo');
}

  // 📒 سجل المبيعات موحّد على يوم الشغل زي التقارير (كان تقويمي → أرقام مختلفة)
  {
    const grpSrc = extractFn(repSrc, '_groupSalesByDay');
    assert(/_shBizKey\(ts\)/.test(grpSrc), 'تجميع أيام السجل بمفتاح يوم الشغل');
    const resSrc = extractFn(repSrc, '_shResolveDayKey');
    assert(/_shBizKey\(n\)/.test(resSrc) && /_shBizKey\(n - 86400000\)/.test(resSrc),
      'فلتر النهارده/امبارح في السجل بيوم الشغل');
    // سلوكيًا: فاتورة فجرية (2 ص القاهرة) بتتجمع مع يوم أمس
    const sbG = { window:{}, Date, String, Number, isNaN, Math,
      saleTs: (s)=> s.__ts,
      bizDayKey: (ts)=>{ // نفس منطق القاهرة مبسّط للاختبار: قبل 3:00 UTC = يوم أمس
        const cut = Date.UTC(2026, 6, 30, 3, 0, 0);
        return ts < cut ? '2026-07-29' : '2026-07-30'; } };
    vm.createContext(sbG);
    vm.runInContext(extractFn(repSrc,'_shTsOf') + '\n' + extractFn(repSrc,'_shBizKey') + '\n'
      + extractFn(repSrc,'_shLabelOf') + '\n' + grpSrc + '\nthis._g = _groupSalesByDay;', sbG);
    const dawn = Date.UTC(2026, 6, 30, 1, 0, 0);   // 4 فجرًا بتوقيت القاهرة
    const noon = Date.UTC(2026, 6, 30, 9, 0, 0);   // 12 ظهرًا
    const groups = vm.runInContext(`_groupSalesByDay([{__ts:${dawn}, total:375},{__ts:${noon}, total:8415}])`, sbG);
    assertEq(groups.length, 2, 'فاتورة الفجر انفصلت عن يوم النهاردة');
    assertEq(groups.find(g=> g.key==='2026-07-29').total, 375, 'فاتورة الفجر مع يوم أمس');
    assertEq(groups.find(g=> g.key==='2026-07-30').total, 8415, 'فاتورة النهار مع النهاردة');
  }

// ============================================================
// ٩) 🎁 ثغرة النقط→كاش مقفولة من كل المسارات
// ============================================================
{
  const fns = loadFns(saleSrc, ['_redeemMaxUnits']);
  const mx = (b, ct, per, val)=> vm.runInContext(`_redeemMaxUnits(${b}, ${ct}, ${per}, ${val})`, fns);
  // رصيد كبير + فاتورة صغيرة → السقف بقيمة الفاتورة
  assertEq(mx(1000, 50, 10, 25), 2, 'رصيد 1000 وفاتورة 50: وحدتين بس (50/25)');
  // فاتورة كبيرة + رصيد صغير → السقف بالرصيد
  assertEq(mx(30, 5000, 10, 25), 3, 'رصيد 30 نقطة: 3 وحدات مهما كبرت الفاتورة');
  // فاتورة أصغر من وحدة واحدة → صفر (كان بيسمح ويقلب الفاتورة سالبة)
  assertEq(mx(1000, 20, 10, 25), 0, 'فاتورة 20 أقل من وحدة الـ25 = ممنوع');
  assertEq(mx(1000, 0, 10, 25), 0, 'سلة فاضية = صفر');
  assertEq(mx(1000, -50, 10, 25), 0, 'سلة سالبة (مرتجع) = صفر');

  // المسارين بيستخدموا السقف
  assert(/_redeemMaxUnits\(balance, cartTotal\(\)/.test(saleSrc),
    'الاستبدال اليدوي محدود بقيمة الفاتورة');
  assert(/_redeemMaxUnits\(custPointsBalance, cartTotal\(\)/.test(saleSrc),
    'استبدال طلب التطبيق محدود بقيمة الفاتورة');
  // خط الدفاع الأخير عند الحفظ
  assert(/isRefundInvoice && pendingRedemption/.test(saleSrc),
    'فاتورة سالبة باستبدال بتترفض قبل الحفظ');
  // التنضيف التلقائي بعد حذف منتج
  assert(/pendingRedemption && cartTotal\(\) < 0/.test(extractFn(saleSrc,'removeFromCart')),
    'حذف منتج بيشيل الاستبدال لو قيمته بقت أكبر من الفاتورة');
  // الخصم اليدوي ميلمسش سطور الاستبدال
  assert(/!c\.isRedemption && !c\.isRewardDiscount/.test(extractFn(saleSrc,'openGiveDiscount')),
    'الخصم اليدوي بيعدّي سطور الاستبدال والمكافأة');
}

  // 🔫 حارس القراءة المزدوجة: نفس الباركود في أقل من نص ثانية = قراءة مسدس مكررة
  assert(/_lastScanCode === code/.test(saleSrc) && /< 500/.test(saleSrc),
    'المسح المكرر الأسرع من نص ثانية بيتتجاهل (كمية بتزيد لوحدها)');
  assert(/window\._lastScanCode = code; window\._lastScanAt = _nowScan;/.test(saleSrc),
    'آخر مسح بيتسجل عشان المقارنة');

// ============================================================
// ٨) حراسات على المصدر — عشان الباجات دي متترجعش تاني
// ============================================================
{
  // التطبيع فعلًا مستخدم قبل الحفظ (مش دالة مهجورة)
  assert(/normalizePayments\(paymentsEntered,\s*total\)/.test(saleSrc),
    'الحفظ بيعدّي على normalizePayments');
  assert(/cashReceived:\s*paymentsEntered\.cash/.test(saleSrc),
    'المستلم الفعلي متسجل في cashReceived');
  // الفاتورة المطبوعة بتاخد المستلم (عشان سطر الفكة)
  assert(/printReceipt\(paymentsEntered,/.test(saleSrc),
    'الفاتورة المطبوعة بتستخدم المستلم مش المطبّق');
  // فاتورة العكس بتحمل مدفوعات سالبة
  const revBlock = saleSrc.slice(saleSrc.indexOf('isReversal: true'), saleSrc.indexOf('isReversal: true') + 600);
  assert(/payments:/.test(revBlock), 'فاتورة العكس فيها payments');
  // التقارير بتستبعد الأصلية المعكوسة وفاتورة العكس مع بعض
  assert(/!s\.reversed\s*&&\s*!s\.isReversal/.test(extractFn(repSrc,'repAggregate')),
    'repAggregate بيستبعد الطرفين مع بعض');
  // التقارير بتستخدم الدالة النقية مش تجميع مضمّن منفصل
  assert(/repAggregate\(sales\)/.test(repSrc), 'renderReportsScreen بينده repAggregate');
  assert(/dcAggregate\(sales\)/.test(repSrc), 'goToEndOfDay بينده dcAggregate');
  // حدود "النهاردة" في التقارير من يوم الشغل — اختبار سلوكي مش نصي:
  // بنشغّل getReportDateBounds فعليًا ونتأكد إن البداية = بداية يوم الشغل بالظبط
  {
    const boundsSrc = extractFn(repSrc, 'getReportDateBounds');
    assert(boundsSrc.length > 0, 'getReportDateBounds موجودة');
    const BIZ = new Date(2026, 6, 29, 6, 0, 0, 0).getTime();   // بداية يوم شغل معروفة
    const sb2 = { window:{}, Date, Math, Number,
      bizDayStartMs: ()=> BIZ,
      currentReportRange: 'today',
      document: { getElementById: ()=> ({ value:'' }) } };
    vm.createContext(sb2);
    vm.runInContext(boundsSrc + '\nthis._b = getReportDateBounds();', sb2);
    assertEq(sb2._b.from.getTime(), BIZ,
      'تقارير النهاردة بتبدأ من بداية يوم الشغل (6 ص) مش نص الليل');
    assertEq(sb2._b.to.getTime(), BIZ + 24*3600000 - 1,
      'تقارير النهاردة بتقفل مع نهاية يوم الشغل');
    vm.runInContext('currentReportRange = "yesterday"; this._b = getReportDateBounds();', sb2);
    assertEq(sb2._b.from.getTime(), BIZ - 24*3600000, 'امبارح = يوم شغل كامل قبل النهاردة');
    assertEq(sb2._b.to.getTime(), BIZ - 1, 'امبارح بيقف قبل بداية النهاردة بملّي واحدة');
  }
  // التقفيل بيكشف فواتير ما بعد آخر تقفيل
  assert(/lateSales/.test(repSrc) && /lastCloseTs/.test(repSrc),
    'التقفيل بيحسب فواتير ما بعد آخر تقفيل (سبب الأوفر)');
  assert(/overShortReal/.test(repSrc), 'الفرق الحقيقي بعد استبعادها بيتحسب ويتسجل');
}

// ============================================================
// ١٧) 🔴 الباركود المكرر — سلوكيًا مش بالنص
// الباج: addInventoryItem كانت `.add(data)` على طول من غير أي فحص.
// صنفين بنفس الكود = المسدس بيقف قدام تطابقين، والبيع بياخد أول واحد
// يلاقيه — ممكن يكون بسعر تاني. الفحص القديم في الاختبارات كان بيدوّر على
// النص في المصدر بس، فتعطيل المنع كان بيعدّي من غير ما اختبار يقع.
// ============================================================
{
  const adm = fs.readFileSync(path.join(POS,'pos-admin.js'),'utf8');
  const D = loadFns(adm, ['barcodeDupReject']);
  const rej = (list, bc, self)=> vm.runInContext(
    `barcodeDupReject(${JSON.stringify(list)}, ${JSON.stringify(bc)}, ${JSON.stringify(self||null)})`, D);

  const inv = [
    { id:'a', barcode:'3301', name:'قميص قطن' },
    { id:'b', barcode:'3302', name:'بيچاما ساتان' },
    { id:'c', barcode:'',     name:'صنف من غير كود' },
    { id:'d', barcode:' 3303 ', name:'طرحة' }
  ];

  assertEq(rej(inv,'9999'), null, 'كود جديد → مفيش منع');
  assert(/متسجل بالفعل على/.test(rej(inv,'3301')||''), '🔑 كود موجود → بيترفض');
  assert(/قميص قطن/.test(rej(inv,'3301')||''), 'الرسالة بتقول اسم الصنف اللي ماسك الكود');
  assert(/3301/.test(rej(inv,'3301')||''), 'والرسالة فيها الكود نفسه');
  assertEq(rej(inv,' 3301 '), rej(inv,'3301'), 'المسافات حوالين الكود مبتخدعش الفحص');
  assert(/طرحة/.test(rej(inv,'3303')||''), 'والمسافات في الكود المتسجل كمان');
  assertEq(rej(inv,''), null, 'كود فاضي = مفيش منع (السيستم بيولّد متسلسل)');
  assertEq(rej(inv,'   '), null, 'مسافات بس = فاضي');
  assertEq(rej([],'3301'), null, 'مخزون فاضي → مفيش منع');
  assertEq(rej(null,'3301'), null, 'قايمة null → مبتقعش');
  assertEq(rej(inv,'3301','a'), null, '✏️ تعديل نفس الصنف مايتبلّغش على نفسه');
  assert(/متسجل بالفعل على/.test(rej(inv,'3301','b')||''), 'بس تعديل صنف تاني لنفس الكود بيترفض');

  // 🔗 والدالة موصّلة فعلًا في مسار الإضافة — مش معرّفة وسايبة
  const addFn = extractFn(adm, 'addInventoryItem');
  assert(addFn.length > 0, 'addInventoryItem اتلقت');
  assert(/barcodeDupReject\(allInventory, barcode\)/.test(addFn),
    '🔗 الإضافة بتنادي الفحص فعلًا');
  assert(/if\(_dupMsg\)\{[^}]*return; \}/.test(addFn),
    '⛔ والمنع بيوقف الإضافة (مش تحذير وبيكمّل)');
  assert(addFn.indexOf('barcodeDupReject') < addFn.indexOf('.add(data)'),
    'الفحص قبل الكتابة في قاعدة البيانات');
}

// ============================================================
// ⌨️ مسح كارت الموظف واللغة عربي
// الشكوى: «بيقرا كلام غريب والكارت مش بيظهر».
// السبب: خريطة الكيبورد فيها حروف بس — ولا رقم. كارت الموظف EC + 10 خانة
// فيها أرقام، فلو ويندوز طلّع ٢٣٤ الحروف تتصلّح والأرقام تفضل عربية →
// الشكل ميطابقش. وده بالظبط «نص متصلّح ونص لأ».
// ============================================================
{
  const saleS = fs.readFileSync(path.join(POS,'pos-sale.js'),'utf8');
  const i = saleS.indexOf('const AR_KEYS'), j = saleS.indexOf('window.normalizeScan');
  assert(i >= 0 && j > i, 'بلوك ترجمة الكيبورد اتلقى');
  const box = { String: String, window: {} };
  vm.createContext(box);
  vm.runInContext(saleS.slice(i, j), box);
  const fx = (x)=> vm.runInContext(`fixArabicKeyboard(${JSON.stringify(x)})`, box);
  const ns = (x)=> vm.runInContext(`normalizeScan(${JSON.stringify(x)})`, box);

  // ---- الأرقام ----
  assertEq(fx('٠١٢٣٤٥٦٧٨٩'), '0123456789', '🔢 الأرقام الهندية بتترجم');
  assertEq(fx('۰۱۲۳۴۵۶۷۸۹'), '0123456789', '🔢 والفارسية كمان');
  assertEq(fx('12345'), '12345', 'والإنجليزية زي ما هي');

  // ---- كارت الموظف بأرقام هندية ----
  assertEq(ns('ECAB٢٣CD٤٥EF'), 'ECAB23CD45EF', '🔑 كارت موظف بأرقام هندية بيتعرف');
  assertEq(ns('ECAB23CD45EF'), 'ECAB23CD45EF', 'وبالإنجليزي زي ما هو');

  // ---- ⚠️ ومايخربش البحث بالاسم العربي ----
  assertEq(ns('قميص قطن'), 'قميص قطن', 'اسم عربي عادي مايتترجمش');
  assertEq(ns('طرحة ٣٤'), 'طرحة ٣٤', 'اسم عربي فيه أرقام هندية مايتترجمش');
  assertEq(ns('بيچاما ساتان'), 'بيچاما ساتان', 'ولا الأسماء الطويلة');
  assertEq(ns(''), '', 'فاضي = فاضي');
  assertEq(ns(null), '', 'null مبيقعش');

  // ---- خانات التحويلات بقت بتترجم ----
  const trS = fs.readFileSync(path.join(POS,'transfers.js'),'utf8');
  const rt = extractFn(trS, '_trRouteCode');
  assert(rt.length > 0, '_trRouteCode اتلقت');
  // ⚠️ لازم نمسك **التطبيق** مش التعريف — سطر `const _ns = ...` بيخلي أي بحث
  //    عن الاسم يعدّي حتى لو النداء نفسه اتشال (نفس فخ §0).
  assert(/code = _ns\(String\(code \|\| ''\)\.trim\(\)\);/.test(rt),
    '🔗 التحويلات بتطبّق الترجمة فعلًا (مش بس معرّفاها)');
  assert(/window\.normalizeScan/.test(rt), 'وبتاخدها من المصدر الصح');
  assert(rt.indexOf('code = _ns(') < rt.indexOf('const up = code.toUpperCase()'),
    'والترجمة قبل الفحص مش بعده');
}

// ============================================================
// 📱 تسجيل عميل جديد برقم غلط
// الباج: الفحص الوحيد كان `if(!phone)` — يعني الخانة مش فاضية وبس.
// والرقم ده **مفتاح المستند**، فرقم ناقص = عميلة جديدة بنقط منفصلة،
// و"0101 234 5678" ≠ "01012345678" = مستندين لنفس الشخص.
// ============================================================
{
  const saleS2 = fs.readFileSync(path.join(POS,'pos-sale.js'),'utf8');
  const P = loadFns(saleS2, ['normalizePhone','phoneRejectReason']);
  const nrm = (x)=> vm.runInContext(`normalizePhone(${JSON.stringify(x)})`, P);
  const rej = (x)=> vm.runInContext(`phoneRejectReason(normalizePhone(${JSON.stringify(x)}))`, P);

  // ---- التطبيع: نفس العميلة = نفس المستند ----
  assertEq(nrm('0101 234 5678'), '01012345678', '📱 المسافات بتتشال');
  assertEq(nrm('0101-234-5678'), '01012345678', 'والشرطات');
  assertEq(nrm('+201012345678'), '01012345678', '🌍 +20 بتتحول لصفر');
  assertEq(nrm('00201012345678'), '01012345678', 'و0020 كمان');
  assertEq(nrm('201012345678'), '01012345678', 'و20 من غير +');
  assertEq(nrm('1012345678'), '01012345678', 'والصفر الناقص بيتزاد');
  assertEq(nrm('٠١٠١٢٣٤٥٦٧٨'), '01012345678', '🔢 والأرقام الهندية (الكيبورد العربي)');
  assertEq(nrm('01012345678'), '01012345678', 'والرقم الصح زي ما هو');
  // 🔑 كل الأشكال دي = نفس المستند
  const forms = ['01012345678','0101 234 5678','+201012345678','1012345678','٠١٠١٢٣٤٥٦٧٨'];
  const uniq = forms.map(nrm).filter(function(v,i,a){ return a.indexOf(v) === i; });
  assertEq(uniq.length, 1, '🔑 كل أشكال نفس الرقم بتوصل لمستند واحد');

  // ---- المنع ----
  assertEq(rej('01012345678'), null, '✅ الرقم الصح بيعدّي');
  assert(/11 رقم/.test(rej('123')||''), '⛔ رقم قصير بيترفض');
  assert(/11 رقم/.test(rej('010123456789')||''), '⛔ ورقم طويل');
  assert(!!rej('abc'), '⛔ وحروف');
  assert(!!rej(''), '⛔ وفاضي');
  assert(/010 أو 011/.test(rej('01912345678')||''), '⛔ وبادئة مش مصرية');
  assertEq(rej('01112345678'), null, 'و011 بتعدّي');
  assertEq(rej('01512345678'), null, 'و015 كمان');

  // ---- موصّل في مسار التسجيل ----
  const reg = extractFn(saleS2, 'registerNewCustomer');
  assert(reg.length > 0, 'registerNewCustomer اتلقت');
  assert(/const phone = normalizePhone\(raw\)/.test(reg), '🔗 التطبيع قبل الحفظ');
  assert(/phoneRejectReason\(phone\)/.test(reg), 'والتحقق كمان');
  assert(/if\(_bad\)\{ showToast/.test(reg), '⛔ والمنع بيوقف التسجيل');
  assert(reg.indexOf('phoneRejectReason') < reg.indexOf('.set({ name, phone'),
    'التحقق **قبل** الكتابة');
  assert(/if\(phone !== raw\)/.test(reg) && /confirm\(/.test(reg),
    '🔄 ولو التطبيع غيّر الرقم، الكاشير بتشوفه وتأكّد');

  // ---- 🔴 اتغيّر بقرار المالك: الرقم الناقص مبقاش يعدّي ----
  // قبل كده أي رقم (٤ أرقام مثلاً) كان بيتعامل معاملة "مش مسجّل" ويفتح
  // التسجيل — فتتسجّل عميلة بمفتاح غلط ونقطها تروح لمستند مش بتاعها.
  const rci = extractFn(saleS2, 'refreshCustomerInfo');
  assert(rci.length > 0, 'refreshCustomerInfo اتلقت');
  assert(/phoneRejectReason/.test(rci),
    '🔴 البحث بقى بيمرّ على المنع — الرقم الناقص مبيفتحش تسجيل');
  assert(/setCustState\('bad'\)/.test(rci),
    'وبيوري حالة واضحة إن الرقم ناقص بدل ما يقول "مش مسجّل"');
  const badIdx = rci.indexOf("setCustState('bad')");
  assert(badIdx > 0 && badIdx < rci.indexOf('TEST_CUSTOMERS'),
    '🔴 والفحص **قبل** القراءة من الداتابيز — مفيش قراءة على رقم غلط أصلًا');
}

// ============================================================
// 📱 صف العميل في شاشة البيع
// الشكوى: الصف طويل جدًا · خانة الاسم مفرودة طول الوقت من غير لازمة ·
// ومسح العميل محتاج تمسح الرقم كله وتدوس Enter أو تنقر برّه.
// ============================================================
{
  const html = fs.readFileSync(path.join(POS,'index.html'),'utf8');
  const saleS3 = fs.readFileSync(path.join(POS,'pos-sale.js'),'utf8');

  // ---- 📱 الرقم أولًا والاسم بيبان بالحالة ----
  const box = html.slice(html.indexOf('<div id="custBox">'), html.indexOf('id="resetPinRow"'));
  assert(box.indexOf('id="customerPhone"') < box.indexOf('id="customerName"'),
    '📱 خانة الرقم قبل الاسم — الكاشير بتسجّل بالرقم');
  assert(/#customerName\{[^}]*display:none/.test(html),
    '🔴 خانة الاسم مقفولة افتراضيًا');
  assert(/#custBox\.st-new #customerName\{ display:block/.test(html),
    'وبتفتح بالحالة (CSS) — مش بتلاعب بالـstyle من الجافاسكربت');
  assert(/#customerPhone\{[\s\S]{0,200}flex:1 1 auto/.test(html), 'والرقم بياخد المساحة');

  // ---- ✕ زرار المسح ----
  assert(/id="custClearBtn"/.test(box), '✕ زرار مسح العميل موجود');
  assert(/onclick="clearCustomer\(\)"/.test(box), 'وموصّل');
  const cc = extractFn(saleS3, 'clearCustomer');
  assert(cc.length > 0, 'دالة المسح موجودة');
  assert(/ph\.value = ''/.test(cc) && /nm\.value = ''/.test(cc), 'بتفضّي الرقم والاسم');
  // 🔄 اتغيّرت: المسح بقى **محلي** — بيفك سياق العميل من غير قراءة جديدة
  //    من الداتابيز (كان بينادي refreshCustomerInfo وبيعمل قراءة على الفاضي).
  assert(/clearCustomerContext\(\)/.test(cc), 'وبتفك سياق العميل (استبدال/مكافأة/عروض)');
  assert(/setCustState\(''\)/.test(cc), 'وبترجّع الخانة لحالتها الفاضية');
  assert(!/refreshCustomerInfo\(\)/.test(cc),
    '🔴 ومفيش قراءة جديدة من الداتابيز على رقم فاضي');
  assert(/ph\.focus\(\)/.test(cc), 'وبترجّع المؤشر للرقم — جاهزة للعميل اللي بعده');

  // الزرار بيظهر بس لما فيه رقم
  const sync = extractFn(saleS3, '_custBtnSync');
  assert(/classList\.toggle\('on'/.test(sync),
    '👁️ الزرار بيبان ويختفي بالكلاس — ومكانه محجوز فمبيزقّش حاجة');
  assert(/#custClearBtn\{[^}]*visibility:hidden/.test(html),
    '🔴 visibility مش display — عشان الزراير اللي جنبه ما تتحركش');
  assert(/_custBtnSync\(\);/.test(saleS3) && /addEventListener\('input'/.test(saleS3),
    'وبيتحدّث مع الكتابة — مش مستني blur');
  assert(/_custDetachIfChanged\(\);/.test(saleS3),
    '✏️ وتغيير رقم عميل متربط بيفك الربط فورًا');

  // ---- 📱 بحث تلقائي على 11 رقم ----
  assert(/v\.length === 11\) refreshCustomerInfo\(\)/.test(saleS3),
    '📱 11 رقم = بحث تلقائي (من غير Enter ولا نقرة برّه)');

  // ---- 📝 المؤشر بينط لخانة الاسم لوحده ----
  const scs = extractFn(saleS3, 'setCustState');
  assert(/st === 'new'/.test(scs) && /nm\.focus\(\)/.test(scs),
    '📝 الرقم مش مسجّل → المؤشر بينط لخانة الاسم من غير ما الكاشير تدوس');
  assert(/document\.activeElement !== nm/.test(scs),
    '🔴 ومبيخطفش المؤشر لو الكاشير بتكتب فيها أصلًا');
}
