/* ============================================================
   🖼️ frames.js — نظام الإطارات والتارجت في POS
   ------------------------------------------------------------
   • بيحسب صافي مبيعات كل شيفت النهارده (بعد المرتجعات) وبيقارنه بالتارجت
   • بيكتب حالة الشيفت في pos_test_settings/shift_status_<branch>
     (تطبيق الحضور بيسمعها ويحوّل شاشته)
   • بيعرض الإطارات على صور الموظفين في شاشة الدخول
   • بيحوّل الشاشة الرئيسية بالكامل، وشاشة البيع حسب وضع الأدمن:
     light (شريط + توهج) · full (تحوّل كامل) · off (مقفول)
   ============================================================ */
(function(){
  'use strict';

  var SHIFT_KEYS = ['morning','evening'];
  var SHIFT_LABEL = { morning:'الصباحي 🌅', evening:'المسائي 🌆' };
  var DEFAULT_WIN = { morning:{start:'10:00', end:'18:00'}, evening:{start:'14:00', end:'22:00'} };

  // ---------- أدوات وقت ----------
  function dayKey(d){
    var dt = d ? new Date(d) : new Date();
    return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
  }
  function hm(d){ var x = d||new Date(); return String(x.getHours()).padStart(2,'0')+':'+String(x.getMinutes()).padStart(2,'0'); }
  function inWindow(t, start, end){
    if(!start || !end) return false;
    return end > start ? (t >= start && t < end)          // شيفت عادي جوه نفس اليوم
                       : (t >= start || t < end);          // شيفت بيعدّي نص الليل
  }

  // ---------- 🎯 الحساب (دوال نقية — متغطّاة بالاختبارات) ----------
  // صافي فريق الشيفت: بنستبعد الفاتورة المرتجعة (reversed) وصف العكس (isReversal)
  // عشان التارجت ميتضربش بفاتورة وهمية بترجع بعدين
  function teamNet(rows, teamIds){
    var set = {}; (teamIds||[]).forEach(function(id){ set[id] = 1; });
    return (rows||[]).reduce(function(sum, r){
      if(!r || r.reversed || r.isReversal) return sum;
      if(!set[r.sellerEmployeeId]) return sum;
      return sum + (Number(r.total)||0);
    }, 0);
  }
  // 🧮 عدد القطع المباعة للفريق — نفس قواعد الاستبعاد بالظبط
  // المرتجع جوه الفاتورة (isReturn) بيتخصم، والاستبدال بالنقط (isRedemption) مش قطعة مبيعة
  function teamPieces(rows, teamIds){
    var set = {}; (teamIds||[]).forEach(function(id){ set[id] = 1; });
    return (rows||[]).reduce(function(sum, r){
      if(!r || r.reversed || r.isReversal) return sum;
      if(!set[r.sellerEmployeeId]) return sum;
      return sum + (r.items||[]).reduce(function(n, it){
        if(!it || it.isRedemption) return n;
        var q = Number(it.qty)||0;
        return n + (it.isReturn ? -q : q);
      }, 0);
    }, 0);
  }
  // المقياس حسب نوع التارجت: 'pieces' = قطع · غير كده = فلوس
  function teamMetric(rows, teamIds, metric){
    return metric === 'pieces' ? teamPieces(rows, teamIds) : teamNet(rows, teamIds);
  }
  // فريق الشيفت = موظفي الفرع النشطين اللي شيفتهم كده
  // (اللي غطّى شيفت غير بتاعه بياخد إطار شيفته المسجّل — التغطية بتتحسب في تطبيق الحضور)
  function teamOf(emps, shiftKey){
    return (emps||[]).filter(function(e){ return e && e.active !== false && e.shift === shiftKey; })
                     .map(function(e){ return e.id; });
  }
  // حالة الشيفتات الكاملة — الناتج هو اللي بيتكتب في Firestore
  function computeShiftStatus(rows, emps, cfgByShift, now){
    var out = { dateKey: dayKey(now), updatedAt: Date.now() };
    SHIFT_KEYS.forEach(function(k){
      var c = (cfgByShift && cfgByShift[k]) || {};
      var target = Number(c.target)||0;
      var metric = c.metric === 'pieces' ? 'pieces' : 'amount';
      var team = teamOf(emps, k);
      var net = teamMetric(rows, team, metric);
      out[k] = {
        target: target, net: net, team: team, metric: metric,
        start: c.start || DEFAULT_WIN[k].start,
        end:   c.end   || DEFAULT_WIN[k].end,
        hit: target > 0 && net >= target      // تارجت صفر = الشيفت ده مفيهوش تارجت
      };
    });
    return out;
  }
  // الاحتفالات الشغّالة دلوقتي: التارجت متضروب + إحنا جوه نافذة الشيفت
  function activeCelebrations(stat, now){
    if(!stat || stat.dateKey !== dayKey(now)) return [];
    var t = hm(now);
    return SHIFT_KEYS.filter(function(k){
      var s = stat[k];
      return !!(s && s.hit && inWindow(t, s.start, s.end));
    });
  }

  window.posFrames = {
    dayKey: dayKey, hm: hm, inWindow: inWindow,
    teamNet: teamNet, teamPieces: teamPieces, teamMetric: teamMetric, teamOf: teamOf,
    computeShiftStatus: computeShiftStatus, activeCelebrations: activeCelebrations
  };

  // ============================================================
  //  من هنا وتحت: ربط بالمتصفح (مش بيتنفّذ في الاختبارات)
  // ============================================================
  if(typeof document === 'undefined' || !document.head) return;

  // ---------- CSS ----------
  var st = document.createElement('style');
  st.textContent = [
    /* إطارات صور الموظفين في شاشة الدخول */
    '.emp-pick-tile .av{ position:relative; }',
    '.emp-pick-tile.fr-daily  .av{ box-shadow:0 0 0 3px #22c55e, 0 0 10px #22c55e88; }',
    '.emp-pick-tile.fr-weekly .av{ box-shadow:0 0 0 3px #22c55e, 0 0 0 6px #22c55e44, 0 0 14px #22c55eaa; }',
    '.emp-pick-tile.fr-silver .av{ box-shadow:0 0 0 3px #cbd5e1, 0 0 0 6px #cbd5e155, 0 0 14px #cbd5e1aa; }',
    '.emp-pick-tile.fr-gold   .av{ box-shadow:0 0 0 3px #f59e0b, 0 0 0 6px #f59e0b44, 0 0 16px #f59e0bcc; }',
    '.emp-pick-tile.fr-shift  .av{ box-shadow:0 0 0 3px #f59e0b, 0 0 16px #f59e0bee; animation:pfPulse 1.6s ease-in-out infinite; }',
    '.emp-pick-tile .frSpark{ position:absolute; top:-4px; right:-4px; font-size:12px; }',
    '@keyframes pfPulse{ 0%,100%{filter:brightness(1);} 50%{filter:brightness(1.35);} }',
    /* الشريط العلوي — بيظهر في كل الأوضاع ما عدا off */
    '#pfBar{ position:fixed; top:0; left:0; right:0; height:6px; z-index:9997; display:none;',
    '  background:linear-gradient(90deg,#b45309,#f59e0b,#fcd34d,#f59e0b,#b45309); background-size:200% 100%;',
    '  animation:pfBar 2.5s linear infinite; }',
    '@keyframes pfBar{ 0%{background-position:0 0;} 100%{background-position:200% 0;} }',
    'body.pf-on #pfBar{ display:block; }',
    /* البانر اللحظي (8 ثواني) */
    '#pfBanner{ position:fixed; top:14px; left:50%; transform:translateX(-50%); z-index:9999; display:none;',
    '  background:linear-gradient(90deg,#b45309,#f59e0b,#b45309); color:#1a1200; font-weight:900;',
    '  padding:10px 24px; border-radius:99px; font-size:15px; box-shadow:0 6px 26px #f59e0b99; }',
    /* الشاشة الرئيسية: تحوّل كامل دايمًا */
    'body.pf-on #dashboardScreen{ background:radial-gradient(900px 400px at 50% -80px, #f59e0b26, transparent 70%); }',
    'body.pf-on #dashboardScreen::before{ content:attr(data-pf-msg); display:block; margin:0 0 10px; text-align:center;',
    '  font-weight:900; color:#f59e0b; font-size:15px; }',
    /* شاشة البيع: توهج إطاري فقط (وضع light) — منطقة الأرقام مش بتتلمس */
    'body.pf-sale-light #saleScreen{ box-shadow: inset 0 0 0 3px #f59e0baa, inset 0 0 26px #f59e0b33; border-radius:12px; }',
    /* شاشة البيع: تحوّل كامل (وضع full) */
    'body.pf-sale-full #saleScreen{ background:radial-gradient(900px 400px at 50% -60px, #f59e0b2e, transparent 70%);',
    '  box-shadow: inset 0 0 0 3px #f59e0bcc, inset 0 0 30px #f59e0b44; border-radius:12px; }'
  ].join('\n');
  document.head.appendChild(st);

  var bar = document.createElement('div'); bar.id = 'pfBar'; document.body.appendChild(bar);
  var banner = document.createElement('div'); banner.id = 'pfBanner'; document.body.appendChild(banner);

  // ---------- الحالة ----------
  var state = { status:null, cfg:null, mode:'light', lastHitSig:'' };

  function saleMode(){ return state.mode || 'light'; }

  function applyVisuals(){
    var act = activeCelebrations(state.status, new Date());
    var on = act.length > 0;
    document.body.classList.toggle('pf-on', on);
    document.body.classList.toggle('pf-sale-light', on && saleMode() === 'light');
    document.body.classList.toggle('pf-sale-full',  on && saleMode() === 'full');

    var dash = document.getElementById('dashboardScreen');
    if(dash){
      if(on){
        var names = act.map(function(k){ return SHIFT_LABEL[k]; }).join(' + ');
        dash.setAttribute('data-pf-msg', '🎯 شيفت ' + names + ' ضرب التارجت — الشاشة ليكم لآخر الشيفت');
      } else { dash.removeAttribute('data-pf-msg'); }
    }

    // بانر لحظي مرة واحدة لكل تحقيق
    var sig = act.join(',') + '|' + (state.status ? state.status.dateKey : '');
    if(on && sig !== state.lastHitSig){
      state.lastHitSig = sig;
      banner.textContent = '🎯 مبروك! التارجت اتضرب';
      banner.style.display = 'block';
      setTimeout(function(){ banner.style.display = 'none'; }, 8000);
    }
    if(!on) state.lastHitSig = '';

    decorateLoginTiles();
  }

  // ---------- إطارات شاشة الدخول ----------
  function decorFor(e){
    var f = (e && e.frames) || {};
    var act = activeCelebrations(state.status, new Date());
    var inParty = act.some(function(k){
      return ((state.status[k] || {}).team || []).indexOf(e.id) >= 0;
    });
    var cls = '';
    if(inParty) cls = 'fr-shift';
    else if(f.streak && (Number(f.streak.count)||0) >= 8) cls = 'fr-gold';
    else if(f.streak && (Number(f.streak.count)||0) >= 4) cls = 'fr-silver';
    else if(f.weekly && f.weekly.clean) cls = 'fr-weekly';
    var daily = !!(f.daily && f.daily.clean && f.daily.date === dayKey());
    if(daily && !cls) cls = 'fr-daily';
    return { cls: cls, spark: (daily && cls !== 'fr-daily') };
  }
  function decorateLoginTiles(){
    var tiles = document.querySelectorAll('.emp-pick-tile[data-emp-id]');
    if(!tiles.length) return;
    var emps = window._pfEmployees || [];
    Array.prototype.forEach.call(tiles, function(tile){
      var e = emps.filter(function(x){ return x.id === tile.getAttribute('data-emp-id'); })[0];
      tile.classList.remove('fr-daily','fr-weekly','fr-silver','fr-gold','fr-shift');
      if(!e) return;
      var d = decorFor(e);
      if(d.cls) tile.classList.add(d.cls);
      var av = tile.querySelector('.av');
      if(av){
        var old = av.querySelector('.frSpark');
        if(d.spark && !old){ var s = document.createElement('div'); s.className = 'frSpark'; s.textContent = '⚡'; av.appendChild(s); }
        if(!d.spark && old) old.remove();
      }
    });
  }
  window.pfDecorateLoginTiles = decorateLoginTiles;

  // ---------- الوصول للمتغيرات العامة ----------
  // ⚠️ pos-core.js معرّف db و currentBranch بـ const/let — دول مش بيتحطوا على window،
  // لكن بيتحطوا في الـ global lexical scope اللي كل ملفات الـ classic scripts بتشوفه.
  // فبنقراهم بالاسم مباشرة مع fallback على window (لو اتعرضوا هناك في المستقبل).
  function getDb(){
    try{ if(typeof db !== 'undefined' && db) return db; }catch(e){}
    return window.db || null;
  }
  function branch(){
    try{ if(typeof currentBranch !== 'undefined' && currentBranch) return currentBranch; }catch(e){}
    return window.currentBranch || null;
  }

  // 🩺 تشخيص سريع: اكتب pfDiag() في الـ console لو مفيش حاجة ظاهرة
  window.pfDiag = async function(){
    var b = branch(), D = getDb();
    console.log('الفرع:', b || '❌ مش متعرّف');
    console.log('قاعدة البيانات:', D ? '✅' : '❌');
    if(!b || !D) return;
    var cfgDoc = await D.collection('pos_test_settings').doc('shift_targets').get();
    var cfg = cfgDoc.exists ? ((cfgDoc.data().byBranch||{})[b]) : null;
    console.log('تارجت الشيفتات للفرع ده:', cfg || '❌ مش متحفوظ — احفظه من شاشة الأدمن');
    var empSnap = await D.collection('sales_employees').where('branch','==', b).get();
    var emps = empSnap.docs.map(function(d){ var o=d.data(); o.id=d.id; return o; });
    console.log('عدد الموظفين:', emps.length);
    console.log('فريق الصبح:', teamOf(emps,'morning'), '· فريق المسا:', teamOf(emps,'evening'));
    var noShift = emps.filter(function(e){ return e.active !== false && e.shift !== 'morning' && e.shift !== 'evening'; });
    if(noShift.length) console.warn('⚠️ موظفين من غير شيفت محدد (مش هياخدوا إطار الشيفت):',
      noShift.map(function(e){ return e.name + ' → shift=' + JSON.stringify(e.shift); }));
    if(state.status){
      ['morning','evening'].forEach(function(k){
        var x = state.status[k]; if(!x) return;
        var unit = x.metric === 'pieces' ? 'قطعة' : 'ج.م';
        console.log((k==='morning'?'🌅 الصباحي':'🌆 المسائي') + ':', x.net + ' ' + unit + ' من ' + x.target + ' ' + unit,
                    x.hit ? '✅ متضروب' : '⏳ لسه');
      });
    }
    console.log('الحالة المحسوبة دلوقتي:', state.status);
    console.log('الاحتفالات الشغالة:', activeCelebrations(state.status, new Date()));
    console.log('وضع شاشة البيع:', state.mode);
  };

  async function refreshStatus(){
    try{
      var b = branch(); var D = getDb();
      if(!b || !D){ console.warn('🖼️ frames: الفرع أو قاعدة البيانات لسه مش جاهزين'); return; }
      var cfgDoc = await D.collection('pos_test_settings').doc('shift_targets').get();
      var byBranch = cfgDoc.exists ? (cfgDoc.data().byBranch || {}) : {};
      var cfg = byBranch[b] || null;
      var modeDoc = await D.collection('pos_test_settings').doc('frames_cfg').get();
      state.mode = (modeDoc.exists && modeDoc.data().posSaleMode) || 'light';
      if(!cfg){ state.status = null; applyVisuals(); return; }

      var start = new Date(); start.setHours(0,0,0,0);
      var snap = await D.collection('pos_test_sales')
        .where('createdAt','>=', firebase.firestore.Timestamp.fromDate(start)).get();
      var rows = snap.docs.map(function(d){ return d.data(); });

      var empSnap = await D.collection('sales_employees').where('branch','==', b).get();
      var emps = empSnap.docs.map(function(d){ var o = d.data(); o.id = d.id; return o; });
      window._pfEmployees = emps;

      var stat = computeShiftStatus(rows, emps, cfg, new Date());
      state.status = stat;
      // الكتابة بس لما تتغير (توفير عمليات)
      var sig = JSON.stringify([stat.dateKey, stat.morning.hit, stat.morning.net, stat.evening.hit, stat.evening.net]);
      if(sig !== state._wsig){
        state._wsig = sig;
        D.collection('pos_test_settings').doc('shift_status_' + b).set(stat, { merge:false })
          .catch(function(e){ console.warn('shift status write', e); });
      }
      applyVisuals();
    }catch(e){ console.warn('posFrames refresh', e); }
  }

  setTimeout(refreshStatus, 3000);
  setInterval(refreshStatus, 30000);      // تحديث الصافي كل نص دقيقة
  setInterval(applyVisuals, 30000);       // نهاية نافذة الشيفت بتطفّي الاحتفال لوحدها
  window.pfRefreshStatus = refreshStatus;
})();
