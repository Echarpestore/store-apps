// ============================================================
// 🏷️ جودة طباعة الليبل (حرارية 203dpi)
// المشاكل اللي الاختبار ده بيقفلها:
//   ١) التمطيط بالنسبة المئوية — الخطوط بتقع على أنصاف نقط والماسح مش بيقرا
//   ٢) «ساعات الكود يظهر تحت الباركود وساعات لأ» — كان عنصر منفصل ممكن
//      يتقفل في تصميم براند (Glow/echarpe لكل واحد مستند تصميم لوحده)
//   ٣) الأرقام جوه الـSVG كانت بتتعصر مع الصندوق وتختفي
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appSrc = fs.readFileSync(path.resolve(__dirname, '..', 'pos', 'app.js'), 'utf8');

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

// ============================================================
// ١) 📐 الحساب النقي: كل خط = عدد نقط حرارية صحيح
// ============================================================
{
  const sb = { window:{}, Object, Math, Number, JSON };
  vm.createContext(sb);
  const code = extractFn(appSrc, 'labelBarcodeMm');
  assert(code.length > 0, 'labelBarcodeMm موجودة');
  vm.runInContext(code, sb);
  const mm = (m, w)=> vm.runInContext(`labelBarcodeMm(${m}, ${w})`, sb);

  // كود 13 رقم (Code128C) ≈ 112 موديول على ليبل 58مم
  const a = mm(112, 58);
  assertEq(a.moduleMm, 0.25, 'الموديول = 0.25مم (نقطتين حراريتين بالظبط)');
  assertEq(a.totalMm, 28, '112 موديول × 0.25 = 28مم — جوه الـ52مم المتاحة');
  assertEq(a.quietMm, 3, 'منطقة هدوء 3مم (≥10 موديولات) على الجنبين');

  // كود طويل على ليبل ضيق → نقطة واحدة بدل التمطيط
  const b = mm(300, 40);
  assertEq(b.moduleMm, 0.125, 'كود طويل وليبل ضيق → نقطة واحدة (مش تمطيط كسري)');
  assertEq(b.totalMm, 37.5, '300 × 0.125 = 37.5مم');

  // الموديول دايمًا نقط صحيحة على 203dpi (8 نقط/مم)
  [mm(112,58), mm(300,40), mm(145,58), mm(80,25)].forEach(function(r, i){
    const dots = r.moduleMm * 8;
    assertEq(dots, Math.round(dots), 'حالة ' + (i+1) + ': الموديول = ' + dots + ' نقطة صحيحة');
  });

  // ليبل صغير 25مم بكود قصير — لسه 0.25
  assertEq(mm(70, 25).moduleMm, 0.25, 'ليبل 25مم بكود قصير → نقطتين عادي');
}

// ============================================================
// ٢) 🔌 التوصيل في مسار الطباعة الفعلي
// ============================================================
{
  const dp = extractFn(appSrc, 'doPrintLabels');
  assert(dp.length > 0, 'doPrintLabels موجودة');
  assert(/width:1, height:80/.test(dp), 'JsBarcode بيرسم بموديول=1 (عشان width = عدد الموديولات)');
  assert(/margin:0/.test(dp), 'مفيش هامش جوه الـSVG — الهدوء من الحاوية بالمليمتر');
  assert(/displayValue:false/.test(dp), '🔴 الأرقام مش جوه الـSVG (كانت بتتعصر وتختفي)');
  assert(/sizeBarcodeForThermal\(el, labelWmmForPrint\)/.test(dp), 'التثبيت بالمليمتر بيتنادى بعد الرسم');
  assert(!/displayValue:true/.test(dp), 'مفيش displayValue:true في مسار الطباعة');

  const sz = extractFn(appSrc, 'sizeBarcodeForThermal');
  assert(/labelBarcodeMm\(naturalW, labelWmm\)/.test(sz), 'المقاس من الدالة النقية');
  assert(/svg\.style\.width = mm\.totalMm \+ 'mm'/.test(sz), 'العرض بالمليمتر بالظبط — مش نسبة مئوية');
  assert(/window\.labelBarcodeMm = labelBarcodeMm/.test(appSrc), 'labelBarcodeMm على window (القاعدة الذهبية)');
  assert(/window\.sizeBarcodeForThermal = sizeBarcodeForThermal/.test(appSrc), 'sizeBarcodeForThermal على window');
}

// ============================================================
// ٣) 🔢 الرقم تحت الباركود — ثابت دايمًا، مش رهن تصميم البراند
// ============================================================
{
  const bl = extractFn(appSrc, 'buildLabelHTML');
  assert(bl.length > 0, 'buildLabelHTML موجودة');
  // الأرقام جوه بلوك الباركود نفسه
  const bcCase = bl.slice(bl.indexOf("case 'barcode'"), bl.indexOf("case 'code'"));
  assert(/\$\{it\.barcode\}/.test(bcCase), '🔴 الرقم بيتطبع مع الباركود دايمًا (مش عنصر ممكن يتقفل في تصميم براند)');
  assert(/monospace/.test(bcCase), 'الرقم بخط monospace ثابت');
  // التمطيط بالنسبة المئوية اتشال من بلوك الباركود
  assert(!/width:\$\{lb\.bcWidthPct/.test(bcCase), '🔴 التمطيط بالنسبة المئوية اتشال (كان بيبعثر الخطوط)');
  assert(!/preserveAspectRatio="none"/.test(bcCase), 'مفيش تمطيط أفقي في الـHTML — بيتظبط بعد الرسم بالمليمتر');
  // العنصر المنفصل مش بيكرر الرقم لو الباركود شغال
  const codeCase = bl.slice(bl.indexOf("case 'code'"));
  assert(/!\(lb\.elements\|\|\[\]\)\.some/.test(codeCase), 'عنصر الكود المنفصل بيشتغل بس لو الباركود مقفول — منع التكرار');
}

// ============================================================
// ٤) 🖨️ أوامر الحبر في مستند الطباعة
// ============================================================
{
  assert(/print-color-adjust:exact/.test(appSrc), 'الحبر الكامل مفروض في مستند الطباعة');
  assert(/text-rendering:geometricPrecision/.test(appSrc), 'دقة النص الهندسية للخطوط الصغيرة');
}
