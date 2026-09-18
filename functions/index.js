// ============================================================================
//  إشعارات Push — Cloud Functions لنظام echarpe / Glow
// ----------------------------------------------------------------------------
//  بتشتغل تلقائيًا:
//  1) مكافأة جديدة اتبعتت لعميلة  → إشعار لموبايلها: "🎁 وصلتك مكافأة خاصة"
//  2) الكتالوج اتحدّث (منتج/عرض جديد) → إشعار لكل مشتركي البراند ده
//
//  الرفع (مرة واحدة) — الخطوات كاملة في PUSH-SETUP.md المرفق.
// ============================================================================

const { onDocumentUpdated, onDocumentWritten, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();

// أسماء البراندات زي ما هي في التطبيقات
const BRAND_NAMES = { echarpe: "echarpe 🌸", glow: "Glow 🖤" };

/* ============================================================
   🔑 قراءة التوكنات — الشكلين
   ------------------------------------------------------------
   ⚠️ الشكل القديم كان بيخزّن التوكن كـ**اسم حقل**:
        fcmTokens: { "<token>": { brand, ts } }
   وFirestore بيقرا أي نقطة جوه اسم الحقل كفاصل مسارات، فالتوكن كان
   بيتشرشح لمستويات متداخلة ويتخزن **مقطوع** → الإشعار مبيوصلش أبدًا.
   ده على الأرجح سبب إن 51 إشعار بس اتبعتوا من 208 فاتورة بعميلة مسجّلة.

   الشكل الجديد (loyalty v41 / glow v34): مصفوفة لكل براند
        fcmTokens_echarpe: ["tok1", "tok2"]
        fcmTokens_glow:    ["tok3"]
   البراند في **اسم الحقل** لأن arrayUnion بيدمج النصوص صح بس بيكرّر
   الكائنات لو أي حقل جواها اتغير.

   لازم نقرا الاتنين: العملاء القدام بياناتهم بالشكل القديم لحد ما
   يفتحوا التطبيق تاني، والجداد بالشكل الجديد.
   ============================================================ */
const TOKEN_FIELDS = { echarpe: "fcmTokens_echarpe", glow: "fcmTokens_glow" };

function readTokens(data, brand) {
  const d = data || {};
  const out = [];
  const brands = brand ? [brand] : Object.keys(TOKEN_FIELDS);
  // الجديد: مصفوفات
  brands.forEach((b) => {
    const arr = d[TOKEN_FIELDS[b]];
    if (Array.isArray(arr)) out.push(...arr);
  });
  // القديم: خريطة بمفاتيح توكنات
  const map = d.fcmTokens;
  if (map && typeof map === "object" && !Array.isArray(map)) {
    Object.keys(map).forEach((t) => {
      const meta = map[t];
      if (!meta) return;
      if (brand && meta.brand && meta.brand !== brand) return;
      out.push(t);
    });
  }
  // توكن FCM حقيقي أطول من 100 حرف — الفلتر ده بيرمي المقطوع القديم
  return [...new Set(out)].filter((t) => typeof t === "string" && t.length > 100);
}

// كل البراندات اللي العميلة مشتركة فيها (الشكلين)
function brandsOf(data) {
  const d = data || {};
  const set = new Set();
  Object.keys(TOKEN_FIELDS).forEach((b) => {
    const arr = d[TOKEN_FIELDS[b]];
    if (Array.isArray(arr) && arr.length) set.add(b);
  });
  const map = d.fcmTokens;
  if (map && typeof map === "object" && !Array.isArray(map)) {
    Object.values(map).forEach((m) => { if (m && m.brand) set.add(m.brand); });
  }
  return set;
}

// يبعت إشعار لقايمة توكنات، ويمسح الميّت منها من مستند العميلة
async function sendToTokens(tokens, title, body, tag, customerRef, link) {
  if (!tokens.length) return;
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: {
      notification: { title, body, dir: "rtl", lang: "ar", tag },
      fcmOptions: { link: link || "./" },
    },
  });
  // تنظيف التوكنات الميتة (جهاز اتغيّر/الإذن اتشال) عشان المستند ميكبرش ببلاش
  if (customerRef) {
    const dead = [];
    res.responses.forEach((r, i) => {
      if (!r.success && r.error && /registration-token|invalid-argument/i.test(r.error.code || "")) {
        dead.push(tokens[i]);
      }
    });
    if (dead.length) {
      const { FieldValue } = require("firebase-admin/firestore");
      const upd = {};
      // الجديد: شيل من المصفوفتين (arrayRemove مبيشتكيش لو مش موجود)
      Object.values(TOKEN_FIELDS).forEach((f) => {
        upd[f] = FieldValue.arrayRemove(...dead);
      });
      // القديم: امسح المفتاح نفسه
      dead.forEach((t) => (upd[`fcmTokens.${t}`] = FieldValue.delete()));
      await customerRef.update(upd).catch(() => {});
    }
  }
}

// ============ 1) مكافأة جديدة لعميلة ============
exports.onRewardAdded = onDocumentUpdated(
  { document: "pos_test_customers/{phone}", region: "europe-west1" },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    const oldRewards = Array.isArray(before.rewards) ? before.rewards : [];
    const newRewards = Array.isArray(after.rewards) ? after.rewards : [];
    if (newRewards.length <= oldRewards.length) return; // مفيش مكافأة جديدة

    // المكافآت المضافة دلوقتي بس
    const oldKeys = new Set(oldRewards.map((r) => r && (r.id || r.ts)));
    const added = newRewards.filter((r) => r && !oldKeys.has(r.id || r.ts));
    if (!added.length) return;

    for (const reward of added) {
      const brand = reward.brand || "echarpe";
      // توكنات نفس البراند بس (عميلة ممكن تكون مشتركة في التطبيقين)
      const tokens = readTokens(after, brand);
      if (!tokens.length) continue;
      const title = BRAND_NAMES[brand] || brand;
      const desc =
        reward.type === "percent"
          ? `خصم ${reward.value}%`
          : `خصم ${reward.value} ج.م`;
      await sendToTokens(
        tokens,
        title,
        `🎁 وصلتك مكافأة خاصة: ${desc} — مستنيينك!`,
        "reward",
        event.data.after.ref
      );
    }
  }
);

// ============ 3) مكافأة الترحيب — أول ما العميل يفعّل الإشعارات ============
// لما أول توكن لبراند معيّن يتسجّل على مستند العميل، والبرنامج مفعّل من
// شاشة برنامج الولاء في الكاشير → نمنح المكافأة (مرة واحدة لكل رقم/براند).
// إشعار "🎁 وصلتك مكافأة" بيتبعت تلقائيًا من onRewardAdded فوق (لنوع الخصم).
exports.onWelcomeToken = onDocumentUpdated(
  { document: "pos_test_customers/{phone}", region: "europe-west1" },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};

    // v377: reconciliation بدل الاعتماد على لحظة إضافة التوكن فقط.
    // لو FCM اتسجل لكن الـFunction وقعت مؤقتًا قبل منح الهدية، أي update لاحق
    // (ومن ضمنه fcmTokenAt من التطبيق) يعيد المحاولة. welcomeGranted_<brand>
    // هو الحارس الحقيقي ضد منح الهدية مرتين.
    const eligibleBrands = [...brandsOf(after)].filter((brand) =>
      readTokens(after, brand).length > 0 && !after["welcomeGranted_" + brand]
    );
    if (!eligibleBrands.length) return;

    const settingsSnap = await db.collection("pos_test_settings").doc("loyalty").get();
    const welcome = settingsSnap.exists ? settingsSnap.data().welcome || {} : {};
    const { FieldValue } = require("firebase-admin/firestore");
    const ref = event.data.after.ref;

    // 👩‍💼 عمولة الموظفة — مستقلة عن هدية العميلة.
    for (const brand of eligibleBrands) {
      try {
        if (after["referralGranted_" + brand]) continue;
        const src = String(after.source || "");
        const m = src.match(/_app:emp-([A-Za-z0-9_-]+)/);
        if (!m) continue;
        const empId = m[1];
        const rcfg = welcome[brand] || {};
        const bonus = Number(rcfg.refBonus) || 0;
        if (bonus <= 0) continue;
        let empName = "", empBranch = "";
        try {
          const empDoc = await db.collection("sales_employees").doc(empId).get();
          if (empDoc.exists) { empName = empDoc.data().name || ""; empBranch = empDoc.data().branch || ""; }
        } catch (e) {}
        await db.collection("sales_app_referrals").add({
          employeeId: empId, employeeName: empName, branch: empBranch,
          brand, customerPhone: event.params.phone, amount: bonus, ts: Date.now(),
          status: "pending_purchase",
        });
        await ref.update({ ["referralGranted_" + brand]: Date.now() });
      } catch (e) { console.error("referral bonus", e); }
    }

    for (const brand of eligibleBrands) {
      const cfg = welcome[brand];
      if (!cfg || !cfg.enabled || !(Number(cfg.value) > 0)) continue;

      // المنح + marker في transaction واحدة: retry/concurrent triggers لا يكرروا الـ20 جنيه.
      const granted = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return false;
        const current = snap.data() || {};
        if (current["welcomeGranted_" + brand]) return false;
        if (!readTokens(current, brand).length) return false;

        const mark = Date.now();
        if (cfg.type === "points") {
          const field = brand === "glow" ? "points_glow" : "points";
          tx.update(ref, {
            [field]: FieldValue.increment(Number(cfg.value)),
            ["welcomeGranted_" + brand]: mark,
          });
        } else {
          const reward = {
            id: "wl" + mark.toString(36),
            type: "fixed",
            value: Number(cfg.value),
            minInvoice: Number(cfg.minInvoice) || 0,
            expiry: mark + (Number(cfg.days) || 30) * 86400000,
            used: false,
            brand: brand,
            welcome: true,
            ts: mark,
          };
          tx.update(ref, {
            rewards: FieldValue.arrayUnion(reward),
            ["welcomeGranted_" + brand]: mark,
          });
        }
        return true;
      });

      if (!granted) continue;

      // إرسال الإشعار best-effort بعد تسجيل المكافأة؛ فشل FCM لا يلغي الهدية.
      if (cfg.type === "points") {
        const tokens = readTokens(after, brand);
        await sendToTokens(
          tokens,
          BRAND_NAMES[brand] || brand,
          `👋 أهلًا بيكي! كسبتي ${Number(cfg.value)} نقطة هدية الترحيب 🎁`,
          "welcome",
          ref
        ).catch((e) => console.warn("welcome push", brand, e && e.message || e));
      }
      // fixed reward: onRewardAdded يرسل إشعار المكافأة تلقائيًا.
    }
  }
);

// ============ 2) الكتالوج اتحدّث (منتجات/عروض جديدة) ============
exports.onCatalogUpdated = onDocumentWritten(
  { document: "pos_test_settings/{docId}", region: "europe-west1" },
  async (event) => {
    const docId = event.params.docId;
    const m = docId.match(/^catalog_(echarpe|glow)$/);
    if (!m) return;
    const brand = m[1];

    const before = event.data.before.exists ? event.data.before.data() : {};
    const after = event.data.after.exists ? event.data.after.data() : {};
    const oldCount = Array.isArray(before.items) ? before.items.length : 0;
    const newCount = Array.isArray(after.items) ? after.items.length : 0;
    if (newCount <= oldCount) return; // إشعار بس لما يزيد منتج جديد (مش تعديل/مسح)

    // كل العملاء اللي عندهم توكنات للبراند ده
    // (استعلام واحد على المستندات اللي فيها fcmTokens — بنفلتر البراند في الكود)
    /* ⚠️ استعلامين لازم: العملاء القدام عندهم `fcmTokens` (خريطة) والجداد
       عندهم `fcmTokens_<brand>` (مصفوفة). استعلام واحد على الحقل القديم
       بس كان معناه إن كل عميلة فتحت التطبيق بعد التحديث **تختفي** من
       إشعارات الكتالوج تمامًا. */
    const field = TOKEN_FIELDS[brand] || TOKEN_FIELDS.echarpe;
    const [snapNew, snapOld] = await Promise.all([
      db.collection("pos_test_customers").where(field, "!=", null).get(),
      db.collection("pos_test_customers").where("fcmTokens", "!=", null).get(),
    ]);
    const seen = new Set();
    const docs = [];
    [...snapNew.docs, ...snapOld.docs].forEach((d) => {
      if (seen.has(d.id)) return;          // العميلة ممكن تطلع في الاتنين
      seen.add(d.id);
      docs.push(d);
    });
    const snap = { docs };
    const title = BRAND_NAMES[brand] || brand;
    const body = "✨ وصل جديد! افتحي «آخر العروض» وشوفي بنفسك";

    let batchTokens = [];
    for (const doc of snap.docs) {
      const tokens = readTokens(doc.data(), brand);
      batchTokens.push(...tokens);
      // FCM بيسمح بـ 500 توكن للدفعة — نبعت على دفعات
      while (batchTokens.length >= 500) {
        await sendToTokens(batchTokens.slice(0, 500), title, body, "catalog", null);
        batchTokens = batchTokens.slice(500);
      }
    }
    if (batchTokens.length) {
      await sendToTokens(batchTokens, title, body, "catalog", null);
    }
  }
);


// 🛒 تفعيل عمولة الموظفة عند أول فاتورة حقيقية للعميل المدعو
// (الحماية من التنزيلات الوهمية: مفيش عمولة من غير عميل بيشتري فعلًا)
exports.onSaleForReferral = onDocumentCreated("pos_test_sales/{saleId}", async (event) => {
  try {
    const sale = event.data ? event.data.data() : null;
    if (!sale || !sale.customerPhone) return;
    const total = Number(sale.total) || 0;
    if (total <= 0) return;   // مرتجعات/أصفار لا تفعّل

    const snap = await db.collection("sales_app_referrals")
      .where("customerPhone", "==", sale.customerPhone)
      .where("status", "==", "pending_purchase").get();
    if (snap.empty) return;

    // الحد الأدنى (لو المدير محدده) من إعدادات الولاء لكل براند
    let welcome = {};
    try {
      const s = await db.collection("pos_test_settings").doc("loyalty").get();
      welcome = (s.exists && s.data().welcome) || {};
    } catch (e) {}

    for (const d of snap.docs) {
      const ref = d.data();
      const minInv = Number((welcome[ref.brand] || {}).refMinInvoice) || 0;
      if (total >= minInv) {
        await d.ref.update({ status: "active", activatedAt: Date.now(), activationInvoiceNo: sale.invoiceNo || "", activationTotal: total });
      }
    }
  } catch (e) { console.error("referral activation", e); }
});

// ============================================================
// 📟 paymobTerminalOrder — الدفع بالكارت عن طريق ماكينة Paymob
// الكاشير بيبعت المبلغ هنا، والدالة (اللي شايلة الـ API Key بأمان)
// بتكلم Paymob: auth token → order registration → الماكينة ترن بالمبلغ.
//
// ⚙️ خطوات التفعيل (خطوة الكمبيوتر الأخيرة — مرة واحدة):
// 2) خزّن الـ API Key بأمان (من غير ما يدخل في الكود):
//      cd echarpe-push
//      firebase functions:secrets:set PAYMOB_API_KEY
//      (هيطلب منك تلصق المفتاح — خده من Paymob Dashboard → Settings → Account Info)
// 3) انشر:  firebase deploy --only functions
// 4) في Firestore أنشئ مستند pos_test_settings/paymob:
//      { enabled: true, terminalIdByBranch: { "الرحاب": 123, "مدينتي": 456, "سيتي سنتر": 789 } }
//    (أو terminalId واحد لو ماكينة واحدة)
// ============================================================
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const PAYMOB_API_KEY = defineSecret("PAYMOB_API_KEY");

exports.paymobTerminalOrder = onRequest(
  { secrets: [PAYMOB_API_KEY], cors: true, region: "us-central1" },
  async (req, res) => {
    try {
      if (req.method !== "POST") { res.status(405).json({ ok:false, error:"POST only" }); return; }
      const { amount_cents, terminal_id, merchant_order_id, branch } = req.body || {};
      const cents = Math.round(Number(amount_cents) || 0);
      const tid = Number(terminal_id) || 0;
      if (cents < 100 || cents > 50000000) { res.status(400).json({ ok:false, error:"مبلغ غير منطقي" }); return; }
      if (!tid) { res.status(400).json({ ok:false, error:"terminal_id ناقص" }); return; }

      // 1) Auth token
      const authRes = await fetch("https://accept.paymobsolutions.com/api/auth/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: PAYMOB_API_KEY.value() })
      });
      const auth = await authRes.json();
      if (!auth.token) { res.status(502).json({ ok:false, error:"فشل توثيق Paymob" }); return; }

      // 2) Order registration → إشعار الماكينة
      const url = "https://accept.paymob.com/api/ecommerce/orders"
        + "?send_pay_notification_to_terminal_id=" + tid
        + "&preferred_payment_method=card";
      const orderRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_token: auth.token,
          delivery_needed: "false",
          amount_cents: String(cents),
          currency: "EGP",
          merchant_order_id: String(merchant_order_id || Date.now())
        })
      });
      const order = await orderRes.json();
      if (!orderRes.ok || !order.id) {
        console.error("paymob order fail", order);
        res.status(502).json({ ok:false, error: (order && order.message) || "فشل تسجيل الأوردر" });
        return;
      }
      console.log("paymob order ok", { id: order.id, branch, cents, tid });
      // 📝 بنسجّل المحاولة "مستنية" — الـ POS بيراقب المستند ده لحد ما النتيجة توصل
      try{
        await db.collection("pos_paymob_txns")
          .doc(String(merchant_order_id)).set({
            status: "pending",
            orderId: order.id,
            amountCents: cents,
            branch: branch || null,
            terminalId: tid,
            createdAt: Date.now()
          }, { merge: true });
      }catch(e){ console.error("paymob txn write", e); }
      res.json({ ok:true, order_id: order.id });
    } catch (e) {
      console.error("paymobTerminalOrder", e);
      res.status(500).json({ ok:false, error: String(e.message || e) });
    }
  }
);


// ============================================================
// 📬 paymobWebhook — Paymob بيبعت هنا نتيجة كل عملية دفع
// بيتأكد إن الرسالة جاية من Paymob فعلًا (HMAC) قبل ما يصدّقها،
// وبيكتب النتيجة في pos_paymob_txns عشان الكاشير يشوفها فورًا.
//
// ⚙️ التفعيل (مرة واحدة):
// 1) firebase functions:secrets:set PAYMOB_HMAC_SECRET
//    (المفتاح من Paymob Dashboard → Settings → Account Info → HMAC)
// 2) في داشبورد Paymob حط الرابط ده كـ Transaction Callback:
//    https://us-central1-customer-feedback-8ac1d.cloudfunctions.net/paymobWebhook
// ============================================================
const PAYMOB_HMAC_SECRET = defineSecret("PAYMOB_HMAC_SECRET");
const crypto = require("crypto");

// Paymob بيحسب الـ HMAC على حقول محددة بترتيب ثابت — أي تغيير في الترتيب بيكسر التحقق
const HMAC_FIELDS = [
  "amount_cents","created_at","currency","error_occured","has_parent_transaction",
  "id","integration_id","is_3d_secure","is_auth","is_capture","is_refunded",
  "is_standalone_payment","is_voided","order.id","owner","pending",
  "source_data.pan","source_data.sub_type","source_data.type","success"
];
function digAt(obj, pathStr){
  return pathStr.split(".").reduce(function(o,k){ return (o == null) ? undefined : o[k]; }, obj);
}
function paymobHmacValid(obj, received, secret){
  if(!received || !secret) return false;
  const concat = HMAC_FIELDS.map(function(f){
    const v = digAt(obj, f);
    if(v === true) return "true";
    if(v === false) return "false";
    return (v === undefined || v === null) ? "" : String(v);
  }).join("");
  const calc = crypto.createHmac("sha512", secret).update(concat).digest("hex");
  // مقارنة ثابتة الزمن — بتمنع استنتاج التوقيع بقياس وقت الرد
  const a = Buffer.from(calc, "utf8"), b = Buffer.from(String(received), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

exports.paymobWebhook = onRequest(
  { secrets: [PAYMOB_HMAC_SECRET], cors: false, region: "us-central1" },
  async (req, res) => {
    // ⏱️ أول لحظة الرسالة وصلت دالتنا — بتفصل تأخير Paymob عن تأخيرنا:
    //    webhookReceivedAt - authorizedAt = تأخير Paymob
    //    decidedAt - webhookReceivedAt    = تأخيرنا إحنا
    const _rcvAt = Date.now();
    try{
      const hmac = (req.query && req.query.hmac) || "";
      const body = req.body || {};
      const obj  = body.obj || {};
      if(!paymobHmacValid(obj, hmac, PAYMOB_HMAC_SECRET.value())){
        console.warn("paymob webhook: HMAC مش مطابق — الرسالة اترفضت");
        // 🩺 تشخيص بس — الرسالة **مش بتتصدّق** ومش بتلمس مستندات العمليات.
        // 🔴 الرفض كان بصمت تامة: لو Paymob غيّروا تركيبة حقول الـHMAC
        // (بيحصل مع أنواع callbacks جديدة)، كل التأكيدات كانت هتترمي ومفيش
        // أي أثر نعرف منه — والكاشير تفضل مستنية والماكينة طابعة.
        // ⚡ الكتابة دي على مسار الرفض بس — الطريق الحرج (النجاح) مش بيمر عليها.
        try{
          await db.collection("pos_paymob_rejected").add({
            reason: "bad_hmac",
            merchantOrderId: (obj.order && obj.order.merchant_order_id) || null,
            txnId: obj.id || null,
            amountCents: obj.amount_cents || null,
            success: obj.success != null ? obj.success : null,
            pending: obj.pending != null ? obj.pending : null,
            at: Date.now()
          });
        }catch(e){ console.warn("rejected log", e); }
        res.status(401).send("bad hmac");     // ⛔ من غير التحقق ده أي حد يقدر يزوّر "تم الدفع"
        return;
      }
      const merchantOrderId = (obj.order && obj.order.merchant_order_id) || null;
      if(!merchantOrderId){ res.status(200).send("no merchant_order_id"); return; }

      const success  = obj.success === true || obj.success === "true";
      const pending  = obj.pending === true || obj.pending === "true";
      const refunded = obj.is_refunded === true || obj.is_refunded === "true";
      const voided   = obj.is_voided === true || obj.is_voided === "true";

      const sd = obj.source_data || {};
      const dt = obj.data || {};
      // ⚠️ المرتجع/الإلغاء عند Paymob بيتعمل كعملية **بنت** على نفس الأوردر —
      // فبييجي بنفس merchant_order_id. من غير الفصل ده كان هيكتب فوق مستند البيعة
      // الأصلية ويستبدل transactionId برقم عملية المرتجع → الرقم اللي بنرجّع بيه يضيع.
      // ⚠️ المرتجع/الإلغاء بس هما اللي بيتفصلوا في مستند جانبي.
      // 🔴 كان الفصل بعلامة has_parent_transaction — وده كسر تأكيد البيع:
      // بعض عمليات البيع بالكارت بتتم على مرحلتين عند البنك (حجز ثم تحصيل)،
      // وعملية التحصيل بتيجي هي كمان بعلامة parent — فكانت بتتكتب في مستند
      // جانبي والسيستم يفضل مستني على الأساسي «كل كام عملية» رغم إن الماكينة
      // أكدت وطبعت. دلوقتي: التحصيل بيروح للمستند الأساسي زي البيع المباشر.
      const _flag = function(v){ return v === true || v === "true"; };
      const isChild = ( _flag(obj.has_parent_transaction) )
        && ( _flag(obj.is_refund) || _flag(obj.is_void)
          || _flag(obj.is_refunded) || _flag(obj.is_voided) );

      // 🔑 الحالة معناها بيختلف حسب المستند — عشان كده بتتحسب **بعد** isChild:
      let status;
      if(isChild){
        // مستند جانبي لعملية مرتجع/إلغاء — الحالة بتوصف المرتجع نفسه.
        // (success هنا معناها «المرتجع نجح»، مش «البيعة نجحت»)
        status = (voided || _flag(obj.is_void)) ? "voided"
               : (refunded || _flag(obj.is_refund)) ? "refunded"
               : success ? "success"
               : pending ? "pending" : "failed";
      } else {
        // 🔴 مستند البيعة الأصلية — هنا كان الباج اللي بيعلّق الكاشير:
        // `pending` كانت بتتفحص **قبل** `success`. بعض العمليات بتيجي
        // success:true و pending:true مع بعض (حجز البنك قبل التحصيل) —
        // فالمستند كان بيتكتب "pending"، والـPOS مبيتحركش على "pending"
        // خالص، والماكينة تكون سحبت وطبعت. الحقيقة: success:true معناها
        // العملية نجحت مهما كانت pending لسه شغالة.
        status = success ? "success"
               : pending ? "pending"
               : voided ? "voided"
               : refunded ? "refunded" : "failed";
      }

      const docId = isChild
        ? (String(merchantOrderId) + "__" + String(obj.id || Date.now()))
        : String(merchantOrderId);
      const payload = {
        status: status,
        transactionId: obj.id || null,          // 🔑 ده اللي بيتعمل بيه المرتجع
        amountCents: obj.amount_cents || null,
        cardLast4: sd.pan || null,              // آخر 4 أرقام
        cardScheme: sd.sub_type || null,        // Visa / MasterCard / Meeza …
        approvalCode: dt.approval_code || dt.acq_response_code || null,  // كود الموافقة للنزاعات
        rrn: dt.migs_transaction_receipt || dt.receipt_no || null,       // مرجع البنك
        authorizedAt: obj.created_at || null,   // وقت الموافقة من البنك نفسه
        integrationId: obj.integration_id || null,
        paymobOrderId: (obj.order && obj.order.id) || null,
        declineReason: (dt.message || dt.acq_response_code) || null,
        // 🔗 بيانات العملية البنت (مرتجع/إلغاء) — عشان نربطها بالبيعة الأصلية
        isChild: isChild || null,
        parentOrderRef: isChild ? String(merchantOrderId) : null,
        webhookReceivedAt: _rcvAt,
        decidedAt: Date.now()
      };

      // 🔒 بيعة نجحت مرة = نجحت خلاص.
      // ⚠️ علامة is_refunded بتفضل true على **البيعة الأصلية** بعد أي مرتجع،
      // فأي callback متأخر على نفس العملية كان يقدر يدوس على "success"
      // ويخليها "refunded" — والـPOS لو لسه بيتابع كان هيشيل الكارت من
      // المدفوعات ويخلي الكاشير تسحب تاني. الترقية مسموحة، التنزيل لأ.
      //
      // ⚡ مسار السرعة: التأكيد الناجح (اللي الكاشير مستنياه) بيتكتب **كتابة
      // واحدة من غير أي قراءة** — الحارس بيشتغل بس على الحالات النازلة، وهي
      // نادرة ومش على الطريق الحرج. يعني صفر تأخير زيادة على الفاتورة.
      const ref = db.collection("pos_paymob_txns").doc(docId);
      let downgraded = false;
      if(isChild || status === "success"){
        await ref.set(payload, { merge: true });          // ⚡ كتابة واحدة، صفر قراءة
      } else {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const was  = snap.exists ? (snap.data() || {}).status : null;
          if(was === "success"){
            downgraded = true;
            // بنسجّل الخبر من غير ما نلمس حالة البيعة — عشان المراجعة تشوفه
            tx.set(ref, {
              lateStatus: status,
              lateStatusTxn: obj.id || null,
              lateStatusAt: Date.now()
            }, { merge: true });
            return;
          }
          tx.set(ref, payload, { merge: true });
        });
      }

      console.log("paymob webhook", { merchantOrderId, status, txn: obj.id, isChild, docId, downgraded });
      res.status(200).send("ok");
    }catch(e){
      console.error("paymobWebhook", e);
      res.status(200).send("ok");   // بنرد 200 عشان Paymob ميفضلش يعيد الإرسال
    }
  }
);

// ============================================================
// ↩️ المرتجع مؤجّل بقرار المالك — الدوال اتشالت من الملف
// ------------------------------------------------------------
// اتشال: paymobRefundProbe · paymobRefundTerminalProbe
// واتشال معاهم السرّين الخاصين بيهم بس:
//   PAYMOB_REFUND_TOKEN · PAYMOB_SECRET_KEY
//
// ⚠️ PAYMOB_API_KEY **ماتشالش** — paymobTerminalOrder (مسار البيع الحي)
//    بيستخدمه، وشيله كان هيوقف الماكينة في كل الفروع.
//
// 🔑 الأسرار نفسها لسه موجودة في Secret Manager (مش بتتمسح بالنشر).
//    لو رجعنا للمرتجع، الكود موجود في تاريخ git ومحتاج نسخ ونشر بس.
//
// 🔒 السبب: كل دالة مرتجع منشورة = سطح هجوم على فلوس حقيقية. طول ما
//    الميزة مؤجلة، وجودها منشورة مخاطرة بلا مقابل.
// ============================================================

// ============================================================
// 🔔 إشعارات Office — Push للمالك حتى والتطبيق مقفول
// ------------------------------------------------------------
// ⚠️ الإشعارات اللي كانت في Office **محلية**: بتتولد من الصفحة، فبتشتغل
//    والتطبيق مفتوح بس. دي Push حقيقي من السيرفر.
// التوكنات في pos_test_settings/office_push { tokens: { <token>: {ts, ua} } }
// 🛡️ التوكن الميت بيتمسح تلقائي عشان المستند ميكبرش ببلاش.
// ============================================================
const OFFICE_PUSH_DOC = "office_push";

async function sendToOffice(title, body, tag) {
  const ref = db.collection("pos_test_settings").doc(OFFICE_PUSH_DOC);
  const snap = await ref.get();
  if (!snap.exists) return;
  // 🔴 كان Object.keys(tokens) — والتوكن كان **مفتاح**، والنقط اللي جواه
  //    كانت بتتفسّر كمسار متداخل فالمفتاح يطلع مقطوع.
  //    دلوقتي التوكن **قيمة** في مصفوفة list.
  const d = snap.data() || {};
  let tokens = Array.isArray(d.list)
    ? d.list.map(function (x) { return x && x.token; }).filter(Boolean)
    : [];
  // توافق مؤقت مع الشكل القديم (لو لسه فيه توكنات سليمة من غير نقط)
  if (!tokens.length && d.tokens) tokens = Object.keys(d.tokens);
  tokens = tokens.filter(function (t, i) { return tokens.indexOf(t) === i; });
  if (!tokens.length) return;
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: {
      notification: { title, body, dir: "rtl", lang: "ar", tag: tag || "office" },
      fcmOptions: { link: "./" },
    },
  });
  // 🔴 الفجوة اللي خلّت التشخيص واقف شهر: أي فشل **غير** التوكن الباطل
  //    كان بيتبلع في صمت. لو الـVAPID مش متطابق أو الرسالة مرفوضة،
  //    الرد بيرجع failureCount=3 والدالة بتكمّل وترجع 200 — فالتشخيص
  //    بيقول "الكود سليم والدالة بترجع 200" والفشل قدامنا ومش شايفينه.
  //    دلوقتي نتيجة كل إرسال بتتسجّل بأكوادها في نفس المستند.
  const dead = [];
  const errs = [];
  res.responses.forEach((r, i) => {
    if (r.success) return;
    const code = (r.error && (r.error.code || r.error.message)) || "unknown";
    errs.push({ code: String(code), token: String(tokens[i] || "").slice(-12) });
    if (/registration-token|invalid-argument|not-registered/i.test(String(code))) {
      dead.push(tokens[i]);
    }
  });
  const diag = {
    at: Date.now(),
    title: title,
    sent: tokens.length,
    ok: res.successCount || 0,
    fail: res.failureCount || 0,
    errors: errs.slice(0, 5),
  };
  try { console.log("sendToOffice", JSON.stringify(diag)); } catch (e) {}
  const patch = { lastSend: diag };
  if (dead.length) {
    const fresh = await ref.get();
    const cur = (fresh.exists && Array.isArray((fresh.data() || {}).list)) ? fresh.data().list : [];
    patch.list = cur.filter((x) => x && dead.indexOf(x.token) < 0);
  }
  await ref.set(patch, { merge: true }).catch(() => {});
}

// 🔔 إشعار تجربة — Office بيغيّر الحقل `test` في نفس المستند، والدالة دي
//    بتبعت وتسجّل النتيجة. من غير مجموعة جديدة ولا قاعدة أمان جديدة.
// ⚠️ الحلقة: sendToOffice بتكتب lastSend في نفس المستند فبتشغّل الدالة
//    تاني — بس `test` مايكونش اتغيّر فبترجع من غير ما تبعت.
exports.onOfficePushTest = onDocumentUpdated(
  "pos_test_settings/" + OFFICE_PUSH_DOC,
  async (event) => {
    const before = (event.data && event.data.before && event.data.before.data()) || {};
    const after = (event.data && event.data.after && event.data.after.data()) || {};
    if (!after.test || after.test === before.test) return;
    await sendToOffice(
      "🔔 إشعار تجربة",
      "لو وصلك ده، الإشعارات شغّالة على الجهاز ده ✅",
      "office-test"
    );
  }
);

// 📩 طلب إذن جديد
exports.onLeaveRequest = onDocumentCreated("sales_leave_requests/{id}", async (event) => {
  const d = event.data && event.data.data();
  if (!d || d.status !== "pending") return;
  await sendToOffice("📩 طلب إذن جديد",
    (d.empName || "موظفة") + " — " + (d.branch || "") + " — " + (d.dateKey || ""),
    "leave").catch((e) => console.warn("office push leave", e));
});

// 🔒 طلب تسجيل موظف جديد
exports.onStaffRegistration = onDocumentCreated("sales_registrations/{id}", async (event) => {
  const d = event.data && event.data.data();
  if (!d || d.status !== "pending") return;
  await sendToOffice("🔒 طلب تسجيل موظف",
    (d.name || "") + " — " + (d.branch || ""),
    "reg").catch((e) => console.warn("office push reg", e));
});

// 📦 نقص في الفرع
exports.onShortageReported = onDocumentCreated("sales_shortages/{id}", async (event) => {
  const d = event.data && event.data.data();
  if (!d) return;
  await sendToOffice("📦 نقص في الفرع",
    (d.itemName || d.note || "صنف") + " — " + (d.branch || ""),
    "short").catch((e) => console.warn("office push short", e));
});

// 🎫 أوردر شراء موظفة
exports.onStaffOrder = onDocumentCreated("sales_staff_orders/{id}", async (event) => {
  const d = event.data && event.data.data();
  if (!d || d.status !== "pending") return;
  await sendToOffice("🎫 أوردر موظفة",
    (d.employeeName || "موظفة") + " — " + (d.branch || ""),
    "order").catch((e) => console.warn("office push order", e));
});


// ============================================================================
// ⭐ تقييم الزيارة — إشعار بعد ٣٠ دقيقة من الشراء
// ----------------------------------------------------------------------------
// ليه مجدولة كل ٥ دقايق مش تأجيل لحظي: التأجيل الحقيقي محتاج Cloud Tasks
// وإعداد إضافي. المسح الدوري أبسط وبيتحمل الفشل — لو دورة فشلت، اللي بعدها
// بتلقط نفس الفواتير لأنها لسه ماتعلّمتش.
// ⚠️ من غير أي مكافأة عن قصد: المكافأة بتخلي الناس تدوس أعلى تقييم بسرعة
//    عشان تاخدها، فالرقم يحلو والحقيقة تسوء.
// ============================================================================
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { Timestamp } = require("firebase-admin/firestore");

const RATE_AFTER_MIN = 30;   // بعد كام دقيقة من الفاتورة
const RATE_WINDOW_MIN = 90;  // بنبص على آخر كام دقيقة (بيغطي فشل دورة أو اتنين)

exports.rateVisitPush = onSchedule(
  { schedule: "every 5 minutes", timeZone: "Africa/Cairo" },
  async () => {
    const now = Date.now();
    const from = now - RATE_WINDOW_MIN * 60000;
    const to = now - RATE_AFTER_MIN * 60000;
    const snap = await db
      .collection("pos_test_sales")
      .where("createdAt", ">=", Timestamp.fromMillis(from))
      .where("createdAt", "<=", Timestamp.fromMillis(to))
      .get();
    if (snap.empty) return;

    for (const doc of snap.docs) {
      const d = doc.data() || {};
      if (d.ratePushAt) continue;                 // اتبعت قبل كده
      if (!d.customerPhone) continue;             // فاتورة من غير عميل
      if (d.reversed || d.isReturn) continue;     // فاتورة اتعكست أو مرتجع
      // 🔒 التعليم **الأول** — لو الإرسال فشل مش هنكرره على نفس الفاتورة
      //    كل ٥ دقايق ونزنّ على العميلة.
      await doc.ref.update({ ratePushAt: now }).catch(() => {});
      try {
        const custRef = db.collection("pos_test_customers").doc(String(d.customerPhone));
        const cust = await custRef.get();
        if (!cust.exists) continue;
        const c = cust.data() || {};
        const tokens = readTokens(c);   // أي براند — التقييم مش مربوط ببراند
        if (!tokens.length) continue;
        const name = String(c.name || "").split(" ")[0];
        await sendToTokens(
          tokens,
          "⭐ إزاي كانت زيارتك؟",
          (name ? name + "، " : "") + "رأيك بيوصل للإدارة مباشرة — ثانيتين بس",
          "rate-visit",
          custRef,
          "./?rate=" + doc.id
        );
      } catch (e) {
        console.warn("rateVisitPush", doc.id, e && e.message);
      }
    }
  }
);


// ============================================================================
// 🎙️ officeVoiceParse — AI fallback للتسجيل الصوتي في Office v69
// ----------------------------------------------------------------------------
// نفس فولدر Cloud Functions الحالي (echarpe-push). مفيش PHP ولا Backend جديد.
// Local parser في Office بيشتغل الأول؛ الدالة دي تتنادى بس لما الثقة مش كفاية.
//
// التفعيل مرة واحدة:
//   firebase functions:secrets:set OPENAI_API_KEY
// النشر:
//   firebase deploy --only functions:officeVoiceParse
//
// 🔒 أمان:
// - لازم Firebase email/password ID token؛ anonymous مرفوض.
// - 200 AI fallback / مستخدم / يوم كحد أمان للتكلفة.
// - الدالة لا تكتب أي فاتورة/دفعة. تستخرج JSON فقط.
// - Office نفسه يعيد مطابقة التاجر والحساب ثم ينتظر التأكيد قبل Firestore write.
// ============================================================================
const { getAuth } = require("firebase-admin/auth");
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const OFFICE_VOICE_AI_MODEL = "gpt-5.4-nano"; // fast extraction; no financial write happens here
const OFFICE_VOICE_AI_DAILY_MAX = 200;

function officeVoiceJsonText(data){
  if(!data || !Array.isArray(data.output)) return "";
  for(const item of data.output){
    if(!item || !Array.isArray(item.content)) continue;
    for(const c of item.content){
      if(c && (c.type === "output_text" || typeof c.text === "string") && typeof c.text === "string") return c.text;
    }
  }
  return "";
}
function officeVoiceCleanJson(text){
  const s=String(text||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
  const a=s.indexOf("{"), b=s.lastIndexOf("}");
  if(a<0 || b<=a) return null;
  try{return JSON.parse(s.slice(a,b+1));}catch(_){return null;}
}
async function officeVoiceGuard(uid){
  const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const ref=db.collection("office_voice_ai_guard").doc(uid+"_"+day);
  return db.runTransaction(async function(tx){
    const snap=await tx.get(ref), old=snap.exists?(snap.data()||{}):{};
    const count=Number(old.count)||0;
    if(count>=OFFICE_VOICE_AI_DAILY_MAX) return false;
    tx.set(ref,{uid,day,count:count+1,lastAt:Date.now()},{merge:true});
    return true;
  });
}

exports.officeVoiceParse = onRequest(
  { secrets:[OPENAI_API_KEY], cors:true, region:"us-central1", timeoutSeconds:15, memory:"256MiB" },
  async (req,res) => {
    try{
      if(req.method !== "POST"){ res.status(405).json({ok:false,error:"POST only"}); return; }
      const authz=String(req.get("authorization")||"");
      const m=authz.match(/^Bearer\s+(.+)$/i);
      if(!m){ res.status(401).json({ok:false,error:"auth required"}); return; }
      let user;
      try{ user=await getAuth().verifyIdToken(m[1]); }catch(_){ res.status(401).json({ok:false,error:"bad auth"}); return; }
      const provider=user && user.firebase && user.firebase.sign_in_provider;
      if(!user || !user.uid || provider === "anonymous" || !user.email){ res.status(403).json({ok:false,error:"office email login required"}); return; }
      if(!(await officeVoiceGuard(user.uid))){ res.status(429).json({ok:false,error:"daily limit"}); return; }

      const body=req.body||{}, text=String(body.text||"").trim().slice(0,400);
      const merchants=Array.isArray(body.merchants)?body.merchants.slice(0,120).map(function(x){
        return {id:String((x&&x.id)||"").slice(0,120),name:String((x&&x.name)||"").trim().slice(0,80)};
      }).filter(function(x){return x.id&&x.name;}):[];
      if(!text || text.length<2){ res.status(400).json({ok:false,error:"missing data"}); return; }

      const merchantLines=merchants.map(function(x){return x.id+" | "+x.name;}).join("\n");
      const prompt=[
        "أنت مستخرج بيانات مالية قصير ودقيق لنظام مخزون مصري.",
        "المستخدم يتكلم بالمصري عن فاتورة بضاعة لتاجر أو دفعة دفعها للتاجر.",
        "لا تخمن اسم تاجر غير موجود بالقائمة. لا تحسب رصيد. لا تنفذ أي عملية.",
        "لو المستخدم قال صراحة بدون اسم تاجر أو من غير اسم تاجر: اعتبرها حالة صحيحة، isUnnamedMerchant=true و merchantId فارغ و merchantName=بدون اسم تاجر. لا تخترع اسمًا.",
        "kind=order لو فيه فاتورة/شراء/استلام بضاعة. kind=payment لو دفعة فقط.",
        "افهم الكلام المصري الطبيعي حتى لو المستخدم لم يقل كلمة بضاعة حرفيًا، مثل: اشتريت من أحمد بـ23 ألف.",
        "لو order ومعها دفعة في نفس الجملة: amount=قيمة الفاتورة و payment=المدفوع.",
        "لو payment فقط: amount=قيمة الدفعة و payment=0.",
        "فرّق بدقة بين قيمة الفاتورة والمبلغ المدفوع؛ لا تجمعهما ولا تطرح أحدهما.",
        "افهم الأرقام المصرية الطبيعية مثل 23 ألف = 23000 و خمسة ونص ألف = 5500 متى كان المعنى واضحًا.",
        "لو الجملة فيها أكثر من تفسير للمبلغ أو اسم التاجر، اخفض confidence تحت 0.90 بدل التخمين.",
        "confidence من 0 إلى 1، ولا تستخدم >=0.90 إلا لو الاسم والمبالغ والنية واضحة جدًا.",
        "ارجع JSON واحد فقط بالمفاتيح: merchantId,merchantName,isUnnamedMerchant,kind,amount,payment,confidence.",
        "قائمة التجار (id | name):\n"+merchantLines,
        "الجملة:\n"+text
      ].join("\n\n");

      const ctrl=new AbortController(), timer=setTimeout(function(){ctrl.abort();},8000);
      let api;
      try{
        api=await fetch("https://api.openai.com/v1/responses",{
          method:"POST", signal:ctrl.signal,
          headers:{"Content-Type":"application/json","Authorization":"Bearer "+OPENAI_API_KEY.value()},
          body:JSON.stringify({model:OFFICE_VOICE_AI_MODEL,input:prompt,max_output_tokens:160})
        });
      }finally{clearTimeout(timer);}
      const data=await api.json().catch(function(){return {};});
      if(!api.ok){ console.error("officeVoiceParse OpenAI",api.status,data&&data.error&&data.error.message); res.status(502).json({ok:false,error:"ai unavailable"}); return; }
      const out=officeVoiceCleanJson(officeVoiceJsonText(data));
      if(!out){ res.status(502).json({ok:false,error:"ai invalid"}); return; }

      const isUnnamedMerchant=out.isUnnamedMerchant===true;
      const merchant=isUnnamedMerchant?null:merchants.find(function(x){return x.id===String(out.merchantId||"");});
      const kind=String(out.kind||""), amount=Number(out.amount), payment=Number(out.payment||0), confidence=Number(out.confidence||0);
      if((!isUnnamedMerchant && !merchant) || !["order","payment"].includes(kind) || !(amount>0) || amount>999999999 || payment<0 || payment>999999999 || !(confidence>=0&&confidence<=1)){
        res.status(422).json({ok:false,error:"low confidence"}); return;
      }
      if(kind==="payment" && payment!==0){ res.status(422).json({ok:false,error:"invalid payment shape"}); return; }
      res.json({ok:true,merchantId:isUnnamedMerchant?"":merchant.id,merchantName:isUnnamedMerchant?"بدون اسم تاجر":merchant.name,isUnnamedMerchant:isUnnamedMerchant,kind,amount,payment,confidence});
    }catch(e){
      console.error("officeVoiceParse",e&&e.message||e);
      res.status(500).json({ok:false,error:"voice parse failed"});
    }
  }
);

// ============================================================================
// 🕐 v492 — قفل أمان للشيفتات المفتوحة الساعة 1:00 صباحًا بتوقيت القاهرة
// ----------------------------------------------------------------------------
// الهدف: مفيش شيفت يفضل 36/72 ساعة مفتوح لو الموظف نسي الانصراف.
// القفل هنا **مؤقت للمراجعة**: بنقفل على 01:00 ونعلّم needsClockOutReview=true.
// المرتب يمنع الصرف لحد ما المالك يحدد وقت المشي الحقيقي من لوحة الموافقات.
// ============================================================================
const _SHIFT_TZ = "Africa/Cairo";
const _shiftFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: _SHIFT_TZ, year:"numeric", month:"2-digit", day:"2-digit",
  hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false
});
function _shiftCairoParts(ts){
  const o = {};
  _shiftFmt.formatToParts(new Date(Number(ts)||0)).forEach((p)=>{ o[p.type]=p.value; });
  return { y:+o.year, m:+o.month, d:+o.day, hh:+(o.hour==="24"?"0":o.hour), mi:+o.minute, ss:+o.second };
}
function _shiftCairoOffsetMs(ts){
  const p=_shiftCairoParts(ts);
  return Date.UTC(p.y,p.m-1,p.d,p.hh,p.mi,p.ss) - (Math.floor(Number(ts)/1000)*1000);
}
function _shiftCairoStamp(y,m,d,hh,mi,ss,ms){
  const want=Date.UTC(y,m-1,d,hh||0,mi||0,ss||0,ms||0);
  let guess=want-3*3600000;
  for(let i=0;i<4;i++){
    const next=want-_shiftCairoOffsetMs(guess);
    if(next===guess) break;
    guess=next;
  }
  return guess;
}
function _autoClosePlan(nowTs, clockInTs){
  const p=_shiftCairoParts(nowTs);
  const dayStart=_shiftCairoStamp(p.y,p.m,p.d,0,0,0,0);
  const closeTs=_shiftCairoStamp(p.y,p.m,p.d,1,0,0,0);
  const cin=Number(clockInTs)||0;
  if(!cin || cin>=dayStart) return null; // شيفت بدأ النهاردة لا يتقفل
  return { dayStart, closeTs };
}
exports.autoCloseSalesShiftsAt1 = onSchedule(
  { schedule:"5 1 * * *", timeZone:_SHIFT_TZ, region:"europe-west1", retryCount:0 },
  async () => {
    const now=Date.now();
    const snap=await db.collection("sales_shifts").where("clockOutTs","==",null).get();
    let closed=0, skipped=0;
    for(const d of snap.docs){
      const sh=d.data()||{};
      const plan=_autoClosePlan(now,sh.clockInTs);
      if(!plan){ skipped++; continue; }
      const closeTs=Math.max(Number(sh.clockInTs)+60000, plan.closeTs);
      const shiftMinutes=Math.max(1,Math.round((closeTs-Number(sh.clockInTs))/60000));
      const overtimeMinutes=Math.max(0,shiftMinutes-(8*60+15));
      await d.ref.update({
        clockOutTs:closeTs,
        shiftMinutes,
        overtimeMinutes,
        otRequiresApproval:true,
        overtimeApprovedMin:0,
        overtimeDecision:overtimeMinutes>0?"pending":"none",
        overtimeAutoApproved:false,
        earlyMin:0,
        earlyHours:0,
        forgotClockOut:true,
        autoClosedAt1:true,
        autoClosedAt:now,
        autoClosedProvisionalTs:closeTs,
        needsClockOutReview:true,
        autoCloseReason:"daily_01_cairo",
        autoCloseVersion:"v492"
      });
      closed++;
    }
    console.log("autoCloseSalesShiftsAt1", { open:snap.size, closed, skipped });
  }
);

// ============================================================================
//  💳 الرصيد وكروت الهدايا — الدوال في ملف منفصل
// ----------------------------------------------------------------------------
//  ⚠️ الملف ده هو **المسار الوحيد** اللي بيلمس فلوس العميلات.
//     قواعد Firestore بتمنع أي تطبيق من كتابة حقل `credit` مباشرة،
//     والدوال دي بتشتغل بـAdmin SDK فالقواعد مبتتطبّقش عليها.
//
//  الأسرار المطلوبة (مرة واحدة):
//     firebase functions:secrets:set GIFT_CARD_SALT
//     firebase functions:secrets:set OWNER_EMAIL
//
//  ⚠️⚠️ GIFT_CARD_SALT **مايتغيّرش أبدًا** بعد أول كارت يتباع —
//     تغييره معناه إن كل الكروت القديمة تبقى مش معروفة = فلوس
//     عملاء تضيع. احفظه في مكان آمن بره الجهاز.
//
//  النشر:
//     firebase deploy --only functions:giftCardIssue,functions:giftCardActivate,functions:giftCardClaim,functions:creditAdjust,functions:creditSpend,functions:staffAccessSet
// ============================================================================
Object.assign(exports, require("./giftCredit"));
// Finance v679: customer-confirmed credit + InstaPay evidence. No legacy handler overwritten.
Object.assign(exports, require("./financeCheckout"));
Object.assign(exports, require("./instaEvidence"));

// 🥇 سعر الدهب التلقائي — كان ملف موجود في الريبو **ومش مربوط**،
//    يعني الدالة مكانتش بتتنشر أصلًا (نفس درس frames.js: ملف موجود
//    ومش متحمّل = ميزة ميتة). واتحوّل لـv2 عشان النشر ميفشلش.
Object.assign(exports, require("./goldPriceUpdate"));

// 🛍️ أوردرات أونلاين — الحجز الذرّي (onlineOrderPlace · onlineOrderRelease
//    · onlineOrderExpire). من غير السطر ده الملف موجود والدوال **مش
//    منشورة** — نفس درس goldPriceUpdate بالظبط.
Object.assign(exports, require("./onlineOrderPlace"));

// 🧕✨ تجربة الطرحة بالـAI — hijabTryOn (صورة العميلة + صورة المنتج →
//    صورة واحدة واقعية). من غير السطر ده الدالة **مش منشورة**. النشر:
//    firebase deploy --only functions:hijabTryOn
Object.assign(exports, require("./hijabTryOn"));
