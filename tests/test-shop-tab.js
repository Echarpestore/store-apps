// ============================================================
// 🧪 test-shop-tab.js — «اطلبي» + «أوردراتي» في تطبيق العميلة
// ------------------------------------------------------------
// اللي الاختبار ده بيقفله:
//   ١) الطلب من غير فحص المخزون الحقيقي — الكتالوج **مالوش كميات**،
//      فالعميلة تطلب حاجة مش موجودة في الفرع وتيجي تلاقي محدش عارف
//      حاجة. الفحص لازم يقرا المخزون بالباركود لحظة الإرسال.
//   ٢) الإجمالي أو السعر يتبعت من الجهاز → طلب بـ٠ جنيه.
//   ٣) «فيزا» تتقري «دفعت أونلاين» — العميلة تيجي الفرع تلاقي نفسها
//      لسه هتدفع. النص لازم يقول «في الفرع» صراحةً.
//   ٤) مستمع الأوردرات يفضل شغّال بعد الخروج → عميلة تانية على نفس
//      الجهاز تشوف أوردرات مش بتاعتها.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOY = fs.readFileSync(path.join(ROOT, 'loyalty', 'index.html'), 'utf8');
/* ⚠️ التطبيقين اتبنوا بنسخ ولصق تاريخيًا — فحص واحد فيهم بس معناه
   إن الميزة تتصلح في واحد وتفضل مكسورة في التاني. */
const GLOW = fs.readFileSync(path.join(ROOT, 'glow', 'index.html'), 'utf8');
const CORE = require(path.join(ROOT, 'pos', 'orders-core.js'));
const I = require(path.join(ROOT, 'pos', 'i18n-core.js'));

/* ============================================================
   ١) الربط الأساسي
   ============================================================ */
(function(){
  assert(/<script src="\.\.\/pos\/orders-core\.js"><\/script>/.test(LOY),
    '⭐ التطبيق بيحمّل **نفس** محرك الأوردرات بتاع POS والموقع');
  assert(LOY.indexOf('orders-core.js') < LOY.indexOf('function renderShop'),
    'المحرك بيتحمّل قبل ما الواجهة تستعمله');
  assert(/data-tab="shop"/.test(LOY), 'تبويب «اطلبي» موجود');
  assert(/id="tab-shop"/.test(LOY), 'حاوية التبويب موجودة');
  assert(/\['card','offers','shop','invoices','account','contact'\]/.test(LOY),
    '⭐ التبويب في قائمة الإخفاء/الإظهار (وإلا بيفضل ظاهر فوق غيره)');
  ['renderShop','shopAdd','shopSubmit','openMyOrders','shopSetBranch','shopSetPay','watchMyOrders']
    .forEach(function(fn){
      assert(new RegExp('window\\.' + fn + '\\s*=\\s*' + fn).test(LOY),
        'القاعدة الذهبية — على window: ' + fn);
    });
})();

/* ============================================================
   ٢) ⭐⭐ فحص المخزون الحقيقي وقت الإرسال
   ============================================================ */
(function(){
  assert(/COL_INVENTORY\)\.doc\(String\(l\.barcode\)\)\.get\(\)/.test(LOY),
    '⭐⭐ الكميات بتتقرا من المخزون بالباركود (الكتالوج مالوش كميات)');
  assert(/orderValidateCart\(/.test(LOY), 'الفحص بيعدّي على الدالة المتختبرة');
  assert(!/where\('.*'\)\.get\(\)[\s\S]{0,40}COL_INVENTORY/.test(LOY),
    'مفيش استعلام على المخزون كله (آلاف المستندات على موبايل)');

  const iSubmit = LOY.indexOf('function shopSubmit');
  const iAdd = LOY.indexOf('.add(doc)');
  assert(iSubmit > 0 && iAdd > iSubmit, 'الكتابة جوه دالة الإرسال');
  const body = LOY.slice(iSubmit, iAdd);
  assert(body.indexOf('orderValidateCart') > 0 && body.indexOf('orderValidateCart') < body.length,
    '⭐⭐ الفحص **قبل** الكتابة مش بعدها');
})();

/* ============================================================
   ٣) ⭐⭐ الفلوس مش من الجهاز
   ============================================================ */
(function(){
  assert(/orderBuild\(\{/.test(LOY), 'المستند بيتبني من orderBuild');
  const iBuild = LOY.indexOf('var doc = orderBuild({');
  const body = LOY.slice(iBuild, iBuild + 500);
  assert(!/total:/.test(body),
    '⭐⭐ الإجمالي **مش** بيتبعت من الجهاز — بيتحسب في المحرك');
  assert(/items: chk\.items/.test(body),
    '⭐⭐ الأصناف من ناتج الفحص (السعر من الكتالوج) مش من السلة الخام');
  assert(/doc\.source = 'app'/.test(LOY), 'المصدر متسجّل — الموقع بيبعت web');

  // والمحرك نفسه: سعر مبعوت من العميلة بيتجاهل
  const prods = [{ barcode:'X1', name:'طرحة', price:100, qtyByBranch:{ 'الرحاب':5 } }];
  const chk = CORE.orderValidateCart([{ barcode:'X1', qty:2, price:1 }], prods, 'الرحاب', Date.now());
  assertEq(chk.ok, true, 'سلة سليمة بتعدّي');
  assertEq(chk.items[0].price, 100, '⭐⭐ السعر من الكتالوج مش من المدخلات');
  assertEq(CORE.orderTotal(chk.items), 200, 'الإجمالي بيتحسب صح');

  const bad = CORE.orderValidateCart([{ barcode:'X1', qty:9 }], prods, 'الرحاب', Date.now());
  assertEq(bad.ok, false, '⭐ كمية أكبر من المتاح بترفض');
  const wrongBranch = CORE.orderValidateCart([{ barcode:'X1', qty:1 }], prods, 'مدينتي', Date.now());
  assertEq(wrongBranch.ok, false, '⭐⭐ صنف مش موجود في الفرع اللي اختارته بيرفض');
})();

/* ============================================================
   ٤) «فيزا» = في الفرع
   ============================================================ */
(function(){
  assert(/💳 هدفع في الفرع بـ/.test(LOY),
    '⭐⭐ النص بيقول «في الفرع» — «ادفع بالفيزا» لوحدها بتوهمها إنها دفعت أونلاين');
  assert(/هتدفعي فيزا في الفرع/.test(LOY), 'شاشة الحالة بتكرر نفس التوضيح');
  /* ⚠️ الفحص على الكود **من غير الكومنتات**: الجملة اللي بنمنعها
     مكتوبة في الكومنت اللي بيشرح المنع نفسه. ده فخ الفحص الفضفاض
     بالعكس — كان هيفشّل اختبار سليم. */
  const noComments = LOY.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  assert(!/دفع أونلاين|ادفعي دلوقتي/.test(noComments),
    '⭐ مفيش أي نص **معروض** بيوحي بدفع أونلاين');
})();

/* ============================================================
   ٥) ⭐ عزل العميلة — المستمع بيتقفل مع الخروج
   ============================================================ */
(function(){
  const iLogout = LOY.indexOf('function logout(');
  const body = LOY.slice(iLogout, iLogout + 1400);
  assert(/if\(ordUnsub\)\{ ordUnsub\(\); ordUnsub=null; \}/.test(body),
    '⭐⭐ مستمع الأوردرات بيتقفل مع الخروج (عميلة تانية على نفس الجهاز)');
  assert(/_myOrders = \[\]/.test(body), '⭐ الأوردرات بتتمسح من الذاكرة مع الخروج');
  assert(/_shopCart = \{\}/.test(body), 'السلة بتتمسح مع الخروج');
  assert(/ordUnsub = watchMyOrders\(phone\)/.test(LOY),
    '⭐ المستمع بيشتغل مع الدخول — العميلة تشوف «جاهز» من غير ما تفتح حاجة');
  assert(/\.limit\(20\)/.test(LOY), 'سقف على الأوردرات (القديمة بتتراكم)');
})();

/* ============================================================
   ٦) شاشة الحالة — الخطوات ووعد بحالة مش بميعاد
   ============================================================ */
(function(){
  assert(/orderStepIndex\(|ORDER_STEPS/.test(LOY), 'الخطوات من المحرك');
  assert(/orderNextHint\(/.test(LOY), 'الخطوة الجاية بنص المحرك');
  assert(/orderTimeLeft\(/.test(LOY), 'الوقت الباقي بصيغة مقروءة');
  assertEq(CORE.orderNextHint('ready'),
    'روحي الفرع واستلمي — قولي رقم الأوردر أو امسحي كارتك', 'نص «جاهز»');
  assert(!/خلال ساعة|خلال ساعتين|خلال \d+ دقيقة/.test(LOY),
    '⭐ مفيش وعد بميعاد — الوعد بحالة بس');

  // انتهاء الحجز محسوب من الوقت مش من حقل محفوظ
  const now = 1000000;
  const o = { status:'ready', reservedUntil: now - 1 };
  assertEq(CORE.orderIsExpired(o, now), true, '⭐ الانتهاء محسوب من الوقت');
  assertEq(CORE.orderEffectiveStatus(o, now), 'expired', 'الحالة الفعلية بتتبع الانتهاء');
})();

/* ============================================================
   ٧) اللغتين — «اطلبي» اتولدت بلغتين من أول سطر
   ============================================================ */
(function(){
  const en = I.I18N_DICT.en;
  ['اطلبي','🛍️ أوردراتي','🧺 سلتك','اطلبي دلوقتي','💵 كاش','💳 فيزا',
   '🏬 هستلم من فرع','لسه مفيش أوردرات','جاهز','بيتجهّز','اتسلّم'
  ].forEach(function(k){
    assert(typeof en[k] === 'string' && en[k].length > 0, 'مترجم: ' + k);
  });
  I.i18nSetLang('en', { apply:false });
  assertEq(I.i18nT('روحي الفرع واستلمي — قولي رقم الأوردر أو امسحي كارتك'),
    'Come to the branch and collect — give your order number or scan your card',
    '⭐ نص الحالة من المحرك مترجم (بيتعرض حرفيًا في الشاشة)');
  assertEq(I.i18nT('💳 هتدفعي فيزا في الفرع'), '💳 You will pay by card in store',
    '⭐ توضيح الدفع في الفرع مترجم — أخطر جملة تتفهم غلط');
  I.i18nSetLang('ar', { apply:false });
})();

/* ============================================================
   ٨) الكاش
   ============================================================ */
(function(){
  const sw = fs.readFileSync(path.join(ROOT, 'loyalty', 'sw.js'), 'utf8');
  const m = sw.match(/echarpe-loyalty-v(\d+)/);
  assert(m && Number(m[1]) >= 54, '⭐ CACHE_NAME اترفع لـv54+');
})();

/* ============================================================
   ٩) 🖤 Glow — نفس الفحوصات الحرجة
   ============================================================ */
(function(){
  assert(/<script src="\.\.\/pos\/orders-core\.js"><\/script>/.test(GLOW),
    'Glow بيحمّل نفس محرك الأوردرات');
  assert(/data-tab="shop"/.test(GLOW) && /id="tab-shop"/.test(GLOW), 'Glow: تبويب «اطلبي»');
  assert(/\['card','offers','shop','invoices','account','contact'\]/.test(GLOW),
    'Glow: التبويب في قائمة الإخفاء/الإظهار');
  assert(/doc\.source = 'glow'/.test(GLOW),
    "⭐⭐ Glow بيبعت `source:'glow'` مش 'app' — من غيره أوردراته بتتعرض بشارة غلط في POS");
  assert(!/doc\.source = 'app'/.test(GLOW), 'Glow مش بيبعت مصدر التطبيق التاني');
  assert(/COL_INVENTORY\)\.doc\(String\(l\.barcode\)\)\.get\(\)/.test(GLOW),
    '⭐⭐ Glow: الكميات من المخزون الحقيقي');
  assert(/if\(ordUnsub\)\{ ordUnsub\(\); ordUnsub=null; \}/.test(GLOW),
    '⭐⭐ Glow: المستمع بيتقفل مع الخروج');
  assert(/💳 هدفع في الفرع بـ/.test(GLOW), '⭐ Glow: «في الفرع» صريحة');
  const gsw = fs.readFileSync(path.join(ROOT, 'glow', 'sw.js'), 'utf8');
  const gm = gsw.match(/glow-loyalty-v(\d+)/);
  assert(gm && Number(gm[1]) >= 46, '⭐ Glow: CACHE_NAME اترفع لـv46+');
})();

/* ============================================================
   ١٠) 🛒 مصدر الحقيقة: مستند البيع أونلاين المستقل
   ------------------------------------------------------------
   ⚠️ كانت فيه خانة `online` على الكتالوج — اتشالت. مصدرين للحقيقة
      معناه حاجة متفعّلة هنا ومتشالة هناك ومحدش عارف مين الصح.
   ⚠️ والكتالوج عرض وبانرات: تعديل بانر مالوش حق يلمس كمية بيع.
   ============================================================ */
(function(){
  const ADMIN = fs.readFileSync(path.join(ROOT, 'pos', 'pos-admin.js'), 'utf8');
  const SHOP = fs.readFileSync(path.join(ROOT, 'pos', 'shop-admin.js'), 'utf8');
  const HTML = fs.readFileSync(path.join(ROOT, 'pos', 'index.html'), 'utf8');

  assert(!/catOnline/.test(ADMIN), '⭐⭐ خانة `online` اتشالت من الكتالوج (مصدر واحد للحقيقة)');
  assert(!/catalogToggleOnline/.test(ADMIN), 'وزرارها كمان');

  [['loyalty', LOY], ['glow', GLOW]].forEach(function(pair){
    const app = pair[0], src = pair[1];
    const i = src.indexOf('function shopItems()');
    const body = src.slice(i, i + 400);
    assert(/shopCatalog \|\| \[\]/.test(body),
      '⭐⭐ ' + app + ': «اطلبي» بيقرا مستند البيع أونلاين مش الكتالوج');
    assert(/p\.active === true/.test(body), '⭐ ' + app + ': الموقوف مايتعرضش');
    assert(/Number\(p\.onlineQty\) > 0/.test(body), '⭐⭐ ' + app + ': اللي خلص عدده مايتعرضش');
    assert(/p\.barcode/.test(body), '⭐ ' + app + ': ومن غير باركود مايتعرضش');
    assert(/online_shop_/.test(src), app + ': بيقرا المستند الصح');
    const lo = src.slice(src.indexOf('function logout('), src.indexOf('function logout(') + 1600);
    assert(/shopCatalog = null/.test(lo), '⭐ ' + app + ': المنتجات بتتصفّر مع الخروج');
  });

  assert(/id="onlineShopScreen"/.test(HTML), 'شاشة «منتجات البيع أونلاين» موجودة');
  assert(/id="navOnlineShop"/.test(HTML), 'وأيقونتها في مجموعة «التطبيق»');
  assert(HTML.indexOf('pos-admin.js') < HTML.indexOf('shop-admin.js'),
    '⭐ shop-admin بعد pos-admin (بيستعمل resizeImageFile وcatalogBrand)');

  ['goToOnlineShopAdmin','shopSaveItem','shopEditItem','shopToggleActive','shopDelItem',
   'shopPickInv','shopInvSuggest','shopPickImage','renderShopAdmin','shopClearForm'
  ].forEach(function(fn){
    assert(new RegExp('window\\.' + fn + '\\s*=\\s*' + fn).test(SHOP),
      'القاعدة الذهبية — على window: ' + fn);
  });

  assert(/if\(!barcode\)\{ showToast\('اختار الصنف من المخزون الأول/.test(SHOP),
    '⭐⭐ من غير باركود مايتحفظش — فحص الكمية مستحيل من غيره');
  assert(/if\(price <= 0\)/.test(SHOP), '⭐ سعر بصفر مايتحفظش (الأوردر كان هيتحسب بصفر)');
  assert(/if\(qty <= 0\)/.test(SHOP), '⭐ عدد بصفر مايتحفظش');
  assert(/const over = \(total !== null && Number\(it\.onlineQty\) > total\)/.test(SHOP),
    '⭐⭐ تحذير لو العدد أونلاين أكبر من المخزون الحقيقي (وعد مش هنقدر نوفيه)');
  assert(/shopData\.items = JSON\.parse\(before\)/.test(SHOP),
    '⭐ فشل الحفظ بيرجّع الحالة — الشاشة ماتقولش «اتحفظ» وهو ماتحفظش');
  assert(/it\.active = !it\.active; showToast\('خطأ/.test(SHOP), '⭐ ونفس الرجوع للإيقاف');
  assert(/function shopRenderStockHint/.test(SHOP), '⭐ المتاح في الفروع بيبان جنب خانة العدد');
})();

/* ============================================================
   ١١) 🎨 أيقونة التبويب بنفس ستايل الباقي
   ============================================================ */
(function(){
  const i = LOY.indexOf('data-tab="shop"');
  const btn = LOY.slice(i, i + 500);
  assert(/class="ti-svg"/.test(btn),
    '⭐ إيشارب: أيقونة «اطلبي» SVG زي باقي التبويبات (الإيموچي كان شكله غريب وسطهم)');
  assert(!/<span class="ti">🛍️<\/span>/.test(btn), 'ومفيش إيموچي مكانها');
  // Glow تبويباته إيموچي أصلًا — فالإيموچي هو المتسق عنده
  const gi = GLOW.indexOf('data-tab="shop"');
  assert(/<span class="ti">🛍️<\/span>/.test(GLOW.slice(gi, gi + 200)),
    '⭐ Glow: إيموچي — لأن كل تبويباته إيموچي (الاتساق مش التوحيد)');
})();

/* ============================================================
   ١٢) 🚚 الشحن والاستلام + بيانات العميلة
   ------------------------------------------------------------
   اللي البلوك ده بيقفله:
     ١) مصاريف شحن على أوردر «استلام من الفرع» — العميلة جاية بنفسها.
     ٢) اختيار «فيزا» مع الشحن — ماكينة الفيزا في الفرع مش مع المندوب،
        فالوعد ده مش موجود أصلًا.
     ٣) عنوان ناقص → مندوب واقف في الشارع والأوردر بيرجع.
     ٤) الشحن بيتاخد من الشاشة بدل الإعدادات → أي تعديل في الكونسول
        بيغيّر المصاريف.
   ============================================================ */
(function(){
  const SHOP = fs.readFileSync(path.join(ROOT, 'pos', 'shop-admin.js'), 'utf8');
  const OUI = fs.readFileSync(path.join(ROOT, 'pos', 'orders-ui.js'), 'utf8');
  const RULES = fs.readFileSync(path.join(ROOT, 'security', 'firestore-phase2.rules'), 'utf8');

  // ⭐⭐ المحرك
  const pick = CORE.orderBuild({ phone:'01000000000', items:[{barcode:'x',name:'a',qty:1,price:100}],
    fulfillment:'pickup', shipping:60, payMethod:'visa' });
  assertEq(pick.shipping, 0, '⭐⭐ الاستلام من الفرع = صفر شحن مهما اتبعت');
  assertEq(pick.grandTotal, 100, 'وإجماليه قيمة البضاعة');
  assertEq(pick.payMethod, 'visa', 'والفيزا مسموحة في الفرع');

  const del = CORE.orderBuild({ phone:'01000000000', items:[{barcode:'x',name:'a',qty:2,price:100}],
    fulfillment:'delivery', shipping:60, payMethod:'visa', governorate:'أسوان', address:'ش النيل' });
  assertEq(del.payMethod, 'cash', '⭐⭐ الشحن كاش إجباري — الماكينة مش مع المندوب');
  assertEq(del.grandTotal, 260, 'الإجمالي = بضاعة + شحن');
  assertEq(del.total, 200, '⭐ `total` فضل قيمة البضاعة (المرتجع بيتحسب بيه)');

  // 💸 حساب الشحن
  const cfg = { deliveryEnabled:true, shippingFee:60, freeOver:1500,
                governorates:[{name:'أسوان', fee:110}] };
  assertEq(CORE.orderShippingFee(cfg, 500), 60, 'الرسم الموحّد');
  assertEq(CORE.orderShippingFee(cfg, 500, 'أسوان'), 110, 'رسم المحافظة بيغلب');
  assertEq(CORE.orderShippingFee(cfg, 1600, 'أسوان'), 0, '⭐ المجاني فوق المبلغ بيغلب المحافظة');
  assertEq(CORE.orderShippingFee({ deliveryEnabled:false, shippingFee:60 }, 500), 0,
    '⭐ الشحن مقفول = صفر مصاريف');

  // 👤 فحص البيانات
  assertEq(CORE.orderValidateContact({ name:'نور', phone:'01000000000' }, 'pickup').ok, true,
    'الاستلام: الاسم والرقم بس كفاية');
  const bad = CORE.orderValidateContact({ name:'نور', phone:'01000000000' }, 'delivery');
  assertEq(bad.ok, false, '⭐⭐ الشحن من غير عنوان بيترفض');
  assert(bad.errors.length === 2, 'وبيقول الناقص كله مش أول واحد بس');
  assertEq(CORE.orderValidateContact({ name:'نور', phone:'01000000000',
    governorate:'القاهرة', address:'ش النيل ٥ الدور ٣' }, 'delivery').ok, true, 'وبيعدّي لما يكمل');

  // 📦 المتاح = أقل رقم بين المخصّص والمخزون
  const prod = { barcode:'x', qtyByBranch:{ 'الرحاب':3 } };
  assertEq(CORE.orderAvailable({ active:true, onlineQty:10 }, prod, 'الرحاب'), 3,
    '⭐⭐ المخزون بيغلب المخصّص (وعد بـ١٠ وعندك ٣)');
  assertEq(CORE.orderAvailable({ active:true, onlineQty:1 }, prod, 'الرحاب'), 1,
    '⭐ والمخصّص بيغلب المخزون (مش كل المحل يتباع أونلاين)');
  assertEq(CORE.orderAvailable({ active:false, onlineQty:10 }, prod, 'الرحاب'), 0,
    '⭐ الموقوف = صفر');

  // 🖥️ التطبيقين
  [['loyalty', LOY], ['glow', GLOW]].forEach(function(pair){
    const app = pair[0], src = pair[1];
    assert(/orderValidateContact\(info, _shopFulfill\)/.test(src),
      '⭐⭐ ' + app + ': البيانات بتتفحص قبل الإرسال');
    assert(/orderShippingFee\(shopCfg, orderTotal\(chk\.items\), _shopGov\)/.test(src),
      '⭐⭐ ' + app + ': الشحن من الإعدادات مش من الشاشة');
    assert(/_shopInfo\.name \|\| currentCustomer\.name/.test(src),
      '⭐ ' + app + ': الاسم والرقم من الحساب، وهي بتكمّل الباقي');
    assert(/function shopInfoSet\(k, v\)\{ _shopInfo\[k\] = v; \}/.test(src),
      '⭐⭐ ' + app + ': الكتابة مش بتعيد الرسم (الكيبورد كان بيقفل مع كل حرف)');
    assert(/if\(!canDeliver && _shopFulfill === 'delivery'\) _shopFulfill = 'pickup'/.test(src),
      '⭐ ' + app + ': الشحن المقفول مبيتعرضش أصلًا بدل ما يتعرض ويترفض');
    assert(/الدفع <b>كاش عند الاستلام<\/b>/.test(src),
      '⭐⭐ ' + app + ': الشحن كاش — مكتوبة صراحةً للعميلة');
    assert(/orderNextHint\(st, o\.fulfillment\)/.test(src),
      '⭐ ' + app + ': نص الحالة بيتغيّر مع الشحن («يتشحن» مش «تعالي استلمي»)');
    assert(/EG_GOVS/.test(src), app + ': فولباك محافظات لو الإعداد ناقص');
  });

  // 🖥️ POS
  assert(/var del = orderIsDelivery\(o\)/.test(OUI), 'POS بيفرّق بين الشحن والاستلام');
  assert(/📍 ' \+ ordEsc\(o\.address \|\| '— مفيش عنوان!'\)/.test(OUI),
    '⭐⭐ POS: العنوان بارز — ومكتوب صراحةً لو ناقص');
  assert(/o\.contactPhone \|\| o\.phone/.test(OUI),
    '⭐ POS: رقم التوصيل (ممكن يكون غير رقم الحساب)');
  assert(/🚚 اشحن — حمّل السلة/.test(OUI), '⭐ POS: نص الزرار بيتغيّر مع الشحن');

  // ⚙️ إعدادات POS
  assert(/id="cfgDelivery"/.test(SHOP) && /id="cfgFee"/.test(SHOP), 'لوحة إعدادات الشحن');
  assert(/if\(!pickup && !delivery\)/.test(SHOP),
    '⭐⭐ ممنوع تقفل الاتنين — تبويب موجود ومفيش طريقة تكمّلي بيه');
  assert(/_cfg'/.test(SHOP), '⭐ الإعدادات مستند منفصل عن المنتجات (فيهم صور تقيلة)');

  // 🔐 القواعد
  const i = RULES.indexOf('match /online_orders/{id}');
  const block = RULES.slice(i, RULES.indexOf('allow delete: if false;', i));
  assert(/fulfillment == 'pickup'/.test(block) && /fulfillment == 'delivery'/.test(block),
    '⭐ القاعدة بتحصر طريقة التسليم');
  assert(/request\.resource\.data\.shipping >= 0/.test(block),
    "⭐⭐ شحن سالب ممنوع (كان بيقلّل الإجمالي)");
  assert(/grandTotal >= request\.resource\.data\.total/.test(block),
    '⭐⭐ الإجمالي مايقلّش عن قيمة البضاعة');
  assert(/request\.resource\.data\.shipping == resource\.data\.shipping/.test(RULES.slice(i, i + 2600)),
    '⭐ والشحن متجمّد بعد الإنشاء');
})();
