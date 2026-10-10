/* ============================================================
   📦 Office 2 — النواقص (منقولة من Office/office.js renderShort / officeCloseShort)
   ------------------------------------------------------------
   sales_shortages: الموظفة بتطلب من تطبيق sales (الاسم · الكود · الكمية · المخزون وقت الطلب)
   المالك بيعلّم «اتجاب» → status:'done' + doneAt + doneFrom (نفس حقول Office القديم)
   ============================================================ */
(function(){
'use strict';
const u = O2.u;
let open = [], done = [], started = false, loaded = false, doneLoaded = false, err = '';
let view = 'open', branch = '';
function start(){
  if(started) return; started = true;
  u.db.collection('sales_shortages').where('status','==','open').onSnapshot(s=>{ open = s.docs.map(d=> Object.assign({ id:d.id }, d.data())); loaded = true; err = ''; u.render(); }, e=>{ err = String(e && (e.code||e.message)); loaded = true; u.render(); });
}
async function loadDone(){
  if(doneLoaded) return; doneLoaded = true;
  try{ const s = await u.db.collection('sales_shortages').where('doneAt','>=', Date.now() - 30*u.DAY).get(); done = s.docs.map(d=> Object.assign({ id:d.id }, d.data())).filter(x=> x.status==='done'); }catch(e){}
  u.render();
}
function code(x){ return x.barcode ? String(x.barcode) : ''; }
function row(x, isOpen){
  const when = u.dayName(x.ts||0) + ' ' + u.caiKey(x.ts||0).slice(5) + ' · ' + u.hm(x.ts||0);
  return `<div class="row" style="cursor:default;flex-wrap:wrap"><div class="n"><b>${u.esc(x.productName || ('كود ' + code(x)))} <span class="pill p-acc">× ${x.qty||1}</span></b><small>${x.detail ? u.esc(x.detail) + ' · ' : ''}${code(x) ? 'كود ' + u.esc(code(x)) + ' · ' : ''}مخزون وقت الطلب: ${x.currentStock==null ? '—' : u.esc(x.currentStock)}</small><small>طلبتها ${u.esc(x.empName||'—')} · ${when}${!isOpen && x.doneAt ? ' · اتجابت ' + u.caiKey(x.doneAt).slice(5) : ''}</small></div>${isOpen ? `<button class="btn g" onclick="O2.short.done('${u.esc(x.id)}')">✅ اتجاب</button>` : '<span class="pill p-good">✅</span>'}</div>`;
}
function render(){
  start(); if(view==='done') loadDone();
  u.head('📦 النواقص', open.length ? open.length + ' طلب مستني' : 'مفيش نواقص مطلوبة');
  const brs = u.branches();
  const seg = `<div class="seg full"><button class="${view==='open'?'on':''}" onclick="O2.short.view('open')">📦 مطلوب ${open.length}</button><button class="${view==='done'?'on':''}" onclick="O2.short.view('done')">✅ اتجاب · 30 يوم</button></div>`;
  const chips = `<div class="seg full" style="flex-wrap:wrap"><button class="${!branch?'on':''}" onclick="O2.short.branch('')">كل الفروع</button>${brs.map(b=>`<button class="${b===branch?'on':''}" onclick="O2.short.branch('${u.esc(b)}')">${u.esc(b.replace('echarpe ',''))}</button>`).join('')}</div>`;
  if(!loaded) return seg + chips + '<div class="card"><div class="skel"></div></div>';
  if(err) return seg + chips + `<div class="card"><b style="color:var(--bad)">تعذر التحميل: ${u.esc(err)}</b></div>`;
  const list = (view==='open' ? open : done).filter(x=> !branch || x.branch===branch).sort((a,b)=> (b.ts||0) - (a.ts||0));
  if(!list.length) return seg + chips + `<div class="empty">${view==='open' ? 'مفيش نواقص مطلوبة ✅' : 'مفيش حاجة اتجابت في آخر 30 يوم'}</div>`;
  const byBr = {}; list.forEach(x=>{ const b = x.branch || '—'; (byBr[b] = byBr[b]||[]).push(x); });
  return seg + chips + Object.keys(byBr).sort().map(b=> `<div class="card"><h3>📍 ${u.esc(b)} <small>${byBr[b].length}</small></h3>${byBr[b].map(x=> row(x, view==='open')).join('')}</div>`).join('');
}
O2.short = {
  view(v){ view = v; u.render(); }, branch(b){ branch = b; u.render(); },
  async done(id){
    const x = open.find(y=> y.id===id); if(!x) return;
    const what = (x.productName || ('كود ' + code(x))) + ' × ' + (x.qty||1);
    if(!confirm('✅ تعلّم النقص ده إنه اتجاب؟\n\n' + what + (x.branch ? '\n' + x.branch : '') + '\n\nهيختفي من القايمة.')) return;
    try{ await u.db.collection('sales_shortages').doc(id).update({ status:'done', doneAt: Date.now(), doneFrom:'office2' }); u.toast('اتجاب ✅'); }
    catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  }
};
O2.register('short', { icon:'📦', title:'النواقص', desc:'الأصناف اللي الفروع طلبتها · الكود والكمية والمخزون وقت الطلب', order:31, tab:'more', badge(){ start(); return open.length; }, enter(){ start(); }, render });
})();
