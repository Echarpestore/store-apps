// ============================================================
// 🩺 test-office-actions — إجراءات صفحة الموظف في office (المرحلة 2)
//
// ⚠️ القاعدة الحاكمة: office **لازم يكتب نفس اللي sales بيكتبه بالظبط** —
//    نفس الحسابات ونفس الحقول. أي اختلاف = المرتب يطلع رقمين مختلفين
//    حسب مين اللي داس على الزرار.
//
//  • قفل الشيفت المنسي: الانصراف = نهاية الشيفت المجدولة (مش دلوقتي)،
//    بيعدّي نص الليل صح، فولباك 8س15د، ومفيش وقت إضافي ولا خصم بدري
//  • زيادة البريك: الفعلي − المسموح − السماح، وكل 10 دقايق = ساعة (floor)
//  • العذر مش مسح: hours=0 + originalHours + excused
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const OFF = path.resolve(__dirname, '..', 'Office');
const src = fs.readFileSync(path.join(OFF, 'office.js'), 'utf8');
const salesSrc = fs.readFileSync(path.resolve(__dirname, '..', 'sales', 'sales-ui.js'), 'utf8');

function extractFn(s, name){
  const st = s.indexOf('function ' + name + '(');
  if(st < 0) return '';
  const op = s.indexOf('{', st);
  let d = 0;
  for(let i = op; i < s.length; i++){
    if(s[i] === '{') d++;
    else if(s[i] === '}'){ d--; if(d === 0) return s.slice(st, i + 1); }
  }
  return '';
}
const ctx = { Number: Number, String: String, Math: Math, Date: Date, Object: Object };
ctx.globalThis = ctx;
vm.createContext(ctx);
{
  const m = src.match(/const OF_TIME_DEFAULTS = [^;]+;/);
  assert(!!m, 'افتراضيات البريك معرّفة');
  vm.runInContext(m[0], ctx);
}
['ofGraceCloseTs', 'ofBreakOverHours', 'ofHubCredits'].forEach(function(n){
  const f = extractFn(src, n);
  assert(f.length > 30, 'استخرجنا ' + n);
  vm.runInContext(f, ctx);
});

// ============================================================
// 1) 🚪 قفل الشيفت = نهاية الشيفت المجدولة مش دلوقتي
// ============================================================
(function(){
  const clockIn = new Date(2026, 7, 3, 10, 20).getTime();   // جه 10:20
  const ts = ctx.ofGraceCloseTs({ clockInTs: clockIn }, { shift: 'morning' },
    { morning: { end: '18:00' } });
  const d = new Date(ts);
  assertEq(d.getHours() + ':' + d.getMinutes(), '18:0', 'الانصراف 6 مساءً (نهاية الشيفت)');
  assertEq(d.getDate(), 3, 'نفس اليوم');
})();

// 2) 🌙 شيفت بيعدّي نص الليل: النهاية «قبل» الحضور = اليوم اللي بعده
(function(){
  const clockIn = new Date(2026, 7, 3, 16, 0).getTime();    // جه 4 عصرًا
  const ts = ctx.ofGraceCloseTs({ clockInTs: clockIn }, { shift: 'night' },
    { night: { end: '01:00' } });
  const d = new Date(ts);
  assertEq(d.getDate(), 4, '⛔ الانصراف تاني يوم مش نفس اليوم (وإلا الشيفت يطلع بالسالب)');
  assertEq(d.getHours(), 1, 'الساعة 1 الفجر');
})();

// 3) مفيش مواعيد معروفة = فولباك 8س15د — نفس sales
(function(){
  const clockIn = 1000000;
  const ts = ctx.ofGraceCloseTs({ clockInTs: clockIn }, {}, {});
  assertEq(ts - clockIn, (8 * 60 + 15) * 60000, 'فولباك الشيفت القياسي 8س15د');
})();

// 4) scheduledEndTime بتاع الموظف بيغلب تعريف الشيفت العام
(function(){
  const clockIn = new Date(2026, 7, 3, 9, 0).getTime();
  const ts = ctx.ofGraceCloseTs({ clockInTs: clockIn },
    { shift: 'morning', scheduledEndTime: '17:30' }, { morning: { end: '18:00' } });
  assertEq(new Date(ts).getHours(), 17, 'ميعاد الموظف الشخصي هو اللي بيتحسب');
})();

// 5) 🔒 الحساب طبق الأصل من sales — بنشغّل **النسختين على نفس المدخلات**
//    ولازم يطلعوا نفس الرقم. لو حد عدّل نسخة ونسي التانية، يقع هنا.
(function(){
  const salesFn = salesSrc.slice(salesSrc.indexOf('window.graceCloseTsFor = function'));
  const body = salesFn.slice(salesFn.indexOf('function'), (function(){
    let d = 0, op = salesFn.indexOf('{');
    for(let i = op; i < salesFn.length; i++){
      if(salesFn[i] === '{') d++;
      else if(salesFn[i] === '}'){ d--; if(d === 0) return i + 1; }
    }
  })());
  vm.runInContext('var salesGrace = ' + body, ctx);
  const cases = [
    [{ clockInTs: new Date(2026,7,3,10,20).getTime() }, { shift:'m' }, { m:{ end:'18:00' } }],
    [{ clockInTs: new Date(2026,7,3,16,0).getTime() },  { shift:'n' }, { n:{ end:'01:00' } }],
    [{ clockInTs: 1000000 }, {}, {}],
    [{ clockInTs: new Date(2026,7,3,9,0).getTime() }, { shift:'m', scheduledEndTime:'17:30' }, { m:{ end:'18:00' } }],
    [null, {}, {}]
  ];
  cases.forEach(function(c, i){
    const a = ctx.ofGraceCloseTs(c[0], c[1], c[2]);
    const b = ctx.salesGrace(c[0], c[1], { shifts: c[2] });
    assertEq(a, b, 'حالة ' + (i + 1) + ': office وsales بنفس الرقم بالظبط');
  });
})();

// ============================================================
// 6) ☕ زيادة البريك — نفس معادلة sales: (الفعلي − 30 − 5) ÷ 10 بالـfloor
// ============================================================
(function(){
  const cfg = { breakMin: 30, breakGraceMin: 5, breakMinPerHour: 10 };
  assertEq(ctx.ofBreakOverHours(30, cfg), 0, '30د = مفيش زيادة');
  assertEq(ctx.ofBreakOverHours(35, cfg), 0, '35د = جوه السماح');
  assertEq(ctx.ofBreakOverHours(44, cfg), 0, '44د = 9 دقايق زيادة → لسه مش ساعة');
  assertEq(ctx.ofBreakOverHours(45, cfg), 1, '45د = 10 دقايق زيادة → ساعة');
  assertEq(ctx.ofBreakOverHours(75, cfg), 4, '75د = 40 دقيقة زيادة → 4 ساعات');
  assertEq(ctx.ofBreakOverHours(0, null), 0, 'ومن غير إعدادات مبيكسرش');
})();

// 7) 🩺 بنود الرصيد: المفتوح بس هو اللي بياخد زرار عذر
(function(){
  const cr = ctx.ofHubCredits([
    { id:'c1', employeeId:'e1', type:'late', hours: 2, ts: 2 },
    { id:'c2', employeeId:'e1', type:'break', hours: 0, originalHours: 1, excused: true, ts: 1 },
    { id:'c3', employeeId:'e1', type:'swap', hours: 0, ts: 3 },
    { id:'c4', employeeId:'e2', type:'late', hours: 5, ts: 4 }
  ], 'e1');
  assertEq(cr.open.length, 1, 'بند واحد مفتوح');
  assertEq(cr.open[0].id, 'c1', 'وهو التأخير');
  assertEq(cr.excused.length, 1, 'والمعذور ظاهر للتاريخ');
  assertEq(ctx.ofHubCredits([], 'e1').open.length, 0, 'وفاضي مبيكسرش');
})();

// ============================================================
// 8) التوصيل: الكتابات بنفس حقول sales بالظبط
// ============================================================
(function(){
  // قفل الشيفت: نفس حقول graceCloseShift
  const gc = src.slice(src.indexOf('window.ofHubGraceClose'), src.indexOf('window.ofRenderPresent ='));
  assert(/overtimeMinutes: 0/.test(gc), '⛔ مفيش وقت إضافي على قفل إداري');
  assert(/earlyMin: 0, earlyHours: 0/.test(gc), '⛔ ومفيش خصم انصراف بدري');
  assert(/autoClosedBy: 'grace_day'/.test(gc), 'ومتعلّم grace_day زي sales بالظبط');
  assert(/ofGraceCloseTs\(/.test(gc), 'وبالحساب المتختبر');
  assert(/clockOutTs: endTs/.test(gc) && !/clockOutTs: Date\.now\(\)/.test(gc),
    '⛔ الانصراف المكتوب هو نهاية الشيفت فعلًا مش دلوقتي — وإلا الوقت الإضافي يتحسب غلط');
  assert(/confirm\(/.test(gc), 'وبتأكيد قبل الكتابة');

  // العذر: نفس حقول sales — تصفير مش مسح
  const ex = src.slice(src.indexOf('window.ofHubExcuse'), src.indexOf('window.ofHubBreakClose'));
  assert(/hours: 0/.test(ex), 'العذر بيصفّر الساعات');
  assert(/originalHours/.test(ex), 'وبيحفظ الأصلية للتاريخ');
  assert(/excused: true/.test(ex), 'وبيعلّم excused');
  assert(!/\.delete\(\)/.test(ex), '⛔ عمره ما يمسح المستند');

  // قفل البريك: durationMin + overHours + رصيد لو فيه زيادة
  const bc = src.slice(src.indexOf('window.ofHubBreakClose'), src.indexOf('window.ofHubGraceClose'));
  assert(/durationMin: durMin/.test(bc), 'مدة البريك بتتسجل');
  assert(/ofBreakOverHours\(/.test(bc), 'والزيادة بالحساب المتختبر');
  assert(/overHours > 0/.test(bc) && /sales_time_credit/.test(bc),
    'والزيادة بتدخل رصيد الوقت — نفس endBreak في sales');
  assert(/type: 'break'/.test(bc), 'بنوع break');
})();
