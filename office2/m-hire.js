/* ============================================================
   💼 Office 2 — التوظيف (منقول من Office/office.js: المتقدّمين · الدعوات · طلبات التسجيل · الشواغر · ملف الموظفة)
   ------------------------------------------------------------
   الحلقة كاملة: إعلان (apply/) ← job_applications ← فرز ← دعوة staff_invites ← تسجيل (join/) sales_registrations + staff_docs ← اعتماد → sales_employees
   · الشواغر في pos_test_settings/job_openings (استمارة التقديم بتقرا منها)
   · نفس المجموعات ونفس الحقول اللي Office القديم بيكتبها
   ============================================================ */
(function(){
'use strict';
const u = O2.u;
const HIRE_ROLES = { sales_social:'مبيعات ومساعدة تسويق رقمي', cashier:'كاشير ومبيعات' };
const AP_ROLES = { sales_social:'مبيعات وسوشيال', cashier:'كاشير ومبيعات', setup:'تجهيز الفرع' };
const OP_ROLES = { sales_social:'مبيعات وسوشيال', cashier:'كاشير ومبيعات', setup:'تجهيز الفرع ٧–١٠' };
const AP_SHIFTS = { morning:'🌅 صباحي', evening:'🌆 مسائي', setup:'✨ تجهيز ٧–١٠', any:'🤝 أي شيفت' };
const AP_STATUS = { new:'🆕 جديد', interview:'📞 للمقابلة', hired:'✅ اتوظف', rejected:'❌ مرفوض' };
const HIRE_DOCS = { id_front:'وجه البطاقة', id_back:'ظهر البطاقة', edu_front:'المؤهل — الوجه', edu_back:'المؤهل — الظهر', bill:'إثبات السكن', signature:'التوقيع' };
const FALLBACK_BR = ['echarpe El Rehab','echarpe Madinaty','echarpe City Centre'];

let apps = [], regs = [], invites = [], docsByReg = {}, docsErr = '', docById = {};
let lightStarted = false, heavyStarted = false, appsLoaded = false, regsLoaded = false;
let view = 'apps', apStatus = 'new', apBranch = '', apShift = '', apOldest = false;
let hv = { brand:'echarpe', branch:'', role:'sales_social', days:3 }, lastLink = '';
let openings = [], opLoaded = false, opLoading = false, opDirty = false;
let efQ = '', efSel = null; const efDocs = {};

/* ---------- تحميل ---------- */
function startLight(){
  if(lightStarted) return; lightStarted = true;
  u.db.collection('job_applications').where('ts','>=', Date.now() - 90*u.DAY).onSnapshot(s=>{ apps = s.docs.map(d=> Object.assign({ id:d.id }, d.data())); appsLoaded = true; u.render(); }, e=>{ console.warn('applicants', e && e.code); appsLoaded = true; u.render(); });
  u.db.collection('sales_registrations').onSnapshot(s=>{ regs = s.docs.map(d=> Object.assign({ id:d.id }, d.data())); regsLoaded = true; u.render(); }, e=>{ console.warn('regs', e && e.code); regsLoaded = true; u.render(); });
}
function startHeavy(){
  startLight(); if(heavyStarted) return; heavyStarted = true;
  u.db.collection('staff_invites').onSnapshot(s=>{ invites = s.docs.map(d=> Object.assign({ id:d.id }, d.data())); u.render(); }, e=>{ console.warn('invites', e && e.code); });
  // 📎 الصور تقيلة — آخر 60 يوم بس (زي Office القديم) · ملف الموظفة بيجيب الأقدم عند الطلب
  u.db.collection('staff_docs').where('ts','>=', Date.now() - 60*u.DAY).onSnapshot(s=>{ docsByReg = {}; docsErr = ''; s.docs.forEach(d=>{ const o = Object.assign({ id:d.id }, d.data()); docById[o.id] = o; (docsByReg[o.regId] = docsByReg[o.regId] || []).push(o); }); u.render(); }, e=>{ docsErr = String(e && (e.code||e.message) || 'خطأ'); u.render(); });
}
async function loadOpenings(){
  if(opLoaded || opLoading) return; opLoading = true;
  try{ const d = await u.db.collection('pos_test_settings').doc('job_openings').get(); openings = (d.exists && Array.isArray((d.data()||{}).list)) ? d.data().list.slice() : []; }catch(e){ openings = []; }
  opLoaded = true; opLoading = false; u.render();
}

/* ---------- مساعدات ---------- */
function hvCode(){ const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = new Uint32Array(6); try{ crypto.getRandomValues(r); }catch(e){ for(let i=0;i<6;i++) r[i] = Math.floor(Math.random()*4e9); } let out = ''; for(let i=0;i<6;i++) out += A[r[i] % A.length]; return out; }
function hvLink(code){ return location.origin + '/join/?c=' + code; }
function branchesList(){ const b = u.branches(); return b.length ? b : FALLBACK_BR.concat(['Glow']); }
function brandLabel(brand, branch){ return brand === 'glow' ? 'Glow' : 'echarpe — ' + (branch||''); }
function when(ts){ return ts ? (u.dayName(ts) + ' ' + u.caiKey(ts).slice(5) + ' · ' + u.hm(ts)) : '—'; }
function ago(ts){ const ms = Date.now() - (Number(ts)||0); if(!ts || ms < 0) return ''; const d = Math.floor(ms/u.DAY); if(d === 0) return 'النهاردة'; if(d === 1) return 'من يوم'; if(d < 14) return 'من ' + d + ' أيام'; const w = Math.floor(d/7); if(w < 8) return 'من ' + w + (w===1?' أسبوع':' أسابيع'); const m = Math.floor(d/30); return 'من ' + m + (m===1?' شهر':' شهور'); }
function stale(ts, days){ return ts > 0 && (Date.now() - Number(ts)) > days*u.DAY; }
function copyLink(link){ try{ navigator.clipboard.writeText(link).then(()=> u.toast('اتنسخ ✅'), ()=> prompt('انسخ الرابط:', link)); }catch(e){ prompt('انسخ الرابط:', link); } }
function sel(id, opts, cur, onch){ return `<select id="${id}" onchange="${onch}" style="flex:1 1 120px;padding:9px;border:1px solid var(--line);border-radius:10px;font-family:inherit;font-weight:800">${opts.map(o=>`<option value="${u.esc(o[0])}" ${String(o[0])===String(cur)?'selected':''}>${u.esc(o[1])}</option>`).join('')}</select>`; }
function thumb(d){ return `<img src="${u.esc(d.photo)}" title="${u.esc(HIRE_DOCS[d.kind]||d.kind||'')}" onclick="O2.hire.photo('${u.esc(d.id)}')" style="width:62px;height:62px;object-fit:cover;border-radius:9px;cursor:pointer;flex:0 0 auto">`; }
function thumbs(list){ return `<div style="display:flex;gap:6px;overflow-x:auto;margin-top:8px;padding-bottom:3px">${list.map(thumb).join('')}</div>`; }

/* ---------- 📋 المتقدّمين ---------- */
function rApps(){
  if(!appsLoaded) return '<div class="card"><div class="skel"></div></div>';
  const cnt = k=> apps.filter(a=> (a.status||'new') === k).length;
  const chips = `<div class="seg full" style="flex-wrap:wrap">${Object.keys(AP_STATUS).map(k=>`<button class="${apStatus===k?'on':''}" onclick="O2.hire.apStatus('${k}')">${AP_STATUS[k]} ${cnt(k)}</button>`).join('')}<button class="${!apStatus?'on':''}" onclick="O2.hire.apStatus('')">الكل ${apps.length}</button></div>`;
  const filters = `<div class="card full" style="display:flex;gap:6px;flex-wrap:wrap">${sel('apBranch', [['','كل الفروع']].concat(branchesList().map(b=>[b, b.replace('echarpe ','')])), apBranch, "O2.hire.apBranch(this.value)")}${sel('apShift', [['','كل الشيفتات'],['morning','صباحي'],['evening','مسائي'],['setup','تجهيز ٧–١٠'],['any','أي شيفت']], apShift, "O2.hire.apShift(this.value)")}<button class="btn" onclick="O2.hire.apSort()">${apOldest ? '↓ الأقدم فوق' : '↑ الأحدث فوق'}</button></div>`;
  const rows = apps.filter(a=>{ if(apStatus && (a.status||'new') !== apStatus) return false; if(apBranch && (!Array.isArray(a.branches) || a.branches.indexOf(apBranch) < 0)) return false; if(apShift && a.shift !== apShift && a.shift !== 'any') return false; return true; })
    .sort((a,b)=> apOldest ? (a.ts||0)-(b.ts||0) : (b.ts||0)-(a.ts||0));
  if(!rows.length) return chips + filters + '<div class="empty">مفيش متقدّمين بالفلتر ده</div>';
  const staleN = rows.filter(a=> stale(a.ts, 7) && (a.status||'new')==='new').length;
  const top = `<div class="full hint">${rows.length} متقدّم${staleN ? ` · <b style="color:var(--bad)">⏳ ${staleN} من غير رد من فوق أسبوع</b>` : ''}</div>`;
  return chips + filters + top + rows.slice(0, 60).map(a=>{
    const roles = (a.roles||[]).map(r=> AP_ROLES[r]||r).join(' · ');
    const isStale = stale(a.ts, 7) && (a.status||'new')==='new';
    return `<div class="card"><h3>${u.esc(a.name||'—')} <small>${u.esc(AP_STATUS[a.status||'new']||'')}</small></h3>
      <div class="hint" style="line-height:1.9;font-size:12px">🎂 ${u.esc(a.age||'—')} سنة · 📱 ${u.esc(a.phone||'')}<br>📍 ${u.esc(a.area||'—')} · 🚌 ${u.esc(a.commute||'—')}<br>💼 ${u.esc(roles||'—')}<br>🏬 ${u.esc((a.branches||[]).join(' · '))} · ${u.esc(AP_SHIFTS[a.shift]||'')}<br>🕐 يبدأ ${u.esc(a.startWhen||'—')}${(a.offDays&&a.offDays.length) ? ' · مش متاح ' + u.esc(a.offDays.join('،')) : ''}<br>🧰 ${a.expRetail ? u.esc(a.expWhere||'خبرة سابقة') : 'أول مرة'} · كاشير: ${u.esc({ good:'يعرف', some:'شوية', no:'لأ' }[a.expCashier]||'—')}${a.studying ? '<br>🎓 ' + u.esc(a.college||'') + (a.classes ? ' · ' + u.esc(a.classes) : '') : ''}${a.portfolio ? `<br>🔗 <a class="link" href="${u.esc(a.portfolio)}" target="_blank" rel="noopener">شغله</a>` : ''}${a.notes ? '<br>📝 ' + u.esc(a.notes) : ''}<br>📣 عرف عننا من: ${u.esc(a.source||'—')} · ${when(a.ts)} · ${ago(a.ts)}${isStale ? `<br><b style="color:var(--bad)">⏳ لسه من غير رد ${ago(a.ts)} — يستاهل قرار</b>` : ''}</div>
      <div class="btns"><a class="btn g" href="https://wa.me/2${u.esc(a.whatsapp||a.phone||'')}" target="_blank" rel="noopener" style="text-decoration:none">💬 واتساب</a>${(a.status||'new')!=='interview' ? `<button class="btn" onclick="O2.hire.apSet('${u.esc(a.id)}','interview')">📞 مقابلة</button>` : ''}<button class="btn p" onclick="O2.hire.apInvite('${u.esc(a.id)}')">🔗 ادعُه للتسجيل</button>${(a.status||'new')!=='rejected' ? `<button class="btn r" onclick="O2.hire.apSet('${u.esc(a.id)}','rejected')">✖ رفض</button>` : ''}</div></div>`;
  }).join('');
}

/* ---------- 📄 ورق: دعوة + دعوات مفتوحة + طلبات التسجيل ---------- */
function rDocs(){
  const now = Date.now();
  const echBr = branchesList().filter(b=> !/glow/i.test(b)); const brList = echBr.length ? echBr : FALLBACK_BR;
  if(hv.brand !== 'glow' && brList.indexOf(hv.branch) < 0) hv.branch = brList[0];
  const form = `<div class="card"><h3>🧑‍💼 دعوة موظف جديد</h3><div class="hint">رابط بكود لمرة واحدة — الفرع والوظيفة محدّدين فيه، فالموظفة مش بتختارهم ومفيش فرصة غلط.</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${sel('hvBrand', [['echarpe','echarpe'],['glow','Glow']], hv.brand, "O2.hire.hv('brand',this.value)")}${hv.brand==='glow' ? sel('hvBranch', [['Glow','Glow']], 'Glow', '') : sel('hvBranch', brList.map(b=>[b, b.replace('echarpe ','')]), hv.branch, "O2.hire.hv('branch',this.value)")}${sel('hvRole', Object.keys(HIRE_ROLES).map(k=>[k, HIRE_ROLES[k]]), hv.role, "O2.hire.hv('role',this.value)")}${sel('hvDays', [[3,'تنتهي بعد 3 أيام'],[1,'تنتهي بعد يوم'],[7,'تنتهي بعد 7 أيام']], hv.days, "O2.hire.hv('days',this.value)")}</div>
    <div class="btns"><button class="btn p w" onclick="O2.hire.makeInvite()">🔗 اعمل رابط دعوة</button></div>
    ${lastLink ? `<div class="alert i" style="cursor:default;flex-wrap:wrap"><span style="flex:1;min-width:0"><b>الرابط جاهز — ابعته على واتساب</b><br><span style="word-break:break-all;font-weight:800">${u.esc(lastLink)}</span></span><button class="btn" onclick="O2.hire.copy('${u.esc(lastLink)}')">📋 انسخ</button></div>` : ''}</div>`;
  const open = invites.filter(x=> !x.usedAt && (!x.expiresAt || x.expiresAt > now)).sort((a,b)=> (b.createdAt||0)-(a.createdAt||0));
  const inv = `<div class="card"><h3>🔗 دعوات مفتوحة <small>${open.length}</small></h3>${open.map(x=>{ const left = Math.max(0, Math.ceil(((x.expiresAt||0) - now)/u.DAY)); return `<div class="row" style="cursor:default;flex-wrap:wrap"><div class="n"><b style="font-family:monospace;letter-spacing:2px">${u.esc(x.id)}</b><small>${u.esc(brandLabel(x.brand, x.branch))} · ${u.esc(HIRE_ROLES[x.role]||x.role||'')}${x.applicantName ? ' · لـ' + u.esc(x.applicantName) : ''}</small></div><span class="pill ${left<=1?'p-bad':'p-gray'}">باقي ${left} يوم</span><span class="btns" style="margin:0;width:100%"><button class="btn" onclick="O2.hire.copy('${u.esc(hvLink(x.id))}')">📋 نسخ</button><button class="btn r" onclick="O2.hire.killInvite('${u.esc(x.id)}')">إلغاء</button></span></div>`; }).join('') || '<div class="empty">مفيش دعوات مفتوحة</div>'}</div>`;
  if(!regsLoaded) return form + inv + '<div class="card full"><div class="skel"></div></div>';
  const rows = regs.filter(r=> r && r.source==='join').sort((a,b)=> (b.ts||0)-(a.ts||0)).slice(0, 40);
  const list = rows.map(r=>{
    const st = r.status==='approved' ? '<span class="pill p-good">✅ متعمد</span>' : r.status==='rejected' ? '<span class="pill p-bad">✖ مرفوض</span>' : '<span class="pill p-warn">⏳ مستني قرارك</span>';
    const docs = (docsByReg[r.id]||[]).slice().sort((a,b)=> (a.ts||0)-(b.ts||0));
    const noDocs = `<div class="hint" style="color:var(--bad)">⚠️ مفيش مستندات معروضة<br><span style="color:var(--sub)">جهازها قال: ${(r.docKeys&&r.docKeys.length) ? 'رفع ' + r.docKeys.length + ' ملف (' + u.esc(r.docKeys.join('، ')) + ') — يبقى المشكلة في القراءة مش الرفع' : 'مرفعش أي ملف — الاستمارة وقعت عنده قبل الرفع'}</span>${docsErr ? '<br><b>سبب فشل القراءة: ' + u.esc(docsErr) + '</b>' : ''}</div>`;
    return `<div class="card"><h3>${u.esc(r.name||'—')} ${st}</h3>
      <div class="hint" style="line-height:1.9;font-size:12px">${u.esc(brandLabel(r.brand, r.branch))} · ${u.esc(HIRE_ROLES[r.role]||r.role||'')}<br>📱 ${u.esc(r.phone||'—')} · 🪪 ${u.esc(r.nid||'—')}${r.birth ? '<br>🎂 ' + u.esc(r.birth) + ' · ' + u.esc(r.gov||'') : ''}<br>🕐 ${r.shift==='evening'?'مسائي':'صباحي'} · إجازة ${u.esc(u.AR_DAYS[Number(r.dayOff)]||'—')}<br>⏳ فترة اختبار ${u.esc(r.trialDays||30)} يوم${r.emergency ? '<br>🆘 ' + u.esc(r.emergency.name||'') + ' (' + u.esc(r.emergency.relation||'') + ') ' + u.esc(r.emergency.phone||'') : ''}${r.address ? '<br>🏠 ' + u.esc(r.address) : ''}<br>📅 اتسجّلت ${when(r.ts)}</div>
      ${docs.length ? thumbs(docs) : noDocs}
      ${r.status==='pending' ? `<div class="btns"><button class="btn g" onclick="O2.hire.approve('${u.esc(r.id)}')">✅ اعتماد وفتح الحساب</button><button class="btn r" onclick="O2.hire.reject('${u.esc(r.id)}')">رفض</button></div>` : ''}</div>`;
  }).join('');
  return form + inv + `<div class="full"><div class="sec">📥 طلبات التوظيف · من رابط الدعوة بمستنداتها</div></div>` + (list || '<div class="empty">مفيش طلبات لسه</div>');
}

/* ---------- 📌 الشواغر ---------- */
function opHas(br, role){ return openings.some(o=> o && o.branch===br && o.role===role); }
function rVac(){
  if(!opLoaded){ setTimeout(loadOpenings, 0); return '<div class="card"><div class="skel"></div></div>'; }
  const cards = branchesList().map(br=> `<div class="card"><h3>📍 ${u.esc(br)}</h3><div class="btns">${Object.keys(OP_ROLES).map(r=>{ const on = opHas(br, r); return `<button class="btn ${on?'g':''}" onclick="O2.hire.opToggle('${u.esc(br)}','${r}')">${on?'✅ ':''}${u.esc(OP_ROLES[r])}</button>`; }).join('')}</div></div>`).join('');
  return `<div class="card full"><h3>📌 الوظائف المتاحة <small>${openings.length} شاغر مفتوح</small></h3><div class="hint">علّم الفرع والوظيفة اللي محتاج فيها حد — استمارة التقديم بتعرض المتاح بس. لو مفيش أي علامة، الاستمارة بتقول «لا توجد شواغر».</div><div class="btns"><button class="btn p w" onclick="O2.hire.opSave()" ${opDirty?'':'disabled'}>💾 احفظ الشواغر${opDirty?' (فيه تعديل مش محفوظ)':''}</button></div></div>` + cards;
}

/* ---------- 🗂️ ملف الموظفة ---------- */
function efMatch(q, o){ const n = String(o.name||'').toLowerCase(); const p = String(o.phone||'').replace(/\D/g,''); const qq = String(q||'').trim().toLowerCase(); const qd = qq.replace(/\D/g,''); return (qq.length >= 2 && n.indexOf(qq) >= 0) || (qd.length >= 3 && p.indexOf(qd) >= 0); }
function efHits(){
  const hits = [];
  regs.forEach(r=>{ if(efMatch(efQ, r)) hits.push({ kind:'reg', id:r.id, regId:r.id, name:r.name, sub:(r.branch||'') + ' · ' + (r.status==='approved'?'متعمد':r.status==='rejected'?'مرفوض':'مستني'), ts:r.ts||0 }); });
  u.D.employees.forEach(e=>{ if(!efMatch(efQ, e)) return; if(e.regId && hits.some(h=> h.id===e.regId)) return; hits.push({ kind:'emp', id:e.id, regId:e.regId||'', name:e.name, sub:(e.branch||'') + ' · ' + (e.active===false?'موقوف':'شغّال'), ts:e.createdAt||0 }); });
  return hits.sort((a,b)=> (b.ts||0)-(a.ts||0)).slice(0, 12);
}
function trialLine(e){
  const days = Number(e.trialDays)||0, from = Number(e.trialFrom)||0; if(!days || !from) return '';
  const left = days - Math.floor((Date.now() - from)/u.DAY);
  return `<div class="alert ${left>0?'w':'i'}" style="cursor:default">${left > 0 ? `⏳ فترة اختبار — فاضل <b>${left} يوم</b> من ${days}` : `✅ خلّصت فترة الاختبار (${days} يوم) — موظفة دائمة`} · بدأت ${u.caiKey(from)}</div>`;
}
function rFiles(){
  const box = `<div class="card full"><h3>🗂️ ملف الموظفة</h3><div class="hint">اكتب اسم أو رقم موبايل — بيدوّر في كل التسجيلات والموظفين، من غير حد زمني.</div><input value="${u.esc(efQ)}" placeholder="🔍 اسم أو رقم موبايل" oninput="O2.hire.efQ(this.value)" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:12px;font-family:inherit;margin-top:8px"></div>`;
  if(String(efQ).trim().length < 2) return box;
  const hits = efHits();
  const list = `<div class="card"><h3>نتايج البحث <small>${hits.length}</small></h3>${hits.map(h=>`<div class="row ${efSel&&efSel.id===h.id?'first':''}" onclick="O2.hire.efOpen('${u.esc(h.regId)}','${u.esc(h.id)}','${h.kind}')"><div class="n"><b>${u.esc(h.name||'—')}</b><small>${u.esc(h.sub)}</small></div><span class="pill ${h.kind==='reg'?'p-acc':'p-gray'}">${h.kind==='reg'?'📄 طلب':'👤 موظفة'}</span></div>`).join('') || '<div class="empty">مفيش نتايج</div>'}</div>`;
  if(!efSel) return box + list;
  const r = regs.find(x=> x.id===efSel.regId); const e = u.D.employees.find(x=> x.id===efSel.id) || u.D.employees.find(x=> efSel.regId && x.regId===efSel.regId);
  const who = (r&&r.name) || (e&&e.name) || '—';
  let docsHtml;
  if(!efSel.regId) docsHtml = '<div class="hint">⚠️ الموظفة دي اتسجّلت من تابلت الفرع — مفيش مستندات مرفوعة.</div>';
  else if(efDocs[efSel.regId] === undefined) docsHtml = '<div class="skel" style="margin-top:8px"></div>';
  else if(efDocs[efSel.regId] === null) docsHtml = `<div class="hint" style="color:var(--bad)">تعذّر تحميل المستندات: ${u.esc(efSel.err||'')}</div>`;
  else { const ds = efDocs[efSel.regId]; docsHtml = ds.length ? `<div class="sec">📎 ${ds.length} مستند</div><div style="display:flex;gap:7px;overflow-x:auto;padding-bottom:4px">${ds.map(d=>`<div style="flex:0 0 auto;text-align:center">${thumb(d)}<div class="hint" style="max-width:62px">${u.esc(HIRE_DOCS[d.kind]||d.kind||'')}</div></div>`).join('')}</div>` : '<div class="hint">مفيش مستندات على الطلب ده.</div>'; }
  const card = `<div class="card"><h3>${u.esc(who)}</h3><div class="hint" style="line-height:1.9;font-size:12px">${r ? `📱 ${u.esc(r.phone||'—')}${r.whatsapp && r.whatsapp!==r.phone ? ' · واتساب ' + u.esc(r.whatsapp) : ''}<br>🪪 ${u.esc(r.nid||'—')}${r.birth ? ' · 🎂 ' + u.esc(r.birth) : ''}${r.gov ? ' · ' + u.esc(r.gov) : ''}<br>🏬 ${u.esc(brandLabel(r.brand, r.branch))} · ${u.esc(HIRE_ROLES[r.role]||r.role||'')}${r.address ? '<br>🏠 ' + u.esc(r.address) : ''}${r.emergency ? '<br>🆘 ' + u.esc(r.emergency.name||'') + ' (' + u.esc(r.emergency.relation||'') + ') ' + u.esc(r.emergency.phone||'') : ''}<br>📅 اتسجّلت ${when(r.ts)}` : `📱 ${u.esc((e&&e.phone)||'—')}<br>🏬 ${u.esc((e&&e.branch)||'—')}`}</div>${e ? trialLine(e) : ''}${e ? `<div class="btns"><button class="btn" onclick="O2.go('emp','${u.esc(e.id)}')">👤 صفحة الموظفة</button></div>` : ''}${docsHtml}</div>`;
  return box + list + card;
}

/* ---------- الشاشة ---------- */
function badge(){ startLight(); return apps.filter(a=> (a.status||'new')==='new').length + regs.filter(r=> r && r.source==='join' && r.status==='pending').length; }
function render(){
  startHeavy();
  const nApps = apps.filter(a=> (a.status||'new')==='new').length, nRegs = regs.filter(r=> r && r.source==='join' && r.status==='pending').length;
  u.head('💼 التوظيف', (nApps ? nApps + ' متقدّم جديد' : 'مفيش متقدّمين جداد') + ' · ' + (nRegs ? nRegs + ' طلب تسجيل مستني' : 'مفيش طلبات مستنية'));
  const tab = (k, t, n)=> `<button class="${view===k?'on':''}" onclick="O2.hire.view('${k}')">${t}${n ? ' <span class="pill p-bad" style="padding:1px 6px">' + n + '</span>' : ''}</button>`;
  const seg = `<div class="seg full">${tab('apps','📋 مقدّمين', nApps)}${tab('docs','📄 ورق', nRegs)}${tab('vac','📌 شواغر')}${tab('files','🗂️ ملفات')}</div>`;
  return seg + ({ apps: rApps, docs: rDocs, vac: rVac, files: rFiles }[view] || rApps)();
}

O2.hire = {
  view(v){ view = v; u.render(); },
  apStatus(v){ apStatus = v; u.render(); }, apBranch(v){ apBranch = v; u.render(); }, apShift(v){ apShift = v; u.render(); }, apSort(){ apOldest = !apOldest; u.render(); },
  hv(k, v){ hv[k] = k==='days' ? (Number(v)||3) : v; if(k==='brand') hv.branch = v==='glow' ? 'Glow' : ''; u.render(); },
  copy: copyLink,
  photo(id){ const d = docById[id]; if(!d) return; u.sheet(`<h2>📎 ${u.esc(HIRE_DOCS[d.kind]||d.kind||'')}</h2><div class="hint">${u.esc(d.name||'')} · ${u.esc(d.branch||'')}</div><img src="${u.esc(d.photo)}" style="width:100%;border-radius:12px;background:#000;margin-top:8px">`); },
  async apSet(id, status){
    const a = apps.find(x=> x.id===id); if(!a) return;
    if(status==='rejected' && !confirm('✖ ترفض ' + (a.name||'') + '؟')) return;
    try{ await u.db.collection('job_applications').doc(id).update({ status, statusAt: Date.now() }); u.toast(status==='rejected' ? 'اترفض' : 'اتحدد للمقابلة ✅'); }
    catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  },
  // 🔗 من متقدّم لدعوة تسجيل — نفس حقول Office القديم (applicantPhone/applicantName + status:hired + inviteCode)
  async apInvite(id){
    const a = apps.find(x=> x.id===id); if(!a) return;
    const br = (a.branches && a.branches[0]) || ''; const role = (a.roles && a.roles[0]) || 'sales_social'; const brand = /glow/i.test(br) ? 'glow' : 'echarpe';
    if(!confirm('🔗 دعوة تسجيل لـ' + (a.name||'') + '\n\n' + brandLabel(brand, br) + '\n' + (HIRE_ROLES[role] || AP_ROLES[role] || role) + '\n\nالرابط شغّال مرة واحدة وينتهي بعد 3 أيام.')) return;
    const code = hvCode();
    try{
      await u.db.collection('staff_invites').doc(code).set({ code, brand, branch: brand==='glow' ? 'Glow' : br, role, createdAt: Date.now(), expiresAt: Date.now() + 3*u.DAY, usedAt: null, createdBy:'office2', applicantPhone: a.phone||'', applicantName: a.name||'' });
      await u.db.collection('job_applications').doc(id).update({ status:'hired', statusAt: Date.now(), inviteCode: code }).catch(()=>{});
      const link = hvLink(code); lastLink = link;
      u.sheet(`<h2>✅ الرابط جاهز</h2><div class="hint">ابعته لـ${u.esc(a.name||'')} على واتساب — شغّال مرة واحدة وينتهي بعد 3 أيام</div><div style="word-break:break-all;font-weight:800;margin:10px 0">${u.esc(link)}</div><div class="btns"><button class="btn p" onclick="O2.hire.copy('${u.esc(link)}')">📋 انسخ الرابط</button><a class="btn g" href="https://wa.me/2${u.esc(a.whatsapp||a.phone||'')}?text=${encodeURIComponent(link)}" target="_blank" rel="noopener" style="text-decoration:none">💬 واتساب</a></div>`);
      u.toast('اتعملت الدعوة ✅');
    }catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  },
  async makeInvite(){
    const brand = hv.brand, branch = brand==='glow' ? 'Glow' : hv.branch, role = hv.role, days = Number(hv.days)||3;
    if(!branch){ u.toast('اختار الفرع'); return; }
    if(!confirm('🔗 دعوة جديدة\n\n' + brandLabel(brand, branch) + '\n' + (HIRE_ROLES[role]||role) + '\nتنتهي بعد ' + days + ' يوم\n\nتكمّل؟')) return;
    const au = u.auth.currentUser; if(!au || au.isAnonymous){ u.toast('⛔ الجلسة مش بإيميل — اخرج وادخل تاني'); return; }
    const code = hvCode();
    try{ await u.db.collection('staff_invites').doc(code).set({ code, brand, branch, role, createdAt: Date.now(), expiresAt: Date.now() + days*u.DAY, usedAt: null, createdBy:'office2' }); lastLink = hvLink(code); u.toast('الرابط جاهز ✅'); u.render(); }
    catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  },
  async killInvite(code){
    if(!confirm('تلغي الدعوة ' + code + '؟\n\nالرابط هيبطّل يشتغل فورًا.')) return;
    try{ await u.db.collection('staff_invites').doc(code).update({ expiresAt: Date.now() - 1, cancelledAt: Date.now() }); u.toast('اتلغت'); }
    catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  },
  // ✅ الاعتماد — الحجز بـtransaction الأول، وإنشاء الموظفة بعد نجاحه (نفس Office القديم وتطبيق الحضور) — مستحيل تتسجّل مرتين
  async approve(id){
    const r = regs.find(x=> x.id===id); if(!r || r.status !== 'pending') return;
    if(!confirm('✅ اعتماد ' + (r.name||'') + '؟\n\n' + brandLabel(r.brand, r.branch) + '\n' + (HIRE_ROLES[r.role]||'') + '\n\nهيتفتح حساب على تابلت الفرع بالرقم السري اللي اختارته،\nوفترة الاختبار (' + (r.trialDays||30) + ' يوم) بتبدأ من أول يوم شغل.')) return;
    try{
      const ref = u.db.collection('sales_registrations').doc(id);
      await u.db.runTransaction(async tx=>{ const snap = await tx.get(ref); if(!snap.exists) throw new Error('الطلب مش موجود'); if((snap.data()||{}).status === 'approved') throw new Error('الطلب ده اتعمد خلاص ✅'); tx.update(ref, { status:'approved', approvedAt: Date.now(), approvedBy:'office2' }); });
      await u.db.collection('sales_employees').add({ name: r.name, gender: r.gender||'', avatar: (r.gender==='male' ? 'boy' : 'girl'), shift: r.shift, dayOff: r.dayOff, scheduledStartTime: r.scheduledStartTime||null, scheduledEndTime: r.scheduledEndTime||null, branch: r.branch, active:true, createdAt: Date.now(), pin: (r.pin||'0000'), phone: r.phone||'', role: r.role||'', trialDays: Number(r.trialDays)||30, trialFrom: Date.now(), regId: id });
      u.toast('اتعمدت ✅ الحساب اتفعّل على تابلت الفرع');
    }catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  },
  async reject(id){
    const r = regs.find(x=> x.id===id); if(!r || r.status !== 'pending') return;
    if(!confirm('✖ ترفض طلب ' + (r.name||'') + '؟')) return;
    try{ await u.db.collection('sales_registrations').doc(id).update({ status:'rejected', rejectedAt: Date.now() }); u.toast('اترفض'); }
    catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  },
  opToggle(br, role){ if(opHas(br, role)) openings = openings.filter(o=> !(o.branch===br && o.role===role)); else openings.push({ branch: br, role }); opDirty = true; u.render(); },
  async opSave(){
    if(!opDirty) return;
    try{ await u.db.collection('pos_test_settings').doc('job_openings').set({ list: openings, at: Date.now() }, { merge:true }); opDirty = false; u.toast('اتحفظت الشواغر ✅'); u.render(); }
    catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  },
  efQ(v){ efQ = v; efSel = null; const el = document.activeElement; u.render(); try{ const i = document.querySelector('#screen input[placeholder^="🔍"]'); if(i && el && el.tagName==='INPUT'){ i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }catch(e){} },
  // 📎 المستندات بتتجاب بالطلب — استعلام مساواة واحد على regId، من غير حد زمني
  async efOpen(regId, id, kind){
    efSel = { regId, id, kind }; u.render();
    if(!regId || efDocs[regId] !== undefined) return;
    try{ const s = await u.db.collection('staff_docs').where('regId','==',regId).get(); efDocs[regId] = s.docs.map(d=> Object.assign({ id:d.id }, d.data())).sort((a,b)=> (a.ts||0)-(b.ts||0)); efDocs[regId].forEach(d=>{ docById[d.id] = d; }); }
    catch(e){ efDocs[regId] = null; efSel.err = String(e && (e.code||e.message)); }
    u.render();
  }
};
O2.register('hire', { icon:'💼', title:'التوظيف', desc:'المتقدّمين من الإعلان · دعوات التسجيل وطلباتها بالمستندات · الشواغر · ملف الموظفة', order:40, tab:'more', badge, enter(){ startHeavy(); }, render });
})();
