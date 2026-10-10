/* ============================================================
   📥 Office 2 — استلام الأيام (منقول من Office/office-days.js)
   ------------------------------------------------------------
   كل تقفيلة فرع بتتسجل من POS في pos_test_settings/dayclose_<فرع>_<تاريخ>
   (type:'dayclose'): مين قفل ومضى · مين كان واقف · الكاش المعدود والعهدة والمسلّم ·
   المحسوب مقابل مبيعات السيستم والفرق. المالك بيعلّم «✅ تم الاستلام» —
   نفس الحقول اللي POS وOffice القديم بيكتبوها على نفس المستند.
   ============================================================ */
(function(){
'use strict';
const u = O2.u;
const WINDOW_DAYS = 45;
let recs = [], started = false, loaded = false, err = '';
let view = 'pending', branch = '';
function start(){
  if(started) return; started = true;
  // استعلام بحقل واحد (ts) ونافذة محدودة — والنوع بيتفلتر هنا
  u.db.collection('pos_test_settings').where('ts', '>=', Date.now() - WINDOW_DAYS*u.DAY).onSnapshot(s=>{
    recs = s.docs.map(d=> Object.assign({ id:d.id }, d.data())).filter(x=> x.type === 'dayclose');
    recs.sort((a,b)=> String(b.date||'').localeCompare(String(a.date||'')) || String(a.branch||'').localeCompare(String(b.branch||'')));
    loaded = true; err = ''; u.render();
  }, e=>{ err = String(e && (e.code||e.message)); loaded = true; u.render(); });
}
function handedOf(r){ return (r.handedCash != null) ? +r.handedCash : ((+(r.countedCash||0)) - (+(r.float||0))); }
function pending(){ return recs.filter(r=> !r.received); }
function dayLabel(key){ const a = String(key||'').split('-').map(Number); if(a.length < 3 || !a[0]) return u.esc(key); const ms = u.caiStamp(a[0], a[1], a[2], 12, 0); return u.dayName(ms) + ' ' + String(key).slice(5); }
function row(r){
  const diff = r.overShortReal != null ? +r.overShortReal : (+(r.overShort||0));
  const pill = Math.abs(diff) < 0.01 ? '<span class="pill p-good">✅ مظبوط</span>' : (diff < 0 ? `<span class="pill p-bad">⚠️ عجز ${u.n0(Math.abs(diff))}</span>` : `<span class="pill p-warn">🔺 أوفر ${u.n0(diff)}</span>`);
  const staff = (r.staffOnShift && r.staffOnShift.length) ? r.staffOnShift.map(u.esc).join('، ') : '—';
  const hasSys = r.systemTotal != null;
  return `<div class="row first" style="cursor:default;flex-wrap:wrap;gap:6px">
    <div class="n"><b>📅 ${dayLabel(r.date)} · ${u.esc(String(r.branch||'').replace('echarpe ',''))}</b>
      <small>✍️ قفل ومضى: <b>${u.esc(r.closedByName || r.closedBy || '—')}</b> · 👥 كانوا واقفين: ${staff}</small>
      <small>💵 المسلّم كاش: <b>${u.n0(handedOf(r))} ج</b> · معدود ${u.n0(r.countedCash)} − عهدة ${u.n0(r.float)}${r.expenses?' · مصاريف '+u.n0(r.expenses):''}${r.advances?' · سلف '+u.n0(r.advances):''}</small>
      ${hasSys ? `<small>🧮 المحسوب ${u.n0(r.accounted)} مقابل مبيعات السيستم ${u.n0(r.systemTotal)}${r.lateCash?' · فواتير بعد التقفيل '+u.n0(r.lateCash):''}</small>` : ''}
      ${r.received ? `<small>✅ استلم: ${u.esc(r.receivedByName||'')}${r.receivedAt?' · '+u.caiKey(r.receivedAt).slice(5)+' '+u.hm(r.receivedAt):''}</small>` : ''}
    </div>
    ${pill}${r.received ? '<span class="pill p-good">اتحصّل</span>' : `<button class="btn g" onclick="O2.days.receive('${u.esc(r.id)}')">✅ تم الاستلام</button>`}
  </div>`;
}
function render(){
  start();
  const pend = pending(); const pendCash = pend.reduce((s,r)=> s + handedOf(r), 0);
  u.head('📥 استلام الأيام', pend.length ? pend.length + ' يوم لسه ماتحصّلش · ' + u.n0(pendCash) + ' ج مستنية' : 'كل الأيام اتحصّلت ✅');
  const brs = [...new Set(recs.map(r=> r.branch).filter(Boolean))].sort();
  const seg = `<div class="seg full"><button class="${view==='pending'?'on':''}" onclick="O2.days.view('pending')">⏳ لسه ${pend.length}</button><button class="${view==='done'?'on':''}" onclick="O2.days.view('done')">✅ اتحصّلت</button><button class="${view==='all'?'on':''}" onclick="O2.days.view('all')">الكل · ${WINDOW_DAYS} يوم</button></div>`;
  const chips = brs.length > 1 ? `<div class="seg full" style="flex-wrap:wrap"><button class="${!branch?'on':''}" onclick="O2.days.branch('')">كل الفروع</button>${brs.map(b=>`<button class="${b===branch?'on':''}" onclick="O2.days.branch('${u.esc(b)}')">${u.esc(b.replace('echarpe ',''))}</button>`).join('')}</div>` : '';
  if(!loaded) return seg + chips + '<div class="card"><div class="skel"></div></div>';
  if(err) return seg + chips + `<div class="card"><b style="color:var(--bad)">تعذر التحميل: ${u.esc(err)}</b></div>`;
  const list = recs.filter(r=> (view==='all' || (view==='pending' ? !r.received : !!r.received)) && (!branch || r.branch===branch));
  if(!list.length) return seg + chips + `<div class="empty">${view==='pending' ? 'مفيش أيام مستنية استلام ✅' : 'مفيش أيام هنا'}</div>`;
  const byBr = {}; list.forEach(r=>{ const b = r.branch || '—'; (byBr[b] = byBr[b]||[]).push(r); });
  return seg + chips + Object.keys(byBr).sort().map(b=>{ const l = byBr[b]; const pc = l.filter(r=>!r.received).reduce((s,r)=> s + handedOf(r), 0); return `<div class="card"><h3>📍 ${u.esc(b)} <small>${l.length} يوم${pc?' · مستني '+u.n0(pc)+' ج':''}</small></h3>${l.map(row).join('')}</div>`; }).join('')
    + '<div class="hint full">نفس المستند اللي POS بيكتبه (dayclose_الفرع_التاريخ) — «تم الاستلام» من هنا أو من الكاشير بيظهر في الاتنين. مفيش مبيعات ولا إجماليات هنا غير اللي التقفيلة سجلته.</div>';
}
O2.days = {
  view(v){ view = v; u.render(); }, branch(b){ branch = b; u.render(); },
  async receive(id){
    const r = recs.find(x=> x.id===id); if(!r) return;
    if(r.received){ u.toast('اليوم ده اتستلم قبل كده'); return; }
    if(!confirm('تم استلام يوم ' + r.date + ' — ' + r.branch + '\nالمسلّم كاش: ' + u.n0(handedOf(r)) + ' ج')) return;
    try{
      const ref = u.db.collection('pos_test_settings').doc(id);
      const s = await ref.get();
      if(s.exists && (s.data()||{}).received){ u.toast('اليوم ده اتستلم قبل كده'); return; }
      await ref.set({ received:true, receivedAt: Date.now(), receivedById:'office', receivedByName:'المالك (Office)' }, { merge:true });
      u.toast('اتستلم ✅'); u.render();
    }catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  }
};
O2.register('days', { icon:'📥', title:'استلام الأيام', desc:'تقفيلات الفروع: مين قفل ومضى · مين كان واقف · المسلّم كاش · الفرق · واللي اتحصّل', order:60, tab:'more', badge(){ start(); return pending().length; }, enter(){ start(); }, render });
})();
