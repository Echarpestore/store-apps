// ============================================================
// profiles.js — موديول البروفايلات المترابطة (المرحلة 2)
// فاتورة ← عميل ← موظف: كل حاجة قابلة للضغط وبتوديك للتانية.
// بيعتمد على العام من app.js: db, showScreen, showToast, currentBranch,
// TEST_SALES, TEST_CUSTOMERS, TEST_EMPLOYEE_POINTS, EMPLOYEES_COLLECTION
// ============================================================

// Stack بسيط للتنقل: يفتكر الشاشة اللي جيت منها عشان "رجوع" يرجعلها بالظبط
let profileNavStack = [];
function pushProfileScreen(screenId){
  const current = document.querySelector('.screen.active');
  if(current && current.id !== screenId) profileNavStack.push(current.id);
  if(profileNavStack.length > 20) profileNavStack.shift();
  showScreen(screenId);
}
function profileBack(){
  const prev = profileNavStack.pop() || 'dashboardScreen';
  showScreen(prev);
}

// كاش مبيعات الفرع لتقليل القراءات المتكررة أثناء التنقل بين البروفايلات
let _branchSalesCache = null;
let _branchSalesCacheAt = 0;
async function getBranchSales(){
  const now = Date.now();
  if(_branchSalesCache && (now - _branchSalesCacheAt) < 30000) return _branchSalesCache;
  const snap = await db.collection(TEST_SALES).where('branch','==', currentBranch).get();
  _branchSalesCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
  _branchSalesCacheAt = now;
  return _branchSalesCache;
}
function saleTime(s){ return s.createdAt && s.createdAt.toMillis ? s.createdAt.toMillis() : 0; }
function saleDateStr(s){
  const d = s.createdAt && s.createdAt.toDate ? s.createdAt.toDate() : null;
  return d ? d.toLocaleString('ar-EG', {day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit'}) : '—';
}
const PAY_LABELS = {cash:'💵 كاش', visa:'💳 فيزا', instapay:'📱 انستا باي'};

// ---------------- فاتورة كاملة ----------------
async function openInvoice(saleId){
  pushProfileScreen('invoiceScreen');
  const wrap = document.getElementById('invoiceWrap');
  wrap.innerHTML = 'بيتحمّل...';
  try{
    const doc = await db.collection(TEST_SALES).doc(saleId).get();
    if(!doc.exists){ wrap.innerHTML = '<div class="empty-cart">الفاتورة مش موجودة</div>'; return; }
    const s = { id: doc.id, ...doc.data() };
    document.getElementById('invTitle').textContent = '🧾 فاتورة ' + s.id.slice(-6).toUpperCase();

    const statusBadge = s.reversed
      ? '<span style="color:var(--minus); font-weight:800;">⛔ ملغاة (اتعكست)</span>'
      : (s.isReversal ? '<span style="color:var(--warn); font-weight:800;">🔄 عملية عكس فاتورة</span>' : '<span style="color:var(--plus); font-weight:800;">✅ مكتملة</span>');

    const itemsRows = (s.items||[]).map((it,i)=>`
      <tr style="${it.isReturn?'color:var(--minus);':''}">
        <td style="padding:7px 4px; border-bottom:1px solid var(--border);">${i+1}</td>
        <td style="padding:7px 4px; border-bottom:1px solid var(--border); text-align:right;">${it.name}${it.isReturn?' ↩️':''}</td>
        <td style="padding:7px 4px; border-bottom:1px solid var(--border);">${it.qty}</td>
        <td style="padding:7px 4px; border-bottom:1px solid var(--border);">${it.price.toFixed(2)}</td>
        <td style="padding:7px 4px; border-bottom:1px solid var(--border);">${(it.price*it.qty).toFixed(2)}</td>
      </tr>`).join('');

    const paymentsRows = Object.entries(s.payments||{}).map(([m,amt])=>
      `<div style="display:flex; justify-content:space-between; padding:4px 0; font-size:13px;"><span>${PAY_LABELS[m]||m}</span><span>${amt.toFixed(2)} ج.م</span></div>`).join('') || '<div style="color:var(--muted); font-size:12px;">—</div>';

    wrap.innerHTML = `
      <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:14px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
          <span>${statusBadge}</span>
          <span style="color:var(--muted); font-size:12px;">${saleDateStr(s)}</span>
        </div>
        <div style="font-size:13px; padding:4px 0;">
          👤 الموظف:
          <a onclick="openEmployeeProfile('${s.employeeId||''}', '${(s.employeeName||'').replace(/'/g,"\\'")}')" style="color:var(--accent); cursor:pointer; text-decoration:underline;">${s.employeeName||'—'}</a>
        </div>
        <div style="font-size:13px; padding:4px 0;">
          🧑‍🤝‍🧑 العميل:
          ${s.customerPhone
            ? `<a onclick="openCustomerProfile('${s.customerPhone}')" style="color:var(--accent); cursor:pointer; text-decoration:underline;">${s.customerName||s.customerPhone}</a>`
            : '<span style="color:var(--muted);">من غير عميل</span>'}
        </div>
        ${s.originalSaleId ? `<div style="font-size:13px; padding:4px 0;">↩️ عكس للفاتورة: <a onclick="openInvoice('${s.originalSaleId}')" style="color:var(--accent); cursor:pointer; text-decoration:underline;">${s.originalSaleId.slice(-6).toUpperCase()}</a></div>` : ''}
      </div>

      <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:14px; margin-bottom:10px;">
        <div style="font-weight:800; margin-bottom:8px;">الأصناف</div>
        <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:center;">
          <thead><tr style="color:var(--muted);"><th>#</th><th style="text-align:right;">الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
          <tbody>${itemsRows}</tbody>
        </table>
      </div>

      <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:14px;">
        <div style="font-weight:800; margin-bottom:8px;">الدفع</div>
        ${paymentsRows}
        <div style="display:flex; justify-content:space-between; padding-top:8px; margin-top:6px; border-top:1px solid var(--border); font-weight:800; font-size:15px;">
          <span>الإجمالي</span><span style="color:${(s.total||0)<0?'var(--minus)':'var(--plus)'};">${(s.total||0).toFixed(2)} ج.م</span>
        </div>
        ${s.loyaltyPointsEarned ? `<div style="color:var(--muted); font-size:11px; margin-top:6px;">🎁 نقاط ولاء اتضافت للعميل: ${s.loyaltyPointsEarned}</div>` : ''}
        ${s.staffPointEarned ? `<div style="color:var(--muted); font-size:11px;">⭐ الفاتورة دي كسّبت الموظف نقطة</div>` : ''}
      </div>`;
  }catch(e){ wrap.innerHTML = '<div class="empty-cart">تعذر التحميل: ' + e.message + '</div>'; }
}

// ---------------- بروفايل العميل الكامل ----------------
async function openCustomerProfile(phone){
  pushProfileScreen('customerProfileScreen');
  const wrap = document.getElementById('customerProfileWrap');
  wrap.innerHTML = 'بيتحمّل...';
  try{
    const doc = await db.collection(TEST_CUSTOMERS).doc(phone).get();
    const c = doc.exists ? doc.data() : { phone, name:'', points:0 };
    document.getElementById('custProfTitle').textContent = '👤 ' + (c.name || phone);

    const sales = (await getBranchSales()).filter(s=> s.customerPhone === phone && !s.reversed);
    const realInvoices = sales.filter(s=> !s.isReversal);
    const lifetimeSpend = sales.reduce((sum,s)=> sum + (s.total||0), 0);
    const avgOrder = realInvoices.length ? (lifetimeSpend / realInvoices.length) : 0;
    const lastVisitTs = sales.length ? Math.max(...sales.map(saleTime)) : null;
    const lastVisitStr = lastVisitTs ? new Date(lastVisitTs).toLocaleDateString('ar-EG', {day:'2-digit', month:'long', year:'numeric'}) : '—';

    // المنتجات المفضلة (تجميع الكميات المشتراة عبر كل الفواتير، مستبعد المرتجعات)
    const fav = {};
    sales.forEach(s=> (s.items||[]).forEach(it=>{
      if(it.isReturn || it.price < 0) return;
      fav[it.name] = (fav[it.name]||0) + it.qty;
    }));
    const topFav = Object.entries(fav).sort((a,b)=> b[1]-a[1]).slice(0,5);

    // تقييمات الرضا (Happy or Not) المرتبطة بالعميل ده فعليًا (من مبيعات سابقة اتربطت وقتها)
    const RATING_MAP = {1:{l:'😠 مضايقني جدًا', c:'var(--minus)'}, 2:{l:'🙁 مش عاجبني', c:'var(--warn)'}, 3:{l:'🙂 كويس', c:'var(--text)'}, 4:{l:'😍 عجبني جدًا', c:'var(--plus)'}};
    let ratings = [];
    try{
      const ratingsSnap = await db.collection('entries').where('customerPhone','==', phone).get();
      ratings = ratingsSnap.docs.map(d=>d.data()).sort((a,b)=> b.ts - a.ts);
    }catch(e){ console.warn('تعذر تحميل تقييمات العميل', e); }

    const statCard = (label, value, color)=> `
      <div style="flex:1; min-width:110px; background:var(--panel2); border-radius:10px; padding:10px; text-align:center;">
        <div style="color:var(--muted); font-size:10px;">${label}</div>
        <div style="font-weight:900; font-size:16px; color:${color||'var(--text)'};">${value}</div>
      </div>`;

    const invoicesRows = sales.sort((a,b)=> saleTime(b)-saleTime(a)).slice(0,50).map(s=>`
      <div onclick="openInvoice('${s.id}')" style="display:flex; justify-content:space-between; align-items:center; padding:9px 0; border-bottom:1px solid var(--border); cursor:pointer;">
        <div>
          <div style="font-size:12px; font-weight:700;">🧾 ${s.id.slice(-6).toUpperCase()}${s.isReversal?' <span style="color:var(--warn); font-size:10px;">(عكس)</span>':''} — ${(s.items||[]).length} صنف</div>
          <div style="color:var(--muted); font-size:10px;">${saleDateStr(s)} · ${s.employeeName||'—'}</div>
        </div>
        <span style="font-weight:800; color:${(s.total||0)<0?'var(--minus)':'var(--plus)'};">${(s.total||0).toFixed(2)}</span>
      </div>`).join('') || '<div style="color:var(--muted); text-align:center; padding:14px 0; font-size:12px;">لسه مفيش مشتريات</div>';

    wrap.innerHTML = `
      <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:14px; margin-bottom:10px;">
        <div style="font-size:14px; font-weight:800;">${c.name || 'بدون اسم'}</div>
        <div style="color:var(--muted); font-size:12px; margin-bottom:10px;">📞 ${phone}</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${statCard('إجمالي الإنفاق', lifetimeSpend.toFixed(0) + ' ج.م', 'var(--plus)')}
          ${statCard('عدد الفواتير', realInvoices.length)}
          ${statCard('متوسط الفاتورة', avgOrder.toFixed(0) + ' ج.م')}
          ${statCard('نقاط الولاء', c.points||0, 'var(--warn)')}
        </div>
        <div style="color:var(--muted); font-size:11px; margin-top:8px;">آخر زيارة: ${lastVisitStr}</div>
      </div>

      ${topFav.length ? `
      <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:14px; margin-bottom:10px;">
        <div style="font-weight:800; margin-bottom:6px;">❤️ منتجاته المفضلة</div>
        ${topFav.map(([name,qty],i)=>`<div style="display:flex; justify-content:space-between; padding:4px 0; font-size:12px; border-bottom:1px solid var(--border);"><span>${i+1}. ${name}</span><span style="color:var(--muted);">${qty} قطعة</span></div>`).join('')}
      </div>` : ''}

      <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:14px; margin-bottom:10px;">
        <div style="font-weight:800; margin-bottom:6px;">⭐ تقييمات الرضا (Happy or Not)</div>
        ${ratings.length ? ratings.slice(0,10).map(r=>{
          const info = RATING_MAP[r.r] || {l:'—', c:'var(--muted)'};
          return `<div style="display:flex; justify-content:space-between; padding:4px 0; font-size:12px; border-bottom:1px solid var(--border);">
            <span style="color:${info.c}; font-weight:700;">${info.l}</span>
            <span style="color:var(--muted);">${new Date(r.ts).toLocaleDateString('ar-EG')}</span>
          </div>`;
        }).join('') : '<div style="color:var(--muted); font-size:12px; text-align:center; padding:8px 0;">لسه مفيش تقييمات مرتبطة بيه (بيترتبط تلقائي من الفواتير الجديدة)</div>'}
      </div>

      <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:14px; margin-bottom:10px;">
        <div style="font-weight:800; margin-bottom:6px;">📝 ملاحظات</div>
        <textarea id="custNotes" placeholder="اكتب أي ملاحظات عن العميل ده (مقاسات مفضلة، طلبات خاصة...)" style="width:100%; min-height:70px; padding:10px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-family:inherit; font-size:12px; resize:vertical;">${c.notes||''}</textarea>
        <button onclick="saveCustomerNotes('${phone}')" style="margin-top:6px; padding:9px 18px; border-radius:8px; border:none; background:var(--accent); color:#fff; font-weight:700; cursor:pointer; font-size:12px;">حفظ الملاحظات</button>
      </div>

      <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:14px;">
        <div style="font-weight:800; margin-bottom:6px;">🗂️ سجل المشتريات (دوس على أي فاتورة)</div>
        ${invoicesRows}
      </div>`;
  }catch(e){ wrap.innerHTML = '<div class="empty-cart">تعذر التحميل: ' + e.message + '</div>'; }
}

async function saveCustomerNotes(phone){
  const notes = document.getElementById('custNotes').value;
  try{
    await db.collection(TEST_CUSTOMERS).doc(phone).set({ notes }, { merge:true });
    showToast('اتحفظت الملاحظات ✅');
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}

// ---------------- بروفايل الموظف ----------------
async function openEmployeeProfile(empId, empName){
  pushProfileScreen('employeeProfileScreen');
  const wrap = document.getElementById('employeeProfileWrap');
  wrap.innerHTML = 'بيتحمّل...';
  try{
    document.getElementById('empProfTitle').textContent = '👤 ' + (empName || 'موظف');

    const allSales = await getBranchSales();
    const sales = allSales.filter(s=> (empId && s.employeeId === empId) || (!empId && s.employeeName === empName)).filter(s=> !s.reversed);
    const realInvoices = sales.filter(s=> !s.isReversal);
    const revenue = sales.reduce((sum,s)=> sum + (s.total||0), 0);
    const avgInvoice = realInvoices.length ? revenue / realInvoices.length : 0;
    const totalItems = realInvoices.reduce((sum,s)=> sum + (s.itemCount||0), 0);

    // نقاط الموظف من نظام نقاط الـ POS التجريبي
    let posPoints = 0;
    if(empId){
      const ptDoc = await db.collection(TEST_EMPLOYEE_POINTS).doc(empId).get();
      if(ptDoc.exists) posPoints = ptDoc.data().points || 0;
    }

    const statCard = (label, value, color)=> `
      <div style="flex:1; min-width:110px; background:var(--panel2); border-radius:10px; padding:10px; text-align:center;">
        <div style="color:var(--muted); font-size:10px;">${label}</div>
        <div style="font-weight:900; font-size:16px; color:${color||'var(--text)'};">${value}</div>
      </div>`;

    const invoicesRows = sales.sort((a,b)=> saleTime(b)-saleTime(a)).slice(0,50).map(s=>`
      <div onclick="openInvoice('${s.id}')" style="display:flex; justify-content:space-between; align-items:center; padding:9px 0; border-bottom:1px solid var(--border); cursor:pointer;">
        <div>
          <div style="font-size:12px; font-weight:700;">🧾 ${s.id.slice(-6).toUpperCase()}${s.isReversal?' <span style="color:var(--warn); font-size:10px;">(عكس)</span>':''} — ${(s.items||[]).length} صنف${s.customerPhone ? ' · 📞 '+s.customerPhone : ''}</div>
          <div style="color:var(--muted); font-size:10px;">${saleDateStr(s)}</div>
        </div>
        <span style="font-weight:800; color:${(s.total||0)<0?'var(--minus)':'var(--plus)'};">${(s.total||0).toFixed(2)}</span>
      </div>`).join('') || '<div style="color:var(--muted); text-align:center; padding:14px 0; font-size:12px;">لسه مفيش مبيعات</div>';

    wrap.innerHTML = `
      <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:14px; margin-bottom:10px;">
        <div style="font-size:14px; font-weight:800; margin-bottom:10px;">${empName || '—'}</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${statCard('إجمالي مبيعاته', revenue.toFixed(0) + ' ج.م', 'var(--plus)')}
          ${statCard('عدد الفواتير', realInvoices.length)}
          ${statCard('متوسط الفاتورة', avgInvoice.toFixed(0) + ' ج.م')}
          ${statCard('قطع مباعة', totalItems)}
          ${statCard('نقاط POS', posPoints, 'var(--warn)')}
        </div>
        <div style="color:var(--muted); font-size:10px; margin-top:8px;">ملحوظة: نقاط الحضور والمهام والمكافآت الكاملة موجودة في برنامج المبيعات (نظام الـ HR) — دي بس نقاط فواتير الـ POS.</div>
      </div>

      <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:14px;">
        <div style="font-weight:800; margin-bottom:6px;">🗂️ فواتيره (دوس على أي واحدة)</div>
        ${invoicesRows}
      </div>`;
  }catch(e){ wrap.innerHTML = '<div class="empty-cart">تعذر التحميل: ' + e.message + '</div>'; }
}

// ---------------- Timeline مبيعات المنتج (بيتنادى من products.js) ----------------
async function renderPdTimeline(productId){
  const wrap = document.getElementById('pdTimelineCard');
  if(!wrap) return;
  wrap.innerHTML = `
    <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:14px; margin-bottom:10px;">
      <div style="font-weight:800; margin-bottom:8px;">🗂️ سجل مبيعات المنتج (دوس على أي سطر)</div>
      <div id="pdTimelineList" style="font-size:12px;">بيتحمّل...</div>
    </div>`;
  try{
    const allSales = await getBranchSales();
    const rows = [];
    allSales.forEach(s=>{
      if(s.reversed) return;
      (s.items||[]).forEach(it=>{
        if(it.id !== productId) return;
        rows.push({ sale: s, item: it });
      });
    });
    rows.sort((a,b)=> saleTime(b.sale) - saleTime(a.sale));
    document.getElementById('pdTimelineList').innerHTML = rows.length ? rows.slice(0,60).map(r=>{
      const s = r.sale, it = r.item;
      const pays = Object.keys(s.payments||{}).map(m=> PAY_LABELS[m]||m).join(' + ') || '—';
      return `
      <div onclick="openInvoice('${s.id}')" style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border); cursor:pointer; gap:8px;">
        <div>
          <div style="font-weight:700;">🧾 ${s.id.slice(-6).toUpperCase()}${it.isReturn?' <span style="color:var(--minus); font-size:10px;">↩️ مرتجع</span>':''}${s.isReversal?' <span style="color:var(--warn); font-size:10px;">(عكس)</span>':''}</div>
          <div style="color:var(--muted); font-size:10px;">
            ${saleDateStr(s)} · ${s.employeeName||'—'}${s.customerPhone ? ' · 📞 '+s.customerPhone : ''} · ${pays}
          </div>
        </div>
        <div style="text-align:left; flex-shrink:0;">
          <div style="font-weight:800; color:${it.price<0?'var(--minus)':'var(--text)'};">${it.qty} × ${Math.abs(it.price).toFixed(2)}</div>
        </div>
      </div>`;
    }).join('') : '<div style="color:var(--muted); text-align:center; padding:14px 0;">لسه متباعش ولا مرة</div>';
  }catch(e){
    document.getElementById('pdTimelineList').innerHTML = '<div style="color:var(--minus);">تعذر التحميل: ' + e.message + '</div>';
  }
}
