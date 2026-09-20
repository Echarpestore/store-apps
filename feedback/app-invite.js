/* ============================================================
   📲 app-invite.js — دعوة تحميل تطبيق العميلة من تابلت الفرع
   ------------------------------------------------------------
   بيتحط في: feedback/app-invite.js
   وبيتحمّل من feedback/index.html:
     <script type="module" src="app-invite.js?v=693"></script>
   + فولدر feedback/invite/ (3 لقطات من التطبيق + الأيقونة)

   بتظهر بعد ما العميلة تكتب رقمها وتشوف شاشة الترحيب.
   ⚠️ ملف مستقل زي إنستاباي: لو وقع، الكشك بيفضل شغال عادي.

   🔲 الـQR **متولّد مسبقًا ومدفون في الملف** كـSVG.
      السبب: مفيش مكتبة QR في المشروع، وجلبها من CDN معناه إن
      الشاشة تقع أول ما نت الفرع يقطع. الرابط ثابت فمفيش داعي
      نولّده وقت التشغيل أصلًا.
      لو الرابط اتغيّر، الـSVG ده لازم يتولّد من جديد.
   ============================================================ */
import { getFirestore, collection, query, where, limit, getDocs }
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

(function () {
  'use strict';

  var URL_APP = 'https://www.echarpe.store/loyalty/index.html';
  var db = null;
  try { db = getFirestore(window.fbApp); } catch (e) { console.warn('[app-invite] db', e); }

  /* 🔍 هل العميلة فاتحة التطبيق قبل كده؟
     ⚠️ مفيش طريقة نسأل بيها الجهاز "التطبيق متثبّت عندك؟" — ده مقفول
        في كل المتصفحات. أقرب دليل عندنا هو إنها فعّلت الإشعارات من
        التطبيق، وساعتها بيتكتب `fcmTokenAt` و`fcmTokens_<براند>` في
        مستندها.
     ⚠️ الدليل ده **ناقص**: عميلة حمّلت التطبيق ورفضت الإشعارات
        هتفضل تشوف الدعوة. الخطأ في الاتجاه الآمن — نعرض دعوة زيادة
        أحسن من إننا نخفيها عن حد محتاجها.
     ولو القراءة فشلت لأي سبب، بنعرض. الشاشة دي مش حرجة. */
  var _phone = '';
  async function hasApp(phone) {
    if (!db || !phone) return false;
    try {
      const snap = await getDocs(query(
        collection(db, 'pos_test_customers'),
        where('phone', '==', String(phone)), limit(1)));
      if (snap.empty) return false;
      const d = snap.docs[0].data() || {};
      if (d.fcmTokenAt) return true;
      return Object.keys(d).some(function (k) {
        return k.indexOf('fcmTokens') === 0 && Array.isArray(d[k]) && d[k].length;
      });
    } catch (e) { return false; }
  }

  // 📞 بنمسك الرقم من الكشك من غير ما نعدّل كوده
  try {
    var origSubmit = window.capSubmitPhone;
    if (typeof origSubmit === 'function') {
      window.capSubmitPhone = function () {
        try {
          // ⚠️ العنصر اسمه capDisplay — كتبت capPhoneDisplay من الذاكرة
          //    وكان هيرجّع رقم فاضي، يعني الفحص عمره ما كان هيشتغل
          //    والدعوة هتظهر للكل. الفحص من الملف الحقيقي مسكها.
          var el = document.getElementById('capDisplay') || {};
          var raw = (el.textContent || '').replace(/\D/g, '');
          if (/^01\d{9}$/.test(raw)) _phone = raw;
        } catch (e) {}
        return origSubmit.apply(this, arguments);
      };
    }
  } catch (e) {}
  var QR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 37 37" width="100%" height="100%" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h37v37h-37z"/><path stroke="#000" d="M2 2.5h7m8 0h1m1 0h1m3 0h2m3 0h7m-33 1h1m5 0h1m1 0h1m1 0h5m1 0h1m1 0h2m2 0h1m3 0h1m5 0h1m-33 1h1m1 0h3m1 0h1m4 0h2m2 0h1m2 0h1m2 0h2m3 0h1m1 0h3m1 0h1m-33 1h1m1 0h3m1 0h1m1 0h6m2 0h1m1 0h1m1 0h2m2 0h1m1 0h1m1 0h3m1 0h1m-33 1h1m1 0h3m1 0h1m1 0h2m3 0h1m1 0h4m1 0h2m4 0h1m1 0h3m1 0h1m-33 1h1m5 0h1m3 0h1m1 0h1m2 0h1m1 0h1m3 0h4m1 0h1m5 0h1m-33 1h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7m-25 1h3m2 0h4m1 0h2m2 0h2m-23 1h1m1 0h4m1 0h2m1 0h2m3 0h2m2 0h1m2 0h4m1 0h2m1 0h1m-31 1h3m3 0h4m1 0h2m3 0h3m2 0h2m4 0h3m-30 1h1m2 0h3m2 0h3m1 0h3m4 0h6m2 0h3m1 0h1m-32 1h1m1 0h1m1 0h1m1 0h1m4 0h2m4 0h3m6 0h1m2 0h2m-31 1h1m2 0h1m1 0h5m1 0h3m1 0h2m2 0h1m3 0h1m1 0h2m4 0h1m-32 1h1m2 0h2m1 0h1m3 0h2m4 0h2m2 0h3m3 0h1m1 0h1m-27 1h1m2 0h2m1 0h1m3 0h2m1 0h7m3 0h1m1 0h2m-29 1h1m2 0h1m4 0h3m2 0h1m3 0h1m3 0h1m1 0h2m2 0h3m1 0h1m-33 1h2m2 0h1m1 0h1m1 0h5m1 0h1m4 0h2m1 0h1m1 0h6m-29 1h1m1 0h1m1 0h1m1 0h1m1 0h1m3 0h3m3 0h1m1 0h2m1 0h3m1 0h1m1 0h1m1 0h1m-33 1h2m2 0h1m1 0h1m5 0h4m1 0h3m1 0h3m2 0h2m1 0h2m1 0h1m-32 1h1m1 0h1m3 0h2m2 0h1m1 0h2m1 0h1m2 0h1m3 0h1m1 0h2m1 0h4m-32 1h3m3 0h1m6 0h1m2 0h1m1 0h2m2 0h1m1 0h1m2 0h1m1 0h1m1 0h1m-32 1h1m2 0h2m2 0h1m2 0h1m1 0h1m1 0h3m1 0h2m2 0h2m1 0h1m1 0h3m-30 1h1m1 0h1m3 0h1m3 0h2m3 0h4m1 0h2m1 0h1m1 0h2m2 0h4m-33 1h1m1 0h1m4 0h2m1 0h6m1 0h2m1 0h1m4 0h2m3 0h1m-31 1h5m1 0h1m1 0h2m2 0h2m1 0h1m3 0h2m3 0h6m-22 1h1m1 0h1m3 0h1m1 0h1m4 0h4m3 0h1m1 0h1m-31 1h7m2 0h2m1 0h5m1 0h2m3 0h2m1 0h1m1 0h1m1 0h1m-31 1h1m5 0h1m1 0h1m2 0h2m4 0h2m1 0h1m1 0h3m3 0h4m-32 1h1m1 0h3m1 0h1m1 0h3m1 0h1m1 0h1m1 0h1m1 0h1m3 0h7m2 0h1m-32 1h1m1 0h3m1 0h1m1 0h1m1 0h1m1 0h3m1 0h1m1 0h3m1 0h1m2 0h1m1 0h1m4 0h1m-33 1h1m1 0h3m1 0h1m3 0h1m2 0h1m1 0h2m1 0h3m1 0h1m1 0h1m2 0h2m2 0h2m-33 1h1m5 0h1m1 0h4m1 0h1m1 0h1m1 0h4m4 0h1m1 0h6m-33 1h7m8 0h1m1 0h1m2 0h1m3 0h1m2 0h3"/></svg>';

  /* ============================================================
     🎨 v693 — تصميم جديد للشاشة **بالعرض** (طلب المالك 20-09):
        لقطات حقيقية من التطبيق في النص الشمال · الـQR في النص اليمين · ترجع لوحدها لصفحة التقييم.
     القديم كان عمود رأسي على خلفية سودا — على تابلت بالعرض الـQR كان صغير في النص والباقي مقصوص،
     ولونه مالوش علاقة بالبراند. دلوقتي نفس ألوان التطبيق والستاند المطبوع اللي واقف جنب التابلت.

     🖼️ اللقطات ملفات عادية في `feedback/invite/` — تبديل لقطة = استبدال الملف بنفس الاسم، من غير كود.
        لو لقطة متحمّلتش (نت الفرع قاطع وأول مرة) بتتخفى هي بس، والـQR شغال — هو مدفون في الملف.
     🎬 حركة واحدة متألّفة عند الفتح، وبعدها اللقطات بتتبدّل بـ«سحبة قماش» مايلة (clip-path).
        كل الحركة transform/opacity/clip-path بس — التابلت الرخيص ميهنّجش.
     ============================================================ */
  var SHOTS = [
    { src: 'invite/home.jpg',  t: 'نقاط مع كل قطعة',        s: 'بتتحوّل خصم على اللي بعدها' },
    { src: 'invite/shop.jpg',  t: 'التشكيلات الجديدة أول بأول', s: 'واطلبي وإنتِ في البيت' },
    { src: 'invite/tryon.jpg', t: 'شوفيها عليكِ',            s: 'جرّبي الطرحة قبل ما تشتري' }
  ];
  var STEP_MS = 3400;                       // مدة كل لقطة
  var TOTAL_MS = STEP_MS * SHOTS.length + 1800;   // ≈ 12 ثانية وترجع لصفحة التقييم لوحدها

  var CSS = '\
#aiWrap{position:fixed;inset:0;z-index:8800;display:none;overflow:hidden;direction:rtl;\
  font-family:\'Cairo\',sans-serif;color:#3B1E2C;\
  background:linear-gradient(115deg,#FFF6FA 0%,#FBE6EF 52%,#F6D6E4 100%)}\
#aiWrap.on{display:grid;grid-template-columns:1fr 1fr;align-items:center}\
/* القماشة: نفس تدرّج كارت النقط في التطبيق، مكبّر ومايل ورا الموبايل — دي الحاجة الوحيدة الجريئة في الشاشة */\
.aiCloth{position:absolute;left:-9vw;top:-22vh;width:58vw;height:150vh;border-radius:9vh;\
  background:linear-gradient(160deg,#E4458E 0%,#EB6A7E 46%,#E2A646 100%);\
  transform:rotate(9deg) translateX(-70vw);opacity:.96}\
#aiWrap.on .aiCloth{animation:aiCloth 1.1s cubic-bezier(.16,.84,.24,1) forwards}\
.aiCloth::after{content:"";position:absolute;inset:0;border-radius:inherit;\
  background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.22) 48%,transparent 62%);\
  transform:translateX(-60%)}\
#aiWrap.on .aiCloth::after{animation:aiSheen 5.5s ease-in-out 1.2s infinite}\
\
/* ---- النص الشمال: الموبايل ---- */\
.aiStage{grid-column:2;grid-row:1;position:relative;z-index:1;height:100vh;display:flex;flex-direction:column;\
  align-items:center;justify-content:center;gap:2.6vh}\
.aiPhone{position:relative;height:74vh;aspect-ratio:1080/2190;border-radius:4.6vh;background:#1d1216;\
  padding:1vh;box-shadow:0 5vh 9vh -2vh rgba(90,20,55,.55),0 0 0 .25vh rgba(255,255,255,.35) inset;\
  transform:translateY(60vh) rotate(-9deg);opacity:0}\
#aiWrap.on .aiPhone{animation:aiPhoneIn 1.05s cubic-bezier(.16,.84,.24,1) .18s forwards,aiFloat 6s ease-in-out 1.3s infinite}\
.aiScreen{position:relative;width:100%;height:100%;border-radius:3.7vh;overflow:hidden;background:#FDEFF5}\
.aiShot{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top;\
  clip-path:polygon(118% 0,118% 0,100% 100%,100% 100%);z-index:1}\
.aiShot.was{clip-path:none;z-index:1}\
.aiShot.is{z-index:2;animation:aiWipe .95s cubic-bezier(.65,0,.2,1) forwards}\
.aiShot.first{clip-path:none;animation:none}\
.aiEdge{position:absolute;top:-10%;bottom:-10%;width:16%;right:-30%;z-index:3;pointer-events:none;\
  background:linear-gradient(90deg,transparent,rgba(255,236,200,.85),transparent);transform:skewX(-9deg);opacity:0}\
.aiEdge.go{animation:aiEdge .95s cubic-bezier(.65,0,.2,1) forwards}\
.aiCap{height:9.5vh;text-align:center;color:#fff;text-shadow:0 .3vh 1.6vh rgba(110,20,60,.45)}\
.aiCap b{display:block;font-size:3.5vh;font-weight:900;line-height:1.35}\
.aiCap small{display:block;font-size:2.25vh;font-weight:600;opacity:.92}\
.aiCap.swap{animation:aiCap .7s ease both}\
\
/* ---- النص اليمين: الكود ---- */\
.aiSide{grid-column:1;grid-row:1;position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;\
  justify-content:center;gap:2.2vh;padding:0 4vw;text-align:center}\
.aiSide>*{opacity:0;transform:translateY(2.4vh)}\
#aiWrap.on .aiSide>*{animation:aiUp .7s cubic-bezier(.2,.8,.2,1) forwards}\
#aiWrap.on .aiSide>*:nth-child(1){animation-delay:.35s}\
#aiWrap.on .aiSide>*:nth-child(2){animation-delay:.47s}\
#aiWrap.on .aiSide>*:nth-child(3){animation-delay:.6s}\
#aiWrap.on .aiSide>*:nth-child(4){animation-delay:.78s}\
#aiWrap.on .aiSide>*:nth-child(5){animation-delay:.9s}\
.aiBrand{width:9.5vh;height:9.5vh;border-radius:2.4vh;box-shadow:0 1.4vh 3vh -1vh rgba(190,50,110,.55)}\
.aiTitle{font-size:6vh;font-weight:900;line-height:1.25;color:#3B1E2C;letter-spacing:-.01em}\
.aiQrHold{position:relative;padding:1.3vh;border-radius:4.4vh;\
  background:linear-gradient(140deg,#E4458E,#E2A646)}\
.aiQr{position:relative;width:40vh;height:40vh;background:#fff;border-radius:3.3vh;padding:2.4vh;overflow:hidden}\
.aiQr svg{display:block}\
.aiQr::after{content:"";position:absolute;left:0;right:0;top:0;height:22%;pointer-events:none;\
  background:linear-gradient(180deg,transparent,rgba(228,69,142,.16));border-bottom:.35vh solid rgba(228,69,142,.55);\
  transform:translateY(-110%)}\
#aiWrap.on .aiQr::after{animation:aiScan 2.6s cubic-bezier(.5,0,.5,1) 1.3s infinite}\
.aiHint{font-size:2.9vh;font-weight:700;color:#7A4860}\
.aiBar{width:40vh;height:.7vh;border-radius:1vh;background:rgba(59,30,44,.12);overflow:hidden}\
.aiBar i{display:block;height:100%;width:100%;border-radius:inherit;transform-origin:right center;\
  background:linear-gradient(90deg,#E2A646,#E4458E)}\
#aiWrap.on .aiBar i{animation:aiBar var(--ai-total,12s) linear 1s forwards}\
#aiClose{position:absolute;inset:0;z-index:4;width:100%;height:100%;border:0;padding:0;margin:0;background:transparent;\
  cursor:pointer;-webkit-tap-highlight-color:transparent}\
#aiWrap.out{animation:aiOut .45s ease forwards}\
\
@keyframes aiCloth{to{transform:rotate(9deg) translateX(0)}}\
@keyframes aiSheen{0%,55%{transform:translateX(-60%)}100%{transform:translateX(60%)}}\
@keyframes aiPhoneIn{to{transform:translateY(0) rotate(-3deg);opacity:1}}\
@keyframes aiFloat{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-1.4vh) rotate(-2.2deg)}}\
@keyframes aiWipe{from{clip-path:polygon(118% 0,118% 0,100% 100%,100% 100%)}to{clip-path:polygon(-18% 0,118% 0,100% 100%,-36% 100%)}}\
@keyframes aiEdge{0%{transform:translateX(0) skewX(-9deg);opacity:0}15%{opacity:1}85%{opacity:1}100%{transform:translateX(-925%) skewX(-9deg);opacity:0}}\
@keyframes aiCap{from{opacity:0;transform:translateY(1.4vh)}to{opacity:1;transform:none}}\
@keyframes aiUp{to{opacity:1;transform:none}}\
@keyframes aiScan{0%{transform:translateY(-110%)}100%{transform:translateY(520%)}}\
@keyframes aiBar{to{transform:scaleX(0)}}\
@keyframes aiOut{to{opacity:0}}\
\
/* التابلت اتلفّ بالطول: الكود فوق (هو المهم) والموبايل تحته أصغر */\
@media (orientation:portrait){\
  #aiWrap.on{grid-template-columns:1fr;grid-template-rows:auto 1fr;align-items:start}\
  .aiSide{grid-column:1;grid-row:1;padding:3vh 6vw 0;gap:1.3vh}\
  .aiStage{grid-column:1;grid-row:2;height:auto;justify-content:flex-start;padding-top:3.5vh;gap:1.2vh}\
  .aiPhone{height:31vh;padding:.6vh;border-radius:2.6vh}.aiScreen{border-radius:2.1vh}\
  .aiBrand{width:6.5vh;height:6.5vh;border-radius:1.7vh}.aiTitle{font-size:3.7vh}\
  .aiQr{width:25vh;height:25vh;padding:1.6vh;border-radius:2.4vh}.aiQrHold{padding:.9vh;border-radius:3.2vh}\
  .aiHint{font-size:2.1vh}.aiBar{width:25vh}.aiCap{height:6vh}.aiCap b{font-size:2.5vh}.aiCap small{font-size:1.7vh}\
  .aiCloth{left:-20vw;top:57vh;width:140vw;height:70vh;transform:rotate(-5deg) translateX(-140vw)}\
  @keyframes aiCloth{to{transform:rotate(-5deg) translateX(0)}}\
}\
@media (prefers-reduced-motion:reduce){\
  #aiWrap.on .aiCloth,#aiWrap.on .aiPhone,#aiWrap.on .aiSide>*{animation-duration:.01s;animation-delay:0s}\
  #aiWrap.on .aiCloth::after,#aiWrap.on .aiQr::after{animation:none}\
  .aiShot.is{animation:none;clip-path:none}.aiEdge.go{animation:none}\
}\
';

  var shotsHtml = SHOTS.map(function (sh, n) {
    return '<img class="aiShot" data-n="' + n + '" src="' + sh.src + '" alt="" decoding="async" draggable="false">';
  }).join('');

  var HTML = '<div id="aiWrap" role="dialog" aria-label="حمّلي تطبيق إيشارب">'
    + '<div class="aiCloth"></div>'
    + '<div class="aiSide">'
    +   '<img class="aiBrand" src="invite/app-icon.png" alt="echarpe">'
    +   '<div class="aiTitle">حمّلي تطبيق إيشارب</div>'
    +   '<div class="aiQrHold"><div class="aiQr">' + QR + '</div></div>'
    +   '<div class="aiHint">وجّهي كاميرا موبايلك على الكود</div>'
    +   '<div class="aiBar"><i></i></div>'
    + '</div>'
    + '<div class="aiStage">'
    +   '<div class="aiPhone"><div class="aiScreen">' + shotsHtml + '<div class="aiEdge"></div></div></div>'
    +   '<div class="aiCap"><b></b><small></small></div>'
    + '</div>'
    + '<button id="aiClose" aria-label="رجوع لصفحة التقييم"></button>'
    + '</div>';

  document.head.insertAdjacentHTML('beforeend', '<style>' + CSS + '</style>');
  document.body.insertAdjacentHTML('beforeend', HTML);

  var wrap = document.getElementById('aiWrap');
  var shots = [].slice.call(wrap.querySelectorAll('.aiShot'));
  var edge = wrap.querySelector('.aiEdge');
  var cap = wrap.querySelector('.aiCap');
  var timer = null, stepTimer = null, cur = 0;
  wrap.style.setProperty('--ai-total', (TOTAL_MS - 1000) + 'ms');

  // لقطة متحمّلتش = تتشال من الدورة. الشاشة متقعش والـQR شغال.
  shots.forEach(function (im) {
    im.addEventListener('error', function () {
      im.dataset.bad = '1'; im.style.display = 'none';
    });
  });
  function live() { return shots.filter(function (im) { return im.dataset.bad !== '1'; }); }

  function setCap(n) {
    var sh = SHOTS[n] || SHOTS[0];
    cap.querySelector('b').textContent = sh.t;
    cap.querySelector('small').textContent = sh.s;
    cap.classList.remove('swap'); void cap.offsetWidth; cap.classList.add('swap');
  }
  function firstShot() {
    var ok = live();
    shots.forEach(function (im) { im.classList.remove('is', 'was', 'first'); });
    if (!ok.length) { wrap.querySelector('.aiPhone').style.visibility = 'hidden'; cap.style.visibility = 'hidden'; return; }
    cur = 0; ok[0].classList.add('first', 'was'); setCap(+ok[0].dataset.n);
  }
  function nextShot() {
    var ok = live(); if (ok.length < 2) return;
    var prev = ok[cur % ok.length]; cur = (cur + 1) % ok.length; var nx = ok[cur];
    shots.forEach(function (im) { if (im !== prev && im !== nx) im.classList.remove('is', 'was', 'first'); });
    prev.classList.remove('is', 'first'); prev.classList.add('was');
    nx.classList.remove('was', 'first'); void nx.offsetWidth; nx.classList.add('is');
    edge.classList.remove('go'); void edge.offsetWidth; edge.classList.add('go');
    setCap(+nx.dataset.n);
  }

  function hide() {
    clearTimeout(timer); clearInterval(stepTimer);
    if (!wrap.classList.contains('on')) return;
    wrap.classList.add('out');
    setTimeout(function () { wrap.classList.remove('on', 'out'); }, 430);   // ← وتحتها صفحة التقييم الرئيسية زي ما هي
  }
  async function show(force) {
    /* ⚠️ مبنظهرش فوق إنستاباي. العميلة بتحوّل فلوس — دي مش اللحظة
       اللي نعرض فيها إعلان، والشاشتين فوق بعض كارثة. */
    var ip = document.getElementById('ipWrap');
    if (ip && ip.classList.contains('on')) return;
    if (!force && await hasApp(_phone)) return;   // عندها التطبيق خلاص
    wrap.classList.remove('out');
    wrap.classList.remove('on'); void wrap.offsetWidth;    // إعادة تشغيل حركة الدخول من الأول كل مرة
    firstShot();
    wrap.classList.add('on');
    clearTimeout(timer); clearInterval(stepTimer);
    stepTimer = setInterval(nextShot, STEP_MS);
    timer = setTimeout(hide, TOTAL_MS);
  }
  // لمسة في أي حتة = رجوع فوري لصفحة التقييم (مفيش زرار «تمام» تدوّر عليه)
  document.getElementById('aiClose').onclick = hide;

  /* 👀 بنستنى شاشة الترحيب تخلص.
     الكشك بيعرض capPaneGreet لمدة ٤ ثواني بعد ما العميلة تكتب رقمها.
     بنراقب ظهورها بدل ما نعدّل في كود الكشك — نفس أسلوب إنستاباي. */
  try {
    var greet = document.getElementById('capPaneGreet');
    if (greet) {
      var wasOn = false;
      new MutationObserver(function () {
        var on = (greet.style.display || '').indexOf('block') >= 0;
        if (wasOn && !on) setTimeout(show, 350);   // الترحيب قفل → الدعوة
        wasOn = on;
      }).observe(greet, { attributes: true, attributeFilter: ['style'] });
    }
  } catch (e) { console.warn('[app-invite]', e); }

  // 🩺 للتجربة من الكونسول
  window.appInvite = function () { return show(true); };
})();
