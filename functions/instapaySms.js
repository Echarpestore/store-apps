/* ============================================================
   📩 مطابقة إنستاباي برسايل CIB (طلب المالك 24–26/09)
   ------------------------------------------------------------
   الآيفون اللي عليه رسايل الحساب بيبعت كل رسالة CIB هنا (أتمتة «الاختصارات»).
   • instapaySmsIngest: بيقرا الرسالة → لو وارد: بيدوّر على طلب إنستاباي اتقبل بنفس المبلغ
     في وقت قريب (واسم المحوّل موجود في الإيصال لو فيه أكتر من مرشح) → «✅ وصل البنك».
   • instapayBankWatch (كل 10 دقايق): أي طلب اتقبل من 30 دقيقة ومفيش رسالة ليه → «⚠️ مااتأكدش
     من البنك» + تنبيه في Office. وبيعيد المطابقة لرسايل وصلت قبل ما الطلب يتقبل.
   الأمان: مفتاح سري (Secret Manager: INSTAPAY_SMS_KEY) · تكرار نفس الرسالة بيتسجل مرة واحدة ·
   الدالة مبتلمسش أي فاتورة — بتعلّم حالة البنك على طلب التابلت بس.
   النشر: firebase functions:secrets:set INSTAPAY_SMS_KEY
          firebase deploy --only functions:instapaySmsIngest,functions:instapayBankWatch
   ============================================================ */
'use strict';
const crypto = require('crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore } = require('firebase-admin/firestore');
const { parseCibSms, matchSms, matchOpen, matchInvoiceSms, matchSmsInvoice } = require('./instapaySmsCore');

const REGION = 'us-central1';
const INSTAPAY_SMS_KEY = defineSecret('INSTAPAY_SMS_KEY');
const db = () => getFirestore();
const PENDING = 'PENDING_BANK_RECONCILIATION', MISSING = 'BANK_MISSING', CONFIRMED = 'BANK_CONFIRMED';
const MISSING_AFTER_MIN = 30;
// ⏱️ طلب المالك 27-09: التأكيد من البنك (من غير تصوير) بس لو الرسالة وصلت خلال 4 دقايق من فتح الطلب
const BANK_FIRST_MAX_MIN = 4;
// 🔐 27-09 (طلب المالك): الرسالة لازم تكون من CIB نفسه — أي حد يقدر يبعت SMS بنفس النص من رقم عادي.
//    الآيفون بيبعت اسم المرسل (sender) مع الرسالة؛ غيره = بتتسجل «untrusted» ومبتأكدش أي حاجة.
const TRUSTED_SENDERS = ['CIB'];
const senderOk = (x) => TRUSTED_SENDERS.includes(String(x || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase());
const DONE = ['approved', 'finalized'];   // حالات طلب التابلت اللي فلوسها المفروض وصلت

function keyOk(given, real) {
  const a = Buffer.from(String(given || '')), b = Buffer.from(String(real || ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function openSessions(sinceMs) {
  // مدى على حقل واحد (approvedAt) — الطلبات القديمة (حتى اللي «مااتأكدتش») مبتتقريش كل مرة
  const q = await db().collection('finance_sessions').where('approvedAt', '>=', sinceMs).get();
  const out = [];
  // «approved» = اتقبل ولسه الفاتورة ماتحفظتش · «finalized» = الفاتورة اتحفظت (أغلب الحالات لما الرسالة توصل)
  q.forEach((d) => { const s = d.data() || {}; if (DONE.includes(s.status) && [PENDING, MISSING, CONFIRMED].includes(s.bankState)) out.push({ ...s, sid: d.id }); });
  return out;
}

async function confirm(smsId, sms, m) {
  return db().runTransaction(async (tx) => {
    const sRef = db().collection('finance_sessions').doc(m.sid);
    const sDoc = await tx.get(sRef);
    const s = sDoc.exists ? sDoc.data() : null;
    if (!s || s.bankState === CONFIRMED) return false;                  // اتأكد قبل كده برسالة تانية
    tx.update(sRef, { bankState: CONFIRMED, bankConfirmedAt: Date.now(),
      bank: { smsId, ref: sms.ref, at: sms.at, fromName: sms.fromName, nameScore: m.nameScore || 0, last4: sms.last4 } });
    tx.update(db().collection('instapay_sms').doc(smsId), { status: 'matched', sid: m.sid, branch: s.branch || '' });
    return true;
  });
}

/* 🏦 طلبات لسه مفتوحة (العميلة لسه ماصوّرتش) — استعلام بحقل واحد (status) */
async function waitingSessions(sinceMs) {
  // آخر نص ساعة بس (مدى على حقل واحد) — الطلبات المتسابة القديمة مبتتقريش
  const q = await db().collection('finance_sessions').where('startedAt', '>=', sinceMs).get();
  const out = [];
  const cfgCache = {};
  for (const d of q.docs) {
    const s = d.data() || {};
    if (!['waiting', 'scanning'].includes(s.status)) continue;
    if (!(s.branch in cfgCache)) {
      const c = await db().collection('pos_test_settings').doc('instapay_' + String(s.branch)).get();
      cfgCache[s.branch] = c.exists ? String((c.data() || {}).bankLast4 || '') : '';
    }
    out.push({ ...s, sid: d.id, bankLast4: cfgCache[s.branch] });
  }
  return out;
}

/* الرسالة أكدت طلب مفتوح → الطلب يتقبل «من البنك» والتابلت والكاشير يعرفوا فورًا */
async function approveFromBank(smsId, sms, sid) {
  return db().runTransaction(async (tx) => {
    const sRef = db().collection('finance_sessions').doc(sid);
    const sDoc = await tx.get(sRef);
    const s = sDoc.exists ? sDoc.data() : null;
    if (!s || !['waiting', 'scanning'].includes(s.status)) return false;       // اتقبل/اتلغى في النص
    if (s.expiresAt && s.expiresAt < Date.now()) return false;
    const liveRef = db().collection('insta_live').doc(String(s.branch));
    const live = await tx.get(liveRef);
    const now = Date.now();
    const bank = { smsId, ref: sms.ref, at: sms.at, fromName: sms.fromName, last4: sms.last4, nameScore: 0 };
    tx.update(sRef, { status: 'approved', mode: 'bank', approvedAt: now, hint: '',
      bankState: CONFIRMED, bankConfirmedAt: now, bank,
      checks: { amount: true, time: true, reference: true, beneficiary: true } });
    tx.update(db().collection('instapay_sms').doc(smsId), { status: 'matched', sid, branch: s.branch || '', via: 'bank-first' });
    if (live.exists && (live.data() || {}).sid === sid) {
      tx.set(liveRef, { sid, status: 'approved', mode: 'bank', branch: s.branch, amountCents: s.amountCents,
        alias: s.alias || '', aliases: s.aliases || [], beneficiary: s.beneficiary || '', startedAt: s.startedAt,
        scans: s.scans || 0, checks: { amount: true, time: true, reference: true, beneficiary: true },
        hint: '', fromName: sms.fromName || '', bankRef: sms.ref || '', bankAt: sms.at || now, updatedAt: now });
    }
    return true;
  });
}

async function tryMatch(smsId, sms0) {
  const sms = (sms0 && !sms0.at && sms0.receivedAt) ? { ...sms0, at: sms0.receivedAt } : sms0;   // رسايل قديمة من غير وقت
  const sessions = await openSessions(sms.at - 3 * 3600000);
  const m = matchSms(sms, sessions.filter((x) => x.bankState !== CONFIRMED));
  if (m && m.sid) return (await confirm(smsId, sms, m)) ? 'matched' : 'unmatched';
  // مفيش طلب «اتقبل ومستني البنك» → يمكن العميلة حوّلت ومصوّرتش: نأكد الطلب المفتوح لو واضح 100%
  if (!(m && m.ambiguous)) {
    const open = await waitingSessions(sms.at - 30 * 60000);
    const busy = sessions.filter((x) => x.bankState !== CONFIRMED);
    const o = matchOpen(sms, open, busy, { maxAgeMin: BANK_FIRST_MAX_MIN });
    if (o && o.sid) return (await approveFromBank(smsId, sms, o.sid)) ? 'matched' : 'unmatched';
    if (o && o.ambiguous) {
      await db().collection('instapay_sms').doc(smsId).update({ status: 'ambiguous', candidates: o.ambiguous });
      return 'ambiguous';
    }
  }
  const status = m && m.ambiguous ? 'ambiguous' : 'unmatched';
  await db().collection('instapay_sms').doc(smsId).update({ status, candidates: (m && m.ambiguous) || [] });
  return status;
}

/* ============================================================
   🧾 المطابقة بعد الحفظ — كل الفروع (بتابلت ومن غيره)
   كل فاتورة فيها إنستاباي بتتسجل في instapay_invoices وتتربط برسالة بنك بنفس المبلغ
   (الرسالة ممكن توصل قبل الحفظ أو بعده). مفيش رسالة بعد 30 دقيقة = تنبيه في Office.
   ============================================================ */
async function linkInvoice(invId, smsId) {
  return db().runTransaction(async (tx) => {
    const iRef = db().collection('instapay_invoices').doc(invId);
    const mRef = db().collection('instapay_sms').doc(smsId);
    const [iDoc, mDoc] = [await tx.get(iRef), await tx.get(mRef)];
    if (!iDoc.exists || !mDoc.exists) return false;
    const inv = iDoc.data(), m = mDoc.data();
    if (inv.status === 'bank_ok' || m.invoiceId) return false;          // اتربطوا قبل كده
    tx.update(iRef, { status: 'bank_ok', smsId, bankAt: m.at, fromName: m.fromName || '', linkedAt: Date.now(),
      late: inv.status === 'bank_missing' });                           // وصلت بعد التنبيه
    tx.update(mRef, { invoiceId: invId, invoiceCode: inv.invoiceCode || '' });
    return true;
  });
}

async function tryInvoicesForSms(smsId, sms) {
  const q = await db().collection('instapay_invoices').where('createdAt', '>=', sms.at - 20 * 60000).get();
  const inv = matchSmsInvoice(sms, q.docs.map((d) => ({ ...d.data(), id: d.id })));
  if (inv) await linkInvoice(inv.id, smsId);
}

exports.instapayInvoiceWatch = onDocumentCreated({ document: 'pos_test_sales/{saleId}', region: 'europe-west1' }, async (event) => {
  try {
    const sale = event.data ? event.data.data() : null;
    const insta = Number(((sale && sale.payments) || {}).instapay || 0);
    if (!sale || !(insta > 0) || Number(sale.total || 0) < 0) return;      // مرتجع/من غير إنستاباي
    const invId = event.params.saleId;
    const createdAt = Number(sale.createdAtMs) || Date.now();
    const inv = { branch: sale.branch || '', invoiceCode: sale.invoiceCode || '', amountCents: Math.round(insta * 100),
      createdAt, cashier: sale.employeeName || '', status: 'pending' };
    const ref = db().collection('instapay_invoices').doc(invId);
    const created = await db().runTransaction(async (tx) => { if ((await tx.get(ref)).exists) return false; tx.create(ref, inv); return true; });
    if (!created) return;
    const q = await db().collection('instapay_sms').where('receivedAt', '>=', createdAt - 60 * 60000).get();
    const m = matchInvoiceSms(inv, q.docs.map((d) => ({ ...d.data(), id: d.id })));
    if (m) await linkInvoice(invId, m.id);
  } catch (e) { console.error('instapayInvoiceWatch', e); }
});

exports.instapaySmsIngest = onRequest({ region: REGION, secrets: [INSTAPAY_SMS_KEY], memory: '256MiB', timeoutSeconds: 30 }, async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false });
    const body = (typeof req.body === 'object' && req.body) ? req.body : {};
    if (!keyOk(req.get('x-key') || body.key, INSTAPAY_SMS_KEY.value())) return res.status(403).json({ ok: false });
    const text = String(body.text || '').slice(0, 2000);
    const sender = String(body.sender || '').slice(0, 80);
    const sms = parseCibSms(text);
    if (!sms) {
      // 🩺 رسالة وصلت ومقدرناش نقراها — بتتسجل (عشان نعرف ليه) من غير ما تأكد أي حاجة
      if (text.trim().length >= 10) {
        const rid = crypto.createHash('sha256').update(text).digest('hex').slice(0, 40);
        await db().collection('instapay_sms').doc(rid).set({ text, receivedAt: Date.now(), status: 'unreadable' }, { merge: true });
      }
      return res.json({ ok: true, ignored: true });
    }
    // مقدرناش نقرا الوقت من الرسالة → وقت وصولها (الرسالة بتوصل بعد التحويل بثواني)
    if (!sms.at) { sms.at = Date.now(); sms.atFromReceived = true; }
    const smsId = crypto.createHash('sha256').update(text).digest('hex').slice(0, 40);
    if (!senderOk(sender)) {
      // 🔴 مش من CIB → بتتسجل للمراجعة بس (ومعاها المرسل) — مبتتطابقش مع أي طلب أو فاتورة
      await db().collection('instapay_sms').doc('x_' + smsId).set({ ...sms, text, sender, receivedAt: Date.now(), status: 'untrusted_sender' }, { merge: true });
      await db().collection('pos_activity_log').add({ type: 'instapay_sms_untrusted', sender, amountCents: sms.amountCents, ts: Date.now() });
      return res.json({ ok: true, untrusted: true });
    }
    const ref = db().collection('instapay_sms').doc(smsId);
    const created = await db().runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return false;                    // نفس الرسالة وصلت مرتين
      tx.create(ref, { ...sms, text, sender, receivedAt: Date.now(), status: sms.direction === 'in' ? 'new' : 'outgoing' });
      return true;
    });
    if (!created) return res.json({ ok: true, duplicate: true });
    if (sms.direction !== 'in') return res.json({ ok: true, status: 'outgoing' });
    const status = await tryMatch(smsId, sms);
    try { await tryInvoicesForSms(smsId, sms); } catch (e) { console.error('invoice link', e); }
    return res.json({ ok: true, status });
  } catch (e) {
    console.error('instapaySmsIngest', e);
    return res.status(200).json({ ok: false });                           // 200: الأتمتة متعيدش بلا نهاية
  }
});

exports.instapayBankWatch = onSchedule({ region: REGION, schedule: 'every 10 minutes', timeZone: 'Africa/Cairo', memory: '256MiB' }, async () => {
  const now = Date.now();
  // 1) رسايل وصلت قبل ما الطلب يتقبل → نجرّب تاني
  // آخر 3 ساعات بس (مدى على حقل واحد) — الرسايل القديمة اللي مالهاش طلب مبتتقريش كل 10 دقايق
  const late = await db().collection('instapay_sms').where('receivedAt', '>=', now - 3 * 3600000).get();
  for (const d of late.docs) {
    const s = d.data();
    if (s.status === 'unmatched' && s.direction === 'in') await tryMatch(d.id, s);
  }
  // 1ب) فواتير إنستاباي (كل الفروع) عدّت عليها نص ساعة من غير رسالة → تنبيه
  const invQ = await db().collection('instapay_invoices').where('createdAt', '>=', now - 24 * 3600000).get();
  for (const d of invQ.docs) {
    const v = d.data();
    if (v.status !== 'pending' || v.createdAt > now - MISSING_AFTER_MIN * 60000) continue;
    await d.ref.update({ status: 'bank_missing', missingAt: now });
    await db().collection('pos_activity_log').add({
      type: 'instapay_invoice_bank_missing', branch: v.branch || '', invoiceCode: v.invoiceCode || '',
      amountCents: v.amountCents || 0, employeeName: v.cashier || '', saleId: d.id, ts: now,
    });
  }

  // 2) طلبات اتقبلت ومفيش رسالة بنك
  const q = await db().collection('finance_sessions').where('bankState', '==', PENDING).get();
  for (const d of q.docs) {
    const s = d.data() || {};
    if (!DONE.includes(s.status) || !s.approvedAt || s.approvedAt > now - MISSING_AFTER_MIN * 60000) continue;
    await d.ref.update({ bankState: MISSING, bankMissingAt: now });
    if (s.status === 'finalized') continue;              // الفاتورة اتحفظت — تنبيه الفاتورة (1ب) كفاية، من غير تكرار
    await db().collection('pos_activity_log').add({
      type: 'instapay_bank_missing', branch: s.branch || '', sid: d.id, amountCents: s.amountCents || 0,
      approvedAt: s.approvedAt, cashierEmail: s.cashierEmail || '', ts: now,
    });
  }
});
