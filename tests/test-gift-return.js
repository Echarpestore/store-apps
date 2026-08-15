// ============================================================
// 🧪 test-gift-return.js — مرتجع كارت الهدية
// ------------------------------------------------------------
// 🔴 الباج اللي المالك شافه بنفسه:
//    مرتجع سطر الكارت كان بيرجّع الفلوس كاش **والكارت القديم يفضل
//    شغّال بقيمته**. يعني نفس المبلغ طلع مرتين: كاش للعميلة، ورصيد
//    في إيد أي حد معاه الكود. ولو الكود اتصرف خلاص، الخسارة مضاعفة.
//
// ⚠️ الكارت **مش بضاعة**: قيمته دين علينا لحد ما يتصرف، وإلغاؤه
//    لازم يحصل على السيرفر (الدوال بس بتكتب في `gift_cards`).
//    لحد ما دالة الإلغاء تتنشر، المسار مقفول — المنع أرخص من فلوس
//    بتطلع مرتين.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'pos', 'pos-sale.js'), 'utf8');
const UI = fs.readFileSync(path.join(__dirname, '..', 'pos', 'credit-ui.js'), 'utf8');

(function(){
  const i = SRC.indexOf('const availableToReturn');
  assert(i > 0, 'mustExtract: مسار المرتجع اتلقى');
  const before = SRC.slice(Math.max(0, i - 1600), i);

  assert(/it\.isGiftCard \|\| it\.giftCardId/.test(before),
    '⭐⭐ سطر كارت الهدية بيتمسك في مسار المرتجع');
  assert(/كارت هدية/.test(before),
    '⭐ وبالاسم كمان — الفواتير القديمة ممكن تكون من غير `isGiftCard`');
  assert(/showToast\('⛔ كارت الهدية مايترجعش من هنا/.test(before),
    '⭐⭐ والكاشير بتعرف السبب مش بس «مانفعش»');
  assert(/return;/.test(before.slice(before.indexOf('كارت الهدية مايترجعش'))),
    '⭐⭐ والخروج **قبل** أي حساب مرتجع — مفيش سطر بيتضاف للسلة');

  // ⭐ الفحص لازم يبقى قبل حساب المبلغ المرتجع
  assert(before.indexOf('isGiftCard') < before.length,
    'الفحص جوه الشريحة اللي قبل الحساب');
  assert(!/refundEach[\s\S]*isGiftCard/.test(before),
    '⭐⭐ الفحص قبل `refundEach` — بعده يبقى الفلوس اتحسبت خلاص');

  assert(/gift_card_return_blocked/.test(before),
    '⭐ والمحاولة بتتسجّل — عشان نعرف الحالة دي بتحصل قد إيه');
})();

/* ============================================================
   🔒 والكارت بيتفعّل بعد الدفع مش قبله (سليم — بنتأكد إنه فضل كده)
   ============================================================ */
(function(){
  assert(/async function activatePendingGiftCards\(invoiceCode\)/.test(UI),
    'التفعيل بعد قفل الفاتورة');
  assert(/الكارت بيتصدر \*\*مقفول\*\* دلوقتي/.test(UI),
    '⭐ الكارت بيتصدر مقفول — لو اتفعّل قبل الدفع والعميلة مشيت، فلوس من العدم');
  assert(/isGiftCard: true, giftCardId: r\.cardId/.test(UI),
    '⭐⭐ السطر متعلّم — ده اللي حارس المرتجع بيعتمد عليه');
})();

/* ============================================================
   💳🔴 Glow مكانش بيحمّل SDK الدوال أصلًا
   ------------------------------------------------------------
   الخطأ اللي ظهر قدام العميلة: «functions is not a function»
   وهي شايلة كارت هدية مدفوع. السبب: `glow/index.html` بينادي
   `firebase.app('glow').functions(...)` والـSDK مش متحمّل.
   تطبيق الولاء بيحمّله من زمان — نسخة Glow اتعملت بنسخ ولصق
   والسطر ده وقع، ومحدش لاحظ لأن الشات والنقط شغالين من غيره.
   ⚠️ ودلوقتي بقى محتاج كمان للأوردرات (`onlineOrderPlace`).
   ============================================================ */
(function(){
  const fsx = require('fs'), px = require('path');
  const R = px.join(__dirname, '..');
  [['loyalty'], ['glow']].forEach(function(a){
    const src = fsx.readFileSync(px.join(R, a[0], 'index.html'), 'utf8');
    assert(/firebase-functions-compat\.js/.test(src),
      '⭐⭐ ' + a[0] + ': SDK الدوال متحمّل (من غيره الكارت والأوردر بيقعوا)');
    if(/httpsCallable/.test(src)){
      assert(src.indexOf('firebase-functions-compat') < src.indexOf('httpsCallable'),
        '⭐ ' + a[0] + ': الـSDK بيتحمّل **قبل** أول نداء');
    }
  });
  const gsw = fsx.readFileSync(px.join(R, 'glow', 'sw.js'), 'utf8');
  const m = gsw.match(/glow-loyalty-v(\d+)/);
  assert(m && Number(m[1]) >= 47, '⭐ Glow: CACHE_NAME اترفع لـv47+');
})();

/* ============================================================
   🎁 استلام الكارت من الكاشير + عدم قص اللوحة
   ------------------------------------------------------------
   🔴 فجوتين المالك وقع فيهم بنفسه:
     ١) مسح كود الكارت في شريط البحث → «لا يوجد صنف بهذا الكود».
        الكارت بيتباع من POS والاستلام كان في التطبيق بس — يعني
        البرنامج بيبيع حاجة مالهاش مسار فيه.
     ٢) محاولة تصغير اللوحة حطّت `overflow:hidden` + سقف ارتفاع،
        فقصّت مجموعة «الإدارة» — والقص أوحش من السكرول: السكرول
        بيوصلك، والقص بيخفي من غير أي طريقة توصل.
   ============================================================ */
(function(){
  const fsy = require('fs'), py = require('path');
  const R = py.join(__dirname, '..');
  const SALE = fsy.readFileSync(py.join(R, 'pos', 'pos-sale.js'), 'utf8');
  const CU = fsy.readFileSync(py.join(R, 'pos', 'credit-ui.js'), 'utf8');
  const HTML = fsy.readFileSync(py.join(R, 'pos', 'index.html'), 'utf8');

  // 🎁 المسار من شريط البحث
  assert(/\}else if\(\/\^GC\/i\.test\(code\)\)\{/.test(SALE),
    '⭐⭐ كود الكارت له مسار في شريط البحث (كان بيقول «مفيش منتج»)');
  assert(/اكتبي رقم العميلة الأول عشان الرصيد يروح لحسابها/.test(SALE),
    '⭐⭐ ومن غير رقم عميلة بيقول السبب — الرصيد بيروح لحساب مش لفاتورة');
  assert(SALE.indexOf("/^GC/i") < SALE.indexOf("/^FT/i"),
    '⭐ الفحص قبل فرع «لا يوجد صنف» (وإلا مايوصلوش أصلًا)');

  assert(/async function claimGiftForCustomer\(code\)/.test(CU), 'دالة الاستلام موجودة');
  assert(/window\.claimGiftForCustomer = claimGiftForCustomer/.test(CU),
    '⭐ القاعدة الذهبية: على window (بتتنادى من pos-sale)');
  assert(/callCredit\('giftCardClaim'/.test(CU),
    '⭐⭐ الاستلام عن طريق الدالة السحابية — POS عمره ما بيكتب رصيد');
  assert(/creditIdem\('claim', \[clean, phone\]\)/.test(CU),
    '⭐⭐ مفتاح تكرار — دوستين على الماسح مايضفوش الرصيد مرتين');
  assert(/refreshCustomerInfo/.test(CU),
    '⭐ الرصيد بيتحدّث فورًا عشان تقدر تصرف منه في نفس الفاتورة');

  // 🖥️ اللوحة: تصغير من غير قص
  assert(!/\.qb-main\{[^}]*overflow:hidden/.test(HTML),
    '⭐⭐ مفيش `overflow:hidden` على اللوحة — كان بيقص «الإدارة»');
  assert(!/\.qb-main\{[^}]*max-height/.test(HTML),
    '⭐⭐ ولا سقف ارتفاع — القص بيخفي من غير طريقة توصل');
  assert(/\.qb-icon\{ font-size:clamp/.test(HTML),
    '⭐ التصغير بالنسبة للشاشة (clamp) — الشاشة الكبيرة متستحملش تصغير ثابت');
})();
