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

  const qtyStr = await askText({
    title: direction > 0 ? '📥 إضافة للمخزون' : '📤 خصم من المخزون',
    message: direction > 0 ? 'كام قطعة هتضاف؟' : 'كام قطعة هتتخصم؟',
    type: 'number', value: '', okText: 'تمام'
  });
  if(qtyStr === null) return;
  const qty = parseInt(qtyStr);
  if(isNaN(qty) || qty <= 0){ showToast('كمية غير صحيحة', 'err'); return; }

  // منع المخزون السالب — إلا لو المالك فاتح `allowNegativeStock`
  // (شرحه الكامل في pos-core.js فوق `loadInventoryCfg`).
  if(direction < 0 && qty > branchQty(p)){
    if(!window.allowNegativeStock){
      showToast(`مينفعش تخصم ${qty} — الموجود فعليًا ${branchQty(p)} بس`, 'err');
      return;
    }
    showToast(`⚠️ الرصيد هينزل سالب (${branchQty(p) - qty}) — الجرد لسه ماتعملش`, 'warn');
  }

  const reason = await askText({
    title: '📝 سبب التسوية',
    message: 'إجباري — بيتسجل في سجل المخزون',
    value: direction > 0 ? 'توريد جديد' : '', okText: 'احفظ'
  });
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

// ============================================================
// 🧾 سجل الاستلامات — بيعيش بعد قفل التطبيق
// ------------------------------------------------------------
// 🔴 الباج: السجل كان في الذاكرة بس (`let ... = []`) — أول ما الكاشير
//    تقفل التطبيق أو الصفحة تعمل reload، السجل يرجع فاضي وهي كانت
//    مستلمة بضاعة فعلًا. النتيجة: «سجل الاستلامات مش شغال».
// الحل: نسخة في localStorage بمفتاح الفرع + يوم الشغل.
// ⚡ صفر قراءات إضافية من Firestore — الحركة نفسها متسجلة أصلًا في
//    `pos_test_stock_log`، ودي نسخة عرض سريعة للكاشير.
// ⏰ بيوم الشغل (6 صباحًا) مش نص الليل — استلام الفجر بتاع نفس الوردية.
// ============================================================
function _recvLogKey(){
  const day = (typeof bizDayKey === 'function') ? bizDayKey() : new Date().toDateString();
  return 'pos_recv_log_' + (typeof currentBranch !== 'undefined' ? currentBranch : '') + '_' + day;
}
function _recvLogSave(){
  try{ localStorage.setItem(_recvLogKey(), JSON.stringify(receiveGoodsTodayLog.slice(0, 200))); }
  catch(e){ console.warn('recv log save', e && e.message); }
}
function _recvLogLoad(){
  try{
    const raw = localStorage.getItem(_recvLogKey());
    if(!raw) return;
    const arr = JSON.parse(raw);
    if(Array.isArray(arr)) receiveGoodsTodayLog = arr;
  }catch(e){ console.warn('recv log load', e && e.message); }
}

function goToReceiveGoods(){
  if(!hasPerm('canReceiveGoods') && !hasPerm('canEditInventory')){ showToast('محتاج صلاحية استلام البضاعة', 'err'); return; }
  showScreen('receiveGoodsScreen');
  renderReceiveCart();   // القايمة بتفضل زي ما هي (مبتتمسحش إلا بعد التأكيد)
  // 🔖 الطلبات المفتوحة بتبان مع فتح الشاشة — قبل ما يبدأ يستلم
  try{ if(typeof renderRequestsTab === 'function') renderRequestsTab(); }catch(e){}
  // نتأكد إن المخزون متحمّل عشان البحث يلاقي المنتجات
  if(typeof loadInventory === 'function') loadInventory().catch(()=>{});
  const input = document.getElementById('receiveGoodsBarcode');
  input.value = '';
  const sb = document.getElementById('receiveSuggestBox'); if(sb) sb.innerHTML = '';
  setTimeout(()=> input.focus(), 100);
  renderReceiveGoodsLog();
}

// 🔎 مصدر واحد لبحث «استلام بضاعة».
// allInventory فيها كل مستندات Firestore بما فيها النسخ المدموجة/المستبعدة
// وفروع تانية، بينما شاشة الأصناف نفسها بتفلترهم. لو بحث الاستلام استخدم
// allInventory مباشرة يظهر نفس الباركود 2-3 مرات (وأحيانًا بكميات قديمة).
// هنا بنطبّق نفس نطاق الفرع ونرجّع نسخة واحدة canonical لكل باركود، من غير
// أي جمع كميات أو كتابة في المخزون — مجرد اختيار المستند الصحيح للعرض/الاستلام.
function receiveInventoryVisible(it, branch){
  if(!it || it.status === 'merged') return false;
  const br = it.branches;
  if(Array.isArray(br) && br.length && br.indexOf(branch) < 0) return false;
  return true;
}
function receiveCanonicalItems(items, branch){
  const byCode = Object.create(null), noCode = [];
  (items || []).forEach(function(it){
    if(!receiveInventoryVisible(it, branch)) return;
    const code = String(it.barcode || '').trim();
    if(!code){ noCode.push(it); return; }
    const old = byCode[code];
    if(!old){ byCode[code] = it; return; }
    // الأفضلية للمستند المربوط صراحة بالفرع الحالي، ثم للحالة غير المخفية،
    // ثم للأحدث/الأعلى رصيدًا كحزام أمان لبيانات قديمة لم تُنضّف بعد.
    const score = function(x){
      const explicit = Array.isArray(x.branches) && x.branches.indexOf(branch) >= 0 ? 1000 : 0;
      const active = (x.status !== 'hidden' && x.status !== 'import_excluded') ? 100 : 0;
      const qty = (typeof branchQty === 'function') ? Number(branchQty(x)||0) : Number((x.qtyByBranch||{})[branch]||0);
      const updated = Number(x.updatedAtMs || x.importedAtMs || 0) / 1e13;
      return explicit + active + Math.min(Math.max(qty, -9999), 9999)/10000 + updated;
    };
    if(score(it) > score(old)) byCode[code] = it;
  });
  return Object.keys(byCode).map(function(k){ return byCode[k]; }).concat(noCode);
}
function receiveSearchItems(items, branch, query){
  const q = String(query || '').trim().toLowerCase();
  const _sm = (typeof searchMatch === 'function') ? searchMatch
            : (h, qq)=> String(h||'').toLowerCase().includes(String(qq||'').toLowerCase());
  const _bp = (typeof barcodePrefix === 'function') ? barcodePrefix
            : (bc, qq)=> String(bc||'').toLowerCase().startsWith(String(qq||'').toLowerCase());
  return receiveCanonicalItems(items, branch).filter(function(it){
    return _sm(it.name, q) || _bp(it.barcode, q);
  });
}

// بحث حي وأنت بتكتب (زي صفحة البيع): يوري اقتراحات تدوس عليها
document.getElementById('receiveGoodsBarcode').addEventListener('input', (e)=>{
  const q = e.target.value.trim().toLowerCase();
  const box = document.getElementById('receiveSuggestBox');
  if(!box) return;
  box.innerHTML = '';
  if(!q) return;
  // 🧷 حزام أمان نسخ الملفات: وقت التحديث ممكن ملف يتحمّل جديد وملف قديم للحظة —
  // لو دالة التطبيع لسه موصلتش، بنرجع للبحث الحرفي بدل ما البحث يموت خالص
  const _sm = (typeof searchMatch === 'function') ? searchMatch
            : (h, qq)=> String(h||'').toLowerCase().includes(String(qq||'').toLowerCase());
  const _bp = (typeof barcodePrefix === 'function') ? barcodePrefix
            : (bc, qq)=> String(bc||'').toLowerCase().startsWith(String(qq||'').toLowerCase());
  const matches = receiveSearchItems(allInventory, currentBranch, q).slice(0, 12);
  // 🥇 المطابقة التامة الأول، وبعدها الأقصر (33 ← 330 ← 331...) — مش بترتيب المخزون العشوائي
  matches.sort((a,b)=>{
    const qa = String(a.barcode||''), qb = String(b.barcode||'');
    return ((qb===q)-(qa===q)) || (qa.length - qb.length);
  });
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
  const candidates = receiveCanonicalItems(allInventory, currentBranch);
  let product = candidates.find(p=> String(p.barcode||'') === code || String(p.name||'') === code);
  if(!product){
    // مفيش تطابق تام؟ لو فيه نتيجة واحدة بس في البحث خدها
    const ms = receiveSearchItems(candidates, currentBranch, code);
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

// ⚠️ الـ inline handlers بتشتغل في النطاق العام، و`receiveCart` معرّف بـ let
// فمش بيوصلها — كان بيفشل بصمت. (نفس الباج المتكرر: const/let مش بتتعلّق على window)
function receiveTogglePick(idx, checked){
  const r = receiveCart[idx];
  if(!r) return;
  r._lblPick = !!checked;
}
if(typeof window !== 'undefined') window.receiveTogglePick = receiveTogglePick;

function renderReceiveCart(){
  const wrap = document.getElementById('receiveCartWrap');
  const btn = document.getElementById('receiveConfirmBtn');
  if(!wrap) return;
  if(!receiveCart.length){
    wrap.innerHTML = '<div style="text-align:center; color:var(--muted); padding:26px 16px; font-size:13px;">امسح أو اكتب كود المنتج فوق 👆 عشان يتضاف للقايمة</div>';
    if(btn) btn.style.display = 'none';
    const lb0 = document.getElementById('receiveLabelsBtn'); if(lb0) lb0.style.display = 'none';
    return;
  }
  const lastIdx = receiveCart.length - 1;
  // 🔝 آخر صنف اتضاف يبقى **أول سطر** — نفس ترتيب شاشة البيع.
  // ⚠️ بنعكس العرض بس، والـ idx الأصلي بيفضل زي ما هو عشان أزرار
  //    الكمية والمسح تشتغل على الصف الصح (نفس أسلوب renderCart).
  wrap.innerHTML = receiveCart.map((r, idx)=> ({ r, idx })).reverse().map(({ r, idx })=>{
    const isLast = idx === lastIdx;
    // نحسب المخزون الجديد من الرصيد الحالي الفعلي
    const p = allInventory.find(x=> x.id === r.id);
    const cur = p ? branchQty(p) : r.currentQty;
    const newQty = cur + (r.qty || 0);
    const isNeg = (r.qty || 0) < 0;                       // كمية بالسالب = تالف/مرتجع
    const price = p ? p.price : '';
    // 🆕 آخر صنف اتضاف بإطار واضح — عشان الكاشير ميشكّش ويمسح تاني
    const border = isNeg ? 'var(--minus)' : (isLast ? '#16a34a' : '#b9c9a0');
    const bg = isNeg ? '#fdecec' : (isLast ? '#f0fdf4' : '#fff');
    return `
    <div id="rcRow_${idx}" style="background:${bg}; border:${isLast?'2px':'1.5px'} solid ${border}; border-radius:12px; padding:12px 14px; margin-bottom:9px;">
      ${isLast ? '<div style="font-size:10.5px; font-weight:900; color:#16a34a; margin-bottom:5px;">🆕 آخر واحد اتضاف</div>' : ''}
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <label style="display:flex; align-items:flex-start; gap:6px; padding-top:2px;" title="تحديد لطباعة الليبل">
          <input type="checkbox" class="lbl-pick" data-idx="${idx}" ${r._lblPick!==false && !isNeg ?'checked':''} onchange="receiveTogglePick(${idx}, this.checked)" style="width:17px; height:17px;">
        </label>
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
  // 📜 نمرّر لآخر صنف اتضاف — من غير كده بيضيف ومايشوفش النتيجة
  if(lastIdx >= 0){
    setTimeout(function(){
      const el = document.getElementById('rcRow_' + lastIdx);
      if(el && el.scrollIntoView) el.scrollIntoView({ behavior:'smooth', block:'nearest' });
    }, 60);
  }
  // زرار طباعة ليبلات المحدد (بيظهر مع القايمة)
  let lb = document.getElementById('receiveLabelsBtn');
  if(!lb && btn){
    lb = document.createElement('button');
    lb.id = 'receiveLabelsBtn';
    lb.style.cssText = 'display:block; width:100%; margin:8px 0; padding:12px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-weight:800; cursor:pointer;';
    lb.onclick = printReceiveLabels;
    btn.parentNode.insertBefore(lb, btn);
  }
  if(lb){ lb.style.display = 'block'; lb.textContent = '🏷️ طباعة ليبلات المحدد (☑️)'; }
}

async function confirmReceiveCart(){
  if(!hasPerm('canReceiveGoods') && !hasPerm('canEditInventory')){ showToast('محتاج صلاحية استلام البضاعة', 'err'); return; }
  const rows = receiveCart.filter(r=> (r.qty || 0) !== 0);
  const _negRows = [];   // الأصناف اللي رصيدها هينزل سالب — للتأكيد والسجل
  if(!rows.length){ showToast('القايمة فاضية أو كل الكميات صفر', 'err'); return; }
  // تأكد إن مفيش خصم أكتر من الموجود
  for(const r of rows){
    const p = allInventory.find(x=> x.id === r.id);
    const cur = p ? branchQty(p) : r.currentQty;
    // 🔴 دي كانت بتوقّف تسجيل **التالف**: القطعة اتكسرت فعلًا في الفرع،
    //    بس رصيدها في النظام صفر (الجرد لسه ماتعملش) → النظام يرفض. النتيجة
    //    إن التالف مايتسجلش خالص، والأرقام تبعد عن الواقع أكتر مش أقل.
    if(cur + r.qty < 0){
      if(!window.allowNegativeStock){
        showToast(`«${r.name}» مينفعش تخصم أكتر من الموجود (${cur})`, 'err');
        return;
      }
      _negRows.push(`${r.name} → ${cur + r.qty}`);
    }
  }
  // 🤫 قرار المالك: **مفيش شاشة تأكيد للموظف**. الرصيد السالب وضع مؤقت
  //    لحد ما الجرد يتعمل، ومش مطلوب الموظفين ياخدوا بالهم منه.
  //    ⚠️ بس مش بيعدي من غير أثر: كل حركة رصيدها بينزل تحت الصفر بتتسجل
  //       في سجل حركة المخزون بعلامة واضحة، والمالك بيشوفها في التقارير.
  //       الصمت للموظف مش للسجل — ده الفرق اللي بيخلي الثغرة مؤقتة مش دايمة.

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
      const _wentNeg = newQty < 0;
      await logStockMovement(r.id, r.name, r.qty, r.qty > 0 ? 'receipt' : 'adjustment',
        (r.qty > 0 ? 'استلام بضاعة (توريد)' : 'خصم بضاعة (تالف/مرتجع للمورد)')
        + (_wentNeg ? ` — ⚠️ الرصيد نزل سالب (${newQty}) · الجرد لسه ماتعملش` : ''));
      receiveGoodsTodayLog.unshift({ name:r.name, qtyChange:r.qty, ts:Date.now() });
      _recvLogSave();                       // يفضل موجود بعد قفل التطبيق
    }
    showToast(`اتأكد استلام ${rows.length} صنف ✅`);
    await loadInventory();
    // 🔖 مين كان طالب حاجة وصلت؟
    //    ⚠️ **بعد** الاستلام ما يخلص وجوّه try — الاستلام عملية شغل
    //       يومية وعمره ما يقف عشان تنبيه.
    try{
      if(typeof checkRequestsAfterReceive === 'function') checkRequestsAfterReceive(rows);
    }catch(e){ console.warn('requests after receive', e); }
    receiveCart = [];
    renderReceiveCart();
    renderReceiveGoodsLog();
    document.getElementById('receiveGoodsBarcode').focus();
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
  finally{ if(btn){ btn.disabled = false; renderReceiveCart(); } }
}

async function renderReceiveGoodsLog(){
  const wrap = document.getElementById('receiveGoodsLog');
  if(!wrap) return;

  // أول حاجة: نعرض الكاش المحلي فورًا عشان الشاشة متبقاش فاضية/بطيئة.
  if(!receiveGoodsTodayLog.length) _recvLogLoad();
  const renderRows = function(rows, note){
    rows = Array.isArray(rows) ? rows.slice(0, 20) : [];
    if(!rows.length){
      wrap.innerHTML = '<div style="color:#999;font-size:12px;text-align:center;padding:10px 0;">مفيش عمليات استلام مسجلة لسه</div>';
      return;
    }
    const dayStart = (typeof bizDayStartMs === 'function') ? bizDayStartMs(Date.now()) : (function(){ const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
    wrap.innerHTML = rows.map(function(l){
      const ts = Number(l.ts || 0);
      const d = ts ? new Date(ts) : null;
      const when = d ? (ts >= dayStart ? d.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}) : d.toLocaleDateString('ar-EG',{day:'2-digit',month:'2-digit'}) + ' ' + d.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})) : '—';
      const qty = Number(l.qtyChange || l.delta || 0);
      const emp = l.employeeName ? (' · ' + l.employeeName) : '';
      return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #eee;font-size:12px;">'
        + '<span style="min-width:0;"><b>' + String(l.name || l.productName || 'صنف') + '</b><span style="color:#999;font-size:10.5px;margin-right:5px;">' + when + emp + '</span></span>'
        + '<span style="font-weight:900;white-space:nowrap;color:' + (qty >= 0 ? 'var(--plus)' : 'var(--minus)') + ';">' + (qty > 0 ? '+' : '') + qty + '</span>'
        + '</div>';
    }).join('') + (note ? '<div style="color:#999;font-size:10.5px;padding-top:7px;text-align:center;">' + note + '</div>' : '');
  };
  renderRows(receiveGoodsTodayLog, 'آخر بيانات محفوظة على الجهاز');

  // المصدر الحقيقي: سجل حركة المخزون في Firestore. آخر 20 عملية للفرع،
  // مش بس "النهاردة" ومش مربوط بنفس الجهاز اللي استلم البضاعة.
  try{
    let snap;
    try{
      snap = await db.collection(TEST_STOCK_LOG)
        .where('branch','==',currentBranch)
        .where('type','==','receipt')
        .orderBy('createdAt','desc')
        .limit(20).get();
    }catch(indexErr){
      // من غير اعتماد على index مركب: نجيب آخر سجل الفرع ونفلتر receipt محليًا.
      snap = await db.collection(TEST_STOCK_LOG)
        .where('branch','==',currentBranch)
        .orderBy('createdAt','desc')
        .limit(120).get();
    }
    const rows = [];
    (snap && snap.docs || []).forEach(function(d){
      const x=d.data()||{};
      if(x.branch !== currentBranch || x.type !== 'receipt') return;
      const ts = x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : (x.createdAtMs || 0);
      rows.push({ name:x.productName||'صنف', qtyChange:Number(x.delta||0), ts:ts, employeeName:x.employeeName||'' });
    });
    rows.sort(function(a,b){ return (b.ts||0)-(a.ts||0); });
    if(rows.length){
      receiveGoodsTodayLog = rows.slice(0,20);
      _recvLogSave();
      renderRows(receiveGoodsTodayLog, 'آخر 20 عملية استلام من سجل المخزون');
    }
  }catch(e){
    console.warn('receive log firestore', e);
    // الكاش المحلي اللي اتعرض فوق يفضل ظاهر بدل شاشة فاضية.
  }
}


// 🏷️ طباعة ليبلات الأصناف المحدّدة في الاستلام — الاقتراح = الكمية المستلمة دلوقتي
function printReceiveLabels(){
  if(!hasPerm('canPrintLabel')){ showToast('مفيش صلاحية طباعة الليبل', 'err'); return; }
  const picked = receiveCart.filter(r=> r._lblPick!==false && (r.qty||0) > 0);
  if(!picked.length){ showToast('علّم ☑️ على الأصناف اللي عايز تطبعلها ليبل', 'err'); return; }
  openLabelQtyModal(picked.map(r=>{
    const inv = allInventory.find(x=> x.id===r.id) || {};
    return { name:r.name, price:(inv.price!=null?inv.price:r.price), barcode:(r.barcode||inv.barcode), suggestedQty:r.qty };
  }));
}
