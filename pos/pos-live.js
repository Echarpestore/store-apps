/* 🔴 POS Live v408 — read-only live state for Office.
   No screenshots, no customer phone/name, no remote-control channel.
   Writes only when visible state changes + a slow heartbeat. */
(function(){
  'use strict';
  var timer=null, lastJson='', stopped=false;
  function safeEmployee(){ try{return (currentEmployee&&currentEmployee.name)||'';}catch(e){return '';} }
  function safeBranch(){ try{return currentBranch||'';}catch(e){return '';} }
  function snapshot(){
    var rows=[]; try{ rows=(cart||[]).filter(function(x){return !x.isRedemption;}).map(function(x){return {
      name:String(x.name||''), barcode:String(x.barcode||''), qty:Number(x.qty||0), price:Number(x.price||0), isReturn:!!x.isReturn
    };}); }catch(e){}
    var total=rows.reduce(function(n,x){return n+(x.isReturn?-1:1)*Math.abs(x.price*x.qty);},0);
    var pays=[]; try{
      Array.from(selectedPayMethods||[]).forEach(function(m){
        if(m==='visa'){
          (cardLegs||[]).filter(function(l){return l.status!=='failed';}).forEach(function(l){pays.push({method:'visa',amount:Math.abs(Number(l.amount||0)),status:String(l.status||''),seq:Number(l.seq||0)});});
        }else pays.push({method:String(m),amount:Math.abs(Number((paymentAmounts||{})[m]||0)),status:'entered'});
      });
    }catch(e){}
    return {branch:safeBranch(), employee:safeEmployee(), cart:rows, total:+total.toFixed(2), payments:pays};
  }
  function publish(force){
    if(stopped || typeof db==='undefined') return;
    var s=snapshot(); if(!s.branch) return;
    var json=JSON.stringify(s); if(!force && json===lastJson) return; lastJson=json;
    s.updatedAtMs=Date.now(); s.online=true;
    try{ db.collection('office_pos_live').doc(s.branch).set(s,{merge:true}).catch(function(e){console.warn('pos live',e);}); }catch(e){}
  }
  window.posLivePublish=function(){ clearTimeout(timer); timer=setTimeout(function(){publish(false);},350); };
  window.posLiveHeartbeat=function(){ publish(true); };
  window.addEventListener('pagehide',function(){ stopped=true; });
  setInterval(function(){ if(!document.hidden) publish(true); },30000);
  document.addEventListener('visibilitychange',function(){ if(!document.hidden){stopped=false;publish(true);} });
  setTimeout(function(){publish(true);},1500);
})();
