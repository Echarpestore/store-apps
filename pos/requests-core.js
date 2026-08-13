/* ============================================================
   🔖 requests-core.js — طلبات الزباين (المنطق الصافي)
   ------------------------------------------------------------
   مفيش أي اتصال بقاعدة بيانات هنا — دوال حسابية بس عشان تتختبر.

   🔑 القاعدة الحاكمة: **الاقتراح الغلط بيقتل الميزة.**
      لو النظام قال "الطرحة اللي طلبتيها وصلت" وهي مش هي، المالك
      بيتحرج قدام العميلة ومرة واحدة كفاية إنه يبطّل يثق في التنبيه.
      عشان كده كل حاجة هنا مبنية على:
        · المطابقة المؤكدة (الباركود) لوحدها
        · والمطابقة بالوصف **اقتراح للأبد** مهما كانت قوية
   ============================================================ */

/* 🔤 تطبيع العربي — من غيره المطابقة بالوصف مش هتشتغل أصلًا
   ------------------------------------------------------------
   الناس بتكتب نفس الكلمة بأشكال مختلفة، والكاشير بتكتب بسرعة:
     "طرحه بيضا"  ·  "طرحة بيضاء"  ·  "طـرحة  بيضاء"
   الاتنين لازم يبقوا نفس الحاجة. */
function reqNormalize(s){
  return String(s == null ? '' : s)
    // 🔢 الأرقام الهندية → عربية (الكيبورد العربي بيكتبها هندي)
    .replace(/[٠-٩]/g, function(d){ return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); })
    .replace(/[۰-۹]/g, function(d){ return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); })
    // ـــ التطويل والتشكيل
    .replace(/[\u0640]/g, '')
    .replace(/[\u064B-\u0652\u0670]/g, '')
    // أ إ آ ٱ → ا
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
    // ة → ه   (طرحة/طرحه)
    .replace(/\u0629/g, '\u0647')
    // ى → ي   (بنطبّع على الياء عشان "علي/على" يبقوا واحد)
    .replace(/\u0649/g, '\u064A')
    // ؤ ئ → و ي
    .replace(/\u0624/g, '\u0648').replace(/\u0626/g, '\u064A')
    .toLowerCase()
    // 🔗 الرموز جوّه الكلمة بتتشال **من غير مسافة**
    //    ⚠️ "طـ__رحة" لو حطينا مكانها مسافة بتبقى "ط رحه" — كلمتين
    //       غلط بدل كلمة صح. الرموز الفاصلة بس (مسافة/شرطة) هي
    //       اللي بتتحول مسافة.
    .replace(/[_.]+/g, '')
    .replace(/[^\u0621-\u064Aa-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* 🚫 كلمات عامة مبتفرقش
   ⚠️ دي مش رفاهية: لو "طرحة" لوحدها طابقت، كل استلام هيطلّع ٥٠
      اقتراح والمالك هيبطّل يبص عليهم — والميزة تموت بالضوضاء
      مش بالباج. */
const REQ_STOPWORDS = [
  'عايزه','عايز','عاوزه','عاوز','محتاجه','محتاج','ممكن','لو','سمحت',
  'من','في','على','عن','مع','الى','الي','او','و','ال','ده','دي','دى',
  'حاجه','شكل','زي','زى','كده','كدا','بس','كمان','برضه','يعني',
  'قطعه','قطعة','واحده','واحد','اتنين','لون','مقاس','سايز','size'
];

/* ✂️ توحيد آخر الكلمة
   ------------------------------------------------------------
   "بيضاء" · "بيضا" · "بيضة" — الناس بتكتبهم بالتبادل، والألوان
   أكتر صفة مستخدمة في المحل. من غير التوحيد ده المطابقة بتفشل
   على أهم حاجة بنطابق بيها.

   ⚠️ لازم يشتغل **على الكلمة لوحدها بعد التقطيع** مش على النص
      كله بـregex. أول محاولة اشتغلت على النص وأكلت الألف من
      "بيضا" نفسها (بقت "بيض") — يعني التوحيد بوّظ الكلمة الصح
      عشان يصلّح الغلط. */
function reqStem(w){
  let s = String(w || '');
  // الهمزة في الآخر بتتشال: بيضاء → بيضا
  s = s.replace(/\u0621$/, '');
  // ⚠️ الألف في الآخر **مبتتشالش** — دي جزء من الكلمة (بيضا).
  //    اللي بيتوحّد هو الهمزة اللي بعدها بس.
  return s;
}

/* 🔑 استخراج الكلمات المميزة */
function reqKeywords(text){
  const norm = reqNormalize(text);
  if(!norm) return [];
  const seen = {}, out = [];
  norm.split(' ').forEach(function(w){
    if(w.length < 2) return;                        // حرف واحد مبيفرقش
    if(REQ_STOPWORDS.indexOf(w) >= 0) return;
    const st = reqStem(w);
    if(st.length < 2 || seen[st]) return;
    seen[st] = 1; out.push(st);
  });
  return out;
}

/* 🎯 درجة التطابق بين طلب ومنتج
   بترجّع { level, score, hits }
     'exact'  🟢 الباركود مطابق          → تنبيه مباشر
     'likely' 🟡 كلمات مميزة كفاية       → اقتراح محتاج تأكيد
     'weak'   ⚪ ضعيف                    → **مبيظهرش خالص**
   ------------------------------------------------------------
   ⚠️ 'likely' عمرها ما بتترقّى لـ'exact' مهما كانت قوية.
      المطابقة بالوصف تخمين، والتخمين يفضل تخمين. */
const REQ_MIN_HITS = 2;          // كلمتين مميزتين على الأقل
const REQ_MIN_RATIO = 0.5;       // ونص كلمات الطلب على الأقل

function reqMatch(req, product){
  if(!req || !product) return { level:'weak', score:0, hits:[] };

  // 🟢 الباركود — الحقيقة الوحيدة المؤكدة
  const rb = String(req.barcode || '').trim();
  const pb = String(product.barcode || '').trim();
  if(rb && pb && rb === pb) return { level:'exact', score:1, hits:[rb] };

  // 🟡 الوصف
  const kws = (req.keywords && req.keywords.length) ? req.keywords : reqKeywords(req.text);
  if(!kws.length) return { level:'weak', score:0, hits:[] };

  // ⚠️ الناحية التانية لازم تتعامل **بنفس الطريقة** بالظبط —
  //    لو طبّعنا الطلب بس، "بيضاء" في اسم المنتج مش هتطابق.
  const hay = ' ' + reqNormalize(product.name || '')
    .split(' ').map(reqStem).join(' ') + ' ';
  const hits = kws.filter(function(k){ return hay.indexOf(' ' + k) >= 0; });
  const ratio = hits.length / kws.length;

  // كلمة واحدة عمرها ما تكفي — حتى لو هي كل الطلب.
  // "طرحة" بتطابق كل الطرح في المحل.
  if(hits.length >= REQ_MIN_HITS && ratio >= REQ_MIN_RATIO){
    return { level:'likely', score: Math.round(ratio * 100) / 100, hits: hits };
  }
  return { level:'weak', score: Math.round(ratio * 100) / 100, hits: hits };
}

/* 📦 مطابقة دفعة الاستلام كلها مع الطلبات المفتوحة
   بترجّع الأقوى الأول، والضعيف مش بيدخل خالص. */
function reqMatchBatch(requests, products, opts){
  const o = opts || {};
  const out = [];
  (requests || []).forEach(function(r){
    if(!r) return;
    if(r.status && r.status !== 'open') return;      // المقفول مالوش لازمة
    (products || []).forEach(function(p){
      if(!p) return;
      const m = reqMatch(r, p);
      if(m.level === 'weak') return;                 // ⚪ مبيظهرش
      out.push({ request:r, product:p, level:m.level, score:m.score, hits:m.hits });
    });
  });
  // 🟢 المؤكد فوق، وبعدين الأقوى نتيجة، وبعدين الأقدم طلبًا
  out.sort(function(a, b){
    if(a.level !== b.level) return a.level === 'exact' ? -1 : 1;
    if(b.score !== a.score) return b.score - a.score;
    return (a.request.createdAt || 0) - (b.request.createdAt || 0);
  });
  return o.limit ? out.slice(0, o.limit) : out;
}

/* ⏳ الطلب بقى قديم؟
   الطلبات بتبوظ: طلب من ٦ شهور العميلة نسيته، والاتصال بيها
   بيبقى غريب مش لطيف.
   ⚠️ **مبنمسحش** — بنعلّم بس. المسح بيضيّع تاريخ اللي الزباين
      بيدوروا عليه، وده أنفع بيانات عندك للشراء. */
const REQ_STALE_DAYS = 90;
function reqIsStale(req, nowTs, days){
  const d = Number(days) || REQ_STALE_DAYS;
  const at = Number(req && req.createdAt) || 0;
  if(!at) return false;
  return ((Number(nowTs) || Date.now()) - at) > d * 86400000;
}

/* 👥 عميلات كتير طلبوا نفس الحاجة
   قرار المالك: **هو اللي يختار مين** — مفيش طابور آلي ولا حجز.
   فبنعرض الكل مرتبين بالأقدم، ومعاهم معلومة تساعده يقرر. */
function reqGroupByProduct(matches){
  const by = {};
  (matches || []).forEach(function(m){
    const key = (m.product && m.product.barcode) || (m.product && m.product.name) || '?';
    if(!by[key]) by[key] = { product: m.product, level: m.level, requests: [] };
    // 🟢 لو فيه تطابق مؤكد في المجموعة، المجموعة كلها بتبقى مؤكدة
    if(m.level === 'exact') by[key].level = 'exact';
    by[key].requests.push({ request: m.request, level: m.level, score: m.score });
  });
  return Object.keys(by).map(function(k){
    const g = by[k];
    g.requests.sort(function(a, b){
      return (a.request.createdAt || 0) - (b.request.createdAt || 0);   // الأقدم الأول
    });
    g.count = g.requests.length;
    return g;
  }).sort(function(a, b){
    if(a.level !== b.level) return a.level === 'exact' ? -1 : 1;
    return b.count - a.count;
  });
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = { reqNormalize, reqStem, reqKeywords, reqMatch, reqMatchBatch,
    reqIsStale, reqGroupByProduct, REQ_STOPWORDS, REQ_STALE_DAYS,
    REQ_MIN_HITS, REQ_MIN_RATIO };
}
if(typeof window !== 'undefined'){
  window.reqNormalize = reqNormalize;
  window.reqKeywords = reqKeywords;
  window.reqMatch = reqMatch;
  window.reqMatchBatch = reqMatchBatch;
  window.reqIsStale = reqIsStale;
  window.reqGroupByProduct = reqGroupByProduct;
}
