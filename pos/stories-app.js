/* ============================================================
   📸 stories-app.js — v1 — الستوري و«مختارة ليكي» في تطبيق العميلات
   ------------------------------------------------------------
   · مقفول لحد ما المالك يفتحه من Office 2 (pos_test_settings/stories_cfg → live_<براند>).
   · الستوري = اللي المالك وافق عليها النهارده · «مختارة ليكي» = اللي علّم عليها «تظهر في الرئيسية».
   · «جرّبيها عليكي» بتفتح نفس تجربة الطرحة بتاعة الشات (tryonOverlayOpen) بصورة الستوري.
   · بيقرا مرة واحدة لكل فتحة تطبيق (استعلامين صغيرين — الصور الكبيرة بتتحمّل لما تتفتح بس).
   الاستعمال: StoriesApp.init(db, 'echarpe', rerender) · storiesHtml() · homeHtml()
   ============================================================ */
(function(){
'use strict';
var S = { db:null, brand:'echarpe', rerender:null, live:false, loaded:false, stories:[], home:[], idx:0, list:[], timer:null, start:0, paused:0, imgs:{}, seen:{} };
var DUR = 5500, SEEN_KEY = 'stories_seen_v1';
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
try{ S.seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; }catch(e){ S.seen = {}; }
function markSeen(id){ S.seen[id] = Date.now(); try{ var keep = {}; Object.keys(S.seen).sort(function(a, b){ return S.seen[b] - S.seen[a]; }).slice(0, 80).forEach(function(k){ keep[k] = S.seen[k]; }); localStorage.setItem(SEEN_KEY, JSON.stringify(keep)); }catch(e){} }

function init(db, brand, rerender){
  S.db = db; S.brand = brand || 'echarpe'; S.rerender = rerender || null; css();
  db.collection('pos_test_settings').doc('stories_cfg').get().then(function(d){
    var c = d.exists ? (d.data() || {}) : {};
    S.live = c['live_' + S.brand] === true;
    if(!S.live){ S.loaded = true; return; }
    return Promise.all([
      db.collection('app_stories').where('status', '==', 'published').where('brand', '==', S.brand).limit(20).get(),
      db.collection('app_stories').where('homeFeed', '==', S.brand).limit(20).get()
    ]).then(function(r){
      var map = function(s){ return s.docs.map(function(x){ return Object.assign({ id: x.id }, x.data()); }); };
      S.stories = map(r[0]).sort(function(a, b){ return (a.approvedAt || 0) - (b.approvedAt || 0); });
      S.home = map(r[1]).sort(function(a, b){ return (b.approvedAt || 0) - (a.approvedAt || 0); });
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
  if(!S.live || !S.home.length) return '';
  return '<div class="stv-sec"><div class="stv-h"><b>مختارة ليكي</b><span>اسحبي ←</span></div><div class="stv-rail">'
    + S.home.map(function(s, i){ return '<button class="stv-look" onclick="StoriesApp.openHome(' + i + ')"><span class="stv-fr"><img src="' + s.thumb + '" alt="" data-stv-home="' + esc(s.id) + '"></span><b>' + esc(s.productName || s.title) + '</b>' + (s.price ? '<small>' + esc(s.price) + ' ج.م</small>' : '') + '</button>'; }).join('')
    + '</div></div>';
}

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
  document.getElementById('stvA').innerHTML = (s.tryable !== false ? '<button class="try" onclick="StoriesApp.tryOn()">✨ جرّبيها عليكي</button>' : '')
    + (s.barcode && typeof window.tryonAddToCart === 'function' ? '<button class="cart" onclick="StoriesApp.addCart()">🛒</button>' : '');
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
function addCart(){ var s = S.list[S.idx]; if(!s || !s.barcode) return; close(); window.tryonAddToCart(s.barcode, S.imgs[s.id] || s.thumb, ''); }

window.StoriesApp = { init: init, storiesHtml: storiesHtml, homeHtml: homeHtml, open: open, openHome: openHome, close: close, isOpen: isOpen, tryOn: tryOn, addCart: addCart };
})();
