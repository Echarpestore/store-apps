/* ============================================================
   💳 credit-core.js — رصيد العميلة وكروت الهدايا (المنطق الصافي)
   ------------------------------------------------------------
   الملف ده **مفيهوش أي اتصال بقاعدة بيانات** — دوال حسابية بس
   عشان تتختبر لوحدها. الكتابة الحقيقية في Cloud Function.

   🔑 القاعدة الحاكمة: **الرصيد فلوس مش نقط.**
      النقط بتتكسب بقاعدة، والرصيد بيتحط بإيد بشر — فأي ثغرة فيه
      = طبع عملة. عشان كده كل حاجة هنا مبنية على:
        · دفتر مش رقم (كل حركة سطر، والرصيد = المجموع)
        · مفتاح تكرار لكل عملية
        · الكود بيتخزّن **مهشّم** مش صريح

   ⚠️⚠️ محاسبيًا: بيع كارت هدية **مش إيراد**.
      الفلوس دخلت الدرج، بس البضاعة لسه ماتباعتش — ده **دين عليك**.
      الإيراد بيتحقق لما الكارت يتصرف. لو حسبناه بيع مرتين،
      الأرقام بتكدب: مرة يوم البيع ومرة يوم الصرف.
   ============================================================ */

/* 🎟️ توليد كود الكارت
   ⚠️ عشوائي مش متسلسل: لو الأكواد GC-1001 وGC-1002، أي حد اشترى
      كارت واحد يقدر يخمّن الباقي — والكود هو الفلوس.
   ⚠️ حروف وأرقام من غير المتشابهين (0/O · 1/I/L) عشان الناس
      بتكتبه بإيدها وبتغلط. غلطة واحدة = محاولة ضايعة. */
const GC_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const GC_GROUPS = 4, GC_GROUP_LEN = 4;      // 16 حرف = مساحة ضخمة

/* 🔢 تطبيع الكود للمقارنة — نفس الناتج مهما كتبته إزاي
   "gc 2a4b-9k7m" و "2A4B9K7M" لازم يبقوا واحد. */
function giftCardNormalize(raw){
  let s = String(raw || '').toUpperCase().replace(/\s|-/g, '');
  if(s.indexOf('GC') === 0) s = s.slice(2);
  // تصحيح المتشابهين لأقرب حرف في الأبجدية
  s = s.replace(/O/g, '0').replace(/I/g, '1').replace(/L/g, '1');
  return s.replace(/[^0-9A-Z]/g, '');
}

/* 👁️ العرض للبني آدم — مجموعات عشان تتقرا وتتكتب صح */
function giftCardDisplay(code){
  const s = giftCardNormalize(code);
  const out = [];
  for(let i = 0; i < s.length; i += GC_GROUP_LEN) out.push(s.slice(i, i + GC_GROUP_LEN));
  return 'GC-' + out.join('-');
}

/* 🎲 توليد كود جديد — بياخد دالة عشوائية عشان يتختبر */
function giftCardGenerate(rnd){
  const r = rnd || Math.random;
  let s = '';
  for(let i = 0; i < GC_GROUPS * GC_GROUP_LEN; i++){
    s += GC_ALPHABET[Math.floor(r() * GC_ALPHABET.length) % GC_ALPHABET.length];
  }
  return s;
}

/* 🧮 حساب الرصيد من الدفتر
   ⚠️ الرصيد **مبيتخزّنش كرقم يتكتب فوقه** — بيتحسب من السطور.
      رقم واحد ممكن يتكتب غلط أو يتسرّق؛ دفتر بيسيب أثر.
   ⚠️ بنتجاهل السطور المكرّرة بمفتاح التكرار: لو الشبكة قطعت
      والكاشير دوس تاني، الحركة مبتتحسبش مرتين. */
function creditBalance(entries){
  const seen = {};
  let bal = 0;
  (entries || []).forEach(function(e){
    if(!e) return;
    const k = e.idem || e.id;
    if(k){ if(seen[k]) return; seen[k] = 1; }
    if(e.void === true) return;               // حركة ملغية
    bal += Number(e.amount) || 0;
  });
  return Math.round(bal * 100) / 100;
}

/* 💸 كام ينفع يتصرف من الرصيد على الفاتورة دي
   قرار المالك: أي فاتورة، كامل. فالسقف هو الأقل من (الرصيد، الفاتورة).
   ⚠️ عمره ما يزيد عن قيمة الفاتورة — وإلا الإجمالي يبقى سالب
      والفاتورة تتحوّل "مرتجع" يطلّع كاش (نفس ثغرة النقط §4أ٧). */
function creditSpendable(balance, invoiceTotal){
  const b = Math.max(0, Number(balance) || 0);
  const t = Math.max(0, Number(invoiceTotal) || 0);
  return Math.round(Math.min(b, t) * 100) / 100;
}

/* 🎟️ هل الكارت ده ينفع يتصرف؟ — قرار صافي
   بيرجّع { ok, reason, amount } */
function giftCardCheck(card, nowTs, wantAmount){
  const now = Number(nowTs) || Date.now();
  if(!card) return { ok:false, reason:'notfound', msg:'الكود ده مش موجود' };
  if(card.status === 'void')     return { ok:false, reason:'void', msg:'الكارت ده اتلغى' };
  if(card.status === 'pending')  return { ok:false, reason:'pending',
    msg:'الكارت لسه ماتدفعش تمنه' };
  const remaining = Math.round((Number(card.remaining) || 0) * 100) / 100;
  if(remaining <= 0)             return { ok:false, reason:'empty', msg:'الكارت اتصرف كله' };
  // ⏳ الانتهاء: بيتشاف **بعد** الرصيد عشان الرسالة تبقى أدق
  if(card.expiresAt && now > Number(card.expiresAt))
    return { ok:false, reason:'expired', msg:'الكارت انتهت مدته' };
  const want = (wantAmount == null) ? remaining : Math.max(0, Number(wantAmount) || 0);
  return { ok:true, amount: Math.round(Math.min(remaining, want) * 100) / 100,
           remaining: remaining };
}

/* 🛡️ حارس المحاولات — الكود هو الفلوس، فالتخمين لازم يبقى مكلف
   ⚠️ من غير الحارس ده، سكربت بسيط يجرّب ملايين الأكواد.
      القفل بيتصاعد: كل محاولة غلط بتزوّد الاستنى. */
const GC_MAX_TRIES = 5;
const GC_LOCK_MS = 15 * 60 * 1000;
function giftCardTryGuard(tries, lastTryAt, nowTs){
  const n = Number(tries) || 0;
  const now = Number(nowTs) || Date.now();
  const last = Number(lastTryAt) || 0;
  if(n < GC_MAX_TRIES) return { allowed:true, left: GC_MAX_TRIES - n };
  const until = last + GC_LOCK_MS;
  if(now >= until) return { allowed:true, left: GC_MAX_TRIES, reset:true };
  return { allowed:false, waitMs: until - now,
    msg:'محاولات كتير غلط — استنى ' + Math.ceil((until - now) / 60000) + ' دقيقة' };
}

/* 🧾 محاسبة الكارت — الحتة اللي بتخلي أرقام المالك صح
   ------------------------------------------------------------
   بيع الكارت:  كاش +500 · إيراد 0   (دين عليك)
   صرف الكارت:  كاش 0    · إيراد +500 (الدين اتسدّد بضاعة)

   ⚠️ لو حسبنا البيع إيراد، الرقم بيتعدّ **مرتين** — مرة يوم
      البيع ومرة يوم الصرف — والمالك يفتكر إنه باع ضعف اللي باعه. */
function giftCardAccounting(kind, amount){
  const a = Math.round((Number(amount) || 0) * 100) / 100;
  if(kind === 'sale')   return { cash: a, revenue: 0, liability:  a };
  if(kind === 'redeem') return { cash: 0, revenue: a, liability: -a };
  return { cash: 0, revenue: 0, liability: 0 };
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = { giftCardNormalize, giftCardDisplay, giftCardGenerate,
    creditBalance, creditSpendable, giftCardCheck, giftCardTryGuard,
    giftCardAccounting, GC_ALPHABET, GC_MAX_TRIES, GC_LOCK_MS };
}
if(typeof window !== 'undefined'){
  window.giftCardNormalize = giftCardNormalize;
  window.giftCardDisplay = giftCardDisplay;
  window.creditBalance = creditBalance;
  window.creditSpendable = creditSpendable;
  window.giftCardCheck = giftCardCheck;
  window.giftCardTryGuard = giftCardTryGuard;
  window.giftCardAccounting = giftCardAccounting;
}
