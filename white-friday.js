/* ============================================================
   🖤❤️🤍 WHITE FRIDAY — ثيم «الجمعة البيضاء» (قرار المالك 26-11-2026)
   ملف واحد مشترك: الكاشير (pos) · برنامج المبيعات (sales) · تابلت التقييم (feedback).
   • شغال من الخميس 26 لحد الأحد 29 نوفمبر (بتوقيت القاهرة) · فروع إيشارب بس (Glow لأ).
   • شكل بس — مبيلمسش أي حساب. الأسعار نفسها في pos/promo-weekend.js.
   • بعد الأحد بيختفي لوحده من غير ما حد يعمل حاجة.
   الاستخدام:  <script src="../white-friday.js?v=1" data-wf-app="pos|sales|feedback"></script>
   ============================================================ */
(function(){
  'use strict';
  var WF = { from:'2026-11-26', to:'2026-11-29', glow:['glow'] };
  var me = document.currentScript;
  var APP = (me && me.getAttribute('data-wf-app')) || 'pos';

  function cairoDay(ts){
    try{ return new Intl.DateTimeFormat('en-CA', { timeZone:'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(ts)); }
    catch(e){ return new Date(ts + 2*3600e3).toISOString().slice(0,10); }
  }
  function lsGet(k){ try{ return localStorage.getItem(k) || ''; }catch(e){ return ''; } }
  function branchNow(){
    if(APP === 'pos') return (typeof currentBranch !== 'undefined' && currentBranch) || lsGet('pos_branch') || lsGet('currentBranch') || '';
    if(APP === 'sales') return window.currentBranch || lsGet('sales_branch') || '';
    return lsGet('feedback_branch') || '';
  }
  function isGlow(br){ return WF.glow.indexOf(String(br || '').trim().toLowerCase()) >= 0; }
  function wfActive(now, br){
    var d = cairoDay(now == null ? Date.now() : now);
    if(d < WF.from || d > WF.to) return false;
    if(br === undefined) br = branchNow();
    if(isGlow(br) || /office/i.test(String(br || ''))) return false;
    return true;                                     // فرع مش معروف لسه = إيشارب (الافتراضي)
  }
  window.wfActive = wfActive;
  window.WHITE_FRIDAY = WF;

  var CSS = [
    /* ===== الأساس المشترك ===== */
    '.wf-mark{font-family:"Cairo",system-ui,sans-serif;direction:ltr;letter-spacing:.32em;font-weight:900;line-height:1}',
    '.wf-mark b{color:#fff}.wf-mark i{font-style:normal;color:#e10600}',
    '.wf-ribbon{position:relative;overflow:hidden;background:#0b0b0b;color:#fff;border-bottom:1px solid #2a2a2a;font-family:"Cairo",sans-serif;display:flex;align-items:center;justify-content:center;gap:14px;padding:8px 14px;direction:rtl;z-index:5}',
    '.wf-ribbon:before{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 0 38%,rgba(225,6,0,.55) 46%,transparent 54% 100%);transform:translateX(-60%);animation:wfSweep 5.5s ease-in-out infinite}',
    '.wf-ribbon .wf-mark{font-size:13px;position:relative}',
    '.wf-ribbon .wf-sep{width:5px;height:5px;border-radius:50%;background:#e10600;position:relative;box-shadow:0 0 10px #e10600}',
    '.wf-ribbon .wf-ar{font-size:13px;font-weight:800;position:relative;color:#f1f1f1}',
    '@keyframes wfSweep{0%{transform:translateX(-70%)}55%,100%{transform:translateX(70%)}}',
    '.wf-chip{display:inline-flex;align-items:center;gap:4px;vertical-align:middle;margin-inline-start:6px;padding:2px 7px 2px 6px;border-radius:4px;background:#0b0b0b;color:#fff;border:1px solid #e10600;font:900 9.5px/1.25 "Cairo",sans-serif;letter-spacing:.14em;direction:ltr;white-space:nowrap}',
    '.wf-chip:before{content:"";width:6px;height:6px;border-radius:50%;background:#e10600}',
    /* ===== الهيرو (شاشة الدخول / الكيوسك) ===== */
    '.wf-hero{position:relative;text-align:center;margin:0 auto 18px;padding:22px 26px 18px;max-width:560px;border-radius:18px;background:#0b0b0b;color:#fff;border:1px solid #262626;box-shadow:0 30px 60px -30px rgba(225,6,0,.55);overflow:hidden;font-family:"Cairo",sans-serif}',
    '.wf-hero:before{content:"";position:absolute;inset:auto -20% -60% -20%;height:120%;background:radial-gradient(closest-side,rgba(225,6,0,.38),transparent 70%)}',
    '.wf-hero:after{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#fff 0 33%,#e10600 33% 66%,#fff 66%)}',
    '.wf-hero .wf-mark{position:relative;font-size:clamp(22px,4.2vw,38px)}',
    '.wf-hero .wf-sub{position:relative;margin-top:10px;font-size:15px;font-weight:800;color:#fff}',
    '.wf-hero .wf-sub span{color:#e10600}',
    '.wf-hero .wf-note{position:relative;margin-top:4px;font-size:12px;color:#a9a9a9;font-weight:600}',
    /* ===== POS ===== */
    'body.wf-on #loginScreen{background:radial-gradient(1200px 600px at 50% 115%,rgba(225,6,0,.22),transparent 60%),linear-gradient(180deg,#050505,#111 60%,#050505)!important}',
    'body.wf-on #loginScreen .pin-box{background:rgba(255,255,255,.03);border:1px solid #2a2a2a;border-radius:16px;padding:18px;backdrop-filter:blur(2px)}',
    'body.wf-on #loginScreen .pin-box h2{color:#fff}',
    'body.wf-on #employeePickerGrid > *{border-color:#2d2d2d!important}',
    'body.wf-on #employeePickerGrid > *:hover{border-color:#e10600!important;box-shadow:0 0 0 1px #e10600 inset}',
    'body.wf-on #dashboardScreen .wf-ribbon{margin:-2px -2px 10px;border-radius:12px}',
    'body.wf-on #saleScreen .qbx-top{position:relative}',
    'body.wf-on #saleScreen .qbx-title:after{content:"WHITE FRIDAY";margin-inline-start:10px;padding:3px 9px;border-radius:4px;background:#0b0b0b;color:#fff;border:1px solid #e10600;font:900 10px/1.3 "Cairo",sans-serif;letter-spacing:.2em;vertical-align:middle}',
    'body.wf-on #cartTbody tr.wf-row{box-shadow:inset -3px 0 0 #e10600}',
    /* ===== Sales ===== */
    'body.wf-on.wf-sales{background:radial-gradient(900px 500px at 50% -10%,rgba(225,6,0,.20),transparent 60%),#0a0a0a}',
    /* ===== Feedback (التابلت قدام العميلة) ===== */
    'body.wf-on.wf-feedback #kiosk{background:radial-gradient(900px 520px at 50% 110%,rgba(225,6,0,.28),transparent 60%),linear-gradient(180deg,#050505,#121212 55%,#050505)!important;color:#fff}',
    'body.wf-on.wf-feedback .wf-hero{margin-top:10px}'
  ].join('\n');

  function ensureCss(){
    if(document.getElementById('wfCss')) return;
    var st = document.createElement('style'); st.id = 'wfCss'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  var MARK = '<span class="wf-mark"><b>WHITE</b> <i>FRIDAY</i></span>';
  function ribbon(){
    var d = document.createElement('div'); d.className = 'wf-ribbon'; d.setAttribute('data-wf','1');
    d.innerHTML = MARK + '<span class="wf-sep"></span><span class="wf-ar">' +
      (APP === 'feedback' ? 'تخفيضات الجمعة البيضاء — لحد الأحد' : 'عروض الجمعة البيضاء بدأت — لحد الأحد') + '</span>';
    return d;
  }
  function hero(sub, note){
    var d = document.createElement('div'); d.className = 'wf-hero'; d.setAttribute('data-wf','1');
    d.innerHTML = MARK + '<div class="wf-sub">' + sub + '</div>' + (note ? '<div class="wf-note">' + note + '</div>' : '');
    return d;
  }
  function place(parent, el, before){
    if(!parent || parent.querySelector(':scope > [data-wf]')) return;
    if(before) parent.insertBefore(el, before); else parent.insertBefore(el, parent.firstChild);
  }
  function removeAll(){
    document.body.classList.remove('wf-on');
    Array.prototype.forEach.call(document.querySelectorAll('[data-wf]'), function(n){ n.remove(); });
    Array.prototype.forEach.call(document.querySelectorAll('.wf-chip,.wf-row'), function(n){
      if(n.classList.contains('wf-chip')) n.remove(); else n.classList.remove('wf-row');
    });
  }

  /* الكاشير: شارة WHITE FRIDAY على كل صنف نازل بسعر العرض */
  function tagCart(){
    if(APP !== 'pos' || typeof cart === 'undefined') return;
    var tb = document.getElementById('cartTbody'); if(!tb) return;
    Array.prototype.forEach.call(tb.querySelectorAll('tr'), function(tr){
      var m = String(tr.getAttribute('onclick') || '').match(/selectCartRow\((\d+)\)/);
      var line = m ? cart[Number(m[1])] : null;
      var on = !!(line && line.promoOn);
      tr.classList.toggle('wf-row', on);
      var nm = tr.querySelector('td.item-name'); if(!nm) return;
      var chip = nm.querySelector('.wf-chip');
      if(on && !chip){ chip = document.createElement('span'); chip.className = 'wf-chip'; chip.textContent = 'WHITE FRIDAY'; nm.appendChild(chip); }
      if(!on && chip) chip.remove();
    });
  }
  window.wfTagCart = tagCart;

  function mount(){
    if(!document.body) return;
    if(!wfActive()){ removeAll(); return; }
    ensureCss();
    document.body.classList.add('wf-on', 'wf-' + APP);
    if(APP === 'pos'){
      var box = document.getElementById('employeePickerBox');
      if(box && box.parentNode) place(box.parentNode, hero('عروض <span>الجمعة البيضاء</span> بدأت', 'الأسعار نازلة لوحدها على الكاشير — لحد الأحد'), box.parentNode.firstChild);
      var qb = document.querySelector('#dashboardScreen .qb-main') || document.querySelector('#dashboardScreen .qb-layout');
      if(qb) place(qb, ribbon());
      tagCart();
    }else if(APP === 'sales'){
      place(document.body, ribbon());
    }else{
      var k = document.getElementById('kiosk');
      if(k) place(k, hero('تخفيضات <span>الجمعة البيضاء</span>', 'لحد يوم الأحد — اسألي عن العروض'), k.querySelector('.k-brand') || k.firstChild);
    }
  }
  window.wfMount = mount;

  function start(){
    mount();
    setInterval(mount, 60 * 1000);                   // نص الليل يوم الاتنين → يختفي لوحده
    if(APP === 'pos' && typeof window.renderCart === 'function' && !window.renderCart.__wfWrapped){
      var _o = window.renderCart;
      var w = function(){ var r = _o.apply(this, arguments); try{ if(wfActive()) tagCart(); }catch(e){} return r; };
      w.__wfWrapped = true; w.__promoWrapped = _o.__promoWrapped;
      window.renderCart = w; try{ renderCart = w; }catch(e){}
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
