// ============================================================
// search.js — البحث الشامل Local-first
// ------------------------------------------------------------
// البحث أثناء الكتابة = Local only (0 Firestore queries).
// Enter فقط، ولو مفيش نتيجة محلية، يسمح fallback مستهدف للسيرفر.
// ============================================================

let globalSearchTimer = null;
const GLOBAL_SEARCH_MAX = 15;
let _globalSearchSeq = 0;

const _globalInput = document.getElementById('globalSearchInput');
_globalInput.addEventListener('input', (e)=>{
  const q = e.target.value.trim();
  clearTimeout(globalSearchTimer);
  const box = document.getElementById('globalSearchResults');
  if(!q){ box.style.display = 'none'; box.innerHTML = ''; return; }
  globalSearchTimer = setTimeout(()=> runGlobalSearch(q, { allowRemoteFallback:false }), 180);
});
_globalInput.addEventListener('keydown', (e)=>{
  if(e.key !== 'Enter') return;
  const q = e.target.value.trim();
  if(!q) return;
  e.preventDefault();
  clearTimeout(globalSearchTimer);
  runGlobalSearch(q, { allowRemoteFallback:true });
});

async function runGlobalSearch(q, opts){
  opts = opts || {};
  const seq = ++_globalSearchSeq;
  const box = document.getElementById('globalSearchResults');
  box.style.display = 'block';
  box.innerHTML = '<div style="padding:12px; color:#888; font-size:12px;">بيدوّر محليًا...</div>';

  const results = { invoices: [], customers: [], products: [] };
  const _sm = (typeof searchMatch === 'function') ? searchMatch
            : (h, qq)=> String(h||'').toLowerCase().includes(String(qq||'').toLowerCase());
  const _bp = (typeof barcodePrefix === 'function') ? barcodePrefix
            : (bc, qq)=> String(bc||'').toLowerCase().startsWith(String(qq||'').toLowerCase());

  // المنتجات موجودة في الذاكرة أصلًا — صفر reads.
  results.products = allInventory.filter(p=>
    _sm(p.name, q) || _bp(p.barcode, q)
  ).sort((a,b)=>{
    const qa = String(a.barcode||''), qb = String(b.barcode||'');
    return ((qb===q)-(qa===q)) || (qa.length - qb.length);
  }).slice(0, GLOBAL_SEARCH_MAX);

  // العملاء والفواتير من IndexedDB/local memory فقط أثناء الكتابة.
  try{
    if(window.POSLocalSearchCache){
      await window.POSLocalSearchCache.ensureBranch(currentBranch);
      results.customers = window.POSLocalSearchCache.searchCustomers(q, GLOBAL_SEARCH_MAX);
      results.invoices = window.POSLocalSearchCache.searchInvoices(q, GLOBAL_SEARCH_MAX);
    }
  }catch(e){ console.warn('local search', e); }

  // لو المستخدم ضغط Enter ومفيش عميل/فاتورة محليًا، نعمل fallback مستهدف فقط.
  // ده يحافظ على إمكانية إيجاد فاتورة قديمة جدًا خارج bootstrap المحلي بدون
  // ما كل حرف مكتوب يعمل قراءة من Firestore.
  if(opts.allowRemoteFallback && !results.customers.length && !results.invoices.length
     && q.length >= 3 && navigator.onLine !== false && window.POSLocalSearchCache){
    box.innerHTML = '<div style="padding:12px; color:#888; font-size:12px;">مش موجود محليًا — بدوّر على السيرفر مرة واحدة...</div>';
    try{
      const remote = await window.POSLocalSearchCache.remoteFallback(q, GLOBAL_SEARCH_MAX);
      if(remote){ results.customers = remote.customers || []; results.invoices = remote.invoices || []; }
    }catch(e){ console.warn('remote search fallback', e); }
  }

  if(seq !== _globalSearchSeq) return; // نتيجة بحث قديم وصلت بعد كتابة جديدة
  renderGlobalSearchResults(q, results, opts);
}

function renderGlobalSearchResults(q, results, opts){
  const box = document.getElementById('globalSearchResults');
  const totalFound = results.invoices.length + results.customers.length + results.products.length;
  if(totalFound === 0){
    const hint = (opts && opts.allowRemoteFallback)
      ? ''
      : '<div style="margin-top:6px;font-size:10px;color:#aaa;">لو بتدور على فاتورة قديمة جدًا اضغط Enter للبحث على السيرفر مرة واحدة.</div>';
    box.innerHTML = '<div style="padding:14px; color:#888; font-size:12px; text-align:center;">مفيش نتائج لـ "' + q + '"' + hint + '</div>';
    return;
  }

  let html = '';
  if(results.products.length){
    html += `<div style="padding:8px 12px; font-weight:800; font-size:11px; color:#5c7a3a; background:#f3f6ea;">📦 منتجات</div>`;
    html += results.products.map(p=> `
      <div onclick="closeGlobalSearchAnd(()=>openProductDetails('${p.id}'))" style="padding:10px 12px; border-bottom:1px solid #eee; cursor:pointer; display:flex; justify-content:space-between;">
        <span style="font-weight:700; font-size:13px;">${p.name}</span>
        <span style="color:#888; font-size:12px;">${p.price} ج.م · كمية ${p.quantity??0}</span>
      </div>`).join('');
  }
  if(results.customers.length){
    html += `<div style="padding:8px 12px; font-weight:800; font-size:11px; color:#5c7a3a; background:#f3f6ea;">👤 عملاء</div>`;
    html += results.customers.map(c=> `
      <div onclick="closeGlobalSearchAnd(()=>openCustomerProfile('${c.phone}'))" style="padding:10px 12px; border-bottom:1px solid #eee; cursor:pointer; display:flex; justify-content:space-between;">
        <span style="font-weight:700; font-size:13px;">${c.name || 'بدون اسم'}</span>
        <span style="color:#888; font-size:12px;">📞 ${c.phone}</span>
      </div>`).join('');
  }
  if(results.invoices.length){
    html += `<div style="padding:8px 12px; font-weight:800; font-size:11px; color:#5c7a3a; background:#f3f6ea;">🧾 فواتير</div>`;
    html += results.invoices.map(s=> `
      <div onclick="closeGlobalSearchAnd(()=>openInvoice('${s.id}'))" style="padding:10px 12px; border-bottom:1px solid #eee; cursor:pointer; display:flex; justify-content:space-between;">
        <span style="font-weight:700; font-size:13px;">🧾 ${s.invoiceNo || s.id.slice(-6).toUpperCase()}</span>
        <span style="color:#888; font-size:12px;">${(s.total||0).toFixed(2)} ج.م${s.transactionIds && s.transactionIds.length ? ' · 💳 TXN '+s.transactionIds.join(' / ') : ''}${s.customerPhone ? ' · 📞 '+s.customerPhone : ''}</span>
      </div>`).join('');
  }
  box.innerHTML = html;
}

function closeGlobalSearchAnd(action){
  document.getElementById('globalSearchResults').style.display = 'none';
  document.getElementById('globalSearchInput').value = '';
  action();
}

document.addEventListener('click', (e)=>{
  const box = document.getElementById('globalSearchResults');
  const input = document.getElementById('globalSearchInput');
  if(box && !box.contains(e.target) && e.target !== input){ box.style.display = 'none'; }
});
