/* ECHARPE Office CCTV v423
   One selected stream only: switching camera destroys the previous iframe.
   Branch-ready config; no NVR credentials and no Firestore video traffic. */
(function(){
  'use strict';
  var KEY='echarpe.office.cctv.v423';
  var BRANCHES=[{
    id:'madinaty', name:'مدينتي', gateway:'https://cctv-madinaty.echarpe.store',
    cameras:[
      {id:'4',name:'D04',label:'الكاشير',stream:'camera4'},
      {id:'5',name:'D05',label:'كاميرا 5',stream:'camera5'},
      {id:'7',name:'D07',label:'كاميرا 7',stream:'camera7'},
      {id:'8',name:'D08',label:'كاميرا 8',stream:'camera8'}
    ]
  }];
  var active=false, selectedBranch='madinaty', selectedCamera='4';
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);});}
  function branch(){return BRANCHES.find(function(x){return x.id===selectedBranch;})||BRANCHES[0];}
  function camera(){var b=branch();return b.cameras.find(function(x){return x.id===selectedCamera;})||b.cameras[0];}
  function load(){try{var x=JSON.parse(localStorage.getItem(KEY)||'{}');if(BRANCHES.some(function(b){return b.id===x.branch;}))selectedBranch=x.branch;var b=branch();if(b.cameras.some(function(c){return c.id===String(x.camera);}))selectedCamera=String(x.camera);}catch(e){}}
  function save(){try{localStorage.setItem(KEY,JSON.stringify({branch:selectedBranch,camera:selectedCamera}));}catch(e){}}
  function streamUrl(b,c){return b.gateway+'/stream.html?src='+encodeURIComponent(c.stream);}
  function snapshotUrl(b,c){return b.gateway+'/api/frame.jpeg?src='+encodeURIComponent(c.stream)+'&_='+Date.now();}
  function stopFrame(){var stage=document.getElementById('ofCctvStage');if(stage){stage.querySelectorAll('iframe').forEach(function(f){try{f.src='about:blank';f.remove();}catch(e){}});}}
  function renderNav(){
    var bs=document.getElementById('ofCctvBranches'),cs=document.getElementById('ofCctvCams'),b=branch();
    if(bs)bs.innerHTML=BRANCHES.map(function(x){return '<button class="of-cctv-chip '+(x.id===selectedBranch?'active':'')+'" data-branch="'+esc(x.id)+'">🏬 '+esc(x.name)+'</button>';}).join('');
    if(cs)cs.innerHTML=b.cameras.map(function(c){return '<button class="of-cctv-chip '+(c.id===selectedCamera?'active':'')+'" data-camera="'+esc(c.id)+'">'+esc(c.name)+' · '+esc(c.label)+'</button>';}).join('');
    document.querySelectorAll('[data-branch]').forEach(function(x){x.onclick=function(){if(x.dataset.branch===selectedBranch)return;selectedBranch=x.dataset.branch;selectedCamera=branch().cameras[0].id;save();render();};});
    document.querySelectorAll('[data-camera]').forEach(function(x){x.onclick=function(){if(x.dataset.camera===selectedCamera)return;selectedCamera=x.dataset.camera;save();render();};});
  }
  function render(){
    if(!active)return; stopFrame(); renderNav();
    var b=branch(),c=camera(),stage=document.getElementById('ofCctvStage'); if(!stage)return;
    stage.innerHTML='<div class="of-cctv-overlay"><span class="of-cctv-badge"><b>'+esc(b.name)+' · '+esc(c.name)+'</b> · '+esc(c.label)+'</span><span class="of-cctv-badge of-cctv-live">● LIVE</span></div>'+
      '<iframe title="'+esc(c.name)+'" allow="autoplay; fullscreen" referrerpolicy="no-referrer" src="'+esc(streamUrl(b,c))+'"></iframe>';
  }
  function stop(){active=false;stopFrame();var s=document.getElementById('ofCctvStage');if(s)s.innerHTML='<div class="empty" style="color:#94a3b8;padding-top:20%">البث متوقف</div>';}
  function start(){active=true;render();}
  function init(){load();renderNav();var r=document.getElementById('ofCctvReload'),sh=document.getElementById('ofCctvShot'),op=document.getElementById('ofCctvOpen');if(r)r.onclick=render;if(sh)sh.onclick=function(){var b=branch(),c=camera();window.open(snapshotUrl(b,c),'_blank','noopener');};if(op)op.onclick=function(){var b=branch(),c=camera();window.open(streamUrl(b,c),'_blank','noopener');};window.addEventListener('beforeunload',stop);}
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
