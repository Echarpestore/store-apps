/* ECHARPE Office CCTV v428
   Control Room: 1/2/4 selectable panels. Each panel can be a live camera,
   POS basket, or POS/payment status. Uses Office's existing office_pos_live
   listener — no second Firestore listener and no extra video traffic for hidden panels. */
(function(){
  'use strict';
  var KEY='echarpe.office.cctv.v428';
  var BRANCHES=[{
    id:'madinaty', name:'مدينتي', gateway:'https://cctv-madinaty.echarpe.store',
    liveAliases:['madinaty','مدينتي'],
    cameras:[
      {id:'4',name:'D04',label:'الكاشير',stream:'camera4'},
      {id:'5',name:'D05',label:'كاميرا 5',stream:'camera5'},
      {id:'7',name:'D07',label:'كاميرا 7',stream:'camera7'},
      {id:'8',name:'D08',label:'كاميرا 8',stream:'camera8'}
    ]
  }];
  var state={active:false,branch:'madinaty',layout:2,sources:['cam:4','pos:cart','cam:5','pos:status']};
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);});}
  function money(v){return Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' ج.م';}
  function b(){return BRANCHES.find(function(x){return x.id===state.branch;})||BRANCHES[0];}
  function cam(id){var x=b();return x.cameras.find(function(c){return c.id===String(id);})||x.cameras[0];}
  function streamUrl(c){return b().gateway+'/stream.html?src='+encodeURIComponent(c.stream);}
  function load(){try{var x=JSON.parse(localStorage.getItem(KEY)||'{}');if(BRANCHES.some(function(y){return y.id===x.branch;}))state.branch=x.branch;if([1,2,4].indexOf(Number(x.layout))>=0)state.layout=Number(x.layout);if(Array.isArray(x.sources))for(var i=0;i<4;i++)if(typeof x.sources[i]==='string')state.sources[i]=x.sources[i];}catch(e){}}
  function save(){try{localStorage.setItem(KEY,JSON.stringify({branch:state.branch,layout:state.layout,sources:state.sources}));}catch(e){}}
  function sourceOptions(selected){
    var x=b(), out=x.cameras.map(function(c){return '<option value="cam:'+esc(c.id)+'" '+(selected==='cam:'+c.id?'selected':'')+'>📹 '+esc(c.name)+' · '+esc(c.label)+'</option>';});
    out.push('<option value="pos:cart" '+(selected==='pos:cart'?'selected':'')+'>🛒 POS Live · السلة</option>');
    out.push('<option value="pos:status" '+(selected==='pos:status'?'selected':'')+'>💳 POS Live · الدفع والحالة</option>');
    return out.join('');
  }
  function liveDoc(){
    var docs=(window.ofLiveGetDocs&&window.ofLiveGetDocs())||[], x=b(), aliases=x.liveAliases||[];
    function norm(v){return String(v||'').trim().toLowerCase();}
    var hit=docs.find(function(d){var n=norm(d.branch||d.id);return aliases.some(function(a){return n.indexOf(norm(a))>=0;});});
    return hit||docs.slice().sort(function(a,c){return Number(c.updatedAtMs||0)-Number(a.updatedAtMs||0);})[0]||null;
  }
  function isOnline(d){return !!d && Math.max(0,Date.now()-Number(d.updatedAtMs||0))<7*60*1000;}
  function posCartHtml(d){
    if(!d)return '<div class="of-cctv-empty">POS مدينتي لم يرسل حالة Live بعد</div>';
    var rows=(d.cart||[]).map(function(x){return '<div class="of-cctv-pos-row"><span>'+esc(x.name||x.code||'صنف')+(x.isReturn?' ↩️':'')+' <small class="muted">× '+Number(x.qty||0)+'</small></span><b>'+money(Number(x.price||0)*Number(x.qty||0))+'</b></div>';}).join('');
    var age=Math.max(0,Date.now()-Number(d.updatedAtMs||0));
    return '<div class="of-cctv-pos"><div style="display:flex;justify-content:space-between;gap:8px"><div><b>🛒 السلة الآن</b><div class="muted" style="font-size:10px;margin-top:2px">'+esc(d.employee||'بدون موظف')+' · '+esc(d.branch||'')+'</div></div><span class="of-cctv-pos-live">'+(isOnline(d)?'● LIVE':'● آخر تحديث')+'</span></div>'+(rows||'<div class="muted" style="padding:22px 0;text-align:center">السلة فاضية</div>')+'<div class="of-cctv-pos-total"><b>الإجمالي</b><b>'+money(d.total)+'</b></div><div class="muted" style="font-size:9px;margin-top:6px">آخر تحديث منذ '+Math.round(age/1000)+' ثانية</div></div>';
  }
  function posStatusHtml(d){
    if(!d)return '<div class="of-cctv-empty">لا توجد حالة POS Live للفرع</div>';
    var pays=(d.payments||[]).map(function(q){var nm=q.method==='visa'?'💳 كارت '+(q.seq||''):q.method==='cash'?'💵 كاش':q.method==='instapay'?'📱 Instapay':esc(q.method||'دفع');var st=q.status==='approved'?' ✅':q.status==='pending'?' ⏳':q.status==='failed'?' ❌':'';return '<span class="of-cctv-pos-chip">'+nm+st+' · <b>'+money(q.amount)+'</b></span>';}).join('');
    var last=d.lastSale||null;
    var lastHtml=last?'<div style="margin-top:10px;padding:9px;border-radius:10px;background:#ecfdf5;border:1px solid #a7f3d0"><div style="display:flex;justify-content:space-between;gap:8px"><b>✅ آخر عملية</b><small class="muted">'+(window.ofWhen?window.ofWhen(last.atMs,false):'')+'</small></div><div style="margin-top:5px"><b>'+money(last.total)+'</b> <small class="muted">'+esc(last.invoiceNo?'#'+last.invoiceNo:'')+'</small></div></div>':'';
    return '<div class="of-cctv-pos"><div style="display:flex;justify-content:space-between;gap:8px"><div><b>💳 حالة الدفع</b><div class="muted" style="font-size:10px;margin-top:2px">'+esc(d.employee||'بدون موظف')+'</div></div><span class="of-cctv-pos-live">'+(isOnline(d)?'● LIVE':'● OFFLINE')+'</span></div><div style="margin-top:8px">'+(pays||'<div class="muted" style="padding:12px 0">مفيش دفع جاري</div>')+'</div>'+lastHtml+'</div>';
  }
  function stopPanel(panel){panel.querySelectorAll('iframe').forEach(function(f){try{f.src='about:blank';f.remove();}catch(e){}});}
  function renderPanel(i){
    var panel=document.querySelector('.of-cctv-panel[data-panel="'+i+'"]');if(!panel)return;stopPanel(panel);
    var src=state.sources[i]||'cam:4', body=panel.querySelector('.of-cctv-panel-body');if(!body)return;
    if(src.indexOf('cam:')===0){var c=cam(src.split(':')[1]);body.className='of-cctv-panel-body of-cctv-video';body.innerHTML='<iframe title="'+esc(c.name)+'" allow="autoplay; fullscreen" referrerpolicy="no-referrer" src="'+esc(streamUrl(c))+'"></iframe>';}
    else {body.className='of-cctv-panel-body';var d=liveDoc();body.innerHTML=src==='pos:status'?posStatusHtml(d):posCartHtml(d);}
  }
  function renderBranches(){var el=document.getElementById('ofCctvBranches');if(!el)return;el.innerHTML=BRANCHES.map(function(x){return '<button class="of-cctv-chip '+(x.id===state.branch?'active':'')+'" data-cctv-branch="'+esc(x.id)+'">🏬 '+esc(x.name)+'</button>';}).join('');el.querySelectorAll('[data-cctv-branch]').forEach(function(btn){btn.onclick=function(){if(btn.dataset.cctvBranch===state.branch)return;state.branch=btn.dataset.cctvBranch;save();render();};});}
  function render(){
    if(!state.active)return;renderBranches();document.querySelectorAll('[data-layout]').forEach(function(x){x.classList.toggle('active',Number(x.dataset.layout)===state.layout);});
    var grid=document.getElementById('ofCctvGrid');if(!grid)return;grid.className='of-cctv-grid of-cctv-grid-'+state.layout;
    var count=state.layout, html='';for(var i=0;i<count;i++)html+='<div class="of-cctv-panel" data-panel="'+i+'"><div class="of-cctv-panel-head"><select class="of-cctv-source" data-cctv-source="'+i+'">'+sourceOptions(state.sources[i])+'</select><button type="button" class="of-cctv-panel-full" data-cctv-full="'+i+'" title="تكبير">⛶</button></div><div class="of-cctv-panel-body"></div></div>';
    grid.innerHTML=html;
    grid.querySelectorAll('[data-cctv-source]').forEach(function(sel){sel.onchange=function(){var i=Number(sel.dataset.cctvSource);state.sources[i]=sel.value;save();renderPanel(i);};});
    grid.querySelectorAll('[data-cctv-full]').forEach(function(btn){btn.onclick=function(){var p=grid.querySelector('.of-cctv-panel[data-panel="'+btn.dataset.cctvFull+'"]');if(p)p.classList.toggle('maximized');};});
    for(var j=0;j<count;j++)renderPanel(j);
  }
  function refreshPosOnly(){if(!state.active)return;for(var i=0;i<state.layout;i++)if(String(state.sources[i]||'').indexOf('pos:')===0)renderPanel(i);}
  function stop(){state.active=false;var grid=document.getElementById('ofCctvGrid');if(grid){grid.querySelectorAll('.of-cctv-panel').forEach(stopPanel);grid.innerHTML='';}}
  function start(){state.active=true;render();}
  function init(){load();document.querySelectorAll('[data-layout]').forEach(function(btn){btn.onclick=function(){state.layout=Number(btn.dataset.layout)||2;save();render();};});window.addEventListener('office-pos-live-update',refreshPosOnly);window.addEventListener('beforeunload',stop);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.ofCctvStart=start;window.ofCctvStop=stop;
})();

/* v426 invoice snapshot timeline: up to 4 stages, with legacy one-shot fallback. */
window.ofCctvInvoiceShot = async function(invoiceCode){
  try{
    if(!invoiceCode||typeof db==='undefined')return;
    var snap=await db.collection('pos_cctv_invoice_snapshots').doc(String(invoiceCode)).get();
    if(!snap.exists){alert('مفيش لقطات محفوظة للفاتورة دي.');return;}
    var d=snap.data()||{}, shots=d.shots||{};
    // توافق كامل مع v421-v425: المستند القديم فيه jpegData واحدة فقط.
    if(!Object.keys(shots).length && /^data:image\/jpeg;base64,/.test(String(d.jpegData||''))){
      shots={after_save:{jpegData:d.jpegData,capturedAtMs:d.capturedAtMs,width:d.width,height:d.height,camera:d.camera||'D04'}};
    }
    var order=['first_item','payment','saving','after_save'];
    var labels={first_item:'1️⃣ أول كود',payment:'2️⃣ أثناء الدفع',saving:'3️⃣ أثناء الحفظ',after_save:'4️⃣ بعد الحفظ'};
    var valid=order.filter(function(k){return shots[k]&&/^data:image\/jpeg;base64,/.test(String(shots[k].jpegData||''));});
    if(!valid.length){alert('مفيش صورة صالحة محفوظة للفاتورة دي.');return;}
    var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);});};
    var cards=valid.map(function(k){var x=shots[k]||{};return '<button type="button" data-cctv-shot="'+k+'" style="text-align:right;border:1px solid #334155;background:#0f172a;color:#fff;border-radius:14px;padding:8px;cursor:pointer"><img src="'+x.jpegData+'" alt="'+esc(labels[k])+'" style="display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#000;border-radius:9px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:7px"><b style="font-size:12px">'+labels[k]+'</b><small style="color:#94a3b8">'+new Date(Number(x.capturedAtMs)||Date.now()).toLocaleTimeString('ar-EG')+'</small></div></button>';}).join('');
    var ov=document.createElement('div');ov.id='ofCctvShotOv';ov.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;padding:14px;overflow:auto;';
    ov.innerHTML='<div style="max-width:1050px;width:100%;background:#111827;border:1px solid #334155;border-radius:18px;padding:12px;color:white;box-shadow:0 18px 60px rgba(0,0,0,.45)"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px"><div><b>📸 لقطات الفاتورة '+esc(invoiceCode)+'</b><div style="font-size:11px;color:#94a3b8;margin-top:2px">D04 · '+valid.length+' لقطة محفوظة</div></div><button id="ofCctvShotClose" style="padding:8px 13px;border:0;border-radius:9px;cursor:pointer;font-weight:800">إغلاق</button></div><div id="ofCctvShotGrid" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px">'+cards+'</div><div id="ofCctvShotFocus" style="display:none;margin-top:10px"><button id="ofCctvShotBack" style="margin-bottom:8px;padding:7px 11px;border:0;border-radius:8px;cursor:pointer">← كل اللقطات</button><img id="ofCctvShotBig" alt="CCTV invoice snapshot" style="display:block;width:100%;max-height:72vh;object-fit:contain;background:#000;border-radius:12px"><div id="ofCctvShotMeta" style="font-size:11px;color:#9ca3af;margin-top:7px"></div></div></div>';
    document.body.appendChild(ov);
    var grid=ov.querySelector('#ofCctvShotGrid'),focus=ov.querySelector('#ofCctvShotFocus'),big=ov.querySelector('#ofCctvShotBig'),meta=ov.querySelector('#ofCctvShotMeta');
    ov.querySelectorAll('[data-cctv-shot]').forEach(function(btn){btn.onclick=function(){var k=btn.getAttribute('data-cctv-shot'),x=shots[k]||{};grid.style.display='none';focus.style.display='block';big.src=x.jpegData;meta.textContent=labels[k]+' · '+new Date(Number(x.capturedAtMs)||Date.now()).toLocaleString('ar-EG');};});
    ov.querySelector('#ofCctvShotBack').onclick=function(){focus.style.display='none';big.src='';grid.style.display='grid';};
    ov.onclick=function(e){if(e.target===ov)ov.remove();};ov.querySelector('#ofCctvShotClose').onclick=function(){ov.remove();};
  }catch(e){console.warn('invoice shots',e);alert('تعذر فتح لقطات الفاتورة');}
};

/* v424: video evidence viewer. Firestore contains metadata only; video stays at branch. */
window.ofCctvOpenEvent = async function(eventId){
  try{
    if(!eventId || typeof db==='undefined') return;
    var snap=await db.collection('pos_cctv_events').doc(String(eventId)).get();
    if(!snap.exists){ alert('مفيش فيديو محفوظ للحدث ده. الفيديوهات تبدأ من v424 بعد تشغيل Evidence Agent.'); return; }
    var d=snap.data()||{}, url=String(d.viewerUrl||'');
    if(!/^https:\/\/cctv-madinaty\.echarpe\.store\/echarpe-events\/view\?id=/.test(url)) throw new Error('bad_viewer_url');
    window.open(url,'_blank','noopener');
  }catch(e){ alert('تعذر فتح فيديو الحدث'); }
};
