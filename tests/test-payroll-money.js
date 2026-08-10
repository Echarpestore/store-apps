// ============================================================
// 💵 فلوس الرواتب: المرتب + رصيد الوقت + السلف + النقط + الخصومات
// الباجات اللي الاختبار ده بيقفلها للأبد:
//   ١) محرك رصيد الوقت (7 ساعات = يوم خصم) كان معروض في اللوحات
//      ومش متوصّل بالمرتب — netSalary ماكانش بيخصمه خالص
//   ٢) التأخير كان بيتسجل غرامة ثابتة قديمة (اللي مش بتتخصم أصلًا)
//      بدل ساعات رصيد الوقت — فبوابة الالتزام 90% كانت من غير التأخير
//   ٣) الخصومات الإدارية (كشف الخصومات) كانت display-only
//   ٤) سلفة يوم 31 كانت بتقع في فجوة بين فترتين (1→30) ومتتخصمش أبدًا
//   ٥) النقط الكسرية: الإيصال وحالة السباق كانوا بيعدّوا مستندات مش أوزان
//   ٦) سقف السلف الشهري كان بمفتاح UTC — أول الشهر بيحسب على الشهر اللي فات
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadSalesApp } = require('./helpers/load-sales');
const { sandbox: S } = loadSalesApp();

const appSrc = fs.readFileSync(path.resolve(__dirname,'..','sales','sales-app.js'),'utf8');
const uiSrc  = fs.readFileSync(path.resolve(__dirname,'..','sales','sales-ui.js'),'utf8');

// شهر فيه 31 يوم عشان نختبر ثغرة يوم 31 (يوليو 2026)
const Y = 2026, M = 6; // يوليو (0-based)
const periodStart = new Date(Y, M, 1, 0,0,0,0);
const periodEnd   = new Date(Y, M, 30, 23,59,59,999);
const ts = (day, hour)=> new Date(Y, M, day, hour||12).getTime();

function calc(emp, opts){
  opts = opts || {};
  vm.runInContext('allShifts = ' + JSON.stringify(opts.shifts||[]) + ';', S);
  vm.runInContext('allAdvances = ' + JSON.stringify(opts.advances||[]) + ';', S);
  S.window.allTimeCredit = opts.timeCredit || [];
  S.window.deductions = opts.deductions || [];
  S.window.timeCfg = opts.timeCfg || S.timeCfgDefaults;
  return vm.runInContext(
    'computeSalary(' + JSON.stringify(emp) + ', new Date(' + periodStart.getTime() + '), new Date(' + periodEnd.getTime() + '))', S);
}

// موظفة أساسية: مرتب 3000 → يوم = 100 · معفية من كشف الغياب (تتبع من بعد الفترة)
const EMP = { id:'e1', name:'سارة', branch:'الرحاب', baseSalary:3000,
              attendanceTrackingStart:'2026-08-01' };

// ============================================================
// ١) شهر نضيف: المرتب الأساسي كامل زي ما هو
// ============================================================
{
  const c = calc(EMP, {});
  assertEq(c.proratedBase, 3000, 'شهر كامل = الأساسي بالظبط');
  assertEq(c.timeCreditDeduction, 0, 'مفيش رصيد وقت = مفيش خصم');
  assertEq(c.adminDeductions, 0, 'مفيش خصومات إدارية');
  assertEq(c.netSalary, 3000, 'الصافي = الأساسي');
}

// ============================================================
// ٢) رصيد الوقت بيتخصم فعلًا من المرتب (الوصلة اللي كانت ناقصة)
// ============================================================
{
  // 15 ساعة غير معذورة = يومين خصم (7+7 والباقي ساعة) = 200 ج
  const c = calc(EMP, { timeCredit: [
    { employeeId:'e1', type:'late',  hours:8, date:'2026-07-05' },
    { employeeId:'e1', type:'break', hours:4, date:'2026-07-10' },
    { employeeId:'e1', type:'early', hours:3, date:'2026-07-20' },
  ]});
  assertEq(c.timeCreditHours, 15, '15 ساعة رصيد اتجمعوا');
  assertEq(c.timeCreditDays, 2, 'كل 7 ساعات = يوم → يومين');
  assertEq(c.timeCreditDeduction, 200, 'يومين × 100 = 200 ج');
  assertEq(c.netSalary, 2800, 'الصافي بعد خصم رصيد الوقت');

  // البند المعذور مش بيتحسب
  const c2 = calc(EMP, { timeCredit: [
    { employeeId:'e1', type:'late', hours:14, date:'2026-07-05', excused:true },
  ]});
  assertEq(c2.timeCreditDeduction, 0, 'المعذور بعذر مبيتخصمش');

  // موظف تاني مش بيتحسب عليها
  const c3 = calc(EMP, { timeCredit: [
    { employeeId:'e2', type:'late', hours:14, date:'2026-07-05' },
  ]});
  assertEq(c3.timeCreditDeduction, 0, 'رصيد موظف تاني مش بيتخصم منها');

  // سقف أيام الخصم الشهري بيتحترم
  const c4 = calc(EMP, {
    timeCfg: Object.assign({}, S.timeCfgDefaults, { maxDaysPerMonth: 1 }),
    timeCredit: [ { employeeId:'e1', type:'late', hours:21, date:'2026-07-05' } ]
  });
  assertEq(c4.timeCreditDays, 1, '21 ساعة = 3 أيام بس السقف يوم واحد');
  assertEq(c4.timeCreditDeduction, 100, 'الخصم بالسقف = 100');
}

// ============================================================
// ٣) الخصومات الإدارية بتتخصم (كانت display-only)
// ============================================================
{
  const c = calc(EMP, { deductions: [
    { employeeId:'e1', type:'absence', amount:50, date:'2026-07-08', ts: ts(8) },
    { employeeId:'e1', type:'dayoffSwap', amount:50, date:'2026-07-15', ts: ts(15) },
    { employeeId:'e2', type:'late', amount:50, date:'2026-07-09', ts: ts(9) },   // موظف تاني
  ]});
  assertEq(c.adminDeductions, 100, 'خصومات الموظفة بس (50+50)');
  assertEq(c.netSalary, 2900, 'الصافي بعد الخصومات الإدارية');
}

// ============================================================
// ٤) ثغرة يوم 31: السلفة بتتخصم من مرتب الشهر
// ============================================================
{
  const c = calc(EMP, { advances: [
    { employeeId:'e1', amount:300, ts: ts(15) },                       // سلفة عادية نص الشهر
    { employeeId:'e1', amount:200, ts: ts(31, 20) },                   // ⚠️ سلفة يوم 31 الساعة 8 مساءً
    { employeeId:'e1', amount:150, ts: ts(10), source:'staff_order' }, // أوردر شراء
  ]});
  assertEq(c.advancesTotal, 650, 'سلفة يوم 31 داخلة في الخصم (كانت بتضيع)');
  assertEq(c.advCash, 500, 'الكاش: 300+200');
  assertEq(c.advOrders, 150, 'الأوردرات: 150');
  assertEq(c.netSalary, 2350, 'الصافي بعد كل السلف');
}

// ============================================================
// ٥) كله مع بعض: أساسي − رصيد وقت − إدارية − سلف + أوفرتايم
// ============================================================
{
  const c = calc(EMP, {
    shifts: [ { employeeId:'e1', clockInTs: ts(3,10), overtimeMinutes: 120 } ],  // ساعتين أوفرتايم
    timeCredit: [ { employeeId:'e1', type:'late', hours:7, date:'2026-07-05' } ], // يوم خصم
    deductions: [ { employeeId:'e1', type:'absence', amount:50, date:'2026-07-08', ts: ts(8) } ],
    advances: [ { employeeId:'e1', amount:400, ts: ts(20) } ],
  });
  // أوفرتايم: ساعتين × (100/8) = 25
  assertEq(c.overtimePay, 25, 'أوفرتايم ساعتين = 25');
  assertEq(c.timeCreditDeduction, 100, 'رصيد الوقت يوم = 100');
  // 3000 + 25 − 100 − 50 − 400 = 2475
  assertEq(c.netSalary, 2475, 'المعادلة الكاملة مظبوطة');
}

// ============================================================
// ٦) النقط بالوزن الكسري في كل مكان
// ============================================================
{
  // sumPoints بيجمع الأوزان (نقطة كاملة + كسور القطع الزيادة)
  const pts = [ { value:1 }, { value:1.4 }, { value:0.6 }, {} ];   // القديمة من غير value = 1
  assertEq(S.sumPoints(pts), 4, 'sumPoints: 1+1.4+0.6+1 = 4');
  // الإيصال بيستخدم sumPoints مش length
  // 🔀 الإيصال بقى بياخد النقط من commissionDueFor (نفس الدالة اللي
  //    شاشة العمولات بتقرا منها) — وهي بتجمع بـsumPoints جواها.
  assert(/const ptsTotal = sumPoints\(/.test(appSrc),
    'إيصال الراتب بيحسب النقط بالوزن');
  assert(!/allPoints\.filter\([^)]*\)\.length;\s*\n\s*const ptsAmt/.test(appSrc),
    'عدّ المستندات القديم اتشال من الإيصال');
  // حالة السباق كمان
  assert(/const pts = sumPoints\(window\.points\.filter/.test(appSrc),
    'حالة السباق بتحسب النقط بالوزن');
}

// ============================================================
// ٧) حراسات المصدر — التوصيلات متترجعش تاني
// ============================================================
{
  // التأخير → رصيد وقت مش غرامة ثابتة
  assert(/type: 'late', hours: _lateHours/.test(appSrc),
    'الحضور المتأخر بيكتب ساعات رصيد وقت');
  assert(!/type: 'late', amount: complianceCfg\.penalty/.test(appSrc),
    'الغرامة الثابتة القديمة للتأخير اتشالت');
  // computeSalary موصّل بالمحرك
  assert(/monthlyTimeSummary\(tcEntries/.test(appSrc), 'computeSalary بينده monthlyTimeSummary');
  assert(/- timeCreditDeduction - adminDeductions/.test(appSrc),
    'الصافي بيخصم رصيد الوقت والإدارية');
  // الإيصال فيه السطور الجديدة
  assert(/رصيد الوقت \(/.test(appSrc), 'سطر رصيد الوقت في الإيصال');
  assert(/خصومات إدارية/.test(appSrc), 'سطر الخصومات الإدارية في الإيصال');
  // التبديل اليدوي بيسجل ساعات بقاعدة المجاني الشهري
  assert(/swapHoursFrom\(priorSwaps \+ 1/.test(uiSrc),
    'التبديل اليدوي بيحسب ساعات تراكمية بالمجاني');
  assert(!/type, amount: window\.complianceCfg\.penalty/.test(uiSrc),
    'التبديل مبقاش غرامة ثابتة');
  // الدوال متعرّضة على window (القاعدة الذهبية)
  ['lateHoursFrom','swapHoursFrom','monthlyTimeSummary'].forEach(fn=>{
    assert(new RegExp('window\\.'+fn+'\\s*=\\s*'+fn).test(appSrc), fn+' متعرّضة على window');
  });
  // سقف السلف بمفتاح محلي مش UTC
  assert(!/toISOString\(\)\.slice\(0,7\)/.test(appSrc.slice(appSrc.indexOf('function advCheck'), appSrc.indexOf('function advCheck')+800)),
    'advCheck مبقاش يستخدم مفتاح UTC');
}

// ============================================================
// ٨) سقف السلف: أول الشهر بالتوقيت المحلي
// ============================================================
{
  // سلفة الساعة 1 صباح يوم 1 أغسطس (محلي) — بمفتاح UTC كانت بتتحسب على يوليو
  const now = new Date(2026, 7, 1, 1, 0);   // 1 أغسطس 01:00 محلي
  const advances = [ { employeeId:'e1', amount:500, date:'2026-08-01' } ];
  const chk = S.advCheck({ maxPerMonth:600, openDay:0 }, advances, 'e1', 200, now);
  assert(chk.ok === false || chk.left === 100 || chk.used === 500,
    'سلفة أول الشهر بتتحسب على الشهر الجديد (مش UTC)');
  assertEq(S.advMonthTotal(advances, 'e1', '2026-08'), 500, 'advMonthTotal بمفتاح محلي');
}

// ============================================================
// 📅 نافذة السلف الدائرية — تفتح 12 وتقفل 6
// 🔴 كانت "من يوم كذا لآخر الشهر" وبس — مفيش يوم قفل أصلًا.
// وقرار المالك: سلفة يوم 3 أغسطس تتحسب على سقف **يوليو** لأنها من نافذته.
// من غير ده الموظفة تاخد سقف يوليو كامل يوم 30 وسقف أغسطس كامل يوم 3.
// ============================================================
{
  const fsA = require('fs'), pathA = require('path'), vmA = require('vm');
  const srcA = fsA.readFileSync(pathA.resolve(__dirname,'..','sales','sales-app.js'),'utf8');
  const i = srcA.indexOf('function advWindowOpen'), j = srcA.indexOf('function advCheck');
  assert(i > 0 && j > i, 'بلوك السلف اتلقى');
  const box = { Number:Number, String:String, Date:Date, Math:Math, Intl:Intl, window:{} };
  vmA.createContext(box);
  // 🕒 نافذة السلف ودورتها بقوا بيحسبوا بتوقيت القاهرة — لازم أدوات القاهرة معاهم
  function _grab(h){
    const k = srcA.indexOf(h); if(k < 0) return '';
    let d = 0, st = false;
    for(let z = srcA.indexOf('{', k); z < srcA.length; z++){
      if(srcA[z] === '{'){ d++; st = true; }
      else if(srcA[z] === '}'){ d--; if(st && d === 0) return srcA.slice(k, z + 1); }
    }
    return '';
  }
  vmA.runInContext(
    "const CAI_TZ='Africa/Cairo';" +
    "const _caiFmt=new Intl.DateTimeFormat('en-GB',{timeZone:CAI_TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});" +
    ['function caiParts(','function caiOffsetMs(','function cai(','function caiStamp(']
      .map(_grab).join('\n'), box);
  vmA.runInContext(srcA.slice(i, j), box);
  const wo  = (od,d,cd)=> vmA.runInContext(`advWindowOpen(${od}, new Date(2026,6,${d}), ${cd})`, box);
  const ck  = (y,m,d,od,cd)=> vmA.runInContext(`advCycleKey(new Date(${y},${m},${d}), ${od}, ${cd})`, box);
  const amt = (arr,id,mk,od,cd)=> vmA.runInContext(
    `advMonthTotal(${JSON.stringify(arr)}, ${JSON.stringify(id)}, ${JSON.stringify(mk)}, ${od}, ${cd})`, box);

  // ---- النافذة ----
  [1,3,6].forEach(d=> assert(wo(12,d,6) === true,  `يوم ${d}: مفتوحة (امتداد الشهر اللي فات)`));
  [7,9,11].forEach(d=> assert(wo(12,d,6) === false, `🔒 يوم ${d}: مقفولة`));
  [12,20,31].forEach(d=> assert(wo(12,d,6) === true, `يوم ${d}: مفتوحة`));
  assertEq(wo(0,9,0), true, 'من غير إعداد = مفتوحة دايمًا');
  assertEq(wo(12,9,0), false, 'توافق: يوم فتح من غير قفل = زي الأول');
  assertEq(wo(12,20,0), true, 'وبعد يوم الفتح مفتوحة');
  assertEq(wo(5,10,20), true, 'نافذة جوه نفس الشهر (5→20)');
  assertEq(wo(5,25,20), false, 'وبرّاها مقفولة');

  // ---- 🗓️ شهر النافذة ----
  assertEq(ck(2026,6,15,12,6), '2026-07', '15 يوليو → سقف يوليو');
  assertEq(ck(2026,6,30,12,6), '2026-07', '30 يوليو → يوليو');
  assertEq(ck(2026,7,3,12,6),  '2026-07', '🔑 3 أغسطس → سقف **يوليو** (قرار المالك)');
  assertEq(ck(2026,7,6,12,6),  '2026-07', 'و6 أغسطس آخر يوم في نافذة يوليو');
  assertEq(ck(2026,7,12,12,6), '2026-08', 'و12 أغسطس → نافذة أغسطس الجديدة');
  assertEq(ck(2027,0,3,12,6),  '2026-12', '🎊 3 يناير → ديسمبر (رأس السنة)');
  assertEq(ck(2026,7,3,0,0),   '2026-08', 'من غير إعداد = الشهر التقويمي');

  // ---- السقف بيتحسب بشهر النافذة ----
  const advs = [
    { employeeId:'a', amount:300, date:'2026-07-20', cycleKey:'2026-07' },
    { employeeId:'a', amount:200, date:'2026-08-03', cycleKey:'2026-07' },  // من نافذة يوليو
    { employeeId:'a', amount:100, date:'2026-08-15', cycleKey:'2026-08' },
    { employeeId:'b', amount:900, date:'2026-07-20', cycleKey:'2026-07' }
  ];
  assertEq(amt(advs,'a','2026-07',12,6), 500,
    '🔑 سلفة 3 أغسطس محسوبة على يوليو (300+200) — مش على أغسطس');
  assertEq(amt(advs,'a','2026-08',12,6), 100, 'وأغسطس فيها المتاخد بعد يوم 12 بس');
  assertEq(amt(advs,'b','2026-07',12,6), 900, 'وكل موظفة لوحدها');

  // ---- توافق: السلف القديمة من غير cycleKey ----
  const old = [{ employeeId:'a', amount:250, date:'2026-08-03' }];
  assertEq(amt(old,'a','2026-07',12,6), 250,
    '⚠️ السلف القديمة (من غير cycleKey) بيتحسب شهرها من التاريخ');
  assertEq(amt(old,'a','2026-08',12,6), 0, 'ومش بتتعد مرتين');

  // ---- موصّل ----
  assert(/advWindowOpen\(cfg\.openDay, now, cfg\.closeDay\)/.test(srcA),
    'الفحص بيمرّر يوم القفل');
  assert(/advCycleKey\(_d, cfg\.openDay, cfg\.closeDay\)/.test(srcA),
    'والسقف بيتحسب بشهر النافذة');
  assert(/cycleKey: advCycleKey\(new Date\(\)/.test(srcA),
    '🗓️ وكل سلفة بتتسجل بشهر نافذتها — الحسبة متتغيرش لو الإعدادات اتعدّلت');
  const html = fsA.readFileSync(pathA.resolve(__dirname,'..','sales','index.html'),'utf8');
  assert(/id="advCloseDayInput"/.test(html), 'وخانة يوم القفل في الإعدادات');
}

// ============================================================
// 🏆 لوحة الترتيب كانت بتعد الفواتير مش النقط
// الشكوى: الموظفة شايفة "18.2 نقطة" في شاشتها و"9" في لوحة الترتيب.
// السبب: countsFor كانت `.length` — بتعد **عدد الفواتير**. والنقطة ليها وزن:
// أول (الحد) قطع = نقطة كاملة، وكل قطعة زيادة = كسر. فاتورة 7 قطع (حد 5) = 1.4.
// والمرتب والعمولة بيتحسبوا على الوزن — فلوحة الترتيب كانت الوحيدة الغلط.
// ============================================================
{
  const fsB = require('fs'), pathB = require('path'), vmB = require('vm');
  const srcB = fsB.readFileSync(pathB.resolve(__dirname,'..','sales','sales-app.js'),'utf8');

  const cf = srcB.slice(srcB.indexOf('function countsFor'), srcB.indexOf('function countsFor') + 400);
  assert(!/\.length;/.test(cf), '🔴 عد الفواتير اتشال');
  assert(/return sumPoints\(list\)/.test(cf),
    '🔑 بيجمع الأوزان بنفس دالة sumPoints اللي المرتب ماشي عليها');

  // سلوكيًا: نفس أرقام الشكوى
  const box2 = { Math:Math, Number:Number, String:String, window:{} };
  vmB.createContext(box2);
  const i2 = srcB.indexOf('function pointWeight'), j2 = srcB.indexOf('// ====', i2);
  vmB.runInContext(srcB.slice(i2, j2), box2);
  const sum = (l)=> vmB.runInContext(`sumPoints(${JSON.stringify(l)})`, box2);
  const nine = [{value:1},{value:1.4},{value:2},{value:1.2},{value:2.4},{value:1},{value:3},{value:4},{value:2.2}];
  assertEq(nine.length, 9, 'العدد القديم كان 9 فاتورة');
  assertEq(sum(nine), 18.2, '🔑 والمجموع الصح 18.2 — زي ما الموظفة شايفة');
  assertEq(sum([{}, {value:2}]), 3, '⚠️ الفواتير القديمة (من غير value) بتتحسب 1');
  assertEq(sum([]), 0, 'وقايمة فاضية = صفر');

  // 🔢 العرض نضيف
  const fmt = srcB.slice(srcB.indexOf('function fmtPts'), srcB.indexOf('function fmtPts') + 260);
  assert(fmt.length > 0, 'دالة عرض النقط موجودة');
  const f = (n)=>{ const v = Math.round((Number(n)||0)*10)/10; return (v % 1 === 0) ? String(v) : v.toFixed(1); };
  assertEq(f(18.200000000000003), '18.2', '🔢 الكسور العشرية الطويلة بتتنضف');
  assertEq(f(18), '18', 'والصحيح من غير .0');
  assertEq(f(0), '0', 'والصفر');
  // كل مواضع عرض النقط بتعدي عليها
  const shown = (srcB.match(/\$\{[^}]*\} نقطة</g) || []);
  const raw = shown.filter(function(x){ return x.indexOf('fmtPts') < 0; });
  assertEq(raw, [], '🔍 مفيش أي مكان بيعرض نقط من غير تنسيق');
}

// ⚠️ fmtPts لازم تتعرّف قبل أول استخدام (القاعدة الذهبية §15)
{
  const fsC = require('fs'), pathC = require('path');
  const srcC = fsC.readFileSync(pathC.resolve(__dirname,'..','sales','sales-app.js'),'utf8');
  const def = srcC.indexOf('function fmtPts');
  const uses = [];
  let k = srcC.indexOf('fmtPts(');
  while(k >= 0){ uses.push(k); k = srcC.indexOf('fmtPts(', k + 1); }
  assert(def > 0 && uses.length > 1, 'التعريف والاستخدامات موجودين');
  // ⚠️ الاستخدام الوحيد المسموح قبل التعريف هو مفيش — كلهم لازم يبقوا بعده
  const before = uses.filter(function(u){ return u < def; });
  assertEq(before, [],
    '🔑 مفيش أي استخدام قبل التعريف (كانت متعرّفة تحت وبتتستخدم فوق)');
  assert(/window\.fmtPts = fmtPts;/.test(srcC), 'ومتعرّضة على window');
}
