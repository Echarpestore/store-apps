// ============================================================
// 🎁 test-receipt-points — بلوك نقط العميلة على الفاتورة
//
// اللي بيحرسه:
//   · الاسم الأول بس (الفاتورة بتترمى في الشارع)
//   · الرصيد **بعد** الفاتورة مش قبلها
//   · النقط المستبدلة مطروحة
//   · البلوك مبيظهرش من غير عميلة
//   · ⭐ ومبيتسربش للفاتورة اللي بعدها (درس paymobCardInfo)
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const appSrc  = fs.readFileSync(path.join(ROOT, 'pos', 'app.js'), 'utf8');
const saleSrc = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');
const repSrc  = fs.readFileSync(path.join(ROOT, 'pos', 'pos-reports.js'), 'utf8');

// ⚠️ الشيّال البسيط (اللي في باقي ملفات الاختبار) **مبيشتغلش على app.js**:
//    الملف فيه `accept="image/*"` جوه نص HTML — الـ`/*` دي بتفتح تعليق
//    وهمي بيفضل مفتوح لحد أول `*/` حقيقية بعدها بـ٢٠ ألف حرف، فبيبلع
//    نص الملف ومعاه البلوك اللي إحنا بنختبره. الاختبار ساعتها بيقول
//    "الميزة مش موجودة" وهي موجودة — أو الأخطر: يقول "الثغرة مقفولة"
//    وهو أصلًا مش شايف الكود.
//    الحل: نشيل بس التعليقات اللي في أول السطر (وده عُرف الملفات دي).
function stripComments(s){
  return s
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, ' ')   // بلوك بادئ السطر بس
    .replace(/^[ \t]*\/\/[^\n]*/gm, ' ')          // وسطر تعليق كامل
    .replace(/([^:'"\\])\/\/[^\n]*$/gm, '$1 ');   // وتعليق آخر سطر كود
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
// بيستخرج بلوك `case 'x': { ... }` من switch
function extractCase(s, name){
  const i = s.indexOf("case '" + name + "':");
  if(i < 0) return null;
  let d = 0, st = false;
  for(let j = i; j < s.length; j++){
    if(s[j] === '{'){ d++; st = true; }
    else if(s[j] === '}'){ d--; if(st && d === 0) return s.slice(i, j + 1); }
  }
  return null;
}
const appBare  = stripComments(appSrc);
const saleBare = stripComments(saleSrc);

// ============================================================
// ١) العنصر موجود في محرر التصميم
// ============================================================
(function(){
  assert(/id:'custPoints'/.test(appBare), 'العنصر متسجّل في RECEIPT_ELEMENTS');
  assert(/custPoints:\{ show:true/.test(appBare) || /custPoints:\s*\{\s*show:true/.test(appBare),
    '⭐ وفيه معاينة في المحرر — المالك يشوف شكله قبل ما يشغّله');
  assert(/case 'custPoints'/.test(appBare), 'وليه راسم في بانّي الفاتورة');
})();

// ============================================================
// ٢) 🔒 البلوك مبيظهرش من غير عميلة
// ============================================================
(function(){
  const c = extractCase(appSrc, 'custPoints');
  assert(!!c, 'لقينا راسم البلوك');
  if(!c) return;
  assert(/if\(!cp \|\| !cp\.show\) break;/.test(c),
    '⭐⭐ فاتورة من غير عميلة = البلوك مبيتطبعش خالص');
})();

// ============================================================
// ٣) 🕵️ الاسم الأول بس — خصوصية
//    الفاتورة بتتساب على الترابيزة وبتترمى في الشارع.
// ============================================================
(function(){
  const fn = extractFn(appSrc, 'function printReceipt(');
  assert(!!fn, 'لقينا printReceipt');
  if(!fn) return;
  assert(/split\(\/\\s\+\/\)\[0\]/.test(fn),
    '⭐⭐ الاسم بيتقص على أول كلمة — مفيش اسم كامل على ورقة في الشارع');
  assert(!/phone:\s*src\.phone[\s\S]{0,80}name:[\s\S]{0,40}String\(src\.name\|\|''\)\s*,/.test(fn),
    'ورقم الموبايل مش بيتطبع');
  const c = extractCase(appSrc, 'custPoints');
  assert(!!c && !/cp\.phone/.test(c), '⛔ والراسم نفسه معندوش وصول للرقم');
})();

// ============================================================
// ٤) ⭐⭐ الرصيد **بعد** الفاتورة مش قبلها
//    لو كتبنا رصيد قبلها، العميلة تفتح التطبيق تلاقي رقم تاني
//    وتفتكر إن فيه غلط.
// ============================================================
(function(){
  const fn = extractFn(appSrc, 'function printReceipt(');
  if(!fn) return;
  assert(/balanceBefore/.test(fn) && /\+ \(Number\(src\.earned\)\|\|0\)/.test(fn),
    '⭐⭐ الرصيد = اللي قبلها + المكتسب');
  assert(/- \(Number\(src\.redeemed\)\|\|0\)/.test(fn),
    '⭐⭐ ناقص اللي استبدلته في نفس الفاتورة');
  assert(/Math\.max\(0,/.test(fn), 'ومفيش رصيد سالب على الورقة');
})();

// ============================================================
// ٥) ↩️ المرتجع بيقول "اتخصم" مش "كسبتي −٣"
// ============================================================
(function(){
  const c = extractCase(appSrc, 'custPoints');
  if(!c) return;
  assert(/cp\.earned > 0/.test(c) && /cp\.earned < 0/.test(c),
    '⭐ فيه فرق بين الكسب والخصم');
  assert(/اتخصم/.test(c) && /Math\.abs\(cp\.earned\)/.test(c),
    '⭐⭐ والمرتجع بيتكتب "اتخصم ٣ نقط" مش "كسبتي −٣"');
  assert(/استبدلتي/.test(c), 'والاستبدال بيتقال صراحة');
})();

// ============================================================
// ٦) 🧹 ⭐⭐ مبيتسربش للفاتورة اللي بعدها
//    ده بالظبط باج `paymobCardInfo` القديم: بيانات على window
//    ماتصفرتش فطبعت "فيزا" على فاتورة كاش.
// ============================================================
(function(){
  const fn = extractFn(saleSrc, 'const _printNow = function(){')
    || saleSrc.slice(saleSrc.indexOf('const _printNow'), saleSrc.indexOf('const _printNow') + 3000);
  assert(/window\.receiptCustPoints = phone \?/.test(saleBare),
    '⭐ البيانات بتتحط بشرط وجود رقم عميلة');
  assert(/finally\{ try\{ window\.receiptCustPoints = null; \}catch\(e\)\{\} \}/.test(saleSrc),
    '⭐⭐ وبتتصفّر في finally — حتى لو الطباعة وقعت');
  // ⭐ الترتيب: التصفير لازم يكون **بعد** الطباعة مش قبلها
  const setAt = saleSrc.indexOf('window.receiptCustPoints = phone ?');
  const printAt = saleSrc.indexOf('printReceipt(paymentsEntered');
  const clearAt = saleSrc.indexOf('finally{ try{ window.receiptCustPoints = null;');
  assert(setAt > 0 && printAt > setAt && clearAt > printAt,
    '⭐⭐ الترتيب صح: تحط → تطبع → تصفّر');
})();

// ============================================================
// ٧) 🔁 النسخة التانية من غير رصيد
//    النسخة ممكن تتطبع بعد أيام والعميلة اشترت من ساعتها —
//    ورقة برصيد غلط أوحش من ورقة من غير رصيد.
// ============================================================
(function(){
  assert(/custPoints: \{ show:false \}/.test(repSrc),
    '⭐⭐ إعادة الطباعة من السجل مبتطبعش رصيد قديم');
  const i = repSrc.indexOf('custPoints: { show:false }');
  const j = repSrc.indexOf('isCopy: true');
  assert(i > 0 && j > 0 && Math.abs(i - j) < 400,
    'والقرار جوه بانّي النسخة التانية بالظبط');
})();

// ============================================================
// ٨) 🖨️ الراسم بيطلّع HTML فعلًا (مش نص بس)
// ============================================================
(function(){
  const c = extractCase(appSrc, 'custPoints');
  if(!c) return;
  const box = { parts: [], d: {}, fs: '11px' };
  const run = function(cp){
    box.parts = []; box.d = { custPoints: cp };
    const code = 'const cp = d.custPoints;\n'
      + c.slice(c.indexOf('{') + 1, c.lastIndexOf('}'))
         .replace(/const cp = d\.custPoints;/, '')
         .replace(/break;/g, 'BREAK();');
    const sb = { parts: box.parts, d: box.d, fs: box.fs, Math: Math, Number: Number, String: String,
                 BREAK: function(){ throw { __brk: true }; } };
    vm.createContext(sb);
    try{ vm.runInContext(code, sb, { timeout: 2000 }); }
    catch(e){ if(!e || !e.__brk) throw e; }
    return box.parts.join('');
  };

  const html = run({ show:true, name:'منى', earned:5, redeemed:0, balance:23 });
  assert(/منى/.test(html), '🖨️ الاسم بيتطبع');
  assert(/كسبتي/.test(html) && />5</.test(html.replace(/<b>/g,'>').replace(/<\/b>/g,'<')) || /5/.test(html),
    'والنقط المكتسبة');
  assert(/رصيدك دلوقتي: 23/.test(html), '⭐ والرصيد الحالي');
  assert(!/استبدلتي/.test(html), 'ومن غير استبدال = السطر مبيظهرش');

  const withRedeem = run({ show:true, name:'سارة', earned:2, redeemed:10, balance:5 });
  assert(/استبدلتي/.test(withRedeem) && /10/.test(withRedeem), '🎁 وسطر الاستبدال بيظهر لما يحصل');

  const refund = run({ show:true, name:'هدى', earned:-3, redeemed:0, balance:7 });
  assert(/اتخصم/.test(refund) && !/كسبتي/.test(refund), '↩️ والمرتجع بيتكتب صح');

  assertEq(run({ show:false }), '', '🔒 ومن غير عميلة مفيش أي HTML خالص');
})();
