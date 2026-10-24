/* ============================================================================
 *  🧮 إحصائيات العميلة — السيرفر
 * ----------------------------------------------------------------------------
 *  • تريجر على pos_test_sales: كل فاتورة بتتكتب بتحدّث مستند العميلة فورًا
 *  • customerStatsBackfill: جرد لمرة واحدة بيبني الإحصائيات من كل الفواتير
 *  • customerStatsVerify: بيقارن المخزّن بالمحسوب من الفواتير (من غير ما يكتب)
 *
 *  🔐 أمان التشغيل: الشاشة **مبتستخدمش** الإحصائيات دي غير لما العلم
 *  `pos_test_settings/customer_stats.ready` يبقى true — والجرد هو اللي بيرفعه
 *  بعد ما يخلص. قبل كده كل حاجة شغالة بالطريقة القديمة بالظبط.
 *  ولو حصل أي لغبطة: خلي ready = false والشاشة بترجع للطريقة القديمة فورًا.
 * ========================================================================== */
'use strict';

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const C = require('./customerStatsCore');

const db = getFirestore();
const SALES = 'pos_test_sales';
const CUSTOMERS = 'pos_test_customers';
const SETTINGS = 'pos_test_settings';
const FLAG_DOC = 'customer_stats';

/** مستند العميلة بالتليفون — المعرّف هو التليفون في النظام ده. */
const custRef = (phone) => db.collection(CUSTOMERS).doc(String(phone));

/**
 * تطبيق عملية واحدة على مستند عميلة، جوه معاملة عشان فاتورتين في نفس اللحظة
 * مايدوسوش على بعض.
 */
async function applyOp(op) {
  const ref = custRef(op.phone);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;                   // عميلة اتمسحت — مفيش حاجة نحدّثها
    const prev = C.statsFor(snap.data(), op.key);
    const next = C.applySale(prev, op.sale, op.sign);
    tx.update(ref, {
      ['stats.' + op.key]: next,
      statsAt: Date.now(),
    });
  });
}

// ---------------- التريجر ----------------
exports.onSaleForCustomerStats = onDocumentWritten(SALES + '/{saleId}', async (event) => {
  try {
    const before = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
    const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
    const ops = C.saleWriteOps(before, after);
    for (const op of ops) await applyOp(op);
  } catch (e) {
    console.error('customer stats trigger', e);
  }
});

// ---------------- الجرد (لمرة واحدة، وممكن يتعاد) ----------------
/**
 * بيمشي على كل الفواتير على دفعات، يبني الإحصائيات، ويكتبها على العملاء.
 * إعادة تشغيله آمنة: بيكتب القيمة النهائية مش بيزوّد عليها.
 * الاستدعاء: { apply: true } عشان يكتب فعلًا · { apply: false } عشان يعدّ بس.
 */
exports.customerStatsBackfill = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'لازم تسجيل دخول');
  const apply = req.data && req.data.apply !== false;

  const built = {};
  let salesRead = 0, last = null;
  for (;;) {
    let q = db.collection(SALES).orderBy('__name__').limit(2000);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    snap.docs.forEach((d) => {
      salesRead++;
      const sale = d.data();
      const t = C.saleTarget(sale);
      if (!t) return;
      const byBranch = built[t.phone] || (built[t.phone] = {});
      byBranch[t.key] = C.applySale(byBranch[t.key], sale, 1);
    });
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 2000) break;
  }

  let written = 0, missing = 0;
  if (apply) {
    const phones = Object.keys(built);
    for (let i = 0; i < phones.length; i += 400) {
      const chunk = phones.slice(i, i + 400);
      const batch = db.batch();
      const refs = chunk.map((p) => custRef(p));
      const snaps = await db.getAll(...refs);
      snaps.forEach((s, j) => {
        if (!s.exists) { missing++; return; }
        batch.update(s.ref, { stats: built[chunk[j]], statsAt: Date.now() });
        written++;
      });
      await batch.commit();
    }
    await db.collection(SETTINGS).doc(FLAG_DOC).set({
      ready: true, at: Date.now(), salesRead, written, missing, by: req.auth.uid,
    }, { merge: true });
  }
  return { salesRead, customers: Object.keys(built).length, written, missing, applied: apply };
});

// ---------------- التأكد من المطابقة (بيقرا بس) ----------------
/**
 * بيعيد الحساب من الفواتير ويقارنه باللي مخزّن، ويرجّع أول 20 اختلاف.
 * ده اللي بنتأكد بيه إن التريجر شغال صح قبل وبعد ما نعتمد على الأرقام.
 */
exports.customerStatsVerify = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'لازم تسجيل دخول');

  const built = {};
  let last = null;
  for (;;) {
    let q = db.collection(SALES).orderBy('__name__').limit(2000);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    snap.docs.forEach((d) => {
      const t = C.saleTarget(d.data());
      if (!t) return;
      const byBranch = built[t.phone] || (built[t.phone] = {});
      byBranch[t.key] = C.applySale(byBranch[t.key], d.data(), 1);
    });
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 2000) break;
  }

  const diffs = [];
  let checked = 0;
  const phones = Object.keys(built);
  for (let i = 0; i < phones.length; i += 300) {
    const chunk = phones.slice(i, i + 300);
    const snaps = await db.getAll(...chunk.map((p) => custRef(p)));
    snaps.forEach((s, j) => {
      if (!s.exists) return;
      const phone = chunk[j];
      Object.keys(built[phone]).forEach((key) => {
        checked++;
        const want = built[phone][key];
        const got = C.statsFor(s.data(), key);
        // lastTs مسموح يبقى أحدث في المخزّن (فاتورة اتلغت — مكتوب في النواة)
        if (Math.abs(want.spend - got.spend) > 0.01 || want.count !== got.count) {
          if (diffs.length < 20) diffs.push({ phone, branch: key, want, got });
        }
      });
    });
  }
  return { checked, mismatches: diffs.length, diffs };
});
