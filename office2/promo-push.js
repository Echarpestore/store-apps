/* ============================================================
   📣 office2/promo-push.js — v1 — إشعار عرض لكل العميلات
   ------------------------------------------------------------
   طلب المالك (26-11-2026، الجمعة البيضاء): إشعار واحد لكل عميلات البراند
   على الـPWA وتطبيق جوجل بلاي بكلام العرض.
   · المالك بيكتب العنوان والكلام هنا ويدوس «ابعت» → بنكتب
     pos_test_settings/promo_push_<براند> ونزوّد seq → الفانكشن
     onCatalogUpdated بتبعت لكل توكنات البراند (نفس طريق الستوري والكتالوج).
   · إشعار واحد في اليوم لكل براند (هنا وفي الفانكشن) — عشان العميلة متتزهقش.
   ملف مستقل زي stories.js: بيضيف صف في «المزيد» من غير ما يلمس office2.js.
   ============================================================ */
(function(){
'use strict';
if(!window.firebase) return;
var db = firebase.firestore();
var BR = [['echarpe', 'إيشارب'], ['glow', 'Glow']];
var S = { open:false, booted:false, brand:'echarpe', last:{}, busy:false,
  title:'الجمعة البيضاء في إيشارب 🤍',
  body:'الحقي عروض الجمعة البيضاء من الخميس للأحد — خصومات على كل المنتجات في كل الفروع 🛍️',
  link:'./?go=wf' };

function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]; }); }
function toast(t){ var el = document.getElementById('toast'); if(!el) return; el.textContent = t; el.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(function(){ el.classList.remove('on'); }, 2600); }
/* اليوم بتوقيت القاهرة (UTC+2 شتا) — نفس مفتاح اليوم بتاع الستوري لو موجود */
function dayKey(ms){ if(window.StoriesCore && StoriesCore.dayKey) return StoriesCore.dayKey(ms); return new Date(ms + 2 * 3600000).toISOString().slice(0, 10); }
function clean(s, n){ return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n); }

function boot(){
  if(S.booted) return; S.booted = true;
  BR.forEach(function(b){
    db.collection('pos_test_settings').doc('promo_push_' + b[0]).onSnapshot(function(d){ S.last[b[0]] = d.exists ? (d.data() || {}) : {}; if(S.open) render(); }, function(){});
  });
}
function hook(){
  var scr = document.getElementById('screen'), title = document.getElementById('hTitle'); if(!scr || !title) return;
  if(title.textContent.trim() !== 'المزيد' || document.getElementById('o2PpRow')) return;
  var card = scr.querySelector('.card'); if(!card) return;
  var row = document.createElement('div'); row.className = 'row'; row.id = 'o2PpRow';
  row.innerHTML = '<div class="n"><b>📣 إشعار عرض لكل العميلات</b><small>رسالة واحدة توصل لكل اللي منزّلين التطبيق · مرة في اليوم</small></div><span class="pill p-acc">افتح ›</span>';
  row.onclick = open; card.appendChild(row);
}
function watchScreen(){
  var scr = document.getElementById('screen'); if(!scr) return setTimeout(watchScreen, 500);
  new MutationObserver(function(){ hook(); }).observe(scr, { childList:true });
  hook();
}
function ensureView(){
  if(document.getElementById('o2Pp')) return;
  var css = document.createElement('style');
  css.textContent = '#o2Pp{position:fixed;inset:0;z-index:30;background:var(--bg);overflow-y:auto;display:none;padding-bottom:30px}#o2Pp.on{display:block}'
    + '#o2Pp label{display:block;font-size:12.5px;font-weight:800;margin:10px 0 5px}'
    + '#o2Pp input[type=text],#o2Pp textarea{width:100%;padding:11px;border:1px solid var(--line);border-radius:12px;font:700 14px Cairo,sans-serif}#o2Pp textarea{min-height:84px}'
    + '.ppPrev{display:flex;gap:10px;align-items:flex-start;background:#1f1f24;color:#fff;border-radius:16px;padding:12px;margin-top:6px}.ppPrev i{flex:none;width:38px;height:38px;border-radius:10px;background:#fff;display:grid;place-items:center;font-style:normal;font-size:19px}'
    + '.ppPrev b{display:block;font-size:13.5px}.ppPrev span{display:block;font-size:12.5px;opacity:.85;margin-top:2px;line-height:1.5}.ppCnt{float:left;font-weight:700;color:var(--sub);font-size:11px}';
  document.head.appendChild(css);
  var v = document.createElement('div'); v.id = 'o2Pp';
  v.innerHTML = '<header class="top"><div style="display:flex;align-items:center;gap:6px"><button class="back" id="o2PpBack">‹</button><div><b>📣 إشعار عرض</b><small>لكل عميلات التطبيق</small></div></div></header><div class="screen" id="o2PpBody" style="display:block"></div>';
  document.body.appendChild(v);
  document.getElementById('o2PpBack').onclick = close;
}
function open(){ boot(); ensureView(); S.open = true; document.getElementById('o2Pp').classList.add('on'); render(); }
function close(){ S.open = false; var v = document.getElementById('o2Pp'); if(v) v.classList.remove('on'); }
function keep(){ var t = document.getElementById('ppT'), b = document.getElementById('ppB'); if(t) S.title = t.value; if(b) S.body = b.value; }
function sentToday(b){ return (S.last[b] || {}).day === dayKey(Date.now()); }

function render(){
  if(!S.open) return;
  var b = S.brand, done = sentToday(b), last = S.last[b] || {};
  var h = '<div class="seg">' + BR.map(function(x){ return '<button class="' + (b === x[0] ? 'on' : '') + '" onclick="O2Promo.brand(\'' + x[0] + '\')">تطبيق ' + x[1] + '</button>'; }).join('') + '</div>';
  h += '<div class="card"><label>العنوان <span class="ppCnt" id="ppTc"></span></label><input type="text" id="ppT" maxlength="60" value="' + esc(S.title) + '" oninput="O2Promo.type()">'
    + '<label>الكلام <span class="ppCnt" id="ppBc"></span></label><textarea id="ppB" maxlength="180" oninput="O2Promo.type()">' + esc(S.body) + '</textarea>'
    + '<label>شكله على الموبايل</label><div class="ppPrev"><i>🌸</i><div><b id="ppPt"></b><span id="ppPb"></span></div></div>'
    + '<div class="hint" style="margin:10px 0 0">بيوصل لكل عميلة منزّلة التطبيق وسامحة بالإشعارات (الـPWA وتطبيق جوجل بلاي). الدوسة عليه بتفتح التطبيق.</div></div>';
  h += done
    ? '<div class="alert w">✅ اتبعت إشعار النهارده لتطبيق ' + (b === 'glow' ? 'Glow' : 'إيشارب') + ' — «' + esc(last.title || '') + '». الإشعار الجاي بكرة.</div>'
    : '<button class="btn g" style="width:100%;padding:14px;font-size:15px" id="ppSend" onclick="O2Promo.send()">📣 ابعت لكل عميلات ' + (b === 'glow' ? 'Glow' : 'إيشارب') + '</button>';
  if(!done && last.day) h += '<div class="hint">آخر إشعار: ' + esc(last.day) + ' — «' + esc(last.title || '') + '»</div>';
  document.getElementById('o2PpBody').innerHTML = h; type();
}
function type(){
  keep();
  var t = clean(S.title, 60), b = clean(S.body, 180);
  var e;
  if((e = document.getElementById('ppPt'))) e.textContent = t || '—';
  if((e = document.getElementById('ppPb'))) e.textContent = b || '—';
  if((e = document.getElementById('ppTc'))) e.textContent = t.length + '/60';
  if((e = document.getElementById('ppBc'))) e.textContent = b.length + '/180';
}
async function send(){
  if(S.busy) return; keep();
  var b = S.brand, nm = b === 'glow' ? 'Glow' : 'إيشارب';
  var title = clean(S.title, 60), body = clean(S.body, 180);
  if(title.length < 3 || body.length < 10){ toast('اكتب العنوان والكلام الأول'); return; }
  if(sentToday(b)){ toast('اتبعت إشعار النهارده خلاص'); return; }
  if(!confirm('تبعت الإشعار ده دلوقتي لكل عميلات تطبيق ' + nm + '؟\n\n' + title + '\n' + body + '\n\nمبيترجعش بعد الإرسال.')) return;
  S.busy = true;
  try{
    var now = Date.now();
    await db.collection('pos_test_settings').doc('promo_push_' + b).set({ day: dayKey(now), title: title, body: body, link: S.link, seq: firebase.firestore.FieldValue.increment(1), ts: now }, { merge: true });
    toast('اتبعت ✅ هيوصل للعميلات خلال دقيقة');
  }catch(e){ toast('تعذر: ' + ((e && e.code) || 'خطأ')); }
  S.busy = false; render();
}

window.O2Promo = { open: open, close: close, send: send, type: type, brand: function(x){ keep(); S.brand = x === 'glow' ? 'glow' : 'echarpe'; render(); }, _clean: clean, _dayKey: dayKey };
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchScreen); else watchScreen();
})();
