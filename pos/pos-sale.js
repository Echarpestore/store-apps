// ⚠️ ملف مُقسّم من app.js — جزء من نظام POS. الترتيب في index.html مهم:
// pos-core.js ← pos-admin.js ← pos-reports.js ← pos-sale.js ← app.js

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
  lastAddedId = item.id;   // ده آخر منتج ضربته — هيتميّز في السلة
  renderCart();
}

let selectedCartIdx = null;
let lastAddedId = null;   // id آخر منتج اتضاف/اتزوّد في السلة — عشان نميّز صفه بلون مختلف
function _isLastAdded(c){ return !!(lastAddedId && c.id===lastAddedId && !c.isReturn && !c.isRedemption && !c.isRewardDiscount); }

// عروض الكتالوج اللي العميل فعّلها من التطبيق (بتتطبّق تلقائي على المنتج المطابق في السلة)
let custActivatedOffers = {};
function applyCustomerOffers(){
  if(!custActivatedOffers || !cart.length) return;
  cart.forEach(line=>{
    if(line.isReturn || line.isRedemption || line.offerApplied || !line.barcode) return;
    const off = custActivatedOffers[line.barcode];
    if(!off) return;
    if(off.expiry && off.expiry < Date.now()) return;          // العرض انتهت صلاحيته
    if((off.uses||0) >= (off.maxUses||1)) return;               // العميل استهلك مرّاته
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
      <tr class="${idx===selectedCartIdx?'sel ':''}${c.isReturn?'ret':''}${_isLastAdded(c)?' just-added':''}" onclick="selectCartRow(${idx})" style="${c.offerApplied?'background:linear-gradient(90deg,#ffeef5,#fff); box-shadow:inset 4px 0 0 #e27a97;':''}">
        <td>${idx+1}</td>
        <td class="item-name">${_isLastAdded(c)?'<span class="last-badge">آخر ✅</span> ':''}${c.offerApplied?'🎁 ':''}${c.name}${c.isReturn?' ↩️ (مرتجع)':''}${c.offerApplied?' <span style="color:#c0397a; font-size:10px; font-weight:800;">🎁 عرض مفعّل</span>':''}${c.discountName?` <span style="color:#1c7a2e; font-size:10px;">🏷️ ${c.discountName}</span>`:''}${c.barcode?`<div class="cart-code">${c.barcode}</div>`:''}</td>
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

// بيصفّر سياق العميل المرتبط بالفاتورة (استبدال نقط / مكافأة / عروض مفعّلة)
// مهم: عشان ما يتسربش لفاتورة تانية بعد Hold أو بدء فاتورة جديدة
function clearCustomerContext(){
  if(typeof lastAddedId !== 'undefined') lastAddedId = null;   // نلغي تمييز آخر منتج مع بداية/تعليق/استرجاع فاتورة
  if(typeof pendingRedemption   !== 'undefined') pendingRedemption   = null;
  if(typeof appliedReward       !== 'undefined') appliedReward       = null;
  if(typeof custBaseText        !== 'undefined') custBaseText        = '';
  if(typeof custPendingRedeem   !== 'undefined') custPendingRedeem   = null;
  if(typeof custReward          !== 'undefined') custReward          = null;
  if(typeof custActivatedOffers !== 'undefined') custActivatedOffers = {};
}

function captureSaleState(){
  return {
    items: cart,
    customerPhone: (document.getElementById('customerPhone')?.value || '').trim(),
    customerName: (document.getElementById('customerName')?.value || '').trim(),
    total: cart.reduce((s,c)=> s + c.price*c.qty, 0),
    // سياق الفاتورة دي يتحفظ معاها عشان ما يختلطش مع فاتورة/هولد تاني
    pendingRedemption: (typeof pendingRedemption !== 'undefined') ? pendingRedemption : null,
    appliedReward:     (typeof appliedReward     !== 'undefined') ? appliedReward     : null
  };
}
function clearSaleState(){
  cart = [];
  selectedCartIdx = null;
  clearCustomerContext();
  const ph = document.getElementById('customerPhone'); if(ph) ph.value = '';
  const cn = document.getElementById('customerName'); if(cn) cn.value = '';
  const ci = document.getElementById('customerInfo'); if(ci) ci.textContent = '';
  if(typeof setCustBox === 'function') setCustBox(false);
  if(typeof resetPaymentUI === 'function') resetPaymentUI();
}
function restoreSaleState(s){
  cart = s.items || [];
  selectedCartIdx = null;
  // نصفّر أي بقايا من الفاتورة اللي كانت مفتوحة قبلها، وبعدين نرجّع سياق الفاتورة دي بالظبط
  clearCustomerContext();
  if(typeof pendingRedemption !== 'undefined') pendingRedemption = s.pendingRedemption || null;
  if(typeof appliedReward     !== 'undefined') appliedReward     = s.appliedReward     || null;
  const ph = document.getElementById('customerPhone'); if(ph) ph.value = s.customerPhone || '';
  const cn = document.getElementById('customerName'); if(cn) cn.value = s.customerName || '';
  // لو الفاتورة عليها عميل، نعيد تحميل بياناته من الداتابيز (بيرجّع custBaseText/العروض/المكافأة صح)
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
    // Glow يرجّع Glow بس، وecharpe يرجّع echarpe بس (أي فرع echarpe)
    const saleIsGlow = GLOW_BRANCHES.includes(s.branch);
    const hereIsGlow = GLOW_BRANCHES.includes(currentBranch);
    if(saleIsGlow !== hereIsGlow){
      document.getElementById('returnInvoiceBody').innerHTML = `<div class="empty-cart">⛔ الفاتورة دي من سلسلة تانية (${s.branch||'—'})<br><span style="font-size:12px;">${hereIsGlow?'جهاز Glow يرجّع فواتير Glow بس':'الكاشير ده يرجّع فواتير echarpe بس'}</span></div>`;
      return;
    }
    returnInvoiceData = { id: doc.id, ...s };

    // نربط العميل بتاع الفاتورة الأصلية تلقائيًا — عشان المرتجع يتسجّل على حسابه ويظهر في فواتيره (وتتخصم نقطه صح)
    // ملاحظة: بنملأ الخانة بس ومش بننادي refreshCustomerInfo عشان ما نطبّقش عروض/مكافآت على فاتورة مرتجع
    let customerBanner = '';
    if(s.customerPhone){
      const _ph = document.getElementById('customerPhone'); if(_ph) _ph.value = s.customerPhone;
      const _cn = document.getElementById('customerName');  if(_cn) _cn.value  = s.customerName || '';
      if(typeof setCustBox === 'function') setCustBox(true);
      const _ci = document.getElementById('customerInfo');
      if(_ci) _ci.textContent = '↩️ مرتجع — هيتسجّل على حساب ' + (s.customerName || s.customerPhone);
      customerBanner = `<div style="background:#eafaf0; border:1.5px solid #86efac; border-radius:10px; padding:10px 12px; margin-bottom:10px; font-size:12.5px;">
        👤 <b>${s.customerName || 'عميل'}</b> — <span style="direction:ltr; unicode-bidi:embed;">${s.customerPhone}</span>
        <div style="color:#15803d; font-weight:700; margin-top:3px;">✔️ المرتجع هيتسجّل على حساب العميل ده تلقائيًا</div>
      </div>`;
    } else {
      customerBanner = `<div style="background:#fff6e6; border:1.5px solid var(--warn); border-radius:10px; padding:10px 12px; margin-bottom:10px; font-size:12.5px; color:#b45309;">
        ℹ️ الفاتورة دي مالهاش عميل مسجّل — المرتجع مش هيتربط بحساب. تقدر تكتب رقم عميل في الخانة لو حابب.
      </div>`;
    }

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
          <div style="font-weight:800; font-size:14px;">🧾 فاتورة #${s.invoiceNo||''}${s.branch?` <span style="color:var(--accent); font-size:12px;">🏬 ${s.branch}</span>`:''}</div>
          <div style="font-weight:900; color:var(--plus);">${(s.total||0).toFixed(2)} ج.م</div>
        </div>
        <div style="color:var(--muted); font-size:12px; margin-bottom:8px;">📅 ${dateStr} · من ${daysAgo} يوم</div>
        ${windowBadge}
      </div>
      ${customerBanner}
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
  const items = returnInvoiceData.items || [];
  const it = items[itemIdx];
  if(!it){ return; }
  // نوزّع أي خصم/مكافأة على مستوى الفاتورة بالنسبة → الصنف يرجع بحصته من اللي اتدفع فعلاً
  const gross = items.filter(x=> !x.isRedemption && !x.isRewardDiscount && (x.price||0) > 0)
                     .reduce((s,x)=> s + (x.price||0)*(x.qty||1), 0);
  const net = (returnInvoiceData.total != null) ? returnInvoiceData.total : gross;
  const ratio = gross > 0 ? Math.min(1, net / gross) : 1;
  const refundEach = Math.round((Math.abs(it.price||0) * ratio) * 100) / 100;
  cart.push({
    id: it.id || '__ret__'+itemIdx,
    name: it.name,
    barcode: it.barcode || '',
    price: -refundEach,
    qty: it.qty || 1,
    isReturn: true,
    fromInvoice: returnInvoiceData.invoiceNo || ''
  });
  renderCart();
  const note = ratio < 1 ? ` (بعد توزيع الخصم: ${refundEach} ج.م للقطعة)` : '';
  showToast('اتحط "'+it.name+'" كمرتجع بالأحمر ↩️'+note);
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
    // العكس بيتم لفواتير قريبة — أحدث 200 كفاية
    const snap = await db.collection(TEST_SALES).where('branch','==', currentBranch)
      .orderBy('createdAt','desc').limit(200).get()
      .catch(async ()=> db.collection(TEST_SALES).where('branch','==', currentBranch).limit(200).get());
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
  if(_busyOps.has('reverse_'+saleId)) return;
  if(!confirm('متأكد إنك عايز تعكس الفاتورة دي؟ الكمية هترجع للمخزون، والإجراء ده نهائي.')) return;
  _busyOps.add('reverse_'+saleId);
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
    // رجّع نقاط العميل: نشيل اللي كسبه ونرجّع اللي استبدله
    if(sale.customerPhone){
      const _pf = pointsFieldFor(sale.branch || currentBranch);
      const _net = -(sale.loyaltyPointsEarned||0) + (sale.pointsRedeemed||0);
      if(_net !== 0) batch.update(db.collection(TEST_CUSTOMERS).doc(sale.customerPhone), { [_pf]: firebase.firestore.FieldValue.increment(_net) });
    }
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
  finally{ _busyOps.delete('reverse_'+saleId); }
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

let _confirmSaving = false;
async function confirmPayment(){
  if(_confirmSaving){ showToast('الفاتورة بتتحفظ... استنى ثانية', 'err'); return; }   // منع التكرار
  const _btn = document.getElementById('confirmPayBtn');
  _confirmSaving = true;
  if(_btn){ _btn.dataset.lbl = _btn.textContent; _btn.disabled = true; _btn.textContent = '⏳ بيحفظ...'; }
  try{
    await _doConfirmPayment();
  }catch(e){
    console.error('confirmPayment', e);
    showToast('فشل حفظ الفاتورة: ' + (e && e.message ? e.message : e), 'err');
  }finally{
    _confirmSaving = false;
    if(_btn){ _btn.textContent = _btn.dataset.lbl || 'حفظ وطباعة'; }
    if(typeof updatePaySummary === 'function') updatePaySummary();   // بيظبط تفعيل/تعطيل الزر حسب السلة
  }
}

async function _doConfirmPayment(){
  const total = cartTotal();
  const isRefundInvoice = total < 0;
  const payments = {};
  selectedPayMethods.forEach(m=> payments[m] = paymentAmounts[m] || 0);
  const phone = document.getElementById('customerPhone').value.trim();
  const custName = document.getElementById('customerName').value.trim();
  const itemCount = cart.reduce((s,c)=>s+c.qty, 0);
  const earnsStaffPoint = !isRefundInvoice && itemCount >= MIN_ITEMS_FOR_STAFF_POINT;
  const _rate = loyaltyRedemptionConfig.pointsPerEGP || 100;
  const _rawPts = Math.floor(Math.abs(total) / _rate);
  const loyaltyPointsEarned = phone ? (total < 0 ? -_rawPts : _rawPts) : 0;   // المرتجع بيخصم نقط بالسالب
  const invoiceNo = await generateInvoiceNumber();
  // بادئة الفرع في كود الفاتورة (FT + رمز الفرع) — عشان الكود يقول الفرع فورًا ويمنع تعارض الأوفلاين
  const invoiceCode = 'FT' + branchCode(currentBranch) + invoiceNo + '-' + Date.now().toString(36).slice(-4).toUpperCase();

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
      cart.forEach(l=>{
        if(l.offerApplied && l.barcode){
          const _off = custActivatedOffers[l.barcode] || {};
          if(((_off.uses||0) + 1) >= (_off.maxUses||1)){
            db.collection(TEST_CUSTOMERS).doc(phone).update({ ['activatedOffers.'+l.barcode]: firebase.firestore.FieldValue.delete() }).catch(()=>{});   // خلصت مرّاته → يتشال
          }else{
            db.collection(TEST_CUSTOMERS).doc(phone).update({ ['activatedOffers.'+l.barcode+'.uses']: firebase.firestore.FieldValue.increment(1) }).catch(()=>{});   // لسه ليه مرّات → نزوّد العدّاد
          }
        }
      });
      if(custName) custUpdate.name = custName;
      await custRef.set(custUpdate, { merge: true });
    }
    // إحصائيات الاستعمال: عروض اتطبّقت + مكافأة اتستعملت
    try{
      const _brandS = pointsFieldFor(currentBranch)==='points_glow' ? 'glow' : 'echarpe';
      const _usedOffers = cart.filter(l=> l.offerApplied && l.barcode);
      if(_usedOffers.length){
        const _upd = {};
        _usedOffers.forEach(l=> _upd[l.barcode] = { used: firebase.firestore.FieldValue.increment(1) });
        db.collection(TEST_SETTINGS).doc('offer_stats_'+_brandS).set(_upd, { merge:true });
      }
      if(appliedReward){
        db.collection(TEST_SETTINGS).doc('reward_stats_'+_brandS).set({ used: firebase.firestore.FieldValue.increment(1) }, { merge:true });
      }
    }catch(e){}
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

