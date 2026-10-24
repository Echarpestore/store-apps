/* ============================================================================
 *  🧮 إحصائيات العميلة لكل فرع — النواة البحتة (من غير Firebase)
 * ----------------------------------------------------------------------------
 *  المشكلة: شاشة العملاء كانت بتقرا **كل فواتير الفرع** (عشرات الآلاف) عشان
 *  تحسب إنفاق وزيارات وآخر زيارة لكل عميلة — 65 ثانية تحميل وفاتورة قراءات ضخمة.
 *
 *  الحل: نفس الحساب بالظبط بس بيتعمل **مرة واحدة وقت البيع** على السيرفر،
 *  ويتخزن على مستند العميلة. الشاشة بتقراه جاهز.
 *
 *  ⚠️ القاعدة الذهبية هنا: الأرقام لازم تطلع **مطابقة تمامًا** للحساب القديم،
 *  عشان كده منطق الجمع في مكان واحد متختبر (`applySale`) والسيرفر والعميل
 *  بيستخدموه. الحساب القديم (pos-reports.js) كان:
 *      لو مفيش customerPhone أو الفاتورة reversed → تتجاهل خالص
 *      spend += total            (المرتجع total بالسالب فبيخصم لوحده)
 *      count += 1 إلا لو isReversal   (المرتجع مش زيارة)
 *      lastTs = أكبر وقت فاتورة
 * ========================================================================== */
'use strict';

/** اسم الفرع بيتحول لمفتاح آمن كاسم حقل في Firestore (النقطة بتتقري كمسار). */
function branchKey(branch) {
  return String(branch == null ? '' : branch).trim().replace(/[.$[\]#/\s]+/g, '_') || '_none';
}

/** وقت الفاتورة بالملي — createdAt (Timestamp أو Date) أو createdAtMs للأوفلاين. */
function saleMs(sale) {
  const c = sale && sale.createdAt;
  if (c) {
    if (typeof c.toMillis === 'function') return c.toMillis();
    if (typeof c.seconds === 'number') return c.seconds * 1000;
    if (c instanceof Date) return c.getTime();
    if (typeof c === 'number') return c;
  }
  const ms = Number(sale && sale.createdAtMs);
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

/** الفاتورة دي بتتحسب في إحصائيات مين؟ null = متتحسبش (مفيش عميلة أو ملغية). */
function saleTarget(sale) {
  if (!sale || !sale.customerPhone || sale.reversed) return null;
  return { phone: String(sale.customerPhone), key: branchKey(sale.branch) };
}

const EMPTY = { spend: 0, count: 0, lastTs: 0 };

/** إحصائيات فرع من مستند العميلة — دايمًا بترجّع شكل كامل. */
function statsFor(customer, branch) {
  const all = (customer && customer.stats) || {};
  const s = all[branchKey(branch)] || {};
  return {
    spend: Number(s.spend) || 0,
    count: Number(s.count) || 0,
    lastTs: Number(s.lastTs) || 0,
  };
}

/**
 * بيضيف (أو يشيل) فاتورة على إحصائيات موجودة.
 * sign = ‎+1 إضافة · ‎−1 شيل (لما الفاتورة تتلغي).
 * ⚠️ lastTs مبيرجعش لورا لما نشيل فاتورة — إرجاعه يحتاج قراءة كل الفواتير
 *    تاني، وده بالظبط اللي بنهرب منه. الخطأ هنا في أسوأ حالة «آخر زيارة»
 *    بتفضل على فاتورة اتلغت، والجرد الدوري بيصلّحها.
 */
function applySale(prev, sale, sign) {
  const p = prev || EMPTY;
  const s = sign === -1 ? -1 : 1;
  const total = Number(sale && sale.total) || 0;
  const isRev = !!(sale && sale.isReversal);
  const ts = saleMs(sale);
  return {
    spend: Math.round(((Number(p.spend) || 0) + s * total) * 100) / 100,
    count: Math.max(0, (Number(p.count) || 0) + (isRev ? 0 : s)),
    lastTs: Math.max(Number(p.lastTs) || 0, s === 1 ? ts : 0),
  };
}

/**
 * التغيير المطلوب لما مستند فاتورة يتكتب.
 * بيرجّع مصفوفة عمليات: [{ phone, key, sign, sale }] — ممكن تبقى فاضية،
 * أو فيها عمليتين لو الفاتورة اتنقلت من عميلة لعميلة (حالة نادرة بس بتحصل).
 */
function saleWriteOps(before, after) {
  const b = saleTarget(before);
  const a = saleTarget(after);
  const same = b && a && b.phone === a.phone && b.key === a.key
    && Number(before.total) === Number(after.total)
    && !!before.isReversal === !!after.isReversal;
  if (same) return [];                                  // مفيش تغيير يهمنا
  const ops = [];
  if (b) ops.push({ phone: b.phone, key: b.key, sign: -1, sale: before });
  if (a) ops.push({ phone: a.phone, key: a.key, sign: 1, sale: after });
  return ops;
}

/** بناء الإحصائيات من الصفر لمجموعة فواتير — للجرد والتأكد من المطابقة. */
function buildFromSales(sales) {
  const out = {};   // phone → { branchKey → stats }
  (sales || []).forEach((sale) => {
    const t = saleTarget(sale);
    if (!t) return;
    const byBranch = out[t.phone] || (out[t.phone] = {});
    byBranch[t.key] = applySale(byBranch[t.key], sale, 1);
  });
  return out;
}

module.exports = { branchKey, saleMs, saleTarget, statsFor, applySale, saleWriteOps, buildFromSales, EMPTY };
