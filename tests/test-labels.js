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

// ============================================================
// 💰 درج الكاش في المرتجع
// الباج: `hasCash = Number(payments.cash) > 0` — وفاتورة المرتجع بتحمل
// مدفوعات سالبة (cash: -500)، فالدرج مكانش بيفتح في المرتجع الكاش خالص.
// ============================================================
{
  const m = appSrc.match(/const hasCash = payments &&[^;]*;/);
  assert(!!m, 'سطر hasCash اتلقى');
  const line = m[0];
  assert(/Math\.abs\(/.test(line), '💰 الشرط بيستخدم القيمة المطلقة (حركة كاش، مش دخول بس)');
  assert(!/Number\(payments\.cash\) > 0\s*;/.test(line), '❌ الشرط القديم `> 0` اتشال');

  // سلوكيًا — نفس السطر بالظبط من المصدر
  const hasCash = new Function('payments', 'return ' + line.replace('const hasCash =','').replace(/;$/,'') + ';');
  const t = (p)=> !!hasCash(p);
  assert(t({cash:500})        === true,  'بيع كاش → الدرج يفتح');
  assert(t({cash:-500})       === true,  '🔑 مرتجع كاش → الدرج يفتح (ده كان الباج)');
  assert(t({cash:-120})       === true,  'مرتجع كاش جزئي → يفتح');
  assert(t({cash:-200,visa:-300}) === true, 'مرتجع مختلط فيه كاش → يفتح');
  assert(t({cash:200,visa:300})   === true, 'بيع مختلط فيه كاش → يفتح');
  assert(t({visa:800})        === false, 'بيع فيزا بالكامل → مايفتحش');
  assert(t({visa:-800})       === false, 'مرتجع فيزا → مايفتحش (مفيش كاش بيتحرك)');
  assert(t({})                === false, 'تبديل متساوي → مايفتحش');
  assert(t({cash:0})          === false, 'كاش صفر → مايفتحش');
  assert(t(null)              === false, 'مفيش مدفوعات → مايفتحش من غير ما تقع');
}

// ============================================================
// 🎯 حارس التركيز في شاشة البيع
// الشكوى: «بيعمل لاج ومش بيكتب» في كل الفروع. التركيز بيضيع بعد قفل أي
// نافذة، والحروف بتتبلع في مخزن المسح العام بدل خانة البحث.
// ============================================================
{
  const g = appSrc.match(/\(function\(\)\{\s*\n\s*if\(window\._focusGuardOn\) return;[\s\S]*?\n\}\)\(\);/);
  assert(!!g, 'بلوك حارس التركيز موجود');
  const blk = g ? g[0] : '';

  assert(/window\._focusGuardOn = true;/.test(blk), '🔒 بيتركّب مرة واحدة بس');
  assert(/if\(!saleVisible\(\) \|\| busy\(\)\) return;/.test(blk),
    'مابيشتغلش غير في شاشة البيع ولما مفيش نافذة مفتوحة');
  assert(/if\(a && a !== document\.body && a\.tagName !== 'HTML'\) return;/.test(blk),
    '🔑 الشرط الضيق: بيرجّع التركيز بس لو مفيش أي حاجة متفوكسة');
  assert(/\.modal-overlay\.active/.test(blk), 'بيحترم النوافذ الثابتة');
  ['askTextOverlay','askConfirmOverlay','cancelTerminalOverlay'].forEach(id=>{
    assert(blk.indexOf(id) >= 0, `بيحترم نافذة ${id}`);
  });
  assert(/sb\.offsetParent !== null/.test(blk), 'ومابيفوكسش خانة مخفية');
  assert(/\}catch\(e\)\{\}/.test(blk), '🛡️ أي خطأ فيه ميوقفش الشاشة');

  // ⚠️ الحارس علاج للعرض — الأصل إن focusSearchBar بتتنادى وقت الدخول بس
  assert(/function focusSearchBar\(\)/.test(appSrc), 'focusSearchBar لسه موجودة');
  assert(appSrc.indexOf('_focusGuardOn') < appSrc.indexOf('// >>> GSCAN_START'),
    'الحارس متعرّف قبل معالج المسح العام');
}

// ============================================================
// 🪟 استرجاع تركيز الويندوز بعد نوافذ الطباعة
// الشكوى: «السيستم بيقف عن الكتابة في كل الشاشات — لازم نفتح QuickBooks
// ونكتب فيه ونرجع». مش ضياع تركيز جوه الصفحة (الرجوع من برنامج تاني كان
// هيرجّع نفس الحالة) — ده تركيز نظام التشغيل ماسكته نافذة طباعة.
// ============================================================
{
  const POS = path.resolve(__dirname, '..', 'pos');
  // استخراج بالأقواس المتوازنة — مش regex هش (قاعدة §0)
  const extractFn = (src, name)=>{
    const at = src.indexOf('function ' + name + '(');
    if(at < 0) return '';
    const open = src.indexOf('{', at);
    let depth = 0;
    for(let i = open; i < src.length; i++){
      if(src[i] === '{') depth++;
      else if(src[i] === '}'){ depth--; if(depth === 0) return src.slice(at, i + 1); }
    }
    return '';
  };
  const core = fs.readFileSync(path.join(POS,'pos-core.js'),'utf8');
  const fn = extractFn(core, 'reclaimWindowFocus');
  assert(fn.length > 0, 'دالة استرجاع التركيز موجودة');
  assert(/window\.focus\(\)/.test(fn), '🪟 بترجّع تركيز النافذة الرئيسية');
  assert(/document\.contains\(el\)/.test(fn),
    'وبتتأكد إن الخانة القديمة لسه في الصفحة قبل ما تفوكسها');
  assert(/steps\.forEach[\s\S]*setTimeout\(back/.test(fn),
    '🔁 فيه محاولات متكررة — الطباعة/ويندوز ممكن يتأخروا');
  assert(/6000/.test(fn), '🪟 الاسترجاع الممتد يغطي فقدان Windows focus بعد الطباعة البطيئة');
  assert(/window\.reclaimWindowFocus = reclaimWindowFocus;/.test(core),
    'متعرّضة على window (القاعدة الذهبية — الملفات التانية بتناديها)');

  // ---- 🔴 النافذة اللي عمرها ما كانت بتقفل ----
  const rep = fs.readFileSync(path.join(POS,'pos-reports.js'),'utf8');
  const openAt = rep.indexOf("window.open('', '', 'width=420,height=640')");
  assert(openAt > 0, 'نافذة طباعة التقرير اتلقت');
  const after = rep.slice(openAt, openAt + 1400);
  assert(/w\.close\(\)/.test(after), '🔑 بقت بتقفل (كانت بتفضل مفتوحة ماسكة التركيز)');
  assert(after.indexOf('w.print()') < after.indexOf('w.close()'),
    'وبتقفل بعد الطباعة مش قبلها');

  // ---- كل نافذة طباعة بتنادي الاسترجاع ----
  [['app.js',1],['loyalty.js',1],['pos-sale.js',1],['staff.js',1],['pos-reports.js',2]]
    .forEach(([f,n])=>{
      const src = fs.readFileSync(path.join(POS,f),'utf8');
      const hits = (src.match(/reclaimWindowFocus\(/g) || []).length;
      assert(hits >= n, `${f}: بينادي استرجاع التركيز بعد نافذة الطباعة`);
      assert(/typeof reclaimWindowFocus === 'function'/.test(src),
        `${f}: بحزام أمان لو الملف اتحمّل قبل pos-core`);
    });
}

// ============================================================
// 🔢 الرقم تحت الباركود كان **بيختفي** — السبب الحقيقي
// الليبل flex عمودي + overflow:hidden. بلوك الباركود كان flex-shrink:0،
// وسطر الرقم كان overflow:hidden — وده في الفليكس بيخلي أقل حجم = صفر.
// فأول ما المحتوى يزيد عن ارتفاع الليبل، الرقم هو اللي بيتعصر لحد ما يختفي،
// والباركود واقف مكانه فمفيش مساحة ترجع.
// ============================================================
{
  const vm2 = require('vm');
  function render(labelH, bcHeight){
    const sb = {
      Math, Number, String, JSON,
      receiptDesignConfig: {
        logo: '',
        elements: [{ id:'shopName', text:'echarpe' }],
        label: {
          bcHeight: bcHeight,
          elements: [
            { id:'shop',    base:'shop',    on:true, size:9 },
            { id:'name',    base:'name',    on:true, size:13 },
            { id:'price',   base:'price',   on:true, size:20 },
            { id:'barcode', base:'barcode', on:true },
          ]
        }
      },
      defaultReceiptConfig: ()=>({ elements:[], label:{} }),
      defaultLabelConfig: ()=>({ elements:[] }),
      labelSizeMM: ()=>({ w:40, h:labelH }),
      currencyLabel: ()=>'EGP',
    };
    vm2.createContext(sb);
    vm2.runInContext(extractFn(appSrc, 'buildLabelHTML'), sb);
    return vm2.runInContext(
      `buildLabelHTML({ name:'طرحة سادة', price:200, barcode:'ECH0012345' }, 'bc_0')`, sb);
  }

  const out = render(25, 30);
  assert(out.indexOf('ECH0012345') >= 0, '🔢 الرقم موجود في ناتج الليبل');

  // الرقم لازم يكون **جوه** بلوك مبيصغّرش مع الـsvg — مش سطر منفصل بيتعصر
  const wrapAt = out.indexOf('flex-shrink:0; width:100%');
  assert(wrapAt >= 0, 'فيه بلوك واحد مبيصغّرش حوالين الباركود');
  assert(out.indexOf('id="bc_0"') > wrapAt, 'والـsvg جواه');
  assert(out.indexOf('ECH0012345') > out.indexOf('id="bc_0"'), 'والرقم بعده جوه نفس البلوك');
  const wrapEnd = out.indexOf('</div></div>', wrapAt);
  assert(wrapEnd > out.indexOf('ECH0012345'),
    '🔴 الرقم جوه البلوك اللي مبيصغّرش — مش برّه (ده كان سبب اختفائه)');

  // سطر الرقم نفسه مالوش overflow:hidden (ده اللي كان بيسمح له يوصل لصفر)
  const numLine = out.slice(out.lastIndexOf('<div style="flex-shrink:0; font-size'),
                            out.indexOf('ECH0012345'));
  assert(numLine.indexOf('overflow:hidden') < 0,
    '🔴 overflow:hidden اتشال من سطر الرقم — هو اللي بيخلي أقل ارتفاع = صفر في الفليكس');
  assert(/flex-shrink:0/.test(numLine), 'وبقى صراحةً مبيصغّرش');
  const fsz = Number((numLine.match(/font-size:(\d+)px/) || [])[1]);
  assert(fsz >= 10, 'وحجم الخط اترفع لـ' + fsz + 'px (كان 9)');

  // ارتفاع الباركود مسقوف بنسبة من الليبل — وإلا البلوك لوحده أطول من الليبل
  function bcPx(html){ return Number((html.match(/height:(\d+)px; line-height:0/) || [])[1]); }
  assertEq(bcPx(render(40, 30)), 30, 'ليبل 40مم: الارتفاع المطلوب زي ما هو');
  const small = bcPx(render(25, 200));
  assert(small > 0 && small < 200, 'ليبل 25مم وارتفاع مبالغ: اتسقف لـ' + small + 'px');
  assert(small <= Math.round(25 * 0.45 * 3.7795) ,
    '🔴 السقف = 45% من ارتفاع الليبل — من غيره البلوك أطول من الليبل والرقم يتقص برّه');
  assert(bcPx(render(50, 200)) > small, 'وليبل أكبر = سقف أكبر (النسبة مش رقم ثابت)');
}
