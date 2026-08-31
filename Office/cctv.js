/* ECHARPE Office CCTV v420
   - No cloud database reads/writes.
   - No NVR credentials in Office.
   - Streams are created only while the CCTV page is visible.
   - Current tested branch gateway exposes stable camera4/5/7/8 names. */
(function(){
  'use strict';
  var KEY='echarpe.office.cctv.v420';
  var DEFAULT_GATEWAY='http://127.0.0.1:1984';
  var CAMERAS=[
    {id:'4',name:'D04',stream:'camera4'},
    {id:'5',name:'D05',stream:'camera5'},
    {id:'7',name:'D07',stream:'camera7'},
    {id:'8',name:'D08',stream:'camera8'}
  ];
  var active=false;

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);});}
  function load(){
    try{ var x=JSON.parse(localStorage.getItem(KEY)||'{}'); return {gateway:cleanGateway(x.gateway||DEFAULT_GATEWAY)}; }
    catch(e){ return {gateway:DEFAULT_GATEWAY}; }
  }
  function cleanGateway(v){
    v=String(v||'').trim().replace(/\/+$/,'');
    if(!/^https?:\/\//i.test(v)) return DEFAULT_GATEWAY;
    try{
      var u=new URL(v);
      // Never allow credentials to be persisted in Office.
      u.username=''; u.password='';
      return u.href.replace(/\/$/,'');
    }catch(e){ return DEFAULT_GATEWAY; }
  }
  function saveGateway(){
    var el=document.getElementById('ofCctvGateway');
    var gateway=cleanGateway(el&&el.value);
    if(el) el.value=gateway;
    try{ localStorage.setItem(KEY,JSON.stringify({gateway:gateway})); }catch(e){}
    render(true);
  }
  function streamUrl(gateway,stream){
    return gateway+'/stream.html?src='+encodeURIComponent(stream);
  }
  function snapshotUrl(gateway,stream){
    return gateway+'/api/frame.jpeg?src='+encodeURIComponent(stream)+'&_='+Date.now();
  }
  function warning(gateway){
    var box=document.getElementById('ofCctvWarn'); if(!box) return;
    var msg='';
    if(location.protocol==='https:' && /^http:\/\//i.test(gateway)){
      msg='⚠️ نسخة Office الحالية HTTPS بينما الـGateway HTTP محلي. بعض المتصفحات تمنع عرض HTTP داخل صفحة HTTPS. على نفس كمبيوتر الفرع استخدم زر «فتح منفصل»، وللعرض من خارج الفرع يلزم Gateway HTTPS آمن.';
    }
    box.textContent=msg; box.style.display=msg?'block':'none';
  }
  function card(c,gateway){
    return '<article class="of-cctv-card" data-cam="'+esc(c.id)+'">'
      +'<div class="of-cctv-head"><div><b>📹 '+esc(c.name)+'</b><br><small>Camera '+esc(c.id)+'</small></div><span style="font-size:10px;color:#34d399">● LIVE</span></div>'
      +'<div class="of-cctv-video"><iframe title="'+esc(c.name)+'" loading="eager" allow="autoplay; fullscreen" referrerpolicy="no-referrer" src="'+esc(streamUrl(gateway,c.stream))+'"></iframe></div>'
      +'<div class="of-cctv-actions">'
      +'<button class="ghost" type="button" data-cctv-open="'+esc(c.stream)+'">↗ فتح منفصل</button>'
      +'<button class="ghost" type="button" data-cctv-shot="'+esc(c.stream)+'">📸 لقطة الآن</button>'
      +'</div></article>';
  }
  function bind(gateway){
    document.querySelectorAll('[data-cctv-open]').forEach(function(b){
      b.onclick=function(){ window.open(streamUrl(gateway,b.dataset.cctvOpen),'_blank','noopener'); };
    });
    document.querySelectorAll('[data-cctv-shot]').forEach(function(b){
      b.onclick=function(){ window.open(snapshotUrl(gateway,b.dataset.cctvShot),'_blank','noopener'); };
    });
  }
  function render(force){
    if(!active && !force) return;
    var cfg=load(), input=document.getElementById('ofCctvGateway'), grid=document.getElementById('ofCctvGrid');
    if(input && document.activeElement!==input) input.value=cfg.gateway;
    warning(cfg.gateway);
    if(!grid) return;
    grid.innerHTML=CAMERAS.map(function(c){return card(c,cfg.gateway);}).join('');
    bind(cfg.gateway);
  }
  function stop(){
    active=false;
    document.querySelectorAll('#ofCctvGrid iframe').forEach(function(f){ try{f.src='about:blank';}catch(e){} });
    var grid=document.getElementById('ofCctvGrid');
    if(grid) grid.innerHTML='<div class="empty" style="grid-column:1/-1;">البث متوقف — افتح التبويب لتشغيله</div>';
  }
  function start(){ active=true; render(true); }
  function init(){
    var save=document.getElementById('ofCctvSave'), reload=document.getElementById('ofCctvReload'), input=document.getElementById('ofCctvGateway');
    var cfg=load(); if(input) input.value=cfg.gateway;
    if(save) save.onclick=saveGateway;
    if(reload) reload.onclick=function(){render(true);};
    window.addEventListener('beforeunload',stop);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
  window.ofCctvStart=start;
  window.ofCctvStop=stop;
})();

/* v421 invoice snapshot viewer — reads only when user asks for a specific invoice. */
window.ofCctvInvoiceShot = async function(invoiceCode){
  try{
    if(!invoiceCode || typeof db==='undefined') return;
    var snap=await db.collection('pos_cctv_invoice_snapshots').doc(String(invoiceCode)).get();
    if(!snap.exists){ alert('مفيش لقطة محفوظة للفاتورة دي. اللقطات تبدأ من v421 والفواتير الجديدة فقط.'); return; }
    var d=snap.data()||{};
    if(!/^data:image\/jpeg;base64,/.test(String(d.jpegData||''))) throw new Error('bad_snapshot');
    var ov=document.createElement('div'); ov.id='ofCctvShotOv';
    ov.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:18px;';
    ov.innerHTML='<div style="max-width:980px;width:100%;background:#111827;border-radius:16px;padding:12px;color:white;">'
      +'<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:9px"><b>📸 '+String(invoiceCode).replace(/[<>&]/g,'')+' · '+String(d.camera||'D04').replace(/[<>&]/g,'')+'</b><button id="ofCctvShotClose" style="padding:7px 12px;border:0;border-radius:9px;cursor:pointer">إغلاق</button></div>'
      +'<img alt="Invoice CCTV snapshot" src="'+d.jpegData+'" style="display:block;width:100%;max-height:76vh;object-fit:contain;background:#000;border-radius:10px">'
      +'<div style="font-size:11px;color:#9ca3af;margin-top:7px">وقت الالتقاط: '+new Date(Number(d.capturedAtMs)||Date.now()).toLocaleString('ar-EG')+'</div></div>';
    document.body.appendChild(ov);
    ov.onclick=function(e){if(e.target===ov)ov.remove();};
    document.getElementById('ofCctvShotClose').onclick=function(){ov.remove();};
  }catch(e){ alert('تعذر فتح لقطة الفاتورة'); }
};
