/* ============================================================
   🔴 Office 2 — POS Live (منقول من Office/office.js ofLiveRender) — قراءة بس
   ------------------------------------------------------------
   office_pos_live/{branch}: الكاشير بيكتب حالته (السلة الحالية · الدفع · آخر بيع · إحصائيات اليوم) + نبضة كل 5 دقايق
   · listener واحد على المجموعة الصغيرة — بيفضل شغّال بعد أول دخول (مفيش استعلامات تانية)
   · لو آخر نبضة أقدم من 7 دقايق = الجهاز غير متصل (pill رمادي)
   ============================================================ */
(function(){
'use strict';
const u = O2.u;
const STALE_MS = 7*60*1000;
const PAY = Object.assign({}, u.PAY_AR, { salary:'راتب', gift:'كارت هدية' });
let docs = [], started = false, loaded = false, err = '';
/* 🎛️ v767 — تحكم عن بُعد: قفل/فتح الكاشير · خروج الموظفة · دخول جهاز بحساب الفرع (متشفّر) */
const remote = {}; let pairs = []; let resets = [];
function rid(b){ return 'pos_remote_' + String(b||'').replace(/\//g,'_'); }
function start(){
  if(started) return; started = true;
  u.db.collection('pos_test_settings').where('remoteCtl','==',true).onSnapshot(s=>{ s.docs.forEach(d=>{ const x = d.data()||{}; if(x.branch) remote[x.branch] = x; }); u.render(); }, ()=>{});
  u.db.collection('pos_activity_log').where('type','==','device_storage_reset').onSnapshot(s=>{ resets = s.docs.map(d=> d.data()).filter(r=> r.ts > Date.now() - 30*u.DAY); u.render(); }, ()=>{});
  u.db.collection('pos_pair').where('createdAt','>=', Date.now() - 30*60000).onSnapshot(s=>{ pairs = s.docs.map(d=> Object.assign({ id:d.id }, d.data())).filter(p=> p.status==='waiting'); u.render(); }, ()=>{});
  u.db.collection('office_pos_live').onSnapshot(s=>{ docs = s.docs.map(d=> Object.assign({ id:d.id }, d.data())); loaded = true; err = ''; u.render(); }, e=>{ err = String(e && (e.code||e.message)); loaded = true; u.render(); });
}
function todayKey(){ return u.caiKey(Date.now()).replace(/-/g,''); }
function dayKeyOf(ms){ return u.caiKey(ms||0).replace(/-/g,''); }
function money(v){ return u.n0(v) + ' ج'; }
function payChips(obj){ return Object.keys(obj||{}).filter(k=> Math.abs(Number(obj[k])||0) > .001).map(k=> `<span class="pill p-gray" style="margin:2px">${u.esc(PAY[k]||k)} <b>${money(obj[k])}</b></span>`).join(''); }
function online(x){ return (Date.now() - (Number(x.updatedAtMs)||0)) < STALE_MS; }
function whenTs(ms){ return dayKeyOf(ms)===todayKey() ? u.hm(ms) : (u.dayName(ms) + ' ' + u.caiKey(ms).slice(5) + ' ' + u.hm(ms)); }
function card(x){
  const on = online(x); const st = (x.statsDayKey===todayKey() && x.stats) ? x.stats : {};
  const n = Number(st.salesCount)||0, gross = Number(st.grossSales)||0, net = Number(st.netSales)||0;
  const status = on ? '<span class="pill p-good">● LIVE</span>' : `<span class="pill p-gray">● غير متصل${x.updatedAtMs ? ' · آخر إشارة ' + whenTs(x.updatedAtMs) : ''}</span>`;
  const items = Array.isArray(x.cart) ? x.cart : []; const cart = items.map(c=> `<div class="row" style="cursor:default"><div class="n"><b>${u.esc(c.name||c.barcode||'')}${c.isReturn ? ' <span class="pill p-bad">مرتجع</span>' : ''}</b><small>${u.esc(c.barcode||'')} · × ${Number(c.qty)||0}</small></div><b class="money">${money((Number(c.price)||0)*(Number(c.qty)||0))}</b></div>`).join('');
  const livePays = (x.payments||[]).map(q=> `<span class="pill p-warn" style="margin:2px">${u.esc(PAY[q.method]||q.method||'')}${q.method==='visa' && q.seq ? ' ' + Number(q.seq) : ''}${q.status==='approved' ? ' ✅' : q.status==='pending' ? ' ⏳' : ''} · ${money(q.amount)}</span>`).join('');
  const last = x.lastSale || null;
  const lastHtml = last ? `<div class="alert ${Number(last.total)>=0 ? 'i' : 'w'}" style="cursor:default;flex-wrap:wrap"><span style="flex:1;min-width:0"><b>${Number(last.total)>=0 ? '✅ آخر بيع' : '↩️ آخر مرتجع'} · ${money(last.total)}</b><br><small class="tag">${whenTs(last.atMs)}${last.invoiceNo ? ' · #' + u.esc(last.invoiceNo) : ''}${(last.seller||last.employee) ? ' · ' + u.esc(last.seller||last.employee) : ''}</small><br>${payChips(last.payments)}</span></div>` : '';
  const br = x.branch||x.id||''; const rc = remote[br] || {}; const bq = u.esc(String(br).replace(/'/g,"\\'"));
  /* ✅ v768: حالة حقيقية من الجهاز — مش «تم» وخلاص. الجهاز بيرد (ackLocked/ackKickSeq) لما يستلم. */
  const lockPending = rc.at && (rc.ackLocked !== !!rc.locked || Number(rc.ackAt||0) < Number(rc.at||0));
  const kickPending = Number(rc.kickSeq||0) > Number(rc.ackKickSeq||0);
  const devState = !on
    ? `<div class="alert w" style="cursor:default;flex-wrap:wrap"><span style="flex:1;min-width:0"><b>📴 الكاشير مش متصل بحساب الفرع${x.updatedAtMs ? ' من ' + whenTs(x.updatedAtMs) : ''}</b><br><small>الجهاز مقفول أو النت فاصل أو بيطلب الإيميل والباسورد — أي أمر هنا مش هيوصله دلوقتي. لو بيطلب الإيميل: الموظفة تدوس «📲 الإدارة تدخّل الجهاز» وتقولك الكود، وهتلاقيه فوق في «أجهزة مستنية دخول».</small></span></div>`
    : '';
  const ackLine = rc.at ? `<div class="hint" style="margin:0 0 6px">${lockPending ? '⏳ مستني الجهاز يستلم ' + (rc.locked ? 'القفل' : 'الفتح') + '…' : (rc.locked ? '✅ الجهاز اتقفل فعلًا ' + u.hm(rc.ackAt) : (rc.ackAt ? '✅ الجهاز مفتوح · آخر رد ' + u.hm(rc.ackAt) : ''))}${kickPending ? ' · ⏳ مستني الجهاز ينفّذ الخروج' : ''}</div>` : '';
  const rs = resets.filter(r=> r.branch===br).sort((a,b)=> b.ts - a.ts);
  const resetHtml = rs.length ? `<div class="alert w" style="cursor:default;flex-wrap:wrap"><span style="flex:1;min-width:0"><b>🧹 الجهاز ده اتمسحت بياناته ${rs.length} مرة آخر 30 يوم</b> (الحساب والطابعات بيروحوا)<br><small>آخر مرة ${whenTs(rs[0].ts)} · ${rs[0].shell ? 'من برنامج الكاشير' : '⚠️ من متصفح عادي مش برنامج الكاشير'}${rs[0].quotaMB != null ? ' · المساحة المتاحة للموقع ' + u.n0(rs[0].quotaMB) + ' MB' : ''}${rs[0].incognitoHint ? ' · ⚠️ شكله تصفح خفي' : ''}${rs.some(r=> r.shell) && rs.some(r=> !r.shell) ? ' · ⚠️ بيتفتح مرة من البرنامج ومرة من المتصفح' : ''}</small><br><small>السبب من الجهاز مش السيستم: هارد مليان · بيتفتح من مكان تاني (متصفح/يوزر ويندوز تاني) · برنامج تنضيف · تصفح خفي</small></span></div>` : '';
  /* 🖥️ v770: شاشة الجهاز — RustDesk (زي TeamViewer، مجاني) · الـID متسجّل في pos_remote_<branch>.rdId · الباسورد مش بيتخزن هنا — بيتحفظ في برنامج RustDesk على موبايلك */
  const rd = rdClean(rc.rdId);
  const rdBtn = rd
    ? `<button class="btn p" onclick="O2.live.rdOpen('${bq}')">🖥️ شاشة الجهاز</button>`
    : `<button class="btn" onclick="O2.live.rdSet('${bq}')">🖥️ ربط الريموت</button>`;
  const rdLine = rd ? `<div class="hint" style="margin:0 0 6px">RustDesk ID: <b style="direction:ltr;letter-spacing:2px;cursor:pointer" title="اضغط للنسخ" onclick="O2.live.rdCopy('${rd}')">${rd}</b> · <a href="https://rustdesk.com/web/" target="_blank" rel="noopener">من المتصفح</a> · <a href="#" onclick="O2.live.rdSet('${bq}');return false">تغيير</a></div>` : '';
  const ctl = resetHtml + devState + `<div class="btns" style="margin:0 0 8px">${rdBtn}${rc.locked ? `<button class="btn g" onclick="O2.live.lock('${bq}',false)">🔓 افتح الكاشير</button>` : `<button class="btn r" onclick="O2.live.lock('${bq}',true)">🔒 اقفل الكاشير</button>`}${x.employee && on ? `<button class="btn" onclick="O2.live.kick('${bq}')">🚪 خرّج ${u.esc(x.employee)}</button>` : ''}</div>${rdLine}${ackLine}${rc.locked ? `<div class="alert" style="cursor:default">🔒 مقفول من ${u.hm(rc.at)}${rc.lockMsg ? ' · ' + u.esc(rc.lockMsg) : ''}</div>` : ''}`;
  return `<div class="card"><h3>📍 ${u.esc(x.branch||x.id||'فرع')} <small>${u.esc(x.employee||'بدون موظف')}</small> ${status}</h3>${ctl}
    <div class="kpis"><div class="kpi"><small>صافي النهاردة</small><b>${u.n0(net)}</b></div><div class="kpi"><small>فواتير</small><b>${n}</b></div><div class="kpi"><small>متوسط الفاتورة</small><b>${n ? u.n0(gross/n) : '—'}</b></div></div>
    ${Object.keys(st.paymentTotals||{}).length ? `<div class="hint">طرق الدفع النهاردة</div><div>${payChips(st.paymentTotals)}</div>` : ''}
    ${lastHtml}
    <div class="sec">🛒 السلة دلوقتي ${items.length ? '· ' + x.cart.length + ' صنف' : '— فاضية'}</div>${cart}${(x.cart||[]).length ? `<div class="row" style="cursor:default;border-top:2px solid var(--ink)"><div class="n"><b>إجمالي السلة</b></div><b class="money">${money(x.total)}</b></div>` : ''}${livePays ? `<div style="margin-top:4px">${livePays}</div>` : ''}
    ${Number(st.returnCount)>0 ? `<div class="hint">↩️ مرتجعات النهاردة: ${Number(st.returnCount)} · ${money(st.returnTotal)}</div>` : ''}</div>`;
}
function render(){
  start();
  const list = docs.slice().sort((a,b)=> (b.updatedAtMs||0)-(a.updatedAtMs||0));
  const live = list.filter(online).length;
  u.head('🔴 POS Live', loaded ? (live + ' فرع متصل من ' + list.length + ' · تحكم عن بُعد') : 'بيتصل بالفروع…');
  if(!loaded) return '<div class="card"><div class="skel"></div></div>';
  if(err) return `<div class="card"><b style="color:var(--bad)">تعذر تشغيل POS Live: ${u.esc(err)}</b></div>`;
  if(!list.length) return '<div class="empty">مفيش كاشير بعت حالة Live لسه</div>';
  const tk = todayKey(); let net = 0, cnt = 0, gross = 0, latest = null;
  list.forEach(x=>{ if(x.statsDayKey===tk){ const st = x.stats||{}; net += Number(st.netSales)||0; cnt += Number(st.salesCount)||0; gross += Number(st.grossSales)||0; } if(x.lastSale && dayKeyOf(x.lastSale.atMs)===tk && (!latest || Number(x.lastSale.atMs)>Number(latest.sale.atMs))) latest = { branch: x.branch||x.id, sale: x.lastSale }; });
  const sum = `<div class="card full"><h3>📊 كل الفروع النهاردة <small>${live} LIVE</small></h3><div class="kpis"><div class="kpi"><small>صافي المبيعات</small><b>${u.n0(net)}</b></div><div class="kpi"><small>فواتير البيع</small><b>${cnt}</b></div><div class="kpi"><small>متوسط الفاتورة</small><b>${cnt ? u.n0(gross/cnt) : '—'}</b></div></div>${latest ? `<div class="alert ${Number(latest.sale.total)>=0?'i':'w'}" style="cursor:default"><b>${Number(latest.sale.total)>=0 ? '✅ آخر عملية بيع' : '↩️ آخر عملية مرتجع'}</b>&nbsp;· ${u.esc(latest.branch)} · ${u.hm(latest.sale.atMs)} · <b class="money">${money(latest.sale.total)}</b></div>` : ''}</div>`;
  const pr = pairs.length ? `<div class="card full" style="border:2px solid var(--acc)"><h3>📲 أجهزة مستنية دخول <small>${pairs.length}</small></h3>${pairs.map(p=>`<div class="row" style="cursor:default"><div class="n"><b style="direction:ltr;letter-spacing:3px">${u.esc(p.code||p.id)}</b><small>${u.esc(p.branchHint||'فرع مش معروف')} · من ${u.hm(p.createdAt)}</small></div><button class="btn p" onclick="O2.live.pairSheet('${u.esc(p.id)}')">دخّل</button></div>`).join('')}<div class="hint">اتأكد إن الكود هو نفس اللي ظاهر على شاشة جهاز الفرع قبل ما تدخّله</div></div>` : '';
  return pr + sum + list.map(card).join('');
}
async function lock(branch, on){
  let msg = '';
  if(on){ msg = prompt('رسالة تظهر على الكاشير (اختياري):', 'الكاشير مقفول من الإدارة'); if(msg === null) return; }
  const dev = docs.find(d=> (d.branch||d.id)===branch); const isOn = !!(dev && online(dev));
  if(!isOn && !confirm('⚠️ كاشير ' + branch + ' مش متصل دلوقتي — الأمر هيتسجل وهيتنفذ أول ما الجهاز يدخل. كمّل؟')) return;
  try{ await u.db.collection('pos_test_settings').doc(rid(branch)).set({ remoteCtl:true, branch, locked:!!on, lockMsg: msg || '', at: Date.now(), by:'office' }, { merge:true }); remote[branch] = Object.assign({}, remote[branch], { locked:!!on, lockMsg:msg, at:Date.now() }); u.toast(isOn ? '📨 اتبعت — مستني الجهاز يأكّد' : '📨 اتسجل — هيتنفذ أول ما الجهاز يتصل'); u.render(); }
  catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
}
async function kick(branch){
  if(!confirm('تخرّج الموظفة الداخلة على كاشير ' + branch + '؟ (الفاتورة المفتوحة بتفضل محفوظة على الجهاز)')) return;
  try{ await u.db.collection('pos_test_settings').doc(rid(branch)).set({ remoteCtl:true, branch, kickSeq: firebase.firestore.FieldValue.increment(1), kickAt: Date.now(), by:'office' }, { merge:true }); u.toast('📨 اتبعت — مستني الجهاز يأكّد'); }
  catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
}
function accKey(b){ return 'o2_branch_acc_' + b; }
function pairSheet(id){
  const p = pairs.find(x=> x.id===id); if(!p) return;
  const brs = u.branches(); const b0 = p.branchHint && brs.includes(p.branchHint) ? p.branchHint : (brs[0]||'');
  let saved = null; try{ saved = JSON.parse(localStorage.getItem(accKey(b0))||'null'); }catch(e){}
  u.sheet(`<h2>📲 دخّل الجهاز ${u.esc(p.code||p.id)}</h2><div class="hint">الإيميل والباسورد بيتشفّروا بمفتاح الجهاز نفسه — محدش غيره يقدر يقراهم</div>
    <select id="lpBranch" onchange="O2.live.pairFill(this.value)">${brs.map(b=>`<option ${b===b0?'selected':''}>${u.esc(b)}</option>`).join('')}</select>
    <input id="lpEmail" type="email" placeholder="إيميل حساب الفرع" value="${u.esc((saved&&saved.e)||'')}" autocomplete="off">
    <input id="lpPass" type="password" placeholder="باسورد حساب الفرع" value="${u.esc((saved&&saved.p)||'')}" autocomplete="off">
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700"><input id="lpSave" type="checkbox" ${saved?'checked':''} style="width:auto;margin:0"> افتكر حساب الفرع ده على موبايلي</label>
    <div class="btns"><button class="btn p w" onclick="O2.live.pairSend('${u.esc(p.id)}')">دخّل الجهاز</button></div>`);
}
function pairFill(b){ let saved = null; try{ saved = JSON.parse(localStorage.getItem(accKey(b))||'null'); }catch(e){} const e = document.getElementById('lpEmail'), pw = document.getElementById('lpPass'); if(e) e.value = (saved&&saved.e)||''; if(pw) pw.value = (saved&&saved.p)||''; }
function b64(buf){ return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
async function pairSend(id){
  const p = pairs.find(x=> x.id===id); if(!p) return;
  const b = document.getElementById('lpBranch').value, e = document.getElementById('lpEmail').value.trim(), pw = document.getElementById('lpPass').value;
  if(!b || !e || !pw){ u.toast('اختار الفرع واكتب الإيميل والباسورد'); return; }
  try{
    const key = await crypto.subtle.importKey('jwk', JSON.parse(p.pub), { name:'RSA-OAEP', hash:'SHA-256' }, false, ['encrypt']);
    const enc = await crypto.subtle.encrypt({ name:'RSA-OAEP' }, key, new TextEncoder().encode(JSON.stringify({ e, p:pw, b })));
    await u.db.collection('pos_pair').doc(id).update({ status:'sent', enc: b64(enc), branch:b, sentAt: Date.now(), by:'office' });
    try{ if(document.getElementById('lpSave').checked) localStorage.setItem(accKey(b), JSON.stringify({ e, p:pw })); else localStorage.removeItem(accKey(b)); }catch(_){}
    u.closeSheet(); u.toast('📲 اتبعت — الجهاز بيدخل دلوقتي');
  }catch(err){ u.toast('تعذر: ' + (err && (err.code||err.message))); }
}
/* 🖥️ v770 — RustDesk ID (6–16 رقم). rdOpen بيفتح برنامج RustDesk على الموبايل/الكمبيوتر بالـID جاهز — الباسورد الدائم بتكتبه مرة والبرنامج بيحفظه. */
function rdClean(v){ const d = String(v||'').replace(/\D/g,''); return (d.length >= 6 && d.length <= 16) ? d : ''; }
async function rdSet(branch){
  const cur = rdClean((remote[branch]||{}).rdId);
  const v = prompt('RustDesk ID بتاع جهاز ' + branch + ' (الأرقام اللي في ملف REMOTE-ID.txt على سطح مكتب الجهاز):', cur);
  if(v === null) return;
  const id = rdClean(v);
  if(!id){ u.toast('الـID لازم يكون أرقام بس (6 لـ 16 رقم)'); return; }
  try{ await u.db.collection('pos_test_settings').doc(rid(branch)).set({ remoteCtl:true, branch, rdId:id, rdAt: Date.now(), by:'office' }, { merge:true }); remote[branch] = Object.assign({}, remote[branch], { rdId:id }); u.toast('✅ اتسجل — دوس «🖥️ شاشة الجهاز» عشان تدخل'); u.render(); }
  catch(err){ u.toast('تعذر: ' + (err && (err.code||err.message))); }
}
function rdOpen(branch){
  const id = rdClean((remote[branch]||{}).rdId); if(!id){ rdSet(branch); return; }
  u.toast('بيفتح RustDesk… لو مفتحش: نزّل تطبيق RustDesk على الموبايل أو افتح rustdesk.com/web واكتب الـID ' + id);
  try{ (O2.live.rdNav || function(href){ window.location.href = href; })('rustdesk://connection/new/' + id); }catch(e){}
}
function rdCopy(id){ try{ navigator.clipboard.writeText(String(id)); u.toast('اتنسخ ' + id); }catch(e){} }
O2.live = { lock, kick, pairSheet, pairFill, pairSend, rdSet, rdOpen, rdCopy, rdClean };
O2.register('live', { icon:'🔴', title:'POS Live', desc:'كل فرع دلوقتي: السلة والدفع وآخر بيع · 🖥️ شاشة الجهاز (RustDesk) · 🔒 قفل/فتح الكاشير · 🚪 خروج الموظفة · 📲 دخول جهاز بحساب الفرع', badge(){ start(); return pairs.length; }, order:41, tab:'more', enter(){ start(); }, render });
})();
