// ============================================================
// 🛍️ test-orders-core — محرك أوردرات التطبيق
// ------------------------------------------------------------
// ده منطق **فلوس ومخزون**، فالاختبار **بيشغّل** الدوال على بيانات
// حقيقية — مش بيدوّر على نصوص في الكود.
//
// 📌 القرارات المتفق عليها:
//   · «فيزا» = هتدفع في الفرع (مش دفع أونلاين)
//   · الحجز ٢٤ ساعة وبعدها الكمية ترجع للبيع
//   · الأوردر بيتحوّل فاتورة حقيقية في POS
// ============================================================
'use strict';
const path = require('path');
const M = require(path.resolve(__dirname, '..', 'pos', 'orders-core.js'));

const PRODUCTS = [
  { barcode:'E1', name:'طرحة شيفون بيضا', price:350, qtyByBranch:{ 'الرحاب':2, 'مدينتي':0 } },
  { barcode:'E2', name:'بيچامة قطن',      price:430, qtyByBranch:{ 'الرحاب':5, 'مدينتي':3 } },
  { barcode:'E3', name:'صنف بلا مخزون',   price:100, qtyByBranch:{} }
];
const NOW = 1_755_300_000_000;

// ============================================================
// ١) 🔄 الحالة بتتحرك للأمام بس
// ------------------------------------------------------------
// ⚠️ من غير الجدول ده، أي كتابة غلط (أو عميلة فتحت الكونسول)
//    تقدر ترجّع أوردر **متسلّم** لـ«جاهز» وتستلمه تاني.
// ============================================================
{
  const L = '🔄 الحالة: ';
  assertEq(M.orderCanMove('placed', 'preparing'), true, L + 'اتسجّل ← بيتجهّز');
  assertEq(M.orderCanMove('preparing', 'ready'), true, L + 'بيتجهّز ← جاهز');
  assertEq(M.orderCanMove('ready', 'collected'), true, L + 'جاهز ← اتسلّم');

  assertEq(M.orderCanMove('placed', 'ready'), false,
    L + '⭐⭐ ممنوع القفز فوق «بيتجهّز»');
  assertEq(M.orderCanMove('placed', 'collected'), false,
    L + '⭐⭐ وممنوع القفز على التسليم');
  assertEq(M.orderCanMove('ready', 'preparing'), false, L + '⭐ ومفيش رجوع لورا');
  assertEq(M.orderCanMove('collected', 'ready'), false,
    L + '⭐⭐ والمتسلّم **مايرجعش** جاهز (وإلا يتستلم مرتين)');
  assertEq(M.orderCanMove('collected', 'collected'), false, L + 'ولا يتسلّم تاني');
  assertEq(M.orderCanMove('cancelled', 'preparing'), false, L + 'والملغي مايكملش');
  assertEq(M.orderCanMove('expired', 'ready'), false, L + 'والمنتهي كذلك');
  // الإلغاء متاح من أي حالة شغالة
  ['placed','preparing','ready'].forEach(function(s){
    assertEq(M.orderCanMove(s, 'cancelled'), true, L + 'الإلغاء متاح من ' + s);
  });
  assertEq(M.orderCanMove('mystery', 'ready'), false, L + '⭐ وحالة مش معروفة = ممنوع');
}

// ============================================================
// ٢) 💰 الإجمالي بيتحسب مش بيتصدّق
// ------------------------------------------------------------
// ⚠️ لو سبنا العميلة تبعت `total`، تقدر تطلب بـ٠ جنيه.
// ============================================================
{
  const L = '💰 الإجمالي: ';
  assertEq(M.orderTotal([{qty:2, price:350}, {qty:1, price:430}]), 1130, L + '⭐ الحساب صح');
  assertEq(M.orderCount([{qty:2}, {qty:1}]), 3, L + 'وعدد القطع');
  assertEq(M.orderTotal([]), 0, L + 'وسلة فاضية = صفر');
  // 🔒 قيم خبيثة
  assertEq(M.orderTotal([{qty:-5, price:350}]), 0, L + '⭐⭐ كمية سالبة = صفر مش خصم');
  assertEq(M.orderTotal([{qty:2, price:-100}]), 0, L + '⭐⭐ وسعر سالب متجاهَل');
  assertEq(M.orderTotal([{qty:1.7, price:100}]), 100, L + '⭐ والكسور بتتقطع (١.٧ = ١)');
  assertEq(M.orderTotal([{qty:'2', price:'350'}]), 700, L + 'والنص بيتحوّل رقم');
  assertEq(M.orderTotal([{}]), 0, L + 'وسطر فاضي مبيكسرش الحساب');
}

// ============================================================
// ٣) 📦 المخزون **بالفرع** مش الإجمالي
// ------------------------------------------------------------
// ⚠️ `quantity` مجموع كل الفروع. عرضه للعميلة معناه إنها تطلب
//    حاجة موجودة في فرع تاني خالص وتيجي متلاقيش.
// ============================================================
{
  const L = '📦 المخزون: ';
  assertEq(M.orderBranchQty(PRODUCTS[0], 'الرحاب'), 2, L + 'كمية الفرع');
  assertEq(M.orderBranchQty(PRODUCTS[0], 'مدينتي'), 0, L + '⭐⭐ وفرع تاني = صفر');
  assertEq(M.orderBranchQty(PRODUCTS[2], 'الرحاب'), 0, L + 'ومن غير الحقل = صفر');
  assertEq(M.orderBranchQty(null, 'الرحاب'), 0, L + 'ومنتج فاضي مبيكسرش');
  // ⚠️ `quantity` **مش** مصدر — لو اتقري، الفرع الفاضي هيبان مليان
  assertEq(M.orderBranchQty({ quantity: 99 }, 'الرحاب'), 0,
    L + '⭐⭐ و`quantity` المجمّع **مش** بيتقري خالص');
}

// ============================================================
// ٤) ✅ فحص السلة
// ============================================================
{
  const L = '✅ الفحص: ';
  const ok = M.orderValidateCart([{barcode:'E1', qty:2}], PRODUCTS, 'الرحاب');
  assertEq(ok.ok, true, L + 'سلة سليمة بتعدّي');
  assertEq(ok.items.length, 1, L + 'وبسطر واحد');
  assertEq(ok.items[0].price, 350,
    L + '⭐⭐ والسعر جه **من الكتالوج** مش من المدخلات');
  assertEq(ok.items[0].name, 'طرحة شيفون بيضا', L + 'والاسم كذلك');

  // 🔒 سعر مزيّف بيتجاهَل
  const fake = M.orderValidateCart([{barcode:'E1', qty:1, price:1, name:'مجاني'}], PRODUCTS, 'الرحاب');
  assertEq(fake.items[0].price, 350, L + '⭐⭐ سعر مبعوت من العميلة **بيتجاهَل**');
  assertEq(fake.items[0].name, 'طرحة شيفون بيضا', L + '⭐ والاسم كمان');

  // أكتر من المتاح
  const over = M.orderValidateCart([{barcode:'E1', qty:3}], PRODUCTS, 'الرحاب');
  assertEq(over.ok, false, L + '⭐⭐ أكتر من المتاح بيترفض');
  assert(/متاح 2 بس/.test(over.errors[0]), L + '⭐ والرسالة بتقول المتاح كام');

  // مش في الفرع ده
  const wrong = M.orderValidateCart([{barcode:'E1', qty:1}], PRODUCTS, 'مدينتي');
  assertEq(wrong.ok, false, L + '⭐⭐ صنف مش في الفرع بيترفض');
  assert(/مدينتي/.test(wrong.errors[0]), L + 'والرسالة بتسمّي الفرع');

  // من غير فرع
  const nob = M.orderValidateCart([{barcode:'E1', qty:1}], PRODUCTS, '');
  assertEq(nob.ok, false, L + '⭐ ومن غير فرع بيترفض');
  assert(/اختاري الفرع/.test(nob.errors[0]), L + 'وبيقول تعملي إيه');

  // سلة فاضية · باركود مش موجود
  assertEq(M.orderValidateCart([], PRODUCTS, 'الرحاب').ok, false, L + 'وسلة فاضية');
  assertEq(M.orderValidateCart([{barcode:'ZZZ', qty:1}], PRODUCTS, 'الرحاب').ok, false,
    L + '⭐ وباركود مش في الكتالوج');
}

// ============================================================
// ٥) ⏳ الحجز ٢٤ ساعة
// ------------------------------------------------------------
// ⚠️ الانتهاء بيتحسب **من الوقت** مش من حقل محفوظ: لو الدالة
//    السحابية وقعت يوم، الأوردرات كانت هتفضل «جاهزة» للأبد
//    والمخزون محجوز.
// ============================================================
{
  const L = '⏳ الحجز: ';
  const o = M.orderBuild({ phone:'01144288231', brand:'echarpe', branch:'الرحاب',
    items:[{barcode:'E1', name:'طرحة', qty:2, price:350}], payMethod:'visa', nowMs:NOW });

  assertEq(o.reservedUntil - o.createdAt, 24*60*60*1000, L + '⭐⭐ ٢٤ ساعة بالظبط');
  assertEq(o.status, 'placed', L + 'والحالة بتبدأ «اتسجّل»');
  assertEq(o.total, 700, L + 'والإجمالي محسوب');
  assertEq(o.count, 2, L + 'وعدد القطع');
  assertEq(o.payMethod, 'visa', L + 'وطريقة الدفع');

  assertEq(M.orderIsExpired(o, NOW + 23*3600000), false, L + '⭐ بعد ٢٣ ساعة لسه شغّال');
  assertEq(M.orderIsExpired(o, NOW + 25*3600000), true, L + '⭐⭐ وبعد ٢٥ انتهى');
  assertEq(M.orderEffectiveStatus(o, NOW + 25*3600000), 'expired',
    L + '⭐⭐ والحالة الفعلية «انتهى» حتى لو المحفوظ «اتسجّل»');

  // 🔒 المتسلّم عمره ما «ينتهي»
  const done = Object.assign({}, o, { status:'collected' });
  assertEq(M.orderIsExpired(done, NOW + 100*3600000), false,
    L + '⭐⭐ الأوردر المتسلّم **مبينتهيش** (اتسلّم خلاص)');
  const cancelled = Object.assign({}, o, { status:'cancelled' });
  assertEq(M.orderIsExpired(cancelled, NOW + 100*3600000), false, L + 'والملغي كذلك');

  // ⏱️ الوقت الباقي مقروء
  assertEq(M.orderTimeLeft(o, NOW + 5*3600000), 'باقي 19 ساعة', L + '⭐ الوقت بالساعات');
  assert(/دقيقة/.test(M.orderTimeLeft(o, NOW + 23.9*3600000)), L + 'وبالدقايق قرب الآخر');
  assertEq(M.orderTimeLeft(o, NOW + 30*3600000), 'انتهى', L + 'وبعد المدة «انتهى»');

  // 🔔 تنبيه قرب الانتهاء
  assertEq(M.orderNearExpiry(o, NOW + 21*3600000), true, L + '⭐ تنبيه قبل الانتهاء بـ٣ ساعات');
  assertEq(M.orderNearExpiry(o, NOW + 10*3600000), false, L + 'ومفيش تنبيه بدري');
}

// ============================================================
// ٦) 💳 طريقة الدفع — «فيزا» يعني في الفرع
// ============================================================
{
  const L = '💳 الدفع: ';
  const cash = M.orderBuild({ items:[], payMethod:'cash', nowMs:NOW });
  assertEq(cash.payMethod, 'cash', L + 'كاش');
  // ⚠️ أي قيمة تانية بترجع كاش — مفيش «دفعت أونلاين»
  assertEq(M.orderBuild({ items:[], payMethod:'paid_online', nowMs:NOW }).payMethod, 'cash',
    L + '⭐⭐ قيمة مش معروفة = كاش (مفيش دفع أونلاين أصلًا)');
  assertEq(M.orderBuild({ items:[], nowMs:NOW }).payMethod, 'cash', L + 'والافتراضي كاش');
}

// ============================================================
// ٧) 🔢 كود الأوردر
// ------------------------------------------------------------
// العميلة بتقوله للكاشير على التليفون — أرقام بس، مفيش لبس
// بين 0/O و1/I.
// ============================================================
{
  const L = '🔢 الكود: ';
  const c = M.orderCode(NOW, '01144288231');
  assert(/^\d+$/.test(c), L + '⭐⭐ أرقام بس (سهل يتقال على التليفون)');
  assert(c.length >= 6, L + 'وطوله معقول');
  assert(/231$/.test(c), L + '⭐ وآخر ٣ أرقام من موبايلها (بيسهّل البحث)');
  // أوردرين لنفس العميلة في وقتين مختلفين ≠ نفس الكود
  assert(M.orderCode(NOW, '0114') !== M.orderCode(NOW + 60000, '0114'),
    L + '⭐ وكودين مختلفين لوقتين مختلفين');
}

// ============================================================
// ٨) 📋 الخطوات والنصوص
// ------------------------------------------------------------
// ⚠️ النص **وعد بحالة مش بميعاد**: "بنجهّزلك" مش "هيبقى جاهز خلال
//    ساعة". الوعد بميعاد اللي مااتحققش أوحش من إننا ماوعدناش.
// ============================================================
{
  const L = '📋 الخطوات: ';
  assertEq(M.orderStepIndex('placed'), 0, L + 'اتسجّل = ٠');
  assertEq(M.orderStepIndex('ready'), 2, L + 'جاهز = ٢');
  assertEq(M.orderStepIndex('collected'), 3, L + 'اتسلّم = ٣');
  assertEq(M.orderStepIndex('expired'), 0, L + '⭐ وحالة بره المسار مبتكسرش الشريط');

  assert(/روحي الفرع/.test(M.orderNextHint('ready')),
    L + '⭐⭐ «جاهز» بتقولها تعمل إيه بالظبط');
  assert(/رقم الأوردر|كارتك/.test(M.orderNextHint('ready')),
    L + '⭐ وبتقولها تجيب معاها إيه');

  // 🔒 مفيش وعد بميعاد في أي نص
  Object.keys(M.ORDER_LABEL).forEach(function(k){
    const all = M.ORDER_LABEL[k].t + ' ' + M.ORDER_LABEL[k].sub + ' ' + M.orderNextHint(k);
    assert(!/خلال ساعة|خلال ساعتين|بكرة|النهاردة بالظبط/.test(all),
      L + '⭐⭐ مفيش وعد بميعاد في «' + k + '»');
  });
  assert(/الحجز رجع/.test(M.orderNextHint('expired')),
    L + '⭐ و«انتهى» بتشرح إن الحجز رجع مش بتسيبها محتارة');
}

// ============================================================
// ٩) 🧪 اختبارات سلبية
// ============================================================
{
  const L = '🧪 سلبي: ';
  // (أ) لو الفحص اتشال، سعر مزيّف بيعدّي
  const raw = require('fs').readFileSync(
    path.resolve(__dirname, '..', 'pos', 'orders-core.js'), 'utf8');
  assert(/price: Number\(p\.price\) \|\| 0/.test(raw),
    L + '⭐⭐ السعر بيتاخد من `p` (الكتالوج) مش من `line`');
  assert(!/price: Number\(line\.price\)/.test(raw),
    L + '⭐⭐ ومش من المدخلات أبدًا');

  // (ب) الإجمالي مبيتقريش من المدخل
  assert(!/total: Number\(o\.total\)/.test(raw),
    L + '⭐⭐ و`total` مبيتقريش من المدخل — بيتحسب');
  assert(/total: orderTotal\(items\)/.test(raw), L + 'بيتحسب من الأصناف');

  // (ج) الانتهاء محسوب مش محفوظ
  assert(/nowMs \|\| Date\.now\(\)\) > until/.test(raw),
    L + '⭐⭐ والانتهاء بيتحسب من الوقت (مش معتمد على دالة سحابية)');
}
