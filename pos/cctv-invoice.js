/* ECHARPE POS CCTV evidence v467
   - Four stills per invoice: first item, payment, saving, after save.
   - Pre-invoice stills are staged locally by cartSid, then flushed once invoiceCode exists.
   - Keeps v424 video evidence metadata/agent behavior.
   - Best-effort only: CCTV failure never blocks sale/payment/print. */
(function(){
'use strict';
var SHOT_COL='pos_cctv_invoice_snapshots', EVENT_COL='pos_cctv_events';
function branchCfg(branch){
  var s=String(branch || (typeof currentBranch!=='undefined'?currentBranch:'') || '').toLowerCase();
  if(s.indexOf('الرحاب')>=0 || s.indexOf('rehab')>=0) return {id:'rehab',camera:'CAM1',stream:'rehab_cam1_h264',remote:''};
  if(s.indexOf('مدينتي')>=0 || s.indexOf('madinaty')>=0) return {id:'madinaty',camera:'D04',stream:'camera4',remote:'https://cctv-madinaty.echarpe.store'};
  return null;
}
function cfg(meta){ return branchCfg(meta&&meta.branch); }
var LOCAL_GO2RTC='http://127.0.0.1:1984';
var LOCAL_AGENT='http://127.0.0.1:1985/echarpe-events/event';
var STAGE_KEY='echarpe.cctv.invoice.stages.v426.';
var STAGES={first_item:1,payment:1,saving:1,after_save:1};
var pending={};
var HOT={
  gift_card_return_blocked:1, card_overcharge_saved:1, card_adjustment_started:1,
  card_overcharge_ok:1, manual_discount:1, manual_drawer_open:1, customer_points_edit:1,
  redeem_value_mismatch:1, card_saved_manual:1, paymob_stuck:1, paymob_orphan_detected:1,
  same_day_reversal:1, lost_sale:1, inventory_wiped:1, inventory_merge_bulk:1,
  inventory_branch_catalog_replace:1, inventory_full_reconcile:1
};
function safeId(v){return String(v==null?'':v).replace(/[^A-Za-z0-9._-]/g,'_').slice(0,120);}
function invoiceEventId(code){return 'inv_'+safeId(code);}
function activityEventId(type,atMs,sid){
  if(!HOT[type]) return '';
  return 'act_'+safeId(type)+'_'+String(Number(atMs)||Date.now())+'_'+safeId(sid||'nosid').slice(-24);
}
function frameUrl(meta){ var c=cfg(meta); return c?LOCAL_GO2RTC+'/api/frame.jpeg?src='+encodeURIComponent(c.stream)+'&_='+Date.now():''; }
function storageKey(sid){return STAGE_KEY+safeId(sid||'nosid');}
function loadState(sid){
  var out={sid:String(sid||''),shots:{}};
  try{var x=JSON.parse(sessionStorage.getItem(storageKey(sid))||'null');if(x&&x.shots)out=x;}catch(e){}
  return out;
}
function saveState(sid,state){try{sessionStorage.setItem(storageKey(sid),JSON.stringify(state));}catch(e){}}
function clearState(sid){try{sessionStorage.removeItem(storageKey(sid));}catch(e){} delete pending[String(sid||'')];}
function encodeCanvas(img,maxW,quality){
  var scale=Math.min(1,maxW/img.naturalWidth),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
  var c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
  return {data:c.toDataURL('image/jpeg',quality),width:w,height:h};
}
function blobToJpegData(blob){
  return new Promise(function(resolve,reject){
    var img=new Image(),u=URL.createObjectURL(blob);
    img.onload=function(){
      try{
        var out=encodeCanvas(img,480,0.40);
        if(out.data.length>185000) out=encodeCanvas(img,380,0.32);
        URL.revokeObjectURL(u);
        if(out.data.length>210000) return reject(new Error('snapshot_too_large'));
        resolve(out);
      }catch(e){URL.revokeObjectURL(u);reject(e);}
    };
    img.onerror=function(){URL.revokeObjectURL(u);reject(new Error('snapshot_decode'));};
    img.src=u;
  });
}
async function grabShot(stage,meta){
  var c=cfg(meta); if(!c) throw new Error('cctv_branch_not_configured');
  var res=await fetch(frameUrl(meta),{cache:'no-store'});
  if(!res.ok) throw new Error('frame_http_'+res.status);
  var out=await blobToJpegData(await res.blob());
  return {stage:stage,camera:c.camera,stream:c.stream,capturedAtMs:Number(meta&&meta.atMs)||Date.now(),width:out.width,height:out.height,jpegData:out.data};
}
function captureStage(stage,meta){
  try{
    stage=String(stage||'');meta=meta||{};
    if(!STAGES[stage]) return Promise.resolve(false);
    var sid=String(meta.sid||meta.cartSid||'');
    if(!sid) return Promise.resolve(false);
    var state=loadState(sid);
    if(state.shots&&state.shots[stage]) return Promise.resolve(true);
    pending[sid]=pending[sid]||{};
    if(pending[sid][stage]) return pending[sid][stage];
    var p=grabShot(stage,meta).then(function(shot){
      var s=loadState(sid);s.sid=sid;s.branch=meta.branch||s.branch||'';s.shots=s.shots||{};
      if(!s.shots[stage])s.shots[stage]=shot;saveState(sid,s);return true;
    }).catch(function(e){try{console.warn('CCTV stage '+stage+' skipped',e&&e.message||e);}catch(_){}return false;})
      .finally(function(){if(pending[sid])delete pending[sid][stage];});
    pending[sid][stage]=p;return p;
  }catch(e){return Promise.resolve(false);}
}
async function waitPending(sid){
  try{var a=Object.keys((pending[sid]||{})).map(function(k){return pending[sid][k];});if(a.length)await Promise.allSettled(a);}catch(e){}
}
function publicShot(shot){return shot?{stage:shot.stage,camera:shot.camera,stream:shot.stream,capturedAtMs:shot.capturedAtMs,width:shot.width,height:shot.height,jpegData:shot.jpegData}:null;}
async function writeInvoiceDoc(meta,shots){
  if(typeof db==='undefined'||!meta||!meta.invoiceCode)return false;
  var preferred=shots.after_save||shots.saving||shots.payment||shots.first_item||null;
  var c=cfg(meta); if(!c)return false;
  var doc={invoiceCode:String(meta.invoiceCode),invoiceNo:meta.invoiceNo||'',saleId:meta.saleId||'',branch:meta.branch||'',camera:c.camera,stream:c.stream,version:467,shots:{}};
  Object.keys(shots||{}).forEach(function(k){if(STAGES[k]&&shots[k])doc.shots[k]=publicShot(shots[k]);});
  if(preferred){doc.capturedAtMs=preferred.capturedAtMs;doc.width=preferred.width;doc.height=preferred.height;doc.jpegData=preferred.jpegData;doc.stage=preferred.stage;}
  await db.collection(SHOT_COL).doc(String(meta.invoiceCode)).set(doc,{merge:true});
  return true;
}
async function finalizeInvoice(meta){
  try{
    meta=meta||{};var sid=String(meta.sid||meta.cartSid||'');
    if(!sid||!meta.invoiceCode||typeof db==='undefined')return false;
    await waitPending(sid);
    var state=loadState(sid),shots=state.shots||{};
    await writeInvoiceDoc(meta,shots);
    // After-save is deliberately a little later so it catches hand-over/receipt moment.
    setTimeout(function(){
      grabShot('after_save',{atMs:Date.now(),branch:meta.branch||''}).then(async function(shot){
        try{
          var one={};one.after_save=shot;
          var payload={version:467,capturedAtMs:shot.capturedAtMs,width:shot.width,height:shot.height,jpegData:shot.jpegData,stage:'after_save'};
          payload['shots.after_save']=publicShot(shot);
          await db.collection(SHOT_COL).doc(String(meta.invoiceCode)).update(payload);
        }catch(e){try{console.warn('CCTV after-save write skipped',e&&e.message||e);}catch(_){}}
      }).catch(function(e){try{console.warn('CCTV after-save skipped',e&&e.message||e);}catch(_){}});
    },1500);
    clearState(sid);
    return true;
  }catch(e){try{console.warn('CCTV invoice finalize skipped',e&&e.message||e);}catch(_){}return false;}
}
// Legacy one-shot API remains for compatibility; stores as after_save if called directly.
async function snapshot(meta){
  try{meta=meta||{};if(!meta.invoiceCode||typeof db==='undefined')return false;var shot=await grabShot('after_save',meta);var shots={after_save:shot};return await writeInvoiceDoc(meta,shots);}catch(e){try{console.warn('CCTV invoice snapshot skipped',e&&e.message||e);}catch(_){}return false;}
}
function postAgent(payload,meta){
  var body=JSON.stringify(payload),opt={method:'POST',headers:{'Content-Type':'application/json'},body:body,cache:'no-store'};
  var c=cfg(meta);
  return fetch(LOCAL_AGENT,opt).catch(function(){
    if(!c||!c.remote) throw new Error('remote_agent_not_configured');
    return fetch(c.remote+'/echarpe-events/event',opt);
  });
}
async function registerEvent(meta){
  try{
    if(!meta||!meta.eventId||!meta.atMs||typeof db==='undefined')return false;
    var c=cfg(meta); if(!c)return false;
    var id=safeId(meta.eventId),view=c.remote?(c.remote+'/echarpe-events/view?id='+encodeURIComponent(id)):'';
    var doc={eventId:id,type:meta.type||'event',branch:meta.branch||'',camera:c.camera,stream:c.stream,atMs:Number(meta.atMs)||Date.now(),beforeSec:30,afterSec:30,invoiceCode:meta.invoiceCode||'',invoiceNo:meta.invoiceNo||'',sid:meta.sid||'',employeeId:meta.employeeId||'',employeeName:meta.employeeName||'',viewerUrl:view,storage:'branch_local',version:467};
    db.collection(EVENT_COL).doc(id).set(doc,{merge:true}).catch(function(){});
    postAgent({id:id,type:doc.type,invoiceCode:doc.invoiceCode,branch:doc.branch,atMs:doc.atMs},meta).catch(function(){});
    return true;
  }catch(e){try{console.warn('CCTV event skipped',e&&e.message||e);}catch(_){}return false;}
}
function invoiceEvidence(meta){
  try{
    if(!meta||!meta.invoiceCode)return false;
    finalizeInvoice(meta);
    registerEvent({eventId:meta.eventId||invoiceEventId(meta.invoiceCode),type:'sale_saved',branch:meta.branch||'',atMs:Number(meta.atMs)||Date.now(),invoiceCode:meta.invoiceCode,invoiceNo:meta.invoiceNo||'',sid:meta.sid||meta.cartSid||'',employeeId:meta.employeeId||'',employeeName:meta.employeeName||''});
    return true;
  }catch(e){return false;}
}
function activityEvidence(meta){
  try{if(!meta||!HOT[meta.type])return false;var id=meta.eventId||activityEventId(meta.type,meta.atMs,meta.sid);if(!id)return false;registerEvent({eventId:id,type:meta.type,branch:meta.branch||'',atMs:Number(meta.atMs)||Date.now(),invoiceCode:meta.invoiceCode||'',sid:meta.sid||'',employeeId:meta.employeeId||'',employeeName:meta.employeeName||''});return true;}catch(e){return false;}
}
window.cctvCaptureInvoiceStage=captureStage;
window.cctvFinalizeInvoiceSnapshots=finalizeInvoice;
window.cctvResetInvoiceEvidence=clearState;
window.cctvCaptureInvoiceSnapshot=snapshot;
window.cctvCaptureInvoiceEvidence=invoiceEvidence;
window.cctvCaptureActivityEvent=activityEvidence;
window.cctvInvoiceEventId=invoiceEventId;
window.cctvActivityEventId=activityEventId;
window.cctvIsHotActivity=function(type){return !!HOT[type];};
})();
