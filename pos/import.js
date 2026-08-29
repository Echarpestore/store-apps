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
      <input type="file" id="importFileInput" accept=".csv,.xls,.xlsx" data-qb-import-file="1" style="margin-bottom:10px;">
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
}

// v392 — listener واحد ثابت على document بدل ربط listener بعنصر بيتعمل من جديد
// renderImportPanel بيتنادى مرتين عند فتح شاشة الاستيراد (goToImport ثم switchImportTab).
// في بعض المتصفحات/الكاش القديم كان input يتبدّل بعد ربط الـlistener، فيظهر اسم الملف
// لكن handleImportFile مايتنفذش. الـdelegation هنا يمسك أي input جديد دائمًا.
(function bindImportFileDelegation(){
  if(typeof document === 'undefined' || window.__qbImportDelegatedV392) return;
  window.__qbImportDelegatedV392 = true;
  document.addEventListener('change', function(ev){
    const t = ev && ev.target;
    if(!t || t.id !== 'importFileInput') return;
    handleImportFile(ev);
  }, true);
})();

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
    // نسخة محلية الأول، وبعدها أكتر من مصدر موثوق. بعض أجهزة الفروع/الشبكات
    // بتحجب CDN معيّن؛ قبل كده اختيار ملف Excel كان يبان كأنه "ماعملش حاجة".
    const sources = [
      'xlsx.full.min.js',
      'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
      'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
    ];
    let i = 0;
    const next = ()=>{
      if(i >= sources.length){ reject(new Error('مش قادر أحمّل قارئ Excel')); return; }
      const src = sources[i++];
      const sc = document.createElement('script');
      let done = false;
      const finish = (ok)=>{
        if(done) return; done = true;
        clearTimeout(timer);
        if(ok && window.XLSX){ resolve(window.XLSX); return; }
        try{ sc.remove(); }catch(_){}
        next();
      };
      const timer = setTimeout(()=>finish(false), 6000);
      sc.src = src;
      sc.onload = ()=>finish(true);
      sc.onerror = ()=>finish(false);
      document.head.appendChild(sc);
    };
    next();
  });
  return _xlsxLoading;
}

function handleImportFile(e){
  const file = e.target.files[0];
  if(!file) return;
  const note = document.getElementById('importLoadNote');
  // مهم: العميل لازم يشوف إن اختيار الملف اتلقط فورًا. قبل كده لو الملف نفسه
  // فيه تنسيق QuickBooks غريب كان المسار ممكن ينتهي من غير أي feedback واضح.
  if(note) note.textContent = '⏳ تم اختيار ' + (file.name || 'الملف') + ' — جاري القراءة…';
  const isExcel = /\.(xlsx?|xlsm)$/i.test(file.name || '');
  if(isExcel){
    if(note) note.textContent = '⏳ تم اختيار ' + (file.name || 'الملف') + ' — جاري تجهيز قارئ Excel…';
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

// QuickBooks Customer Export ساعات بيحط عنوان تقرير/اسم شركة قبل صف الأعمدة.
// اختيار أول صف غير فاضي كان مناسب لملف المنتجات، لكنه ممكن يعتبر عنوان التقرير
// هو الـheader في ملف العملاء. بنختار أقرب صف فعلي لعناوين العملاء فقط، ونسيب
// مسار المنتجات القديم كما هو.
function pickImportHeaderRow(rows, tab){
  if(!Array.isArray(rows) || !rows.length) return -1;
  const firstNonEmpty = rows.findIndex(r=> Array.isArray(r) && r.some(c=> String(c == null ? '' : c).trim() !== ''));
  if(tab !== 'customers') return firstNonEmpty;

  const exact = new Set([
    'customer name','name','first name','last name','company name',
    'phone 1','phone','phone number','telephone','mobile','mobile phone','cell','cell phone',
    'points','email','e-mail','email address','notes','customer #','customer number'
  ]);
  let best = { idx:firstNonEmpty, score:-1 };
  const max = Math.min(rows.length, 30);
  for(let i=0;i<max;i++){
    const r = Array.isArray(rows[i]) ? rows[i] : [];
    let score = 0, nonEmpty = 0;
    r.forEach(function(c){
      const v = String(c == null ? '' : c).trim().toLowerCase();
      if(!v) return;
      nonEmpty++;
      if(exact.has(v)) score += 4;
      else if(/phone|mobile|telephone|cell/.test(v)) score += 3;
      else if(/customer|first name|last name|full name|company/.test(v)) score += 2;
      else if(/email|note|point/.test(v)) score += 1;
    });
    // صف الأعمدة الحقيقي عادة فيه أكتر من خلية؛ عنوان التقرير غالبًا خلية واحدة.
    if(nonEmpty >= 2) score += 1;
    if(score > best.score) best = { idx:i, score:score };
  }
  // ما نغيّرش السلوك إلا لما نكون لقينا صف عملاء مقنع فعلًا.
  return best.score >= 5 ? best.idx : firstNonEmpty;
}
if(typeof window !== 'undefined') window.pickImportHeaderRow = pickImportHeaderRow;

// بيقرا أول شيت ويحوّله لنفس شكل الـ CSV (أعمدة + صفوف)
function parseExcel(XLSX, buf){
  const wb = XLSX.read(new Uint8Array(buf), { type:'array' });
  const first = wb.SheetNames && wb.SheetNames[0];
  if(!first) throw new Error('الملف مفيهوش شيتات');
  const ws = wb.Sheets[first];
  // header:1 → صفوف خام، عشان نتحكم في أسماء الأعمدة بنفسنا
  const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:'' });
  if(!rows.length) throw new Error('الشيت فاضي');
  let hIdx = pickImportHeaderRow(rows, importTab);
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
    name:['Item Name','Customer Name','Full Name','Name','Last Name','First Name'], barcode:['Item Number'], price:['Regular Price'],
    cost:['Average Unit Cost','Order Cost'], quantity:['Qty 1'],
    supplier:['Vendor Name'], minStock:['Reorder Point 1'], department:['Department Name'],
    phone:['Phone 1','Phone','Phone Number','Telephone','Mobile','Mobile Phone','Cell','Cell Phone'], points:['Points'], customerName:['Customer Name','Name'],
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
    ${importTab === 'inventory' ? `
    <button onclick="runBranchCatalogReplaceFlow()" style="width:100%; padding:14px; border-radius:10px; border:2px solid var(--accent); background:var(--accent); color:#111; font-weight:900; cursor:pointer;">⬆️ حدّث/أضف الملف على فرع ${'' + (typeof currentBranch !== 'undefined' ? currentBranch : '')}</button>
    <div style="font-size:11px; color:var(--muted); margin-top:5px; padding:0 2px; line-height:1.7;">
      الملف يحدّث الأصناف الموجودة ويضيف الجديدة فقط. <b>أي صنف موجود في الفرع ومش موجود في الملف يفضل زي ما هو.</b>
      <b>لو الفرع جديد ولسه مفيش عليه بيع/استلام/رصيد افتتاحي</b>، أول استيراد يستخدم كمية الملف كرصد افتتاحي تلقائيًا.
      بعد أول تشغيل فعلي، كمية الملف تتجاهل ويحتفظ السيستم بكمياته الحالية. <b>ولا أي فرع تاني بيتغير.</b>
    </div>
    <details style="margin-top:8px; color:var(--muted); font-size:11px;"><summary style="cursor:pointer;">أدوات استيراد قديمة/متقدمة</summary>
      <button onclick="runImport()" style="width:100%; padding:10px; border-radius:9px; border:1px solid var(--border); background:transparent; color:var(--muted); font-weight:700; cursor:pointer; margin-top:7px;">تحديث الأصناف فقط بدون استبدال كامل</button>
      <button onclick="runFullReconcileFlow()" style="width:100%; padding:10px; border-radius:9px; border:1px solid var(--border); background:transparent; color:var(--muted); font-weight:700; cursor:pointer; margin-top:7px;">🧹 الدمج الآمن القديم</button>
    </details>` : `
    <button onclick="runImport()" style="width:100%; padding:13px; border-radius:10px; border:none; background:var(--plus); color:#062; font-weight:800; cursor:pointer;">استورد ${importParsedRows.length} صف الآن</button>`}
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
    const qtyNum = 0;   // ⭐ سياسة نهائية: كمية الملف لا تُستخدم حتى للصنف الجديد
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
      data.qtyByBranch = { [branch]: qtyNum };   // صنف جديد = صفر دائمًا
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
   ⬆️ تحديث/إضافة كتالوج فرع من الملف — Branch-scoped Upsert
   ------------------------------------------------------------
   سياسة المالك (24 أغسطس 2026):
   • الملف يحدّث/يضيف للفرع الحالي فقط: الاسم + السعر + البيانات للأكواد الموجودة في الملف.
   • كمية الملف تُتجاهل 100%. الكمية الوحيدة المعتمدة هي الكمية الحالية في السيستم.
   • نفس الكود لو متكرر داخل الفرع: نجمع كمية الفرع الحالية كلها في نسخة واحدة.
   • كود جديد في الملف: يبدأ بكمية صفر.
   • صنف موجود في الفرع ومش موجود في الملف: يفضل زي ما هو تمامًا.
   • أي بيانات/كميات تخص فرع تاني لا تتغير.

   ملاحظة أمان: "المسح" هنا Soft removal من الفرع، مش deleteDoc، عشان
   التاريخ والمراجع القديمة تفضل قابلة للمراجعة والاسترجاع.
   ============================================================ */
function _branchReplaceVisible(it, branch){
  if(!it || it.status === 'merged') return false;
  const br = it.branches;
  return !Array.isArray(br) || !br.length || br.indexOf(branch) >= 0;
}

function _branchReplaceKnownBranches(items, supplied, branch){
  const seen = {};
  (supplied || []).forEach(function(b){ if(b) seen[String(b)] = 1; });
  (items || []).forEach(function(it){
    (Array.isArray(it && it.branches) ? it.branches : []).forEach(function(b){
      if(b && b !== IMPORT_EXCLUDED_TAG && b !== '(مدموج)') seen[String(b)] = 1;
    });
    Object.keys((it && it.qtyByBranch) || {}).forEach(function(b){ if(b) seen[String(b)] = 1; });
  });
  if(branch) seen[String(branch)] = 1;
  return Object.keys(seen);
}

function _branchReplaceSafeTarget(it, branch){
  if(!it || it.status === 'merged') return false;
  const br = it.branches;
  // مستند خاص بالفرع، أو مستند اتشال من نفس الفرع باستيراد سابق ويمكن إحياؤه بأمان.
  if(Array.isArray(br) && br.length === 1 && br[0] === branch) return true;
  if(it.status === 'import_excluded' && it.excludedByImportBranch === branch
      && Array.isArray(br) && br.length === 1 && br[0] === IMPORT_EXCLUDED_TAG) return true;
  return false;
}

function _branchReplaceDocId(code, branch, allItems, preferredExisting){
  if(preferredExisting) return preferredExisting.id;
  const used = {};
  (allItems || []).forEach(function(it){ if(it && it.id) used[it.id] = 1; });
  const base = code + '__' + branch;
  if(!used[base]) return base;
  const alt = base + '__catalog';
  if(!used[alt]) return alt;
  let n = 2;
  while(used[alt + n]) n++;
  return alt + n;
}

function _branchReplaceCleanup(it, branch, keeperId, knownBranches){
  const q = Object.assign({}, (it && it.qtyByBranch) || {});
  q[branch] = 0;
  const listed = Array.isArray(it && it.branches) ? it.branches.slice() : null;
  const qtyOther = Object.keys(q).filter(function(b){ return b !== branch && (Number(q[b]) || 0) !== 0; });
  let rest = [];
  if(listed && listed.length){
    rest = listed.filter(function(b){ return b !== branch && b !== IMPORT_EXCLUDED_TAG && b !== '(مدموج)'; });
  } else {
    // الصنف المشترك: نحوله لصنف لباقي الفروع المعروفة بدل ما نخفيه عليهم.
    rest = (knownBranches || []).filter(function(b){ return b && b !== branch; });
  }
  qtyOther.forEach(function(b){ if(rest.indexOf(b) < 0) rest.push(b); });

  if(rest.length){
    return {
      id: it.id,
      data: {
        branches: rest,
        qtyByBranch: q,
        excludedByImportAt: Date.now(),
        excludedByImportBranch: branch
      },
      kind: 'detach'
    };
  }
  const isDuplicate = !!keeperId;
  return {
    id: it.id,
    data: {
      status: isDuplicate ? 'merged' : 'import_excluded',
      mergedInto: isDuplicate ? keeperId : '',
      mergedAt: isDuplicate ? Date.now() : null,
      qtyByBranch: q,
      branches: [IMPORT_EXCLUDED_TAG],
      excludedByImportAt: Date.now(),
      excludedByImportBranch: branch
    },
    kind: isDuplicate ? 'duplicate-hide' : 'missing-hide'
  };
}

function planBranchCatalogReplace(items, rows, mapping, branch, allBranchList, options){
  options = options || {};
  const useFileQty = !!options.useFileQty;
  items = items || []; rows = rows || []; mapping = mapping || {};
  const errors = [];
  if(!mapping.name) errors.push('لازم تحدد عمود اسم الصنف');
  if(!mapping.barcode) errors.push('لازم تحدد عمود الباركود/SKU للاستبدال الكامل');
  if(!mapping.price) errors.push('لازم تحدد عمود سعر البيع');

  const fileByCode = {};
  const duplicateFileCodes = [];
  let invalidRows = 0;
  rows.forEach(function(row){
    const name = mapping.name ? String(row[mapping.name] || '').trim() : '';
    const code = mapping.barcode ? String(row[mapping.barcode] || '').trim() : '';
    if(!name || !code){ invalidRows++; return; }
    if(fileByCode[code]){ if(duplicateFileCodes.indexOf(code) < 0) duplicateFileCodes.push(code); return; }
    fileByCode[code] = row;
  });
  if(invalidRows){
    errors.push('فيه ' + invalidRows + ' صف ناقص اسم أو باركود — لازم يتصلح قبل الاستبدال الكامل');
  }
  if(duplicateFileCodes.length){
    errors.push('الملف نفسه فيه باركود مكرر: ' + duplicateFileCodes.slice(0,10).join('، '));
  }

  const knownBranches = _branchReplaceKnownBranches(items, allBranchList, branch);
  const visible = items.filter(function(it){ return _branchReplaceVisible(it, branch); });
  const byCode = {};
  const allByCode = {};
  visible.forEach(function(it){
    const code = String(it.barcode || '').trim();
    if(code) (byCode[code] = byCode[code] || []).push(it);
  });
  items.forEach(function(it){
    if(!it) return;
    const code = String(it.barcode || '').trim();
    if(code) (allByCode[code] = allByCode[code] || []).push(it);
  });

  const keeperWrites = [];
  const cleanupWrites = [];
  const keptIds = {};
  const fileCodes = Object.keys(fileByCode);
  const stats = {
    fileItems:fileCodes.length, invalidRows:invalidRows, keptQty:0, newItems:0,
    updatedItems:0, duplicatesClosed:0, removedMissing:0, untouchedExisting:0, detachedOtherBranches:0,
    usedFileQty:useFileQty, openingQtyTotal:0
  };

  fileCodes.forEach(function(code){
    const group = byCode[code] || [];
    const systemBranchQty = group.reduce(function(n,it){
      return n + (Number(((it || {}).qtyByBranch || {})[branch]) || 0);
    }, 0);
    const row = fileByCode[code];
    const fileQty = mapping.quantity ? Math.max(0, parseInt(row[mapping.quantity]) || 0) : 0;
    const branchQty = useFileQty ? fileQty : systemBranchQty;
    stats.keptQty += branchQty;
    if(useFileQty) stats.openingQtyTotal += branchQty;

    // ممنوع نختار مستند مشترك كـkeeper لأن تغيير الاسم/السعر عليه هيغيّر فرع تاني.
    const candidates = allByCode[code] || [];
    const exact = candidates.filter(function(it){ return it.id === code + '__' + branch && _branchReplaceSafeTarget(it, branch); })[0];
    const oldCatalog = candidates.filter(function(it){ return it.id === code + '__' + branch + '__catalog' && _branchReplaceSafeTarget(it, branch); })[0];
    const exclusive = candidates.filter(function(it){ return _branchReplaceSafeTarget(it, branch); })[0];
    const safeExisting = exact || oldCatalog || exclusive || null;
    const keeperId = _branchReplaceDocId(code, branch, items, safeExisting);
    keptIds[keeperId] = 1;

    const oldQtyMap = safeExisting ? Object.assign({}, safeExisting.qtyByBranch || {}) : {};
    oldQtyMap[branch] = branchQty; // ⭐ الكمية من السيستم الحالي فقط — لا قراءة لكمية الملف.
    const data = {
      name: String(row[mapping.name] || '').trim(),
      barcode: code,
      price: mapping.price ? (parseFloat(row[mapping.price]) || 0) : 0,
      cost: mapping.cost ? (parseFloat(row[mapping.cost]) || 0) : 0,
      supplier: mapping.supplier ? (row[mapping.supplier] || '') : '',
      minStock: mapping.minStock ? Math.max(0, parseInt(row[mapping.minStock]) || 0) : 0,
      department: mapping.department ? (row[mapping.department] || '') : '',
      status: 'active', importedFrom: 'quickbooks',
      branches: [branch], qtyByBranch: oldQtyMap,
      openingStockImportedBranch: useFileQty ? branch : (safeExisting && safeExisting.openingStockImportedBranch || ''),
      openingStockImportedAtMs: useFileQty ? Date.now() : (safeExisting && safeExisting.openingStockImportedAtMs || 0),
      updatedAt: new Date()
    };
    keeperWrites.push({ id:keeperId, data:data, code:code, existing:!!safeExisting });
    if(safeExisting) stats.updatedItems++; else stats.newItems++;

    group.forEach(function(it){
      if(it.id === keeperId) return;
      const cw = _branchReplaceCleanup(it, branch, keeperId, knownBranches);
      cleanupWrites.push(cw);
      if(cw.kind === 'detach') stats.detachedOtherBranches++; else stats.duplicatesClosed++;
    });
  });

  // ⭐ السياسة النهائية: أي صنف مش موجود في الملف لا نلمسه نهائيًا.
  // نعدّه للمعاينة فقط؛ لا qty ولا branches ولا اسم/سعر يتغيروا.
  visible.forEach(function(it){
    if(keptIds[it.id]) return;
    const code = String(it.barcode || '').trim();
    if(code && fileByCode[code]) return; // نسخة مكررة لنفس كود موجود في الملف — اتعاملنا معاها فوق
    stats.untouchedExisting++;
  });

  // dedupe نفس المستند لو دخل cleanup من مسارين (حماية إضافية)
  const cleanSeen = {};
  const clean = cleanupWrites.filter(function(w){
    if(!w || !w.id || cleanSeen[w.id] || keptIds[w.id]) return false;
    cleanSeen[w.id] = 1; return true;
  });

  return {
    ok: errors.length === 0,
    errors: errors,
    duplicateFileCodes: duplicateFileCodes,
    keeperWrites: keeperWrites,
    cleanupWrites: clean,
    stats: stats
  };
}
if(typeof window !== 'undefined') window.planBranchCatalogReplace = planBranchCatalogReplace;

async function detectInitialBranchSetup(branch){
  const result = { pristine:false, hasSales:false, hasStockMoves:false, hasQty:false, alreadyInitialized:false };
  const invSnap = await db.collection(TEST_INVENTORY).get();
  const items = invSnap.docs.map(function(d){ return Object.assign({id:d.id}, d.data()||{}); });
  result.hasQty = items.some(function(it){ return Number(((it||{}).qtyByBranch||{})[branch]) !== 0; });
  result.alreadyInitialized = items.some(function(it){ return it && it.openingStockImportedBranch === branch; });
  try{
    const s = await db.collection(TEST_SALES).where('branch','==',branch).limit(1).get();
    result.hasSales = !!(s && !s.empty);
  }catch(e){ result.hasSales = true; }
  try{
    const l = await db.collection(TEST_STOCK_LOG).where('branch','==',branch).limit(1).get();
    result.hasStockMoves = !!(l && !l.empty);
  }catch(e){ result.hasStockMoves = true; }
  result.pristine = !result.hasSales && !result.hasStockMoves && !result.hasQty && !result.alreadyInitialized;
  return result;
}
if(typeof window !== 'undefined') window.detectInitialBranchSetup = detectInitialBranchSetup;

async function runBranchCatalogReplace(rows, mapping, branch, allBranchList, onProgress, options){
  // نقرأ Firestore مباشرة لحظة التنفيذ — مش allInventory الكاش — عشان نحافظ على أحدث كمية فعلية.
  options = options || {};
  if(options.useFileQty){
    const freshState = await detectInitialBranchSetup(branch);
    if(!freshState.pristine) throw new Error('الفرع بدأ عليه حركة فعلية بالفعل — مش آمن ناخد كمية الملف كرصد افتتاحي.');
  }
  const snap = await db.collection(TEST_INVENTORY).get();
  const items = snap.docs.map(function(d){ return Object.assign({ id:d.id }, d.data() || {}); });
  const plan = planBranchCatalogReplace(items, rows, mapping, branch, allBranchList, options);
  if(!plan.ok) throw new Error(plan.errors.join('\n'));

  const FV = firebase.firestore.FieldValue;
  const writes = [];
  plan.keeperWrites.forEach(function(w){
    const d = Object.assign({}, w.data, { updatedAt: FV.serverTimestamp() });
    writes.push({ id:w.id, data:d });
  });
  plan.cleanupWrites.forEach(function(w){
    const d = Object.assign({}, w.data, { updatedAt: FV.serverTimestamp() });
    writes.push({ id:w.id, data:d });
  });

  const CHUNK = 350;
  for(let i=0; i<writes.length; i+=CHUNK){
    const batch = db.batch();
    writes.slice(i,i+CHUNK).forEach(function(w){
      batch.set(db.collection(TEST_INVENTORY).doc(w.id), w.data, { merge:true });
    });
    await batch.commit();
    if(typeof onProgress === 'function') onProgress(Math.min(i+CHUNK,writes.length), writes.length);
  }
  if(typeof _logActivity === 'function') _logActivity('inventory_branch_catalog_replace', {
    branch:branch, fileItems:plan.stats.fileItems, newItems:plan.stats.newItems,
    updatedItems:plan.stats.updatedItems, duplicatesClosed:plan.stats.duplicatesClosed,
    removedMissing:plan.stats.removedMissing, detachedOtherBranches:plan.stats.detachedOtherBranches,
    usedFileQty:plan.stats.usedFileQty, openingQtyTotal:plan.stats.openingQtyTotal
  });
  if(plan.stats.usedFileQty && typeof _logActivity === 'function') _logActivity('inventory_opening_stock_import', {
    branch:branch, items:plan.stats.fileItems, openingQtyTotal:plan.stats.openingQtyTotal
  });
  return plan.stats;
}
if(typeof window !== 'undefined') window.runBranchCatalogReplace = runBranchCatalogReplace;

async function runBranchCatalogReplaceFlow(){
  if(!hasPerm('canEditInventory')){ showToast('مفيش صلاحية', 'err'); return; }
  if(importTab !== 'inventory'){ showToast('تحديث المخزون للفرع فقط', 'err'); return; }
  const mapping = {};
  for(const t of IMPORT_TARGETS.inventory){
    const el = document.getElementById('map_'+t.key);
    mapping[t.key] = el ? el.value : '';
  }
  if(!mapping.name || !mapping.barcode || !mapping.price){
    showToast('لازم تحدد الاسم + الباركود/SKU + سعر البيع', 'err'); return;
  }
  let branchList = [];
  try{ branchList = JSON.parse(localStorage.getItem('pos_branch_list') || '[]'); }catch(e){}

  let setupState;
  try{ setupState = await detectInitialBranchSetup(currentBranch); }
  catch(e){ setupState = {pristine:false}; }
  const useFileQty = !!(setupState.pristine && mapping.quantity);
  if(setupState.pristine && !mapping.quantity){
    showToast('الفرع جديد — حدد عمود الكمية عشان نعمل الرصيد الافتتاحي', 'err'); return;
  }

  // Dry-run من الكاش للمعاينة فقط. التنفيذ نفسه يعيد القراءة من Firestore.
  const preview = planBranchCatalogReplace(allInventory || [], importParsedRows, mapping, currentBranch, branchList, {useFileQty:useFileQty});
  if(!preview.ok){
    await askConfirm({ waitSec:0, okText:'تمام', cancelText:'إغلاق', title:'الملف محتاج يتظبط', message:preview.errors.join('\n') });
    return;
  }
  const ok = await askConfirm({
    icon:'⬆️', danger:false, waitSec:3, okText:'حدّث وأضف',
    title:'تحديث/إضافة أصناف ' + currentBranch + ' من الملف',
    message:
      'هنحدّث ونضيف الأصناف الموجودة في الملف داخل ' + currentBranch + ' فقط.\n\n'
      + '📄 أصناف الملف: ' + preview.stats.fileItems + '\n'
      + '🔁 أصناف موجودة هيتحدث اسمها/سعرها: ' + preview.stats.updatedItems + '\n'
      + '➕ أصناف جديدة: ' + preview.stats.newItems + (useFileQty ? ' (هتاخد كمية الملف)' : ' (هتبدأ بكمية 0)') + '\n'
      + '🧹 نسخ مكررة لنفس أكواد الملف هتتوحد: ' + preview.stats.duplicatesClosed + '\n'
      + '✅ أصناف موجودة في الفرع ومش في الملف هتفضل زي ما هي: ' + preview.stats.untouchedExisting + '\n\n'
      + (useFileQty
          ? '🆕 الفرع جديد: كمية الملف هتتسجل كرصد افتتاحي بإجمالي ' + preview.stats.openingQtyTotal + ' قطعة.\n'
          : '⭐ الفرع مستخدم بالفعل: عمود الكمية في الملف بيتجاهل، والسيستم يحتفظ بكمياته الحالية.\n')
      + '🏬 أي فرع تاني لا الاسم ولا السعر ولا الكمية عنده هيتغيروا.\n'
      + '🛡️ مفيش حذف للأصناف اللي مش موجودة في الملف.'
  });
  if(!ok){ showToast('اتلغى'); return; }

  const resultBox = document.getElementById('importResult');
  resultBox.textContent = 'جارٍ تحديث أصناف الفرع...';
  try{
    const stats = await runBranchCatalogReplace(importParsedRows, mapping, currentBranch, branchList, function(n,total){
      resultBox.textContent = 'جارٍ التحديث... ' + n + '/' + total;
    }, {useFileQty:useFileQty});
    resultBox.innerHTML = '✅ تم تحديث/إضافة أصناف ' + currentBranch
      + '<div style="font-size:12px;color:var(--muted);margin-top:5px;">'
      + '🔁 ' + stats.updatedItems + ' تحديث · ➕ ' + stats.newItems + ' جديد'
      + (stats.usedFileQty ? ' · 🆕 الرصيد الافتتاحي: ' + stats.openingQtyTotal + ' قطعة من الملف' : ' · الكميات الحالية محفوظة')
      + ' · 🧹 ' + stats.duplicatesClosed + ' نسخة مكررة اتقفلت'
      + ' · ✅ ' + stats.untouchedExisting + ' صنف مش في الملف فضل زي ما هو'
      + '</div>';
    showToast('تم تحديث/إضافة أصناف الفرع ✅');
    if(typeof loadInventory === 'function') await loadInventory();
  }catch(e){
    console.error('branch catalog replace', e);
    resultBox.textContent = '⚠️ فشل التحديث: ' + (e && e.message ? e.message : e);
    showToast('فشل تحديث الأصناف', 'err');
  }
}
if(typeof window !== 'undefined') window.runBranchCatalogReplaceFlow = runBranchCatalogReplaceFlow;

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
      يبدأ بكمية صفر — كمية الملف لا تدخل المخزون نهائيًا.

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

    // ⭐ السياسة النهائية: الأصناف الغائبة عن الملف لا تُلمس.
    let zeroed = 0;

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
    // v391: QuickBooks exports may contain the same phone more than once.
    // Build one deterministic write per normalized phone before creating Firestore batches.
    const customerByPhone = new Map();
    rows.forEach(row=>{
      let phone = (row[mapping.phone]||'').replace(/\D/g,'');
      if(phone.length === 12 && phone.slice(0,2) === '20') phone = '0' + phone.slice(2);
      if(phone.length === 10 && phone[0] === '1') phone = '0' + phone;
      if(!phone || phone.length < 8){ failed++; return; }
      const name = mapping.name ? (row[mapping.name]||'').trim() : '';
      const incoming = {
        phone, name,
        points: mapping.points ? (parseFloat(row[mapping.points]) || 0) : 0,
        branch: currentBranch, importedFrom: 'quickbooks'
      };
      if(hasNotes && (row['Notes']||'').trim()) incoming.notes = row['Notes'].trim();
      if(hasEmail && (row['EMail']||'').trim()) incoming.email = row['EMail'].trim();
      const prev = customerByPhone.get(phone);
      if(prev){
        // Keep useful values from either duplicate row; do not double-count points.
        if(!prev.name && incoming.name) prev.name = incoming.name;
        if(!prev.notes && incoming.notes) prev.notes = incoming.notes;
        if(!prev.email && incoming.email) prev.email = incoming.email;
        if(!prev.points && incoming.points) prev.points = incoming.points;
      }else customerByPhone.set(phone, incoming);
    });
    const customerWrites = Array.from(customerByPhone.values());
    const duplicateRows = rows.length - failed - customerWrites.length;
    try{
      for(let i=0; i<customerWrites.length; i+=CHUNK){
        const batch = db.batch();
        const slice = customerWrites.slice(i, i+CHUNK);
        slice.forEach(data=>{
          data.loyaltyCode = codeFromPhone(data.phone);
          data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          batch.set(db.collection(TEST_CUSTOMERS).doc(data.phone), data, { merge:true });
          done++;
        });
        await batch.commit();
        resultBox.textContent = `جارٍ الاستيراد... ${Math.min(i+CHUNK, customerWrites.length)}/${customerWrites.length}`;
      }
    }catch(e){ resultBox.innerHTML = '⚠️ حصل خطأ أثناء الاستيراد: '+e.message; showToast('فشل الاستيراد', 'err'); return; }
    resultBox.innerHTML = `✅ اتستورد ${done} عميل — كل رقم مرة واحدة${duplicateRows ? ` · ${duplicateRows} صف مكرر اتدمج` : ''}${failed ? ` · ${failed} صف اتخطّى (رقم فاضي أو غلط)` : ''}`;
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
