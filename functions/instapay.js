/* ============================================================
   📱 instapay.js — إنستاباي على تابلت الفرع (السيرفر)
   ------------------------------------------------------------
   بيتحط في: C:\Users\Mahmo\echarpe-push\functions\
   النشر:
     firebase deploy --only functions:instaPay,functions:instaScan

   ⚠️⚠️ ليه **دالتين بس** مش ١٣؟
      النسخة القديمة كانت ١٣ دالة في instaEvidence + ١٦ في
      financeCheckout. الـ٢٩ دول عدّوا حد الـCPU للمشروع، والنشر
      فشل بـ "Quota exceeded for total allowable CPU per project
      per region" — ووقع معاهم الأساسي: onlineOrderPlace و
      paymobWebhook و rateVisitPush و hijabTryOn.
      كل دالة = خدمة Cloud Run مستقلة بتاخد من نفس الحصة، فالعدد
      نفسه هو المشكلة مش الكود. عشان كده كل الأوامر هنا جوّه
      `instaPay` بـ action، والصور لوحدها في `instaScan` لأنها
      محتاجة ذاكرة أكبر.
      🔴 ممنوع تتقسم لدوال أكتر. لو احتجت أمر جديد، ضيفه كـaction.

   🔒 المبدأ: التابلت والتطبيقات **مبيكتبوش** جلسة ولا مبلغ ولا
      موافقة. كله بيتكتب من هنا بصلاحية الأدمن. القواعد بتمنع
      الكتابة المباشرة على finance_sessions و insta_live.
   ============================================================ */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { GoogleAuth } = require('google-auth-library');
const crypto = require('crypto');
const core = require('./instapayCore');

const REGION = 'us-central1';
const db = () => getFirestore();

// 🕐 كل التوقيتات بتوقيت القاهرة — الإيصال بيطبع بساعة تليفون
//    العميلة، والسيرفر شغال UTC. المقارنة بين الاتنين من غير
//    تحويل بتفرّق ٣ ساعات = كل إيصال يترفض.
const TZ = 'Africa/Cairo';
function cairoCivilMinutes(ms) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date(ms));
  const g = k => Number(f.find(p => p.type === k).value);
  let hh = g('hour'); if (hh === 24) hh = 0;
  return core.civilMinutes({ y: g('year'), m: g('month'), d: g('day'), hh, mm: g('minute') });
}

const money = c => (Math.round(Number(c) || 0) / 100).toFixed(2) + ' ج.م';
const fmt = arr => (arr && arr.length) ? arr.map(money).join(' أو ') : 'مبلغ مش مقروء';
function drift(d) {
  if (d == null) return 'تاريخ مش مقروء';
  const m = Math.round(d);
  const a = Math.abs(m);
  const word = (m < 0) ? 'قبل الطلب' : 'بعد الطلب';
  if (a < 90) return a + ' دقيقة ' + word;
  const h = Math.round(a / 60);
  return (h < 48) ? (h + ' ساعة ' + word) : (Math.round(h / 24) + ' يوم ' + word);
}

const sessionRef = sid => db().collection('finance_sessions').doc(String(sid));
const liveRef    = br  => db().collection('insta_live').doc(String(br));
const refRef     = r   => db().collection('instapay_references').doc(String(r));
const cfgRef     = br  => db().collection('pos_test_settings').doc('instapay_' + String(br));
// 📊 عدّاد صور الشهر (مستند واحد) — بيتقرا في Office كمان عشان تشوف
//    استهلاكك من غير ما تفتح فاتورة Google.
const monthKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' })
  .format(new Date()).slice(0, 7);
const scanCountRef = mk => db().collection('finance_sessions').doc('_scan_count_' + mk);

// 🔐 الكاشير = دخول بإيميل وباسورد. التابلت = دخول مجهول.
//    الاتنين مش نفس الصلاحية وممنوع يتخلطوا.
function requireStaff(req) {
  const a = req.auth;
  if (!a) throw new HttpsError('unauthenticated', 'افتحي الكاشير الأول');
  const p = a.token && a.token.firebase && a.token.firebase.sign_in_provider;
  if (p !== 'password') throw new HttpsError('permission-denied', 'حساب موظفين مطلوب');
  return { uid: a.uid, email: a.token.email || '' };
}
function requireSignedIn(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'مفيش جلسة');
  return req.auth.uid;
}
const branchOf = d => String((d && d.branch) || '').trim();

// 👁️ نسخة العرض اللي التابلت بيسمعها لايف.
//    ⚠️ فيها اللي التابلت محتاج يعرضه بس — مفيهاش uid الكاشير ولا
//    نص الإيصال ولا بصمات. التابلت قدام العميلة.
/* 🔢 مبلغ الطلب: مبلغ الفاتورة بالظبط — إلا لو فيه طلب مفتوح/مستني البنك بنفس المبلغ في آخر 25 دقيقة
   (كل الفروع): ساعتها المطلوب − (1..99 قرش) مش متكرر. مدى على حقل واحد (startedAt). */
async function pickPayAmount(requestedCents, now) {
  if (!(requestedCents >= 200)) return requestedCents;
  const used = new Set();
  try {
    const q = await db().collection('finance_sessions').where('startedAt', '>=', now - 25 * 60 * 1000).get();
    q.forEach((d) => {
      const x = d.data() || {};
      const live = ['waiting', 'scanning'].includes(x.status)
        || (['approved', 'finalized'].includes(x.status) && x.bankState !== 'BANK_CONFIRMED');
      if (!live) return;
      if (x.amountCents) used.add(x.amountCents);
      if (x.requestedCents) used.add(x.requestedCents);
    });
  } catch (e) { console.warn('pay amount scan', e && e.message); return requestedCents; }
  if (!used.has(requestedCents)) return requestedCents;                  // الحالة العادية: مفيش تصادم
  const ks = Array.from({ length: 99 }, (_, i) => i + 1);
  for (let i = ks.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [ks[i], ks[j]] = [ks[j], ks[i]]; }
  for (const k of ks) if (!used.has(requestedCents - k)) return requestedCents - k;
  return requestedCents;
}

function livePayload(sid, s) {
  return {
    sid, status: s.status, branch: s.branch,
    amountCents: s.amountCents, requestedCents: s.requestedCents || s.amountCents, alias: s.alias,
    aliases: s.aliases || [],   // 📇 التابلت بيعرض الأرقام الإضافية تحت العنوان
    beneficiary: s.beneficiary || '',
    startedAt: s.startedAt, scans: s.scans || 0,
    checks: s.checks || null, hint: s.hint || '',
    updatedAt: Date.now()
  };
}

/* ============================================================
   1️⃣ instaPay — كل أوامر المسار ماعدا الصور
   ============================================================ */
exports.instaPay = onCall({ region: REGION, memory: '256MiB' }, async (req) => {
  const d = req.data || {};
  const action = String(d.action || '');

  /* ── start: الكاشير اختار إنستاباي ودوس OK ─────────────── */
  if (action === 'start') {
    const who = requireStaff(req);
    const branch = branchOf(d);
    const requestedCents = Math.round(Number(d.amountCents) || 0);
    const amountCents = requestedCents;
    if (!branch) throw new HttpsError('invalid-argument', 'الفرع ناقص');
    if (!(amountCents > 0)) throw new HttpsError('invalid-argument', 'المبلغ غلط');

    const cfg = (await cfgRef(branch).get()).data() || {};
    // 🏬 التشغيل **لكل فرع على حدة**. مش كل الفروع عندها تابلت،
    //    والفرع اللي مفيهوش تابلت لازم يقول "مش مفعّل" بدل ما يفتح
    //    طلب معلّق العميلة واقفة قدامه.
    if (cfg.enabled === false)
      throw new HttpsError('failed-precondition', 'إنستاباي مش مفعّل في الفرع ده');
    const aliases = [cfg.alias, ...(cfg.extraAliases || [])].filter(Boolean);
    // 🔴 من غير عنوان متسجّل مفيش تحقق من المستفيد أصلًا — فمنعناها
    //    من البداية بدل ما نكتشف بعدين إن كل إيصال بيعدّي.
    if (!aliases.length)
      throw new HttpsError('failed-precondition', 'الفرع مفيهوش عنوان إنستاباي — ارفعه من الإعدادات');
    if (!cfg.qr)
      throw new HttpsError('failed-precondition', 'الفرع مفيهوش QR — ارفعه من الإعدادات');

    const sid = crypto.randomUUID();
    const now = Date.now();
    // 🔢 27-09 (طلب المالك): المبلغ = مبلغ الفاتورة بالظبط. **بس** لو فيه طلب تاني مفتوح بنفس
    //    المبلغ (أي فرع — كله على حساب CIB واحد) الطلب الجديد بياخد قروش مختلفة (خصم صغير)
    //    عشان رسالة البنك تتربط بطلبها من غير لخبطة.
    const payCents = await pickPayAmount(requestedCents, now);
    const s = {
      sid, branch, amountCents: payCents, requestedCents, fingerprintCents: requestedCents - payCents,
      alias: cfg.alias, aliases,
      beneficiary: String(cfg.beneficiary || ''),
      windowMin: Math.max(1, Number(cfg.windowMin) || 5),
      maxScans: Math.max(3, Number(cfg.maxScans) || 8),
      monthlyScanCap: (cfg.monthlyScanCap != null) ? Number(cfg.monthlyScanCap) : 1000,
      status: 'waiting', scans: 0,
      cashierUid: who.uid, cashierEmail: who.email,
      startedAt: now, startedCivilMin: cairoCivilMinutes(now),
      expiresAt: now + 20 * 60 * 1000
    };
    await sessionRef(sid).set(s);
    // 🔁 طلب جديد بيلغي القديم على نفس التابلت — من غير كده التابلت
    //    يفضل عارض مبلغ فاتورة خلصت.
    await liveRef(branch).set(livePayload(sid, s));
    return { sid, qr: cfg.qr, alias: cfg.alias, beneficiary: s.beneficiary, amountCents: payCents, requestedCents };
  }

  /* ── status: POS بيسأل وصلنا لفين ──────────────────────── */
  if (action === 'status') {
    requireStaff(req);
    const s = (await sessionRef(d.sid).get()).data();
    if (!s) throw new HttpsError('not-found', 'الطلب مش موجود');
    return {
      status: s.status, checks: s.checks || null, scans: s.scans || 0,
      amountCents: s.amountCents, reference: s.reference || null,
      photoAt: s.photoAt || null, hint: s.hint || '',
      approvedBy: s.approvedBy || null, mode: s.mode || null
    };
  }

  /* ── ready: العميلة دوست «تم التحويل» على التابلت ───────── */
  if (action === 'ready') {
    requireSignedIn(req);
    const sid = String(d.sid || '');
    await db().runTransaction(async tx => {
      const snap = await tx.get(sessionRef(sid));
      const s = snap.data();
      if (!s) throw new HttpsError('not-found', 'الطلب مش موجود');
      if (s.status !== 'waiting' && s.status !== 'scanning')
        throw new HttpsError('failed-precondition', 'الطلب اتقفل');
      tx.update(sessionRef(sid), { status: 'scanning', hint: '' });
      tx.set(liveRef(s.branch), livePayload(sid, { ...s, status: 'scanning', hint: '' }));
    });
    return { ok: true };
  }

  /* ── cancel: الكاشير رجع أو غيّر طريقة الدفع ────────────── */
  if (action === 'cancel') {
    requireStaff(req);
    const sid = String(d.sid || '');
    const snap = await sessionRef(sid).get();
    const s = snap.data();
    if (!s) return { ok: true };
    // 🔒 المعتمد ما بيتلغيش — وإلا نلغي عملية العميلة حوّلت فيها فعلًا.
    if (s.status === 'approved' || s.status === 'finalized')
      throw new HttpsError('failed-precondition', 'التحويل اتأكد خلاص');
    await sessionRef(sid).update({ status: 'cancelled', cancelledAt: Date.now() });
    const cur = (await liveRef(s.branch).get()).data();
    if (cur && cur.sid === sid) await liveRef(s.branch).delete();
    return { ok: true };
  }

  /* ── approveManual: التأكيد اليدوي ──────────────────────
     لو القراءة وقعت (كاميرا وحشة، إيصال مقصوص، النت قاطع)،
     الكاشير بتبص بعينها وتدوس تأكيد.
     ⚠️ ده **مش** نفس الاعتماد التلقائي: بيتسجّل باسم الكاشير
        وبعلامة mode:'manual' عشان تقدر تراجعهم في Office وتعرف
        مين اعتمد إيه من غير قراءة. */
  if (action === 'approveManual') {
    const who = requireStaff(req);
    const sid = String(d.sid || '');
    const reason = String(d.reason || '').slice(0, 120);
    return db().runTransaction(async tx => {
      const snap = await tx.get(sessionRef(sid));
      const s = snap.data();
      if (!s) throw new HttpsError('not-found', 'الطلب مش موجود');
      if (s.status === 'finalized') throw new HttpsError('failed-precondition', 'الفاتورة اتحفظت');
      if (s.status === 'cancelled') throw new HttpsError('failed-precondition', 'الطلب ملغي');
      if (s.status === 'approved') return { ok: true, already: true, mode: s.mode };
      tx.update(sessionRef(sid), {
        status: 'approved', mode: 'manual',
        approvedBy: who.uid, approvedEmail: who.email, approvedAt: Date.now(),
        manualReason: reason,
        // 🏦 اعتماد يدوي ≠ البنك أكّد. بيفضل محتاج مراجعة كشف الحساب.
        bankState: 'PENDING_BANK_RECONCILIATION'
      });
      tx.set(liveRef(s.branch), livePayload(sid, { ...s, status: 'approved' }));
      return { ok: true, mode: 'manual' };
    });
  }

  /* ── finalize: POS حفظ الفاتورة ─────────────────────────
     هنا بنحجز الرقم المرجعي عشان نفس الإيصال ميتقبلش مرتين. */
  if (action === 'finalize') {
    const who = requireStaff(req);
    const sid = String(d.sid || '');
    const invoiceCode = String(d.invoiceCode || '').slice(0, 64);
    if (!invoiceCode) throw new HttpsError('invalid-argument', 'رقم الفاتورة ناقص');
    return db().runTransaction(async tx => {
      const snap = await tx.get(sessionRef(sid));
      const s = snap.data();
      if (!s) throw new HttpsError('not-found', 'الطلب مش موجود');
      // 🔁 الضغط مرتين على حفظ = نفس النتيجة، مش فاتورتين
      if (s.status === 'finalized') return { ok: true, already: true, invoiceCode: s.invoiceCode };
      if (s.status !== 'approved') throw new HttpsError('failed-precondition', 'التحويل لسه ماتأكدش');

      if (s.reference) {
        const rr = refRef(s.reference);
        const prev = await tx.get(rr);
        // 🔴 نفس الرقم المرجعي مرتين = نفس التحويل اتحسب على فاتورتين
        if (prev.exists && prev.data().sid !== sid)
          throw new HttpsError('failed-precondition', 'الإيصال ده اتستخدم قبل كده');
        tx.set(rr, {
          sid, branch: s.branch, invoiceCode,
          amountCents: s.amountCents, at: Date.now(), by: who.uid
        });
      }
      tx.update(sessionRef(sid), {
        status: 'finalized', invoiceCode, finalizedAt: Date.now(), finalizedBy: who.uid
      });
      tx.delete(liveRef(s.branch));
      return { ok: true, invoiceCode, mode: s.mode || null, reference: s.reference || null };
    });
  }

  throw new HttpsError('invalid-argument', 'أمر غير معروف');
});

/* ============================================================
   2️⃣ instaScan — فريم من كاميرا التابلت → Cloud Vision → مطابقة
   ------------------------------------------------------------
   ⚠️ ذاكرة أكبر لأن الصورة بتتفك base64 في الرام.
   ⚠️ سقف عدد الفريمات لكل جلسة: كل نداء عليه تكلفة عند Google،
      ومن غير سقف أي حد فاتح التابلت يقدر يحرق الرصيد.
   ============================================================ */
const visionAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-vision'] });

async function readTextFromImage(b64) {
  const client = await visionAuth.getClient();
  const res = await client.request({
    url: 'https://vision.googleapis.com/v1/images:annotate',
    method: 'POST',
    data: {
      requests: [{
        image: { content: b64 },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        imageContext: { languageHints: ['ar', 'en'] }
      }]
    }
  });
  const r = (res.data.responses && res.data.responses[0]) || {};
  if (r.error) throw Error(r.error.message || 'VISION_ERROR');
  return (r.fullTextAnnotation && r.fullTextAnnotation.text) || '';
}

exports.instaScan = onCall({ region: REGION, memory: '512MiB', timeoutSeconds: 30 }, async (req) => {
  requireSignedIn(req);
  const d = req.data || {};
  const sid = String(d.sid || '');
  const b64 = String(d.image || '');
  if (!sid) throw new HttpsError('invalid-argument', 'الطلب ناقص');
  if (!b64 || b64.length < 1000) throw new HttpsError('invalid-argument', 'الصورة ناقصة');
  // ~2.7MB بعد base64 — أكبر من كده يبقى مش فريم كاميرا
  if (b64.length > 3600000) throw new HttpsError('invalid-argument', 'الصورة كبيرة');

  // 1) نحجز محاولة قبل ما ندفع تكلفة Vision
  const s = await db().runTransaction(async tx => {
    const snap = await tx.get(sessionRef(sid));
    const cur = snap.data();
    if (!cur) throw new HttpsError('not-found', 'الطلب مش موجود');
    // 'rejected' مسموح يتعاد منه: العميلة ممكن تكون وّرت إيصال
    // غلط وعندها الصح. اللي مبيرجعش هو approved/finalized/cancelled.
    if (cur.status !== 'scanning' && cur.status !== 'waiting' && cur.status !== 'rejected')
      throw new HttpsError('failed-precondition', 'الطلب اتقفل');
    if (Date.now() > (cur.expiresAt || 0))
      throw new HttpsError('deadline-exceeded', 'الطلب انتهت مدته');
    const scans = (cur.scans || 0) + 1;
    if (scans > (cur.maxScans || 8))
      throw new HttpsError('resource-exhausted', 'خلصت محاولات القراءة — أكّدي يدوي');

    // 💰 سقف شهري للقراءة الآلية — ضمانة إن الفاتورة عمرها ما تفاجئك.
    //    Vision أول ١٠٠٠ صورة في الشهر ببلاش وبعدها ~٧ قروش للصورة.
    //    لما العدّاد يوصل السقف، إنستاباي **مبيقفش** — بيكمّل تأكيد
    //    يدوي بس. يعني أسوأ حالة = شغل عادي، مش فرع واقف.
    const mk = monthKey();
    const cntSnap = await tx.get(scanCountRef(mk));
    const used = (cntSnap.data() || {}).count || 0;
    const cap = Number((cur.monthlyScanCap != null) ? cur.monthlyScanCap : 1000);
    if (cap > 0 && used >= cap)
      throw new HttpsError('resource-exhausted', 'وصلنا سقف القراءة الشهري — أكّدي يدوي');
    tx.set(scanCountRef(mk), { count: used + 1, updatedAt: Date.now() }, { merge: true });

    tx.update(sessionRef(sid), { scans, status: 'scanning' });
    return { ...cur, scans };
  });

  // 2) القراءة
  let text = '', err = '';
  try { text = await readTextFromImage(b64); }
  catch (e) { err = String((e && e.message) || e).slice(0, 160); }
  if (err) return { ok: false, error: 'READ_FAILED', detail: err, scans: s.scans };

  // 3) المطابقة (منطق خام متختبر في instapayCore)
  const _insOpts = (cents) => ({
    amountCents: cents,
    windowMin: s.windowMin || 5,
    startedCivilMin: s.startedCivilMin,
    aliases: s.aliases || [s.alias]
  });
  let v0 = core.inspectReceipt(text, _insOpts(s.amountCents));
  // 🔢 الطلب ده خد قروش بصمة والعميلة حوّلت مبلغ الفاتورة الكامل (755 بدل 754.63) = مقبول، دفعت قروش زيادة
  if (!(v0.checks && v0.checks.amount) && s.requestedCents && s.requestedCents !== s.amountCents) {
    const vFull = core.inspectReceipt(text, _insOpts(s.requestedCents));
    if (vFull.checks && vFull.checks.amount) v0 = vFull;
  }

  /* ============================================================
     🧩 تجميع الحقول عبر الفريمات
     ------------------------------------------------------------
     قبل كده كل فريم كان بيبدأ من الصفر: يقرا المبلغ ويضيّع الرقم
     المرجعي، والفريم اللي بعده يرمي المبلغ ويعيد. فالعميلة تفضل
     واقفة والشاشة تفضل "بتقرا".
     دلوقتي أي حقل بيتقرا **بيتقفل** وميترجعش يتقرا تاني.

     🔒 الأمان: التجميع مربوط بالرقم المرجعي. لو ظهر رقم مختلف،
        يبقى ده إيصال تاني وكل اللي اتجمّع بيتمسح — وإلا حد يوري
        إيصال فيه المبلغ الصح وإيصال تاني فيه رقم عملية ويعدّي.
     ============================================================ */
  const prevLock = s.locked || {};
  const sameReceipt = !v0.reference || !prevLock.reference || prevLock.reference === v0.reference;
  const base = sameReceipt ? prevLock : {};   // رقم جديد = نبدأ من الأول

  const locked = {
    reference: v0.reference || base.reference || null,
    success:   !!(v0.checks.success   || base.success),
    amount:    !!(v0.checks.amount    || base.amount),
    time:      !!(v0.checks.time      || base.time),
    beneficiary: !!(v0.checks.beneficiary || base.beneficiary),
    // القيم اللي اتقرت — عشان الشاشة توري الرقم مش كلمة
    seenCents: (v0.amountsSeen && v0.amountsSeen.length) ? v0.amountsSeen : (base.seenCents || []),
    driftMin: (v0.driftMin != null) ? Math.round(v0.driftMin) : (base.driftMin != null ? base.driftMin : null)
  };
  // 🔴 إيصال فاشل بيلغي كل حاجة فورًا — مفيش تجميع على إيصال مش ناجح
  if (v0.checks.failed) { locked.success = false; locked.amount = false; locked.time = false; locked.beneficiary = false; }

  const v = {
    checks: {
      success: locked.success, failed: v0.checks.failed,
      amount: locked.amount, time: locked.time,
      beneficiary: locked.beneficiary, reference: !!locked.reference
    },
    reference: locked.reference,
    amountsSeen: locked.seenCents,
    driftMin: locked.driftMin,
    receiptTime: v0.receiptTime,
    beneficiaryReason: v0.beneficiaryReason,
    ok: locked.success && locked.amount && locked.time && locked.beneficiary && !!locked.reference && !v0.checks.failed
  };

  // 4) بصمة الصورة — نفس الملف حرفيًا ميتقبلش مرتين
  const photoHash = crypto.createHash('sha256').update(b64).digest('hex');

  // 🩺 النص الخام بيتخزّن مع **كل** محاولة مش بس الناجحة.
  //    السبب: أول تجربة في الفرع الرفض كان صح (مبلغ مختلف، تحويل
  //    صادر، إيصال قديم) بس محدش قدر يثبت ده — الشاشة كانت بتقول
  //    "المبلغ مختلف" وبس. من غير النص الخام أي خلاف بعد كده
  //    بيتحسم بالتخمين.
  const update = {
    checks: v.checks, lastScanAt: Date.now(), photoHash,
    lastText: String(text).slice(0, 4000),
    locked: locked,
    detail: {
      expectedCents: s.amountCents,
      seenCents: v.amountsSeen || [],
      driftMin: (v.driftMin == null) ? null : Math.round(v.driftMin),
      benReason: v.beneficiaryReason || null,
      benSawTo: !!v.beneficiarySawTo,
      benSeen: v.beneficiarySeen || [],
      benAliases: (s.aliases || []).length,
      ref: v.reference || null
    },
    // 📣 الرسالة لازم تقول **الرقم**. "المبلغ مختلف" من غير أرقام
    //    بتخلي الرفض الصح شكله عطل.
    hint: v.checks.failed ? 'الإيصال مش ناجح'
        : (v.beneficiaryReason === 'ALIAS_NEAR') ? 'رقم المستفيد مش واضح — قرّبي الإيصال'
        : !v.checks.success ? 'قرّبي الإيصال شوية'
        : (v.beneficiaryReason === 'ALIAS_IS_SENDER') ? 'ده تحويل صادر منك مش وارد للفرع'
        : !v.checks.beneficiary ? ('التحويل مش للفرع' + (s.alias ? ' — المفروض لـ' + s.alias : ''))
        : !v.checks.amount ? ('الإيصال ' + fmt(v.amountsSeen) + ' والمطلوب ' + money(s.amountCents))
        : !v.checks.time ? ('الإيصال من ' + drift(v.driftMin))
        : !v.checks.reference ? 'الرقم المرجعي مش واضح' : ''
  };
  if (v.reference) update.reference = v.reference;
  if (v.receiptTime) update.receiptTime = v.receiptTime;

  /* ⛔ رفض نهائي مقابل رفض مؤقت.
     ⚠️ كان النظام بيعامل الاتنين بنفس الطريقة: يفضل يصوّر لحد ما
        المحاولات تخلص، وهو عارف من أول لقطة إن المبلغ مختلف.
        العميلة بتقف مستنية بلا فايدة والكاشير مش فاهمة.
     • نهائي = حاجة في الإيصال نفسه مش هتتغير مهما صوّرنا تاني:
       مبلغ مقروء وواضح ومختلف · تحويل صادر منك · مستفيد تاني ·
       إيصال من يوم فات · إيصال فشل.
     • مؤقت = ضبابية أو قص أو صورة مقلوبة → نكمّل محاولات.
     الشرط الأساسي: منرفضش نهائي إلا لو **قرينا** الحقل فعلًا. */
  let fatal = null;
  if (v.checks.failed) fatal = 'الإيصال ده مش ناجح';
  else if (v.beneficiaryReason === 'ALIAS_IS_SENDER') fatal = 'ده تحويل صادر منك مش وارد للفرع';
  /* ⚠️ "المستفيد مختلف" نهائي **بس** لو قرينا إيصال فعلًا.
     بعد ما النجاح بقى = غياب الفشل، صورة فاضية أو مقلوبة بقت
     "ناجحة" تقنيًا (مفيش كلمة فشل فيها) — ولو اكتفينا بالشرط ده
     كانت أول صورة ضبابية هترفض الطلب نهائي. فبنطلب دليل إننا
     شفنا إيصال: رقم مرجعي أو مبلغ. */
  /* ⚠️ 23-09: الشرط زوّد عليه إننا نكون **شفنا سطر "إلى" فعلًا**.
     من غيره كانت لقطة اتقص منها سطر المستلم (أو الـOCR ضيّعه) بترفض التحويل نهائي
     بـ"المستفيد مختلف" — والعميلة تكون حوّلت فعلًا وصح. لو مشوفناش السطر بنكمّل محاولات. */
  /* ⚠️ 23-09: + لازم تكون دي **تاني لقطة** على الأقل. لقطة واحدة فيها قراية ناقصة
     كانت كفاية ترفض تحويل سليم نهائيًا — وده اللي كان بيحصل في الفرع. */
  else if (v.beneficiaryReason === 'ALIAS_NOT_FOUND' && v.beneficiarySawTo
        && (s.scans || 0) >= 2
        && (v.reference || (v.amountsSeen && v.amountsSeen.length)))
    fatal = 'التحويل مش للفرع — المستفيد مختلف'
          + ((v.beneficiarySeen && v.beneficiarySeen.length) ? ' — قرينا ' + v.beneficiarySeen[0] : '')
          + (s.alias ? ' (المفروض لـ' + s.alias + ')' : '');
  else if (v.amountsSeen && v.amountsSeen.length && !v.checks.amount)
    fatal = 'الإيصال ' + fmt(v.amountsSeen) + ' والمطلوب ' + money(s.amountCents);
  else if (v.receiptTime && v.driftMin != null && !v.checks.time && Math.abs(v.driftMin) > 120)
    fatal = 'الإيصال ' + drift(v.driftMin) + ' — مش بتاع الطلب ده';

  if (fatal && !v.ok) {
    update.status = 'rejected';
    update.hint = fatal;
    update.rejectedAt = Date.now();
    await sessionRef(sid).update(update);
    await liveRef(s.branch).set(livePayload(sid, { ...s, ...update, status: 'rejected' }));
    return { ok: false, fatal: true, hint: fatal, checks: v.checks, detail: update.detail,
             scans: s.scans, text: String(text).slice(0, 1200) };
  }

  if (v.ok) {
    // 🔒 فحص التكرار قبل الاعتماد، مش بعده
    const prev = await refRef(v.reference).get();
    if (prev.exists && prev.data().sid !== sid) {
      await sessionRef(sid).update({ ...update, hint: 'الإيصال ده اتستخدم قبل كده' });
      return { ok: false, error: 'DUPLICATE', checks: v.checks, scans: s.scans };
    }
    update.status = 'approved';
    update.mode = 'auto';
    update.approvedAt = Date.now();
    update.bankState = 'PENDING_BANK_RECONCILIATION';
    update.ocrText = String(text).slice(0, 4000);
  }

  await sessionRef(sid).update(update);
  await liveRef(s.branch).set(livePayload(sid, { ...s, ...update, status: update.status || 'scanning' }));

  return {
    ok: !!v.ok, checks: v.checks, reference: v.reference || null,
    hint: update.hint, scans: s.scans, remaining: (s.maxScans || 8) - s.scans,
    detail: update.detail,
    // 🩺 النص الخام بيرجع للكاشير بس (مش للتابلت) — عشان تشخيص
    //    فوري من غير ما حد يفتح Firestore.
    text: String(text).slice(0, 1200)
  };
});
