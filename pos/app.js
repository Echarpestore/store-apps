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

// ---------------- تصميم الفاتورة والليبل (قابل للتعديل من المدير) ----------------// ============================================================
// 🧾 محرر الفاتورة — نظام عناصر: ترتيب حر، إظهار/إخفاء، خط، عربي/إنجليزي
// ============================================================
const RECEIPT_LABELS = {
  ar: { emp:'الموظف', total:'الإجمالي', cash:'كاش', visa:'فيزا', instapay:'انستا باي', currency:'جنيه', invoice:'فاتورة رقم', item:'الصنف', qty:'كمية', price:'السعر' },
  en: { emp:'Cashier', total:'Total', cash:'Cash', visa:'Visa', instapay:'InstaPay', currency:'EGP', invoice:'Invoice #', item:'Item', qty:'Qty', price:'Price' }
};
// تعريف عناصر الفاتورة: fixed = نصه تلقائي من النظام، text = بتكتبه انت
const RECEIPT_ELEMENTS = [
  { id:'logo',      label:'🖼️ اللوجو',              kind:'logo' },
  { id:'shopName',  label:'🏪 اسم المحل',            kind:'text', def:'إيشارب ستور', size:16 },
  { id:'branchName',label:'📍 اسم الفرع',            kind:'text', def:'', size:12 },
  { id:'address',   label:'🗺️ العنوان',              kind:'text', def:'', size:11 },
  { id:'phone',     label:'📞 رقم الموبايل',          kind:'text', def:'', size:11 },
  { id:'meta',      label:'🕐 التاريخ والموظف',       kind:'auto', size:10 },
  { id:'items',     label:'🛒 جدول الأصناف',          kind:'auto', size:12 },
  { id:'totals',    label:'💰 الإجمالي وطرق الدفع',   kind:'auto', size:13 },
  { id:'invoiceNo', label:'🔢 رقم الفاتورة',          kind:'auto', size:11 },
  { id:'barcode',   label:'⬛ باركود المرتجع',        kind:'auto' },
  { id:'footer',    label:'💬 رسالة الختام',          kind:'text', def:'شكرًا لتعاملكم معنا 🙏', size:11 }
];
let receiptDesignConfig = null;

function defaultReceiptConfig(){
  return {
    lang:'ar', paperWidth:'80', logo:'',
    elements: RECEIPT_ELEMENTS.map(e=> ({ id:e.id, on: !(e.id==='branchName'||e.id==='address'||e.id==='phone'), text: e.def||'', size: e.size||12 }))
  };
}
async function loadReceiptDesignConfig(){
  receiptDesignConfig = defaultReceiptConfig();
  try{
    const doc = await db.collection(TEST_SETTINGS).doc('receipt_design').get();
    if(doc.exists){
      const d = doc.data();
      if(Array.isArray(d.elements)){
        // دمج: نحافظ على ترتيبك وإعداداتك، ونضيف أي عنصر جديد في السيستم آخر القايمة
        const saved = d.elements.filter(e=> RECEIPT_ELEMENTS.some(r=> r.id===e.id));
        const missing = RECEIPT_ELEMENTS.filter(r=> !saved.some(e=> e.id===r.id))
          .map(e=> ({ id:e.id, on:false, text:e.def||'', size:e.size||12 }));
        receiptDesignConfig = { lang:d.lang||'ar', paperWidth:d.paperWidth||'80', logo:d.logo||'', elements:[...saved, ...missing] };
      }else{
        // ترقية من النسخة القديمة (خانات ثابتة) — ننقل قيمك القديمة للعناصر
        const c = receiptDesignConfig;
        c.logo = d.logo||''; c.paperWidth = d.paperWidth||'80';
        const set = (id,k,v)=>{ const el=c.elements.find(e=>e.id===id); if(el) el[k]=v; };
        if(d.shopName) set('shopName','text',d.shopName);
        if(d.headerNote){ set('address','text',d.headerNote); set('address','on',true); }
        if(d.footerNote) set('footer','text',d.footerNote);
        if(d.showBarcodeOnReceipt===false) set('barcode','on',false);
        c.labelShopName = d.labelShopName; c.showBarcodeOnLabel = d.showBarcodeOnLabel;
      }
    }
  }catch(e){ console.warn('receipt design load', e); }
}

function goToReceiptDesign(){
  if(!hasPerm('canChangePrices')){ showToast('الصلاحية دي للمدير بس', 'err'); return; }
  showScreen('receiptDesignScreen');
  renderReceiptDesignScreen();
}

async function renderReceiptDesignScreen(){
  if(!receiptDesignConfig) await loadReceiptDesignConfig();
  const c = receiptDesignConfig;
  const shell = (typeof window.posShell !== 'undefined');
  const rows = c.elements.map((el, i)=>{
    const def = RECEIPT_ELEMENTS.find(r=> r.id===el.id) || {label:el.id};
    const isText = def.kind==='text';
    const isLogo = def.kind==='logo';
    return `
    <div style="display:flex; align-items:center; gap:6px; padding:8px; border:1px solid var(--border); border-radius:10px; margin-bottom:6px; background:${el.on?'var(--panel)':'var(--panel2)'}; opacity:${el.on?1:.55};">
      <div style="display:flex; flex-direction:column; gap:2px;">
        <button onclick="moveReceiptEl(${i},-1)" ${i===0?'disabled':''} style="padding:2px 8px; border-radius:6px; border:1px solid var(--border); background:var(--panel2); color:var(--text); cursor:pointer;">▲</button>
        <button onclick="moveReceiptEl(${i},1)" ${i===c.elements.length-1?'disabled':''} style="padding:2px 8px; border-radius:6px; border:1px solid var(--border); background:var(--panel2); color:var(--text); cursor:pointer;">▼</button>
      </div>
      <input type="checkbox" ${el.on?'checked':''} onchange="toggleReceiptEl(${i}, this.checked)" style="width:18px; height:18px;">
      <div style="flex:1; min-width:0;">
        <div style="font-size:12.5px; font-weight:700;">${def.label}</div>
        ${isText?`<input value="${(el.text||'').replace(/"/g,'&quot;')}" oninput="setReceiptElText(${i}, this.value)" placeholder="اكتب النص هنا" style="width:100%; padding:6px 8px; border-radius:7px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-size:12px; margin-top:4px;">`:''}
        ${isLogo?`<div style="display:flex; gap:8px; align-items:center; margin-top:4px;"><input type="file" accept="image/*" onchange="handleReceiptLogoUpload(this)" style="font-size:11px;">${c.logo?'<button onclick="removeReceiptLogo()" style="padding:4px 8px; border-radius:6px; border:1px solid var(--border); background:var(--panel2); color:var(--bad); font-size:11px; cursor:pointer;">🗑️</button>':''}</div>`:''}
      </div>
      ${(!isLogo)?`<select onchange="setReceiptElSize(${i}, this.value)" style="padding:6px; border-radius:7px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-size:11px;">
        ${[9,10,11,12,13,14,16,18,20,22].map(s=>`<option value="${s}" ${el.size==s?'selected':''}>${s}px</option>`).join('')}
      </select>`:''}
    </div>`;
  }).join('');

  document.getElementById('receiptDesignWrap').innerHTML = `
    <div style="display:flex; gap:8px; margin-bottom:12px;">
      <select id="rdLang" onchange="receiptDesignConfig.lang=this.value; refreshReceiptPreview();" style="flex:1; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">
        <option value="ar" ${c.lang!=='en'?'selected':''}>🇪🇬 فاتورة عربي</option>
        <option value="en" ${c.lang==='en'?'selected':''}>🇬🇧 English Receipt</option>
      </select>
      <select id="rdPaperWidth" onchange="receiptDesignConfig.paperWidth=this.value; refreshReceiptPreview();" style="flex:1; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">
        <option value="80" ${c.paperWidth!=='58'?'selected':''}>ورق 80mm</option>
        <option value="58" ${c.paperWidth==='58'?'selected':''}>ورق 58mm</option>
      </select>
    </div>
    <div style="display:grid; grid-template-columns: 1fr 220px; gap:12px; align-items:start;">
      <div>
        <div style="font-size:11.5px; color:var(--muted); margin-bottom:8px;">▲▼ للترتيب · ✅ للإظهار · اكتب نصك · واختار حجم الخط — والمعاينة بتتحدث فورًا</div>
        ${rows}
      </div>
      <div style="position:sticky; top:8px;">
        <div style="font-size:11px; color:var(--muted); margin-bottom:4px; text-align:center;">👁️ معاينة حيّة</div>
        <div id="receiptLivePreview" style="background:#fff; color:#000; border-radius:8px; padding:10px 8px; box-shadow:0 4px 14px rgba(0,0,0,.35); max-height:60vh; overflow-y:auto;"></div>
      </div>
    </div>

    <div style="background:var(--panel); border:1px solid ${shell?'var(--plus)':'var(--border)'}; border-radius:12px; padding:16px; margin:12px 0;">
      <div style="font-weight:800; margin-bottom:6px;">🖨️ طابعات الجهاز ده ${shell?'':'<span style="font-size:11px; color:var(--muted); font-weight:400;">(بيشتغل جوّه برنامج الكاشير على ويندوز)</span>'}</div>
      <div id="printerPickers">${shell ? '<div style="color:var(--muted); font-size:12px;">جارٍ تحميل الطابعات...</div>' : '<div style="color:var(--muted); font-size:12.5px;">🔓 افتح من برنامج الكاشير على ويندوز لاختيار الطابعات.</div>'}</div>
    </div>
    <button onclick="saveReceiptDesignConfig()" style="width:100%; padding:13px; border-radius:10px; border:none; background:var(--plus); color:#062; font-weight:800; cursor:pointer;">حفظ تصميم الفاتورة</button>`;
  refreshReceiptPreview();
  if(shell) loadPrinterPickers();
}
function moveReceiptEl(i, dir){
  const arr = receiptDesignConfig.elements;
  const j = i + dir; if(j<0 || j>=arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  renderReceiptDesignScreen();
}
function toggleReceiptEl(i, on){ receiptDesignConfig.elements[i].on = on; renderReceiptDesignScreen(); }
function setReceiptElText(i, v){ receiptDesignConfig.elements[i].text = v; refreshReceiptPreview(); }
function setReceiptElSize(i, v){ receiptDesignConfig.elements[i].size = parseInt(v)||12; refreshReceiptPreview(); }

function handleReceiptLogoUpload(input){
  const file = input.files && input.files[0]; if(!file) return;
  const img = new Image();
  img.onload = function(){
    const maxW = 300, scale = Math.min(1, maxW / img.width);
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width*scale); cv.height = Math.round(img.height*scale);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    receiptDesignConfig.logo = cv.toDataURL('image/png');
    renderReceiptDesignScreen();
    showToast('اللوجو اتحمّل — متنساش الحفظ');
  };
  img.onerror = ()=> showToast('الصورة دي مش صالحة', 'err');
  img.src = URL.createObjectURL(file);
}
function removeReceiptLogo(){ receiptDesignConfig.logo=''; renderReceiptDesignScreen(); }

// بيبني HTML الفاتورة من العناصر بالترتيب — بيستخدمه العرض الحي والطباعة الفعلية
function buildReceiptHTML(data){
  const c = receiptDesignConfig || defaultReceiptConfig();
  const L = RECEIPT_LABELS[c.lang] || RECEIPT_LABELS.ar;
  const dir = c.lang==='en' ? 'ltr' : 'rtl';
  const d = data || {};
  const parts = [];
  for(const el of c.elements){
    if(!el.on) continue;
    const fs = (el.size||12) + 'px';
    switch(el.id){
      case 'logo':
        if(c.logo) parts.push(`<img src="${c.logo}" style="display:block; margin:0 auto 6px; max-width:60%; max-height:70px;">`);
        break;
      case 'shopName': if(el.text) parts.push(`<div style="text-align:center; font-weight:bold; font-size:${fs}; margin:2px 0;">${el.text}</div>`); break;
      case 'branchName': case 'address': case 'phone': case 'footer':
        if(el.text) parts.push(`<div style="text-align:center; font-size:${fs}; margin:2px 0;">${el.text}</div>`); break;
      case 'meta':
        parts.push(`<div style="text-align:center; font-size:${fs}; margin:3px 0;">${d.dateStr||''}${d.empName?' · '+L.emp+': '+d.empName:''}</div>`); break;
      case 'items':
        parts.push(`<table style="width:100%; border-collapse:collapse; font-size:${fs}; margin:4px 0;">${(d.items||[]).map(it=>
          `<tr><td style="padding:2px 0; border-bottom:1px dashed #999;">${it.name}</td><td style="padding:2px 4px; border-bottom:1px dashed #999; white-space:nowrap;">${it.qty}×</td><td style="padding:2px 0; border-bottom:1px dashed #999; white-space:nowrap; text-align:${dir==='rtl'?'left':'right'};">${it.line}</td></tr>`).join('')}</table>`); break;
      case 'totals':
        parts.push(`<div style="text-align:center; font-weight:bold; font-size:${fs}; margin:5px 0 2px;">${L.total}: ${d.totalStr||''} ${L.currency}${d.payStr?' ('+d.payStr+')':''}</div>`); break;
      case 'invoiceNo':
        if(d.invoiceNo) parts.push(`<div style="text-align:center; font-size:${fs};">${L.invoice} ${d.invoiceNo}</div>`); break;
      case 'barcode':
        parts.push(`<div style="text-align:center; margin-top:5px;"><svg id="rBarcodeDyn"></svg></div>`); break;
    }
  }
  return `<div dir="${dir}" style="font-family:Arial, sans-serif;">${parts.join('')}</div>`;
}
function receiptSampleData(){
  const L = RECEIPT_LABELS[(receiptDesignConfig&&receiptDesignConfig.lang)||'ar'];
  return {
    dateStr: new Date().toLocaleString(receiptDesignConfig&&receiptDesignConfig.lang==='en'?'en-GB':'ar-EG'),
    empName: (currentEmployee&&currentEmployee.name)||'أحمد',
    items: [ {name:'إيشارب حرير', qty:1, line:'250.00'}, {name:'طرحة شيفون', qty:2, line:'300.00'} ],
    totalStr:'550.00', payStr:L.cash+': 550.00', invoiceNo:'INV-000123', scanCode:'FTRH123-DEMO'
  };
}
function refreshReceiptPreview(){
  const box = document.getElementById('receiptLivePreview'); if(!box) return;
  const c = receiptDesignConfig;
  box.style.width = (c.paperWidth==='58'? '150px' : '200px');
  const d = receiptSampleData();
  box.innerHTML = buildReceiptHTML(d);
  try{ if(typeof JsBarcode!=='undefined' && box.querySelector('#rBarcodeDyn')) JsBarcode(box.querySelector('#rBarcodeDyn'), d.scanCode, {format:'CODE128', width:1.1, height:26, fontSize:9, margin:0, displayValue:true}); }catch(e){}
}

async function saveReceiptDesignConfig(){
  try{
    // توافق مؤقت مع طباعة الليبل الحالية (لحد ما محرر الليبل الجديد ينزل):
    const cfg = JSON.parse(JSON.stringify(receiptDesignConfig));
    const shopEl = cfg.elements.find(e=> e.id==='shopName');
    cfg.shopName = (shopEl && shopEl.text) || 'المحل';
    if(typeof cfg.labelShopName === 'undefined') cfg.labelShopName = true;
    if(typeof cfg.showBarcodeOnLabel === 'undefined') cfg.showBarcodeOnLabel = true;
    await db.collection(TEST_SETTINGS).doc('receipt_design').set(cfg);
    receiptDesignConfig = cfg;
    showToast('اتحفظ تصميم الفاتورة ✅');
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}

// اختيار طابعات الجهاز (جوّه غلاف الويندوز)
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
  const d = receiptSampleData();
  _printBuiltReceipt(d, {cash:550});
}

// الطباعة الفعلية: بيبني الفاتورة من تصميمك ويطبعها (صامت جوّه البرنامج / نافذة في المتصفح)
function printReceipt(payments, total, invoiceNo, invoiceCode){
  const c = receiptDesignConfig || defaultReceiptConfig();
  const L = RECEIPT_LABELS[c.lang] || RECEIPT_LABELS.ar;
  const payStr = Object.entries(payments||{}).filter(([k,v])=>v>0).map(([k,v])=> (L[k]||k)+': '+Number(v).toFixed(2)).join(' | ');
  const data = {
    dateStr: new Date().toLocaleString(c.lang==='en'?'en-GB':'ar-EG'),
    empName: (currentEmployee&&currentEmployee.name)||'',
    items: cart.map(it=> ({name:it.name, qty:it.qty, line:(it.price*it.qty).toFixed(2)})),
    totalStr: Number(total).toFixed(2), payStr, invoiceNo: invoiceNo||'', scanCode: invoiceCode||invoiceNo||''
  };
  _printBuiltReceipt(data, payments);
}
function _printBuiltReceipt(data, payments){
  const c = receiptDesignConfig || defaultReceiptConfig();
  const holder = document.getElementById('receiptPrint');
  holder.innerHTML = buildReceiptHTML(data);
  const barcodeEl = holder.querySelector('#rBarcodeDyn');
  if(barcodeEl && data.scanCode){
    try{ if(typeof JsBarcode!=='undefined') JsBarcode(barcodeEl, data.scanCode, {format:'CODE128', width:1.4, height:34, fontSize:11, margin:0, displayValue:true}); }catch(e){}
  }
  const shellCfg = (typeof window.posShell !== 'undefined') ? JSON.parse(localStorage.getItem('pos_printers')||'{}') : null;
  if(shellCfg && shellCfg.invoicePrinter){
    const hasCash = payments && Number(payments.cash) > 0;
    window.posShell.printReceipt({
      printer: shellCfg.invoicePrinter,
      paperWidth: c.paperWidth || '80',
      html: holder.outerHTML,
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
