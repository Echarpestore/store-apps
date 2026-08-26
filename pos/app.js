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
  sel.innerHTML = '<option value="">👤 مين اللي باعت؟</option>';
  try{
    // نجيب قايمة الموظفين الحاليين الحقيقية للفرع ده الأول (عشان نستبعد أي حد
    // اتمسح أو بقى غير نشط، حتى لو لسه ليه سجل شيفت قديم "مفتوح" بالغلط)
    /* 🔁 الموظفة اللي بتساعد في فرع تاني.
       🔴 الباج اللي كان هنا: القايمة بتتفلتر بـ`branch` بس، و`branch`
          بتاع الموظفة المحوّلة **لسه فرعها الأساسي** (وده مقصود —
          الرواتب والتقارير بتعتمد عليه). النتيجة: بتسجّل حضور في
          الفرع التاني عادي و**متبانش في «مين اللي باعت؟»**، فكل
          بيعاتها هناك بتروح على «من غير بياعة» ومتتحسبش لحد.
          يعني بتحضر ومبتكسبش.
       ⚠️ استعلامين منفصلين مش استعلام واحد: Firestore مفيهوش «أو»
          بين حقلين، و`array-contains` مع `==` على حقل تاني محتاج
          فهرس مركّب. الاتنين خفاف (مستندات موظفين فرع واحد). */
    const [_ownSnap, _alsoSnap] = await Promise.all([
      db.collection(EMPLOYEES_COLLECTION).where('branch','==', currentBranch).get(),
      db.collection(EMPLOYEES_COLLECTION)
        .where('alsoBranches','array-contains', currentBranch).get()
        .catch(function(){ return { docs: [] }; })   // مفيش موظفين محوّلين لسه
    ]);
    const _seenEmp = new Set();
    const _empDocs = [];
    [_ownSnap, _alsoSnap].forEach(function(sn){
      (sn.docs || []).forEach(function(d){
        if(_seenEmp.has(d.id)) return;               // نفس الموظفة في الاتنين؟ مرة واحدة
        _seenEmp.add(d.id); _empDocs.push(d);
      });
    });
    const empSnap = { docs: _empDocs };
    /* ⚠️ شرط `active` زي ما هو — الموقوفة متبانش في أي فرع. */
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
      // 🔢 كود البياعة — ثابت من مستند الموظف نفسه، فمش بيتغيّر بين الشيفتات
      // ولو موظفة مشيت، كودها بيمشي معاها ومحدش بياخده (منع بيعة تروح لواحدة غلط)
      const emp = empSnap.docs.find(function(d){ return d.id === s.employeeId; });
      const eData = emp ? (emp.data() || {}) : {};
      const code = eData.sellerCode || '';
      const opt = document.createElement('option');
      opt.value = s.employeeId;
      /* 🔁 علامة الزائرة — الكاشير لازم تعرف إنها مش من فريق الفرع
         (وإلا تفتكرها اتسجّلت غلط وتسيبها من غير اختيار). */
      const _visiting = eData.branch && eData.branch !== currentBranch;
      opt.textContent = (_visiting ? '🔁 ' : '')
        + (code ? (code + ' · ') : '') + (s.employeeName || s.employeeId);
      opt.dataset.name = s.employeeName || '';
      if(code) opt.dataset.code = String(code);
      sel.appendChild(opt);
    });
    // ⚠️ مفيش اختيار تلقائي بقى.
    // كان بيختار اللي فاتح الجهاز، والنتيجة إن كل البيعات بتروح للكاشير
    // اللي مش بيبيع أصلًا. دلوقتي: من غير اختيار = مش بتتحسب لحد.
    sel.value = '';
    if(typeof sellerPaint === 'function') sellerPaint();
  }catch(e){ console.warn('تعذر تحميل قايمة الموظفين الحاضرين', e); }
}

function focusSearchBar(){
  // نفوكس خانة البحث عشان السكانر يمسح على طول (منتج أو كود عميل) من غير ما الكاشير يدوس عليها
  setTimeout(function(){ var sb=document.getElementById('searchBar'); if(sb) sb.focus(); }, 120);
}

// ============================================================
// 🎯 حارس التركيز في شاشة البيع
// ------------------------------------------------------------
// 🔴 الشكوى: «بيعمل لاج ومش بيكتب» في كل الفروع. مش بطء —
//    التركيز بيضيع من خانة البحث ومحدش بيرجّعه.
// السبب: focusSearchBar() بتتنادى وقت **الدخول** للشاشة بس (goToSale /
//    resumeOrStartSale). أي نافذة بتتقفل (askConfirm · askText · شاشة إلغاء
//    الماكينة · نافذة المرتجع · أي modal) بتتشال من الـDOM، والعنصر اللي كان
//    متفوكس جواها بيتشال معاها → التركيز بيقع على document.body.
// وبيبان لاج ليه: لما مفيش خانة متفوكسة، معالج المسح العام (فوق) بيعتبر
//    إن اللي بيتكتب باركود وبيبلع الحروف في _gsBuf — فالكاشير بتكتب ومفيش
//    حاجة بتظهر، وEnter بيتفسّر كمسح كود.
// عشان كده الخروج والرجوع بيصلحها: goToSale بتنادي focusSearchBar.
//
// ⚠️ محافظ عمدًا: بيرجّع التركيز **بس** لما مفيش أي حاجة متفوكسة خالص
//    (activeElement = body أو null). لو الكاشير واقفة في أي خانة تانية
//    (المبلغ · تليفون العميلة · كود البياعة) أو أي نافذة مفتوحة — بيسيبها.
// ============================================================
(function(){
  if(window._focusGuardOn) return;          // مرة واحدة مهما اتنادى الملف
  window._focusGuardOn = true;

  // النوافذ اللي بتتبني في اللحظة — وجود أي واحدة = الكاشير شغالة فيها
  const LIVE_OVERLAYS = ['askTextOverlay','askConfirmOverlay','changeConfirmOverlay',
    'cancelTerminalOverlay','avPickOverlay','dupBarcodeOverlay','labelQtyOverlay'];

  function busy(){
    if(document.querySelector('.modal-overlay.active')) return true;
    for(let i = 0; i < LIVE_OVERLAYS.length; i++){
      if(document.getElementById(LIVE_OVERLAYS[i])) return true;
    }
    return false;
  }

  function saleVisible(){
    const sc = document.getElementById('saleScreen');
    return !!(sc && sc.offsetParent !== null);
  }

  setInterval(function(){
    try{
      if(!saleVisible() || busy()) return;
      const a = document.activeElement;
      // 🔑 الشرط الضيق: مفيش أي حاجة متفوكسة. لو فيه، مابلمسش.
      if(a && a !== document.body && a.tagName !== 'HTML') return;
      const sb = document.getElementById('searchBar');
      if(sb && sb.offsetParent !== null) sb.focus();
    }catch(e){}
  }, 700);
})();

// ============================================================
// 🩺 focusDiag() — بيفرّق بين باجين مختلفين تمامًا بنفس العرض
// ------------------------------------------------------------
// (أ) تركيز DOM ضايع: النافذة نشطة، بس مفيش خانة متفوكسة.
//     → الحارس اللي فوق بيصلحها لوحده كل 700ms.
// (ب) تركيز النظام ضايع: ويندوز مش مديّة النافذة الـfocus أصلًا.
//     → `document.hasFocus()` بترجع false. الكاشير بتكتب ومفيش حاجة بتحصل،
//       ولازم تخرج وترجع للبرنامج (زرار ويندوز) عشان يشتغل.
//     ⚠️ ده **مستحيل** يتصلح من هنا: صفحة الويب معندهاش أي سلطة تخطف
//        تركيز النظام. الإصلاح في main.js بتاع Electron بس.
// بيسجّل آخر 40 حدث تركيز عشان نعرف مين بيسرقه (طباعة/درج/Paymob).
// ============================================================
window._focusLog = [];
function _fl(kind, extra){
  try{
    window._focusLog.push({ t: new Date().toLocaleTimeString('ar-EG'), kind: kind,
      hasFocus: document.hasFocus(), active: (document.activeElement && document.activeElement.id) || (document.activeElement && document.activeElement.tagName) || '—', extra: extra || '' });
    if(window._focusLog.length > 40) window._focusLog.shift();
  }catch(e){}
}
window.addEventListener('blur',  function(){ _fl('window blur'); });
window.addEventListener('focus', function(){ _fl('window focus'); });
document.addEventListener('visibilitychange', function(){ _fl('visibility: ' + document.visibilityState); });
window.focusDiag = function(){
  const hf = document.hasFocus();
  const a = document.activeElement;
  const aid = (a && (a.id || a.tagName)) || '—';
  console.log('%c🩺 تشخيص التركيز', 'font-size:15px; font-weight:bold');
  console.log('النافذة نشطة (hasFocus):', hf);
  console.log('العنصر المتفوكس:', aid);
  console.log('شاشة البيع ظاهرة:', !!(document.getElementById('saleScreen') && document.getElementById('saleScreen').offsetParent !== null));
  console.table(window._focusLog);
  if(!hf){
    console.log('%c⛔ النوع (ب): تركيز النظام ضايع — مفيش حل من الويب. الإصلاح في main.js.',
      'color:#DC2626; font-weight:bold');
  }else if(!a || a === document.body){
    console.log('%c⚠️ النوع (أ): تركيز DOM ضايع — الحارس المفروض يصلحها خلال ثانية.',
      'color:#F59E0B; font-weight:bold');
  }else{
    console.log('%c✅ التركيز سليم دلوقتي.', 'color:#059669; font-weight:bold');
  }
  return { hasFocus: hf, active: aid, log: window._focusLog };
};

// >>> GSCAN_START
// 🌍 سكان في أي مكان: السكانر بيكتب بسرعة + Enter — من غير ما تدوس في خانة البحث.
// كارت موظف EC → شراء موظف · عضوية عميل ECH/GLW → ربط بالفاتورة · كود فاتورة FT → مرتجع · باركود صنف → يضيف للسلة.
function _gsClassify(raw){
  const t = String(raw||'').trim();
  const code = t.toUpperCase();
  if(t.length < 4) return { type:'none' };
  if(/^EC[A-Z2-9]{10}$/.test(code)) return { type:'staff', code };
  if(/^(ECH|GLW)/.test(code))       return { type:'customer', code };
  if(/^FT/.test(code))              return { type:'invoice', code };
  return { type:'maybe_item', code: t };
}
// نتخطى المعالجة العامة لو: واقفين في خانة كتابة، أو شاشة الدخول/التحويلات (ليهم لواقطهم الخاصة)
function _gsShouldSkip(inField, loginVisible, transfersVisible){
  return !!(inField || loginVisible || transfersVisible);
}
// ⌨️ حرف السكانر من مكان الزرار الفيزيائي (e.code) — مستقل عن لغة الكيبورد:
// لو الويندوز على عربي، e.key بيطلع "ث/لا/..." والكود يتبعتر — e.code ثابت دايمًا.
function _scanChar(e){
  const c = e.code || '';
  if(/^Key[A-Z]$/.test(c))    return c.slice(3);
  if(/^Digit[0-9]$/.test(c))  return c.slice(5);
  if(/^Numpad[0-9]$/.test(c)) return c.slice(6);
  if(c === 'Minus' || c === 'NumpadSubtract') return '-';
  const k = e.key || '';
  return (k.length === 1 && /[\x20-\x7E]/.test(k)) ? k : '';
}
// <<< GSCAN_END
let _gsBuf = '', _gsLast = 0, _gsFirst = 0;
document.addEventListener('keydown', function(e){
  const a = document.activeElement;
  const inField = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
  const lg = document.getElementById('loginScreen');
  const tr = document.getElementById('transfersScreen');
  if(_gsShouldSkip(inField, lg && lg.offsetParent !== null, tr && tr.offsetParent !== null)){ _gsBuf=''; return; }
  const now = Date.now();
  if(now - _gsLast > 90){ _gsBuf = ''; _gsFirst = now; }
  _gsLast = now;
  if(e.key === 'Enter'){
    const raw = _gsBuf; _gsBuf = '';
    if(raw.length < 4) return;
    // سرعة الكتابة لازم تكون سرعة سكانر (مش صوابع) — متوسط أقل من 70ms للحرف
    if((now - _gsFirst) / raw.length > 70) return;
    const r = _gsClassify(raw);
    if(r.type === 'none') return;
    e.preventDefault();
    if(r.type === 'staff'){ resumeOrStartSale(); if(typeof activateStaffPurchase==='function') activateStaffPurchase(r.code); }
    else if(r.type === 'customer'){ resumeOrStartSale(); if(typeof resolveLoyaltyScan==='function') resolveLoyaltyScan(r.code).then(f=>{ if(!f) showToast('كود العضوية مش موجود','err'); }); }
    else if(r.type === 'invoice'){ if(typeof openInvoiceForReturn==='function') openInvoiceForReturn(r.code); }
    else if(r.type === 'maybe_item'){
      const match = (typeof allInventory!=='undefined'?allInventory:[]).find(it=> it.barcode === r.code && it.status !== 'hidden' && it.status !== 'outofstock');
      if(match){ resumeOrStartSale(); if(typeof addToCart==='function') addToCart(match); }
    }
    return;
  }
  const _ch = _scanChar(e); if(_ch){ _gsBuf += _ch; if(_gsBuf.length > 40) _gsBuf = _gsBuf.slice(-40); }
});

function resumeOrStartSale(){
  if(cart.length > 0){
    if(typeof loadActiveDiscounts === 'function') loadActiveDiscounts();
  if(typeof loadStaffPointsConfig === 'function' && !staffPointsConfig) loadStaffPointsConfig();
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
  // 🕵️ سلة فيها قطع واتمسحت من غير حفظ = هجر (يتسجل صامت)
  if(typeof cart !== 'undefined' && cart.length && !(typeof _saleJustSaved !== 'undefined' && _saleJustSaved)){
    if(typeof _logActivity === 'function') _logActivity('cart_abandoned', {
      itemCount: cart.length,
      value: cart.reduce((s,c)=> s + (c.price||0)*(c.qty||1), 0),
      firstItemAt: (typeof _cartFirstItemAt !== 'undefined') ? _cartFirstItemAt : null
    });
  }
  if(typeof _saleJustSaved !== 'undefined') _saleJustSaved = false;
  if(typeof _cartFirstItemAt !== 'undefined') _cartFirstItemAt = null;
  editingHeldId = null;
  cart = [];
  selectedCartIdx = null;
  clearCustomerContext();   // نصفّي سياق العميل بالكامل (استبدال/مكافأة/عروض) عشان الفاتورة الجديدة تبدأ نضيفة
  // تحميل الخصومات السارية عشان تتطبق تلقائي وقت إضافة الأصناف
  if(typeof loadActiveDiscounts === 'function') loadActiveDiscounts();
  if(typeof loadStaffPointsConfig === 'function' && !staffPointsConfig) loadStaffPointsConfig();
  loadLoyaltyRedemptionConfig();
  loadClockedInStaff();
  document.getElementById('customerPhone').value = '';
  document.getElementById('customerName').value = '';
  document.getElementById('customerInfo').textContent = '';
  document.getElementById('newCustomerRow').style.display = 'none';
  setCustBox(false);
  // التاريخ والوقت واسم الموظف في ركن الشاشة (زي الجهاز الحقيقي بالظبط)
  // 🕐 الوقت بأرقام إنجليزي — كان بأرقام عربية وبيتلخبط مع النصوص حواليه
  const now = new Date();
  const _d = now.toLocaleDateString('ar-EG-u-nu-latn', {weekday:'long', day:'numeric', month:'long'});
  const _t = now.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
  document.getElementById('qbxMeta').innerHTML =
    '<div style="font-size:11.5px; color:#6b7280;">' + _d + '</div>'
    + '<div dir="ltr" style="font-size:19px; font-weight:900; letter-spacing:.5px; margin:1px 0;">'
    + _t + '</div>'
    + '<b style="font-size:13px;">' + (currentEmployee.name || '') + '</b>';
  renderCart();
  resetPaymentUI();
  showScreen('saleScreen');
  focusSearchBar();
}
function goToDashboard(){
  refreshHeldCount();
  loadReceiptDesignConfig().catch(()=>{});   // 🎨 تصميم براند الفرع ده بالذات
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
  ar: { emp:'الموظف', total:'الإجمالي', cash:'كاش', visa:'فيزا', instapay:'انستا باي', currency:'ج.م', invoice:'فاتورة رقم', item:'الصنف', qty:'كمية', price:'السعر', change:'الباقي' },
  en: { emp:'Cashier', total:'Total', cash:'Cash', visa:'Visa', instapay:'InstaPay', currency:'EGP', invoice:'Invoice #', item:'Item', qty:'Qty', price:'Price', change:'Change' }
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
  { id:'copyMark',  label:'🔁 علامة «نسخة تانية» (بتظهر في إعادة الطباعة بس)', kind:'auto', size:11 },
  { id:'cardTxn',   label:'💳 بيانات الدفع بالكارت (آخر 4 أرقام · نوع الكارت · رقم العملية)', kind:'auto', size:10 },
  { id:'invoiceNo', label:'🔢 رقم الفاتورة',          kind:'auto', size:11 },
  { id:'barcode',   label:'⬛ باركود المرتجع',        kind:'auto' },
  { id:'custPoints',label:'🎁 نقط العميلة (الاسم · كسبت كام · رصيدها الحالي)', kind:'auto', size:11 },
  { id:'appQR',     label:'📱 QR تحميل التطبيق (للعملاء الغير مسجّلين/من غير تطبيق)', kind:'auto', size:10 },
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
// 🎨 تصميم لكل براند: إيشارب على المستند القديم (زي ما هو — صفر ترحيل)، وGlow على مستند خاص
let _designEditBrand = null;   // البراند اللي المحرر فاتح عليه (افتراضيًا براند الجهاز)
function _brandOfBranch(br){ return (typeof GLOW_BRANCHES !== 'undefined' && GLOW_BRANCHES.includes(br)) ? 'glow' : 'echarpe'; }
function _deviceBrand(){ return _brandOfBranch(typeof currentBranch !== 'undefined' ? currentBranch : ''); }
function _designDocIdFor(brand){ return brand === 'glow' ? 'receipt_design_glow' : 'receipt_design'; }

function defaultReceiptConfig(){
  return {
    lang:'ar', paperWidth:'80', logo:'', logoWidth:60, lineGap:2, endFeed:16, bcHeight:34, bcWidth:1.4, bcWidthPct:90, bcFont:11, currencyAr:'ج.م', currencyEn:'EGP',
    elements: RECEIPT_ELEMENTS.filter(e=> e.kind!=='multi').map(e=> ({ id:e.id, on: !(e.id==='branchName'||e.id==='address'||e.id==='phone'), text: e.def||'', size: e.size||12 }))
  };
}
// 🖼️ Glow: بعض اللوجوه القديمة اتحفظت وفي الصورة نفسها مساحة بيضا كبيرة فوق/تحت.
// بنقصّ الحواف البيضاء/الشفافة في الذاكرة وقت التحميل فقط — من غير ما نغيّر الملف المحفوظ.
async function trimReceiptLogoWhitespace(dataUrl){
  if(!dataUrl || typeof document==='undefined') return dataUrl||'';
  try{
    const img = await new Promise(function(ok,bad){
      const x=new Image(); x.onload=function(){ok(x);}; x.onerror=bad; x.src=dataUrl;
    });
    const maxSide=420, scale=Math.min(1,maxSide/Math.max(img.naturalWidth||img.width||1,img.naturalHeight||img.height||1));
    const w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));
    const h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
    const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
    const cx=cv.getContext('2d',{willReadFrequently:true}); cx.drawImage(img,0,0,w,h);
    const im=cx.getImageData(0,0,w,h), d=im.data;
    let minX=w,minY=h,maxX=-1,maxY=-1;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const i=(y*w+x)*4, a=d[i+3], r=d[i], g=d[i+1], b=d[i+2];
      // أبيض شبه كامل أو transparent = هامش؛ أي لون/رمادي فعلي جزء من اللوجو.
      if(a>18 && !(r>246 && g>246 && b>246)){
        if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
      }
    }
    if(maxX<minX || maxY<minY) return dataUrl;
    const pad=Math.max(2,Math.round(Math.min(w,h)*0.015));
    minX=Math.max(0,minX-pad);minY=Math.max(0,minY-pad);maxX=Math.min(w-1,maxX+pad);maxY=Math.min(h-1,maxY+pad);
    const cw=maxX-minX+1,ch=maxY-minY+1;
    // لو مفيش هامش معتبر، مانعيدش ترميز الصورة.
    if(cw>=w*0.96 && ch>=h*0.96) return dataUrl;
    const out=document.createElement('canvas'); out.width=cw; out.height=ch;
    out.getContext('2d').drawImage(cv,minX,minY,cw,ch,0,0,cw,ch);
    return out.toDataURL('image/png');
  }catch(e){ return dataUrl; }
}

async function loadReceiptDesignConfig(brand){
  brand = brand || _deviceBrand();
  receiptDesignConfig = defaultReceiptConfig();
  try{
    let doc = await db.collection(TEST_SETTINGS).doc(_designDocIdFor(brand)).get();
    // Glow لسه ماتصممش؟ نطبع مؤقتًا بتصميم إيشارب لحد ما تحفظ تصميم Glow من المحرر
    if(!doc.exists && brand === 'glow'){
      doc = await db.collection(TEST_SETTINGS).doc('receipt_design').get();
    }
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
  // Glow فقط: شيل whitespace الموجود جوه صورة اللوجو نفسها قبل الطباعة.
  if(brand==='glow' && receiptDesignConfig && receiptDesignConfig.logo){
    receiptDesignConfig.logo = await trimReceiptLogoWhitespace(receiptDesignConfig.logo);
  }
  // 💾 لو السيرفر فشل أو مرجّعش تصميم محفوظ، نقرا النسخة المحلية من الجهاز
  try{
    const localRaw = localStorage.getItem('rcpt_design_'+brand);
    const gotFromServer = receiptDesignConfig && receiptDesignConfig.elements &&
      receiptDesignConfig.elements.some(el=> el.on);   // مؤشر بسيط إن فيه تصميم فعلي
    if(localRaw && !gotFromServer){
      const lc = JSON.parse(localRaw);
      if(lc && lc.elements) receiptDesignConfig = lc;
    }
  }catch(_e){}
  if(!receiptDesignConfig.label) receiptDesignConfig.label = defaultLabelConfig();
}

function goToReceiptDesign(){
  if(!hasPerm('canChangePrices')){ showToast('الصلاحية دي للمدير بس', 'err'); return; }
  showScreen('receiptDesignScreen');
  renderReceiptDesignScreen();
}

let _designTab = 'receipt';   // receipt | label
async function renderReceiptDesignScreen(){
  if(_designEditBrand === null) _designEditBrand = _deviceBrand();
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
    const listKey = togglePath.indexOf('label')>=0 ? 'label' : 'receipt';
    return `
    <div draggable="true"
         ondragstart="dsDragStart(event, ${i}, '${listKey}')" ondragover="dsDragOver(event, ${i}, '${listKey}')"
         ondrop="dsDrop(event, ${i}, '${listKey}')" ondragend="dsDragEnd(event)"
         style="${S.row} ${el.on?'':'opacity:.45;'}">
      <div style="display:flex; flex-direction:column; align-items:center;">
        <span title="اسحب لإعادة الترتيب" style="cursor:grab; color:var(--muted); font-size:14px; line-height:1; padding:1px 4px; user-select:none;">⠿</span>
        <button onclick="${moveFn}(${i},-1)" ${i===0?'disabled':''} style="border:none; background:none; color:var(--muted); cursor:pointer; padding:0 4px; font-size:12px;">▲</button>
        <button onclick="${moveFn}(${i},1)" style="border:none; background:none; color:var(--muted); cursor:pointer; padding:0 4px; font-size:12px;">▼</button>
      </div>
      <label class="dsw" style="position:relative; width:38px; height:22px; flex-shrink:0; cursor:pointer;">
        <input type="checkbox" ${el.on?'checked':''} onchange="${togglePath}[${i}].on=this.checked; renderReceiptDesignScreen();" style="opacity:0; width:0; height:0;">
        <span style="position:absolute; inset:0; border-radius:99px; background:${el.on?'#818cf8':'var(--panel2)'}; border:1px solid var(--border); transition:.15s;"></span>
        <span style="position:absolute; top:2.5px; ${el.on?'left:18px;':'left:3px;'} width:15px; height:15px; border-radius:50%; background:#fff; transition:.15s;"></span>
      </label>
      <div style="flex:1; min-width:0;">
        <div style="font-size:12.5px; font-weight:800;">${def.label}</div>
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
      ${slider('تباعد السطور', c.lineGap!=null?c.lineGap:2, 0, 12, 1, "receiptDesignConfig.lineGap=+this.value; this.nextElementSibling.textContent=this.value; refreshReceiptPreview();")}
      ${slider('طول إضافي آخر الفاتورة', c.endFeed!=null?c.endFeed:16, 0, 80, 4, "receiptDesignConfig.endFeed=+this.value; this.nextElementSibling.textContent=this.value; refreshReceiptPreview();")}
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
      <span style="display:flex; align-items:center; gap:3px;"><button onclick="addReceiptSpacer()" style="${S.chip}">➕ مسافة</button><button onclick="addReceiptSpacerN(3)" style="${S.chip} padding:7px 8px;">×3</button></span>
      <span style="display:flex; align-items:center; gap:3px;"><button onclick="addReceiptDivider()" style="${S.chip}">➕ خط</button><button onclick="addReceiptDividerN(3)" style="${S.chip} padding:7px 8px;">×3</button></span>
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
    <div style="display:flex; gap:8px; margin-bottom:10px;">
      <button onclick="_designEditBrand='echarpe'; loadReceiptDesignConfig('echarpe').then(renderReceiptDesignScreen);" style="flex:1; padding:10px; border-radius:10px; cursor:pointer; font-weight:900; font-size:13px; border:2px solid ${_designEditBrand!=='glow'?'#b76e79':'var(--border)'}; background:${_designEditBrand!=='glow'?'rgba(183,110,121,.15)':'var(--panel2)'}; color:var(--text);">🎀 تصميم إيشارب</button>
      <button onclick="_designEditBrand='glow'; loadReceiptDesignConfig('glow').then(renderReceiptDesignScreen);" style="flex:1; padding:10px; border-radius:10px; cursor:pointer; font-weight:900; font-size:13px; border:2px solid ${_designEditBrand==='glow'?'#d4af37':'var(--border)'}; background:${_designEditBrand==='glow'?'rgba(212,175,55,.13)':'var(--panel2)'}; color:var(--text);">🖤 تصميم Glow</button>
    </div>
    ${_designEditBrand !== _deviceBrand() ? `<div style="background:rgba(245,158,11,.12); border:1px solid var(--warn); color:var(--warn); border-radius:9px; padding:7px 10px; font-size:11.5px; font-weight:700; margin-bottom:10px;">⚠️ بتعدّل تصميم البراند التاني — جهازك هيرجع يطبع بتصميم فرعه بعد الحفظ</div>` : ''}
    <div style="display:flex; gap:6px; margin-bottom:12px; background:var(--panel2); border-radius:12px; padding:5px;">
      <button onclick="_designTab='receipt'; renderReceiptDesignScreen();" style="flex:1; padding:11px; border-radius:9px; border:none; cursor:pointer; font-weight:800; font-size:13px; ${_designTab==='receipt'?'background:var(--panel); color:var(--text); box-shadow:0 2px 8px rgba(0,0,0,.25);':'background:none; color:var(--muted);'}">🧾 الفاتورة</button>
      <button onclick="_designTab='label'; renderReceiptDesignScreen();" style="flex:1; padding:11px; border-radius:9px; border:none; cursor:pointer; font-weight:800; font-size:13px; ${_designTab==='label'?'background:var(--panel); color:var(--text); box-shadow:0 2px 8px rgba(0,0,0,.25);':'background:none; color:var(--muted);'}">🏷️ ليبل السعر</button>
    </div>
    <div style="display:grid; grid-template-columns: 1fr 230px; gap:14px; align-items:start;">
      <div>${_designTab==='receipt' ? receiptTab : labelTab}</div>
      <div style="position:sticky; top:8px;">
        <div style="font-size:11px; color:var(--muted); margin-bottom:5px; text-align:center;">👁️ معاينة حيّة</div>
        <div style="display:${_designTab==='receipt'?'block':'none'};"><div id="receiptLivePreview" style="background:#fff; color:#000; border-radius:10px; padding:10px 8px; box-shadow:0 6px 20px rgba(0,0,0,.4); max-height:78vh; overflow-y:auto; margin:0 auto;"></div></div>
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
// 📷 سرعة القراءة بمقاس صغير — التلات حاجات اللي بتفرق فعلًا:
// ١) منطقة الهدوء (الفراغ الأبيض حوالين الخطوط): كانت 6px والمواصفة ≥10 موديولات —
//    ده أول سبب إن المسدس بياخد وقت. بقت 30px (≈10 موديولات).
// ٢) مقاس الرسم قريب من نقاط الطابعة الحرارية (80مم ≈ 576 نقطة) بدل التكبير ×3
//    والتصغير بعدين — التصغير بنسب مش صحيحة كان بيهزهز الخطوط.
// ٣) الصورة بتتعرض crisp من غير تنعيم.
function receiptBarcodeImg(code){
  try{
    if(!code) return '';
    if(typeof JsBarcode==='undefined'){ console.warn('JsBarcode مش متحمّلة — الباركود مش هيترسم'); return ''; }
    const c = receiptDesignConfig||defaultReceiptConfig();
    // SVG بدل Canvas: الطابعة الحرارية تستلم خطوط Vector حادة حتى لو التصميم صغّر/كبّر الباركود.
    // width=1 يحافظ على وحدات CODE128 الأصلية، والـquiet zone 10 وحدات على كل جنب.
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    JsBarcode(svg, String(code), {
      format:'CODE128', width:1, height:(c.bcHeight||34),
      margin:10, background:'#ffffff', lineColor:'#000000',
      displayValue:false
    });
    svg.setAttribute('shape-rendering','crispEdges');
    svg.style.background='#fff';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.outerHTML);
  }catch(e){ return ''; }
}
function buildReceiptHTML(data){
  const c = receiptDesignConfig || defaultReceiptConfig();
  const L = RECEIPT_LABELS[c.lang] || RECEIPT_LABELS.ar;
  const dir = c.lang==='en' ? 'ltr' : 'rtl';
  const d = data || {};
  /* ============================================================
     🎁 إيصال الهدية — نفس الفاتورة **من غير أي فلوس**
     ------------------------------------------------------------
     الفكرة: العميلة تحط الورقة مع الهدية، واللي واخدة الهدية تقدر
     تستبدل أو ترجّع **من غير ما تعرف السعر**.

     ⚠️ **الفلوس بتتشال من مكان واحد بس** — الفلاج ده — مش بتعليمات
        متفرقة في كل بلوك. لو اتضاف بلوك فلوس جديد بكرة (زي بلوك
        فروق الفيزا اللي اتضاف من شهر)، لازم يتحط اسمه هنا وإلا
        هيطبع سعر على إيصال هدية. الاختبار بيمسك ده صراحةً.

     ⚠️ الباركود ورقم الفاتورة **بيفضلوا** — من غيرهم الاستبدال
        مستحيل والورقة مالهاش لازمة أصلًا.
     ⚠️ ونقط العميلة بتتشال كمان: النقط بتتحسب من قيمة الفاتورة،
        فـ"كسبتي ٥٥ نقطة" بيقول السعر بطريقة تانية.
     ============================================================ */
  const gift = d.giftMode === true;
  const GIFT_HIDDEN = ['totals','cardTxn','custPoints','appQR'];
  let headerEnd = 0;                     // مكان دخول بانر الهدية
  const parts = [];
  // Glow كان عنده spacer محفوظ قبل أول عنصر فكان بيطلع ورق أبيض كبير فوق اللوجو.
  // نشيل المسافات *الابتدائية فقط* في Glow؛ باقي ترتيب التصميم يفضل زي ما المالك حافظه.
  let _els = (c.elements||[]).slice();
  if((typeof _deviceBrand==='function' && _deviceBrand()==='glow')){
    while(_els.length){
      const e=_els[0], b=(e&&(e.base||e.id))||'';
      if(!e || !e.on){ _els.shift(); continue; }
      if(b==='spacer' || String(e.id||'').indexOf('spacer')===0){ _els.shift(); continue; }
      break;
    }
  }
  for(const el of _els){
    if(!el.on) continue;
    const base = el.base || el.id;
    if(gift && GIFT_HIDDEN.indexOf(base) >= 0) continue;   // 🎁 كل ما هو فلوس
    const fs = (el.size||12) + 'px';
    if(el.id.indexOf('spacer')===0){ parts.push(`<div style="height:${el.size||10}px;"></div>`); continue; }
    if(el.id.indexOf('divider')===0){ parts.push(`<div style="border-top:2px dashed #000; margin:4px 2px;"></div>`); continue; }
    switch(el.base||el.id){
      case 'spacer': parts.push(`<div style="height:${el.size||8}px;"></div>`); break;
      case 'divider': parts.push(`<div style="border-top:1.5px dashed #000; margin:${el.size||4}px 0;"></div>`); break;
      case 'logo':
        if(c.logo){ parts.push(`<img src="${c.logo}" style="display:block; margin:0 auto 6px; max-width:${c.logoWidth||60}%; max-height:120px; object-fit:contain;">`); headerEnd = parts.length; }
        break;
      case 'shopName': if(el.text){ parts.push(`<div style="text-align:center; font-weight:bold; font-size:${fs}; margin:2px 0;">${el.text}</div>`); headerEnd = parts.length; } break;
      case 'branchName': case 'address': case 'phone': case 'footer':
        if(el.text){ parts.push(`<div style="text-align:center; font-size:${fs}; margin:2px 0;">${el.text}</div>`); if(base !== 'footer') headerEnd = parts.length; } break;
      case 'meta':
        parts.push(`<div style="text-align:center; font-size:${fs}; margin:3px 0;">${d.dateStr||''}${d.empName?' · '+L.emp+': '+d.empName:''}</div>`); break;
      case 'copyMark': {
        // 🔁 علامة النسخة التانية — بتظهر بس في إعادة الطباعة
        if(!d.isCopy) break;
        parts.push('<div style="border:2px dashed #000; border-radius:4px; margin:4px 0 6px;'
          + ' padding:5px 6px; text-align:center; font-weight:900; font-size:' + fs + ';">'
          + 'نسخة تانية — مش الفاتورة الأصلية'
          + (d.copyAt ? ('<div style="font-weight:600; font-size:' + Math.max(8,(parseInt(fs)||11)-2) + 'px;">'
              + 'اتطبعت: ' + d.copyAt + '</div>') : '')
          + '</div>');
        break; }
      case 'items':
        // 🎁 إيصال هدية: عمود الصنف والكمية بس — من غير سعر ولا إجمالي.
        //    ⚠️ الكمية بتفضل عن قصد: من غيرها لو الهدية قطعتين، اللي
        //       واخداها ترجّع واحدة وتفتكر إن الورقة اتستهلكت.
        if(gift){
          parts.push(`<table style="width:100%; border-collapse:collapse; font-size:${fs}; margin:4px 0;">`
            + `<tr>`
            + `<th style="padding:2px 0 4px; border-bottom:2px solid #000; text-align:${dir==='rtl'?'right':'left'}; font-size:${Math.max(8, (parseInt(fs)||11) - 1)}px; font-weight:800;">Item</th>`
            + `<th style="padding:2px 0 4px; border-bottom:2px solid #000; white-space:nowrap; text-align:${dir==='rtl'?'left':'right'}; font-size:${Math.max(8, (parseInt(fs)||11) - 1)}px; font-weight:800;">Qty</th>`
            + `</tr>`
            + `${(d.items||[]).map(it=>
            `<tr><td style="padding:3px 0; border-bottom:1px solid #000; font-weight:600; word-break:break-word; max-width:0; width:100%;">${it.name}${it.barcode ? `<div dir="ltr" style="font-size:${Math.max(7, (parseInt(fs)||11) - 3)}px; font-weight:500; letter-spacing:.4px; text-align:${dir==='rtl'?'right':'left'};">${it.barcode}</div>` : ''}</td><td style="padding:3px 0; border-bottom:1px solid #000; white-space:nowrap; font-weight:700; text-align:${dir==='rtl'?'left':'right'};">${it.qty}</td></tr>`).join('')}</table>`);
          break;
        }
        // عناوين الأعمدة إنجليزي، والبيانات تحتها في نفس الأعمدة بالظبط
        parts.push(`<table style="width:100%; border-collapse:collapse; font-size:${fs}; margin:4px 0;">`
          + `<tr>`
          + `<th style="padding:2px 0 4px; border-bottom:2px solid #000; text-align:${dir==='rtl'?'right':'left'}; font-size:${Math.max(8, (parseInt(fs)||11) - 1)}px; font-weight:800;">Item</th>`
          + `<th style="padding:2px 4px 4px; border-bottom:2px solid #000; white-space:nowrap; font-size:${Math.max(8, (parseInt(fs)||11) - 1)}px; font-weight:800;" dir="ltr">Qty × Price</th>`
          + `<th style="padding:2px 0 4px; border-bottom:2px solid #000; white-space:nowrap; text-align:${dir==='rtl'?'left':'right'}; font-size:${Math.max(8, (parseInt(fs)||11) - 1)}px; font-weight:800;">Total</th>`
          + `</tr>`
          + `${(d.items||[]).map(it=>
          `<tr><td style="padding:3px 0; border-bottom:1px solid #000; font-weight:600; word-break:break-word; max-width:0; width:100%;">${it.name}${it.barcode ? `<div dir="ltr" style="font-size:${Math.max(7, (parseInt(fs)||11) - 3)}px; font-weight:500; letter-spacing:.4px; text-align:${dir==='rtl'?'right':'left'};">${it.barcode}</div>` : ''}</td><td style="padding:3px 4px; border-bottom:1px solid #000; white-space:nowrap; font-weight:600;">${it.qty} × ${it.unit||''}</td><td style="padding:3px 0; border-bottom:1px solid #000; white-space:nowrap; font-weight:700; text-align:${dir==='rtl'?'left':'right'};">${it.line}</td></tr>`).join('')}</table>`); break;
      case 'totals':
        parts.push(`<div style="text-align:center; font-weight:bold; font-size:${fs}; margin:5px 0 2px;">${L.total}: ${d.totalStr||''} ${currencyLabel()}${d.payStr?' ('+d.payStr+')':''}</div>`);
        // 💳↩️ v295: زيادة الفيزا — بارزة ومكتوبة "يُرد" عشان الورقة
        //    اللي في إيد العميلة تبقى مستند حقها، مش بس قوس جنب الإجمالي
        if(Number(d.cardOverStr) > 0){
          parts.push(`<div style="text-align:center; font-weight:900; font-size:${fs}; margin:2px 0 3px; border:2px solid #000; border-radius:6px; padding:3px 5px;">`
            + `⚠️ مسحوب فيزا زيادة — يُرد للعميلة: ${Number(d.cardOverStr).toFixed(2)} ${currencyLabel()}</div>`);
        }
        // 💵 الباقي — بيظهر بس لما يكون فيه فكة فعلًا
        if(Number(d.changeStr) > 0){
          parts.push(`<div style="text-align:center; font-weight:800; font-size:${fs}; margin:1px 0 3px;">`
            + `${L.change || 'الباقي'}: ${Number(d.changeStr).toFixed(2)} ${currencyLabel()}</div>`);
        }
        break;
      case 'cardTxn': {
        // 💳 بيانات الدفع بالكارت — بتظهر بس لو الدفع اتم بالماكينة
        // 💳💳 الفاتورة ممكن تكون اتقسمت على كارتين → كل كارت بمبلغه ورقم عمليته،
        // ضروري للمرتجع (كل عملية بترجع لوحدها من Paymob)
        const _list = (d.cardTxns && d.cardTxns.length) ? d.cardTxns : (d.cardTxn ? [d.cardTxn] : []);
        if(!_list.length) break;
        // إنجليزي + اتجاه LTR: الأرقام الطويلة بتتقلب في السياق العربي، وده بيمنع اللخبطة
        const rows = [];
        _list.forEach(function(ct, i){
          if(!ct) return;
          if(i) rows.push('- - - - - - - -');
          const scheme = ct.scheme ? String(ct.scheme) : 'CARD';
          if(_list.length > 1){
            rows.push('CARD ' + (ct.seq || (i+1)) + (ct.amount != null ? ('  ' + Math.abs(ct.amount).toFixed(2)) : ''));
          }
          if(ct.last4) rows.push(`${scheme} **** ${ct.last4}`);
          else if(ct.scheme) rows.push(scheme);
          if(ct.approvalCode) rows.push(`APPROVAL: ${ct.approvalCode}`);
          if(ct.transactionId) rows.push(`TXN ID: ${ct.transactionId}`);
        });
        if(!rows.length) break;
        parts.push(`<div dir="ltr" style="border-top:1px dashed #000; margin:5px 0 2px; padding-top:4px; text-align:center; font-size:${fs}; font-family:monospace; letter-spacing:.5px;">`
          + rows.map(r=> `<div style="font-weight:700; unicode-bidi:isolate;">${r}</div>`).join('')
          + `</div>`);
        break; }
      case 'custPoints': {
        // 🎁 بلوك نقط العميلة — الاسم الأول بس، وكسبت كام، ورصيدها بعد الفاتورة دي
        //
        // ⚠️ الاسم الأول بس عن قصد: الفاتورة بتتساب على الترابيزة وبتترمى
        //    في الشارع. اسم كامل + رقم موبايل على ورقة = مشكلة خصوصية
        //    حقيقية، والاسم الأول بيعمل نفس اللمسة الشخصية من غير الخطر.
        //
        // ⚠️ الرصيد المكتوب هو **بعد** الفاتورة دي — لو كتبنا رصيد قبلها
        //    العميلة هتفتح التطبيق وتلاقي رقم تاني وتفتكر إن فيه غلط.
        //    وكمان بيطرح النقط اللي استبدلتها في نفس الفاتورة.
        const cp = d.custPoints;
        if(!cp || !cp.show) break;            // مفيش عميلة على الفاتورة = البلوك مبيظهرش خالص
        const rows = [];
        if(cp.name) rows.push('<div style="font-weight:900;">' + cp.name + '</div>');
        // المرتجع بيخصم نقط — بنقولها صراحة بدل ما نكتب "كسبتي −٣"
        if(cp.earned > 0) rows.push('<div>كسبتي <b>' + cp.earned + '</b> نقطة من الفاتورة دي 🎁</div>');
        else if(cp.earned < 0) rows.push('<div>اتخصم <b>' + Math.abs(cp.earned) + '</b> نقطة (مرتجع)</div>');
        if(cp.redeemed > 0) rows.push('<div>استبدلتي <b>' + cp.redeemed + '</b> نقطة</div>');
        rows.push('<div style="font-weight:900;">رصيدك دلوقتي: ' + cp.balance + ' نقطة</div>');
        if(!rows.length) break;
        parts.push('<div style="border-top:1px dashed #000; border-bottom:1px dashed #000;'
          + ' margin:5px 0; padding:5px 0; text-align:center; font-size:' + fs + '; line-height:1.55;">'
          + rows.join('') + '</div>');
        break; }
      case 'invoiceNo':
        if(d.invoiceNo) parts.push(`<div style="text-align:center; font-size:${fs};">${L.invoice} ${d.invoiceNo}</div>`); break;
      case 'barcode': {
        const bimg = receiptBarcodeImg(d.scanCode);
        if(bimg) parts.push(`<img src="${bimg}" style="width:${c.bcWidthPct||90}%; display:block; margin:5px auto 1px;">`);
        else if(d.scanCode && typeof JsBarcode==='undefined') parts.push(`<div style="text-align:center; font-size:10px; border:1px dashed #999; padding:6px; margin:4px 0;">⚠️ مكتبة الباركود مش متحمّلة — اعمل ريفريش وانت متوصل بالنت مرة واحدة</div>`);
        // الكود لازم يبقى مقروء حتى لو قارئ الباركود/الطابعة ضعّف الرسم — مستقل عن الصورة.
        if(d.scanCode) parts.push(`<div dir="ltr" style="text-align:center; font-family:Consolas,'Courier New',monospace; font-size:${c.bcFont||11}px; font-weight:900; letter-spacing:.8px; line-height:1.2; color:#000;">${String(d.scanCode).replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`);
        break; }
      case 'appQR':
        if(d.showAppQR && d.appQrImg){
          parts.push(`<div style="text-align:center; margin-top:6px; border-top:2px dashed #000; padding-top:6px;">
            <div style="font-size:${fs}; font-weight:bold;">📱 ${d.appQrTitle||''}</div>
            <img src="${d.appQrImg}" style="width:88px; height:88px; margin:3px auto; display:block;">
            <div style="font-size:${Math.max(8,(el.size||10)-1)}px;">${d.appQrMsg||''}</div>
          </div>`);
        }
        break;
    }
  }
  /* 🎁 بانر الهدية — بعد ترويسة المحل على طول، عشان يبان قبل الأصناف */
  if(gift){
    const gs = Math.max(11, (parseInt((c.elements.find(function(e){ return (e.base||e.id)==='shopName'; })||{}).size) || 13) - 1);
    parts.splice(headerEnd, 0,
      '<div style="border:2px solid #000; border-radius:6px; margin:5px 0 4px;'
      + ' padding:5px 6px; text-align:center; font-weight:900; font-size:' + gs + 'px;">'
      + '🎁 إيصال هدية'
      + '<div style="font-weight:600; font-size:' + Math.max(8, gs - 3) + 'px; margin-top:2px;">'
      + 'للاستبدال أو الإرجاع — من غير أسعار</div>'
      + '</div>');
  }
  const _gap = (c.lineGap!=null? c.lineGap : 2);
  const _feed = (c.endFeed!=null? c.endFeed : 16);
  const _html = `<div dir="${dir}" style="font-family:Arial, sans-serif; color:#000; font-weight:500; -webkit-font-smoothing:none; display:flex; flex-direction:column; gap:${_gap}px;">${parts.join('')}<div style="height:${_feed}px;"></div></div>`;
  /* ============================================================
     🎁🔒 الحارس الأخير — ورقة الهدية ممنوع يطلع فيها رقم فلوس
     ------------------------------------------------------------
     ⚠️ ليه حارس زيادة على شيل البلوكات: العناصر بتتقري من إعداد
        محفوظ في Firestore، والمالك يقدر يضيف عنصر نص حر فيه سعر،
        أو بلوك فلوس جديد يتضاف بكرة وينسى يتحط في GIFT_HIDDEN.
        وقتها الورقة بتطبع السعر و**محدش هيلاحظ** غير لما تبقى
        العميلة كاشفة هديتها قدام اللي جابتها.
     الحارس بيدوّر على اسم العملة أو نمط سعر (رقم بكسور) في الناتج
     النهائي، ولو لقى بيرمي — والمنادي بيقول للكاشير بدل ما يطبع.
     ============================================================ */
  if(gift){
    const _cur = (function(){ try{ return currencyLabel(); }catch(e){ return 'ج.م'; } })();
    const _txt = _html.replace(/<[^>]*>/g, ' ');
    if(_cur && _txt.indexOf(_cur) >= 0)
      throw new Error('إيصال الهدية فيه عملة (' + _cur + ') — راجع عناصر تصميم الفاتورة');
    // ⚠️ جدول الأصناف بيتشال قبل فحص نمط السعر: اسم الصنف بيانات المالك
    //    وممكن يكون فيه رقم بكسور بشكل مشروع («شيفون 1.50 متر»). لو
    //    فحصناه، إيصال الهدية كان هيرفض يطبع على منتج اسمه سليم — والكاشير
    //    قدام العميلة. الجدول أصلًا اتبنى فوق **من غير** أعمدة الفلوس.
    const _noItems = _html.replace(/<table[\s\S]*?<\/table>/g, ' ').replace(/<[^>]*>/g, ' ');
    if(/\d+\.\d{2}(?!\d)/.test(_noItems))
      throw new Error('إيصال الهدية فيه رقم بشكل سعر — راجع عناصر تصميم الفاتورة');
  }
  return _html;
}
// 📱 QR الفاتورة: بنجيب صورته مرة واحدة ونخزّنها محليًا — عشان الطباعة تبقى فورية وأوفلاين
function receiptQrKey(){
  const isGlow = (typeof GLOW_BRANCHES!=='undefined') && GLOW_BRANCHES.includes(currentBranch);
  // v2 = الدومين الجديد echarpe.store — مفتاح جديد فالأجهزة كلها هتولّد QR جديد أول فتحة
  return { app: isGlow?'glow':'loyalty', key: 'rcpt_qr_v2_' + (isGlow?'glow':'loyalty') + '_' + (currentBranch||'') };
}
async function ensureReceiptQrCached(){
  try{
    const {app, key} = receiptQrKey();
    if(localStorage.getItem(key)) return;
    const url = 'https://www.echarpe.store/' + app + '/?src=' + encodeURIComponent('qr-rcpt-' + (currentBranch||'').replace(/\s+/g,'-'));
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
    cardTxn:{ scheme:'MasterCard', last4:'4321', approvalCode:'012345', transactionId:504208925 },
    // 💳💳 معاينة الدفع بكارتين — عشان المالك يشوف شكل البلوك في محرر التصميم
    cardTxns:[
      { seq:1, amount:200, scheme:'MasterCard', last4:'4321', approvalCode:'012345', transactionId:504208925 },
      { seq:2, amount:350, scheme:'Visa',       last4:'8890', approvalCode:'447120', transactionId:504208931 }
    ], changeStr:50,
    // 🎁 معاينة بلوك النقط — المالك لازم يشوف شكله قبل ما يشغّله
    custPoints:{ show:true, name:'منى', earned:5, redeemed:0, balance:23 },
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
function addReceiptSpacerN(n){ for(let k=0;k<n;k++) receiptDesignConfig.elements.push({ id:'spacer_'+Date.now().toString(36)+k, on:true, size:10 }); renderReceiptDesignScreen(); }
function addReceiptDividerN(n){ for(let k=0;k<n;k++) receiptDesignConfig.elements.push({ id:'divider_'+Date.now().toString(36)+k, on:true }); renderReceiptDesignScreen(); }
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
// 🖱️ سحب وإفلات لإعادة ترتيب عناصر الفاتورة/الليبل
let _dsDrag = null;   // {from, list}
function _dsArr(list){ return list==='label' ? receiptDesignConfig.label.elements : receiptDesignConfig.elements; }
function dsDragStart(e, i, list){ _dsDrag = {from:i, list}; e.dataTransfer.effectAllowed='move'; e.currentTarget.style.opacity='.35'; }
function dsDragOver(e, i, list){
  if(!_dsDrag || _dsDrag.list!==list) return;
  e.preventDefault(); e.dataTransfer.dropEffect='move';
  e.currentTarget.style.borderTop = i < _dsDrag.from ? '2.5px solid #818cf8' : '';
  e.currentTarget.style.borderBottom = i > _dsDrag.from ? '2.5px solid #818cf8' : '';
}
function dsDrop(e, i, list){
  if(!_dsDrag || _dsDrag.list!==list) return;
  e.preventDefault();
  const arr = _dsArr(list);
  const [moved] = arr.splice(_dsDrag.from, 1);
  arr.splice(i, 0, moved);
  _dsDrag = null;
  renderReceiptDesignScreen();
}
function dsDragEnd(e){ _dsDrag = null; renderReceiptDesignScreen(); }

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
    if(el.id.indexOf('divider')===0){ parts.push(`<div style="border-top:2px dashed #000; margin:4px 2px;"></div>`); continue; }
    switch(el.base||el.id){
      case 'spacer': parts.push(`<div style="height:${el.size||8}px;"></div>`); break;
      case 'divider': parts.push(`<div style="border-top:1.5px dashed #000; margin:${el.size||4}px 0;"></div>`); break;
      case 'logo': if(c.logo) parts.push(`<img src="${c.logo}" style="display:block; margin:0 auto; max-width:${lb.logoWidth||50}%; max-height:${Math.round(h*0.3)}mm;">`); break;
      case 'shop': parts.push(`<div style="font-size:${fs}; color:#000; font-weight:600; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${(shopEl&&shopEl.text)||''}</div>`); break;
      case 'name': parts.push(`<div style="font-size:${fs}; font-weight:800; line-height:1.15; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; max-width:100%; word-break:break-word;">${it.name||''}</div>`); break;
      case 'price': {
        const cur = currencyLabel();
        const pv = (it.price!=null?it.price:'') + ' ' + cur;
        const st = lb.priceStyle||'plain';
        if(st==='box')       parts.push(`<div style="font-size:${fs}; font-weight:900; border:2px solid #000; border-radius:4px; padding:1px 8px; display:inline-block; white-space:nowrap; max-width:100%;">${pv}</div>`);
        else if(st==='solid')parts.push(`<div style="font-size:${fs}; font-weight:900; background:#000; color:#fff; border-radius:4px; padding:2px 9px; display:inline-block; white-space:nowrap; max-width:100%;">${pv}</div>`);
        else if(st==='tag')  parts.push(`<div style="font-size:${fs}; font-weight:900; border:2.5px solid #000; border-radius:99px; padding:3px 12px; display:inline-block; white-space:nowrap; max-width:100%;">${pv}</div>`);
        else                 parts.push(`<div style="font-size:${fs}; font-weight:900; white-space:nowrap; max-width:100%; overflow:hidden;">${pv}</div>`);
        break; }
      case 'barcode': if(it.barcode){
        // 🔴 ليه الرقم كان بيختفي: الليبل `display:flex` عمودي و`overflow:hidden`.
        //    بلوك الباركود كان `flex-shrink:0` (مبيصغّرش)، وسطر الرقم كان
        //    `overflow:hidden` — وده في الفليكس بيخلي أقل حجم = **صفر**.
        //    فأول ما المحتوى يزيد عن ارتفاع الليبل، السطر الوحيد اللي بيتعصر
        //    لحد ما يختفي هو الرقم. والباركود واقف مكانه فمفيش مساحة ترجع.
        //    الحل: الباركود **والرقم** بلوك واحد `flex-shrink:0` — واللي
        //    بيتقص لو ضاقت الدنيا هو اسم المنتج (مقصوص أصلًا بسطرين).
        const MM_PX = 3.7795;                                   // 1مم = 3.78px عند 96dpi
        const bcPx = Math.min(Number(lb.bcHeight) || 30, Math.round(h * 0.45 * MM_PX));
        parts.push(`<div style="flex-shrink:0; width:100%; max-width:100%;">`
          + `<div style="height:${bcPx}px; line-height:0; overflow:hidden; margin:1px auto;"><svg id="${barcodeSvgId}" shape-rendering="crispEdges"></svg></div>`
          // 🔢 الرقم جزء ثابت من بلوك الباركود — قبل كده كان عنصر منفصل ممكن
          // يتقفل في تصميم براند ويفضل شغال في التاني.
          + `<div style="flex-shrink:0; font-size:10px; font-weight:700; font-family:Consolas,'Courier New',monospace; letter-spacing:.6px; line-height:1.15; direction:ltr; max-width:100%; white-space:nowrap; color:#000;">${it.barcode}</div>`
          + `</div>`);
        break; }
      case 'code': if(it.barcode && !(lb.elements||[]).some(e=> e.on && (e.base||e.id)==='barcode')){
        // العنصر المنفصل بيشتغل بس لو الباركود نفسه مقفول — منع التكرار
        parts.push(`<div style="font-size:${fs}; letter-spacing:.5px; direction:ltr; max-width:100%; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${it.barcode}</div>`);
      } break;
    }
  }
  return `<div class="one-label" style="width:${w}mm; height:${h}mm; box-sizing:border-box; padding:1.5mm; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; text-align:center; font-family:Tahoma,Arial,sans-serif; overflow:hidden; page-break-after:always;"><div style="width:100%; max-height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; overflow:hidden;">${parts.join('')}</div></div>`;
}
// 🏷️ حساب عرض الباركود الفعلي بالمليمتر — قلب إصلاح الجودة:
// الطابعات الحرارية 203dpi = 8 نقط/مم. التمطيط بالنسبة المئوية كان بيوقّع الخطوط
// على أنصاف نقط → الطابعة تبعثرها → باركود مهزوز والماسح مش بيقرا.
// القاعدة: كل موديول = عدد نقط **صحيح**. 2 نقطة (0.25مم) هو المقروء المضمون،
// ولو الكود طويل والليبل ضيق بننزل لنقطة واحدة (0.125مم) بدل ما نمطط.
function labelBarcodeMm(modules, labelWmm){
  const QUIET_MM = 3;                          // منطقة هدوء ≥10 موديولات على الجنبين
  const printable = Math.max(10, (Number(labelWmm)||40) - QUIET_MM*2);
  let moduleMm = 0.25;                         // 2 نقطة لكل خط
  if(modules * moduleMm > printable) moduleMm = 0.125;   // نقطة واحدة — آخر حل قبل ما يبوظ
  return { moduleMm: moduleMm, totalMm: +(modules * moduleMm).toFixed(3), quietMm: QUIET_MM };
}
window.labelBarcodeMm = labelBarcodeMm;

// بعد ما JsBarcode يرسم — بنثبت العرض بالمليمتر بالظبط (مفيش تمطيط أفقي)
// الارتفاع بس هو اللي بيتمطط لملء الصندوق، وده مش بيأثر على القراءة (الخطوط رأسية)
function sizeBarcodeForThermal(svg, labelWmm){
  try{
    const naturalW = parseFloat(svg.getAttribute('width'));   // = عدد الموديولات (width:1)
    const naturalH = parseFloat(svg.getAttribute('height'));
    if(!naturalW || !naturalH) return;
    const mm = labelBarcodeMm(naturalW, labelWmm);
    svg.setAttribute('viewBox', '0 0 ' + naturalW + ' ' + naturalH);
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.style.width = mm.totalMm + 'mm';
    svg.style.height = '100%';
    svg.style.display = 'block';
    svg.style.margin = '0 auto';
    svg.setAttribute('preserveAspectRatio', 'none');
  }catch(e){}
}
window.sizeBarcodeForThermal = sizeBarcodeForThermal;

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
  try{ const bc = box.querySelector('#lblPrevBc'); if(bc&&typeof JsBarcode!=='undefined') { JsBarcode(bc, demo.barcode, {format:'CODE128', width:3, height:88, margin:33, displayValue:false, background:'#ffffff', lineColor:'#000000'}); fitBarcodeSvg(bc); } }catch(e){}
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
      <div style="flex:1; min-width:0;">
        <div style="font-weight:700; font-size:13px;">${it.name}</div>
        <div style="color:var(--muted); font-size:11px; direction:ltr; text-align:right;">${it.barcode||''}</div>
        ${it.stockQty != null ? `<div style="color:var(--warn); font-size:11px; font-weight:700; margin-top:2px;">📦 المتاح في الفرع: ${it.stockQty}</div>` : ''}
      </div>
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
  const labelWmmForPrint = w;
  const total = n;
  const shellCfg = (typeof window.posShell !== 'undefined') ? getPrinterCfg() : null;

  // نرسم الباركودات في حاوية مخفية الأول (عشان الـ SVG يبقى جاهز جوّه الـ HTML)
  const tmp = document.createElement('div');
  tmp.style.cssText = 'position:fixed; left:-9999px; top:0;';
  tmp.innerHTML = html;
  document.body.appendChild(tmp);
  // ⚡ إصلاح اللاج: نفس الكود = نفس الرسمة بالظبط — بنرسم كل كود **مرة واحدة**
  // وننسخ الـ SVG لباقي الليبلات. قبل كده 50 ليبل من 3 أصناف كانوا 50 رسمة
  // متتالية بتهنّج الصفحة، دلوقتي 3 رسمات و47 نسخة فورية.
  try{
    if(typeof JsBarcode!=='undefined'){
      const byId = {};
      tmp.querySelectorAll('svg[id]').forEach(s=>{ byId[s.id] = s; });
      const firstByCode = {};
      codes.forEach(c=>{
        const el = byId[c.id]; if(!el) return;
        const prev = firstByCode[c.code];
        if(prev){
          const cl = prev.cloneNode(true);
          cl.id = c.id;
          el.replaceWith(cl);
        }else{
          // 🖨️ width:1 عشان width attr بتاع الـSVG = عدد الموديولات بالظبط —
          // وبعدها بنثبت المقاس بالمليمتر (كل خط = نقط حرارية صحيحة، صفر تمطيط أفقي).
          // الأرقام مش جوه الـSVG (كانت بتتعصر مع الصندوق وتختفي) — بقت سطر HTML ثابت.
          JsBarcode(el, c.code, {
            format:'CODE128', width:1, height:80,
            margin:0,                      // الهدوء من حاوية الليبل بالمليمتر
            displayValue:false,
            background:'#ffffff', lineColor:'#000000'
          });
          sizeBarcodeForThermal(el, labelWmmForPrint);
          firstByCode[c.code] = el;
        }
      });
    }
  }catch(e){}
  const finalHTML = tmp.innerHTML;
  tmp.remove();

  if(shellCfg && shellCfg.labelPrinter){
    window.posShell.printLabel({ printer: shellCfg.labelPrinter, widthMm: w, heightMm: h, html: `<style>@page{size:${w}mm ${h}mm; margin:0;} body{margin:0;} *{-webkit-print-color-adjust:exact; print-color-adjust:exact; text-rendering:geometricPrecision;}</style>`+finalHTML })
      .then(()=> showToast('اتبعت '+total+' ليبل للطابعة 🏷️'))
      .catch(e=> showToast('فشل طباعة الليبل: '+e.message, 'err'));
  }else if(typeof window.posShell !== 'undefined'){
    // جوه برنامج الويندوز من غير طابعة متختارة → رسالة واضحة بدل الفشل الصامت
    showToast('🏷️ مفيش طابعة ليبل متختارة على الجهاز ده — افتح محرر تصميم الفاتورة، وتحت خالص اختار طابعة الليبل ودوس «حفظ طابعات الجهاز ده»', 'err');
  }else{
    const wdw = window.open('', '_blank', 'width=420,height=560');
    wdw.document.write(`<html dir="rtl"><head><meta charset="UTF-8"><style>@page{size:${w}mm ${h}mm; margin:0;} body{margin:0;} *{-webkit-print-color-adjust:exact; print-color-adjust:exact; text-rendering:geometricPrecision;}</style></head><body>${finalHTML}<script>window.print(); setTimeout(()=>window.close(), 500);<\/script></body></html>`);
    wdw.document.close();
    if(typeof reclaimWindowFocus === 'function') reclaimWindowFocus(500);
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
    const _brand = _designEditBrand || _deviceBrand();
    // 💾 نحفظ محليًا الأول (فوري ومضمون) — عشان لو النت/السيرفر فشل، الإعداد يفضل محفوظ على الجهاز
    try{ localStorage.setItem('rcpt_design_'+_brand, JSON.stringify(cfg)); }catch(_e){}
    receiptDesignConfig = cfg;
    showToast('اتحفظ تصميم ' + (_brand==='glow' ? 'Glow 🖤' : 'إيشارب 🎀') + ' ✅');
    // بعدين نحاول نحفظ على السيرفر (لو فشل، المحلي شغّال بالفعل)
    try{ await db.collection(TEST_SETTINGS).doc(_designDocIdFor(_brand)).set(cfg); }
    catch(_srv){ showToast('اتحفظ على الجهاز ✅ (السيرفر هيتحدّث لما النت يرجع)', 'ok'); }
    if(_brand !== _deviceBrand()) await loadReceiptDesignConfig(_deviceBrand());   // جهازك يرجع لتصميم فرعه
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
       <button class="secondary" onclick="testInvoicePrinter()" style="width:100%; margin-top:8px; padding:10px;">🧪 اختبار طباعة فاتورة تجريبية</button>
       <button class="secondary" onclick="testLabelPrinter()" style="width:100%; margin-top:8px; padding:10px;">🏷️ اختبار طباعة ليبل تجريبي</button>
       <button class="secondary" onclick="testCashDrawer()" style="width:100%; margin-top:8px; padding:10px;">💰 اختبار فتح درج الكاش</button>`;
  }catch(e){ box.innerHTML = '<div style="color:var(--bad); font-size:12px;">تعذر تحميل الطابعات: '+e.message+'</div>'; }
}
// 🖨️ مُعرّف ثابت للجهاز (عشان نربط إعدادات الطابعة بيه على السيرفر)
function _deviceKey(){
  let k = localStorage.getItem('pos_device_key');
  if(!k){ k = 'dev_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36); try{ localStorage.setItem('pos_device_key', k); }catch(e){} }
  return k;
}
// كاش في الذاكرة لإعدادات الطابعة (بيتملّى من السيرفر عند بدء التشغيل)
window._printerCfgCache = window._printerCfgCache || null;
// قراءة موحّدة: المحلي الأول، وإلا الكاش اللي جه من السيرفر
function getPrinterCfg(){
  try{ const l = localStorage.getItem('pos_printers'); if(l) return JSON.parse(l); }catch(e){}
  return window._printerCfgCache || {};
}
// تحميل إعدادات الطابعة من السيرفر لو المحلي فاضي (الجهاز مسح بياناته)
async function loadPrinterCfgFromServer(){
  try{
    const local = localStorage.getItem('pos_printers');
    if(local){ window._printerCfgCache = JSON.parse(local); return; }   // المحلي موجود، مش محتاج
    const snap = await db.collection(TEST_SETTINGS).doc('printers_'+_deviceKey()).get();
    if(snap.exists){
      const cfg = snap.data();
      window._printerCfgCache = cfg;
      try{ localStorage.setItem('pos_printers', JSON.stringify(cfg)); }catch(e){}   // نرجّعه محليًا
    }
  }catch(e){ console.warn('load printer cfg from server', e); }
}

function savePrinterPickers(){
  const cfg = {
    invoicePrinter: document.getElementById('invoicePrinter').value,
    labelPrinter: document.getElementById('labelPrinter').value,
    drawerPrinter: document.getElementById('drawerPrinter').value
  };
  try{ localStorage.setItem('pos_printers', JSON.stringify(cfg)); }catch(e){}
  window._printerCfgCache = cfg;
  showToast('اتحفظت طابعات الجهاز ✅');
  // نحفظها على السيرفر كمان (مربوطة بالجهاز) — عشان لو الجهاز مسح بياناته، ترجع لوحدها
  try{ db.collection(TEST_SETTINGS).doc('printers_'+_deviceKey()).set(cfg).catch(()=>{}); }catch(e){}
}
function testCashDrawer(){
  if(typeof hasPerm === 'function' && !hasPerm('canOpenDrawer')){ showToast('فتح الدرج للمشرف/المدير بس', 'err'); return; }
  const shellCfg = (typeof window.posShell !== 'undefined') ? getPrinterCfg() : null;
  if(!shellCfg){ showToast('الاختبار ده بيشتغل من برنامج الويندوز بس', 'err'); return; }
  const drawerP = shellCfg.drawerPrinter || shellCfg.invoicePrinter;
  if(!drawerP){ showToast('اختار الطابعة الموصّل بيها الدرج الأول وادوس حفظ', 'err'); return; }
  // بنبعت أمر فتح الدرج من غير طباعة فاتورة كاملة
  try{
    // من غير html خالص → الغلاف بيفتح الدرج بس ومبيطبعش ورق
    window.posShell.printReceipt({
      printer: drawerP,
      paperWidth: (receiptDesignConfig&&receiptDesignConfig.paperWidth)||'80',
      html: '',
      openDrawer: drawerP, openCashDrawer: drawerP, cashDrawer: true
    }).then((res)=>{
      // 🩺 لو ويندوز رفض الأمر، بنعرض السبب الحقيقي بدل ما نقول "اتبعت" وخلاص
      const err = res && (res.error || res.drawerError);
      if(err){ showToast('❌ الدرج مفتحش: ' + err, 'err'); console.warn('drawer error', err); return; }
      if(res && res.drawerOnly) showToast('اتبعت أمر فتح الدرج ✅ (من غير طباعة)');
      else showToast('اتبعت أمر فتح الدرج ✅ — لو طبع ورقة يبقى نسخة الويندوز قديمة');
    })
      .catch(e=> showToast('فشل إرسال الأمر: '+e.message, 'err'))
      // أمر الدرج بيشغّل عملية بره المتصفح زي الطباعة — نفس ضياع التركيز
      .then(function(){ if(typeof reclaimWindowFocus === 'function') reclaimWindowFocus(700); });
  }catch(e){ showToast('خطأ: '+e.message, 'err'); }
}
function testLabelPrinter(){
  // ليبل واحد تجريبي بنفس مسار الطباعة الحقيقي — لو طلع، يبقى كل حاجة متظبطة
  doPrintLabels([{ name:'ليبل اختبار ✅', price:100, barcode:'TEST123456', qty:1 }]);
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
    items: cart.map(it=> ({name:it.name, qty:it.qty, barcode:it.barcode||'',
      unit:Number(it.price||0).toFixed(2), line:(it.price*it.qty).toFixed(2)})),
    totalStr: Number(total).toFixed(2), payStr, invoiceNo: invoiceNo||'', scanCode: invoiceCode||invoiceNo||'',
    // 💳↩️ v295 (فاتورة 1444): اتسحب من الكارت أكتر من الفاتورة —
    //    بيتطبع صراحةً إنه بيترد — الورقة هي إثبات العميلة إنها تاخد حقها
    cardOverStr: (function(){
      try{
        const v = Number((payments||{}).visa) || 0;
        const t = Math.abs(Number(total) || 0);
        const d2 = +(Math.abs(v) - t).toFixed(2);
        return (v > 0 && Number(total) > 0 && d2 > 0.005) ? d2.toFixed(2) : '';
      }catch(e){ return ''; }
    })(),
    // 💳 بيانات الكارت بتتطبع بشرطين مع بعض:
    //   (١) الفاتورة دي فيها دفع فيزا فعلًا  (٢) وفيه بيانات كارت متأكدة
    // الشرط الأول ضروري: البيانات متخزنة على window، ولو مااتصفرتش لأي سبب
    // كانت هتتنقل لفاتورة الكاش اللي بعدها وتطبع "فيزا" غلط.
    cardTxn: (Number((payments||{}).visa) > 0 && window.paymobCardInfo) ? window.paymobCardInfo : null,
    // 💳💳 كل الكروت المؤكدة (نفس الشرطين بالظبط — من غير كده بيانات كارت قديمة
    // ممكن تتطبع على فاتورة كاش)
    cardTxns: (Number((payments||{}).visa) > 0 && window.paymobCardTxns && window.paymobCardTxns.length)
      ? window.paymobCardTxns : null,
    // 🎁 نقط العميلة — بتتحسب هنا لأن الطباعة بتحصل **قبل** ما النقط تتكتب
    //    في Firestore (الورقة اتقدّمت عمدًا عشان العميلة ماتستناش الشبكة).
    //    يعني ممنوع نقرا الرصيد من المستند — لازم نحسبه محليًا.
    custPoints: (function(){
      try{
        const src = window.receiptCustPoints;
        if(!src || !src.phone) return { show:false };
        return {
          show: true,
          // الاسم الأول بس — الفاتورة بتترمى في الشارع (خصوصية)
          name: String(src.name||'').trim().split(/\s+/)[0] || '',
          earned: Number(src.earned) || 0,
          redeemed: Number(src.redeemed) || 0,
          // ⭐ الرصيد **بعد** الفاتورة = رصيدها قبلها + المكتسب − المستبدل
          balance: Math.max(0, (Number(src.balanceBefore)||0)
                     + (Number(src.earned)||0) - (Number(src.redeemed)||0))
        };
      }catch(e){ return { show:false }; }
    })(),
    // 💵 الفكة = المدفوع − المطلوب (في فواتير البيع بس، ولما يكون فيه كاش)
    changeStr: (function(){
      try{
        const paid = Object.values(payments||{}).reduce((n,v)=> n + (Number(v)||0), 0);
        const t = Number(total)||0;
        if(t <= 0) return 0;                              // مرتجع = مفيش فكة
        if(!((payments||{}).cash > 0)) return 0;          // الفكة بتترد كاش بس
        const diff = +(Math.abs(paid) - Math.abs(t)).toFixed(2);
        return diff > 0 ? diff : 0;
      }catch(e){ return 0; }
    })()
  };
  // QR التطبيق: يظهر بس لو مفيش رقم، أو الرقم مش مسجّل، أو مسجّل من غير تطبيق
  const _ph = (document.getElementById('customerPhone')||{value:''}).value.trim();
  data.showAppQR = !_ph || !custExists || !custHasApp;
  data.appQrImg = localStorage.getItem(receiptQrKey().key)||'';
  data.appQrTitle = (!_ph || !custExists) ? 'سجّلي في نادينا! 📱' : 'حمّلي تطبيقنا! 📱';
  data.appQrMsg = welcomeRewardText();
  /* 🎁 نخزّن بيانات آخر فاتورة عشان زرار «إيصال هدية» على شاشة البيع.
     ⚠️ **محليًا بس** — صفر قراءات/كتابات. والوقت متسجّل عشان الزرار
        يختفي بعد شوية: زرار فاضل على الشاشة بيطبع إيصال لفاتورة
        الزبونة اللي فاتت هو باج مستني يحصل. */
  try{
    window.lastSaleForGift = {
      at: Date.now(),
      invoiceNo: invoiceNo || '',
      invoiceCode: invoiceCode || invoiceNo || '',
      empName: data.empName,
      // ↩️ سطور المرتجع بره — الهدية هي اللي اتباعت
      items: (cart||[]).filter(function(it){
          return !it.isReturn && !it.isRedemption && !it.isRewardDiscount && (it.qty||0) > 0;
        }).map(function(it){ return { name: it.name, qty: it.qty, barcode: it.barcode||'' }; })
    };
  }catch(e){ window.lastSaleForGift = null; }
  _printBuiltReceipt(data, payments);
}

/* ============================================================
   🎁 إيصال هدية لآخر فاتورة — من شاشة البيع على طول
   ------------------------------------------------------------
   ده المسار الحقيقي: العميلة بتقول "دي هدية" **بعد** ما دفعت.
   المسار التاني (سجل المبيعات) للي بترجع تاني يوم.
   ⚠️ نافذة ١٥ دقيقة: بعد كده الاحتمال الأكبر إن دي زبونة تانية
      خالص، وطباعة إيصال بأصناف حد تاني أوحش من إن الزرار مش موجود.
   ============================================================ */
const GIFT_LAST_WINDOW_MS = 15 * 60 * 1000;
function lastSaleGiftAvailable(now){
  const s = window.lastSaleForGift;
  if(!s || !s.items || !s.items.length) return false;
  return ((now || Date.now()) - (s.at || 0)) <= GIFT_LAST_WINDOW_MS;
}
function printGiftReceiptForLast(){
  if(!lastSaleGiftAvailable()){
    showToast('مفيش فاتورة قريبة — اطبع إيصال الهدية من سجل المبيعات', 'err');
    return;
  }
  const s = window.lastSaleForGift;
  try{
    const c = receiptDesignConfig || defaultReceiptConfig();
    _printBuiltReceipt({
      giftMode: true,
      dateStr: new Date(s.at).toLocaleString(c.lang==='en'?'en-GB':'ar-EG'),
      empName: s.empName || '',
      items: s.items,
      invoiceNo: s.invoiceNo,
      scanCode: s.invoiceCode,
      custPoints: { show:false },
      showAppQR: false
    }, {});     // {} = مفيش كاش → الدرج مايفتحش
    showToast('🎁 بيتطبع إيصال هدية لفاتورة ' + (s.invoiceNo || ''));
  }catch(e){ showToast('تعذر الطباعة: ' + e.message, 'err'); }
}
if(typeof window !== 'undefined'){
  window.printGiftReceiptForLast = printGiftReceiptForLast;
  window.lastSaleGiftAvailable = lastSaleGiftAvailable;
  window.refreshGiftBtn = refreshGiftBtn;
}
/* 👁️ ظهور/اختفاء الزرار. بيتنادى مع كل دخول لشاشة البيع + مؤقت خفيف،
   عشان يختفي لوحده لما النافذة تخلص والكاشير واقفة على نفس الشاشة. */
function refreshGiftBtn(){
  try{
    const b = document.getElementById('giftReceiptBtn');
    if(!b) return;
    b.style.display = lastSaleGiftAvailable() ? '' : 'none';
  }catch(e){}
}
if(typeof window !== 'undefined' && typeof document !== 'undefined'){
  setInterval(function(){ try{ refreshGiftBtn(); }catch(e){} }, 30000);
}
function _printBuiltReceipt(data, payments){
  const c = receiptDesignConfig || defaultReceiptConfig();
  const holder = document.getElementById('receiptPrint');
  holder.innerHTML = buildReceiptHTML(data);
  const inShell = (typeof window.posShell !== 'undefined');
  const shellCfg = inShell ? getPrinterCfg() : null;
  // 💰 أي **حركة كاش** لازم تفتح الدرج — داخلة أو خارجة.
  // 🔴 الباج: الشرط كان `> 0` بس. فاتورة المرتجع بتحمل مدفوعات **سالبة**
  // (cash: -500)، فالشرط كان بيرجع false والدرج مايفتحش خالص — بالظبط في
  // اللحظة اللي الكاشير محتاجة تفتحه فيها عشان تطلّع فلوس للعميلة.
  // الفيزا والتبديل المتساوي لسه مش بيفتحوا الدرج (مفيش كاش بيتحرك) ✅
  const hasCash = payments && Math.abs(Number(payments.cash) || 0) > 0.005;

  // داخل برنامج الويندوز (exe): طباعة صامتة + فتح الدرج
  if(inShell){
    if(!shellCfg || !shellCfg.invoicePrinter){
      // مفيش طابعة متختارة → مانعملش window.print (بتقعد تطبع) — نقول للكاشير يظبطها
      showToast('🖨️ اختار طابعة الفواتير الأول: من تصميم الفاتورة تحت خالص → اختار الطابعة ودوس «حفظ طابعات الجهاز»', 'err');
      return;
    }
    const drawerTarget = hasCash ? (shellCfg.drawerPrinter || shellCfg.invoicePrinter) : null;
    // 💰 الدرج يفتح **فورًا وبالتوازي** — كان الأمر راكب مع الطباعة فبيستنى
    // الفاتورة كلها تتصف وتتطبع، وأمر الضمان كان بيتبعت بعد ما الطباعة تخلص
    // (أبطأ وأبطأ). دلوقتي: أمر مستقل بيطلع في نفس اللحظة، والفلاجات جوه أمر
    // الطباعة فاضلة كاحتياطي للأجهزة اللي مفيهاش openDrawer مستقل.
    if(drawerTarget && typeof window.posShell.openDrawer === 'function'){
      try{ window.posShell.openDrawer({ printer: drawerTarget }); }catch(e){}
    }
    window.posShell.printReceipt({
      printer: shellCfg.invoicePrinter,
      paperWidth: c.paperWidth || '80',
      html: holder.outerHTML,
      openDrawer: drawerTarget,
      openCashDrawer: drawerTarget,   // اسم بديل لو الشِل بيستخدمه
      cashDrawer: !!drawerTarget
    }).catch(e=> { console.warn('silent print failed', e); showToast('تعذر الطباعة الصامتة: '+e.message, 'err'); })
      // 🔴 الطباعة الصامتة بتشغّل عملية طباعة/درج بره المتصفح، وويندوز
      //    ساعات مبيرجّعش التركيز للبرنامج بعدها. كل مسارات الطباعة التانية
      //    في النظام بتنادي reclaimWindowFocus — **إيصال البيع كان الوحيد
      //    اللي مش بيناديها**. وده بالظبط «بيحصل بعد عملية البيع، مش دايمًا».
      .then(function(){ if(typeof reclaimWindowFocus === 'function') reclaimWindowFocus(700); });
    return;
  }

  // في المتصفح العادي (مش exe): طباعة المتصفح
  window.print();
  if(typeof reclaimWindowFocus === 'function') reclaimWindowFocus(500);
}

// ---------------- 🧰 تولبار موحّد في كل الشاشات ----------------
// شريط واحد بس لكل شاشة: [⬅️ رجوع] + الأيقونات المهمة — كبير وواضح وثابت في كل حتة
function _uniBtnsHTML(){
  const b = (icon, label, fn, show)=> show===false ? '' :
    `<button class="uniBtn" onclick="${fn}" title="${label}">
      <span class="uniIco">${icon}</span><span class="uniLbl">${label}</span>
    </button>`;
  // مختصر عمدًا: الأكثر استخدامًا بس — الباقي كله ضغطة واحدة من 🏠
  return b('🏠','الرئيسية',"showScreen('dashboardScreen')", true)
       + b('🧾','البيع','resumeOrStartSale()', true)
       + b('🚚','التحويلات','goToTransfers()', true)
       + b('📊','التقارير','goToReports()', hasPerm('canViewReports'));
}
const _UNI_DUP_RE = /(resumeOrStartSale|goToInventory|goToCustomerList|goToReports|goToReceiveGoods|goToTransfers|goToDashboard|goToSale)\s*\(/;
function injectUnifiedToolbars(){
  document.querySelectorAll('.screen').forEach(scr=>{
    if(scr.id === 'dashboardScreen') return;
    const heads = scr.querySelectorAll('.dash-header, .mgmt-topbar');
    if(!heads.length) return;
    scr.querySelectorAll('.uniToolbar').forEach(el=> el.remove());   // مفيش شريطين أبدًا
    const head = heads[0];

    // 1) نمتص زرار الرجوع الأصلي — ونحفظ وجهته على الهيدر نفسه عشان تعيش مع كل إعادة بناء
    const backBtn = [...head.querySelectorAll('button')].find(x=> (x.textContent||'').includes('رجوع') && !x.classList.contains('uniBack'));
    if(backBtn && !head.dataset.backOc){
      head.dataset.backOc = backBtn.getAttribute('onclick') || "showScreen('dashboardScreen')";
      backBtn.remove();
    }
    const backOc = head.dataset.backOc || "showScreen('dashboardScreen')";

    const bar = document.createElement('div');
    bar.className = 'uniToolbar';
    // الشريط بالكامل من إعداد المدير (ترتيب/إخفاء/أزرار مخصصة) — ولو الموديول مش موجود نرجع للأساسي
    if(typeof uiToolbarButtonsHTML === 'function'){
      bar.innerHTML = uiToolbarButtonsHTML(backOc);
    }else{
      const fb = document.createElement('button');
      fb.className = 'uniBack';
      fb.innerHTML = '⬅️ <span>رجوع</span>';
      fb.setAttribute('onclick', backOc);
      bar.innerHTML = _uniBtnsHTML();
      bar.prepend(fb);
    }

    // 2) نشيل أزرار التنقل القديمة المكررة في الهيدر (الشريط بياخد وظيفتها) — الفريدة بتفضل
    [...head.querySelectorAll('button')].forEach(btn=>{
      if(btn.classList.contains('uniBack') || btn.classList.contains('uniBtn')) return;
      if(bar.contains(btn)) return;
      const oc = btn.getAttribute('onclick') || '';
      if(_UNI_DUP_RE.test(oc)) btn.remove();
    });

    head.appendChild(bar);
  });
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

  // Esc — رجوع من أي مكان: يقفل لوحة تعديل الشكل، بعدين أي نافذة مفتوحة، بعدين يرجّع للشاشة السابقة
  if(e.key === 'Escape'){
    if(typeof uiedIsOpen === 'function' && uiedIsOpen()){ e.preventDefault(); uiedClose(); return; }
    const openModal = document.querySelector('.modal-overlay.active');
    if(openModal){ e.preventDefault(); openModal.classList.remove('active'); return; }
    const active = document.querySelector('.screen.active');
    if(!active || active.id === 'dashboardScreen' || active.id === 'loginScreen') return;
    e.preventDefault();
    if(active.id === 'saleScreen'){ if(typeof goToDashboard==='function') goToDashboard(); else showScreen('dashboardScreen'); return; }
    const backEl = active.querySelector('.uniBack');
    if(backEl) backEl.click();
    else { const oc = active.querySelector('.dash-header, .mgmt-topbar'); if(oc && oc.dataset.backOc){ try{ (0,eval)(oc.dataset.backOc); }catch(_){ showScreen('dashboardScreen'); } } else showScreen('dashboardScreen'); }
    return;
  }

  // الباقي مخصوص لشاشة البيع بس
  if(!_onSaleScreen()) return;

  if(e.key === 'F2'){ e.preventDefault(); if(typeof togglePayMethod==='function') togglePayMethod('cash'); return; }
  // 💳 F3 بيروح لأول كارت متاح لوحده (لو الأول اتأكد بيفتح التاني) · Shift+F3 = كارت 2 مباشرة
  if(e.key === 'F3'){ e.preventDefault(); if(typeof togglePayMethod==='function') togglePayMethod(e.shiftKey ? 'visa2' : 'visa'); return; }
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

  // ⬆️⬇️ تنقّل بين سطور السلة بالأسهم · Delete يمسح السطر المحدد
  if((e.key === 'ArrowUp' || e.key === 'ArrowDown') && typeof cart !== 'undefined' && cart.length){
    e.preventDefault();
    const d = (e.key === 'ArrowDown') ? 1 : -1;
    if(selectedCartIdx === null) selectedCartIdx = (d === 1) ? 0 : cart.length - 1;
    else selectedCartIdx = Math.min(cart.length - 1, Math.max(0, selectedCartIdx + d));
    renderCart();
    const sel = document.querySelector('#saleScreen tr.sel');
    if(sel && sel.scrollIntoView) sel.scrollIntoView({ block:'nearest' });
    return;
  }
  // ➕➖ زيادة/نقصان كمية السطر المحدد (من الصف العلوي أو النمباد)
  if(typeof cart !== 'undefined' && cart.length && (e.code === 'NumpadAdd' || e.code === 'NumpadSubtract' || e.key === '+' || e.key === '-')){
    const isPlus = (e.code === 'NumpadAdd' || e.key === '+');
    // لو مفيش سطر محدد، نحدد آخر سطر تلقائي عشان الحركة تبقى سلسة
    if(selectedCartIdx === null) selectedCartIdx = cart.length - 1;
    e.preventDefault();
    if(typeof qbxQty === 'function') qbxQty(isPlus ? 1 : -1);
    const sel = document.querySelector('#saleScreen tr.sel');
    if(sel && sel.scrollIntoView) sel.scrollIntoView({ block:'nearest' });
    return;
  }
  if(e.key === 'Delete' && typeof cart !== 'undefined' && selectedCartIdx !== null && cart[selectedCartIdx]){
    e.preventDefault();
    const name = cart[selectedCartIdx].name;
    removeFromCart(selectedCartIdx);
    selectedCartIdx = null;
    renderCart();
    showToast('🗑️ اتشال "' + name + '" من الفاتورة');
    return;
  }
});

// ---------------- 🖨️ طابور الطباعة السحابي (إيصالات من برنامج الحضور وغيره) ----------------
// برنامج الحضور بيبعت "أمر طباعة" لفرع معيّن → الكاشير المفتوح هناك بيطبعه صامت ويعلّمه
const _printJobsDone = new Set();
function buildGenericReceiptHTML(p){
  const c = receiptDesignConfig || defaultReceiptConfig();
  const w = (c.paperWidth === '58') ? '54mm' : '72mm';
  const logo = c.logo ? `<img src="${c.logo}" style="display:block; margin:0 auto 4px; max-width:${c.logoWidth||60}%;">` : '';
  return `<div style="width:${w}; font-family:Tahoma,Arial; color:#000; direction:rtl; padding:2mm;">
    ${logo}
    <div style="text-align:center; font-weight:900; font-size:15px; border-bottom:1.5px dashed #000; padding-bottom:5px;">${p.title||''}</div>
    <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:6px;"><b>${p.empName||''}</b><span>📍 ${p.branch||''}</span></div>
    <div style="font-size:11px; color:#333; margin-bottom:6px;">عن شهر: ${p.period||''} · ${new Date().toLocaleDateString('ar-EG',{day:'2-digit',month:'long',year:'numeric'})}</div>
    <div style="border-top:1px dashed #999; padding-top:5px;">
      ${(p.lines||[]).map(l=>`<div style="display:flex; justify-content:space-between; font-size:12.5px; padding:2.5px 0;"><span>${l[0]}</span><b>${l[1]}</b></div>`).join('')}
    </div>
    ${p.net?`<div style="display:flex; justify-content:space-between; font-size:15px; font-weight:900; border-top:1.5px solid #000; border-bottom:1.5px solid #000; padding:5px 0; margin:5px 0;"><span>${p.net.label}</span><span>${p.net.value}</span></div>`:''}
    ${(p.extra&&p.extra.length)?`
      <div style="font-size:11px; font-weight:800; margin-top:5px;">— مستحقات بتتصرف منفصلة —</div>
      ${p.extra.map(l=>`<div style="display:flex; justify-content:space-between; font-size:11.5px; padding:2px 0; color:#222;"><span>${l[0]}</span><b>${l[1]}</b></div>`).join('')}
      ${p.extraNote?`<div style="font-size:9px; color:#555;">${p.extraNote}</div>`:''}`:''}
    <div style="font-size:11px; margin-top:12px; padding-top:8px; border-top:1px dashed #999;">${p.footer||''}</div>
  </div>`;
}
function _printGenericJob(job){
  const holder = document.getElementById('receiptPrint');
  holder.innerHTML = buildGenericReceiptHTML(job.payload||{});
  const c = receiptDesignConfig || defaultReceiptConfig();
  const shellCfg = (typeof window.posShell !== 'undefined') ? getPrinterCfg() : null;
  if(shellCfg && shellCfg.invoicePrinter){
    return window.posShell.printReceipt({ printer: shellCfg.invoicePrinter, paperWidth: c.paperWidth||'80', html: holder.outerHTML, openDrawer: null });
  }
  window.print();
  if(typeof reclaimWindowFocus === 'function') reclaimWindowFocus(500);
  return Promise.resolve();
}
function startPrintJobListener(){
  try{
    db.collection('pos_print_jobs')
      .where('branch','==', currentBranch)
      .where('status','==','pending')
      .onSnapshot(async (snap)=>{
        for(const d of snap.docs){
          if(_printJobsDone.has(d.id)) continue;
          _printJobsDone.add(d.id);
          try{
            await _printGenericJob({ id:d.id, ...d.data() });
            await db.collection('pos_print_jobs').doc(d.id).update({ status:'printed', printedAt: Date.now(), printedByBranchDevice: currentBranch });
            showToast('🖨️ اتطبع إيصال جاي من برنامج الحضور');
          }catch(e){ console.warn('print job', e); _printJobsDone.delete(d.id); }
        }
      }, (err)=> console.warn('print jobs listener', err));
  }catch(e){ console.warn('print jobs', e); }
}

// ---------------- Init ----------------
(async function init(){
  ensureReceiptQrCached();
  setTimeout(startPrintJobListener, 3000);   // بعد ما الفرع والدخول يثبتوا
  setTimeout(injectUnifiedToolbars, 800);
  setTimeout(injectUnifiedToolbars, 5000);   // تاني بعد تحميل الصلاحيات   // نخزّن QR الفاتورة محليًا (مرة واحدة لكل جهاز/فرع)
  await ensureDemoInventory();
  await loadInventory();
  await loadReceiptDesignConfig();
  // 🖨️ لو الجهاز مسح إعدادات الطابعة محليًا، نرجّعها من السيرفر
  if(typeof window.posShell !== 'undefined'){ loadPrinterCfgFromServer().catch(()=>{}); }
})();
