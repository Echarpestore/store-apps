// ============================================================
// 💳 test-credit-core — رصيد العميلة وكروت الهدايا
//
// 🔑 القاعدة: **الرصيد فلوس مش نقط.** أي ثغرة هنا = طبع عملة.
//    فالاختبارات مركّزة على أبواب الفلوس:
//      · التكرار · الصرف الزيادة · التخمين · المحاسبة المزدوجة
// ============================================================
'use strict';
const path = require('path');
const C = require(path.resolve(__dirname, '..', 'pos', 'credit-core.js'));

// ============================================================
// ١) 🔤 تطبيع الكود — العميلة بتكتبه بإيدها وبتغلط
// ============================================================
(function(){
  const target = '2A4B9K7M';
  assertEq(C.giftCardNormalize('gc 2a4b-9k7m'), target, 'مسافات وشرطات وحروف صغيرة');
  assertEq(C.giftCardNormalize('GC-2A4B-9K7M'), target, 'وشكل العرض الكامل');
  assertEq(C.giftCardNormalize('  2A4B9K7M  '), target, 'ومسافات على الأطراف');
  // ⭐ المتشابهين — دي مش رفاهية، دي فرق بين كارت شغّال وعميلة زعلانة
  assertEq(C.giftCardNormalize('2A4BOK7M'.replace('O','O')), '2A4B0K7M',
    '⭐ O بتتحوّل 0');
  assertEq(C.giftCardNormalize('2A4B9KIM'), '2A4B9K1M', '⭐ و I بتتحوّل 1');
  assertEq(C.giftCardNormalize('2A4B9KLM'), '2A4B9K1M', 'و L كمان');
  assertEq(C.giftCardNormalize(''), '', 'وفاضي مبيكسرش');
  assertEq(C.giftCardNormalize(null), '', 'و null كمان');
})();

// ============================================================
// ٢) 🎲 التوليد — عشوائي مش متسلسل (الكود هو الفلوس)
// ============================================================
(function(){
  let i = 12345;
  const rnd = () => { i = (i * 9301 + 49297) % 233280; return i / 233280; };
  const a = C.giftCardGenerate(rnd);
  const b = C.giftCardGenerate(rnd);
  assertEq(a.length, 16, 'الكود ١٦ حرف (مساحة كبيرة قوي)');
  assert(a !== b, 'وكل كود مختلف عن اللي قبله');

  // ⭐⭐ مفيش حروف متشابهة في الأبجدية أصلًا
  assert(!/[O1IL]/.test(C.GC_ALPHABET),
    '⭐⭐ الأبجدية مفيهاش 0/O/1/I/L — مصدر الغلط اتشال من أصله');

  // 🔒 مساحة التخمين
  const space = Math.pow(C.GC_ALPHABET.length, 16);
  assert(space > 1e23, '🔒 مساحة الأكواد أكبر من ١٠²³ — التخمين مستحيل عمليًا');

  // 🔴 نيجاتيف — الكود المتسلسل كان هيبقى كارثة
  const seqA = 'GC1001', seqB = 'GC1002';
  assert(Number(seqB.slice(2)) - Number(seqA.slice(2)) === 1,
    '🔴 نيجاتيف — لو الأكواد متسلسلة، اللي معاه واحد يعرف اللي بعده');
})();

// ============================================================
// ٣) 🧮 الرصيد من الدفتر — والتكرار
// ============================================================
(function(){
  assertEq(C.creditBalance([{amount:500,idem:'a'},{amount:-200,idem:'b'}]), 300,
    'المجموع صح');
  // ⭐⭐ الشبكة قطعت والكاشير دوس تاني
  assertEq(C.creditBalance([{amount:500,idem:'a'},{amount:500,idem:'a'}]), 500,
    '⭐⭐ نفس المفتاح مرتين = مرة واحدة (الكاشير دوس تاني)');
  assertEq(C.creditBalance([{amount:500,idem:'a',void:true},{amount:200,idem:'b'}]), 200,
    'والحركة الملغية مش داخلة');
  assertEq(C.creditBalance([]), 0, 'ودفتر فاضي = صفر');
  assertEq(C.creditBalance(null), 0, 'و null كمان');
  assertEq(C.creditBalance([{amount:0.1,idem:'a'},{amount:0.2,idem:'b'}]), 0.3,
    '⭐ والكسور مظبوطة (مفيش 0.30000000000000004)');
})();

// ============================================================
// ٤) 💸 ⭐⭐ الصرف عمره ما يزيد عن الفاتورة
//    نفس ثغرة النقط §4أ٧: إجمالي سالب = "مرتجع" بيطلّع كاش.
// ============================================================
(function(){
  assertEq(C.creditSpendable(500, 400), 400,
    '⭐⭐ رصيد ٥٠٠ وفاتورة ٤٠٠ → بتصرف ٤٠٠ بس');
  assertEq(C.creditSpendable(300, 400), 300, 'ورصيد أقل = بتصرف الرصيد كله');
  assertEq(C.creditSpendable(500, 0), 0, '⭐ وفاتورة صفر = مفيش صرف');
  assertEq(C.creditSpendable(500, -100), 0, '⭐⭐ وفاتورة سالبة (مرتجع) = مفيش صرف');
  assertEq(C.creditSpendable(-500, 400), 0, 'ورصيد سالب مبيصرفش');
  assertEq(C.creditSpendable(null, 400), 0, 'وقيم فاضية مبتكسرش');
})();

// ============================================================
// ٥) 🎟️ فحص الكارت
// ============================================================
(function(){
  const now = Date.now();
  const good = { status:'active', remaining:500, expiresAt: now + 86400000 };

  const ok = C.giftCardCheck(good, now);
  assert(ok.ok === true, '✅ كارت سليم بيعدّي');
  assertEq(ok.amount, 500, 'وبكامل رصيده');
  assertEq(C.giftCardCheck(good, now, 200).amount, 200, 'ولو طلبنا جزء بياخد الجزء');
  assertEq(C.giftCardCheck(good, now, 900).amount, 500,
    '⭐⭐ وطلب أكبر من الرصيد بيتقصّ — مفيش صرف زيادة');

  assert(C.giftCardCheck(null, now).ok === false, '⛔ كود مش موجود');
  assert(C.giftCardCheck({status:'void',remaining:500}, now).ok === false, '⛔ كارت ملغي');
  assert(C.giftCardCheck({status:'pending',remaining:500}, now).ok === false,
    '⭐⭐ كارت لسه ماتدفعش تمنه — أهم حارس: مفيش كارت شغّال قبل الفلوس ما تدخل');
  assert(C.giftCardCheck({status:'active',remaining:0}, now).ok === false, '⛔ كارت فاضي');
  assert(C.giftCardCheck({status:'active',remaining:-5}, now).ok === false,
    '⛔ ورصيد سالب مبيصرفش');

  const exp = C.giftCardCheck({status:'active',remaining:500,expiresAt: now - 1000}, now);
  assert(exp.ok === false && exp.reason === 'expired', '⏳ وكارت منتهي');
  assert(C.giftCardCheck({status:'active',remaining:500}, now).ok === true,
    'وكارت من غير تاريخ انتهاء شغّال');
})();

// ============================================================
// ٦) 🛡️ حارس التخمين
// ============================================================
(function(){
  const now = Date.now();
  assert(C.giftCardTryGuard(0, 0, now).allowed === true, 'أول محاولة مسموحة');
  assert(C.giftCardTryGuard(4, now, now).allowed === true, 'والرابعة كمان');
  const locked = C.giftCardTryGuard(5, now, now);
  assert(locked.allowed === false, '⭐⭐ بعد ٥ محاولات غلط بيتقفل');
  assert(locked.waitMs > 0 && /دقيقة/.test(locked.msg), 'وبيقول يستنى قد إيه');
  assert(C.giftCardTryGuard(5, now - C.GC_LOCK_MS - 1, now).allowed === true,
    '⭐ وبعد ما المدة تعدّي بيفتح تاني');
})();

// ============================================================
// ٧) 🧾 ⭐⭐ المحاسبة — الحتة اللي بتخلي أرقام المالك صح
//
//    بيع الكارت **مش إيراد**. الفلوس دخلت الدرج بس البضاعة لسه
//    ماتباعتش — ده دين. لو حسبناه بيع، الرقم بيتعدّ مرتين:
//    مرة يوم البيع ومرة يوم الصرف.
// ============================================================
(function(){
  const sale = C.giftCardAccounting('sale', 500);
  assertEq(sale.cash, 500, '💵 بيع الكارت: الكاش دخل الدرج');
  assertEq(sale.revenue, 0, '⭐⭐ بس الإيراد صفر — لسه مبعناش بضاعة');
  assertEq(sale.liability, 500, '📕 وده دين عليك ٥٠٠');

  const red = C.giftCardAccounting('redeem', 500);
  assertEq(red.cash, 0, '🎟️ صرف الكارت: مفيش كاش داخل');
  assertEq(red.revenue, 500, '⭐⭐ لكن الإيراد اتحقق دلوقتي');
  assertEq(red.liability, -500, '📕 والدين اتسدّد');

  // ⭐⭐ الاختبار الحاسم: الدورة الكاملة تعدّ الفلوس **مرة واحدة**
  assertEq(sale.cash + red.cash, 500, '⭐ الكاش اتعدّ مرة واحدة');
  assertEq(sale.revenue + red.revenue, 500, '⭐⭐ والإيراد اتعدّ مرة واحدة');
  assertEq(sale.liability + red.liability, 0, '⭐⭐ والدين اتقفل — الدفتر متوازن');

  // 🔴 نيجاتيف — الطريقة الغلط
  const wrong = 500 /* بيع */ + 500 /* صرف */;
  assert(wrong !== sale.revenue + red.revenue,
    '🔴 نيجاتيف — لو حسبنا البيع إيراد، المالك يفتكر إنه باع ١٠٠٠ وهو باع ٥٠٠');
})();
