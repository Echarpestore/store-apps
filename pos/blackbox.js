// ============================================================
// 🐞 blackbox.js — الصندوق الأسود: بيمسك المشكلة لحظة حصولها
// ------------------------------------------------------------
// المشكلة اللي بيحلها: لما تحصل تعليقة أو باج في الفرع، الكاشير
// بتقفل وتفتح وتكمّل شغل — وكل الدلائل بتضيع. وبعدين بنقعد نحزّر.
//
// ⚠️ لازم يتحمّل **قبل أي ملف تاني** في index.html — الفايدة كلها
//    إنه شايف الأحداث من لحظة الفتح. لو اتحمّل في الآخر، الأخطاء
//    اللي حصلت قبله راحت وخلاص.
//
// 🔒 خصوصية: مبيسجّلش أسماء عملاء ولا تليفونات ولا أرقام كروت.
//    الفواتير بتتسجّل بالكود والمبلغ بس. أي حاجة تتكتب في خانة
//    البحث بتتقص لأول ٣ حروف (عشان نعرف "كانت بتكتب" من غير
//    ما نسجّل بيانات عميلة).
//
// 💾 بيتخزّن في localStorage عشان يعيش بعد ما البرنامج يتقفل —
//    ده بالظبط اللي بينفع مع التعليقات اللي بتضطر تقفل بعدها.
// ============================================================
(function(){
  'use strict';
  var MAX = 120;                    // آخر ١٢٠ حدث — كفاية لتشخيص، وخفيف
  var LSK = 'pos_blackbox_v1';
  var ring = [];
  var startedAt = Date.now();

  function t(){
    try{ return new Date().toLocaleTimeString('ar-EG', { hour12:false }); }
    catch(e){ return String(Date.now()); }
  }
  // 🔒 قص أي نص ممكن يكون فيه بيانات شخصية
  function safe(v, n){
    var s = String(v == null ? '' : v);
    n = n || 40;
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
  function el(a){
    if(!a) return '—';
    return (a.id ? '#' + a.id : (a.tagName || '?').toLowerCase())
      + (a.className && typeof a.className === 'string' ? '.' + a.className.split(' ')[0] : '');
  }

  function log(kind, msg, extra){
    try{
      ring.push({
        t: t(), ms: Date.now(), kind: kind,
        msg: safe(msg, 160),
        active: el(document.activeElement),
        hasFocus: (function(){ try{ return document.hasFocus(); }catch(e){ return null; } })(),
        online: navigator.onLine,
        extra: extra || ''
      });
      if(ring.length > MAX) ring.shift();
      // بنحفظ كل ٥ أحداث بس — الكتابة في localStorage مش مجانية
      if(ring.length % 5 === 0) persist();
    }catch(e){}
  }
  window.bbLog = log;

  function persist(){
    try{ localStorage.setItem(LSK, JSON.stringify(ring.slice(-MAX))); }catch(e){}
  }
  // نرجّع اللي كان محفوظ من الجلسة اللي فاتت — ده اللي بينفع بعد تعليقة
  try{
    var old = JSON.parse(localStorage.getItem(LSK) || '[]');
    if(old && old.length){
      ring.push({ t: t(), ms: Date.now(), kind: 'session',
        msg: '——— جلسة جديدة (اللي فوق من قبل القفل) ———', active:'—', extra:'' });
      ring = old.concat(ring).slice(-MAX);
    }
  }catch(e){}
  log('session', 'البرنامج فتح');

  // ---------- ١) الأخطاء ----------
  window.addEventListener('error', function(e){
    log('❌ خطأ', (e.message || 'error') + ' @ ' + safe((e.filename||'').split('/').pop(), 30) + ':' + (e.lineno||'?'));
    persist();
  });
  window.addEventListener('unhandledrejection', function(e){
    var r = e && e.reason;
    log('❌ وعد مرفوض', (r && (r.code || r.message)) || String(r));
    persist();
  });
  // نلف console.error/warn عشان نمسك أخطاء Firestore والطباعة
  ['error','warn'].forEach(function(lvl){
    var orig = console[lvl];
    console[lvl] = function(){
      try{
        var parts = [].slice.call(arguments).map(function(a){
          if(a instanceof Error) return a.message;
          if(a && typeof a === 'object') return (a.code || a.name || JSON.stringify(a).slice(0,80));
          return String(a);
        });
        log(lvl === 'error' ? '❌ console' : '⚠️ console', parts.join(' | '));
      }catch(e){}
      return orig.apply(console, arguments);
    };
  });

  // ---------- ٢) التركيز (الباج المفتوح) ----------
  window.addEventListener('blur',  function(){ log('🎯 فوكس', 'النافذة فقدت التركيز'); });
  window.addEventListener('focus', function(){ log('🎯 فوكس', 'النافذة رجعت'); });
  document.addEventListener('visibilitychange', function(){
    log('🎯 فوكس', 'الرؤية: ' + document.visibilityState);
  });

  // ---------- ٣) الشبكة ----------
  window.addEventListener('online',  function(){ log('🌐 شبكة', 'النت رجع'); persist(); });
  window.addEventListener('offline', function(){ log('🌐 شبكة', 'النت قطع'); persist(); });

  // ---------- ٤) تصرفات المستخدم ----------
  // 🔒 الزراير بنصها، الكتابة بأول ٣ حروف بس
  document.addEventListener('click', function(e){
    try{
      var b = e.target && e.target.closest && e.target.closest('button, .btn, [onclick]');
      if(!b) return;
      var label = (b.textContent || '').trim().replace(/\s+/g,' ');
      log('👆 ضغطة', safe(label, 40) || el(b));
    }catch(_e){}
  }, true);
  document.addEventListener('keydown', function(e){
    try{
      if(e.key === 'Enter' || e.key === 'Escape' || e.key === 'F5'){
        log('⌨️ زرار', e.key);
      }
    }catch(_e){}
  }, true);

  // ---------- ٥) لقطة الحالة وقت المشكلة ----------
  function snapshot(){
    var s = {};
    try{
      s['الوقت'] = new Date().toLocaleString('ar-EG');
      s['الفرع'] = (window.currentBranch || '—');
      s['الجهاز'] = (window.posShell ? 'برنامج ويندوز' : 'متصفح');
      s['النت'] = navigator.onLine ? 'متصل' : 'مقطوع';
      s['النافذة نشطة'] = (function(){ try{ return document.hasFocus() ? 'أيوه' : 'لأ ⚠️'; }catch(e){ return '?'; } })();
      s['العنصر المتفوكس'] = el(document.activeElement);
      s['السلة'] = (window.cart && window.cart.length != null) ? (window.cart.length + ' صنف') : '—';
      s['البرنامج شغال من'] = Math.round((Date.now()-startedAt)/60000) + ' دقيقة';
      s['نسخة الكاش'] = (window.CACHE_NAME || document.documentElement.getAttribute('data-v') || '—');
      s['الشاشة'] = (function(){
        var ids = ['saleScreen','loginScreen','transfersScreen','reportsScreen'];
        for(var i=0;i<ids.length;i++){
          var x = document.getElementById(ids[i]);
          if(x && x.offsetParent !== null) return ids[i];
        }
        return '—';
      })();
    }catch(e){}
    return s;
  }

  // ---------- ٧) الإرسال للمالك ----------
  /* 📮 التقرير بيتبعت لوحده على Firestore — الموظفة في الفرع مش
     المالك، فالنسخ واللزق مالوش لازمة. المالك بيشوفه في Office.
     ⚡ كتابة واحدة لكل بلاغ (نادر) — مش بتفرق مع تحقيق القراءات
        المفتوح، ده اتحسب.
     📴 لو النت مقطوع، البلاغ بيتحفظ محليًا وبيتبعت أول ما يرجع —
        وده بالظبط أهم حالة، لأن قطع النت نفسه من أسباب المشاكل. */
  var QK = 'pos_blackbox_queue_v1';
  function queueGet(){
    try{ return JSON.parse(localStorage.getItem(QK) || '[]'); }catch(e){ return []; }
  }
  function queueSet(a){
    try{ localStorage.setItem(QK, JSON.stringify(a.slice(-20))); }catch(e){}
  }
  function sendDoc(rec){
    // نستنى الـdb تجهز — الصندوق بيتحمّل قبل pos-core.js عمدًا
    if(typeof db === 'undefined' || !db) return Promise.reject(new Error('db'));
    return db.collection('pos_incidents').add(rec);
  }
  function buildRecord(note){
    var s = snapshot();
    return {
      note: safe(note, 400),
      branch: (typeof currentBranch !== 'undefined' && currentBranch) || '—',
      employeeName: (function(){
        try{ return (currentEmployee && currentEmployee.name) || '—'; }catch(e){ return '—'; }
      })(),
      ts: Date.now(),
      state: s,
      events: ring.slice(-MAX).map(function(r){
        return { t:r.t, kind:r.kind, msg:r.msg, hasFocus:r.hasFocus, active:r.active };
      }),
      seen: false,
      ua: safe(navigator.userAgent, 120)
    };
  }
  function flushQueue(){
    var q = queueGet();
    if(!q.length) return;
    var rest = [];
    var jobs = q.map(function(rec){
      return sendDoc(rec).catch(function(){ rest.push(rec); });
    });
    Promise.all(jobs).then(function(){ queueSet(rest); });
  }
  window.addEventListener('online', function(){ setTimeout(flushQueue, 3000); });
  setTimeout(flushQueue, 8000);        // محاولة بعد ما كل حاجة تجهز
  setInterval(flushQueue, 5*60*1000);

  window.bbSend = function(note){
    var rec = buildRecord(note);
    return sendDoc(rec).then(function(){ return 'sent'; })
      .catch(function(){
        var q = queueGet(); q.push(rec); queueSet(q);
        return 'queued';
      });
  };
  window.bbReport = function(note){       // نسخة نصية — للنسخ اليدوي وقت اللزوم
    var s = snapshot();
    var out = '🐞 تقرير مشكلة — نظام echarpe\n════════════════════════\n';
    if(note) out += '📝 ' + note + '\n\n';
    Object.keys(s).forEach(function(k){ out += k + ': ' + s[k] + '\n'; });
    out += '\n📋 آخر ' + ring.length + ' حدث (الأحدث تحت):\n';
    out += '(الحالة فوق وقت الضغط — السطور تحت وقت حصولها)\n';
    out += '────────────────────────\n';
    ring.forEach(function(r){
      out += r.t + ' [' + r.kind + '] ' + r.msg;
      if(r.hasFocus === false) out += '  ⚠️(النافذة مش نشطة)';
      out += '\n';
    });
    return out;
  };

  // ---------- ٨) الشاشة ----------
  window.bbOpen = function(){
    var ov = document.getElementById('bbOverlay');
    if(ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'bbOverlay';
    ov.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,.72);'
      + 'display:flex; align-items:center; justify-content:center; padding:16px;';
    /* 🧕 الواجهة دي للموظفة مش للمالك — لازم تبقى سطر واحد وزرار واحد.
       مفيش تفاصيل تقنية ولا "انسخ" ولا كلام معقّد: بتكتب اللي حصل
       وتدوس ابعت، وخلاص. التفاصيل بتتجمع لوحدها ورا الكواليس. */
    ov.innerHTML =
      '<div style="background:#15161c; color:#eceef5; border-radius:16px; padding:20px;'
      + 'max-width:460px; width:100%; font-family:Cairo,sans-serif; direction:rtl;'
      + 'border:1px solid #2a2c36;">'
      + '<div style="font-size:18px; font-weight:800; margin-bottom:6px;">🐞 بلّغي عن مشكلة</div>'
      + '<div style="font-size:13px; opacity:.75; line-height:1.9; margin-bottom:14px;">'
      +   'اكتبي اللي حصل في سطر، والباقي بيتبعت لوحده.'
      + '</div>'
      + '<textarea id="bbNote" rows="3" placeholder="مثال: مسحت صنف من السلة والكيبورد وقف"'
      +   ' style="width:100%; padding:12px; border-radius:11px; border:1px solid #2a2c36;'
      +   ' background:#0e0f14; color:#eceef5; font-family:Cairo; font-size:14px; resize:vertical;'
      +   ' box-sizing:border-box;"></textarea>'
      + '<div style="display:flex; gap:8px; margin-top:14px;">'
      +   '<button id="bbSendBtn" style="flex:1; padding:15px; border:none; border-radius:12px;'
      +     ' background:linear-gradient(180deg,#E8B923,#d9a838); color:#1b1400; font-family:Cairo;'
      +     ' font-weight:800; font-size:15px; cursor:pointer;">📮 ابعتي</button>'
      +   '<button id="bbClose" style="padding:15px 20px; border:1px solid #2a2c36; border-radius:12px;'
      +     ' background:transparent; color:#9aa0ae; font-family:Cairo; font-weight:700;'
      +     ' font-size:14px; cursor:pointer;">إلغاء</button>'
      + '</div>'
      + '<div id="bbMsg" style="display:none; margin-top:12px; padding:12px; border-radius:11px;'
      +   ' font-size:13.5px; line-height:1.8; text-align:center;"></div>'
      + '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
    var closeBtn = document.getElementById('bbClose');
    closeBtn.onclick = function(){ ov.remove(); };
    setTimeout(function(){ try{ document.getElementById('bbNote').focus(); }catch(e){} }, 60);

    document.getElementById('bbSendBtn').onclick = function(){
      var btn = this;
      var note = (document.getElementById('bbNote').value || '').trim();
      if(!note){
        try{ document.getElementById('bbNote').focus(); }catch(e){}
        return;
      }
      btn.disabled = true;
      btn.textContent = 'بيتبعت…';
      window.bbSend(note).then(function(res){
        var m = document.getElementById('bbMsg');
        m.style.display = 'block';
        if(res === 'sent'){
          m.style.background = 'rgba(5,150,105,.15)';
          m.style.color = '#6ee7b7';
          m.innerHTML = '✅ اتبعت — المشكلة وصلت للإدارة.<br>كمّلي شغلك عادي.';
        }else{
          m.style.background = 'rgba(245,158,11,.15)';
          m.style.color = '#fcd34d';
          m.innerHTML = '📴 النت مقطوع — البلاغ اتحفظ<br>وهيتبعت لوحده أول ما النت يرجع.';
        }
        btn.style.display = 'none';
        closeBtn.textContent = 'تمام';
        closeBtn.style.flex = '1';
        // 🎯 نرجّع الفوكس لخانة البحث بعد القفل — الشاشة دي بتتفتح
        //    غالبًا وقت مشكلة فوكس أصلًا، فمينفعش تسيبها أسوأ.
        closeBtn.onclick = function(){
          ov.remove();
          try{
            var sb = document.getElementById('searchBar');
            if(sb && sb.offsetParent !== null) sb.focus();
          }catch(e){}
        };
      });
    };
  };

  // 🎹 اختصار: Ctrl+Shift+B — للحالات اللي الماوس فيها مش بيستجيب
  document.addEventListener('keydown', function(e){
    if(e.ctrlKey && e.shiftKey && (e.code === 'KeyB')){ e.preventDefault(); window.bbOpen(); }
  });

  // 🔘 الزرار العائم — بيتحط لوحده بعد ما الصفحة تجهز
  function mountBtn(){
    if(document.getElementById('bbBtn')) return;
    var b = document.createElement('button');
    b.id = 'bbBtn';
    b.type = 'button';
    b.title = 'بلّغي عن مشكلة (Ctrl+Shift+B)';
    b.textContent = '🐞';
    /* 👁️ ظاهر مش خافت: الموظفة لازم تلاقيه وقت المشكلة من غير ما
       حد يفكّرها بيه. الخفوت كان مناسب لو المالك هو اللي بيستخدمه. */
    b.style.cssText = 'position:fixed; bottom:14px; left:14px; z-index:9998; width:46px; height:46px;'
      + 'border-radius:50%; border:1px solid rgba(232,185,35,.35); background:rgba(20,21,27,.92);'
      + 'color:#E8B923; font-size:20px; cursor:pointer; opacity:.85; transition:opacity .2s;'
      + 'display:flex; align-items:center; justify-content:center; padding:0;';
    b.onmouseenter = function(){ b.style.opacity = '1'; };
    b.onmouseleave = function(){ b.style.opacity = '.85'; };
    // ⚠️ mousedown + preventDefault: عشان الزرار **ميخطفش الفوكس** من
    //    خانة البحث. لو خطفه، هيبقى هو نفسه سبب الباج اللي بيشخّصه.
    b.addEventListener('mousedown', function(e){ e.preventDefault(); });
    b.onclick = function(){ window.bbOpen(); };
    document.body.appendChild(b);
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', mountBtn);
  }else{ mountBtn(); }

  window.addEventListener('beforeunload', persist);
})();
