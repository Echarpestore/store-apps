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
function currencyLabel(){
  const c = receiptDesignConfig||{};
  return (c.lang==='en') ? (c.currencyEn||'EGP') : (c.currencyAr||'ج.م');
}
const RECEIPT_LABELS = {
  ar: { emp:'الموظف', total:'الإجمالي', cash:'كاش', visa:'فيزا', instapay:'انستا باي', currency:'ج.م', invoice:'فاتورة رقم', item:'الصنف', qty:'كمية', price:'السعر' },
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
  { id:'appQR',     label:'📱 QR تحميل التطبيق (للعملاء الغير مسجّلين/من غير تطبيق)', kind:'auto', size:10 },
  { id:'spacer',    label:'⬜ مسافة فارغة',           kind:'multi', size:8 },
  { id:'divider',   label:'➖ خط فاصل',               kind:'multi', size:4 },
  { id:'footer',    label:'💬 رسالة الختام',          kind:'text', def:'شكرًا لتعاملكم معنا 🙏', size:11 }
];
// 🏷️ مقاسات الليبل العالمية (Zebra وغيرها) بالمليمتر
const LABEL_SIZES = [
  {id:'40x25', w:40, h:25}, {id:'50x25', w:50, h:25}, {id:'50x30', w:50, h:30},
  {id:'58x40', w:58, h:40}, {id:'60x40', w:60, h:40}, {id:'70x40', w:70, h:40},
  {id:'75x50', w:75, h:50}, {id:'100x50', w:100, h:50}, {id:'100x75', w:100, h:75},
  {id:'100x150', w:100, h:150}
];
const LABEL_ELEMENTS = [
  { id:'logo',    label:'🖼️ لوجو المحل',        kind:'logo' },
  { id:'shop',    label:'🏪 اسم المحل',          kind:'auto', size:9 },
  { id:'name',    label:'📦 اسم المنتج',         kind:'auto', size:13 },
  { id:'price',   label:'💵 السعر',              kind:'auto', size:20 },
  { id:'barcode', label:'⬛ الباركود (الرسمة)',   kind:'auto' },
  { id:'code',    label:'🔖 الكود (أرقام)',       kind:'auto', size:9 }
];
function defaultLabelConfig(){
  return { sizeId:'58x40', customW:58, customH:40, priceStyle:'box', bcHeight:30, bcWidth:1.4, bcWidthPct:85, showBcDigits:false, logoWidth:50,
    elements: LABEL_ELEMENTS.map(e=> ({ id:e.id, on: e.id!=='logo', size:e.size||10 })) };
}
let receiptDesignConfig = null;

function defaultReceiptConfig(){
  return {
    lang:'ar', paperWidth:'80', logo:'', logoWidth:60, bcHeight:34, bcWidth:1.4, bcWidthPct:90, bcFont:11, currencyAr:'ج.م', currencyEn:'EGP',
    elements: RECEIPT_ELEMENTS.filter(e=> e.kind!=='multi').map(e=> ({ id:e.id, on: !(e.id==='branchName'||e.id==='address'||e.id==='phone'), text: e.def||'', size: e.size||12 }))
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
        const saved = d.elements.filter(e=> RECEIPT_ELEMENTS.some(r=> r.id===e.id) || /^(spacer|divider)/.test(e.id));
        const missing = RECEIPT_ELEMENTS.filter(r=> r.kind!=='multi' && !saved.some(e=> e.id===r.id))
          .map(e=> ({ id:e.id, on:false, text:e.def||'', size:e.size||12 }));
        receiptDesignConfig = Object.assign(defaultReceiptConfig(), d, { elements:[...saved, ...missing] });
        receiptDesignConfig.labelShopName = d.labelShopName; receiptDesignConfig.showBarcodeOnLabel = d.showBarcodeOnLabel;
        if(d.label && Array.isArray(d.label.elements)){
          const ls = d.label.elements.filter(e=> LABEL_ELEMENTS.some(r=> r.id===e.id));
          const lm = LABEL_ELEMENTS.filter(r=> !ls.some(e=> e.id===r.id)).map(e=> ({id:e.id, on:false, size:e.size||10}));
          receiptDesignConfig.label = Object.assign(defaultLabelConfig(), d.label, { elements:[...ls, ...lm] });
        }
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
  if(!receiptDesignConfig.label) receiptDesignConfig.label = defaultLabelConfig();
}

function goToReceiptDesign(){
  if(!hasPerm('canChangePrices')){ showToast('الصلاحية دي للمدير بس', 'err'); return; }
  showScreen('receiptDesignScreen');
  renderReceiptDesignScreen();
}

let _designTab = 'receipt';   // receipt | label
async function renderReceiptDesignScreen(){
  if(!receiptDesignConfig) await loadReceiptDesignConfig();
  const c = receiptDesignConfig;
  if(!c.label) c.label = defaultLabelConfig();
  const lb = c.label;
  const shell = (typeof window.posShell !== 'undefined');

  const S = {
    card: 'background:var(--panel); border:1px solid var(--border); border-radius:14px; padding:14px; margin-bottom:12px;',
    row: 'display:flex; align-items:center; gap:10px; padding:10px 12px; border:1px solid var(--border); border-radius:12px; margin-bottom:8px; background:var(--panel); transition:opacity .15s;',
    ctl: 'padding:8px 10px; border-radius:9px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-size:12px;',
    slider: 'flex:1; accent-color:#818cf8;',
    chipOn: 'padding:7px 13px; border-radius:99px; border:1.5px solid #818cf8; background:rgba(129,140,248,.15); color:var(--text); font-weight:800; font-size:12px; cursor:pointer;',
    chip: 'padding:7px 13px; border-radius:99px; border:1px solid var(--border); background:var(--panel2); color:var(--muted); font-weight:700; font-size:12px; cursor:pointer;'
  };
  const slider = (label, val, min, max, step, oninput) =>
    `<div style="display:flex; align-items:center; gap:8px; margin:8px 0;">
      <span style="font-size:11.5px; color:var(--muted); min-width:88px;">${label}</span>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${val}" oninput="${oninput}" style="${S.slider}">
      <b style="font-size:11px; min-width:34px; text-align:center;">${val}</b>
    </div>`;

  const elRow = (el, i, defs, moveFn, togglePath, sizePath, refreshFn) => {
    let def = defs.find(r=> r.id===el.id);
    if(!def && el.id.indexOf('spacer')===0)  def = {label:'↕️ مسافة فارغة', kind:'dyn'};
    if(!def && el.id.indexOf('divider')===0) def = {label:'➖ خط فاصل', kind:'dyn'};
    if(!def) def = {label:el.id};
    const isText = def.kind==='text', isLogo = def.kind==='logo';
    const isDyn = def.kind==='dyn', isSpacer = el.id.indexOf('spacer')===0;
    return `
    <div style="${S.row} ${el.on?'':'opacity:.45;'}">
      <div style="display:flex; flex-direction:column;">
        <button onclick="${moveFn}(${i},-1)" ${i===0?'disabled':''} style="border:none; background:none; color:var(--muted); cursor:pointer; padding:0 4px; font-size:13px;">▲</button>
        <button onclick="${moveFn}(${i},1)" style="border:none; background:none; color:var(--muted); cursor:pointer; padding:0 4px; font-size:13px;">▼</button>
      </div>
      <label class="dsw" style="position:relative; width:38px; height:22px; flex-shrink:0; cursor:pointer;">
        <input type="checkbox" ${el.on?'checked':''} onchange="${togglePath}[${i}].on=this.checked; renderReceiptDesignScreen();" style="opacity:0; width:0; height:0;">
        <span style="position:absolute; inset:0; border-radius:99px; background:${el.on?'#818cf8':'var(--panel2)'}; border:1px solid var(--border); transition:.15s;"></span>
        <span style="position:absolute; top:2.5px; ${el.on?'left:18px;':'left:3px;'} width:15px; height:15px; border-radius:50%; background:#fff; transition:.15s;"></span>
      </label>
      <div style="flex:1; min-width:0;">
        <div style="font-size:12.5px; font-weight:800;">${def.label} ${isMulti?`<button onclick="deleteReceiptEl(${i})" style="border:none; background:none; color:var(--bad); cursor:pointer; font-size:12px;">🗑️</button>`:''}</div>
        ${isText?`<input value="${(el.text||'').replace(/"/g,'&quot;')}" oninput="${togglePath}[${i}].text=this.value; ${refreshFn}();" placeholder="اكتب النص..." style="width:100%; margin-top:5px; ${S.ctl}">`:''}
      </div>
      ${isDyn?`<button onclick="removeReceiptDynEl(${i})" style="border:none; background:none; color:var(--bad); cursor:pointer; font-size:14px;">🗑️</button>`:''}
      ${((!isLogo && el.id!=='barcode' && el.id!=='appQR' && el.id.indexOf('divider')!==0) || isSpacer)?`
      <div style="display:flex; align-items:center; gap:4px;">
        <button onclick="${sizePath}[${i}].size=Math.max(7,(${sizePath}[${i}].size||12)-1); renderReceiptDesignScreen();" style="width:26px; height:26px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); cursor:pointer;">−</button>
        <span style="font-size:11px; min-width:30px; text-align:center;">${el.size||12}px</span>
        <button onclick="${sizePath}[${i}].size=Math.min(34,(${sizePath}[${i}].size||12)+1); renderReceiptDesignScreen();" style="width:26px; height:26px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); cursor:pointer;">+</button>
      </div>`:''}
    </div>`;
  };

  // ====== تبويب الفاتورة ======
  const receiptTab = `
    <div style="${S.card}">
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button onclick="receiptDesignConfig.lang='ar'; renderReceiptDesignScreen();" style="${c.lang!=='en'?S.chipOn:S.chip}">🇪🇬 عربي</button>
        <button onclick="receiptDesignConfig.lang='en'; renderReceiptDesignScreen();" style="${c.lang==='en'?S.chipOn:S.chip}">🇬🇧 English</button>
        <span style="flex:1;"></span>
        <button onclick="receiptDesignConfig.paperWidth='80'; renderReceiptDesignScreen();" style="${c.paperWidth!=='58'?S.chipOn:S.chip}">ورق 80mm</button>
        <button onclick="receiptDesignConfig.paperWidth='58'; renderReceiptDesignScreen();" style="${c.paperWidth==='58'?S.chipOn:S.chip}">58mm</button>
      </div>
      <div style="display:flex; gap:8px; margin-top:10px; align-items:center;">
        <span style="font-size:11.5px; color:var(--muted);">العملة:</span>
        <input value="${c.currencyAr||'ج.م'}" oninput="receiptDesignConfig.currencyAr=this.value; refreshReceiptPreview(); refreshLabelPreview();" style="width:80px; text-align:center; ${S.ctl}" placeholder="ج.م">
        <input value="${c.currencyEn||'EGP'}" oninput="receiptDesignConfig.currencyEn=this.value; refreshReceiptPreview(); refreshLabelPreview();" style="width:80px; text-align:center; direction:ltr; ${S.ctl}" placeholder="EGP">
        <span style="font-size:10.5px; color:var(--muted);">(عربي / English)</span>
      </div>
    </div>

    <div style="${S.card}">
      <div style="font-weight:800; font-size:13px; margin-bottom:8px;">🖼️ اللوجو &nbsp;<input type="file" accept="image/*" onchange="handleReceiptLogoUpload(this)" style="font-size:11px;"> ${c.logo?'<button onclick="removeReceiptLogo()" style="border:none; background:none; color:var(--bad); cursor:pointer;">🗑️ شيل</button>':''}</div>
      ${c.logo? slider('حجم اللوجو %', c.logoWidth||60, 20, 100, 5, "receiptDesignConfig.logoWidth=+this.value; this.nextElementSibling.textContent=this.value; refreshReceiptPreview();") : '<div style="font-size:11px; color:var(--muted);">ارفع لوجو وهيظهر هنا التحكم في حجمه</div>'}
    </div>

    <div style="${S.card}">
      <div style="font-weight:800; font-size:13px; margin-bottom:6px;">⬛ باركود المرتجع</div>
      ${slider('الارتفاع (px)', c.bcHeight||34, 18, 80, 2, "receiptDesignConfig.bcHeight=+this.value; this.nextElementSibling.textContent=this.value; refreshReceiptPreview();")}
      ${slider('العرض %', c.bcWidthPct||90, 40, 100, 5, "receiptDesignConfig.bcWidthPct=+this.value; this.nextElementSibling.textContent=this.value; refreshReceiptPreview();")}
      ${slider('حجم الأرقام', c.bcFont||11, 7, 16, 1, "receiptDesignConfig.bcFont=+this.value; this.nextElementSibling.textContent=this.value; refreshReceiptPreview();")}
    </div>

    <div style="display:flex; gap:8px; align-items:center; margin:2px 2px 8px;">
      <span style="font-size:11px; color:var(--muted); flex:1;">✥ رتّب بالأسهم · − + للحجم</span>
      <button onclick="addReceiptSpacer()" style="${S.chip}">➕ مسافة</button>
      <button onclick="addReceiptDivider()" style="${S.chip}">➕ خط فاصل</button>
    </div>
    ${c.elements.map((el,i)=> elRow(el, i, RECEIPT_ELEMENTS, 'moveReceiptEl', 'receiptDesignConfig.elements', 'receiptDesignConfig.elements', 'refreshReceiptPreview')).join('')}`;

  // ====== تبويب الليبل ======
  const priceStyles = [
    {id:'plain', name:'عادي'},
    {id:'box',   name:'إطار'},
    {id:'solid', name:'خلفية سودا'},
    {id:'tag',   name:'وسم دائري'}
  ];
  const labelTab = `
    <div style="${S.card}">
      <div style="font-weight:800; font-size:13px; margin-bottom:8px;">📐 مقاس الليبل</div>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        ${LABEL_SIZES.map(s=>`<button onclick="setLabelSize('${s.id}')" style="${lb.sizeId===s.id?S.chipOn:S.chip}">${s.w}×${s.h}</button>`).join('')}
        <button onclick="setLabelSize('custom')" style="${lb.sizeId==='custom'?S.chipOn:S.chip}">مخصص</button>
      </div>
      <div id="labelCustomSize" style="display:${lb.sizeId==='custom'?'flex':'none'}; gap:6px; align-items:center; margin-top:8px;">
        <input type="number" value="${lb.customW}" onchange="receiptDesignConfig.label.customW=parseFloat(this.value)||58; refreshLabelPreview();" style="width:64px; text-align:center; ${S.ctl}"> ×
        <input type="number" value="${lb.customH}" onchange="receiptDesignConfig.label.customH=parseFloat(this.value)||40; refreshLabelPreview();" style="width:64px; text-align:center; ${S.ctl}"> مم
      </div>
    </div>

    <div style="${S.card}">
      <div style="font-weight:800; font-size:13px; margin-bottom:8px;">💵 شكل السعر</div>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        ${priceStyles.map(p=>`<button onclick="receiptDesignConfig.label.priceStyle='${p.id}'; renderReceiptDesignScreen();" style="${lb.priceStyle===p.id?S.chipOn:S.chip}">${p.name}</button>`).join('')}
      </div>
    </div>

    <div style="${S.card}">
      <div style="font-weight:800; font-size:13px; margin-bottom:6px;">⬛ باركود الليبل</div>
      ${slider('الارتفاع (px)', lb.bcHeight||30, 12, 80, 2, "receiptDesignConfig.label.bcHeight=+this.value; this.nextElementSibling.textContent=this.value; refreshLabelPreview();")}
      ${slider('العرض %', lb.bcWidthPct||85, 35, 100, 5, "receiptDesignConfig.label.bcWidthPct=+this.value; this.nextElementSibling.textContent=this.value; refreshLabelPreview();")}
      ${c.logo? slider('حجم اللوجو %', lb.logoWidth||50, 20, 90, 5, "receiptDesignConfig.label.logoWidth=+this.value; this.nextElementSibling.textContent=this.value; refreshLabelPreview();") : ''}
    </div>

    ${lb.elements.map((el,i)=> elRow(el, i, LABEL_ELEMENTS, 'moveLabelEl', 'receiptDesignConfig.label.elements', 'receiptDesignConfig.label.elements', 'refreshLabelPreview')).join('')}`;

  document.getElementById('receiptDesignWrap').innerHTML = `
    <div style="display:flex; gap:6px; margin-bottom:12px; background:var(--panel2); border-radius:12px; padding:5px;">
      <button onclick="_designTab='receipt'; renderReceiptDesignScreen();" style="flex:1; padding:11px; border-radius:9px; border:none; cursor:pointer; font-weight:800; font-size:13px; ${_designTab==='receipt'?'background:var(--panel); color:var(--text); box-shadow:0 2px 8px rgba(0,0,0,.25);':'background:none; color:var(--muted);'}">🧾 الفاتورة</button>
      <button onclick="_designTab='label'; renderReceiptDesignScreen();" style="flex:1; padding:11px; border-radius:9px; border:none; cursor:pointer; font-weight:800; font-size:13px; ${_designTab==='label'?'background:var(--panel); color:var(--text); box-shadow:0 2px 8px rgba(0,0,0,.25);':'background:none; color:var(--muted);'}">🏷️ ليبل السعر</button>
    </div>
    <div style="display:grid; grid-template-columns: 1fr 230px; gap:14px; align-items:start;">
      <div>${_designTab==='receipt' ? receiptTab : labelTab}</div>
      <div style="position:sticky; top:8px;">
        <div style="font-size:11px; color:var(--muted); margin-bottom:5px; text-align:center;">👁️ معاينة حيّة</div>
        <div style="display:${_designTab==='receipt'?'block':'none'};"><div id="receiptLivePreview" style="background:#fff; color:#000; border-radius:10px; padding:10px 8px; box-shadow:0 6px 20px rgba(0,0,0,.4); max-height:62vh; overflow-y:auto; margin:0 auto;"></div></div>
        <div style="display:${_designTab==='label'?'block':'none'};">
          <div style="display:flex; justify-content:center;"><div id="labelLivePreview" style="background:#fff; color:#000; border:1px dashed #999; border-radius:4px; overflow:hidden; box-shadow:0 6px 20px rgba(0,0,0,.4);"></div></div>
          <div id="labelSizeNote" style="font-size:10px; color:var(--muted); text-align:center; margin-top:5px;"></div>
        </div>
      </div>
    </div>

    <div style="${S.card} margin-top:12px; ${shell?'border-color:var(--plus);':''}">
      <div style="font-weight:800; margin-bottom:6px;">🖨️ طابعات الجهاز ده ${shell?'':'<span style="font-size:11px; color:var(--muted); font-weight:400;">(بيشتغل جوّه برنامج الكاشير على ويندوز)</span>'}</div>
      <div id="printerPickers">${shell ? '<div style="color:var(--muted); font-size:12px;">جارٍ تحميل الطابعات...</div>' : '<div style="color:var(--muted); font-size:12.5px;">🔓 افتح من برنامج الكاشير على ويندوز لاختيار الطابعات.</div>'}</div>
    </div>
    <button onclick="saveReceiptDesignConfig()" style="width:100%; padding:14px; border-radius:12px; border:none; background:var(--plus); color:#062; font-weight:800; font-size:14px; cursor:pointer;">💾 حفظ التصميم</button>`;
  refreshReceiptPreview();
  refreshLabelPreview();
  if(shell) loadPrinterPickers();
}
// بيرسم الباركود على canvas ويرجّعه صورة — مضمون في المعاينة والطباعة (الصامتة كمان) وبدقة عالية
function receiptBarcodeImg(code){
  try{
    if(typeof JsBarcode==='undefined' || !code) return '';
    const c = receiptDesignConfig||defaultReceiptConfig();
    const cv = document.createElement('canvas');
    JsBarcode(cv, code, {format:'CODE128', width:3, height:(c.bcHeight||34)*3, fontSize:(c.bcFont||11)*3, margin:6, displayValue:true});
    return cv.toDataURL('image/png');
  }catch(e){ return ''; }
}
function buildReceiptHTML(data){
  const c = receiptDesignConfig || defaultReceiptConfig();
  const L = RECEIPT_LABELS[c.lang] || RECEIPT_LABELS.ar;
  const dir = c.lang==='en' ? 'ltr' : 'rtl';
  const d = data || {};
  const parts = [];
  for(const el of c.elements){
    if(!el.on) continue;
    const fs = (el.size||12) + 'px';
    if(el.id.indexOf('spacer')===0){ parts.push(`<div style="height:${el.size||10}px;"></div>`); continue; }
    if(el.id.indexOf('divider')===0){ parts.push(`<div style="border-top:1.5px dashed #555; margin:4px 2px;"></div>`); continue; }
    switch(el.base||el.id){
      case 'spacer': parts.push(`<div style="height:${el.size||8}px;"></div>`); break;
      case 'divider': parts.push(`<div style="border-top:1.5px dashed #000; margin:${el.size||4}px 0;"></div>`); break;
      case 'logo':
        if(c.logo) parts.push(`<img src="${c.logo}" style="display:block; margin:0 auto 6px; max-width:${c.logoWidth||60}%;">`);
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
        parts.push(`<div style="text-align:center; font-weight:bold; font-size:${fs}; margin:5px 0 2px;">${L.total}: ${d.totalStr||''} ${currencyLabel()}${d.payStr?' ('+d.payStr+')':''}</div>`); break;
      case 'invoiceNo':
        if(d.invoiceNo) parts.push(`<div style="text-align:center; font-size:${fs};">${L.invoice} ${d.invoiceNo}</div>`); break;
      case 'barcode': {
        const bimg = receiptBarcodeImg(d.scanCode);
        if(bimg) parts.push(`<img src="${bimg}" style="width:${c.bcWidthPct||90}%; display:block; margin:4px auto 0;">`);
        break; }
      case 'appQR':
        if(d.showAppQR && d.appQrImg){
          parts.push(`<div style="text-align:center; margin-top:6px; border-top:1px dashed #999; padding-top:6px;">
            <div style="font-size:${fs}; font-weight:bold;">📱 ${d.appQrTitle||''}</div>
            <img src="${d.appQrImg}" style="width:88px; height:88px; margin:3px auto; display:block;">
            <div style="font-size:${Math.max(8,(el.size||10)-1)}px;">${d.appQrMsg||''}</div>
          </div>`);
        }
        break;
    }
  }
  return `<div dir="${dir}" style="font-family:Arial, sans-serif;">${parts.join('')}</div>`;
}
// 📱 QR الفاتورة: بنجيب صورته مرة واحدة ونخزّنها محليًا — عشان الطباعة تبقى فورية وأوفلاين
function receiptQrKey(){
  const isGlow = (typeof GLOW_BRANCHES!=='undefined') && GLOW_BRANCHES.includes(currentBranch);
  return { app: isGlow?'glow':'loyalty', key: 'rcpt_qr_' + (isGlow?'glow':'loyalty') + '_' + (currentBranch||'') };
}
async function ensureReceiptQrCached(){
  try{
    const {app, key} = receiptQrKey();
    if(localStorage.getItem(key)) return;
    const url = 'https://echarpestore.github.io/store-apps/' + app + '/?src=' + encodeURIComponent('qr-rcpt-' + (currentBranch||'').replace(/\s+/g,'-'));
    const img = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=1&data=' + encodeURIComponent(url);
    const res = await fetch(img); const blob = await res.blob();
    const dataUrl = await new Promise((ok,bad)=>{ const r=new FileReader(); r.onload=()=>ok(r.result); r.onerror=bad; r.readAsDataURL(blob); });
    localStorage.setItem(key, dataUrl);
  }catch(e){ /* أوفلاين؟ نجرّب تاني المرة الجاية — الفاتورة بتطبع عادي من غير QR */ }
}
function welcomeRewardText(){
  const isGlow = (typeof GLOW_BRANCHES!=='undefined') && GLOW_BRANCHES.includes(currentBranch);
  const w = (loyaltyRedemptionConfig && loyaltyRedemptionConfig.welcome) || {};
  const cfg = w[isGlow?'glow':'echarpe'];
  if(!cfg || !cfg.enabled || !(cfg.value>0)) return 'سجّلي واكسبي نقط على كل مشترياتك 🎁';
  const base = cfg.type==='points' ? ('هدية ترحيب: ' + cfg.value + ' نقطة 🎁') : ('هدية ترحيب: خصم ' + cfg.value + ' ج.م 🎁');
  return base + (cfg.type!=='points' && cfg.minInvoice>0 ? ' (على فاتورة ' + cfg.minInvoice + '+ ج.م)' : '') + ' — حمّلي التطبيق وفعّلي الإشعارات';
}
function receiptSampleData(){
  const L = RECEIPT_LABELS[(receiptDesignConfig&&receiptDesignConfig.lang)||'ar'];
  return {
    dateStr: new Date().toLocaleString(receiptDesignConfig&&receiptDesignConfig.lang==='en'?'en-GB':'ar-EG'),
    empName: (currentEmployee&&currentEmployee.name)||'أحمد',
    items: [ {name:'إيشارب حرير', qty:1, line:'250.00'}, {name:'طرحة شيفون', qty:2, line:'300.00'} ],
    totalStr:'550.00', payStr:L.cash+': 550.00', invoiceNo:'INV-000123', scanCode:'FTRH123-DEMO',
    showAppQR:true, appQrImg: localStorage.getItem(receiptQrKey().key)||'', appQrTitle:'حمّلي تطبيقنا!', appQrMsg: welcomeRewardText()
  };
}
function refreshReceiptPreview(){
  const box = document.getElementById('receiptLivePreview'); if(!box) return;
  const c = receiptDesignConfig;
  box.style.width = (c.paperWidth==='58'? '150px' : '200px');
  const d = receiptSampleData();
  box.innerHTML = buildReceiptHTML(d);
}

function setLabelSize(v){
  receiptDesignConfig.label.sizeId = v;
  const box = document.getElementById('labelCustomSize');
  if(box) box.style.display = v==='custom' ? 'flex' : 'none';
  refreshLabelPreview();
}
function addReceiptSpacer(){
  receiptDesignConfig.elements.push({ id:'spacer_'+Date.now().toString(36), on:true, size:10 });
  renderReceiptDesignScreen();
}
function addReceiptDivider(){
  receiptDesignConfig.elements.push({ id:'divider_'+Date.now().toString(36), on:true });
  renderReceiptDesignScreen();
}
function removeReceiptDynEl(i){
  receiptDesignConfig.elements.splice(i,1);
  renderReceiptDesignScreen();
}
function addReceiptMulti(base){
  const def = RECEIPT_ELEMENTS.find(r=> r.id===base);
  receiptDesignConfig.elements.push({ id: base+'_'+Date.now().toString(36), base, on:true, size:(def&&def.size)||8 });
  renderReceiptDesignScreen();
}
function deleteReceiptEl(i){
  receiptDesignConfig.elements.splice(i,1);
  renderReceiptDesignScreen();
}
function moveReceiptEl(i, dir){
  const arr = receiptDesignConfig.elements;
  const j = i + dir; if(j<0 || j>=arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  renderReceiptDesignScreen();
}
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
function removeReceiptLogo(){ receiptDesignConfig.logo=''; renderReceiptDesignScreen(); showToast('اتشال اللوجو'); }
function moveLabelEl(i, dir){
  const arr = receiptDesignConfig.label.elements;
  const j = i+dir; if(j<0||j>=arr.length) return;
  [arr[i],arr[j]]=[arr[j],arr[i]];
  renderReceiptDesignScreen();
}
function labelSizeMM(){
  const lb = (receiptDesignConfig&&receiptDesignConfig.label)||defaultLabelConfig();
  if(lb.sizeId==='custom') return {w: lb.customW||58, h: lb.customH||40};
  const s = LABEL_SIZES.find(x=> x.id===lb.sizeId) || LABEL_SIZES[3];
  return {w:s.w, h:s.h};
}
// بيبني HTML ليبل واحد من تصميمك — مقاسات حقيقية بالمليمتر (للطباعة الدقيقة)
function buildLabelHTML(it, barcodeSvgId){
  const c = receiptDesignConfig||defaultReceiptConfig();
  const lb = c.label||defaultLabelConfig();
  const {w,h} = labelSizeMM();
  const shopEl = (c.elements||[]).find(e=> e.id==='shopName');
  const parts = [];
  for(const el of lb.elements){
    if(!el.on) continue;
    const fs = (el.size||10)+'px';
    if(el.id.indexOf('spacer')===0){ parts.push(`<div style="height:${el.size||10}px;"></div>`); continue; }
    if(el.id.indexOf('divider')===0){ parts.push(`<div style="border-top:1.5px dashed #555; margin:4px 2px;"></div>`); continue; }
    switch(el.base||el.id){
      case 'spacer': parts.push(`<div style="height:${el.size||8}px;"></div>`); break;
      case 'divider': parts.push(`<div style="border-top:1.5px dashed #000; margin:${el.size||4}px 0;"></div>`); break;
      case 'logo': if(c.logo) parts.push(`<img src="${c.logo}" style="display:block; margin:0 auto; max-width:${lb.logoWidth||50}%; max-height:${Math.round(h*0.3)}mm;">`); break;
      case 'shop': parts.push(`<div style="font-size:${fs}; color:#444;">${(shopEl&&shopEl.text)||''}</div>`); break;
      case 'name': parts.push(`<div style="font-size:${fs}; font-weight:800; line-height:1.15; overflow:hidden;">${it.name||''}</div>`); break;
      case 'price': {
        const cur = currencyLabel();
        const pv = (it.price!=null?it.price:'') + ' ' + cur;
        const st = lb.priceStyle||'plain';
        if(st==='box')       parts.push(`<div style="font-size:${fs}; font-weight:900; border:2px solid #000; border-radius:4px; padding:1px 8px; display:inline-block;">${pv}</div>`);
        else if(st==='solid')parts.push(`<div style="font-size:${fs}; font-weight:900; background:#000; color:#fff; border-radius:4px; padding:2px 9px; display:inline-block;">${pv}</div>`);
        else if(st==='tag')  parts.push(`<div style="font-size:${fs}; font-weight:900; border:2.5px solid #000; border-radius:99px; padding:3px 12px; display:inline-block;">${pv}</div>`);
        else                 parts.push(`<div style="font-size:${fs}; font-weight:900;">${pv}</div>`);
        break; }
      case 'barcode': if(it.barcode) parts.push(`<div style="width:${lb.bcWidthPct||85}%; height:${lb.bcHeight||30}px; margin:1px auto; line-height:0;"><svg id="${barcodeSvgId}" preserveAspectRatio="none" style="width:100%; height:100%; display:block;"></svg></div>`); break;
      case 'code': if(it.barcode) parts.push(`<div style="font-size:${fs}; letter-spacing:.5px; direction:ltr;">${it.barcode}</div>`); break;
    }
  }
  return `<div class="one-label" style="width:${w}mm; height:${h}mm; box-sizing:border-box; padding:1.5mm; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; text-align:center; font-family:Tahoma,Arial,sans-serif; overflow:hidden; page-break-after:always;">${parts.join('')}</div>`;
}
// بعد ما JsBarcode يرسم بحجم ثابت — بنحوّله viewBox عشان يتمطط جوّه إطاره بالظبط
function fitBarcodeSvg(svg){
  try{
    const w = parseFloat(svg.getAttribute('width')), hh = parseFloat(svg.getAttribute('height'));
    if(w && hh){ svg.setAttribute('viewBox', '0 0 '+w+' '+hh); svg.removeAttribute('width'); svg.removeAttribute('height'); }
  }catch(e){}
}
function refreshLabelPreview(){
  const box = document.getElementById('labelLivePreview'); if(!box) return;
  const lbc = (receiptDesignConfig&&receiptDesignConfig.label)||defaultLabelConfig();
  const {w,h} = labelSizeMM();
  const scale = Math.min(190/(w*3.78), 1);
  const demo = {name:'إيشارب حرير مطرز', price:250, barcode:'2000123456789'};
  box.innerHTML = buildLabelHTML(demo, 'lblPrevBc');
  const inner = box.firstChild;
  inner.style.pageBreakAfter = 'auto';
  inner.style.transform = `scale(${scale})`; inner.style.transformOrigin = 'top left';
  box.style.width = (w*3.78*scale)+'px'; box.style.height = (h*3.78*scale)+'px';
  const note = document.getElementById('labelSizeNote');
  if(note) note.textContent = w+' × '+h+' مم (المعاينة مصغّرة — الطباعة بالمقاس الحقيقي)';
  try{ const bc = box.querySelector('#lblPrevBc'); if(bc&&typeof JsBarcode!=='undefined') { JsBarcode(bc, demo.barcode, {format:'CODE128', width:2, height:60, margin:0, displayValue:false}); fitBarcodeSvg(bc); } }catch(e){}
}

// ===== نافذة الكمية + الطباعة (مشتركة: صنف واحد أو دفعة من الاستلام) =====
// items: [{name, price, barcode, suggestedQty}]
function openLabelQtyModal(items){
  const old = document.getElementById('labelQtyOverlay'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'labelQtyOverlay';
  ov.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;';
  ov.innerHTML = `<div style="background:var(--panel); border:1px solid var(--border); border-radius:14px; padding:18px; width:100%; max-width:420px; max-height:80vh; overflow-y:auto;">
    <h3 style="margin:0 0 4px;">🏷️ طباعة ليبلات</h3>
    <div style="color:var(--muted); font-size:12px; margin-bottom:12px;">حدّد عدد الليبلات لكل صنف (متقترح تلقائيًا)</div>
    ${items.map((it,i)=>`<div style="display:flex; align-items:center; gap:10px; padding:9px; border:1px solid var(--border); border-radius:10px; margin-bottom:7px;">
      <div style="flex:1; min-width:0;"><div style="font-weight:700; font-size:13px;">${it.name}</div><div style="color:var(--muted); font-size:11px; direction:ltr; text-align:right;">${it.barcode||''}</div></div>
      <input type="number" min="0" id="lq_${i}" value="${Math.max(0, it.suggestedQty||1)}" style="width:70px; padding:9px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); text-align:center; font-weight:800; font-size:15px;">
    </div>`).join('')}
    <div style="display:flex; gap:8px; margin-top:12px;">
      <button onclick="document.getElementById('labelQtyOverlay').remove()" style="flex:1; padding:12px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text); cursor:pointer;">إلغاء</button>
      <button id="lqGo" style="flex:2; padding:12px; border-radius:10px; border:none; background:var(--plus); color:#062; font-weight:800; cursor:pointer;">🖨️ طباعة</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  document.getElementById('lqGo').onclick = ()=>{
    const jobs = items.map((it,i)=> ({...it, qty: parseInt(document.getElementById('lq_'+i).value)||0})).filter(j=> j.qty>0);
    ov.remove();
    if(!jobs.length){ showToast('مفيش كميات للطباعة', 'err'); return; }
    doPrintLabels(jobs);
  };
}
function doPrintLabels(jobs){
  // بنبني كل الليبلات (كل صنف × كميته) في مستند واحد — الطابعة بتقطع ليبل ليبل
  let html = '', n = 0;
  const codes = [];
  for(const j of jobs){
    for(let k=0; k<j.qty; k++){
      const id = 'bc_'+(n++);
      html += buildLabelHTML(j, id);
      if(j.barcode) codes.push({id, code:j.barcode});
    }
  }
  const {w,h} = labelSizeMM();
  const total = n;
  const shellCfg = (typeof window.posShell !== 'undefined') ? JSON.parse(localStorage.getItem('pos_printers')||'{}') : null;

  // نرسم الباركودات في حاوية مخفية الأول (عشان الـ SVG يبقى جاهز جوّه الـ HTML)
  const tmp = document.createElement('div');
  tmp.style.cssText = 'position:fixed; left:-9999px; top:0;';
  tmp.innerHTML = html;
  document.body.appendChild(tmp);
  try{ if(typeof JsBarcode!=='undefined') codes.forEach(c=>{ const el = tmp.querySelector('#'+c.id); if(el){ JsBarcode(el, c.code, {format:'CODE128', width:2, height:60, margin:0, displayValue:false}); fitBarcodeSvg(el); } }); }catch(e){}
  const finalHTML = tmp.innerHTML;
  tmp.remove();

  if(shellCfg && shellCfg.labelPrinter){
    window.posShell.printLabel({ printer: shellCfg.labelPrinter, html: `<style>@page{size:${w}mm ${h}mm; margin:0;} body{margin:0;}</style>`+finalHTML })
      .then(()=> showToast('اتبعت '+total+' ليبل للطابعة 🏷️'))
      .catch(e=> showToast('فشل طباعة الليبل: '+e.message, 'err'));
  }else{
    const wdw = window.open('', '_blank', 'width=420,height=560');
    wdw.document.write(`<html dir="rtl"><head><meta charset="UTF-8"><style>@page{size:${w}mm ${h}mm; margin:0;} body{margin:0;}</style></head><body>${finalHTML}<script>window.print(); setTimeout(()=>window.close(), 500);<\/script></body></html>`);
    wdw.document.close();
  }
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
  // QR التطبيق: يظهر بس لو مفيش رقم، أو الرقم مش مسجّل، أو مسجّل من غير تطبيق
  const _ph = (document.getElementById('customerPhone')||{value:''}).value.trim();
  data.showAppQR = !_ph || !custExists || !custHasApp;
  data.appQrImg = localStorage.getItem(receiptQrKey().key)||'';
  data.appQrTitle = (!_ph || !custExists) ? 'سجّلي في نادينا! 📱' : 'حمّلي تطبيقنا! 📱';
  data.appQrMsg = welcomeRewardText();
  _printBuiltReceipt(data, payments);
}
function _printBuiltReceipt(data, payments){
  const c = receiptDesignConfig || defaultReceiptConfig();
  const holder = document.getElementById('receiptPrint');
  holder.innerHTML = buildReceiptHTML(data);
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

// ---------------- ⌨️ اختصارات الكيبورد (شاشة البيع) ----------------
// F1 أو Tab (بره الخانات): شاشة البيع من أي مكان
// F2/F3/F4: كاش/فيزا/انستا (نفس ضغطة الأيقونة بالظبط) · F8: مسح المدفوعات · Shift+Enter: حفظ وطباعة
function _onSaleScreen(){
  const el = document.getElementById('saleScreen');
  return !!(el && el.offsetParent !== null);
}
function _inTypingField(){
  const a = document.activeElement;
  return !!(a && (a.tagName==='INPUT' || a.tagName==='TEXTAREA' || a.tagName==='SELECT' || a.isContentEditable));
}
document.addEventListener('keydown', function(e){
  // لازم يكون فيه موظف مسجّل دخول
  if(typeof currentEmployee === 'undefined' || !currentEmployee) return;

  // F1 — شاشة البيع من أي مكان
  if(e.key === 'F1'){
    e.preventDefault();
    if(typeof resumeOrStartSale === 'function') resumeOrStartSale(); else showScreen('saleScreen');
    return;
  }
  // Tab — نفس الشيء، بس لو مش واقف في خانة كتابة (وإلا يكمل تنقّل عادي)
  if(e.key === 'Tab' && !_inTypingField()){
    e.preventDefault();
    if(typeof resumeOrStartSale === 'function') resumeOrStartSale(); else showScreen('saleScreen');
    return;
  }

  // الباقي مخصوص لشاشة البيع بس
  if(!_onSaleScreen()) return;

  if(e.key === 'F2'){ e.preventDefault(); if(typeof togglePayMethod==='function') togglePayMethod('cash'); return; }
  if(e.key === 'F3'){ e.preventDefault(); if(typeof togglePayMethod==='function') togglePayMethod('visa'); return; }
  if(e.key === 'F4'){ e.preventDefault(); if(typeof togglePayMethod==='function') togglePayMethod('instapay'); return; }
  if(e.key === 'F8'){
    e.preventDefault();
    if(typeof resetPaymentUI==='function'){ resetPaymentUI(); showToast('اتمسحت المدفوعات 🧹'); }
    return;
  }
  if(e.key === 'Enter' && e.shiftKey){
    e.preventDefault();
    if(typeof confirmPayment==='function') confirmPayment();
    return;
  }
});

// ---------------- Init ----------------
(async function init(){
  ensureReceiptQrCached();   // نخزّن QR الفاتورة محليًا (مرة واحدة لكل جهاز/فرع)
  await ensureDemoInventory();
  await loadInventory();
  await loadReceiptDesignConfig();
})();
