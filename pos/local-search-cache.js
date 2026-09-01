// ============================================================
// local-search-cache.js — Local-first search index for POS
// ------------------------------------------------------------
// هدفه يقلل Firestore reads من شريط البحث من غير ما يغير مصدر الحقيقة:
// - Firestore يفضل Source of Truth للفواتير والعملاء.
// - IndexedDB هنا مجرد Search Index محلي خفيف لكل فرع.
// - الكتابة في شريط البحث = صفر Firestore queries.
// - مزامنة خفيفة بالخلفية + fallback أونلاين فقط عند Enter لو مفيش نتيجة.
// ============================================================
(function(root){
  'use strict';

  var DB_NAME = 'echarpe_pos_search_v1';
  var DB_VERSION = 1;
  var CUSTOMER_STORE = 'customers';
  var INVOICE_STORE = 'invoices';
  var META_STORE = 'meta';
  var MAX_BOOTSTRAP_INVOICES = 1000;
  var SYNC_EVERY_MS = 10 * 60 * 1000;
  var FULL_CUSTOMER_REFRESH_MS = 24 * 60 * 60 * 1000;
  var FULL_INVOICE_REFRESH_MS = 24 * 60 * 60 * 1000;
  var DELTA_OVERLAP_MS = 2 * 60 * 1000;
  var _dbp = null;
  var _branch = '';
  var _customerMap = new Map();
  var _invoiceMap = new Map();
  var _readyBranch = '';
  var _syncing = false;
  var _timer = null;

  function _idbAvailable(){ return typeof indexedDB !== 'undefined'; }
  function _safeBranch(v){ return String(v || '').trim(); }
  function _key(branch,id){ return _safeBranch(branch) + '|' + String(id || ''); }
  function _digits(v){ return String(v || '').replace(/\D/g,''); }
  function _normText(v){
    return String(v || '').toLowerCase()
      .replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي')
      .replace(/[ًٌٍَُِّْـ]/g,'').replace(/\s+/g,' ').trim();
  }
  function _phoneVariants(v){
    var d=_digits(v), out=[];
    function add(x){ if(x && out.indexOf(x)<0) out.push(x); }
    add(d);
    if(/^01\d{9}$/.test(d)){ add('20'+d.slice(1)); add('+20'+d.slice(1)); }
    if(/^20(1\d{9})$/.test(d)){ add('0'+d.slice(2)); add('+'+d); }
    if(/^201\d{9}$/.test(d)){ add('0'+d.slice(2)); add('+'+d); }
    return out.filter(Boolean);
  }
  function _tsMs(v){
    if(!v) return 0;
    if(typeof v === 'number') return v;
    if(v && typeof v.toMillis === 'function') return v.toMillis();
    if(v instanceof Date) return v.getTime();
    var n=Number(v); return isFinite(n)?n:0;
  }

  function _open(){
    if(!_idbAvailable()) return Promise.resolve(null);
    if(_dbp) return _dbp;
    _dbp = new Promise(function(resolve,reject){
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(){
        var d=req.result;
        if(!d.objectStoreNames.contains(CUSTOMER_STORE)){
          var cs=d.createObjectStore(CUSTOMER_STORE,{keyPath:'key'});
          cs.createIndex('branch','branch',{unique:false});
          cs.createIndex('updatedAtMs','updatedAtMs',{unique:false});
        }
        if(!d.objectStoreNames.contains(INVOICE_STORE)){
          var is=d.createObjectStore(INVOICE_STORE,{keyPath:'key'});
          is.createIndex('branch','branch',{unique:false});
          is.createIndex('createdAtMs','createdAtMs',{unique:false});
        }
        if(!d.objectStoreNames.contains(META_STORE)) d.createObjectStore(META_STORE,{keyPath:'key'});
      };
      req.onsuccess=function(){ resolve(req.result); };
      req.onerror=function(){ reject(req.error || new Error('indexeddb-open')); };
    }).catch(function(e){ console.warn('local search db',e); return null; });
    return _dbp;
  }

  async function _putMany(storeName, rows){
    if(!rows || !rows.length) return;
    var d=await _open(); if(!d) return;
    await new Promise(function(resolve,reject){
      var tx=d.transaction(storeName,'readwrite'), st=tx.objectStore(storeName);
      rows.forEach(function(r){ try{st.put(r);}catch(e){} });
      tx.oncomplete=function(){resolve();}; tx.onerror=function(){reject(tx.error);}; tx.onabort=function(){reject(tx.error);};
    });
  }
  async function _getBranch(storeName,branch){
    var d=await _open(); if(!d) return [];
    return new Promise(function(resolve,reject){
      var tx=d.transaction(storeName,'readonly'), idx=tx.objectStore(storeName).index('branch');
      var req=idx.getAll(branch);
      req.onsuccess=function(){resolve(req.result||[]);}; req.onerror=function(){reject(req.error);};
    }).catch(function(){return [];});
  }
  async function _deleteBranch(storeName,branch){
    var d=await _open(); if(!d) return;
    var rows=await _getBranch(storeName,branch); if(!rows.length) return;
    await new Promise(function(resolve,reject){
      var tx=d.transaction(storeName,'readwrite'), st=tx.objectStore(storeName);
      rows.forEach(function(r){st.delete(r.key);});
      tx.oncomplete=resolve; tx.onerror=function(){reject(tx.error);};
    });
  }
  async function _metaGet(branch){
    var d=await _open(); if(!d) return {};
    return new Promise(function(resolve){
      var tx=d.transaction(META_STORE,'readonly'), req=tx.objectStore(META_STORE).get('branch:'+branch);
      req.onsuccess=function(){resolve(req.result||{});}; req.onerror=function(){resolve({});};
    });
  }
  async function _metaSet(branch,patch){
    var d=await _open(); if(!d) return;
    var cur=await _metaGet(branch); var row=Object.assign({},cur,patch,{key:'branch:'+branch,branch:branch});
    return new Promise(function(resolve){
      var tx=d.transaction(META_STORE,'readwrite'); tx.objectStore(META_STORE).put(row);
      tx.oncomplete=resolve; tx.onerror=resolve;
    });
  }

  function _customerRow(branch,id,data){
    data=data||{};
    return {
      key:_key(branch,id), id:String(id||data.phone||''), branch:branch,
      name:String(data.name||''), phone:String(data.phone||id||''),
      phoneDigits:_digits(data.phone||id||''), nameNorm:_normText(data.name||''),
      updatedAtMs:Number(_tsMs(data.updatedAt)||data.updatedAtMs||_tsMs(data.lastVisit)||_tsMs(data.createdAt)||Date.now())
    };
  }
  function _invoiceRow(branch,id,data){
    data=data||{};
    return {
      key:_key(branch,id), id:String(id||''), branch:branch,
      invoiceNo:String(data.invoiceNo||''), invoiceCode:String(data.invoiceCode||''),
      customerPhone:String(data.customerPhone||''), customerName:String(data.customerName||''),
      phoneDigits:_digits(data.customerPhone||''), total:Number(data.total||0),
      transactionIds:(function(){
        var list=(data.cardTxns&&data.cardTxns.length)?data.cardTxns:(data.cardTxn?[data.cardTxn]:[]), out=[];
        (data.bankTransactionIds||[]).concat(list.map(function(x){return x&&x.transactionId;})).forEach(function(v){
          var x=String(v==null?'':v).trim(); if(x && out.indexOf(x)<0) out.push(x);
        });
        return out;
      })(),
      createdAtMs:Number(_tsMs(data.createdAt)||data.createdAtMs||0), reversed:!!data.reversed
    };
  }
  function _toPublicCustomer(r){ return {id:r.id,name:r.name,phone:r.phone,branch:r.branch}; }
  function _toPublicInvoice(r){ return {id:r.id,invoiceNo:r.invoiceNo,invoiceCode:r.invoiceCode,customerPhone:r.customerPhone,customerName:r.customerName,total:r.total,transactionIds:r.transactionIds||[],createdAtMs:r.createdAtMs,reversed:r.reversed,branch:r.branch}; }

  async function ensureBranch(branch){
    branch=_safeBranch(branch); if(!branch) return;
    if(_readyBranch===branch) return;
    _branch=branch; _customerMap=new Map(); _invoiceMap=new Map();
    var pair=await Promise.all([_getBranch(CUSTOMER_STORE,branch),_getBranch(INVOICE_STORE,branch)]);
    pair[0].forEach(function(r){_customerMap.set(r.id,r);});
    pair[1].forEach(function(r){_invoiceMap.set(r.id,r);});
    _readyBranch=branch;
    _schedule();
    // sync في الخلفية فقط؛ البحث ما يستناش السيرفر.
    setTimeout(function(){ syncNow({branch:branch}).catch(function(){}); },50);
  }

  function searchCustomers(q,max){
    max=Math.max(1,Number(max)||15); q=String(q||'').trim(); if(!q) return [];
    var d=_digits(q), nq=_normText(q), pvs=_phoneVariants(d), out=[];
    _customerMap.forEach(function(r){
      if(out.length>=max) return;
      var ok=false;
      if(d.length>=3){ ok=pvs.some(function(p){return r.phoneDigits===_digits(p) || r.phoneDigits.indexOf(d)>=0;}); }
      else{ var toks=nq.split(' ').filter(Boolean); ok=toks.length>0 && toks.every(function(t){return r.nameNorm.indexOf(t)>=0;}); }
      if(ok) out.push(_toPublicCustomer(r));
    });
    return out.slice(0,max);
  }
  function searchInvoices(q,max){
    max=Math.max(1,Number(max)||15); q=String(q||'').trim(); if(!q) return [];
    var qu=q.toUpperCase(), d=_digits(q), pvs=_phoneVariants(d), out=[];
    _invoiceMap.forEach(function(r){
      if(out.length>=max) return;
      var exactNo=String(r.invoiceNo||'').toUpperCase()===qu || String(r.invoiceCode||'').toUpperCase()===qu;
      var phone=d.length>=6 && pvs.some(function(p){return r.phoneDigits===_digits(p);});
      var txn=(r.transactionIds||[]).some(function(x){return String(x).toUpperCase()===qu;});
      if(exactNo||phone||txn) out.push(_toPublicInvoice(r));
    });
    out.sort(function(a,b){return Number(b.createdAtMs||0)-Number(a.createdAtMs||0);});
    return out.slice(0,max);
  }

  async function upsertCustomer(data,branch){
    branch=_safeBranch(branch||_branch||(typeof currentBranch!=='undefined'?currentBranch:'')); if(!branch||!data) return;
    var id=String(data.id||data.phone||''); if(!id)return;
    var row=_customerRow(branch,id,data); _customerMap.set(row.id,row); await _putMany(CUSTOMER_STORE,[row]);
  }
  async function upsertInvoice(data,branch){
    branch=_safeBranch(branch||_branch||(typeof currentBranch!=='undefined'?currentBranch:'')); if(!branch||!data)return;
    var id=String(data.id||data.clientSaleId||''); if(!id)return;
    var row=_invoiceRow(branch,id,data); _invoiceMap.set(row.id,row); await _putMany(INVOICE_STORE,[row]);
  }

  async function _serverBootstrapCustomers(branch){
    if(typeof db==='undefined' || typeof TEST_CUSTOMERS==='undefined') return 0;
    var snap=await db.collection(TEST_CUSTOMERS).where('branch','==',branch).get();
    var rows=snap.docs.map(function(d){return _customerRow(branch,d.id,d.data());});
    // Merge فقط: ما نمسحش local rows عشان عميل/تعديل queued أوفلاين ما يختفيش من البحث.
    await _putMany(CUSTOMER_STORE,rows);
    if(_readyBranch===branch){rows.forEach(function(r){_customerMap.set(r.id,r);});}
    var maxMs=rows.reduce(function(m,r){return Math.max(m,Number(r.updatedAtMs)||0);},0);
    await _metaSet(branch,{customersBootstrapped:true,customersFullAt:Date.now(),customersDeltaAt:Date.now(),customerCursorServerMs:maxMs||Date.now()});
    return rows.length;
  }
  async function _serverBootstrapInvoices(branch){
    if(typeof db==='undefined' || typeof TEST_SALES==='undefined') return 0;
    var snap;
    try{
      snap=await db.collection(TEST_SALES).where('branch','==',branch).orderBy('createdAtMs','desc').limit(MAX_BOOTSTRAP_INVOICES).get();
    }catch(e){
      try{ snap=await db.collection(TEST_SALES).where('branch','==',branch).limit(MAX_BOOTSTRAP_INVOICES).get(); }
      catch(e2){ return 0; }
    }
    var rows=snap.docs.map(function(d){return _invoiceRow(branch,d.id,d.data());});
    // Merge فقط: الفاتورة الأوفلاين المحلية تفضل ظاهرة لحد ما السيرفر يؤكدها.
    await _putMany(INVOICE_STORE,rows);
    if(_readyBranch===branch){rows.forEach(function(r){_invoiceMap.set(r.id,r);});}
    var maxMs=rows.reduce(function(m,r){return Math.max(m,Number(r.createdAtMs)||0);},0);
    await _metaSet(branch,{invoicesBootstrapped:true,invoicesFullAt:Date.now(),invoiceCursorServerMs:maxMs||Date.now()});
    return rows.length;
  }
  async function _deltaCustomers(branch,meta){
    if(typeof db==='undefined'||typeof TEST_CUSTOMERS==='undefined')return 0;
    var from=Math.max(0,Number(meta.customerCursorServerMs||meta.customersDeltaAt||0)-DELTA_OVERLAP_MS);
    if(!from)return 0;
    var snap;
    try{snap=await db.collection(TEST_CUSTOMERS).where('updatedAt','>',new Date(from)).orderBy('updatedAt').limit(500).get();}
    catch(e){return 0;}
    var rows=[], maxMs=Number(meta.customerCursorServerMs||0);
    snap.docs.forEach(function(d){var x=d.data()||{};maxMs=Math.max(maxMs,_tsMs(x.updatedAt));if(x.branch===branch)rows.push(_customerRow(branch,d.id,x));});
    await _putMany(CUSTOMER_STORE,rows); rows.forEach(function(r){if(_readyBranch===branch)_customerMap.set(r.id,r);});
    await _metaSet(branch,{customersDeltaAt:Date.now(),customerCursorServerMs:maxMs||Date.now()}); return rows.length;
  }
  async function _deltaInvoices(branch,meta){
    if(typeof db==='undefined'||typeof TEST_SALES==='undefined')return 0;
    var from=Math.max(0,Number(meta.invoiceCursorServerMs||0)-DELTA_OVERLAP_MS); if(!from)return 0;
    var snap;
    try{snap=await db.collection(TEST_SALES).where('createdAt','>',new Date(from)).orderBy('createdAt').limit(500).get();}
    catch(e){return 0;}
    var rows=[], maxMs=Number(meta.invoiceCursorServerMs||0);
    snap.docs.forEach(function(d){var x=d.data()||{};maxMs=Math.max(maxMs,_tsMs(x.createdAt));if(x.branch===branch)rows.push(_invoiceRow(branch,d.id,x));});
    await _putMany(INVOICE_STORE,rows); rows.forEach(function(r){if(_readyBranch===branch)_invoiceMap.set(r.id,r);});
    await _metaSet(branch,{invoiceCursorServerMs:maxMs||Date.now()}); return rows.length;
  }

  async function syncNow(opts){
    opts=opts||{}; var branch=_safeBranch(opts.branch||_branch||(typeof currentBranch!=='undefined'?currentBranch:''));
    if(!branch||_syncing||typeof navigator!=='undefined'&&navigator.onLine===false)return {ok:false,skipped:true};
    _syncing=true;
    try{
      await ensureBranch(branch);
      var meta=await _metaGet(branch), now=Date.now();
      if(!meta.customersBootstrapped || (now-Number(meta.customersFullAt||0))>FULL_CUSTOMER_REFRESH_MS) await _serverBootstrapCustomers(branch);
      else await _deltaCustomers(branch,meta);
      meta=await _metaGet(branch);
      if(!meta.invoicesBootstrapped || (now-Number(meta.invoicesFullAt||0))>FULL_INVOICE_REFRESH_MS) await _serverBootstrapInvoices(branch);
      else await _deltaInvoices(branch,meta);
      await _metaSet(branch,{lastSyncAt:Date.now()});
      return {ok:true,customers:_customerMap.size,invoices:_invoiceMap.size};
    }catch(e){console.warn('local search sync',e);return {ok:false,error:e};}
    finally{_syncing=false;}
  }

  async function remoteFallback(q,max){
    // لا تُستخدم أثناء الكتابة؛ search.js يناديها فقط عند Enter وعدم وجود نتيجة محلية.
    max=Math.max(1,Number(max)||15); var branch=_safeBranch(_branch||(typeof currentBranch!=='undefined'?currentBranch:''));
    if(!branch||typeof db==='undefined'||typeof navigator!=='undefined'&&navigator.onLine===false)return {customers:[],invoices:[]};
    var digits=_digits(q), vars=_phoneVariants(digits), custJobs=[], invJobs=[];
    if(vars.length){
      vars.forEach(function(v){
        custJobs.push(db.collection(TEST_CUSTOMERS).where('branch','==',branch).where('phone','==',v).limit(max).get().catch(function(){return null;}));
        invJobs.push(db.collection(TEST_SALES).where('branch','==',branch).where('customerPhone','==',v).limit(max).get().catch(function(){return null;}));
      });
    }
    invJobs.push(db.collection(TEST_SALES).where('branch','==',branch).where('invoiceNo','==',String(q||'').toUpperCase()).limit(max).get().catch(function(){return null;}));
    // 💳 v432: بحث مستهدف برقم عملية البنك/Paymob. الفواتير الجديدة لها index بسيط
    // bankTransactionIds؛ والفواتير القديمة ندعم أول cardTxn بدون مسح تاريخ المبيعات كله.
    var txnQ=String(q||'').trim();
    if(txnQ.length>=4){
      invJobs.push(db.collection(TEST_SALES).where('branch','==',branch).where('bankTransactionIds','array-contains',txnQ).limit(max).get().catch(function(){return null;}));
      invJobs.push(db.collection(TEST_SALES).where('branch','==',branch).where('cardTxn.transactionId','==',txnQ).limit(max).get().catch(function(){return null;}));
      if(/^\d+$/.test(txnQ)){
        var txnN=Number(txnQ);
        if(isFinite(txnN)) invJobs.push(db.collection(TEST_SALES).where('branch','==',branch).where('cardTxn.transactionId','==',txnN).limit(max).get().catch(function(){return null;}));
      }
    }
    var pair=await Promise.all([Promise.all(custJobs),Promise.all(invJobs)]), customers=[],invoices=[],seenC=new Set(),seenI=new Set();
    pair[0].forEach(function(s){if(!s)return;s.docs.forEach(function(d){if(seenC.has(d.id))return;seenC.add(d.id);var x=d.data();customers.push({id:d.id,...x});upsertCustomer({id:d.id,...x},branch).catch(function(){});});});
    pair[1].forEach(function(s){if(!s)return;s.docs.forEach(function(d){if(seenI.has(d.id))return;seenI.add(d.id);var x=d.data();invoices.push({id:d.id,...x});upsertInvoice({id:d.id,...x},branch).catch(function(){});});});
    return {customers:customers.slice(0,max),invoices:invoices.slice(0,max)};
  }

  function _schedule(){
    if(_timer) clearInterval(_timer);
    _timer=setInterval(function(){ if(typeof navigator==='undefined'||navigator.onLine!==false) syncNow().catch(function(){}); },SYNC_EVERY_MS);
  }
  if(typeof window!=='undefined'){
    window.addEventListener('online',function(){setTimeout(function(){syncNow().catch(function(){});},1000);});
    // Warm-up بعد فتح الـPOS: يحمل الموجود محليًا فورًا ويبدأ sync في الخلفية.
    setTimeout(function(){
      try{ if(typeof currentBranch!=='undefined' && currentBranch) ensureBranch(currentBranch).catch(function(){}); }catch(e){}
    },1200);
  }

  var API={ensureBranch:ensureBranch,searchCustomers:searchCustomers,searchInvoices:searchInvoices,upsertCustomer:upsertCustomer,upsertInvoice:upsertInvoice,syncNow:syncNow,remoteFallback:remoteFallback,_phoneVariants:_phoneVariants,_normText:_normText};
  root.POSLocalSearchCache=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
