/* ============================================================
   🎨 color-match-app.js — v1 — «ألوانك» في تطبيق العميلات (إيشارب · Glow)
   ------------------------------------------------------------
   واجهة color-match-core.js: كارت على الرئيسية + اختبار قصير (صورة اختيارية + ٤ أسئلة) + النتيجة
   (ألوانك · ألوان تبعد عن الوش · قطع من الكتالوج بألوانك).
   · كله على الموبايل: الصورة مبتترفعش لأي مكان (بتتقري من canvas وبتترمي) — مفيش AI ولا سيرفر.
   · النتيجة بتتحفظ على الجهاز (localStorage) لكل عميلة وبراند.
   الاستعمال: ColorMatchApp.init({ brand, phone, getItems, openItem, rerender }) · homeHtml() · open()
     getItems() → [{ id, title, img, price, toneText }] · openItem(id) بيفتح صفحة القطعة.
   ============================================================ */
(function(){
'use strict';
var C = window.ColorMatch; if(!C) return;
var S = { brand:'echarpe', phone:'', getItems:null, openItem:null, rerender:null, res:null, step:'intro', ans:{}, skin:null, rgb:null, qi:0, rail:[] };
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
function key(){ return 'cm_v1_' + S.brand + '_' + (S.phone || 'x'); }
function load(){ try{ var r = JSON.parse(localStorage.getItem(key()) || 'null'); S.res = (r && C.SEASONS[r.season]) ? r : null; }catch(e){ S.res = null; } }
function save(){ try{ if(S.res) localStorage.setItem(key(), JSON.stringify(S.res)); else localStorage.removeItem(key()); }catch(e){} }
function money(n){ n = Number(n) || 0; return n > 0 ? (Math.round(n) + ' ج.م') : ''; }
function items(){ try{ return (S.getItems && S.getItems()) || []; }catch(e){ return []; } }

function css(){
  if(document.getElementById('cmCss')) return;
  var st = document.createElement('style'); st.id = 'cmCss';
  st.textContent = ''
    + '.cm-card{margin:16px 0 6px;padding:16px;border-radius:22px;background:#fff;border:1px solid var(--line,#eee);box-shadow:0 14px 30px -22px rgba(0,0,0,.35)}'
    + '.cm-cta{display:flex;align-items:center;gap:13px;width:100%;border:0;background:none;padding:0;font:inherit;color:inherit;text-align:start;cursor:pointer}'
    + '.cm-wheel{flex:none;width:54px;height:54px;border-radius:50%;background:conic-gradient(#F4B183,#C9A227,#6B6B3A,#1F6F6B,#9DB7D5,#B9A7D1,#D8A7B1,#6E1E3A,#F4B183);box-shadow:inset 0 0 0 4px #fff,0 6px 14px -8px rgba(0,0,0,.5)}'
    + '.cm-cta b{display:block;font-size:16.5px;font-weight:800}.cm-cta span{display:block;font-size:12.5px;color:var(--muted,#888);margin-top:3px;line-height:1.5}.cm-cta i{margin-inline-start:auto;font-style:normal;font-size:20px;opacity:.6}'
    + '.cm-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px}.cm-top b{font-size:17px;font-weight:800}.cm-top small{display:block;font-size:12px;color:var(--muted,#888);font-weight:600;margin-top:2px}'
    + '.cm-top button{flex:none;border:0;background:none;font:inherit;font-size:12.5px;font-weight:800;color:var(--pink-deep,#C0577A);padding:6px 0;cursor:pointer}'
    + '.cm-sw{display:flex;gap:7px;margin:12px 0 2px;flex-wrap:wrap}.cm-sw i{width:30px;height:30px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}'
    + '.cm-rail{display:flex;gap:11px;overflow-x:auto;scroll-snap-type:x proximity;margin:12px -16px 0;padding:0 16px 4px;scrollbar-width:none}.cm-rail::-webkit-scrollbar{display:none}'
    + '.cm-it{flex:0 0 118px;scroll-snap-align:start;border:0;background:none;padding:0;font:inherit;color:inherit;text-align:start;cursor:pointer}'
    + '.cm-it span{display:block;width:118px;aspect-ratio:3/4;border-radius:14px;overflow:hidden;background:#f3ecee}.cm-it img{width:100%;height:100%;object-fit:cover;display:block}'
    + '.cm-it b{display:block;margin-top:6px;font-size:12.5px;font-weight:700;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.cm-it small{display:block;font-size:11.5px;color:var(--muted,#888)}'
    + '#cmWrap{position:fixed;inset:0;z-index:99980;background:var(--bg,#fff);display:none;flex-direction:column}#cmWrap.on{display:flex}'
    + '.cm-hd{display:flex;align-items:center;gap:10px;padding:calc(12px + env(safe-area-inset-top)) 16px 10px}.cm-hd b{font-size:16px;font-weight:800;flex:1}'
    + '.cm-hd button{width:38px;height:38px;border-radius:50%;border:0;background:rgba(0,0,0,.06);font-size:16px;cursor:pointer}'
    + '.cm-bar{height:4px;background:rgba(0,0,0,.07);margin:0 16px;border-radius:9px;overflow:hidden}.cm-bar i{display:block;height:100%;background:var(--pink,#E27A97);transition:width .3s}'
    + '.cm-bd{flex:1;overflow-y:auto;padding:18px 16px calc(24px + env(safe-area-inset-bottom));max-width:480px;width:100%;margin:0 auto}'
    + '.cm-h{font-size:22px;font-weight:900;line-height:1.35;margin:6px 0 8px;text-wrap:balance}.cm-p{font-size:14px;line-height:1.8;color:var(--muted,#777);margin:0 0 16px}'
    + '.cm-opt{display:block;width:100%;text-align:start;padding:16px;margin:0 0 10px;border-radius:16px;border:1.5px solid var(--line,#e8e8e8);background:#fff;font:inherit;font-size:15.5px;font-weight:700;color:inherit;cursor:pointer}'
    + '.cm-opt:active{transform:scale(.985)}.cm-opt.main{background:var(--ink,#1a1315);color:#fff;border-color:var(--ink,#1a1315);text-align:center}.cm-opt small{display:block;font-size:12px;font-weight:600;opacity:.7;margin-top:3px}'
    + '.cm-link{display:block;margin:6px auto 0;border:0;background:none;font:inherit;font-size:13.5px;font-weight:700;color:var(--muted,#888);padding:10px;cursor:pointer}'
    + '.cm-cv{position:relative;border-radius:18px;overflow:hidden;background:#111;margin:0 0 12px;touch-action:manipulation}.cm-cv{text-align:center}.cm-cv canvas{display:block;max-width:100%;max-height:50vh;width:auto;height:auto;margin:0 auto}'
    + '.cm-dot{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.45);pointer-events:none}'
    + '.cm-read{display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;background:#fff;border:1px solid var(--line,#eee);margin:0 0 12px;font-size:13.5px;font-weight:700;line-height:1.6}.cm-read i{flex:none;width:40px;height:40px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}'
    + '.cm-res{border-radius:22px;padding:20px 18px;color:#fff;margin:0 0 16px}.cm-res small{font-size:12px;font-weight:700;opacity:.85}.cm-res b{display:block;font-size:27px;font-weight:900;margin:3px 0 8px}.cm-res p{margin:0;font-size:14px;line-height:1.75;opacity:.96}'
    + '.cm-sec{font-size:15px;font-weight:800;margin:18px 0 10px}'
    + '.cm-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px 8px}.cm-grid div{text-align:center;font-size:11.5px;font-weight:700;line-height:1.35}.cm-grid i{display:block;width:100%;aspect-ratio:1;border-radius:16px;margin-bottom:6px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1)}'
    + '.cm-av{display:flex;gap:10px}.cm-av div{flex:1;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;padding:8px;border-radius:12px;background:rgba(0,0,0,.04)}.cm-av i{flex:none;width:22px;height:22px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}'
    + '.cm-note{font-size:12px;line-height:1.7;color:var(--muted,#888);margin:16px 0 0}';
  document.head.appendChild(st);
}

function init(o){
  o = o || {};
  S.brand = o.brand || 'echarpe'; S.phone = String(o.phone || ''); S.getItems = o.getItems || null; S.openItem = o.openItem || null; S.rerender = o.rerender || null;
  css(); load();
}

/* ---------- 🏠 كارت الرئيسية ---------- */
function railHtml(season, max){
  S.rail = C.pick(items(), season, max || 10);
  if(!S.rail.length) return '';
  return '<div class="cm-rail">' + S.rail.map(function(it, i){
    return '<button class="cm-it" type="button" onclick="ColorMatchApp.openItem(' + i + ')"><span>' + (it.img ? '<img src="' + esc(it.img) + '" alt="" loading="lazy">' : '') + '</span><b>' + esc(it.title) + '</b><small>' + esc(money(it.price)) + '</small></button>';
  }).join('') + '</div>';
}
function homeHtml(){
  css();
  if(!S.res){
    return '<div class="cm-card"><button class="cm-cta" type="button" onclick="ColorMatchApp.open()"><span class="cm-wheel"></span>'
      + '<span><b>اعرفي ألوانك 🎨</b><span>اختبار دقيقة واحدة يقولّك أنهي ألوان تنوّر وشّك — ونوريكي قطع بيها</span></span><i>‹</i></button></div>';
  }
  var P = C.SEASONS[S.res.season];
  return '<div class="cm-card"><div class="cm-top"><div><b>ألوانك: ' + esc(P.ar) + '</b><small>الألوان اللي تنوّر وشّك</small></div><button type="button" onclick="ColorMatchApp.show()">التفاصيل ‹</button></div>'
    + '<div class="cm-sw">' + P.best.map(function(c){ return '<i style="background:' + c[1] + '" title="' + esc(c[0]) + '"></i>'; }).join('') + '</div>'
    + railHtml(S.res.season, 10) + '</div>';
}

/* ---------- 🧪 الاختبار ---------- */
function wrap(){
  var w = document.getElementById('cmWrap');
  if(!w){ w = document.createElement('div'); w.id = 'cmWrap'; w.innerHTML = '<div class="cm-hd"><b>ألوانك 🎨</b><button type="button" onclick="ColorMatchApp.close()" aria-label="إغلاق">✕</button></div><div class="cm-bar"><i id="cmBar"></i></div><div class="cm-bd" id="cmBd"></div>'; document.body.appendChild(w); }
  return w;
}
function isOpen(){ var w = document.getElementById('cmWrap'); return !!(w && w.classList.contains('on')); }
function open(){ S.step = 'intro'; S.ans = {}; S.skin = null; S.rgb = null; S.qi = 0; wrap().classList.add('on'); draw(); }
function show(){ if(!S.res) return open(); S.step = 'result'; wrap().classList.add('on'); draw(); }
function close(){ var w = document.getElementById('cmWrap'); if(w) w.classList.remove('on'); if(S.rerender) try{ S.rerender(); }catch(e){} }
function bar(p){ var b = document.getElementById('cmBar'); if(b) b.style.width = Math.round(p * 100) + '%'; }
function body(h){ var b = document.getElementById('cmBd'); if(b){ b.innerHTML = h; b.scrollTop = 0; } }

function draw(){
  if(S.step === 'intro'){
    bar(0.04);
    body('<div class="cm-h">أنهي ألوان تليق عليكي؟</div><p class="cm-p">كل بشرة ليها ألوان بتنوّرها وألوان بتطفيها. جاوبي ٤ أسئلة سريعة ونقولّك ألوانك ونوريكي قطع بيها.</p>'
      + '<button class="cm-opt main" type="button" onclick="ColorMatchApp.photo()">📷 ابدئي بصورة لوشّك<small>أدق شوية — الصورة بتفضل على موبايلك ومبتترفعش</small></button>'
      + '<button class="cm-opt" type="button" style="text-align:center" onclick="ColorMatchApp.quiz()">جاوبي الأسئلة بس</button>'
      + '<input type="file" id="cmFile" accept="image/*" capture="user" hidden>');
    var f = document.getElementById('cmFile'); if(f) f.onchange = function(){ if(f.files && f.files[0]) loadPhoto(f.files[0]); };
  }else if(S.step === 'photo'){
    bar(0.15);
    body('<div class="cm-h">دوسي على خدّك في الصورة</div><p class="cm-p">مكان فيه نور ومن غير ضل أو مكياج تقيل.</p>'
      + '<div class="cm-cv" id="cmCv"><canvas id="cmCanvas"></canvas></div><div id="cmRead"></div>'
      + '<button class="cm-opt main" type="button" id="cmNext" style="display:none" onclick="ColorMatchApp.quiz()">كمّلي ‹</button>'
      + '<button class="cm-link" type="button" onclick="ColorMatchApp.skipPhoto()">كمّلي من غير صورة</button>');
    paint();
  }else if(S.step === 'quiz'){
    var Q = C.QUESTIONS[S.qi]; bar(0.25 + 0.7 * (S.qi / C.QUESTIONS.length));
    body('<p class="cm-p" style="margin-bottom:4px">سؤال ' + (S.qi + 1) + ' من ' + C.QUESTIONS.length + '</p><div class="cm-h">' + esc(Q.q) + '</div>'
      + Q.opts.map(function(o){ return '<button class="cm-opt" type="button" onclick="ColorMatchApp.answer(\'' + o.v + '\')">' + esc(o.t) + '</button>'; }).join('')
      + (S.qi > 0 ? '<button class="cm-link" type="button" onclick="ColorMatchApp.back()">‹ السؤال اللي فات</button>' : ''));
  }else if(S.step === 'result'){
    bar(1);
    var P = C.SEASONS[S.res.season], grad = 'linear-gradient(135deg,' + P.best[3][1] + ',' + P.best[1][1] + ' 55%,' + P.best[6][1] + ')';
    var dark = /^(winter|neutral_deep|autumn)$/.test(S.res.season);
    if(dark) grad = 'linear-gradient(135deg,' + P.best[0][1] + ',' + P.best[2][1] + ' 60%,' + P.best[3][1] + ')';
    var rail = railHtml(S.res.season, 12);
    body('<div class="cm-res" style="background:' + grad + ';' + (dark ? '' : 'color:#2a1f22') + '"><small>ألوانك</small><b>' + esc(P.ar) + '</b><p>' + esc(P.line) + '</p></div>'
      + '<div class="cm-sec">ألوان تنوّر وشّك</div><div class="cm-grid">' + P.best.map(function(c){ return '<div><i style="background:' + c[1] + '"></i>' + esc(c[0]) + '</div>'; }).join('') + '</div>'
      + '<div class="cm-sec">خلّيها بعيد عن وشّك</div><div class="cm-av">' + P.avoid.map(function(c){ return '<div><i style="background:' + c[1] + '"></i>' + esc(c[0]) + '</div>'; }).join('') + '</div>'
      + (rail ? '<div class="cm-sec">قطع بألوانك</div><div style="margin:0 0 4px">' + rail.replace('margin:12px -16px 0', '') + '</div>' : '')
      + '<p class="cm-note">ده دليل يساعدك تختاري، مش قاعدة — اللون اللي بتحبيه وبترتاحي فيه دايمًا يكسب. ' + (S.res.usedPhoto ? 'قراية الصورة تقريبية حسب الإضاءة.' : '') + '</p>'
      + '<button class="cm-opt main" type="button" style="margin-top:16px" onclick="ColorMatchApp.close()">تمام</button>'
      + '<button class="cm-link" type="button" onclick="ColorMatchApp.open()">عيدي الاختبار</button>');
  }
}

/* ---------- 📷 الصورة (بتتقري محليًا وبتترمي) ---------- */
var IMG = null;
function loadPhoto(file){
  var url = URL.createObjectURL(file), im = new Image();
  im.onload = function(){ IMG = im; S.step = 'photo'; draw(); try{ URL.revokeObjectURL(url); }catch(e){} };
  im.onerror = function(){ quiz(); };
  im.src = url;
}
function paint(){
  var cv = document.getElementById('cmCanvas'); if(!cv || !IMG) return;
  var k = Math.min(1, 720 / Math.max(IMG.naturalWidth, IMG.naturalHeight));
  cv.width = Math.round(IMG.naturalWidth * k); cv.height = Math.round(IMG.naturalHeight * k);
  cv.getContext('2d').drawImage(IMG, 0, 0, cv.width, cv.height);
  cv.onclick = function(e){
    var r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * cv.width / r.width, y = (e.clientY - r.top) * cv.height / r.height;
    var rad = Math.max(8, Math.round(cv.width * 0.035)), d;
    try{ d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height); }catch(err){ return; }
    S.rgb = C.sampleCircle(d.data, cv.width, cv.height, x, y, rad); S.skin = C.readSkin(S.rgb);
    var box = document.getElementById('cmCv'), dot = box.querySelector('.cm-dot');
    if(!dot){ dot = document.createElement('span'); dot.className = 'cm-dot'; box.appendChild(dot); }
    var br = box.getBoundingClientRect(); dot.style.left = (e.clientX - br.left) + 'px'; dot.style.top = (e.clientY - br.top) + 'px';
    var rd = document.getElementById('cmRead'), nx = document.getElementById('cmNext'), sw = S.rgb ? 'rgb(' + S.rgb.join(',') + ')' : '#ccc';
    if(S.skin && S.skin.ok){
      rd.innerHTML = '<div class="cm-read"><i style="background:' + sw + '"></i><span>قرينا لون بشرتك: مايلة ' + (S.skin.lean === 'warm' ? 'للدافي' : S.skin.lean === 'cool' ? 'للبارد' : 'للمحايد') + '. لو المكان مش مظبوط دوسي تاني.</span></div>';
      nx.style.display = 'block'; try{ nx.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }catch(e2){}
    }else{
      rd.innerHTML = '<div class="cm-read"><i style="background:' + sw + '"></i><span>اللون ده مش واضح إنه بشرة — دوسي على خدّك في مكان منوّر.</span></div>';
      nx.style.display = 'none';
    }
  };
}
function photo(){ var f = document.getElementById('cmFile'); if(f){ f.value = ''; f.click(); } else quiz(); }
function skipPhoto(){ S.skin = null; S.rgb = null; quiz(); }
function quiz(){ IMG = null; S.step = 'quiz'; S.qi = 0; draw(); }
function back(){ if(S.qi > 0){ S.qi--; draw(); } }
function answer(v){
  var Q = C.QUESTIONS[S.qi]; if(!Q) return;
  if(!Q.opts.some(function(o){ return o.v === v; })) return;
  S.ans[Q.id] = v;
  if(S.qi < C.QUESTIONS.length - 1){ S.qi++; draw(); return; }
  var r = C.analyze(S.ans, S.skin); if(!r) return;
  S.res = { season: r.season, undertone: r.undertone, depth: r.depth, usedPhoto: r.usedPhoto, at: Date.now() };
  save(); S.step = 'result'; draw();
}
function openItem(i){ var it = S.rail[i]; if(!it || !S.openItem) return; var w = document.getElementById('cmWrap'); if(w) w.classList.remove('on'); try{ S.openItem(it.id, it); }catch(e){} }

window.ColorMatchApp = { init: init, homeHtml: homeHtml, open: open, show: show, close: close, isOpen: isOpen, photo: photo, skipPhoto: skipPhoto, quiz: quiz, back: back, answer: answer, openItem: openItem,
  _state: S, _loadPhoto: loadPhoto };
})();
