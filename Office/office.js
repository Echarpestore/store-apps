/* ============================================================
   🏢 echarpe office — إدارة البيزنس (للمالك)
   الوارد الحي · النواقص · التجار والمصاريف · التقارير
   الإشعارات: محلية والتطبيق مفتوح/في الخلفية —
   والـ push الكامل (والتطبيق مقفول) بييجي مع Cloud Function (آخر خطوة).
   ============================================================ */
'use strict';

// 🔴 كان فيه كود مالك **مكتوب صريح** في الملف ده.
// GitHub Pages بيقدّم الملف ده لأي متصفح — أي حد يفتح /Office/office.js يقرا
// الكود. مش محتاج جهازك ولا devtools. اتشال خالص، والكود بقى **بصمة** محفوظة
// في Firestore ومتقارنة بالـhash. الكود نفسه عمره ما بيتخزّن في أي مكان.
const OF_GATE_DOC = 'office_gate';        // pos_test_settings/office_gate
const OF_SESS_KEY = 'office_gate_sess';   // جلسة بصلاحية، مش علامة دائمة
const OF_SESS_HOURS = 10;                 // تنتهي كل 10 ساعات

const firebaseConfig = {
  apiKey: "AIzaSyCa6Qho3IKoKE_jCNHYuFX6rtaV88jekQs",
  authDomain: "customer-feedback-8ac1d.firebaseapp.com",
  projectId: "customer-feedback-8ac1d",
  storageBucket: "customer-feedback-8ac1d.firebasestorage.app",
  messagingSenderId: "408860081491",
  appId: "1:408860081491:web:c5fa8b8e757c13196375a6"
};
/* ============================================================
   🔐 عزل جلسة Office — نفس حكاية loyalty/glow/feedback بالظبط
   ------------------------------------------------------------
   🔴 الباج اللي حصل: Office وPOS **كانوا الاتنين على التطبيق
      الافتراضي** (بدون اسم). لو POS مفتوح في تبويب Chrome على نفس
      اللابتوب في نفس الوقت، الاتنين بيتشاركوا نفس مساحة تخزين
      الدخول — وأي تصادم بينهم بيرجّع جلسة Office لمجهول، فقاعدة
      `office_gate` (بصمة كود المالك) ترفض القراءة، والشاشة تقف
      عند "لحظة..." للأبد لأن `refreshGate` عمرها ما بتتنفذ.
      إيشارب وGlow وشاشة التقييم اتحصّنوا من نفس الباج قبل كده
      باسم منفصل لكل واحد — Office وPOS كانوا الوحيدين المكشوفين.
   ✅ الحل: تطبيق باسم `'office'` = مساحة تخزين مستقلة تمامًا.
      مبيلمسش جلسة POS ولا loyalty ولا glow لا من قريب ولا بعيد.
   ⚠️ التطبيق الافتراضي لسه بيتهيّأ **للإشعارات (FCM) بس** — عشان
      توكن الإشعارات الموجود يفضل هو هو ومحدش يفقد إشعاراته.
      وإحنا عمرنا ما بنطلب auth على الافتراضي، فجلسة Office مأمّنة.
   ============================================================ */
firebase.initializeApp(firebaseConfig);                              // FCM بس
var ofApp = firebase.initializeApp(firebaseConfig, 'office');        // auth + firestore + functions
var ofAuth = firebase.auth(ofApp);
ofAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function(){});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function(){});
const db = firebase.firestore(ofApp);
db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED, merge:true });
db.enablePersistence({ synchronizeTabs:true }).catch(function(){});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function(){});

const $ = function(s){ return document.querySelector(s); };

/* ============================================================
   🧮 دوال الحساب النقية والمساعدات (متغطّاة بالاختبارات في tests/)
   ============================================================ */
function esc(t){ return String(t==null?'':t).replace(/[<>&"]/g, function(c){ return ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c]; }); }
// 🙈 إخفاء الأرقام — كل الفلوس في التطبيق بتعدي من هنا، فالإخفاء نقطة واحدة.
//    الغرض: تفتح البرنامج قدام حد من غير ما يشوف المبيعات والمرتبات والمصاريف.
// ⚠️ إخفاء بصري بس — البيانات محمّلة في الجهاز عادي. مش بديل عن قفل الشاشة.
let _ofHideMoney = false;
try{ _ofHideMoney = localStorage.getItem('office_hide_money') === '1'; }catch(e){}
function egp(n){
  if(_ofHideMoney) return '••••';
  return (Number(n)||0).toLocaleString('ar-EG') + ' ج.م';
}
function ofToggleMoney(){
  _ofHideMoney = !_ofHideMoney;
  try{ localStorage.setItem('office_hide_money', _ofHideMoney ? '1' : '0'); }catch(e){}
  ofPaintEyeBtn();
  // إعادة رسم كل حاجة بتعرض فلوس
  ['renderInbox','renderShort','renderMerchants','renderExpenses','renderSalaries',
   'renderPL','renderTop','ofRenderRecurring','ofRenderDay','ofRenderPay',
   'ofRenderSales','ofRenderItems','renderActivityReports'].forEach(function(fn){
    try{ if(typeof window[fn] === 'function') window[fn](); else if(typeof eval(fn) === 'function') eval(fn+'()'); }
    catch(e){}
  });
}
function ofPaintEyeBtn(){
  const b = document.getElementById('eyeBtn');
  if(!b) return;
  b.textContent = _ofHideMoney ? '🙈' : '👁️';
  b.title = _ofHideMoney ? 'الأرقام مخفية — دوس للإظهار' : 'إخفاء الأرقام';
}
window.ofToggleMoney = ofToggleMoney;
function dstr(ts){ try{ return new Date(ts).toLocaleDateString('ar-EG', { day:'numeric', month:'short' }); }catch(e){ return ''; } }
/* ⏳ «بقاله كام» — التاريخ المطلق (١٥ أغسطس) محتاج حساب في الدماغ
   عشان تعرف قد إيه ده قديم. المتقدّم اللي بقاله أسبوعين من غير رد
   ممكن يكون لقى شغل تاني، والمالك محتاج يعرف ده **من نظرة واحدة**
   مش يطرح تاريخين. */
function agoStr(ts){
  const ms = Date.now() - (Number(ts) || 0);
  if(!ts || ms < 0) return '';
  const mins = Math.floor(ms / 60000);
  if(mins < 60)   return mins <= 1 ? 'دلوقتي' : ('من ' + mins + ' دقيقة');
  const hrs = Math.floor(mins / 60);
  if(hrs < 24)    return 'من ' + hrs + (hrs === 1 ? ' ساعة' : ' ساعات');
  const days = Math.floor(hrs / 24);
  if(days === 1)  return 'من يوم';
  if(days < 14)   return 'من ' + days + ' أيام';
  const weeks = Math.floor(days / 7);
  if(weeks < 8)   return 'من ' + weeks + (weeks === 1 ? ' أسبوع' : ' أسابيع');
  const months = Math.floor(days / 30);
  return 'من ' + months + (months === 1 ? ' شهر' : ' شهور');
}
/* ⚠️ العتبة **بالأيام** لا الساعات: طلب اتقدّم إمبارح لسه طازة،
   والمالك مايتخوّفش منه. أسبوع من غير رد هو اللي فعلًا بيبان. */
function agoStale(ts, days){
  const ms = Date.now() - (Number(ts) || 0);
  return ts > 0 && ms > (Number(days) || 7) * 86400000;
}
function monthKey(d){ const x=d||new Date(); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0'); }

// رصيد التاجر من حركاته: order بيزوّد اللي عليك، payment بيخصم
function merchantBalance(txns){
  return (txns||[]).reduce(function(sum, t){
    if(!t) return sum;
    const a = Number(t.amount)||0;
    if(t.type === 'order')   return sum + a;
    if(t.type === 'payment') return sum - a;
    return sum;
  }, 0);
}

// مجموع مصاريف شهر معين
/* 🔢 كود الصنف في طلب النواقص
   الطلبات القديمة اتسجّلت من غير كود (الحقل مكانش موجود في المنتج —
   الكود هو معرّف المستند). بنحاول نلاقيه بالاسم عشان الطلبات القديمة
   متفضلش من غير كود. */
function shortCode(x){
  if(x && x.barcode) return String(x.barcode);
  const nm = String((x && x.productName) || '').trim();
  if(!nm) return '';
  const hit = (D.products || []).find(function(p){ return String(p.name||'').trim() === nm; });
  return hit ? String(hit.barcode || hit.id || '') : '';
}

function expensesMonthTotal(expenses, mk){
  return (expenses||[]).reduce(function(sum, e){
    if(!e || String(e.month||'') !== mk) return sum;
    return sum + (Number(e.amount)||0);
  }, 0);
}

/* ============================================================
   💵 معاك في إيدك — الكاش الفعلي
   ------------------------------------------------------------
   الفكرة: المالك بيحدد المبلغ اللي معاه **دلوقتي** (رصيد افتتاحي بتاريخه)،
   وبعدها النظام بيمشي لوحده: بيضيف كاش الفروع وبيخصم اللي اتصرف.

   ⚠️ قرارات محسوبة في الدالة دي:
   · **كاش بس** (payments.cash) — فلوس الفيزا بتروح لحساب Paymob مش لإيده.
     من غير الفصل ده الرقم بيطلع أكبر من الحقيقة بكتير.
   · فواتير العكس **بتتحسب** (مدفوعاتها سالبة) — الفلوس رجعت للعميلة فعلًا،
     فالمرتجع بيقلّل الكاش زي ما هو بالظبط.
   · الرواتب من **المصروف الفعلي** (sales_salary_payments) مش المستحق —
     المستحق مخرجش من الدرج.
   · المكافآت **المعتمدة بس** — اللي مستنية موافقة لسه ماتصرفتش.
   ============================================================ */
function _ohTs(x){
  if(!x) return 0;
  if(x.ts) return Number(x.ts) || 0;
  if(x.paidAt) return Number(x.paidAt) || 0;
  if(x.earnedAt) return Number(x.earnedAt) || 0;
  if(x.date){ const t = Date.parse(String(x.date) + 'T12:00:00'); return isNaN(t) ? 0 : t; }
  return 0;
}


/* 📅 حركة كل يوم بالتفصيل — ده قلب التبويب
   كل يوم: كاش الفروع · فيزا · اللي اتصرف (مصاريف/رواتب/سلف/مكافآت)
   · صافي اليوم · والرصيد التراكمي لحد اليوم ده. */


/* ⚠️ office بيحمّل مبيعات آخر 30 يوم بس — فالرصيد الافتتاحي ميقدرش يبقى
   أقدم من كده وإلا الفواتير القديمة تقع بره النافذة والرقم يبوظ. */


/* ============================================================
   💳 فلوسك عند Paymob
   ------------------------------------------------------------
   كل فاتورة فيزا فلوسها بتروح لـPaymob مش لإيدك. لما التحويل يوصل،
   المالك بيسجّل **اللي نزل عنده فعلًا (الصافي)**، والنظام بيرجّع
   الإجمالي المقابل له ويطلّع العمولة.

   ⚠️ درس من تحويل حقيقي: **العمولة مش نسبة ثابتة**.
      · عملية ماستركارد واحدة: 525.00 → 10.19 رسوم = 1.94%
      · تحويل مجمّع: 74,033.39 → 1,305.16 رسوم = **1.763%**
      السبب إن التحويل بيجمّع كروت بنسب مختلفة (ميزة أرخص من فيزا/ماستر).
      وكمان فيه بند **"تسويات"** (مرتجعات/تسويات بنكية) مالوش علاقة بالعمولة.
      عشان كده المالك بيكتب **الإجمالي والصافي زي ما هما من شاشة Paymob**
      والفرق هو الخصومات — من غير أي تخمين. النسبة تحت للتقدير بس.
   ============================================================ */
const PAYMOB_FEE_PCT = 1.94;

function paymobFeeOn(gross, pct){
  const p = (pct == null ? PAYMOB_FEE_PCT : Number(pct)) / 100;
  return Math.round((Number(gross) || 0) * p * 100) / 100;
}
// اللي نزل عندك صافي → الإجمالي اللي اتقفل بيه من رصيدك عند Paymob
function paymobGrossFromNet(net, pct){
  const p = (pct == null ? PAYMOB_FEE_PCT : Number(pct)) / 100;
  if(p >= 1) return 0;
  return Math.round(((Number(net) || 0) / (1 - p)) * 100) / 100;
}

/* 📈 نسبتك الفعلية — بتتعلّم من تحويلاتك المسجّلة
   ------------------------------------------------------------
   العملية الواحدة بالكارت 1.94% (3 إيصالات بيضبطوا بالمليم)، لكن
   التحويل المجمّع طلع 1.763% — يعني جواه عمليات بنسبة أقل (ميزة).
   فبدل ما نقدّر برقم ثابت غلط، بنحسب المتوسط الموزون من اللي اتسجّل
   فعلًا. ولحد ما يبقى فيه تحويل واحد على الأقل، بنستخدم 1.94%. */
function paymobEffectivePct(settlements, fallback){
  let g = 0, d = 0;
  (settlements || []).forEach(function(x){
    const gr = Number(x && x.gross) || 0;
    if(gr <= 0) return;
    const nt = Number(x.net) || 0;
    if(nt <= 0 || nt > gr) return;
    g += gr; d += (gr - nt);
  });
  if(g <= 0) return (fallback == null ? PAYMOB_FEE_PCT : Number(fallback));
  return Math.round((d / g) * 10000) / 100;
}



/* ============================================================
   📒 دفتر اليومية — الفلوس يوم بيوم
   ------------------------------------------------------------
   الفكرة: صفحة زي شيت الإكسل. كل يوم سطر، كل خانة تتعدّل بالإيد،
   والرصيد بيمشي لوحده من أول يوم للآخر.

   ⚠️ ٤ قرارات محاسبية مبنية جوه، ولو اتغيّرت الأرقام تكدب:

   ١. **الفيزا مش كاش.** فلوس الفيزا بتروح لـPaymob مش لدرج الفرع.
      فبتتحسب في دفتر تاني (رصيدك عند Paymob)، وبتدخل إيدك يوم
      التحويل بس — بالصافي بعد العمولة.

   ٢. **المتوقع متفصول عن المؤكد.** بنحسب رصيدين لكل يوم:
      · `balance`    = المؤكد بس (فلوس فعلًا في إيدك)
      · `balanceExp` = المؤكد + المتوقع من Paymob
      خلطهم في رقم واحد بيخلّي المالك يصرف فلوس لسه ماوصلتش.

   ٣. **التعديل اليدوي بيغلب المحسوب دايمًا** — بس بيتسجّل مين وامتى
      وإيه الرقم المحسوب الأصلي. من غير كده الشيت بيبقى مش قابل للمراجعة.

   ٤. **العدّ الفعلي مش تعديل للرصيد.** لما يعدّ الدرج وياكتب الرقم،
      بنطلّع **الفرق** (عجز/أوفر) بدل ما نبلع الغلط بهدوء. الفرق ده
      هو أداة الحكم على الفلوس — من غيره الشيت بيوصف مش بيراقب.
   ============================================================ */

/* 📅 مفتاح يوم الشغل بتوقيت القاهرة (بيحترم الساعة الفاصلة)
   ⚠️ ممنوع نستخدم ساعة الجهاز — نفس الباج اللي ضرب تطبيق sales لما
      المالك كان بره مصر. الفلوس لازم تتحسب بيوم المحل مهما كان
      الجهاز فين. */
function ofDayKeyOf(ts){
  const cut = Number(_ofDayCut) || 0;
  const p = _ofShopParts(Number(ts) || 0);
  // قبل الساعة الفاصلة = لسه اليوم اللي فات (فاتورة ٢ الفجر = يوم إمبارح)
  let y = p.y, m = p.m, d = p.d;
  if(p.hh < cut){
    const back = new Date(Date.UTC(y, m - 1, d) - 86400000);
    y = back.getUTCFullYear(); m = back.getUTCMonth() + 1; d = back.getUTCDate();
  }
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
// اليوم اللي بعده / قبله بالمفتاح — حساب تقويمي صافي، مالوش دعوة بأي توقيت
function ofDayShift(key, n){
  const [y, m, d] = String(key).split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + (Number(n) || 0) * 86400000;
  const x = new Date(t);
  return x.getUTCFullYear() + '-' + String(x.getUTCMonth() + 1).padStart(2, '0')
    + '-' + String(x.getUTCDate()).padStart(2, '0');
}
// رقم اليوم في الأسبوع للمفتاح (0=الأحد … 5=الجمعة، 6=السبت)
function ofDowOf(key){
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/* 🗓️ إجازة الأسبوع — الجمعة والسبت افتراضيًا (البنوك في مصر)
   قابلة للتغيير من الإعدادات لو Paymob أو البنك غيّر. */
const OF_WEEKEND_DEFAULT = [5, 6];
function ofIsWeekend(key, cfg){
  const w = (cfg && Array.isArray(cfg.weekendDays) && cfg.weekendDays.length)
    ? cfg.weekendDays : OF_WEEKEND_DEFAULT;
  return w.indexOf(ofDowOf(key)) >= 0;
}
// أول يوم عمل بعد المفتاح ده
function ofNextBizDay(key, cfg){
  let k = ofDayShift(key, 1), guard = 0;
  while(ofIsWeekend(k, cfg) && guard++ < 14) k = ofDayShift(k, 1);
  return k;
}

/* 💳 دورة Paymob الأسبوعية — الأسبوع ينتهي الاثنين والتحويل الثلاثاء
   ----------------------------------------------------------------
   🔒 دورة غير متداخلة عشان مفيش يوم يتحسب مرتين:
      الثلاثاء → الاثنين = مبيعات أسبوع كامل
      الثلاثاء اللي بعده = يوم التحويل/التأكيد.
   مثال: بيع الاثنين → تحويل الثلاثاء التالي.
          بيع الثلاثاء → تحويل الثلاثاء اللي بعده بأسبوع.
   كلمة "الأسبوع من الاثنين للاثنين" في التشغيل معناها عمليًا:
   من بعد تحويل الثلاثاء السابق لحد نهاية الاثنين — وده يمنع تكرار الاثنين. */
function ofSettleDayFor(saleDayKey, cfg){
  let k = ofDayShift(String(saleDayKey), 1), guard = 0;
  while(ofDowOf(k) !== 2 && guard++ < 8) k = ofDayShift(k, 1); // 2 = الثلاثاء
  return k;
}
function ofPaymobCycleForPayout(payoutKey){
  const payout = String(payoutKey);
  return { payout:payout, start:ofDayShift(payout,-7), end:ofDayShift(payout,-1) };
}
function ofLatestTuesdayKey(todayKey){
  let k=String(todayKey), guard=0;
  while(ofDowOf(k)!==2 && guard++<8) k=ofDayShift(k,-1);
  return k;
}

/* 🔢 تجميع حركة كل يوم من البيانات الخام */
function ofCollectDays(data, fromKey, toKey){
  const days = {};
  const touch = function(k){
    if(!k || k < fromKey || k > toKey) return null;
    if(!days[k]) days[k] = { key:k, cashSales:0, visaSales:0, expenses:0,
      supplierPayments:0, salaries:0, advances:0, rewards:0, pmActual:0, pmGross:0,
      // 🎁 كروت الهدايا — بتتجمّع منفصلة عن المبيعات
      gcSold:0, gcSpent:0 };
    return days[k];
  };
  // نضمن وجود كل يوم في المدى حتى لو مفيهوش حركة (الشيت لازم يبقى متصل)
  for(let k = fromKey; k <= toKey; k = ofDayShift(k, 1)) touch(k);

  (data.sales || []).forEach(function(s){
    const r = touch(ofDayKeyOf(_saleMs(s)));
    if(!r) return;
    const p = s.payments || {};
    r.cashSales += Number(p.cash) || 0;      // 💵 كاش الدرج
    r.visaSales += Number(p.visa) || 0;      // 💳 بيروح لـPaymob

    /* 🎁 كروت الهدايا — الفلوس في إيدك بس **مش بتاعتك**
       ------------------------------------------------------------
       بيع كارت: الفلوس دخلت الدرج، بس البضاعة لسه ماتباعتش → ده
       **دين عليك**. الكاش فوق صح (دخل فعلًا)، بس لو حسبناه بيع
       كمان، الرقم بيتعدّ مرتين: مرة يوم البيع ومرة يوم الصرف.

       صرف كارت: البضاعة خرجت والدين اتسدّد، بس **مفيش كاش داخل**
       يوم الصرف (اتقبض قبل كده).

       ⚠️ من غير الحتة دي، الشيت بيوريك رصيد أكبر من اللي ليك —
          وإنت بنيت التبويب ده عشان تبطّل تشوف أرقام كدّابة. */
    (s.items || []).forEach(function(it){
      if(!it) return;
      const line = Math.abs(Number(it.price) || 0) * (Number(it.qty) || 0);
      if(it.isGiftCard)    r.gcSold  += line;   // اتباع كارت → الدين زاد
      if(it.isCreditSpend) r.gcSpent += line;   // اتصرف رصيد → الدين قلّ
    });
  });

  const bucket = function(arr, field, filter){
    (arr || []).forEach(function(x){
      if(filter && !filter(x)) return;
      const r = touch(ofDayKeyOf(_ohTs(x)));
      if(r) r[field] += Number(x.amount) || 0;
    });
  };
  bucket(data.expenses,   'expenses');
  // 📦 من v65: دفعة التاجر الجديدة تقلّل السيولة تلقائيًا.
  // cashTracked=true متعمد: القديم مايتحسبش بأثر رجعي عشان ناس كانت
  // بتسجّل نفس الدفعة كمصروف يدوي، وإلا هنخصم التاريخ مرتين.
  bucket(data.mtxns, 'supplierPayments', function(t){
    return !!t && t.type !== 'order' && t.cashTracked === true;
  });
  bucket(data.salaryPays, 'salaries');
  bucket(data.advances,   'advances');
  // المكافآت المعتمدة بس — اللي مستنية موافقة ماخرجتش من الدرج
  bucket(data.rewards,    'rewards', function(r){
    return !!r && (!r.status || r.status === 'approved');
  });

  // 💳 التحويلات اللي نزلت فعلًا
  (data.settlements || []).forEach(function(x){
    const r = touch(ofDayKeyOf(_ohTs(x)));
    if(!r) return;
    const net = Number(x.net) || 0;
    r.pmActual += net;
    r.pmGross  += Number(x.gross) || paymobGrossFromNet(net, x.feePct);
  });

  return days;
}

/* 🔮 توقّع تحويلات Paymob الجاية
   ------------------------------------------------------------
   ⚠️ أخطر حتة في الملف كله: **الحساب المزدوج**. لو توقّعنا تحويل
      وبعدين اتسجّل التحويل الحقيقي، الفلوس تتعدّ مرتين والمالك
      يفتكر معاه أكتر من الحقيقة.

   🔴🔴 إصلاح: «المستحق» كان بيتحسب **كل الفيزا − التحويلات المسجّلة
      يدويًا**. الرقم ده كان بيفترض إن كل تحويل نزل لازم المالك يسجّله
      بإيده من داشبورد Paymob. المالك **مش بيفتح الداشبورد أصلًا**، فالمطروح
      كان صفر على طول والرقم بقى «كل فيزا الشهر» — عشرات الآلاف بدل بيع
      يوم أو يومين. رقم خرافي مالوش علاقة بالواقع، والمالك بيصرف على أساسه.

   دلوقتي المستحق = **اللي لسه ماوصلش حسب جدول التحويل نفسه**
      (تاني يوم عمل — `ofSettleDayFor`). ده رقم بيتحسب لوحده من غير
      أي إدخال من المالك، وبيصفّر نفسه لوحده أول ما اليوم يعدّي.
      تسجيل التحويل بقى **تحسين اختياري** مش شرط لصحّة الرقم.

   طبقتين حماية لسه زي ما هما:
   ١. مبنتوقّعش لأي يوم بيع اتقفل تحويله — بنبدأ من بعد آخر تحويل مسجّل.
   ٢. **سقف صلب**: مجموع المتوقّع عمره ما يزيد عن المستحق الفعلي. */
function ofPredictSettlements(days, data, cfg, lastSettledKey, todayKey){
  const pct = paymobEffectivePct(data.settlements, PAYMOB_FEE_PCT);
  const keys = Object.keys(days).sort();
  const tKey = String(todayKey || '');

  /* الرصيد المستحق الحقيقي — ده السقف.
     يوم بيع بيدخل هنا بشرطين: تحويله ماتسجّلش، **و**يوم نزوله لسه
     ماجاش. لو يوم النزول عدّى، الفلوس نزلت البنك خلاص — مش مستحقة. */
  let room = 0;
  keys.forEach(function(k){
    const v = Number(days[k].visaSales) || 0;
    if(v <= 0) return;
    if(lastSettledKey && k <= lastSettledKey) return;
    // ⭐ أسبوعي: ميعاد الثلاثاء «توقّع» فقط. الفلوس تفضل عند Paymob
    // لحد ما المالك يأكد التحويل الفعلي.
    room += v;
  });
  const outstanding = Math.round(room * 100) / 100;

  const out = {};
  keys.forEach(function(k){
    const v = days[k].visaSales;
    if(v <= 0) return;
    if(lastSettledKey && k <= lastSettledKey) return;   // طبقة ١
    const gross = Math.min(v, room);                    // طبقة ٢ — السقف
    if(gross <= 0) return;
    room -= gross;
    const land = ofSettleDayFor(k, cfg);
    if(!out[land]) out[land] = { net:0, gross:0, from:[] };
    out[land].gross += gross;
    out[land].net   += Math.round(gross * (1 - pct / 100) * 100) / 100;
    out[land].from.push(k);
  });
  Object.keys(out).forEach(function(k){
    out[k].net   = Math.round(out[k].net * 100) / 100;
    out[k].gross = Math.round(out[k].gross * 100) / 100;
  });
  const fromDays = [];
  Object.keys(out).sort().forEach(function(k){ out[k].from.forEach(function(d){ fromDays.push(d); }); });
  return { byDay: out, pct: pct, outstanding: outstanding, fromDays: fromDays.sort() };
}

const OF_LEDGER_FIELDS = ['cashSales','visaSales','pmIn','expenses','supplierPayments','salaries',
                          'advances','rewards','otherIn','otherOut'];

/* 📒 الدفتر الكامل — ده اللي الشاشة بتتبني منه
   base      : { amount, atMs, paymobOpening }  نقطة البداية
   data      : D (المبيعات والمصاريف… إلخ)
   overrides : { '2026-08-11': { ov:{field:val}, counted:n, note:'' } }
   cfg       : { predict, carryCount } — Paymob settlement weekly Tuesday
   ⚠️ بيرجع أيام **من الأقدم للأحدث** عشان الرصيد يتراكم صح. */
function ofCashLedger(base, data, overrides, cfg, nowTs, aheadDays){
  cfg = cfg || {};
  const now = Number(nowTs) || Date.now();
  const openAt = Number(base && base.atMs) || 0;
  const opening = Number(base && base.amount) || 0; // ⭐ amount = السيولة المؤكدة عند نقطة البداية (كاش + بنك تشغيلي), مش درج الكاش وحده
  const fromKey = ofDayKeyOf(openAt);
  const todayKey = ofDayKeyOf(now);
  // بنمد قدام كام يوم عشان التوقّعات تبان قبل ما توصل
  const ahead = Math.max(0, Number(aheadDays == null ? 5 : aheadDays));
  const toKey = ofDayShift(todayKey, ahead);

  const days = ofCollectDays(data, fromKey, toKey);

  // آخر يوم اتسجّل فيه تحويل حقيقي — بعده بس بنتوقّع
  let lastSettledKey = '';
  (data.settlements || []).forEach(function(x){
    const k = ofDayKeyOf(_ohTs(x));
    const sk = String(x && x.forDay || '') || ofDayShift(k, -1);
    if(sk > lastSettledKey) lastSettledKey = sk;
  });

  // ⚠️ باج مسكه الاختبار: كنت بصفّر `outstanding` لما التوقّع يبقى مقفول —
  //    فـ"فلوسك عند Paymob" كانت بتبان صفر وهي مش صفر، وإجمالي الثروة
  //    بيقلّ بقيمة كل الفيزا اللي لسه مانزلتش. المستحق حقيقة قايمة
  //    مالهاش دعوة بإن إحنا بنتوقّع ولا لأ.
  const pred = ofPredictSettlements(days, data, cfg, lastSettledKey, todayKey);
  if(cfg.predict === false) pred.byDay = {};

  const ovAll = overrides || {};
  const rows = Object.keys(days).sort().map(function(k){
    const d = days[k];
    const o = ovAll[k] || {};
    const ov = o.ov || {};
    const p = pred.byDay[k] || null;

    /* 🧊 اليوم "المتجمّد"
       ⚠️ office بيحمّل مبيعات آخر ٣٠ يوم بس. من غير الحتة دي، أول ما اليوم
          يعدّي الـ٣٠، فواتيره بتقع بره النافذة و**سطره في الشيت بيرجع صفر
          من غير أي رسالة** — يعني الشيت بيكدب بهدوء بعد شهر بالظبط.
          الحل: أول ما اليوم يقفل، أرقامه بتتحفظ في مستنده، وبعد كده
          الشيت بيقراها من المحفوظ مش بيعيد حسابها من بيانات ناقصة.
       الترتيب مقصود: المحفوظ يغلب المحسوب، والتعديل اليدوي يغلب الاتنين. */
    const fz = o.frozen || null;
    const raw = fz ? {
      cashSales: Number(fz.cashSales) || 0, visaSales: Number(fz.visaSales) || 0,
      pmIn: Number(fz.pmIn) || 0,
      expenses: Number(fz.expenses) || 0, supplierPayments:Number(fz.supplierPayments)||0,
      salaries: Number(fz.salaries) || 0,
      advances: Number(fz.advances) || 0, rewards: Number(fz.rewards) || 0,
      otherIn: 0, otherOut: 0
    } : {
      cashSales: d.cashSales, visaSales: d.visaSales,
      pmIn: d.pmActual,
      expenses: d.expenses, supplierPayments:d.supplierPayments, salaries: d.salaries,
      advances: d.advances, rewards: d.rewards,
      otherIn: 0, otherOut: 0
    };
    const val = {}, edited = {};
    OF_LEDGER_FIELDS.forEach(function(f){
      const has = Object.prototype.hasOwnProperty.call(ov, f) && ov[f] !== null && ov[f] !== '';
      val[f] = has ? (Number(ov[f]) || 0) : raw[f];
      edited[f] = has;
    });

    // 💳 المتوقّع بيتحسب **بس** لو مفيش تحويل حقيقي اتسجّل لليوم ده
    //    ولا تعديل يدوي على الخانة — الحقيقة دايمًا بتغلب التوقّع.
    const showPred = !!p && val.pmIn === 0 && !edited.pmIn;
    const pmExp = showPred ? p.net : 0;

    const inConf  = val.cashSales + val.pmIn + val.otherIn;
    const outAll  = val.expenses + val.supplierPayments + val.salaries + val.advances + val.rewards + val.otherOut;
    const counted = (o.counted === 0 || o.counted) ? Number(o.counted) : null;

    return {
      key: k,
      // 🎁 حركة الدين اليومية (مش داخلة في الرصيد — الكاش محسوب فوق)
      gcSold: Math.round(d.gcSold * 100) / 100,
      gcSpent: Math.round(d.gcSpent * 100) / 100,
      frozen: !!fz,
      // 🚧 يوم قديم مالحقش يتجمّد وفواتيره خرجت من نافظة التحميل —
      //    أرقامه ناقصة، فبنعلّمه بدل ما نعرضه كأنه حقيقة.
      untrusted: !fz && k < ofDayShift(todayKey, -OF_SALES_WINDOW_DAYS),
      dayMs: ofBizDayRange(k).start,
      weekend: ofIsWeekend(k, cfg),
      future: k > todayKey,
      isToday: k === todayKey,
      raw: raw, val: val, edited: edited,
      pmExpected: pmExp,
      pmExpectedGross: showPred ? p.gross : 0,
      pmFrom: showPred ? p.from : [],
      inConf: Math.round(inConf * 100) / 100,
      out: Math.round(outAll * 100) / 100,
      net: Math.round((inConf - outAll) * 100) / 100,
      netExp: Math.round((inConf + pmExp - outAll) * 100) / 100,
      counted: counted,
      note: o.note || ''
    };
  });

  // 🏃 الرصيد التراكمي — مرّة للمؤكد ومرّة للمتوقّع
  let run = opening, runExp = opening;
  // 🎁 الدين التراكمي: بيبدأ من رصيد افتتاحي (كروت مباعة قبل التصفير)
  let liab = Number(base && base.giftLiabilityOpening) || 0;
  rows.forEach(function(r){
    liab = Math.round((liab + r.gcSold - r.gcSpent) * 100) / 100;
    // 🛡️ الدين عمره ما ينزل تحت الصفر — لو حصل يبقى فيه كروت
    //    اتصرفت وإحنا مش شايفين بيعها (اتباعت قبل التصفير مثلًا).
    //    بنعلّمها بدل ما نخبّيها.
    r.giftLiability = Math.max(0, liab);
    r.giftLiabilityRaw = liab;
    run += r.net; runExp += r.netExp;
    r.balance = Math.round(run * 100) / 100;
    r.balanceExp = Math.round(runExp * 100) / 100;
    // 🔍 العدّ الفعلي: بنطلّع الفرق، وبعدين بنكمّل من الرقم المعدود
    //    (زي دفتر الخزنة — المراجعة بتصحّح المسار مش بتلغي الغلط)
    if(r.counted !== null){
      r.variance = Math.round((r.counted - r.balance) * 100) / 100;
      if(cfg.carryCount !== false){
        const diff = r.counted - run;
        run = r.counted; runExp += diff;
        r.balance = Math.round(run * 100) / 100;
        r.balanceExp = Math.round(runExp * 100) / 100;
      }
    } else { r.variance = null; }
  });

  const lastRow = rows.length ? rows[rows.length - 1] : null;
  /* 🏦 رصيد البداية اللي المالك كتبه وقت «ابدأ من الصفر»
     ⚠️ ده كان بيتضاف على المستحق **للأبد**. لكن معناه «فيزا مباعة ولسه
        مانزلتش **يوم ما بدأت**» — بعد ما يوم نزولها يعدّي، الفلوس دي
        نزلت خلاص وبقى إضافتها كذب متراكم. بنسقّطه بنفس قاعدة الجدول. */
  const openDayKey = ofDayKeyOf(openAt);
  const openLanded = !!lastSettledKey && lastSettledKey >= openDayKey;
  const pmOpenRaw  = Number(base && base.paymobOpening) || 0;
  return { rows: rows, opening: opening, openKey: fromKey, todayKey: todayKey,
           giftLiability: lastRow ? lastRow.giftLiability : 0,
           giftLiabilityRaw: lastRow ? lastRow.giftLiabilityRaw : 0,
           effPct: pred.pct, outstanding: pred.outstanding,
           paymobOpening: openLanded ? 0 : pmOpenRaw,
           pmPendingDays: pred.fromDays || [],
           paymobOpeningLanded: openLanded && pmOpenRaw > 0,
           now: rows.length ? rows[rows.length - 1].balance : opening };
}

/* 🧊 مين محتاج يتجمّد دلوقتي؟
   بنجمّد الأيام اللي **قفلت خلاص** وقربت تخرج من نافذة التحميل.
   العتبة أقل من الـ٣٠ بهامش أمان — لو المالك مافتحش البرنامج كام يوم
   الأيام تفضل لسه جوه النافذة لما يفتحه.
   ⚠️ عمرنا ما بنجمّد النهاردة ولا يوم جاي — لسه بيتحرك. */
const OF_FREEZE_AFTER_DAYS = 20;
const OF_SALES_WINDOW_DAYS = 30;
function ofFreezeDue(ledger, overrides, nowTs){
  const now = Number(nowTs) || Date.now();
  const todayKey = ofDayKeyOf(now);
  const cutKey = ofDayShift(todayKey, -OF_FREEZE_AFTER_DAYS);
  // ⚠️⚠️ الحد الأدنى ده **حرج**: اليوم اللي خرج خلاص من نافذة الـ٣٠ يوم
  //    فواتيره مش محمّلة، فأرقامه دلوقتي **أصفار كدّابة**. لو جمّدناه
  //    بنكون ثبّتنا الصفر ده للأبد — وده أوحش من إننا مانجمّدهوش.
  //    بنجمّد بس اللي **لسه جوه النافذة**: بين ٢٠ و٢٨ يوم.
  //    (٢٨ مش ٣٠ — هامش أمان عشان حدود اليوم والتوقيت.)
  const floorKey = ofDayShift(todayKey, -(OF_SALES_WINDOW_DAYS - 2));
  const ov = overrides || {};
  return (ledger && ledger.rows ? ledger.rows : []).filter(function(r){
    if(r.key >= todayKey) return false;              // لسه بيتحرك
    if(r.key > cutKey) return false;                 // لسه بدري
    if(r.key < floorKey) return false;               // ⭐ خرج من النافذة — أرقامه مش موثوقة
    if(r.frozen) return false;                       // متجمّد خلاص
    if((ov[r.key] || {}).frozen) return false;
    return true;
  }).map(function(r){
    return { key: r.key, frozen: {
      cashSales: r.raw.cashSales, visaSales: r.raw.visaSales, pmIn: r.raw.pmIn,
      expenses: r.raw.expenses, supplierPayments:r.raw.supplierPayments,
      salaries: r.raw.salaries, advances: r.raw.advances, rewards: r.raw.rewards, at: now } };
  });
}

/* 🥇 الدهب — قيمة الرصيد بسعر الجرام
   ------------------------------------------------------------
   ⚠️ بنقيّم بسعر **الشراء** (اللي التاجر بيشتري بيه منك) مش سعر البيع.
      الفرق بينهم ٥٠–٢٠٠ جنيه في الجرام، ولو حسبنا بسعر البيع الرقم
      بيطلع أكبر من اللي هتقبضه فعلًا لو بعت — وده بالظبط نوع الكذب
      اللي التبويب ده موجود عشان يمنعه.
   ⚠️ السعر بيتقدّم بطابع وقته. لو بقاله أكتر من يوم بيتعلّم "قديم"
      بدل ما يتحسب كأنه لحظي. */
const OF_GOLD_STALE_MS = 26 * 3600 * 1000;
function ofGoldValue(cfg, nowTs){
  const g = Number(cfg && cfg.goldGrams) || 0;
  const price = Number(cfg && cfg.goldBuyPrice) || 0;
  const at = Number(cfg && cfg.goldPriceAt) || 0;
  const now = Number(nowTs) || Date.now();
  return {
    grams: g, price: price, at: at,
    stale: !at || (now - at) > OF_GOLD_STALE_MS,
    value: Math.round(g * price * 100) / 100,
    source: (cfg && cfg.goldSource) || ''
  };
}

/* 🧮 إجمالي ثروتك — تلات طبقات متفصولة عن بعض عن قصد
   الكاش في إيدك · المستحق عند Paymob · قيمة الدهب
   الفصل ده مهم: الدهب مش سيولة، وفلوس Paymob لسه ماوصلتش. */
function ofWealth(ledger, cfg, nowTs){
  const cash = ledger ? ledger.now : 0;
  const pm = (ledger ? ledger.outstanding : 0) + (ledger ? ledger.paymobOpening : 0);
  const pmNet = Math.round(pm * (1 - (ledger ? ledger.effPct : 0) / 100) * 100) / 100;
  const gold = ofGoldValue(cfg, nowTs);
  // 🎁 دين كروت الهدايا — **بيتطرح** من الإجمالي
  //    الفلوس دي في إيدك بس مش بتاعتك: العميلة دفعت ولسه ماخدتش
  //    بضاعتها. لو ما طرحناهاش، الشيت بيوريك فلوس أكتر من اللي ليك
  //    وتصرف على أساسها — وده بالظبط اللي التبويب موجود يمنعه.
  const giftLiab = Math.max(0, Number(ledger && ledger.giftLiability) || 0);
  const owned = Math.round((cash + pmNet + gold.value - giftLiab) * 100) / 100;
  return {
    cash: cash, paymobGross: Math.round(pm * 100) / 100, paymobNet: pmNet,
    gold: gold.value, goldInfo: gold,
    giftLiability: giftLiab,
    /* 🗓️ أيام البيع اللي فلوسها لسه في الطريق — عشان الرقم يبقى
       قابل للمراجعة: «فيزا الخميس والجمعة» رقم تقدر تتأكد منه،
       الرقم لوحده لأ. */
    pmDayKeys: (ledger && ledger.pmPendingDays) || [],
    pmOpeningLanded: !!(ledger && ledger.paymobOpeningLanded),
    // 💵 اللي في إيدك فعلًا (قبل خصم الدين) — للمطابقة مع الدرج
    gross: Math.round((cash + pmNet + gold.value) * 100) / 100,
    total: owned
  };
}

// الأكثر مبيعًا لفرع: تجميع قطع آخر N يوم من الفواتير (استبعاد المرتجع والعكس والاستبدال)
function topSellers(sales, branch, limit){
  const agg = {};
  (sales||[]).forEach(function(s){
    if(!s || s.branch !== branch || s.reversed || s.isReversal) return;
    (s.items||[]).forEach(function(it){
      if(!it || it.isRedemption) return;
      const key = String(it.barcode || it.name || '');
      if(!key) return;
      if(!agg[key]) agg[key] = { barcode: String(it.barcode||''), name: it.name || key, pieces: 0, revenue: 0 };
      const q = Number(it.qty)||0;
      const sign = it.isReturn ? -1 : 1;
      agg[key].pieces  += sign * q;
      agg[key].revenue += sign * q * (Number(it.price)||0);
    });
  });
  return Object.values(agg)
    .filter(function(x){ return x.pieces > 0; })
    .sort(function(a,b){ return b.pieces - a.pieces; })
    .slice(0, limit || 10);
}

// كمية فرع من مستند صنف (نفس منطق POS)
function branchQtyOf(p, br){
  if(p && p.qtyByBranch) return Number(p.qtyByBranch[br]) || 0;
  return Number(p && p.quantity) || 0;
}

// ملخص مرتبات: أساسي − سلف الشهر = صافي تقريبي
function salarySummary(employees, advances, mk){
  return (employees||[])
    .filter(function(e){ return e && e.active !== false && !e.isAdminAccount; })
    .map(function(e){
      const adv = (advances||[]).reduce(function(sum,a){
        if(!a || a.employeeId !== e.id) return sum;
        if(String(a.date||'').slice(0,7) !== mk) return sum;
        return sum + (Number(a.amount)||0);
      }, 0);
      const base = Number(e.baseSalary)||0;
      return { id:e.id, name:e.name||'', branch:e.branch||'', base:base, advances:adv, net: base - adv };
    })
    .sort(function(a,b){ return (a.branch+a.name) < (b.branch+b.name) ? -1 : 1; });
}


/* ============================================================
   🏦 Paymob أسبوعي — توقّع الثلاثاء + تأكيد المالك
   ============================================================ */
function ofPaymobWeeklyCycles(data, todayKey){
  const pct=paymobEffectivePct((data&&data.settlements)||[],PAYMOB_FEE_PCT);
  const map={};
  (data&&data.sales||[]).forEach(function(x){
    if(!x || x.reversed || x.isReversal) return;
    const visa=Number(x.payments&&x.payments.visa)||0;
    if(visa<=0) return;
    const saleKey=ofDayKeyOf(_saleMs(x));
    const payout=ofSettleDayFor(saleKey,{});
    const c=ofPaymobCycleForPayout(payout);
    if(!map[payout]) map[payout]={ payout:payout,start:c.start,end:c.end,gross:0,pct:pct };
    map[payout].gross += visa;
  });
  const confirmed={};
  (data&&data.settlements||[]).forEach(function(x){
    const end=String(x.weeklyCycleEnd||x.forDay||'');
    if(end) confirmed[end]=x;
  });
  return Object.keys(map).sort().map(function(k){
    const c=map[k];
    c.gross=Math.round(c.gross*100)/100;
    c.expectedFee=paymobFeeOn(c.gross,pct);
    c.expectedNet=Math.round((c.gross-c.expectedFee)*100)/100;
    c.confirmed=confirmed[c.end]||null;
    c.due=!!todayKey && c.payout<=todayKey && !c.confirmed;
    c.future=!!todayKey && c.payout>todayKey;
    return c;
  });
}
function ofPaymobWeeklyDue(data,todayKey){
  return ofPaymobWeeklyCycles(data,todayKey).filter(function(c){return c.due&&c.gross>0;});
}
function ofPaymobNextCycle(data,todayKey){
  const all=ofPaymobWeeklyCycles(data,todayKey).filter(function(c){return !c.confirmed&&c.gross>0;});
  if(!all.length) return null;
  const due=all.filter(function(c){return c.due;});
  if(due.length) return due[0];
  return all[0];
}

// بناء الوارد الموحّد من المصادر الأربعة
function buildInbox(data){
  const out = [];
  // 🏦 الثلاثاء: بس التحويلات الأسبوعية اللي لسه محتاجة تأكيد.
  try{
    const tk=ofDayKeyOf(Date.now());
    ofPaymobWeeklyDue(data,tk).forEach(function(c){
      out.push({kind:'paymobWeekly',id:c.end,ts:ofBizDayRange(c.payout).start,branch:'كل الفروع',who:'Paymob',
        title:'🏦 أكد تحويل Paymob الأسبوعي',
        sub:'الأسبوع المنتهي '+ofDayName(c.end)+' · إجمالي '+egp(c.gross)
          +' · عمولة متوقعة '+egp(c.expectedFee)+' · المتوقع ينزل '+egp(c.expectedNet),
        actionable:true, cycle:c});
    });
  }catch(e){}
  (data.leaves||[]).forEach(function(l){
    if(l.status !== 'pending') return;
    const sh = function(k){ return k==='morning' ? '🌅 صباحي' : (k==='evening' ? '🌆 مسائي' : ''); };
    const tl = l.type==='dayoff' ? '🌴 إجازة يوم' : (l.type==='changeDayoff' ? '📅 تغيير يوم الإجازة'
             : '🔄 تبديل شيفت' + (l.toShift ? ' ('+sh(l.fromShift)+' ← '+sh(l.toShift)+')' : ''));
    out.push({ kind:'leave', id:l.id, ts:l.ts||0, branch:l.branch||'', who:l.empName||'',
               title:tl, sub:(l.dateKey||'') + (l.reason ? ' · '+l.reason : ''), actionable:true });
  });
  (data.regs||[]).forEach(function(r){
    if(r.status !== 'pending') return;
    out.push({ kind:'reg', id:r.id, ts:r.ts||0, branch:r.branch||'', who:r.name||'',
               title:'🔒 طلب تسجيل موظف جديد', sub:'الاعتماد من برنامج sales', actionable:false });
  });
  (data.orders||[]).forEach(function(o){
    if(o.status !== 'pending') return;
    out.push({ kind:'order', id:o.id, ts:o.ts||0, branch:o.branch||'', who:o.employeeName||'',
               title:'🛒 أوردر موظف بخصم — ' + egp(o.total||0), sub:'الاعتماد من برنامج sales (بيأثر على السلف)', actionable:false });
  });
  (data.shorts||[]).forEach(function(x){
    if(x.status !== 'open') return;
    x = Object.assign({}, x, { barcode: shortCode(x) });
    out.push({ kind:'short', id:x.id, ts:x.ts||0, branch:x.branch||'', who:x.empName||'',
               title:'📦 نواقص: ' + (x.productName||('كود '+x.barcode)) + ' × ' + (x.qty||1),
               // 🔢 الكود مع الاسم — من غيره الطلب مش قابل للتنفيذ عند المورّد
               sub:(x.barcode ? 'كود ' + x.barcode + ' · ' : '')
                   + (x.detail ? x.detail+' · ' : '')
                   + 'مخزون وقت الطلب: ' + (x.currentStock==null?'—':x.currentStock),
               actionable:true });
  });
  return out.sort(function(a,b){ return b.ts - a.ts; });
}

// 💹 تقرير الربح والخسارة لشهر معيّن
// الإيراد: صافي مبيعات كل فرع (استبعاد المرتجع وصف العكس)
// التكاليف: المرتبات الأساسية + بضاعة الشهر (أوردرات التجار) + المصاريف (شاملة الإيجار)
// السلف: بتتعرض كمعلومة (متدفعة مقدمًا من المرتبات) — مش خصم إضافي عشان ميتحسبش مرتين
function profitReport(data, mk){
  const byBranch = {};
  let revenue = 0;
  (data.sales||[]).forEach(function(s){
    if(!s || s.reversed || s.isReversal) return;
    const t = Number(s.total)||0;
    const br = s.branch || '—';
    byBranch[br] = (byBranch[br]||0) + t;
    revenue += t;
  });
  const salaries = (data.employees||[]).reduce(function(sum,e){
    if(!e || e.active === false || e.isAdminAccount) return sum;
    return sum + (Number(e.baseSalary)||0);
  }, 0);
  const advances = (data.advances||[]).reduce(function(sum,a){
    if(!a || String(a.date||'').slice(0,7) !== mk) return sum;
    return sum + (Number(a.amount)||0);
  }, 0);
  const goods = (data.mtxns||[]).reduce(function(sum,t){
    if(!t || t.type !== 'order') return sum;
    const tm = new Date(Number(t.ts)||0);
    const tmk = tm.getFullYear()+'-'+String(tm.getMonth()+1).padStart(2,'0');
    if(tmk !== mk) return sum;
    return sum + (Number(t.amount)||0);
  }, 0);
  const expenses = expensesMonthTotal(data.expenses, mk);
  const profit = revenue - salaries - goods - expenses;
  return { byBranch:byBranch, revenue:revenue, salaries:salaries, advances:advances,
           goods:goods, expenses:expenses, profit:profit };
}

// للاختبارات
if (typeof window !== 'undefined'){
  window.officeCalc = { merchantBalance:merchantBalance, ofArNorm:ofArNorm, ofArabicDigitsOnly:ofArabicDigitsOnly, ofLevenshtein:ofLevenshtein, expensesMonthTotal:expensesMonthTotal,
    ofCashLedger:ofCashLedger, ofSettleDayFor:ofSettleDayFor, ofNextBizDay:ofNextBizDay,
    ofIsWeekend:ofIsWeekend, ofDayKeyOf:ofDayKeyOf, ofDayShift:ofDayShift,
    ofGoldValue:ofGoldValue, ofWealth:ofWealth, ofPredictSettlements:ofPredictSettlements,
    ofFreezeDue:ofFreezeDue,
    paymobFeeOn:paymobFeeOn, paymobGrossFromNet:paymobGrossFromNet,
    paymobEffectivePct:paymobEffectivePct, ofPaymobCycleForPayout:ofPaymobCycleForPayout,
    ofPaymobWeeklyCycles:ofPaymobWeeklyCycles, ofPaymobWeeklyDue:ofPaymobWeeklyDue,
    topSellers:topSellers, branchQtyOf:branchQtyOf, salarySummary:salarySummary, buildInbox:buildInbox, profitReport:profitReport };
}

/* ============================================================
   🔐 البوابة: حساب فرع + كود المالك
   ============================================================ */
// 🔐 الجهاز بيفتكر الدخول — كان بيطلب الإيميل والباسورد وكود المالك كل مرة
// (الباسورد مكانش بيتحفظ خالص، وكود المالك في sessionStorage بيتمسح مع القفل)
const _OF_KEY = 'office_login';
// ============================================================
// 🔐 الدخول
// 🔴 كان الباسورد بيتحفظ في localStorage بـXOR + base64 — **تشويش مش تشفير**،
//    وأي حد ياخد الجهاز يطلّع بيانات الحساب ويدخل بيها من أي مكان في الدنيا
//    وميقدرش حد يوقفه غير بتغيير الباسورد.
//    اتشال خالص. Firebase أصلًا بيحتفظ بالجلسة (refresh token) — والفرق إن
//    التوكن ده **ينفع يتلغي من الكونسول** والباسورد لأ.
// ============================================================
try{
  ofAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
}catch(e){ console.warn('persistence', e); }

// 🧹 تنضيف لمرة واحدة: أي بيانات دخول قديمة متخزنة على الجهاز بتتمسح
try{
  ['office_login','office_creds','office_owner_ok'].forEach(function(k){
    try{ localStorage.removeItem(k); }catch(e){}
  });
  if(typeof _OF_KEY !== 'undefined') localStorage.removeItem(_OF_KEY);
}catch(e){}

// 🔑 بصمة الكود (SHA-256 بملح ثابت) — الكود نفسه عمره ما بيتخزّن ولا بيتبعت
async function ofHash(code){
  const data = new TextEncoder().encode('echarpe-office:' + String(code || ''));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(function(b){
    return b.toString(16).padStart(2,'0'); }).join('');
}

// Firebase بيرجّع الجلسة لوحده مع setPersistence — مفيش أي باسورد بيتخزّن
async function tryAutoOfficeLogin(){
  return !!ofAuth.currentUser;
}

// ============================================================
// 🔐 بوابة كود المالك
// 🔴 كان: علامة office_owner_ok='1' في localStorage — أي حد يكتبها في
//    devtools يعدّي البوابة، وبتفضل للأبد.
//    دلوقتي: جلسة **بصلاحية** فيها بصمة الكود نفسه. لو الكود اتغيّر من
//    الكونسول، كل الجلسات القديمة بتبطل تلقائي.
// ⚠️ بصراحة: أي حاجة على المتصفح ممكن حد يزرعها لو معاه الجهاز مفتوح
//    و devtools. الحماية الحقيقية هي حساب Firebase + قواعد Firestore.
//    البوابة دي لسرقة الجهاز — والانتهاء بعد 10 ساعات هو اللي بيحدّ الضرر.
// ============================================================
let ownerOk = false;
let _gateHash = null;        // البصمة المحفوظة في Firestore
let _gateTries = 0;

function _sessRead(){
  try{
    const o = JSON.parse(sessionStorage.getItem(OF_SESS_KEY) || 'null');
    if(!o || !o.exp || !o.h) return null;
    if(Date.now() > o.exp) return null;                 // انتهت
    if(_gateHash && o.h !== _gateHash) return null;     // الكود اتغيّر
    return o;
  }catch(e){ return null; }
}
function _sessWrite(h){
  try{
    sessionStorage.setItem(OF_SESS_KEY, JSON.stringify({
      h: h, exp: Date.now() + OF_SESS_HOURS * 3600 * 1000
    }));
  }catch(e){}
}

// بتقرا البصمة من Firestore (محتاجة تسجيل دخول Firebase — ودي الحماية الحقيقية)
async function loadGateHash(){
  try{
    const d = await db.collection('pos_test_settings').doc(OF_GATE_DOC).get();
    _gateHash = (d.exists && d.data() && d.data().hash) || null;
  }catch(e){ _gateHash = null; console.warn('gate', e && e.code); }
  return _gateHash;
}

$('#gLogin').addEventListener('click', async function(){
  const em = $('#gEmail').value.trim(), pw = $('#gPass').value;
  $('#gateErr').textContent = '';
  if(!em || !pw){ $('#gateErr').textContent = 'اكتب الإيميل والباسورد'; return; }
  try{
    await ofAuth.signInWithEmailAndPassword(em, pw);
    localStorage.setItem('office_email', em);   // الإيميل بس — مفيش باسورد
    $('#gPass').value = '';
  }catch(e){ $('#gateErr').textContent = 'دخول غلط: ' + (e.code||''); }
});
tryAutoOfficeLogin();

// ============================================================
// 👆 فتح بالبصمة / Face ID — WebAuthn
// ------------------------------------------------------------
// المشكلة: كتابة كود المالك كل مرة مزعجة.
// الحل: بعد ما تفتح بالكود مرة، تقدر تربط بصمة الجهاز. المرة اللي بعدها
// بصمة واحدة وخلاص.
// 🔑 إزاي بيشتغل: WebAuthn بيتحقق من البصمة **محليًا على الجهاز** —
//    البصمة نفسها عمرها ما بتسيب الموبايل ولا بتوصل لأي سيرفر.
//    إحنا بنستخدمه كـ"قفل" على مفتاح مخزّن: البصمة بتفتح الجلسة، والجلسة
//    فيها بصمة الكود اللي في Firestore.
// ⚠️ الأمان: البصمة بديل للكود مش للحساب. حساب Firebase لسه مطلوب —
//    اللي معاه الجهاز من غير حساب مش هيدخل. ولو غيّرت كود المالك،
//    البصمة بتبطل تلقائي (نفس فحص _sessRead).
// ⚠️ ومربوطة بالجهاز ده بس — كل جهاز يسجّل بصمته لوحده.
// ============================================================
const OF_BIO_KEY = 'office_bio_cred';

function ofBioSupported(){
  return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
}
function ofBioEnabled(){
  try{ return !!localStorage.getItem(OF_BIO_KEY); }catch(e){ return false; }
}
function _b64u(buf){
  return btoa(String.fromCharCode.apply(null, new Uint8Array(buf)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function _unb64u(str){
  const s = String(str).replace(/-/g,'+').replace(/_/g,'/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

// 🔗 ربط البصمة — بعد ما البوابة تكون مفتوحة بالكود
async function ofBioEnroll(){
  if(!ofBioSupported()){ alert('الجهاز ده مش بيدعم البصمة في المتصفح'); return false; }
  if(!ownerOk){ alert('افتح بالكود الأول، وبعدين اربط البصمة'); return false; }
  try{
    const ch = crypto.getRandomValues(new Uint8Array(32));
    const uid = crypto.getRandomValues(new Uint8Array(16));
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: ch,
        rp: { name: 'echarpe office' },
        user: { id: uid, name: 'office', displayName: 'echarpe office' },
        pubKeyCredParams: [{ type:'public-key', alg:-7 }, { type:'public-key', alg:-257 }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',   // 👆 بصمة/وش الجهاز نفسه
          userVerification: 'required'           // ⚠️ لازم تحقق فعلي مش مجرد وجود الجهاز
        },
        timeout: 60000,
        attestation: 'none'
      }
    });
    if(!cred || !cred.rawId) return false;
    localStorage.setItem(OF_BIO_KEY, JSON.stringify({
      id: _b64u(cred.rawId),
      h: _gateHash || null,        // 🔑 بصمة الكود وقت الربط — لو الكود اتغيّر تبطل
      at: Date.now()
    }));
    return true;
  }catch(e){
    console.warn('bio enroll', e);
    alert('ماتربطتش: ' + (e && (e.name || e.message) || ''));
    return false;
  }
}

// 👆 الفتح بالبصمة
async function ofBioUnlock(){
  if(!ofBioSupported() || !ofBioEnabled()) return false;
  let rec = null;
  try{ rec = JSON.parse(localStorage.getItem(OF_BIO_KEY) || 'null'); }catch(e){}
  if(!rec || !rec.id) return false;
  // ⚠️ الكود اتغيّر بعد الربط؟ البصمة تبطل — نفس منطق إبطال الجلسات
  if(_gateHash && rec.h && rec.h !== _gateHash){
    try{ localStorage.removeItem(OF_BIO_KEY); }catch(e){}
    return false;
  }
  try{
    const ch = crypto.getRandomValues(new Uint8Array(32));
    const asr = await navigator.credentials.get({
      publicKey: {
        challenge: ch,
        allowCredentials: [{ type:'public-key', id: _unb64u(rec.id) }],
        userVerification: 'required',
        timeout: 60000
      }
    });
    if(!asr) return false;
    ownerOk = true;
    _sessWrite(_gateHash || rec.h || 'bio');
    refreshGate(ofAuth.currentUser);
    return true;
  }catch(e){ console.warn('bio unlock', e); return false; }
}
window.ofBioEnroll = ofBioEnroll;
window.ofBioUnlock = ofBioUnlock;
window.ofBioEnabled = ofBioEnabled;
window.ofBioForget = function(){
  try{ localStorage.removeItem(OF_BIO_KEY); }catch(e){}
  alert('اتشالت البصمة من الجهاز ده');
};

$('#gCodeBtn').addEventListener('click', async function(){
  const val = $('#gCode').value.trim();
  $('#gateErr').textContent = '';
  if(!val){ return; }
  // 🐢 تهدئة بعد المحاولات الغلط — عشان التخمين ميبقاش رخيص
  if(_gateTries >= 5){
    $('#gateErr').textContent = 'محاولات كتير — اقفل البرنامج وافتحه تاني';
    return;
  }
  try{
    const h = await ofHash(val);
    if(_gateHash === null) await loadGateHash();

    // 🆕 أول تشغيل: مفيش كود متسجّل — بنسجّله دلوقتي.
    // آمن لأن اللي وصل هنا **داخل بحساب Firebase أصلًا**.
    if(!_gateHash){
      if(val.length < 4){ $('#gateErr').textContent = 'اختار كود 4 أرقام على الأقل'; return; }
      await db.collection('pos_test_settings').doc(OF_GATE_DOC)
        .set({ hash: h, setAt: Date.now() }, { merge: true });
      _gateHash = h;
      ownerOk = true; _sessWrite(h);
      $('#gCode').value = '';
      refreshGate(ofAuth.currentUser);
      return;
    }

    if(h === _gateHash){
      _gateTries = 0;
      ownerOk = true; _sessWrite(h);
      $('#gCode').value = '';
      // 👆 ربط البصمة لو المالك طلب — بعد ما الكود يتأكد
      const _cb = $('#gBioEnroll');
      if(_cb && _cb.checked){
        const okBio = await ofBioEnroll();
        if(okBio) alert('اتربطت ✅ — المرة الجاية بصمة واحدة وخلاص');
      }
      refreshGate(ofAuth.currentUser);
    } else {
      _gateTries++;
      $('#gateErr').textContent = 'كود غلط' + (_gateTries >= 3 ? (' (' + (5 - _gateTries) + ' محاولات فاضلة)') : '');
      $('#gCode').value = '';
    }
  }catch(e){
    $('#gateErr').textContent = 'تعذر التحقق — راجع النت';
    console.warn('gate check', e);
  }
});
$('#gCode').addEventListener('keydown', function(e){ if(e.key==='Enter') $('#gCodeBtn').click(); });
$('#gBioBtn').addEventListener('click', async function(){
  const b = $('#gBioBtn');
  b.textContent = '👆 استنى…'; b.disabled = true;
  const ok = await ofBioUnlock();
  b.disabled = false; b.textContent = '👆 افتح بالبصمة';
  if(!ok) $('#gateErr').textContent = 'البصمة ماتعرفتش — اكتب الكود';
});

// 🔑 تغيير كود المالك — من جوه البرنامج وانت داخل
window.officeChangeCode = async function(){
  if(!ownerOk){ alert('افتح البوابة الأول'); return; }
  const a = prompt('الكود الجديد (4 أرقام على الأقل):');
  if(!a || a.trim().length < 4) return;
  const b = prompt('اكتبه تاني للتأكيد:');
  if(a.trim() !== (b||'').trim()){ alert('الكودين مش زي بعض'); return; }
  try{
    const h = await ofHash(a.trim());
    await db.collection('pos_test_settings').doc(OF_GATE_DOC)
      .set({ hash: h, setAt: Date.now() }, { merge: true });
    _gateHash = h; _sessWrite(h);
    alert('اتغيّر ✅ — الأجهزة التانية هتطلب الكود الجديد');
  }catch(e){ alert('ماتغيرش: ' + (e.code||e.message)); }
};

// 🚪 خروج صريح
window.officeLogout = async function(){
  if(!confirm('هتخرج من البرنامج والجهاز هينسى الدخول. متأكد؟')) return;
  try{ sessionStorage.removeItem(OF_SESS_KEY); }catch(e){}
  try{ localStorage.removeItem('office_owner_ok'); }catch(e){}
  ownerOk = false;
  try{ await ofAuth.signOut(); }catch(e){}
  location.reload();
};

// بيشيل شاشة الانتظار أول ما نعرف الحالة الحقيقية
function _bootDone(){
  const b = document.getElementById('bootWait');
  if(b) b.remove();
}
function refreshGate(user){
  const saved = localStorage.getItem('office_email') || '';
  if(saved && !$('#gEmail').value) $('#gEmail').value = saved;
  if(!user){
    $('#gate').classList.add('on'); _bootDone();
    $('#gateStep1').style.display = 'block';
    $('#gateStep2').style.display = 'none';
    return;
  }
  if(!ownerOk){
    $('#gate').classList.add('on'); _bootDone();
    $('#gateStep1').style.display = 'none';
    $('#gateStep2').style.display = 'block';
    // 🆕 أول تشغيل: مفيش كود متسجّل — بنقول له صراحةً إنه بيختار كود جديد
    const gc = $('#gCode');
    if(gc) gc.placeholder = (_gateHash === null) ? 'اختار كود المالك (4 أرقام+)' : 'كود المالك';
    // 👆 البصمة: الزرار يظهر لو مربوطة، والشيك-بوكس يظهر لو مش مربوطة
    const bio = $('#gBioBtn'), row = $('#gBioEnrollRow');
    const canBio = (typeof ofBioSupported === 'function') && ofBioSupported() && _gateHash !== null;
    if(bio) bio.style.display = (canBio && ofBioEnabled()) ? 'block' : 'none';
    if(row) row.style.display = (canBio && !ofBioEnabled()) ? 'flex' : 'none';
    // بنجرّب الفتح التلقائي مرة واحدة لكل فتحة تطبيق — مش كل رسم للشاشة
    if(canBio && ofBioEnabled() && !window._bioTried){
      window._bioTried = true;
      setTimeout(function(){ ofBioUnlock().catch(function(){}); }, 350);
    }
    setTimeout(function(){ $('#gCode').focus(); }, 100);
    return;
  }
  $('#gate').classList.remove('on'); _bootDone();
  $('#hdrSub').textContent = 'متوصّل ✅ · ' + new Date().toLocaleDateString('ar-EG', { weekday:'long', day:'numeric', month:'long' });
  startData();
}
// 🔐 أول ما الدخول يتأكد: نجيب بصمة الكود ونشوف الجلسة لسه سارية
// ⏳ أول ضربة من onAuthStateChanged بتيجي بـuser=null **قبل** ما Firebase
//    يرجّع الجلسة المحفوظة. من غير الحارس ده، شاشة الإيميل بتومض كل مرة
//    وبعدين تختفي وتظهر البصمة — وده اللي كان شكله "لاج".
let _authSettled = false;
ofAuth.onAuthStateChanged(async function(user){
  if(!user && !_authSettled){
    // مستنيين لحظة: يا إما الجلسة ترجع، يا إما نتأكد إنه مفيش دخول فعلًا
    setTimeout(function(){
      _authSettled = true;
      if(!ofAuth.currentUser){ ownerOk = false; refreshGate(null); }
    }, 1200);
    return;
  }
  _authSettled = true;
  if(!user){ ownerOk = false; refreshGate(null); return; }
  await loadGateHash();
  // جلسة سارية ومطابقة للبصمة الحالية = مفيش داعي نسأل الكود تاني
  ownerOk = !!_sessRead();
  // 👆 البصمة **قبل** ما البوابة تترسم — عشان شاشة الكود متومضش ثم تختفي.
  //    لو نجحت، ofBioUnlock بتنادي refreshGate بنفسها.
  if(!ownerOk && typeof ofBioEnabled === 'function' && ofBioEnabled() && !window._bioTried){
    window._bioTried = true;
    const okBio = await ofBioUnlock().catch(function(){ return false; });
    if(okBio) return;
  }
  refreshGate(user);
});

/* ============================================================
   🩺 حارس الجلسة
   ------------------------------------------------------------
   كل التطبيقات على نفس الدومين وبتشارك نفس تخزين جلسة Firebase. لو جلسة
   Office اتبدلت بحساب مجهول (من تطبيق الولاء أو شاشة التقييم)، القراءات
   بتفضل شغالة من الكاش والشاشة شكلها سليم — والكتابة بس هي اللي بترفض.
   الحارس ده بيقول للمالك على طول بدل ما يكتشفها من زرار بيفشل.
   ============================================================ */
let _sessWarned = false;
function ofSessionCheck(){
  try{
    const u = ofAuth.currentUser;
    const anon = u && (u.isAnonymous ||
      ((u.providerData || []).length === 0));
    const bar = document.getElementById('sessWarn');
    if(u && anon){
      if(!bar){
        const d = document.createElement('div');
        d.id = 'sessWarn';
        d.style.cssText = 'position:fixed; top:0; left:0; right:0; z-index:90; background:#7F1D1D;'
          + 'color:#fff; font-size:12.5px; font-weight:800; padding:9px 14px; text-align:center;'
          + 'cursor:pointer; line-height:1.6;';
        d.innerHTML = '⚠️ الجلسة اتبدلت لحساب مجهول — أي حفظ هيترفض.<br>'
          + '<u>دوس هنا: اخرج وادخل بالإيميل</u>';
        d.onclick = function(){ try{ ofAuth.signOut(); }catch(e){} location.reload(); };
        document.body.appendChild(d);
      }
      if(!_sessWarned){ _sessWarned = true; console.warn('office session became anonymous'); }
    }else if(bar){ bar.remove(); _sessWarned = false; }
  }catch(e){}
}
setInterval(ofSessionCheck, 4000);
try{ ofAuth.onAuthStateChanged(ofSessionCheck); }catch(e){}

/* ============================================================
   🗂️ التبويبات
   ============================================================ */
// 🕒 عرض الوقت **بتوقيت القاهرة دايمًا** — الأجهزة في مصر والمالك
//    بيفتح من بره أحيانًا. توقيت الجهاز خلّى فاتورة ٧:٢٦ مساءً تظهر
//    ١:٢٦ ظهرًا في سجل النشاط، والفرق ده بيخلي قراءة القصة مستحيلة.
//    ⚠️ القاعدة دي مثبتة في كل حسابات الوقت — والعرض لازم يتبعها.
const OF_CAIRO_TZ = 'Africa/Cairo';
function ofWhen(ts, withDate){
  if(!ts) return '—';
  const o = { timeZone: OF_CAIRO_TZ, hour:'2-digit', minute:'2-digit', second:'2-digit' };
  if(withDate){ o.year = 'numeric'; o.month = '2-digit'; o.day = '2-digit'; }
  try{ return new Date(ts).toLocaleString('ar-EG', o); }
  catch(e){ return new Date(ts).toLocaleString('ar-EG'); }
}
window.ofWhen = ofWhen;

// 🕵️ حالة سجل النشاط — التعريف **قبل** هاندلر التبويب اللي بيقراه:
//    `let` مبتترفعش (TDZ)، ونفس الباج ده حصل قبل كده مع OF_RECUR_COL.
let _ofActRaw = [];

function ofGoPage(page, opts){
  opts = opts || {};
  const target = document.getElementById('page-' + page);
  if(!target) return false;
  document.querySelectorAll('#tabsNav button').forEach(function(x){
    x.classList.toggle('on', x.dataset.page === page);
  });
  document.querySelectorAll('.tabPage').forEach(function(x){ x.classList.remove('on'); });
  target.classList.add('on');
  ofCloseMore();
  try{ window.scrollTo(0, 0); }catch(e){}
  // ⚡ بيانات التقارير بتتحمّل أول ما تفتح التبويب — مش في الخلفية طول الوقت
  if(page === 'cash'){ try{ renderCashHand(); }catch(e){ console.warn('cash', e); } }
  if(page === 'reports'){
    try{ loadCustomers(); loadRatings(); }catch(e){ console.warn('reports load', e); }
  }
  // 🕵️ سجل النشاط: تحميل أول فتحة بس — بعدها الزرار هو اللي بيحدّث
  if(page === 'odd' && !_ofActRaw.length){
    try{ ofLoadActivity(); }catch(e){ console.warn('activity load', e); }
  }
  if(!opts.fromHistory){
    try{
      const st = Object.assign({}, history.state || {}, { officeNavV64:'page', page:page });
      if(opts.replace) history.replaceState(st,'',location.href);
      else if(!history.state || history.state.officeNavV64 !== 'page' || history.state.page !== page) history.pushState(st,'',location.href);
    }catch(e){}
  }
  return true;
}
window.ofGoPage = ofGoPage;

function ofOpenMore(fromHistory){
  const x = document.getElementById('officeMoreSheet');
  if(x){ x.classList.add('on'); x.setAttribute('aria-hidden','false'); }
  if(!fromHistory){
    try{ history.pushState(Object.assign({},history.state||{},{officeNavV64:'more'}),'',location.href); }catch(e){}
  }
}
function ofCloseMore(){
  const x = document.getElementById('officeMoreSheet');
  if(x){ x.classList.remove('on'); x.setAttribute('aria-hidden','true'); }
}
window.ofOpenMore = ofOpenMore; window.ofCloseMore = ofCloseMore;

document.querySelectorAll('#tabsNav button[data-page]').forEach(function(b){
  b.addEventListener('click', function(){ ofGoPage(b.dataset.page); });
});
const _ofMoreBtn = document.getElementById('officeMoreBtn');
if(_ofMoreBtn) _ofMoreBtn.addEventListener('click', ofOpenMore);
document.querySelectorAll('[data-office-go]').forEach(function(b){
  b.addEventListener('click', function(){ ofGoPage(b.dataset.officeGo); });
});
const _ofMoreSheet = document.getElementById('officeMoreSheet');
if(_ofMoreSheet) _ofMoreSheet.addEventListener('click', function(e){ if(e.target === _ofMoreSheet) ofCloseMore(); });
/* 💼 تبويبات التوظيف الفرعية
   ------------------------------------------------------------
   نفس نمط `.daySub` بالظبط — إخفاء/إظهار بس، **مفيش إعادة رسم**.
   اللوحات الأربعة بتترسم أصلًا من الاشتراكات الحية (`apList` · `hrList` ·
   `opGrid` · `efList`)، فالمحتوى موجود جوّه حتى وهو مخفي. لو ربطنا الرسم
   بالضغط هنا، اللوحة اللي مش مفتوحة هتبقى بايتة لحد ما يدوس عليها. */
document.querySelectorAll('.hireSub').forEach(function(b){
  b.addEventListener('click', function(){
    document.querySelectorAll('.hireSub').forEach(function(x){ x.classList.remove('on'); });
    b.classList.add('on');
    document.querySelectorAll('.hireSec').forEach(function(x){ x.style.display = 'none'; });
    const sec = document.getElementById('hire' + b.dataset.h.charAt(0).toUpperCase() + b.dataset.h.slice(1));
    if(sec) sec.style.display = '';
    try{ window.scrollTo(0, 0); }catch(e){}
  });
});

ofGoPage('day', {replace:true}); // ⭐ stable Office home anchor

// 🔙 Office Back UX v64: Back = previous in-app step; final destination = الرئيسية.
if(window.addEventListener) window.addEventListener('popstate', function(e){
  try{
    const more=document.getElementById('officeMoreSheet');
    if(more && more.classList.contains('on')){ ofCloseMore(); return; }

    const st=(e && e.state)||{};
    if(st.officeNavV64==='more'){ ofOpenMore(true); return; }
    if(st.officeNavV64==='page' && st.page){
      ofGoPage(st.page,{fromHistory:true});
      return;
    }

    // No useful history left: keep owner inside Office on الرئيسية.
    ofGoPage('day',{fromHistory:true});
    history.replaceState(Object.assign({},history.state||{},{officeNavV64:'page',page:'day'}),'',location.href);
  }catch(err){ console.warn('office back',err); }
});


/* ============================================================
   📡 البيانات الحية + الإشعارات
   ============================================================ */
// 🔁 مجموعة قوالب المصاريف المتكررة
// ⚠️ لازم تتعرّف **قبل** أي استخدام: const مبتترفعش (TDZ)، وكانت متعرّفة
//    في آخر الملف وبتتنادى في startData فوق → الاشتراك كان بيرمي خطأ.
const OF_RECUR_COL = 'office_recurring';

const D = { leaves:[], regs:[], orders:[], shorts:[], merchants:[], mtxns:[], expenses:[],
            employees:[], advances:[], sales:[], inventory:[], customers:[], ratings:[],
            recurring:[], openShifts:[], salaryPays:[], rewards:[], cashBase:null, settlements:[],
            cashDays:{}, cashCfg:{},
            creditRequests:[], giftCards:[], creditLedger:[], refundsDue:[] };
let started = false;
let firstLoadDone = false;
const seenIds = {};   // عشان الإشعار يطلع للجديد بس

function notify(title, body){
  try{
    if(Notification.permission !== 'granted') return;
    if(navigator.serviceWorker && navigator.serviceWorker.ready){
      navigator.serviceWorker.ready.then(function(reg){
        reg.showNotification(title, { body:body, icon:'icon.png', dir:'rtl', lang:'ar',
          badge:'icon.png', vibrate:[200,80,200], tag:'office-'+Date.now() });
      });
    } else { new Notification(title, { body:body }); }
  }catch(e){}
}
function maybeNotifyNew(kind, arr, label, describe){
  arr.forEach(function(x){
    const key = kind + ':' + x.id;
    if(seenIds[key]) return;
    seenIds[key] = 1;
    // ⚠️ لو الـpush مفعّل، السيرفر هو اللي بيبعت — والإشعار المحلي هيبقى
    //    تكرار للنفس الحاجة. المحلي بيفضل احتياطي للأجهزة اللي مفعّلتش push.
    let _hasPush = false;
    try{ _hasPush = !!localStorage.getItem('office_fcm'); }catch(e){}
    if(firstLoadDone && !_hasPush) notify(label, describe(x));
  });
}
// ============================================================
// 🔔 Push حقيقي — إشعارات توصل والتطبيق مقفول
// ------------------------------------------------------------
// ⚠️ الفرق عن اللي كان موجود: الإشعارات القديمة كانت **محلية** — بتتولد من
//    الصفحة نفسها، فبتشتغل والتطبيق مفتوح بس. دي Push من السيرفر.
// 🔑 نفس نمط تطبيق العميلة بالظبط (نفس VAPID، ونفس شكل التوكن).
// التوكن بيتحفظ في pos_test_settings/office_push — مستند واحد فيه كل أجهزة
// المالك. الدالة السحابية بتقرا منه وبتبعت.
// ============================================================
var OF_VAPID = 'BLKGot1x5UyHYfGqK24sIxT3Wesnyq-wOt68l77CAS45-FA5giCDs3KbhG0h5rJ5FSGVjTIuCsoIOjyA4EPzFcc';

function ofPushSupported(){
  return 'Notification' in window && 'serviceWorker' in navigator
      && firebase.messaging && firebase.messaging.isSupported && firebase.messaging.isSupported();
}

async function ofRegisterPush(){
  if(!ofPushSupported()){ return { ok:false, why:'الجهاز/المتصفح مش بيدعم الإشعارات' }; }
  if(Notification.permission === 'denied'){
    return { ok:false, why:'الإشعارات مرفوضة من إعدادات المتصفح — لازم تسمح بيها يدوي' };
  }
  const perm = await Notification.requestPermission();
  if(perm !== 'granted') return { ok:false, why:'مسمحتش بالإشعارات' };
  try{
    const reg = await navigator.serviceWorker.ready;
    const token = await firebase.messaging().getToken({ vapidKey: OF_VAPID, serviceWorkerRegistration: reg });
    if(!token) return { ok:false, why:'ماقدرناش نجيب توكن الجهاز' };
    // 🔴 كان: u['tokens.' + token] — وتوكن FCM ممكن يحتوي على **نقط**،
    //    والنقطة في Firestore بتفصل مسار. النتيجة:
    //      tokens.abc:APA91b.xyz  →  tokens → abc:APA91b → xyz
    //    فالدالة بتقرا Object.keys(tokens) وبتجيب **جزء** من التوكن —
    //    رسالة رايحة لعنوان مقطوع. الدالة بترجع 200 والإشعار عمره ما يوصل.
    //    الحل: التوكن **قيمة** مش مفتاح، والأجهزة في مصفوفة.
    const ref = db.collection('pos_test_settings').doc('office_push');
    const cur = await ref.get();
    let list = (cur.exists && Array.isArray((cur.data()||{}).list)) ? cur.data().list : [];
    // 🧹 نشيل التسجيل القديم لنفس الجهاز — كان بيتراكم كل مرة
    let prev = null;
    try{ prev = localStorage.getItem('office_fcm'); }catch(e){}
    list = list.filter(function(x){
      return x && x.token && x.token !== token && x.token !== prev;
    });
    list.push({ token: token, ts: Date.now(), ua: (navigator.userAgent||'').slice(0,80) });
    if(list.length > 10) list = list.slice(-10);      // سقف أمان
    await ref.set({ list: list }, { merge: true });
    try{ localStorage.setItem('office_fcm', token); }catch(e){}
    return { ok:true };
  }catch(e){
    console.warn('office push', e);
    return { ok:false, why: (e && (e.code || e.message)) || 'خطأ غير معروف' };
  }
}

// 🔕 إلغاء التسجيل — بيشيل توكن الجهاز ده بس
async function ofUnregisterPush(){
  let token = null;
  try{ token = localStorage.getItem('office_fcm'); }catch(e){}
  if(!token) return;
  try{
    const ref = db.collection('pos_test_settings').doc('office_push');
    const cur = await ref.get();
    const list = (cur.exists && Array.isArray((cur.data()||{}).list)) ? cur.data().list : [];
    await ref.set({ list: list.filter(function(x){ return x && x.token !== token; }) }, { merge: true });
    localStorage.removeItem('office_fcm');
  }catch(e){ console.warn('office unpush', e); }
}
window.ofUnregisterPush = ofUnregisterPush;

$('#notifBtn').addEventListener('click', async function(){
  const b = $('#notifBtn');
  b.textContent = '⏳'; b.disabled = true;
  const r = await ofRegisterPush();
  b.disabled = false;
  if(r.ok){
    b.textContent = '🔔'; b.title = 'الإشعارات شغالة ✅';
    alert('اتفعّلت ✅\n\nهتوصلك إشعارات حتى والتطبيق مقفول.\n\n'
      + '⚠️ لو مش بتسمع صوت: من إعدادات الموبايل → التطبيقات → echarpe office '
      + '→ الإشعارات → خلي الأهمية عالية.');
  } else {
    b.textContent = '🔕'; b.title = 'الإشعارات متعطّلة';
    alert('ماتفعّلتش: ' + (r.why || '') );
  }
});

// 🔔 إشعار تجربة + تشخيص حقيقي
// ------------------------------------------------------------
// الدالة السحابية بترجع 200 حتى لو الإرسال فشل — فالتشخيص كان واقف على
// "الكود سليم". دلوقتي بنغيّر `test` في المستند، والدالة بتبعت وبتسجّل
// النتيجة في `lastSend`، وإحنا بنستنى النتيجة ونوريها بالنص.
async function ofPushTest(btn){
  const ref = db.collection('pos_test_settings').doc('office_push');
  if(btn){ btn.disabled = true; btn.textContent = '⏳'; }
  const reset = function(){ if(btn){ btn.disabled = false; btn.textContent = '🧪'; } };
  try{
    const cur = await ref.get();
    const d = cur.exists ? (cur.data() || {}) : {};
    const n = Array.isArray(d.list) ? d.list.length : 0;
    if(!n){
      alert('⛔ مفيش أي جهاز متسجّل\n\nدوس «🔔 الإشعارات» الأول عشان تسجّل الجهاز ده.');
      reset(); return;
    }
    const before = (d.lastSend && d.lastSend.at) || 0;
    await ref.set({ test: Date.now() }, { merge: true });
    // ⏳ ننتظر الدالة تسجّل النتيجة — 12 ثانية بحد أقصى
    let out = null;
    for(let i = 0; i < 12; i++){
      await new Promise(function(r2){ setTimeout(r2, 1000); });
      const s2 = await ref.get();
      const ls = (s2.exists && (s2.data() || {}).lastSend) || null;
      if(ls && ls.at && ls.at !== before){ out = ls; break; }
    }
    reset();
    if(!out){
      alert('⏱️ الدالة ماردّتش خلال ١٢ ثانية\n\n'
        + 'يعني إما `onOfficePushTest` مش منشورة، أو النشر لسه مااكتملش.\n'
        + 'اتأكد من النشر: firebase deploy --only functions');
      return;
    }
    let msg = 'نتيجة الإرسال:\n\n'
      + '— أجهزة متسجّلة: ' + (out.sent || 0) + '\n'
      + '— نجح: ' + (out.ok || 0) + '\n'
      + '— فشل: ' + (out.fail || 0) + '\n';
    if(out.errors && out.errors.length){
      msg += '\nالأخطاء:\n' + out.errors.map(function(e){
        return '• ' + e.code + '  (…' + (e.token || '') + ')';
      }).join('\n');
      msg += '\n\n' + ofPushHint(out.errors[0].code);
    }else if(out.ok > 0){
      msg += '\n✅ الإرسال نجح من ناحية السيرفر.\n'
        + 'لو الإشعار مش ظاهر على الجهاز، المشكلة في استقبال الجهاز نفسه:\n'
        + '• الإعدادات → التطبيقات → office → البطارية → **غير مقيّد**\n'
        + '• والإشعارات → الأهمية **عالية**';
    }
    alert(msg);
  }catch(e){
    reset();
    alert('ماتبعتش: ' + (e.code || e.message));
  }
}
window.ofPushTest = ofPushTest;

// ترجمة أكواد FCM لسبب مفهوم
function ofPushHint(code){
  const c = String(code || '');
  if(/third-party-auth|authentication/i.test(c))
    return '🔑 مفتاح VAPID في التطبيق مش متطابق مع مفتاح المشروع.\n'
      + 'Firebase → إعدادات المشروع → Cloud Messaging → Web Push certificates.';
  if(/registration-token|not-registered|invalid-argument/i.test(c))
    return '📵 توكن الجهاز باطل (اتمسح أو اتجدّد). دوس «🔔 الإشعارات» تاني عشان يتسجّل من جديد.';
  if(/sender-id|mismatched/i.test(c))
    return '🔀 التوكن اتعمل بمشروع تاني — امسح بيانات الموقع وسجّل تاني.';
  if(/quota|unavailable|internal/i.test(c))
    return '⏳ خدمة FCM مضغوطة أو مؤقتًا مش متاحة — جرّب بعد شوية.';
  return 'ابعتلي الكود ده زي ما هو.';
}
try{ ofPaintEyeBtn(); }catch(e){}   // 🙈 حالة العين محفوظة بين الفتحات
if(typeof Notification !== 'undefined' && Notification.permission === 'granted'){
  $('#notifBtn').textContent = '🔔'; $('#notifBtn').title = 'الإشعارات شغالة ✅';
  // 🔁 تجديد صامت: التوكن بيتغيّر لوحده أحيانًا (تنضيف المتصفح/تحديث النظام).
  //    من غير التجديد ده الإشعارات بتقف بعد فترة والمالك مش هيعرف ليه.
  setTimeout(function(){ ofRegisterPush().catch(function(){}); }, 5000);
}

/* 💳↩️ v43→v44: قائمة فروق الفيزا المستحقة — البانل بيظهر بس لو فيه
   حاجة (مستحق أو اترد قريب)، وزرار «اترد» بيسجل مين ومتى. */
function renderRefundsDue(){
  const panel = document.getElementById('refundsDuePanel');
  const body = document.getElementById('refundsDueBody');
  if(!panel || !body) return;
  const due = (D.refundsDue || []).filter(function(x){ return x.status === 'due'; })
    .sort(function(a,b){ return (b.ts||0) - (a.ts||0); });
  const refunding = (D.refundsDue || []).filter(function(x){ return x.status === 'refunding'; })
    .sort(function(a,b){ return (b.refundingAt||b.ts||0) - (a.refundingAt||a.ts||0); });
  const done = (D.refundsDue || []).filter(function(x){ return x.status === 'refunded'; })
    .sort(function(a,b){ return (b.refundedAt||0) - (a.refundedAt||0); }).slice(0, 5);
  if(!due.length && !refunding.length && !done.length){ panel.style.display = 'none'; return; }
  panel.style.display = '';
  const rows = [];
  function refundCard(x, stage){
    const txn = (x.txns && x.txns[0]) || {};
    const working = stage === 'refunding';
    const action = working
      ? '<button class="btn gold" onclick="ofMarkRefunded(\'' + esc(x.id) + '\')">✅ تم الرد</button>'
      : '<button class="btn gold" onclick="ofStartRefund(\'' + esc(x.id) + '\')">↩️ بدء الرد</button>';
    const badge = working
      ? '<b style="color:#b45309;">⏳ جارٍ الرد</b>'
      : '<b style="color:#dc2626;">● مستحق الرد</b>';
    return '<div style="border:1.5px solid ' + (working ? '#d97706' : '#dc2626') + '; border-radius:12px; padding:10px; margin-bottom:8px; background:rgba(220,38,38,.06);">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">'
      + '<div>' + badge + ' · <b style="font-size:15px;">' + ofMoney(x.diff || 0) + '</b>'
      + ' <span class="muted">مسحوب ' + ofMoney(x.charged || 0) + ' على فاتورة ' + ofMoney(x.invoiceTotal || 0) + '</span></div>'
      + action + '</div>'
      + (x.adjustmentMode ? '<div style="font-size:12.5px; margin-top:4px;"><b>✏️ تعديل بعد الدفع:</b> الموظفة غيّرت السلة بعد قبول الكارت والسيستم حسب الفرق تلقائيًا.</div>' : '')
      + (x.cause ? '<div style="font-size:12.5px; margin-top:4px;"><b>السبب:</b> ' + esc(x.cause) + '</div>' : '')
      + '<div class="muted" style="font-size:12px; margin-top:4px;">'
      + '🏬 ' + esc(x.branch || '—') + ' · 🧾 ' + esc(x.invoiceCode || '—')
      + ' · 👤 ' + esc(x.customerName || '') + ' ' + (x.customerPhone ? '<span dir="ltr">' + esc(x.customerPhone) + '</span>' : '<b style="color:#dc2626;">من غير رقم!</b>')
      + (txn.txnId ? ' · 💳 <span dir="ltr">TXN ' + esc(String(txn.txnId)) + '</span>' : '')
      + ' · 🧑‍💼 ' + esc(x.employeeName || '')
      + ' · ' + ofWhen(x.ts, true) + '</div></div>';
  }
  due.forEach(function(x){ rows.push(refundCard(x, 'due')); });
  refunding.forEach(function(x){ rows.push(refundCard(x, 'refunding')); });
  if(done.length){
    rows.push('<div class="muted" style="font-size:12px; margin:8px 0 4px;">✅ تم الرد مؤخرًا:</div>');
    done.forEach(function(x){
      rows.push('<div class="muted" style="font-size:12px; padding:4px 2px; border-bottom:1px dashed var(--line);">'
        + ofMoney(x.diff || 0) + ' · ' + esc(x.branch || '') + ' · ' + esc(x.customerPhone || '')
        + ' · رده ' + esc(x.refundedBy || '') + ' ' + ofWhen(x.refundedAt, true) + '</div>');
    });
  }
  body.innerHTML = rows.join('');
}
window.ofStartRefund = function(id){
  if(!confirm('هتبدئي دلوقتي رد المبلغ من Paymob على نفس العملية؟\n\nده بيغيّر الحالة لـ «جارٍ الرد» فقط — مش بيسحب أو يرجّع فلوس بنفسه.')) return;
  db.collection('pos_card_refunds_due').doc(id).update({
    status: 'refunding', statusLabel: 'جارٍ الرد', refundingAt: Date.now(),
    refundingBy: 'Office'
  }).catch(function(e){ alert('فشل التسجيل: ' + (e && e.message || e)); });
};
window.ofMarkRefunded = function(id){
  const item = (D.refundsDue || []).find(function(x){ return x.id === id; });
  if(!item || item.status !== 'refunding'){
    alert('ابدئي الرد الأول من زر «بدء الرد» عشان مايتسجلش مبلغ كأنه اترد بالغلط.');
    return;
  }
  const ref = prompt('اكتبي رقم/مرجع عملية الرد من Paymob عشان نثبت إن المبلغ اترد فعلًا:');
  if(!String(ref || '').trim()) return;
  if(!confirm('تأكيد: المبلغ اترد فعلًا من Paymob؟\n\nالزرار ده تسجيل — مش هو اللي بيرد الفلوس.')) return;
  db.collection('pos_card_refunds_due').doc(id).update({
    status: 'refunded', statusLabel: 'تم الرد', refundedAt: Date.now(),
    refundedBy: 'Office', refundReference: String(ref).trim()
  }).catch(function(e){ alert('فشل التسجيل: ' + (e && e.message || e)); });
};


/* ============================================================
   🕵️ سجل النشاط (Office v45) — التبويب اللي كان "قريبًا"
   ------------------------------------------------------------
   ٢٨ نوع حدث بيتكتبوا في pos_activity_log من زمان ومحدش بيقراهم.
   قصة فاتورة 1444 (فيزا 1610 على 1260) كانت متسجلة بالكامل —
   الصنف اللي اتشال والتحذير اللي اتأكد — بس مفيش شاشة بتعرضها.
   ⚠️ **بيتحمّل بدوسة** بنافذة زمنية وحد أقصى: القراءات فلوس،
      والسجل ده بيكبر أسرع من أي مجموعة تانية.
   ============================================================ */
const OF_ACT_LIMIT = 400;
// وصف بالمصري لكل نوع + تصنيفه + هل هو مقلق (بيتلوّن أحمر)
const OF_ACT_KINDS = {
  /* 🎁 محاولة مرتجع كارت هدية — **حدث ساخن**: معناها إن حد حاول
     يرجّع فلوس كارت لسه شغّال. المنع اشتغل، بس المحاولة نفسها
     لازم تتشاف (يمكن تكون سوء فهم من الكاشير، ويمكن تكون محاولة). */
  gift_card_return_blocked: { t:'🎁 محاولة مرتجع كارت هدية (اتمنعت)', g:'money', hot:true },
  card_overcharge_saved: { t:'💳 سحب فيزا زيادة — الفاتورة اتحفظت', g:'money', hot:true },
  card_adjustment_started:{ t:'✏️ تعديل السلة بعد قبول الفيزا', g:'money', hot:true },
  card_overcharge_ok:    { t:'💳 الكاشير أكّد السحب الزيادة', g:'money', hot:true },
  sale_saved:            { t:'🧾 فاتورة اتحفظت', g:'cart', quiet:true },
  manual_discount:       { t:'🏷️ خصم يدوي', g:'money', hot:true },
  manual_drawer_open:    { t:'💵 الدرج اتفتح بالإيد', g:'money', hot:true },
  customer_points_edit:  { t:'🎁 تعديل نقط عميلة', g:'money', hot:true },
  redeem_value_mismatch: { t:'🎁 فرق في قيمة الاستبدال', g:'money', hot:true },
  card_saved_manual:     { t:'💳 كارت اتسجل يدوي', g:'money', hot:true },
  card_payments_cleared: { t:'💳 مدفوعات كارت اتلغت', g:'money' },
  card_leg_recovered:    { t:'💳 شريحة كارت استرجعت', g:'money' },
  paymob_terminal_saved: { t:'📟 الماكينة أكّدت', g:'money' },
  paymob_cancelled:      { t:'📟 طلب ماكينة اتلغى', g:'money' },
  paymob_stuck:          { t:'📟 الماكينة علّقت', g:'money', hot:true },
  paymob_stuck_rescue:   { t:'📟 إنقاذ طلب معلّق', g:'money' },
  paymob_orphan_detected:{ t:'📟 دفعة يتيمة', g:'money', hot:true },
  same_day_reversal:     { t:'↩️ عكس فاتورة نفس اليوم', g:'money', hot:true },
  same_day_return:       { t:'↩️ مرتجع نفس اليوم', g:'money' },
  item_removed:          { t:'🛒 صنف اتشال من السلة', g:'cart' },
  cart_item_edited:      { t:'🛒 سطر اتعدّل في السلة', g:'cart' },
  cart_abandoned:        { t:'🛒 سلة اتسابت', g:'cart' },
  print_latency:         { t:'🖨️ زمن الطباعة', g:'cart', quiet:true },
  rate_request_manual:   { t:'⭐ طلب تقييم يدوي', g:'cart' },
  basket_suggest_added:  { t:'✨ اقتراح ذكي اتضاف للسلة', g:'cart', quiet:true },
  basket_suggest_shown:  { t:'🎯 Sales Copilot عرض فرصة', g:'cart', quiet:true },
  basket_suggest_dismissed:{ t:'🎯 اقتراح بيع اترفض', g:'cart', quiet:true },
  lost_sale:             { t:'📉 بيع ماكملش', g:'cart', hot:true },
  wa_message:            { t:'💬 رسالة واتساب اتجهزت', g:'cart', quiet:true },
  customer_name_edit:    { t:'👤 تعديل اسم عميلة', g:'cart' },
  inventory_wiped:       { t:'📦 المخزون اتمسح', g:'stock', hot:true },
  inventory_merge:       { t:'📦 دمج صنف', g:'stock' },
  inventory_merge_bulk:  { t:'📦 دمج جماعي', g:'stock', hot:true },
  inventory_claimed:     { t:'📦 صنف اتنسب لفرع', g:'stock' },
  inventory_branch_catalog_replace:{ t:'📦 تحديث كتالوج فرع', g:'stock', hot:true },
  inventory_full_reconcile:{ t:'🧮 تسوية مخزون كاملة', g:'stock', hot:true },
  import_qty_adjusted:   { t:'📥 كمية اتعدّلت في الاستيراد', g:'stock' },
  import_qty_moved:      { t:'📥 كمية اتنقلت', g:'stock' },
  import_excluded_missing:{ t:'📥 صنف اتستبعد', g:'stock' }
};
function ofActLabel(type){
  const k = OF_ACT_KINDS[type];
  return k ? k.t : ('• ' + String(type || '—'));
}
// تفاصيل الحدث بالعربي — الحقول بتختلف من نوع لنوع
function ofActDetail(a){
  const p = [];
  if(a.name) p.push(esc(a.name) + (a.qty ? ' ×' + a.qty : ''));
  if(a.price != null) p.push(ofMoney(a.price));
  if(a.diff != null) p.push('فرق ' + ofMoney(a.diff));
  if(a.charged != null && a.total != null)
    p.push('مسحوب ' + ofMoney(a.charged) + ' على ' + ofMoney(a.total));
  if(a.amount != null) p.push(ofMoney(a.amount));
  if(a.invoiceCode) p.push('🧾 ' + esc(a.invoiceCode));
  if(a.reason) p.push(esc(a.reason));
  if(a.count != null) p.push(a.count + ' صنف');
  if(a.ms != null) p.push(Math.round(a.ms / 1000) + ' ث');
  if(a.totalMs != null) p.push('استغرقت ' + (a.totalMs / 1000).toFixed(1) + ' ث');
  else if(a.saveMs != null) p.push((a.saveMs / 1000).toFixed(1) + ' ث');
  if(a.cause) p.push('<b>السبب: ' + esc(a.cause) + '</b>'
    + (a.causeExact === false ? ' <span style="color:#b45309;">(مش مغطي الفرق كله)</span>' : ''));
  if(a.customerPhone) p.push('<span dir="ltr">' + esc(a.customerPhone) + '</span>');
  if(a.txnId) p.push('<span dir="ltr">TXN ' + esc(String(a.txnId)) + '</span>');
  return p.join(' · ');
}


/* ============================================================
   🧠 تفسير سجل النشاط (Office v70)
   ------------------------------------------------------------
   العنوان لوحده مش قرار. كل حدث بيتحوّل هنا إلى ٤ أسئلة عملية:
   إيه اللي حصل؟ ليه يهمني؟ أثره إيه؟ أعمل إيه دلوقتي؟
   الدالة pure عشان أي نوع جديد نقدر نختبره من غير DOM.
   ============================================================ */
function ofActIntelligence(a){
  a = a || {};
  const type = String(a.type || '');
  const info = {
    level:'normal', levelLabel:'معلومة', icon:'✅',
    explain:'حدث تشغيلي اتسجل عشان يبقى عندك أثر واضح بدل الاعتماد على الذاكرة.',
    impact:'مفيش أثر مالي مباشر ظاهر من البيانات المسجلة.',
    action:'مفيش إجراء مطلوب إلا لو الحدث متكرر أو مرتبط بشكوى.',
    money:0
  };
  const action = function(explain, impact, next, money){
    info.level='action'; info.levelLabel='محتاج إجراء'; info.icon='🚨';
    info.explain=explain; info.impact=impact; info.action=next;
    info.money=Math.max(0, Number(money)||0); return info;
  };
  const watch = function(explain, impact, next){
    info.level='watch'; info.levelLabel='متابعة'; info.icon='⚠️';
    info.explain=explain; info.impact=impact; info.action=next; return info;
  };
  const normal = function(explain, impact, next){
    info.explain=explain; info.impact=impact; info.action=next || 'لا إجراء مطلوب.'; return info;
  };

  if(type === 'card_overcharge_saved'){
    const d = Math.abs(Number(a.diff)||0);
    const why = a.cause
      ? ('الفيزا اتسحبت بأكتر من قيمة الفاتورة. السبب المسجل: ' + a.cause + (a.causeExact===false ? '، لكنه لا يفسّر كامل الفرق.' : '.'))
      : 'الفيزا اتسحبت بأكتر من قيمة الفاتورة، لكن سبب الفرق مش مسجل بشكل كافٍ.';
    return action(why,
      'فيه ' + d.toFixed(2) + ' ج.م للعميلة لازم يتتابع رده، وإلا التقفيل هيبان أوفر والعميلة تكون دفعت زيادة.',
      'راجع حالة «مستحق الرد»، نفّذ الرد من Paymob، وسجّل مرجع الرد في Office.', d);
  }
  if(type === 'card_adjustment_started') return watch(
    'الموظفة بدأت تغيّر السلة بعد ما الكارت اتقبل بالفعل.',
    'أي تقليل في الإجمالي من اللحظة دي ممكن ينتج عنه مبلغ واجب رده للعميلة.',
    'تابع نفس قصة السلة لحد الفاتورة النهائية وتأكد إن أي فرق اتسجل كمستحق رد.');
  if(type === 'card_overcharge_ok') return watch(
    'الكاشير شاف تحذير إن المسحوب أعلى من الفاتورة ووافق يكمل الحفظ.',
    'التحذير اتشاف؛ ده مش معناه إن الفلوس اترجعت.',
    'دور على حدث «الفاتورة اتحفظت» لنفس السلة وتأكد من متابعة الرد.');
  if(type === 'paymob_orphan_detected') return action(
    'السيستم لقى معاملة Paymob ناجحة بنفس السياق لكن برقم طلب مختلف عن المتوقع.',
    'ممكن تكون فلوس اتسحبت ومش مربوطة بفاتورة صحيحة؛ قيمتها ' + ofMoney(a.amount||0) + '.',
    'طابق رقم العملية/آخر 4 أرقام مع Paymob والفاتورة قبل أي إعادة دفع.', Math.abs(Number(a.amount)||0));
  if(type === 'paymob_stuck'){
    // 💳 لو نفس السلة انتهت بعدها بفاتورة محفوظة، فالحدث القديم اتحل بالفعل.
    // ده مهم خصوصًا للـsplit payment: أول كارت كان يوقف auto-save عمدًا لحد الكارت التاني،
    // ثم Office كان يفضل يعرض الحدث كأنه خطر قائم رغم إن الفاتورة اكتملت.
    if(a._resolvedBySale) return normal(
      'الدفع اتوقف مؤقتًا أثناء إكمال طرق الدفع، وبعدها نفس السلة اتحفظت كفاتورة بنجاح.',
      'مفيش فرق دفع قائم من الحدث ده؛ الفاتورة النهائية هي المرجع.',
      'لا إجراء مطلوب. راجع الفاتورة فقط لو فيه حدث مستقل لسحب زائد أو مرتجع.');
    return action(
      'Paymob وافق على الدفع لكن مسار حفظ الفاتورة ماكملش في الوقت الطبيعي. السبب التشخيصي: ' + esc(a.reason || 'غير محدد') + '.',
      'الخطر إن الموظفة تعيد السحب رغم إن الفلوس اتسحبت بالفعل.',
      'ممنوع إعادة الدفع. افتح قصة السلة وتأكد إن الفاتورة اتحفظت أو استخدم مسار الإنقاذ.', 0);
  }
  if(type === 'paymob_stuck_rescue') return watch(
    'الموظفة استخدمت مسار إنقاذ فاتورة بعد قبول Paymob.',
    'ده غالبًا إكمال صحيح لمعاملة علقت، لكنه حدث حساس لازم يبقى له فاتورة بعدها.',
    'تأكد إن نفس السلة فيها «فاتورة اتحفظت» بعد حدث الإنقاذ.');
  if(type === 'card_saved_manual') return watch(
    'دفعة كارت كانت غير محسومة في الواجهة واتسجلت يدويًا كمدفوعة.',
    'التسجيل اليدوي مفيد للإنقاذ لكنه أعلى مخاطرة من التأكيد الآلي.',
    'طابق المبلغ ومرجع/مراجع Paymob مع الفاتورة، خصوصًا لو الحدث بيتكرر عند نفس الفرع.');
  if(type === 'card_payments_cleared') return watch(
    'مدفوعات كارت مؤكدة اتمسحت من شاشة الدفع بعد سحبها فعليًا.',
    'مسحها من الشاشة لا يرجع الفلوس، وممكن يعمل فرق في الفاتورة أو التقفيل.',
    'راجع قصة السلة وتأكد هل اتعمل مرتجع/فاتورة بديلة ولا لأ.');
  if(type === 'paymob_cancelled') return watch(
    'واجهة الكاشير اعتبرت طلب الفيزا ملغي بعد تأكيد الموظفة.',
    'Paymob لا يضمن سحب الطلب من الماكينة بعد وصوله؛ لذلك لازم التأكد إن مفيش دفع تم عليه لاحقًا.',
    'لو فيه أي شك، راجع معاملات Paymob بنفس المبلغ والوقت قبل إعادة المحاولة.');
  if(type === 'gift_card_return_blocked') return watch(
    'حد حاول يعمل مرتجع لعملية مرتبطة بكارت هدية والسيستم منعها.',
    'المنع حمى رصيد/فلوس الكارت من رجوع غير صحيح، لكن المحاولة نفسها محتاجة فهم.',
    'راجع هل الموظفة كانت تقصد استبدال/إلغاء مختلف، ولو تكرر الحدث وضّح الإجراء للفريق.');
  if(type === 'redeem_value_mismatch') return action(
    'قيمة أو نقط طلب الاستبدال اللي وصلت للكاشير مش مطابقة للقواعد والرصيد الفعلي.',
    'السيستم أعاد الحساب وحمى العميلة والمحل من قيمة استبدال غير صحيحة.',
    'لو الحدث متكرر لنفس المصدر، راجع إصدار التطبيق/الطلب اللي بيولد القيم القديمة.', 0);
  if(type === 'manual_discount') return watch(
    'الموظفة طبقت خصم يدوي ' + (a.pct!=null ? a.pct + '%' : '') + ' بدل سعر/عرض تلقائي.',
    'الخصم يقلل هامش البيع، وتكراره ممكن يكشف تدريب ناقص أو استخدام غير طبيعي للصلاحية.',
    'لو الخصومات متكررة لنفس موظفة أو فرع، راجع الفواتير والسبب التجاري.');
  if(type === 'manual_drawer_open') return watch(
    'درج الكاش اتفتح يدويًا من غير حركة بيع هي اللي فتحته.',
    'مش خطأ لوحده، لكن التكرار وقت فروق الكاش مهم جدًا للمراجعة.',
    'قارن الوقت مع التقفيل وأي فرق كاش، وراقب التكرار لنفس الموظفة.');
  if(type === 'customer_points_edit') return watch(
    'رصيد نقط عميلة اتعدل يدويًا بدل ما يتغير من بيع/استبدال طبيعي.',
    'التعديل يغيّر التزام الولاء على المحل وقد يؤثر ماليًا على استبدال لاحق.',
    'راجع من → إلى والسبب المسجل، خصوصًا لو الفرق كبير أو متكرر.');
  if(type === 'same_day_reversal') return watch(
    'فاتورة اتعمل لها عكس كامل في نفس اليوم.',
    'العكس يؤثر على المبيعات والمخزون ووسيلة الدفع، فلازم يبقى متسق مع السبب.',
    'راجع الفاتورة الأصلية وطريقة رد الدفع لو كانت كارت.');
  if(type === 'same_day_return') return normal(
    'اتعمل مرتجع لصنف من فاتورة في نفس اليوم.',
    'المبيعات والمخزون اتعدلوا بقيمة الصنف المرتجع.',
    'لا إجراء إلا لو المرتجعات متكررة بشكل غير طبيعي.');
  if(type === 'item_removed') return normal(
    'صنف اتشال من السلة قبل إتمام البيع.',
    'لو حصل قبل الدفع فده تعديل عادي. لو بعد قبول الكارت، قصة السلة هتوضح إنه ممكن يكون سبب فرق مالي.',
    'راجع التوقيت داخل قصة السلة فقط لو الحدث مرتبط بدفع كارت أو بيتكرر بشكل مبالغ فيه.');
  if(type === 'cart_item_edited') return watch(
    'سعر أو كمية سطر في السلة اتعدل يدويًا.',
    'التعديل ممكن يغير إجمالي الفاتورة بعيدًا عن السعر الأصلي.',
    'راجع من/إلى ونسبة التغيير، خصوصًا لو تكرر لنفس الموظفة أو بعد دفع كارت.');
  if(type === 'cart_abandoned') return normal(
    'سلة بدأت وبعدها اتسابِت من غير بيع.',
    'ممكن تكون عميلة غيرت رأيها أو مشكلة تشغيل. التكرار العالي قد يشير لفقد مبيعات.',
    'راقب المعدل حسب الفرع والموظفة؛ ما يحتاجش تحقيق فردي عادة.');
  if(type === 'lost_sale') return watch(
    'الموظفة سجلت إن البيع ماكملش. السبب: ' + esc(a.reason || 'غير محدد') + (a.wanted ? ' · المطلوب: ' + esc(a.wanted) : ''),
    'فرصة بيع بقيمة تقريبية ' + ofMoney(a.value||0) + ' ضاعت. تسجيل السبب يحوّل الإحساس لقرار شراء/تسعير قابل للقياس.',
    a.reasonCode==='out_of_stock'||a.reasonCode==='color_size' ? 'راجع تكرار المنتج/اللون في نفس الفرع؛ لو بيتكرر ارفعه لأولوية التوريد.' : a.reasonCode==='price' ? 'راجع هل نفس الفئة بتضيع بسبب السعر وهل Bundle أو بديل سعري أنسب.' : 'راقب التكرار حسب الفرع والسبب قبل تغيير السياسة.');
  if(type === 'inventory_wiped') return action(
    'تم تنفيذ مسح/تصفير واسع للمخزون في الفرع.',
    'ده تغيير كبير في أصل المخزون وقد يخفي كميات صحيحة لو اتعمل بالخطأ.',
    'راجع فورًا عدد الأصناف والفرع وسبب العملية، وقارن بآخر استيراد/جرد.', 0);
  if(type === 'inventory_merge_bulk') return watch(
    'تم دمج مجموعات أصناف بشكل جماعي.',
    'الدمج ينقل الكميات لهوية صنف واحدة؛ أي اختيار غلط يؤثر على المخزون والباركود.',
    'راجع عدد المجموعات والفشل إن وجد، خصوصًا لو العملية كبيرة.');
  if(type === 'inventory_merge') return normal(
    'اتدمج صنف مكرر مع صنف أساسي.',
    'الكميات والهوية اتجمعت لتقليل التكرار في الكتالوج.',
    'لا إجراء إلا لو الاسم/الباركود الأساسي المختار غلط.');
  if(type === 'inventory_branch_catalog_replace') return watch(
    'اتنفذ تحديث واسع لكتالوج فرع من ملف/مصدر جديد.',
    'ممكن يضيف أو يحدّث عدد كبير من الأصناف مرة واحدة.',
    'راجع أرقام الإضافة/التحديث/الاستبعاد في التفاصيل بعد العملية.');
  if(type === 'inventory_full_reconcile') return watch(
    'اتعملت تسوية كاملة بين المخزون الحالي والبيانات المستوردة.',
    'التسوية قد تغيّر كميات وهويات كثيرة مرة واحدة.',
    'راجع ملخص التغييرات وأي عناصر مستبعدة قبل اعتبار الجرد نهائي.');
  if(type === 'import_qty_adjusted' || type === 'import_qty_moved') return normal(
    type === 'import_qty_moved' ? 'الاستيراد نقل كميات بين سجلات عشان يطابق الهوية الصحيحة.' : 'الاستيراد عدّل كميات لتطابق البيانات الجديدة.',
    'أثره مباشر على رصيد المخزون لكن العملية جزء من المزامنة المقصودة.',
    'راجع العدد فقط لو أكبر من المتوقع.');
  if(type === 'import_excluded_missing') return watch(
    'صنف موجود في السيستم لم يظهر في ملف الاستيراد وتم استبعاده حسب سياسة الاستيراد.',
    'ممكن يكون صنف اتوقف فعلًا أو سقط من الملف بالخطأ.',
    'راجع الأصناف المستبعدة لو العدد غير معتاد.');
  if(type === 'customer_name_edit') return normal(
    'اسم عميلة اتعدل في ملفها.', 'لا أثر مالي مباشر.', 'لا إجراء إلا لو التعديل غير متوقع.');
  if(type === 'rate_request_manual') return normal(
    'الموظفة طلبت من عميلة تقييم الخدمة يدويًا.', 'يساعد على زيادة التقييمات وربطها بالخدمة.', 'لا إجراء مطلوب.');
  if(type === 'sale_saved') return normal(
    'الفاتورة اتحفظت بنجاح واتربطت بقصة السلة.', 'ده الحدث الطبيعي اللي بيأكد نهاية البيع.', 'لا إجراء مطلوب.');
  if(type === 'print_latency') return normal(
    'السيستم قاس زمن الحفظ/الطباعة.', 'بيستخدم لتشخيص البطء فقط.', 'راجع فقط لو الزمن عالي ومتكرر.');
  if(type === 'paymob_terminal_saved') return normal(
    'تم حفظ/تأكيد إعداد ماكينة Paymob للفرع.', 'يحدد أي ماكينة تستقبل طلبات الدفع.', 'لا إجراء إلا لو الماكينة اتغيرت من غير قصد.');
  if(type === 'card_leg_recovered') return watch(
    'تأكيد Paymob وصل من غير شريحة دفع موجودة في الواجهة، فالسيستم أعاد بناءها تلقائيًا.',
    'شبكة الأمان منعت دفعة ناجحة من الضياع من الفاتورة.',
    'لو بيتكرر، راجع استقرار الاتصال/الواجهة عند نفس الجهاز.');
  if(type === 'inventory_claimed') return normal(
    'أصناف اتربطت بفرع محدد بدل ما تفضل بلا ملكية فرع.', 'ده ينظف توزيع المخزون بين الفروع.', 'راجع العدد لو غير متوقع.');
  if(type === 'basket_suggest_added') return normal(
    'اقتراح بيع ذكي اتضاف للسلة من واجهة الكاشير.', 'ده مؤشر استخدام لأداة زيادة السلة، مش مشكلة.', 'لا إجراء مطلوب.');
  if(type === 'wa_message') return normal(
    'تم تجهيز/إرسال مسار رسالة واتساب من الكاشير.', 'حدث تواصل تشغيلي فقط.', 'لا إجراء إلا عند تتبع تواصل معين.');
  return info;
}
window.ofActIntelligence = ofActIntelligence;

function ofActAttentionMatch(a, mode){
  if(!mode) return true;
  const lvl = ofActIntelligence(a).level;
  if(mode === 'action') return lvl === 'action';
  if(mode === 'watch') return lvl === 'watch';
  if(mode === 'normal') return lvl === 'normal';
  return true;
}
window.ofActAttentionMatch = ofActAttentionMatch;

function ofActSmartSummary(list){
  const rows = list || [];
  let action=0, watch=0, money=0;
  const branchHot={}, typeHot={};
  rows.forEach(function(a){
    const x=ofActIntelligence(a);
    if(x.level==='action') action++;
    if(x.level==='watch') watch++;
    money += Math.max(0, Number(x.money)||0);
    if(x.level!=='normal'){
      const b=a.branch||'غير محدد'; branchHot[b]=(branchHot[b]||0)+1;
      const t=a.type||'unknown'; typeHot[t]=(typeHot[t]||0)+1;
    }
  });
  const topBranch=Object.keys(branchHot).sort(function(a,b){return branchHot[b]-branchHot[a];})[0]||'';
  const repeats=Object.keys(typeHot).filter(function(t){return typeHot[t]>=3;})
    .sort(function(a,b){return typeHot[b]-typeHot[a];}).slice(0,3)
    .map(function(t){return {type:t,count:typeHot[t],label:ofActLabel(t)};});
  return { total:rows.length, action:action, watch:watch, money:+money.toFixed(2),
           topBranch:topBranch, topBranchCount:topBranch?branchHot[topBranch]:0, repeats:repeats };
}

window.ofActSmartSummary = ofActSmartSummary;

/* 📈 Behavior Intelligence — Office v71 */
function ofActBehaviorInsights(list, now){
  const rows=(list||[]).filter(function(a){ return a && a.ts; });
  now=Number(now)||Date.now();
  const DAY=86400000, curFrom=now-DAY;
  const old=rows.filter(function(a){ return Number(a.ts)<curFrom; });
  const cur=rows.filter(function(a){ return Number(a.ts)>=curFrom && Number(a.ts)<=now; });
  if(!old.length) return [];
  const oldest=Math.min.apply(null, old.map(function(a){return Number(a.ts)||now;}));
  const baselineDays=Math.max(1, Math.min(29, (curFrom-oldest)/DAY));
  const riskTypes={manual_discount:1,manual_drawer_open:1,customer_points_edit:1,
    card_overcharge_saved:1,paymob_stuck:1,paymob_orphan_detected:1,same_day_reversal:1,
    inventory_wiped:1,inventory_merge_bulk:1,inventory_branch_catalog_replace:1,inventory_full_reconcile:1};
  function key(a,dim){ return String(dim==='employee'?(a.employeeName||''):(a.branch||'')); }
  function counts(arr,dim,type){ const m={}; arr.forEach(function(a){
    if(a.type!==type)return; const k=key(a,dim); if(k)m[k]=(m[k]||0)+1; }); return m; }
  const out=[];
  ['employee','branch'].forEach(function(dim){
    Object.keys(riskTypes).forEach(function(type){
      const c=counts(cur,dim,type), b=counts(old,dim,type);
      Object.keys(c).forEach(function(name){
        const today=c[name]||0, prev=b[name]||0, avg=prev/baselineDays;
        const newPattern=prev===0 && today>=3, ratio=avg>0?today/avg:0;
        const elevated=prev>=2 && today>=2 && ratio>=2;
        if(!newPattern&&!elevated)return;
        const strong=today>=4&&(newPattern||ratio>=3);
        out.push({level:strong?'action':'watch',dimension:dim,name:name,type:type,today:today,
          previous:prev,baselineDays:+baselineDays.toFixed(1),dailyAvg:+avg.toFixed(2),
          ratio:avg>0?+ratio.toFixed(1):null,label:ofActLabel(type),
          explain:newPattern?('ظهر '+today+' مرات خلال آخر 24 ساعة، ومكانش ظاهر في الفترة السابقة.')
            :('حصل '+today+' مرات خلال آخر 24 ساعة مقابل متوسط '+avg.toFixed(1)+' مرة يوميًا قبل كده ('+ratio.toFixed(1)+'×).')});
      });
    });
  });
  return out.sort(function(a,b){if(a.level!==b.level)return a.level==='action'?-1:1;
    return (b.ratio||99)-(a.ratio||99)||b.today-a.today;}).slice(0,8);
}
window.ofActBehaviorInsights=ofActBehaviorInsights;

/* 🧾 رقم الفاتورة: وقت وقوع الحدث الفاتورة لسه مالهاش رقم — فبنربط
   بمعرّف السلة (sid). حدث `sale_saved` هو اللي شايل الرقم، وبنوزّعه
   على كل أحداث نفس السلة. الحل ده من نفس البيانات المحمّلة — صفر
   قراءات زيادة. أحداث ما قبل v296 مالهاش sid وهتفضل من غير رقم. */
function ofActLinkInvoices(list){
  const byId = {};
  (list || []).forEach(function(a){
    if(a && a.type === 'sale_saved' && a.sid && a.invoiceCode)
      byId[a.sid] = { code: a.invoiceCode, total: a.total };
  });
  (list || []).forEach(function(a){
    if(a && !a.invoiceCode && a.sid && byId[a.sid])
      a._linkedInvoice = byId[a.sid].code;
    // حدث paymob_stuck يصبح محلولًا لو نفس قصة السلة انتهت فعلًا بفاتورة محفوظة.
    // بنحتفظ بالحدث للتشخيص، لكن ماينفعش يفضل «محتاج إجراء» بعد نجاح النهاية.
    if(a && a.type === 'paymob_stuck' && a.sid && byId[a.sid])
      a._resolvedBySale = true;
  });
  return list;
}
window.ofActLinkInvoices = ofActLinkInvoices;
// فلترة نقية — قابلة للاختبار من غير DOM ولا Firestore
function ofActFilter(list, opts){
  opts = opts || {};
  const q = String(opts.q || '').trim().toLowerCase();
  const grp = opts.group || '';
  const attention = opts.attention || '';
  /* 🤫 الأحداث الهادية (`quiet`) مخفية **افتراضيًا**.
     ------------------------------------------------------------
     🔴 الباج: العلامة `quiet` كانت متعرّفة على `sale_saved` و
        `print_latency` — يعني اللي كتبها كان **قاصد** يخفيهم —
        لكنها **ماتستخدمتش في أي مكان**. الفلتر مكانش بيبصّ عليها
        خالص، فالتبويب كان بيعرض كل فاتورة بتتباع.
     ⚠️ النتيجة العملية: كل بيعة بتولّد حدثين، فتبويب اسمه "نشاط
        غريب" بيمتلي مبيعات عادية. والمالك بيفتح ويلاقي مفيش حاجة
        غريبة — وبعد مرتين تلاتة **بيبطّل يفتحه خالص**، وساعتها
        التنبيهات الحقيقية (سحب فيزا زيادة، خصم يدوي، مسح مخزون)
        بتضيع وسط الضوضاء. التبويب اللي بيصيح على كل حاجة = تبويب
        محدش بيسمعه.
     ⚠️ **مش بيتشالوا من التسجيل** — بيتسجلوا زي ما هما (مهمين
        لربط رقم الفاتورة وقياس الأداء)، بس مبيظهروش إلا لما
        المالك يطلبهم صراحةً. */
  const showQuiet = !!opts.showQuiet;
  return (list || []).filter(function(a){
    if(!a) return false;
    const kind = OF_ACT_KINDS[a.type];
    if(!showQuiet && kind && kind.quiet) return false;
    if(grp){
      const k = OF_ACT_KINDS[a.type];
      if(!k || k.g !== grp) return false;
    }
    if(attention && !ofActAttentionMatch(a, attention)) return false;
    if(q){
      const hay = [a.employeeName, a.branch, a.name, a.invoiceCode,
                   a._linkedInvoice, a.customerPhone,
                   ofActLabel(a.type)].join(' ').toLowerCase();
      if(hay.indexOf(q) < 0) return false;
    }
    return true;
  }).sort(function(x, y){ return (y.ts || 0) - (x.ts || 0); });
}
window.ofActFilter = ofActFilter;
window.ofActLabel = ofActLabel;

async function ofLoadActivity(){
  const body = document.getElementById('actBody');
  const days = +(document.getElementById('actDays') || {}).value || 7;
  if(body) body.innerHTML = '<div class="empty">⏳ بيحمّل...</div>';
  try{
    // ⚠️ نافذة زمنية + limit: من غيرهم السجل ده لوحده بياكل القراءات
    const snap = await db.collection('pos_activity_log')
      .where('ts', '>=', Date.now() - days * 24 * 60 * 60 * 1000)
      .orderBy('ts', 'desc').limit(OF_ACT_LIMIT).get();
    _ofActRaw = ofActLinkInvoices(
      snap.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); }));
    ofRenderActivity();
  }catch(e){
    console.warn('activity', e);
    if(body) body.innerHTML = '<div class="empty">⚠️ مش قادر يحمّل: ' + esc(e && e.message || e)
      + '<br><span style="font-size:11px;">لو الرسالة فيها index — افتح اللينك اللي في الكونسول مرة واحدة.</span></div>';
  }
}
window.ofLoadActivity = ofLoadActivity;

function ofRenderActivity(){
  const body = document.getElementById('actBody');
  const sum = document.getElementById('actSummary');
  if(!body) return;
  const list = ofActFilter(_ofActRaw, {
    q: (document.getElementById('actSearch') || {}).value,
    group: (document.getElementById('actKind') || {}).value,
    attention: (document.getElementById('actAttention') || {}).value,
    showQuiet: !!(document.getElementById('actQuiet') || {}).checked
  });
  if(sum){
    const sm = ofActSmartSummary(list);
    const quietN = _ofActRaw.filter(function(a){
      const k = OF_ACT_KINDS[a && a.type]; return k && k.quiet; }).length;
    const showingQuiet = !!(document.getElementById('actQuiet') || {}).checked;
    const repeatHtml = sm.repeats.length
      ? '<div style="margin-top:8px; padding:8px 10px; border-radius:10px; background:rgba(245,158,11,.10); font-size:11.5px; line-height:1.8;">'
        + '<b>🧠 أنماط متكررة:</b> ' + sm.repeats.map(function(x){ return esc(x.label) + ' ×' + x.count; }).join(' · ') + '</div>'
      : '';
    const behavior = ofActBehaviorInsights(list);
    const behaviorHtml = behavior.length
      ? '<div style="margin-top:8px;border:1px solid var(--line);border-radius:11px;padding:9px 10px;background:var(--panel2);">'
        + '<div style="font-weight:900;font-size:12px;margin-bottom:5px;">📈 تغيّر عن الطبيعي</div>'
        + behavior.slice(0,5).map(function(x){const c=x.level==='action'?'#dc2626':'#b45309';const who=x.dimension==='employee'?'👤 ':'🏬 ';
          return '<div style="font-size:11.5px;line-height:1.75;padding:4px 0;border-top:1px dashed var(--line);"><b style="color:'+c+';">'
            +(x.level==='action'?'🚨':'⚠️')+' '+who+esc(x.name)+'</b> · '+esc(x.label)+'<br><span class="muted">'+esc(x.explain)+'</span></div>';}).join('')
        + '<div class="muted" style="font-size:10.5px;margin-top:5px;">المقارنة: آخر 24 ساعة مقابل المتوسط اليومي للفترة السابقة. الإشارة لا تعني خطأ أو سوء تصرف؛ معناها إن السلوك اتغيّر ويستحق المراجعة.</div></div>' : '';
    sum.innerHTML = '<div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; margin-bottom:8px;">'
      + '<div style="background:rgba(220,38,38,.09); border:1px solid rgba(220,38,38,.22); border-radius:11px; padding:9px;">'
        + '<div class="muted" style="font-size:10.5px;">🚨 محتاج إجراء</div><b style="font-size:20px; color:#dc2626;">' + sm.action + '</b></div>'
      + '<div style="background:rgba(245,158,11,.08); border:1px solid rgba(245,158,11,.20); border-radius:11px; padding:9px;">'
        + '<div class="muted" style="font-size:10.5px;">⚠️ محتاج متابعة</div><b style="font-size:20px; color:#b45309;">' + sm.watch + '</b></div>'
      + '<div style="background:var(--panel2); border-radius:11px; padding:9px;">'
        + '<div class="muted" style="font-size:10.5px;">💰 مبلغ تحت المراجعة</div><b style="font-size:17px;">' + ofMoney(sm.money) + '</b></div>'
      + '<div style="background:var(--panel2); border-radius:11px; padding:9px;">'
        + '<div class="muted" style="font-size:10.5px;">🏬 أكتر فرع فيه إشارات</div><b style="font-size:13px;">' + (sm.topBranch ? esc(sm.topBranch) + ' · ' + sm.topBranchCount : '—') + '</b></div>'
      + '</div>'
      + '<div class="muted" style="font-size:11.5px; line-height:1.7; margin-bottom:6px;">'
      + sm.total + ' حدث ظاهر'
      + (!showingQuiet && quietN ? ' · ' + quietN + ' حدث روتيني متخفي' : '')
      + (_ofActRaw.length >= OF_ACT_LIMIT ? ' · <b>وصلنا حد الـ' + OF_ACT_LIMIT + ' — ضيّق المدة لو عايز القصة كاملة</b>' : '')
      + '</div>' + repeatHtml + behaviorHtml;
  }
  if(!list.length){ body.innerHTML = '<div class="empty">مفيش أحداث مطابقة للفلاتر 👌</div>'; return; }
  body.innerHTML = list.map(function(a){
    const intel = ofActIntelligence(a);
    const det = ofActDetail(a);
    const inv = a.invoiceCode || a._linkedInvoice || '';
    const col = intel.level === 'action' ? '#dc2626' : (intel.level === 'watch' ? '#d97706' : 'var(--line)');
    const bg = intel.level === 'action' ? 'rgba(220,38,38,.05)' : (intel.level === 'watch' ? 'rgba(245,158,11,.045)' : 'transparent');
    const badgeBg = intel.level === 'action' ? 'rgba(220,38,38,.13)' : (intel.level === 'watch' ? 'rgba(245,158,11,.14)' : 'var(--panel2)');
    const badgeCol = intel.level === 'action' ? '#dc2626' : (intel.level === 'watch' ? '#b45309' : 'var(--sub)');
    return '<div onclick="ofActOpen(' + "'" + esc(a.id) + "'" + ')" '
      + 'style="cursor:pointer; border-right:4px solid ' + col + '; background:' + bg
      + '; border-radius:11px; padding:9px 10px; margin-bottom:7px;">'
      + '<div style="display:flex; align-items:flex-start; justify-content:space-between; gap:7px;">'
        + '<div style="font-weight:900; font-size:13px; line-height:1.55; flex:1;">' + esc(ofActLabel(a.type)) + '</div>'
        + '<span style="font-size:10.5px; font-weight:900; white-space:nowrap; padding:3px 7px; border-radius:99px; background:' + badgeBg + '; color:' + badgeCol + ';">'
          + intel.icon + ' ' + esc(intel.levelLabel) + '</span></div>'
      + (det ? '<div style="font-size:12px; margin-top:3px; font-weight:700;">' + det + '</div>' : '')
      + '<div style="font-size:11.8px; line-height:1.7; margin-top:5px;"><b>يعني إيه؟</b> ' + esc(intel.explain) + '</div>'
      + (intel.level !== 'normal' ? '<div style="font-size:11.5px; line-height:1.7; margin-top:2px; color:' + badgeCol + ';"><b>الإجراء:</b> ' + esc(intel.action) + '</div>' : '')
      + '<div class="muted" style="font-size:10.8px; margin-top:5px;">'
      + (inv ? '🧾 ' + esc(inv) + ' · ' : '')
      + '🏬 ' + esc(a.branch || '—') + ' · 🧑‍💼 ' + esc(a.employeeName || '—')
      + ' · ' + ofWhen(a.ts, true) + '</div></div>';
  }).join('');
}
window.ofRenderActivity = ofRenderActivity;

(function(){
  const load = document.getElementById('actLoad');
  if(load) load.addEventListener('click', function(){ ofLoadActivity(); });
  // 🐞 بلاغات المشاكل — نفس السياسة: بدوسة بس
  const inc = document.getElementById('incLoad');
  if(inc) inc.addEventListener('click', function(){ loadIncidents(); });
  const s = document.getElementById('actSearch');
  if(s) s.addEventListener('input', function(){ ofRenderActivity(); });
  const k = document.getElementById('actKind');
  if(k) k.addEventListener('change', function(){ ofRenderActivity(); });
  const at = document.getElementById('actAttention');
  if(at) at.addEventListener('change', function(){ ofRenderActivity(); });
  const d = document.getElementById('actDays');
  if(d) d.addEventListener('change', function(){ ofLoadActivity(); });
  /* 🤫 التبديل بيعيد العرض بس — **مش** بيعيد التحميل: البيانات
     محمّلة أصلًا والفلترة محلية. إعادة تحميل هنا = قراءات Firestore
     من غير أي داعي مع كل ضغطة. */
  const qz = document.getElementById('actQuiet');
  if(qz) qz.addEventListener('change', function(){ ofRenderActivity(); });
})();


/* 🕵️ الضغط على حدث: القصة كاملة — كل أحداث نفس السلة بالترتيب
   الزمني + كل حقول الحدث الخام (عشان أي نوع جديد يبان من غير ما
   نستنى تحديث). ده اللي كان ناقص: الصف كان بيعرض عنوان ومحدش
   يعرف يوصل للتفاصيل ولا يعرف الفاتورة. */
const OF_ACT_FIELD_AR = {
  charged:'المسحوب', total:'الإجمالي', diff:'الفرق', amount:'المبلغ',
  name:'الصنف', qty:'الكمية', price:'السعر', invoiceCode:'كود الفاتورة',
  invoiceNo:'رقم الفاتورة', customerPhone:'تليفون العميلة', txnId:'رقم العملية',
  reason:'السبب', cause:'سبب الفرق', causeSum:'مجموع السبب', causeExact:'السبب مطابق للفرق', count:'العدد', itemCount:'عدد القطع', cartCountAfter:'باقي في السلة',
  saveMs:'من التأكيد للطباعة (ms)', paymobMs:'عند Paymob (ms)',
  deliverMs:'وصول للجهاز (ms)', totalMs:'الإجمالي (ms)', ref:'مرجع الطلب',
  sid:'معرّف السلة', employeeName:'الموظفة', branch:'الفرع',
  from:'من', to:'إلى', pct:'نسبة الخصم', barcode:'الباركود', legs:'عدد دفعات الكارت',
  refs:'مراجع الدفع', waitedMs:'مدة الانتظار (ms)', skip:'سبب تخطي الحفظ', online:'الإنترنت',
  expected:'المرجع المتوقع', matched:'المرجع المطابق', last4:'آخر 4 أرقام',
  groups:'مجموعات الدمج', closed:'المغلقة', failed:'فشل', reqPoints:'النقط المطلوبة',
  reqValue:'القيمة المطلوبة', sanePoints:'النقط الصحيحة', saneValue:'القيمة الصحيحة', balance:'الرصيد'
};
const OF_ACT_SKIP = { id:1, type:1, ts:1, employeeId:1, _linkedInvoice:1 };
window.ofActOpen = function(id){
  const a = (_ofActRaw || []).filter(function(x){ return x.id === id; })[0];
  if(!a) return;
  const story = (_ofActRaw || []).filter(function(x){
    return a.sid && x.sid === a.sid; })
    .sort(function(x, y){ return (x.ts || 0) - (y.ts || 0); });
  const rows = [];
  Object.keys(a).forEach(function(key){
    if(OF_ACT_SKIP[key]) return;
    let v = a[key];
    if(v == null || v === '') return;
    if(typeof v === 'object') v = JSON.stringify(v);
    rows.push('<div style="display:flex; justify-content:space-between; gap:8px;'
      + ' padding:5px 0; border-bottom:1px dashed var(--line); font-size:12.5px;">'
      + '<span class="muted">' + esc(OF_ACT_FIELD_AR[key] || key) + '</span>'
      + '<span style="font-weight:700; text-align:left;" dir="auto">' + esc(String(v)) + '</span></div>');
  });
  const inv = a.invoiceCode || a._linkedInvoice || '';
  const intel = ofActIntelligence(a);
  const _icol = intel.level === 'action' ? '#dc2626' : (intel.level === 'watch' ? '#b45309' : '#166534');
  let html = '<div style="font-weight:900; font-size:16px;">' + esc(ofActLabel(a.type)) + '</div>'
    + '<div class="muted" style="font-size:11.5px; margin-bottom:8px;">'
    + ofWhen(a.ts, true) + ' · ' + esc(a.branch || '') + '</div>'
    + (inv ? '<div style="background:var(--panel2); border-radius:8px; padding:7px 9px; margin-bottom:8px; font-weight:800; font-size:13px;">🧾 ' + esc(inv) + '</div>'
           : '<div class="muted" style="font-size:11.5px; margin-bottom:8px;">🧾 مفيش فاتورة مربوطة — إما السلة اتسابت من غير بيع، أو الحدث قديم (قبل تحديث الربط)</div>')
    + '<div style="border:1px solid var(--line); border-right:4px solid ' + _icol + '; border-radius:11px; padding:10px; margin-bottom:10px; background:var(--panel2);">'
      + '<div style="font-weight:900; color:' + _icol + '; margin-bottom:5px;">' + intel.icon + ' ' + esc(intel.levelLabel) + '</div>'
      + '<div style="font-size:12.5px; line-height:1.8;"><b>التفسير:</b> ' + esc(intel.explain) + '</div>'
      + '<div style="font-size:12.5px; line-height:1.8; margin-top:3px;"><b>الأثر:</b> ' + esc(intel.impact) + '</div>'
      + '<div style="font-size:12.5px; line-height:1.8; margin-top:3px;"><b>الخطوة الصح:</b> ' + esc(intel.action) + '</div>'
    + '</div>'
    + '<div style="font-weight:900; font-size:13px; margin:8px 0 4px;">🔎 البيانات المسجلة</div>'
    + rows.join('');
  if(story.length > 1){
    html += '<div style="font-weight:900; font-size:13.5px; margin:12px 0 6px;">📖 قصة السلة دي بالترتيب</div>';
    story.forEach(function(x){
      const me = x.id === a.id;
      html += '<div style="padding:5px 8px; margin-bottom:4px; border-radius:7px; font-size:12px;'
        + (me ? ' background:rgba(199,154,56,.18); font-weight:800;' : ' background:var(--panel2);') + '">'
        + ofWhen(x.ts) + ' — ' + esc(ofActLabel(x.type))
        + (ofActDetail(x) ? '<div class="muted" style="font-size:11px;">' + ofActDetail(x) + '</div>' : '')
        + '</div>';
    });
  }
  const ov = document.createElement('div');
  ov.id = 'ofActOv';
  ov.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:90;'
    + ' display:flex; align-items:flex-end; justify-content:center;';
  ov.innerHTML = '<div style="background:var(--panel); width:100%; max-width:520px;'
    + ' border-radius:18px 18px 0 0; padding:14px; max-height:85vh; overflow:auto;">'
    + '<div style="display:flex; justify-content:flex-end;">'
    + '<button onclick="document.getElementById(\'ofActOv\').remove()" style="background:none; border:none; color:var(--sub); font-size:20px; cursor:pointer;">✖</button></div>'
    + html + '</div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
};

function startData(){
  if(started) return; started = true;

  // 💳↩️ فروق فيزا مستحقة الرد (فاتورة 1444) — نافذة ٦٠ يوم:
  //    المستحق بيتقفل بالرد، واللي أقدم من كده اترد خلاص أو بقى قضية
  db.collection('pos_card_refunds_due')
    .where('ts', '>=', Date.now() - 60 * 24 * 60 * 60 * 1000)
    .onSnapshot(function(s){
      D.refundsDue = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
      maybeNotifyNew('crd', D.refundsDue.filter(function(x){ return x.status === 'due'; }),
        '💳 اتسحب فيزا زيادة — مستحقة الرد',
        function(x){ return (x.branch||'') + ' — ' + (x.diff||0) + ' ج.م — ' + (x.customerPhone||'من غير رقم'); });
      try{ renderRefundsDue(); }catch(e){ console.warn('refunds due', e); }
      try{ ofSyncCreditBadge(); }catch(e){}
    }, function(){ /* الكولكشن ممكن ميكونش موجود لسه */ });

  db.collection('sales_leave_requests').onSnapshot(function(s){
    D.leaves = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    maybeNotifyNew('lv', D.leaves.filter(function(x){ return x.status==='pending'; }),
      '📩 طلب إذن جديد', function(x){ return (x.empName||'') + ' — ' + (x.branch||'') + ' — ' + (x.dateKey||''); });
    renderInbox();
  });
  db.collection('sales_registrations').onSnapshot(function(s){
    D.regs = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    maybeNotifyNew('rg', D.regs.filter(function(x){ return x.status==='pending'; }),
      '🔒 طلب تسجيل موظف', function(x){ return (x.name||'') + ' — ' + (x.branch||''); });
    renderInbox();
    try{ ofRenderHireRegs(); }catch(e){ console.warn('hire regs', e); }
  }, function(){ /* الكولكشن ممكن ميكونش موجود */ });

  // 💼 المتقدّمين — نافذة ٩٠ يوم (الطلبات بتتراكم ومحدش بيرجع لطلب من سنة)
  db.collection('job_applications').where('ts','>=', Date.now() - 90*86400000)
    .onSnapshot(function(s4){
      _apList = s4.docs.map(function(d){ const o = d.data() || {}; o.id = d.id; return o; });
      try{ ofRenderApplicants(); }catch(e){ console.warn('applicants', e); }
    }, function(e){ console.warn('applicants sync', e && e.code); });

  // 🧑‍💼 الدعوات
  db.collection('staff_invites').onSnapshot(function(s2){
    _hvInvites = s2.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    try{ ofRenderInvites(); }catch(e){ console.warn('invites', e); }
  }, function(e){ console.warn('invites sync', e && e.code); });

  // 📎 مستندات الطلبات — بتتجمّع تحت رقم الطلب
  // ⚠️ الصور كبيرة، فبنقرا آخر ٦٠ يوم بس بدل المجموعة كلها.
  db.collection('staff_docs').where('ts', '>=', Date.now() - 60*86400000)
    .onSnapshot(function(s3){
      _hrDocs = {};
      s3.docs.forEach(function(d){
        const o = d.data() || {}; o.id = d.id;
        (_hrDocs[o.regId] = _hrDocs[o.regId] || []).push(o);
      });
      try{ ofRenderHireRegs(); }catch(e){ console.warn('hire docs', e); }
    }, function(e){
      // 🩺 فشل القراءة كان بيتبلع في الكونسول — دلوقتي بيبان على الشاشة
      _hrDocsErr = String((e && (e.code || e.message)) || 'خطأ');
      console.warn('docs sync', e);
      try{ ofRenderHireRegs(); }catch(_e){}
    });
  db.collection('sales_staff_orders').onSnapshot(function(s){
    D.orders = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    maybeNotifyNew('so', D.orders.filter(function(x){ return x.status==='pending'; }),
      '🛒 أوردر موظف جديد', function(x){ return (x.employeeName||'') + ' — ' + egp(x.total||0); });
    renderInbox();
  });
  db.collection('sales_shortages').onSnapshot(function(s){
    D.shorts = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    maybeNotifyNew('sh', D.shorts.filter(function(x){ return x.status==='open'; }),
      '📦 طلب نواقص', function(x){ return (x.productName||x.barcode) + ' × ' + (x.qty||1) + ' — ' + (x.branch||''); });
    renderInbox(); renderShort();
  });
  db.collection('office_merchants').onSnapshot(function(s){
    D.merchants = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    renderMerchants(); try{ ofRenderQuickGoodsMerchants(); ofWireQuickGoods(); ofWireVoiceGoods(); }catch(e){}
  });
  db.collection('office_merchant_txns').onSnapshot(function(s){
    D.mtxns = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    renderMerchants(); renderPL();
  });
  db.collection('office_expenses').onSnapshot(function(s){
    D.expenses = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    renderExpenses(); renderPL();
    try{ renderCashHand(); }catch(e){}
    try{ ofRenderRecurring(); }catch(e){ console.warn('recurring', e); }   // حالة "اتدفع" بتتغير
  });
  // 🔁 قوالب المصاريف المتكررة
  db.collection(OF_RECUR_COL).onSnapshot(function(s){
    D.recurring = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    try{ ofRenderRecurring(); }catch(e){ console.warn('recurring', e); }
  }, function(e){ console.warn('recurring sync', e && e.code); });
  db.collection('sales_employees').onSnapshot(function(s){
    D.employees = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    renderSalaries(); fillBranchSel(); renderPL();
    // 📅 شاشة اليوم — بعد ما الموظفين يوصلوا (منهم بنعرف الفروع)
    ofLoadDayCut().then(function(){ try{ ofWireDay(); }catch(e){ console.warn('day', e); } });
    try{ ofWireTasks(); }catch(e){ console.warn('tasks', e); }
    try{ ofWireHire(); }catch(e){ console.warn('hire', e); }
    try{ ofWireEmpFile(); }catch(e){ console.warn('empfile', e); }
    try{ ofWireApplicants(); }catch(e){ console.warn('applicants', e); }
    try{ ofWireOpenings(); }catch(e){ console.warn('openings', e); }
  });
  // 👥 الحاضرين دلوقتي — الشيفتات المفتوحة (حضور من غير انصراف).
  // ⚡ الاستعلام على clockOutTs == null بيرجّع الشغالين بس (عدد صغير جدًا)،
  //    مش كل الشيفتات — قراءات شبه معدومة.
  db.collection('sales_shifts').where('clockOutTs','==', null).onSnapshot(function(s){
    D.openShifts = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    try{ ofRenderPresent(); }catch(e){ console.warn('present', e); }
    try{ renderOfficeHomeSummary(); }catch(e){}
  }, function(e){ console.warn('present sync', e && e.code); });

  // 💵 المصروف الفعلي للرواتب والمكافآت — للكاش اللي في الإيد
  db.collection('sales_salary_payments').onSnapshot(function(s){
    D.salaryPays = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    try{ renderCashHand(); }catch(e){}
  }, function(e){ console.warn('salary pays sync', e && e.code); });
  db.collection('sales_rewards').onSnapshot(function(s){
    D.rewards = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    try{ renderCashHand(); }catch(e){}
  }, function(e){ console.warn('rewards sync', e && e.code); });
  db.collection('office_paymob_settlements').onSnapshot(function(s){
    D.settlements = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    try{ renderCashHand(); renderInbox(); ofMaybeWeeklyPaymobReminder(); }catch(e){}
  }, function(e){ console.warn('settlements sync', e && e.code); });
  // 💳 طلبات الرصيد المستنية موافقة
  db.collection('credit_requests').where('status','==','pending')
    .onSnapshot(function(s){
      D.creditRequests = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
      // ⚠️ العدّاد الأول: renderCreditAdmin بترجع بدري لو التبويب مقفول،
      //    فلو اعتمدنا عليها العدّاد ما كانش هيظهر غير لما تفتح الشاشة.
      try{ ofSyncCreditBadge(); }catch(e){}
      try{ renderCreditAdmin(); }catch(e){}
    }, function(e){ console.warn('credit reqs', e && e.code); });
  // 🎁 نسخة الكروت للعرض (من غير البصمة — مجموعة gift_cards مقفولة)
  db.collection('gift_cards_public').onSnapshot(function(s){
    D.giftCards = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    try{ renderCreditAdmin(); }catch(e){}
  }, function(e){ console.warn('gift cards', e && e.code); });
  // 📒 آخر حركات الرصيد
  // ⚠️ محدودة بـ٥٠ عن قصد — الدفتر بيكبر بلا حدود، واستعلام مفتوح
  //    عليه بيولّع فاتورة القراءات (نفس درس التقفيل).
  db.collection('credit_ledger').orderBy('at','desc').limit(50)
    .onSnapshot(function(s){
      D.creditLedger = s.docs.map(function(d){ return d.data(); });
      try{ renderCreditAdmin(); }catch(e){}
    }, function(e){ console.warn('credit ledger', e && e.code); });

  // 📒 تعديلات الشيت اليدوية + العدّ الفعلي (مستند لكل يوم)
  db.collection('office_cash_days').onSnapshot(function(s){
    const m = {};
    s.docs.forEach(function(d){ m[d.id] = Object.assign({ id:d.id }, d.data()); });
    D.cashDays = m;
    try{ renderCashHand(); }catch(e){}
  }, function(e){ console.warn('cash days sync', e && e.code); });
  // ⚙️ إعدادات الدفتر: إجازة الأسبوع · تأخير Paymob · الدهب
  db.collection('pos_test_settings').doc('office_cash_cfg').onSnapshot(function(d){
    D.cashCfg = d.exists ? (d.data() || {}) : {};
    try{ renderCashHand(); }catch(e){}
    try{ setTimeout(function(){ ofAutoUpdateGoldPrice(false); },250); }catch(e){}
  }, function(e){ console.warn('cash cfg sync', e && e.code); });
  db.collection('pos_test_settings').doc('office_cash').onSnapshot(function(d){
    D.cashBase = d.exists ? (d.data() || null) : null;
    try{ renderCashHand(); }catch(e){}
  }, function(e){ console.warn('cash base sync', e && e.code); });
  db.collection('sales_advances').onSnapshot(function(s){
    D.advances = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    renderSalaries(); renderPL();
  });
  // مبيعات آخر 30 يوم (قراءة دورية مش snapshot — أخف على الموبايل)
  // ⚡ ترشيد القراءات:
  //   • التحديث بيقف تمامًا والتطبيق في الخلفية
  //   • بيانات التقارير بتتحمّل عند فتح تبويب التقارير بس، ومع كاش
  //   • الفترات اتوسّعت (كانت 5 دقايق = آلاف القراءات في الساعة)
  loadSales();
  setInterval(function(){ if(!document.hidden) loadSales(); }, 20*60*1000);
  db.collection('pos_test_inventory').get().then(function(s){
    D.inventory = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    renderTop();
  });

  setTimeout(function(){ firstLoadDone = true; try{renderInbox();ofMaybeWeeklyPaymobReminder();}catch(e){} }, 8000);
}
// 💸 كانت بتسحب **٣٠ يوم فواتير كاملة كل ٢٠ دقيقة** طول ما التطبيق
//    مفتوح — يعني ٧٢ سحبة كاملة في اليوم لنفس البيانات. دلوقتي أول مرة
//    بس بتسحب الـ٣٠ يوم، وبعدها بتجيب **الجديد من آخر فاتورة اتحمّلت**
//    وتدمجه. السحبات اللي بعد الأولى بتبقى فواتير الفترة القصيرة دي بس.
let _salesTo = 0;                    // آخر createdAt اتحمّل (ملي ثانية)
function _saleMs(x){
  try{
    if(x && x.createdAt && typeof x.createdAt.toMillis === 'function') return x.createdAt.toMillis();
    if(x && typeof x.createdAtMs === 'number') return x.createdAtMs;
  }catch(e){}
  return 0;
}
function loadSales(){
  const cut = new Date(); cut.setDate(cut.getDate()-30); cut.setHours(0,0,0,0);
  const cutMs = cut.getTime();
  // ⚠️ بنرجع دقيقة ورا آخر واحدة اتحمّلت — فواتير الأوفلاين بتوصل متأخرة
  //    وطابع السيرفر بتاعها ممكن يكون قبل آخر واحدة شفناها بثواني.
  const fromMs = _salesTo ? Math.max(cutMs, _salesTo - 60000) : cutMs;
  db.collection('pos_test_sales')
    .where('createdAt','>=', firebase.firestore.Timestamp.fromMillis(fromMs)).get()
    .then(function(s){
      const fresh = s.docs.map(function(d){ const o = d.data() || {}; o._id = d.id; return o; });
      if(!_salesTo){
        D.sales = fresh;
      }else{
        // دمج بالـid — الفاتورة اللي اتحدّثت بتاخد نسختها الجديدة
        const seen = {};
        fresh.forEach(function(x){ seen[x._id] = 1; });
        D.sales = D.sales.filter(function(x){ return !seen[x._id] && _saleMs(x) >= cutMs; }).concat(fresh);
      }
      D.sales.forEach(function(x){ const t = _saleMs(x); if(t > _salesTo) _salesTo = t; });
      renderTop();
      try{ renderCashHand(); renderInbox(); ofMaybeWeeklyPaymobReminder(); }catch(e){}
      try{ renderGrowth(); }catch(e){}
    }).catch(function(e){ console.warn('sales load', e); });
}

// 👥 العملاء — للتقارير (تحميلات التطبيق والمكافآت والنقط)
// ⚡ بتتحمّل عند فتح تبويب التقارير بس، والكاش صالح ربع ساعة.
const REPORT_CACHE_MS = 15*60*1000;
let _custAt = 0, _ratAt = 0;
function loadCustomers(force){
  if(!force && _custAt && (Date.now() - _custAt) < REPORT_CACHE_MS) return;
  _custAt = Date.now();
  db.collection('pos_test_customers').get().then(function(s){
    D.customers = s.docs.map(function(d){ return Object.assign({ _id:d.id }, d.data()); });
    try{ renderActivityReports(); }catch(e){ console.warn('activity', e); }
  }).catch(function(e){ console.warn('customers load', e); });
}

// ⭐ تقييمات العملاء (آخر 30 يوم)
function loadRatings(force){
  if(!force && _ratAt && (Date.now() - _ratAt) < REPORT_CACHE_MS) return;
  _ratAt = Date.now();
  var from = Date.now() - 30*86400000;
  db.collection('entries').where('ts','>=', from).get().then(function(s){
    D.ratings = s.docs.map(function(d){ return d.data(); });
    try{ renderActivityReports(); }catch(e){ console.warn('ratings', e); }
  }).catch(function(e){ console.warn('ratings load', e); });
}

/* ============================================================
   📈 تقارير النشاط اليومي
   ============================================================ */
// بيحوّل أي شكل تاريخ (Timestamp / رقم / نص) لبداية اليوم
function _dayKeyOf(v){
  if(v == null) return null;
  var ms = null;
  if(typeof v === 'number') ms = v;
  else if(v.toMillis) ms = v.toMillis();
  else if(v.seconds) ms = v.seconds * 1000;
  else { var t = new Date(v).getTime(); if(!isNaN(t)) ms = t; }
  if(!ms) return null;
  var d = new Date(ms);
  var p = function(n){ return String(n).padStart(2,'0'); };
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}

// 📥 تحميلات التطبيق يوم بيوم (العميل اللي اتسجّل من التطبيق)
function dailyDownloads(customers, days){
  var out = {};
  (customers||[]).forEach(function(c){
    if(!c) return;
    var src = String(c.source || '');
    if(!/^(loyalty_app|glow_app)/.test(src)) return;   // اللي اتسجّل من الكاشير مش تحميل
    var k = _dayKeyOf(c.createdAt);
    if(k) out[k] = (out[k] || 0) + 1;
  });
  return _lastDays(out, days || 14);
}

// 🎁 مكافآت الترحيب يوم بيوم (أول تحميل)
function dailyWelcome(customers, days){
  var out = {};
  (customers||[]).forEach(function(c){
    if(!c) return;
    var t = c.welcomeGranted_echarpe || c.welcomeGranted_glow;
    var k = _dayKeyOf(t);
    if(k) out[k] = (out[k] || 0) + 1;
  });
  return _lastDays(out, days || 14);
}

// ⭐ النقط المكتسبة يوم بيوم + عدد العملاء اللي أخدوا نقط
function dailyPoints(sales, days){
  var pts = {}, custs = {};
  (sales||[]).forEach(function(sl){
    if(!sl || sl.reversed || sl.isReversal) return;
    var earned = Number(sl.loyaltyPointsEarned) || 0;
    if(earned <= 0) return;
    var k = _dayKeyOf(sl.createdAt);
    if(!k) return;
    pts[k] = (pts[k] || 0) + earned;
    if(!custs[k]) custs[k] = {};
    if(sl.customerPhone) custs[k][sl.customerPhone] = 1;
  });
  var rows = _lastDays(pts, days || 14);
  rows.forEach(function(r){ r.people = custs[r.day] ? Object.keys(custs[r.day]).length : 0; });
  return rows;
}

// بيرجّع آخر N يوم مرتبين من الأحدث، وبيحط صفر لليوم اللي مفيهوش حاجة
function _lastDays(map, n){
  var out = [];
  var d = new Date(); d.setHours(0,0,0,0);
  var p = function(x){ return String(x).padStart(2,'0'); };
  for(var i = 0; i < n; i++){
    var k = d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
    out.push({ day: k, count: map[k] || 0 });
    d.setDate(d.getDate() - 1);
  }
  return out;
}
window.dailyDownloads = dailyDownloads;
window.dailyWelcome = dailyWelcome;
window.dailyPoints = dailyPoints;

// ⭐ ملخص التقييمات: المتوسط والتوزيع وأعداد السيّئ
// ⭐ المقياس **من 4** — زي تطبيق الولاء و POS بالظبط (😠 🙁 🙂 😍)
var RATING_MAX = 4;
function ratingsSummary(entries, sinceMs){
  var out = { total:0, avg:0, dist:{1:0,2:0,3:0,4:0}, bad:0, good:0, byBranch:{} };
  var sum = 0;
  (entries||[]).forEach(function(e){
    if(!e) return;
    var r = Number(e.r);
    if(!(r >= 1 && r <= RATING_MAX)) return;          // تقييم مش صالح
    if(sinceMs && !(Number(e.ts) >= sinceMs)) return;
    out.total++; sum += r;
    out.dist[r] = (out.dist[r] || 0) + 1;
    if(r <= 2) out.bad++;
    if(r >= 4) out.good++;
    var b = e.branch || '—';
    if(!out.byBranch[b]) out.byBranch[b] = { n:0, sum:0, bad:0 };
    out.byBranch[b].n++; out.byBranch[b].sum += r;
    if(r <= 2) out.byBranch[b].bad++;
  });
  out.avg = out.total ? +(sum / out.total).toFixed(2) : 0;
  Object.keys(out.byBranch).forEach(function(b){
    var x = out.byBranch[b];
    x.avg = x.n ? +(x.sum / x.n).toFixed(2) : 0;
  });
  return out;
}
// تقييمات يوم بيوم
function dailyRatings(entries, days){
  var map = {}, sums = {};
  (entries||[]).forEach(function(e){
    if(!e) return;
    var r = Number(e.r); if(!(r >= 1 && r <= 5)) return;
    var k = _dayKeyOf(e.ts); if(!k) return;
    map[k] = (map[k] || 0) + 1;
    sums[k] = (sums[k] || 0) + r;
  });
  var rows = _lastDays(map, days || 14);
  rows.forEach(function(x){
    x.avg = x.count ? +(sums[x.day] / x.count).toFixed(1) : 0;
  });
  return rows;
}
window.ratingsSummary = ratingsSummary;
window.dailyRatings = dailyRatings;

function _miniBars(rows, unit, color){
  var max = rows.reduce(function(m,r){ return Math.max(m, r.count); }, 0) || 1;
  return rows.map(function(r){
    var pct = Math.round(r.count / max * 100);
    var dd = r.day.slice(5).replace('-','/');
    return '<div class="row" style="align-items:center; gap:8px; padding:3px 0;">'
      + '<span class="muted" style="font-size:11px; min-width:42px;">' + dd + '</span>'
      + '<span style="flex:1; height:14px; background:#ffffff10; border-radius:99px; overflow:hidden;">'
      + '<span style="display:block; height:100%; width:' + pct + '%; background:' + color + ';"></span></span>'
      + '<b style="min-width:64px; text-align:left; font-size:12px;">' + r.count + ' ' + unit
      + (r.people != null ? ' <span class="muted" style="font-weight:400;">· ' + r.people + ' عميل</span>' : '')
      + '</b></div>';
  }).join('');
}

/* ============================================================
   🔎 مين قيّم — الأسماء والأرقام
   ------------------------------------------------------------
   كل تقييم جاي من **تطبيق الولاء** بيتسجّل ومعاه رقم العميلة ورقم
   الفاتورة واسم البياعة اللي كانت معاها. الأرقام دي كانت متخزنة من
   زمان و**محدش بيعرضها في أي شاشة** — فالمالك يشوف \"3 تقييمات سيّئة\"
   ومايعرفش مين عشان يكلمها.
   ⚠️ تقييمات **شاشة الفرع** مجهولة بطبيعتها (ضغطة سريعة من غير هوية) —
      بتتعرض هنا كـ\"مجهول\" ومش بينختلقلها هوية بالتخمين الزمني.
   ============================================================ */
window._ratFilter = window._ratFilter || 'bad';
window.setRatFilter = function(f){ window._ratFilter = f; renderWhoRated(); };

function _ratCustName(phone){
  if(!phone) return '';
  var c = (D.customers || []).find(function(x){
    return x && (x._id === phone || x.phone === phone);
  });
  return (c && c.name) ? c.name : '';
}
// 📱/🖥️ نفس تصنيف المصدر المستخدم في POS بالظبط
function _ratSource(e){ return (e && (e.source === 'app_after_visit' || e.saleId)) ? 'app' : 'kiosk'; }
function _ratRows(list, filter){
  var rows = (list || []).filter(function(e){
    if(!e || !(Number(e.r) >= 1 && Number(e.r) <= RATING_MAX)) return false;
    if(filter === 'bad')   return Number(e.r) <= 2;
    if(filter === 'notes') return !!(e.note && String(e.note).trim());
    if(filter === 'named') return !!e.customerPhone;
    if(filter === 'app')   return _ratSource(e) === 'app';
    if(filter === 'kiosk') return _ratSource(e) === 'kiosk';
    return true;
  });
  // الأسوأ الأول، وبعدين الأحدث — ده ترتيب المتابعة مش ترتيب العرض
  rows.sort(function(a,b){ return (Number(a.r) - Number(b.r)) || (Number(b.ts) - Number(a.ts)); });
  return rows;
}
function renderWhoRated(){
  var box = document.getElementById('whoRated'); if(!box) return;
  var FACE = {1:'😠', 2:'🙁', 3:'🙂', 4:'😍'};
  var COL  = {1:'#e5484d', 2:'#f59e0b', 3:'#84cc16', 4:'#22c55e'};
  var all  = D.ratings || [];
  var f    = window._ratFilter || 'bad';
  var rows = _ratRows(all, f);
  var counts = {
    all:   _ratRows(all, 'all').length,
    bad:   _ratRows(all, 'bad').length,
    notes: _ratRows(all, 'notes').length,
    named: _ratRows(all, 'named').length,
    app:   _ratRows(all, 'app').length,
    kiosk: _ratRows(all, 'kiosk').length
  };
  var tab = function(k, label){
    var on = (f === k);
    return '<button onclick="setRatFilter(\'' + k + '\')" class="ghost" style="padding:7px 11px; border-radius:9px; font-size:12px;'
      + (on ? 'background:#ffffff22; font-weight:800;' : '') + '">' + label + ' (' + counts[k] + ')</button>';
  };

  var body = rows.length ? rows.slice(0, 120).map(function(e){
    var r = Number(e.r);
    var phone = e.customerPhone || '';
    var name = _ratCustName(phone);
    var who = phone
      ? '<a href="tel:' + esc(phone) + '" style="color:#60a5fa; font-weight:800;">'
        + esc(name || phone) + '</a>' + (name ? ' <span class="muted" style="font-size:11px; direction:ltr;">' + esc(phone) + '</span>' : '')
      : '<span class="muted">مجهول</span>';
    var when = new Date(Number(e.ts) || 0).toLocaleString('ar-EG', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    var isApp = _ratSource(e) === 'app';
    var srcTag = '<span style="font-size:10.5px; padding:2px 6px; border-radius:6px; white-space:nowrap; '
      + (isApp ? 'background:#4338ca33; color:#a5b4fc;">📱 التطبيق' : 'background:#ffffff14; color:#94a3b8;">🖥️ شاشة الفرع')
      + '</span>';
    return '<div style="border-right:3px solid ' + COL[r] + '; background:#ffffff08; border-radius:10px; padding:9px 11px; margin-bottom:7px;">'
      + '<div class="row" style="align-items:center; gap:8px;">'
        + '<span style="font-size:17px;">' + FACE[r] + '</span>'
        + '<span style="flex:1;">' + who + '</span>'
        + srcTag
        + '<span class="muted" style="font-size:11px; white-space:nowrap;">' + when + '</span>'
      + '</div>'
      + '<div class="muted" style="font-size:11px; margin-top:3px;">'
        + esc(e.branch || '—')
        + (e.servedByEmployeeName ? ' · مع ' + esc(e.servedByEmployeeName) : '')
        + (e.saleId ? ' · فاتورة ' + esc(String(e.saleId).slice(-6)) : '')
      + '</div>'
      + (e.note && String(e.note).trim()
          ? '<div style="font-size:12.5px; line-height:1.7; margin-top:5px; white-space:pre-wrap;">' + esc(e.note) + '</div>'
          : '')
    + '</div>';
  }).join('') : '<div class="empty">مفيش تقييمات في الفلتر ده</div>';

  box.innerHTML = '<div class="panel"><h3>🔎 مين قيّم (آخر 30 يوم)</h3>'
    + '<div class="hint">التقييمات السيّئة الأول — دي اللي محتاجة مكالمة. دوس على الاسم عشان تتصل.</div>'
    + '<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">'
      + tab('bad', '😠 محتاج متابعة') + tab('notes', '💬 كتبوا كلام')
      + tab('app', '📱 التطبيق') + tab('kiosk', '🖥️ شاشة الفرع') + tab('all', 'الكل')
    + '</div>'
    + body
    + (rows.length > 120 ? '<div class="hint" style="margin-top:8px;">معروض أول 120 من ' + rows.length + '</div>' : '')
  + '</div>';
}
window.renderWhoRated = renderWhoRated;

function renderActivityReports(){
  var box = document.getElementById('activityReports'); if(!box) return;
  var dl = dailyDownloads(D.customers, 14);
  var wl = dailyWelcome(D.customers, 14);
  var pt = dailyPoints(D.sales, 14);
  var sum = function(rows){ return rows.reduce(function(n,r){ return n + r.count; }, 0); };
  var today = function(rows){ return rows.length ? rows[0].count : 0; };

  box.innerHTML =
    '<div class="card"><h3>📱 تحميلات التطبيق</h3>'
    + '<div class="row" style="margin-bottom:8px;"><span class="muted">النهاردة</span>'
    + '<b style="font-size:19px;">' + today(dl) + '</b></div>'
    + '<div class="row" style="margin-bottom:10px;"><span class="muted">آخر 14 يوم</span>'
    + '<b>' + sum(dl) + '</b></div>'
    + _miniBars(dl, 'تحميل', '#3b82f6') + '</div>'

    + '<div class="card"><h3>🎁 مكافأة أول تحميل</h3>'
    + '<div class="row" style="margin-bottom:8px;"><span class="muted">النهاردة</span>'
    + '<b style="font-size:19px;">' + today(wl) + '</b></div>'
    + '<div class="row" style="margin-bottom:10px;"><span class="muted">آخر 14 يوم</span>'
    + '<b>' + sum(wl) + '</b></div>'
    + _miniBars(wl, 'مكافأة', '#f59e0b') + '</div>'

    + '<div class="card"><h3>⭐ النقط المكتسبة</h3>'
    + '<div class="row" style="margin-bottom:8px;"><span class="muted">النهاردة</span>'
    + '<b style="font-size:19px;">' + today(pt) + ' نقطة</b></div>'
    + '<div class="row" style="margin-bottom:10px;"><span class="muted">آخر 14 يوم</span>'
    + '<b>' + sum(pt) + ' نقطة</b></div>'
    + _miniBars(pt, 'نقطة', '#22c55e') + '</div>'

    + (function(){
        var rt = dailyRatings(D.ratings, 14);
        var sm = ratingsSummary(D.ratings, Date.now() - 30*86400000);
        var faceOf = function(n){ return ({1:'😠 وحش',2:'🙁 عادي',3:'🙂 كويس',4:'😍 ممتاز'})[n] || n; };
        var distRows = [4,3,2,1].map(function(r){
          var c = sm.dist[r] || 0;
          var pct = sm.total ? Math.round(c / sm.total * 100) : 0;
          var col = r >= 4 ? '#22c55e' : (r === 3 ? '#f59e0b' : '#e5484d');
          return '<div class="row" style="align-items:center; gap:8px; padding:3px 0;">'
            + '<span style="min-width:74px; font-size:12px; color:' + col + ';">' + faceOf(r) + '</span>'
            + '<span style="flex:1; height:14px; background:#ffffff10; border-radius:99px; overflow:hidden;">'
            + '<span style="display:block; height:100%; width:' + pct + '%; background:' + col + ';"></span></span>'
            + '<b style="min-width:64px; text-align:left; font-size:12px;">' + c
            + ' <span class="muted" style="font-weight:400;">(' + pct + '%)</span></b></div>';
        }).join('');
        var brRows = Object.keys(sm.byBranch).sort(function(a,b){
          return sm.byBranch[b].n - sm.byBranch[a].n;
        }).map(function(b){
          var x = sm.byBranch[b];
          var col = x.avg >= 4 ? '#22c55e' : (x.avg >= 3 ? '#f59e0b' : '#e5484d');
          return '<div class="card row"><span>' + esc(b) + ' <span class="muted">· ' + x.n + ' تقييم</span></span>'
            + '<span><b style="color:' + col + ';">' + x.avg.toFixed(2) + '</b>'
            + (x.bad ? ' <span class="muted" style="font-size:11px;">· ' + x.bad + ' سيّئ</span>' : '')
            + '</span></div>';
        }).join('');
        return '<div class="card"><h3>⭐ تقييمات العملاء (آخر 30 يوم)</h3>'
          + '<div class="row" style="margin-bottom:6px;"><span class="muted">المتوسط العام</span>'
          + '<b style="font-size:19px; color:' + (sm.avg >= 4 ? '#22c55e' : (sm.avg >= 3 ? '#f59e0b' : '#e5484d')) + ';">'
          + sm.avg.toFixed(2) + ' / ' + RATING_MAX + '</b></div>'
          + '<div class="row" style="margin-bottom:4px;"><span class="muted">عدد التقييمات</span><b>' + sm.total + '</b></div>'
          + '<div class="row" style="margin-bottom:10px;"><span class="muted">تقييمات سيّئة (1-2)</span>'
          + '<b style="color:' + (sm.bad ? '#e5484d' : '#22c55e') + ';">' + sm.bad + '</b></div>'
          + distRows
          + (brRows ? ('<div style="margin-top:12px; font-size:12.5px; font-weight:800;">حسب الفرع</div>' + brRows) : '')
          + '<div style="margin-top:12px; font-size:12.5px; font-weight:800;">يوم بيوم</div>'
          + _miniBars(rt, 'تقييم', '#a855f7')
          + '</div>';
      })();
  try{ renderWhoRated(); }catch(e){ console.warn('whoRated', e); }
}
window.renderActivityReports = renderActivityReports;

/* ============================================================
   💹 الربح والخسارة
   ============================================================ */
let plMonthSales = null;      // مبيعات الشهر المختار (منفصلة عن آخر 30 يوم)
let plLoadedMonth = '';
function plSelectedMonth(){
  const sel = $('#plMonthSel');
  return (sel && sel.value) || monthKey();
}
function fillPlMonths(){
  const sel = $('#plMonthSel'); if(!sel || sel.options.length) return;
  const now = new Date();
  const opts = [];
  for(let i=0;i<6;i++){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const mk = monthKey(d);
    const label = d.toLocaleDateString('ar-EG', { month:'long', year:'numeric' });
    opts.push('<option value="'+mk+'">'+label+(i===0?' (الحالي)':'')+'</option>');
  }
  sel.innerHTML = opts.join('');
  sel.onchange = loadPlMonth;
}
function loadPlMonth(){
  const mk = plSelectedMonth();
  if(mk === plLoadedMonth && plMonthSales){ renderPL(); return; }
  const parts = mk.split('-');
  const from = new Date(Number(parts[0]), Number(parts[1])-1, 1);
  const to   = new Date(Number(parts[0]), Number(parts[1]), 1);
  db.collection('pos_test_sales')
    .where('createdAt','>=', firebase.firestore.Timestamp.fromDate(from))
    .where('createdAt','<',  firebase.firestore.Timestamp.fromDate(to)).get()
    .then(function(s){
      plMonthSales = s.docs.map(function(d){ return d.data(); });
      plLoadedMonth = mk;
      renderPL();
    }).catch(function(e){ console.warn('pl load', e); $('#plBody').innerHTML = '<div class="empty">تعذر تحميل المبيعات</div>'; });
}
function renderPL(){
  const body = $('#plBody'); if(!body) return;
  fillPlMonths();
  const mk = plSelectedMonth();
  if(plLoadedMonth !== mk || !plMonthSales){ loadPlMonth(); return; }
  const r = profitReport({ sales:plMonthSales, employees:D.employees, advances:D.advances,
                           mtxns:D.mtxns, expenses:D.expenses }, mk);
  // مبيعات الفروع
  const brs = Object.keys(r.byBranch).sort();
  $('#plBranches').innerHTML = brs.length ? brs.map(function(b){
    return '<div class="card row"><span>🏬 مبيعات '+esc(b)+'</span><span class="amount pos">'+egp(r.byBranch[b])+'</span></div>';
  }).join('') : '<div class="empty">مفيش مبيعات متسجلة للشهر ده</div>';
  // البنود
  body.innerHTML =
    '<div class="card row" style="border-color:var(--good);"><b>إجمالي المبيعات</b><span class="amount pos">'+egp(r.revenue)+'</span></div>' +
    '<div class="card row"><span>👥 المرتبات الأساسية' +
      (r.advances ? '<div class="muted">متدفع منها مقدمًا كسلف: '+egp(r.advances)+'</div>' : '') +
    '</span><span class="amount neg">− '+egp(r.salaries)+'</span></div>' +
    '<div class="card row"><span>📦 البضاعة (أوردرات التجار)</span><span class="amount neg">− '+egp(r.goods)+'</span></div>' +
    '<div class="card row"><span>💸 المصاريف والإيجارات</span><span class="amount neg">− '+egp(r.expenses)+'</span></div>';
  // النتيجة
  const res = $('#plResult');
  if(r.profit >= 0){
    res.style.background = 'rgba(63,191,96,.12)'; res.style.border = '1px solid var(--good)'; res.style.color = 'var(--good)';
    res.textContent = '✅ مكسب ' + egp(r.profit);
  } else {
    res.style.background = 'rgba(224,121,107,.12)'; res.style.border = '1px solid var(--bad)'; res.style.color = 'var(--bad)';
    res.textContent = '🔻 خسارة ' + egp(Math.abs(r.profit));
  }
}

/* ============================================================
   🔔 الوارد
   ============================================================ */

/* ============================================================
   🗓️ صورة اليوم قبل الموافقة على إذن / تغيير شيفت
   ------------------------------------------------------------
   🔴 شكوى المالك حرفيًا: «بوافق وأنا مش فاهم ولا شايف حاجة».
      الكارت كان بيقول **مين طلب** بس. والقرار الحقيقي مش عن
      الطالبة — هو عن **الفرع في اليوم ده**: مين صباحي، مين مسائي،
      مين مأذون خلاص، وهيفضل كام لو وافقت.
   ⚠️ **صفر قراءات جديدة**: الموظفين والأذونات محمّلين أصلًا
      (`D.employees` · `D.leaves`)، والحساب كله في الذاكرة.
   ⚠️ الأذونات المحسوبة هي **الموافَق عليها بس** — المعلّقة لسه
      احتمال، وعدّها كغياب بيخوّف المالك من موافقة مش لازمة.
   ============================================================ */
function ofLeaveContext(req){
  const branch = (req && req.branch) || '';
  const dateKey = (req && req.dateKey) || '';
  const emps = (D.employees || []).filter(function(e){
    return e && e.active !== false && e.branch === branch;
  });

  /* 🛌 مأذونين نفس اليوم — الموافَق عليهم، من غير الطلب اللي بين إيدك */
  const offIds = {};
  (D.leaves || []).forEach(function(l){
    if(!l || l.status !== 'approved') return;
    if(l.branch !== branch || l.dateKey !== dateKey) return;
    if(req && l.id === req.id) return;
    offIds[l.employeeId || l.empId] = l.empName || '';
  });

  /* 🗓️ إجازة الأسبوع الثابتة كمان — دي مش «إذن» بس هي غياب فعلي.
     ⚠️ من غيرها المالك يوافق ويلاقي الفرع فاضي، وهو شايف رقم
        يقول إن فيه ٣ موجودين. */
  let dow = -1;
  try{
    const d = dateKey ? new Date(dateKey + 'T12:00:00') : null;
    if(d && !isNaN(d)) dow = d.getDay();
  }catch(e){}

  const rows = emps.map(function(e){
    const id = e.id;
    const onLeave = Object.prototype.hasOwnProperty.call(offIds, id);
    const weeklyOff = (dow >= 0 && e.dayOff !== undefined && e.dayOff !== null
                       && e.dayOff !== '' && Number(e.dayOff) === dow);
    return {
      id: id, name: e.name || id,
      shift: e.shift || '',
      isRequester: !!(req && (req.employeeId === id || req.empId === id)),
      off: onLeave || weeklyOff,
      why: onLeave ? 'مأذونة' : (weeklyOff ? 'إجازتها الأسبوعية' : '')
    };
  });

  const avail = function(sh){
    return rows.filter(function(r){ return r.shift === sh && !r.off && !r.isRequester; });
  };
  return {
    branch: branch, dateKey: dateKey, rows: rows,
    morning: rows.filter(function(r){ return r.shift === 'morning'; }),
    evening: rows.filter(function(r){ return r.shift === 'evening'; }),
    offRows: rows.filter(function(r){ return r.off; }),
    afterMorning: avail('morning').length,
    afterEvening: avail('evening').length,
    requester: rows.filter(function(r){ return r.isRequester; })[0] || null
  };
}
window.ofLeaveContext = ofLeaveContext;

/* 🖼️ العرض — سطرين مقروءين مش جدول.
   ⚠️ الرقم اللي بيهم هو **اللي هيفضل بعد الموافقة**، مش العدد
      الحالي. العدد الحالي بيطمّن غلط. */
function ofLeaveContextHtml(req){
  const c = ofLeaveContext(req);
  if(!c.rows.length) return '';
  const nm = function(list){
    return list.map(function(r){
      return esc(r.name) + (r.off ? ' <span style="opacity:.6;">(' + esc(r.why) + ')</span>'
                                  : (r.isRequester ? ' <b>(الطالبة)</b>' : ''));
    }).join(' · ') || '—';
  };
  const warn = (c.requester && c.requester.shift === 'morning' ? c.afterMorning : c.afterEvening) <= 0;
  return '<div style="margin-top:8px; padding:9px 11px; border-radius:10px;'
    + ' background:var(--panel2,#f7f7f9); border:1px solid ' + (warn ? 'var(--minus,#c33)' : 'var(--border,#e5e5e5)') + '; font-size:12px; line-height:1.9;">'
    + '<div>🌅 <b>صباحي:</b> ' + nm(c.morning) + '</div>'
    + '<div>🌆 <b>مسائي:</b> ' + nm(c.evening) + '</div>'
    + (c.offRows.length ? '<div>🛌 <b>مش موجودين:</b> ' + nm(c.offRows) + '</div>' : '')
    + '<div style="margin-top:4px; font-weight:800; color:' + (warn ? 'var(--minus,#c33)' : 'inherit') + ';">'
    +   (warn ? '⚠️ لو وافقت، الشيفت ده هيفضل **من غير حد**'
             : '👉 لو وافقت: صباحي ' + c.afterMorning + ' · مسائي ' + c.afterEvening)
    + '</div></div>';
}
window.ofLeaveContextHtml = ofLeaveContextHtml;


/* ============================================================
   🏠 الرئيسية — صاحب البيزنس يشوف اللي محتاجه في 10 ثواني
   ============================================================ */
function renderOfficeHomeSummary(){
  const host = document.getElementById('officeHomeSummary');
  if(!host || typeof D === 'undefined') return;

  let pending = 0;
  try{ pending = buildInbox(D).length; }catch(e){}
  pending += (D.creditRequests || []).filter(function(x){ return x && x.status === 'pending'; }).length;
  pending += (D.refundsDue || []).filter(function(x){ return x && x.status === 'due'; }).length;

  let liquid = null, pm = 0;
  try{
    if(D.cashBase && D.cashBase.atMs){
      const L = ofCashLedger(D.cashBase, D, D.cashDays || {}, ofLedgerCfg(), Date.now(), 0);
      const W = ofWealth(L, ofLedgerCfg(), Date.now());
      liquid = L.now;
      pm = W.paymobNet;
    }
  }catch(e){}

  const daySales = (_ofDaySales || []).reduce(function(n,s){ return n + (Number(s && s.total) || 0); }, 0);
  const present = (D.openShifts || []).filter(function(x){ return x && !x.clockOutTs; }).length;
  const dateLabel = ($('#dayDate') || {}).value || '';

  host.innerHTML =
    '<div class="of-home-hero">'
    + '<div class="of-home-top"><div><div class="of-home-kicker">OWNER CONTROL CENTER</div><div class="of-home-title">إيه اللي محتاج اهتمامك دلوقتي؟</div></div>'
    + '<div class="of-home-date">' + esc(dateLabel) + '</div></div>'
    + '<div class="of-home-grid">'
    + '<div class="of-home-stat ' + (pending ? 'hot' : '') + '" onclick="ofGoPage(\'inbox\')"><b>' + pending + '</b><span>محتاج قرارك</span></div>'
    + '<div class="of-home-stat" onclick="ofGoPage(\'cash\')"><b>' + (liquid === null ? 'ابدأ' : egp(liquid)) + '</b><span>السيولة المؤكدة</span></div>'
    + '<div class="of-home-stat"><b>' + ofMoney(daySales) + '</b><span>مبيعات اليوم المختار</span></div>'
    + '<div class="of-home-stat"><b>' + present + '</b><span>حاضرين دلوقتي</span></div>'
    + '</div>'
    + '<div class="of-home-actions">'
    + '<button onclick="ofGoPage(\'cash\')">💰 اعرف معايا كام</button>'
    + '<button onclick="ofGoPage(\'inbox\')">🔔 القرارات</button>'
    + '<button onclick="ofGoPage(\'reports\')">📊 التقارير</button>'
    + (pm > 0 ? '<button onclick="ofGoPage(\'cash\')">🏦 Paymob: ' + egp(pm) + '</button>' : '')
    + '</div>'
    + '</div>';
}
window.renderOfficeHomeSummary = renderOfficeHomeSummary;

function renderInbox(){
  try{ renderOfficeHomeSummary(); }catch(e){}
  const wrap = $('#inboxList'); if(!wrap) return;
  const items = buildInbox(D);
  const nb = $('#nbInbox');
  nb.style.display = items.length ? '' : 'none';
  nb.textContent = items.length;
  const nbs = $('#nbShort');
  const openShorts = D.shorts.filter(function(x){ return x.status==='open'; }).length;
  nbs.style.display = openShorts ? '' : 'none';
  nbs.textContent = openShorts;
  if(!items.length){ wrap.innerHTML = '<div class="empty">مفيش حاجة مستنية ✅ — استمتع بيومك</div>'; return; }
  wrap.innerHTML = items.map(function(i){
    let actions = '';
    if(i.kind === 'leave') actions =
      /* 🗓️ صورة اليوم قبل الأزرار — القرار عن **الفرع** مش عن الطالبة */
      (function(){ try{
        const _r = (D.leaves || []).filter(function(x){ return x.id === i.id; })[0];
        return _r ? ofLeaveContextHtml(_r) : '';
      }catch(e){ return ''; } })() +
      '<div style="display:flex; gap:7px; margin-top:9px;">' +
      '<button class="btn ok" style="flex:1;" onclick="officeDecideLeave(\''+i.id+'\',\'approved\')">✅ موافقة</button>' +
      '<button class="btn no" onclick="officeDecideLeave(\''+i.id+'\',\'rejected\')">رفض</button></div>';
    if(i.kind === 'short') actions =
      '<div style="margin-top:9px;"><button class="btn ok" style="width:100%;" onclick="officeCloseShort(\''+i.id+'\')">✅ اتجاب</button></div>';
    if(i.kind === 'paymobWeekly') actions =
      '<div style="margin-top:9px;"><button class="btn gold" style="width:100%;" onclick="ofConfirmWeeklyPaymob(\''+i.id+'\')">✅ راجع وأكد المبلغ</button></div>';
    return '<div class="card">' +
      '<div class="row"><b style="font-size:13px;">'+esc(i.title)+'</b><span class="pill g">'+esc(i.branch)+'</span></div>' +
      '<div class="muted" style="margin-top:3px;">'+esc(i.who)+(i.sub ? ' · '+esc(i.sub) : '')+' · '+dstr(i.ts)+'</div>' +
      actions + '</div>';
  }).join('');
}
// ⚠️ الأزرار دي كانت بتنفّذ على طول — دوسة غلط على شاشة موبايل = قرار
//    اتاخد ومفيش رجوع. التأكيد بيقول **الاسم والفرع والقرار** عشان تعرف
//    إنك بتوافق على مين بالظبط، مش مجرد "متأكد؟".
window.officeDecideLeave = function(id, decision){
  const r = (D.leaves || []).filter(function(x){ return x.id === id; })[0] || {};
  const who = (r.empName || 'الموظفة') + (r.branch ? (' — ' + r.branch) : '');
  const when = r.dateKey ? ('\nيوم: ' + r.dateKey) : '';
  const word = (decision === 'approved') ? '✅ توافق على' : '❌ ترفض';
  /* ⚠️ نفس الأرقام في التأكيد كمان: الكارت ممكن يكون اتعمله سكرول
     والمالك بيدوس من غير ما يبصّ. الرقم لازم يبقى قدام عينه لحظة
     القرار مش فوق بشوية. */
  let _ctxTxt = '';
  try{
    if(decision === 'approved'){
      const c = ofLeaveContext(r);
      if(c.rows.length){
        _ctxTxt = '\n\nبعد الموافقة في ' + (r.branch || '') + ':'
          + '\n🌅 صباحي: ' + c.afterMorning + '  ·  🌆 مسائي: ' + c.afterEvening
          + (c.offRows.length ? ('\n🛌 مش موجودين: '
              + c.offRows.map(function(x){ return x.name; }).join('، ')) : '');
      }
    }
  }catch(e){}
  if(!confirm(word + ' طلب إذن\n\n' + who + when + _ctxTxt + '\n\nمتأكد؟')) return;
  db.collection('sales_leave_requests').doc(id).update({ status:decision, decidedAt:Date.now(), decidedFrom:'office' })
    .catch(function(e){ alert('تعذر الحفظ: '+e.message); });
};
window.officeCloseShort = function(id){
  const x = (D.shorts || []).filter(function(y){ return y.id === id; })[0] || {};
  const what = (x.productName || ('كود ' + (x.barcode || ''))) + ' × ' + (x.qty || 1);
  if(!confirm('✅ تعلّم النقص ده إنه اتجاب؟\n\n' + what
    + (x.branch ? ('\n' + x.branch) : '') + '\n\nهيختفي من القايمة.')) return;
  db.collection('sales_shortages').doc(id).update({ status:'done', doneAt:Date.now(), doneFrom:'office' })
    .catch(function(e){ alert('تعذر الحفظ: '+e.message); });
};

/* ============================================================
   📦 النواقص
   ============================================================ */
function renderShort(){
  const wrap = $('#shortList'); if(!wrap) return;
  const open = D.shorts.filter(function(x){ return x.status==='open'; })
    .sort(function(a,b){ return b.ts - a.ts; });
  if(!open.length){ wrap.innerHTML = '<div class="empty">مفيش نواقص مطلوبة ✅</div>'; return; }
  wrap.innerHTML = open.map(function(x){
    return '<div class="card">' +
      '<div class="row"><b style="font-size:13px;">'+esc(x.productName||('كود '+x.barcode))+' × '+(x.qty||1)+'</b>' +
      '<span class="pill g">'+esc(x.branch||'')+'</span></div>' +
      '<div class="muted" style="margin-top:3px;">'+(x.detail?esc(x.detail)+' · ':'')
      +(shortCode(x) ? 'كود '+esc(shortCode(x))+' · ' : '')+
      'مخزون وقت الطلب: '+(x.currentStock==null?'—':x.currentStock)+'</div>' +
      '<div class="muted" style="margin-top:2px;">طلبها: '+esc(x.empName||'')+' · '+dstr(x.ts)+'</div>' +
      '<div style="margin-top:9px;"><button class="btn ok" style="width:100%;" onclick="officeCloseShort(\''+x.id+'\')">✅ اتجاب</button></div>' +
      '</div>';
  }).join('');
}

/* ============================================================
   🧾 التجار
   ============================================================ */
$('#mAdd').addEventListener('click', function(){
  const name = $('#mName').value.trim();
  if(!name) return;
  db.collection('office_merchants').add({ name:name, ts:Date.now() })
    .then(function(){ $('#mName').value=''; })
    .catch(function(e){ alert('تعذر الإضافة: '+e.message); });
});
// 🧾 كارت التاجر — سجل كامل بدل آخر 3 حركات
let _mOpen = {};      // مين مفتوح سجله
window.toggleMerchLog = function(id){ _mOpen[id] = !_mOpen[id]; renderMerchants(); };

function renderMerchants(){
  const wrap = $('#merchantsList'); if(!wrap) return;
  if(!D.merchants.length){
    wrap.innerHTML = '<div class="empty">لسه مفيش تجار. تقدر تضيف يدويًا، أو دوس 🎙️ «ابدأ تسجيل» وقول اسم التاجر والمبلغ — النظام هيعرض إضافته قبل التأكيد.</div>';
    return;
  }
  // 📊 ملخص فوق: إجمالي اللي عليك
  const totalDue = D.merchants.reduce(function(n, m){
    const t = D.mtxns.filter(function(x){ return x.merchantId === m.id; });
    const b = merchantBalance(t);
    return n + (b > 0 ? b : 0);
  }, 0);
  const head = '<div class="card" style="border-right:4px solid var(--bad); margin-bottom:12px;">'
    + '<div class="row"><span class="muted">إجمالي اللي عليك للتجار</span>'
    + '<span class="amount neg" style="font-size:20px;">' + egp(totalDue) + '</span></div>'
    + '<div class="muted" style="font-size:11.5px; margin-top:3px;">'
    + D.merchants.length + ' تاجر</div></div>';

  wrap.innerHTML = head + D.merchants
    .slice().sort(function(a,b){
      // اللي عليه أكتر يظهر الأول
      const ba = merchantBalance(D.mtxns.filter(function(t){ return t.merchantId === a.id; }));
      const bb = merchantBalance(D.mtxns.filter(function(t){ return t.merchantId === b.id; }));
      return bb - ba;
    })
    .map(function(m){
      const txns = D.mtxns.filter(function(t){ return t.merchantId === m.id; })
        .sort(function(a,b){ return b.ts - a.ts; });
      const bal = merchantBalance(txns);
      const orders = txns.filter(function(t){ return t.type === 'order'; });
      const pays   = txns.filter(function(t){ return t.type !== 'order'; });
      const sumO = orders.reduce(function(n,t){ return n + (t.amount||0); }, 0);
      const sumP = pays.reduce(function(n,t){ return n + (t.amount||0); }, 0);
      const open = !!_mOpen[m.id];
      const accent = bal > 0 ? 'var(--bad)' : 'var(--good)';

      const log = open ? ('<div style="margin-top:11px; border-top:1px solid var(--line); padding-top:11px;">'
        + (txns.length ? txns.map(function(t){
            const isOrd = t.type === 'order';
            return '<div class="row" style="padding:7px 9px; border-radius:9px; margin-bottom:5px;'
              + 'background:' + (isOrd ? '#fef2f2' : '#ecfdf5') + ';">'
              + '<span style="font-size:12.5px; font-weight:700;">'
              + (isOrd ? '🧾 أوردر' : '💵 دفعة')
              + (t.note ? ('<span class="muted" style="font-weight:400;"> · ' + esc(t.note) + '</span>') : '')
              + '<div class="muted" style="font-size:10.5px; font-weight:400;">' + dstr(t.ts) + '</div></span>'
              + '<span style="display:flex; align-items:center; gap:7px;">'
              + '<b style="color:' + (isOrd ? 'var(--bad)' : 'var(--good)') + '; font-size:13.5px;">'
              + (isOrd ? '+' : '−') + egp(t.amount) + '</b>'
              + '<button class="ghost" style="padding:3px 8px; font-size:11px;"'
              + ' onclick="deleteMtxn(\'' + t.id + '\')">🗑️</button>'
              + '</span></div>';
          }).join('') : '<div class="muted" style="font-size:12.5px;">مفيش حركات لسه</div>')
        + '</div>') : '';

      return '<div class="card" style="border-right:4px solid ' + accent + '; margin-bottom:10px;">'
        + '<div class="row">'
        + '<div style="min-width:0;"><b style="font-size:15px;">' + esc(m.name) + '</b>'
        + '<div class="muted" style="font-size:11px; margin-top:2px;">'
        + orders.length + ' أوردر · ' + pays.length + ' دفعة</div></div>'
        + '<div style="text-align:left;">'
        + '<div class="amount ' + (bal > 0 ? 'neg' : 'pos') + '" style="font-size:18px;">'
        + egp(Math.abs(bal)) + '</div>'
        + '<div class="muted" style="font-size:10.5px;">' + (bal > 0 ? 'عليك' : (bal < 0 ? 'ليك' : 'متساوي')) + '</div>'
        + '</div></div>'
        + '<div class="muted" style="font-size:11.5px; margin-top:6px;">'
        + 'إجمالي الأوردرات ' + egp(sumO) + ' · المدفوع ' + egp(sumP) + '</div>'
        + '<div style="display:flex; gap:7px; margin-top:11px; flex-wrap:wrap;">'
        + '<button style="flex:2; min-width:110px;" onclick="officeMtxn(\'' + m.id + '\',\'order\')">🧾 أوردر</button>'
        + '<button style="flex:2; min-width:110px; background:linear-gradient(135deg,#10B981,#047857);"'
        + ' onclick="officeMtxn(\'' + m.id + '\',\'payment\')">💵 دفعة</button>'
        + '<button class="ghost" style="flex:1; min-width:88px;" onclick="toggleMerchLog(\'' + m.id + '\')">'
        + (open ? '▲ اقفل' : '📜 السجل (' + txns.length + ')') + '</button>'
        + '<button class="ghost danger" style="padding:11px 13px;" title="مسح التاجر"'
        + ' onclick="deleteMerchant(\'' + m.id + '\', \'' + esc(m.name).replace(/'/g, "") + '\')">🗑️</button>'
        + '</div>' + log + '</div>';
    }).join('');
}

// 🗑️ مسح تاجر — بيتأكد ويقول كام حركة هتتمسح معاه
window.deleteMerchant = async function(id, name){
  const txns = D.mtxns.filter(function(t){ return t.merchantId === id; });
  const bal = merchantBalance(txns);
  let msg = 'هتمسح التاجر «' + name + '» نهائيًا';
  if(txns.length) msg += '\nومعاه ' + txns.length + ' حركة مسجّلة';
  if(bal > 0) msg += '\n⚠️ لسه عليك ' + egp(bal) + ' للتاجر ده!';
  msg += '\n\nالإجراء مفيهوش رجوع. متأكد؟';
  if(!confirm(msg)) return;
  try{
    for(let i = 0; i < txns.length; i += 400){
      const batch = db.batch();
      txns.slice(i, i+400).forEach(function(t){
        batch.delete(db.collection('office_merchant_txns').doc(t.id));
      });
      await batch.commit();
    }
    await db.collection('office_merchants').doc(id).delete();
  }catch(e){ alert('تعذر المسح: ' + e.message); }
};

// 🗑️ مسح حركة واحدة (لو اتسجلت بالغلط)
window.deleteMtxn = async function(id){
  if(!confirm('تمسح الحركة دي؟')) return;
  try{ await db.collection('office_merchant_txns').doc(id).delete(); }
  catch(e){ alert('تعذر المسح: ' + e.message); }
};
// 💬 نافذة إدخال — بديل prompt اللي بيفشل في التطبيق المثبّت
function officeAsk(opts){
  const o = opts || {};
  return new Promise(function(resolve){
    const old = document.getElementById('ofAskOv'); if(old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'ofAskOv';
    ov.style.cssText = 'position:fixed; inset:0; z-index:9000; background:rgba(0,0,0,.6);'
      + 'display:flex; align-items:center; justify-content:center; padding:18px;';
    ov.innerHTML = '<div class="card" style="max-width:400px; width:100%;">'
      + '<div style="font-weight:900; font-size:16px; margin-bottom:4px;">' + (o.title||'') + '</div>'
      + (o.note ? '<div class="muted" style="font-size:12.5px; margin-bottom:12px;">' + o.note + '</div>' : '')
      + '<input id="ofAskA" type="number" inputmode="decimal" placeholder="' + (o.ph||'المبلغ') + '"'
      + ' style="font-size:20px; text-align:center; font-weight:900; margin-bottom:9px;">'
      + '<input id="ofAskB" type="text" placeholder="ملاحظة (اختياري)">'
      + '<div id="ofAskErr" style="color:var(--bad); font-size:12px; min-height:16px; margin-top:5px;"></div>'
      + '<div style="display:flex; gap:8px; margin-top:6px;">'
      + '<button id="ofAskOk" style="flex:2;">تمام</button>'
      + '<button id="ofAskNo" class="ghost" style="flex:1;">إلغاء</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    const a = ov.querySelector('#ofAskA'), b = ov.querySelector('#ofAskB'), er = ov.querySelector('#ofAskErr');
    if(o.value !== undefined && o.value !== null) a.value = String(o.value);
    const done = function(v){ ov.remove(); resolve(v); };
    const ok = function(){
      const n = parseFloat(a.value);
      if(isNaN(n) || n <= 0){ er.textContent = 'اكتب مبلغ صحيح'; a.focus(); return; }
      done({ amount:n, note:(b.value||'').trim() });
    };
    ov.querySelector('#ofAskOk').addEventListener('click', ok);
    ov.querySelector('#ofAskNo').addEventListener('click', function(){ done(null); });
    [a,b].forEach(function(el){ el.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); ok(); }
      if(e.key === 'Escape'){ done(null); }
    }); });
    setTimeout(function(){ try{ a.focus(); }catch(e){} }, 60);
  });
}
window.officeAsk = officeAsk;

window.officeMtxn = async function(mid, type){
  const m = D.merchants.find(function(x){ return x.id === mid; }) || {};
  const res = await officeAsk({
    title: (type === 'order' ? '🧾 أوردر جديد' : '💵 دفعة') + ' — ' + (m.name || ''),
    note: type === 'order' ? 'بيزوّد اللي عليك للتاجر' : 'بتخصم من اللي عليك',
    ph: 'المبلغ بالجنيه'
  });
  if(!res) return;
  const amount = res.amount, note = res.note;
  // 💵 تأكيد أخير على المبلغ — الحركة دي بتغيّر رصيد التاجر، والرقم ممكن
  //    يتكتب غلط على شاشة موبايل (صفر زيادة أو ناقص).
  if(!confirm((type === 'order' ? '🧾 أوردر' : '💵 دفعة') + ' لـ' + (m.name || '')
    + '\n\nالمبلغ: ' + egp(amount)
    + '\n' + (type === 'order' ? 'هيزوّد اللي عليك للتاجر' : 'هيخصم من اللي عليك')
    + '\n\nمتأكد؟')) return;
  db.collection('office_merchant_txns').add({ merchantId:mid, type:type, amount:amount, note:note, ts:Date.now(),
      cashTracked: type !== 'order', cashTrackedFrom:'office_v65' })
    .catch(function(e){ alert('تعذر التسجيل: '+e.message); });
};


// 📦 تسجيل بضاعة سريع — نفس office_merchant_txns، من غير تسجيل مزدوج كمصروف.
function ofRenderQuickGoodsMerchants(){
  const sel=$('#qgMerchant'); if(!sel) return;
  let last=''; try{last=localStorage.getItem('ofLastMerchant')||'';}catch(e){}
  const cur=sel.value||last;
  sel.innerHTML='<option value="">اختار التاجر</option>'+(D.merchants||[])
    .slice().sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''),'ar');})
    .map(function(m){return '<option value="'+esc(m.id)+'">'+esc(m.name||'تاجر')+'</option>';}).join('');
  if(cur && (D.merchants||[]).some(function(m){return m.id===cur;})) sel.value=cur;
}
window.ofUndoQuickGoods=async function(id){
  if(!id) return;
  try{
    await db.collection('office_merchant_txns').doc(id).delete();
    const st=$('#qgStatus'); if(st) st.innerHTML='↩️ اتلغى التسجيل.';
  }catch(e){alert('تعذر التراجع: '+e.message);}
};
function ofWireQuickGoods(){
  const btn=$('#qgAdd'); if(!btn || btn.dataset.ready==='1') return;
  btn.dataset.ready='1'; ofRenderQuickGoodsMerchants();
  btn.addEventListener('click',async function(){
    const mid=$('#qgMerchant').value;
    const amount=Math.round((Number($('#qgAmount').value)||0)*100)/100;
    const note=($('#qgNote').value||'').trim();
    if(!mid){alert('اختار التاجر');return;}
    if(!(amount>0)){alert('اكتب مبلغ صحيح');return;}
    const m=(D.merchants||[]).filter(function(x){return x.id===mid;})[0]||{};
    btn.disabled=true; btn.textContent='بيتسجل…';
    try{
      const ref=db.collection('office_merchant_txns').doc();
      await ref.set({merchantId:mid,type:'order',amount:amount,note:note,ts:Date.now(),
        source:'office_quick_goods'});
      try{localStorage.setItem('ofLastMerchant',mid);}catch(e){}
      $('#qgAmount').value=''; $('#qgNote').value='';
      const st=$('#qgStatus');
      if(st) st.innerHTML='✅ اتسجل '+egp(amount)+' على '+esc(m.name||'التاجر')
        +" كتكلفة بضاعة. <button class='ghost' style='padding:3px 8px;' onclick=\"ofUndoQuickGoods('"+ref.id+"')\">تراجع</button>";
    }catch(e){alert('تعذر التسجيل: '+e.message);}
    btn.disabled=false; btn.textContent='+ بضاعة';
  });
}


/* ============================================================
   🎙️ تسجيل التاجر بالصوت v69
   ------------------------------------------------------------
   أوامر مقفولة للدقة:
   - "بضاعة <اسم التاجر> المبلغ <أرقام رقم رقم>"
   - "دفعت <اسم التاجر> المبلغ <أرقام رقم رقم>"
   - أو في أمر واحد: "بضاعة <الاسم> المبلغ X دفعت Y"
   مفيش Firestore write قبل تأكيد صوتي/زر صريح.
   ============================================================ */
let _ofVoiceRec=null, _ofVoiceConfirmRec=null, _ofVoiceDraft=null, _ofVoiceBusy=false, _ofVoiceConfirmListening=false, _ofVoiceAiAbort=null, _ofVoiceSession=0, _ofVoiceState='idle';

function ofArNorm(v){
  return String(v||'')
    .replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي')
    .replace(/[ؤ]/g,'و').replace(/[ئ]/g,'ي')
    .replace(/[\u064B-\u065F\u0670]/g,'').replace(/\u0640/g,'')
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g,' ')
    .replace(/\s+/g,' ').trim().toLowerCase();
}
const OF_AR_DIGIT_WORDS={
  'صفر':'0','زيرو':'0',
  'واحد':'1','واحده':'1','احد':'1',
  'اتنين':'2','اثنين':'2','اثنان':'2','تنين':'2',
  'تلاته':'3','ثلاثه':'3','ثلاث':'3','تلات':'3',
  'اربعه':'4','اربعة':'4','اربع':'4',
  'خمسه':'5','خمسة':'5','خمس':'5',
  'سته':'6','ستة':'6','ست':'6',
  'سبعه':'7','سبعة':'7','سبع':'7',
  'تمانيه':'8','ثمانيه':'8','ثمانية':'8','تمنيه':'8',
  'تسعه':'9','تسعة':'9','تسع':'9'
};
function ofArabicDigitsOnly(text){
  const raw=String(text||'').replace(/[٠-٩]/g,function(c){return String('٠١٢٣٤٥٦٧٨٩'.indexOf(c));});
  const toks=ofArNorm(raw).split(' ').filter(Boolean);
  let digits='';
  for(const t of toks){
    if(/^\d+$/.test(t)){ digits += t; continue; }
    if(Object.prototype.hasOwnProperty.call(OF_AR_DIGIT_WORDS,t)){ digits += OF_AR_DIGIT_WORDS[t]; continue; }
    return null;
  }
  if(!digits || digits.length>9) return null;
  const n=Number(digits); return Number.isSafeInteger(n)&&n>0?n:null;
}
/* v69: كلام طبيعي محلي أولًا + Firebase AI fallback عند عدم اليقين فقط. */
const OF_NUM_SMALL={
  'واحد':1,'واحده':1,'احد':1,'اتنين':2,'اثنين':2,'تنين':2,'تلاته':3,'ثلاثه':3,'تلات':3,'ثلاث':3,
  'اربعه':4,'اربع':4,'خمسه':5,'خمس':5,'سته':6,'ست':6,'سبعه':7,'سبع':7,'تمانيه':8,'ثمانيه':8,'تمنيه':8,
  'تسعه':9,'تسع':9,'عشره':10,'عشر':10,'حداشر':11,'احداشر':11,'اتناشر':12,'اثناشر':12,'تلتاشر':13,'تلاتاشر':13,
  'اربعتاشر':14,'خمستاشر':15,'ستاشر':16,'سبعتاشر':17,'تمنتاشر':18,'تسعتاشر':19,
  'عشرين':20,'تلاتين':30,'ثلاثين':30,'اربعين':40,'خمسين':50,'ستين':60,'سبعين':70,'تمانين':80,'ثمانين':80,'تسعين':90,
  'ميه':100,'مائه':100,'مايه':100
};
function ofNaturalMoney(text){
  let raw=String(text||'').replace(/[٠-٩]/g,function(c){return String('٠١٢٣٤٥٦٧٨٩'.indexOf(c));});
  raw=ofArNorm(raw).replace(/\bجنيهات?\b/g,' ').replace(/\bجنيه\b/g,' ').replace(/\bوالف\b/g,' و الف ').replace(/\s+/g,' ').trim();
  if(!raw)return null;
  if(/^\d+(?:\.\d{1,2})?$/.test(raw)){const n=Number(raw);return n>0&&n<=999999999?n:null;}
  const strict=ofArabicDigitsOnly(raw); if(strict)return strict;
  let toks=[]; raw.split(' ').forEach(function(x){
    if(!x)return; if(x==='و')return;
    if(x.length>1&&x[0]==='و'&&(OF_NUM_SMALL[x.slice(1)]!=null||['الف','الاف','مليون','ملايين'].includes(x.slice(1)))){toks.push(x.slice(1));}else toks.push(x);
  });
  let total=0, group=0, seen=false;
  for(let i=0;i<toks.length;i++){
    const t=toks[i];
    if(/^\d+$/.test(t)){group+=Number(t);seen=true;continue;}
    if(t==='الف'||t==='الاف'||t==='ألف'){
      if(group===0)group=1; total+=group*1000;group=0;seen=true;continue;
    }
    if(t==='مليون'||t==='ملايين'){
      if(group===0)group=1; total+=group*1000000;group=0;seen=true;continue;
    }
    const v=OF_NUM_SMALL[t]; if(v==null)return null;
    seen=true;
    if(v===100){group=(group||1)*100;}else group+=v;
  }
  const n=total+group; return seen&&n>0&&n<=999999999?n:null;
}
function ofVoiceFindMoney(segment){
  segment=String(segment||'').trim(); if(!segment)return null;
  return ofNaturalMoney(segment);
}
function ofVoiceMerchantFromText(text){
  const n=' '+ofArNorm(text)+' ';
  let best=null;
  (D.merchants||[]).forEach(function(m){
    const mn=ofArNorm(m.name||''); if(!mn)return;
    const pos=n.indexOf(' '+mn+' ');
    if(pos>=0 && (!best||mn.length>best.norm.length))best={merchant:m,norm:mn,exact:true};
  });
  return best;
}
function ofVoiceLocalNatural(text){
  const n=ofArNorm(text); if(!n)return {ok:false,reason:'empty',confidence:0};
  // v376: "بدون اسم تاجر" اختيار صريح وصحيح، مش اسم تاجر ناقص.
  // بنستخدم حساب نظام ثابت عشان الحركة تفضل ظاهرة في حسابات/تقارير التجار من غير اختراع اسم.
  const unnamedMerchant=/(?:بدون|من غير)\s+(?:اسم\s+)?تاجر|تاجر\s+(?:مجهول|غير معروف)|مورد\s+(?:مجهول|غير معروف)/.test(n);
  const exact=unnamedMerchant?null:ofVoiceMerchantFromText(n);
  let merchantSpoken='';
  if(unnamedMerchant)merchantSpoken='بدون اسم تاجر';
  else if(exact)merchantSpoken=exact.merchant.name;
  else {
    // اسم التاجر غالبًا بين فعل الحركة وأول مؤشر مبلغ/دفع.
    let q=n.replace(/^(اشتريت|جبت|خدت|اخدت|استلمت|بضاعه|فاتوره|سجل|سجلت|دفعت|حولت|دفعتله|دفعت ل|دفعت لـ)\s*/,'' );
    q=q.replace(/^(من|ل|لـ)\s+/, '').replace(/^ل(?=[\u0600-\u06FF])/, '');
    const qParts=q.split(/\s+(?:ب|بمبلغ|بـ|المبلغ|قيمتها|قيمه|ودفعت|و دفعت|دفعتله|دفعت)\s+/);
    merchantSpoken=qParts[0].trim();
    // «دفعت لأحمد ٥ آلاف» مفيهاش كلمة "بـ"؛ نفصل آخر جزء رقمي كقيمة الدفعة.
    if(qParts.length===1 && /^(دفعت|حولت|دفعه)/.test(n)){
      const toks=q.split(' ').filter(Boolean);
      for(let i=1;i<toks.length;i++){
        if(ofVoiceFindMoney(toks.slice(i).join(' '))){merchantSpoken=toks.slice(0,i).join(' ');break;}
      }
    }
  }
  let mm=unnamedMerchant
    ? {ok:true,merchant:{id:'__unnamed__',name:'بدون اسم تاجر'},score:1,exact:true}
    : (exact?{ok:true,merchant:exact.merchant,score:1,exact:true}:ofMerchantMatch(merchantSpoken));
  let needsMerchantCreate=false;
  if(!mm.ok){
    // First-use UX: لو الاسم واضح ومفيش تاجر مطابق، نعمل Draft "تاجر جديد"
    // فقط للمراجعة. لا يوجد Firestore write هنا.
    const clean=String(merchantSpoken||'').trim();
    const candidates=mm.candidates||[];
    const tooClose=candidates[0] && Number(candidates[0].score||0)>=0.72;
    const explicitName=/^(?:اشتريت|جبت|خدت|اخدت|استلمت|بضاعه|فاتوره|دفعت|حولت)/.test(n);
    if(clean.length>=2 && clean.length<=60 && explicitName && !tooClose){
      mm={ok:true,merchant:{id:'',name:clean},score:0.96,exact:true};
      needsMerchantCreate=true;
    }else return {ok:false,reason:'merchant_'+mm.reason,merchantSpoken:merchantSpoken,candidates:candidates,confidence:0.35};
  }

  const isGoods=/(بضاعه|فاتوره|اشتريت|جبت|خدت|اخدت|استلمت)/.test(n);
  const isPay=/(دفعت|دفعه|حولت)/.test(n);
  if(!isGoods&&!isPay)return {ok:false,reason:'intent',confidence:0.35};

  let beforePay=n, payText='';
  const pm=n.search(/(?:^|\s)(?:و\s*)?(?:دفعتله|دفعت|دفعه|حولت)(?:\s|$)/);
  if(isGoods&&pm>=0){beforePay=n.slice(0,pm);payText=n.slice(pm).replace(/^(?:\s*و?\s*)(?:دفعتله|دفعت|دفعه|حولت)\s*/, '');}
  function moneyTail(x){
    x=String(x||'');
    if(unnamedMerchant)x=x.replace(/(?:بدون|من غير)\s+(?:اسم\s+)?تاجر|تاجر\s+(?:مجهول|غير معروف)|مورد\s+(?:مجهول|غير معروف)/g,' ');
    else x=x.replace(new RegExp(ofArNorm(mm.merchant.name),'g'),' ');
    x=x.replace(/^(اشتريت|جبت|خدت|اخدت|استلمت|بضاعه|فاتوره|سجل|سجلت|دفعت|دفعه|حولت)\s*/, '')
      .replace(/^(?:فاتوره|بضاعه)\s*/, '')
      .replace(/^(من|ل|لـ)\s+/, '').replace(/^(بمبلغ|المبلغ|قيمتها|قيمه|ب|بـ)\s*/, '').trim();
    const z=x.match(/(?:بمبلغ|المبلغ|قيمتها|قيمه|ب)\s+(.+)$/); if(z)x=z[1].trim();
    return ofVoiceFindMoney(x);
  }
  let amount=null,payment=0,kind=isGoods?'order':'payment';
  if(isGoods){amount=moneyTail(beforePay);if(payText)payment=moneyTail(payText)||0;}
  else {amount=moneyTail(n);}
  if(!amount)return {ok:false,reason:'amount',merchant:mm.merchant,merchantSpoken:merchantSpoken,confidence:0.55};
  if(payText&&!payment)return {ok:false,reason:'payment_amount',merchant:mm.merchant,merchantSpoken:merchantSpoken,confidence:0.55};
  return {ok:true,kind:kind,merchant:mm.merchant,merchantSpoken:merchantSpoken,amount:amount,payment:payment,
    transcript:String(text||''),exactMerchant:mm.score===1||needsMerchantCreate,needsMerchantCreate:needsMerchantCreate,
    isUnnamedMerchant:unnamedMerchant,
    confidence:needsMerchantCreate?0.96:(mm.score===1?0.98:0.82),parser:unnamedMerchant?'local_unnamed_merchant_v376':(needsMerchantCreate?'local_new_merchant_v73':'local_v73')};
}
// compatibility audit marker: parser:'firebase_ai_v73'
async function ofVoiceAiFallback(text){
  const user=ofAuth&&ofAuth.currentUser;
  if(!user||user.isAnonymous)return {ok:false,reason:'ai_auth_required'};
  let endpoint='';
  try{
    const projectId=(ofApp&&ofApp.options&&ofApp.options.projectId)||'';
    endpoint=String(window.OFFICE_VOICE_AI_ENDPOINT||localStorage.getItem('officeVoiceAiEndpoint')||
      (projectId?('https://us-central1-'+projectId+'.cloudfunctions.net/officeVoiceParse'):'')).trim();
  }catch(e){}
  if(!endpoint)return {ok:false,reason:'ai_not_configured'};
  const merchants=(D.merchants||[]).slice(0,120).map(function(m){return {id:String(m.id||''),name:String(m.name||'').slice(0,80)};});
  const ctrl=new AbortController(); _ofVoiceAiAbort=ctrl;
  const timer=setTimeout(function(){ctrl.abort();},7000);
  try{
    const token=await user.getIdToken(false);
    const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},signal:ctrl.signal,
      body:JSON.stringify({task:'office_merchant_voice_extract_v3',text:String(text||'').slice(0,400),merchants:merchants,allowNewMerchant:true})});
    const x=await res.json().catch(function(){return {};});
    if(!res.ok)throw new Error(String(x&&x.error||('HTTP '+res.status)));
    if(!x||!['order','payment'].includes(x.kind))return {ok:false,reason:'ai_invalid'};
    const amount=Number(x.amount),payment=Number(x.payment||0),conf=Number(x.confidence||0);
    if(!(amount>0)||amount>999999999||conf<0.90||payment<0||payment>999999999)return {ok:false,reason:'ai_low_confidence'};
    if(x.kind==='payment'&&payment>0)return {ok:false,reason:'ai_invalid_payment'};
    const isUnnamedMerchant=x.isUnnamedMerchant===true;
    let m=isUnnamedMerchant
      ? {id:'__unnamed__',name:'بدون اسم تاجر'}
      : (D.merchants||[]).find(function(z){return String(z.id)===String(x.merchantId||'');});
    let needsMerchantCreate=false;
    if(!m){
      const newName=String(x.merchantName||'').trim();
      if(!x.isNewMerchant||conf<0.95||newName.length<2||newName.length>60)return {ok:false,reason:'ai_merchant'};
      const existing=(D.merchants||[]).find(function(z){return ofArNorm(z.name||'')===ofArNorm(newName);});
      if(existing)m=existing; else {m={id:'',name:newName};needsMerchantCreate=true;}
    }
    return {ok:true,kind:x.kind,merchant:m,merchantSpoken:m.name,amount:amount,payment:payment,transcript:String(text||''),
      exactMerchant:!needsMerchantCreate,needsMerchantCreate:needsMerchantCreate,isUnnamedMerchant:isUnnamedMerchant,confidence:conf,parser:isUnnamedMerchant?'firebase_ai_unnamed_v376':'firebase_ai_v73'};
  }catch(e){
    console.warn('voice ai fallback',e&&e.message);
    return {ok:false,reason:e&&e.name==='AbortError'?'cancelled':'ai_failed'};
  }finally{clearTimeout(timer);if(_ofVoiceAiAbort===ctrl)_ofVoiceAiAbort=null;}
}
async function ofVoiceParseSmart(text){
  const local=ofVoiceLocalNatural(text);
  if(local.ok&&local.confidence>=0.90)return local;
  const ai=await ofVoiceAiFallback(text);
  if(ai.ok)return ai;
  // لو local مفهوم لكن أقل من 90%، ما نخمنش اسم تاجر في حركة مالية.
  return local.ok?Object.assign({},local,{ok:false,reason:'low_confidence'}):local;
}
/* v72 — طبقة أمان/سهولة فوق الـparser:
   - تمنع duplicate tap / إعادة نفس الجملة مرتين.
   - تضيف سياق الحساب للـdraft من غير أي Firestore write.
   - كل كتابة مالية تظل بعد شاشة مراجعة صريحة. */
let _ofVoiceLastCommitKey='', _ofVoiceLastCommitAt=0;
function ofVoiceDraftKey(d){
  return [d&&d.kind,(d&&d.merchant&&(d.merchant.id||ofArNorm(d.merchant.name||'')))||'',Number(d&&d.amount)||0,Number(d&&d.payment)||0].join('|');
}
function ofVoiceDuplicateGuard(d,now){
  now=Number(now)||Date.now(); const k=ofVoiceDraftKey(d);
  return !!(k&&k===_ofVoiceLastCommitKey&&(now-_ofVoiceLastCommitAt)<12000);
}
function ofVoiceRememberCommit(d,now){_ofVoiceLastCommitKey=ofVoiceDraftKey(d);_ofVoiceLastCommitAt=Number(now)||Date.now();}
window.ofVoiceDuplicateGuard=ofVoiceDuplicateGuard;
function ofMerchantBalanceById(id){
  return merchantBalance((D.mtxns||[]).filter(function(x){return x&&x.merchantId===id;}));
}
function ofLevenshtein(a,b){
  a=ofArNorm(a); b=ofArNorm(b);
  const m=a.length,n=b.length,dp=Array.from({length:m+1},function(){return Array(n+1).fill(0);});
  for(let i=0;i<=m;i++)dp[i][0]=i; for(let j=0;j<=n;j++)dp[0][j]=j;
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  return dp[m][n];
}
function ofMerchantMatch(spoken){
  const q=ofArNorm(spoken);
  if(!q) return {ok:false,reason:'missing'};
  const list=(D.merchants||[]).map(function(m){
    const n=ofArNorm(m.name||'');
    const exact=n===q;
    const contains=n.includes(q)||q.includes(n);
    const dist=ofLevenshtein(n,q), den=Math.max(n.length,q.length,1);
    const score=exact?1:(contains?0.94:Math.max(0,1-dist/den));
    return {merchant:m,score:score};
  }).sort(function(a,b){return b.score-a.score;});
  if(!list.length) return {ok:false,reason:'none'};
  if(list[0].score<0.78) return {ok:false,reason:'none',candidates:list.slice(0,3)};
  // High precision: fuzzy acceptance requires clear separation from runner-up.
  if(!list[0].merchant || (list[1] && list[0].score<0.999 && (list[0].score-list[1].score)<0.12))
    return {ok:false,reason:'ambiguous',candidates:list.slice(0,3)};
  return {ok:true,merchant:list[0].merchant,score:list[0].score,exact:list[0].score===1};
}
function ofVoiceExtract(text){
  const n=ofArNorm(text);
  let kind='', after='';
  if(n.indexOf('بضاعه ')===0){kind='order';after=n.slice('بضاعه '.length);}
  else if(n.indexOf('فاتوره ')===0){kind='order';after=n.slice('فاتوره '.length);}
  else if(n.indexOf('دفعت ')===0){kind='payment';after=n.slice('دفعت '.length);}
  else if(n.indexOf('دفعه ')===0){kind='payment';after=n.slice('دفعه '.length);}
  else return {ok:false,reason:'start'};

  const mi=after.indexOf(' المبلغ ');
  if(mi<1) return {ok:false,reason:'amount_word'};
  const merchantSpoken=after.slice(0,mi).trim();
  let moneyPart=after.slice(mi+' المبلغ '.length).trim();

  // Optional combined command: order + payment in one confirmation.
  let payPart='', cut=-1;
  [' دفعت ',' دفعه '].some(function(k){
    const i=moneyPart.indexOf(k);
    if(i>0){cut=i;payPart=moneyPart.slice(i+k.length).trim();return true;} return false;
  });
  if(cut>0) moneyPart=moneyPart.slice(0,cut).trim();

  const amount=ofArabicDigitsOnly(moneyPart);
  if(!amount) return {ok:false,reason:'amount'};
  const pay=payPart?ofArabicDigitsOnly(payPart):0;
  if(payPart && !pay) return {ok:false,reason:'payment_amount'};
  if(kind==='payment' && pay) return {ok:false,reason:'double_payment'};

  const mm=ofMerchantMatch(merchantSpoken);
  if(!mm.ok) return {ok:false,reason:'merchant_'+mm.reason,merchantSpoken:merchantSpoken,candidates:mm.candidates||[]};
  return {ok:true,kind:kind,merchant:mm.merchant,merchantSpoken:merchantSpoken,amount:amount,payment:pay||0,
    transcript:String(text||'')};
}
function ofVoiceDraftMath(d){
  const before=ofMerchantBalanceById(d.merchant.id);
  let order=0,pay=0;
  if(d.kind==='order'){order=d.amount;pay=d.payment||0;} else pay=d.amount;
  const after=Math.round((before+order-pay)*100)/100;
  return {before:before,order:order,payment:pay,after:after};
}
function ofSpeak(text, after){
  try{
    if(!('speechSynthesis' in window)){ if(after)after(); return; }
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(String(text||''));
    u.lang='ar-EG'; u.rate=0.92;
    u.onend=function(){if(after)after();}; u.onerror=function(){if(after)after();};
    speechSynthesis.speak(u);
  }catch(e){if(after)after();}
}
function ofVoiceMoneySpeak(n){
  // TTS reads normal Arabic amount; visual confirmation always shows digits too.
  return Number(n||0).toLocaleString('ar-EG')+' جنيه';
}
function ofVoiceSetStatus(msg){const x=$('#qgVoiceStatus');if(x)x.textContent=msg||'';}
function ofVoiceSetPermission(label,state){
  const x=$('#qgMicPermission'); if(!x)return;
  x.textContent='صلاحية المايك: '+label;
  x.style.color=state==='granted'?'#047857':(state==='denied'?'#b42318':'#64748b');
}
function ofVoiceUi(state,msg,heard){
  _ofVoiceState=state||'idle';
  const b=$('#qgVoiceBtn'), cancel=$('#qgVoiceCancelBtn'), again=$('#qgVoiceAgainBtn');
  const title=$('#qgVoiceStateTitle'), dot=$('#qgMicDot'), live=$('#qgVoiceLiveText');
  const map={
    idle:['المايك جاهز','#94a3b8','🎙️ ابدأ تسجيل'],
    permission:['بنفتح المايك…','#f59e0b','… لحظة'],
    listening:['المايك شغال — اتكلم','#ef4444','🔴 بيسمعك'],
    processing:['بفهم الكلام…','#2563eb','🧠 بفهم…'],
    review:['فهمت الحركة — راجعها','#10b981','✅ راجع الحركة'],
    confirm:['مستني تأكيدك بالصوت','#ef4444','🎙️ قول تأكيد'],
    saving:['بيحفظ الحركة…','#2563eb','بيتحفظ…'],
    error:['محتاج نجرب تاني','#dc2626','🎙️ جرّب تاني'],
    done:['تم التسجيل','#10b981','🎙️ سجل حركة تانية']
  };
  const v=map[_ofVoiceState]||map.idle;
  if(title)title.textContent=v[0]; if(dot){dot.style.background=v[1];dot.style.boxShadow=_ofVoiceState==='listening'||_ofVoiceState==='confirm'?'0 0 0 5px rgba(239,68,68,.15)':'none';}
  if(b){b.textContent=v[2];b.disabled=['permission','listening','processing','review','confirm','saving'].includes(_ofVoiceState);}
  if(cancel)cancel.style.display=['permission','listening','processing','confirm'].includes(_ofVoiceState)?'inline-flex':'none';
  if(again)again.style.display=['error','done'].includes(_ofVoiceState)?'inline-flex':'none';
  if(msg!=null)ofVoiceSetStatus(msg);
  if(live){
    const txt=String(heard||'').trim();
    live.textContent=txt?('«'+txt+'»'):''; live.style.display=txt?'block':'none';
  }
}
async function ofVoiceRefreshPermission(){
  try{
    if(navigator.permissions&&navigator.permissions.query){
      const q=await navigator.permissions.query({name:'microphone'});
      ofVoiceSetPermission(q.state==='granted'?'مسموح':q.state==='denied'?'مرفوض':'هيسألك عند التشغيل',q.state);
      q.onchange=function(){ofVoiceSetPermission(q.state==='granted'?'مسموح':q.state==='denied'?'مرفوض':'هيسألك عند التشغيل',q.state);};
      return q.state;
    }
  }catch(e){}
  ofVoiceSetPermission('هيتأكد عند التشغيل','prompt'); return 'unknown';
}
async function ofVoiceEnsureMicPermission(){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)return true;
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  try{(stream.getTracks()||[]).forEach(function(t){t.stop();});}catch(e){}
  ofVoiceSetPermission('مسموح','granted'); return true;
}
function ofVoiceStopHardware(){
  try{if(_ofVoiceRec){_ofVoiceRec.abort();_ofVoiceRec=null;}}catch(e){}
  try{if(_ofVoiceConfirmRec){_ofVoiceConfirmRec.abort();_ofVoiceConfirmRec=null;}}catch(e){}
  try{if(_ofVoiceAiAbort){_ofVoiceAiAbort.abort();_ofVoiceAiAbort=null;}}catch(e){}
  try{speechSynthesis.cancel();}catch(e){}
  _ofVoiceConfirmListening=false;
}
function ofVoiceOverlay(show){
  const x=$('#ofVoiceOverlay'); if(!x)return;
  x.style.display=show?'flex':'none'; x.setAttribute('aria-hidden',show?'false':'true');
}
function ofVoiceRenderDraft(d){
  const m=ofVoiceDraftMath(d), name=d.merchant.name||'التاجر';
  _ofVoiceDraft=d;
  $('#ofVoiceHeard').textContent='سمعت: '+d.transcript;
  let body='';
  if(d.isUnnamedMerchant) body+='<div style="margin-bottom:7px;padding:7px 9px;border-radius:9px;background:#f8fafc;color:#475467;"><b>فاتورة بدون اسم تاجر</b> — هتتسجل كما قلت، من غير اختراع اسم.</div>';
  else if(d.needsMerchantCreate) body+='<div style="margin-bottom:7px;padding:7px 9px;border-radius:9px;background:#eff6ff;color:#1d4ed8;"><b>🆕 تاجر جديد:</b> '+esc(name)+' — هيتضاف فقط بعد التأكيد.</div>';
  else body+='<b>'+esc(name)+'</b><br>';
  if(m.order) body+='📦 مشتريات/فاتورة: <b>'+egp(m.order)+'</b><br>';
  if(m.payment) body+='💵 المدفوع للتاجر: <b>'+egp(m.payment)+'</b><br>';
  body+='الحساب قبل الحركة: <b>'+egp(m.before)+'</b><br>'
    +'الحساب بعد الحركة: <b style="color:'+(m.after>0?'#b42318':'#067647')+';">'+egp(m.after)+'</b>';
  $('#ofVoiceSummary').innerHTML=body;
  const warn=$('#ofVoiceWarn');
  let warning='';
  if(d.needsMerchantCreate) warning='راجع اسم التاجر كويس؛ التأكيد هيضيفه لحسابات التجار ويسجل الحركة مرة واحدة.';
  else if(!d.exactMerchant) warning='اسم التاجر اتطابق تقريبيًا. راجع الاسم قبل التأكيد.';
  if(d.confidence && d.confidence<0.96) warning+=(warning?' ':'')+'درجة الفهم مش كاملة؛ راجع الأرقام بصريًا.';
  if(m.payment>m.before+m.order) warning+=(warning?' ':'')+'⚠️ الدفعة أكبر من المستحق بعد الفاتورة بـ '+egp(Math.abs(m.after))+'. راجع إن ده مقصود.';
  else if(m.after<0) warning+=(warning?' ':'')+'⚠️ بعد التسجيل هيبقى للتاجر رصيد دائن '+egp(Math.abs(m.after))+'.';
  warn.textContent=warning; warn.style.display=warning?'block':'none';
  ofVoiceUi('review','✅ فهمت الحركة. راجع التاجر والمبالغ والحساب قبل التأكيد.',d.transcript);
  ofVoiceOverlay(true);
  const sentence=(d.needsMerchantCreate?'تاجر جديد '+name+'. ':'')
    +(m.order?'فاتورة بضاعة '+ofVoiceMoneySpeak(m.order)+'. ':'')
    +(m.payment?'دفعة '+ofVoiceMoneySpeak(m.payment)+'. ':'')
    +'الحساب بعد الحركة '+ofVoiceMoneySpeak(Math.abs(m.after))+'. راجع الشاشة، وبعدها قل تأكيد أو إلغاء.';
  ofSpeak(sentence,function(){ofVoiceListenConfirm();});
}
function ofVoiceRecognition(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR) return null;
  const r=new SR(); r.lang='ar-EG';r.interimResults=true;r.maxAlternatives=3;r.continuous=false;
  return r;
}
function ofVoiceListenConfirm(){
  if(_ofVoiceConfirmListening||!_ofVoiceDraft)return;
  const r=ofVoiceRecognition(); if(!r)return;
  _ofVoiceConfirmRec=r; _ofVoiceConfirmListening=true;
  ofVoiceUi('confirm','🎙️ المايك شغال. قل «تأكيد» للحفظ أو «إلغاء».',_ofVoiceDraft.transcript);
  r.onresult=function(e){
    let heard='';
    for(let ri=0;ri<e.results.length;ri++)for(let i=0;i<e.results[ri].length;i++){
      const t=ofArNorm(e.results[ri][i].transcript||'');
      if(/^(تاكيد|اكد|ايوه|نعم|تمام)$/.test(t)){heard='confirm';break;}
      if(/^(الغاء|الغي|لا|كنسل|كانسل)$/.test(t)){heard='cancel';break;}
      if(/^(تاني|اعاده|قولها تاني|اعد)$/.test(t)){heard='retry';break;}
    }
    if(heard==='confirm') ofVoiceCommit();
    else if(heard==='cancel') ofVoiceCancel();
    else if(heard==='retry') ofVoiceRetry();
  };
  r.onerror=function(){_ofVoiceConfirmListening=false;_ofVoiceConfirmRec=null;ofVoiceUi('review','راجع الحركة واضغط تأكيد، أو اضغط إلغاء.',_ofVoiceDraft&&_ofVoiceDraft.transcript);};
  r.onend=function(){_ofVoiceConfirmListening=false;_ofVoiceConfirmRec=null;};
  try{r.start();}catch(e){_ofVoiceConfirmListening=false;_ofVoiceConfirmRec=null;}
}
async function ofVoiceCommit(){
  if(_ofVoiceBusy||!_ofVoiceDraft)return;
  const d=_ofVoiceDraft;
  if(ofVoiceDuplicateGuard(d)){ofVoiceOverlay(false);ofVoiceUi('error','🛡️ نفس الحركة اتأكدت من ثواني — منعت تسجيلها مرتين.',d.transcript);return;}
  _ofVoiceBusy=true; ofVoiceStopHardware(); ofVoiceUi('saving','💾 بحفظ الحركة بأمان…',d.transcript);
  const m=ofVoiceDraftMath(d), commitTs=Date.now();
  const btn=$('#ofVoiceConfirmBtn'); if(btn){btn.disabled=true;btn.textContent='بيتحفظ…';}
  try{
    const batch=db.batch(), group=db.collection('office_merchant_txns').doc().id;
    let merchant=(D.merchants||[]).find(function(z){return d.merchant&&d.merchant.id&&z.id===d.merchant.id;});
    if(!merchant && d.merchant&&d.merchant.name) merchant=(D.merchants||[]).find(function(z){return ofArNorm(z.name||'')===ofArNorm(d.merchant.name||'');});
    let mid=merchant&&merchant.id || d.merchant.id || '';
    if(d.isUnnamedMerchant){
      mid='__unnamed__';
      batch.set(db.collection('office_merchants').doc(mid),{name:'بدون اسم تاجر',systemUnnamed:true,updatedAt:commitTs},{merge:true});
    }
    if(!mid){
      const mref=db.collection('office_merchants').doc(); mid=mref.id;
      batch.set(mref,{name:String(d.merchant.name||'').trim(),ts:commitTs,source:'office_ai_purchase_v73'});
    }
    if(m.order){
      const ref=db.collection('office_merchant_txns').doc(group+'_o');
      batch.set(ref,{merchantId:mid,type:'order',amount:m.order,note:'تسجيل ذكي',ts:commitTs,
        source:'office_ai_purchase_v73',voiceGroupId:group,transcript:String(d.transcript||'').slice(0,400),
        parser:d.parser||'unknown',aiConfidence:Number(d.confidence||0),balanceBefore:m.before,balanceAfter:m.after});
    }
    if(m.payment){
      const ref2=db.collection('office_merchant_txns').doc(group+'_p');
      batch.set(ref2,{merchantId:mid,type:'payment',amount:m.payment,note:'دفعة مع التسجيل الذكي',ts:commitTs+1,
        source:'office_ai_purchase_v73',voiceGroupId:group,transcript:String(d.transcript||'').slice(0,400),
        parser:d.parser||'unknown',aiConfidence:Number(d.confidence||0),balanceBefore:m.before,balanceAfter:m.after,
        cashTracked:true,cashTrackedFrom:'office_v73'});
    }
    await batch.commit();
    try{localStorage.setItem('ofLastMerchant',mid);}catch(e){}
    ofVoiceRememberCommit(d,commitTs);
    const msg='تم. '+(m.after>=0?'المتبقي للتاجر ':'الرصيد الدائن للتاجر ')+ofVoiceMoneySpeak(Math.abs(m.after))+'.';
    ofVoiceOverlay(false); _ofVoiceDraft=null; ofVoiceUi('done','✅ '+msg,d.transcript); ofSpeak(msg);
  }catch(e){
    ofVoiceUi('error','❌ تعذر الحفظ: '+(e&&e.message||e),d.transcript);
    ofSpeak('الحفظ فشل. لم أسجل الحركة.');
  }finally{
    _ofVoiceBusy=false; if(btn){btn.disabled=false;btn.textContent='✅ تأكيد';}
  }
}
window.ofVoiceCommit=ofVoiceCommit;
function ofVoiceCancel(){
  if(_ofVoiceBusy)return;
  _ofVoiceSession++; ofVoiceStopHardware(); _ofVoiceDraft=null; ofVoiceOverlay(false);
  ofVoiceUi('idle','تم الإلغاء. مفيش أي حاجة اتسجلت.','');
}
window.ofVoiceCancel=ofVoiceCancel;
window.ofVoiceRetry=function(){ofVoiceCancel();setTimeout(ofVoiceStart,120);};

function ofVoiceExplainError(r){
  if(!r) return 'ما فهمتش الكلام. جرّب تاني.';
  if(r.reason==='cancelled') return 'تم الإلغاء.';
  if(r.reason==='start'||r.reason==='intent') return 'قول العملية بطبيعتك: اشتريت من تاجر أو دفعت له.';
  if(r.reason==='amount_word'||r.reason==='amount'||r.reason==='payment_amount') return 'المبلغ مش واضح. مثال: اشتريت من أحمد بـ ٢٣ ألف ودفعت ١٠ آلاف.';
  if(String(r.reason||'').indexOf('merchant_ambiguous')===0){
    const names=(r.candidates||[]).map(function(x){return x.merchant&&x.merchant.name;}).filter(Boolean);
    return 'اسم التاجر قريب من أكتر من اسم: '+names.join('، ')+'. قول الاسم كامل.';
  }
  if(String(r.reason||'').indexOf('merchant_')===0) return 'اسم التاجر مش واضح. قوله تاني؛ لو جديد النظام هيعرض إضافته قبل الحفظ.';
  if(r.reason==='low_confidence'||r.reason==='ai_low_confidence') return 'مش واثق كفاية من الاسم أو الرقم، فمش هسجل حاجة. قوله تاني بوضوح.';
  if(r.reason==='ai_failed') return 'الـAI مش متاح دلوقتي. الكلام الواضح لسه يشتغل محليًا؛ جرّب صيغة أبسط.';
  return 'الكلام مش واضح كفاية. قوله بطبيعتك مع اسم التاجر والمبلغ.';
}
async function ofVoiceStart(){
  if(_ofVoiceBusy)return;
  ofVoiceStopHardware(); _ofVoiceDraft=null; ofVoiceOverlay(false);
  const session=++_ofVoiceSession;
  const test=ofVoiceRecognition();
  if(!test){ofVoiceUi('error','❌ المتصفح ده مش بيدعم التعرف على الكلام. افتح Office من Chrome على Android.');return;}
  ofVoiceUi('permission','🎤 بتأكد إن المايك مسموح…');
  try{await ofVoiceEnsureMicPermission();}
  catch(e){
    if(session!==_ofVoiceSession)return;
    const denied=e&&(e.name==='NotAllowedError'||e.name==='SecurityError');
    ofVoiceSetPermission(denied?'مرفوض':'مش متاح',denied?'denied':'unknown');
    ofVoiceUi('error',denied?'🚫 المايك مقفول للموقع. افتح صلاحيات الموقع في Chrome واسمح Microphone، وبعدها جرّب تاني.':'❌ مش قادر أوصل للمايك: '+String(e&&e.message||e));
    return;
  }
  if(session!==_ofVoiceSession)return;
  const r=ofVoiceRecognition(); if(!r)return;
  _ofVoiceRec=r; let handled=false,finalText='';
  r.onstart=function(){if(session===_ofVoiceSession)ofVoiceUi('listening','🔴 المايك شغال دلوقتي — اتكلم بطبيعتك.');};
  r.onresult=async function(e){
    if(session!==_ofVoiceSession)return;
    let shown='';
    for(let ri=0;ri<e.results.length;ri++){
      const rr=e.results[ri]; if(rr&&rr[0])shown+=(shown?' ':'')+(rr[0].transcript||'');
      if(rr&&rr.isFinal&&rr[0])finalText+=(finalText?' ':'')+(rr[0].transcript||'');
    }
    ofVoiceUi(handled?'processing':'listening',handled?'🧠 بفهم الكلام…':'🔴 سامعك… كمل.',shown||finalText);
    const last=e.results[e.results.length-1];
    if(!last||!last.isFinal||handled)return;
    handled=true; _ofVoiceRec=null;
    const alternatives=[]; for(let i=0;i<last.length;i++)if(last[i]&&last[i].transcript)alternatives.push(last[i].transcript);
    if(finalText&&!alternatives.includes(finalText))alternatives.unshift(finalText);
    ofVoiceUi('processing','🧠 بفهم التاجر والمبالغ وبحسب الحساب…',finalText||alternatives[0]||'');
    let best=null;
    for(let i=0;i<alternatives.length;i++){
      const parsed=await ofVoiceParseSmart(alternatives[i]);
      if(session!==_ofVoiceSession)return;
      if(parsed.ok){best=parsed;break;}
      if(!best||(parsed.confidence||0)>(best.confidence||0))best=parsed;
    }
    if(best&&best.ok)ofVoiceRenderDraft(best);
    else {const msg=ofVoiceExplainError(best);ofVoiceUi('error','⚠️ '+msg,finalText||alternatives[0]||'');ofSpeak(msg);}
  };
  r.onerror=function(e){
    if(session!==_ofVoiceSession||String(e&&e.error)==='aborted')return;
    _ofVoiceRec=null;
    const code=String(e&&e.error||'');
    let msg='التسجيل وقف. جرّب تاني.';
    if(code==='not-allowed'||code==='service-not-allowed'){ofVoiceSetPermission('مرفوض','denied');msg='المايك مرفوض للموقع. اسمح Microphone من إعدادات الموقع ثم جرّب.';}
    else if(code==='audio-capture')msg='مش لاقي مايك متاح على الجهاز.';
    else if(code==='no-speech')msg='مسمعتش كلام. دوس جرّب تاني واتكلم بعد ما تظهر العلامة الحمرا.';
    else if(code==='network')msg='التعرف الصوتي محتاج اتصال إنترنت دلوقتي. جرّب تاني.';
    ofVoiceUi('error','⚠️ '+msg);
  };
  r.onend=function(){
    if(session!==_ofVoiceSession)return; _ofVoiceRec=null;
    if(!handled&&_ofVoiceState==='listening')setTimeout(function(){if(session===_ofVoiceSession&&_ofVoiceState==='listening')ofVoiceUi('error','⚠️ التسجيل انتهى من غير ما أسمع جملة كاملة. جرّب تاني.');},120);
  };
  try{r.start();}catch(e){_ofVoiceRec=null;ofVoiceUi('error','⚠️ المايك مش متاح دلوقتي. اقفل أي تسجيل تاني وجرّب.');}
}
window.ofVoiceStart=ofVoiceStart;
window.ofVoiceV73={naturalMoney:ofNaturalMoney,localParse:ofVoiceLocalNatural,smartParse:ofVoiceParseSmart,duplicateGuard:ofVoiceDuplicateGuard};

function ofWireVoiceGoods(){
  const b=$('#qgVoiceBtn'); if(!b||b.dataset.ready==='1')return;
  b.dataset.ready='1'; b.addEventListener('click',ofVoiceStart);
  const cancel=$('#qgVoiceCancelBtn'); if(cancel)cancel.addEventListener('click',ofVoiceCancel);
  const again=$('#qgVoiceAgainBtn'); if(again)again.addEventListener('click',ofVoiceStart);
  const c=$('#ofVoiceConfirmBtn'); if(c)c.addEventListener('click',ofVoiceCommit);
  ofVoiceUi('idle','اضغط «ابدأ تسجيل» واتكلم. مش هيتحفظ أي مبلغ قبل المراجعة والتأكيد.');
  ofVoiceRefreshPermission();
}
// ما نعتمدش على وصول snapshot التجار عشان زر المايك يشتغل.
// ده مهم جدًا لأول استخدام لما قائمة التجار فاضية أو Firestore لسه بيحمّل.
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ofWireVoiceGoods,{once:true});
else setTimeout(ofWireVoiceGoods,0);

/* ============================================================
   💸 المصاريف
   ============================================================ */
$('#exAdd').addEventListener('click', function(){
  const amount = parseFloat($('#exAmount').value);
  const note = $('#exNote').value.trim();
  if(isNaN(amount) || amount <= 0){ alert('اكتب مبلغ صحيح'); return; }
  db.collection('office_expenses').add({ amount:amount, note:note, ts:Date.now(), month:monthKey() })
    .then(function(){ $('#exAmount').value=''; $('#exNote').value=''; })
    .catch(function(e){ alert('تعذر التسجيل: '+e.message); });
});
function renderExpenses(){
  const wrap = $('#expensesList'); if(!wrap) return;
  const mk = monthKey();
  $('#exMonthTotal').textContent = egp(expensesMonthTotal(D.expenses, mk));
  const month = D.expenses.filter(function(e){ return e.month === mk; })
    .sort(function(a,b){ return b.ts - a.ts; }).slice(0, 30);
  if(!month.length){ wrap.innerHTML = '<div class="empty">مفيش مصاريف الشهر ده</div>'; return; }
  wrap.innerHTML = month.map(function(e){
    return '<div class="card row"><span>'+esc(e.note||'مصروف')+' <span class="muted">· '+dstr(e.ts)+'</span></span>' +
      '<span class="amount neg">'+egp(e.amount)+'</span></div>';
  }).join('');
}

/* ============================================================
   📊 التقارير
   ============================================================ */
function fillBranchSel(){
  const sel = $('#topBranchSel'); if(!sel) return;
  const set = {};
  D.employees.forEach(function(e){ if(e.branch) set[e.branch]=1; });
  const brs = Object.keys(set).sort();
  const cur = sel.value;
  sel.innerHTML = brs.map(function(b){ return '<option value="'+esc(b)+'">'+esc(b)+'</option>'; }).join('');
  if(cur && set[cur]) sel.value = cur;
  sel.onchange = renderTop;
  renderTop();
  try{ renderGrowth(); }catch(e){}    // 📈 فرص الزيادة — نفس مصدر الفروع
}
function renderTop(){
  const wrap = $('#topSellers'); if(!wrap) return;
  const br = $('#topBranchSel').value;
  if(!br){ wrap.innerHTML = '<div class="empty">…</div>'; return; }
  const top = topSellers(D.sales, br, 10);
  if(!top.length){ wrap.innerHTML = '<div class="empty">مفيش مبيعات متسجلة للفرع ده آخر 30 يوم</div>'; return; }
  wrap.innerHTML = top.map(function(t, i){
    const inv = D.inventory.find(function(p){ return String(p.barcode||'') === t.barcode; });
    const stock = inv ? branchQtyOf(inv, br) : null;
    const low = stock != null && stock <= 3;
    return '<div class="card row">' +
      '<span><b style="color:var(--gold);">#'+(i+1)+'</b> '+esc(t.name)+
      '<div class="muted">'+t.pieces+' قطعة · '+egp(t.revenue)+
      (stock==null ? '' : ' · المخزون: <b style="color:'+(low?'var(--bad)':'var(--good)')+';">'+stock+'</b>'+(low?' ⚠️':''))+
      '</div></span></div>';
  }).join('');
}
// ============================================================
// 📈 فرص الزيادة — تحليل بيقول "المبيعات ممكن تزيد منين"
// ------------------------------------------------------------
// ⚡ صفر قراءات زيادة: بيشتغل على D.sales اللي متحمّلة أصلًا (٣٠ يوم).
//    ممنوع أي استعلام Firestore هنا — ده كان السبب الأساسي إن الشاشة
//    دي معقولة أصلًا مع تحقيق القراءات المفتوح.
//
// ⚠️ الأرقام لازم تطابق التقفيل: بنمشي على ofDayKeyOf (يوم المحل +
//    الساعة الفاصلة) مش اليوم التقويمي، وبنستبعد الملغي والمرتجع زي
//    ما بتعمل باقي التقارير.
//
// 🧠 فلسفة الشاشة: مش بتعرض أرقام وخلاص — بتقول "ده اللي شايفينه،
//    وده اللي ممكن يتعمل". الرقم من غير تصرّف مالوش لازمة للمالك.
// ============================================================

// فواتير فرع صالحة للتحليل (بدون ملغي/عكس)
function _gxSales(branch){
  return (D.sales || []).filter(function(s){
    return s && s.branch === branch && !s.reversed && !s.isReversal;
  });
}
// صافي الفاتورة بعد استبعاد بنود الاستبدال (redemption) والمرتجع
function _gxNet(s){
  var n = 0;
  (s.items || []).forEach(function(it){
    if(!it || it.isRedemption) return;
    var sign = it.isReturn ? -1 : 1;
    n += sign * (Number(it.qty) || 0) * (Number(it.price) || 0);
  });
  return n;
}
function _gxPieces(s){
  var q = 0;
  (s.items || []).forEach(function(it){
    if(!it || it.isRedemption) return;
    q += (it.isReturn ? -1 : 1) * (Number(it.qty) || 0);
  });
  return q;
}

/* 📊 التجميعة الأساسية — يوم بيوم، ساعة بساعة، وبايعة بايعة.
   بترجع كل اللي الشاشة محتاجاه من مرور واحد على الفواتير. */
function growthAggregate(branch){
  var sales = _gxSales(branch);
  var byDay = {}, byDow = {}, byHour = {}, bySeller = {};
  var totalRev = 0, totalInv = 0, totalPieces = 0;

  sales.forEach(function(s){
    var ms = _saleMs(s) || Number(s.createdAtMs) || 0;
    if(!ms) return;
    var net = _gxNet(s);
    if(net <= 0) return;                       // مرتجع صافي أو فاتورة فاضية
    var dk = ofDayKeyOf(ms);
    var p  = _ofShopParts(ms);
    // يوم الأسبوع بيوم المحل — فاتورة ٢ الفجر بتتحسب على يوم إمبارح
    var dp = String(dk).split('-').map(Number);
    var dow = new Date(Date.UTC(dp[0], dp[1]-1, dp[2])).getUTCDay();

    if(!byDay[dk]) byDay[dk] = { rev:0, inv:0, pieces:0 };
    byDay[dk].rev += net; byDay[dk].inv++; byDay[dk].pieces += _gxPieces(s);

    if(!byDow[dow]) byDow[dow] = { rev:0, inv:0, days:{} };
    byDow[dow].rev += net; byDow[dow].inv++; byDow[dow].days[dk] = 1;

    if(!byHour[p.hh]) byHour[p.hh] = { rev:0, inv:0 };
    byHour[p.hh].rev += net; byHour[p.hh].inv++;

    var sid = s.sellerEmployeeId || '';
    if(sid){
      if(!bySeller[sid]) bySeller[sid] = { name: s.sellerEmployeeName || '—', rev:0, inv:0, pieces:0 };
      bySeller[sid].rev += net; bySeller[sid].inv++; bySeller[sid].pieces += _gxPieces(s);
    }
    totalRev += net; totalInv++; totalPieces += _gxPieces(s);
  });

  var dayKeys = Object.keys(byDay).sort();
  return { branch:branch, byDay:byDay, byDow:byDow, byHour:byHour, bySeller:bySeller,
           dayKeys:dayKeys, totalRev:totalRev, totalInv:totalInv, totalPieces:totalPieces,
           avgTicket: totalInv ? totalRev/totalInv : 0,
           avgPerInv: totalInv ? totalPieces/totalInv : 0,
           daysCount: dayKeys.length };
}

/* 🎯 وزن كل يوم في الأسبوع — أساس التارجت اليومي.
   ⚠️ مش قسمة الشهري ÷ ٣٠. لو الخميس تاريخيًا ضعف التلات، لازم
      التارجت يتوزّع بنفس النسبة، وإلا التارجت اليومي هيبقى ظالم
      يوم وسهل يوم من غير سبب. */
function growthDowWeights(agg){
  var w = {}, sum = 0;
  for(var d=0; d<7; d++){
    var e = agg.byDow[d];
    var days = e ? Object.keys(e.days).length : 0;
    var avg = (e && days) ? e.rev/days : 0;      // متوسط اليوم ده لما بيشتغل
    w[d] = avg; sum += avg;
  }
  for(var k in w) w[k] = sum > 0 ? w[k]/sum : 1/7;
  return w;                                      // مجموعهم = ١
}

/* 🔍 الرافعتين: عدد الفواتير × متوسط الفاتورة.
   بنقارن آخر أسبوع بالمتوسط عشان نعرف أي رافعة هي اللي بتتحرك —
   ده اللي بيحدد التصرّف: مشكلة زيارات ولا مشكلة upselling. */
function growthLevers(agg){
  var keys = agg.dayKeys;
  if(keys.length < 8) return null;
  var last7 = keys.slice(-7), prev = keys.slice(0, -7);
  function roll(list){
    var r=0, i=0;
    list.forEach(function(k){ r += agg.byDay[k].rev; i += agg.byDay[k].inv; });
    return { rev:r, inv:i, days:list.length,
             perDay: list.length ? r/list.length : 0,
             invPerDay: list.length ? i/list.length : 0,
             ticket: i ? r/i : 0 };
  }
  var a = roll(last7), b = roll(prev);
  var dTicket = b.ticket ? (a.ticket-b.ticket)/b.ticket*100 : 0;
  var dInv    = b.invPerDay ? (a.invPerDay-b.invPerDay)/b.invPerDay*100 : 0;
  return { last7:a, before:b, dTicketPct:dTicket, dInvPct:dInv };
}

/* 🕐 الساعات الضعيفة — الساعات اللي المحل فاتح فيها والبيع فيها ضعيف.
   بنحسب متوسط الساعة في اليوم الواحد، ونرجّع أضعف ساعات الشغل. */
function growthWeakHours(agg){
  var rows = [];
  for(var h in agg.byHour){
    var e = agg.byHour[h];
    rows.push({ hour:+h, rev:e.rev, inv:e.inv,
                revPerDay: agg.daysCount ? e.rev/agg.daysCount : 0 });
  }
  // بنستبعد الساعات اللي مفيهاش شغل أصلًا (أقل من فاتورة كل ٣ أيام)
  rows = rows.filter(function(r){ return r.inv >= Math.max(2, agg.daysCount/3); });
  rows.sort(function(a,b){ return a.revPerDay - b.revPerDay; });
  return rows;
}

/* 👗 أصناف بتتباع مع بعض — أساس اقتراح "ضيفي معاها".
   بنعد كل زوج في نفس الفاتورة. ده أقوى أداة upselling عملية:
   بيقول للبايعة "اللي بيشتري ده بياخد معاه ده" من واقع بياناتك
   إنت، مش من كلام عام. */
function growthPairs(branch, limit){
  var sales = _gxSales(branch);
  var pair = {}, nameOf = {};
  sales.forEach(function(s){
    var bcs = [];
    (s.items || []).forEach(function(it){
      if(!it || it.isRedemption || it.isReturn) return;
      var bc = String(it.barcode || it.name || ''); if(!bc) return;
      if(bcs.indexOf(bc) < 0) bcs.push(bc);
      nameOf[bc] = it.name || bc;
    });
    if(bcs.length < 2) return;
    bcs.sort();
    for(var i=0;i<bcs.length;i++) for(var j=i+1;j<bcs.length;j++){
      var k = bcs[i] + '|' + bcs[j];
      pair[k] = (pair[k] || 0) + 1;
    }
  });
  return Object.keys(pair).map(function(k){
    var p = k.split('|');
    return { a:nameOf[p[0]]||p[0], b:nameOf[p[1]]||p[1], n:pair[k] };
  }).filter(function(x){ return x.n >= 3; })     // أقل من ٣ = صدفة مش نمط
   .sort(function(a,b){ return b.n - a.n; })
   .slice(0, limit || 6);
}

/* 🏆 البايعات — مرتّبين بمتوسط الفاتورة مش بالإجمالي.
   ⚠️ الإجمالي بيكافئ اللي اشتغلت شيفتات أكتر، مش اللي بتبيع أحسن.
      متوسط الفاتورة هو المهارة الحقيقية — واللي منها بتتعلم البقية. */
function growthSellers(agg){
  return Object.keys(agg.bySeller).map(function(id){
    var e = agg.bySeller[id];
    return { id:id, name:e.name, rev:e.rev, inv:e.inv,
             ticket: e.inv ? e.rev/e.inv : 0,
             perInv: e.inv ? e.pieces/e.inv : 0 };
  }).filter(function(x){ return x.inv >= 5; })   // أقل من ٥ فواتير = مش دلالة
   .sort(function(a,b){ return b.ticket - a.ticket; });
}

/* 💡 الفرصة بالفلوس — "لو متوسط الفاتورة زاد ١٠٪ يبقى كام في الشهر".
   ده اللي بيحوّل التحليل لقرار: بيقول للمالك الرقم يستاهل ولا لأ. */
function growthUpside(agg){
  var perDay = agg.daysCount ? agg.totalRev/agg.daysCount : 0;
  var monthly = perDay * 30;
  return {
    perDay: perDay, monthly: monthly,
    ticketUp10: monthly * 0.10,                  // +١٠٪ متوسط فاتورة
    oneMoreInvPerDay: agg.avgTicket * 30,        // فاتورة زيادة كل يوم
    // لو كل بايعة وصلت لمتوسط أحسن بايعة — سقف واقعي مش نظري
    bestSellerLift: (function(){
      var ss = growthSellers(agg);
      if(ss.length < 2) return 0;
      var best = ss[0].ticket;
      var gain = 0;
      ss.slice(1).forEach(function(s){ gain += Math.max(0, best - s.ticket) * s.inv; });
      return agg.daysCount ? gain / agg.daysCount * 30 : 0;
    })()
  };
}

/* ============================================================
   🖥️ الشاشة
   ============================================================ */
var _gxBranch = '';
function _gxHours(h){ return (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? ' ص' : ' م'); }
var GX_DOW = ['الأحد','الاتنين','التلات','الأربع','الخميس','الجمعة','السبت'];

function renderGrowth(){
  var wrap = $('#growthBox'); if(!wrap) return;
  var sel = $('#gxBranchSel');
  if(sel && !sel.dataset.built){
    var set = {};
    D.employees.forEach(function(e){ if(e.branch) set[e.branch]=1; });
    var brs = Object.keys(set).sort();
    if(!brs.length) return;
    sel.innerHTML = brs.map(function(b){ return '<option value="'+esc(b)+'">'+esc(b)+'</option>'; }).join('');
    sel.dataset.built = '1';
    sel.onchange = function(){ _gxBranch = sel.value; renderGrowth(); };
    _gxBranch = _gxBranch || brs[0];
    sel.value = _gxBranch;
  }
  var br = _gxBranch || (sel ? sel.value : '');
  if(!br){ wrap.innerHTML = '<div class="empty">اختار فرع</div>'; return; }

  var agg = growthAggregate(br);
  if(!agg.totalInv){
    wrap.innerHTML = '<div class="empty">مفيش مبيعات متسجلة للفرع ده آخر ٣٠ يوم</div>';
    return;
  }

  var up = growthUpside(agg);
  var lev = growthLevers(agg);
  var weak = growthWeakHours(agg);
  var sellers = growthSellers(agg);
  var pairs = growthPairs(br, 6);

  var H = '';

  // ---------- ١) الصورة الحالية ----------
  H += '<div class="panel"><h3>📊 الصورة دلوقتي — آخر ' + agg.daysCount + ' يوم</h3>'
    + '<div class="row"><span class="muted">متوسط اليوم</span><span class="amount">' + egp(up.perDay) + '</span></div>'
    + '<div class="row"><span class="muted">متوسط الفاتورة</span><span class="amount">' + egp(agg.avgTicket) + '</span></div>'
    + '<div class="row"><span class="muted">فواتير في اليوم</span><span class="amount">'
      + (agg.totalInv/Math.max(1,agg.daysCount)).toFixed(1) + '</span></div>'
    + '<div class="row"><span class="muted">قطع في الفاتورة</span><span class="amount">'
      + agg.avgPerInv.toFixed(2) + '</span></div>'
    + '</div>';

  // ---------- ٢) الرافعتين — أهم قسم ----------
  if(lev){
    var tSign = lev.dTicketPct >= 0 ? '▲' : '▼';
    var iSign = lev.dInvPct >= 0 ? '▲' : '▼';
    var tCol = lev.dTicketPct >= 0 ? 'var(--good)' : 'var(--bad)';
    var iCol = lev.dInvPct >= 0 ? 'var(--good)' : 'var(--bad)';
    /* 🧠 التشخيص — ده اللي بيفرق الشاشة دي عن أي تقرير أرقام.
       الفكرة: المبيعات = عدد فواتير × متوسط فاتورة. أي تغيّر لازم
       يترد لواحدة من الاتنين، وكل واحدة علاجها مختلف تمامًا. */
    var diag, act;
    if(lev.dInvPct < -8 && lev.dTicketPct > -3){
      diag = 'الزباين قلّت، والفاتورة زي ما هي.';
      act  = 'المشكلة في الزيارات مش في البيع — دوري على السبب بره المحل (موسم، إعلان واقف، منافس فتح جنبك).';
    }else if(lev.dTicketPct < -8 && lev.dInvPct > -3){
      diag = 'الزباين زي ما هم، بس بيشتروا أقل.';
      act  = 'دي مشكلة عرض وupselling جوّه المحل — شوفي قسم "بيتباعوا مع بعض" تحت واشتغلي عليه مع البايعات.';
    }else if(lev.dInvPct > 5 && lev.dTicketPct > 5){
      diag = 'الاتنين بيزيدوا — الشهر ماشي كويس.';
      act  = 'ثبّتي اللي بيحصل دلوقتي وشوفي إيه اتغيّر عشان تكرّريه.';
    }else if(lev.dInvPct < -5 && lev.dTicketPct < -5){
      diag = 'الاتنين نازلين مع بعض.';
      act  = 'ده مؤشر يستاهل وقفة — راجعي المخزون (حاجات ناقصة؟) وجدول الشيفتات في الساعات القوية.';
    }else{
      diag = 'الوضع مستقر — مفيش تغيّر كبير في أي رافعة.';
      act  = 'الزيادة هتيجي من شغل مقصود مش من الانتظار — ابدئي بأكبر فرصة تحت.';
    }
    H += '<div class="panel"><h3>🎚️ الرافعتين — آخر ٧ أيام مقارنة باللي قبلهم</h3>'
      + '<div class="row"><span class="muted">متوسط الفاتورة</span>'
        + '<span class="amount" style="color:' + tCol + ';">' + tSign + ' ' + Math.abs(lev.dTicketPct).toFixed(1) + '٪</span></div>'
      + '<div class="row"><span class="muted">عدد الفواتير في اليوم</span>'
        + '<span class="amount" style="color:' + iCol + ';">' + iSign + ' ' + Math.abs(lev.dInvPct).toFixed(1) + '٪</span></div>'
      + '<div class="card" style="margin-top:8px; background:var(--panel2);">'
        + '<b>' + esc(diag) + '</b><div class="muted" style="margin-top:5px; line-height:1.8;">' + esc(act) + '</div></div>'
      + '</div>';
  }

  // ---------- ٣) الفرصة بالفلوس ----------
  H += '<div class="panel"><h3>💰 الفرصة — لو اتحرّكت، تجيب كام في الشهر؟</h3>'
    + '<div class="hint">أرقام محسوبة من مبيعاتك إنت، مش تقديرات عامة.</div>'
    + '<div class="row"><span>متوسط الفاتورة يزيد ١٠٪<div class="muted">قطعة صغيرة زيادة مع كل فاتورة تقريبًا</div></span>'
      + '<span class="amount" style="color:var(--good);">+' + egp(up.ticketUp10) + '</span></div>'
    + '<div class="row"><span>فاتورة واحدة زيادة كل يوم<div class="muted">عميلة واحدة إضافية يوميًا</div></span>'
      + '<span class="amount" style="color:var(--good);">+' + egp(up.oneMoreInvPerDay) + '</span></div>';
  if(up.bestSellerLift > 0){
    H += '<div class="row"><span>لو كل البايعات وصلت لمتوسط أحسن واحدة<div class="muted">سقف واقعي — حد منكم بيحققه فعلًا دلوقتي</div></span>'
      + '<span class="amount" style="color:var(--good);">+' + egp(up.bestSellerLift) + '</span></div>';
  }
  H += '</div>';

  // ---------- ٤) الساعات ----------
  if(weak.length >= 3){
    var worst = weak.slice(0, 3), best = weak.slice(-3).reverse();
    H += '<div class="panel"><h3>🕐 الساعات — فين القوة وفين الضعف</h3>'
      + '<div class="hint">متوسط مبيعات الساعة في اليوم الواحد.</div>'
      + '<div class="muted" style="margin:8px 2px 4px; font-weight:800;">💪 أقوى ساعات</div>'
      + best.map(function(r){ return '<div class="row"><span>' + _gxHours(r.hour) + '</span>'
          + '<span class="amount">' + egp(r.revPerDay) + '</span></div>'; }).join('')
      + '<div class="muted" style="margin:10px 2px 4px; font-weight:800;">🥱 أضعف ساعات</div>'
      + worst.map(function(r){ return '<div class="row"><span>' + _gxHours(r.hour) + '</span>'
          + '<span class="amount" style="color:var(--sub);">' + egp(r.revPerDay) + '</span></div>'; }).join('')
      + '<div class="card" style="margin-top:8px; background:var(--panel2);"><div class="muted" style="line-height:1.8;">'
      + 'الساعات القوية = حطي فيها أكتر عدد بايعات وأحسنهم. الساعات الضعيفة = وقت الترتيب والجرد والبريكات، '
      + 'أو جرّبي فيها عرض محدود بوقت تشوفي بيحرّك حاجة ولا لأ.'
      + '</div></div></div>';
  }

  // ---------- ٥) أيام الأسبوع ----------
  var wts = growthDowWeights(agg);
  var dowRows = [];
  for(var d=0; d<7; d++){
    var e = agg.byDow[d];
    var days = e ? Object.keys(e.days).length : 0;
    dowRows.push({ d:d, avg: (e&&days) ? e.rev/days : 0, w: wts[d], days:days });
  }
  var maxAvg = Math.max.apply(null, dowRows.map(function(r){ return r.avg; })) || 1;
  H += '<div class="panel"><h3>📅 أيام الأسبوع</h3>'
    + '<div class="hint">متوسط اليوم — وده أساس التارجت اليومي العادل.</div>'
    + dowRows.sort(function(a,b){ return b.avg - a.avg; }).map(function(r){
        var pct = Math.round(r.avg/maxAvg*100);
        return '<div style="margin-bottom:7px;">'
          + '<div class="row" style="margin-bottom:3px;"><span>' + GX_DOW[r.d]
            + (r.days ? '' : ' <span class="muted">(مفيش شغل)</span>') + '</span>'
          + '<span class="amount">' + egp(r.avg) + '</span></div>'
          + '<div style="height:6px; background:var(--panel2); border-radius:4px; overflow:hidden;">'
          + '<div style="height:100%; width:' + pct + '%; background:linear-gradient(90deg,var(--gold),#d9a838);"></div>'
          + '</div></div>';
      }).join('')
    + '</div>';

  // ---------- ٦) البايعات ----------
  if(sellers.length >= 2){
    H += '<div class="panel"><h3>👗 البايعات — بمتوسط الفاتورة</h3>'
      + '<div class="hint">⚠️ الترتيب بمتوسط الفاتورة مش بالإجمالي — الإجمالي بيكافئ اللي اشتغلت شيفتات أكتر، '
      + 'والمتوسط هو المهارة الحقيقية.</div>'
      + sellers.map(function(s, i){
          var tag = i === 0 ? ' 🏆' : '';
          return '<div class="card row"><span>' + esc(s.name) + tag
            + '<div class="muted">' + s.inv + ' فاتورة · ' + s.perInv.toFixed(2) + ' قطعة/فاتورة</div></span>'
            + '<span class="amount">' + egp(s.ticket) + '</span></div>';
        }).join('')
      + '<div class="card" style="margin-top:8px; background:var(--panel2);"><div class="muted" style="line-height:1.8;">'
      + 'الفرق بين الأولى والأخيرة مش موهبة — غالبًا عادات بسيطة (بتعرض حاجة تانية، بتسأل سؤال، بتوصل للكاشير مع العميلة). '
      + 'اقعدي مع الأولى واعرفي بتعمل إيه بالظبط، ودي تبقى أرخص زيادة مبيعات هتعمليها.'
      + '</div></div></div>';
  }

  // ---------- ٧) بيتباعوا مع بعض ----------
  if(pairs.length){
    H += '<div class="panel"><h3>🔗 بيتباعوا مع بعض</h3>'
      + '<div class="hint">من فواتيرك إنت — دي أقوى جمل upselling لأنها حقيقية مش تخمين.</div>'
      + pairs.map(function(p){
          return '<div class="card row"><span>' + esc(p.a) + ' <span class="muted">+</span> ' + esc(p.b)
            + '<div class="muted">اتباعوا مع بعض ' + p.n + ' مرة</div></span></div>';
        }).join('')
      + '<div class="card" style="margin-top:8px; background:var(--panel2);"><div class="muted" style="line-height:1.8;">'
      + 'اعملي منهم ورقة صغيرة عند الكاشير: "اللي بياخد ده، اعرضي عليه ده". '
      + 'ده أسهل بكتير على البايعة من "حاولي تبيعي أكتر".'
      + '</div></div></div>';
  }

  wrap.innerHTML = H;
}
window.renderGrowth = renderGrowth;


// ============================================================
// 🐞 بلاغات المشاكل من الفروع
// ------------------------------------------------------------
// الموظفة بتدوس الزرار في الكاشير → البلاغ بيتكتب في pos_incidents
// بكل السجل التقني → المالك بيشوفه هنا.
//
// ⚡ بيتحمّل **بدوسة بس** مش تلقائي — نفس سياسة سجل النشاط، عشان
//    مايزوّدش قراءات على الفتحة العادية.
// ============================================================
var _incRows = [];
function loadIncidents(){
  var btn = document.getElementById('incLoad');
  var box = document.getElementById('incBox');
  if(!box) return;
  if(btn){ btn.disabled = true; btn.textContent = 'بيحمّل…'; }
  var cut = Date.now() - 30*86400000;
  db.collection('pos_incidents').where('ts','>=', cut).get().then(function(s){
    _incRows = s.docs.map(function(d){ return Object.assign({ _id:d.id }, d.data()); })
      .sort(function(a,b){ return (b.ts||0) - (a.ts||0); });
    renderIncidents();
  }).catch(function(e){
    box.innerHTML = '<div class="empty">تعذر التحميل: ' + esc(e.code || e.message) + '</div>';
  }).then(function(){
    if(btn){ btn.disabled = false; btn.textContent = 'تحديث البلاغات'; }
  });
}
function _incAuto(r){
  /* 🧠 تشخيص تلقائي — بيوفر عليك قراية السجل كله.
     الفكرة إن كل نمط ليه بصمة في البيانات: النوع (ب) بصمته
     hasFocus=false، والأخطاء بصمتها سطور ❌. */
  var ev = r.events || [];
  var st = r.state || {};
  var hints = [];
  var lostSys = ev.some(function(e){ return e.hasFocus === false; })
    || String(st['النافذة نشطة'] || '').indexOf('لأ') >= 0;
  var errs = ev.filter(function(e){ return String(e.kind||'').indexOf('❌') >= 0; });
  var netOff = ev.some(function(e){ return String(e.msg||'').indexOf('النت قطع') >= 0; });
  if(lostSys) hints.push('🎯 تركيز النظام ضايع — النوع (ب)، الإصلاح في main.js مش في الويب');
  if(errs.length) hints.push('❌ ' + errs.length + ' خطأ برمجي — أولهم: ' + esc(errs[0].msg || ''));
  if(netOff) hints.push('🌐 النت اتقطع أثناء الجلسة');
  if(!hints.length) hints.push('لا توجد بصمة واضحة — محتاج قراية السجل');
  return hints;
}
function renderIncidents(){
  var box = document.getElementById('incBox'); if(!box) return;
  if(!_incRows.length){ box.innerHTML = '<div class="empty">مفيش بلاغات آخر ٣٠ يوم ✅</div>'; return; }
  box.innerHTML = _incRows.map(function(r, i){
    var d = new Date(r.ts || 0);
    var when = d.toLocaleString('ar-EG', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    var hints = _incAuto(r);
    return '<div class="card" style="margin-bottom:8px;">'
      + '<div class="row"><span><b>' + esc(r.note || '—') + '</b>'
      +   '<div class="muted">🏬 ' + esc(r.branch || '—') + ' · 👤 ' + esc(r.employeeName || '—')
      +   ' · ' + when + '</div></span></div>'
      + '<div style="margin-top:7px; padding:9px; background:var(--panel2); border-radius:9px;">'
      +   hints.map(function(h){ return '<div class="muted" style="line-height:1.9;">' + h + '</div>'; }).join('')
      + '</div>'
      + '<button class="btn" style="width:100%; margin-top:7px; padding:9px; font-size:12.5px;"'
      +   ' onclick="toggleIncDetail(' + i + ')">📋 السجل الكامل</button>'
      + '<pre id="incD' + i + '" style="display:none; margin-top:7px; padding:9px; font-size:10.5px;'
      +   ' background:var(--panel2); border-radius:9px; max-height:300px; overflow:auto;'
      +   ' white-space:pre-wrap; direction:ltr; text-align:left;"></pre>'
      + '</div>';
  }).join('');
}
window.toggleIncDetail = function(i){
  var el = document.getElementById('incD' + i);
  var r = _incRows[i];
  if(!el || !r) return;
  if(el.style.display === 'block'){ el.style.display = 'none'; return; }
  var txt = '';
  var st = r.state || {};
  Object.keys(st).forEach(function(k){ txt += k + ': ' + st[k] + '\n'; });
  txt += '\n──── الأحداث (الأحدث تحت) ────\n';
  (r.events || []).forEach(function(e){
    txt += e.t + ' [' + e.kind + '] ' + e.msg
      + (e.hasFocus === false ? '  ⚠️(النافذة مش نشطة)' : '')
      + (e.active ? '  {' + e.active + '}' : '') + '\n';
  });
  el.textContent = txt;
  el.style.display = 'block';
};

function renderSalaries(){
  const wrap = $('#salariesList'); if(!wrap) return;
  const rows = salarySummary(D.employees, D.advances, monthKey());
  if(!rows.length){ wrap.innerHTML = '<div class="empty">مفيش موظفين</div>'; return; }
  let lastBr = '';
  wrap.innerHTML = rows.map(function(r){
    const hdr = r.branch !== lastBr ? '<div class="muted" style="margin:8px 2px 5px; font-weight:800;">🏬 '+esc(r.branch||'—')+'</div>' : '';
    lastBr = r.branch;
    return hdr + '<div class="card row"><span>'+esc(r.name)+
      '<div class="muted">أساسي '+egp(r.base)+' · سلف '+egp(r.advances)+'</div></span>' +
      '<span class="amount '+(r.net<0?'neg':'')+'">'+egp(r.net)+'</span></div>';
  }).join('');
}

// ============================================================
// 📅 شاشة اليوم — سجل المبيعات · ملخص الدفع · ملخص الأصناف
// ------------------------------------------------------------
// ⚠️ الأرقام هنا **لازم تطابق تقفيل الفرع بالظبط**، وإلا الشاشة بلا فايدة.
//    عشان كده اتنسخ منطق الـPOS حرفيًا:
//    · يوم الشغل من الساعة الفاصلة (day_cfg.startHour، افتراضي 6) مش اليوم
//      التقويمي — فاتورة 11 بالليل بتتحسب على يومها، وفاتورة 2 الفجر على اليوم
//      اللي فات (زي ما الكاشير شايفة).
//    · وقت الفاتورة = الطابع المحلي (createdAtMs) مش طابع السيرفر — فاتورة
//      أوفلاين بتترفع متأخر وطابع السيرفر بيبقى وقت الرفع مش وقت البيع.
//    · ملخص الدفع بيشمل الفاتورة الأصلية **والعكس** مع بعض (بيلغوا بعض) —
//      نفس ما بيعمل التقفيل. التقارير هي اللي بتستبعد الطرفين.
// ============================================================
const OF_TZ = 'Africa/Cairo';
let _ofDayCut = 6;          // الساعة الفاصلة — بتتقرا من الإعدادات
let _ofDaySales = [];
// ⭐ تقييم العميلة لكل فاتورة (saleId → {r, note, ts}) — بيتملي مع تحميل اليوم
let _ofRatingBySale = {};
const OF_RATING_ICON = {1:'😠', 2:'🙁', 3:'🙂', 4:'😍'};
const OF_RATING_HUE  = {1:'var(--minus)', 2:'#F59E0B', 3:'#65A30D', 4:'var(--plus)'};
let _ofDaySub = 'pay';

async function ofLoadDayCut(){
  try{
    const d = await db.collection('pos_test_settings').doc('day_cfg').get();
    const h = d.exists ? Number((d.data()||{}).startHour) : NaN;
    if(!isNaN(h) && h >= 0 && h <= 23) _ofDayCut = h;
  }catch(e){ console.warn('day_cfg', e && e.code); }
}

// ساعة المحل — نفس فكرة _shopClock في الـPOS
function _ofShopParts(ts){
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: OF_TZ, year:'numeric',
    month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false });
  const o = {};
  f.formatToParts(new Date(ts)).forEach(function(p){ o[p.type] = p.value; });
  return { y:+o.year, m:+o.month, d:+o.day, hh:+(o.hour === '24' ? '0' : o.hour), mm:+o.minute };
}
// إزاحة القاهرة باللحظة دي (بتفرق صيفًا وشتاءً)
function _ofOffsetMs(ts){
  const p = _ofShopParts(ts);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - (Math.floor(ts / 60000) * 60000);
}
// نطاق يوم الشغل لتاريخ مكتوب YYYY-MM-DD
function ofBizDayRange(dateStr){
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 12, 0);          // الظهر عشان نعرف الإزاحة
  const off = _ofOffsetMs(guess);
  const start = Date.UTC(y, m - 1, d, _ofDayCut, 0) - off;
  return { start: start, end: start + 24 * 3600 * 1000 };
}
// وقت البيع الحقيقي — نفس saleTs في الـPOS بحارس الـ48 ساعة
function ofSaleTs(s){
  const server = (s && s.createdAt && typeof s.createdAt.toMillis === 'function') ? s.createdAt.toMillis() : null;
  const local  = (s && typeof s.createdAtMs === 'number') ? s.createdAtMs : null;
  if(local != null && server != null){
    return Math.abs(server - local) <= 48 * 3600000 ? local : server;
  }
  return local != null ? local : server;
}
function ofTime(ts){
  try{ return new Date(ts).toLocaleTimeString('ar-EG', { timeZone:OF_TZ, hour:'2-digit', minute:'2-digit' }); }
  catch(e){ return ''; }
}
// أرقام عادية (كميات · عدد قطع) — دي مش سرّية ومبتتخفيش
function ofNum(n){ return (Math.round((Number(n)||0) * 100) / 100).toLocaleString('ar-EG'); }
// 💵 أرقام فلوس في شاشة اليوم — بتحترم العين.
// ⚠️ شاشة اليوم مكانتش بتعدي على egp، فكانت المبيعات والأرباح تفضل مكشوفة
//    والعين مقفولة.
function ofMoney(n){
  if(typeof _ofHideMoney !== 'undefined' && _ofHideMoney) return '••••';
  return ofNum(n);
}

// ---- تحميل فواتير اليوم ----
async function ofLoadDay(){
  const br = ($('#dayBranch') || {}).value || '';
  const dt = ($('#dayDate') || {}).value || '';
  if(!br || !dt) return;
  const r = ofBizDayRange(dt);
  const w = $('#dayWindow');
  if(w) w.textContent = 'يوم الشغل: ' + ofTime(r.start) + ' → ' + ofTime(r.end)
        + ' (الساعة الفاصلة ' + _ofDayCut + ')';
  ['#dayPay','#daySales','#dayItems'].forEach(function(id){
    const el = $(id); if(el) el.innerHTML = '<div class="card" style="text-align:center; color:var(--sub);">بيحمّل…</div>';
  });
  try{
    // ⚠️ استعلام بنطاق زمني على السيرفر — مش سحب كل الفواتير وفلترة على الجهاز
    const snap = await db.collection('pos_test_sales')
      .where('branch','==', br)
      .where('createdAt','>=', firebase.firestore.Timestamp.fromMillis(r.start))
      .where('createdAt','<',  firebase.firestore.Timestamp.fromMillis(r.end))
      .get();
    let rows = snap.docs.map(function(d){ const o = d.data(); o.id = d.id; return o; });
    // 🕐 وفلترة تانية بالوقت الحقيقي — فواتير الأوفلاين طابع سيرفرها وقت الرفع
    rows = rows.filter(function(s){ const t = ofSaleTs(s); return t >= r.start && t < r.end; });
    rows.sort(function(a,b){ return ofSaleTs(a) - ofSaleTs(b); });
    _ofDaySales = rows;

    // ⭐ تقييمات العملاء على فواتير اليوم — الربط بالـ`saleId` (رابط مؤكد).
    //    بنمد آخر النافذة يومين لأن تقييم تطبيق الولاء بيتبعت بعد نص ساعة
    //    من الشراء والعميلة ممكن تدوس عليه تاني يوم.
    _ofRatingBySale = {};
    try{
      const _es = await db.collection('entries')
        .where('ts','>=', r.start - 5*60*1000)
        .where('ts','<=', r.end + 48*60*60*1000).get();
      _es.docs.forEach(function(d){
        const e = d.data();
        if(e.saleId) _ofRatingBySale[e.saleId] = { r:e.r, note:e.note||'', ts:e.ts };
      });
    }catch(e2){ console.warn('day ratings', e2); }
  }catch(e){
    console.warn('day load', e);
    ['#dayPay','#daySales','#dayItems'].forEach(function(id){
      const el = $(id);
      if(el) el.innerHTML = '<div class="card" style="color:var(--minus);">تعذر التحميل: '
        + esc(e.code || e.message) + '<div style="font-size:11px; color:var(--sub); margin-top:6px;">'
        + 'لو الرسالة بتقول index، افتح اللينك اللي في الكونسول مرة واحدة.</div></div>';
    });
    return;
  }
  ofRenderDay();
}

function ofRenderDay(){
  ofRenderPay(); ofRenderSales(); ofRenderItems(); ofRenderPresent();
  try{ renderOfficeHomeSummary(); }catch(e){}
}

// ============================================================
// 👥 موظفين الفرع دلوقتي — مركز الموظفين (المرحلة 1: العرض)
// ------------------------------------------------------------
// الكارت بيعرض **الفرع المختار فوق** بس، مقفول افتراضيًا:
//   سطر واحد بعدد الحاضرين — دوسة تفتح التفاصيل.
// جوه: الحاضرين (بالبريك والتأخير) + قسم «مش موجودين» بيتفتح لوحده
//   وبيقول السبب: خلّص شيفته / أجازة معتمدة / نسي انصراف / ماجاش.
// ودوسة على أي موظف بتفتح صفحته: الحضور والميعاد والتأخير والبريكات
//   ونقط البيع النهاردة.
// ⚠️ الشيفت اللي فات عليه أكتر من 16 ساعة = نسي انصراف مش شغال فعلًا.
// 📉 القراءات: الشيفتات والبريكات كل 4 دقايق (مستندات قليلة) —
//   والنقط بتتقرا **بس** لما صفحة موظف تتفتح (أتقل استعلام، مش دوري).
// ============================================================
const OF_STALE_SHIFT_MS = 16 * 60 * 60 * 1000;
const OF_HUB_CACHE_MS = 4 * 60 * 1000;

// بداية يوم الشغل «دلوقتي» (مش تاريخ البيكر — الكارت لحظي دايمًا)
function ofHubDayStart(nowTs){
  let ms = nowTs || Date.now();
  if(_ofShopParts(ms).hh < _ofDayCut) ms -= 86400000;
  const p = _ofShopParts(ms);
  const key = p.y + '-' + String(p.m).padStart(2,'0') + '-' + String(p.d).padStart(2,'0');
  return { start: ofBizDayRange(key).start, key: key };
}

// ------------------------------------------------------------
// دالة نقية: تصنيف موظفين فرع واحد
// بترجّع { present:[...], away:[...] } — away فيها reason:
//   'stale' نسي انصراف · 'left' خلّص شيفته · 'leave' أجازة معتمدة · 'absent' ماجاش
// ------------------------------------------------------------
function ofHubRows(branch, employees, shifts, breaks, leaves, nowTs, dayKey){
  const now = nowTs || Date.now();
  const emps = (employees || []).filter(function(e){ return e && e.id && e.branch === branch; });
  const empIds = {};
  emps.forEach(function(e){ empIds[e.id] = 1; });

  // أحدث شيفت النهاردة لكل موظف (المفتوح بيغلب المقفول لو الاتنين موجودين)
  const byEmp = {};
  (shifts || []).forEach(function(sh){
    if(!sh || !sh.clockInTs || !empIds[sh.employeeId]) return;
    const cur = byEmp[sh.employeeId];
    if(!cur || (!sh.clockOutTs && cur.clockOutTs) || sh.clockInTs > cur.clockInTs)
      byEmp[sh.employeeId] = sh;
  });

  // بريكات اليوم لكل موظف
  const brkBy = {};
  (breaks || []).forEach(function(b){
    if(!b || !b.startTs || !empIds[b.employeeId]) return;
    const g = (brkBy[b.employeeId] = brkBy[b.employeeId] || { list: [], totalMin: 0, open: null });
    g.list.push(b);
    if(!b.endTs){ g.open = b; }
    else g.totalMin += Number(b.durationMin) || Math.max(0, Math.round((b.endTs - b.startTs) / 60000));
  });

  // أجازة معتمدة النهاردة (التبديل مش غياب)
  const leaveBy = {};
  (leaves || []).forEach(function(l){
    if(!l || l.status !== 'approved' || l.dateKey !== dayKey) return;
    if(l.type === 'shiftSwap') return;
    if(empIds[l.empId]) leaveBy[l.empId] = l;
  });

  const present = [], away = [];
  emps.forEach(function(e){
    const sh = byEmp[e.id];
    const brk = brkBy[e.id] || { list: [], totalMin: 0, open: null };
    const base = {
      empId: e.id, name: e.name || 'موظف',
      sched: e.scheduledStartTime || (sh && sh.scheduledStartTime) || null,
      brk: brk
    };
    if(sh && !sh.clockOutTs){
      const mins = Math.max(0, Math.round((now - sh.clockInTs) / 60000));
      if(now - sh.clockInTs > OF_STALE_SHIFT_MS){
        away.push(Object.assign(base, { reason: 'stale', shiftId: sh.id,
          clockInTs: sh.clockInTs, minutes: mins }));
      } else {
        present.push(Object.assign(base, { shiftId: sh.id,
          clockInTs: sh.clockInTs, minutes: mins,
          lateMin: Number(sh.lateMinutes) || 0, latePenalized: !!sh.latePenalized }));
      }
    } else if(sh && sh.clockOutTs){
      away.push(Object.assign(base, { reason: 'left', shiftId: sh.id,
        clockInTs: sh.clockInTs, clockOutTs: sh.clockOutTs,
        minutes: Math.max(0, Math.round((sh.clockOutTs - sh.clockInTs) / 60000)),
        lateMin: Number(sh.lateMinutes) || 0, latePenalized: !!sh.latePenalized }));
    } else if(leaveBy[e.id]){
      away.push(Object.assign(base, { reason: 'leave',
        leaveType: leaveBy[e.id].type || '', leaveNote: leaveBy[e.id].reason || '' }));
    } else {
      away.push(Object.assign(base, { reason: 'absent' }));
    }
  });

  present.sort(function(a, b){ return a.clockInTs - b.clockInTs; });
  const ord = { stale: 0, left: 1, leave: 2, absent: 3 };
  away.sort(function(a, b){
    return (ord[a.reason] - ord[b.reason]) || String(a.name).localeCompare(String(b.name), 'ar');
  });
  return { present: present, away: away };
}

// وزن النقطة — نفس قاعدة sales بالظبط (المرتب والعمولة بيمشوا عليها)
function ofHubPoints(points, empId){
  let count = 0, weight = 0;
  (points || []).forEach(function(pp){
    if(!pp || pp.employeeId !== empId) return;
    count++;
    const v = Number(pp.value);
    weight += (isNaN(v) || v <= 0) ? 1 : v;
  });
  return { count: count, weight: Math.round(weight * 10) / 10 };
}

function ofPresentDur(mins){
  const h = Math.floor((Number(mins) || 0) / 60), m = (Number(mins) || 0) % 60;
  return h ? (h + ' س ' + m + ' د') : (m + ' د');
}

// ------------------------------------------------------------
// التحميل: شيفتات + بريكات اليوم (كاش 4 دقايق) · النقط عند فتح الصفحة بس
// ------------------------------------------------------------
let _ofHub = { at: 0, start: 0, key: '', shifts: [], breaks: [], credits: [], loading: false,
               ptsAt: 0, pts: [] };
let _ofHubOpen = false, _ofHubAwayOpen = false;

async function _ofHubLoad(force){
  const d = ofHubDayStart(Date.now());
  const fresh = (_ofHub.key === d.key) && (Date.now() - _ofHub.at) < OF_HUB_CACHE_MS;
  if((!force && fresh) || _ofHub.loading) return;
  _ofHub.loading = true;
  try{
    const rs = await Promise.all([
      db.collection('sales_shifts').where('clockInTs', '>=', d.start).get(),
      db.collection('sales_breaks').where('startTs', '>=', d.start).get(),
      db.collection('sales_time_credit').where('ts', '>=', d.start).get()
    ]);
    _ofHub.shifts = rs[0].docs.map(function(x){ return Object.assign({ id: x.id }, x.data()); });
    _ofHub.breaks = rs[1].docs.map(function(x){ return Object.assign({ id: x.id }, x.data()); });
    _ofHub.credits = rs[2].docs.map(function(x){ return Object.assign({ id: x.id }, x.data()); });
    _ofHub.at = Date.now(); _ofHub.start = d.start; _ofHub.key = d.key;
    _ofHub.loading = false;
    ofRenderPresent();
  }catch(e){ _ofHub.loading = false; console.warn('hub load', e && e.code); }
}

// شيفتات اليوم + أي شيفت مفتوح قديم (نسي انصراف من قبل النهاردة)
function _ofHubShifts(){
  const seen = {};
  _ofHub.shifts.forEach(function(sh){ seen[sh.id] = 1; });
  const old = (D.openShifts || []).filter(function(sh){
    return sh && !sh.clockOutTs && !seen[sh.id];
  });
  return _ofHub.shifts.concat(old);
}

// ------------------------------------------------------------
// ⚙️ إعدادات الفرع (مواعيد الشيفتات + إعدادات رصيد الوقت) —
//    من `sales_settings/<الفرع>` — **نفس المستند اللي sales بيقرا منه**،
//    عشان قفل الشيفت وحساب البريك يطلعوا نفس أرقام sales بالظبط.
// ------------------------------------------------------------
const OF_TIME_DEFAULTS = { breakMin: 30, breakGraceMin: 5, breakMinPerHour: 10 };
let _ofCfgBy = {};   // { branch: { shifts, timeCfg, at } }
async function _ofBranchCfg(branch){
  const c = _ofCfgBy[branch];
  if(c && (Date.now() - c.at) < 10 * 60 * 1000) return c;
  let shifts = {}, timeCfg = Object.assign({}, OF_TIME_DEFAULTS), payDay = 6;
  try{
    const rs = await Promise.all([
      db.collection('sales_settings').doc(branch).get(),
      db.collection('pos_test_settings').doc('advances_cfg').get()
    ]);
    const x = rs[0].exists ? (rs[0].data() || {}) : {};
    const a = rs[1].exists ? (rs[1].data() || {}) : {};
    if(x.compliance && x.compliance.shifts) shifts = x.compliance.shifts;
    if(x.timeCfg) timeCfg = Object.assign(timeCfg, x.timeCfg);
    if(Number(a.closeDay) > 0) payDay = Number(a.closeDay);
  }catch(e){ console.warn('branch cfg', e && e.code); }
  return (_ofCfgBy[branch] = { shifts: shifts, timeCfg: timeCfg, payDay: payDay, at: Date.now() });
}

// 🚪 وقت القفل الإداري — **نسخة طبق الأصل من graceCloseTsFor في sales**:
// الانصراف = نهاية الشيفت المجدولة مش دلوقتي (مفيش وقت إضافي)،
// وبيتعامل مع الشيفت اللي بيعدّي نص الليل، وفولباك 8س15د.
function ofGraceCloseTs(shift, emp, shiftDefs){
  if(!shift || !shift.clockInTs) return null;
  const sdef = shiftDefs ? shiftDefs[emp && emp.shift] : null;
  const endHM = (emp && emp.scheduledEndTime) || (sdef && sdef.end) || '';
  let endTs = null;
  if(/^\d{1,2}:\d{2}$/.test(endHM)){
    const parts = String(endHM).split(':').map(Number);
    const base = new Date(shift.clockInTs);
    const e = new Date(base.getFullYear(), base.getMonth(), base.getDate(), parts[0], parts[1], 0, 0);
    if(e.getTime() <= shift.clockInTs) e.setDate(e.getDate() + 1);
    endTs = e.getTime();
  }
  if(!endTs) endTs = shift.clockInTs + (8 * 60 + 15) * 60000;
  return endTs;
}

// ☕ ساعات زيادة البريك — نفس حساب breakHoursFrom في sales بالظبط:
// الزيادة = الفعلي − المسموح − السماح، وكل (breakMinPerHour) دقيقة = ساعة (floor)
function ofBreakOverHours(actualMin, cfg){
  cfg = cfg || OF_TIME_DEFAULTS;
  const allowed = Number(cfg.breakMin) || 30;
  const grace = Number(cfg.breakGraceMin) || 0;
  const over = Math.max(0, (Number(actualMin) || 0) - allowed - grace);
  const per = Number(cfg.breakMinPerHour) || 10;
  return Math.floor(over / per);
}

// 🩺 بنود رصيد الوقت بتاعة موظف: المفتوح (هيتخصم) والمعذور
function ofHubCredits(credits, empId){
  const mine = (credits || []).filter(function(c){ return c && c.employeeId === empId; });
  return {
    open: mine.filter(function(c){ return !c.excused && (Number(c.hours) || 0) > 0; })
               .sort(function(a, b){ return (a.ts || 0) - (b.ts || 0); }),
    excused: mine.filter(function(c){ return !!c.excused; })
  };
}

function _ofHubBranch(){
  const el = $('#dayBranch');
  if(el && el.value) return el.value;
  const e0 = (D.employees || []).find(function(e){ return e && e.branch; });
  return e0 ? e0.branch : '';
}

function _ofHubBadges(p, now){
  let out = '';
  if(p.latePenalized && p.lateMin)
    out += '<span style="font-size:10.5px; background:#7f1d1d; color:#fecaca; border-radius:6px; padding:1px 6px;">⏰ اتأخر ' + p.lateMin + 'د</span> ';
  if(p.brk && p.brk.open){
    const el = Math.max(0, Math.round((now - p.brk.open.startTs) / 60000));
    out += '<span style="font-size:10.5px; background:#78350f; color:#fde68a; border-radius:6px; padding:1px 6px;">☕ في بريك من ' + el + 'د</span> ';
  } else if(p.brk && p.brk.totalMin)
    out += '<span style="font-size:10.5px; color:var(--sub);">☕ ' + p.brk.totalMin + 'د</span> ';
  return out;
}

function ofRenderPresent(){
  const el = document.getElementById('dayPresent'); if(!el) return;
  const br = _ofHubBranch();
  if(!br){ el.innerHTML = ''; return; }
  if(!_ofHub.at){
    el.innerHTML = '<div class="card" style="color:var(--sub);">👥 بيحمّل حضور الفرع…</div>';
    _ofHubLoad();
    return;
  }
  _ofHubLoad();   // بيتجدد لوحده لو الكاش قدم — رخيص لو لسه طازة
  const now = Date.now();
  const d = ofHubDayStart(now);
  const rows = ofHubRows(br, D.employees, _ofHubShifts(), _ofHub.breaks, D.leaves, now, d.key);

  const head = '<div onclick="ofHubToggle()" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">'
    + '<div><div style="font-weight:800;">👥 موظفين ' + esc(br) + '</div>'
    + '<div style="font-size:11.5px; color:var(--sub); margin-top:2px;">'
    +   rows.present.length + ' حاضرين · ' + rows.away.length + ' مش موجودين — '
    +   (_ofHubOpen ? 'دوس للقفل' : 'دوس للتفاصيل') + '</div></div>'
    + '<div style="font-weight:900; font-size:17px;">' + rows.present.length + '</div></div>';

  if(!_ofHubOpen){ el.innerHTML = '<div class="card">' + head + '</div>'; return; }

  const pHtml = rows.present.length ? rows.present.map(function(p){
    const t = new Date(p.clockInTs).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    return '<div onclick="ofHubSheet(\'' + esc(p.empId) + '\')" style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 0; border-top:1px solid var(--line); cursor:pointer;">'
      + '<div style="min-width:0;"><div style="font-weight:700; font-size:13px;">🟢 ' + esc(p.name) + '</div>'
      + '<div style="font-size:11px; color:var(--sub); margin-top:1px;">من ' + t + ' ' + _ofHubBadges(p, now) + '</div></div>'
      + '<div style="font-size:12px; color:var(--sub); white-space:nowrap;">' + ofPresentDur(p.minutes) + '</div></div>';
  }).join('') : '<div style="padding:8px 0; color:var(--sub); font-size:12px; border-top:1px solid var(--line);">مفيش حد حاضر دلوقتي</div>';

  let aHtml = '';
  if(rows.away.length){
    aHtml = '<div onclick="ofHubAway()" style="display:flex; justify-content:space-between; margin-top:10px; padding-top:8px; border-top:2px solid var(--line); font-weight:800; font-size:12.5px; cursor:pointer;">'
      + '<span>😴 مش موجودين (' + rows.away.length + ')</span><span>' + (_ofHubAwayOpen ? '▲' : '▼') + '</span></div>';
    if(_ofHubAwayOpen){
      aHtml += rows.away.map(function(p){
        let why = '', ic = '';
        if(p.reason === 'stale'){ ic = '⚠️'; why = 'شكله نسي انصراف — شيفت مفتوح من '
          + new Date(p.clockInTs).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); }
        else if(p.reason === 'left'){ ic = '🏁'; why = 'خلّص شيفته '
          + new Date(p.clockInTs).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) + ' → '
          + new Date(p.clockOutTs).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
          + ' (' + ofPresentDur(p.minutes) + ')'; }
        else if(p.reason === 'leave'){ ic = '🌴'; why = 'أجازة معتمدة' + (p.leaveNote ? ' — ' + esc(p.leaveNote) : ''); }
        else { ic = '⚪'; why = 'ماجاش النهاردة' + (p.sched ? ' — ميعاده ' + esc(p.sched) : ''); }
        return '<div onclick="ofHubSheet(\'' + esc(p.empId) + '\')" style="padding:7px 0; border-top:1px solid var(--line); cursor:pointer;">'
          + '<div style="font-weight:700; font-size:13px;">' + ic + ' ' + esc(p.name) + '</div>'
          + '<div style="font-size:11px; color:var(--sub); margin-top:1px;">' + why + '</div></div>';
      }).join('');
    }
  }
  el.innerHTML = '<div class="card">' + head + pHtml + aHtml + '</div>';
}
window.ofHubToggle = function(){ _ofHubOpen = !_ofHubOpen; ofRenderPresent(); };
window.ofHubAway = function(){ _ofHubAwayOpen = !_ofHubAwayOpen; ofRenderPresent(); };

// ------------------------------------------------------------
// 📄 صفحة الموظف — المرحلة 1: عرض بس (الإجراءات جاية في مرحلة تانية)
// ------------------------------------------------------------
async function _ofHubPtsLoad(){
  const d = ofHubDayStart(Date.now());
  if(_ofHub.ptsAt && (Date.now() - _ofHub.ptsAt) < OF_HUB_CACHE_MS && _ofHub.key === d.key) return;
  const snap = await db.collection('sales_points').where('ts', '>=', d.start).get();
  _ofHub.pts = snap.docs.map(function(x){ return Object.assign({ id: x.id }, x.data()); });
  _ofHub.ptsAt = Date.now();
}

window.ofHubSheet = async function(empId){
  const emp = (D.employees || []).find(function(e){ return e && e.id === empId; });
  if(!emp) return;
  let ov = document.getElementById('ofHubOv');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'ofHubOv';
    ov.style.cssText = 'position:fixed; inset:0; background:#000a; z-index:600; display:flex; align-items:flex-end; justify-content:center;';
    ov.onclick = function(ev){ if(ev.target === ov) ov.remove(); };
    document.body.appendChild(ov);
  }
  ov.innerHTML = '<div style="background:var(--card,#1c1c22); width:100%; max-width:560px; border-radius:16px 16px 0 0; padding:16px; max-height:82vh; overflow:auto;">بيحمّل…</div>';
  try{ await _ofHubPtsLoad(); }catch(e){ console.warn('hub pts', e && e.code); }

  const now = Date.now();
  const d = ofHubDayStart(now);
  const rows = ofHubRows(emp.branch, D.employees, _ofHubShifts(), _ofHub.breaks, D.leaves, now, d.key);
  const p = rows.present.find(function(x){ return x.empId === empId; })
        || rows.away.find(function(x){ return x.empId === empId; });
  const pts = ofHubPoints(_ofHub.pts, empId);
  const T = function(ts){ return new Date(ts).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); };
  const line = function(l, v){ return '<div style="display:flex; justify-content:space-between; padding:7px 0; border-top:1px solid var(--line); font-size:13px;"><span style="color:var(--sub);">' + l + '</span><b>' + v + '</b></div>'; };

  let stat = '', body = '';
  if(p && p.clockInTs && !p.clockOutTs && p.reason !== 'stale'){
    stat = '🟢 شغال دلوقتي';
    body += line('جه', T(p.clockInTs)) + line('شغال بقاله', ofPresentDur(p.minutes));
  } else if(p && p.reason === 'stale'){
    stat = '⚠️ شيفت مفتوح — شكله نسي انصراف';
    body += line('جه', T(p.clockInTs)) + line('مفتوح بقاله', ofPresentDur(p.minutes));
  } else if(p && p.reason === 'left'){
    stat = '🏁 خلّص شيفته';
    body += line('جه', T(p.clockInTs)) + line('مشي', T(p.clockOutTs)) + line('اشتغل', ofPresentDur(p.minutes));
  } else if(p && p.reason === 'leave'){
    stat = '🌴 أجازة معتمدة';
    if(p.leaveNote) body += line('السبب', esc(p.leaveNote));
  } else stat = '⚪ ماجاش النهاردة';

  if(p && p.sched){
    let lt = 'في معاده ✅';
    if(p.latePenalized && p.lateMin) lt = '<span style="color:#f87171;">اتأخر ' + p.lateMin + ' دقيقة</span>';
    else if(p.lateMin) lt = 'اتأخر ' + p.lateMin + 'د (في السماح)';
    body += line('ميعاده', esc(p.sched)) + ((p.clockInTs) ? line('الالتزام', lt) : '');
  }
  if(p && p.brk && p.brk.list.length){
    const bl = p.brk.list.map(function(b){
      return b.endTs
        ? ('☕ ' + T(b.startTs) + ' → ' + T(b.endTs) + ' (' + (Number(b.durationMin) || Math.round((b.endTs - b.startTs) / 60000)) + 'د)')
        : ('<span style="color:#fbbf24;">☕ مفتوح من ' + T(b.startTs) + ' (' + Math.round((now - b.startTs) / 60000) + 'د)</span>');
    }).join('<br>');
    body += '<div style="padding:7px 0; border-top:1px solid var(--line); font-size:12.5px;"><div style="color:var(--sub); margin-bottom:3px;">البريكات النهاردة</div>' + bl + '</div>';
  }
  const _pw = (pts.weight % 1 === 0) ? String(pts.weight) : pts.weight.toFixed(1);
  body += line('⭐ نقط البيع النهاردة', pts.count ? (_pw + ' نقطة (' + pts.count + ' عملية)') : 'مفيش');

  // 🩺 بنود رصيد الوقت النهاردة (تأخير/بريك زايد/غياب) + زرار العذر
  const cr = ofHubCredits(_ofHub.credits, empId);
  const _tn = { late: '⏰ تأخير', 'break': '☕ بريك زايد', swap: '🔁 تبديل', absence: '🚫 غياب', early: '🚪 انصراف بدري' };
  if(cr.open.length || cr.excused.length){
    let ch = '<div style="padding:7px 0; border-top:1px solid var(--line);">'
      + '<div style="color:var(--sub); font-size:12px; margin-bottom:4px;">رصيد الوقت النهاردة</div>';
    cr.open.forEach(function(c){
      ch += '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:4px 0; font-size:12.5px;">'
        + '<span>' + (_tn[c.type] || c.type) + ' — <b style="color:#f87171;">' + (Number(c.hours) || 0) + ' ساعة</b>'
        + (c.note ? ' <span style="color:var(--sub); font-size:11px;">(' + esc(c.note) + ')</span>' : '') + '</span>'
        + '<button onclick="ofHubExcuse(\'' + esc(c.id) + '\',\'' + esc(empId) + '\')" style="background:#166534; color:#fff; border:none; border-radius:8px; padding:4px 10px; font-size:12px; cursor:pointer;">🩺 اعذره</button></div>';
    });
    cr.excused.forEach(function(c){
      ch += '<div style="padding:4px 0; font-size:12px; color:var(--sub); text-decoration:line-through;">'
        + (_tn[c.type] || c.type) + ' ' + (Number(c.originalHours) || 0) + ' ساعة — معذور'
        + (c.excuseReason ? ' (' + esc(c.excuseReason) + ')' : '') + '</div>';
    });
    body += ch + '</div>';
  }

  // 🚪 أزرار الإجراءات حسب الحالة
  let acts = '';
  if(p && p.brk && p.brk.open){
    const bel = Math.round((now - p.brk.open.startTs) / 60000);
    acts += '<button onclick="ofHubBreakClose(\'' + esc(p.brk.open.id) + '\',\'' + esc(empId) + '\')" style="background:#92400e; color:#fff; border:none; border-radius:10px; padding:9px 12px; font-size:13px; font-weight:700; cursor:pointer;">☕ اقفل البريك (' + bel + 'د)</button>';
  }
  if(p && p.reason === 'stale'){
    acts += '<button onclick="ofHubGraceClose(\'' + esc(p.shiftId) + '\',\'' + esc(empId) + '\')" style="background:#1d4ed8; color:#fff; border:none; border-radius:10px; padding:9px 12px; font-size:13px; font-weight:700; cursor:pointer;">🚪 اقفل الشيفت (نهاية معاده)</button>';
  }
  if(acts) body += '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">' + acts + '</div>';

  // 💰 قسم الفلوس — بيتحمّل بدوسة (مش مع كل فتحة صفحة، عشان القراءات)
  body += '<div style="margin-top:12px; padding-top:8px; border-top:2px solid var(--line);">'
    + '<button onclick="ofHubMoney(' + "'" + esc(empId) + "'" + ')" style="background:#3b3b52; color:#fff; border:none; border-radius:10px; padding:8px 12px; font-size:12.5px; font-weight:700; cursor:pointer; width:100%;">💰 الفلوس — العمولة والمرتب</button>'
    + '<div id="ofHubMoneyBox"></div></div>';

  ov.firstChild.innerHTML =
    '<div style="display:flex; justify-content:space-between; align-items:center;">'
    + '<div><div style="font-weight:900; font-size:16px;">' + esc(emp.name || 'موظف') + '</div>'
    + '<div style="font-size:11.5px; color:var(--sub);">' + esc(emp.branch || '') + ' · ' + stat + '</div></div>'
    + '<button onclick="document.getElementById(\'ofHubOv\').remove()" style="background:none; border:none; color:var(--sub); font-size:20px; cursor:pointer;">✖</button></div>'
    + '<div style="margin-top:8px;">' + body + '</div>'
    ;
};

// ============================================================
// 💰 المرحلة 3: الفلوس — محرك المرتب والعمولة
// ------------------------------------------------------------
// ⚠️ القاعدة الحاكمة: الأرقام هنا **لازم تطابق sales للقرش** —
//    نفس المعادلات حرفيًا. فيه اختبار بيشغّل المحركين على نفس
//    البيانات ويقارن كل حقل: لو حد عدّل نسخة ونسي التانية، بيقع.
// الفرق الوحيد: sales بيقرا من متغيرات عامة، وهنا كل البيانات
//    بتتبعت صريحة في data — عشان الدالة نقية وقابلة للاختبار.
// ============================================================
function ofMonthDateRange(d){
  // فترة الحضور = الشهر التقويمي الحقيقي كله (28/29/30/31).
  // قيمة اليوم في المرتب تفضل ÷30 داخل ofComputeSalary.
  const dt = d || new Date();
  return { start: new Date(dt.getFullYear(), dt.getMonth(), 1, 0, 0, 0, 0),
           end: new Date(dt.getFullYear(), dt.getMonth() + 1, 0, 23, 59, 59, 999) };
}
function ofMonthRange(d){
  // شهر العمولة = الشهر التقويمي كامل (زي sales بالظبط — مختلف عن فترة المرتب)
  const dt = new Date(d || Date.now());
  return { start: new Date(dt.getFullYear(), dt.getMonth(), 1, 0, 0, 0, 0),
           end: new Date(dt.getFullYear(), dt.getMonth() + 1, 0, 23, 59, 59, 999) };
}
function ofMonthLabel(d){
  const dt = d || new Date();
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
}
function ofCountDayOffInRange(emp, start, end){
  if(emp.dayOff === undefined || emp.dayOff === null || emp.dayOff === '') return 0;
  let count = 0;
  const cur = new Date(start);
  while(cur <= end){
    if(cur.getDay() === Number(emp.dayOff)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
function ofCountRequiredInRange(emp, start, end){
  let count = 0;
  const cur = new Date(start);
  while(cur <= end){
    const isDayOff = (emp.dayOff !== undefined && emp.dayOff !== null && emp.dayOff !== '') && cur.getDay() === Number(emp.dayOff);
    if(!isDayOff) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/* ============================================================
   🗓️ محرك الإجازات الأسبوعي — **نسخة طبق الأصل من sales-app.js**
   ------------------------------------------------------------
   ⚠️⚠️ القاعدة: `ofComputeSalary` لازم تدّي **نفس الرقم** اللي بتدّيه
      `computeSalary` في تطبيق الحضور — رقمين مختلفين لنفس الموظفة
      معناه إن المالك مش عارف يصدّق مين. `test-office-money.js` بيقارن
      الاتنين رقم برقم وبيقع لو اختلفوا.
   🔴 أي تعديل هنا لازم يتعمل في `sales/sales-app.js` كمان، والعكس.

   القاعدة (قرار المالك): يوم إجازة لكل أسبوع، الأسبوع سبت→جمعة،
   وكل أسبوع بيتحاسب لوحده. الأسبوع بيتحاسب في الشهر اللي بيخلص فيه.
   ============================================================ */
function ofWeekStartKey(d, startDow){
  const dow = d.getDay();
  const back = (dow - (Number(startDow) || 0) + 7) % 7;
  const s = new Date(d.getTime());
  s.setDate(s.getDate() - back);
  return s.getFullYear() + '-' + String(s.getMonth() + 1).padStart(2, '0')
    + '-' + String(s.getDate()).padStart(2, '0');
}
function ofShiftCountsAsDay(sh, minHours, graceMin){
  if(!sh) return false;
  const min = Number(minHours);
  if(!(min > 0)) return true;
  if(!sh.clockOutTs) return true;
  const mins = Math.round((Number(sh.clockOutTs) - Number(sh.clockInTs)) / 60000);
  const g = (graceMin == null) ? 15 : Number(graceMin);
  return mins >= Math.round(min * 60) - g;
}
function ofWeeklyOffBalance(emp, start, end, shifts, cfg, opts){
  cfg = cfg || {};
  const perWeek = Number(cfg.weekOffDays);
  const offPerWeek = isNaN(perWeek) ? 1 : perWeek;
  const startDow = (cfg.weekStartDow == null) ? 6 : Number(cfg.weekStartDow);
  const minHours = Number(cfg.minShiftHours) || 0;
  const graceMin = (cfg.minShiftGraceMin == null) ? 15 : Number(cfg.minShiftGraceMin);
  const live = !!(opts && opts.live);

  const realStart = new Date(start);
  const backDays = (realStart.getDay() - startDow + 7) % 7;
  const scanStart = new Date(realStart.getTime());
  scanStart.setDate(scanStart.getDate() - backDays);
  if(opts && opts.hardStart){
    const hs = new Date(opts.hardStart);
    if(scanStart < hs) scanStart.setTime(hs.getTime());
  }
  const dk = function(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0'); };

  const scanFrom = new Date(scanStart.getFullYear(), scanStart.getMonth(), scanStart.getDate()).getTime();
  const attended = {}, full = {};
  (shifts || []).forEach(function(sh){
    if(!sh || sh.employeeId !== emp.id) return;
    if(sh.clockInTs < scanFrom || sh.clockInTs > end.getTime()) return;
    const k = dk(new Date(sh.clockInTs));
    attended[k] = 1;
    if(ofShiftCountsAsDay(sh, minHours, graceMin)) full[k] = 1;
  });

  const weeks = {};
  const cur = new Date(scanStart.getTime()), endC = new Date(end);
  while(cur <= endC){
    const wk = ofWeekStartKey(cur, startDow);
    if(!weeks[wk]) weeks[wk] = { days: 0, attended: 0, full: 0 };
    weeks[wk].days++;
    const k = dk(cur);
    if(attended[k]) weeks[wk].attended++;
    if(full[k]) weeks[wk].full++;
    cur.setDate(cur.getDate() + 1);
  }

  let requiredDays = 0, attendedDays = 0, shortfallDays = 0, surplusDays = 0;
  const weekRows = [];
  const keys = Object.keys(weeks).sort();
  keys.forEach(function(k, i){
    const w = weeks[k];
    const complete = w.days >= 7;
    const deferred = (i === keys.length - 1) && !complete && !live;
    if(deferred){
      weekRows.push({ week: k, days: w.days, entitled: 0, required: 0,
                      attended: w.attended, full: w.full, complete: false,
                      deferred: true, shortfall: 0, surplus: 0 });
      return;
    }
    const entitled = Math.min(offPerWeek, w.days);
    const req = Math.max(0, w.days - entitled);
    const short = Math.max(0, req - w.attended);
    const extra = complete ? Math.max(0, w.full - req) : 0;
    requiredDays += req; attendedDays += w.attended;
    shortfallDays += short; surplusDays += extra;
    weekRows.push({ week: k, days: w.days, entitled: entitled, required: req,
                    attended: w.attended, full: w.full, complete: complete,
                    deferred: false, shortfall: short, surplus: extra });
  });
  return { requiredDays: requiredDays, attendedDays: attendedDays,
           shortfallDays: shortfallDays, surplusDays: surplusDays, weeks: weekRows };
}

function ofCountAttendedInRange(shifts, empId, start, end){
  const daySet = {};
  (shifts || []).filter(function(sh){ return sh.employeeId === empId && sh.clockInTs >= start.getTime() && sh.clockInTs <= end.getTime(); })
    .forEach(function(sh){
      const d = new Date(sh.clockInTs);
      daySet[d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate()] = 1;
    });
  return Object.keys(daySet).length;
}
function ofTcAmnestied(dateStr, cfg){
  const until = String((cfg && cfg.timeAmnestyUntil) || '').trim();
  const d = String(dateStr || '').trim();
  if(!until || !d) return false;   // بند من غير تاريخ **بيتحسب** — مش بيفلت بالعفو
  return d <= until;
}
function ofTcCounts(x, cfg){
  return !!x && !x.excused && !ofTcAmnestied(x.date, cfg);
}
function ofMonthlyTimeSummary(entries, cfg){
  cfg = cfg || {};
  const totalHours = (entries || []).reduce(function(x, e){ return x + (Number(e.hours) || 0); }, 0);
  const perDay = Number(cfg.hoursPerDay) || 8;
  let days = Math.floor(totalHours / perDay);
  const cap = Number(cfg.maxDaysPerMonth) || 0;
  if(cap > 0 && days > cap) days = cap;
  return { totalHours: totalHours, days: days };
}
function ofIsSetupShift(emp, shiftDefs){
  if(!emp) return false;
  const sh = shiftDefs ? shiftDefs[emp.shift] : null;
  return !!(sh && sh.noBonus) || emp.shift === 'setup';
}

function ofDateKey(d){
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function ofEffectiveDayOffKey(emp, dateKey, reqs){
  if(!emp || !dateKey) return '';
  const p = String(dateKey).slice(0,10).split('-').map(Number);
  if(p.length!==3 || p.some(function(n){ return !Number.isFinite(n); })) return '';
  const d = new Date(p[0],p[1]-1,p[2],12,0,0,0);
  const back = (d.getDay()-6+7)%7;
  const ws = new Date(d); ws.setDate(ws.getDate()-back);
  const we = new Date(ws); we.setDate(we.getDate()+6);
  const a=ofDateKey(ws), b=ofDateKey(we);
  const changes=(reqs||[]).filter(function(l){ return l && l.empId===emp.id && l.status==='approved' && l.type==='changeDayoff' && String(l.dateKey||'')>=a && String(l.dateKey||'')<=b; })
    .sort(function(x,y){ return (Number(x.decidedAt||x.approvedAt||x.ts)||0)-(Number(y.decidedAt||y.approvedAt||y.ts)||0); });
  if(changes.length) return String(changes[changes.length-1].dateKey||'').slice(0,10);
  if(emp.dayOff===undefined || emp.dayOff===null || emp.dayOff==='') return '';
  const off=new Date(ws); off.setDate(off.getDate()+((Number(emp.dayOff)-6+7)%7));
  return ofDateKey(off);
}
function ofApprovedLeaveFor(empId,dateKey,reqs){
  return (reqs||[]).find(function(l){ return l && l.empId===empId && l.status==='approved' && l.dateKey===dateKey; }) || null;
}
function ofPayrollAttendanceBalance(emp,start,end,shifts,reqs){
  const byDay={};
  (shifts||[]).forEach(function(sh){
    if(!sh || sh.employeeId!==emp.id || !sh.clockInTs || sh.clockInTs<start.getTime() || sh.clockInTs>end.getTime()) return;
    const k=ofDateKey(new Date(sh.clockInTs)); (byDay[k]=byDay[k]||[]).push(sh);
  });
  const absenceDates=[], dayOffDates=[], workedDayOffDates=[], incompleteShifts=[];
  let requiredDays=0, attendedDays=0, attendedWorkDays=0, workedDayOffMinutes=0;
  const cur=new Date(start.getFullYear(),start.getMonth(),start.getDate(),12), last=new Date(end.getFullYear(),end.getMonth(),end.getDate(),12);
  while(cur<=last){
    const key=ofDateKey(cur), arr=byDay[key]||[], came=arr.length>0;
    if(came) attendedDays++;
    let mins=0;
    arr.forEach(function(sh){
      if(sh.clockInTs && !sh.clockOutTs){ incompleteShifts.push({date:key,shiftId:sh.id||'',clockInTs:sh.clockInTs}); return; }
      if(Number(sh.clockOutTs)>Number(sh.clockInTs)) mins += Math.max(0,Math.round((Number(sh.clockOutTs)-Number(sh.clockInTs))/60000));
    });
    mins=Math.min(480,mins);
    const isOff=ofEffectiveDayOffKey(emp,key,reqs)===key;
    const leave=ofApprovedLeaveFor(emp.id,key,reqs);
    if(isOff){
      dayOffDates.push(key);
      if(came && mins>0){ workedDayOffMinutes+=mins; workedDayOffDates.push({date:key,minutes:mins}); }
    } else {
      requiredDays++;
      if(came) attendedWorkDays++;
      else absenceDates.push({date:key,approved:!!(leave&&leave.type==='dayoff')});
    }
    cur.setDate(cur.getDate()+1);
  }
  return { requiredDays:requiredDays, attendedDays:attendedDays, attendedWorkDays:attendedWorkDays,
    absenceDays:absenceDates.length, absenceDates:absenceDates, dayOffDays:dayOffDates.length, dayOffDates:dayOffDates,
    workedDayOffHours:Math.round(workedDayOffMinutes/60*100)/100, workedDayOffDates:workedDayOffDates,
    incompleteShifts:incompleteShifts };
}
function ofPayCycleKeyOfAdvance(a,payDay){
  if(!a) return '';
  let d=null;
  const ds=String(a.date||'');
  if(ds.length>=10){ const p=ds.slice(0,10).split('-').map(Number); if(p.length===3&&p.every(Number.isFinite)) d=new Date(p[0],p[1]-1,p[2],12); }
  if(!d && a.ts) d=new Date(a.ts);
  if(!d) return '';
  let y=d.getFullYear(), m=d.getMonth();
  if(Number(payDay)>0 && d.getDate()<=Number(payDay)){ m--; if(m<0){m=11;y--;} }
  return y+'-'+String(m+1).padStart(2,'0');
}

// المحرك — نفس computeSalary في sales سطر بسطر، والبيانات في data:
// data = { shifts, timeCredit, deductions, advances, timeCfg, shiftDefs }
function ofComputeSalary(emp, periodStart, end, data){
  data = data || {};
  const baseSalary = emp.baseSalary || 0;
  const dailyRate = baseSalary / 30;
  const hourlyRate = dailyRate / 8;
  const naturalMonthEnd = ofMonthDateRange(periodStart).end;
  let start = periodStart, notYetHired = false, isPartialPeriod = end < naturalMonthEnd;
  if(emp.hireDate){
    const h=new Date(emp.hireDate+'T00:00:00');
    if(h>end) notYetHired=true; else if(h>start){ start=h; isPartialPeriod=true; }
  }
  if(notYetHired) return { proratedBase:0,overtimeMinutes:0,overtimePay:0,dayOffOccurrences:0,extraOffDays:0,deductionAmount:0,timeCreditHours:0,timeCreditDays:0,timeCreditDeduction:0,adminDeductions:0,dayOffBonusDays:0,dayOffBonusHours:0,dayOffBonusAmount:0,advancesTotal:0,advCash:0,advOrders:0,netSalary:0,daysInCalc:0,attendedDays:0,elapsedWorkDays:0,absenceDays:0,absenceDates:[],dayOffDates:[],workedDayOffDates:[],incompleteShifts:[],notYetHired:true };
  let daysInCalc=0; for(let d=new Date(start.getFullYear(),start.getMonth(),start.getDate(),12),e=new Date(end.getFullYear(),end.getMonth(),end.getDate(),12);d<=e;d.setDate(d.getDate()+1)) daysInCalc++;
  daysInCalc=Math.max(1,daysInCalc);
  const proratedBase=isPartialPeriod?Math.round(dailyRate*daysInCalc*100)/100:baseSalary;
  const allShifts=data.shifts||[];
  const rangeShifts=allShifts.filter(function(sh){ return sh.employeeId===emp.id&&sh.clockInTs>=start.getTime()&&sh.clockInTs<=end.getTime(); });
  const overtimeMinutes=rangeShifts.reduce(function(sum,sh){ return sum+(sh.otRequiresApproval?(Number(sh.overtimeApprovedMin)||0):(Number(sh.overtimeMinutes)||0)); },0);
  const overtimePay=Math.round((overtimeMinutes/60)*hourlyRate*100)/100;
  let absenceRangeStart=start;
  if(emp.attendanceTrackingStart){ const t=new Date(emp.attendanceTrackingStart+'T00:00:00'); if(t>absenceRangeStart) absenceRangeStart=t; }
  const cfg=data.timeCfg||{};
  if(cfg.weeklyStartFloor){ const f=new Date(cfg.weeklyStartFloor+'T00:00:00'); if(f>absenceRangeStart) absenceRangeStart=f; }
  let elapsedEnd=new Date()<end?new Date():end;
  // Office للمتابعة فقط: اليوم الجاري لا يتحكم عليه غياب قبل ما يخلص.
  if(elapsedEnd<end){ const today=new Date(); elapsedEnd=new Date(today.getFullYear(),today.getMonth(),today.getDate()-1,23,59,59,999); }
  const att=elapsedEnd<absenceRangeStart?{requiredDays:0,attendedDays:0,attendedWorkDays:0,absenceDays:0,absenceDates:[],dayOffDays:0,dayOffDates:[],workedDayOffHours:0,workedDayOffDates:[],incompleteShifts:[]}:ofPayrollAttendanceBalance(emp,absenceRangeStart,elapsedEnd,allShifts,data.leaves||[]);
  const elapsedWorkDays=att.requiredDays, attendedDays=att.attendedDays, absenceDays=att.absenceDays;
  const dayOffOccurrences=att.dayOffDays, extraOffDays=absenceDays;
  const deductionAmount=Math.round(extraOffDays*dailyRate*100)/100;
  const dayOffBonusHours=att.workedDayOffHours;
  const dayOffBonusDays=Math.round(dayOffBonusHours/8*1000)/1000;
  const dayOffBonusAmount=Math.round(dayOffBonusHours*hourlyRate*100)/100;
  const tcEntries=(data.timeCredit||[]).filter(function(x){
    if(ofIsSetupShift(emp,data.shiftDefs)) return false;
    if(x.employeeId!==emp.id||!ofTcCounts(x,cfg)) return false;
    const t=new Date((x.date||'')+'T00:00:00').getTime(); return t>=start.getTime()&&t<=end.getTime();
  });
  const tcSummary=ofMonthlyTimeSummary(tcEntries,cfg);
  const timeCreditHours=tcSummary.totalHours,timeCreditDays=tcSummary.days;
  const timeCreditDeduction=Math.round(timeCreditDays*dailyRate*100)/100;
  const adminDeductions=(data.deductions||[]).filter(function(d){ const t=d.ts||new Date((d.date||'')+'T00:00:00').getTime(); return d.employeeId===emp.id&&t>=start.getTime()&&t<=end.getTime(); }).reduce(function(x,d){return x+(Number(d.amount)||0);},0);
  const full=end>=naturalMonthEnd;
  const payDay=Number(data.payDay)||6;
  const periodKey=ofMonthLabel(periodStart);
  const periodAdvances=(data.advances||[]).filter(function(a){
    if(a.employeeId!==emp.id) return false;
    if(full&&payDay>0) return ofPayCycleKeyOfAdvance(a,payDay)===periodKey;
    return a.ts>=start.getTime()&&a.ts<=end.getTime();
  });
  const advancesTotal=periodAdvances.reduce(function(sum,a){return sum+(Number(a.amount)||0);},0);
  const advCash=periodAdvances.filter(function(a){return String(a.source||'').indexOf('staff_order')!==0;}).reduce(function(x,a){return x+(Number(a.amount)||0);},0);
  const advOrders=Math.round((advancesTotal-advCash)*100)/100;
  const netSalary=Math.round((proratedBase-deductionAmount-timeCreditDeduction-adminDeductions+overtimePay+dayOffBonusAmount-advancesTotal)*100)/100;
  return { proratedBase:proratedBase,overtimeMinutes:overtimeMinutes,overtimePay:overtimePay,dayOffOccurrences:dayOffOccurrences,extraOffDays:extraOffDays,deductionAmount:deductionAmount,
    timeCreditHours:timeCreditHours,timeCreditDays:timeCreditDays,timeCreditDeduction:timeCreditDeduction,adminDeductions:adminDeductions,
    dayOffBonusDays:dayOffBonusDays,dayOffBonusHours:dayOffBonusHours,dayOffBonusAmount:dayOffBonusAmount,advancesTotal:advancesTotal,advCash:advCash,advOrders:advOrders,
    netSalary:netSalary,daysInCalc:daysInCalc,attendedDays:attendedDays,elapsedWorkDays:elapsedWorkDays,absenceDays:absenceDays,
    absenceDates:att.absenceDates,dayOffDates:att.dayOffDates,workedDayOffDates:att.workedDayOffDates,incompleteShifts:att.incompleteShifts,notYetHired:false };
}

// ⭐ عمولة النقط — نفس حساب لوحة sales: وزن الشهر − المدفوع (تنزيلات التطبيق
//    ليها نوعها المنفصل type='referrals' ومش بتتحسب هنا)
function ofCommissionCalc(points, payments, empId, startMs, endMs, monthLabel, rate){
  let pointsMonth = 0;
  (points || []).forEach(function(pp){
    if(!pp || pp.employeeId !== empId) return;
    if(!(pp.ts >= startMs && pp.ts <= endMs)) return;
    const v = Number(pp.value);
    pointsMonth += (isNaN(v) || v <= 0) ? 1 : v;
  });
  pointsMonth = Math.round(pointsMonth * 1000) / 1000;
  const paid = (payments || []).filter(function(pm){ return pm.employeeId === empId && pm.monthLabel === monthLabel && pm.type !== 'referrals'; });
  const pointsAlreadyPaid = paid.reduce(function(x, pm){ return x + (pm.pointsCount || 0); }, 0);
  const amountAlreadyPaid = paid.reduce(function(x, pm){ return x + (pm.commissionAmount || 0); }, 0);
  const newPoints = Math.max(0, Math.round((pointsMonth - pointsAlreadyPaid) * 1000) / 1000);
  const newAmount = Math.round(newPoints * (Number(rate) || 0) * 100) / 100;
  return { pointsMonth: pointsMonth, pointsAlreadyPaid: pointsAlreadyPaid,
           amountAlreadyPaid: amountAlreadyPaid, newPoints: newPoints, newAmount: newAmount };
}

// ------------------------------------------------------------
// 🩺 الإجراءات — **بنفس مستندات sales وبنفس الحقول بالظبط**
// ------------------------------------------------------------
// العذر مش مسح: بيصفّر hours ويحفظ originalHours ويعلّم excused —
// نفس اللي بيحصل من شاشة sales حرفيًا، فالمرتب والمكافأة بيشوفوه فورًا.
window.ofHubExcuse = async function(creditId, empId){
  const c = (_ofHub.credits || []).find(function(x){ return x.id === creditId; });
  if(!c || c.excused) return;
  const reason = prompt('سبب العذر؟ (هيظهر في كشف ' + (c.employeeName || 'الموظف') + ')', 'بعذر');
  if(reason === null) return;
  try{
    await db.collection('sales_time_credit').doc(creditId).update({
      hours: 0,
      originalHours: (c.originalHours != null ? c.originalHours : c.hours),
      excused: true, excuseReason: reason || 'بعذر',
      excusedAt: Date.now(), excusedFrom: 'office'
    });
    c.hours = 0; c.originalHours = (c.originalHours != null ? c.originalHours : c.hours);
    c.excused = true; c.excuseReason = reason || 'بعذر';
    window.ofHubSheet(empId);
  }catch(e){ alert('تعذر العذر: ' + (e && e.code ? e.code : e)); }
};

// ☕ قفل بريك مفتوح — نفس endBreak في sales: durationMin + overHours،
// والزيادة بتتسجّل رصيد وقت (اللي الأدمن يقدر يعذره بعدها من نفس الصفحة).
window.ofHubBreakClose = async function(breakId, empId){
  const b = (_ofHub.breaks || []).find(function(x){ return x.id === breakId; });
  if(!b || b.endTs) return;
  const emp = (D.employees || []).find(function(e){ return e && e.id === empId; }) || {};
  const cfg = await _ofBranchCfg(emp.branch || '');
  const durMin = Math.round((Date.now() - b.startTs) / 60000);
  const overHours = ofBreakOverHours(durMin, cfg.timeCfg);
  if(!confirm('☕ قفل بريك ' + (emp.name || '') + ' (' + durMin + ' دقيقة)؟'
    + (overHours > 0 ? ('\n\n⚠️ فيه زيادة هتتسجل ' + overHours + ' ساعة رصيد (تقدر تعذرها بعدها).') : '\n\nمفيش زيادة.'))) return;
  try{
    await db.collection('sales_breaks').doc(breakId).update({
      endTs: Date.now(), durationMin: durMin, overHours: overHours, closedFrom: 'office'
    });
    if(overHours > 0){
      const dp = _ofShopParts(Date.now());
      await db.collection('sales_time_credit').add({
        employeeId: empId, employeeName: emp.name || b.employeeName || '',
        branch: emp.branch || '', type: 'break', hours: overHours,
        date: dp.y + '-' + String(dp.m).padStart(2, '0') + '-' + String(dp.d).padStart(2, '0'),
        note: 'بريك ' + durMin + ' دقيقة (اتقفل من office)', ts: Date.now()
      });
    }
    _ofHubLoad(true);
    setTimeout(function(){ window.ofHubSheet(empId); }, 400);
  }catch(e){ alert('تعذر القفل: ' + (e && e.code ? e.code : e)); }
};

// 🚪 قفل شيفت منسي — **نفس حساب وحقول graceCloseShift في sales**:
// الانصراف = نهاية شيفته الرسمية مش دلوقتي · مفيش وقت إضافي · مفيش خصم بدري.
window.ofHubGraceClose = async function(shiftId, empId){
  const sh = _ofHubShifts().find(function(x){ return x.id === shiftId; });
  if(!sh){ alert('مش لاقي الشيفت ده'); return; }
  if(sh.clockOutTs){ alert('الشيفت ده مقفول خلاص'); return; }
  const emp = (D.employees || []).find(function(e){ return e && e.id === empId; }) || {};
  const cfg = await _ofBranchCfg(emp.branch || '');
  const endTs = ofGraceCloseTs(sh, emp, cfg.shifts);
  const tTxt = new Date(endTs).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  if(!confirm('🚪 قفل شيفت ' + (emp.name || 'الموظف') + '؟\n\n'
    + 'الانصراف هيتسجل الساعة ' + tTxt + ' (نهاية شيفته الرسمية) — مش وقت دلوقتي.\n'
    + 'مفيش وقت إضافي ومفيش خصم انصراف بدري.')) return;
  try{
    await db.collection('sales_shifts').doc(shiftId).update({
      clockOutTs: endTs,
      overtimeMinutes: 0,
      earlyMin: 0, earlyHours: 0,
      autoClosedBy: 'grace_day', autoClosedAt: Date.now(), autoClosedFrom: 'office'
    });
    _ofHubLoad(true);
    setTimeout(function(){ window.ofHubSheet(empId); }, 400);
  }catch(e){ alert('تعذر القفل: ' + (e && e.code ? e.code : e)); }
};

// ------------------------------------------------------------
// 💰 تحميل بيانات الفلوس — عند فتح قسم الفلوس بس (مش مع كل صفحة)
// استعلامات بالمساواة على الموظف (مفيش فهارس مركبة مطلوبة) + شيفتات
// ونقط الشهر مشتركين بكاش دقيقتين.
// ------------------------------------------------------------
let _ofMoney = { at: 0, monthShifts: [], monthPts: [] };
let _ofMoneyEmp = {};   // { empId: { at, credits, deductions, advances, salPays, commPays } }

async function _ofMoneyLoad(emp){
  const salR = ofMonthDateRange(new Date());
  const fresh = (Date.now() - _ofMoney.at) < 2 * 60 * 1000;
  const jobs = [];
  if(!fresh){
    jobs.push(db.collection('sales_shifts').where('clockInTs', '>=', salR.start.getTime()).get()
      .then(function(r){ _ofMoney.monthShifts = r.docs.map(function(x){ return Object.assign({ id: x.id }, x.data()); }); }));
    jobs.push(db.collection('sales_points').where('ts', '>=', salR.start.getTime()).get()
      .then(function(r){ _ofMoney.monthPts = r.docs.map(function(x){ return Object.assign({ id: x.id }, x.data()); }); }));
  }
  const ec = _ofMoneyEmp[emp.id];
  if(!ec || (Date.now() - ec.at) >= 2 * 60 * 1000){
    const q = function(col){ return db.collection(col).where('employeeId', '==', emp.id).get()
      .then(function(r){ return r.docs.map(function(x){ return Object.assign({ id: x.id }, x.data()); }); }); };
    jobs.push(Promise.all([
      q('sales_time_credit'), q('sales_deductions'), q('sales_advances'),
      q('sales_salary_payments'), q('sales_commission_payments'),
      q('sales_leave_requests')
    ]).then(function(rs){
      _ofMoneyEmp[emp.id] = { at: Date.now(), credits: rs[0], deductions: rs[1],
                              advances: rs[2], salPays: rs[3], commPays: rs[4], leaves: rs[5] };
    }));
  }
  await Promise.all(jobs);
  if(!fresh) _ofMoney.at = Date.now();
  return _ofMoneyEmp[emp.id];
}

// 💰 قسم الفلوس جوه صفحة الموظف
window.ofHubMoney = async function(empId){
  const box = document.getElementById('ofHubMoneyBox');
  if(box) box.innerHTML = '<div style="color:var(--sub); font-size:12px; padding:8px 0;">بيحسب…</div>';
  const emp = (D.employees || []).find(function(e){ return e && e.id === empId; });
  if(!emp) return;
  let ec, cfg;
  try{
    const rs = await Promise.all([ _ofMoneyLoad(emp), _ofBranchCfg(emp.branch || '') ]);
    ec = rs[0]; cfg = rs[1];
  }catch(e){
    if(box) box.innerHTML = '<div style="color:var(--minus); font-size:12px;">تعذر التحميل: ' + esc(e && e.code || e) + '</div>';
    return;
  }
  let rate = 0;
  try{
    const sd = await db.collection('sales_settings').doc(emp.branch || '').get();
    rate = (sd.exists && (sd.data() || {}).commissionPerPoint) || 0;
  }catch(e){}

  const now = new Date();
  const salR = ofMonthDateRange(now);
  const comR = ofMonthRange(now);
  const label = ofMonthLabel(now);

  // ⭐ العمولة
  const cm = ofCommissionCalc(_ofMoney.monthPts, ec.commPays, empId,
    comR.start.getTime(), comR.end.getTime(), label, rate);
  const _fp = function(n){ return (n % 1 === 0) ? String(n) : n.toFixed(1); };
  let ch = '<div style="font-weight:800; font-size:13px; margin-top:4px;">⭐ عمولة النقط (شهر ' + label + ')</div>'
    + '<div style="font-size:12px; color:var(--sub); margin-top:3px;">نقط الشهر: <b>' + _fp(cm.pointsMonth) + '</b>'
    + ' · السعر: ' + egp(rate) + '/نقطة'
    + (cm.amountAlreadyPaid > 0 ? (' · اتدفع قبل كده: ' + egp(cm.amountAlreadyPaid) + ' (' + _fp(cm.pointsAlreadyPaid) + ' نقطة)') : '') + '</div>';
  ch += (cm.newPoints > 0 && rate > 0)
    ? '<button onclick="ofHubPayComm(\'' + esc(empId) + '\',' + cm.newPoints + ',' + cm.newAmount + ',\'' + label + '\')" style="margin-top:6px; background:#166534; color:#fff; border:none; border-radius:10px; padding:8px 12px; font-size:12.5px; font-weight:700; cursor:pointer;">✅ ادفع ' + egp(cm.newAmount) + ' (' + _fp(cm.newPoints) + ' نقطة جديدة)</button>'
    : '<div style="font-size:11.5px; color:var(--good); margin-top:4px;">' + (rate > 0 ? '✅ كل النقط لحد دلوقتي مدفوعة' : '⚠️ سعر النقطة مش متظبط للفرع (من sales)') + '</div>';

  // 💵 المرتب — نفس محرك sales على بيانات حقيقية
  const calc = ofComputeSalary(emp, salR.start, salR.end, {
    shifts: _ofMoney.monthShifts, timeCredit: ec.credits, deductions: ec.deductions,
    advances: ec.advances, leaves: ec.leaves, timeCfg: cfg.timeCfg, shiftDefs: cfg.shifts,
    payDay: cfg.payDay
  });
  const row = function(l, v, color){ return '<div style="display:flex; justify-content:space-between; font-size:12px; padding:3px 0;' + (color ? ' color:' + color + ';' : '') + '"><span>' + l + '</span><b>' + v + '</b></div>'; };
  let sh = '<div style="font-weight:800; font-size:13px; margin-top:12px; padding-top:8px; border-top:1px solid var(--line);">💵 المرتب (فترة ' + label + ')</div>';
  if(calc.notYetHired){
    sh += '<div style="font-size:12px; color:var(--sub); margin-top:4px;">اتعين بعد الفترة دي</div>';
  } else {
    sh += '<div style="margin-top:4px;">'
      + row('الراتب الأساسي المتفق عليه', egp(calc.baseSalary))
      + (calc.proratedBase !== calc.baseSalary ? row('استحقاق الأساسي للفترة (' + calc.daysInCalc + ' يوم)', egp(calc.proratedBase)) : '')
      + (calc.overtimePay > 0 ? row('إضافي (' + calc.overtimeMinutes + 'د)', '+' + egp(calc.overtimePay), '#4ade80') : '')
      + (calc.dayOffBonusAmount > 0 ? row('شغل يوم الإجازة (' + (calc.dayOffBonusHours || 0) + ' ساعة)', '+' + egp(calc.dayOffBonusAmount), '#4ade80') : '')
      + (calc.deductionAmount > 0 ? row('خصم غياب (' + calc.extraOffDays + ' يوم)', '−' + egp(calc.deductionAmount), '#f87171') : '')
      + (calc.timeCreditDeduction > 0 ? row('⏳ رصيد الوقت (' + calc.timeCreditHours + ' ساعة = ' + calc.timeCreditDays + ' يوم)', '−' + egp(calc.timeCreditDeduction), '#f87171') : '')
      + (calc.adminDeductions > 0 ? row('خصومات إدارية', '−' + egp(calc.adminDeductions), '#f87171') : '')
      + (calc.advancesTotal > 0 ? row('سلف' + (calc.advOrders > 0 ? ' (كاش ' + calc.advCash + ' · أوردرات ' + calc.advOrders + ')' : ''), '−' + egp(calc.advancesTotal), '#f87171') : '')
      + '<div style="display:flex; justify-content:space-between; font-size:13.5px; font-weight:900; padding:6px 0; margin-top:4px; border-top:1px solid var(--line);"><span>الصافي</span><span style="color:#4ade80;">' + egp(calc.netSalary) + '</span></div></div>';
    const prev = (ec.salPays || []).filter(function(pm){ return pm.periodLabel === label; });
    if(prev.length){
      const pSum = prev.reduce(function(n, pm){ return n + (pm.amount || 0); }, 0);
      sh += '<div style="font-size:11.5px; color:#fbbf24; margin-top:2px;">⚠️ متسجل صرف للشهر ده قبل كده: ' + egp(pSum) + '</div>';
    }
    if(calc.incompleteShifts && calc.incompleteShifts.length){
      sh += '<div style="font-size:11.5px; color:#f87171; margin-top:5px;">⛔ يوجد شيفت مفتوح/ناقص Clock-out — راجعه قبل صرف المرتب.</div>';
    } else if(!prev.length){
      sh += '<button onclick="ofHubPaySalary(\'' + esc(empId) + '\',' + calc.netSalary + ',\'' + label + '\')" style="margin-top:6px; background:#1d4ed8; color:#fff; border:none; border-radius:10px; padding:8px 12px; font-size:12.5px; font-weight:700; cursor:pointer;">✅ تسجيل صرف المرتب</button>';
    }
  }

  // 🗂️ سجل المدفوعات (آخر 8)
  const logs = (ec.salPays || []).map(function(pm){ return { t: pm.paidAt || 0, txt: '💵 مرتب ' + (pm.periodLabel || '') + ' — ' + egp(pm.amount || 0) }; })
    .concat((ec.commPays || []).map(function(pm){ return { t: pm.paidAt || 0, txt: (pm.type === 'referrals' ? '📱 تنزيلات ' : (pm.type === 'target' ? '🎯 تارجت ' : '⭐ عمولة ')) + (pm.monthLabel || '') + ' — ' + egp(pm.commissionAmount || 0) }; }))
    .sort(function(a, b){ return b.t - a.t; }).slice(0, 8);
  let lh = '';
  if(logs.length){
    lh = '<div style="font-weight:800; font-size:13px; margin-top:12px; padding-top:8px; border-top:1px solid var(--line);">🗂️ سجل المدفوعات</div>'
      + logs.map(function(x){
          return '<div style="font-size:11.5px; color:var(--sub); padding:3px 0;">' + x.txt
            + (x.t ? (' · ' + new Date(x.t).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })) : '') + '</div>';
        }).join('');
  }
  if(box) box.innerHTML = ch + sh + lh;
};

let _ofPayBusy = false;   // 🛡️ ضغطتين ورا بعض = صرفتين
window.ofHubPayComm = async function(empId, pts, amount, label){
  if(_ofPayBusy) return;
  const emp = (D.employees || []).find(function(e){ return e && e.id === empId; });
  if(!emp) return;
  if(!confirm('تأكيد دفع ' + amount + ' ج.م لـ ' + (emp.name || '') + ' عن ' + pts + ' نقطة جديدة (شهر ' + label + ')؟')) return;
  _ofPayBusy = true;
  try{
    // نفس حقول sales بالظبط — الشاشتين بيقروا نفس السجل
    await db.collection('sales_commission_payments').add({
      employeeId: emp.id, employeeName: emp.name, branch: emp.branch,
      monthLabel: label, pointsCount: pts, commissionAmount: amount,
      paidAt: Date.now(), paidFrom: 'office'
    });
    delete _ofMoneyEmp[empId];
    window.ofHubMoney(empId);
  }catch(e){ alert('حصل خطأ: ' + (e && e.code ? e.code : e)); }
  _ofPayBusy = false;
};

window.ofHubPaySalary = async function(empId, amount, label){
  if(_ofPayBusy) return;
  const emp = (D.employees || []).find(function(e){ return e && e.id === empId; });
  if(!emp) return;
  const ec = _ofMoneyEmp[empId] || {};

  // ⛔ لا صرف مرتين لنفس الموظف/الشهر — مفيش confirm يسمح بتجاوز الحارس.
  const prev = (ec.salPays || []).filter(function(pm){ return pm.employeeId === empId && pm.periodLabel === label; });
  if(prev.length){
    alert('المرتب ده متسجل صرفه بالفعل عن شهر ' + label + '. أي فرق لاحق يتسجل كتسوية منفصلة.');
    return;
  }

  // ⛔ الشيفت المفتوح يمنع إقفال المرتب من Office برضه — نفس سياسة sales.
  try{
    const cfg = await _ofBranchCfg(emp.branch || '');
    const salR = ofMonthDateRange(new Date());
    const calc = ofComputeSalary(emp, salR.start, salR.end, {
      shifts: _ofMoney.monthShifts || [], timeCredit: ec.credits || [], deductions: ec.deductions || [],
      advances: ec.advances || [], leaves: ec.leaves || [], timeCfg: cfg.timeCfg, shiftDefs: cfg.shifts,
      payDay: cfg.payDay
    });
    if(calc.incompleteShifts && calc.incompleteShifts.length){
      alert('لا يمكن صرف المرتب: يوجد شيفت مفتوح/ناقص Clock-out. راجعه الأول.');
      return;
    }
  }catch(e){
    alert('تعذر مراجعة الشيفتات قبل الصرف. جرّب تاني.');
    return;
  }

  if(!confirm('تأكيد صرف ' + amount + ' ج.م لـ ' + (emp.name || '') + ' عن شهر ' + label + '؟')) return;
  _ofPayBusy = true;
  try{
    const safeEmp = String(emp.id || '').replace(/[^A-Za-z0-9_-]/g, '_');
    const safePeriod = String(label || '').replace(/[^A-Za-z0-9_-]/g, '_');
    const payRef = db.collection('sales_salary_payments').doc(safeEmp + '_' + safePeriod);
    await db.runTransaction(async function(tx){
      const snap = await tx.get(payRef);
      if(snap.exists) throw new Error('__SALARY_ALREADY_PAID__');
      tx.set(payRef, {
        employeeId: emp.id, employeeName: emp.name, branch: emp.branch,
        periodLabel: label, amount: amount, paidAt: Date.now(), paidFrom: 'office'
      });
    });
    delete _ofMoneyEmp[empId];
    window.ofHubMoney(empId);
  }catch(e){
    if(e && e.message === '__SALARY_ALREADY_PAID__') alert('المرتب ده اتصرف بالفعل — مش هيتسجل مرتين.');
    else alert('حصل خطأ: ' + (e && e.code ? e.code : e));
  }
  _ofPayBusy = false;
};

window.ofRenderPresent = ofRenderPresent;
window.ofHubRows = ofHubRows;
window.ofHubPoints = ofHubPoints;
window.ofGraceCloseTs = ofGraceCloseTs;
window.ofComputeSalary = ofComputeSalary;
window.ofCommissionCalc = ofCommissionCalc;
window.ofMonthlyTimeSummary = ofMonthlyTimeSummary;
window.ofBreakOverHours = ofBreakOverHours;
window.ofHubCredits = ofHubCredits;

// تحديث المدة كل دقيقة — والتطبيق في المقدمة بس
setInterval(function(){
  if(document.hidden) return;
  try{ ofRenderPresent(); }catch(e){}
}, 60000);

// ---- 💵 ملخص الدفع ----
function ofRenderPay(){
  const el = $('#dayPay'); if(!el) return;
  const S = _ofDaySales;
  if(!S.length){ el.innerHTML = '<div class="card" style="text-align:center; color:var(--sub);">مفيش فواتير في اليوم ده</div>'; return; }
  let cash=0, visa=0, insta=0, salary=0, total=0;
  let retCount=0, revCount=0, changeGiven=0;
  S.forEach(function(s){
    const p = s.payments || {};
    cash += (p.cash||0); visa += (p.visa||0); insta += (p.instapay||0); salary += (p.salary||0);
    total += (s.total||0);
    if((s.total||0) < 0) retCount++;
    if(s.reversed) revCount++;
    changeGiven += (s.changeGiven||0);
  });
  const row = function(lbl, val, col){
    return '<div style="display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid var(--line);">'
      + '<span>' + lbl + '</span><b style="color:' + (col||'var(--txt)') + ';">' + ofMoney(val) + ' ج.م</b></div>';
  };
  el.innerHTML = '<div class="card">'
    + '<div style="font-weight:900; margin-bottom:6px;">💵 ملخص الدفع</div>'
    + row('كاش', cash) + row('فيزا', visa) + row('انستا باي', insta)
    + row('خصم من الراتب', salary)
    + '<div style="display:flex; justify-content:space-between; padding:9px 0; margin-top:4px; border-top:2px solid var(--line);">'
    + '<b>إجمالي المبيعات</b><b style="color:var(--gold);">' + ofMoney(total) + ' ج.م</b></div>'
    + '<div style="font-size:11px; color:var(--sub); margin-top:8px;">'
    + S.length + ' فاتورة'
    + (retCount ? ' · ' + retCount + ' مرتجع' : '')
    + (revCount ? ' · ' + revCount + ' معكوسة' : '')
    + (changeGiven ? ' · فكة اتردت ' + ofMoney(changeGiven) + ' ج.م' : '')
    + '</div>'
    + '<div style="font-size:11px; color:var(--sub); margin-top:6px; line-height:1.7;">'
    + '⚠️ الأرقام دي بمنطق التقفيل بالظبط: الفاتورة المعكوسة وفاتورة العكس '
    + 'محسوبين مع بعض (بيلغوا بعض)، فالمجموع بيطابق اللي الكاشير شايفاه.'
    + '</div></div>';
}

// ⭐ تقييم العميلة تحت سطر الفاتورة
// ⚠️ `note` كلام مكتوب من العميلة من تطبيق الولاء — بيتهرّب بـesc قبل العرض.
function ofSaleRating(s){
  const rt = _ofRatingBySale[s.id];
  if(!rt) return '';
  const hue = OF_RATING_HUE[rt.r] || 'var(--sub)';
  return '<div style="margin-top:5px; font-size:11px; color:' + hue + '; font-weight:800;">'
    + (OF_RATING_ICON[rt.r] || '') + ' تقييم العميلة: ' + rt.r + '/4'
    + (rt.note
        ? '</div><div style="margin-top:3px; font-size:11.5px; color:var(--sub); line-height:1.6; white-space:pre-wrap;">📝 '
          + esc(rt.note) + '</div>'
        : '</div>');
}

// ---- 🧾 سجل المبيعات ----
function ofRenderSales(){
  const el = $('#daySales'); if(!el) return;
  const S = _ofDaySales;
  if(!S.length){ el.innerHTML = '<div class="card" style="text-align:center; color:var(--sub);">مفيش فواتير</div>'; return; }
  const PAY = { cash:'كاش', visa:'فيزا', instapay:'انستا', salary:'راتب' };
  const rows = S.map(function(s){
    const t = ofSaleTs(s);
    const p = s.payments || {};
    const ways = Object.keys(PAY).filter(function(k){ return Math.abs(p[k]||0) > 0.005; })
      .map(function(k){ return PAY[k]; }).join(' + ') || '—';
    const isRet = (s.total||0) < 0;
    const tag = s.reversed ? '<span style="color:var(--minus); font-size:10px;"> · معكوسة</span>'
              : (isRet ? '<span style="color:var(--minus); font-size:10px;"> · مرتجع</span>' : '');
    const items = (s.items||[]).length;
    return '<div style="display:flex; justify-content:space-between; align-items:flex-start; padding:8px 0; border-bottom:1px solid var(--line);">'
      + '<div style="min-width:0;">'
      +   '<div style="font-weight:800;">' + ofTime(t) + tag + '</div>'
      +   '<div style="font-size:11px; color:var(--sub);">'
      +     esc(s.employeeName || s.cashierName || '—')
      +     ' · ' + ways + ' · ' + items + ' صنف'
      +     (s.invoiceCode ? (' · ' + esc(s.invoiceCode)) : '')
      +   '</div>'
      +   ofSaleRating(s)
      + '</div>'
      + '<b style="white-space:nowrap; color:' + (isRet ? 'var(--minus)' : 'var(--txt)') + ';">'
      +   ofMoney(s.total) + ' ج.م</b>'
      + '</div>';
  }).join('');
  el.innerHTML = '<div class="card"><div style="font-weight:900; margin-bottom:4px;">🧾 سجل المبيعات ('
    + S.length + ')</div>' + rows + '</div>';
}

// ---- 📦 ملخص الأصناف ----
function ofRenderItems(){
  const el = $('#dayItems'); if(!el) return;
  const S = _ofDaySales;
  if(!S.length){ el.innerHTML = '<div class="card" style="text-align:center; color:var(--sub);">مفيش أصناف</div>'; return; }
  const map = {};
  S.forEach(function(s){
    // ⚠️ الفاتورة المعكوسة وفاتورة العكس **بيتستبعدوا الطرفين** — ده تقرير
    //    أصناف مش تقفيل، والمنتج اللي اتباع واترد مايتحسبش مرتين.
    if(s.reversed || s.isReversal) return;
    (s.items||[]).forEach(function(it){
      if(!it || it.isRedemption || it.isRewardDiscount) return;
      const k = it.id || it.barcode || it.name;
      if(!k) return;
      const q = (it.qty||0) * (it.isReturn ? -1 : 1);
      const m = map[k] || (map[k] = { name: it.name||'—', qty:0, rev:0, cost:0 });
      m.qty += q;
      m.rev += q * (it.price||0);
      m.cost += q * (it.cost||0);
    });
  });
  const arr = Object.keys(map).map(function(k){ return map[k]; })
    .filter(function(m){ return m.qty !== 0; })
    .sort(function(a,b){ return b.rev - a.rev; });
  if(!arr.length){ el.innerHTML = '<div class="card" style="text-align:center; color:var(--sub);">مفيش أصناف</div>'; return; }
  const totQ = arr.reduce(function(n,m){ return n + m.qty; }, 0);
  const totR = arr.reduce(function(n,m){ return n + m.rev; }, 0);
  const totC = arr.reduce(function(n,m){ return n + m.cost; }, 0);
  const rows = arr.map(function(m){
    const profit = m.rev - m.cost;
    return '<div style="display:flex; justify-content:space-between; align-items:flex-start; padding:7px 0; border-bottom:1px solid var(--line);">'
      + '<div style="min-width:0;"><div style="font-weight:700;">' + esc(m.name) + '</div>'
      + '<div style="font-size:11px; color:var(--sub);">' + ofNum(m.qty) + ' قطعة'
      + (m.cost ? (' · ربح ' + ofMoney(profit) + ' ج.م') : '') + '</div></div>'
      + '<b style="white-space:nowrap;">' + ofMoney(m.rev) + ' ج.م</b></div>';
  }).join('');
  el.innerHTML = '<div class="card">'
    + '<div style="font-weight:900; margin-bottom:4px;">📦 ملخص الأصناف (' + arr.length + ' صنف)</div>'
    + rows
    + '<div style="display:flex; justify-content:space-between; padding:9px 0; border-top:2px solid var(--line); margin-top:4px;">'
    + '<b>' + ofNum(totQ) + ' قطعة</b><b style="color:var(--gold);">' + ofMoney(totR) + ' ج.م</b></div>'
    + (totC ? ('<div style="text-align:left; font-size:12px; color:var(--plus); font-weight:800;">ربح: '
        + ofMoney(totR - totC) + ' ج.م</div>') : '')
    + '<div style="font-size:11px; color:var(--sub); margin-top:8px;">'
    + '⚠️ الفواتير المعكوسة مستبعدة من الطرفين هنا — عشان الصنف مايتعدّش مرتين. '
    + 'عشان كده الإجمالي هنا ممكن يفرق عن ملخص الدفع.</div>'
    + '</div>';
}

// ---- الربط ----
function ofWireDay(){
  const bs = $('#dayBranch'), dd = $('#dayDate');
  if(!bs || !dd) return;
  if(!dd.value){
    const p = _ofShopParts(Date.now());
    // قبل الساعة الفاصلة = لسه في يوم أمس
    let ms = Date.now();
    if(p.hh < _ofDayCut) ms -= 24 * 3600 * 1000;
    const q = _ofShopParts(ms);
    dd.value = q.y + '-' + String(q.m).padStart(2,'0') + '-' + String(q.d).padStart(2,'0');
  }
  const set = {};
  (D.employees||[]).forEach(function(e){ if(e.branch) set[e.branch] = 1; });
  const brs = Object.keys(set).sort();
  if(brs.length && !bs.options.length){
    bs.innerHTML = brs.map(function(b){ return '<option value="'+esc(b)+'">'+esc(b)+'</option>'; }).join('');
  }
  bs.onchange = ofLoadDay;
  dd.onchange = ofLoadDay;
  document.querySelectorAll('.dayNav').forEach(function(b){
    b.onclick = function(){
      const d = Number(b.dataset.d);
      if(d === 0){
        const p = _ofShopParts(Date.now());
        let ms = Date.now(); if(p.hh < _ofDayCut) ms -= 24*3600*1000;
        const q = _ofShopParts(ms);
        dd.value = q.y + '-' + String(q.m).padStart(2,'0') + '-' + String(q.d).padStart(2,'0');
      } else {
        const [y,m,dy] = dd.value.split('-').map(Number);
        const nx = new Date(Date.UTC(y, m-1, dy + d));
        dd.value = nx.toISOString().slice(0,10);
      }
      ofLoadDay();
    };
  });
  document.querySelectorAll('.daySub').forEach(function(b){
    b.onclick = function(){
      _ofDaySub = b.dataset.s;
      document.querySelectorAll('.daySub').forEach(function(x){ x.classList.remove('on'); });
      b.classList.add('on');
      $('#dayPay').style.display   = (_ofDaySub === 'pay')   ? '' : 'none';
      $('#daySales').style.display = (_ofDaySub === 'sales') ? '' : 'none';
      $('#dayItems').style.display = (_ofDaySub === 'items') ? '' : 'none';
    };
  });
  ofLoadDay();
}
window.ofLoadDay = ofLoadDay;

// ============================================================
// ✅ التاسك الأسبوعي
// ------------------------------------------------------------
// ⚠️ النظام القديم: `sales_tasks/{رقم الموظفة}` — مستند واحد لكل موظفة،
//    فأي تاسك جديد **بيمسح القديم**. مفيش أسبوع ولا حالة ولا تاريخ.
// 🔑 الحل من غير ما نكسر تطبيق الحضور:
//    · `sales_tasks/{empId}` بيفضل زي ما هو (ده اللي الحضور بيقراه) + حقول
//      زيادة (weekKey · assignedBy · assignedAt) — إضافة مش تغيير.
//    · `sales_task_weeks/{empId}__{weekKey}` مستند لكل أسبوع = التاريخ الكامل.
//    تطبيق الحضور محتاج `employeeId` و`taskDescription` و`branch` بس — وكلهم
//    باقيين بنفس الأسماء والمعنى.
// 📅 الأسبوع بيبدأ **السبت** (أسبوع الشغل في مصر). لو عايزها تبدأ يوم تاني،
//    غيّر OF_WEEK_START بس — والنطاق ظاهر على الشاشة عشان تتأكد بعينك.
// ============================================================
const OF_WEEK_START = 6;      // 0=الأحد … 6=السبت
let _tkOffset = 0;            // 0 = الأسبوع ده · -1 اللي فات · +1 اللي جاي
let _tkWeeks = {};            // {empId__weekKey: doc}
let _tkSubs = [];             // تسليمات التاسكات (فيها id عشان القبول/الرفض)
let _tkSubsErr = '';          // سبب فشل قراءة التسليمات (لو حصل) — الشاشة بتفضل شغالة
let _tkLive = {};             // sales_tasks/{empId} — التاسك المتحدد من تطبيق الحضور
let _tkBr = '', _tkWk = '';   // الفرع والأسبوع المعروضين حاليًا

function ofWeekStartMs(offset){
  // 🕕 بيوم الشغل مش اليوم التقويمي: الساعة 2 فجرًا يوم السبت لسه **يوم
  //    الجمعة** شغلًا، والكاشير اللي في الشيفت ده لازم تشوف تاسك الأسبوع
  //    اللي فات مش الجديد. نفس الفاصلة اللي بيمشي عليها التقفيل والتقارير.
  let ms = Date.now();
  if(_ofShopParts(ms).hh < _ofDayCut) ms -= 86400000;
  const p = _ofShopParts(ms);
  const todayUTC = Date.UTC(p.y, p.m - 1, p.d);
  const dow = new Date(todayUTC).getUTCDay();
  const back = (dow - OF_WEEK_START + 7) % 7;
  return todayUTC - back * 86400000 + (Number(offset) || 0) * 7 * 86400000;
}
function ofWeekKey(ms){
  const d = new Date(ms);
  return 'w' + d.getUTCFullYear() + '-'
    + String(d.getUTCMonth() + 1).padStart(2,'0') + '-'
    + String(d.getUTCDate()).padStart(2,'0');
}
function ofWeekLabel(ms){
  const a = new Date(ms), b = new Date(ms + 6 * 86400000);
  const f = function(x){ return x.getUTCDate() + '/' + (x.getUTCMonth() + 1); };
  return f(a) + ' → ' + f(b);
}

async function ofLoadTasks(){
  const br = ($('#tkBranch') || {}).value || '';
  const list = $('#tkList');
  if(!br || !list) return;
  const wkMs = ofWeekStartMs(_tkOffset);
  const wk = ofWeekKey(wkMs);
  const rg = $('#tkRange');
  if(rg) rg.textContent = 'الأسبوع: ' + ofWeekLabel(wkMs)
    + (_tkOffset === 0 ? ' (الحالي)' : '');
  list.innerHTML = '<div class="card" style="text-align:center; color:var(--sub);">بيحمّل…</div>';
  // 🔴 الباج: الاستعلامين كانوا مع بعض في Promise.all — فأي فشل في **التسليمات**
  //    (صلاحيات أو index) كان بيقتل الشاشة كلها. والغريب إنها كانت تشتغل عادي
  //    لما مافيش تسليمات: Firestore بيرفض الاستعلام وقت ما يلاقي مستند ممنوع بس.
  //    دلوقتي كل استعلام لوحده — التاسكات بتشتغل حتى لو التسليمات فشلت.
  try{
    const wSnap = await db.collection('sales_task_weeks')
      .where('branch','==', br).where('weekKey','==', wk).get();
    _tkWeeks = {};
    wSnap.docs.forEach(function(d){ _tkWeeks[d.id] = d.data(); });
  }catch(e){
    console.warn('tasks load', e);
    list.innerHTML = '<div class="card" style="color:var(--minus);">تعذر التحميل: '
      + esc(e.code || e.message) + '<div style="font-size:11px; color:var(--sub); margin-top:6px;">'
      + 'لو الرسالة بتقول index، افتح اللينك اللي في الكونسول مرة واحدة.</div></div>';
    return;
  }
  _tkSubs = []; _tkSubsErr = '';
  try{
    const sSnap = await db.collection('sales_task_submissions').where('branch','==', br)
      .where('submittedAt','>=', wkMs).where('submittedAt','<', wkMs + 7 * 86400000).get();
    // 🔑 الـid لازم يتحفظ — من غيره مفيش قبول ولا رفض (update محتاج المستند)
    _tkSubs = sSnap.docs.map(function(d){ const o = d.data() || {}; o.id = d.id; return o; });
  }catch(e){
    console.warn('subs load', e);
    _tkSubsErr = String(e.code || e.message || 'خطأ');
  }
  // 🔴 التاسك المتحدد من **تطبيق الحضور** كان بيتكتب في `sales_tasks` بس —
  //    من غير `weekKey` ومن غير مستند أسبوع. يعني Office (اللي بيقرا
  //    `sales_task_weeks`) مكانش بيشوفه خالص والخانة تفضل فاضية.
  //    بنقراه هنا كمصدر احتياطي للأسبوع الحالي. استعلام مساواة واحدة =
  //    مش محتاج index.
  _tkLive = {};
  try{
    const lSnap = await db.collection('sales_tasks').where('branch','==', br).get();
    lSnap.docs.forEach(function(d){ const o = d.data() || {}; _tkLive[d.id] = o; });
  }catch(e){ console.warn('live tasks load', e); }
  ofRenderTasks(br, wk);
}

// 🖼️ عرض الصورة كبيرة — الصورة متخزّنة data-uri جوه المستند نفسه
//    (مش Firebase Storage) عشان الخطة المجانية.
function ofLightbox(src){
  if(!src) return;
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,.88);'
    + 'display:flex; align-items:center; justify-content:center; padding:12px;';
  ov.innerHTML = '<img src="' + esc(src) + '" style="max-width:100%; max-height:88%;'
    + ' border-radius:10px;">'
    + '<div style="position:absolute; top:14px; inset-inline-end:16px; color:#fff;'
    + ' font-size:26px; font-weight:900;">✕</div>';
  ov.onclick = function(){ ov.remove(); };
  document.body.appendChild(ov);
}

// 🧮 شكل التعديل — دالة صافية عشان تتختبر لوحدها.
// ⚠️ لازم كل قرار **يلغي القرار المضاد صراحة** — لو الرفض ساب `confirmed:true`
//    من قرار قديم، التسليم يفضل محسوب مقبول وهو مرفوض.
function ofTaskPatch(act, now){
  const t = Number(now) || Date.now();
  return (act === 'ok')
    ? { confirmed:true,  confirmedAt: t,    rejected:false, rejectedAt:null }
    : { confirmed:false, confirmedAt:null,  rejected:true,  rejectedAt:t };
}

// ✅/✖ قرار المكتب على تسليم التاسك — بيكتب على نفس المستند اللي تطبيق
//     الحضور بيقراه، فالموظفة بتشوف النتيجة على طول (والمرفوض تصوّر تاني).
async function ofTaskDecide(id, act){
  const s = _tkSubs.filter(function(x){ return x.id === id; })[0];
  if(!s) return;
  const head = (act === 'ok' ? '✅ تقبل التنفيذ ده؟' : '✖ ترفض التنفيذ ده؟');
  if(!confirm(head + '\n\n' + (s.employeeName || '—') + ' — ' + (s.branch || '—')
    + '\nالتاسك: ' + (s.taskDescription || '—')
    + (act === 'ok' ? '' : '\n\nالموظفة هتشوف علامة رفض وهتقدر تصوّر تاني.'))) return;
  const patch = ofTaskPatch(act, Date.now());
  try{
    await db.collection('sales_task_submissions').doc(id).update(patch);
    Object.keys(patch).forEach(function(k){ s[k] = patch[k]; });
    ofRenderTasks(_tkBr, _tkWk);
  }catch(err){
    alert('ماتسجّلش: ' + (err.code || err.message));
  }
}

function ofSubCard(s){
  const state = s.confirmed ? 'ok' : (s.rejected ? 'rej' : 'wait');
  const badge = state === 'ok'
      ? '<span style="color:var(--plus); font-weight:800;">✅ اتقبل</span>'
    : state === 'rej'
      ? '<span style="color:var(--minus); font-weight:800;">✖ اترفض</span>'
      : '<span style="color:var(--gold); font-weight:800;">⏳ مستني قرارك</span>';
  const when = s.submittedAt
    ? new Date(s.submittedAt).toLocaleString('ar-EG', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
    : '';
  const thumb = s.photoURL
    ? '<img class="tkThumb" data-full="' + esc(s.photoURL) + '" src="' + esc(s.photoURL) + '" '
      + 'style="width:54px; height:54px; object-fit:cover; border-radius:8px; cursor:pointer; flex:0 0 auto;">'
    : '<div style="width:54px; height:54px; border-radius:8px; background:#00000012; display:flex;'
      + ' align-items:center; justify-content:center; font-size:11px; color:var(--sub);">مفيش صورة</div>';
  // الأزرار بتفضل ظاهرة حتى بعد القرار — عشان تقدر تغيّره لو غلطت
  const btns = '<div style="display:flex; gap:5px; flex:0 0 auto;">'
    + '<button class="tkAct" data-id="' + esc(s.id) + '" data-act="ok" '
    +   'style="min-width:42px; padding:6px 8px;' + (state === 'ok' ? ' opacity:.45;' : '') + '">✅</button>'
    + '<button class="tkAct" data-id="' + esc(s.id) + '" data-act="rej" '
    +   'style="min-width:42px; padding:6px 8px; background:var(--minus);'
    +   (state === 'rej' ? ' opacity:.45;' : '') + '">✖</button>'
    + '</div>';
  return '<div style="display:flex; gap:8px; align-items:center; margin-top:7px;'
    + ' padding:7px; border-radius:9px; background:#00000008;">'
    + thumb
    + '<div style="flex:1; min-width:0;">'
    +   '<div style="font-size:11.5px;">' + badge + '</div>'
    +   '<div style="font-size:10.5px; color:var(--sub); margin-top:2px;">' + esc(when) + '</div>'
    + '</div>'
    + btns
    + '</div>';
}

function ofRenderTasks(br, wk){
  _tkBr = br; _tkWk = wk;
  const list = $('#tkList'); if(!list) return;
  const emps = (D.employees || []).filter(function(e){
    return e.branch === br && e.status !== 'terminated';
  }).sort(function(a,b){ return String(a.name||'').localeCompare(String(b.name||''),'ar'); });
  if(!emps.length){ list.innerHTML = '<div class="card" style="text-align:center; color:var(--sub);">مفيش موظفين في الفرع ده</div>'; return; }

  const rows = emps.map(function(e){
    let rec = _tkWeeks[e.id + '__' + wk] || null;
    // 🩹 مصدر احتياطي: تاسك متحدد من تطبيق الحضور (مالوش مستند أسبوع).
    //    للأسبوع الحالي بس — عشان ما يظهرش غلط في أسبوع فات أو جاي.
    let fromLive = false;
    if(!rec && _tkOffset === 0){
      const lv = _tkLive[e.id];
      if(lv && lv.taskDescription && (!lv.weekKey || lv.weekKey === wk)){ rec = lv; fromLive = true; }
    }
    const desc = rec ? (rec.taskDescription || '') : '';
    const subs = _tkSubs.filter(function(s){ return s.employeeId === e.id; });
    const okCount = subs.filter(function(s){ return s.confirmed; }).length;
    const rejCount = subs.filter(function(s){ return s.rejected; }).length;
    const waiting = subs.length - okCount - rejCount;
    let chip = '<span style="color:var(--sub); font-size:11px;">مفيش تسليم</span>';
    if(subs.length){
      chip = '<span style="font-size:11px;">'
        + (okCount ? '<span style="color:var(--plus);">✅ ' + okCount + '</span> ' : '')
        + (waiting ? '<span style="color:var(--gold);">⏳ ' + waiting + '</span> ' : '')
        + (rejCount ? '<span style="color:var(--minus);">✖ ' + rejCount + '</span>' : '')
        + '</span>';
    }
    return '<div class="card" style="padding:11px;">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:7px;">'
      +   '<b>' + esc(e.name || '—') + '</b>' + chip
      + '</div>'
      + '<div style="display:flex; gap:6px;">'
      +   '<input class="tkIn" data-id="' + esc(e.id) + '" data-name="' + esc(e.name||'') + '" '
      +     'placeholder="تاسك الأسبوع… (مثلاً: سكشن A)" value="' + esc(desc).replace(/"/g,'&quot;') + '" style="flex:1;">'
      +   '<button class="tkSave" data-id="' + esc(e.id) + '" style="min-width:64px;">حفظ</button>'
      + '</div>'
      + (rec && rec.assignedAt ? ('<div style="font-size:10px; color:var(--sub); margin-top:5px;">اتحدد '
          + dstr(rec.assignedAt) + (fromLive ? ' — من تطبيق الحضور' : '') + '</div>') : '')
      + subs.slice().sort(function(a,b){ return (b.submittedAt||0) - (a.submittedAt||0); })
            .map(ofSubCard).join('')
      + '</div>';
  }).join('');

  const errBox = _tkSubsErr
    ? ('<div class="card" style="color:var(--minus); font-size:12px;">'
       + '⚠️ التاسكات ظاهرة، لكن <b>التسليمات مش بتتقري</b>: ' + esc(_tkSubsErr)
       + '<div style="font-size:11px; color:var(--sub); margin-top:6px;">'
       + (/permission/i.test(_tkSubsErr)
          ? 'ده منع من قواعد Firestore — لازم تسمح لحساب المكتب يقرا ويعدّل <b>sales_task_submissions</b>.'
          : 'لو الرسالة بتقول index، افتح اللينك اللي في الكونسول مرة واحدة.')
       + '</div></div>')
    : '';

  list.innerHTML = errBox + rows
    + '<div class="card" style="font-size:11px; color:var(--sub); line-height:1.8;">'
    + '⚠️ التاسك اللي بتكتبه هنا هو اللي الموظفة بتشوفه في تطبيق الحضور وبتسلّم عليه صورة.<br>'
    + 'دوس على الصورة تكبر · ✅ تقبل التنفيذ · ✖ ترفضه والموظفة تصوّر تاني.<br>'
    + 'الأسابيع القديمة محفوظة — ارجع بالأسهم فوق وشوفها.'
    + '</div>';

  list.querySelectorAll('.tkThumb').forEach(function(im){
    im.onclick = function(){ ofLightbox(im.dataset.full); };
  });
  list.querySelectorAll('.tkAct').forEach(function(b){
    b.onclick = function(){ ofTaskDecide(b.dataset.id, b.dataset.act); };
  });

  list.querySelectorAll('.tkSave').forEach(function(btn){
    btn.onclick = async function(){
      const inp = list.querySelector('.tkIn[data-id="' + btn.dataset.id + '"]');
      if(!inp) return;
      const desc = inp.value.trim();
      const emp = emps.filter(function(x){ return x.id === btn.dataset.id; })[0];
      if(!emp) return;
      const old = btn.textContent;
      btn.textContent = '…'; btn.disabled = true;
      try{
        const payload = {
          employeeId: emp.id, employeeName: emp.name || '', branch: br,
          taskDescription: desc, weekKey: wk, assignedAt: Date.now(), assignedBy: 'office'
        };
        // 📖 اللي تطبيق الحضور بيقراه — نفس الشكل بالظبط + حقول زيادة
        await db.collection('sales_tasks').doc(emp.id).set(payload, { merge: true });
        // 🗂️ وسجل الأسبوع — ده اللي بيخلي التاريخ يفضل
        await db.collection('sales_task_weeks').doc(emp.id + '__' + wk).set(payload, { merge: true });
        _tkWeeks[emp.id + '__' + wk] = payload;
        btn.textContent = 'اتحفظ ✅';
        setTimeout(function(){ btn.textContent = old; btn.disabled = false; }, 1400);
      }catch(err){
        btn.textContent = 'فشل'; btn.disabled = false;
        alert('ماتحفظش: ' + (err.code || err.message));
      }
    };
  });
}

function ofWireTasks(){
  const bs = $('#tkBranch'); if(!bs) return;
  const set = {};
  (D.employees || []).forEach(function(e){ if(e.branch) set[e.branch] = 1; });
  const brs = Object.keys(set).sort();
  if(brs.length && !bs.options.length){
    bs.innerHTML = brs.map(function(b){ return '<option value="'+esc(b)+'">'+esc(b)+'</option>'; }).join('');
  }
  bs.onchange = ofLoadTasks;
  document.querySelectorAll('.tkNav').forEach(function(b){
    b.onclick = function(){
      const d = Number(b.dataset.d);
      _tkOffset = (d === 0) ? 0 : _tkOffset + d;
      ofLoadTasks();
    };
  });
  ofLoadTasks();
}
window.ofLoadTasks = ofLoadTasks;

// ============================================================
// 🔁 المصاريف المتكررة — قوالب شهرية لكل فرع
// ------------------------------------------------------------
// المشكلة: الإيجار والكهربا بيتكتبوا يدوي كل شهر، وسهل ينسوا.
// الحل: قالب لكل مصروف (الفرع · النوع · المبلغ)، والنظام بيوريك اللي
// **لسه ماتدفعش الشهر ده** بزرار تسجيل بضغطة.
//
// 🔑 نوعين:
//   · ثابت (الإيجار) — المبلغ محفوظ، بتدوس تسجيل وخلاص
//   · متغيّر (الكهربا) — بيسألك المبلغ في كل مرة
//
// ⚠️ التسجيل بيكتب في `office_expenses` بنفس الشكل القديم بالظبط
//    (amount · note · ts · month) + حقول زيادة، فحساب الأرباح والإجماليات
//    مايتأثرش. القوالب في مجموعة منفصلة — مش مصاريف فعلية.
// 🛡️ ومفيش تسجيل تلقائي: النظام بيقترح، وانت اللي بتأكد. مصروف بيتسجل
//    لوحده من غير ما حد يشوفه = رقم غلط في الأرباح ومحدش واخد باله.
// ============================================================

function ofRecurKey(tpl, mk){ return String(tpl.id) + '__' + mk; }

// اتدفع الشهر ده؟ بندوّر على مصروف متسجّل من القالب ده
function ofRecurPaid(tpl, mk){
  return (D.expenses || []).filter(function(e){
    return e && e.month === mk && e.recurringId === tpl.id;
  })[0] || null;
}

function ofRenderRecurring(){
  const wrap = $('#recurringBox'); if(!wrap) return;
  const mk = monthKey();
  const tpls = (D.recurring || []).slice().sort(function(a,b){
    return String(a.branch||'').localeCompare(String(b.branch||''),'ar')
        || String(a.note||'').localeCompare(String(b.note||''),'ar');
  });

  const due = tpls.filter(function(t){ return !ofRecurPaid(t, mk); });
  const dueTotal = due.reduce(function(n,t){ return n + (t.kind === 'fixed' ? (Number(t.amount)||0) : 0); }, 0);

  const rows = tpls.map(function(t){
    const paid = ofRecurPaid(t, mk);
    const isFixed = t.kind === 'fixed';
    const amtTxt = isFixed ? egp(t.amount) : '<span style="color:var(--sub);">متغيّر</span>';
    return '<div style="background:var(--panel2); border:1px solid ' + (paid ? 'var(--line)' : '#5a4a2a')
      + '; border-radius:11px; padding:11px; margin-bottom:8px;">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">'
      +   '<div style="min-width:0;">'
      +     '<div style="font-weight:800;">' + esc(t.note || 'مصروف') + '</div>'
      +     '<div style="font-size:11px; color:var(--sub);">' + esc(t.branch || 'الشركة')
      +       ' · ' + (isFixed ? 'ثابت' : 'متغيّر') + '</div>'
      +   '</div>'
      +   '<div style="text-align:left; white-space:nowrap;">' + amtTxt + '</div>'
      + '</div>'
      + '<div style="display:flex; gap:6px; margin-top:9px;">'
      +   (paid
          ? ('<div style="flex:1; color:var(--plus); font-size:12px; font-weight:700;">✅ اتدفع '
             + dstr(paid.ts) + ' · ' + egp(paid.amount) + '</div>')
          : ('<button class="recPay" data-id="' + esc(t.id) + '" style="flex:1; padding:9px; border:none;'
             + ' border-radius:9px; background:linear-gradient(180deg,#3fbf60,#1f9440); color:#fff;'
             + ' font-family:\'Cairo\'; font-weight:800; cursor:pointer;">💰 سجّل الدفع</button>'))
      +   '<button class="recDel" data-id="' + esc(t.id) + '" style="padding:9px 12px; border:1px solid var(--line);'
      +     ' border-radius:9px; background:var(--panel); color:var(--sub); font-family:\'Cairo\'; cursor:pointer;">🗑️</button>'
      + '</div></div>';
  }).join('');

  wrap.innerHTML =
    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:9px;">'
    + '<b style="font-size:14px;">🔁 المصاريف المتكررة</b>'
    + (due.length
        ? ('<span style="background:#5a4a2a; color:var(--gold); border-radius:8px; padding:3px 10px; font-size:11.5px; font-weight:800;">'
           + due.length + ' لسه ماتدفعش</span>')
        : '<span style="color:var(--plus); font-size:11.5px; font-weight:700;">✅ الشهر ده كامل</span>')
    + '</div>'
    + (dueTotal ? ('<div style="font-size:11.5px; color:var(--sub); margin-bottom:8px;">المستحق الثابت: '
        + egp(dueTotal) + '</div>') : '')
    + (rows || '<div style="color:var(--sub); font-size:12px; margin-bottom:8px;">مفيش قوالب — ضيف الإيجار والكهربا مرة واحدة وهيفضلوا يتكرروا.</div>')
    + '<button id="recAdd" style="width:100%; padding:10px; border:1px dashed var(--line); border-radius:10px;'
    + ' background:var(--panel); color:var(--sub); font-family:\'Cairo\'; font-weight:700; cursor:pointer;">➕ قالب جديد</button>';

  // 💰 تسجيل الدفع
  wrap.querySelectorAll('.recPay').forEach(function(b){
    b.onclick = async function(){
      const t = (D.recurring||[]).filter(function(x){ return x.id === b.dataset.id; })[0];
      if(!t) return;
      let amount = Number(t.amount) || 0;
      if(t.kind !== 'fixed'){
        const v = prompt('مبلغ ' + (t.note||'المصروف') + ' لشهر ' + mk + ':', '');
        if(v === null) return;
        amount = parseFloat(v);
      }
      if(!(amount > 0)){ alert('اكتب مبلغ صحيح'); return; }
      // ⚠️ فحص أخير قبل الكتابة — يمنع الدفع مرتين لو الشاشة قديمة أو
      //    الجهاز التاني سجّلها في نفس اللحظة
      if(ofRecurPaid(t, mk)){ alert('المصروف ده اتسجل خلاص الشهر ده'); ofRenderRecurring(); return; }
      b.disabled = true; b.textContent = 'بيتسجل…';
      try{
        await db.collection('office_expenses').add({
          amount: amount,
          note: (t.note || 'مصروف') + (t.branch ? (' — ' + t.branch) : ''),
          ts: Date.now(), month: mk,
          recurringId: t.id, branch: t.branch || null   // 🔗 الربط بالقالب
        });
      }catch(e){ alert('تعذر التسجيل: ' + e.message); b.disabled = false; b.textContent = '💰 سجّل الدفع'; }
    };
  });

  // 🗑️ مسح القالب — المصاريف المتسجلة بتفضل
  wrap.querySelectorAll('.recDel').forEach(function(b){
    b.onclick = async function(){
      const t = (D.recurring||[]).filter(function(x){ return x.id === b.dataset.id; })[0];
      if(!t) return;
      if(!confirm('تمسح قالب "' + (t.note||'') + '"؟\n\nالمصاريف اللي اتسجلت منه قبل كده هتفضل زي ما هي — '
        + 'ده بيوقف التذكير الشهري بس.')) return;
      try{ await db.collection(OF_RECUR_COL).doc(t.id).delete(); }
      catch(e){ alert('تعذر المسح: ' + e.message); }
    };
  });

  const add = wrap.querySelector('#recAdd');
  if(add) add.onclick = async function(){
    const note = prompt('اسم المصروف؟ (إيجار / كهربا / نت ...)');
    if(!note || !note.trim()) return;
    const set = {};
    (D.employees||[]).forEach(function(e){ if(e.branch) set[e.branch] = 1; });
    const brs = Object.keys(set).sort();
    const brTxt = prompt('الفرع؟ اكتب الاسم بالظبط:\n\n' + brs.join('\n'), brs[0] || '');
    if(brTxt === null) return;
    const isFixed = confirm('المبلغ ثابت كل شهر؟\n\nموافق = ثابت (زي الإيجار)\nإلغاء = متغيّر (زي الكهربا)');
    let amount = 0;
    if(isFixed){
      const v = prompt('المبلغ الثابت:', '');
      if(v === null) return;
      amount = parseFloat(v);
      if(!(amount > 0)){ alert('اكتب مبلغ صحيح'); return; }
    }
    try{
      await db.collection(OF_RECUR_COL).add({
        note: note.trim(), branch: brTxt.trim() || null,
        kind: isFixed ? 'fixed' : 'variable',
        amount: isFixed ? amount : null,
        createdAt: Date.now()
      });
    }catch(e){ alert('تعذر الحفظ: ' + e.message); }
  };
}
window.ofRenderRecurring = ofRenderRecurring;

/* ============================================================
   🧑‍💼 التوظيف — دعوة برابط لمرة واحدة + مراجعة الطلبات
   ------------------------------------------------------------
   ⚠️ الرابط **مش مفتوح** (قرار المالك). الدعوة مستند في
   `staff_invites/{code}` بتحمل الفرع والوظيفة وتاريخ الانتهاء،
   وقواعد Firestore بترفض أي طلب تسجيل مالوش دعوة مفتوحة —
   يعني المنع من السيرفر مش من الصفحة.
   ============================================================ */
const HIRE_ROLES = { sales_social:'مبيعات ومساعدة تسويق رقمي', cashier:'كاشير ومبيعات' };
const HIRE_DOCS  = { id_front:'وجه البطاقة', id_back:'ظهر البطاقة',
                     edu_front:'المؤهل — الوجه', edu_back:'المؤهل — الظهر',
                     bill:'إثبات السكن', signature:'التوقيع' };
let _hvInvites = [], _hrDocs = {}, _hrDocsErr = '';

// الكود: حروف وأرقام من غير الحروف اللي بتتلخبط (O/0 · I/1)
function hvCode(){
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const r = new Uint32Array(6);
  (window.crypto || {}).getRandomValues ? crypto.getRandomValues(r) : r.forEach(function(_,i){ r[i] = Math.random()*4e9; });
  for(let i = 0; i < 6; i++) out += A[r[i] % A.length];
  return out;
}
function hvLink(code){ return location.origin + '/join/?c=' + code; }

function hvBranches(){
  const set = {};
  (D.employees || []).forEach(function(e){ if(e.branch) set[e.branch] = 1; });
  return Object.keys(set).sort();
}

function ofWireHire(){
  const bs = $('#hvBrand'), br = $('#hvBranch'), mk = $('#hvMake');
  if(!bs || !br || !mk) return;
  const fill = function(){
    // Glow محل واحد — مفيش قايمة فروع
    if(bs.value === 'glow'){ br.innerHTML = '<option value="Glow">Glow</option>'; br.disabled = true; return; }
    br.disabled = false;
    const list = hvBranches().filter(function(x){ return !/glow/i.test(x); });
    br.innerHTML = (list.length ? list : ['الرحاب','مدينتي','سيتي سنتر'])
      .map(function(b){ return '<option value="' + esc(b) + '">' + esc(b) + '</option>'; }).join('');
  };
  bs.onchange = fill; fill();

  mk.onclick = async function(){
    const code = hvCode();
    const days = Number(($('#hvDays')||{}).value) || 3;
    const role = ($('#hvRole')||{}).value || 'sales_social';
    const brand = bs.value, branch = br.value;
    if(!confirm('🔗 دعوة جديدة\n\n' + (brand === 'glow' ? 'Glow' : 'echarpe — ' + branch)
      + '\n' + (HIRE_ROLES[role] || role) + '\nتنتهي بعد ' + days + ' يوم\n\nتكمّل؟')) return;
    mk.disabled = true; mk.textContent = 'بيتعمل…';
    // 🩺 تشخيص قبل الكتابة: القاعدة بتشترط دخول بإيميل وباسورد.
    //    كل التطبيقات على نفس الدومين وبتشارك نفس جلسة المتصفح — فلو
    //    اتفتح تطبيق الولاء أو شاشة التقييم على نفس المتصفح، الجلسة
    //    ممكن تكون اتبدلت لحساب **مجهول** والرول يرفض وهو سليم.
    const _u = ofAuth.currentUser;
    const _prov = _u ? ((_u.providerData && _u.providerData[0] && _u.providerData[0].providerId) || (_u.isAnonymous ? 'anonymous' : '?')) : 'مفيش';
    if(!_u || _u.isAnonymous || _prov === 'anonymous'){
      alert('⛔ الجلسة الحالية مش بإيميل\n\n'
        + 'الدخول: ' + (_u ? (_u.isAnonymous ? 'مجهول (anonymous)' : _prov) : 'مفيش حساب داخل') + '\n\n'
        + 'القاعدة بتشترط دخول بإيميل وباسورد. اقفل التطبيق واخرج وادخل تاني بالإيميل.');
      mk.disabled = false; mk.textContent = '🔗 اعمل رابط دعوة';
      return;
    }
    try{
      await db.collection('staff_invites').doc(code).set({
        code: code, brand: brand, branch: branch, role: role,
        createdAt: Date.now(), expiresAt: Date.now() + days*86400000,
        usedAt: null, createdBy: 'office'
      });
      const link = hvLink(code);
      const out = $('#hvOut');
      if(out) out.innerHTML = '<div class="card" style="margin-top:11px; border:1px solid var(--gold);">'
        + '<div style="font-size:12px; color:var(--sub);">الرابط جاهز — ابعته على واتساب</div>'
        + '<div style="font-weight:900; font-size:14px; word-break:break-all; margin:7px 0;">' + esc(link) + '</div>'
        + '<button onclick="hvCopy(\'' + esc(link) + '\')" style="width:100%;">📋 انسخ الرابط</button></div>';
    }catch(e){
      // 🩺 الرسالة بتقول **مين اللي داخل** — الكود لوحده مش بيفرّق بين
      //    "الرول مش منشور" و"الجلسة مش بإيميل"، والاتنين بيدوا نفس الكود.
      alert('ماتعملش: ' + (e.code || e.message) + '\n\n'
        + '— الدخول: ' + _prov + '\n'
        + '— الإيميل: ' + ((_u && _u.email) || 'مفيش') + '\n'
        + '— المشروع: ' + (ofApp.options.projectId || '?') + '\n\n'
        + (String(e.code||'').indexOf('permission') >= 0
            ? 'الدخول بإيميل تمام، يبقى الرول اللي فيه staff_invites لسه مانشرش.'
            : 'دي مش مشكلة صلاحيات — ابعت الرسالة دي كلها.'));
    }
    mk.disabled = false; mk.textContent = '🔗 اعمل رابط دعوة';
  };
}
window.hvCopy = function(link){
  try{ navigator.clipboard.writeText(link); alert('اتنسخ ✅'); }
  catch(e){ prompt('انسخ الرابط:', link); }
};

function ofRenderInvites(){
  const w = $('#hvList'); if(!w) return;
  const open = _hvInvites.filter(function(x){ return !x.usedAt && (!x.expiresAt || x.expiresAt > Date.now()); })
                         .sort(function(a,b){ return (b.createdAt||0) - (a.createdAt||0); });
  if(!open.length){ w.innerHTML = '<div class="hint" style="margin-top:11px;">مفيش دعوات مفتوحة</div>'; return; }
  w.innerHTML = '<div style="margin-top:13px; font-weight:800; font-size:13px;">دعوات مفتوحة ('
    + open.length + ')</div>' + open.map(function(x){
    const left = Math.max(0, Math.ceil(((x.expiresAt||0) - Date.now()) / 86400000));
    return '<div class="card" style="padding:11px; margin-top:8px;">'
      + '<div style="display:flex; justify-content:space-between; gap:9px; align-items:center;">'
      +   '<b style="font-family:monospace; letter-spacing:2px;">' + esc(x.id) + '</b>'
      +   '<span style="font-size:11px; color:' + (left <= 1 ? 'var(--minus)' : 'var(--sub)') + ';">'
      +     'باقي ' + left + ' يوم</span></div>'
      + '<div style="font-size:11.5px; color:var(--sub); margin-top:4px;">'
      +   esc(x.brand === 'glow' ? 'Glow' : 'echarpe — ' + (x.branch||'')) + ' · '
      +   esc(HIRE_ROLES[x.role] || x.role || '') + '</div>'
      + '<div style="display:flex; gap:6px; margin-top:8px;">'
      +   '<button onclick="hvCopy(\'' + esc(hvLink(x.id)) + '\')" style="flex:1;">📋 نسخ</button>'
      +   '<button onclick="hvKill(\'' + esc(x.id) + '\')" style="flex:0 0 92px; background:var(--minus);">إلغاء</button>'
      + '</div></div>';
  }).join('');
}
window.hvKill = async function(code){
  if(!confirm('تلغي الدعوة ' + code + '؟\n\nالرابط هيبطّل يشتغل فورًا.')) return;
  try{ await db.collection('staff_invites').doc(code).update({ expiresAt: Date.now() - 1, cancelledAt: Date.now() }); }
  catch(e){ alert('ماتلغتش: ' + (e.code || e.message)); }
};

// 📥 طلبات التوظيف — الجاية من الرابط بس (source:'join')
function ofRenderHireRegs(){
  try{ ofSyncHireBadge(); }catch(e){}
  const w = $('#hrList'); if(!w) return;
  const rows = (D.regs || []).filter(function(r){ return r && r.source === 'join'; })
    .sort(function(a,b){ return (b.ts||0) - (a.ts||0); }).slice(0, 40);
  if(!rows.length){ w.innerHTML = '<div class="hint" style="margin-top:11px;">مفيش طلبات لسه</div>'; return; }
  w.innerHTML = rows.map(function(r){
    const st = r.status === 'approved' ? '<span style="color:var(--plus);">✅ متعمد</span>'
             : r.status === 'rejected' ? '<span style="color:var(--minus);">✖ مرفوض</span>'
             : '<span style="color:var(--gold);">⏳ مستني قرارك</span>';
    const docs = (_hrDocs[r.id] || []).sort(function(a,b){ return (a.ts||0) - (b.ts||0); });
    return '<div class="card" style="padding:12px; margin-top:9px;">'
      + '<div style="display:flex; justify-content:space-between; gap:9px; align-items:center;">'
      +   '<b>' + esc(r.name || '—') + '</b>' + st + '</div>'
      + '<div style="font-size:11.5px; color:var(--sub); margin-top:3px; line-height:1.9;">'
      +   esc(r.brand === 'glow' ? 'Glow' : 'echarpe — ' + (r.branch||'')) + ' · '
      +   esc(HIRE_ROLES[r.role] || r.role || '') + '<br>'
      +   '📱 ' + esc(r.phone || '—') + ' · 🪪 ' + esc(r.nid || '—') + '<br>'
      +   (r.birth ? ('🎂 ' + esc(r.birth) + ' · ' + esc(r.gov || '') + '<br>') : '')
      +   '🕐 ' + esc(r.shift === 'evening' ? 'مسائي' : 'صباحي')
      +   ' · إجازة ' + esc(['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][Number(r.dayOff)] || '—')
      +   '<br>⏳ فترة اختبار ' + esc(String(r.trialDays || 30)) + ' يوم'
      +   (r.emergency ? ('<br>🆘 ' + esc(r.emergency.name||'') + ' (' + esc(r.emergency.relation||'') + ') '
                          + esc(r.emergency.phone||'')) : '')
      +   (r.address ? ('<br>🏠 ' + esc(r.address)) : '')
      + '</div>'
      + (docs.length
          ? ('<div style="display:flex; gap:6px; overflow-x:auto; margin-top:9px; padding-bottom:3px;">'
             + docs.map(function(d){
                 return '<img class="hrThumb" data-full="' + esc(d.photo) + '" src="' + esc(d.photo) + '" '
                   + 'title="' + esc(HIRE_DOCS[d.kind] || d.kind) + '" '
                   + 'style="width:62px; height:62px; object-fit:cover; border-radius:9px; cursor:pointer; flex:0 0 auto;">';
               }).join('') + '</div>')
          : ('<div style="font-size:11.5px; color:var(--minus); margin-top:8px; line-height:1.9;">'
             + '⚠️ مفيش مستندات معروضة<br>'
             // 🩺 الفرق بين الحالتين هو كل الحكاية:
             //   جهاز المتقدِّمة قال إنه رفع N ملف → المشكلة في **القراءة**
             //   مفيش docKeys أصلًا       → الرفع نفسه وقع على جهازها
             + '<span style="color:var(--sub);">جهازها قال: '
             + ((r.docKeys && r.docKeys.length)
                 ? ('رفع ' + r.docKeys.length + ' ملف (' + esc((r.docKeys||[]).join('، ')) + ')'
                    + ' — يبقى المشكلة في القراءة مش الرفع')
                 : 'مرفعش أي ملف — الاستمارة وقعت عنده قبل الرفع')
             + '</span>'
             + (_hrDocsErr ? ('<br><b style="color:var(--minus);">سبب فشل القراءة: ' + esc(_hrDocsErr) + '</b>') : '')
             + '</div>'))
      + (r.status === 'pending'
          ? ('<div style="display:flex; gap:6px; margin-top:10px;">'
             + '<button onclick="hrApprove(\'' + esc(r.id) + '\')" style="flex:1;">✅ اعتماد وفتح الحساب</button>'
             + '<button onclick="hrReject(\'' + esc(r.id) + '\')" style="flex:0 0 88px; background:var(--minus);">رفض</button>'
             + '</div>')
          : '')
      + '</div>';
  }).join('');
  w.querySelectorAll('.hrThumb').forEach(function(im){
    im.onclick = function(){ ofLightbox(im.dataset.full); };
  });
}

// ✅ الاعتماد — بنفس ضمانة تطبيق الحضور: الحجز بـtransaction الأول،
//    وإنشاء الموظف **بعد** نجاح الحجز، فمستحيل يتسجّل مرتين.
window.hrApprove = async function(id){
  const r = (D.regs || []).filter(function(x){ return x.id === id; })[0];
  if(!r) return;
  if(!confirm('✅ اعتماد ' + (r.name||'') + '؟\n\n'
    + (r.brand === 'glow' ? 'Glow' : 'echarpe — ' + (r.branch||'')) + '\n'
    + (HIRE_ROLES[r.role] || '') + '\n\n'
    + 'هيتفتح حساب على تابلت الفرع بالرقم السري اللي اختارته،\n'
    + 'وفترة الاختبار (' + (r.trialDays || 30) + ' يوم) بتبدأ من أول يوم شغل.')) return;
  try{
    const ref = db.collection('sales_registrations').doc(id);
    await db.runTransaction(async function(tx){
      const snap = await tx.get(ref);
      if(!snap.exists) throw new Error('الطلب مش موجود');
      if((snap.data()||{}).status === 'approved') throw new Error('__ALREADY__');
      tx.update(ref, { status:'approved', approvedAt: Date.now(), approvedBy:'office' });
    });
    await db.collection('sales_employees').add({
      name: r.name, gender: r.gender || '', avatar: (r.gender === 'male' ? 'boy' : 'girl'),
      shift: r.shift, dayOff: r.dayOff,
      scheduledStartTime: r.scheduledStartTime || null,
      scheduledEndTime: r.scheduledEndTime || null,
      branch: r.branch, active: true, createdAt: Date.now(), pin: (r.pin || '0000'),
      phone: r.phone || '', role: r.role || '', trialDays: Number(r.trialDays) || 30,
      trialFrom: Date.now(), regId: id
    });
    alert('اتعمد ✅ الحساب اتفعّل على تابلت الفرع');
  }catch(e){
    alert(e && e.message === '__ALREADY__' ? 'الطلب ده اتعمد خلاص ✅' : ('ماتعمدش: ' + (e.code || e.message)));
  }
};
window.hrReject = async function(id){
  const r = (D.regs || []).filter(function(x){ return x.id === id; })[0];
  if(!confirm('✖ ترفض طلب ' + ((r&&r.name)||'') + '؟')) return;
  try{ await db.collection('sales_registrations').doc(id).update({ status:'rejected', rejectedAt: Date.now() }); }
  catch(e){ alert('ماترفضش: ' + (e.code || e.message)); }
};

/* ============================================================
   🗂️ ملف الموظفة — الرجوع لأي بيانات في أي وقت
   ------------------------------------------------------------
   ⚠️ شاشة «طلبات التوظيف» بتقرا آخر ٦٠ يوم بس (الصور تقيلة). الملف ده
   بيحل المشكلة من الناحية التانية: البحث في **كل** التسجيلات (نصوص
   خفيفة، متحمّلة أصلًا)، والمستندات بتتجاب **عند الطلب** باستعلام على
   رقم الطلب — فمفيش حد زمني ومفيش قراءات على الفاضي.
   ============================================================ */
let _efDocs = null, _efSel = null;

function efMatch(q, o){
  const n = String(o.name || '').toLowerCase();
  const p = String(o.phone || '').replace(/\D/g, '');
  const qq = String(q || '').trim().toLowerCase();
  const qd = qq.replace(/\D/g, '');
  return (qq.length >= 2 && n.indexOf(qq) >= 0) || (qd.length >= 3 && p.indexOf(qd) >= 0);
}

function ofRenderEmpFile(){
  const q = ($('#efQ') || {}).value || '';
  const list = $('#efList'), card = $('#efCard');
  if(!list) return;
  if(String(q).trim().length < 2){
    list.innerHTML = ''; if(card) card.innerHTML = '';
    _efSel = null; _efDocs = null;
    return;
  }
  // التسجيلات (فيها المستندات) + الموظفين المعتمدين
  const hits = [];
  (D.regs || []).forEach(function(r){
    if(efMatch(q, r)) hits.push({ kind:'reg', id:r.id, name:r.name, phone:r.phone,
      sub:(r.branch||'') + ' · ' + (r.status === 'approved' ? 'متعمد' : r.status === 'rejected' ? 'مرفوض' : 'مستني'),
      ts:r.ts || 0, reg:r });
  });
  (D.employees || []).forEach(function(e){
    if(!efMatch(q, e)) return;
    // لو ليه طلب، بنكون عرضناه فوق — منكررش
    if(e.regId && hits.some(function(h){ return h.id === e.regId; })) return;
    hits.push({ kind:'emp', id:e.id, name:e.name, phone:e.phone,
      sub:(e.branch||'') + ' · ' + (e.active === false ? 'موقوف' : 'شغّال'),
      ts:e.createdAt || 0, emp:e, regRef:e.regId || '' });
  });
  hits.sort(function(a,b){ return (b.ts||0) - (a.ts||0); });

  if(!hits.length){ list.innerHTML = '<div class="hint" style="margin-top:10px;">مفيش نتايج</div>'; return; }
  list.innerHTML = hits.slice(0, 12).map(function(h){
    return '<button class="efPick" data-kind="' + esc(h.kind) + '" data-id="' + esc(h.id) + '" '
      + 'data-reg="' + esc(h.regRef || (h.kind === 'reg' ? h.id : '')) + '" '
      + 'style="width:100%; text-align:right; margin-top:7px;">'
      + '<b>' + esc(h.name || '—') + '</b>'
      + '<span style="font-size:11px; color:var(--sub);"> · ' + esc(h.sub) + '</span></button>';
  }).join('');
  list.querySelectorAll('.efPick').forEach(function(b){
    b.onclick = function(){ efOpen(b.dataset.reg, b.dataset.id, b.dataset.kind); };
  });
}

// 📎 المستندات بتتجاب هنا بالطلب — استعلام مساواة واحدة، مش محتاج index
async function efOpen(regId, id, kind){
  const card = $('#efCard'); if(!card) return;
  _efSel = { regId: regId, id: id, kind: kind };
  const r = (D.regs || []).filter(function(x){ return x.id === regId; })[0];
  const e = (D.employees || []).filter(function(x){ return x.id === id; })[0]
         || (D.employees || []).filter(function(x){ return x.regId === regId; })[0];
  const who = (r && r.name) || (e && e.name) || '—';

  card.innerHTML = '<div class="card" style="margin-top:12px;">'
    + '<b style="font-size:15px;">' + esc(who) + '</b>'
    + '<div style="font-size:12px; color:var(--sub); margin-top:5px; line-height:1.9;">'
    +   (r ? ('📱 ' + esc(r.phone || '—') + (r.whatsapp && r.whatsapp !== r.phone ? (' · واتساب ' + esc(r.whatsapp)) : '') + '<br>'
             + '🪪 ' + esc(r.nid || '—') + (r.birth ? (' · 🎂 ' + esc(r.birth)) : '') + (r.gov ? (' · ' + esc(r.gov)) : '') + '<br>'
             + '🏬 ' + esc(r.brand === 'glow' ? 'Glow' : 'echarpe — ' + (r.branch||'')) + ' · '
             + esc(HIRE_ROLES[r.role] || r.role || '') + '<br>'
             + (r.address ? ('🏠 ' + esc(r.address) + '<br>') : '')
             + (r.emergency ? ('🆘 ' + esc(r.emergency.name||'') + ' (' + esc(r.emergency.relation||'')
                               + ') ' + esc(r.emergency.phone||'') + '<br>') : '')
             + '📅 اتسجّل ' + esc(dstr(r.ts || 0)))
          : '📱 ' + esc((e && e.phone) || '—') + '<br>🏬 ' + esc((e && e.branch) || '—'))
    + '</div>'
    + (e ? efTrialLine(e) : '')
    + '<div id="efDocs" style="margin-top:10px; font-size:12px; color:var(--sub);">بيحمّل المستندات…</div>'
    + '</div>';

  if(!regId){
    const d = $('#efDocs');
    if(d) d.innerHTML = '⚠️ الموظفة دي اتسجّلت من تابلت الفرع — مفيش مستندات مرفوعة.';
    return;
  }
  try{
    const snap = await db.collection('staff_docs').where('regId', '==', regId).get();
    const docs = snap.docs.map(function(x){ return x.data() || {}; })
                          .sort(function(a,b){ return (a.ts||0) - (b.ts||0); });
    const d = $('#efDocs'); if(!d) return;
    if(!docs.length){ d.innerHTML = 'مفيش مستندات على الطلب ده.'; return; }
    d.innerHTML = '<div style="margin-bottom:6px;">📎 ' + docs.length + ' مستند</div>'
      + '<div style="display:flex; gap:7px; overflow-x:auto; padding-bottom:4px;">'
      + docs.map(function(x){
          return '<div style="flex:0 0 auto; text-align:center;">'
            + '<img class="efThumb" data-full="' + esc(x.photo) + '" src="' + esc(x.photo) + '" '
            + 'style="width:78px; height:78px; object-fit:cover; border-radius:10px; cursor:pointer; display:block;">'
            + '<div style="font-size:10px; color:var(--sub); margin-top:3px; max-width:78px;">'
            + esc(HIRE_DOCS[x.kind] || x.kind || '') + '</div></div>';
        }).join('') + '</div>';
    d.querySelectorAll('.efThumb').forEach(function(im){
      im.onclick = function(){ ofLightbox(im.dataset.full); };
    });
  }catch(err){
    const d = $('#efDocs');
    if(d) d.innerHTML = '<span style="color:var(--minus);">تعذّر تحميل المستندات: '
      + esc(err.code || err.message) + '</span>';
  }
}

// ⏳ فترة الاختبار — فاضل كام يوم، ولا خلصت
function efTrialLine(e){
  const days = Number(e.trialDays) || 0, from = Number(e.trialFrom) || 0;
  if(!days || !from) return '';
  const passed = Math.floor((Date.now() - from) / 86400000);
  const left = days - passed;
  return '<div style="margin-top:9px; padding:9px 11px; border-radius:10px; font-size:12px;'
    + ' background:var(--panel2); border:1px solid ' + (left > 0 ? 'var(--gold)' : 'var(--plus)') + ';">'
    + (left > 0
        ? ('⏳ فترة اختبار — فاضل <b style="color:var(--gold);">' + left + ' يوم</b> من ' + days)
        : ('✅ خلّصت فترة الاختبار (' + days + ' يوم) — موظفة دائمة'))
    + '<div style="color:var(--sub); font-size:11px; margin-top:2px;">بدأت ' + esc(dstr(from)) + '</div></div>';
}

function ofWireEmpFile(){
  const q = $('#efQ'); if(!q) return;
  let t = 0;
  q.oninput = function(){ clearTimeout(t); t = setTimeout(ofRenderEmpFile, 260); };
}

/* ============================================================
   💼 المتقدّمين للوظائف — الفرز قبل المقابلة
   ------------------------------------------------------------
   الحلقة كاملة: إعلان ← تقديم ← فرز ← مقابلة ← **دعوة تسجيل** ← تسجيل
   بالمستندات. زرار «ادعُه للتسجيل» بيربط الشاشتين.
   ⚠️ القراءة بنافذة ٩٠ يوم — الطلبات بتتراكم ومحدش بيرجع لطلب من سنة.
   ============================================================ */
const AP_ROLES  = { sales_social:'مبيعات وسوشيال', cashier:'كاشير ومبيعات', setup:'تجهيز الفرع' };
const AP_SHIFTS = { morning:'🌅 صباحي', evening:'🌆 مسائي', setup:'✨ تجهيز ٧–١٠', any:'🤝 أي شيفت' };
const AP_STATUS = { new:'🆕 جديد', interview:'📞 للمقابلة', hired:'✅ اتوظف', rejected:'❌ مرفوض' };
let _apList = [];

// 🔴 شارة تبويب التوظيف — المتقدّمين الجداد وطلبات التسجيل المستنية.
//    من غيرها الحاجات دي بتفضل في تبويب مقفول ومحدش واخد باله.
function ofSyncHireBadge(){
  const a = (_apList || []).filter(function(x){ return (x.status || 'new') === 'new'; }).length;
  const r = (D.regs || []).filter(function(x){ return x && x.source === 'join' && x.status === 'pending'; }).length;

  /* 🔢 عدّادات التبويبات الفرعية — نفس الرقمين بالظبط، متفصولين.
     مقصود إنهم من **نفس** الحساب بتاع الشارة الكبيرة: لو اتحسبوا
     في مكانين، أول تعديل على تعريف «جديد» هيخلّي الشارة تقول رقم
     والتبويب يقول رقم تاني. */
  const put = function(id, n){
    const el = document.getElementById(id); if(!el) return;
    el.textContent = n;
    el.style.display = n ? 'inline-block' : 'none';
  };
  put('hsnApps', a);
  put('hsnDocs', r);

  const el = document.getElementById('nbHire'); if(!el) return;
  const n = a + r;
  el.textContent = n;
  el.style.display = n ? '' : 'none';
}

let _apSortOldest = false;   // ⏳ الترتيب الافتراضي: الأحدث فوق (زي ما كان)
window.apToggleSort = function(){
  _apSortOldest = !_apSortOldest;
  ofRenderApplicants();
};

function ofRenderApplicants(){
  ofSyncHireBadge();
  const w = $('#apList'); if(!w) return;
  const st = ($('#apStatus') || {}).value;
  const br = ($('#apBranch') || {}).value;
  const sh = ($('#apShift')  || {}).value;
  let rows = (_apList || []).filter(function(a){
    if(st && (a.status || 'new') !== st) return false;
    if(br && (!Array.isArray(a.branches) || a.branches.indexOf(br) < 0)) return false;
    if(sh && a.shift !== sh && a.shift !== 'any') return false;
    return true;
  }).sort(function(a,b){
    return _apSortOldest ? (a.ts||0) - (b.ts||0) : (b.ts||0) - (a.ts||0);
  });

  if(!rows.length){ w.innerHTML = '<div class="hint" style="margin-top:11px;">مفيش متقدّمين بالفلتر ده</div>'; return; }
  /* ⏳ عدد اللي مستنيين من غير رد من فوق أسبوع — رقم واحد بيقول
     للمالك «فيه ناس بتستنى» من غير ما يقلّب واحد واحد. */
  const staleCount = rows.filter(function(a){
    return agoStale(a.ts, 7) && (a.status || 'new') === 'new';
  }).length;
  w.innerHTML = '<div style="display:flex; align-items:center; justify-content:space-between; gap:9px; margin:11px 0 4px; flex-wrap:wrap;">'
    + '<span style="font-size:12px; color:var(--sub);">' + rows.length + ' متقدّم'
    +   (staleCount ? (' · <b style="color:var(--bad);">⏳ ' + staleCount + ' من غير رد من فوق أسبوع</b>') : '')
    + '</span>'
    + '<button onclick="apToggleSort()" style="font-size:11px; padding:6px 11px; background:var(--panel2); color:var(--sub); border:1px solid var(--line); border-radius:8px;">'
    +   (_apSortOldest ? '↓ الأقدم فوق' : '↑ الأحدث فوق') + '</button>'
  + '</div>' + rows.slice(0, 60).map(function(a){
    const roles = (a.roles || []).map(function(r){ return AP_ROLES[r] || r; }).join(' · ');
    return '<div class="card" style="padding:12px; margin-top:9px;">'
      + '<div style="display:flex; justify-content:space-between; gap:9px; align-items:center;">'
      +   '<b>' + esc(a.name || '—') + '</b>'
      +   '<span style="font-size:11.5px;">' + esc(AP_STATUS[a.status || 'new'] || '') + '</span></div>'
      + '<div style="font-size:11.5px; color:var(--sub); margin-top:4px; line-height:1.9;">'
      +   '🎂 ' + esc(String(a.age || '—')) + ' سنة · 📱 ' + esc(a.phone || '') + '<br>'
      +   '📍 ' + esc(a.area || '—') + ' · 🚌 ' + esc(a.commute || '—') + '<br>'
      +   '💼 ' + esc(roles || '—') + '<br>'
      +   '🏬 ' + esc((a.branches || []).join(' · ')) + ' · ' + esc(AP_SHIFTS[a.shift] || '') + '<br>'
      +   '🕐 يبدأ ' + esc(a.startWhen || '—')
      +   ((a.offDays && a.offDays.length) ? (' · مش متاح ' + esc(a.offDays.join('،'))) : '') + '<br>'
      +   '🧰 ' + (a.expRetail ? esc(a.expWhere || 'خبرة سابقة') : 'أول مرة')
      +   ' · كاشير: ' + esc({ good:'يعرف', some:'شوية', no:'لأ' }[a.expCashier] || '—') + '<br>'
      +   (a.studying ? ('🎓 ' + esc(a.college || '') + (a.classes ? (' · ' + esc(a.classes)) : '') + '<br>') : '')
      +   (a.portfolio ? ('🔗 <a href="' + esc(a.portfolio) + '" target="_blank" rel="noopener" style="color:var(--gold);">شغله</a><br>') : '')
      +   (a.notes ? ('📝 ' + esc(a.notes) + '<br>') : '')
      /* ⏳ التاريخ المطلق زي ما هو، و«بقاله» جنبه — ولو الطلب لسه
         `new` (محدش ردّ عليه) وعدّى أسبوع، سطر تحذير منفصل بلون
         مختلف عشان يلفت النظر وهو بيقلّب سريع. */
      +   '📣 عرف عننا من: ' + esc(a.source || '—') + ' · ' + esc(dstr(a.ts || 0))
      +     ' · <span style="color:var(--sub);">' + esc(agoStr(a.ts || 0)) + '</span>'
      + ((agoStale(a.ts, 7) && (a.status || 'new') === 'new')
          ? ('<br><span style="color:var(--bad); font-weight:800;">⏳ لسه من غير رد ' + esc(agoStr(a.ts || 0)) + ' — يستاهل قرار</span>')
          : '')
      + '</div>'
      + '<div style="display:flex; gap:6px; margin-top:10px; flex-wrap:wrap;">'
      +   '<a href="https://wa.me/2' + esc(a.whatsapp || a.phone) + '" target="_blank" rel="noopener"'
      +     ' style="flex:1 1 88px; text-align:center; padding:9px; border-radius:9px;'
      +     ' background:var(--plus); color:#062; font-weight:800; font-size:12.5px; text-decoration:none;">💬 واتساب</a>'
      +   '<button onclick="apSet(\'' + esc(a.id) + '\',\'interview\')" style="flex:1 1 78px;">📞 مقابلة</button>'
      +   '<button onclick="apInvite(\'' + esc(a.id) + '\')" style="flex:1 1 108px; background:var(--gold); color:#241a05;">🔗 ادعُه للتسجيل</button>'
      +   '<button onclick="apSet(\'' + esc(a.id) + '\',\'rejected\')" style="flex:0 0 68px; background:var(--minus);">✖</button>'
      + '</div></div>';
  }).join('');
}

window.apSet = async function(id, status){
  const a = (_apList || []).filter(function(x){ return x.id === id; })[0];
  if(!a) return;
  if(status === 'rejected' && !confirm('✖ ترفض ' + (a.name || '') + '؟')) return;
  try{ await db.collection('job_applications').doc(id).update({ status: status, statusAt: Date.now() }); }
  catch(e){ alert('ماتغيّرش: ' + (e.code || e.message)); }
};

// 🔗 من متقدّم لدعوة تسجيل — ده اللي بيقفل الحلقة
window.apInvite = async function(id){
  const a = (_apList || []).filter(function(x){ return x.id === id; })[0];
  if(!a) return;
  const br = (a.branches && a.branches[0]) || '';
  const role = (a.roles && a.roles[0]) || 'sales_social';
  const brand = /glow/i.test(br) ? 'glow' : 'echarpe';
  if(!confirm('🔗 دعوة تسجيل لـ' + (a.name || '') + '\n\n'
    + (brand === 'glow' ? 'Glow' : 'echarpe — ' + br) + '\n'
    + (HIRE_ROLES[role] || AP_ROLES[role] || role) + '\n\n'
    + 'الرابط شغّال مرة واحدة وينتهي بعد ٣ أيام.')) return;
  const code = hvCode();
  try{
    await db.collection('staff_invites').doc(code).set({
      code: code, brand: brand, branch: (brand === 'glow' ? 'Glow' : br), role: role,
      createdAt: Date.now(), expiresAt: Date.now() + 3*86400000,
      usedAt: null, createdBy: 'office', applicantPhone: a.phone || '', applicantName: a.name || ''
    });
    await db.collection('job_applications').doc(id)
      .update({ status:'hired', statusAt: Date.now(), inviteCode: code }).catch(function(){});
    const link = hvLink(code);
    if(confirm('✅ الرابط جاهز:\n\n' + link + '\n\nتنسخه؟')) hvCopy(link);
  }catch(e){ alert('ماتعملش: ' + (e.code || e.message)); }
};

function ofWireApplicants(){
  const sel = $('#apStatus'); if(!sel) return;
  const bs = $('#apBranch');
  if(bs && bs.options.length <= 1){
    hvBranches().forEach(function(b){
      const o = document.createElement('option'); o.value = b; o.textContent = b; bs.appendChild(o);
    });
  }
  ['#apStatus','#apBranch','#apShift'].forEach(function(q){
    const el = $(q); if(el) el.onchange = ofRenderApplicants;
  });
  ofRenderApplicants();
}

/* ============================================================
   📌 الشواغر — أي فرع محتاج أي وظيفة
   استمارة التقديم بتقرا من هنا وبتعرض المتاح بس، فمحدش بيقدّم على فرع
   مش محتاج حد. والقايمة في `pos_test_settings/job_openings`.
   ============================================================ */
const OP_ROLES = { sales_social:'مبيعات وسوشيال', cashier:'كاشير ومبيعات', setup:'تجهيز الفرع ٧–١٠' };
let _opOpen = [];

function opHas(br, role){
  return _opOpen.some(function(o){ return o && o.branch === br && o.role === role; });
}
window.opToggle = function(br, role){
  if(opHas(br, role)){
    _opOpen = _opOpen.filter(function(o){ return !(o.branch === br && o.role === role); });
  }else{
    _opOpen.push({ branch: br, role: role });
  }
  ofRenderOpenings();
};

function ofRenderOpenings(){
  const w = $('#opGrid'); if(!w) return;
  const brs = hvBranches();
  const list = brs.length ? brs : ['الرحاب','مدينتي','سيتي سنتر','Glow'];
  w.innerHTML = list.map(function(br){
    return '<div class="card" style="padding:11px; margin-top:9px;">'
      + '<b style="font-size:13.5px;">' + esc(br) + '</b>'
      + '<div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">'
      + Object.keys(OP_ROLES).map(function(r){
          const on = opHas(br, r);
          return '<button onclick="opToggle(\'' + esc(br) + '\',\'' + r + '\')" '
            + 'style="flex:1 1 auto; font-size:11.5px; padding:8px 10px;'
            + (on ? ' background:var(--plus); color:#062;' : ' background:var(--panel2); color:var(--sub);')
            + '">' + (on ? '✅ ' : '') + esc(OP_ROLES[r]) + '</button>';
        }).join('')
      + '</div></div>';
  }).join('')
  + '<div class="hint" style="margin-top:10px;">المفتوح دلوقتي: <b>' + _opOpen.length + '</b> شاغر</div>';
}

function ofWireOpenings(){
  const btn = $('#opSave'); if(!btn) return;
  db.collection('pos_test_settings').doc('job_openings').get().then(function(d){
    _opOpen = (d.exists && Array.isArray((d.data() || {}).list)) ? d.data().list : [];
    ofRenderOpenings();
  }).catch(function(){ ofRenderOpenings(); });
  btn.onclick = async function(){
    btn.disabled = true; btn.textContent = 'بيحفظ…';
    try{
      await db.collection('pos_test_settings').doc('job_openings')
        .set({ list: _opOpen, at: Date.now() }, { merge:true });
      btn.textContent = 'اتحفظ ✅';
      setTimeout(function(){ btn.textContent = '💾 احفظ الشواغر'; btn.disabled = false; }, 1400);
    }catch(e){
      btn.disabled = false; btn.textContent = '💾 احفظ الشواغر';
      alert('ماتحفظش: ' + (e.code || e.message));
    }
  };
}

/* ============================================================
   💳 لوحة الرصيد وكروت الهدايا — Office
   ------------------------------------------------------------
   ٣ حاجات:
     ١. 📝 طابور طلبات الكاشير (المالك بيوافق أو يرفض)
     ٢. 🎁 حالة الكروت (مباع · متصرف · معلّق)
     ٣. 📒 آخر حركات الرصيد

   ⚠️ الموافقة **مبتكتبش رصيد من هنا**. بتنادي `creditAdjust`
      وهي بتكتب. لو Office كتب مباشرة، يبقى فيه بابين للفلوس —
      وباب الدفتر والتكرار والمعاملة الذرّية كله بيتلف.
   ============================================================ */

/* 🔔 عدّاد طلبات الرصيد المستنية
   ⚠️ من غيره الطلب بيفضل في الشاشة ومحدش واخد باله — والكاشير
      اللي طلبت فاكرة إنك شفته. الطلبات دي فلوس بتتضاف من العدم،
      فتأخيرها مش تفصيلة. */
function ofSyncCreditBadge(){
  const el = document.getElementById('nbMoney'); if(!el) return;
  // 💳↩️ v44: فروق الفيزا المستحقة بتنوّر البادج برضه — فلوس عميلات مش مستنية
  const n = (D.creditRequests || []).filter(function(r){
    return r && r.status === 'pending'; }).length
    + (D.refundsDue || []).filter(function(r){ return r && r.status === 'due'; }).length;
  el.textContent = n;
  el.style.display = n ? '' : 'none';
}
window.ofSyncCreditBadge = ofSyncCreditBadge;

function renderCreditAdmin(){
  ofSyncCreditBadge();
  const host = document.getElementById('creditAdminBody');
  if(!host) return;

  const reqs = (D.creditRequests || []).filter(function(r){ return r.status === 'pending'; });
  const cards = D.giftCards || [];
  const led = D.creditLedger || [];

  // 🎁 ملخص الكروت
  let sold = 0, spent = 0, pending = 0, live = 0;
  cards.forEach(function(c){
    const v = Number(c.value) || 0;
    if(c.status === 'pending'){ pending += v; return; }
    if(c.status === 'void') return;
    sold += v;
    const rem = Number(c.remaining) || 0;
    spent += (v - rem);
    live += rem;
  });

  const box = function(ic, label, val, color){
    return '<div style="flex:1; background:var(--bg); border:1px solid var(--line);'
      + ' border-radius:11px; padding:9px; min-width:0;">'
      + '<div class="muted" style="font-size:11px;">' + ic + ' ' + label + '</div>'
      + '<b style="font-size:15px;' + (color ? ' color:' + color + ';' : '') + '">'
      + egp(val) + '</b></div>';
  };

  host.innerHTML =
    // ── ١) طابور الموافقات ──────────────────────────────
    (reqs.length
      ? '<div style="background:rgba(245,158,11,.1); border:1px solid var(--warn);'
        + ' border-radius:12px; padding:11px; margin-bottom:11px;">'
        + '<b style="font-size:13px;">📝 طلبات مستنية موافقتك (' + reqs.length + ')</b>'
        + '<div class="hint" style="margin:5px 0 8px;">دي فلوس هتتضاف من العدم — '
        + 'راجعها كويس قبل ما توافق.</div>'
        + reqs.map(function(r){
            return '<div style="background:var(--card); border:1px solid var(--line);'
              + ' border-radius:10px; padding:9px; margin-top:7px;">'
              + '<div style="display:flex; justify-content:space-between; align-items:center;">'
              +   '<b style="font-size:13px;">' + egp(r.amount) + '</b>'
              +   '<span class="muted" style="font-size:11px;">' + esc(r.byName || '') + '</span></div>'
              + '<div style="font-size:12px; margin-top:3px;">📱 ' + esc(r.phone) + '</div>'
              + '<div class="muted" style="font-size:11.5px; margin-top:2px;">'
              +   esc(r.reason || '') + ' · ' + esc(r.branch || '') + ' · ' + dstr(r.at) + '</div>'
              + '<div style="display:flex; gap:6px; margin-top:8px;">'
              +   '<button class="btn" onclick="approveCreditReq(\'' + r.id + '\')"'
              +     ' style="flex:1; font-size:12px;">✅ وافق</button>'
              +   '<button class="btn" onclick="rejectCreditReq(\'' + r.id + '\')"'
              +     ' style="flex:1; font-size:12px;">✖️ ارفض</button>'
              + '</div></div>';
          }).join('')
        + '</div>'
      : '')

    // ── ٢) ملخص الكروت ──────────────────────────────────
    + '<div style="display:flex; gap:7px; flex-wrap:wrap;">'
    +   box('🎁', 'كروت مباعة', sold)
    +   box('💳', 'اتصرف', spent, 'var(--good)')
    +   box('📕', 'لسه عليك', live, 'var(--warn)')
    + '</div>'
    + (pending > 0
        ? '<div class="hint" style="margin-top:7px;">⏳ كروت اتصدرت ومااتدفعتش: '
          + egp(pending) + ' — دي مش محسوبة عليك (مش شغّالة).</div>'
        : '')
    + '<div class="hint" style="margin-top:7px;">📕 "لسه عليك" = فلوس قبضتها '
    + 'والعميلات لسه ماخدوش بضاعتها. بتتطرح من "اللي ليك فعلًا" في تبويب 💵 إيدك.</div>'

    // ── ٣) آخر الحركات ──────────────────────────────────
    + (led.length
        ? '<div style="margin-top:12px;">'
          + '<b style="font-size:12.5px;">📒 آخر حركات الرصيد</b>'
          + led.slice(0, 12).map(function(x){
              const a = Number(x.amount) || 0;
              return '<div style="display:flex; justify-content:space-between;'
                + ' padding:7px 2px; border-bottom:1px solid var(--line); font-size:12px;">'
                + '<span>' + creditKindLabel(x) + '<br>'
                +   '<span class="muted" style="font-size:10.5px;">' + esc(x.phone || '')
                +   ' · ' + dstr(x.at) + '</span></span>'
                + '<b style="color:' + (a < 0 ? 'var(--bad)' : 'var(--good)') + ';">'
                +   (a < 0 ? '−' : '+') + egp(Math.abs(a)) + '</b></div>';
            }).join('')
          + '</div>'
        : '<div class="hint" style="margin-top:10px;">لسه مفيش حركات رصيد</div>');
}
window.renderCreditAdmin = renderCreditAdmin;

function creditKindLabel(x){
  const t = x && x.type;
  if(t === 'gift_card')   return '🎁 كارت هدية';
  if(t === 'change_kept') return '💵 باقي محفوظ';
  if(t === 'spend')       return '🛍️ صرف على فاتورة';
  if(t === 'manual')      return '✏️ ' + esc(x.reason || 'تعديل');
  return 'حركة';
}

/* ✅ الموافقة — بتنادي الفنكشن، مبتكتبش رصيد بنفسها */
async function approveCreditReq(id){
  const r = (D.creditRequests || []).filter(function(x){ return x.id === id; })[0];
  if(!r) return;
  if(!confirm('توافق على إضافة ' + egp(r.amount) + ' لحساب ' + r.phone + '؟\n\n'
    + 'السبب: ' + (r.reason || '—') + '\n'
    + 'طالبها: ' + (r.byName || '—') + '\n\n'
    + '⚠️ دي فلوس بتتضاف من العدم.')) return;
  try{
    const fn = ofApp.functions('us-central1').httpsCallable('creditAdjust');
    // 🔁 مفتاح التكرار من الطلب نفسه — الموافقة مرتين بالغلط
    //    مبتضيفش الفلوس مرتين.
    await fn({ phone: r.phone, amount: r.amount, reason: r.reason,
               idem: 'req:' + id, source: 'approved' });
    await db.collection('credit_requests').doc(id)
      .set({ status:'approved', decidedAt: Date.now() }, { merge: true });
  }catch(e){ alert('ماتمّتش: ' + (e.message || e.code)); }
}
window.approveCreditReq = approveCreditReq;

async function rejectCreditReq(id){
  if(!confirm('ترفض الطلب ده؟')) return;
  try{
    await db.collection('credit_requests').doc(id)
      .set({ status:'rejected', decidedAt: Date.now() }, { merge: true });
  }catch(e){ alert('ماتمّتش: ' + (e.message || e.code)); }
}
window.rejectCreditReq = rejectCreditReq;

/* ============================================================
   📒 شاشة دفتر اليومية
   ------------------------------------------------------------
   شيت زي الإكسل: كل يوم سطر، كل خانة تتدوس تتعدّل.
   ⚠️ الشاشة **مبتحسبش أي حاجة** — كل الأرقام جاية من `ofCashLedger`
      اللي متختبر لوحده. الفصل ده هو اللي بيخلي الأرقام قابلة للمراجعة.
   ============================================================ */

let _ofLedgerDays = 14;        // كام يوم بيبان
let _ofLedgerOpen = '';        // اليوم المفتوح بالتفصيل
let _ofCashDetailsOpen = false; // v63: التفاصيل مقفولة افتراضيًا عشان الصفحة تبقى حكم سريع مش شيت طويل

function ofLedgerCfg(){
  return (D.cashCfg || {});
}

// الخانات وأسماؤها في الشاشة — مصدر واحد عشان الشاشة والتعديل مايختلفوش
const OF_CELL_META = {
  cashSales: { ic:'💵', name:'كاش الفروع',  dir:1  },
  visaSales: { ic:'💳', name:'فيزا اتباعت', dir:0  },
  pmIn:      { ic:'🏦', name:'نزل من Paymob', dir:1 },
  otherIn:   { ic:'➕', name:'وارد تاني',    dir:1  },
  expenses:  { ic:'🧾', name:'مصاريف تشغيل', dir:-1 },
  supplierPayments:{ic:'📦',name:'دفعات تجار', dir:-1},
  salaries:  { ic:'💼', name:'رواتب',       dir:-1 },
  advances:  { ic:'🤝', name:'سلف',         dir:-1 },
  rewards:   { ic:'🎁', name:'مكافآت',      dir:-1 },
  otherOut:  { ic:'➖', name:'منصرف تاني',  dir:-1 }
};

function ofDayName(key){
  try{
    const [y, m, d] = String(key).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('ar-EG',
      { weekday:'short', day:'numeric', month:'short', timeZone:'UTC' });
  }catch(e){ return key; }
}

function renderCashHand(){
  const host = document.getElementById('cashHandBody');
  if(!host) return;
  const base = D.cashBase;
  const now = Date.now();
  const cfg = ofLedgerCfg();
  try{ setTimeout(function(){ ofAutoUpdateGoldPrice(false); },0); }catch(e){}

  if(!base || !base.atMs){
    host.innerHTML =
      '<div class="of-cash-hero">'
      + '<div class="of-cash-caption">أول مرة؟ خلّي «معايا كام» رقم حقيقي من البداية</div>'
      + '<div style="font-size:21px;font-weight:900;text-align:center;margin:8px 0 4px;">حدد نقطة البداية</div>'
      + '<div class="of-cash-sub">اكتب السيولة المؤكدة (كاش + حساب بنكي تشغيلي)، وبعدها اللي لسه عند Paymob.</div>'
      + '</div>'
      + '<button class="btn" onclick="ofStartFresh()" style="width:100%;margin-top:9px;">🆕 ابدأ من الصفر — نقطة واضحة</button>';
    try{ renderOfficeHomeSummary(); }catch(e){}
    return;
  }

  const L = ofCashLedger(base, D, D.cashDays || {}, cfg, now, 5);
  ofAutoFreeze(L);                       // 🧊 تثبيت الأيام اللي قربت تخرج من النافذة
  const W = ofWealth(L, cfg, now);
  const gold = W.goldInfo;

  // 🔍 جودة الرقم: آخر مراجعة فعلية + أي يوم قديم غير موثوق.
  const realRows = (L.rows || []).filter(function(r){ return !r.future && r.key <= L.todayKey; });
  const countedRows = realRows.filter(function(r){ return r.counted !== null; });
  const lastCount = countedRows.length ? countedRows[countedRows.length - 1] : null;
  const hasUntrusted = realRows.some(function(r){ return r.untrusted; });
  let confidence = 'محتاج مراجعة فعلية';
  let confidenceIcon = '🟠';
  if(hasUntrusted){
    confidence = 'في أيام قديمة بياناتها ناقصة';
    confidenceIcon = '🔴';
  }else if(lastCount && lastCount.key === L.todayKey){
    confidence = 'مراجع النهارده';
    confidenceIcon = '🟢';
  }else if(lastCount){
    const a = Date.UTC.apply(Date, lastCount.key.split('-').map(function(x,i){ return Number(x) - (i===1?1:0); }));
    const b = Date.UTC.apply(Date, L.todayKey.split('-').map(function(x,i){ return Number(x) - (i===1?1:0); }));
    const age = Math.max(0, Math.round((b-a)/86400000));
    confidence = age <= 3 ? ('آخر مراجعة من ' + age + ' يوم') : ('المراجعة قديمة — ' + age + ' يوم');
    confidenceIcon = age <= 3 ? '🟡' : '🟠';
  }

  const pendingLabel = W.pmDayKeys && W.pmDayKeys.length
    ? ('فيزا ' + W.pmDayKeys.map(ofDayName).join(' و'))
    : 'حسب دورة التحويل';

  /* الرقم الرئيسي = المؤكد فقط.
     ⭐ ده جواب «معايا كام؟» داخل النظام، ومقصود إنه لا يضم Paymob اللي لسه
        ماوصلش ولا الدهب. اسم «معاك في إيدك» القديم كان مضلل لأن الدفتر
        بيجمع كاش + تحويلات بنك مسجلة؛ المعنى الصحيح هو «السيولة المؤكدة». */
  const hero =
    '<div class="of-cash-hero">'
    + '<div class="of-cash-caption">💰 معايا كام دلوقتي؟</div>'
    + '<div class="of-cash-big">' + egp(L.now) + '</div>'
    + '<div class="of-cash-sub">السيولة المؤكدة بالنظام: كاش + بنك تشغيلي مسجل − المصاريف والمدفوعات.<br>'
    + 'ده الرقم اللي تعتمد عليه للصرف الآن، مش المتوقع.</div>'
    + '<div class="of-confidence"><span>' + confidenceIcon + ' ' + confidence + '</span></div>'
    + '</div>';

  const giftDue = W.giftLiability > 0;

  const cards =
    '<div class="of-cash-grid">'
    + '<div class="of-money-card"><div class="k">🏦 عند Paymob — لسه ماوصلش</div><div class="v">' + egp(W.paymobNet) + '</div>'
    + '<div class="s">' + pendingLabel + ' · مش متاح للصرف لسه</div></div>'
    + '<div class="of-money-card"><div class="k">🎁 التزامات كروت</div><div class="v" style="color:' + (giftDue ? 'var(--bad)' : 'var(--good)') + ';">'
    + (giftDue ? ('− ' + egp(W.giftLiability)) : egp(0)) + '</div><div class="s">فلوس في إيدك مش بتاعتك لحد ما الكارت يتصرف</div></div>'
    + '<div class="of-money-card"><div class="k">🥇 دهب</div><div class="v">' + egp(W.gold) + '</div>'
    + '<div class="s">' + (gold.grams ? (gold.grams + ' جرام · 24K') : 'مش متسجل')
    + (gold.price ? (' · '+egp(gold.price)+'/جم') : '')
    + (gold.stale && gold.grams ? ' · السعر قديم' : '')
    + (gold.source ? (' · '+esc(gold.source)) : '') + '</div></div>'
    + '<div class="of-money-card"><div class="k">🧮 اللي ليك فعلًا</div><div class="v">' + egp(W.total) + '</div>'
    + '<div class="s">المؤكد + Paymob المنتظر + الدهب − الالتزامات</div></div>'
    + '</div>';

  const weeklyCycle = ofPaymobNextCycle(D,L.todayKey);
  const weeklyBox = weeklyCycle
    ? ('<div class="of-verdict" style="border-color:'+(weeklyCycle.due?'var(--warn)':'var(--line)')+';">'
      + '<div class="of-verdict-row"><div><b>🏦 تحويل Paymob الأسبوعي</b>'
      + '<div class="muted">'+(weeklyCycle.due?'مستني تأكيدك':'التحويل الجاي')
      +' · الثلاثاء '+ofDayName(weeklyCycle.payout)+'</div></div>'
      + (weeklyCycle.due?"<button class='btn gold' onclick=\"ofConfirmWeeklyPaymob('"+weeklyCycle.end+"')\">✅ أكد المبلغ</button>":'')
      + '</div><div class="of-cash-grid" style="margin-top:8px;">'
      + '<div class="of-money-card"><div class="k">إجمالي الفيزا</div><div class="v">'+egp(weeklyCycle.gross)+'</div><div class="s">'+ofDayName(weeklyCycle.start)+' → '+ofDayName(weeklyCycle.end)+'</div></div>'
      + '<div class="of-money-card"><div class="k">المتوقع ينزل</div><div class="v">'+egp(weeklyCycle.expectedNet)+'</div><div class="s">عمولة متوقعة '+egp(weeklyCycle.expectedFee)+' ('+weeklyCycle.pct+'%)</div></div>'
      + '</div></div>')
    : '';

  const verdict =
    '<div class="of-verdict">'
    + '<div class="of-verdict-row"><div><b>الحكم السريع</b><div class="muted">لو هتصرف دلوقتي، اعتمد على «السيولة المؤكدة» فوق.</div></div>'
    + '<button class="btn gold" onclick="ofCountDay(\'' + L.todayKey + '\')" style="white-space:nowrap;">🔍 راجع الرقم</button></div>'
    + (W.paymobOpeningLanded
        ? '<div style="margin-top:8px;color:var(--warn);font-size:11px;font-weight:800;">⚠️ رصيد Paymob الافتتاحي لسه غير مؤكد. أول تحويل أسبوعي تأكده هيقفل الجزء القديم تلقائيًا.</div>'
        : '')
    + '<div class="hint" style="margin-top:8px;line-height:1.8;">'
    + '⚠️ النظام مش متصل بحساب البنك نفسه. أي حركة بنكية خارج المبيعات/المصاريف المسجلة لازم تدخلها أو تعمل مراجعة للسيولة، وإلا «معايا كام» مش هيقدر يعرفها لوحده.'
    + '</div>'
    + '<div class="of-quick">'
    + '<button class="btn" onclick="ofAddSettlement()">🏦 تحويل استثنائي/تصحيح</button>'
    + '<button class="btn" onclick="ofGoldRefreshNow()">🥇 تحديث الدهب الآن</button>'
    + '</div>'
    + '<div style="text-align:center;margin-top:6px;"><button class="ghost" onclick="ofSetGoldPrice()" style="padding:5px 9px;font-size:10px;">✍️ تعديل سعر الدهب يدويًا 24 ساعة</button></div>'
    + '</div>';

  let details = '';
  if(_ofCashDetailsOpen){
    const rows = L.rows.slice(-_ofLedgerDays).reverse();
    const sheet = rows.map(function(r){ return ofLedgerRow(r, L); }).join('');
    details =
      '<div class="of-verdict" style="margin-top:9px;">'
      + '<div class="of-verdict-row"><div><b>📒 يوم بيوم</b><div class="muted">دوس على أي يوم عشان تفهم أو تعدّل الحركة</div></div>'
      + '<button class="ghost" onclick="ofToggleCashDetails()" style="padding:7px 10px;">إخفاء</button></div>'
      + '<div style="margin-top:7px;">' + (sheet || '<div class="muted">لسه مفيش حركة</div>') + '</div>'
      + (L.rows.length > _ofLedgerDays
          ? '<button class="btn" onclick="ofMoreDays()" style="width:100%;margin-top:9px;">📆 أيام أكتر</button>' : '')
      + '<div style="display:flex;gap:7px;margin-top:10px;">'
      + '<button class="btn" onclick="ofSetGoldGrams()" style="flex:1;">⚖️ جرامات الدهب</button>'
      + '<button class="btn" onclick="ofStartFresh()" style="flex:1;background:#fff;color:var(--bad);border:1px solid var(--line);">🆕 نقطة بداية جديدة</button>'
      + '</div>'
      + '</div>';
  }else{
    details = '<button class="of-details-toggle" onclick="ofToggleCashDetails()">📒 افتح التفاصيل يوم بيوم</button>';
  }

  // 📜 نحافظ على العبارة القديمة في الشرح عشان أي حد متعود عليها يفهم الانتقال:
  // «معاك في إيدك» = دلوقتي اسمها الأدق «السيولة المؤكدة».
  host.innerHTML = hero + cards + weeklyBox + verdict + details;
  try{ renderOfficeHomeSummary(); }catch(e){}
}
window.renderCashHand = renderCashHand;
function ofToggleCashDetails(){
  _ofCashDetailsOpen = !_ofCashDetailsOpen;
  renderCashHand();
}
window.ofToggleCashDetails = ofToggleCashDetails;


/* 🧊 التثبيت التلقائي — مرة واحدة في الجلسة لكل يوم
   بيكتب أرقام اليوم في مستنده قبل ما فواتيره تخرج من نافذة الـ٣٠ يوم. */
const _ofFrozen = {};
function ofAutoFreeze(L){
  try{
    const due = ofFreezeDue(L, D.cashDays || {}, Date.now());
    due.forEach(function(x){
      if(_ofFrozen[x.key]) return;
      _ofFrozen[x.key] = 1;
      db.collection('office_cash_days').doc(x.key)
        .set({ frozen: x.frozen, updatedAt: Date.now() }, { merge: true })
        .catch(function(e){ console.warn('freeze ' + x.key, e && e.code); });
    });
  }catch(e){ console.warn('autofreeze', e); }
}

function ofMiniCard(title, val, sub){
  return '<div style="flex:1; background:var(--bg); border:1px solid var(--line); border-radius:11px; padding:9px;">'
    + '<div class="muted" style="font-size:11px;">' + title + '</div>'
    + '<b style="font-size:15px;">' + egp(val) + '</b>'
    + '<div class="muted" style="font-size:10.5px; margin-top:1px;">' + sub + '</div></div>';
}

/* سطر اليوم — مقفول بيبان ملخّص، مفتوح بيبان كل خانة قابلة للتعديل */
function ofLedgerRow(r, L){
  const open = _ofLedgerOpen === r.key;
  const anyEdit = Object.keys(r.edited).some(function(k){ return r.edited[k]; });
  const bg = r.weekend ? 'background:rgba(148,163,184,.07);' : '';

  let head = '<div onclick="ofToggleDay(\'' + r.key + '\')" style="cursor:pointer; padding:9px 7px; '
    + bg + ' border-bottom:1px solid var(--line);">'
    + '<div style="display:flex; justify-content:space-between; align-items:center;">'
    + '<b style="font-size:12.5px;">' + (open ? '▾ ' : '▸ ') + ofDayName(r.key)
    +   (r.isToday ? ' <span style="color:var(--good); font-size:10.5px;">النهاردة</span>' : '')
    +   (r.weekend ? ' <span class="muted" style="font-size:10.5px;">إجازة بنك</span>' : '')
    +   (anyEdit ? ' <span style="font-size:10.5px;">✏️</span>' : '')
    +   (r.frozen ? ' <span class="muted" style="font-size:10.5px;">🧊 مقفول</span>' : '')
    +   (r.untrusted ? ' <span style="font-size:10.5px; color:var(--warn);">🚧 أرقام ناقصة</span>' : '')
    + '</b>'
    + '<span style="font-size:12.5px;">معاك <b>' + egp(r.balance) + '</b></span>'
    + '</div>';

  const bits = [];
  if(r.val.cashSales) bits.push('💵 ' + egp(r.val.cashSales));
  if(r.val.visaSales) bits.push('💳 ' + egp(r.val.visaSales));
  if(r.val.pmIn)      bits.push('🏦 +' + egp(r.val.pmIn));
  if(r.gcSold)        bits.push('🎁 ' + egp(r.gcSold));
  if(r.gcSpent)       bits.push('💳 −' + egp(r.gcSpent));
  if(r.out)           bits.push('📤 −' + egp(r.out));
  if(bits.length) head += '<div class="muted" style="font-size:11.5px; margin-top:3px;">' + bits.join(' · ') + '</div>';

  // 🔮 المتوقّع — بالخط المتقطّع عشان يبان إنه لسه ماوصلش
  if(r.pmExpected > 0){
    head += '<div style="margin-top:5px; border:1px dashed var(--warn); border-radius:8px;'
      + ' padding:5px 8px; font-size:11.5px;">🔮 متوقّع ينزل <b>' + egp(r.pmExpected) + '</b>'
      + (r.pmFrom.length ? ' <span class="muted">(فيزا ' + r.pmFrom.map(ofDayName).join(' و') + ')</span>' : '')
      + '</div>';
  }
  // 🔍 فرق العدّ — ده أداة الحكم على الفلوس
  if(r.variance !== null && r.variance !== 0){
    const bad = r.variance < 0;
    head += '<div style="margin-top:5px; font-size:11.5px; color:' + (bad ? 'var(--bad)' : 'var(--warn)') + ';">'
      + (bad ? '🔻 عجز ' : '🔺 أوفر ') + egp(Math.abs(r.variance))
      + ' <span class="muted">(عدّيت ' + egp(r.counted) + ')</span></div>';
  }
  head += '</div>';
  if(!open) return head;

  /* ── مفتوح: كل خانة سطر بيتدوس عليه ── */
  const cells = Object.keys(OF_CELL_META).map(function(f){
    const m = OF_CELL_META[f];
    const v = r.val[f];
    if(!v && !r.edited[f] && f !== 'cashSales' && f !== 'expenses') return '';
    const col = m.dir < 0 ? 'var(--bad)' : (m.dir > 0 ? 'var(--good)' : 'var(--muted)');
    return '<div onclick="ofEditCell(\'' + r.key + '\',\'' + f + '\')" '
      + 'style="display:flex; justify-content:space-between; padding:7px 4px; cursor:pointer;'
      + ' border-bottom:1px solid var(--line); font-size:12.5px;">'
      + '<span>' + m.ic + ' ' + m.name + (r.edited[f] ? ' ✏️' : '') + '</span>'
      + '<b style="color:' + col + ';">' + egp(v)
      + (r.edited[f] ? ' <span class="muted" style="font-weight:400; font-size:10.5px;">(محسوب ' + egp(r.raw[f]) + ')</span>' : '')
      + '</b></div>';
  }).join('');

  return head
    + '<div style="' + bg + ' padding:8px 9px 12px; border-bottom:1px solid var(--line);">'
    + cells
    + '<div style="display:flex; justify-content:space-between; padding:8px 4px 0; font-weight:900; font-size:13px;">'
    +   '<span>الرصيد آخر اليوم</span><span>' + egp(r.balance) + '</span></div>'
    + (r.pmExpected > 0
        ? '<div class="muted" style="display:flex; justify-content:space-between; padding:2px 4px; font-size:11.5px;">'
          + '<span>لو التوقّع نزل</span><span>' + egp(r.balanceExp) + '</span></div>' : '')
    + '<div style="display:flex; gap:6px; margin-top:9px;">'
    +   '<button class="btn" onclick="ofCountDay(\'' + r.key + '\')" style="flex:1; font-size:12px;">🔍 عدّيت كام؟</button>'
    +   (Object.keys(r.edited).some(function(k){ return r.edited[k]; }) || r.counted !== null
        ? '<button class="btn" onclick="ofResetDay(\'' + r.key + '\')" style="flex:1; font-size:12px;">↩️ رجّع المحسوب</button>' : '')
    + '</div>'
    + (r.note ? '<div class="muted" style="font-size:11px; margin-top:6px;">📝 ' + esc(r.note) + '</div>' : '')
    + '</div>';
}

function ofToggleDay(k){ _ofLedgerOpen = (_ofLedgerOpen === k ? '' : k); renderCashHand(); }
function ofMoreDays(){ _ofLedgerDays += 14; renderCashHand(); }
window.ofToggleDay = ofToggleDay; window.ofMoreDays = ofMoreDays;

/* ✏️ تعديل خانة — بيتسجّل مين وامتى وإيه الرقم المحسوب الأصلي */
async function ofEditCell(key, field){
  const m = OF_CELL_META[field];
  if(!m) return;
  const L = ofCashLedger(D.cashBase, D, D.cashDays || {}, ofLedgerCfg(), Date.now(), 5);
  const r = L.rows.filter(function(x){ return x.key === key; })[0];
  if(!r) return;
  const v = prompt(m.ic + ' ' + m.name + ' — ' + ofDayName(key)
    + '\n\nالنظام حسبها: ' + egp(r.raw[field])
    + '\nاكتب الرقم الصح (سيبها فاضية عشان ترجع للمحسوب):',
    r.edited[field] ? String(r.val[field]) : '');
  if(v === null) return;

  const doc = db.collection('office_cash_days').doc(key);
  try{
    if(String(v).trim() === ''){
      const cur = (D.cashDays || {})[key] || {};
      const ov = Object.assign({}, cur.ov || {});
      delete ov[field];
      await doc.set({ ov: ov, updatedAt: Date.now() }, { merge: true });
      return;
    }
    const n = Math.round((Number(v) || 0) * 100) / 100;
    if(!isFinite(n) || n < 0){ alert('رقم مش صح'); return; }
    // 🧾 أثر المراجعة: بنسجّل الرقم المحسوب وقت التعديل ومين عدّله
    await doc.set({
      ov: Object.assign({}, ((D.cashDays || {})[key] || {}).ov || {}, { [field]: n }),
      audit: firebase.firestore.FieldValue.arrayUnion({
        field: field, from: r.raw[field], to: n, at: Date.now(), by: 'office'
      }),
      updatedAt: Date.now()
    }, { merge: true });
  }catch(e){ alert('ماتحفظش: ' + (e.code || e.message)); }
}
window.ofEditCell = ofEditCell;

/* 🔍 العدّ الفعلي — الفرق هو أداة الحكم، مش تعديل صامت للرصيد */
async function ofCountDay(key){
  const L = ofCashLedger(D.cashBase, D, D.cashDays || {}, ofLedgerCfg(), Date.now(), 5);
  const r = L.rows.filter(function(x){ return x.key === key; })[0];
  if(!r) return;
  const v = prompt('🔍 راجع السيولة الفعلية — ' + ofDayName(key)
    + '\n\nالنظام حاسب: ' + egp(r.balance)
    + '\nاكتب إجمالي السيولة المؤكدة عندك الآن (كاش + رصيد الحساب التشغيلي).'
    + '\nفاضي = امسح المراجعة:',
    r.counted !== null ? String(r.counted) : '');
  if(v === null) return;
  try{
    if(String(v).trim() === ''){
      await db.collection('office_cash_days').doc(key)
        .set({ counted: null, updatedAt: Date.now() }, { merge: true });
      return;
    }
    const n = Math.round((Number(v) || 0) * 100) / 100;
    if(!isFinite(n) || n < 0){ alert('رقم مش صح'); return; }
    const diff = Math.round((n - r.balance) * 100) / 100;
    if(diff !== 0 && !confirm((diff < 0 ? '🔻 عجز ' : '🔺 أوفر ') + egp(Math.abs(diff))
      + '\n\nالنظام حاسب ' + egp(r.balance) + ' وإنت عدّيت ' + egp(n)
      + '\n\nالفرق هيتسجّل، والأيام اللي بعده هتكمّل من ' + egp(n) + '. تكمّل؟')) return;
    await db.collection('office_cash_days').doc(key).set({
      counted: n, countedAt: Date.now(), countedDiff: diff, by: 'office', updatedAt: Date.now()
    }, { merge: true });
  }catch(e){ alert('ماتحفظش: ' + (e.code || e.message)); }
}
window.ofCountDay = ofCountDay;

async function ofResetDay(key){
  if(!confirm('ترجّع يوم ' + ofDayName(key) + ' للأرقام المحسوبة؟\n\nالتعديلات اليدوية والعدّ هيتشالوا.')) return;
  try{
    await db.collection('office_cash_days').doc(key)
      .set({ ov: {}, counted: null, updatedAt: Date.now() }, { merge: true });
  }catch(e){ alert('ماتحفظش: ' + (e.code || e.message)); }
}
window.ofResetDay = ofResetDay;

/* 🥇 الدهب */
async function ofSetGoldGrams(){
  const cur = Number(ofLedgerCfg().goldGrams) || 0;
  const v = prompt('⚖️ عندك كام جرام دهب عيار ٢٤؟', cur ? String(cur) : '');
  if(v === null) return;
  const n = Math.round((Number(v) || 0) * 1000) / 1000;
  if(!isFinite(n) || n < 0){ alert('رقم مش صح'); return; }
  await ofSaveCashCfg({ goldGrams: n });
}
const OF_GOLD_AUTO_REFRESH_MS = 6 * 3600 * 1000;
const OF_GOLD_MANUAL_LOCK_MS = 24 * 3600 * 1000;
const OF_TROY_OZ_GRAMS = 31.1034768;
let _ofGoldAutoBusy = false;
let _ofGoldAutoTriedAt = 0;

function ofFetchJson(url, timeoutMs){
  const ms = Number(timeoutMs) || 8000;
  let timer;
  return Promise.race([
    fetch(url, { cache:'no-store' }).then(function(r){
      if(!r || !r.ok) throw new Error('HTTP '+(r && r.status));
      return r.json();
    }),
    new Promise(function(_,reject){
      timer=setTimeout(function(){ reject(new Error('timeout')); },ms);
    })
  ]).finally(function(){ if(timer) clearTimeout(timer); });
}

/* 🥇 السعر الآلي:
   1) Gold API: XAU/USD spot per troy ounce — بدون API key وCORS.
   2) Currency API CDN: USD/EGP — ملف يومي ثابت بدون API key.
   3) نحسب 24K spot EGP/gram = XAU_USD * USD_EGP / 31.1034768.
   ⚠️ ده سعر سوق 24K تقديري، مش وعد بسعر محل صاغة بعينه. */
async function ofFetchGold24kEgp(){
  const pair = await Promise.all([
    ofFetchJson('https://api.gold-api.com/price/XAU', 8000),
    ofFetchJson('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json', 8000)
  ]);
  const gold = pair[0] || {}, fx = pair[1] || {};
  const xauUsd = Number(gold.price);
  const usdEgp = Number(fx && fx.usd && fx.usd.egp);
  if(!(xauUsd > 500 && xauUsd < 10000)) throw new Error('gold_price_invalid');
  if(!(usdEgp > 10 && usdEgp < 200)) throw new Error('usd_egp_invalid');
  const perGram = Math.round((xauUsd * usdEgp / OF_TROY_OZ_GRAMS) * 100) / 100;
  if(!(perGram > 500 && perGram < 50000)) throw new Error('gold_gram_invalid');
  return {
    price:perGram, xauUsd:xauUsd, usdEgp:usdEgp,
    goldUpdatedAt: gold.updatedAt || '',
    fxDate: fx.date || ''
  };
}
window.ofFetchGold24kEgp = ofFetchGold24kEgp;

async function ofAutoUpdateGoldPrice(force){
  const cfg=ofLedgerCfg();
  const now=Date.now();
  const manualUntil=Number(cfg.goldManualUntil)||0;
  if(!force && manualUntil > now) return {skipped:'manual'};
  const at=Number(cfg.goldPriceAt)||0;
  if(!force && at && (now-at)<OF_GOLD_AUTO_REFRESH_MS) return {skipped:'fresh'};
  if(_ofGoldAutoBusy) return {skipped:'busy'};
  if(!force && _ofGoldAutoTriedAt && (now-_ofGoldAutoTriedAt)<60*1000) return {skipped:'recent_try'};
  _ofGoldAutoBusy=true; _ofGoldAutoTriedAt=now;
  try{
    const q=await ofFetchGold24kEgp();
    await ofSaveCashCfg({
      goldBuyPrice:q.price,
      goldPriceAt:Date.now(),
      goldSource:'تلقائي · Gold API + USD/EGP',
      goldAuto:true,
      goldManualUntil:0,
      goldXauUsd:q.xauUsd,
      goldUsdEgp:q.usdEgp,
      goldMarketUpdatedAt:q.goldUpdatedAt||'',
      goldFxDate:q.fxDate||'',
      goldLastAutoOkAt:Date.now()
    });
    return {ok:true,price:q.price};
  }catch(e){
    try{
      await ofSaveCashCfg({ goldLastAutoFailAt:Date.now(), goldLastAutoError:String(e&&e.message||e).slice(0,120) });
    }catch(_){}
    return {ok:false,error:e};
  }finally{
    _ofGoldAutoBusy=false;
  }
}
window.ofAutoUpdateGoldPrice=ofAutoUpdateGoldPrice;
if(typeof document!=='undefined' && document.addEventListener){
  document.addEventListener('visibilitychange',function(){
    if(!document.hidden) setTimeout(function(){ ofAutoUpdateGoldPrice(false); },500);
  });
}

async function ofGoldRefreshNow(){
  const r=await ofAutoUpdateGoldPrice(true);
  if(r && r.ok) alert('✅ سعر الدهب اتحدث تلقائيًا: '+egp(r.price)+' / جرام 24K');
  else if(r && r.error) alert('تعذر تحديث السعر الآن. هيفضل آخر سعر محفوظ شغال، وجرب تاني تلقائيًا بعدين.');
}
window.ofGoldRefreshNow=ofGoldRefreshNow;

async function ofSetGoldPrice(){
  const cur = Number(ofLedgerCfg().goldBuyPrice) || 0;
  const v = prompt('✍️ تعديل يدوي مؤقت لسعر جرام 24K\n'
    + 'التحديث التلقائي هيتوقف 24 ساعة، وبعدها يرجع لوحده.\n\nاكتب السعر بالجنيه:',
    cur ? String(cur) : '');
  if(v === null) return;
  const n = Math.round((Number(v) || 0) * 100) / 100;
  if(!isFinite(n) || n <= 0){ alert('رقم مش صح'); return; }
  await ofSaveCashCfg({
    goldBuyPrice:n, goldPriceAt:Date.now(),
    goldSource:'يدوي · override 24h',
    goldAuto:false,
    goldManualUntil:Date.now()+OF_GOLD_MANUAL_LOCK_MS
  });
}
window.ofSetGoldGrams = ofSetGoldGrams; window.ofSetGoldPrice = ofSetGoldPrice;

async function ofSaveCashCfg(patch){
  try{
    await db.collection('pos_test_settings').doc('office_cash_cfg')
      .set(Object.assign({}, patch, { updatedAt: Date.now() }), { merge: true });
  }catch(e){ alert('ماتحفظش: ' + (e.code || e.message)); }
}

/* 🆕 التصفير — البداية من نقطة نضيفة
   ⚠️ محتاج **رقمين** مش رقم واحد:
      · الكاش اللي في إيدك
      · واللي لسه عند Paymob من مبيعات فيزا قبل التصفير
   لو أخدنا الكاش بس، فلوس الفيزا اللي في السكة هتنزل بعد التصفير
   وتبان كأنها فلوس من العدم — ومن غير رصيد افتتاحي يقابلها الرقم بيكدب. */
async function ofStartFresh(){
  const c = prompt('💰 اكتب إجمالي السيولة المؤكدة عندك دلوقتي.\n\n'
    + 'يعني: الكاش + رصيد الحساب البنكي المخصص للشغل.\n'
    + 'ما تدخلش فلوس Paymob اللي لسه مانزلتش — هنسألك عنها في الخطوة الجاية.\n\n'
    + 'كل حاجة قبل كده هتتنسى، والحساب هيبدأ من الرقم ده.');
  if(c === null) return;
  const cash = Math.round((Number(c) || 0) * 100) / 100;
  if(!isFinite(cash) || cash < 0){ alert('رقم مش صح'); return; }

  const p = prompt('🏦 وعند Paymob لسه ليك كام؟\n\n'
    + 'ده مبيعات الفيزا اللي اتباعت ولسه فلوسها مانزلتش.\n'
    + 'لو مش عارف اكتب صفر — بس ساعتها التحويل اللي هينزل هيبان زيادة.', '0');
  if(p === null) return;
  const pmOpen = Math.round((Number(p) || 0) * 100) / 100;
  if(!isFinite(pmOpen) || pmOpen < 0){ alert('رقم مش صح'); return; }

  // 🎁 دين الكروت القديمة — لازم يتحمل مع التصفير
  //    من غيره، كارت اتباع قبل التصفير ويتصرف بعده هيقلّل أرقامك
  //    من غير ما يبان سبب، والشيت يوريك خسارة مش موجودة.
  const gl = prompt('🎁 وكروت هدايا مباعة ولسه ماتصرفتش بكام؟\n\n'
    + 'دي فلوس قبضتها والعميلات لسه ماخدوش بضاعتها.\n'
    + 'لو مفيش كروت اكتب صفر.', '0');
  if(gl === null) return;
  const giftOpen = Math.round((Number(gl) || 0) * 100) / 100;
  if(!isFinite(giftOpen) || giftOpen < 0){ alert('رقم مش صح'); return; }

  if(!confirm('💰 السيولة المؤكدة: ' + egp(cash)
    + '\n🏦 عند Paymob ولسه ماوصلش: ' + egp(pmOpen)
    + '\n🎁 دين كروت: ' + egp(giftOpen)
    + '\n\nالحساب هيبدأ من دلوقتي. الأيام اللي فاتت هتختفي من الشيت '
    + '(البيانات نفسها مش بتتمسح). تكمّل؟')) return;
  try{
    // 🧾 النقطة القديمة بتتأرشف — عمرنا ما بنمسح تاريخ فلوس
    if(D.cashBase && D.cashBase.atMs){
      await db.collection('office_cash_epochs').add(
        Object.assign({}, D.cashBase, { closedAt: Date.now() }));
    }
    await db.collection('pos_test_settings').doc('office_cash').set({
      amount: cash, paymobOpening: pmOpen, giftLiabilityOpening: giftOpen,
      atMs: Date.now(), by: 'office'
    }, { merge: true });
  }catch(e){ alert('ماتحفظش: ' + (e.code || e.message)); }
}
window.ofStartFresh = ofStartFresh;






/* 🏦 تأكيد التحويل الأسبوعي — المتوقّع جاهز، المالك يراجع الصافي ويأكد */
async function ofConfirmWeeklyPaymob(cycleEnd){
  const today=ofDayKeyOf(Date.now());
  const c=ofPaymobWeeklyCycles(D,today).filter(function(x){return x.end===cycleEnd;})[0];
  if(!c){alert('مش لاقي الأسبوع ده في المبيعات المحمّلة');return;}
  if(c.confirmed){alert('الأسبوع ده متأكد بالفعل: '+egp(c.confirmed.net||0));return;}
  const res=await officeAsk({
    title:'🏦 تحويل Paymob — الأسبوع المنتهي '+ofDayName(c.end),
    note:'إجمالي مبيعات الفيزا: '+egp(c.gross)
      +'\\nالعمولة المتوقعة ('+c.pct+'%): '+egp(c.expectedFee)
      +'\\nالمتوقع ينزل: '+egp(c.expectedNet)
      +'\\n\\nراجع حساب البنك. لو الرقم مختلف عدّله واكتب الصافي اللي وصل فعلًا.',
    ph:'الصافي اللي وصل فعلًا', value:c.expectedNet
  });
  if(!res) return;
  const net=Math.round((Number(res.amount)||0)*100)/100;
  if(!(net>0)){alert('اكتب مبلغ صحيح');return;}
  if(net>c.gross){alert('الصافي أكبر من إجمالي مبيعات الفيزا — راجع الرقم');return;}
  const ded=Math.round((c.gross-net)*100)/100;
  const pct=c.gross>0?Math.round((ded/c.gross)*10000)/100:0;
  try{
    await db.collection('office_paymob_settlements').doc('weekly_'+c.end).set({
      weekly:true, weeklyCycleStart:c.start, weeklyCycleEnd:c.end,
      payoutDay:c.payout, forDay:c.end,
      gross:c.gross, net:net, deductions:ded, feePct:pct,
      expectedNet:c.expectedNet, expectedFee:c.expectedFee, expectedPct:c.pct,
      note:res.note||'', ts:Date.now(), by:'office_weekly_v65'
    },{merge:true});
  }catch(e){alert('تعذر الحفظ: '+(e&&e.message?e.message:e));}
}
window.ofConfirmWeeklyPaymob=ofConfirmWeeklyPaymob;

function ofMaybeWeeklyPaymobReminder(){
  try{
    const due=ofPaymobWeeklyDue(D,ofDayKeyOf(Date.now()));
    if(!due.length) return;
    const c=due[0], key='office_paymob_weekly_reminded_'+c.end;
    if(localStorage.getItem(key)) return;
    localStorage.setItem(key,String(Date.now()));
    notify('🏦 راجع تحويل Paymob الأسبوعي',
      'المتوقع '+egp(c.expectedNet)+' بعد عمولة تقريبية '+egp(c.expectedFee)+' — افتح «فلوسي» وأكد اللي وصل فعلًا.');
  }catch(e){}
}

/* 💰 تسجيل تحويل وصل من Paymob */
async function ofAddSettlement(){
  // 📄 الرقمين من شاشة "تفاصيل التحويل" في Paymob — مش حساب ولا تخمين
  const g = prompt('من شاشة التحويل في Paymob:\n\n💠 المبلغ الإجمالي كام؟');
  if(g === null) return;
  const gross = Math.round((Number(g) || 0) * 100) / 100;
  if(!isFinite(gross) || gross <= 0){ alert('رقم مش صح'); return; }

  const n = prompt('💚 والمبلغ الصافي اللي نزل في حسابك كام؟');
  if(n === null) return;
  const net = Math.round((Number(n) || 0) * 100) / 100;
  if(!isFinite(net) || net <= 0){ alert('رقم مش صح'); return; }
  if(net > gross){ alert('الصافي ماينفعش يبقى أكبر من الإجمالي — راجع الأرقام'); return; }

  const ded = Math.round((gross - net) * 100) / 100;
  const pct = gross > 0 ? Math.round((ded / gross) * 10000) / 100 : 0;
  if(!confirm('إجمالي: ' + egp(gross)
    + '\nخصومات (رسوم + تسويات): ' + egp(ded) + ' (' + pct + '%)'
    + '\nنزل في حسابك: ' + egp(net)
    + '\n\nالصافي هيتضاف للكاش اللي في إيدك. تكمّل؟')) return;
  try{
    await db.collection('office_paymob_settlements').add({
      gross: gross, net: net, deductions: ded, feePct: pct, ts: Date.now(), by: 'office'
    });
  }catch(e){ alert('تعذر الحفظ: ' + (e && e.message ? e.message : e)); }
}
window.ofAddSettlement = ofAddSettlement;
