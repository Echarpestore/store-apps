/* ============================================================
   🏢 echarpe office — إدارة البيزنس (للمالك)
   الوارد الحي · النواقص · التجار والمصاريف · التقارير
   الإشعارات: محلية والتطبيق مفتوح/في الخلفية —
   والـ push الكامل (والتطبيق مقفول) بييجي مع Cloud Function (آخر خطوة).
   ============================================================ */
'use strict';

// 🔴 كان فيه كود مالك **مكتوب صريح** في الملف ده.
// GitHub Pages بيقدّم الملف ده لأي متصفح — أي حد يفتح /Office/office.js يقرا
// الكود. مش محتاج جهازك ولا devtools. اتشال خالص، والكود بقى **بصمة** محفوظة
// في Firestore ومتقارنة بالـhash. الكود نفسه عمره ما بيتخزّن في أي مكان.
const OF_GATE_DOC = 'office_gate';        // pos_test_settings/office_gate
const OF_SESS_KEY = 'office_gate_sess';   // جلسة بصلاحية، مش علامة دائمة
const OF_SESS_HOURS = 10;                 // تنتهي كل 10 ساعات

const firebaseConfig = {
  apiKey: "AIzaSyCa6Qho3IKoKE_jCNHYuFX6rtaV88jekQs",
  authDomain: "customer-feedback-8ac1d.firebaseapp.com",
  projectId: "customer-feedback-8ac1d",
  storageBucket: "customer-feedback-8ac1d.firebasestorage.app",
  messagingSenderId: "408860081491",
  appId: "1:408860081491:web:c5fa8b8e757c13196375a6"
};
firebase.initializeApp(firebaseConfig);
firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function(){});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function(){});
const db = firebase.firestore();
db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED, merge:true });
db.enablePersistence({ synchronizeTabs:true }).catch(function(){});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function(){});

const $ = function(s){ return document.querySelector(s); };

/* ============================================================
   🧮 دوال الحساب النقية والمساعدات (متغطّاة بالاختبارات في tests/)
   ============================================================ */
function esc(t){ return String(t==null?'':t).replace(/[<>&"]/g, function(c){ return ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c]; }); }
function egp(n){ return (Number(n)||0).toLocaleString('ar-EG') + ' ج.م'; }
function dstr(ts){ try{ return new Date(ts).toLocaleDateString('ar-EG', { day:'numeric', month:'short' }); }catch(e){ return ''; } }
function monthKey(d){ const x=d||new Date(); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0'); }

// رصيد التاجر من حركاته: order بيزوّد اللي عليك، payment بيخصم
function merchantBalance(txns){
  return (txns||[]).reduce(function(sum, t){
    if(!t) return sum;
    const a = Number(t.amount)||0;
    if(t.type === 'order')   return sum + a;
    if(t.type === 'payment') return sum - a;
    return sum;
  }, 0);
}

// مجموع مصاريف شهر معين
function expensesMonthTotal(expenses, mk){
  return (expenses||[]).reduce(function(sum, e){
    if(!e || String(e.month||'') !== mk) return sum;
    return sum + (Number(e.amount)||0);
  }, 0);
}

// الأكثر مبيعًا لفرع: تجميع قطع آخر N يوم من الفواتير (استبعاد المرتجع والعكس والاستبدال)
function topSellers(sales, branch, limit){
  const agg = {};
  (sales||[]).forEach(function(s){
    if(!s || s.branch !== branch || s.reversed || s.isReversal) return;
    (s.items||[]).forEach(function(it){
      if(!it || it.isRedemption) return;
      const key = String(it.barcode || it.name || '');
      if(!key) return;
      if(!agg[key]) agg[key] = { barcode: String(it.barcode||''), name: it.name || key, pieces: 0, revenue: 0 };
      const q = Number(it.qty)||0;
      const sign = it.isReturn ? -1 : 1;
      agg[key].pieces  += sign * q;
      agg[key].revenue += sign * q * (Number(it.price)||0);
    });
  });
  return Object.values(agg)
    .filter(function(x){ return x.pieces > 0; })
    .sort(function(a,b){ return b.pieces - a.pieces; })
    .slice(0, limit || 10);
}

// كمية فرع من مستند صنف (نفس منطق POS)
function branchQtyOf(p, br){
  if(p && p.qtyByBranch) return Number(p.qtyByBranch[br]) || 0;
  return Number(p && p.quantity) || 0;
}

// ملخص مرتبات: أساسي − سلف الشهر = صافي تقريبي
function salarySummary(employees, advances, mk){
  return (employees||[])
    .filter(function(e){ return e && e.active !== false && !e.isAdminAccount; })
    .map(function(e){
      const adv = (advances||[]).reduce(function(sum,a){
        if(!a || a.employeeId !== e.id) return sum;
        if(String(a.date||'').slice(0,7) !== mk) return sum;
        return sum + (Number(a.amount)||0);
      }, 0);
      const base = Number(e.baseSalary)||0;
      return { id:e.id, name:e.name||'', branch:e.branch||'', base:base, advances:adv, net: base - adv };
    })
    .sort(function(a,b){ return (a.branch+a.name) < (b.branch+b.name) ? -1 : 1; });
}

// بناء الوارد الموحّد من المصادر الأربعة
function buildInbox(data){
  const out = [];
  (data.leaves||[]).forEach(function(l){
    if(l.status !== 'pending') return;
    const sh = function(k){ return k==='morning' ? '🌅 صباحي' : (k==='evening' ? '🌆 مسائي' : ''); };
    const tl = l.type==='dayoff' ? '🌴 إجازة يوم' : (l.type==='changeDayoff' ? '📅 تغيير يوم الإجازة'
             : '🔄 تبديل شيفت' + (l.toShift ? ' ('+sh(l.fromShift)+' ← '+sh(l.toShift)+')' : ''));
    out.push({ kind:'leave', id:l.id, ts:l.ts||0, branch:l.branch||'', who:l.empName||'',
               title:tl, sub:(l.dateKey||'') + (l.reason ? ' · '+l.reason : ''), actionable:true });
  });
  (data.regs||[]).forEach(function(r){
    if(r.status !== 'pending') return;
    out.push({ kind:'reg', id:r.id, ts:r.ts||0, branch:r.branch||'', who:r.name||'',
               title:'🔒 طلب تسجيل موظف جديد', sub:'الاعتماد من برنامج sales', actionable:false });
  });
  (data.orders||[]).forEach(function(o){
    if(o.status !== 'pending') return;
    out.push({ kind:'order', id:o.id, ts:o.ts||0, branch:o.branch||'', who:o.employeeName||'',
               title:'🛒 أوردر موظف بخصم — ' + egp(o.total||0), sub:'الاعتماد من برنامج sales (بيأثر على السلف)', actionable:false });
  });
  (data.shorts||[]).forEach(function(x){
    if(x.status !== 'open') return;
    out.push({ kind:'short', id:x.id, ts:x.ts||0, branch:x.branch||'', who:x.empName||'',
               title:'📦 نواقص: ' + (x.productName||('كود '+x.barcode)) + ' × ' + (x.qty||1),
               sub:(x.detail ? x.detail+' · ' : '') + 'مخزون وقت الطلب: ' + (x.currentStock==null?'—':x.currentStock),
               actionable:true });
  });
  return out.sort(function(a,b){ return b.ts - a.ts; });
}

// 💹 تقرير الربح والخسارة لشهر معيّن
// الإيراد: صافي مبيعات كل فرع (استبعاد المرتجع وصف العكس)
// التكاليف: المرتبات الأساسية + بضاعة الشهر (أوردرات التجار) + المصاريف (شاملة الإيجار)
// السلف: بتتعرض كمعلومة (متدفعة مقدمًا من المرتبات) — مش خصم إضافي عشان ميتحسبش مرتين
function profitReport(data, mk){
  const byBranch = {};
  let revenue = 0;
  (data.sales||[]).forEach(function(s){
    if(!s || s.reversed || s.isReversal) return;
    const t = Number(s.total)||0;
    const br = s.branch || '—';
    byBranch[br] = (byBranch[br]||0) + t;
    revenue += t;
  });
  const salaries = (data.employees||[]).reduce(function(sum,e){
    if(!e || e.active === false || e.isAdminAccount) return sum;
    return sum + (Number(e.baseSalary)||0);
  }, 0);
  const advances = (data.advances||[]).reduce(function(sum,a){
    if(!a || String(a.date||'').slice(0,7) !== mk) return sum;
    return sum + (Number(a.amount)||0);
  }, 0);
  const goods = (data.mtxns||[]).reduce(function(sum,t){
    if(!t || t.type !== 'order') return sum;
    const tm = new Date(Number(t.ts)||0);
    const tmk = tm.getFullYear()+'-'+String(tm.getMonth()+1).padStart(2,'0');
    if(tmk !== mk) return sum;
    return sum + (Number(t.amount)||0);
  }, 0);
  const expenses = expensesMonthTotal(data.expenses, mk);
  const profit = revenue - salaries - goods - expenses;
  return { byBranch:byBranch, revenue:revenue, salaries:salaries, advances:advances,
           goods:goods, expenses:expenses, profit:profit };
}

// للاختبارات
if (typeof window !== 'undefined'){
  window.officeCalc = { merchantBalance:merchantBalance, expensesMonthTotal:expensesMonthTotal,
    topSellers:topSellers, branchQtyOf:branchQtyOf, salarySummary:salarySummary, buildInbox:buildInbox, profitReport:profitReport };
}

/* ============================================================
   🔐 البوابة: حساب فرع + كود المالك
   ============================================================ */
// 🔐 الجهاز بيفتكر الدخول — كان بيطلب الإيميل والباسورد وكود المالك كل مرة
// (الباسورد مكانش بيتحفظ خالص، وكود المالك في sessionStorage بيتمسح مع القفل)
const _OF_KEY = 'office_login';
// ============================================================
// 🔐 الدخول
// 🔴 كان الباسورد بيتحفظ في localStorage بـXOR + base64 — **تشويش مش تشفير**،
//    وأي حد ياخد الجهاز يطلّع بيانات الحساب ويدخل بيها من أي مكان في الدنيا
//    وميقدرش حد يوقفه غير بتغيير الباسورد.
//    اتشال خالص. Firebase أصلًا بيحتفظ بالجلسة (refresh token) — والفرق إن
//    التوكن ده **ينفع يتلغي من الكونسول** والباسورد لأ.
// ============================================================
try{
  firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
}catch(e){ console.warn('persistence', e); }

// 🧹 تنضيف لمرة واحدة: أي بيانات دخول قديمة متخزنة على الجهاز بتتمسح
try{
  ['office_login','office_creds','office_owner_ok'].forEach(function(k){
    try{ localStorage.removeItem(k); }catch(e){}
  });
  if(typeof _OF_KEY !== 'undefined') localStorage.removeItem(_OF_KEY);
}catch(e){}

// 🔑 بصمة الكود (SHA-256 بملح ثابت) — الكود نفسه عمره ما بيتخزّن ولا بيتبعت
async function ofHash(code){
  const data = new TextEncoder().encode('echarpe-office:' + String(code || ''));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(function(b){
    return b.toString(16).padStart(2,'0'); }).join('');
}

// Firebase بيرجّع الجلسة لوحده مع setPersistence — مفيش أي باسورد بيتخزّن
async function tryAutoOfficeLogin(){
  return !!firebase.auth().currentUser;
}

// ============================================================
// 🔐 بوابة كود المالك
// 🔴 كان: علامة office_owner_ok='1' في localStorage — أي حد يكتبها في
//    devtools يعدّي البوابة، وبتفضل للأبد.
//    دلوقتي: جلسة **بصلاحية** فيها بصمة الكود نفسه. لو الكود اتغيّر من
//    الكونسول، كل الجلسات القديمة بتبطل تلقائي.
// ⚠️ بصراحة: أي حاجة على المتصفح ممكن حد يزرعها لو معاه الجهاز مفتوح
//    و devtools. الحماية الحقيقية هي حساب Firebase + قواعد Firestore.
//    البوابة دي لسرقة الجهاز — والانتهاء بعد 10 ساعات هو اللي بيحدّ الضرر.
// ============================================================
let ownerOk = false;
let _gateHash = null;        // البصمة المحفوظة في Firestore
let _gateTries = 0;

function _sessRead(){
  try{
    const o = JSON.parse(sessionStorage.getItem(OF_SESS_KEY) || 'null');
    if(!o || !o.exp || !o.h) return null;
    if(Date.now() > o.exp) return null;                 // انتهت
    if(_gateHash && o.h !== _gateHash) return null;     // الكود اتغيّر
    return o;
  }catch(e){ return null; }
}
function _sessWrite(h){
  try{
    sessionStorage.setItem(OF_SESS_KEY, JSON.stringify({
      h: h, exp: Date.now() + OF_SESS_HOURS * 3600 * 1000
    }));
  }catch(e){}
}

// بتقرا البصمة من Firestore (محتاجة تسجيل دخول Firebase — ودي الحماية الحقيقية)
async function loadGateHash(){
  try{
    const d = await db.collection('pos_test_settings').doc(OF_GATE_DOC).get();
    _gateHash = (d.exists && d.data() && d.data().hash) || null;
  }catch(e){ _gateHash = null; console.warn('gate', e && e.code); }
  return _gateHash;
}

$('#gLogin').addEventListener('click', async function(){
  const em = $('#gEmail').value.trim(), pw = $('#gPass').value;
  $('#gateErr').textContent = '';
  if(!em || !pw){ $('#gateErr').textContent = 'اكتب الإيميل والباسورد'; return; }
  try{
    await firebase.auth().signInWithEmailAndPassword(em, pw);
    localStorage.setItem('office_email', em);   // الإيميل بس — مفيش باسورد
    $('#gPass').value = '';
  }catch(e){ $('#gateErr').textContent = 'دخول غلط: ' + (e.code||''); }
});
tryAutoOfficeLogin();

$('#gCodeBtn').addEventListener('click', async function(){
  const val = $('#gCode').value.trim();
  $('#gateErr').textContent = '';
  if(!val){ return; }
  // 🐢 تهدئة بعد المحاولات الغلط — عشان التخمين ميبقاش رخيص
  if(_gateTries >= 5){
    $('#gateErr').textContent = 'محاولات كتير — اقفل البرنامج وافتحه تاني';
    return;
  }
  try{
    const h = await ofHash(val);
    if(_gateHash === null) await loadGateHash();

    // 🆕 أول تشغيل: مفيش كود متسجّل — بنسجّله دلوقتي.
    // آمن لأن اللي وصل هنا **داخل بحساب Firebase أصلًا**.
    if(!_gateHash){
      if(val.length < 4){ $('#gateErr').textContent = 'اختار كود 4 أرقام على الأقل'; return; }
      await db.collection('pos_test_settings').doc(OF_GATE_DOC)
        .set({ hash: h, setAt: Date.now() }, { merge: true });
      _gateHash = h;
      ownerOk = true; _sessWrite(h);
      $('#gCode').value = '';
      refreshGate(firebase.auth().currentUser);
      return;
    }

    if(h === _gateHash){
      _gateTries = 0;
      ownerOk = true; _sessWrite(h);
      $('#gCode').value = '';
      refreshGate(firebase.auth().currentUser);
    } else {
      _gateTries++;
      $('#gateErr').textContent = 'كود غلط' + (_gateTries >= 3 ? (' (' + (5 - _gateTries) + ' محاولات فاضلة)') : '');
      $('#gCode').value = '';
    }
  }catch(e){
    $('#gateErr').textContent = 'تعذر التحقق — راجع النت';
    console.warn('gate check', e);
  }
});
$('#gCode').addEventListener('keydown', function(e){ if(e.key==='Enter') $('#gCodeBtn').click(); });

// 🔑 تغيير كود المالك — من جوه البرنامج وانت داخل
window.officeChangeCode = async function(){
  if(!ownerOk){ alert('افتح البوابة الأول'); return; }
  const a = prompt('الكود الجديد (4 أرقام على الأقل):');
  if(!a || a.trim().length < 4) return;
  const b = prompt('اكتبه تاني للتأكيد:');
  if(a.trim() !== (b||'').trim()){ alert('الكودين مش زي بعض'); return; }
  try{
    const h = await ofHash(a.trim());
    await db.collection('pos_test_settings').doc(OF_GATE_DOC)
      .set({ hash: h, setAt: Date.now() }, { merge: true });
    _gateHash = h; _sessWrite(h);
    alert('اتغيّر ✅ — الأجهزة التانية هتطلب الكود الجديد');
  }catch(e){ alert('ماتغيرش: ' + (e.code||e.message)); }
};

// 🚪 خروج صريح
window.officeLogout = async function(){
  if(!confirm('هتخرج من البرنامج والجهاز هينسى الدخول. متأكد؟')) return;
  try{ sessionStorage.removeItem(OF_SESS_KEY); }catch(e){}
  try{ localStorage.removeItem('office_owner_ok'); }catch(e){}
  ownerOk = false;
  try{ await firebase.auth().signOut(); }catch(e){}
  location.reload();
};

function refreshGate(user){
  const saved = localStorage.getItem('office_email') || '';
  if(saved && !$('#gEmail').value) $('#gEmail').value = saved;
  if(!user){
    $('#gate').style.display = 'flex';
    $('#gateStep1').style.display = 'block';
    $('#gateStep2').style.display = 'none';
    return;
  }
  if(!ownerOk){
    $('#gate').style.display = 'flex';
    $('#gateStep1').style.display = 'none';
    $('#gateStep2').style.display = 'block';
    // 🆕 أول تشغيل: مفيش كود متسجّل — بنقول له صراحةً إنه بيختار كود جديد
    const gc = $('#gCode');
    if(gc) gc.placeholder = (_gateHash === null) ? 'اختار كود المالك (4 أرقام+)' : 'كود المالك';
    setTimeout(function(){ $('#gCode').focus(); }, 100);
    return;
  }
  $('#gate').style.display = 'none';
  $('#hdrSub').textContent = 'متوصّل ✅ · ' + new Date().toLocaleDateString('ar-EG', { weekday:'long', day:'numeric', month:'long' });
  startData();
}
// 🔐 أول ما الدخول يتأكد: نجيب بصمة الكود ونشوف الجلسة لسه سارية
firebase.auth().onAuthStateChanged(async function(user){
  if(!user){ ownerOk = false; refreshGate(null); return; }
  await loadGateHash();
  // جلسة سارية ومطابقة للبصمة الحالية = مفيش داعي نسأل الكود تاني
  ownerOk = !!_sessRead();
  refreshGate(user);
});

/* ============================================================
   🗂️ التبويبات
   ============================================================ */
document.querySelectorAll('#tabsNav button').forEach(function(b){
  b.addEventListener('click', function(){
    document.querySelectorAll('#tabsNav button').forEach(function(x){ x.classList.remove('on'); });
    document.querySelectorAll('.tabPage').forEach(function(x){ x.classList.remove('on'); });
    b.classList.add('on');
    document.getElementById('page-' + b.dataset.page).classList.add('on');
    // ⚡ بيانات التقارير بتتحمّل أول ما تفتح التبويب — مش في الخلفية طول الوقت
    if(b.dataset.page === 'reports'){
      try{ loadCustomers(); loadRatings(); }catch(e){ console.warn('reports load', e); }
    }
  });
});
document.getElementById('page-inbox').classList.add('on');

/* ============================================================
   📡 البيانات الحية + الإشعارات
   ============================================================ */
const D = { leaves:[], regs:[], orders:[], shorts:[], merchants:[], mtxns:[], expenses:[],
            employees:[], advances:[], sales:[], inventory:[], customers:[], ratings:[],
            recurring:[] };
let started = false;
let firstLoadDone = false;
const seenIds = {};   // عشان الإشعار يطلع للجديد بس

function notify(title, body){
  try{
    if(Notification.permission !== 'granted') return;
    if(navigator.serviceWorker && navigator.serviceWorker.ready){
      navigator.serviceWorker.ready.then(function(reg){
        reg.showNotification(title, { body:body, icon:'icon.png', dir:'rtl', lang:'ar',
          badge:'icon.png', vibrate:[200,80,200], tag:'office-'+Date.now() });
      });
    } else { new Notification(title, { body:body }); }
  }catch(e){}
}
function maybeNotifyNew(kind, arr, label, describe){
  arr.forEach(function(x){
    const key = kind + ':' + x.id;
    if(seenIds[key]) return;
    seenIds[key] = 1;
    if(firstLoadDone) notify(label, describe(x));
  });
}
$('#notifBtn').addEventListener('click', function(){
  Notification.requestPermission().then(function(p){
    $('#notifBtn').textContent = p === 'granted' ? '🔔 الإشعارات شغالة ✅' : '🔕 الإشعارات مرفوضة';
  });
});
if(typeof Notification !== 'undefined' && Notification.permission === 'granted'){
  $('#notifBtn').textContent = '🔔 الإشعارات شغالة ✅';
}

function startData(){
  if(started) return; started = true;

  db.collection('sales_leave_requests').onSnapshot(function(s){
    D.leaves = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    maybeNotifyNew('lv', D.leaves.filter(function(x){ return x.status==='pending'; }),
      '📩 طلب إذن جديد', function(x){ return (x.empName||'') + ' — ' + (x.branch||'') + ' — ' + (x.dateKey||''); });
    renderInbox();
  });
  db.collection('sales_registrations').onSnapshot(function(s){
    D.regs = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    maybeNotifyNew('rg', D.regs.filter(function(x){ return x.status==='pending'; }),
      '🔒 طلب تسجيل موظف', function(x){ return (x.name||'') + ' — ' + (x.branch||''); });
    renderInbox();
  }, function(){ /* الكولكشن ممكن ميكونش موجود */ });
  db.collection('sales_staff_orders').onSnapshot(function(s){
    D.orders = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    maybeNotifyNew('so', D.orders.filter(function(x){ return x.status==='pending'; }),
      '🛒 أوردر موظف جديد', function(x){ return (x.employeeName||'') + ' — ' + egp(x.total||0); });
    renderInbox();
  });
  db.collection('sales_shortages').onSnapshot(function(s){
    D.shorts = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    maybeNotifyNew('sh', D.shorts.filter(function(x){ return x.status==='open'; }),
      '📦 طلب نواقص', function(x){ return (x.productName||x.barcode) + ' × ' + (x.qty||1) + ' — ' + (x.branch||''); });
    renderInbox(); renderShort();
  });
  db.collection('office_merchants').onSnapshot(function(s){
    D.merchants = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    renderMerchants();
  });
  db.collection('office_merchant_txns').onSnapshot(function(s){
    D.mtxns = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    renderMerchants(); renderPL();
  });
  db.collection('office_expenses').onSnapshot(function(s){
    D.expenses = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    renderExpenses(); renderPL();
    try{ ofRenderRecurring(); }catch(e){ console.warn('recurring', e); }   // حالة "اتدفع" بتتغير
  });
  // 🔁 قوالب المصاريف المتكررة
  db.collection(OF_RECUR_COL).onSnapshot(function(s){
    D.recurring = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    try{ ofRenderRecurring(); }catch(e){ console.warn('recurring', e); }
  }, function(e){ console.warn('recurring sync', e && e.code); });
  db.collection('sales_employees').onSnapshot(function(s){
    D.employees = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    renderSalaries(); fillBranchSel(); renderPL();
    // 📅 شاشة اليوم — بعد ما الموظفين يوصلوا (منهم بنعرف الفروع)
    ofLoadDayCut().then(function(){ try{ ofWireDay(); }catch(e){ console.warn('day', e); } });
    try{ ofWireTasks(); }catch(e){ console.warn('tasks', e); }
  });
  db.collection('sales_advances').onSnapshot(function(s){
    D.advances = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    renderSalaries(); renderPL();
  });
  // مبيعات آخر 30 يوم (قراءة دورية مش snapshot — أخف على الموبايل)
  // ⚡ ترشيد القراءات:
  //   • التحديث بيقف تمامًا والتطبيق في الخلفية
  //   • بيانات التقارير بتتحمّل عند فتح تبويب التقارير بس، ومع كاش
  //   • الفترات اتوسّعت (كانت 5 دقايق = آلاف القراءات في الساعة)
  loadSales();
  setInterval(function(){ if(!document.hidden) loadSales(); }, 20*60*1000);
  db.collection('pos_test_inventory').get().then(function(s){
    D.inventory = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    renderTop();
  });

  setTimeout(function(){ firstLoadDone = true; }, 8000);
}
function loadSales(){
  const from = new Date(); from.setDate(from.getDate()-30); from.setHours(0,0,0,0);
  db.collection('pos_test_sales')
    .where('createdAt','>=', firebase.firestore.Timestamp.fromDate(from)).get()
    .then(function(s){
      D.sales = s.docs.map(function(d){ return d.data(); });
      renderTop();
    }).catch(function(e){ console.warn('sales load', e); });
}

// 👥 العملاء — للتقارير (تحميلات التطبيق والمكافآت والنقط)
// ⚡ بتتحمّل عند فتح تبويب التقارير بس، والكاش صالح ربع ساعة.
const REPORT_CACHE_MS = 15*60*1000;
let _custAt = 0, _ratAt = 0;
function loadCustomers(force){
  if(!force && _custAt && (Date.now() - _custAt) < REPORT_CACHE_MS) return;
  _custAt = Date.now();
  db.collection('pos_test_customers').get().then(function(s){
    D.customers = s.docs.map(function(d){ return Object.assign({ _id:d.id }, d.data()); });
    try{ renderActivityReports(); }catch(e){ console.warn('activity', e); }
  }).catch(function(e){ console.warn('customers load', e); });
}

// ⭐ تقييمات العملاء (آخر 30 يوم)
function loadRatings(force){
  if(!force && _ratAt && (Date.now() - _ratAt) < REPORT_CACHE_MS) return;
  _ratAt = Date.now();
  var from = Date.now() - 30*86400000;
  db.collection('entries').where('ts','>=', from).get().then(function(s){
    D.ratings = s.docs.map(function(d){ return d.data(); });
    try{ renderActivityReports(); }catch(e){ console.warn('ratings', e); }
  }).catch(function(e){ console.warn('ratings load', e); });
}

/* ============================================================
   📈 تقارير النشاط اليومي
   ============================================================ */
// بيحوّل أي شكل تاريخ (Timestamp / رقم / نص) لبداية اليوم
function _dayKeyOf(v){
  if(v == null) return null;
  var ms = null;
  if(typeof v === 'number') ms = v;
  else if(v.toMillis) ms = v.toMillis();
  else if(v.seconds) ms = v.seconds * 1000;
  else { var t = new Date(v).getTime(); if(!isNaN(t)) ms = t; }
  if(!ms) return null;
  var d = new Date(ms);
  var p = function(n){ return String(n).padStart(2,'0'); };
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}

// 📥 تحميلات التطبيق يوم بيوم (العميل اللي اتسجّل من التطبيق)
function dailyDownloads(customers, days){
  var out = {};
  (customers||[]).forEach(function(c){
    if(!c) return;
    var src = String(c.source || '');
    if(!/^(loyalty_app|glow_app)/.test(src)) return;   // اللي اتسجّل من الكاشير مش تحميل
    var k = _dayKeyOf(c.createdAt);
    if(k) out[k] = (out[k] || 0) + 1;
  });
  return _lastDays(out, days || 14);
}

// 🎁 مكافآت الترحيب يوم بيوم (أول تحميل)
function dailyWelcome(customers, days){
  var out = {};
  (customers||[]).forEach(function(c){
    if(!c) return;
    var t = c.welcomeGranted_echarpe || c.welcomeGranted_glow;
    var k = _dayKeyOf(t);
    if(k) out[k] = (out[k] || 0) + 1;
  });
  return _lastDays(out, days || 14);
}

// ⭐ النقط المكتسبة يوم بيوم + عدد العملاء اللي أخدوا نقط
function dailyPoints(sales, days){
  var pts = {}, custs = {};
  (sales||[]).forEach(function(sl){
    if(!sl || sl.reversed || sl.isReversal) return;
    var earned = Number(sl.loyaltyPointsEarned) || 0;
    if(earned <= 0) return;
    var k = _dayKeyOf(sl.createdAt);
    if(!k) return;
    pts[k] = (pts[k] || 0) + earned;
    if(!custs[k]) custs[k] = {};
    if(sl.customerPhone) custs[k][sl.customerPhone] = 1;
  });
  var rows = _lastDays(pts, days || 14);
  rows.forEach(function(r){ r.people = custs[r.day] ? Object.keys(custs[r.day]).length : 0; });
  return rows;
}

// بيرجّع آخر N يوم مرتبين من الأحدث، وبيحط صفر لليوم اللي مفيهوش حاجة
function _lastDays(map, n){
  var out = [];
  var d = new Date(); d.setHours(0,0,0,0);
  var p = function(x){ return String(x).padStart(2,'0'); };
  for(var i = 0; i < n; i++){
    var k = d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
    out.push({ day: k, count: map[k] || 0 });
    d.setDate(d.getDate() - 1);
  }
  return out;
}
window.dailyDownloads = dailyDownloads;
window.dailyWelcome = dailyWelcome;
window.dailyPoints = dailyPoints;

// ⭐ ملخص التقييمات: المتوسط والتوزيع وأعداد السيّئ
function ratingsSummary(entries, sinceMs){
  var out = { total:0, avg:0, dist:{1:0,2:0,3:0,4:0,5:0}, bad:0, good:0, byBranch:{} };
  var sum = 0;
  (entries||[]).forEach(function(e){
    if(!e) return;
    var r = Number(e.r);
    if(!(r >= 1 && r <= 5)) return;                  // تقييم مش صالح
    if(sinceMs && !(Number(e.ts) >= sinceMs)) return;
    out.total++; sum += r;
    out.dist[r] = (out.dist[r] || 0) + 1;
    if(r <= 2) out.bad++;
    if(r >= 4) out.good++;
    var b = e.branch || '—';
    if(!out.byBranch[b]) out.byBranch[b] = { n:0, sum:0, bad:0 };
    out.byBranch[b].n++; out.byBranch[b].sum += r;
    if(r <= 2) out.byBranch[b].bad++;
  });
  out.avg = out.total ? +(sum / out.total).toFixed(2) : 0;
  Object.keys(out.byBranch).forEach(function(b){
    var x = out.byBranch[b];
    x.avg = x.n ? +(x.sum / x.n).toFixed(2) : 0;
  });
  return out;
}
// تقييمات يوم بيوم
function dailyRatings(entries, days){
  var map = {}, sums = {};
  (entries||[]).forEach(function(e){
    if(!e) return;
    var r = Number(e.r); if(!(r >= 1 && r <= 5)) return;
    var k = _dayKeyOf(e.ts); if(!k) return;
    map[k] = (map[k] || 0) + 1;
    sums[k] = (sums[k] || 0) + r;
  });
  var rows = _lastDays(map, days || 14);
  rows.forEach(function(x){
    x.avg = x.count ? +(sums[x.day] / x.count).toFixed(1) : 0;
  });
  return rows;
}
window.ratingsSummary = ratingsSummary;
window.dailyRatings = dailyRatings;

function _miniBars(rows, unit, color){
  var max = rows.reduce(function(m,r){ return Math.max(m, r.count); }, 0) || 1;
  return rows.map(function(r){
    var pct = Math.round(r.count / max * 100);
    var dd = r.day.slice(5).replace('-','/');
    return '<div class="row" style="align-items:center; gap:8px; padding:3px 0;">'
      + '<span class="muted" style="font-size:11px; min-width:42px;">' + dd + '</span>'
      + '<span style="flex:1; height:14px; background:#ffffff10; border-radius:99px; overflow:hidden;">'
      + '<span style="display:block; height:100%; width:' + pct + '%; background:' + color + ';"></span></span>'
      + '<b style="min-width:64px; text-align:left; font-size:12px;">' + r.count + ' ' + unit
      + (r.people != null ? ' <span class="muted" style="font-weight:400;">· ' + r.people + ' عميل</span>' : '')
      + '</b></div>';
  }).join('');
}

function renderActivityReports(){
  var box = document.getElementById('activityReports'); if(!box) return;
  var dl = dailyDownloads(D.customers, 14);
  var wl = dailyWelcome(D.customers, 14);
  var pt = dailyPoints(D.sales, 14);
  var sum = function(rows){ return rows.reduce(function(n,r){ return n + r.count; }, 0); };
  var today = function(rows){ return rows.length ? rows[0].count : 0; };

  box.innerHTML =
    '<div class="card"><h3>📱 تحميلات التطبيق</h3>'
    + '<div class="row" style="margin-bottom:8px;"><span class="muted">النهاردة</span>'
    + '<b style="font-size:19px;">' + today(dl) + '</b></div>'
    + '<div class="row" style="margin-bottom:10px;"><span class="muted">آخر 14 يوم</span>'
    + '<b>' + sum(dl) + '</b></div>'
    + _miniBars(dl, 'تحميل', '#3b82f6') + '</div>'

    + '<div class="card"><h3>🎁 مكافأة أول تحميل</h3>'
    + '<div class="row" style="margin-bottom:8px;"><span class="muted">النهاردة</span>'
    + '<b style="font-size:19px;">' + today(wl) + '</b></div>'
    + '<div class="row" style="margin-bottom:10px;"><span class="muted">آخر 14 يوم</span>'
    + '<b>' + sum(wl) + '</b></div>'
    + _miniBars(wl, 'مكافأة', '#f59e0b') + '</div>'

    + '<div class="card"><h3>⭐ النقط المكتسبة</h3>'
    + '<div class="row" style="margin-bottom:8px;"><span class="muted">النهاردة</span>'
    + '<b style="font-size:19px;">' + today(pt) + ' نقطة</b></div>'
    + '<div class="row" style="margin-bottom:10px;"><span class="muted">آخر 14 يوم</span>'
    + '<b>' + sum(pt) + ' نقطة</b></div>'
    + _miniBars(pt, 'نقطة', '#22c55e') + '</div>'

    + (function(){
        var rt = dailyRatings(D.ratings, 14);
        var sm = ratingsSummary(D.ratings, Date.now() - 30*86400000);
        var stars = function(n){ return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5-n); };
        var distRows = [5,4,3,2,1].map(function(r){
          var c = sm.dist[r] || 0;
          var pct = sm.total ? Math.round(c / sm.total * 100) : 0;
          var col = r >= 4 ? '#22c55e' : (r === 3 ? '#f59e0b' : '#e5484d');
          return '<div class="row" style="align-items:center; gap:8px; padding:3px 0;">'
            + '<span style="min-width:58px; font-size:12px; color:' + col + ';">' + stars(r) + '</span>'
            + '<span style="flex:1; height:14px; background:#ffffff10; border-radius:99px; overflow:hidden;">'
            + '<span style="display:block; height:100%; width:' + pct + '%; background:' + col + ';"></span></span>'
            + '<b style="min-width:64px; text-align:left; font-size:12px;">' + c
            + ' <span class="muted" style="font-weight:400;">(' + pct + '%)</span></b></div>';
        }).join('');
        var brRows = Object.keys(sm.byBranch).sort(function(a,b){
          return sm.byBranch[b].n - sm.byBranch[a].n;
        }).map(function(b){
          var x = sm.byBranch[b];
          var col = x.avg >= 4 ? '#22c55e' : (x.avg >= 3 ? '#f59e0b' : '#e5484d');
          return '<div class="card row"><span>' + esc(b) + ' <span class="muted">· ' + x.n + ' تقييم</span></span>'
            + '<span><b style="color:' + col + ';">' + x.avg.toFixed(2) + '</b>'
            + (x.bad ? ' <span class="muted" style="font-size:11px;">· ' + x.bad + ' سيّئ</span>' : '')
            + '</span></div>';
        }).join('');
        return '<div class="card"><h3>⭐ تقييمات العملاء (آخر 30 يوم)</h3>'
          + '<div class="row" style="margin-bottom:6px;"><span class="muted">المتوسط العام</span>'
          + '<b style="font-size:19px; color:' + (sm.avg >= 4 ? '#22c55e' : (sm.avg >= 3 ? '#f59e0b' : '#e5484d')) + ';">'
          + sm.avg.toFixed(2) + ' / 5</b></div>'
          + '<div class="row" style="margin-bottom:4px;"><span class="muted">عدد التقييمات</span><b>' + sm.total + '</b></div>'
          + '<div class="row" style="margin-bottom:10px;"><span class="muted">تقييمات سيّئة (1-2)</span>'
          + '<b style="color:' + (sm.bad ? '#e5484d' : '#22c55e') + ';">' + sm.bad + '</b></div>'
          + distRows
          + (brRows ? ('<div style="margin-top:12px; font-size:12.5px; font-weight:800;">حسب الفرع</div>' + brRows) : '')
          + '<div style="margin-top:12px; font-size:12.5px; font-weight:800;">يوم بيوم</div>'
          + _miniBars(rt, 'تقييم', '#a855f7')
          + '</div>';
      })();
}
window.renderActivityReports = renderActivityReports;

/* ============================================================
   💹 الربح والخسارة
   ============================================================ */
let plMonthSales = null;      // مبيعات الشهر المختار (منفصلة عن آخر 30 يوم)
let plLoadedMonth = '';
function plSelectedMonth(){
  const sel = $('#plMonthSel');
  return (sel && sel.value) || monthKey();
}
function fillPlMonths(){
  const sel = $('#plMonthSel'); if(!sel || sel.options.length) return;
  const now = new Date();
  const opts = [];
  for(let i=0;i<6;i++){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const mk = monthKey(d);
    const label = d.toLocaleDateString('ar-EG', { month:'long', year:'numeric' });
    opts.push('<option value="'+mk+'">'+label+(i===0?' (الحالي)':'')+'</option>');
  }
  sel.innerHTML = opts.join('');
  sel.onchange = loadPlMonth;
}
function loadPlMonth(){
  const mk = plSelectedMonth();
  if(mk === plLoadedMonth && plMonthSales){ renderPL(); return; }
  const parts = mk.split('-');
  const from = new Date(Number(parts[0]), Number(parts[1])-1, 1);
  const to   = new Date(Number(parts[0]), Number(parts[1]), 1);
  db.collection('pos_test_sales')
    .where('createdAt','>=', firebase.firestore.Timestamp.fromDate(from))
    .where('createdAt','<',  firebase.firestore.Timestamp.fromDate(to)).get()
    .then(function(s){
      plMonthSales = s.docs.map(function(d){ return d.data(); });
      plLoadedMonth = mk;
      renderPL();
    }).catch(function(e){ console.warn('pl load', e); $('#plBody').innerHTML = '<div class="empty">تعذر تحميل المبيعات</div>'; });
}
function renderPL(){
  const body = $('#plBody'); if(!body) return;
  fillPlMonths();
  const mk = plSelectedMonth();
  if(plLoadedMonth !== mk || !plMonthSales){ loadPlMonth(); return; }
  const r = profitReport({ sales:plMonthSales, employees:D.employees, advances:D.advances,
                           mtxns:D.mtxns, expenses:D.expenses }, mk);
  // مبيعات الفروع
  const brs = Object.keys(r.byBranch).sort();
  $('#plBranches').innerHTML = brs.length ? brs.map(function(b){
    return '<div class="card row"><span>🏬 مبيعات '+esc(b)+'</span><span class="amount pos">'+egp(r.byBranch[b])+'</span></div>';
  }).join('') : '<div class="empty">مفيش مبيعات متسجلة للشهر ده</div>';
  // البنود
  body.innerHTML =
    '<div class="card row" style="border-color:var(--good);"><b>إجمالي المبيعات</b><span class="amount pos">'+egp(r.revenue)+'</span></div>' +
    '<div class="card row"><span>👥 المرتبات الأساسية' +
      (r.advances ? '<div class="muted">متدفع منها مقدمًا كسلف: '+egp(r.advances)+'</div>' : '') +
    '</span><span class="amount neg">− '+egp(r.salaries)+'</span></div>' +
    '<div class="card row"><span>📦 البضاعة (أوردرات التجار)</span><span class="amount neg">− '+egp(r.goods)+'</span></div>' +
    '<div class="card row"><span>💸 المصاريف والإيجارات</span><span class="amount neg">− '+egp(r.expenses)+'</span></div>';
  // النتيجة
  const res = $('#plResult');
  if(r.profit >= 0){
    res.style.background = 'rgba(63,191,96,.12)'; res.style.border = '1px solid var(--good)'; res.style.color = 'var(--good)';
    res.textContent = '✅ مكسب ' + egp(r.profit);
  } else {
    res.style.background = 'rgba(224,121,107,.12)'; res.style.border = '1px solid var(--bad)'; res.style.color = 'var(--bad)';
    res.textContent = '🔻 خسارة ' + egp(Math.abs(r.profit));
  }
}

/* ============================================================
   🔔 الوارد
   ============================================================ */
function renderInbox(){
  const wrap = $('#inboxList'); if(!wrap) return;
  const items = buildInbox(D);
  const nb = $('#nbInbox');
  nb.style.display = items.length ? '' : 'none';
  nb.textContent = items.length;
  const nbs = $('#nbShort');
  const openShorts = D.shorts.filter(function(x){ return x.status==='open'; }).length;
  nbs.style.display = openShorts ? '' : 'none';
  nbs.textContent = openShorts;
  if(!items.length){ wrap.innerHTML = '<div class="empty">مفيش حاجة مستنية ✅ — استمتع بيومك</div>'; return; }
  wrap.innerHTML = items.map(function(i){
    let actions = '';
    if(i.kind === 'leave') actions =
      '<div style="display:flex; gap:7px; margin-top:9px;">' +
      '<button class="btn ok" style="flex:1;" onclick="officeDecideLeave(\''+i.id+'\',\'approved\')">✅ موافقة</button>' +
      '<button class="btn no" onclick="officeDecideLeave(\''+i.id+'\',\'rejected\')">رفض</button></div>';
    if(i.kind === 'short') actions =
      '<div style="margin-top:9px;"><button class="btn ok" style="width:100%;" onclick="officeCloseShort(\''+i.id+'\')">✅ اتجاب</button></div>';
    return '<div class="card">' +
      '<div class="row"><b style="font-size:13px;">'+esc(i.title)+'</b><span class="pill g">'+esc(i.branch)+'</span></div>' +
      '<div class="muted" style="margin-top:3px;">'+esc(i.who)+(i.sub ? ' · '+esc(i.sub) : '')+' · '+dstr(i.ts)+'</div>' +
      actions + '</div>';
  }).join('');
}
window.officeDecideLeave = function(id, decision){
  db.collection('sales_leave_requests').doc(id).update({ status:decision, decidedAt:Date.now(), decidedFrom:'office' })
    .catch(function(e){ alert('تعذر الحفظ: '+e.message); });
};
window.officeCloseShort = function(id){
  db.collection('sales_shortages').doc(id).update({ status:'done', doneAt:Date.now(), doneFrom:'office' })
    .catch(function(e){ alert('تعذر الحفظ: '+e.message); });
};

/* ============================================================
   📦 النواقص
   ============================================================ */
function renderShort(){
  const wrap = $('#shortList'); if(!wrap) return;
  const open = D.shorts.filter(function(x){ return x.status==='open'; })
    .sort(function(a,b){ return b.ts - a.ts; });
  if(!open.length){ wrap.innerHTML = '<div class="empty">مفيش نواقص مطلوبة ✅</div>'; return; }
  wrap.innerHTML = open.map(function(x){
    return '<div class="card">' +
      '<div class="row"><b style="font-size:13px;">'+esc(x.productName||('كود '+x.barcode))+' × '+(x.qty||1)+'</b>' +
      '<span class="pill g">'+esc(x.branch||'')+'</span></div>' +
      '<div class="muted" style="margin-top:3px;">'+(x.detail?esc(x.detail)+' · ':'')+'كود '+esc(x.barcode)+
      ' · مخزون وقت الطلب: '+(x.currentStock==null?'—':x.currentStock)+'</div>' +
      '<div class="muted" style="margin-top:2px;">طلبها: '+esc(x.empName||'')+' · '+dstr(x.ts)+'</div>' +
      '<div style="margin-top:9px;"><button class="btn ok" style="width:100%;" onclick="officeCloseShort(\''+x.id+'\')">✅ اتجاب</button></div>' +
      '</div>';
  }).join('');
}

/* ============================================================
   🧾 التجار
   ============================================================ */
$('#mAdd').addEventListener('click', function(){
  const name = $('#mName').value.trim();
  if(!name) return;
  db.collection('office_merchants').add({ name:name, ts:Date.now() })
    .then(function(){ $('#mName').value=''; })
    .catch(function(e){ alert('تعذر الإضافة: '+e.message); });
});
// 🧾 كارت التاجر — سجل كامل بدل آخر 3 حركات
let _mOpen = {};      // مين مفتوح سجله
window.toggleMerchLog = function(id){ _mOpen[id] = !_mOpen[id]; renderMerchants(); };

function renderMerchants(){
  const wrap = $('#merchantsList'); if(!wrap) return;
  if(!D.merchants.length){
    wrap.innerHTML = '<div class="empty">لسه مفيش تجار — ضيف أول واحد من فوق ⬆️</div>';
    return;
  }
  // 📊 ملخص فوق: إجمالي اللي عليك
  const totalDue = D.merchants.reduce(function(n, m){
    const t = D.mtxns.filter(function(x){ return x.merchantId === m.id; });
    const b = merchantBalance(t);
    return n + (b > 0 ? b : 0);
  }, 0);
  const head = '<div class="card" style="border-right:4px solid var(--bad); margin-bottom:12px;">'
    + '<div class="row"><span class="muted">إجمالي اللي عليك للتجار</span>'
    + '<span class="amount neg" style="font-size:20px;">' + egp(totalDue) + '</span></div>'
    + '<div class="muted" style="font-size:11.5px; margin-top:3px;">'
    + D.merchants.length + ' تاجر</div></div>';

  wrap.innerHTML = head + D.merchants
    .slice().sort(function(a,b){
      // اللي عليه أكتر يظهر الأول
      const ba = merchantBalance(D.mtxns.filter(function(t){ return t.merchantId === a.id; }));
      const bb = merchantBalance(D.mtxns.filter(function(t){ return t.merchantId === b.id; }));
      return bb - ba;
    })
    .map(function(m){
      const txns = D.mtxns.filter(function(t){ return t.merchantId === m.id; })
        .sort(function(a,b){ return b.ts - a.ts; });
      const bal = merchantBalance(txns);
      const orders = txns.filter(function(t){ return t.type === 'order'; });
      const pays   = txns.filter(function(t){ return t.type !== 'order'; });
      const sumO = orders.reduce(function(n,t){ return n + (t.amount||0); }, 0);
      const sumP = pays.reduce(function(n,t){ return n + (t.amount||0); }, 0);
      const open = !!_mOpen[m.id];
      const accent = bal > 0 ? 'var(--bad)' : 'var(--good)';

      const log = open ? ('<div style="margin-top:11px; border-top:1px solid var(--line); padding-top:11px;">'
        + (txns.length ? txns.map(function(t){
            const isOrd = t.type === 'order';
            return '<div class="row" style="padding:7px 9px; border-radius:9px; margin-bottom:5px;'
              + 'background:' + (isOrd ? '#fef2f2' : '#ecfdf5') + ';">'
              + '<span style="font-size:12.5px; font-weight:700;">'
              + (isOrd ? '🧾 أوردر' : '💵 دفعة')
              + (t.note ? ('<span class="muted" style="font-weight:400;"> · ' + esc(t.note) + '</span>') : '')
              + '<div class="muted" style="font-size:10.5px; font-weight:400;">' + dstr(t.ts) + '</div></span>'
              + '<span style="display:flex; align-items:center; gap:7px;">'
              + '<b style="color:' + (isOrd ? 'var(--bad)' : 'var(--good)') + '; font-size:13.5px;">'
              + (isOrd ? '+' : '−') + egp(t.amount) + '</b>'
              + '<button class="ghost" style="padding:3px 8px; font-size:11px;"'
              + ' onclick="deleteMtxn(\'' + t.id + '\')">🗑️</button>'
              + '</span></div>';
          }).join('') : '<div class="muted" style="font-size:12.5px;">مفيش حركات لسه</div>')
        + '</div>') : '';

      return '<div class="card" style="border-right:4px solid ' + accent + '; margin-bottom:10px;">'
        + '<div class="row">'
        + '<div style="min-width:0;"><b style="font-size:15px;">' + esc(m.name) + '</b>'
        + '<div class="muted" style="font-size:11px; margin-top:2px;">'
        + orders.length + ' أوردر · ' + pays.length + ' دفعة</div></div>'
        + '<div style="text-align:left;">'
        + '<div class="amount ' + (bal > 0 ? 'neg' : 'pos') + '" style="font-size:18px;">'
        + egp(Math.abs(bal)) + '</div>'
        + '<div class="muted" style="font-size:10.5px;">' + (bal > 0 ? 'عليك' : (bal < 0 ? 'ليك' : 'متساوي')) + '</div>'
        + '</div></div>'
        + '<div class="muted" style="font-size:11.5px; margin-top:6px;">'
        + 'إجمالي الأوردرات ' + egp(sumO) + ' · المدفوع ' + egp(sumP) + '</div>'
        + '<div style="display:flex; gap:7px; margin-top:11px; flex-wrap:wrap;">'
        + '<button style="flex:2; min-width:110px;" onclick="officeMtxn(\'' + m.id + '\',\'order\')">🧾 أوردر</button>'
        + '<button style="flex:2; min-width:110px; background:linear-gradient(135deg,#10B981,#047857);"'
        + ' onclick="officeMtxn(\'' + m.id + '\',\'payment\')">💵 دفعة</button>'
        + '<button class="ghost" style="flex:1; min-width:88px;" onclick="toggleMerchLog(\'' + m.id + '\')">'
        + (open ? '▲ اقفل' : '📜 السجل (' + txns.length + ')') + '</button>'
        + '<button class="ghost danger" style="padding:11px 13px;" title="مسح التاجر"'
        + ' onclick="deleteMerchant(\'' + m.id + '\', \'' + esc(m.name).replace(/'/g, "") + '\')">🗑️</button>'
        + '</div>' + log + '</div>';
    }).join('');
}

// 🗑️ مسح تاجر — بيتأكد ويقول كام حركة هتتمسح معاه
window.deleteMerchant = async function(id, name){
  const txns = D.mtxns.filter(function(t){ return t.merchantId === id; });
  const bal = merchantBalance(txns);
  let msg = 'هتمسح التاجر «' + name + '» نهائيًا';
  if(txns.length) msg += '\nومعاه ' + txns.length + ' حركة مسجّلة';
  if(bal > 0) msg += '\n⚠️ لسه عليك ' + egp(bal) + ' للتاجر ده!';
  msg += '\n\nالإجراء مفيهوش رجوع. متأكد؟';
  if(!confirm(msg)) return;
  try{
    for(let i = 0; i < txns.length; i += 400){
      const batch = db.batch();
      txns.slice(i, i+400).forEach(function(t){
        batch.delete(db.collection('office_merchant_txns').doc(t.id));
      });
      await batch.commit();
    }
    await db.collection('office_merchants').doc(id).delete();
  }catch(e){ alert('تعذر المسح: ' + e.message); }
};

// 🗑️ مسح حركة واحدة (لو اتسجلت بالغلط)
window.deleteMtxn = async function(id){
  if(!confirm('تمسح الحركة دي؟')) return;
  try{ await db.collection('office_merchant_txns').doc(id).delete(); }
  catch(e){ alert('تعذر المسح: ' + e.message); }
};
// 💬 نافذة إدخال — بديل prompt اللي بيفشل في التطبيق المثبّت
function officeAsk(opts){
  const o = opts || {};
  return new Promise(function(resolve){
    const old = document.getElementById('ofAskOv'); if(old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'ofAskOv';
    ov.style.cssText = 'position:fixed; inset:0; z-index:9000; background:rgba(0,0,0,.6);'
      + 'display:flex; align-items:center; justify-content:center; padding:18px;';
    ov.innerHTML = '<div class="card" style="max-width:400px; width:100%;">'
      + '<div style="font-weight:900; font-size:16px; margin-bottom:4px;">' + (o.title||'') + '</div>'
      + (o.note ? '<div class="muted" style="font-size:12.5px; margin-bottom:12px;">' + o.note + '</div>' : '')
      + '<input id="ofAskA" type="number" inputmode="decimal" placeholder="' + (o.ph||'المبلغ') + '"'
      + ' style="font-size:20px; text-align:center; font-weight:900; margin-bottom:9px;">'
      + '<input id="ofAskB" type="text" placeholder="ملاحظة (اختياري)">'
      + '<div id="ofAskErr" style="color:var(--bad); font-size:12px; min-height:16px; margin-top:5px;"></div>'
      + '<div style="display:flex; gap:8px; margin-top:6px;">'
      + '<button id="ofAskOk" style="flex:2;">تمام</button>'
      + '<button id="ofAskNo" class="ghost" style="flex:1;">إلغاء</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    const a = ov.querySelector('#ofAskA'), b = ov.querySelector('#ofAskB'), er = ov.querySelector('#ofAskErr');
    const done = function(v){ ov.remove(); resolve(v); };
    const ok = function(){
      const n = parseFloat(a.value);
      if(isNaN(n) || n <= 0){ er.textContent = 'اكتب مبلغ صحيح'; a.focus(); return; }
      done({ amount:n, note:(b.value||'').trim() });
    };
    ov.querySelector('#ofAskOk').addEventListener('click', ok);
    ov.querySelector('#ofAskNo').addEventListener('click', function(){ done(null); });
    [a,b].forEach(function(el){ el.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); ok(); }
      if(e.key === 'Escape'){ done(null); }
    }); });
    setTimeout(function(){ try{ a.focus(); }catch(e){} }, 60);
  });
}
window.officeAsk = officeAsk;

window.officeMtxn = async function(mid, type){
  const m = D.merchants.find(function(x){ return x.id === mid; }) || {};
  const res = await officeAsk({
    title: (type === 'order' ? '🧾 أوردر جديد' : '💵 دفعة') + ' — ' + (m.name || ''),
    note: type === 'order' ? 'بيزوّد اللي عليك للتاجر' : 'بتخصم من اللي عليك',
    ph: 'المبلغ بالجنيه'
  });
  if(!res) return;
  const amount = res.amount, note = res.note;
  db.collection('office_merchant_txns').add({ merchantId:mid, type:type, amount:amount, note:note, ts:Date.now() })
    .catch(function(e){ alert('تعذر التسجيل: '+e.message); });
};

/* ============================================================
   💸 المصاريف
   ============================================================ */
$('#exAdd').addEventListener('click', function(){
  const amount = parseFloat($('#exAmount').value);
  const note = $('#exNote').value.trim();
  if(isNaN(amount) || amount <= 0){ alert('اكتب مبلغ صحيح'); return; }
  db.collection('office_expenses').add({ amount:amount, note:note, ts:Date.now(), month:monthKey() })
    .then(function(){ $('#exAmount').value=''; $('#exNote').value=''; })
    .catch(function(e){ alert('تعذر التسجيل: '+e.message); });
});
function renderExpenses(){
  const wrap = $('#expensesList'); if(!wrap) return;
  const mk = monthKey();
  $('#exMonthTotal').textContent = egp(expensesMonthTotal(D.expenses, mk));
  const month = D.expenses.filter(function(e){ return e.month === mk; })
    .sort(function(a,b){ return b.ts - a.ts; }).slice(0, 30);
  if(!month.length){ wrap.innerHTML = '<div class="empty">مفيش مصاريف الشهر ده</div>'; return; }
  wrap.innerHTML = month.map(function(e){
    return '<div class="card row"><span>'+esc(e.note||'مصروف')+' <span class="muted">· '+dstr(e.ts)+'</span></span>' +
      '<span class="amount neg">'+egp(e.amount)+'</span></div>';
  }).join('');
}

/* ============================================================
   📊 التقارير
   ============================================================ */
function fillBranchSel(){
  const sel = $('#topBranchSel'); if(!sel) return;
  const set = {};
  D.employees.forEach(function(e){ if(e.branch) set[e.branch]=1; });
  const brs = Object.keys(set).sort();
  const cur = sel.value;
  sel.innerHTML = brs.map(function(b){ return '<option value="'+esc(b)+'">'+esc(b)+'</option>'; }).join('');
  if(cur && set[cur]) sel.value = cur;
  sel.onchange = renderTop;
  renderTop();
}
function renderTop(){
  const wrap = $('#topSellers'); if(!wrap) return;
  const br = $('#topBranchSel').value;
  if(!br){ wrap.innerHTML = '<div class="empty">…</div>'; return; }
  const top = topSellers(D.sales, br, 10);
  if(!top.length){ wrap.innerHTML = '<div class="empty">مفيش مبيعات متسجلة للفرع ده آخر 30 يوم</div>'; return; }
  wrap.innerHTML = top.map(function(t, i){
    const inv = D.inventory.find(function(p){ return String(p.barcode||'') === t.barcode; });
    const stock = inv ? branchQtyOf(inv, br) : null;
    const low = stock != null && stock <= 3;
    return '<div class="card row">' +
      '<span><b style="color:var(--gold);">#'+(i+1)+'</b> '+esc(t.name)+
      '<div class="muted">'+t.pieces+' قطعة · '+egp(t.revenue)+
      (stock==null ? '' : ' · المخزون: <b style="color:'+(low?'var(--bad)':'var(--good)')+';">'+stock+'</b>'+(low?' ⚠️':''))+
      '</div></span></div>';
  }).join('');
}
function renderSalaries(){
  const wrap = $('#salariesList'); if(!wrap) return;
  const rows = salarySummary(D.employees, D.advances, monthKey());
  if(!rows.length){ wrap.innerHTML = '<div class="empty">مفيش موظفين</div>'; return; }
  let lastBr = '';
  wrap.innerHTML = rows.map(function(r){
    const hdr = r.branch !== lastBr ? '<div class="muted" style="margin:8px 2px 5px; font-weight:800;">🏬 '+esc(r.branch||'—')+'</div>' : '';
    lastBr = r.branch;
    return hdr + '<div class="card row"><span>'+esc(r.name)+
      '<div class="muted">أساسي '+egp(r.base)+' · سلف '+egp(r.advances)+'</div></span>' +
      '<span class="amount '+(r.net<0?'neg':'')+'">'+egp(r.net)+'</span></div>';
  }).join('');
}

// ============================================================
// 📅 شاشة اليوم — سجل المبيعات · ملخص الدفع · ملخص الأصناف
// ------------------------------------------------------------
// ⚠️ الأرقام هنا **لازم تطابق تقفيل الفرع بالظبط**، وإلا الشاشة بلا فايدة.
//    عشان كده اتنسخ منطق الـPOS حرفيًا:
//    · يوم الشغل من الساعة الفاصلة (day_cfg.startHour، افتراضي 6) مش اليوم
//      التقويمي — فاتورة 11 بالليل بتتحسب على يومها، وفاتورة 2 الفجر على اليوم
//      اللي فات (زي ما الكاشير شايفة).
//    · وقت الفاتورة = الطابع المحلي (createdAtMs) مش طابع السيرفر — فاتورة
//      أوفلاين بتترفع متأخر وطابع السيرفر بيبقى وقت الرفع مش وقت البيع.
//    · ملخص الدفع بيشمل الفاتورة الأصلية **والعكس** مع بعض (بيلغوا بعض) —
//      نفس ما بيعمل التقفيل. التقارير هي اللي بتستبعد الطرفين.
// ============================================================
const OF_TZ = 'Africa/Cairo';
let _ofDayCut = 6;          // الساعة الفاصلة — بتتقرا من الإعدادات
let _ofDaySales = [];
let _ofDaySub = 'pay';

async function ofLoadDayCut(){
  try{
    const d = await db.collection('pos_test_settings').doc('day_cfg').get();
    const h = d.exists ? Number((d.data()||{}).startHour) : NaN;
    if(!isNaN(h) && h >= 0 && h <= 23) _ofDayCut = h;
  }catch(e){ console.warn('day_cfg', e && e.code); }
}

// ساعة المحل — نفس فكرة _shopClock في الـPOS
function _ofShopParts(ts){
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: OF_TZ, year:'numeric',
    month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false });
  const o = {};
  f.formatToParts(new Date(ts)).forEach(function(p){ o[p.type] = p.value; });
  return { y:+o.year, m:+o.month, d:+o.day, hh:+(o.hour === '24' ? '0' : o.hour), mm:+o.minute };
}
// إزاحة القاهرة باللحظة دي (بتفرق صيفًا وشتاءً)
function _ofOffsetMs(ts){
  const p = _ofShopParts(ts);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - (Math.floor(ts / 60000) * 60000);
}
// نطاق يوم الشغل لتاريخ مكتوب YYYY-MM-DD
function ofBizDayRange(dateStr){
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 12, 0);          // الظهر عشان نعرف الإزاحة
  const off = _ofOffsetMs(guess);
  const start = Date.UTC(y, m - 1, d, _ofDayCut, 0) - off;
  return { start: start, end: start + 24 * 3600 * 1000 };
}
// وقت البيع الحقيقي — نفس saleTs في الـPOS بحارس الـ48 ساعة
function ofSaleTs(s){
  const server = (s && s.createdAt && typeof s.createdAt.toMillis === 'function') ? s.createdAt.toMillis() : null;
  const local  = (s && typeof s.createdAtMs === 'number') ? s.createdAtMs : null;
  if(local != null && server != null){
    return Math.abs(server - local) <= 48 * 3600000 ? local : server;
  }
  return local != null ? local : server;
}
function ofTime(ts){
  try{ return new Date(ts).toLocaleTimeString('ar-EG', { timeZone:OF_TZ, hour:'2-digit', minute:'2-digit' }); }
  catch(e){ return ''; }
}
function ofNum(n){ return (Math.round((Number(n)||0) * 100) / 100).toLocaleString('ar-EG'); }

// ---- تحميل فواتير اليوم ----
async function ofLoadDay(){
  const br = ($('#dayBranch') || {}).value || '';
  const dt = ($('#dayDate') || {}).value || '';
  if(!br || !dt) return;
  const r = ofBizDayRange(dt);
  const w = $('#dayWindow');
  if(w) w.textContent = 'يوم الشغل: ' + ofTime(r.start) + ' → ' + ofTime(r.end)
        + ' (الساعة الفاصلة ' + _ofDayCut + ')';
  ['#dayPay','#daySales','#dayItems'].forEach(function(id){
    const el = $(id); if(el) el.innerHTML = '<div class="card" style="text-align:center; color:var(--sub);">بيحمّل…</div>';
  });
  try{
    // ⚠️ استعلام بنطاق زمني على السيرفر — مش سحب كل الفواتير وفلترة على الجهاز
    const snap = await db.collection('pos_test_sales')
      .where('branch','==', br)
      .where('createdAt','>=', firebase.firestore.Timestamp.fromMillis(r.start))
      .where('createdAt','<',  firebase.firestore.Timestamp.fromMillis(r.end))
      .get();
    let rows = snap.docs.map(function(d){ const o = d.data(); o.id = d.id; return o; });
    // 🕐 وفلترة تانية بالوقت الحقيقي — فواتير الأوفلاين طابع سيرفرها وقت الرفع
    rows = rows.filter(function(s){ const t = ofSaleTs(s); return t >= r.start && t < r.end; });
    rows.sort(function(a,b){ return ofSaleTs(a) - ofSaleTs(b); });
    _ofDaySales = rows;
  }catch(e){
    console.warn('day load', e);
    ['#dayPay','#daySales','#dayItems'].forEach(function(id){
      const el = $(id);
      if(el) el.innerHTML = '<div class="card" style="color:var(--minus);">تعذر التحميل: '
        + esc(e.code || e.message) + '<div style="font-size:11px; color:var(--sub); margin-top:6px;">'
        + 'لو الرسالة بتقول index، افتح اللينك اللي في الكونسول مرة واحدة.</div></div>';
    });
    return;
  }
  ofRenderDay();
}

function ofRenderDay(){
  ofRenderPay(); ofRenderSales(); ofRenderItems();
}

// ---- 💵 ملخص الدفع ----
function ofRenderPay(){
  const el = $('#dayPay'); if(!el) return;
  const S = _ofDaySales;
  if(!S.length){ el.innerHTML = '<div class="card" style="text-align:center; color:var(--sub);">مفيش فواتير في اليوم ده</div>'; return; }
  let cash=0, visa=0, insta=0, salary=0, total=0;
  let retCount=0, revCount=0, changeGiven=0;
  S.forEach(function(s){
    const p = s.payments || {};
    cash += (p.cash||0); visa += (p.visa||0); insta += (p.instapay||0); salary += (p.salary||0);
    total += (s.total||0);
    if((s.total||0) < 0) retCount++;
    if(s.reversed) revCount++;
    changeGiven += (s.changeGiven||0);
  });
  const row = function(lbl, val, col){
    return '<div style="display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid var(--line);">'
      + '<span>' + lbl + '</span><b style="color:' + (col||'var(--txt)') + ';">' + ofNum(val) + ' ج.م</b></div>';
  };
  el.innerHTML = '<div class="card">'
    + '<div style="font-weight:900; margin-bottom:6px;">💵 ملخص الدفع</div>'
    + row('كاش', cash) + row('فيزا', visa) + row('انستا باي', insta)
    + row('خصم من الراتب', salary)
    + '<div style="display:flex; justify-content:space-between; padding:9px 0; margin-top:4px; border-top:2px solid var(--line);">'
    + '<b>إجمالي المبيعات</b><b style="color:var(--gold);">' + ofNum(total) + ' ج.م</b></div>'
    + '<div style="font-size:11px; color:var(--sub); margin-top:8px;">'
    + S.length + ' فاتورة'
    + (retCount ? ' · ' + retCount + ' مرتجع' : '')
    + (revCount ? ' · ' + revCount + ' معكوسة' : '')
    + (changeGiven ? ' · فكة اتردت ' + ofNum(changeGiven) + ' ج.م' : '')
    + '</div>'
    + '<div style="font-size:11px; color:var(--sub); margin-top:6px; line-height:1.7;">'
    + '⚠️ الأرقام دي بمنطق التقفيل بالظبط: الفاتورة المعكوسة وفاتورة العكس '
    + 'محسوبين مع بعض (بيلغوا بعض)، فالمجموع بيطابق اللي الكاشير شايفاه.'
    + '</div></div>';
}

// ---- 🧾 سجل المبيعات ----
function ofRenderSales(){
  const el = $('#daySales'); if(!el) return;
  const S = _ofDaySales;
  if(!S.length){ el.innerHTML = '<div class="card" style="text-align:center; color:var(--sub);">مفيش فواتير</div>'; return; }
  const PAY = { cash:'كاش', visa:'فيزا', instapay:'انستا', salary:'راتب' };
  const rows = S.map(function(s){
    const t = ofSaleTs(s);
    const p = s.payments || {};
    const ways = Object.keys(PAY).filter(function(k){ return Math.abs(p[k]||0) > 0.005; })
      .map(function(k){ return PAY[k]; }).join(' + ') || '—';
    const isRet = (s.total||0) < 0;
    const tag = s.reversed ? '<span style="color:var(--minus); font-size:10px;"> · معكوسة</span>'
              : (isRet ? '<span style="color:var(--minus); font-size:10px;"> · مرتجع</span>' : '');
    const items = (s.items||[]).length;
    return '<div style="display:flex; justify-content:space-between; align-items:flex-start; padding:8px 0; border-bottom:1px solid var(--line);">'
      + '<div style="min-width:0;">'
      +   '<div style="font-weight:800;">' + ofTime(t) + tag + '</div>'
      +   '<div style="font-size:11px; color:var(--sub);">'
      +     esc(s.employeeName || s.cashierName || '—')
      +     ' · ' + ways + ' · ' + items + ' صنف'
      +     (s.invoiceCode ? (' · ' + esc(s.invoiceCode)) : '')
      +   '</div>'
      + '</div>'
      + '<b style="white-space:nowrap; color:' + (isRet ? 'var(--minus)' : 'var(--txt)') + ';">'
      +   ofNum(s.total) + ' ج.م</b>'
      + '</div>';
  }).join('');
  el.innerHTML = '<div class="card"><div style="font-weight:900; margin-bottom:4px;">🧾 سجل المبيعات ('
    + S.length + ')</div>' + rows + '</div>';
}

// ---- 📦 ملخص الأصناف ----
function ofRenderItems(){
  const el = $('#dayItems'); if(!el) return;
  const S = _ofDaySales;
  if(!S.length){ el.innerHTML = '<div class="card" style="text-align:center; color:var(--sub);">مفيش أصناف</div>'; return; }
  const map = {};
  S.forEach(function(s){
    // ⚠️ الفاتورة المعكوسة وفاتورة العكس **بيتستبعدوا الطرفين** — ده تقرير
    //    أصناف مش تقفيل، والمنتج اللي اتباع واترد مايتحسبش مرتين.
    if(s.reversed || s.isReversal) return;
    (s.items||[]).forEach(function(it){
      if(!it || it.isRedemption || it.isRewardDiscount) return;
      const k = it.id || it.barcode || it.name;
      if(!k) return;
      const q = (it.qty||0) * (it.isReturn ? -1 : 1);
      const m = map[k] || (map[k] = { name: it.name||'—', qty:0, rev:0, cost:0 });
      m.qty += q;
      m.rev += q * (it.price||0);
      m.cost += q * (it.cost||0);
    });
  });
  const arr = Object.keys(map).map(function(k){ return map[k]; })
    .filter(function(m){ return m.qty !== 0; })
    .sort(function(a,b){ return b.rev - a.rev; });
  if(!arr.length){ el.innerHTML = '<div class="card" style="text-align:center; color:var(--sub);">مفيش أصناف</div>'; return; }
  const totQ = arr.reduce(function(n,m){ return n + m.qty; }, 0);
  const totR = arr.reduce(function(n,m){ return n + m.rev; }, 0);
  const totC = arr.reduce(function(n,m){ return n + m.cost; }, 0);
  const rows = arr.map(function(m){
    const profit = m.rev - m.cost;
    return '<div style="display:flex; justify-content:space-between; align-items:flex-start; padding:7px 0; border-bottom:1px solid var(--line);">'
      + '<div style="min-width:0;"><div style="font-weight:700;">' + esc(m.name) + '</div>'
      + '<div style="font-size:11px; color:var(--sub);">' + ofNum(m.qty) + ' قطعة'
      + (m.cost ? (' · ربح ' + ofNum(profit) + ' ج.م') : '') + '</div></div>'
      + '<b style="white-space:nowrap;">' + ofNum(m.rev) + ' ج.م</b></div>';
  }).join('');
  el.innerHTML = '<div class="card">'
    + '<div style="font-weight:900; margin-bottom:4px;">📦 ملخص الأصناف (' + arr.length + ' صنف)</div>'
    + rows
    + '<div style="display:flex; justify-content:space-between; padding:9px 0; border-top:2px solid var(--line); margin-top:4px;">'
    + '<b>' + ofNum(totQ) + ' قطعة</b><b style="color:var(--gold);">' + ofNum(totR) + ' ج.م</b></div>'
    + (totC ? ('<div style="text-align:left; font-size:12px; color:var(--plus); font-weight:800;">ربح: '
        + ofNum(totR - totC) + ' ج.م</div>') : '')
    + '<div style="font-size:11px; color:var(--sub); margin-top:8px;">'
    + '⚠️ الفواتير المعكوسة مستبعدة من الطرفين هنا — عشان الصنف مايتعدّش مرتين. '
    + 'عشان كده الإجمالي هنا ممكن يفرق عن ملخص الدفع.</div>'
    + '</div>';
}

// ---- الربط ----
function ofWireDay(){
  const bs = $('#dayBranch'), dd = $('#dayDate');
  if(!bs || !dd) return;
  if(!dd.value){
    const p = _ofShopParts(Date.now());
    // قبل الساعة الفاصلة = لسه في يوم أمس
    let ms = Date.now();
    if(p.hh < _ofDayCut) ms -= 24 * 3600 * 1000;
    const q = _ofShopParts(ms);
    dd.value = q.y + '-' + String(q.m).padStart(2,'0') + '-' + String(q.d).padStart(2,'0');
  }
  const set = {};
  (D.employees||[]).forEach(function(e){ if(e.branch) set[e.branch] = 1; });
  const brs = Object.keys(set).sort();
  if(brs.length && !bs.options.length){
    bs.innerHTML = brs.map(function(b){ return '<option value="'+esc(b)+'">'+esc(b)+'</option>'; }).join('');
  }
  bs.onchange = ofLoadDay;
  dd.onchange = ofLoadDay;
  document.querySelectorAll('.dayNav').forEach(function(b){
    b.onclick = function(){
      const d = Number(b.dataset.d);
      if(d === 0){
        const p = _ofShopParts(Date.now());
        let ms = Date.now(); if(p.hh < _ofDayCut) ms -= 24*3600*1000;
        const q = _ofShopParts(ms);
        dd.value = q.y + '-' + String(q.m).padStart(2,'0') + '-' + String(q.d).padStart(2,'0');
      } else {
        const [y,m,dy] = dd.value.split('-').map(Number);
        const nx = new Date(Date.UTC(y, m-1, dy + d));
        dd.value = nx.toISOString().slice(0,10);
      }
      ofLoadDay();
    };
  });
  document.querySelectorAll('.daySub').forEach(function(b){
    b.onclick = function(){
      _ofDaySub = b.dataset.s;
      document.querySelectorAll('.daySub').forEach(function(x){ x.classList.remove('on'); });
      b.classList.add('on');
      $('#dayPay').style.display   = (_ofDaySub === 'pay')   ? '' : 'none';
      $('#daySales').style.display = (_ofDaySub === 'sales') ? '' : 'none';
      $('#dayItems').style.display = (_ofDaySub === 'items') ? '' : 'none';
    };
  });
  ofLoadDay();
}
window.ofLoadDay = ofLoadDay;

// ============================================================
// ✅ التاسك الأسبوعي
// ------------------------------------------------------------
// ⚠️ النظام القديم: `sales_tasks/{رقم الموظفة}` — مستند واحد لكل موظفة،
//    فأي تاسك جديد **بيمسح القديم**. مفيش أسبوع ولا حالة ولا تاريخ.
// 🔑 الحل من غير ما نكسر تطبيق الحضور:
//    · `sales_tasks/{empId}` بيفضل زي ما هو (ده اللي الحضور بيقراه) + حقول
//      زيادة (weekKey · assignedBy · assignedAt) — إضافة مش تغيير.
//    · `sales_task_weeks/{empId}__{weekKey}` مستند لكل أسبوع = التاريخ الكامل.
//    تطبيق الحضور محتاج `employeeId` و`taskDescription` و`branch` بس — وكلهم
//    باقيين بنفس الأسماء والمعنى.
// 📅 الأسبوع بيبدأ **السبت** (أسبوع الشغل في مصر). لو عايزها تبدأ يوم تاني،
//    غيّر OF_WEEK_START بس — والنطاق ظاهر على الشاشة عشان تتأكد بعينك.
// ============================================================
const OF_WEEK_START = 6;      // 0=الأحد … 6=السبت
let _tkOffset = 0;            // 0 = الأسبوع ده · -1 اللي فات · +1 اللي جاي
let _tkWeeks = {};            // {empId__weekKey: doc}
let _tkSubs = [];             // تسليمات التاسكات

function ofWeekStartMs(offset){
  // 🕕 بيوم الشغل مش اليوم التقويمي: الساعة 2 فجرًا يوم السبت لسه **يوم
  //    الجمعة** شغلًا، والكاشير اللي في الشيفت ده لازم تشوف تاسك الأسبوع
  //    اللي فات مش الجديد. نفس الفاصلة اللي بيمشي عليها التقفيل والتقارير.
  let ms = Date.now();
  if(_ofShopParts(ms).hh < _ofDayCut) ms -= 86400000;
  const p = _ofShopParts(ms);
  const todayUTC = Date.UTC(p.y, p.m - 1, p.d);
  const dow = new Date(todayUTC).getUTCDay();
  const back = (dow - OF_WEEK_START + 7) % 7;
  return todayUTC - back * 86400000 + (Number(offset) || 0) * 7 * 86400000;
}
function ofWeekKey(ms){
  const d = new Date(ms);
  return 'w' + d.getUTCFullYear() + '-'
    + String(d.getUTCMonth() + 1).padStart(2,'0') + '-'
    + String(d.getUTCDate()).padStart(2,'0');
}
function ofWeekLabel(ms){
  const a = new Date(ms), b = new Date(ms + 6 * 86400000);
  const f = function(x){ return x.getUTCDate() + '/' + (x.getUTCMonth() + 1); };
  return f(a) + ' → ' + f(b);
}

async function ofLoadTasks(){
  const br = ($('#tkBranch') || {}).value || '';
  const list = $('#tkList');
  if(!br || !list) return;
  const wkMs = ofWeekStartMs(_tkOffset);
  const wk = ofWeekKey(wkMs);
  const rg = $('#tkRange');
  if(rg) rg.textContent = 'الأسبوع: ' + ofWeekLabel(wkMs)
    + (_tkOffset === 0 ? ' (الحالي)' : '');
  list.innerHTML = '<div class="card" style="text-align:center; color:var(--sub);">بيحمّل…</div>';
  try{
    const [wSnap, sSnap] = await Promise.all([
      db.collection('sales_task_weeks').where('branch','==', br).where('weekKey','==', wk).get(),
      db.collection('sales_task_submissions').where('branch','==', br)
        .where('submittedAt','>=', wkMs).where('submittedAt','<', wkMs + 7 * 86400000).get()
    ]);
    _tkWeeks = {};
    wSnap.docs.forEach(function(d){ _tkWeeks[d.id] = d.data(); });
    _tkSubs = sSnap.docs.map(function(d){ return d.data(); });
  }catch(e){
    console.warn('tasks load', e);
    list.innerHTML = '<div class="card" style="color:var(--minus);">تعذر التحميل: '
      + esc(e.code || e.message) + '<div style="font-size:11px; color:var(--sub); margin-top:6px;">'
      + 'لو الرسالة بتقول index، افتح اللينك اللي في الكونسول مرة واحدة.</div></div>';
    return;
  }
  ofRenderTasks(br, wk);
}

function ofRenderTasks(br, wk){
  const list = $('#tkList'); if(!list) return;
  const emps = (D.employees || []).filter(function(e){
    return e.branch === br && e.status !== 'terminated';
  }).sort(function(a,b){ return String(a.name||'').localeCompare(String(b.name||''),'ar'); });
  if(!emps.length){ list.innerHTML = '<div class="card" style="text-align:center; color:var(--sub);">مفيش موظفين في الفرع ده</div>'; return; }

  const rows = emps.map(function(e){
    const rec = _tkWeeks[e.id + '__' + wk] || null;
    const desc = rec ? (rec.taskDescription || '') : '';
    const subs = _tkSubs.filter(function(s){ return s.employeeId === e.id; });
    const okCount = subs.filter(function(s){ return s.confirmed; }).length;
    const rejCount = subs.filter(function(s){ return s.rejected; }).length;
    const waiting = subs.length - okCount - rejCount;
    let chip = '<span style="color:var(--sub); font-size:11px;">مفيش تسليم</span>';
    if(subs.length){
      chip = '<span style="font-size:11px;">'
        + (okCount ? '<span style="color:var(--plus);">✅ ' + okCount + '</span> ' : '')
        + (waiting ? '<span style="color:var(--gold);">⏳ ' + waiting + '</span> ' : '')
        + (rejCount ? '<span style="color:var(--minus);">✖ ' + rejCount + '</span>' : '')
        + '</span>';
    }
    return '<div class="card" style="padding:11px;">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:7px;">'
      +   '<b>' + esc(e.name || '—') + '</b>' + chip
      + '</div>'
      + '<div style="display:flex; gap:6px;">'
      +   '<input class="tkIn" data-id="' + esc(e.id) + '" data-name="' + esc(e.name||'') + '" '
      +     'placeholder="تاسك الأسبوع… (مثلاً: سكشن A)" value="' + esc(desc).replace(/"/g,'&quot;') + '" style="flex:1;">'
      +   '<button class="tkSave" data-id="' + esc(e.id) + '" style="min-width:64px;">حفظ</button>'
      + '</div>'
      + (rec && rec.assignedAt ? ('<div style="font-size:10px; color:var(--sub); margin-top:5px;">اتحدد '
          + dstr(rec.assignedAt) + '</div>') : '')
      + '</div>';
  }).join('');

  list.innerHTML = rows
    + '<div class="card" style="font-size:11px; color:var(--sub); line-height:1.8;">'
    + '⚠️ التاسك اللي بتكتبه هنا هو اللي الموظفة بتشوفه في تطبيق الحضور وبتسلّم عليه صورة.<br>'
    + 'الأسابيع القديمة محفوظة — ارجع بالأسهم فوق وشوفها.'
    + '</div>';

  list.querySelectorAll('.tkSave').forEach(function(btn){
    btn.onclick = async function(){
      const inp = list.querySelector('.tkIn[data-id="' + btn.dataset.id + '"]');
      if(!inp) return;
      const desc = inp.value.trim();
      const emp = emps.filter(function(x){ return x.id === btn.dataset.id; })[0];
      if(!emp) return;
      const old = btn.textContent;
      btn.textContent = '…'; btn.disabled = true;
      try{
        const payload = {
          employeeId: emp.id, employeeName: emp.name || '', branch: br,
          taskDescription: desc, weekKey: wk, assignedAt: Date.now(), assignedBy: 'office'
        };
        // 📖 اللي تطبيق الحضور بيقراه — نفس الشكل بالظبط + حقول زيادة
        await db.collection('sales_tasks').doc(emp.id).set(payload, { merge: true });
        // 🗂️ وسجل الأسبوع — ده اللي بيخلي التاريخ يفضل
        await db.collection('sales_task_weeks').doc(emp.id + '__' + wk).set(payload, { merge: true });
        _tkWeeks[emp.id + '__' + wk] = payload;
        btn.textContent = 'اتحفظ ✅';
        setTimeout(function(){ btn.textContent = old; btn.disabled = false; }, 1400);
      }catch(err){
        btn.textContent = 'فشل'; btn.disabled = false;
        alert('ماتحفظش: ' + (err.code || err.message));
      }
    };
  });
}

function ofWireTasks(){
  const bs = $('#tkBranch'); if(!bs) return;
  const set = {};
  (D.employees || []).forEach(function(e){ if(e.branch) set[e.branch] = 1; });
  const brs = Object.keys(set).sort();
  if(brs.length && !bs.options.length){
    bs.innerHTML = brs.map(function(b){ return '<option value="'+esc(b)+'">'+esc(b)+'</option>'; }).join('');
  }
  bs.onchange = ofLoadTasks;
  document.querySelectorAll('.tkNav').forEach(function(b){
    b.onclick = function(){
      const d = Number(b.dataset.d);
      _tkOffset = (d === 0) ? 0 : _tkOffset + d;
      ofLoadTasks();
    };
  });
  ofLoadTasks();
}
window.ofLoadTasks = ofLoadTasks;

// ============================================================
// 🔁 المصاريف المتكررة — قوالب شهرية لكل فرع
// ------------------------------------------------------------
// المشكلة: الإيجار والكهربا بيتكتبوا يدوي كل شهر، وسهل ينسوا.
// الحل: قالب لكل مصروف (الفرع · النوع · المبلغ)، والنظام بيوريك اللي
// **لسه ماتدفعش الشهر ده** بزرار تسجيل بضغطة.
//
// 🔑 نوعين:
//   · ثابت (الإيجار) — المبلغ محفوظ، بتدوس تسجيل وخلاص
//   · متغيّر (الكهربا) — بيسألك المبلغ في كل مرة
//
// ⚠️ التسجيل بيكتب في `office_expenses` بنفس الشكل القديم بالظبط
//    (amount · note · ts · month) + حقول زيادة، فحساب الأرباح والإجماليات
//    مايتأثرش. القوالب في مجموعة منفصلة — مش مصاريف فعلية.
// 🛡️ ومفيش تسجيل تلقائي: النظام بيقترح، وانت اللي بتأكد. مصروف بيتسجل
//    لوحده من غير ما حد يشوفه = رقم غلط في الأرباح ومحدش واخد باله.
// ============================================================
const OF_RECUR_COL = 'office_recurring';

function ofRecurKey(tpl, mk){ return String(tpl.id) + '__' + mk; }

// اتدفع الشهر ده؟ بندوّر على مصروف متسجّل من القالب ده
function ofRecurPaid(tpl, mk){
  return (D.expenses || []).filter(function(e){
    return e && e.month === mk && e.recurringId === tpl.id;
  })[0] || null;
}

function ofRenderRecurring(){
  const wrap = $('#recurringBox'); if(!wrap) return;
  const mk = monthKey();
  const tpls = (D.recurring || []).slice().sort(function(a,b){
    return String(a.branch||'').localeCompare(String(b.branch||''),'ar')
        || String(a.note||'').localeCompare(String(b.note||''),'ar');
  });

  const due = tpls.filter(function(t){ return !ofRecurPaid(t, mk); });
  const dueTotal = due.reduce(function(n,t){ return n + (t.kind === 'fixed' ? (Number(t.amount)||0) : 0); }, 0);

  const rows = tpls.map(function(t){
    const paid = ofRecurPaid(t, mk);
    const isFixed = t.kind === 'fixed';
    const amtTxt = isFixed ? egp(t.amount) : '<span style="color:var(--sub);">متغيّر</span>';
    return '<div style="background:var(--panel2); border:1px solid ' + (paid ? 'var(--line)' : '#5a4a2a')
      + '; border-radius:11px; padding:11px; margin-bottom:8px;">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">'
      +   '<div style="min-width:0;">'
      +     '<div style="font-weight:800;">' + esc(t.note || 'مصروف') + '</div>'
      +     '<div style="font-size:11px; color:var(--sub);">' + esc(t.branch || 'الشركة')
      +       ' · ' + (isFixed ? 'ثابت' : 'متغيّر') + '</div>'
      +   '</div>'
      +   '<div style="text-align:left; white-space:nowrap;">' + amtTxt + '</div>'
      + '</div>'
      + '<div style="display:flex; gap:6px; margin-top:9px;">'
      +   (paid
          ? ('<div style="flex:1; color:var(--plus); font-size:12px; font-weight:700;">✅ اتدفع '
             + dstr(paid.ts) + ' · ' + egp(paid.amount) + '</div>')
          : ('<button class="recPay" data-id="' + esc(t.id) + '" style="flex:1; padding:9px; border:none;'
             + ' border-radius:9px; background:linear-gradient(180deg,#3fbf60,#1f9440); color:#fff;'
             + ' font-family:\'Cairo\'; font-weight:800; cursor:pointer;">💰 سجّل الدفع</button>'))
      +   '<button class="recDel" data-id="' + esc(t.id) + '" style="padding:9px 12px; border:1px solid var(--line);'
      +     ' border-radius:9px; background:var(--panel); color:var(--sub); font-family:\'Cairo\'; cursor:pointer;">🗑️</button>'
      + '</div></div>';
  }).join('');

  wrap.innerHTML =
    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:9px;">'
    + '<b style="font-size:14px;">🔁 المصاريف المتكررة</b>'
    + (due.length
        ? ('<span style="background:#5a4a2a; color:var(--gold); border-radius:8px; padding:3px 10px; font-size:11.5px; font-weight:800;">'
           + due.length + ' لسه ماتدفعش</span>')
        : '<span style="color:var(--plus); font-size:11.5px; font-weight:700;">✅ الشهر ده كامل</span>')
    + '</div>'
    + (dueTotal ? ('<div style="font-size:11.5px; color:var(--sub); margin-bottom:8px;">المستحق الثابت: '
        + egp(dueTotal) + '</div>') : '')
    + (rows || '<div style="color:var(--sub); font-size:12px; margin-bottom:8px;">مفيش قوالب — ضيف الإيجار والكهربا مرة واحدة وهيفضلوا يتكرروا.</div>')
    + '<button id="recAdd" style="width:100%; padding:10px; border:1px dashed var(--line); border-radius:10px;'
    + ' background:var(--panel); color:var(--sub); font-family:\'Cairo\'; font-weight:700; cursor:pointer;">➕ قالب جديد</button>';

  // 💰 تسجيل الدفع
  wrap.querySelectorAll('.recPay').forEach(function(b){
    b.onclick = async function(){
      const t = (D.recurring||[]).filter(function(x){ return x.id === b.dataset.id; })[0];
      if(!t) return;
      let amount = Number(t.amount) || 0;
      if(t.kind !== 'fixed'){
        const v = prompt('مبلغ ' + (t.note||'المصروف') + ' لشهر ' + mk + ':', '');
        if(v === null) return;
        amount = parseFloat(v);
      }
      if(!(amount > 0)){ alert('اكتب مبلغ صحيح'); return; }
      // ⚠️ فحص أخير قبل الكتابة — يمنع الدفع مرتين لو الشاشة قديمة أو
      //    الجهاز التاني سجّلها في نفس اللحظة
      if(ofRecurPaid(t, mk)){ alert('المصروف ده اتسجل خلاص الشهر ده'); ofRenderRecurring(); return; }
      b.disabled = true; b.textContent = 'بيتسجل…';
      try{
        await db.collection('office_expenses').add({
          amount: amount,
          note: (t.note || 'مصروف') + (t.branch ? (' — ' + t.branch) : ''),
          ts: Date.now(), month: mk,
          recurringId: t.id, branch: t.branch || null   // 🔗 الربط بالقالب
        });
      }catch(e){ alert('تعذر التسجيل: ' + e.message); b.disabled = false; b.textContent = '💰 سجّل الدفع'; }
    };
  });

  // 🗑️ مسح القالب — المصاريف المتسجلة بتفضل
  wrap.querySelectorAll('.recDel').forEach(function(b){
    b.onclick = async function(){
      const t = (D.recurring||[]).filter(function(x){ return x.id === b.dataset.id; })[0];
      if(!t) return;
      if(!confirm('تمسح قالب "' + (t.note||'') + '"؟\n\nالمصاريف اللي اتسجلت منه قبل كده هتفضل زي ما هي — '
        + 'ده بيوقف التذكير الشهري بس.')) return;
      try{ await db.collection(OF_RECUR_COL).doc(t.id).delete(); }
      catch(e){ alert('تعذر المسح: ' + e.message); }
    };
  });

  const add = wrap.querySelector('#recAdd');
  if(add) add.onclick = async function(){
    const note = prompt('اسم المصروف؟ (إيجار / كهربا / نت ...)');
    if(!note || !note.trim()) return;
    const set = {};
    (D.employees||[]).forEach(function(e){ if(e.branch) set[e.branch] = 1; });
    const brs = Object.keys(set).sort();
    const brTxt = prompt('الفرع؟ اكتب الاسم بالظبط:\n\n' + brs.join('\n'), brs[0] || '');
    if(brTxt === null) return;
    const isFixed = confirm('المبلغ ثابت كل شهر؟\n\nموافق = ثابت (زي الإيجار)\nإلغاء = متغيّر (زي الكهربا)');
    let amount = 0;
    if(isFixed){
      const v = prompt('المبلغ الثابت:', '');
      if(v === null) return;
      amount = parseFloat(v);
      if(!(amount > 0)){ alert('اكتب مبلغ صحيح'); return; }
    }
    try{
      await db.collection(OF_RECUR_COL).add({
        note: note.trim(), branch: brTxt.trim() || null,
        kind: isFixed ? 'fixed' : 'variable',
        amount: isFixed ? amount : null,
        createdAt: Date.now()
      });
    }catch(e){ alert('تعذر الحفظ: ' + e.message); }
  };
}
window.ofRenderRecurring = ofRenderRecurring;
