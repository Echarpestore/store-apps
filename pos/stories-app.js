/* ============================================================
   📸 stories-app.js — v2 — الستوري و«مختارة ليكي» و🎬 الفيديوهات في تطبيق العميلات
   ------------------------------------------------------------
   · مقفول لحد ما المالك يفتحه من Office 2 (pos_test_settings/stories_cfg → live_<براند>).
   · الستوري = اللي المالك وافق عليها النهارده · «مختارة ليكي» = اللي علّم عليها «تظهر في الرئيسية».
   · «جرّبيها عليكي» بتفتح نفس تجربة الطرحة بتاعة الشات (tryonOverlayOpen) بصورة الستوري.
   · بيقرا مرة واحدة لكل فتحة تطبيق (استعلامين صغيرين — الصور الكبيرة بتتحمّل لما تتفتح بس).
   الاستعمال: StoriesApp.init(db, 'echarpe', rerender) · storiesHtml() · homeHtml()
   ============================================================ */
(function(){
'use strict';
var S = { db:null, brand:'echarpe', rerender:null, live:false, loaded:false, stories:[], home:[], videos:[], idx:0, list:[], timer:null, start:0, paused:0, imgs:{}, seen:{} };
var DUR = 5500, SEEN_KEY = 'stories_seen_v1';
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
try{ S.seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; }catch(e){ S.seen = {}; }
function markSeen(id){ S.seen[id] = Date.now(); try{ var keep = {}; Object.keys(S.seen).sort(function(a, b){ return S.seen[b] - S.seen[a]; }).slice(0, 80).forEach(function(k){ keep[k] = S.seen[k]; }); localStorage.setItem(SEEN_KEY, JSON.stringify(keep)); }catch(e){} }

function init(db, brand, rerender, preview){
  S.db = db; S.brand = brand || 'echarpe'; S.rerender = rerender || null; css();
  /* 👀 رقم تجربة (علامة mxPreview على مستند العميلة من Office 2): بتشوف الستوري قبل ما المالك يفتحها للكل */
  S.preview = preview === true;
  db.collection('pos_test_settings').doc('stories_cfg').get().then(function(d){
    var c = d.exists ? (d.data() || {}) : {};
    S.live = c['live_' + S.brand] === true || S.preview;
    if(S.preview && S.rerender) S.rerender();
    if(!S.live){ S.loaded = true; return; }
    return Promise.all([
      db.collection('app_stories').where('status', '==', 'published').where('brand', '==', S.brand).limit(20).get(),
      db.collection('app_stories').where('homeFeed', '==', S.brand).limit(40).get()
    ]).then(function(r){
      var map = function(s){ return s.docs.map(function(x){ return Object.assign({ id: x.id }, x.data()); }); };
      S.stories = map(r[0]).sort(function(a, b){ return (a.approvedAt || 0) - (b.approvedAt || 0); });
      var hf = map(r[1]).sort(function(a, b){ return (b.approvedAt || 0) - (a.approvedAt || 0); });
      // 🎬 الفيديوهات القصيرة (kind:'video') ليها صف لوحدها — والباقي «مختارة ليكي»
      S.videos = hf.filter(function(x){ return x.kind === 'video' && x.videoUrl; });
      S.home = hf.filter(function(x){ return x.kind !== 'video'; });
      S.loaded = true; if(S.rerender) S.rerender();
    });
  }).catch(function(e){ S.loaded = true; console.warn('stories', e && e.code); });
}

/* ---------- 🧱 الأجزاء جوه «بطاقتي» ---------- */
function storiesHtml(){
  if(!S.live || !S.stories.length) return '';
  var unseen = S.stories.filter(function(s){ return !S.seen[s.id]; }).length;
  return '<div class="stv-sec"><div class="stv-h"><b>جديد ' + (S.brand === 'glow' ? 'Glow' : 'إيشارب') + '</b>' + (unseen ? '<span>' + unseen + ' جديدة</span>' : '') + '</div><div class="stv-row">'
    + S.stories.map(function(s, i){ return '<button class="stv-b' + (S.seen[s.id] ? ' seen' : '') + '" onclick="StoriesApp.open(' + i + ')"><span class="stv-ring"><img src="' + s.thumb + '" alt=""></span><small>' + esc(s.title) + '</small></button>'; }).join('')
    + '</div></div>';
}
function homeHtml(){
  if(!S.live) return '';
  return videosHtml() + (S.home.length ? homeRail() : '');
}
function homeRail(){
  return '<div class="stv-sec"><div class="stv-h"><b>مختارة ليكي</b><span>اسحبي ←</span></div><div class="stv-rail">'
    + S.home.map(function(s, i){ var sold = s.online === true && !(Number(s.qtyLeft) > 0); return '<button class="stv-look' + (sold ? ' sold' : '') + '" onclick="StoriesApp.openHome(' + i + ')"><span class="stv-fr"><img src="' + s.thumb + '" alt="" data-stv-home="' + esc(s.id) + '">' + (sold ? '<i>اتباعت</i>' : (s.online === true ? '<i class="on">قطعة واحدة</i>' : '')) + '</span><b>' + esc(s.title || s.productName) + '</b>' + (s.price ? '<small>' + esc(s.price) + ' ج.م</small>' : '') + '</button>'; }).join('')
    + '</div></div>';
}


/* ============================================================
   🎬 الفيديوهات القصيرة (قرار المالك 15-10-2026)
   · صف «فيديوهات» في «بطاقتي» → بتفتح شاشة بالطول زي الريلز (تقلّبي لفوق)
   · على كل فيديو: «اشتريها» بالعدد اللي فاضل (حجز للقطعة — استلام من الفرع أو توصيل)
     ولو مفيش عدد: «اسألي عليها في الشات» · خلصت = «اتباعت»
   ============================================================ */
function videosHtml(){
  if(!S.videos.length) return '';
  rvCss();
  return '<div class="stv-sec"><div class="stv-h"><b>🎬 فيديوهات</b><span>اتفرّجي واشتري</span></div><div class="rv-rail">'
    + S.videos.map(function(v, i){
        var piece = v.online === true, left = Number(v.qtyLeft) || 0;
        var tag = piece ? (left > 0 ? '<i class="on">فاضل ' + left + '</i>' : '<i>اتباعت</i>') : '';
        return '<button class="rv-card' + (piece && left <= 0 ? ' sold' : '') + '" onclick="StoriesApp.openVideo(' + i + ')"><span class="rv-th">' + (v.thumb ? '<img src="' + v.thumb + '" alt="">' : '') + '<em>▶</em>' + tag + '</span><b>' + esc(v.title || v.productName) + '</b>' + (v.price ? '<small>' + esc(v.price) + ' ج.م</small>' : '') + '</button>';
      }).join('')
    + '</div></div>';
}
function rvCss(){
  if(document.getElementById('rvCss')) return;
  var c = document.createElement('style'); c.id = 'rvCss';
  c.textContent = '.rv-rail{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;scrollbar-width:none;scroll-snap-type:x mandatory}.rv-rail::-webkit-scrollbar{display:none}'
    + '.rv-card{flex:0 0 116px;scroll-snap-align:start;border:0;background:none;padding:0;text-align:right;cursor:pointer;display:flex;flex-direction:column;gap:4px;font:inherit;color:inherit}'
    + '.rv-th{position:relative;display:block;height:206px;border-radius:16px;overflow:hidden;background:#1a1214}.rv-th img{width:100%;height:100%;object-fit:cover}'
    + '.rv-th em{position:absolute;inset:0;display:grid;place-items:center;font-style:normal;color:#fff;font-size:26px;text-shadow:0 2px 10px rgba(0,0,0,.5)}'
    + '.rv-th i{position:absolute;top:8px;right:8px;font-style:normal;font-size:11px;font-weight:800;background:rgba(20,16,18,.78);color:#fff;border-radius:10px;padding:3px 8px}.rv-th i.on{background:rgba(255,255,255,.94);color:#1F161A}'
    + '.rv-card.sold img{filter:grayscale(.7);opacity:.7}.rv-card b{font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rv-card small{font-size:12px;color:var(--muted,#8a7f85)}'
    + '#rvWrap{position:fixed;inset:0;z-index:99991;background:#000;color:#fff;display:none}#rvWrap.on{display:block}'
    + '#rvScroll{position:absolute;inset:0;overflow-y:auto;scroll-snap-type:y mandatory;scrollbar-width:none;overscroll-behavior:contain}#rvScroll::-webkit-scrollbar{display:none}'
    + '.rv-sl{position:relative;height:100%;width:100%;scroll-snap-align:start;scroll-snap-stop:always;overflow:hidden;background:#000}'
    + '.rv-sl video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000}'
    + '.rv-sh{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.4),rgba(0,0,0,0) 20%,rgba(0,0,0,0) 52%,rgba(0,0,0,.78));pointer-events:none}'
    + '.rv-pz{position:absolute;inset:0;display:grid;place-items:center;font-size:56px;opacity:0;transition:opacity .2s;pointer-events:none;text-shadow:0 4px 18px rgba(0,0,0,.5)}.rv-sl.paused .rv-pz{opacity:.9}'
    + '.rv-cp{position:absolute;inset-inline:20px;bottom:calc(150px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:4px;pointer-events:none}.rv-cp h3{margin:0;font-size:24px;font-weight:800;line-height:1.25}.rv-cp p{margin:0;font-size:14px;opacity:.92}'
    + '.rv-acts{position:absolute;inset-inline:20px;bottom:calc(28px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:8px}'
    + '.rv-buy{height:56px;border-radius:28px;border:0;background:#fff;color:#1F161A;font:800 16px inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}.rv-buy[disabled]{background:rgba(255,255,255,.25);color:#fff;cursor:default}'
    + '.rv-buy.chat{background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.55)}'
    + '.rv-how{font-size:12px;opacity:.88;text-align:center;line-height:1.7}'
    + '.rv-top{position:absolute;top:calc(14px + env(safe-area-inset-top,0px));inset-inline:12px;display:flex;justify-content:space-between;align-items:center;z-index:3;pointer-events:none}'
    + '.rv-top button{pointer-events:auto;width:44px;height:44px;border-radius:50%;border:0;background:rgba(0,0,0,.35);color:#fff;font-size:19px;cursor:pointer}'
    + '.rv-left{font-size:12px;font-weight:800;background:rgba(255,255,255,.92);color:#1F161A;border-radius:12px;padding:4px 10px;align-self:flex-start}';
  document.head.appendChild(c);
}
var RV = { i:0, muted:false, io:null };
function rvEnsure(){
  rvCss();
  var w = document.getElementById('rvWrap'); if(w) return w;
  w = document.createElement('div'); w.id = 'rvWrap'; w.setAttribute('role', 'dialog');
  w.innerHTML = '<div id="rvScroll"></div><div class="rv-top"><button onclick="StoriesApp.closeVideo()" aria-label="إغلاق">✕</button><button id="rvMute" onclick="StoriesApp.muteVideo()" aria-label="الصوت">🔊</button></div>';
  document.body.appendChild(w);
  return w;
}
function rvSlide(v, i){
  var piece = v.online === true, left = Number(v.qtyLeft) || 0, btn, how = '';
  if(piece && left > 0){ btn = '<button class="rv-buy" onclick="StoriesApp.buyVideo(' + i + ')">🛒 اشتريها' + (v.price ? ' · ' + esc(v.price) + ' ج.م' : '') + '</button>'; how = '<div class="rv-how">دوسي «اشتريها» ← اختاري استلام من الفرع أو توصيل للبيت ← أكّدي الطلب · الدفع وانتي بتستلمي</div>'; }
  else if(piece) btn = '<button class="rv-buy" disabled>اتباعت 💔</button>';
  else btn = typeof window.openChat === 'function' ? '<button class="rv-buy chat" onclick="StoriesApp.askVideo(' + i + ')">💬 اسألي عليها في الشات</button>' : '';
  return '<section class="rv-sl" data-i="' + i + '"><video playsinline loop preload="none"' + (v.thumb ? ' poster="' + v.thumb + '"' : '') + ' data-src="' + esc(v.videoUrl) + '"></video>'
    + '<div class="rv-sh"></div><div class="rv-pz">▶</div>'
    + '<div class="rv-cp">' + (piece && left > 0 ? '<span class="rv-left">' + (left === 1 ? 'آخر قطعة 🔥' : 'فاضل ' + left) + '</span>' : '') + '<h3>' + esc(v.title || v.productName) + '</h3>' + (v.price ? '<p>' + esc(v.price) + ' ج.م</p>' : '') + '</div>'
    + '<div class="rv-acts">' + btn + how + '</div></section>';
}
function openVideo(i){
  var w = rvEnsure(), box = document.getElementById('rvScroll');
  box.innerHTML = S.videos.map(rvSlide).join('');
  w.classList.add('on');
  try{ document.body.style.overflow = 'hidden'; }catch(e){}
  box.querySelectorAll('.rv-sl').forEach(function(sl){
    sl.onclick = function(e){ if(e.target.closest('button')) return; var vd = sl.querySelector('video'); if(vd.paused){ vd.play().catch(function(){}); sl.classList.remove('paused'); } else { vd.pause(); sl.classList.add('paused'); } };
  });
  if(RV.io) RV.io.disconnect();
  RV.io = 'IntersectionObserver' in window ? new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting && e.intersectionRatio > 0.6) rvPlay(Number(e.target.dataset.i)); }); }, { root: box, threshold: [0.6] }) : null;
  if(RV.io) box.querySelectorAll('.rv-sl').forEach(function(sl){ RV.io.observe(sl); });
  var target = box.querySelector('.rv-sl[data-i="' + i + '"]'); if(target) box.scrollTop = target.offsetTop;
  rvPlay(i);
}
function rvPlay(i){
  RV.i = i; var box = document.getElementById('rvScroll'); if(!box) return;
  box.querySelectorAll('.rv-sl').forEach(function(sl){
    var k = Number(sl.dataset.i), vd = sl.querySelector('video');
    if(Math.abs(k - i) <= 1 && !vd.getAttribute('src')){ vd.src = vd.dataset.src; vd.preload = 'auto'; }   // الحالي واللي جنبه بس
    if(k === i){
      vd.muted = RV.muted; sl.classList.remove('paused');
      var pr = vd.play(); if(pr && pr.catch) pr.catch(function(){ vd.muted = true; RV.muted = true; rvMuteIcon(); vd.play().catch(function(){ sl.classList.add('paused'); }); });
      markSeen(S.videos[k] && S.videos[k].id);
    }else if(!vd.paused){ vd.pause(); }
  });
  rvMuteIcon();
}
function rvMuteIcon(){ var b = document.getElementById('rvMute'); if(b) b.textContent = RV.muted ? '🔇' : '🔊'; }
function muteVideo(){ RV.muted = !RV.muted; var vd = document.querySelector('#rvScroll .rv-sl[data-i="' + RV.i + '"] video'); if(vd){ vd.muted = RV.muted; if(vd.paused) vd.play().catch(function(){}); } rvMuteIcon(); }
function closeVideo(){
  var w = document.getElementById('rvWrap'); if(!w) return;
  w.querySelectorAll('video').forEach(function(vd){ try{ vd.pause(); vd.removeAttribute('src'); vd.load(); }catch(e){} });
  if(RV.io){ RV.io.disconnect(); RV.io = null; }
  w.classList.remove('on'); try{ document.body.style.overflow = ''; }catch(e){}
}
function buyVideo(i){ var v = S.videos[i]; if(!v) return; closeVideo(); orderItem(v, v.thumb, 'القطعة اللي في الفيديو'); }
function askVideo(i){ var v = S.videos[i]; if(!v) return; closeVideo(); askItem(v, v.thumb); }

/* ---------- 📺 العارض ---------- */
function css(){
  if(document.getElementById('stvCss')) return;
  var c = document.createElement('style'); c.id = 'stvCss';
  c.textContent = '.stv-sec{margin:18px 0 4px}.stv-h{display:flex;justify-content:space-between;align-items:baseline;margin:0 2px 10px}.stv-h b{font-size:16px;font-weight:800}.stv-h span{font-size:12px;color:var(--muted,#8a7f85)}'
    + '.stv-row{display:flex;gap:14px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:none}.stv-row::-webkit-scrollbar{display:none}'
    + '.stv-b{flex:0 0 auto;width:74px;border:0;background:none;padding:0;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;font:inherit;color:inherit}'
    + '.stv-ring{position:relative;width:70px;height:70px;border-radius:50%;padding:3px;background:conic-gradient(from 0deg,var(--pink,#E2457F),#E5A65E,var(--pink,#E2457F))}.stv-b.seen .stv-ring{background:var(--line,#e8dde2)}'
    + '.stv-ring img{width:100%;height:100%;border-radius:50%;object-fit:cover;border:3px solid var(--bg,#fff);box-sizing:border-box;display:block}'
    + '.stv-b small{font-size:11px;max-width:74px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.stv-rail{display:flex;gap:12px;overflow-x:auto;padding-bottom:6px;scroll-snap-type:x mandatory;scrollbar-width:none}.stv-rail::-webkit-scrollbar{display:none}'
    + '.stv-look{flex:0 0 150px;scroll-snap-align:start;border:0;background:none;padding:0;text-align:right;cursor:pointer;display:flex;flex-direction:column;gap:5px;font:inherit;color:inherit}'
    + '.stv-fr{position:relative;}.stv-fr i{position:absolute;top:8px;right:8px;font-style:normal;font-size:11px;font-weight:800;background:rgba(20,16,18,.78);color:#fff;border-radius:10px;padding:3px 8px}.stv-fr i.on{background:rgba(255,255,255,.92);color:#1F161A}.stv-look.sold img{filter:grayscale(.7);opacity:.7}'
    + '#stvWrap .buy{background:#fff!important;color:#1F161A!important;flex:1!important;border:0!important}#stvWrap .cart[disabled]{opacity:.7}'
    + '.stv-fr{display:block;height:190px;border-radius:16px;overflow:hidden;background:var(--pink-soft,#fbe9ef)}.stv-fr img{width:100%;height:100%;object-fit:cover}.stv-look b{font-size:13px;font-weight:700}.stv-look small{font-size:12px;color:var(--muted,#8a7f85)}'
    + '#stvWrap{position:fixed;inset:0;z-index:99990;background:#0e0a0c;color:#fff;display:none;user-select:none;-webkit-user-select:none}#stvWrap.on{display:block}'
    + '#stvWrap .m{position:absolute;inset:0;overflow:hidden}#stvWrap .m img{width:100%;height:100%;object-fit:cover;transform-origin:50% 40%}'
    + '#stvWrap .sh{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.45),rgba(0,0,0,0) 22%,rgba(0,0,0,0) 50%,rgba(0,0,0,.72));pointer-events:none}'
    + '#stvWrap .bars{position:absolute;top:calc(12px + env(safe-area-inset-top,0px));inset-inline:12px;display:flex;gap:4px;z-index:3}#stvWrap .bars i{flex:1;height:2px;border-radius:2px;background:rgba(255,255,255,.35);overflow:hidden}#stvWrap .bars b{display:block;height:100%;background:#fff;transform:scaleX(0);transform-origin:right}'
    + '#stvWrap .hd{position:absolute;top:calc(22px + env(safe-area-inset-top,0px));inset-inline:12px;display:flex;align-items:center;justify-content:flex-end;z-index:4}#stvWrap .x{width:44px;height:44px;border:0;background:none;color:#fff;font-size:22px;cursor:pointer}'
    + '#stvWrap .tap{position:absolute;top:80px;bottom:130px;width:50%;border:0;background:none;z-index:2;cursor:pointer}#stvWrap .pv{right:0}#stvWrap .nx{left:0}'
    + '#stvWrap .cp{position:absolute;inset-inline:22px;bottom:calc(112px + env(safe-area-inset-bottom,0px));z-index:3;display:flex;flex-direction:column;gap:6px;pointer-events:none}#stvWrap .cp h3{margin:0;font-size:30px;font-weight:800;line-height:1.2}#stvWrap .cp p{margin:0;font-size:14px;opacity:.9}'
    + '#stvWrap .acts{position:absolute;inset-inline:22px;bottom:calc(34px + env(safe-area-inset-bottom,0px));z-index:3;display:flex;gap:10px}'
    + '#stvWrap .acts button{flex:1;height:54px;border-radius:27px;border:0;font:800 15px inherit;cursor:pointer}#stvWrap .try{background:rgba(255,255,255,.96);color:#1F161A}#stvWrap .cart{background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(255,255,255,.5)!important;flex:0 0 auto!important;padding:0 18px}';
  document.head.appendChild(c);
}
function ensureView(){
  var w = document.getElementById('stvWrap'); if(w) return w;
  w = document.createElement('div'); w.id = 'stvWrap'; w.setAttribute('role', 'dialog');
  w.innerHTML = '<div class="m" id="stvM"></div><div class="sh"></div><div class="bars" id="stvBars"></div><div class="hd"><button class="x" onclick="StoriesApp.close()" aria-label="إغلاق">✕</button></div>'
    + '<button class="tap pv" id="stvPv" aria-label="السابق"></button><button class="tap nx" id="stvNx" aria-label="التالي"></button>'
    + '<div class="cp"><h3 id="stvT"></h3><p id="stvS"></p></div><div class="acts" id="stvA"></div>';
  document.body.appendChild(w);
  var down = 0, long = false;
  [['stvPv', -1], ['stvNx', 1]].forEach(function(x){ var el = document.getElementById(x[0]);
    el.onpointerdown = function(){ down = Date.now(); long = false; pause(true); };
    el.onpointerup = el.onpointercancel = el.onpointerleave = function(){ if(down){ long = Date.now() - down > 280; down = 0; pause(false); } };
    el.onclick = function(){ if(long){ long = false; return; } go(S.idx + x[1]); };
  });
  return w;
}
function open(i){ S.list = S.stories; showAt(i); }
function openHome(i){ S.list = [S.home[i]]; showAt(0); }
function showAt(i){
  var w = ensureView(); w.classList.add('on');
  document.getElementById('stvBars').innerHTML = S.list.map(function(){ return '<i><b></b></i>'; }).join('');
  go(i);
}
function go(i){
  if(i < 0) i = 0; if(i >= S.list.length){ close(); return; }
  S.idx = i; var s = S.list[i]; clearTimeout(S.timer);
  var bars = document.querySelectorAll('#stvBars b'); bars.forEach(function(b, k){ b.style.transition = 'none'; b.style.transform = 'scaleX(' + (k < i ? 1 : 0) + ')'; });
  var m = document.getElementById('stvM'); m.innerHTML = '<img src="' + (S.imgs[s.id] || s.thumb) + '" alt="">';
  var img = m.querySelector('img'); img.style.transform = 'scale(1.12)'; img.style.transition = 'transform ' + DUR + 'ms ease-out'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ img.style.transform = 'scale(1)'; }); });
  if(!S.imgs[s.id]) S.db.collection('app_story_images').doc(s.id).get().then(function(d){ if(d.exists && d.data().img){ S.imgs[s.id] = d.data().img; if(S.list[S.idx] === s){ var im = document.querySelector('#stvM img'); if(im) im.src = S.imgs[s.id]; } } }).catch(function(){});
  var nx = S.list[i + 1]; if(nx && !S.imgs[nx.id]) S.db.collection('app_story_images').doc(nx.id).get().then(function(d){ if(d.exists && d.data().img) S.imgs[nx.id] = d.data().img; }).catch(function(){});
  document.getElementById('stvT').textContent = s.title || ''; document.getElementById('stvS').textContent = s.subtitle || (s.price ? s.price + ' ج.م' : '');
  var piece = s.online === true, left = Number(s.qtyLeft) || 0;
  document.getElementById('stvA').innerHTML = (s.tryable !== false ? '<button class="try" onclick="StoriesApp.tryOn()">✨ جرّبيها عليكي</button>' : '')
    // 🛒 بعدد محدد (المالك حدد العدد) = طلب مباشر بحجز · غير كده = 💬 من الشات (الموظفة تتأكد إنها موجودة الأول)
    + (piece ? (left > 0 ? '<button class="cart buy" onclick="StoriesApp.order()">🛒 اطلبيها</button>' : '<button class="cart" disabled>اتباعت 💔</button>')
      : (typeof window.openChat === 'function' ? '<button class="cart buy" onclick="StoriesApp.ask()">💬 اطلبيها من الشات</button>' : ''));
  markSeen(s.id);
  var bar = bars[i]; if(bar){ requestAnimationFrame(function(){ bar.style.transition = 'transform ' + DUR + 'ms linear'; bar.style.transform = 'scaleX(1)'; }); }
  S.start = Date.now(); S.left = DUR; S.timer = setTimeout(function(){ go(S.idx + 1); }, DUR);
}
function pause(p){
  var bar = document.querySelectorAll('#stvBars b')[S.idx]; if(!bar) return;
  if(p){ clearTimeout(S.timer); S.left = Math.max(0, S.left - (Date.now() - S.start)); var k = 1 - S.left / DUR; bar.style.transition = 'none'; bar.style.transform = 'scaleX(' + k + ')'; }
  else { S.start = Date.now(); bar.style.transition = 'transform ' + S.left + 'ms linear'; bar.style.transform = 'scaleX(1)'; S.timer = setTimeout(function(){ go(S.idx + 1); }, S.left); }
}
function close(){ clearTimeout(S.timer); var w = document.getElementById('stvWrap'); if(w) w.classList.remove('on'); if(S.rerender) S.rerender(); }
function isOpen(){ var w = document.getElementById('stvWrap'); return !!(w && w.classList.contains('on')); }
function tryOn(){
  var s = S.list[S.idx]; if(!s) return; pause(true);
  try{
    sessionStorage.setItem('echarpe_tryon_img', S.imgs[s.id] || s.thumb);
    sessionStorage.setItem('echarpe_tryon_phone', (window.currentCustomer && window.currentCustomer.phone) || '');
    if(s.barcode) sessionStorage.setItem('echarpe_tryon_pid', s.barcode); else sessionStorage.removeItem('echarpe_tryon_pid');
    sessionStorage.removeItem('echarpe_tryon_bandana_colors'); sessionStorage.removeItem('echarpe_tryon_bandana_pid');
  }catch(e){}
  close();
  if(typeof window.tryonOverlayOpen === 'function') window.tryonOverlayOpen(S.brand === 'glow' ? 'glow' : 'loyalty');
}
/* 📸 قطعة الصورة: السلة بتشيل رقم القطعة، والفرع بيتظبط على فرعها — والسيرفر بيحجزها */
function order(){
  var s = S.list[S.idx]; if(!s) return;
  close(); orderItem(s, S.imgs[s.id] || s.thumb, 'القطعة اللي في الصورة');
}
function orderItem(s, img, label){
  if(!s || !s.barcode || !(Number(s.qtyLeft) > 0)) return;
  window._cartPieces = window._cartPieces || {}; window._cartPieces[s.barcode] = s.id;
  try{ if(s.pieceBranch && typeof window.shopSetBranch === 'function') window.shopSetBranch(s.pieceBranch); else if(s.pieceBranch) window._shopBranch = s.pieceBranch; }catch(e){}
  window.tryonAddToCart(s.barcode, img, label);
}
/* 💬 الطلب من الشات: صورة الطرحة + رسالة جاهزة — العميلة تبعتها والموظفة تتأكد من الرف وتبيعها من الشات */
function ask(){
  var s = S.list[S.idx]; if(!s) return;
  var img = S.imgs[s.id] || s.thumb; close(); askItem(s, img);
}
function askItem(s, img){
  try{
    window.openChat();
    setTimeout(function(){
      try{
        window.chatImgData = img;
        var t = document.getElementById('chImgTag'), pv = document.getElementById('chImgPrev'), inp = document.getElementById('chInput');
        if(t) t.src = img; if(pv) pv.style.display = 'flex';
        if(inp && !inp.value.trim()) inp.value = 'عايزة دي 😍 — ' + (s.title || s.productName || '') + (s.barcode ? ' (كود ' + s.barcode + ')' : '') + ' — متاحة؟';
      }catch(e){}
    }, 350);
  }catch(e){}
}
function addCart(){ var s = S.list[S.idx]; if(!s || !s.barcode) return; close(); window.tryonAddToCart(s.barcode, S.imgs[s.id] || s.thumb, ''); }

window.StoriesApp = { ask: ask, order: order, init: init, storiesHtml: storiesHtml, homeHtml: homeHtml, open: open, openHome: openHome, close: close, isOpen: isOpen, tryOn: tryOn, addCart: addCart, openVideo: openVideo, closeVideo: closeVideo, muteVideo: muteVideo, buyVideo: buyVideo, askVideo: askVideo, videosHtml: videosHtml, preview: function(){ return S.preview === true; } };
})();
