/* ============================================================
   💳 giftCredit.js — كروت الهدايا ورصيد العميلة (السيرفر)
   ------------------------------------------------------------
   بيتحط في: C:\Users\Mahmo\echarpe-push\
   النشر:
     firebase deploy --only functions:giftCardIssue,functions:giftCardActivate,functions:giftCardClaim,functions:creditAdjust,functions:creditSpend

   🔑 القاعدة الحاكمة: **التطبيقات مبتكتبش الرصيد خالص.**
      قواعد الأمان بتقول `allow write: if false` على حقول الرصيد،
      والدوال دي هي الوحيدة اللي بتكتب (بتشتغل بصلاحية الأدمن).

      من غير ده أي كاشير يفتح DevTools ويكتب على Firestore مباشرة
      ويزوّد رصيد نفسه — ومع الفلوس ده مش "مزعج"، ده طبع عملة.

   🔒 ٥ طبقات في كل عملية:
      ١. صلاحية: مين بيندي؟ (توكن الدخول، مش كلام التطبيق)
      ٢. مفتاح تكرار: الشبكة قطعت والكاشير دوس تاني؟ مرة واحدة.
      ٣. معاملة ذرّية: القراءة والكتابة مقفولين مع بعض.
      ٤. دفتر: كل حركة سطر، والرصيد المخزّن نسخة سريعة بس.
      ٥. تهشيم: الكود بيتخزّن بصمة — مين يقرا القاعدة مياخدش فلوس.
   ============================================================ */
// ⚠️⚠️ الملف ده على **Functions v2** عشان يطابق `index.js` بتاعك.
//    أول نسخة كانت v1 (`functions.https.onCall`) ومكانتش هتشتغل
//    جنب دوالك الحالية — المشروع كله v2.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require('firebase-admin');
const crypto = require('crypto');

// 🔐 نفس نمط PAYMOB_API_KEY في index.js
// 🔴🔴 الملح ده **مايتغيّرش أبدًا** بعد أول كارت يتباع.
//    بصمة كل كارت متخزّنة محسوبة بيه — تغييره معناه إن كل الكروت
//    اللي في إيد العملاء تبقى **مش معروفة للنظام**، ومحدش يقدر
//    يستلمها. ده مش خطأ تقني — ده فلوس عملاء بتضيع.
//    لو اضطررت تغيّره: لازم تعيد حساب بصمات كل الكروت القديمة الأول.
const GIFT_CARD_SALT = defineSecret("GIFT_CARD_SALT");
const OWNER_EMAIL    = defineSecret("OWNER_EMAIL");

// ⚠️ `initializeApp()` متنادى مرة واحدة في index.js — مبنعيدهاش هنا،
//    وإلا بتقع بـ"The default Firebase app already exists".
const REGION = "us-central1";

const CUSTOMERS = 'pos_test_customers';
const CARDS     = 'gift_cards';
const LEDGER    = 'credit_ledger';
const SETTINGS  = 'pos_test_settings';

/* 🔐 تهشيم الكود — زي الباسورد بالظبط.
   ⚠️ الكود هو الفلوس. لو اتخزّن صريح، أي حد يوصل للقاعدة (نسخة
      احتياطية مسرّبة، موظف عنده وصول، تصدير بالغلط) بياخد فلوس.
   ⚠️ الملح من Secret Manager — من غيره جدول قوس قزح بيفك أي كود. */
function hashCode(code, salt){
  return crypto.createHmac('sha256', String(salt || ''))
    .update(String(code || '').toUpperCase()).digest('hex');
}
function getSalt(){
  const s = GIFT_CARD_SALT.value();
  if(!s) throw new HttpsError('failed-precondition',
    'GIFT_CARD_SALT مش متظبّط في Secret Manager');
  return s;
}

const GC_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function genCode(){
  // ⚠️ randomInt مش Math.random — ده كود بيحمي فلوس، والعشوائية
  //    الضعيفة قابلة للتنبؤ لو حد عرف وقت الإصدار.
  let s = '';
  for(let i = 0; i < 16; i++) s += GC_ALPHABET[crypto.randomInt(GC_ALPHABET.length)];
  return s;
}
function normalize(raw){
  let s = String(raw || '').toUpperCase().replace(/\s|-/g, '');
  if(s.indexOf('GC') === 0) s = s.slice(2);
  return s.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, '');
}

/* 👮 مين اللي بيندي؟ — من التوكن، **مش** من اللي التطبيق بيقوله
   ------------------------------------------------------------
   🔴 تصحيح مهم: أول نسخة من الملف ده كانت بتدوّر على
      `context.auth.token.owner` — **والمشروع مفيهوش custom claims
      خالص.** الأدوار في POS كلها client-side في `rolePermissions`،
      يعني كل نداء كان هيترفض والميزة مكانتش هتشتغل مع حد.

   ✅ الحل اللي بيمشي مع معمارك الحالي:
      · **المالك** = الإيميل اللي في `OWNER_EMAIL` (متغيّر بيئة).
        ليه إيميل مش UID؟ لأنك ممكن تعمل حساب جديد وتفضل المالك.
      · **الموظف** = إيميله في قايمة مسموحة في Firestore.
        القايمة دي **بتتكتب من الدوال بس** (المالك بيديرها) —
        لو التطبيق قدر يكتبها، أي حد يضيف نفسه ويطبع فلوس.

   ⚠️ الدخول المجهول (تطبيق العميلة) **مش موظف أبدًا** — لازم
      إيميل مؤكد. من غير الشرط ده أي حد يفتح التطبيق يبقى كاشير.
   ============================================================ */
const ACCESS_DOC = 'staff_access';

async function requireStaff(context, need){
  const uid = context.auth && context.auth.uid;
  if(!uid) throw new HttpsError('unauthenticated', 'لازم تسجّل دخول');
  const t = context.auth.token || {};
  const email = String(t.email || '').toLowerCase().trim();

  // 🚫 مجهول = مش موظف. نقطة.
  if(!email || t.firebase && t.firebase.sign_in_provider === 'anonymous'){
    throw new HttpsError('permission-denied', 'الحساب ده مش موظف');
  }

  const ownerEmail = String(OWNER_EMAIL.value() || '').toLowerCase().trim();
  if(!ownerEmail) throw new HttpsError('failed-precondition',
    'OWNER_EMAIL مش متظبّط');
  if(email === ownerEmail) return { uid, role:'owner', email, name: t.name || 'المالك' };

  if(need === 'owner') throw new HttpsError('permission-denied',
    'العملية دي للمالك بس');

  const snap = await admin.firestore().collection(SETTINGS).doc(ACCESS_DOC).get();
  const allow = (snap.data() || {}).emails || {};
  const rec = allow[email.replace(/\./g, '_')];      // النقط ممنوعة في مفاتيح Firestore
  if(!rec || rec.active === false) throw new HttpsError('permission-denied',
    'الحساب ده مش مسجّل كموظف — المالك بيضيفه من Office');

  return { uid, role:'staff', email, name: rec.name || t.name || '',
           branch: rec.branch || '' };
}

/* 👥 إدارة قايمة الموظفين — المالك بس
   ⚠️ القايمة دي هي مفتاح الفلوس. لو حد أضاف نفسه فيها، يبقى
      يقدر يصرف ويصدر كروت. عشان كده الكتابة من هنا بس. */
exports.staffAccessSet = onCall(
  { region: REGION, secrets: [GIFT_CARD_SALT, OWNER_EMAIL] },
  async (request) => {
    // ⚠️ v2: البيانات والهوية جوّه `request` مش معاملين منفصلين
    const data = request.data || {};
    const context = { auth: request.auth };
    const who = await requireStaff(context, 'owner');
    const email = String((data && data.email) || '').toLowerCase().trim();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      throw new HttpsError('invalid-argument', 'إيميل غلط');
    const key = email.replace(/\./g, '_');
    const active = (data && data.active) !== false;
    await admin.firestore().collection(SETTINGS).doc(ACCESS_DOC).set({
      emails: { [key]: { email, active,
        name: String((data && data.name) || ''), branch: String((data && data.branch) || ''),
        by: who.email, at: Date.now() } }
    }, { merge: true });
    return { ok:true, email, active };
  }
);

/* 🔁 حارس التكرار — نفس المفتاح مرة واحدة بس، **ذرّيًا**.
   ⚠️ الفحص والكتابة لازم يبقوا في نفس المعاملة. لو اتفصلوا،
      ضغطتين في نفس اللحظة بيعدّوا الاتنين (سباق حقيقي مش نظري). */
function idemRef(key){
  return admin.firestore().collection('credit_idem').doc(String(key));
}

/* 💰 كتابة حركة رصيد — المسار الوحيد اللي بيلمس فلوس العميلة */
async function postCredit(tx, phone, amount, meta){
  const cref = admin.firestore().collection(CUSTOMERS).doc(String(phone));
  const snap = await tx.get(cref);
  const before = Number((snap.data() || {}).credit) || 0;
  const after = Math.round((before + Number(amount)) * 100) / 100;
  // 🛡️ الرصيد عمره ما ينزل تحت الصفر — لو حصل يبقى فيه سباق أو باج
  if(after < 0) throw new HttpsError('failed-precondition',
    'الرصيد مش كفاية (الرصيد ' + before + ' والمطلوب ' + Math.abs(amount) + ')');

  const lref = admin.firestore().collection(LEDGER).doc();
  tx.set(lref, Object.assign({
    phone: String(phone), amount: Math.round(Number(amount) * 100) / 100,
    balanceAfter: after, at: Date.now(),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, meta || {}));
  // الرصيد المخزّن **نسخة سريعة** للعرض — الدفتر هو الحقيقة
  tx.set(cref, { credit: after, creditAt: Date.now() }, { merge: true });
  return { before, after };
}

/* ============================================================
   🎟️ ١) إصدار كارت — بيتولد **مقفول** (pending)
   ⚠️ أهم حارس في المنظومة: الكارت مبيشتغلش قبل ما الفلوس تدخل.
      الكاشير بتصدره وقت البيع، والفاتورة لما تتقفل بتفعّله.
      لو الفاتورة اتلغت، الكارت يفضل مقفول للأبد.
   ============================================================ */
exports.giftCardIssue = onCall(
  { region: REGION, secrets: [GIFT_CARD_SALT, OWNER_EMAIL] },
  async (request) => {
    // ⚠️ v2: البيانات والهوية جوّه `request` مش معاملين منفصلين
    const data = request.data || {};
    const context = { auth: request.auth };
    const who = await requireStaff(context);
    const value = Math.round(Number(data && data.value) * 100) / 100;
    const idem = String((data && data.idem) || '');
    if(!(value > 0)) throw new HttpsError('invalid-argument', 'المبلغ غلط');
    if(!idem) throw new HttpsError('invalid-argument', 'مفتاح التكرار ناقص');

    const cfg = (await admin.firestore().collection(SETTINGS).doc('gift_cards').get()).data() || {};
    const max = Number(cfg.maxValue) || 10000;
    if(value > max) throw new HttpsError('invalid-argument',
      'أقصى قيمة للكارت ' + max + ' ج.م');

    const salt = getSalt();
    const code = genCode();
    const db = admin.firestore();

    const out = await db.runTransaction(async (tx) => {
      const iref = idemRef(idem);
      const prev = await tx.get(iref);
      // 🔁 اتنفّذت قبل كده → رجّع نفس النتيجة بدل ما تعمل كارت تاني
      if(prev.exists) return { repeat: true, cardId: prev.data().cardId, code: prev.data().code };

      const ref = db.collection(CARDS).doc();
      tx.set(ref, {
        codeHash: hashCode(code, salt),
        codeTail: code.slice(-4),          // آخر ٤ حروف للعرض بس (مش كفاية للصرف)
        value: value, remaining: value,
        status: 'pending',                 // 🔒 لسه ماتدفعش
        issuedBy: who.uid, issuedByName: who.name, branch: (data && data.branch) || who.branch || '',
        issuedAt: Date.now(),
        expiresAt: cfg.validMonths ? Date.now() + Number(cfg.validMonths) * 30 * 86400000 : null,
        tries: 0, lastTryAt: 0
      });
      // 👁️ نسخة للعرض من غير البصمة — Office بيقرا منها.
      //    ⚠️ مجموعة `gift_cards` نفسها مقفولة تمامًا لأن فيها البصمة؛
      //       من غير النسخة دي مكانش فيه طريقة تشوف كروتك خالص.
      /* 👤 رقم المشترية — عشان الكارت يظهر عندها في «كروتي».
         ⚠️ الرقم **مش ملكية**: الصرف بالكود، وأي حد معاه يقدر
            يستخدمه. ده للعرض والمتابعة بس.
         ⚠️ ومفيش `code` هنا خالص — النسخة دي مقروءة من التطبيق،
            وحطّ الكود فيها معناه إن أي حد يعرف رقم موبايل يسحب
            كودات كروته (الدخول مجهول ومفيش هوية تتأكد). */
      tx.set(db.collection('gift_cards_public').doc(ref.id), {
        value: value, remaining: value, status:'pending',
        codeTail: code.slice(-4), branch: (data && data.branch) || who.branch || '',
        buyerPhone: (data && data.buyerPhone) ? String(data.buyerPhone).replace(/\D/g, '') : null,
        issuedByName: who.name, issuedAt: Date.now()
      });
      /* 👤 ملخّص على مستند العميلة — ده اللي التطبيق بيقراه في «كروتي».
         ⚠️ **مستند واحد برقمها** بدل استعلام على مجموعة الكروت:
            فتح المجموعة للعميلة معناه إن أي حد داخل ينزّل كل الكروت
            بقيمها. ومفيش كود هنا برضه — القيمة والحالة بس. */
      if(data && data.buyerPhone){
        const _ph = String(data.buyerPhone).replace(/\D/g, '');
        if(_ph.length >= 10){
          tx.set(db.collection('pos_test_customers').doc(_ph), {
            giftCards: admin.firestore.FieldValue.arrayUnion({
              cardId: ref.id, value: value, codeTail: code.slice(-4),
              status: 'pending', at: Date.now()
            })
          }, { merge: true });
        }
      }
      tx.set(iref, { cardId: ref.id, code: code, at: Date.now(),
        // 🧹 مفاتيح التكرار مش محتاجة تعيش للأبد
        expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 86400000) });
      return { repeat: false, cardId: ref.id, code: code };
    });

    // ⚠️ الكود بيترجع **مرة واحدة بس** هنا عشان يتطبع. بعد كده
    //    مفيش طريقة تسترجعه — إحنا مخزّنين بصمته مش هو.
    return { cardId: out.cardId, code: out.code, display: 'GC-' + out.code.match(/.{1,4}/g).join('-'),
             value: value, repeat: out.repeat };
  }
);

/* ============================================================
   ✅ ٢) تفعيل الكارت — بعد ما الفاتورة تتقفل والفلوس تدخل
   ============================================================ */
exports.giftCardActivate = onCall(
  { region: REGION, secrets: [GIFT_CARD_SALT, OWNER_EMAIL] },
  async (request) => {
    // ⚠️ v2: البيانات والهوية جوّه `request` مش معاملين منفصلين
    const data = request.data || {};
    const context = { auth: request.auth };
    await requireStaff(context);
    const cardId = String((data && data.cardId) || '');
    const invoice = String((data && data.invoiceCode) || '');
    if(!cardId || !invoice) throw new HttpsError('invalid-argument', 'بيانات ناقصة');

    const db = admin.firestore();
    return db.runTransaction(async (tx) => {
      const ref = db.collection(CARDS).doc(cardId);
      const snap = await tx.get(ref);
      if(!snap.exists) throw new HttpsError('not-found', 'الكارت مش موجود');
      const c = snap.data();
      if(c.status === 'active') return { ok:true, repeat:true };     // 🔁 اتفعّل قبل كده
      if(c.status !== 'pending') throw new HttpsError('failed-precondition',
        'الكارت حالته ' + c.status);
      tx.update(ref, { status:'active', paidInvoice: invoice, activatedAt: Date.now() });
      tx.set(db.collection('gift_cards_public').doc(cardId),
        { status:'active', paidInvoice: invoice, activatedAt: Date.now() }, { merge: true });
      return { ok:true, repeat:false };
    });
  }
);

/* ============================================================
   📲 ٣) استلام الكارت في التطبيق → يتحوّل رصيد والكود يموت
   ⚠️ دي بتتنادى من **العميلة** (مستخدم مجهول)، مش من موظف.
      فالحراس هنا أهم حاجة: تخمين الكود = سرقة فلوس.
   ============================================================ */
exports.giftCardClaim = onCall(
  { region: REGION, secrets: [GIFT_CARD_SALT, OWNER_EMAIL] },
  async (request) => {
    // ⚠️ v2: البيانات والهوية جوّه `request` مش معاملين منفصلين
    const data = request.data || {};
    const context = { auth: request.auth };
    if(!context.auth) throw new HttpsError('unauthenticated', 'افتحي التطبيق الأول');
    const phone = String((data && data.phone) || '').replace(/\D/g, '');
    const raw = normalize(data && data.code);
    if(!/^01\d{9}$/.test(phone)) throw new HttpsError('invalid-argument', 'رقم غلط');
    if(raw.length !== 16) throw new HttpsError('invalid-argument', 'الكود غلط');

    const salt = getSalt();
    const db = admin.firestore();
    const h = hashCode(raw, salt);

    // 🛡️ حارس المحاولات **على الرقم** — عشان مايجربش أكواد كتير.
    //    (الحارس على الكارت مش كفاية: المهاجم بيجرّب أكواد مختلفة
    //     فمبيوصلش لنفس المستند مرتين أصلًا.)
    const gref = db.collection('credit_guard').doc(phone);
    const now = Date.now();
    const g = (await gref.get()).data() || {};
    if((Number(g.tries) || 0) >= 5 && now < (Number(g.lastTryAt) || 0) + 15 * 60000){
      throw new HttpsError('resource-exhausted',
        'محاولات كتير غلط — استني ' +
        Math.ceil(((g.lastTryAt + 15 * 60000) - now) / 60000) + ' دقيقة');
    }

    const q = await db.collection(CARDS).where('codeHash', '==', h).limit(1).get();
    if(q.empty){
      await gref.set({ tries: (Number(g.tries) || 0) + 1, lastTryAt: now }, { merge: true });
      throw new HttpsError('not-found', 'الكود مش صحيح');
    }

    const out = await db.runTransaction(async (tx) => {
      const ref = q.docs[0].ref;
      const snap = await tx.get(ref);
      const c = snap.data();
      if(c.status === 'claimed') throw new HttpsError('already-exists',
        'الكارت ده اتستخدم قبل كده');
      if(c.status !== 'active') throw new HttpsError('failed-precondition',
        c.status === 'pending' ? 'الكارت لسه ماتدفعش تمنه' : 'الكارت مش صالح');
      if(c.expiresAt && now > Number(c.expiresAt))
        throw new HttpsError('failed-precondition', 'الكارت انتهت مدته');
      const amount = Number(c.remaining) || 0;
      if(amount <= 0) throw new HttpsError('failed-precondition', 'الكارت اتصرف');

      const r = await postCredit(tx, phone, amount, {
        type:'gift_card', cardId: ref.id, by:'app',
        note:'كارت هدية ' + amount + ' ج.م'
      });
      // 💀 الكود بيموت — مايتستخدمش تاني حتى لو حد شافه
      tx.update(ref, { status:'claimed', claimedBy: phone, claimedAt: now, remaining: 0 });
      tx.set(db.collection('gift_cards_public').doc(ref.id),
        { status:'claimed', claimedBy: phone, claimedAt: now, remaining: 0 }, { merge: true });
      return { amount, balance: r.after };
    });

    await gref.set({ tries: 0, lastTryAt: now }, { merge: true });
    return out;
  }
);

/* ============================================================
   ✍️ ٤) تعديل رصيد يدوي — المالك مباشرة، والكاشير بطلب
   ⚠️ ده الباب الوحيد اللي بيخلق فلوس من العدم — فأضيق باب.
   ============================================================ */
exports.creditAdjust = onCall(
  { region: REGION, secrets: [GIFT_CARD_SALT, OWNER_EMAIL] },
  async (request) => {
    // ⚠️ v2: البيانات والهوية جوّه `request` مش معاملين منفصلين
    const data = request.data || {};
    const context = { auth: request.auth };
    const who = await requireStaff(context);
    const phone = String((data && data.phone) || '').replace(/\D/g, '');
    const amount = Math.round(Number(data && data.amount) * 100) / 100;
    const reason = String((data && data.reason) || '').trim();
    const idem = String((data && data.idem) || '');
    const source = String((data && data.source) || 'manual');   // manual | change
    if(!/^01\d{9}$/.test(phone)) throw new HttpsError('invalid-argument', 'رقم غلط');
    if(!amount || !isFinite(amount)) throw new HttpsError('invalid-argument', 'المبلغ غلط');
    if(!reason) throw new HttpsError('invalid-argument', 'لازم سبب');
    if(!idem) throw new HttpsError('invalid-argument', 'مفتاح التكرار ناقص');

    // 💵 "سيب الباقي في الحساب": الفلوس **دخلت الدرج فعلًا** مع
    //    فاتورة حقيقية، فمش بتخلق فلوس من العدم → الكاشير تعملها
    //    على طول. أي إضافة تانية من كاشير بتروح لطابور موافقتك.
    const isChange = (source === 'change' && amount > 0 && data.invoiceCode);
    if(who.role !== 'owner'){
      const ref = admin.firestore().collection('credit_requests').doc(crypto.createHash('sha256').update(who.uid+':'+idem).digest('hex'));
      const out=await admin.firestore().runTransaction(async tx=>{
        const prev=await tx.get(ref);
        if(prev.exists){if(prev.data().phone!==phone||prev.data().amount!==amount||prev.data().reason!==reason)
          throw new HttpsError('already-exists','نفس مفتاح الطلب اتستخدم لبيانات مختلفة');
          return {queued:true,repeat:true,requestId:ref.id};}
        tx.create(ref,{phone,amount,reason,by:who.uid,byName:who.name,
          branch:who.branch||'',status:'pending',at:Date.now(),idem});
        return {queued:true,repeat:false,requestId:ref.id};
      });
      return out;
    }

    const db = admin.firestore();
    return db.runTransaction(async (tx) => {
      const iref = idemRef(idem);
      const prev = await tx.get(iref);
      if(prev.exists) return { repeat:true, balance: prev.data().balance };
      const r = await postCredit(tx, phone, amount, {
        type: isChange ? 'change_kept' : 'manual', reason,
        by: who.uid, byName: who.name, branch: who.branch || '',
        invoiceCode: (data && data.invoiceCode) || null
      });
      tx.set(iref, { balance: r.after, at: Date.now(),
        expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 86400000) });
      return { repeat:false, balance: r.after };
    });
  }
);


/* v679: owner approves/rejects credit request atomically with the balance & ledger.
   Firestore rules deny client writes to credit_requests, including the owner Office. */
exports.creditRequestDecision=onCall({region:REGION,secrets:[GIFT_CARD_SALT,OWNER_EMAIL]},async req=>{
  const who=await requireStaff({auth:req.auth},'owner');
  const id=String(req.data?.requestId||'');const decision=String(req.data?.decision||'');
  if(!/^[A-Za-z0-9_-]{8,120}$/.test(id)||!['approved','rejected'].includes(decision))throw new HttpsError('invalid-argument','طلب أو قرار غير صالح');
  const db=admin.firestore(),ref=db.collection('credit_requests').doc(id);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref),idem=idemRef('req:'+id),prev=await tx.get(idem);
    if(!snap.exists)throw new HttpsError('not-found','الطلب غير موجود');
    if(snap.data().status!=='pending'){
      if(snap.data().status===decision)return {ok:true,repeat:true,balance:prev.data()?.balance||null};
      throw new HttpsError('failed-precondition','تم اتخاذ قرار مختلف بالفعل');
    }
    let balance=null;
    if(decision==='approved'){
      if(prev.exists)throw new HttpsError('failed-precondition','مفتاح الطلب مستخدم والطلب معلّق، راجع الدفتر');
      const d=snap.data();const amount=Math.round(Number(d.amount)*100)/100;
      if(!/^01\d{9}$/.test(d.phone)||!Number.isFinite(amount)||amount===0)throw new HttpsError('failed-precondition','بيانات طلب الرصيد غير صحيحة');
      const result=await postCredit(tx,d.phone,amount,{type:'manual',reason:d.reason||'',requestId:id,
        by:who.uid,byName:who.name,requestedBy:d.by,branch:d.branch||'',noExpiry:true});
      balance=result.after;tx.create(idem,{balance:balance,at:Date.now()});
    }
    tx.update(ref,{status:decision,decidedAt:Date.now(),decidedBy:who.uid});
    return {ok:true,repeat:false,balance};
  });
});

// Change has physically entered the till, but staff may not mint arbitrary credit.
// Verify sale, change amount, customer and one-time allocation on the server.
exports.creditKeepChange=onCall({region:REGION,secrets:[GIFT_CARD_SALT,OWNER_EMAIL]},async req=>{
  const who=await requireStaff({auth:req.auth});const data=req.data||{};
  const phone=String(data.phone||'').replace(/\D/g,''),invoiceCode=String(data.invoiceCode||'');
  const amount=Math.round(Number(data.amount)*100)/100;
  if(!/^01\d{9}$/.test(phone)||!invoiceCode||!Number.isFinite(amount)||amount<=0)throw new HttpsError('invalid-argument','بيانات الباقي ناقصة');
  const db=admin.firestore(),q=db.collection('pos_test_sales').where('invoiceCode','==',invoiceCode).limit(2);
  const idem=idemRef('change:'+invoiceCode);
  return db.runTransaction(async tx=>{
    const prev=await tx.get(idem);if(prev.exists){
      if(prev.data().phone!==phone||prev.data().amount!==amount)throw new HttpsError('already-exists','الباقي محفوظ لعميل مختلف');
      return {ok:true,repeat:true,balance:prev.data().balance};
    }
    const snap=await tx.get(q);if(snap.size!==1)throw new HttpsError('failed-precondition','لا توجد فاتورة واحدة مؤكدة للباقي');
    const sale=snap.docs[0],v=sale.data();
    if(v.customerPhone!==phone||(who.branch&&who.branch!==v.branch&&who.role!=='owner'))throw new HttpsError('permission-denied','فاتورة العميلة أو الفرع مش مطابق');
    if(v.changeKept||Math.round(Number(v.changeGiven||0)*100)<Math.round(amount*100))throw new HttpsError('failed-precondition','الباقي غير متاح أو اتسجل قبل كده');
    const result=await postCredit(tx,phone,amount,{type:'change_kept',reason:'باقي فاتورة '+invoiceCode,
      invoiceCode,by:who.uid,byName:who.name,branch:v.branch,noExpiry:true,originalPayments:v.payments||{}});
    tx.update(sale.ref,{changeKept:amount,changeKeptAt:Date.now()});
    tx.create(idem,{phone,amount,balance:result.after,at:Date.now()});
    return {ok:true,repeat:false,balance:result.after};
  });
});

/* ============================================================
   💸 ٥) الصرف على فاتورة
   ⚠️ **أونلاين إجباري.** لو الشيك محلي، نفس الرصيد يتصرف في
      الرحاب ومدينتي في نفس اللحظة والاتنين ينجحوا. المعاملة
      الذرّية هنا هي اللي بتمنع ده — ومفيش بديل أوفلاين ليها.
   ============================================================ */
exports.creditSpend = onCall(
  { region: REGION, secrets: [GIFT_CARD_SALT, OWNER_EMAIL] },
  async (request) => {
    // ⚠️ v2: البيانات والهوية جوّه `request` مش معاملين منفصلين
    // FINANCE v679: legacy callable must NEVER debit without customer's tablet PIN.
    throw new HttpsError('failed-precondition', 'صرف الرصيد متوقف من المسار القديم؛ استخدم تابلت العميلة');
    const data = request.data || {};
    const context = { auth: request.auth };
    const who = await requireStaff(context);
    const phone = String((data && data.phone) || '').replace(/\D/g, '');
    const amount = Math.round(Number(data && data.amount) * 100) / 100;
    const invoiceTotal = Math.round(Number(data && data.invoiceTotal) * 100) / 100;
    const idem = String((data && data.idem) || '');
    if(!/^01\d{9}$/.test(phone)) throw new HttpsError('invalid-argument', 'رقم غلط');
    if(!(amount > 0)) throw new HttpsError('invalid-argument', 'المبلغ غلط');
    if(!idem) throw new HttpsError('invalid-argument', 'مفتاح التكرار ناقص');
    // 🛡️ الصرف عمره ما يزيد عن الفاتورة — وإلا الإجمالي يبقى سالب
    //    والفاتورة تتحوّل "مرتجع" يطلّع كاش (نفس ثغرة النقط §4أ٧)
    if(!(invoiceTotal > 0) || amount > invoiceTotal)
      throw new HttpsError('invalid-argument',
        'الصرف مينفعش يزيد عن قيمة الفاتورة');

    const db = admin.firestore();
    return db.runTransaction(async (tx) => {
      const iref = idemRef(idem);
      const prev = await tx.get(iref);
      if(prev.exists) return { repeat:true, balance: prev.data().balance };
      const r = await postCredit(tx, phone, -amount, {
        type:'spend', invoiceCode: (data && data.invoiceCode) || null,
        by: who.uid, byName: who.name, branch: who.branch || ''
      });
      tx.set(iref, { balance: r.after, at: Date.now(),
        expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 86400000) });
      return { repeat:false, balance: r.after, spent: amount };
    });
  }
);

module.exports.__test = { hashCode, normalize, genCode, GC_ALPHABET };
