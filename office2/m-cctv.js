/* ============================================================
   📹 Office 2 — الكاميرات (منقولة من Office/cctv.js — غرفة المراقبة)
   ------------------------------------------------------------
   · جداول الفروع/الكاميرات/الجودات منسوخة حرفيًا من cctv.js — نفس روابط الـgateway بالظبط
   · مباشر: كل كاميرا بتشتغل بدوستها (مفيش بث تلقائي) · Glow بصور JPEG متتابعة · الباقي iframe MSE
   · كل الفروع: كاميرا الكاشير من كل فرع · تسجيل: وقت محدد · اليوم: فواتير اليوم + لقطات + فيديو · النشاط: زوار وتنبيهات من الـgateway
   · قراءة بس — الشاشة دي مبتكتبش أي حاجة في Firestore
   ============================================================ */
(function(){
'use strict';
const u = O2.u;
/* ---------- ⚙️ الإعدادات (نسخة حرفية من Office/cctv.js) ---------- */
const FALLBACK_BRANCHES=[{
  id:'madinaty', name:'مدينتي', gateway:'https://cctv-madinaty.echarpe.store',
  liveAliases:['madinaty','مدينتي'], playback:true, playbackCamera:'4',
  cameras:[
    {id:'4',name:'D04',label:'الكاشير',stream:'camera4',liveStream:'camera4_live'},
    {id:'5',name:'D05',label:'كاميرا 5',stream:'camera5',liveStream:'camera5_live'},
    {id:'7',name:'D07',label:'كاميرا 7',stream:'camera7',liveStream:'camera7_live'},
    {id:'8',name:'D08',label:'كاميرا 8',stream:'camera8',liveStream:'camera8_live'}
  ]
},{
  id:'glow', name:'Glow', gateway:'https://cctv-glow.echarpe.store',
  liveAliases:['glow','Glow'], playback:true, playbackCamera:'1',
  cameras:[
    {id:'1',name:'CAM1',label:'الكاشير',stream:'glow_cam1_h264'},
    {id:'2',name:'CAM2',label:'كاميرا 2',stream:'glow_cam2_h264'},
    {id:'3',name:'CAM3',label:'كاميرا 3',stream:'glow_cam3_h264'},
    {id:'4',name:'CAM4',label:'كاميرا 4',stream:'glow_cam4_h264'}
  ]
},{
  id:'rehab', name:'الرحاب', gateway:'https://cctv-rehab.echarpe.store',
  liveAliases:['rehab','الرحاب'], playback:true, playbackCamera:'1',
  cameras:[
    {id:'1',name:'CAM1',label:'الكاشير',stream:'rehab_cam1_h264'},
    {id:'2',name:'CAM2',label:'كاميرا 2',stream:'rehab_cam2_h264'},
    {id:'3',name:'CAM3',label:'كاميرا 3',stream:'rehab_cam3_h264'},
    {id:'4',name:'CAM4',label:'كاميرا 4',stream:'rehab_cam4_h264'},
    {id:'5',name:'CAM5',label:'كاميرا 5',stream:'rehab_cam5_h264'},
    {id:'6',name:'CAM6',label:'كاميرا 6',stream:'rehab_cam6_h264'},
    {id:'7',name:'CAM7',label:'كاميرا 7',stream:'rehab_cam7_h264'},
    {id:'8',name:'CAM8',label:'كاميرا 8',stream:'rehab_cam8_h264'}
  ]
}];
const BRANCHES=FALLBACK_BRANCHES.map(function(x){
  return {id:x.id,name:x.name,gateway:x.gateway,remoteGateway:x.gateway,liveAliases:x.aliases||x.liveAliases||[x.id,x.name],playback:!!x.playback,playbackCamera:String(x.cashierCamera||x.playbackCamera||'1'),cameras:x.cameras||[]};
});
const SHOT_ORDER = ['first_item','payment','saving','after_save'];
const SHOT_AR = { first_item:'1️⃣ أول كود', payment:'2️⃣ أثناء الدفع', saving:'3️⃣ أثناء الحفظ', after_save:'4️⃣ بعد الحفظ' };
const KIND_AR = { invoice_cart:'سلة الفاتورة', item_added:'إضافة صنف', item_removed:'حذف صنف', qty_increased:'زيادة كمية', qty_decreased:'تقليل كمية', cart_edited:'تعديل السلة', payment:'بدء الدفع', saving:'بدء الحفظ', sale_saved:'حفظ الفاتورة' };
const PAY = Object.assign({}, u.PAY_AR, { salary:'راتب', gift:'كارت هدية' });

/* ---------- 🧠 الحالة ---------- */
const st = { branch:'madinaty', view:'live', on:{}, dayKey: u.caiKey(Date.now()) };
let liveDocs = [], liveStarted = false;
const warn = {}; let warnAt = 0;              // gateway id → true لو مش متاح
const dayRows = {};                            // dayKey → { rows, loading, err }
const act = { loading:false, key:'', data:null, err:'', sales:{} };
const form = { cam:'', date:'', time:'', dur:'1', q:'' };
let pb = null;                                 // المشغّل المفتوح في الشيت

/* ---------- 🌐 الاتصال (LOCAL / REMOTE) — نفس اكتشاف cctv.js ---------- */
function isPrivateLanHost(host){
  host=String(host||'').trim().toLowerCase();
  if(host==='localhost'||host==='127.0.0.1'||host==='::1')return true;
  if(/^10\./.test(host)||/^192\.168\./.test(host))return true;
  var m=host.match(/^172\.(\d+)\./);return !!(m&&Number(m[1])>=16&&Number(m[1])<=31);
}
const LOCAL_REVIEW = !!(isPrivateLanHost(location.hostname) && String(location.port||'')==='1990');
function localBranchActive(x){ return !!(LOCAL_REVIEW && x && x.id==='glow'); }
function remoteGateway(x){ const s = u.SH_SITES.find(y=> y.id===x.id); return String((s && s.gateway) || x.remoteGateway || x.gateway || '').replace(/\/$/,''); }
function agentGateway(x){ return localBranchActive(x) ? (location.origin+'/local-agent') : remoteGateway(x); }
function liveGateway(x){ return localBranchActive(x) ? (location.origin+'/local-live') : remoteGateway(x); }
function liveMode(x){ return x&&x.id==='glow'?'mp4':'mse'; }
function streamUrlFor(x,c){ return liveGateway(x)+'/stream.html?src='+encodeURIComponent(c.liveStream||c.stream)+'&mode='+liveMode(x)+'&background=false'; }
function frameUrlFor(x,c){ return liveGateway(x)+'/api/frame.jpeg?src='+encodeURIComponent(c.liveStream||c.stream)+'&_='; }
function site(){ return BRANCHES.find(x=> x.id===st.branch) || BRANCHES[0]; }
function siteById(id){ return BRANCHES.find(x=> x.id===id) || null; }
function profileFor(branch){ const s = u.siteOf(branch); return s ? siteById(s.id) : null; }
function branchMatches(branch, x){ const p = profileFor(branch); if(p) return p.id===x.id; const v = String(branch||'').toLowerCase(); return (x.liveAliases||[]).some(a=> a && (v===String(a).toLowerCase() || v.indexOf(String(a).toLowerCase())>=0)); }
function recordedCameras(x){ return x.id==='rehab' ? x.cameras.filter(c=> String(c.id)===String(x.playbackCamera)) : x.cameras; }
function cashierCam(x){ return (x.cameras||[]).find(c=> String(c.id)===String(x.playbackCamera)) || x.cameras[0]; }
function money(v){ return u.n0(v) + ' ج'; }

/* ---------- 📡 fetch بمهلة (+ جسر الـiframe لمدينتي زي cctv.js) ---------- */
function fetchFrameBridge(url){
  return new Promise(function(resolve,reject){
    var id='echarpeCctv'+Date.now()+Math.random().toString(36).slice(2),frame=document.createElement('iframe'),timer=0,origin='';
    try{origin=new URL(url,location.href).origin;}catch(e){reject(e);return;}
    frame.hidden=true;frame.setAttribute('aria-hidden','true');
    function done(err,value){if(timer)clearTimeout(timer);window.removeEventListener('message',onMessage);if(frame.parentNode)frame.parentNode.removeChild(frame);if(err)reject(err);else resolve(value);}
    function onMessage(e){var m=e.data;if(e.origin!==origin||!m||m.source!=='echarpe-cctv-bridge'||m.id!==id)return;done(null,m.data);}
    window.addEventListener('message',onMessage);frame.onerror=function(){done(new Error('cctv_bridge_failed'));};
    timer=setTimeout(function(){done(new Error('cctv_bridge_timeout'));},10000);
    frame.src=url+(url.indexOf('?')>=0?'&':'?')+'bridge=1&bridgeId='+encodeURIComponent(id);document.body.appendChild(frame);
  });
}
function fetchJson(url, ms, branchId){
  const ctl = (typeof AbortController==='function') ? new AbortController() : null; const t = setTimeout(()=>{ try{ ctl && ctl.abort(); }catch(e){} }, ms||8000);
  return fetch(url, { cache:'no-store', credentials:'omit', signal: ctl ? ctl.signal : undefined }).then(r=>{ if(!r.ok) throw new Error('cctv_http_'+r.status); return r.json(); })
    .catch(e=> branchId==='madinaty' ? fetchFrameBridge(url) : Promise.reject(e)).finally(()=> clearTimeout(t));
}
async function probeGateways(force){
  if(!force && warnAt && Date.now() - warnAt < 2*60000) return; warnAt = Date.now();
  await Promise.all(BRANCHES.map(x=> fetchJson(agentGateway(x)+'/health?_='+Date.now(), 6000).then(()=>{ warn[x.id] = false; }, ()=>{ warn[x.id] = true; })));
  if(u.screen()==='cctv') u.render();
}

/* ---------- 🛒 السلة LIVE (office_pos_live) ---------- */
function startLive(){
  if(liveStarted) return; liveStarted = true;
  u.db.collection('office_pos_live').onSnapshot(s=>{ liveDocs = s.docs.map(d=> Object.assign({ id:d.id }, d.data())); const el = document.getElementById('cctvPinned'); if(el) el.innerHTML = pinnedHtml(); else if(u.screen()==='cctv') u.render(); }, e=>{ console.warn('office_pos_live', e && e.code); });
}
function liveDoc(x){
  const norm = v=> String(v||'').trim().toLowerCase(); const aliases = x.liveAliases||[];
  return liveDocs.find(d=>{ const n = norm(d.branch||d.id); return aliases.some(a=> n.indexOf(norm(a))>=0); }) || null;
}
function isOnline(d){ return !!d && (Date.now() - Number(d.updatedAtMs||0)) < 7*60*1000; }
function lastPaymentText(last){
  const p = (last&&last.payments)||{}, total = Math.abs(Number(last&&last.total||0));
  const keys = Object.keys(p).filter(k=> Math.abs(Number(p[k]||0))>.001); const paid = keys.reduce((n,k)=> n + Math.abs(Number(p[k]||0)), 0);
  if(total>0.001 && Math.abs(paid-total)>0.02) return 'طريقة الدفع غير متاحة';
  return keys.map(k=> PAY[k]||k).join(' + ') || '—';
}
function pinnedHtml(){
  const d = liveDoc(site());
  if(!d) return `<div class="empty">POS Live غير متصل — مفيش حالة وصلت من جهاز ${u.esc(site().name)}</div>`;
  const rows = (Array.isArray(d.cart)?d.cart:[]).map(c=> `<div class="row" style="cursor:default"><div class="n"><b>${u.esc(c.name||c.code||'صنف')}${c.isReturn?' <span class="pill p-bad">مرتجع</span>':''}</b><small>× ${Number(c.qty)||0}${c.barcode?' · '+u.esc(c.barcode):''}</small></div><b class="money">${money((Number(c.price)||0)*(Number(c.qty)||0))}</b></div>`).join('');
  const last = d.lastSale || null; const age = Math.max(0, Date.now() - Number(d.updatedAtMs||0));
  return `<div class="row first" style="cursor:default"><div class="n"><b>${u.esc(d.employee||'بدون موظف')}</b><small>${u.esc(d.branch||'')} · آخر تحديث من ${Math.round(age/1000)} ثانية</small></div><span class="pill ${isOnline(d)?'p-good':'p-gray'}">● ${isOnline(d)?'LIVE':'OFFLINE'}</span></div>
    ${rows || '<div class="hint">في انتظار أول صنف…</div>'}
    <div class="row" style="cursor:default;border-top:2px solid var(--ink)"><div class="n"><b>إجمالي السلة</b><small>آخر فاتورة: ${last ? (last.invoiceNo ? '#'+u.esc(last.invoiceNo) : u.esc(last.invoiceCode||'—')) + ' · ' + u.esc(lastPaymentText(last)) : '—'}</small></div><b class="money">${money(d.total)}</b></div>`;
}

/* ---------- 📹 المباشر ---------- */
function mediaHtml(x, c){
  const useMse = !!c.liveStream || x.id!=='madinaty';
  const style = 'width:100%;aspect-ratio:16/9;background:#000;border-radius:12px;border:0;display:block';
  if(x.id==='glow') return `<img title="${u.esc(c.name)}" data-live-frame="${u.esc(frameUrlFor(x,c))}" data-live-branch="glow" alt="${u.esc(c.name)} live" loading="eager" style="${style};object-fit:cover">`;
  if(useMse) return `<iframe title="${u.esc(c.name)}" data-stream-src="${u.esc(streamUrlFor(x,c))}" src="${u.esc(streamUrlFor(x,c))}" allow="autoplay; fullscreen" allowfullscreen loading="eager" style="${style}"></iframe>`;
  return `<img title="${u.esc(c.name)}" data-live-frame="${u.esc(frameUrlFor(x,c))}" data-live-branch="${u.esc(x.id)}" alt="${u.esc(c.name)} live" loading="eager" style="${style};object-fit:cover">`;
}
function armFrames(){
  document.querySelectorAll('#screen img[data-live-frame]').forEach(img=>{
    if(img._armed) return; img._armed = true;
    const base = img.getAttribute('data-live-frame'), glow = img.getAttribute('data-live-branch')==='glow', delay = glow ? 160 : 900;
    const alive = ()=> u.screen()==='cctv' && document.documentElement.contains(img);
    const next = ms=>{ clearTimeout(img._t); img._t = setTimeout(load, ms); };
    function load(){
      if(!alive()) return; if(document.hidden){ next(1500); return; }
      if(glow){ const pre = new Image(); pre.onload = ()=>{ if(!alive()) return; img.src = pre.src; next(delay); }; pre.onerror = ()=> next(700); pre.src = base + Date.now(); return; }
      img.onload = ()=> next(delay); img.onerror = ()=> next(2500); img.src = base + Date.now();
    }
    load();
  });
}
function tile(x, c){
  const on = !!st.on[c.id];
  return `<div class="card" style="padding:10px"><div class="row first" style="cursor:default;padding:0 0 8px"><div class="n"><b>${u.esc(c.name)}</b><small>${u.esc(c.label)}${on?' · <span style="color:var(--good,#16a34a)">● LIVE</span>':' · متوقفة'}</small></div><button class="btn ${on?'r':'p'}" onclick="O2.cctv.cam('${u.esc(c.id)}')">${on?'■ إيقاف':'▶ تشغيل'}</button></div>${on ? mediaHtml(x, c) : `<div onclick="O2.cctv.cam('${u.esc(c.id)}')" style="aspect-ratio:16/9;background:#0f172a;color:#94a3b8;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-direction:column;cursor:pointer"><span style="font-size:28px">📹</span><small>اضغط تشغيل للمشاهدة</small></div>`}</div>`;
}
function vLive(){
  const x = site(); const n = Object.keys(st.on).filter(k=> st.on[k]).length;
  return `<div class="card full"><h3>🛒 السلة LIVE <small>${u.esc(x.name)}</small></h3><div id="cctvPinned">${pinnedHtml()}</div></div>
    <div class="card full" style="display:flex;align-items:center;gap:8px"><b style="flex:1">📹 كاميرات ${u.esc(x.name)} <small class="tag">${n ? '● '+n+' LIVE' : '● متوقف'}</small></b><button class="btn p" onclick="O2.cctv.all(true)">▶ تشغيل الكل</button><button class="btn" onclick="O2.cctv.all(false)">■ إيقاف الكل</button></div>
    ${x.cameras.map(c=> tile(x, c)).join('')}`;
}

/* ---------- 🌐 كل الفروع ---------- */
function vAll(){
  return `<div class="hint full">كاميرا الكاشير من كل فرع — اضغط «كل الكاميرات» لباقي كاميرات الفرع</div>` + BRANCHES.map(x=>{ const c = cashierCam(x); return `<div class="card" style="padding:10px"><div class="row first" style="cursor:default;padding:0 0 8px"><div class="n"><b>${u.esc(x.name)}</b><small>${u.esc(c.label||c.name)}${warn[x.id]?' · <span style="color:var(--bad)">gateway مش متاح</span>':''}</small></div><span class="btns" style="margin:0"><button class="btn" onclick="O2.cctv.branch('${x.id}','live')">كل الكاميرات</button><button class="btn" onclick="O2.cctv.branch('${x.id}','playback')">🎞 تسجيل</button></span></div>${mediaHtml(x, c)}</div>`; }).join('');
}

/* ---------- 🎞 التسجيل — نفس playbackUrl بتاع cctv.js ---------- */
function playbackUrl(x, atMs, durationMin, cameraId, offsetMs, quality){
  if(!x.playback) return '';
  var t=Math.max(1,Number(atMs)||Date.now()),d=Math.min(60,Math.max(1,Number(durationMin)||1));
  var cid=String(cameraId||x.playbackCamera||'1');if(!recordedCameras(x).some(function(c){return String(c.id)===cid;}))cid=String(x.playbackCamera||x.cameras[0].id||'1');
  var requested=Number(quality),q=requested===720?720:(x.id==='madinaty'?360:480);
  var url=agentGateway(x)+'/echarpe-playback/video?camera='+encodeURIComponent(cid)+'&atMs='+encodeURIComponent(t)+'&durationSec='+encodeURIComponent(d*60)+'&quality='+q+((x.id!=='glow')?'&mode=fast':'');
  if(offsetMs!==undefined&&offsetMs!==null)url+='&offsetMs='+encodeURIComponent(Number(offsetMs)||0);
  return url;
}
async function normalizePlaybackStart(x, requestedAt, durationMin, cameraId){
  var at=Math.max(1,Number(requestedAt)||Date.now()),mins=Math.max(1,Number(durationMin)||1);
  if(!x||x.id!=='glow')return at;
  try{
    var r=await fetchJson(agentGateway(x)+'/echarpe-playback/range?camera='+encodeURIComponent(String(cameraId||x.playbackCamera||'1'))+'&_='+Date.now(), 6000, x.id);
    var startMs=Number(r&&r.startMs)||0,endMs=Number(r&&r.endMs)||0,durMs=mins*60000;
    if(startMs&&at<startMs)at=startMs;
    if(endMs&&at+durMs>endMs)at=Math.max(startMs||1,endMs-durMs);
  }catch(e){}
  return at;
}
function pbHtml(){
  const x = pb.x; const url = pb.url || playbackUrl(x, pb.at, pb.mins, pb.cam, pb.offset, pb.q);
  const qSel = x.id==='glow' ? '' : (x.id==='madinaty' ? `<select onchange="O2.cctv.pbQ(this.value)" style="width:auto;margin:0"><option value="360" ${pb.q==360?'selected':''}>360p سريع</option><option value="480" ${pb.q==480?'selected':''}>480p</option><option value="720" ${pb.q==720?'selected':''}>720p</option></select>` : `<select onchange="O2.cctv.pbQ(this.value)" style="width:auto;margin:0"><option value="480" ${pb.q!=720?'selected':''}>480p سريع</option><option value="720" ${pb.q==720?'selected':''}>720p</option></select>`);
  return `<h2>🎞 ${u.esc(pb.title || ('تسجيل · ' + x.name))}</h2><div class="hint">${u.esc(pb.sub || (u.dayName(pb.at) + ' ' + u.caiKey(pb.at) + ' ' + u.hm(pb.at) + ' · ' + pb.mins + ' دقيقة · كاميرا ' + pb.cam))}</div>
    <video controls autoplay playsinline style="width:100%;border-radius:12px;background:#000;max-height:60vh" src="${u.esc(url + '&retry=' + Date.now())}" onplaying="O2.cctv.pbSt('')" onwaiting="O2.cctv.pbSt('⏳ جاري تحميل الفيديو…')" onerror="O2.cctv.pbSt('⚠️ التسجيل مش متاح في الوقت ده — الـgateway واقع أو التسجيل أقدم من المتاح')"></video>
    <div id="cctvPbSt" class="hint">جاري تجهيز التسجيل…</div>
    <div class="btns" style="align-items:center">${pb.step ? `<button class="btn" onclick="O2.cctv.pbStep(-1)">⏮ السابق</button><button class="btn" onclick="O2.cctv.pbStep(1)">التالي ⏭</button>` : ''}${qSel}<a class="btn" href="${u.esc(url)}" target="_blank" rel="noopener">فتح منفصل ↗</a><button class="btn" onclick="O2.closeSheet()">✕</button></div>`;
}
async function openPlayback(x, atMs, mins, cam, quality, opt){
  opt = opt || {};
  if(!x){ u.toast('الفرع ده مفيش له كاميرات معرّفة'); return; }
  if(!x.playback){ u.toast('التسجيل مش متاح لفرع ' + x.name); return; }
  mins = Math.max(1, Number(mins)||1);
  pb = { x, at: Math.max(1, Number(atMs)||Date.now()), mins, cam: String(cam||x.playbackCamera||'1'), q: quality, step: opt.step !== false, title: opt.title, sub: opt.sub, url: opt.url || '' };
  if(x.id==='glow' && !opt.url){ u.sheet('<h2>🎞 تسجيل · Glow</h2><div class="skel"></div><div class="hint">بيظبط الوقت على آخر تسجيل متاح…</div>'); const at = await normalizePlaybackStart(x, pb.at, mins, pb.cam); if(!pb || pb.x !== x) return; pb.at = at; }
  u.sheet(pbHtml());
}
function pbStep(dir){ if(!pb) return; pb.url = ''; pb.at = Math.max(1, pb.at + dir * pb.mins * 60000); u.sheet(pbHtml()); }
function defaultForm(x){
  const now = Date.now() - 60000; const p = u.caiParts(now);
  if(!form.date) form.date = u.caiKey(now);
  if(!form.time) form.time = String(p.h).padStart(2,'0') + ':' + String(Math.floor(p.mi/5)*5).padStart(2,'0');
  if(!recordedCameras(x).some(c=> String(c.id)===form.cam)) form.cam = String(x.playbackCamera || x.cameras[0].id || '1');
}
function vPlayback(){
  const x = site(); defaultForm(x);
  const hint = x.id==='rehab' ? 'تسجيل الكاشير فقط على كمبيوتر الفرع · باقي الكاميرات للمشاهدة المباشرة' : x.id==='madinaty' ? 'تسجيل كمبيوتر الفرع — دقيقة سريعة Video-only.' : x.id==='glow' ? 'تسجيل كمبيوتر Glow — دقيقة سريعة Video-only، والوقت يتظبط تلقائيًا على آخر تسجيل متاح.' : 'اختار الكاميرا واليوم والوقت.';
  const I = 'width:100%;padding:10px;border:1px solid var(--line);border-radius:12px;font-family:inherit;font-weight:800;margin:4px 0';
  const qSel = x.id==='glow' ? '' : `<select onchange="O2.cctv.f('q',this.value)" style="${I}">${(x.id==='madinaty' ? [['360','360p سريع'],['480','480p'],['720','720p']] : [['480','480p سريع'],['720','720p']]).map(([v,t])=> `<option value="${v}" ${form.q===v?'selected':''}>${t}</option>`).join('')}</select>`;
  return `<div class="card full"><h3>🎞 التسجيل السريع <small>${u.esc(x.name)}</small></h3><div class="hint">${u.esc(hint)}</div>
    <select onchange="O2.cctv.f('cam',this.value)" style="${I}">${recordedCameras(x).map(c=> `<option value="${u.esc(c.id)}" ${form.cam===String(c.id)?'selected':''}>${u.esc(c.name)} · ${u.esc(c.label)}</option>`).join('')}</select>
    <div class="grid2"><input type="date" value="${u.esc(form.date)}" max="${u.caiKey(Date.now())}" onchange="O2.cctv.f('date',this.value)" style="${I}"><input type="time" value="${u.esc(form.time)}" step="60" onchange="O2.cctv.f('time',this.value)" style="${I}"></div>
    <div class="grid2"><select onchange="O2.cctv.f('dur',this.value)" style="${I}">${[['1','1 دقيقة — أسرع'],['5','5 دقائق'],['10','10 دقائق'],['15','15 دقيقة'],['30','30 دقيقة']].map(([v,t])=> `<option value="${v}" ${form.dur===v?'selected':''}>${t}</option>`).join('')}</select>${qSel}</div>
    <div class="btns"><button class="btn p" onclick="O2.cctv.play()">▶ شغّل التسجيل</button><button class="btn" onclick="O2.cctv.playNow()">⏱ دلوقتي</button></div>
    <div class="hint">الوقت بتوقيت القاهرة · التسجيل بيفتح في نافذة تحت وفيها «السابق/التالي» للتنقل بنفس المدة</div></div>`;
}
function play(){
  const x = site(); defaultForm(x);
  const a = String(form.date||'').split('-').map(Number), t = String(form.time||'').split(':').map(Number);
  if(a.length!==3 || !a[0] || t.length<2){ u.toast('اختار اليوم والوقت'); return; }
  openPlayback(x, u.caiStamp(a[0], a[1], a[2], t[0]||0, t[1]||0), Number(form.dur)||1, form.cam, form.q ? Number(form.q) : undefined);
}
function playNow(){ const now = Date.now() - 60000; const p = u.caiParts(now); form.date = u.caiKey(now); form.time = String(p.h).padStart(2,'0') + ':' + String(p.mi).padStart(2,'0'); u.render(); play(); }

/* ---------- 🕘 اليوم — فواتير اليوم + لقطات + فيديو ---------- */
function loadDayRows(key){
  if(dayRows[key] && (dayRows[key].loading || dayRows[key].rows)) return;
  dayRows[key] = { loading:true, rows:null, err:'' };
  u.loadDay(key).then(rows=>{ dayRows[key] = { loading:false, rows: rows.slice(), err: (u.dayCache[key]||{}).err || '' }; }, e=>{ dayRows[key] = { loading:false, rows:[], err: String(e && (e.code||e.message)) }; }).then(()=>{ if(u.screen()==='cctv') u.render(); });
}
function dayRow(x, s){
  const ms = u.saleMs(s); const pm = Object.entries(s.payments||{}).filter(([k,v])=> Math.abs(Number(v)||0)>.001).map(([k,v])=> (PAY[k]||k) + ' ' + money(v)).join(' · ');
  const cust = (s.customerName||s.customerPhone) ? '👤 ' + u.esc(s.customerName||'عميل') + (s.customerPhone ? ' · ' + u.esc(s.customerPhone) : '') : '👤 بدون عميل';
  const cnt = Number(s.itemCount || (s.items||[]).length);
  return `<div class="row" style="cursor:default;flex-wrap:wrap"><div class="n"><b>${u.hm(ms)} · فاتورة #${u.esc(s.invoiceNo||s.invoiceCode||s.id||'')} · ${money(s.total)}${s.reversed?' <span class="pill p-gray">معكوسة</span>':''}${Number(s.total)<0?' <span class="pill p-bad">مرتجع</span>':''}</b><small>${cust} · ${u.esc(s.employeeName||s.employee||s.seller||'')}</small><small>💳 ${u.esc(pm||'—')} · ${cnt} صنف</small></div><span class="btns" style="margin:0;width:100%">${s.invoiceCode?`<button class="btn" onclick="O2.cctv.shots('${u.esc(String(s.invoiceCode))}')">📸 لقطات</button>`:''}${x.playback?`<button class="btn p" onclick="O2.cctv.saleVideo('${u.esc(s.id)}',${ms})">🎥 فيديو</button>`:''}<button class="btn" onclick="O2.cctv.invoice('${u.esc(s.id)}')">🧾 الفاتورة</button></span></div>`;
}
function vDay(){
  const x = site(); const key = st.dayKey; const today = u.caiKey(Date.now()); const a = key.split('-').map(Number); const dayMs = u.caiStamp(a[0],a[1],a[2],12,0);
  const nav = `<div class="card full" style="display:flex;align-items:center;gap:8px"><button class="back" onclick="O2.cctv.day(-1)">‹</button><input type="date" value="${key}" max="${today}" onchange="O2.cctv.dayPick(this.value)" style="flex:1;padding:9px;border:1px solid var(--line);border-radius:10px;font-family:inherit;font-weight:800;text-align:center"><button class="back" onclick="O2.cctv.day(1)" ${key>=today?'disabled':''}>›</button><span class="tag">${u.dayName(dayMs)}</span></div>`;
  const c = dayRows[key]; if(!c || c.loading){ loadDayRows(key); return nav + '<div class="card full"><div class="skel"></div><div class="hint">بيجيب فواتير اليوم…</div></div>'; }
  if(c.err) return nav + `<div class="card full"><b style="color:var(--bad)">تعذر تحميل اليوم: ${u.esc(c.err)}</b><div class="btns"><button class="btn" onclick="O2.cctv.dayReload()">↻ حاول تاني</button></div></div>`;
  const rows = c.rows.filter(s=> branchMatches(s.branch, x)).sort((p,q)=> u.saleMs(q) - u.saleMs(p));
  return nav + `<div class="card full"><h3>🕘 فواتير ${u.esc(x.name)} <small>${rows.length} فاتورة · لقطات الكاشير وفيديو كل فاتورة</small></h3>${rows.map(s=> dayRow(x, s)).join('') || '<div class="empty">مفيش فواتير في اليوم ده للفرع ده</div>'}${key===today?'<div class="btns"><button class="btn w" onclick="O2.cctv.dayReload()">↻ تحديث</button></div>':''}</div>`;
}
function saleVideo(id, ms){ const x = site(); openPlayback(x, Math.max(1, Number(ms) - 30*1000), 2, x.playbackCamera, undefined, { title:'فيديو الفاتورة · ' + x.name, sub:'كاميرا الكاشير · من 30 ثانية قبل الفاتورة لدقيقتين' }); }
function invoiceVideoUrl(d, profile, gateway, startAtMs, durationSec, quality){
  var cid=String(d.cameraId||(profile&&profile.cashierCamera)||'1'),v=gateway+'/echarpe-playback/video?camera='+encodeURIComponent(cid)+'&atMs='+encodeURIComponent(Math.max(1,Number(startAtMs)||1))+'&durationSec='+encodeURIComponent(Math.max(30,Math.min(1800,Number(durationSec)||60)))+'&quality='+encodeURIComponent(quality||'480');
  if(d.clockSource==='nvr_isapi'||d.clockSource==='config')v+='&offsetMs='+encodeURIComponent(Number(d.nvrOffsetMs)||0);
  if(String(quality||'480')==='480')v+='&mode=fast';
  return v;
}
let shotDoc = null;
async function shots(invoiceCode){
  u.sheet('<h2>📸 لقطات الفاتورة</h2><div class="skel"></div>');
  try{
    const snap = await u.db.collection('pos_cctv_invoice_snapshots').doc(String(invoiceCode)).get();
    if(!snap.exists){ u.sheet(`<h2>📸 ${u.esc(invoiceCode)}</h2><div class="empty">مفيش لقطات محفوظة للفاتورة دي</div>`); return; }
    const d = snap.data() || {}; let sh = d.shots || {};
    if(!Object.keys(sh).length && /^data:image\/jpeg;base64,/.test(String(d.jpegData||''))) sh = { after_save:{ jpegData:d.jpegData, capturedAtMs:d.capturedAtMs, camera:d.camera||'CCTV' } };
    const profile = profileFor(d.branchProfile||d.branch); const localBranch = !!d.localSnapshots || String(d.storage||'').toLowerCase()==='branch_local';
    const gateway = String(profile ? agentGateway(profile) : (d.gateway||'')).replace(/\/$/,'');
    const valid = localBranch ? SHOT_ORDER.slice() : SHOT_ORDER.filter(k=> /^data:image\/jpeg;base64,/.test(String((sh[k]||{}).jpegData||'')));
    const playbackReady = !!gateway && !!(profile && profile.playback) && Number(d.videoAtMs) > 0;
    if(!valid.length && !playbackReady){ u.sheet(`<h2>📸 ${u.esc(invoiceCode)}</h2><div class="empty">مفيش صورة أو تسجيل صالح محفوظ للفاتورة دي</div>`); return; }
    const shotUrl = k=> localBranch ? (gateway+'/echarpe-events/snapshot?invoice='+encodeURIComponent(String(invoiceCode))+'&stage='+encodeURIComponent(k)+'&_='+Date.now()) : String((sh[k]||{}).jpegData||'');
    shotDoc = { d, profile, gateway, code: String(invoiceCode) };
    u.sheet(`<h2>📸 لقطات الفاتورة ${u.esc(invoiceCode)}</h2><div class="hint">${u.esc(d.camera || ((sh[valid[0]]||{}).camera) || 'CCTV')} · ${valid.length} لقطة${localBranch ? ' · محفوظة محليًا في الفرع' : ''}${d.invoiceNo ? ' · #' + u.esc(d.invoiceNo) : ''}</div>
      ${playbackReady ? `<div class="btns"><button class="btn p" onclick="O2.cctv.shotVideo()">🎥 30 ثانية قبل + 30 بعد</button></div>` : ''}
      ${valid.map(k=>{ const s = sh[k]||{}; return `<div style="margin:8px 0"><img src="${u.esc(shotUrl(k))}" alt="${u.esc(SHOT_AR[k])}" style="width:100%;border-radius:12px;background:#000;aspect-ratio:16/10;object-fit:cover" onerror="this.style.opacity=.3;this.nextElementSibling.textContent+=' · تعذر تحميل اللقطة من كمبيوتر الفرع'"><div class="hint">${SHOT_AR[k]}${s.capturedAtMs ? ' · ' + u.hm(s.capturedAtMs) : ''}</div></div>`; }).join('') || '<div class="hint">الصور غير متاحة، التسجيل موجود.</div>'}`);
  }catch(e){ u.sheet('<h2>📸</h2><div class="empty">تعذر: ' + u.esc(e && (e.code||e.message)) + '</div>'); }
}
function shotVideo(q){
  if(!shotDoc) return; const { d, profile, gateway } = shotDoc; const at = Number(d.videoAtMs) - 30000; q = q || '480';
  openPlayback(profile, at, 1, d.cameraId || profile.playbackCamera, Number(q), { step:false, url: invoiceVideoUrl(d, profile, gateway, at, 60, q), title:'فيديو الفاتورة ' + shotDoc.code, sub:'30 ثانية قبل الحفظ + 30 ثانية بعده · التسجيل محفوظ على ' + (d.clockSource==='pos_pc' ? 'كمبيوتر الفرع' : 'الـNVR') });
}

/* ---------- 🚨 النشاط — زوار وتنبيهات من الـgateway ---------- */
function trackingProfile(x){
  if(x.id==='madinaty')return {enabled:true,door:'8',cashier:'4',expected:4,label:'Camera 8 يبدأ وينهي التراك · الكاميرات تسلّم الشخص لبعضها بنفس ID · Cam 4 تربط الأشخاص الموجودين خلف الكاشير بالموظفين النشطين · لا يتم حفظ صورة أو وجه في هوية الزائر.'};
  if(x.id==='glow')return {enabled:true,door:'3',cashier:'1',expected:4,label:'Camera 3 يبدأ وينهي التراك · الكاميرات تسلّم الشخص لبعضها بنفس ID · Cam 1 تربط الأشخاص الموجودين خلف الكاشير بالموظفين النشطين · لا يتم حفظ صورة أو وجه في هوية الزائر.'};
  return {enabled:false,door:'',cashier:String(x.playbackCamera||'1'),expected:(x.cameras||[]).length,label:''};
}
function normalizeTrackingStatus(raw){ if(!raw)return {}; if(raw.state)return raw; if(raw.generatedAtMs&&raw.configuredCameras)return {detector:true,state:raw}; return raw; }
async function loadActivity(force){
  const x = site(); const key = x.id; if(act.loading || (!force && act.key===key && act.data)) return;
  act.loading = true; act.key = key; act.err = ''; u.render();
  try{
    const base = agentGateway(x);
    const pair = await Promise.all([
      fetchJson(base+'/echarpe-playback/alerts?_='+Date.now(), 8000, x.id),
      fetchJson(base+'/echarpe-playback/activity-status?_='+Date.now(), 8000, x.id).catch(()=> null),
      fetchJson(base+'/echarpe-playback/staff-state?_='+Date.now(), 8000, x.id).catch(()=> null) ]);
    const det = normalizeTrackingStatus(pair[1]||{}); const s = det.state || {};
    act.data = { items: Array.isArray(pair[0] && pair[0].items) ? pair[0].items : [], det, staff: pair[2]||null };
    // 🧾 فواتير الشراء لكل يوم في تاريخ الزوار (من نفس كاش الأيام)
    const hist = (Array.isArray(s.trafficHistory) ? s.trafficHistory : []).slice(0,7); act.sales = {};
    for(const r of hist){ const k = String(r.dateKey||''); if(!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue; try{ const rows = await u.loadDay(k); act.sales[k] = rows.filter(sale=> branchMatches(sale.branch, x) && Number(sale.total||0) > 0 && !sale.reversed && !sale.isReversal).length; }catch(e){ act.sales[k] = 0; } }
  }catch(e){ act.data = null; act.err = 'الـgateway مش متاح'; }
  act.loading = false; if(u.screen()==='cctv') u.render();
}
function vActivity(){
  const x = site(); const tp = trackingProfile(x);
  if(!tp.enabled) return `<div class="card full"><h3>🚨 النشاط <small>${u.esc(x.name)}</small></h3><div class="empty">تتبّع الزوار والتنبيهات متاح لفرعي مدينتي وGlow بس</div></div>`;
  if(act.key !== x.id || (!act.data && !act.err && !act.loading)) setTimeout(()=> loadActivity(), 0);
  const head = `<div class="card full" style="display:flex;align-items:center;gap:8px"><b style="flex:1">📊 الزوار والنشاط <small class="tag">${u.esc(x.name)} · كاميرا الباب ${tp.door}</small></b><button class="btn" onclick="O2.cctv.actReload()">↻ تحديث</button></div>`;
  if(act.loading || act.key !== x.id) return head + '<div class="card full"><div class="skel"></div><div class="hint">بيفحص كاشف الأشخاص والتنبيهات…</div></div>';
  if(act.err) return head + `<div class="card full"><div class="alert w" style="cursor:default">⚠️ ${u.esc(act.err)} — الفرع ${u.esc(x.name)}</div></div>`;
  const { items, det, staff } = act.data; const s = det.state || {}; const online = Array.isArray(s.onlineCameras) ? s.onlineCameras.map(String) : [];
  const directValid = !!(staff && String(staff.branch||staff.branchId||'').toLowerCase()===String(x.id).toLowerCase());
  const staffSource = directValid ? String(staff.source||'') : String(s.staffSource||''), staffCount = directValid ? Number(staff.activeStaffCount||0) : Number(s.activeStaffCount||0), staffFresh = directValid ? (staff.sourceHealthy!==false) : !!s.attendanceFresh;
  const healthy = !!(det.detector && staffFresh && online.indexOf(tp.door)>=0 && online.length>=Math.min(3,tp.expected));
  const source = staffSource==='pos_firestore'?'POS مباشر':staffSource==='sales_fallback'?'Sales احتياطي':staffSource==='diag_v648'?'تشخيص مؤقت':'لا يوجد مصدر';
  const occ = s.occupancyCertain===true ? Number(s.customersInside||0) : 'غير مؤكد';
  const status = det.detector ? `<span class="pill ${healthy?'p-good':'p-warn'}">● كاميرات ${online.length}/${tp.expected} · باب ${tp.door} ${online.indexOf(tp.door)>=0?'✓':'✕'}</span> <span class="pill p-gray">عملاء جوه ${occ} · موظفين ${staffCount} · ${u.esc(source)}</span>` : '<span class="pill p-bad">● الكاشف غير متصل</span>';
  const hist = (Array.isArray(s.trafficHistory) ? s.trafficHistory : []).slice(0,7);
  let traffic;
  if(!hist.length) traffic = `<div class="empty">تقرير الزوار يبدأ بعد أول حركة دخول/خروج في ${u.esc(x.name)} عبر Camera ${tp.door}</div>`;
  else {
    const vis = r=> (Number(r.uniqueStartedAtMs||0)>0 ? Number(r.uniqueVisitors||0) : Number(r.entries||0));
    const t = hist[0]; const v = vis(t), sl = Number(act.sales[t.dateKey]||0), conv = v>0 ? sl/v*100 : 0; const cur = s.occupancyCertain===true ? Number(s.customersInside||0) : null;
    const hours = t.hours||{}; const hourRows = Object.keys(hours).sort().map(h=>{ const r = hours[h]||{}; return `<span class="pill p-gray" style="margin:2px">${u.esc(h)}:00 · ${Number(r.entries||0)} دخول · ${Number(r.exits||0)} خروج</span>`; }).join('');
    traffic = `<div class="kpis"><div class="kpi"><small>عملاء مختلفين النهاردة</small><b>${v}</b></div><div class="kpi"><small>فواتير شراء</small><b>${sl}</b></div><div class="kpi"><small>Conversion</small><b>${conv.toFixed(1)}%</b></div><div class="kpi"><small>داخل الفرع دلوقتي</small><b>${cur===null?'غير مؤكد':cur}</b></div></div>
      <div class="hint">${u.esc(tp.label)}</div><div>${hourRows || '<small class="hint">لا توجد حركة مسجلة بالساعة حتى الآن.</small>'}</div>
      <div class="sec">آخر ${hist.length} أيام</div>${hist.map(r=>{ const vv = vis(r), ss = Number(act.sales[r.dateKey]||0), cv = vv>0 ? ss/vv*100 : 0; return `<div class="row" style="cursor:default"><div class="n"><b>${u.esc(r.dateKey)}</b><small>${vv} زائر · ${ss} مشتري</small></div><span class="pill ${cv>=30?'p-good':'p-gray'}">${cv.toFixed(1)}%</span></div>`; }).join('')}`;
  }
  const alerts = items.map((a,i)=>{ const sale = a.type==='sale_without_customer'; const label = sale ? (a.transactionKind==='return_or_exchange' ? 'مرتجع/تبديل بدون عميل ظاهر' : 'فاتورة بيع بدون عميل ظاهر') : 'نشاط سلة قوي بدون فاتورة'; const ms = Number(a.atMs)||0; return `<div class="alert w" style="cursor:default;flex-wrap:wrap"><span style="flex:1;min-width:0"><b>🚨 ${label}</b><br><small class="tag">${u.dayName(ms)} ${u.caiKey(ms).slice(5)} · ${u.hm(ms)} · كاميرا ${u.esc(tp.cashier)} و${u.esc(tp.door)} + صوت + سلة · ${Number((a.events||[]).length)} علامة</small></span><span class="btns" style="margin:0;width:100%"><button class="btn p" onclick="O2.cctv.actPlay(${i})">🎥 مراجعة</button></span></div>`; }).join('');
  return head + `<div class="card full"><h3>📊 الزوار و Conversion <small>آخر 7 أيام</small></h3><div style="margin-bottom:8px">${status}</div>${traffic}</div><div class="card full"><h3>🚨 تنبيهات النشاط <small>${items.length}</small></h3>${alerts || '<div class="empty">لا يوجد نشاط قوي يحتاج مراجعة ✅</div>'}</div>`;
}
function actPlay(i){
  const x = site(); const a = (act.data && act.data.items || [])[i]; if(!a) return;
  const start = Math.max(1, Number(a.startMs) || Number(a.atMs) - 30000), duration = Math.max(30, Number(a.durationSec)||90);
  openPlayback(x, start, Math.max(1, Math.ceil(duration/60)), trackingProfile(x).cashier, 480, { title:'مراجعة النشاط · ' + x.name, sub:'كاميرا الكاشير ' + trackingProfile(x).cashier + ' · ' + Math.round(duration) + ' ثانية من ' + u.hm(start) });
}

/* ---------- 🖼 الشاشة ---------- */
const VIEWS = [['live','📹 مباشر'],['all','🌐 كل الفروع'],['playback','🎞 تسجيل'],['day','🕘 اليوم'],['activity','🚨 النشاط']];
function render(){
  startLive();
  const x = site(); const local = localBranchActive(x);
  u.head('📹 الكاميرات', (local ? '⚡ LOCAL · ' : '☁ REMOTE · ') + x.name + ' · ' + VIEWS.find(v=> v[0]===st.view)[1]);
  const chips = `<div class="seg full" style="flex-wrap:wrap">${BRANCHES.map(b=> `<button class="${b.id===st.branch && st.view!=='all' ? 'on':''}" onclick="O2.cctv.branch('${b.id}')">🏬 ${u.esc(b.name)}${warn[b.id]?' ⚠️':''}</button>`).join('')}<button class="${LOCAL_REVIEW?'on':''}" onclick="O2.cctv.local()" title="افتح Office 2 مباشرة من شبكة Glow">${LOCAL_REVIEW ? '⚡ LOCAL شغال' : '⚡ Local'}</button></div>`;
  const seg = `<div class="seg full">${VIEWS.map(v=> `<button class="${st.view===v[0]?'on':''}" onclick="O2.cctv.view('${v[0]}')">${v[1]}</button>`).join('')}</div>`;
  const down = BRANCHES.filter(b=> warn[b.id]);
  const warnBar = down.length ? `<div class="alert w full" style="cursor:default">⚠️ gateway ${down.map(b=> u.esc(b.name)).join(' و')} مش متاح — الكاميرات والتسجيل مش هيفتحوا لحد ما يرجع <span class="link" onclick="O2.cctv.probe()">↻ افحص تاني</span></div>` : '';
  const body = st.view==='all' ? vAll() : st.view==='playback' ? vPlayback() : st.view==='day' ? vDay() : st.view==='activity' ? vActivity() : vLive();
  setTimeout(armFrames, 0);
  return chips + seg + warnBar + body;
}
function setView(v){ if(st.view==='live' && v!=='live') st.on = {}; st.view = v; u.render(); }
O2.cctv = {
  view: setView,
  branch(id, view){ if(!siteById(id)) return; if(st.branch !== id){ st.branch = id; st.on = {}; } if(view) st.view = view; else if(st.view==='all') st.view = 'live'; u.render(); },
  cam(id){ st.on[id] = !st.on[id]; u.render(); },
  all(on){ st.on = {}; if(on) site().cameras.forEach(c=>{ st.on[c.id] = true; }); u.render(); },
  local(){ if(LOCAL_REVIEW){ location.href = '/office2/'; return; } location.href = 'http://192.168.0.107:1990/office2/'; },
  probe(){ probeGateways(true); u.toast('بيفحص الـgateways…'); },
  f(k, v){ form[k] = String(v||''); },
  play, playNow, pbStep, pbQ(v){ if(!pb) return; pb.q = Number(v); pb.url = ''; u.sheet(pbHtml()); }, pbSt(t){ const el = document.getElementById('cctvPbSt'); if(el) el.textContent = t; },
  day(d){ const a = st.dayKey.split('-').map(Number); const k = u.caiKey(u.caiStamp(a[0],a[1],a[2],12,0) + d*u.DAY); if(k > u.caiKey(Date.now())) return; st.dayKey = k; u.render(); },
  dayPick(v){ if(/^\d{4}-\d{2}-\d{2}$/.test(v||'') && v <= u.caiKey(Date.now())){ st.dayKey = v; u.render(); } },
  dayReload(){ delete dayRows[st.dayKey]; if(u.dayCache[st.dayKey]) u.dayCache[st.dayKey].done = false; u.render(); },
  saleVideo, shots, shotVideo, invoice(id){ u.invoiceAny(id); },
  actReload(){ loadActivity(true); }, actPlay,
  openAt(branch, ms, mins){ const p = profileFor(branch); if(!p){ u.toast('الفرع ده مفيش له كاميرات معرّفة'); return; } st.branch = p.id; openPlayback(p, ms, mins||1, p.playbackCamera); }
};
O2.register('cctv', { icon:'📹', title:'الكاميرات', desc:'مباشر · كل الفروع · تسجيل · فواتير اليوم باللقطات والفيديو · زوار وتنبيهات', order:10, tab:'more',
  enter(){ st.on = {}; startLive(); probeGateways(false); }, render });
})();
