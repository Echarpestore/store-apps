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

/* Invoice snapshot viewer unchanged from v422. */
window.ofCctvInvoiceShot = async function(invoiceCode){
  try{if(!invoiceCode||typeof db==='undefined')return;var snap=await db.collection('pos_cctv_invoice_snapshots').doc(String(invoiceCode)).get();if(!snap.exists){alert('مفيش لقطة محفوظة للفاتورة دي. اللقطات تبدأ من v421 والفواتير الجديدة فقط.');return;}var d=snap.data()||{};if(!/^data:image\/jpeg;base64,/.test(String(d.jpegData||'')))throw new Error('bad_snapshot');var ov=document.createElement('div');ov.id='ofCctvShotOv';ov.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:18px;';ov.innerHTML='<div style="max-width:980px;width:100%;background:#111827;border-radius:16px;padding:12px;color:white;"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:9px"><b>📸 '+String(invoiceCode).replace(/[<>&]/g,'')+' · '+String(d.camera||'D04').replace(/[<>&]/g,'')+'</b><button id="ofCctvShotClose" style="padding:7px 12px;border:0;border-radius:9px;cursor:pointer">إغلاق</button></div><img alt="Invoice CCTV snapshot" src="'+d.jpegData+'" style="display:block;width:100%;max-height:76vh;object-fit:contain;background:#000;border-radius:10px"><div style="font-size:11px;color:#9ca3af;margin-top:7px">وقت الالتقاط: '+new Date(Number(d.capturedAtMs)||Date.now()).toLocaleString('ar-EG')+'</div></div>';document.body.appendChild(ov);ov.onclick=function(e){if(e.target===ov)ov.remove();};document.getElementById('ofCctvShotClose').onclick=function(){ov.remove();};
  }catch(e){alert('تعذر فتح لقطة الفاتورة');}
};
