/* ECHARPE Madinaty CCTV staff-state bridge v573.
   The cashier POS is the always-on source of truth for CCTV headcount.
   Sales may still publish as a fallback, but a temporary Sales reload can no
   longer overwrite a healthy POS count with zero. */
(function(){
  'use strict';
  var ENDPOINT='http://127.0.0.1:1985/echarpe-playback/staff-state';
  var SOURCE='pos_firestore';
  var HEARTBEAT_MS=20000,RETRY_MS=10000,FALLBACK_GET_MS=30000;
  var lastError="",lastSuccessAt=0;
  var shiftRows=null,breakRows=null,unsubShift=null,unsubBreak=null;
  var activeBranch='',publishTimer=0,retryTimer=0,lastPayload=null,lastSnapshotAt=0,fallbackBusy=false;

  function isMadinaty(branch){
    var s=String(branch||'').trim().toLowerCase();
    return s.indexOf('madinaty')>=0||s.indexOf('\u0645\u062f\u064a\u0646\u062a\u064a')>=0;
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
      version:564,source:SOURCE,sourceHealthy:true,branch:'madinaty',
      branchName:activeBranch,generatedAtMs:Date.now(),
      clockedInCount:openIds.length,openBreakCount:breakIds.length,
      activeStaffCount:onFloor.length,employeeIds:onFloor,
      employees:onFloor.map(function(id){return {id:id,name:names[id]||''};})
    };
  }
  function post(payload){
    if(!payload)return Promise.resolve(false);
    lastPayload=payload;
    return fetch(ENDPOINT,{
      method:'POST',mode:'cors',cache:'no-store',
      headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(payload),keepalive:true
    }).then(function(r){if(!r.ok)throw new Error('staff_state_http_'+r.status);lastError='';lastSuccessAt=Date.now();return true;})
      .catch(function(e){lastError=String((e&&e.message)||e||'publish_failed');return false;});
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
    if(!isMadinaty(branch)||typeof db==='undefined'||!db){stopListeners();activeBranch='';retry();return;}
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
  window.cctvMadinatyStaffStateRefresh=start;
  window.cctvMadinatyStaffStateStatus=function(){return {version:573,branch:activeBranch,hasShiftRows:Array.isArray(shiftRows),hasBreakRows:Array.isArray(breakRows),lastSuccessAt:lastSuccessAt,lastError:lastError,lastSnapshotAt:lastSnapshotAt};};
})();
