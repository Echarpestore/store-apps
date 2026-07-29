/* ============================================================
   🏢 echarpe office — إدارة البيزنس (للمالك)
   الوارد الحي · النواقص · التجار والمصاريف · التقارير
   الإشعارات: محلية والتطبيق مفتوح/في الخلفية —
   والـ push الكامل (والتطبيق مقفول) بييجي مع Cloud Function (آخر خطوة).
   ============================================================ */
'use strict';

const OWNER_CODE = '2005';

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
let ownerOk = sessionStorage.getItem('office_owner_ok') === '1';

$('#gLogin').addEventListener('click', async function(){
  const em = $('#gEmail').value.trim(), pw = $('#gPass').value;
  $('#gateErr').textContent = '';
  if(!em || !pw){ $('#gateErr').textContent = 'اكتب الإيميل والباسورد'; return; }
  try{
    await firebase.auth().signInWithEmailAndPassword(em, pw);
    localStorage.setItem('office_email', em);
  }catch(e){ $('#gateErr').textContent = 'دخول غلط: ' + (e.code||''); }
});
$('#gCodeBtn').addEventListener('click', function(){
  if($('#gCode').value === OWNER_CODE){
    ownerOk = true;
    sessionStorage.setItem('office_owner_ok','1');
    refreshGate(firebase.auth().currentUser);
  } else { $('#gateErr').textContent = 'كود غلط'; $('#gCode').value=''; }
});
$('#gCode').addEventListener('keydown', function(e){ if(e.key==='Enter') $('#gCodeBtn').click(); });

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
    setTimeout(function(){ $('#gCode').focus(); }, 100);
    return;
  }
  $('#gate').style.display = 'none';
  $('#hdrSub').textContent = 'متوصّل ✅ · ' + new Date().toLocaleDateString('ar-EG', { weekday:'long', day:'numeric', month:'long' });
  startData();
}
firebase.auth().onAuthStateChanged(refreshGate);

/* ============================================================
   🗂️ التبويبات
   ============================================================ */
document.querySelectorAll('#tabsNav button').forEach(function(b){
  b.addEventListener('click', function(){
    document.querySelectorAll('#tabsNav button').forEach(function(x){ x.classList.remove('on'); });
    document.querySelectorAll('.tabPage').forEach(function(x){ x.classList.remove('on'); });
    b.classList.add('on');
    document.getElementById('page-' + b.dataset.page).classList.add('on');
  });
});
document.getElementById('page-inbox').classList.add('on');

/* ============================================================
   📡 البيانات الحية + الإشعارات
   ============================================================ */
const D = { leaves:[], regs:[], orders:[], shorts:[], merchants:[], mtxns:[], expenses:[],
            employees:[], advances:[], sales:[], inventory:[], customers:[], ratings:[] };
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
  });
  db.collection('sales_employees').onSnapshot(function(s){
    D.employees = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    renderSalaries(); fillBranchSel(); renderPL();
  });
  db.collection('sales_advances').onSnapshot(function(s){
    D.advances = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    renderSalaries(); renderPL();
  });
  // مبيعات آخر 30 يوم (قراءة دورية مش snapshot — أخف على الموبايل)
  loadSales(); setInterval(loadSales, 5*60*1000);
  loadCustomers(); setInterval(loadCustomers, 10*60*1000);
  loadRatings(); setInterval(loadRatings, 5*60*1000);
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
function loadCustomers(){
  db.collection('pos_test_customers').get().then(function(s){
    D.customers = s.docs.map(function(d){ return Object.assign({ _id:d.id }, d.data()); });
    try{ renderActivityReports(); }catch(e){ console.warn('activity', e); }
  }).catch(function(e){ console.warn('customers load', e); });
}

// ⭐ تقييمات العملاء (آخر 30 يوم)
function loadRatings(){
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
function renderMerchants(){
  const wrap = $('#merchantsList'); if(!wrap) return;
  if(!D.merchants.length){ wrap.innerHTML = '<div class="empty">ضيف أول تاجر</div>'; return; }
  wrap.innerHTML = D.merchants
    .slice().sort(function(a,b){ return (a.name||'') < (b.name||'') ? -1 : 1; })
    .map(function(m){
      const txns = D.mtxns.filter(function(t){ return t.merchantId === m.id; });
      const bal = merchantBalance(txns);
      const last3 = txns.slice().sort(function(a,b){ return b.ts - a.ts; }).slice(0,3);
      return '<div class="card">' +
        '<div class="row"><b style="font-size:14px;">'+esc(m.name)+'</b>' +
        '<span class="amount '+(bal>0?'neg':'pos')+'">'+(bal>0?'عليك ':'')+egp(Math.abs(bal))+'</span></div>' +
        (last3.length ? '<div class="muted" style="margin-top:5px;">'+ last3.map(function(t){
            return (t.type==='order'?'🧾 أوردر ':'💵 دفعة ') + egp(t.amount) + (t.note?' ('+esc(t.note)+')':'') + ' · ' + dstr(t.ts);
          }).join('<br>') + '</div>' : '') +
        '<div style="display:flex; gap:7px; margin-top:10px;">' +
        '<button class="btn no" style="flex:1;" onclick="officeMtxn(\''+m.id+'\',\'order\')">🧾 أوردر جديد</button>' +
        '<button class="btn gold" style="flex:1;" onclick="officeMtxn(\''+m.id+'\',\'payment\')">💵 دفعة</button>' +
        '</div></div>';
    }).join('');
}
window.officeMtxn = function(mid, type){
  const label = type === 'order' ? 'قيمة الأوردر الجديد (بيزوّد اللي عليك)' : 'قيمة الدفعة (بتخصم)';
  const v = prompt(label + ' بالجنيه:');
  if(v === null) return;
  const amount = parseFloat(v);
  if(isNaN(amount) || amount <= 0){ alert('اكتب مبلغ صحيح'); return; }
  const note = prompt('ملاحظة (اختياري):') || '';
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
