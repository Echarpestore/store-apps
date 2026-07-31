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

  const results = { invoices: [], customers: [], products: [] };
  // 🧷 حزام أمان نسخ الملفات: وقت التحديث ممكن ملف يتحمّل جديد وملف قديم للحظة —
  // لو دالة التطبيع لسه موصلتش، بنرجع للبحث الحرفي بدل ما البحث يموت خالص
  const _sm = (typeof searchMatch === 'function') ? searchMatch
            : (h, qq)=> String(h||'').toLowerCase().includes(String(qq||'').toLowerCase());
  const _bp = (typeof barcodePrefix === 'function') ? barcodePrefix
            : (bc, qq)=> String(bc||'').toLowerCase().startsWith(String(qq||'').toLowerCase());

  // 1) المنتجات (من الكاش المحلي، سريع وبدون قراءة إضافية)
  // 🔢 الكود بالبداية مش بالاحتواء — الاحتواء كان بيطلّع 533 و833 مع البحث بـ33.
  // البحث الشامل كان آخر مكان فاضل على السلوك القديم بعد إصلاح البيع والاستلام.
  // ⚠️ الترتيب قبل القص: لو قصينا الأول ممكن المطابقة التامة نفسها تتقص.
  results.products = allInventory.filter(p=>
    _sm(p.name, q) || _bp(p.barcode, q)   // 🔎 تطبيع عربي للاسم، بداية للكود
  ).sort((a,b)=>{                          // 🥇 التامة الأول ثم الأقصر (33 ← 330 ← 331)
    const qa = String(a.barcode||''), qb = String(b.barcode||'');
    return ((qb===q)-(qa===q)) || (qa.length - qb.length);
  }).slice(0, 5);

  // 📉 كارثة القراءات القديمة: كل بحثة كانت بتقرا **كل** فواتير وعملاء الفرع
  // من أول يوم (آلاف المستندات × كل ضغطة بحث) — ده كان المصدر الأول
  // لفاتورة القراءات (254 ألف/يوم). دلوقتي:
  // - العملاء: بيتقروا مرة كل 10 دقايق ويتفلتروا محلي
  // - الفواتير: استعلامات مستهدفة (رقم فاتورة/تليفون بالظبط) بحد 5 مستندات
  if(q.length >= 3){
    // 2) العملاء (بالاسم أو رقم التليفون) — من كاش الجلسة
    try{
      const custs = await _customersCached();
      results.customers = custs.filter(c=>
        (c.phone||'').includes(q) || _sm(c.name, q)
      ).slice(0, 5);
    }catch(e){}

    // 3) الفواتير: مطابقة تامة لرقم الفاتورة أو تليفون العميل — مش مسح شامل.
    // (البحث الجزئي في أرقام الفواتير القديمة اتشال عمدًا — كان بيكلف قراءة
    // المجموعة كلها. رقم الفاتورة بيتكتب كامل من الإيصال.)
    try{
      const qU = q.toUpperCase();
      const [byNo, byPhone] = await Promise.all([
        db.collection(TEST_SALES).where('branch','==', currentBranch)
          .where('invoiceNo','==', qU).limit(5).get().catch(()=> null),
        /^\d{6,}$/.test(q)
          ? db.collection(TEST_SALES).where('branch','==', currentBranch)
              .where('customerPhone','==', q).limit(5).get().catch(()=> null)
          : Promise.resolve(null)
      ]);
      const seen = new Set();
      [byNo, byPhone].forEach(snap=>{
        if(!snap) return;
        snap.docs.forEach(d=>{
          if(seen.has(d.id)) return; seen.add(d.id);
          results.invoices.push({id:d.id, ...d.data()});
        });
      });
      results.invoices = results.invoices.slice(0, 5);
    }catch(e){}
  }

  renderGlobalSearchResults(q, results);
}

// 👥 كاش عملاء الجلسة — قراءة واحدة كل 10 دقايق بدل قراءة كاملة مع كل بحثة
let _custCache = null, _custCacheAt = 0, _custCacheBranch = null;
async function _customersCached(){
  const fresh = _custCache && _custCacheBranch === currentBranch
             && (Date.now() - _custCacheAt) < 10*60000;
  if(fresh) return _custCache;
  const snap = await db.collection(TEST_CUSTOMERS).where('branch','==', currentBranch).get();
  _custCache = snap.docs.map(d=>d.data());
  _custCacheAt = Date.now();
  _custCacheBranch = currentBranch;
  return _custCache;
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
        <span style="font-weight:700; font-size:13px;">🧾 ${s.invoiceNo || s.id.slice(-6).toUpperCase()}</span>
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
