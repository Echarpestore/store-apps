// ============================================================
// products.js — موديول تفاصيل المنتج (المرحلة 1)
// منفصل عن app.js عشان الكود يفضل منظم وسهل الصيانة.
// بيعتمد على المتغيرات العامة من app.js:
//   db, allInventory, loadInventory, hasPerm, showToast, showScreen,
//   currentBranch, currentEmployee, TEST_INVENTORY, TEST_STOCK_LOG,
//   logStockMovement, printPriceLabel, renderInventoryScreen
// ============================================================

let currentProductId = null;

async function openProductDetails(productId){
  currentProductId = productId;
  showScreen('productDetailsScreen');
  await renderProductDetails();
}

async function renderProductDetails(){
  // بنقرا النسخة الأحدث من قاعدة البيانات مباشرة (مش الكاش) عشان الأرقام تبقى دقيقة
  const doc = await db.collection(TEST_INVENTORY).doc(currentProductId).get();
  if(!doc.exists){ showToast('المنتج مش موجود', 'err'); goToInventory(); return; }
  const p = { id: doc.id, ...doc.data() };

  const canEdit = hasPerm('canEditInventory');
  const canPrice = hasPerm('canChangePrices');
  const canCost = hasPerm('canViewCostPrice');

  document.getElementById('pdTitle').textContent = '📦 ' + p.name;

  // هامش الربح بيتحسب تلقائي من سعر البيع والتكلفة
  const margin = (p.price > 0 && p.cost != null)
    ? (((p.price - p.cost) / p.price) * 100).toFixed(1)
    : null;

  const statusOptions = [
    {v:'active', l:'✅ نشط'},
    {v:'hidden', l:'🚫 مخفي (مش بيظهر في البيع)'},
    {v:'outofstock', l:'⛔ نافد (مش بيظهر في البيع)'}
  ];

  const fieldRow = (label, valueHtml)=> `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:9px 0; border-bottom:1px solid var(--border); gap:10px;">
      <span style="color:var(--muted); font-size:12px; flex-shrink:0;">${label}</span>
      <span style="font-size:13px; font-weight:700; text-align:left;">${valueHtml}</span>
    </div>`;

  const editableInput = (field, value, type, enabled)=> enabled
    ? `<input type="${type}" value="${value ?? ''}" onchange="savePdField('${field}', this.value, '${type}')" style="width:130px; padding:7px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); text-align:center;">`
    : `${value ?? '—'}`;

  document.getElementById('pdInfoCard').innerHTML = `
    <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:14px; margin-bottom:10px;">
      <div style="font-weight:800; margin-bottom:6px;">البيانات الأساسية</div>
      ${fieldRow('اسم المنتج', editableInput('name', p.name, 'text', canEdit))}
      ${fieldRow('الباركود / SKU', editableInput('barcode', p.barcode, 'text', canEdit))}
      ${fieldRow('المورد', editableInput('supplier', p.supplier, 'text', canEdit))}
      ${canCost ? fieldRow('تكلفة الشراء', editableInput('cost', p.cost, 'number', canEdit)) : ''}
      ${fieldRow('سعر البيع', editableInput('price', p.price, 'number', canPrice))}
      ${canCost && margin !== null ? fieldRow('هامش الربح (تلقائي)', `<span style="color:${margin > 0 ? 'var(--plus)' : 'var(--minus)'};">${margin}%</span>`) : ''}
      ${fieldRow('حالة المنتج', canEdit
        ? `<select onchange="savePdField('status', this.value, 'text')" style="padding:7px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">
            ${statusOptions.map(o=>`<option value="${o.v}" ${p.status===o.v?'selected':''}>${o.l}</option>`).join('')}
          </select>`
        : (statusOptions.find(o=>o.v===p.status)||statusOptions[0]).l)}
    </div>`;

  const isLow = (p.minStock??0) > 0 && branchQty(p) <= p.minStock;
  document.getElementById('pdStockCard').innerHTML = `
    <div style="background:var(--panel); border:1px solid ${isLow?'var(--minus)':'var(--border)'}; border-radius:12px; padding:14px; margin-bottom:10px;">
      <div style="font-weight:800; margin-bottom:6px;">المخزون ${isLow ? '<span style="color:var(--minus); font-size:12px;">⚠️ وصل للحد الأدنى</span>' : ''}</div>
      ${fieldRow('الكمية الحالية', `<span style="font-size:17px; color:${isLow?'var(--minus)':'var(--plus)'};">${branchQty(p)}</span>`)}
      ${fieldRow('الحد الأدنى للتنبيه', editableInput('minStock', p.minStock ?? 0, 'number', canEdit))}
      ${canEdit ? `
      <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
        <button onclick="pdAdjustStock(1)" style="flex:1; padding:11px; border-radius:10px; border:1px solid var(--plus); background:transparent; color:var(--plus); font-weight:700; cursor:pointer;">➕ إضافة كمية (توريد)</button>
        <button onclick="pdAdjustStock(-1)" style="flex:1; padding:11px; border-radius:10px; border:1px solid var(--warn); background:transparent; color:var(--warn); font-weight:700; cursor:pointer;">➖ تسوية بالخصم</button>
        ${hasPerm('canPrintLabel') ? `<button onclick="printPriceLabel('${p.id}')" style="flex:1; padding:11px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-weight:700; cursor:pointer;">🏷️ طباعة Label</button>` : ''}
      </div>` : ''}
    </div>`;

  renderPdStockLog();
  if(typeof renderPdTimeline === 'function') renderPdTimeline(currentProductId);
}

// حفظ أي حقل قابل للتعديل من صفحة التفاصيل (بيتحقق من الصلاحية المناسبة لكل حقل)
async function savePdField(field, value, type){
  const priceFields = ['price'];
  const editFields = ['name','barcode','supplier','cost','minStock','status'];
  if(priceFields.includes(field) && !hasPerm('canChangePrices')){ showToast('تغيير الأسعار للمدير بس', 'err'); renderProductDetails(); return; }
  if(editFields.includes(field) && !hasPerm('canEditInventory')){ showToast('مفيش صلاحية', 'err'); renderProductDetails(); return; }

  let val = value;
  if(type === 'number'){ val = parseFloat(value) || 0; }
  if(field === 'minStock'){ val = parseInt(value) || 0; }
  try{
    await db.collection(TEST_INVENTORY).doc(currentProductId).update({ [field]: val });
    showToast('اتحفظ ✅');
    renderProductDetails();
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}

// تسوية يدوية للمخزون (توريد جديد أو خصم عجز/تالف) — السبب إجباري ويتسجل في السجل
async function pdAdjustStock(direction){
  if(!hasPerm('canEditInventory')){ showToast('مفيش صلاحية', 'err'); return; }
  const doc = await db.collection(TEST_INVENTORY).doc(currentProductId).get();
  const p = { id: doc.id, ...doc.data() };

  const qtyStr = prompt(direction > 0 ? 'كام قطعة هتضاف للمخزون؟' : 'كام قطعة هتتخصم من المخزون؟', '');
  if(qtyStr === null) return;
  const qty = parseInt(qtyStr);
  if(isNaN(qty) || qty <= 0){ showToast('كمية غير صحيحة', 'err'); return; }

  // منع المخزون السالب: مينفعش تخصم أكتر من الموجود
  if(direction < 0 && qty > branchQty(p)){
    showToast(`مينفعش تخصم ${qty} — الموجود فعليًا ${branchQty(p)} بس`, 'err');
    return;
  }

  const reason = prompt('اكتب سبب التسوية (إجباري — بيتسجل في سجل المخزون):', direction > 0 ? 'توريد جديد' : '');
  if(reason === null) return;
  if(!reason.trim()){ showToast('لازم تكتب السبب', 'err'); return; }

  const delta = direction > 0 ? qty : -qty;
  try{
    await db.collection(TEST_INVENTORY).doc(currentProductId).update({
      ['qtyByBranch.'+currentBranch]: firebase.firestore.FieldValue.increment(delta)
    });
    await logStockMovement(currentProductId, p.name, delta, direction > 0 ? 'receipt' : 'adjustment', reason.trim());
    showToast('اتسجلت التسوية ✅');
    renderProductDetails();
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}

// سجل حركة المخزون الكامل لهذا المنتج (Audit Log)
async function renderPdStockLog(){
  const wrap = document.getElementById('pdLogCard');
  wrap.innerHTML = `
    <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:14px;">
      <div style="font-weight:800; margin-bottom:8px;">📜 سجل حركة المخزون</div>
      <div id="pdLogList" style="font-size:12px;">بيتحمّل...</div>
    </div>`;
  try{
    const snap = await db.collection(TEST_STOCK_LOG).where('productId','==', currentProductId).get();
    const logs = snap.docs.map(d=>d.data()).sort((a,b)=>{
      const at = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      const bt = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
      return bt - at;
    }).slice(0, 100);
    const typeLabels = { sale:'🧾 بيع', return:'↩️ مرتجع', receipt:'📥 توريد', adjustment:'⚖️ تسوية', reversal:'🔄 عكس فاتورة' };
    document.getElementById('pdLogList').innerHTML = logs.length ? logs.map(l=>{
      const d = l.createdAt && l.createdAt.toDate ? l.createdAt.toDate() : null;
      const dateStr = d ? d.toLocaleString('ar-EG', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}) : '—';
      return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid var(--border); gap:8px;">
        <div>
          <span style="font-weight:700;">${typeLabels[l.type]||l.type}</span>
          <span style="color:var(--muted);"> — ${l.reason||''}</span>
          <div style="color:var(--muted); font-size:10px;">${dateStr} · ${l.employeeName||'—'}</div>
        </div>
        <span style="font-weight:800; font-size:14px; color:${l.delta > 0 ? 'var(--plus)' : 'var(--minus)'};">${l.delta > 0 ? '+' : ''}${l.delta}</span>
      </div>`;
    }).join('') : '<div style="color:var(--muted); text-align:center; padding:16px 0;">لسه مفيش حركة مسجلة للمنتج ده</div>';
  }catch(e){
    document.getElementById('pdLogList').innerHTML = '<div style="color:var(--minus);">تعذر تحميل السجل: ' + e.message + '</div>';
  }
}

// ============================================================
// استلام بضاعة (Receive Goods) — اكتب/امسح باركود، دوس Enter،
// عدّل الكمية (موجب = توريد جديد، سالب = خصم تالف/مرتجع للمورد).
// لو الكمية النهائية بقت صفر أو أقل، المنتج بيتحط "نافد" تلقائي
// ويختفي من شاشة البيع. لو اتضاف رصيد لمنتج كان "نافد"، بيرجع "نشط" تلقائي.
// ============================================================

let receiveCart = [];          // {id, name, barcode, currentQty, qty}
let receiveGoodsTodayLog = [];

function goToReceiveGoods(){
  if(!hasPerm('canEditInventory')){ showToast('الصلاحية دي محتاجة إذن تعديل المخزون', 'err'); return; }
  showScreen('receiveGoodsScreen');
  renderReceiveCart();   // القايمة بتفضل زي ما هي (مبتتمسحش إلا بعد التأكيد)
  // نتأكد إن المخزون متحمّل عشان البحث يلاقي المنتجات
  if(typeof loadInventory === 'function') loadInventory().catch(()=>{});
  const input = document.getElementById('receiveGoodsBarcode');
  input.value = '';
  const sb = document.getElementById('receiveSuggestBox'); if(sb) sb.innerHTML = '';
  setTimeout(()=> input.focus(), 100);
  renderReceiveGoodsLog();
}

// بحث حي وأنت بتكتب (زي صفحة البيع): يوري اقتراحات تدوس عليها
document.getElementById('receiveGoodsBarcode').addEventListener('input', (e)=>{
  const q = e.target.value.trim().toLowerCase();
  const box = document.getElementById('receiveSuggestBox');
  if(!box) return;
  box.innerHTML = '';
  if(!q) return;
  const matches = allInventory.filter(it=>
    (it.name||'').toLowerCase().includes(q) || (it.barcode||'').toLowerCase().includes(q)
  ).slice(0, 12);
  if(!matches.length){
    box.innerHTML = '<div style="padding:11px; color:#999; font-size:13px;">مفيش منتج بالاسم/الكود ده</div>';
    return;
  }
  matches.forEach(it=>{
    const row = document.createElement('div');
    row.className = 'sugg-row';
    row.innerHTML = `<span>${it.name} <span style="color:#999; font-size:11px;">${it.barcode||''}</span></span><span style="color:var(--muted)">${it.price} ج.م · مخزون: ${branchQty(it)}</span>`;
    row.onclick = ()=>{ addToReceiveCart(it); e.target.value=''; box.innerHTML=''; e.target.focus(); };
    box.appendChild(row);
  });
});

// امسح/اكتب كود أو اسم ودوس Enter → يتضاف للقايمة (زي شاشة البيع)
document.getElementById('receiveGoodsBarcode').addEventListener('keydown', (e)=>{
  if(e.key !== 'Enter') return;
  const code = e.target.value.trim();
  if(!code) return;
  const box = document.getElementById('receiveSuggestBox');
  let product = allInventory.find(p=> p.barcode === code || p.name === code);
  if(!product){
    // مفيش تطابق تام؟ لو فيه نتيجة واحدة بس في البحث خدها
    const q = code.toLowerCase();
    const ms = allInventory.filter(it=> (it.name||'').toLowerCase().includes(q) || (it.barcode||'').toLowerCase().includes(q));
    if(ms.length === 1) product = ms[0];
  }
  if(!product){
    showToast('مفيش منتج بالكود/الاسم ده: ' + code, 'err');
    return;
  }
  addToReceiveCart(product);
  e.target.value = '';
  if(box) box.innerHTML = '';
  e.target.focus();
});

function addToReceiveCart(product){
  const ex = receiveCart.find(r=> r.id === product.id);
  if(ex){ ex.qty += 1; }
  else receiveCart.push({ id:product.id, name:product.name, barcode:product.barcode, currentQty:branchQty(product), qty:1 });
  renderReceiveCart();
}
function receiveQty(idx, delta){
  const r = receiveCart[idx]; if(!r) return;
  r.qty = (r.qty || 0) + delta;
  renderReceiveCart();
}
function receiveSetQty(idx, val){
  const r = receiveCart[idx]; if(!r) return;
  r.qty = parseInt(val) || 0;
  renderReceiveCart();
}
function receiveRemove(idx){
  receiveCart.splice(idx, 1);
  renderReceiveCart();
}

function renderReceiveCart(){
  const wrap = document.getElementById('receiveCartWrap');
  const btn = document.getElementById('receiveConfirmBtn');
  if(!wrap) return;
  if(!receiveCart.length){
    wrap.innerHTML = '<div style="text-align:center; color:var(--muted); padding:26px 16px; font-size:13px;">امسح أو اكتب كود المنتج فوق 👆 عشان يتضاف للقايمة</div>';
    if(btn) btn.style.display = 'none';
    return;
  }
  wrap.innerHTML = receiveCart.map((r, idx)=>{
    // نحسب المخزون الجديد من الرصيد الحالي الفعلي
    const p = allInventory.find(x=> x.id === r.id);
    const cur = p ? branchQty(p) : r.currentQty;
    const newQty = cur + (r.qty || 0);
    const isNeg = (r.qty || 0) < 0;                       // كمية بالسالب = تالف/مرتجع
    const price = p ? p.price : '';
    const border = isNeg ? 'var(--minus)' : '#b9c9a0';
    const bg = isNeg ? '#fdecec' : '#fff';
    return `
    <div style="background:${bg}; border:1.5px solid ${border}; border-radius:12px; padding:12px 14px; margin-bottom:9px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <div style="min-width:0;">
          <div style="font-weight:800; font-size:14px; color:${isNeg?'var(--minus)':'inherit'};">${r.name}${isNeg?' ↩️':''}</div>
          <div style="color:#555; font-size:11.5px; margin-top:3px;">🔖 كود: <b style="direction:ltr; display:inline-block;">${r.barcode || '—'}</b>${price!==''?` · 💵 السعر: <b>${price} ج.م</b>`:''}</div>
          <div style="color:#888; font-size:11px; margin-top:2px;">المخزون: ${cur} ← <b style="color:${newQty<0?'var(--minus)':'var(--plus)'};">${newQty}</b></div>
        </div>
        <button class="cart-del" onclick="receiveRemove(${idx})" title="مسح">🗑️</button>
      </div>
      <div style="display:flex; align-items:center; gap:10px; margin-top:10px;">
        <div class="qty-cell">
          <button onclick="receiveQty(${idx},-1)">−</button>
          <input type="number" value="${r.qty}" onchange="receiveSetQty(${idx}, this.value)" style="width:66px; text-align:center; font-weight:800; font-size:15px; border-radius:6px; border:1px solid #b9c9a0; padding:6px;">
          <button onclick="receiveQty(${idx},1)">+</button>
        </div>
        <span style="font-size:11px; color:#888;">(بالسالب = خصم تالف/مرتجع)</span>
      </div>
    </div>`;
  }).join('');
  if(btn){ btn.style.display = 'block'; btn.textContent = '✔️ تأكيد الاستلام (' + receiveCart.length + ' صنف)'; }
}

async function confirmReceiveCart(){
  const rows = receiveCart.filter(r=> (r.qty || 0) !== 0);
  if(!rows.length){ showToast('القايمة فاضية أو كل الكميات صفر', 'err'); return; }
  // تأكد إن مفيش خصم أكتر من الموجود
  for(const r of rows){
    const p = allInventory.find(x=> x.id === r.id);
    const cur = p ? branchQty(p) : r.currentQty;
    if(cur + r.qty < 0){ showToast(`«${r.name}» مينفعش تخصم أكتر من الموجود (${cur})`, 'err'); return; }
  }
  const btn = document.getElementById('receiveConfirmBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'جارٍ التأكيد...'; }
  try{
    for(const r of rows){
      const p = allInventory.find(x=> x.id === r.id);
      const cur = p ? branchQty(p) : r.currentQty;
      const newQty = cur + r.qty;
      const update = { ['qtyByBranch.'+currentBranch]: firebase.firestore.FieldValue.increment(r.qty) };
      if(newQty <= 0) update.status = 'outofstock';
      else if(p && p.status === 'outofstock') update.status = 'active';
      await db.collection(TEST_INVENTORY).doc(r.id).update(update);
      await logStockMovement(r.id, r.name, r.qty, r.qty > 0 ? 'receipt' : 'adjustment', r.qty > 0 ? 'استلام بضاعة (توريد)' : 'خصم بضاعة (تالف/مرتجع للمورد)');
      receiveGoodsTodayLog.unshift({ name:r.name, qtyChange:r.qty, ts:Date.now() });
    }
    showToast(`اتأكد استلام ${rows.length} صنف ✅`);
    await loadInventory();
    receiveCart = [];
    renderReceiveCart();
    renderReceiveGoodsLog();
    document.getElementById('receiveGoodsBarcode').focus();
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
  finally{ if(btn){ btn.disabled = false; renderReceiveCart(); } }
}

function renderReceiveGoodsLog(){
  const wrap = document.getElementById('receiveGoodsLog');
  if(!wrap) return;
  const dayStart = new Date(); dayStart.setHours(0,0,0,0);
  const todays = receiveGoodsTodayLog.filter(l=> l.ts >= dayStart.getTime());
  wrap.innerHTML = todays.length ? todays.map(l=> `
    <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #eee; font-size:12px;">
      <span>${l.name}</span>
      <span style="font-weight:800; color:${l.qtyChange>0?'var(--plus)':'var(--minus)'};">${l.qtyChange>0?'+':''}${l.qtyChange}</span>
    </div>`).join('') : '<div style="color:#999; font-size:12px; text-align:center; padding:10px 0;">لسه مفيش عمليات استلام النهاردة</div>';
}
