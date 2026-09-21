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
      // v698: **بالبراند**. قبل كده أي توكن (أو `fcmTokenAt`) = «عندها التطبيق» ← عميلة عندها تطبيق echarpe
      //       مكانتش بتتدعى لتطبيق Glow في فرع Glow، والعكس.
      var bk = brandKey();
      var arr = d['fcmTokens_' + bk];
      if (Array.isArray(arr) && arr.length) return true;
      if (d['welcomeGranted_' + bk]) return true;
      var t = d.fcmTokens;
      if (t && typeof t === 'object' && !Array.isArray(t)) {
        return Object.keys(t).some(function (k) { return (((t[k] || {}).brand) || 'echarpe') === bk; });
      }
      return false;
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
  var QR_GLOW = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 33 33" width="100%" height="100%" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h33v33h-33z"/><path stroke="#000" d="M2 2.5h7M10 2.5h1M12 2.5h1M16 2.5h2M19 2.5h2M24 2.5h7M2 3.5h1M8 3.5h1M11 3.5h4M19 3.5h1M21 3.5h2M24 3.5h1M30 3.5h1M2 4.5h1M4 4.5h3M8 4.5h1M11 4.5h1M14 4.5h1M17 4.5h4M22 4.5h1M24 4.5h1M26 4.5h3M30 4.5h1M2 5.5h1M4 5.5h3M8 5.5h1M10 5.5h3M14 5.5h3M20 5.5h1M22 5.5h1M24 5.5h1M26 5.5h3M30 5.5h1M2 6.5h1M4 6.5h3M8 6.5h1M10 6.5h2M16 6.5h3M24 6.5h1M26 6.5h3M30 6.5h1M2 7.5h1M8 7.5h1M10 7.5h1M14 7.5h3M18 7.5h4M24 7.5h1M30 7.5h1M2 8.5h7M10 8.5h1M12 8.5h1M14 8.5h1M16 8.5h1M18 8.5h1M20 8.5h1M22 8.5h1M24 8.5h7M10 9.5h2M13 9.5h1M17 9.5h1M19 9.5h1M21 9.5h1M2 10.5h1M6 10.5h1M8 10.5h3M13 10.5h2M19 10.5h1M21 10.5h1M23 10.5h5M30 10.5h1M2 11.5h1M4 11.5h1M6 11.5h1M10 11.5h6M17 11.5h2M20 11.5h1M24 11.5h7M8 12.5h1M11 12.5h4M16 12.5h5M24 12.5h3M30 12.5h1M5 13.5h3M9 13.5h1M12 13.5h3M17 13.5h1M19 13.5h4M24 13.5h1M26 13.5h2M29 13.5h2M4 14.5h1M7 14.5h4M13 14.5h2M19 14.5h2M22 14.5h2M29 14.5h1M2 15.5h1M7 15.5h1M9 15.5h4M16 15.5h5M22 15.5h1M24 15.5h1M26 15.5h5M2 16.5h1M7 16.5h2M10 16.5h1M14 16.5h1M16 16.5h3M20 16.5h1M22 16.5h3M26 16.5h3M30 16.5h1M5 17.5h2M9 17.5h1M13 17.5h1M16 17.5h1M19 17.5h2M22 17.5h1M29 17.5h2M7 18.5h5M17 18.5h1M19 18.5h1M21 18.5h3M25 18.5h1M29 18.5h1M2 19.5h2M5 19.5h3M9 19.5h3M13 19.5h2M16 19.5h3M20 19.5h1M24 19.5h4M29 19.5h2M4 20.5h1M8 20.5h1M10 20.5h2M13 20.5h1M16 20.5h2M20 20.5h1M23 20.5h1M26 20.5h1M28 20.5h1M30 20.5h1M4 21.5h2M10 21.5h2M17 21.5h4M23 21.5h2M29 21.5h2M2 22.5h2M5 22.5h6M12 22.5h1M14 22.5h4M19 22.5h1M21 22.5h7M30 22.5h1M10 23.5h5M16 23.5h5M22 23.5h1M26 23.5h1M30 23.5h1M2 24.5h7M10 24.5h2M13 24.5h5M19 24.5h4M24 24.5h1M26 24.5h3M30 24.5h1M2 25.5h1M8 25.5h1M12 25.5h1M15 25.5h1M19 25.5h1M21 25.5h2M26 25.5h1M30 25.5h1M2 26.5h1M4 26.5h3M8 26.5h1M10 26.5h2M15 26.5h1M17 26.5h1M19 26.5h1M21 26.5h7M30 26.5h1M2 27.5h1M4 27.5h3M8 27.5h1M11 27.5h3M16 27.5h2M19 27.5h3M23 27.5h1M25 27.5h1M30 27.5h1M2 28.5h1M4 28.5h3M8 28.5h1M12 28.5h1M16 28.5h2M20 28.5h1M23 28.5h1M27 28.5h4M2 29.5h1M8 29.5h1M11 29.5h2M14 29.5h2M19 29.5h6M26 29.5h2M29 29.5h2M2 30.5h7M10 30.5h4M16 30.5h1M18 30.5h2M22 30.5h2M25 30.5h2M29 30.5h1"/></svg>';
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
  /* 🏷️ v694 — الشاشة بتاخد هوية **فرع التابلت**. قبل كده أي فرع (حتى Glow) كان بيعرض دعوة تطبيق echarpe ولينكه —
     عميلة Glow تمسح الكود تنزّل تطبيق براند تاني ونقطها مش فيه. نفس قايمة POS: `GLOW_BRANCHES = ['Glow']`.
     لقطات Glow من سكرينات المالك (20-09) — **باركود العضوية في `glow-home.jpg` متموّه عمدًا**: كود حقيقي ميتعرضش على شاشة عامة.
     لو لقطة اتشالت/متحمّلتش: الموبايل بيعرض شاشة فتح التطبيق (الأيقونة) والعناوين بتتبدّل عادي. */
  var GLOW_BRANCHES = ['Glow'];
  var BRANDS = {
    echarpe: {
      name: 'إيشارب', url: 'https://www.echarpe.store/loyalty/index.html', qr: QR, icon: 'invite/app-icon.png',
      c1: '#E4458E', c2: '#EB6A7E', c3: '#E2A646', bg1: '#FFF6FA', bg2: '#FBE6EF', bg3: '#F6D6E4', ink: '#3B1E2C', hint: '#7A4860', splash: '#FDEFF5',
      shots: [
        { src: 'invite/home.jpg',  t: 'نقاط مع كل قطعة',        s: 'بتتحوّل خصم على اللي بعدها' },
        { src: 'invite/shop.jpg',  t: 'التشكيلات الجديدة أول بأول', s: 'واطلبي وإنتِ في البيت' },
        { src: 'invite/tryon.jpg', t: 'شوفيها عليكِ',            s: 'جرّبي الطرحة قبل ما تشتري' }
      ]
    },
    glow: {
      name: 'Glow', url: 'https://www.echarpe.store/glow/index.html', qr: QR_GLOW, icon: 'invite/glow-icon.png',
      c1: '#1B1420', c2: '#2C1A28', c3: '#C0577A', bg1: '#FFF4F7', bg2: '#FCE7EC', bg3: '#F4B9C6', ink: '#1A1315', hint: '#8A5F70', splash: '#F4B9C6',
      shots: [
        { src: 'invite/glow-home.jpg',  t: 'نقاط مع كل قطعة',        s: 'بتتحوّل خصم على اللي بعدها' },
        { src: 'invite/glow-shop.jpg',  t: 'التشكيلات الجديدة أول بأول', s: 'واطلبي وإنتِ في البيت' },
        { src: 'invite/glow-tryon.jpg', t: 'شوفيها عليكِ',            s: 'جرّبي الطرحة قبل ما تشتري' }
      ]
    }
  };
  function brandKey() {
    var br = '';
    try { br = localStorage.getItem('feedback_branch') || ''; } catch (e) {}
    return GLOW_BRANCHES.indexOf(br) >= 0 ? 'glow' : 'echarpe';
  }
  var STEP_MS = 3400;                       // مدة كل لقطة
  var TOTAL_MS = STEP_MS * 3 + 1800;   // ≈ 12 ثانية وترجع لصفحة التقييم لوحدها

  var CSS = '\
#aiWrap{position:fixed;inset:0;z-index:8800;display:none;overflow:hidden;direction:rtl;\
  font-family:\'Cairo\',sans-serif;color:var(--ink,#3B1E2C);\
  background:linear-gradient(115deg,var(--bg1,#FFF6FA) 0%,var(--bg2,#FBE6EF) 52%,var(--bg3,#F6D6E4) 100%)}\
#aiWrap.on{display:grid;grid-template-columns:1fr 1fr;align-items:center}\
/* القماشة: نفس تدرّج كارت النقط في التطبيق، مكبّر ومايل ورا الموبايل — دي الحاجة الوحيدة الجريئة في الشاشة */\
.aiCloth{position:absolute;left:-9vw;top:-22vh;width:58vw;height:150vh;border-radius:9vh;\
  background:linear-gradient(160deg,var(--c1,#E4458E) 0%,var(--c2,#EB6A7E) 46%,var(--c3,#E2A646) 100%);\
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
.aiScreen{position:relative;width:100%;height:100%;border-radius:3.7vh;overflow:hidden;background:var(--splash,#FDEFF5)}\
/* شاشة فتح التطبيق: تحت اللقطات دايمًا — لو مفيش لقطات (Glow / نت قاطع) هي اللي بتبان، فالموبايل عمره ما يبقى فاضي */\
.aiSplash{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:0}\
.aiSplash img{width:46%;border-radius:22%;box-shadow:0 2vh 5vh -1.5vh rgba(0,0,0,.35)}\
#aiWrap.on .aiSplash img{animation:aiPulse 3.4s ease-in-out 1.2s infinite}\
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
.aiTitle{font-size:6vh;font-weight:900;line-height:1.25;color:var(--ink,#3B1E2C);letter-spacing:-.01em}\
.aiQrHold{position:relative;padding:1.3vh;border-radius:4.4vh;\
  background:linear-gradient(140deg,var(--c1,#E4458E),var(--c3,#E2A646))}\
.aiQr{position:relative;width:40vh;height:40vh;background:#fff;border-radius:3.3vh;padding:2.4vh;overflow:hidden}\
.aiQr svg{display:block}\
.aiQr::after{content:"";position:absolute;left:0;right:0;top:0;height:22%;pointer-events:none;\
  background:linear-gradient(180deg,transparent,rgba(228,69,142,.16));border-bottom:.35vh solid rgba(228,69,142,.55);\
  transform:translateY(-110%)}\
#aiWrap.on .aiQr::after{animation:aiScan 2.6s cubic-bezier(.5,0,.5,1) 1.3s infinite}\
.aiHint{font-size:2.9vh;font-weight:700;color:var(--hint,#7A4860)}\
.aiBar{width:40vh;height:.7vh;border-radius:1vh;background:rgba(59,30,44,.12);overflow:hidden}\
.aiBar i{display:block;height:100%;width:100%;border-radius:inherit;transform-origin:right center;\
  background:linear-gradient(90deg,var(--c3,#E2A646),var(--c1,#E4458E))}\
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
@keyframes aiPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}\
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

  document.head.insertAdjacentHTML('beforeend', '<style>' + CSS + '</style>');
  document.body.insertAdjacentHTML('beforeend', '<div id="aiWrap" role="dialog"></div>');
  var wrap = document.getElementById('aiWrap');
  var BR = null, shots = [], edge = null, cap = null;
  var timer = null, stepTimer = null, cur = 0, lastShownAt = 0;
  wrap.style.setProperty('--ai-total', (TOTAL_MS - 1000) + 'ms');

  function build(key) {
    BR = BRANDS[key] || BRANDS.echarpe;
    ['c1', 'c2', 'c3', 'bg1', 'bg2', 'bg3', 'ink', 'hint', 'splash'].forEach(function (k) { wrap.style.setProperty('--' + k, BR[k]); });
    wrap.setAttribute('aria-label', 'حمّلي تطبيق ' + BR.name);
    wrap.setAttribute('data-brand', key);
    var shotsHtml = BR.shots.map(function (sh, n) {
      return sh.src ? '<img class="aiShot" data-n="' + n + '" src="' + sh.src + '" alt="" decoding="async" draggable="false">' : '';
    }).join('');
    wrap.innerHTML = '<div class="aiCloth"></div>'
      + '<div class="aiSide">'
      +   '<img class="aiBrand" src="' + BR.icon + '" alt="' + BR.name + '">'
      +   '<div class="aiTitle">حمّلي تطبيق ' + BR.name + '</div>'
      +   '<div class="aiQrHold"><div class="aiQr">' + BR.qr + '</div></div>'
      +   '<div class="aiHint">وجّهي كاميرا موبايلك على الكود</div>'
      +   '<div class="aiBar"><i></i></div>'
      + '</div>'
      + '<div class="aiStage">'
      +   '<div class="aiPhone"><div class="aiScreen"><div class="aiSplash"><img src="' + BR.icon + '" alt=""></div>' + shotsHtml + '<div class="aiEdge"></div></div></div>'
      +   '<div class="aiCap"><b></b><small></small></div>'
      + '</div>'
      + '<button id="aiClose" aria-label="رجوع لصفحة التقييم"></button>';
    shots = [].slice.call(wrap.querySelectorAll('.aiShot'));
    edge = wrap.querySelector('.aiEdge');
    cap = wrap.querySelector('.aiCap');
    // لقطة متحمّلتش = تتشال من الدورة. شاشة الفتح تحتها بتبان، والـQR شغال.
    shots.forEach(function (im) {
      im.addEventListener('error', function () { im.dataset.bad = '1'; im.style.display = 'none'; });
    });
    // لمسة في أي حتة = رجوع فوري لصفحة التقييم (مفيش زرار «تمام» تدوّر عليه)
    document.getElementById('aiClose').onclick = hide;
  }
  // ⬇️ تحميل مسبق وقت فتح الكشك — الـService Worker يخزّنهم، فالشاشة تشتغل كاملة حتى لو نت الفرع قطع بعدها
  try { var _pb = BRANDS[brandKey()]; [_pb.icon].concat(_pb.shots.map(function (x) { return x.src; })).forEach(function (u) { if (u) (new Image()).src = u; }); } catch (e) {}

  function shotFor(n) { return shots.filter(function (im) { return +im.dataset.n === n && im.dataset.bad !== '1'; })[0] || null; }
  function setCap(n) {
    var sh = BR.shots[n] || BR.shots[0];
    cap.querySelector('b').textContent = sh.t;
    cap.querySelector('small').textContent = sh.s;
    cap.classList.remove('swap'); void cap.offsetWidth; cap.classList.add('swap');
  }
  function firstShot() {
    shots.forEach(function (im) { im.classList.remove('is', 'was', 'first'); });
    cur = 0; var im = shotFor(0); if (im) im.classList.add('first', 'was');
    setCap(0);
  }
  function nextShot() {
    var prev = shotFor(cur); cur = (cur + 1) % BR.shots.length; var nx = shotFor(cur);
    shots.forEach(function (im) { if (im !== prev && im !== nx) im.classList.remove('is', 'was', 'first'); });
    if (prev) { prev.classList.remove('is', 'first'); prev.classList.add('was'); }
    if (nx) {
      nx.classList.remove('was', 'first'); void nx.offsetWidth; nx.classList.add('is');
      edge.classList.remove('go'); void edge.offsetWidth; edge.classList.add('go');
    } else if (prev) { prev.classList.remove('was'); }     // مفيش لقطة للعنوان ده → شاشة الفتح
    setCap(cur);
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
    // v698: قرار POS أولًا (هو قاري مستند العميلة وعارف براند الفرع). الفحص المحلي فولباك لـPOS قديم بس.
    var hint = window.__capInvite; window.__capInvite = undefined;
    if (!force && hint === false) return;                          // POS: عندها تطبيق البراند ده
    if (!force && hint !== true && await hasApp(_phone)) return;   // مفيش قرار من POS ← نفحص بنفسنا
    // v695: نفس العميلة متشوفش الدعوة مرتين ورا بعض (الترحيب كان بيتعاد فالدعوة بتتعاد وراه — اتصلّح من المصدر، وده حزام أمان)
    if (!force && Date.now() - lastShownAt < 60000) return;
    lastShownAt = Date.now();
    wrap.classList.remove('out');
    wrap.classList.remove('on');
    build(brandKey());                                     // هوية الفرع **وقت العرض** — الفرع ممكن يتظبط بعد تحميل الصفحة
    void wrap.offsetWidth;                                 // إعادة تشغيل حركة الدخول من الأول كل مرة
    firstShot();
    wrap.classList.add('on');
    clearTimeout(timer); clearInterval(stepTimer);
    stepTimer = setInterval(nextShot, STEP_MS);
    timer = setTimeout(hide, TOTAL_MS);
  }

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
