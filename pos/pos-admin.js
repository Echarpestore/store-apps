// ⚠️ ملف مُقسّم من app.js — جزء من نظام POS. الترتيب في index.html مهم:
// pos-core.js ← pos-admin.js ← pos-reports.js ← pos-sale.js ← app.js

// ---------------- Inventory (test) ----------------
async function ensureDemoInventory(){
  const snap = await db.collection(TEST_INVENTORY).limit(1).get();
  if(!snap.empty) return;
  const demo = [
    {name:"حجاب حرير موف", barcode:"1001", price:150, quantity:40},
    {name:"بيجامة قطن كاروهات", barcode:"1002", price:220, quantity:25},
    {name:"طقم هوم وير 3 قطع", barcode:"1003", price:380, quantity:15},
    {name:"حجاب شيفون أسود", barcode:"1004", price:120, quantity:60},
    {name:"بيجامة صيفي قصير", barcode:"1005", price:180, quantity:30},
    {name:"شرشف سرير مطرز", barcode:"1006", price:450, quantity:10}
  ];
  const batch = db.batch();
  demo.forEach(it=>{
    const ref = db.collection(TEST_INVENTORY).doc();
    batch.set(ref, it);
  });
  await batch.commit();
}
async function loadInventory(){
  const snap = await db.collection(TEST_INVENTORY).get();
  allInventory = snap.docs.map(d=>({id:d.id, ...d.data()}));
}

// ---------------- Inventory screen (permission-gated) ----------------
async function renderInventoryScreen(){
  await loadInventory();
  // نحسب المباع لكل منتج (للترتيب بالأكثر/الأقل مبيعًا)
  try{
    invSales = {};
    const sales = await getBranchSales();
    sales.forEach(s=>{
      if(s.reversed) return;
      (s.items||[]).forEach(it=>{
        if(it.isRedemption || it.isRewardDiscount || !it.id) return;
        invSales[it.id] = (invSales[it.id]||0) + (it.qty||0) * (it.isReturn ? -1 : 1);
      });
    });
  }catch(e){ invSales = {}; }
  const addWrap = document.getElementById('inventoryAddRow');
  const listWrap = document.getElementById('inventoryListWrap');

  addWrap.innerHTML = hasPerm('canEditInventory') ? `
    <div style="display:flex; gap:6px; flex-wrap:wrap; background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:10px;">
      <input id="newItemName" placeholder="اسم الصنف" style="flex:2; min-width:100px; padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">
      <input id="newItemBarcode" placeholder="الباركود" value="${nextBarcode()}" style="flex:1; min-width:70px; padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">
      <input id="newItemPrice" type="number" placeholder="السعر" style="flex:1; min-width:70px; padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">
      <input id="newItemCost" type="number" placeholder="سعر التكلفة" style="flex:1; min-width:70px; padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">
      <input id="newItemQty" type="number" placeholder="الكمية (لفرعك)" style="flex:1; min-width:70px; padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">
      <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:var(--text); padding:0 4px; cursor:pointer;">
        <input type="checkbox" id="newItemAllBranches" checked style="width:16px; height:16px;"> في كل الفروع
      </label>
      <button onclick="addInventoryItem()" style="padding:8px 14px; border-radius:8px; border:none; background:var(--plus); color:#062; font-weight:700; cursor:pointer;">إضافة</button>
    </div>` : '';

  const canCost = hasPerm('canViewCostPrice');
  const canLabel = hasPerm('canPrintLabel');
  const canEdit = hasPerm('canEditInventory');

  // شريط تنبيه نقص المخزون
  const lowStock = allInventory.filter(it=> it.status !== 'hidden' && branchQty(it) <= (it.minStock??0) && (it.minStock??0) > 0);
  const alertBar = document.getElementById('lowStockAlertBar');
  if(alertBar){
    alertBar.innerHTML = lowStock.length ? `
      <div style="background:rgba(239,68,68,.12); border:1px solid var(--minus); border-radius:10px; padding:10px 12px; margin-bottom:10px; font-size:12px;">
        ⚠️ <b>${lowStock.length} صنف وصل للحد الأدنى:</b> ${lowStock.map(i=>i.name).join('، ')}
      </div>` : '';
  }

  const statusLabelOld = { active:'', hidden:' · 🚫 مخفي', outofstock:' · ⛔ نافد' };

  // إحصائيات عامة
  const canCost2 = hasPerm('canViewCostPrice');
  const totalItems = allInventory.length;
  const outCount = allInventory.filter(it=> it.status==='outofstock' || branchQty(it)<=0).length;
  const stockValue = allInventory.reduce((s,it)=> s + ((canCost2 ? (it.cost||0) : (it.price||0)) * branchQty(it)), 0);
  const sumEl = document.getElementById('invSummary');
  if(sumEl){
    const canStock2 = hasPerm('canViewStock');
    const chip = (lbl,val,col)=>`<div style="flex:1; min-width:92px; background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:9px 11px; text-align:center;"><div style="color:var(--muted); font-size:10px;">${lbl}</div><div style="font-weight:900; font-size:15px; color:${col||'var(--text)'};">${val}</div></div>`;
    let chips = chip('عدد الأصناف', totalItems);
    if(canStock2){
      chips += chip('قيمة المخزون', stockValue.toFixed(0)+' ج.م', 'var(--plus)')
        + chip('نواقص', lowStock.length, lowStock.length?'var(--warn)':'var(--text)')
        + chip('نافد', outCount, outCount?'var(--minus)':'var(--text)');
    }
    sumEl.innerHTML = chips;
  }

  renderInventoryList();
}

// عرض قائمة الأصناف مع البحث والفلترة (بيتنده من غير ما يعيد التحميل)
function invSort(col){
  if(invSortCol === col){ invSortDir = -invSortDir; }   // نفس العمود → نعكس الاتجاه
  else { invSortCol = col; invSortDir = -1; }            // عمود جديد → نبدأ تنازلي
  renderInventoryList();
}

let invSelected = new Set();   // تحديد متعدد بالـ Ctrl+Click لطباعة الليبلات
let _invClickTimer = null;
function invRowClick(e, id){
  // دوسة واحدة = تحديد/إلغاء تحديد · دبل كليك = فتح صفحة المنتج
  if(_invClickTimer){ clearTimeout(_invClickTimer); _invClickTimer = null; openProductDetails(id); return; }
  _invClickTimer = setTimeout(()=>{
    _invClickTimer = null;
    if(invSelected.has(id)) invSelected.delete(id); else invSelected.add(id);
    renderInventoryList();
  }, 260);
}
function printSelectedLabels(){
  if(!hasPerm('canPrintLabel')){ showToast('مفيش صلاحية طباعة الليبل', 'err'); return; }
  const picked = allInventory.filter(it=> invSelected.has(it.id));
  if(!picked.length){ showToast('حدد منتجات الأول: Ctrl + دوسة على كل منتج', 'err'); return; }
  openLabelQtyModal(picked.map(it=> ({ name:it.name, price:it.price, barcode:it.barcode, suggestedQty: Math.max(1, branchQty(it)||1) })));
}
function renderInventoryList(){
  const listWrap = document.getElementById('inventoryListWrap');
  if(!listWrap) return;
  const canCost = hasPerm('canViewCostPrice');
  const canLabel = hasPerm('canPrintLabel');
  const canEdit = hasPerm('canEditInventory');
  const canStock = hasPerm('canViewStock');
  const q = (document.getElementById('invSearch')?.value || '').trim().toLowerCase();
  const filter = document.getElementById('invFilter')?.value || 'all';

  let items = allInventory.filter(it=>{
    if(it.branches && !it.branches.includes(currentBranch)) return false;
    if(q && !((it.name||'').toLowerCase().includes(q) || (it.barcode||'').toLowerCase().includes(q))) return false;
    const isLow = (it.minStock??0) > 0 && branchQty(it) <= it.minStock;
    const isOut = it.status==='outofstock' || branchQty(it) <= 0;
    if(filter==='low') return isLow && it.status!=='hidden';
    if(filter==='out') return isOut;
    if(filter==='hidden') return it.status==='hidden';
    return true;
  });

  // الترتيب
  const val = (it)=>{
    switch(invSortCol){
      case 'barcode': return (it.barcode||'');
      case 'name':    return (it.name||'');
      case 'qty':     return branchQty(it);
      case 'price':   return Number(it.price)||0;
      case 'sold':    return invSales[it.id]||0;
      default:        return (it.name||'');
    }
  };
  items.sort((a,b)=>{
    const va = val(a), vb = val(b);
    if(typeof va === 'string') return va.localeCompare(vb, 'ar') * invSortDir;
    return (va - vb) * invSortDir;
  });

  const arrow = (col)=> invSortCol===col ? (invSortDir<0 ? ' ▼' : ' ▲') : '';
  const th = (col, label, extra)=> `<th onclick="invSort('${col}')" style="cursor:pointer; user-select:none; padding:10px 8px; text-align:${extra||'right'}; white-space:nowrap; ${invSortCol===col?'color:var(--accent);':'color:var(--muted);'}">${label}${arrow(col)}</th>`;

  if(items.length === 0){
    listWrap.innerHTML = '<div class="empty-cart">'+(q||filter!=='all'?'مفيش أصناف بالفلتر ده':'لسه مفيش أصناف')+'</div>';
    return;
  }

  const _lbtn = document.getElementById('invLabelBtn');
  if(_lbtn) _lbtn.textContent = '🏷️ طباعة ليبل' + (invSelected.size? ' ('+invSelected.size+')' : '');
  const rows = items.map((it, i)=>{
    const qty = branchQty(it);
    const isLow = (it.minStock??0) > 0 && qty <= it.minStock;
    const isOut = it.status==='outofstock' || qty <= 0;
    const qtyCol = isOut ? '#b91c1c' : isLow ? '#b45309' : '#15803d';
    const qtyTxt = canStock ? qty : (isOut?'نافد':isLow?'ناقص':'متاح');
    const sold = invSales[it.id]||0;
    const sel = invSelected.has(it.id);
    return `<tr onclick="invRowClick(event, '${it.id}')" style="cursor:pointer; border-bottom:1px solid var(--border); background:${sel?'rgba(129,140,248,.20)':(i%2?'transparent':'rgba(0,0,0,.02)')}; ${sel?'outline:1.5px solid #818cf8; outline-offset:-1.5px;':''}">
      <td style="padding:9px 8px; color:var(--muted); font-size:11px; direction:ltr;">${it.barcode||'—'}</td>
      <td style="padding:9px 8px; font-weight:700; font-size:13px;">${it.name}${it.status==='hidden'?' <span style="font-size:9px; color:var(--muted);">🚫</span>':''}</td>
      <td style="padding:9px 8px; text-align:center; font-weight:900; color:${qtyCol};">${qtyTxt}</td>
      <td style="padding:9px 8px; text-align:center; font-weight:800; white-space:nowrap;">${it.price}${canCost && it.cost!=null?`<div style="font-size:9px; color:var(--muted); font-weight:600;">ت:${it.cost}</div>`:''}</td>
      <td style="padding:9px 8px; text-align:center; font-weight:700; color:var(--accent);">${sold}</td>
    </tr>`;
  }).join('');

  listWrap.innerHTML = `
    <div style="overflow-x:auto; border:1px solid var(--border); border-radius:12px; background:var(--panel);">
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead><tr style="border-bottom:2px solid var(--border); background:var(--panel2); position:sticky; top:0;">
          ${th('barcode','الكود')}
          ${th('name','الاسم')}
          ${th('qty','المخزون','center')}
          ${th('price','السعر','center')}
          ${th('sold','اتباع','center')}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="text-align:center; color:var(--muted); font-size:11px; margin-top:8px;">${items.length} صنف · اضغط على عنوان العمود للترتيب</div>`;
}

// تصدير العملاء CSV (بأعمدة متوافقة مع كويك بوكس عشان يتقرا تاني بالاستيراد)
function exportCustomersCSV(){
  if(!custListData || !custListData.length){ showToast('مفيش عملاء للتصدير', 'err'); return; }
  const headers = ['Last Name','Phone 1','Points','Loyalty Code','Total Spent','Invoices','EMail','Notes'];
  const esc = v=>{ v = String(v==null?'':v); return /[",\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; };
  const lines = [headers.join(',')];
  custListData.forEach(c=>{
    lines.push([c.name||'', c.phone||'', c.points||0, c.loyaltyCode||'', (c._spend||0).toFixed(2), c._count||0, c.email||'', c.notes||''].map(esc).join(','));
  });
  const blob = new Blob(['\ufeff'+lines.join('\r\n')], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'customers_'+(currentBranch||'export')+'_'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('اتصدّر '+custListData.length+' عميل ✅');
}

// تصدير المخزون CSV (بأعمدة متوافقة مع كويك بوكس عشان يتقرا تاني بالاستيراد)
function exportInventoryCSV(){
  if(!allInventory || !allInventory.length){ showToast('مفيش أصناف للتصدير', 'err'); return; }
  const headers = ['Item Number','Item Name','Regular Price','Average Unit Cost','Qty 1','Vendor Name','Reorder Point 1','Department Name','Status'];
  const esc = v=>{ v = String(v==null?'':v); return /[",\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; };
  const lines = [headers.join(',')];
  allInventory.forEach(it=>{
    lines.push([it.barcode||'', it.name||'', it.price??'', it.cost??'', branchQty(it), it.supplier||'', it.minStock??'', it.department||'', it.status||''].map(esc).join(','));
  });
  const blob = new Blob(['\ufeff'+lines.join('\r\n')], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'inventory_'+(currentBranch||'export')+'_'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('اتصدّر '+allInventory.length+' صنف ✅');
}

// بيختار أول باركود رقمي متسلسل بعد أكبر باركود موجود (لو آخر واحد 543 يبقى الجديد 544)
function nextBarcode(){
  const used = new Set();
  (allInventory||[]).forEach(it=>{
    const b = String(it.barcode||'');
    if(/^\d+$/.test(b)) used.add(parseInt(b,10));
  });
  let n = 1;
  while(used.has(n)) n++;   // أقرب رقم فاضي (بيملأ الفجوات)
  return String(n);
}

// ============ ملخّص الأصناف لكل الفروع (للمدير) ============
let _bsSold = {}, _bsBranches = [];
let _bsSalesRaw = [];              // مبيعات كل الفروع (خام) — عشان نعيد الفلترة بالتاريخ من غير تحميل تاني
let currentBSRange = 'all';        // فترة عمود "باع" — زي التقارير
async function goToBranchSummary(){
  if(!hasPerm('canViewReports')){ showToast('الصلاحية دي للمدير بس', 'err'); return; }
  showScreen('branchSummaryScreen');
  const wrap = document.getElementById('branchSummaryWrap');
  wrap.innerHTML = '<div class="empty-cart">بيتحمّل من كل الفروع... 🏬</div>';
  try{
    await loadInventory();
    // أحدث 3000 فاتورة على مستوى كل الفروع (بتغطي شهور) — بدل تحميل التاريخ كله كل مرة
    const snap = await db.collection(TEST_SALES).orderBy('createdAt','desc').limit(3000).get()
      .catch(async ()=> db.collection(TEST_SALES).limit(3000).get());
    _bsSalesRaw = snap.docs.map(d=> d.data()).filter(s=> !s.reversed);
    // الفروع المتاحة (من المخزون + المبيعات) — ثابتة مش متأثرة بالتاريخ
    const brset = new Set();
    allInventory.forEach(p=>{ if(p.qtyByBranch) Object.keys(p.qtyByBranch).forEach(b=> brset.add(b)); });
    _bsSalesRaw.forEach(s=>{ if(s.branch) brset.add(s.branch); });
    _bsBranches = [...brset].sort((a,b)=> a.localeCompare(b,'ar'));
    document.querySelectorAll('.bs-range-btn').forEach(b=> b.classList.toggle('active', b.dataset.bsrange === currentBSRange));
    computeBSSold();
  }catch(e){ wrap.innerHTML = '<div class="empty-cart">خطأ: '+e.message+'</div>'; }
}

// حدود الفترة المختارة (نفس منطق التقارير بالظبط)
function getBSDateBounds(){
  let from = null, to = null;
  if(currentBSRange === 'today'){
    from = new Date(); from.setHours(0,0,0,0); to = new Date(); to.setHours(23,59,59,999);
  }else if(currentBSRange === 'yesterday'){
    from = new Date(); from.setDate(from.getDate()-1); from.setHours(0,0,0,0);
    to = new Date(); to.setDate(to.getDate()-1); to.setHours(23,59,59,999);
  }else if(currentBSRange === 'week'){
    from = new Date(); from.setDate(from.getDate()-6); from.setHours(0,0,0,0); to = new Date(); to.setHours(23,59,59,999);
  }else if(currentBSRange === 'month'){
    from = new Date(); from.setDate(from.getDate()-29); from.setHours(0,0,0,0); to = new Date(); to.setHours(23,59,59,999);
  }else if(currentBSRange === 'custom'){
    const f = document.getElementById('bsFrom')?.value; const t = document.getElementById('bsTo')?.value;
    if(f) from = new Date(f + 'T00:00:00'); if(t) to = new Date(t + 'T23:59:59');
  }
  // 'all' → من غير حدود (كل الفترة)
  return { from, to };
}

// بيحسب عمود "باع" لكل صنف/فرع حسب الفترة المختارة، من المبيعات الخام
function computeBSSold(){
  const { from, to } = getBSDateBounds();
  const fromMs = from ? from.getTime() : null, toMs = to ? to.getTime() : null;
  const sold = {};
  _bsSalesRaw.forEach(s=>{
    if(fromMs != null || toMs != null){
      const t = s.createdAt && s.createdAt.toMillis ? s.createdAt.toMillis() : null;
      if(t == null) return;                    // فاتورة من غير تاريخ متتحسبش في فترة محددة
      if(fromMs != null && t < fromMs) return;
      if(toMs != null && t > toMs) return;
    }
    const br = s.branch || '—';
    (s.items||[]).forEach(it=>{
      if(it.isRedemption || it.isRewardDiscount || !it.id) return;
      if(!sold[it.id]) sold[it.id] = {};
      sold[it.id][br] = (sold[it.id][br]||0) + (it.qty||0) * (it.isReturn ? -1 : 1);
    });
  });
  _bsSold = sold;
  renderBranchSummary();
}

function setBranchRange(range){
  currentBSRange = range;
  document.querySelectorAll('.bs-range-btn').forEach(b=> b.classList.toggle('active', b.dataset.bsrange === range));
  computeBSSold();
}

function renderBranchSummary(){
  const wrap = document.getElementById('branchSummaryWrap');
  const q = (document.getElementById('bsSearch')?.value || '').trim().toLowerCase();
  const branches = _bsBranches;

  let items = allInventory.filter(p=> !q || (p.name||'').toLowerCase().includes(q) || (p.barcode||'').toLowerCase().includes(q));
  // ترتيب بالأكثر مبيعًا إجمالًا
  const totalSold = (p)=> branches.reduce((s,b)=> s + ((_bsSold[p.id]&&_bsSold[p.id][b])||0), 0);
  items.sort((a,b)=> totalSold(b) - totalSold(a));

  const headBranches = branches.map(b=> `<th style="padding:8px 6px; text-align:center; white-space:nowrap; color:var(--accent);">${b}<div style="font-size:9px; color:var(--muted); font-weight:600;">مخزون · باع</div></th>`).join('');

  const rows = items.slice(0, 400).map(p=>{
    const cells = branches.map(b=>{
      const stock = (p.qtyByBranch && typeof p.qtyByBranch[b]==='number') ? p.qtyByBranch[b] : 0;
      const s = (_bsSold[p.id] && _bsSold[p.id][b]) || 0;
      const low = stock <= (p.minStock||0);
      const stockCol = stock<=0 ? '#b91c1c' : low ? '#b45309' : '#15803d';
      return `<td style="padding:7px 6px; text-align:center; white-space:nowrap;"><span style="font-weight:900; color:${stockCol};">${stock}</span> <span style="color:var(--muted);">·</span> <span style="font-weight:700; color:var(--accent);">${s}</span></td>`;
    }).join('');
    const totStock = branches.reduce((x,b)=> x + ((p.qtyByBranch&&p.qtyByBranch[b])||0), 0);
    return `<tr onclick="openProductDetails('${p.id}')" style="cursor:pointer; border-bottom:1px solid var(--border);">
      <td style="padding:7px 8px; position:sticky; right:0; background:var(--panel); min-width:120px;"><div style="font-weight:700; font-size:12px;">${p.name}</div><div style="font-size:10px; color:var(--muted); direction:ltr; text-align:right;">${p.barcode||'—'}</div></td>
      ${cells}
      <td style="padding:7px 8px; text-align:center; font-weight:900;">${totStock}<div style="font-size:9px; color:var(--accent); font-weight:700;">باع ${totalSold(p)}</div></td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <input id="bsSearch" oninput="renderBranchSummary()" value="${q}" placeholder="🔍 دوّر على صنف (اسم/كود)" style="width:100%; padding:11px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text); margin-bottom:12px;">
    <div style="overflow-x:auto; border:1px solid var(--border); border-radius:12px; background:var(--panel);">
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead><tr style="border-bottom:2px solid var(--border); background:var(--panel2);">
          <th style="padding:8px; text-align:right; position:sticky; right:0; background:var(--panel2); min-width:120px;">الصنف</th>
          ${headBranches}
          <th style="padding:8px; text-align:center;">الإجمالي</th>
        </tr></thead>
        <tbody>${rows || '<tr><td style="padding:20px; text-align:center; color:var(--muted);">مفيش أصناف</td></tr>'}</tbody>
      </table>
    </div>
    <div style="text-align:center; color:var(--muted); font-size:11px; margin-top:8px;">${items.length} صنف · مرتّبين بالأكثر مبيعًا · الأحمر = مخزون ناقص/نافد · دوس على الصنف يفتح تفاصيله</div>`;
}

// ============ مكافآت خاصة للعملاء (فردية أو جماعية) ============
let rewardTarget = null;   // رقم عميل، أو {bulk:true, phones:[...]}
function openRewardModal(target){
  rewardTarget = target;
  document.getElementById('rwValue').value = '';
  document.getElementById('rwMin').value = '';
  document.getElementById('rwDays').value = '7';
  document.getElementById('rwType').value = 'amount';
  const lbl = document.getElementById('rewardTargetLbl');
  lbl.textContent = (target && target.bulk) ? `هتتبعت لـ ${target.phones.length} عميل` : ('للعميل: ' + target);
  document.getElementById('rewardModal').classList.add('active');
}
function closeRewardModal(){ document.getElementById('rewardModal').classList.remove('active'); }

const _busyOps = new Set();   // منع تكرار العمليات أثناء التحميل
async function sendRewardConfirm(){
  if(_busyOps.has('reward')) return;   // لسه بيتبعت — تجاهل الضغط المكرر
  const type = document.getElementById('rwType').value;
  const value = parseFloat(document.getElementById('rwValue').value) || 0;
  if(value <= 0){ showToast('اكتب قيمة الخصم', 'err'); return; }
  _busyOps.add('reward');
  const minInvoice = parseFloat(document.getElementById('rwMin').value) || 0;
  const days = parseInt(document.getElementById('rwDays').value) || 7;
  const reward = {
    id: 'r' + Date.now().toString(36) + Math.floor(Math.random()*100),
    type, value, minInvoice,
    expiry: Date.now() + days*86400000,
    used: false,
    brand: (pointsFieldFor(currentBranch)==='points_glow' ? 'glow' : 'echarpe'),
    ts: Date.now()
  };
  const phones = (rewardTarget && rewardTarget.bulk) ? rewardTarget.phones : [rewardTarget];
  if(!phones.length){ showToast('مفيش عملاء', 'err'); _busyOps.delete('reward'); return; }
  try{
    let batch = db.batch(), n = 0;
    for(const ph of phones){
      if(!ph) continue;
      batch.set(db.collection(TEST_CUSTOMERS).doc(ph), { rewards: firebase.firestore.FieldValue.arrayUnion(reward) }, { merge:true });
      n++;
      if(n % 400 === 0){ await batch.commit(); batch = db.batch(); }
    }
    await batch.commit();
    try{
      const _bs = (reward.brand||'echarpe');
      db.collection(TEST_SETTINGS).doc('reward_stats_'+_bs).set({ sent: firebase.firestore.FieldValue.increment(phones.length) }, { merge:true });
    }catch(e){}
    closeRewardModal();
    if(typeof selectedCustomers !== 'undefined'){ selectedCustomers.clear(); if(document.getElementById('customerListWrap')) renderCustList(); }
    showToast(`اتبعتت المكافأة لـ ${phones.length} عميل 🎁`);
  }catch(e){ showToast('خطأ: ' + e.message, 'err'); }finally{ _busyOps.delete('reward'); }
}
function sendRewardToAllListed(){
  const phones = (custListFiltered && custListFiltered.length ? custListFiltered : custListData).map(c=> c.phone).filter(Boolean);
  if(!phones.length){ showToast('القائمة فاضية', 'err'); return; }
  openRewardModal({ bulk:true, phones });
}

// ============ كتالوج العرض (منفصل عن المخزون — منتجات بصور + بانرات يدوي) ============
// بيتخزّن في pos_test_settings/catalog_<brand> — كل فرع/براند له كتالوجه
function catalogBrand(){ return GLOW_BRANCHES.includes(currentBranch) ? 'glow' : 'echarpe'; }
let catalogData = { items: [], banners: [] };
let catalogStats = {};   // { <barcode>: {activated, used} }

async function goToCatalogEditor(){
  if(!hasPerm('canEditInventory')){ showToast('مفيش صلاحية', 'err'); return; }
  showScreen('catalogScreen');
  document.getElementById('catalogWrap').innerHTML = '<div class="empty-cart">بيتحمّل...</div>';
  try{
    const doc = await db.collection(TEST_SETTINGS).doc('catalog_' + catalogBrand()).get();
    catalogData = doc.exists ? Object.assign({ items:[], banners:[] }, doc.data()) : { items:[], banners:[] };
    if(!Array.isArray(catalogData.items)) catalogData.items = [];
    if(!Array.isArray(catalogData.banners)) catalogData.banners = [];
    const st = await db.collection(TEST_SETTINGS).doc('offer_stats_' + catalogBrand()).get();
    catalogStats = st.exists ? st.data() : {};
  }catch(e){ catalogData = { items:[], banners:[] }; catalogStats = {}; }
  renderCatalogEditor();
}

async function saveCatalogDoc(){
  await db.collection(TEST_SETTINGS).doc('catalog_' + catalogBrand()).set(catalogData, { merge:true });
}

function renderCatalogEditor(){
  const w = document.getElementById('catalogWrap');
  const inp = 'width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); margin-bottom:8px;';
  w.innerHTML = `
    <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:8px 12px; margin-bottom:14px; font-size:12px; color:var(--muted);">
      بتعدّل كتالوج فرع <b style="color:var(--text);">${catalogBrand()==='glow'?'Glow':'echarpe'}</b> — ده اللي بيظهر للعميل في التطبيق (مالوش علاقة بمخزون البيع).
    </div>

    <div style="background:var(--panel); border:1px solid var(--border); border-radius:14px; padding:14px; margin-bottom:16px;">
      <div style="font-weight:800; margin-bottom:10px;">➕ ضيف منتج للعرض</div>
      <input id="catSearch" placeholder="🔍 اختار من المخزون (اسم أو باركود)" oninput="catalogInvSuggest(this.value)" style="${inp}">
      <div id="catInvSuggest" style="background:var(--panel2); border-radius:8px; margin-top:-4px; margin-bottom:8px; overflow:hidden;"></div>
      <input id="catBarcode" placeholder="الباركود (بيتملأ لوحده لما تختار)" style="${inp}">
      <input id="catName" placeholder="الاسم المعروض للعميل" style="${inp}">
      <input id="catPrice" placeholder="السعر" style="${inp}">
      <div style="display:flex; gap:8px;">
        <select id="catDiscType" style="${inp} flex:1;">
          <option value="none">بدون خصم</option>
          <option value="percent">خصم نسبة %</option>
          <option value="amount">خصم مبلغ ج.م</option>
        </select>
        <input id="catDiscVal" type="number" placeholder="قيمة الخصم" style="${inp} flex:1;">
      </div>
      <div style="display:flex; gap:8px;">
        <input id="catUses" type="number" placeholder="يستخدمه كام مرة (لكل عميل)" value="1" style="${inp} flex:1;">
        <input id="catValidDays" type="number" placeholder="صالح كام يوم (فاضي=مفتوح)" style="${inp} flex:1;">
      </div>
      <label style="display:block; font-size:12px; font-weight:700; color:var(--muted); margin-bottom:4px;">📷 صورة المنتج (من موبايلك)</label>
      <input type="file" id="catImgFile" accept="image/*" onchange="catalogPickImage(this)" style="${inp}">
      <div id="catImgPreview"></div>
      <textarea id="catDesc" placeholder="وصف قصير (اختياري)" style="${inp} min-height:54px;"></textarea>
      <button onclick="catalogAddItem()" style="width:100%; padding:11px; border-radius:9px; border:none; background:var(--plus); color:#062; font-weight:800; cursor:pointer;">إضافة المنتج للعرض</button>
    </div>

    <div style="font-weight:800; margin-bottom:10px;">🛍️ منتجات الكتالوج (${catalogData.items.length})</div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px;">
      ${catalogData.items.map(it=>{
        const disc = it.discountType==='percent' ? `خصم ${it.discountValue}%` : it.discountType==='amount' ? `خصم ${it.discountValue} ج.م` : '';
        const limits = disc ? `${it.usesPerCustomer||1}× لكل عميل${it.validDays?` · ${it.validDays} يوم`:''}` : '';
        const st = (it.barcode && catalogStats[it.barcode]) ? catalogStats[it.barcode] : null;
        const statLine = (disc && it.barcode) ? `<div style="color:var(--accent); font-size:10px; font-weight:700;">🎯 فعّلوه: ${st&&st.activated?st.activated:0} · استعملوه: ${st&&st.used?st.used:0}</div>` : '';
        return `
        <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; overflow:hidden;">
          <div style="width:100%; height:120px; background:#eee center/cover no-repeat; background-image:url('${(it.img||'').replace(/'/g,"")}');"></div>
          <div style="padding:8px 10px;">
            <div style="font-weight:700; font-size:13px;">${it.name||''}</div>
            ${it.price?`<div style="color:var(--plus); font-weight:800; font-size:13px;">${it.price} ج.م</div>`:''}
            ${disc?`<div style="color:var(--warn); font-weight:800; font-size:11px;">🎁 ${disc}</div>`:''}
            ${limits?`<div style="color:var(--muted); font-size:10px;">⏱️ ${limits}</div>`:''}
            ${statLine}
            ${it.barcode?`<div style="color:var(--muted); font-size:10px;">كود: ${it.barcode}</div>`:''}
            <button onclick="catalogDelItem('${it.id}')" style="margin-top:6px; width:100%; padding:6px; border-radius:7px; border:1px solid var(--border); background:var(--panel2); color:var(--minus); font-size:11px; cursor:pointer;">حذف</button>
          </div>
        </div>`; }).join('') || '<div style="color:var(--muted); font-size:13px;">لسه مفيش منتجات في الكتالوج.</div>'}
    </div>

    <div style="background:var(--panel); border:1px solid var(--border); border-radius:14px; padding:14px; margin-bottom:16px;">
      <div style="font-weight:800; margin-bottom:10px;">🖼️ ضيف بانر إعلاني</div>
      <input type="file" id="banImgFile" accept="image/*" onchange="catalogPickBanner(this)" style="${inp}">
      <div id="banImgPreview"></div>
      <button onclick="catalogAddBanner()" style="width:100%; padding:11px; border-radius:9px; border:none; background:var(--accent); color:#fff; font-weight:800; cursor:pointer;">إضافة البانر</button>
    </div>

    <div style="font-weight:800; margin-bottom:10px;">📢 البانرات (${catalogData.banners.length})</div>
    <div style="margin-bottom:20px;">
      ${catalogData.banners.map(b=>`
        <div style="position:relative; margin-bottom:10px;">
          <img src="${(b.img||'').replace(/"/g,'')}" style="width:100%; border-radius:12px; display:block;">
          <button onclick="catalogDelBanner('${b.id}')" style="position:absolute; top:8px; left:8px; padding:6px 10px; border-radius:8px; border:none; background:rgba(0,0,0,.6); color:#fff; font-size:11px; cursor:pointer;">حذف</button>
        </div>`).join('') || '<div style="color:var(--muted); font-size:13px;">لسه مفيش بانرات.</div>'}
    </div>
  `;
}

// ضغط الصورة وتحويلها base64 (عشان نرفعها من الموبايل من غير لينكات)
function resizeImageFile(file, maxDim, cb){
  const reader = new FileReader();
  reader.onload = function(e){
    const img = new Image();
    img.onload = function(){
      let w = img.width, h = img.height;
      if(w > h && w > maxDim){ h = Math.round(h*maxDim/w); w = maxDim; }
      else if(h > maxDim){ w = Math.round(w*maxDim/h); h = maxDim; }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      cb(cv.toDataURL('image/jpeg', 0.68));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
let catalogPendingImg = '', catalogPendingBanner = '';
function catalogPickImage(input){
  const f = input.files && input.files[0]; if(!f) return;
  resizeImageFile(f, 620, function(data){
    catalogPendingImg = data;
    document.getElementById('catImgPreview').innerHTML = '<img src="'+data+'" style="width:100%; max-height:160px; object-fit:cover; border-radius:8px; margin-bottom:8px;">';
  });
}
function catalogPickBanner(input){
  const f = input.files && input.files[0]; if(!f) return;
  resizeImageFile(f, 900, function(data){
    catalogPendingBanner = data;
    document.getElementById('banImgPreview').innerHTML = '<img src="'+data+'" style="width:100%; border-radius:8px; margin-bottom:8px;">';
  });
}
function catalogInvSuggest(q){
  const box = document.getElementById('catInvSuggest'); q = (q||'').trim().toLowerCase();
  if(!q){ box.innerHTML = ''; return; }
  const ms = allInventory.filter(p=> (p.name||'').toLowerCase().includes(q) || (p.barcode||'').toLowerCase().includes(q)).slice(0, 8);
  box.innerHTML = ms.map(p=> `<div onclick="catalogPickInv('${p.id}')" style="padding:9px 10px; border-bottom:1px solid var(--border); cursor:pointer; font-size:13px;">${p.name} <span style="color:var(--muted); font-size:11px;">${p.barcode||''} · ${p.price}ج</span></div>`).join('');
}
function catalogPickInv(id){
  const p = allInventory.find(x=> x.id === id); if(!p) return;
  document.getElementById('catBarcode').value = p.barcode || '';
  document.getElementById('catName').value = p.name || '';
  document.getElementById('catPrice').value = p.price || '';
  document.getElementById('catInvSuggest').innerHTML = '';
  document.getElementById('catSearch').value = '';
}

async function catalogAddItem(){
  if(_busyOps.has('catItem')) return;
  const name = document.getElementById('catName').value.trim();
  if(!name){ showToast('اكتب اسم المنتج (أو اختاره من المخزون)', 'err'); return; }
  _busyOps.add('catItem');
  const dtype = document.getElementById('catDiscType').value;
  catalogData.items.push({
    id: 'c' + Date.now().toString(36),
    barcode: document.getElementById('catBarcode').value.trim(),
    name,
    price: document.getElementById('catPrice').value.trim(),
    img: catalogPendingImg || '',
    desc: document.getElementById('catDesc').value.trim(),
    discountType: dtype,
    discountValue: dtype === 'none' ? 0 : (parseFloat(document.getElementById('catDiscVal').value) || 0),
    usesPerCustomer: Math.max(1, parseInt(document.getElementById('catUses').value) || 1),
    validDays: parseInt(document.getElementById('catValidDays').value) || 0   // 0 = مفتوح
  });
  try{ await saveCatalogDoc(); catalogPendingImg=''; showToast('اتضاف ✅'); renderCatalogEditor(); }
  catch(e){ showToast('خطأ (يمكن الصورة كبيرة): '+e.message, 'err'); catalogData.items.pop(); }
  finally{ _busyOps.delete('catItem'); }
}
async function catalogDelItem(id){
  catalogData.items = catalogData.items.filter(x=> x.id !== id);
  try{ await saveCatalogDoc(); renderCatalogEditor(); }catch(e){ showToast('خطأ: '+e.message,'err'); }
}
async function catalogAddBanner(){
  if(_busyOps.has('catBanner')) return;
  if(!catalogPendingBanner){ showToast('اختار صورة البانر الأول', 'err'); return; }
  _busyOps.add('catBanner');
  catalogData.banners.push({ id:'b'+Date.now().toString(36), img: catalogPendingBanner });
  try{ await saveCatalogDoc(); catalogPendingBanner=''; showToast('اتضاف البانر ✅'); renderCatalogEditor(); }
  catch(e){ showToast('خطأ: '+e.message,'err'); catalogData.banners.pop(); }
  finally{ _busyOps.delete('catBanner'); }
}
async function catalogDelBanner(id){
  catalogData.banners = catalogData.banners.filter(x=> x.id !== id);
  try{ await saveCatalogDoc(); renderCatalogEditor(); }catch(e){ showToast('خطأ: '+e.message,'err'); }
}

// تشغيل/إيقاف ظهور المنتج للعميل في تطبيق الولاء (الافتراضي: مخفي)
async function toggleCustomerVisible(id){
  if(!hasPerm('canEditInventory')){ showToast('مفيش صلاحية', 'err'); return; }
  const it = allInventory.find(x=> x.id === id); if(!it) return;
  const newVal = !it.showToCustomer;
  it.showToCustomer = newVal;   // تحديث فوري للواجهة
  renderInventoryList();
  try{
    await db.collection(TEST_INVENTORY).doc(id).update({ showToCustomer: newVal });
    showToast(newVal ? 'المنتج هيظهر للعميل 👁️' : 'المنتج مخفي عن العميل 🙈');
  }catch(e){ showToast('حصل خطأ: '+e.message, 'err'); it.showToCustomer = !newVal; renderInventoryList(); }
}

async function addInventoryItem(){
  if(!hasPerm('canEditInventory')){ showToast('مفيش صلاحية', 'err'); return; }
  const name = document.getElementById('newItemName').value.trim();
  let barcode = document.getElementById('newItemBarcode').value.trim();
  if(!barcode) barcode = nextBarcode();   // فاضي؟ السيستم يختار المتسلسل
  const price = parseFloat(document.getElementById('newItemPrice').value) || 0;
  const cost = parseFloat(document.getElementById('newItemCost').value) || 0;
  const quantity = parseInt(document.getElementById('newItemQty').value) || 0;
  const allBranches = document.getElementById('newItemAllBranches').checked;
  if(!name || !price){ showToast('اكتب الاسم والسعر على الأقل', 'err'); return; }
  const data = {
    name, barcode, price, cost,
    qtyByBranch: { [currentBranch]: quantity },   // الكمية لفرعك، باقي الفروع صفر لحد ما يستلموا
    supplier:'', minStock:0, status:'active',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  if(!allBranches) data.branches = [currentBranch];   // مقصور على فرعك بس (مش في باقي الفروع)
  const docRef = await db.collection(TEST_INVENTORY).add(data);
  // تسجيل الرصيد الافتتاحي في سجل حركة المخزون
  if(quantity > 0){
    await logStockMovement(docRef.id, name, quantity, 'receipt', 'رصيد افتتاحي عند إضافة الصنف');
  }
  showToast('اتضاف الصنف ✅');
  renderInventoryScreen();
}
// سجل حركة المخزون — كل تغيير في الكمية بيتسجل هنا (توريد، بيع، تسوية يدوية، عكس فاتورة)
// عشان يبقى فيه Audit Log كامل تقدر ترجعله في أي وقت.
async function logStockMovement(productId, productName, delta, type, reason){
  try{
    await db.collection(TEST_STOCK_LOG).add({
      productId, productName, delta, type, reason: reason || '',
      branch: currentBranch,
      employeeName: currentEmployee ? (currentEmployee.name||'') : '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }catch(e){ console.warn('تعذر تسجيل حركة المخزون', e); }
}
async function deleteInventoryItem(id){
  if(!hasPerm('canEditInventory')){ showToast('مفيش صلاحية', 'err'); return; }
  if(!confirm('متأكد إنك عايز تمسح الصنف ده؟')) return;
  await db.collection(TEST_INVENTORY).doc(id).delete();
  showToast('اتمسح ✅');
  renderInventoryScreen();
}
function printPriceLabel(id){
  if(!hasPerm('canPrintLabel')){ showToast('مفيش صلاحية', 'err'); return; }
  const it = allInventory.find(x=>x.id===id);
  if(!it) return;
  // نافذة الكمية — الاقتراح = رصيد الفرع الحالي
  const suggested = (typeof branchQty==='function') ? Math.max(1, branchQty(it)||1) : 1;
  openLabelQtyModal([{ name: it.name, price: it.price, barcode: it.barcode, suggestedQty: suggested }]);
}

