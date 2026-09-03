/* ECHARPE POS customer-presence correlation v476
   ------------------------------------------------------------
   Madinaty only for now:
   - Reads local branch-PC Presence Agent (camera7/camera8 customer area).
   - NEVER flags anything when the agent is unavailable/stale.
   - sale saved + no observed customer presence => suspicious activity.
   - observed customer session ends + no sale => suspicious activity.
   - Normal presence is kept local; no Firestore write per movement (cost control).
*/
(function(){
'use strict';

var VERSION=476;
var URL='http://127.0.0.1:1985/echarpe-presence/status';
var POLL_MS=2500, STALE_MS=12000, NO_SALE_GRACE_MS=90000;
var SALE_BEFORE_MS=30000, SALE_AFTER_MS=90000, MIN_SESSION_MS=8000;
var SALES_KEY='echarpe.cctv.presence.sales.v476';
var DONE_KEY='echarpe.cctv.presence.done.v476';
var monitorStartedAt=Date.now(), timer=0, lastStatus=null, lastOkAt=0;
var observed={}, metrics={};

function branchId(){
  var s=String((typeof currentBranch!=='undefined'&&currentBranch)||'').toLowerCase();
  return (s.indexOf('مدينتي')>=0||s.indexOf('madinaty')>=0)?'madinaty':'';
}
function read(key, fallback){try{var x=JSON.parse(localStorage.getItem(key)||'null');return x==null?fallback:x;}catch(e){return fallback;}}
function write(key, value){try{localStorage.setItem(key,JSON.stringify(value));}catch(e){}}
function cleanOldSales(rows){
  var cut=Date.now()-12*60*60*1000;
  return (rows||[]).filter(function(x){return x&&Number(x.atMs)>=cut;}).slice(-120);
}
function sales(){return cleanOldSales(read(SALES_KEY,[]));}
function addSale(meta){
  var rows=sales(); rows.push({
    atMs:Number(meta.atMs)||Date.now(), invoiceCode:String(meta.invoiceCode||''),
    invoiceNo:String(meta.invoiceNo||''), sid:String(meta.sid||'')
  }); write(SALES_KEY,cleanOldSales(rows));
}
function doneMap(){var d=read(DONE_KEY,{}),cut=Date.now()-24*60*60*1000;Object.keys(d).forEach(function(k){if(Number(d[k])<cut)delete d[k];});return d;}
function markDone(id){var d=doneMap();d[id]=Date.now();write(DONE_KEY,d);}
function overlapSale(session, rows){
  var a=Number(session.startedAtMs)||0,b=Number(session.endedAtMs)||Number(session.lastPresenceAtMs)||Date.now();
  return (rows||sales()).find(function(x){var t=Number(x.atMs)||0;return t>=a-SALE_BEFORE_MS&&t<=b+SALE_AFTER_MS;})||null;
}
function sessionDuration(s){return Math.max(0,(Number(s.endedAtMs)||Number(s.lastPresenceAtMs)||Date.now())-(Number(s.startedAtMs)||Date.now()));}
function sessionCameras(s){return Array.isArray(s.cameras)?s.cameras.join(', '):String(s.cameras||'camera7,camera8');}
function logForSid(type,data,sid){
  try{
    if(typeof _logActivityForSid==='function') return _logActivityForSid(type,data,sid||null);
    if(typeof _logActivity==='function') return _logActivity(type,data);
  }catch(e){}
}
function currentSession(status){
  var c=status&&status.current;
  return c&&c.id&&c.active!==false?c:null;
}
function noteObserved(s){
  if(!s||!s.id)return;
  observed[s.id]=true;
  if(!metrics[s.id])metrics[s.id]={cartActions:0,removedQty:0,hadDrawerOpen:false,sid:''};
}
function processEnded(status){
  var recent=(status&&status.recent)||[], done=doneMap(), now=Date.now();
  recent.forEach(function(s){
    if(!s||!s.id||!s.endedAtMs||done[s.id])return;
    // ما نحققش في عميل حصل بالكامل وإحنا ماكناش شايفين الـPOS/agent.
    if(!observed[s.id] && Number(s.startedAtMs)<monitorStartedAt-5000)return;
    if(!observed[s.id])return;
    if(now<Number(s.endedAtMs)+NO_SALE_GRACE_MS)return;
    if(sessionDuration(s)<MIN_SESSION_MS){markDone(s.id);return;}
    var sale=overlapSale(s);
    if(sale){markDone(s.id);delete observed[s.id];delete metrics[s.id];return;}
    var m=metrics[s.id]||{};
    logForSid('customer_presence_no_sale',{
      presenceSessionId:String(s.id), presenceStartedAtMs:Number(s.startedAtMs)||0,
      presenceEndedAtMs:Number(s.endedAtMs)||0, presenceDurationMs:sessionDuration(s),
      presenceCameras:sessionCameras(s), presenceConfidence:Number(s.confidence)||0,
      hadCartActivity:!!m.cartActions, cartActions:Number(m.cartActions)||0,
      removedQty:Number(m.removedQty)||0, hadDrawerOpen:!!m.hadDrawerOpen,
      detector:'branch_local_occupancy_v476',
      __eventAtMsOverride:Number(s.endedAtMs)||Number(s.lastPresenceAtMs)||Date.now()
    },m.sid||null);
    markDone(s.id); delete observed[s.id]; delete metrics[s.id];
  });
}
async function poll(){
  try{
    if(branchId()!=='madinaty'){lastStatus=null;lastOkAt=0;return;}
    var r=await fetch(URL,{cache:'no-store',headers:{'Accept':'application/json'}});
    if(!r.ok)throw new Error('presence_http_'+r.status);
    var d=await r.json();
    if(!d||d.ok!==true||Number(d.generatedAtMs)<Date.now()-STALE_MS)throw new Error('presence_stale');
    lastStatus=d;lastOkAt=Date.now();
    var c=currentSession(d);if(c)noteObserved(c);
    processEnded(d);
  }catch(e){
    lastStatus=null;lastOkAt=0; // fail-open: CCTV outage must never create suspicion.
  }
}
function statusFresh(){return lastStatus&&lastOkAt&&Date.now()-lastOkAt<STALE_MS;}
function recentPresenceFor(atMs){
  if(!statusFresh())return null;
  var t=Number(atMs)||Date.now(), all=[];
  var c=currentSession(lastStatus);if(c)all.push(c);
  (lastStatus.recent||[]).forEach(function(x){all.push(x);});
  return all.find(function(s){
    var a=Number(s.startedAtMs)||0,b=Number(s.endedAtMs)||Number(s.lastPresenceAtMs)||Date.now();
    return sessionDuration(s)>=MIN_SESSION_MS && t>=a-SALE_BEFORE_MS && t<=b+SALE_AFTER_MS;
  })||null;
}

window.cctvPresenceRecordSale=function(meta){
  try{
    meta=meta||{}; if(branchId()!=='madinaty')return false;
    meta.atMs=Number(meta.atMs)||Date.now(); addSale(meta);
    var s=recentPresenceFor(meta.atMs);
    if(s){
      markDone(String(s.id)); // same customer session is accounted for by this sale.
      return true;
    }
    // Only flag when a healthy, fresh detector explicitly says there was no customer session.
    if(!statusFresh())return false;
    logForSid('sale_without_customer_presence',{
      invoiceCode:String(meta.invoiceCode||''), invoiceNo:String(meta.invoiceNo||''),
      total:Number(meta.total)||0, itemCount:Number(meta.itemCount)||0,
      checkedAtMs:Date.now(), presenceLookbackSec:Math.round(SALE_BEFORE_MS/1000),
      presenceCameras:'camera7, camera8', detector:'branch_local_occupancy_v476'
    },meta.sid||null);
    return false;
  }catch(e){return false;}
};

window.cctvPresenceNoteCartActivity=function(kind,data){
  try{
    if(branchId()!=='madinaty'||!statusFresh())return;
    var s=currentSession(lastStatus);if(!s)return;
    noteObserved(s);var m=metrics[s.id];
    m.sid=(data&&data.sid)||m.sid||'';
    if(kind==='drawer')m.hadDrawerOpen=true;
    else{
      m.cartActions=(Number(m.cartActions)||0)+1;
      if(kind==='remove')m.removedQty=(Number(m.removedQty)||0)+Math.max(0,Number(data&&data.qty)||0);
    }
  }catch(e){}
};

window.cctvPresenceGetStatus=function(){return statusFresh()?lastStatus:null;};
function start(){if(timer)return;poll();timer=setInterval(poll,POLL_MS);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
