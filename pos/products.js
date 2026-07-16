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

  const isLow = (p.minStock??0) > 0 && (p.quantity??0) <= p.minStock;
  document.getElementById('pdStockCard').innerHTML = `
    <div style="background:var(--panel); border:1px solid ${isLow?'var(--minus)':'var(--border)'}; border-radius:12px; padding:14px; margin-bottom:10px;">
      <div style="font-weight:800; margin-bottom:6px;">المخزون ${isLow ? '<span style="color:var(--minus); font-size:12px;">⚠️ وصل للحد الأدنى</span>' : ''}</div>
      ${fieldRow('الكمية الحالية', `<span style="font-size:17px; color:${isLow?'var(--minus)':'var(--plus)'};">${p.quantity ?? 0}</span>`)}
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
  if(direction < 0 && qty > (p.quantity ?? 0)){
    showToast(`مينفعش تخصم ${qty} — الموجود فعليًا ${p.quantity ?? 0} بس`, 'err');
    return;
  }

  const reason = prompt('اكتب سبب التسوية (إجباري — بيتسجل في سجل المخزون):', direction > 0 ? 'توريد جديد' : '');
  if(reason === null) return;
  if(!reason.trim()){ showToast('لازم تكتب السبب', 'err'); return; }

  const delta = direction > 0 ? qty : -qty;
  try{
    await db.collection(TEST_INVENTORY).doc(currentProductId).update({
      quantity: firebase.firestore.FieldValue.increment(delta)
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

let receiveGoodsProduct = null;
let receiveGoodsTodayLog = [];

function goToReceiveGoods(){
  if(!hasPerm('canEditInventory')){ showToast('الصلاحية دي محتاجة إذن تعديل المخزون', 'err'); return; }
  showScreen('receiveGoodsScreen');
  document.getElementById('receiveGoodsResult').innerHTML = '';
  const input = document.getElementById('receiveGoodsBarcode');
  input.value = '';
  setTimeout(()=> input.focus(), 100);
  renderReceiveGoodsLog();
}

document.getElementById('receiveGoodsBarcode').addEventListener('keydown', async (e)=>{
  if(e.key !== 'Enter') return;
  const code = e.target.value.trim();
  if(!code) return;
  const product = allInventory.find(p=> p.barcode === code || p.name === code);
  const resultBox = document.getElementById('receiveGoodsResult');
  if(!product){
    resultBox.innerHTML = `<div style="background:#fff3f2; border:1px solid var(--minus); border-radius:10px; padding:14px; color:var(--minus); font-weight:700;">⚠️ مفيش منتج بالباركود ده — ${code}. تقدر تضيفه من "قائمة الأصناف".</div>`;
    return;
  }
  receiveGoodsProduct = product;
  renderReceiveGoodsResult();
});

function renderReceiveGoodsResult(){
  const p = receiveGoodsProduct;
  const resultBox = document.getElementById('receiveGoodsResult');
  resultBox.innerHTML = `
    <div style="background:#fff; border:1px solid #b9c9a0; border-radius:12px; padding:16px;">
      <div style="font-weight:800; font-size:15px; margin-bottom:2px;">${p.name}</div>
      <div style="color:#888; font-size:12px; margin-bottom:12px;">الكمية الحالية: ${p.quantity ?? 0}</div>
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:12px;">
        <button onclick="rgAdjustQty(-1)" style="width:44px; height:44px; border-radius:8px; border:1px solid #888; background:#eee; font-size:20px; cursor:pointer;">−</button>
        <input type="number" id="rgQtyInput" value="1" style="flex:1; padding:12px; text-align:center; font-size:18px; border-radius:8px; border:1px solid #b9c9a0;">
        <button onclick="rgAdjustQty(1)" style="width:44px; height:44px; border-radius:8px; border:1px solid #888; background:#eee; font-size:20px; cursor:pointer;">+</button>
      </div>
      <div style="font-size:11px; color:#888; margin-bottom:10px;">اكتب رقم بالسالب (زي -3) لو هتخصم بضاعة تالفة أو مرتجعة للمورد</div>
      <button onclick="confirmReceiveGoods()" style="width:100%; padding:13px; border-radius:10px; border:none; background:var(--plus); color:#062; font-weight:800; cursor:pointer;">تأكيد الحركة</button>
    </div>`;
  document.getElementById('rgQtyInput').focus();
  document.getElementById('rgQtyInput').select();
}
function rgAdjustQty(delta){
  const input = document.getElementById('rgQtyInput');
  input.value = (parseInt(input.value)||0) + delta;
}

async function confirmReceiveGoods(){
  const p = receiveGoodsProduct;
  if(!p) return;
  const qtyChange = parseInt(document.getElementById('rgQtyInput').value);
  if(isNaN(qtyChange) || qtyChange === 0){ showToast('اكتب رقم غير صفر', 'err'); return; }

  const newQty = (p.quantity ?? 0) + qtyChange;
  if(newQty < 0){ showToast(`مينفعش تخصم أكتر من الموجود (${p.quantity??0})`, 'err'); return; }

  const update = { quantity: firebase.firestore.FieldValue.increment(qtyChange) };
  // لو الرصيد بقى صفر أو أقل، اعتبره نافد تلقائي؛ لو كان نافد وبقى فيه رصيد تاني، رجّعه نشط تلقائي
  if(newQty <= 0) update.status = 'outofstock';
  else if(p.status === 'outofstock') update.status = 'active';

  try{
    await db.collection(TEST_INVENTORY).doc(p.id).update(update);
    const reason = qtyChange > 0 ? 'استلام بضاعة (توريد)' : 'خصم بضاعة (تالف/مرتجع للمورد)';
    await logStockMovement(p.id, p.name, qtyChange, qtyChange > 0 ? 'receipt' : 'adjustment', reason);
    receiveGoodsTodayLog.unshift({ name:p.name, qtyChange, ts:Date.now() });
    showToast(qtyChange > 0 ? `اتضاف ${qtyChange} قطعة ✅` : `اتخصم ${Math.abs(qtyChange)} قطعة ✅${newQty<=0 ? ' — المنتج بقى نافد' : ''}`);
    await loadInventory();
    receiveGoodsProduct = null;
    document.getElementById('receiveGoodsResult').innerHTML = '';
    document.getElementById('receiveGoodsBarcode').value = '';
    document.getElementById('receiveGoodsBarcode').focus();
    renderReceiveGoodsLog();
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
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
