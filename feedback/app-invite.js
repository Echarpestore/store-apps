/* ============================================================
   📲 app-invite.js — دعوة تحميل تطبيق العميلة من تابلت الفرع
   ------------------------------------------------------------
   بيتحط في: feedback/app-invite.js
   وبيتحمّل من feedback/index.html:
     <script src="app-invite.js?v=690"></script>

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

  var FEATURES = [
    { i: '🎁', t: 'نقط على كل شرايه', s: 'اجمعيها واستبدليها خصم' },
    { i: '🧾', t: 'كل فواتيرك في مكان واحد', s: 'من غير ما تحتفظي بورق' },
    { i: '✨', t: 'عروض للأعضاء بس', s: 'قبل ما تنزل للناس' },
    { i: '🧕', t: 'جرّبي الحجاب بالذكاء الاصطناعي', s: 'شوفيه عليكِ قبل ما تشتري' }
  ];

  var CSS = '\
#aiWrap{position:fixed;inset:0;z-index:8800;display:none;background:#08090c;\
  color:#f4f5f7;font-family:\'Cairo\',sans-serif;direction:rtl;overflow:hidden}\
#aiWrap.on{display:flex;flex-direction:column;align-items:center;justify-content:center;\
  padding:5vh 6vw;gap:2vh;animation:aiIn .5s cubic-bezier(.2,.8,.2,1)}\
@keyframes aiIn{from{opacity:0}to{opacity:1}}\
#aiWrap::before{content:"";position:absolute;top:-25%;left:50%;transform:translateX(-50%);\
  width:150vw;height:75vh;border-radius:50%;pointer-events:none;\
  background:radial-gradient(closest-side,rgba(180,140,255,.14),transparent 70%);\
  animation:aiBreath 8s ease-in-out infinite}\
@keyframes aiBreath{0%,100%{opacity:.5;transform:translateX(-50%) scale(1)}\
  50%{opacity:.95;transform:translateX(-50%) scale(1.08)}}\
.aiEyebrow{font-family:\'Space Grotesk\',sans-serif;font-size:2.1vh;letter-spacing:.3em;\
  color:#6f7688;font-weight:700}\
.aiTitle{font-size:4.6vh;font-weight:900;line-height:1.25;margin-top:.4vh}\
.aiTitle b{background:linear-gradient(90deg,#c4a6ff,#8b6bd9);-webkit-background-clip:text;\
  background-clip:text;color:transparent}\
.aiQr{background:#fff;border-radius:2.6vh;padding:2vh;width:min(34vh,52vw);\
  box-shadow:0 3vh 8vh rgba(0,0,0,.65);animation:aiPop .6s .15s both cubic-bezier(.2,.8,.2,1)}\
@keyframes aiPop{from{opacity:0;transform:scale(.9) translateY(12px)}to{opacity:1;transform:none}}\
.aiHow{font-size:2.2vh;color:#8b90a0;font-weight:600}\
.aiList{width:min(74vh,90vw);display:flex;flex-direction:column;gap:1.2vh;margin-top:.6vh}\
.aiRow{display:flex;align-items:center;gap:2.6vw;background:#111319;border:1px solid #1e2230;\
  border-radius:1.8vh;padding:1.5vh 3vw;opacity:0;animation:aiUp .5s both cubic-bezier(.2,.8,.2,1)}\
@keyframes aiUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}\
.aiRow i{font-style:normal;font-size:3.2vh;line-height:1}\
.aiRow div{text-align:right}\
.aiRow b{display:block;font-size:2.3vh;font-weight:800}\
.aiRow small{display:block;font-size:1.9vh;color:#7d8394;margin-top:.3vh}\
.aiClose{margin-top:1vh;border:1px solid #2b2f3b;background:none;color:#8b90a0;\
  border-radius:99px;padding:1.5vh 8vw;font-family:inherit;font-size:2.1vh;font-weight:800;cursor:pointer}\
';

  var rows = FEATURES.map(function (f, n) {
    return '<div class="aiRow" style="animation-delay:' + (0.3 + n * 0.11) + 's">'
      + '<i>' + f.i + '</i><div><b>' + f.t + '</b><small>' + f.s + '</small></div></div>';
  }).join('');

  var HTML = '<div id="aiWrap">'
    + '<div class="aiEyebrow">ECHARPE</div>'
    + '<div class="aiTitle">خديها معاكِ<br><b>في تطبيقك</b></div>'
    + '<div class="aiQr">' + QR + '</div>'
    + '<div class="aiHow">افتحي الكاميرا ووجّهيها على الكود</div>'
    + '<div class="aiList">' + rows + '</div>'
    + '<button class="aiClose" id="aiClose">تمام، شكرًا</button>'
    + '</div>';

  document.head.insertAdjacentHTML('beforeend', '<style>' + CSS + '</style>');
  document.body.insertAdjacentHTML('beforeend', HTML);

  var wrap = document.getElementById('aiWrap');
  var timer = null;

  function hide() { wrap.classList.remove('on'); clearTimeout(timer); }
  async function show(force) {
    /* ⚠️ مبنظهرش فوق إنستاباي. العميلة بتحوّل فلوس — دي مش اللحظة
       اللي نعرض فيها إعلان، والشاشتين فوق بعض كارثة. */
    var ip = document.getElementById('ipWrap');
    if (ip && ip.classList.contains('on')) return;
    if (!force && await hasApp(_phone)) return;   // عندها التطبيق خلاص
    wrap.classList.add('on');
    clearTimeout(timer);
    timer = setTimeout(hide, 22000);
  }
  document.getElementById('aiClose').onclick = hide;
  wrap.onclick = function (e) { if (e.target === wrap) hide(); };

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
