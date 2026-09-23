// ============================================================
// 🏬 warehouse.js — دورة المخزون · مرحلة ٢
// ------------------------------------------------------------
// • شاشة المخزن: رصيد المخزن · اللي في الطريق · سجل حركة أي صنف
// • كشف إذن الشحنة المطبوع (باركود الإذن + الأصناف + التوقيعات)
// • فتح الشحنة في الفرع بمسح باركود الإذن + عدّ القطع بالمسح
// • شاشة الفروق المفتوحة: حسم كل صنف ناقص (اتلقت / رجعت / عجز)
//
// 🔒 كل حركة مخزون هنا بتعدّي من `stockApply` (stock-move.js) — مفيش
//    كتابة مباشرة على الكميات. وحسم الفرق **بيتثبّت على الإذن الأول**
//    (diffResolving) وبعدين يتحرك المخزون: لو النت قطع في النص، إعادة
//    الحسم بتكمّل بنفس القرار — مبتعملش حركة تانية ولا قرار مختلف.
//
// الملف ده طبقة فوق: مبيلمسش البيع ولا الفلوس.
// ============================================================

const WH_DIFF_DECISIONS = {
  found: '✅ اتلقت — تدخل الفرع المستلم',
  back:  '↩️ رجعت للفرع المرسل',
  lost:  '❌ عجز — يتشطب'
};
const WH_CARD_RE = /^EC[A-Z2-9]{10}$/i;   // كارت موظفة — ليه معالجه في transfers.js

let _whTab = 'stock';        // stock | diffs | history
let _whDiffs = [];
let _whHistItem = null;

function isWarehouseDevice(){
  return typeof currentBranch !== 'undefined' && currentBranch === WAREHOUSE;
}
function _whEsc(s){
  return (typeof esc === 'function') ? esc(s)
    : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function _whNs(x){
  return (typeof window !== 'undefined' && typeof window.normalizeScan === 'function') ? window.normalizeScan(x) : x;
}
function _whFmt(ts){
  try{ return new Date(ts).toLocaleString('ar-EG', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); }
  catch(e){ return ''; }
}

/* ============================================================
   🧮 منطق خام (متختبر من غير شاشة)
   ============================================================ */

/* 📦 عدّ قطعة بالمسح جوّه نافذة الاستلام.
   items = أصناف الإذن · counts = العدد الحالي لكل سطر (بيتعدّل في مكانه)
   بيرجّع { ok, idx } أو { ok:false, reason: 'notInPermit' | 'over' | 'unknown', name } */
function trCountScan(items, counts, code, inventory){
  code = String(code || '').trim();
  if(!code) return { ok: false, reason: 'unknown' };
  const inv = (inventory || []).find(p => (p.barcode || '') === code || (p.code || '') === code);
  const idx = (items || []).findIndex(i =>
    (inv && i.id === inv.id) || (i.barcode && i.barcode === code) || (i.code && i.code === code));
  if(idx < 0) return { ok: false, reason: inv ? 'notInPermit' : 'unknown', name: inv ? (inv.name || '') : code };
  const sent = Number(items[idx].qty) || 0;
  if((Number(counts[idx]) || 0) >= sent) return { ok: false, reason: 'over', idx, name: items[idx].name || '' };
  counts[idx] = (Number(counts[idx]) || 0) + 1;
  return { ok: true, idx, name: items[idx].name || '' };
}

/* ⚖️ خطة حسم فرق تحويلة → سطور `stockApply`.
   الناقص اتسجل في «في الطريق» (للإذن الجديد اللي فيه `code`)، فالحسم بيطلّعه من هناك:
   اتلقت → الفرع المستلم · رجعت → الفرع المرسل · عجز → بره المخزون (يتشطب).
   تحويلة قديمة (قبل مرحلة ١) الناقص عمره ما دخل «في الطريق» — اتخصم من المرسل على طول —
   فالحسم بيضيف من بره بس، والعجز مالوش حركة (هو أصلًا مش محسوب في أي مكان). */
function whPlanResolution(t, decisions){
  const transit = !!(t && t.code);
  const out = [];
  ((t && t.openDiff) || []).forEach((d, i) => {
    const q = Number(d.missing) || 0;
    if(!(q > 0)) return;
    const dec = (decisions || [])[i];
    if(!WH_DIFF_DECISIONS[dec]) throw new Error('اختار قرار لـ«' + (d.name || d.itemId) + '»');
    const from = transit ? IN_TRANSIT : null;
    const to = dec === 'found' ? t.toBranch : (dec === 'back' ? t.fromBranch : null);
    if(!from && !to) return;
    out.push({ itemId: d.itemId, name: d.name || '', barcode: d.barcode || '', qty: q, from, to });
  });
  return out;
}

/* ⚖️ حسم فرق تحويلة — للمالك أو المدير بس (نفس صلاحية اعتماد الجرد). */
async function whResolveDiff(id, decisions, note){
  if(typeof canApproveCount === 'function' && !canApproveCount())
    throw new Error('حسم الفروق للمالك أو المدير بس');
  const ref = db.collection(TRANSFERS_COL).doc(id);
  const who = (typeof currentEmployee !== 'undefined' && currentEmployee) || {};
  // 1) القرار بيتثبّت على الإذن الأول — مرة واحدة
  const plan = await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if(!s.exists) throw new Error('الإذن مش موجود');
    const t = s.data() || {};
    if(t.openDiffStatus !== 'open') throw new Error('الفرق ده اتحسم خلاص');
    if(t.diffResolving) return Object.assign({ resumed: true }, t.diffResolving);
    const dec = ((t.openDiff) || []).map((d, i) => (decisions || [])[i]);
    if(dec.includes('lost') && !String(note || '').trim())
      throw new Error('فيه عجز — اكتب السبب');
    const lines = whPlanResolution(t, dec);
    const r = { decisions: dec, lines, note: String(note || '').trim(),
                byId: who.id || '', byName: who.name || '', at: Date.now(),
                owner: t.openDiffOwner || t.carrierName || '' };
    tx.update(ref, { diffResolving: r });
    return r;
  });
  // 2) حركة المخزون — معرّفها من الإذن، فالتكرار مبيحرّكش تاني
  if(plan.lines && plan.lines.length){
    await stockApply({
      docType: 'transfer', docId: id, phase: 'resolve',
      reason: 'حسم فرق تحويلة ' + id + (plan.owner ? (' — عهدة ' + plan.owner) : ''),
      note: plan.note || '', lines: plan.lines
    });
  }
  // 3) قفل الفرق
  const done = Object.assign({}, plan); delete done.resumed;
  await ref.update({ openDiffStatus: 'resolved', diffResolution: done, diffResolvedAt: Date.now() });
  return plan;
}

/* ============================================================
   📇 فتح الشحنة بمسح باركود الإذن (في الفرع المستلم)
   ============================================================ */
async function trOpenByCode(raw){
  const code = _whNs(String(raw || '').trim());
  if(!code) return false;
  if(WH_CARD_RE.test(code)) return false;
  const list = (typeof _trList !== 'undefined' && Array.isArray(_trList)) ? _trList : [];
  let t = list.find(x => x.id === code || x.code === code)
       || list.find(x => String(x.id).toUpperCase() === code.toUpperCase());
  if(!t){
    try{
      let s = await db.collection(TRANSFERS_COL).doc(code).get();
      if(!s.exists && code !== code.toUpperCase()) s = await db.collection(TRANSFERS_COL).doc(code.toUpperCase()).get();
      if(s.exists) t = Object.assign({ id: s.id }, s.data());
    }catch(e){ showToast('محتاج نت عشان يفتح الإذن', 'err'); return false; }
  }
  if(!t){ showToast('مفيش إذن بالرقم ده: ' + code, 'err'); return false; }
  if(t.toBranch !== currentBranch){ showToast('⛔ الإذن ده رايح ' + t.toBranch + ' — مش هنا', 'err'); return false; }
  if(t.status === 'confirmed'){ showToast('الإذن ده اتستلم خلاص' + (t.confirmedBy ? (' — ' + t.confirmedBy) : ''), 'err'); return false; }
  if(t.status !== 'in_transit'){ showToast('الإذن لسه ماخرجش من ' + (t.fromBranch || 'المرسل'), 'err'); return false; }
  if(!list.some(x => x.id === t.id)) list.push(t);
  openTransferConfirm(t.id);
  return true;
}

/* 🔎 مسح قطعة جوّه نافذة الاستلام: أول مسحة بتحوّل النافذة لـ«العد بالمسح»
   (كل الخانات تبدأ من صفر) — عشان محدش يأكد الرقم المكتوب من غير ما يعدّ. */
function _trCfScan(raw){
  const inp = document.getElementById('trCfScan'); if(inp) inp.value = '';
  const ov = document.getElementById('trConfirmOv'); if(!ov) return;
  const code = _whNs(String(raw || '').trim());
  if(!code || WH_CARD_RE.test(code)) return;
  const list = (typeof _trList !== 'undefined' && Array.isArray(_trList)) ? _trList : [];
  const t = list.find(x => x.id === ov.dataset.tid); if(!t) return;
  const items = t.items || [];
  if(ov.dataset.scanMode !== '1'){
    ov.dataset.scanMode = '1';
    items.forEach((_, i) => { const el = document.getElementById('trCf_' + i); if(el) el.value = 0; });
    const b = document.getElementById('trCfScanMode'); if(b) b.style.display = 'block';
  }
  const counts = items.map((_, i) => parseInt((document.getElementById('trCf_' + i) || {}).value, 10) || 0);
  const r = trCountScan(items, counts, code, (typeof allInventory !== 'undefined') ? allInventory : []);
  if(r.ok){
    const el = document.getElementById('trCf_' + r.idx);
    if(el){ el.value = counts[r.idx]; el.style.background = 'rgba(34,197,94,.25)'; setTimeout(() => { el.style.background = ''; }, 400); }
    showToast('✔️ ' + r.name + ' → ' + counts[r.idx] + ' من ' + items[r.idx].qty);
  }else if(r.reason === 'over'){
    showToast('⚠️ «' + r.name + '» اتعدّ كله خلاص — القطعة دي زيادة عن الإذن', 'err');
    _trCfAddExtra(ov, code, r.name);
  }else{
    showToast('⚠️ «' + r.name + '» مش في الإذن ده — حطها على جنب', 'err');
    _trCfAddExtra(ov, code, r.name);
  }
  if(inp) inp.focus();
}
function _trCfAddExtra(ov, code, name){
  ov._extras = ov._extras || [];
  const ex = ov._extras.find(x => x.code === code);
  if(ex) ex.qty++; else ov._extras.push({ code, name: name || code, qty: 1 });
  const box = document.getElementById('trCfExtras');
  if(box){
    box.style.display = 'block';
    box.innerHTML = '<b>🚩 قطع زيادة مش في الإذن (هتتسجل على الإذن — مش هتدخل الرصيد):</b><br>'
      + ov._extras.map(x => _whEsc(x.name) + ' ×' + x.qty).join(' · ');
  }
}

/* ============================================================
   🖨️ كشف إذن الشحنة المطبوع
   ============================================================ */
function _whBarcodeSvg(code){
  try{
    if(typeof JsBarcode === 'undefined' || !document.createElementNS) return '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, String(code), { format: 'CODE128', width: 2, height: 60, margin: 4,
      displayValue: true, fontSize: 16, background: '#ffffff', lineColor: '#000000' });
    return svg.outerHTML;
  }catch(e){ return ''; }
}
function trManifestHTML(t, barcodeSvg){
  const items = t.items || [];
  const pieces = items.reduce((n, i) => n + (Number(i.qty) || 0), 0);
  const got = t.status === 'confirmed';
  const code = t.code || t.id;
  return '<html dir="rtl"><head><meta charset="UTF-8"><title>إذن ' + _whEsc(code) + '</title><style>'
    + '@page{size:A4; margin:12mm;} body{font-family:Cairo,Tahoma,Arial,sans-serif; color:#000; margin:0; font-size:13px;}'
    + 'h1{font-size:20px; margin:0 0 4px;} .top{display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #000; padding-bottom:8px;}'
    + '.meta{line-height:1.9;} table{width:100%; border-collapse:collapse; margin-top:12px;} th,td{border:1px solid #000; padding:6px 8px; text-align:right;}'
    + 'th{background:#eee;} td.n{text-align:center; font-weight:700;} .bc{direction:ltr; font-family:monospace;}'
    + '.sig{display:flex; gap:14px; margin-top:34px;} .sig div{flex:1; border-top:1px solid #000; padding-top:6px; text-align:center;}'
    + '</style></head><body>'
    + '<div class="top"><div class="meta"><h1>📦 إذن شحنة / تحويل</h1>'
    + '<div>رقم الإذن: <b class="bc">' + _whEsc(code) + '</b></div>'
    + '<div>من: <b>' + _whEsc(t.fromBranch) + '</b> &nbsp;←&nbsp; إلى: <b>' + _whEsc(t.toBranch) + '</b></div>'
    + '<div>الحاملة: <b>' + _whEsc(t.carrierName || '—') + '</b> · أرسلها: ' + _whEsc(t.senderName || '—') + '</div>'
    + '<div>التاريخ: ' + _whEsc(_whFmt(t.sentAt || t.ts)) + '</div>'
    + (got ? '<div>استلمها: <b>' + _whEsc(t.confirmedBy || '—') + '</b> · ' + _whEsc(_whFmt(t.confirmedAt)) + '</div>' : '')
    + '</div><div>' + (barcodeSvg || ('<div class="bc" style="font-size:18px; border:1px dashed #000; padding:10px;">' + _whEsc(code) + '</div>')) + '</div></div>'
    + '<table><tr><th>#</th><th>الصنف</th><th>الباركود</th><th>المُرسل</th>' + (got ? '<th>المُستلم</th>' : '<th>العدد عند الاستلام</th>') + '</tr>'
    + items.map((i, n) => '<tr><td class="n">' + (n + 1) + '</td><td>' + _whEsc(i.name) + '</td><td class="bc">' + _whEsc(i.barcode || '') + '</td>'
      + '<td class="n">' + (Number(i.qty) || 0) + '</td><td class="n">' + (got ? (Number(i.confirmedQty) || 0) : '') + '</td></tr>').join('')
    + '<tr><th colspan="3">الإجمالي: ' + items.length + ' صنف</th><th style="text-align:center;">' + pieces + '</th><th></th></tr></table>'
    + (t.note ? '<div style="margin-top:10px;">📝 ' + _whEsc(t.note) + '</div>' : '')
    + '<div class="sig"><div>المرسل</div><div>الحاملة</div><div>المستلم</div></div>'
    + '</body></html>';
}
async function trPrintManifest(id){
  const list = (typeof _trList !== 'undefined' && Array.isArray(_trList)) ? _trList : [];
  let t = list.find(x => x.id === id);
  if(!t){
    try{ const s = await db.collection(TRANSFERS_COL).doc(id).get(); if(s.exists) t = Object.assign({ id: s.id }, s.data()); }
    catch(e){}
  }
  if(!t){ showToast('الإذن مش موجود', 'err'); return; }
  const w = window.open('', '_blank', 'width=760,height=940');
  if(!w){ showToast('نافذة الطباعة اتمنعت', 'err'); return; }
  w.document.write(trManifestHTML(t, _whBarcodeSvg(t.code || t.id)));
  w.document.close();
  if(typeof reclaimWindowFocus === 'function') reclaimWindowFocus(1100);
  setTimeout(() => { try{ w.print(); setTimeout(() => w.close(), 600); }catch(e){} }, 450);
}

/* ============================================================
   🏬 شاشة المخزن
   ============================================================ */
function goToWarehouse(tab){
  if(tab) _whTab = tab;
  showScreen('warehouseScreen');
  renderWarehouse();
}

async function _whLoadDiffs(){
  try{
    const snap = await db.collection(TRANSFERS_COL).where('openDiffStatus', '==', 'open').get();
    _whDiffs = snap.docs.map(d => Object.assign({ id: d.id }, d.data()))
      .sort((a, b) => (b.confirmedAt || 0) - (a.confirmedAt || 0));
  }catch(e){ _whDiffs = null; }
}

async function renderWarehouse(){
  const w = document.getElementById('warehouseWrap'); if(!w) return;
  const tabs = [['stock', '📦 رصيد المخزن'], ['diffs', '⚠️ الفروق المفتوحة'], ['history', '📜 حركة صنف']];
  const bar = '<div style="display:flex; gap:5px; background:var(--panel2); border-radius:12px; padding:5px; margin:12px 0;">'
    + tabs.map(([id, l]) => '<button onclick="_whTab=\'' + id + '\'; renderWarehouse();" style="flex:1; padding:10px 4px; border-radius:9px; border:none; cursor:pointer; font-weight:800; font-size:12.5px; '
      + (_whTab === id ? 'background:var(--panel); color:var(--text); box-shadow:0 2px 6px rgba(0,0,0,.25);' : 'background:none; color:var(--muted);') + '">' + l + '</button>').join('')
    + '</div>';
  const head = isWarehouseDevice()
    ? '<div style="background:var(--panel2); border:1.5px solid var(--accent); border-radius:12px; padding:10px 13px; font-size:13px;">'
      + '🏬 الجهاز ده <b>جهاز المخزن</b> — مبيبعش. الشحنات بتخرج من «🚚 شحنة جديدة».'
      + ' <button onclick="_trTab=\'new\'; goToTransfers();" style="float:left; padding:6px 12px; border-radius:8px; border:none; background:var(--accent); color:#fff; font-weight:800; cursor:pointer;">🚚 شحنة جديدة</button></div>'
    : '';

  if(_whTab === 'diffs'){
    w.innerHTML = head + bar + '<div style="padding:24px; text-align:center; color:var(--muted);">بيتحمّل...</div>';
    await _whLoadDiffs();
    w.innerHTML = head + bar + _whDiffsHTML();
    return;
  }
  if(_whTab === 'history'){
    w.innerHTML = head + bar + _whHistoryShellHTML();
    const inp = document.getElementById('whHistInput');
    if(inp){
      inp.addEventListener('keydown', (e) => { if(e.key === 'Enter'){ e.preventDefault(); _whHistPick(inp.value); } });
      inp.focus();
    }
    if(_whHistItem) _whHistLoad(_whHistItem);
    return;
  }
  w.innerHTML = head + bar + _whStockHTML('');
  const q = document.getElementById('whStockQ');
  if(q){ q.addEventListener('input', () => { const box = document.getElementById('whStockRows'); if(box) box.innerHTML = _whStockRows(q.value); }); q.focus(); }
}

function _whStockRows(q){
  q = String(q || '').trim().toLowerCase();
  const inv = (typeof allInventory !== 'undefined' && Array.isArray(allInventory)) ? allInventory : [];
  const rows = inv.filter(p => {
    const m = p.qtyByBranch || {};
    const has = (Number(m[WAREHOUSE]) || 0) !== 0 || (Number(m[IN_TRANSIT]) || 0) !== 0;
    if(!q) return has;
    return (p.name || '').toLowerCase().includes(q) || (p.barcode || '').includes(q) || (p.code || '').includes(q);
  }).slice(0, 300);
  if(!rows.length) return '<div class="empty-cart">' + (q ? 'مفيش صنف بالاسم ده' : 'مفيش رصيد في المخزن لسه') + '</div>';
  return '<table style="width:100%; border-collapse:collapse; font-size:13.5px;">'
    + '<tr style="font-weight:800; color:var(--muted);"><td style="padding:7px;">الصنف</td><td style="padding:7px; text-align:center;">🏬 المخزن</td><td style="padding:7px; text-align:center;">🚚 في الطريق</td><td></td></tr>'
    + rows.map(p => {
      const m = p.qtyByBranch || {};
      const wq = Number(m[WAREHOUSE]) || 0, tq = Number(m[IN_TRANSIT]) || 0;
      return '<tr style="border-top:1px solid var(--border);"><td style="padding:7px;">' + _whEsc(p.name)
        + '<div style="font-size:10.5px; color:var(--muted); direction:ltr; text-align:right; font-family:monospace;">' + _whEsc(p.barcode || p.code || '') + '</div></td>'
        + '<td style="padding:7px; text-align:center; font-weight:900; color:' + (wq < 0 ? 'var(--bad)' : 'var(--text)') + ';">' + wq + '</td>'
        + '<td style="padding:7px; text-align:center; font-weight:800; color:var(--warn);">' + (tq || '—') + '</td>'
        + '<td style="padding:7px; text-align:left;"><button class="secondary" onclick="_whHistItem=\'' + _whEsc(p.id) + '\'; _whTab=\'history\'; renderWarehouse();">📜</button></td></tr>';
    }).join('') + '</table>';
}
function _whStockHTML(q){
  return '<input id="whStockQ" placeholder="🔎 دوّر باسم أو باركود..." autocomplete="off"'
    + ' style="width:100%; padding:12px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-size:14px; margin-bottom:10px;">'
    + '<div id="whStockRows">' + _whStockRows(q) + '</div>';
}

/* ---------- ⚠️ الفروق المفتوحة ---------- */
function _whDiffsHTML(){
  if(_whDiffs === null) return '<div class="empty-cart">تعذّر تحميل الفروق — اتأكد من النت</div>';
  if(!_whDiffs.length) return '<div class="empty-cart">✅ مفيش فروق مفتوحة</div>';
  const can = (typeof canApproveCount === 'function') ? canApproveCount() : false;
  return (can ? '' : '<div style="background:var(--panel2); border:1px solid var(--warn); border-radius:10px; padding:10px; margin-bottom:10px; font-size:12.5px;">حسم الفروق للمالك أو المدير — تقدر تشوفها بس.</div>')
    + _whDiffs.map(t => {
      const lines = (t.openDiff || []).map((d, i) =>
        '<div style="display:flex; align-items:center; gap:8px; padding:7px 0; border-top:1px solid var(--border); flex-wrap:wrap;">'
        + '<div style="flex:1; min-width:150px; font-size:13px; font-weight:700;">' + _whEsc(d.name)
        + ' <span style="color:var(--bad); font-weight:900;">ناقص ' + (Number(d.missing) || 0) + '</span>'
        + ' <span style="color:var(--muted); font-weight:400; font-size:11px;">(اتبعت ' + d.sent + ' · وصل ' + d.got + ')</span></div>'
        + (can ? '<select id="whDec_' + _whEsc(t.id) + '_' + i + '" style="padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-weight:700;">'
          + '<option value="">— القرار —</option>'
          + Object.keys(WH_DIFF_DECISIONS).map(k => '<option value="' + k + '">' + WH_DIFF_DECISIONS[k] + '</option>').join('')
          + '</select>' : '')
        + '</div>').join('');
      return '<div style="background:var(--panel); border:1.5px solid var(--bad); border-radius:12px; padding:11px 13px; margin-bottom:10px;">'
        + '<div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px;">'
        + '<div style="font-weight:800;">' + _whEsc(t.fromBranch) + ' ← ' + _whEsc(t.toBranch)
        + ' <span style="color:var(--muted); font-weight:400; font-size:11px; direction:ltr;">' + _whEsc(t.code || t.id) + '</span></div>'
        + '<div style="font-size:11.5px; color:var(--bad); font-weight:800;">🧕 على عهدة ' + _whEsc(t.openDiffOwner || t.carrierName || '—') + '</div></div>'
        + '<div style="color:var(--muted); font-size:11px; margin-top:3px;">استلمها: ' + _whEsc(t.confirmedBy || '—') + ' · ' + _whEsc(_whFmt(t.confirmedAt))
        + (t.openDiffReason ? ' · 📝 ' + _whEsc(t.openDiffReason) : '')
        + (t.diffResolving ? ' · <b style="color:var(--warn);">⏳ حسم بدأ ولسه ماكملش — دوس «حسم» تاني يكمّله</b>' : '') + '</div>'
        + lines
        + (can ? '<input id="whNote_' + _whEsc(t.id) + '" placeholder="السبب / ملاحظة (إجباري لو فيه عجز)" style="width:100%; margin-top:8px; padding:9px; border-radius:9px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-size:12.5px;">'
          + '<div style="display:flex; gap:8px; margin-top:8px;">'
          + '<button onclick="whResolveUI(\'' + _whEsc(t.id) + '\')" style="flex:2; padding:11px; border-radius:10px; border:none; background:var(--accent); color:#fff; font-weight:800; cursor:pointer;">⚖️ حسم الفرق</button>'
          + '<button class="secondary" onclick="trPrintManifest(\'' + _whEsc(t.id) + '\')" style="flex:1;">🖨️ الكشف</button></div>'
          : '')
        + '</div>';
    }).join('');
}
async function whResolveUI(id){
  const t = (_whDiffs || []).find(x => x.id === id); if(!t) return;
  if(whResolveUI._busy === id) return;
  const decisions = (t.openDiff || []).map((_, i) => (document.getElementById('whDec_' + id + '_' + i) || {}).value || '');
  const note = ((document.getElementById('whNote_' + id) || {}).value || '').trim();
  if(!t.diffResolving && decisions.some(d => !d)){ showToast('اختار قرار لكل صنف', 'err'); return; }
  if(typeof askConfirm === 'function'){
    const ok = await askConfirm({ title: '⚖️ حسم فرق الإذن', icon: '⚖️', waitSec: 1, okText: 'حسم',
      message: t.diffResolving ? 'فيه حسم بدأ قبل كده — هيتكمّل بنفس القرار اللي اتسجل.'
        : (t.openDiff || []).map((d, i) => d.name + ' ×' + d.missing + ' ← ' + WH_DIFF_DECISIONS[decisions[i]]).join('\n') });
    if(!ok) return;
  }
  whResolveUI._busy = id;
  try{
    const r = await whResolveDiff(id, decisions, note);
    showToast(r.resumed ? '✅ اتكمّل الحسم بالقرار المسجّل' : '✅ الفرق اتحسم والمخزون اتظبط');
    if(typeof loadInventory === 'function') loadInventory();
  }catch(e){ showToast(e.message, 'err'); }
  finally{ whResolveUI._busy = null; }
  renderWarehouse();
}

/* ---------- 📜 سجل حركة صنف ---------- */
const WH_DOC_LABELS = { transfer: '🚚 تحويل', count: '🧮 جرد', doc: '📄 مستند' };
const WH_PHASE_LABELS = { out: 'خروج', 'in': 'استلام', resolve: 'حسم فرق', main: '' };
function _whHistoryShellHTML(){
  return '<input id="whHistInput" placeholder="امسح الصنف أو اكتب الباركود واضغط Enter" autocomplete="off"'
    + ' style="width:100%; padding:12px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-size:14px;">'
    + '<div style="color:var(--muted); font-size:11px; margin:6px 2px 10px;">السجل بيبدأ من يوم تشغيل دورة المخزون — البيع والاستلام من الموردين لسه مش بيتسجلوا هنا.</div>'
    + '<div id="whHistBox"></div>';
}
function _whHistPick(raw){
  const code = _whNs(String(raw || '').trim());
  const inp = document.getElementById('whHistInput'); if(inp) inp.value = '';
  if(!code) return;
  const inv = (typeof allInventory !== 'undefined' && Array.isArray(allInventory)) ? allInventory : [];
  const p = inv.find(x => (x.barcode || '') === code || (x.code || '') === code)
         || inv.find(x => (x.name || '').toLowerCase().includes(code.toLowerCase()));
  if(!p){ showToast('مفيش صنف بالكود ده', 'err'); return; }
  _whHistItem = p.id;
  _whHistLoad(p.id);
}
async function _whHistLoad(itemId){
  const box = document.getElementById('whHistBox'); if(!box) return;
  const inv = (typeof allInventory !== 'undefined' && Array.isArray(allInventory)) ? allInventory : [];
  const p = inv.find(x => x.id === itemId) || { name: itemId };
  box.innerHTML = '<div style="color:var(--muted); padding:14px;">بيتحمّل...</div>';
  let rows = [];
  try{ rows = await stockHistory(itemId, 100); }
  catch(e){ box.innerHTML = '<div class="empty-cart">تعذّر تحميل السجل — اتأكد من النت</div>'; return; }
  const m = p.qtyByBranch || {};
  const now = Object.keys(m).filter(k => Number(m[k])).map(k => _whEsc(k) + ': <b>' + m[k] + '</b>').join(' · ');
  box.innerHTML = '<div style="font-weight:800; font-size:14px; margin-bottom:4px;">' + _whEsc(p.name) + '</div>'
    + '<div style="color:var(--muted); font-size:12px; margin-bottom:10px;">الرصيد دلوقتي — ' + (now || 'صفر في كل الأماكن') + '</div>'
    + (rows.length ? rows.map(r => {
        const ls = (r.lines || []).filter(l => l.itemId === itemId);
        return ls.map(l => '<div style="border:1px solid var(--border); border-radius:10px; padding:8px 11px; margin-bottom:6px; font-size:12.5px;">'
          + '<div style="display:flex; justify-content:space-between; gap:8px;"><b>' + (WH_DOC_LABELS[r.docType] || _whEsc(r.docType)) + ' ' + (WH_PHASE_LABELS[r.phase] || '') + '</b>'
          + '<span style="color:var(--muted); font-size:11px;">' + _whEsc(_whFmt(r.at)) + '</span></div>'
          + '<div>' + _whEsc(l.from || 'من بره') + ' ← ' + _whEsc(l.to || 'بره المخزون') + ' · <b>' + l.qty + '</b> قطعة</div>'
          + '<div style="color:var(--muted); font-size:11px;">' + _whEsc(r.reason || '') + (r.note ? ' · 📝 ' + _whEsc(r.note) : '')
          + ' · ' + _whEsc(r.byName || '—') + ' · <span style="direction:ltr;">' + _whEsc(r.docId) + '</span></div></div>').join('');
      }).join('') : '<div class="empty-cart">مفيش حركات مسجلة للصنف ده</div>');
}

/* ============================================================
   🔌 ربط
   ============================================================ */
/* 🏬 جهاز المخزن مبيبعش: البيع كان هيخصم من «المخزن» كأنه فرع. */
(function(){
  if(typeof window === 'undefined') return;
  ['resumeOrStartSale', 'goToSale'].forEach(n => {
    const orig = window[n];
    if(typeof orig !== 'function' || orig._whGuard) return;
    const g = function(){
      if(isWarehouseDevice()){ showToast('🏬 جهاز المخزن مبيبعش — دي شاشة المخزن', 'err'); goToWarehouse(); return; }
      return orig.apply(this, arguments);
    };
    g._whGuard = true;
    window[n] = g;
  });
  /* «المخزن» اختيار ثابت في إعداد الجهاز — من غير كتابة يدوي (غلطة حرف = مكان جديد) */
  const origSetup = window.loadBranchSetupOptions;
  if(typeof origSetup === 'function' && !origSetup._whGuard){
    const g = async function(){
      const r = await origSetup.apply(this, arguments);
      const sel = document.getElementById('branchSetupSelect');
      if(sel && ![...sel.options].some(o => o.value === WAREHOUSE)){
        const o = document.createElement('option');
        o.value = WAREHOUSE; o.textContent = '🏬 ' + WAREHOUSE + ' (جهاز المخزن)';
        const nw = [...sel.options].find(x => x.value === '__new__');
        sel.insertBefore(o, nw || null);
        if((localStorage.getItem('pos_branch') || '') === WAREHOUSE) sel.value = WAREHOUSE;
      }
      return r;
    };
    g._whGuard = true;
    window.loadBranchSetupOptions = g;
  }
})();

/* القاعدة الذهبية */
window.WH_DIFF_DECISIONS = WH_DIFF_DECISIONS;
window.isWarehouseDevice = isWarehouseDevice;
window.trCountScan = trCountScan;
window.whPlanResolution = whPlanResolution;
window.whResolveDiff = whResolveDiff;
window.whResolveUI = whResolveUI;
window.trOpenByCode = trOpenByCode;
window._trCfScan = _trCfScan;
window.trManifestHTML = trManifestHTML;
window.trPrintManifest = trPrintManifest;
window.goToWarehouse = goToWarehouse;
window.renderWarehouse = renderWarehouse;
window._whHistPick = _whHistPick;
