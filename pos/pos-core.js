// ⚠️ ملف مُقسّم من app.js — جزء من نظام POS. الترتيب في index.html مهم:
// pos-core.js ← pos-admin.js ← pos-reports.js ← pos-sale.js ← app.js

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
// رمز مختصر للفرع لكود الفاتورة (بيشيل كلمة echarpe وياخد الكلمة المميزة)
function branchCode(branch){
  let s = String(branch||'').replace(/echarpe/ig,'').trim();
  s = s.replace(/[^A-Za-z\u0600-\u06FF ]/g,' ').trim();
  const words = s.split(/\s+/).filter(w=> w && !/^(el|al|the)$/i.test(w));
  const base = words[0] || s || String(branch||'X');
  return (base.slice(0,3).toUpperCase() || 'X');
}
// كمية المنتج في الفرع الحالي (كل فرع مخزونه منفصل). لو المنتج لسه ماتفصلش، بيرجّع الكمية القديمة.
function branchQty(p, br){
  br = br || currentBranch;
  if(p && p.qtyByBranch) return Number(p.qtyByBranch[br]) || 0;
  return Number(p && p.quantity) || 0;   // legacy قبل فصل المخزون
}

firebase.initializeApp(firebaseConfig);
// حساب الفرع (Email/Password) — الجهاز بيسجّل دخول مرة واحدة وبيتحفظ.
// ده اللي بيدّي الكاشير صلاحية كتابة النقط/المبيعات في قواعد الأمان (المرحلة 2).
firebase.auth().setPersistence && firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function(){});
function isStaffSignedIn(){
  var u = firebase.auth().currentUser;
  return !!(u && !u.isAnonymous);
}
// لو مفيش جلسة موظف محفوظة، نرجّع لشاشة إعداد الجهاز عشان يسجّل
firebase.auth().onAuthStateChanged(function(u){
  if(!u || u.isAnonymous){
    var bs = document.getElementById('branchSetupScreen');
    var ls = document.getElementById('loginScreen');
    if(bs && ls && !document.querySelector('.screen.active#branchSetupScreen')){
      // الجلسة انتهت/اتمسحت → نطلب دخول حساب الفرع تاني (اسم الفرع محفوظ أصلاً)
      document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
      bs.classList.add('active');
      if(typeof loadBranchSetupOptions === 'function') setTimeout(loadBranchSetupOptions, 50);
    }
  }
});
const db = firebase.firestore();
// قايمة الفروع في شاشة الإعداد بتتحمّل عند فتح الصفحة (لو الشاشة ظاهرة)
setTimeout(function(){ if(typeof loadBranchSetupOptions === 'function' && document.querySelector('#branchSetupScreen.active')) loadBranchSetupOptions(); }, 300);

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

// بيحمّل أسماء الفروع المعتمدة (من الموظفين المسجّلين) لقايمة اختيار الفرع —
// عشان نمنع أخطاء الكتابة اليدوية اللي بتعمل "فرع جديد" بالغلط
async function loadBranchSetupOptions(){
  const sel = document.getElementById('branchSetupSelect');
  if(!sel) return;
  let branches = [];
  try{
    const snap = await db.collection(EMPLOYEES_COLLECTION).get();
    const set = new Set();
    snap.docs.forEach(d=>{ const b=((d.data().branch)||'').trim(); if(b) set.add(b); });
    GLOW_BRANCHES.forEach(b=> set.add(b));
    branches = [...set].sort((a,b)=> a.localeCompare(b,'ar'));
    try{ localStorage.setItem('pos_branch_list', JSON.stringify(branches)); }catch(e){}
  }catch(e){
    // القراءة اترفضت (قواعد الأمان قبل الدخول) أو مفيش نت → نستخدم القايمة المحفوظة من آخر مرة
    try{ branches = JSON.parse(localStorage.getItem('pos_branch_list') || '[]'); }catch(e2){ branches = []; }
    if(!branches.length) branches = [...GLOW_BRANCHES];
  }
  const saved = localStorage.getItem('pos_branch') || '';
  sel.innerHTML = '<option value="">— اختار الفرع —</option>'
    + branches.map(b=> `<option value="${b.replace(/"/g,'&quot;')}" ${b===saved?'selected':''}>${b}</option>`).join('')
    + '<option value="__new__">➕ فرع جديد (اكتب الاسم)...</option>';
  onBranchSetupSelect();
}
function onBranchSetupSelect(){
  const sel = document.getElementById('branchSetupSelect');
  const inp = document.getElementById('branchSetupInput');
  if(!sel || !inp) return;
  inp.style.display = (sel.value === '__new__') ? 'block' : 'none';
  if(sel.value === '__new__') inp.focus();
}
function getBranchSetupValue(){
  const sel = document.getElementById('branchSetupSelect');
  const inp = document.getElementById('branchSetupInput');
  if(sel && sel.value && sel.value !== '__new__') return sel.value;
  return (inp?.value || '').trim();
}

async function saveBranchSetup(){
  const val = getBranchSetupValue();
  const email = (document.getElementById('branchSetupEmail')?.value || '').trim();
  const pass = document.getElementById('branchSetupPass')?.value || '';
  const errBox = document.getElementById('branchSetupErr');
  if(!val){ if(errBox) errBox.textContent = 'اكتب اسم الفرع'; return; }
  if(!email || !pass){ if(errBox) errBox.textContent = 'اكتب إيميل وباسورد حساب الفرع'; return; }
  if(errBox) errBox.textContent = 'جارٍ الدخول...';
  try{
    const cred = await firebase.auth().signInWithEmailAndPassword(email, pass);
    // نسجّل UID الحساب ده في قايمة الموظفين المصرّح لهم — قواعد الأمان بتتحقق منها
    try{
      await db.collection(TEST_SETTINGS).doc('staff_uids').set({ [cred.user.uid]: { branch: val, email: email, ts: Date.now() } }, { merge:true });
    }catch(e){ console.warn('staff uid register', e); }
    currentBranch = val;
    localStorage.setItem('pos_branch', val);
    if(errBox) errBox.textContent = '';
    showScreen('loginScreen');
    loadEmployeePicker();
  }catch(e){
    const msg = (e && e.code === 'auth/invalid-credential') || (e && e.code === 'auth/wrong-password') || (e && e.code === 'auth/user-not-found')
      ? 'الإيميل أو الباسورد غلط' : 'تعذر الدخول: ' + (e.message || e);
    if(errBox) errBox.textContent = msg;
  }
}

// أول ما الصفحة تفتح: لو مفيش فرع متسجل على الجهاز ده، اطلب تسجيله الأول قبل أي حاجة تانية.
// أول ما الصفحة تفتح: الجهاز يعدّي بس لو عنده فرع محفوظ + جلسة حساب فرع سارية.
// (onAuthStateChanged فوق بيرجّعه لشاشة الإعداد تلقائيًا لو الجلسة مش موجودة)
if(currentBranch){
  firebase.auth().onAuthStateChanged(function once(u){
    if(u && !u.isAnonymous){
      document.getElementById('branchSetupScreen').classList.remove('active');
      document.getElementById('loginScreen').classList.add('active');
      loadEmployeePicker();
    }
  });
}

// ---------------- State ----------------
let currentEmployee = null;
let cart = []; // {id, name, barcode, price, qty}
let allInventory = [];
let invSales = {};              // { productId: عدد المباع }
let invSortCol = 'name';        // العمود اللي بنرتّب بيه
let invSortDir = 1;             // 1 تصاعدي، -1 تنازلي
let editingHeldId = null; // لو بنكمل على فاتورة كانت معلّقة
let selectedPayMethods = new Set();

// ---------------- Roles & Permissions (خاصة بالـ POS بس، منفصلة عن نظام الـ HR) ----------------
// كل دور له مجموعة صلاحيات bool. القيم دي الافتراضية (Fallback) لو الأدمن لسه معملش تخصيص
// من بانل الصلاحيات — بعد أول حفظ من البانل، القيم بتتقرا من قاعدة البيانات بدل كده.
const DEFAULT_ROLE_PERMISSIONS = {
  admin: {
    label: 'أدمن', canSell: true, canHold: true, canPrintLabel: true,
    canViewCostPrice: true, canViewStock: true, canViewLogs: true, canRefund: true, canResetCustomerPin: true,
    canEditInventory: true, canReceiveGoods: true, canChangePrices: true, canViewReports: true, canManageRoles: true, canSwitchBranch: true
  },
  cashier: {
    label: 'كاشير', canSell: true, canHold: true, canPrintLabel: true,
    canViewCostPrice: false, canViewStock: true, canViewLogs: false, canRefund: false, canResetCustomerPin: false,
    canEditInventory: false, canReceiveGoods: true, canChangePrices: false, canViewReports: false, canManageRoles: false, canSwitchBranch: false
  },
  supervisor: {
    label: 'مشرف', canSell: true, canHold: true, canPrintLabel: true,
    canViewCostPrice: false, canViewStock: true, canViewLogs: true, canRefund: true, canResetCustomerPin: true,
    canEditInventory: false, canReceiveGoods: true, canChangePrices: false, canViewReports: false, canManageRoles: false, canSwitchBranch: false
  },
  manager: {
    label: 'مدير', canSell: true, canHold: true, canPrintLabel: true,
    canViewCostPrice: true, canViewStock: true, canViewLogs: true, canRefund: true, canResetCustomerPin: true,
    canEditInventory: true, canReceiveGoods: true, canChangePrices: true, canViewReports: true, canManageRoles: true, canSwitchBranch: false
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

    // كمان نجيب الأدمن (بيظهر في الدخول على أي جهاز/فرع، مش متقيّد بفرع الجهاز)
    let adminEmps = [];
    try{
      const asg = await db.collection(TEST_ROLES).doc('_assignments').get();
      const assignments = asg.exists ? asg.data() : {};
      const adminIds = Object.keys(assignments).filter(id=> assignments[id]==='admin' && !emps.some(e=> e.id===id));
      if(adminIds.length){
        const docs = await Promise.all(adminIds.map(id=> db.collection(EMPLOYEES_COLLECTION).doc(id).get()));
        adminEmps = docs.filter(d=> d.exists).map(d=>Object.assign({id:d.id, _admin:true}, d.data())).filter(e=> e.active !== false);
      }
    }catch(e){ /* لو فشل، نكمّل بموظفين الفرع بس */ }

    const allEmps = adminEmps.concat(emps);
    if(allEmps.length === 0){
      grid.innerHTML = '';
      errBox.textContent = 'لسه مفيش موظفين مسجلين للفرع ده في نظام المبيعات';
      return;
    }
    errBox.textContent = '';
    grid.innerHTML = allEmps.map(e=>{
      const initials = (e.name||'؟').trim().split(' ').slice(0,2).map(w=>w[0]).join('');
      const adminBadge = e._admin ? '<div style="font-size:9px; color:var(--accent); font-weight:800; margin-top:2px;">🌐 أدمن</div>' : '';
      return `<div class="emp-pick-tile" onclick="selectEmployeeForLogin('${e.id}', '${(e.name||'').replace(/'/g,"\\'")}')"><div class="av">${initials}</div><div class="n">${e.name}</div>${adminBadge}</div>`;
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
  currentBranch = localStorage.getItem('pos_branch') || currentBranch;   // الجهاز يرجع لفرعه الأصلي بعد خروج الأدمن
  backToEmployeePicker();
  showScreen('loginScreen');
}

// ---------------- بدّل الفرع (أدمن) ----------------
async function openBranchSwitch(){
  if(!hasPerm('canSwitchBranch')){ showToast('الصلاحية دي للأدمن بس', 'err'); return; }
  const modal = document.getElementById('branchSwitchModal');
  const list = document.getElementById('branchSwitchList');
  if(!modal || !list) return;
  list.innerHTML = '<div class="empty-cart">جارٍ التحميل...</div>';
  modal.classList.add('active');
  try{
    const snap = await db.collection(EMPLOYEES_COLLECTION).get();
    const set = new Set();
    snap.docs.forEach(d=>{ const b=((d.data().branch)||'').trim(); if(b) set.add(b); });
    GLOW_BRANCHES.forEach(b=> set.add(b));
    if(currentBranch) set.add(currentBranch);
    const branches = [...set].sort((a,b)=> a.localeCompare(b,'ar'));
    list.innerHTML = branches.map(b=>{
      const sel = (b===currentBranch);
      return `<button class="secondary" style="width:100%; margin-bottom:8px; ${sel?'border-color:var(--accent); color:var(--accent); font-weight:800;':''}" onclick="doBranchSwitch('${b.replace(/'/g,"\\'")}')">${sel?'✅ ':''}${b}</button>`;
    }).join('') || '<div class="empty-cart">مفيش فروع</div>';
  }catch(e){ list.innerHTML = '<div class="empty-cart">تعذر التحميل: '+e.message+'</div>'; }
}
function closeBranchSwitch(){ const m=document.getElementById('branchSwitchModal'); if(m) m.classList.remove('active'); }
function doBranchSwitch(branch){
  if(!hasPerm('canSwitchBranch')) return;
  currentBranch = branch;   // مؤقت للجلسة — مش بيتخزّن، فالجهاز يفضل على فرعه الأصلي بعد الخروج
  closeBranchSwitch();
  const roleLabel = myPerms().label || '';
  const el = document.getElementById('dashWho'); if(el) el.textContent = (currentEmployee.name||'') + ' — ' + roleLabel + ' · 🏬 ' + currentBranch;
  const bb = document.getElementById('branchSwitchBtn'); if(bb) bb.innerHTML = '🏬 بدّل الفرع<span style="display:block; font-size:10px; font-weight:400; opacity:.8;">'+currentBranch+'</span>';
  if(typeof loadActiveDiscounts === 'function') loadActiveDiscounts();
  if(typeof loadLoyaltyRedemptionConfig === 'function') loadLoyaltyRedemptionConfig();
  showToast('اتبدّل الفرع لـ ' + currentBranch + ' ✔');
  goToDashboard();
}

let noRoleAssignmentsYet = false; // bootstrap flag: true if the system has never had any role assigned

function enterDashboard(){
  const roleLabel = myPerms().label || 'كاشير';
  document.getElementById('dashWho').textContent = (currentEmployee.name || currentEmployee.id) + ' — ' + roleLabel + ' · 🏬 ' + currentBranch;
  refreshHeldCount();

  // زر "بدّل الفرع" — للأدمن بس
  const canSwitch = hasPerm('canSwitchBranch');
  const bb = document.getElementById('branchSwitchBtn');
  if(bb){ bb.style.display = canSwitch ? '' : 'none'; bb.innerHTML = '🏬 بدّل الفرع<span style="display:block; font-size:10px; font-weight:400; opacity:.8;">'+currentBranch+'</span>'; }

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

  const canReceiveGoods = hasPerm('canReceiveGoods') || hasPerm('canEditInventory');
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

