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
  // ⚠️⚠️ يوم ٢ يوليو عمره ٣٩ يوم — خرج خلاص من نافذة الـ٣٠، يعني فواتيره
  //    مش محمّلة وأرقامه دلوقتي **أصفار كدّابة**. تجميده = تثبيت الصفر للأبد.
  assert(keys.indexOf('2026-07-02') < 0,
    '⭐⭐ اليوم اللي خرج من النافذة مبيتجمّدش — أرقامه مش موثوقة');
  assert(keys.indexOf('2026-07-20') >= 0,
    '⭐ اللي لسه جوه النافذة وعدّى العتبة بيتجمّد (٢١ يوم)');
  assert(keys.indexOf('2026-08-10') < 0, '⛔ ومبنجمّدش النهاردة — لسه بيتحرك');
  assert(keys.indexOf('2026-08-09') < 0, '⛔ ولا إمبارح — لسه بدري على العتبة');
  // 🚧 واليوم ده بيتعلّم في الشيت بدل ما يتعرض كأنه حقيقة
  const oldRow = L.rows.filter(x => x.key === '2026-07-02')[0];
  assert(oldRow.untrusted === true, '🚧 ومعلّم إن أرقامه ناقصة');
  const recent = L.rows.filter(x => x.key === '2026-08-05')[0];
  assert(recent.untrusted === false, 'واليوم القريب مش معلّم');

  // والأرقام المحفوظة وقت التجميد هي المحسوبة
  const L2 = ofCashLedger({ amount:0, atMs: at(2026,7,19,7) },
    { sales:[ sale(at(2026,7,20,15), 640, 0) ] }, {}, { predict:false }, now, 0);
  const d2 = ofFreezeDue(L2, {}, now).filter(x => x.key === '2026-07-20')[0];
  assertEq(d2.frozen.cashSales, 640, 'والأرقام المحفوظة هي المحسوبة وقت التجميد');

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

// ============================================================
// ١٨) 🥇 دالة سعر الدهب — حراس "السعر الغلط أوحش من مفيش سعر"
//     (functions/goldPriceUpdate.js — بتتنشر من echarpe-push)
// ============================================================
(function(){
  const fnPath = path.join(ROOT, 'functions', 'goldPriceUpdate.js');
  assert(fs.existsSync(fnPath), 'ملف الدالة موجود في الريبو');
  if(!fs.existsSync(fnPath)) return;
  const gsrc = fs.readFileSync(fnPath, 'utf8');

  const gbox = { Math: Math, Number: Number, isFinite: isFinite, String: String };
  vm.createContext(gbox);
  const f = extractFn(gsrc, 'function decideGoldPrice(');
  assert(!!f, 'لقينا decideGoldPrice');
  if(!f) return;
  vm.runInContext('const SANE_MIN=1000, SANE_MAX=30000, MAX_JUMP_PCT=15;', gbox);
  vm.runInContext(f, gbox);
  const decide = vm.runInContext('decideGoldPrice', gbox);

  // ✅ الحالة العادية
  const ok = decide([{ buy: 6960, sell: 6983, source: 'custom' }], { goldBuyPrice: 6900 });
  assert(ok.ok === true, '✅ سعر قريب من السابق بيعدّي');
  assertEq(ok.buy, 6960, 'وبالقيمة الصح');

  // 🛡️ القفزة — الرقم ده **جوه** حدود العقل، فالحارس الوحيد اللي
  //    بيمسكه هو حارس القفزة. (٢١٦٠٠٠ بتتمسك بحدود العقل قبل كده،
  //    فهي مش اختبار حقيقي لحارس القفزة.)
  const jump = decide([{ buy: 12000, source: 'custom' }], { goldBuyPrice: 6960 });
  assert(jump.ok === false, '⭐⭐ قفزة ٧٢% مرفوضة — المصدر غالبًا باظ');
  assert(/قفزة/.test(jump.reason || ''), 'والسبب مكتوب صراحة');
  assertEq(jump.suspect, 12000, 'والرقم المشبوه محفوظ للمراجعة');

  // وسعر الأوقية بالغلط بيتمسك بحدود العقل
  const oz = decide([{ buy: 216000, source: 'custom' }], { goldBuyPrice: 6960 });
  assert(oz.ok === false, '⭐ وسعر أوقية بدل جرام مرفوض برضه');

  const small = decide([{ buy: 7100, source: 'custom' }], { goldBuyPrice: 6960 });
  assert(small.ok === true, '⭐ بس تحرك ٢% طبيعي بيعدّي عادي');

  // 🛡️ حدود العقل
  assert(decide([{ buy: 5, source:'x' }], {}).ok === false, '🛡️ رقم صغير مستحيل مرفوض');
  assert(decide([{ buy: 999999, source:'x' }], {}).ok === false, '🛡️ ورقم كبير مستحيل مرفوض');
  assert(decide([{ buy: 0, source:'x' }], {}).ok === false, 'وصفر مرفوض');
  assert(decide([], {}).ok === false, 'ومفيش مصادر = مفيش كتابة');
  assert(decide([{ buy: NaN, source:'x' }], {}).ok === false, 'وNaN مرفوض');

  // ⭐ أول مرة (مفيش سعر سابق) — حارس القفزة مبيمنعش البداية
  const first = decide([{ buy: 6960, source:'custom' }], {});
  assert(first.ok === true, '⭐ أول تشغيل من غير سعر سابق بيعدّي');

  // 🛡️ الشراء عمره ما يزيد عن البيع
  const rev = decide([{ buy: 7000, sell: 6500, source:'x' }], {});
  assertEq(rev.sell, 0, '🛡️ بيانات متعكوسة (شراء > بيع) → بنتجاهل سعر البيع');

  // 🔒 القفل اليدوي والاحتفاظ بالسعر القديم
  assert(/goldManualLock === true/.test(gsrc),
    '⭐⭐ فيه قفل يدوي — رقم المالك مبيتمسحش بالأتمتة');
  assert(/goldLastError/.test(gsrc), 'والرفض بيتسجّل');
  assert(!/goldBuyPrice: 0/.test(gsrc),
    '⛔ ومفيش أي مسار بيكتب صفر — السعر القديم بيفضل مكانه');
  assert(/Africa\/Cairo/.test(gsrc), '⏰ والجدولة بتوقيت القاهرة');
})();

// ============================================================
// ١٩) 🎁 دين كروت الهدايا — "فلوس في إيدك مش بتاعتك"
//
// 🔴 من غير الحتة دي الشيت بيكدب في اتجاهين مع بعض:
//    · يوم البيع: بيعدّ الكارت إيراد وهو لسه دين
//    · يوم الصرف: بيعدّه تاني لما البضاعة تخرج
//    يعني ٥٠٠ بتتحسب ١٠٠٠، والمالك يصرف على أساس فلوس مش بتاعته.
// ============================================================
(function(){
  const gcSale = (ms, cash, gcValue) => ({
    createdAt:{ toMillis:()=>ms }, payments:{ cash: cash || 0 },
    items: [{ name:'🎁 كارت هدية', price: gcValue, qty:1, isGiftCard:true }]
  });
  const gcSpend = (ms, cash, spent) => ({
    createdAt:{ toMillis:()=>ms }, payments:{ cash: cash || 0 },
    items: [{ name:'بضاعة', price: spent, qty:1 },
            { name:'💳 خصم من الرصيد', price: -spent, qty:1, isCreditSpend:true }]
  });

  const base = { amount: 0, atMs: at(2026, 8, 6, 7) };

  // ── يوم البيع: الكاش دخل، والدين زاد
  const L1 = ofCashLedger(base, { sales:[ gcSale(at(2026,8,6,15), 500, 500) ] },
    {}, { predict:false }, at(2026, 8, 6, 20), 0);
  const d1 = rowOf(L1, THU);
  assertEq(d1.val.cashSales, 500, '💵 الكاش دخل الدرج فعلًا');
  assertEq(d1.gcSold, 500, '🎁 والكارت اتسجّل كدين');
  assertEq(d1.balance, 500, 'والرصيد الكاشي ٥٠٠ (صح — الفلوس موجودة)');
  assertEq(d1.giftLiability, 500, '⭐⭐ بس عليك دين ٥٠٠');

  const W1 = ofWealth(L1, {}, at(2026, 8, 6, 20));
  assertEq(W1.gross, 500, '💵 اللي في إيدك ٥٠٠');
  assertEq(W1.giftLiability, 500, '🎁 والدين ٥٠٠');
  assertEq(W1.total, 0, '⭐⭐ واللي ليك فعلًا = صفر (لسه مبعتش حاجة)');

  // ── يوم الصرف: البضاعة خرجت، الدين اتسدّد، مفيش كاش جديد
  const L2 = ofCashLedger(base, { sales:[
    gcSale(at(2026,8,6,15), 500, 500),
    gcSpend(at(2026,8,9,15), 0, 500)
  ] }, {}, { predict:false }, at(2026, 8, 9, 20), 0);
  const d2 = rowOf(L2, SUN);
  assertEq(d2.gcSpent, 500, '💳 الرصيد اتصرف');
  assertEq(d2.val.cashSales, 0, '⭐ ومفيش كاش جديد دخل يوم الصرف (اتقبض قبل كده)');
  assertEq(d2.balance, 500, 'والكاش لسه ٥٠٠ في الدرج');
  assertEq(d2.giftLiability, 0, '⭐⭐ والدين اتقفل');

  const W2 = ofWealth(L2, {}, at(2026, 8, 9, 20));
  assertEq(W2.total, 500, '⭐⭐ ودلوقتي بس الـ٥٠٠ بقت بتاعتك فعلًا');

  // 🔴 نيجاتيف — الطريقة الغلط بتعدّ الفلوس مرتين
  assert(W1.gross + 500 !== W2.total,
    '🔴 نيجاتيف — لو حسبنا البيع والصرف الاتنين، ٥٠٠ تبقى ١٠٠٠');

  // ── صرف جزئي
  const L3 = ofCashLedger(base, { sales:[
    gcSale(at(2026,8,6,15), 500, 500),
    gcSpend(at(2026,8,9,15), 0, 200)
  ] }, {}, { predict:false }, at(2026, 8, 9, 20), 0);
  assertEq(rowOf(L3, SUN).giftLiability, 300, '⭐ صرف ٢٠٠ من ٥٠٠ → الدين ٣٠٠');
  assertEq(ofWealth(L3, {}, at(2026,8,9,20)).total, 200, 'واللي ليك ٢٠٠');

  // 🛡️ الدين مبينزلش تحت الصفر (كروت اتباعت قبل التصفير)
  const L4 = ofCashLedger(base, { sales:[ gcSpend(at(2026,8,6,15), 0, 300) ] },
    {}, { predict:false }, at(2026, 8, 6, 20), 0);
  assertEq(rowOf(L4, THU).giftLiability, 0,
    '🛡️ صرف من غير بيع مسجّل → الدين صفر مش سالب');
  assertEq(rowOf(L4, THU).giftLiabilityRaw, -300,
    '⭐ والرقم الحقيقي محفوظ (−٣٠٠ = فيه كروت اتباعت قبل التصفير)');

  // 🆕 رصيد افتتاحي للدين عند التصفير
  const L5 = ofCashLedger({ amount:0, atMs: at(2026,8,6,7), giftLiabilityOpening: 1000 },
    { sales:[] }, {}, { predict:false }, at(2026, 8, 6, 20), 0);
  assertEq(rowOf(L5, THU).giftLiability, 1000,
    '🆕 ⭐ ودين الكروت القديمة بيتحمل عند التصفير');

  // 🔌 متوصّل في الشاشة
  const src2 = fs.readFileSync(path.join(ROOT, 'Office', 'office.js'), 'utf8');
  assert(/W\.giftLiability > 0/.test(src2),
    '🔌 والدين بيبان في الشاشة لما يكون موجود');
  assert(/اللي ليك فعلًا/.test(src2),
    '⭐⭐ والعنوان بقى "اللي ليك فعلًا" مش "إجمالي فلوسك"');
  assert(/فلوس في إيدك مش بتاعتك/.test(src2), 'ومكتوب المعنى صراحة');
})();
