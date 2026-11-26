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
  var WF = { from:'2026-11-26', to:'2026-11-29', glow:[] };   // v779: Glow داخلة كمان
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

  /* 🎨 v780 — الشكل من صورة المالك: ٣ تيكتات متراصة (White أبيض · Friday أسود · Offers أحمر) بحواف مسنّنة
     على خلفية لبني فاتح + التاريخ تحت. */
  var BLUE = '#cfe2f6', RED = '#ef3f33', INK = '#1f2330';
  var ZIG = 'polygon(0 0,100% 0,97% 12%,100% 25%,97% 38%,100% 50%,97% 62%,100% 75%,97% 88%,100% 100%,0 100%,3% 88%,0 75%,3% 62%,0 50%,3% 38%,0 25%,3% 12%)';
  var CSS = [
    '@import url("https://fonts.googleapis.com/css2?family=Poppins:wght@700;800&display=swap");',
    '.wf-stack{display:inline-flex;flex-direction:column;align-items:center;font-family:"Poppins","Arial Black",Arial,sans-serif;direction:ltr;line-height:1;user-select:none}',
    '.wf-t{display:inline-block;font-weight:800;letter-spacing:-.02em;padding:.08em .34em .12em;clip-path:' + ZIG + ';-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.wf-t.w{background:#fff;color:' + INK + ';transform:rotate(-2deg);margin-bottom:-.06em}',
    '.wf-t.b{background:' + INK + ';color:#fff;transform:rotate(1deg);position:relative;z-index:1}',
    '.wf-t.r{background:' + RED + ';color:#fff;transform:rotate(-1.5deg);margin-top:-.04em}',
    '.wf-dates{margin-top:.5em;color:' + INK + ';font-weight:800;text-align:center;font-family:"Poppins","Arial Black",Arial,sans-serif;direction:ltr}',
    '.wf-dates .dd{font-size:1.5em;letter-spacing:.02em}',
    '.wf-dates .dw{display:flex;justify-content:space-between;font-size:.8em;padding:0 .3em}',
    '.wf-dates .mm{font-size:1.05em}',
    /* الشريط الأفقي (الرئيسية / المبيعات) */
    '.wf-ribbon{display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;background:' + BLUE + ';color:' + INK + ';padding:8px 14px;direction:rtl;font-family:"Cairo",sans-serif;position:relative;z-index:5}',
    '.wf-ribbon .wf-row3{display:inline-flex;align-items:center;gap:3px;direction:ltr;font-family:"Poppins","Arial Black",Arial,sans-serif}',
    '.wf-ribbon .wf-t{font-size:15px}',
    '.wf-ribbon .wf-t.w{transform:rotate(-2deg)}.wf-ribbon .wf-t.r{transform:rotate(2deg)}',
    '.wf-ribbon .wf-ar{font-size:13px;font-weight:800}',
    '.wf-ribbon .wf-d{font:800 12px "Poppins",Arial,sans-serif;direction:ltr;background:#fff;border-radius:20px;padding:3px 10px}',
    /* الستيكر على الصنف (v781): نفس اللوجو بالظبط — ٣ تيكتات متراصة، صغيرة ومايلة زي ستيكر */
    '.wf-chip{display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;margin-inline-start:10px;direction:ltr;font-family:"Poppins","Arial Black",Arial,sans-serif;font-size:10.5px;line-height:1;transform:rotate(-6deg);filter:drop-shadow(0 2px 2px rgba(0,0,0,.25));white-space:nowrap}',
    '.wf-chip .wf-t{padding:.12em .4em .16em}',
    /* الهيرو (شاشة الدخول / التابلت) */
    '.wf-hero{text-align:center;margin:0 auto 16px;padding:18px 26px 16px;background:' + BLUE + ';border-radius:18px;max-width:420px;box-shadow:0 18px 40px -22px rgba(0,0,0,.45)}',
    '.wf-hero .wf-stack{font-size:clamp(30px,5vw,46px)}',
    '.wf-hero .wf-dates{font-size:clamp(13px,1.9vw,17px)}',
    '.wf-hero .wf-ar{margin-top:8px;font:800 14px "Cairo",sans-serif;color:' + INK + '}',
    /* ===== POS ===== */
    'body.wf-on #loginScreen{background:linear-gradient(180deg,#e3eefa,' + BLUE + ')!important}',
    'body.wf-on #loginScreen .pin-box{background:#fff;color:' + INK + ';border-radius:16px;padding:18px;box-shadow:0 14px 34px -20px rgba(0,0,0,.4)}',
    'body.wf-on #loginScreen .pin-box h2{color:' + INK + '}',
    'body.wf-on #loginScreen > div:first-child:not([data-wf]){color:' + INK + '!important}',
    'body.wf-on #employeePickerGrid > *{background:#f4f7fb!important;color:' + INK + '!important;border:1px solid #d7e2ee!important}',
    'body.wf-on #employeePickerGrid > * *{color:' + INK + '!important}',
    'body.wf-on #employeePickerGrid > *:hover{border-color:' + RED + '!important;box-shadow:0 0 0 1px ' + RED + ' inset}',
    'body.wf-on #dashboardScreen .wf-ribbon{margin:0 0 10px;border-radius:12px}',
    'body.wf-on #saleScreen .qbx-title:after{content:"White Friday Offers";margin-inline-start:10px;padding:3px 9px;background:' + INK + ';color:#fff;border-right:6px solid ' + RED + ';font:800 11px/1.3 "Poppins",Arial,sans-serif;vertical-align:middle}',
    'body.wf-on #cartTbody tr.wf-row{box-shadow:inset -3px 0 0 ' + RED + '}',
    /* ===== Sales / Feedback ===== */
    'body.wf-on.wf-feedback #kiosk{background:linear-gradient(180deg,#e3eefa,' + BLUE + ')!important;color:' + INK + '}',
    'body.wf-on.wf-feedback .wf-hero{margin-top:8px;box-shadow:none;background:transparent}'
  ].join('\n');

  function ensureCss(){
    if(document.getElementById('wfCss')) return;
    var st = document.createElement('style'); st.id = 'wfCss'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  var STACK = '<div class="wf-stack"><span class="wf-t w">White</span><span class="wf-t b">Friday</span><span class="wf-t r">Offers</span></div>';
  var DATES = '<div class="wf-dates"><div class="dw"><span>Thu.</span><span>Sun.</span></div><div class="dd">26 - 29</div><div class="mm">November</div></div>';
  window.WF_STACK_HTML = STACK;
  function ribbon(){
    var d = document.createElement('div'); d.className = 'wf-ribbon'; d.setAttribute('data-wf','1');
    d.innerHTML = '<span class="wf-row3"><span class="wf-t w">White</span><span class="wf-t b">Friday</span><span class="wf-t r">Offers</span></span>' +
      '<span class="wf-ar">' + (APP === 'feedback' ? 'تخفيضات الجمعة البيضاء' : 'عروض الجمعة البيضاء بدأت') + '</span><span class="wf-d">Thu 26 – Sun 29 Nov</span>';
    return d;
  }
  function hero(sub){
    var d = document.createElement('div'); d.className = 'wf-hero'; d.setAttribute('data-wf','1');
    d.innerHTML = STACK + DATES + (sub ? '<div class="wf-ar">' + sub + '</div>' : '');
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
      if(on && !chip){ chip = document.createElement('span'); chip.className = 'wf-chip'; chip.innerHTML = '<span class="wf-t w">White</span><span class="wf-t b">Friday</span><span class="wf-t r">Offers</span>'; nm.appendChild(chip); }
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
      if(box && box.parentNode) place(box.parentNode, hero('الأسعار نازلة لوحدها على الكاشير'), box.parentNode.firstChild);
      var qb = document.querySelector('#dashboardScreen .qb-main') || document.querySelector('#dashboardScreen .qb-layout');
      if(qb) place(qb, ribbon());
      tagCart();
    }else if(APP === 'sales'){
      place(document.body, ribbon());
    }else{
      var k = document.getElementById('kiosk');
      if(k) place(k, hero('تخفيضات الجمعة البيضاء — اسألي عن العروض'), k.querySelector('.k-brand') || k.firstChild);
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
