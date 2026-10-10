/* ============================================================
   🐞 Office 2 — بلاغات المشاكل (منقولة من Office/office.js loadIncidents / _incAuto / renderIncidents)
   ------------------------------------------------------------
   pos_incidents: الكاشير بيبعت بلاغ (ملاحظة + حالة الجهاز + آخر الأحداث) من pos/blackbox.js
   القراءة بس — التعديل الوحيد المسموح بيه في القواعد: علامة seen
   ============================================================ */
(function(){
'use strict';
const u = O2.u;
const DAYS = 30;
let rows = [], loaded = false, loading = false, err = ''; let view = 'new'; const openLog = {};
async function load(){
  if(loading) return; loading = true;
  try{ const s = await u.db.collection('pos_incidents').where('ts','>=', Date.now() - DAYS*u.DAY).get(); rows = s.docs.map(d=> Object.assign({ id:d.id }, d.data())).sort((a,b)=> (b.ts||0) - (a.ts||0)); err = ''; }
  catch(e){ err = String(e && (e.code||e.message)); }
  loading = false; loaded = true; u.render();
}
function start(){ if(!loaded && !loading) setTimeout(load, 0); }
// 🧠 تشخيص تلقائي — نفس بصمات Office القديم
function hints(r){
  const ev = r.events || [], st = r.state || {}, out = [];
  const lostSys = ev.some(e=> e.hasFocus === false) || String(st['النافذة نشطة']||'').indexOf('لأ') >= 0;
  const errs = ev.filter(e=> String(e.kind||'').indexOf('❌') >= 0);
  const netOff = ev.some(e=> String(e.msg||'').indexOf('النت قطع') >= 0);
  if(lostSys) out.push('🎯 تركيز النظام ضايع — النوع (ب)، الإصلاح في main.js مش في الويب');
  if(errs.length) out.push('❌ ' + errs.length + ' خطأ برمجي — أولهم: ' + u.esc(errs[0].msg||''));
  if(netOff) out.push('🌐 النت اتقطع أثناء الجلسة');
  if(!out.length) out.push('لا توجد بصمة واضحة — محتاج قراية السجل');
  return out;
}
function logText(r){
  let t = ''; const st = r.state || {}; Object.keys(st).forEach(k=>{ t += k + ': ' + st[k] + '\n'; });
  t += '\n──── الأحداث (الأحدث تحت) ────\n';
  (r.events||[]).forEach(e=>{ t += e.t + ' [' + e.kind + '] ' + e.msg + (e.hasFocus === false ? '  ⚠️(النافذة مش نشطة)' : '') + (e.active ? '  {' + e.active + '}' : '') + '\n'; });
  return t;
}
function card(r){
  const when = u.dayName(r.ts||0) + ' ' + u.caiKey(r.ts||0).slice(5) + ' · ' + u.hm(r.ts||0);
  return `<div class="card"><h3>${u.esc(r.note||'—')} ${r.seen ? '<small><span class="pill p-gray">اتشاف</span></small>' : '<small><span class="pill p-bad">جديد</span></small>'}</h3>
    <div class="hint">🏬 ${u.esc(String(r.branch||'—'))} · 👤 ${u.esc(r.employeeName||'—')} · ${when}</div>
    <div class="alert i" style="cursor:default;display:block">${hints(r).map(h=> `<div>${h}</div>`).join('')}</div>
    <div class="btns"><button class="btn" onclick="O2.incidents.log('${u.esc(r.id)}')">📋 ${openLog[r.id] ? 'اقفل السجل' : 'السجل الكامل'} (${(r.events||[]).length})</button>${r.seen ? '' : `<button class="btn g" onclick="O2.incidents.seen('${u.esc(r.id)}')">اتشاف ✓</button>`}</div>
    ${openLog[r.id] ? `<pre style="margin-top:7px;padding:9px;font-size:10.5px;background:#eceff4;border-radius:10px;max-height:300px;overflow:auto;white-space:pre-wrap;direction:ltr;text-align:left">${u.esc(logText(r))}</pre>` : ''}</div>`;
}
function render(){
  start();
  const unseen = rows.filter(r=> !r.seen);
  u.head('🐞 بلاغات المشاكل', 'آخر ' + DAYS + ' يوم · ' + (unseen.length ? unseen.length + ' جديد' : 'مفيش جديد'));
  const seg = `<div class="seg full"><button class="${view==='new'?'on':''}" onclick="O2.incidents.view('new')">🆕 جديد ${unseen.length}</button><button class="${view==='all'?'on':''}" onclick="O2.incidents.view('all')">الكل ${rows.length}</button></div>`;
  if(!loaded) return seg + '<div class="card"><div class="skel"></div></div>';
  if(err) return seg + `<div class="card"><b style="color:var(--bad)">تعذر التحميل: ${u.esc(err)}</b></div>`;
  const list = view==='new' ? unseen : rows;
  if(!list.length) return seg + `<div class="empty">${view==='new' ? 'مفيش بلاغات جديدة ✅' : 'مفيش بلاغات آخر ' + DAYS + ' يوم ✅'}</div>`;
  return seg + list.map(card).join('') + `<div class="btns full"><button class="btn w" onclick="O2.incidents.reload()">🔄 تحديث البلاغات</button></div>`;
}
O2.incidents = {
  view(v){ view = v; u.render(); },
  log(id){ openLog[id] = !openLog[id]; u.render(); },
  reload(){ loaded = false; load(); },
  async seen(id){
    const r = rows.find(x=> x.id===id); if(!r || r.seen) return;
    try{ await u.db.collection('pos_incidents').doc(id).update({ seen:true }); r.seen = true; u.toast('اتشاف ✅'); u.render(); }
    catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  },
  hints
};
O2.register('incidents', { icon:'🐞', title:'بلاغات المشاكل', desc:'بلاغات الكاشير من الفروع مع سجل الجهاز وتشخيص تلقائي', order:32, tab:'more', badge(){ start(); return rows.filter(r=> !r.seen).length; }, enter(){ start(); }, render });
})();
