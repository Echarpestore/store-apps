// ⚠️ ملف مُقسّم من app.js — جزء من نظام POS. الترتيب في index.html مهم:
// pos-core.js ← pos-admin.js ← pos-reports.js ← pos-sale.js ← app.js

/* ============================================================
   🛡️ esc — تهريب HTML (الدالة المشتركة لكل ملفات POS)
   ------------------------------------------------------------
   🔴 الباج اللي اتكشف: الملفات كانت بتنادي `esc()` و**هي مش معرّفة
      في POS خالص** — لا في ملف ولا في بلوك سكريبت. النداءات كانت
      كلها جوّه `try{}`، فالـReferenceError بيتبلع والميزة تفضل
      **فاضية من غير أي رسالة**:
        · لوحة طلبات الزباين في «استلام بضاعة» (١٠ نداءات)
        · شاشة «فيه ناس كانوا طالبين ده»
        · تلميحات شريط الفرصة في pos-sale.js
      تلاتتهم شكلهم مبني وعمرهم ما اشتغلوا.
   ⚠️ اللي كشفها: شاشة الطلبات الجديدة بتتنادى **من غير try**، فالخطأ
      طلع على الشاشة بدل ما يتبلع.
   ⚠️ الدرس: `try{}` حوالين كود عرض **بيخفي الباجات مش بيمنعها**.
      أي `catch` صامت حوالين عرض لازم يطبع سبب في الكونسول على الأقل.
   ⚠️ مكانها هنا عن قصد: pos-core.js أول ملف بيتحمّل، فكل اللي بعده
      يلاقيها. والتعريض على window إجباري (§18) — `function` في ملف
      منفصل بتتعلق على window لوحدها، بس بنكتبها صراحةً عشان القاعدة
      تفضل واحدة في كل حتة.
   ============================================================ */
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
if(typeof window !== 'undefined') window.esc = esc;

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

// ============================================================
// 🔐 Sync Guard — الفاتورة الأوفلاين تفضل في IndexedDB لحد تأكيد السيرفر.
// قبل Logout أو تقفيل اليوم بنستنى Firestore نفسه يقول إن كل الكتابات
// الصادرة قبل اللحظة دي وصلت للباك إند. لا بنمسح cache ولا queue محلية.
// ============================================================
const POS_SYNC_WAIT_MS = 15000;
window.__posPendingWritesKnown = false;

function _posPromiseTimeout(p, ms){
  return Promise.race([
    Promise.resolve(p),
    new Promise(function(_r, reject){ setTimeout(function(){ reject(new Error('sync-timeout')); }, ms || POS_SYNC_WAIT_MS); })
  ]);
}

async function posFlushPendingWrites(opts){
  opts = opts || {};
  const ms = Number(opts.timeoutMs) || POS_SYNC_WAIT_MS;
  try{
    // waitForPendingWrites يشمل الفاتورة + batch المخزون/النقط + أي كتابة سبق إصدارها.
    await _posPromiseTimeout(db.waitForPendingWrites(), ms);
    window.__posPendingWritesKnown = false;
    return { ok:true, pending:false };
  }catch(e){
    window.__posPendingWritesKnown = true;
    return {
      ok:false,
      pending:true,
      offline: (typeof navigator !== 'undefined' && navigator.onLine === false),
      timeout: !!(e && e.message === 'sync-timeout'),
      error:e
    };
  }
}
window.posFlushPendingWrites = posFlushPendingWrites;

async function posRequireSynced(actionLabel, opts){
  actionLabel = actionLabel || 'العملية';
  const r = await posFlushPendingWrites(opts);
  if(r.ok) return r;
  const msg = r.offline
    ? ('📴 فيه بيانات محفوظة على الجهاز ولسه مستنية النت. مش هنكمل ' + actionLabel + ' قبل ما تترفع للسيرفر.')
    : ('⏳ لسه فيه بيانات بتترفع للسيرفر. استنى لحظة وجرب ' + actionLabel + ' تاني.');
  try{ showToast(msg, 'err'); }catch(e){}
  return r;
}
window.posRequireSynced = posRequireSynced;

// لما النت يرجع، نطلب تأكيد الخلفية ونطفي علامة الـpending بمجرد وصول كل الكتابات.
window.addEventListener('online', function(){
  setTimeout(function(){ posFlushPendingWrites({ timeoutMs:30000 }).catch(function(){}); }, 500);
});

// المتصفح مش بيسمح بانتظار async وقت قفل التاب، لكن نقدر نحذر المستخدم
// لو إحنا عارفين إن فيه كتابة مؤجلة. Firestore persistence نفسها تحتفظ بها.
window.addEventListener('beforeunload', function(e){
  if(!window.__posPendingWritesKnown) return;
  e.preventDefault();
  e.returnValue = '';
});

// بيحمّل أسماء الفروع المعتمدة (من الموظفين المسجّلين) لقايمة اختيار الفرع —
// عشان نمنع أخطاء الكتابة اليدوية اللي بتعمل "فرع جديد" بالغلط
async function loadBranchSetupOptions(){
  const sel = document.getElementById('branchSetupSelect');
  if(!sel) return;
  let branches = [];
  try{
    const snap = await db.collection(EMPLOYEES_COLLECTION).get();
    const set = new Set();
    snap.docs.forEach(d=>{
      const e = d.data();
      if(e.isAdminAccount) return;   // 👑 حساب الأدمن مش فرع
      const b = ((e.branch)||'').trim();
      if(b && b !== 'الإدارة') set.add(b);
    });
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
    // 🔑 بنحفظ دخول الفرع على الجهاز ده عشان لو الجلسة ضاعت (تحديث/كاش)
    // الجهاز يرجع لوحده — الموظفة مش معاها الإيميل ولا المفروض تشوفه.
    try{ saveBranchLogin(email, pass); }catch(e){ console.warn('save login', e); }
    if(errBox) errBox.textContent = '';
    showScreen('loginScreen');
    loadEmployeePicker();
  }catch(e){
    const msg = (e && e.code === 'auth/invalid-credential') || (e && e.code === 'auth/wrong-password') || (e && e.code === 'auth/user-not-found')
      ? 'الإيميل أو الباسورد غلط' : 'تعذر الدخول: ' + (e.message || e);
    if(errBox) errBox.textContent = msg;
  }
}

// ============================================================
// 🔐 دخول الفرع التلقائي
// المشكلة: بعد أي تحديث أو تنضيف كاش، جلسة Auth بتضيع فالجهاز بيطلب
// إيميل وباسورد الفرع — والموظفة مش معاها ولا المفروض تكون معاها.
// الحل: الجهاز بيفتكر دخول الفرع ويرجع لوحده في الخلفية.
// (ترميز بسيط — الهدف إن الموظفة ماتشوفش الإيميل، مش حماية من مخترق
//  عنده الجهاز فعليًا. الحماية الحقيقية في قواعد Firestore.)
// ============================================================
const _BL_KEY = 'pos_branch_login';
function _blEnc(s){
  try{ return btoa(unescape(encodeURIComponent(s)).split('').map(function(c,i){
    return String.fromCharCode(c.charCodeAt(0) ^ (7 + (i % 11)));
  }).join('')); }catch(e){ return ''; }
}
function _blDec(s){
  try{ return decodeURIComponent(escape(atob(s).split('').map(function(c,i){
    return String.fromCharCode(c.charCodeAt(0) ^ (7 + (i % 11)));
  }).join(''))); }catch(e){ return ''; }
}
function saveBranchLogin(email, pass){
  if(!email || !pass) return;
  localStorage.setItem(_BL_KEY, _blEnc(JSON.stringify({ e: email, p: pass })));
}
function getBranchLogin(){
  const raw = localStorage.getItem(_BL_KEY);
  if(!raw) return null;
  try{ const o = JSON.parse(_blDec(raw)); return (o && o.e && o.p) ? o : null; }
  catch(e){ return null; }
}
window.saveBranchLogin = saveBranchLogin;
window.getBranchLogin = getBranchLogin;

// بيحاول يرجّع الجلسة لوحده — بيرجع true لو نجح
async function tryAutoBranchLogin(){
  if(firebase.auth().currentUser) return true;
  const saved = getBranchLogin();
  if(!saved) return false;
  try{
    await firebase.auth().signInWithEmailAndPassword(saved.e, saved.p);
    console.log('🔐 رجع دخول الفرع تلقائي');
    return true;
  }catch(e){
    console.warn('auto branch login', e && e.code);
    // الباسورد اتغيّر → نمسح المحفوظ عشان ما نفضلش نحاول
    if(e && (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password')){
      localStorage.removeItem(_BL_KEY);
    }
    return false;
  }
}
window.tryAutoBranchLogin = tryAutoBranchLogin;

// أول ما الصفحة تفتح: لو مفيش فرع متسجل على الجهاز ده، اطلب تسجيله الأول قبل أي حاجة تانية.
// أول ما الصفحة تفتح: الجهاز يعدّي بس لو عنده فرع محفوظ + جلسة حساب فرع سارية.
// (onAuthStateChanged فوق بيرجّعه لشاشة الإعداد تلقائيًا لو الجلسة مش موجودة)
if(currentBranch){
  // 🔐 لو الجلسة ضاعت (تحديث/تنضيف كاش)، بنحاول نرجّعها لوحدنا الأول —
  // الموظفة مش المفروض تشوف شاشة الإيميل والباسورد خالص.
  (async function(){
    if(!firebase.auth().currentUser){
      try{ await tryAutoBranchLogin(); }catch(e){ console.warn('auto login', e); }
    }
  })();
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
    canEditInventory: true, canReceiveGoods: true, canChangePrices: true, canViewReports: true, canManageRoles: true, canSwitchBranch: true,
    canDiscount: true, canOpenDrawer: true, canReverse: true, canRedeemManual: true, maxDiscountPct: 100
  },
  cashier: {
    label: 'كاشير', canSell: true, canHold: true, canPrintLabel: true,
    canViewCostPrice: false, canViewStock: true, canViewLogs: false, canRefund: false, canResetCustomerPin: false,
    canEditInventory: false, canReceiveGoods: true, canChangePrices: false, canViewReports: false, canManageRoles: false, canSwitchBranch: false,
    // 🎁 الاستبدال اليدوي مقفول على الكاشير — الاستبدال بيتطلب من التطبيق
    canDiscount: false, canOpenDrawer: false, canReverse: false, canRedeemManual: false, maxDiscountPct: 0
  },
  supervisor: {
    label: 'مشرف', canSell: true, canHold: true, canPrintLabel: true,
    canViewCostPrice: false, canViewStock: true, canViewLogs: true, canRefund: true, canResetCustomerPin: true,
    canEditInventory: false, canReceiveGoods: true, canChangePrices: false, canViewReports: false, canManageRoles: false, canSwitchBranch: false,
    canDiscount: true, canOpenDrawer: true, canReverse: true, canRedeemManual: true, maxDiscountPct: 20
  },
  manager: {
    label: 'مدير', canSell: true, canHold: true, canPrintLabel: true,
    canViewCostPrice: true, canViewStock: true, canViewLogs: true, canRefund: true, canResetCustomerPin: true,
    canEditInventory: true, canReceiveGoods: true, canChangePrices: true, canViewReports: true, canManageRoles: true, canSwitchBranch: false,
    canDiscount: true, canOpenDrawer: true, canReverse: true, canRedeemManual: true, maxDiscountPct: 100
  }
};
// 👑 أدمن ثابت مدمج في الكود — مستقل تمامًا عن الموظفين وقاعدة البيانات.
// بيظهر دايمًا في شاشة الدخول لكل الفروع، وبصلاحيات أدمن كاملة، ومستحيل يتمسح بأي تصفير.
// غيّر الـ PIN من هنا لما تحب (رقم سري بينك وبين نفسك).
// 👑 الأدمن الثابت — القيم دي افتراضية، والمالك يقدر يغيّرها من شاشة الإعدادات
// (بتتحفظ في settings/owner_admin؛ لو الداتا اتصفّرت بيرجع للافتراضي ده وده تصرّف آمن)
const FIXED_ADMIN_DEFAULTS = { id: '__owner_admin__', name: '👑 المالك (أدمن)', pin: '0000', _admin: true, active: true };
const FIXED_ADMIN = { ...FIXED_ADMIN_DEFAULTS };

// بيحمّل اسم/PIN المالك المخصّص (لو اتغيّروا) — بيتنده قبل رسم شاشة الدخول
async function loadOwnerAdminConfig(){
  try{
    const d = await db.collection(TEST_SETTINGS).doc('owner_admin').get();
    if(d.exists){
      const c = d.data() || {};
      if(c.name) FIXED_ADMIN.name = c.name;
      if(c.pin)  FIXED_ADMIN.pin  = c.pin;
    }
  }catch(e){ /* فشل التحميل → نفضل على الافتراضي */ }
}

// 🔐 تغيير اسم/رقم المالك — بيتطلب الـ PIN الحالي للتأكيد
async function saveOwnerAdminConfig(currentPin, newName, newPin){
  if(String(currentPin) !== String(FIXED_ADMIN.pin)) return { ok:false, msg:'الرقم الحالي غلط' };
  if(newPin && !/^\d{4,8}$/.test(String(newPin))) return { ok:false, msg:'الرقم الجديد لازم يكون من 4 لـ 8 أرقام' };
  const payload = {};
  if(newName && newName.trim()) payload.name = newName.trim();
  if(newPin) payload.pin = String(newPin);
  if(!Object.keys(payload).length) return { ok:false, msg:'مفيش حاجة اتغيّرت' };
  try{
    await db.collection(TEST_SETTINGS).doc('owner_admin').set(payload, { merge:true });
    if(payload.name) FIXED_ADMIN.name = payload.name;
    if(payload.pin)  FIXED_ADMIN.pin  = payload.pin;
    return { ok:true };
  }catch(e){ return { ok:false, msg:'تعذر الحفظ: ' + e.message }; }
}

let rolePermissions = JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS));
let currentEmployeeRole = 'cashier'; // fallback until loaded

// بيرجع صلاحيات الموظف الحالي (كائن bool)، مبني على دوره المخصص.
function myPerms(){
  const role = currentEmployeeRole;
  const def  = DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.cashier;
  const saved = rolePermissions[role];
  if(!saved) return def;
  // ⚠️ المستند المحفوظ بيحتوي المفاتيح اللي اتعلّمت في شاشة الأدوار بس.
  // أي حقل مش موجود فيه (زي maxDiscountPct) لازم ياخد قيمته الافتراضية —
  // من غير كده بيتقرا undefined ويتحسب صفر فالخصم بيترفض دايمًا.
  return Object.assign({}, def, saved);
}
function hasPerm(key){
  return !!myPerms()[key];
}

// تحميل صلاحيات الأدوار بس (للأدمن الثابت — من غير تحديد دور من _assignments)
async function loadRolePermsOnly(){
  try{
    const rolesSnap = await db.collection(TEST_ROLES).get();
    rolesSnap.forEach(d=>{
      if(rolePermissions[d.id]) rolePermissions[d.id] = { ...rolePermissions[d.id], ...d.data() };
    });
  }catch(e){ /* افتراضي */ }
  // الأدمن الثابت دايمًا admin كامل مهما اتخصّصت الأدوار
  rolePermissions.admin = { ...DEFAULT_ROLE_PERMISSIONS.admin, ...(rolePermissions.admin||{}) };
  rolePermissions.admin.canManageRoles = true;
  rolePermissions.admin.canViewReports = true;
  rolePermissions.admin.canSwitchBranch = true;
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

// ============================================================
// 🕕 يوم الشغل (Business Day)
// المحل بيفضل فاتح بعد نص الليل، فالبيعة الساعة 2 الفجر تخص يوم أمس.
// الساعة الفاصلة بتتحدد من الإعدادات (الافتراضي 6 صباحًا):
//   أي وقت قبلها ينتمي لليوم اللي فات.
// ⚠️ الفواتير القديمة متسابة بتاريخها التقويمي بقرار المالك.
// ============================================================
let businessDayStartHour = 6;   // بيتحدّث من pos_test_settings/day_cfg
window.businessDayStartHour = 6;

// 🌍 توقيت المحل ثابت (القاهرة) مش ساعة الجهاز:
// المالك بيفتح السيستم من بره مصر أحيانًا — بساعة الجهاز كانت "بداية اليوم"
// بتتزحزح بفرق التوقيت، فبيشوف فواتير وأرقام مختلفة عن اللي الكاشير شايفه
// (وبانر الفواتير المتأخرة بيطلع أرقام مضللة). دلوقتي كل الأجهزة في أي حتة
// في العالم بتحسب اليوم بتوقيت مصر — الكل شايف نفس الأرقام بالظبط.
const SHOP_TZ = 'Africa/Cairo';
const _tzFmt = (function(){
  try{
    return new Intl.DateTimeFormat('en-GB', { timeZone: SHOP_TZ,
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
  }catch(e){ return null; }   // جهاز قديم من غير Intl → فولباك ساعة الجهاز
})();
function _shopClock(ms){
  // الساعة الحيطة بتوقيت المحل للحظة معينة {y,m,d,h,min,s}
  const out = {};
  _tzFmt.formatToParts(new Date(ms)).forEach(function(p){
    if(p.type !== 'literal') out[p.type] = parseInt(p.value, 10);
  });
  if(out.hour === 24) out.hour = 0;   // en-GB بيطلّع نص الليل "24"
  return { y: out.year, m: out.month, d: out.day, h: out.hour, min: out.minute, s: out.second };
}
function _shopWallToMs(y, m, d, h){
  // تحويل "الساعة h يوم y-m-d بتوقيت المحل" لطابع مطلق — تخمينتين عشان
  // فرق الصيفي/الشتوي (الإزاحة بتتحسب من نفس اللحظة المستهدفة)
  function offAt(ms){
    const c = _shopClock(ms);
    return Date.UTC(c.y, c.m - 1, c.d, c.h, c.min, c.s) - Math.floor(ms / 1000) * 1000;
  }
  let guess = Date.UTC(y, m - 1, d, h) - offAt(Date.now());
  guess = Date.UTC(y, m - 1, d, h) - offAt(guess);
  return guess;
}

function bizDayStartMs(now){
  const t = (now == null) ? Date.now()
          : (now instanceof Date) ? now.getTime() : Number(now);
  const h = Number(businessDayStartHour);
  const cut = (isNaN(h) || h < 0 || h > 23) ? 6 : h;
  if(!_tzFmt){
    // فولباك الجهاز القديم — نفس السلوك القديم بالظبط
    const d = new Date(t);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), cut, 0, 0, 0);
    if(d.getTime() < start.getTime()) start.setDate(start.getDate() - 1);
    return start.getTime();
  }
  const c = _shopClock(t);
  let y = c.y, m = c.m, d = c.d;
  // لسه مجاش وقت البداية النهاردة (بتوقيت المحل) → إحنا في يوم أمس
  if(c.h < cut){
    const prev = new Date(Date.UTC(y, m - 1, d));
    prev.setUTCDate(prev.getUTCDate() - 1);
    y = prev.getUTCFullYear(); m = prev.getUTCMonth() + 1; d = prev.getUTCDate();
  }
  return _shopWallToMs(y, m, d, cut);
}
function bizDayKey(ts){
  const start = bizDayStartMs(ts == null ? Date.now() : ts);
  const p = (n)=> String(n).padStart(2,'0');
  if(!_tzFmt){
    const d = new Date(start);
    return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
  }
  const c = _shopClock(start + 60000);   // دقيقة بعد البداية — جوه اليوم أكيد
  return c.y + '-' + p(c.m) + '-' + p(c.d);
}
function isSameBizDay(a, b){
  if(!a) return false;
  return bizDayKey(a) === bizDayKey(b == null ? Date.now() : b);
}
window.bizDayStartMs = bizDayStartMs;
window.bizDayKey = bizDayKey;
window.isSameBizDay = isSameBizDay;

// 🔎 تطبيع البحث العربي — سبب "بكتب الاسم ومش بيظهر لازم الكود":
// الاسم متسجل "تايلاندي" والكاشير بتكتب "تايلاندى" (ى/ي)، أو "بيجامه/بيجامة"،
// أو همزة مختلفة (أ/إ/آ/ا)، أو مسافة زيادة — المقارنة الحرفية بتفشل وهو نفس الاسم.
// ⚡ ذاكرة تطبيع الأسماء.
// 🔴 المشكلة: كل ضغطة زرار في شاشة البيع كانت بتعيد تطبيع **اسم كل صنف في
// المخزون من الأول** — 7 عمليات regex × عدد الأصناف × كل حرف بيتكتب.
// بالقياس: 8000 صنف = 19.6 مللي/ضغطة · 20000 = 50 مللي (على معالج سيرفر —
// جهاز الكاشير أبطأ بمرات). ده اللاج اللي الكاشير بتشتكي منه.
// الأسماء ثابتة بين الضغطات، فأول تطبيع بيتخزن والباقي قراءة من الذاكرة.
// ⚠️ التطبيع نفسه ما اتغيرش ولا حرف — نفس النتيجة بالظبط، أسرع بس.
// 🧪 الذاكرة متعلّقة على الدالة نفسها (searchNorm._c) مش متغير برّاني —
//    الاختبارات بتستخرج الدوال فرادى، وأي حالة برّانية بتوقّع الهارنس.
function searchNorm(s){
  const k = String(s || '');
  const c = searchNorm._c || (searchNorm._c = new Map());
  const hit = c.get(k);
  if(hit !== undefined) return hit;
  const v = k.toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')   // التشكيل والتطويل ـــ
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0624/g, '\u0648')
    .replace(/\s+/g, ' ').trim();
  if(c.size > 40000) c.clear();          // سقف أمان — المخزون مش بيوصله
  c.set(k, v);
  return v;
}
// كل كلمة اتكتبت لازم تتلاقى — بأي ترتيب: "قطن كويت" بتلاقي "قطن تايلاندي كويت ليدي"
// ⚡ كلمات البحث بتتقطّع مرة واحدة لكل استعلام مش مرة لكل صنف
function searchMatch(hay, q){
  if(q !== searchMatch._q){
    searchMatch._q = q;
    searchMatch._parts = searchNorm(q).split(' ').filter(Boolean);
  }
  const parts = searchMatch._parts;
  if(!parts || parts.length === 0) return false;
  const h = searchNorm(hay);
  for(let i = 0; i < parts.length; i++){
    if(h.indexOf(parts[i]) < 0) return false;   // خروج بدري
  }
  return true;
}
// 🔢 مطابقة الكود بالبداية — مش بالاحتواء.
// الباج الأصلي: البحث بـ"33" كان بيطلّع 533 و833 و1330 كمان، فالكاشير لازم
// تكتب الكود كامل أو تدوّر بعينها في قايمة نتايج غلط. المطلوب: "33" تلاقي 33
// و330 (امتداد وانت بتكتب) وبس. المطابقة التامة بتتقدّم في الترتيب عند النداء.
// ⚠️ الدالة دي ليها بدايل احتياطية (_bp) في pos-sale/products/search/pos-admin —
// البدايل حزام أمان للحظة تحميل ملفات مختلطة، مش بديل دايم. لو الدالة ضاعت من
// هنا تاني، البحث بيرجع لسلوك أبسط من غير أي رسالة خطأ.
function barcodePrefix(bc, q){
  const b = String(bc == null ? '' : bc).toLowerCase().trim();
  const s = String(q  == null ? '' : q ).toLowerCase().trim();
  if(!s || !b) return false;          // بحث فاضي = مفيش نتايج (مش "كل حاجة")
  return b.startsWith(s);
}
window.searchNorm = searchNorm;
window.searchMatch = searchMatch;
window.barcodePrefix = barcodePrefix;

// قراءة الساعة الفاصلة من الإعدادات
// ============================================================
// 📦 إعداد المخزون السالب — `pos_test_settings/inventory_cfg`
// ------------------------------------------------------------
// { allowNegativeStock: true|false }   (الافتراضي: **false**)
//
// ⚠️ ده إعداد مقصود إنه يفضل **مقفول** في أي محل جديد يشتري النظام.
//    مخزون سالب معناه إن الأرقام مش مطابقة للواقع، وده وضع مؤقت مش صحّي.
//
// المالك فتحه لفروعه لسبب محدد: شاشة **استلام البضاعة** بتتسجل فيها
// كمان القطع **التالفة** بكمية سالبة، والتالف غالبًا صنف رصيده في
// النظام صفر (لأن الجرد لسه ماتعملش). المنع كان بيوقّف تسجيل التالف
// أصلًا — يعني بيخلي الأرقام **أبعد** عن الواقع مش أقرب.
//
// 🔓 لما الجرد الفعلي يتعمل، الإعداد ده يترجع false.
// 🔒 عند بيع النظام لمحل تاني: مايتفتحش. الافتراضي هو الصح.
//
// ملحوظة: البيع في شاشة الكاشير مسموح ينزّل المخزون سالب **دايمًا**
// (قرار قديم منفصل) — الإعداد ده بيخص شاشات المخزون بس.
// ============================================================
let allowNegativeStock = false;
window.allowNegativeStock = false;
(function loadInventoryCfg(){
  try{
    db.collection(TEST_SETTINGS).doc('inventory_cfg').onSnapshot(function(snap){
      const v = snap.exists ? !!(snap.data()||{}).allowNegativeStock : false;
      allowNegativeStock = v;
      window.allowNegativeStock = v;
    }, function(e){ console.warn('inventory_cfg', e && e.code); });
  }catch(e){ console.warn('inventory_cfg listen', e); }
})();

(function loadDayCfg(){
  try{
    db.collection(TEST_SETTINGS).doc('day_cfg').onSnapshot(function(snap){
      const v = snap.exists ? Number((snap.data()||{}).startHour) : NaN;
      if(!isNaN(v) && v >= 0 && v <= 23){
        businessDayStartHour = v;
        window.businessDayStartHour = v;
      }
    }, function(e){ console.warn('day_cfg', e && e.code); });
  }catch(e){ console.warn('day_cfg listen', e); }
})();

// ============================================================
// 🔄 التحديث التلقائي (من غير قفل وفتح)
// النسخة الجديدة بتنزل في الخلفية وتستنى. الشريط بيظهر بس لما
// الشاشة تكون فاضية — مش في نص فاتورة ولا وسط تأكيد فيزا.
// ============================================================
let _swReg = null, _swWaiting = null, _updBarShown = false;

// الشاشة فاضية = مفيش شغل ممكن يضيع
function updSafeNow(){
  try{
    if(typeof cart !== 'undefined' && cart && cart.length) return false;      // سلة فيها منتجات
    if(typeof paymobPending !== 'undefined' && paymobPending) return false;   // فيزا مستنية
    if(document.querySelector('.modal-overlay.active')) return false;         // نافذة مفتوحة
    if(document.getElementById('askTextOverlay')) return false;
    if(document.getElementById('editItemOverlay')) return false;
    return true;
  }catch(e){ return false; }
}

function showUpdateBar(){
  if(_updBarShown || !_swWaiting) return;
  if(!updSafeNow()) return;                 // مش وقته — هنجرب تاني بعد شوية
  _updBarShown = true;
  const bar = document.createElement('div');
  bar.id = 'updBar';
  bar.style.cssText = 'position:fixed; left:0; right:0; bottom:0; z-index:14000;'
    + 'background:linear-gradient(135deg,#1D4ED8,#1E40AF); color:#fff;'
    + "padding:14px 18px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;"
    + "font-family:'Cairo',sans-serif; box-shadow:0 -6px 22px rgba(0,0,0,.28);"
    + 'transform:translateY(100%); transition:transform .35s ease;';
  bar.innerHTML =
    '<div style="flex:1; min-width:180px;">'
    + '<div style="font-weight:900; font-size:15px;">🔄 فيه تحديث جاهز</div>'
    + '<div style="font-size:12px; opacity:.9;">هيتفعّل في ثانية — من غير ما تقفل البرنامج</div>'
    + '</div>'
    + '<button id="updNow" style="padding:11px 22px; border:none; border-radius:10px;'
    + " background:#fff; color:#1D4ED8; font-family:'Cairo'; font-weight:900; font-size:14px;"
    + ' cursor:pointer;">فعّل التحديث</button>'
    + '<button id="updLater" style="padding:11px 16px; border:1px solid rgba(255,255,255,.45);'
    + " border-radius:10px; background:transparent; color:#fff; font-family:'Cairo';"
    + ' font-weight:700; font-size:13px; cursor:pointer;">بعدين</button>';
  document.body.appendChild(bar);
  setTimeout(function(){ bar.style.transform = 'translateY(0)'; }, 40);

  bar.querySelector('#updNow').addEventListener('click', function(){
    bar.querySelector('#updNow').textContent = 'بيحدّث…';
    try{ _swWaiting.postMessage({ type:'SKIP_WAITING' }); }catch(e){ location.reload(); }
  });
  bar.querySelector('#updLater').addEventListener('click', function(){
    bar.style.transform = 'translateY(100%)';
    setTimeout(function(){ bar.remove(); _updBarShown = false; }, 350);
  });
}
window.showUpdateBar = showUpdateBar;

// ============================================================
// 📡 إشارة التحديث الفورية
// السؤال كل 10 دقايق كان بيخلي الشريط يتأخر. دلوقتي: المالك يدوس
// "أبلغ الأجهزة" → الرقم بيتغيّر في Firestore → كل جهاز سامع بيسأل فورًا.
// وكل جهاز بيسجّل نسخته عشان تعرف مين اتحدّث ومين لأ.
// ============================================================
const APP_VERSION = (typeof CACHE_NAME_HINT !== 'undefined') ? CACHE_NAME_HINT : null;
let _updSignalSeen = null;

function reportMyVersion(){
  try{
    if(!currentBranch || !db) return;
    const v = (document.getElementById('verBadge') || {}).textContent || '';
    db.collection(TEST_SETTINGS).doc('device_versions').set({
      [currentBranch + '|' + (navigator.userAgent.slice(-24) || 'dev')]: {
        branch: currentBranch, version: v.trim(), at: Date.now()
      }
    }, { merge:true }).catch(function(){});
  }catch(e){}
}

function watchUpdateSignal(reg){
  try{
    db.collection(TEST_SETTINGS).doc('app_release').onSnapshot(function(snap){
      const sig = snap.exists ? (snap.data().signal || 0) : 0;
      if(_updSignalSeen === null){ _updSignalSeen = sig; return; }   // أول قراءة
      if(sig === _updSignalSeen) return;
      _updSignalSeen = sig;
      // 📡 وصلت إشارة → نسأل عن التحديث فورًا بدل ما نستنى الدورة
      try{ reg.update(); }catch(e){}
    }, function(e){ console.warn('release watch', e && e.code); });
  }catch(e){ console.warn('release watch init', e); }
}

// 📢 المالك بيدوس الزرار ده بعد ما يرفع — الأجهزة بتعرف في ثانية
async function notifyDevicesUpdate(){
  try{
    await db.collection(TEST_SETTINGS).doc('app_release')
      .set({ signal: Date.now(), by: currentBranch || '' }, { merge:true });
    showToast('📡 اتبلغت كل الأجهزة — الشريط هيظهر عندهم دلوقتي', 'ok');
  }catch(e){ showToast('تعذر الإبلاغ: ' + (e.message || e), 'err'); }
}
window.notifyDevicesUpdate = notifyDevicesUpdate;

// 📋 مين اتحدّث ومين لأ
async function showDeviceVersions(){
  try{
    const snap = await db.collection(TEST_SETTINGS).doc('device_versions').get();
    const data = snap.exists ? snap.data() : {};
    const rows = Object.values(data).sort(function(a,b){ return (b.at||0) - (a.at||0); });
    if(!rows.length){ showToast('لسه مفيش أجهزة سجّلت نسختها', 'err'); return; }
    const newest = rows.map(function(r){ return r.version || ''; }).sort().pop();
    const html = rows.map(function(r){
      const old = (r.version || '') !== newest;
      const mins = Math.round((Date.now() - (r.at||0)) / 60000);
      return '<div style="display:flex; justify-content:space-between; align-items:center;'
        + 'padding:9px 11px; border-radius:9px; margin-bottom:5px;'
        + 'background:' + (old ? '#fef2f2' : '#ecfdf5') + ';'
        + 'border:1px solid ' + (old ? '#fca5a5' : '#6ee7b7') + ';">'
        + '<span style="font-weight:700; font-size:13px;">' + (r.branch || '—') + '</span>'
        + '<span style="font-size:12px; font-weight:800; color:' + (old ? '#B91C1C' : '#047857') + ';">'
        + (r.version || '؟') + (old ? ' ⚠️ قديمة' : ' ✅') + '</span>'
        + '<span style="font-size:10.5px; color:#6b7280;">' + (mins < 60 ? (mins + ' د') : (Math.round(mins/60) + ' س')) + '</span>'
        + '</div>';
    }).join('');
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed; inset:0; z-index:13800; background:rgba(0,0,0,.8);'
      + 'display:flex; align-items:center; justify-content:center; padding:20px;';
    box.innerHTML = '<div style="background:#fff; border-radius:16px; padding:20px;'
      + "max-width:420px; width:100%; font-family:'Cairo',sans-serif;\">"
      + '<div style="font-weight:900; font-size:16px; margin-bottom:12px;">📋 نسخ الأجهزة</div>'
      + html
      + '<button onclick="this.closest(\'div[style*=fixed]\').remove()"'
      + " style=\"width:100%; margin-top:12px; padding:12px; border:none; border-radius:11px;"
      + " background:#2f3545; color:#fff; font-family:'Cairo'; font-weight:800; cursor:pointer;\">إغلاق</button>"
      + '</div>';
    document.body.appendChild(box);
  }catch(e){ showToast('تعذر التحميل: ' + (e.message || e), 'err'); }
}
window.showDeviceVersions = showDeviceVersions;

function initAutoUpdate(){
  if(!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(function(reg){
    _swReg = reg;
    // نسخة مستنية موجودة خلاص
    if(reg.waiting){ _swWaiting = reg.waiting; showUpdateBar(); }
    // نسخة جديدة بتنزل دلوقتي
    reg.addEventListener('updatefound', function(){
      const nw = reg.installing;
      if(!nw) return;
      nw.addEventListener('statechange', function(){
        if(nw.state === 'installed' && navigator.serviceWorker.controller){
          _swWaiting = nw;
          showUpdateBar();
        }
      });
    });
    // 📡 إشارة فورية من المالك (الأساس) + سؤال كل 10 دقايق كشبكة أمان
    watchUpdateSignal(reg);
    setInterval(function(){ try{ reg.update(); }catch(e){} }, 10*60*1000);
    setTimeout(reportMyVersion, 4000);
    setInterval(reportMyVersion, 30*60*1000);
  }).catch(function(e){ console.warn('sw register', e); });

  // أول ما النسخة الجديدة تشتغل، الصفحة بتتحدث مرة واحدة بس
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', function(){
    if(reloaded) return;
    reloaded = true;
    // 🔐 نتأكد إن جلسة الفرع موجودة قبل ما نعيد التحميل — عشان الصفحة
    // ما تفتحش على شاشة الإيميل. ومهلة قصيرة عشان ما نعلّقش لو النت واقع.
    const go = function(){ location.reload(); };
    try{
      if(firebase.auth().currentUser){ go(); return; }
      Promise.race([
        tryAutoBranchLogin(),
        new Promise(function(r){ setTimeout(r, 2500); })
      ]).then(go).catch(go);
    }catch(e){ go(); }
  });

  // لو الشريط استنى عشان الشاشة مكانتش فاضية، بنجرب كل نص دقيقة
  setInterval(function(){ if(_swWaiting && !_updBarShown) showUpdateBar(); }, 30000);
}
if(typeof window !== 'undefined'){
  window.initAutoUpdate = initAutoUpdate;
  if(document.readyState === 'complete') initAutoUpdate();
  else window.addEventListener('load', initAutoUpdate);
}

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if(typeof injectUnifiedToolbars === 'function') try{ injectUnifiedToolbars(); }catch(e){}
  try{ clearStuckOverlays(id); }catch(e){ console.warn('overlays', e); }
  // 🏷️ شارة النسخة تبان في الشاشة الرئيسية بس
  document.body.classList.toggle('on-dashboard', id === 'dashboardScreen');
  // 💚 مؤشر اتصال شاشة التقييم — بيبدأ أول ما نوصل شاشة البيع
  if(id === 'saleScreen' && typeof capWatchAlive === 'function'){
    try{ capWatchAlive(); }catch(e){ console.warn('cap alive', e); }
  }
  // 🎁 زرار إيصال الهدية بيظهر بس لو فيه فاتورة قريبة
  if(id === 'saleScreen' && typeof refreshGiftBtn === 'function'){
    try{ refreshGiftBtn(); }catch(e){ console.warn('gift btn', e); }
  }
}

// 🧹 تنضيف النوافذ العالقة
// المشكلة: لو نافذة اتقفلت بطريقة غير متوقعة، بتفضل طبقة شفافة فوق الشاشة
// بتبلع الكتابة والضغط — الشكل عادي بس مفيش حاجة بتستجيب، والحل الوحيد
// كان الخروج والدخول. بننضّف أي بقايا مع كل تنقل بين الشاشات.
// ============================================================
// 🪟 استرجاع تركيز الويندوز بعد أي نافذة طباعة
// ------------------------------------------------------------
// 🔴 الشكوى: «السيستم بيقف عن الكتابة في كل الشاشات — لازم نفتح QuickBooks
//    ونكتب فيه ونرجع». ده **مش** ضياع تركيز جوه الصفحة: الرجوع من برنامج
//    تاني كان هيرجّع نفس الحالة الباظة. ده الويندوز نفسه مش بيوصّل الحروف
//    للنافذة.
// السبب: البرنامج بيفتح نوافذ منبثقة للطباعة (8 مواضع). كل واحدة بتاخد
//    تركيز نظام التشغيل. لما تتقفل، الويندوز بيقرر لوحده التركيز يروح فين —
//    وساعات بيفضل على نافذة اتقفلت، فالنافذة الرئيسية شكلها شغال بس
//    الكيبورد مش بيوصلها. فتح QuickBooks بيجبر الويندوز يعيد التوزيع.
//
// الدالة دي بتتنادى بعد فتح أي نافذة طباعة: بترجّع التركيز للنافذة الرئيسية
// وللخانة اللي كان الكاشير واقف فيها، وبتحاول مرتين (الطباعة بتتأخر أحيانًا).
// ============================================================
function reclaimWindowFocus(afterMs){
  const el = document.activeElement;
  const back = function(){
    try{ window.focus(); }catch(e){}
    try{
      if(el && typeof el.focus === 'function' && document.contains(el)
         && el !== document.body){ el.focus(); return; }
    }catch(e){}
    // مفيش خانة نرجعله؟ خانة البحث لو شاشة البيع مفتوحة
    try{
      const sc = document.getElementById('saleScreen');
      const sb = document.getElementById('searchBar');
      if(sc && sc.offsetParent !== null && sb && sb.offsetParent !== null) sb.focus();
    }catch(e){}
  };
  const t = Math.max(300, Number(afterMs) || 500);
  setTimeout(back, t + 400);
  setTimeout(back, t + 1800);   // محاولة تانية لو نافذة الطباعة اتأخرت
}
window.reclaimWindowFocus = reclaimWindowFocus;

// ============================================================
// 🎯 حارس التركيز — مسح شامل لكل الطرق اللي بيضيع بيها
// ------------------------------------------------------------
// الشكوى: الكتابة/المسح بيقفوا فجأة، والحل اليدوي كان الدوس على أيقونة
// البرنامج في شريط ويندوز. التركيز بيضيع بأكتر من طريق:
//   ١) نافذة الطباعة أو ماكينة الكارت أو حوار ويندوز بتاخده وترجّعه
//      **للنافذة** من غير ما ترجّعه لخانة جواها
//   ٢) confirm/alert — بيرجّعوا التركيز للصفحة مش للخانة
//   ٣) عنصر عليه التركيز بيتخفي (خانة الاسم بتتقفل مع تغيّر الحالة)
//   ٤) عنصر عليه التركيز بيتشال مع إعادة رسم (السلة · مكان الزرار)
//   ٥) نافذة بتتقفل وماحدش رجّع التركيز لحد
// كلهم بينتهوا لنفس النتيجة: activeElement = body، والماسح بيقرا في الهوا.
// الحارس بيمسك النتيجة دي نفسها — فبيغطي أي طريق جديد كمان.
// ============================================================
function _focusIsLost(){
  const a = document.activeElement;
  if(!a || a === document.body || a === document.documentElement) return true;
  const t = String(a.tagName || '').toUpperCase();
  return !(t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || a.isContentEditable);
}
// 🛡️ مفيش نافذة/حوار مفتوح؟ عشان ما نخطفش التركيز من موديل
// (بالاصطلاح المتّبع في المشروع: أي id بينتهي بـModal أو Overlay + .modal)
function _focusBlocked(){
  try{
    const list = document.querySelectorAll('[id$="Modal"], [id$="Overlay"], .modal, [role="dialog"]');
    for(let i = 0; i < list.length; i++){
      if(list[i] && list[i].offsetParent !== null) return true;
    }
  }catch(e){}
  return false;
}
function _focusTarget(){
  const sc = document.getElementById('saleScreen');
  if(!sc || sc.offsetParent === null) return null;      // مش في شاشة البيع
  const sb = document.getElementById('searchBar');
  return (sb && sb.offsetParent !== null) ? sb : null;
}
function _focusRescue(){
  if(!_focusIsLost()) return false;                     // الكاشير ماسكة خانة
  if(_focusBlocked()) return false;
  const t = _focusTarget();
  if(!t) return false;
  try{ t.focus(); }catch(e){ return false; }
  return true;
}
window._focusIsLost = _focusIsLost;
window._focusBlocked = _focusBlocked;
window._focusRescue  = _focusRescue;

// ⌨️ إنقاذ الضربة نفسها: لو الماسح ضرب والتركيز ضايع، الحرف الأول كان
//    بيضيع حتى بعد ما نرجّع التركيز. هنا بنرجّع التركيز **ونحط الحرف**.
document.addEventListener('keydown', function(e){
  if(!_focusIsLost() || _focusBlocked()) return;
  if(e.ctrlKey || e.altKey || e.metaKey) return;
  const t = _focusTarget();
  if(!t) return;
  if(e.key && e.key.length === 1){
    e.preventDefault();
    t.focus();
    t.value = (t.value || '') + e.key;
    try{ t.dispatchEvent(new Event('input', { bubbles:true })); }catch(_e){}
  }else if(e.key === 'Enter' || e.key === 'Backspace'){
    t.focus();                                          // من غير منع — يكمّل عادي
  }
}, true);

// ① رجوع النافذة من نافذة تانية (طباعة · ماكينة كارت · حوار ويندوز)
window.addEventListener('focus', function(){ setTimeout(_focusRescue, 120); });
document.addEventListener('visibilitychange', function(){
  if(!document.hidden) setTimeout(_focusRescue, 160);
});
// ② أي دوسة في مكان مش خانة
document.addEventListener('pointerdown', function(e){
  setTimeout(function(){
    try{ if(e.target && e.target.closest && e.target.closest('input,textarea,select')) return; }catch(_e){}
    _focusRescue();
  }, 60);
}, true);
// ③ عنصر عليه التركيز اتشال أو اتخفى (إعادة رسم السلة · قفل خانة الاسم)
document.addEventListener('focusout', function(){
  setTimeout(function(){
    // بس لو التركيز مراحش لحاجة تانية
    if(_focusIsLost()) _focusRescue();
  }, 90);
}, true);
// ④ شبكة أمان دورية — بتغطي أي طريق مالناش خبر بيه
setInterval(function(){
  try{
    if(document.hidden) return;
    if(typeof document.hasFocus === 'function' && !document.hasFocus()) return;  // النافذة نفسها مش نشطة
    _focusRescue();
  }catch(e){}
}, 1500);

function clearStuckOverlays(screenId){
  // نوافذ بنبنيها في اللحظة — لو فاضلة يبقى حصل خطأ، بنشيلها
  ['askTextOverlay','changeConfirmOverlay','cancelTerminalOverlay','avPickOverlay']
    .forEach(function(elId){
      const el = document.getElementById(elId);
      if(el) el.remove();
    });
  // النوافذ الثابتة اللي بتتقفل بكلاس
  document.querySelectorAll('.modal-overlay.active').forEach(function(m){
    m.classList.remove('active');
  });
  // التركيز يرجع لبار البحث في شاشة البيع عشان المسح يشتغل فورًا
  if(screenId === 'saleScreen'){
    setTimeout(function(){
      const sb = document.getElementById('searchBar');
      if(sb && !document.querySelector('.modal-overlay.active')){
        try{ sb.focus(); }catch(e){}
      }
    }, 80);
  }
}
window.clearStuckOverlays = clearStuckOverlays;

// 🆘 مخرج طوارئ: Escape مرتين ورا بعض بينضّف الشاشة من أي نافذة عالقة
(function(){
  let lastEsc = 0;
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Escape') return;
    const now = Date.now();
    if(now - lastEsc < 700){
      lastEsc = 0;
      try{
        clearStuckOverlays('saleScreen');
        if(typeof showToast === 'function') showToast('🧹 اتنضفت الشاشة', 'ok');
      }catch(err){}
    } else { lastEsc = now; }
  });
})();
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
    await loadOwnerAdminConfig();   // 👑 نجيب اسم/رقم المالك المخصّص لو اتغيّروا
    const snap = await db.collection(EMPLOYEES_COLLECTION).where('branch','==', currentBranch).get();
    const emps = snap.docs.map(d=>({id:d.id, ...d.data()})).filter(e=> e.active !== false);

    // (اتلغى الأدمن العام القديم بتاع كروت الموظفين — الأدمن الثابت تحت بيغطّي الدور ده)
    const allEmps = [FIXED_ADMIN].concat(emps);
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
    // 👑 الأدمن الثابت: تحقق محلي، مفيش قاعدة بيانات، دور admin كامل
    if(selectedLoginEmp.id === FIXED_ADMIN.id){
      if(pin !== FIXED_ADMIN.pin){
        errBox.textContent = "الـ PIN غلط، حاول تاني";
        document.getElementById('pinInput').value = '';
        return;
      }
      currentEmployee = { id: FIXED_ADMIN.id, name: FIXED_ADMIN.name, isAdminAccount: true };
      currentEmployeeRole = 'admin';
      errBox.textContent = "";
      document.getElementById('pinInput').value = '';
      try{ await loadRolePermsOnly(); }catch(e){}
      enterDashboard();
      return;
    }
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

// ---------- 🎫 الدخول بمسح كارت الموظف ----------
// السكانر بيكتب الكود بسرعة + Enter — بنلقطه من أي مكان في شاشة الدخول
// (حتى لو المؤشر جوّه خانة الـ PIN) ونفرّقه عن الكتابة اليدوية بسرعة الضربات
let _cardBuf = '', _cardLastKey = 0;
function _loginScreenVisible(){
  const el = document.getElementById('loginScreen');
  return !!(el && el.offsetParent !== null);
}
document.addEventListener('keydown', function(e){
  if(!_loginScreenVisible()) return;
  const now = Date.now();
  if(now - _cardLastKey > 90) _cardBuf = '';   // وقفة طويلة = كتابة يد، نبدأ من جديد
  _cardLastKey = now;
  if(e.key === 'Enter'){
    const code = _cardBuf; _cardBuf = '';
    if(/^EC[A-Z2-9]{10}$/.test(code)){
      e.preventDefault(); e.stopPropagation();
      const pinInp = document.getElementById('pinInput');
      if(pinInp) pinInp.value = '';   // نشيل حروف السكانر اللي وقعت في خانة الـ PIN
      cardLogin(code);
    }
    return;
  }
  { const _c = (typeof _scanChar==='function') ? _scanChar(e) : ((e.key&&e.key.length===1)?e.key:''); if(_c) _cardBuf += _c.toUpperCase(); }
  if(_cardBuf.length > 20) _cardBuf = _cardBuf.slice(-20);
}, true);

async function cardLogin(code){
  const errBox = document.getElementById('loginErr');
  if(errBox) errBox.textContent = '🎫 جارٍ التحقق من الكارت...';
  try{
    const snap = await db.collection(EMPLOYEES_COLLECTION).where('cardCode','==',code).limit(1).get();
    if(snap.empty){
      if(errBox) errBox.textContent = 'الكارت ده مش متسجّل (لو اتعملك كارت جديد، القديم اتبطّل)';
      return;
    }
    const doc = snap.docs[0];
    currentEmployee = { id: doc.id, ...doc.data() };
    if(errBox) errBox.textContent = '';
    await loadCurrentEmployeeRole();
    enterDashboard();
    showToast('أهلًا ' + (currentEmployee.name||'') + ' 🎫');
  }catch(e){
    if(errBox) errBox.textContent = 'خطأ في الاتصال: ' + e.message;
  }
}

async function logout(){
  // خروج الموظف لا يمسح أي queue، لكن بنرفض الخروج لو فيه كتابة لسه
  // ما وصلتش للسيرفر عشان الشاشة ما تديش إحساس كاذب إن كل حاجة اترفعت.
  const sync = await posRequireSynced('الخروج', { timeoutMs:12000 });
  if(!sync.ok) return;
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
    snap.docs.forEach(d=>{
      const e = d.data();
      if(e.isAdminAccount) return;   // 👑 حساب الأدمن مش فرع
      const b = ((e.branch)||'').trim();
      if(b && b !== 'الإدارة') set.add(b);
    });
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

  // 👑 زر "حساب المالك" — للأدمن الثابت بس
  const oab = document.getElementById('ownerAdminBtn');
  if(oab) oab.style.display = (currentEmployee && currentEmployee.id === FIXED_ADMIN.id) ? '' : 'none';

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

  // 🎁 زرار الاستبدال اليدوي بيتخفي أصلًا لو مالهاش صلاحية
  try{
    const _rb = document.querySelector('[data-uid="sa_redeem"]');
    if(_rb) _rb.style.display = hasPerm('canRedeemManual') ? '' : 'none';
  }catch(e){}
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
  const canCards = hasPerm('canManageRoles');
  if(document.getElementById('navStaffCards')) document.getElementById('navStaffCards').style.display = canCards ? '' : 'none';
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



// ---------- 👑 شاشة تغيير اسم/رقم المالك ----------
function openOwnerAdminModal(){
  if(!currentEmployee || currentEmployee.id !== FIXED_ADMIN.id){
    showToast('الشاشة دي لحساب المالك بس', 'err'); return;
  }
  document.getElementById('oaCurrentPin').value = '';
  document.getElementById('oaNewName').value = '';
  document.getElementById('oaNewPin').value = '';
  document.getElementById('oaErr').textContent = '';
  document.getElementById('ownerAdminModal').classList.add('active');
  setTimeout(()=>{ const i=document.getElementById('oaCurrentPin'); if(i) i.focus(); }, 100);
}
function closeOwnerAdminModal(){
  document.getElementById('ownerAdminModal').classList.remove('active');
}
async function submitOwnerAdmin(){
  const err = document.getElementById('oaErr');
  const cur = (document.getElementById('oaCurrentPin').value || '').trim();
  const nm  = (document.getElementById('oaNewName').value || '').trim();
  const np  = (document.getElementById('oaNewPin').value || '').trim();
  err.textContent = '';
  if(!cur){ err.textContent = 'اكتب رقمك الحالي الأول'; return; }
  const res = await saveOwnerAdminConfig(cur, nm, np);
  if(!res.ok){ err.textContent = res.msg; return; }
  closeOwnerAdminModal();
  showToast('اتحفظت بيانات حساب المالك ✅');
  // نحدّث الاسم الظاهر فوق لو اتغيّر
  if(nm && currentEmployee){ currentEmployee.name = nm; enterDashboard(); }
}
