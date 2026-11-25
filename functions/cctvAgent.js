'use strict';
/* ============================================================
   🤖 مراجع الكاميرات الذكي (Claude agent)
   ------------------------------------------------------------
   كل يوم 3:17 الفجر بتوقيت القاهرة، لكل فرع، عن امبارح:
   1) بيجمع أحداث السلة + سجل الكاشير + الفواتير + البلاغات (نفس مصادر «مراجعة اليوم»).
   2) Claude بيقرا اليوم، ويقدر يفتح أي فاتورة أو يشوف لقطات الكاميرا بتاعتها (أدوات).
   3) بيكتب تقرير: اللحظات اللي لازم تتشاف في الفيديو بالوقت بالظبط وليه، وإيه اللي طبيعي.
   4) التقرير بيتحفظ في office_cctv_ai وبيوصل إشعار للمالك.
   المالك بيعلّم كل لحظة «طبيعي» أو «مشكلة» من Office، والوكيل بيقرا القرارات دي
   في الأيام اللي بعدها عشان مايكررش نفس الإنذار الكاذب.

   ⚙️ الإعداد مرة واحدة:  firebase functions:secrets:set ANTHROPIC_API_KEY
   💰 التكلفة التقريبية: 0.10–0.40 دولار لكل فرع في اليوم.
   ============================================================ */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const SDK = require('@anthropic-ai/sdk');
const Anthropic = SDK.default || SDK;
const C = require('./cctvAgentCore');

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const OWNER_EMAIL = defineSecret('OWNER_EMAIL');
const MODEL = 'claude-opus-5-5';
const MAX_TURNS = 8;
const COL = 'office_cctv_ai';
const DAY = 86400000;
const db = () => getFirestore();

let notify = null;   // index.js بيدّينا sendToOffice
function useNotifier(fn) { notify = fn; }

/* ---------- 🕒 يوم القاهرة ---------- */
const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', hourCycle: 'h23' });
const cairoKey = (ms) => keyFmt.format(new Date(ms));
function cairoDayStart(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  for (const h of [2, 3, 1, 4]) { const t = Date.UTC(y, m - 1, d) - h * 3600000; if (cairoKey(t) === dayKey && hourFmt.format(new Date(t)) === '00') return t; }
  return Date.UTC(y, m - 1, d) - 2 * 3600000;
}

/* ---------- 📥 بيانات اليوم ---------- */
async function loadDay(dayKey) {
  const from = cairoDayStart(dayKey), to = from + DAY;
  const { Timestamp } = require('firebase-admin/firestore');
  const q = (col, field) => db().collection(col).where(field, '>=', from).where(field, '<', to).get().then((s) => s.docs.map((d) => Object.assign({ id: d.id }, d.data()))).catch((e) => { console.warn('cctvAgent load', col, e.message); return []; });
  const [timelines, snapTl, activity, s1, s2, incidents] = await Promise.all([
    q('pos_cctv_invoice_timelines', 'endedAtMs'),
    q('pos_cctv_invoice_snapshots', 'basketTimeline.endedAtMs'),
    q('pos_activity_log', 'ts'),
    q('pos_test_sales', 'createdAtMs'),
    db().collection('pos_test_sales').where('createdAt', '>=', Timestamp.fromMillis(from)).where('createdAt', '<', Timestamp.fromMillis(to)).get().then((s) => s.docs.map((d) => Object.assign({ id: d.id }, d.data()))).catch(() => []),
    q('pos_incidents', 'ts'),
  ]);
  const tl = {}; timelines.forEach((t) => { if (t.invoiceCode) tl[t.invoiceCode] = t; });
  snapTl.forEach((x) => { const t = x.basketTimeline; if (t && t.invoiceCode && !tl[t.invoiceCode]) tl[t.invoiceCode] = t; });
  const sales = {}; s1.concat(s2).forEach((s) => { sales[s.id] = s; });
  return { timelines: Object.values(tl), activity: activity.filter((a) => a.type !== 'print_latency'), sales: Object.values(sales), incidents };
}

async function pastFeedback(branchId, dayKey) {
  const since = cairoKey(cairoDayStart(dayKey) - 21 * DAY);
  const s = await db().collection(COL).where('branch', '==', branchId).get().catch(() => null);
  if (!s) return [];
  return C.feedbackDigest(s.docs.map((d) => d.data()).filter((p) => p.dayKey >= since && p.dayKey < dayKey).sort((a, b) => (a.dayKey < b.dayKey ? -1 : 1)));
}

/* ---------- 🧰 أدوات الوكيل ---------- */
const TOOLS = [
  { name: 'get_invoice', description: 'تفاصيل فاتورة: الأصناف والأسعار وطرق الدفع والخصم والموظفة. استخدمها لما حدث محتاج سياق.', strict: true,
    input_schema: { type: 'object', additionalProperties: false, required: ['invoiceCode'], properties: { invoiceCode: { type: 'string' } } } },
  { name: 'get_invoice_snapshots', description: 'لقطات كاميرا الكاشير المحفوظة للفاتورة (قبل/بعد الحفظ). استخدمها بس للحظات المشكوك فيها جدًا — مش كل فاتورة ليها لقطات في السحابة.', strict: true,
    input_schema: { type: 'object', additionalProperties: false, required: ['invoiceCode'], properties: { invoiceCode: { type: 'string' } } } },
  { name: 'submit_report', description: 'سلّم التقرير النهائي. لازم تناديها مرة واحدة في الآخر.', strict: true, input_schema: C.REPORT_SCHEMA },
];

function runTool(name, input, ctx) {
  const code = String((input && input.invoiceCode) || '').slice(0, 80);
  if (name === 'get_invoice') {
    const s = ctx.sales.find((x) => String(x.invoiceCode || x.id) === code || String(x.invoiceNo) === code);
    if (!s || !C.inBranch(s.branch, ctx.branchId)) return [{ type: 'text', text: 'مفيش فاتورة بالكود ده في الفرع ده النهارده' }];
    const items = (s.items || []).map((it) => ({ name: String(it.name || '').slice(0, 60), qty: it.qty, price: it.price, ret: it.isReturn || undefined, redemption: it.isRedemption || undefined }));
    return [{ type: 'text', text: JSON.stringify({ invoiceNo: s.invoiceNo, time: C.hms(C.saleMs(s)), total: s.total, payments: s.payments, discountPct: s.discountPct, pointsRedeemed: s.pointsRedeemed, redeemSource: s.redeemSource, customer: !!s.customerPhone, employee: s.employeeName || s.employee || s.seller, reversed: s.reversed || s.isReversal, items }) }];
  }
  if (name === 'get_invoice_snapshots') {
    return db().collection('pos_cctv_invoice_snapshots').doc(code).get().then((d) => {
      if (!d.exists) return [{ type: 'text', text: 'مفيش لقطات محفوظة للفاتورة دي' }];
      const x = d.data() || {};
      let shots = x.shots || {};
      if (!Object.keys(shots).length && x.jpegData) shots = { after_save: { jpegData: x.jpegData, capturedAtMs: x.capturedAtMs } };
      const out = [];
      Object.keys(shots).slice(0, 3).forEach((k) => {
        const m = /^data:image\/jpeg;base64,(.+)$/.exec(String((shots[k] || {}).jpegData || ''));
        if (!m) return;
        out.push({ type: 'text', text: `لقطة «${k}» الساعة ${C.hms(shots[k].capturedAtMs)}` });
        out.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: m[1] } });
      });
      return out.length ? out : [{ type: 'text', text: 'اللقطات محفوظة على كمبيوتر الفرع بس، مش في السحابة' }];
    });
  }
  return [{ type: 'text', text: 'أداة مش معروفة' }];
}

const SYSTEM = `إنت مراجع أمن وخسائر لسلسلة محلات طرح وإكسسوارات في مصر (echarpe و Glow).
كل يوم بتقرا أحداث الكاشير لفرع واحد وتقول للمالك يبص على أنهي لحظات في كاميرا الكاشير.

إزاي تفكر:
- أخطر حاجة: قطع اتشالت من السلة والسلة خرجت من غير فاتورة، أو فاتورة بقت أقل من اللي اتعرض على العميلة، أو درج اتفتح من غير بيع، أو مرتجع من غير فاتورة أصلية، أو خصم يدوي من غير رقم عميلة، أو تعديل نقط.
- الحذف العادي بيحصل كتير (العميلة غيّرت رأيها). المشكوك فيه: حذف بعد ما القطعة فضلت وقت طويل، أو قيمة كبيرة، أو نفس الموظفة بتكرره، أو بعده فاتورة أقل بنفس الفرق.
- قارن بقرارات المالك على الأيام اللي فاتت: اللي علّمه «طبيعي» ماتنبّهش عليه تاني إلا لو فيه حاجة مختلفة.
- لو محتاج سياق افتح الفاتورة بـ get_invoice. لو لحظة مشكوك فيها جدًا وليها كود فاتورة، ممكن تشوف اللقطات بـ get_invoice_snapshots (ركّز: فيه عميلة قدام الكاشير؟ فيه حاجة اتحطت في شنطة من غير ما تتعدّ؟).
- ماتتهمش حد. اكتب اللي حصل بالأرقام وإيه اللي المالك يدوّر عليه في الفيديو.
- لو اليوم نضيف قول كده بوضوح، وسيب moments فاضية.

في الآخر نادي submit_report مرة واحدة. كل لحظة لازم يكون ليها ref من القايمة. اكتب بالمصري، جمل قصيرة.`;

/* ---------- 🔁 حلقة الوكيل ---------- */
async function runAgent(d, ctx) {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value(), maxRetries: 3, timeout: 240000 });
  const fb = ctx.feedback.length ? '\n\nقرارات المالك على تقارير الأيام اللي فاتت:\n' + ctx.feedback.map((x) => JSON.stringify(x)).join('\n') : '';
  const messages = [{ role: 'user', content: C.digestText(d) + fb }];
  const usage = { input: 0, output: 0, cacheRead: 0, turns: 0 };
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await client.beta.messages.create({
      model: MODEL, max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
      system: SYSTEM, tools: TOOLS, messages,
    });
    usage.turns++; usage.input += res.usage.input_tokens || 0; usage.output += res.usage.output_tokens || 0; usage.cacheRead += res.usage.cache_read_input_tokens || 0;
    if (res.stop_reason === 'refusal') throw new Error('refusal: ' + ((res.stop_details && res.stop_details.category) || ''));
    messages.push({ role: 'assistant', content: res.content });
    const calls = res.content.filter((b) => b.type === 'tool_use');
    const submit = calls.find((b) => b.name === 'submit_report');
    if (submit) return { report: C.parseReport(submit.input, d), usage };
    if (!calls.length) {
      messages.push({ role: 'user', content: 'سلّم التقرير دلوقتي بـ submit_report.' });
      continue;
    }
    const results = [];
    for (const b of calls) {
      let content;
      try { content = await runTool(b.name, b.input, ctx); } catch (e) { content = [{ type: 'text', text: 'خطأ: ' + e.message }]; }
      results.push({ type: 'tool_result', tool_use_id: b.id, content });
    }
    messages.push({ role: 'user', content: results });
  }
  throw new Error('agent did not submit a report in ' + MAX_TURNS + ' turns');
}

async function reviewBranchDay(branchId, dayKey, data, opt) {
  opt = opt || {};
  const d = C.digest(Object.assign({ branchId, dayKey }, data));
  const id = dayKey + '_' + branchId;
  const base = { dayKey, branch: branchId, branchName: d.branchName, stats: d.stats, model: MODEL, updatedAt: Date.now() };
  if (!d.stats.invoices && !d.events.length) {
    await db().collection(COL).doc(id).set(Object.assign(base, { empty: true, headline: 'مفيش نشاط مسجّل اليوم ده', risk: 'low', moments: [], patterns: [], clear: [] }), { merge: true });
    return { id, empty: true };
  }
  const ctx = { branchId, sales: data.sales, feedback: await pastFeedback(branchId, dayKey) };
  const { report, usage } = await runAgent(d, ctx);
  await db().collection(COL).doc(id).set(Object.assign(base, report, { empty: false, usage, error: FieldValue.delete() }), { merge: true });
  if (notify && opt.push !== false && (report.risk !== 'low' || report.moments.length)) {
    const p = C.pushText(report, d.branchName);
    await notify(p.title, p.body, 'cctv-ai').catch((e) => console.warn('cctvAgent push', e && e.message));
  }
  return { id, moments: report.moments.length, risk: report.risk, usage };
}

async function reviewDay(dayKey, branchIds, opt) {
  const data = await loadDay(dayKey);
  const out = [];
  for (const b of branchIds) {
    try { out.push(await reviewBranchDay(b, dayKey, data, opt)); }
    catch (e) {
      console.error('cctvAgent', b, dayKey, e && e.message);
      await db().collection(COL).doc(dayKey + '_' + b).set({ dayKey, branch: b, error: String(e && e.message).slice(0, 300), updatedAt: Date.now() }, { merge: true }).catch(() => {});
      out.push({ branch: b, error: String(e && e.message) });
    }
  }
  return out;
}

const ALL = C.BRANCHES.map((b) => b.id);

const cctvAgentDaily = onSchedule(
  { schedule: '17 3 * * *', timeZone: 'Africa/Cairo', secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540, memory: '1GiB' },
  async () => { const r = await reviewDay(cairoKey(Date.now() - DAY), ALL); console.log('cctvAgentDaily', JSON.stringify(r)); }
);

/* تشغيل يدوي من Office (المالك بس): يوم معيّن، فرع واحد أو الكل. */
const cctvAgentRun = onCall(
  { region: 'us-central1', secrets: [ANTHROPIC_API_KEY, OWNER_EMAIL], timeoutSeconds: 540, memory: '1GiB' },
  async (req) => {
    const t = (req.auth && req.auth.token) || {};
    const email = String(t.email || '').trim().toLowerCase(), owner = String(OWNER_EMAIL.value() || '').trim().toLowerCase();
    if (!req.auth || !email || !owner || email !== owner) throw new HttpsError('permission-denied', 'المالك فقط');
    const dayKey = String((req.data && req.data.dayKey) || cairoKey(Date.now() - DAY));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || dayKey > cairoKey(Date.now())) throw new HttpsError('invalid-argument', 'يوم غير صالح');
    const b = String((req.data && req.data.branch) || '');
    const ids = b ? ALL.filter((x) => x === b) : ALL;
    if (!ids.length) throw new HttpsError('invalid-argument', 'فرع غير معروف');
    return { ok: true, results: await reviewDay(dayKey, ids, { push: false }) };
  }
);

module.exports = { functions: { cctvAgentDaily, cctvAgentRun }, useNotifier, cairoDayStart, cairoKey };
