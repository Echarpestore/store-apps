/* ============================================================
   📥 sales-receive.js — استلام/إخراج المنتجات من تطبيق Sales (v625)
   ------------------------------------------------------------
   ليه: لما الكاشير زحمة، أي موظفة تستلم البضاعة من موبايل/تابلت Sales.
   - الموظفة بتدوس على اسمها بس (v626 — قرار المالك: من غير كود عشان السرعة؛
     الجهاز نفسه داخل بحساب الفرع) — والاسم بيتسجل على كل حركة.
   - سكان بالكاميرا (سريع ومتواصل) أو كتابة الكود بإيدها.
   - نفس سلوك شاشة POS: كل مسحة سطر مستقل، − و+ لكل سطر، سالب = إخراج.
   - التأكيد = زيادة ذرّية على qtyByBranch.<الفرع> + سطر في pos_test_stock_log
     (batch واحد) — فالحركة بتظهر في «آخر الاستلامات» في POS الفرع لوحدها.
   - مسودة محفوظة على الجهاز لكل فرع (قفل التطبيق مش بيضيّع اللي اتمسح).
   البيانات: window.salesRecvApi (sales-app.js) · المنطق: window.RecvCore (receive-core.js)
   ============================================================ */
(function(){
  'use strict';
  var S = { job:null, jobUnsub:null, jobItems:null, jobTotal:0, jobT:0, emp:null, cart:[], out:false, sending:false, allowNeg:false,
            cache:{}, lastCode:'', lastAt:0, stream:null, zx:null, det:null, scanning:false, busy:false, log:[] };
  var DRAFT = 'sales_recv_draft_v1_';

  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function branch(){ return String(window.currentBranch || '').trim(); }
  function toast(msg, bad){
    var t = $('rcvToast'); if(!t) return;
    t.textContent = msg; t.className = 'rcvToast on' + (bad ? ' bad' : '');
    clearTimeout(t._h); t._h = setTimeout(function(){ t.className = 'rcvToast'; }, bad ? 3200 : 1800);
  }
  function api(){ return window.salesRecvApi; }
  function core(){ return window.RecvCore; }

  /* ---------- الستايل + الهيكل (مرة واحدة) ---------- */
  function inject(){
    if($('rcvOverlay')) return;
    var css = document.createElement('style');
    css.textContent = ''
      + '#rcvOverlay{position:fixed;inset:0;z-index:60;background:var(--bg,#12141a);display:none;flex-direction:column;color:var(--ink,#eef0f4);font-family:Cairo,sans-serif;}'
      + '#rcvOverlay.show{display:flex;}'
      + '.rcvHead{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line,#2b2f3b);background:var(--panel,#1b1e27);}'
      + '.rcvHead h3{margin:0;font-size:16px;font-weight:900;flex:1;}'
      + '.rcvHead small{display:block;color:var(--sub,#8b90a0);font-size:11.5px;font-weight:600;}'
      + '.rcvX{width:40px;height:40px;border-radius:12px;border:1px solid var(--line,#2b2f3b);background:var(--panel2,#232733);color:inherit;font-size:18px;cursor:pointer;}'
      + '.rcvBody{flex:1;overflow-y:auto;padding:12px 12px 110px;}'
      + '.rcvGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:10px;}'
      + '.rcvEmp{background:var(--panel,#1b1e27);border:1px solid var(--line,#2b2f3b);border-radius:16px;padding:14px 8px;text-align:center;cursor:pointer;font-weight:800;font-size:13px;}'
      + '.rcvEmp b{display:flex;width:44px;height:44px;margin:0 auto 6px;border-radius:50%;align-items:center;justify-content:center;background:var(--panel2,#232733);color:var(--gold,#f2c14e);font-size:18px;}'
      + '.rcvMode{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;}'
      + '.rcvMode button{padding:11px;border-radius:12px;border:1px solid var(--line,#2b2f3b);background:var(--panel,#1b1e27);color:var(--sub,#8b90a0);font:800 14px Cairo;cursor:pointer;}'
      + '.rcvMode button.on.in{background:#123524;border-color:var(--good,#2fa36b);color:#7ee2ad;}'
      + '.rcvMode button.on.out{background:#3a1718;border-color:var(--bad,#e5484d);color:#ff9a9d;}'
      + '.rcvScanBtn{width:100%;padding:16px;border-radius:16px;border:none;background:linear-gradient(180deg,#f2c14e,#c99a2e);color:#1b1407;font:900 17px Cairo;cursor:pointer;margin-bottom:10px;}'
      + '.rcvCodeRow{display:flex;gap:8px;margin-bottom:12px;}'
      + '.rcvCodeRow input{flex:1;min-width:0;padding:13px;border-radius:12px;border:1px solid var(--line,#2b2f3b);background:var(--panel2,#232733);color:inherit;font:700 16px "Space Grotesk",Cairo;text-align:center;letter-spacing:1px;}'
      + '.rcvCodeRow button{padding:0 18px;border-radius:12px;border:1px solid var(--gold-dim,#8a6f2c);background:var(--panel,#1b1e27);color:var(--gold,#f2c14e);font:800 14px Cairo;cursor:pointer;}'
      + '.rcvCard{display:grid;grid-template-columns:1fr auto;gap:6px 10px;align-items:center;background:var(--panel,#1b1e27);border:1px solid var(--line,#2b2f3b);border-radius:14px;padding:10px 12px;margin-bottom:8px;}'
      + '.rcvCard.neg{border-color:rgba(229,72,77,.55);background:rgba(229,72,77,.07);}'
      + '.rcvCard.last{border-color:var(--gold,#f2c14e);}'
      + '.rcvName{font-weight:800;font-size:14px;line-height:1.5;}'
      + '.rcvMeta{color:var(--sub,#8b90a0);font-size:11.5px;font-family:"Space Grotesk",Cairo;}'
      + '.rcvQty{display:flex;align-items:center;gap:6px;grid-row:span 2;}'
      + '.rcvQty button{width:36px;height:36px;border-radius:10px;border:1px solid var(--line,#2b2f3b);background:var(--panel2,#232733);color:inherit;font:900 18px Cairo;cursor:pointer;}'
      + '.rcvQty input{width:48px;padding:7px 2px;border-radius:9px;border:1px solid var(--line,#2b2f3b);background:var(--bg,#12141a);color:inherit;text-align:center;font:800 15px Cairo;}'
      + '.rcvDel{border:none;background:none;color:var(--bad,#e5484d);font-size:13px;font-weight:800;cursor:pointer;padding:0;justify-self:start;}'
      + '.rcvEmpty{color:var(--sub,#8b90a0);text-align:center;padding:22px 10px;font-size:13px;border:1px dashed var(--line,#2b2f3b);border-radius:14px;}'
      + '.rcvSec{font-weight:900;font-size:13px;margin:18px 0 8px;color:var(--sub,#8b90a0);}'
      + '.rcvLog{display:flex;justify-content:space-between;gap:10px;padding:9px 2px;border-bottom:1px dashed var(--line,#2b2f3b);font-size:12.5px;}'
      + '.rcvLog b.in{color:#7ee2ad;} .rcvLog b.out{color:#ff9a9d;}'
      + '.rcvFoot{position:absolute;left:0;right:0;bottom:0;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));background:var(--panel,#1b1e27);border-top:1px solid var(--line,#2b2f3b);}'
      + '.rcvFoot button{width:100%;padding:15px;border-radius:14px;border:none;background:var(--good,#2fa36b);color:#fff;font:900 16px Cairo;cursor:pointer;}'
      + '.rcvFoot button:disabled{opacity:.55;}'
      + '#rcvCam{position:fixed;inset:0;z-index:70;background:#000;display:none;flex-direction:column;}'
      + '#rcvCam.show{display:flex;}'
      + '#rcvCam video{flex:1;width:100%;object-fit:cover;min-height:0;}'
      + '.rcvFrame{position:absolute;left:10%;right:10%;top:34%;height:22%;border:3px solid rgba(242,193,78,.9);border-radius:16px;box-shadow:0 0 0 9999px rgba(0,0,0,.35);pointer-events:none;}'
      + '.rcvCamBar{padding:12px 14px calc(14px + env(safe-area-inset-bottom,0px));background:#111;color:#fff;display:flex;gap:10px;align-items:center;}'
      + '.rcvCamBar div{flex:1;font-size:13px;font-weight:700;line-height:1.5;}'
      + '.rcvCamBar button{padding:12px 18px;border-radius:12px;border:none;background:#f2c14e;color:#1b1407;font:900 14px Cairo;cursor:pointer;}'
      + '.rcvTag{width:36px;height:36px;border-radius:10px;border:1px solid var(--line,#2b2f3b);background:var(--panel2,#232733);color:var(--sub,#8b90a0);display:grid;place-items:center;cursor:pointer;transition:background .15s,color .15s,border-color .15s;}'
      + '.rcvTag.on{background:rgba(242,193,78,.16);border-color:var(--gold,#f2c14e);color:var(--gold,#f2c14e);}'
      + '.rcvRow2{grid-column:1/-1;display:flex;align-items:center;gap:8px;}'
      + '.rcvLq{display:flex;align-items:center;gap:6px;color:var(--gold,#f2c14e);font-weight:800;font-size:12.5px;padding:4px 8px;border-radius:10px;background:rgba(242,193,78,.08);border:1px dashed rgba(242,193,78,.45);}'
      + '.rcvLq button{width:28px;height:28px;border-radius:8px;border:1px solid rgba(242,193,78,.45);background:none;color:inherit;font:900 15px Cairo;cursor:pointer;}'
      + '.rcvLq input{width:42px;padding:4px 2px;border-radius:7px;border:1px solid rgba(242,193,78,.45);background:var(--bg,#12141a);color:inherit;text-align:center;font:800 14px Cairo;}'
      + '.rcvJob{border-radius:14px;padding:11px 13px;margin-bottom:10px;font-size:13px;font-weight:800;line-height:1.6;display:flex;align-items:center;gap:10px;}'
      + '.rcvJob.wait{background:rgba(242,193,78,.1);border:1px solid rgba(242,193,78,.35);color:#f2c14e;}'
      + '.rcvJob.ok{background:rgba(47,163,107,.12);border:1px solid rgba(47,163,107,.4);color:#7ee2ad;}'
      + '.rcvJob.bad{background:rgba(229,72,77,.1);border:1px solid rgba(229,72,77,.4);color:#ff9a9d;}'
      + '.rcvJob button{margin-inline-start:auto;padding:7px 12px;border-radius:10px;border:1px solid currentColor;background:none;color:inherit;font:800 12px Cairo;cursor:pointer;}'
      + '.rcvJob .sp{width:14px;height:14px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:rcvSpin .8s linear infinite;flex:0 0 auto;}'
      + '@keyframes rcvSpin{to{transform:rotate(360deg)}}'
      + '.rcvToast{position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:80;background:#1f2937;color:#fff;padding:10px 16px;border-radius:12px;font:800 13px Cairo;opacity:0;pointer-events:none;transition:opacity .15s;max-width:90vw;text-align:center;}'
      + '.rcvToast.on{opacity:1;} .rcvToast.bad{background:#7f1d1d;}';
    document.head.appendChild(css);

    var ov = document.createElement('div');
    ov.id = 'rcvOverlay';
    ov.innerHTML = '<div class="rcvHead"><h3 id="rcvTitle">📥 استلام المنتجات<small id="rcvSub"></small></h3>'
      + '<button class="rcvX" onclick="salesRecvClose()">✕</button></div>'
      + '<div class="rcvBody" id="rcvBody"></div>'
      + '<div class="rcvFoot" id="rcvFoot" style="display:none"><button id="rcvConfirm" onclick="salesRecvConfirm()">✔️ تأكيد</button></div>';
    document.body.appendChild(ov);

    var cam = document.createElement('div');
    cam.id = 'rcvCam';
    cam.innerHTML = '<video id="rcvVideo" playsinline muted autoplay></video><div class="rcvFrame"></div>'
      + '<div class="rcvCamBar"><div id="rcvCamMsg">وجّهي الكاميرا على الباركود</div>'
      + '<button onclick="salesRecvScanStop()">✔ خلصت</button></div>';
    document.body.appendChild(cam);

    var t = document.createElement('div'); t.id = 'rcvToast'; t.className = 'rcvToast';
    document.body.appendChild(t);
  }

  /* ---------- المسودة ---------- */
  function draftKey(){ return DRAFT + encodeURIComponent(branch() || 'default'); }
  function draftSave(){
    try{
      if(!S.cart.length){ localStorage.removeItem(draftKey()); return; }
      localStorage.setItem(draftKey(), JSON.stringify({ v:1, savedAt:Date.now(), items:S.cart }));
    }catch(e){}
  }
  function draftLoad(){
    try{
      var d = JSON.parse(localStorage.getItem(draftKey()) || 'null');
      S.cart = (d && Array.isArray(d.items)) ? d.items.filter(function(x){ return x && x.id && isFinite(Number(x.qty)); }) : [];
    }catch(e){ S.cart = []; }
  }

  /* ---------- الخطوة ١: اختيار الموظفة ---------- */
  function open(){
    inject();
    if(!branch()){ alert('الفرع مش متحدد على الجهاز ده'); return; }
    if(!api() || !core()){ alert('التطبيق لسه بيحمّل — جرّبي كمان ثانية'); return; }
    S.emp = null;
    draftLoad();
    $('rcvOverlay').classList.add('show');
    try{ history.pushState({ rcv:1 }, ''); }catch(e){}
    renderPick();
  }
  function renderPick(){
    $('rcvSub').textContent = '📍 ' + branch() + ' · مين بيستلم؟';
    $('rcvFoot').style.display = 'none';
    var emps = (window.employees || []).filter(function(e){ return e && e.name; });
    $('rcvBody').innerHTML = emps.length
      ? '<div class="rcvGrid">' + emps.map(function(e){
          return '<div class="rcvEmp" onclick="salesRecvPickEmp(\'' + esc(e.id) + '\')"><b>' + esc(String(e.name).trim().charAt(0)) + '</b>' + esc(e.name) + '</div>';
        }).join('') + '</div>'
        + (S.cart.length ? '<div class="rcvEmpty" style="margin-top:14px">📝 فيه ' + S.cart.length + ' حركة محفوظة من قبل — هتكمّل عليها بعد الدخول</div>' : '')
      : '<div class="rcvEmpty">مفيش موظفين على الفرع ده</div>';
  }
  function pickEmp(id){
    var e = (window.employees || []).filter(function(x){ return x && x.id === id; })[0];
    if(!e) return;
    S.emp = e;
    enterMain();   // ⚡ v626: من غير كود — دوسة على الاسم وتبدأ على طول
  }

  /* ---------- الخطوة ٣: الشاشة الأساسية ---------- */
  function enterMain(){
    api().getInventoryCfg().then(function(c){ S.allowNeg = !!(c && c.allowNegativeStock); }).catch(function(){});
    renderMain();
    loadLog();
    setTimeout(function(){ var i = $('rcvCode'); if(i && !('ontouchstart' in window)) i.focus(); }, 80);
  }
  function renderMain(){
    $('rcvSub').textContent = '📍 ' + branch() + ' · 👤 ' + S.emp.name;
    var list = S.cart.map(function(r, i){ return { r:r, i:i }; }).reverse().map(function(o, n){
      var r = o.r, neg = Number(r.qty) < 0;
      var when = new Date(Number(r.receivedAtMs) || Date.now()).toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit' });
      return '<div class="rcvCard' + (neg ? ' neg' : '') + (n === 0 ? ' last' : '') + '">'
        + '<div><div class="rcvName">' + esc(r.name) + '</div><div class="rcvMeta">' + esc(r.barcode || '—') + ' · ' + when + '</div></div>'
        + '<div class="rcvQty"><button onclick="salesRecvQty(' + o.i + ',-1)">−</button>'
        + '<input type="number" inputmode="numeric" value="' + Number(r.qty) + '" onchange="salesRecvSetQty(' + o.i + ',this.value)">'
        + '<button onclick="salesRecvQty(' + o.i + ',1)">+</button></div>'
        // 🏷️ v761: ليبل لكل سطر — المالك بيختار يطبع إيه وكام (مش مفتاح لكل الاستلام)
        + '<div class="rcvRow2"><button class="rcvDel" onclick="salesRecvRemove(' + o.i + ')">✕ شيل</button>'
        + (neg ? '' : '<span style="flex:1"></span>'
          + (r.lbl ? '<span class="rcvLq"><button onclick="salesRecvLblQty(' + o.i + ',-1)">−</button>'
            + '<input type="number" inputmode="numeric" value="' + (Number(r.lblQty) || 0) + '" onchange="salesRecvSetLblQty(' + o.i + ',this.value)">'
            + '<button onclick="salesRecvLblQty(' + o.i + ',1)">+</button></span>' : '')
          + '<button class="rcvTag' + (r.lbl ? ' on' : '') + '" title="ليبل" onclick="salesRecvLbl(' + o.i + ')">' + TAG + '</button>')
        + '</div></div>';
    }).join('');
    $('rcvBody').innerHTML = ''
      + '<div class="rcvMode"><button class="in' + (!S.out ? ' on' : '') + '" onclick="salesRecvMode(false)">📥 استلام (+)</button>'
      + '<button class="out' + (S.out ? ' on' : '') + '" onclick="salesRecvMode(true)">📤 إخراج (−)</button></div>'
      + '<div id="rcvJobBox">' + jobHtml() + '</div>'
      + '<button class="rcvScanBtn" onclick="salesRecvScanStart()">📷 سكان بالكاميرا</button>'
      + '<div class="rcvCodeRow"><input id="rcvCode" type="text" inputmode="text" enterkeyhint="done" autocomplete="off" placeholder="أو اكتبي الكود"'
      + ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();salesRecvAddCode();}">'
      + '<button onclick="salesRecvAddCode()">إضافة</button></div>'
      + (S.cart.length ? list : '<div class="rcvEmpty">اعملي سكان أو اكتبي الكود — كل قطعة بتتضاف هنا</div>')
      + '<div class="rcvSec">🧾 آخر الاستلامات في الفرع</div><div id="rcvLogBox"><div class="rcvEmpty">…</div></div>';
    var btn = $('rcvConfirm'), n = S.cart.length;
    $('rcvFoot').style.display = n ? 'block' : 'none';
    if(btn && !S.sending){
      var ins = 0, outs = 0;
      S.cart.forEach(function(r){ var q = Number(r.qty) || 0; if(q > 0) ins += q; else outs -= q; });
      var lt = lblTotal();
      btn.textContent = '✔️ تأكيد ' + n + ' حركة' + (ins ? ' · +' + ins : '') + (outs ? ' · −' + outs : '') + (lt ? ' · 🏷️ ' + lt : '');
    }
    renderLog();
    draftSave();
  }

  /* ---------- الإضافة (سكان أو كتابة) ---------- */
  function lookup(code){
    var c = String(code || '').trim();
    if(S.cache[c]) return Promise.resolve(S.cache[c]);
    return api().findByBarcode(c).then(function(docs){
      var p = core().recvPickProduct(docs, branch(), c);
      if(p) S.cache[c] = p;
      return p;
    });
  }
  function addCode(code, fromCam){
    var c = String(code || '').trim();
    if(!c) return Promise.resolve(false);
    return lookup(c).then(function(p){
      if(!p){ toast('مفيش صنف بالكود ده: ' + c, true); if(navigator.vibrate) navigator.vibrate([80, 60, 80]); return false; }
      var e = core().recvNewEntry(p, branch(), S.out ? -1 : 1);
      S.cart.push(e);
      if(navigator.vibrate) navigator.vibrate(50);
      toast((S.out ? '📤 ' : '📥 ') + p.name);
      if(fromCam){ var m = $('rcvCamMsg'); if(m) m.textContent = '✅ ' + p.name + ' · القايمة: ' + S.cart.length; }
      renderMain();
      return true;
    }).catch(function(e){ console.warn('rcv lookup', e); toast('النت فيه مشكلة — جرّبي تاني', true); return false; });
  }
  function addFromInput(){
    var i = $('rcvCode'); if(!i) return;
    var v = i.value; i.value = '';
    addCode(v, false).then(function(){ var j = $('rcvCode'); if(j && !('ontouchstart' in window)) j.focus(); });
  }
  function qty(i, d){ var r = S.cart[i]; if(!r) return; r.qty = (Number(r.qty) || 0) + d; renderMain(); }
  function setQty(i, v){ var r = S.cart[i]; if(!r) return; r.qty = parseInt(v, 10) || 0; renderMain(); }
  function removeAt(i){ S.cart.splice(i, 1); renderMain(); }
  function mode(out){ S.out = !!out; renderMain(); }

  /* ---------- الكاميرا ---------- */
  var FORMATS = ['ean_13','ean_8','code_128','code_39','code_93','upc_a','upc_e','itf','codabar','qr_code'];
  function onDetected(raw){
    var c = String(raw || '').trim(); if(!c || S.busy) return;
    var now = Date.now();
    if(c === S.lastCode && now - S.lastAt < 1800) return;   // نفس الكود لسه قدام الكاميرا
    S.lastCode = c; S.lastAt = now; S.busy = true;
    addCode(c, true).then(function(){ S.busy = false; });
  }
  function loadZxing(){
    if(window.ZXingBrowser) return Promise.resolve(window.ZXingBrowser);
    return new Promise(function(res, rej){
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js';
      s.onload = function(){ window.ZXingBrowser ? res(window.ZXingBrowser) : rej(new Error('zxing')); };
      s.onerror = function(){ rej(new Error('zxing load')); };
      document.head.appendChild(s);
    });
  }
  async function scanStart(){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ toast('الكاميرا مش متاحة هنا — اكتبي الكود', true); return; }
    var v = $('rcvVideo');
    $('rcvCam').classList.add('show'); $('rcvCamMsg').textContent = 'وجّهي الكاميرا على الباركود';
    S.scanning = true; S.lastCode = ''; S.lastAt = 0;
    try{
      if('BarcodeDetector' in window){
        var sup = [];
        try{ sup = await window.BarcodeDetector.getSupportedFormats(); }catch(e){}
        var fm = FORMATS.filter(function(f){ return !sup.length || sup.indexOf(f) >= 0; });
        S.det = new window.BarcodeDetector({ formats: fm });
        S.stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' }, width:{ ideal:1280 } }, audio:false });
        v.srcObject = S.stream; await v.play();
        var tick = async function(){
          if(!S.scanning) return;
          try{ if(v.readyState >= 2){ var r = await S.det.detect(v); if(r && r.length) onDetected(r[0].rawValue); } }catch(e){}
          setTimeout(tick, 140);
        };
        tick();
      } else {
        // آيفون وأجهزة من غير BarcodeDetector → مكتبة ZXing (بتتحمّل أول مرة بس)
        $('rcvCamMsg').textContent = '⏳ بيجهّز الكاميرا…';
        var Z = await loadZxing();
        if(!S.scanning) return;
        var reader = new Z.BrowserMultiFormatReader();
        S.zx = await reader.decodeFromConstraints({ video:{ facingMode:{ ideal:'environment' } } }, v, function(res){
          if(res && S.scanning) onDetected(res.getText ? res.getText() : res.text);
        });
        $('rcvCamMsg').textContent = 'وجّهي الكاميرا على الباركود';
      }
    }catch(e){
      console.warn('rcv camera', e);
      scanStop();
      toast(e && e.name === 'NotAllowedError' ? 'اسمحي للكاميرا من إعدادات المتصفح' : 'الكاميرا مش شغالة — اكتبي الكود', true);
    }
  }
  function scanStop(){
    S.scanning = false;
    try{ if(S.zx && S.zx.stop) S.zx.stop(); }catch(e){}
    try{ if(S.stream) S.stream.getTracks().forEach(function(t){ t.stop(); }); }catch(e){}
    S.zx = null; S.stream = null; S.det = null;
    var v = $('rcvVideo'); if(v){ try{ v.pause(); }catch(e){} v.srcObject = null; }
    var c = $('rcvCam'); if(c) c.classList.remove('show');
  }

  /* ---------- 🏷️ الليبلات (v760 · v761: لكل سطر) ---------- */
  var TAG = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>';
  function lbl(i){
    var r = S.cart[i]; if(!r || Number(r.qty) <= 0) return;
    r.lbl = !r.lbl;
    if(r.lbl && !(Number(r.lblQty) > 0)) r.lblQty = Math.max(1, Math.round(Number(r.qty) || 1));
    renderMain();
  }
  function lblQty(i, d){ var r = S.cart[i]; if(!r) return; r.lblQty = Math.max(0, (Number(r.lblQty) || 0) + d); if(!r.lblQty) r.lbl = false; renderMain(); }
  function setLblQty(i, v){ var r = S.cart[i]; if(!r) return; r.lblQty = Math.max(0, parseInt(v, 10) || 0); if(!r.lblQty) r.lbl = false; renderMain(); }
  function lblTotal(){ var t = 0; S.cart.forEach(function(r){ if(r.lbl && Number(r.qty) > 0) t += Math.max(0, Number(r.lblQty) || 0); }); return t; }
  function jobHtml(){
    var j = S.job; if(!j) return '';
    if(j.status === 'printed') return '<div class="rcvJob ok">✓ اتطبع ' + S.jobTotal + ' ليبل على طابعة الفرع</div>';
    if(j.status === 'failed') return '<div class="rcvJob bad">✗ الليبلات مااتطبعتش: ' + esc(j.error || 'مشكلة في الطابعة') + '<button onclick="salesRecvReprint()">جرّبي تاني</button></div>';
    var late = S.jobT && Date.now() - S.jobT > 60000;
    return '<div class="rcvJob wait"><span class="sp"></span><span>' + (late
      ? '🏷️ ' + S.jobTotal + ' ليبل مستنية POS الفرع — هتتطبع أول ما برنامج الكاشير يتفتح'
      : '🏷️ بعتنا ' + S.jobTotal + ' ليبل لطابعة الفرع…') + '</span></div>';
  }
  function paintJob(){ var b = $('rcvJobBox'); if(b) b.innerHTML = jobHtml(); }
  function watchJob(id){
    if(S.jobUnsub){ try{ S.jobUnsub(); }catch(e){} S.jobUnsub = null; }
    S.job = { status:'pending' }; S.jobT = Date.now(); paintJob();
    setTimeout(paintJob, 61000);
    S.jobUnsub = api().watchJob(id, function(d){
      if(d){ S.job = d; paintJob();
        if(d.status === 'printed'){ toast('🏷️ اتطبع ' + S.jobTotal + ' ليبل'); if(navigator.vibrate) navigator.vibrate([40, 40, 40]); }
        if(d.status === 'printed' || d.status === 'failed'){ try{ S.jobUnsub(); }catch(e){} S.jobUnsub = null; } }
    });
  }
  function queueLabels(rows){
    var L = core().recvLabelItems(rows);
    if(!L.items.length) return;
    if(L.tooMany && !window.confirm('هتطبعي ' + L.total + ' ليبل — أكتر من ' + L.max + '. متأكدة؟')) return;
    S.jobItems = L.items; S.jobTotal = L.total;
    api().queueLabels(branch(), S.emp ? S.emp.name : '', L.items).then(watchJob)
      .catch(function(e){ console.warn('rcv labels', e); S.job = { status:'failed', error:'مقدرناش نبعت للطابعة — النت' }; paintJob(); });
  }
  function reprint(){
    if(!S.jobItems || !S.jobItems.length) return;
    api().queueLabels(branch(), S.emp ? S.emp.name : '', S.jobItems).then(watchJob)
      .catch(function(){ toast('النت فيه مشكلة — جرّبي تاني', true); });
  }

  /* ---------- التأكيد ---------- */
  function withTimeout(p, ms){
    return Promise.race([p, new Promise(function(res){ setTimeout(function(){ res('__timeout__'); }, ms); })]);
  }
  async function confirm(){
    if(S.sending || !S.emp) return;
    var chk = core().recvValidate(S.cart, S.allowNeg);
    if(!chk.ok){ toast(chk.error, true); return; }
    // الحالة بتتحسب بالترتيب لو نفس الصنف في أكتر من سطر
    var cur = {}, st = {};
    var rows = chk.rows.map(function(r){
      if(!(r.id in cur)){ cur[r.id] = Number(r.currentQty) || 0; st[r.id] = r.status || ''; }
      var status = core().recvStatusAfter(cur[r.id], r.qty, st[r.id]);
      cur[r.id] += r.qty; if(status) st[r.id] = status;
      return { id:r.id, qty:r.qty, status:status, log:core().recvLogRow(r, branch(), S.emp.name, cur[r.id]) };
    });
    S.sending = true;
    var btn = $('rcvConfirm'); if(btn){ btn.disabled = true; btn.textContent = '⏳ بيتسجل…'; }
    try{
      var res = await withTimeout(api().commit(branch(), rows), 10000);
      // محلي فورًا في السجل (السيرفر هيأكّد بعدين)
      S.log = rows.map(function(x){ return { id:x.log.receiveEntryId, barcode:x.log.productBarcode || '', name:x.log.productName,
        qtyChange:x.qty, ts:x.log.receivedAtMs || Date.now(), employeeName:S.emp.name, source:'sales' }; }).reverse().concat(S.log).slice(0, 20);
      var _lblRows = chk.rows;   // قبل ما السلة تتمسح
      S.cart = []; S.cache = {};
      draftSave();
      var _pick = _lblRows.filter(function(r){ return r.lbl && Number(r.qty) > 0 && Number(r.lblQty) > 0; })
        .map(function(r){ return { barcode:r.barcode, name:r.name, price:r.price, qty:Math.round(Number(r.lblQty)) }; });
      if(_pick.length) queueLabels(_pick);
      toast(res === '__timeout__' ? '📴 اتسجل على الجهاز — هيتبعت أول ما النت يرجع' : '✅ اتسجل ' + rows.length + ' حركة', res === '__timeout__');
    }catch(e){
      console.warn('rcv commit', e);
      toast('ماتسجلش: ' + ((e && e.code === 'permission-denied') ? 'الجهاز مش مسجّل دخول' : 'جرّبي تاني'), true);
    }finally{
      S.sending = false; if(btn) btn.disabled = false;
      renderMain();
      setTimeout(loadLog, 1500);
    }
  }

  /* ---------- السجل ---------- */
  function loadLog(){
    api().recentLog(branch()).then(function(docs){
      var rows = core().recvLogRowsFromDocs(docs, branch(), 20);
      if(rows.length) S.log = rows;
      renderLog();
    }).catch(function(e){ console.warn('rcv log', e); renderLog(); });
  }
  function renderLog(){
    var box = $('rcvLogBox'); if(!box) return;
    if(!S.log.length){ box.innerHTML = '<div class="rcvEmpty">مفيش استلامات مسجلة لسه</div>'; return; }
    box.innerHTML = S.log.map(function(l){
      var q = Number(l.qtyChange) || 0;
      var d = l.ts ? new Date(l.ts) : null;
      var when = d ? d.toLocaleDateString('ar-EG', { day:'2-digit', month:'2-digit' }) + ' ' + d.toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit' }) : '—';
      return '<div class="rcvLog"><div><div style="font-weight:800">' + esc(l.name) + '</div>'
        + '<div class="rcvMeta">' + esc(l.barcode || '—') + ' · ' + esc(l.employeeName || '—') + (l.source === 'sales' ? ' · 📱' : ' · 🖥️') + ' · ' + when + '</div></div>'
        + '<b class="' + (q >= 0 ? 'in' : 'out') + '">' + (q > 0 ? '+' : '') + q + '</b></div>';
    }).join('');
  }

  function close(fromPop){
    scanStop();
    draftSave();
    var ov = $('rcvOverlay'); var was = ov && ov.classList.contains('show');
    if(ov) ov.classList.remove('show');
    S.emp = null;
    if(S.jobUnsub){ try{ S.jobUnsub(); }catch(e){} S.jobUnsub = null; }
    S.job = null;
    if(!fromPop && was){ try{ if(history.state && history.state.rcv) history.back(); }catch(e){} }
  }
  // زرار الرجوع في الموبايل: يقفل الكاميرا الأول، بعدين الشاشة — مش التطبيق
  window.addEventListener('popstate', function(){
    var cam = $('rcvCam');
    if(cam && cam.classList.contains('show')){ scanStop(); try{ history.pushState({ rcv:1 }, ''); }catch(e){} return; }
    var ov = $('rcvOverlay'); if(ov && ov.classList.contains('show')) close(true);
  });

  window.salesRecvOpen = open;
  window.salesRecvClose = function(){ close(false); };
  window.salesRecvPickEmp = pickEmp;
  window.salesRecvAddCode = addFromInput;
  window.salesRecvQty = qty;
  window.salesRecvSetQty = setQty;
  window.salesRecvRemove = removeAt;
  window.salesRecvMode = mode;
  window.salesRecvScanStart = scanStart;
  window.salesRecvScanStop = scanStop;
  window.salesRecvConfirm = confirm;
  window.salesRecvLbl = lbl;
  window.salesRecvLblQty = lblQty;
  window.salesRecvSetLblQty = setLblQty;
  window.salesRecvReprint = reprint;
})();
