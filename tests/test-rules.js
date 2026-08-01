// ============================================================
// 🔐 test-rules — محاكاة قواعد Firestore على العمليات الحقيقية
// ------------------------------------------------------------
// المشكلة اللي بيحلها: الرول ممكن يبقى "صح أمنيًا" ويكسر تطبيق —
// وده حصل فعلًا: تضييق قايمة `pos_test_sales` كان هيقتل تبويب
// «فواتيري» في الولاء وGlow، وتضييق `entries` كان هيقتل شاشة التقييم.
//
// الاختبار ده بيعمل حاجتين:
//   ١) بيقرا الرول ويحاكيه على **جدول العمليات الحقيقية** — كل عملية
//      بيعملها كل تطبيق، بنوع دخوله وحدّها. لو الرول اتضيّق بعدين،
//      الاختبار بيقع **باسم التطبيق اللي هيتكسر**.
//   ٢) بيمسح تطبيقات العملاء ويقع لو ظهر استعلام على مجموعة مش في
//      الجدول — يعني مفيش استعلام جديد يعدّي من غير ما يتفحص.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const rules = fs.readFileSync(path.join(ROOT, 'security', 'firestore-phase2.rules'), 'utf8');

// ---------- محاكي مبسّط للرول ----------
// بيستخرج بلوك كل مجموعة، وبيقيّم شروط allow على السياق المعطى.
function blockFor(col){
  const at = rules.indexOf('match /' + col + '/');
  if(at < 0) return null;
  // ⚠️ `match /entries/{id} {` فيه `}` جوه اسم المتغيّر — فالفحص على
  //    وجود `allow` في نفس السطر، مش على القوس.
  const line = rules.slice(at, rules.indexOf('\n', at));
  if(line.indexOf('allow') > 0) return line;
  return rules.slice(at, rules.indexOf('\n    }', at));
}
function allowsFor(block, op){
  // بيرجّع نص الشرط الخاص بالعملية دي (read بتغطي get و list)
  const out = [];
  const re = /allow ([a-z, ]+):\s*if([\s\S]*?);/g;
  let m;
  while((m = re.exec(block))){
    const ops = m[1].split(',').map(x=> x.trim());
    const cond = m[2].replace(/\/\/[^\n]*/g, ' ').replace(/\s+/g, ' ').trim();
    const covers = ops.indexOf(op) >= 0
      || (ops.indexOf('read') >= 0 && (op === 'get' || op === 'list'))
      || (ops.indexOf('write') >= 0 && (op === 'create' || op === 'update' || op === 'delete'));
    if(covers) out.push(cond);
  }
  return out;
}
// تقييم الشرط: بنتعامل مع الأشكال اللي فعلًا موجودة في الرول.
// ⚠️ ممنوع نشيل الأقواس بالجملة — `signedIn()` نفسها بتنتهي بقوس،
//    وشيله كان بيخلي كل شرط "غير مفهوم" وبالتالي مسموح (الاختبار كان
//    بينجح على رول سايب الباب مفتوح).
function evalTerm(t, ctx){
  t = t.trim();
  if(t.indexOf('isStaff()') >= 0)  return ctx.auth === 'staff';
  if(t.indexOf('signedIn()') >= 0) return !!ctx.auth;
  if(t.indexOf('settingsSecret(id)') >= 0){
    const neg = t.trim().charAt(0) === '!';
    return neg ? !ctx.secretDoc : !!ctx.secretDoc;
  }
  if(t.indexOf('request.query.limit') >= 0){
    const m = t.match(/limit <= (\d+)/);
    return !!m && ctx.limit != null && ctx.limit <= Number(m[1]);
  }
  if(t.indexOf('inviteOpen(') >= 0) return !!ctx.inviteOpen;
  if(t.indexOf("source == 'join'") >= 0) return ctx.source === 'join';
  // شروط شكل المستند (hasOnly · is int · == null) خارج نطاق الاختبار ده —
  // هو عن **الوصول** مش عن صحة الحقول
  return true;
}
function evalCond(cond, ctx){
  const c = cond.trim();
  if(c === 'false') return false;
  if(c === 'true')  return true;
  return c.split('||').some(function(part){
    return part.split('&&').every(function(t){ return evalTerm(t, ctx); });
  });
}
function can(col, op, ctx){
  const b = blockFor(col);
  if(!b) return false;                       // مش مذكورة = القاعدة الأخيرة ترفض
  const conds = allowsFor(b, op);
  if(!conds.length) return false;
  return conds.some(function(c){ return evalCond(c, ctx || {}); });
}

const ANON  = { auth:'anon' };
const STAFF = { auth:'staff' };
const OUT   = { auth:null };

// ============================================================
// ١) العمليات الحقيقية — مستخرجة من كود التطبيقات نفسه
//    (السطور مكتوبة عشان لو حد شك يرجع يشوفها)
// ============================================================
const OPS = [
  // ---- شاشة التقييم (دخول مجهول) ----
  ['شاشة التقييم', 'entries', 'create', ANON, true,  'feedback/index.html:694 — بتسجّل التقييم'],
  ['شاشة التقييم', 'entries', 'list',   ANON, true,  'feedback/index.html:657 — بتسمع لايف where(ts>=)'],
  ['شاشة التقييم', 'sales_employees',   'list', ANON, true, 'feedback/index.html:515'],
  ['شاشة التقييم', 'sales_branch_list', 'list', ANON, true, 'feedback/index.html:519'],
  ['شاشة التقييم', 'sales_settings',    'list', ANON, true, 'feedback/index.html:523'],
  ['شاشة التقييم', 'feedback_alerts',   'create', ANON, true, 'feedback/index.html:699'],
  ['شاشة التقييم', 'feedback_alerts',   'list',   ANON, true, 'feedback/index.html:731'],
  ['شاشة التقييم', 'feedback_branches', 'read',   ANON, true, 'feedback/index.html:503 — أسماء الفروع'],
  ['شاشة التقييم', 'feedback_branches', 'create', ANON, true, 'بتضيف فرع جديد أول مرة'],

  // ---- تطبيق الولاء وGlow (دخول مجهول) ----
  ['تطبيق الولاء', 'pos_test_customers', 'get',    ANON, true, 'loyalty/index.html:779 — بيفتح برقم العميل'],
  ['تطبيق الولاء', 'pos_test_customers', 'update', ANON, true, 'loyalty/index.html:833 — بيحدّث بياناته'],
  ['تطبيق الولاء', 'pos_test_customers', 'create', ANON, true, 'loyalty/index.html:831 — تسجيل عميل جديد'],
  ['تطبيق الولاء', 'pos_test_customers', 'list',   { auth:'anon', limit:1 }, true,
    'loyalty/index.html:1044 · glow:1064 — الدخول بكود العضوية limit(1)'],
  ['تطبيق الولاء', 'pos_test_sales',      'list',  { auth:'anon', limit:100 }, true,
    'loyalty/index.html:891 · glow:907 — تبويب «فواتيري»'],
  ['تطبيق الولاء', 'pos_test_discounts',  'list',  { auth:'anon', limit:60 }, true, 'loyalty/index.html:889'],
  ['تطبيق الولاء', 'pos_test_inventory',  'list',  { auth:'anon', limit:60 }, true, 'loyalty/index.html:890'],
  ['تطبيق الولاء', 'pos_test_settings',   'get',   ANON, true, 'loyalty/index.html:691 — إعدادات الولاء'],
  ['تطبيق الولاء', 'pos_test_settings',   'update',{ auth:'anon' }, true, 'glow/index.html:1274 — offer_stats'],

  // ---- استمارة التوظيف (دخول مجهول + دعوة) ----
  ['استمارة التوظيف', 'staff_invites', 'get',    ANON, true, 'بتقرا كود دعوتها'],
  ['استمارة التوظيف', 'sales_registrations', 'create',
    { auth:'anon', source:'join', inviteOpen:true }, true, 'بدعوة مفتوحة'],
  ['استمارة التوظيف', 'staff_docs', 'create',
    { auth:'anon', inviteOpen:true }, true, 'رفع المستندات بدعوة مفتوحة'],
  ['استمارة التوظيف', 'staff_invites', 'update', ANON, true, 'قفل الدعوة بعد الإرسال'],

  // ---- POS و sales و Office (دخول بإيميل وباسورد) ----
  ['POS',    'pos_test_sales',     'create', STAFF, true, 'حفظ الفاتورة'],
  ['POS',    'pos_test_customers', 'list',   STAFF, true, 'بحث الكاشير'],
  ['POS',    'pos_test_settings',  'get',    { auth:'staff', secretDoc:true }, true, 'سجل التقفيل'],
  ['POS',    'entries',            'update', STAFF, true, 'ربط رقم العميل بالتقييم'],
  ['sales',  'sales_time_credit',  'create', STAFF, true, 'تسجيل رصيد وقت'],
  ['Office', 'staff_invites',      'create', STAFF, true, 'توليد الدعوة'],
  ['Office', 'staff_docs',         'read',   STAFF, true, 'عرض المستندات'],
  ['Office', 'sales_registrations','update', STAFF, true, 'اعتماد الطلب']
];

OPS.forEach(function(o){
  const who = o[0], col = o[1], op = o[2], ctx = o[3], want = o[4], why = o[5];
  const got = can(col, op, ctx);
  assert(got === want,
    (want ? '✅ ' : '⛔ ') + who + ' — ' + col + '.' + op + ' (' + why + ')'
      + (got === want ? '' : ' — 🔴 الرول ' + (got ? 'بيسمح' : 'بيمنع') + ' والمفروض العكس'));
});

// ============================================================
// ٢) اللي **لازم** يترفض — الثغرات اللي الرول ده اتعمل عشانها
// ============================================================
const DENY = [
  ['pos_test_settings', 'get',  { auth:'anon', secretDoc:true },
    '🔒 عميل مجهول ميقراش owner_admin / sales_roles / dayclose_*'],
  ['pos_test_customers','list', { auth:'anon', limit:1000 },
    '🔒 ومينزّلش قاعدة العملاء كلها'],
  ['pos_test_customers','list', { auth:'anon' },
    '🔒 ولا استعلام من غير حد أصلًا'],
  ['entries',           'update', ANON, '🔒 ومش بيعدّل تقييم حد تاني'],
  ['pos_test_sales',    'create', ANON, '🔒 ومش بيخترع فواتير'],
  ['pos_test_customers','delete', STAFF, '🔒 ومحدش بيمسح عميل — ولا الموظفين'],
  ['sales_registrations','create', { auth:'anon', source:'join', inviteOpen:false },
    '🔐 تسجيل بدعوة منتهية أو مستعملة = مرفوض'],
  ['staff_docs',        'create', { auth:'anon', inviteOpen:false },
    '🔐 ورفع مستندات من غير دعوة مفتوحة = مرفوض'],
  ['staff_docs',        'read',   ANON, '🔒 وصور البطاقات مش بتتقري لغير الموظفين'],
  ['staff_invites',     'list',   ANON, '🔒 ومحدش ينزّل الأكواد المفتوحة'],
  ['staff_invites',     'create', ANON, '🔒 ومحدش يعمل دعوة لنفسه'],
  ['pos_activity_log',  'update', STAFF, '🔒 وسجل النشاط مبيتعدّلش بعد الكتابة'],
  ['sales_salary_payments','update', STAFF, '🔒 وسجل صرف المرتبات كذلك'],
  ['pos_paymob_txns',   'create', STAFF, '🔒 وعمليات الكارت بتتكتب من الويب هوك بس'],
  ['office_expenses',   'read',   ANON, '🔒 ومصاريف المكتب مقفولة على العملاء'],
  ['sales_advances',    'read',   ANON, '🔒 والسلف كذلك'],
  ['pos_test_sales',    'read',   OUT,  '🔒 ومن غير دخول أصلًا: مفيش أي حاجة']
];
DENY.forEach(function(d){
  assert(can(d[0], d[1], d[2]) === false, d[3]);
});

// ============================================================
// ٣) مسح التطبيقات: أي مجموعة يلمسها تطبيق عميل لازم تكون في الجدول
//    (عشان استعلام جديد ما يعديش من غير فحص)
// ============================================================
{
  const known = {};
  OPS.forEach(function(o){ known[o[1]] = 1; });
  const CLIENT_FILES = [
    ['loyalty', 'loyalty/index.html'], ['glow', 'glow/index.html'],
    ['feedback', 'feedback/index.html'], ['join', 'join/index.html']
  ];
  CLIENT_FILES.forEach(function(f){
    const file = path.join(ROOT, f[1]);
    if(!fs.existsSync(file)){ return; }        // الملف مش في نسخة الاختبار
    const src = fs.readFileSync(file, 'utf8');
    const cols = {};
    // collection(db,'x') · collection('x') · COL_X = 'x'
    (src.match(/collection\(\s*(?:db\s*,\s*)?['"]([a-z_]+)['"]/g) || []).forEach(function(m){
      cols[m.replace(/.*['"]([a-z_]+)['"]/, '$1')] = 1;
    });
    (src.match(/=\s*['"](pos_test_[a-z_]+|sales_[a-z_]+|staff_[a-z_]+|entries|feedback_[a-z_]+)['"]/g) || [])
      .forEach(function(m){ cols[m.replace(/.*['"]([a-z_]+)['"]/, '$1')] = 1; });
    Object.keys(cols).forEach(function(c){
      assert(!!known[c],
        '🔎 مجموعة `' + c + '` اللي بيستعملها تطبيق ' + f[0]
        + ' موجودة في جدول الفحص — لو دي جديدة، ضيفها وحدّد المسموح');
    });
  });
}

// ============================================================
// ٤) القاعدة الأخيرة موجودة — أي مجموعة مش مذكورة = ممنوعة
// ============================================================
{
  const tail = rules.slice(rules.lastIndexOf('match /{document=**}'));
  assert(/allow read, write: if false/.test(tail),
    '🔒 أي مجموعة مش مذكورة في الرول = ممنوعة تمامًا');
  assert(can('مجموعة_مش_موجودة', 'read', STAFF) === false,
    'والمحاكي بيعامل المجموعات المجهولة بنفس المنطق');
}
