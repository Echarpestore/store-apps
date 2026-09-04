/* ECHARPE synchronized basket timeline v507.
   Cart changes stay local while the sale is open, then one idempotent document
   is written per invoice. This avoids a Firestore write/read for every scan and
   lets Office rebuild the basket at any video time. */
(function(){
  'use strict';
  var COL='pos_cctv_invoice_timelines';
  var ACTIVE='echarpe.cctv.timeline.active.v506.';
  var QUEUE='echarpe.cctv.timeline.queue.v506';
  var MAX_EVENTS=240,MAX_ROWS=100;
  function safe(v,n){return String(v==null?'':v).slice(0,n||160);}
  function sidKey(sid){return ACTIVE+safe(sid,140).replace(/[^A-Za-z0-9._-]/g,'_');}
  function load(sid){try{var x=JSON.parse(localStorage.getItem(sidKey(sid))||'null');return x&&x.sid?x:null;}catch(e){return null;}}
  function save(s){try{localStorage.setItem(sidKey(s.sid),JSON.stringify(s));return true;}catch(e){return false;}}
  function drop(sid){try{localStorage.removeItem(sidKey(sid));}catch(e){}}
  function queueLoad(){try{var q=JSON.parse(localStorage.getItem(QUEUE)||'{}');return q&&typeof q==='object'?q:{};}catch(e){return {};}}
  function queueSave(q){try{localStorage.setItem(QUEUE,JSON.stringify(q));}catch(e){}}
  function rowsOf(input){
    return (Array.isArray(input)?input:[]).filter(function(x){return x&&!x.isRedemption;}).slice(0,MAX_ROWS).map(function(x){return {id:safe(x.id||x.barcode||x.name,100),name:safe(x.name||x.code||'صنف',120),barcode:safe(x.barcode||'',80),qty:Number(x.qty||0),price:Number(x.price||0),isReturn:!!x.isReturn};});
  }
  function lineKey(row,seen){var base=safe(row.id||row.barcode||row.name||'item',100)||'item';seen[base]=(seen[base]||0)+1;return base+'#'+seen[base];}
  function compactCart(s,rows){
    var seen={};return rows.map(function(r){var key=lineKey(r,seen);if(!s.catalog[key])s.catalog[key]={name:r.name,barcode:r.barcode,id:r.id};return [key,Number(r.qty)||0,Number(r.price)||0,r.isReturn?1:0];});
  }
  function totalOf(rows){return +rows.reduce(function(n,r){return n+Number(r.price||0)*Number(r.qty||0);},0).toFixed(2);}
  function stateHash(cart){return JSON.stringify(cart);}
  function classify(prev,next){
    if(!prev||!prev.length)return 'item_added';if(next.length>prev.length)return 'item_added';if(next.length<prev.length)return 'item_removed';
    var pq=prev.reduce(function(n,x){return n+Number(x[1]||0);},0),nq=next.reduce(function(n,x){return n+Number(x[1]||0);},0);
    if(nq>pq)return 'qty_increased';if(nq<pq)return 'qty_decreased';return 'cart_edited';
  }
  function newState(meta,sid,at){return {version:507,sid:sid,branch:safe(meta.branch||'',100),startedAtMs:Number(meta.firstItemAt)||at,catalog:{},events:[],lastHash:'',lastCart:[]};}
  function observe(meta){
    try{
      meta=meta||{};var sid=safe(meta.sid||meta.cartSid||(typeof _cartSid!=='undefined'&&_cartSid)||'',140);if(!sid)return false;
      var at=Number(meta.atMs)||Date.now(),s=load(sid)||newState(meta,sid,at);if(meta.branch&&!s.branch)s.branch=safe(meta.branch,100);
      var rows=rowsOf(meta.cart||(typeof cart!=='undefined'?cart:[])),packed=compactCart(s,rows),hash=stateHash(packed);if(hash===s.lastHash&&!meta.force)return false;
      var kind=s.events.length?classify(s.lastCart,packed):(meta.kind||'item_added');
      s.events.push({seq:s.events.length+1,atMs:at,kind:safe(meta.kind||kind,40),cart:packed,total:totalOf(rows)});
      if(s.events.length>MAX_EVENTS)s.events.splice(1,s.events.length-MAX_EVENTS);
      s.lastHash=hash;s.lastCart=packed;save(s);return true;
    }catch(e){return false;}
  }
  function writeDoc(doc){
    if(typeof db==='undefined'||!db)return Promise.reject(new Error('timeline_db_unavailable'));
    return db.collection(COL).doc(String(doc.invoiceCode)).set(doc,{merge:true});
  }
  function writeSnapshotFallback(doc){
    if(typeof db==='undefined'||!db)return Promise.reject(new Error('timeline_db_unavailable'));
    return db.collection('pos_cctv_invoice_snapshots').doc(String(doc.invoiceCode)).set({basketTimeline:doc,timelineFallback:true},{merge:true});
  }
  function enqueue(doc){var q=queueLoad();q[String(doc.invoiceCode)]=doc;var keys=Object.keys(q).sort(function(a,b){return Number(q[a].endedAtMs||0)-Number(q[b].endedAtMs||0);});while(keys.length>80){delete q[keys.shift()];}queueSave(q);}
  function flush(){
    var q=queueLoad(),keys=Object.keys(q),chain=Promise.resolve();keys.forEach(function(k){chain=chain.then(function(){return writeDoc(q[k]).catch(function(){return writeSnapshotFallback(q[k]);}).then(function(){var latest=queueLoad();delete latest[k];queueSave(latest);}).catch(function(){});});});return chain;
  }
  function finalize(meta){
    try{
      meta=meta||{};var sid=safe(meta.sid||meta.cartSid||(typeof _cartSid!=='undefined'&&_cartSid)||'',140),code=safe(meta.invoiceCode||'',140);if(!sid||!code)return Promise.resolve(false);
      var liveCart=Array.isArray(meta.cart)?meta.cart:((typeof cart!=='undefined'&&Array.isArray(cart))?cart:null);
      if(liveCart)observe({sid:sid,branch:meta.branch,cart:liveCart,atMs:Number(meta.atMs)||Date.now()});
      var s=load(sid);if(!s)return Promise.resolve(false);var end=Number(meta.atMs)||Date.now();
      s.events.push({seq:s.events.length+1,atMs:end,kind:'sale_saved',cart:s.lastCart||[],total:Number(meta.total)||Number((s.events[s.events.length-1]||{}).total)||0});
      var doc={version:507,invoiceCode:code,invoiceNo:safe(meta.invoiceNo||'',80),saleId:safe(meta.saleId||'',140),sid:sid,branch:safe(meta.branch||s.branch||'',100),startedAtMs:Number(s.startedAtMs)||end,endedAtMs:end,clipStartAtMs:Math.max(1,(Number(s.startedAtMs)||end)-5000),clipEndAtMs:end+10000,catalog:s.catalog||{},events:s.events||[],eventCount:(s.events||[]).length,storage:'one_doc_per_invoice'};
      enqueue(doc);drop(sid);return writeDoc(doc).then(function(){var q=queueLoad();delete q[code];queueSave(q);return true;}).catch(function(){
        return writeSnapshotFallback(doc).then(function(){var q=queueLoad();delete q[code];queueSave(q);return true;}).catch(function(){return false;});
      });
    }catch(e){return Promise.resolve(false);}
  }
  window.cctvBasketTimelineObserve=observe;
  window.cctvFinalizeBasketTimeline=finalize;
  window.cctvFlushBasketTimelines=flush;
  window.addEventListener('online',function(){flush();});
  setTimeout(function(){flush();},2500);
})();
