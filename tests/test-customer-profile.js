// ============================================================
// 👤 test-customer-profile — صفحة العميل
//
// اللي كان ناقص: الاسم مكانش بيتعدّل خالص (بيتكتب مرة واحدة وقت
// التسجيل وخلاص)، والصفحة مكانش فيها مرتجعات ولا حالة الولاء ولا
// المكافآت ولا "غايبة من كام يوم".
//
// ⚠️ التعديلات دي بتلمس **النقط** — والنقط فلوس (بتتحوّل خصم في
//    الفاتورة). فالاختبارات هنا مركّزة على الحراس: الصلاحية، السبب
//    الإجباري، والتسجيل.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT,'pos','profiles.js'),'utf8');

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

// ============================================================
// ١) ✏️ تعديل الاسم — الرقم ممنوع يتلمس
// ============================================================
(function(){
  const fn = extractFn(src, 'async function editCustomerName(');
  assert(!!fn, 'لقينا editCustomerName');
  if(!fn) return;
  assert(/askText\(/.test(fn), '⭐ بيستخدم askText مش prompt (prompt بتفشل بصمت في Electron)');
  assert(!/prompt\(/.test(fn), '⛔ مفيش prompt خالص');
  assert(/set\(\{ name: clean, updatedAtMs: Date\.now\(\), updatedAt: firebase\.firestore\.FieldValue\.serverTimestamp\(\) \}, \{ merge:true \}\)/.test(fn),
    '⭐⭐ بيكتب الاسم + طوابع المزامنة بس — merge، فمفيش أي بيانات عميل بتتمسح');
  assert(!/doc\(clean\)|delete\(\)|\.set\(\{\s*phone:/.test(fn),
    '⛔ ومبيلمسش رقم العميل في Firestore (هو معرّف المستند — تغييره نقل مش تعديل)');
  assert(/if\(!clean\)/.test(fn), '⭐ اسم فاضي مرفوض');
  assert(/if\(clean === cur\) return/.test(fn), 'ونفس الاسم = مفيش كتابة زيادة');
  assert(/_logActivity\('customer_name_edit'/.test(fn) && /from: cur, to: clean/.test(fn),
    '⭐ التغيير بيتسجل بالقديم والجديد');
})();

// ============================================================
// ٢) ⚖️ تعديل النقط — أخطر حاجة في الصفحة
// ============================================================
(function(){
  const fn = extractFn(src, 'async function editCustomerPoints(');
  assert(!!fn, 'لقينا editCustomerPoints');
  if(!fn) return;
  assert(/if\(!hasPerm\('canRedeemManual'\)\)/.test(fn),
    '⭐⭐ محجوب على الكاشير (نفس صلاحية الاستبدال اليدوي)');
  // نيجاتيف: الحارس أول سطر مش بعد ما يعرض الشاشة
  const head = fn.slice(0, fn.indexOf('askText'));
  assert(/hasPerm/.test(head), '⭐ والفحص قبل أي شاشة تتفتح مش بعدها');
  assert(/if\(!reason\)/.test(fn), '⭐⭐ السبب إجباري — مفيش تعديل نقط من غير سبب مكتوب');
  assert(/if\(!isFinite\(next\) \|\| next < 0\)/.test(fn), '⭐ رصيد سالب مرفوض');
  assert(/_logActivity\('customer_points_edit'/.test(fn), 'والتعديل بيتسجل');
  assert(/from: cur, to: next, diff: next - cur, reason/.test(fn),
    '⭐ بالقديم والجديد والفرق والسبب — سجل يصلح للمراجعة');
  assert(/pointsFieldFor\(currentBranch\)/.test(fn),
    '⭐ وبيعدّل نقط البراند الصح (echarpe/glow منفصلين)');
  // الزرار نفسه متخفي عن اللي مالوش صلاحية
  assert(/hasPerm\('canRedeemManual'\) \?/.test(src),
    'والزرار أصلًا مبيظهرش لغير المصرّح له');
})();

// ============================================================
// ٣) 🔁 حساب المرتجعات — الفاتورة المعكوسة والسطر المرتجع
// ============================================================
(function(){
  // بنشغّل نفس منطق العدّ من الملف على بيانات معروفة
  const open = extractFn(src, 'async function openCustomerProfile(');
  assert(!!open, 'لقينا openCustomerProfile');
  if(!open) return;
  const i = open.indexOf('let returnCount = 0');
  const j = open.indexOf('// 🏬 الفرع');
  const block = open.slice(i, j);
  assert(block.length > 50, 'لقينا بلوك حساب المرتجعات');

  const box = { sales: [
    { isReversal:true, total:-250, items:[] },                                  // فاتورة عكس كاملة
    { isReversal:false, total:100, items:[{ price:50, qty:1 }, { price:-30, qty:1, isReturn:true }] }, // سطر مرتجع جوه بيعة
    { isReversal:false, total:200, items:[{ price:200, qty:1 }] }               // بيعة عادية
  ], Math: Math };
  box.globalThis = box;
  vm.createContext(box);
  const out = vm.runInContext(block + '\n;({ c: returnCount, v: returnValue });', box);
  assertEq(out.c, 2, '⭐ فاتورتين فيهم مرتجع (العكس + السطر) مش تلاتة');
  assertEq(out.v, 280, '⭐ والقيمة 250 + 30 = 280 (بالموجب)');
})();

// ============================================================
// ٤) 📱 حالة الولاء: مسجّلة في التطبيق؟ إشعاراتها شغالة؟
// ============================================================
(function(){
  const m = src.match(/const inApp\s*=\s*([^;]+);/);
  assert(!!m, 'حالة "مسجّلة في التطبيق" محسوبة في الهيدر');
  if(!m) return;
  const inApp = new Function('c', 'return ' + m[1]);
  assertEq(inApp({ loyaltyCode:'AB12' }), true, 'عندها كود ولاء = مسجّلة');
  assertEq(inApp({ source:'loyalty_app:qr' }), true, 'أو سجّلت من التطبيق نفسه');
  assertEq(inApp({ name:'سارة' }), false, '⭐ اتسجّلت من الكاشير بس = مش على التطبيق');
  assert(/const hasPush = custHasPush\(c\)/.test(src),
    '⭐ وحالة الإشعارات بتعدّي على دالة واحدة مشتركة (مش نسختين بيختلفوا)');
})();

// ============================================================
// ٤ب) 🔔 قراءة توكنات الإشعارات — الشكلين القديم والجديد
//
// الباج: تطبيق الولاء كان بيخزّن التوكن كـ**مفتاح حقل**
//   u['fcmTokens.' + token] = {...}
// وFirestore بيقرا أي نقطة جوه التوكن كفاصل مسارات → التوكن بيتشرشح
// لمستويات متداخلة ويتخزن مقطوع → الإشعار مبيوصلش. ودي على الأرجح
// السبب في إن 51 إشعار بس اتبعتوا من 208 فاتورة بعميلة مسجّلة.
// ============================================================
(function(){
  const rep = fs.readFileSync(path.join(ROOT,'pos','pos-reports.js'),'utf8');
  const fn = extractFn(rep, 'function custHasPush(');
  assert(!!fn, 'لقينا custHasPush في pos-reports.js');
  if(!fn) return;
  const box = { window:{}, Array: Array, Object: Object };
  box.globalThis = box;
  vm.createContext(box);
  vm.runInContext(fn + '\n;custHasPush;', box);
  const has = vm.runInContext('custHasPush', box);

  assertEq(has({ fcmTokens_echarpe:['tok1'] }), true, '⭐ الشكل الجديد (مصفوفة echarpe)');
  assertEq(has({ fcmTokens_glow:['tok2'] }), true, '⭐ ومصفوفة glow');
  assertEq(has({ fcmTokens:{ 'tok3':{} } }), true,
    '⭐⭐ والشكل القديم لسه بيتقرا — العملاء القدام مايختفوش من الإحصائية');
  assertEq(has({ fcmTokens_echarpe:[] }), false, 'مصفوفة فاضية = مفيش إشعارات');
  assertEq(has({ fcmTokens:{} }), false, 'وخريطة فاضية برضه');
  assertEq(has({}), false, 'ومفيش حقول خالص');
  assertEq(has(null), false, 'وعميل فاضي مبيكسرش الحساب');
})();

// ============================================================
// ٤ج) الكتابة نفسها: مصفوفة مش مفتاح حقل
// ============================================================
(function(){
  [['loyalty','echarpe'], ['glow','glow']].forEach(function(pair){
    const html = fs.readFileSync(path.join(ROOT, pair[0], 'index.html'), 'utf8');
    const L = pair[0] + ': ';
    assert(!/u\['fcmTokens\.'\s*\+\s*token\]/.test(html),
      L + "⛔ مفيش تخزين بمفتاح حقل ('fcmTokens.'+token) — ده اللي كان بيقطّع التوكن");
    assert(/fcmTokens_' \+ CATALOG_BRAND\] = firebase\.firestore\.FieldValue\.arrayUnion\(token\)/.test(html),
      L + '⭐ التوكن بيتحط في مصفوفة بـarrayUnion (بيمنع التكرار لوحده)');
    assert(/\.set\(\s*\(function\(\)\{[\s\S]{0,900}?\}\)\(\), \{ merge: true \}/.test(html),
      L + '⭐ وبـset+merge مش update — update بتفشل لو المستند مش موجود');
  });
})();

// ============================================================
// ٥) 📅 الغياب ومتوسط الفترة بين الزيارات
// ============================================================
(function(){
  const open = extractFn(src, 'async function openCustomerProfile(');
  const i = open.indexOf('const gapDays = times.length > 1');
  const line = open.slice(i, open.indexOf('const daysSince'));
  const gap = new Function('times', line + ' return gapDays;');
  const DAY = 86400000, t0 = 1750000000000;
  assertEq(gap([t0, t0+10*DAY, t0+20*DAY]), 10, 'تلات زيارات كل 10 أيام = متوسط 10');
  assertEq(gap([t0]), null, '⭐ زيارة واحدة = مفيش متوسط (مش صفر)');
  assertEq(gap([]), null, 'ومفيش زيارات = مفيش متوسط');
  // التحذير بيظهر لما تعدي ضعف المعتاد
  assert(/d\.daysSince > d\.gapDays \* 2/.test(src),
    '⭐ التحذير بيبان لما الغياب يعدّي ضعف المعتاد ليها هي — مش رقم ثابت للكل');
})();

// ============================================================
// ٦) 🎁 تبويب المكافآت
// ============================================================
(function(){
  assert(/\['rewards','🎁 المكافآت'\]/.test(src), 'التبويب موجود');
  const i = src.indexOf("_cpTab === 'rewards'");
  const body = src.slice(i, i + 1400);
  assert(/c\.rewards \|\| \[\]/.test(body), 'بيقرا من مصفوفة المكافآت في مستند العميل');
  assert(/r\.used/.test(body) && /expired/.test(body),
    '⭐ بيفرّق بين اتصرفت / خلصت / سارية — مش مجرد قايمة');
  assert(/slice\(\)\.sort/.test(body), '⛔ بينسخ قبل الترتيب (مبيبوظش المصفوفة الأصلية)');
})();

// ============================================================
// ٧) التلفون: واتساب واتصال
// ============================================================
(function(){
  const m = src.match(/const waPhone = ([^;]+);/);
  assert(!!m, 'رقم الواتساب متجهّز');
  const wa = new Function('d', 'return ' + m[1]);
  assertEq(wa({ phone:'01012345678' }), '201012345678', '⭐ الصفر البادئ بيتحول لكود مصر');
  assertEq(wa({ phone:'0100 123 4567' }), '201001234567', 'والمسافات بتتشال');
  assert(/wa\.me\//.test(src) && /href="tel:/.test(src), 'والزرارين موجودين');
})();

// ============================================================
// ٨) الكاش
// ============================================================
(function(){
  const sw = fs.readFileSync(path.join(ROOT,'pos','sw.js'),'utf8');
  const m = sw.match(/store-apps-shell-v(\d+)/);
  assert(!!m && Number(m[1]) >= 281, 'POS: CACHE_NAME v281+');
})();

// ============================================================
// ٩) ⭐ زرار "ابعت طلب تقييم"
//    الـPOS ميقدرش يبعت إشعار (المفتاح جوه Cloud Functions) — فبيعلّم
//    الفاتورة والدالة المجدولة بتلقطها. نفس المسار الحقيقي مش محاكاة.
// ============================================================
(function(){
  const fn = extractFn(src, 'async function sendRateRequest(');
  assert(!!fn, 'لقينا sendRateRequest');
  if(!fn) return;
  assert(/rateForce: true/.test(fn), '⭐ بيعلّم الفاتورة للإرسال');
  assert(/ratePushAt: firebase\.firestore\.FieldValue\.delete\(\)/.test(fn),
    '⭐ وبيشيل علامة "اتبعت قبل كده" وإلا الدالة هتتخطاها');
  assert(/!s\.isReversal && !s\.reversed/.test(fn),
    '⭐⭐ بيختار آخر فاتورة **حقيقية** — مش فاتورة عكس ولا متعكسة');
  assert(/\(s\.total\|\|0\) > 0/.test(fn), 'ولا فاتورة بصفر');
  assert(/confirm\(/.test(fn) && /phone/.test(fn),
    '⭐ وفيه تأكيد فيه اسم العميلة ورقمها — الإشعار بيروح لعميلة حقيقية');
  assert(/_logActivity\('rate_request_manual'/.test(fn), 'والإرسال بيتسجل');
  assert(!/createdAt/.test(fn),
    '⛔⛔ ومبيلمسش تاريخ الفاتورة خالص — ده كان هيخرّب كل التقارير');
  // الزرار بيظهر بس لو عندها إشعارات
  assert(/hasPush \? `<button onclick="sendRateRequest/.test(src),
    '⭐ والزرار مبيظهرش لعميلة مفيهاش إشعارات أصلًا');
})();
