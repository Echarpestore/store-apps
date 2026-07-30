// ============================================================
// 💳💳 الدفع بكارتين — الاختبارات
// اللي الاختبار ده بيقفله للأبد:
//   ١) الكارت التاني ما يتبعتش للماكينة والأول لسه معلّق
//      (Paymob مفيهاش سحب طلب → طلبين على نفس الماكينة = فلوس من غير فاتورة)
//   ٢) كارت اتأكد ما يتعدلش ولا يتلغي من الشاشة (الفلوس اتسحبت فعلًا)
//   ٣) الكارت مفيهوش فكة: المبلغ ما يزيدش عن الباقي (وإلا أوفر في التقفيل)
//   ٤) payments.visa = مجموع الكروت (التقارير والتقفيل بيقروا مفتاح واحد)
//   ٥) الشريحة المرفوضة تتشال فورًا وما تعطّلش الحفظ
//   ٦) الطباعة التلقائية بتشتغل لما آخر كارت يكمّل المبلغ في دفع مختلط
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const POS = path.resolve(__dirname, '..', 'pos');
const saleSrc = fs.readFileSync(path.join(POS, 'pos-sale.js'), 'utf8');
const appSrc  = fs.readFileSync(path.join(POS, 'app.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(POS, 'index.html'), 'utf8');

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
function loadFns(src, names, prelude){
  const sb = { window:{}, Object, Math, Number, JSON, Set, Array, String };
  vm.createContext(sb);
  if(prelude) vm.runInContext(prelude, sb);
  names.forEach(n=>{
    const code = extractFn(src, n);
    assert(code.length > 0, `الدالة ${n} موجودة في المصدر`);
    vm.runInContext(code, sb);
  });
  return sb;
}

const PRELUDE = `
  let _paymobAutoFired = false;
  let cart = [{name:'x', qty:1, price:500}];
  let selectedPayMethods = new Set();
  let paymentAmounts = {};
  let _total = 500;
  function cartTotal(){ return _total; }
`;
const S = loadFns(saleSrc, [
  'cardLegsSum','cardApprovedSum','cardLegsPending','cardLegBySeq','cardOvercharge',
  'cardLegBlockReason','cardAmountReject','nextCardSeq','payBtnId',
  'normalizePayments','paymobAutoSkipReason'
], PRELUDE);

const call = (expr)=> vm.runInContext(expr, S);
const J = (v)=> JSON.stringify(v);

// شرائح جاهزة للاختبارات
const L_NONE      = [];
const L_1_PENDING = [{seq:1, amount:200, status:'pending'}];
const L_1_OK      = [{seq:1, amount:200, status:'approved', txn:{seq:1, amount:200}}];
const L_1_FAILED  = [{seq:1, amount:200, status:'failed'}];
const L_BOTH_OK   = [{seq:1, amount:200, status:'approved'}, {seq:2, amount:300, status:'approved'}];
const L_MIX       = [{seq:1, amount:200, status:'approved'}, {seq:2, amount:300, status:'pending'}];

// ============================================================
// ١) مجاميع الشرائح
// ============================================================
{
  assertEq(call(`cardLegsSum(${J(L_NONE)})`), 0, 'مفيش كروت → المجموع صفر');
  assertEq(call(`cardLegsSum(${J(L_BOTH_OK)})`), 500, 'كارتين 200+300 = 500');
  assertEq(call(`cardLegsSum(${J(L_MIX)})`), 500, 'المعلّق بيتحسب ضمن المدفوع (الحفظ مقفول لحد ما يرد)');
  assertEq(call(`cardLegsSum(${J(L_1_FAILED)})`), 0, 'الشريحة المرفوضة مش بتتحسب');

  assertEq(call(`cardApprovedSum(${J(L_MIX)})`), 200, 'المؤكد بس = 200 (التاني لسه على الماكينة)');
  assertEq(call(`cardApprovedSum(${J(L_BOTH_OK)})`), 500, 'المؤكد = 500 لما الاتنين يتأكدوا');

  // كسور القروش — مصدر فروق التقفيل
  const frac = [{seq:1, amount:33.33, status:'approved'}, {seq:2, amount:66.67, status:'approved'}];
  assertEq(call(`cardApprovedSum(${J(frac)})`), 100, 'كسور القروش بتتجمع صح من غير 99.99999');

  assertEq(call(`cardLegsPending(${J(L_1_PENDING)})`), true, 'فيه شريحة على الماكينة');
  assertEq(call(`cardLegsPending(${J(L_BOTH_OK)})`), false, 'مفيش شريحة معلّقة');
  assertEq(call(`cardLegBySeq(${J(L_BOTH_OK)}, 2).amount`), 300, 'الوصول للشريحة برقمها');
  assertEq(call(`cardLegBySeq(${J(L_1_OK)}, 2)`), null, 'شريحة مش موجودة → null');
}

// ============================================================
// ٢) 🔒 قواعد فتح الشريحة — أهم حاجة في الميزة كلها
// ============================================================
{
  // ⛔ القاعدة الحرجة: Paymob مفيهاش سحب طلب من الماكينة
  const b1 = call(`cardLegBlockReason(${J(L_1_PENDING)}, 2, false, 2)`);
  assert(typeof b1 === 'string' && b1.length > 0, 'ممنوع كارت تاني والأول لسه على الماكينة');
  const b1b = call(`cardLegBlockReason(${J(L_1_PENDING)}, 1, false, 2)`);
  assert(typeof b1b === 'string', 'ممنوع حتى إعادة نفس الشريحة وهي معلّقة');

  // ⛔ كارت اتسحب فعلًا مايتعدلش
  const b2 = call(`cardLegBlockReason(${J(L_1_OK)}, 1, false, 2)`);
  assert(typeof b2 === 'string' && b2.indexOf('200.00') >= 0, 'الكارت المتأكد مقفول والرسالة فيها المبلغ');

  // ✅ الكارت التاني مسموح بعد ما الأول يتأكد
  assertEq(call(`cardLegBlockReason(${J(L_1_OK)}, 2, false, 2)`), null, 'الكارت التاني مفتوح بعد تأكيد الأول');

  // ⛔ الترتيب إجباري
  const b3 = call(`cardLegBlockReason(${J(L_NONE)}, 2, false, 2)`);
  assert(typeof b3 === 'string', 'ممنوع تبدأ بالكارت التاني');

  // ⛔ سقف الكروت (قرار المالك: كارتين)
  const b4 = call(`cardLegBlockReason(${J(L_BOTH_OK)}, 3, false, 2)`);
  assert(typeof b4 === 'string' && b4.indexOf('2') >= 0, 'أقصى عدد كروت 2');

  // ⛔ المرتجع بكارت واحد بس
  const b5 = call(`cardLegBlockReason(${J(L_1_OK)}, 2, true, 2)`);
  assert(typeof b5 === 'string', 'المرتجع مايتقسمش على كارتين');

  // ✅ أول كارت في فاتورة جديدة
  assertEq(call(`cardLegBlockReason(${J(L_NONE)}, 1, false, 2)`), null, 'أول كارت مفتوح دايمًا');
  // ✅ إعادة المحاولة بعد رفض
  assertEq(call(`cardLegBlockReason(${J(L_1_FAILED)}, 1, false, 2)`), null, 'بعد الرفض المحاولة تتعاد فورًا');
}

// ============================================================
// ٣) 💳 الكارت مفيهوش فكة — السقف الصارم
// ============================================================
{
  assertEq(call(`cardAmountReject(200, 500)`), null, 'مبلغ أقل من الباقي مقبول');
  assertEq(call(`cardAmountReject(500, 500)`), null, 'المبلغ = الباقي بالظبط مقبول');
  const r = call(`cardAmountReject(600, 500)`);
  assert(typeof r === 'string' && r.indexOf('500.00') >= 0, 'زيادة عن الباقي مرفوضة والرسالة فيها السقف');
  assert(typeof call(`cardAmountReject(0, 500)`) === 'string', 'صفر مرفوض');
  assert(typeof call(`cardAmountReject(-50, 500)`) === 'string', 'سالب مرفوض');
  assertEq(call(`cardAmountReject(500.004, 500)`), null, 'سماح القرش الواحد (تقريب) مش بيرفض');

  // 🔴 اختبار سلبي: من غير السقف ده، الكارتين ممكن يعدّوا الفاتورة
  const over = [{seq:1, amount:200, status:'approved'}, {seq:2, amount:400, status:'approved'}];
  assert(call(`cardOvercharge(${J(over)}, 500)`) === 100,
    'من غير السقف: 200+400 على فاتورة 500 = 100 ج.م أوفر (الباج اللي السقف بيمنعه)');
}

// ============================================================
// ٤) ⚠️ السحب الزايد (السلة اتعدّلت بعد ما الكارت اتسحب)
// ============================================================
{
  assertEq(call(`cardOvercharge(${J(L_BOTH_OK)}, 500)`), 0, 'مطابق للفاتورة → مفيش زيادة');
  assertEq(call(`cardOvercharge(${J(L_BOTH_OK)}, 450)`), 50, 'الفاتورة نزلت لـ450 → زيادة 50');
  assertEq(call(`cardOvercharge(${J(L_MIX)}, 500)`), 0, 'المعلّق مش بيتحسب سحب (لسه ما اتسحبش)');
  assertEq(call(`cardOvercharge(${J(L_BOTH_OK)}, 600)`), 0, 'الفاتورة أكبر → مفيش زيادة (فيه ناقص عادي)');
  // مرتجع (إجمالي سالب) — المقارنة بالقيمة المطلقة
  const ref = [{seq:1, amount:-100, status:'approved'}];
  assertEq(call(`cardOvercharge(${J(ref)}, -100)`), 0, 'مرتجع مطابق → مفيش زيادة');
}

// ============================================================
// ٥) 🔢 توجيه زرار «فيزا» (و F3) لأول كارت متاح
// ============================================================
{
  assertEq(call(`nextCardSeq(${J(L_NONE)}, 2)`), 1, 'فاتورة جديدة → كارت 1');
  assertEq(call(`nextCardSeq(${J(L_1_OK)}, 2)`), 2, 'الأول اتأكد → F3 يفتح كارت 2 لوحده');
  assertEq(call(`nextCardSeq(${J(L_1_FAILED)}, 2)`), 1, 'الأول اترفض → يرجع لكارت 1');
  assertEq(call(`nextCardSeq(${J(L_BOTH_OK)}, 2)`), 0, 'الكارتين خلصوا → مفيش شريحة متاحة');
}

// ============================================================
// ٦) 🖲️ زرار كل طريقة دفع (كان فيه باج: salary بيلوّن الانستا باي)
// ============================================================
{
  assertEq(call(`payBtnId('cash', 0)`), 'pmCash', 'الكاش → pmCash');
  assertEq(call(`payBtnId('visa', 1)`), 'pmVisa', 'كارت 1 → pmVisa');
  assertEq(call(`payBtnId('visa', 2)`), 'pmVisa2', 'كارت 2 → pmVisa2');
  assertEq(call(`payBtnId('instapay', 0)`), 'pmInsta', 'الانستا باي → pmInsta');
  assertEq(call(`payBtnId('salary', 0)`), 'pmSalary', 'خصم الراتب → pmSalary (كان بيلوّن pmInsta غلط)');
}

// ============================================================
// ٧) 💰 التقارير والتقفيل: مفتاح واحد للفيزا = مجموع الكروت
// ============================================================
{
  // فاتورة 500 على كارتين — المحفوظ لازم يبقى visa:500 مفتاح واحد
  const paymentsEntered = { visa: call(`cardLegsSum(${J(L_BOTH_OK)})`) };
  const r = call(`normalizePayments(${J(paymentsEntered)}, 500)`);
  assertEq(r.applied.visa, 500, 'مجموع الكارتين بيتسجل في payments.visa');
  assertEq(Object.keys(r.applied).length, 1, 'مفيش مفتاح visa2 في الفاتورة (التقارير ما تتلمسش)');
  assertEq(r.changeGiven, 0, 'مفيش فكة في دفع بالكروت');

  // دفع مختلط: كاش + انستا + كارتين، والكاش فيه فكة
  const mixed = { cash: 150, instapay: 100, visa: 300 };   // فاتورة 500، استلم كاش 150
  const r2 = call(`normalizePayments(${J(mixed)}, 500)`);
  assertEq(r2.changeGiven, 50, 'الفكة 50 اتحسبت من الكاش');
  assertEq(r2.applied.cash, 100, 'الكاش المسجّل بعد الفكة');
  assertEq(r2.applied.visa, 300, 'مجموع الكروت متتلمسش بالفكة');
  const sum = Object.values(r2.applied).reduce((n,v)=>n+v,0);
  assertEq(sum, 500, 'مجموع المدفوعات المسجلة = إجمالي الفاتورة');
}

// ============================================================
// ٨) ⚡ بوابة الطباعة التلقائية مع الكروت المتعددة
// ============================================================
{
  const setState = (total, pays, methods)=> vm.runInContext(
    `_total = ${total}; _paymobAutoFired = false;`
    + `paymentAmounts = ${J(pays)}; selectedPayMethods = new Set(${J(methods)});`, S);

  // الكارت الأول اتأكد بـ200 من فاتورة 500 → ممنوع الطباعة (لسه ناقص)
  setState(500, { visa: 200 }, ['visa']);
  let why = call(`paymobAutoSkipReason(200, { amountCents: 20000 })`);
  assert(typeof why === 'string' && why.indexOf('ناقصة') >= 0,
    'كارت 1 لوحده ما بيطبعش — المدفوعات لسه ناقصة');

  // الكارت التاني كمّل الباقي → الطباعة التلقائية تشتغل
  setState(500, { visa: 500 }, ['visa']);
  assertEq(call(`paymobAutoSkipReason(300, { amountCents: 30000 })`), null,
    'آخر كارت كمّل المبلغ → يحفظ ويطبع لوحده');

  // دفع مختلط: كاش 100 + انستا 100 + كارت 1 (150) + كارت 2 (150)
  setState(500, { cash: 100, instapay: 100, visa: 300 }, ['cash','instapay','visa']);
  assertEq(call(`paymobAutoSkipReason(150, { amountCents: 15000 })`), null,
    'كاش + انستا + كارتين: آخر تأكيد يطبع لوحده');

  // 🔴 اختبار سلبي: المبلغ اللي رد من الماكينة مش مطابق للمبعوت → ممنوع الطباعة
  setState(500, { visa: 500 }, ['visa']);
  why = call(`paymobAutoSkipReason(300, { amountCents: 25000 })`);
  assert(typeof why === 'string' && why.indexOf('مطابق') >= 0,
    'مبلغ مختلف من الماكينة → ما بيطبعش (حارس التطابق شغال)');

  // 🔴 اختبار سلبي: السلة فضيت قبل ما التأكيد يوصل
  vm.runInContext(`cart = []; _total = 500; _paymobAutoFired = false; paymentAmounts = {visa:500}; selectedPayMethods = new Set(['visa']);`, S);
  why = call(`paymobAutoSkipReason(500, { amountCents: 50000 })`);
  assert(typeof why === 'string' && why.indexOf('السلة') >= 0, 'سلة فاضية → ممنوع الطباعة');
  vm.runInContext(`cart = [{name:'x', qty:1, price:500}];`, S);

  // 🔴 اختبار سلبي: منع التكرار
  vm.runInContext(`_paymobAutoFired = true; _total = 500; paymentAmounts = {visa:500};`, S);
  why = call(`paymobAutoSkipReason(500, { amountCents: 50000 })`);
  assert(typeof why === 'string', 'الطباعة التلقائية بتتنفذ مرة واحدة بس لكل فاتورة');
}

// ============================================================
// ٩) 🔌 التوصيل الفعلي في المصدر — القاعدة الذهبية والزراير
// ============================================================
{
  // القاعدة الذهبية: الدوال متعرّضة على window
  ['cardLegsSum','cardApprovedSum','cardLegsPending','cardLegBySeq','cardOvercharge',
   'cardLegBlockReason','cardAmountReject','nextCardSeq','payBtnId','syncCardPayment',
   'paymobResetActive'].forEach(function(n){
    assert(saleSrc.indexOf('window.' + n + ' = ' + n) >= 0, `${n} متعرّضة على window (القاعدة الذهبية)`);
  });

  // الزرار التاني موجود في الواجهة وموصّل
  assert(htmlSrc.indexOf('id="pmVisa2"') >= 0, 'زرار «فيزا 2» موجود في index.html');
  assert(htmlSrc.indexOf("togglePayMethod('visa2')") >= 0, 'زرار «فيزا 2» موصّل بالدالة');
  assert(htmlSrc.indexOf('.pm-done') >= 0, 'حالة «اتسحب» (صح أخضر) متعرّفة في الـCSS');
  assert(htmlSrc.indexOf('.pm-locked') >= 0, 'حالة «مقفول» متعرّفة في الـCSS');

  // الفاتورة بتتحفظ بكل الكروت
  assert(saleSrc.indexOf('cardTxns:') >= 0, 'الفاتورة بتحفظ cardTxns للمرتجع');
  // الطلب للماكينة بيقفل الشريحة السابقة بس (مش تصفير كامل — كان بيمسح تأكيد الأول)
  assert(saleSrc.indexOf('paymobResetActive();\n  paymobShow') >= 0
      || /paymobResetActive\(\);[\s\S]{0,120}بنبعت المبلغ للماكينة/.test(saleSrc),
    'إرسال الكارت التاني بيقفل المتابعة بس — تأكيد الكارت الأول بيفضل');
  // الفاتورة المطبوعة بتعرف الكروت المتعددة
  assert(appSrc.indexOf('d.cardTxns') >= 0, 'الفاتورة المطبوعة بتطبع كل الكروت');
  assert(appSrc.indexOf('window.paymobCardTxns') >= 0, 'بيانات الكروت بتوصل للفاتورة');
  // حارس السحب الزايد موصّل في مسار الحفظ
  assert(saleSrc.indexOf('cardOvercharge(cardLegs, cartTotal())') >= 0,
    'حارس السحب الزايد بيتنادى قبل الحفظ فعلًا');
}

// ============================================================
// ١٠) 🔁 محاكاة المسار الحقيقي: فاتورة 500 على كارتين
// (togglePayMethod + confirmPayAmount + syncCardPayment مع DOM وهمي)
// ============================================================
{
  const els = {};
  function el(id){
    if(!els[id]) els[id] = {
      id: id, value:'', textContent:'', innerHTML:'', title:'', style:{}, dataset:{},
      _cls: {},
      classList:{
        add(){ Array.prototype.forEach.call(arguments, c=> els[id]._cls[c] = true); },
        remove(){ Array.prototype.forEach.call(arguments, c=> delete els[id]._cls[c]); },
        toggle(c, on){ if(on) els[id]._cls[c] = true; else delete els[id]._cls[c]; },
        contains(c){ return !!els[id]._cls[c]; }
      },
      focus(){}, select(){}, remove(){}
    };
    return els[id];
  }
  const SIM_PRELUDE = `
    const MAX_CARD_LEGS = 2;
    let cardLegs = [];
    let paymentAmounts = {};
    let selectedPayMethods = new Set();
    let pendingPayMethod = null;
    let pendingCardSeq = 0;
    let staffPurchase = null;
    let paymobApproved = false, paymobPending = null, _paymobAutoFired = false, paymobCardInfo = null;
    let _total = 500;
    let toasts = [], sent = [];
    function cartTotal(){ return _total; }
    function showToast(m){ toasts.push(m); }
    function updatePaySummary(){}
    function updatePayAmountChangeLive(){}
    function sendToPaymobTerminal(a, s){ sent.push([a, s]); }
    function paymobAutoPrint(){ return true; }
    function paymobCanAutoFinish(){ return false; }
    function paymobShow(){}
    function confirmPayment(){}
    function setTimeout(f){ return 0; }
  `;
  const SIM = loadFns(saleSrc, [
    'cardLegsSum','cardApprovedSum','cardLegsPending','cardLegBySeq','cardOvercharge',
    'cardLegBlockReason','cardAmountReject','nextCardSeq','payBtnId','syncCardPayment',
    'togglePayMethod','confirmPayAmount'
  ], SIM_PRELUDE);
  SIM.document = { getElementById: el, querySelector: ()=> null, createElement: ()=> el('tmp') };
  const run = (e)=> vm.runInContext(e, SIM);
  const get = (e)=> vm.runInContext(e, SIM);

  // 1️⃣ الكارت الأول: المقترح = الفاتورة كاملة وقابل للتعديل
  run(`togglePayMethod('visa')`);
  assertEq(el('payAmountInput').value, '500.00', 'كارت 1: المقترح = الفاتورة كاملة');
  assertEq(get('pendingCardSeq'), 1, 'الشريحة المفتوحة = 1');
  assert(el('payAmountTitle').textContent.indexOf('كارت 1') >= 0, 'العنوان بيقول «كارت 1»');

  // 2️⃣ الكاشير عدّل لـ200 → اتسجل واتبعت للماكينة
  el('payAmountInput').value = '200';
  run(`confirmPayAmount()`);
  assertEq(get('cardLegs.length'), 1, 'شريحة واحدة اتسجلت');
  assertEq(get('cardLegs[0].amount'), 200, 'المبلغ المعدّل هو اللي اتسجل (مش المقترح)');
  assertEq(get('paymentAmounts.visa'), 200, 'payments.visa = 200');
  assertEq(get(`JSON.stringify(sent[0])`), '[200,1]', 'اتبعت 200 للماكينة على الشريحة 1');
  assertEq(get(`selectedPayMethods.has('visa')`), true, 'الفيزا اتسجلت كطريقة دفع');

  // 3️⃣ الكارت التاني ممنوع والأول لسه على الماكينة
  run(`cardLegs[0].status = 'pending';`);
  const t0 = get('toasts.length');
  run(`togglePayMethod('visa2')`);
  assertEq(get('cardLegs.length'), 1, '⛔ ما اتفتحتش شريحة تانية والأول معلّق');
  assert(get('toasts.length') > t0, 'ظهرت رسالة منع للكاشير');

  // 4️⃣ الأول اتأكد → «فيزا» بيروح للتاني لوحده والمقترح = الباقي
  run(`cardLegs[0].status = 'approved';`);
  run(`togglePayMethod('visa')`);
  assertEq(get('pendingCardSeq'), 2, 'بعد التأكيد الزرار بيفتح الكارت التاني');
  assertEq(el('payAmountInput').value, '300.00', 'كارت 2: المقترح = الباقي (300)');
  assert(el('payAmountTitle').textContent.indexOf('باقي 300.00') >= 0, 'العنوان بيوضّح الباقي');

  // 5️⃣ مبلغ أكبر من الباقي → مرفوض (الكارت مفيهوش فكة)
  el('payAmountInput').value = '400';
  const t1 = get('toasts.length');
  run(`confirmPayAmount()`);
  assertEq(get('cardLegs.length'), 1, '⛔ 400 على باقي 300 اترفض — مفيش شريحة جديدة');
  assert(get('toasts.length') > t1, 'رسالة رفض ظهرت');
  assertEq(get('paymentAmounts.visa'), 200, 'المدفوعات ما اتغيرتش بعد الرفض');

  // 6️⃣ 300 → الفاتورة اكتملت ومفتاح الفيزا بقى المجموع
  el('payAmountInput').value = '300';
  run(`confirmPayAmount()`);
  assertEq(get('cardLegs.length'), 2, 'الشريحة التانية اتسجلت');
  assertEq(get('paymentAmounts.visa'), 500, '💰 payments.visa = مجموع الكارتين (200+300)');
  assertEq(get(`Object.keys(paymentAmounts).length`), 1, 'مفيش مفتاح visa2 — التقارير والتقفيل ما اتلمسوش');
  assertEq(get(`JSON.stringify(sent[1])`), '[300,2]', 'اتبعت 300 للماكينة على الشريحة 2');

  // 7️⃣ محاولة كارت تالت → ممنوعة
  run(`cardLegs[1].status = 'approved';`);
  const t2 = get('toasts.length');
  run(`togglePayMethod('visa')`);
  assertEq(get('cardLegs.length'), 2, '⛔ مفيش كارت تالت');
  assert(get('toasts.length') > t2, 'رسالة «الكارتين اتسحبوا» ظهرت');

  // 8️⃣ كارت اتأكد ما يتعدلش
  const t3 = get('toasts.length');
  run(`togglePayMethod('visa2')`);
  assert(get('toasts.length') > t3, '⛔ الكارت المتأكد مقفول — مفيش تعديل');
  assertEq(get('cardLegs[1].amount'), 300, 'مبلغ الكارت المتأكد ما اتغيرش');

  // 9️⃣ الشريحة المرفوضة بتتشال من المدفوعات
  run(`cardLegs[1].status = 'failed'; cardLegs = cardLegs.filter(function(l){ return l.status !== 'failed'; }); syncCardPayment();`);
  assertEq(get('paymentAmounts.visa'), 200, 'بعد الرفض المجموع رجع 200');
  assertEq(get('cardLegsPending(cardLegs)'), false, 'مفيش معلّق يقفل زرار الحفظ');

  // 🔟 دفع مختلط: كاش + انستا + الكارتين
  run(`cardLegs = []; paymentAmounts = {}; selectedPayMethods = new Set(); _total = 500; sent = [];`);
  el('payAmountInput').value = '100'; run(`togglePayMethod('cash')`);
  el('payAmountInput').value = '100'; run(`confirmPayAmount()`);
  el('payAmountInput').value = '100'; run(`togglePayMethod('instapay')`);
  el('payAmountInput').value = '100'; run(`confirmPayAmount()`);
  run(`togglePayMethod('visa')`);
  assertEq(el('payAmountInput').value, '300.00', 'مختلط: كارت 1 بيقترح الباقي بعد الكاش والانستا');
  el('payAmountInput').value = '150'; run(`confirmPayAmount()`);
  run(`cardLegs[0].status = 'approved';`);
  run(`togglePayMethod('visa')`);
  assertEq(el('payAmountInput').value, '150.00', 'مختلط: كارت 2 بيقترح الـ150 الباقية');
  el('payAmountInput').value = '150'; run(`confirmPayAmount()`);
  const paid = get(`Object.keys(paymentAmounts).reduce(function(s,m){ return s + paymentAmounts[m]; }, 0)`);
  assertEq(paid, 500, '💰 مختلط: 100 كاش + 100 انستا + 150 + 150 = 500 بالظبط');
  assertEq(get('paymentAmounts.visa'), 300, 'مجموع الكارتين في مفتاح واحد');
}
