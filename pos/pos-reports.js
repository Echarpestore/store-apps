// ⚠️ ملف مُقسّم من app.js — جزء من نظام POS. الترتيب في index.html مهم:
// pos-core.js ← pos-admin.js ← pos-reports.js ← pos-sale.js ← app.js

// ---------------- Roles / permissions screen (manager only) ----------------
const PERM_LABELS = {
  canSell:'يبيع', canHold:'يعمل Hold/Unhold', canPrintLabel:'يطبع Price Label',
  canViewCostPrice:'يشوف سعر التكلفة', canViewStock:'يشوف المخزون (الكميات)', canViewLogs:'يشوف السجلات', canRefund:'يعمل استرجاع',
  canResetCustomerPin:'يمسح الرقم السري للعميل', canEditInventory:'يعدّل/يضيف مخزون', canReceiveGoods:'يستلم/يخرج بضاعة', canChangePrices:'يغيّر الأسعار',
  canViewReports:'يشوف التقارير المالية', canManageRoles:'يدير الصلاحيات', canSwitchBranch:'يبدّل الفرع (أدمن)'
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
    // بدل تحميل كل تاريخ الفرع: أحدث 1500 فاتورة بس (بتغطي شهور، والتقارير أصلاً بفترات قصيرة)
    const snap = await db.collection(TEST_SALES).where('branch','==', currentBranch)
      .orderBy('createdAt','desc').limit(1500).get()
      .catch(async ()=> db.collection(TEST_SALES).where('branch','==', currentBranch).limit(1500).get());
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
    const _byDay = {};
    sales.forEach(s=>{ const _t=s.createdAt&&s.createdAt.toMillis?s.createdAt.toMillis():null; if(_t==null) return; const _d=new Date(_t); const _k=_d.getFullYear()+'-'+String(_d.getMonth()+1).padStart(2,'0')+'-'+String(_d.getDate()).padStart(2,'0'); _byDay[_k]=(_byDay[_k]||0)+(s.total||0); });
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

  else if(currentReportType === 'customers'){ html = await buildCustomersReport(); }
  else if(currentReportType === 'ratings'){   html = await buildRatingsReport(from, to); }
  else if(currentReportType === 'staff'){     html = await buildStaffReport(from, to, sales); }

  wrap.innerHTML = html;
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
  }catch(e){ return `<div class="rep-card"><div style="color:var(--muted); text-align:center; padding:20px;">تعذر التحميل: ${e.message}</div></div>`; }

  const isGlow = GLOW_BRANCHES.includes(currentBranch);
  const brandCode = isGlow ? 'loyaltyCode_glow' : 'loyaltyCode';
  const custByPhone = {}; customers.forEach(c=>{ custByPhone[c.phone || c._id] = c; });
  const isAppUser = (c)=> !!c && (!!c.loyaltyPin || !!c[brandCode] || c.source==='loyalty_app');

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
    const snap = await db.collection('entries').where('branch','==', currentBranch).get();
    entries = snap.docs.map(d=>d.data());
  }catch(e){ return `<div class="rep-card"><div style="color:var(--muted); text-align:center; padding:20px;">تعذر التحميل: ${e.message}</div></div>`; }
  if(from||to){ entries = entries.filter(e=>{ const t=e.ts||0; if(from && t<from.getTime()) return false; if(to && t>to.getTime()) return false; return true; }); }

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

  return `<div class="rep-card">
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
      </tbody></table>`:''}`
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
  w.document.close(); w.focus();
  setTimeout(function(){ w.print(); }, 250);
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
  const snap = await db.collection(TEST_SALES).where('branch','==', currentBranch)
    .orderBy('createdAt','desc').limit(500).get()
    .catch(async ()=> db.collection(TEST_SALES).where('branch','==', currentBranch).limit(500).get());
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
    sumEl.innerHTML = chip('عملاء مسجّلين', totalCustomers) + chip('إجمالي إنفاقهم', totalSpend.toFixed(0)+' ج.م','var(--plus)') + chip('إجمالي النقاط', totalPoints,'var(--warn)') + chip('مكافآت: اتبعت/اتستعمل', (rewardStats.sent||0)+' / '+(rewardStats.used||0),'var(--accent)');
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

  wrap.innerHTML = bulkBtn + list.map(c=>{
    const last = c._lastTs ? new Date(c._lastTs).toLocaleDateString('ar-EG', {day:'2-digit', month:'short', year:'numeric'}) : '—';
    const hasCode = c.loyaltyCode ? `<span style="background:#eef; color:#5340c8; font-size:10px; font-weight:800; padding:2px 7px; border-radius:99px;">💳 ${c.loyaltyCode}</span>` : '';
    const hasPin = c.loyaltyPin ? '<span style="font-size:10px; color:var(--muted);">🔒 مؤمّن</span>' : '';
    const checked = selectedCustomers.has(c.phone) ? 'checked' : '';
    return `
    <div style="background:var(--panel); border:1px solid ${selectedCustomers.has(c.phone)?'var(--plus)':'var(--border)'}; border-radius:12px; padding:12px 14px; margin-bottom:9px; display:flex; gap:10px; align-items:flex-start;">
      <input type="checkbox" ${checked} onclick="event.stopPropagation(); toggleCustSelect('${c.phone}', this.checked)" style="width:20px; height:20px; margin-top:2px; flex-shrink:0; cursor:pointer;">
      <div onclick="openCustomerProfile('${c.phone}')" style="flex:1; min-width:0; cursor:pointer;">
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
    // أحدث 300 فاتورة تكفي وزيادة ليوم واحد — بدل تحميل التاريخ كله
    const snap = await db.collection(TEST_SALES).where('branch','==', currentBranch)
      .orderBy('createdAt','desc').limit(300).get()
      .catch(async ()=> db.collection(TEST_SALES).where('branch','==', currentBranch).limit(300).get());
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

