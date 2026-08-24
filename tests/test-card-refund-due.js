// ============================================================
// 💳↩️ test-card-refund-due — فاتورة 1444: فيزا 1610 على فاتورة 1260
// ------------------------------------------------------------
// القصة: الماكينة سحبت على السلة الكاملة، اتشالت قطعة (350) بعد
// الموافقة، الكاشير أكّد التحذير الموجود أصلًا، والفاتورة اتحفظت.
// الفلوس اتسحبت من العميلة فعلًا — والفرق كان بيتسجل في لوج محدش
// بيفتحه. الإصلاح: حلقة متابعة كاملة — مستند مستحق + سطر على
// الفاتورة + قايمة في Office لحد ما يترد.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const posSale = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');
const posApp = fs.readFileSync(path.join(ROOT, 'pos', 'app.js'), 'utf8');
const office = fs.readFileSync(path.join(ROOT, 'Office', 'office.js'), 'utf8');
const officeHtml = fs.readFileSync(path.join(ROOT, 'Office', 'index.html'), 'utf8');
const rules = fs.readFileSync(path.join(ROOT, 'security', 'firestore-phase2.rules'), 'utf8');

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const extractFn = (src, sig) => {
  const i = src.indexOf(sig);
  if(i < 0) return '';
  let j = src.indexOf('{', i), depth = 0;
  for(let k = j; k < src.length; k++){
    if(src[k] === '{') depth++;
    else if(src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
  }
  return '';
};

// ============================================================
// ١) الدالة النقية — نشغّلها فعلًا بسيناريو فاتورة 1444 بالظبط
// ============================================================
{
  const code = strip(posSale);
  const fnPayload = extractFn(code, 'function cardRefundDuePayload(legs, total, ctx)');
  const fnSum = extractFn(code, 'function cardApprovedSum(legs)');
  assert(fnPayload.length > 100 && fnSum.length > 20,
    'دوال cardRefundDuePayload وcardApprovedSum اتلقوا (البلوك اتقرا صح)');
  const sandbox = {};
  new Function(fnSum + '\n' + fnPayload
    + '\nreturn { cardRefundDuePayload, cardApprovedSum };').call(sandbox);
  const api = new Function(fnSum + '\n' + fnPayload
    + '\nreturn { cardRefundDuePayload: cardRefundDuePayload, cardApprovedSum: cardApprovedSum };')();

  // 🧾 سيناريو 1444: كارت واحد متأكد بـ1610 والفاتورة بقت 1260
  const legs1444 = [{ seq: 1, amount: 1610, status: 'approved',
                      txn: { txnId: '514825677', last4: '8406' } }];
  const d = api.cardRefundDuePayload(legs1444, 1260, {
    branch: 'الرحاب', invoiceCode: 'FTRH1444-X', phone: '01144288231',
    name: 'شيرين', employeeName: 'Rawan' });
  assert(!!d, 'فاتورة 1444 بتولّد مستند متابعة');
  assert(d.diff === 350, '🔴 الفرق = 350 بالظبط (قطعة الـ832 اللي اتشالت)');
  assert(d.status === 'due' && d.charged === 1610 && d.invoiceTotal === 1260,
    'مستحق · المسحوب 1610 · الفاتورة 1260');
  assert(d.customerPhone === '01144288231' && d.txns[0].txnId === '514825677',
    'رقم شيرين ورقم العملية جوه المستند — الرد بيتم على العملية دي تحديدًا');

  // ✅ فاتورة سليمة (المسحوب = الفاتورة) = مفيش مستند
  assert(api.cardRefundDuePayload(
    [{ seq:1, amount:1260, status:'approved', txn:{} }], 1260, {}) === null,
    'مطابقة للقرش = مفيش متابعة (مش بننضف مستندات فاضية)');

  // 🔴 نيجاتيف: شريحة pending مش بتتحسب مسحوبة — الفلوس لسه ماتسحبتش
  assert(api.cardRefundDuePayload(
    [{ seq:1, amount:1610, status:'pending', txn:{} }], 1260, {}) === null,
    '🔴 pending مش approved = مفيش فلوس اتسحبت = مفيش مستحق');

  // 🔴 نيجاتيف: فتات التقريب (أقل من نص قرش) مش بيفتح مستحقات —
  //    مبالغ الكروت أصلًا بقرشين عشريين، وده حماية من عوامات الحساب
  assert(api.cardRefundDuePayload(
    [{ seq:1, amount:1260.004, status:'approved', txn:{} }], 1260, {}) === null,
    'فتات تقريب = مفيش مستحق');

  // كارتين: الاتنين بيتسجلوا في txns والمجموع هو المسحوب
  const d2 = api.cardRefundDuePayload(
    [{ seq:1, amount:1000, status:'approved', txn:{ txnId:'A' } },
     { seq:2, amount:610,  status:'approved', txn:{ txnId:'B' } },
     { seq:3, amount:99,   status:'failed',   txn:{} }], 1260, {});
  assert(d2 && d2.charged === 1610 && d2.txns.length === 2,
    'كارتين متأكدين = مجموعهم، والفاشل مش بيتحسب ولا بيتسجل');
}

// ============================================================
// ٢) التوصيل في POS: الكتابة بعد الحفظ + مش بتوقف الفاتورة
// ============================================================
{
  const code = strip(posSale);
  const dc = extractFn(code, 'async function _doConfirmPayment()');
  assert(dc.indexOf("db.collection('pos_card_refunds_due').add(_due)") > -1,
    'مستند المتابعة بيتكتب جوه مسار الحفظ (الكود والعميل معروفين هناك)');
  assert(dc.indexOf('cardRefundDuePayload(cardLegs, total,') > -1,
    'من الدالة النقية المتختبرة فوق — مش حسبة تانية مكررة');
  const wi = dc.indexOf("pos_card_refunds_due");
  const si = dc.indexOf('_saleW.error');
  assert(si > -1 && wi > si,
    '🔴 الكتابة **بعد** نجاح حفظ الفاتورة — فاتورة فشلت = مفيش مستحق وهمي');
  assert(dc.indexOf(".add(_due).catch(function(){})") > -1,
    '🔴 وbest-effort: فشل كتابة المتابعة ميوقفش الفاتورة (العميلة واقفة)');
}

// ============================================================
// ٣) الفاتورة المطبوعة: "يُرد للعميلة" — الورقة إثبات حقها
// ============================================================
{
  // ⚠️ البحث في **الخام** عمدًا: strip بالـregex بياكل كود حقيقي هنا
  //    (فيه /* جوه template strings) — نفس درس extractFn الموثّق.
  //    وعشان فخ الفحص الفضفاض: العبارة دي مش موجودة في أي كومنت.
  assert(posApp.indexOf('cardOverStr') > -1, 'حقل الزيادة في داتا الفاتورة');
  assert(posApp.indexOf('مسحوب فيزا زيادة — يُرد للعميلة') > -1,
    'وسطر صريح "يُرد للعميلة" مش مجرد قوس جنب الإجمالي');
  // الشرط: فيزا موجبة + بيع (مش مرتجع) + فرق حقيقي — جوه باني الحقل
  const k = posApp.indexOf('cardOverStr: (function(){');
  assert(k > -1, 'باني الحقل موجود');
  const blk = posApp.slice(k, k + 600);
  assert(blk.indexOf('Number(total) > 0') > -1,
    '🔴 المرتجع (إجمالي سالب) مبيطلعش عليه السطر ده — الفيزا فيه سالبة أصلًا');
  assert(blk.indexOf('0.005') > -1, 'وفتات التقريب مش بيطبع تحذير');
}

// ============================================================
// ٤) Office: القايمة والقفلة والبادج
// ============================================================
{
  const code = strip(office);
  assert(code.indexOf("db.collection('pos_card_refunds_due')") > -1
      && code.indexOf("where('ts', '>=', Date.now() - 60 * 24 * 60 * 60 * 1000)") > -1,
    '🔴 المستمع بنافذة ٦٠ يوم — مش مستمع بلا حد (درس القراءات)');
  const rr = extractFn(code, 'function renderRefundsDue()');
  assert(rr.length > 100, 'دالة renderRefundsDue اتلقت');
  assert(rr.indexOf("x.status === 'due'") > -1 && rr.indexOf('ofMarkRefunded') > -1,
    'المستحق بيتفلتر وزرار «اترد» موجود');
  assert(rr.indexOf('من غير رقم!') > -1,
    'مستحق من غير رقم عميلة = تحذير بارز (مين هناديها إزاي؟)');
  const mk = code.slice(code.indexOf('window.ofMarkRefunded'), code.indexOf('window.ofMarkRefunded') + 700);
  assert(mk.indexOf("status: 'refunded'") > -1 && mk.indexOf('refundedAt') > -1,
    'القفلة بتسجل الحالة والوقت');
  assert(mk.indexOf('confirm(') > -1 && mk.indexOf('مش هو اللي بيرد الفلوس') > -1,
    '🔴 وتأكيد بيوضّح إن الزرار تسجيل — الرد الحقيقي من داشبورد Paymob');
  assert(officeHtml.indexOf('id="refundsDuePanel"') > -1
      && officeHtml.indexOf('id="refundsDueBody"') > -1,
    'البانل في صفحة الفلوس');
  assert(code.indexOf("(D.refundsDue || []).filter(function(r){ return r && r.status === 'due'; }).length") > -1,
    'وبادج الفلوس بيعدّ المستحق — مش مستني حد يفتح التبويب بالصدفة');
}

// ============================================================
// ٥) القواعد: كتابة POS · قفلة بس · ممنوع المسح والتلاعب بالمبالغ
// ============================================================
{
  assert(rules.indexOf('match /pos_card_refunds_due/{id}') > -1,
    'المجموعة في ملف القواعد');
  const blk = rules.slice(rules.indexOf('match /pos_card_refunds_due'),
                          rules.indexOf('match /pos_card_refunds_due') + 700);
  assert(blk.indexOf('allow delete: if false') > -1,
    '🔴 المسح ممنوع — السجل ده حق عميلة مش بيختفي');
  assert(blk.indexOf('request.resource.data.diff == resource.data.diff') > -1
      && blk.indexOf("request.resource.data.status == 'refunded'") > -1,
    '🔴 التعديل = قفلة الحالة بس، والمبلغ متجمّد (درس القواعد: القفل بالنص الصريح)');
}

// ============================================================
// ٦) الكاش اتحدّث (وإلا الأجهزة تفضل على القديم)
// ============================================================
{
  const posSw = fs.readFileSync(path.join(ROOT, 'pos', 'sw.js'), 'utf8');
  const ofSw = fs.readFileSync(path.join(ROOT, 'Office', 'sw.js'), 'utf8');
  // ⚠️ كان فحص **مساواة** على v298/v48 بالنص — يعني أي ترقية كاش بعد كده
  //    بتوقّع الاختبار وشكلها باج حقيقي. الفحص الصح هو **الحد الأدنى**:
  //    اللي يهمنا إن الكاش مانزلش عن النسخة اللي فيها الإصلاح.
  const posV = (posSw.match(/store-apps-shell-v(\d+)/) || [])[1];
  const ofV = (ofSw.match(/echarpe-office-v(\d+)/) || [])[1];
  assert(!!posV && Number(posV) >= 298, 'POS → v298+ (لقينا v' + (posV || '?') + ')');
  assert(!!ofV && Number(ofV) >= 48, 'Office → v48+ (لقينا v' + (ofV || '?') + ')');
}

// ============================================================
// ٧) 🕵️ سجل النشاط في Office (v45) — التبويب اللي كان "قريبًا"
// ------------------------------------------------------------
// قصة 1444 كانت متسجلة بالكامل (الصنف اللي اتشال + التحذير اللي
// اتأكد) — بس مفيش شاشة بتعرضها. ٢٨ نوع حدث بيتكتبوا من زمان.
// ============================================================
{
  const code = strip(office);

  /* ١) كل نوع بيتكتب من POS ليه وصف في الجدول — وإلا يظهر كود إنجليزي */
  const logged = {};
  [posSale, posApp,
   fs.readFileSync(path.join(ROOT, 'pos', 'products.js'), 'utf8')]
    .forEach(function(f){
      (f.match(/_logActivity\(\s*'([a-z_]+)'/g) || []).forEach(function(m){
        logged[m.replace(/.*'([a-z_]+)'.*/, '$1')] = 1;
      });
    });
  const known = Object.keys(logged).filter(function(t){
    return code.indexOf(t + ':') > -1 || code.indexOf(t + ' ') > -1;
  });
  assert(Object.keys(logged).length > 15, 'لقينا أنواع الأحداث في POS');
  Object.keys(logged).forEach(function(t){
    assert(code.indexOf(t) > -1,
      '🔎 نوع الحدث `' + t + '` ليه وصف بالعربي في جدول Office — نوع جديد من غير وصف بيظهر كود إنجليزي للمالك');
  });
  assert(known.length > 0, 'الجدول متقروء');

  /* ٢) الحدث بتاع 1444 تحديدًا موصوف ومتعلّم كمقلق */
  const kinds = code.slice(code.indexOf('const OF_ACT_KINDS'),
                           code.indexOf('function ofActLabel'));
  assert(kinds.indexOf('card_overcharge_saved') > -1 && /card_overcharge_saved[^\n]*hot:\s*true/.test(kinds),
    '🔴 سحب الفيزا الزيادة متعلّم "محتاج نظرة" — مش سطر عادي وسط ٤٠٠ حدث');
  ['manual_drawer_open', 'inventory_wiped', 'manual_discount', 'customer_points_edit']
    .forEach(function(t){
      assert(new RegExp(t + '[^\\n]*hot:\\s*true').test(kinds),
        'و`' + t + '` كذلك (حدث حساس)');
    });
  assert(/item_removed[^\n]*g:\s*'cart'/.test(kinds),
    'وشيل الصنف من السلة (اللي حصل في 1444) مصنّف تحت السلة');

  /* ٣) القراءة محدودة — السجل ده أسرع مجموعة في النمو */
  const ld = extractFn(code, 'async function ofLoadActivity()');
  assert(ld.indexOf("where('ts', '>=',") > -1 && ld.indexOf('days * 24 * 60 * 60 * 1000') > -1,
    '🔴 نافذة زمنية من المستخدم — مش السجل كله');
  assert(ld.indexOf('.limit(OF_ACT_LIMIT)') > -1 && code.indexOf('OF_ACT_LIMIT = 400') > -1,
    '🔴 وسقف ٤٠٠ مستند — نافذة من غير سقف لسه ممكن تجيب عشرات الآلاف');
  assert(code.indexOf("page === 'odd' && !_ofActRaw.length") > -1,
    'والتحميل بفتح التبويب مرة واحدة من الراوتر المركزي — مش مستمع شغال طول الوقت');

  /* ٤) 🔴 TDZ — الدرس الموثّق: `let` مبتترفعش */
  const decl = code.indexOf('let _ofActRaw');
  const use = code.indexOf("'odd' && !_ofActRaw.length");
  assert(decl > -1 && use > -1 && decl < use,
    '🔴 `_ofActRaw` متعرّف **قبل** هاندلر التبويب اللي بيقراه — نفس باج OF_RECUR_COL');

  /* ٥) الفلترة: دالة نقية بنشغّلها فعلًا */
  const fl = extractFn(code, 'function ofActFilter(list, opts)');
  const lb = extractFn(code, 'function ofActLabel(type)');
  const kindsObj = code.slice(code.indexOf('const OF_ACT_KINDS'),
                              code.indexOf('function ofActLabel'));
  const api = new Function('esc',
    kindsObj + lb + fl + '\nreturn ofActFilter;')(function(x){ return x; });
  const sample = [
    { type:'card_overcharge_saved', ts:300, branch:'الرحاب', employeeName:'Rawan', diff:350 },
    { type:'item_removed', ts:200, branch:'الرحاب', employeeName:'Rawan', name:'قطن تايلاندي' },
    { type:'inventory_wiped', ts:100, branch:'مدينتي', employeeName:'سارة' }
  ];
  assert(api(sample, {}).map(function(a){ return a.ts; }).join() === '300,200,100',
    'الأحدث فوق (ترتيب تنازلي بالوقت)');
  assert(api(sample, { group:'money' }).length === 1,
    'فلتر «فلوس بس» بيجيب حدث الفيزا لوحده');
  assert(api(sample, { group:'stock' })[0].type === 'inventory_wiped',
    'وفلتر المخزون بيجيب مسح المخزون');
  assert(api(sample, { q:'قطن' }).length === 1,
    'والبحث بيلاقي الصنف اللي اتشال بالاسم');
  assert(api(sample, { q:'رawan'.replace('ر','R') }).length === 2,
    'والبحث باسم الموظفة بيجيب أحداثها');
  assert(api(sample, { q:'مدينتي' })[0].branch === 'مدينتي', 'وبالفرع كذلك');
  assert(api(sample, { q:'حاجة_مش_موجودة' }).length === 0, 'وبحث فاضي = صفر');
  // 🔴 نيجاتيف: الفلتر والبحث مع بعض لازم يتطبقوا الاتنين
  assert(api(sample, { group:'money', q:'مدينتي' }).length === 0,
    '🔴 الفلتر والبحث بيتجمعوا (AND) — مش واحد بيلغي التاني');
}

// ============================================================
// ٨) 🧾 v296 — رقم الفاتورة على الحدث + الضغط على الصف
// ------------------------------------------------------------
// لقطة المالك: "سحب فيزا زيادة اتأكد · فرق 350" — من غير رقم
// فاتورة ومن غير أي طريقة توصل للتفاصيل. السبب: وقت وقوع الحدث
// الفاتورة لسه مالهاش رقم أصلًا (بيتولّد جوه مسار الحفظ).
// الحل: معرّف سلة على كل حدث + حدث ربط بعد الحفظ.
// ============================================================
{
  const code = strip(posSale);

  /* ١) معرّف السلة بيتولد مع أول قطعة وبيتصفّر مع السلة الجديدة */
  const atc = extractFn(code, 'function addToCart(item)');
  assert(atc.indexOf('_cartSid = _newCartSid()') > -1,
    'أول قطعة في السلة = معرّف جديد');
  const cs = extractFn(code, 'function clearSaleState()');
  assert(cs.indexOf('_cartSid = null') > -1,
    '🔴 سلة جديدة = معرّف جديد — من غير التصفير أحداث فاتورتين بتتلخبط مع بعض');
  const rs = extractFn(code, 'function restoreSaleState(s)');
  assert(rs.indexOf('_cartSid = s.cartSid') > -1,
    'والهولد بيرجّع نفس المعرّف — قصة واحدة قبل وبعد التعليق');

  /* ٢) كل حدث بياخده تلقائي */
  const la = extractFn(code, 'function _logActivity(type, data)');
  assert(la.indexOf('sid: _cartSid || null') > -1,
    '🔴 المعرّف بيتحط في _logActivity نفسها — مش على كل نداء لوحده (٢٨ نوع)');

  /* ٣) حدث الربط بعد الحفظ */
  const dc = extractFn(code, 'async function _doConfirmPayment()');
  assert(dc.indexOf("_logActivity('sale_saved'") > -1
      && dc.indexOf('invoiceCode: invoiceCode, invoiceNo: invoiceNo') > -1,
    'حدث sale_saved بيحمل رقم الفاتورة');
  const iSaved = dc.indexOf("_logActivity('sale_saved'");
  const iErr = dc.indexOf('_saleW.error');
  assert(iErr > -1 && iSaved > iErr,
    '🔴 بعد نجاح الحفظ — قبله الفاتورة مالهاش رقم من الأساس');
  assert(dc.indexOf('cartSid: _cartSid || null') > -1,
    'والفاتورة نفسها بتحفظ المعرّف (ربط من الناحيتين)');

  /* ٤) حدث الفيزا الزيادة بقى بيتسجل مرتين بمعنيين مختلفين */
  assert(code.indexOf("_logActivity('card_overcharge_ok'") > -1,
    'وقت التأكيد (قبل الحفظ) = نية الكاشير');
  const iOver = dc.indexOf("_logActivity('card_overcharge_saved'");
  assert(iOver > iErr && dc.indexOf('invoiceCode: invoiceCode,\n          customerPhone') > -1,
    '🔴 وبعد الحفظ = النتيجة، وفيها رقم الفاتورة والتليفون ورقم العملية');
}

// ============================================================
// ٩) 🕵️ Office v46 — الربط والضغط
// ============================================================
{
  const code = strip(office);

  /* ١) الربط: دالة نقية بنشغّلها فعلًا */
  const lk = extractFn(code, 'function ofActLinkInvoices(list)');
  assert(lk.length > 50, 'دالة ofActLinkInvoices اتلقت');
  const api = new Function(lk + '\nreturn ofActLinkInvoices;')();
  const evts = [
    { id:'1', type:'item_removed', sid:'AAA', ts:100, name:'حرير سادة' },
    { id:'2', type:'card_overcharge_saved', sid:'AAA', ts:200, diff:350 },
    { id:'3', type:'sale_saved', sid:'AAA', ts:300, invoiceCode:'FTGL1444-X', total:1260 },
    { id:'4', type:'item_removed', sid:'BBB', ts:150, name:'صنف تاني' },
    { id:'5', type:'cart_abandoned', ts:50 }        // حدث قديم من غير sid
  ];
  api(evts);
  assert(evts[0]._linkedInvoice === 'FTGL1444-X',
    '🔴 الصنف اللي اتشال واخد رقم فاتورة سلته — ده اللي كان ناقص في اللقطة');
  assert(evts[1]._linkedInvoice === 'FTGL1444-X', 'وسحب الفيزا الزيادة كذلك');
  assert(!evts[3]._linkedInvoice,
    '🔴 سلة تانية (sid مختلف) مبتاخدش رقم فاتورة السلة الأولى');
  assert(!evts[4]._linkedInvoice,
    'وحدث قديم من غير معرّف بيفضل من غير رقم — مش بيتخمّنله واحد غلط');

  /* ٢) الصف قابل للضغط وبيوري الرقم */
  const rr = extractFn(code, 'function ofRenderActivity()');
  assert(rr.indexOf('onclick="ofActOpen(') > -1,
    '🔴 الصف قابل للضغط — كان عنوان جامد من غير أي طريقة للتفاصيل');
  assert(rr.indexOf("a.invoiceCode || a._linkedInvoice") > -1,
    'ورقم الفاتورة بيظهر على الصف نفسه');

  /* ٣) شاشة التفاصيل: كل الحقول + قصة السلة */
  const op = code.slice(code.indexOf('window.ofActOpen'), code.indexOf('function startData()'));
  assert(op.indexOf('OF_ACT_FIELD_AR') > -1 && op.indexOf('Object.keys(a).forEach') > -1,
    '🔴 بتعرض **كل** حقول الحدث الخام — نوع جديد بيبان من غير ما نستنى تحديث');
  assert(op.indexOf('x.sid === a.sid') > -1 && op.indexOf('قصة السلة') > -1,
    'وقصة السلة كاملة بالترتيب الزمني (الصنف اتشال ← السحب الزيادة ← الفاتورة)');
  assert(op.indexOf('a.sid && x.sid') > -1,
    '🔴 وحدث من غير sid مبيجمّعش كل الأحداث اليتيمة مع بعض');
  assert(op.indexOf('مفيش فاتورة مربوطة') > -1,
    'ولو مفيش ربط، بتقول ليه بدل ما تسيب المالك يخمّن');

  /* ٤) الوصف المضلّل اتصلح */
  assert(code.indexOf("print_latency:         { t:'🖨️ زمن الطباعة'") > -1,
    "🔴 print_latency بيتسجل لكل طباعة مش للمتأخرة بس — 'اتأخرت' كان بيخوّف من غير سبب");
  assert(/print_latency[^\n]*quiet:\s*true/.test(code),
    'ومتعلّم هادي (مش حدث محتاج نظرة)');
}

// ============================================================
// ١٠) 🔍 v297 — الحدث بيقول **ليه**: التعديل اللي بعد سحب الكارت
// ------------------------------------------------------------
// سؤال المالك على اللقطة: "سحب فيزا زيادة ليه مش موضح إن فيه قطعة
// اتشالت اللي هي الـ350؟". السبب كان في السجل (حدث تاني قبله بساعة)
// بس مش مربوط. الربط الصح **بالوقت**: تعديل قبل السحب مالوش علاقة،
// وتعديل بعده هو بالظبط اللي خلّى العميلة دافعة زيادة.
// ============================================================
{
  const code = strip(posSale);

  /* ١) الدالة النقية — بنشغّلها على سيناريو 1444 */
  const fn = extractFn(code, 'function cardOverCause(edits, diff)');
  assert(fn.length > 80, 'دالة cardOverCause اتلقت');
  const cause = new Function(fn + '\nreturn cardOverCause;')();

  const c = cause([{ kind:'شيل', name:'حرير سادة سواريه', qty:1, value:350 }], 350);
  assert(!!c && c.text.indexOf('حرير سادة سواريه') > -1 && c.text.indexOf('350') > -1,
    '🔴 السبب بيتكتب صريح: "شيل حرير سادة سواريه (350)"');
  assert(c.exact === true,
    '🔴 ومطابق للفرق بالظبط = ده السبب الكامل (350 = 350)');

  // قطعتين اتشالوا = المجموع
  const c2 = cause([{ kind:'شيل', name:'أ', qty:1, value:200 },
                    { kind:'تعديل', name:'ب', qty:2, value:150 }], 350);
  assert(c2.sum === 350 && c2.exact === true && c2.items.length === 2,
    'تعديلين مجموعهم الفرق = الاتنين سبب');

  // 🔴 نيجاتيف: السبب مش مغطي الفرق = علامة استفهام مش تطمين كاذب
  const c3 = cause([{ kind:'شيل', name:'أ', qty:1, value:100 }], 350);
  assert(c3.exact === false,
    '🔴 سبب أقل من الفرق = exact:false — فيه حاجة تانية لسه مش مفهومة');

  assert(cause([], 350) === null && cause(null, 350) === null,
    'مفيش تعديلات = مفيش سبب (مش نص فاضي مضلّل)');
  assert(cause([{ kind:'شيل', name:'أ', qty:1, value:0 }], 350) === null,
    'وتعديل بقيمة صفر مش سبب');

  /* ٢) التتبع بالوقت — قبل السحب مالوش علاقة */
  const tr = extractFn(code, 'function _trackEditAfterCard(kind, name, qty, value)');
  assert(tr.indexOf('if(!_cardMoneyAtRiskAt) return;') > -1,
    '🔴 تعديل **قبل رنين الماكينة** مش بيتسجل كسبب — ده بيع عادي، وتسجيله كان هيتهم الكاشير غلط');
  assert(code.indexOf('if(!_cardMoneyAtRiskAt) _cardMoneyAtRiskAt = Date.now();') > -1,
    '🔴 والمرجع هو **الرنين** مش الموافقة — الفجوة بينهم ثواني والعميلة ممكن تكون حاطة الكارت');
  assert(code.indexOf('if(!_cardFirstApprovedAt) _cardFirstApprovedAt = _leg.approvedAt;') > -1,
    'ولحظة الموافقة بتتمسك برضه (للتفرقة بين الحالتين)');
  assert(tr.indexOf('afterApproval:') > -1,
    'وكل تعديل بيتعلّم: بعد الموافقة (مؤكد) ولا أثناء ما الماكينة شغالة');

  /* ٣) موصّل بشيل الصنف وبتعديل السعر/الكمية */
  const cr = extractFn(code, 'function cartRemove(idx)');
  assert(cr.indexOf("_trackEditAfterCard('شيل'") > -1,
    'شيل صنف بيتسجل بقيمته (سعر × كمية)');
  assert(code.indexOf("_trackEditAfterCard('تعديل'") > -1
      && code.indexOf('if(_drop > 0)') > -1,
    '🔴 وتعديل السعر/الكمية كذلك — بس لو **نقّص** الفاتورة (الزيادة مش سبب لفرق)');

  /* ٤) بيتصفّر مع السلة الجديدة */
  const cs = extractFn(code, 'function clearSaleState()');
  assert(cs.indexOf('_cardFirstApprovedAt = null') > -1
      && cs.indexOf('_cardMoneyAtRiskAt = null') > -1
      && cs.indexOf('_cartEditsAfterCard = []') > -1,
    '🔴 سلة جديدة = تتبّع جديد — من غير كده تعديلات فاتورة قديمة بتظهر سبب لفاتورة تانية');

  /* ٥) الحدث والمستند الاتنين بياخدوا السبب */
  const dc = extractFn(code, 'async function _doConfirmPayment()');
  assert(dc.indexOf('cause: _cause ? _cause.text : null') > -1
      && dc.indexOf('causeExact: _cause ? _cause.exact : null') > -1,
    'حدث السجل بياخد السبب ومطابقته');
  assert(dc.indexOf('_due.cause = _c0.text') > -1,
    'ومستند المستحق كذلك — الرد بيتم منه');
}

// ============================================================
// ١١) 🕵️ Office v47 — عرض السبب
// ============================================================
{
  const code = strip(office);
  const det = extractFn(code, 'function ofActDetail(a)');
  assert(det.indexOf("'<b>السبب: '") > -1,
    '🔴 السبب بيظهر على الصف نفسه — مش مستخبي جوه التفاصيل');
  assert(det.indexOf("a.causeExact === false") > -1,
    '🔴 وسبب مش مغطي الفرق بيتعلّم صراحةً — تطمين كاذب أخطر من مفيش سبب');
  assert(code.indexOf("cause:'سبب الفرق'") > -1, 'وباسم عربي في شاشة التفاصيل');
  const rr = extractFn(code, 'function renderRefundsDue()');
  assert(rr.indexOf('<b>السبب:</b>') > -1,
    'وفي قايمة المستحقات كمان — دي الشاشة اللي بترد منها');
}

// ============================================================
// ١٢) ⏱️ v298 — اعتراض المالك: "أكيد هي مسحت قبل التأكيد"
// ------------------------------------------------------------
// اعتراض في محله. تسلسل الأحداث الحقيقي:
//   الماكينة بترن بمبلغ السلة الكاملة → العميلة بتحط الكارت →
//   الموافقة → **بعدين** الكاشير بتدوس حفظ.
// يعني هي فعلًا مسحت قبل **التأكيد** (زرار الحفظ) — بس المبلغ
// كان راح للماكينة قبل كده، وده اللي خلّى الفرق. فالمرجع الصح
// هو **رنين الماكينة** مش الموافقة ومش الحفظ.
// ============================================================
{
  const code = strip(posSale);
  const fn = extractFn(code, 'function cardOverCause(edits, diff)');
  const cause = new Function(fn + '\nreturn cardOverCause;')();

  /* ١) مسحت بعد الموافقة = مؤكد */
  const after = cause([{ kind:'شيل', name:'حرير سادة سواريه', qty:1, value:350,
                         afterApproval:true }], 350);
  assert(after.beforeApproval === false && after.text.indexOf('أثناء ما الماكينة') < 0,
    'تعديل بعد الموافقة = سبب مؤكد، من غير تحفّظات');

  /* ٢) مسحت **أثناء ما الماكينة شغالة** (بعد الرنين وقبل الموافقة) */
  const during = cause([{ kind:'شيل', name:'حرير سادة سواريه', qty:1, value:350,
                          afterApproval:false }], 350);
  assert(during.beforeApproval === true,
    '🔴 التعديل ده اتعلّم إنه في الفترة الرمادية');
  assert(during.text.indexOf('أثناء ما الماكينة شغالة') > -1,
    '🔴 والنص بيقولها صراحةً — الكاشير مش بالضرورة غلطانة، الماكينة كانت شايلة المبلغ خلاص');

  /* ٣) 🔴 نيجاتيف: قبل الرنين خالص = مش سبب */
  const tr = extractFn(code, 'function _trackEditAfterCard(kind, name, qty, value)');
  assert(tr.indexOf('if(!_cardMoneyAtRiskAt) return;') > -1
      && tr.indexOf('if(!_cardFirstApprovedAt) return;') < 0,
    '🔴 الحارس على الرنين مش على الموافقة — دي كانت هتفوّت الفترة الرمادية كلها');

  /* ٤) الفولباك: كارت يدوي من غير رنين */
  assert(code.indexOf('if(!_cardMoneyAtRiskAt) _cardMoneyAtRiskAt = _leg.approvedAt;') > -1,
    'كارت اتسجل يدوي من غير رنين = الموافقة هي المرجع (مش بنفقد التتبع)');
}

// ============================================================
// ١٣) 🕒 v48 — الوقت بتوقيت القاهرة (قاعدة مثبتة اتكسرت)
// ------------------------------------------------------------
// لقطة المالك: سجل النشاط بيقول ١:٢٦ ظهرًا وفاتورة نفس العملية
// بتقول ٧:٢٦ مساءً — ٦ ساعات فرق. السبب: العرض بتوقيت **الجهاز**
// والمالك بيفتح من بره مصر. كل حسابات الوقت في النظام مثبتة على
// القاهرة، والعرض لازم يتبع نفس القاعدة وإلا قراءة القصة مستحيلة.
// ============================================================
{
  const code = strip(office);
  const fn = extractFn(code, 'function ofWhen(ts, withDate)');
  assert(fn.length > 50, 'دالة ofWhen اتلقت');
  assert(fn.indexOf("timeZone: OF_CAIRO_TZ") > -1
      && code.indexOf("OF_CAIRO_TZ = 'Africa/Cairo'") > -1,
    '🔴 العرض بتوقيت القاهرة صراحةً — مش توقيت الجهاز');

  // 🔴 نيجاتيف حقيقي: شغّل الدالة على وقت معروف تحت توقيت جهاز مختلف
  const ofWhen = new Function("OF_CAIRO_TZ", fn + '\nreturn ofWhen;')('Africa/Cairo');
  const ts = Date.parse('2026-08-13T16:26:54Z');   // = ٧:٢٦:٥٤ م بتوقيت القاهرة
  const out = ofWhen(ts);
  assert(/[٧7]/.test(out) && /[٢2][٦6]/.test(out),
    '🔴 ٧:٢٦ مساءً بتوقيت القاهرة — مهما كان توقيت الجهاز (ده الفرق اللي شافه المالك)');

  /* الشاشات الجديدة كلها بتستعملها */
  const rr = extractFn(code, 'function ofRenderActivity()');
  assert(rr.indexOf('ofWhen(a.ts') > -1 && rr.indexOf("toLocaleString('ar-EG')") < 0,
    'سجل النشاط');
  const rd = extractFn(code, 'function renderRefundsDue()');
  assert(rd.indexOf('ofWhen(x.ts') > -1 && rd.indexOf("new Date(x.ts || 0).toLocaleString") < 0,
    'وقايمة المستحقات');
  const op = code.slice(code.indexOf('window.ofActOpen'), code.indexOf('function startData()'));
  assert(op.indexOf('ofWhen(') > -1 && op.indexOf("toLocaleTimeString('ar-EG')") < 0,
    'وشاشة التفاصيل وقصة السلة');
}
