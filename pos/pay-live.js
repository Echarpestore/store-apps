/* ============================================================
   💳 pay-live.js — شاشة «في انتظار التأكيد» على POS (v757 · 03-10-2026)
   ------------------------------------------------------------
   • الفيزا: لوحة لايف صغيرة (مبتقفلش الشاشة على الكاشير): بنبعت للماكينة ←
     العميلة بتحط الكارت ← البنك بيراجع ← ✓ اتقبلت / ✗ اترفضت + السبب بالعربي.
   • بتتعلّم المدة المعتادة لكل فرع: وقت كل تأكيد حقيقي بيتسجّل في
     pos_test_settings/payeta_<الفرع> (آخر 20) — والعداد بيمشي عليها.
   • بتبعت الحالة للتابلت في pos_test_settings/paylive_<الفرع> (المبلغ والحالة
     والسبب بس — من غير آخر 4 أرقام ولا اسم).
   ⚠️ مبتلمسش منطق الفلوس: بتلف sendToPaymobTerminal / paymobWatch / paymobCancelPending
      (نفس أسلوب instapay-pos.js) وبتسمع لنفس مستند Paymob. لو الملف ده وقع، الدفع شغال عادي.
   ============================================================ */
(function(){
  'use strict';
  var CORE = window.PayLiveCore;
  if(!CORE || !window.PayRing || typeof db === 'undefined') { console.warn('[paylive] مش متحمّل'); return; }
  function br(){ return String(window.currentBranch || (typeof currentBranch !== 'undefined' ? currentBranch : '') || ''); }
  var SETTINGS = (typeof TEST_SETTINGS !== 'undefined') ? TEST_SETTINGS : 'pos_test_settings';

  /* ---------- ⏱️ المدة المعتادة (بتتعلّم من الفرع نفسه) ---------- */
  var eta = { instapay: [], card: [] }, etaLoadedFor = '';
  function loadEta(){
    var b = br(); if(!b || etaLoadedFor === b) return;
    etaLoadedFor = b;
    db.collection(SETTINGS).doc('payeta_' + b).get().then(function(s){
      var d = s.exists ? (s.data() || {}) : {};
      eta.instapay = Array.isArray(d.instapay) ? d.instapay : [];
      eta.card = Array.isArray(d.card) ? d.card : [];
    }).catch(function(){});
  }
  function etaFor(kind){ loadEta(); return CORE.etaFrom(eta[kind], kind); }
  function record(kind, ms){
    var b = br(); if(!b) return;
    eta[kind] = CORE.addSample(eta[kind], ms);
    var patch = {}; patch[kind] = eta[kind]; patch.updatedAt = Date.now();
    db.collection(SETTINGS).doc('payeta_' + b).set(patch, { merge: true }).catch(function(){});
  }

  /* ---------- 📡 للتابلت ---------- */
  function publish(state){
    var b = br(); if(!b) return;
    var d = Object.assign({ kind: 'card', ts: Date.now() }, state);
    db.collection(SETTINGS).doc('paylive_' + b).set(d).catch(function(e){ console.warn('[paylive] publish', e && e.code); });
  }

  /* ---------- 🎨 لوحة الكارت على POS ---------- */
  var CSS = ''
    + '#plCard{position:fixed;left:18px;bottom:18px;z-index:7600;width:320px;display:none;color:#eef0f4;font-family:Cairo,sans-serif;direction:rtl;'
    + 'background:linear-gradient(160deg,rgba(23,26,35,.97),rgba(14,16,22,.97));border:1px solid rgba(255,255,255,.08);border-radius:22px;'
    + 'box-shadow:0 30px 60px -20px rgba(0,0,0,.7),0 0 0 1px rgba(47,200,140,.06) inset;padding:18px 18px 14px;'
    + '-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}'
    + '#plCard.on{display:block;animation:plIn .45s cubic-bezier(.2,.9,.25,1.15)}'
    + '@keyframes plIn{from{opacity:0;transform:translateY(24px) scale(.96)}to{opacity:1;transform:none}}'
    + '#plCard .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}'
    + '#plCard .eb{font:700 11px "Space Grotesk",Cairo;letter-spacing:.22em;color:#7d8496}'
    + '#plCard .x{background:none;border:none;color:#7d8496;font-size:18px;cursor:pointer;padding:2px 6px}'
    + '#plCard .mid{display:flex;align-items:center;gap:16px}'
    + '#plCard .amt{font:800 26px "Space Grotesk",Cairo;letter-spacing:-.01em}'
    + '#plCard .amt small{font-size:.5em;color:#2fc88c;margin-inline-start:4px}'
    + '#plCard .st{font-size:13.5px;font-weight:800;margin-top:4px;line-height:1.5;min-height:40px;transition:color .3s}'
    + '#plCard .st.ok{color:#3ddc97}#plCard .st.bad{color:#ff8a90}'
    + '#plCard .sub{font-size:11.5px;color:#7d8496;margin-top:2px;line-height:1.6}'
    + '#plCard .bar2{height:3px;border-radius:3px;background:rgba(255,255,255,.06);margin-top:12px;overflow:hidden}'
    + '#plCard .bar2 i{display:block;height:100%;width:0;background:linear-gradient(90deg,#2fc88c,#f0c86e);transition:width .9s cubic-bezier(.22,1,.36,1)}';
  var el = null, ring = null, t0 = 0, timer = 0, curRef = '', curAmt = 0, unsub = null, hideT = 0, finished = false;
  function ensure(){
    if(el) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    el = document.createElement('div'); el.id = 'plCard';
    el.innerHTML = '<div class="top"><span class="eb">CARD · PAYMOB</span><button class="x" title="إخفاء">✕</button></div>'
      + '<div class="mid"><div class="rh"></div><div style="flex:1;min-width:0">'
      + '<div class="amt"><span class="v">0</span><small>ج.م</small></div>'
      + '<div class="st">بنبعت المبلغ للماكينة…</div><div class="sub"></div></div></div>'
      + '<div class="bar2"><i></i></div>';
    document.body.appendChild(el);
    ring = window.PayRing.create(el.querySelector('.rh'), { size: '92px' });
    el.querySelector('.x').onclick = function(){ hide(); };
  }
  function show(){ ensure(); clearTimeout(hideT); el.classList.add('on'); }
  function hide(){ if(el) el.classList.remove('on'); stopTimer(); }
  function stopTimer(){ if(timer){ clearInterval(timer); timer = 0; } }
  function setText(st, sub, cls){
    var s = el.querySelector('.st'); s.textContent = st; s.className = 'st' + (cls ? ' ' + cls : '');
    el.querySelector('.sub').textContent = sub || '';
  }
  function tick(){
    var e = etaFor('card'), el2 = Date.now() - t0, p = CORE.progressAt(el2, e);
    ring.set(p); el.querySelector('.bar2 i').style.width = p + '%';
    setText(CORE.phase(el2, e, 'card', 'staff'), CORE.isLate(el2, e) ? 'الماكينة ممكن تكون محتاجة مراجعة' : '');
  }
  function stopWatch(){ if(unsub){ try{ unsub(); }catch(e){} unsub = null; } }

  function cardStart(amountEGP){
    ensure(); stopWatch(); stopTimer();
    finished = false; t0 = Date.now(); curAmt = Number(amountEGP) || 0; curRef = '';
    el.querySelector('.amt .v').textContent = curAmt.toLocaleString('en-EG', { maximumFractionDigits: 2 });
    ring.idle(); el.querySelector('.bar2 i').style.width = '0';
    setText('بنبعت المبلغ للماكينة…', '');
    show();
    timer = setInterval(tick, 400);
    publish({ state: 'waiting', amount: curAmt, etaMs: etaFor('card') });
  }
  function cardWatch(orderRef, amountEGP){
    if(!orderRef || orderRef === curRef) return;
    curRef = orderRef; if(!t0) t0 = Date.now();
    stopWatch();
    unsub = db.collection('pos_paymob_txns').doc(String(orderRef)).onSnapshot(function(snap){
      var d = snap.exists ? (snap.data() || {}) : null;
      if(!d || finished || curRef !== orderRef) return;
      if(d.status === 'success'){
        finished = true; stopTimer(); ring.done(true); el.querySelector('.bar2 i').style.width = '100%';
        var card = (d.cardScheme ? String(d.cardScheme) : 'الكارت') + (d.cardLast4 ? ' ••' + String(d.cardLast4).slice(-4) : '');
        setText('✓ العملية اتقبلت', card + ' · بيحفظ ويطبع', 'ok');
        record('card', Date.now() - t0);
        publish({ state: 'approved', amount: curAmt });
        hideT = setTimeout(hide, 6000);
      } else if(d.status === 'failed'){
        finished = true; stopTimer(); ring.done(false);
        var why = CORE.reasonAr(d.declineReason);
        setText('✗ العملية اترفضت', why, 'bad');
        publish({ state: 'declined', amount: curAmt, reason: why });
        hideT = setTimeout(hide, 15000);
      } else if(d.status === 'pending'){
        setText('البنك بيأكد العملية…', '');
      }
    }, function(){});
  }
  function cardCancel(){
    if(!el || !el.classList.contains('on') || finished) return;
    finished = true; stopTimer(); stopWatch(); ring.done(false);
    setText('اتلغى طلب الكارت', '', 'bad');
    publish({ state: 'cancelled', amount: curAmt });
    hideT = setTimeout(hide, 2500);
  }

  /* ---------- 🔗 اللف على دوال الكارت (من غير ما نغيّر منطقها) ---------- */
  function wrap(name, before){
    var orig = window[name]; if(typeof orig !== 'function' || orig.__pl) return;
    var w = function(){ try{ before.apply(this, arguments); }catch(e){ console.warn('[paylive]', name, e); } return orig.apply(this, arguments); };
    w.__pl = true; window[name] = w;
  }
  function hook(){
    wrap('sendToPaymobTerminal', function(amountEGP){ if(typeof paymobTerminalId === 'function' && paymobTerminalId()) cardStart(amountEGP); });
    wrap('paymobWatch', function(orderRef, amountEGP){ cardWatch(orderRef, amountEGP); });
    wrap('paymobCancelPending', function(){ cardCancel(); });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
  setTimeout(loadEta, 1500);

  window.PayLive = { etaFor: etaFor, record: record, publish: publish, cardStart: cardStart, cardWatch: cardWatch, cardCancel: cardCancel };
})();
