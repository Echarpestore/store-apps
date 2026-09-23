/* ============================================================
   📱 instapay-tablet.js — شاشة إنستاباي على تابلت الفرع
   ------------------------------------------------------------
   بيتحط في: feedback/instapay-tablet.js
   وبيتحمّل من feedback/index.html بسطر واحد في الآخر:
     <script type="module" src="instapay-tablet.js?v=707"></script>

   ⚠️ الملف **مستقل تمامًا** عن كشك التقييم: بيعمل طبقة فوق الشاشة
      وبتظهر بس لما يكون فيه طلب على الفرع ده. لو الملف ده وقع
      لأي سبب، الكشك بيفضل شغال عادي — مفيش سطر واحد بيلمس كوده.

   🔐 التابلت **مبيكتبش** في Firestore خالص. بيقرا مستند العرض
      (insta_live) وبينده دالتين بس. الحالة والموافقة بتتكتب من
      السيرفر. لو التابلت قدر يكتب، أي حد يفتح DevTools في الصالة
      يخلّي الطلب "متأكد" ويمشي بالبضاعة.
   ============================================================ */
import { getFirestore, doc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js";

import './instapay-scan-core.js?v=707';
const scanCore = window.InstaScanCore;

const app = window.fbApp;
if (!app) console.warn('[instapay] التطبيق مش متهيّأ');

const db = getFirestore(app);
const fns = getFunctions(app, 'us-central1');
const callPay  = httpsCallable(fns, 'instaPay');
const callScan = httpsCallable(fns, 'instaScan', { timeout: 12000 });

const branch = localStorage.getItem('feedback_branch') || '';

/* ============================================================
   🎨 الشكل — أسود عميق، مساحة بيضا، حركة هادية.
   ⚠️ الألوان هنا مستقلة عن متغيّرات الكشك عن قصد: الكشك ألوانه
      تقييمات (أحمر/أصفر/أخضر) ولو ورثناها الشاشة تبقى صاخبة
      قدام عميلة بتحوّل فلوس.
   ============================================================ */
const CSS = `
#ipWrap{position:fixed;inset:0;z-index:9000;display:none;background:#08090c;
  color:#f4f5f7;font-family:'Cairo',sans-serif;direction:rtl;overflow:hidden}
#ipWrap.on{display:block;animation:ipIn .45s cubic-bezier(.2,.8,.2,1)}
@keyframes ipIn{from{opacity:0;transform:scale(.985)}to{opacity:1;transform:none}}
/* هالة ناعمة بتتنفّس — بتدي إحساس إن الشاشة "مستنية" */
#ipWrap::before{content:'';position:absolute;top:-30%;left:50%;transform:translateX(-50%);
  width:150vw;height:80vh;border-radius:50%;pointer-events:none;
  background:radial-gradient(closest-side,rgba(47,163,107,.16),transparent 70%);
  animation:ipBreath 7s ease-in-out infinite}
@keyframes ipBreath{0%,100%{opacity:.5;transform:translateX(-50%) scale(1)}
  50%{opacity:.9;transform:translateX(-50%) scale(1.09)}}
.ipPane{position:absolute;inset:0;display:none;flex-direction:column;
  align-items:center;justify-content:center;padding:6vh 6vw;gap:2.4vh;text-align:center}
.ipPane.on{display:flex;animation:ipUp .4s cubic-bezier(.2,.8,.2,1)}
@keyframes ipUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.ipEyebrow{font-family:'Space Grotesk',sans-serif;font-size:2.4vh;letter-spacing:.26em;
  color:#6f7688;font-weight:700}
.ipAmount{font-family:'Space Grotesk',sans-serif;font-weight:700;line-height:.9;
  font-size:11vh;letter-spacing:-.02em}
.ipAmount span{font-size:4vh;color:#2fa36b;margin-inline-start:1.4vw}
.ipLabel{font-size:2.4vh;color:#8b90a0;font-weight:600}
.ipQr{background:#fff;border-radius:3.4vh;padding:2.4vh;width:min(58vh,74vw);
  box-shadow:0 3vh 8vh rgba(0,0,0,.6)}
.ipQr img{display:block;width:100%;height:auto;border-radius:1.2vh}
.ipWho{font-size:2.6vh;font-weight:900}
.ipWho small{display:block;font-size:2vh;font-weight:600;color:#8b90a0;margin-top:.5vh}
.ipBtn{margin-top:1vh;border:none;border-radius:99px;padding:2.4vh 8vw;
  font-family:'Cairo',sans-serif;font-size:3vh;font-weight:900;color:#06120c;
  background:linear-gradient(160deg,#4ad18c,#2fa36b);cursor:pointer;
  box-shadow:0 1.6vh 4vh rgba(47,163,107,.35);transition:transform .16s,box-shadow .16s}
.ipBtn:active{transform:translateY(2px) scale(.985);box-shadow:0 .8vh 2vh rgba(47,163,107,.3)}
.ipGhost{background:none;border:1px solid #2b2f3b;color:#8b90a0;
  box-shadow:none;font-size:2.2vh;padding:1.6vh 6vw}
/* الكاميرا */
.ipCam{position:relative;width:min(70vh,86vw);aspect-ratio:3/4;border-radius:3vh;
  overflow:hidden;background:#000;box-shadow:0 3vh 8vh rgba(0,0,0,.65)}
.ipCam video{width:100%;height:100%;object-fit:cover}
/* ⚠️ العرض **مش** مقلوب عن قصد. الكاميرا الأمامية بتتعرض عادة
   كمراية، وده هنا ضار: العميلة بتشوف إيصالها مقلوب فتلف التليفون
   عشان تظبطه — وتخرّب اللقطة. من غير قلب، اللي على الشاشة هو
   نفسه اللي بيتبعت. */
.ipCam video.flip{transform:scaleX(-1)}
.ipCam .frame{position:absolute;inset:6%;border-radius:2vh;
  box-shadow:0 0 0 2px rgba(255,255,255,.22) inset}
/* شعاع المسح — بيوضّح للعميلة إن الجهاز بيقرا فعلًا */
.ipCam .beam{position:absolute;left:0;right:0;height:22%;
  background:linear-gradient(180deg,transparent,rgba(74,209,140,.28),transparent);
  animation:ipBeam 2.1s linear infinite}
@keyframes ipBeam{0%{top:-22%}100%{top:100%}}
/* الحقول الثلاثة */
.ipChips{display:flex;gap:1.6vw;width:min(70vh,86vw)}
.ipChip{flex:1;position:relative;overflow:hidden;border:1px solid #232733;
  background:#111319;border-radius:1.8vh;padding:1.6vh .6vw;font-size:2vh;
  font-weight:700;color:#6f7688;transition:color .3s,border-color .3s}
.ipChip::after{content:'';position:absolute;inset:0;background:linear-gradient(160deg,#2fa36b,#1d7a4e);
  transform:scaleY(0);transform-origin:bottom;transition:transform .45s cubic-bezier(.2,.8,.2,1);z-index:0}
.ipChip span{position:relative;z-index:1}
.ipChip.ok{color:#eafff4;border-color:#2fa36b}
.ipChip.ok::after{transform:scaleY(1)}
.ipHint{font-size:2.2vh;color:#8b90a0;min-height:3vh;font-weight:600}
/* علامة النجاح */
.ipTick{width:22vh;height:22vh}
.ipTick circle,.ipTick path{fill:none;stroke:#2fa36b;stroke-width:6;
  stroke-linecap:round;stroke-linejoin:round}
.ipTick circle{stroke-dasharray:308;stroke-dashoffset:308;animation:ipDraw .6s ease forwards}
.ipTickBad circle,.ipTickBad path{stroke:#e5484d}
.ipTick path{stroke-dasharray:60;stroke-dashoffset:60;animation:ipDraw .4s .45s ease forwards}
@keyframes ipDraw{to{stroke-dashoffset:0}}
.ipBig{font-size:4.6vh;font-weight:900}
/* ============================================================
   📐 وضع بالعرض (landscape) — التابلت في الفرع شغّال بالعرض دايمًا.
   · شاشة الانتظار: المبلغ والزراير **يمين** · الـQR **شمال** (طلب المالك 22-09).
   · شاشة المسح: الكاميرا لازقة في **أقصى الشمال** جنب عدسة التابلت نفسها،
     عشان العميلة تحط الإيصال قدام العدسة على طول من غير ما تلف إيدها.
   ⚠️ العمود الأول في الشبكة = **اليمين** لأن الشاشة RTL.
   ⚠️ في الوضع الطولي الغلافين شفافين (display:contents) — يعني الشكل القديم زي ما هو بالظبط.
   ⚠️ ممنوع علامة backtick جوّه البلوك ده — البلوك نفسه متحدّد بيها، وأي واحدة بتقفله في نصّه
      وتكسر الملف كله (حصل 22-09 والتابلت وقف).
   ============================================================ */
.ipCol{display:contents}
@media (orientation:landscape){
  /* --- 1️⃣ الانتظار: مبلغ يمين · QR شمال --- */
  #ipWait.on{display:grid;grid-template-columns:1fr 1fr;grid-template-areas:'info qr' 'act qr';
    align-content:center;align-items:center;justify-items:center;gap:1.5vh 4vw;padding:4vh 4vw;row-gap:2vh}
  #ipWait .ipCol{display:flex;flex-direction:column;align-items:center;gap:1.4vh}
  #ipWait .ipColInfo{grid-area:info;align-self:end}
  #ipWait .ipColAct{grid-area:act;align-self:start;width:100%}
  #ipWait .ipColQr{grid-area:qr;align-self:center}
  #ipWait .ipQr{width:min(72vh,42vw)}
  #ipWait .ipAmount{font-size:13vh}
  #ipWait .ipBtn{width:min(38vw,52vh)}
  /* --- 2️⃣ المسح: الكاميرا أقصى الشمال --- */
  #ipScan.on{display:grid;grid-template-columns:1fr auto;align-items:center;justify-items:center;
    padding:0;gap:0 3vw}
  #ipScan .ipCol{display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:2vh;padding:3vh 3vw;width:100%}
  #ipScan .ipCam{height:100vh;width:auto;aspect-ratio:3/4;border-radius:3vh 0 0 3vh;
    margin:0;justify-self:start}
  #ipScan .ipChips,#ipScan .ipActions{width:100%}
}
`;

const HTML = `
<div id="ipWrap">
  <!-- 1️⃣ استنى: الـQR والمبلغ -->
  <div class="ipPane" id="ipWait">
    <div class="ipCol ipColInfo">
      <div class="ipEyebrow">INSTAPAY</div>
      <div class="ipAmount" id="ipAmt">0<span>ج.م</span></div>
      <div class="ipLabel">المبلغ المطلوب تحويله</div>
    </div>
    <div class="ipCol ipColQr">
      <div class="ipQr"><img id="ipQrImg" alt="QR"></div>
    </div>
    <div class="ipCol ipColAct">
      <div class="ipWho" id="ipWho"></div>
      <button class="ipBtn" id="ipDone">تم التحويل ✓</button>
      <button class="ipBtn ipGhost" id="ipWaitBack" style="margin-top:.6vh">لسه هحوّل — استني</button>
    </div>
  </div>

  <!-- 2️⃣ المسح -->
  <div class="ipPane" id="ipScan">
    <div class="ipCol ipColScan">
      <div class="ipEyebrow">مسح الإيصال</div>
      <div class="ipChips">
        <div class="ipChip" id="ipC1"><span>المبلغ</span></div>
        <div class="ipChip" id="ipC2"><span>الوقت</span></div>
        <div class="ipChip" id="ipC3"><span>رقم العملية</span></div>
        <div class="ipChip" id="ipC4"><span>المستفيد</span></div>
      </div>
      <div class="ipHint" id="ipHint">وجّهي شاشة الإيصال ناحية الكاميرا</div>
      <div class="ipActions" style="display:flex;gap:1.6vw;width:min(70vh,86vw)">
        <button class="ipBtn ipGhost" id="ipBack" style="flex:1;padding:1.4vh 2vw;font-size:2vh">◀ رجوع</button>
        <button class="ipBtn ipGhost" id="ipHelp" style="flex:2;padding:1.4vh 2vw;font-size:2vh">سلّمي الكاشير</button>
      </div>
    </div>
    <div class="ipCam"><video id="ipVid" playsinline muted autoplay></video>
      <div class="frame"></div><div class="beam"></div></div>
  </div>

  <!-- 3️⃣ تم -->
  <div class="ipPane" id="ipOk">
    <svg class="ipTick" viewBox="0 0 120 120"><circle cx="60" cy="60" r="49"></circle>
      <path d="M38 62 L54 78 L84 46"></path></svg>
    <div class="ipBig">تم التأكيد</div>
    <div class="ipLabel">استني الفاتورة من الكاشير</div>
  </div>

  <!-- 4️⃣ رفض نهائي — مفيش فايدة من إعادة التصوير -->
  <div class="ipPane" id="ipBad">
    <svg class="ipTick ipTickBad" viewBox="0 0 120 120"><circle cx="60" cy="60" r="49"></circle>
      <path d="M44 44 L76 76 M76 44 L44 76"></path></svg>
    <div class="ipBig" id="ipBadMsg">الإيصال مش مظبوط</div>
    <div class="ipLabel">كلّمي الكاشير</div>
    <button class="ipBtn ipGhost" id="ipRetry" style="margin-top:2vh">عندي إيصال تاني</button>
  </div>

  <!-- 5️⃣ سلّمي الكاشير -->
  <div class="ipPane" id="ipMan">
    <div class="ipBig">سلّمي الإيصال للكاشير</div>
    <div class="ipLabel">هتراجعه بنفسها وتكمّل الفاتورة</div>
    <!-- 🔴 الشاشة دي كانت مسدودة: العميلة توصلها وتقف. أي شاشة
         مفيهاش طريق للخروج = طريق مسدود، حتى لو الكاشير هتتصرف. -->
    <button class="ipBtn ipGhost" id="ipManBack" style="margin-top:2vh">◀ جرّبي تاني</button>
  </div>
</div>`;

document.head.insertAdjacentHTML('beforeend', '<style>' + CSS + '</style>');
document.body.insertAdjacentHTML('beforeend', HTML);

const $ = id => document.getElementById(id);
const wrap = $('ipWrap');
const panes = { wait: $('ipWait'), scan: $('ipScan'), ok: $('ipOk'), bad: $('ipBad'), man: $('ipMan') };
let cur = null;      // الطلب الحالي
let stream = null;   // الكاميرا
let loop = null;     // مؤقّت المسح
let busy = false;    // current request token
let scanGeneration = 0, cameraPending = null, nextScanAt = 0, readErrors = 0;
const SCAN_POLL_MS = 150;
let prevGray = null; // الفريم السابق لقياس الثبات

/* ⏲️ الشاشة بتقفل نفسها — التابلت ده أصلًا تابلت التقييم.
   ------------------------------------------------------------
   🔴 الباج: الشاشة مابتتقفلش غير لما POS يلغي الطلب أو الفاتورة تتحفظ.
      أي طريق تاني = تابلت معلّق للأبد: الكاشير فضّت السلة · قفلت POS ·
      كمّلت كاش · الطلب انتهت مدته (٢٠ دقيقة) · اتأكد والبيعة ماكملتش.
      ومحدش بييجي يمسح `insta_live` في الحالات دي.
   ✅ التابلت بيحمي نفسه ومابيستناش حد:
      • شاشات **النهاية** (سلّمي للكاشير · تم · مرفوض) العميلة خلّصت
        دورها فيها → بتقفل بعد مدة قصيرة من غير أي تحديث.
      • أي شاشة فضلت أطول من عمر الطلب على السيرفر → بتقفل.
   ⚠️ الوقت **محلي** (من لحظة ما التابلت عرض الشاشة) مش من ساعة
      السيرفر — ساعة التابلت لو غلط ماتأثرش.
   ⚠️ القفل هنا للشاشة بس. الطلب نفسه على السيرفر زي ما هو: لو
      الكاشير أكّدت بعدها، التحديث بييجي والشاشة ترجع تعرضه. */
const IP_PANE_IDLE_MS = { man: 90 * 1000, ok: 60 * 1000, bad: 3 * 60 * 1000 };
const IP_SESSION_MAX_MS = 20 * 60 * 1000;   // نفس `expiresAt` في functions/instapay.js
function ipShouldAutoHide(pane, paneAgeMs, sessionAgeMs) {
  if (!pane) return false;
  const idle = IP_PANE_IDLE_MS[pane];
  if (idle && paneAgeMs >= idle) return true;
  return sessionAgeMs >= IP_SESSION_MAX_MS;
}
let curPane = null, paneAt = 0;

function show(name) {
  wrap.classList.add('on');
  Object.keys(panes).forEach(k => panes[k].classList.toggle('on', k === name));
  curPane = name; paneAt = Date.now();   // كل عرض/تحديث بيصفّر العدّاد
}
function hide() {
  wrap.classList.remove('on');
  Object.values(panes).forEach(p => p.classList.remove('on'));
  stopCam();
  cur = null; curPane = null;
}
setInterval(() => {
  if (!curPane || !cur) return;
  const now = Date.now();
  if (ipShouldAutoHide(curPane, now - paneAt, now - (cur.seenAt || now))) hide();
}, 5000);

/* 📷 الكاميرا الأمامية — العميلة واقفة قدام التابلت وبتوري تليفونها. */
async function startCam() {
  if (stream) return true;
  if (cameraPending) return cameraPending;
  const generation = scanGeneration;
  const pending = (async () => {
    let opened;
    try {
      opened = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false
      });
      if (generation !== scanGeneration || !cur || curPane !== 'scan') {
        opened.getTracks().forEach(t => t.stop()); return false;
      }
      stream = opened;
      const track = stream.getVideoTracks()[0];
      // Autofocus where supported; failure must not block fixed-focus tablets.
      try {
        const caps = track && track.getCapabilities ? track.getCapabilities() : {};
        if (caps.focusMode && caps.focusMode.includes('continuous'))
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
      } catch (e) {}
      const v = $('ipVid'); v.srcObject = opened; await v.play().catch(() => {});
      return generation === scanGeneration && stream === opened;
    } catch (e) {
      if (opened) opened.getTracks().forEach(t => t.stop());
      if (generation === scanGeneration) { stream = null; $('ipHint').textContent = 'الكاميرا مش متاحة'; show('man'); }
      return false;
    }
  })();
  cameraPending = pending;
  try { return await pending; } finally { if (cameraPending === pending) cameraPending = null; }
}
function stopCam() {
  scanGeneration++; busy = false; cameraPending = null; nextScanAt = 0; readErrors = 0;
  if (loop) { clearInterval(loop); loop = null; }
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  $('ipVid').srcObject = null;
  prevGray = null;
}
async function beginScan() {
  if (!cur) return;
  show('scan'); const generation = scanGeneration;
  if (await startCam()) {
    if (generation !== scanGeneration || curPane !== 'scan') return;
    if (!loop) loop = setInterval(tick, SCAN_POLL_MS);
    tick();
  }
}

/* 🧊 قياس ثبات الصورة.
   ⚠️ ده اللي بيحل مشكلة اهتزاز التليفون: مبنبعتش أي فريم للسيرفر
      إلا لما الصورة تهدا. بيوفّر فلوس القراءة، والأهم إنه بيمنع
      صور متلخبطة تطلع نتيجة غلط. */
function grayOf(video, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  const r = captureRect(video); if (!r) return null;
  x.drawImage(video, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = (d[i] * 3 + d[i + 1] * 6 + d[i + 2]) / 10;
  return g;
}
function diffScore(a, b) {
  if (!a || !b || a.length !== b.length) return 999;
  let s = 0; for (let i = 0; i < a.length; i += 3) s += Math.abs(a[i] - b[i]);
  return s / (a.length / 3);
}

/* 🔄 شبكة أمان للانعكاس.
   الأصل إن الفريم الخام من الكاميرا **مش** معكوس، وده اللي بنبعته.
   لكن فيه أجهزة (ويب-فيو على بعض التابلتات) بترجّع الفريم معكوس
   فعلًا — وساعتها النص بيوصل Vision مقلوب ومحصلتش قراءة خالص.
   بدل ما نكتشفها في الفرع، بنكتشفها لوحدنا: محاولتين من غير ما
   يتقرا **أي** حقل = نقلب ونكمّل. القلب بيتطبّق على اللقطة
   والعرض مع بعض عشان العميلة تشوف اللي بيتبعت. */
/* 🔴 v703 (22-09 — «الصورة متشقلبة وبيفضل بنقرا»): القلب كان **بيتحفظ للأبد من أول لقطة فاضية**. أول فريم بيتبعت قبل ما العميلة
   ترفع موبايلها ← «مفيش حقل» ← قلب + `localStorage='1'` ← وشرط الرجوع كان `!== '1'` فعمره ما اتحقق. التابلت فضل مقلوب،
   وكل لقطة بتوصل Vision معكوسة فمبيقراش حاجة. دلوقتي القلب **تجربة**: بيتحفظ بس لو اللقطة المقلوبة اتقرا منها حاجة فعلًا،
   ولو فشلت يرجع. والمفتاح اتغيّر (`flip2`) عشان التابلتات اللي اتحفظ عليها القلب الغلط ترجع طبيعي. */
const FLIP_KEY = 'insta_flip2_' + branch;
let flipCapture = localStorage.getItem(FLIP_KEY) === '1', blindTries = 0, flipTrial = false, flipTested = false;

/* 💾 القلب بيتحفظ **للجهاز**. التابلت اللي بيعكس هيفضل يعكس، فمفيش
   معنى إننا نكتشفه من أول في كل عملية ونضيّع محاولة على العميلة. */
/* القلب للعرض واللقطة بس — من غير حفظ (تجربة) */
function setFlipView(on) {
  flipCapture = !!on;
  $('ipVid').classList.toggle('flip', flipCapture);
}
function setFlip(on) {
  flipCapture = !!on;
  try { localStorage.setItem(FLIP_KEY, flipCapture ? '1' : '0'); } catch (e) {}
  $('ipVid').classList.toggle('flip', flipCapture);
  // الزرار اتشال من الواجهة — بنفحص وجوده قبل ما نلمسه
  const b = $('ipFlip'); if (b) b.textContent = flipCapture ? '🔄 مقلوبة' : '🔄 اقلبي';
}

/* ✂️ بنبعت **جوّه الإطار بس**، مش الصورة كلها.
   قبل كده كنا بنبعت الشاشة + الإيد + المكتب + الخلفية، وVision
   بيدوّر على نص في ده كله بينما اللي عايزينه ربع الصورة. القص
   بيصغّر الصورة للربع وبيشيل أي نص مش من الإيصال — أسرع وأدق. */
const INSET = 0.06;   // نفس نسبة .frame في الـCSS

function captureRect(video) {
  const box = video.getBoundingClientRect();
  return scanCore.cropRect(video.videoWidth, video.videoHeight, box.width, box.height, INSET);
}
function frameJpeg(video) {
  const r = captureRect(video); if (!r) return null;
  const { sx, sy, sw, sh } = r;
  // Keep small recipient/reference digits at native resolution; crop removes background upload cost.
  const scale = Math.min(1, 1600 / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * scale)); c.height = Math.max(1, Math.round(sh * scale));
  const x = c.getContext('2d', { alpha: false });
  if (flipCapture) { x.translate(c.width, 0); x.scale(-1, 1); }
  x.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.88).split(',')[1];
}

/* 🔢 المربعات بتوري **اللي اتقرا فعلًا** مش اسم الحقل.
   "المبلغ" رمادي مبتقولش حاجة؛ "1600 ≠ 350" بتقول كل حاجة. */
function chip(el, on, label, val) {
  el.classList.toggle('ok', !!on);
  const span = document.createElement('span'); span.textContent = label;
  if (val) { span.appendChild(document.createElement('br')); const b = document.createElement('b'); b.style.fontSize = '1.7vh'; b.textContent = String(val); span.appendChild(b); }
  el.replaceChildren(span);
}
function paintChecks(ch, d) {
  const seen = (d && d.seenCents && d.seenCents.length)
    ? d.seenCents.map(c => (c / 100).toLocaleString('en-EG')).join('/') : '';
  chip($('ipC1'), ch && ch.amount, 'المبلغ', ch && ch.amount ? '✓' : seen);
  chip($('ipC2'), ch && ch.time, 'الوقت',
    (ch && ch.time) ? '✓' : (d && d.driftMin != null ? d.driftMin + ' د' : ''));
  chip($('ipC3'), ch && ch.reference, 'رقم العملية',
    (d && d.ref) ? String(d.ref).slice(-6) : '');
  chip($('ipC4'), ch && ch.beneficiary, 'المستفيد', (ch && ch.beneficiary) ? '✓' : '');
}

async function tick() {
  if (!cur || curPane !== 'scan' || !stream || document.hidden) return;
  const v = $('ipVid'); if (!v.videoWidth || v.readyState < 2) return;
  const g = grayOf(v, 96, 128); if (!g) return;
  const previous = prevGray, d = diffScore(previous, g); prevGray = g;
  // Sample while OCR is in flight so motion compares neighbouring frames, not seconds apart.
  if (busy || Date.now() < nextScanAt) return;
  if (previous && d > 24) { $('ipHint').textContent = 'ثبّتي الموبايل لحظة'; return; }
  const quality = scanCore.quality(g, 96, 128);
  if (quality.contrast < 14 || quality.edges < 1.5) {
    $('ipHint').textContent = 'خلّي الإيصال كامل وواضح جوّه الإطار'; return;
  }
  const request = { sid: cur.sid, generation: scanGeneration };
  const active = () => cur && cur.sid === request.sid && scanGeneration === request.generation && curPane === 'scan';
  busy = request;
  try {
    const img = frameJpeg(v); if (!img) return;
    $('ipHint').textContent = 'بنراجع بيانات الإيصال…';
    const r = (await callScan({ sid: request.sid, image: img })).data || {};
    if (!active() || r.stale) return;
    if (r.error === 'READ_FAILED') {
      readErrors++; nextScanAt = Date.now() + Math.min(2000, 500 * readErrors);
      $('ipHint').textContent = r.hint || 'القراءة اتأخرت — بنحاول تاني'; return;
    }
    readErrors = 0;
    paintChecks(r.checks, r.detail);

    // 👁️ عمى كامل: مفيش ولا حقل اتقرا → غالبًا الصورة مقلوبة
    const ch = r.checks || {};
    const sawSomething = scanCore.hasReading(ch, r.detail);
    if (!sawSomething && !r.ok) {
      blindTries++;
      // v703: لقطتين عمى ورا بعض (مش واحدة) ← نجرّب الاتجاه التاني **من غير ما نحفظه**
      if (blindTries >= 2 && !flipTrial && !flipTested) {
        flipTrial = true; blindTries = 0; setFlipView(!flipCapture);
        $('ipHint').textContent = 'بنظبط الكاميرا…';
        return;
      }
      // التجربة فشلت كمان ← نرجع للاتجاه الأصلي ومنجرّبش تاني في العملية دي
      if (flipTrial && blindTries >= 2) { flipTrial = false; flipTested = true; blindTries = 0; setFlipView(!flipCapture); }
    } else {
      blindTries = 0;
      if (flipTrial) { flipTrial = false; flipTested = true; setFlip(flipCapture); }   // الاتجاه ده اتقرا منه ← يتحفظ للجهاز
    }

    if (r.ok) { stopCam(); show('ok'); return; }

    /* ⛔ رفض نهائي → نوقف فورًا. الاستمرار في التصوير هنا بيخلي
       العميلة واقفة تستنى حاجة النظام عارف من أول لقطة إنها
       مش هتتغير. */
    if (r.fatal) { stopCam(); $('ipBadMsg').textContent = r.hint || 'الإيصال مش مظبوط'; show('bad'); return; }

    if (r.error === 'DUPLICATE') { stopCam(); $('ipBadMsg').textContent = 'الإيصال ده اتستخدم قبل كده'; show('bad'); return; }
    // ⚠️ كانت بتفضل على "بنقرا…" لما الرد يرجع فاضي — فالعميلة
    //    والكاشير فاكرين إن النظام معلّق وهو شغال.
    $('ipHint').textContent = r.hint
      || (sawSomething ? 'ثبّتي شوية كمان' : 'مش شايف الإيصال — قرّبيه أو اقلبي الكاميرا');
  } catch (e) {
    if (!active()) return;
    const c = String((e && e.code) || '');
    // خلصت المحاولات أو الطلب اتقفل → الكاشير تكمّل
    if (c.includes('resource-exhausted') || c.includes('failed-precondition') || c.includes('not-found')) {
      stopCam(); show('man'); return;
    }
    readErrors++; nextScanAt = Date.now() + Math.min(2000, 500 * readErrors);
    $('ipHint').textContent = 'النت بطيء — بنحاول تاني، أو سلّمي الكاشير';
  } finally { if (busy === request) busy = false; }
}

$('ipDone').onclick = () => {
  if (!cur) return;
  const sid = cur.sid;
  // Start the camera now; the optional ready round-trip must not delay capture.
  callPay({ action: 'ready', sid }).catch(() => {});
  beginScan();
};
$('ipHelp').onclick = () => { stopCam(); show('man'); };
// ◀ رجوع للـQR — لو دوست «تم التحويل» قبل ما تحوّل
$('ipBack').onclick = () => { stopCam(); show('wait'); $('ipDone').disabled = false; };
$('ipManBack').onclick = () => { blindTries = 0; beginScan(); };
// زرار على شاشة الـQR بيوضّح للعميلة إن مفيش استعجال
$('ipWaitBack').onclick = () => { $('ipHint') && ($('ipHint').textContent = ''); };
/* 🔄 زرار القلب اتشال من الشاشة عن قصد.
   العميلة مش المفروض تفهم يعني إيه "اقلبي الكاميرا" — ده قرار تقني
   بنجرب الاتجاه التاني بعد محاولتين بدون قراءة، ونحفظه فقط لو قرأ بيانات. */
$('ipRetry').onclick = () => {
  stopCam(); paintChecks(null); blindTries = 0; flipTrial = false; flipTested = false;
  beginScan();
};
setFlip(flipCapture);

/* 🖼️ الـQR بيتقرا من إعدادات الفرع **مرة واحدة** ويتخزّن في الذاكرة.
   ⚠️ عن قصد مش جوّه مستند الحالة: صورة الـQR حوالي ٢٠٠ كيلو، ولو
      كانت جوّه المستند كانت هتتبعت من جديد مع **كل** تحديث حالة
      (كل فريم مسح) — يعني ميجات على نت الفرع من غير أي فايدة. */
let _qr = null;
async function loadQr(){
  if (_qr) { $('ipQrImg').src = _qr; return; }
  try{
    const c = await getDoc(doc(db, 'pos_test_settings', 'instapay_' + branch));
    _qr = (c.exists() && c.data().qr) || '';
    $('ipQrImg').src = _qr;
  }catch(e){ console.warn('[instapay] qr', e && e.code); }
}

/* 👂 الاستماع اللايف — الشاشة بتفتح بنفسها أول ما الكاشير تدوس OK.
   مفيش زرار ولا تحديث ولا انتظار. */
if (branch) {
  onSnapshot(doc(db, 'insta_live', branch), snap => {
    const s = snap.exists() ? snap.data() : null;
    if (!s) { hide(); return; }
    /* ⏳ v701 (22-09): طلب قديم معلّق — الكاشير قفلت POS/الفاتورة والسيرفر ماوصلوش «إلغاء»، فالمستند فضل `waiting`
       وأول ما التابلت يفتح (أو الرولز ترجع) بيلاقيه ويعرضه من غير ما حد يبعت حاجة. طلب أقدم من 20 دقيقة = مش حي. */
    const _age = Date.now() - Number(s.updatedAt || s.startedAt || 0);
    if (Number(s.updatedAt || s.startedAt) && _age > 20 * 60 * 1000 && (s.status === 'waiting' || s.status === 'scanning')) { stopCam(); hide(); return; }
    /* v702 (22-09): «تم التأكيد — استني الفاتورة» كان بيفضل على الشاشة للأبد لو POS ماقفلش الطلب (المستند بيفضل approved)،
       وبيغطّي شاشة كتابة الرقم/كود الرصيد. نتيجة (approved/rejected) أقدم من 3 دقايق = خلصت. */
    if (Number(s.updatedAt || s.startedAt) && _age > 3 * 60 * 1000 && (s.status === 'approved' || s.status === 'rejected')) { stopCam(); hide(); return; }
    // طلب جديد على نفس التابلت = الشاشة تبدأ من الأول
    if (!cur || cur.sid !== s.sid) {
      cur = { sid: s.sid, seenAt: Date.now() };
      stopCam(); curPane = null; paintChecks(null, null);
      blindTries = 0; flipTrial = false; flipTested = false;   // القلب إعداد جهاز — بيفضل، والتجربة بتبدأ من أول مع كل طلب
      flipCapture = localStorage.getItem(FLIP_KEY) === '1'; try { $('ipVid').classList.toggle('flip', flipCapture); } catch (e) {}
      $('ipAmt').innerHTML = (Number(s.amountCents || 0) / 100)
        .toLocaleString('en-EG', { minimumFractionDigits: 0 }) + '<span>ج.م</span>';
      /* 📇 العنوان + الأرقام الإضافية. العميلة ساعات بتحوّل على رقم
         المحفظة مش على عنوان الإنستاباي، فلازم تشوف الاتنين قدامها
         بدل ما تسأل الكاشير. */
      const extra = (s.aliases || []).filter(a => a && a !== s.alias);
      $('ipWho').innerHTML = (s.alias || '')
        + (extra.length ? '<div style="font-size:2.3vh;margin-top:.6vh;direction:ltr">' + extra.join(' · ') + '</div>' : '')
        + '<small>' + (s.beneficiary || '') + '</small>';
      loadQr();
    }
    if (s.status === 'waiting') show('wait');
    else if (s.status === 'scanning') {
      if (!stream && curPane !== 'man' && curPane !== 'wait' && curPane !== 'bad') beginScan();
      if (curPane === null) beginScan();
      if (curPane === 'scan') paintChecks(s.checks, s.detail);
    }
    else if (s.status === 'approved') {
      stopCam(); show('ok');
      const _sid = s.sid; clearTimeout(window._ipOkT);
      window._ipOkT = setTimeout(() => { if (cur && cur.sid === _sid) hide(); }, 90 * 1000);   // v702: مبتفضلش أكتر من دقيقة ونص
    }
    else if (s.status === 'rejected') { stopCam(); $('ipBadMsg').textContent = s.hint || 'الإيصال مش مظبوط'; show('bad'); }
    else hide();
  }, err => console.warn('[instapay]', err && err.code));
}

// 🔌 الصفحة اتقفلت → الكاميرا تطفي فورًا. تابلت في الصالة والكاميرا
//    شغالة من غير سبب = مشكلة خصوصية مش تفصيلة تقنية.
window.addEventListener('pagehide', stopCam);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCam();
  else if (cur && curPane === 'scan') beginScan();
});
