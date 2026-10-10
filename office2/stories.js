/* ============================================================
   📸 office2/stories.js — v1 — الستوري والمنتجات (موافقة المالك + نقط الموظفات)
   ------------------------------------------------------------
   قرار المالك (10-10-2026):
   · الموظفات بيصوّروا من Sales (بالدور: كل يوم موظفة) → هنا «مستنية موافقتك».
   · المالك: يوافق وينشر · يعدّل الكلام · يطلب صورة تانية (بملاحظة بتوصلها) · يرفض.
   · كل يوم الستوري بتتجدد: أول ما توافق على ستوري يوم جديد، ستوري الأيام اللي
     فاتت بتتشال من التطبيق (والمنتجات اللي على الرئيسية بتفضل لحد ما تشيلها).
   · كل ٥ قطع تتباع من باركود الصورة (خلال ٣٠ يوم من الموافقة) = نقطة بيع عادية
     في sales_points — ولو أكتر من موظفة صوّرت نفس الكود البيع بيتقسم.
   ملف مستقل عن office2.js (شغّال جنبه): بيضيف صف في «المزيد» وتنبيه في «اليوم»
   من غير ما يلمس منطق Office 2.
   ============================================================ */
(function(){
'use strict';
if(!window.firebase || !window.StoriesCore) return;
var C = window.StoriesCore, DAY = C.DAY;
var db = firebase.firestore();
var S = { list:[], cfg:{ piecesPerPoint:5, windowDays:30 }, tab:'pending', open:false, booted:false, pts:[], pushDay:{}, emps:[], running:false, noteFor:null };

function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]; }); }
function toast(t){ var el = document.getElementById('toast'); if(!el) return; el.textContent = t; el.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(function(){ el.classList.remove('on'); }, 2200); }
function ago(ms){ var m = Math.round((Date.now() - (ms || 0)) / 60000); if(m < 60) return 'من ' + Math.max(1, m) + ' د'; var h = Math.round(m / 60); if(h < 24) return 'من ' + h + ' س'; return 'من ' + Math.round(h / 24) + ' يوم'; }
function short(b){ return String(b || '').replace('echarpe ', ''); }
function pending(){ return S.list.filter(function(s){ return s.status === 'pending'; }); }

/* ---------- 📦 البيانات ---------- */
function boot(){
  if(S.booted) return; S.booted = true;
  db.collection('app_stories').where('createdAt', '>=', Date.now() - 45 * DAY).onSnapshot(function(s){
    S.list = s.docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); }).sort(function(a, b){ return (b.updatedAt || 0) - (a.updatedAt || 0); });
    hook(); if(S.open) render();
  }, function(e){ console.warn('app_stories', e && e.code); });
  db.collection('sales_employees').onSnapshot(function(s){ S.emps = s.docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); }); if(S.open) render(); }, function(){});
  db.collection('pos_test_settings').doc('stories_cfg').get().then(function(d){ if(d.exists) Object.assign(S.cfg, d.data() || {}); }).catch(function(){});
  ['echarpe', 'glow'].forEach(function(b){ db.collection('pos_test_settings').doc('stories_push_' + b).onSnapshot(function(d){ S.pushDay[b] = d.exists ? (d.data().day || '') : ''; }, function(){}); });
  setTimeout(processPoints, 4000); setInterval(processPoints, 30 * 60000);
}

/* ---------- 🔌 الربط مع شاشات Office 2 (من غير تعديل office2.js) ---------- */
function hook(){
  var scr = document.getElementById('screen'), title = document.getElementById('hTitle'); if(!scr || !title) return;
  var n = pending().length, t = title.textContent.trim();
  if(t === 'المزيد' && !document.getElementById('o2StRow')){
    var card = scr.querySelector('.card'); if(card){
      var row = document.createElement('div'); row.className = 'row first'; row.id = 'o2StRow';
      row.innerHTML = '<div class="n"><b>📸 الستوري والمنتجات</b><small>الموظفات بيصوّروا من Sales · انت بتوافق وتعدّل قبل النشر · الدور والنقط</small></div><span class="pill ' + (n ? 'p-bad' : 'p-acc') + '">' + (n ? n + ' مستنية' : 'افتح ›') + '</span>';
      row.onclick = open; var first = card.querySelector('.row.first'); if(first) first.classList.remove('first');
      card.insertBefore(row, card.firstChild);
    }
  }
  var old = document.getElementById('o2StAlert');
  var isToday = t.indexOf('اليوم') === 0;
  if(isToday && n){
    if(!old){ old = document.createElement('div'); old.id = 'o2StAlert'; old.className = 'alert w'; old.onclick = function(){ S.tab = 'pending'; open(); }; scr.insertBefore(old, scr.firstChild); }
    old.innerHTML = '📸 <span><b>' + n + '</b> ستوري مستنية موافقتك</span>';
  }else if(old && (!isToday || !n)){ old.remove(); }
}
function watchScreen(){
  var scr = document.getElementById('screen'); if(!scr) return setTimeout(watchScreen, 500);
  new MutationObserver(function(){ hook(); }).observe(scr, { childList:true });
  var app = document.getElementById('app');
  var obs = new MutationObserver(function(){ if(app.style.display !== 'none'){ boot(); obs.disconnect(); } });
  obs.observe(app, { attributes:true, attributeFilter:['style'] }); if(app.style.display !== 'none') boot();
}

/* ---------- 🖥️ الشاشة ---------- */
function ensureView(){
  if(document.getElementById('o2St')) return;
  var css = document.createElement('style');
  css.textContent = '#o2St{position:fixed;inset:0;z-index:30;background:var(--bg);overflow-y:auto;display:none;padding-bottom:30px}#o2St.on{display:block}'
    + '.stCard{background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;margin:0 0 12px}'
    + '.stCard .ph{position:relative;background:#111;aspect-ratio:4/5;max-height:460px;width:100%;display:block;cursor:zoom-in}.stCard .ph img{width:100%;height:100%;object-fit:cover;display:block}'
    + '.stCard .bd{padding:12px;display:flex;flex-direction:column;gap:8px}.stCard .meta{font-size:11.5px;color:var(--sub);font-weight:700}'
    + '.stCard input[type=text],.stCard textarea{width:100%;padding:10px;border:1px solid var(--line);border-radius:12px;font:700 14px Cairo,sans-serif}.stCard textarea{min-height:64px}'
    + '.stCk{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700}.stCk input{width:18px;height:18px}'
    + '.stMini{display:flex;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--line)}.stMini:first-child{border-top:0}.stMini img{width:48px;height:60px;border-radius:9px;object-fit:cover}.stMini .n{flex:1;min-width:0;font-size:12.5px}.stMini .n b{display:block;font-size:13.5px}'
    + '#o2StFull{position:fixed;inset:0;z-index:45;background:rgba(0,0,0,.92);display:none;align-items:center;justify-content:center}#o2StFull.on{display:flex}#o2StFull img{max-width:100%;max-height:100%;object-fit:contain}';
  document.head.appendChild(css);
  var v = document.createElement('div'); v.id = 'o2St';
  v.innerHTML = '<header class="top"><div style="display:flex;align-items:center;gap:6px"><button class="back" id="o2StBack">‹</button><div><b>📸 الستوري والمنتجات</b><small id="o2StSub">—</small></div></div></header><div class="screen" id="o2StBody" style="display:block"></div>';
  document.body.appendChild(v);
  var f = document.createElement('div'); f.id = 'o2StFull'; f.innerHTML = '<img alt="">'; f.onclick = function(){ f.classList.remove('on'); }; document.body.appendChild(f);
  document.getElementById('o2StBack').onclick = close;
}
function open(){ boot(); ensureView(); S.open = true; document.getElementById('o2St').classList.add('on'); render(); }
function close(){ S.open = false; var v = document.getElementById('o2St'); if(v) v.classList.remove('on'); hook(); }

function render(){
  if(!S.open) return;
  var P = pending(), today = C.dayKey(Date.now());
  var pub = S.list.filter(function(s){ return s.status === 'published'; });
  var home = S.list.filter(function(s){ return s.homeFeed; });
  document.getElementById('o2StSub').textContent = P.length ? P.length + ' مستنية موافقتك' : 'مفيش حاجة مستنية';
  var tabs = [['pending', 'مستنية' + (P.length ? ' (' + P.length + ')' : '')], ['live', 'في التطبيق'], ['home', 'الرئيسية'], ['turn', 'الدور والنقط']];
  var h = '<div class="seg">' + tabs.map(function(t){ return '<button class="' + (S.tab === t[0] ? 'on' : '') + '" onclick="O2Stories.tab(\'' + t[0] + '\')">' + t[1] + '</button>'; }).join('') + '</div>';
  if(S.tab === 'pending') h += P.length ? P.map(pendingCard).join('') : '<div class="empty">مفيش ستوري مستنية 👌<br><small>الموظفات بيرفعوا من Sales ← صفحة الموظفة ← 📸 ستوري</small></div>';
  else if(S.tab === 'live') h += '<div class="card"><h3>ستوري النهارده في التطبيق <small>' + pub.length + '</small></h3>' + (pub.length ? pub.map(function(s){ return mini(s, '<button class="btn r" onclick="O2Stories.archive(\'' + s.id + '\')">شيلها</button>'); }).join('') : '<div class="empty">مفيش ستوري منشورة دلوقتي</div>') + '</div>'
    + '<div class="hint">أول ما توافق على ستوري يوم جديد، ستوري الأيام اللي فاتت بتتشال لوحدها.</div>';
  else if(S.tab === 'home') h += '<div class="card"><h3>«مختارة ليكي» في الصفحة الرئيسية <small>' + home.length + '</small></h3>' + (home.length ? home.map(function(s){ return mini(s, '<button class="btn r" onclick="O2Stories.unhome(\'' + s.id + '\')">شيلها</button>'); }).join('') : '<div class="empty">مفيش منتجات على الرئيسية — علّم «تظهر في الرئيسية» وانت بتوافق</div>') + '</div>';
  else h += turnView();
  document.getElementById('o2StBody').innerHTML = h;
  if(S.tab === 'pending') P.forEach(function(x){ loadFull(x.id); });
}
// الصورة الكاملة للمراجعة (المصغّرة بتظهر الأول لحد ما الكبيرة توصل)
S.full = {};
function loadFull(id){
  var put = function(){ var im = document.querySelector('img[data-full="' + id + '"]'); if(im && S.full[id]) im.src = S.full[id]; };
  if(S.full[id]) return put();
  db.collection('app_story_images').doc(id).get().then(function(d){ if(d.exists && d.data().img){ S.full[id] = d.data().img; put(); } }).catch(function(){});
}
function mini(s, actions){
  return '<div class="stMini">' + (s.thumb ? '<img src="' + s.thumb + '" alt="" onclick="O2Stories.full(\'' + s.id + '\')">' : '') + '<div class="n"><b>' + esc(s.title) + '</b>' + esc(s.employeeName || '') + ' · ' + esc(short(s.branch)) + (s.productName ? ' · ' + esc(s.productName) : '') + '</div>' + actions + '</div>';
}
function pendingCard(s){
  var b = s.brand || 'echarpe', pushed = S.pushDay[b] === C.dayKey(Date.now());
  var noteOpen = S.noteFor === s.id;
  return '<div class="stCard" id="stc_' + s.id + '">'
    + '<div class="ph" onclick="O2Stories.full(\'' + s.id + '\')">' + (s.thumb ? '<img src="' + s.thumb + '" alt="صورة الستوري" data-full="' + s.id + '">' : '') + '</div>'
    + '<div class="bd"><div class="meta">📷 ' + esc(s.employeeName || '') + ' · ' + esc(short(s.branch)) + ' · ' + ago(s.updatedAt || s.createdAt) + (b === 'glow' ? ' · Glow' : '') + '</div>'
    + '<div class="meta">🏷️ ' + (s.barcode ? esc(s.barcode) + (s.productName ? ' · ' + esc(s.productName) : ' · <span style="color:var(--bad)">مش في المخزون</span>') + (s.price ? ' · ' + esc(s.price) + ' ج' : '') : '<span style="color:var(--bad)">من غير باركود (مش هتتحسب نقط)</span>') + '</div>'
    + '<input type="text" id="stT_' + s.id + '" value="' + esc(s.title) + '" maxlength="40" placeholder="العنوان">'
    + '<input type="text" id="stS_' + s.id + '" value="' + esc(s.subtitle) + '" maxlength="60" placeholder="السطر الصغير (اختياري)">'
    + '<label class="stCk"><input type="checkbox" id="stTry_' + s.id + '" ' + (s.tryable !== false ? 'checked' : '') + '> العميلة تقدر تجرّبها على صورتها</label>'
    + '<label class="stCk"><input type="checkbox" id="stHome_' + s.id + '" ' + (s.showOnHome ? 'checked' : '') + '> تظهر كمان في «مختارة ليكي» في الرئيسية</label>'
    + '<label class="stCk" style="' + (pushed ? 'opacity:.5' : '') + '"><input type="checkbox" id="stPush_' + s.id + '" ' + (pushed ? 'disabled' : '') + '> ابعت إشعار للعميلات' + (pushed ? ' (اتبعت إشعار النهارده)' : ' — مرة في اليوم بالكتير') + '</label>'
    + (noteOpen ? '<textarea id="stN_' + s.id + '" placeholder="اكتب للموظفة: مثلاً النور ضعيف — صوّري جنب الباب"></textarea><div class="btns"><button class="btn p" onclick="O2Stories.changes(\'' + s.id + '\')">ابعت لها</button><button class="btn" onclick="O2Stories.note(null)">إلغاء</button></div>'
      : '<div class="btns"><button class="btn g" style="flex:2" onclick="O2Stories.approve(\'' + s.id + '\')">✅ انشر</button><button class="btn" style="flex:1" onclick="O2Stories.note(\'' + s.id + '\')">📝 اطلب تعديل</button><button class="btn r" onclick="O2Stories.reject(\'' + s.id + '\')">✕</button></div>')
    + '</div></div>';
}
function turnView(){
  var now = Date.now(), h = '';
  ['echarpe', 'glow'].forEach(function(b){
    var t = C.turnFor(S.emps, b, now), t2 = C.turnFor(S.emps, b, now + DAY);
    if(!t) return;
    h += '<div class="card"><h3>' + (b === 'glow' ? 'Glow' : 'إيشارب') + ' <small>كل يوم موظفة · اللي إجازتها بتتعدّى</small></h3>'
      + '<div class="row first"><div class="n"><b>النهارده: ' + esc(t.name) + '</b><small>' + esc(short(t.branch)) + '</small></div><span class="pill p-acc">دورها</span></div>'
      + (t2 ? '<div class="row"><div class="n"><b>بكرة: ' + esc(t2.name) + '</b><small>' + esc(short(t2.branch)) + '</small></div></div>' : '') + '</div>';
  });
  var mStart = (function(){ var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); })();
  var byEmp = {}; S.pts.filter(function(p){ return p.ts >= mStart; }).forEach(function(p){ var k = p.employeeId; byEmp[k] = byEmp[k] || { name: p.employeeName, n: 0 }; byEmp[k].n += Number(p.value) || 1; });
  var rows = Object.keys(byEmp).map(function(k){ return byEmp[k]; }).sort(function(a, b){ return b.n - a.n; });
  h += '<div class="card"><h3>⭐ نقط الستوري الشهر ده <small>كل ' + S.cfg.piecesPerPoint + ' قطع = نقطة · ' + S.cfg.windowDays + ' يوم من الموافقة</small></h3>'
    + (rows.length ? rows.map(function(r, i){ return '<div class="row' + (i ? '' : ' first') + '"><div class="n"><b>' + esc(r.name) + '</b></div><span class="pill p-good">' + r.n + ' نقطة</span></div>'; }).join('') : '<div class="empty">لسه مفيش نقط من الستوري الشهر ده</div>')
    + '<div class="hint">النقط دي بتنزل مع نقط البيع وبتتحسب في المرتب آخر الشهر بنفس سعر النقطة.</div></div>';
  return h;
}

/* ---------- ✅ القرارات ---------- */
function val(id){ var el = document.getElementById(id); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : null; }
async function approve(id){
  var s = S.list.find(function(x){ return x.id === id; }); if(!s) return;
  var title = val('stT_' + id), sub = val('stS_' + id), tryable = val('stTry_' + id), home = val('stHome_' + id), push = val('stPush_' + id);
  if(!title){ toast('اكتب عنوان'); return; }
  var b = s.brand || 'echarpe', now = Date.now(), today = C.dayKey(now);
  try{
    var batch = db.batch();
    batch.update(db.collection('app_stories').doc(id), { status:'published', feed: C.feedKey(b, 'published'), title: title, subtitle: sub, tryable: !!tryable, showOnHome: !!home, homeFeed: home ? b : firebase.firestore.FieldValue.delete(), approvedAt: now, dayKey: today, ownerNote:'', decidedAt: now, updatedAt: now });
    batch.set(db.collection('app_story_images').doc(id), { published: true }, { merge: true });
    // 🔁 ستوري الأيام اللي فاتت بتتشال من التطبيق (المنتج اللي على الرئيسية بيفضل)
    S.list.filter(function(x){ return x.status === 'published' && (x.brand || 'echarpe') === b && x.dayKey && x.dayKey !== today && x.id !== id; }).forEach(function(x){
      batch.update(db.collection('app_stories').doc(x.id), { status:'archived', feed: C.feedKey(b, 'archived'), updatedAt: now });
      if(!x.homeFeed) batch.set(db.collection('app_story_images').doc(x.id), { published: false }, { merge: true });
    });
    if(push && S.pushDay[b] !== today) batch.set(db.collection('pos_test_settings').doc('stories_push_' + b), { day: today, title: title, storyId: id, seq: firebase.firestore.FieldValue.increment(1), ts: now }, { merge: true });
    await batch.commit(); toast('اتنشرت ✅');
  }catch(e){ toast('تعذر: ' + (e && e.code)); }
}
function note(id){ S.noteFor = id; render(); if(id) setTimeout(function(){ var t = document.getElementById('stN_' + id); if(t) t.focus(); }, 50); }
async function changes(id){
  var n = val('stN_' + id); if(!n){ toast('اكتب للموظفة المطلوب إيه'); return; }
  try{ await db.collection('app_stories').doc(id).update({ status:'changes', feed: C.feedKey((S.list.find(function(x){ return x.id === id; }) || {}).brand || 'echarpe', 'changes'), ownerNote: n, title: val('stT_' + id) || '', subtitle: val('stS_' + id) || '', decidedAt: Date.now(), updatedAt: Date.now() }); S.noteFor = null; toast('اتبعتت للموظفة 📝'); }catch(e){ toast('تعذر: ' + (e && e.code)); }
}
async function reject(id){
  if(!confirm('ترفض الستوري دي؟')) return;
  var s = S.list.find(function(x){ return x.id === id; }) || {};
  try{ await db.collection('app_stories').doc(id).update({ status:'rejected', feed: C.feedKey(s.brand || 'echarpe', 'rejected'), decidedAt: Date.now(), updatedAt: Date.now() }); toast('اترفضت'); }catch(e){ toast('تعذر: ' + (e && e.code)); }
}
async function archive(id){
  var s = S.list.find(function(x){ return x.id === id; }) || {};
  try{ var b = db.batch(); b.update(db.collection('app_stories').doc(id), { status:'archived', feed: C.feedKey(s.brand || 'echarpe', 'archived'), updatedAt: Date.now() });
    if(!s.homeFeed) b.set(db.collection('app_story_images').doc(id), { published:false }, { merge:true }); await b.commit(); toast('اتشالت'); }catch(e){ toast('تعذر: ' + (e && e.code)); }
}
async function unhome(id){
  var s = S.list.find(function(x){ return x.id === id; }) || {};
  try{ var b = db.batch(); b.update(db.collection('app_stories').doc(id), { showOnHome:false, homeFeed: firebase.firestore.FieldValue.delete(), updatedAt: Date.now() });
    if(s.status !== 'published') b.set(db.collection('app_story_images').doc(id), { published:false }, { merge:true }); await b.commit(); toast('اتشالت من الرئيسية'); }catch(e){ toast('تعذر: ' + (e && e.code)); }
}
function full(id){
  var f = document.getElementById('o2StFull'); if(!f) return; var s = S.list.find(function(x){ return x.id === id; }) || {};
  f.querySelector('img').src = S.full[id] || s.thumb || ''; f.classList.add('on');
  db.collection('app_story_images').doc(id).get().then(function(d){ if(d.exists && d.data().img && f.classList.contains('on')) f.querySelector('img').src = d.data().img; }).catch(function(){});
}

/* ---------- ⭐ نقط الموظفات من البيع ----------
   مؤشر (app_story_credit/_cursor) = آخر وقت سيرفر اتحسب لحد عنده. كل مرة:
   الفواتير اللي وصلت السيرفر بعده → المحرك المشترك → النقط بمعرّف ثابت
   (story_<موظفة>_<رقم>) + الرصيد + المؤشر الجديد **في معاملة واحدة**،
   ولو جهاز تاني حرّك المؤشر في النص المعاملة بتتلغي (مفيش حساب مرتين). */
function saleMs(x){ return Number(x.createdAtMs) || ((x.createdAt && x.createdAt.toMillis) ? x.createdAt.toMillis() : 0); }
async function processPoints(){
  if(S.running) return; S.running = true;
  try{
    for(var round = 0; round < 6; round++){
      var curRef = db.collection('app_story_credit').doc('_cursor');
      var cur = await curRef.get();
      if(!cur.exists){ await curRef.set({ ts: Date.now(), startedAt: Date.now() }); break; }   // البداية: من يوم التشغيل
      var from = Number(cur.data().ts) || Date.now();
      var snap = await db.collection('pos_test_sales').where('createdAt', '>', firebase.firestore.Timestamp.fromMillis(from)).limit(800).get();
      var sales = snap.docs.map(function(d){ var x = d.data() || {}; return { id: d.id, branch: x.branch, ms: saleMs(x), srv: (x.createdAt && x.createdAt.toMillis) ? x.createdAt.toMillis() : 0, items: x.items || [] }; }).filter(function(x){ return x.srv > from; });
      if(!sales.length) break;
      var upto = sales.reduce(function(m, x){ return Math.max(m, x.srv); }, from);
      var stories = S.list.filter(function(s){ return s.barcode && s.approvedAt; });
      var empIds = {}; stories.forEach(function(s){ empIds[s.employeeId] = 1; });
      await db.runTransaction(async function(tx){
        var c2 = await tx.get(curRef); if(!c2.exists || Number(c2.data().ts) !== from) throw new Error('moved');
        var credits = {}, ids = Object.keys(empIds);
        for(var i = 0; i < ids.length; i++){ var d = await tx.get(db.collection('app_story_credit').doc(ids[i])); if(d.exists) credits[ids[i]] = d.data(); }
        var r = C.computeCredits(stories, sales, credits, S.cfg);
        Object.keys(r.credits).forEach(function(k){ tx.set(db.collection('app_story_credit').doc(k), { credit: r.credits[k].credit, awarded: r.credits[k].awarded, name: r.credits[k].name || '', branch: r.credits[k].branch || '', updatedAt: Date.now() }, { merge: true }); });
        r.awards.forEach(function(a){
          tx.set(db.collection('sales_points').doc('story_' + a.empId + '_' + a.k), { employeeId: a.empId, employeeName: a.name || '', invoiceNumber: 'STORY-' + a.k, branch: a.branch || '', ts: a.ts, value: 1, auto: true, source: 'story' });
        });
        tx.update(curRef, { ts: upto, lastRunAt: Date.now() });
      });
      if(snap.size < 800) break;
    }
    var mStart = (function(){ var d = new Date(); return new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(); })();
    var ps = await db.collection('sales_points').where('ts', '>=', mStart).get();
    S.pts = ps.docs.map(function(d){ return d.data(); }).filter(function(p){ return p.source === 'story'; });
    if(S.open && S.tab === 'turn') render();
  }catch(e){ if(!(e && e.message === 'moved')) console.warn('story points', e && (e.code || e.message)); }
  S.running = false;
}

window.O2Stories = { open: open, close: close, tab: function(t){ S.tab = t; S.noteFor = null; render(); if(t === 'turn') processPoints(); },
  approve: approve, note: note, changes: changes, reject: reject, archive: archive, unhome: unhome, full: full, pendingCount: function(){ return pending().length; }, _process: processPoints };
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchScreen); else watchScreen();
})();
