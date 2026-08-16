// ============================================================
// 🧪 test-site-chat.js — شات الموقع الرئيسي (زائر/ضيف)
// ------------------------------------------------------------
// كل فحص سلبي: لو رجّعت الإصلاح لازم يقع.
//   ١) الإيقونة العائمة فوق يسار + عناصر الشيت موجودة
//   ٢) 🔴 نفس سكيمة الشات اللي POS شايفها بالظبط — customer_chat/<phone>
//      (مفيش كوليكشن جديد، وإلا الموظفة ما تشوفش الرسايل)
//   ٣) نفس شكل مستند الرسالة والمحادثة اللي التطبيق بيكتبه
//      (from/atMs/at/expireAt · unreadStaff increment)
//   ٤) بيستخدم محرك الشات المشترك (chat-core.js) مش منطق مخترع
//   ٥) بوابة الاسم/التليفون: تتحقق، وبتتخزن في localStorage
//      (متسألش تاني في نفس الجهاز)
//   ٦) تكامل التجربة: نفس مفاتيح sessionStorage اللي photo.html بيقراها،
//      وبيفتح brand=site
//   ٧) تعقيم: كل بيانات الرسايل بتتعقّم قبل الطباعة
//   ٨) مفيش SW على الموقع الرئيسي (مالوش واحد أصلًا)
//   ٩) الفحص النحوي الفعلي لكل بلوكات <script>
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const P = path.join(ROOT, 'index.html');

if (!fs.existsSync(P)) {
  assert(false, 'index.html لازم يكون موجود');
} else {

const H = fs.readFileSync(P, 'utf8');

// ---------- ١) البنية ----------
assert(H.indexOf('id="cwLauncher"') >= 0, 'إيقونة الشات العائمة موجودة');
assert(/\.cw-launcher\{[\s\S]*?position:fixed;\s*top:18px;\s*left:18px;/.test(H),
  '🔴 الإيقونة فوق يسار الشاشة بالظبط زي ما اتطلب');
assert(H.indexOf('id="cwPanel"') >= 0, 'شيت الشات موجود');
assert(H.indexOf('id="cwGate"') >= 0, 'بوابة الاسم/التليفون موجودة');
assert(H.indexOf('id="cwInputbar"') >= 0, 'شريط الكتابة موجود');
assert(/animation:cwFloat|animation:cwPulse/.test(H), 'فيه أنيميشن على الإيقونة (مش ثابتة)');
assert(/prefers-reduced-motion:reduce\)\{\.cw-launcher/.test(H), 'الأنيميشن بتحترم تفضيل تقليل الحركة');

// ---------- ٢) نفس سكيمة الشات اللي POS شايفها ----------
assert(/var COL_CHAT = 'customer_chat';/.test(H), '🔴 نفس كوليكشن الشات بالظبط (customer_chat) — مفيش سكيمة جديدة');
assert(H.indexOf(".doc(cwPhone).collection('messages')") >= 0, 'الرسايل جوه customer_chat/<phone>/messages زي التطبيق بالظبط');

// ---------- ٣) شكل المستند ----------
const sendFn = (H.match(/function cwSend\(\)\{[\s\S]*?\n  \}/) || [''])[0];
assert(/from:\s*'cust'/.test(sendFn), 'رسالة العميلة from:cust');
assert(/atMs:\s*ts/.test(sendFn) && /at:\s*firebase\.firestore\.FieldValue\.serverTimestamp\(\)/.test(sendFn),
  'نفس حقول الطابع الزمني اللي POS بيقراها');
assert(/unreadStaff:\s*firebase\.firestore\.FieldValue\.increment\(1\)/.test(sendFn),
  '🔴 unreadStaff بيتزود — من غيره الموظفة ما تاخدش تنبيه برسالة جديدة');
assert(/source:\s*'web'/.test(sendFn), "مصدر المحادثة web (زي أوردرات الموقع بالظبط)");

// ---------- ٤) محرك الشات المشترك ----------
assert(H.indexOf('src="pos/chat-core.js"') >= 0, 'محرك الشات المشترك متحمّل (مش منطق مخترع من الصفر)');
assert(/window\.chatValidate/.test(sendFn), 'بيستخدم chatValidate المشتركة');
assert(/window\.chatExpireAt/.test(sendFn), 'بيستخدم chatExpireAt المشتركة');
assert(/window\.chatAutoReply/.test(sendFn), 'بيستخدم chatAutoReply المشتركة (نفس ساعات العمل)');

// ---------- ٥) بوابة الاسم/التليفون ----------
const gateFn = (H.match(/function cwGateSubmit\(\)\{[\s\S]*?\n  \}/) || [''])[0];
assert(/01\[0-9\]\{9\}/.test(gateFn), 'التليفون بيتحقق بصيغة مصرية (01 + 9 أرقام)');
assert(/n\.length < 2/.test(gateFn), 'الاسم بيتحقق (مش فاضي/حرف واحد)');
assert(gateFn.indexOf('localStorage.setItem(LS_NAME') >= 0 && gateFn.indexOf('localStorage.setItem(LS_PHONE') >= 0,
  '🔴 الهوية بتتخزن في localStorage — العميلة متتسألش تاني في نفس الجهاز');
assert(/localStorage\.getItem\(LS_PHONE\)/.test(H), 'بيقرا الهوية المحفوظة عند فتح الشات');

// ---------- ٦) تكامل التجربة ----------
const tryFn = (H.match(/function cwTryOn\(id\)\{[\s\S]*?\n  \}/) || [''])[0];
assert(tryFn.indexOf("sessionStorage.setItem('echarpe_tryon_img'") >= 0, 'نفس مفتاح صورة المنتج اللي photo.html بيقراه');
assert(tryFn.indexOf("sessionStorage.setItem('echarpe_tryon_phone'") >= 0, 'التليفون بيتبعت للسقف اليومي');
assert(/photo\.html\?brand=site/.test(tryFn), "🔴 بيفتح brand=site (مش loyalty الافتراضي)");
assert(/if\(bc\) sessionStorage\.setItem\('echarpe_tryon_pid', bc\);/.test(tryFn), 'الباركود بيترفق لو موجود');
assert(tryFn.indexOf('removeItem') >= 0, 'بيمسح الباركود القديم لو الرسالة الجديدة من غيره (منع تسرّب)');

// photo-core.js: البراند الجديد + مسار الرجوع
const PC_PATH = path.join(ROOT, 'tryon', 'photo-core.js');
const PC = require(PC_PATH);
assert(PC.BRANDS.indexOf('site') >= 0, "photo-core: 'site' براند صحيح");
assertEq(PC.appName('site'), 'site', "appName بيرجّع site مش يحوّلها لـloyalty");
assertEq(PC.backPath('site'), '../', "🔴 مسار رجوع الموقع '../' (مفيش /site/ فرعي فعليًا)");
assertEq(PC.backPath('loyalty'), '../loyalty/', 'مسار رجوع loyalty زي ما هو');

// photo.html: زرار التحميل موجود ومربوط
const PH = fs.readFileSync(path.join(ROOT, 'tryon', 'photo.html'), 'utf8');
assert(PH.indexOf('id="dlBtn"') >= 0 && PH.indexOf('download=') >= 0, 'زرار تحميل نتيجة التجربة موجود');
assert(/\$\("dlBtn"\)\.href = imageDataUrl;/.test(PH), 'رابط التحميل بيتربط بنفس صورة النتيجة');

// ---------- ٧) تعقيم ----------
const renderFn = (H.match(/function cwRenderMsgs\(arr\)\{[\s\S]*?\n  \}/) || [''])[0];
assert(/esc\(m\.text\)/.test(renderFn), 'نص الرسالة بيتعقّم');
assert(/esc\(m\.img\)/.test(renderFn), 'رابط الصورة بيتعقّم قبل الحقن في src');
assert(/esc\(m\.id\)/.test(renderFn), 'الـid بيتعقّم في الزرار');

// ---------- ٨) مفيش SW على الموقع الرئيسي ----------
assert(H.indexOf('serviceWorker') === -1, '🔴 مفيش تسجيل service worker (الموقع الرئيسي مالوش واحد أصلًا)');

// ---------- ٩) الفحص النحوي الفعلي ----------
const blocks = [...H.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
assert(blocks.length >= 3, 'فيه بلوكات <script> inline (الإعدادات + المتجر + الشات)');
const tmp = path.join(require('os').tmpdir(), 'site_chat_chk.js');
blocks.forEach((b, i) => {
  fs.writeFileSync(tmp, b);
  try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
  catch (e) { assert(false, `بلوك <script> رقم ${i} فيه خطأ نحوي: ` + e.stderr.toString().split('\n')[0]); }
});

}
