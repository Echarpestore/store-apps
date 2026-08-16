// ============================================================
// 💬 test-chat-ui — شاشة شات العميلة (loyalty)
//
// المحرك نفسه متغطي في test-chat. هنا بنفحص قواعد الواجهة اللي
// ليها أثر أمني/مالي، بالاستخراج من index.html نفسه (extractFn-style
// بفحص وجود البلوك الأول — درس الـregex المكسور).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(
  path.resolve(__dirname, '..', 'loyalty', 'index.html'), 'utf8');

// ١) 🔒 الصور data:image بس — رسالة فيها لينك خارجي متتعرضش كصورة
const imgGuard = html.indexOf("indexOf('data:image/') === 0");
assert(imgGuard > -1, '🔒 حارس مصدر الصور موجود');
// 🔴 نيجاتيف بالبنية: الحارس لازم يكون جوه chatRenderMsgs نفسها
const renderStart = html.indexOf('function chatRenderMsgs');
const renderEnd = html.indexOf('function chatTryOn');
assert(renderStart > -1 && renderEnd > renderStart, 'دالة العرض متلقية');
assert(imgGuard > renderStart && imgGuard < renderEnd,
  'والحارس جوه دالة العرض مش في تعليق بعيد');

// ٢) زرار جربيها مشروط بالعلم وبوجود الصورة (مش أي رسالة)
const trySlice = html.slice(renderStart, renderEnd);
assert(trySlice.indexOf('m.tryon && chatImgs[m.id]') > -1,
  'جربيها = علم tryon + صورة فعلًا — مش زرار يتيم يفتح فاضي');

// ٣) مستمع الرسايل بنافذة limit مش مفتوح (قاعدة تحسين القراءات)
const openStart = html.indexOf('function openChat');
const openSlice = html.slice(openStart, renderStart);
assert(openSlice.indexOf(".orderBy('atMs', 'desc').limit(80)") > -1,
  'مستمع الرسايل limit(80) بالأحدث');

// ٤) الإرسال بيعدي على chatValidate (الحظر والطول بيتفحصوا)
const sendStart = html.indexOf('function chatSend');
const sendSlice = html.slice(sendStart, html.indexOf('window.watchChatConv = ', sendStart));
assert(sendSlice.indexOf('chatValidate(') > -1, 'الإرسال محكوم بالمحرك');
assert(sendSlice.indexOf("unreadStaff: firebase.firestore.FieldValue.increment(1)") > -1,
  'عدّاد الموظفين بيزيد ذرّيًا مش قراءة-كتابة');

// ٥) الخروج بينضف مستمعي الشات (عميلة تانية على نفس الجهاز)
const logoutStart = html.indexOf('function logout');
const logoutSlice = html.slice(logoutStart, logoutStart + 900);
assert(logoutSlice.indexOf('chatCleanup()') > -1,
  '🔒 الخروج بيقفل الشات — سرية المحادثات على الجهاز المشترك');

// ٦) §18 — التعريض على window موجود لكل دوال الـonclick
['openChat','closeChat','chatSend','chatTryOn'].forEach(function(fn){
  assert(html.indexOf('window.' + fn + ' = ' + fn) > -1,
    '§18: ' + fn + ' متعرّضة على window');
});

// ============================================================
// ٧) 🖤 glow — نفس الشاشة بفروق البراند الثلاثة
// ============================================================
(function(){
  const g = fs.readFileSync(path.resolve(__dirname, '..', 'glow', 'index.html'), 'utf8');

  // ١) العزل: محادثات glow على مستند 'g'+phone — مش بتخبط في echarpe
  assert(g.indexOf("var CHAT_DOC_PREFIX = 'g'") > -1, 'بادئة مستند Glow موجودة');
  assert(g.indexOf('db.collection(COL_CHAT).doc(CHAT_DOC_PREFIX + phone)') > -1,
    'وكل الوصول للمحادثة بيها');
  // 🔴 نيجاتيف: من غير البادئة، عميلة بنفس الرقم في البراندين = محادثة
  //    واحدة مخلوطة وفرع متضارب (نفس درس فصل الباركود §8)
  assert(g.indexOf("db.collection(COL_CHAT).doc(phone)") === -1,
    '🔴 مفيش وصول بالرقم من غير البادئة');

  // ٢) البراند متعلّم للموظفين + الفرع ثابت
  assert(g.indexOf("brand: 'glow'") > -1, 'المحادثة متعلّمة glow');
  assert(g.indexOf("Promise.resolve('Glow')") > -1, 'والفرع ثابت Glow من غير استعلام');

  // ٣) نفس حراس loyalty
  assert(g.indexOf("indexOf('data:image/') === 0") > -1, 'حارس الصور موجود في glow');
  assert(g.indexOf('chatCleanup()') > -1, 'وتنضيف الخروج موجود');
})();

// ============================================================
// ٨) 🖥️ شاشة الموظفين المشتركة (POS + Office)
// ============================================================
(function(){
  const ui = fs.readFileSync(path.resolve(__dirname, '..', 'pos', 'chat-staff-ui.js'), 'utf8');

  /* ⚠️ الاستعلام اتنقل جوه طبقة `CDB` عشان الملف يشتغل في تطبيق
     الحضور كمان (modular). فالفحص بقى على **المسارين**:
       · compat  → جوه CDB في نفس الملف
       · modular → `fsChatApi` في sales-app.js
     🔴 والاتنين لازم يبقوا **نفس الحدود بالظبط**: نافذة ٣٠ يوم و٦٠
        محادثة. مستمع مفتوح للأبد = فاتورة Firestore بتكبر لوحدها،
        وحدود مختلفة = الشات بيوري محادثات مختلفة حسب التطبيق. */
  assert(ui.indexOf("Date.now() - 30 * 86400000") > -1,
    'نافذة ٣٠ يوم للمحادثات (مش مفتوح للأبد)');
  assert(ui.indexOf(".where('lastAt', '>', sinceMs)") > -1
      && ui.indexOf(".orderBy('lastAt', 'desc').limit(60)") > -1,
    'مستمع المحادثات بنافذة ٣٠ يوم × ٦٠ — مسار compat');
  const bridge = fs.readFileSync(path.resolve(__dirname, '..', 'sales', 'sales-app.js'), 'utf8');
  const br = bridge.slice(bridge.indexOf('window.fsChatApi = {'),
                          bridge.indexOf('window.fsChatApi = {') + 2200);
  assert(/where\('lastAt', '>', sinceMs\)/.test(br) && /limit\(60\)/.test(br),
    '⭐⭐ ونفس الحدود بالظبط في مسار modular (فاتورة Firestore)');
  assert(/limit\(80\)/.test(br), 'وسقف ٨٠ رسالة في المسارين');
  // ⚠️ الفحص على الكود بعد شيل التعليقات — تعليق بيشرح المنع كان
  //    بيقع في فخ الفحص النصي (الدرس المتسجل عن الأسيرشن السايب)
  const uiCode = ui.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert(uiCode.indexOf("prompt(") === -1 && uiCode.indexOf("confirm(") === -1,
    '§10: مفيش prompt ولا confirm في الكود الفعلي — Electron');
  assert(ui.indexOf('unreadCust: firebase.firestore.FieldValue.increment(1)') > -1,
    'رد الموظفة بيزود عدّاد العميلة ذرّيًا (compat)');
  assert(/unreadCust: increment\(1\)/.test(br),
    '⭐ وذرّيًا في modular كمان (مش قراءة ثم كتابة)');
  assert(ui.indexOf("indexOf('data:image/') === 0") > -1, 'حارس الصور في العرض');
  assert(ui.indexOf('data.length > maxBytes') > -1 && ui.indexOf('ccCompressImage(f, 900, 650000') > -1,
    'سقف حجم الصورة تحت 1MB بتاع Firestore (دالة ضغط مشتركة بعد v320 — نفس الحدود)');
  assert(ui.indexOf('chatWaitLevel(c, now)') > -1, 'ألوان الانتظار من المحرك المتختبر');
  // الحظر بضغطتين مش ضغطة — ضغطة واحدة بالغلط متحظرش عميلة
  assert(ui.indexOf('CST.blockArm > 4000') > -1 || ui.indexOf('Date.now() - CST.blockArm > 4000') > -1,
    '⛔ الحظر مسلّح بضغطتين');
  // POS بيبعت باسم الموظفة وOffice بالإدارة
  assert(ui.indexOf("'الإدارة'") > -1 && ui.indexOf('currentEmployee && currentEmployee.name') > -1,
    'هوية المرسل حسب البيئة');
})();

// ============================================================
// ٩) 🔌 التوصيلات — السطور اللي من غيرها كله شكل وميشتغلش
// ============================================================
(function(){
  const pos = fs.readFileSync(path.resolve(__dirname, '..', 'pos', 'index.html'), 'utf8');
  assert(pos.indexOf('<script src="chat-staff-ui.js"></script>') > -1,
    'POS بيحمّل الشاشة (درس frames.js — ملف موجود ومش محمّل = ميزة ميتة)');
  const off = fs.readFileSync(path.resolve(__dirname, '..', 'Office', 'index.html'), 'utf8');
  assert(off.indexOf('<script src="../pos/chat-core.js"></script>') > -1
      && off.indexOf('<script src="../pos/chat-staff-ui.js"></script>') > -1,
    'Office بيحمّل المحرك والشاشة من مصدرهم الواحد');
})();

// ============================================================
// ١٠) 📷 رفع صورة العميلة — في التطبيقين
// ============================================================
(function(){
  ['loyalty', 'glow'].forEach(function(app){
    const h = fs.readFileSync(path.resolve(__dirname, '..', app, 'index.html'), 'utf8');

    assert(h.indexOf('function chatPickImg') > -1
        && h.indexOf("id=\"chFile\" accept=\"image/*\"") > -1,
      app + ': زرار وإدخال الصورة موجودين');
    assert(h.indexOf('data.length > 650000') > -1,
      app + ': سقف الحجم تحت 1MB بتاع Firestore');
    // 🚫 صورة من غير نص لسه بتعدي على المحرك — العميلة المحظورة
    //    مش بتبعت صور. 🔴 نيجاتيف: لو الإرسال بالصورة عدّى من غير
    //    chatValidate كانت الصورة بقت باب جانبي حوالين الحظر.
    const sendStart = h.indexOf('function chatSend');
    const sendSlice = h.slice(sendStart, h.indexOf('window.watchChatConv = ', sendStart));
    assert(sendSlice.indexOf("chatValidate('📷', chatConv)") > -1,
      app + ': 🔒 الصورة-بس بتتفحص ضد الحظر برضه');
    assert(sendSlice.indexOf('if(chatImgData) custMsg.img = chatImgData;') > -1,
      app + ': والصورة بتتبعت مع الرسالة');
    assert(sendSlice.indexOf("(v.text || '📷 صورة')") > -1,
      app + ': وقايمة الموظفين بتشوف "📷 صورة" مش سطر فاضي');
  });
})();
