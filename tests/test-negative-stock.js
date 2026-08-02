// ============================================================
// 📦 test-negative-stock — الرصيد السالب في شاشات المخزون
//
// الشكوى (المالك): استلام البضاعة بيتسجل فيه **التالف** بكمية سالبة،
// والتالف غالبًا صنف رصيده صفر في النظام (الجرد لسه ماتعملش) → النظام
// يرفض. النتيجة إن التالف مايتسجلش خالص، فالأرقام تبعد عن الواقع **أكتر**.
//
// 🔒 القرار المعماري: ده **إعداد** مش تغيير سلوك ثابت.
//    الافتراضي **false** — أي محل جديد يشتري النظام بيلاقيه مقفول.
//    المالك بيفتحه لفروعه مؤقتًا لحد ما الجرد الفعلي يتعمل.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const POS = path.resolve(__dirname, '..', 'pos');
const prod = fs.readFileSync(path.join(POS, 'products.js'), 'utf8');
const core = fs.readFileSync(path.join(POS, 'pos-core.js'), 'utf8');

// (١) 🔒 الافتراضي مقفول — أهم فحص في الملف ده
assert(/let allowNegativeStock = false;/.test(core),
  '🔒 الافتراضي false — المحل اللي يشتري النظام بيلاقيه مقفول');
assert(/window\.allowNegativeStock = false;/.test(core),
  'وعلى window كمان بـfalse (القاعدة الذهبية — من غيرها undefined)');
assert(core.indexOf("doc('inventory_cfg')") >= 0,
  'وبيتقرا من pos_test_settings/inventory_cfg');
assert(/allowNegativeStock = v;\s*\n\s*window\.allowNegativeStock = v;/.test(core),
  'والمتغير المحلي وwindow بيتحدّثوا مع بعض — مش واحد بس');

// (٢) الإعداد بيتقرا من window مش من متغير محلي في products.js
//     (ملفات POS منفصلة — const/let مش بتعدّي بينهم)
const usages = (prod.match(/window\.allowNegativeStock/g) || []).length;
assert(usages >= 2, '📄 products.js بيقرا الإعداد من window (' + usages + ' مرة)');
assert(!/^\s*(let|const|var)\s+allowNegativeStock/m.test(prod),
  '🛡️ ومفيش نسخة محلية في products.js تتعارض مع اللي في pos-core');

// (٣) المنع لسه موجود — بس تحت شرط
assert(prod.indexOf('مينفعش تخصم أكتر من الموجود') >= 0,
  'رسالة المنع لسه موجودة (مش اتشالت — اتشرطت)');
assert(/if\(!window\.allowNegativeStock\)\{[\s\S]{0,220}?مينفعش تخصم أكتر من الموجود/.test(prod),
  '🔴 والمنع بيشتغل **بس** لما الإعداد مقفول');

// (٤) شاشة التسوية السريعة كمان
assert(/if\(!window\.allowNegativeStock\)\{[\s\S]{0,200}?مينفعش تخصم \$\{qty\}/.test(prod),
  'وشاشة تسوية الكمية بنفس الشرط — مش مكان واحد بس');

// (٥) ⚠️ الرصيد السالب مبيعديش بصمت
assert(prod.indexOf('_negRows') >= 0, 'الأصناف اللي هتنزل سالب بتتجمّع');
assert(/askConfirm\(\{[\s\S]{0,200}?رصيد سالب/.test(prod),
  '⚠️ وفيه تأكيد صريح قبل التسجيل — مش حاجة تعدي من غير ما الكاشير تاخد بالها');
assert(/if\(!ok\) return;/.test(prod), 'ورفض التأكيد بيوقف العملية فعلًا');

// (٦) 🧪 سلبي: لو الافتراضي اتقلب لـtrue الاختبار لازم يقع
{
  const flipped = core.replace('let allowNegativeStock = false;', 'let allowNegativeStock = true;');
  assert(!/let allowNegativeStock = false;/.test(flipped),
    '🧪 سلبي: نسخة الافتراضي المقلوب اتبنت — والفحص (١) كان هيقع عليها');
}
