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
assert(/echarpe-office-v6/.test(sw), 'CACHE_NAME اترفع لـv6');
