// ============================================================
// 🎁 test-gift-receipt — إيصال الهدية: ورقة استبدال من غير أسعار
// ------------------------------------------------------------
// الفكرة: العميلة تحط الورقة مع الهدية، واللي واخدة الهدية تقدر
// تستبدل أو ترجّع **من غير ما تعرف السعر**.
//
// ⚠️ الاختبار ده **بيشغّل `buildReceiptHTML` فعلًا** في VM ويقرا
//    الناتج — مش بيدوّر على نصوص في الكود. السبب: فحص نصي هنا
//    بالذات بيدّي طمأنينة كاذبة خطيرة — الفاتورة بتتبني من إعداد
//    عناصر محفوظ في Firestore، فـ"الكود بيقول يشيل الأسعار" مش
//    نفس "الورقة اللي طلعت مفيهاش سعر".
//
// 🔴 الخطر اللي بيحرسه: ورقة هدية فيها سعر = العميلة اللي جابت
//    الهدية اتكشف كام دفعت، قدام اللي واخداها. مفيش استرجاع للموقف
//    ده، ومحدش هيلاحظه غير بعد ما يحصل.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'pos', 'app.js'), 'utf8');
const repSrc = fs.readFileSync(path.join(ROOT, 'pos', 'pos-reports.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(ROOT, 'pos', 'index.html'), 'utf8');
const coreSrc = fs.readFileSync(path.join(ROOT, 'pos', 'pos-core.js'), 'utf8');

// ⚠️ استخراج بالأقواس المتوازنة — regex اتكسر قبل كده وطلّع فشل وهمي (§0)
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
function mustExtract(src, header, label){
  const fn = extractFn(src, header);
  assert(!!fn, '🔧 أداة الاستخراج: ' + label + ' اتلقت (لو دي وقعت، كل اللي تحتها وهمي)');
  return fn || '';
}

const buildFn = mustExtract(appSrc, 'function buildReceiptHTML(', 'buildReceiptHTML');

// ---------- بيئة تشغيل مصغّرة ----------
function makeCtx(cfgOverride){
  const cfg = Object.assign({
    lang: 'ar', paperWidth: '80', logo: '', logoWidth: 60,
    lineGap: 2, endFeed: 16, bcHeight: 34, bcFont: 11, bcWidthPct: 90,
    elements: [
      { id:'shopName',   base:'shopName',   on:true, size:14, text:'echarpe' },
      { id:'branchName', base:'branchName', on:true, size:11, text:'الرحاب' },
      { id:'meta',       base:'meta',       on:true, size:10 },
      { id:'copyMark',   base:'copyMark',   on:true, size:11 },
      { id:'items',      base:'items',      on:true, size:11 },
      { id:'totals',     base:'totals',     on:true, size:13 },
      { id:'cardTxn',    base:'cardTxn',    on:true, size:10 },
      { id:'custPoints', base:'custPoints', on:true, size:11 },
      { id:'invoiceNo',  base:'invoiceNo',  on:true, size:11 },
      { id:'barcode',    base:'barcode',    on:true, size:11 },
      { id:'appQR',      base:'appQR',      on:true, size:10 },
      { id:'footer',     base:'footer',     on:true, size:10, text:'شكرًا لزيارتك' }
    ]
  }, cfgOverride || {});
  const ctx = {
    receiptDesignConfig: cfg,
    defaultReceiptConfig: function(){ return cfg; },
    RECEIPT_LABELS: { ar: { total:'الإجمالي', invoice:'فاتورة', emp:'الموظف',
      cash:'كاش', visa:'فيزا', change:'الباقي' } },
    currencyLabel: function(){ return 'ج.م'; },
    // 🚫 الباركود بيترسم على canvas — مش متاح في Node. بنرجّع فاضي:
    //    اللي يهمنا إن **رقم الفاتورة** موجود، مش صورته.
    receiptBarcodeImg: function(){ return ''; },
    console: console
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(buildFn, ctx);
  return ctx;
}

const SALE = {
  dateStr: '١٤/٨/٢٠٢٦، ٧:٢٦ م',
  empName: 'روان',
  items: [
    { name: 'طرحة حرير سادة سواريه', qty: 1, barcode: 'ECH1001', unit: '350.00', line: '350.00' },
    { name: 'بيچامة قطن',            qty: 2, barcode: 'ECH1002', unit: '430.00', line: '860.00' }
  ],
  totalStr: '1210.00', payStr: 'فيزا: 1210.00',
  invoiceNo: 'INV-001444', scanCode: 'FTRH-001444',
  cardTxn: { scheme:'Visa', last4:'8406', approvalCode:'012345', transactionId:514825677 },
  cardTxns: [{ seq:1, amount:1210, scheme:'Visa', last4:'8406', transactionId:514825677 }],
  custPoints: { show:true, name:'منى', earned:12, redeemed:0, balance:55 },
  changeStr: 0, cardOverStr: '',
  showAppQR: true, appQrImg:'data:image/png;base64,AAA', appQrTitle:'حمّلي تطبيقنا!', appQrMsg:'هدية ترحيب'
};
const GIFT = Object.assign({}, SALE, { giftMode: true, custPoints: { show:false }, showAppQR: false });

function text(html){ return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '); }

// ============================================================
// ١) ⭐⭐ الورقة نفسها — صفر فلوس
// ============================================================
{
  const L = '🎁 الورقة: ';
  const ctx = makeCtx();
  // ⚠️ لو الحارس رمى هنا، ده معناه إن بلوك فلوس اتنسي في GIFT_HIDDEN.
  //    بنمسكه ونطلّع فشل مقروء بدل ما ملف الاختبار كله يقع بـstack trace.
  let html = '';
  try{ html = ctx.buildReceiptHTML(GIFT); }
  catch(e){
    assert(false, L + '⭐⭐ الحارس رفض الورقة: ' + e.message
      + ' — يعني فيه بلوك فلوس مش متشال في GIFT_HIDDEN');
    html = '';
  }
  const t = text(html);

  assert(t.indexOf('ج.م') < 0, L + '⭐⭐ مفيش عملة خالص');
  assert(!/\d+\.\d{2}(?!\d)/.test(t), L + '⭐⭐ ومفيش أي رقم بشكل سعر');
  assert(t.indexOf('350') < 0, L + '⭐ سعر الطرحة مش موجود');
  assert(t.indexOf('430') < 0, L + '⭐ ولا سعر البيچامة');
  assert(t.indexOf('860') < 0, L + '⭐ ولا إجمالي السطر');
  assert(t.indexOf('1210') < 0, L + '⭐⭐ ولا إجمالي الفاتورة');
  assert(t.indexOf('الإجمالي') < 0, L + 'ولا كلمة الإجمالي أصلًا');
  assert(t.indexOf('فيزا') < 0, L + '💳 ولا طريقة الدفع');
  assert(t.indexOf('8406') < 0, L + '💳 ولا آخر ٤ أرقام من الكارت');
  assert(t.indexOf('514825677') < 0, L + '💳 ولا رقم عملية Paymob');
  assert(t.indexOf('55') < 0, L + '🎁 ولا رصيد النقط (النقط بتفضح السعر)');
  assert(t.indexOf('منى') < 0, L + '🎁 ولا اسم اللي اشترت');

  // ✅ واللي **لازم** يفضل
  assert(t.indexOf('طرحة حرير سادة سواريه') >= 0, L + '✅ اسم الصنف موجود');
  assert(t.indexOf('بيچامة قطن') >= 0, L + '✅ والصنف التاني');
  assert(t.indexOf('ECH1001') >= 0, L + '✅ وباركود الصنف');
  assert(t.indexOf('INV-001444') >= 0, L + '⭐⭐ ورقم الفاتورة — من غيره مفيش استبدال');
  assert(t.indexOf('echarpe') >= 0, L + '✅ واسم المحل');
  assert(t.indexOf('الرحاب') >= 0, L + '✅ والفرع');
  assert(/إيصال هدية/.test(t), L + '⭐ وبانر «إيصال هدية» واضح');
  assert(/للاستبدال/.test(t), L + 'وبيقول إنها للاستبدال');
  // الكمية لازم تفضل — من غيرها الاستبدال الجزئي بيتلخبط
  assert(/\bQty\b/.test(t), L + '⭐ وعمود الكمية موجود');
  assert(/\bPrice\b/.test(t) === false, L + '⭐ وعمود السعر اتشال من العناوين');
  assert(/\bTotal\b/.test(t) === false, L + 'وكذلك عمود الإجمالي');
}

// ============================================================
// ٢) الفاتورة العادية **ما اتغيرتش**
// ------------------------------------------------------------
// أخطر حاجة في الميزة دي إنها تكسر الفاتورة الأصلية وهي بتشيل أسعار.
// ============================================================
{
  const L = '🧾 العادية: ';
  const ctx = makeCtx();
  const t = text(ctx.buildReceiptHTML(SALE));
  assert(t.indexOf('1210.00') >= 0, L + '⭐⭐ الإجمالي لسه بيتطبع');
  assert(t.indexOf('350.00') >= 0, L + 'وسعر الوحدة');
  assert(t.indexOf('860.00') >= 0, L + 'وإجمالي السطر');
  assert(t.indexOf('ج.م') >= 0, L + 'والعملة');
  assert(t.indexOf('8406') >= 0, L + '💳 وبيانات الكارت');
  assert(t.indexOf('55') >= 0, L + '🎁 وبلوك النقط');
  assert(t.indexOf('إيصال هدية') < 0, L + '⭐ وبانر الهدية **مش** ظاهر');
  assert(/Qty × Price/.test(t), L + 'وعناوين الأعمدة زي ما هي');
}

// ============================================================
// ٣) 🔒 الحارس الأخير — بلوك فلوس جديد اتنسي
// ------------------------------------------------------------
// السيناريو الحقيقي: بلوك فلوس بيتضاف بكرة (زي فروق الفيزا اللي
// اتضاف من شهر) ومحدش بيحطه في GIFT_HIDDEN. الحارس لازم يوقّف
// الطباعة بدل ما يطلّع ورقة فيها سعر.
// ============================================================
{
  const L = '🔒 الحارس: ';
  // عنصر نص حر فيه سعر — المالك يقدر يعمله من محرر التصميم
  const ctx = makeCtx({ elements: [
    { id:'shopName', base:'shopName', on:true, size:14, text:'echarpe' },
    { id:'footer',   base:'footer',   on:true, size:10, text:'خصم 50.00 على الزيارة الجاية' },
    { id:'items',    base:'items',    on:true, size:11 }
  ]});
  let threw = false, msg = '';
  try{ ctx.buildReceiptHTML(GIFT); }catch(e){ threw = true; msg = e.message; }
  assert(threw, L + '⭐⭐ الطباعة بتترفض لو فيه رقم بشكل سعر في أي عنصر');
  assert(/راجع عناصر تصميم الفاتورة/.test(msg), L + 'والرسالة بتقول للكاشير تعمل إيه');
}
{
  const L = '🔒 الحارس (عملة): ';
  const ctx = makeCtx({ elements: [
    { id:'shopName', base:'shopName', on:true, size:14, text:'echarpe' },
    { id:'footer',   base:'footer',   on:true, size:10, text:'الأسعار بالـ ج.م' },
    { id:'items',    base:'items',    on:true, size:11 }
  ]});
  let threw = false;
  try{ ctx.buildReceiptHTML(GIFT); }catch(e){ threw = true; }
  assert(threw, L + '⭐ وبيمسك اسم العملة كمان');
}

// ============================================================
// ٤) ⚠️ الحارس **ميوقعش** على اسم صنف فيه أرقام مشروعة
// ------------------------------------------------------------
// «شيفون 1.50 متر» اسم سليم. لو الحارس وقع عليه، إيصال الهدية
// كان هيرفض يطبع والكاشير قدام العميلة — إزعاج من غير سبب.
// ============================================================
{
  const L = '⚠️ إيجابي كاذب: ';
  const ctx = makeCtx();
  const g = Object.assign({}, GIFT, {
    items: [{ name: 'شيفون سادة 1.50 متر', qty: 1, barcode: 'ECH2001' }]
  });
  let threw = false, out = '';
  try{ out = ctx.buildReceiptHTML(g); }catch(e){ threw = true; }
  assert(!threw, L + '⭐ اسم صنف فيه 1.50 مبيوقّفش الطباعة');
  assert(text(out).indexOf('شيفون سادة 1.50 متر') >= 0, L + 'والاسم بيتطبع كامل');
}

// ============================================================
// ٥) ↩️ سطور المرتجع مش بتدخل إيصال الهدية
// ============================================================
{
  const L = '↩️ المرتجع: ';
  const giftData = mustExtract(repSrc, 'function giftReceiptData(', 'giftReceiptData');
  const ctx = { window:{} }; vm.createContext(ctx);
  vm.runInContext('var receiptDesignConfig={lang:"ar"};' + giftData, ctx);
  const out = ctx.giftReceiptData({
    invoiceNo:'INV-1', invoiceCode:'FT-1', employeeName:'روان',
    items: [
      { name:'طرحة', qty:1, price:350 },
      { name:'بيچامة مرتجعة', qty:1, price:200, isReturn:true }
    ]
  });
  assertEq(out.items.length, 1, L + '⭐ سطر المرتجع اتشال');
  assertEq(out.items[0].name, 'طرحة', L + 'والمباع فاضل');
  assertEq(out.giftMode, true, L + '⭐ والفلاج مترفوع');
  assertEq(out.scanCode, 'FT-1', L + '⭐⭐ وكود المسح موجود (من غيره مفيش استبدال)');
  assertEq(out.custPoints.show, false, L + 'والنقط متقفولة صراحةً');
  assertEq(out.showAppQR, false, L + 'والـQR كمان');
  // 🔁 مش نسخة تانية — ده مستند مختلف مش إعادة طباعة
  assert(out.isCopy !== true, L + '⭐ ومش متعلّم عليها "نسخة تانية"');
}

// ============================================================
// ٦) 💰 الدرج مايفتحش — مفيش حركة فلوس
// ------------------------------------------------------------
// درس محفور: الدرج بيتفتح على `payments.cash`. إيصال الهدية لازم
// يعدّي `{}` — أي حاجة تانية بتفتح الدرج على ورقة مالهاش علاقة بفلوس.
// ============================================================
{
  const L = '💰 الدرج: ';
  const f1 = mustExtract(repSrc, 'function printGiftReceipt(', 'printGiftReceipt');
  const f2 = mustExtract(appSrc, 'function printGiftReceiptForLast(', 'printGiftReceiptForLast');
  assert(/_printBuiltReceipt\(data, \{\}\)/.test(f1),
    L + '⭐⭐ سجل المبيعات: مدفوعات فاضية = الدرج مايفتحش');
  assert(/\}, \{\}\);/.test(f2),
    L + '⭐⭐ وشاشة البيع كمان');
}

// ============================================================
// ٧) ⏱️ نافذة الـ١٥ دقيقة — الزرار مبيطبعش فاتورة زبونة تانية
// ============================================================
{
  const L = '⏱️ النافذة: ';
  const fn = mustExtract(appSrc, 'function lastSaleGiftAvailable(', 'lastSaleGiftAvailable');
  const ctx = { window:{} }; vm.createContext(ctx);
  vm.runInContext('const GIFT_LAST_WINDOW_MS = 15*60*1000;' + fn, ctx);
  const NOW = 1_700_000_000_000;
  const ok = { at: NOW - 60000, items:[{name:'طرحة', qty:1}] };

  ctx.window.lastSaleForGift = ok;
  assertEq(ctx.lastSaleGiftAvailable(NOW), true, L + 'فاتورة من دقيقة → الزرار شغال');

  ctx.window.lastSaleForGift = { at: NOW - 14*60000, items:[{name:'طرحة', qty:1}] };
  assertEq(ctx.lastSaleGiftAvailable(NOW), true, L + 'و١٤ دقيقة لسه جوه النافذة');

  ctx.window.lastSaleForGift = { at: NOW - 16*60000, items:[{name:'طرحة', qty:1}] };
  assertEq(ctx.lastSaleGiftAvailable(NOW), false,
    L + '⭐⭐ و١٦ دقيقة **بره** — دي على الأرجح زبونة تانية خالص');

  ctx.window.lastSaleForGift = { at: NOW, items: [] };
  assertEq(ctx.lastSaleGiftAvailable(NOW), false, L + 'وفاتورة من غير أصناف مش بتفعّله');

  ctx.window.lastSaleForGift = null;
  assertEq(ctx.lastSaleGiftAvailable(NOW), false, L + 'ومفيش فاتورة = مفيش زرار');
}

// ============================================================
// ٨) 🔗 التوصيل — الأزرار والتعريض على window (§18)
// ============================================================
{
  const L = '🔗 التوصيل: ';
  assert(/window\.printGiftReceipt = printGiftReceipt/.test(repSrc), L + 'printGiftReceipt على window');
  assert(/window\.printGiftReceiptForLast = printGiftReceiptForLast/.test(appSrc), L + 'وprintGiftReceiptForLast');
  assert(/window\.refreshGiftBtn = refreshGiftBtn/.test(appSrc), L + 'وrefreshGiftBtn');
  assert(/printGiftReceipt\(\\'/.test(repSrc), L + 'وزرار في سجل المبيعات');
  assert(/id="giftReceiptBtn"/.test(htmlSrc), L + 'وزرار في شاشة البيع');
  assert(/onclick="printGiftReceiptForLast\(\)"/.test(htmlSrc), L + 'مربوط بالدالة');
  // بيبدأ مخفي — ويظهر بس لو فيه فاتورة قريبة
  const btn = htmlSrc.slice(htmlSrc.indexOf('id="giftReceiptBtn"'));
  assert(/style="display:none;"/.test(btn.slice(0, 200)),
    L + '⭐ وبيبدأ مخفي (مفيش فاتورة = مفيش زرار)');
  assert(/refreshGiftBtn\(\)/.test(coreSrc),
    L + '⭐ وshowScreen بينادي التحديث مع الدخول لشاشة البيع');
  // بيتخزن محليًا — صفر قراءات
  const pr = mustExtract(appSrc, 'function printReceipt(', 'printReceipt');
  assert(/window\.lastSaleForGift = \{/.test(pr), L + 'وبيانات آخر فاتورة بتتخزن وقت الطباعة');
  assert(!/db\.collection/.test(pr), L + '⭐ من غير أي قراءة/كتابة Firestore');
}

// ============================================================
// ٩) 🧪 الاختبارات السلبية — رجّع الباج واتأكد إنه بيقع
// ============================================================
{
  const L = '🧪 سلبي: ';

  // (أ) شيل الفلاج من قايمة البلوكات المخفية → الإجمالي لازم يرجع
  const broken = buildFn.replace(
    /const GIFT_HIDDEN = \['totals','cardTxn','custPoints','appQR'\];/,
    "const GIFT_HIDDEN = [];"
  );
  assert(broken !== buildFn, L + 'نجحنا نرجّع الباج');
  const ctx = makeCtx();
  vm.runInContext(broken, ctx);
  let leaked = false, blocked = false;
  try{ leaked = text(ctx.buildReceiptHTML(GIFT)).indexOf('1210.00') >= 0; }
  catch(e){ blocked = true; }
  assert(leaked || blocked,
    L + '⭐⭐ من غير الإخفاء: يا الإجمالي بيتسرب يا الحارس بيوقّفه — الاتنين بيثبتوا إن الاختبار شغال');
  assert(blocked,
    L + '⭐⭐ والحارس الأخير هو اللي مسكها — يعني الشبكة الأمان التانية شغالة فعلًا');

  // (ب) شيل الحارس نفسه → التسريب بيعدّي
  const noGuard = buildFn.replace(
    /if\(_cur && _txt\.indexOf\(_cur\) >= 0\)[\s\S]*?راجع عناصر تصميم الفاتورة'\);/,
    ' '
  );
  assert(noGuard !== buildFn, L + 'نجحنا نشيل الحارس');
}
