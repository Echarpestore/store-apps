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
  const shell = (typeof window.posShell !== 'undefined');
  document.getElementById('receiptDesignWrap').innerHTML = `
    <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:12px;">
      <div style="font-weight:800; margin-bottom:10px;">🧾 فاتورة البيع</div>
      <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:4px;">لوجو المحل (يظهر أعلى الفاتورة)</label>
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:12px;">
        <img id="rdLogoPreview" src="${c.logo||''}" style="height:44px; max-width:120px; object-fit:contain; background:#fff; border:1px solid var(--border); border-radius:8px; padding:4px; ${c.logo?'':'display:none;'}">
        <input type="file" id="rdLogoFile" accept="image/*" onchange="handleReceiptLogoUpload(this)" style="font-size:12px;">
        ${c.logo?'<button class="secondary" onclick="removeReceiptLogo()" style="padding:8px 12px;">🗑️ شيل اللوجو</button>':''}
      </div>
      <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:4px;">مقاس ورق الطابعة</label>
      <select id="rdPaperWidth" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); margin-bottom:10px;">
        <option value="80" ${c.paperWidth!=='58'?'selected':''}>80mm / 75-80mm (العريضة)</option>
        <option value="58" ${c.paperWidth==='58'?'selected':''}>58mm (الصغيرة)</option>
      </select>
      <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:4px;">اسم المحل (عنوان الفاتورة)</label>
      <input id="rdShopName" value="${c.shopName}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); margin-bottom:10px;">
      <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:4px;">سطر إضافي تحت الاسم (عنوان/تليفون المحل — اختياري)</label>
      <input id="rdHeaderNote" value="${c.headerNote}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); margin-bottom:10px;">
      <label style="display:block; font-size:12px; color:var(--muted); margin-bottom:4px;">رسالة آخر الفاتورة</label>
      <input id="rdFooterNote" value="${c.footerNote}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--pan2); color:var(--text); margin-bottom:10px;">
      <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="checkbox" id="rdShowBarcodeReceipt" ${c.showBarcodeOnReceipt?'checked':''}> اطبع باركود الفاتورة آخر الريسيت (بيتمسح لفتح المرتجع)</label>
    </div>
    <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:12px;">
      <div style="font-weight:800; margin-bottom:10px;">🏷️ ليبل السعر</div>
      <label style="display:flex; align-items:center; gap:6px; font-size:13px; margin-bottom:8px;"><input type="checkbox" id="rdLabelShopName" ${c.labelShopName?'checked':''}> اكتب اسم المحل فوق الليبل</label>
      <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="checkbox" id="rdShowBarcodeLabel" ${c.showBarcodeOnLabel?'checked':''}> اطبع باركود المنتج على الليبل</label>
      <div style="margin-top:12px;">
        <div style="font-size:11px; color:var(--muted); margin-bottom:6px;">👁️ معاينة حية:</div>
        <div id="rdLabelPreview"></div>
      </div>
    </div>

    <div style="background:var(--panel); border:1px solid ${shell?'var(--plus)':'var(--border)'}; border-radius:12px; padding:16px; margin-bottom:12px;">
      <div style="font-weight:800; margin-bottom:6px;">🖨️ طابعات الجهاز ده ${shell?'':'<span style="font-size:11px; color:var(--muted); font-weight:400;">(بيشتغل جوّه برنامج الكاشير على ويندوز)</span>'}</div>
      <p style="color:var(--muted); font-size:12px; margin:0 0 10px;">اختيار الطابعات بيتحفظ على الجهاز ده بس — كل كاشير بإعداده. الطباعة بتبقى صامتة وفورية.</p>
      <div id="printerPickers">${shell ? '<div style="color:var(--muted); font-size:12px;">جارٍ تحميل الطابعات...</div>' : '<div style="color:var(--muted); font-size:12.5px;">🔓 افتح الشاشة دي من برنامج الكاشير المثبّت على ويندوز عشان تختار: طابعة الفواتير · طابعة الليبل · طابعة درج الكاش — من طابعات ويندوز المعرّفة.</div>'}</div>
    </div>

    <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:12px;">
      <div style="font-weight:800; margin-bottom:10px;">👁️ معاينة حية <span style="font-size:11px; color:var(--muted); font-weight:400;">— بتتحدّث مع كل تعديل، بشكل الطباعة الفعلي</span></div>
      <div id="rdPreview" class="w80"></div>
    </div>

    <button onclick="saveReceiptDesignConfig()" style="width:100%; padding:13px; border-radius:10px; border:none; background:var(--plus); color:#062; font-weight:800; cursor:pointer;">حفظ التصميم</button>`;
  if(shell) loadPrinterPickers();
  // ربط كل الحقول بالمعاينة الحية (فاتورة + ليبل)
  ['rdShopName','rdHeaderNote','rdFooterNote','rdPaperWidth','rdShowBarcodeReceipt','rdLabelShopName','rdShowBarcodeLabel'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.addEventListener('input', updateReceiptPreview), el.addEventListener('change', updateReceiptPreview);
  });
  updateReceiptPreview();
}

// المعاينة الحية — فاتورة تجريبية بشكل الطباعة الفعلي، بتقرا القيم من الحقول مباشرة
function updateReceiptPreview(){
  const pv = document.getElementById('rdPreview'); if(!pv) return;
  const shopName = (document.getElementById('rdShopName')?.value || 'المحل').trim() || 'المحل';
  const headerNote = (document.getElementById('rdHeaderNote')?.value || '').trim();
  const footerNote = (document.getElementById('rdFooterNote')?.value || '').trim();
  const paper = document.getElementById('rdPaperWidth')?.value || '80';
  const showBar = document.getElementById('rdShowBarcodeReceipt')?.checked;
  const logo = receiptDesignConfig.logo || '';
  pv.className = paper === '58' ? 'w58' : 'w80';
  const meta = (headerNote ? headerNote + ' | ' : '') + new Date().toLocaleString('ar-EG') + ' | الموظف: أحمد';
  pv.innerHTML =
    (logo ? '<img class="pv-logo" src="'+logo+'">' : '') +
    '<h2>'+esc2(shopName)+'</h2>' +
    '<div class="pv-meta">'+esc2(meta)+'</div>' +
    '<table>' +
      '<tr><td>إيشارب حرير مطبوع</td><td>2×</td><td>340.00</td></tr>' +
      '<tr><td>طرحة قطن سادة</td><td>1×</td><td>120.00</td></tr>' +
      '<tr><td>🎁 مكافأة خاصة (25 ج.م)</td><td>1×</td><td>-25.00</td></tr>' +
    '</table>' +
    '<div class="pv-total">الإجمالي: 435.00 جنيه (كاش: 435.00)</div>' +
    '<div class="pv-inv">INV-000123</div>' +
    (showBar ? '<div class="pv-bar"><svg id="pvBarcode"></svg></div>' : '') +
    (footerNote ? '<div class="pv-foot">'+esc2(footerNote)+'</div>' : '');
  if(showBar){
    try{ if(typeof JsBarcode !== 'undefined') JsBarcode('#pvBarcode', 'FTRH000123-DEMO', { format:'CODE128', width:1.2, height:30, fontSize:10, margin:0, displayValue:true }); }catch(e){}
  }
  // معاينة ليبل السعر
  const lv = document.getElementById('rdLabelPreview');
  if(lv){
    const lblShop = document.getElementById('rdLabelShopName')?.checked;
    const lblBar = document.getElementById('rdShowBarcodeLabel')?.checked;
    lv.innerHTML =
      (lblShop ? '<div class="lv-shop">'+esc2(shopName)+'</div>' : '') +
      '<h3>إيشارب حرير مطبوع</h3>' +
      '<div class="lv-price">340 ج.م</div>' +
      (lblBar ? '<svg id="lvBarcode"></svg>' : '');
    if(lblBar){
      try{ if(typeof JsBarcode !== 'undefined') JsBarcode('#lvBarcode', '6221033445566', { format:'CODE128', width:1.4, height:32, fontSize:10, margin:0 }); }catch(e){}
    }
  }
}
function esc2(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

// رفع اللوجو: بنصغّره تلقائيًا (أقصى عرض 300px) عشان يتخزّن خفيف ويطبع نضيف
function handleReceiptLogoUpload(input){
  const file = input.files && input.files[0]; if(!file) return;
  const img = new Image();
  img.onload = function(){
    const maxW = 300;
    const scale = Math.min(1, maxW / img.width);
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width*scale); cv.height = Math.round(img.height*scale);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    receiptDesignConfig.logo = cv.toDataURL('image/png');
    const prev = document.getElementById('rdLogoPreview');
    prev.src = receiptDesignConfig.logo; prev.style.display = '';
    updateReceiptPreview();
    showToast('اللوجو اتحمّل — متنساش الحفظ');
  };
  img.onerror = ()=> showToast('الصورة دي مش صالحة', 'err');
  img.src = URL.createObjectURL(file);
}
function removeReceiptLogo(){
  receiptDesignConfig.logo = '';
  renderReceiptDesignScreen();
  showToast('اتشال اللوجو — متنساش الحفظ');
}

// اختيار طابعات الجهاز (بيشتغل جوّه غلاف الويندوز عبر window.posShell)
async function loadPrinterPickers(){
  const box = document.getElementById('printerPickers');
  try{
    const printers = await window.posShell.listPrinters();
    const saved = JSON.parse(localStorage.getItem('pos_printers') || '{}');
    const mk = (id, label, hint) => `
      <label style="display:block; font-size:12px; color:var(--muted); margin:8px 0 4px;">${label} <span style="font-size:10px;">${hint||''}</span></label>
      <select id="${id}" style="width:100%; padding:9px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">
        <option value="">— من غير طباعة —</option>
        ${printers.map(p=> `<option value="${p.name.replace(/"/g,'&quot;')}" ${saved[id]===p.name?'selected':''}>${p.name}${p.isDefault?' (الافتراضية)':''}</option>`).join('')}
      </select>`;
    box.innerHTML =
      mk('invoicePrinter', '🧾 طابعة الفواتير', '(بتطبع تلقائي مع كل دفع)') +
      mk('labelPrinter', '🏷️ طابعة الليبل (Zebra)', '') +
      mk('drawerPrinter', '💰 الطابعة الموصّل بيها درج الكاش', '(بيفتح تلقائي مع الكاش)') +
      `<button class="secondary" onclick="savePrinterPickers()" style="width:100%; margin-top:12px; padding:10px;">حفظ طابعات الجهاز ده</button>
       <button class="secondary" onclick="testInvoicePrinter()" style="width:100%; margin-top:8px; padding:10px;">🧪 اختبار طباعة فاتورة تجريبية</button>`;
  }catch(e){ box.innerHTML = '<div style="color:var(--bad); font-size:12px;">تعذر تحميل الطابعات: '+e.message+'</div>'; }
}
function savePrinterPickers(){
  const cfg = {
    invoicePrinter: document.getElementById('invoicePrinter').value,
    labelPrinter: document.getElementById('labelPrinter').value,
    drawerPrinter: document.getElementById('drawerPrinter').value
  };
  localStorage.setItem('pos_printers', JSON.stringify(cfg));
  showToast('اتحفظت طابعات الجهاز ✅');
}
function testInvoicePrinter(){
  printReceipt({cash: 123.45}, 123.45, 'TEST-001', 'FTTEST001-DEMO');
}
async function saveReceiptDesignConfig(){
  const config = {
    shopName: document.getElementById('rdShopName').value.trim() || 'المحل',
    headerNote: document.getElementById('rdHeaderNote').value.trim(),
    footerNote: document.getElementById('rdFooterNote').value.trim(),
    showBarcodeOnReceipt: document.getElementById('rdShowBarcodeReceipt').checked,
    labelShopName: document.getElementById('rdLabelShopName').checked,
    showBarcodeOnLabel: document.getElementById('rdShowBarcodeLabel').checked,
    paperWidth: document.getElementById('rdPaperWidth').value,
    logo: receiptDesignConfig.logo || ''
  };
  try{
    await db.collection(TEST_SETTINGS).doc('receipt_design').set(config, { merge:true });
    receiptDesignConfig = config;
    showToast('اتحفظ التصميم ✅');
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}

function printReceipt(payments, total, invoiceNo, invoiceCode){
  const c = receiptDesignConfig;
  // اللوجو (لو متظبط من محرر التصميم)
  const logoEl = document.getElementById('rLogo');
  if(logoEl){ if(c.logo){ logoEl.src = c.logo; logoEl.style.display = 'block'; } else { logoEl.style.display = 'none'; } }
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
  // ===== الطباعة =====
  // جوّه برنامج الويندوز: طباعة صامتة للطابعة المختارة + فتح الدرج مع الكاش.
  // في المتصفح: نافذة الطباعة العادية زي ما هي (الاحتياطي الدائم).
  const shellCfg = (typeof window.posShell !== 'undefined') ? JSON.parse(localStorage.getItem('pos_printers')||'{}') : null;
  if(shellCfg && shellCfg.invoicePrinter){
    const hasCash = payments && Number(payments.cash) > 0;
    window.posShell.printReceipt({
      printer: shellCfg.invoicePrinter,
      paperWidth: c.paperWidth || '80',
      html: document.getElementById('receiptPrint').outerHTML,
      openDrawer: hasCash ? (shellCfg.drawerPrinter || shellCfg.invoicePrinter) : null
    }).catch(e=> { console.warn('silent print failed, fallback', e); window.print(); });
  }else{
    window.print();
  }
}

// ---------------- Init ----------------
(async function init(){
  await ensureDemoInventory();
  await loadInventory();
  await loadReceiptDesignConfig();
})();
