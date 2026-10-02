/* ============================================================
   🌷 cap-name.js — شاشة «أول مرة معانا» (v710 · 02-10-2026) — شوف cap-name.css
   - بتقيس الجزء الظاهر فوق الكيبورد (visualViewport) وبتحط الشاشة فيه بالظبط.
   - الاسم بيتكتب كبير وهي بتكتب، والزرار بيصحى بعد حرفين.
   - Enter = تم · اسم قصير = هزة خفيفة بدل ما يتبعت.
   - الترحيب: ورد بيقع 🌸 (8 بس، وبيتشال لوحده).
   منطق الإرسال نفسه (capSubmitName) زي ما هو في index.html — الملف ده واجهة بس.
   ============================================================ */
(function(){
  'use strict';
  var MIN = 2;
  function $(id){ return document.getElementById(id); }
  function clean(v){ return String(v || '').replace(/\s+/g, ' ').trim(); }
  function valid(v){ return clean(v).replace(/\s/g, '').length >= MIN; }
  window.capNameValid = valid;

  var _refW = 0, _refH = 0;
  function paneOpen(){ var p = $('capPaneName'); return !!(p && p.style.display !== 'none' && $('capOverlay').classList.contains('show')); }

  /* ⌨️ الشاشة = الجزء الظاهر فوق الكيبورد */
  function fit(){
    var ov = $('capOverlay'); if(!ov) return;
    var vv = window.visualViewport;
    if(!paneOpen() || !vv){ ov.classList.remove('cn-kb'); ov.style.top = ''; ov.style.height = ''; return; }
    // أندرويد مع resizes-content بيصغّر innerHeight نفسه مع الكيبورد — فبنقارن بأكبر ارتفاع شفناه
    // لنفس العرض (لو التابلت لفّ، العرض بيتغيّر والمرجع بيتصفّر)
    var w = window.innerWidth || vv.width;
    if(w !== _refW){ _refW = w; _refH = 0; }
    _refH = Math.max(_refH, vv.height, window.innerHeight || 0);
    var kb = vv.height < _refH * 0.8;
    ov.style.top = Math.max(0, vv.offsetTop) + 'px';
    ov.style.height = vv.height + 'px';
    ov.classList.toggle('cn-kb', !!kb);
  }
  window.capNameFit = fit;

  function render(pop){
    var inp = $('capNameInput'), pv = $('capNamePreview'), tx = $('capNamePreviewTxt'), ok = $('capNameOk');
    if(!inp || !pv) return;
    var v = clean(inp.value);
    pv.classList.toggle('empty', !v);
    var hello = pv.querySelector('.cn-hello'); if(hello) hello.textContent = v ? 'أهلًا يا' : 'أهلًا';
    tx.textContent = v ? v : 'اسمك هيظهر هنا ✨';
    if(ok){ ok.disabled = !valid(v); ok.classList.remove('done'); ok.textContent = 'تم ✓'; }
    if(pop && v){ pv.classList.remove('pop'); void pv.offsetWidth; pv.classList.add('pop'); }
  }
  window.capNameRender = render;

  function shake(){
    var f = $('capNameInput'); if(!f) return;
    f.classList.remove('cn-shake'); void f.offsetWidth; f.classList.add('cn-shake');
    try{ navigator.vibrate && navigator.vibrate(40); }catch(e){}
  }

  window.capNameTrySubmit = function(){
    var inp = $('capNameInput');
    if(!inp || !valid(inp.value)){ shake(); try{ inp && inp.focus(); }catch(e){} return false; }
    inp.value = clean(inp.value);
    var ok = $('capNameOk'); if(ok){ ok.classList.add('done'); ok.textContent = '✓'; }
    try{ inp.blur(); }catch(e){}
    if(typeof window.capSubmitName === 'function') window.capSubmitName();
    return true;
  };

  function onShow(){
    var p = $('capPaneName'); if(!p) return;
    p.classList.remove('cn-in'); void p.offsetWidth; p.classList.add('cn-in');
    render(false); fit();
    // بعد ما الكيبورد يفتح، نعيد القياس (بياخد لحظة)
    [120, 320, 650].forEach(function(ms){ setTimeout(fit, ms); });
  }

  /* 🌸 ورد الترحيب */
  function petals(){
    if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var set = ['🌸','🌷','💗','✨'];
    for(var i = 0; i < 8; i++){
      var s = document.createElement('span');
      s.className = 'cn-petal'; s.textContent = set[i % set.length];
      s.style.left = (6 + Math.random() * 88) + 'vw';
      s.style.fontSize = (18 + Math.random() * 16) + 'px';
      s.style.setProperty('--dx', ((Math.random() * 120) - 60) + 'px');
      s.style.setProperty('--rot', ((Math.random() * 360) - 180) + 'deg');
      s.style.animationDuration = (2.6 + Math.random() * 1.6) + 's';
      s.style.animationDelay = (Math.random() * .5) + 's';
      document.body.appendChild(s);
      (function(n){ setTimeout(function(){ if(n.parentNode) n.parentNode.removeChild(n); }, 5000); })(s);
    }
  }

  function init(){
    var inp = $('capNameInput'); if(!inp || inp.__cnInit) return; inp.__cnInit = true;
    inp.addEventListener('input', function(){ render(true); });
    inp.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); window.capNameTrySubmit(); } });
    inp.addEventListener('focus', function(){ setTimeout(fit, 60); setTimeout(fit, 350); });
    inp.addEventListener('blur', function(){ setTimeout(fit, 120); });
    if(window.visualViewport){
      visualViewport.addEventListener('resize', fit);
      visualViewport.addEventListener('scroll', fit);
    }
    window.addEventListener('resize', fit);
    var wasName = false, wasGreet = false;
    var mo = new MutationObserver(function(){
      var n = paneOpen();
      if(n && !wasName) onShow();
      if(!n && wasName) fit();
      wasName = n;
      var g = $('capPaneGreet'), gOpen = !!(g && g.style.display === 'block' && $('capOverlay').classList.contains('show'));
      if(gOpen && !wasGreet) petals();
      wasGreet = gOpen;
    });
    ['capPaneName','capPaneGreet','capOverlay'].forEach(function(id){ var el = $(id); if(el) mo.observe(el, { attributes:true, attributeFilter:['style','class'] }); });
    render(false);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
