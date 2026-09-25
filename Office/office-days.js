// ============================================================
// 📥 office-days.js — v690: استلام الأيام في Office (طلب المالك 24-09)
// ------------------------------------------------------------
// كل تقفيلات الفروع: التاريخ · الفرع · مين قفل (ومضى على الإيصال) · مين كان واقف ·
// المسلّم كاش · اتحصّل ولا لسه. **من غير أي مبيعات أو إجمالي يوم.**
// «✅ تم الاستلام» من هنا أو من POS — نفس الحقل على نفس المستند (dayclose_<فرع>_<تاريخ>).
// طبقة لوحدها: مبتلمسش office.js غير إنها بتلف ofGoPage عشان ترسم الصفحة لما تتفتح.
// ============================================================
(function(){
  var _odFilter = 'pending', _odRecs = [];
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function n2(v){ return (+(v || 0)).toFixed(2); }
  function handedOf(r){ return (r.handedCash != null) ? +r.handedCash : ((+(r.countedCash || 0)) - (+(r.float || 0))); }

  /* منطق خام — متختبر */
  function odSummarize(recs){
    var pend = recs.filter(function(r){ return !r.received; });
    return { pending: pend.length, pendingCash: +pend.reduce(function(s, r){ return s + handedOf(r); }, 0).toFixed(2), total: recs.length };
  }

  async function odLoad(){
    var snap = await db.collection('pos_test_settings')
      .where(firebase.firestore.FieldPath.documentId(), '>=', 'dayclose_')
      .where(firebase.firestore.FieldPath.documentId(), '<', 'dayclose_\uf8ff').get();
    var out = [];
    snap.forEach(function(d){ var x = d.data() || {}; if(x.type === 'dayclose'){ x._id = d.id; out.push(x); } });
    out.sort(function(a, b){ return String(b.date || '').localeCompare(String(a.date || '')) || String(a.branch || '').localeCompare(String(b.branch || '')); });
    return out.slice(0, 300);
  }

  function odRender(){
    var host = document.getElementById('daysBody'); if(!host) return;
    var s = odSummarize(_odRecs);
    var shown = _odRecs.filter(function(r){ return _odFilter === 'all' ? true : (_odFilter === 'pending' ? !r.received : !!r.received); });
    var tab = function(k, l){ return '<button type="button" onclick="odSetFilter(\'' + k + '\')" style="flex:1;padding:9px;border-radius:10px;border:1px solid #e5e7eb;font-weight:800;cursor:pointer;'
      + (_odFilter === k ? 'background:#111827;color:#fff;' : 'background:#fff;color:#111827;') + '">' + l + '</button>'; };
    host.innerHTML =
      '<div class="panel" style="margin-bottom:10px;"><div class="row"><div><b style="font-size:17px;">⏳ ' + s.pending + ' يوم لسه ماتحصّلش</b>'
      + '<div class="muted" style="font-size:12px;">كاش مستني يتسلم: <b>' + n2(s.pendingCash) + '</b> ج.م</div></div>'
      + '<button type="button" class="ghost" onclick="odRefresh()">🔄</button></div></div>'
      + '<div style="display:flex;gap:6px;margin-bottom:10px;">' + tab('pending', '⏳ لسه') + tab('done', '✅ اتحصّلت') + tab('all', 'الكل') + '</div>'
      + (shown.map(function(r){
          return '<div class="panel" style="margin-bottom:8px;border-right:4px solid ' + (r.received ? '#059669' : '#d97706') + ' !important;">'
            + '<div class="row"><b>📅 ' + esc(r.date) + ' · ' + esc(r.branch) + '</b>'
            + (r.received ? '<b style="color:#059669;">✅ اتحصّل</b>' : '<b style="color:#d97706;">⏳ لسه</b>') + '</div>'
            + '<div class="muted" style="font-size:12px;line-height:1.9;margin-top:4px;">'
            + '✍️ قفل ومضى: <b style="color:#111827;">' + esc(r.closedByName || r.closedBy || '—') + '</b>'
            + (r.staffOnShift && r.staffOnShift.length ? '<br>👥 كانوا واقفين: ' + r.staffOnShift.map(esc).join('، ') : '')
            + '<br>💵 المسلّم كاش: <b style="color:#111827;">' + n2(handedOf(r)) + '</b> ج.م'
            + (r.received ? '<br>استلم: ' + esc(r.receivedByName || '') + (r.receivedAt ? ' · ' + new Date(r.receivedAt).toLocaleString('ar-EG') : '') : '')
            + '</div>'
            + (r.received ? '' : '<button type="button" class="btn" style="width:100%;margin-top:8px;" onclick="odReceive(\'' + esc(r._id) + '\')">✅ تم الاستلام</button>')
            + '</div>';
        }).join('') || '<div class="empty">مفيش أيام هنا</div>');
  }

  async function odRefresh(){
    var host = document.getElementById('daysBody'); if(host) host.innerHTML = '<div class="empty">جاري التحميل…</div>';
    try{ _odRecs = await odLoad(); odRender(); }
    catch(e){ if(host) host.innerHTML = '<div class="empty">تعذر التحميل: ' + esc(e && e.message || e) + '</div>'; }
  }
  function odSetFilter(k){ _odFilter = k; odRender(); }
  async function odReceive(id){
    var r = _odRecs.find(function(x){ return x._id === id; }); if(!r) return;
    if(!window.confirm('تم استلام يوم ' + r.date + ' — ' + r.branch + '\nالمسلّم كاش: ' + n2(handedOf(r)) + ' ج.م')) return;
    try{
      var ref = db.collection('pos_test_settings').doc(id);
      var s = await ref.get();
      if(s.exists && (s.data() || {}).received){ alert('اليوم ده اتستلم قبل كده'); return odRefresh(); }
      await ref.set({ received: true, receivedAt: Date.now(), receivedById: 'office', receivedByName: 'المالك (Office)' }, { merge: true });
    }catch(e){ alert('ماتسجلش: ' + (e && e.message || e)); }
    odRefresh();
  }

  window.odRefresh = odRefresh; window.odSetFilter = odSetFilter; window.odReceive = odReceive; window.odSummarize = odSummarize;

  if(typeof window.ofGoPage === 'function' && !window.ofGoPage._odGuard){
    var orig = window.ofGoPage;
    var g = function(page){ var r = orig.apply(this, arguments); if(page === 'days') odRefresh(); return r; };
    g._odGuard = true;
    window.ofGoPage = g;
  }
})();
