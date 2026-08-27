// ============================================================
// 🧪 test-basket.js — «اللي بيتاخد مع» (المحرك + الربط)
// ------------------------------------------------------------
// اللي الاختبار ده بيقفله:
//   ١) اقتراح «الأكتر مبيعًا» — الكيس بيتاخد مع كل حاجة، فاقتراحه
//      مع كل صنف بيخلي الشريط ضوضا والكاشير تبطّل تبص عليه.
//   ٢) اقتراح صنف **مش موجود في الفرع** — العميلة تقول «هاخده»
//      وتتخذل. ده أسوأ من مفيش اقتراح.
//   ٣) التعلّم من المرتجعات وسطور الاستبدال — دي مش شراء.
//   ٤) حساب الاقتراح من الفواتير لحظيًا = مئات القراءات مع كل صنف
//      بيتضاف. الموديل مستند واحد بيتقري مرة.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const B = require(path.join(ROOT, 'pos', 'basket-core.js'));
const UI = fs.readFileSync(path.join(ROOT, 'pos', 'basket-ui.js'), 'utf8');
const SALE = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'pos', 'index.html'), 'utf8');
const ADMIN = fs.readFileSync(path.join(ROOT, 'pos', 'pos-admin.js'), 'utf8');

/* بيانات ثابتة: «شال» و«دبوس» بيتاخدوا مع بعض · «كيس» بيتاخد مع الكل */
function sampleSales(){
  const s = [];
  for(let i = 0; i < 10; i++) s.push({ items:[{barcode:'SHAWL',qty:1},{barcode:'PIN',qty:1},{barcode:'BAG',qty:1}] });
  for(let i = 0; i < 20; i++) s.push({ items:[{barcode:'SOCK',qty:1},{barcode:'BAG',qty:1}] });
  for(let i = 0; i < 6; i++)  s.push({ items:[{barcode:'SHAWL',qty:1},{barcode:'BAG',qty:1}] });
  return s;
}
const MODEL = B.basketBuildModel(sampleSales());

/* ============================================================
   ١) ⭐⭐ الكيس مايتقترحش — «بيتباع كتير» ≠ «بيتباع مع ده»
   ============================================================ */
(function(){
  const forShawl = MODEL.pairs['SHAWL'] || [];
  const names = forShawl.map(function(r){ return r.b; });
  assert(names.indexOf('PIN') >= 0, 'الدبوس اتعلّم مع الشال');
  assert(names.indexOf('BAG') < 0,
    '⭐⭐ الكيس **مش** في اقتراحات الشال — بيتباع مع كل حاجة فمالوش دلالة');

  // نفس الشيء بالأرقام: علاقة الشال بالدبوس أقوى من الصدفة
  const pin = forShawl.filter(function(r){ return r.b === 'PIN'; })[0];
  assert(pin && pin.l > 1.5, '⭐ قوة العلاقة (lift) أكبر من ١ بوضوح');
})();

/* ============================================================
   ٢) ⭐⭐ ممنوع اقتراح حاجة مش في مخزون الفرع
   ============================================================ */
(function(){
  const inStock = [{ barcode:'PIN', name:'دبوس', price:50, qtyByBranch:{ 'الرحاب':4 } }];
  const outStock = [{ barcode:'PIN', name:'دبوس', price:50, qtyByBranch:{ 'الرحاب':0, 'مدينتي':9 } }];
  const cart = [{ barcode:'SHAWL', name:'شال' }];

  const ok = B.basketSuggest(MODEL, { cart:cart, products:inStock, branch:'الرحاب' });
  assert(ok && ok.barcode === 'PIN', 'بيقترح الدبوس لما يكون موجود');
  assertEq(B.basketSuggest(MODEL, { cart:cart, products:outStock, branch:'الرحاب' }), null,
    '⭐⭐ مفيش اقتراح لو الصنف خلص من الفرع (موجود في فرع تاني مش كفاية)');
  assertEq(B.basketSuggest(MODEL, { cart:cart, products:[], branch:'الرحاب' }), null,
    '⭐ ولا لو مش في الكتالوج خالص');
})();

/* ============================================================
   ٣) ⭐ اللي في السلة مايتقترحش تاني
   ============================================================ */
(function(){
  const prods = [{ barcode:'PIN', name:'دبوس', price:50, qtyByBranch:{ 'الرحاب':4 } }];
  assertEq(B.basketSuggest(MODEL, {
    cart:[{ barcode:'SHAWL', name:'شال' }, { barcode:'PIN', name:'دبوس' }],
    products:prods, branch:'الرحاب'
  }), null, '⭐ الصنف اللي في السلة خلاص مايتقترحش');
})();

/* ============================================================
   ٤) ⭐⭐ المرتجعات والاستبدال مش شراء
   ============================================================ */
(function(){
  const items = B.basketInvoiceItems({ items:[
    { barcode:'A', qty:1 },
    { barcode:'B', qty:1, isReturn:true },
    { barcode:'C', qty:1, isRedemption:true },
    { barcode:'D', qty:1, isRewardDiscount:true },
    { barcode:'E', qty:0 },
    { barcode:'',  qty:2 }
  ]});
  assertEq(items, ['A'], '⭐⭐ المرتجع والاستبدال والمكافأة والكمية صفر كلهم بره');

  // وفاتورة العكس كلها مستبعدة
  const withReverse = sampleSales().concat([
    { isReverse:true, items:[{barcode:'SHAWL',qty:1},{barcode:'PIN',qty:1}] }
  ]);
  const m2 = B.basketBuildModel(withReverse);
  assertEq(m2.invoices, MODEL.invoices, '⭐⭐ فاتورة العكس مبتتحسبش (كانت هتضاعف النمط)');
})();

/* ============================================================
   ٥) الصدفة مش نمط — الحد الأدنى للتكرار
   ============================================================ */
(function(){
  const rare = [
    { items:[{barcode:'X',qty:1},{barcode:'Y',qty:1}] },
    { items:[{barcode:'X',qty:1}] },
    { items:[{barcode:'Y',qty:1}] }
  ];
  const m = B.basketBuildModel(rare);
  assertEq(Object.keys(m.pairs).length, 0,
    '⭐⭐ صنفين اتقابلوا مرة واحدة = مش نمط (ده يوم مش معرفة)');

  /* ⚠️ وحتى لو نزّلنا حد التكرار، الزوج ده **بيفضل مرفوض** — لأن
     كل واحد فيهم بيتباع لوحده أكتر ما بيتباعوا مع بعض، يعني وجود
     الأول بيقلّل احتمال التاني (lift < 1). ده مش تشدد زيادة:
     اقتراح بعلاقة سالبة أسوأ من مفيش اقتراح. */
  const m1 = B.basketBuildModel(rare, { minPairCount: 1 });
  assertEq(Object.keys(m1.pairs).length, 0,
    '⭐⭐ علاقة سالبة (lift<1) بتترفض حتى مع حد تكرار ١');

  // والحد نفسه قابل للتغيير — نمط حقيقي بتكرار قليل بيعدّي لما ننزّله
  const few = [
    { items:[{barcode:'X',qty:1},{barcode:'Y',qty:1}] },
    { items:[{barcode:'X',qty:1},{barcode:'Y',qty:1}] },
    { items:[{barcode:'Z',qty:1},{barcode:'W',qty:1}] }
  ];
  assertEq(Object.keys(B.basketBuildModel(few).pairs).length, 0,
    'بالحد الافتراضي (٤ فواتير) لسه مرفوض');
  assert(Object.keys(B.basketBuildModel(few, { minPairCount: 2 }).pairs).length > 0,
    '⭐ والحد قابل للتغيير من الإعدادات');

  // فاتورة بصنف واحد مالهاش معلومة عن «مع إيه» بس بتتحسب في الإجمالي
  const single = B.basketBuildModel([{ items:[{barcode:'Z',qty:1}] }]);
  assertEq(single.invoices, 1, 'الفاتورة المفردة بتتعدّ');
  assertEq(Object.keys(single.pairs).length, 0, 'ومبتطلّعش أزواج');
})();

/* ============================================================
   ٦) الترتيب — آخر صنف اتضاف أولى
   ============================================================ */
(function(){
  const sales = [];
  for(let i = 0; i < 12; i++) sales.push({ items:[{barcode:'A',qty:1},{barcode:'A2',qty:1}] });
  for(let i = 0; i < 12; i++) sales.push({ items:[{barcode:'B',qty:1},{barcode:'B2',qty:1}] });
  const m = B.basketBuildModel(sales);
  const prods = [
    { barcode:'A2', name:'مع A', price:10, qtyByBranch:{ 'الرحاب':5 } },
    { barcode:'B2', name:'مع B', price:10, qtyByBranch:{ 'الرحاب':5 } }
  ];
  const s = B.basketSuggest(m, {
    cart:[{ barcode:'A', name:'أول حاجة' }, { barcode:'B', name:'آخر حاجة' }],
    products:prods, branch:'الرحاب'
  });
  assertEq(s.barcode, 'B2',
    '⭐ الاقتراح مبني على آخر صنف اتضاف (الكاشير لسه ماسكاه ومتكلمة فيه)');
  assertEq(s.from, 'آخر حاجة', 'والسبب بيسمّي الصنف الصح');
})();

/* ============================================================
   ٧) السبب بلغة الكاشير مش بلغة الإحصاء
   ============================================================ */
(function(){
  assert(/أغلب/.test(B.basketReason({ conf:0.7, from:'شال' })), 'نسبة عالية → «أغلب»');
  assert(/كتير/.test(B.basketReason({ conf:0.3, from:'شال' })), 'متوسطة → «كتير»');
  assert(/بيتاخد مع/.test(B.basketReason({ conf:0.1, from:'شال' })), 'قليلة → صيغة محايدة');
  assert(!/lift|confidence|support/i.test(B.basketReason({ conf:0.7, from:'شال' })),
    '⭐ مفيش مصطلح إحصائي قدام الكاشير');
})();

/* ============================================================
   ٨) معلومات المالك + قِدَم الموديل
   ============================================================ */
(function(){
  const top = B.basketTopPairs(MODEL, 10);
  assert(top.length > 0, 'جدول أقوى الارتباطات بيطلع');
  const keys = top.map(function(r){ return [r.a, r.b].sort().join('|'); });
  assertEq(keys.length, new Set(keys).size,
    '⭐ الزوج بيظهر **مرة واحدة** في الجدول (مش مرتين بالاتجاهين)');

  assertEq(B.basketIsStale(null), true, 'مفيش موديل = قديم');
  assertEq(B.basketIsStale({ builtAt: Date.now() }, Date.now(), 14), false, 'الجديد مش قديم');
  assertEq(B.basketIsStale({ builtAt: Date.now() - 30 * 86400000 }, Date.now(), 14), true,
    '⭐ بعد أسبوعين بيتقال للمالك يحدّثه (الموسم بيتغيّر)');
})();

/* ============================================================
   ٩) ⭐⭐ القراءات — الحتة اللي بتولّع فاتورة Firestore
   ============================================================ */
(function(){
  assert(/\.doc\(basketDocId\(\)\)\.get\(\)/.test(UI),
    '⭐⭐ الموديل **مستند واحد** بيتقري مرة — مش استعلام مع كل صنف');
  assert(/basketLoadModel/.test(ADMIN),
    '⭐ بيتحمّل مع المخزون عند فتح البرنامج');
  assert(/\.where\('createdAt', '>=', firebase\.firestore\.Timestamp\.fromMillis\(from\)\)/.test(UI),
    '⭐⭐ إعادة البناء بنافذة زمنية — من غيرها بيقرا كل فواتير المحل');
  assert(/\.limit\(4000\)/.test(UI), '⭐ وبسقف');
  assert(/if\(_basketBuilding\) return/.test(UI),
    '⭐ دوستين على الزرار = قراءتين. مقفولة.');
  assert(/hasPerm\('canViewReports'\)/.test(UI), 'وإعادة البناء بصلاحية');
  assert(/basketModelSize\(m\) > 700000/.test(UI),
    '⭐⭐ حد حجم المستند — الموديل الكبير بيتقلّم بدل ما الحفظ يفشل صامت');
})();

/* ============================================================
   ١٠) الربط في POS
   ============================================================ */
(function(){
  assert(!/id="basketStrip"/.test(HTML), 'v362: شريط اقتراحات الكاشير اتلغى من شاشة البيع');
  assert(HTML.indexOf('basket-core.js') < HTML.indexOf('basket-ui.js'),
    '⭐ المحرك قبل الواجهة');
  assert(/id="basketScreen"/.test(HTML), 'شاشة المالك موجودة');
  assert(/id="navBasket"/.test(HTML), 'وأيقونتها في التقارير');
  assert(!/basketRenderStrip\(\)/.test(SALE),
    'v362: renderCart مايرسمش اقتراحات على شاشة البيع');
  assert(/addToCart\(p\)/.test(UI),
    '⭐⭐ الإضافة بتعدّي على `addToCart` (فيها الخصومات وsid وتحديد الصف)');
  assert(!/cart\.push\(/.test(UI), '⭐ ومش بتلمس مصفوفة السلة بإيدها');
  assert(/basket_suggest_added/.test(UI),
    '⭐ بنسجّل الاقتراح المقبول — عشان نعرف بعدين إذا كان بيتقبل ولا بيتقفل');
  ['basketRenderStrip','basketAdd','basketDismiss','basketRebuild','goToBasketInsights',
   'basketLoadModel','renderBasketScreen','basketResetDismissed'
  ].forEach(function(fn){
    assert(new RegExp('window\\.' + fn + '\\s*=\\s*' + fn).test(UI),
      'القاعدة الذهبية — على window: ' + fn);
  });
  assert(!/firebase|db\./.test(fs.readFileSync(path.join(ROOT, 'pos', 'basket-core.js'), 'utf8')),
    '⭐ المحرك نضيف — مفيش Firestore جوّه');
})();

/* ============================================================
   ١١) الكاش
   ============================================================ */
(function(){
  const sw = fs.readFileSync(path.join(ROOT, 'pos', 'sw.js'), 'utf8');
  const m = sw.match(/store-apps-shell-v(\d+)/);
  assert(m && Number(m[1]) >= 312, '⭐ CACHE_NAME اترفع لـv312+');
})();

/* ============================================================
   ١٢) 📊 معلومات المالك — من نفس المسحة
   ------------------------------------------------------------
   اللي البلوك ده بيقفله:
     ١) حساب الأوقات بساعة **الجهاز** — المالك بيفتح من بره مصر،
        فالذروة الساعة ٨ مساءً كانت هتظهر ٢ ظهرًا. (درس سجل النشاط.)
     ٢) تقرير بقراءة تانية لنفس الفواتير = ضِعف الفاتورة مقابل صفر
        معلومة جديدة.
     ٣) جدول «الأصناف الراكدة» لوحده — معلومة محبطة من غير تصرّف.
        المفيد هو راكد **مربوط** بماشي.
   ============================================================ */
(function(){
  const base = Date.UTC(2026, 0, 5, 12, 0, 0);   // ١٢ ظهرًا UTC = ٢ ظهرًا بالقاهرة
  const sales = [];
  for(let i = 0; i < 12; i++) sales.push({ total:500, createdAtMs: base,
    items:[{barcode:'FAST',qty:2,price:200},{barcode:'SLOW',qty:1,price:100}] });
  for(let i = 0; i < 25; i++) sales.push({ total:300, createdAtMs: base,
    items:[{barcode:'FAST',qty:2,price:300}] });
  for(let i = 0; i < 40; i++) sales.push({ total:200, createdAtMs: base,
    items:[{barcode:'OTHER',qty:3,price:70}] });

  const m = B.basketBuildModel(sales);
  const ins = B.basketInsights(sales, m);

  assertEq(ins.invoices, 77, 'كل الفواتير اتحسبت');
  assertEq(ins.singlePct, 84, '⭐ نسبة الفواتير بصنف واحد (كل واحدة فرصة ضايعة)');
  assert(ins.avgBasket > 2 && ins.avgBasket < 3, 'متوسط القطع معقول');
  assertEq(ins.avgTicket, Math.round(ins.money / ins.invoices), 'متوسط الفاتورة متسق');

  // 🕒 ⭐⭐ التوقيت — القاهرة صراحةً
  const peak = B.basketPeak(ins.byHour);
  assertEq(peak.idx, 14,
    '⭐⭐ الذروة بتوقيت القاهرة (٢ ظهرًا) — مش ساعة جهاز المالك اللي بره مصر');
  assertEq(B.cairoParts(base).hour, 14, 'والدالة نفسها بترجّع ساعة القاهرة');
  assertEq(ins.byHour.length, 24, '٢٤ ساعة');
  assertEq(ins.byDow.length, 7, 'و٧ أيام');

  // 🎯 فرصة العرض
  assert(ins.opportunities.length > 0, '⭐⭐ فرص العرض بتطلع (راكد مربوط بماشي)');
  assertEq(ins.opportunities[0].slow, 'SLOW', 'البطيء هو المقترح');
  assertEq(ins.opportunities[0].fast, 'FAST', 'والماشي هو المرساة');
  assert(ins.opportunities[0].lift > 1.5, 'وبعلاقة قوية');
  assert(!ins.opportunities.some(function(r){ return r.slow === r.fast; }),
    '⭐ الصنف مايتقترحش مع نفسه');

  // ⏱️ وقت الفاتورة من أي شكل
  assertEq(B.saleTimeMs({ createdAtMs: 123 }), 123, 'الطابع المحلي');
  assertEq(B.saleTimeMs({ createdAt: { seconds: 5 } }), 5000, 'وطابع Firestore');
  assertEq(B.saleTimeMs({ createdAt: { toMillis: function(){ return 77; } } }), 77, 'وTimestamp');
  assertEq(B.saleTimeMs({}), 0, '⭐ فاتورة من غير وقت مبتكسرش الحساب');

  // 🔁 المرتجعات مستبعدة من الإحصاء كمان
  const withRev = sales.concat([{ isReverse:true, total:-500, createdAtMs: base,
    items:[{barcode:'FAST',qty:2,price:200}] }]);
  assertEq(B.basketInsights(withRev, m).invoices, ins.invoices,
    '⭐⭐ فاتورة العكس مبتتحسبش في الإحصاء');
})();

/* ============================================================
   ١٣) الربط — قراءة واحدة وعدّاد القبول
   ============================================================ */
(function(){
  assert(/m\.insights = basketInsights\(sales, m, \{ now: Date\.now\(\) \}\)/.test(UI),
    '⭐⭐ المعلومات بتتحسب من **نفس** مسحة بناء الموديل — مفيش قراءة تانية');
  assert(/function basketInsightsHTML/.test(UI), 'ولوحة العرض موجودة');
  assert(/basketStat\('accepted'\)/.test(UI) && /basketStat\('dismissed'\)/.test(UI),
    '⭐⭐ قبول ورفض الاقتراح بيتعدّوا — من غيرهم مفيش طريقة نعرف الميزة شغالة ولا لأ');
  assert(/FieldValue\.increment\(1\)/.test(UI),
    '⭐ العدّاد بالزيادة الذرّية (مش قراءة ثم كتابة)');
  assert(/بتوقيت القاهرة|القاهرة/.test(UI), '⭐ والعرض بيقول للمالك إن التوقيت قاهرة');
  assert(/فرص عرض/.test(UI), 'وجدول الفرص');
})();
