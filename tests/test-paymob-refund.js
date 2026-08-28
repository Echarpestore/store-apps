// ============================================================
// 🧪 paymobRefundProbe + إصلاح الـwebhook
// اللي الاختبار ده بيقفله:
//   ١) دالة مرتجع مفتوحة للعالم = أي حد يبعت فلوس على أي كارت → توكن إجباري
//   ٢) دالة تجربة بتقدر ترجّع فاتورة كاملة بالغلط → سقف 5 ج.م
//   ٣) callback المرتجع كان هيكتب فوق مستند البيعة الأصلية ويضيّع transactionId
//      (المرتجع عملية **بنت** بنفس merchant_order_id)
//
// ⚠️ ملف الدوال مش في الريبو (عند المالك في echarpe-push) — المسار بيتحدد
// بمتغير البيئة FUNCTIONS_INDEX، ولو الملف مش موجود الاختبار بيتخطى بأمان.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CANDIDATES = [
  process.env.FUNCTIONS_INDEX,
  path.resolve(__dirname, '..', '..', 'echarpe-push', 'functions', 'index.js'),
  path.resolve(__dirname, '..', 'functions', 'index.js')
].filter(Boolean);

const src_path = CANDIDATES.filter(function (p) { try { return fs.existsSync(p); } catch (e) { return false; } })[0];

if (!src_path) {
  console.log('  ⏭️  functions/index.js مش موجود — الاختبار اتخطى (شغّله بـ FUNCTIONS_INDEX=المسار)');
} else {
  const src = fs.readFileSync(src_path, 'utf8');
  // الإنتاج الحالي حذف paymobRefundProbe التجريبية عمدًا. وجود ملف functions
  // من غير الدالة دي مش فشل: الاختبار خاص بالبروب القديم فقط.
  if (src.indexOf('function refundProbeReject(') < 0) {
    console.log('  ⏭️  paymobRefundProbe محذوفة من الإنتاج — اختبار البروب القديم اتخطى');
    return;
  }

  function extractFn(s, name) {
    const start = s.indexOf('function ' + name + '(');
    if (start < 0) return '';
    const open = s.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < s.length; i++) {
      if (s[i] === '{') depth++;
      else if (s[i] === '}') { depth--; if (depth === 0) return s.slice(start, i + 1); }
    }
    return '';
  }

  const sb = { Object, Math, Number, JSON, String, Array, Buffer, RegExp };
  vm.createContext(sb);
  ['refundProbeReject'].forEach(function (n) {
    const code = extractFn(src, n);
    assert(code.length > 0, 'الدالة ' + n + ' موجودة في المصدر');
    vm.runInContext(code, sb);
  });
  const reject = function (body, token, max) {
    return vm.runInContext('refundProbeReject(' + JSON.stringify(body) + ',' +
      JSON.stringify(token) + ',' + JSON.stringify(max) + ')', sb);
  };

  const OK = { token: 'S3CRET', transaction_id: '505699768', amount_cents: 100, mode: 'refund' };

  // ============================================================
  // ١) 🔒 التوكن — القفل الأساسي
  // ============================================================
  {
    assertEq(reject(OK, 'S3CRET', 500), null, 'طلب سليم بتوكن صح بيعدّي');

    assert(typeof reject(OK, '', 500) === 'string',
      '⛔ التوكن مش متظبط في Secret Manager → الدالة بترفض (مش بتفتح للعالم)');
    assert(typeof reject(OK, null, 500) === 'string', '⛔ توكن null → رفض');

    let b = Object.assign({}, OK); delete b.token;
    assert(typeof reject(b, 'S3CRET', 500) === 'string', '⛔ طلب من غير توكن مرفوض');

    b = Object.assign({}, OK, { token: 's3cret' });
    assert(typeof reject(b, 'S3CRET', 500) === 'string', '⛔ التوكن حساس لحالة الحروف');

    b = Object.assign({}, OK, { token: 'S3CRET_' });
    assert(typeof reject(b, 'S3CRET', 500) === 'string', '⛔ توكن قريب مش كافي');

    assert(typeof reject(null, 'S3CRET', 500) === 'string', '⛔ body فاضي مرفوض');
  }

  // ============================================================
  // ٢) 💰 سقف مبلغ التجربة — يمنع مرتجع فاتورة حقيقية بالغلط
  // ============================================================
  {
    assertEq(reject(Object.assign({}, OK, { amount_cents: 1500 }), 'S3CRET', 1500), null,
      '15 ج.م = السقف بالظبط مقبول');
    // ⚠️ أقل مرتجع عند Paymob = 10 ج.م — السقف لازم يعدّيها وإلا مفيش اختبار أصلًا
    assertEq(reject(Object.assign({}, OK, { amount_cents: 1000 }), 'S3CRET', 1500), null,
      '10 ج.م (أقل مرتجع عند Paymob) بتعدّي السقف');
    assert(/PROBE_MAX_CENTS = 1500/.test(src), 'السقف في الكود 15 ج.م');

    let r = reject(Object.assign({}, OK, { amount_cents: 56000 }), 'S3CRET', 1500);
    assert(typeof r === 'string' && r.indexOf('15') >= 0,
      '⛔ 560 ج.م (فاتورة حقيقية) مرفوضة — الرسالة فيها السقف');

    assert(typeof reject(Object.assign({}, OK, { amount_cents: 4500 }), 'S3CRET', 1500) === 'string',
      '⛔ 45 ج.م (مرتجع حقيقي) مرفوض من دالة التجربة');
    assert(typeof reject(Object.assign({}, OK, { amount_cents: 1501 }), 'S3CRET', 1500) === 'string',
      '⛔ قرش واحد فوق السقف مرفوض');
    assert(typeof reject(Object.assign({}, OK, { amount_cents: 50 }), 'S3CRET', 500) === 'string',
      '⛔ أقل من جنيه مرفوض');
    assert(typeof reject(Object.assign({}, OK, { amount_cents: 0 }), 'S3CRET', 500) === 'string',
      '⛔ صفر مرفوض');
    assert(typeof reject(Object.assign({}, OK, { amount_cents: -100 }), 'S3CRET', 500) === 'string',
      '⛔ مبلغ سالب مرفوض');
  }

  // ============================================================
  // ٣) 🔢 رقم العملية والوضع
  // ============================================================
  {
    assert(typeof reject(Object.assign({}, OK, { transaction_id: '' }), 'S3CRET', 500) === 'string',
      '⛔ رقم عملية فاضي مرفوض');
    assert(typeof reject(Object.assign({}, OK, { transaction_id: '12a3' }), 'S3CRET', 500) === 'string',
      '⛔ رقم عملية فيه حروف مرفوض');
    assert(typeof reject(Object.assign({}, OK, { transaction_id: '1; DROP' }), 'S3CRET', 500) === 'string',
      '⛔ محاولة حقن في رقم العملية مرفوضة');
    assertEq(reject(Object.assign({}, OK, { transaction_id: ' 505699768 ' }), 'S3CRET', 500), null,
      'المسافات حوالين الرقم بتتشال');

    assertEq(reject(Object.assign({}, OK, { mode: 'refund' }), 'S3CRET', 500), null, 'mode=refund مقبول');
    assert(typeof reject(Object.assign({}, OK, { mode: 'capture' }), 'S3CRET', 500) === 'string',
      '⛔ mode مش معروف مرفوض');
    assert(typeof reject(Object.assign({}, OK, { mode: 'auto' }), 'S3CRET', 500) === 'string',
      '⛔ auto اتشال — كان بيجرّب void الأول ويلغي العملية كاملة');
  }

  // ============================================================
  // ٣ب) ⚠️ الـvoid بيلغي العملية **كاملة** — تأكيد صريح إجباري
  // 🔴 الباج اللي اتقفل: طلب بجنيه على عملية 560 ج.م كان هيرجّع الـ560 كلها
  // ============================================================
  {
    // الافتراضي بقى refund — مفيش void بالغلط
    assertEq(reject({ token:'S3CRET', transaction_id:'505699768', amount_cents:100 }, 'S3CRET', 500), null,
      'طلب من غير mode → refund (مش void)');
    assert(/const mode = String\(b\.mode \|\| "refund"\)/.test(src),
      'الافتراضي في الكود نفسه = refund');

    let r = reject(Object.assign({}, OK, { mode: 'void' }), 'S3CRET', 500);
    assert(typeof r === 'string' && r.indexOf('كاملة') >= 0,
      '⛔ void من غير تأكيد مرفوض والرسالة بتقول إنه بيلغي العملية كاملة');

    assert(typeof reject(Object.assign({}, OK, { mode:'void', void_confirm:'yes' }), 'S3CRET', 500) === 'string',
      '⛔ تأكيد قريب مش كافي');
    assert(typeof reject(Object.assign({}, OK, { mode:'void', void_confirm:true }), 'S3CRET', 500) === 'string',
      '⛔ true مش تأكيد');
    assertEq(reject(Object.assign({}, OK, { mode:'void', void_confirm:'YES-VOID-ALL' }), 'S3CRET', 500), null,
      'التأكيد الصريح بالنص بيعدّي');

    // مفيش تسلسل تلقائي في التنفيذ
    assert(/const tries = \[await attempt\(mode\)\]/.test(src),
      'محاولة واحدة بالوضع المطلوب بالظبط — مفيش تسلسل void→refund');
    assert(!/mode === "auto"/.test(src), '🔴 منطق auto القديم اتشال من التنفيذ');
  }

  // ============================================================
  // ٤) 📬 الـwebhook: عملية المرتجع البنت ما تدهسش البيعة الأصلية
  // ============================================================
  {
    assert(/_flag\(obj\.is_refund\) \|\| _flag\(obj\.is_void\)/.test(src),
      'الفصل بعلامات المرتجع/الإلغاء الصريحة — مش بعلامة الأبوة لوحدها');
    assert(!/const isChild = obj\.has_parent_transaction === true \|\| obj\.has_parent_transaction === "true";/.test(src),
      '🔴 القاعدة القديمة (الأبوة لوحدها) اتشالت — كانت بتفصل التحصيل وتعمي الـPOS');
    assert(/const docId = isChild/.test(src),
      'مستند المرتجع بيتفصل عن مستند البيعة الأصلية');
    assert(/parentOrderRef: isChild/.test(src),
      'العملية البنت بتشاور على البيعة الأصلية');
    assert(!/\.doc\(String\(merchantOrderId\)\)\.set\(\{\s*\n\s*status: status,/.test(src),
      '🔴 الكتابة القديمة اللي كانت بتدهس البيعة الأصلية اتشالت');

    // محاكاة اختيار المستند — نفس القاعدة اللي في الـwebhook حرفيًا
    const pick = function (obj, moid) {
      const _flag = function(v){ return v === true || v === 'true'; };
      const isChild = _flag(obj.has_parent_transaction)
        && (_flag(obj.is_refund) || _flag(obj.is_void) || _flag(obj.is_refunded) || _flag(obj.is_voided));
      return isChild ? (String(moid) + '__' + String(obj.id)) : String(moid);
    };
    const MOID = 'echarpe El Rehab-1785440241250';
    assertEq(pick({ id: 505699768, has_parent_transaction: false }, MOID), MOID,
      'البيعة المباشرة بتتكتب على مرجعها (الـPOS بيراقبه)');
    // 🔴 الباج اللي اتقفل: التحصيل (capture) بييجي بعلامة parent وهو تأكيد البيع نفسه —
    // كان بيتفصل في مستند جانبي والسيستم يفضل «مستني رد الماكينة» كل كام عملية
    // رغم إن الماكينة أكدت وطبعت
    assertEq(pick({ id: 505700200, has_parent_transaction: true, is_capture: true }, MOID), MOID,
      '🔴 التحصيل بيروح للمستند الأساسي — تأكيد البيع بيوصل للـPOS');
    assertEq(pick({ id: 505700111, has_parent_transaction: true, is_refund: true }, MOID), MOID + '__505700111',
      'المرتجع بيتكتب في مستند مستقل');
    assertEq(pick({ id: 505700112, has_parent_transaction: true, is_voided: 'true' }, MOID), MOID + '__505700112',
      'الإلغاء (بالقيمة النصية "true") بيتفصل برضه');
    assertEq(pick({ id: 505700113, has_parent_transaction: 'true' }, MOID), MOID,
      'عملية بنت من غير علامة مرتجع/إلغاء → المستند الأساسي (الأمان مع البيع)');
  }

  // ============================================================
  // ٥) 🔌 التوصيل: الأقفال موجودة في الدالة نفسها مش في التعليقات بس
  // ============================================================
  {
    assert(/PAYMOB_REFUND_TOKEN = defineSecret\("PAYMOB_REFUND_TOKEN"\)/.test(src),
      'توكن المرتجع متعرّف كـsecret (مش مكتوب في الكود)');
    assert(/refundProbeReject\(req\.body, PAYMOB_REFUND_TOKEN\.value\(\), PROBE_MAX_CENTS\)/.test(src),
      'الحارس بيتنادى فعلًا في أول الدالة');
    assert(/exports\.paymobRefundProbe[\s\S]{0,200}cors: false/.test(src),
      'دالة المرتجع مقفولة على CORS (مش زي paymobTerminalOrder المفتوحة)');
    assert(/PROBE_MAX_CENTS = 1500/.test(src), 'السقف مثبت في الكود');
    assert(/void_refund\/void/.test(src) && /void_refund\/refund/.test(src),
      'المسارين (void و refund) موجودين');

    // 🔴 الباج اللي اتقفل: كنا بنبعت auth_token في الجسم (الطريقة القديمة)
    // والوثائق الرسمية بتقول Secret Key في الهيدر — ده سبب success:false و data فاضية
    assert(/PAYMOB_SECRET_KEY = defineSecret\("PAYMOB_SECRET_KEY"\)/.test(src),
      'الـSecret Key متعرّف كـsecret منفصل');
    const _fn = src.slice(src.indexOf('exports.paymobRefundProbe'));
    assert(/"Authorization": "Token " \+ secret/.test(_fn),
      '✅ المصادقة بالـSecret Key في الهيدر (زي الـPostman collection الرسمية)');
    assert(!/auth_token: auth\.token, transaction_id/.test(src),
      '🔴 auth_token القديم اتشال من طلب المرتجع');
    assert(/transaction_id: Number\(txnId\), amount_cents: cents/.test(_fn),
      'الجسم = transaction_id + amount_cents أرقام (زي الوثائق بالظبط)');
    assert(/secrets: \[PAYMOB_SECRET_KEY/.test(_fn),
      'الدالة بتطلب الـSecret Key فعلًا');
    assert(/void_confirm/.test(src), 'تأكيد الـvoid الصريح موجود في الكود');
    // الرد الخام — بيت القصيد كله
    assert(/raw: raw, text: raw \? undefined : text/.test(src),
      'الرد بيترجع خام من غير تفسير (الرسالة نفسها هي الإجابة)');
    assert(/res\.status\(405\)/.test(src), 'GET مرفوض — POST بس');
  }
}

// ============================================================
// ٦) 🖥️ probe إرسال المرتجع للماكينة (العميل يحط الكارت)
// ============================================================
if (src_path) {
  const src2 = fs.readFileSync(src_path, 'utf8');
  const sb2 = { Object, Math, Number, JSON, String, Array, RegExp };
  vm.createContext(sb2);
  const code = (function () {
    const s = src2, name = 'refundTermProbeReject';
    const start = s.indexOf('function ' + name + '(');
    if (start < 0) return '';
    const open = s.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < s.length; i++) {
      if (s[i] === '{') depth++;
      else if (s[i] === '}') { depth--; if (depth === 0) return s.slice(start, i + 1); }
    }
    return '';
  })();
  assert(code.length > 0, 'refundTermProbeReject موجودة في المصدر');
  vm.runInContext(code, sb2);
  const rj = function (b, t, m) {
    return vm.runInContext('refundTermProbeReject(' + JSON.stringify(b) + ',' +
      JSON.stringify(t) + ',' + JSON.stringify(m) + ')', sb2);
  };
  const T = { token: 'S3CRET', terminal_id: 905225, amount_cents: 1000, variant: 'A' };

  assertEq(rj(T, 'S3CRET', 1500), null, 'الصيغة A بترمينال ومبلغ سليم بتعدّي');
  assert(typeof rj(Object.assign({}, T, { token: 'x' }), 'S3CRET', 1500) === 'string', '⛔ توكن غلط مرفوض');
  assert(typeof rj(T, '', 1500) === 'string', '⛔ التوكن مش متظبط → رفض');
  assert(typeof rj(Object.assign({}, T, { terminal_id: 0 }), 'S3CRET', 1500) === 'string', '⛔ من غير رقم ماكينة مرفوض');
  assert(typeof rj(Object.assign({}, T, { amount_cents: 4500 }), 'S3CRET', 1500) === 'string', '⛔ فوق السقف مرفوض');
  assert(typeof rj(Object.assign({}, T, { variant: 'C' }), 'S3CRET', 1500) === 'string', '⛔ صيغة مش معروفة مرفوضة');
  // الصيغة B لازمها رقم العملية الأصلية
  assert(typeof rj(Object.assign({}, T, { variant: 'B' }), 'S3CRET', 1500) === 'string',
    '⛔ الصيغة B من غير transaction_id مرفوضة');
  assertEq(rj(Object.assign({}, T, { variant: 'B', transaction_id: '505808913' }), 'S3CRET', 1500), null,
    'الصيغة B برقم العملية بتعدّي');

  assert(/exports\.paymobRefundTerminalProbe[\s\S]{0,200}cors: false/.test(src2), 'الدالة مقفولة على CORS');
  assert(/is_return: true/.test(src2), 'الصيغة A بتبعت علامة المرتجع على الأوردر');
  assert(/send_pay_notification_to_terminal_id/.test(src2), 'الصيغة A بتنبّه الماكينة');
  assert(/raw: raw, text: raw \? undefined : text/.test(src2), 'الرد بيترجع خام من غير تفسير');
}

// ============================================================
// ٧) 🩺 سجل التأكيدات المرفوضة (HMAC) — الرفض مبقاش بصمت
// ============================================================
if (src_path) {
  const src3 = fs.readFileSync(src_path, 'utf8');
  const rejBlock = src3.slice(src3.indexOf('bad_hmac') - 800, src3.indexOf('bad_hmac') + 600);
  assert(/pos_paymob_rejected/.test(src3),
    '🔴 التأكيد المرفوض بيتسجل في مجموعة تشخيصية — كان بيترمي بصمت تامة');
  assert(/res\.status\(401\)/.test(rejBlock), 'الرفض الأمني نفسه زي ما هو — 401 من غير أي تصديق');
  assert(rejBlock.indexOf('pos_paymob_rejected') < rejBlock.indexOf('res.status(401)'),
    'التسجيل قبل الرد — مش بيضيع');
  assert(!/pos_paymob_txns/.test(rejBlock), 'المرفوض عمره ما يلمس مستندات العمليات الحقيقية');
}
