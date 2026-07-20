// ============================================================
// 🎨 محرر شكل شاشة البيع + الشريط العلوي — نظام أيقونات: ترتيب حر، إظهار/إخفاء،
//    نقل بين البانلز، تكبير/تصغير، وإضافة أزرار جاهزة بمزاج المدير.
// معزول تمامًا: لو حصل أي خطأ هنا، الـ POS بيفضل شغّال بالشكل الافتراضي.
// الحفظ: pos_test_settings/ui_layout (شكل موحّد لكل الفروع، زي تصميم الفاتورة).
// ============================================================
(function(){
'use strict';

// ---- الأزرار الأصلية (الموجودة في الـ HTML بـ data-uid). بنحرّك عقدها زي ماهي
//      عشان تحتفظ بسلوكها ١٠٠٪ (زي أزرار الهولد) — مش بنعيد بنائها. ----
const BUILTINS = [
  { uid:'sa_back',       ico:'◀',  name:'رجوع',            panel:'actions' },
  { uid:'sa_hold0',      ico:'🅰️', name:'هولد ١',          panel:'actions' },
  { uid:'sa_hold1',      ico:'🅱️', name:'هولد ٢',          panel:'actions' },
  { uid:'sa_drawer',     ico:'💵', name:'فتح الدرج',        panel:'actions' },
  { uid:'sa_discount',   ico:'٪',  name:'خصم',             panel:'actions' },
  { uid:'sa_addcust',    ico:'➕', name:'إضافة عميل',       panel:'actions' },
  { uid:'sa_redeem',     ico:'🎁', name:'استبدال نقاط',     panel:'actions' },
  { uid:'sa_cashier',    ico:'👤', name:'الكاشير',          panel:'actions' },
  { uid:'sa_logout',     ico:'🚪', name:'خروج',            panel:'actions' },
  { uid:'sa_receive',    ico:'📥', name:'استلام المنتجات',   panel:'actions' },
  { uid:'io_qtyplus',    ico:'➕', name:'كمية +',          panel:'itemops' },
  { uid:'io_qtyminus',   ico:'➖', name:'كمية −',          panel:'itemops' },
  { uid:'io_returnitem', ico:'↩️', name:'مرتجع الصنف',      panel:'itemops' },
  { uid:'io_delitem',    ico:'🗑️', name:'حذف الصنف',        panel:'itemops' },
  { uid:'io_returnall',  ico:'🔄', name:'مرتجع الفاتورة',   panel:'itemops' }
];
const BUILTIN_BY_UID = {}; BUILTINS.forEach(b=> BUILTIN_BY_UID[b.uid]=b);

// ---- أزرار الشريط العلوي الأصلية (بتظهر في كل الشاشات ماعدا البيع) ----
//      دي بتترسم من الإعداد في كل مرة (مش عقد ثابتة) فالترتيب/الإخفاء بيشتغل عليها كمان.
const BUILTIN_TB = [
  { uid:'tb_back',      ico:'⬅️', name:'رجوع',      special:'back' },
  { uid:'tb_home',      ico:'🏠', name:'الرئيسية',   call:"showScreen('dashboardScreen')" },
  { uid:'tb_sale',      ico:'🧾', name:'البيع',      call:'resumeOrStartSale()' },
  { uid:'tb_transfers', ico:'🚚', name:'التحويلات',  call:'goToTransfers()' },
  { uid:'tb_reports',   ico:'📊', name:'التقارير',   call:'goToReports()', perm:'canViewReports' }
];
const TB_BY_UID = {}; BUILTIN_TB.forEach(t=>{ TB_BY_UID[t.uid]=t; BUILTIN_BY_UID[t.uid]=t; });

// ---- قايمة الوظائف الآمنة للأزرار الجديدة: المدير يختار منها فقط (مفيش كتابة كود) ----
const ACTIONS_WHITELIST = {
  discount:  { name:'💸 خصم',              call:'openGiveDiscount()' },
  drawer:    { name:'💵 فتح الدرج',         call:'openCashDrawer()' },
  addcust:   { name:'➕ إضافة عميل',        call:'focusAddCustomer()' },
  redeem:    { name:'🎁 استبدال نقاط',      call:'openRedeemPoints()' },
  receive:   { name:'📥 استلام المنتجات',    call:'goToReceiveGoods()' },
  cashier:   { name:'👤 الكاشير',           call:'showCashierInfo()' },
  logout:    { name:'🚪 خروج',             call:'logout()' },
  dashboard: { name:'🏠 الرئيسية',          call:"showScreen('dashboardScreen')" },
  sale:      { name:'🧾 البيع',            call:'resumeOrStartSale()' },
  transfers: { name:'🚚 التحويلات',         call:'goToTransfers()' },
  reports:   { name:'📊 التقارير',          call:'goToReports()' },
  returnall: { name:'🔄 مرتجع الفاتورة',    call:'qbxReturnWholeInvoice()' },
  clearpay:  { name:'🧹 مسح المدفوعات',     call:'resetPaymentUI()' },
  hold1:     { name:'🅰️ هولد ١',           call:'toggleHold(0)' },
  hold2:     { name:'🅱️ هولد ٢',           call:'toggleHold(1)' }
};

// ---- الإعداد الافتراضي: كل زر في بانله وبترتيبه الطبيعي، مفيش إخفاء، مفيش مخصص ----
function defaultLayout(){
  return {
    version: 1,
    layout: {
      actions: BUILTINS.filter(b=>b.panel==='actions').map(b=>b.uid),
      itemops: BUILTINS.filter(b=>b.panel==='itemops').map(b=>b.uid),
      topbar:  BUILTIN_TB.map(t=>t.uid)   // أزرار الشريط الأصلية + أي مخصص المدير بيضيفه بعدها
    },
    hidden: [],                         // قايمة uid المخفية
    custom: {},                         // uid -> { ico, label, action }
    sizes: { actionsW:170, itemopsW:110, btnFont:13, tbIco:24 }
  };
}

// حالة التشغيل
let CFG = defaultLayout();

// ---- دمج المحفوظ مع الأساسي: نحافظ على ترتيبك، ونضيف أي زر أصلي جديد في السيستم آخر بانله ----
function mergeLayout(saved){
  const base = defaultLayout();
  if(!saved || typeof saved!=='object') return base;
  const out = defaultLayout();
  // الأحجام
  if(saved.sizes && typeof saved.sizes==='object'){
    out.sizes.actionsW = _num(saved.sizes.actionsW, base.sizes.actionsW, 90, 320);
    out.sizes.itemopsW = _num(saved.sizes.itemopsW, base.sizes.itemopsW, 70, 260);
    out.sizes.btnFont  = _num(saved.sizes.btnFont,  base.sizes.btnFont,  9, 22);
    out.sizes.tbIco    = _num(saved.sizes.tbIco,    base.sizes.tbIco,    16, 34);
  }
  // الأزرار المخصصة الآمنة فقط
  out.custom = {};
  if(saved.custom && typeof saved.custom==='object'){
    Object.keys(saved.custom).forEach(uid=>{
      const c = saved.custom[uid];
      if(c && ACTIONS_WHITELIST[c.action]){          // نتجاهل أي وظيفة مش في القايمة الآمنة
        out.custom[uid] = { ico:(''+ (c.ico||'⭐')).slice(0,4), label:(''+(c.label||'')).slice(0,24), action:c.action };
      }
    });
  }
  const allKnown = uid => !!BUILTIN_BY_UID[uid] || !!out.custom[uid];
  // كل بانل: ناخد المحفوظ (المعروف بس) بترتيبه
  ['actions','itemops','topbar'].forEach(panel=>{
    const savedArr = (saved.layout && Array.isArray(saved.layout[panel])) ? saved.layout[panel] : [];
    out.layout[panel] = savedArr.filter(allKnown);
  });
  // أي زر أصلي مش موجود في أي بانل (نسخة قديمة) → نضيفه آخر بانله الطبيعي
  const placed = new Set([].concat(out.layout.actions, out.layout.itemops, out.layout.topbar));
  BUILTINS.forEach(b=>{ if(!placed.has(b.uid)) out.layout[b.panel].push(b.uid); });
  // أزرار الشريط العلوي: لو الإعداد قديم (مفيش ولا واحد منها) رتّبها في الأول قبل المخصص
  const tbPresent = BUILTIN_TB.some(t=> placed.has(t.uid));
  if(!tbPresent){
    out.layout.topbar = BUILTIN_TB.map(t=>t.uid).concat(out.layout.topbar);
    BUILTIN_TB.forEach(t=> placed.add(t.uid));
  }else{
    BUILTIN_TB.forEach(t=>{ if(!placed.has(t.uid)){ out.layout.topbar.push(t.uid); placed.add(t.uid); } });
  }
  // أي زر مخصص مش متحط في بانل → نحطه في actions (احتياطي)
  Object.keys(out.custom).forEach(uid=>{ if(!placed.has(uid) && out.layout.actions.indexOf(uid)<0 && out.layout.itemops.indexOf(uid)<0 && out.layout.topbar.indexOf(uid)<0) out.layout.actions.push(uid); });
  // حماية ضد التكرار: أي uid يظهر مرة واحدة بس في كل البانلز (لو الإعداد المحفوظ اتبوّظ)
  const seen = new Set();
  ['actions','itemops','topbar'].forEach(panel=>{
    out.layout[panel] = out.layout[panel].filter(uid=>{ if(seen.has(uid)) return false; seen.add(uid); return true; });
  });
  // المخفية (المعروفة بس، من غير تكرار)
  out.hidden = Array.isArray(saved.hidden) ? saved.hidden.filter((v,i,a)=> allKnown(v) && a.indexOf(v)===i) : [];
  return out;
}
function _num(v, def, min, max){ v = Number(v); if(!isFinite(v)) return def; return Math.max(min, Math.min(max, Math.round(v))); }

// ============================================================
// التطبيق على الشاشة الحقيقية
// ============================================================
function panelEl(panel){
  const scr = (typeof document!=='undefined') ? document.getElementById('saleScreen') : null;
  if(!scr) return null;
  return scr.querySelector(panel==='actions' ? '.qbx-actions' : '.qbx-itemops');
}

function buildCustomNode(uid){
  const c = CFG.custom[uid]; if(!c) return null;
  const spec = ACTIONS_WHITELIST[c.action]; if(!spec) return null;   // أمان: وظيفة معروفة بس
  const btn = document.createElement('button');
  btn.setAttribute('data-uid', uid);
  btn.setAttribute('data-uicustom', '1');
  btn.setAttribute('onclick', spec.call);
  btn.innerHTML = (c.ico?(_esc(c.ico)+'<br>'):'') + _esc(c.label||'');
  return btn;
}

function applyUiLayout(){
  if(typeof document==='undefined') return;
  const scr = document.getElementById('saleScreen'); if(!scr) return;

  // شيل أي أزرار مخصصة قديمة اترسمت قبل كده (هنعيد بناءها)
  scr.querySelectorAll('[data-uicustom="1"]').forEach(n=> n.remove());

  const hidden = new Set(CFG.hidden||[]);
  ['actions','itemops'].forEach(panel=>{
    const cont = panelEl(panel); if(!cont) return;
    (CFG.layout[panel]||[]).forEach((uid, idx)=>{
      let node = scr.querySelector('[data-uid="'+_cssq(uid)+'"]');
      if(!node && CFG.custom[uid]) node = buildCustomNode(uid);
      if(!node) return;
      if(node.parentNode !== cont) cont.appendChild(node);   // نقل بين البانلز
      node.style.order = idx;                                 // الترتيب (شغّال في grid و flex)
      node.style.display = hidden.has(uid) ? 'none' : '';
    });
  });

  applySizes();
}

function applySizes(){
  if(typeof document==='undefined') return;
  const s = CFG.sizes || defaultLayout().sizes;
  let st = document.getElementById('uiLayoutStyle');
  if(!st){ st = document.createElement('style'); st.id='uiLayoutStyle'; (document.head||document.documentElement).appendChild(st); }
  st.textContent =
    '#saleScreen .qbx-actions{width:'+_num(s.actionsW,170,90,320)+'px !important;}' +
    '#saleScreen .qbx-itemops{width:'+_num(s.itemopsW,110,70,260)+'px !important;}' +
    '#saleScreen .qbx-actions button, #saleScreen .qbx-itemops button{font-size:'+_num(s.btnFont,13,9,22)+'px !important;}' +
    '.uniToolbar .uniIco{font-size:'+_num(s.tbIco,24,16,34)+'px !important;}' +
    '.uniToolbar .uniLbl{font-size:'+Math.round(_num(s.tbIco,24,16,34)*0.46)+'px !important;}';
}

// الشريط العلوي كامل (رجوع + الأساسية + المخصصة) بالترتيب والإخفاء من الإعداد.
// بيتنده من app.js (injectUnifiedToolbars) وبياخد وجهة زرار الرجوع للشاشة الحالية.
function uiToolbarButtonsHTML(backOc){
  try{
    const hidden = new Set(CFG.hidden||[]);
    const order = (CFG.layout.topbar && CFG.layout.topbar.length) ? CFG.layout.topbar : defaultLayout().layout.topbar;
    let html = '';
    order.forEach(uid=>{
      if(hidden.has(uid)) return;
      const tb = TB_BY_UID[uid];
      if(tb){
        if(tb.perm && !((typeof hasPerm==='function') && hasPerm(tb.perm))) return;
        if(tb.special==='back'){
          html += '<button class="uniBack" onclick="'+(backOc||"showScreen('dashboardScreen')")+'">⬅️ <span>رجوع</span></button>';
        }else{
          html += '<button class="uniBtn" onclick="'+tb.call+'" title="'+_esc(tb.name)+'"><span class="uniIco">'+_esc(tb.ico)+'</span><span class="uniLbl">'+_esc(tb.name)+'</span></button>';
        }
      }else{
        const c = CFG.custom[uid]; if(!c) return;
        const spec = ACTIONS_WHITELIST[c.action]; if(!spec) return;
        html += '<button class="uniBtn" data-uicustom="1" onclick="'+spec.call+'" title="'+_esc(c.label||'')+'"><span class="uniIco">'+_esc(c.ico||'⭐')+'</span><span class="uniLbl">'+_esc(c.label||'')+'</span></button>';
      }
    });
    return html;
  }catch(e){ return ''; }
}
// توافق قديم (مش مستخدم بعد التوسعة) — بيرجّع المخصص بس
function uiCustomTopbarHTML(){
  try{
    return (CFG.layout.topbar||[]).filter(uid=> !TB_BY_UID[uid] && (CFG.hidden||[]).indexOf(uid)<0).map(uid=>{
      const c = CFG.custom[uid]; if(!c) return '';
      const spec = ACTIONS_WHITELIST[c.action]; if(!spec) return '';
      return '<button class="uniBtn" data-uicustom="1" onclick="'+spec.call+'" title="'+_esc(c.label||'')+'"><span class="uniIco">'+_esc(c.ico||'⭐')+'</span><span class="uniLbl">'+_esc(c.label||'')+'</span></button>';
    }).join('');
  }catch(e){ return ''; }
}

// ============================================================
// التحميل والحفظ (Firestore) — نفس أسلوب تصميم الفاتورة
// ============================================================
async function loadUiLayout(){
  try{
    if(typeof db==='undefined') return;
    const SETT = (typeof TEST_SETTINGS!=='undefined') ? TEST_SETTINGS : 'pos_test_settings';
    const doc = await db.collection(SETT).doc('ui_layout').get();
    CFG = doc && doc.exists ? mergeLayout(doc.data()) : defaultLayout();
  }catch(e){ console.warn('ui_layout load', e); CFG = defaultLayout(); }
}

async function uiedSave(){
  try{
    if(typeof db==='undefined') throw new Error('no db');
    const SETT = (typeof TEST_SETTINGS!=='undefined') ? TEST_SETTINGS : 'pos_test_settings';
    const cfg = JSON.parse(JSON.stringify(CFG));
    await db.collection(SETT).doc('ui_layout').set(cfg);
    _toast('اتحفظ شكل الشاشة ✅ — هيبان على كل الفروع');
  }catch(e){ _toast('حصل خطأ في الحفظ: '+e.message, 'err'); }
}

// ============================================================
// عمليات التعديل (كلها دوال نقية على CFG — سهلة الاختبار)
// ============================================================
function uiedFindPanel(uid){
  if(CFG.layout.actions.indexOf(uid)>=0) return 'actions';
  if(CFG.layout.itemops.indexOf(uid)>=0) return 'itemops';
  if(CFG.layout.topbar.indexOf(uid)>=0)  return 'topbar';
  return null;
}
function uiedMove(uid, dir){                       // dir: -1 فوق / +1 تحت داخل نفس البانل
  const p = uiedFindPanel(uid); if(!p) return;
  const arr = CFG.layout[p]; const i = arr.indexOf(uid); const j = i+dir;
  if(j<0 || j>=arr.length) return;
  arr.splice(i,1); arr.splice(j,0,uid);
  _rerender();
}
function uiedSwitchPanel(uid){                      // بدّل بين actions و itemops
  const p = uiedFindPanel(uid); if(p!=='actions' && p!=='itemops') return;
  const to = p==='actions' ? 'itemops' : 'actions';
  CFG.layout[p] = CFG.layout[p].filter(x=> x!==uid);
  CFG.layout[to].push(uid);
  _rerender();
}
function uiedToggle(uid){                           // إظهار/إخفاء
  const h = CFG.hidden; const i = h.indexOf(uid);
  if(i>=0) h.splice(i,1); else h.push(uid);
  _rerender();
}
function uiedSetSize(key, val){
  const map = { actionsW:[90,320,170], itemopsW:[70,260,110], btnFont:[9,22,13], tbIco:[16,34,24] };
  if(!map[key]) return; CFG.sizes[key] = _num(val, map[key][2], map[key][0], map[key][1]);
  _rerender();
}
function uiedAddCustom(action, ico, label, panel){
  if(!ACTIONS_WHITELIST[action]) { _toast('اختار وظيفة من القايمة', 'err'); return null; }
  panel = (panel==='itemops'||panel==='topbar') ? panel : 'actions';
  const uid = 'cust_' + Math.random().toString(36).slice(2,8);
  CFG.custom[uid] = { ico:(ico||'⭐').slice(0,4), label:(label||ACTIONS_WHITELIST[action].name).slice(0,24), action:action };
  CFG.layout[panel].push(uid);
  _rerender();
  return uid;
}
function uiedRemoveCustom(uid){
  if(!CFG.custom[uid]) return;
  delete CFG.custom[uid];
  ['actions','itemops','topbar'].forEach(p=> CFG.layout[p] = CFG.layout[p].filter(x=> x!==uid));
  CFG.hidden = CFG.hidden.filter(x=> x!==uid);
  _rerender();
}
function uiedReset(){
  if(typeof confirm==='function' && !confirm('ترجّع الشكل الافتراضي؟ (مش هيتحفظ غير لما تدوس 💾)')) return;
  CFG = defaultLayout();
  _rerender();
  _toast('رجع الشكل الافتراضي — متنساش الحفظ');
}

// إعادة رسم اللوحة + تطبيق حي على الشاشة الحقيقية
function _rerender(){ try{ applyUiLayout(); }catch(e){} try{ if(typeof injectUnifiedToolbars==='function') injectUnifiedToolbars(); }catch(e){} try{ renderEditorDrawer(); }catch(e){} }

// ============================================================
// واجهة التعديل (Drawer جنبي فوق شاشة البيع — التغيير بيبان حي على الأزرار ورا)
// ============================================================
let _drawerOpen = false;

function uiedOpen(){
  if(typeof hasPerm==='function' && !hasPerm('canChangePrices')){ _toast('التعديل ده للمدير بس', 'err'); return; }
  _drawerOpen = true; ensureDrawer(); renderEditorDrawer();
  document.getElementById('uiedDrawer').style.transform = 'translateX(0)';
}
function uiedClose(){
  _drawerOpen = false;
  const d = document.getElementById('uiedDrawer'); if(d) d.style.transform = 'translateX(105%)';
}
function uiedIsOpen(){ return !!_drawerOpen; }

function ensureDrawer(){
  if(document.getElementById('uiedDrawer')) return;
  const d = document.createElement('div');
  d.id = 'uiedDrawer';
  d.style.cssText = 'position:fixed; top:0; right:0; height:100vh; width:340px; max-width:92vw; z-index:9998;' +
    'background:#171a21; color:#eee; box-shadow:-6px 0 24px rgba(0,0,0,.4); transform:translateX(105%);' +
    'transition:transform .22s ease; overflow-y:auto; direction:rtl; font-family:Tahoma,Arial; padding:0 0 40px;';
  document.body.appendChild(d);
}

function _btnRow(uid, panel, i, n){
  const bi = BUILTIN_BY_UID[uid]; const cu = CFG.custom[uid];
  const ico = bi ? bi.ico : (cu?cu.ico:'⭐');
  const name = bi ? bi.name : (cu?cu.label:'زر');
  const isHidden = (CFG.hidden||[]).indexOf(uid)>=0;
  const canSwitch = (panel==='actions'||panel==='itemops');
  return '<div draggable="true" ondragstart="uiedDragStart(event,\''+uid+'\')" ondragover="uiedDragOver(event,\''+uid+'\')" ondrop="uiedDrop(event,\''+uid+'\')" ondragend="uiedDragEnd(event)"' +
    ' style="display:flex; align-items:center; gap:6px; padding:8px 9px; margin:6px 8px; border:1px solid #2a2f3a; border-radius:11px; background:#1e222b;'+(isHidden?'opacity:.45;':'')+'">' +
      '<div style="display:flex; flex-direction:column; align-items:center;">' +
        '<span style="cursor:grab; color:#888; font-size:13px; line-height:1;">⠿</span>' +
        '<button onclick="uiedMove(\''+uid+'\',-1)" '+(i===0?'disabled':'')+' style="border:none;background:none;color:#9aa;cursor:pointer;font-size:11px;padding:0 3px;">▲</button>' +
        '<button onclick="uiedMove(\''+uid+'\',1)" '+(i===n-1?'disabled':'')+' style="border:none;background:none;color:#9aa;cursor:pointer;font-size:11px;padding:0 3px;">▼</button>' +
      '</div>' +
      '<span style="font-size:18px; width:26px; text-align:center;">'+_esc(ico)+'</span>' +
      '<span style="flex:1; font-size:13px; font-weight:700; min-width:0;">'+_esc(name)+'</span>' +
      (canSwitch ? '<button title="نقل للبانل التاني" onclick="uiedSwitchPanel(\''+uid+'\')" style="border:1px solid #384; background:#1c2a20; color:#8f8; border-radius:8px; padding:5px 8px; cursor:pointer; font-size:12px;">⇄</button>' : '') +
      '<button title="'+(isHidden?'إظهار':'إخفاء')+'" onclick="uiedToggle(\''+uid+'\')" style="border:1px solid #444; background:'+(isHidden?'#2a2f3a':'#243')+'; color:#cfc; border-radius:8px; padding:5px 8px; cursor:pointer; font-size:12px;">'+(isHidden?'🚫':'👁')+'</button>' +
      (cu ? '<button title="حذف" onclick="uiedRemoveCustom(\''+uid+'\')" style="border:none; background:none; color:#f77; cursor:pointer; font-size:15px;">🗑️</button>' : '') +
    '</div>';
}

function _panelBlock(title, panel){
  const arr = CFG.layout[panel]||[];
  const rows = arr.map((uid,i)=> _btnRow(uid, panel, i, arr.length)).join('') || '<div style="color:#889; font-size:12px; padding:6px 12px;">— فاضي —</div>';
  return '<div style="margin:4px 0;"><div style="font-size:12px; font-weight:800; color:#9fb; padding:8px 12px 2px;">'+title+'</div>'+rows+'</div>';
}

function _sizeSlider(label, key, min, max){
  const v = (CFG.sizes||{})[key];
  return '<div style="display:flex; align-items:center; gap:8px; margin:8px 12px;">' +
    '<span style="font-size:12px; color:#aab; min-width:96px;">'+label+'</span>' +
    '<input type="range" min="'+min+'" max="'+max+'" step="1" value="'+v+'" oninput="uiedSetSize(\''+key+'\', this.value)" style="flex:1; accent-color:#818cf8;">' +
    '<b style="font-size:11px; min-width:34px; text-align:center;">'+v+'</b></div>';
}

function _addForm(){
  const opts = Object.keys(ACTIONS_WHITELIST).map(k=> '<option value="'+k+'">'+_esc(ACTIONS_WHITELIST[k].name)+'</option>').join('');
  return '<div style="margin:8px; padding:10px; border:1px dashed #3a4150; border-radius:11px; background:#1a1e26;">' +
    '<div style="font-size:12px; font-weight:800; color:#9fb; margin-bottom:7px;">➕ زر جديد</div>' +
    '<div style="display:flex; gap:6px; margin-bottom:6px;">' +
      '<input id="uiedNewIco" maxlength="4" placeholder="⭐" style="width:52px; text-align:center; padding:8px; border-radius:8px; border:1px solid #333; background:#111621; color:#eee; font-size:16px;">' +
      '<input id="uiedNewLabel" maxlength="24" placeholder="اسم الزر" style="flex:1; padding:8px; border-radius:8px; border:1px solid #333; background:#111621; color:#eee; font-size:13px;">' +
    '</div>' +
    '<select id="uiedNewAction" style="width:100%; padding:8px; border-radius:8px; border:1px solid #333; background:#111621; color:#eee; font-size:13px; margin-bottom:6px;">'+opts+'</select>' +
    '<select id="uiedNewPanel" style="width:100%; padding:8px; border-radius:8px; border:1px solid #333; background:#111621; color:#eee; font-size:13px; margin-bottom:8px;">' +
      '<option value="actions">مكانه: بانل الأزرار (الشمال)</option>' +
      '<option value="itemops">مكانه: بانل عمليات الصنف (اليمين)</option>' +
      '<option value="topbar">مكانه: الشريط العلوي (باقي الشاشات)</option>' +
    '</select>' +
    '<button onclick="uiedAddFromForm()" style="width:100%; padding:10px; border:none; border-radius:9px; background:#3b82f6; color:#fff; font-weight:800; cursor:pointer;">أضف الزر</button>' +
  '</div>';
}

function uiedAddFromForm(){
  const g = id=> document.getElementById(id);
  const uid = uiedAddCustom(g('uiedNewAction').value, g('uiedNewIco').value.trim(), g('uiedNewLabel').value.trim(), g('uiedNewPanel').value);
  if(uid) _toast('اتضاف الزر — متنساش الحفظ');
}

function renderEditorDrawer(){
  const d = document.getElementById('uiedDrawer'); if(!d) return;
  d.innerHTML =
    '<div style="position:sticky; top:0; background:#12151b; padding:12px 12px 10px; border-bottom:1px solid #2a2f3a; z-index:2;">' +
      '<div style="display:flex; align-items:center; justify-content:space-between;">' +
        '<b style="font-size:15px;">🎨 تعديل شكل الشاشة</b>' +
        '<button onclick="uiedClose()" style="border:none; background:#2a2f3a; color:#eee; border-radius:8px; padding:6px 11px; cursor:pointer; font-size:14px;">✖</button>' +
      '</div>' +
      '<div style="font-size:11px; color:#889; margin-top:5px;">اسحب أو استخدم ▲▼ للترتيب · 👁 إظهار/إخفاء · ⇄ نقل بين البانلز. التغيير بيبان حي على الشاشة ورا.</div>' +
    '</div>' +
    _panelBlock('◀ بانل الأزرار (الشمال)', 'actions') +
    _panelBlock('▶ بانل عمليات الصنف (اليمين)', 'itemops') +
    _panelBlock('⬆️ الشريط العلوي (كل الشاشات التانية)', 'topbar') +
    '<div style="margin:10px 12px 4px; font-size:12px; font-weight:800; color:#9fb;">📐 الأحجام</div>' +
    _sizeSlider('عرض بانل الشمال', 'actionsW', 90, 320) +
    _sizeSlider('عرض بانل اليمين', 'itemopsW', 70, 260) +
    _sizeSlider('حجم خط أزرار البيع', 'btnFont', 9, 22) +
    _sizeSlider('حجم أزرار الشريط العلوي', 'tbIco', 16, 34) +
    _addForm() +
    '<div style="display:flex; gap:8px; margin:14px 8px 0;">' +
      '<button onclick="uiedReset()" style="flex:1; padding:12px; border:1px solid #543; background:#241a18; color:#fca; border-radius:10px; font-weight:800; cursor:pointer;">↩️ الافتراضي</button>' +
      '<button onclick="uiedSave()" style="flex:2; padding:12px; border:none; background:#2f9e44; color:#fff; border-radius:10px; font-weight:800; cursor:pointer; font-size:15px;">💾 حفظ لكل الفروع</button>' +
    '</div>';
}

// ---- سحب وإفلات ----
let _drag = null;
function uiedDragStart(e, uid){ _drag = uid; try{ e.dataTransfer.effectAllowed='move'; }catch(_){} }
function uiedDragOver(e, uid){ e.preventDefault(); }
function uiedDrop(e, targetUid){
  e.preventDefault();
  if(!_drag || _drag===targetUid) { _drag=null; return; }
  const from = uiedFindPanel(_drag), to = uiedFindPanel(targetUid);
  if(!from || !to){ _drag=null; return; }
  CFG.layout[from] = CFG.layout[from].filter(x=> x!==_drag);
  const arr = CFG.layout[to]; const ti = arr.indexOf(targetUid);
  arr.splice(ti<0?arr.length:ti, 0, _drag);
  _drag = null; _rerender();
}
function uiedDragEnd(e){ _drag = null; }

// ============================================================
// الزر العائم + التشغيل
// ============================================================
function ensureFloatingBtn(){
  if(typeof document==='undefined') return;
  const scr = document.getElementById('saleScreen'); if(!scr) return;
  let b = document.getElementById('uiedFab');
  if(!b){
    b = document.createElement('button');
    b.id = 'uiedFab';
    b.type = 'button';
    b.innerHTML = '🎨';
    b.title = 'تعديل شكل الشاشة (للمدير)';
    b.setAttribute('onclick', 'uiedOpen()');
    b.style.cssText = 'position:fixed; bottom:16px; left:16px; z-index:9997; width:46px; height:46px; border-radius:50%;' +
      'border:none; background:#3b82f6; color:#fff; font-size:20px; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,.4); display:none;';
    document.body.appendChild(b);
  }
  const isAdmin = (typeof hasPerm==='function') && hasPerm('canChangePrices');
  const onSale = scr.classList.contains('active');
  b.style.display = (isAdmin && onSale) ? 'block' : 'none';
}

function uiEditorInit(){
  if(typeof document==='undefined') return;
  loadUiLayout().then(()=>{ try{ applyUiLayout(); }catch(e){} });
  // نطبّق ونظهر الزر على فترات (زي شريط الأدوات) عشان بعد تحميل الصلاحيات والدخول
  setTimeout(()=>{ try{ applyUiLayout(); ensureFloatingBtn(); }catch(e){} }, 1200);
  setTimeout(()=>{ try{ applyUiLayout(); ensureFloatingBtn(); }catch(e){} }, 5200);
  setInterval(()=>{ try{ ensureFloatingBtn(); }catch(e){} }, 2500);   // يظهر/يختفي مع دخول/خروج الأدمن وشاشة البيع
}

// ---- أدوات ----
function _esc(s){ return (''+ (s==null?'':s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _cssq(s){ return (''+s).replace(/"/g,'\\"'); }
function _toast(m, t){ if(typeof showToast==='function') showToast(m, t||''); }

// نخلي الدوال متاحة للـ onclick و للـ app.js و للاختبار
if(typeof window!=='undefined'){
  window.applyUiLayout = applyUiLayout;
  window.uiCustomTopbarHTML = uiCustomTopbarHTML;
  window.uiToolbarButtonsHTML = uiToolbarButtonsHTML;
  window.uiedIsOpen = uiedIsOpen;
  window.uiedOpen=uiedOpen; window.uiedClose=uiedClose;
  window.uiedMove=uiedMove; window.uiedSwitchPanel=uiedSwitchPanel; window.uiedToggle=uiedToggle;
  window.uiedSetSize=uiedSetSize; window.uiedAddFromForm=uiedAddFromForm; window.uiedRemoveCustom=uiedRemoveCustom;
  window.uiedReset=uiedReset; window.uiedSave=uiedSave;
  window.uiedDragStart=uiedDragStart; window.uiedDragOver=uiedDragOver; window.uiedDrop=uiedDrop; window.uiedDragEnd=uiedDragEnd;
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', uiEditorInit);
  else uiEditorInit();
}

// تصدير للاختبار في node (harness)
if(typeof module!=='undefined' && module.exports){
  module.exports = {
    _internals: {
      get CFG(){ return CFG; }, set CFG(v){ CFG=v; },
      defaultLayout, mergeLayout, applyUiLayout, applySizes, uiCustomTopbarHTML, uiToolbarButtonsHTML,
      uiedMove, uiedSwitchPanel, uiedToggle, uiedSetSize, uiedAddCustom, uiedRemoveCustom, uiedReset,
      uiedFindPanel, buildCustomNode, ACTIONS_WHITELIST, BUILTINS, BUILTIN_BY_UID, uiedDrop,
      _setDrag(v){ _drag=v; }
    }
  };
}

})();
