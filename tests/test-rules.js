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
  // 💳 مستندات الدوال بس (staff_access) — ممنوعة حتى على الموظفين.
  //    ⚠️ من غير السطر ده المحاكي بيعتبر الشرط "غير مفهوم = مسموح"،
  //       فكان بيقول إن الولاء ممنوع من pos_test_settings وهو مسموح.
  if(t.indexOf('settingsLocked(id)') >= 0){
    const neg = t.trim().charAt(0) === '!';
    return neg ? !ctx.lockedDoc : !!ctx.lockedDoc;
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
// ✂️ تقسيم بيحترم الأقواس
// ⚠️⚠️ التقسيم البسيط بـ`split('||')` بيقرا `A && (B || C)` غلط:
//    بيطلّع "A && (B" و "C)" — فالجزء التاني بيتقيّم لوحده ويسمح.
//    ده مسك رول **صح** وقال عليه غلط، والأخطر إنه ممكن يمسك رول
//    **غلط** ويقول عليه صح. ولأن الاختبار ده بقى بيحرس قواعد فلوس،
//    القراءة الغلط مش خيار.
function splitTop(str, op){
  const out = []; let depth = 0, cur = '';
  for(let i = 0; i < str.length; i++){
    const ch = str[i];
    if(ch === '(') depth++;
    else if(ch === ')') depth--;
    if(depth === 0 && str.substr(i, op.length) === op){
      out.push(cur); cur = ''; i += op.length - 1; continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}
function evalCond(cond, ctx){
  let c = cond.trim();
  if(c === 'false') return false;
  if(c === 'true')  return true;
  // شيل الأقواس الخارجية لو بتغلّف الشرط كله
  while(c.charAt(0) === '(' && c.charAt(c.length - 1) === ')'){
    let d = 0, wraps = true;
    for(let i = 0; i < c.length; i++){
      if(c[i] === '(') d++;
      else if(c[i] === ')'){ d--; if(d === 0 && i < c.length - 1){ wraps = false; break; } }
    }
    if(!wraps) break;
    c = c.slice(1, -1).trim();
  }
  const ors = splitTop(c, '||');
  if(ors.length > 1) return ors.some(function(p){ return evalCond(p, ctx); });
  const ands = splitTop(c, '&&');
  if(ands.length > 1) return ands.every(function(p){ return evalCond(p, ctx); });
  return evalTerm(c, ctx);
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

  // ---- التقديم على وظيفة (مفتوح للعامة عن قصد) ----
  ['استمارة التقديم', 'job_applications', 'create', ANON, true, 'أي حد يقدر يقدّم — ده إعلان'],
  ['استمارة التقديم', 'job_applications', 'get',    ANON, true, 'بيقرا طلبه هو بمفتاحه'],

  // ---- 💳 منظومة الرصيد وكروت الهدايا ----
  // ⚠️ القاعدة الحاكمة: **مفيش تطبيق بيكتب فلوس**. كل الكتابة من
  //    Cloud Functions (بتشتغل بـAdmin SDK فالقواعد مبتتطبّقش عليها).
  ['تطبيق الولاء', 'credit_ledger', 'list', { auth:'anon', limit:50 }, true,
    'loyalty — كشف حساب الرصيد (نفس نمط «فواتيري»)'],
  ['تطبيق الولاء', 'credit_ledger', 'create', ANON, false,
    '⭐⭐ التطبيق مايكتبش في الدفتر — الدوال بس'],
  ['POS', 'pos_card_refunds_due', 'create', STAFF, true,
    'pos-sale.js — فرق فيزا مسحوب زيادة بيتسجل للمتابعة (فاتورة 1444)'],
  ['Office', 'pos_activity_log', 'list', STAFF, true,
    'office.js — تبويب سجل النشاط بيقرا الأحداث'],
  ['Office', 'pos_card_refunds_due', 'list', STAFF, true,
    'office.js — قايمة المستحق في تبويب الفلوس'],
  ['POS',    'credit_ledger', 'create', STAFF, false,
    '⭐⭐ ولا حتى الموظفين — كاشير يكتب في الدفتر = يطبع فلوس'],
  ['Office', 'credit_ledger', 'update', STAFF, false,
    '⭐⭐ ومفيش تعديل ولا حتى للمالك (append-only)'],
  ['Office', 'credit_ledger', 'delete', STAFF, false, 'ولا مسح'],

  ['Office', 'gift_cards_public', 'list', STAFF, true, 'تقرير الكروت في Office'],
  ['تطبيق الولاء', 'gift_cards_public', 'list', ANON, false,
    '🔒 العميلة مش محتاجة تشوف الكروت'],
  ['POS', 'gift_cards', 'get', STAFF, false,
    '🔒⭐⭐ مجموعة الكروت مقفولة حتى على الموظفين (فيها بصمة الكود = الفلوس)'],
  ['Office', 'gift_cards', 'get', STAFF, false, '🔒 ولا المالك'],

  ['Office', 'credit_requests', 'list', STAFF, true, 'طابور طلبات الكاشير'],
  ['POS', 'credit_requests', 'create', STAFF, false,
    '⭐ الطلب بيتسجّل من الفنكشن مش من POS مباشرة'],
  ['تطبيق الولاء', 'credit_requests', 'list', ANON, false, '🔒 مش شغل العميلة'],

  ['POS', 'credit_idem',  'get', STAFF, false,
    '🔒⭐⭐ مفاتيح التكرار مقفولة — لو اتمسحت، العملية تتعاد وتتحسب مرتين'],
  ['تطبيق الولاء', 'credit_guard', 'update', ANON, false,
    '🔒⭐⭐ وحارس المحاولات مقفول — لو اتصفّر، تخمين أكواد الكروت بلا حدود'],

  // 🔖 طلبات الزباين
  ['POS',    'customer_requests', 'create', STAFF, true, 'الكاشير بتسجّل الطلب'],
  ['POS',    'customer_requests', 'list',   STAFF, true, 'قايمة الطلبات المفتوحة'],
  ['تطبيق الولاء', 'customer_requests', 'list', { auth:'anon', limit:50 }, true,
    'العميلة تشوف طلباتها'],
  ['تطبيق الولاء', 'customer_requests', 'create', ANON, false,
    '⭐⭐ العميلة مبتسجّلش بنفسها — تقدر تسجّل باسم أي رقم'],
  ['POS',    'customer_requests', 'delete', STAFF, false, '🔒 الطلب بيتقفل مش بيتمسح'],

  // 💬 الشات
  ['تطبيق الولاء', 'customer_chat', 'get',    ANON, true, 'العميلة تفتح محادثتها'],
  ['تطبيق الولاء', 'customer_chat', 'create', ANON, true, 'أول رسالة بتفتح المحادثة'],
  ['POS',    'customer_chat', 'list',   STAFF, true, 'الفرع يشوف المحادثات'],
  ['POS',    'customer_chat', 'update', STAFF, true, 'الموظفة بترد وبتعلّم مقروء'],
  ['POS',    'customer_chat', 'delete', STAFF, false, '🔒 المحادثة مبتتمسحش'],

  // 💰 نسبة الموظفة
  ['POS',    'request_attributions', 'create', STAFF, true, 'تسجيل النسبة'],
  ['Office', 'request_attributions', 'list',   STAFF, true, 'المالك يشوفها'],
  ['POS',    'request_attributions', 'update', STAFF, false,
    '🔒⭐ سجل مراقَب — مدخل لمكافآت، فتعديله بعد الواقعة معناه إن الرقم مش موثوق'],
  ['تطبيق الولاء', 'request_attributions', 'list', ANON, false, '🔒 مش شغل العميلة'],

  // 💳📒 دفتر اليومية في Office
  ['Office', 'office_cash_days', 'list',   STAFF, true, 'الشيت اليومي'],
  ['Office', 'office_cash_days', 'update', STAFF, true, 'تعديل خانة بالإيد'],
  ['Office', 'office_cash_days', 'delete', STAFF, false, '🔒 يوم اتسجّل عمره ما بيتمسح'],
  ['تطبيق الولاء', 'office_cash_days', 'list', ANON, false, '🔒 أرقام فلوسك'],
  ['Office', 'office_cash_epochs', 'create', STAFF, true, 'أرشيف التصفير'],
  ['Office', 'office_cash_epochs', 'delete', STAFF, false, '🔒 تاريخ فلوس مبيتمسحش'],

  // 🔒 إعدادات حساسة جديدة
  ['تطبيق الولاء', 'pos_test_settings', 'get', { auth:'anon', secretDoc:true }, false,
    '🔒 office_cash / gift_cards / staff_access مقفولين على العملاء'],
  ['POS', 'pos_test_settings', 'update', { auth:'staff', lockedDoc:true }, false,
    '🔒⭐⭐ staff_access (قايمة مين يلمس فلوس) ممنوعة حتى على الموظفين'],

  // ---- POS و sales و Office (دخول بإيميل وباسورد) ----
  ['POS',    'pos_test_sales',     'create', STAFF, true, 'حفظ الفاتورة'],
  ['POS',    'pos_test_customers', 'list',   STAFF, true, 'بحث الكاشير'],
  ['POS',    'pos_test_settings',  'get',    { auth:'staff', secretDoc:true }, true, 'سجل التقفيل'],
  ['POS',    'entries',            'update', STAFF, true, 'ربط رقم العميل بالتقييم'],
  ['sales',  'sales_time_credit',  'create', STAFF, true, 'تسجيل رصيد وقت'],
  ['Office', 'staff_invites',      'create', STAFF, true, 'توليد الدعوة'],
  ['Office', 'staff_docs',         'read',   STAFF, true, 'عرض المستندات'],
  ['Office', 'sales_registrations','update', STAFF, true, 'اعتماد الطلب'],
  ['Office', 'job_applications',  'list',   STAFF, true, 'فرز المتقدّمين'],
  ['Office', 'job_applications',  'update', STAFF, true, 'تغيير حالة المتقدّم']
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
  ['pos_card_refunds_due', 'delete', STAFF,
    '🔒 فرق الفيزا حق عميلة — مش بيتمسح، بيتقفل بالرد بس'],
  ['pos_card_refunds_due', 'create', ANON,
    '🔒 ومحدش من بره يخترع مستحقات'],
  ['sales_salary_payments','update', STAFF, '🔒 وسجل صرف المرتبات كذلك'],
  ['pos_paymob_txns',   'create', STAFF, '🔒 وعمليات الكارت بتتكتب من الويب هوك بس'],
  ['office_expenses',   'read',   ANON, '🔒 ومصاريف المكتب مقفولة على العملاء'],
  ['sales_advances',    'read',   ANON, '🔒 والسلف كذلك'],
  ['pos_test_sales',    'read',   OUT,  '🔒 ومن غير دخول أصلًا: مفيش أي حاجة'],
  ['job_applications',  'list',   ANON, '🔒 ومحدش ينزّل بيانات المتقدّمين كلهم'],
  ['job_applications',  'delete', ANON, '🔒 ولا يمسح طلب حد']
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

// ============================================================
// ٥) 💳 أقفال الفلوس — فحص نصّي مباشر
//
// ⚠️ ليه فحص نصّي مش محاكاة: المحاكي **بيتجاهل شروط شكل المستند**
//    (hasAny · hasOnly · is int) عن قصد — هو عن الوصول مش عن
//    صحة الحقول. بس أهم حارس فلوس عندنا **هو بالظبط** من النوع
//    ده: قفل حقل `credit` جوّه مستند مفتوح للتعديل.
//    اتأكدت من الفجوة دي باختبار سلبي: شلت القفل والمحاكي عدّى.
//    فالحارس لازم يبقى نصّي، وإلا بيفضل مكشوف.
// ============================================================
{
  const custBlock = rules.slice(rules.indexOf('match /pos_test_customers/'),
                                rules.indexOf('match /pos_test_sales/'));

  assert(/hasAny\(\['credit', 'creditAt'\]\)/.test(custBlock),
    '💳⭐⭐ حقل الرصيد مقفول على التعديل — ولا حتى الموظفين');
  assert(/!\('credit' in request\.resource\.data\)/.test(custBlock),
    '💳⭐⭐ ومفيش رصيد ابتدائي عند إنشاء العميلة');

  // 🔴 نيجاتيف — لو القفل اتشال، الفحص ده لازم يقع
  const broken = custBlock.replace(/hasAny\(\['credit', 'creditAt'\]\)/, 'hasAny([])');
  assert(!/hasAny\(\['credit', 'creditAt'\]\)/.test(broken),
    '🔴 نيجاتيف — نسخة من غير القفل اتبنت والفحص كان هيقع عليها');

  // 🔒 وقايمة الموظفين المسموح لهم
  assert(/function settingsLocked/.test(rules),
    '🔒 فيه دالة للمستندات اللي الدوال بس بتكتبها');
  assert(/id == 'staff_access'/.test(rules),
    '🔒⭐⭐ و staff_access جواها (قايمة مين يلمس فلوس)');
  assert(/'staff_access', 'gift_cards', 'office_cash', 'office_cash_cfg'/.test(rules),
    '🔒 والمستندات الحساسة الجديدة في قايمة السرّي');

  // ⚠️ القفل لازم يبقى **برّه** فرعي الشرط مش جوّه واحد بس
  const setBlock = rules.slice(rules.indexOf('match /pos_test_settings/'),
                               rules.indexOf('match /pos_test_inventory/'));
  assert(/allow create, update: if !settingsLocked\(id\) && \(/.test(setBlock),
    '⚠️⭐⭐ والقفل على برّه الشرط كله — حطّه جوّه فرع واحد كان بيخليه وهمي');
}
