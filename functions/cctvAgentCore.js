'use strict';
/* ============================================================
   🤖 مراجع الكاميرات الذكي — المنطق الخالص (من غير Firestore ولا API)
   ------------------------------------------------------------
   · digest      : بيحوّل يوم فرع (أحداث السلة + سجل الكاشير + الفواتير + البلاغات)
                   لملخص صغير بأرقام مراجع (e1, e2 …) يقراه الوكيل.
   · parseReport : بيتأكد من تقرير الوكيل. أي لحظة بمرجع مش موجود بتتشال،
                   والوقت بييجي من الحدث نفسه — الوكيل مابيكتبش وقت بإيده.
   · pushText    : سطر الإشعار للمالك.
   بيتجرّب في node: tests/test-cctv-agent-core.js
   ============================================================ */
const RV = require('./cctvReviewCore');

const BRANCHES = [
  { id: 'madinaty', name: 'مدينتي', re: /madinaty|مدينتي/i },
  { id: 'glow', name: 'Glow', re: /glow/i },
  { id: 'rehab', name: 'الرحاب', re: /rehab|الرحاب/i },
];
const branchOf = (b) => BRANCHES.find((x) => x.re.test(String(b || ''))) || null;
const inBranch = (b, id) => { const x = branchOf(b); return !!x && x.id === id; };

const LIMITS = { events: 260, sales: 350, incidents: 20 };
const TZ = 'Africa/Cairo';
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const hms = (ms) => fmt.format(new Date(Number(ms) || 0));
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const cut = (s, k) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, k);
const saleMs = (s) => (s && s.createdAt && typeof s.createdAt.toMillis === 'function') ? s.createdAt.toMillis() : n(s && s.createdAtMs);

/* الأحداث اللي تستاهل نظرة: حذف/تقليل، تنبيهات، والفواتير الكبيرة. الباقي (إضافة صنف عادي) ضوضاء. */
function notable(e) { return e.removedValue > 0 || e.tone === 'del' || e.tone === 'alert'; }

function digest(input) {
  const { branchId, dayKey } = input;
  const timelines = (input.timelines || []).filter((t) => inBranch(t.branch, branchId));
  const activity = (input.activity || []).filter((a) => inBranch(a.branch, branchId));
  const sales = (input.sales || []).filter((s) => inBranch(s.branch, branchId));
  const incidents = (input.incidents || []).filter((r) => inBranch(r.branch, branchId));

  // فاتورة مالهاش تايملاين: سلة نهائية بس (نفس سلوك شاشة المراجعة)
  const byCode = {};
  timelines.forEach((t) => { if (t && t.invoiceCode) byCode[String(t.invoiceCode)] = t; });
  sales.forEach((s) => { const code = String(s.invoiceCode || s.id || ''); if (!code || byCode[code]) return; const t = RV.fromSale(s, saleMs(s)); if (t) byCode[code] = t; });

  const all = RV.buildEvents(Object.values(byCode), activity);
  const sum = RV.summary(all);
  const empBySid = {};
  activity.forEach((a) => { if (a.sid && a.employeeName) empBySid[a.sid] = a.employeeName; });
  sales.forEach((s) => { const e = s.employeeName || s.employee || s.seller; if (s.cartSid && e) empBySid[s.cartSid] = e; });

  let picked = all.filter(notable);
  if (picked.length > LIMITS.events) picked = picked.slice().sort((a, b) => (b.removedValue || 0) - (a.removedValue || 0) || (b.tone === 'alert') - (a.tone === 'alert')).slice(0, LIMITS.events).sort((a, b) => a.atMs - b.atMs);
  const events = picked.map((e, i) => ({
    ref: 'e' + (i + 1), atMs: e.atMs, time: hms(e.atMs), kind: e.kind, label: e.label,
    detail: cut(e.detail, 160), removedValue: e.removedValue || 0,
    invoiceNo: e.invoiceNo || '', invoiceCode: e.invoiceCode || '', employee: cut(empBySid[e.sid] || '', 40),
  }));

  const saleRows = sales.slice().sort((a, b) => saleMs(a) - saleMs(b)).slice(0, LIMITS.sales).map((s) => ({
    time: hms(saleMs(s)), invoiceNo: String(s.invoiceNo || ''), invoiceCode: String(s.invoiceCode || s.id || ''),
    total: n(s.total), employee: cut(s.employeeName || s.employee || s.seller || '', 40),
    pay: Object.keys(s.payments || {}).filter((k) => n(s.payments[k])).join('+'),
    items: (s.items || []).filter((it) => it && !it.isRedemption).reduce((m, it) => m + n(it.qty), 0),
    customer: !!s.customerPhone, discountPct: n(s.discountPct) || undefined,
    reversed: !!(s.reversed || s.isReversal) || undefined, returnNoInvoice: (s.items || []).some((it) => it && it.isReturn && !it.fromInvoice && !it.fromInvoiceId && !it.fromInvoiceCode) || undefined,
  }));

  const inc = incidents.slice(0, LIMITS.incidents).map((r) => ({ time: hms(r.ts), employee: cut(r.employeeName, 40), note: cut(r.note, 200) }));
  const total = saleRows.reduce((m, s) => m + s.total, 0);
  return {
    branchId, dayKey, branchName: (BRANCHES.find((b) => b.id === branchId) || {}).name || branchId,
    stats: { invoices: saleRows.length, salesTotal: Math.round(total), events: sum.total, removals: sum.removed, removedValue: sum.removedValue, alerts: sum.alerts, trimmed: all.filter(notable).length > events.length },
    events, sales: saleRows, incidents: inc,
  };
}

/* النص اللي بيروح للوكيل. JSON مضغوط عشان التوكنز. */
function digestText(d) {
  const lines = [];
  lines.push(`الفرع: ${d.branchName} · اليوم: ${d.dayKey} (توقيت القاهرة)`);
  lines.push('إحصائيات: ' + JSON.stringify(d.stats));
  lines.push('\nالأحداث المهمة (كل حدث له ref — استخدمه في التقرير):');
  d.events.forEach((e) => lines.push(JSON.stringify({ ref: e.ref, t: e.time, kind: e.kind, what: e.label, detail: e.detail, removed: e.removedValue || undefined, inv: e.invoiceNo || undefined, code: e.invoiceCode || undefined, emp: e.employee || undefined })));
  if (!d.events.length) lines.push('(مفيش أحداث حذف أو تنبيهات النهارده)');
  lines.push('\nفواتير اليوم:');
  d.sales.forEach((s) => lines.push(JSON.stringify(s)));
  if (d.incidents.length) { lines.push('\nبلاغات الكاشير:'); d.incidents.forEach((r) => lines.push(JSON.stringify(r))); }
  return lines.join('\n');
}

const SEVERITY = ['low', 'medium', 'high'];
const REPORT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['headline', 'risk', 'moments', 'patterns', 'clear'],
  properties: {
    headline: { type: 'string', description: 'جملة واحدة بالمصري: أهم حاجة في اليوم' },
    risk: { type: 'string', enum: SEVERITY },
    moments: {
      type: 'array', description: 'اللحظات اللي المالك لازم يشوفها في الكاميرا، الأهم الأول. 0 لـ 8.',
      items: {
        type: 'object', additionalProperties: false,
        required: ['ref', 'severity', 'title', 'why', 'watchFor'],
        properties: {
          ref: { type: 'string', description: 'ref الحدث من القايمة (e12). ممنوع تخترع ref.' },
          severity: { type: 'string', enum: SEVERITY },
          title: { type: 'string' },
          why: { type: 'string', description: 'ليه اللحظة دي مشكوك فيها، بالأرقام' },
          watchFor: { type: 'string', description: 'تبص على إيه في الفيديو بالظبط' },
        },
      },
    },
    patterns: { type: 'array', items: { type: 'string' }, description: 'أنماط على مدار اليوم أو مقارنة بالأيام اللي فاتت' },
    clear: { type: 'array', items: { type: 'string' }, description: 'حاجات شكلها غريب بس طبيعية — عشان المالك مايضيعش وقت' },
  },
};

function parseReport(raw, d) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const byRef = {}; (d.events || []).forEach((e) => { byRef[e.ref] = e; });
  const sev = (s) => (SEVERITY.includes(s) ? s : 'medium');
  const seen = new Set();
  const moments = (Array.isArray(r.moments) ? r.moments : []).filter((m) => m && byRef[m.ref] && !seen.has(m.ref) && seen.add(m.ref)).slice(0, 8).map((m) => {
    const e = byRef[m.ref];
    return { ref: e.ref, atMs: e.atMs, time: e.time, invoiceNo: e.invoiceNo, invoiceCode: e.invoiceCode, employee: e.employee, amount: e.removedValue || 0,
      severity: sev(m.severity), title: cut(m.title, 120), why: cut(m.why, 500), watchFor: cut(m.watchFor, 300) };
  });
  const list = (a, k) => (Array.isArray(a) ? a : []).map((x) => cut(x, 300)).filter(Boolean).slice(0, k);
  return { headline: cut(r.headline, 240) || 'مفيش ملخص', risk: sev(r.risk), moments, patterns: list(r.patterns, 6), clear: list(r.clear, 6), dropped: (Array.isArray(r.moments) ? r.moments.length : 0) - moments.length };
}

function pushText(rep, branchName) {
  const top = rep.moments[0];
  const icon = rep.risk === 'high' ? '🔴' : rep.risk === 'medium' ? '🟠' : '🟢';
  return { title: `${icon} مراجعة كاميرات ${branchName}`, body: top ? `${rep.moments.length} لحظة تتشاف · أولها ${top.time}: ${top.title}` : rep.headline };
}

/* ملخص قرارات المالك على تقارير الأيام اللي فاتت — الوكيل بيتعلم منها إيه اللي طلع طبيعي. */
function feedbackDigest(pastReports) {
  const out = [];
  (pastReports || []).forEach((p) => {
    const fb = p.feedback || {};
    (p.moments || []).forEach((m) => { if (fb[m.ref]) out.push({ day: p.dayKey, title: m.title, employee: m.employee || undefined, owner: fb[m.ref] === 'bad' ? 'مشكلة فعلًا' : 'طلع طبيعي' }); });
  });
  return out.slice(-40);
}

module.exports = { BRANCHES, branchOf, inBranch, digest, digestText, parseReport, pushText, feedbackDigest, REPORT_SCHEMA, hms, saleMs };
