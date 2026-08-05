// ============================================================
// ☕🔔 test-break-alert — تنبيه رجوع البريك (sales + POS)
//
// المشكلة اللي الميزة اتعملت لها: الموظفة بتنسى تسجّل رجوعها من البريك،
// فالنظام بيقفله تلقائي بعد ضعف المدة **وبيتخصم عليها** حتى لو رجعت
// في ميعادها. القرار: تنبيه **قبل** الخصم مش بدل الخصم —
//   · قبل 30 دقيقة        → عداد عادي، مفيش تنبيه
//   · من 30 لـ 35 (سماح)  → تنبيه على الشاشة + رنة كل دقيقة (4 رنّات)
//   · بعد 35              → الخصم بيتحسب عادي زي ما هو، والرنين بيقف
//
// ⚠️ الاختبارات دي **سلوكية**: بتشغّل الدوال الحقيقية على مرور وقت حقيقي
//    وبتعدّ الرنّات فعلًا — مش بتدوّر على نصوص في الملف.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadSalesApp } = require('./helpers/load-sales');

const ROOT = path.resolve(__dirname, '..');
const { sandbox: S } = loadSalesApp();

const posSrc   = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');
const posHtml  = fs.readFileSync(path.join(ROOT, 'pos', 'index.html'), 'utf8');
const salesSrc = fs.readFileSync(path.join(ROOT, 'sales', 'sales-app.js'), 'utf8');

// استخراج دالة بالأقواس المتوازنة (مش regex — القاعدة المثبتة في الهاندوف)
function extractFn(src, header){
  const i = src.indexOf(header);
  if(i < 0) return null;
  let depth = 0, started = false;
  for(let j = src.indexOf('{', i); j < src.length; j++){
    const c = src[j];
    if(c === '{'){ depth++; started = true; }
    else if(c === '}'){ depth--; if(started && depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}

const MIN = 60000;
const CFG = { breakMin:30, breakGraceMin:5, breakAlertBeeps:4, autoCloseBreakMult:2, breakMinPerHour:10 };

// ============================================================
// 1) الدالة النقية في sales — كل مرحلة في مكانها
// ============================================================
(function(){
  const t0 = 1750000000000;
  const brk = { id:'b1', employeeName:'سارة', startTs:t0, endTs:null };
  const at = (m)=> S.breakAlertState(brk, CFG, t0 + m*MIN);

  assertEq(at(0).phase,  'ok',    'أول البريك: مفيش تنبيه');
  assertEq(at(29).phase, 'ok',    'دقيقة 29: لسه مفيش تنبيه');
  assertEq(at(29).leftMin, 1,     'وبيقول باقي دقيقة');
  assertEq(at(29).beep,  false,   '⛔ مفيش رنين قبل ما المدة تخلص');

  assertEq(at(30).phase, 'alert', '⭐ دقيقة 30: التنبيه بيبدأ');
  assertEq(at(30).beep,  true,    '⭐ ومعاه رنة');
  assertEq(at(30).graceLeftMin, 5, 'وبيقول فاضل 5 دقايق قبل الخصم');
  assertEq(at(34).graceLeftMin, 1, 'دقيقة 34: فاضل دقيقة واحدة');

  assertEq(at(35).phase, 'over',  '⭐ بعد السماح: الخصم بيتحسب عادي');
  assertEq(at(35).beep,  false,   '⭐ والرنين بيقف — التنبيه مش عقوبة');
  assertEq(at(50).phase, 'over',  'وبيفضل معروض من غير رنين');

  // 🚫 البريك المقفول مالوش تنبيه خالص
  assertEq(S.breakAlertState({ startTs:t0, endTs:t0+40*MIN }, CFG, t0+60*MIN).phase, 'none',
    'بريك اتسجّل رجوعه = مفيش تنبيه');
  // 🧟 بريك منسي من يوم فات — ميرنّش على الناس الصبح
  assertEq(S.breakAlertState(brk, CFG, t0 + 300*MIN).phase, 'stale',
    'بريك قديم جدًا = مهمل (السيستم بيقفله تلقائي)');
  assertEq(S.breakAlertState(brk, CFG, t0 + 300*MIN).beep, false, 'ومفيش رنين عليه');
  // ساعة الجهاز رجعت لورا
  assertEq(S.breakAlertState(brk, CFG, t0 - 5*MIN).phase, 'none', 'وقت سالب مبيكسرش الحساب');
})();

// ============================================================
// 2) ⭐ الأهم: عدد الرنّات على مرور الوقت الحقيقي
//    (تيك كل 10 ثواني من 0 لـ 45 دقيقة → لازم 4 رنّات بالظبط)
//    ده اللي بيمسك باج "الرنة بتتكرر كل تيك" — إزعاج متواصل بدل تنبيه.
// ============================================================
function runSalesTicks(cfgOverride, endAtMin){
  const fnSrc = extractFn(salesSrc, 'function renderBreakAlert(');
  assert(!!fnSrc, 'لقينا renderBreakAlert في sales-app.js');
  if(!fnSrc) return null;

  const t0 = 1750000000000;
  const brk = { id:'b1', employeeName:'سارة', startTs:t0, endTs:null };
  const cfg = Object.assign({}, CFG, cfgOverride || {});
  let beeps = 0, now = t0;
  const el = { style:{ display:'none' }, innerHTML:'', id:'' };

  const box = {
    _bkBeeped: {},
    breakBeep: function(){ beeps++; },
    breakAlertState: function(b, c, n){ return S.breakAlertState(b, c, n); },
    activeBreaks: function(){ return brk.endTs ? [] : [brk]; },
    timeCfgDefaults: cfg,
    window: { timeCfg: cfg },
    Date: { now: function(){ return now; } },
    document: {
      querySelector: function(){ return el.id ? el : null; },
      createElement: function(){ return el; },
      body: { appendChild: function(n){ n.id = 'breakAlertOverlay'; } }
    }
  };
  box.globalThis = box;
  vm.createContext(box);
  vm.runInContext(fnSrc + '\n;renderBreakAlert;', box);

  const stop = (endAtMin != null ? endAtMin : 45) * MIN;
  for(let ms = 0; ms <= stop; ms += 10000){
    now = t0 + ms;
    vm.runInContext('renderBreakAlert()', box);
  }
  return { beeps, el, brk, box, t0, setNow: function(v){ now = v; } };
}

(function(){
  const r = runSalesTicks();
  if(!r) return;
  assertEq(r.beeps, 4,
    '⭐ 4 رنّات بالظبط (مرة كل دقيقة في فترة السماح) — مش رنة كل 10 ثواني');
  assert(r.el.style.display === 'block', 'والتنبيه ظاهر على الشاشة بعد ما المدة خلصت');
  assert(/البريك خلص من/.test(r.el.innerHTML) && /سارة/.test(r.el.innerHTML),
    'وفيه اسم الموظفة والمدة الزيادة');
})();

// الأدمن قلّل الرنّات لـ2 → لازم ترن مرتين بس
(function(){
  const r = runSalesTicks({ breakAlertBeeps:2 });
  if(r) assertEq(r.beeps, 2, 'عدد الرنّات بيتظبط من الإعدادات (breakAlertBeeps)');
})();

// الأدمن قفل الرنين خالص
(function(){
  const r = runSalesTicks({ breakAlertBeeps:0 });
  if(r) assertEq(r.beeps, 0, 'breakAlertBeeps=0 → تنبيه بصري من غير صوت');
})();

// ⛔ قبل الـ30 دقيقة مفيش أي رنة ولا أي مربع
(function(){
  const r = runSalesTicks(null, 29);
  if(!r) return;
  assertEq(r.beeps, 0, '⛔ صفر رنين قبل ما مدة البريك تخلص');
  assertEq(r.el.style.display, 'none', 'ومفيش تنبيه على الشاشة');
})();

// ✅ سجّلت رجوعها → التنبيه بيختفي فورًا
(function(){
  const r = runSalesTicks();
  if(!r) return;
  r.brk.endTs = r.t0 + 36*MIN;
  vm.runInContext('renderBreakAlert()', r.box);
  assertEq(r.el.style.display, 'none', '⭐ سجّلت رجوعها → التنبيه اختفى');
  assertEq(r.el.innerHTML, '', 'والمحتوى اتمسح');
})();

// ============================================================
// 3) POS — نفس الحساب بالظبط (مينفعش الاتنين يقولوا كلام مختلف)
// ============================================================
(function(){
  const fnSrc = extractFn(posSrc, 'function posBreakAlertState(');
  assert(!!fnSrc, 'لقينا posBreakAlertState في pos-sale.js');
  if(!fnSrc) return;
  const box = { window:{} };
  vm.createContext(box);
  vm.runInContext(fnSrc + '\n;posBreakAlertState;', box);

  const t0 = 1750000000000;
  const brk = { id:'b1', employeeName:'سارة', startTs:t0, endTs:null };
  let same = 0;
  for(let m = 0; m <= 200; m++){
    const a = S.breakAlertState(brk, CFG, t0 + m*MIN);
    const b = vm.runInContext('posBreakAlertState', box)(brk, CFG, t0 + m*MIN);
    if(a.phase === b.phase && a.beep === b.beep && (a.overMin||0) === (b.overMin||0)) same++;
  }
  assertEq(same, 201, '⭐ POS و sales بيطلّعوا نفس الحالة بالظبط في كل دقيقة (مفيش انحراف)');
})();

// ============================================================
// 4) POS: التنبيه بصري بس — مفيش صوت في شاشة البيع (قرار المالك:
//    الكاشير بتكون قدام عميلة، الرنين على كشك sales)
// ============================================================
(function(){
  const tail = posSrc.slice(posSrc.indexOf('تنبيه رجوع البريك في شاشة البيع'));
  assert(!/AudioContext|breakBeep|new Audio\(/.test(tail),
    '⛔ مفيش أي صوت في POS — التنبيه بصري بس');
  assert(/navigator\.vibrate/.test(salesSrc), 'وكشك sales فيه صوت/اهتزاز');
})();

// ============================================================
// 5) POS: الاشتراك مقيّد بالفرع والبريكات المفتوحة بس
//    (قاعدة حجم القراءات — استعلام مفتوح على مجموعة بيكلّف آلاف القراءات)
// ============================================================
(function(){
  const i = posSrc.indexOf("db.collection('sales_breaks')");
  assert(i > 0, 'POS بيشترك على مجموعة sales_breaks');
  const q = posSrc.slice(i, i + 400);
  assert(/where\('branch','==', *currentBranch\)/.test(q), '⭐ مقيّد بفرع الجهاز');
  assert(/where\('endTs','==', *null\)/.test(q), '⭐ ومقيّد بالبريكات المفتوحة بس');
  // نيجاتيف: مفيش اشتراك مفتوح من غير قيود
  assert(!/db\.collection\('sales_breaks'\)\s*\.onSnapshot/.test(posSrc),
    '⛔ مفيش اشتراك مفتوح على المجموعة كلها');
})();

// ============================================================
// 6) POS: فشل القراءة (قواعد رافضة / نت قاطع) ميوقفش البيع
// ============================================================
(function(){
  const fn = extractFn(posSrc, 'function watchBranchBreaks(');
  assert(!!fn, 'لقينا watchBranchBreaks');
  if(!fn) return;
  assert(/try\s*\{/.test(fn) && /catch/.test(fn), 'الاشتراك جوه try/catch');
  assert(/console\.warn/.test(fn) && !/alert\(/.test(fn),
    '⛔ فشل القراءة مبيطلّعش رسالة للكاشير — بيتسجل في الكونسول بس');
  const render = extractFn(posSrc, 'function renderPosBreakAlert(');
  assert(!!render && !/alert\(|confirm\(/.test(render),
    'وعرض التنبيه مبيقطعش شغل الكاشير بأي نافذة');
})();

// ============================================================
// 7) المربع موجود فوق خالص في شاشة البيع
// ============================================================
(function(){
  const i = posHtml.indexOf('id="saleScreen"');
  assert(i > 0, 'شاشة البيع موجودة');
  const head = posHtml.slice(i, i + 600);
  const iBox = head.indexOf('id="posBreakAlert"');
  const iTop = head.indexOf('qbx-top');
  assert(iBox > 0, '⭐ مربع التنبيه موجود في شاشة البيع');
  assert(iBox < iTop, '⭐ وفوق عنوان الفاتورة خالص (أول حاجة تتشاف)');
  assert(/id="posBreakAlert"[^>]*display:none/.test(posHtml), 'ومخفي لحد ما يبقى فيه سبب');
})();

// ============================================================
// 8) التنبيه **مغيّرش** حساب الخصم — الأرقام زي ما هي بالظبط
//    (لو حد ظن إن التنبيه بديل العقوبة، ده بيقع هنا)
// ============================================================
(function(){
  assertEq(S.breakHoursFrom(34, 30, CFG), 0, 'جوه السماح: مفيش خصم (زي الأول)');
  assertEq(S.breakHoursFrom(35, 30, CFG), 0, 'أول دقيقة بعد السماح: لسه صفر');
  assertEq(S.breakHoursFrom(45, 30, CFG), 1, '45 دقيقة = ساعة رصيد (زي الأول)');
  assertEq(S.breakHoursFrom(64, 30, CFG), 2, '64 دقيقة = ساعتين (زي الأول)');
  // ومرحلة 'over' بتبدأ من نفس اللحظة اللي الخصم بيبدأ يتحسب منها
  const t0 = 1750000000000;
  const brk = { startTs:t0, endTs:null };
  assertEq(S.breakAlertState(brk, CFG, t0 + 35*MIN).phase, 'over',
    'بداية مرحلة "over" = نفس لحظة بداية احتساب الزيادة');
})();

// ============================================================
// 9) الإعدادات الجديدة موجودة بقيمة افتراضية (الأدمن يقدر يغيّرها)
// ============================================================
(function(){
  const d = (S.window && S.window.timeCfgDefaults) || {};
  assertEq(d.breakAlertBeeps, 4, 'breakAlertBeeps افتراضي 4');
  assertEq(d.breakMin, 30, 'مدة البريك زي ما هي 30');
  assertEq(d.breakGraceMin, 5, 'والسماح 5');
})();

// ============================================================
// 10) إصدارات الكاش اتزوّدت (وإلا الأجهزة تفضل على القديم)
// ============================================================
(function(){
  const pos = fs.readFileSync(path.join(ROOT,'pos','sw.js'),'utf8');
  const sal = fs.readFileSync(path.join(ROOT,'sales','sw.js'),'utf8');
  const mp = pos.match(/store-apps-shell-v(\d+)/);
  const ms = sal.match(/store-apps-shell-v(\d+)/);
  assert(!!mp && Number(mp[1]) >= 279, 'POS: CACHE_NAME v279+');
  assert(!!ms && Number(ms[1]) >= 90,  'sales: CACHE_NAME v90+');
})();

// ============================================================
// 11) القاعدة الذهبية: الدوال معروضة على window (sales-app موديول)
// ============================================================
(function(){
  assert(/window\.breakAlertState *= *breakAlertState/.test(salesSrc),
    'breakAlertState معروضة على window');
  assert(/window\.renderBreakAlert *= *renderBreakAlert/.test(salesSrc),
    'renderBreakAlert معروضة على window');
  assert(!!S.window && typeof S.window.breakAlertState === 'function',
    'وفعلًا موجودة بعد تحميل الملف');
})();

// ============================================================
// ١٢) ☕🚨 البريك المنسي — "قفلت البريك لقيت 20 ساعة"
//
// الباج: durMin = now − startTs من غير سقف. نسيت تقفله ورجعت تاني
// يوم → 1200 دقيقة = 20 ساعة → breakHoursFrom تطلّع ~116 ساعة رصيد
// ≈ 16 يوم خصم. والقفل التلقائي كان بيحط endTs على الحد (60 دقيقة)
// وبيسجّل durationMin بالمدة الحقيقية ويخصم عليها — تناقض في نفس المستند.
// ============================================================
(function(){
  const t0 = 1750000000000;
  const brk = { id:'b1', startTs: t0 };
  const info = (mins)=> S.window.breakCloseInfo(brk, CFG, t0 + mins*MIN);

  // بريك عادي
  const ok = info(25);
  assertEq(ok.durMin, 25, 'بريك 25 دقيقة بيتسجّل 25');
  assertEq(ok.forgot, false, 'ومش نسيان');
  assertEq(ok.overHours, 0, 'وجوه السماح = مفيش رصيد');

  // بريك زيادة بس معقول
  const over = info(50);
  assertEq(over.durMin, 50, 'بريك 50 دقيقة بيتسجّل 50');
  assertEq(over.forgot, false, 'ولسه مش نسيان (تحت الحد 60)');
  assertEq(over.overHours, 1, 'و(50−30−5)÷10 = ساعة رصيد');

  // ⭐ الحادثة: 20 ساعة
  const forgot = info(20 * 60);
  assertEq(forgot.rawMin, 1200, 'المدة الحقيقية متسجّلة للمراجعة');
  assertEq(forgot.durMin, 60, '⭐⭐ المحسوب 60 دقيقة (الحد) مش 1200');
  assertEq(forgot.forgot, true, '⭐ ومتعلّم إنه نسيان');
  assertEq(forgot.overHours, 2, '⭐⭐ ساعتين رصيد مش 116');
  assertEq(forgot.endTs, t0 + 60*MIN, '⭐ والقفل على الحد');

  // 🔴 إثبات الباج القديم
  assertEq(S.window.breakHoursFrom(1200, 30, CFG), 116,
    'إثبات: من غير السقف كانت 116 ساعة رصيد ≈ 16 يوم خصم');

  // الحد نفسه إعداد
  const wide = S.window.breakCloseInfo(brk, Object.assign({}, CFG, { autoCloseBreakMult: 4 }), t0 + 1200*MIN);
  assertEq(wide.durMin, 120, 'الحد = breakMin × autoCloseBreakMult (إعداد)');

  // حالات حدّية
  assertEq(S.window.breakCloseInfo(brk, CFG, t0 - 5*MIN).durMin, 0, 'وقت سالب = صفر مش رقم غريب');
  assertEq(S.window.breakCloseInfo({}, CFG, t0).durMin, 0, 'ومن غير بداية مبيكسرش');
})();

// ============================================================
// ١٣) القفل التلقائي واليدوي بيقولوا نفس الحاجة
//     (كان endTs على الحد وdurationMin على المدة الحقيقية)
// ============================================================
(function(){
  const src = fs.readFileSync(path.join(ROOT,'sales','sales-app.js'),'utf8');
  const auto = src.slice(src.indexOf('async function autoCloseStaleBreaks('),
                         src.indexOf('async function autoCloseStaleBreaks(') + 1400);
  assert(/breakCloseInfo\(b, cfg/.test(auto), '⭐ القفل التلقائي بيستخدم نفس الدالة');
  assert(!/durationMin: Math\.round\(\(Date\.now\(\) - b\.startTs\)/.test(auto),
    '⛔ ومبيسجّلش المدة الحقيقية كمدة محسوبة');
  const manual = src.slice(src.indexOf('async function endBreak('),
                           src.indexOf('async function endBreak(') + 1600);
  assert(/breakCloseInfo\(brk, cfg/.test(manual), '⭐ والقفل اليدوي كمان');
  assert(/forgotEndBreak: info\.forgot/.test(manual) && /rawMin: info\.rawMin/.test(manual),
    '⭐ والاتنين بيسجّلوا العلامة والمدة الحقيقية');
  assert(/window\.breakCloseInfo = breakCloseInfo/.test(src), 'معروضة على window');
  assert(/forgottenBreaks/.test(src), 'وفيه كاشف للبريكات المنسية في شريط "محتاج منك"');
})();

// ============================================================
// ١٤) 🔒 "دوست قفل البريك ومقفلش" — كل مسار فشل اتقفل
// ============================================================
const bsrc = fs.readFileSync(path.join(ROOT,'sales','sales-app.js'),'utf8');

(function(){
  // (أ) البحث عن البريك المفتوح من غير قيد تاريخ
  const open = extractFnB(bsrc, 'function openBreakFor(');
  assert(!!open, 'لقينا openBreakFor');
  assert(!!open && /!b\.endTs/.test(open), '⭐ بيدوّر على المفتوح');
  assert(!!open && !/dateKey/.test(open),
    '⭐⭐ من غير قيد التاريخ — بريك فضل مفتوح كان مستحيل يتقفل بعد نص الليل');

  const end = extractFnB(bsrc, 'async function endBreak(');
  assert(!!end && /openBreakFor\(empId\) \|\| todaysBreak\(empId\)/.test(end),
    '⭐ القفل بيستخدمه الأول والقديم فولباك');

  // (ب) تأكيد بعد الكتابة — السكوت مبقاش معناه نجاح
  assert(!!end && /✅ رجعتي/.test(end),
    '⭐⭐ رسالة تأكيد بعد ما الكتابة تنجح فعلًا');
  const okIdx = end.indexOf('✅ رجعتي');
  const writeIdx = end.indexOf('fbUpdateDoc');
  assert(writeIdx > 0 && okIdx > writeIdx,
    '⭐ والتأكيد **بعد** الكتابة مش قبلها');
  assert(/❌ البريك ماتقفلش/.test(end), '⭐⭐ والفشل صريح مش رسالة تقنية');

  // (ج) بريك تاني وواحد مفتوح
  const start = extractFnB(bsrc, 'async function startBreak(');
  assert(!!start && /openBreakFor\(empId\)/.test(start),
    '⭐ مينفعش بريك جديد وفيه واحد لسه مفتوح');

  // (د) الكاميرا مبتمنعش القفل — بس الصورة تفضل إجبارية ومطلوبة
  assert(/pendingPhotoAction\.type === 'break-end'/.test(bsrc),
    '⭐⭐ فشل الكاميرا في قفل البريك مبيمنعش القفل');
  assert(!/attPhotoSkipBtn/.test(bsrc),
    '⛔ ومفيش زرار "من غير صورة" للموظفة — مش خيار ليها');
  assert(/endPhotoMissing: !photoDataUri/.test(bsrc),
    '⭐⭐ الصورة الناقصة بتتعلّم في المستند');
  assert(/breaksMissingPhoto/.test(bsrc) && /بريكات من غير صورة رجوع/.test(bsrc),
    '⭐ وبتوصل للمسؤول في شريط "محتاج منك"');
  assert(/📷 الصورة مأخدتش/.test(bsrc), 'والموظفة بتتبلّغ إنها هتتراجع');
  // ⛔ والاستثناء للقفل بس — الحضور والانصراف لسه الصورة إجبارية
  const cam = bsrc.slice(bsrc.indexOf('تعذر التقاط الصورة'), bsrc.indexOf('async function finishAttPhoto'));
  assert(!/type === 'in'|type === 'out'|break-start/.test(cam),
    '⛔ التخطي لقفل البريك بس — مفيش تخطي للحضور أو الانصراف أو بدء البريك');
})();

function extractFnB(src, header){
  const i = src.indexOf(header);
  if(i < 0) return null;
  let d = 0, st = false;
  for(let j = src.indexOf('{', i); j < src.length; j++){
    if(src[j] === '{'){ d++; st = true; }
    else if(src[j] === '}'){ d--; if(st && d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
