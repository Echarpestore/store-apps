// ============================================================
// 🧮 stock-count.js — الجرد بالباركود (مرحلة ٣ من دورة المخزون)
// ------------------------------------------------------------
// · جرد كامل · قسم · أصناف محددة.
// · **العد الأول أعمى**: كمية السيستم مخفية لحد ما العد يتقفل، عشان
//   النتيجة تعكس الموجود فعلًا مش تتأثر بالرقم المكتوب.
// · تقرير الفرق (رصيد السيستم · العدد الفعلي · الفرق) ← إعادة عد
//   للأصناف اللي محتاجة ← اعتماد بالصلاحية (المالك/المدير — قرار 23-09).
// · الاعتماد **بيعمل حركة تسوية موثقة** عن طريق `stockApply` — الرقم
//   عمره ما يتغيّر من غير أثر، والتكرار مبيعملش تسوية مرتين.
//
// 🕐 البيع شغّال أثناء العد (قرار المالك: الجرد بيتعمل في الحالتين):
//    كل سطر بيتسجل معاه **وقت عدّه**. وقت المقارنة بنرجّع رصيد السيستم
//    للحظة العد: نطرح اللي اتباع ونضيف اللي اترجع ونعكس حركات المخزون
//    اللي حصلت بعد العد. من غير ده كل قطعة تتباع أثناء الجرد كانت
//    هتطلع «عجز» وهمي.
// ============================================================

const STOCK_COUNTS = 'pos_stock_counts';

let _countId = null;          // الجلسة المفتوحة على الجهاز ده
let _countDoc = null;         // آخر نسخة مقروءة من مستند الجرد
let _countLines = {};         // itemId → سطر عد
let _countReview = null;      // نتيجة المقارنة بعد إقفال العد

function _countNewId(){
  const b = (typeof branchCode === 'function') ? branchCode(currentBranch) : 'X';
  return 'CNT' + b + Date.now().toString(36).toUpperCase();
}

/* مين له حق الاعتماد: المالك أو المدير (قرار المالك 23-09) */
function canApproveCount(){
  if(typeof currentEmployee !== 'undefined' && currentEmployee && currentEmployee._admin) return true;
  const r = (typeof currentEmployeeRole !== 'undefined') ? currentEmployeeRole : '';
  return r === 'admin' || r === 'manager';
}

/* ---------------- بدء الجرد ---------------- */
/* scope: 'full' | 'section' | 'items' */
async function countStart(o){
  o = o || {};
  if(_countId) throw new Error('فيه جرد مفتوح خلاص — اقفله الأول');
  const id = _countNewId();
  const doc = {
    branch: currentBranch, scope: o.scope || 'full',
    sectionName: o.sectionName || '', itemIds: o.itemIds || [],
    status: 'counting', blind: true,
    startedAt: Date.now(),
    startedById: (currentEmployee && currentEmployee.id) || '',
    startedByName: (currentEmployee && currentEmployee.name) || ''
  };
  await db.collection(STOCK_COUNTS).doc(id).set(doc, { merge: true });
  _countId = id; _countDoc = { id, ...doc }; _countLines = {}; _countReview = null;
  return _countDoc;
}

/* ---------------- العد ---------------- */
/* مسح باركود = +1 · إدخال يدوي = رقم. مفيش رصيد سيستم بيترجع هنا — العد أعمى. */
async function countAdd(item, qty, opts){
  if(!_countId) throw new Error('مفيش جرد مفتوح');
  if(!item || !item.id) throw new Error('صنف مش معروف');
  const add = (opts && opts.replace) ? null : (Number(qty) || 1);
  const prev = _countLines[item.id];
  const counted = (opts && opts.replace) ? Number(qty) || 0 : ((prev ? prev.counted : 0) + add);
  if(counted < 0) throw new Error('العدد ماينفعش يكون بالسالب');
  const line = {
    itemId: item.id, name: item.name || '', barcode: item.barcode || '',
    counted,
    /* ⏱️ وقت العد — ده أساس حساب حركات البيع اللي تحصل بعده */
    countedAt: Date.now(),
    countedById: (currentEmployee && currentEmployee.id) || '',
    countedByName: (currentEmployee && currentEmployee.name) || ''
  };
  await db.collection(STOCK_COUNTS).doc(_countId).collection('lines').doc(item.id).set(line, { merge: true });
  _countLines[item.id] = line;
  return line;   // 🙈 مفيش systemQty في الرد — العد الأول أعمى بالتصميم
}

/* ---------------- حركات الصنف بعد لحظة عدّه ---------------- */
/* بيرجّع **صافي** التغيّر في الفرع من `sinceMs` لدلوقتي:
     البيع بالسالب · المرتجع بالموجب · حركات المخزون (تحويلات/تسويات) بإشارتها. */
async function countMovementsSince(itemId, branch, sinceMs){
  let net = 0;
  // 🧾 الفواتير: السطر المرتجع كميته موجبة ومعاه isReturn، والبيع بيخصم
  try{
    const snap = await db.collection(TEST_SALES)
      .where('branch', '==', branch).where('createdAtMs', '>=', sinceMs).get();
    snap.docs.forEach(d => {
      const s = d.data() || {};
      (s.items || []).forEach(it => {
        if(it.id !== itemId) return;
        const q = Math.abs(Number(it.qty) || 0);
        net += it.isReturn ? q : -q;
      });
    });
  }catch(e){ throw new Error('مقدرناش نقرا فواتير فترة الجرد — ' + (e.message || e)); }
  // 📦 حركات المخزون المسجّلة (تحويلات · تسويات سابقة)
  try{
    const snap = await db.collection(STOCK_MOVES)
      .where('itemIds', 'array-contains', itemId).get();
    snap.docs.forEach(d => {
      const m = d.data() || {};
      if((m.at || 0) < sinceMs) return;
      (m.lines || []).forEach(l => {
        if(l.itemId !== itemId) return;
        const q = Math.abs(Number(l.qty) || 0);
        if(l.from === branch) net -= q;
        if(l.to === branch)   net += q;
      });
    });
  }catch(e){ throw new Error('مقدرناش نقرا سجل الحركة — ' + (e.message || e)); }
  return net;
}

/* ---------------- إقفال العد وتقرير الفرق ---------------- */
/* رصيد السيستم **لحظة العد** = الرصيد دلوقتي − الحركات اللي حصلت بعد العد. */
async function countReview(){
  if(!_countId) throw new Error('مفيش جرد مفتوح');
  const linesSnap = await db.collection(STOCK_COUNTS).doc(_countId).collection('lines').get();
  const rows = [];
  for(const d of linesSnap.docs){
    const l = d.data() || {};
    const inv = await db.collection(TEST_INVENTORY).doc(l.itemId).get();
    if(!inv.exists){ rows.push({ ...l, missingItem: true }); continue; }
    const qtyNow = Number(((inv.data() || {}).qtyByBranch || {})[currentBranch]) || 0;
    const since = await countMovementsSince(l.itemId, currentBranch, l.countedAt || 0);
    const systemAtCount = qtyNow - since;
    rows.push({
      ...l, systemAtCount, qtyNow, movedSince: since,
      diff: Math.round((Number(l.counted) || 0) - systemAtCount)
    });
  }
  rows.sort((a, b) => Math.abs(b.diff || 0) - Math.abs(a.diff || 0));
  _countReview = rows;
  await db.collection(STOCK_COUNTS).doc(_countId).set({
    status: 'review', reviewedAt: Date.now(),
    totals: {
      items: rows.length,
      short: rows.filter(r => (r.diff || 0) < 0).length,
      over:  rows.filter(r => (r.diff || 0) > 0).length
    }
  }, { merge: true });
  return rows;
}

/* إعادة عد صنف: بيمسح عدّه ويرجّعه للعد (والوقت بيتجدد مع العد الجديد) */
async function countRecount(itemId){
  if(!_countId) throw new Error('مفيش جرد مفتوح');
  await db.collection(STOCK_COUNTS).doc(_countId).collection('lines').doc(itemId)
    .set({ needsRecount: true, recountAskedAt: Date.now() }, { merge: true });
  delete _countLines[itemId];
  await db.collection(STOCK_COUNTS).doc(_countId).set({ status: 'counting' }, { merge: true });
  _countReview = null;
}

/* ---------------- الاعتماد = حركة تسوية موثقة ---------------- */
async function countApprove(reason){
  if(!_countId) throw new Error('مفيش جرد مفتوح');
  if(!canApproveCount()) throw new Error('الاعتماد للمالك أو المدير بس');
  /* 🔄 الفروق بتتحسب **من جديد** لحظة الاعتماد — ممكن يكون عدّى وقت
     وحصل بيع بعد المراجعة، والتسوية لازم تتبني على أحدث حساب. */
  const rows = await countReview();
  const lines = [];
  rows.forEach(r => {
    const d = Math.round(Number(r.diff) || 0);
    if(!d || r.missingItem) return;
    lines.push(d < 0
      ? { itemId: r.itemId, name: r.name, barcode: r.barcode, qty: Math.abs(d), from: currentBranch, to: null }
      : { itemId: r.itemId, name: r.name, barcode: r.barcode, qty: d, from: null, to: currentBranch });
  });
  if(lines.length){
    /* 🔒 معرّف الحركة من رقم الجرد — اعتماد مكرر أو نت قاطع مايعملش تسوية مرتين */
    await stockApply({
      docType: 'count', docId: _countId, phase: 'adjust',
      reason: 'تسوية جرد ' + _countId + (reason ? ' — ' + reason : ''),
      note: reason || '', lines
    });
  }
  await db.collection(STOCK_COUNTS).doc(_countId).set({
    status: 'approved', approvedAt: Date.now(),
    approvedById: (currentEmployee && currentEmployee.id) || '',
    approvedByName: (currentEmployee && currentEmployee.name) || '',
    approvedRole: (typeof currentEmployeeRole !== 'undefined' ? currentEmployeeRole : ''),
    approveReason: reason || '',
    adjustedItems: lines.length,
    result: rows.map(r => ({ itemId: r.itemId, name: r.name, counted: r.counted,
                             system: r.systemAtCount, diff: r.diff }))
  }, { merge: true });
  const id = _countId;
  _countId = null; _countDoc = null; _countLines = {}; _countReview = null;
  return { ok: true, countId: id, adjusted: lines.length };
}

async function countCancel(){
  if(!_countId) return;
  await db.collection(STOCK_COUNTS).doc(_countId).set({ status: 'cancelled', cancelledAt: Date.now() }, { merge: true });
  _countId = null; _countDoc = null; _countLines = {}; _countReview = null;
}

/* ---------------- الشاشة ---------------- */
function goToStockCount(){
  showScreen('stockCountScreen');
  renderStockCount();
}

function renderStockCount(){
  const w = document.getElementById('stockCountWrap');
  if(!w) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  if(!_countId){
    w.innerHTML = `
      <div style="max-width:520px; margin:24px auto; display:grid; gap:14px;">
        <div style="font-size:15px; color:var(--muted);">اختار نوع الجرد وابدأ. كمية السيستم هتفضل مخفية لحد ما تقفل العد.</div>
        <select id="scScope" style="padding:12px; font-size:16px; border-radius:10px;">
          <option value="full">جرد كامل</option>
          <option value="section">قسم</option>
          <option value="items">أصناف محددة</option>
        </select>
        <input id="scSection" placeholder="اسم القسم (لو اخترت قسم)" style="padding:12px; font-size:16px; border-radius:10px;">
        <button onclick="scStart()" style="padding:14px; font-size:17px; font-weight:800;">▶️ ابدأ الجرد</button>
      </div>`;
    return;
  }
  const rows = Object.values(_countLines).sort((a, b) => (b.countedAt || 0) - (a.countedAt || 0));
  if(!_countReview){
    w.innerHTML = `
      <div style="display:grid; gap:12px; max-width:720px; margin:16px auto;">
        <div style="background:#FFF7E6; border:1px solid #F0C36D; border-radius:10px; padding:10px; font-size:14px;">
          🙈 <b>عد أعمى</b> — كمية السيستم مخفية عن قصد. عدّ اللي قدامك بس.
          &nbsp;·&nbsp; جرد <b>${esc(_countId)}</b>
        </div>
        <input id="scScan" placeholder="امسح الباركود أو اكتبه واضغط Enter"
               onkeydown="if(event.key==='Enter') scScan(this.value)"
               style="padding:14px; font-size:18px; border-radius:10px;" autofocus>
        <div style="display:flex; gap:10px;">
          <button onclick="scFinish()" style="flex:2; padding:14px; font-weight:800;">✅ إنهاء العد وعرض الفرق</button>
          <button class="secondary" onclick="scCancel()" style="flex:1;">إلغاء</button>
        </div>
        <div style="font-size:14px; color:var(--muted);">اتعدّ: ${rows.length} صنف</div>
        <table style="width:100%; border-collapse:collapse; font-size:15px;">
          ${rows.map(r => `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:8px;">${esc(r.name)}</td>
            <td style="padding:8px; text-align:center; font-weight:800;">${r.counted}</td>
            <td style="padding:8px; text-align:left;">
              <button class="secondary" onclick="scSet('${esc(r.itemId)}')">تعديل</button></td>
          </tr>`).join('')}
        </table>
      </div>`;
    const s = document.getElementById('scScan'); if(s) s.focus();
    return;
  }
  const rv = _countReview;
  const short = rv.filter(r => (r.diff || 0) < 0), over = rv.filter(r => (r.diff || 0) > 0);
  w.innerHTML = `
    <div style="display:grid; gap:12px; max-width:860px; margin:16px auto;">
      <div style="font-size:16px;">📋 تقرير الفرق — عجز في <b>${short.length}</b> صنف · زيادة في <b>${over.length}</b></div>
      <table style="width:100%; border-collapse:collapse; font-size:15px;">
        <tr style="background:#f5f5f5; font-weight:800;">
          <td style="padding:8px;">الصنف</td><td style="padding:8px;">رصيد السيستم</td>
          <td style="padding:8px;">العدد الفعلي</td><td style="padding:8px;">الفرق</td><td></td>
        </tr>
        ${rv.map(r => `<tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px;">${esc(r.name)}</td>
          <td style="padding:8px; text-align:center;">${r.missingItem ? '—' : r.systemAtCount}</td>
          <td style="padding:8px; text-align:center;">${r.counted}</td>
          <td style="padding:8px; text-align:center; font-weight:800; color:${(r.diff||0)<0?'#E5484D':((r.diff||0)>0?'#2E7D32':'#888')};">
            ${(r.diff||0)===0 ? 'مظبوط' : ((r.diff||0)<0 ? 'عجز ' + Math.abs(r.diff) : 'زيادة ' + r.diff)}</td>
          <td style="padding:8px;"><button class="secondary" onclick="scRecount('${esc(r.itemId)}')">إعادة عد</button></td>
        </tr>`).join('')}
      </table>
      ${canApproveCount()
        ? `<button onclick="scApprove()" style="padding:14px; font-weight:800;">✅ اعتماد الجرد وتسوية الرصيد</button>`
        : `<div style="background:#FDECEA; border:1px solid #E5484D; border-radius:10px; padding:12px;">
             الاعتماد للمالك أو المدير. سيبي الشاشة مفتوحة أو نادي المسؤول.</div>`}
      <button class="secondary" onclick="scCancel()">إلغاء الجرد</button>
    </div>`;
}

/* ---------------- ربط الشاشة ---------------- */
async function scStart(){
  try{
    const scope = (document.getElementById('scScope') || {}).value || 'full';
    const sectionName = (document.getElementById('scSection') || {}).value || '';
    await countStart({ scope, sectionName });
    showToast('▶️ الجرد اتفتح — ابدأ المسح');
  }catch(e){ showToast(e.message, 'err'); }
  renderStockCount();
}
async function scScan(code){
  const el = document.getElementById('scScan'); if(el) el.value = '';
  try{
    const c = String(code || '').trim(); if(!c) return;
    // نفس طريقة شاشة التحويلات في اللقط: باركود أو كود الصنف
    const item = (allInventory || []).find(p => (p.barcode || '') === c || (p.code || '') === c);
    if(!item) return showToast('الباركود ده مش في الأصناف', 'err');
    const l = await countAdd(item, 1);
    showToast('✔️ ' + (item.name || '') + ' → ' + l.counted);
  }catch(e){ showToast(e.message, 'err'); }
  renderStockCount();
}
async function scSet(itemId){
  try{
    const cur = _countLines[itemId];
    const v = await askText({ title: 'العدد الفعلي لـ' + ((cur && cur.name) || ''),
                              value: String((cur && cur.counted) || 0), type: 'number' });
    if(v == null || v === '') return;
    await countAdd({ id: itemId, name: cur && cur.name, barcode: cur && cur.barcode }, Number(v), { replace: true });
  }catch(e){ showToast(e.message, 'err'); }
  renderStockCount();
}
async function scFinish(){
  try{ await countReview(); showToast('📋 تقرير الفرق جاهز'); }
  catch(e){ showToast(e.message, 'err'); }
  renderStockCount();
}
async function scRecount(itemId){
  try{ await countRecount(itemId); showToast('↩️ الصنف رجع للعد'); }
  catch(e){ showToast(e.message, 'err'); }
  renderStockCount();
}
async function scApprove(){
  try{
    const why = await askText({ title: 'سبب التسوية', placeholder: 'مثال: جرد آخر الشهر', value: '' });
    const r = await countApprove(why || '');
    showToast('✅ الجرد اتعتمد — ' + r.adjusted + ' صنف اتسوّى');
    if(typeof loadInventory === 'function') loadInventory();
  }catch(e){ showToast(e.message, 'err'); }
  renderStockCount();
}
async function scCancel(){
  try{ await countCancel(); showToast('الجرد اتلغى'); }
  catch(e){ showToast(e.message, 'err'); }
  renderStockCount();
}

/* القاعدة الذهبية: const/function جوّه <script> مبيوصلوش لـwindow لوحدهم */
window.STOCK_COUNTS = STOCK_COUNTS;
window.countStart = countStart;
window.countAdd = countAdd;
window.countReview = countReview;
window.countRecount = countRecount;
window.countApprove = countApprove;
window.countCancel = countCancel;
window.countMovementsSince = countMovementsSince;
window.canApproveCount = canApproveCount;
window.goToStockCount = goToStockCount;
window.renderStockCount = renderStockCount;
window.scStart = scStart; window.scScan = scScan; window.scSet = scSet;
window.scFinish = scFinish; window.scRecount = scRecount;
window.scApprove = scApprove; window.scCancel = scCancel;
