// ============================================================
// 🛟 test-paymob-stuck — الفاتورة المعلّقة بعد قبول الدفع
//
// الحادثة (مرتين): الدفع بالفيزا اتقبل والماكينة طبعت موافقة، والشاشة
// فضلت ساكتة — لا فاتورة اتحفظت ولا ورقة طلعت. الكاشير قدام عميلة
// من غير أي رسالة تقول إيه اللي واقف.
//
// الحارس ده مش إصلاح للسبب الجذري — هو بيحوّل السكوت لبانر فيه السبب
// وزرار حفظ، وبيسجّل الحالة في pos_activity_log عشان نحدد السبب.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const posSrc  = fs.readFileSync(path.join(ROOT,'pos','pos-sale.js'),'utf8');
const posHtml = fs.readFileSync(path.join(ROOT,'pos','index.html'),'utf8');

function extractFn(src, header){
  const i = src.indexOf(header);
  if(i < 0) return null;
  let depth = 0, started = false;
  for(let j = src.indexOf('{', i); j < src.length; j++){
    if(src[j] === '{'){ depth++; started = true; }
    else if(src[j] === '}'){ depth--; if(started && depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}

// الدالة النقية بتتشغّل من الملف نفسه
// المهلة بتتقرا من الملف نفسه مش مكتوبة في الاختبار — عشان لو اتغيرت
// الاختبارات تتحرك معاها بدل ما تقع بالغلط
const PM_MS = Number((posSrc.match(/PM_STUCK_MS *= *(\d+)/) || [])[1]);
// مهلة "الحفظ شغال على الشبكة" — بتتقرا من الملف زي أختها
const PM_SAVE_MS = Number((posSrc.match(/PM_SAVING_GRACE_MS *= *(\d+)/) || [])[1]) || 60000;
const box = { window:{}, PM_STUCK_MS: PM_MS, PM_SAVING_GRACE_MS: PM_SAVE_MS };
vm.createContext(box);
(function(){
  const src = extractFn(posSrc, 'function paymobStuckReason(');
  assert(!!src, 'لقينا paymobStuckReason في pos-sale.js');
  if(src) vm.runInContext(src + '\n;paymobStuckReason;', box);
})();
const reason = (st)=> vm.runInContext('paymobStuckReason', box)(st);

const OK = { approved:true, cartCount:3, elapsedMs: PM_MS + 1000, saving:false, autoFired:false, skipReason:null, paymentsComplete:true };
const st = (o)=> Object.assign({}, OK, o||{});

// ============================================================
// ١) إمتى الحارس **ميتكلمش** — أهم من إمتى يتكلم
// ============================================================
(function(){
  assertEq(reason(st({ approved:false })), null,
    '⛔ الدفع لسه ماتقبلش = مفيش بانر (ده مسار انتظار عادي)');
  assertEq(reason(st({ cartCount:0 })), null,
    '⭐ السلة اتفضّت = الفاتورة اتحفظت = مفيش بانر');
  assertEq(reason(st({ paymentsComplete:false, skipReason:'المدفوعات ناقصة — مسجّل 515.00 من 1385.00' })), null,
    '⭐⭐ Split payment: أول كارت اتقبل والباقي لسه مطلوب = حالة طبيعية، مفيش paymob_stuck ولا إنذار Office');
  assertEq(reason(st({ elapsedMs: PM_MS - 1 })), null,
    '⛔ قبل المهلة بجزء من الثانية: لسه ساكت');
  assert(!!reason(st({ elapsedMs: PM_MS })), '⭐ وعند المهلة بالظبط: البانر بيظهر');
  assertEq(reason(null), null, 'وحالة فاضية متكسرش حاجة');
})();

// ============================================================
// ٢) الحالات التلاتة — كل واحدة برسالتها ومعاها القرار الصح
// ============================================================
(function(){
  // ⏳ الحفظ الشغال ليه مهلة أطول (دقيقة) قبل ما يتعلن كتعليق — الانتظار
  //    على الشبكة مش عطل. جوه المهلة **مفيش بانر** أصلًا.
  assert(reason(st({ saving:true })) === null,
    '⭐ جوه مهلة الحفظ (' + PM_SAVE_MS/1000 + ' ثانية) مفيش بانر — ده انتظار عادي');
  const saving = reason(st({ saving:true, elapsedMs: PM_SAVE_MS + 1000 }));
  assert(!!saving, 'الحفظ واقف على الشبكة → بانر');
  assertEq(saving.canSave, false,
    '⭐⭐ والحفظ لسه شغال → مفيش زرار حفظ (منع الحفظ مرتين والفلوس مسحوبة)');

  const fired = reason(st({ autoFired:true }));
  assert(!!fired && fired.canSave === true, '⭐ الطباعة اتنفذت والحفظ ماكملش → زرار حفظ');
  assert(/ماكملش/.test(fired.reason) || /ماكمل/.test(fired.reason), 'والسبب مكتوب صريح');

  const skipped = reason(st({ skipReason:'المبلغ مش مطابق' }));
  assert(!!skipped && skipped.canSave === true, 'الحفظ التلقائي اتوقف بسبب → زرار حفظ');
  assert(/المبلغ مش مطابق/.test(skipped.reason),
    '⭐ والسبب الحقيقي بيتعرض للكاشير مش رسالة عامة');

  const plain = reason(st());
  assert(!!plain && plain.canSave === true, 'اتقبل ومحصلش حاجة → زرار حفظ');
})();

// ============================================================
// ٣) الأولوية: "بيحفظ دلوقتي" بتغلب على أي سبب تاني
//    (لو الاتنين اتقالوا مع بعض، الزرار لازم يختفي)
// ============================================================
(function(){
  const both = reason(st({ saving:true, autoFired:true, skipReason:'أي حاجة', elapsedMs: PM_SAVE_MS + 1000 }));
  assertEq(both.canSave, false,
    '⭐⭐ الحفظ شغال = ممنوع زرار حفظ تاني مهما كانت الأسباب التانية');
})();

// ============================================================
// ٤) الحارس بيقفل نفسه لما الفاتورة تخلص أو الدفع يتلغي
// ============================================================
(function(){
  const tick = extractFn(posSrc, 'function paymobStuckTick(');
  assert(!!tick, 'لقينا paymobStuckTick');
  assert(!!tick && /if\(!st\.cartCount \|\| !st\.approved\)\{ paymobStuckClear\(\)/.test(tick),
    '⭐ السلة اتفضّت أو الدفع اتلغي → الحارس بيقفل نفسه');
  assert(!!tick && /_pmStuck\.logged/.test(tick),
    '⭐ الحالة بتتسجل **مرة واحدة** مش كل تيك (وإلا سجل النشاط يتملّي)');
  assert(!!tick && /paymob_stuck/.test(tick),
    'وبتتسجل في سجل النشاط — ده الدليل اللي هيحدد السبب الجذري');
  assert(!!tick && /paymentsComplete/.test(tick) && /paymentAmounts/.test(tick) && /cartTotal\(\)/.test(tick),
    '⭐ الحارس يقارن إجمالي المدفوعات بإجمالي الفاتورة قبل ما يسجل تعليق');
  // الحارس بيتصفّر مع أي محاولة دفع جديدة
  const reset = extractFn(posSrc, 'function paymobResetActive(');
  assert(!!reset && /paymobStuckClear\(\)/.test(reset),
    '⭐ محاولة دفع جديدة = الحارس القديم بيتقفل (مايفضلش معلّق على طلب قديم)');
})();

// ============================================================
// ٥) 💰 الأمان: الإنقاذ بيعدّي من نفس مسار الحفظ العادي
//    (مفيش طريق جانبي بيكتب فاتورة من غير حراس التكرار والتأكيد)
// ============================================================
(function(){
  const render = extractFn(posSrc, 'function paymobStuckRender(');
  assert(!!render, 'لقينا paymobStuckRender');
  assert(!!render && /confirmPayment\(\)/.test(render),
    '⭐⭐ زرار الإنقاذ بينادي confirmPayment العادية');
  assert(!!render && !/_confirmSaving *=/.test(render),
    '⛔ ومبيلمسش حارس منع التكرار (_confirmSaving) — ده كان هيسمح بحفظ مرتين');
  assert(!!render && !/TEST_SALES|\.add\(|setDoc/.test(render),
    '⛔ ومفيش أي كتابة مباشرة للفاتورة من البانر');
  assert(!!render && /متعملش العملية تاني/.test(render),
    '⭐ والبانر بيحذّر الكاشير متعيدش السحب على الماكينة — الفلوس اتسحبت خلاص');
  assert(!!render && /paymob_stuck_rescue/.test(render), 'والإنقاذ نفسه بيتسجل');
})();

// ============================================================
// ٦) البانر مكانه فوق في شاشة البيع ومخفي افتراضيًا
// ============================================================
(function(){
  const i = posHtml.indexOf('id="saleScreen"');
  assert(i > 0, 'شاشة البيع موجودة');
  const head = posHtml.slice(i, i + 900);
  const iBox = head.indexOf('id="paymobStuckBox"');
  const iTop = head.indexOf('qbx-top');
  assert(iBox > 0, 'البانر موجود في شاشة البيع');
  assert(iBox < iTop, '⭐ وفوق خالص — الكاشير تشوفه من غير ما تدوّر');
  assert(/id="paymobStuckBox"[^>]*display:none/.test(posHtml), 'ومخفي لحد ما يبقى فيه سبب');
})();

// ============================================================
// ٧) المهلة معقولة: أطول من أبطأ حفظ طبيعي
//    (رقم فاتورة 2.5 ث + كتابة البيعة 4 ث ≈ 6.5 ث)
// ============================================================
(function(){
  const m = posSrc.match(/PM_STUCK_MS *= *(\d+)/);
  assert(!!m, 'المهلة معرّفة كثابت');
  const ms = Number(m && m[1]);
  // ⚠️ الحارس لازم يبقى أطول من أبطأ حفظ طبيعي: 2500 (رقم الفاتورة)
  //    + 4000 (كتابة البيعة) = 6500. أقل من كده = إنذار كاذب على نت بطيء.
  const slowest = 2500 + 4000;
  assert(ms > slowest, 'المهلة أطول من أبطأ حفظ طبيعي (' + slowest + ' مللي) — ' + ms);
  assert(ms >= 8000, 'وفيها هامش أمان كفاية — ' + ms);
  assert(ms <= 20000, 'ومش طويلة لدرجة إن الكاشير تفضل مستنية — ' + ms);
})();

// ============================================================
// ٨) القاعدة الذهبية
// ============================================================
(function(){
  ['paymobStuckStart','paymobStuckClear','paymobStuckReason'].forEach(function(n){
    assert(new RegExp('window\\.' + n + ' *= *' + n).test(posSrc), n + ' معروضة على window');
  });
  const sw = fs.readFileSync(path.join(ROOT,'pos','sw.js'),'utf8');
  const m = sw.match(/store-apps-shell-v(\d+)/);
  assert(!!m && Number(m[1]) >= 280, 'POS: CACHE_NAME v280+');
})();
