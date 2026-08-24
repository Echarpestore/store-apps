// ============================================================
// 🏦 test-paymob-outstanding — «اللي عند Paymob» رقم حقيقي مش تراكمي
//
// 🔴 الباج: المستحق كان بيتحسب **كل الفيزا − التحويلات المسجّلة يدويًا**.
//    ده كان بيفترض إن المالك بيفتح داشبورد Paymob ويسجّل كل تحويل نزل.
//    المالك **مش بيفتح الداشبورد أصلًا**، فالمطروح كان صفر على طول
//    والرقم بقى «كل فيزا الشهر» — عشرات الآلاف بدل بيع يوم أو يومين،
//    وبيتحط في «اللي ليك فعلًا» فيصرف على أساسه.
//
// ✅ الصح: المستحق = اللي **لسه ماوصلش/ماتأكدش** حسب تحويل الثلاثاء الأسبوعي.
//    الرقم يفضل مستحق لحد ما المالك يأكد تحويل الثلاثاء الفعلي — الميعاد وحده مش إثبات إن الفلوس وصلت.
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
  // تأكيد الثلاثاء يقفل كل المبيعات لحد نهاية الاثنين 10 أغسطس.
  const logged = [{ ts:at(2026,8,11,13), gross:22000, net:21573.2,
                    forDay:MON, weeklyCycleEnd:MON }];
  const L = ofCashLedger(base, { sales: sales, settlements: logged }, {}, {}, now, 5);

  // بيع الثلاثاء 11 فقط يدخل دورة الثلاثاء القادم.
  assertEq(L.outstanding, 1000,
    '⭐⭐ بعد تأكيد الأسبوع السابق، المستحق = مبيعات الدورة الجديدة فقط');
  assertEq(L.pmPendingDays, [TUE], 'ومعروف هو فيزا أنهي يوم بالظبط');

  const W = ofWealth(L, {}, now);
  assert(W.paymobNet < 1000, 'الصافي المتوقع بعد العمولة أقل من الإجمالي');
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

  // الأحد والاثنين: لسه مستحقين؛ الميعاد الحقيقي للتأكيد الثلاثاء.
  const Lsun = ofCashLedger(base, { sales: sales, settlements: [] }, {}, {}, at(2026,8,9,20), 5);
  assertEq(Lsun.outstanding, 6000, '⭐⭐ بليل الأحد: لسه عند Paymob');
  const LtueBefore = ofCashLedger(base, { sales: sales, settlements: [] }, {}, {}, at(2026,8,11,10), 5);
  assertEq(LtueBefore.outstanding, 6000, 'الثلاثاء قبل التأكيد: لسه مستحق');
  const LtueAfter = ofCashLedger(base, { sales:sales, settlements:[
    {ts:at(2026,8,11,13),gross:6000,net:5883.6,forDay:MON,weeklyCycleEnd:MON}
  ]}, {}, {}, at(2026,8,11,20), 5);
  assertEq(LtueAfter.outstanding, 0, 'بعد تأكيد الثلاثاء: الأسبوع اتقفل');
  assertEq(LtueAfter.pmPendingDays, [], 'ومفيش يوم معلّق من الأسبوع القديم');
})();

// ============================================================
// ٣) 🔴 الحساب المزدوج لسه مقفول (الحماية القديمة ما اتكسرتش)
// ============================================================
(function(){
  const base = { amount: 0, atMs: at(2026,8,6,7) };
  const data = { sales: [ sale(at(2026,8,6,15), 0, 10000) ],
                 settlements: [ { ts: at(2026,8,11,13), net: 9800, gross: 10000,
                                  forDay: MON, weeklyCycleEnd:MON } ] };
  const L = ofCashLedger(base, data, {}, {}, at(2026,8,11,20), 5);
  const tue = L.rows.filter(r => r.key === TUE)[0];
  assertEq(tue.val.pmIn, 9800, 'التحويل الحقيقي اتسجّل الثلاثاء');
  assertEq(tue.pmExpected, 0, '🔒 والمتوقّع اتلغى — مفيش عدّ مرتين');
  assertEq(L.outstanding, 0, 'والمستحق صفر');
})();

// ============================================================
// ٤) ✅ التأكيد اليدوي الأسبوعي مقصود: بدون تأكيد يفضل مستحق
// ============================================================
(function(){
  const base  = { amount: 0, atMs: at(2026,8,6,7) };
  const sales = [ sale(at(2026,8,6,15), 0, 5000) ];
  const now   = at(2026,8,11,20);

  const withLog = ofCashLedger(base, { sales:sales, settlements:[
    {ts:at(2026,8,11,13),net:4900,gross:5000,forDay:MON,weeklyCycleEnd:MON}
  ]}, {}, {}, now, 5);
  const withoutLog = ofCashLedger(base, { sales:sales, settlements:[] }, {}, {}, now, 5);

  assertEq(withLog.outstanding, 0, 'بتأكيد التحويل: المستحق صفر');
  assertEq(withoutLog.outstanding, 5000,
    '🚫 من غير تأكيد: الفلوس تفضل مستحقة — الميعاد لوحده مش كفاية');
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

  // حتى بعد أسبوعين يفضل لحد أول تحويل أسبوعي مؤكد يغطي نقطة البداية.
  const Lbefore = ofCashLedger({ amount:0, atMs:at(2026,8,6,7), paymobOpening:7000 },
    data, {}, {}, at(2026,8,20,20), 5);
  assertEq(Lbefore.paymobOpening,7000,'من غير تأكيد: رصيد البداية مايتبخرش بالوقت');

  const confirmed={sales:[],settlements:[
    {ts:at(2026,8,11,13),gross:7000,net:6864.2,forDay:MON,weeklyCycleEnd:MON}
  ]};
  const Llater=ofCashLedger({amount:0,atMs:at(2026,8,6,7),paymobOpening:7000},
    confirmed,{}, {},at(2026,8,20,20),5);
  assertEq(Llater.paymobOpening,0,'بعد أول أسبوع مؤكد يغطي البداية: يتشال');
  assert(Llater.paymobOpeningLanded,'وفيه علم بيقول للشاشة تشرح السبب');

  const W=ofWealth(Llater,{},at(2026,8,20,20));
  assertEq(W.paymobNet,0,'وإجمالي الثروة مفيهوش الرقم القديم');
  assert(W.pmOpeningLanded,'والشاشة عندها العلم');
})();

// ============================================================
// ٦) 🖥️ الشاشة بتقول الحقيقة — أسبوعي + مؤكد/متوقع منفصل
// ============================================================
(function(){
  assert(src.indexOf('🏦 تحويل Paymob الأسبوعي') > -1, 'كارت التحويل الأسبوعي موجود');
  assert(src.indexOf('المتوقع ينزل') > -1, 'الصافي المتوقع ظاهر');
  assert(src.indexOf('عمولة متوقعة') > -1, 'العمولة المتوقعة ظاهرة');
  assert(src.indexOf('✅ أكد المبلغ') > -1, 'زر التأكيد موجود');
  assert(src.indexOf('عند Paymob — لسه ماوصلش') > -1, 'المستحق منفصل عن السيولة المؤكدة');
})();

// ============================================================
// ٧) الكاش اتزوّد
// ============================================================
(function(){
  const sw = fs.readFileSync(path.join(ROOT, 'Office', 'sw.js'), 'utf8');
  const ver = (sw.match(/echarpe-office-v(\d+)/) || [])[1];
  assert(Number(ver) >= 59, 'CACHE_NAME في Office اتزوّد لـv59 على الأقل (لقينا v' + ver + ')');
})();
