// ⚠️ ملف مُقسّم من app.js — جزء من نظام POS. الترتيب في index.html مهم:
// pos-core.js ← pos-admin.js ← pos-reports.js ← pos-sale.js ← app.js

// ---------------- Navigation ----------------
// بيرجع لفاتورة شغالة بالفعل من غير ما يمسحها (لو فيه أصناف في السلة)، أو
// يبدأ فاتورة جديدة عادي لو السلة فاضية. ده اللي بيخلي الفاتورة "تفضل موجودة"
// حتى لو راح المخزون أو العملاء وبعدين رجع لشاشة البيع.
// بيجيب كل الموظفين اللي حاضرين وشغالين دلوقتي فعليًا (شيفت مفتوح، لسه ماعملوش
// انصراف) من نظام الحضور في برنامج المبيعات (نفس قاعدة البيانات)، عشان الكاشير
// يقدر يحدد مين اللي فعليًا باع للعميل، مش بس مين مسجّل دخول في جهاز الـPOS.
async function loadClockedInStaff(){
  const sel = document.getElementById('sellerEmployeeSelect');
  if(!sel) return;
  sel.innerHTML = '<option value="">👤 مين اللي باع؟ (اختياري)</option>';
  try{
    // نجيب قايمة الموظفين الحاليين الحقيقية للفرع ده الأول (عشان نستبعد أي حد
    // اتمسح أو بقى غير نشط، حتى لو لسه ليه سجل شيفت قديم "مفتوح" بالغلط)
    const empSnap = await db.collection(EMPLOYEES_COLLECTION).where('branch','==', currentBranch).get();
    const activeEmpIds = new Set(empSnap.docs.filter(d=> d.data().active !== false).map(d=> d.id));

    // مفيش فلترة بـ"النهاردة بس" هنا عمدًا — لو شيفت لسه فعليًا "مفتوح" (محضّرش انصراف)،
    // يفضل يبان حتى لو ابتدأ من يوم فات، عشان مانخسرش موظف شغال فعليًا.
    const snap = await db.collection('sales_shifts').where('branch','==', currentBranch).get();
    const openShifts = snap.docs.map(d=>d.data())
      .filter(s=> !s.clockOutTs && activeEmpIds.has(s.employeeId));

    // استبعاد أي تكرار لنفس الموظف (لو حصل له أكتر من شيفت مفتوح بالغلط)
    const seen = new Set();
    openShifts.forEach(s=>{
      if(seen.has(s.employeeId)) return;
      seen.add(s.employeeId);
      const opt = document.createElement('option');
      opt.value = s.employeeId;
      opt.textContent = s.employeeName || s.employeeId;
      opt.dataset.name = s.employeeName || '';
      sel.appendChild(opt);
    });
    // افتراضيًا، لو الموظف المسجل دخول في الـPOS نفسه حاضر في القايمة، يتفضّل تلقائي
    if(seen.has(currentEmployee.id)){
      sel.value = currentEmployee.id;
    }
  }catch(e){ console.warn('تعذر تحميل قايمة الموظفين الحاضرين', e); }
}

function focusSearchBar(){
  // نفوكس خانة البحث عشان السكانر يمسح على طول (منتج أو كود عميل) من غير ما الكاشير يدوس عليها
  setTimeout(function(){ var sb=document.getElementById('searchBar'); if(sb) sb.focus(); }, 120);
}
function resumeOrStartSale(){
  if(cart.length > 0){
    if(typeof loadActiveDiscounts === 'function') loadActiveDiscounts();
    loadLoyaltyRedemptionConfig();
    loadClockedInStaff();
    renderCart();
    resetPaymentUI(); // بس حالة الدفع بتتصفّر (ممكن يكون الإجمالي اتغيّر)، الأصناف نفسها فاضلة زي ما هي
    showScreen('saleScreen');
    focusSearchBar();
  }else{
    goToSale();
  }
}

function goToSale(){
  editingHeldId = null;
  cart = [];
  selectedCartIdx = null;
  clearCustomerContext();   // نصفّي سياق العميل بالكامل (استبدال/مكافأة/عروض) عشان الفاتورة الجديدة تبدأ نضيفة
  // تحميل الخصومات السارية عشان تتطبق تلقائي وقت إضافة الأصناف
  if(typeof loadActiveDiscounts === 'function') loadActiveDiscounts();
  loadLoyaltyRedemptionConfig();
  loadClockedInStaff();
  document.getElementById('customerPhone').value = '';
  document.getElementById('customerName').value = '';
  document.getElementById('customerInfo').textContent = '';
  document.getElementById('newCustomerRow').style.display = 'none';
  setCustBox(false);
  // التاريخ والوقت واسم الموظف في ركن الشاشة (زي الجهاز الحقيقي بالظبط)
  const now = new Date();
  document.getElementById('qbxMeta').innerHTML =
    now.toLocaleDateString('ar-EG', {weekday:'long', year:'numeric', month:'long', day:'numeric'}) +
    '<br>' + now.toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'}) +
    '<br><b>' + (currentEmployee.name || '') + '</b>';
  renderCart();
  resetPaymentUI();
  showScreen('saleScreen');
  focusSearchBar();
}
function goToDashboard(){
  refreshHeldCount();
  showScreen('dashboardScreen');
}

// ---------------- تصميم الفاتورة والليبل (قابل للتعديل من المدير) ----------------
let receiptDesignConfig = {
  shopName: 'إيشارب ستور', headerNote: '', footerNote: 'شكرًا لتعاملكم معنا 🙏',
  showBarcodeOnReceipt: true, showBarcodeOnLabel: true, labelShopName: true
};
async function loadReceiptDesignConfig(){
  try{
    const doc = await db.collection(TEST_SETTINGS).doc('receipt_design').get();
    if(doc.exists) receiptDesignConfig = { ...receiptDesignConfig, ...doc.data() };
  }catch(e){ console.warn('تعذر تحميل إعدادات تصميم الفاتورة، هتُستخدم الافتراضية', e); }
}

function goToReceiptDesign(){
  if(!hasPerm('canChangePrices')){ showToast('الصلاحية دي للمدير بس', 'err'); return; }
  showScreen('receiptDesignScreen');
  renderReceiptDesignScreen();
}
function renderReceiptDesignScreen(){
  const c = receiptDesignConfig;
  document.getElementById('receiptDesignWrap').innerHTML = `
    <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:12px;">
      <div style="font-weight:800; margin-bottom:10px;">🧾 فاتورة البيع (58mm)</div>
      <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:4px;">اسم المحل (عنوان الفاتورة)</label>
      <input id="rdShopName" value="${c.shopName}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); margin-bottom:10px;">
      <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:4px;">سطر إضافي تحت الاسم (عنوان/تليفون المحل — اختياري)</label>
      <input id="rdHeaderNote" value="${c.headerNote}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); margin-bottom:10px;">
      <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:4px;">رسالة آخر الفاتورة</label>
      <input id="rdFooterNote" value="${c.footerNote}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); margin-bottom:10px;">
      <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="checkbox" id="rdShowBarcodeReceipt" ${c.showBarcodeOnReceipt?'checked':''}> اطبع باركود رقم الفاتورة آخر الريسيت</label>
    </div>
    <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:12px;">
      <div style="font-weight:800; margin-bottom:10px;">🏷️ ليبل السعر</div>
      <label style="display:flex; align-items:center; gap:6px; font-size:13px; margin-bottom:8px;"><input type="checkbox" id="rdLabelShopName" ${c.labelShopName?'checked':''}> اكتب اسم المحل فوق الليبل</label>
      <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="checkbox" id="rdShowBarcodeLabel" ${c.showBarcodeOnLabel?'checked':''}> اطبع باركود المنتج على الليبل</label>
    </div>
    <button onclick="saveReceiptDesignConfig()" style="width:100%; padding:13px; border-radius:10px; border:none; background:var(--plus); color:#062; font-weight:800; cursor:pointer;">حفظ التصميم</button>`;
}

async function saveReceiptDesignConfig(){
  const config = {
    shopName: document.getElementById('rdShopName').value.trim() || 'المحل',
    headerNote: document.getElementById('rdHeaderNote').value.trim(),
    footerNote: document.getElementById('rdFooterNote').value.trim(),
    showBarcodeOnReceipt: document.getElementById('rdShowBarcodeReceipt').checked,
    labelShopName: document.getElementById('rdLabelShopName').checked,
    showBarcodeOnLabel: document.getElementById('rdShowBarcodeLabel').checked
  };
  try{
    await db.collection(TEST_SETTINGS).doc('receipt_design').set(config, { merge:true });
    receiptDesignConfig = config;
    showToast('اتحفظ التصميم ✅');
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}

function printReceipt(payments, total, invoiceNo, invoiceCode){
  const c = receiptDesignConfig;
  document.getElementById('rShopName').textContent = c.shopName;
  const metaLine = (c.headerNote ? c.headerNote + ' | ' : '') +
    new Date().toLocaleString('ar-EG') + ' | الموظف: ' + (currentEmployee.name || '');
  document.getElementById('rMeta').textContent = metaLine;
  const table = document.getElementById('rItemsTable');
  table.innerHTML = '';
  cart.forEach(c=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${c.name}</td><td>${c.qty}×</td><td>${(c.price*c.qty).toFixed(2)}</td>`;
    table.appendChild(tr);
  });
  const payLines = Object.entries(payments).map(([k,v])=>{
    const labels = {cash:'كاش', visa:'فيزا', instapay:'انستا باي'};
    return `${labels[k]}: ${v.toFixed(2)}`;
  }).join(' | ');
  document.getElementById('rTotalLine').textContent = `الإجمالي: ${total.toFixed(2)} جنيه (${payLines})`;
  document.getElementById('rInvoiceNo').textContent = invoiceNo || '';
  document.querySelector('#receiptPrint > div:last-child').textContent = c.footerNote;
  // باركود رقم الفاتورة في آخر الريسيت — يسهّل الرجوع للفاتورة لاحقًا بمسح الكود (قابل للإيقاف من إعدادات التصميم)
  const barcodeBox = document.querySelector('.r-barcode');
  const scanCode = invoiceCode || invoiceNo;
  if(c.showBarcodeOnReceipt && scanCode){
    barcodeBox.style.display = '';
    try{
      if(typeof JsBarcode !== 'undefined'){
        JsBarcode('#rBarcode', scanCode, { format:'CODE128', width:1.4, height:34, fontSize:11, margin:0, displayValue:true });
      }
    }catch(e){ console.warn('تعذر إنشاء الباركود', e); }
  }else{
    barcodeBox.style.display = 'none';
  }
  window.print();
}

// ---------------- Init ----------------
(async function init(){
  await ensureDemoInventory();
  await loadInventory();
  await loadReceiptDesignConfig();
})();
