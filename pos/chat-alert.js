/* ============================================================
   🔔 chat-alert.js — v762 — تنبيه رسايل الشات (POS · sales · Office)
   ------------------------------------------------------------
   طلب المالك 09-10: «لما حد يبعت رسالة يظهر إشعار على POS وعلى برنامج
   sales بتاع الفرع مع صوت على الموبايل وتنبيه كل شوية عشان نرد بسرعة».

   · بيشتغل على نفس مستمع المحادثات اللي في chat-staff-ui.js (مفيش قراءة
     زيادة) — `ChatAlert.update(convs, state)` بتتنادى مع كل لقطة.
   · رسالة جديدة (unreadStaff زاد) ← صوت + اهتزاز + شريط فوق الشاشة +
     إشعار متصفح (لو مسموح) + عنوان التاب "(n) 💬".
   · طول ما فيه رسايل من غير رد: التنبيه بيتكرر كل EVERY_MS (دقيقة).
   · المحادثة المفتوحة قدام الموظفة مبتنبّهش (هي بتقراها أصلًا).
   · "🔕 كتم ساعة" بيوقف الصوت/التكرار ساعة على الجهاز ده بس.
   · الصوت WebAudio (من غير ملف) — بيتفتح بعد أول لمسة/ضغطة (شرط المتصفحات).

   🧪 الدوال الخالصة (chatAlertDiff · chatAlertDue) متعرّضة للاختبار.
   ============================================================ */
(function(){
  'use strict';
  var EVERY_MS = 60 * 1000;          // تكرار التنبيه طول ما فيه رسايل من غير رد
  var MUTE_MS  = 60 * 60 * 1000;     // «كتم ساعة»
  var LS_MUTE  = 'cc_alert_mute_until';

  /* ---------- منطق خالص ---------- */
  // بيرجّع {next: {convId: unread}, fresh: [convs اللي زاد فيها الغير مقروء]}
  function chatAlertDiff(prevMap, convs, opts){
    prevMap = prevMap || {}; opts = opts || {};
    var next = {}, fresh = [];
    (convs || []).forEach(function(c){
      if(!c || !c.id) return;
      var n = Number(c.unreadStaff) || 0;
      if(n <= 0) return;
      if(opts.filterMine && opts.branch && c.branch && c.branch !== opts.branch) return;
      if(opts.open && opts.activeId === c.id) return;   // الموظفة فاتحاها دلوقتي
      next[c.id] = n;
      if(n > (Number(prevMap[c.id]) || 0)) fresh.push(c);
    });
    return { next: next, fresh: fresh };
  }
  function chatAlertDue(lastPingMs, nowMs, everyMs){
    return (nowMs - (Number(lastPingMs) || 0)) >= (everyMs || EVERY_MS);
  }
  function chatAlertMuted(muteUntilMs, nowMs){ return (Number(muteUntilMs) || 0) > nowMs; }

  /* ---------- حالة ---------- */
  var S = { prev: {}, pending: {}, lastPing: 0, timer: null, ctx: null, unlocked: false, lastFresh: null };
  var hasDOM = typeof document !== 'undefined' && !!document.body;

  function muteUntil(){ try{ return Number(localStorage.getItem(LS_MUTE)) || 0; }catch(e){ return 0; } }
  function setMute(ms){ try{ localStorage.setItem(LS_MUTE, String(ms)); }catch(e){} }

  /* ---------- صوت ---------- */
  function unlockAudio(){
    if(S.unlocked) return;
    try{
      var AC = window.AudioContext || window.webkitAudioContext; if(!AC) return;
      S.ctx = S.ctx || new AC();
      if(S.ctx.state === 'suspended') S.ctx.resume();
      S.unlocked = true;
    }catch(e){}
  }
  function beep(){
    if(!S.ctx || !S.unlocked) return false;
    try{
      if(S.ctx.state === 'suspended') S.ctx.resume();
      var t0 = S.ctx.currentTime;
      [[880, 0], [1175, 0.18], [880, 0.36]].forEach(function(p){
        var o = S.ctx.createOscillator(), g = S.ctx.createGain();
        o.type = 'sine'; o.frequency.value = p[0];
        g.gain.setValueAtTime(0.0001, t0 + p[1]);
        g.gain.exponentialRampToValueAtTime(0.5, t0 + p[1] + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + p[1] + 0.17);
        o.connect(g); g.connect(S.ctx.destination);
        o.start(t0 + p[1]); o.stop(t0 + p[1] + 0.2);
      });
      return true;
    }catch(e){ return false; }
  }
  function vibrate(){ try{ if(navigator.vibrate) navigator.vibrate([250, 120, 250]); }catch(e){} }

  /* ---------- شريط التنبيه ---------- */
  function ensureBar(){
    if(!hasDOM) return null;
    var b = document.getElementById('ccAlertBar'); if(b) return b;
    var st = document.createElement('style');
    st.textContent =
      '#ccAlertBar{position:fixed;top:0;left:0;right:0;z-index:9000;display:none;align-items:center;gap:10px;' +
      'padding:10px 14px;background:#111827;color:#fff;font-family:Cairo,sans-serif;font-weight:800;font-size:14px;' +
      'box-shadow:0 6px 24px rgba(0,0,0,.35);direction:rtl;cursor:pointer}' +
      '#ccAlertBar.on{display:flex;animation:ccAlertIn .3s ease}' +
      '#ccAlertBar.ping{animation:ccAlertPulse .6s ease 2}' +
      '#ccAlertBar .t{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}' +
      '#ccAlertBar .t b,#ccAlertBar .t small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#ccAlertBar .t small{font-weight:600;font-size:12px;opacity:.85}' +
      '#ccAlertBar .n{background:#ef4444;border-radius:999px;padding:2px 9px;font-size:12px}' +
      '#ccAlertBar button{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);color:#fff;' +
      'border-radius:9px;padding:6px 10px;font-family:Cairo,sans-serif;font-weight:800;font-size:12px;cursor:pointer;flex-shrink:0}' +
      '@keyframes ccAlertIn{from{transform:translateY(-100%)}to{transform:none}}' +
      '@keyframes ccAlertPulse{0%,100%{background:#111827}50%{background:#b91c1c}}';
    document.head.appendChild(st);
    b = document.createElement('div'); b.id = 'ccAlertBar';
    b.innerHTML = '<span class="n" id="ccAlertN">1</span><span class="t"><b id="ccAlertH">💬 رسالة جديدة</b><small id="ccAlertT">اضغطي للرد</small></span>' +
      '<button id="ccAlertPerm" style="display:none">🔔 فعّل الإشعارات</button>' +
      '<button id="ccAlertMute">🔕 كتم ساعة</button>';
    document.body.appendChild(b);
    b.addEventListener('click', function(e){
      if(e.target && e.target.tagName === 'BUTTON') return;
      openFirst();
    });
    document.getElementById('ccAlertMute').addEventListener('click', function(e){
      e.stopPropagation(); setMute(Date.now() + MUTE_MS); b.classList.remove('on');
    });
    document.getElementById('ccAlertPerm').addEventListener('click', function(e){
      e.stopPropagation();
      try{ Notification.requestPermission().then(function(){ renderBar(); }); }catch(err){}
    });
    return b;
  }
  function pendingList(){ return Object.keys(S.pending); }
  function convById(id){
    var arr = S.convs || [];
    for(var i = 0; i < arr.length; i++) if(arr[i] && arr[i].id === id) return arr[i];
    return null;
  }
  function openFirst(){
    var ids = pendingList(); if(!ids.length) return;
    // الأحدث أولًا
    ids.sort(function(a, b){ var ca = convById(a) || {}, cb = convById(b) || {}; return (Number(cb.lastAt) || 0) - (Number(ca.lastAt) || 0); });
    try{ if(window.ccOpenPanel) window.ccOpenPanel(); if(window.ccOpenConv) window.ccOpenConv(ids[0]); }catch(e){}
  }
  function label(c){
    if(!c) return { h: '💬 رسالة جديدة', t: 'اضغطي للرد' };
    var where = c.branch && String(c.branch).toLowerCase() !== String(c.brand || '').toLowerCase() ? ' · ' + c.branch : (c.brand === 'glow' ? ' · Glow' : '');
    return { h: '💬 ' + (c.name || c.phone || 'عميلة') + where, t: (c.lastText ? String(c.lastText).slice(0, 70) : 'رسالة جديدة') + ' — اضغطي للرد' };
  }
  function renderBar(){
    var b = ensureBar(); if(!b) return;
    var ids = pendingList();
    if(!ids.length || chatAlertMuted(muteUntil(), Date.now())){ b.classList.remove('on'); setTitle(0); return; }
    var total = 0; ids.forEach(function(id){ total += S.pending[id]; });
    document.getElementById('ccAlertN').textContent = total > 99 ? '99+' : String(total);
    var c = S.lastFresh && S.pending[S.lastFresh.id] ? S.lastFresh : convById(ids[0]);
    var L = label(c);
    document.getElementById('ccAlertH').textContent = L.h;
    document.getElementById('ccAlertT').textContent = L.t;
    var perm = document.getElementById('ccAlertPerm');
    perm.style.display = (typeof Notification !== 'undefined' && Notification.permission === 'default') ? '' : 'none';
    b.classList.add('on'); setTitle(total);
  }
  var _title = null;
  function setTitle(n){
    if(!hasDOM) return;
    if(_title === null) _title = document.title;
    document.title = n ? '(' + n + ') 💬 ' + _title : _title;
  }
  function notify(c){
    try{
      if(typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      var n = new Notification('💬 رسالة من ' + (c.name || c.phone || 'عميلة'), {
        body: (c.lastText ? String(c.lastText).slice(0, 80) : 'رسالة جديدة في شات العملاء') + (c.branch ? ' · ' + c.branch : ''),
        tag: 'cc-' + c.id, renotify: true, silent: false
      });
      n.onclick = function(){ try{ window.focus(); }catch(e){} try{ if(window.ccOpenPanel) window.ccOpenPanel(); if(window.ccOpenConv) window.ccOpenConv(c.id); }catch(e){} n.close(); };
    }catch(e){}
  }

  /* ---------- التنبيه ---------- */
  function ping(c, isNew){
    S.lastPing = Date.now();
    renderBar();
    if(chatAlertMuted(muteUntil(), Date.now())) return;
    beep(); vibrate();
    var b = hasDOM && document.getElementById('ccAlertBar');
    if(b){ b.classList.remove('ping'); void b.offsetWidth; b.classList.add('ping'); }
    if(isNew && c) notify(c);
  }
  function tick(){
    if(!pendingList().length){ stopTimer(); renderBar(); return; }
    if(chatAlertDue(S.lastPing, Date.now(), EVERY_MS)) ping(null, false);
  }
  function startTimer(){ if(!S.timer) S.timer = setInterval(tick, 5000); }
  function stopTimer(){ if(S.timer){ clearInterval(S.timer); S.timer = null; } }

  function update(convs, st){
    st = st || {};
    S.convs = convs || [];
    var d = chatAlertDiff(S.prev, S.convs, st);
    S.pending = d.next;
    // prev = آخر عدد شفناه لكل محادثة (حتى اللي اتقرت وبقت صفر بتتشال فتبقى جديدة لو رجعت)
    S.prev = d.next;
    if(d.fresh.length){
      d.fresh.sort(function(a, b){ return (Number(b.lastAt) || 0) - (Number(a.lastAt) || 0); });
      S.lastFresh = d.fresh[0];
      ping(d.fresh[0], true);
    } else renderBar();
    if(pendingList().length) startTimer(); else stopTimer();
    return d;
  }

  if(hasDOM){
    ['pointerdown', 'keydown', 'touchstart'].forEach(function(ev){ document.addEventListener(ev, unlockAudio, { once: false, passive: true }); });
  }

  var ChatAlert = { update: update, diff: chatAlertDiff, due: chatAlertDue, muted: chatAlertMuted, _S: S, EVERY_MS: EVERY_MS, MUTE_MS: MUTE_MS };
  if(typeof window !== 'undefined'){ window.ChatAlert = ChatAlert; window.chatAlertDiff = chatAlertDiff; window.chatAlertDue = chatAlertDue; }
  if(typeof module !== 'undefined' && module.exports) module.exports = ChatAlert;
})();
