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

  /* ✍️ الصياغة: جملة اسمية قصيرة لكل ميزة + سطر واحد يشرح.
     ⚠️ النسخة الأولى كانت "نقط على كل شرايه" — عامية مكسورة ومش
        لايقة على براند. والميزة الرابعة كانت بتقول "الذكاء
        الاصطناعي" صراحة؛ العميلة مش فارق معاها التقنية، فارق
        معاها إنها تشوف الطرحة عليها قبل ما تشتري. */
  var FEATURES = [
    { i: 'M12 3l2.6 5.9 6.4.6-4.8 4.3 1.4 6.2L12 16.8 6.4 20l1.4-6.2L3 9.5l6.4-.6z', t: 'نقاط مع كل قطعة', s: 'تتحوّل خصم على اللي بعدها' },
    { i: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6', t: 'فواتيرك محفوظة', s: 'من غير ورق ولا بحث' },
    { i: 'M12 2l7 4v6c0 4.4-3 8.3-7 10-4-1.7-7-5.6-7-10V6z', t: 'وصول مبكر للتشكيلات', s: 'قبل ما تنزل الفروع' },
    { i: 'M4 20c0-4 3.6-7 8-7s8 3 8 7M12 4a4 4 0 014 4c0 2.8-1.8 5-4 5s-4-2.2-4-5a4 4 0 014-4z', t: 'شوفيها عليكِ', s: 'جرّبي الطرحة قبل الشراء' }
  ];

  /* 🎨 إعادة تصميم كاملة.
     المشاكل في النسخة الأولى: إيموجي بحجم مختلف على كل جهاز، صفوف
     رمادية متكررة شكلها قائمة إعدادات مش صفحة براند، ومفيش حركة
     غير ظهور باهت. دلوقتي: أيقونات SVG مرسومة بنفس السُمك، الـQR
     هو البطل في النص بهالة حواليه، والصفوف بتترسم واحد ورا التاني
     بحركة جانبية ناعمة.
     ⚠️ كل المقاسات بالـvh عشان التابلت الرأسي — مفيش قيمة ثابتة
        بالبكسل تكسر الشكل على مقاس تاني. */
  var CSS = '\
#aiWrap{position:fixed;inset:0;z-index:8800;display:none;background:#070809;\
  color:#fff;font-family:\'Cairo\',sans-serif;direction:rtl;overflow:hidden}\
#aiWrap.on{display:flex;flex-direction:column;align-items:center;justify-content:center;\
  padding:4vh 7vw;gap:0}\
#aiWrap::before{content:"";position:absolute;inset:0;pointer-events:none;\
  background:radial-gradient(60vh 44vh at 50% 30%,rgba(168,130,255,.20),transparent 68%),\
             radial-gradient(50vh 40vh at 50% 96%,rgba(60,90,220,.13),transparent 70%)}\
#aiWrap::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.5;\
  background:repeating-linear-gradient(0deg,rgba(255,255,255,.028) 0 1px,transparent 1px 3px)}\
.aiIn{position:relative;z-index:1;width:100%;display:flex;flex-direction:column;\
  align-items:center;gap:1.1vh}\
.aiEyebrow{font-family:\'Space Grotesk\',sans-serif;font-size:1.75vh;letter-spacing:.44em;\
  color:#8f86b8;font-weight:700;opacity:0;animation:aiFade .6s .05s both}\
.aiTitle{font-size:4.5vh;font-weight:900;line-height:1.2;text-align:center;\
  letter-spacing:-.02em;opacity:0;animation:aiRise .7s .12s both}\
.aiTitle em{font-style:normal;background:linear-gradient(105deg,#e6d9ff,#a882ff 55%,#7c5cf0);\
  -webkit-background-clip:text;background-clip:text;color:transparent}\
.aiSub{font-size:2.05vh;color:#8a8fa3;font-weight:600;text-align:center;\
  opacity:0;animation:aiFade .6s .26s both}\
/* الـQR: إطار متدرّج رفيع + هالة بتتنفّس */\
.aiQrHold{position:relative;margin:1.6vh 0 .7vh;opacity:0;animation:aiPop .75s .34s both}\
.aiQrHold::before{content:"";position:absolute;inset:-1.6vh;border-radius:4.4vh;\
  background:conic-gradient(from 0deg,#a882ff,#5cc6ff,#a882ff);filter:blur(1.6vh);\
  opacity:.34;animation:aiSpin 9s linear infinite}\
.aiQr{position:relative;background:#fff;border-radius:3vh;padding:2.1vh;\
  width:min(31vh,50vw);box-shadow:0 2.4vh 6vh rgba(0,0,0,.72)}\
.aiQr svg{display:block;width:100%;height:auto}\
.aiScan{position:absolute;left:2.1vh;right:2.1vh;height:26%;border-radius:1vh;\
  background:linear-gradient(180deg,transparent,rgba(124,92,240,.20),transparent);\
  animation:aiScan 2.6s ease-in-out infinite}\
/* المميزات */\
.aiList{width:min(66vh,92vw);display:flex;flex-direction:column;gap:.85vh;margin-top:1.3vh}\
.aiRow{display:flex;align-items:center;gap:3.4vw;padding:1.35vh 3.4vw;border-radius:1.9vh;\
  background:linear-gradient(135deg,rgba(255,255,255,.055),rgba(255,255,255,.018));\
  border:1px solid rgba(255,255,255,.07);opacity:0;animation:aiSlide .6s both cubic-bezier(.2,.85,.25,1)}\
.aiIco{flex:none;width:4.4vh;height:4.4vh;border-radius:1.3vh;display:grid;place-items:center;\
  background:linear-gradient(140deg,rgba(168,130,255,.24),rgba(92,198,255,.11));\
  border:1px solid rgba(168,130,255,.24)}\
.aiIco svg{width:2.5vh;height:2.5vh;fill:none;stroke:#cbb6ff;stroke-width:1.7;\
  stroke-linecap:round;stroke-linejoin:round}\
.aiRow b{display:block;font-size:2.15vh;font-weight:800;letter-spacing:-.01em}\
.aiRow small{display:block;font-size:1.72vh;color:#868ca1;margin-top:.15vh;font-weight:600}\
.aiClose{margin-top:2vh;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);\
  color:#b9bece;border-radius:99px;padding:1.45vh 9vw;font-family:inherit;font-size:2vh;\
  font-weight:800;cursor:pointer;opacity:0;animation:aiFade .6s .95s both;\
  transition:background .18s,transform .18s}\
.aiClose:active{transform:scale(.97);background:rgba(255,255,255,.09)}\
@keyframes aiFade{from{opacity:0}to{opacity:1}}\
@keyframes aiRise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}\
@keyframes aiPop{from{opacity:0;transform:scale(.88)}to{opacity:1;transform:none}}\
@keyframes aiSlide{from{opacity:0;transform:translateX(22px)}to{opacity:1;transform:none}}\
@keyframes aiSpin{to{transform:rotate(1turn)}}\
@keyframes aiScan{0%{top:2.1vh;opacity:0}12%{opacity:1}88%{opacity:1}100%{top:70%;opacity:0}}\
';

  var rows = FEATURES.map(function (f, n) {
    return '<div class="aiRow" style="animation-delay:' + (0.46 + n * 0.1) + 's">'
      + '<span class="aiIco"><svg viewBox="0 0 24 24"><path d="' + f.i + '"/></svg></span>'
      + '<span><b>' + f.t + '</b><small>' + f.s + '</small></span></div>';
  }).join('');

  var HTML = '<div id="aiWrap"><div class="aiIn">'
    + '<div class="aiEyebrow">ECHARPE</div>'
    + '<div class="aiTitle">تجربتك معانا<br><em>في تطبيق واحد</em></div>'
    + '<div class="aiSub">امسحي الكود بكاميرا موبايلك</div>'
    + '<div class="aiQrHold"><div class="aiQr">' + QR + '<div class="aiScan"></div></div></div>'
    + '<div class="aiList">' + rows + '</div>'
    + '<button class="aiClose" id="aiClose">تمام</button>'
    + '</div></div>';


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
