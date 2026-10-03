/* ============================================================
   💳 pay-live-tablet.js — شاشة دفع الكارت على تابلت الفرع (v757 · 03-10-2026)
   ------------------------------------------------------------
   POS بيكتب الحالة في pos_test_settings/paylive_<الفرع> (pay-live.js).
   التابلت بيقرا بس (مبيكتبش حاجة) ويعرض للعميلة شاشة كاملة:
     حطّي الكارت ← البنك بيراجع (عداد 1→100% على المدة المعتادة) ← ✓ تمت / ✗ اترفضت + السبب.
   ⚠️ مستقل عن الكشك: لو الملف ده وقع، التقييم شغال عادي.
   ============================================================ */
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const app = window.fbApp;
const branch = localStorage.getItem('feedback_branch') || '';
if (app && branch && window.PayLiveCore && window.PayRing) {
  const db = getFirestore(app);
  const CORE = window.PayLiveCore;
  const CSS = `
#plTab{position:fixed;inset:0;z-index:9100;display:none;background:#08090c;color:#f4f5f7;font-family:'Cairo',sans-serif;direction:rtl;overflow:hidden}
#plTab.on{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2.6vh;text-align:center;animation:plTIn .45s cubic-bezier(.2,.8,.2,1)}
@keyframes plTIn{from{opacity:0;transform:scale(.985)}to{opacity:1;transform:none}}
#plTab::before{content:'';position:absolute;top:-30%;left:50%;transform:translateX(-50%);width:150vw;height:80vh;border-radius:50%;pointer-events:none;
  background:radial-gradient(closest-side,rgba(240,200,110,.14),transparent 70%);animation:plTBreath 7s ease-in-out infinite}
#plTab.ok::before{background:radial-gradient(closest-side,rgba(61,220,151,.2),transparent 70%)}
#plTab.bad::before{background:radial-gradient(closest-side,rgba(255,107,114,.16),transparent 70%)}
@keyframes plTBreath{0%,100%{opacity:.5;transform:translateX(-50%) scale(1)}50%{opacity:.95;transform:translateX(-50%) scale(1.08)}}
#plTab .eb{font-family:'Space Grotesk',sans-serif;font-size:2.4vh;letter-spacing:.26em;color:#6f7688;font-weight:700}
#plTab .amt{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:8vh;line-height:.95;letter-spacing:-.02em}
#plTab .amt span{font-size:3vh;color:#f0c86e;margin-inline-start:1vw}
#plTab .big{font-size:3.8vh;font-weight:800;min-height:5vh;transition:color .3s}
#plTab.ok .big{color:#3ddc97} #plTab.bad .big{color:#ff8a90}
#plTab .sub{font-size:2.3vh;color:#8b90a0;font-weight:600;max-width:70vw;line-height:1.6}
#plTab .cardIco{width:12vh;height:8vh;border-radius:1.4vh;position:relative;background:linear-gradient(135deg,#2a2f3c,#14171f);
  border:1px solid rgba(255,255,255,.12);box-shadow:0 2vh 5vh rgba(0,0,0,.5);animation:plTCard 2.2s ease-in-out infinite}
#plTab .cardIco::before{content:'';position:absolute;top:2vh;left:1.4vh;width:2.6vh;height:2vh;border-radius:.4vh;background:linear-gradient(135deg,#f0c86e,#b8913f)}
#plTab .cardIco::after{content:'';position:absolute;bottom:1.4vh;left:1.4vh;right:1.4vh;height:.6vh;border-radius:.3vh;background:rgba(255,255,255,.18)}
@keyframes plTCard{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(1.6vh) rotate(-4deg)}}
#plTab.prog .cardIco{display:none}
@media (prefers-reduced-motion:reduce){#plTab::before,#plTab .cardIco{animation:none}}
`;
  document.head.insertAdjacentHTML('beforeend', '<style>' + CSS + '</style>');
  document.body.insertAdjacentHTML('beforeend', `<div id="plTab">
    <div class="eb">CARD PAYMENT</div>
    <div class="amt" id="plTAmt">0<span>ج.م</span></div>
    <div class="cardIco" aria-hidden="true"></div>
    <div id="plTRing"></div>
    <div class="big" id="plTBig">حطّي الكارت في الماكينة</div>
    <div class="sub" id="plTSub"></div>
  </div>`);
  const $ = id => document.getElementById(id);
  const wrap = $('plTab');
  const ring = window.PayRing.create($('plTRing'), { size: 'min(26vh,36vw)' });
  let t0 = 0, eta = CORE.DEF.card, timer = 0, hideT = 0, curTs = 0;
  const stop = () => { if (timer) { clearInterval(timer); timer = 0; } };
  const hide = () => { stop(); clearTimeout(hideT); wrap.className = ''; t0 = 0; };
  function tick() {
    const el = Date.now() - t0;
    if (el > 1800) wrap.classList.add('prog');           // بعد ثانيتين: الكارت بيختفي والعداد ياخد المكان
    ring.set(CORE.progressAt(el, eta));
    $('plTBig').textContent = CORE.phase(el, eta, 'card', 'customer');
  }
  onSnapshot(doc(db, 'pos_test_settings', 'paylive_' + branch), snap => {
    const d = snap.exists() ? snap.data() : null;
    if (!d || d.kind !== 'card') return;
    // حالة قديمة (التابلت لسه فاتح/ساعة POS مختلفة) — منعرضش حاجة أقدم من 10 دقايق
    if (Math.abs(Date.now() - Number(d.ts || 0)) > 10 * 60 * 1000) { hide(); return; }
    if (Number(d.ts) === curTs) return; curTs = Number(d.ts);
    clearTimeout(hideT);
    $('plTAmt').innerHTML = Number(d.amount || 0).toLocaleString('en-EG', { maximumFractionDigits: 2 }) + '<span>ج.م</span>';
    if (d.state === 'waiting') {
      eta = Number(d.etaMs) || CORE.DEF.card; t0 = Date.now();
      wrap.className = 'on'; ring.set(1); $('plTSub').textContent = 'ادخّلي الرقم السري على الماكينة لو طلبه';
      stop(); timer = setInterval(tick, 400); tick();
    } else if (d.state === 'approved') {
      stop(); wrap.className = 'on prog ok'; ring.done(true);
      $('plTBig').textContent = 'تمت العملية بنجاح ✓'; $('plTSub').textContent = 'شكرًا 🌷 الفاتورة بتتطبع دلوقتي';
      hideT = setTimeout(hide, 6000);
    } else if (d.state === 'declined') {
      stop(); wrap.className = 'on prog bad'; ring.done(false);
      $('plTBig').textContent = 'العملية اترفضت'; $('plTSub').textContent = (d.reason || 'البنك رفض العملية') + ' — جرّبي كارت تاني أو طريقة دفع تانية';
      hideT = setTimeout(hide, 12000);
    } else hide();
  }, err => console.warn('[paylive]', err && err.code));
}
