// ============================================================
// 📒 test-cash-ledger — دفتر اليومية (office)
//
// ده شيت فلوس المالك بيحكم بيه على مصروفه — فأي رقم غلط هنا
// بيتحوّل لقرار غلط. الاختبارات مركّزة على اللي لو باظ الرقم يكدب:
//   · الفيزا مش كاش · تاني يوم عمل · الحساب المزدوج · التوقيت
//   · التعديل اليدوي بيغلب · العدّ الفعلي بيطلّع الفرق
//
// ⚠️ TZ متثبّت على القاهرة في run.js — من غيره النتايج بتتغيّر
//    حسب ساعة الجهاز (الدرس اللي اتعلمناه من تطبيق sales).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'Office', 'office.js'), 'utf8');

// ⚠️ استخراج بالأقواس المتوازنة مش regex — regex اتكسر قبل كده
//    وطلّع فشل وهمي شكله باجات حقيقية (§0).
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

const box = { Date: Date, Number: Number, Math: Math, String: String, Object: Object,
              Array: Array, isNaN: isNaN, Intl: Intl, console: console,
              JSON: JSON, parseInt: parseInt };
box.globalThis = box;
vm.createContext(box);

vm.runInContext("const OF_TZ='Africa/Cairo'; let _ofDayCut=6;", box);
[ 'const PAYMOB_FEE_PCT',
  'const OF_WEEKEND_DEFAULT',
  'const OF_LEDGER_FIELDS',
  'const OF_GOLD_STALE_MS',
  'const OF_FREEZE_AFTER_DAYS',
  'const OF_SALES_WINDOW_DAYS' ].forEach(function(h){
  const i = src.indexOf(h);
  assert(i >= 0, 'لقينا ' + h);
  // ⚠️ التعريف ممكن يبقى على أكتر من سطر — بناخد لحد الفاصلة المنقوطة
  //    مش لحد آخر السطر (أول محاولة اتكسرت هنا بالظبط).
  if(i >= 0) vm.runInContext(src.slice(i, src.indexOf(';', i) + 1), box);
});
[ 'function _ofShopParts(', 'function _ofOffsetMs(', 'function ofBizDayRange(',
  'function _saleMs(', 'function _ohTs(', 'function paymobGrossFromNet(',
  'function paymobEffectivePct(',
  'function ofDayKeyOf(', 'function ofDayShift(', 'function ofDowOf(',
  'function ofIsWeekend(', 'function ofNextBizDay(', 'function ofSettleDayFor(',
  'function ofCollectDays(', 'function ofPredictSettlements(',
  'function ofCashLedger(', 'function ofFreezeDue(',
  'function ofGoldValue(', 'function ofWealth('
].forEach(function(h){
  const f = extractFn(src, h);
  assert(!!f, 'لقينا ' + h);
  if(f) vm.runInContext(f, box);
});

const ofCashLedger    = vm.runInContext('ofCashLedger', box);
const ofSettleDayFor  = vm.runInContext('ofSettleDayFor', box);
const ofNextBizDay    = vm.runInContext('ofNextBizDay', box);
const ofIsWeekend     = vm.runInContext('ofIsWeekend', box);
const ofDayKeyOf      = vm.runInContext('ofDayKeyOf', box);
const ofGoldValue     = vm.runInContext('ofGoldValue', box);
const ofWealth        = vm.runInContext('ofWealth', box);
const ofFreezeDue     = vm.runInContext('ofFreezeDue', box);

// أدوات
const at = (y, m, d, hh) => Date.UTC(y, m - 1, d, (hh == null ? 12 : hh) - 3, 0);  // القاهرة صيفًا = +3
const sale = (ms, cash, visa) => ({ createdAt:{ toMillis:()=>ms }, payments:{ cash:cash||0, visa:visa||0 } });
const money = (ms, amount) => ({ ts: ms, amount: amount });
const rowOf = (L, key) => L.rows.filter(r => r.key === key)[0];

// ٢٠٢٦: ٦ أغسطس = خميس · ٧ جمعة · ٨ سبت · ٩ أحد
const THU = '2026-08-06', FRI = '2026-08-07', SAT = '2026-08-08', SUN = '2026-08-09';

// ============================================================
// ١) 🗓️ إجازة الأسبوع وأول يوم عمل
// ============================================================
(function(){
  assert(!ofIsWeekend(THU, {}), 'الخميس يوم عمل');
  assert(ofIsWeekend(FRI, {}),  'الجمعة إجازة');
  assert(ofIsWeekend(SAT, {}),  'السبت إجازة');
  assert(!ofIsWeekend(SUN, {}), 'الأحد يوم عمل');
  assertEq(ofNextBizDay(THU, {}), SUN, '⭐ أول يوم عمل بعد الخميس = الأحد (الجمعة والسبت مقفولين)');
  assertEq(ofNextBizDay(SUN, {}), '2026-08-10', 'وبعد الأحد = الإتنين');
})();

// ============================================================
// ٢) ⭐⭐ مبيعات الخميس بتنزل الأحد — الطلب الأصلي بالنص
// ============================================================
(function(){
  assertEq(ofSettleDayFor(THU, {}), SUN, '⭐⭐ فيزا الخميس بتنزل الأحد');
  assertEq(ofSettleDayFor(SUN, {}), '2026-08-10', 'وفيزا الأحد بتنزل الإتنين');
  // الفرع فاتح الجمعة، بس البنك لأ — فأول يوم عمل بعد الجمعة هو الأحد،
  // يعني مبيعات الخميس والجمعة بينزلوا **مع بعض** يوم الأحد.
  assertEq(ofSettleDayFor(FRI, {}), SUN,
    '⭐ وفيزا الجمعة كمان بتنزل الأحد — مع فلوس الخميس');
  assertEq(ofSettleDayFor(SAT, {}), SUN, 'وفيزا السبت برضه الأحد');
  // إعداد مختلف: تأخير يومين عمل
  assertEq(ofSettleDayFor(THU, { settleLagBizDays:2 }), '2026-08-10',
    'وبإعداد يومين عمل: خميس → إتنين');
})();

// ============================================================
// ٣) 💳 الفيزا مش كاش — أهم سطر في الحساب
// ============================================================
(function(){
  const base = { amount: 1000, atMs: at(2026, 8, 6, 7) };
  const L = ofCashLedger(base, { sales:[ sale(at(2026,8,6,15), 300, 700) ] },
    {}, { predict:false }, at(2026, 8, 6, 20), 0);
  const r = rowOf(L, THU);
  assertEq(r.val.cashSales, 300, '⭐⭐ الكاش بس اللي بيدخل الدرج');
  assertEq(r.val.visaSales, 700, 'والفيزا متسجّلة لكن في عمود لوحدها');
  assertEq(r.balance, 1300, '⭐⭐ الرصيد زاد بالكاش بس — الفيزا لسه عند Paymob');
})();

// ============================================================
// ٤) 🔮 التوقّع بينزل في اليوم الصح وبالصافي
// ============================================================
(function(){
  const base = { amount: 0, atMs: at(2026, 8, 6, 7) };
  const data = { sales:[ sale(at(2026,8,6,15), 0, 10000) ] };
  const L = ofCashLedger(base, data, {}, {}, at(2026, 8, 6, 20), 5);
  assertEq(rowOf(L, THU).pmExpected, 0, 'يوم البيع نفسه مفيش فلوس نازلة');
  assertEq(rowOf(L, FRI).pmExpected, 0, 'ولا الجمعة');
  assertEq(rowOf(L, SAT).pmExpected, 0, 'ولا السبت');
  const sun = rowOf(L, SUN);
  assert(sun.pmExpected > 0, '⭐⭐ المتوقّع بينزل الأحد');
  assertEq(sun.pmExpected, 9806, 'وبالصافي بعد ١.٩٤% (١٠٠٠٠ − ١٩٤)');
  assertEq(sun.pmFrom[0], THU, 'ومكتوب جاي من مبيعات أنهي يوم');

  // ⭐ الرصيد المؤكد مايتأثرش بالتوقّع — الفصل ده هو الحماية
  assertEq(sun.balance, 0, '⭐⭐ الرصيد المؤكد صفر — الفلوس لسه ماوصلتش');
  assertEq(sun.balanceExp, 9806, 'والرصيد المتوقّع فيه الفلوس');
})();

// ============================================================
// ٥) 🔴 الحساب المزدوج — أخطر باج ممكن يحصل هنا
// ============================================================
(function(){
  const base = { amount: 0, atMs: at(2026, 8, 6, 7) };
  const data = {
    sales: [ sale(at(2026,8,6,15), 0, 10000) ],
    // التحويل وصل فعلًا يوم الأحد
    settlements: [ { ts: at(2026,8,9,13), net: 9800, gross: 10000, forDay: THU } ]
  };
  const L = ofCashLedger(base, data, {}, {}, at(2026, 8, 9, 20), 5);
  const sun = rowOf(L, SUN);
  assertEq(sun.val.pmIn, 9800, 'التحويل الحقيقي اتسجّل');
  assertEq(sun.pmExpected, 0, '⭐⭐ والمتوقّع اتلغى — مفيش عدّ مرتين');
  assertEq(sun.balance, 9800, '⭐⭐ الرصيد = التحويل الحقيقي مرة واحدة بالظبط');
  assertEq(sun.balanceExp, 9800, 'والمتوقّع بنفس الرقم — مفيش زيادة وهمية');

  // 🔒 السقف الصلب: مفيش توقّع بعد ما كل المستحق اتحصّل
  const after = L.rows.filter(r => r.key > SUN && r.pmExpected > 0);
  assertEq(after.length, 0, '🔒 مفيش أي توقّع بعد ما الرصيد المستحق خلص');
  assertEq(L.outstanding, 0, 'والمستحق عند Paymob بقى صفر');
})();

// ============================================================
// ٦) 🔒 السقف الصلب لوحده — حتى لو الطبقة الأولى غلطت
// ============================================================
(function(){
  const base = { amount: 0, atMs: at(2026, 8, 6, 7) };
  const data = {
    sales: [ sale(at(2026,8,6,15), 0, 1000) ],
    // تحويل من غير forDay وبتاريخ قديم — الطبقة الأولى مش هتمسكه
    settlements: [ { ts: at(2026,8,6,23), net: 980, gross: 1000 } ]
  };
  const L = ofCashLedger(base, data, {}, {}, at(2026, 8, 10, 20), 5);
  const totalPred = L.rows.reduce((a, r) => a + r.pmExpected, 0);
  assertEq(totalPred, 0, '🔒 السقف منع أي توقّع — المستحق اتحصّل كله');
})();

// ============================================================
// ٧) ✏️ التعديل اليدوي بيغلب المحسوب (شيت إكسل)
// ============================================================
(function(){
  const base = { amount: 1000, atMs: at(2026, 8, 6, 7) };
  const data = { sales:[ sale(at(2026,8,6,15), 300, 0) ],
                 expenses:[ money(at(2026,8,6,16), 50) ] };
  const ov = { [THU]: { ov: { cashSales: 350, expenses: 70 } } };
  const L = ofCashLedger(base, data, ov, { predict:false }, at(2026, 8, 6, 20), 0);
  const r = rowOf(L, THU);
  assertEq(r.val.cashSales, 350, '✏️ الرقم اليدوي غلب المحسوب');
  assertEq(r.raw.cashSales, 300, '⭐ والمحسوب الأصلي محفوظ للمراجعة');
  assert(r.edited.cashSales === true && r.edited.expenses === true,
    '⭐ الخانات المتعدّلة معلّمة (عشان تبان في الشاشة)');
  assert(r.edited.salaries === false, 'واللي ماتعدّلش مش معلّم');
  assertEq(r.balance, 1280, 'والرصيد اتحسب بالأرقام اليدوية (١٠٠٠ + ٣٥٠ − ٧٠)');

  // ✏️ صفر يدوي = صفر فعلي، مش "مفيش تعديل"
  const zero = ofCashLedger(base, data, { [THU]: { ov: { cashSales: 0 } } },
    { predict:false }, at(2026, 8, 6, 20), 0);
  assertEq(rowOf(zero, THU).val.cashSales, 0, '⭐ لو كتب صفر، الصفر بيتحسب (مش بيترجع للمحسوب)');
})();

// ============================================================
// ٨) ✏️ التعديل اليدوي على خانة Paymob بيلغي التوقّع
// ============================================================
(function(){
  const base = { amount: 0, atMs: at(2026, 8, 6, 7) };
  const data = { sales:[ sale(at(2026,8,6,15), 0, 10000) ] };
  const L = ofCashLedger(base, data, { [SUN]: { ov: { pmIn: 9750 } } },
    {}, at(2026, 8, 9, 20), 5);
  const sun = rowOf(L, SUN);
  assertEq(sun.val.pmIn, 9750, 'الرقم اللي كتبه بإيده');
  assertEq(sun.pmExpected, 0, '⭐⭐ والتوقّع اتلغى — مفيش ٩٧٥٠ + ٩٨٠٦');
  assertEq(sun.balance, 9750, 'والرصيد = اللي كتبه بس');
})();

// ============================================================
// ٩) 🔍 العدّ الفعلي بيطلّع الفرق ويصحّح المسار
// ============================================================
(function(){
  const base = { amount: 1000, atMs: at(2026, 8, 6, 7) };
  const data = { sales:[ sale(at(2026,8,6,15), 500, 0), sale(at(2026,8,9,15), 200, 0) ] };
  const L = ofCashLedger(base, data, { [THU]: { counted: 1400 } },
    { predict:false }, at(2026, 8, 9, 20), 0);
  const thu = rowOf(L, THU);
  assertEq(thu.variance, -100, '⭐⭐ عدّ ١٤٠٠ والمفروض ١٥٠٠ → عجز ١٠٠ بيتقال بصوت عالي');
  assertEq(thu.balance, 1400, 'والرصيد اتصحّح للرقم المعدود');
  assertEq(rowOf(L, SUN).balance, 1600, '⭐ والأيام اللي بعده كمّلت من الرقم الصحيح (١٤٠٠ + ٢٠٠)');
  assertEq(rowOf(L, SUN).variance, null, 'واليوم اللي ماتعدّش مالوش فرق');

  // من غير العدّ، الرصيد بيفضل على المحسوب
  const no = ofCashLedger(base, data, {}, { predict:false }, at(2026, 8, 9, 20), 0);
  assertEq(rowOf(no, SUN).balance, 1700, 'من غير عدّ: ١٠٠٠ + ٥٠٠ + ٢٠٠');
})();

// ============================================================
// ١٠) 🧾 المصاريف والرواتب والسلف بتتخصم من اليوم الصح
// ============================================================
(function(){
  const base = { amount: 5000, atMs: at(2026, 8, 6, 7) };
  const data = {
    expenses:   [ money(at(2026,8,6,14), 200) ],
    salaryPays: [ money(at(2026,8,9,14), 3000) ],
    advances:   [ money(at(2026,8,6,18), 100) ],
    rewards:    [ { ts: at(2026,8,9,14), amount: 250, status:'approved' },
                  { ts: at(2026,8,9,15), amount: 999, status:'pending' } ]
  };
  const L = ofCashLedger(base, data, {}, { predict:false }, at(2026, 8, 9, 20), 0);
  const thu = rowOf(L, THU), sun = rowOf(L, SUN);
  assertEq(thu.val.expenses, 200, '🧾 المصروف في يومه');
  assertEq(thu.val.advances, 100, '🤝 والسلفة في يومها');
  assertEq(thu.out, 300, 'وإجمالي الخارج يوم الخميس');
  assertEq(sun.val.salaries, 3000, '💼 والراتب في يومه');
  assertEq(sun.val.rewards, 250, '⭐ المكافأة المعتمدة بس — المستنية ماخرجتش من الدرج');
  assertEq(sun.balance, 1450, 'الرصيد النهائي (٥٠٠٠ − ٣٠٠ − ٣٢٥٠)');
})();

// ============================================================
// ١١) 🕒 التوقيت — الفلوس بيوم المحل مش بساعة الجهاز
// ============================================================
(function(){
  // فاتورة ٢ الفجر يوم ٧ = لسه يوم ٦ (الساعة الفاصلة ٦ ص)
  assertEq(ofDayKeyOf(at(2026, 8, 7, 2)), THU,
    '⭐⭐ فاتورة الفجر بتتحسب على اليوم اللي فات — زي تقفيل الفرع بالظبط');
  assertEq(ofDayKeyOf(at(2026, 8, 7, 7)), FRI, 'وبعد الساعة الفاصلة يوم جديد');

  const base = { amount: 0, atMs: at(2026, 8, 6, 7) };
  const L = ofCashLedger(base, { sales:[ sale(at(2026,8,7,2), 500, 0) ] },
    {}, { predict:false }, at(2026, 8, 7, 20), 0);
  assertEq(rowOf(L, THU).val.cashSales, 500, '⭐ وكاش الفجر اتحط في يوم الخميس');
  assertEq(rowOf(L, FRI).val.cashSales, 0, 'ومش في الجمعة');
})();

// ============================================================
// ١٢) 📅 الشيت متصل — كل يوم له سطر حتى لو مفيش حركة
// ============================================================
(function(){
  const base = { amount: 100, atMs: at(2026, 8, 6, 7) };
  const L = ofCashLedger(base, {}, {}, { predict:false }, at(2026, 8, 9, 20), 0);
  assertEq(L.rows.length, 4, '٤ أيام من الخميس للأحد — مفيش يوم ناقص');
  assertEq(L.rows[0].key, THU, 'والترتيب من الأقدم');
  assertEq(L.rows[3].key, SUN, 'للأحدث');
  assert(L.rows.every(r => r.balance === 100), 'ومفيش حركة = الرصيد ثابت');
  assert(L.rows[1].weekend === true && L.rows[2].weekend === true,
    'وأيام الإجازة معلّمة عشان تبان في الشاشة');
})();

// ============================================================
// ١٣) 🥇 الدهب — بسعر الشراء وبطابع وقته
// ============================================================
(function(){
  const now = at(2026, 8, 10, 12);
  const g = ofGoldValue({ goldGrams: 100, goldBuyPrice: 6960, goldPriceAt: now - 3600000 }, now);
  assertEq(g.value, 696000, '🥇 ١٠٠ جرام × ٦٩٦٠ = ٦٩٦٬٠٠٠');
  assert(g.stale === false, 'وسعر عمره ساعة = لسه صالح');

  const old = ofGoldValue({ goldGrams: 100, goldBuyPrice: 6960, goldPriceAt: now - 3*86400000 }, now);
  assert(old.stale === true, '⭐ سعر عمره ٣ أيام بيتعلّم "قديم" بدل ما يتحسب كأنه لحظي');
  const none = ofGoldValue({ goldGrams: 100, goldBuyPrice: 6960 }, now);
  assert(none.stale === true, 'وسعر من غير طابع وقت = قديم برضه');
  assertEq(ofGoldValue({}, now).value, 0, 'ومن غير دهب = صفر');
})();

// ============================================================
// ١٤) 🧮 إجمالي الثروة — تلات طبقات متفصولة
// ============================================================
(function(){
  const base = { amount: 1000, atMs: at(2026, 8, 6, 7) };
  const data = { sales:[ sale(at(2026,8,6,15), 500, 10000) ] };
  const L = ofCashLedger(base, data, {}, { predict:false }, at(2026, 8, 6, 20), 0);
  const w = ofWealth(L, { goldGrams: 10, goldBuyPrice: 7000, goldPriceAt: at(2026,8,6,19) },
    at(2026, 8, 6, 20));
  assertEq(w.cash, 1500, '💵 الكاش في إيدك');
  assertEq(w.paymobGross, 10000, '💳 والمستحق عند Paymob متفصول');
  assertEq(w.paymobNet, 9806, 'وبالصافي المتوقّع بعد العمولة');
  assertEq(w.gold, 70000, '🥇 والدهب متفصول');
  assertEq(w.total, 81306, '🧮 والإجمالي = ١٥٠٠ + ٩٨٠٦ + ٧٠٠٠٠');
  assert(w.cash !== w.total, '⭐ الإجمالي مش هو الكاش — الفصل واضح للمالك');
})();

// ============================================================
// ١٥) 🆕 التصفير — البداية من نقطة نضيفة
// ============================================================
(function(){
  // كل اللي قبل نقطة البداية مالوش أي أثر
  const base = { amount: 2000, atMs: at(2026, 8, 9, 7) };
  const data = { sales:[ sale(at(2026,8,6,15), 9999, 0),      // قديمة — مالهاش لازمة
                         sale(at(2026,8,9,15), 300, 0) ],
                 expenses:[ money(at(2026,8,6,14), 500) ] };   // قديم — مالهوش لازمة
  const L = ofCashLedger(base, data, {}, { predict:false }, at(2026, 8, 9, 20), 0);
  assertEq(L.rows.length, 1, '⭐ الدفتر بيبدأ من يوم التصفير — مفيش أيام قبله');
  assertEq(L.rows[0].key, SUN, 'وأول يوم هو يوم البداية');
  assertEq(L.rows[0].val.cashSales, 300, '⭐⭐ والمبيعات القديمة مش داخلة');
  assertEq(L.rows[0].val.expenses, 0, 'ولا المصاريف القديمة');
  assertEq(L.rows[0].balance, 2300, 'الرصيد = اللي حدّده + حركة اليوم بس');
})();

// ============================================================
// ١٦) 📈 النسبة الفعلية بتتعلّم من التحويلات الحقيقية
// ============================================================
(function(){
  const base = { amount: 0, atMs: at(2026, 8, 6, 7) };
  const data = {
    sales: [ sale(at(2026,8,6,15), 0, 5000), sale(at(2026,8,9,15), 0, 10000) ],
    settlements: [ { ts: at(2026,8,9,13), net: 4911.85, gross: 5000, forDay: THU } ]
  };
  const L = ofCashLedger(base, data, {}, {}, at(2026, 8, 9, 20), 5);
  assertEq(L.effPct, 1.76, '⭐ النسبة اتعلّمت من التحويل الحقيقي (١.٧٦%) مش ١.٩٤ الثابتة');
  const mon = rowOf(L, '2026-08-10');
  assertEq(mon.pmExpected, 9824, 'والتوقّع اتحسب بالنسبة المتعلّمة');
})();

// ============================================================
// ١٧) 🧊 التجميد — الحماية من "الشيت بيكدب بعد شهر"
//
// office بيحمّل مبيعات آخر ٣٠ يوم بس. من غير التجميد، أول ما اليوم
// يعدّي الـ٣٠ فواتيره تقع بره النافذة وسطره يرجع صفر من غير أي رسالة.
// ============================================================
(function(){
  const base = { amount: 0, atMs: at(2026, 7, 1, 7) };
  const data = { sales:[ sale(at(2026,7,2,15), 800, 0) ] };
  const now = at(2026, 8, 10, 12);
  const L = ofCashLedger(base, data, {}, { predict:false }, now, 0);

  const due = ofFreezeDue(L, {}, now);
  const keys = due.map(x => x.key);
  assert(keys.indexOf('2026-07-02') >= 0, '⭐ يوم عمره ٣٩ يوم محتاج يتجمّد');
  assert(keys.indexOf('2026-08-10') < 0, '⛔ ومبنجمّدش النهاردة — لسه بيتحرك');
  assert(keys.indexOf('2026-08-09') < 0, '⛔ ولا إمبارح — لسه بدري على العتبة');
  const jul2 = due.filter(x => x.key === '2026-07-02')[0];
  assertEq(jul2.frozen.cashSales, 800, 'والأرقام المحفوظة هي المحسوبة وقت التجميد');

  // 🧊 بعد التجميد: حتى لو المبيعات اختفت من النافذة، الرقم ثابت
  const ov = { '2026-07-02': { frozen: { cashSales: 800 } } };
  const after = ofCashLedger(base, { sales: [] }, ov, { predict:false }, now, 0);
  const r = after.rows.filter(x => x.key === '2026-07-02')[0];
  assertEq(r.val.cashSales, 800, '⭐⭐ الفواتير خرجت من النافذة والرقم فضل صح');
  assert(r.frozen === true, 'واليوم معلّم إنه مقفول');
  assertEq(after.rows[after.rows.length - 1].balance, 800, 'والرصيد النهائي محافظ على قيمته');

  // 🔴 نيجاتيف — من غير تجميد الرقم بيضيع فعلًا
  const naked = ofCashLedger(base, { sales: [] }, {}, { predict:false }, now, 0);
  const nr = naked.rows.filter(x => x.key === '2026-07-02')[0];
  assertEq(nr.val.cashSales, 0, '🔴 نيجاتيف — من غير تجميد اليوم بيرجع صفر (الباج حقيقي)');

  // ✏️ التعديل اليدوي لسه بيغلب المتجمّد
  const both = ofCashLedger(base, { sales: [] },
    { '2026-07-02': { frozen:{ cashSales: 800 }, ov:{ cashSales: 950 } } },
    { predict:false }, now, 0);
  const br = both.rows.filter(x => x.key === '2026-07-02')[0];
  assertEq(br.val.cashSales, 950, '✏️ التعديل اليدوي بيغلب المتجمّد');
  assertEq(br.raw.cashSales, 800, 'والمتجمّد فاضل كمرجع للمراجعة');

  // مبنجمّدش اللي متجمّد
  assertEq(ofFreezeDue(L, { '2026-07-02': { frozen:{ cashSales: 800 } } }, now)
    .filter(x => x.key === '2026-07-02').length, 0, '⛔ ومبنعيدش تجميد اللي اتجمّد');
})();
