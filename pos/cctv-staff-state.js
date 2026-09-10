/* ECHARPE CCTV staff-state bridge v617.
   The cashier POS is the always-on source of truth for CCTV headcount.
   Sales may still publish as a fallback, but a temporary Sales reload can no
   longer overwrite a healthy POS count with zero. */
(function(){
  'use strict';
  var ENDPOINT='http://127.0.0.1:1985/echarpe-playback/staff-state';
  var SOURCE='pos_firestore';
  var HEARTBEAT_MS=15000,RETRY_MS=10000,FALLBACK_GET_MS=30000;
  var lastError="",lastSuccessAt=0;
  var shiftRows=null,breakRows=null,unsubShift=null,unsubBreak=null;
  var activeBranch='',publishTimer=0,retryTimer=0,lastPayload=null,lastSnapshotAt=0,fallbackBusy=false;

  function branchProfile(branch){
    var s=String(branch||'').trim().toLowerCase();
    if(s.indexOf('madinaty')>=0||s.indexOf('\u0645\u062f\u064a\u0646\u062a\u064a')>=0)return {id:'madinaty'};
    if(s.indexOf('glow')>=0)return {id:'glow'};
    return null;
  }
  function stopListeners(){
    try{if(unsubShift)unsubShift();}catch(_e){}
    try{if(unsubBreak)unsubBreak();}catch(_e){}
    unsubShift=unsubBreak=null;shiftRows=breakRows=null;
  }
  function docs(snapshot){
    var out=[];if(!snapshot)return out;
    snapshot.forEach(function(d){out.push(Object.assign({id:d.id},d.data()||{}));});
    return out;
  }
  function buildPayload(){
    if(!Array.isArray(shiftRows)||!Array.isArray(breakRows))return null;
    var openIds=[],names={};
    shiftRows.forEach(function(s){
      if(!s||s.clockOutTs)return;
      var id=String(s.employeeId||'');if(!id||openIds.indexOf(id)>=0)return;
      openIds.push(id);names[id]=String(s.employeeName||'');
    });
    var breakIds=[];
    breakRows.forEach(function(b){
      if(!b||b.endTs)return;
      var id=String(b.employeeId||'');
      if(id&&openIds.indexOf(id)>=0&&breakIds.indexOf(id)<0)breakIds.push(id);
    });
    var onFloor=openIds.filter(function(id){return breakIds.indexOf(id)<0;});
    return {
      version:617,source:SOURCE,sourceHealthy:true,branch:(branchProfile(activeBranch)||{}).id||'',
      branchName:activeBranch,generatedAtMs:Date.now(),
      clockedInCount:openIds.length,openBreakCount:breakIds.length,
      activeStaffCount:onFloor.length,employeeIds:onFloor,
      employees:onFloor.map(function(id){return {id:id,name:names[id]||''};})
    };
  }
  function confirmPublished(payload){
    return fetch(ENDPOINT+'?_confirm='+Date.now(),{method:'GET',mode:'cors',cache:'no-store'})
      .then(function(r){if(!r.ok)throw new Error('confirm_http_'+r.status);return r.json();})
      .then(function(x){
        var fresh=x&&x.source==='pos_firestore'&&Number(x.generatedAtMs||0)>=Number(payload.generatedAtMs||0)-5000;
        if(fresh){lastError='';lastSuccessAt=Date.now();return true;}
        throw new Error('confirm_not_fresh');
      });
  }
  function post(payload){
    if(!payload)return Promise.resolve(false);
    lastPayload=payload;
    var body=JSON.stringify(payload);
    return fetch(ENDPOINT,{
      method:'POST',mode:'cors',cache:'no-store',
      headers:{'Content-Type':'text/plain;charset=UTF-8'},body:body,keepalive:true
    }).then(function(r){if(!r.ok)throw new Error('staff_state_http_'+r.status);return confirmPublished(payload);})
      .catch(function(firstErr){
        // Chrome/PWA can reject the CORS response even when localhost is alive.
        // A simple no-cors POST still delivers the payload to the branch-PC agent.
        return fetch(ENDPOINT,{
          method:'POST',mode:'no-cors',cache:'no-store',
          headers:{'Content-Type':'text/plain;charset=UTF-8'},body:body,keepalive:true
        }).then(function(){
          return new Promise(function(resolve){setTimeout(resolve,500);}).then(function(){return confirmPublished(payload);});
        }).catch(function(secondErr){
          lastError='publish_failed:'+String((secondErr&&secondErr.message)||(firstErr&&firstErr.message)||secondErr||firstErr||'unknown');
          return false;
        });
      });
  }
  function schedulePublish(){
    clearTimeout(publishTimer);
    publishTimer=setTimeout(function(){post(buildPayload());},150);
  }
  function retry(){
    clearTimeout(retryTimer);retryTimer=setTimeout(start,RETRY_MS);
  }
  function fallbackGet(){
    if(fallbackBusy||!activeBranch||typeof db==='undefined'||!db)return;
    fallbackBusy=true;
    Promise.all([
      db.collection('sales_shifts').where('branch','==',activeBranch).get(),
      db.collection('sales_breaks').where('branch','==',activeBranch).get()
    ]).then(function(rows){
      shiftRows=docs(rows[0]);breakRows=docs(rows[1]);lastSnapshotAt=Date.now();lastError='';schedulePublish();
    }).catch(function(e){lastError='firestore_get_'+String((e&&e.code)||e&&e.message||'failed');})
      .then(function(){fallbackBusy=false;});
  }
  function start(){
    var branch=(typeof currentBranch!=='undefined'&&currentBranch)||'';
    if(!branchProfile(branch)||typeof db==='undefined'||!db){stopListeners();activeBranch='';retry();return;}
    if(activeBranch===String(branch)&&unsubShift&&unsubBreak)return;
    stopListeners();activeBranch=String(branch);
    try{
      unsubShift=db.collection('sales_shifts').where('branch','==',activeBranch).onSnapshot(function(s){shiftRows=docs(s);lastSnapshotAt=Date.now();schedulePublish();},function(){lastError='shift_snapshot_failed';fallbackGet();});
      unsubBreak=db.collection('sales_breaks').where('branch','==',activeBranch).onSnapshot(function(s){breakRows=docs(s);lastSnapshotAt=Date.now();schedulePublish();},function(){lastError='break_snapshot_failed';fallbackGet();});
    }catch(_e){stopListeners();retry();}
  }
  setInterval(function(){
    var branch=(typeof currentBranch!=='undefined'&&currentBranch)||'';
    if(String(branch)!==activeBranch)start();
    else if(lastPayload){lastPayload.generatedAtMs=Date.now();post(lastPayload);}
    else schedulePublish();
    if(!lastSnapshotAt||Date.now()-lastSnapshotAt>FALLBACK_GET_MS)fallbackGet();
  },HEARTBEAT_MS);
  window.addEventListener('online',function(){start();if(lastPayload){lastPayload.generatedAtMs=Date.now();post(lastPayload);}});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)start();});
  if(typeof firebase!=='undefined'&&firebase.auth){firebase.auth().onAuthStateChanged(function(u){if(u)start();else stopListeners();});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.cctvStaffStateRefresh=start;
  window.cctvStaffStateStatus=function(){return {version:617,branch:activeBranch,branchId:(branchProfile(activeBranch)||{}).id||'',hasShiftRows:Array.isArray(shiftRows),hasBreakRows:Array.isArray(breakRows),lastSuccessAt:lastSuccessAt,lastError:lastError,lastSnapshotAt:lastSnapshotAt};};
  window.cctvMadinatyStaffStateRefresh=start;
  window.cctvMadinatyStaffStateStatus=window.cctvStaffStateStatus;
})();
