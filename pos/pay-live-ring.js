/* ============================================================
   💫 pay-live-ring.js — دايرة التقدّم الفخمة (v757) — POS + التابلت
   ------------------------------------------------------------
   PayRing.create(host, {size, theme}) → عنصر فيه:
     • دايرة متدرّجة (أخضر زمردي ← ذهبي) بتتملي بنعومة، وحواليها هالة بتتنفّس
     • الرقم % في النص بيعدّ بسلاسة (مش قفزات)
     • نجاح: الدايرة بتكمل 100% وتتحول لعلامة ✓ بترسم نفسها + نبضة
     • رفض: ✗ أحمر بهزة خفيفة
   الحركة transform/opacity/stroke بس · بتقف مع prefers-reduced-motion.
   ============================================================ */
(function(){
  'use strict';
  if(window.PayRing) return;
  var CSS = ''
    + '.plr{position:relative;display:inline-grid;place-items:center;--sz:150px;width:var(--sz);height:var(--sz)}'
    + '.plr svg.dial{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);overflow:visible}'
    + '.plr .trk{fill:none;stroke:rgba(255,255,255,.08);stroke-width:7}'
    + '.plr .bar{fill:none;stroke-width:7;stroke-linecap:round;transition:stroke-dashoffset .9s cubic-bezier(.22,1,.36,1);filter:drop-shadow(0 0 6px rgba(47,200,140,.45))}'
    + '.plr .halo{position:absolute;inset:-14%;border-radius:50%;background:radial-gradient(closest-side,rgba(47,200,140,.22),transparent 72%);animation:plrBreath 2.8s ease-in-out infinite}'
    + '.plr .orb{position:absolute;inset:0;animation:plrSpin 2.4s linear infinite}'
    + '.plr .orb i{position:absolute;top:-3px;left:50%;width:9px;height:9px;margin-left:-4.5px;border-radius:50%;background:#fff;box-shadow:0 0 12px 3px rgba(240,200,110,.85)}'
    + '.plr .num{position:relative;font-family:"Space Grotesk",Cairo,sans-serif;font-weight:700;font-size:calc(var(--sz)*.27);letter-spacing:-.02em;color:#f4f5f7;direction:ltr}'
    + '.plr .num small{font-size:.45em;opacity:.6;margin-left:2px}'
    + '.plr .mark{position:absolute;inset:18%;width:64%;height:64%;opacity:0;transform:scale(.6);transition:opacity .35s,transform .45s cubic-bezier(.2,1.4,.4,1)}'
    + '.plr .mark path{fill:none;stroke-width:9;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:120;stroke-dashoffset:120}'
    + '.plr.ok .mark,.plr.bad .mark{opacity:1;transform:none}'
    + '.plr.ok .mark path{stroke:#3ddc97;animation:plrDraw .55s .15s ease-out forwards}'
    + '.plr.bad .mark path{stroke:#ff6b72;animation:plrDraw .45s .1s ease-out forwards}'
    + '.plr.ok .num,.plr.bad .num,.plr.ok .orb,.plr.bad .orb{opacity:0;transition:opacity .25s}'
    + '.plr.ok .halo{background:radial-gradient(closest-side,rgba(61,220,151,.35),transparent 72%);animation:plrPulse .9s ease-out 1}'
    + '.plr.bad .halo{background:radial-gradient(closest-side,rgba(255,107,114,.28),transparent 72%);animation:none}'
    + '.plr.bad{animation:plrShake .42s ease}'
    + '.plr.bad .bar{stroke:#ff6b72;filter:none}'
    + '.plr.idle .bar{stroke-dasharray:60 400;animation:plrIdle 1.6s linear infinite;transition:none}'
    + '.plr.idle .num{opacity:.35}'
    + '@keyframes plrSpin{to{transform:rotate(360deg)}}'
    + '@keyframes plrBreath{0%,100%{opacity:.55;transform:scale(.96)}50%{opacity:1;transform:scale(1.04)}}'
    + '@keyframes plrPulse{0%{transform:scale(.9);opacity:1}100%{transform:scale(1.25);opacity:.6}}'
    + '@keyframes plrDraw{to{stroke-dashoffset:0}}'
    + '@keyframes plrShake{20%{transform:translateX(-7px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(2px)}}'
    + '@keyframes plrIdle{to{stroke-dashoffset:-460}}'
    + '@media (prefers-reduced-motion:reduce){.plr .halo,.plr .orb,.plr.idle .bar,.plr.bad{animation:none!important}}';
  var C = 2 * Math.PI * 52;   // محيط الدايرة (r=52 في viewBox 120)

  function inject(){
    if(document.getElementById('plrCss')) return;
    var st = document.createElement('style'); st.id = 'plrCss'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  var seq = 0;
  function create(host, opt){
    inject(); opt = opt || {};
    // v757: ID متدرّج خاص بكل دايرة — لو اتنين على نفس الصفحة واحدة مستخبية، المرجع المشترك
    //       كان بيشاور على المستخبية فالقوس الأخضر كان بيختفي
    var gid = 'plrG' + (++seq) + '_' + Math.random().toString(36).slice(2, 6);
    var el = document.createElement('div');
    el.className = 'plr idle';
    if(opt.size) el.style.setProperty('--sz', opt.size);
    el.innerHTML = '<div class="halo"></div>'
      + '<svg class="dial" viewBox="0 0 120 120"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="#2fc88c"/><stop offset=".6" stop-color="#7ee2ad"/><stop offset="1" stop-color="#f0c86e"/></linearGradient></defs>'
      + '<circle class="trk" cx="60" cy="60" r="52"/><circle class="bar" cx="60" cy="60" r="52" stroke="url(#' + gid + ')" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '"/></svg>'
      + '<div class="orb"><i></i></div>'
      + '<div class="num"><span>1</span><small>%</small></div>'
      + '<svg class="mark" viewBox="0 0 100 100"><path d=""/></svg>';
    if(host){ host.innerHTML = ''; host.appendChild(el); }
    var api = {
      el: el, shown: 0, target: 0, raf: 0,
      idle: function(){ el.className = 'plr idle'; },
      set: function(pct){
        pct = Math.max(1, Math.min(100, Math.round(pct)));
        el.classList.remove('idle', 'ok', 'bad');
        el.querySelector('.bar').style.strokeDashoffset = (C * (1 - pct / 100)).toFixed(1);
        api.target = pct;
        if(!api.raf) api.raf = requestAnimationFrame(tick);
      },
      done: function(ok){
        api.set(100);
        var p = el.querySelector('.mark path');
        p.setAttribute('d', ok ? 'M27 52 L44 68 L74 36' : 'M34 34 L66 66 M66 34 L34 66');
        el.classList.add(ok ? 'ok' : 'bad');
      }
    };
    function tick(){
      api.raf = 0;
      if(api.shown < api.target){ api.shown += Math.max(1, Math.ceil((api.target - api.shown) / 6)); if(api.shown > api.target) api.shown = api.target; }
      else if(api.shown > api.target){ api.shown = api.target; }
      el.querySelector('.num span').textContent = api.shown;
      if(api.shown !== api.target) api.raf = requestAnimationFrame(tick);
    }
    return api;
  }
  window.PayRing = { create: create, inject: inject };
})();
