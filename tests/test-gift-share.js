// ============================================================
// 🧪 test-gift-share.js — باركود الكارت + كارت المشاركة + الربط بالعميلة
// ------------------------------------------------------------
// اللي الاختبار ده بيقفله:
//   ١) الباركود يتولّد من النص **المعروض** (`GC-XXXX-...`) بشرطاته —
//      الماسح بيبعت اللي جوه الباركود بالظبط، فالكود بيطلع مش
//      متطابق والكاشير متعرفش السبب.
//   ٢) الكود يتخزّن في النسخة العامة عشان يظهر في التطبيق — ودي
//      قراءتها مفتوحة، يعني أي حد يعرف رقم موبايل يسحب كودات كروته.
//   ٣) زرار المشاركة يتعرض في وقت تاني غير لحظة البيع — الكود مش
//      متخزّن عندنا، فبعد قفل الشاشة مفيش طريقة نولّده تاني.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..');
const CU = fs.readFileSync(path.join(R, 'pos', 'credit-ui.js'), 'utf8');
const SALE = fs.readFileSync(path.join(R, 'pos', 'pos-sale.js'), 'utf8');
const FN = fs.readFileSync(path.join(R, 'functions', 'giftCredit.js'), 'utf8');
const RULES = fs.readFileSync(path.join(R, 'security', 'firestore-phase2.rules'), 'utf8');

/* ============================================================
   ١) ⭐⭐ الباركود من الكود الخام
   ============================================================ */
(function(){
  assert(/function giftBarcodeValue\(g\)/.test(CU), 'فيه دالة للكود الخام');
  assert(/replace\(\/\[\^A-Z0-9\]\/g, ''\)/.test(CU),
    '⭐⭐ الشرط والمسافات بتتشال — الماسح بيبعت اللي جوه الباركود بالظبط');
  assert(/receiptBarcodeImg\(giftBarcodeValue\(g\)\)/.test(CU),
    '⭐⭐ الباركود مبني على الكود الخام مش على النص المعروض');
  assert(/g\.display/.test(CU),
    '⭐ والكود المكتوب لسه موجود — لو المكتبة مش متحمّلة الكارت مايطلعش من غير طريقة استعمال');

  const i = CU.indexOf('function giftCardSlipHtml');
  const body = CU.slice(i, i + 1400);
  assert(/_bc \? '<img src="' \+ _bc/.test(body), '⭐ الباركود بيتحط في القسيمة');
  assert(/try\{ if\(typeof receiptBarcodeImg === 'function'\)/.test(body),
    '⭐ وغيابه مبيكسرش الطباعة');
})();

/* ============================================================
   ٢) 📤 كارت المشاركة
   ============================================================ */
(function(){
  assert(/function giftShareCardHtml\(g, brand\)/.test(CU), 'كارت المشاركة موجود');
  assert(/isGlow \? 'Glow' : 'echarpe'|var name = isGlow/.test(CU),
    '⭐ باسم البراند الصح (Glow غير إيشارب)');
  assert(/async function giftShareCardPng/.test(CU), 'والتحويل لصورة');
  assert(/navigator\.canShare/.test(CU), 'مشاركة النظام لو متاحة');
  assert(/a\.download = file\.name/.test(CU),
    '⭐⭐ وفولباك تنزيل — Electron والويندوز مفيهمش Web Share، ومن غيره الزرار مبيعملش حاجة');
  assert(/catch\(e\)\{ \/\* المستخدم قفل الشير — منكملش للتنزيل \*\/ return; \}/.test(CU),
    '⭐ وقفل نافذة المشاركة مش بيحوّلها لتنزيل مفاجئ');

  // ⏱️ العرض وقت البيع بس
  assert(/offerGiftShare\(_cards\)/.test(SALE),
    '⭐⭐ العرض بيحصل بعد تفعيل الكروت مباشرة');
  assert(/دلوقتي بس — بعد ما تقفلي مش هيرجع/.test(CU),
    '⭐⭐ والكاشير بتتحذّر في الشاشة إن الفرصة مرة واحدة');
  assert(SALE.indexOf('activatePendingGiftCards(invoiceCode)') < SALE.indexOf('offerGiftShare'),
    '⭐ والعرض بعد التفعيل مش قبله (كارت مش مفعّل = وعد كاذب)');
})();

/* ============================================================
   ٣) ⭐⭐ الربط بالعميلة — من غير الكود
   ============================================================ */
(function(){
  assert(/buyerPhone: _buyer \|\| null/.test(CU), 'POS بيبعت رقم المشترية');
  assert(/buyerPhone: \(data && data\.buyerPhone\)/.test(FN), 'والدالة بتخزّنه');

  // 🔴 أهم فحص في الملف: النسخة العامة **من غير كود**
  /* ⚠️ الشريحة لازم تتحدّد بنهاية البلوك نفسه مش بعدد حروف: الـ700
     حرف كانت بتعدّي على `tx.set(iref, { code })` اللي بعده — وده
     مستند مفتاح التكرار في مجموعة **مقفولة تمامًا**، فالفحص كان
     بيقع على حاجة سليمة. (نفس فخ الشريحة الواسعة اللي مسكناه قبل كده.) */
  const i = FN.indexOf("tx.set(db.collection('gift_cards_public')");
  assert(i > 0, 'mustExtract: بلوك النسخة العامة اتلقى');
  const end = FN.indexOf('});', i);
  assert(end > i, 'mustExtract: نهاية البلوك اتحددت');
  const pub = FN.slice(i, end);
  assert(!/\bcode\b\s*:/.test(pub),
    '⭐⭐ مفيش `code` في النسخة العامة — قراءتها مفتوحة، وحطّ الكود فيها = أي حد يعرف رقم موبايل يسحب كودات كروته');
  assert(/codeTail/.test(pub), '⭐ آخر ٤ حروف للعرض بس (مش كفاية للصرف)');
  assert(!/codeHash/.test(pub), '⭐⭐ ولا البصمة — دي في المجموعة المقفولة');

  /* 🔒 والقاعدة: مجموعة الكروت **مقفولة على العميلة**.
     ⚠️ فتحها بـ`read` عشان «كروتي» كان غلط — `read` بتشمل `list`،
        يعني تنزيل كل الكروت بقيمها. الملخّص بيروح على مستندها هي. */
  const j = RULES.indexOf('match /gift_cards_public/{cardId}');
  const blk = RULES.slice(j, RULES.indexOf('}', RULES.indexOf('allow write', j)));
  assert(/allow read: if isStaff\(\)/.test(blk),
    '⭐⭐ الكروت مقفولة على العميلة (read بتشمل list = تنزيل الكل)');
  assert(/allow write: if false/.test(blk),
    '⭐⭐ والكتابة للدوال بس — الرصيد عمره ما بيتكتب من عميل');
  assert(/giftCards: admin\.firestore\.FieldValue\.arrayUnion/.test(FN),
    '⭐⭐ الملخّص بيتكتب على **مستند العميلة** — قراءة مستند واحد برقمها');
  const gi = FN.indexOf('giftCards: admin.firestore.FieldValue.arrayUnion');
  const gblk = FN.slice(gi, FN.indexOf('}, { merge: true });', gi));
  assert(!/\bcode\b\s*:/.test(gblk), '⭐⭐ ومفيش كود في الملخّص كمان');
})();
