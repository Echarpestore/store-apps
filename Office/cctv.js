/* ECHARPE Office CCTV v441
   POS Live stays pinned. Four stable camera slots remain user-selectable and persist locally. */
(function(){
  'use strict';
  var KEY='echarpe.office.cctv.v438';
  var OLD_KEY='echarpe.office.cctv.v437';
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
  var state={active:false,branch:'madinaty',slots:['4','5','7','8']};
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);});}
  function money(v){return Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' ج.م';}
  function b(){return BRANCHES.find(function(x){return x.id===state.branch;})||BRANCHES[0];}
  function cam(id){var x=b();return x.cameras.find(function(c){return c.id===String(id);})||x.cameras[0];}
  function streamUrl(c){return b().gateway+'/stream.html?src='+encodeURIComponent(c.stream);}
  function load(){
    try{
      var raw=localStorage.getItem(KEY)||localStorage.getItem(OLD_KEY)||'{}', x=JSON.parse(raw);
      if(BRANCHES.some(function(y){return y.id===x.branch;}))state.branch=x.branch;
      if(Array.isArray(x.slots)&&x.slots.length===4)state.slots=x.slots.map(function(v){return v==null?'off':String(v);});
    }catch(e){}
  }
  function save(){try{localStorage.setItem(KEY,JSON.stringify({branch:state.branch,slots:state.slots.slice(0,4)}));}catch(e){}}
  function liveDoc(){
    var docs=(window.ofLiveGetDocs&&window.ofLiveGetDocs())||[], x=b(), aliases=x.liveAliases||[];
    function norm(v){return String(v||'').trim().toLowerCase();}
    var hit=docs.find(function(d){var n=norm(d.branch||d.id);return aliases.some(function(a){return n.indexOf(norm(a))>=0;});});
    return hit||docs.slice().sort(function(a,c){return Number(c.updatedAtMs||0)-Number(a.updatedAtMs||0);})[0]||null;
  }
  function isOnline(d){return !!d && Math.max(0,Date.now()-Number(d.updatedAtMs||0))<7*60*1000;}
  function payLabel(q){
    var nm=q.method==='visa'?'💳 Visa '+(q.seq||''):q.method==='cash'?'💵 كاش':q.method==='instapay'?'📱 Instapay':esc(q.method||'دفع');
    var st=q.status==='approved'?' ✅':q.status==='pending'?' ⏳':q.status==='failed'?' ❌':'';
    return '<span class="of-cctv-pos-chip">'+nm+st+' <b>'+money(q.amount)+'</b></span>';
  }
  function saleItemsHtml(items){
    return (items||[]).map(function(x){
      var q=Math.abs(Number(x.qty||0)), line=Math.abs(Number(x.price||0)*q);
      return '<div class="of-cctv-pos-row"><span><b>'+esc(x.name||x.code||'صنف')+'</b>'+(x.isReturn?' <em>↩ مرتجع</em>':'')+'<small>'+q+' × '+money(x.price)+(x.code?' · '+esc(x.code):'')+'</small></span><strong>'+money(line)+'</strong></div>';
    }).join('');
  }
  function salePaymentHtml(p){
    return Object.keys(p||{}).filter(function(k){return Math.abs(Number(p[k]||0))>.001;}).map(function(k){
      var nm=k==='visa'?'💳 Visa':k==='cash'?'💵 كاش':k==='instapay'?'📱 Instapay':esc(k);
      return '<span class="of-cctv-pos-chip">'+nm+' <b>'+money(p[k])+'</b></span>';
    }).join('');
  }
  function lastPaymentText(last){
    var p=(last&&last.payments)||{};
    var parts=Object.keys(p).filter(function(k){return Math.abs(Number(p[k]||0))>.001;}).map(function(k){
      var nm=k==='visa'?'Visa':k==='cash'?'كاش':k==='instapay'?'Instapay':String(k||'دفع');
      return nm+' '+money(p[k]);
    });
    return parts.join(' + ')||'—';
  }
  function posLiveHtml(d){
    if(!d)return '<div class="of-cctv-empty"><div><b>POS Live غير متصل</b><small>مفيش حالة Live وصلت من جهاز الفرع حتى الآن</small></div></div>';
    var currentRows=(d.cart||[]), last=d.lastSale||null, age=Math.max(0,Date.now()-Number(d.updatedAtMs||0));
    var rows=currentRows.map(function(x){return '<div class="of-cctv-pos-row"><span><b>'+esc(x.name||x.code||'صنف')+'</b>'+(x.isReturn?' <em>↩ مرتجع</em>':'')+'<small>× '+Number(x.qty||0)+(x.barcode?' · '+esc(x.barcode):'')+'</small></span><strong>'+money(Number(x.price||0)*Number(x.qty||0))+'</strong></div>';}).join('');
    var lastLine='';
    if(last){
      var inv=last.invoiceNo?'#'+esc(last.invoiceNo):esc(last.invoiceCode||'—');
      lastLine='<div class="of-cctv-lastline"><span><b>آخر فاتورة: '+inv+'</b></span><span>'+esc(lastPaymentText(last))+'</span></div>';
    }else{
      lastLine='<div class="of-cctv-lastline muted"><span><b>آخر فاتورة: —</b></span><span>—</span></div>';
    }
    return '<div class="of-cctv-pos">'+
      '<div class="of-cctv-pos-top"><div><b>🛒 السلة Live</b><small>'+esc(d.employee||'بدون موظف')+' · '+esc(d.branch||'')+'</small></div><span class="of-cctv-pos-live '+(isOnline(d)?'online':'offline')+'">● '+(isOnline(d)?'LIVE':'OFFLINE')+'</span></div>'+
      '<div class="of-cctv-pos-scroll">'+(rows||'<div class="of-cctv-cart-empty">في انتظار أول صنف…</div>')+'</div>'+
      '<div class="of-cctv-pos-total"><b>إجمالي السلة</b><strong>'+money(d.total)+'</strong></div>'+
      lastLine+
      '<div class="of-cctv-age">آخر تحديث منذ '+Math.round(age/1000)+' ثانية</div></div>';
  }
  function stopPanel(panel){panel.querySelectorAll('iframe').forEach(function(f){try{f.src='about:blank';f.remove();}catch(e){}});}
  function renderLive(){
    var body=document.getElementById('ofCctvPinnedLiveBody');
    if(body)body.innerHTML=posLiveHtml(liveDoc());
  }
  function cameraOptions(selected){
    return '<option value="off"'+(selected==='off'?' selected':'')+'>إيقاف الكاميرا</option>'+b().cameras.map(function(c){return '<option value="'+esc(c.id)+'"'+(String(c.id)===String(selected)?' selected':'')+'>'+esc(c.name)+' · '+esc(c.label)+'</option>';}).join('');
  }
  function cameraCard(selected,i){
    var c=selected==='off'?null:cam(selected);
    return '<article class="of-cctv-panel of-cctv-camera-panel'+(c?'':' of-cctv-camera-off')+'" data-camera="'+esc(c?c.id:'off')+'" data-panel="'+i+'">'+
      '<div class="of-cctv-panel-head"><select class="of-cctv-camera-select" data-cctv-select="'+i+'" aria-label="اختيار كاميرا المربع '+(i+1)+'">'+cameraOptions(c?c.id:'off')+'</select><button type="button" class="of-cctv-panel-full" data-cctv-full="'+i+'" title="ملء الشاشة" aria-label="ملء الشاشة"'+(c?'':' disabled')+'>⛶</button></div>'+
      (c?'<div class="of-cctv-panel-body of-cctv-video"><iframe title="'+esc(c.name)+'" allow="autoplay; fullscreen" referrerpolicy="no-referrer" src="'+esc(streamUrl(c))+'"></iframe><div class="of-cctv-cam-badge"><span class="dot"></span>'+esc(c.name)+' · '+esc(c.label)+'</div></div>':'<div class="of-cctv-panel-body of-cctv-video of-cctv-off-body"><div><b>الكاميرا متوقفة</b><small>اختار كاميرا من القائمة فوق</small></div></div>')+'</article>';
  }
  function renderBranches(){var el=document.getElementById('ofCctvBranches');if(!el)return;el.innerHTML=BRANCHES.map(function(x){return '<button class="of-cctv-chip '+(x.id===state.branch?'active':'')+'" data-cctv-branch="'+esc(x.id)+'">🏬 '+esc(x.name)+'</button>';}).join('');el.querySelectorAll('[data-cctv-branch]').forEach(function(btn){btn.onclick=function(){if(btn.dataset.cctvBranch===state.branch)return;state.branch=btn.dataset.cctvBranch;save();render();};});}
  function fsEl(){return document.fullscreenElement||document.webkitFullscreenElement||document.msFullscreenElement||null;}
  function enterNativeFs(el){var fn=el&&(el.requestFullscreen||el.webkitRequestFullscreen||el.msRequestFullscreen);if(!fn)return;try{var r=fn.call(el);if(r&&r.catch)r.catch(function(){});}catch(e){}}
  function exitNativeFs(){var fn=document.exitFullscreen||document.webkitExitFullscreen||document.msExitFullscreen;if(!fn||!fsEl())return;try{var r=fn.call(document);if(r&&r.catch)r.catch(function(){});}catch(e){}}
  function clearFocusClasses(){
    document.body.classList.remove('of-cctv-lock');
    var room=document.querySelector('.of-cctv-controlroom');if(room)room.classList.remove('of-cctv-room-focus');
    document.querySelectorAll('.of-cctv-panel-focus').forEach(function(p){p.classList.remove('of-cctv-panel-focus');});
    var roomBtn=document.getElementById('ofCctvRoomFullscreen');if(roomBtn)roomBtn.textContent='⛶ ملء الشاشة';
    document.querySelectorAll('[data-cctv-full]').forEach(function(btn){btn.textContent='⛶';btn.title='ملء الشاشة';});
  }
  function toggleRoomFocus(){
    var room=document.querySelector('.of-cctv-controlroom');if(!room)return;
    var on=room.classList.contains('of-cctv-room-focus');clearFocusClasses();
    if(on){exitNativeFs();return;}
    room.classList.add('of-cctv-room-focus');document.body.classList.add('of-cctv-lock');
    var btn=document.getElementById('ofCctvRoomFullscreen');if(btn)btn.textContent='✕ خروج';
    enterNativeFs(room);
  }
  function togglePanelFocus(panel,btn){
    if(!panel)return;var on=panel.classList.contains('of-cctv-panel-focus');clearFocusClasses();
    if(on){exitNativeFs();return;}
    panel.classList.add('of-cctv-panel-focus');document.body.classList.add('of-cctv-lock');
    if(btn){btn.textContent='✕';btn.title='خروج من ملء الشاشة';}enterNativeFs(panel);
  }
  function renderCameras(){
    var grid=document.getElementById('ofCctvCameraGrid');if(!grid)return;
    grid.querySelectorAll('.of-cctv-panel').forEach(stopPanel);
    grid.innerHTML=state.slots.map(cameraCard).join('');
    grid.querySelectorAll('[data-cctv-select]').forEach(function(sel){sel.onchange=function(){var i=Number(sel.dataset.cctvSelect);state.slots[i]=sel.value;save();renderCameras();};});
    grid.querySelectorAll('[data-cctv-full]').forEach(function(btn){btn.onclick=function(){togglePanelFocus(grid.querySelector('.of-cctv-panel[data-panel="'+btn.dataset.cctvFull+'"]'),btn);};});
  }
  function render(){
    if(!state.active)return;renderBranches();
    var live=document.getElementById('ofCctvPinnedLive');if(live)live.setAttribute('data-branch',state.branch);
    renderLive();
    renderCameras();
  }
  function refreshPosOnly(){if(state.active)renderLive();}
  function stop(){state.active=false;clearFocusClasses();exitNativeFs();var grid=document.getElementById('ofCctvCameraGrid');if(grid){grid.querySelectorAll('.of-cctv-panel').forEach(stopPanel);grid.innerHTML='';}}
  function start(){state.active=true;render();}
  function dayBounds(v){
    var a=String(v||'').split('-').map(Number); if(a.length!==3||!a[0])return null;
    var start=new Date(a[0],a[1]-1,a[2],0,0,0,0), end=new Date(a[0],a[1]-1,a[2]+1,0,0,0,0);
    return {start:start.getTime(),end:end.getTime()};
  }
  function saleMs(x){return Number(x.createdAtMs||x.atMs||(x.createdAt&&x.createdAt.toMillis&&x.createdAt.toMillis())||0);}
  function renderDayRows(rows){
    var box=document.getElementById('ofCctvDayRows'); if(!box)return;
    rows.sort(function(a,c){return saleMs(c)-saleMs(a);});
    if(!rows.length){box.innerHTML='<div class="of-cctv-day-empty">مفيش فواتير في اليوم ده للفرع المختار.</div>';return;}
    box.innerHTML=rows.map(function(x){
      var pm=Object.keys(x.payments||{}).filter(function(k){return Math.abs(Number(x.payments[k]||0))>.001;}).map(function(k){return (k==='visa'?'Visa':k==='cash'?'كاش':k==='instapay'?'Instapay':esc(k))+' '+money(x.payments[k]);}).join(' · ');
      var cust=x.customerName||x.customerPhone?('👤 '+esc(x.customerName||'عميل')+(x.customerPhone?' · '+esc(x.customerPhone):'')):'👤 بدون عميل';
      return '<div class="of-cctv-day-row"><div class="of-cctv-day-time">'+new Date(saleMs(x)).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})+'</div><div class="of-cctv-day-main"><b>فاتورة '+esc(x.invoiceNo||x.invoiceCode||x.id||'')+' · '+money(x.total)+'</b><small>'+cust+' · '+esc(x.employeeName||x.employee||'')+'</small><small>💳 '+(pm||'—')+' · '+Number(x.itemCount||(x.items||[]).length)+' صنف</small></div><div class="of-cctv-day-actions"><button type="button" onclick="ofCctvInvoiceShot(\''+esc(String(x.invoiceCode||''))+'\')">📸 اللقطات</button>'+(x.id&&window.ofOpenSaleDetails?'<button type="button" data-open-sale="'+esc(x.id)+'">🧾 التفاصيل</button>':'')+'</div></div>';
    }).join('');
    box.querySelectorAll('[data-open-sale]').forEach(function(btn){btn.onclick=function(){try{window.ofOpenSaleDetails(btn.getAttribute('data-open-sale'));}catch(e){}};});
  }
  async function loadDayReview(){
    var inp=document.getElementById('ofCctvDayDate'), btn=document.getElementById('ofCctvDayLoad'), box=document.getElementById('ofCctvDayRows');
    if(!inp||!box)return; var r=dayBounds(inp.value); if(!r)return;
    if(btn){btn.disabled=true;btn.textContent='جاري التحميل…';} box.innerHTML='<div class="of-cctv-day-empty">جاري تحميل اليوم…</div>';
    try{
      var cached=(window.ofCctvGetCachedSales&&window.ofCctvGetCachedSales())||[];
      var aliases=(b().liveAliases||[]).map(function(v){return String(v).toLowerCase();});
      var rows=cached.filter(function(x){var t=saleMs(x),br=String(x.branch||'').toLowerCase();return t>=r.start&&t<r.end&&aliases.some(function(a){return br.indexOf(a)>=0;});});
      if(!rows.length && typeof db!=='undefined'){
        var q=db.collection('pos_test_sales').where('createdAtMs','>=',r.start).where('createdAtMs','<',r.end);
        var snap=await q.get(); rows=[]; snap.forEach(function(d){var x=Object.assign({id:d.id},d.data()||{}),br=String(x.branch||'').toLowerCase();if(aliases.some(function(a){return br.indexOf(a)>=0;}))rows.push(x);});
      }
      renderDayRows(rows);
    }catch(e){box.innerHTML='<div class="of-cctv-day-empty">تعذر تحميل مراجعة اليوم: '+esc(e&&e.message||e)+'</div>';}
    finally{if(btn){btn.disabled=false;btn.textContent='تحميل اليوم';}}
  }
  function init(){
    load();
    var di=document.getElementById('ofCctvDayDate'); if(di&&!di.value){var nd=new Date();di.value=nd.getFullYear()+'-'+String(nd.getMonth()+1).padStart(2,'0')+'-'+String(nd.getDate()).padStart(2,'0');}
    var dl=document.getElementById('ofCctvDayLoad'); if(dl)dl.onclick=loadDayReview;
    var roomFs=document.getElementById('ofCctvRoomFullscreen');if(roomFs)roomFs.onclick=toggleRoomFocus;
    ['fullscreenchange','webkitfullscreenchange','MSFullscreenChange'].forEach(function(ev){document.addEventListener(ev,function(){if(!fsEl()&&!document.querySelector('.of-cctv-room-focus')&&!document.querySelector('.of-cctv-panel-focus'))clearFocusClasses();});});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&(document.querySelector('.of-cctv-room-focus')||document.querySelector('.of-cctv-panel-focus'))){clearFocusClasses();exitNativeFs();}});
    window.addEventListener('office-pos-live-update',refreshPosOnly);window.addEventListener('beforeunload',stop);
  }
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
