// ============================================================
// إعدادات Firebase — نفس مشروع باقي البرامج (المبيعات، التقييم)
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyCa6Qho3IKoKE_jCNHYuFX6rtaV88jekQs",
  authDomain: "customer-feedback-8ac1d.firebaseapp.com",
  projectId: "customer-feedback-8ac1d",
  storageBucket: "customer-feedback-8ac1d.firebasestorage.app",
  messagingSenderId: "408860081491",
  appId: "1:408860081491:web:c5fa8b8e757c13196375a6",
  measurementId: "G-6K33TSHDZ6"
};

// نفس الـ collection الحقيقي للموظفين في نظام الـ HR (نظام المبيعات) — قراءة فقط،
// أي موظف مسجل هناك (بالاسم + الفرع + الـ PIN) بيظهر هنا تلقائيًا من غير أي إضافة يدوية.
const EMPLOYEES_COLLECTION = "sales_employees";

// كل بيانات النسخة التجريبية معزولة في الـ collections دي، مفيش أي تعديل على بياناتك الحقيقية
const TEST_INVENTORY = "pos_test_inventory";
const TEST_SALES = "pos_test_sales";
const TEST_HELD = "pos_test_held_invoices";
const TEST_CUSTOMERS = "pos_test_customers";
const TEST_EMPLOYEE_POINTS = "pos_test_employee_points";
const TEST_ROLES = "pos_test_roles"; // صلاحيات الأدوار (كاشير/مشرف/مدير) — خاصة بالـ POS بس، منفصلة عن نظام الـ HR
const TEST_STOCK_LOG = "pos_test_stock_log"; // سجل حركة المخزون الكامل (توريد، بيع، تسويات يدوية، عكس فواتير)

const TEST_SETTINGS = "pos_test_settings"; // إعدادات عامة قابلة للتعديل من الأدمن

// برنامج الولاء بالكامل — معدل الكسب ومعدل الاستبدال مع بعض، قابلين للتعديل
// من بانل "🎁 برنامج الولاء". القيم دي افتراضية لحد ما الأدمن يغيّرها.
let loyaltyRedemptionConfig = {
  pointsPerEGP: 100,        // كل 100 جنيه مشتريات = نقطة واحدة (معدل الكسب)
  pointsPerRedemption: 10,  // كل 10 نقط
  redemptionValueEGP: 5     // = 5 جنيه خصم (معدل الاستبدال)
};
async function loadLoyaltyRedemptionConfig(){
  try{
    const doc = await db.collection(TEST_SETTINGS).doc('loyalty').get();
    if(doc.exists) loyaltyRedemptionConfig = { ...loyaltyRedemptionConfig, ...doc.data() };
  }catch(e){ console.warn('تعذر تحميل إعدادات برنامج الولاء، هتُستخدم القيم الافتراضية', e); }
}
const MIN_ITEMS_FOR_STAFF_POINT = 5; // كل فاتورة فيها 5 قطع أو أكتر = نقطة للموظف

// كل جهاز POS بيتبع فرع محدد (نفس فكرة باقي البرامج) — بيتحفظ على الجهاز نفسه
let currentBranch = localStorage.getItem('pos_branch') || '';
// فروع Glow ليها رصيد نقاط منفصل (points_glow) عن echarpe (points) — عشان ما تتلخبطش
const GLOW_BRANCHES = ['Glow'];
function pointsFieldFor(branch){ return GLOW_BRANCHES.includes(branch) ? 'points_glow' : 'points'; }
// كمية المنتج في الفرع الحالي (كل فرع مخزونه منفصل). لو المنتج لسه ماتفصلش، بيرجّع الكمية القديمة.
function branchQty(p, br){
  br = br || currentBranch;
  if(p && p.qtyByBranch) return Number(p.qtyByBranch[br]) || 0;
  return Number(p && p.quantity) || 0;   // legacy قبل فصل المخزون
}

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ============================================================
// وضع الأوفلاين القوي: البيع لازم يفضل شغال حتى لو النت اتقطع.
// enablePersistence بتخلي Firestore يحتفظ بنسخة كاملة من البيانات على الجهاز
// نفسه (IndexedDB)، وأي عملية كتابة (بيع، تسوية مخزون...) بتتسجل محليًا فورًا
// وتتحط في طابور، وبترفع تلقائي لقاعدة البيانات أول ما النت يرجع — من غير ما
// تعطّل الكاشير أو توقفه لحظة واحدة.
// cacheSizeBytes: UNLIMITED عشان كل المخزون والعملاء يفضلوا محفوظين كاملين
// على الجهاز، مش بس آخر كام حاجة اتفتحت.
db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED });
db.enablePersistence({ synchronizeTabs: true }).catch((err)=>{
  if(err.code === 'failed-precondition'){
    console.warn('فيه أكتر من تاب فاتح لنفس الموقع — الأوفلاين هيشتغل بس مش بكامل قوته');
  }else if(err.code === 'unimplemented'){
    console.warn('المتصفح ده مش بيدعم تخزين الأوفلاين');
  }
});

// ---------------- حالة الاتصال بالنت (مؤشر واضح للكاشير) ----------------
let isOnline = navigator.onLine;
function updateOnlineStatus(){
  isOnline = navigator.onLine;
  const badge = document.getElementById('onlineStatusBadge');
  if(badge){
    badge.textContent = isOnline ? '🟢 متصل' : '🔴 أوفلاين — البيع شغال والحفظ هيتزامن لما النت يرجع';
    badge.className = isOnline ? 'online-badge online' : 'online-badge offline';
  }
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

function saveBranchSetup(){
  const val = document.getElementById('branchSetupInput').value.trim();
  if(!val) return;
  currentBranch = val;
  localStorage.setItem('pos_branch', val);
  showScreen('loginScreen');
  loadEmployeePicker();
}

// أول ما الصفحة تفتح: لو مفيش فرع متسجل على الجهاز ده، اطلب تسجيله الأول قبل أي حاجة تانية.
if(currentBranch){
  document.getElementById('branchSetupScreen').classList.remove('active');
  document.getElementById('loginScreen').classList.add('active');
  loadEmployeePicker();
}

// ---------------- State ----------------
let currentEmployee = null;
let cart = []; // {id, name, barcode, price, qty}
let allInventory = [];
let editingHeldId = null; // لو بنكمل على فاتورة كانت معلّقة
let selectedPayMethods = new Set();

// ---------------- Roles & Permissions (خاصة بالـ POS بس، منفصلة عن نظام الـ HR) ----------------
// كل دور له مجموعة صلاحيات bool. القيم دي الافتراضية (Fallback) لو الأدمن لسه معملش تخصيص
// من بانل الصلاحيات — بعد أول حفظ من البانل، القيم بتتقرا من قاعدة البيانات بدل كده.
const DEFAULT_ROLE_PERMISSIONS = {
  cashier: {
    label: 'كاشير', canSell: true, canHold: true, canPrintLabel: true,
    canViewCostPrice: false, canViewStock: true, canViewLogs: false, canRefund: false, canResetCustomerPin: false,
    canEditInventory: false, canChangePrices: false, canViewReports: false, canManageRoles: false
  },
  supervisor: {
    label: 'مشرف', canSell: true, canHold: true, canPrintLabel: true,
    canViewCostPrice: false, canViewStock: true, canViewLogs: true, canRefund: true, canResetCustomerPin: true,
    canEditInventory: false, canChangePrices: false, canViewReports: false, canManageRoles: false
  },
  manager: {
    label: 'مدير', canSell: true, canHold: true, canPrintLabel: true,
    canViewCostPrice: true, canViewStock: true, canViewLogs: true, canRefund: true, canResetCustomerPin: true,
    canEditInventory: true, canChangePrices: true, canViewReports: true, canManageRoles: true
  }
};
let rolePermissions = JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS));
let currentEmployeeRole = 'cashier'; // fallback until loaded

// بيرجع صلاحيات الموظف الحالي (كائن bool)، مبني على دوره المخصص.
function myPerms(){
  return rolePermissions[currentEmployeeRole] || DEFAULT_ROLE_PERMISSIONS.cashier;
}
function hasPerm(key){
  return !!myPerms()[key];
}

// تحميل صلاحيات الأدوار (لو الأدمن خصّصها) ودور الموظف الحالي — بيتنفذ بعد كل تسجيل دخول.
async function loadCurrentEmployeeRole(){
  try{
    const rolesSnap = await db.collection(TEST_ROLES).get();
    rolesSnap.forEach(d=>{
      if(rolePermissions[d.id]) rolePermissions[d.id] = { ...rolePermissions[d.id], ...d.data() };
    });
  }catch(e){ console.warn('تعذر تحميل صلاحيات الأدوار، هتُستخدم الافتراضية', e); }

  try{
    const assignSnap = await db.collection(TEST_ROLES).doc('_assignments').get();
    const assignments = assignSnap.exists ? assignSnap.data() : {};
    // Bootstrap: if literally nobody has ever been assigned a role, open up
    // the roles panel to everyone so the first manager can be set.
    noRoleAssignmentsYet = Object.keys(assignments).length === 0;
    currentEmployeeRole = assignments[currentEmployee.id] || 'cashier';
  }catch(e){
    console.warn('تعذر تحميل دور الموظف، هيُعامل كـ"كاشير" افتراضيًا', e);
    noRoleAssignmentsYet = true;
    currentEmployeeRole = 'cashier';
  }
}

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function showToast(msg, type=""){
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show ' + type;
  setTimeout(()=> t.classList.remove('show'), 2400);
}

// ---------------- Login (PIN) ----------------
let pinBuffer = "";
let selectedLoginEmp = null; // {id, name, ...} chosen from the picker before PIN entry

async function loadEmployeePicker(){
  const grid = document.getElementById('employeePickerGrid');
  const errBox = document.getElementById('employeePickerErr');
  grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--muted); font-size:12px;">جارٍ التحميل...</div>';
  try{
    const snap = await db.collection(EMPLOYEES_COLLECTION).where('branch','==', currentBranch).get();
    const emps = snap.docs.map(d=>({id:d.id, ...d.data()})).filter(e=> e.active !== false);
    if(emps.length === 0){
      grid.innerHTML = '';
      errBox.textContent = 'لسه مفيش موظفين مسجلين للفرع ده في نظام المبيعات';
      return;
    }
    errBox.textContent = '';
    grid.innerHTML = emps.map(e=>{
      const initials = (e.name||'؟').trim().split(' ').slice(0,2).map(w=>w[0]).join('');
      return `<div class="emp-pick-tile" onclick="selectEmployeeForLogin('${e.id}', '${(e.name||'').replace(/'/g,"\\'")}')"><div class="av">${initials}</div><div class="n">${e.name}</div></div>`;
    }).join('');
  }catch(e){
    grid.innerHTML = '';
    errBox.textContent = 'تعذر تحميل الموظفين: ' + e.message;
  }
}

function selectEmployeeForLogin(empId, name){
  selectedLoginEmp = { id: empId, name };
  document.getElementById('pinPadEmpName').textContent = 'ادخل الـ PIN بتاع ' + name;
  const inp = document.getElementById('pinInput');
  inp.value = '';
  document.getElementById('loginErr').textContent = '';
  document.getElementById('employeePickerBox').style.display = 'none';
  document.getElementById('pinPadBox').style.display = 'block';
  setTimeout(()=> inp.focus(), 100);   // يركّز الخانة عشان يكتب من الكيبورد على طول
}
function backToEmployeePicker(){
  selectedLoginEmp = null;
  const inp = document.getElementById('pinInput'); if(inp) inp.value = '';
  document.getElementById('pinPadBox').style.display = 'none';
  document.getElementById('employeePickerBox').style.display = 'block';
}

// Enter في خانة الـ PIN = دخول
document.getElementById('pinInput').addEventListener('keydown', function(e){
  if(e.key === 'Enter'){ e.preventDefault(); pinSubmit(); }
});

async function pinSubmit(){
  const errBox = document.getElementById('loginErr');
  const pin = (document.getElementById('pinInput').value || '').trim();
  if(!selectedLoginEmp){ errBox.textContent = "اختار اسمك الأول"; return; }
  if(!pin){ errBox.textContent = "اكتب الـ PIN الأول"; return; }
  errBox.textContent = "جارٍ التحقق...";
  try{
    const doc = await db.collection(EMPLOYEES_COLLECTION).doc(selectedLoginEmp.id).get();
    if(!doc.exists || doc.data().pin !== pin){
      errBox.textContent = "الـ PIN غلط، حاول تاني";
      document.getElementById('pinInput').value = '';
      return;
    }
    currentEmployee = { id: doc.id, ...doc.data() };
    errBox.textContent = "";
    document.getElementById('pinInput').value = '';
    await loadCurrentEmployeeRole();
    enterDashboard();
  }catch(e){
    errBox.textContent = "خطأ في الاتصال: " + e.message;
  }
}

function logout(){
  currentEmployee = null;
  cart = [];
  backToEmployeePicker();
  showScreen('loginScreen');
}

let noRoleAssignmentsYet = false; // bootstrap flag: true if the system has never had any role assigned

function enterDashboard(){
  const roleLabel = myPerms().label || 'كاشير';
  document.getElementById('dashWho').textContent = (currentEmployee.name || currentEmployee.id) + ' — ' + roleLabel;
  refreshHeldCount();

  // Gate roles access by permission — EXCEPT during first-time bootstrap
  // (nobody has been assigned a role yet anywhere in the system), where
  // access is open to everyone so someone can set themselves as manager.
  // كل عنصر بيتفحص إنه موجود فعليًا الأول (null-safe) عشان لو جهاز شايل نسخة
  // ملف قديمة بالغلط، الكود ميكرشش خالص، بس يتجاهل العنصر الناقص ده بس.
  const canSeeRoles = hasPerm('canManageRoles') || noRoleAssignmentsYet;
  if(document.getElementById('rolesSidebarBtn')) document.getElementById('rolesSidebarBtn').style.display = canSeeRoles ? '' : 'none';
  if(document.getElementById('navRoles')) document.getElementById('navRoles').style.display = canSeeRoles ? '' : 'none';

  const canDiscounts = hasPerm('canChangePrices');
  if(document.getElementById('discountsSidebarBtn')) document.getElementById('discountsSidebarBtn').style.display = canDiscounts ? '' : 'none';
  if(document.getElementById('navDiscounts')) document.getElementById('navDiscounts').style.display = canDiscounts ? '' : 'none';

  const canImport = hasPerm('canEditInventory') || hasPerm('canChangePrices');
  if(document.getElementById('importSidebarBtn')) document.getElementById('importSidebarBtn').style.display = canImport ? '' : 'none';
  if(document.getElementById('navImport')) document.getElementById('navImport').style.display = canImport ? '' : 'none';

  const canReceiveGoods = hasPerm('canEditInventory');
  if(document.getElementById('navReceiveGoods')) document.getElementById('navReceiveGoods').style.display = canReceiveGoods ? '' : 'none';

  const canReceiptDesign = hasPerm('canChangePrices');
  if(document.getElementById('navReceiptDesign')) document.getElementById('navReceiptDesign').style.display = canReceiptDesign ? '' : 'none';

  const canLoyalty = hasPerm('canChangePrices');
  if(document.getElementById('navLoyalty')) document.getElementById('navLoyalty').style.display = canLoyalty ? '' : 'none';
  if(document.getElementById('loyaltySidebarBtn')) document.getElementById('loyaltySidebarBtn').style.display = canLoyalty ? '' : 'none';

  // بانل "الإدارة" الذهبي بيظهر بس لو فيه على الأقل حاجة واحدة جواه متاحة
  if(document.getElementById('navMgmtSection')) document.getElementById('navMgmtSection').style.display = (canSeeRoles || canDiscounts || canImport || canReceiptDesign || canLoyalty) ? '' : 'none';

  const reportsBtn = document.getElementById('reportsSidebarBtn');
  if(reportsBtn) reportsBtn.style.opacity = hasPerm('canViewReports') ? '1' : '.4';

  showScreen('dashboardScreen');
}

function goToInventory(){
  showScreen('inventoryScreen');
  renderInventoryScreen();
}
function goToReports(){
  if(!hasPerm('canViewReports')){ showToast('الصلاحية دي للمدير بس', 'err'); return; }
  showScreen('reportsScreen');
  renderReportsScreen();
}
function goToRoles(){
  if(!hasPerm('canManageRoles') && !noRoleAssignmentsYet){ showToast('الصلاحية دي للمدير بس', 'err'); return; }
  showScreen('rolesScreen');
  renderRolesScreen();
}

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
    if(it.branches && !it.branches.includes(currentBranch)) return false;   // مقصور على فرع تاني
    if(q && !((it.name||'').toLowerCase().includes(q) || (it.barcode||'').toLowerCase().includes(q))) return false;
    const isLow = (it.minStock??0) > 0 && branchQty(it) <= it.minStock;
    const isOut = it.status==='outofstock' || branchQty(it) <= 0;
    if(filter==='low') return isLow && it.status!=='hidden';
    if(filter==='out') return isOut;
    if(filter==='hidden') return it.status==='hidden';
    return true;
  });

  listWrap.innerHTML = items.map(it=>{
    const qty = branchQty(it);
    const isLow = (it.minStock??0) > 0 && qty <= it.minStock;
    const isOut = it.status==='outofstock' || qty <= 0;
    let badge, bcol, bbg;
    // من غير صلاحية عرض المخزون: نبيّن الحالة بس من غير الرقم
    if(isOut){ badge = canStock ? 'نافد' : 'نافد'; bcol='#b91c1c'; bbg='#fdecec'; }
    else if(isLow){ badge = canStock ? ('ناقص · '+qty) : 'ناقص'; bcol='#b45309'; bbg='#fff6e6'; }
    else { badge = canStock ? ('متاح · '+qty) : 'متاح'; bcol='#15803d'; bbg='#eafaf0'; }
    const border = isOut ? 'var(--minus)' : isLow ? 'var(--warn)' : 'var(--border)';
    const meta = [it.attribute, it.size].filter(Boolean).join(' · ');
    const minNote = (canStock && (it.minStock??0) > 0) ? ` <span style="opacity:.7; font-weight:600;">(حد أدنى ${it.minStock})</span>` : '';
    return `
    <div onclick="openProductDetails('${it.id}')" style="background:var(--panel); border:1px solid ${border}; border-radius:12px; padding:12px 14px; margin-bottom:9px; cursor:pointer;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <div style="min-width:0; flex:1;">
          <div style="font-weight:800; font-size:14px;">${it.name}${it.status==='hidden'?' <span style="font-size:10px; color:var(--muted);">🚫 مخفي</span>':''}</div>
          <div style="color:var(--muted); font-size:11px; margin-top:2px;">${meta?meta+' · ':''}باركود: ${it.barcode||'—'}</div>
        </div>
        <div style="text-align:left; flex-shrink:0;">
          <div style="font-weight:900; font-size:15px;">${it.price} <span style="font-size:11px; font-weight:700;">ج.م</span></div>
          ${canCost && it.cost!=null ? `<div style="color:var(--muted); font-size:10px;">تكلفة ${it.cost}</div>` : ''}
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:9px;">
        <span style="background:${bbg}; color:${bcol}; font-size:11px; font-weight:800; padding:3px 10px; border-radius:99px;">${badge}${minNote}</span>
        <div style="display:flex; gap:6px;">
          ${canEdit ? `<button onclick="event.stopPropagation(); toggleCustomerVisible('${it.id}')" title="يظهر للعميل؟" style="padding:6px 10px; border-radius:8px; border:1px solid ${it.showToCustomer?'var(--plus)':'var(--border)'}; background:${it.showToCustomer?'#eafaf0':'var(--panel2)'}; color:${it.showToCustomer?'#15803d':'var(--muted)'}; font-size:11px; font-weight:700; cursor:pointer;">${it.showToCustomer?'👁️ ظاهر':'🙈 مخفي'}</button>` : ''}
          ${canLabel ? `<button onclick="event.stopPropagation(); printPriceLabel('${it.id}')" style="padding:6px 10px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-size:11px; cursor:pointer;">🏷️</button>` : ''}
          ${canEdit ? `<button onclick="event.stopPropagation(); deleteInventoryItem('${it.id}')" style="padding:6px 10px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--minus); font-size:11px; cursor:pointer;">حذف</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('') || '<div class="empty-cart">'+(q||filter!=='all'?'مفيش أصناف بالفلتر ده':'لسه مفيش أصناف')+'</div>';
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
  let max = 0;
  (allInventory||[]).forEach(it=>{
    const b = String(it.barcode||'');
    if(/^\d+$/.test(b)){ const n = parseInt(b,10); if(n > max) max = n; }
  });
  return String(max + 1);
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

async function sendRewardConfirm(){
  const type = document.getElementById('rwType').value;
  const value = parseFloat(document.getElementById('rwValue').value) || 0;
  if(value <= 0){ showToast('اكتب قيمة الخصم', 'err'); return; }
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
  if(!phones.length){ showToast('مفيش عملاء', 'err'); return; }
  try{
    let batch = db.batch(), n = 0;
    for(const ph of phones){
      if(!ph) continue;
      batch.set(db.collection(TEST_CUSTOMERS).doc(ph), { rewards: firebase.firestore.FieldValue.arrayUnion(reward) }, { merge:true });
      n++;
      if(n % 400 === 0){ await batch.commit(); batch = db.batch(); }
    }
    await batch.commit();
    closeRewardModal();
    showToast(`اتبعتت المكافأة لـ ${phones.length} عميل 🎁`);
  }catch(e){ showToast('خطأ: ' + e.message, 'err'); }
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

async function goToCatalogEditor(){
  if(!hasPerm('canEditInventory')){ showToast('مفيش صلاحية', 'err'); return; }
  showScreen('catalogScreen');
  document.getElementById('catalogWrap').innerHTML = '<div class="empty-cart">بيتحمّل...</div>';
  try{
    const doc = await db.collection(TEST_SETTINGS).doc('catalog_' + catalogBrand()).get();
    catalogData = doc.exists ? Object.assign({ items:[], banners:[] }, doc.data()) : { items:[], banners:[] };
    if(!Array.isArray(catalogData.items)) catalogData.items = [];
    if(!Array.isArray(catalogData.banners)) catalogData.banners = [];
  }catch(e){ catalogData = { items:[], banners:[] }; }
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
        return `
        <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; overflow:hidden;">
          <div style="width:100%; height:120px; background:#eee center/cover no-repeat; background-image:url('${(it.img||'').replace(/'/g,"")}');"></div>
          <div style="padding:8px 10px;">
            <div style="font-weight:700; font-size:13px;">${it.name||''}</div>
            ${it.price?`<div style="color:var(--plus); font-weight:800; font-size:13px;">${it.price} ج.م</div>`:''}
            ${disc?`<div style="color:var(--warn); font-weight:800; font-size:11px;">🎁 ${disc}</div>`:''}
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
  const name = document.getElementById('catName').value.trim();
  if(!name){ showToast('اكتب اسم المنتج (أو اختاره من المخزون)', 'err'); return; }
  const dtype = document.getElementById('catDiscType').value;
  catalogData.items.push({
    id: 'c' + Date.now().toString(36),
    barcode: document.getElementById('catBarcode').value.trim(),
    name,
    price: document.getElementById('catPrice').value.trim(),
    img: catalogPendingImg || '',
    desc: document.getElementById('catDesc').value.trim(),
    discountType: dtype,
    discountValue: dtype === 'none' ? 0 : (parseFloat(document.getElementById('catDiscVal').value) || 0)
  });
  try{ await saveCatalogDoc(); catalogPendingImg=''; showToast('اتضاف ✅'); renderCatalogEditor(); }
  catch(e){ showToast('خطأ (يمكن الصورة كبيرة): '+e.message, 'err'); catalogData.items.pop(); }
}
async function catalogDelItem(id){
  catalogData.items = catalogData.items.filter(x=> x.id !== id);
  try{ await saveCatalogDoc(); renderCatalogEditor(); }catch(e){ showToast('خطأ: '+e.message,'err'); }
}
async function catalogAddBanner(){
  if(!catalogPendingBanner){ showToast('اختار صورة البانر الأول', 'err'); return; }
  catalogData.banners.push({ id:'b'+Date.now().toString(36), img: catalogPendingBanner });
  try{ await saveCatalogDoc(); catalogPendingBanner=''; showToast('اتضاف البانر ✅'); renderCatalogEditor(); }
  catch(e){ showToast('خطأ: '+e.message,'err'); catalogData.banners.pop(); }
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
  const c = receiptDesignConfig;
  const w = window.open('', '_blank', 'width=300,height=220');
  w.document.write(`
    <html dir="rtl"><head><meta charset="UTF-8"><style>
      body{font-family:Tahoma,Arial,sans-serif; text-align:center; padding:14px;}
      .shop{font-size:11px; color:#666; margin-bottom:4px;}
      h2{margin:4px 0; font-size:16px;} .price{font-size:26px; font-weight:900; margin:6px 0;}
    </style></head><body>
      ${c.labelShopName ? `<div class="shop">${c.shopName}</div>` : ''}
      <h2>${it.name}</h2>
      <div class="price">${it.price} ج.م</div>
      ${c.showBarcodeOnLabel && it.barcode ? '<svg id="lblBarcode"></svg>' : ''}
      <script src="https://cdnjs.cloudflare.com/ajax/libs/JsBarcode/3.11.5/JsBarcode.all.min.js"><\/script>
      <script>
        try{ if(document.getElementById('lblBarcode')) JsBarcode('#lblBarcode', '${it.barcode}', {format:'CODE128', width:1.6, height:38, fontSize:11}); }catch(e){}
        window.print(); setTimeout(()=>window.close(), 400);
      <\/script>
    </body></html>`);
  w.document.close();
}

// ---------------- Roles / permissions screen (manager only) ----------------
const PERM_LABELS = {
  canSell:'يبيع', canHold:'يعمل Hold/Unhold', canPrintLabel:'يطبع Price Label',
  canViewCostPrice:'يشوف سعر التكلفة', canViewStock:'يشوف المخزون (الكميات)', canViewLogs:'يشوف السجلات', canRefund:'يعمل استرجاع',
  canResetCustomerPin:'يمسح الرقم السري للعميل', canEditInventory:'يعدّل/يضيف مخزون', canChangePrices:'يغيّر الأسعار',
  canViewReports:'يشوف التقارير المالية', canManageRoles:'يدير الصلاحيات'
};
async function renderRolesScreen(){
  const wrap = document.getElementById('rolePermsWrap');
  wrap.innerHTML = Object.keys(DEFAULT_ROLE_PERMISSIONS).map(roleKey=>{
    const perms = rolePermissions[roleKey];
    const toggles = Object.keys(PERM_LABELS).map(permKey=>`
      <label style="display:flex; align-items:center; gap:6px; font-size:12px; padding:4px 0;">
        <input type="checkbox" data-role="${roleKey}" data-perm="${permKey}" ${perms[permKey]?'checked':''} onchange="toggleRolePerm(this)">
        ${PERM_LABELS[permKey]}
      </label>`).join('');
    return `
    <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:12px; margin-bottom:10px;">
      <div style="font-weight:800; margin-bottom:6px;">${perms.label}</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:2px;">${toggles}</div>
    </div>`;
  }).join('');

  const empWrap = document.getElementById('employeeRolesWrap');
  const empSnap = await db.collection(EMPLOYEES_COLLECTION).where('branch','==', currentBranch).get();
  const assignSnap = await db.collection(TEST_ROLES).doc('_assignments').get();
  const assignments = assignSnap.exists ? assignSnap.data() : {};
  empWrap.innerHTML = empSnap.docs.map(d=>{
    const emp = { id:d.id, ...d.data() };
    const role = assignments[emp.id] || 'cashier';
    const options = Object.keys(DEFAULT_ROLE_PERMISSIONS).map(rk=>
      `<option value="${rk}" ${rk===role?'selected':''}>${DEFAULT_ROLE_PERMISSIONS[rk].label}</option>`).join('');
    return `
    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:10px 12px; margin-bottom:6px;">
      <div style="font-weight:700; font-size:13px;">${emp.name}</div>
      <select data-emp="${emp.id}" onchange="setEmployeeRole(this)" style="padding:6px 10px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">${options}</select>
    </div>`;
  }).join('') || '<div class="empty-cart">لسه مفيش موظفين في الفرع ده</div>';
}
async function toggleRolePerm(checkbox){
  const role = checkbox.dataset.role;
  const perm = checkbox.dataset.perm;
  rolePermissions[role][perm] = checkbox.checked;
  await db.collection(TEST_ROLES).doc(role).set(rolePermissions[role], { merge:true });
  showToast('اتحفظ ✅');
}
async function setEmployeeRole(sel){
  const empId = sel.dataset.emp;
  const role = sel.value;
  await db.collection(TEST_ROLES).doc('_assignments').set({ [empId]: role }, { merge:true });
  showToast('اتحفظ ✅');
}

// ---------------- Reports (manager only) ----------------
let currentReportRange = 'today';
let currentReportType = 'receipt';   // receipt | items | payments

function setReportRange(range){
  currentReportRange = range;
  document.querySelectorAll('.rep-range-btn').forEach(b=> b.classList.toggle('active', b.dataset.range === range));
  renderReportsScreen();
}
function setReportType(t){
  currentReportType = t;
  document.querySelectorAll('.rep-type-btn').forEach(b=> b.classList.toggle('active', b.dataset.rtype === t));
  renderReportsScreen();
}

function getReportDateBounds(){
  const now = new Date();
  let from = null, to = null;
  if(currentReportRange === 'today'){
    from = new Date(); from.setHours(0,0,0,0);
    to = new Date(); to.setHours(23,59,59,999);
  }else if(currentReportRange === 'yesterday'){
    from = new Date(); from.setDate(from.getDate()-1); from.setHours(0,0,0,0);
    to = new Date(); to.setDate(to.getDate()-1); to.setHours(23,59,59,999);
  }else if(currentReportRange === 'week'){
    from = new Date(); from.setDate(from.getDate()-6); from.setHours(0,0,0,0);
    to = new Date(); to.setHours(23,59,59,999);
  }else if(currentReportRange === 'month'){
    from = new Date(); from.setDate(from.getDate()-29); from.setHours(0,0,0,0);
    to = new Date(); to.setHours(23,59,59,999);
  }else if(currentReportRange === 'custom'){
    const fromVal = document.getElementById('repFrom').value;
    const toVal = document.getElementById('repTo').value;
    if(fromVal) { from = new Date(fromVal + 'T00:00:00'); }
    if(toVal) { to = new Date(toVal + 'T23:59:59'); }
  }
  return { from, to };
}
function reportRangeLabel(){
  const map = {today:'النهاردة', yesterday:'امبارح', week:'آخر 7 أيام', month:'آخر 30 يوم', all:'كل الفترة', custom:'فترة مخصصة'};
  return map[currentReportRange] || '';
}

async function renderReportsScreen(){
  const wrap = document.getElementById('reportsWrap');
  wrap.innerHTML = '<div style="padding:30px; text-align:center; color:var(--muted);">بيتحمّل...</div>';
  document.querySelectorAll('.rep-range-btn').forEach(b=> b.classList.toggle('active', b.dataset.range === currentReportRange));
  document.querySelectorAll('.rep-type-btn').forEach(b=> b.classList.toggle('active', b.dataset.rtype === currentReportType));

  let sales = [];
  try{
    const snap = await db.collection(TEST_SALES).where('branch','==', currentBranch).get();
    sales = snap.docs.map(d=>d.data()).filter(s=> !s.reversed);
  }catch(e){ console.warn(e); }

  const { from, to } = getReportDateBounds();
  if(from || to){
    sales = sales.filter(s=>{
      const t = s.createdAt && s.createdAt.toMillis ? s.createdAt.toMillis() : null;
      if(!t) return false;
      if(from && t < from.getTime()) return false;
      if(to && t > to.getTime()) return false;
      return true;
    });
  }

  // إجماليات عامة
  let salesTotal=0, returnsTotal=0, itemsSold=0;
  const byMethod = {}, methodCount = {};
  const itemAgg = {};
  sales.forEach(s=>{
    const tot = s.total||0;
    if(tot >= 0) salesTotal += tot; else returnsTotal += tot;
    Object.entries(s.payments||{}).forEach(([m,amt])=>{ byMethod[m]=(byMethod[m]||0)+amt; methodCount[m]=(methodCount[m]||0)+1; });
    (s.items||[]).forEach(it=>{
      const qty = it.qty||0, line = (it.price||0)*qty;
      if(!it.isReturn && (it.price||0) >= 0) itemsSold += qty;
      if(!itemAgg[it.name]) itemAgg[it.name] = { qty:0, revenue:0 };
      itemAgg[it.name].qty += qty;
      itemAgg[it.name].revenue += line;
    });
  });
  const netTotal = salesTotal + returnsTotal;
  const invoiceCount = sales.filter(s=> !s.isReversal && (s.total||0) >= 0).length;
  const methodLabels = {cash:'💵 كاش', visa:'💳 فيزا', instapay:'📱 انستاباي'};

  let html = '';

  if(currentReportType === 'receipt'){
    // 🧾 إيصال اليوم — ملخص على شكل إيصال
    const methodLines = Object.keys(byMethod).length
      ? Object.keys(byMethod).map(m=>`<div class="rc-line"><span>${methodLabels[m]||m}</span><span>${byMethod[m].toFixed(2)}</span></div>`).join('')
      : '<div class="rc-line"><span>لا يوجد</span><span>0.00</span></div>';
    html = `<div id="repPrintArea"><div class="rep-receipt">
      <div class="rc-h">إيصال المبيعات</div>
      <div class="rc-sub">${currentBranch||''} · ${reportRangeLabel()}</div>
      <div class="rc-line"><span>إجمالي المبيعات</span><span>${salesTotal.toFixed(2)}</span></div>
      <div class="rc-line"><span>المرتجعات</span><span>${returnsTotal.toFixed(2)}</span></div>
      <div class="rc-sep"></div>
      <div class="rc-line rc-big"><span>صافي المبيعات</span><span>${netTotal.toFixed(2)} ج.م</span></div>
      <div class="rc-sep"></div>
      ${methodLines}
      <div class="rc-sep"></div>
      <div class="rc-line"><span>عدد الفواتير</span><span>${invoiceCount}</span></div>
      <div class="rc-line"><span>عدد القطع المباعة</span><span>${itemsSold}</span></div>
      <div class="rc-line"><span>متوسط الفاتورة</span><span>${(invoiceCount? netTotal/invoiceCount : 0).toFixed(2)}</span></div>
    </div></div>
    <div style="text-align:center; margin-top:14px;"><button class="rep-print-btn" onclick="printReportArea()">🖨️ طباعة الإيصال</button></div>`;
  }

  else if(currentReportType === 'items'){
    // 📦 ملخص الأصناف — كل الأصناف المباعة بالكمية والإجمالي
    const rows = Object.entries(itemAgg).sort((a,b)=> b[1].revenue - a[1].revenue);
    const totQty = rows.reduce((s,[,d])=> s + d.qty, 0);
    const totRev = rows.reduce((s,[,d])=> s + d.revenue, 0);
    html = `<div id="repPrintArea"><div class="rep-card">
      <h2 style="margin:0 0 4px; font-size:16px;">📦 ملخص الأصناف — ${reportRangeLabel()}</h2>
      <div style="color:var(--muted); font-size:12px; margin-bottom:10px;">${currentBranch||''}</div>
      <table class="rep-tbl"><thead><tr><th>الصنف</th><th class="num">الكمية</th><th class="num">الإجمالي</th></tr></thead><tbody>
      ${rows.length ? rows.map(([name,d])=>`<tr><td>${name}</td><td class="num">${d.qty}</td><td class="num">${d.revenue.toFixed(2)}</td></tr>`).join('')
                    : '<tr><td colspan="3" style="text-align:center; color:var(--muted); padding:16px;">لا يوجد مبيعات في الفترة دي</td></tr>'}
      </tbody><tfoot><tr class="grand"><td>الإجمالي</td><td class="num">${totQty}</td><td class="num">${totRev.toFixed(2)} ج.م</td></tr></tfoot></table>
    </div></div>
    <div style="text-align:center; margin-top:6px;"><button class="rep-print-btn" onclick="printReportArea()">🖨️ طباعة</button></div>`;
  }

  else if(currentReportType === 'payments'){
    // 💳 ملخص المدفوعات
    const entries = Object.keys(byMethod);
    const grand = entries.reduce((s,m)=> s + byMethod[m], 0);
    html = `<div id="repPrintArea"><div class="rep-card">
      <h2 style="margin:0 0 4px; font-size:16px;">💳 ملخص المدفوعات — ${reportRangeLabel()}</h2>
      <div style="color:var(--muted); font-size:12px; margin-bottom:10px;">${currentBranch||''}</div>
      <table class="rep-tbl"><thead><tr><th>طريقة الدفع</th><th class="num">عدد الفواتير</th><th class="num">الإجمالي</th><th class="num">النسبة</th></tr></thead><tbody>
      ${entries.length ? entries.map(m=>`<tr><td>${methodLabels[m]||m}</td><td class="num">${methodCount[m]||0}</td><td class="num">${byMethod[m].toFixed(2)}</td><td class="num">${grand? Math.round(byMethod[m]/grand*100):0}%</td></tr>`).join('')
                       : '<tr><td colspan="4" style="text-align:center; color:var(--muted); padding:16px;">لا يوجد</td></tr>'}
      </tbody><tfoot><tr class="grand"><td>الإجمالي</td><td class="num">${invoiceCount}</td><td class="num">${grand.toFixed(2)} ج.م</td><td class="num">100%</td></tr></tfoot></table>
    </div></div>
    <div style="text-align:center; margin-top:6px;"><button class="rep-print-btn" onclick="printReportArea()">🖨️ طباعة</button></div>`;
  }

  wrap.innerHTML = html;
}

// طباعة التقرير المعروض (نافذة طباعة مستقلة)
function printReportArea(){
  const area = document.getElementById('repPrintArea');
  if(!area) return;
  const w = window.open('', '', 'width=420,height=640');
  if(!w) { showToast('اسمح بالنوافذ المنبثقة عشان الطباعة تشتغل', 'err'); return; }
  w.document.write('<html dir="rtl"><head><meta charset="utf-8"><title>تقرير</title>'+
    '<style>body{font-family:sans-serif;padding:14px;color:#111;}table{width:100%;border-collapse:collapse;}'+
    'th,td{padding:6px 8px;border-bottom:1px solid #ccc;font-size:13px;text-align:right;}'+
    'th{border-bottom:2px solid #000;}.num{text-align:left;}tr.grand td{font-weight:900;border-top:2px solid #000;}'+
    'h2{text-align:center;font-size:16px;margin:6px 0;}.rep-receipt{max-width:340px;margin:auto;font-family:monospace;}'+
    '.rc-h{text-align:center;font-weight:900;font-size:16px;}.rc-sub{text-align:center;font-size:12px;color:#555;margin-bottom:10px;}'+
    '.rc-line{display:flex;justify-content:space-between;padding:3px 0;}.rc-sep{border-top:1px dashed #888;margin:7px 0;}.rc-big{font-weight:900;}'+
    '</style></head><body>'+area.innerHTML+'</body></html>');
  w.document.close(); w.focus();
  setTimeout(function(){ w.print(); }, 250);
}

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
  pendingRedemption = null;
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

// ---------------- Sales History ----------------
let salesHistoryTab = 'live';
function switchSalesHistoryTab(tab){
  salesHistoryTab = tab;
  document.getElementById('shTabLive').classList.toggle('active', tab==='live');
  document.getElementById('shTabLegacy').classList.toggle('active', tab==='legacy');
  if(tab === 'live') renderLiveSalesHistory();
  else renderLegacySalesHistory();
}

async function goToSalesHistory(){
  showScreen('salesHistoryScreen');
  switchSalesHistoryTab('live');
}

const RATING_ICON_MAP = {1:'😠', 2:'🙁', 3:'🙂', 4:'😍'};
async function renderLiveSalesHistory(){
  const wrap = document.getElementById('salesHistoryWrap');
  wrap.innerHTML = 'بيتحمّل...';
  const snap = await db.collection(TEST_SALES).where('branch','==', currentBranch).get();
  const sales = snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>{
    const at = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
    const bt = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
    return bt - at;
  });
  if(sales.length === 0){ wrap.innerHTML = '<div class="empty-cart">لسه مفيش مبيعات مسجلة</div>'; return; }

  // نجيب كل التقييمات المرتبطة بعملاء مرة واحدة، وبعدين نربط كل فاتورة بأقرب تقييم لنفس رقم العميل
  let entriesByPhone = {};
  try{
    const entriesSnap = await db.collection('entries').where('branch','==', currentBranch).get();
    entriesSnap.docs.forEach(d=>{
      const e = d.data();
      if(!e.customerPhone) return;
      if(!entriesByPhone[e.customerPhone]) entriesByPhone[e.customerPhone] = [];
      entriesByPhone[e.customerPhone].push(e);
    });
  }catch(e){ console.warn('تعذر تحميل التقييمات', e); }

  wrap.innerHTML = sales.slice(0,100).map(s=>{
    const d = s.createdAt && s.createdAt.toDate ? s.createdAt.toDate() : null;
    const dateStr = d ? d.toLocaleString('ar-EG') : '—';
    const badge = s.reversed ? ' <span style="color:var(--minus); font-size:11px;">(ملغاة)</span>' : (s.isReversal ? ' <span style="color:var(--warn); font-size:11px;">(عكس)</span>' : '');

    let ratingBadge = '';
    if(s.customerPhone && entriesByPhone[s.customerPhone] && d){
      const saleMs = d.getTime();
      const closest = entriesByPhone[s.customerPhone].sort((a,b)=> Math.abs(a.ts-saleMs) - Math.abs(b.ts-saleMs))[0];
      // نربط التقييم بالفاتورة دي بس لو قريب زمنيًا منها فعلًا (مش تقييم من زيارة تانية قديمة)
      if(closest && Math.abs(closest.ts - saleMs) <= (3*60*1000)){
        ratingBadge = ` <span title="تقييم العميل">${RATING_ICON_MAP[closest.r]||''}</span>`;
      }
    }

    return `
    <div onclick="openInvoice('${s.id}')" style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
      <div>
        <div style="font-weight:700; font-size:13px;">🧾 ${s.invoiceNo || s.id.slice(-6).toUpperCase()}${badge} — ${(s.items||[]).length} صنف — ${s.customerPhone ? 'عميل: '+s.customerPhone : 'من غير عميل'}${ratingBadge}</div>
        <div style="color:var(--muted); font-size:11px;">${dateStr} — بواسطة ${s.employeeName||'—'}</div>
      </div>
      <div style="font-weight:800; font-size:15px; color:${(s.total||0) < 0 ? 'var(--minus)' : 'var(--plus)'};">${(s.total||0).toFixed(2)} ج.م</div>
    </div>`;
  }).join('');
}

// المبيعات المستوردة من QuickBooks — للرجوع والاطلاع بس، مش بتدخل في التقارير الحية
async function renderLegacySalesHistory(){
  const wrap = document.getElementById('salesHistoryWrap');
  wrap.innerHTML = 'بيتحمّل...';
  try{
    const legacy = typeof viewLegacySales === 'function' ? await viewLegacySales() : [];
    if(legacy.length === 0){ wrap.innerHTML = '<div class="empty-cart">لسه مفيش مبيعات مستوردة — استخدم "📥 استيراد بيانات" من الرئيسية</div>'; return; }
    wrap.innerHTML = `<div style="color:var(--muted); font-size:11px; margin-bottom:8px;">📌 دي بيانات تاريخية للرجوع بس، مش هتظهر في التقارير أو إحصائيات المنتجات.</div>` +
      legacy.slice(0,200).map(s=>`
      <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight:700; font-size:13px;">${s.invoiceNo ? '🧾 '+s.invoiceNo+' — ' : ''}${s.itemName || 'بيعة قديمة'}${s.qty ? ' × '+s.qty : ''}</div>
          <div style="color:var(--muted); font-size:11px;">${s.date || '—'}${s.customerName ? ' — '+s.customerName : ''}</div>
        </div>
        <div style="font-weight:800; font-size:14px; color:var(--muted);">${(s.total||0).toFixed(2)} ج.م</div>
      </div>`).join('');
  }catch(e){ wrap.innerHTML = '<div class="empty-cart">تعذر التحميل: ' + e.message + '</div>'; }
}

// ---------------- Customer List ----------------
let custListData = [];
let custListFiltered = [];
async function goToCustomerList(){
  showScreen('customerListScreen');
  const wrap = document.getElementById('customerListWrap');
  wrap.innerHTML = '<div style="padding:30px; text-align:center; color:var(--muted);">بيتحمّل...</div>';
  const searchEl = document.getElementById('custSearch'); if(searchEl) searchEl.value='';
  try{
    const [custSnap, sales] = await Promise.all([
      db.collection(TEST_CUSTOMERS).where('branch','==', currentBranch).get(),
      getBranchSales()
    ]);
    // تجميع إنفاق/زيارات/آخر زيارة لكل عميل من الفواتير
    const agg = {};
    sales.forEach(s=>{
      if(!s.customerPhone || s.reversed) return;
      const p = s.customerPhone;
      if(!agg[p]) agg[p] = { spend:0, count:0, lastTs:0 };
      agg[p].spend += (s.total||0);
      if(!s.isReversal) agg[p].count += 1;
      const t = saleTime(s); if(t > agg[p].lastTs) agg[p].lastTs = t;
    });
    custListData = custSnap.docs.map(d=>{
      const c = { id:d.id, ...d.data() };
      const a = agg[c.phone] || { spend:0, count:0, lastTs:0 };
      c._spend = a.spend; c._count = a.count; c._lastTs = a.lastTs;
      return c;
    });
    renderCustList();
  }catch(e){ wrap.innerHTML = '<div class="empty-cart">تعذر التحميل: '+e.message+'</div>'; }
}

function renderCustList(){
  const wrap = document.getElementById('customerListWrap');
  if(!wrap) return;
  const q = (document.getElementById('custSearch')?.value || '').trim().toLowerCase();
  const sort = document.getElementById('custSort')?.value || 'spend';

  // إحصائيات عامة (على كل العملاء مش المفلترين)
  const totalCustomers = custListData.length;
  const totalPoints = custListData.reduce((s,c)=> s + (c[pointsFieldFor(currentBranch)]||0), 0);
  const totalSpend = custListData.reduce((s,c)=> s + (c._spend||0), 0);
  const sumEl = document.getElementById('custSummary');
  if(sumEl){
    const chip = (lbl,val,col)=>`<div style="flex:1; min-width:100px; background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:10px 12px; text-align:center;"><div style="color:var(--muted); font-size:10px;">${lbl}</div><div style="font-weight:900; font-size:16px; color:${col||'var(--text)'};">${val}</div></div>`;
    sumEl.innerHTML = chip('عملاء مسجّلين', totalCustomers) + chip('إجمالي إنفاقهم', totalSpend.toFixed(0)+' ج.م','var(--plus)') + chip('إجمالي النقاط', totalPoints,'var(--warn)');
  }

  let list = custListData.filter(c=> !q || (c.name||'').toLowerCase().includes(q) || (c.phone||'').includes(q));
  if(sort==='spend') list.sort((a,b)=> (b._spend||0)-(a._spend||0));
  else if(sort==='recent') list.sort((a,b)=> (b._lastTs||0)-(a._lastTs||0));
  else if(sort==='points') list.sort((a,b)=> (b[pointsFieldFor(currentBranch)]||0)-(a[pointsFieldFor(currentBranch)]||0));
  else if(sort==='name') list.sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''),'ar'));

  if(list.length === 0){ wrap.innerHTML = '<div class="empty-cart">'+(q?'مفيش عميل بالبحث ده':'لسه مفيش عملاء مسجلين')+'</div>'; return; }
  custListFiltered = list;   // للمكافأة الجماعية

  const bulkBtn = hasPerm('canEditInventory') ? `<button onclick="sendRewardToAllListed()" style="width:100%; margin-bottom:10px; padding:11px; border-radius:10px; border:none; background:var(--warn); color:#3a2600; font-weight:800; cursor:pointer;">🎁 ابعت مكافأة لكل دول (${list.length} عميل)</button>` : '';

  wrap.innerHTML = bulkBtn + list.map(c=>{
    const last = c._lastTs ? new Date(c._lastTs).toLocaleDateString('ar-EG', {day:'2-digit', month:'short', year:'numeric'}) : '—';
    const hasCode = c.loyaltyCode ? `<span style="background:#eef; color:#5340c8; font-size:10px; font-weight:800; padding:2px 7px; border-radius:99px;">💳 ${c.loyaltyCode}</span>` : '';
    const hasPin = c.loyaltyPin ? '<span style="font-size:10px; color:var(--muted);">🔒 مؤمّن</span>' : '';
    return `
    <div onclick="openCustomerProfile('${c.phone}')" style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:12px 14px; margin-bottom:9px; cursor:pointer;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <div style="min-width:0;">
          <div style="font-weight:800; font-size:14px;">${c.name || 'بدون اسم'}</div>
          <div style="color:var(--muted); font-size:11px; direction:ltr; text-align:right;">${c.phone}</div>
          <div style="margin-top:5px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">${hasCode} ${hasPin}</div>
        </div>
        <div style="text-align:left; flex-shrink:0;">
          <div style="font-weight:900; font-size:15px; color:var(--plus);">${(c._spend||0).toFixed(0)} <span style="font-size:11px; font-weight:700;">ج.م</span></div>
          <div style="color:var(--warn); font-size:11px; font-weight:700;">${c[pointsFieldFor(currentBranch)]||0} نقطة</div>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; margin-top:8px; padding-top:8px; border-top:1px solid var(--border); font-size:11px; color:var(--muted);">
        <span>🧾 ${c._count||0} فاتورة</span>
        <span>🕐 آخر زيارة: ${last}</span>
      </div>
    </div>`;
  }).join('');
}

// ---------------- End of Day (إغلاق اليوم / تقفيل الدرج) ----------------
let dcData = {};   // بيانات النهاردة من السيستم (للحساب والحفظ)

async function goToEndOfDay(){
  showScreen('endOfDayScreen');
  const wrap = document.getElementById('endOfDayWrap');
  wrap.innerHTML = '<div style="padding:34px; text-align:center; color:var(--muted);">بيتحمّل بيانات النهاردة...</div>';

  const dayStart = new Date(); dayStart.setHours(0,0,0,0);
  const dayMs = dayStart.getTime();

  // مبيعات النهاردة (نفس الفرع)
  let sales = [];
  try{
    const snap = await db.collection(TEST_SALES).where('branch','==', currentBranch).get();
    sales = snap.docs.map(d=>d.data()).filter(s=> s.createdAt && s.createdAt.toMillis && s.createdAt.toMillis() >= dayMs);
  }catch(e){ console.warn('sales', e); }

  const systemTotal = sales.reduce((s,x)=> s + (x.total||0), 0);
  let cashSales=0, visaSales=0, instaSales=0;
  sales.forEach(s=>{ const p=s.payments||{}; cashSales+=(p.cash||0); visaSales+=(p.visa||0); instaSales+=(p.instapay||0); });

  // سلف النهاردة من برنامج المبيعات (sales_advances)
  let advancesTotal = 0;
  try{
    const advSnap = await db.collection('sales_advances').where('branch','==', currentBranch).get();
    advSnap.forEach(d=>{ const a=d.data(); const t = a.ts || (a.date ? Date.parse(a.date) : 0); if(t >= dayMs) advancesTotal += (+a.amount||0); });
  }catch(e){ console.warn('advances', e); }

  dcData = { systemTotal, cashSales, visaSales, instaSales, advancesTotal, invoiceCount: sales.length };
  const lastFloat = parseFloat(localStorage.getItem('dc_float_'+currentBranch)) || '';

  const denoms = [200,100,50,20,10,5];
  const denomRows = denoms.map(d=>`
    <div class="dc-den-row">
      <div class="dc-den-face">${d} ج.م</div>
      <span class="dc-x">×</span>
      <input type="number" min="0" id="dc_den_${d}" placeholder="0" inputmode="numeric" oninput="dcRecalc()" class="dc-inp dc-inp-count">
      <span class="dc-x">=</span>
      <div id="dc_line_${d}" class="dc-line">0</div>
    </div>`).join('');

  const isMgr = hasPerm('canViewReports');   // المدير بس يشوف إجماليات السيستم والنتيجة
  wrap.innerHTML = `
    ${isMgr ? `<div class="dc-summary">
      <div><div class="dc-sm-lbl">مبيعات النهاردة (السيستم)</div><div class="dc-sm-val">${systemTotal.toFixed(2)} <span>ج.م</span></div></div>
      <div class="dc-sm-sub">${dcData.invoiceCount} فاتورة · كاش ${cashSales.toFixed(0)} · فيزا ${visaSales.toFixed(0)} · انستا ${instaSales.toFixed(0)}</div>
    </div>` : `<div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:12px 14px; margin-bottom:14px; color:var(--muted); font-size:12.5px; text-align:center;">اعدّ الدرج واملأ البيانات، وفي الآخر دوس تأكيد — النتيجة بتتسجّل للمدير.</div>`}

    <div class="dc-card">
      <div class="dc-card-h">💵 عدّ الكاش في الدرج</div>
      ${denomRows}
      <div class="dc-total-row"><span>إجمالي الكاش المعدود</span><span id="dc_counted">0.00 ج.م</span></div>
    </div>

    <div class="dc-card">
      <div class="dc-card-h">🧾 خصومات من الدرج</div>
      ${dcField('العهدة (فكّة أول اليوم)', 'dc_float', lastFloat, 'بتتخصم — مش إيراد')}
      ${dcField('مصروفات اليوم (طلعت كاش)', 'dc_expenses', '', 'اللي اتصرف من الدرج')}
      ${dcField('سلف اليوم', 'dc_advances', advancesTotal || '', 'اللي اتاخد سلف من الدرج')}
    </div>

    <div class="dc-card">
      <div class="dc-card-h">💳 الفيزا والانستاباي</div>
      ${dcField('فيزا (من الماكينة)', 'dc_visa', '', 'اكتب اللي على ماكينة الفيزا')}
      ${dcField('انستاباي', 'dc_insta', '', 'اكتب إجمالي الانستاباي')}
    </div>

    <button class="dc-ok" onclick="dcFinish()">✔️ ${isMgr ? 'احسب النتيجة (أوفر / عجز)' : 'تأكيد وتسليم الدرج'}</button>
    <div id="dc_result"></div>
  `;
  dcRecalc();
}

// خانة إدخال قابلة للتعديل
function dcField(label, id, val, hint){
  return `<div class="dc-field">
    <div><div class="dc-field-lbl">${label}</div>${hint?`<div class="dc-field-hint">${hint}</div>`:''}</div>
    <input type="number" min="0" id="${id}" value="${val===''||val==null?'':(+val).toFixed(0)}" placeholder="0" inputmode="numeric" oninput="dcClearResult()" class="dc-inp">
  </div>`;
}
function dcNum(id){ const el=document.getElementById(id); return el ? (parseFloat(el.value)||0) : 0; }
function dcClearResult(){ const r=document.getElementById('dc_result'); if(r) r.innerHTML=''; }

// حساب حي لإجمالي الكاش المعدود
function dcRecalc(){
  const denoms = [200,100,50,20,10,5];
  let counted = 0;
  denoms.forEach(d=>{
    const c = dcNum('dc_den_'+d);
    const line = c * d;
    counted += line;
    const el = document.getElementById('dc_line_'+d); if(el) el.textContent = line.toLocaleString('en-US');
  });
  const ct = document.getElementById('dc_counted'); if(ct) ct.textContent = counted.toFixed(2) + ' ج.م';
  dcClearResult();
  return counted;
}

// لما يدوس OK: يحسب الأوفر/العجز ويحفظ سجل التقفيل
function dcFinish(){
  const denoms = [200,100,50,20,10,5];
  let counted = 0; denoms.forEach(d=> counted += dcNum('dc_den_'+d) * d);
  const flt = dcNum('dc_float'), exp = dcNum('dc_expenses'), adv = dcNum('dc_advances');
  const visa = dcNum('dc_visa'), insta = dcNum('dc_insta');

  // المفروض يتجمّع فعليًا = (كاش معدود − عهدة) + مصروفات + سلف + فيزا + انستا
  const accounted = (counted - flt) + exp + adv + visa + insta;
  const overShort = +(accounted - dcData.systemTotal).toFixed(2);

  const isShort = overShort < -0.01, isOver = overShort > 0.01;
  const state = isShort ? {c:'var(--minus)', t:'⚠️ عجز', bg:'#fdecec'} : isOver ? {c:'var(--warn)', t:'🔺 أوفر (زيادة)', bg:'#fff6e6'} : {c:'var(--plus)', t:'✅ مظبوط بالظبط', bg:'#eafaf0'};

  if(hasPerm('canViewReports')){
    // المدير يشوف النتيجة كاملة
    document.getElementById('dc_result').innerHTML = `
      <div class="dc-result" style="background:${state.bg}; border-color:${state.c};">
        <div class="dc-res-head" style="color:${state.c};">${state.t}</div>
        <div class="dc-res-big" style="color:${state.c};">${Math.abs(overShort).toFixed(2)} ج.م</div>
        <div class="dc-res-break">
          <div><span>كاش معدود</span><b>${counted.toFixed(2)}</b></div>
          <div><span>− عهدة</span><b>${flt.toFixed(2)}</b></div>
          <div><span>+ مصروفات</span><b>${exp.toFixed(2)}</b></div>
          <div><span>+ سلف</span><b>${adv.toFixed(2)}</b></div>
          <div><span>+ فيزا</span><b>${visa.toFixed(2)}</b></div>
          <div><span>+ انستاباي</span><b>${insta.toFixed(2)}</b></div>
          <div class="dc-res-sep"><span>= إجمالي محسوب</span><b>${accounted.toFixed(2)}</b></div>
          <div><span>مبيعات السيستم</span><b>${dcData.systemTotal.toFixed(2)}</b></div>
        </div>
      </div>`;
  }else{
    // الكاشير: تأكيد بس من غير أي إجماليات (عدّ أعمى)
    document.getElementById('dc_result').innerHTML = `
      <div class="dc-result" style="background:#eafaf0; border-color:var(--plus);">
        <div class="dc-res-head" style="color:var(--plus);">✅ اتسجّل التقفيل</div>
        <div style="color:#555; font-size:13px; margin-top:6px;">سلّم الدرج والمبلغ للمدير. المدير هو اللي يشوف الفرق.</div>
      </div>`;
  }

  // نفتكر آخر عهدة على الجهاز ده
  try{ localStorage.setItem('dc_float_'+currentBranch, String(flt)); }catch(e){}

  // نحفظ سجل التقفيل (جوه pos_test_settings عشان القواعد الحالية تسمح بيه)
  const rec = {
    type:'dayclose', branch: currentBranch, date: todayISO(),
    countedCash: counted, float: flt, expenses: exp, advances: adv, visa, instapay: insta,
    systemTotal: dcData.systemTotal, cashSales: dcData.cashSales, visaSales: dcData.visaSales, instaSales: dcData.instaSales,
    accounted, overShort, invoiceCount: dcData.invoiceCount,
    closedBy: (typeof currentEmployee!=='undefined' && currentEmployee) ? (currentEmployee.name||'') : '',
    ts: Date.now()
  };
  db.collection(TEST_SETTINGS).doc('dayclose_'+currentBranch+'_'+todayISO()).set(rec, {merge:true})
    .then(()=> showToast('اتقفل اليوم واتسجل ✅'))
    .catch(e=> console.warn('dayclose save', e));
}

// ---------------- Search / suggestions ----------------
const searchBar = document.getElementById('searchBar');
searchBar.addEventListener('input', ()=>{
  const q = searchBar.value.trim().toLowerCase();
  const box = document.getElementById('suggestBox');
  box.innerHTML = '';
  if(!q){ return; }
  // المنتجات المخفية أو المعلّمة "نافدة" مش بتظهر في البحث خالص
  const matches = allInventory.filter(it =>
    it.status !== 'hidden' && it.status !== 'outofstock' &&
    ((it.name||'').toLowerCase().includes(q) || (it.barcode||'').toLowerCase().includes(q))
  ).slice(0,10);
  matches.forEach(it=>{
    const row = document.createElement('div');
    row.className = 'sugg-row';
    const stockNote = branchQty(it) <= 0 ? ' <span style="color:var(--minus); font-size:11px;">(نافد)</span>' : '';
    row.innerHTML = `<span>${it.name}${stockNote} <span style="color:#aaa; font-size:11px; direction:ltr;">${it.barcode||''}</span></span><span style="color:var(--muted)">${it.price} جنيه</span>`;
    row.onclick = ()=>{ addToCart(it); searchBar.value=''; box.innerHTML=''; };
    box.appendChild(row);
  });
});
searchBar.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    const code = searchBar.value.trim();
    if(!code) return;
    const match = allInventory.find(it => it.barcode === code && it.status !== 'hidden' && it.status !== 'outofstock');
    if(match){
      addToCart(match);
      searchBar.value = '';
      document.getElementById('suggestBox').innerHTML = '';
    }else if(/^ECH/i.test(code) || /^GLW/i.test(code)){
      // كود عضوية عميل (echarpe ECH أو Glow GLW) → نربط العميل بالفاتورة
      resolveLoyaltyScan(code.toUpperCase()).then(found=>{
        if(found){ searchBar.value=''; document.getElementById('suggestBox').innerHTML=''; }
        else showToast('كود العضوية مش موجود', 'err');
      });
    }else if(/^FT/i.test(code)){
      // كود فاتورة → نفتحها للمرتجع
      openInvoiceForReturn(code.toUpperCase());
      searchBar.value=''; document.getElementById('suggestBox').innerHTML='';
    }else{
      showToast('لا يوجد صنف بهذا الكود', 'err');
    }
  }
});

function addToCart(item){
  // البيع مسموح دايمًا حتى لو المخزون مايكفيش (الكمية تنزل بالسالب)
  const existing = cart.find(c => c.id === item.id && !c.isReturn);
  if(existing){ existing.qty += 1; }
  else{
    // تطبيق أفضل خصم ساري تلقائيًا (لو فيه) — بقاعدة "الأفضل للعميل بس، مش تجميع"
    let finalPrice = item.price;
    let discountName = null;
    let originalPrice = null;
    if(typeof bestDiscountFor === 'function'){
      const best = bestDiscountFor(item);
      if(best){
        originalPrice = item.price;
        finalPrice = +(item.price - best.saving).toFixed(2);
        discountName = best.discount.name;
        showToast(`🏷️ اتطبق خصم "${discountName}" — وفّر ${best.saving.toFixed(2)} ج.م`, 'ok');
      }
    }
    cart.push({id:item.id, name:item.name, barcode:item.barcode, price:finalPrice, originalPrice, discountName, qty:1, attribute:item.attribute||'', size:item.size||''});
  }
  renderCart();
}

let selectedCartIdx = null;

// عروض الكتالوج اللي العميل فعّلها من التطبيق (بتتطبّق تلقائي على المنتج المطابق في السلة)
let custActivatedOffers = {};
function applyCustomerOffers(){
  if(!custActivatedOffers || !cart.length) return;
  cart.forEach(line=>{
    if(line.isReturn || line.isRedemption || line.offerApplied || !line.barcode) return;
    const off = custActivatedOffers[line.barcode];
    if(!off) return;
    const orig = line.price;
    let np = off.type==='percent' ? orig*(1-Number(off.value)/100) : orig-Number(off.value);
    np = Math.max(0, Math.round(np*100)/100);
    line.origPrice = orig; line.price = np; line.offerApplied = true;
    showToast('🎁 اتطبّق عرض العميل على ' + (line.name||'المنتج'));
  });
}

function renderCart(){
  applyCustomerOffers();
  const tbody = document.getElementById('cartTbody');
  if(selectedCartIdx !== null && selectedCartIdx >= cart.length) selectedCartIdx = null;
  if(cart.length === 0){
    selectedCartIdx = null;
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cart">لسه مفيش أصناف في الفاتورة</td></tr>';
  }else{
    tbody.innerHTML = cart.map((c, idx)=>`
      <tr class="${idx===selectedCartIdx?'sel ':''}${c.isReturn?'ret':''}" onclick="selectCartRow(${idx})" style="${c.offerApplied?'background:linear-gradient(90deg,#ffeef5,#fff); box-shadow:inset 4px 0 0 #e27a97;':''}">
        <td>${idx+1}</td>
        <td class="item-name">${c.offerApplied?'🎁 ':''}${c.name}${c.isReturn?' ↩️ (مرتجع)':''}${c.offerApplied?' <span style="color:#c0397a; font-size:10px; font-weight:800;">🎁 عرض مفعّل</span>':''}${c.discountName?` <span style="color:#1c7a2e; font-size:10px;">🏷️ ${c.discountName}</span>`:''}${c.barcode?`<div class="cart-code">${c.barcode}</div>`:''}</td>
        <td>${c.offerApplied && c.origPrice!=null ? `<s style="color:#c0397a; font-size:10px;">${c.origPrice.toFixed(2)}</s> ` : (c.originalPrice ? `<s style="color:#999; font-size:10px;">${c.originalPrice.toFixed(2)}</s> ` : '')}${c.price.toFixed(2)}</td>
        <td>
          <div class="qty-cell">
            <button onclick="event.stopPropagation(); cartQty(${idx},-1)">−</button>
            <input type="number" class="qn-input" value="${c.qty}" min="1" onclick="event.stopPropagation()" onchange="cartSetQty(${idx}, this.value)">
            <button onclick="event.stopPropagation(); cartQty(${idx},1)">+</button>
          </div>
        </td>
        <td>${(c.price*c.qty).toFixed(2)}</td>
        <td><button class="cart-del" onclick="event.stopPropagation(); cartRemove(${idx})" title="مسح">🗑️</button></td>
      </tr>`).join('');
  }
  const total = cart.reduce((s,c)=> s + c.price*c.qty, 0);
  document.getElementById('cartTotal').textContent = total.toFixed(2);
  const _pieces = cart.filter(c=>!c.isRedemption).reduce((s,c)=> s + (c.isReturn?-c.qty:c.qty), 0);
  const _icEl = document.getElementById('cartItemCount'); if(_icEl) _icEl.textContent = _pieces;
  refreshCustomerActionUI();
  updatePaySummary();
  renderHoldButtons();
}

// يرجّع أي منتج اتطبّق عليه عرض العميل لسعره وشكله الأصلي (لما نشيل/نغيّر العميل)
function revertCustomerOffers(){
  cart.forEach(line=>{
    if(line.offerApplied){
      if(line.origPrice != null) line.price = line.origPrice;
      line.offerApplied = false;
      delete line.origPrice;
    }
  });
}

// ============ هولد سريع بمكانين (محلي، من غير خروج من الشاشة) ============
let holdSlots = [null, null];

function captureSaleState(){
  return {
    items: cart,
    customerPhone: (document.getElementById('customerPhone')?.value || '').trim(),
    customerName: (document.getElementById('customerName')?.value || '').trim(),
    total: cart.reduce((s,c)=> s + c.price*c.qty, 0)
  };
}
function clearSaleState(){
  cart = [];
  selectedCartIdx = null;
  if(typeof pendingRedemption !== 'undefined') pendingRedemption = null;
  const ph = document.getElementById('customerPhone'); if(ph) ph.value = '';
  const cn = document.getElementById('customerName'); if(cn) cn.value = '';
  const ci = document.getElementById('customerInfo'); if(ci) ci.textContent = '';
  if(typeof setCustBox === 'function') setCustBox(false);
  if(typeof resetPaymentUI === 'function') resetPaymentUI();
}
function restoreSaleState(s){
  cart = s.items || [];
  selectedCartIdx = null;
  const ph = document.getElementById('customerPhone'); if(ph) ph.value = s.customerPhone || '';
  const cn = document.getElementById('customerName'); if(cn) cn.value = s.customerName || '';
  if(s.customerPhone && typeof refreshCustomerInfo === 'function'){ refreshCustomerInfo(); }
  else { const ci = document.getElementById('customerInfo'); if(ci) ci.textContent=''; if(typeof setCustBox==='function') setCustBox(false); }
  if(typeof resetPaymentUI === 'function') resetPaymentUI();
}

function toggleHold(i){
  const slot = holdSlots[i];
  const slotHas = slot && slot.items && slot.items.length;
  const cartHas = cart.length > 0;

  if(cartHas && slotHas){
    const cur = captureSaleState();          // تبديل
    restoreSaleState(slot);
    holdSlots[i] = cur;
    showToast('بدّلت الفاتورة الحالية بهولد ' + (i+1));
  } else if(cartHas && !slotHas){
    holdSlots[i] = captureSaleState();        // حفظ + تفضية
    clearSaleState();
    showToast('اتحفظت في هولد ' + (i+1) + ' — ابدأ فاتورة جديدة ✔');
  } else if(!cartHas && slotHas){
    restoreSaleState(slot);                   // استرجاع
    holdSlots[i] = null;
    showToast('رجّعت فاتورة هولد ' + (i+1));
  } else {
    showToast('السلة فاضية وهولد ' + (i+1) + ' فاضي', 'err');
    return;
  }
  renderCart();
  focusSearchBar && focusSearchBar();
}

function renderHoldButtons(){
  [0,1].forEach(i=>{
    const btn = document.getElementById('holdBtn'+i);
    if(!btn) return;
    const slot = holdSlots[i];
    if(slot && slot.items && slot.items.length){
      btn.innerHTML = '📌 هولد ' + (i+1) + '<br><b>' + slot.total.toFixed(0) + ' ج.م</b>';
      btn.classList.add('filled');
    }else{
      btn.innerHTML = 'هولد ' + (i+1) + '<br><span style="opacity:.7;">فاضي</span>';
      btn.classList.remove('filled');
    }
  });
}

// كتابة الكمية بأي رقم مباشرة
function cartSetQty(idx, val){
  const c = cart[idx]; if(!c) return;
  let nq = parseInt(val);
  if(isNaN(nq) || nq < 1){ if(nq === 0){ cartRemove(idx); return; } nq = 1; }
  c.qty = nq;   // مسموح بأي كمية حتى لو أكبر من المخزون
  renderCart();
}

// + / − للكمية في سطر السلة
function cartQty(idx, delta){
  const c = cart[idx]; if(!c) return;
  let nq = (c.qty||1) + delta;
  if(nq < 1){ cartRemove(idx); return; }
  c.qty = nq;   // مسموح بأي كمية حتى لو أكبر من المخزون
  renderCart();
}
// مسح صنف من السلة
function cartRemove(idx){
  if(idx < 0 || idx >= cart.length) return;
  cart.splice(idx, 1);
  if(selectedCartIdx === idx) selectedCartIdx = null;
  else if(selectedCartIdx !== null && selectedCartIdx > idx) selectedCartIdx--;
  renderCart();
}

function selectCartRow(idx){
  selectedCartIdx = (selectedCartIdx === idx) ? null : idx;
  renderCart();
}
function requireSelection(){
  if(selectedCartIdx === null){ showToast('اختار صنف من الجدول الأول (دوس على السطر)', 'err'); return false; }
  return true;
}
function qbxQty(delta){
  if(!requireSelection()) return;
  changeQty(selectedCartIdx, delta);
}
function qbxReturnSel(){
  if(!requireSelection()) return;
  returnCartItem(selectedCartIdx);
}

// ============ مرتجع بمسح باركود الفاتورة ============
let returnInvoiceData = null;
const RETURN_WINDOW_DAYS = 14;

async function openInvoiceForReturn(code){
  showScreen('saleScreen');   // نتأكد إننا في شاشة البيع عشان المرتجع يتحط في السلة
  document.getElementById('returnInvoiceModal').classList.add('active');
  document.getElementById('returnInvoiceBody').innerHTML = '<div class="empty-cart">بندوّر على الفاتورة...</div>';
  try{
    const snap = await db.collection(TEST_SALES).where('invoiceCode','==', code).limit(1).get();
    if(snap.empty){
      document.getElementById('returnInvoiceBody').innerHTML = '<div class="empty-cart">مفيش فاتورة بالكود ده 🤔<br><span style="font-size:11px;">'+code+'</span></div>';
      return;
    }
    const doc = snap.docs[0];
    const s = doc.data();
    returnInvoiceData = { id: doc.id, ...s };

    const saleMs = s.createdAt && s.createdAt.toMillis ? s.createdAt.toMillis() : (s.createdAt && s.createdAt.seconds ? s.createdAt.seconds*1000 : 0);
    const dateStr = saleMs ? new Date(saleMs).toLocaleString('ar-EG', {day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit'}) : '—';
    const daysAgo = saleMs ? Math.floor((Date.now() - saleMs) / 86400000) : 0;
    const withinWindow = daysAgo <= RETURN_WINDOW_DAYS;
    const windowBadge = withinWindow
      ? `<span style="background:#eafaf0; color:#15803d; font-weight:800; font-size:12px; padding:3px 10px; border-radius:99px;">✅ خلال الـ${RETURN_WINDOW_DAYS} يوم (فاضل ${RETURN_WINDOW_DAYS - daysAgo} يوم)</span>`
      : `<span style="background:#fdecec; color:#b91c1c; font-weight:800; font-size:12px; padding:3px 10px; border-radius:99px;">⚠️ عدّى ${daysAgo} يوم — أكتر من ${RETURN_WINDOW_DAYS} يوم</span>`;

    const alreadyReversed = s.reversed ? '<div style="background:#fdecec; color:#b91c1c; padding:8px 10px; border-radius:8px; font-size:12px; margin-bottom:8px;">⚠️ الفاتورة دي اترجعت بالكامل قبل كده.</div>' : '';

    const itemsHtml = (s.items||[]).filter(it=> !it.isRedemption).map((it, i)=>{
      const isRet = it.isReturn || (it.price||0) < 0;
      return `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--border);">
        <div style="min-width:0;">
          <div style="font-weight:700; font-size:13px;">${it.name}${isRet?' <span style="color:var(--warn); font-size:10px;">(مرتجع أصلاً)</span>':''}</div>
          <div style="color:var(--muted); font-size:11px;">${it.qty} × ${Math.abs(it.price||0).toFixed(2)} ج.م${it.barcode?' · كود '+it.barcode:''}</div>
        </div>
        ${(!isRet) ? `<button onclick="returnItemFromInvoice(${i})" style="flex-shrink:0; padding:8px 12px; border-radius:8px; border:none; background:var(--minus); color:#fff; font-weight:800; font-size:12px; cursor:pointer;">↩️ ارجع ده</button>` : '<span style="color:var(--muted); font-size:11px;">—</span>'}
      </div>`;
    }).join('');

    document.getElementById('returnInvoiceBody').innerHTML = `
      <div style="background:var(--panel2); border-radius:10px; padding:12px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div style="font-weight:800; font-size:14px;">🧾 فاتورة #${s.invoiceNo||''}</div>
          <div style="font-weight:900; color:var(--plus);">${(s.total||0).toFixed(2)} ج.م</div>
        </div>
        <div style="color:var(--muted); font-size:12px; margin-bottom:8px;">📅 ${dateStr} · من ${daysAgo} يوم</div>
        ${windowBadge}
      </div>
      ${alreadyReversed}
      <div style="font-weight:800; font-size:13px; margin-bottom:4px;">اختار الصنف اللي عايز ترجعه:</div>
      ${itemsHtml || '<div class="empty-cart">مفيش أصناف</div>'}
      <div style="color:var(--muted); font-size:11px; margin-top:8px;">هيتحط في الفاتورة الحالية كمرتجع (بالأحمر) — كمّل واختار طريقة رجوع الفلوس.</div>`;
  }catch(e){
    document.getElementById('returnInvoiceBody').innerHTML = '<div class="empty-cart">تعذّر التحميل: '+e.message+'</div>';
  }
}

// يضيف صنف من الفاتورة الممسوحة كمرتجع (بالسالب) في السلة الحالية
function returnItemFromInvoice(itemIdx){
  if(!returnInvoiceData) return;
  const it = (returnInvoiceData.items||[])[itemIdx];
  if(!it){ return; }
  cart.push({
    id: it.id || '__ret__'+itemIdx,
    name: it.name,
    barcode: it.barcode || '',
    price: -Math.abs(it.price||0),
    qty: it.qty || 1,
    isReturn: true,
    fromInvoice: returnInvoiceData.invoiceNo || ''
  });
  renderCart();
  showToast('اتحط "'+it.name+'" كمرتجع بالأحمر ↩️');
}

function closeReturnInvoiceModal(){
  document.getElementById('returnInvoiceModal').classList.remove('active');
}
function qbxDeleteSel(){
  if(!requireSelection()) return;
  removeFromCart(selectedCartIdx);
  selectedCartIdx = null;
  renderCart();
}

// تحويل الفاتورة كلها لمرتجع بتأكيد واحد بس — بدل ما تدوس مرتجع على كل صنف لوحده
function qbxReturnWholeInvoice(){
  if(cart.length === 0){ showToast('الفاتورة فاضية', 'err'); return; }
  if(!confirm(`متأكد إنك عايز تحوّل كل الفاتورة (${cart.length} صنف) لمرتجع كامل؟`)) return;
  cart.forEach(line=>{
    line.price = -Math.abs(line.price);
    line.isReturn = true;
  });
  selectedCartIdx = null;
  renderCart();
  showToast('اتحولت الفاتورة كلها لمرتجع 🔄 — اختار طريقة الدفع لإعطاء الباقي للعميل');
}

// إرجاع صنف داخل نفس الفاتورة الحالية (مثلاً عملية تبديل) — بيضيف سطر بالسالب
// بلون أحمر يقلل من إجمالي الفاتورة، أو يرجع الفرق للعميل لو الإجمالي بقى بالسالب.
function returnCartItem(idx){
  const item = cart[idx];
  if(item.isReturn){
    // دوس تاني على نفس الصنف يرجّعه لبيع عادي (تراجع)
    item.price = Math.abs(item.price);
    item.isReturn = false;
    renderCart();
    showToast('رجع بيع عادي ✅');
    return;
  }
  if(!confirm(`تحويل "${item.name}" (${item.qty} قطعة) لمرتجع بالكامل؟`)) return;
  item.price = -Math.abs(item.price);
  item.isReturn = true;
  renderCart();
  showToast('اتحول لمرتجع بالأحمر ✅ — قلل من إجمالي الفاتورة');
}
function changeQty(idx, delta){
  const line = cart[idx];
  line.qty += delta;   // مسموح بأي كمية حتى لو أكبر من المخزون
  if(line.qty <= 0){ cart.splice(idx,1); selectedCartIdx = null; }
  renderCart();
}
function removeFromCart(idx){
  if(cart[idx] && cart[idx].isRedemption) pendingRedemption = null;
  cart.splice(idx,1);
  renderCart();
}

function cartTotal(){ return cart.reduce((s,c)=> s + c.price*c.qty, 0); }

// ---------------- Customer lookup (loyalty - test) ----------------
// لو الرقم متسجلش، بيوري صف "إضافة عميل جديد" عشان الكاشير يكتب الاسم ويسجله على طول.
const RATING_PREVIEW_MAP = {1:'😠 مضايقني جدًا', 2:'🙁 مش عاجبني', 3:'🙂 كويس', 4:'😍 عجبني جدًا'};
async function refreshCustomerInfo(){
  const phone = document.getElementById('customerPhone').value.trim();
  const infoBox = document.getElementById('customerInfo');
  const newRow = document.getElementById('newCustomerRow');
  if(!phone){ infoBox.textContent=''; newRow.style.display='none'; setCustBox(false); custActivatedOffers={}; revertCustomerOffers(); custReward=null; custPendingRedeem=null; custBaseText=''; renderCart(); return; }
  try{
    const doc = await db.collection(TEST_CUSTOMERS).doc(phone).get();
    let ratingLine = '';
    try{
      // 1) لو العميل ده عنده تقييمات مرتبطة فعليًا من زيارات سابقة (دقيقة 100%)
      const linkedSnap = await db.collection('entries').where('customerPhone','==', phone).get();
      const linked = linkedSnap.docs.map(d=>d.data()).sort((a,b)=> b.ts-a.ts);
      if(linked.length){
        ratingLine = ` | آخر تقييمه: ${RATING_PREVIEW_MAP[linked[0].r]||'—'}`;
      }else{
        // 2) مفيش تقييم متربط بيه قبل كده — نديله تخمين تقريبي (تقييم قريب في نفس الفرع في آخر دقيقتين)
        const twoMinAgo = Date.now() - (2*60*1000);
        const branchSnap = await db.collection('entries').where('branch','==', currentBranch).get();
        const recent = branchSnap.docs.map(d=>d.data()).filter(e=> e.ts >= twoMinAgo).sort((a,b)=> b.ts-a.ts);
        if(recent.length) ratingLine = ` | تقييم قريب (تخمين مش مؤكد): ${RATING_PREVIEW_MAP[recent[0].r]||'—'}`;
      }
    }catch(e){}

    if(doc.exists){
      const d = doc.data();
      document.getElementById('customerName').value = d.name || '';
      custActivatedOffers = d.activatedOffers || {};   // عروض العميل المفعّلة
      revertCustomerOffers(); applyCustomerOffers(); renderCart();
      const _brand = pointsFieldFor(currentBranch)==='points_glow' ? 'glow' : 'echarpe';
      const _now = Date.now();
      custPendingRedeem = (d.pendingRedeem && d.pendingRedeem.brand === _brand && d.pendingRedeem.points > 0) ? d.pendingRedeem : null;
      custReward = (d.rewards||[]).find(r=> r && !r.used && r.brand===_brand && (!r.expiry || r.expiry>_now)) || null;
      custBaseText = `عميل حالي (${d.name||'—'}) - رصيد النقاط: ${d[pointsFieldFor(currentBranch)] || 0} نقطة${ratingLine}`;
      refreshCustomerActionUI();
      newRow.style.display = 'none';
      setCustBox(true);   // 🟢 عميل متسجّل ومختار → المربع ينوّر أخضر
      const rp = document.getElementById('resetPinRow');
      if(rp) rp.style.display = (d.loyaltyPin && hasPerm('canResetCustomerPin')) ? 'block' : 'none';   // بيان لو العميل حاطط رقم + الموظف عنده صلاحية
    }else{
      infoBox.textContent = ratingLine ? ratingLine.replace(' | ','') : '';
      newRow.style.display = 'flex';
      setCustBox(false);
      const rp = document.getElementById('resetPinRow'); if(rp) rp.style.display = 'none';
    }
  }catch(e){ infoBox.textContent=''; setCustBox(false); }
}
// تلوين مربع العميل: أخضر لو فيه عميل مختار، مطفي لو لأ
function setCustBox(on){ const b = document.getElementById('custBox'); if(b) b.classList.toggle('on', !!on); }
document.getElementById('customerPhone').addEventListener('blur', refreshCustomerInfo);
// دوس Enter في خانة رقم العميل يظهر العميل على طول (من غير ما تحتاج تدوس في مكان تاني)
document.getElementById('customerPhone').addEventListener('keydown', function(e){
  if(e.key === 'Enter'){ e.preventDefault(); refreshCustomerInfo(); }
});

// الكاشير بيمسح الرقم السري للعميل (لو نسيه) — العميل هيحدد واحد جديد أول ما يفتح التطبيق
async function resetLoyaltyPin(){
  const phone = document.getElementById('customerPhone').value.trim();
  if(!phone){ showToast('اكتب رقم العميل الأول', 'err'); return; }
  if(!confirm('متأكد إنك عايز تمسح الرقم السري للعميل ده؟ هيحدد واحد جديد أول ما يفتح التطبيق.')) return;
  try{
    await db.collection(TEST_CUSTOMERS).doc(phone).set({ loyaltyPin: null }, { merge:true });
    const rp = document.getElementById('resetPinRow'); if(rp) rp.style.display = 'none';
    showToast('اتمسح الرقم السري ✅ العميل هيحدد واحد جديد');
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}

// يدوّر على عميل بكود العضوية (اللي بيتمسح من بطاقة تطبيق الولاء ECH...)
async function resolveLoyaltyScan(code){
  try{
    const field = /^GLW/i.test(code) ? 'loyaltyCode_glow' : 'loyaltyCode';
    let snap = await db.collection(TEST_CUSTOMERS).where(field, '==', code).limit(1).get();
    if(snap.empty){
      // احتياطي: نجرّب الخانة التانية لو مالقيناش
      const other = field === 'loyaltyCode' ? 'loyaltyCode_glow' : 'loyaltyCode';
      snap = await db.collection(TEST_CUSTOMERS).where(other, '==', code).limit(1).get();
    }
    if(snap.empty) return false;
    const docSnap = snap.docs[0];
    const c = docSnap.data();
    const phone = c.phone || docSnap.id;
    document.getElementById('customerPhone').value = phone;
    await refreshCustomerInfo();
    showToast('اترّبط العميل: ' + (c.name || phone) + ' 💳');
    return true;
  }catch(e){ console.warn('resolveLoyaltyScan', e); return false; }
}
async function registerNewCustomer(){
  const phone = document.getElementById('customerPhone').value.trim();
  const name = document.getElementById('customerName').value.trim();
  if(!phone){ showToast('اكتب رقم التليفون الأول', 'err'); return; }
  if(!name){ showToast('اكتب اسم العميل', 'err'); return; }
  try{
    await db.collection(TEST_CUSTOMERS).doc(phone).set({ name, phone, points:0, branch: currentBranch, createdAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge:true });
    document.getElementById('customerInfo').textContent = `اتسجل عميل جديد: ${name}`;
    document.getElementById('newCustomerRow').style.display = 'none';
    showToast('اتسجل العميل ✅');
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}

// ---------------- Sidebar actions (Give Discount / Accept Return / Cashier / Ship) ----------------
function openGiveDiscount(){
  if(cart.length === 0){ showToast('الفاتورة فاضية', 'err'); return; }
  const pct = prompt('نسبة الخصم % على إجمالي الفاتورة:', '0');
  if(pct === null) return;
  const p = parseFloat(pct);
  if(isNaN(p) || p < 0 || p > 100){ showToast('نسبة غير صحيحة', 'err'); return; }
  cart.forEach(c=> c.price = c.price * (1 - p/100));
  renderCart();
  showToast(`اتحط خصم ${p}% ✅`);
}
function focusAddCustomer(){
  document.getElementById('customerPhone').focus();
}
function showCashierInfo(){
  showToast('مسجّل دخول: ' + (currentEmployee.name||'') + ' — ' + (myPerms().label||''));
}

// ---------------- استبدال نقاط الولاء بخصم ----------------
let pendingRedemption = null; // {points, value} — بيتثبّت فعليًا (خصم النقط) بس لما الفاتورة تتحفظ

async function openRedeemPoints(){
  const phone = document.getElementById('customerPhone').value.trim();
  if(!phone){ showToast('لازم تكتب رقم تليفون العميل الأول', 'err'); return; }
  if(cart.length === 0){ showToast('الفاتورة فاضية', 'err'); return; }
  if(pendingRedemption){ showToast('في استبدال نقط مطبّق بالفعل على الفاتورة دي', 'err'); return; }

  try{
    const doc = await db.collection(TEST_CUSTOMERS).doc(phone).get();
    const balance = doc.exists ? (doc.data()[pointsFieldFor(currentBranch)] || 0) : 0;
    const rate = loyaltyRedemptionConfig;
    if(balance < rate.pointsPerRedemption){
      showToast(`رصيد العميل ${balance} نقطة بس — محتاج ${rate.pointsPerRedemption} نقطة على الأقل للاستبدال`, 'err');
      return;
    }
    const maxRedemptions = Math.floor(balance / rate.pointsPerRedemption);
    const input = prompt(`رصيد العميل: ${balance} نقطة\nكل ${rate.pointsPerRedemption} نقطة = ${rate.redemptionValueEGP} ج.م خصم\nكام "وحدة استبدال" عايز تستخدم؟ (الحد الأقصى: ${maxRedemptions})`, '1');
    if(input === null) return;
    const units = parseInt(input);
    if(isNaN(units) || units <= 0 || units > maxRedemptions){ showToast('عدد غير صحيح', 'err'); return; }

    const pointsUsed = units * rate.pointsPerRedemption;
    const discountValue = units * rate.redemptionValueEGP;
    // بيتضاف كسطر خصم منفصل في الفاتورة (مش مربوط بمنتج معين)، بالسالب، عشان يقلل الإجمالي فورًا
    cart.push({
      id: '__loyalty_redemption__', name: `🎁 استبدال ${pointsUsed} نقطة ولاء`,
      price: -discountValue, qty: 1, isReturn: false, isRedemption: true
    });
    pendingRedemption = { phone, points: pointsUsed, value: discountValue };
    renderCart();
    showToast(`اتخصم ${discountValue.toFixed(2)} ج.م مقابل ${pointsUsed} نقطة ✅`);
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}

// مكافأة خاصة العميل — تطبيق عند الدفع
let custReward = null, appliedReward = null;
let custPendingRedeem = null, custBaseText = '';

// بيحدّث صندوق العميل (المكافأة/الاستبدال) حسب إجمالي الفاتورة الحالي — بيتنادى مع كل تغيّر في السلة
function refreshCustomerActionUI(){
  const infoBox = document.getElementById('customerInfo');
  if(!infoBox) return;
  if(!custBaseText){ return; }   // مفيش عميل متحمّل
  const cartTot = cart.reduce((s,c)=> s + c.price*c.qty, 0);
  let html = custBaseText;
  if(custPendingRedeem && !pendingRedemption){
    html += `<div style="margin-top:8px; background:#fff6e6; border:1.5px solid var(--warn); border-radius:10px; padding:10px 12px;">
       <div style="font-weight:800; color:#b45309;">🎁 العميل طلب استبدال ${custPendingRedeem.points} نقطة (خصم ${custPendingRedeem.valueEGP} ج.م)</div>
       <button onclick="applyPendingRedeem(${custPendingRedeem.points}, ${custPendingRedeem.valueEGP})" style="margin-top:8px; padding:8px 14px; border-radius:8px; border:none; background:var(--plus); color:#062; font-weight:800; cursor:pointer;">✔️ طبّق الاستبدال</button>
     </div>`;
  }
  if(custReward && !cart.some(l=> l.isRewardDiscount)){
    const okMin = cartTot >= (custReward.minInvoice||0);
    const rTxt = custReward.type==='percent' ? `${custReward.value}% خصم` : `${custReward.value} ج.م خصم`;
    const cond = custReward.minInvoice ? ` (لفاتورة ${custReward.minInvoice} ج.م أو أكتر)` : '';
    html += `<div style="margin-top:8px; background:#fdeef5; border:1.5px solid var(--warn); border-radius:10px; padding:10px 12px;">
       <div style="font-weight:800; color:#b45309;">🎁 مكافأة خاصة: ${rTxt}${cond}</div>
       ${okMin
         ? `<button onclick="applyCustomerReward()" style="margin-top:8px; padding:8px 14px; border-radius:8px; border:none; background:var(--plus); color:#062; font-weight:800; cursor:pointer;">✔️ طبّق المكافأة</button>`
         : `<div style="font-size:11px; color:var(--muted); margin-top:4px;">لسه محتاج فاتورة ${custReward.minInvoice} ج.م — الحالي ${cartTot.toFixed(0)}</div>`}
     </div>`;
  }
  infoBox.innerHTML = html;
}

function applyCustomerReward(){
  if(!custReward) return;
  const cartTot = cart.reduce((s,c)=> s + c.price*c.qty, 0);
  if(cartTot < (custReward.minInvoice||0)){ showToast('الفاتورة لسه أقل من الحد المطلوب', 'err'); return; }
  if(cart.some(l=> l.isRewardDiscount)){ showToast('المكافأة مطبّقة بالفعل', 'err'); return; }
  let disc = custReward.type==='percent' ? cartTot*(Number(custReward.value)/100) : Number(custReward.value);
  disc = Math.min(disc, cartTot); disc = Math.round(disc*100)/100;
  cart.push({ id:'__reward__', name:`🎁 مكافأة خاصة (${custReward.type==='percent'?custReward.value+'%':custReward.value+' ج.م'})`, price:-disc, qty:1, isRewardDiscount:true });
  appliedReward = custReward;
  renderCart(); refreshCustomerInfo();
  showToast(`اتطبّقت المكافأة — خصم ${disc} ج.م 🎁`);
}

// بيطبّق طلب الاستبدال اللي العميل عمله من التطبيق (بيظهر أول ما نكتب رقمه)
function applyPendingRedeem(points, value){
  if(pendingRedemption){ showToast('في استبدال مطبّق بالفعل على الفاتورة', 'err'); return; }
  const phone = document.getElementById('customerPhone').value.trim();
  cart.push({
    id: '__loyalty_redemption__', name: `🎁 استبدال ${points} نقطة ولاء`,
    price: -Math.abs(value), qty: 1, isReturn: false, isRedemption: true
  });
  pendingRedemption = { phone, points, value: Math.abs(value) };
  renderCart();
  refreshCustomerInfo();   // نحدّث العرض (يخفي الطلب بعد ما اتطبّق)
  showToast(`اتطبّق خصم ${value} ج.م مقابل ${points} نقطة 🎁`);
}

// ---------------- Open Cash Drawer (best-effort, hardware-dependent) ----------------
// المتصفح مقدرش يوصل مباشرة لدرج الفلوس. الطريقة الشائعة: الطابعة نفسها فيها منفذ
// (RJ11) موصّل بالدرج، ومُعدّة تفتحه تلقائي كل ما تستقبل أمر طباعة. الزرار ده بيطبع
// إيصال فاضي صغير كمحاولة — لازم تتأكد إن الطابعة معمول لها الإعداد ده من قبل.
function openCashDrawer(){
  try{
    const w = window.open('', '_blank', 'width=200,height=100');
    w.document.write('<html><body onload="window.print(); setTimeout(()=>window.close(), 300);"></body></html>');
    w.document.close();
    showToast('اتبعت أمر فتح الدرج للطابعة — لو مفتحش، اتأكد إن الطابعة معمول لها إعداد فتح الدرج تلقائي', 'warn');
  }catch(e){
    showToast('تعذر إرسال أمر فتح الدرج: ' + e.message, 'err');
  }
}

// ---------------- Reverse Receipt (full refund of an already-paid sale) ----------------
function openReverseReceipt(){
  if(!hasPerm('canRefund')){ showToast('الصلاحية دي للمشرف/المدير بس', 'err'); return; }
  document.getElementById('reverseModal').classList.add('active');
  renderReverseList();
}
function closeReverseModal(){ document.getElementById('reverseModal').classList.remove('active'); }

async function renderReverseList(){
  const wrap = document.getElementById('reverseList');
  wrap.innerHTML = '<div class="empty-cart">بيتحمّل...</div>';
  try{
    const snap = await db.collection(TEST_SALES).where('branch','==', currentBranch).get();
    const sales = snap.docs.map(d=>({id:d.id, ...d.data()}))
      .filter(s=> !s.reversed && !s.isReversal)
      .sort((a,b)=>{
        const at = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
        const bt = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
        return bt - at;
      }).slice(0, 30);
    if(sales.length === 0){ wrap.innerHTML = '<div class="empty-cart">لا يوجد فواتير قابلة للعكس</div>'; return; }
    wrap.innerHTML = '';
    sales.forEach(s=>{
      const d = s.createdAt && s.createdAt.toDate ? s.createdAt.toDate() : null;
      const dateStr = d ? d.toLocaleString('ar-EG') : '—';
      const row = document.createElement('div');
      row.className = 'held-row';
      row.innerHTML = `
        <div class="h-info">
          ${(s.items||[]).length} صنف — ${s.total.toFixed(2)} ج.م
          <div class="h-time">${dateStr} — ${s.employeeName||'—'}</div>
        </div>
        <button onclick="reverseReceipt('${s.id}')">عكس الفاتورة</button>
      `;
      wrap.appendChild(row);
    });
  }catch(e){ wrap.innerHTML = '<div class="empty-cart">تعذر التحميل: ' + e.message + '</div>'; }
}

async function reverseReceipt(saleId){
  if(!confirm('متأكد إنك عايز تعكس الفاتورة دي؟ الكمية هترجع للمخزون، والإجراء ده نهائي.')) return;
  try{
    const saleDoc = await db.collection(TEST_SALES).doc(saleId).get();
    if(!saleDoc.exists){ showToast('الفاتورة مش موجودة', 'err'); return; }
    const sale = saleDoc.data();

    // 1) رجّع الكمية للمخزون (سطور المرتجع جوه الفاتورة بتتعكس هي كمان: كانت رجّعت بضاعة، فبنخصمها تاني)
    const batch = db.batch();
    (sale.items||[]).forEach(it=>{
      const ref = db.collection(TEST_INVENTORY).doc(it.id);
      batch.update(ref, { ['qtyByBranch.'+currentBranch]: firebase.firestore.FieldValue.increment(it.isReturn ? -it.qty : it.qty) });
    });
    batch.update(db.collection(TEST_SALES).doc(saleId), { reversed: true, reversedAt: firebase.firestore.FieldValue.serverTimestamp(), reversedBy: currentEmployee.name||'' });
    await batch.commit();
    for(const it of (sale.items||[])){
      await logStockMovement(it.id, it.name, it.isReturn ? -it.qty : it.qty, 'reversal', 'عكس فاتورة كاملة');
    }

    // 2) سجل عملية عكس منفصلة (رقم سالب) عشان التقارير تفضل دقيقة
    await db.collection(TEST_SALES).add({
      isReversal: true,
      originalSaleId: saleId,
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name || '',
      branch: currentBranch,
      items: sale.items,
      itemCount: -(sale.itemCount||0),
      total: -(sale.total||0),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    showToast('اتعكست الفاتورة ✅ والكمية رجعت للمخزون', 'ok');
    renderReverseList();
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}

// ---------------- Hold / Unhold ----------------
async function holdInvoice(){
  if(cart.length === 0){ showToast('الفاتورة فاضية', 'err'); return; }
  try{
    await db.collection(TEST_HELD).add({
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name || '',
      branch: currentBranch,
      customerPhone: document.getElementById('customerPhone').value.trim(),
      customerName: document.getElementById('customerName').value.trim(),
      items: cart,
      total: cartTotal(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('اتحفظت كـ فاتورة معلّقة ✔', 'ok');
    goToDashboard();
  }catch(e){ showToast('فشل الحفظ: ' + e.message, 'err'); }
}

async function refreshHeldCount(){
  try{
    const snap = await db.collection(TEST_HELD).where('branch','==', currentBranch).get();
    document.getElementById('heldCountLabel').textContent = snap.size + ' فاتورة';
  }catch(e){}
}

async function openHeldModal(){
  const listBox = document.getElementById('heldList');
  listBox.innerHTML = '<div class="empty-cart">جارٍ التحميل...</div>';
  document.getElementById('heldModal').classList.add('active');
  try{
    const snap = await db.collection(TEST_HELD).where('branch','==', currentBranch).get();
    if(snap.empty){
      listBox.innerHTML = '<div class="empty-cart">مفيش فواتير معلّقة</div>';
      return;
    }
    const docs = snap.docs.sort((a,b)=>{
      const at = a.data().createdAt && a.data().createdAt.toMillis ? a.data().createdAt.toMillis() : 0;
      const bt = b.data().createdAt && b.data().createdAt.toMillis ? b.data().createdAt.toMillis() : 0;
      return bt - at;
    });
    listBox.innerHTML = '';
    docs.forEach(d=>{
      const h = d.data();
      const row = document.createElement('div');
      row.className = 'held-row';
      row.innerHTML = `
        <div class="h-info">
          ${h.employeeName || '—'} | ${h.total.toFixed(2)} جنيه
          <div class="h-time">${h.items.length} صنف${h.customerPhone ? ' | 📞 '+h.customerPhone : ''}</div>
        </div>
        <button onclick="unholdInvoice('${d.id}')">استرجاع</button>
      `;
      listBox.appendChild(row);
    });
  }catch(e){ listBox.innerHTML = '<div class="empty-cart">تعذر التحميل</div>'; }
}
function closeHeldModal(){ document.getElementById('heldModal').classList.remove('active'); }

async function unholdInvoice(heldId){
  try{
    const doc = await db.collection(TEST_HELD).doc(heldId).get();
    if(!doc.exists){ showToast('الفاتورة مش موجودة', 'err'); return; }
    const h = doc.data();
    cart = h.items || [];
    document.getElementById('customerPhone').value = h.customerPhone || '';
    document.getElementById('customerInfo').textContent = '';
    editingHeldId = heldId;
    // تتشال خالص من قائمة المعلّقة فور الاسترجاع
    await db.collection(TEST_HELD).doc(heldId).delete();
    closeHeldModal();
    renderCart();
    showScreen('saleScreen');
  }catch(e){ showToast('فشل الاسترجاع: ' + e.message, 'err'); }
}

// ---------------- Payment ----------------
function resetPaymentUI(){
  selectedPayMethods = new Set();
  paymentAmounts = {};
  document.querySelectorAll('.qbx-pay-btns button').forEach(el=>el.classList.remove('selected', 'filled'));
  updatePaySummary();
}

let paymentAmounts = {}; // {cash: 50, visa: 120, ...} — filled in via the popup
let pendingPayMethod = null;

function togglePayMethod(method){
  pendingPayMethod = method;
  const total = cartTotal();
  const isRefund = total < 0;
  const requiredAbs = Math.abs(total);
  const alreadyEnteredAbs = Object.keys(paymentAmounts).reduce((s,m)=> m===method ? s : s + Math.abs(paymentAmounts[m]), 0);
  const remaining = Math.max(0, +(requiredAbs - alreadyEnteredAbs).toFixed(2));
  const labels = {cash:'💵 كاش', visa:'💳 فيزا', instapay:'📱 انستا باي'};

  document.getElementById('payAmountTitle').textContent = labels[method] + (isRefund ? ' (إرجاع للعميل)' : '');
  const input = document.getElementById('payAmountInput');
  // بيع عادي + كاش: فاضية عشان الكاشير يكتب المبلغ اللي استلمه فعليًا (والباقي بيتحسب تلقائي).
  // بيع عادي + فيزا/انستا باي: مقترحة تلقائي بباقي الفاتورة.
  // فاتورة مرتجع (الإجمالي بالسالب): مقترحة تلقائي بقيمة المبلغ المطلوب إرجاعه للعميل، بأي وسيلة.
  input.value = (method === 'cash' && !isRefund) ? '' : remaining.toFixed(2);
  document.getElementById('payAmountChange').textContent = '';
  document.getElementById('payAmountModal').classList.add('active');
  input.oninput = ()=> updatePayAmountChangeLive(method, total, alreadyEnteredAbs);
  setTimeout(()=>{ input.focus(); input.select(); }, 50);
}

function updatePayAmountChangeLive(method, total, alreadyEnteredAbs){
  const val = parseFloat(document.getElementById('payAmountInput').value) || 0;
  const changeBox = document.getElementById('payAmountChange');
  const isRefund = total < 0;
  if(method === 'cash' && !isRefund){
    const totalPaidSoFar = alreadyEnteredAbs + val;
    const change = +(totalPaidSoFar - total).toFixed(2);
    if(val === 0){ changeBox.textContent = ''; }
    else if(change >= 0){ changeBox.innerHTML = `<span style="color:var(--plus);">الباقي للعميل: ${change.toFixed(2)} ج.م</span>`; }
    else{ changeBox.innerHTML = `<span style="color:var(--minus);">ناقص ${Math.abs(change).toFixed(2)} ج.م</span>`; }
  }else{
    changeBox.textContent = '';
  }
}

function closePayAmountPopup(){
  document.getElementById('payAmountModal').classList.remove('active');
  pendingPayMethod = null;
}

function confirmPayAmount(){
  const method = pendingPayMethod;
  if(!method) return;
  const val = parseFloat(document.getElementById('payAmountInput').value) || 0;
  if(val <= 0){ showToast('اكتب مبلغ صحيح', 'err'); return; }
  // في فاتورة المرتجع (إجمالي بالسالب) المبلغ بيتسجل بالسالب (فلوس خارجة)، وفي البيع العادي بالموجب.
  const total = cartTotal();
  paymentAmounts[method] = total < 0 ? -val : val;
  selectedPayMethods.add(method);
  document.getElementById('pm' + (method==='cash'?'Cash':method==='visa'?'Visa':'Insta')).classList.add('selected','filled');
  document.getElementById('payAmountModal').classList.remove('active');
  pendingPayMethod = null;
  updatePaySummary();
}
// دعم Enter بدل ما تدوس OK يدويًا
document.getElementById('payAmountInput').addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){ e.preventDefault(); confirmPayAmount(); }
});

function updatePaySummary(){
  const total = cartTotal();
  const isRefund = total < 0;
  let entered = 0;
  selectedPayMethods.forEach(m=> entered += paymentAmounts[m] || 0);
  const enteredAbs = Math.abs(entered);
  const requiredAbs = Math.abs(total);
  const due = Math.max(0, +(requiredAbs - enteredAbs).toFixed(2));
  const change = (!isRefund) ? Math.max(0, +(enteredAbs - requiredAbs).toFixed(2)) : 0;
  const confirmBtn = document.getElementById('confirmPayBtn');

  const labels = {cash:'💵 كاش', visa:'💳 فيزا', instapay:'📱 انستا باي'};
  const payList = document.getElementById('qbxPayList');
  if(payList){
    payList.innerHTML = Array.from(selectedPayMethods).map(m=>
      `<div class="pl-row"><span>${labels[m]}</span><span>${Math.abs(paymentAmounts[m]||0).toFixed(2)} ج.م</span></div>`).join('')
      || `<div style="color:#999; font-size:11px; padding:6px 0;">${isRefund ? 'اختار طريقة إرجاع المبلغ للعميل' : 'لسه مفيش مدفوعات — دوس كاش/فيزا/انستا باي'}</div>`;
  }

  const dueLabel = document.querySelector('.qbx-totals .t-row:nth-child(3) span:first-child');
  if(dueLabel) dueLabel.textContent = isRefund ? 'متبقي إرجاعه' : 'المتبقي';

  const paidEl = document.getElementById('qbxPaid');
  const dueEl = document.getElementById('qbxDue');
  const changeEl = document.getElementById('qbxChange');
  if(paidEl) paidEl.textContent = enteredAbs.toFixed(2);
  if(dueEl) dueEl.textContent = due.toFixed(2);
  if(changeEl) changeEl.textContent = change.toFixed(2);

  // زرار الحفظ بيتفعّل لما المبلغ المُدخل (بصرف النظر عن الاتجاه) يغطي المطلوب بالكامل
  confirmBtn.disabled = !(cart.length > 0 && selectedPayMethods.size > 0 && enteredAbs >= requiredAbs);
}

// رقم فاتورة متسلسل ومميز (زي INV-000123) — بيتولّد بمعاملة Firestore آمنة
// عشان لو جهازين بيبيعوا في نفس اللحظة، كل واحد ياخد رقم مختلف من غير تعارض.
async function generateInvoiceNumber(){
  const counterRef = db.collection(TEST_SETTINGS).doc('invoice_counter_' + currentBranch);
  try{
    const newNumber = await db.runTransaction(async (tx)=>{
      const doc = await tx.get(counterRef);
      const current = doc.exists ? (doc.data().value || 0) : 0;
      const next = current + 1;
      tx.set(counterRef, { value: next }, { merge:true });
      return next;
    });
    return String(newNumber);
  }catch(e){
    // لو حصلت مشكلة (نادر) نستخدم بديل مبني على الوقت عشان الفاتورة تتحفظ برضو
    console.warn('تعذر توليد رقم فاتورة متسلسل، هيتستخدم رقم بديل', e);
    return Date.now().toString().slice(-8);
  }
}

async function confirmPayment(){
  const total = cartTotal();
  const isRefundInvoice = total < 0;
  const payments = {};
  selectedPayMethods.forEach(m=> payments[m] = paymentAmounts[m] || 0);
  const phone = document.getElementById('customerPhone').value.trim();
  const custName = document.getElementById('customerName').value.trim();
  const itemCount = cart.reduce((s,c)=>s+c.qty, 0);
  const earnsStaffPoint = !isRefundInvoice && itemCount >= MIN_ITEMS_FOR_STAFF_POINT;
  const loyaltyPointsEarned = (phone && !isRefundInvoice) ? Math.floor(total / loyaltyRedemptionConfig.pointsPerEGP) : 0;
  const invoiceNo = await generateInvoiceNumber();
  // كود فاتورة مميز عالميًا للباركود (بادئة FT عشان يتفرّق عن باركود المنتجات والعملاء)
  const invoiceCode = 'FT' + invoiceNo + '-' + Date.now().toString(36).slice(-4).toUpperCase();

  // الموظف اللي فعليًا باع للعميل (ممكن يكون مختلف عن اللي مسجّل دخول في جهاز الـPOS نفسه)
  const sellerSel = document.getElementById('sellerEmployeeSelect');
  const sellerEmployeeId = sellerSel && sellerSel.value ? sellerSel.value : currentEmployee.id;
  const sellerEmployeeName = sellerSel && sellerSel.value ? sellerSel.options[sellerSel.selectedIndex].dataset.name : (currentEmployee.name || '');

  try{
    // 1) سجل البيع
    await db.collection(TEST_SALES).add({
      invoiceNo,
      invoiceCode,
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name || '',
      sellerEmployeeId, sellerEmployeeName,
      branch: currentBranch,
      items: cart,
      itemCount, total, payments,
      customerPhone: phone || null,
      customerName: custName || null,
      loyaltyPointsEarned,
      pointsRedeemed: (pendingRedemption ? pendingRedemption.points : 0),
      staffPointEarned: earnsStaffPoint,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 2) خصم من المخزون التجريبي (باستثناء سطور مش منتجات فعلية: استبدال نقط، مكافأة، أي id محجوز)
    const stockLines = cart.filter(c=> !c.isRedemption && !c.isRewardDiscount && c.id && !String(c.id).startsWith('__'));
    const batch = db.batch();
    stockLines.forEach(c=>{
      const ref = db.collection(TEST_INVENTORY).doc(c.id);
      batch.update(ref, { ['qtyByBranch.'+currentBranch]: firebase.firestore.FieldValue.increment(c.isReturn ? c.qty : -c.qty) });
    });
    await batch.commit();
    for(const c of stockLines){
      await logStockMovement(c.id, c.name, c.isReturn ? c.qty : -c.qty, c.isReturn ? 'return' : 'sale', c.isReturn ? 'مرتجع داخل فاتورة بيع' : 'بيع');
    }

    // 3) نقطة الموظف (تجريبي - منفصل عن رصيد الـ HR الحقيقي) — بتتحسب للبائع الفعلي
    if(earnsStaffPoint){
      const ptRef = db.collection(TEST_EMPLOYEE_POINTS).doc(sellerEmployeeId);
      await ptRef.set({
        employeeName: sellerEmployeeName,
        points: firebase.firestore.FieldValue.increment(1),
        salesCount: firebase.firestore.FieldValue.increment(1)
      }, { merge: true });
    }

    // 4) نقاط ولاء العميل (تجريبي) — بتضيف المكتسب وتخصم أي نقط اتستبدلت في نفس الفاتورة دي
    if(phone){
      const custRef = db.collection(TEST_CUSTOMERS).doc(phone);
      const netPointsChange = loyaltyPointsEarned - (pendingRedemption ? pendingRedemption.points : 0);
      const pf = pointsFieldFor(currentBranch);
      const custUpdate = {
        phone, branch: currentBranch,
        totalSpent: firebase.firestore.FieldValue.increment(total),
        lastVisit: firebase.firestore.FieldValue.serverTimestamp()
      };
      custUpdate[pf] = firebase.firestore.FieldValue.increment(netPointsChange);   // نقاط الفرع الصح
      if(pendingRedemption) custUpdate.pendingRedeem = firebase.firestore.FieldValue.delete();   // نمسح الطلب بعد ما اتنفّذ
      if(appliedReward) custUpdate.rewards = firebase.firestore.FieldValue.arrayRemove(appliedReward);   // نمسح المكافأة اللي اتستخدمت
      cart.forEach(l=>{ if(l.offerApplied && l.barcode) custUpdate['activatedOffers.'+l.barcode] = firebase.firestore.FieldValue.delete(); });   // نمسح العروض اللي اتستخدمت
      if(custName) custUpdate.name = custName;
      await custRef.set(custUpdate, { merge: true });
    }
    pendingRedemption = null;
    appliedReward = null; custReward = null;

    // 5) محاولة ربط العميل بأقرب تقييم لسه من غير عميل معروف في نفس الفرع (زمنيًا)
    if(phone){
      await tryLinkFeedbackToCustomer(phone, custName, sellerEmployeeName);
    }

    printReceipt(payments, total, invoiceNo, invoiceCode);
    showToast('تم حفظ الفاتورة ✔ — متبقى تقييم العميل من صفحة التقييم', 'ok');
    goToSale();
  }catch(e){
    showToast('فشل حفظ الفاتورة: ' + e.message, 'err');
  }
}

// بيدوّر على أقرب تقييم "Happy or Not" لسه من غير عميل معروف، في نافذة زمنية ضيقة
// وواقعية حوالين لحظة قفل الفاتورة: من دقيقتين قبلها لحد دقيقة بعدها.
// بيتشيك مرتين: مرة فورًا (يمسك أي تقييم حصل قبل الدفع)، ومرة تانية بعد دقيقة
// ونص تقريبًا (يمسك أي تقييم حصل بعد ما العميل استلم الفاتورة). ده بيشتغل
// بس على التقييمات الجديدة من دلوقتي وطالع — مفيش طريقة نربط تقييمات قديمة
// اتسجلت قبل الميزة دي لأنها كانت بتتسجل من غير أي هوية خالص.
async function tryLinkFeedbackToCustomer(phone, name, sellerName){
  const saleTime = Date.now();
  const attemptLink = async ()=>{
    try{
      const windowStart = saleTime - (2 * 60 * 1000);  // دقيقتين قبل الفاتورة
      const windowEnd = saleTime + (3 * 60 * 1000);    // 3 دقايق بعد الفاتورة (وقت واقعي إن العميل يمشي للكشك ويقيّم)
      const snap = await db.collection('entries').where('branch','==', currentBranch).get();
      const candidates = snap.docs
        .map(d=>({id:d.id, ...d.data()}))
        .filter(e=> e.ts >= windowStart && e.ts <= windowEnd && !e.customerPhone)
        .sort((a,b)=> Math.abs(a.ts - saleTime) - Math.abs(b.ts - saleTime)); // الأقرب زمنيًا للفاتورة الأول
      if(candidates.length === 0) return;
      await db.collection('entries').doc(candidates[0].id).update({
        customerPhone: phone, customerName: name || null, servedByEmployeeName: sellerName || null
      });
    }catch(e){ console.warn('تعذر ربط التقييم بالعميل', e); }
  };
  await attemptLink();           // محاولة فورية (تقييمات قبل الفاتورة)
  setTimeout(attemptLink, 90000);  // محاولة تانية بعد دقيقة ونص
  setTimeout(attemptLink, 200000); // محاولة تالتة بعد حوالي 3 دقايق ونص (تغطي آخر حدود النافذة براحة)
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
