// ============================================================
// 🚚 التحويلات بين الفروع — بضاعة متتحركش غير باسم حاملها
// الإرسال: سكان القطع + الحاملة تمسح كارتها → خصم فوري + "في الطريق"
// الاستلام: موظف الفرع المستلم (غير الحاملة!) يعدّ ويأكد → إضافة للرصيد
// متأكدتش خلال 30 دقيقة → ⏰ متأخرة على عهدة الحاملة
// ============================================================

const TRANSFERS_COL = 'pos_test_transfers';
const TRANSFER_DEADLINE_MIN = 30;

let _trTab = 'in';           // in | out | new | log
let _trList = [];            // آخر تحميل
let _trNewItems = [];        // أصناف التحويلة الجديدة
let _trCarrier = null;       // {id, name} بعد مسح الكارت

function goToTransfers(){
  showScreen('transfersScreen');
  renderTransfersScreen();
}

async function loadTransfers(){
  try{
    const snap = await db.collection(TRANSFERS_COL)
      .where('branches', 'array-contains', currentBranch).get();
    _trList = snap.docs.map(d=> ({id:d.id, ...d.data()})).sort((a,b)=> b.ts - a.ts);
  }catch(e){ _trList = []; console.warn('transfers', e); }
}

function _trAgeMin(t){ return Math.floor((Date.now() - t.ts) / 60000); }
function _trIsLate(t){ return t.status==='in_transit' && Date.now() > (t.deadlineTs||0); }
function _trStatusChip(t){
  if(t.status==='confirmed')
    return `<span style="color:var(--plus); font-weight:800;">✅ اتأكدت${t.discrepancy?' <span style="color:var(--bad);">🚩 بفرق</span>':''}</span>`;
  if(_trIsLate(t))
    return `<span style="color:var(--bad); font-weight:800;">⏰ متأخرة (${_trAgeMin(t)} د) — على عهدة ${t.carrierName}</span>`;
  return `<span style="color:var(--warn); font-weight:800;">🚚 في الطريق (${_trAgeMin(t)} د من ${TRANSFER_DEADLINE_MIN})</span>`;
}

async function renderTransfersScreen(){
  const wrap = document.getElementById('transfersWrap');
  wrap.innerHTML = '<div style="padding:30px; text-align:center; color:var(--muted);">بيتحمّل...</div>';
  await loadTransfers();

  const incoming = _trList.filter(t=> t.toBranch === currentBranch);
  const outgoing = _trList.filter(t=> t.fromBranch === currentBranch);
  const pendIn = incoming.filter(t=> t.status==='in_transit').length;
  const pendOut = outgoing.filter(t=> t.status==='in_transit').length;

  const tabs = [
    ['in',  `📥 وارد ${pendIn?`<span style="background:var(--bad); color:#fff; border-radius:99px; padding:1px 7px; font-size:10px;">${pendIn}</span>`:''}`],
    ['out', `📤 صادر ${pendOut?`<span style="background:var(--warn); color:#3a2600; border-radius:99px; padding:1px 7px; font-size:10px;">${pendOut}</span>`:''}`],
    ['new', '➕ تحويل جديد'],
    ['log', '📜 السجل']
  ];
  const tabBar = `<div style="display:flex; gap:5px; background:var(--panel2); border-radius:12px; padding:5px; margin-bottom:12px;">
    ${tabs.map(([id,l])=>`<button onclick="_trTab='${id}'; renderTransfersScreen();" style="flex:1; padding:10px 4px; border-radius:9px; border:none; cursor:pointer; font-weight:800; font-size:12px; ${_trTab===id?'background:var(--panel); color:var(--text); box-shadow:0 2px 6px rgba(0,0,0,.25);':'background:none; color:var(--muted);'}">${l}</button>`).join('')}
  </div>`;

  const row = (t, showConfirm)=>{
    const itemsStr = (t.items||[]).map(i=> `${i.name} ×${i.qty}`).join(' · ');
    return `<div style="background:var(--panel); border:1px solid ${_trIsLate(t)?'var(--bad)':'var(--border)'}; border-radius:12px; padding:11px 13px; margin-bottom:8px;">
      <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px; align-items:center;">
        <div style="font-weight:800; font-size:13px;">${t.fromBranch} ← ${t.toBranch} <span style="color:var(--muted); font-weight:400; font-size:11px;">· 🧕 ${t.carrierName}</span></div>
        <div style="font-size:11.5px;">${_trStatusChip(t)}</div>
      </div>
      <div style="color:var(--muted); font-size:11.5px; margin-top:5px;">${itemsStr} <b>(${(t.items||[]).reduce((s,i)=>s+i.qty,0)} قطعة)</b></div>
      <div style="color:var(--muted); font-size:10px; margin-top:3px;">أرسلها: ${t.senderName||'—'} · ${new Date(t.ts).toLocaleString('ar-EG',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
        ${t.status==='confirmed'?` · استلمها: <b>${t.confirmedBy||'—'}</b>${t.note?' · 📝 '+t.note:''}`:''}</div>
      ${showConfirm && t.status==='in_transit' ? `<button onclick="openTransferConfirm('${t.id}')" style="margin-top:8px; width:100%; padding:10px; border-radius:9px; border:none; background:var(--plus); color:#062; font-weight:800; cursor:pointer;">📥 عدّ واستلم</button>` : ''}
    </div>`;
  };

  let body = '';
  if(_trTab==='in'){
    const pend = incoming.filter(t=> t.status==='in_transit');
    const done = incoming.filter(t=> t.status!=='in_transit').slice(0,10);
    body = (pend.length? pend.map(t=> row(t,true)).join('') : '<div class="empty-cart">مفيش تحويلات جاية في الطريق</div>')
      + (done.length? `<div style="color:var(--muted); font-size:11px; margin:12px 2px 6px;">آخر المستلَمة:</div>` + done.map(t=> row(t,false)).join('') : '');
  }
  else if(_trTab==='out'){
    const pend = outgoing.filter(t=> t.status==='in_transit');
    const done = outgoing.filter(t=> t.status!=='in_transit').slice(0,10);
    body = (pend.length? `<div style="color:var(--muted); font-size:11px; margin:0 2px 6px;">⏰ فكّر الفرع التاني لو اتأخرت:</div>` + pend.map(t=> row(t,false)).join('') : '<div class="empty-cart">مفيش تحويلات خارجة معلّقة</div>')
      + (done.length? `<div style="color:var(--muted); font-size:11px; margin:12px 2px 6px;">آخر اللي اتأكدت:</div>` + done.map(t=> row(t,false)).join('') : '');
  }
  else if(_trTab==='log'){
    body = _trList.slice(0,40).map(t=> row(t,false)).join('') || '<div class="empty-cart">لسه مفيش تحويلات</div>';
  }
  else body = _trNewFormHTML();

  wrap.innerHTML = tabBar + body;
  if(_trTab==='new') _trWireNewForm();
}

// ---------- ➕ تحويلة جديدة ----------
function _trBranches(){
  let list = [];
  try{ list = JSON.parse(localStorage.getItem('pos_branch_list')||'[]'); }catch(e){}
  if(!list.length) list = [...(typeof GLOW_BRANCHES!=='undefined'?GLOW_BRANCHES:[])];
  return list.filter(b=> b !== currentBranch);
}
function _trLastDest(){
  try{ return localStorage.getItem('tr_last_dest_'+currentBranch) || ''; }catch(e){ return ''; }
}
// 🌐 قايمة الفروع الحية من السيرفر (الذاكرة المحلية = احتياطي أوفلاين بس)
async function _trLoadBranchesFresh(){
  try{
    const snap = await db.collection('sales_employees').get();
    const set = new Set();
    snap.docs.forEach(d=>{
      const e = d.data();
      if(e.active === false || e.isAdminAccount) return;
      const b = (e.branch||'').trim();
      if(b && b !== 'الإدارة') set.add(b);
    });
    (typeof GLOW_BRANCHES !== 'undefined' ? GLOW_BRANCHES : []).forEach(b=> set.add(b));
    const list = [...set].sort((a,b)=> a.localeCompare(b,'ar'));
    if(list.length){ try{ localStorage.setItem('pos_branch_list', JSON.stringify(list)); }catch(e){} }
    return list;
  }catch(e){ return null; }
}
async function _trRefreshDestSelect(){
  const list = await _trLoadBranchesFresh();
  const sel = document.getElementById('trDestSel');
  if(!list || !sel) return;
  const keep = sel.value || _trLastDest();
  const dests = list.filter(b=> b !== currentBranch);
  sel.innerHTML = '<option value="">— اختار الفرع المستلم —</option>' +
    dests.map(b=> `<option ${b===keep?'selected':''}>${b}</option>`).join('');
}
function _trNewFormHTML(){
  const dests = _trBranches();
  return `
  <div style="background:var(--panel); border:1px solid var(--border); border-radius:14px; padding:14px;">
    <div style="font-weight:800; margin-bottom:4px;">1️⃣ امسح القطع اللي هتتحوّل</div>
    <input id="trScanInput" placeholder="امسح أو اكتب اسم/باركود — أو كارت الحاملة..." autocomplete="off" oninput="_trSuggest(this.value)"
      style="width:100%; padding:12px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-size:14px;">
    <div id="trSuggestBox" style="position:relative;"></div>
    <div id="trItemsList" style="margin-top:10px;"></div>

    <div style="font-weight:800; margin:14px 0 6px;">2️⃣ رايحة على فرع: <span style="color:var(--muted); font-size:11px; font-weight:400;">(بيتحدد لوحده من كارت الحاملة — عدّله بس لو الوجهة مختلفة)</span></div>
    <select id="trDestSel" style="width:100%; padding:11px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-size:13px;">
      <option value="">— اختار الفرع المستلم —</option>
      ${dests.map(b=>`<option ${b===_trLastDest()?'selected':''}>${b}</option>`).join('')}
    </select>
    <div style="color:var(--muted); font-size:10.5px; margin-top:4px;">💡 الجهاز بيفتكر آخر فرع بعتّله — جاهز تلقائي المرة الجاية</div>

    <div style="font-weight:800; margin:14px 0 4px;">3️⃣ الحاملة تمسح كارتها 🎫</div>
    <div style="color:var(--muted); font-size:11px; margin-bottom:6px;">اللي هتاخد البضاعة معاها — القطع على عهدتها لحد التأكيد · <b>مسح كارتها بيحدد فرعها كوجهة تلقائي</b></div>
    <input id="trCarrierInput" placeholder="مسح كارت الموظفة الحاملة..." autocomplete="off"
      style="width:100%; padding:12px; border-radius:10px; border:1.5px dashed var(--accent); background:var(--panel2); color:var(--text); font-size:14px;">
    <div id="trCarrierName" style="margin-top:6px; font-size:13px; font-weight:800; color:var(--plus);"></div>

    <button id="trSendBtn" onclick="sendTransfer()" style="margin-top:14px; width:100%; padding:13px; border-radius:11px; border:none; background:var(--accent); color:#fff; font-weight:800; font-size:14px; cursor:pointer;">🚚 إرسال التحويلة</button>
  </div>`;
}
function _trRenderItems(){
  const box = document.getElementById('trItemsList'); if(!box) return;
  box.innerHTML = _trNewItems.map((it,i)=>`
    <div style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid var(--border); border-radius:10px; margin-bottom:6px; background:var(--panel2);">
      <div style="flex:1; min-width:0;">
        <div style="font-size:12.5px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${it.name}</div>
        ${(it.barcode || it.code) ? `<div style="font-size:10.5px; color:var(--muted); direction:ltr; text-align:right; font-family:monospace; margin-top:2px;">🔖 ${it.barcode || it.code}</div>` : ''}
      </div>
      <button onclick="_trQty(${i},-1)" style="width:28px; height:28px; border-radius:8px; border:1px solid var(--border); background:var(--panel); color:var(--text); cursor:pointer;">−</button>
      <b style="min-width:24px; text-align:center;">${it.qty}</b>
      <button onclick="_trQty(${i},1)" style="width:28px; height:28px; border-radius:8px; border:1px solid var(--border); background:var(--panel); color:var(--text); cursor:pointer;">+</button>
      <button onclick="_trNewItems.splice(${i},1); _trRenderItems();" style="border:none; background:none; color:var(--bad); cursor:pointer; font-size:14px;">🗑️</button>
    </div>`).join('') || '<div style="color:var(--muted); font-size:12px; text-align:center; padding:8px;">لسه مفيش قطع — امسح فوق ⬆️</div>';
}
function _trQty(i, d){
  const it = _trNewItems[i]; if(!it) return;
  const nv = it.qty + d;
  if(nv <= 0){ _trNewItems.splice(i,1); }
  // 🚫 مفيش سقف من المخزون — الرقم استرشادي (it.stock مش موجودة أصلاً بقى)
  else it.qty = nv;
  _trRenderItems();
}
function _trSuggest(q){
  const box = document.getElementById('trSuggestBox'); if(!box) return;
  q = (q||'').trim().toLowerCase();
  if(q.length < 2 || /^EC[A-Z2-9]{5,}$/i.test(q)){ box.innerHTML=''; return; }
  const hits = allInventory.filter(p=> p.status!=='hidden' && (
    (p.name||'').toLowerCase().includes(q) || (p.barcode||'').includes(q) || (p.code||'').includes(q)
  )).slice(0,7);
  box.innerHTML = hits.length ? `<div style="position:absolute; top:2px; right:0; left:0; z-index:50; background:var(--panel); border:1px solid var(--border); border-radius:11px; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,.35);">
    ${hits.map(p=>`<div onclick="_trPickSuggest('${p.id}')" style="padding:10px 13px; cursor:pointer; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; gap:8px;">
      <span style="font-size:13px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.name}</span>
      <span style="color:var(--muted); font-size:11px; direction:ltr; flex-shrink:0;">${p.barcode||''}</span>
    </div>`).join('')}
  </div>` : '';
}
function _trPickSuggest(id){
  const p = allInventory.find(x=> x.id===id); if(!p) return;
  const inp = document.getElementById('trScanInput'); if(inp) inp.value='';
  const box = document.getElementById('trSuggestBox'); if(box) box.innerHTML='';
  _trAddItemByCode(p.barcode || p.code || '');
  if(inp) inp.focus();
}
function _trAddItemByCode(code){
  const it = allInventory.find(p=> (p.barcode||'') === code || (p.code||'') === code);
  if(!it){ showToast('مفيش منتج بالكود ده', 'err'); return; }
  // 🚫 سياسة المحل: الرقم اللي في السيستم استرشادي — التحويل مسموح دايمًا
  // (زي البيع بالظبط: لو الرصيد صفر بينزل بالسالب ويتظبط في الجرد)
  const ex = _trNewItems.find(x=> x.id === it.id);
  if(ex){ ex.qty++; }
  else _trNewItems.push({ id: it.id, name: it.name, barcode: it.barcode||'', code: it.code||'', qty: 1 });
  _trRenderItems();
}
async function _trSetCarrierByCode(code){
  try{
    const snap = await db.collection('sales_employees').where('cardCode','==',code).limit(1).get();
    if(snap.empty){ showToast('الكارت مش متسجّل', 'err'); return; }
    const _d = snap.docs[0].data();
      _trCarrier = { id: snap.docs[0].id, name: _d.name || '', branch: _d.branch || '' };
      let destMsg = '';
      const sel = document.getElementById('trDestSel');
      if(sel && _trCarrier.branch && _trCarrier.branch !== currentBranch){
        // 🎯 الوجهة اتحددت لوحدها: فرع الحاملة نفسها
        if([...sel.options].some(o=> o.value === _trCarrier.branch)){
          sel.value = _trCarrier.branch;
          destMsg = ' → رايحة ' + _trCarrier.branch + ' تلقائي';
        }
      }
      document.getElementById('trCarrierName').textContent = '🧕 الحاملة: ' + _trCarrier.name + ' ✓' + destMsg;
      showToast('🎫 الحاملة: ' + _trCarrier.name);
  }catch(err){ showToast('خطأ: ' + err.message, 'err'); }
}
function _trRouteCode(code){
  // 🧠 اللاقط الذكي: كارت موظف → حاملة · غير كده → منتج — من أي مكان في الشاشة
  const up = code.toUpperCase();
  if(/^EC[A-Z2-9]{10}$/.test(up)) _trSetCarrierByCode(up);
  else _trAddItemByCode(code);
}
function _trWireNewForm(){
  _trRenderItems();
  _trRefreshDestSelect();   // 🌐 فروع طازة من السيرفر — مش رهينة ذاكرة الجهاز
  const scan = document.getElementById('trScanInput');
  if(scan) scan.addEventListener('keydown', (e)=>{
    if(e.key !== 'Enter') return;
    const code = scan.value.trim(); scan.value = '';
    const sb = document.getElementById('trSuggestBox'); if(sb) sb.innerHTML='';
    if(code) _trRouteCode(code);
  });
  const cInp = document.getElementById('trCarrierInput');
  if(cInp) cInp.addEventListener('keydown', (e)=>{
    if(e.key !== 'Enter') return;
    const code = cInp.value.trim(); cInp.value = '';
    if(code) _trRouteCode(code);
  });
}
// لاقط على مستوى الشاشة كلها (زي شاشة الدخول): السكانر بيكتب بسرعة + Enter
let _trBuf = '', _trLastKey = 0;
async function _trConfirmByCard(code){
  const ov = document.getElementById('trConfirmOv'); if(!ov || !ov.dataset.tid) return false;
  try{
    const snap = await db.collection('sales_employees').where('cardCode','==',code).limit(1).get();
    if(snap.empty){ showToast('الكارت مش متسجّل', 'err'); return true; }
    const emp = { id: snap.docs[0].id, name: snap.docs[0].data().name||'' };
    confirmTransfer(ov.dataset.tid, emp);
  }catch(e){ showToast('خطأ: ' + e.message, 'err'); }
  return true;
}
document.addEventListener('keydown', function(e){
  // أولوية: نافذة الاستلام مفتوحة → مسح كارت في أي مكان = تأكيد باسم صاحبته
  const cov = document.getElementById('trConfirmOv');
  if(cov){
    const now0 = Date.now();
    if(now0 - _trLastKey > 90) _trBuf = '';
    _trLastKey = now0;
    if(e.key === 'Enter'){
      const code = _trBuf.toUpperCase(); _trBuf = '';
      if(/^EC[A-Z2-9]{10}$/.test(code)){ e.preventDefault(); e.stopPropagation(); _trConfirmByCard(code); }
      return;
    }
    { const _c = (typeof _scanChar==='function') ? _scanChar(e) : ((e.key&&e.key.length===1)?e.key:''); if(_c) _trBuf += _c; }
    return;
  }
  const scr = document.getElementById('transfersScreen');
  if(!scr || scr.offsetParent === null || _trTab !== 'new') return;
  const a = document.activeElement;
  const inOurInputs = a && (a.id === 'trScanInput' || a.id === 'trCarrierInput');
  if(inOurInputs) return;   // الخانات ليها معالجها — ده للمسح وانت مش واقف في خانة
  const now = Date.now();
  if(now - _trLastKey > 90) _trBuf = '';
  _trLastKey = now;
  if(e.key === 'Enter'){
    const code = _trBuf; _trBuf = '';
    if(code.length >= 4){ e.preventDefault(); _trRouteCode(code); }
    return;
  }
  { const _c = (typeof _scanChar==='function') ? _scanChar(e) : ((e.key&&e.key.length===1)?e.key:''); if(_c) _trBuf += _c; }
  if(_trBuf.length > 30) _trBuf = _trBuf.slice(-30);
}, true);
async function sendTransfer(){
  const dest = (document.getElementById('trDestSel')||{}).value;
  if(!_trNewItems.length){ showToast('امسح القطع الأول', 'err'); return; }
  if(!dest){ showToast('اختار الفرع المستلم', 'err'); return; }
  if(!_trCarrier){ showToast('الحاملة لازم تمسح كارتها 🎫', 'err'); return; }
  const btn = document.getElementById('trSendBtn'); if(btn) btn.disabled = true;
  try{
    // خصم فوري من رصيد الفرع المرسل (القطع بقت "في الطريق" — مش رصيد حد)
    const batch = db.batch();
    _trNewItems.forEach(it=>{
      batch.update(db.collection(TEST_INVENTORY).doc(it.id), {
        ['qtyByBranch.'+currentBranch]: firebase.firestore.FieldValue.increment(-it.qty)
      });
    });
    await batch.commit();
    await db.collection(TRANSFERS_COL).add({
      fromBranch: currentBranch, toBranch: dest,
      branches: [currentBranch, dest],   // لسهولة الاستعلام للفرعين
      items: _trNewItems.map(it=> ({ id: it.id, name: it.name, barcode: it.barcode, qty: it.qty })),
      carrierId: _trCarrier.id, carrierName: _trCarrier.name,
      senderName: (currentEmployee&&currentEmployee.name)||'',
      status: 'in_transit', ts: Date.now(),
      deadlineTs: Date.now() + TRANSFER_DEADLINE_MIN*60000
    });
    try{ localStorage.setItem('tr_last_dest_'+currentBranch, dest); }catch(e){}
    showToast('🚚 اتبعتت — على عهدة ' + _trCarrier.name + ' لحد ما فرع ' + dest + ' يأكد');
    _trNewItems = []; _trCarrier = null; _trTab = 'out';
    if(typeof loadInventory === 'function') loadInventory();
    renderTransfersScreen();
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); if(btn) btn.disabled = false; }
}

// ---------- 📥 الاستلام (موظف الفرع المستلم — مش الحاملة) ----------
async function openTransferConfirm(id){
  const t = _trList.find(x=> x.id === id); if(!t) return;
  if(currentEmployee && currentEmployee.id === t.carrierId){
    showToast('⛔ الحاملة مينفعش تأكد لنفسها — موظف الفرع المستلم هو اللي يعدّ ويأكد', 'err');
    return;
  }
  const old = document.getElementById('trConfirmOv'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'trConfirmOv';
  ov.dataset.tid = t.id;
  ov.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.72); z-index:9999; display:flex; align-items:center; justify-content:center; padding:14px;';
  ov.innerHTML = `<div style="background:var(--panel); border:1px solid var(--border); border-radius:16px; padding:16px; max-width:440px; width:100%; max-height:85vh; overflow-y:auto;">
    <div style="font-weight:800; margin-bottom:2px;">📥 استلام تحويلة من ${t.fromBranch}</div>
    <div style="color:var(--muted); font-size:11.5px; margin-bottom:10px;">جايبتها: ${t.carrierName} · عدّ القطع اللي في إيدك فعلًا وعدّل لو فيه فرق</div>
    ${(t.items||[]).map((it,i)=>`
      <div style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid var(--border); border-radius:10px; margin-bottom:6px;">
        <div style="flex:1; font-size:12.5px; font-weight:700;">${it.name} <span style="color:var(--muted); font-weight:400;">(اتبعت ${it.qty})</span></div>
        <input type="number" min="0" max="${it.qty}" value="${it.qty}" id="trCf_${i}" style="width:64px; padding:8px; text-align:center; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-weight:800;">
      </div>`).join('')}
    <input id="trCfNote" placeholder="ملاحظة (لو فيه نقص اكتب السبب)..." style="width:100%; margin-top:4px; padding:10px; border-radius:9px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-size:12px;">
    <div style="margin-top:12px; padding:11px; border:1.5px dashed var(--accent); border-radius:11px; text-align:center; background:var(--panel2);">
      <div style="font-weight:800; font-size:13.5px;">🎫 المستلمة تمسح كارتها = تأكيد فوري</div>
      <div style="color:var(--muted); font-size:10.5px; margin-top:2px;">عدّي القطع (وعدّلي لو فيه نقص) وبعدين امسحي — التأكيد هيتسجل باسم صاحبة الكارت</div>
    </div>
    <div style="display:flex; gap:8px; margin-top:8px;">
      <button onclick="confirmTransfer('${t.id}')" style="flex:2; padding:11px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-weight:700; font-size:12px; cursor:pointer;">✅ تأكيد بدون كارت (باسم المسجّلة دخول)</button>
      <button onclick="document.getElementById('trConfirmOv').remove()" style="flex:1; padding:11px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text); cursor:pointer; font-size:12px;">إلغاء</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}
async function confirmTransfer(id, confirmer){
  const t = _trList.find(x=> x.id === id); if(!t) return;
  const who = confirmer || (currentEmployee ? { id: currentEmployee.id, name: currentEmployee.name||'' } : null);
  if(who && who.id === t.carrierId){
    showToast('⛔ الحاملة مينفعش تأكد لنفسها — كارت موظف تاني من الفرع', 'err');
    return;
  }
  const confirmed = (t.items||[]).map((it,i)=>{
    const v = parseInt((document.getElementById('trCf_'+i)||{}).value);
    return { ...it, confirmedQty: (isNaN(v)||v<0) ? 0 : Math.min(v, it.qty) };
  });
  const note = (document.getElementById('trCfNote')||{}).value.trim();
  const discrepancy = confirmed.some(it=> it.confirmedQty !== it.qty);
  if(discrepancy && !note){ showToast('فيه فرق في العدد — اكتب ملاحظة بالسبب', 'err'); return; }
  try{
    const batch = db.batch();
    confirmed.forEach(it=>{
      if(it.confirmedQty > 0) batch.update(db.collection(TEST_INVENTORY).doc(it.id), {
        ['qtyByBranch.'+t.toBranch]: firebase.firestore.FieldValue.increment(it.confirmedQty)
      });
    });
    batch.update(db.collection(TRANSFERS_COL).doc(id), {
      status: 'confirmed', confirmedAt: Date.now(),
      confirmedBy: (who&&who.name)||'',
      confirmedById: (who&&who.id)||'',
      confirmedByCard: !!confirmer,
      items: confirmed, discrepancy, note
    });
    await batch.commit();
    const ov = document.getElementById('trConfirmOv'); if(ov) ov.remove();
    showToast(discrepancy ? '🚩 اتسجل الاستلام بفرق — الفرق على عهدة ' + t.carrierName : '✅ اتأكد الاستلام والرصيد دخل الفرع');
    if(typeof loadInventory === 'function') loadInventory();
    renderTransfersScreen();
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}

// ---------- ربط مسح كارت الحاملة في شاشة البيع (أولوية التحويلة الواردة) ----------
async function checkIncomingTransferFor(empId){
  try{
    const snap = await db.collection(TRANSFERS_COL)
      .where('carrierId','==',empId).where('status','==','in_transit')
      .where('toBranch','==',currentBranch).limit(1).get();
    if(snap.empty) return false;
    _trList = snap.docs.map(d=> ({id:d.id, ...d.data()}));
    goToTransfers(); _trTab = 'in'; await renderTransfersScreen();
    openTransferConfirm(snap.docs[0].id);
    return true;
  }catch(e){ return false; }
}
