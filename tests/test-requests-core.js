// ============================================================
// 🔖 test-requests-core — محرك مطابقة طلبات الزباين
//
// 🔑 القاعدة اللي الملف ده بيحرسها:
//    **الاقتراح الغلط بيقتل الميزة.** لو النظام قال "الطرحة اللي
//    طلبتيها وصلت" وهي مش هي، المالك بيتحرج قدام العميلة ومرة
//    واحدة كفاية إنه يبطّل يثق في التنبيه كله.
//
//    فالاختبارات هنا نصّها بيتأكد إن الحاجات **مبتطابقش**.
// ============================================================
'use strict';
const path = require('path');
const R = require(path.resolve(__dirname, '..', 'pos', 'requests-core.js'));

const mk = (text, extra) => Object.assign({
  text: text, keywords: R.reqKeywords(text), createdAt: 1000, status:'open'
}, extra || {});

// ============================================================
// ١) 🔤 تطبيع العربي — الأساس اللي كل حاجة قايمة عليه
// ============================================================
(function(){
  assertEq(R.reqNormalize('طرحة'), 'طرحه', 'ة → ه');
  assertEq(R.reqNormalize('أحمد'), 'احمد', 'أ → ا');
  assertEq(R.reqNormalize('إسدال'), 'اسدال', 'إ → ا');
  assertEq(R.reqNormalize('آية'), 'ايه', 'آ → ا');
  assertEq(R.reqNormalize('على'), 'علي', 'ى → ي');
  assertEq(R.reqNormalize('طـــرحة'), 'طرحه', '⭐ التطويل بيتشال من غير ما يكسر الكلمة');
  assertEq(R.reqNormalize('طَرْحَة'), 'طرحه', 'والتشكيل');
  assertEq(R.reqNormalize('طرحة   بيضاء'), 'طرحه بيضاء', 'والمسافات المكررة');
  assertEq(R.reqNormalize('طرحة!! بيضاء؟'), 'طرحه بيضاء', 'وعلامات الترقيم');
  assertEq(R.reqNormalize('مقاس ٣٦'), 'مقاس 36', '🔢 والأرقام الهندية');
  assertEq(R.reqNormalize(''), '', 'وفاضي مبيكسرش');
  assertEq(R.reqNormalize(null), '', 'و null كمان');

  // ⚠️ الرمز جوّه الكلمة بيتشال من **غير** مسافة
  //    "طـ__رحة" لو بقت "ط رحه" تبقى كلمتين غلط بدل كلمة صح
  assertEq(R.reqNormalize('طـ__رحة'), 'طرحه',
    '⭐⭐ الرموز جوّه الكلمة مبتكسرهاش لكلمتين');
})();

// ============================================================
// ٢) ✂️ توحيد آخر الكلمة — الألوان أهم حاجة بنطابق بيها
// ============================================================
(function(){
  assertEq(R.reqStem('بيضاء'), 'بيضا', '✂️ بيضاء → بيضا');
  assertEq(R.reqStem('بيضا'), 'بيضا', '⭐⭐ وبيضا بتفضل بيضا (مبتتأكلش)');
  assertEq(R.reqStem('سودا'), 'سودا', 'وسودا زي ما هي');
  assertEq(R.reqStem('شيفون'), 'شيفون', 'والكلمة العادية متتغيرش');

  // 🔴 نيجاتيف — أول محاولة كانت بتشيل الألف كمان
  assert(R.reqStem('بيضا') !== 'بيض',
    '🔴 نيجاتيف — التوحيد مبياكلش الألف (كان بيبوّظ الكلمة الصح عشان يصلّح الغلط)');
})();

// ============================================================
// ٣) 🔑 الكلمات المميزة — الكلام العام بيتشال
// ============================================================
(function(){
  const k = R.reqKeywords('عايزة طرحة بيضا شيفون لو سمحت');
  assert(k.indexOf('عايزه') < 0, '🚫 "عايزة" اتشالت');
  assert(k.indexOf('لو') < 0, 'و"لو"');
  assert(k.indexOf('سمحت') < 0, 'و"سمحت"');
  assert(k.indexOf('طرحه') >= 0 && k.indexOf('بيضا') >= 0 && k.indexOf('شيفون') >= 0,
    '⭐ والمميز فضل');
  assertEq(R.reqKeywords('عايزة لو سمحت').length, 0,
    '⭐⭐ طلب كله كلام عام = صفر كلمات (مش هيطابق أي حاجة)');
  assertEq(R.reqKeywords('').length, 0, 'وفاضي = صفر');

  // مفيش تكرار
  assertEq(R.reqKeywords('طرحة طرحه طرحة').length, 1, '⭐ والتكرار بيتشال');
})();

// ============================================================
// ٤) 🟢 الباركود — الحقيقة الوحيدة المؤكدة
// ============================================================
(function(){
  const m = R.reqMatch({ barcode:'ECH123' }, { barcode:'ECH123', name:'أي حاجة' });
  assertEq(m.level, 'exact', '🟢 الباركود المطابق = مؤكد');
  assertEq(m.score, 1, 'وبنتيجة كاملة');

  assert(R.reqMatch({ barcode:'ECH123' }, { barcode:'ECH999' }).level !== 'exact',
    '⛔ وباركود مختلف مش مؤكد');
  assert(R.reqMatch({ barcode:'' }, { barcode:'' }).level !== 'exact',
    '⛔⭐ وباركود فاضي على الطرفين **مش** تطابق (ده أخطر تطابق وهمي ممكن يحصل)');
  assert(R.reqMatch({ barcode:'  ' }, { barcode:'' }).level !== 'exact',
    '⛔ ولا مسافات');
})();

// ============================================================
// ٥) ⭐⭐ المطابقة بالوصف — الحماية من الاقتراح الغلط
// ============================================================
(function(){
  const req = mk('طرحة بيضا شيفون');

  assertEq(R.reqMatch(req, { name:'طرحه شيفون بيضاء' }).level, 'likely',
    '🟡 المنتج المطابق = اقتراح');
  assertEq(R.reqMatch(req, { name:'طرحة قطن سوداء' }).level, 'weak',
    '⚪⭐⭐ طرحة سودا **مبتطابقش** طلب طرحة بيضا');
  assertEq(R.reqMatch(req, { name:'إسدال أسود' }).level, 'weak',
    '⚪ وحاجة تانية خالص لأ');

  // ⭐⭐ أهم فحص في الملف: كلمة واحدة عامة عمرها ما تكفي
  assertEq(R.reqMatch(mk('طرحة'), { name:'طرحة حرير حمرا' }).level, 'weak',
    '⭐⭐ "طرحة" لوحدها مبتطابقش — وإلا كل استلام يطلّع ٥٠ اقتراح والمالك يبطّل يبص');

  // 🔒 ومهما كان الوصف مطابق ١٠٠%، بيفضل اقتراح
  const perfect = R.reqMatch(mk('طرحة بيضا شيفون'), { name:'طرحة بيضا شيفون' });
  assertEq(perfect.score, 1, 'الوصف مطابق بالكامل');
  assertEq(perfect.level, 'likely',
    '🔒⭐⭐ وبرضه "اقتراح" مش "مؤكد" — المطابقة بالوصف تخمين ويفضل تخمين');

  // ✂️ التوحيد شغال في الاتجاهين
  assertEq(R.reqMatch(mk('طرحة بيضاء'), { name:'طرحه بيضا' }).level, 'likely',
    '✂️ بيضاء → بيضا');
  assertEq(R.reqMatch(mk('طرحه بيضا'), { name:'طرحة بيضاء' }).level, 'likely',
    '✂️⭐ وبيضا → بيضاء (متماثل في الاتجاهين)');
})();

// ============================================================
// ٦) 📦 مطابقة الدفعة
// ============================================================
(function(){
  const reqs = [
    mk('طرحة بيضا شيفون', { phone:'01000000001', createdAt: 100 }),
    mk('إسدال أسود',       { phone:'01000000002', createdAt: 200 }),
    mk('طرحة بيضا شيفون', { phone:'01000000003', createdAt: 300 }),
    mk('حاجة تانية خالص',  { phone:'01000000004', createdAt: 400, status:'done' })
  ];
  const prods = [{ barcode:'B1', name:'طرحة شيفون بيضاء' }];

  const out = R.reqMatchBatch(reqs, prods);
  assertEq(out.length, 2, '📦 اتنين طابقوا بس');
  assert(out.every(function(x){ return x.level !== 'weak'; }),
    '⚪⭐ والضعيف مبيدخلش خالص');
  assertEq(out[0].request.phone, '01000000001', '⭐ والأقدم الأول');

  // 🔒 المقفول مبيدخلش
  const closed = R.reqMatchBatch([mk('طرحة بيضا شيفون', { status:'done' })], prods);
  assertEq(closed.length, 0, '🔒 والطلب المقفول مبيطابقش');

  assertEq(R.reqMatchBatch([], prods).length, 0, 'ومفيش طلبات = مفيش نتيجة');
  assertEq(R.reqMatchBatch(reqs, []).length, 0, 'ومفيش بضاعة = مفيش نتيجة');
  assertEq(R.reqMatchBatch(null, null).length, 0, 'وقيم فاضية مبتكسرش');

  // 🟢 المؤكد فوق الاقتراح دايمًا
  const mixed = R.reqMatchBatch(
    [mk('طرحة بيضا شيفون', { createdAt: 1 }),
     mk('حاجة', { barcode:'B1', createdAt: 999 })],
    prods);
  assertEq(mixed[0].level, 'exact',
    '🟢⭐⭐ المؤكد فوق حتى لو أحدث من الاقتراح');
})();

// ============================================================
// ٧) 👥 التجميع — المالك بيختار مين
// ============================================================
(function(){
  const prods = [{ barcode:'B1', name:'طرحة شيفون بيضاء' }];
  const reqs = [
    mk('طرحة بيضا شيفون', { phone:'01000000003', createdAt: 300 }),
    mk('طرحة بيضا شيفون', { phone:'01000000001', createdAt: 100 }),
    mk('طرحة بيضا شيفون', { phone:'01000000002', createdAt: 200 })
  ];
  const g = R.reqGroupByProduct(R.reqMatchBatch(reqs, prods));
  assertEq(g.length, 1, '👥 مجموعة واحدة للمنتج');
  assertEq(g[0].count, 3, '⭐ و٣ عميلات طالبينه');
  assertEq(g[0].requests[0].request.phone, '01000000001',
    '⭐⭐ مرتبين بالأقدم — المالك بيشوف مين طلبت الأول ويقرر');
  assertEq(g[0].requests[2].request.phone, '01000000003', 'والأحدث في الآخر');

  // ⚠️ مفيش حجز ولا اختيار آلي — المحرك بيعرض بس
  assert(!g[0].winner && !g[0].reserved,
    '⚠️⭐⭐ مفيش "فايز" ولا حجز آلي — قرار المالك (زي ما طلب)');
})();

// ============================================================
// ٨) ⏳ الطلب القديم
// ============================================================
(function(){
  const now = Date.now();
  assert(R.reqIsStale({ createdAt: now - 100 * 86400000 }, now) === true,
    '⏳ طلب عمره ١٠٠ يوم = قديم');
  assert(R.reqIsStale({ createdAt: now - 10 * 86400000 }, now) === false,
    'وطلب عمره ١٠ أيام لسه صالح');
  assert(R.reqIsStale({ createdAt: now - 40 * 86400000 }, now, 30) === true,
    '⭐ والمدة قابلة للتغيير');
  assert(R.reqIsStale({}, now) === false, 'وطلب من غير تاريخ مبيتحسبش قديم');
  assertEq(R.REQ_STALE_DAYS, 90, 'والافتراضي ٩٠ يوم');
})();

// ============================================================
// ٩) 🔌 التوصيل في POS
// ============================================================
(function(){
  const fs = require('fs');
  const ROOT = path.resolve(__dirname, '..');
  const ui   = fs.readFileSync(path.join(ROOT, 'pos', 'requests-ui.js'), 'utf8');
  const prod = fs.readFileSync(path.join(ROOT, 'pos', 'products.js'), 'utf8');
  const sale = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'pos', 'index.html'), 'utf8');

  // متحمّل ومربوط
  assert(/<script src="requests-core\.js"><\/script>/.test(html), '🔌 المحرك متحمّل');
  assert(/<script src="requests-ui\.js"><\/script>/.test(html), 'والشاشات');
  assert(/onclick="addCustomerRequest\(\)"/.test(html), '➕ وزرار تسجيل الطلب');
  assert(/id="requestsBody"/.test(html), '📋 ومكان عرض الطلبات');

  // ⭐⭐ الاستلام عمره ما يقف عشان التنبيه
  assert(/checkRequestsAfterReceive\(rows\)/.test(prod),
    '⭐ التنبيه متنادى بعد الاستلام');
  const at = prod.indexOf('checkRequestsAfterReceive(rows)');
  const ctx = prod.slice(Math.max(0, at - 260), at);
  assert(/try\{/.test(ctx),
    '⭐⭐ وجوّه try — الاستلام عملية شغل يومية وعمره ما يقف عشان تنبيه');
  const doneAt = prod.indexOf('اتأكد استلام');
  assert(doneAt > 0 && at > doneAt,
    '⭐⭐ والتنبيه **بعد** ما الاستلام يخلص مش قبله');

  // 📡 المستمع على المفتوحة بس
  assert(/where\('status','==','open'\)/.test(ui),
    '📡⭐ المستمع على الطلبات المفتوحة بس — المقفولة بتتراكم للأبد');

  // 🟢 تلميح العميلة: المؤكد بس
  const hit = ui.slice(ui.indexOf('function refreshCustRequestHit('));
  assert(/level === 'exact'/.test(hit),
    "🟢⭐⭐ تلميح العميلة بالمطابقة المؤكدة بس — الاقتراح مينفعش يتقال قدامها كأنه حقيقة");
  assert(/qtyByBranch/.test(hit),
    '⭐ ولازم يكون موجود في الفرع فعلًا');

  // 🧠 متوصّل بشريط الفرصة
  assert(/refreshCustRequestHit\(phone\)/.test(sale), '🧠 بيتحدّث مع العميلة');
  assert(/window\.custRequestHit = null/.test(sale) || /custRequestHit=null/.test(sale),
    '🧹 وبيتصفّر لما العميلة تتشال (وإلا بيتسرب لعميلة تانية)');

  // 💬 واتساب يدوي مش آلي
  assert(/wa\.me\//.test(ui), '💬 واتساب برسالة جاهزة');
  assert(/window\.open\(/.test(ui), 'والمالك بيبص ويبعت');
  assert(!/httpsCallable|sendMessage|twilio/i.test(ui),
    '⚠️⭐ ومفيش إرسال آلي — ده قرار المالك ومحتاج WhatsApp API أصلًا');

  // ⚠️ مفيش حجز ولا اختيار آلي
  assert(!/reserve|حجز تلقائي/i.test(ui) || /نحجزهالك/.test(ui),
    '⚠️ مفيش حجز آلي — المالك بيقرر');
  assert(/الأقدم الأول/.test(ui), '⭐ والعميلات مرتبين بالأقدم عشان يقرر');
})();
