/* ============================================================
   📸 pos-pieces.js — v1 — «القطعة الواحدة» في الـPOS (10-10-2026)
   ------------------------------------------------------------
   صورة صوّرتها موظفة ووافق عليها المالك للشراء أونلاين = قطعة بعدد معروف
   من **اللون اللي في الصورة** (app_stories: qtyLeft · qtyReserved · pieceBranch).
   الباركود الواحد عليه ألوان كتير، فالـPOS لوحده مايعرفش — فبيسأل:
   · الكاشير مسحت باركود عليه قطعة معروضة في الفرع ده:
       «هي نفس اللون اللي في الصورة؟» أيوه ← بعد ما الفاتورة تتحفظ المتاح بيقل
       (والتطبيق يقول «اتباعت») · لأ ← ولا حاجة.
   · لو القطعة كلها **محجوزة لعميلة أونلاين** ← تحذير أحمر + «شيليها من الفاتورة».
   · أول ما عميلة تحجز قطعة أونلاين ← تنبيه في POS الفرع بالصورة:
       «شيليها من الرف وحطيها في المحجوز».
   ⚠️ مفيش أي كتابة جوه batch الفاتورة: لو حاجة هنا وقعت، البيع مايتأثرش.
   ============================================================ */
(function(){
'use strict';
var P = [], prevRes = {}, first = true, unsub = null, subBranch = '';
var LIVE = ['published', 'live', 'archived'];
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
function branch(){ try{ return (typeof currentBranch !== 'undefined' && currentBranch) ? String(currentBranch) : ''; }catch(e){ return ''; } }
function toast(m, t){ try{ if(typeof showToast === 'function') showToast(m, t || 'ok'); }catch(e){} }

function watch(){
  var br = branch(); if(!br || br === subBranch || typeof db === 'undefined') return;
  if(unsub) try{ unsub(); }catch(e){}
  subBranch = br; first = true; prevRes = {};
  unsub = db.collection('app_stories').where('pieceBranch', '==', br).onSnapshot(function(s){
    P = s.docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); });
    P.forEach(function(p){
      var r = Number(p.qtyReserved) || 0, was = prevRes[p.id];
      if(!first && r > (was || 0) && p.online) alertReserved(p);
      prevRes[p.id] = r;
    });
    first = false;
  }, function(e){ console.warn('pieces', e && e.code); });
}
setInterval(watch, 8000); setTimeout(watch, 1500);

function active(p){ return p && p.online === true && LIVE.indexOf(p.status) >= 0; }
function forBarcode(bc){ return P.filter(function(p){ return active(p) && String(p.barcode) === String(bc) && ((Number(p.qtyLeft) || 0) > 0 || (Number(p.qtyReserved) || 0) > 0); }); }

/* ---------- 🪟 المودال ---------- */
function css(){
  if(document.getElementById('pcCss')) return;
  var c = document.createElement('style'); c.id = 'pcCss';
  c.textContent = '#pcOv{position:fixed;inset:0;z-index:100000;background:rgba(10,10,14,.6);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Cairo,sans-serif}'
    + '#pcOv .bx{background:#fff;color:#1b1d24;border-radius:20px;max-width:560px;width:100%;padding:18px;max-height:90vh;overflow:auto;box-shadow:0 30px 60px -20px rgba(0,0,0,.5)}'
    + '#pcOv h3{margin:0 0 4px;font-size:18px}#pcOv .sb{color:#6b7280;font-size:13px;margin-bottom:12px}'
    + '#pcOv .it{display:flex;gap:12px;align-items:center;border:1px solid #e6e8ee;border-radius:14px;padding:10px;margin-bottom:10px}#pcOv .it img{width:84px;height:104px;object-fit:cover;border-radius:10px;flex:0 0 auto}'
    + '#pcOv .it .n{flex:1;min-width:0;font-size:13px}#pcOv .it .n b{display:block;font-size:15px}#pcOv .bad{color:#c62828;font-weight:800}'
    + '#pcOv button{border:0;border-radius:12px;padding:11px 14px;font:800 14px Cairo,sans-serif;cursor:pointer}#pcOv .y{background:#15a35f;color:#fff}#pcOv .r{background:#c62828;color:#fff}#pcOv .g{background:#eef0f4;color:#1b1d24;width:100%;margin-top:4px}';
  document.head.appendChild(c);
}
function close(){ var o = document.getElementById('pcOv'); if(o) o.remove(); }
function modal(html){ css(); close(); var o = document.createElement('div'); o.id = 'pcOv'; o.innerHTML = '<div class="bx">' + html + '</div>'; document.body.appendChild(o); return o; }

function onAdd(item, line){
  try{
    if(window._ordDelivering || !item || !line || line.pieceId || line.isReturn || line._pcAsked) return;
    var list = forBarcode(item.barcode); if(!list.length) return;
    line._pcAsked = true;   // مرة واحدة لكل سطر — الضربة التانية لنفس الكود ما تسألش تاني
    var o = modal('<h3>📸 الطرحة دي معروضة في التطبيق</h3><div class="sb">الكود ده عليه ألوان كتير — هي نفس اللون اللي في الصورة؟</div>'
      + list.map(function(p){
          var left = Number(p.qtyLeft) || 0, res = Number(p.qtyReserved) || 0;
          return '<div class="it"><img src="' + esc(p.thumb || '') + '" alt=""><div class="n"><b>' + esc(p.title || p.productName || '') + '</b>'
            + (left > 0 ? 'متاح ' + left + (res ? ' · ' + res + ' محجوزة أونلاين' : '') : '<span class="bad">⛔ محجوزة لعميلة أونلاين — ماتتباعش</span>') + '</div>'
            + (left > 0 ? '<button class="y" data-yes="' + esc(p.id) + '">أيوه، دي</button>' : '<button class="r" data-drop="1">شيليها من الفاتورة</button>') + '</div>';
        }).join('')
      + '<button class="g" data-no="1">لأ، لون تاني</button>');
    o.querySelectorAll('[data-yes]').forEach(function(b){ b.onclick = function(){ line.pieceId = b.dataset.yes; close(); toast('✅ القطعة هتتشال من التطبيق بعد الفاتورة'); }; });
    o.querySelectorAll('[data-drop]').forEach(function(b){ b.onclick = function(){
      try{ if(line.qty > 1) line.qty -= 1; else { var i = cart.indexOf(line); if(i >= 0) cart.splice(i, 1); } if(typeof renderCart === 'function') renderCart(); }catch(e){}
      close(); toast('اتشالت — القطعة دي لعميلة أونلاين', 'err'); }; });
    o.querySelector('[data-no]').onclick = close;
  }catch(e){ console.warn('pieces onAdd', e); }
}

/* بعد ما الفاتورة اتحفظت — برّه الـbatch عمدًا */
function afterSale(lines){
  try{
    (lines || []).forEach(function(c){
      if(!c || !c.pieceId || c.isReturn) return;
      var q = Math.max(1, Number(c.qty) || 1), FV = firebase.firestore.FieldValue;
      db.collection('app_stories').doc(String(c.pieceId)).set({ qtyLeft: FV.increment(-q), soldInBranch: FV.increment(q), lastBranchSaleAt: Date.now() }, { merge: true }).catch(function(e){ console.warn('piece sale', e && e.code); });
    });
  }catch(e){ console.warn('pieces afterSale', e); }
}

function alertReserved(p){
  try{
    var o = modal('<h3>🛒 اتحجزت أونلاين!</h3><div class="sb">عميلة طلبت القطعة دي من التطبيق — شيليها من الرف وحطيها في المحجوز دلوقتي</div>'
      + '<div class="it"><img src="' + esc(p.thumb || '') + '" alt=""><div class="n"><b>' + esc(p.title || p.productName || '') + '</b>كود ' + esc(p.barcode || '') + '<br>محجوزة: ' + (Number(p.qtyReserved) || 0) + ' · متاح: ' + (Number(p.qtyLeft) || 0) + '</div></div>'
      + '<button class="y" style="width:100%" data-ok="1">تمام، شيلتها ✅</button>');
    o.querySelector('[data-ok]').onclick = close;
    try{ if(navigator.vibrate) navigator.vibrate([200, 100, 200]); }catch(e){}
  }catch(e){}
}

window.PosPieces = { onAdd: onAdd, afterSale: afterSale, _list: function(){ return P; }, _watch: watch };
})();
