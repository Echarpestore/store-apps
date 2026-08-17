// ============================================================
// 💬 test-chat — شات العميلة ↔ الفرع
//
// 🔴 أخطر حاجة في الشات مش تقنية — **الرسالة اللي محدش يرد عليها**.
//    شات متساب من غير رد أوحش من إنه مايبقاش موجود، لأن العميلة
//    بتحس إنها اتجاهلت. عشان كده نص الملف ده عن المواعيد والتنبيه.
//
// ⚠️ TZ متثبّت على القاهرة في run.js — المالك بيتابع من البرازيل،
//    ولو الحسبة بساعة الجهاز الرد الآلي هيشتغل في عز الشغل.
// ============================================================
'use strict';
const path = require('path');
const C = require(path.resolve(__dirname, '..', 'pos', 'chat-core.js'));

// القاهرة صيفًا = UTC+3
const at = (h, d) => Date.UTC(2026, 7, d || 13, h - 3, 0);

// ============================================================
// ١) 🕐 مواعيد المحل (١٠ لـ١٠)
// ============================================================
(function(){
  assert(C.chatIsOpen(at(10)) === true, '🕐 ١٠ الصبح مفتوح');
  assert(C.chatIsOpen(at(14)) === true, 'و٢ الضهر');
  assert(C.chatIsOpen(at(21)) === true, 'و٩ بالليل');
  assert(C.chatIsOpen(at(9))  === false, '⛔ و٩ الصبح قافل');
  assert(C.chatIsOpen(at(22)) === false, '⛔ و١٠ بالليل قافل (النهاية مش شاملة)');
  assert(C.chatIsOpen(at(3))  === false, 'و٣ الفجر قافل');

  // ⭐ المواعيد قابلة للتغيير
  assert(C.chatIsOpen(at(9), { open:8, close:23 }) === true,
    '⭐ والمواعيد بتتغير من الإعدادات');
})();

// ============================================================
// ٢) 🤖 الرد الآلي — مرة واحدة لكل فترة إغلاق
// ============================================================
(function(){
  const night = C.chatAutoReply({}, at(23));
  assert(!!night, '🤖 رسالة بالليل بتاخد رد آلي');
  // ⚠️ بنفحص **المعنى** مش كلمة حرفية — الصياغة نص تسويقي بيتغيّر
  //    (اتغيّر من "مقفولين دلوقتي" لصياغة أرقى بطلب المالك).
  assert(/بنرد|هنرد|سيبي رسالتك/.test(night), 'وبيوضّح إننا هنرد وإنها تسيب رسالتها');
  assert(/10/.test(night), 'وبيقول ميعاد الفتح');

  assertEq(C.chatAutoReply({}, at(14)), null,
    '⛔ ورسالة في المواعيد مبتاخدش رد آلي (الموظفة هترد)');

  // ⭐⭐ مرة واحدة بس
  assertEq(C.chatAutoReply({ autoReplyAt: at(23) }, at(23) + 30 * 60000), null,
    '⭐⭐ ٥ رسايل بالليل = رد آلي واحد (٥ ردود بتبان كإن النظام بيتريّق)');

  // وفترة إغلاق جديدة بتاخد رد جديد
  assert(!!C.chatAutoReply({ autoReplyAt: at(23) }, at(23, 15)),
    '⭐ وليلة تانية = رد جديد');
})();

// ============================================================
// ٣) ⏰ ⭐⭐ الانتظار بساعات الشغل بس
//
//    من غير الحسبة دي، كل رسالة بتيجي بالليل بتبان **حمرا** الصبح
//    والتنبيه بيفقد معناه — والموظفة بتبطّل تبص عليه.
// ============================================================
(function(){
  // رسالة ١١ بالليل · دلوقتي ٩ الصبح تاني يوم → المحل كان قافل
  const overnight = C.chatWaitLevel({ unreadStaff:1, lastAt: at(23) }, at(9, 14));
  assertEq(overnight.level, 'ok',
    '⭐⭐ رسالة بالليل مش متأخرة الصبح — المحل كان قافل');
  assertEq(overnight.mins, 0, 'وصفر دقايق شغل عدّت');

  // ساعتين في عز الشغل → متأخرة فعلًا
  const busy = C.chatWaitLevel({ unreadStaff:1, lastAt: at(12) }, at(14));
  assertEq(busy.level, 'late', '⏰ وساعتين في عز الشغل = متأخرة');
  assertEq(busy.mins, 120, 'و١٢٠ دقيقة شغل');

  const warn = C.chatWaitLevel({ unreadStaff:1, lastAt: at(12) }, at(12) + 30 * 60000);
  assertEq(warn.level, 'warn', '🟡 ونص ساعة = تنبيه');

  const fresh = C.chatWaitLevel({ unreadStaff:1, lastAt: at(12) }, at(12) + 5 * 60000);
  assertEq(fresh.level, 'ok', '🟢 و٥ دقايق لسه بدري');

  // 🔒 مفيش رسالة مستنية = مفيش تنبيه
  assertEq(C.chatWaitLevel({ unreadStaff:0, lastAt: at(8) }, at(14)).level, 'ok',
    '🔒 والمردود عليها مالهاش تنبيه');
  assertEq(C.chatWaitLevel(null, at(14)).level, 'ok', 'وقيم فاضية مبتكسرش');

  // ⭐ رسالة الصبح بدري بتتحسب من الفتح
  const early = C.chatWaitLevel({ unreadStaff:1, lastAt: at(7) }, at(11));
  assertEq(early.mins, 60,
    '⭐ رسالة ٧ الصبح والساعة ١١ = ساعة شغل واحدة (من ١٠ لـ١١)');
})();

// ============================================================
// ٤) 🏢 الفرع الافتراضي = آخر فرع اشترت منه
// ============================================================
(function(){
  const sales = [
    { customerPhone:'01000000001', branch:'الرحاب',  createdAtMs: 100 },
    { customerPhone:'01000000001', branch:'مدينتي',  createdAtMs: 300 },
    { customerPhone:'01000000001', branch:'الرحاب',  createdAtMs: 200 },
    { customerPhone:'01000000002', branch:'سيتي سنتر', createdAtMs: 999 }
  ];
  assertEq(C.chatDefaultBranch(sales, '01000000001'), 'مدينتي',
    '🏢 آخر فرع اشترت منه');
  assertEq(C.chatDefaultBranch(sales, '01000000002'), 'سيتي سنتر',
    'وعميلة تانية فرعها هي');

  // ⚠️ التخمين ممنوع
  assertEq(C.chatDefaultBranch(sales, '01099999999'), null,
    '⚠️⭐⭐ عميلة جديدة = null مش أول فرع في القايمة (وإلا رسالتها تروح لفرع مالوش علاقة)');
  assertEq(C.chatDefaultBranch([], '01000000001'), null, 'ومفيش مبيعات = null');
  assertEq(C.chatDefaultBranch(sales, ''), null, 'ومفيش رقم = null');
})();

// ============================================================
// ٥) ✅ فحص الرسالة والحظر
// ============================================================
(function(){
  assert(C.chatValidate('عندكم طرح بيضا؟').ok === true, '✅ رسالة عادية');
  assertEq(C.chatValidate('  مسافات  ').text, 'مسافات', 'والمسافات بتتشال');
  assert(C.chatValidate('').ok === false, '⛔ وفاضية مرفوضة');
  assert(C.chatValidate('   ').ok === false, 'ومسافات بس مرفوضة');
  assert(C.chatValidate('x'.repeat(600)).ok === false, '⛔ وطويلة قوي مرفوضة');

  // 🚫 الحظر — الموظفة معرّضة للأذى في شات مباشر
  assert(C.chatValidate('أهلا', { blocked: true }).ok === false,
    '🚫⭐⭐ والرقم المحظور مبيبعتش (الموظفة معرّضة للأذى في شات مباشر)');
  assert(C.chatValidate('أهلا', { blocked: false }).ok === true,
    'وغير المحظور بيبعت عادي');
})();

// ============================================================
// ٦) 🧹 التنضيف التلقائي
// ============================================================
(function(){
  const now = Date.now();
  const exp = C.chatExpireAt(now);
  assert(exp > now, '🧹 فيه تاريخ انتهاء');
  assertEq(Math.round((exp - now) / 86400000), C.CHAT_TTL_DAYS,
    'و' + C.CHAT_TTL_DAYS + ' يوم — الشات بيكبر بلا حدود والقراءات معاه');
})();

// ============================================================
// ٧) 🔌 التوصيل
// ============================================================
(function(){
  const fs = require('fs');
  const ROOT = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(ROOT, 'pos', 'index.html'), 'utf8');
  const core = fs.readFileSync(path.join(ROOT, 'pos', 'chat-core.js'), 'utf8');
  const rules = fs.readFileSync(path.join(ROOT, 'security', 'firestore-phase2.rules'), 'utf8');

  assert(/<script src="chat-core\.js"><\/script>/.test(html), '🔌 المحرك متحمّل في POS');

  // ⚠️ معزول عن مسار البيع — مفيش أي لمس للسلة أو الفاتورة
  assert(!/cart|invoice|payments/i.test(core.replace(/\/\*[\s\S]*?\*\//g, '')),
    '⚠️⭐⭐ المحرك مالوش أي علاقة بالسلة أو الفاتورة (معزول عن مسار البيع)');

  // 🕐 توقيت القاهرة إجباري
  assert(/Africa\/Cairo/.test(core),
    '🕐⭐⭐ الحسبة بتوقيت القاهرة — المالك بيتابع من البرازيل');
  assert(!/new Date\(\)\.getHours\(\)/.test(core.replace(/catch[\s\S]{0,120}/g, '')),
    '⛔ ومفيش اعتماد على ساعة الجهاز في المسار الأساسي');

  // 🔐 القواعد
  assert(/match \/customer_chat\/\{phone\}/.test(rules), '🔐 قواعد الشات موجودة');
  assert(/hasAny\(\['blocked'\]\)/.test(rules),
    '🚫⭐⭐ والعميلة مش قادرة تشيل الحظر عن نفسها');
  assert(/match \/request_attributions/.test(rules), '💰 وقواعد نسبة الموظفة');
  assert(/request_attributions[\s\S]{0,140}allow update, delete: if false/.test(rules),
    '🔒⭐ والنسبة سجل مراقَب مبيتعدّلش');
})();
