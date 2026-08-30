// 📱 إحصائيات تحميل التطبيق — بتتحسب من بيانات العميل نفسها
// hasApp: عنده توكن إشعارات = التطبيق متسطّب وفاتح فعلًا
// fromApp: اتسجّل من التطبيق (source بيبدأ بـ loyalty_app أو glow_app)
/* 🔔 عنده توكن إشعارات؟ — بيقرا الشكلين:
   · الجديد: fcmTokens_echarpe / fcmTokens_glow (مصفوفات)
   · القديم: fcmTokens (خريطة بمفاتيح توكنات — كانت بتتقطّع لو التوكن فيه نقطة)
   لازم الاتنين لأن العملاء القدام لسه بياناتهم بالشكل القديم لحد ما
   يفتحوا التطبيق تاني. */
function custHasPush(c){
  if(!c) return false;
  if(Array.isArray(c.fcmTokens_echarpe) && c.fcmTokens_echarpe.length) return true;
  if(Array.isArray(c.fcmTokens_glow) && c.fcmTokens_glow.length) return true;
  const t = c.fcmTokens;
  if(Array.isArray(t)) return t.length > 0;
  if(t && typeof t === 'object') return Object.keys(t).length > 0;
  return !!t;
}
window.custHasPush = custHasPush;

function customerAppStats(list){
  const out = { hasApp:0, fromApp:0, fromCashier:0, bySource:{ qr:0, receipt:0, emp:0, other:0 },
                welcomeGranted:0, welcomeUsed:0, welcomePoints:0 };
  (list||[]).forEach(function(c){
    if(!c) return;
    // 🎁 مكافأة الترحيب: الدالة بتحط welcomeGranted_<brand> بتاريخ أول ما تتصرف
    const gotWelcome = !!(c.welcomeGranted_echarpe || c.welcomeGranted_glow);
    if(gotWelcome) out.welcomeGranted++;
    // المكافأة نفسها متعلّمة welcome:true — بنشوف اتستعملت ولا لسه
    let usedWl = false, hasWlReward = false;
    (Array.isArray(c.rewards) ? c.rewards : []).forEach(function(r){
      if(!r || !r.welcome) return;
      hasWlReward = true;
      if(r.used) usedWl = true;
    });
    if(usedWl) out.welcomeUsed++;
    // اللي مكافأته كانت نقط (مش قسيمة) مالهاش سطر في rewards
    if(gotWelcome && !hasWlReward) out.welcomePoints++;
    const hasToken = custHasPush(c);
    if(hasToken) out.hasApp++;
    const src = String(c.source || '');
    if(/^(loyalty_app|glow_app)/.test(src)){
      out.fromApp++;
      const tail = src.split(':')[1] || '';
      if(/^qr/.test(tail)) out.bySource.qr++;
      else if(/^(rcpt|receipt)/.test(tail)) out.bySource.receipt++;
      else if(/^emp/.test(tail)) out.bySource.emp++;
      else out.bySource.other++;
    } else {
      out.fromCashier++;
    }
  });
  return out;
}
if(typeof window !== 'undefined') window.customerAppStats = customerAppStats;

// ⚠️ ملف مُقسّم من app.js — جزء من نظام POS. الترتيب في index.html مهم:
// pos-core.js ← pos-admin.js ← pos-reports.js ← pos-sale.js ← app.js

// ---------------- Roles / permissions screen (manager only) ----------------
// 🔢 توليد أكواد البياعات
// الكود ثابت للموظف ومبيتعادش استخدامه بعد ما يمشي — عشان الكاشير
// اللي بيكتب الكود من العادة ما يبعتش بيعة لموظفة جديدة أخدت نفس الرقم.
async function genSellerCodes(){
  try{
    const snap = await db.collection('sales_employees').get();
    const all = snap.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
    // كل الأكواد المستخدمة قبل كده — حتى بتاعة اللي مشيوا
    const used = new Set();
    all.forEach(function(e){ if(e.sellerCode) used.add(String(e.sellerCode)); });
    const cfgDoc = await db.collection(TEST_SETTINGS).doc('seller_codes').get();
    const retired = (cfgDoc.exists ? (cfgDoc.data().retired || []) : []).map(String);
    retired.forEach(function(c){ used.add(c); });

    const need = all.filter(function(e){
      return e.active !== false && !e.isAdminAccount && !e.sellerCode;
    });
    if(!need.length){ showToast('كل الموظفين عندهم أكواد ✅', 'ok'); listSellerCodes(all); return; }

    let n = 1, done = 0;
    const batch = db.batch();
    need.forEach(function(e){
      while(used.has(String(n).padStart(2,'0'))) n++;
      const code = String(n).padStart(2,'0');
      used.add(code); n++;
      batch.update(db.collection('sales_employees').doc(e.id), { sellerCode: code });
      e.sellerCode = code; done++;
    });
    await batch.commit();
    // نسجّل الأكواد كمستخدمة للأبد
    await db.collection(TEST_SETTINGS).doc('seller_codes')
      .set({ retired: Array.from(used) }, { merge:true });
    showToast('✅ اتولّد ' + done + ' كود', 'ok');
    listSellerCodes(all);
  }catch(e){ showToast('تعذر التوليد: ' + (e.message || e), 'err'); }
}
if(typeof window !== 'undefined') window.genSellerCodes = genSellerCodes;

function listSellerCodes(all){
  const box = document.getElementById('sellerCodesList'); if(!box) return;
  const rows = (all || []).filter(function(e){ return e.active !== false && !e.isAdminAccount; })
    .sort(function(a,b){ return String(a.sellerCode||'zz').localeCompare(String(b.sellerCode||'zz')); });
  if(!rows.length){ box.innerHTML = ''; return; }
  box.innerHTML = rows.map(function(e){
    return '<div style="display:flex; justify-content:space-between; align-items:center;'
      + 'padding:8px 11px; border:1px solid var(--ui-line); border-radius:10px; margin-bottom:5px;'
      + 'background:' + (e.sellerCode ? '#f5f3ff' : '#fff') + ';">'
      + '<span style="font-weight:700; font-size:13px;">' + (e.name || '—')
      + '<span style="color:var(--ui-mut); font-weight:400; font-size:11px;"> · '
      + (e.branch || '') + '</span></span>'
      + '<b style="font-size:17px; color:' + (e.sellerCode ? '#6D28D9' : '#9ca3af') + ';">'
      + (e.sellerCode || '—') + '</b></div>';
  }).join('');
}
if(typeof window !== 'undefined') window.listSellerCodes = listSellerCodes;

// 🕕 إعداد ساعة بداية يوم الشغل
async function saveDayStartHour(el){
  let v = parseInt(el.value, 10);
  if(isNaN(v) || v < 0 || v > 23){ showToast('الساعة لازم تكون من 0 لـ23', 'err'); return; }
  try{
    await db.collection(TEST_SETTINGS).doc('day_cfg').set({ startHour: v }, { merge:true });
    showToast('اتحفظ: يوم الشغل بيبدأ الساعة ' + v + ' صباحًا', 'ok');
  }catch(e){ showToast('تعذر الحفظ: ' + (e && e.message ? e.message : e), 'err'); }
}
if(typeof window !== 'undefined') window.saveDayStartHour = saveDayStartHour;

const PERM_LABELS = {
  canSell:'يبيع', canHold:'يعمل Hold/Unhold', canPrintLabel:'يطبع Price Label',
  canViewCostPrice:'يشوف سعر التكلفة', canViewStock:'يشوف المخزون (الكميات)', canViewLogs:'يشوف السجلات', canRefund:'يعمل استرجاع',
  canResetCustomerPin:'يمسح الرقم السري للعميل', canEditInventory:'يعدّل/يضيف مخزون', canReceiveGoods:'يستلم/يخرج بضاعة', canChangePrices:'يغيّر الأسعار',
  canViewReports:'يشوف التقارير المالية', canManageRoles:'يدير الصلاحيات', canSwitchBranch:'يبدّل الفرع (أدمن)',
  canDiscount:'يعمل خصم', canOpenDrawer:'يفتح الدرج', canReverse:'يعكس فاتورة'
};
// 🔢 حفظ أقصى نسبة خصم للدور
async function setRoleMaxDiscount(el){
  const roleKey = el.dataset.role;
  let v = parseInt(el.value, 10);
  if(isNaN(v) || v < 0) v = 0;
  if(v > 100) v = 100;
  el.value = v;
  try{
    await db.collection(TEST_ROLES).doc(roleKey).set({ maxDiscountPct: v }, { merge:true });
    if(!rolePermissions[roleKey]) rolePermissions[roleKey] = {};
    rolePermissions[roleKey].maxDiscountPct = v;
    showToast('اتحفظ: أقصى خصم ' + v + '% لـ' + ((rolePermissions[roleKey]||{}).label || roleKey), 'ok');
  }catch(e){
    showToast('تعذر الحفظ: ' + (e && e.message ? e.message : e), 'err');
  }
}
if(typeof window !== 'undefined') window.setRoleMaxDiscount = setRoleMaxDiscount;

async function renderRolesScreen(){
  const wrap = document.getElementById('rolePermsWrap');
  wrap.innerHTML = Object.keys(DEFAULT_ROLE_PERMISSIONS).map(roleKey=>{
    const perms = rolePermissions[roleKey];
    const toggles = Object.keys(PERM_LABELS).map(permKey=>`
      <label style="display:flex; align-items:center; gap:6px; font-size:12px; padding:4px 0;">
        <input type="checkbox" data-role="${roleKey}" data-perm="${permKey}" ${perms[permKey]?'checked':''} onchange="toggleRolePerm(this)">
        ${PERM_LABELS[permKey]}
      </label>`).join('');
    // 🔢 أقصى نسبة خصم — رقم مش checkbox، فمحتاج حقل خاص بيه
    const defPct = (DEFAULT_ROLE_PERMISSIONS[roleKey]||{}).maxDiscountPct;
    const curPct = (perms.maxDiscountPct === undefined || perms.maxDiscountPct === null)
      ? (defPct === undefined ? 0 : defPct) : perms.maxDiscountPct;
    return `
    <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:12px; margin-bottom:10px;">
      <div style="font-weight:800; margin-bottom:6px;">${perms.label}</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:2px;">${toggles}</div>
      <div style="display:flex; align-items:center; gap:8px; margin-top:10px; padding-top:10px; border-top:1px dashed var(--border);">
        <span style="font-size:12px; font-weight:700;">أقصى نسبة خصم</span>
        <input type="number" min="0" max="100" step="1" value="${curPct}"
          data-role="${roleKey}" data-pct="1" onchange="setRoleMaxDiscount(this)"
          style="width:80px; padding:6px 8px; border-radius:8px; border:1.5px solid var(--border);
                 background:var(--panel2); color:var(--text); font-weight:800; text-align:center;">
        <span style="font-size:12px; color:var(--muted);">%</span>
        <span style="font-size:11px; color:var(--muted);">(صفر = ممنوع يخصم)</span>
      </div>
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
  // 📟 لوحة ماكينة الفيزا بتتملا مع فتح الشاشة (كانت بتفضل فاضية)
  try{ loadPaymobCfgUI(); }catch(e){ console.warn('paymob cfg ui', e); }
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

// ============================================================
// 📟 ماكينة الفيزا (Paymob) — تسجيل رقم الماكينة لكل فرع
// ⚠️ الشاشة كانت مبنية في index.html وزرار «حفظ» بينادي savePaymobCfg()
// اللي ماكانتش متكتبة أصلًا — الزرار كان بيدوس على فراغ من غير أي رسالة.
// الإعداد بيتقري في pos-sale.js من pos_test_settings/paymob:
//   { enabled, autoPrint, terminalIdByBranch: { الفرع: الرقم } }
// ============================================================

// 🚧 التحقق — دالة نقية عشان تتختبر بالـharness
// ⛔ الأهم: فرعين بنفس رقم الماكينة = فلوس فرع بتتسجل على فرع تاني،
// والتقفيل بيطلع عجز في واحد وأوفر في التاني.
function paymobCfgReject(terminalId, branch, byBranch){
  const t = String(terminalId == null ? '' : terminalId).trim();
  if(!branch) return 'مفيش فرع محدد — اقفل وافتح تاني';
  if(!t) return 'اكتب رقم الماكينة';
  if(!/^\d+$/.test(t)) return 'رقم الماكينة أرقام إنجليزي بس — من غير مسافات ولا حروف';
  if(t.length > 12) return 'رقم الماكينة طويل أوي — راجعه من لوحة Paymob';
  if(/^0+$/.test(t)) return 'رقم الماكينة مش صح';
  const map = byBranch || {};
  const clash = Object.keys(map).filter(function(b){
    return b !== branch && String(map[b] || '').trim() === t;
  })[0];
  if(clash) return 'الرقم ده متسجل على فرع «' + clash + '» — كل فرع لازم يكون له ماكينة لوحده';
  return null;
}
if(typeof window !== 'undefined') window.paymobCfgReject = paymobCfgReject;

function _pmbErr(msg){
  const box = document.getElementById('pmbErr');
  if(box) box.textContent = msg || '';
}

// 📥 بيملا الشاشة بالمحفوظ + بيعرض ماكينات باقي الفروع
async function loadPaymobCfgUI(){
  const nameEl = document.getElementById('pmbBranchName');
  const idEl   = document.getElementById('pmbTerminalId');
  const enEl   = document.getElementById('pmbEnabled');
  const others = document.getElementById('pmbOthers');
  if(!idEl) return;                       // الشاشة مش مفتوحة
  if(nameEl) nameEl.textContent = currentBranch || 'الفرع ده';
  _pmbErr('');
  try{
    const snap = await db.collection(TEST_SETTINGS).doc('paymob').get();
    const cfg = snap.exists ? (snap.data() || {}) : {};
    const map = cfg.terminalIdByBranch || {};
    idEl.value = map[currentBranch] || '';
    if(enEl) enEl.checked = cfg.enabled === true;
    if(others){
      const rows = Object.keys(map).filter(function(b){ return b !== currentBranch && map[b]; });
      others.innerHTML = rows.length
        ? ('الفروع التانية: ' + rows.map(function(b){
            return b + ' → <b>' + map[b] + '</b>'; }).join(' · '))
        : 'لسه مفيش فروع تانية مسجّلة ماكينة.';
    }
  }catch(e){
    _pmbErr('تعذر تحميل الإعداد: ' + (e && e.message ? e.message : e));
  }
}
if(typeof window !== 'undefined') window.loadPaymobCfgUI = loadPaymobCfgUI;

// 💾 الحفظ — بيكتب رقم الفرع الحالي بس، وباقي الفروع متتلمسش
async function savePaymobCfg(){
  const idEl = document.getElementById('pmbTerminalId');
  const enEl = document.getElementById('pmbEnabled');
  if(!idEl) return;
  if(typeof hasPerm === 'function' && !hasPerm('canManageRoles')){
    showToast('الصلاحية دي للمدير بس', 'err'); return;
  }
  const branch = currentBranch;
  const tid = String(idEl.value || '').trim();
  _pmbErr('');
  try{
    // بنقرا المحفوظ الأول عشان نتأكد إن الرقم مش متسجل على فرع تاني
    const snap = await db.collection(TEST_SETTINGS).doc('paymob').get();
    const cfg = snap.exists ? (snap.data() || {}) : {};
    const map = cfg.terminalIdByBranch || {};
    const bad = paymobCfgReject(tid, branch, map);
    if(bad){ _pmbErr('⛔ ' + bad); showToast(bad, 'err'); return; }
    // 🔑 merge بيدمج الخريطة جوه جوه — فرع واحد بس هو اللي بيتغير
    await db.collection(TEST_SETTINGS).doc('paymob').set({
      enabled: !!(enEl && enEl.checked),
      terminalIdByBranch: Object.assign({}, { [branch]: tid })
    }, { merge:true });
    showToast('اتحفظت ماكينة ' + branch + ': ' + tid + ' ✅', 'ok');
    if(typeof _logActivity === 'function') _logActivity('paymob_terminal_saved', { branch: branch, terminalId: tid });
    loadPaymobCfgUI();
  }catch(e){
    const m = (e && e.message ? e.message : String(e));
    _pmbErr('تعذر الحفظ: ' + m);
    showToast('تعذر الحفظ: ' + m, 'err');
  }
}
if(typeof window !== 'undefined') window.savePaymobCfg = savePaymobCfg;

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
  // 🕕 النهاردة/امبارح بيوم الشغل (الساعة الفاصلة) — مش نص الليل.
  // ده كان سبب إن "تقارير النهاردة" فيها فاتورة زيادة عن "تقفيل اليوم":
  // فواتير بعد نص الليل بتظهر في التقارير وميظهروش في التقفيل.
  const _bizStart = (typeof bizDayStartMs === 'function')
    ? bizDayStartMs()
    : (function(){ const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
  const DAY = 24*3600000;
  if(currentReportRange === 'today'){
    from = new Date(_bizStart);
    to = new Date(_bizStart + DAY - 1);
  }else if(currentReportRange === 'yesterday'){
    from = new Date(_bizStart - DAY);
    to = new Date(_bizStart - 1);
  }else if(currentReportRange === 'week'){
    from = new Date(_bizStart - 6*DAY);
    to = new Date(_bizStart + DAY - 1);
  }else if(currentReportRange === 'month'){
    from = new Date(_bizStart - 29*DAY);
    to = new Date(_bizStart + DAY - 1);
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

// 📊 تجميع أرقام التقارير — دالة نقية عشان تتختبر بالـ harness.
// قاعدة العكس: الفاتورة المعكوسة "كأنها محصلتش" → بنستبعد الأصلية (reversed)
// **وفاتورة العكس نفسها (isReversal) كمان**. قبل كده كانت الأصلية بتتستبعد
// وفاتورة العكس السالبة بتتحسب → المبلغ بيتخصم مرتين والتقرير بينقص بقيمة كل عكس.
function repAggregate(sales){
  const clean = (sales||[]).filter(s=> !s.reversed && !s.isReversal);
  let salesTotal=0, returnsTotal=0, itemsSold=0;
  const byMethod = {}, methodCount = {}, itemAgg = {};
  clean.forEach(s=>{
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
  const invoiceCount = clean.filter(s=> (s.total||0) >= 0).length;
  return { sales: clean, salesTotal, returnsTotal, netTotal, itemsSold, byMethod, methodCount, itemAgg, invoiceCount };
}
window.repAggregate = repAggregate;

async function loadReportSales(from, to){
  const byId = new Map();
  const addSnap = (snap)=>{ (snap && snap.docs || []).forEach(d=>{ const o=d.data(); if(o && o.branch===currentBranch) byId.set(d.id,{id:d.id,...o}); }); };

  // IMPORTANT: don't make the correctness of daily reports depend on a
  // branch+createdAt composite index.  If that index is missing, the old
  // fallback fetched an arbitrary 1500 documents from the branch and could
  // silently drop today's invoices.  Time-range queries on a single field
  // are index-safe; branch is filtered client-side afterwards.
  if(from || to){
    const lo = from ? from.getTime() : 0;
    const hi = to ? to.getTime() : Date.now()+86400000;
    try{
      let q=db.collection(TEST_SALES).where('createdAt','>=',new Date(lo)).where('createdAt','<=',new Date(hi));
      addSnap(await q.get());
    }catch(e){ console.warn('report server-time query failed',e); }
    try{
      let q=db.collection(TEST_SALES).where('createdAtMs','>=',lo).where('createdAtMs','<=',hi);
      addSnap(await q.get());
    }catch(e){ console.warn('report local-time query failed',e); }
  }else{
    // "all" can be large; keep the existing bounded branch query only here.
    try{ addSnap(await db.collection(TEST_SALES).where('branch','==',currentBranch).orderBy('createdAt','desc').limit(5000).get()); }
    catch(e){ addSnap(await db.collection(TEST_SALES).where('branch','==',currentBranch).limit(5000).get()); }
  }
  return Array.from(byId.values());
}
window.loadReportSales=loadReportSales;

async function renderReportsScreen(){
  const wrap = document.getElementById('reportsWrap');
  wrap.innerHTML = '<div style="padding:30px; text-align:center; color:var(--muted);">بيتحمّل...</div>';
  document.querySelectorAll('.rep-range-btn').forEach(b=> b.classList.toggle('active', b.dataset.range === currentReportRange));
  document.querySelectorAll('.rep-type-btn').forEach(b=> b.classList.toggle('active', b.dataset.rtype === currentReportType));

  let sales = [];
  const { from, to } = getReportDateBounds();
  try{ sales = await loadReportSales(from,to); }
  catch(e){ console.warn(e); }

  if(from || to){
    sales = sales.filter(s=>{
      const t = saleTs(s);
      if(t == null) return false;
      if(from && t < from.getTime()) return false;
      if(to && t > to.getTime()) return false;
      return true;
    });
  }

  // إجماليات عامة (الدالة بتستبعد المعكوس وفواتير العكس مع بعض — مش خصم مزدوج)
  const _agg = repAggregate(sales);
  sales = _agg.sales;
  const salesTotal = _agg.salesTotal, returnsTotal = _agg.returnsTotal, itemsSold = _agg.itemsSold;
  const byMethod = _agg.byMethod, methodCount = _agg.methodCount, itemAgg = _agg.itemAgg;
  const netTotal = _agg.netTotal;
  const invoiceCount = _agg.invoiceCount;
  const methodLabels = {cash:'💵 كاش', visa:'💳 فيزا', instapay:'📱 انستاباي'};

  const avgInvoice = invoiceCount ? netTotal/invoiceCount : 0;
  const _kpis = `<div class="rep-kpis"><div class="rep-kpi primary"><span>صافي المبيعات</span><b>${netTotal.toFixed(2)}</b><small>ج.م</small></div><div class="rep-kpi"><span>الفواتير</span><b>${invoiceCount}</b><small>فاتورة</small></div><div class="rep-kpi"><span>القطع</span><b>${itemsSold}</b><small>قطعة</small></div><div class="rep-kpi"><span>متوسط الفاتورة</span><b>${avgInvoice.toFixed(0)}</b><small>ج.م</small></div></div>`;
  let html = '';

  if(currentReportType === 'receipt'){
    // 🧾 إيصال اليوم — ملخص على شكل إيصال
    const _byDay = {};
    sales.forEach(s=>{ const _t=s.createdAt&&s.createdAt.toMillis?s.createdAt.toMillis():null; if(_t==null) return; const _k=(typeof bizDayKey==='function')?bizDayKey(_t):(function(){const _d=new Date(_t); return _d.getFullYear()+'-'+String(_d.getMonth()+1).padStart(2,'0')+'-'+String(_d.getDate()).padStart(2,'0');})(); _byDay[_k]=(_byDay[_k]||0)+(s.total||0); });
    const _dayPts = Object.keys(_byDay).sort().map(k=>({label:k, short:k.slice(5), value:Math.max(0,_byDay[k])}));
    const _trend = _dayPts.length>1 ? `<div class="rep-card" style="margin-top:12px;"><h3 style="font-size:13px; margin:0 0 6px; color:var(--muted);">📈 المبيعات على مدار الفترة</h3>${chartColumns(_dayPts,{fmt:v=>v.toFixed(0)})}</div>` : '';
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
    <div style="text-align:center; margin-top:14px;"><button class="rep-print-btn" onclick="printReportArea()">🖨️ طباعة الإيصال</button></div>
    ${_trend}`;
  }

  else if(currentReportType === 'items'){
    // 📦 ملخص الأصناف — كل الأصناف المباعة بالكمية والإجمالي
    const rows = Object.entries(itemAgg).sort((a,b)=> b[1].revenue - a[1].revenue);
    const totQty = rows.reduce((s,[,d])=> s + d.qty, 0);
    const totRev = rows.reduce((s,[,d])=> s + d.revenue, 0);
    html = `<div id="repPrintArea"><div class="rep-card">
      <h2 style="margin:0 0 4px; font-size:16px;">📦 ملخص الأصناف — ${reportRangeLabel()}</h2>
      <div style="color:var(--muted); font-size:12px; margin-bottom:10px;">${currentBranch||''}</div>
      ${rows.length? `<h3 style="font-size:13px; margin:4px 0 8px; color:var(--muted);">📊 أعلى الأصناف مبيعًا (بالقيمة)</h3>${chartBars(rows.slice(0,8).map(([n,d])=>({label:n, value:d.revenue})), {fmt:v=>v.toFixed(0)})}<div style="height:6px;"></div>`:''}
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
      ${entries.length? `<div style="margin-bottom:14px;">${chartDonut(entries.map(m=>({label:methodLabels[m]||m, value:byMethod[m]})), {center:grand.toFixed(0), centerSub:'ج.م'})}</div>`:''}
      <table class="rep-tbl"><thead><tr><th>طريقة الدفع</th><th class="num">عدد الفواتير</th><th class="num">الإجمالي</th><th class="num">النسبة</th></tr></thead><tbody>
      ${entries.length ? entries.map(m=>`<tr><td>${methodLabels[m]||m}</td><td class="num">${methodCount[m]||0}</td><td class="num">${byMethod[m].toFixed(2)}</td><td class="num">${grand? Math.round(byMethod[m]/grand*100):0}%</td></tr>`).join('')
                       : '<tr><td colspan="4" style="text-align:center; color:var(--muted); padding:16px;">لا يوجد</td></tr>'}
      </tbody><tfoot><tr class="grand"><td>الإجمالي</td><td class="num">${invoiceCount}</td><td class="num">${grand.toFixed(2)} ج.م</td><td class="num">100%</td></tr></tfoot></table>
    </div></div>
    <div style="text-align:center; margin-top:6px;"><button class="rep-print-btn" onclick="printReportArea()">🖨️ طباعة</button></div>`;
  }

  else if(currentReportType === 'invoices'){
    const rows=[...sales].sort((a,b)=>(saleTs(b)||0)-(saleTs(a)||0));
    html=`<div class="rep-card rep-invoices"><div class="rep-section-title"><div><h2>🧾 الفواتير</h2><p>${currentBranch||''} · ${reportRangeLabel()} · ${rows.length} فاتورة ظاهرة</p></div></div>${rows.length?rows.map(s=>{const t=saleTs(s),d=t?new Date(t):null;const qty=(s.items||[]).reduce((n,it)=>n+(Number(it.qty)||0),0);const pay=Object.keys(s.payments||{}).map(x=>methodLabels[x]||x).join(' + ')||'—';return `<div class="rep-invoice-row"><div class="rep-invoice-main"><b>#${s.invoiceNo||String(s.id||'').slice(-6)}</b><span>${d?d.toLocaleString('ar-EG'):'—'}</span><span>👤 ${s.employeeName||'—'}</span></div><div class="rep-invoice-side"><b>${Number(s.total||0).toFixed(2)} ج.م</b><span>${qty} قطعة · ${pay}</span></div></div>`}).join(''):'<div class="rep-empty">لا توجد فواتير في الفترة دي</div>'}</div>`;
  }

  else if(currentReportType === 'customers'){ html = await buildCustomersReport(); }
  else if(currentReportType === 'ratings'){   html = await buildRatingsReport(from, to); }
  else if(currentReportType === 'staff'){     html = await buildStaffReport(from, to, sales); }
  else if(currentReportType === 'qtydisc'){  html = await buildQtyDiscountReport(sales); }

  wrap.innerHTML = _kpis + html;
}

/* ============================================================
   🎁 تحليل خصم الكمية — "أرخص قطعة بنص التمن" من كام قطعة؟
   ------------------------------------------------------------
   الرقم ده مينفعش يتخمّن: لو حطيته واطي بتديّ خصم لفواتير كانت
   هتحصل من غيره أصلًا (خسارة صافية)، ولو حطيته عالي محدش بيوصله
   فمفيش أي تأثير. التقرير ده بيحسب من **فواتيرك انت**:
     · عدد الفواتير اللي بتوصل كل حد أصلًا  → التكلفة المباشرة
     · وعدد اللي واقفة على بُعد قطعة واحدة  → دي الفرصة الحقيقية
     · وكام فاتورة من دول لازم تزوّد قطعة عشان تتعادل
   ============================================================ */
function _qdCheapestUnit(items){
  let min = Infinity;
  (items || []).forEach(it=>{
    const p = Number(it && it.price);
    const q = Number(it && it.qty) || 0;
    if(!isFinite(p) || p <= 0 || q <= 0) return;      // المرتجع والسطور الصفرية بره
    if(p < min) min = p;
  });
  return isFinite(min) ? min : 0;
}
function _qdPieces(items){
  return (items || []).reduce((n, it)=>{
    const q = Number(it && it.qty) || 0;
    return n + (q > 0 ? q : 0);                        // الكميات السالبة (مرتجع) مش قطع مبيعة
  }, 0);
}
// بيرجّع تحليل لكل حد محتمل من الفواتير المدّاها
function qtyDiscountAnalysis(sales, thresholds){
  const rows = (sales || [])
    .filter(s=> s && !s.isRefund && !s.reversalOf && Array.isArray(s.items) && s.items.length)
    .map(s=> ({ pieces: _qdPieces(s.items), cheapest: _qdCheapestUnit(s.items),
                total: Number(s.total) || 0 }))
    .filter(r=> r.pieces > 0);

  const dist = {};
  rows.forEach(r=>{ const k = Math.min(r.pieces, 8); dist[k] = (dist[k] || 0) + 1; });

  const out = (thresholds || [2,3,4,5,6]).map(n=>{
    const reach = rows.filter(r=> r.pieces >= n);
    const near  = rows.filter(r=> r.pieces === n - 1);
    // التكلفة = نص أرخص قطعة في كل فاتورة بتوصل الحد
    const cost = reach.reduce((a, r)=> a + r.cheapest / 2, 0);
    // متوسط سعر القطعة — تقدير للإيراد الإضافي من قطعة زيادة
    const avgPiece = rows.length
      ? rows.reduce((a, r)=> a + (r.pieces ? r.total / r.pieces : 0), 0) / rows.length : 0;
    const avgCheapNear = near.length
      ? near.reduce((a, r)=> a + r.cheapest, 0) / near.length : 0;
    // صافي المكسب من فاتورة زوّدت قطعة = سعر القطعة − نص أرخص قطعة
    const gainPer = avgPiece - avgCheapNear / 2;
    const needConv = gainPer > 0 ? Math.ceil(cost / gainPer) : 0;
    return {
      n, reach: reach.length, near: near.length,
      cost: Math.round(cost),
      gainPer: Math.round(gainPer),
      needConv,
      needPct: near.length ? Math.round(needConv / near.length * 100) : null
    };
  });
  return { total: rows.length, dist, rows: out,
           avgPieces: rows.length ? +(rows.reduce((a,r)=> a + r.pieces, 0) / rows.length).toFixed(2) : 0 };
}
if(typeof window !== 'undefined'){
  window.qtyDiscountAnalysis = qtyDiscountAnalysis;
  window._qdPieces = _qdPieces;
  window._qdCheapestUnit = _qdCheapestUnit;
}

async function buildQtyDiscountReport(sales){
  const a = qtyDiscountAnalysis(sales);
  if(!a.total){
    return `<div class="rep-card"><div class="rep-inner">
      <h2 style="margin:0 0 4px; font-size:16px;">🎁 من كام قطعة نبدأ الخصم؟</h2>
      <div style="color:var(--muted); font-size:12px;">مفيش فواتير في الفترة دي</div>
    </div></div>`;
  }
  const maxD = Math.max.apply(null, Object.values(a.dist));
  const distRows = [1,2,3,4,5,6,7,8].map(k=>{
    const c = a.dist[k] || 0;
    const pct = a.total ? Math.round(c / a.total * 100) : 0;
    return `<tr>
      <td>${k === 8 ? '8 فأكتر' : k + ' قطعة'}</td>
      <td style="width:55%;"><div style="background:var(--panel2); border-radius:5px; height:9px;">
        <div style="width:${maxD ? Math.round(c/maxD*100) : 0}%; height:100%; background:var(--gold, #b8860b); border-radius:5px;"></div></div></td>
      <td class="num">${c}</td><td class="num">${pct}%</td></tr>`;
  }).join('');

  // أحسن ترشيح: الحد اللي فرصته أكبر (أكتر فواتير على بُعد قطعة) وتكلفته أقل
  const best = a.rows.slice().sort((x,y)=>
    (y.near - x.near) || (x.cost - y.cost))[0];

  const tRows = a.rows.map(r=>`<tr${best && r.n === best.n ? ' style="background:rgba(184,134,11,.10);"' : ''}>
    <td><b>${r.n} قطع</b></td>
    <td class="num">${r.reach}</td>
    <td class="num">${r.near}</td>
    <td class="num">${r.cost} ج.م</td>
    <td class="num">${r.needConv}${r.needPct != null ? ` <span style="color:var(--muted); font-size:10.5px;">(${r.needPct}%)</span>` : ''}</td>
  </tr>`).join('');

  return `<div class="rep-card"><div class="rep-inner">
    <h2 style="margin:0 0 4px; font-size:16px;">🎁 من كام قطعة نبدأ الخصم؟ — ${reportRangeLabel()}</h2>
    <div style="color:var(--muted); font-size:12px; margin-bottom:12px;">${currentBranch||''} · ${a.total} فاتورة · متوسط السلة <b>${a.avgPieces}</b> قطعة</div>

    <h3 style="font-size:13px; margin:0 0 6px; color:var(--muted);">توزيع الفواتير بعدد القطع</h3>
    <table class="rep-tbl"><tbody>${distRows}</tbody></table>

    <h3 style="font-size:13px; margin:16px 0 6px; color:var(--muted);">لو الخصم بدأ من…</h3>
    <table class="rep-tbl">
      <thead><tr>
        <th>الحد</th><th class="num">فواتير بتوصله</th><th class="num">على بُعد قطعة</th>
        <th class="num">تكلفة الفترة</th><th class="num">محتاج يزوّدوا</th>
      </tr></thead>
      <tbody>${tRows}</tbody>
    </table>

    <div style="margin-top:12px; padding:11px 13px; border:1px solid var(--border); border-radius:10px; font-size:12.5px; line-height:1.9;">
      <b>إزاي تقرا الجدول:</b><br>
      • <b>فواتير بتوصله</b> = دول هياخدوا الخصم <b>وهما شارين أصلًا</b> — دي تكلفة صافية عليك.<br>
      • <b>على بُعد قطعة</b> = دي الفرصة الحقيقية، اللي البياعة ممكن تقنعهم يزوّدوا.<br>
      • <b>محتاج يزوّدوا</b> = كام فاتورة من دول لازم تزوّد قطعة عشان تغطّي التكلفة وتتعادل.
      لو الرقم ده قريب من عدد "على بُعد قطعة" كله، يبقى الحد ده <b>صعب</b> — اختار حد أعلى.<br>
      ${best ? `• الأقرب للمنطق هنا: <b>${best.n} قطع</b> — أكبر عدد فواتير واقفة على بُعد قطعة واحدة.` : ''}
    </div>
    <div style="margin-top:8px; color:var(--muted); font-size:11px;">
      ⚠️ الأرقام دي تقديرية ومبنية على متوسط سعر القطعة في الفترة — استخدمها للمقارنة بين الحدود، مش كتوقّع دقيق.
    </div>
  </div></div>
  <div style="text-align:center; margin-top:6px;"><button class="rep-print-btn" onclick="printReportArea()">🖨️ طباعة</button></div>`;
}

// ============ تقارير إضافية: العملاء والتطبيق / التقييمات / الموظفين ============
// كارت رقم صغير موحّد للتقارير الجديدة
function _repCard(label, value, sub){
  return `<div style="flex:1; min-width:135px; background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:12px 14px;">
    <div style="color:var(--muted); font-size:11px; margin-bottom:4px;">${label}</div>
    <div style="font-weight:900; font-size:20px; color:var(--accent);">${value}</div>
    ${sub?`<div style="color:var(--muted); font-size:10px; margin-top:2px;">${sub}</div>`:''}
  </div>`;
}
// نفس البراند (كل فروع echarpe مع بعض، أو Glow لوحده)
function _sameBrandAsCurrent(branch){ return GLOW_BRANCHES.includes(branch||'') === GLOW_BRANCHES.includes(currentBranch); }
// فاتورة "التطبيق ساهم فيها": استبدال نقط، أو عرض فعّله العميل من التطبيق، أو مكافأة
function _isAppInfluencedSale(s){
  if((s.pointsRedeemed||0) > 0) return true;
  return (s.items||[]).some(it=> it.offerApplied || it.isRewardDiscount);
}

// ---- رسوم بيانية بسيطة (SVG/CSS خالص — من غير أي مكتبة خارجية عشان يشتغل أوفلاين) ----
const CHART_COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16'];

// أعمدة أفقية (أصناف/عملاء/موظفين)
function chartBars(items, opts){
  opts = opts||{};
  items = (items||[]).filter(x=> x && isFinite(x.value));
  if(!items.length) return '<div style="color:var(--muted); font-size:12px; padding:8px 0;">لا يوجد بيانات</div>';
  const max = Math.max(1, ...items.map(x=> Math.abs(x.value)));
  return '<div style="margin:4px 0;">' + items.map((x,i)=>{
    const bw = Math.round(Math.abs(x.value)/max*100);
    const col = x.color || CHART_COLORS[i % CHART_COLORS.length];
    return `<div style="display:flex; align-items:center; gap:8px; margin-bottom:7px;">
      <div style="width:100px; font-size:11px; text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${x.label}</div>
      <div style="flex:1; background:var(--panel2); border-radius:99px; height:16px; overflow:hidden;"><div style="width:${bw}%; height:100%; background:${col}; border-radius:99px;"></div></div>
      <div style="width:66px; font-size:11px; color:var(--muted); text-align:left;">${opts.fmt? opts.fmt(x.value): x.value}</div>
    </div>`;
  }).join('') + '</div>';
}

// أعمدة رأسية (المبيعات على مدار الأيام)
function chartColumns(points, opts){
  opts = opts||{};
  points = points||[];
  if(points.length < 2) return '';
  const max = Math.max(1, ...points.map(p=> p.value));
  const col = opts.color || '#3b82f6';
  const bars = points.map(p=>{
    const h = Math.max(3, Math.round(p.value/max*104));
    return `<div style="flex:1; min-width:7px; display:flex; flex-direction:column; justify-content:flex-end; align-items:center; gap:3px;" title="${p.label}: ${opts.fmt?opts.fmt(p.value):p.value}">
      <div style="width:72%; max-width:24px; height:${h}px; background:${col}; border-radius:4px 4px 0 0;"></div>
      <div style="font-size:8px; color:var(--muted); white-space:nowrap;">${p.short||''}</div>
    </div>`;
  }).join('');
  return `<div style="display:flex; align-items:flex-end; gap:3px; height:130px; padding:6px 0; overflow-x:auto;">${bars}</div>`;
}

// دونات (نِسَب)
function chartDonut(segments, opts){
  opts = opts||{};
  segments = (segments||[]).filter(s=> s && s.value>0);
  const total = segments.reduce((a,s)=> a+s.value, 0);
  if(!total) return '';
  const r=54, cx=60, cy=60, sw=18, C=2*Math.PI*r;
  let off=0;
  const arcs = segments.map((s,i)=>{
    const frac=s.value/total, col=s.color||CHART_COLORS[i%CHART_COLORS.length];
    const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-dasharray="${(frac*C).toFixed(2)} ${(C-frac*C).toFixed(2)}" stroke-dashoffset="${(-off*C).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    off+=frac; return arc;
  }).join('');
  const legend = segments.map((s,i)=>{
    const col=s.color||CHART_COLORS[i%CHART_COLORS.length];
    return `<div style="display:flex; align-items:center; gap:6px; font-size:11px; margin-bottom:5px;"><span style="width:11px; height:11px; border-radius:3px; background:${col};"></span><span style="flex:1;">${s.label}</span><span style="color:var(--muted); font-weight:700;">${Math.round(s.value/total*100)}%</span></div>`;
  }).join('');
  const center = (opts.center!=null) ? `<text x="${cx}" y="${cy-1}" text-anchor="middle" font-size="19" font-weight="800" fill="#1a1a1a">${opts.center}</text>${opts.centerSub?`<text x="${cx}" y="${cy+14}" text-anchor="middle" font-size="9" fill="#8a8a80">${opts.centerSub}</text>`:''}` : '';
  return `<div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
    <svg viewBox="0 0 120 120" width="120" height="120" style="flex-shrink:0;">${arcs}${center}</svg>
    <div style="flex:1; min-width:130px;">${legend}</div>
  </div>`;
}

// 👥 تحليلات العملاء + التطبيق (على كل تاريخ التعامل للبراند — مش متأثر بالفترة)
async function buildCustomersReport(){
  let sales = [], customers = [];
  try{
    const [ss, cs] = await Promise.all([
      db.collection(TEST_SALES).orderBy('createdAt','desc').limit(3000).get()
        .catch(async ()=> db.collection(TEST_SALES).limit(3000).get()),
      db.collection(TEST_CUSTOMERS).get()
    ]);
    sales = ss.docs.map(d=>d.data()).filter(s=> !s.reversed && _sameBrandAsCurrent(s.branch));
    customers = cs.docs.map(d=> Object.assign({ _id:d.id }, d.data()));
  }catch(e){ return `<div class="rep-card"><div style="color:var(--muted); text-align:center; padding:20px;">تعذر التحميل: ${e.message}</div></div>${sourcesSection}`; }

  const isGlow = GLOW_BRANCHES.includes(currentBranch);
  const brandCode = isGlow ? 'loyaltyCode_glow' : 'loyaltyCode';
  const custByPhone = {}; customers.forEach(c=>{ custByPhone[c.phone || c._id] = c; });
  const isAppUser = (c)=> !!c && (!!c.loyaltyPin || !!c[brandCode] || /^(loyalty|glow)_app/.test(String(c.source||'')));

  const byPhone = {}, spendByPhone = {};
  let appSalesCount=0, appSalesValue=0, allSalesValue=0, allSalesCount=0;
  let appAOVsum=0, appAOVn=0, noAOVsum=0, noAOVn=0;
  sales.forEach(s=>{
    const tot = s.total||0;
    const t = s.createdAt && s.createdAt.toMillis ? s.createdAt.toMillis() : null;
    if(tot >= 0){ allSalesValue += tot; allSalesCount++; }
    if(_isAppInfluencedSale(s)){ appSalesCount++; appSalesValue += Math.max(0,tot); }
    const ph = s.customerPhone;
    if(tot >= 0){
      const au = isAppUser(custByPhone[ph]);
      if(ph && au){ appAOVsum+=tot; appAOVn++; } else { noAOVsum+=tot; noAOVn++; }
      if(ph){
        if(!byPhone[ph]) byPhone[ph]=[];
        if(t!=null) byPhone[ph].push(t);
        spendByPhone[ph] = (spendByPhone[ph]||0) + tot;
      }
    }
  });

  const buyers = Object.keys(byPhone);
  const totalBuyers = buyers.length;
  const repeatBuyers = buyers.filter(p=> byPhone[p].length >= 2).length;
  const oneTime = totalBuyers - repeatBuyers;
  const repeatRate = totalBuyers ? Math.round(repeatBuyers/totalBuyers*100) : 0;

  // 📱 مصادر العملاء — مين جه منين (ملصق QR كل فرع / QR الفاتورة / التطبيق مباشرة / الكاشير)
  const brandPrefix = isGlow ? 'glow_app' : 'loyalty_app';
  const srcCounts = {};
  customers.forEach(c=>{
    const s = String(c.source||'');
    let label;
    if(!s){ label = '🧾 تسجيل من الكاشير'; }
    else if(s.indexOf(brandPrefix) === 0){
      const tag = s.indexOf(':')>=0 ? s.slice(s.indexOf(':')+1) : '';
      if(/^qr-rcpt-/i.test(tag)) label = '🧾📱 QR الفاتورة — ' + tag.replace(/^qr-rcpt-/i,'').replace(/-/g,' ');
      else if(/^qr-/i.test(tag)) label = '🪧 ملصق QR — ' + tag.replace(/^qr-/i,'').replace(/-/g,' ');
      else label = '📱 التطبيق مباشرة';
    }
    else if(/^(loyalty|glow)_app/.test(s)) return;   // عميل البراند التاني — مش بتاعنا
    else label = '🧾 تسجيل من الكاشير';
    srcCounts[label] = (srcCounts[label]||0) + 1;
  });
  const srcRows = Object.entries(srcCounts).sort((a,b)=> b[1]-a[1]);
  const srcTotal = srcRows.reduce((s,r)=> s+r[1], 0) || 1;
  const sourcesSection = srcRows.length ? `
    <div class="rep-card" style="margin-top:12px;">
      <div style="font-weight:800; margin-bottom:4px;">📍 العملاء جم منين؟</div>
      <div style="font-size:11px; color:var(--muted); margin-bottom:10px;">قياس فعالية ملصقات الـ QR وفواتير كل فرع (بيتحدث مع كل عميل جديد)</div>
      ${srcRows.map(([label,n])=>{
        const pct = Math.round(n/srcTotal*100);
        return `<div style="margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;"><span>${label}</span><b>${n} <span style="color:var(--muted); font-weight:400;">(${pct}%)</span></b></div>
          <div style="background:var(--panel2); border-radius:6px; height:8px; overflow:hidden;"><div style="width:${pct}%; height:100%; background:linear-gradient(90deg,#818cf8,#22d3ee);"></div></div>
        </div>`;}).join('')}
    </div>` : '';

  let gapSum=0, gapCount=0;
  buyers.forEach(p=>{ const ts = byPhone[p].slice().sort((a,b)=>a-b); for(let i=1;i<ts.length;i++){ gapSum += (ts[i]-ts[i-1]); gapCount++; } });
  const avgGapDays = gapCount ? (gapSum/gapCount/86400000) : 0;

  const totalInvoices = buyers.reduce((s,p)=> s + byPhone[p].length, 0);
  const avgInvoicesPerBuyer = totalBuyers ? (totalInvoices/totalBuyers) : 0;
  const d30 = Date.now() - 30*86400000;
  const active30 = buyers.filter(p=> byPhone[p].some(t=> t>=d30)).length;

  const appBuyers = buyers.filter(p=> isAppUser(custByPhone[p])).length;
  const adoption = totalBuyers ? Math.round(appBuyers/totalBuyers*100) : 0;
  const appAOV = appAOVn? appAOVsum/appAOVn : 0;
  const noAOV = noAOVn? noAOVsum/noAOVn : 0;
  const appShareCount = allSalesCount ? Math.round(appSalesCount/allSalesCount*100) : 0;
  const appShareValue = allSalesValue ? Math.round(appSalesValue/allSalesValue*100) : 0;

  const top = buyers.map(p=> ({ p, name:(custByPhone[p]&&custByPhone[p].name)||'—', spend:spendByPhone[p]||0, n:byPhone[p].length }))
                    .sort((a,b)=> b.spend-a.spend).slice(0,5);

  const brandName = isGlow ? 'Glow' : 'echarpe (كل الفروع)';
  return `<div class="rep-card">
    <h2 style="margin:0 0 2px; font-size:16px;">👥 العملاء والتطبيق</h2>
    <div style="color:var(--muted); font-size:11px; margin-bottom:12px;">${brandName} · على كل تاريخ التعامل (مش متأثر بفلتر الفترة)</div>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
      ${_repCard('عملاء اشتروا', totalBuyers)}
      ${_repCard('نسبة التكرار', repeatRate+'%', `${repeatBuyers} متكرر · ${oneTime} مرة واحدة`)}
      ${_repCard('متوسط المدة للرجوع', avgGapDays? avgGapDays.toFixed(0)+' يوم' : '—', 'بين كل شرايتين')}
      ${_repCard('متوسط فواتير العميل', avgInvoicesPerBuyer.toFixed(1))}
      ${_repCard('نشطين آخر 30 يوم', active30, totalBuyers?Math.round(active30/totalBuyers*100)+'% من العملاء':'')}
    </div>
    <h3 style="font-size:13px; margin:14px 0 8px; color:var(--muted);">📱 تطبيق الولاء</h3>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
      ${_repCard('بيستخدموا التطبيق', adoption+'%', `${appBuyers} من ${totalBuyers} عميل`)}
      ${_repCard('مساهمة التطبيق (عدد)', appShareCount+'%', `${appSalesCount} فاتورة`)}
      ${_repCard('مساهمة التطبيق (قيمة)', appShareValue+'%', appSalesValue.toFixed(0)+' ج.م')}
      ${_repCard('متوسط فاتورة (تطبيق)', appAOV.toFixed(0)+' ج.م', `مقابل ${noAOV.toFixed(0)} من غير تطبيق`)}
    </div>
    <h3 style="font-size:13px; margin:16px 0 8px; color:var(--muted);">📊 رسوم بيانية</h3>
    <div style="display:flex; gap:18px; flex-wrap:wrap; margin-bottom:8px;">
      <div style="flex:1; min-width:230px;"><div style="font-size:11px; color:var(--muted); margin-bottom:6px;">تكرار العملاء</div>${chartDonut([{label:'متكرر',value:repeatBuyers,color:'#22c55e'},{label:'مرة واحدة',value:oneTime,color:'#f59e0b'}], {center:repeatRate+'%', centerSub:'تكرار'})}</div>
      <div style="flex:1; min-width:230px;"><div style="font-size:11px; color:var(--muted); margin-bottom:6px;">استخدام التطبيق</div>${chartDonut([{label:'بيستخدم التطبيق',value:appBuyers,color:'#3b82f6'},{label:'مش بيستخدم',value:Math.max(0,totalBuyers-appBuyers),color:'#94a3b8'}], {center:adoption+'%'})}</div>
    </div>
    ${top.length?`<h3 style="font-size:13px; margin:16px 0 8px; color:var(--muted);">🏆 أكتر 5 عملاء إنفاقًا</h3>
    ${chartBars(top.map(t=>({label:t.name, value:t.spend})), {fmt:v=>v.toFixed(0)})}
    <table class="rep-tbl"><thead><tr><th>العميل</th><th class="num">فواتير</th><th class="num">إجمالي الإنفاق</th></tr></thead><tbody>
    ${top.map(t=>`<tr><td>${t.name} <span style="color:var(--muted); font-size:10px; direction:ltr;">${t.p}</span></td><td class="num">${t.n}</td><td class="num">${t.spend.toFixed(2)}</td></tr>`).join('')}
    </tbody></table>`:''}
  </div>`;
}

// ⭐ تقييمات العملاء (من برنامج التقييم — collection entries) — للفرع الحالي وضمن الفترة
async function buildRatingsReport(from, to){
  let entries = [];
  try{
    // 💸 الفلترة الزمنية على السيرفر بدل ما نسحب تقييمات الفرع كلها ونفلتر هنا.
    //    `ts` حقل واحد → مفيش index مركّب. والفرع بيتفلتر محليًا.
    let q = db.collection('entries');
    if(from) q = q.where('ts','>=', from.getTime());
    if(to)   q = q.where('ts','<=', to.getTime());
    const snap = await q.get();
    entries = snap.docs.map(d=>d.data()).filter(e=> e.branch === currentBranch);
  }catch(e){ return `<div class="rep-card"><div style="color:var(--muted); text-align:center; padding:20px;">تعذر التحميل: ${e.message}</div></div>`; }

  // ============================================================
  // 📊 قمع التقييم — الرقم اللي كان ناقص
  // ------------------------------------------------------------
  // متوسط 3.6 من غير مقام مش بيقول حاجة: هو ده من 25 عميلة ولا من 400؟
  // والفرق مش تفصيلة — **اللي مبيقيّمش غالبًا هو اللي مبسوطش**، فمتوسط
  // عالي مع استجابة واطية ممكن يكون بيخبّي مشكلة مش بيقيس رضا.
  // البيانات كانت موجودة أصلًا: دالة الإشعار بتكتب `ratePushAt` على
  // الفاتورة وقت ما تبعت (functions/index.js) — بس محدش كان بيعرضها.
  // ============================================================
  let funnel = null;
  try{
    let sq = db.collection(TEST_SALES).where('branch','==', currentBranch);
    if(from) sq = sq.where('createdAt','>=', from);
    if(to)   sq = sq.where('createdAt','<=', to);
    const ss = await sq.get();
    let withPhone = 0, pushed = 0;
    ss.docs.forEach(d=>{
      const v = d.data() || {};
      if(!v.customerPhone) return;
      withPhone++;
      if(v.ratePushAt) pushed++;
    });
    // اللي قيّم فعلًا = التقييمات اللي جاية من التطبيق (مربوطة بفاتورة)
    const rated = entries.filter(e=> e.saleId || e.source === 'app_after_visit').length;
    const noted = entries.filter(e=> (e.saleId || e.source === 'app_after_visit')
      && e.note && String(e.note).trim()).length;
    if(withPhone) funnel = { withPhone, pushed, rated, noted };
  }catch(e){ console.warn('rating funnel', e && e.code); }

  const _pct = (a, b)=> b ? Math.round(a / b * 100) : 0;
  const _fRow = (label, val, pct, hint, hue)=>
    `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--line);">
      <div><div style="font-size:12.5px; font-weight:700;">${label}</div>
        <div style="font-size:10.5px; color:var(--muted);">${hint}</div></div>
      <div style="text-align:left; white-space:nowrap;">
        <b style="font-size:16px; color:${hue||'var(--fg)'};">${val}</b>
        ${pct != null ? `<span style="font-size:11px; color:var(--muted);"> · ${pct}%</span>` : ''}
      </div>
    </div>`;
  const funnelHtml = funnel ? `<div class="rep-card">
      <h3 style="font-size:13px; margin:0 0 6px;">📊 قمع التقييم</h3>
      ${_fRow('فواتير بعميلة مسجّلة', funnel.withPhone, null, 'الأساس — دول اللي ممكن يوصلهم تقييم')}
      ${_fRow('اتبعت لهم إشعار', funnel.pushed, _pct(funnel.pushed, funnel.withPhone),
              'بعد الشراء بنص ساعة', funnel.pushed < funnel.withPhone * 0.8 ? '#f59e0b' : '')}
      ${_fRow('قيّموا فعلًا', funnel.rated, _pct(funnel.rated, funnel.pushed),
              'نسبة الاستجابة', funnel.rated < funnel.pushed * 0.1 ? '#ef4444' : '#22c55e')}
      ${_fRow('كتبوا تعليق', funnel.noted, _pct(funnel.noted, funnel.rated), 'من اللي قيّموا')}
      <div style="font-size:10.5px; color:var(--muted); margin-top:9px; line-height:1.7;">
        ⚠️ الفرق بين «اتبعت» و«قيّم» مش كله لا مبالاة — ممكن الإشعار مايكونش
        وصل أصلًا (توكن باظ · إشعارات مقفولة · التطبيق اتمسح). الرقم بيوريك
        إن فيه فجوة، مش بيقولك سببها.
      </div>
    </div>` : '';

  const total = entries.length;
  const dist = {1:0,2:0,3:0,4:0}; let sum=0;
  entries.forEach(e=>{ if(dist[e.r]!=null){ dist[e.r]++; sum+=e.r; } });
  const avg = total? sum/total : 0;
  const satPct = total? Math.round((dist[3]+dist[4])/total*100) : 0;
  const faces = {4:'😍 عجبهم جدًا',3:'🙂 كويس',2:'🙁 مش عاجبهم',1:'😠 مضايقهم'};
  const colors = {4:'#22c55e',3:'#84cc16',2:'#f59e0b',1:'#ef4444'};
  const bar = (r)=>{ const c=dist[r], pct= total? Math.round(c/total*100):0;
    return `<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
      <div style="width:118px; font-size:12px;">${faces[r]}</div>
      <div style="flex:1; background:var(--panel2); border-radius:99px; height:14px; overflow:hidden;"><div style="width:${pct}%; height:100%; background:${colors[r]};"></div></div>
      <div style="width:72px; text-align:left; font-size:12px; color:var(--muted);">${c} (${pct}%)</div></div>`; };

  const byEmp = {};
  entries.forEach(e=>{ const n=e.servedByEmployeeName; if(!n) return; if(!byEmp[n]) byEmp[n]={sum:0,n:0}; byEmp[n].sum+=e.r; byEmp[n].n++; });
  const empRows = Object.entries(byEmp).sort((a,b)=> (b[1].sum/b[1].n)-(a[1].sum/a[1].n));

  // 📍 مصدرين مختلفين تمامًا وكانوا بيتخلطوا في نفس المتوسط:
  //    الكشك = ضغطة سريعة مجهولة في الفرع · التطبيق = بعد نص ساعة ومربوط بفاتورة.
  const _src = { app:{sum:0,n:0}, kiosk:{sum:0,n:0} };
  entries.forEach(e=>{ const k = (e.source === 'app_after_visit' || e.saleId) ? 'app' : 'kiosk'; _src[k].sum += e.r; _src[k].n++; });
  const _srcCell = (k, label, hint)=> _src[k].n
    ? `<tr><td>${label}<div style="font-size:10.5px; color:var(--muted);">${hint}</div></td>
        <td class="num">${_src[k].n}</td><td class="num">${(_src[k].sum/_src[k].n).toFixed(2)}</td></tr>` : '';
  const srcRows = (_src.app.n && _src.kiosk.n)
    ? `<h3 style="font-size:13px; margin:16px 0 8px; color:var(--muted);">التقييم حسب المصدر</h3>
       <table class="rep-tbl"><thead><tr><th>المصدر</th><th class="num">عدد</th><th class="num">متوسط</th></tr></thead><tbody>
       ${_srcCell('app','📱 تطبيق الولاء','بعد الزيارة بنص ساعة · مربوط بالفاتورة')}
       ${_srcCell('kiosk','🖥️ شاشة الفرع','ضغطة سريعة مجهولة')}
       </tbody></table>` : '';

  /* 🔎 مين قيّم — **للمالك بس** (`canManageRoles`)
     ------------------------------------------------------------
     كل تقييم من تطبيق الولاء بيتسجّل ومعاه رقم العميلة ورقم الفاتورة
     واسم البياعة — بس مكانش بيتعرض في أي شاشة، فالمالك يشوف "3 سيّئة"
     ومايعرفش مين يكلم.
     ⚠️ مقفول على المالك عن قصد: لو كل بياعة تعرف مين إداها تقييم واطي،
        التقييم نفسه بيبقى خطر على العميلة. تقييمات شاشة الفرع مجهولة
        أصلًا ومش بنخمّن ليها هوية. */
  let whoRatedHtml = '';
  const _canSeeWho = (typeof hasPerm === 'function') && hasPerm('canManageRoles');
  if(_canSeeWho){
    // 📱/🖥️ نفس تصنيف المصدر المستخدم فوق بالظبط — مصدر واحد للحقيقة
    const _srcOf = (e)=> ((e.source === 'app_after_visit' || e.saleId) ? 'app' : 'kiosk');
    // بنعرض **كل** التقييمات مش اللي معاها رقم بس — عشان تشوف الصورة كاملة
    // وتعرف أي سطر جاي منين. اللي من شاشة الفرع مجهول بطبيعته.
    const named = entries.slice().sort((a,b)=> (a.r - b.r) || (b.ts - a.ts));
    if(named.length){
      // أسماء العملاء — بنجيبها مرة واحدة بدل استعلام لكل تقييم
      const nameByPhone = {};
      try{
        const phones = [...new Set(named.filter(e=> e.customerPhone).map(e=> e.customerPhone))].slice(0, 30);
        const docs = await Promise.all(phones.map(p=>
          db.collection(TEST_CUSTOMERS).doc(p).get().catch(()=> null)));
        docs.forEach((d, i)=>{ if(d && d.exists) nameByPhone[phones[i]] = (d.data()||{}).name || ''; });
      }catch(e){ console.warn('rating names', e && e.code); }

      const rows = named.slice(0, 60).map(e=>{
        const nm = nameByPhone[e.customerPhone] || '';
        const when = new Date(e.ts).toLocaleString('ar-EG', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
        const isApp = _srcOf(e) === 'app';
        const srcTag = isApp
          ? `<span style="font-size:10.5px; background:#eef2ff; color:#4338ca; padding:2px 6px; border-radius:6px; white-space:nowrap;">📱 التطبيق</span>`
          : `<span style="font-size:10.5px; background:#f1f5f9; color:#64748b; padding:2px 6px; border-radius:6px; white-space:nowrap;">🖥️ شاشة الفرع</span>`;
        // 👤 الاسم بيفتح **ملف العميلة** (زي أي مكان تاني في POS)، والتليفون
        //    زرار منفصل جنبه — الدوسة على الاسم كانت بتفتح الاتصال بالغلط.
        const who = e.customerPhone
          ? `<a onclick="openCustomerProfile('${_rtEsc(e.customerPhone)}')" style="color:#2563eb; font-weight:700; cursor:pointer; text-decoration:underline;">${_rtEsc(nm || e.customerPhone)}</a>
             <a href="tel:${_rtEsc(e.customerPhone)}" style="text-decoration:none; margin-inline-start:5px;" title="اتصال">📞</a>
             ${nm ? `<div style="font-size:10.5px; color:var(--muted); direction:ltr;">${_rtEsc(e.customerPhone)}</div>` : ''}`
          : `<span style="color:var(--muted);">مجهول</span>`;
        return `<tr>
          <td style="white-space:nowrap;">${RATING_ICON_MAP[e.r]||''}</td>
          <td>${who}</td>
          <td>${srcTag}</td>
          <td style="font-size:11.5px;">${_rtEsc(e.servedByEmployeeName || '—')}</td>
          <td style="font-size:11px; color:var(--muted); white-space:nowrap;">${when}</td>
        </tr>${e.note && String(e.note).trim()
          ? `<tr><td colspan="5" style="font-size:12px; color:var(--muted); padding-top:0; white-space:pre-wrap;">💬 ${_rtEsc(e.note)}</td></tr>`
          : ''}`;
      }).join('');
      const badNamed = named.filter(e=> e.r <= 2).length;
      const appN = named.filter(e=> _srcOf(e) === 'app').length;
      whoRatedHtml = `<h3 style="font-size:13px; margin:16px 0 8px; color:var(--muted);">
          🔎 مين قيّم (${named.length}) — 🔒 للمالك بس · الأسوأ الأول${badNamed? ` · ${badNamed} محتاج متابعة`:''}</h3>
        <div style="font-size:11.5px; color:var(--muted); margin-bottom:6px;">📱 ${appN} من التطبيق · 🖥️ ${named.length - appN} من شاشة الفرع (مجهولة)</div>
        <table class="rep-tbl"><thead><tr><th></th><th>العميلة</th><th>المصدر</th><th>مع مين</th><th>إمتى</th></tr></thead>
        <tbody>${rows}</tbody></table>
        ${named.length > 60 ? `<div style="font-size:11px; color:var(--muted);">معروض 60 من ${named.length}</div>` : ''}`;
    }
  }

  // 💬 الكلام المكتوب — كان بيتخزن ومحدش بيقراه في أي شاشة
  const withNotes = entries.filter(e=> e.note && String(e.note).trim())
    .sort((a,b)=> (a.r - b.r) || (b.ts - a.ts)).slice(0, 40);
  const noteRows = withNotes.length
    ? `<h3 style="font-size:13px; margin:16px 0 8px; color:var(--muted);">💬 كلام العملاء (${withNotes.length}) — الأسوأ الأول</h3>
       ${withNotes.map(e=>`<div style="border-right:3px solid ${colors[e.r]||'#9ca3af'}; background:var(--panel2); border-radius:8px; padding:8px 11px; margin-bottom:7px;">
         <div style="font-size:11px; color:var(--muted); margin-bottom:3px;">${RATING_ICON_MAP[e.r]||''} ${faces[e.r]||''} · ${new Date(e.ts).toLocaleString('ar-EG')}</div>
         <div style="font-size:12.5px; line-height:1.7; white-space:pre-wrap;">${_rtEsc(e.note)}</div>
       </div>`).join('')}` : '';

  return `${funnelHtml}<div class="rep-card">
    <h2 style="margin:0 0 2px; font-size:16px;">⭐ تقييمات العملاء</h2>
    <div style="color:var(--muted); font-size:11px; margin-bottom:12px;">${currentBranch||''} · ${reportRangeLabel()}</div>
    ${total? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
      ${_repCard('عدد التقييمات', total)}
      ${_repCard('متوسط التقييم', avg.toFixed(2)+' / 4')}
      ${_repCard('نسبة الرضا', satPct+'%', 'كويس أو عجبهم جدًا')}
    </div>
    <div style="display:flex; gap:18px; flex-wrap:wrap; margin-bottom:12px;">
      <div style="flex:1; min-width:230px;">${chartDonut([{label:'😍 عجبهم جدًا',value:dist[4],color:'#22c55e'},{label:'🙂 كويس',value:dist[3],color:'#84cc16'},{label:'🙁 مش عاجبهم',value:dist[2],color:'#f59e0b'},{label:'😠 مضايقهم',value:dist[1],color:'#ef4444'}], {center:avg.toFixed(1), centerSub:'من 4'})}</div>
      <div style="flex:1; min-width:230px;">${bar(4)}${bar(3)}${bar(2)}${bar(1)}</div>
    </div>
    ${empRows.length? `<h3 style="font-size:13px; margin:16px 0 8px; color:var(--muted);">التقييم حسب الموظف</h3>
      <table class="rep-tbl"><thead><tr><th>الموظف</th><th class="num">عدد</th><th class="num">متوسط</th></tr></thead><tbody>
      ${empRows.map(([n,d])=>`<tr><td>${n}</td><td class="num">${d.n}</td><td class="num">${(d.sum/d.n).toFixed(2)}</td></tr>`).join('')}
      </tbody></table>`:''}
    ${srcRows}
    ${whoRatedHtml}
    ${noteRows}`
    : '<div style="text-align:center; color:var(--muted); padding:24px;">مفيش تقييمات في الفترة دي</div>'}
  </div>`;
}

// 🕐 الموظفين والحضور (من برنامج الموظفين — collection sales_shifts) — للفرع الحالي وضمن الفترة
async function buildStaffReport(from, to, periodSales){
  let shifts = [];
  try{
    const snap = await db.collection('sales_shifts').where('branch','==', currentBranch).get();
    shifts = snap.docs.map(d=>d.data());
  }catch(e){ return `<div class="rep-card"><div style="color:var(--muted); text-align:center; padding:20px;">تعذر التحميل: ${e.message}</div></div>`; }

  // وقت الحضور: clockInTs هو المتوقع (مقابل clockOutTs)، مع بدائل احتياطية
  const shiftIn = (s)=> s.clockInTs || s.clockIn || s.inTs || s.ts || null;
  let scoped = shifts;
  if(from||to){ scoped = shifts.filter(s=>{ const t=shiftIn(s); if(t==null) return false; if(from && t<from.getTime()) return false; if(to && t>to.getTime()) return false; return true; }); }

  const byEmp = {};
  scoped.forEach(s=>{
    const id = s.employeeId || s.employeeName || '—';
    if(!byEmp[id]) byEmp[id] = { name: s.employeeName || id, days:new Set(), shifts:0, hours:0, open:0 };
    const inT = shiftIn(s);
    byEmp[id].shifts++;
    if(inT!=null){ const d=new Date(inT); byEmp[id].days.add(d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate()); }
    if(s.clockOutTs && inT!=null) byEmp[id].hours += Math.max(0, (s.clockOutTs - inT)/3600000);
    if(!s.clockOutTs) byEmp[id].open++;
  });

  const salesByEmp = {};
  (periodSales||[]).forEach(s=>{ const id = s.sellerEmployeeId || s.employeeId; if(!id) return; if((s.total||0)>=0){ if(!salesByEmp[id]) salesByEmp[id]={count:0,total:0}; salesByEmp[id].count++; salesByEmp[id].total += s.total||0; } });

  const rows = Object.entries(byEmp).sort((a,b)=> b[1].days.size - a[1].days.size);
  const totalDays = rows.reduce((s,[,d])=> s + d.days.size, 0);
  const totalHours = rows.reduce((s,[,d])=> s + d.hours, 0);
  const openNow = rows.reduce((s,[,d])=> s + (d.open>0?1:0), 0);

  return `<div class="rep-card">
    <h2 style="margin:0 0 2px; font-size:16px;">🕐 الموظفين والحضور</h2>
    <div style="color:var(--muted); font-size:11px; margin-bottom:12px;">${currentBranch||''} · ${reportRangeLabel()}</div>
    ${rows.length? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
      ${_repCard('موظفين حضروا', rows.length)}
      ${_repCard('إجمالي أيام الحضور', totalDays)}
      ${_repCard('إجمالي ساعات العمل', totalHours.toFixed(1)+' س')}
      ${_repCard('حاضرين دلوقتي', openNow)}
    </div>
    <h3 style="font-size:13px; margin:4px 0 8px; color:var(--muted);">⏱️ ساعات العمل لكل موظف</h3>
    ${chartBars(rows.map(([id,d])=>({label:d.name, value:Math.round(d.hours*10)/10})), {fmt:v=>v.toFixed(1)+'س'})}
    <div style="height:6px;"></div>
    <div style="overflow-x:auto;"><table class="rep-tbl"><thead><tr><th>الموظف</th><th class="num">أيام</th><th class="num">ساعات</th><th class="num">فواتيره</th><th class="num">مبيعاته</th></tr></thead><tbody>
      ${rows.map(([id,d])=>{ const sb = salesByEmp[id]||{count:0,total:0}; return `<tr><td>${d.name}${d.open?' <span style="color:#22c55e; font-size:10px;">● حاضر</span>':''}</td><td class="num">${d.days.size}</td><td class="num">${d.hours.toFixed(1)}</td><td class="num">${sb.count}</td><td class="num">${sb.total.toFixed(0)}</td></tr>`; }).join('')}
    </tbody></table></div>
    <div style="color:var(--muted); font-size:10px; margin-top:8px;">الساعات = من الحضور للانصراف · "مبيعاته" حسب البائع المحدَّد على الفاتورة</div>`
    : '<div style="text-align:center; color:var(--muted); padding:24px;">مفيش حضور مسجّل في الفترة دي</div>'}
  </div>`;
}
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
  // 🔴 النافذة دي كانت بتاخد التركيز (w.focus) وتطبع — و**عمرها ما بتقفل**.
  //    بتفضل مفتوحة ماسكة تركيز الويندوز، فالنافذة الرئيسية تبطّل تستقبل
  //    كتابة في كل الشاشات. القفل + استرجاع التركيز إجباريين.
  w.document.close(); w.focus();
  setTimeout(function(){
    try{ w.print(); }catch(e){}
    setTimeout(function(){ try{ w.close(); }catch(e){} }, 600);
  }, 250);
  if(typeof reclaimWindowFocus === 'function') reclaimWindowFocus(850);
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
// >>> SALESLOG_GROUP_START — تجميع الفواتير بالأيام (دالة نقية قابلة للاختبار)
// 🕕 موحّد على يوم الشغل: فاتورة الفجر (قبل 6 ص بتوقيت المحل) بتتجمع مع يوم
// أمس — زي التقارير والتقفيل بالظبط. قبل كده السجل كان باليوم التقويمي،
// فكان بيطلع رقم مختلف عن التقارير بقيمة فواتير الفجر (سبب 8790 مقابل 8415).
function _shTsOf(s){
  if(typeof saleTs === 'function') return saleTs(s);
  return (s.createdAt && s.createdAt.toMillis) ? s.createdAt.toMillis() : null;
}
function _shBizKey(ts){
  if(typeof bizDayKey === 'function') return bizDayKey(ts);
  const d = new Date(ts);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function _shLabelOf(key){
  // الاسم من المفتاح نفسه (مش من ساعة الجهاز) — عشان يطلع نفس اليوم من أي بلد
  const p = String(key).split('-').map(Number);
  if(p.length !== 3 || p.some(isNaN)) return 'بدون تاريخ';
  return new Date(p[0], p[1]-1, p[2], 12).toLocaleDateString('ar-EG',{weekday:'long', day:'numeric', month:'long', year:'numeric'});
}
function _groupSalesByDay(sales){
  const groups = [], byKey = {};
  (sales||[]).forEach(s=>{
    const ts = _shTsOf(s);
    const key = ts != null ? _shBizKey(ts) : 'no-date';
    const label = ts != null ? _shLabelOf(key) : 'بدون تاريخ';
    if(!byKey[key]){ byKey[key] = { key, label, items:[], total:0, count:0 }; groups.push(byKey[key]); }
    byKey[key].items.push(s);
    byKey[key].total += (s.total||0);
    byKey[key].count++;
  });
  return groups;
}
// تجميع بالشهور: عدّاد لكل شهر (عدد الفواتير + الإجمالي) — عشان مانسحبش لما لانهاية
function _groupSalesByMonth(sales){
  const groups = [], byKey = {};
  (sales||[]).forEach(s=>{
    const ts = _shTsOf(s);
    const key = ts != null ? _shBizKey(ts).slice(0,7) : 'no-date';
    const p = key.split('-').map(Number);
    const label = (ts != null && !p.some(isNaN)) ? new Date(p[0], p[1]-1, 15).toLocaleDateString('ar-EG',{month:'long', year:'numeric'}) : 'بدون تاريخ';
    if(!byKey[key]){ byKey[key] = { key, label, items:[], total:0, count:0 }; groups.push(byKey[key]); }
    byKey[key].items.push(s);
    byKey[key].total += (s.total||0);
    byKey[key].count++;
  });
  return groups;
}
// فلترة سريعة: النهارده / امبارح / تاريخ من حقل date (YYYY-MM-DD) → مفتاح يوم موحّد
// فلترة سريعة: النهارده / امبارح / تاريخ من حقل date (YYYY-MM-DD) → مفتاح يوم شغل موحّد
function _shResolveDayKey(filter, now){
  const n = now ? new Date(now).getTime() : Date.now();
  if(filter === 'today') return _shBizKey(n);
  if(filter === 'yesterday') return _shBizKey(n - 86400000);
  if(/^\d{4}-\d{2}-\d{2}$/.test(filter||'')){ const parts = filter.split('-').map(Number); return parts[0]+'-'+String(parts[1]).padStart(2,'0')+'-'+String(parts[2]).padStart(2,'0'); }
  return null;
}
// <<< SALESLOG_GROUP_END
let _shMonthKey = null;   // الشهر المختار في سجل المبيعات (null = أحدث شهر)
let _shDayFilter = null;  // null | 'today' | 'yesterday' | 'YYYY-MM-DD' (فلتر يوم سريع)
window._shSalesById = {}; // آخر فواتير متحمّلة — لزر 🖨️ طباعة تاني من غير قراءات زيادة
// ⭐ ربط التقييمات بالفواتير — **دالة نقية** (بيانات داخلة، خريطة خارجة)
//    عشان تتختبر لوحدها من غير Firestore ولا DOM.
//    القاعدة: `saleId` أولًا (رابط مؤكد من تطبيق الولاء)، وبعدين تخمين
//    زمني ضيق (3 دقايق) لتقييم الكشك المجهول اللي مفيهوش saleId.
function shLinkRatings(sales, entries, branch){
  const map = {};
  const byPhone = {};
  (entries || []).forEach(e=>{
    if(!e) return;
    if(e.saleId){                       // ✅ الفاتورة نفسها — مفيش تخمين
      map[e.saleId] = { r: e.r, note: e.note || '', source: e.source || 'app', ts: e.ts, exact: true };
      return;
    }
    if(branch && e.branch !== branch) return;
    if(!e.customerPhone) return;
    (byPhone[e.customerPhone] = byPhone[e.customerPhone] || []).push(e);
  });
  (sales || []).forEach(s=>{
    if(map[s.id]) return;               // الرابط المؤكد بيغلب دايمًا
    const arr = s.customerPhone ? byPhone[s.customerPhone] : null;
    const t = _shTsOf(s);
    if(!arr || !t) return;
    let best = null;
    arr.forEach(e=>{ const dd = Math.abs(e.ts - t); if(dd <= 3*60*1000 && (!best || dd < best.d)) best = { e, d: dd }; });
    if(best) map[s.id] = { r: best.e.r, note: best.e.note || '', source: best.e.source || 'kiosk', ts: best.e.ts, exact: false };
  });
  return map;
}
if(typeof window !== 'undefined') window.shLinkRatings = shLinkRatings;

// 🗂️ v359: سجل المبيعات لازم يكون **سجل كامل**، مش snapshot محدود.
// التقارير كانت بالفعل بتدعم createdAtMs عشان فواتير الأوفلاين/serverTimestamp،
// لكن السجل كان عامل orderBy(createdAt)+limit(500). أي فاتورة createdAt بتاعها
// لسه null/غير متاح كانت تقع من السجل بينما التقرير يشوفها — فالأرقام تختلف.
// هنا نقرأ كل فواتير الفرع (query واحد بسيط، من غير composite index ولا limit)،
// وبعدها نرتب محليًا بـ saleTs = createdAt أو createdAtMs.
async function loadLiveSalesHistorySales(){
  const snap = await db.collection(TEST_SALES).where('branch','==', currentBranch).get();
  return snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=> (_shTsOf(b)||0) - (_shTsOf(a)||0));
}
if(typeof window !== 'undefined') window.loadLiveSalesHistorySales = loadLiveSalesHistorySales;

async function renderLiveSalesHistory(){
  const wrap = document.getElementById('salesHistoryWrap');
  wrap.innerHTML = 'بيتحمّل...';
  let sales = [];
  try{
    sales = await loadLiveSalesHistorySales();
  }catch(e){
    console.warn('sales history load failed', e);
    wrap.innerHTML = '<div class="empty-cart">تعذر تحميل سجل المبيعات — جرّب تحديث الصفحة. مفيش بيانات اتشالت.</div>';
    return;
  }
  if(sales.length === 0){ wrap.innerHTML = '<div class="empty-cart">لسه مفيش مبيعات مسجلة</div>'; return; }
  window._shSalesById = {}; sales.forEach(x=>{ window._shSalesById[x.id] = x; });

  // ⭐ تقييمات العملاء على الفواتير
  // 🔴 كان فيه باجين هنا خلّوا التقييم **مايظهرش خالص**:
  //  ١) الكود كان بيستخدم `from`/`to` وهما متغيرين محليين جوه
  //     renderReportsScreen — مش موجودين في الدالة دي. فأول سطر كان بيرمي
  //     ReferenceError، والـcatch بيبلعه بصمت، والخريطة تفضل فاضية على طول.
  //  ٢) الربط كان بالتليفون + **3 دقايق** بس. وتقييم تطبيق الولاء بيوصل
  //     **بعد نص ساعة** من الشراء — يعني بره النافذة دايمًا، مهما حصل.
  //     مع إن التقييم ده جواه `saleId` = رقم الفاتورة بالظبط (رابط مؤكد
  //     100%) وإحنا كنا بنتجاهله ونخمّن بالوقت.
  // الحل: الربط بالـ`saleId` الأول (مؤكد)، والتخمين الزمني فولباك لتقييم
  // الكشك بس (الكشك مجهول — مفيهوش saleId).
  window._shRatingById = {};
  try{
    let _minTs = Infinity, _maxTs = -Infinity;
    sales.forEach(s=>{ const t = _shTsOf(s); if(t){ if(t < _minTs) _minTs = t; if(t > _maxTs) _maxTs = t; } });
    if(_minTs !== Infinity){
      // 💸 النافذة متحسوبة من الفواتير المتحمّلة نفسها — مش سحب كل التقييمات.
      //    وبنمد الآخر يومين لأن تقييم التطبيق بيتأخر (إشعار بعد نص ساعة،
      //    والعميلة ممكن تدوس عليه تاني يوم).
      const entriesSnap = await db.collection('entries')
        .where('ts','>=', _minTs - 5*60*1000)
        .where('ts','<=', _maxTs + 48*60*60*1000).get();

      window._shRatingById = shLinkRatings(sales, entriesSnap.docs.map(d=>d.data()), currentBranch);
    }
  }catch(e){ console.warn('تعذر تحميل التقييمات', e); }

  const renderRow = (s)=>{
    const d = s.createdAt && s.createdAt.toDate ? s.createdAt.toDate() : null;
    const dateStr = d ? d.toLocaleString('ar-EG') : '—';
    const badge = s.reversed ? ' <span style="color:var(--minus); font-size:11px;">(ملغاة)</span>' : (s.isReversal ? ' <span style="color:var(--warn); font-size:11px;">(عكس)</span>' : '');

    // ⭐ التقييم: الشكل بيفرّق بين المؤكد والتقريبي — التقريبي عليه «~»
    //    عشان محدش يحاسب بياعة على تقييم مخمّن بالوقت.
    let ratingBadge = '';
    const _rt = (window._shRatingById || {})[s.id];
    if(_rt){
      ratingBadge = ` <span title="${_rt.exact ? 'تقييم العميلة على الفاتورة دي بالظبط' : 'تقييم تقريبي — اترّبط بالوقت مش برقم الفاتورة'}"`
        + ` style="font-size:15px;">${RATING_ICON_MAP[_rt.r] || ''}`
        + `${_rt.exact ? '' : '<span style="font-size:10px; color:#9ca3af; vertical-align:super;">~</span>'}`
        + `${_rt.note ? '<span style="font-size:11px;"> 📝</span>' : ''}</span>`;
    }

    const isRet = (s.total||0) < 0;
    const nItems = (s.items||[]).reduce((n,it)=> n + (it.qty||1), 0);
    const accent = isRet ? '#DC2626' : '#059669';
    return `
    <div class="sh-card" data-sid="${s.id}" style="
      background:#fff; border:1px solid #e6e9ef; border-right:4px solid ${accent};
      border-radius:14px; margin-bottom:10px; overflow:hidden;
      box-shadow:0 2px 8px rgba(20,25,40,.05); transition:box-shadow .15s;">
      <div onclick="shToggle('${s.id}')" style="padding:13px 15px; display:flex; justify-content:space-between; align-items:center; gap:10px; cursor:pointer;">
        <div style="min-width:0; flex:1;">
          <div style="display:flex; align-items:center; gap:7px; flex-wrap:wrap;">
            <span style="font-weight:900; font-size:15px; letter-spacing:.3px;">${s.invoiceNo || s.id.slice(-6).toUpperCase()}</span>
            ${badge}${ratingBadge}
          </div>
          <div style="color:#6b7280; font-size:12px; margin-top:3px; display:flex; gap:10px; flex-wrap:wrap;">
            <span>🕐 ${dateStr}</span>
            <span>👤 ${s.employeeName||'—'}</span>
            <span>📦 ${nItems} قطعة</span>
            ${s.customerPhone ? `<span style="direction:ltr; display:inline-block;">📱 ${s.customerPhone}</span>` : ''}
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:9px; flex-shrink:0;">
          <div style="text-align:left;">
            <div style="font-weight:900; font-size:17px; color:${accent}; line-height:1.2;">${Math.abs(s.total||0).toFixed(2)}</div>
            <div style="font-size:10px; color:#9ca3af;">${isRet ? 'مرتجع' : 'ج.م'}</div>
          </div>
          <div id="shChev_${s.id}" style="color:#9ca3af; font-size:15px; transition:transform .2s;">▾</div>
        </div>
      </div>
      <div id="shBody_${s.id}" style="display:none; border-top:1px solid #eef0f4; background:#fafbfc; padding:12px 15px;"></div>
    </div>`;
  };

  // ⚡ فلاتر يوم سريعة: النهارده / امبارح / تاريخ معيّن — فوق شريط الشهور
  const _chip = (on)=> `flex-shrink:0; padding:8px 14px; border-radius:12px; cursor:pointer; font-weight:800; font-size:12.5px; border:1.5px solid ${on?'#818cf8':'var(--border)'}; background:${on?'rgba(129,140,248,.14)':'var(--panel2)'}; color:var(--text);`;
  const _dateVal = /^\d{4}-\d{2}-\d{2}$/.test(_shDayFilter||'') ? _shDayFilter : '';
  const dayBar = `
    <div style="display:flex; gap:7px; align-items:center; flex-wrap:wrap; padding:2px; margin-bottom:8px;">
      <button onclick="_shDayFilter = (_shDayFilter==='today' ? null : 'today'); renderLiveSalesHistory();" style="${_chip(_shDayFilter==='today')}">🟢 النهارده</button>
      <button onclick="_shDayFilter = (_shDayFilter==='yesterday' ? null : 'yesterday'); renderLiveSalesHistory();" style="${_chip(_shDayFilter==='yesterday')}">🌙 امبارح</button>
      <input type="date" value="${_dateVal}" onchange="_shDayFilter = this.value || null; renderLiveSalesHistory();" style="${_chip(!!_dateVal)} font-family:inherit;">
      ${_shDayFilter ? `<button onclick="_shDayFilter=null; renderLiveSalesHistory();" style="${_chip(false)} color:var(--minus);">✖ الكل</button>` : ''}
    </div>`;

  // 📆 العدّاد الشهري: شريط شهور فوق — كل شهر بعدد فواتيره وإجماليه، تدوس عليه يعرض أيامه بس
  const months = _groupSalesByMonth(sales);
  if(!_shMonthKey || !months.some(m=> m.key===_shMonthKey)) _shMonthKey = months.length ? months[0].key : null;
  const monthBar = months.length ? `
    <div style="display:flex; gap:7px; overflow-x:auto; padding:2px 2px 10px; margin-bottom:4px;">
      ${months.map(m=>`
        <button onclick="_shMonthKey='${m.key}'; renderLiveSalesHistory();"
          style="flex-shrink:0; text-align:center; padding:8px 14px; border-radius:12px; cursor:pointer;
                 border:1.5px solid ${m.key===_shMonthKey?'#818cf8':'var(--border)'};
                 background:${m.key===_shMonthKey?'rgba(129,140,248,.14)':'var(--panel2)'}; color:var(--text);">
          <div style="font-weight:800; font-size:12.5px;">📆 ${m.label}</div>
          <div style="font-size:10.5px; color:var(--muted); margin-top:2px;">${m.count} فاتورة · <b style="color:var(--text);">${m.total.toFixed(0)} ج.م</b></div>
        </button>`).join('')}
    </div>` : '';
  const selMonth = months.find(m=> m.key===_shMonthKey);

  // لو فيه فلتر يوم → نعرض اليوم ده بس من كل الفواتير المتحمّلة، ونخفي شريط الشهور
  const _dayKey = _shResolveDayKey(_shDayFilter);
  const groups = _dayKey
    ? _groupSalesByDay(sales).filter(g=> g.key === _dayKey)
    : _groupSalesByDay(selMonth ? selMonth.items : []);
  wrap.innerHTML = dayBar + (_dayKey ? '' : monthBar) + (groups.map(g=>
    `<div style="display:flex; justify-content:space-between; align-items:center; margin:16px 2px 8px; padding-bottom:6px; border-bottom:2px solid var(--border);">
       <div style="font-weight:800; font-size:13.5px;">📅 ${g.label}</div>
       <div style="color:var(--muted); font-size:11.5px;">${g.count} فاتورة · <b style="color:var(--text);">${g.total.toFixed(2)} ج.م</b></div>
     </div>` + g.items.map(renderRow).join('')
  ).join('') || ('<div class="empty-cart">'+(_dayKey?'مفيش فواتير في اليوم ده':'مفيش فواتير في الشهر ده')+'</div>'));
}

// ⭐ كارت تقييم العميلة جوه تفاصيل الفاتورة (مع الكلام المكتوب لو موجود)
// ⚠️ `note` كلام مكتوب من العميلة من تطبيق الولاء — **لازم يتهرّب** قبل ما
//    يتحط في innerHTML، وإلا بقى ثغرة حقن HTML من برّه النظام.
const RATING_TEXT_MAP = {1:'😠 مضايقني جدًا', 2:'🙁 مش عاجبني', 3:'🙂 كويس', 4:'😍 عجبني جدًا'};
const RATING_HUE_MAP  = {1:'#DC2626', 2:'#F59E0B', 3:'#65A30D', 4:'#059669'};
function _rtEsc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function _shRatingBlock(id){
  const rt = (window._shRatingById || {})[id];
  if(!rt) return '';
  const hue = RATING_HUE_MAP[rt.r] || '#6b7280';
  const when = rt.ts ? new Date(rt.ts).toLocaleString('ar-EG') : '';
  return '<div style="margin-top:11px; border:1px solid ' + hue + '33; background:' + hue + '0f;'
    + ' border-radius:10px; padding:10px 12px;">'
    + '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">'
    +   '<b style="color:' + hue + '; font-size:13.5px;">' + (RATING_TEXT_MAP[rt.r] || 'تقييم') + '</b>'
    +   '<span style="font-size:10.5px; color:#6b7280;">'
    +     (rt.exact ? '✅ تقييم الفاتورة دي' : '≈ ربط تقريبي بالوقت')
    +     (when ? ' · ' + when : '') + '</span>'
    + '</div>'
    + (rt.note
        ? '<div style="margin-top:7px; background:#fff; border-radius:8px; padding:8px 10px; font-size:12.5px; line-height:1.7; color:#374151; white-space:pre-wrap;">📝 '
          + _rtEsc(rt.note) + '</div>'
        : '')
    + '</div>';
}
if(typeof window !== 'undefined'){ window._shRatingBlock = _shRatingBlock; window._rtEsc = _rtEsc; }

// 🖨️ طباعة نسخة تاني من فاتورة قديمة — بنفس تصميم الفاتورة، ومن غير فتح الدرج
// 🔽 فتح تفاصيل الفاتورة **جوه الكارت** — من غير ما نفتح صفحة تانية
function shToggle(id){
  const body = document.getElementById('shBody_' + id);
  const chev = document.getElementById('shChev_' + id);
  if(!body) return;
  const open = body.style.display !== 'none';
  if(open){
    body.style.display = 'none';
    if(chev) chev.style.transform = 'rotate(0deg)';
    return;
  }
  const s = (window._shSalesById || {})[id];
  if(!s){ body.innerHTML = '<div style="color:#9ca3af; font-size:12px;">مش لاقي تفاصيل الفاتورة</div>'; }
  else {
    const rows = (s.items || []).map(function(it){
      const q = it.qty || 1;
      const unit = Number(it.price || 0);
      const line = unit * q;
      const ret = it.isReturn || unit < 0;
      return '<tr>'
        + '<td style="padding:7px 4px; font-size:13px; font-weight:600;">' + (it.name || '—')
        + (ret ? ' <span style="color:#DC2626; font-size:11px;">↩️ مرتجع</span>' : '')
        + (it.barcode ? '<div style="font-size:10.5px; color:#9ca3af; direction:ltr; text-align:right; font-family:monospace;">' + it.barcode + '</div>' : '')
        + '</td>'
        + '<td style="padding:7px 4px; text-align:center; font-size:12.5px; white-space:nowrap; direction:ltr;">'
        + q + ' × ' + Math.abs(unit).toFixed(2) + '</td>'
        + '<td style="padding:7px 4px; text-align:left; font-weight:800; font-size:13px; white-space:nowrap;'
        + (ret ? ' color:#DC2626;' : '') + '">' + Math.abs(line).toFixed(2) + '</td>'
        + '</tr>';
    }).join('');
    const pays = Object.entries(s.payments || {}).filter(function(e){ return e[1] > 0; })
      .map(function(e){
        const names = { cash:'كاش', visa:'فيزا', insta:'انستا باي', salary:'خصم راتب' };
        return '<span style="background:#eef2ff; color:#4338CA; border-radius:99px; padding:4px 11px; font-size:11.5px; font-weight:700;">'
             + (names[e[0]] || e[0]) + ': ' + Number(e[1]).toFixed(2) + '</span>';
      }).join(' ');
    // 💳💳 الفاتورة ممكن تكون اتدفعت بكارتين — بنعرضهم كلهم بمبالغهم
    const _cardList = (s.cardTxns && s.cardTxns.length) ? s.cardTxns : (s.cardTxn ? [s.cardTxn] : []);
    const card = _cardList.length ? {
      scheme: null, last4: null, transactionId: null,
      html: _cardList.map(function(c, i){
        return (_cardList.length > 1 ? ('CARD ' + (c.seq || (i+1))
                 + (c.amount != null ? ' · ' + Math.abs(c.amount).toFixed(2) + ' EGP' : '') + '<br>') : '')
             + (c.scheme || 'CARD') + ' **** ' + (c.last4 || '----')
             + (c.transactionId ? ' · TXN ' + c.transactionId : '');
      }).join('<br>')
    } : null;
    body.innerHTML =
      '<table style="width:100%; border-collapse:collapse;">'
      + '<tr style="color:#6b7280; font-size:11px; border-bottom:1px solid #e6e9ef;">'
      + '<th style="text-align:right; padding:0 4px 6px; font-weight:700;">الصنف</th>'
      + '<th style="text-align:center; padding:0 4px 6px; font-weight:700;">الكمية × السعر</th>'
      + '<th style="text-align:left; padding:0 4px 6px; font-weight:700;">الإجمالي</th></tr>'
      + rows + '</table>'
      + (pays ? '<div style="margin-top:10px; display:flex; gap:6px; flex-wrap:wrap;">' + pays + '</div>' : '')
      + (card ? '<div style="margin-top:9px; background:#0f1a2e; color:#dbeafe; border-radius:9px; padding:8px 11px; font-family:monospace; font-size:11.5px; direction:ltr; text-align:left; line-height:1.7;">'
          + card.html + '</div>' : '')
      + _shRatingBlock(id)
      + '<div style="display:flex; gap:8px; margin-top:12px;">'
      + '<button onclick="reprintSale(\'' + id + '\')" style="flex:2; padding:10px; border:none; border-radius:10px;'
      + " background:linear-gradient(135deg,#3B82F6,#1D4ED8); color:#fff; font-family:'Cairo'; font-weight:800;"
      + ' font-size:13px; cursor:pointer;">🖨️ اطبع نسخة تانية</button>'
      + '<button onclick="printGiftReceipt(\'' + id + '\')" title="من غير أسعار — للهدايا" style="flex:2; padding:10px; border:none; border-radius:10px;'
      + " background:linear-gradient(135deg,#C79A38,#9A7420); color:#fff; font-family:'Cairo'; font-weight:800;"
      + ' font-size:13px; cursor:pointer;">🎁 إيصال هدية</button>'
      + '<button onclick="openInvoice(\'' + id + '\')" style="flex:1; padding:10px; border:1px solid #d1d5db;'
      + " border-radius:10px; background:#fff; color:#374151; font-family:'Cairo'; font-weight:700;"
      + ' font-size:12.5px; cursor:pointer;">تفاصيل أكتر</button>'
      + '</div>';
  }
  body.style.display = 'block';
  if(chev) chev.style.transform = 'rotate(180deg)';
}
if(typeof window !== 'undefined') window.shToggle = shToggle;

function reprintSale(id){
  const s = (window._shSalesById||{})[id];
  if(!s){ showToast('مش لاقي بيانات الفاتورة — اعمل تحديث للسجل', 'err'); return; }
  try{
    const c = (typeof receiptDesignConfig!=='undefined' && receiptDesignConfig) || (typeof defaultReceiptConfig==='function' ? defaultReceiptConfig() : {lang:'ar'});
    const L = (typeof RECEIPT_LABELS!=='undefined') ? (RECEIPT_LABELS[c.lang]||RECEIPT_LABELS.ar) : {};
    const d = s.createdAt && s.createdAt.toDate ? s.createdAt.toDate() : new Date();
    const payStr = Object.entries(s.payments||{}).filter(([k,v])=> v>0).map(([k,v])=> (L[k]||k)+': '+Number(v).toFixed(2)).join(' | ');
    const data = {
      dateStr: d.toLocaleString(c.lang==='en' ? 'en-GB' : 'ar-EG'),
      empName: s.employeeName || '',
      branch: s.branch || '',
      // 🧾 نفس تصميم الفاتورة الأصلية بالظبط — بسعر الوحدة وبيانات الكارت
      items: (s.items||[]).map(it=> ({
        name: it.name, qty: it.qty, barcode: it.barcode || '',
        unit: Math.abs(Number(it.price||0)).toFixed(2),
        line: Math.abs((it.price||0)*(it.qty||1)).toFixed(2)
      })),
      totalStr: Number(s.total||0).toFixed(2),
      payStr,
      invoiceNo: s.invoiceNo || '',
      scanCode: s.invoiceCode || s.invoiceNo || '',
      cardTxn: s.cardTxn || null,
      cardTxns: (s.cardTxns && s.cardTxns.length) ? s.cardTxns : null,   // 💳💳 نسخة تانية بالكارتين
      // 🎁 نقط العميلة **مبتظهرش في النسخة التانية** — وده مقصود:
      //    الرصيد اللي على الأصلية كان صح لحظة البيع. النسخة ممكن تتطبع
      //    بعد أيام والعميلة اشترت واستبدلت من ساعتها، فالرقم هيبقى قديم.
      //    ورقة مكتوب عليها رصيد غلط أوحش من ورقة مش مكتوب عليها رصيد.
      custPoints: { show:false },
      isCopy: true,                       // 🔁 علامة إن دي نسخة تانية مش الأصلية
      copyAt: new Date().toLocaleString(c.lang==='en' ? 'en-GB' : 'ar-EG'),
      showAppQR: false
    };
    _printBuiltReceipt(data, {});   // {} = مفيش كاش هنا → الدرج مش هيفتح
    showToast('🖨️ بتتطبع نسخة من فاتورة ' + (s.invoiceNo || ''));
  }catch(e){ showToast('تعذر الطباعة: ' + e.message, 'err'); }
}

/* ============================================================
   🎁 إيصال هدية — من سجل المبيعات
   ------------------------------------------------------------
   ⚠️ **مش بيفتح الدرج ولا بيسجّل حاجة**: دي ورقة تانية لنفس
      الفاتورة، مفيش أي حركة فلوس. `_printBuiltReceipt(data, {})`.
   ⚠️ **مش `isCopy`**: علامة "نسخة تانية — مش الفاتورة الأصلية"
      معناها إن دي إعادة طباعة لمستند مالي. إيصال الهدية مستند
      **مختلف** أصلًا (مالوش أسعار)، فالعلامة دي هتلخبط اللي بيقراه.
   ============================================================ */
function giftReceiptData(s){
  const c = (typeof receiptDesignConfig!=='undefined' && receiptDesignConfig)
    || (typeof defaultReceiptConfig==='function' ? defaultReceiptConfig() : {lang:'ar'});
  const d = s.createdAt && s.createdAt.toDate ? s.createdAt.toDate() : new Date();
  return {
    giftMode: true,                     // 🎁 الفلاج اللي بيشيل كل الفلوس
    dateStr: d.toLocaleString(c.lang==='en' ? 'en-GB' : 'ar-EG'),
    empName: s.employeeName || '',
    branch: s.branch || '',
    // ↩️ سطور المرتجع مبتتحطش في إيصال هدية — الهدية هي اللي اتباعت
    items: (s.items||[]).filter(function(it){ return !it.isReturn && (it.qty||0) > 0; })
      .map(function(it){ return { name: it.name, qty: it.qty, barcode: it.barcode || '' }; }),
    invoiceNo: s.invoiceNo || '',
    scanCode: s.invoiceCode || s.invoiceNo || '',   // 🔑 من غيره مفيش استبدال
    custPoints: { show:false },
    showAppQR: false
  };
}
if(typeof window !== 'undefined') window.giftReceiptData = giftReceiptData;

function printGiftReceipt(id){
  const s = (window._shSalesById||{})[id];
  if(!s){ showToast('مش لاقي بيانات الفاتورة — اعمل تحديث للسجل', 'err'); return; }
  try{
    const data = giftReceiptData(s);
    if(!data.items.length){ showToast('الفاتورة دي مفيهاش أصناف مباعة', 'err'); return; }
    _printBuiltReceipt(data, {});   // {} = مفيش كاش → الدرج مايفتحش
    showToast('🎁 بيتطبع إيصال هدية لفاتورة ' + (s.invoiceNo || ''));
  }catch(e){ showToast('تعذر الطباعة: ' + e.message, 'err'); }
}
if(typeof window !== 'undefined') window.printGiftReceipt = printGiftReceipt;

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
let selectedCustomers = new Set();
let rewardStats = {};
function toggleCustSelect(phone, checked){
  if(checked) selectedCustomers.add(phone); else selectedCustomers.delete(phone);
  renderCustList();
}
function selectAllListed(){
  (custListFiltered.length ? custListFiltered : custListData).forEach(c=> c.phone && selectedCustomers.add(c.phone));
  renderCustList();
}
function clearCustSelection(){ selectedCustomers.clear(); renderCustList(); }
function sendRewardToSelected(){
  const phones = [...selectedCustomers];
  if(!phones.length){ showToast('اختار عملاء الأول', 'err'); return; }
  openRewardModal({ bulk:true, phones });
}
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
    try{
      const _rs = await db.collection(TEST_SETTINGS).doc('reward_stats_' + (pointsFieldFor(currentBranch)==='points_glow'?'glow':'echarpe')).get();
      rewardStats = _rs.exists ? _rs.data() : {};
    }catch(e){ rewardStats = {}; }
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

let custListShown = 40;
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
    // 📱 مين نزّل التطبيق فعلًا؟
    // fcmTokens = العميل فتح التطبيق ووافق على الإشعارات (دليل قاطع إنه محمّل)
    // source = العميل اتسجّل من التطبيق نفسه (مش من الكاشير)
    const appStats = customerAppStats(custListData);
    const pct = totalCustomers ? Math.round(appStats.hasApp / totalCustomers * 100) : 0;
    sumEl.innerHTML = chip('عملاء مسجّلين', totalCustomers)
      + chip('📱 معاهم التطبيق', appStats.hasApp + ' (' + pct + '%)', 'var(--accent)')
      + chip('إجمالي إنفاقهم', totalSpend.toFixed(0)+' ج.م','var(--plus)')
      + chip('إجمالي النقاط', totalPoints,'var(--warn)')
      + chip('🎁 مكافأة الترحيب', appStats.welcomeGranted + ' اتصرفت · ' + appStats.welcomeUsed + ' اتستعملت','var(--warn)')
      + chip('كل المكافآت: اتبعت/اتستعمل', (rewardStats.sent||0)+' / '+(rewardStats.used||0),'var(--accent)');
    // تفصيل مصادر التحميل — تحت الشرائح مباشرة
    const src = appStats.bySource;
    const srcRows = [
      ['📱 سجّلوا من التطبيق', appStats.fromApp],
      ['🔳 من QR المحل', src.qr],
      ['🧾 من كود الإيصال', src.receipt],
      ['👤 من كارت موظفة', src.emp],
      ['🏪 اتسجّلوا من الكاشير', appStats.fromCashier]
    ].filter(function(r){ return r[1] > 0; });
    if(srcRows.length){
      sumEl.insertAdjacentHTML('beforeend',
        '<div style="flex-basis:100%; display:flex; gap:6px; flex-wrap:wrap; margin-top:2px;">'
        + srcRows.map(function(r){
            return '<span style="background:var(--panel2); border:1px solid var(--border); border-radius:8px;'
              + 'padding:5px 9px; font-size:11px; font-weight:700;">' + r[0] + ': ' + r[1] + '</span>';
          }).join('')
        + '</div>');
    }
  }

  let list = custListData.filter(c=> !q || (c.name||'').toLowerCase().includes(q) || (c.phone||'').includes(q));
  if(sort==='spend') list.sort((a,b)=> (b._spend||0)-(a._spend||0));
  else if(sort==='recent') list.sort((a,b)=> (b._lastTs||0)-(a._lastTs||0));
  else if(sort==='points') list.sort((a,b)=> (b[pointsFieldFor(currentBranch)]||0)-(a[pointsFieldFor(currentBranch)]||0));
  else if(sort==='name') list.sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''),'ar'));

  if(list.length === 0){ wrap.innerHTML = '<div class="empty-cart">'+(q?'مفيش عميل بالبحث ده':'لسه مفيش عملاء مسجلين')+'</div>'; return; }
  custListFiltered = list;   // للمكافأة الجماعية

  const selCount = selectedCustomers.size;
  const bulkBtn = hasPerm('canEditInventory') ? `
    <div style="display:flex; gap:8px; margin-bottom:10px;">
      <button onclick="sendRewardToAllListed()" style="flex:1; padding:11px; border-radius:10px; border:none; background:var(--warn); color:#3a2600; font-weight:800; cursor:pointer;">🎁 للكل (${list.length})</button>
      <button onclick="${selCount?'sendRewardToSelected()':'selectAllListed()'}" style="flex:1; padding:11px; border-radius:10px; border:none; background:${selCount?'var(--plus)':'var(--panel2)'}; color:${selCount?'#062':'var(--text)'}; font-weight:800; cursor:pointer;">${selCount? '🎁 للمختارين ('+selCount+')' : '☑️ اختار'}</button>
      ${selCount?`<button onclick="clearCustSelection()" style="padding:11px 14px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--minus); font-weight:800; cursor:pointer;">✕</button>`:''}
    </div>` : '';

  const shown = list.slice(0, custListShown);
  wrap.innerHTML = bulkBtn + shown.map(c=>{
    const last = c._lastTs ? new Date(c._lastTs).toLocaleDateString('ar-EG', {day:'2-digit', month:'short'}) : '—';
    const checked = selectedCustomers.has(c.phone) ? 'checked' : '';
    const pts = c[pointsFieldFor(currentBranch)]||0;
    return `
    <div style="background:var(--panel); border:1px solid ${selectedCustomers.has(c.phone)?'var(--plus)':'var(--border)'}; border-radius:11px; padding:9px 12px; margin-bottom:6px; display:flex; gap:10px; align-items:center;">
      <input type="checkbox" ${checked} onclick="event.stopPropagation(); toggleCustSelect('${c.phone}', this.checked)" style="width:18px; height:18px; flex-shrink:0; cursor:pointer;">
      <div onclick="openCustomerProfile('${c.phone}')" style="flex:1; min-width:0; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <div style="min-width:0;">
          <div style="font-weight:800; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.name || 'بدون اسم'} ${c.loyaltyPin?'<span style="font-size:9px;">🔒</span>':''}</div>
          <div style="color:var(--muted); font-size:10.5px; direction:ltr; text-align:right;">${c.phone}</div>
        </div>
        <div style="text-align:left; flex-shrink:0;">
          <div style="font-weight:900; font-size:13.5px; color:var(--plus);">${(c._spend||0).toFixed(0)}<span style="font-size:9.5px; font-weight:700;"> ج.م</span></div>
          <div style="color:var(--muted); font-size:9.5px;">⭐${pts} · 🧾${c._count||0} · ${last}</div>
        </div>
      </div>
      <button onclick="event.stopPropagation(); openWaCompose('${c.phone}', ${JSON.stringify(String(c.name||'')).replace(/"/g,'&quot;')})" title="ابعت واتساب"
        style="flex-shrink:0; padding:8px 10px; border-radius:9px; border:none; background:#25d366; color:#fff; font-size:14px; cursor:pointer;">💬</button>
    </div>`;
  }).join('') + (list.length > custListShown ? `<button onclick="custListShown+=40; renderCustList();" style="width:100%; margin-top:6px; padding:11px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text); cursor:pointer; font-size:12.5px; font-weight:700;">عرض كمان (فاضل ${list.length - custListShown} عميل)</button>` : '');
}

// ---------------- End of Day (إغلاق اليوم / تقفيل الدرج) ----------------
let dcData = {};   // بيانات النهاردة من السيستم (للحساب والحفظ)

// 💰 تجميع أرقام التقفيل — دالة نقية عشان تتختبر بالـ harness.
// بتشمل المعكوس وفاتورة عكسه مع بعض (بيصفّروا بعض) — دي فلوس دخلت وخرجت فعلًا من الدرج.
function dcAggregate(sales){
  const systemTotal = (sales||[]).reduce((s,x)=> s + (x.total||0), 0);
  let cashSales=0, visaSales=0, instaSales=0, salarySales=0;
  (sales||[]).forEach(s=>{ const p=s.payments||{}; cashSales+=(p.cash||0); visaSales+=(p.visa||0); instaSales+=(p.instapay||0); salarySales+=(p.salary||0); });
  return { systemTotal, cashSales, visaSales, instaSales, salarySales };
}
window.dcAggregate = dcAggregate;

// 🕐 وقت الفاتورة = وقت البيع الفعلي مش وقت الوصول للسيرفر:
// فاتورة أوفلاين بتترفع بعد ما النت يرجع — ممكن بعد التقفيل — وطابع السيرفر
// بيبقى وقت الرفع، فكانت بتظهر "اتعملت بعد التقفيل" وهي اتباعت بدري وفلوسها
// اتعدت. الطابع المحلي (createdAtMs) هو لحظة البيع الحقيقية.
// 🛡️ حارس تلاعب: لو الفرق بين الطابعين أكبر من 48 ساعة (ساعة جهاز مضروبة أو
// متلعوب فيها) بنرجع لطابع السيرفر — البيع الطبيعي أوفلاين بيتزامن في ساعات.
function saleTs(s){
  const server = (s && s.createdAt && typeof s.createdAt.toMillis === 'function') ? s.createdAt.toMillis() : null;
  const local = (s && typeof s.createdAtMs === 'number') ? s.createdAtMs : null;
  if(local != null && server != null){
    return Math.abs(server - local) <= 48*3600000 ? local : server;
  }
  return local != null ? local : server;
}
window.saleTs = saleTs;

async function goToEndOfDay(){
  showScreen('endOfDayScreen');
  const wrap = document.getElementById('endOfDayWrap');
  wrap.innerHTML = '<div style="padding:34px; text-align:center; color:var(--muted);">بيتحمّل بيانات النهاردة...</div>';

  // 🕕 يوم الشغل مش اليوم التقويمي — البيع بعد نص الليل بيتحسب على اليوم اللي فات
  const dayMs = (typeof bizDayStartMs === 'function')
    ? bizDayStartMs()
    : (function(){ const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();

  // آخر تقفيل الأول — عشان نجيب فواتير من بدايته (الفجوة) مش من بداية اليوم بس
  let lastCloseTs = 0;
  try{
    const cq = await db.collection(TEST_SETTINGS)
      .where(firebase.firestore.FieldPath.documentId(), '>=', 'dayclose_'+currentBranch+'_')
      .where(firebase.firestore.FieldPath.documentId(), '<', 'dayclose_'+currentBranch+'_\uf8ff')
      .get();
    cq.forEach(d=>{ const t = (d.data()||{}).ts || 0; if(t < dayMs) lastCloseTs = Math.max(lastCloseTs, t); });
  }catch(e){ console.warn('last close', e); }
  const _gapValid = lastCloseTs && (dayMs - lastCloseTs) < 48*3600000;
  const fetchFromMs = _gapValid ? Math.min(lastCloseTs, dayMs) : dayMs;

  // مبيعات من بداية النافذة — استعلام بنطاق زمني مش limit(300):
  // الحد الثابت كان ثغرة في أيام المواسم (يوم يعدّي 300 فاتورة = فواتير بتقع من الحساب)
  let sales = [], _allFetched = [], _byId = new Map(), _fromCache = false, _pendingCount = 0;
  try{
    let snap;
    try{
      snap = await db.collection(TEST_SALES).where('branch','==', currentBranch)
        .where('createdAt','>=', new Date(fetchFromMs))
        .orderBy('createdAt','desc').get();
    }catch(e1){
      // فولباك لو الاستعلام بالنطاق اترفض: الطريقة القديمة بحد مرفوع
      snap = await db.collection(TEST_SALES).where('branch','==', currentBranch)
        .orderBy('createdAt','desc').limit(1000).get()
        .catch(async ()=> db.collection(TEST_SALES).where('branch','==', currentBranch).limit(1000).get());
    }
    _fromCache = !!(snap.metadata && snap.metadata.fromCache);
    snap.docs.forEach(d=>{
      const o = d.data(); o._id = d.id;
      o._pending = !!(d.metadata && d.metadata.hasPendingWrites);
      _byId.set(d.id, o);
    });
    // 📴 فواتير الأوفلاين من الجهاز ده: createdAt لسه null فمش بترجع في استعلام
    // السيرفر — بنكملها من الطابع المحلي (استعلام حقل واحد، من غير index مركب)
    try{
      const q2 = await db.collection(TEST_SALES).where('createdAtMs','>=', fetchFromMs).get();
      q2.docs.forEach(d=>{
        const o = d.data();
        if(o.branch !== currentBranch || _byId.has(d.id)) return;
        o._id = d.id; o._pending = !!(d.metadata && d.metadata.hasPendingWrites);
        _byId.set(d.id, o);
      });
    }catch(e2){ console.warn('offline sales q', e2); }
    _allFetched = Array.from(_byId.values());
    sales = _allFetched.filter(s=>{ const t = saleTs(s); return t != null && t >= dayMs; });
    _pendingCount = sales.filter(s=> s._pending).length;
  }catch(e){ console.warn('sales', e); }

  const { systemTotal, cashSales, visaSales, instaSales, salarySales } = dcAggregate(sales);

  // 🕵️ السبب الأول للأوفر اليومي: فواتير اتعملت **بعد تقفيل امبارح وقبل بداية
  // يوم الشغل الحالي** — دي مش داخلة في مبيعات النهاردة ولا دخلت تقفيل امبارح
  // (التقفيل اتعمل قبلها)، لكن كاشها موجود في الدرج → أوفر بنفس المبلغ.
  let lateSales = [], lateTotal = 0, lateCash = 0;
  if(_gapValid){
    lateSales = _allFetched.filter(s=>{
      const t = saleTs(s);
      return t != null && t >= lastCloseTs && t < dayMs;
    });
    const _lateAgg = dcAggregate(lateSales);
    lateTotal = _lateAgg.systemTotal;
    lateCash = _lateAgg.cashSales;
  }

  // 🎫 أوردرات الموظفين النهاردة (للعرض في التقفيل — خصم الراتب مش بيدخل الدرج)
  let staffOrdersToday = [];
  try{
    const soSnap = await db.collection('sales_staff_orders').where('branch','==', currentBranch).get();
    staffOrdersToday = soSnap.docs.map(d=>d.data()).filter(o=> o.ts >= dayMs && o.status !== 'rejected');
  }catch(e){ console.warn('staff orders', e); }
  const staffOrdersTotal = staffOrdersToday.reduce((s,o)=> s + (o.total||0), 0);

  // سلف النهاردة من برنامج المبيعات (sales_advances)
  let advancesTotal = 0;
  try{
    const advSnap = await db.collection('sales_advances').where('branch','==', currentBranch).get();
    advSnap.forEach(d=>{
      const a=d.data(); const t = a.ts || (a.date ? Date.parse(a.date) : 0);
      // سلف أوردرات الموظفين "ورقية" (خصم مرتبات) — مفيش كاش خرج من الدرج، فمش بتدخل حساب الدرج
      if(t >= dayMs && String(a.source||'').indexOf('staff_order') !== 0) advancesTotal += (+a.amount||0);
    });
  }catch(e){ console.warn('advances', e); }

  dcData = { systemTotal, cashSales, visaSales, instaSales, salarySales, staffOrdersCount: staffOrdersToday.length, staffOrdersTotal, advancesTotal, invoiceCount: sales.length, lateTotal, lateCash, lateCount: lateSales.length, lastCloseTs, pendingCount: _pendingCount, fromCache: _fromCache };
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
      <div class="dc-sm-sub">${dcData.invoiceCount} فاتورة · كاش ${cashSales.toFixed(0)} · فيزا ${visaSales.toFixed(0)} · انستا ${instaSales.toFixed(0)}${salarySales>0?` · 📄 راتب موظفين ${salarySales.toFixed(0)}`:''}</div>
      ${staffOrdersToday.length?`<div class="dc-sm-sub" style="color:#c084fc;">🎫 أوردرات موظفين النهاردة: ${staffOrdersToday.length} (${staffOrdersTotal.toFixed(0)} ج.م — منها ${salarySales.toFixed(0)} خصم راتب مش داخل الدرج)</div>`:''}
      ${lateSales.length?`<div class="dc-sm-sub" style="color:#f59e0b; font-weight:800;">⚠️ ${lateSales.length} فاتورة اتعملت بعد آخر تقفيل وقبل بداية اليوم (${lateTotal.toFixed(0)} ج.م — منها كاش ${lateCash.toFixed(0)}). الكاش ده في الدرج بس مش في مبيعات النهاردة → هيبان أوفر بنفس المبلغ.</div>`:''}
      ${_fromCache?`<div class="dc-sm-sub" style="color:#ef4444; font-weight:900;">📴 النت قاطع — الأرقام دي من الكاش المحلي للجهاز ده، وفواتير الأجهزة التانية ممكن تكون مش ظاهرة. استنى النت يرجع قبل التقفيل.</div>`:''}
      ${_pendingCount?`<div class="dc-sm-sub" style="color:#f59e0b; font-weight:800;">📴 ${_pendingCount} فاتورة من الجهاز ده لسه مرفعتش للسيرفر — محسوبة في الأرقام دي وهتترفع لوحدها.</div>`:''}
      <button onclick="openDayCloseLog()" style="margin-top:8px; padding:8px 16px; border-radius:9px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-family:'Cairo'; font-weight:800; font-size:12.5px; cursor:pointer;">📜 سجل التقفيلات + طباعة</button>
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
      ${dcField('سلف اليوم', 'dc_advances', advancesTotal || '', 'اللي اتاخد سلف كاش من الدرج')}
      <div class="dc-field" style="align-items:stretch;">
        <div><div class="dc-field-lbl">📝 بيان المصروفات/السلف</div>
        <div class="dc-field-hint">إجباري لو كتبت مصروفات أو غيّرت رقم السلف عن المسجّل بالسيستم</div></div>
        <input type="text" id="dc_expNote" placeholder="مثال: 120 نضافة + 80 سباك" oninput="dcClearResult()" class="dc-inp" style="text-align:right; direction:rtl;">
      </div>
      ${salarySales>0 ? dcField('📄 خصم راتب موظفين', 'dc_salary', salarySales.toFixed(0), 'بضاعة خرجت بأوردرات موظفين — بتترحّل للمرتبات، مش عجز') : ''}
    </div>

    <div class="dc-card">
      <div class="dc-card-h">💳 الفيزا والانستاباي</div>
      ${dcField('فيزا (من الماكينة)', 'dc_visa',
          isMgr ? (visaSales ? visaSales.toFixed(0) : '') : '',
          isMgr ? 'متكتب تلقائي من السيستم — عدّله لو رقم الماكينة مختلف' : 'اكتب اللي على ماكينة الفيزا')}
      ${dcField('انستاباي', 'dc_insta',
          isMgr ? (instaSales ? instaSales.toFixed(0) : '') : '',
          isMgr ? 'متكتب تلقائي من السيستم — عدّله لو مختلف' : 'اكتب إجمالي الانستاباي')}
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
  // 📴 تقفيل والنت قاطع = أرقام ناقصة محتملة (فواتير أجهزة تانية مش واصلة) — تأكيد إجباري
  if(dcData && dcData.fromCache){
    if(!confirm('📴 النت قاطع والأرقام من الكاش المحلي — فواتير الأجهزة التانية ممكن تكون ناقصة.\nالأفضل تستنى النت يرجع. متأكد إنك عايز تقفل دلوقتي؟')) return;
  }
  const denoms = [200,100,50,20,10,5];
  let counted = 0; denoms.forEach(d=> counted += dcNum('dc_den_'+d) * d);
  const flt = dcNum('dc_float'), exp = dcNum('dc_expenses'), adv = dcNum('dc_advances');
  // 🛡️ ثغرة "المصروفات المطاطة": خانة المصروفات إدخال حر — أي رقم فيها بيغطي
  // عجز بنفس المبلغ من غير أي أثر. من دلوقتي: مصروفات > 0 أو تعديل رقم السلف
  // عن المسجّل بالسيستم = بيان مكتوب إجباري، وبيتسجل في سجل التقفيل للمراجعة.
  const expNote = ((document.getElementById('dc_expNote')||{}).value || '').trim();
  const advSystem = +(dcData.advancesTotal || 0);
  const advChanged = Math.abs(adv - advSystem) > 0.01;
  if((exp > 0 || advChanged) && !expNote){
    showToast('📝 اكتب بيان المصروفات/السلف الأول — مين خد إيه وليه (إجباري)', 'err');
    const ne = document.getElementById('dc_expNote'); if(ne) ne.focus();
    return;
  }
  const visa = dcNum('dc_visa'), insta = dcNum('dc_insta');
  const salary = dcNum('dc_salary');   // 📄 أوردرات موظفين بخصم الراتب — قيمة مترحّلة للمرتبات (مش فلوس درج)

  // المفروض يتجمّع فعليًا = (كاش معدود − عهدة) + مصروفات + سلف + فيزا + انستا + خصم راتب مترحّل
  const accounted = (counted - flt) + exp + adv + visa + insta + salary;
  const overShort = +(accounted - dcData.systemTotal).toFixed(2);
  // ⚠️ الأوفر المتوقع من فواتير ما بعد آخر تقفيل (كاشها في الدرج ومش في مبيعات النهاردة)
  const _lateCash = +(dcData.lateCash || 0);
  const overShortReal = +(overShort - _lateCash).toFixed(2);

  const isShort = overShort < -0.01, isOver = overShort > 0.01;
  const state = isShort ? {c:'var(--minus)', t:'⚠️ عجز', bg:'#fdecec'} : isOver ? {c:'var(--warn)', t:'🔺 أوفر (زيادة)', bg:'#fff6e6'} : {c:'var(--plus)', t:'✅ مظبوط بالظبط', bg:'#eafaf0'};

  if(hasPerm('canViewReports')){
    // المدير يشوف النتيجة كاملة
    const _lateBlock = _lateCash > 0 ? `
          <div style="color:#b45309;"><span>منها كاش فواتير بعد آخر تقفيل (${dcData.lateCount||0} فاتورة)</span><b>${_lateCash.toFixed(2)}</b></div>
          <div style="font-weight:900;"><span>الفرق الحقيقي بعد استبعادها</span><b>${overShortReal.toFixed(2)}</b></div>` : '';
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
          ${salary>0?`<div><span>+ 📄 راتب موظفين (للمرتبات)</span><b>${salary.toFixed(2)}</b></div>`:''}
          <div class="dc-res-sep"><span>= إجمالي محسوب</span><b>${accounted.toFixed(2)}</b></div>
          <div><span>مبيعات السيستم</span><b>${dcData.systemTotal.toFixed(2)}</b></div>${_lateBlock}
        </div>
      </div>`;
  }else{
    // الكاشير: تأكيد بس من غير أي إجماليات (عدّ أعمى)
    // 👁️ الكاشير يشوف الحالة بس (تمام / عجز / أوفر) من غير أي أرقام —
    // لا مبيعات السيستم ولا قيمة الفرق، عشان ميعرفش يوصل للتوتال بالحساب العكسي
    const _cState = isShort
      ? { c:'var(--minus)', bg:'#fdecec', t:'⚠️ فيه عجز', tip:'راجع عدّ الكاش وأرقام الماكينة تاني، ولو الرقم زي ما هو بلّغ المدير' }
      : isOver
      ? { c:'var(--warn)', bg:'#fff6e6', t:'🔺 فيه زيادة (أوفر)', tip:'راجع العدّ وأرقام الماكينة — ولو زي ما هو بلّغ المدير' }
      : { c:'var(--plus)', bg:'#eafaf0', t:'✅ تمام — مظبوط', tip:'سلّم الدرج للمدير. تسلم إيدك 👌' };
    document.getElementById('dc_result').innerHTML = `
      <div class="dc-result" style="background:${_cState.bg}; border-color:${_cState.c};">
        <div class="dc-res-head" style="color:${_cState.c}; font-size:19px;">${_cState.t}</div>
        <div style="color:#555; font-size:13px; margin-top:6px;">${_cState.tip}</div>
      </div>`;
  }

  // نفتكر آخر عهدة على الجهاز ده
  try{ localStorage.setItem('dc_float_'+currentBranch, String(flt)); }catch(e){}

  // نحفظ سجل التقفيل (جوه pos_test_settings عشان القواعد الحالية تسمح بيه)
  const rec = {
    type:'dayclose', branch: currentBranch, date: todayISO(),
    countedCash: counted, float: flt, expenses: exp, advances: adv, visa, instapay: insta, salaryDeferred: salary,
    systemTotal: dcData.systemTotal, cashSales: dcData.cashSales, visaSales: dcData.visaSales, instaSales: dcData.instaSales,
    accounted, overShort, overShortReal, lateCash: _lateCash, lateTotal: +(dcData.lateTotal||0), lateCount: dcData.lateCount||0, invoiceCount: dcData.invoiceCount,
    pendingCount: dcData.pendingCount||0, closedFromCache: !!dcData.fromCache,
    expNote, advSystem, advChanged,
    closedBy: (typeof currentEmployee!=='undefined' && currentEmployee) ? (currentEmployee.name||'') : '',
    ts: Date.now()
  };
  db.collection(TEST_SETTINGS).doc('dayclose_'+currentBranch+'_'+todayISO()).set(rec, {merge:true})
    .then(()=> showToast('اتقفل اليوم واتسجل ✅'))
    .catch(e=> console.warn('dayclose save', e));
}


// ============================================================
// 📜 سجل التقفيلات — عرض وطباعة أيام مقفولة (للمدير/المالك بس)
// ============================================================
async function openDayCloseLog(){
  if(!hasPerm('canViewReports')){ showToast('السجل للمشرف/المدير بس', 'err'); return; }
  let recs = [];
  try{
    const snap = await db.collection(TEST_SETTINGS)
      .where(firebase.firestore.FieldPath.documentId(), '>=', 'dayclose_'+currentBranch+'_')
      .where(firebase.firestore.FieldPath.documentId(), '<', 'dayclose_'+currentBranch+'_\uf8ff')
      .get();
    recs = snap.docs.map(d=> d.data()).filter(r=> r && r.type==='dayclose')
      .sort((a,b)=> (b.ts||0)-(a.ts||0)).slice(0, 45);
  }catch(e){ showToast('تعذر تحميل السجل: '+e.message, 'err'); return; }
  const old = document.getElementById('dcLogOv'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'dcLogOv';
  ov.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:900; display:flex; align-items:center; justify-content:center; padding:14px;';
  const rows = recs.map((r,i)=>{
    const os = +(r.overShort||0);
    const col = Math.abs(os) < 0.01 ? 'var(--plus)' : (os > 0 ? 'var(--warn)' : 'var(--minus)');
    const lbl = Math.abs(os) < 0.01 ? '✅ مظبوط' : (os > 0 ? '🔺 أوفر '+os.toFixed(2) : '⚠️ عجز '+Math.abs(os).toFixed(2));
    return `
    <div style="border:1px solid var(--border); border-radius:11px; padding:10px 12px; margin-bottom:8px; background:var(--panel);">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
        <b style="font-size:13.5px;">📅 ${r.date||''}</b>
        <span style="color:${col}; font-weight:900; font-size:13px;">${lbl}</span>
        <span style="color:var(--muted); font-size:11.5px;">${r.invoiceCount||0} فاتورة · ${r.closedBy||'—'}</span>
        <span>
          <button onclick="this.closest('div').parentNode.querySelector('.dcl-det').style.display = this.closest('div').parentNode.querySelector('.dcl-det').style.display==='none'?'block':'none'" style="padding:5px 12px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-family:'Cairo'; font-size:11.5px; font-weight:700; cursor:pointer;">تفاصيل</button>
          <button onclick='printDayCloseRec(${JSON.stringify(JSON.stringify(r))})' style="padding:5px 12px; border-radius:8px; border:none; background:var(--plus); color:#062; font-family:'Cairo'; font-size:11.5px; font-weight:800; cursor:pointer;">🖨️ طباعة</button>
        </span>
      </div>
      <div class="dcl-det" style="display:none; margin-top:8px; font-size:12px; color:var(--text); line-height:2;">
        كاش معدود <b>${(+(r.countedCash||0)).toFixed(2)}</b> · عهدة <b>${(+(r.float||0)).toFixed(2)}</b> · مصروفات <b>${(+(r.expenses||0)).toFixed(2)}</b>${r.expNote?` <span style="color:var(--muted);">(${r.expNote})</span>`:''}<br>
        سلف <b>${(+(r.advances||0)).toFixed(2)}</b>${r.advChanged?' <span style="color:var(--warn);">⚠️ متعدّلة عن السيستم ('+(+(r.advSystem||0)).toFixed(0)+')</span>':''} · 📄 راتب <b>${(+(r.salaryDeferred||0)).toFixed(2)}</b><br>
        فيزا مكتوبة <b>${(+(r.visa||0)).toFixed(2)}</b> (السيستم ${(+(r.visaSales||0)).toFixed(0)}) · انستا <b>${(+(r.instapay||0)).toFixed(2)}</b> (السيستم ${(+(r.instaSales||0)).toFixed(0)})<br>
        محسوب <b>${(+(r.accounted||0)).toFixed(2)}</b> · السيستم <b>${(+(r.systemTotal||0)).toFixed(2)}</b>
        ${(+(r.lateCash||0))>0?`<br><span style="color:#b45309;">منها كاش فواتير بعد آخر تقفيل ${(+(r.lateCash||0)).toFixed(2)} (${r.lateCount||0} فاتورة) — الفرق الحقيقي ${(+(r.overShortReal||0)).toFixed(2)}</span>`:''}
        ${r.closedFromCache?`<br><span style="color:var(--minus);">📴 اتقفل والنت قاطع</span>`:''}${(r.pendingCount||0)>0?` · <span style="color:var(--warn);">📴 ${r.pendingCount} فاتورة كانت معلقة</span>`:''}
      </div>
    </div>`;
  }).join('') || '<div style="text-align:center; color:var(--muted); padding:30px;">لسه مفيش تقفيلات متسجلة</div>';
  ov.innerHTML = `
    <div style="background:var(--bg); border-radius:16px; width:min(660px, 96vw); max-height:88vh; display:flex; flex-direction:column; overflow:hidden;">
      <div style="display:flex; justify-content:space-between; align-items:center; padding:14px 16px; border-bottom:1px solid var(--border);">
        <b style="font-size:15px;">📜 سجل التقفيلات — ${currentBranch}</b>
        <button onclick="document.getElementById('dcLogOv').remove()" style="border:none; background:var(--panel2); color:var(--text); border-radius:8px; padding:6px 14px; font-family:'Cairo'; font-weight:800; cursor:pointer;">إغلاق ✖</button>
      </div>
      <div style="padding:12px 14px; overflow-y:auto;">${rows}</div>
    </div>`;
  document.body.appendChild(ov);
}
window.openDayCloseLog = openDayCloseLog;

// 🖨️ طباعة تقرير تقفيل يوم — على طابعة الفواتير الحرارية (أو نافذة طباعة المتصفح)
function printDayCloseRec(recJson){
  const r = (typeof recJson === 'string') ? JSON.parse(recJson) : recJson;
  const os = +(r.overShort||0);
  const stateTxt = Math.abs(os) < 0.01 ? '✅ مظبوط بالظبط' : (os > 0 ? '🔺 أوفر '+os.toFixed(2)+' ج.م' : '⚠️ عجز '+Math.abs(os).toFixed(2)+' ج.م');
  const line = (l, v)=> `<div style="display:flex; justify-content:space-between; font-size:13px; padding:2.5px 0;"><span>${l}</span><b style="direction:ltr;">${v}</b></div>`;
  const html = `
  <div style="font-family:'Cairo',sans-serif; direction:rtl; color:#000; width:100%; padding:4px 6px;">
    <div style="text-align:center; font-weight:900; font-size:17px;">تقرير إغلاق اليوم</div>
    <div style="text-align:center; font-size:12.5px; margin-bottom:6px;">${currentBranch} · ${r.date||''}${r.closedBy?` · قفل: ${r.closedBy}`:''}</div>
    <div style="border-top:2px dashed #000; margin:5px 0;"></div>
    ${line('عدد الفواتير', r.invoiceCount||0)}
    ${line('كاش معدود', (+(r.countedCash||0)).toFixed(2))}
    ${line('− عهدة', (+(r.float||0)).toFixed(2))}
    ${line('+ مصروفات', (+(r.expenses||0)).toFixed(2))}
    ${r.expNote?`<div style="font-size:11px; color:#333;">📝 ${r.expNote}</div>`:''}
    ${line('+ سلف', (+(r.advances||0)).toFixed(2))}
    ${line('+ فيزا', (+(r.visa||0)).toFixed(2))}
    ${line('+ انستاباي', (+(r.instapay||0)).toFixed(2))}
    ${(+(r.salaryDeferred||0))>0 ? line('+ 📄 راتب موظفين', (+(r.salaryDeferred||0)).toFixed(2)) : ''}
    <div style="border-top:2px dashed #000; margin:5px 0;"></div>
    ${line('= إجمالي محسوب', (+(r.accounted||0)).toFixed(2))}
    ${line('مبيعات السيستم', (+(r.systemTotal||0)).toFixed(2))}
    ${(+(r.lateCash||0))>0 ? line('منها متأخر بعد آخر تقفيل', (+(r.lateCash||0)).toFixed(2)) + line('الفرق الحقيقي', (+(r.overShortReal||0)).toFixed(2)) : ''}
    <div style="border-top:2px dashed #000; margin:5px 0;"></div>
    <div style="text-align:center; font-weight:900; font-size:16px; padding:4px 0;">${stateTxt}</div>
  </div>`;
  const inShell = (typeof window.posShell !== 'undefined');
  const cfg = inShell && typeof getPrinterCfg === 'function' ? getPrinterCfg() : null;
  if(inShell && cfg && cfg.invoicePrinter){
    window.posShell.printReceipt({ printer: cfg.invoicePrinter, paperWidth: (window.receiptDesignConfig && receiptDesignConfig.paperWidth) || '80', html })
      .catch(e=> showToast('تعذر الطباعة: '+e.message, 'err'));
    return;
  }
  const w = window.open('', '_blank', 'width=420,height=640');
  w.document.write(`<html dir="rtl"><head><meta charset="UTF-8"><style>@page{margin:4mm;}</style></head><body>${html}<script>window.print(); setTimeout(()=>window.close(), 500);<\/script></body></html>`);
  w.document.close();
  if(typeof reclaimWindowFocus === 'function') reclaimWindowFocus(500);
}
window.printDayCloseRec = printDayCloseRec;
