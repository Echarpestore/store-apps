/* 🔴 POS Live v436 — low-cost operational live state for Office.
   - Current cart/payment state is merged into one document per branch.
   - Daily branch KPIs are updated only after a sale is actually saved.
   - KPI update is idempotent per invoiceCode (transaction + countedSaleIds).
   - Failed/offline KPI updates are queued locally and retried later.
   - No screenshots, customer phone/name, or remote-control channel. */
(function(){
  'use strict';

  var timer=null, lastJson='', stopped=false, flushing=false;
  var HEARTBEAT_MS=5*60*1000;
  var PENDING_KEY='pos_live_pending_sales_v411';

  function safeEmployee(){ try{return (currentEmployee&&currentEmployee.name)||'';}catch(e){return '';} }
  function safeBranch(){ try{return currentBranch||'';}catch(e){return '';} }
  function round2(v){ return +(Number(v||0).toFixed(2)); }
  function cairoDayKey(ms){
    try{
      var parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms||Date.now()));
      var o={}; parts.forEach(function(p){if(p.type!=='literal')o[p.type]=p.value;});
      return String(o.year||'')+String(o.month||'')+String(o.day||'');
    }catch(e){
      var d=new Date(ms||Date.now()); return String(d.getFullYear())+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
    }
  }

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
    return {branch:safeBranch(), employee:safeEmployee(), cart:rows, total:round2(total), payments:pays};
  }

  function publish(force){
    if(stopped || typeof db==='undefined') return;
    var s=snapshot(); if(!s.branch) return;
    var json=JSON.stringify(s); if(!force && json===lastJson) return; lastJson=json;
    s.updatedAtMs=Date.now(); s.online=true;
    try{ db.collection('office_pos_live').doc(s.branch).set(s,{merge:true}).catch(function(e){console.warn('pos live',e);}); }catch(e){}
  }

  function loadPending(){
    try{ var x=JSON.parse(localStorage.getItem(PENDING_KEY)||'[]'); return Array.isArray(x)?x:[]; }catch(e){return [];}
  }
  function savePending(a){ try{ localStorage.setItem(PENDING_KEY,JSON.stringify(a.slice(-100))); }catch(e){} }
  function queueSale(ev){
    var a=loadPending(); if(!a.some(function(x){return x.invoiceCode===ev.invoiceCode;})){ a.push(ev); savePending(a); }
  }
  function removePending(code){ var a=loadPending().filter(function(x){return x.invoiceCode!==code;}); savePending(a); }

  function normalizeSale(raw){
    raw=raw||{};
    var p={}; Object.keys(raw.payments||{}).forEach(function(k){ var n=Number(raw.payments[k]||0); if(isFinite(n)&&Math.abs(n)>0.0001)p[String(k)]=round2(n); });
    return {
      branch:String(raw.branch||safeBranch()||''), invoiceCode:String(raw.invoiceCode||''), invoiceNo:String(raw.invoiceNo==null?'':raw.invoiceNo),
      total:round2(raw.total), itemCount:Number(raw.itemCount||0), payments:p,
      items:(Array.isArray(raw.items)?raw.items:[]).slice(0,40).map(function(x){return {name:String(x.name||x.code||'صنف'),code:String(x.code||x.barcode||''),qty:Number(x.qty||0),price:round2(x.price),isReturn:!!x.isReturn};}),
      seller:String(raw.seller||''), employee:String(raw.employee||safeEmployee()||''), atMs:Number(raw.atMs||Date.now())
    };
  }

  function recordSaleTxn(raw){
    if(typeof db==='undefined' || !db.runTransaction) return Promise.reject(new Error('Firestore unavailable'));
    var ev=normalizeSale(raw); if(!ev.branch||!ev.invoiceCode) return Promise.resolve(false);
    var ref=db.collection('office_pos_live').doc(ev.branch), day=cairoDayKey(ev.atMs);
    return db.runTransaction(function(tx){
      return tx.get(ref).then(function(snap){
        var d=(snap&&snap.exists?snap.data():{})||{};
        var sameDay=d.statsDayKey===day;
        var counted=sameDay && d.countedSaleIds && d.countedSaleIds[ev.invoiceCode];
        var lastSale={invoiceCode:ev.invoiceCode,invoiceNo:ev.invoiceNo,total:ev.total,itemCount:ev.itemCount,payments:ev.payments,items:ev.items,seller:ev.seller,employee:ev.employee,atMs:ev.atMs};
        if(counted) return false;
        if(d.lastSale && Number(d.lastSale.atMs||0) > Number(lastSale.atMs||0)) lastSale=d.lastSale;
        var old=sameDay?(d.stats||{}):{};
        var stats={
          netSales:round2(Number(old.netSales||0)+ev.total),
          grossSales:round2(Number(old.grossSales||0)+(ev.total>0?ev.total:0)),
          salesCount:Number(old.salesCount||0)+(ev.total>0?1:0),
          returnTotal:round2(Number(old.returnTotal||0)+(ev.total<0?Math.abs(ev.total):0)),
          returnCount:Number(old.returnCount||0)+(ev.total<0?1:0),
          invoiceCount:Number(old.invoiceCount||0)+1,
          paymentTotals:Object.assign({},old.paymentTotals||{})
        };
        Object.keys(ev.payments).forEach(function(k){ stats.paymentTotals[k]=round2(Number(stats.paymentTotals[k]||0)+Number(ev.payments[k]||0)); });
        var ids=sameDay?Object.assign({},d.countedSaleIds||{}):{}; ids[ev.invoiceCode]=1;
        tx.set(ref,{statsDayKey:day,stats:stats,countedSaleIds:ids,lastSale:lastSale,updatedAtMs:Date.now(),online:true},{merge:true});
        return true;
      });
    });
  }

  function flushPending(){
    if(flushing || typeof db==='undefined') return;
    var a=loadPending(); if(!a.length) return;
    flushing=true;
    var chain=Promise.resolve();
    a.forEach(function(ev){ chain=chain.then(function(){return recordSaleTxn(ev).then(function(){removePending(ev.invoiceCode);}).catch(function(){/* keep queued */});}); });
    chain.finally(function(){flushing=false;});
  }

  window.posLivePublish=function(){ clearTimeout(timer); timer=setTimeout(function(){publish(false);},350); };
  window.posLiveHeartbeat=function(){ publish(true); flushPending(); };
  window.posLiveRecordSale=function(raw){
    var ev=normalizeSale(raw); if(!ev.branch||!ev.invoiceCode) return Promise.resolve(false);
    queueSale(ev); // queue first: closing/reload cannot lose the KPI event
    return recordSaleTxn(ev).then(function(ok){removePending(ev.invoiceCode);return ok;}).catch(function(e){console.warn('pos live sale queued',e&&e.message||e);return false;});
  };

  window.addEventListener('pagehide',function(){ stopped=true; });
  window.addEventListener('online',function(){flushPending();publish(false);});
  setInterval(function(){ if(!document.hidden){publish(true);flushPending();} },HEARTBEAT_MS);
  document.addEventListener('visibilitychange',function(){ if(!document.hidden){stopped=false;publish(false);flushPending();} });
  setTimeout(function(){publish(true);flushPending();},1500);
})();
