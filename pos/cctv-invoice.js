/* ECHARPE POS CCTV invoice snapshot v422
   One compressed cashier-camera frame per successful invoice.
   Best-effort only: camera failure never blocks sale/print/payment lifecycle. */
(function(){
'use strict';
var COL='pos_cctv_invoice_snapshots', STREAM='camera4';
var LOCAL='http://127.0.0.1:1984';
function frameUrl(){ return LOCAL+'/api/frame.jpeg?src='+encodeURIComponent(STREAM)+'&_='+Date.now(); }
function blobToJpegData(blob){
  return new Promise(function(resolve,reject){
    var img=new Image(), u=URL.createObjectURL(blob);
    img.onload=function(){
      try{
        var max=720, scale=Math.min(1,max/img.naturalWidth), w=Math.max(1,Math.round(img.naturalWidth*scale)), h=Math.max(1,Math.round(img.naturalHeight*scale));
        var c=document.createElement('canvas'); c.width=w; c.height=h;
        c.getContext('2d').drawImage(img,0,0,w,h);
        var data=c.toDataURL('image/jpeg',0.62);
        URL.revokeObjectURL(u);
        if(data.length>700000) return reject(new Error('snapshot_too_large'));
        resolve({data:data,width:w,height:h});
      }catch(e){URL.revokeObjectURL(u);reject(e);}
    };
    img.onerror=function(){URL.revokeObjectURL(u);reject(new Error('snapshot_decode'));};
    img.src=u;
  });
}
async function capture(meta){
  try{
    if(!meta || !meta.invoiceCode || typeof db==='undefined') return false;
    var res=await fetch(frameUrl(),{cache:'no-store'});
    if(!res.ok) throw new Error('frame_http_'+res.status);
    var out=await blobToJpegData(await res.blob());
    await db.collection(COL).doc(String(meta.invoiceCode)).set({
      invoiceCode:String(meta.invoiceCode), invoiceNo:meta.invoiceNo||'', saleId:meta.saleId||'',
      branch:meta.branch||'', camera:'D04', stream:STREAM, capturedAtMs:Number(meta.atMs)||Date.now(),
      width:out.width,height:out.height,jpegData:out.data,version:422
    },{merge:true});
    return true;
  }catch(e){ try{console.warn('CCTV invoice snapshot skipped',e&&e.message||e);}catch(_){} return false; }
}
window.cctvCaptureInvoiceSnapshot=capture;
})();
