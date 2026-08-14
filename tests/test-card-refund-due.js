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
  assert(posSw.indexOf('store-apps-shell-v295') > -1, 'POS → v295');
  assert(ofSw.indexOf('echarpe-office-v45') > -1, 'Office → v45');
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
  assert(code.indexOf("b.dataset.page === 'odd' && !_ofActRaw.length") > -1,
    'والتحميل بفتح التبويب مرة واحدة — مش مستمع شغال طول الوقت');

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
