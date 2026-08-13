// ============================================================
// ☁️ test-gift-functions — دوال السيرفر (كروت الهدايا والرصيد)
//
// 🔑 الدوال دي هي **الوحيدة** اللي بتلمس فلوس العميلة. التطبيقات
//    ممنوعة من الكتابة بقواعد الأمان. فأي ثغرة هنا = طبع عملة.
//
// ⚠️ الاختبار ده بيفحص **الشكل والحراس** مش التنفيذ الحي (محتاج
//    محاكي Firestore). فبنركّز على اللي لو اتشال بصمت يفتح باب:
//    المعاملات · مفاتيح التكرار · الصلاحيات · التهشيم.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const P = path.join(ROOT, 'functions', 'giftCredit.js');
assert(fs.existsSync(P), 'ملف الدوال موجود في الريبو');
const src = fs.readFileSync(P, 'utf8');

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
// ١) 🔐 الكود بيتخزّن **مهشّم** مش صريح
//    الكود هو الفلوس — نسخة احتياطية مسرّبة أو تصدير بالغلط
//    بيبقى فلوس ماشية في الشارع.
// ============================================================
(function(){
  assert(/createHmac\('sha256'/.test(src), '🔐 التهشيم بـHMAC-SHA256');
  assert(/codeHash: hashCode\(code, salt\)/.test(src),
    '⭐⭐ المخزّن هو البصمة مش الكود');
  assert(!/\bcode: code,\s*\n\s*value/.test(src),
    '⛔ ومفيش حقل بيخزّن الكود صريح على الكارت');
  assert(/GIFT_CARD_SALT/.test(src),
    '⭐ والملح من Secret Manager — من غيره جدول قوس قزح بيفك أي كود');
  assert(/failed-precondition[\s\S]{0,80}GIFT_CARD_SALT|GIFT_CARD_SALT[\s\S]{0,120}HttpsError/.test(src),
    '⭐ والدالة بتقف لو الملح مش متظبّط (مش بتشتغل بملح فاضي)');

  // 🧪 سلوك التهشيم نفسه
  const h = (c, s) => crypto.createHmac('sha256', s).update(String(c).toUpperCase()).digest('hex');
  assertEq(h('ABC', 'salt'), h('abc', 'salt'), 'الحروف الصغيرة والكبيرة بنفس البصمة');
  assert(h('ABC', 'x') !== h('ABC', 'y'), '⭐ وملح مختلف = بصمة مختلفة');
  assert(h('ABC', 's') !== h('ABD', 's'), 'وكود مختلف = بصمة مختلفة');
})();

// ============================================================
// ٢) 🎲 العشوائية القوية — مش Math.random
// ============================================================
(function(){
  assert(/crypto\.randomInt/.test(src),
    '⭐⭐ crypto.randomInt مش Math.random — ده كود بيحمي فلوس');
  // ⚠️ لازم نشيل التعليقات الأول — §0: الفحص وقع هنا بالظبط لأن
  //    كلمة Math.random مكتوبة في **تعليق** بيحذّر منها. الاختبار
  //    شافها وقال "الباج موجود" وهو مش موجود.
  //    (ولو كانت العكس — تعليق بيقول "بنستخدم randomInt" والكود
  //     بيستخدم Math.random — الاختبار كان هيعدّي وهو غلط. وده أخطر.)
  const noComments = src
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, ' ')
    .replace(/^[ \t]*\/\/[^\n]*/gm, ' ')
    .replace(/([^:'"\\])\/\/[^\n]*$/gm, '$1 ');
  assert(!/Math\.random/.test(noComments),
    '⛔ ومفيش أي Math.random في الكود الفعلي (التعليقات متشالة)');
  assert(/Math\.random/.test(src),
    '📝 (والتحذير منها لسه مكتوب في التعليقات — ده مقصود)');
  assert(/const GC_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'/.test(src),
    'والأبجدية من غير الحروف المتشابهة');
})();

// ============================================================
// ٣) 🔒 ⭐⭐ الكارت بيتولد **مقفول**
//    أهم حارس: مفيش كارت شغّال قبل ما الفلوس تدخل الدرج.
//    لو الفاتورة اتلغت، الكارت يفضل مقفول للأبد.
// ============================================================
(function(){
  const f = extractFn(src, 'exports.giftCardIssue');
  assert(!!f, 'لقينا giftCardIssue');
  if(!f) return;
  assert(/status: 'pending'/.test(f),
    '⭐⭐ الكارت بيتولد pending — مش شغّال');
  assert(!/status: 'active'/.test(f),
    '⛔ ومفيش أي مسار بيولّده شغّال على طول');

  const a = extractFn(src, 'exports.giftCardActivate');
  assert(!!a && /status !== 'pending'/.test(a),
    '⭐ والتفعيل بيرفض أي حالة غير pending');
  assert(!!a && /paidInvoice/.test(a),
    '⭐⭐ والتفعيل مربوط بفاتورة مدفوعة — مش زرار حر');

  // 🔴 نيجاتيف
  const broken = f.replace(/status: 'pending'/, "status: 'active'");
  assert(/status: 'active'/.test(broken),
    '🔴 نيجاتيف — لو اتولد active، أي كاشير يطلّع كارت من غير ما يقبض');
})();

// ============================================================
// ٤) ⚛️ المعاملات الذرّية — الحماية من السباق
//    من غيرها: نفس الرصيد يتصرف في فرعين في نفس اللحظة والاتنين ينجحوا.
// ============================================================
(function(){
  ['giftCardIssue', 'giftCardActivate', 'giftCardClaim', 'creditAdjust', 'creditSpend']
  .forEach(function(n){
    const f = extractFn(src, 'exports.' + n);
    assert(!!f, 'لقينا ' + n);
    if(f) assert(/runTransaction/.test(f),
      '⚛️ ' + n + ' جوّه معاملة ذرّية');
  });
  // ⭐ القراءة جوّه المعاملة مش بره — القراءة بره بتلغي الحماية
  const spend = extractFn(src, 'exports.creditSpend');
  assert(!!spend && /await tx\.get\(iref\)/.test(spend),
    '⭐⭐ وفحص التكرار بـtx.get جوّه المعاملة (بره = سباق حقيقي)');
  const post = extractFn(src, 'async function postCredit(');
  assert(!!post && /await tx\.get\(cref\)/.test(post),
    '⭐⭐ وقراءة الرصيد كمان جوّه المعاملة');
})();

// ============================================================
// ٥) 🔁 مفاتيح التكرار — الشبكة قطعت والكاشير دوس تاني
// ============================================================
(function(){
  ['giftCardIssue', 'creditAdjust', 'creditSpend'].forEach(function(n){
    const f = extractFn(src, 'exports.' + n);
    if(!f) return;
    assert(/مفتاح التكرار ناقص/.test(f), '🔁 ' + n + ' بترفض من غير مفتاح تكرار');
    assert(/prev\.exists/.test(f), 'و' + n + ' بترجّع نفس النتيجة لو اتكررت');
  });
  assert(/expireAt: admin\.firestore\.Timestamp\.fromMillis/.test(src),
    '🧹 ومفاتيح التكرار ليها تاريخ انتهاء (مش بتتراكم للأبد)');
})();

// ============================================================
// ٦) 👮 الصلاحيات من **التوكن** مش من كلام التطبيق
// ============================================================
(function(){
  const f = extractFn(src, 'async function requireStaff(');
  assert(!!f, 'لقينا requireStaff');
  if(!f) return;
  assert(/context\.auth\.token/.test(f),
    '⭐⭐ الدور من التوكن — التطبيق مبيقولش عن نفسه إنه مالك');
  assert(/context\.auth && context\.auth\.uid/.test(f), 'ولازم يكون مسجّل دخول');

  // 🔴 تصحيح: أول نسخة كانت بتدوّر على `token.owner` — والمشروع
  //    مفيهوش custom claims خالص، فكل نداء كان هيترفض والميزة
  //    مكانتش هتشتغل مع حد. الاختبار ده بيمنع رجوع الافتراض ده.
  assert(!/t\.owner === true|token\.owner === true/.test(src),
    '⭐⭐ مفيش اعتماد على custom claims (المشروع مفهوش)');
  assert(/process\.env\.OWNER_EMAIL/.test(f),
    '⭐ المالك بيتحدد بإيميله من متغير بيئة');
  assert(/OWNER_EMAIL مش متظبّط/.test(f),
    '⭐⭐ والدالة بتقف لو مش متظبّط — مش بتفترض إن مفيش مالك يعني الكل مالك');

  // 🚫 الدخول المجهول مش موظف — من غير الشرط ده أي عميلة تبقى كاشير
  assert(/sign_in_provider === 'anonymous'/.test(f),
    '🚫 ⭐⭐ الدخول المجهول مرفوض صراحة (تطبيق العميلة مش كاشير)');
  assert(/if\(!email/.test(f), 'ولازم إيميل');

  // 👥 قايمة الموظفين مفتاح الفلوس
  const sa = extractFn(src, 'exports.staffAccessSet');
  assert(!!sa, 'لقينا staffAccessSet');
  if(sa) assert(/requireStaff\(context, 'owner'\)/.test(sa),
    '👥 ⭐⭐ وقايمة الموظفين المالك بس اللي بيعدّلها');
  assert(!/data\.role|data\.isOwner/.test(src),
    '⛔ ومفيش أي مكان بياخد الدور من البيانات المرسلة');

  // 💵 "سيب الباقي" استثناء مقصود — الفلوس دخلت الدرج فعلًا
  const adj = extractFn(src, 'exports.creditAdjust');
  assert(!!adj && /isChange/.test(adj),
    '💵 "سيب الباقي في الحساب" ليها مسار مباشر (الفلوس دخلت فعلًا)');
  assert(!!adj && /data\.invoiceCode/.test(adj),
    '⭐ ومربوطة بفاتورة — مش أي مبلغ');
  assert(!!adj && /credit_requests/.test(adj),
    '⭐⭐ وأي إضافة تانية من كاشير بتروح لطابور موافقة المالك');
})();

// ============================================================
// ٧) 🛡️ حراس الفلوس
// ============================================================
(function(){
  const post = extractFn(src, 'async function postCredit(');
  assert(!!post && /if\(after < 0\)/.test(post),
    '🛡️ ⭐⭐ الرصيد عمره ما ينزل تحت الصفر');

  const spend = extractFn(src, 'exports.creditSpend');
  assert(!!spend && /amount > invoiceTotal/.test(spend),
    '🛡️ ⭐⭐ والصرف مينفعش يزيد عن الفاتورة (وإلا مرتجع يطلّع كاش)');
  assert(!!spend && /invoiceTotal > 0/.test(spend),
    'وفاتورة صفر أو سالبة مبتصرفش');

  const issue = extractFn(src, 'exports.giftCardIssue');
  assert(!!issue && /maxValue/.test(issue), '🛡️ وفيه سقف لقيمة الكارت');

  const claim = extractFn(src, 'exports.giftCardClaim');
  assert(!!claim && /credit_guard/.test(claim),
    '🛡️ ⭐⭐ وحارس محاولات على الاستلام — التخمين = سرقة فلوس');
  assert(!!claim && /status === 'claimed'/.test(claim),
    '💀 والكود بيموت بعد الاستلام');
  assert(!!claim && /remaining: 0/.test(claim), 'ورصيده بيتصفّر');
  assert(!!claim && /expiresAt/.test(claim), '⏳ والانتهاء بيتشاف');
})();

// ============================================================
// ٨) 📒 دفتر مش رقم
//    رقم واحد ممكن يتكتب فوقه؛ دفتر بيسيب أثر يتراجع.
// ============================================================
(function(){
  const post = extractFn(src, 'async function postCredit(');
  assert(!!post, 'لقينا postCredit');
  if(!post) return;
  assert(/collection\(LEDGER\)\.doc\(\)/.test(post),
    '📒 كل حركة بتتكتب سطر جديد في الدفتر');
  assert(/balanceAfter: after/.test(post),
    '⭐ ومعاها الرصيد بعدها (يخلّي المراجعة ممكنة)');
  assert(/الدفتر هو الحقيقة/.test(post),
    '⭐⭐ والرصيد المخزّن نسخة سريعة للعرض بس');
  // ⭐ كل حركة معاها مين عملها
  assert(/by: who\.uid/.test(src), 'وكل حركة معاها مين عملها');
})();

// ============================================================
// ٩) 🔐 قواعد الأمان — الحتة اللي بتقفل الأبواب التانية
//    الدوال آمنة، بس من غير القواعد التطبيق لسه يقدر يكتب
//    الرصيد مباشرة ويتخطى الدوال كلها.
// ============================================================
(function(){
  const RP = path.join(ROOT, 'security', 'gift-credit.rules');
  assert(fs.existsSync(RP), 'ملف القواعد موجود في الريبو');
  if(!fs.existsSync(RP)) return;
  const r = fs.readFileSync(RP, 'utf8');

  // ⭐⭐ حقل الرصيد مقفول على العميل — مع إن باقي المستند مفتوح
  assert(/affectedKeys\(\)[\s\S]{0,60}hasAny\(\['credit', 'creditAt'\]\)/.test(r),
    '⭐⭐ التعديل بيترفض لو حقل الرصيد اتغيّر (وباقي المستند شغّال عادي)');
  assert(/allow create: if isStaff\(\)[\s\S]{0,120}hasAny\(\['credit'/.test(r),
    '⭐ والإنشاء كمان مبيقبلش رصيد ابتدائي');

  // 🔒 الكروت والدفتر مقفولين تمامًا
  assert(/match \/gift_cards\/\{cardId\} \{[\s\S]{0,140}allow read, write: if false/.test(r),
    '🔒 مجموعة الكروت مقفولة حتى على الموظفين (فيها البصمة)');
  assert(/credit_ledger[\s\S]{0,300}allow create, update, delete: if false/.test(r),
    '📒 ⭐⭐ الدفتر append-only — مفيش تعديل ولا مسح ولا حتى للمالك');
  assert(/credit_idem[\s\S]{0,60}if false/.test(r),
    '🔁 ومفاتيح التكرار مقفولة (وإلا العملية تتعاد)');
  assert(/credit_guard[\s\S]{0,60}if false/.test(r),
    '🛡️ وحارس المحاولات مقفول (وإلا التخمين بلا حدود)');

  // ⚠️ ترتيب النشر — الدوال قبل القواعد
  assert(/الدوال منشورة \*\*قبل\*\* القواعد/.test(r),
    '📋 وترتيب النشر موثّق (الدوال الأول وإلا الكتابة تترفض من غير بديل)');
  assert(/الملح ده \*\*مايتغيّرش أبدًا\*\*/.test(r),
    '⚠️ والتحذير من تغيير الملح موثّق (تغييره = كل الكروت القديمة تضيع)');
})();
