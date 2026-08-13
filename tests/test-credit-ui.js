// ============================================================
// 💳 test-credit-ui — شاشات الرصيد وكروت الهدايا في POS
//
// 🔑 اللي بيحرسه: إن الشاشة **مبتحسبش فلوس ومبتكتبش رصيد**،
//    وإن الترتيب صح (الكارت مايتفعّلش قبل الدفع، والرصيد
//    مايتخصمش قبل ما الفاتورة تتقفل).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ui   = fs.readFileSync(path.join(ROOT, 'pos', 'credit-ui.js'), 'utf8');
const sale = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'pos', 'index.html'), 'utf8');

function stripComments(s){
  return s
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, ' ')
    .replace(/^[ \t]*\/\/[^\n]*/gm, ' ')
    .replace(/([^:'"\\])\/\/[^\n]*$/gm, '$1 ');
}
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
const bareUI = stripComments(ui);

// ============================================================
// ١) 🔌 الملفات متحمّلة والـSDK موجود
// ============================================================
(function(){
  assert(/firebase-functions-compat\.js/.test(html),
    '⭐⭐ SDK الدوال متحمّل — من غيره كل عملية رصيد بتقع');
  assert(/<script src="credit-core\.js"><\/script>/.test(html), 'credit-core.js متحمّل');
  assert(/<script src="credit-ui\.js"><\/script>/.test(html), 'و credit-ui.js');
  const core = html.indexOf('src="pos-core.js"');
  const cui = html.indexOf('src="credit-ui.js"');
  assert(core > 0 && cui > core, 'وبعد pos-core.js');
  assert(/onclick="sellGiftCard\(\)"/.test(html), '🎁 وزرار بيع الكارت موجود');
})();

// ============================================================
// ٢) ⛔ ⭐⭐ الشاشة مبتكتبش رصيد — كل عملية بتروح للفنكشن
// ============================================================
(function(){
  assert(!/collection\('pos_test_customers'\)/.test(bareUI),
    '⛔⭐⭐ الشاشة مبتلمسش مستند العميلة خالص');
  assert(!/credit:\s*firebase\.firestore\.FieldValue/.test(bareUI),
    '⛔ ومفيش أي كتابة مباشرة للرصيد');
  assert(!/collection\('credit_ledger'\)/.test(bareUI),
    '⛔ ومبتكتبش في الدفتر');
  assert(/httpsCallable/.test(bareUI), '☁️ كل حاجة عن طريق Cloud Functions');
})();

// ============================================================
// ٣) 📴 ⭐⭐ أونلاين إجباري
//    لو الشيك محلي، نفس الرصيد يتصرف في فرعين في نفس اللحظة.
// ============================================================
(function(){
  const f = extractFn(ui, 'async function callCredit(');
  assert(!!f, 'لقينا callCredit');
  if(!f) return;
  assert(/navigator\.onLine/.test(f), '📴 بيتشيك على النت');
  assert(/return null/.test(f), 'وبيوقف العملية لو مفيش نت');
  assert(/مبتشتغلش أوفلاين/.test(f), '⭐ وبيقول للكاشير السبب بوضوح');
  assert(!/localStorage|indexedDB|queue/i.test(f),
    '⛔⭐⭐ ومفيش أي طابور أوفلاين — ده بالظبط اللي بيخلي الرصيد يتصرف مرتين');
})();

// ============================================================
// ٤) 🔁 مفاتيح التكرار مبنية على المحتوى مش عشوائية
//    لو عشوائية، كل ضغطة = مفتاح جديد = العملية تتنفذ تاني.
// ============================================================
(function(){
  const f = extractFn(ui, 'function creditIdem(');
  assert(!!f, 'لقينا creditIdem');
  if(!f) return;
  assert(!/Math\.random/.test(stripComments(f)),
    '⛔⭐⭐ المفتاح مش عشوائي — وإلا إعادة الضغط بتنفّذ العملية تاني');
  ['creditSpend', 'creditAdjust', 'giftCardIssue'].forEach(function(n){
    assert(new RegExp("'" + n + "'[\\s\\S]{0,400}idem").test(ui),
      '🔁 ' + n + ' بتبعت مفتاح تكرار');
  });
  // ⭐ مفتاح الصرف مبني على الفاتورة — نفس الفاتورة = نفس المفتاح
  assert(/creditIdem\('spend', \[invoiceCode, p\.phone, p\.amount\]\)/.test(ui),
    '⭐⭐ ومفتاح الصرف مبني على رقم الفاتورة (إعادة المحاولة آمنة)');
})();

// ============================================================
// ٥) 🔒 ⭐⭐ الكارت مايتفعّلش قبل الدفع
// ============================================================
(function(){
  const f = extractFn(ui, 'async function sellGiftCard(');
  assert(!!f, 'لقينا sellGiftCard');
  if(!f) return;
  assert(!/giftCardActivate/.test(f),
    '🔒⭐⭐ البيع مبيفعّلش الكارت — التفعيل بعد الفاتورة');
  assert(/cart\.push/.test(f) && /isGiftCard: true/.test(f),
    '💵 والكارت بيدخل السلة كسطر بقيمته (العميلة بتدفعه)');
  assert(/price: value/.test(f), 'بقيمة موجبة — مش خصم');

  // ⚡ التفعيل بيتنادى بعد قفل الفاتورة
  assert(/activatePendingGiftCards\(invoiceCode\)/.test(sale),
    '⭐⭐ والتفعيل متنادى فعلًا بعد الفاتورة (مش دالة ميتة)');
  const act = extractFn(ui, 'async function activatePendingGiftCards(');
  assert(!!act && /invoiceCode: invoiceCode/.test(act),
    '⭐ ومربوط برقم الفاتورة');
  assert(!!act && /مااتفعّلش/.test(act),
    '⭐⭐ ولو التفعيل فشل، الكاشير بتعرف (العميلة دفعت وماخدتش حاجة)');
})();

// ============================================================
// ٦) 💸 الصرف — الترتيب والسقف
// ============================================================
(function(){
  const f = extractFn(ui, 'async function useCustomerCredit(');
  assert(!!f, 'لقينا useCustomerCredit');
  if(!f) return;
  assert(/Math\.min\(bal, total\)/.test(f),
    '🛡️⭐⭐ السقف = الأقل من الرصيد والفاتورة (وإلا مرتجع يطلّع كاش)');
  assert(/total > 0/.test(f), 'وفاتورة صفر أو سالبة مبتصرفش');
  assert(/askConfirm/.test(f), 'وفيه تأكيد قبل الخصم');
  assert(!/creditSpend/.test(f),
    '⭐⭐ والخصم الفعلي مش هنا — بعد ما الفاتورة تتقفل');

  const c = extractFn(ui, 'async function commitCreditSpend(');
  assert(!!c && /creditSpend/.test(c), '⭐ التثبيت في دالة لوحدها');
  assert(/commitCreditSpend\(invoiceCode, total\)/.test(sale),
    '⭐⭐ ومتنادية فعلًا بعد الفاتورة');
  assert(!!c && /بلّغ المالك فورًا/.test(c),
    '⭐⭐ ولو الخصم فشل بعد ما الفاتورة اتقفلت، بيصرخ (دي خسارة عليك)');
})();

// ============================================================
// ٧) 💵 "سيبي الباقي" — الفلوس دخلت الدرج فعلًا
// ============================================================
(function(){
  const f = extractFn(ui, 'async function keepChangeAsCredit(');
  assert(!!f, 'لقينا keepChangeAsCredit');
  if(!f) return;
  assert(/source:'change'/.test(f), '💵 معلّمة كـ"باقي" — مسار مباشر بلا موافقة');
  assert(/invoiceCode: invoiceCode/.test(f),
    '⭐⭐ ومربوطة بفاتورة حقيقية — مش أي مبلغ من العدم');
  assert(/amt > 0/.test(f), 'ومبلغ موجب بس');
})();

// ============================================================
// ٨) §18 القاعدة الذهبية — الملفات منفصلة
// ============================================================
(function(){
  ['sellGiftCard','useCustomerCredit','commitCreditSpend',
   'activatePendingGiftCards','keepChangeAsCredit'].forEach(function(n){
    assert(new RegExp('window\\.' + n + ' = ' + n).test(ui),
      '§18 ' + n + ' معروضة على window');
  });
  assert(/Object\.defineProperty\(window, 'pendingCreditSpend'/.test(ui),
    '⭐⭐ و pendingCreditSpend معروضة (let مبتعديش بين الملفات)');
  assert(/window\.custCreditBalance/.test(sale),
    '⭐ ورصيد العميلة على window (بيتقرا من ملف تاني)');
})();

// ============================================================
// ٩) 🧹 التنضيف — الرصيد مبيتسربش لعميلة تانية
// ============================================================
(function(){
  const clears = (sale.match(/window\.custCreditBalance\s*=\s*0/g) || []).length;
  assert(clears >= 2,
    '🧹⭐⭐ الرصيد بيتصفّر لما العميلة تتشال (' + clears + ' مكان)');
  const act = extractFn(ui, 'async function activatePendingGiftCards(');
  assert(!!act && /pendingGiftCards = \[\]/.test(act),
    '🧹 وكروت الفاتورة بتتصفّر بعد التفعيل');
  const c = extractFn(ui, 'async function commitCreditSpend(');
  assert(!!c && /pendingCreditSpend = null/.test(c),
    '🧹 وخصم الرصيد بيتصفّر بعد التثبيت');
})();

// ============================================================
// ١٠) 🖨️ قسيمة الكارت
// ============================================================
(function(){
  const f = extractFn(ui, 'function giftCardSlipHtml(');
  assert(!!f, 'لقينا giftCardSlipHtml');
  if(!f) return;
  assert(/g\.display/.test(f), '🖨️ الكود بيتطبع بشكل مقروء');
  assert(/dir="ltr"/.test(f), 'وباتجاه LTR (الأكواد بتتقلب في السياق العربي)');
  assert(/زي الفلوس/.test(f),
    '⚠️⭐ ومكتوب على القسيمة إن الكود زي الفلوس — أي حد معاه يستخدمه');
  assert(/تطبيقنا/.test(f), 'وفيها إزاي تستخدمه');
})();

// ============================================================
// ١١) 📱 تطبيق العميلة
// ============================================================
(function(){
  const app = fs.readFileSync(path.join(ROOT, 'loyalty', 'index.html'), 'utf8');

  assert(/firebase-functions-compat/.test(app),
    '⭐⭐ SDK الدوال متحمّل — من غيره الاستلام بيقع');
  assert(/firebase\.app\('loyalty'\)\.functions/.test(app),
    '⭐⭐ والنداء على التطبيق المسمّى (§20) مش الافتراضي');

  // 💰 الرصيد بيبان
  assert(/currentCustomer\.credit/.test(app), '💰 الرصيد بيتعرض في الحساب');
  assert(/رصيد النقاط[\s\S]{0,400}💰 رصيدي/.test(app),
    '⭐ ومنفصل عن النقط في العرض (النقط قاعدة والرصيد فلوس)');

  // 🎁 الاستلام
  assert(/function claimGift\(/.test(app), '🎁 دالة الاستلام موجودة');
  assert(/giftCardClaim/.test(app), 'وبتنادي الفنكشن الصح');
  assert(/navigator\.onLine/.test(app), '📴 وبتتشيك على النت');

  // ⚠️ الدالة اللي بننديها لازم تكون **موجودة**
  //    (أول نسخة كانت بتنادي showSheet وهي مش موجودة — الاختبار
  //     النصي كان هيعدّي والزرار يقع صامت على موبايل العميلة)
  ['showSheet', 'closeSheet', 'openClaimGift', 'openCreditStatement',
   'claimGift', 'watchCredit'].forEach(function(n){
    assert(new RegExp('function ' + n + '\\(').test(app),
      '⭐ ' + n + ' متعرّفة فعلًا (مش اسم متنده وخلاص)');
  });
  assert(/id="crOverlay"/.test(app) && /id="crSheet"/.test(app),
    '⭐⭐ والـmarkup بتاع الشيت موجود في الصفحة');

  // ⛔ التطبيق مبيكتبش رصيد
  assert(!/credit:\s*firebase\.firestore\.FieldValue/.test(app),
    '⛔⭐⭐ التطبيق مبيكتبش رصيد خالص');
  assert(!/collection\('credit_ledger'\)[\s\S]{0,80}\.(set|add|update)\(/.test(app),
    '⛔ ومبيكتبش في الدفتر');

  // 🧹 المستمع بيتقفل مع الخروج
  assert(/creditUnsub\(\); creditUnsub=null/.test(app),
    '🧹⭐⭐ مستمع الدفتر بيتقفل مع الخروج (وإلا عميلة تانية تشوف فلوس مش بتاعتها)');
  assert(/_creditRows = \[\]/.test(app), 'والحركات بتتصفّر');
})();

// ============================================================
// ١٢) 💵 زرار "سيبي الباقي في حسابها"
// ============================================================
(function(){
  const f = extractFn(sale, 'function showChangeAfterPrint(');
  assert(!!f, 'لقينا شاشة الباقي');
  if(!f) return;
  assert(/keepChangeBtn/.test(f), '💵 الزرار موجود في شاشة الباقي');
  assert(/ctx && ctx\.phone/.test(f),
    '⭐ وبيظهر بس لما يكون فيه رقم عميلة');
  assert(/ادّيتها كاش/.test(f),
    '⭐ والزرار التاني بيوضح البديل (كاش) — مش مجرد "إغلاق"');
  assert(/_keep\.disabled = true/.test(f),
    '⭐⭐ وبيتقفل بعد الضغط (ضغطتين سريعتين = نداءين)');

  // ⚠️ الرقم بيتبعت كوسيط — الشاشة بتظهر بعد ما السلة تتفضّى
  assert(/_changeCtx\.phone = /.test(sale),
    '⭐⭐ الرقم بيتمسك **قبل** ما السلة تتفضّى');
  const ctxAt = sale.indexOf('_changeCtx.phone = ');
  const showAt = sale.indexOf('showChangeAfterPrint(_pendingChange');
  assert(ctxAt > 0 && showAt > ctxAt, 'والترتيب صح');
  assert(/keepChangeAsCredit\(change, \(ctx && ctx\.invoiceCode\) \|\| '', \(ctx && ctx\.phone\) \|\| ''\)/.test(sale),
    '⭐⭐ والرقم بيتبعت كوسيط (القراءة من الشاشة كانت هترجع فاضي دايمًا)');

  const k = extractFn(ui, 'async function keepChangeAsCredit(');
  assert(!!k && /phoneArg/.test(k), 'والدالة بتقبل الرقم كوسيط');
  assert(/window\._lastInvoiceCode = invoiceCode/.test(sale),
    '⭐ ورقم الفاتورة متاح للشاشة (الحركة لازم تترتبط بفاتورة حقيقية)');
})();

// ============================================================
// ١٣) 🏢 لوحة Office — الموافقات والكروت
// ============================================================
(function(){
  const off = fs.readFileSync(path.join(ROOT, 'Office', 'office.js'), 'utf8');
  const offHtml = fs.readFileSync(path.join(ROOT, 'Office', 'index.html'), 'utf8');

  assert(/id="creditAdminBody"/.test(offHtml), '🏢 اللوحة موجودة في الصفحة');
  assert(/functions-compat/.test(offHtml),
    '⭐⭐ SDK الدوال متحمّل — من غيره الموافقة بتقع');
  assert(/function renderCreditAdmin\(/.test(off), 'والراسم موجود');
  assert(/window\.renderCreditAdmin = renderCreditAdmin/.test(off), '§18 معروضة');

  // ⭐⭐ الموافقة بتنادي الفنكشن — مبتكتبش رصيد
  const ap = extractFn(off, 'async function approveCreditReq(');
  assert(!!ap, 'لقينا approveCreditReq');
  if(ap){
    assert(/httpsCallable\('creditAdjust'\)/.test(ap),
      '⭐⭐ الموافقة بتنادي الفنكشن — Office مبيكتبش رصيد بنفسه');
    assert(!/credit:/.test(ap), '⛔ ومفيش كتابة مباشرة للرصيد');
    assert(/idem: 'req:' \+ id/.test(ap),
      '🔁 ⭐⭐ ومفتاح التكرار من رقم الطلب (موافقة مرتين ≠ فلوس مرتين)');
    assert(/confirm\(/.test(ap), 'وفيه تأكيد');
    assert(/بتتضاف من العدم/.test(ap), '⭐ والتأكيد بيقول إن دي فلوس من العدم');
  }

  // 📕 الدين بيتشرح للمالك
  assert(/لسه عليك/.test(off), '📕 "لسه عليك" بتبان');
  assert(/فلوس قبضتها/.test(off), '⭐ ومكتوب معناها');

  // 💸 الاستعلامات محدودة
  assert(/collection\('credit_ledger'\)\.orderBy\('at','desc'\)\.limit\(50\)/.test(off),
    '💸 ⭐⭐ استعلام الدفتر محدود بـ٥٠ (الدفتر بيكبر بلا حدود)');

  // 👁️ Office بيقرا من النسخة العامة مش من الكروت نفسها
  assert(/gift_cards_public/.test(off),
    '👁️ ⭐⭐ Office بيقرا النسخة العامة — مجموعة الكروت فيها البصمة ومقفولة');
  assert(!/collection\('gift_cards'\)/.test(off),
    '⛔ ومبيلمسش مجموعة الكروت الأصلية');

  // ☁️ والدوال بتكتب النسخة دي فعلًا (وإلا اللوحة تفضل فاضية)
  const fns = fs.readFileSync(path.join(ROOT, 'functions', 'giftCredit.js'), 'utf8');
  assert((fns.match(/gift_cards_public/g) || []).length >= 3,
    '⭐⭐ والدوال بتحدّث النسخة العامة في كل مراحل الكارت (إصدار/تفعيل/استلام)');
})();

// ============================================================
// ١٤) 🔐 قواعد الموافقة — المالك بيقفل الطلب مش بيعدّل المبلغ
// ============================================================
(function(){
  const r = fs.readFileSync(path.join(ROOT, 'security', 'gift-credit.rules'), 'utf8');
  assert(/hasOnly\(\['status', 'decidedAt'\]\)/.test(r),
    '🔐 ⭐⭐ المالك بيغيّر الحالة بس — مينفعش يعدّل المبلغ قبل الموافقة');
  assert(/allow create: if false;\s*\/\/ 🔒 الدوال بس بتنشئ الطلب/.test(r),
    '🔒 والطلبات بتتنشئ من الدوال بس');
  assert(/gift_cards_public/.test(r), '👁️ والنسخة العامة معرّفة في القواعد');
})();

// ============================================================
// ١٢) 🔔 عدّاد طلبات الرصيد
//    طلبات الرصيد فلوس بتتضاف من العدم — لو الطلب فضل مستني
//    ومحدش واخد باله، الكاشير فاكرة إنك شفته وإنت لأ.
// ============================================================
(function(){
  const off = fs.readFileSync(path.join(ROOT, 'Office', 'office.js'), 'utf8');
  const offHtml = fs.readFileSync(path.join(ROOT, 'Office', 'index.html'), 'utf8');

  assert(/id="nbMoney"/.test(offHtml), '🔔 العدّاد موجود على تبويب الفلوس');
  assert(/function ofSyncCreditBadge\(/.test(off), 'ودالة التحديث موجودة');
  assert(/r\.status === 'pending'/.test(off), 'وبتعدّ المستني بس');

  // ⭐⭐ لازم يتحدّث من المستمع مباشرة — مش من دالة الرسم
  //    (الرسم بيرجع بدري لو التبويب مقفول، فالعدّاد ما كانش هيظهر
  //     غير لما تفتح الشاشة — وده بالظبط عكس فايدة العدّاد)
  assert(/try\{ ofSyncCreditBadge\(\); \}catch\(e\)\{\}[\s\S]{0,60}renderCreditAdmin/.test(off),
    '⭐⭐ والعدّاد بيتحدّث من المستمع قبل الرسم (يبان والتبويب مقفول)');
})();

// ============================================================
// ١٣) 🚫 شاشة واحدة بس للرصيد
//    اتبنت نسخة تانية بالغلط في جلسة الشغل. نسختين = شاشة
//    بتتصلّح والتانية بتفضل غلط، والمالك مش عارف بيبص على أنهي.
// ============================================================
(function(){
  const off = fs.readFileSync(path.join(ROOT, 'Office', 'office.js'), 'utf8');
  const offHtml = fs.readFileSync(path.join(ROOT, 'Office', 'index.html'), 'utf8');
  assert(!/function renderGiftCards\(/.test(off),
    '🚫 مفيش شاشة كروت تانية (renderGiftCards اتشالت)');
  assert(!/id="giftBody"/.test(offHtml), 'ومفيش تبويب مكرر');
  assert(!/creditRequestDecide/.test(off),
    '🚫 ⭐ ومفيش نداء لدالة مش موجودة (creditRequestDecide معمرها ما اتكتبت)');
  assertEq((off.match(/function renderCreditAdmin\(/g) || []).length, 1,
    '⭐ شاشة واحدة بالظبط');
})();
