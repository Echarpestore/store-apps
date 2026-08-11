// ============================================================
// 💵 test-cash-hand — شاشة "معاك في إيدك" (office)
//
// حسابات الأرقام نفسها متختبرة في `test-cash-ledger.js`.
// الملف ده بيحرس **الشاشة**: إن اللي بيتعرض متوصّل بالمحرك صح،
// وإن الكتابات آمنة، وإن الحاجات الخطيرة عليها تأكيد.
//
// 📜 تاريخ: الملف ده كان بيقع بـ"paymobLedger is not defined" وكان
//    متسجّل كأنه "كود ناقص من الريبو محتاج قرار". الحقيقة كانت إن
//    الاختبار مكانش بيحمّل الدالة في الـsandbox بتاعه. ولأنه كان
//    بيقع من أول سطر، **٤ أسيرشن جواه كانوا بيقيسوا شكل قديم
//    للدوال ومحدش واخد باله** — الكراش كان بيخبّي الفشل.
//    الدرس: اختبار بيقع ≠ اختبار معطّل. لازم يتصلّح مش يتساب.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'Office', 'office.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'Office', 'index.html'), 'utf8');

// ⚠️ شيل التعليقات قبل أي فحص نصّي — §0: نص موجود في تعليق كان
//    بيخلّي أسيرشن يعدّي وهو غلط. حصل أكتر من مرة.
function stripComments(s){
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
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
const bare = stripComments(src);

// ============================================================
// ١) الشاشة موجودة ومربوطة
// ============================================================
(function(){
  assert(/id="cashHandBody"/.test(html), 'مكان العرض موجود في الـHTML');
  assert(/data-page="cash"/.test(html), 'وزرار التبويب');
  assert(/window\.renderCashHand = renderCashHand/.test(bare), 'renderCashHand معروضة على window');
  const fn = extractFn(src, 'function renderCashHand(');
  assert(!!fn, 'لقينا renderCashHand');
  if(!fn) return;

  // ⭐ الشاشة بتعرض بس — الحساب كله في المحرك المتختبر
  assert(/ofCashLedger\(/.test(fn), '⭐ الشاشة بتاخد أرقامها من ofCashLedger');
  assert(/ofWealth\(/.test(fn), 'وإجمالي الثروة من ofWealth');
  assert(!/\.reduce\(/.test(fn) && !/payments\./.test(fn),
    '⛔ الشاشة مبتحسبش فلوس بنفسها — أي حساب هنا بيبقى نسخة تانية من الحقيقة');
})();

// ============================================================
// ٢) ⭐⭐ محرك واحد بس للفلوس
//    كان فيه محركين جنب بعض (cashOnHand/cashDaily القدام + ofCashLedger).
//    محركين = رقمين مختلفين لنفس السؤال، والفرق بيظهر بعد شهور.
// ============================================================
(function(){
  assert(!/function cashOnHand\(/.test(bare),
    '⛔ المحرك القديم cashOnHand اتشال');
  assert(!/function cashDaily\(/.test(bare),
    '⛔ و cashDaily كمان');
  assert(!/function paymobLedger\(/.test(bare),
    '⛔ و paymobLedger (اتحلّت محلها ofPredictSettlements)');
  assert(/function ofCashLedger\(/.test(bare), '⭐ ومحرك واحد شغّال');
})();

// ============================================================
// ٣) 🧊 التجميد التلقائي متوصّل فعلًا
//    من غير النداء ده الدالة تبقى موجودة ومحدش بينديها —
//    نفس باج §4ب اللي المحرك كان مبني ومش موصّل.
// ============================================================
(function(){
  const fn = extractFn(src, 'function renderCashHand(');
  assert(!!fn && /ofAutoFreeze\(/.test(fn), '⭐⭐ ofAutoFreeze بتتنادى من الشاشة');
  const az = extractFn(src, 'function ofAutoFreeze(');
  assert(!!az, 'لقينا ofAutoFreeze');
  if(!az) return;
  assert(/ofFreezeDue\(/.test(az), 'وبتسأل ofFreezeDue مين محتاج يتجمّد');
  assert(/\{ merge: true \}/.test(az), 'والكتابة merge — مبتمسحش تعديلات اليوم');
  assert(/_ofFrozen\[/.test(az), '⭐ ومفيش كتابة متكررة لنفس اليوم في نفس الجلسة');
})();

// ============================================================
// ٤) 🆕 التصفير — أخطر زرار في التبويب
// ============================================================
(function(){
  const fn = extractFn(src, 'async function ofStartFresh(');
  assert(!!fn, 'لقينا ofStartFresh');
  if(!fn) return;
  assert(/confirm\(/.test(fn), '⭐ فيه تأكيد قبل ما الرصيد يتصفّر');
  assert(/paymobOpening/.test(fn),
    '⭐⭐ بيسأل عن رصيد Paymob كمان — الكاش لوحده مش كفاية');
  assert((fn.match(/< 0/g) || []).length >= 2, 'والأرقام السالبة مرفوضة');
  assert(/office_cash_epochs/.test(fn),
    '⭐ والنقطة القديمة بتتأرشف — عمرنا ما بنمسح تاريخ فلوس');
  assert(/\{ merge: true \}/.test(fn), 'والكتابة merge');
  assert(!/D\.cashBase *=/.test(fn),
    '⛔ مبيحدّثش الحالة يدوي — الـsnapshot هو مصدر الحقيقة (وإلا جهازين يختلفوا)');
})();

// ============================================================
// ٥) 🔍 العدّ الفعلي بيقول الفرق بصوت عالي
// ============================================================
(function(){
  const fn = extractFn(src, 'async function ofCountDay(');
  assert(!!fn, 'لقينا ofCountDay');
  if(!fn) return;
  assert(/عجز/.test(fn) && /أوفر/.test(fn),
    '⭐⭐ الفرق بيتقال صراحة (عجز/أوفر) مش بيتبلع بهدوء');
  assert(/confirm\(/.test(fn), 'وفيه تأكيد قبل ما يتسجّل');
  assert(/countedDiff/.test(fn), 'والفرق بيتحفظ في المستند للمراجعة');
})();

// ============================================================
// ٦) ✏️ التعديل اليدوي بيسيب أثر مراجعة
//    شيت من غير أثر = رقم محدش يعرف مين غيّره ولا ليه.
// ============================================================
(function(){
  const fn = extractFn(src, 'async function ofEditCell(');
  assert(!!fn, 'لقينا ofEditCell');
  if(!fn) return;
  assert(/audit/.test(fn) && /arrayUnion/.test(fn),
    '⭐⭐ كل تعديل بيتسجّل في سجل (مين/امتى/من كام لكام)');
  assert(/from: r\.raw\[field\]/.test(fn),
    '⭐ والرقم المحسوب الأصلي محفوظ — بدونه مفيش مقارنة');
  assert(/\{ merge: true \}/.test(fn), 'والكتابة merge');
  assert(/trim\(\) === ''/.test(fn),
    '⭐ وسيبها فاضية = ارجع للمحسوب (مش صفر)');
})();

// ============================================================
// ٧) 🥇 الدهب بسعر الشراء
//    سعر البيع بيخلّي الرقم أكبر من اللي هيقبضه فعلًا لو باع —
//    وده بالظبط نوع الكذب اللي التبويب موجود عشان يمنعه.
// ============================================================
(function(){
  const fn = extractFn(src, 'async function ofSetGoldPrice(');
  assert(!!fn, 'لقينا ofSetGoldPrice');
  if(!fn) return;
  assert(/goldBuyPrice/.test(fn), '⭐ بيتحفظ كـسعر شراء مش سعر بيع');
  assert(/goldPriceAt/.test(fn),
    '⭐⭐ ومعاه طابع وقته — من غيره مفيش طريقة نعرف السعر قديم');
  assert(/<= 0/.test(fn), 'وسعر صفر أو سالب مرفوض');
  const g = extractFn(src, 'function ofGoldValue(');
  assert(!!g && /stale/.test(g), 'والمحرك بيعلّم السعر القديم');
})();

// ============================================================
// ٨) 🔮 الشاشة بتفرّق بين المؤكد والمتوقّع
//    خلطهم في رقم واحد = المالك يصرف فلوس لسه ماوصلتش.
// ============================================================
(function(){
  const fn = extractFn(src, 'function renderCashHand(');
  const row = extractFn(src, 'function ofLedgerRow(');
  assert(!!fn && !!row, 'لقينا الشاشة والسطر');
  if(!fn || !row) return;
  assert(/معاك في إيدك/.test(fn), 'العنوان بيقول الكاش اللي في إيدك');
  assert(/L\.now/.test(fn),
    '⭐⭐ الرقم الكبير = الرصيد المؤكد (مش balanceExp)');
  assert(!/balanceExp/.test(fn),
    '⛔ الرصيد المتوقّع مش بيتعرض كرقم رئيسي');
  assert(/pmExpected/.test(row) && /dashed/.test(row),
    '⭐ والمتوقّع بيبان بخط متقطّع — شكله بيقول إنه لسه ماوصلش');
  assert(/متوقّع/.test(row), 'ومكتوب عليه "متوقّع" بالحروف');
})();

// ============================================================
// ٩) الاشتراكات متوصّلة (وإلا الشيت مايتحدّثش)
// ============================================================
(function(){
  assert(/office_cash_days/.test(bare), 'مجموعة تعديلات الأيام متسمّعة');
  assert(/office_cash_cfg/.test(bare), 'وإعدادات الدفتر');
  assert(/D\.cashDays/.test(bare) && /D\.cashCfg/.test(bare), 'ومتخزّنين في D');
  assert(/cashDays:\{\}/.test(bare) && /cashCfg:\{\}/.test(bare),
    '⭐ وبقيمة ابتدائية في D — من غيرها أول رسم بيقع قبل ما الاشتراك يرد');
})();
