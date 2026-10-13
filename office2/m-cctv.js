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
/* بعض الـtunnels (مدينتي) بتعدّي /echarpe-playback/* بس للـagent، فـ/health بيرجّع 404 من go2rtc.
   نجرّب /health، وبعدين نفس الفحص تحت /echarpe-playback/، وآخر حاجة أي endpoint خفيف من الـagent. */
const HEALTH_PATHS = ['/health', '/echarpe-playback/health', '/echarpe-playback/alerts'];
async function probeHealth(gateway){
  let last = new Error('cctv_probe_failed');
  for(const path of HEALTH_PATHS){
    let j;
    try{ j = await fetchJson(gateway+path+'?_='+Date.now(), 6000); }catch(e){ last = e; continue; }   // المسار مش موصول — جرّب اللي بعده
    if(j && j.ok===false) throw new Error('cctv_unhealthy');   // الـagent ردّ وقال إنه مش سليم — ده تحذير حقيقي
    return j;
  }
  throw last;
}
async function probeGateways(force){
  if(!force && warnAt && Date.now() - warnAt < 2*60000) return; warnAt = Date.now();
  await Promise.all(BRANCHES.map(x=> probeHealth(agentGateway(x)).then(()=>{ warn[x.id] = false; }, ()=>{ warn[x.id] = true; })));
  if(u.screen()==='cctv' && st.view!=='review') u.render();   // المراجعة فيها مشغّل شغال — مانمسحوش
}

/* ---------- 🛒 السلة LIVE (office_pos_live) ---------- */
function startLive(){
  if(liveStarted) return; liveStarted = true;
  u.db.collection('office_pos_live').onSnapshot(s=>{ liveDocs = s.docs.map(d=> Object.assign({ id:d.id }, d.data())); const el = document.getElementById('cctvPinned'); if(el) el.innerHTML = pinnedHtml(); else if(u.screen()==='cctv' && st.view==='live') u.render(); }, e=>{ console.warn('office_pos_live', e && e.code); });
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
  return `<div class="row" style="cursor:default;flex-wrap:wrap"><div class="n"><b>${u.hm(ms)} · فاتورة #${u.esc(s.invoiceNo||s.invoiceCode||s.id||'')} · ${money(s.total)}${s.reversed?' <span class="pill p-gray">معكوسة</span>':''}${Number(s.total)<0?' <span class="pill p-bad">مرتجع</span>':''}</b><small>${cust} · ${u.esc(s.employeeName||s.employee||s.seller||'')}</small><small>💳 ${u.esc(pm||'—')} · ${cnt} صنف</small></div><span class="btns" style="margin:0;width:100%">${s.invoiceCode?`<button class="btn" onclick="O2.cctv.shots('${u.esc(String(s.invoiceCode))}')">📸 لقطات</button>`:''}${x.playback?`<button class="btn p" onclick="O2.cctv.saleVideo('${u.esc(s.id)}',${ms})">🎥 فيديو</button>`:''}${x.playback?`<button class="btn" onclick="O2.cctv.reviewAt(${ms},'${u.esc(String(s.invoiceCode||''))}')">📼 مراجعة بالسلة</button>`:''}<button class="btn" onclick="O2.cctv.invoice('${u.esc(s.id)}')">🧾 الفاتورة</button></span></div>`;
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

/* ---------- 📼 مراجعة اليوم — فيديو متصل + شريط أحداث الـPOS + السلة متزامنة ----------
   · الأحداث من pos_cctv_invoice_timelines (سلة كل فاتورة بالوقت) + pos_activity_log (خصم، درج، مرتجع…)
   · الفيديو بيتحمّل قطع صغيرة ورا بعض؛ وقت أي لحظة = بداية القطعة + وقت المشغّل (ساعة كمبيوتر الفرع، نفس ساعة الـPOS)
   · المشغّل شغال = مفيش u.render() (بيمسح الفيديو) — التحديث كله على عناصر بالـid */
const RV = window.O2CctvReview;
const RV_CHUNK = 120, RV_PX_MIN = 14, RV_LEAD = 4000;
const RV_TONE = { add:'#16a34a', del:'#dc2626', edit:'#d97706', pay:'#2563eb', sale:'#0f172a', alert:'#9333ea' };
const RV_FILTERS = [['all','الكل'],['del','🗑 حذف وتقليل'],['alert','⚠️ تنبيهات'],['sale','🧾 فواتير']];
const rv = { focus:'', loadToken:0, seekTo:0, aligned:false, key:'', branch:'', loaded:false, loading:false, err:'', actErr:false, events:[], timelines:[], span:null, cur:0, chunkStart:0, cam:'', filter:'all', rate:1, skip:false, idx:-2, basketKey:'', pendingAt:0 };
function hms(ms){ const p = u.caiParts(ms); return String(p.h).padStart(2,'0') + ':' + String(p.mi).padStart(2,'0') + ':' + String(Math.floor(ms/1000)%60).padStart(2,'0'); }
function rvMatch(e){ if(rv.focus && e.invoiceCode !== rv.focus) return false; return rv.filter==='all' || (rv.filter==='del' && (e.removedValue > 0 || e.tone==='del')) || (rv.filter==='alert' && e.tone==='alert') || (rv.filter==='sale' && e.kind==='sale_saved'); }
async function loadReview(force){
  const x = site(), key = st.dayKey;
  if(rv.loading || (!force && rv.loaded && rv.key===key && rv.branch===x.id)) return;
  rv.loading = true; rv.loaded = false; rv.err = ''; rv.key = key; rv.branch = x.id; u.render();
  try{
    const a = key.split('-').map(Number), start = u.caiStamp(a[0],a[1],a[2],0,0), end = start + u.DAY;
    // 3 مصادر للسلة بالترتيب: (1) pos_cctv_invoice_timelines · (2) نفس المستند محفوظ احتياطي جوّه
    // pos_cctv_invoice_snapshots.basketTimeline (الـPOS بيكتبه هناك لما المجموعة الأولى مرفوضة بالـrules)
    // · (3) أصناف الفاتورة نفسها (سلة نهائية بس). أي مصدر يفشل مايوقّفش الباقي.
    const none = ()=> null;
    const got = await Promise.all([
      u.db.collection('pos_cctv_invoice_timelines').where('endedAtMs','>=',start).where('endedAtMs','<',end).get().catch(none),
      u.db.collection('pos_cctv_invoice_snapshots').where('basketTimeline.endedAtMs','>=',start).where('basketTimeline.endedAtMs','<',end).get().catch(none),
      u.db.collection('pos_activity_log').where('ts','>=',start).where('ts','<',end).get().catch(none),
      u.loadDay(key).catch(none) ]);
    const byCode = {}; rv.src = { timelines:0, snapshots:0, sales:0 };
    if(got[0]) got[0].docs.forEach(d=>{ const t = d.data() || {}; if(t.invoiceCode && branchMatches(t.branch, x)){ byCode[String(t.invoiceCode)] = t; rv.src.timelines++; } });
    if(got[1]) got[1].docs.forEach(d=>{ const t = (d.data() || {}).basketTimeline; if(t && t.invoiceCode && !byCode[String(t.invoiceCode)] && branchMatches(t.branch, x)){ byCode[String(t.invoiceCode)] = t; rv.src.snapshots++; } });
    (got[3] || []).forEach(sale=>{ const code = String(sale && (sale.invoiceCode || sale.id) || ''); if(!code || byCode[code] || !branchMatches(sale.branch, x)) return; const t = RV.fromSale(sale, u.saleMs(sale)); if(t && t.endedAtMs >= start && t.endedAtMs < end){ byCode[code] = t; rv.src.sales++; } });
    if(!got[0] && !got[1] && !got[3]) throw new Error('permission-denied');
    rv.timelines = Object.keys(byCode).map(k=> byCode[k]);
    rv.actErr = !got[2];
    rv.events = RV.buildEvents(rv.timelines, got[2] ? got[2].docs.map(d=> d.data()).filter(r=> branchMatches(r.branch, x)) : []);
    rv.span = RV.span(rv.events, start, Math.min(end, Date.now()));
    rv.cur = rv.pendingAt || (rv.events.length ? Math.max(rv.span.start, rv.events[0].atMs - RV_LEAD) : rv.span.start);
    if(rv.focus){ const fe = rv.events.find(e=> e.invoiceCode===rv.focus); if(fe) rv.cur = Math.max(rv.span.start, fe.atMs - RV_LEAD); }
    rv.pendingAt = 0; rv.chunkStart = 0; rv.idx = -2; rv.basketKey = '';
    if(!recordedCameras(x).some(c=> String(c.id)===rv.cam)) rv.cam = String(x.playbackCamera || x.cameras[0].id || '1');
    rv.loaded = true;
  }catch(e){ rv.err = String(e && (e.code||e.message)); }
  rv.loading = false; if(u.screen()==='cctv') u.render();
}
function rvX(ms){ return (ms - rv.span.start) / 60000 * RV_PX_MIN; }
function rvStripHtml(){
  const w = Math.max(320, Math.ceil(rvX(rv.span.end))); let ticks = '';
  for(let t = Math.ceil(rv.span.start / 600000) * 600000; t <= rv.span.end; t += 600000){ const hour = (t % 3600000) === 0; ticks += `<div style="position:absolute;left:${rvX(t).toFixed(1)}px;top:0;bottom:0;border-left:1px solid ${hour?'#94a3b8':'#e2e8f0'}"></div><div style="position:absolute;left:${(rvX(t)+3).toFixed(1)}px;top:1px;font-size:10px;color:#64748b;font-weight:${hour?800:500}">${u.hm(t)}</div>`; }
  const marks = rv.events.map((e, i)=> `<div title="${u.esc(hms(e.atMs) + ' ' + e.label)}" style="position:absolute;left:${(rvX(e.atMs)-2).toFixed(1)}px;top:${e.removedValue>0||e.tone==='alert'?16:26}px;width:4px;height:${e.removedValue>0||e.tone==='alert'?34:20}px;border-radius:2px;background:${RV_TONE[e.tone]||'#64748b'};opacity:${rvMatch(e)?1:.18}"></div>`).join('');
  return `<div id="rvStrip" onclick="O2.cctv.rvStripTap(event)" ontouchstart="O2.cctv.rvHold()" onpointerdown="O2.cctv.rvHold()" onwheel="O2.cctv.rvHold()" style="direction:ltr;overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:#f8fafc;-webkit-overflow-scrolling:touch"><div id="rvStripIn" style="position:relative;height:56px;width:${w}px">${ticks}${marks}<div id="rvHead" style="position:absolute;top:0;bottom:0;width:2px;background:#ef4444;left:0;box-shadow:0 0 0 1px rgba(239,68,68,.25)"></div></div></div>`;
}
function rvBasketHtml(b){
  if(!b) return '<div class="hint" style="margin:0">🛒 مفيش سلة مفتوحة في اللحظة دي</div>';
  return `<div style="display:flex;justify-content:space-between;align-items:center;font-weight:800"><span>🛒 فاتورة ${b.invoiceNo ? '#' + u.esc(b.invoiceNo) : u.esc(b.invoiceCode)}${b.saved ? ' <span class="pill p-gray">اتحفظت</span>' : ''}</span><span class="money">${money(b.total)}</span></div>` +
    (b.rows.map(r=> `<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-top:1px dashed var(--line);font-size:13px"><span>${r.ret?'↩️ ':''}${u.esc(r.name)}</span><span style="white-space:nowrap">${r.qty} × ${u.n0(r.price)}</span></div>`).join('') || '<div class="hint" style="margin:0">السلة فاضية</div>');
}
function rvListHtml(){
  const rows = rv.events.map((e, i)=> rvMatch(e) ? `<div id="rvE${i}" class="row" onclick="O2.cctv.rvGo(${i})" style="align-items:flex-start;gap:8px"><span style="flex:none;width:10px;height:10px;border-radius:50%;margin-top:6px;background:${RV_TONE[e.tone]||'#64748b'}"></span><div class="n"><b>${hms(e.atMs)} · ${u.esc(e.label)}${e.removedValue>0 ? ' <span class="pill p-bad">−' + u.n0(e.removedValue) + ' ج</span>' : ''}</b><small>${u.esc(e.detail||'')}${e.invoiceNo ? ' · فاتورة #' + u.esc(e.invoiceNo) : ''}${e.total!=null && e.source==='cart' ? ' · الإجمالي ' + u.n0(e.total) : ''}</small></div></div>` : '').join('');
  return rows || '<div class="empty">مفيش أحداث من النوع ده في اليوم</div>';
}
function vReview(){
  const x = site(); const key = st.dayKey; const today = u.caiKey(Date.now()); const a = key.split('-').map(Number); const dayMs = u.caiStamp(a[0],a[1],a[2],12,0);
  const nav = `<div class="card full" style="display:flex;align-items:center;gap:8px"><button class="back" onclick="O2.cctv.day(-1)">‹</button><input type="date" value="${key}" max="${today}" onchange="O2.cctv.dayPick(this.value)" style="flex:1;padding:9px;border:1px solid var(--line);border-radius:10px;font-family:inherit;font-weight:800;text-align:center"><button class="back" onclick="O2.cctv.day(1)" ${key>=today?'disabled':''}>›</button><span class="tag">${u.dayName(dayMs)}</span></div>`;
  if(!x.playback) return nav + `<div class="card full"><div class="empty">التسجيل مش متاح لفرع ${u.esc(x.name)}</div></div>`;
  if(!RV) return nav + '<div class="card full"><div class="empty">حدّث الصفحة — ملف المراجعة لسه ماتحمّلش</div></div>';
  if((rv.key!==key || rv.branch!==x.id) && !rv.loading){ rv.err = ''; rv.loaded = false; }
  if(rv.err) return nav + `<div class="card full"><b style="color:var(--bad)">تعذر تحميل أحداث اليوم: ${u.esc(rv.err)}</b><div class="btns"><button class="btn" onclick="O2.cctv.rvReload()">↻ حاول تاني</button></div></div>`;
  if(rv.loading || !rv.loaded){ if(!rv.loading) setTimeout(()=> loadReview(), 0); return nav + '<div class="card full"><div class="skel"></div><div class="hint">بيجيب أحداث اليوم من الـPOS…</div></div>'; }
  { const old = rvVideo(); rv.resume = !!(old && !old.paused && !old.ended); }   // لو الشاشة اترسمت تاني والفيديو شغال، كمّل من نفس اللحظة
  const I = 'width:auto;margin:0;padding:8px;border:1px solid var(--line);border-radius:10px;font-family:inherit;font-weight:800';
  setTimeout(rvMount, 0);
  const evs = rv.focus ? rv.events.filter(e=> e.invoiceCode===rv.focus) : rv.events; const fs2 = RV.summary(evs);
  const focusInv = rv.focus ? rv.timelines.find(t=> String(t.invoiceCode)===rv.focus) : null;
  const focusBar = rv.focus ? `<div class="card full" style="display:flex;align-items:center;gap:8px;background:#eff6ff"><b style="flex:1">🧾 بتراجع فاتورة ${focusInv && focusInv.invoiceNo ? '#' + u.esc(focusInv.invoiceNo) : u.esc(rv.focus)} بس</b><button class="btn" onclick="O2.cctv.rvFocus('')">اليوم كله</button></div>` : '';
  const V = 'style="width:100%;border-radius:12px;background:#000;max-height:46vh;display:block"';
  return nav + focusBar + `<div class="card full">
    <video id="rvVideo" controls playsinline muted ${V} ontimeupdate="O2.cctv.rvTick()" onseeking="O2.cctv.rvTick()" onseeked="O2.cctv.rvSt('');O2.cctv.rvTick()" oncanplay="O2.cctv.rvSt('')" onended="O2.cctv.rvNext()" onloadeddata="O2.cctv.rvReady()" onplaying="O2.cctv.rvSt('')" onwaiting="O2.cctv.rvSt('⏳ جاري تحميل الفيديو…')" onerror="O2.cctv.rvSt('⚠️ مفيش تسجيل للوقت ده — أقدم من المتاح أو الـgateway واقع')"></video>
    <div id="rvBasket" style="border:1px solid var(--line);border-radius:12px;padding:10px;margin-top:8px;min-height:44px;background:#f8fafc"></div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:10px 2px 6px"><b id="rvClock" style="font-size:20px;font-variant-numeric:tabular-nums">${hms(rv.cur)}</b><span id="rvSt" class="hint" style="margin:0"></span></div>
    ${rvStripHtml()}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px"><button class="btn" style="padding:12px 6px" onclick="O2.cctv.rvStep(-1)">⏮ الحدث السابق</button><button class="btn p" style="padding:12px 6px" onclick="O2.cctv.rvStep(1)">الحدث التالي ⏭</button></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1.4fr;gap:6px;margin-top:6px"><button class="btn" onclick="O2.cctv.rvJump(-10)">−10ث</button><button class="btn" onclick="O2.cctv.rvJump(10)">+10ث</button>
      <select onchange="O2.cctv.rvRate(this.value)" style="${I};width:100%">${[1,2,4,8].map(v=> `<option value="${v}" ${rv.rate===v?'selected':''}>${v}×</option>`).join('')}</select>
      <select onchange="O2.cctv.rvCam(this.value)" style="${I};width:100%">${recordedCameras(x).map(c=> `<option value="${u.esc(c.id)}" ${rv.cam===String(c.id)?'selected':''}>${u.esc(c.label||c.name)}</option>`).join('')}</select></div>
    <details style="margin-top:10px"><summary style="font-weight:800;font-size:13px;cursor:pointer;color:#475569">⚙️ إعدادات (تخطّي الفاضي · ضبط التزامن)</summary>
      <label style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:13px;margin-top:8px"><input type="checkbox" ${rv.skip?'checked':''} onchange="O2.cctv.rvSkip(this.checked)" style="width:auto;margin:0"> تخطّي الوقت الفاضي — نط للحدث الجاي لوحدك</label>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;font-size:12px"><span class="hint" style="margin:0">ضبط السلة على الصورة:</span><button class="btn" style="padding:4px 9px" onclick="O2.cctv.rvNudge(-500)">السلة بدري ◀</button><b id="rvOff" style="min-width:44px;text-align:center">0.0ث</b><button class="btn" style="padding:4px 9px" onclick="O2.cctv.rvNudge(500)">▶ السلة متأخرة</button></div>
      <div id="rvAlign" class="hint"></div></details>
    </div>
    <div class="card full"><h3>📋 ${rv.focus ? 'أحداث الفاتورة' : 'أحداث اليوم'} <small>${rv.focus ? '' : fs2.sales + ' فاتورة · '}${fs2.total} حدث</small></h3>
    ${rv.focus ? (()=>{ const other = RV.summary(rv.events.filter(e=> e.invoiceCode!==rv.focus)); return other.removed ? `<div class="alert w" style="margin:0 0 8px" onclick="O2.cctv.rvFocus('')">🗑 فيه ${other.removed} حذف/تقليل تاني في اليوم ده برّه الفاتورة دي (بقيمة ${u.n0(other.removedValue)} ج — العلامات الحمرا الباهتة على الشريط)<span class="go">اعرض اليوم كله ›</span></div>` : ''; })() : ''}
    <div class="hint" style="margin-top:0">${fs2.removed ? `🗑 ${fs2.removed} مرة حذف/تقليل بقيمة <b>${u.n0(fs2.removedValue)} ج</b>` : '🗑 مفيش حذف من السلة'} · ⚠️ ${fs2.alerts} تنبيه${rv.actErr ? ' · سجل النشاط ماتحمّلش' : ''}${!rv.focus && rv.src && rv.src.sales ? ' · ' + rv.src.sales + ' فاتورة بسلتها النهائية بس' : ''}</div>
    <div class="seg" style="flex-wrap:wrap">${RV_FILTERS.map(f=> `<button id="rvF_${f[0]}" class="${rv.filter===f[0]?'on':''}" onclick="O2.cctv.rvFilter('${f[0]}')">${f[1]}</button>`).join('')}</div>
    <div id="rvList" style="max-height:52vh;overflow-y:auto;margin-top:8px">${rvListHtml()}</div>
    <div class="hint">دوس على أي حدث والفيديو يروح له (${RV_LEAD/1000} ثواني قبله)</div></div>
    <details class="card full"><summary style="font-weight:800;cursor:pointer">🔴 شاشة الكاشير دلوقتي (السلة LIVE)</summary><div id="cctvPinned" style="margin-top:8px">${pinnedHtml()}</div><div class="btns"><button class="btn p" onclick="O2.cctv.rvLive()">🔴 ودّيني للكاميرا دلوقتي</button></div></details>`;
}
function rvVideo(){ return document.getElementById('rvVideo'); }
function rvUrl(atMs){ const x = site(); return agentGateway(x) + '/echarpe-playback/video?camera=' + encodeURIComponent(rv.cam) + '&atMs=' + Math.floor(atMs) + '&durationSec=' + RV_CHUNK + '&quality=360&mode=fast'; }
/* 🎯 التزامن: الفيديو بيتقطع عند keyframe، فلو طلبنا وقت عشوائي القطعة بتبدأ بعده بثواني (اتقاس: 0 لـ3ث).
   الحل: نسأل الـagent الأول «أقرب بداية segment قبل الوقت ده فين؟» ونطلب القطعة من البداية دي بالظبط.
   لو الـagent قديم (مفيش clip-start) بنكمل بالطريقة القديمة ونعلّم إن التزامن تقريبي. */
function rvOffKey(){ return 'o2.cctv.sync.' + rv.branch + '.' + rv.cam; }
function rvOff(){ try{ return Number(localStorage.getItem(rvOffKey())) || 0; }catch(e){ return 0; } }
function rvOffLabel(){ const el = document.getElementById('rvOff'); if(el){ const o = rvOff(); el.textContent = (o > 0 ? '+' : '') + (o / 1000).toFixed(1) + 'ث'; } const a = document.getElementById('rvAlign'); if(a) a.textContent = rv.aligned ? '🎯 تزامن دقيق' : '≈ تزامن تقريبي (لحد 5ث) — الـagent محتاج تحديث'; }
async function rvLoad(ms, autoplay){
  const v = rvVideo(); if(!v) return; const x = site(); const want = Math.floor(ms), token = ++rv.loadToken;
  rvSt('⏳ جاري تحميل الفيديو…'); let start = want, aligned = false;
  try{ const j = await fetchJson(agentGateway(x) + '/echarpe-playback/clip-start?camera=' + encodeURIComponent(rv.cam) + '&atMs=' + want + '&_=' + Date.now(), 4000); if(j && j.ok && Number(j.startMs) > 0 && want - Number(j.startMs) < 30000){ start = Number(j.startMs); aligned = true; } }catch(e){}
  if(token !== rv.loadToken || rvVideo() !== v) return;      // طلب أحدث سبق
  rv.aligned = aligned; rv.chunkStart = start; rv.seekTo = aligned ? Math.max(0, (want - start) / 1000) : 0; rv.cur = want;
  v.src = rvUrl(start); v.playbackRate = rv.rate;
  if(autoplay){ const p = v.play(); if(p && p.catch) p.catch(()=>{}); }
  rvOffLabel(); rvPaint(true);
}
function rvSeek(ms, autoplay){
  const v = rvVideo(); if(!v || !rv.span) return;
  ms = Math.max(rv.span.start, Math.min(ms, Math.max(rv.span.start, Date.now() - 20000)));
  const off = (ms - rvOff() - rv.chunkStart) / 1000;
  if(rv.chunkStart && off >= 0 && off < RV_CHUNK - 3 && v.readyState >= 1 && isFinite(v.duration) && off < v.duration - 1){ v.currentTime = off; rv.cur = ms; if(autoplay){ const p = v.play(); if(p && p.catch) p.catch(()=>{}); } rvPaint(true); }
  else rvLoad(ms - rvOff(), autoplay);
}
function rvMount(){ const v = rvVideo(); if(!v || v.getAttribute('data-on')) return; v.setAttribute('data-on','1'); rv.idx = -2; rv.basketKey = ''; rvLoad(rv.cur || rv.span.start, !!rv.resume); rv.resume = false; }
function rvSt(t){ const el = document.getElementById('rvSt'); if(el) el.textContent = t; }
function rvPaint(scroll){
  const clock = document.getElementById('rvClock'); if(clock) clock.textContent = hms(rv.cur);
  const head = document.getElementById('rvHead'), strip = document.getElementById('rvStrip');
  if(head && strip){ const px = rvX(rv.cur); head.style.left = px.toFixed(1) + 'px'; if(scroll || (!(rv.holdUntil > Date.now()) && (px < strip.scrollLeft + 30 || px > strip.scrollLeft + strip.clientWidth - 30))) strip.scrollLeft = Math.max(0, px - strip.clientWidth / 2); }
  const b = RV.basketAt(rv.timelines, rv.cur); const bk = b ? b.invoiceCode + '|' + b.atMs : '';
  if(bk !== rv.basketKey){ rv.basketKey = bk; const el = document.getElementById('rvBasket'); if(el) el.innerHTML = rvBasketHtml(b); }
  const i = RV.nearestIndex(rv.events, rv.cur);
  if(i !== rv.idx){
    const old = document.getElementById('rvE' + rv.idx); if(old) old.style.background = '';
    rv.idx = i; const el = document.getElementById('rvE' + i);
    if(el){ el.style.background = '#fef9c3'; const list = document.getElementById('rvList'); if(list) list.scrollTop = Math.max(0, el.offsetTop - list.offsetTop - list.clientHeight / 3); }
  }
}
function rvTick(){
  const v = rvVideo(); if(!v || !rv.chunkStart) return;
  if(rv.seekTo > 0) return;                                 // لسه هننط لبداية اللحظة المطلوبة جوّه القطعة
  rv.cur = rv.chunkStart + v.currentTime * 1000 + rvOff(); rvPaint(false);
  // تخطّي الفاضي: لو مفيش حدث قريب، نط لقبل الحدث الجاي على طول
  if(rv.skip && !v.paused){ const i = RV.nearestIndex(rv.events, rv.cur), next = rv.events[i+1], last = rv.events[i]; if(next && next.atMs - rv.cur > 45000 && (!last || rv.cur - last.atMs > 12000)) rvSeek(next.atMs - RV_LEAD, true); }
}
function rvReady(){ rvSt(''); const v = rvVideo(); if(v && rv.seekTo > 0){ const t = rv.seekTo; rv.seekTo = 0; try{ v.currentTime = t; }catch(e){} } }
function rvNext(){ const at = rv.chunkStart + RV_CHUNK * 1000; if(rv.span && at < Math.min(rv.span.end, Date.now() - 30000)) rvLoad(at, true); else rvSt('⏹ آخر اليوم'); }
function rvStep(dir){
  let i = RV.nearestIndex(rv.events, rv.cur + (dir > 0 ? RV_LEAD + 1500 : -1500));
  if(dir > 0){ for(i = i + 1; i < rv.events.length && !rvMatch(rv.events[i]); i++); } else { for(; i >= 0 && !rvMatch(rv.events[i]); i--); }
  if(i < 0 || i >= rv.events.length){ u.toast(dir > 0 ? 'مفيش أحداث بعد كده' : 'ده أول حدث'); return; }
  rvSeek(rv.events[i].atMs - RV_LEAD, true);
}
function rvStripTap(ev){
  const inner = document.getElementById('rvStripIn'); if(!inner || !rv.span) return; const r = inner.getBoundingClientRect(); const at = rv.span.start + (ev.clientX - r.left) / RV_PX_MIN * 60000;
  // 🎯 v13: لو انت بتراجع فاتورة واحدة ودوست على علامة حدث من فاتورة تانية (زي حذف قطعة) — نفتح اليوم كله عشان الحدث يبان في القايمة
  if(rv.focus){ const near = rv.events.filter(e=> Math.abs(e.atMs - at) <= 20000).sort((a,b)=> Math.abs(a.atMs-at) - Math.abs(b.atMs-at))[0]; if(near && near.invoiceCode !== rv.focus){ rv.focus = ''; rv.idx = -2; rv.cur = Math.max(rv.span.start, at - RV_LEAD); rv.resume = false; u.render(); u.toast('🗑 الحدث ده من فاتورة تانية — اتفتح اليوم كله'); return; } }
  rvSeek(at, true);
}
function rvFilter(f){
  rv.filter = f; rv.idx = -2;
  RV_FILTERS.forEach(x=>{ const b = document.getElementById('rvF_' + x[0]); if(b) b.className = x[0]===f ? 'on' : ''; });
  const list = document.getElementById('rvList'); if(list) list.innerHTML = rvListHtml();
  const strip = document.getElementById('rvStrip'); if(strip){ const left = strip.scrollLeft; strip.outerHTML = rvStripHtml(); const s2 = document.getElementById('rvStrip'); if(s2) s2.scrollLeft = left; }
  rvPaint(false);
}
function reviewAt(ms, code){ rv.focus = String(code||''); rv.pendingAt = Math.max(1, Number(ms) - 30000); rv.loaded = false; st.view = 'review'; u.render(); }
/* من أي فاتورة في Office: افتح مراجعة يومها عند وقتها، مركّزة على الفاتورة دي. */
function reviewSale(sale){
  if(!sale) return false; const p = profileFor(sale.branch); if(!p || !p.playback) return false; const ms = u.saleMs(sale); if(!ms) return false;
  st.branch = p.id; st.dayKey = u.caiKey(ms); st.view = 'review'; rv.focus = String(sale.invoiceCode||''); rv.pendingAt = Math.max(1, ms - 30000); rv.loaded = false;
  u.closeSheet(); if(u.screen() !== 'cctv') u.go('cctv'); else u.render(); return true;
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
const VIEWS = [['live','📹 مباشر'],['all','🌐 كل الفروع'],['playback','🎞 تسجيل'],['day','🕘 اليوم'],['review','📼 مراجعة'],['activity','🚨 النشاط']];
function render(){
  startLive();
  const x = site(); const local = localBranchActive(x);
  u.head('📹 الكاميرات', (local ? '⚡ LOCAL · ' : '☁ REMOTE · ') + x.name + ' · ' + VIEWS.find(v=> v[0]===st.view)[1]);
  const chips = `<div class="seg full" style="flex-wrap:wrap">${BRANCHES.map(b=> `<button class="${b.id===st.branch && st.view!=='all' ? 'on':''}" onclick="O2.cctv.branch('${b.id}')">🏬 ${u.esc(b.name)}${warn[b.id]?' ⚠️':''}</button>`).join('')}<button class="${LOCAL_REVIEW?'on':''}" onclick="O2.cctv.local()" title="افتح Office 2 مباشرة من شبكة Glow">${LOCAL_REVIEW ? '⚡ LOCAL شغال' : '⚡ Local'}</button></div>`;
  const seg = `<div class="seg full">${VIEWS.map(v=> `<button class="${st.view===v[0]?'on':''}" onclick="O2.cctv.view('${v[0]}')">${v[1]}</button>`).join('')}</div>`;
  const down = BRANCHES.filter(b=> warn[b.id]);
  const warnBar = down.length ? `<div class="alert w full" style="cursor:default">⚠️ gateway ${down.map(b=> u.esc(b.name)).join(' و')} مش متاح — الكاميرات والتسجيل مش هيفتحوا لحد ما يرجع <span class="link" onclick="O2.cctv.probe()">↻ افحص تاني</span></div>` : '';
  const body = st.view==='all' ? vAll() : st.view==='playback' ? vPlayback() : st.view==='day' ? vDay() : st.view==='review' ? vReview() : st.view==='activity' ? vActivity() : vLive();
  setTimeout(armFrames, 0);
  return chips + seg + warnBar + body;
}
function setView(v){ if(st.view==='live' && v!=='live') st.on = {}; st.view = v; u.render(); }
O2.cctv = {
  view: setView,
  branch(id, view){ if(!siteById(id)) return; if(st.branch !== id){ st.branch = id; st.on = {}; } if(view) st.view = view; else if(st.view==='all') st.view = 'live'; u.render(); },
  cam(id){ st.on[id] = !st.on[id]; u.render(); },
  all(on){ st.on = {}; if(on) site().cameras.forEach(c=>{ st.on[c.id] = true; }); u.render(); },
  local(){ if(LOCAL_REVIEW){ location.href = '/Office/'; return; } location.href = 'http://192.168.0.107:1990/Office/'; },
  probe(){ probeGateways(true); u.toast('بيفحص الـgateways…'); },
  f(k, v){ form[k] = String(v||''); },
  play, playNow, pbStep, pbQ(v){ if(!pb) return; pb.q = Number(v); pb.url = ''; u.sheet(pbHtml()); }, pbSt(t){ const el = document.getElementById('cctvPbSt'); if(el) el.textContent = t; },
  day(d){ const a = st.dayKey.split('-').map(Number); const k = u.caiKey(u.caiStamp(a[0],a[1],a[2],12,0) + d*u.DAY); if(k > u.caiKey(Date.now())) return; st.dayKey = k; u.render(); },
  dayPick(v){ if(/^\d{4}-\d{2}-\d{2}$/.test(v||'') && v <= u.caiKey(Date.now())){ st.dayKey = v; u.render(); } },
  dayReload(){ delete dayRows[st.dayKey]; if(u.dayCache[st.dayKey]) u.dayCache[st.dayKey].done = false; u.render(); },
  saleVideo, shots, shotVideo, invoice(id){ u.invoiceAny(id); },
  actReload(){ loadActivity(true); }, actPlay,
  reviewAt, reviewSale, canReview(branch){ const p = profileFor(branch); return !!(p && p.playback && RV); },
  reviewSaleId(id){ const s = u.windowSales(0).find(x=> x.id===id) || Object.keys(u.dayCache).map(k=> ((u.dayCache[k]||{}).rows||[]).find(x=> x.id===id)).find(Boolean); if(!reviewSale(s)) u.toast('مفيش تسجيل كاميرا للفاتورة دي'); },
  // ✋ v14: وانت بتسحب الشريط بإيدك، الشريط مايرجعش لمكان الفيديو لوحده لمدة 15 ثانية (كان بيشدّك كل ثانية)
  rvHold(){ rv.holdUntil = Date.now() + 15000; },
  rvFocus(code){ rv.focus = String(code||''); rv.idx = -2; u.render(); },
  rvTick, rvNext, rvSt, rvStep, rvStripTap, rvFilter,
  rvGo(i){ const e = rv.events[i]; if(e) rvSeek(e.atMs - RV_LEAD, true); },
  rvJump(sec){ rvSeek(rv.cur + sec * 1000, true); },
  rvRate(v){ rv.rate = Number(v) || 1; const el = rvVideo(); if(el) el.playbackRate = rv.rate; },
  rvCam(v){ rv.cam = String(v); rvLoad(rv.cur, true); },
  rvSkip(on){ rv.skip = !!on; }, rvReady,
  rvNudge(d){ try{ localStorage.setItem(rvOffKey(), String(Math.max(-15000, Math.min(15000, rvOff() + d)))); }catch(e){} rv.basketKey = ''; rv.idx = -2; rvOffLabel(); rvTick(); },
  rvLive(){ if(st.dayKey !== u.caiKey(Date.now())){ st.dayKey = u.caiKey(Date.now()); rv.pendingAt = Date.now() - 30000; rv.loaded = false; u.render(); return; } rvSeek(Date.now() - 30000, true); },
  rvReload(){ rv.err = ''; rv.loaded = false; loadReview(true); },
  openAt(branch, ms, mins){ const p = profileFor(branch); if(!p){ u.toast('الفرع ده مفيش له كاميرات معرّفة'); return; } st.branch = p.id; openPlayback(p, ms, mins||1, p.playbackCamera); }
};
O2.register('cctv', { icon:'📹', title:'الكاميرات', desc:'مباشر · كل الفروع · تسجيل · فواتير اليوم باللقطات والفيديو · مراجعة اليوم بأحداث الـPOS والسلة · زوار وتنبيهات', order:10, tab:'more',
  enter(){ st.on = {}; startLive(); probeGateways(false); }   /* st.view بيفضل زي ما reviewSale ظبطه */, render });
})();
