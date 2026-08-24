// ============================================================
// import.js — استيراد بيانات من QuickBooks (أو أي مصدر CSV)
// بما إن شكل ملف التصدير مش معروف مقدمًا، الأداة دي بتوري أعمدة
// الملف اللي اترفع وتخلي الأدمن نفسه يحدد كل عمود بيمثل إيه —
// بدل ما نخمّن شكل QuickBooks بالظبط.
// بيعتمد على العام من app.js: db, showToast, hasPerm, currentBranch
// ============================================================

const TEST_LEGACY_SALES = "pos_test_legacy_sales"; // مبيعات قديمة للرجوع بس، منفصلة عن مبيعات النظام الجديد

let importTab = 'inventory';
let importParsedRows = []; // [{col1: val, col2: val, ...}, ...]
let importHeaders = [];

const IMPORT_TARGETS = {
  inventory: [
    { key:'name', label:'اسم الصنف', required:true },
    { key:'barcode', label:'الباركود/SKU', required:false },
    { key:'price', label:'سعر البيع', required:true },
    { key:'cost', label:'سعر التكلفة', required:false },
    { key:'quantity', label:'الكمية', required:false },
    { key:'supplier', label:'المورّد', required:false },
    { key:'minStock', label:'الحد الأدنى', required:false },
    { key:'department', label:'القسم', required:false },
  ],
  customers: [
    { key:'name', label:'اسم العميل', required:false },
    { key:'phone', label:'رقم التليفون', required:true },
    { key:'points', label:'نقاط ولاء سابقة', required:false },
  ],
  sales: [
    { key:'date', label:'التاريخ', required:false },
    { key:'invoiceNo', label:'رقم الفاتورة', required:false },
    { key:'customerName', label:'اسم العميل', required:false },
    { key:'itemName', label:'اسم الصنف', required:false },
    { key:'qty', label:'الكمية', required:false },
    { key:'total', label:'الإجمالي', required:true },
  ],
};

function switchImportTab(tab){
  importTab = tab;
  document.querySelectorAll('#importScreen .rep-range-btn').forEach(b=> b.classList.toggle('active', b.dataset.tab === tab));
  importParsedRows = []; importHeaders = [];
  renderImportPanel();
}

function goToImport(){
  if(!hasPerm('canEditInventory') && !hasPerm('canChangePrices')){ showToast('الصلاحية دي للمدير بس', 'err'); return; }
  showScreen('importScreen');
  renderImportPanel();
}

function renderImportPanel(){
  const wrap = document.getElementById('importPanelWrap');
  wrap.innerHTML = `
    <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:14px; margin-bottom:12px;">
      <p style="color:var(--muted); font-size:12px; margin:0 0 10px;">
        صدّر الملف من QuickBooks وارفعه هنا مباشرة — بيقبل <b>Excel (.xls / .xlsx)</b> و<b>CSV</b>.
      </p>
      <input type="file" id="importFileInput" accept=".csv,.xls,.xlsx" style="margin-bottom:10px;">
      <div id="adjRow" style="display:none; background:#0f2438; border:1.5px solid #3b82f680;
           border-radius:10px; padding:10px 12px; margin-bottom:10px; color:#dbeafe; font-size:12.5px;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:700;">
          <input type="checkbox" id="adjustSold" style="width:18px; height:18px; cursor:pointer;">
          ⚖️ اظبط الكميات على حركة النظام الجديد
        </label>
        <div style="font-size:11.5px; opacity:.85; margin:4px 0 0 26px;">
          يخصم اللي اتباع · ويضيف اللي اتسجل في «استلام بضاعة» · ويخصم التالف/المرتجع للمورد
        </label>
        <div style="margin-top:8px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="font-size:12px;">من تاريخ ووقت تصدير ملف QuickBooks:</span>
          <input type="datetime-local" id="adjustSince"
            style="padding:6px 8px; border-radius:8px; border:1.5px solid var(--border);
                   background:var(--panel2); color:var(--text); font-size:12px;">
        </div>
        <div style="font-size:11px; color:#93c5fd; margin-top:6px;">
          بيخصم من فرع <b>${'' + (typeof currentBranch !== 'undefined' ? currentBranch : '')}</b> بس ·
          المرتجعات بتترجع للكمية · الفواتير المعكوسة مش محسوبة
        </div>
      </div>
      <label id="wipeRow" style="display:none; align-items:center; gap:8px; background:#3a1416;
             border:1.5px solid #e5484d66; border-radius:10px; padding:10px 12px; margin-bottom:10px;
             cursor:pointer; color:#ffd9da; font-size:12.5px; font-weight:700;">
        <input type="checkbox" id="wipeBeforeImport" style="width:18px; height:18px; cursor:pointer;">
        🗑️ امسح مخزون الفرع ده قبل الاستيراد
        <span style="font-weight:400; color:#ff9a9d;">— فرعك بس، والفروع التانية مش هتتأثر</span>
      </label>
      <div id="importLoadNote" style="color:var(--muted); font-size:12px; margin-bottom:8px;"></div>
      <div id="importPreviewWrap"></div>
    </div>`;
  document.getElementById('importFileInput').addEventListener('change', handleImportFile);
}

// 📊 مكتبة Excel — بتتحمّل عند أول استخدام بس (مش مع كل فتح للتطبيق)
let _xlsxLoading = null;
function ensureXlsxLib(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  if(_xlsxLoading) return _xlsxLoading;
  _xlsxLoading = new Promise((resolve, reject)=>{
    const tryLoad = (src, next)=>{
      const sc = document.createElement('script');
      sc.src = src;
      sc.onload = ()=> window.XLSX ? resolve(window.XLSX) : (next ? next() : reject(new Error('المكتبة اتحمّلت ناقصة')));
      sc.onerror = ()=> next ? next() : reject(new Error('مش قادر أحمّل مكتبة Excel — اتأكد من النت'));
      document.head.appendChild(sc);
    };
    // نسخة محلية الأول (لو اترفعت)، وبعدين CDN كبديل
    tryLoad('xlsx.full.min.js', ()=>
      tryLoad('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', null));
  });
  return _xlsxLoading;
}

function handleImportFile(e){
  const file = e.target.files[0];
  if(!file) return;
  const note = document.getElementById('importLoadNote');
  const isExcel = /\.(xlsx?|xlsm)$/i.test(file.name || '');
  if(isExcel){
    if(note) note.textContent = '⏳ بيحمّل مكتبة Excel…';
    ensureXlsxLib().then((XLSX)=>{
      if(note) note.textContent = '⏳ بيقرا الملف…';
      const reader = new FileReader();
      reader.onload = (ev)=>{
        try{
          parseExcel(XLSX, ev.target.result);
          if(note) note.textContent = '✅ اتقرا ' + importParsedRows.length + ' صف';
          renderImportMapping();
        }catch(err){
          if(note) note.textContent = '';
          showToast('تعذر قراءة الملف: ' + err.message, 'err');
        }
      };
      reader.onerror = ()=>{ if(note) note.textContent=''; showToast('تعذر فتح الملف', 'err'); };
      reader.readAsArrayBuffer(file);
    }).catch((err)=>{
      if(note) note.textContent = '';
      showToast(err.message + ' — أو احفظ الملف كـ CSV UTF-8 وارفعه', 'err');
    });
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev)=>{
    try{
      parseCSV(ev.target.result);
      if(note) note.textContent = '✅ اتقرا ' + importParsedRows.length + ' صف';
      renderImportMapping();
    }catch(err){
      if(note) note.textContent = '';
      showToast('تعذر قراءة الملف: ' + err.message, 'err');
    }
  };
  reader.readAsText(file, 'UTF-8');
}

// بيقرا أول شيت ويحوّله لنفس شكل الـ CSV (أعمدة + صفوف)
function parseExcel(XLSX, buf){
  const wb = XLSX.read(new Uint8Array(buf), { type:'array' });
  const first = wb.SheetNames && wb.SheetNames[0];
  if(!first) throw new Error('الملف مفيهوش شيتات');
  const ws = wb.Sheets[first];
  // header:1 → صفوف خام، عشان نتحكم في أسماء الأعمدة بنفسنا
  const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:'' });
  if(!rows.length) throw new Error('الشيت فاضي');
  // أول صف فيه عناوين = صف العناوين (QuickBooks أحيانًا بيحط سطور فاضية فوق)
  let hIdx = rows.findIndex(r=> r.some(c=> String(c).trim() !== ''));
  if(hIdx < 0) throw new Error('مفيش عناوين أعمدة');
  const rawHeaders = rows[hIdx].map(h=> String(h == null ? '' : h).trim());
  // بنستبعد الأعمدة اللي من غير اسم (الملف ممكن يبقى فيه عشرات الأعمدة الفاضية)
  const keep = [];
  const seen = {};
  rawHeaders.forEach((h, i)=>{
    if(!h) return;
    let name = h;
    if(seen[name]){ seen[name]++; name = h + ' (' + seen[name] + ')'; }   // عنوان مكرر
    else seen[name] = 1;
    keep.push({ i, name });
  });
  if(!keep.length) throw new Error('مفيش أعمدة ليها أسماء');
  importHeaders = keep.map(k=> k.name);
  importParsedRows = rows.slice(hIdx + 1).map(r=>{
    const row = {};
    keep.forEach(k=>{
      const v = r[k.i];
      row[k.name] = (v === null || v === undefined) ? '' : String(v).trim();
    });
    return row;
  }).filter(row=> Object.values(row).some(v=> v !== ''));   // بنشيل الصفوف الفاضية
  if(!importParsedRows.length) throw new Error('مفيش صفوف بيانات تحت العناوين');
}

// قارئ CSV بسيط (بيتعامل مع الفواصل جوه علامات التنصيص "")
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l=> l.trim() !== '');
  if(lines.length === 0) throw new Error('الملف فاضي');
  const parseLine = (line)=>{
    const out = []; let cur = ''; let inQuotes = false;
    for(let i=0; i<line.length; i++){
      const ch = line[i];
      if(ch === '"'){ inQuotes = !inQuotes; }
      else if(ch === ',' && !inQuotes){ out.push(cur); cur = ''; }
      else{ cur += ch; }
    }
    out.push(cur);
    return out.map(s=> s.trim().replace(/^"|"$/g,''));
  };
  importHeaders = parseLine(lines[0]);
  importParsedRows = lines.slice(1).map(l=>{
    const vals = parseLine(l);
    const row = {};
    importHeaders.forEach((h,i)=> row[h] = vals[i] ?? '');
    return row;
  });
}

function renderImportMapping(){
  const show = (importTab === 'inventory' && importParsedRows.length);
  if(importTab === 'inventory'){ try{ refreshClaimRow(); }catch(e){} }
  const wr = document.getElementById('wipeRow');
  if(wr) wr.style.display = show ? 'flex' : 'none';
  const ar = document.getElementById('adjRow');
  if(ar) ar.style.display = show ? 'block' : 'none';
  const wrap = document.getElementById('importPreviewWrap');
  const targets = IMPORT_TARGETS[importTab];
  const headerOptions = ['<option value="">— تجاهل —</option>'].concat(
    importHeaders.map(h=> `<option value="${h}">${h}</option>`)
  ).join('');

  // مطابقة تلقائية لأعمدة كويك بوكس بالظبط (بالاسم الرسمي للعمود)
  const QB_MAP = {
    name:['Item Name','Last Name'], barcode:['Item Number'], price:['Regular Price'],
    cost:['Average Unit Cost','Order Cost'], quantity:['Qty 1'],
    supplier:['Vendor Name'], minStock:['Reorder Point 1'], department:['Department Name'],
    phone:['Phone 1','Phone','Phone Number','Telephone'], points:['Points'], customerName:['Customer Name','Name'],
    date:['Date','Receipt Date'], invoiceNo:['Receipt Number','Invoice Number'], total:['Total'], itemName:['Item Name'], qty:['Qty','Quantity'],
  };
  // محاولة تخمين مبدئي للأعمدة (كويك بوكس الأول بالاسم الرسمي، وبعدين بالتشابه)
  const guessMap = (targetKey)=>{
    var cands = QB_MAP[targetKey] || [];
    for(var j=0;j<cands.length;j++){ if(importHeaders.indexOf(cands[j]) !== -1) return cands[j]; }
    const lower = targetKey.toLowerCase();
    const found = importHeaders.find(h=> h.toLowerCase().includes(lower));
    return found || '';
  };

  wrap.innerHTML = `
    <div style="color:var(--plus); font-size:12px; margin-bottom:10px;">✅ اتقرا ${importParsedRows.length} صف. حدد كل عمود بيمثل إيه:</div>
    <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
      ${targets.map(t=> `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <span style="font-size:12px; flex-shrink:0; width:130px;">${t.label}${t.required?' *':''}</span>
          <select id="map_${t.key}" style="flex:1; padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">
            ${headerOptions}
          </select>
        </div>`).join('')}
    </div>
    <div style="overflow-x:auto; margin-bottom:12px; border:1px solid var(--border); border-radius:8px;">
      <table style="width:100%; border-collapse:collapse; font-size:11px;">
        <thead><tr>${importHeaders.map(h=>`<th style="padding:6px; background:var(--panel2); border-bottom:1px solid var(--border);">${h}</th>`).join('')}</tr></thead>
        <tbody>
          ${importParsedRows.slice(0,3).map(r=> `<tr>${importHeaders.map(h=>`<td style="padding:6px; border-bottom:1px solid var(--border); text-align:center;">${r[h]||''}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
    <label style="display:flex; align-items:flex-start; gap:8px; background:var(--panel2); border:1.5px solid var(--warn);
      border-radius:10px; padding:10px 12px; margin-bottom:10px; cursor:pointer;">
      <input type="checkbox" id="impZeroMissing" style="margin-top:3px;">
      <span style="font-size:12px;">
        <b>الملف ده هو الجرد الكامل للفرع</b>
        <div style="color:var(--muted); margin-top:2px;">
          أي صنف في الفرع ده مش موجود في الملف <b>هيختفي من شاشات الفرع</b> وكميته صفر.
          مفيش حذف — الصنف وتاريخه باقيين، وفروع تانية مش بتتلمس خالص.
        </div>
      </span>
    </label>
    <button onclick="runImport()" style="width:100%; padding:13px; border-radius:10px; border:none; background:var(--plus); color:#062; font-weight:800; cursor:pointer;">استورد ${importParsedRows.length} صف الآن</button>
    ${importTab === 'inventory' ? `
    <button onclick="runFullReconcileFlow()" style="width:100%; padding:13px; border-radius:10px; border:2px solid var(--accent); background:transparent; color:var(--accent); font-weight:800; cursor:pointer; margin-top:8px;">🧹 تنضيف شامل: دمج المكرر + الاستيراد مع بعض</button>
    <div style="font-size:11px; color:var(--muted); margin-top:4px; padding:0 2px;">
      لو عندك أكواد متكررة في المخزون من قبل (نفس الكود بأسماء/أسعار مختلفة)،
      الزرار ده بيدمجهم الأول (الكميات بتتجمع، النسخ الزيادة بتتقفل مش بتتمسح)،
      وبعدين يطبّق اسم/سعر الملف على النسخة الناجية — كل ده في خطوة واحدة.
    </div>` : ''}
    <div id="importResult" style="margin-top:10px; font-size:12px;"></div>`;

  // تعبئة التخمين المبدئي بعد ما الـselect يترسم
  targets.forEach(t=>{
    const guess = guessMap(t.key);
    if(guess) document.getElementById('map_'+t.key).value = guess;
  });
}

// ============================================================
// ⚖️ ضبط الكميات بعد الاستيراد
// ملف QuickBooks بيعكس الكميات وقت التصدير بس. أي بيعة اتعملت على النظام
// الجديد بعد كده مش محسوبة فيه — فبنخصمها، وبنضيف المرتجعات.
// ============================================================

// بيحسب صافي القطع المباعة لكل باركود من تاريخ معيّن (الفرع الحالي بس)
function netSoldByBarcode(sales, sinceMs, branch){
  const out = {};
  (sales||[]).forEach(function(s){
    if(!s) return;
    if(s.branch !== branch) return;              // الفرع الحالي بس
    if(s.reversed || s.isReversal) return;       // الفاتورة المعكوسة كأنها محصلتش
    var ts = s._ts || 0;
    if(!(ts >= sinceMs)) return;
    (s.items||[]).forEach(function(it){
      if(!it || it.isRedemption) return;         // الاستبدال بالنقط مش بيعة
      var code = String(it.barcode || '').trim();
      if(!code) return;
      var q = Number(it.qty) || 0;
      // المرتجع جوه الفاتورة بيرجّع للمخزون → بيتضاف مش بيتخصم
      out[code] = (out[code] || 0) + (it.isReturn ? -q : q);
    });
  });
  return out;
}
if(typeof window !== 'undefined') window.netSoldByBarcode = netSoldByBarcode;

// بيطبّق الخصم على الكميات المستوردة
// 📥 صافي حركة «استلام بضاعة» بعد وقت التصدير — للفرع الحالي بس.
// ⚠️ الأنواع المسموحة: receipt (توريد) و adjustment (تالف/مرتجع للمورد) بس.
//    البيع والمرتجع والعكس بيتحسبوا من الفواتير في netSoldByBarcode —
//    لو حسبناهم هنا كمان هيتخصموا **مرتين**.
// سجل المخزون فيه productId مش باركود، فبنترجم بخريطة من الكتالوج.
function netMovedByBarcode(logs, sinceMs, branch, barcodeById){
  const out = {};
  const map = barcodeById || {};
  (logs || []).forEach(function(l){
    if(!l) return;
    if(l.branch !== branch) return;
    if(l.type !== 'receipt' && l.type !== 'adjustment') return;
    var ts = l._ts || 0;
    if(!(ts >= sinceMs)) return;
    var code = String(map[l.productId] || '').trim();
    if(!code) return;
    out[code] = (out[code] || 0) + (Number(l.delta) || 0);
  });
  return out;
}
if(typeof window !== 'undefined') window.netMovedByBarcode = netMovedByBarcode;

// بيضيف حركة الاستلام على صفوف الملف (التوريد بيزوّد، التالف بيخصم)
function applyMovedAdjustment(rows, moved){
  const changes = [];
  (rows||[]).forEach(function(r){
    var code = String(r.barcode || '').trim();
    var n = moved[code];
    if(!n) return;
    var before = Number(r.qty) || 0;
    var after = before + n;
    if(after < 0) after = 0;                      // الكمية عمرها ما تبقى بالسالب
    r.qty = after;
    changes.push({ barcode: code, name: r.name, before: before, moved: n, after: after });
  });
  return changes;
}
if(typeof window !== 'undefined') window.applyMovedAdjustment = applyMovedAdjustment;

function applySoldAdjustment(rows, sold){
  const changes = [];
  (rows||[]).forEach(function(r){
    var code = String(r.barcode || '').trim();
    var n = sold[code];
    if(!n) return;                                // مفيش بيعات للصنف ده
    var before = Number(r.qty) || 0;
    var after  = before - n;                      // المباع بيتخصم، المرتجع بيتضاف
    if(after < 0) after = 0;                      // الكمية عمرها ما تبقى بالسالب
    r.qty = after;
    changes.push({ barcode: code, name: r.name, before: before, sold: n, after: after });
  });
  return changes;
}
if(typeof window !== 'undefined') window.applySoldAdjustment = applySoldAdjustment;

// 🏬 ترحيل الأصناف القديمة (اللي مالهاش فرع) لفرع محدد — مرة واحدة
// قبل نظام فصل المخزون كانت كل الأصناف مشتركة، فكانت تظهر في كل الفروع.
async function countUnscoped(){
  const snap = await db.collection(TEST_INVENTORY).get();
  return snap.docs.filter(function(d){
    const b = (d.data()||{}).branches;
    return !Array.isArray(b) || !b.length;
  });
}
async function claimUnscoped(){
  const btn = document.getElementById('claimBtn');
  const docs = await countUnscoped();
  if(!docs.length){ showToast('مفيش أصناف قديمة محتاجة ترحيل ✅', 'ok'); return; }
  const okClaim = await askConfirm({
    icon: '🏬', waitSec: 2,
    title: 'نقل الأصناف لفرع ' + currentBranch,
    message: 'هيتنقل ' + docs.length + ' صنف لفرع ' + currentBranch + ' ويبقوا مخصوصين بيه.\n'
           + 'الفروع التانية مش هتشوفهم بعد كده.',
    okText: 'انقل الأصناف', cancelText: 'إلغاء'
  });
  if(!okClaim) return;
  if(btn){ btn.disabled = true; btn.textContent = 'بينقل...'; }
  const CHUNK = 400;
  for(let i = 0; i < docs.length; i += CHUNK){
    const batch = db.batch();
    docs.slice(i, i+CHUNK).forEach(function(d){
      batch.set(d.ref, { branches: [currentBranch] }, { merge:true });
    });
    await batch.commit();
    if(btn) btn.textContent = 'بينقل... ' + Math.min(i+CHUNK, docs.length) + '/' + docs.length;
  }
  if(typeof _logActivity === 'function')
    _logActivity('inventory_claimed', { count: docs.length, branch: currentBranch });
  showToast('✅ اتنقل ' + docs.length + ' صنف لفرع ' + currentBranch, 'ok');
  if(btn){ btn.disabled = false; btn.textContent = 'اتنقلوا ✅'; }
  refreshClaimRow();
}
async function refreshClaimRow(){
  const row = document.getElementById('claimRow'); if(!row) return;
  try{
    const docs = await countUnscoped();
    if(!docs.length){ row.style.display = 'none'; return; }
    row.style.display = 'block';
    const c = document.getElementById('claimCount'); if(c) c.textContent = docs.length;
    ['claimBranch','claimBranch2'].forEach(function(id){
      const el = document.getElementById(id); if(el) el.textContent = currentBranch;
    });
    const btn = document.getElementById('claimBtn');
    if(btn && !btn._wired){ btn._wired = true; btn.addEventListener('click', claimUnscoped); }
  }catch(e){ console.warn('claim row', e); }
}
if(typeof window !== 'undefined'){ window.claimUnscoped = claimUnscoped; window.refreshClaimRow = refreshClaimRow; }

// 🗑️ مسح كل المخزون قبل استيراد جديد
// محمي بتأكيد بالكتابة لأن الإجراء نهائي — البضاعة والكميات كلها بتروح.
async function wipeInventory(resultBox){
  const all = await db.collection(TEST_INVENTORY).get();
  // 🏬 بنمسح أصناف الفرع الحالي بس — أصناف الفروع التانية والمشتركة متتلمسش
  const mine = all.docs.filter(function(d){
    const x = d.data() || {};
    const br = x.branches;
    return Array.isArray(br) && br.length === 1 && br[0] === currentBranch;
  });
  const total = mine.length;
  const others = all.size - total;
  if(total === 0){
    await askConfirm({ waitSec:0, okText:'تمام', cancelText:'إغلاق',
      title:'مفيش أصناف مخصوصة بفرع ' + currentBranch,
      message:'مفيش أي صنف مخصوص بالفرع ده عشان يتمسح.\n'
            + (others ? ('فيه ' + others + ' صنف بتوع فروع تانية أو مشتركة — دول مش هيتمسحوا.') : '') });
    return true;
  }
  const okWipe = await askConfirm({
    icon: '🗑️', danger: true, waitSec: 3,
    title: 'مسح مخزون فرع ' + currentBranch,
    message: 'هيتمسح ' + total + ' صنف من فرع ' + currentBranch + ' نهائيًا.\n'
           + (others ? ('✅ ' + others + ' صنف بتوع الفروع التانية أو المشتركة مش هيتلمسوا.\n') : '')
           + 'الإجراء مفيهوش رجوع.',
    okText: 'امسح مخزون الفرع', cancelText: 'إلغاء — سيب المخزون زي ما هو'
  });
  if(!okWipe) return false;
  const docs = mine;
  const CHUNK = 400;                       // حد Firestore للدفعة 500
  for(let i=0; i<docs.length; i+=CHUNK){
    const batch = db.batch();
    docs.slice(i, i+CHUNK).forEach(function(d){ batch.delete(d.ref); });
    await batch.commit();
    if(resultBox) resultBox.textContent =
      'بيمسح القديم... ' + Math.min(i+CHUNK, docs.length) + ' / ' + docs.length;
  }
  if(typeof _logActivity === 'function') _logActivity('inventory_wiped', { count: total, branch: currentBranch });
  return true;
}
if(typeof window !== 'undefined') window.wipeInventory = wipeInventory;

// ============================================================
// 🔁 منع تكرار الأصناف عند الاستيراد  (إصلاح 2 أغسطس 2026)
// ------------------------------------------------------------
// الباج: الصنف اللي بيتضاف من شاشة المخزون بياخد **مفتاح عشوائي**
// (`.doc()` / `.add()` في pos-admin.js)، والاستيراد كان بيكتب بمفتاح
// `الباركود__الفرع` — المفتاحين عمرهم ما يتقابلوا، فكل صنف كان موجود قبل
// الاستيراد بيتسجّل **مرة تانية بنفس الكود**. النتيجة: المخزون بيتقسّم على
// نسختين، الكاشير بتبيع من واحدة والتانية بتفضل بكميتها الأصلية → الجرد غلط.
//
// الحل: قبل الكتابة بنفهرس المخزون الموجود بالباركود، ولو الكود موجود
// بنكتب **على نفس المستند** بدل ما نعمل واحد جديد.
// ============================================================

// بيرجّع { الباركود: { id: مفتاح المستند اللي نكتب عليه, count: عدد المستندات بنفس الكود } }
function indexInventoryByCode(items, branch){
  const groups = {};
  (items || []).forEach(function(it){
    if(!it) return;
    if(it.status === 'merged') return;              // اتدمج قبل كده — مش هدف للكتابة
    const code = String(it.barcode || '').trim();
    if(!code) return;
    (groups[code] = groups[code] || []).push(it);
  });
  const idx = {};
  Object.keys(groups).forEach(function(code){
    const arr = groups[code];
    // الأولوية: مستند الاستيراد السابق لنفس الفرع ← صنف مخصوص بفرعي ← صنف مشترك
    const byId   = arr.filter(function(x){ return x.id === code + '__' + branch; })[0];
    const mine   = arr.filter(function(x){ return Array.isArray(x.branches) && x.branches.indexOf(branch) >= 0; })[0];
    const shared = arr.filter(function(x){ return !Array.isArray(x.branches) || !x.branches.length; })[0];
    const pick = byId || mine || shared;
    // ⚠️ مفيش fallback على أي مستند: الكود 271 في فرع ممكن يكون صنف تاني خالص
    // في فرع تاني. لو مفيش مستند ظاهر لفرعي، بنسيبه ونعمل مستند خاص بفرعي.
    if(!pick) return;
    const visible = arr.filter(function(x){
      return x.id === code + '__' + branch
        || (Array.isArray(x.branches) && x.branches.indexOf(branch) >= 0)
        || !Array.isArray(x.branches) || !x.branches.length;
    });
    idx[code] = { id: pick.id, count: visible.length };
  });
  return idx;
}

// 🧮 تخطيط الكتابة (دالة نقية — كل منطق منع التكرار هنا وبيتختبر لوحده)
// بترجّع { writes: [{ id, data }], stats }  ·  id = null معناه مستند بمفتاح تلقائي
function planInventoryWrites(rows, mapping, branch, idx, FV){
  const stats = { done:0, failed:0, updated:0, created:0, dupCodes:[] };
  const writes = [];
  idx = idx || {};
  Object.keys(idx).forEach(function(c){ if(idx[c].count > 1) stats.dupCodes.push(c); });

  (rows || []).forEach(function(row){
    const name = String(row[mapping.name] || '').trim();
    if(!name){ stats.failed++; return; }
    const barcode = mapping.barcode ? String(row[mapping.barcode]||'').trim() : '';
    const qtyNum = mapping.quantity ? Math.max(0, parseInt(row[mapping.quantity]) || 0) : 0;   // السالب يبقى صفر
    const isExisting = !!(barcode && idx[barcode]);   // ⭐ هل الصنف ده موجود أصلًا؟
    const data = {
      name: name, barcode: barcode,
      price: mapping.price ? (parseFloat(row[mapping.price]) || 0) : 0,
      cost: mapping.cost ? (parseFloat(row[mapping.cost]) || 0) : 0,
      supplier: mapping.supplier ? (row[mapping.supplier]||'') : '',
      minStock: mapping.minStock ? (Math.max(0, parseInt(row[mapping.minStock])||0)) : 0,
      department: mapping.department ? (row[mapping.department]||'') : '',
      status:'active', importedFrom:'quickbooks',
      // 🏬 arrayUnion مش استبدال: لو الصنف موجود في فروع تانية ميتشالش منها
      branches: FV ? FV.arrayUnion(branch) : [branch],
      updatedAt: FV ? FV.serverTimestamp() : new Date()
    };
    /* 🔴🔴🔴🔴⭐ قرار المالك الصريح: "خلي بس الأعداد اللي ع السيستم
       الحالي واتجاهلي الأعداد اللي جايه في ملف الاستيراد". يعني
       الاسم والسعر بييجوا من الملف ويستبدلوا القديم، **لكن الكمية
       لأ** — لو الصنف موجود أصلًا، مش بنحط qtyByBranch في الكتابة
       خالص (merge:true بيسيب القديم زي ما هو تلقائيًا). الكمية من
       الملف بتتقرا بس لصنف **جديد فعلًا** (مفيش نسخة قديمة نحافظ
       عليها أصلًا). */
    if(!isExisting){
      data.qtyByBranch = { [branch]: qtyNum };   // صنف جديد — مفيش كمية قديمة نحميها
    }
    let id;
    if(isExisting){
      id = idx[barcode].id;                       // ✅ تحديث الموجود — ده الإصلاح
      stats.updated++;
    } else if(barcode){
      id = barcode + '__' + branch;               // صنف جديد فعلًا
      idx[barcode] = { id: id, count: 1 };        // صف تاني بنفس الكود في نفس الملف يروح لنفس المستند
      stats.created++;
    } else {
      id = null;                                   // من غير باركود = مفتاح تلقائي
      stats.created++;
    }
    writes.push({ id: id, data: data });
    stats.done++;
  });
  return { writes: writes, stats: stats };
}

// ============================================================
// 🚫 استبعاد الأصناف اللي مش في الملف  («الملف ده هو الجرد الكامل»)
// ------------------------------------------------------------
// المطلوب (المالك): الصنف القديم **ميظهرش أصلًا** — مش يفضل ظاهر بصفر
// جنب صنف بنفس الكود فيه مخزون. الكاشير المفروض تشوف نسخة واحدة.
//
// الطريقة: الكمية بتتصفّر + الصنف بيتشال من قايمة فروعك، فيختفي من كل
// شاشات الفرع (البحث · البيع · المخزون · الأكواد المتكررة).
// ⚠️ حراس:
//   • مفيش حذف — المستند وتاريخه باقيين، بس مش ظاهرين عندك.
//   • فرع تاني مبيتلمسش: الصنف اللي في Glow يفضل في Glow بكميته.
//   • لو الصنف مشترك (مفيش قايمة فروع) ومعرفناش قايمة الفروع،
//     بنصفّر الكمية بس ومنشيلوش — الاستبعاد الغلط أخطر من صفر ظاهر.
//   • الأصناف اللي في الملف مبتتلمسش خالص.
// ============================================================
const IMPORT_EXCLUDED_TAG = '(مستبعد)';

function planRemoveMissing(items, branch, codesInFile, allBranchList){
  const inFile = {};
  (codesInFile || []).forEach(function(c){
    const k = String(c || '').trim();
    if(k) inFile[k] = 1;
  });
  const others = (allBranchList || []).filter(function(b){ return b && b !== branch; });
  const out = [];
  (items || []).forEach(function(it){
    if(!it || it.status === 'merged') return;
    const code = String(it.barcode || '').trim();
    if(code && inFile[code]) return;                       // موجود في الملف — سيبه
    const hasList = Array.isArray(it.branches) && it.branches.length;
    const visible = !hasList || it.branches.indexOf(branch) >= 0;
    if(!visible) return;                                   // مش ظاهر عندي أصلًا
    const cur = Number((it.qtyByBranch || {})[branch]) || 0;

    let newBranches = null;                                // null = سيب الفروع زي ما هي
    if(hasList){
      const rest = it.branches.filter(function(b){ return b !== branch; });
      newBranches = rest.length ? rest : [IMPORT_EXCLUDED_TAG];
    } else if(others.length){
      newBranches = others;                                // كان مشترك → بقى لباقي الفروع
    }
    if(!newBranches && cur === 0) return;                  // مفيش أي حاجة تتعمل
    out.push({
      id: it.id, name: it.name || '', was: cur,
      hidden: !!newBranches,
      branches: newBranches
    });
  });
  return out;
}
window.planRemoveMissing = planRemoveMissing;

// كتابة صفوف المخزون بالدفعات — بترجّع إحصائية { done, failed, updated, created, dupCodes }
async function writeInventoryRows(rows, mapping, branch, onProgress){
  let idx = {};
  try{
    const snap = await db.collection(TEST_INVENTORY).get();
    idx = indexInventoryByCode(snap.docs.map(function(d){
      return Object.assign({ id: d.id }, d.data());
    }), branch);
  }catch(e){
    // فشل القراءة = نرجع للسلوك القديم (مفتاح الباركود+الفرع) بدل ما الاستيراد كله يقف
    console.warn('[import] تعذّر فهرسة المخزون:', e && e.message);
    idx = {};
  }

  const FV = (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue)
    ? firebase.firestore.FieldValue : null;
  const plan = planInventoryWrites(rows, mapping, branch, idx, FV);

  const CHUNK = 400;   // حد Firestore للدفعة 500
  for(let i=0; i<plan.writes.length; i+=CHUNK){
    const batch = db.batch();
    plan.writes.slice(i, i+CHUNK).forEach(function(w){
      const ref = (w.id == null)
        ? db.collection(TEST_INVENTORY).doc()
        : db.collection(TEST_INVENTORY).doc(w.id);
      batch.set(ref, w.data, { merge:true });
    });
    await batch.commit();
    if(typeof onProgress === 'function') onProgress(Math.min(i+CHUNK, plan.writes.length), plan.writes.length);
  }
  return plan.stats;
}
window.indexInventoryByCode = indexInventoryByCode;
window.planInventoryWrites = planInventoryWrites;
window.writeInventoryRows  = writeInventoryRows;

/* ============================================================
   🧹🔴🔴🔴🔴⭐ التنضيف الشامل — دمج الأكواد المكررة + الاستيراد
   في خطوة واحدة، مش خطوتين منفصلتين.
   ------------------------------------------------------------
   قرار المالك: "ابني جديد يقفل الموضوع بشكل كامل" — بعد ما براندات
   دخلت على بعض وكل كود اتكرر ٤-٥ مرات، مش عايز يدوّر بين شاشتين
   (استيراد، وبعدين أكواد متكررة) كل مرة. الدالة دي بتعمل الاتنين
   مع بعض، بترتيب واحد صحيح:

   ١) دمج أي تكرار **موجود أصلًا** في الفرع ده (زي "أكواد متكررة" —
      نفس القاعدة الآمنة بالظبط: نسخة واحدة بس فيها كمية = دمج تلقائي،
      أكتر من نسخة فيها كمية = يتساب لمراجعة يدوية، الحسابات ما بتخاطرش).
   ٢) بعد الدمج، الصنف اللي "نجا" (keeper) هو اللي بياخد اسم/سعر
      ملف QuickBooks — نفس قاعدة الاستيراد العادي بالظبط (الكمية
      **متتلمسش**، عمود الكمية في الملف يتجاهل تمامًا).
   ٣) أكواد في الملف مالهاش أي نسخة في الفرع أصلًا = صنف جديد،
      كمية الملف بتتقرا له عادي (مفيش حاجة قديمة نحميها).

   🔒 نفس فلسفة "أكواد متكررة" تمامًا: الدمج بيقفل النسخ الزيادة
   (status:'merged')، مفيش حذف خالص، كل حاجة قابلة للمراجعة بعدها. */
function planFullReconcile(items, rows, mapping, branch, salesById){
  // ١) خطة الدمج الجماعي — نفس دالة "أكواد متكررة" بالظبط، بلا تكرار منطق
  const bulk = planBulkMerge(items || [], branch, salesById);

  // نبني خريطة "بعد الدمج": أي كود اندمج تلقائي، الـkeeper بتاعه هو
  // اللي هيستقبل اسم/سعر الملف. أكواد المراجعة اليدوية (manual) ما
  // بتتلمسش هنا خالص — تحتاج قرار بشري الأول.
  const mergedKeeperByCode = {};
  bulk.auto.forEach(function(a){ mergedKeeperByCode[a.code] = a.plan.keeper.id; });
  const manualCodes = {};
  bulk.manual.forEach(function(m){ manualCodes[m.code] = true; });

  // نبني فهرس الأكواد "بعد الدمج" — بديل indexInventoryByCode العادي،
  // بس بيوجّه لصنف الـkeeper الجديد لو الكود ده كان متكرر واندمج تلقائي
  const baseIdx = indexInventoryByCode(items || [], branch);
  const idx = {};
  Object.keys(baseIdx).forEach(function(c){
    idx[c] = mergedKeeperByCode[c]
      ? { id: mergedKeeperByCode[c], count: 1 }   // بعد الدمج، نسخة واحدة بس
      : baseIdx[c];
  });

  // ٢) خطة الاستيراد فوق الفهرس "بعد الدمج" — نفس دالة الاستيراد العادي بالظبط
  const FV = (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue)
    ? firebase.firestore.FieldValue : null;
  const importPlan = planInventoryWrites(rows, mapping, branch, idx, FV);

  // 🚫 أكواد لسه محتاجة مراجعة يدوية (تكرار بكميات ملتبسة) — بنستبعدهم
  // من كتابة الاستيراد التلقائي عشان مانكتبش فوق حاجة لسه مش واضحة مين
  // النسخة الصح فيها، حتى لو عارفين اسمها/سعرها الصح من الملف.
  const skippedManual = [];
  const safeWrites = importPlan.writes.filter(function(w){
    const bc = w.data && w.data.barcode;
    if(bc && manualCodes[bc]){ skippedManual.push(bc); return false; }
    return true;
  });

  return {
    mergeWrites: bulk.auto,              // كتابات الدمج (keeper + losers لكل مجموعة)
    importWrites: safeWrites,            // كتابات الاستيراد (بعد استبعاد المراجعة اليدوية)
    manualGroups: bulk.manual,           // محتاجة قرار بشري — زي "أكواد متكررة" بالظبط
    skippedManual: skippedManual,
    stats: {
      mergedGroups: bulk.stats.autoGroups,
      mergedClosed: bulk.stats.closing,
      manualGroups: bulk.stats.manualGroups,
      imported: safeWrites.length,
      updated: importPlan.stats.updated,
      created: importPlan.stats.created,
      failed: importPlan.stats.failed,
      skippedForManualReview: skippedManual.length
    }
  };
}
window.planFullReconcile = planFullReconcile;

async function runFullReconcile(rows, mapping, branch, onProgress){
  const salesById = (typeof invSales === 'object' && invSales) ? invSales : null;
  const plan = planFullReconcile(allInventory || [], rows, mapping, branch, salesById);

  const CHUNK = 400;
  let done = 0;
  const total = plan.mergeWrites.reduce(function(n,a){ return n + a.plan.losers.length + 1; }, 0)
    + plan.importWrites.length;

  // ١) الدمج الأول — لازم يخلص قبل الاستيراد عشان الـkeeper يبقى جاهز
  for(let i=0; i<plan.mergeWrites.length; i+=CHUNK){
    const slice = plan.mergeWrites.slice(i, i+CHUNK);
    const batch = db.batch();
    slice.forEach(function(a){
      batch.set(db.collection(TEST_INVENTORY).doc(a.plan.keeper.id), a.plan.keeper.update, { merge:true });
      a.plan.losers.forEach(function(l){
        batch.set(db.collection(TEST_INVENTORY).doc(l.id), l.update, { merge:true });
        done++;
      });
      done++;
    });
    await batch.commit();
    if(typeof onProgress === 'function') onProgress(done, total, 'دمج');
  }

  // ٢) الاستيراد بعد كده — فوق الأكواد اللي خلصت اندماجها
  for(let i=0; i<plan.importWrites.length; i+=CHUNK){
    const slice = plan.importWrites.slice(i, i+CHUNK);
    const batch = db.batch();
    slice.forEach(function(w){
      const ref = (w.id == null) ? db.collection(TEST_INVENTORY).doc() : db.collection(TEST_INVENTORY).doc(w.id);
      batch.set(ref, w.data, { merge:true });
      done++;
    });
    await batch.commit();
    if(typeof onProgress === 'function') onProgress(done, total, 'استيراد');
  }

  if(typeof _logActivity === 'function')
    _logActivity('inventory_full_reconcile', {
      branch: branch, merged: plan.stats.mergedGroups, closed: plan.stats.mergedClosed,
      imported: plan.stats.imported, manualLeft: plan.stats.manualGroups
    });

  return plan.stats;
}
window.runFullReconcile = runFullReconcile;

/* 🧹🔴🔴🔴🔴⭐ التدفّق الكامل للتنضيف الشامل: معاينة (Dry Run) واضحة،
   تأكيد صريح بالكتابة (زي مسح المخزون — إجراء بيلمس أكواد كتير مرة
   واحدة، محتاج وعي كامل قبل التنفيذ)، وبعدين تنفيذ فعلي. */
async function runFullReconcileFlow(){
  if(!hasPerm('canEditInventory')){ showToast('مفيش صلاحية', 'err'); return; }
  const targets = IMPORT_TARGETS[importTab];
  const mapping = {};
  for(const t of targets){
    const val = document.getElementById('map_'+t.key).value;
    if(t.required && !val){ showToast(`لازم تحدد عمود "${t.label}"`, 'err'); return; }
    mapping[t.key] = val;
  }

  const resultBox = document.getElementById('importResult');
  const salesById = (typeof invSales === 'object' && invSales) ? invSales : null;
  const plan = planFullReconcile(allInventory || [], importParsedRows, mapping, currentBranch, salesById);

  const manualList = plan.manualGroups.length
    ? ('\n\n⚠️ ' + plan.manualGroups.length + ' كود هيتساب زي ما هو (محتاج مراجعتك بإيدك من "🔍 أكواد متكررة" —'
       + ' فيهم أكتر من نسخة بكمية، مش واضح مين النسخة الصح): '
       + plan.manualGroups.slice(0,8).map(function(m){ return m.code; }).join('، ')
       + (plan.manualGroups.length > 8 ? '…' : ''))
    : '';

  const ok = await askConfirm({
    icon: '🧹', danger: true, okText: 'نضّف الكل الآن', waitSec: 6,
    title: 'تنضيف شامل — ' + currentBranch,
    message: '١) دمج: ' + plan.stats.mergedGroups + ' كود مكرر هيتدمج (' + plan.stats.mergedClosed + ' نسخة هتتقفل، الكميات بتتجمع)\n'
      + '٢) استيراد: ' + plan.stats.updated + ' صنف هيتحدّث اسمه/سعره من الملف، ' + plan.stats.created + ' صنف جديد هيتضاف\n'
      + '⭐ الكمية الحالية في النظام متتلمسش خالص — عمود الكمية في الملف بيتجاهل\n'
      + 'مفيش أي حذف — كل حاجة قابلة للمراجعة بعدها.'
      + manualList
  });
  if(!ok){ showToast('اتلغى'); return; }

  resultBox.textContent = 'جارٍ التنضيف... 0%';
  try{
    const stats = await runFullReconcile(importParsedRows, mapping, currentBranch, function(done, total, stage){
      resultBox.textContent = 'جارٍ التنضيف (' + stage + ')... ' + done + '/' + total;
    });
    resultBox.innerHTML = '✅ خلص — دُمج ' + stats.mergedGroups + ' كود (' + stats.mergedClosed + ' نسخة اتقفلت)'
      + '، اتحدّث ' + stats.updated + ' صنف، اتضاف ' + stats.created + ' صنف جديد'
      + (stats.manualGroups ? ('<br>⚠️ ' + stats.manualGroups + ' كود لسه محتاج مراجعتك اليدوية') : '');
    showToast('التنضيف الشامل خلص ✅');
    if(typeof loadInventory === 'function') loadInventory();
  }catch(e){
    resultBox.innerHTML = '⚠️ حصل خطأ أثناء التنضيف: ' + (e && e.message ? e.message : e);
    showToast('فشل التنضيف', 'err');
  }
}
window.runFullReconcileFlow = runFullReconcileFlow;

async function runImport(){
  const targets = IMPORT_TARGETS[importTab];
  const mapping = {};
  for(const t of targets){
    const val = document.getElementById('map_'+t.key).value;
    if(t.required && !val){ showToast(`لازم تحدد عمود "${t.label}"`, 'err'); return; }
    mapping[t.key] = val;
  }

  const resultBox = document.getElementById('importResult');
  resultBox.textContent = 'جارٍ الاستيراد... 0%';
  let done = 0, failed = 0;

  // ===== المخزون: كتابة بالدفعات + تحديث بالباركود (مش تكرار) =====
  if(importTab === 'inventory'){
    // 🗑️ مسح المخزون القديم — بتأكيد بالكتابة، الإجراء نهائي ومفيش رجوع
    const wipeEl = document.getElementById('wipeBeforeImport');
    if(wipeEl && wipeEl.checked){
      const ok = await wipeInventory(resultBox);
      if(!ok){ resultBox.textContent = 'اتلغى — المخزون زي ما هو'; return; }
    }
    const rows = importParsedRows;
    // ⚖️ خصم المباع على النظام الجديد قبل ما نكتب الكميات
    const adjEl = document.getElementById('adjustSold');
    if(adjEl && adjEl.checked){
      const sinceVal = (document.getElementById('adjustSince')||{}).value;
      if(!sinceVal){ showToast('حدد تاريخ ووقت تصدير الملف الأول', 'err'); resultBox.textContent=''; return; }
      const sinceMs = new Date(sinceVal).getTime();
      if(isNaN(sinceMs)){ showToast('التاريخ مش مظبوط', 'err'); resultBox.textContent=''; return; }
      resultBox.textContent = 'بيقرا بيعات النظام الجديد...';
      try{
        const salesSnap = await db.collection(TEST_SALES).where('branch','==', currentBranch).get();
        const sales = salesSnap.docs.map(function(d){
          const x = d.data() || {};
          const c = x.createdAt;
          x._ts = c && c.toMillis ? c.toMillis() : (c && c.seconds ? c.seconds*1000 : (x.ts || 0));
          return x;
        });
        // بنجهّز الصفوف بالباركود عشان المطابقة
        const prepped = rows.map(function(r){
          return { barcode: mapping.barcode ? String(r[mapping.barcode]||'').trim() : '',
                   name: String(r[mapping.name]||'').trim(),
                   qty: mapping.quantity ? (parseInt(r[mapping.quantity]) || 0) : 0,
                   _row: r };
        });
        const sold = netSoldByBarcode(sales, sinceMs, currentBranch);
        const changes = applySoldAdjustment(prepped, sold);

        // 📥 وحركة «استلام بضاعة» بعد نفس التاريخ (توريد + تالف/مرتجع للمورد)
        resultBox.textContent = 'بيقرا حركة الاستلام...';
        let movedChanges = [];
        try{
          const sinceTs = firebase.firestore.Timestamp.fromMillis(sinceMs);
          const logSnap = await db.collection(TEST_STOCK_LOG).where('createdAt','>=', sinceTs).get();
          const logs = logSnap.docs.map(function(d){
            const x = d.data() || {};
            const c = x.createdAt;
            x._ts = c && c.toMillis ? c.toMillis() : (c && c.seconds ? c.seconds*1000 : 0);
            return x;
          });
          const barcodeById = {};
          (allInventory || []).forEach(function(p){
            if(p && p.id) barcodeById[p.id] = String(p.barcode || '').trim(); });
          const moved = netMovedByBarcode(logs, sinceMs, currentBranch, barcodeById);
          movedChanges = applyMovedAdjustment(prepped, moved);
        }catch(e){
          // فشل قراءة السجل ميوقفش الاستيراد — بس المستخدم لازم يعرف
          console.warn('[import] تعذّر قراءة حركة الاستلام:', e && e.message);
          if(!confirm('⚠️ متعرفناش نقرا حركة «استلام بضاعة» بعد التاريخ ده.\n'
            + 'الاستيراد هيخصم المباع بس.\n\nنكمّل؟')){ resultBox.textContent = 'اتلغى'; return; }
        }
        if(movedChanges.length){
          const topM = movedChanges.slice(0, 12).map(function(c){
            return '• ' + (c.name||c.barcode) + ': ' + c.before + ' ' + (c.moved > 0 ? '+ ' + c.moved : '− ' + (-c.moved)) + ' = ' + c.after;
          }).join('\n');
          const moreM = movedChanges.length > 12 ? ('\n… و' + (movedChanges.length-12) + ' صنف كمان') : '';
          if(!confirm('📥 حركة استلام على ' + movedChanges.length + ' صنف:\n\n' + topM + moreM + '\n\nنكمّل؟')){
            resultBox.textContent = 'اتلغى'; return;
          }
          prepped.forEach(function(pr){ if(mapping.quantity) pr._row[mapping.quantity] = pr.qty; });
          if(typeof _logActivity === 'function')
            _logActivity('import_qty_moved', { count: movedChanges.length, since: sinceVal });
        }
        if(!changes.length){
          if(!confirm('مفيش أي بيعات على النظام الجديد بعد التاريخ ده.\nنكمّل الاستيراد من غير خصم؟')){
            resultBox.textContent = 'اتلغى'; return;
          }
        } else {
          const top = changes.slice(0, 12).map(function(c){
            return '• ' + (c.name||c.barcode) + ': ' + c.before + ' − ' + c.sold + ' = ' + c.after;
          }).join('\n');
          const more = changes.length > 12 ? ('\n… و' + (changes.length-12) + ' صنف كمان') : '';
          if(!confirm('⚖️ هيتعدّل ' + changes.length + ' صنف:\n\n' + top + more + '\n\nنكمّل؟')){
            resultBox.textContent = 'اتلغى'; return;
          }
          // نرجّع الكميات المعدّلة للصفوف الأصلية
          prepped.forEach(function(pr){
            if(mapping.quantity) pr._row[mapping.quantity] = pr.qty;
          });
          if(typeof _logActivity === 'function')
            _logActivity('import_qty_adjusted', { count: changes.length, since: sinceVal });
        }
      }catch(e){
        showToast('تعذر حساب المباع: ' + (e && e.message ? e.message : e), 'err');
        resultBox.textContent = ''; return;
      }
    }
    let stats;
    try{
      stats = await writeInventoryRows(rows, mapping, currentBranch, function(n, total){
        resultBox.textContent = `جارٍ الاستيراد... ${n}/${total}`;
      });
    }catch(e){ resultBox.innerHTML = '⚠️ حصل خطأ أثناء الاستيراد: '+e.message; showToast('فشل الاستيراد', 'err'); return; }
    done = stats.done; failed = stats.failed;

    // 0️⃣ «الملف ده هو الجرد الكامل» — تصفير اللي مش فيه
    let zeroed = 0;
    const wantZero = (function(){
      const c = document.getElementById('impZeroMissing');
      return !!(c && c.checked);
    })();
    if(wantZero){
      const codes = rows.map(function(r){
        return mapping.barcode ? String(r[mapping.barcode]||'').trim() : ''; });
      let branchList = [];
      try{ branchList = JSON.parse(localStorage.getItem('pos_branch_list') || '[]'); }catch(e){}
      const targets = planRemoveMissing(allInventory || [], currentBranch, codes, branchList);
      if(targets.length){
        const hiddenCount = targets.filter(function(t){ return t.hidden; }).length;
        const okZero = await askConfirm({
          icon:'🚫', danger:true, okText:'استبعدهم', waitSec:5,
          title:'استبعاد ' + targets.length + ' صنف',
          message: targets.length + ' صنف في ' + currentBranch + ' مش موجودين في الملف.\n'
            + hiddenCount + ' منهم هيختفوا من شاشات الفرع تمامًا (كميتهم صفر).\n'
            + (targets.length - hiddenCount ? ((targets.length - hiddenCount) + ' هيتصفّروا بس.\n') : '')
            + '\nمفيش أي حذف — الأصناف وتاريخها باقيين، وفروع تانية مش هتتلمس.\n\nتكمّل؟'
        });
        if(okZero){
          const FVz = firebase.firestore.FieldValue;
          const CH = 400;
          for(let i=0; i<targets.length; i+=CH){
            try{
              const b2 = db.batch();
              targets.slice(i, i+CH).forEach(function(t){
                const upd = {
                  ['qtyByBranch.'+currentBranch]: 0,
                  excludedByImportAt: Date.now(),
                  updatedAt: FVz.serverTimestamp()
                };
                if(t.branches) upd.branches = t.branches;   // بيختفي من الفرع
                b2.set(db.collection(TEST_INVENTORY).doc(t.id), upd, { merge:true });
              });
              await b2.commit();
              zeroed += Math.min(CH, targets.length - i);
              resultBox.textContent = 'جارٍ الاستبعاد... ' + zeroed + '/' + targets.length;
            }catch(e){ console.warn('exclude missing', e && e.message); }
          }
          if(typeof _logActivity === 'function')
            _logActivity('import_excluded_missing', { count: zeroed, branch: currentBranch });
        }
      }
    }

    resultBox.innerHTML = `✅ اتستورد ${done} صنف${failed ? ` — ${failed} صف اتخطّى (اسم فاضي)` : ''}`
      + (zeroed ? `<div style="font-size:12px; color:var(--warn); margin-top:4px;">🚫 ${zeroed} صنف مش في الملف اتستبعدوا من ${currentBranch}</div>` : '')
      + `<div style="font-size:12px; color:var(--muted); margin-top:4px;">🔁 ${stats.updated} تحديث لأصناف موجودة · ➕ ${stats.created} صنف جديد</div>`
      + (stats.dupCodes.length
          ? `<div style="font-size:12px; color:var(--warn); margin-top:6px; font-weight:700;">⚠️ ${stats.dupCodes.length} كود متسجّل أكتر من مرة من استيراد قديم — افتح «🔍 أكواد متكررة» من شاشة المخزون وادمجهم</div>`
          : '');
    showToast('خلص استيراد المخزون ✅');
    if(typeof loadInventory === 'function') await loadInventory();
    return;
  }

  // ===== العملاء: كتابة بالدفعات + توليد كود ولاء ECH لكل عميل =====
  if(importTab === 'customers'){
    const rows = importParsedRows;
    const CHUNK = 400;
    const usedCodes = {};
    const hasNotes = importHeaders.indexOf('Notes') !== -1;
    const hasEmail = importHeaders.indexOf('EMail') !== -1;
    // كود ثابت مشتق من الرقم (نفس الرقم = نفس الكود لو استوردت تاني)، مع فض التعارض
    function codeFromPhone(phone){
      let h = 0; for(let i=0;i<phone.length;i++){ h = (h*31 + phone.charCodeAt(i)) >>> 0; }
      let n = h % 100000000; let code = 'ECH' + String(n).padStart(8,'0');
      while(usedCodes[code]){ n = (n+1) % 100000000; code = 'ECH' + String(n).padStart(8,'0'); }
      usedCodes[code] = 1; return code;
    }
    try{
      for(let i=0; i<rows.length; i+=CHUNK){
        const batch = db.batch();
        const slice = rows.slice(i, i+CHUNK);
        slice.forEach(row=>{
          let phone = (row[mapping.phone]||'').replace(/\D/g,'');
          // تنضيف الأرقام المصرية عشان تطابق اللي العميلة بتكتبه في تطبيق الولاء
          if(phone.length === 12 && phone.slice(0,2) === '20') phone = '0' + phone.slice(2);  // كود الدولة 20
          if(phone.length === 10 && phone[0] === '1') phone = '0' + phone;                     // فقد الصفر البادئ
          if(!phone || phone.length < 8){ failed++; return; }   // أرقام فاضية/غلط تتخطّى
          const name = mapping.name ? (row[mapping.name]||'').trim() : '';
          const data = {
            phone, name,
            points: mapping.points ? (parseFloat(row[mapping.points]) || 0) : 0,
            loyaltyCode: codeFromPhone(phone),
            branch: currentBranch, importedFrom: 'quickbooks',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          };
          if(hasNotes && (row['Notes']||'').trim()) data.notes = row['Notes'].trim();
          if(hasEmail && (row['EMail']||'').trim()) data.email = row['EMail'].trim();
          batch.set(db.collection(TEST_CUSTOMERS).doc(phone), data, { merge:true });
          done++;
        });
        await batch.commit();
        resultBox.textContent = `جارٍ الاستيراد... ${Math.min(i+CHUNK, rows.length)}/${rows.length}`;
      }
    }catch(e){ resultBox.innerHTML = '⚠️ حصل خطأ أثناء الاستيراد: '+e.message; showToast('فشل الاستيراد', 'err'); return; }
    resultBox.innerHTML = `✅ اتستورد ${done} عميل — كل واحد اتعمله كود ولاء${failed ? ` · ${failed} صف اتخطّى (رقم فاضي أو غلط)` : ''}`;
    showToast('خلص استيراد العملاء ✅');
    return;
  }

  // ===== المبيعات القديمة (صف صف) =====
  for(const row of importParsedRows){
    try{
      if(importTab === 'sales'){
        const total = mapping.total ? (parseFloat(row[mapping.total]) || 0) : 0;
        await db.collection(TEST_LEGACY_SALES).add({
          date: mapping.date ? (row[mapping.date]||'') : '',
          invoiceNo: mapping.invoiceNo ? (row[mapping.invoiceNo]||'') : '',
          customerName: mapping.customerName ? (row[mapping.customerName]||'') : '',
          itemName: mapping.itemName ? (row[mapping.itemName]||'') : '',
          qty: mapping.qty ? (parseFloat(row[mapping.qty]) || 0) : 0,
          total, branch: currentBranch,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      done++;
    }catch(e){ failed++; }
    if((done+failed) % 10 === 0) resultBox.textContent = `جارٍ الاستيراد... ${done+failed}/${importParsedRows.length}`;
  }

  resultBox.innerHTML = `✅ اتستورد ${done} صف بنجاح${failed ? ` — ${failed} صف فشل (بيانات ناقصة)` : ''}`;
  showToast('خلص الاستيراد ✅');
  if(importTab === 'inventory') await loadInventory();
}

// ---------------- عرض المبيعات القديمة (للرجوع بس، منفصلة عن التقارير الحية) ----------------
async function viewLegacySales(){
  const snap = await db.collection(TEST_LEGACY_SALES).where('branch','==', currentBranch).get();
  return snap.docs.map(d=>d.data());
}
