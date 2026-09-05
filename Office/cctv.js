/* ECHARPE Office CCTV v525
   Fixed camera wall: every branch camera keeps a permanent card; Live starts only when its own switch is turned on. */
(function(){
  'use strict';
  var KEY='echarpe.office.cctv.v478';
  var OLD_KEY='echarpe.office.cctv.v438';
  var FALLBACK_BRANCHES=[{
    id:'madinaty', name:'مدينتي', gateway:'https://cctv-madinaty.echarpe.store',
    liveAliases:['madinaty','مدينتي'], playback:true, playbackCamera:'4',
    cameras:[
      {id:'4',name:'D04',label:'الكاشير',stream:'camera4'},
      {id:'5',name:'D05',label:'كاميرا 5',stream:'camera5'},
      {id:'7',name:'D07',label:'كاميرا 7',stream:'camera7'},
      {id:'8',name:'D08',label:'كاميرا 8',stream:'camera8'}
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
    liveAliases:['rehab','الرحاب'],
    cameras:[
      {id:'1',name:'CAM1',label:'الكاشير',stream:'rehab_cam1_h264'}
    ]
  }];
  /* Production profiles are locked here too. Office must remain correct even
     during a mixed deployment where an older cctv-config.js is still cached. */
  var BRANCHES=FALLBACK_BRANCHES.map(function(x){
    return {id:x.id,name:x.name,gateway:x.gateway,liveAliases:x.aliases||x.liveAliases||[x.id,x.name],playback:!!x.playback,playbackCamera:String(x.cashierCamera||x.playbackCamera||'1'),cameras:x.cameras||[]};
  });
  var state={active:false,branch:'madinaty',layout:4,slots:['off','off','off','off']};
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);});}
  function money(v){return Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' ج.م';}
  function b(){return BRANCHES.find(function(x){return x.id===state.branch;})||BRANCHES[0];}
  function cam(id){var x=b();return x.cameras.find(function(c){return c.id===String(id);})||x.cameras[0];}
  function streamUrl(c){return b().gateway+'/stream.html?src='+encodeURIComponent(c.stream)+'&mode=mse&background=false';}
  function frameUrl(c){return b().gateway+'/api/frame.jpeg?src='+encodeURIComponent(c.stream)+'&_=';}
  function profileFor(branch){
    var n=String(branch||'').trim().toLowerCase();
    return BRANCHES.find(function(p){return p.id===n||(p.liveAliases||[]).some(function(a){var q=String(a||'').toLowerCase();return q&&(n===q||n.indexOf(q)>=0);});})||null;
  }
  function fetchJsonRetry(url,branchId,tries){
    var left=Math.max(1,Number(tries)||1),opt={cache:'no-store',credentials:branchId==='glow'?'include':'omit'};
    function run(){return fetch(url,opt).then(function(r){if(!r.ok)throw new Error('cctv_http_'+r.status);return r.json();}).catch(function(e){if(--left<=0)throw e;return new Promise(function(resolve){setTimeout(resolve,1200);}).then(run);});}
    return run();
  }
  function cartRows(rows){
    return (Array.isArray(rows)?rows:[]).map(function(r){return Array.isArray(r)?r:[r&&r['0'],r&&r['1'],r&&r['2'],r&&r['3']];});
  }
  /* Invoice review is installed after this closure. Export only the two
     audited helpers it needs instead of relying on inaccessible local names. */
  window.ofCctvProfileFor=profileFor;
  window.ofCctvCartRows=cartRows;
  function load(){
    try{
      var fresh=localStorage.getItem(KEY), raw=fresh||localStorage.getItem(OLD_KEY)||'{}', x=JSON.parse(raw);
      if(BRANCHES.some(function(y){return y.id===x.branch;}))state.branch=x.branch;
      state.layout=4; // v503 fixed wall; old saved layout ignored
    }catch(e){}
    // v500: never restore camera streams. Every room entry starts with zero live video traffic.
    state.slots=['off','off','off','off'];
    state.layout=4;
  }
  function save(){try{localStorage.setItem(KEY,JSON.stringify({branch:state.branch}));}catch(e){}}
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
    // v446: آخر فاتورة فقط. لا نعرض مبالغ طرق الدفع هنا حتى لا تختلط
    // بإجماليات اليوم. ولو بيانات Live القديمة لا تطابق إجمالي الفاتورة،
    // لا نخمن طريقة دفع خاطئة.
    var p=(last&&last.payments)||{}, total=Math.abs(Number(last&&last.total||0));
    var keys=Object.keys(p).filter(function(k){return Math.abs(Number(p[k]||0))>.001;});
    var paid=keys.reduce(function(n,k){return n+Math.abs(Number(p[k]||0));},0);
    if(total>0.001 && Math.abs(paid-total)>0.02) return 'طريقة الدفع غير متاحة';
    var parts=keys.map(function(k){return k==='visa'?'Visa':k==='cash'?'كاش':k==='instapay'?'Instapay':String(k||'دفع');});
    return parts.join(' + ')||'—';
  }
  function posLiveHtml(d){
    if(!d)return '<div class="of-cctv-empty"><div><b>POS Live غير متصل</b><small>مفيش حالة Live وصلت من جهاز الفرع حتى الآن</small></div></div>';
    var currentRows=Array.isArray(d.cart)?d.cart:[], last=d.lastSale||null, age=Math.max(0,Date.now()-Number(d.updatedAtMs||0));
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
  function stopPanel(panel){panel.querySelectorAll('video').forEach(function(v){try{if(v._retryTimer)clearTimeout(v._retryTimer);v.pause();v.removeAttribute('src');v.load();v.remove();}catch(e){}});panel.querySelectorAll('iframe[data-stream-src]').forEach(function(f){try{f.src='about:blank';f.remove();}catch(e){}});panel.querySelectorAll('img[data-live-frame]').forEach(function(img){try{if(img._frameTimer)clearTimeout(img._frameTimer);img.onload=null;img.onerror=null;img.removeAttribute('src');}catch(e){}});}
  function armSnapshotFrame(img){
    if(!img)return;var base=img.getAttribute('data-live-frame'),delay=900;
    function next(ms){if(img._frameTimer)clearTimeout(img._frameTimer);img._frameTimer=setTimeout(load,ms);}
    function load(){if(!state.active||document.hidden||!document.documentElement.contains(img))return;img.onload=function(){img.classList.add('is-ready');next(delay);};img.onerror=function(){img.classList.remove('is-ready');next(2500);};img.src=base+Date.now();}
    load();
  }
  function armCameraPlayer(v){
    if(!v)return;
    function retry(){
      if(!state.active||!document.documentElement.contains(v))return;
      if(v._retryTimer)clearTimeout(v._retryTimer);
      v._retryTimer=setTimeout(function(){
        if(!state.active||!document.documentElement.contains(v))return;
        var src=v.getAttribute('data-stream-src');
        try{v.pause();v.src=src;v.load();var r=v.play();if(r&&r.catch)r.catch(function(){});}catch(e){}
      },2500);
    }
    ['error','stalled','abort'].forEach(function(ev){v.addEventListener(ev,retry);});
    ['loadeddata','playing'].forEach(function(ev){v.addEventListener(ev,function(){if(v._retryTimer){clearTimeout(v._retryTimer);v._retryTimer=null;}});});
    try{var r=v.play();if(r&&r.catch)r.catch(function(){});}catch(e){}
  }
  function renderLive(){
    var body=document.getElementById('ofCctvPinnedLiveBody');
    if(body)body.innerHTML=posLiveHtml(liveDoc());
  }
  function cameraCard(c,i){
    var on=String(state.slots[i]||'off')===String(c.id);
    var toggleLabel=on?'إيقاف':'تشغيل';
    /* v524: restore the original go2rtc MSE live player. Snapshot polling
       caused visible zoom/cropping and refreshed too slowly on mobile. */
    var liveMedia='<iframe title="'+esc(c.name)+'" data-stream-src="'+esc(streamUrl(c))+'" src="'+esc(streamUrl(c))+'" allow="autoplay; fullscreen" allowfullscreen loading="eager"></iframe>';
    return '<article class="of-cctv-panel of-cctv-camera-panel '+(on?'is-live':'is-off')+'" data-camera="'+esc(c.id)+'" data-panel="'+i+'">'+
      '<div class="of-cctv-panel-head"><div class="of-cctv-camera-name"><b>'+esc(c.name)+'</b><small>'+esc(c.label)+'</small></div><div class="of-cctv-camera-actions"><button type="button" class="of-cctv-cam-toggle '+(on?'on':'off')+'" data-cctv-toggle="'+i+'" aria-pressed="'+(on?'true':'false')+'" aria-label="'+toggleLabel+' '+esc(c.name)+'"><span class="of-cctv-switch-track"><span class="of-cctv-switch-knob"></span></span><span class="of-cctv-switch-text">'+toggleLabel+'</span></button><button type="button" class="of-cctv-panel-full" data-cctv-full="'+i+'" title="ملء الشاشة" aria-label="ملء الشاشة"'+(on?'':' disabled')+'>⛶</button></div></div>'+
      (on?'<div class="of-cctv-panel-body of-cctv-video">'+liveMedia+'<div class="of-cctv-cam-badge"><span class="dot"></span>'+esc(c.name)+' · '+esc(c.label)+'</div></div>':'<div class="of-cctv-panel-body of-cctv-video of-cctv-off-body"><div class="of-cctv-off-camera"><span>📹</span><b>'+esc(c.name)+'</b><small>'+esc(c.label)+' · متوقفة</small><em>اضغط تشغيل للمشاهدة</em></div></div>')+'</article>';
  }
  function playbackUrl(atMs,durationMin,cameraId,offsetMs,quality){
    var x=b();if(!x.playback)return '';
    var t=Math.max(1,Number(atMs)||Date.now()),d=Math.min(60,Math.max(1,Number(durationMin)||30));
    var cid=String(cameraId||x.playbackCamera||'1');if(!x.cameras.some(function(c){return String(c.id)===cid;}))cid=String(x.playbackCamera||x.cameras[0].id||'1');
    var q=Number(quality)===720?720:480;
    var u=x.gateway+'/echarpe-playback/video?camera='+encodeURIComponent(cid)+'&atMs='+encodeURIComponent(t)+'&durationSec='+encodeURIComponent(d*60)+'&quality='+q+(q===480?'&mode=fast':'');
    if(offsetMs!==undefined&&offsetMs!==null)u+='&offsetMs='+encodeURIComponent(Number(offsetMs)||0);
    return u;
  }
  function closePlaybackModal(){
    var ov=document.getElementById('ofCctvPlaybackOv');if(!ov)return;
    var fr=ov.querySelector('iframe');if(fr)fr.src='about:blank';var v=ov.querySelector('video');if(v){try{if(v._retryTimer)clearTimeout(v._retryTimer);v.pause();v.removeAttribute('src');v.load();}catch(e){}}
    ov.remove();
  }
  function openPlayback(atMs,durationMin,cameraId,offsetMs){
    var u=playbackUrl(atMs,durationMin,cameraId,offsetMs);if(!u){alert('مراجعة تسجيلات الـNVR لسه مش متاحة للفرع ده.');return;}
    closePlaybackModal();
    var ov=document.createElement('div');ov.id='ofCctvPlaybackOv';ov.className='of-cctv-playback-ov';
    ov.innerHTML='<div class="of-cctv-playback-modal"><div class="of-cctv-playback-head"><b>🎞️ مراجعة التسجيل</b><div><select data-pb-quality aria-label="جودة التسجيل"><option value="480" selected>480p سريع</option><option value="720">720p</option></select><a class="of-cctv-playback-external" href="'+esc(u)+'" target="_blank" rel="noopener">فتح منفصل ↗</a><button type="button" class="of-cctv-playback-close" aria-label="إغلاق">✕</button></div></div><video controls autoplay muted playsinline src="'+esc(u)+'"></video><div data-pb-status style="display:none;padding:8px;background:#451a03;color:#fde68a;text-align:center;font-size:12px">إعادة الاتصال بالتسجيل…</div><div style="display:flex;gap:8px;align-items:center;justify-content:center;padding:9px;background:#111827;color:#fff"><button type="button" data-pb-prev class="of-cctv-playback-close">⏮ السابق</button><b data-pb-clock></b><button type="button" data-pb-next class="of-cctv-playback-close">التالي ⏭</button></div></div>';
    document.body.appendChild(ov);
    var start=Number(atMs)||Date.now(),step=(Number(durationMin)||30)*60000,video=ov.querySelector('video'),clock=ov.querySelector('[data-pb-clock]'),ext=ov.querySelector('.of-cctv-playback-external'),quality=ov.querySelector('[data-pb-quality]'),pbStatus=ov.querySelector('[data-pb-status]'),pbRetry=0;
    function loadAt(next,resumeSec,isRetry){if(!isRetry)pbRetry=0;start=Math.max(1,next);var nextUrl=playbackUrl(start,durationMin,cameraId,offsetMs,quality.value);clock.textContent=new Date(start).toLocaleString('ar-EG');ext.href=nextUrl;pbStatus.style.display=pbRetry?'block':'none';video.src=nextUrl+'&retry='+Date.now();video.load();if(resumeSec>0)video.addEventListener('loadedmetadata',function seek(){video.removeEventListener('loadedmetadata',seek);video.currentTime=Math.min(resumeSec,Math.max(0,(video.duration||resumeSec)-.25));video.play().catch(function(){});},{once:true});else video.play().catch(function(){});}
    video.addEventListener('loadeddata',function(){pbRetry=0;pbStatus.style.display='none';});video.addEventListener('playing',function(){pbRetry=0;pbStatus.style.display='none';});video.addEventListener('error',function(){if(pbRetry<3&&document.documentElement.contains(ov)){pbRetry++;pbStatus.style.display='block';pbStatus.textContent='إعادة الاتصال بالتسجيل تلقائيًا ('+pbRetry+'/3)…';if(video._retryTimer)clearTimeout(video._retryTimer);video._retryTimer=setTimeout(function(){loadAt(start,0,true);},2500);return;}pbStatus.style.display='block';pbStatus.textContent='التسجيل غير متاح في هذا التوقيت.';});
    quality.onchange=function(){loadAt(start,Number(video.currentTime)||0);};
    ov.querySelector('[data-pb-prev]').onclick=function(){loadAt(start-step);};ov.querySelector('[data-pb-next]').onclick=function(){loadAt(start+step);};loadAt(start);
    ov.querySelector('.of-cctv-playback-close').onclick=closePlaybackModal;
    ov.onclick=function(e){if(e.target===ov)closePlaybackModal();};
  }
  function syncPlaybackPanel(){
    var panel=document.getElementById('ofCctvNvrReview');if(!panel)return;
    panel.style.display=b().playback?'block':'none';
    var hint=document.getElementById('ofCctvNvrHint');if(hint)hint.textContent=b().playback?(b().id==='madinaty'?'تسجيل كمبيوتر الفرع — اختار اليوم والوقت، والتوقيت مستقل عن ساعة الـDVR.':'تسجيلات Hikvision الأصلية من هارد الـNVR — اختار الكاميرا واليوم والوقت.'):'';
    var cs=document.getElementById('ofCctvNvrCamera');if(cs){var old=String(cs.value||b().playbackCamera||'1');cs.innerHTML=b().cameras.map(function(c){return '<option value="'+esc(c.id)+'">'+esc(c.name)+' · '+esc(c.label)+'</option>';}).join('');if(b().cameras.some(function(c){return String(c.id)===old;}))cs.value=old;else cs.value=String(b().playbackCamera||b().cameras[0].id||'1');}
  }
  function openPlaybackFromControls(){
    var di=document.getElementById('ofCctvNvrDate'),ti=document.getElementById('ofCctvNvrTime'),du=document.getElementById('ofCctvNvrDuration'),ca=document.getElementById('ofCctvNvrCamera');
    if(!di||!ti||!di.value||!ti.value)return;
    var a=di.value.split('-').map(Number),q=ti.value.split(':').map(Number),dt=new Date(a[0],a[1]-1,a[2],q[0]||0,q[1]||0,0,0);
    // Preserve the deployed clock path until a requested/recorded timestamp
    // pair establishes the NVR's archive time interpretation.
    openPlayback(dt.getTime(),Number(du&&du.value)||30,String(ca&&ca.value||b().playbackCamera||'1'));
  }
  function resetLiveSlots(){state.slots=['off','off','off','off'];}
  function activeCameraCount(){return b().cameras.reduce(function(n,c,i){return n+(String(state.slots[i])===String(c.id)?1:0);},0);}
  function renderLiveStatus(){var el=document.getElementById('ofCctvStatus');if(!el)return;var n=activeCameraCount();el.textContent=n?'● '+n+' LIVE':'● متوقف';el.classList.toggle('idle',!n);}
  function setAllCameras(on){
    var cams=b().cameras;
    for(var i=0;i<4;i++)state.slots[i]=(on&&cams[i])?String(cams[i].id):'off';
    renderCameras();renderLiveStatus();
  }
  function renderLayouts(){
    var startAll=document.getElementById('ofCctvStartAll');if(startAll)startAll.onclick=function(){setAllCameras(true);};
    var stop=document.getElementById('ofCctvStopAll');if(stop)stop.onclick=function(){setAllCameras(false);};
  }
  function renderBranches(){var el=document.getElementById('ofCctvBranches');if(!el)return;el.innerHTML=BRANCHES.map(function(x){return '<button class="of-cctv-chip '+(x.id===state.branch?'active':'')+'" data-cctv-branch="'+esc(x.id)+'">🏬 '+esc(x.name)+'</button>';}).join('');el.querySelectorAll('[data-cctv-branch]').forEach(function(btn){btn.onclick=function(){if(btn.dataset.cctvBranch===state.branch)return;state.branch=btn.dataset.cctvBranch;resetLiveSlots();save();render();};});syncPlaybackPanel();}
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
    grid.classList.remove('of-cctv-camera-grid-1','of-cctv-camera-grid-2','of-cctv-camera-grid-4');
    grid.classList.add('of-cctv-camera-grid-'+Math.min(4,Math.max(1,b().cameras.length)));
    grid.innerHTML=b().cameras.map(cameraCard).join('');
    grid.querySelectorAll('[data-cctv-toggle]').forEach(function(btn){btn.onclick=function(){
      var i=Number(btn.dataset.cctvToggle),c=b().cameras[i];if(!c)return;
      state.slots[i]=String(state.slots[i])===String(c.id)?'off':String(c.id);
      renderCameras();renderLiveStatus();
    };});
    grid.querySelectorAll('[data-cctv-full]').forEach(function(btn){btn.onclick=function(){togglePanelFocus(grid.querySelector('.of-cctv-panel[data-panel="'+btn.dataset.cctvFull+'"]'),btn);};});
    grid.querySelectorAll('video[data-stream-src]').forEach(armCameraPlayer);
    renderLiveStatus();
  }
  function render(){
    if(!state.active)return;
    try{renderBranches();renderLayouts();}catch(e){console.warn('cctv branches',e);}
    var live=document.getElementById('ofCctvPinnedLive');if(live)live.setAttribute('data-branch',state.branch);
    try{renderLive();}catch(e){console.warn('cctv pos live',e);var body=document.getElementById('ofCctvPinnedLiveBody');if(body)body.innerHTML='<div class=\"of-cctv-empty\"><div><b>POS Live غير متاح مؤقتًا</b><small>الكاميرات مستمرة بشكل مستقل</small></div></div>';}
    try{renderCameras();}catch(e){console.warn('cctv cameras',e);var grid=document.getElementById('ofCctvCameraGrid');if(grid)grid.innerHTML='<div class=\"of-cctv-day-empty\">تعذر رسم الكاميرات: '+esc(e&&e.message||e)+'</div>';}
    try{loadActivityAlerts();}catch(e){console.warn('cctv activity alerts',e);}
  }
  var _liveRaf=0;
  function refreshPosOnly(){
    if(!state.active||document.hidden)return;
    if(_liveRaf)return;
    _liveRaf=requestAnimationFrame(function(){_liveRaf=0;if(state.active&&!document.hidden)renderLive();});
  }
  function stop(){state.active=false;if(_liveRaf){cancelAnimationFrame(_liveRaf);_liveRaf=0;}clearFocusClasses();exitNativeFs();var grid=document.getElementById('ofCctvCameraGrid');if(grid){grid.querySelectorAll('.of-cctv-panel').forEach(stopPanel);grid.innerHTML='';}}
  function start(){state.active=true;resetLiveSlots();render();}
  function dayBounds(v){
    var a=String(v||'').split('-').map(Number); if(a.length!==3||!a[0])return null;
    var start=new Date(a[0],a[1]-1,a[2],0,0,0,0), end=new Date(a[0],a[1]-1,a[2]+1,0,0,0,0);
    return {start:start.getTime(),end:end.getTime()};
  }
  function saleMs(x){return Number(x.createdAtMs||x.atMs||(x.createdAt&&x.createdAt.toMillis&&x.createdAt.toMillis())||0);}
  var dayReviewBounds=null,dayReviewRows=[];
  async function openDayBasketPlayback(){
    var dayInput=document.getElementById('ofCctvDayDate'),timeInput=document.getElementById('ofCctvDayTime'),currentBounds=dayBounds(dayInput&&dayInput.value);
    if(currentBounds)dayReviewBounds=currentBounds;
    if(!dayReviewBounds||typeof db==='undefined')return;
    var x=b(),gateway=String(x.gateway||'').replace(/\/$/,''),aliases=(x.liveAliases||[]).map(function(v){return String(v).toLowerCase();});
    var range=null,timelineDocs=[];
    try{
      var pair=await Promise.all([
        fetchJsonRetry(gateway+'/echarpe-playback/range?camera='+encodeURIComponent(x.playbackCamera||'4')+'&_='+Date.now(),x.id,3),
        db.collection('pos_cctv_invoice_timelines').where('endedAtMs','>=',dayReviewBounds.start).where('endedAtMs','<',dayReviewBounds.end).get()
      ]);
      range=pair[0];pair[1].forEach(function(s){var d=s.data()||{},br=String(d.branch||'').toLowerCase();if(aliases.some(function(a){return br.indexOf(a)>=0;}))timelineDocs.push(d);});
    }catch(e){alert('تعذر تجهيز مراجعة اليوم: '+(e&&e.message||e));return;}
    var rangeStart=Number(range.startMs)||0,rangeEnd=Number(range.endMs)||0,coverageStart=Math.max(dayReviewBounds.start,rangeStart),coverageEnd=Math.min(dayReviewBounds.end,rangeEnd);
    if(!coverageStart||coverageEnd-coverageStart<30000){alert('مفيش تسجيل محفوظ في التاريخ المختار. التسجيل المتاح يبدأ '+(rangeStart?new Date(rangeStart).toLocaleString('ar-EG'):'—')+'.');return;}
    var events=[];timelineDocs.forEach(function(t){var catalog=t.catalog||{},code=t.invoiceCode||'';(t.events||[]).forEach(function(e){events.push(Object.assign({},e,{catalog:catalog,invoiceCode:code}));});events.push({atMs:Number(t.endedAtMs||0)+1,kind:'cart_cleared',cart:[],total:0,catalog:{},invoiceCode:''});});events.sort(function(a,c){return Number(a.atMs)-Number(c.atMs);});
    var tq=String(timeInput&&timeInput.value||'').split(':').map(Number),chosenStart=tq.length>1?new Date(new Date(dayReviewBounds.start).getFullYear(),new Date(dayReviewBounds.start).getMonth(),new Date(dayReviewBounds.start).getDate(),tq[0]||0,tq[1]||0,0,0).getTime():0;
    var firstEvent=events.find(function(e){return Number(e.atMs)>=coverageStart;}),chunkMs=15*60000,chunkStart=chosenStart?Math.max(coverageStart,Math.min(chosenStart,coverageEnd-30000)):(firstEvent?Math.max(coverageStart,Number(firstEvent.atMs)-5*60000):coverageStart);
    var ov=document.createElement('div');ov.id='ofCctvPlaybackOv';ov.className='of-cctv-playback-ov';
    ov.innerHTML='<div class="of-cctv-playback-modal"><div class="of-cctv-playback-head"><div><b>🎬 اليوم الكامل + السلة</b><small class="of-day511-muted" data-day-coverage></small></div><button type="button" class="of-cctv-playback-close">✕ إغلاق</button></div><div class="of-day511-body"><div class="of-day511-stage"><video controls autoplay muted playsinline></video><div class="of-day511-nav"><button type="button" data-day-prev>⏮ 15 دقيقة</button><input type="range" data-day-slider step="1"><button type="button" data-day-next>15 دقيقة ⏭</button></div></div><aside class="of-day511-cart"><div class="of-day511-carthead"><b>🛒 السلة في هذه اللحظة</b><div class="of-day511-muted" data-day-clock>—</div><div class="of-day511-event" data-day-event>بين الفواتير</div><div class="of-day511-muted" data-day-status>جاري تجهيز التسجيل…</div></div><div class="of-day511-rows" data-day-rows></div><div class="of-day511-total"><span>الإجمالي</span><strong data-day-total>0.00 ج.م</strong></div></aside></div></div>';
    closePlaybackModal();document.body.appendChild(ov);
    var video=ov.querySelector('video'),slider=ov.querySelector('[data-day-slider]'),clock=ov.querySelector('[data-day-clock]'),eventEl=ov.querySelector('[data-day-event]'),rowsEl=ov.querySelector('[data-day-rows]'),totalEl=ov.querySelector('[data-day-total]'),status=ov.querySelector('[data-day-status]');
    ov.querySelector('[data-day-coverage]').textContent='المتاح '+new Date(coverageStart).toLocaleTimeString('ar-EG')+' — '+new Date(coverageEnd).toLocaleTimeString('ar-EG')+' · مقاطع 15 دقيقة متصلة تلقائيًا';
    slider.min=String(Math.floor((coverageStart-dayReviewBounds.start)/60000));slider.max=String(Math.max(Number(slider.min),Math.floor((coverageEnd-dayReviewBounds.start-30000)/60000)));
    function kindName(k){return ({item_added:'إضافة صنف',item_removed:'حذف صنف',qty_increased:'زيادة كمية',qty_decreased:'تقليل كمية',cart_edited:'تعديل السلة',payment:'بدء الدفع',saving:'بدء الحفظ',sale_saved:'حفظ الفاتورة',cart_cleared:'بين الفواتير'})[k]||'حركة سلة';}
    function renderAt(){var now=chunkStart+(Number(video.currentTime)||0)*1000,hit=null;for(var i=0;i<events.length&&Number(events[i].atMs)<=now;i++)hit=events[i];clock.textContent=new Date(now).toLocaleString('ar-EG');if(!hit||hit.kind==='cart_cleared'){eventEl.textContent='بين الفواتير';rowsEl.innerHTML='<div class="of-day511-muted" style="padding:12px">السلة فاضية</div>';totalEl.textContent='0.00 ج.م';return;}eventEl.textContent=kindName(hit.kind)+(hit.invoiceCode?' · فاتورة '+esc(hit.invoiceCode):'');var rows=cartRows(hit.cart),catalog=hit.catalog||{};rowsEl.innerHTML=rows.map(function(r){var item=catalog[r[0]]||{},q=Number(r[1])||0,p=Number(r[2])||0,ret=Number(r[3])===1;return '<div class="of-day511-row"><span><b>'+esc(item.name||item.id||'صنف')+(ret?' ↩':'')+'</b><small>'+q+' × '+p.toFixed(2)+(item.barcode?' · '+esc(item.barcode):'')+'</small></span><strong>'+(q*p).toFixed(2)+'</strong></div>';}).join('')||'<div class="of-day511-muted" style="padding:12px">السلة فاضية</div>';totalEl.textContent=Number(hit.total||0).toFixed(2)+' ج.م';}
    var chunkRetry=0;function loadChunk(next,isRetry){if(!isRetry)chunkRetry=0;var latestStart=Math.max(coverageStart,coverageEnd-30000);chunkStart=Math.max(coverageStart,Math.min(Number(next)||coverageStart,latestStart));var duration=Math.max(30,Math.min(900,Math.floor((coverageEnd-chunkStart)/1000))),cid=String(x.playbackCamera||'4');slider.value=String(Math.floor((chunkStart-dayReviewBounds.start)/60000));status.textContent=chunkRetry?'إعادة الاتصال بالتسجيل تلقائيًا…':'جاري تجهيز '+new Date(chunkStart).toLocaleTimeString('ar-EG')+'…';status.style.display='block';video.src=gateway+'/echarpe-playback/video?camera='+encodeURIComponent(cid)+'&atMs='+encodeURIComponent(chunkStart)+'&durationSec='+duration+'&quality=480&mode=fast&_='+Date.now();video.load();video.play().catch(function(){});renderAt();}
    video.addEventListener('playing',function(){chunkRetry=0;status.style.display='none';});video.addEventListener('timeupdate',renderAt);video.addEventListener('seeking',renderAt);video.addEventListener('error',function(){if(chunkRetry<3&&document.documentElement.contains(ov)){chunkRetry++;status.style.display='block';status.textContent='إعادة الاتصال بالتسجيل تلقائيًا ('+chunkRetry+'/3)…';if(video._retryTimer)clearTimeout(video._retryTimer);video._retryTimer=setTimeout(function(){loadChunk(chunkStart,true);},2500);return;}status.style.display='block';status.textContent='التسجيل غير متاح في هذا التوقيت.';});video.addEventListener('ended',function(){if(chunkStart+chunkMs<coverageEnd-30000)loadChunk(chunkStart+chunkMs);});
    slider.onchange=function(){loadChunk(dayReviewBounds.start+Number(slider.value)*60000);};ov.querySelector('[data-day-prev]').onclick=function(){loadChunk(chunkStart-chunkMs);};ov.querySelector('[data-day-next]').onclick=function(){loadChunk(chunkStart+chunkMs);};ov.querySelector('.of-cctv-playback-close').onclick=closePlaybackModal;ov.onclick=function(e){if(e.target===ov)closePlaybackModal();};loadChunk(chunkStart);
  }
  function renderDayRows(rows){
    var box=document.getElementById('ofCctvDayRows'); if(!box)return;
    rows.sort(function(a,c){return saleMs(c)-saleMs(a);});
    if(!rows.length){box.innerHTML='<div class="of-cctv-day-empty">مفيش فواتير في اليوم ده للفرع المختار.</div>';return;}
    box.innerHTML=rows.map(function(x){
      var pm=Object.keys(x.payments||{}).filter(function(k){return Math.abs(Number(x.payments[k]||0))>.001;}).map(function(k){return (k==='visa'?'Visa':k==='cash'?'كاش':k==='instapay'?'Instapay':esc(k))+' '+money(x.payments[k]);}).join(' · ');
      var cust=x.customerName||x.customerPhone?('👤 '+esc(x.customerName||'عميل')+(x.customerPhone?' · '+esc(x.customerPhone):'')):'👤 بدون عميل';
      return '<div class="of-cctv-day-row"><div class="of-cctv-day-time">'+new Date(saleMs(x)).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})+'</div><div class="of-cctv-day-main"><b>فاتورة '+esc(x.invoiceNo||x.invoiceCode||x.id||'')+' · '+money(x.total)+'</b><small>'+cust+' · '+esc(x.employeeName||x.employee||'')+'</small><small>💳 '+(pm||'—')+' · '+Number(x.itemCount||(x.items||[]).length)+' صنف</small></div><div class="of-cctv-day-actions"><button type="button" onclick="ofCctvInvoiceShot(\''+esc(String(x.invoiceCode||''))+'\')">📸 اللقطات</button>'+(b().playback?'<button type="button" data-playback-at="'+saleMs(x)+'">🎥 التسجيل</button>':'')+(x.id&&window.ofOpenSaleDetails?'<button type="button" data-open-sale="'+esc(x.id)+'">🧾 التفاصيل</button>':'')+'</div></div>';
    }).join('');
    box.querySelectorAll('[data-playback-at]').forEach(function(btn){btn.onclick=function(){openPlayback(Math.max(1,Number(btn.getAttribute('data-playback-at'))-5*60*1000),15,b().playbackCamera);};});
    box.querySelectorAll('[data-open-sale]').forEach(function(btn){btn.onclick=function(){try{window.ofOpenSaleDetails(btn.getAttribute('data-open-sale'));}catch(e){}};});
  }
  async function loadDayReview(){
    var inp=document.getElementById('ofCctvDayDate'), btn=document.getElementById('ofCctvDayLoad'), box=document.getElementById('ofCctvDayRows');
    if(!inp||!box)return; var r=dayBounds(inp.value); if(!r)return;dayReviewBounds=r;dayReviewRows=[];var playBtn=document.getElementById('ofCctvDayPlay');if(playBtn)playBtn.disabled=true;
    if(btn){btn.disabled=true;btn.textContent='جاري التحميل…';} box.innerHTML='<div class="of-cctv-day-empty">جاري تحميل اليوم…</div>';
    try{
      var cached=(window.ofCctvGetCachedSales&&window.ofCctvGetCachedSales())||[];
      var aliases=(b().liveAliases||[]).map(function(v){return String(v).toLowerCase();});
      var rows=cached.filter(function(x){var t=saleMs(x),br=String(x.branch||'').toLowerCase();return t>=r.start&&t<r.end&&aliases.some(function(a){return br.indexOf(a)>=0;});});
      if(!rows.length && typeof db!=='undefined'){
        var q=db.collection('pos_test_sales').where('createdAtMs','>=',r.start).where('createdAtMs','<',r.end);
        var snap=await q.get(); rows=[]; snap.forEach(function(d){var x=Object.assign({id:d.id},d.data()||{}),br=String(x.branch||'').toLowerCase();if(aliases.some(function(a){return br.indexOf(a)>=0;}))rows.push(x);});
      }
      dayReviewRows=rows.slice();renderDayRows(rows);if(playBtn)playBtn.disabled=false;
    }catch(e){box.innerHTML='<div class="of-cctv-day-empty">تعذر تحميل مراجعة اليوم: '+esc(e&&e.message||e)+'</div>';}
    finally{if(btn){btn.disabled=false;btn.textContent='تحميل اليوم';}}
  }
  async function loadActivityAlerts(){
    var section=document.getElementById('ofCctvActivityReview'),box=document.getElementById('ofCctvActivityRows'),status=document.getElementById('ofCctvActivityStatus');if(!section||!box)return;
    var x=b();section.style.display=x.id==='madinaty'?'block':'none';if(x.id!=='madinaty')return;
    box.innerHTML='<div class="of-cctv-day-empty">جاري فحص التنبيهات…</div>';
    try{
      var base=String(x.gateway||'').replace(/\/$/,''),pair=await Promise.all([
        fetchJsonRetry(base+'/echarpe-playback/alerts?_='+Date.now(),x.id,3),
        fetchJsonRetry(base+'/echarpe-playback/activity-status?_='+Date.now(),x.id,2).catch(function(){return null;})
      ]),items=Array.isArray(pair[0].items)?pair[0].items:[],det=pair[1]||{};
      if(status){var s=det.state||{};status.textContent=det.detector?('● الكشف شغال · موظف '+(s.employee?'موجود':'—')+' · عميل '+(s.customer?'موجود':'—')):'● كاشف الأشخاص غير متصل';status.classList.toggle('offline',!det.detector);}
      if(!items.length){box.innerHTML='<div class="of-cctv-day-empty">لا يوجد نشاط عميل + موظف بدون فاتورة.</div>';return;}
      box.innerHTML=items.map(function(a){return '<div class="of-cctv-day-row of-cctv-alert-row"><div class="of-cctv-day-time">'+new Date(Number(a.atMs)).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})+'</div><div class="of-cctv-day-main"><b>⚠️ عميل عند الكاشير بدون فاتورة</b><small>'+new Date(Number(a.atMs)).toLocaleDateString('ar-EG')+' · تم التأكد بعد مهلة 3 دقائق</small></div><div class="of-cctv-day-actions"><button type="button" data-activity-play="'+esc(String(a.id||''))+'">🎥 مشاهدة الفيديو</button></div></div>';}).join('');
      box.querySelectorAll('[data-activity-play]').forEach(function(btn){btn.onclick=function(){var a=items.find(function(q){return String(q.id)===btn.getAttribute('data-activity-play');});if(a)openPlayback(Number(a.startMs),Math.max(1,Math.ceil(Number(a.durationSec||60)/60)),'4');};});
    }catch(e){if(status){status.textContent='● تعذر الاتصال بكاشف الأشخاص';status.classList.add('offline');}box.innerHTML='<div class="of-cctv-day-empty">تعذر تحميل تنبيهات النشاط: '+esc(e&&e.message||e)+'</div>';}
  }
  function init(){
    load();
    var di=document.getElementById('ofCctvDayDate'); if(di&&!di.value){var nd=new Date();di.value=nd.getFullYear()+'-'+String(nd.getMonth()+1).padStart(2,'0')+'-'+String(nd.getDate()).padStart(2,'0');}
    var dti=document.getElementById('ofCctvDayTime');if(dti&&!dti.value){var dtn=new Date();dti.value=String(dtn.getHours()).padStart(2,'0')+':'+String(Math.floor(dtn.getMinutes()/5)*5).padStart(2,'0');}
    var dl=document.getElementById('ofCctvDayLoad'); if(dl)dl.onclick=loadDayReview;
    var dp=document.getElementById('ofCctvDayPlay');if(dp)dp.onclick=openDayBasketPlayback;
    var ar=document.getElementById('ofCctvActivityReload');if(ar)ar.onclick=loadActivityAlerts;
    var ndt=new Date(),nvd=document.getElementById('ofCctvNvrDate'),nvt=document.getElementById('ofCctvNvrTime'),nvb=document.getElementById('ofCctvNvrOpen');
    if(nvd&&!nvd.value)nvd.value=ndt.getFullYear()+'-'+String(ndt.getMonth()+1).padStart(2,'0')+'-'+String(ndt.getDate()).padStart(2,'0');
    if(nvt&&!nvt.value)nvt.value=String(ndt.getHours()).padStart(2,'0')+':'+String(Math.floor(ndt.getMinutes()/5)*5).padStart(2,'0');
    if(nvb)nvb.onclick=openPlaybackFromControls;syncPlaybackPanel();
    var roomFs=document.getElementById('ofCctvRoomFullscreen');if(roomFs)roomFs.onclick=toggleRoomFocus;
    ['fullscreenchange','webkitfullscreenchange','MSFullscreenChange'].forEach(function(ev){document.addEventListener(ev,function(){if(!fsEl()&&!document.querySelector('.of-cctv-room-focus')&&!document.querySelector('.of-cctv-panel-focus'))clearFocusClasses();});});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&document.getElementById('ofCctvPlaybackOv')){closePlaybackModal();return;}if(e.key==='Escape'&&(document.querySelector('.of-cctv-room-focus')||document.querySelector('.of-cctv-panel-focus'))){clearFocusClasses();exitNativeFs();}});
    window.addEventListener('office-pos-live-update',refreshPosOnly);window.addEventListener('beforeunload',stop);
    document.addEventListener('visibilitychange',function(){
      var page=document.getElementById('page-cctv');
      if(document.hidden){ if(state.active){ var grid=document.getElementById('ofCctvCameraGrid'); if(grid)grid.querySelectorAll('.of-cctv-panel').forEach(stopPanel); } }
      else if(state.active && page && page.classList.contains('on')) render();
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.ofCctvStart=start;window.ofCctvStop=stop;window.ofCctvOpenPlayback=openPlayback;
})();

/* v495 invoice CCTV: branch-local stills + exact 30s before/30s after lightweight NVR stream. */
window.ofCctvInvoiceShot = async function(invoiceCode){
  try{
    if(!invoiceCode||typeof db==='undefined')return;
    var snap=await db.collection('pos_cctv_invoice_snapshots').doc(String(invoiceCode)).get();
    if(!snap.exists){alert('مفيش لقطات محفوظة للفاتورة دي.');return;}
    var d=snap.data()||{},shots=d.shots||{},localGlow=!!d.localSnapshots&&String(d.branch||'').toLowerCase().indexOf('glow')>=0;
    if(!Object.keys(shots).length && /^data:image\/jpeg;base64,/.test(String(d.jpegData||'')))shots={after_save:{jpegData:d.jpegData,capturedAtMs:d.capturedAtMs,width:d.width,height:d.height,camera:d.camera||'D04'}};
    var order=['first_item','payment','saving','after_save'];
    var labels={first_item:'1️⃣ أول كود',payment:'2️⃣ أثناء الدفع',saving:'3️⃣ أثناء الحفظ',after_save:'4️⃣ بعد الحفظ'};
    var valid=order.filter(function(k){var x=shots[k]||{};return localGlow?!!x.available:/^data:image\/jpeg;base64,/.test(String(x.jpegData||''));});
    if(!valid.length){alert('مفيش صورة صالحة محفوظة للفاتورة دي.');return;}
    var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);});};
    var gateway=localGlow?'https://cctv-glow.echarpe.store':'';
    function shotUrl(k){return localGlow?(gateway+'/echarpe-events/snapshot?invoice='+encodeURIComponent(String(invoiceCode))+'&stage='+encodeURIComponent(k)+'&_='+Date.now()):String((shots[k]||{}).jpegData||'');}
    if(!document.getElementById('ofCctvInvoiceStyle')){
      var st=document.createElement('style');st.id='ofCctvInvoiceStyle';st.textContent='.of-inv-cctv-ov{position:fixed;inset:0;z-index:9999;background:rgba(2,6,23,.94);display:flex;align-items:center;justify-content:center;padding:14px;overflow:auto}.of-inv-cctv-box{width:min(100%,1050px);background:#111827;border:1px solid #334155;border-radius:20px;padding:14px;color:#fff;box-shadow:0 22px 70px rgba(0,0,0,.55)}.of-inv-cctv-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px}.of-inv-cctv-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.of-inv-cctv-btn{border:0;border-radius:10px;padding:9px 13px;cursor:pointer;font-weight:800}.of-inv-cctv-video-btn{background:#2563eb;color:#fff}.of-inv-cctv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.of-inv-cctv-card{text-align:right;border:1px solid #334155;background:#0f172a;color:#fff;border-radius:15px;padding:8px;cursor:pointer}.of-inv-cctv-card img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#000;border-radius:10px}.of-inv-cctv-card-foot{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:7px}.of-inv-cctv-muted{font-size:11px;color:#94a3b8}.of-inv-cctv-error{display:none;padding:22px 10px;text-align:center;color:#fecaca}.of-inv-play-ov{position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.94);display:flex;align-items:center;justify-content:center;padding:10px}.of-inv-play-box{width:min(100%,1000px);height:min(88vh,760px);background:#05070b;border:1px solid #25324a;border-radius:16px;overflow:hidden;display:flex;flex-direction:column}.of-inv-play-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;color:#fff}.of-inv-play-stage{position:relative;flex:1;min-height:0;background:#000;display:flex;align-items:center;justify-content:center}.of-inv-play-stage video{display:block;width:100%;height:100%;object-fit:contain;background:#000}.of-inv-play-status{position:absolute;right:12px;left:12px;bottom:12px;padding:8px 10px;border:1px solid #334155;border-radius:10px;background:rgba(15,23,42,.88);color:#e2e8f0;font-size:12px}.of-inv-play-status.ok{display:none}.of-inv-play-status.err{color:#fecaca;border-color:#7f1d1d;background:rgba(69,10,10,.92)}@media(max-width:620px){.of-inv-cctv-ov{padding:8px;align-items:flex-start}.of-inv-cctv-box{border-radius:15px;padding:10px}.of-inv-cctv-head{align-items:flex-start;flex-direction:column}.of-inv-cctv-actions{width:100%}.of-inv-cctv-actions .of-inv-cctv-btn{flex:1}.of-inv-cctv-grid{grid-template-columns:1fr}.of-inv-play-ov{padding:0}.of-inv-play-box{width:100%;height:100%;max-height:none;border:0;border-radius:0}}';document.head.appendChild(st);
    }
    var cards=valid.map(function(k){var x=shots[k]||{};return '<button type="button" data-cctv-shot="'+k+'" class="of-inv-cctv-card"><img src="'+esc(shotUrl(k))+'" alt="'+esc(labels[k])+'" loading="lazy"><div class="of-inv-cctv-error">تعذر تحميل اللقطة من كمبيوتر الفرع</div><div class="of-inv-cctv-card-foot"><b style="font-size:12px">'+labels[k]+'</b><small class="of-inv-cctv-muted">'+new Date(Number(x.capturedAtMs)||Date.now()).toLocaleTimeString('ar-EG')+'</small></div></button>';}).join('');
    var videoBtn=(localGlow&&Number(d.videoAtMs)>0)?'<button id="ofCctvShotVideo" class="of-inv-cctv-btn of-inv-cctv-video-btn">🎥 30 ثانية قبل + 30 بعد</button>':'';
    var ov=document.createElement('div');ov.id='ofCctvShotOv';ov.className='of-inv-cctv-ov';
    ov.innerHTML='<div class="of-inv-cctv-box"><div class="of-inv-cctv-head"><div><b>📸 لقطات الفاتورة '+esc(invoiceCode)+'</b><div class="of-inv-cctv-muted" style="margin-top:3px">'+esc((d.camera||((valid[0]&&shots[valid[0]]&&shots[valid[0]].camera)||'CCTV')))+' · '+valid.length+' لقطة · محفوظة محليًا في الفرع</div></div><div class="of-inv-cctv-actions">'+videoBtn+'<button id="ofCctvShotClose" class="of-inv-cctv-btn">إغلاق</button></div></div><div id="ofCctvShotGrid" class="of-inv-cctv-grid">'+cards+'</div><div id="ofCctvShotFocus" style="display:none;margin-top:10px"><button id="ofCctvShotBack" class="of-inv-cctv-btn" style="margin-bottom:8px">← كل اللقطات</button><img id="ofCctvShotBig" alt="CCTV invoice snapshot" style="display:block;width:100%;max-height:72vh;object-fit:contain;background:#000;border-radius:12px"><div id="ofCctvShotMeta" class="of-inv-cctv-muted" style="margin-top:7px"></div></div></div>';
    document.body.appendChild(ov);
    ov.querySelectorAll('.of-inv-cctv-card img').forEach(function(img){img.onerror=function(){img.style.display='none';var er=img.parentNode.querySelector('.of-inv-cctv-error');if(er)er.style.display='block';};});
    var grid=ov.querySelector('#ofCctvShotGrid'),focus=ov.querySelector('#ofCctvShotFocus'),big=ov.querySelector('#ofCctvShotBig'),meta=ov.querySelector('#ofCctvShotMeta');
    ov.querySelectorAll('[data-cctv-shot]').forEach(function(btn){btn.onclick=function(){var k=btn.getAttribute('data-cctv-shot'),x=shots[k]||{};grid.style.display='none';focus.style.display='block';big.src=shotUrl(k);meta.textContent=labels[k]+' · '+new Date(Number(x.capturedAtMs)||Date.now()).toLocaleString('ar-EG');};});
    ov.querySelector('#ofCctvShotBack').onclick=function(){focus.style.display='none';big.src='';grid.style.display='grid';};
    var vb=ov.querySelector('#ofCctvShotVideo');if(vb)vb.onclick=function(){
      var at=Math.max(1,Number(d.videoAtMs)-30000);function invoiceVideoUrl(q){return gateway+'/echarpe-playback/video?camera=1&atMs='+encodeURIComponent(at)+'&durationSec=60&quality='+encodeURIComponent(q||'480')+'&_='+Date.now();}var videoUrl=invoiceVideoUrl('480');
      var pv=document.createElement('div');pv.id='ofCctvInvoicePlayback';pv.className='of-inv-play-ov';
      pv.innerHTML='<div class="of-inv-play-box"><div class="of-inv-play-head"><div><b>🎥 الفاتورة · 30 ثانية قبل + 30 بعد</b><div class="of-inv-cctv-muted">480p افتراضيًا للسرعة · التسجيل الأصلي يظل على الـNVR</div></div><div style="display:flex;align-items:center;gap:7px"><select id="ofCctvInvoiceQuality" class="of-inv-cctv-btn" aria-label="جودة الفيديو"><option value="480" selected>480p سريع</option><option value="720">720p أوضح</option></select><button id="ofCctvInvoicePlaybackClose" class="of-inv-cctv-btn">✕</button></div></div><div class="of-inv-play-stage"><video id="ofCctvInvoiceVideo" controls autoplay muted playsinline preload="none"></video><div id="ofCctvInvoiceVideoStatus" class="of-inv-play-status">جاري تجهيز الدقيقة من الـNVR…</div></div></div>';
      document.body.appendChild(pv);var video=pv.querySelector('#ofCctvInvoiceVideo'),status=pv.querySelector('#ofCctvInvoiceVideoStatus');
      function close(){try{video.pause();video.removeAttribute('src');video.load();}catch(e){}pv.remove();}
      video.addEventListener('playing',function(){status.className='of-inv-play-status ok';});video.addEventListener('loadeddata',function(){status.className='of-inv-play-status ok';});video.addEventListener('waiting',function(){if(!status.classList.contains('err')){status.className='of-inv-play-status';status.textContent='جاري تحميل التسجيل…';}});video.addEventListener('error',function(){status.className='of-inv-play-status err';status.innerHTML='تعذر تشغيل التسجيل. افتح بوابة CCTV مرة واحدة وتأكد إنك مسجل دخول Cloudflare Access.';});
      var qualitySel=pv.querySelector('#ofCctvInvoiceQuality');qualitySel.onchange=function(){status.className='of-inv-play-status';status.textContent='جاري تجهيز '+qualitySel.value+'p من الـNVR…';video.src=invoiceVideoUrl(qualitySel.value);video.load();video.play().catch(function(){});};pv.querySelector('#ofCctvInvoicePlaybackClose').onclick=close;pv.onclick=function(e){if(e.target===pv)close();};video.src=videoUrl;video.load();video.play().catch(function(){});
    };
    ov.onclick=function(e){if(e.target===ov)ov.remove();};ov.querySelector('#ofCctvShotClose').onclick=function(){ov.remove();};
  }catch(e){console.warn('invoice shots',e);alert('تعذر فتح لقطات الفاتورة');}
};

/* v506: authoritative invoice viewer. It replaces the v495 handler above at
   load time, keeps old invoice compatibility, and adds camera+basket replay. */
window.ofCctvTimelineStateAt=function(events,clipStartAtMs,videoSeconds){
  var now=Number(clipStartAtMs)+(Number(videoSeconds)||0)*1000,hit=null,list=Array.isArray(events)?events:[];
  for(var i=0;i<list.length&&Number(list[i].atMs)<=now;i++)hit=list[i];
  return {atMs:now,event:hit};
};
window.ofCctvInvoiceShot = async function(invoiceCode){
  try{
    if(!invoiceCode||typeof db==='undefined')return;
    var reads=await Promise.all([
      db.collection('pos_cctv_invoice_snapshots').doc(String(invoiceCode)).get().catch(function(){return null;}),
      db.collection('pos_cctv_invoice_timelines').doc(String(invoiceCode)).get().catch(function(){return null;})
    ]);
    var snap=reads[0],timelineSnap=reads[1];
    if(!snap||!snap.exists){alert('مفيش لقطات محفوظة للفاتورة دي.');return;}
    var d=snap.data()||{},timeline=(timelineSnap&&timelineSnap.exists)?(timelineSnap.data()||{}):(d.basketTimeline||null),shots=d.shots||{};
    var profile=window.ofCctvProfileFor(d.branchProfile||d.branch);
    var localBranch=!!d.localSnapshots,gateway=String(d.gateway||(profile&&profile.gateway)||'').replace(/\/$/,'');
    var playbackReady=!!gateway&&!!(profile&&profile.playback)&&Number(d.videoAtMs)>0;
    if(!Object.keys(shots).length&&/^data:image\/jpeg;base64,/.test(String(d.jpegData||'')))shots={after_save:{jpegData:d.jpegData,capturedAtMs:d.capturedAtMs,width:d.width,height:d.height,camera:d.camera||'CCTV'}};
    var order=['first_item','payment','saving','after_save'];
    var labels={first_item:'1️⃣ أول كود',payment:'2️⃣ أثناء الدفع',saving:'3️⃣ أثناء الحفظ',after_save:'4️⃣ بعد الحفظ'};
    var valid=order.filter(function(k){var x=shots[k]||{};return localBranch?!!x.available:/^data:image\/jpeg;base64,/.test(String(x.jpegData||''));});
    if(!valid.length&&!playbackReady){alert('مفيش صورة أو تسجيل صالح محفوظ للفاتورة دي.');return;}
    var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);});};
    function shotUrl(k){return localBranch?(gateway+'/echarpe-events/snapshot?invoice='+encodeURIComponent(String(invoiceCode))+'&stage='+encodeURIComponent(k)+'&_='+Date.now()):String((shots[k]||{}).jpegData||'');}
    function videoUrl(startAtMs,durationSec,quality){
      var cid=String(d.cameraId||(profile&&profile.cashierCamera)||'1'),u=gateway+'/echarpe-playback/video?camera='+encodeURIComponent(cid)+'&atMs='+encodeURIComponent(Math.max(1,Number(startAtMs)||1))+'&durationSec='+encodeURIComponent(Math.max(30,Math.min(1800,Number(durationSec)||60)))+'&quality='+encodeURIComponent(quality||'480');
      if(d.clockSource==='nvr_isapi'||d.clockSource==='config')u+='&offsetMs='+encodeURIComponent(Number(d.nvrOffsetMs)||0);
      if(String(quality||'480')==='480')u+='&mode=fast';
      return u+'&_='+Date.now();
    }
    if(!document.getElementById('ofCctvInvoiceStyle506')){
      var st=document.createElement('style');st.id='ofCctvInvoiceStyle506';st.textContent='.of-inv506-ov{position:fixed;inset:0;z-index:10020;background:rgba(2,6,23,.95);display:flex;align-items:center;justify-content:center;padding:12px;color:#fff;direction:rtl}.of-inv506-box{width:min(1100px,100%);max-height:94vh;overflow:auto;background:#0b1220;border:1px solid #334155;border-radius:18px;padding:13px}.of-inv506-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:11px}.of-inv506-actions{display:flex;gap:7px;flex-wrap:wrap}.of-inv506-btn{border:0;border-radius:10px;padding:9px 12px;font-weight:800;cursor:pointer}.of-inv506-blue{background:#2563eb;color:#fff}.of-inv506-gold{background:#d6a72f;color:#111827}.of-inv506-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.of-inv506-shot{border:1px solid #334155;background:#111827;color:#fff;border-radius:13px;padding:7px;text-align:right;cursor:pointer}.of-inv506-shot img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#000;border-radius:9px}.of-inv506-foot{display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:12px}.of-sync506{width:min(1220px,100%);height:min(90vh,820px);display:flex;flex-direction:column;background:#05070b;border:1px solid #334155;border-radius:16px;overflow:hidden}.of-sync506-head{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;background:#0f172a}.of-sync506-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.7fr) minmax(290px,.8fr);direction:ltr}.of-sync506-video{position:relative;min-width:0;background:#000}.of-sync506-video video{width:100%;height:100%;display:block;object-fit:contain}.of-sync506-status{position:absolute;right:10px;left:10px;bottom:10px;padding:8px;background:rgba(15,23,42,.9);border-radius:9px;font-size:12px}.of-sync506-status.ok{display:none}.of-sync506-cart{direction:rtl;background:#0f172a;border-right:1px solid #334155;display:flex;flex-direction:column;min-height:0}.of-sync506-carthead{padding:11px;border-bottom:1px solid #334155}.of-sync506-rows{overflow:auto;flex:1;padding:8px}.of-sync506-row{display:flex;justify-content:space-between;gap:8px;padding:8px;border-bottom:1px solid #263449;font-size:12px}.of-sync506-row small{display:block;color:#94a3b8;margin-top:3px}.of-sync506-total{display:flex;justify-content:space-between;padding:12px;font-weight:900;border-top:1px solid #334155}.of-sync506-event{color:#f5cf68;font-size:11px;margin-top:4px}.of-inv506-muted{color:#94a3b8;font-size:11px}@media(max-width:760px){.of-inv506-ov{padding:0;align-items:stretch}.of-inv506-box,.of-sync506{width:100%;height:100%;max-height:none;border:0;border-radius:0}.of-inv506-grid{grid-template-columns:1fr}.of-sync506-body{grid-template-columns:1fr;grid-template-rows:minmax(45%,1fr) minmax(35%,.8fr)}.of-sync506-cart{border-right:0;border-top:1px solid #334155}.of-inv506-head,.of-sync506-head{align-items:flex-start;flex-direction:column}.of-inv506-actions{width:100%}.of-inv506-actions .of-inv506-btn{flex:1}}';document.head.appendChild(st);
    }
    var cards=valid.map(function(k){var x=shots[k]||{};return '<button type="button" data-shot="'+k+'" class="of-inv506-shot"><img src="'+esc(shotUrl(k))+'" alt="'+esc(labels[k])+'"><div class="of-inv506-foot"><b>'+labels[k]+'</b><small>'+new Date(Number(x.capturedAtMs)||Date.now()).toLocaleTimeString('ar-EG')+'</small></div></button>';}).join('');
    var hasTimeline=!!(timeline&&Array.isArray(timeline.events)&&timeline.events.length);
    var ov=document.createElement('div');ov.className='of-inv506-ov';ov.id='ofCctvShotOv';
    ov.innerHTML='<div class="of-inv506-box"><div class="of-inv506-head"><div><b>📸 فاتورة '+esc(invoiceCode)+'</b><div class="of-inv506-muted">'+esc(d.camera||'CCTV')+' · '+valid.length+' لقطة'+(hasTimeline?' · Timeline السلة محفوظ':'')+'</div></div><div class="of-inv506-actions">'+(playbackReady?'<button id="ofInv506Video" class="of-inv506-btn of-inv506-blue">🎥 30 ثانية قبل + 30 بعد</button>':'')+(playbackReady&&hasTimeline?'<button id="ofInv506Sync" class="of-inv506-btn of-inv506-gold">🎬 الكاميرا + السلة</button>':'')+(!hasTimeline?'<button id="ofInv506Retry" class="of-inv506-btn">🔄 إعادة فحص السلة</button>':'')+'<button id="ofInv506Close" class="of-inv506-btn">إغلاق</button></div></div><div class="of-inv506-grid">'+(cards||'<div class="of-inv506-muted">الصور غير متاحة، التسجيل موجود.</div>')+'</div>'+(!hasTimeline?'<div class="of-inv506-muted" style="margin-top:10px;padding:10px;border:1px solid #92400e;background:#451a03;color:#fde68a;border-radius:10px">السلة لم تصل من POS لهذه الفاتورة حتى الآن. اضغط «إعادة فحص السلة» بعد ثوانٍ.</div>':'')+'</div>';
    document.body.appendChild(ov);
    function closeOverlay(x){if(x&&x.parentNode)x.parentNode.removeChild(x);}
    ov.querySelector('#ofInv506Close').onclick=function(){closeOverlay(ov);};ov.onclick=function(e){if(e.target===ov)closeOverlay(ov);};
    ov.querySelectorAll('[data-shot]').forEach(function(btn){btn.onclick=function(){
      var k=btn.getAttribute('data-shot'),x=shots[k]||{},img=btn.querySelector('img'),focus=document.createElement('div');
      focus.style.cssText='position:fixed;inset:0;z-index:10060;background:#000;display:flex;flex-direction:column;color:#fff;direction:rtl';
      focus.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px;background:#111827"><button type="button" data-focus-back style="border:0;border-radius:10px;padding:10px 14px;font-weight:900">← رجوع</button><b>'+esc(labels[k]||'صورة الفاتورة')+' · '+new Date(Number(x.capturedAtMs)||Date.now()).toLocaleTimeString('ar-EG')+'</b><button type="button" data-focus-close style="border:0;border-radius:10px;padding:10px 14px;font-weight:900">✕ إغلاق</button></div><img alt="'+esc(labels[k]||'صورة الفاتورة')+'" src="'+esc(img&&img.src||shotUrl(k))+'" style="display:block;width:100%;flex:1;min-height:0;object-fit:contain;background:#000">';
      document.body.appendChild(focus);function closeFocus(){if(focus&&focus.parentNode)focus.parentNode.removeChild(focus);}focus.querySelector('[data-focus-back]').onclick=closeFocus;focus.querySelector('[data-focus-close]').onclick=closeFocus;
    };});
    function openPlayer(sync){
      var start=Number(d.videoAtMs)-30000,duration=60,events=[],catalog={};
      var sourceName=d.clockSource==='pos_pc'?'كمبيوتر الفرع':'الـNVR';
      if(sync){start=Number(timeline.clipStartAtMs)||Math.max(1,Number(timeline.startedAtMs)-5000);var end=Number(timeline.clipEndAtMs)||Number(timeline.endedAtMs)+10000;duration=Math.max(30,Math.min(1800,Math.ceil((end-start)/1000)));events=(timeline.events||[]).slice().sort(function(a,b){return Number(a.atMs)-Number(b.atMs);});catalog=timeline.catalog||{};}
      var pv=document.createElement('div');pv.className='of-inv506-ov';pv.id='ofCctvInvoicePlayback';
      pv.innerHTML='<div class="of-sync506"><div class="of-sync506-head"><div><b>'+(sync?'🎬 Playback الكاميرا والسلة':'🎥 فيديو الفاتورة')+'</b><div class="of-inv506-muted">'+(sync?'كل حركة تظهر في السلة عند نفس لحظتها في الفيديو':'30 ثانية قبل الحفظ + 30 ثانية بعده')+' · التسجيل محفوظ على '+sourceName+'</div></div><div class="of-inv506-actions"><select id="ofSync506Quality" class="of-inv506-btn"><option value="480" selected>480p سريع</option><option value="720">720p أوضح</option></select><button id="ofSync506Close" class="of-inv506-btn">✕</button></div></div><div class="of-sync506-body"><div class="of-sync506-video"><video id="ofSync506Video" controls autoplay muted playsinline preload="none"></video><div id="ofSync506Status" class="of-sync506-status">جاري تجهيز التسجيل من '+sourceName+'…</div></div>'+(sync?'<aside class="of-sync506-cart"><div class="of-sync506-carthead"><b>🛒 السلة في هذه اللحظة</b><div id="ofSync506Clock" class="of-inv506-muted">—</div><div id="ofSync506Event" class="of-sync506-event">قبل أول صنف</div></div><div id="ofSync506Rows" class="of-sync506-rows"></div><div class="of-sync506-total"><span>الإجمالي</span><strong id="ofSync506Total">0.00 ج.م</strong></div></aside>':'')+'</div></div>';
      document.body.appendChild(pv);var video=pv.querySelector('#ofSync506Video'),status=pv.querySelector('#ofSync506Status'),quality=pv.querySelector('#ofSync506Quality');
      function stop(){if(retryTimer)clearTimeout(retryTimer);try{video.pause();video.removeAttribute('src');video.load();}catch(e){}closeOverlay(pv);}
      var videoRetry=0,retryTimer=0;function loadVideo(){if(retryTimer){clearTimeout(retryTimer);retryTimer=0;}status.className='of-sync506-status';status.textContent=videoRetry?'إعادة الاتصال بالتسجيل تلقائيًا…':'جاري تجهيز التسجيل من '+sourceName+'…';video.src=videoUrl(start,duration,quality.value)+'&retry='+Date.now();video.load();video.play().catch(function(){});}
      function renderAt(){if(!sync)return;var state=window.ofCctvTimelineStateAt(events,start,video.currentTime),now=state.atMs,hit=state.event;var rowsEl=pv.querySelector('#ofSync506Rows'),totalEl=pv.querySelector('#ofSync506Total'),clockEl=pv.querySelector('#ofSync506Clock'),eventEl=pv.querySelector('#ofSync506Event');clockEl.textContent=new Date(now).toLocaleTimeString('ar-EG');if(!hit){rowsEl.innerHTML='<div class="of-inv506-muted" style="padding:12px">السلة لسه فاضية</div>';totalEl.textContent='0.00 ج.م';eventEl.textContent='قبل أول صنف';return;}var kind={item_added:'إضافة صنف',item_removed:'حذف صنف',qty_increased:'زيادة كمية',qty_decreased:'تقليل كمية',cart_edited:'تعديل السلة',payment:'بدء الدفع',saving:'بدء الحفظ',sale_saved:'حفظ الفاتورة'}[hit.kind]||'تغيير السلة';eventEl.textContent=kind+' · '+new Date(Number(hit.atMs)).toLocaleTimeString('ar-EG');var rows=window.ofCctvCartRows(hit.cart);rowsEl.innerHTML=rows.map(function(r){var item=catalog[r[0]]||{},q=Number(r[1])||0,p=Number(r[2])||0,ret=Number(r[3])===1;return '<div class="of-sync506-row"><span><b>'+esc(item.name||item.id||'صنف')+(ret?' ↩':'')+'</b><small>'+q+' × '+p.toFixed(2)+(item.barcode?' · '+esc(item.barcode):'')+'</small></span><strong>'+(q*p).toFixed(2)+'</strong></div>';}).join('')||'<div class="of-inv506-muted" style="padding:12px">السلة فاضية</div>';totalEl.textContent=Number(hit.total||0).toFixed(2)+' ج.م';}
      video.addEventListener('playing',function(){videoRetry=0;status.className='of-sync506-status ok';});video.addEventListener('loadeddata',function(){videoRetry=0;status.className='of-sync506-status ok';renderAt();});video.addEventListener('timeupdate',renderAt);video.addEventListener('seeking',renderAt);video.addEventListener('error',function(){if(videoRetry<4&&document.documentElement.contains(pv)){videoRetry++;status.className='of-sync506-status';status.textContent='التسجيل لسه بيتجهز — إعادة المحاولة تلقائيًا ('+videoRetry+'/4)…';retryTimer=setTimeout(loadVideo,4000);return;}status.className='of-sync506-status';status.textContent='التسجيل غير متاح لهذا التوقيت.';});quality.onchange=function(){videoRetry=0;loadVideo();};pv.querySelector('#ofSync506Close').onclick=stop;pv.onclick=function(e){if(e.target===pv)stop();};loadVideo();renderAt();
    }
    var vbtn=ov.querySelector('#ofInv506Video');if(vbtn)vbtn.onclick=function(){openPlayer(false);};var sbtn=ov.querySelector('#ofInv506Sync');if(sbtn)sbtn.onclick=function(){openPlayer(true);};var retry=ov.querySelector('#ofInv506Retry');if(retry)retry.onclick=function(){retry.disabled=true;retry.textContent='جاري الفحص…';setTimeout(function(){closeOverlay(ov);window.ofCctvInvoiceShot(invoiceCode);},700);};
  }catch(e){console.warn('invoice cctv v506',e);alert('تعذر فتح مراجعة الفاتورة');}
};


/* v424: video evidence viewer. Firestore contains metadata only; video stays at branch. */
window.ofCctvOpenEvent = async function(eventId){
  try{
    if(!eventId || typeof db==='undefined') return;
    var snap=await db.collection('pos_cctv_events').doc(String(eventId)).get();
    if(!snap.exists){ alert('مفيش فيديو محفوظ للحدث ده. الفيديوهات تبدأ من v424 بعد تشغيل Evidence Agent.'); return; }
    var d=snap.data()||{}, url=String(d.viewerUrl||''),profiles=(typeof window.echarpeCctvProfiles==='function'?window.echarpeCctvProfiles():[]);
    var allowed=profiles.some(function(p){var g=String(p.gateway||'').replace(/\/$/,'');return g&&url.indexOf(g+'/echarpe-events/view?id=')===0;});
    if(!allowed) throw new Error('bad_viewer_url');
    window.open(url,'_blank','noopener');
  }catch(e){ alert('تعذر فتح فيديو الحدث'); }
};

/* v478 safety wording: v476 shipped D07/D08 as if confirmed. The owner later clarified
   D04/D05 are only candidates. Patch the intelligence wording without touching Office core. */
setTimeout(function(){
  try{
    var orig=window.ofActIntelligence;if(typeof orig!=='function'||orig.__cctv477)return;
    var wrapped=function(a){
      var r=orig(a);if(!r||!a)return r;
      if(a.type==='sale_without_customer_presence'){
        if(r.explain)r.explain=String(r.explain).replace(/D07\/D08/g,'الكاميرات المعرّفة');
        if(r.action)r.action=String(r.action).replace(/D07\/D08/g,'الكاميرات المذكورة في تفاصيل الحدث');
      }
      return r;
    };wrapped.__cctv477=true;window.ofActIntelligence=wrapped;
  }catch(e){}
},0);
