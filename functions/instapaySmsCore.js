/* ============================================================
   📩 instapaySmsCore — قراءة رسايل CIB ومطابقتها بتحويلات إنستاباي (دوال بحتة، متختبرة)
   ------------------------------------------------------------
   شكل الرسالة (من موبايل المالك 26-09):
     وارد:  يرجى العلم انه تم تنفيذ تحويل لحظي بمبلغ 755.00 جم إلى حسابك المنتهي بـ ********6818
            من HEBA MAHMOUD AHMED MAHM برقم مرجعي 034e738a بتاريخ 2026-09-25 23:38 ...
     صادر:  ... بمبلغ 1000.00 جم من حسابك المنتهي بـ ********6818 برقم مرجعي cb3fc216 بتاريخ ...
   الموجود: المبلغ بالقروش · آخر 4 من الحساب · اسم المحوّل (مقصوص) · الوقت بالدقيقة (القاهرة) ·
            مرجع البنك (8 حروف — **مش** رقم مرجع إنستاباي اللي في الإيصال، فمش بيتطابق بيه).
   المطابقة: نفس المبلغ بالظبط + وقت قريب + (اسم المحوّل موجود في نص الإيصال) → تأكيد.
   ============================================================ */
'use strict';

function normDigits(s) {
  return String(s == null ? '' : s)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
}

/** اسم للمقارنة: حروف بس، عربي متوحّد، إنجليزي كابيتال. */
function normName(s) {
  return normDigits(s)
    .replace(/[\u064B-\u065F\u0670]/g, '')                  // تشكيل
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .toUpperCase().replace(/[^A-Z\u0621-\u064A ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** وقت القاهرة المحلي → ms (بيتعامل مع التوقيت الصيفي من Intl). */
function cairoLocalToMs(y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off = (ms) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms));
    const g = (t) => Number((p.find((x) => x.type === t) || {}).value);
    const asUTC = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'));
    return asUTC - ms;
  };
  return guess - off(guess - off(guess));
}

/** بيرجّع null لو الرسالة مش تحويل لحظي من CIB. */
function parseCibSms(text) {
  // الآيفون ساعات بيحط علامات اتجاه/مسافات مخفية جوّه النص العربي — بتتشال قبل القراية
  const t = normDigits(text).replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u061C\uFEFF\u00A0]/g, ' ')
    .replace(/[٫]/g, '.').replace(/[٬]/g, ',')
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')        // شرَط «شكلها زي -» بس حرف تاني
    .replace(/[\u2236\uFE13\uFE55\uFF1A]/g, ':')                      // نقطتين «شكلها زي :»
    .replace(/[\u2044\u2215\uFF0F]/g, '/')
    .replace(/\s+/g, ' ');
  if (!/تحويل لحظي/.test(t)) return null;
  const amt = /بمبلغ\s*([\d,]+(?:\.\d{1,2})?)\s*جم/.exec(t);
  if (!amt) return null;
  const [ip, fp = ''] = amt[1].replace(/,/g, '').split('.');
  const amountCents = Number(ip) * 100 + Number((fp + '00').slice(0, 2));
  const direction = /إلى حسابك/.test(t) ? 'in' : /من حسابك/.test(t) ? 'out' : null;
  if (!direction) return null;
  const last4 = ((/حسابك المنتهي بـ?\s*\**\s*(\d{3,6})/.exec(t)) || [])[1] || '';
  const ref = ((/برقم مرجعي\s*([A-Za-z0-9]+)/.exec(t)) || [])[1] || '';
  // التاريخ بأكتر من شكل: 2026-09-27 05:31 · 2026/09/27 05:31 · 27-09-2026 05:31 · وممكن من غير «بتاريخ»
  let at = null;
  const d1 = /(\d{4}) ?[-/.] ?(\d{1,2}) ?[-/.] ?(\d{1,2})\D{0,12}?(\d{1,2}) ?: ?(\d{2})/.exec(t);
  const d2 = d1 ? null : /(\d{1,2}) ?[-/.] ?(\d{1,2}) ?[-/.] ?(\d{4})\D{0,12}?(\d{1,2}) ?: ?(\d{2})/.exec(t);
  if (d1) at = cairoLocalToMs(+d1[1], +d1[2], +d1[3], +d1[4], +d1[5]);
  else if (d2) at = cairoLocalToMs(+d2[3], +d2[2], +d2[1], +d2[4], +d2[5]);
  if (at != null && !Number.isFinite(at)) at = null;
  let fromName = '';
  if (direction === 'in') {
    const m = /\d{3,6}\s+من\s+(.+?)\s+برقم مرجعي/.exec(t);
    if (m) fromName = m[1].trim();
  }
  return { direction, amountCents, last4, ref, at, fromName };
}

/** كام كلمة من اسم المحوّل (في الرسالة) موجودة في نص الإيصال اللي التابلت قراه. */
function nameScore(fromName, ocrText) {
  const words = normName(fromName).split(' ').filter((w) => w.length >= 3);
  if (!words.length || !ocrText) return 0;
  const hay = ' ' + normName(ocrText) + ' ';
  // آخر كلمة في الرسالة ممكن تكون مقصوصة («MAHM») — بتتقارن كبداية كلمة
  return words.reduce((s, w, i) => s + ((i === words.length - 1 ? hay.includes(' ' + w) : hay.includes(' ' + w + ' ')) ? 1 : 0), 0);
}

/**
 * مطابقة رسالة واردة بالطلبات اللي مستنية تأكيد البنك.
 * sessions: [{ sid, amountCents, approvedAt, ocrText }]
 * بيرجّع { sid } لو فيه مرشح واحد واضح · { ambiguous: [...] } · أو null.
 */
function matchSms(sms, sessions, opts) {
  if (!sms || sms.direction !== 'in' || !sms.at) return null;
  const before = ((opts && opts.windowBeforeMin) || 30) * 60000;   // الطلب اتقبل قبل الرسالة بحد أقصى
  const after = ((opts && opts.windowAfterMin) || 10) * 60000;     // أو بعدها بشوية (الرسالة بتسبق أحيانًا)
  const inWin = (s) => s && s.approvedAt >= sms.at - before && s.approvedAt <= sms.at + after + 60000;
  // مبلغ الطلب بالظبط أولًا · لو مفيش: طلب خد قروش بصمة والعميلة حوّلت مبلغ الفاتورة الكامل
  // الاتنين مع بعض — لو أكتر من واحد، اسم المحوّل (من الإيصال) هو اللي بيحسم تحت
  const cands = (sessions || []).filter((s) => inWin(s) && (s.amountCents === sms.amountCents
    || (s.requestedCents && s.requestedCents !== s.amountCents && s.requestedCents === sms.amountCents)));
  if (!cands.length) return null;
  if (cands.length === 1) return { sid: cands[0].sid, nameScore: nameScore(sms.fromName, cands[0].ocrText) };
  const scored = cands.map((s) => ({ sid: s.sid, score: nameScore(sms.fromName, s.ocrText), gap: Math.abs(s.approvedAt - sms.at) }))
    .sort((a, b) => b.score - a.score || a.gap - b.gap);
  if (scored[0].score >= 1 && scored[0].score > (scored[1] ? scored[1].score : 0)) return { sid: scored[0].sid, nameScore: scored[0].score };
  return { ambiguous: scored.map((x) => x.sid) };
}

/**
 * 🏦 «من غير تصوير»: رسالة واردة بتأكد طلب إنستاباي **لسه مفتوح** (العميلة ماصورتش).
 * قواعد الدقة (عشان مستحيل نأكد طلب غلط):
 *  • المبلغ بالقرش بالظبط.
 *  • الطلب اتفتح قبل الرسالة (بحد أقصى 25 دقيقة) ومش منتهي.
 *  • آخر 4 أرقام من الحساب = حساب الفرع (لو الفرع متسجّل له حساب).
 *  • **مرشح واحد بس** في كل الفروع — لو طلبين مفتوحين بنفس المبلغ، أو طلب تاني بنفس المبلغ
 *    اتقبل ولسه البنك ماأكدهوش في نفس الوقت → «محتاج تصوير» ومفيش تخمين.
 * open:  [{ sid, amountCents, startedAt, expiresAt, bankLast4 }]
 * busy:  طلبات اتقبلت ومستنية البنك [{ amountCents, approvedAt }]
 */
function matchOpen(sms, open, busy, opts) {
  if (!sms || sms.direction !== 'in' || !sms.at) return null;
  const maxAge = ((opts && opts.maxAgeMin) || 25) * 60000;
  const ok = (s) => s && s.startedAt >= sms.at - maxAge && s.startedAt <= sms.at + 90000
    && (!s.expiresAt || s.expiresAt >= sms.at)
    && (!s.bankLast4 || !sms.last4 || String(s.bankLast4) === String(sms.last4));
  // المبلغ بالظبط أولًا (ولو الطلب خد قروش بصمة، القروش هي اللي بتحدده) ·
  // لو مفيش: المبلغ الكامل لطلب خد بصمة — بنفس قاعدة «مرشح واحد بس»
  const exact = (open || []).filter((s) => ok(s) && s.amountCents === sms.amountCents);
  const full = (open || []).filter((s) => ok(s) && s.requestedCents && s.requestedCents !== s.amountCents && s.requestedCents === sms.amountCents);
  // 🔴 طلب بالمبلغ ده بالظبط + طلب تاني بنفس الفاتورة خد بصمة: يمكن صاحبة البصمة حوّلت الكامل → مفيش تخمين
  if (exact.length && full.length) return { ambiguous: exact.concat(full).map((c) => c.sid) };
  const cands = exact.length ? exact : full;
  if (!cands.length) return null;
  const clash = (busy || []).some((b) => b && (b.amountCents === sms.amountCents || b.requestedCents === sms.amountCents) && Math.abs((b.approvedAt || 0) - sms.at) <= maxAge);
  if (cands.length > 1 || clash) return { ambiguous: cands.map((c) => c.sid) };
  return { sid: cands[0].sid };
}

/**
 * 🧾 مطابقة **بعد الحفظ** (كل الفروع — بتابلت ومن غيره): فاتورة فيها إنستاباي ↔ رسالة بنك واردة.
 * نفس المبلغ بالقرش · الوقت في حدود ±15 دقيقة · الرسالة مش مربوطة بفاتورة تانية · الأقرب في الوقت.
 * دي **مراجعة** مش اعتماد: الفاتورة اتحفظت خلاص؛ اللي مالقاش رسالة بيطلع تنبيه للمالك.
 */
function matchInvoiceSms(inv, smsList, opts) {
  const win = ((opts && opts.windowMin) || 15) * 60000;
  if (!inv || !(inv.amountCents > 0)) return null;
  const c = (smsList || []).filter((m) => m && m.direction === 'in' && !m.invoiceId && m.amountCents === inv.amountCents
    && m.at && Math.abs(m.at - inv.createdAt) <= win);
  if (!c.length) return null;
  c.sort((x, y) => Math.abs(x.at - inv.createdAt) - Math.abs(y.at - inv.createdAt));
  return c[0];
}
function matchSmsInvoice(sms, invoices, opts) {
  const win = ((opts && opts.windowMin) || 15) * 60000;
  if (!sms || sms.direction !== 'in' || !sms.at) return null;
  const c = (invoices || []).filter((v) => v && (v.status === 'pending' || v.status === 'bank_missing') && v.amountCents === sms.amountCents
    && Math.abs(v.createdAt - sms.at) <= win);
  if (!c.length) return null;
  c.sort((x, y) => Math.abs(x.createdAt - sms.at) - Math.abs(y.createdAt - sms.at));
  return c[0];
}

module.exports = { normDigits, normName, cairoLocalToMs, parseCibSms, nameScore, matchSms, matchOpen, matchInvoiceSms, matchSmsInvoice };
