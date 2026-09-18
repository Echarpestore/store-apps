/* ============================================================
   🥇 goldPriceUpdate — سعر جرام الدهب عيار ٢٤ (شراء) تلقائي
   ------------------------------------------------------------
   بيتحط في: C:\Users\Mahmo\echarpe-push\index.js
   النشر:    cd echarpe-push && firebase deploy --only functions:goldPriceUpdate

   بيكتب في: pos_test_settings/office_cash_cfg
             { goldBuyPrice, goldPriceAt, goldSource, goldSellPrice }

   ⚠️ فلسفة الملف: **السعر الغلط أوحش من مفيش سعر.**
      الرقم ده بيدخل في "إجمالي فلوسك" اللي المالك بيحكم بيه على
      مصروفه. لو مصدر بايظ كتب رقم غلط، هياخد قرار غلط وهو واثق.
      فكل الحراس تحت مبنية على قاعدة: **لو مش متأكد، ماتكتبش.**

   ⚠️ سعر الشراء مش سعر البيع. الصاغة بتشتري منك بأقل مما بتبيع،
      والفرق في مصر ٥٠–٢٠٠ج في الجرام. بنقيّم بسعر الشراء عشان
      الرقم يبقى اللي هتقبضه فعلًا لو بعت.
   ============================================================ */
// ⚠️ v2 إجباري: المشروع كله v2، وخلط v1 وv2 في نفس النشر بيفشل.
//    (نفس الدرس اللي اتعلمناه مع giftCredit.js.)
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
// ⚠️ مفيش initializeApp() هنا — متنادى في index.js، والتكرار بيرمي
//    "The default Firebase app already exists".

const CFG_DOC = 'office_cash_cfg';
const CFG_COL = 'pos_test_settings';

// 🛡️ حدود العقل — أي رقم بره النطاق ده غلط أكيد مش تحرك سوق.
//    بتتوسّع لو السوق اتحرك فعلًا (المالك بيغيّرها من الإعدادات).
const SANE_MIN = 1000;
const SANE_MAX = 30000;
// 🛡️ أقصى قفزة مقبولة في التحديث الواحد. سوق الدهب بيتحرك ٢–٣%
//    في اليوم العادي؛ ١٥% معناها المصدر باظ أو غيّر وحدة القياس
//    (أوقية بدل جرام مثلًا) — ودي بالظبط النوعية اللي بتعدّي بصمت.
const MAX_JUMP_PCT = 15;

/* 📥 المصادر — بالترتيب. أول واحد يرجّع رقم عاقل بيكسب.
   ⚠️ مفيش API رسمي مجاني لسعر الصاغة المصري، فالمصادر دي ممكن
      تتغيّر من غير سابق إنذار. عشان كده:
        · الفشل مش بيكسر حاجة — بيسيب آخر سعر معروف مكانه
        · وبيتسجّل في `goldLastError` عشان تشوفه في اللوج
   لو مصدر وقع خالص، غيّر الدالة دي بس — الباقي مالوش دعوة. */
async function fetchSources(){
  const out = [];
  const cfg = (await admin.firestore().collection(CFG_COL).doc(CFG_DOC).get()).data() || {};

  // (١) مصدر المالك المخصّص — لو حط URL بيرجّع JSON فيه السعر
  if(cfg.goldApiUrl){
    try{
      const r = await fetch(cfg.goldApiUrl, { signal: AbortSignal.timeout(15000) });
      const j = await r.json();
      // مسار الحقل قابل للتغيير: "data.buy_24" مثلًا
      const pick = (o, p) => String(p||'').split('.').reduce((x,k)=> (x==null?x:x[k]), o);
      const buy  = Number(pick(j, cfg.goldApiBuyPath  || 'buy'));
      const sell = Number(pick(j, cfg.goldApiSellPath || 'sell'));
      if(buy > 0) out.push({ buy, sell: sell > 0 ? sell : 0, source: 'custom' });
    }catch(e){ console.warn('gold custom source', e.message); }
  }

  // (٢) الحساب من السعر العالمي + الدولار
  //     ⚠️ ده **تقديري**: السوق المصري فيه علاوة محلية بتتغيّر.
  //        بنستخدمه كشبكة أمان بس، ومعلّم إنه محسوب مش مرصود،
  //        عشان المالك يعرف إن الرقم ده أضعف من مصدر حقيقي.
  if(cfg.goldSpotFallback){
    try{
      const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=EGP',
        { signal: AbortSignal.timeout(15000) });
      const fx = await r.json();
      const usdEgp = Number(fx && fx.rates && fx.rates.EGP);
      const spotUsdOz = Number(cfg.goldSpotUsdOz);        // بيتحدّث يدوي أو من مصدر تاني
      if(usdEgp > 0 && spotUsdOz > 0){
        const gram24 = (spotUsdOz / 31.1035) * usdEgp;
        const prem = Number(cfg.goldLocalPremiumPct);      // علاوة السوق المحلي
        const sell = gram24 * (1 + (isFinite(prem) ? prem : 0) / 100);
        const spread = Number(cfg.goldBuySpreadPct);       // فرق الشراء عن البيع
        const buy = sell * (1 - (isFinite(spread) ? spread : 2) / 100);
        out.push({ buy, sell, source: 'محسوب من العالمي' });
      }
    }catch(e){ console.warn('gold spot fallback', e.message); }
  }
  return out;
}

/* 🧮 القرار الصافي — قابل للاختبار من غير شبكة ولا Firestore.
   بيرجّع إما { ok:true, ... } أو { ok:false, reason } */
function decideGoldPrice(candidates, prev, opts){
  opts = opts || {};
  const min = Number(opts.min) || SANE_MIN;
  const max = Number(opts.max) || SANE_MAX;
  const jump = Number(opts.maxJumpPct) || MAX_JUMP_PCT;
  const list = (candidates || []).filter(function(c){
    return c && isFinite(Number(c.buy)) && Number(c.buy) >= min && Number(c.buy) <= max;
  });
  if(!list.length) return { ok:false, reason:'مفيش مصدر رجّع رقم عاقل' };

  const pick = list[0];
  const buy = Math.round(Number(pick.buy) * 100) / 100;
  const before = Number(prev && prev.goldBuyPrice) || 0;

  // 🛡️ حارس القفزة — بس لو فيه سعر سابق نقارن بيه
  if(before > 0){
    const diffPct = Math.abs(buy - before) / before * 100;
    if(diffPct > jump){
      return { ok:false, reason:'قفزة ' + diffPct.toFixed(1) + '% من ' + before + ' لـ' + buy
        + ' — اتوقفت للمراجعة', suspect: buy };
    }
  }
  // 🛡️ سعر الشراء عمره ما يزيد عن سعر البيع
  let sell = Math.round(Number(pick.sell || 0) * 100) / 100;
  if(sell > 0 && sell < buy) sell = 0;      // بيانات متعكوسة → نتجاهل البيع

  return { ok:true, buy: buy, sell: sell, source: pick.source || 'auto' };
}

/* ⏰ بيشتغل كل ساعتين في أوقات السوق (بتوقيت القاهرة) */
exports.goldPriceUpdate = onSchedule(
  { schedule: '0 8-22/2 * * *', timeZone: 'Africa/Cairo',
    region: 'us-central1', timeoutSeconds: 60, memory: '256MiB' },
  async () => {
    const ref = admin.firestore().collection(CFG_COL).doc(CFG_DOC);
    const prev = (await ref.get()).data() || {};

    // 🔒 القفل اليدوي: لو المالك كاتب السعر بنفسه، الأتمتة مبتلمسوش.
    //    من غير ده، رقم كتبه بإيده كان هيتمسح بصمت بعد ساعتين.
    if(prev.goldManualLock === true){
      console.log('gold: manual lock — تخطّي');
      return null;
    }

    let cands = [];
    try{ cands = await fetchSources(); }
    catch(e){ console.error('gold fetch', e); }

    const d = decideGoldPrice(cands, prev);
    if(!d.ok){
      console.warn('gold rejected:', d.reason);
      // ⚠️ الرفض بيتسجّل بس **السعر القديم بيفضل** — مبنكتبش صفر
      //    ومبنمسحش. آخر سعر معروف أحسن من لا سعر، والمالك بيشوف
      //    التنبيه الأصفر في الشاشة لأن الطابع الزمني بيقدم.
      await ref.set({ goldLastError: d.reason, goldLastTryAt: Date.now() }, { merge: true });
      return null;
    }

    await ref.set({
      goldBuyPrice: d.buy,
      goldSellPrice: d.sell || admin.firestore.FieldValue.delete(),
      goldPriceAt: Date.now(),
      goldSource: d.source,
      goldLastError: admin.firestore.FieldValue.delete(),
      goldLastTryAt: Date.now()
    }, { merge: true });

    console.log('gold updated:', d.buy, 'from', d.source);
    return null;
  });

module.exports.decideGoldPrice = decideGoldPrice;   // للاختبار
