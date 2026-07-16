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
        صدّر الملف من QuickBooks (Excel أو CSV)، احفظه كـ CSV لو كان Excel (File → Save As → CSV)، وارفعه هنا.
      </p>
      <input type="file" id="importFileInput" accept=".csv" style="margin-bottom:10px;">
      <div id="importPreviewWrap"></div>
    </div>`;
  document.getElementById('importFileInput').addEventListener('change', handleImportFile);
}

function handleImportFile(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev)=>{
    try{
      parseCSV(ev.target.result);
      renderImportMapping();
    }catch(err){ showToast('تعذر قراءة الملف: ' + err.message, 'err'); }
  };
  reader.readAsText(file, 'UTF-8');
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
    <button onclick="runImport()" style="width:100%; padding:13px; border-radius:10px; border:none; background:var(--plus); color:#062; font-weight:800; cursor:pointer;">استورد ${importParsedRows.length} صف الآن</button>
    <div id="importResult" style="margin-top:10px; font-size:12px;"></div>`;

  // تعبئة التخمين المبدئي بعد ما الـselect يترسم
  targets.forEach(t=>{
    const guess = guessMap(t.key);
    if(guess) document.getElementById('map_'+t.key).value = guess;
  });
}

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
    const rows = importParsedRows;
    const CHUNK = 400;   // حد Firestore للدفعة 500
    try{
      for(let i=0; i<rows.length; i+=CHUNK){
        const batch = db.batch();
        const slice = rows.slice(i, i+CHUNK);
        slice.forEach(row=>{
          const name = (row[mapping.name]||'').trim();
          if(!name){ failed++; return; }
          const barcode = mapping.barcode ? String(row[mapping.barcode]||'').trim() : '';
          const data = {
            name, barcode,
            price: mapping.price ? (parseFloat(row[mapping.price]) || 0) : 0,
            cost: mapping.cost ? (parseFloat(row[mapping.cost]) || 0) : 0,
            quantity: mapping.quantity ? Math.max(0, parseInt(row[mapping.quantity]) || 0) : 0,  // السالب يبقى صفر
            supplier: mapping.supplier ? (row[mapping.supplier]||'') : '',
            minStock: mapping.minStock ? (Math.max(0, parseInt(row[mapping.minStock])||0)) : 0,
            department: mapping.department ? (row[mapping.department]||'') : '',
            status:'active', branch: currentBranch, importedFrom:'quickbooks',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          };
          // الباركود = ID الوثيقة عشان لو استوردت تاني يتحدّث بدل ما يتكرر
          const ref = barcode ? db.collection(TEST_INVENTORY).doc(barcode) : db.collection(TEST_INVENTORY).doc();
          batch.set(ref, data, { merge:true });
          done++;
        });
        await batch.commit();
        resultBox.textContent = `جارٍ الاستيراد... ${Math.min(i+CHUNK, rows.length)}/${rows.length}`;
      }
    }catch(e){ resultBox.innerHTML = '⚠️ حصل خطأ أثناء الاستيراد: '+e.message; showToast('فشل الاستيراد', 'err'); return; }
    resultBox.innerHTML = `✅ اتستورد ${done} صنف${failed ? ` — ${failed} صف اتخطّى (اسم فاضي)` : ''}`;
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
