// ============================================================
// ⭐ test-invoice-rating — تقييم العميلة على الفاتورة بتاعتها
//
// المطلوب (المالك): التقييم اللي بيروح للعميلة على تطبيق الولاء يظهر على
// فاتورتها في POS وفي التقارير وفي office.
//
// الباجان اللي كانوا مانعينه **خالص**:
//  ١) `renderLiveSalesHistory` كانت بتستخدم `from`/`to` — دول متغيرين
//     محليين جوه `renderReportsScreen`، مش موجودين في الدالة دي. فأول سطر
//     كان بيرمي ReferenceError، والـ`catch` بيبلعه بصمت، وخريطة التقييمات
//     تفضل **فاضية على طول**. الشارة عمرها ما ظهرت ولا مرة.
//  ٢) الربط كان بالتليفون + **3 دقايق** بس. وتقييم التطبيق بيوصل بعد
//     **نص ساعة** من الشراء — يعني بره النافذة دايمًا مهما حصل. مع إن
//     جواه `saleId` = رقم الفاتورة بالظبط (رابط مؤكد 100%).
//
// ⚠️ الاختبار بيشغّل `shLinkRatings` **الحقيقية** المستخرجة من المصدر
//    بالأقواس المتوازنة — مش بيدوّر على نصوص.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const POS = path.resolve(__dirname, '..', 'pos');
const repSrc = fs.readFileSync(path.join(POS, 'pos-reports.js'), 'utf8');
const offSrc = fs.readFileSync(path.resolve(__dirname, '..', 'Office', 'office.js'), 'utf8');

function extractFn(src, name){
  const start = src.indexOf('function ' + name + '(');
  if(start < 0) return '';
  const open = src.indexOf('{', start);
  let depth = 0;
  for(let i = open; i < src.length; i++){
    if(src[i] === '{') depth++;
    else if(src[i] === '}'){ depth--; if(depth === 0) return src.slice(start, i + 1); }
  }
  return '';
}

const linkSrc = extractFn(repSrc, 'shLinkRatings');
assert(linkSrc.length > 300, 'استخرجنا shLinkRatings بالأقواس المتوازنة');

const ctx = { _shTsOf: (s)=> s.ts, console };
vm.createContext(ctx);
vm.runInContext(linkSrc, ctx);
const link = ctx.shLinkRatings;
assert(typeof link === 'function', 'والدالة اشتغلت جوه الـsandbox');

const MIN = 60 * 1000;
const T = Date.UTC(2026, 6, 15, 12, 0, 0);
const BR = 'الرحاب';

// ============================================================
// ١) 🔑 تقييم التطبيق بعد 45 دقيقة — لازم يترّبط بالفاتورة بالظبط
//    ده الباج الأصلي: نافذة الـ3 دقايق كانت بتضيّعه دايمًا.
// ============================================================
{
  const sales = [{ id:'INV_A', ts:T, customerPhone:'01000000001', branch:BR }];
  const map = link(sales, [
    { r:4, ts:T + 45*MIN, branch:BR, saleId:'INV_A',
      customerPhone:'01000000001', note:'الخدمة كانت ممتازة', source:'app_after_visit' }
  ], BR);
  assert(!!map['INV_A'], '⭐ تقييم بعد 45 دقيقة اترّبط بالفاتورة (بره نافذة الـ3 دقايق تمامًا)');
  assertEq(map['INV_A'].r, 4, 'وبالدرجة الصح');
  assertEq(map['INV_A'].note, 'الخدمة كانت ممتازة', 'والكلام المكتوب اتحفظ معاه');
  assertEq(map['INV_A'].exact, true, 'ومتعلّم إنه رابط **مؤكد** مش تخمين');
}

// ============================================================
// ٢) 🧪 سلبي: من غير الربط بالـsaleId (المنطق القديم) التقييم بيضيع
// ============================================================
{
  const sales = [{ id:'INV_A', ts:T, customerPhone:'01000000001', branch:BR }];
  const entry = { r:4, ts:T + 45*MIN, branch:BR, saleId:'INV_A',
                  customerPhone:'01000000001', note:'ممتازة', source:'app_after_visit' };
  // المنطق القديم بالظبط: تليفون + 3 دقايق، والـsaleId متجاهَل
  const oldWay = (()=>{
    const d = Math.abs(entry.ts - sales[0].ts);
    return (entry.customerPhone === sales[0].customerPhone && d <= 3*MIN) ? entry : null;
  })();
  assert(oldWay === null,
    '🧪 سلبي: المنطق القديم (تليفون + 3 دقايق) مكانش بيلاقي التقييم ده أبدًا');
  assert(!!link(sales, [entry], BR)['INV_A'],
    '🧪 وبالمنطق الجديد بيلاقيه — يعني الفرق حقيقي مش تجميلي');
}

// ============================================================
// ٣) الرابط المؤكد بيغلب التخمين الزمني
// ============================================================
{
  const sales = [{ id:'INV_A', ts:T, customerPhone:'01000000001', branch:BR }];
  const map = link(sales, [
    { r:1, ts:T + 30*1000, branch:BR, customerPhone:'01000000001' },   // كشك بعد نص دقيقة
    { r:4, ts:T + 45*MIN,  branch:BR, saleId:'INV_A', customerPhone:'01000000001' }
  ], BR);
  assertEq(map['INV_A'].r, 4, '🎯 الرابط المؤكد (saleId) بيغلب التقييم القريب زمنيًا');
  assertEq(map['INV_A'].exact, true, 'ومتعلّم مؤكد');
}

// ============================================================
// ٤) تقييم الكشك (مفيهوش saleId) لسه شغّال بالتخمين الزمني — ومعلّم تقريبي
// ============================================================
{
  const sales = [{ id:'INV_K', ts:T, customerPhone:'01000000002', branch:BR }];
  const map = link(sales, [{ r:3, ts:T + 90*1000, branch:BR, customerPhone:'01000000002' }], BR);
  assert(!!map['INV_K'], 'تقييم الكشك لسه بيترّبط (مانكسرش)');
  assertEq(map['INV_K'].exact, false, '⚠️ بس **معلّم تقريبي** — عشان محدش يحاسب بياعة على تخمين');
}

// ============================================================
// ٥) مبيترّبطش غلط
// ============================================================
{
  const sales = [
    { id:'INV_A', ts:T,        customerPhone:'01000000001', branch:BR },
    { id:'INV_B', ts:T + MIN,  customerPhone:'01000000002', branch:BR },
    { id:'INV_C', ts:T + 2*MIN, customerPhone:'',           branch:BR }
  ];
  const map = link(sales, [
    { r:4, ts:T + 45*MIN, branch:BR, saleId:'INV_A', customerPhone:'01000000001' }
  ], BR);
  assert(!map['INV_B'], 'فاتورة تانية في نفس اليوم مخدتش التقييم بالغلط');
  assert(!map['INV_C'], 'وفاتورة من غير عميلة فضلت من غير تقييم');

  // تقييم كشك من فرع تاني متعديش
  const m2 = link([{ id:'INV_D', ts:T, customerPhone:'01000000009', branch:BR }],
                  [{ r:1, ts:T, branch:'مدينتي', customerPhone:'01000000009' }], BR);
  assert(!m2['INV_D'], '🏬 تقييم كشك من فرع تاني مبيعديش على فاتورة الفرع ده');

  // وتقييم كشك بعيد زمنيًا (10 دقايق) متعديش
  const m3 = link([{ id:'INV_E', ts:T, customerPhone:'01000000010', branch:BR }],
                  [{ r:1, ts:T + 10*MIN, branch:BR, customerPhone:'01000000010' }], BR);
  assert(!m3['INV_E'], '⏱️ وتقييم كشك بعد 10 دقايق مبيتخمّنش على الفاتورة');
}

// ============================================================
// ٦) 🛡️ الكلام المكتوب بيتهرّب قبل العرض
//    `note` جاي من تطبيق الولاء = كلام من برّه النظام. لو اتحط في
//    innerHTML من غير تهريب بقى حقن HTML.
// ============================================================
{
  const escSrc = extractFn(repSrc, '_rtEsc');
  assert(escSrc.length > 40, 'دالة التهريب _rtEsc موجودة في pos-reports.js');
  const c2 = {}; vm.createContext(c2); vm.runInContext(escSrc, c2);
  const out = c2._rtEsc('<img src=x onerror="alert(1)">');
  assert(out.indexOf('<') < 0 && out.indexOf('"') < 0,
    '🛡️ التهريب بيشيل < و" — مفيش حقن HTML من كلام العميلة');
  assertEq(c2._rtEsc('كويس & حلو'), 'كويس &amp; حلو', 'والعربي العادي بيعدي زي ما هو');

  const blockSrc = extractFn(repSrc, '_shRatingBlock');
  assert(blockSrc.indexOf('_rtEsc(rt.note)') >= 0,
    'وكارت التقييم في تفاصيل الفاتورة بيهرّب الكلام فعلًا قبل ما يعرضه');
  assert(repSrc.indexOf('_rtEsc(e.note)') >= 0,
    'وتقرير التقييمات بيهرّب الكلام كمان');
  assert(offSrc.indexOf('esc(rt.note)') >= 0,
    'وoffice بيهرّب الكلام برضه');
}

// ============================================================
// ٧) 🔴 حارس الباج الأصلي: النافذة الزمنية للتقييمات لازم تتحسب من
//    الفواتير نفسها — مش من `from`/`to` اللي مش موجودين في الدالة.
// ============================================================
{
  const histSrc = extractFn(repSrc, 'renderLiveSalesHistory');
  assert(histSrc.length > 400, 'استخرجنا renderLiveSalesHistory');
  // بنشيل التعليقات الأول عشان الشرح اللي بيذكر from/to مايلخبطش الفحص
  const code = histSrc.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert(!/\bfrom\.getTime\(\)/.test(code) && !/\bto\.getTime\(\)/.test(code),
    '🔴 مفيش استخدام لـfrom/to (المتغيرين اللي مش موجودين في الدالة دي)');
  assert(/_minTs|_maxTs/.test(code),
    'والنافذة متحسوبة من توقيتات الفواتير المتحمّلة نفسها');
  assert(/48\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(code),
    '⏳ وآخر النافذة ممدود يومين — لأن تقييم التطبيق بيتأخر (إشعار بعد نص ساعة)');
}

// ============================================================
// ٨) office: نفس الربط المؤكد وممتد يومين
// ============================================================
{
  assert(/_ofRatingBySale\[e\.saleId\]/.test(offSrc),
    '🏢 office بيربط التقييم بالـsaleId');
  assert(/48\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(offSrc),
    'وبنفس امتداد اليومين');
  const rowSrc = extractFn(offSrc, 'ofRenderSales');
  assert(/ofSaleRating\(s\)/.test(rowSrc),
    'وسطر الفاتورة في سجل المبيعات بيعرض التقييم');
}
