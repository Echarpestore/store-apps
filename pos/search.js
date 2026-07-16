// ============================================================
// search.js — البحث الشامل في الشاشة الرئيسية
// بيدوّر في نفس الوقت في: الفواتير، العملاء، والمنتجات، وبيوري
// النتائج مع بعض في قايمة واحدة، كل نتيجة بتودّيك لصفحتها.
// بيعتمد على العام من app.js/profiles.js: db, currentBranch, allInventory,
// TEST_SALES, TEST_CUSTOMERS, openInvoice, openCustomerProfile, openProductDetails
// ============================================================

let globalSearchTimer = null;

document.getElementById('globalSearchInput').addEventListener('input', (e)=>{
  const q = e.target.value.trim();
  clearTimeout(globalSearchTimer);
  const box = document.getElementById('globalSearchResults');
  if(!q){ box.style.display = 'none'; box.innerHTML = ''; return; }
  // Debounce بسيط عشان مانعملش قراءات كتير من قاعدة البيانات وانت لسه بتكتب
  globalSearchTimer = setTimeout(()=> runGlobalSearch(q), 300);
});

async function runGlobalSearch(q){
  const box = document.getElementById('globalSearchResults');
  box.style.display = 'block';
  box.innerHTML = '<div style="padding:12px; color:#888; font-size:12px;">بيدوّر...</div>';

  const qLower = q.toLowerCase();
  const results = { invoices: [], customers: [], products: [] };

  // 1) المنتجات (من الكاش المحلي، سريع وبدون قراءة إضافية)
  results.products = allInventory.filter(p=>
    (p.name||'').toLowerCase().includes(qLower) || (p.barcode||'').includes(q)
  ).slice(0, 5);

  // 2) العملاء (بالاسم أو رقم التليفون)
  try{
    const custSnap = await db.collection(TEST_CUSTOMERS).where('branch','==', currentBranch).get();
    results.customers = custSnap.docs.map(d=>d.data()).filter(c=>
      (c.phone||'').includes(q) || (c.name||'').toLowerCase().includes(qLower)
    ).slice(0, 5);
  }catch(e){}

  // 3) الفواتير (برقم الفاتورة — آخر 6 حروف من المعرّف — أو رقم تليفون العميل المرتبط بيها)
  try{
    const salesSnap = await db.collection(TEST_SALES).where('branch','==', currentBranch).get();
    results.invoices = salesSnap.docs
      .map(d=>({id:d.id, ...d.data()}))
      .filter(s=> s.id.slice(-6).toUpperCase().includes(q.toUpperCase()) || (s.customerPhone||'').includes(q))
      .slice(0, 5);
  }catch(e){}

  renderGlobalSearchResults(q, results);
}

function renderGlobalSearchResults(q, results){
  const box = document.getElementById('globalSearchResults');
  const totalFound = results.invoices.length + results.customers.length + results.products.length;
  if(totalFound === 0){
    box.innerHTML = '<div style="padding:14px; color:#888; font-size:12px; text-align:center;">مفيش نتائج لـ "' + q + '"</div>';
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
        <span style="font-weight:700; font-size:13px;">🧾 ${s.id.slice(-6).toUpperCase()}</span>
        <span style="color:#888; font-size:12px;">${(s.total||0).toFixed(2)} ج.م${s.customerPhone ? ' · 📞 '+s.customerPhone : ''}</span>
      </div>`).join('');
  }
  box.innerHTML = html;
}

function closeGlobalSearchAnd(action){
  document.getElementById('globalSearchResults').style.display = 'none';
  document.getElementById('globalSearchInput').value = '';
  action();
}

// إغلاق نتائج البحث لو ضغطت في أي حتة تانية بره المربع
document.addEventListener('click', (e)=>{
  const box = document.getElementById('globalSearchResults');
  const input = document.getElementById('globalSearchInput');
  if(box && !box.contains(e.target) && e.target !== input){
    box.style.display = 'none';
  }
});
