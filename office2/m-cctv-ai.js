/* ============================================================
   🤖 Office 2 — مراجع الكاميرات الذكي
   ------------------------------------------------------------
   office_cctv_ai/{dayKey}_{branch}: تقرير Claude عن يوم كل فرع (functions/cctvAgent.js)
   · كل لحظة ليها زرار يفتح «مراجعة اليوم» في الكاميرات على وقتها بالظبط
   · المالك بيعلّم اللحظة ✓ طبيعي / 🚩 مشكلة → feedback.{ref} — الوكيل بيتعلم منها
   · «شغّل دلوقتي» = الدالة cctvAgentRun (المالك بس)
   ============================================================ */
(function(){
'use strict';
const u = O2.u;
const FN = 'https://us-central1-customer-feedback-8ac1d.cloudfunctions.net/cctvAgentRun';
const RISK = { high:['p-bad','🔴 خطر'], medium:['p-acc','🟠 يستاهل نظرة'], low:['p-good','🟢 هادي'] };
const SEV = { high:'🔴', medium:'🟠', low:'🟡' };
const st = { day:'', rows:[], loaded:false, loading:false, err:'', running:false };
function yesterday(){ return u.caiKey(Date.now() - u.DAY); }
async function load(){
  if(st.loading) return; st.loading = true; if(!st.day) st.day = yesterday();
  const day = st.day;
  try{ const s = await u.db.collection('office_cctv_ai').where('dayKey','==',day).get(); if(day !== st.day) return; st.rows = s.docs.map(d=> Object.assign({ id:d.id }, d.data())); st.err = ''; }
  catch(e){ st.err = String(e && (e.code||e.message)); }
  finally{ st.loading = false; st.loaded = true; u.render(); }
}
function shift(dir){
  const a = st.day.split('-').map(Number), t = u.caiStamp(a[0],a[1],a[2],12,0) + dir*u.DAY;
  if(dir > 0 && u.caiKey(t) > u.caiKey(Date.now())) return;
  st.day = u.caiKey(t); st.loaded = false; st.rows = []; load();
}
function moment(r, m){
  const fb = (r.feedback||{})[m.ref] || '';
  const meta = [m.time, m.employee, m.invoiceNo ? 'فاتورة #' + m.invoiceNo : '', m.amount ? u.n0(m.amount) + ' ج' : ''].filter(Boolean).map(u.esc).join(' · ');
  return `<div class="row" style="cursor:default;flex-wrap:wrap"><div class="n"><b>${SEV[m.severity]||'🟠'} ${u.esc(m.title)}</b><small>${meta}</small><small>${u.esc(m.why)}</small>${m.watchFor ? `<small>👁 بص على: ${u.esc(m.watchFor)}</small>` : ''}</div>
    <span class="btns" style="margin:0;width:100%"><button class="btn p" onclick="O2.cctvAi.open('${u.esc(r.id)}','${u.esc(m.ref)}')">📼 افتح في الكاميرا</button>
    <button class="btn ${fb==='ok'?'g':''}" onclick="O2.cctvAi.mark('${u.esc(r.id)}','${u.esc(m.ref)}','ok')">✓ طبيعي</button>
    <button class="btn ${fb==='bad'?'r':''}" onclick="O2.cctvAi.mark('${u.esc(r.id)}','${u.esc(m.ref)}','bad')">🚩 مشكلة</button></span></div>`;
}
function card(r){
  if(r.error && !r.headline) return `<div class="card"><h3>${u.esc(r.branchName||r.branch)}</h3><b style="color:var(--bad)">المراجعة فشلت: ${u.esc(r.error)}</b></div>`;
  const k = RISK[r.risk] || RISK.medium, s = r.stats || {};
  const list = (title, a)=> (a && a.length) ? `<div class="hint" style="margin-top:8px"><b>${title}</b>${a.map(x=> `<div>• ${u.esc(x)}</div>`).join('')}</div>` : '';
  return `<div class="card"><h3>${u.esc(r.branchName||r.branch)} <small><span class="pill ${k[0]}">${k[1]}</span></small></h3>
    <div class="hint">${s.invoices||0} فاتورة · ${s.removals||0} حذف (${u.n0(s.removedValue||0)} ج) · ${s.alerts||0} تنبيه</div>
    <div class="alert i" style="cursor:default;display:block;margin-top:6px">${u.esc(r.headline||'')}</div>
    ${(r.moments||[]).map(m=> moment(r, m)).join('')}
    ${list('📈 أنماط', r.patterns)}${list('✅ شكلها غريب بس طبيعية', r.clear)}</div>`;
}
function render(){
  if(!st.day) st.day = yesterday();
  if(!st.loaded) setTimeout(load, 0);
  u.head('🤖 مراجع الكاميرات الذكي', u.dayName(u.caiStamp(...st.day.split('-').map(Number), 12, 0)) + ' ' + st.day);
  const nav = `<div class="btns full"><button class="btn" onclick="O2.cctvAi.shift(-1)">→ اليوم اللي قبله</button><button class="btn" onclick="O2.cctvAi.shift(1)" ${st.day >= u.caiKey(Date.now()) ? 'disabled' : ''}>اليوم اللي بعده ←</button></div>`;
  const run = `<div class="btns full"><button class="btn w" onclick="O2.cctvAi.run()" ${st.running ? 'disabled' : ''}>${st.running ? '⏳ الوكيل بيراجع… (دقيقة لـ 3)' : '▶️ راجع اليوم ده دلوقتي'}</button></div>`;
  if(!st.loaded) return nav + '<div class="card"><div class="skel"></div></div>';
  if(st.err) return nav + `<div class="card"><b style="color:var(--bad)">تعذر التحميل: ${u.esc(st.err)}</b></div>` + run;
  const order = { high:0, medium:1, low:2 };
  const rows = st.rows.slice().sort((a,b)=> (order[a.risk]??1) - (order[b.risk]??1));
  const body = rows.length ? rows.map(card).join('') : `<div class="empty">مفيش تقرير لليوم ده لسه — المراجعة بتشتغل لوحدها 3 الفجر عن امبارح</div>`;
  return nav + body + run;
}
O2.cctvAi = {
  shift,
  open(id, ref){
    const r = st.rows.find(x=> x.id===id); const m = r && (r.moments||[]).find(x=> x.ref===ref); if(!m) return;
    const ok = O2.cctv && O2.cctv.reviewSale && O2.cctv.reviewSale({ branch: r.branchName || r.branch, createdAtMs: m.atMs, invoiceCode: m.invoiceCode || '' });
    if(!ok) u.toast('الكاميرات مش متاحة للفرع ده');
  },
  async mark(id, ref, v){
    const r = st.rows.find(x=> x.id===id); if(!r) return;
    const cur = (r.feedback||{})[ref]; const next = cur === v ? firebase.firestore.FieldValue.delete() : v;
    try{ await u.db.collection('office_cctv_ai').doc(id).update({ ['feedback.' + ref]: next }); r.feedback = r.feedback || {}; if(cur === v) delete r.feedback[ref]; else r.feedback[ref] = v; u.toast(cur === v ? 'اتشال' : 'اتسجّل — الوكيل هيتعلم منه'); u.render(); }
    catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  },
  async run(){
    if(st.running) return; st.running = true; u.render();
    try{
      const cu = u.auth.currentUser; const tok = cu ? await cu.getIdToken() : '';
      const res = await fetch(FN, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + tok }, body: JSON.stringify({ data:{ dayKey: st.day } }) });
      const j = await res.json().catch(()=> null);
      if(!res.ok || (j && j.error)) throw new Error((j && j.error && j.error.message) || ('HTTP ' + res.status));
      const bad = ((j && j.result && j.result.results) || []).filter(x=> x.error);
      u.toast(bad.length ? 'خلصت مع أخطاء في ' + bad.length + ' فرع' : 'المراجعة خلصت ✅');
    }catch(e){ u.toast('تعذر: ' + e.message); }
    st.running = false; st.loaded = false; load();
  }
};
O2.register('cctvAi', { icon:'🤖', title:'مراجع الكاميرات الذكي', desc:'Claude بيراجع يوم كل فرع ويقولك تبص على أنهي لحظات في كاميرا الكاشير وليه', order:11, tab:'more',
  badge(){ return st.rows.filter(r=> r.risk==='high').length; }, enter(){ if(!st.day) st.day = yesterday(); }, render });
})();
