/* ============================================================
   ✅ Office 2 — التاسكات الأسبوعية (منقولة من Office/office.js ofLoadTasks…)
   ------------------------------------------------------------
   · sales_task_weeks/{empId__weekKey}  → تاسك الأسبوع (التاريخ)
   · sales_tasks/{empId}                → اللي تطبيق الحضور بيقراه (الحالي)
   · sales_task_submissions             → صور التنفيذ · القبول/الرفض بيتكتب عليها
   الأسبوع بيبدأ السبت، ويوم الشغل بيبدأ الساعة 6 الصبح (نفس sales/Office).
   ============================================================ */
(function(){
'use strict';
const u = O2.u;
const WEEK_START = 6, DAY_CUT = 6, WEEK = 7*u.DAY;
let branch = '', offset = 0; const cache = {};   // 'branch|weekKey' → { weeks, subs, live, loaded, loading, err, subsErr }

function weekStartMs(off){
  let ms = Date.now(); if(u.caiParts(ms).h < DAY_CUT) ms -= u.DAY;
  const p = u.caiParts(ms); const todayUTC = Date.UTC(p.y, p.m-1, p.d);
  const back = (new Date(todayUTC).getUTCDay() - WEEK_START + 7) % 7;
  return todayUTC - back*u.DAY + (Number(off)||0)*WEEK;
}
function weekKey(ms){ const d = new Date(ms); return 'w' + d.getUTCFullYear() + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + String(d.getUTCDate()).padStart(2,'0'); }
function weekLabel(ms){ const f = (x)=> x.getUTCDate() + '/' + (x.getUTCMonth()+1); return f(new Date(ms)) + ' → ' + f(new Date(ms + 6*u.DAY)); }
function key(){ return branch + '|' + weekKey(weekStartMs(offset)); }
function cur(){ return cache[key()] || null; }

async function load(){
  const br = branch; const wkMs = weekStartMs(offset); const wk = weekKey(wkMs); const k = br + '|' + wk;
  const c = cache[k] = { weeks:{}, subs:[], live:{}, loaded:false, loading:true, err:'', subsErr:'' };
  // كل استعلام لوحده — لو التسليمات فشلت (صلاحيات/index) التاسكات تفضل ظاهرة
  try{ const s = await u.db.collection('sales_task_weeks').where('branch','==',br).where('weekKey','==',wk).get(); s.docs.forEach(d=>{ c.weeks[d.id] = d.data(); }); }
  catch(e){ c.err = String(e && (e.code||e.message)); c.loading = false; c.loaded = true; u.render(); return; }
  try{ const s = await u.db.collection('sales_task_submissions').where('branch','==',br).where('submittedAt','>=',wkMs).where('submittedAt','<',wkMs + WEEK).get(); c.subs = s.docs.map(d=> Object.assign({ id:d.id }, d.data())); }
  catch(e){ c.subsErr = String(e && (e.code||e.message)); }
  try{ const s = await u.db.collection('sales_tasks').where('branch','==',br).get(); s.docs.forEach(d=>{ c.live[d.id] = d.data(); }); }catch(e){}
  c.loading = false; c.loaded = true; u.render();
}
function ensure(){ if(!branch) branch = u.branches()[0] || ''; if(branch && !cur()) setTimeout(load, 0); }
function badge(){ const c = cur(); return c ? c.subs.filter(s=> !s.confirmed && !s.rejected).length : 0; }

function patch(act, now){ const t = Number(now) || Date.now(); return act === 'ok' ? { confirmed:true, confirmedAt:t, rejected:false, rejectedAt:null } : { confirmed:false, confirmedAt:null, rejected:true, rejectedAt:t }; }
function subRow(s){
  const st = s.confirmed ? 'ok' : (s.rejected ? 'rej' : 'wait');
  const pill = st==='ok' ? '<span class="pill p-good">✅ اتقبل</span>' : (st==='rej' ? '<span class="pill p-bad">✖ اترفض</span>' : '<span class="pill p-warn">⏳ مستني قرارك</span>');
  const when = s.submittedAt ? (u.dayName(s.submittedAt) + ' ' + u.caiKey(s.submittedAt).slice(5) + ' · ' + u.hm(s.submittedAt)) : '';
  const thumb = s.photoURL ? `<img src="${u.esc(s.photoURL)}" onclick="O2.tasks.photo('${u.esc(s.id)}')" style="width:54px;height:54px;object-fit:cover;border-radius:10px;cursor:pointer;flex:0 0 auto">` : '<span class="tag">مفيش صورة</span>';
  return `<div class="row" style="cursor:default;gap:8px">${thumb}<div class="n">${pill}<small>${u.esc(when)}</small></div><span class="btns" style="margin:0"><button class="btn g" ${st==='ok'?'disabled':''} onclick="O2.tasks.decide('${u.esc(s.id)}','ok')">✅</button><button class="btn r" ${st==='rej'?'disabled':''} onclick="O2.tasks.decide('${u.esc(s.id)}','rej')">✖</button></span></div>`;
}
function render(){
  ensure();
  const wkMs = weekStartMs(offset), wk = weekKey(wkMs); const c = cur();
  u.head('✅ التاسكات', 'الأسبوع: ' + weekLabel(wkMs) + (offset===0 ? ' (الحالي)' : ''));
  const chips = `<div class="seg full" style="flex-wrap:wrap">${u.branches().map(b=>`<button class="${b===branch?'on':''}" onclick="O2.tasks.branch('${u.esc(b)}')">${u.esc(b.replace('echarpe ',''))}</button>`).join('')}</div>`;
  const nav = `<div class="seg full"><button onclick="O2.tasks.week(-1)">◀ اللي فات</button><button class="${offset===0?'on':''}" onclick="O2.tasks.week(0)">الأسبوع ده</button><button onclick="O2.tasks.week(1)">اللي جاي ▶</button></div>`;
  if(!branch) return chips + nav + '<div class="empty">لسه مفيش فروع</div>';
  if(!c || c.loading) return chips + nav + '<div class="card"><div class="skel"></div></div>';
  if(c.err) return chips + nav + `<div class="card"><b style="color:var(--bad)">تعذر التحميل: ${u.esc(c.err)}</b><div class="hint">لو الرسالة بتقول index، افتح اللينك اللي في الكونسول مرة واحدة.</div></div>`;
  const emps = u.D.employees.filter(e=> e.branch===branch && e.status !== 'terminated' && !e.deletedAt && e.active !== false).sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''),'ar'));
  if(!emps.length) return chips + nav + '<div class="empty">مفيش موظفين في الفرع ده</div>';
  const cards = emps.map(e=>{
    let rec = c.weeks[e.id + '__' + wk] || null, fromLive = false;
    if(!rec && offset===0){ const lv = c.live[e.id]; if(lv && lv.taskDescription && (!lv.weekKey || lv.weekKey===wk)){ rec = lv; fromLive = true; } }
    const desc = rec ? (rec.taskDescription||'') : '';
    const subs = c.subs.filter(s=> s.employeeId===e.id).sort((a,b)=> (b.submittedAt||0) - (a.submittedAt||0));
    const ok = subs.filter(s=> s.confirmed).length, rej = subs.filter(s=> s.rejected).length, wait = subs.length - ok - rej;
    const chip = subs.length ? `${ok?'<span class="pill p-good">✅ '+ok+'</span> ':''}${wait?'<span class="pill p-warn">⏳ '+wait+'</span> ':''}${rej?'<span class="pill p-bad">✖ '+rej+'</span>':''}` : '<span class="pill p-gray">مفيش تسليم</span>';
    return `<div class="card"><h3>${u.esc(e.name||'—')} <small>${chip}</small></h3>
      <div class="row first" onclick="O2.tasks.assign('${u.esc(e.id)}')"><div class="n"><b>${desc ? u.esc(desc) : '<span style="color:var(--sub)">مفيش تاسك — اضغط لتحديد</span>'}</b><small>${rec && rec.assignedAt ? 'اتحدد ' + u.dayName(rec.assignedAt) + ' ' + u.caiKey(rec.assignedAt).slice(5) + (fromLive ? ' — من تطبيق الحضور' : '') : ''}</small></div><span class="pill p-acc">✏️</span></div>
      ${subs.map(subRow).join('')}</div>`;
  }).join('');
  const warn = c.subsErr ? `<div class="alert w full" style="cursor:default">⚠️ التاسكات ظاهرة، لكن <b>التسليمات مش بتتقري</b>: ${u.esc(c.subsErr)}</div>` : '';
  return chips + nav + warn + cards + '<div class="hint full">التاسك اللي بتكتبه هنا هو اللي الموظفة بتشوفه في تطبيق الحضور وبتسلّم عليه صورة · اضغط الصورة تكبر · ✅ تقبل · ✖ ترفض وهي تصوّر تاني · الأسابيع القديمة محفوظة.</div>';
}

O2.tasks = {
  branch(b){ branch = b; u.render(); ensure(); },
  week(d){ offset = d===0 ? 0 : offset + d; u.render(); ensure(); },
  photo(id){ const c = cur(); const s = c && c.subs.find(x=> x.id===id); if(!s || !s.photoURL) return; u.sheet(`<h2>📷 ${u.esc(s.employeeName||'')}</h2><div class="hint">${u.esc(s.taskDescription||'')} · ${u.hm(s.submittedAt)}</div><img src="${u.esc(s.photoURL)}" style="width:100%;border-radius:12px;background:#000">`); },
  async decide(id, act){
    const c = cur(); const s = c && c.subs.find(x=> x.id===id); if(!s) return;
    const head = act==='ok' ? '✅ تقبل التنفيذ ده؟' : '✖ ترفض التنفيذ ده؟';
    if(!confirm(head + '\n\n' + (s.employeeName||'—') + ' — ' + (s.branch||'—') + '\nالتاسك: ' + (s.taskDescription||'—') + (act==='ok' ? '' : '\n\nالموظفة هتشوف علامة رفض وهتقدر تصوّر تاني.'))) return;
    const p = patch(act, Date.now());
    try{ await u.db.collection('sales_task_submissions').doc(id).update(p); Object.assign(s, p); u.toast(act==='ok' ? 'اتقبل ✅' : 'اترفض'); u.render(); }
    catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  },
  assign(empId){
    const e = u.empById(empId); if(!e) return; const c = cur(); const wk = weekKey(weekStartMs(offset));
    const rec = (c && c.weeks[empId + '__' + wk]) || (offset===0 && c && c.live[empId]) || {};
    u.sheet(`<h2>✏️ تاسك ${u.esc(e.name||'')}</h2><div class="hint">الأسبوع ${weekLabel(weekStartMs(offset))} · ${u.esc(e.branch||'')}</div><textarea id="tkDesc" rows="3" placeholder="تاسك الأسبوع… (مثلاً: سكشن A)" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:12px;font-family:inherit">${u.esc(rec.taskDescription||'')}</textarea><div class="btns"><button class="btn p w" onclick="O2.tasks.save('${u.esc(empId)}')">حفظ</button></div>`);
  },
  async save(empId){
    const e = u.empById(empId); if(!e) return; const el = document.getElementById('tkDesc'); const desc = el ? el.value.trim() : '';
    const wk = weekKey(weekStartMs(offset));
    const payload = { employeeId: e.id, employeeName: e.name||'', branch, taskDescription: desc, weekKey: wk, assignedAt: Date.now(), assignedBy:'office2' };
    try{
      await u.db.collection('sales_tasks').doc(e.id).set(payload, { merge:true });            // اللي تطبيق الحضور بيقراه
      await u.db.collection('sales_task_weeks').doc(e.id + '__' + wk).set(payload, { merge:true });   // سجل الأسبوع
      const c = cur(); if(c){ c.weeks[e.id + '__' + wk] = payload; c.live[e.id] = payload; }
      u.closeSheet(); u.toast('اتحفظ ✅'); u.render();
    }catch(err){ u.toast('تعذر: ' + (err && (err.code||err.message))); }
  },
  weekKey, weekStartMs, patch
};
O2.register('tasks', { icon:'✅', title:'التاسكات', desc:'تاسك الأسبوع لكل موظفة وصور التنفيذ · قبول أو رفض', order:30, tab:'more', badge, enter(){ ensure(); }, render });
})();
