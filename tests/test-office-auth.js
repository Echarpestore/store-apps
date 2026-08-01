// ============================================================
// 🔐 test-office-auth — أمان الدخول في تطبيق Office
// الباجات: كود المالك مكتوب صريح في ملف بيتقدّم للعامة · الباسورد متخزّن
// على الجهاز بتشويش · علامة "أنا المالك" قابلة للزرع · مفيش انتهاء صلاحية.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OF = path.resolve(__dirname, '..', 'Office');
const src = fs.readFileSync(path.join(OF, 'office.js'), 'utf8');
console.log('  (المصدر: Office/office.js)');

// ---- ١) مفيش أي كود مالك في الملف ----
assert(!/OWNER_CODE\s*=\s*['"]/.test(src), '🔴 مفيش ثابت كود مالك في المصدر');
assert(!/\b2005\b/.test(src), '🔴 ولا الكود القديم نفسه (حتى في تعليق)');
assert(/OF_GATE_DOC/.test(src) && /pos_test_settings/.test(src),
  'الكود بقى بصمة في Firestore');

// ---- ٢) الباسورد مابقاش يتخزّن ----
assert(!/function _ofEnc/.test(src), 'دالة التشويش اتشالت');
assert(!/function _ofDec/.test(src), 'وفك التشويش كمان');
assert(!/saveOfficeLogin\s*\(/.test(src), 'مفيش حفظ لبيانات الدخول');
assert(!/signInWithEmailAndPassword\(s\.e, s\.p\)/.test(src),
  '🔑 مفيش دخول تلقائي بباسورد مخزّن');
assert(/setPersistence/.test(src), 'الجلسة على Firebase نفسه (توكن ينفع يتلغي)');
assert(/localStorage\.removeItem/.test(src), '🧹 وبيمسح أي بيانات قديمة من الأجهزة');

// ---- ٣) العلامة الدائمة اتشالت ----
assert(!/localStorage\.setItem\('office_owner_ok'/.test(src),
  "🔴 علامة office_owner_ok='1' مابقتش بتتكتب (كانت بتتزرع من devtools)");
assert(/OF_SESS_HOURS/.test(src), 'الجلسة بقى ليها مدة');
const m = src.match(/OF_SESS_HOURS\s*=\s*(\d+)/);
assert(!!m && Number(m[1]) > 0 && Number(m[1]) <= 24,
  'المدة معقولة (' + (m ? m[1] : '?') + ' ساعة)');
assert(/Date\.now\(\) > o\.exp/.test(src), 'وبتتفحص فعلًا عند القراءة');
assert(/o\.h !== _gateHash/.test(src),
  '🔑 تغيير الكود بيبطّل كل الجلسات القديمة تلقائي');

// ---- ٤) تهدئة المحاولات ----
assert(/_gateTries/.test(src), 'فيه عداد محاولات');
assert(/_gateTries >= 5/.test(src), 'وبيقف بعد 5 محاولات غلط');

// ---- ٥) البصمة نفسها ----
assert(/crypto\.subtle\.digest\('SHA-256'/.test(src), 'SHA-256 مش تشويش');
assert(/'echarpe-office:'/.test(src), 'وبملح ثابت مش الكود عريان');
const h = (x)=> crypto.createHash('sha256').update('echarpe-office:' + x, 'utf8').digest('hex');
assert(h('1234') !== h('1235'), 'أكواد مختلفة = بصمات مختلفة');
assert(h('1234') === h('1234'), 'ونفس الكود = نفس البصمة');
assert(h('1234').length === 64, 'طول البصمة صح');

// ---- ٦) أول تشغيل آمن ----
assert(/if\(!_gateHash\)\{/.test(src), '🆕 أول تشغيل بيسجّل كود جديد');
assert(/val\.length < 4/.test(src), 'وبحد أدنى 4 أرقام');
assert(src.indexOf('signInWithEmailAndPassword') < src.indexOf('if(!_gateHash){'),
  '⚠️ التسجيل ده بعد دخول Firebase — مش مفتوح لأي حد');

// ---- ٧) تغيير الكود من جوه ----
assert(/officeChangeCode/.test(src), 'فيه طريقة يغيّر بيها الكود');
assert(/if\(!ownerOk\)\{ alert/.test(src), 'ومحجوبة لحد ما البوابة تتفتح');

// ---- ٨) الكاش اترفع ----
const sw = fs.readFileSync(path.join(OF, 'sw.js'), 'utf8');
assert(/echarpe-office-v\d+/.test(sw), 'CACHE_NAME فيه رقم نسخة');

// ============================================================
// 📅 شاشة اليوم — لازم تطابق تقفيل الفرع بالظبط
// ============================================================
{
  const html = fs.readFileSync(path.join(OF, 'index.html'), 'utf8');
  const vm = require('vm');

  // ---- الواجهة موجودة ----
  ['page-day','dayBranch','dayDate','dayPay','daySales','dayItems','dayWindow']
    .forEach(id=> assert(html.indexOf('id="' + id + '"') >= 0, 'الواجهة: ' + id));
  assert(/data-page="day"/.test(html), 'زرار التنقل موجود');
  assert(html.indexOf('data-page="day"') < html.indexOf('data-page="inbox"'),
    'اليوم أول تبويب');

  // ---- منطق يوم الشغل ----
  const i = src.indexOf('const OF_TZ'), j = src.indexOf('// ---- تحميل فواتير اليوم');
  assert(i > 0 && j > i, 'بلوك يوم الشغل اتلقى');
  const box = { Intl:Intl, Date:Date, Math:Math, Number:Number, String:String, console:console };
  vm.createContext(box);
  vm.runInContext(src.slice(i, j).replace(/^async function ofLoadDayCut[\s\S]*?\n\}\n/m, ''), box);
  const range = (d)=> vm.runInContext(`ofBizDayRange(${JSON.stringify(d)})`, box);
  const inDay = (day, iso)=>{ const r = range(day), x = Date.parse(iso); return x >= r.start && x < r.end; };

  assert(inDay('2026-07-31','2026-07-31T23:25:00+03:00'), '🕕 فاتورة 11 بالليل على يومها');
  assert(inDay('2026-07-31','2026-08-01T02:00:00+03:00'), '🕕 فاتورة الفجر على اليوم اللي فات');
  assert(!inDay('2026-07-31','2026-08-01T07:00:00+03:00'), 'وبعد الفاصلة على اليوم الجديد');
  assert(!inDay('2026-07-31','2026-07-31T05:00:00+03:00'), 'وقبل الفاصلة على اليوم اللي قبله');
  const r1 = range('2026-07-31');
  assertEq(r1.end - r1.start, 24*3600*1000, 'اليوم 24 ساعة بالظبط');
  // الشتا (توقيت مختلف) لازم يشتغل برضه
  const r2 = range('2026-01-15');
  assertEq(r2.end - r2.start, 24*3600*1000, 'وبرضه في الشتا (إزاحة مختلفة)');

  // ---- وقت البيع الحقيقي: نفس saleTs في الـPOS ----
  const ts = (s)=> vm.runInContext(`ofSaleTs(${JSON.stringify(s)})`, box);
  assertEq(ts({ createdAtMs: 1000 }), 1000, 'الطابع المحلي لوحده');
  assertEq(ts({ createdAtMs: 1000, createdAt: null }), 1000, 'ومع سيرفر فاضي');
  assert(ts({}) === null || ts({}) === undefined, 'مفيش طابع = null');

  // ---- ملخص الدفع بمنطق التقفيل / الأصناف بمنطق التقارير ----
  const payFn = src.slice(src.indexOf('function ofRenderPay'), src.indexOf('function ofRenderSales'));
  assert(!/s\.reversed\) return/.test(payFn),
    '💵 ملخص الدفع بيشمل المعكوسة والعكس مع بعض (زي التقفيل)');
  const itemFn = src.slice(src.indexOf('function ofRenderItems'), src.indexOf('function ofWireDay'));
  assert(/if\(s\.reversed \|\| s\.isReversal\) return;/.test(itemFn),
    '📦 وملخص الأصناف بيستبعد الطرفين (زي التقارير) — الصنف مايتعدّش مرتين');
  assert(/isRedemption \|\| it\.isRewardDiscount/.test(itemFn),
    'وسطور الاستبدال والمكافأة مستبعدة من الأصناف');

  // ---- الاستعلام على السيرفر مش فلترة على الجهاز ----
  const loadFn = src.slice(src.indexOf('async function ofLoadDay'), src.indexOf('function ofRenderDay'));
  assert(/\.where\('createdAt','>='/.test(loadFn) && /\.where\('createdAt','<'/.test(loadFn),
    '⚡ استعلام بنطاق زمني على السيرفر');
  assert(/\.where\('branch','==', br\)/.test(loadFn), 'وبالفرع');
  assert(/rows\.filter\(/.test(loadFn) && /ofSaleTs\(s\)/.test(loadFn),
    '🕐 وفلترة تانية بالوقت الحقيقي (فواتير الأوفلاين طابع سيرفرها وقت الرفع)');

  const sw2 = fs.readFileSync(path.join(OF, 'sw.js'), 'utf8');
  assert(/echarpe-office-v\d+/.test(sw2), 'CACHE_NAME فيه رقم نسخة (شاشة اليوم)');
}

// ============================================================
// ✅ التاسك الأسبوعي
// النظام القديم: sales_tasks/{empId} — مستند واحد لكل موظفة، فأي تاسك جديد
// بيمسح القديم. مفيش أسبوع ولا حالة ولا تاريخ.
// ============================================================
{
  const html2 = fs.readFileSync(path.join(OF, 'index.html'), 'utf8');
  const vm2 = require('vm');

  ['page-tasks','tkBranch','tkRange','tkList'].forEach(id=>
    assert(html2.indexOf('id="' + id + '"') >= 0, 'الواجهة: ' + id));
  assert(/data-page="tasks"/.test(html2), 'زرار التاسكات موجود');

  // ---- 🔑 تطبيق الحضور مايتكسرش ----
  const save = src.slice(src.indexOf("btn.onclick = async function()"), src.indexOf('function ofWireTasks'));
  assert(/db\.collection\('sales_tasks'\)\.doc\(emp\.id\)\.set\(/.test(save),
    "🔑 لسه بيكتب sales_tasks/{empId} — ده اللي تطبيق الحضور بيقراه");
  ['employeeId','taskDescription','branch'].forEach(f=>
    assert(new RegExp(f + ':').test(save), 'الحقل ' + f + ' اللي الحضور محتاجه لسه موجود'));
  assert(/\{ merge: true \}/.test(save), 'وبـmerge — مش بيمسح حقول تانية');

  // ---- 🗂️ وسجل الأسبوع الجديد ----
  assert(/db\.collection\('sales_task_weeks'\)\.doc\(emp\.id \+ '__' \+ wk\)/.test(save),
    '🗂️ مستند لكل (موظفة × أسبوع) = التاريخ بيفضل');
  assert(/weekKey: wk/.test(save), 'ومفتاح الأسبوع متسجل في الاتنين');

  // ---- 📅 حسبة الأسبوع ----
  const i2 = src.indexOf('const OF_WEEK_START'), j2 = src.indexOf('async function ofLoadTasks');
  const k2 = src.indexOf('function _ofShopParts'), l2 = src.indexOf('function _ofOffsetMs');
  assert(i2 > 0 && j2 > i2, 'بلوك الأسبوع اتلقى');
  const b2 = { Intl:Intl, Date:Date, Number:Number, String:String, Math:Math, console:console };
  vm2.createContext(b2);
  vm2.runInContext("const OF_TZ='Africa/Cairo'; let _ofDayCut=6;" + src.slice(k2,l2) + src.slice(i2,j2), b2);
  const ws = (o)=> vm2.runInContext('ofWeekStartMs(' + o + ')', b2);
  const wkk = (m)=> vm2.runInContext('ofWeekKey(' + m + ')', b2);

  assert([-9,-3,-1,0,1,5,20].every(o=> new Date(ws(o)).getUTCDay() === 6),
    '📅 الأسبوع بيبدأ السبت دايمًا (أسبوع الشغل في مصر)');
  assertEq(ws(1) - ws(0), 7*86400000, 'وكل أسبوع 7 أيام بالظبط');
  assertEq(ws(0) - ws(-1), 7*86400000, 'والرجوع كمان');
  assert(wkk(ws(0)) !== wkk(ws(1)), 'مفتاح مختلف لكل أسبوع');
  assert(/^w\d{4}-\d{2}-\d{2}$/.test(wkk(ws(0))), 'شكل المفتاح ثابت ومقروء');

  // ---- 🕕 بيوم الشغل مش التقويمي ----
  const wsFn = src.slice(src.indexOf('function ofWeekStartMs'), src.indexOf('function ofWeekKey'));
  assert(/_ofShopParts\(ms\)\.hh < _ofDayCut/.test(wsFn),
    '🕕 الساعة 2 فجرًا يوم السبت لسه أسبوع الجمعة (نفس فاصلة التقفيل)');
  assert(/ms -= 86400000/.test(wsFn), 'وبيرجع يوم كامل');

  // ---- الاستعلامات ----
  const load = src.slice(src.indexOf('async function ofLoadTasks'), src.indexOf('function ofRenderTasks'));
  assert(/\.where\('weekKey','==', wk\)/.test(load), 'بيجيب أسبوع واحد بس');
  assert(/\.where\('branch','==', br\)/.test(load), 'وفرع واحد');
  assert(/submittedAt','>=', wkMs/.test(load) && /submittedAt','<', wkMs \+ 7/.test(load),
    'والتسليمات بنطاق الأسبوع — مش كل التسليمات');

  const sw3 = fs.readFileSync(path.join(OF, 'sw.js'), 'utf8');
  assert(/echarpe-office-v\d+/.test(sw3), 'CACHE_NAME فيه رقم نسخة (التاسكات)');
}

// ============================================================
// 🔁 المصاريف المتكررة — قوالب شهرية لكل فرع
// الإيجار ثابت والكهربا متغيّرة، وكل فرع لوحده.
// ============================================================
{
  const html3 = fs.readFileSync(path.join(OF, 'index.html'), 'utf8');
  assert(html3.indexOf('id="recurringBox"') >= 0, 'الواجهة موجودة');
  assert(html3.indexOf('id="recurringBox"') < html3.indexOf('id="expensesList"'),
    'المتكررة فوق قايمة المصاريف');

  // ⚠️ من دالة العرض لآخر البلوك — مش من تعريف الثابت (اللي بقى فوق الملف
  //    بعد إصلاح الـTDZ، فكان بيسحب startData كله معاه)
  const R = src.slice(src.indexOf('function ofRenderRecurring'));
  assert(R.length > 0, 'بلوك المتكررة اتلقى');

  // ---- 🔑 شكل المصروف القديم مالوش لمسة ----
  assert(/amount: amount,/.test(R) && /note:/.test(R) && /ts: Date\.now\(\)/.test(R) && /month: mk/.test(R),
    '🔑 التسجيل بنفس شكل المصروف القديم (الأرباح والإجماليات مش هتتأثر)');
  assert(/db\.collection\('office_expenses'\)\.add\(/.test(R),
    'وبيتكتب في نفس المجموعة');
  assert(/recurringId: t\.id/.test(R), '🔗 وبربط بالقالب عشان نعرف اتدفع ولا لأ');
  assert(/OF_RECUR_COL = 'office_recurring'/.test(src),
    'القوالب في مجموعة منفصلة — مش مصاريف فعلية');

  // ---- ثابت مقابل متغيّر ----
  assert(/t\.kind !== 'fixed'/.test(R), 'المتغيّر بيسأل عن المبلغ');
  assert(/prompt\('مبلغ '/.test(R), 'في كل مرة');
  assert(/kind: isFixed \? 'fixed' : 'variable'/.test(R), 'والنوع بيتحفظ في القالب');
  assert(/amount: isFixed \? amount : null/.test(R), 'والثابت بس هو اللي ليه مبلغ محفوظ');

  // ---- كل فرع لوحده ----
  assert(/branch: brTxt\.trim\(\)/.test(R), '🏬 القالب مربوط بفرع');
  assert(/branch: t\.branch \|\| null/.test(R), 'والمصروف المتسجل كمان');

  // ---- 🛡️ مفيش تسجيل تلقائي ----
  assert(!/setInterval|autoPay|autoGenerate/.test(R),
    '🛡️ مفيش تسجيل تلقائي — النظام بيقترح والمالك بيأكد');

  // ---- منع الدفع مرتين ----
  const paidFn = src.slice(src.indexOf('function ofRecurPaid'), src.indexOf('function ofRenderRecurring'));
  assert(/e\.month === mk && e\.recurringId === tpl\.id/.test(paidFn),
    'فحص "اتدفع" بالشهر والقالب مع بعض');
  assert(/if\(ofRecurPaid\(t, mk\)\)\{ alert/.test(R),
    '⛔ فحص أخير قبل الكتابة — يمنع الدفع مرتين من جهازين');

  // ---- مسح القالب مايمسحش التاريخ ----
  assert(/المصاريف اللي اتسجلت منه قبل كده هتفضل/.test(R),
    '🗑️ مسح القالب بيوقف التذكير بس — المصاريف بتفضل');
  assert(/db\.collection\(OF_RECUR_COL\)\.doc\(t\.id\)\.delete\(\)/.test(R),
    'وبيمسح القالب مش المصروف');

  // ---- موصّلة ----
  assert(/D\.recurring = s\.docs\.map/.test(src), 'الاشتراك موصّل');
  assert(/recurring:\[\]/.test(src), 'ومعرّفة في مخزن البيانات');
  const expSnap = src.slice(src.indexOf("db.collection('office_expenses').onSnapshot"), src.indexOf('// 🔁 قوالب'));
  assert(/ofRenderRecurring\(\)/.test(expSnap),
    'وبتتحدّث لما مصروف يتسجل (حالة "اتدفع" بتتغير)');

  const sw4 = fs.readFileSync(path.join(OF, 'sw.js'), 'utf8');
  assert(/echarpe-office-v\d+/.test(sw4), 'CACHE_NAME فيه رقم نسخة (المتكررة)');
}

// ⚠️ TDZ: OF_RECUR_COL لازم تتعرّف قبل أول استخدام — const مبتترفعش
{
  const defAt = src.indexOf("const OF_RECUR_COL");
  const useAt = src.indexOf("db.collection(OF_RECUR_COL)");
  assert(defAt > 0 && useAt > 0, 'التعريف والاستخدام موجودين');
  assert(defAt < useAt,
    '🔑 التعريف قبل الاستخدام (كان بعده — الاشتراك بيرمي TDZ ويوقف باقي التحميل)');
}

// ============================================================
// 🔔 Push حقيقي — إشعارات توصل والتطبيق مقفول
// الإشعارات القديمة كانت محلية (بتتولد من الصفحة) فبتشتغل والتطبيق مفتوح بس.
// ============================================================
{
  const html4 = fs.readFileSync(path.join(OF, 'index.html'), 'utf8');
  const sw5 = fs.readFileSync(path.join(OF, 'sw.js'), 'utf8');

  // ---- SDK والـSW ----
  assert(/firebase-messaging-compat\.js/.test(html4), 'SDK الرسايل متحمّل');
  assert(/addEventListener\('push'/.test(sw5), '🔔 الـSW بيستقبل push');
  assert(/showNotification/.test(sw5), 'وبيعرض الإشعار');
  assert(/requireInteraction: true/.test(sw5), 'وبيفضل ظاهر لحد ما المالك يشوفه');
  assert(/addEventListener\('notificationclick'/.test(sw5), 'والضغط عليه بيفتح التطبيق');
  assert(/c\.focus\(\)/.test(sw5), 'أو بيرجّعه لو مفتوح');

  // ---- التسجيل ----
  const reg = src.slice(src.indexOf('async function ofRegisterPush'), src.indexOf('async function ofUnregisterPush'));
  assert(reg.length > 0, 'دالة التسجيل موجودة');
  assert(/vapidKey: OF_VAPID/.test(reg), 'بمفتاح VAPID');
  assert(/'tokens\.' \+ token/.test(reg), '🔑 التوكن بيتحفظ كمفتاح — أجهزة كتير للمالك');
  assert(/doc\('office_push'\)/.test(reg), 'في مستند مخصص');
  assert(/Notification\.permission === 'denied'/.test(reg),
    'وبيتعامل مع الرفض السابق برسالة واضحة');
  assert(/setTimeout\(function\(\)\{ ofRegisterPush\(\)/.test(src),
    '🔁 تجديد صامت — التوكن بيتغيّر لوحده والإشعارات كانت هتقف بصمت');

  // ---- ⚠️ مفيش تكرار ----
  const mn = src.slice(src.indexOf('function maybeNotifyNew'), src.indexOf('function maybeNotifyNew') + 700);
  assert(/_hasPush/.test(mn) && /firstLoadDone && !_hasPush/.test(mn),
    '⚠️ الإشعار المحلي بيتوقف لو الـpush مفعّل — مفيش إشعارين لنفس الحاجة');

  // ---- إلغاء التسجيل ----
  assert(/FieldValue\.delete\(\)/.test(src), '🔕 الإلغاء بيمسح التوكن فعلًا');

  const sw6 = fs.readFileSync(path.join(OF, 'sw.js'), 'utf8');
  assert(/echarpe-office-v\d+/.test(sw6), 'CACHE_NAME فيه رقم نسخة (push)');
}

// ============================================================
// 👆 البصمة · 🙈 إخفاء الأرقام · 🔒 كود المالك مخفي
// ============================================================
{
  const html5 = fs.readFileSync(path.join(OF, 'index.html'), 'utf8');

  // ---- 🔒 كود المالك مابقاش ظاهر على الشاشة ----
  assert(/id="gCode"[^>]*type="password"/.test(html5),
    '🔒 كود المالك بقى مخفي (كان بيتكتب ظاهر قدام أي حد)');
  assert(/id="gPass"[^>]*type="password"/.test(html5), 'والباسورد زي ما هو');

  // ---- 👆 البصمة ----
  const bio = src.slice(src.indexOf('const OF_BIO_KEY'), src.indexOf("$('#gCodeBtn').addEventListener"));
  assert(bio.length > 0, 'بلوك البصمة موجود');
  assert(/navigator\.credentials\.create/.test(bio), 'WebAuthn للربط');
  assert(/navigator\.credentials\.get/.test(bio), 'وللفتح');
  assert(/authenticatorAttachment: 'platform'/.test(bio),
    '👆 بصمة/وش الجهاز نفسه — مش مفتاح خارجي');
  assert(/userVerification: 'required'/.test(bio),
    '⚠️ تحقق فعلي إجباري — مش مجرد وجود الجهاز');
  assert(/rec\.h !== _gateHash/.test(bio),
    '🔑 تغيير كود المالك بيبطّل البصمة تلقائي');
  assert(/localStorage\.removeItem\(OF_BIO_KEY\)/.test(bio), 'وبتتشال من الجهاز');
  assert(/if\(!ownerOk\)\{ alert\('افتح بالكود الأول/.test(bio),
    '⛔ الربط بعد الكود بس — مينفعش حد يربط بصمته من غير ما يعرف الكود');
  assert(/_sessWrite\(/.test(bio), 'والفتح بيكتب جلسة بمدة زي الكود بالظبط');
  assert(html5.indexOf('id="gBioBtn"') >= 0 && html5.indexOf('id="gBioEnroll"') >= 0,
    'الواجهة: زرار الفتح + شيك-بوكس الربط');
  assert(/window\._bioTried/.test(src),
    '🔁 الفتح التلقائي مرة واحدة لكل فتحة — مش كل رسم للشاشة');

  // ---- 🙈 إخفاء الأرقام ----
  assert(html5.indexOf('id="eyeBtn"') >= 0, 'زرار العين موجود');
  const eg = src.slice(src.indexOf('function egp(n)'), src.indexOf('function ofToggleMoney'));
  assert(/if\(_ofHideMoney\) return '••••';/.test(eg),
    "🙈 كل الفلوس بتعدي من egp — الإخفاء نقطة واحدة");
  assert(/localStorage\.setItem\('office_hide_money'/.test(src), 'والحالة بتفضل بين الفتحات');

  // ⚠️ شاشة اليوم مكانتش بتعدي على egp
  const om = src.slice(src.indexOf('function ofMoney'), src.indexOf('function ofMoney') + 300);
  assert(/_ofHideMoney\) return '••••'/.test(om),
    '⚠️ وشاشة اليوم كمان (كانت بتستخدم ofNum وتفضل مكشوفة)');
  const dayBlock = src.slice(src.indexOf('function ofRenderPay'));
  // ⚠️ التأكيد لازم يمسك ofNum **الملاصقة** لـج.م — سطر واحد ممكن يشيل
  //    كمية وفلوس مع بعض (totQ قطعة + totR ج.م)، والفحص الفضفاض بيقع عليه غلط.
  const moneyLines = (dayBlock.match(/ofNum\([^)]*\)\s*\+\s*' ج\.م/g) || []);
  assertEq(moneyLines, [], '🔍 مفيش أي رقم فلوس في شاشة اليوم لسه بيعدي على ofNum');
  assert(/ofNum\(m\.qty\)/.test(dayBlock) && /ofNum\(totQ\)/.test(dayBlock),
    'والكميات (عدد القطع) فضلت ظاهرة — مش سرّية');

  const sw7 = fs.readFileSync(path.join(OF, 'sw.js'), 'utf8');
  assert(/echarpe-office-v12/.test(sw7), 'CACHE_NAME اترفع لـv12');
}
