// ============================================================
// 🏦 test-paymob-outstanding — «اللي عند Paymob» رقم حقيقي مش تراكمي
//
// 🔴 الباج: المستحق كان بيتحسب **كل الفيزا − التحويلات المسجّلة يدويًا**.
//    ده كان بيفترض إن المالك بيفتح داشبورد Paymob ويسجّل كل تحويل نزل.
//    المالك **مش بيفتح الداشبورد أصلًا**، فالمطروح كان صفر على طول
//    والرقم بقى «كل فيزا الشهر» — عشرات الآلاف بدل بيع يوم أو يومين،
//    وبيتحط في «اللي ليك فعلًا» فيصرف على أساسه.
//
// ✅ الصح: المستحق = اللي **لسه ماوصلش حسب جدول التحويل** (تاني يوم عمل).
//    رقم بيتحسب لوحده من غير أي إدخال، وبيصفّر نفسه أول ما اليوم يعدّي.
//
// ⚠️ الاختبار ده **سلوكي بأرقام**، مش نصّي — الفحص النصّي هنا كان
//    هيعدّي على كومنت (§14.2).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'Office', 'office.js'), 'utf8');

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

[ 'const PAYMOB_FEE_PCT', 'const OF_WEEKEND_DEFAULT', 'const OF_LEDGER_FIELDS',
  'const OF_GOLD_STALE_MS', 'const OF_FREEZE_AFTER_DAYS', 'const OF_SALES_WINDOW_DAYS'
].forEach(function(h){
  const i = src.indexOf(h);
  if(i >= 0) vm.runInContext(src.slice(i, src.indexOf(';', i) + 1), box);
});
[ 'function _ofShopParts(', 'function _ofOffsetMs(', 'function ofBizDayRange(',
  'function _saleMs(', 'function _ohTs(', 'function paymobGrossFromNet(',
  'function paymobEffectivePct(', 'function ofDayKeyOf(', 'function ofDayShift(',
  'function ofDowOf(', 'function ofIsWeekend(', 'function ofNextBizDay(',
  'function ofSettleDayFor(', 'function ofCollectDays(',
  'function ofPredictSettlements(', 'function ofCashLedger(',
  'function ofGoldValue(', 'function ofWealth('
].forEach(function(h){
  const f = extractFn(src, h);
  assert(!!f, 'لقينا ' + h);
  if(f) vm.runInContext(f, box);
});

const ofCashLedger = vm.runInContext('ofCashLedger', box);
const ofWealth     = vm.runInContext('ofWealth', box);

const at   = (y,m,d,hh) => Date.UTC(y, m-1, d, (hh==null?12:hh)-3, 0);
const sale = (ms, cash, visa) => ({ createdAt:{ toMillis:()=>ms }, payments:{ cash:cash||0, visa:visa||0 } });

// ٢٠٢٦: ٦ أغسطس خميس · ٧ جمعة · ٨ سبت · ٩ أحد · ١٠ إتنين · ١١ تلات
const THU='2026-08-06', FRI='2026-08-07', SAT='2026-08-08',
      SUN='2026-08-09', MON='2026-08-10', TUE='2026-08-11';

// ============================================================
// ١) ⭐⭐ لُبّ الباج: شهر فيزا من غير أي تحويل مسجّل
// ============================================================
(function(){
  // بيع فيزا ١٠٠٠ ج كل يوم من ٢٠ يوليو لـ١١ أغسطس، وولا تحويل اتسجّل
  const sales = [];
  for(let d = 20; d <= 31; d++) sales.push(sale(at(2026,7,d,15), 0, 1000));
  for(let d = 1;  d <= 11; d++) sales.push(sale(at(2026,8,d,15), 0, 1000));

  const base = { amount: 0, atMs: at(2026,7,20,7) };
  const now  = at(2026,8,11,20);                       // التلات بليل
  const L = ofCashLedger(base, { sales: sales, settlements: [] }, {}, {}, now, 5);

  // ٢٣ يوم × ١٠٠٠ = ٢٣ ألف — ده الرقم الخرافي اللي كان بيتعرض
  assert(L.outstanding < 23000,
    '⭐⭐ المستحق مش كل فيزا الشهر (كان بيقول ٢٣٠٠٠)');

  /* الصح: التلات (يوم البيع الجاري) فلوسه بتنزل الأربع — لسه.
     الإتنين فلوسه نزلت التلات خلاص. فالمستحق = بيع التلات بس. */
  assertEq(L.outstanding, 1000,
    '⭐⭐ المستحق = فيزا اليوم اللي لسه ماوصلش بس (١٠٠٠)');
  assertEq(L.pmPendingDays, [TUE], 'ومعروف هو فيزا أنهي يوم بالظبط');

  // 🧮 وإجمالي الثروة مبقاش متضخّم
  const W = ofWealth(L, {}, now);
  assert(W.paymobNet < 1000, 'الصافي بعد العمولة أقل من الإجمالي');
  assert(W.paymobNet > 900,  'وقريب منه — العمولة ~٢٪ مش أكتر');
})();

// ============================================================
// ٢) ⭐ عطلة نهاية الأسبوع — تلات أيام بينزلوا مع بعض الأحد
// ============================================================
(function(){
  const sales = [ sale(at(2026,8,6,15), 0, 3000),   // خميس
                  sale(at(2026,8,7,15), 0, 2000),   // جمعة
                  sale(at(2026,8,8,15), 0, 1000) ]; // سبت
  const base = { amount: 0, atMs: at(2026,8,6,7) };

  // بليل السبت: التلاتة لسه ماوصلوش (كلهم بينزلوا الأحد)
  const Lsat = ofCashLedger(base, { sales: sales, settlements: [] }, {}, {}, at(2026,8,8,20), 5);
  assertEq(Lsat.outstanding, 6000, '⭐ بليل السبت: التلات أيام لسه في الطريق');
  assertEq(Lsat.pmPendingDays, [THU, FRI, SAT], 'والتلاتة باينين بالاسم');

  // بليل الأحد: نزلوا كلهم — المستحق يرجع صفر **لوحده**
  const Lsun = ofCashLedger(base, { sales: sales, settlements: [] }, {}, {}, at(2026,8,9,20), 5);
  assertEq(Lsun.outstanding, 0,
    '⭐⭐ بليل الأحد: صفر — من غير ما المالك يسجّل أي حاجة');
  assertEq(Lsun.pmPendingDays, [], 'ومفيش أي يوم معلّق');
})();

// ============================================================
// ٣) 🔴 الحساب المزدوج لسه مقفول (الحماية القديمة ما اتكسرتش)
// ============================================================
(function(){
  const base = { amount: 0, atMs: at(2026,8,6,7) };
  const data = { sales: [ sale(at(2026,8,6,15), 0, 10000) ],
                 settlements: [ { ts: at(2026,8,9,13), net: 9800, gross: 10000, forDay: THU } ] };
  const L = ofCashLedger(base, data, {}, {}, at(2026,8,9,20), 5);
  const sun = L.rows.filter(r => r.key === SUN)[0];
  assertEq(sun.val.pmIn, 9800, 'التحويل الحقيقي اتسجّل');
  assertEq(sun.pmExpected, 0, '🔒 والمتوقّع اتلغى — مفيش عدّ مرتين');
  assertEq(L.outstanding, 0, 'والمستحق صفر');
})();

// ============================================================
// ٤) 🚫 اختبار سلبي: التحويلات المسجّلة **مش** شرط لصحّة الرقم
//    نفس البيانات مرتين — مرة بتحويل مسجّل ومرة من غيره — ونفس النتيجة
//    لليوم اللي نزل. لو الرقم رجع يعتمد على التسجيل اليدوي، الاتنين
//    هيختلفوا وده الاختبار ده هيقع.
// ============================================================
(function(){
  const base  = { amount: 0, atMs: at(2026,8,6,7) };
  const sales = [ sale(at(2026,8,6,15), 0, 5000) ];   // خميس، بينزل الأحد
  const now   = at(2026,8,10,20);                      // الإتنين — نزل خلاص

  const withLog    = ofCashLedger(base, { sales: sales,
    settlements: [ { ts: at(2026,8,9,13), net: 4900, gross: 5000, forDay: THU } ] }, {}, {}, now, 5);
  const withoutLog = ofCashLedger(base, { sales: sales, settlements: [] }, {}, {}, now, 5);

  assertEq(withLog.outstanding, 0, 'بتسجيل التحويل: المستحق صفر');
  assertEq(withoutLog.outstanding, 0,
    '🚫⭐⭐ ومن غير تسجيل: صفر برضه — الرقم مبقاش معتمد على المالك');
})();

// ============================================================
// ٥) 🗓️ رصيد البداية بيسقط بعد ميعاد نزوله — مش بيفضل مضاف للأبد
// ============================================================
(function(){
  const data = { sales: [], settlements: [] };

  // بدأ الخميس وكتب إن عند Paymob ٧٠٠٠ — الأحد لسه في الطريق
  const Lthu = ofCashLedger({ amount: 0, atMs: at(2026,8,6,7), paymobOpening: 7000 },
    data, {}, {}, at(2026,8,6,20), 5);
  assertEq(Lthu.paymobOpening, 7000, 'يوم البداية: رصيد البداية لسه محسوب');
  assert(!Lthu.paymobOpeningLanded, 'ولسه ماوصلش');

  // بعد أسبوعين — الفلوس دي نزلت البنك من زمان
  const Llater = ofCashLedger({ amount: 0, atMs: at(2026,8,6,7), paymobOpening: 7000 },
    data, {}, {}, at(2026,8,20,20), 5);
  assertEq(Llater.paymobOpening, 0,
    '⭐⭐ بعد أسبوعين: اتشال — كان بيتضاف للأبد وبيضخّم الرقم');
  assert(Llater.paymobOpeningLanded, 'وفيه علم بيقول للشاشة تشرح السبب');

  const W = ofWealth(Llater, {}, at(2026,8,20,20));
  assertEq(W.paymobNet, 0, 'وإجمالي الثروة مفيهوش الرقم القديم');
  assert(W.pmOpeningLanded, 'والشاشة عندها العلم');
})();

// ============================================================
// ٦) 🖥️ الشاشة بتقول الحقيقة — مش رقم مجرّد
// ============================================================
(function(){
  const i = src.indexOf('🏦 عند Paymob — لسه ماوصلش');
  assert(i > -1, 'كارت Paymob موجود في الشاشة');
  const fn = extractFn(src, 'function renderCashHand(') || '';
  assert(fn.indexOf('لسه ماوصلش') > -1,
    'الوصف بيقول إنه اللي لسه ماوصلش');
  assert(fn.indexOf('النظام مش متصل بحساب البنك نفسه') > -1,
    '⭐ والشاشة بتقول صراحةً إن البنك مش مربوط — مش بتدّعي رقم مش معروف');
  assert(fn.indexOf('W.pmDayKeys') > -1,
    'وبتعرض فيزا أنهي يوم بالظبط — رقم تقدر تراجعه');
  assert(fn.indexOf('W.paymobOpeningLanded') > -1,
    'وبتشرح سبب اختفاء رصيد البداية بدل ما يختفي بالسكوت');
})();

// ============================================================
// ٧) الكاش اتزوّد
// ============================================================
(function(){
  const sw = fs.readFileSync(path.join(ROOT, 'Office', 'sw.js'), 'utf8');
  const ver = (sw.match(/echarpe-office-v(\d+)/) || [])[1];
  assert(Number(ver) >= 59, 'CACHE_NAME في Office اتزوّد لـv59 على الأقل (لقينا v' + ver + ')');
})();
