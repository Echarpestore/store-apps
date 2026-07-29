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
  const saleTs = (s)=> vm.runInContext('saleTs(' + JSON.stringify(s).replace(/"__FN__"/,'') + ')', fns);
  // فاتورة متزامنة: طابع السيرفر هو المرجع
  vm.runInContext('this._r = saleTs({ createdAt: { toMillis: function(){ return 111; } }, createdAtMs: 999 });', fns);
  assertEq(fns._r, 111, 'الطابع المؤكد من السيرفر له الأولوية');
  // فاتورة أوفلاين: serverTimestamp لسه null → الطابع المحلي
  vm.runInContext('this._r = saleTs({ createdAt: null, createdAtMs: 555 });', fns);
  assertEq(fns._r, 555, 'فاتورة الأوفلاين بتتحسب بالطابع المحلي (كانت بتختفي)');
  // فاتورة قديمة جدًا من غير أي طابع
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
  assert(/where\('createdAt','>=', from\)/.test(repBody), 'التقارير بتستعلم بنطاق الفترة');
  assert(/saleTs\(s\)/.test(repBody), 'فلتر الفترة في التقارير بيستخدم saleTs');
  // التقفيل مش بيتسجل والنت قاطع من غير تأكيد صريح
  const finBody = extractFn(repSrc, 'dcFinish');
  assert(/fromCache/.test(finBody) && /confirm\(/.test(finBody),
    'تقفيل والنت قاطع = تأكيد إجباري');
}

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
