// ⚠️ ملف مُقسّم من app.js — جزء من نظام POS. الترتيب في index.html مهم:
// pos-core.js ← pos-admin.js ← pos-reports.js ← pos-sale.js ← app.js

// ---------------- Search / suggestions ----------------
const searchBar = document.getElementById('searchBar');
searchBar.addEventListener('input', ()=>{
  const q = searchBar.value.trim().toLowerCase();
  const box = document.getElementById('suggestBox');
  box.innerHTML = '';
  if(!q){ return; }
  // 🧷 حزام أمان نسخ الملفات: وقت التحديث ممكن ملف يتحمّل جديد وملف قديم للحظة —
  // لو دالة التطبيع لسه موصلتش، بنرجع للبحث الحرفي بدل ما البحث يموت خالص
  const _sm = (typeof searchMatch === 'function') ? searchMatch
            : (h, qq)=> String(h||'').toLowerCase().includes(String(qq||'').toLowerCase());
  const _bp = (typeof barcodePrefix === 'function') ? barcodePrefix
            : (bc, qq)=> String(bc||'').toLowerCase().startsWith(String(qq||'').toLowerCase());
  // المنتجات المخفية أو المعلّمة "نافدة" مش بتظهر في البحث خالص
  const matches = allInventory.filter(it =>
    it.status !== 'hidden' && it.status !== 'outofstock' &&
    inMyBranch(it) &&                                   // 🏬 بضاعة فرعي والمشتركة بس
    (_sm(it.name, q) || _bp(it.barcode, q))   // 🔎 اسم بالتطبيع، كود بالبداية
  // 🥇 المطابقة التامة الأول، وبعدها الأقصر (33 ← 330 ← 331...) — مش بترتيب المخزون العشوائي
  // ⚠️ الترتيب **قبل** القص: كان بيقص أول 10 وبعدين يرتبهم، فالمطابقة التامة
  // نفسها ممكن تكون اتقصت وهي أصلًا اللي المفروض تطلع أول واحدة.
  ).sort((a,b)=>{
    const qa = String(a.barcode||''), qb = String(b.barcode||'');
    return ((qb===q)-(qa===q)) || (qa.length - qb.length);
  }).slice(0,10);
  matches.forEach(it=>{
    const row = document.createElement('div');
    row.className = 'sugg-row';
    // 🚫 سياسة المحل: المخزون مايتذكرش قدام الموظفين — الملاحظة دي للإدارة بس
    const stockNote = (typeof hasPerm==='function' && hasPerm('canViewStock') && branchQty(it) <= 0) ? ' <span style="color:var(--minus); font-size:11px;">(نافد)</span>' : '';
    row.innerHTML = `<span>${it.name}${stockNote} <span style="color:#aaa; font-size:11px; direction:ltr;">${it.barcode||''}</span></span><span style="color:var(--muted)">${it.price} جنيه</span>`;
    row.onclick = ()=>{ addToCart(it); searchBar.value=''; box.innerHTML=''; };
    box.appendChild(row);
  });
});
// ============================================================
// ✍️ askText — بديل prompt()
// ⚠️ Electron مش بيدعم window.prompt خالص: النداء بيفشل بصمت
// فالشاشة بتقف من غير أي رسالة. ده كان سبب وقوف الاستيراد والخصم.
// الدالة دي نافذة عادية بتشتغل في المتصفح وفي الـ exe.
// ============================================================
// ✅ askConfirm — تأكيد بزرارين من غير كتابة
// السبب: خانة الكتابة في الـ exe التركيز بيضيع منها، والكاشير مش بيعرف يكتب.
// بدل ما نلغي الحماية خالص، الزرار الخطر بيتقفل شوية عشان محدش يدوس بالعادة.
function askConfirm(opts){
  const o = opts || {};
  const waitSec = (o.waitSec == null) ? 3 : o.waitSec;
  return new Promise(function(resolve){
    const old = document.getElementById('askConfirmOverlay');
    if(old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'askConfirmOverlay';
    ov.style.cssText = 'position:fixed; inset:0; z-index:13500; background:rgba(0,0,0,.84);'
      + 'display:flex; align-items:center; justify-content:center; padding:20px;';
    ov.innerHTML = '<div style="background:var(--panel); border:2.5px solid '
      + (o.danger ? '#e5484d' : 'var(--border)') + '; border-radius:16px; padding:24px; max-width:460px; width:100%;">'
      + (o.icon ? ('<div style="font-size:38px; text-align:center; line-height:1; margin-bottom:8px;">' + o.icon + '</div>') : '')
      + '<div style="font-weight:900; font-size:16px; margin-bottom:10px; text-align:center;">' + (o.title || '') + '</div>'
      + (o.message ? ('<div style="color:var(--muted); font-size:13px; line-height:1.9; margin-bottom:16px;'
          + ' white-space:pre-line; text-align:center;">' + o.message + '</div>') : '')
      + '<button id="askConfirmOk" ' + (waitSec > 0 ? 'disabled' : '') + ' style="width:100%; padding:15px;'
      + ' border:none; border-radius:12px; font-family:\'Cairo\'; font-weight:900; font-size:15px;'
      + (waitSec > 0 ? ' background:#4b1c1e; color:#ffffff66; cursor:not-allowed;'
                     : (' background:' + (o.danger ? 'linear-gradient(#dc2626,#b91c1c)' : 'linear-gradient(#16a34a,#15803d)')
                        + '; color:#fff; cursor:pointer;'))
      + '">' + (waitSec > 0 ? ('استنى… (<span id="askConfirmCount">' + waitSec + '</span>)') : (o.okText || 'تمام')) + '</button>'
      + '<button id="askConfirmCancel" style="margin-top:9px; width:100%; padding:12px; border-radius:10px;'
      + ' background:var(--panel2); border:1px solid var(--border); color:var(--muted);'
      + ' font-family:\'Cairo\'; font-weight:700; font-size:13.5px; cursor:pointer;">'
      + (o.cancelText || 'إلغاء') + '</button></div>';
    document.body.appendChild(ov);
    const ok = ov.querySelector('#askConfirmOk');
    const done = function(v){ clearInterval(tick); ov.remove(); resolve(v); };
    let left = waitSec;
    const tick = waitSec > 0 ? setInterval(function(){
      left--;
      const c = ov.querySelector('#askConfirmCount');
      if(left > 0){ if(c) c.textContent = left; return; }
      clearInterval(tick);
      ok.disabled = false;
      ok.style.background = o.danger ? 'linear-gradient(#dc2626,#b91c1c)' : 'linear-gradient(#16a34a,#15803d)';
      ok.style.color = '#fff';
      ok.style.cursor = 'pointer';
      ok.textContent = o.okText || 'تمام';
    }, 1000) : null;
    ok.addEventListener('click', function(){ if(!ok.disabled) done(true); });
    ov.querySelector('#askConfirmCancel').addEventListener('click', function(){ done(false); });
  });
}
window.askConfirm = askConfirm;

function askText(opts){
  const o = opts || {};
  return new Promise(function(resolve){
    const old = document.getElementById('askTextOverlay');
    if(old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'askTextOverlay';
    ov.style.cssText = 'position:fixed; inset:0; z-index:13000; background:rgba(0,0,0,.8);'
      + 'display:flex; align-items:center; justify-content:center; padding:20px;';
    ov.innerHTML = '<div style="background:var(--panel); border:2px solid ' + (o.danger ? '#e5484d' : 'var(--border)')
      + '; border-radius:16px; padding:22px; max-width:440px; width:100%;">'
      + '<div style="font-weight:900; font-size:15px; margin-bottom:8px;">' + (o.title || '') + '</div>'
      + (o.message ? '<div style="color:var(--muted); font-size:12.5px; line-height:1.8; margin-bottom:12px; white-space:pre-line;">' + o.message + '</div>' : '')
      + '<input id="askTextInput" type="' + (o.type || 'text') + '" value="' + (o.value == null ? '' : String(o.value)) + '"'
      + (o.placeholder ? ' placeholder="' + o.placeholder + '"' : '')
      + ' style="width:100%; padding:13px; border-radius:10px; border:1.5px solid var(--border);'
      + ' background:var(--panel2); color:var(--text); font-family:\'Cairo\'; font-weight:800;'
      + ' font-size:17px; text-align:center;">'
      + '<div style="display:flex; gap:8px; margin-top:14px;">'
      + '<button id="askTextOk" style="flex:2; padding:13px; border:none; border-radius:10px;'
      + ' background:' + (o.danger ? 'linear-gradient(#dc2626,#b91c1c)' : 'linear-gradient(#16a34a,#15803d)')
      + '; color:#fff; font-family:\'Cairo\'; font-weight:900; font-size:14px; cursor:pointer;">'
      + (o.okText || 'تمام') + '</button>'
      + '<button id="askTextCancel" style="flex:1; padding:13px; border-radius:10px; background:var(--panel2);'
      + ' border:1px solid var(--border); color:var(--muted); font-family:\'Cairo\'; font-weight:700;'
      + ' font-size:13px; cursor:pointer;">إلغاء</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    const inp = ov.querySelector('#askTextInput');
    const done = function(val){ ov.remove(); resolve(val); };
    ov.querySelector('#askTextOk').addEventListener('click', function(){ done(inp.value); });
    ov.querySelector('#askTextCancel').addEventListener('click', function(){ done(null); });
    inp.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); done(inp.value); }
      if(e.key === 'Escape'){ e.preventDefault(); done(null); }
    });
    setTimeout(function(){ try{ inp.focus(); inp.select(); }catch(e){} }, 60);
  });
}
window.askText = askText;

// ============================================================
// ============================================================
// 👤 اختيار البياعة — قايمة أو كود
// أي بيعة من غير بياعة مبتتحسبش لحد (بقرار المالك) — أحسن من إنها
// تروح لواحدة غلط زي ما كان بيحصل مع حساب الكاشير.
// ============================================================
function sellerPaint(){
  const sel = document.getElementById('sellerEmployeeSelect');
  const code = document.getElementById('sellerCodeInput');
  const nm = document.getElementById('sellerName');
  const on = !!(sel && sel.value);
  const purple = '#8B5CF6', purpleBg = '#f5f3ff';
  [sel, code].forEach(function(el){
    if(!el) return;
    el.style.borderColor = on ? purple : '#d8dce4';
    el.style.background  = on ? purpleBg : '#fff';
    el.style.boxShadow   = on ? '0 0 0 3px rgba(139,92,246,.15)' : 'none';
  });
  if(nm){
    if(on){
      const opt = sel.options[sel.selectedIndex];
      nm.textContent = '✓ ' + ((opt && opt.dataset.name) || '');
      nm.style.color = purple;
    } else {
      nm.textContent = 'من غير بياعة — مش هتتحسب لحد';
      nm.style.color = '#9ca3af';
    }
  }
}
window.sellerPaint = sellerPaint;

// الكود بيختار من القايمة
function sellerByCode(v){
  const sel = document.getElementById('sellerEmployeeSelect');
  if(!sel) return;
  const code = String(v || '').trim();
  if(!code){ sel.value = ''; sellerPaint(); return; }
  const hit = Array.from(sel.options).find(function(o){
    return o.dataset && o.dataset.code && String(o.dataset.code) === code;
  });
  if(hit){ sel.value = hit.value; }
  sellerPaint();
}
window.sellerByCode = sellerByCode;

// ربط الأحداث أول ما الصفحة تجهز
(function(){
  function wire(){
    const sel = document.getElementById('sellerEmployeeSelect');
    const code = document.getElementById('sellerCodeInput');
    if(!sel || !code) return false;
    if(sel._wired) return true;
    sel._wired = true;
    sel.addEventListener('change', function(){
      // لما يختار من القايمة، الكود يتملّى لوحده
      const opt = sel.options[sel.selectedIndex];
      code.value = (opt && opt.dataset && opt.dataset.code) || '';
      sellerPaint();
    });
    code.addEventListener('input', function(){ sellerByCode(code.value); });
    code.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); focusSearchBar(); }
    });
    sellerPaint();
    return true;
  }
  if(!wire()){
    const t = setInterval(function(){ if(wire()) clearInterval(t); }, 400);
    setTimeout(function(){ clearInterval(t); }, 15000);
  }
})();

// ⌨️ ترجمة حروف الكيبورد العربي
// قارئ الباركود بيشتغل زي الكيبورد: لو لغة ويندوز عربي، الحرف F
// بيطلع "ب" وهكذا. بدل ما الكاشير يغيّر اللغة كل مرة، بنترجم إحنا.
// ============================================================
const AR_KEYS = {
  // الصف الأول
  'ض':'q','ص':'w','ث':'e','ق':'r','ف':'t','غ':'y','ع':'u','ه':'i','خ':'o','ح':'p','ج':'[','د':']',
  // الصف التاني
  'ش':'a','س':'s','ي':'d','ب':'f','ل':'g','ا':'h','ت':'j','ن':'k','م':'l','ك':';','ط':"'",
  // الصف التالت — ندعم الحروف المركبة سواء المتصفح رجّعها حرفين أو ligature واحدة
  'ئ':'z','ء':'x','ؤ':'c','ر':'v','لا':'b','ﻻ':'b','ى':'n','ة':'m','و':',','ز':'.','ظ':'/',
  // مع Shift — مهم جدًا للسكانر لأن أغلب الأكواد الإنجليزية مطبوعة Uppercase.
  // Windows Arabic 101 يطلع رموز/تشكيل بدل الحروف الكبيرة (مثال Shift+F => '[').
  'َ':'Q','ً':'W','ُ':'E','ٌ':'R','لإ':'T','ﻹ':'T','إ':'Y','`':'U','÷':'I','×':'O','؛':'P',
  'ِ':'A','ٍ':'S',']':'D','[':'F','لأ':'G','ﻷ':'G','أ':'H','ـ':'J','،':'K','/':'L',
  '~':'Z','ْ':'X','}':'C','{':'V','لآ':'B','ﻵ':'B','آ':'N',"'":'M','ذ':'`'
};
function fixArabicKeyboard(text){
  const t = String(text == null ? '' : text);
  let out = '';
  for(let i = 0; i < t.length; i++){
    // "لا" وأخواتها حرفين لازم نجربهم الأول
    const two = t.substr(i, 2);
    if(AR_KEYS[two] !== undefined){ out += AR_KEYS[two]; i++; continue; }
    const ch = t[i];
    if(AR_KEYS[ch] !== undefined){ out += AR_KEYS[ch]; continue; }
    // 🔢 أرقام هندية/فارسية → إنجليزي.
    // 🔴 الخريطة كانت حروف بس (52 مدخل، ولا رقم). وكارت الموظف شكله
    //    EC + 10 خانة فيها أرقام — فلو ويندوز طلّع ٢٣٤ بدل 234، الحروف
    //    تتصلّح والأرقام تفضل عربية، الشكل ميطابقش والكارت ميظهرش.
    //    ده اللي بيبان «كلام غريب»: نص متصلّح ونص لأ.
    const cp = ch.charCodeAt(0);
    if(cp >= 0x0660 && cp <= 0x0669){ out += String(cp - 0x0660); continue; }  // ٠-٩
    if(cp >= 0x06F0 && cp <= 0x06F9){ out += String(cp - 0x06F0); continue; }  // ۰-۹ فارسي
    out += ch;
  }
  return out;
}
window.fixArabicKeyboard = fixArabicKeyboard;

// بيرجّع الكود بعد الترجمة لو الأصلي فيه عربي والمترجم بيطابق شكل معروف
function normalizeScan(code){
  const raw = String(code || '').trim();
  if(!/[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(raw)) return raw;      // مفيش عربي/Arabic presentation forms = زي ما هو
  const fixed = fixArabicKeyboard(raw).toUpperCase();
  // بنقبل الترجمة بس لو طلعت شكل كود معروف — عشان منخربش بحث بالاسم العربي
  if(/^FT[A-Z0-9-]+$/.test(fixed)) return fixed;      // كود فاتورة
  if(/^ECH\d+$/.test(fixed) || /^GLW\d+$/.test(fixed)) return fixed;   // كود عضوية
  if(/^EC[A-Z2-9]{10}$/.test(fixed)) return fixed;    // كارت موظف
  return raw;
}
window.normalizeScan = normalizeScan;

// 🔍 البحث بالباركود مع التسامح مع الأصفار البادئة
// السبب: ليبلات QuickBooks القديمة مطبوعة بأصفار (000948) بينما الباركود
// المستورد رقم مجرد (948). بنجرب المطابقة التامة الأول، وبعدين بعد شيل الأصفار.
function stripZeros(v){
  const t = String(v == null ? '' : v).trim();
  return /^\d+$/.test(t) ? t.replace(/^0+/, '') || '0' : t;
}
// 🏬 الصنف ده يخص فرعي؟
//   • branches فيها فرعي = صنف مخصوص بفرعي
//   • مفيش branches خالص = صنف مشترك بين كل الفروع
function inMyBranch(it){
  if(!it) return false;
  if(!Array.isArray(it.branches) || !it.branches.length) return true;   // مشترك
  return it.branches.indexOf(currentBranch) >= 0;
}
function isBranchOwned(it){
  return !!(it && Array.isArray(it.branches) && it.branches.indexOf(currentBranch) >= 0);
}
window.inMyBranch = inMyBranch;

// 🔴 الباج: علامة `outofstock` كانت بتخلي الصنف **مش موجود خالص** في البحث،
//    فالكود الصح بيرد «لا يوجد صنف بهذا الكود» — رسالة غلط ومضللة.
//    وده بيناقض سياسة المحل المكتوبة في نفس الملف: «البيع مسموح دايمًا حتى
//    لو المخزون مايكفيش». يعني قطعة موجودة في إيد الكاشير مكانش ينفع تتباع
//    لمجرد إن الرقم في النظام وصل صفر.
//    الصح: العلامة معناها «ميظهرش في الاقتراحات» — مش «مش موجود».
//    لما الكاشير يكتب/يمسح الكود **بالظبط**، الصنف بييجي مع تنبيه.
function findByBarcode(code, opts){
  const includeOut = !!(opts && opts.includeOut);
  const usable = (it)=> it && it.status !== 'hidden'
    && (includeOut || it.status !== 'outofstock') && inMyBranch(it);
  const raw = String(code || '').trim();
  // 🔑 أولوية صنف الفرع على الصنف المشترك — لو الفرع عنده نسخته الخاصة بسعرها واسمها،
  // هي اللي تتاخد، مش النسخة العامة القديمة.
  const pick = (list)=>{
    if(!list.length) return null;
    const own = list.filter(isBranchOwned);
    if(own.length === 1) return own[0];
    if(own.length > 1) return null;            // غموض جوه فرعي → مش هنخمّن
    return list.length === 1 ? list[0] : null;
  };
  // (١) مطابقة تامة
  const exact = allInventory.filter(it => it.barcode === raw && usable(it));
  const hit = pick(exact);
  if(hit) return hit;
  // (٢) بعد شيل الأصفار — للأرقام بس عشان منعملش تطابق وهمي
  const norm = stripZeros(raw);
  if(!/^\d+$/.test(norm)) return null;
  return pick(allInventory.filter(it => usable(it) && stripZeros(it.barcode) === norm));
}
window.findByBarcode = findByBarcode;
window.stripZeros = stripZeros;

searchBar.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    // ⌨️ لو الكيبورد كان عربي، بنرجّع الكود لأصله قبل أي مطابقة
    const code = normalizeScan(searchBar.value.trim());
    if(!code) return;
    // ↩️ R + رقم موبايل → مرتجع بفواتير العميل (مثال: R01012345678)
    if(/^[rR]\s*01\d{9}$/.test(code.replace(/\s/g,''))){
      const rphone = code.replace(/\D/g,'');
      searchBar.value=''; document.getElementById('suggestBox').innerHTML='';
      window._lastReturnMethod = 'phone';
      if(typeof window.returnByPhone === 'function') window.returnByPhone(rphone);
      return;
    }
    // 📱 رقم موبايل عميل (11 رقم يبدأ بـ01) → نسجّله كعميل الفاتورة (قبل أي بحث منتج)
    const _digits = code.replace(/\D/g,'');
    if(/^01\d{9}$/.test(_digits) && _digits.length===11){
      const ph = document.getElementById('customerPhone');
      if(ph){ ph.value = _digits; }
      if(typeof refreshCustomerInfo === 'function') refreshCustomerInfo();
      searchBar.value=''; document.getElementById('suggestBox').innerHTML='';
      showToast('📱 اتسجّل رقم العميل في الفاتورة', 'ok');
      return;
    }
    // المطابقة العادية الأول، وبعدين نفس البحث بس شامل الأصناف المعلّمة نافد
    let match = findByBarcode(code);
    let outFlagged = false;
    if(!match){
      const m2 = findByBarcode(code, { includeOut: true });
      if(m2){ match = m2; outFlagged = true; }
    }
    if(match){
      if(outFlagged){
        showToast('⛔ "' + match.name + '" متعلّم نافد في النظام — اتضاف للفاتورة برضه. راجع الجرد.', 'err');
      }
      // 🔫 المسدس أحيانًا بيقرا نفس الباركود مرتين في جزء من الثانية (ضغطة طويلة
      // أو وضع القراءة التلقائية) → الكمية بتزيد لوحدها. إعادة مسح بشرية حقيقية
      // لنفس القطعة بتاخد أكتر من نص ثانية بكتير، فالتكرار الأسرع من كده بيتتجاهل.
      const _nowScan = Date.now();
      if(window._lastScanCode === code && (_nowScan - (window._lastScanAt || 0)) < 500){
        window._lastScanAt = _nowScan;
        searchBar.value = '';
        document.getElementById('suggestBox').innerHTML = '';
        showToast('⚠️ نفس الباركود اتقرا مرتين ورا بعض — اتحسبت مرة واحدة. لو قصدك قطعتين دوس +', 'err');
        return;
      }
      window._lastScanCode = code; window._lastScanAt = _nowScan;
      addToCart(match);
      searchBar.value = '';
      document.getElementById('suggestBox').innerHTML = '';
    }else if(/^EC[A-Z2-9]{10}$/.test(code.toUpperCase())){
      // 🎫 كارت موظف → تفعيل وضع شراء الموظف بالخصم
      activateStaffPurchase(code.toUpperCase());
      searchBar.value=''; document.getElementById('suggestBox').innerHTML='';
    }else if(/^ECH/i.test(code) || /^GLW/i.test(code)){
      // كود عضوية عميل (echarpe ECH أو Glow GLW) → نربط العميل بالفاتورة
      resolveLoyaltyScan(code.toUpperCase()).then(found=>{
        if(found){ searchBar.value=''; document.getElementById('suggestBox').innerHTML=''; }
        else showToast('كود العضوية مش موجود', 'err');
      });
    }else if(/^GC/i.test(code)){
      /* 🎁 كود كارت هدية — الكاشير كانت بتكتبه في البحث وتلاقي
         «لا يوجد صنف بهذا الكود»، لأن الكارت **مش منتج**: هو رصيد
         بيتحوّل لحساب العميلة. المسار كان موجود في زرار جوّه
         شاشة العميلة بس، ومحدش يعرفه.
         ⚠️ لازم يكون فيه عميلة متحددة الأول: الكارت بيتحوّل رصيد
            **على حساب**، ومن غير رقم مفيش مكان يروح له. */
      const _ph = (document.getElementById('customerPhone') || {}).value || '';
      if(!_ph.trim()){
        showToast('🎁 كارت هدية — اكتبي رقم العميلة الأول عشان الرصيد يروح لحسابها', 'err');
      }else if(typeof claimGiftForCustomer === 'function'){
        claimGiftForCustomer(code.toUpperCase().replace(/\s/g, ''));
      }else{
        showToast('استلام الكارت من شاشة العميلة', 'err');
      }
      searchBar.value=''; document.getElementById('suggestBox').innerHTML='';
    }else if(/^FT/i.test(code)){
      // كود فاتورة → نفتحها للمرتجع
      openInvoiceForReturn(code.toUpperCase());
      searchBar.value=''; document.getElementById('suggestBox').innerHTML='';
    }else{
      showToast('لا يوجد صنف بهذا الكود', 'err');
    }
  }
});

// 💳🧠 Smart Payment Lock v346
// قبل نتيجة الماكينة: ممنوع تعديل السلة لأننا لا نملك Cancel مؤكّد للطلب على الـterminal.
// بعد الموافقة: التعديل مسموح **بقرار صريح من الموظف** ويدخل Adjustment Mode؛
// الفرق لا يختفي: يظهر فورًا ويتسجل كمستحق رد مرتبط بنفس عملية الكارت.
let _cardAdjustmentMode = false;
let _cardAdjustmentApprovedAmount = 0;
function cardCartEditBlockReason(){
  if(!_cardMoneyAtRiskAt || _cardAdjustmentMode) return null;
  const approved = Math.abs(cardApprovedSum(cardLegs || []));
  if(approved > 0.005){
    return 'approved';
  }
  return 'pending';
}
function cardAdjustmentMessage(){
  const approved = Math.abs(cardApprovedSum(cardLegs || []));
  const totalNow = Math.abs(cartTotal());
  const diff = +(approved - totalNow).toFixed(2);
  if(diff > 0.005) return 'اتسحب ' + approved.toFixed(2) + ' ج.م · الإجمالي الجديد ' + totalNow.toFixed(2) + ' ج.م · لازم نرجّع ' + diff.toFixed(2) + ' ج.م';
  if(diff < -0.005) return 'اتسحب ' + approved.toFixed(2) + ' ج.م · الإجمالي الجديد ' + totalNow.toFixed(2) + ' ج.م · باقي تحصيل ' + Math.abs(diff).toFixed(2) + ' ج.م';
  return 'التعديل بنفس القيمة — مفيش فرق مالي';
}
function blockCartEditAfterCard(){
  const why = cardCartEditBlockReason();
  if(!why) return false;
  if(why === 'pending') {
    if(typeof paymobPending !== 'undefined' && paymobPending && paymobPending.timedOut){
      showToast('⚠️ محاولة فيزا قديمة من غير نتيجة مؤكدة — راجع الماكينة: APPROVED = حفظ وطباعة، مفيش طلب حي = مسح المدفوعات. مش محتاج تقفل السيستم.', 'err');
    } else {
      showToast('⏳ طلب الفيزا لسه نتيجته مش مؤكدة — استنى قبول/رفض العملية الأول عشان مايتسحبش مبلغ قديم', 'err');
    }
    return true;
  }
  const approved = Math.abs(cardApprovedSum(cardLegs || []));
  const ok = (typeof confirm === 'function') ? confirm(
    '✅ تم سحب ' + approved.toFixed(2) + ' ج.م من العميلة بالفعل.\n\n'
    + 'لو هتعدلي السلة دلوقتي، السيستم هيحسب الفرق تلقائيًا ويسجله كمستحق رد/تحصيل.\n'
    + 'تكملي تعديل السلة؟'
  ) : false;
  if(!ok) return true;
  _cardAdjustmentMode = true;
  _cardAdjustmentApprovedAmount = approved;
  showToast('✏️ وضع تعديل بعد الدفع شغال — أي فرق هيظهر ويتسجل تلقائيًا', 'warn');
  try{ if(typeof _logActivity === 'function') _logActivity('card_adjustment_started', { charged: approved, totalBeforeEdit: Math.abs(cartTotal()) }); }catch(e){}
  return false;
}
if(typeof window !== 'undefined'){
  window.cardCartEditBlockReason = cardCartEditBlockReason;
  window.blockCartEditAfterCard = blockCartEditAfterCard;
}

function addToCart(item){
  if(blockCartEditAfterCard()) return;
  // 🕵️ v296: مع أول قطعة بيتولد **معرّف سلة** بيتحط على كل حدث بيحصل
  //    فيها. لما الفاتورة تتحفظ بيتسجل حدث ربط (sid ← رقم الفاتورة)،
  //    فسجل النشاط في Office بيقدر يقول لكل حدث الفاتورة بتاعته —
  //    وقت الحدث نفسه الفاتورة لسه مالهاش رقم أصلًا.
  if(!cart.length){ _cartFirstItemAt = Date.now(); _cartSid = _newCartSid(); }
  // البيع مسموح دايمًا حتى لو المخزون مايكفيش (الكمية تنزل بالسالب)
  // 🔑 `noSplit` مش موجودة على السطور العادية — بس السطر اللي الكاشير فصلته
  //    بإيدها (عشان تخصم على قطعة واحدة) بيتعلّم `noMerge` وبيتستثنى من الدمج،
  //    وإلا الضربة الجاية لنفس الباركود كانت هترجع تدمجهم وتلغي الفصل.
  const existing = cart.find(c => c.id === item.id && !c.isReturn && !c.noMerge);
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
  // 🎯 وبيتحدد تلقائي — عشان + و− و«تعديل» و«حذف» يشتغلوا عليه على طول
  //    من غير ما الكاشير تدوّر على صفه وتدوس عليه.
  {
    let _i = -1;
    for(let k = cart.length - 1; k >= 0; k--){
      if(cart[k] && cart[k].id === item.id && !cart[k].isReturn && !cart[k].noMerge
         && !cart[k].isRedemption && !cart[k].isRewardDiscount){ _i = k; break; }
    }
    if(_i >= 0) selectedCartIdx = _i;
  }
  renderCart();
}

let selectedCartIdx = null;
let lastAddedId = null;   // id آخر منتج اتضاف/اتزوّد في السلة — عشان نميّز صفه بلون مختلف
function _isLastAdded(c){ return !!(lastAddedId && c.id===lastAddedId && !c.isReturn && !c.isRedemption && !c.isRewardDiscount); }

// عروض الكتالوج اللي العميل فعّلها من التطبيق (بتتطبّق تلقائي على المنتج المطابق في السلة)
let custActivatedOffers = {};
function applyCustomerOffers(){
  if(cardCartEditBlockReason()) return;
  if(!custActivatedOffers || !cart.length) return;
  cart.forEach(line=>{
    if(line.isReturn || line.isRedemption || line.offerApplied || !line.barcode) return;
    const act = custActivatedOffers[line.barcode];
    if(!act) return;
    // 🛡️ فاز 3أ: النوع والقيمة والمرات والمدة من كتالوج المحل الرسمي — مش من كتابة العميل
    const off = _offerSanitize(act, _offerOfficial(_offCatalog ? _offCatalog[line.barcode] : null));
    if(!off) return;
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
  // 🛡️ إعادة الرسم بتشيل الصفوف كلها. لو الكاشير كانت بتكتب كمية في صف،
  //    الخانة بتتشال والتركيز بيروح لـbody والكتابة تقف. بنحفظ مكانها ونرجّعه.
  let _focusQty = -1, _selStart = null;
  try{
    const _a = document.activeElement;
    if(_a && _a.classList && _a.classList.contains('qn-input') && tbody && tbody.contains(_a)){
      const _tr = _a.closest('tr');
      const _m = _tr && String(_tr.getAttribute('onclick') || '').match(/selectCartRow\((\d+)\)/);
      if(_m) _focusQty = Number(_m[1]);
      _selStart = _a.selectionStart;
    }
  }catch(e){}
  if(selectedCartIdx !== null && selectedCartIdx >= cart.length) selectedCartIdx = null;
  if(cart.length === 0){
    selectedCartIdx = null;
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cart">لسه مفيش أصناف في الفاتورة</td></tr>';
  }else{
    // 🔃 الأحدث فوق — **العرض بس**. مصفوفة السلة نفسها بترتيبها الأصلي،
    //    فأرقام السطور والفاتورة المطبوعة والعكس والحسابات كلها زي ما هي،
    //    وكل زرار في الصف شايل فهرسه الحقيقي (idx) مش ترتيب العرض.
    tbody.innerHTML = cart.map((c, idx)=> ({ c, idx })).reverse().map(({ c, idx })=>`
      <tr class="${idx===selectedCartIdx?'sel ':''}${c.isReturn?'ret':''}${_isLastAdded(c)?' just-added':''}" onclick="selectCartRow(${idx})" style="${c.offerApplied?'background:linear-gradient(90deg,#ffeef5,#fff); box-shadow:inset 4px 0 0 #e27a97;':''}">
        <td>${idx+1}</td>
        <td class="item-name">${_isLastAdded(c)?'<span class="last-badge">آخر ✅</span> ':''}${c.offerApplied?'🎁 ':''}${c.name}${c.isReturn?' ↩️ (مرتجع)':''}${c.edited?` <span style="color:#f59e0b; font-size:10px; font-weight:800;">✏️ متعدّل${c.editPct?` −${c.editPct}%`:''}</span>`:''}${c.offerApplied?' <span style="color:#c0397a; font-size:10px; font-weight:800;">🎁 عرض مفعّل</span>':''}${c.discountName?` <span style="color:#1c7a2e; font-size:10px;">🏷️ ${c.discountName}</span>`:''}${c.barcode?`<div class="cart-code">${c.barcode}</div>`:''}</td>
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
  // نرجّع التركيز لخانة الكمية اللي كانت مفتوحة
  if(_focusQty >= 0){
    try{
      const _tr = tbody.querySelector('tr[onclick="selectCartRow(' + _focusQty + ')"]');
      const _in = _tr && _tr.querySelector('.qn-input');
      if(_in){
        _in.focus();
        if(_selStart != null) try{ _in.setSelectionRange(_selStart, _selStart); }catch(e){}
      }
    }catch(e){}
  }
  const total = cart.reduce((s,c)=> s + c.price*c.qty, 0);
  document.getElementById('cartTotal').textContent = total.toFixed(2);
  // 🔄 فاتورة تبديل: فيها مرتجع وبيع مع بعض — بنوضّح للكاشير المطلوب بالظبط
  (function(){
    let box = document.getElementById('exchangeNote');
    const hasRet  = cart.some(function(c){ return c.isReturn; });
    const hasSale = cart.some(function(c){ return !c.isReturn && !c.isRedemption; });
    if(!hasRet || !hasSale){ if(box) box.style.display = 'none'; return; }
    if(!box){
      box = document.createElement('div');
      box.id = 'exchangeNote';
      box.style.cssText = 'margin:6px 0; padding:8px 10px; border-radius:10px; font-size:12.5px;'
        + 'font-weight:800; text-align:center; background:#2a2010; border:1px solid #f59e0b66; color:#f5c451;';
      const anchor = document.getElementById('cartTotal');
      const row = anchor && anchor.closest ? anchor.closest('.t-row') : null;
      if(row && row.parentNode) row.parentNode.insertBefore(box, row);
      else return;
    }
    box.style.display = 'block';
    const retSum  = cart.filter(function(c){ return c.isReturn; })
                        .reduce(function(n,c){ return n + Math.abs((c.price||0)*(c.qty||0)); }, 0);
    const saleSum = cart.filter(function(c){ return !c.isReturn && !c.isRedemption; })
                        .reduce(function(n,c){ return n + ((c.price||0)*(c.qty||0)); }, 0);
    const diff = +(saleSum - retSum).toFixed(2);
    box.textContent = '🔄 تبديل — مرتجع ' + retSum.toFixed(2) + ' · جديد ' + saleSum.toFixed(2) + ' → '
      + (diff > 0 ? ('تاخد من العميل ' + diff.toFixed(2) + ' ج.م')
        : diff < 0 ? ('ترجّع للعميل ' + Math.abs(diff).toFixed(2) + ' ج.م')
        : 'مفيش فرق — تبديل متساوي');
  })();
  const _pieces = cart.filter(c=>!c.isRedemption).reduce((s,c)=> s + (c.isReturn?-c.qty:c.qty), 0);
  const _icEl = document.getElementById('cartItemCount'); if(_icEl) _icEl.textContent = _pieces;
  refreshCustomerActionUI();
  updatePaySummary();
  renderHoldButtons();
  try{ _saleDraftSave(); }catch(e){}
  try{ if(typeof boostRenderStrip === 'function') boostRenderStrip(); }catch(e){}
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

// ============================================================
// 💾 v365 — مسودة البيع تعيش بعد Logout / Refresh / قفل البرنامج
// ------------------------------------------------------------
// بنحفظ الأصناف فقط حسب الفرع. حالة الدفع/Paymob لا تُحفظ نهائيًا، عشان
// فاتورة قديمة ما تورّثش Pending أو كارت Approved للعميل اللي بعدها.
// ============================================================
const SALE_DRAFT_KEY_PREFIX = 'pos_sale_draft_v1_';
function _saleDraftKey(branch){
  return SALE_DRAFT_KEY_PREFIX + encodeURIComponent(String(branch || '').trim() || 'default');
}
function _saleDraftSave(){
  try{
    if(typeof currentBranch === 'undefined' || !currentBranch) return;
    const key = _saleDraftKey(currentBranch);
    if(!Array.isArray(cart) || !cart.length){ localStorage.removeItem(key); return; }
    localStorage.setItem(key, JSON.stringify({
      v:1, branch:String(currentBranch), savedAt:Date.now(),
      firstItemAt:(typeof _cartFirstItemAt !== 'undefined' ? _cartFirstItemAt : null),
      items:cart
    }));
  }catch(e){ console.warn('sale draft save', e && e.message); }
}
function _saleDraftClear(branch){
  try{ localStorage.removeItem(_saleDraftKey(branch || currentBranch)); }
  catch(e){ console.warn('sale draft clear', e && e.message); }
}
function _saleDraftRestore(){
  try{
    if(typeof currentBranch === 'undefined' || !currentBranch || (Array.isArray(cart) && cart.length)) return false;
    const raw = localStorage.getItem(_saleDraftKey(currentBranch));
    if(!raw) return false;
    const d = JSON.parse(raw);
    if(!d || !Array.isArray(d.items) || !d.items.length){ _saleDraftClear(); return false; }
    const items = d.items.filter(function(x){
      return x && typeof x === 'object' && Number(x.qty) > 0 && isFinite(Number(x.price));
    });
    if(!items.length){ _saleDraftClear(); return false; }
    cart = items;
    selectedCartIdx = null;
    if(typeof _cartFirstItemAt !== 'undefined') _cartFirstItemAt = Number(d.firstItemAt) || Date.now();
    if(typeof _cartSid !== 'undefined') _cartSid = (typeof _newCartSid === 'function') ? _newCartSid() : null;
    // مهم: نرجّع الأصناف فقط — ولا أي حالة دفع قديمة.
    try{ if(typeof clearCardSaleCompleteState === 'function') clearCardSaleCompleteState(); }catch(e){}
    try{ if(typeof paymobReset === 'function') paymobReset(); }catch(e){}
    try{ if(typeof resetPaymentUI === 'function') resetPaymentUI(); }catch(e){}
    try{ clearCustomerContext(); }catch(e){}
    return true;
  }catch(e){ console.warn('sale draft restore', e && e.message); return false; }
}
function _saleDraftBeforeLogout(){
  _saleDraftSave();
  // لا نحمل حالة دفع للموظف التالي. الأصناف محفوظة في localStorage وترجع بعد الدخول.
  try{ if(typeof clearCardSaleCompleteState === 'function') clearCardSaleCompleteState(); }catch(e){}
  try{ if(typeof paymobReset === 'function') paymobReset(); }catch(e){}
  try{ if(typeof resetPaymentUI === 'function') resetPaymentUI(); }catch(e){}
}
if(typeof window !== 'undefined'){
  window.saveSaleDraft = _saleDraftSave;
  window.restoreSaleDraft = _saleDraftRestore;
  window.clearSaleDraft = _saleDraftClear;
  window.prepareSaleDraftForLogout = _saleDraftBeforeLogout;
}

// ============ هولد سريع بمكانين (محلي، من غير خروج من الشاشة) ============
let holdSlots = [null, null];

// بيصفّر سياق العميل المرتبط بالفاتورة (استبدال نقط / مكافأة / عروض مفعّلة)
// مهم: عشان ما يتسربش لفاتورة تانية بعد Hold أو بدء فاتورة جديدة
function clearCustomerContext(){
  custExists = false; custHasApp = false;
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
    firstItemAt: _cartFirstItemAt,
    cartSid: _cartSid,
    pendingRedemption: (typeof pendingRedemption !== 'undefined') ? pendingRedemption : null,
    appliedReward:     (typeof appliedReward     !== 'undefined') ? appliedReward     : null
  };
}
function clearSaleState(){
  try{ _saleDraftClear(); }catch(e){}
  _cartFirstItemAt = null;
  _cartSid = null;               // 🕵️ سلة جديدة = معرّف جديد (مش بيتوارث)
  _cardFirstApprovedAt = null;   // 🕵️ وسحب الكارت القديم مالوش علاقة بالسلة الجديدة
  _cardMoneyAtRiskAt = null;
  _cartEditsAfterCard = [];
  _cardAdjustmentMode = false;
  _cardAdjustmentApprovedAmount = 0;
  // 🔒 أي متابعة دفع بالكارت من العملية اللي فاتت لازم تتقفل مع السلة الجديدة
  try{ paymobReset(); }catch(e){}
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
  _cartFirstItemAt = s.firstItemAt || Date.now();
  _cartSid = s.cartSid || _newCartSid();   // 🕵️ نفس القصة قبل وبعد التعليق
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
  if(blockCartEditAfterCard()) return;
  const c = cart[idx]; if(!c) return;
  let nq = parseInt(val);
  if(isNaN(nq) || nq < 1){ if(nq === 0){ cartRemove(idx); return; } nq = 1; }
  c.qty = nq;   // مسموح بأي كمية حتى لو أكبر من المخزون
  renderCart();
}

// + / − للكمية في سطر السلة
function cartQty(idx, delta){
  if(blockCartEditAfterCard()) return;
  const c = cart[idx]; if(!c) return;
  let nq = (c.qty||1) + delta;
  if(nq < 1){ cartRemove(idx); return; }
  c.qty = nq;   // مسموح بأي كمية حتى لو أكبر من المخزون
  renderCart();
}
// مسح صنف من السلة
function cartRemove(idx){
  if(blockCartEditAfterCard()) return;
  if(idx < 0 || idx >= cart.length) return;
  const _rm = cart[idx];
  _logActivity('item_removed', { name:_rm.name||'', qty:_rm.qty||1, price:_rm.price||0, cartCountAfter: cart.length-1 });
  // 🕵️ v297: اتشال **بعد** ما الكارت اتسحب؟ يبقى ده سبب الفرق —
  //    بيتحفظ عشان حدث السحب الزيادة يقول ليه بدل ما المالك يدوّر
  _trackEditAfterCard('شيل', _rm.name || '', _rm.qty || 1,
    (Number(_rm.price) || 0) * (Number(_rm.qty) || 1));
  cart.splice(idx, 1);
  if(selectedCartIdx === idx) selectedCartIdx = null;
  else if(selectedCartIdx !== null && selectedCartIdx > idx) selectedCartIdx--;
  // 🔴 باج التركيز (AI_HANDOFF §0، مسار ١): زرار 🗑️ بيبقى activeElement، و
  // renderCart بتمسح tbody.innerHTML كله فيتشال ويقع الفوكس على body. لازم
  // ننقل الفوكس لـsearchBar *قبل* ما renderCart تمسح الزرار، مش بعدها —
  // عشان لو Electron محتفظ بفوكس النظام (نوع أ)، ما يقعش أصلًا.
  if(searchBar) searchBar.focus();
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
// ✂️ زرار «افصل قطعة» — للسطر اللي كميته أكتر من واحدة
function qbxSplitSel(){
  if(!requireSelection()) return;
  splitCartLine(selectedCartIdx);
}
if(typeof window !== 'undefined') window.qbxSplitSel = qbxSplitSel;

function qbxReturnSel(){
  if(!hasPerm('canRefund')){ showToast('المرتجع للمشرف/المدير بس — مش مسموح للكاشير', 'err'); return; }
  if(!requireSelection()) return;
  returnCartItem(selectedCartIdx);
}

// ============ مرتجع بمسح باركود الفاتورة ============
let returnInvoiceData = null;
const RETURN_WINDOW_DAYS = 14;

// ============ مرتجع برقم موبايل العميل ============
window.returnByPhone = async function(rawPhone){
  if(!hasPerm('canRefund')){ showToast('المرتجع للمشرف/المدير بس', 'err'); return; }
  const clean = String(rawPhone||'').replace(/\D/g,'');
  if(!/^01\d{9}$/.test(clean)){ showToast('رقم موبايل غير صحيح', 'err'); return; }

  showScreen('saleScreen');
  document.getElementById('returnInvoiceModal').classList.add('active');
  document.getElementById('returnInvoiceBody').innerHTML = '<div class="empty-cart">بندوّر على فواتير العميل...</div>';

  try{
    const snap = await db.collection(TEST_SALES).where('customerPhone','==', clean).get();
    if(snap.empty){
      document.getElementById('returnInvoiceBody').innerHTML = '<div class="empty-cart">مفيش فواتير للرقم ده 🤔<br><span style="font-size:11px;">'+clean+'</span></div>';
      return;
    }
    // نفلتر حسب السلسلة (echarpe/glow) ونرتّب من الأحدث
    const hereIsGlow = GLOW_BRANCHES.includes(currentBranch);
    let invoices = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .filter(s=> GLOW_BRANCHES.includes(s.branch) === hereIsGlow)
      .sort((a,b)=> (b.ts||0) - (a.ts||0));

    if(invoices.length === 0){
      document.getElementById('returnInvoiceBody').innerHTML = '<div class="empty-cart">مفيش فواتير من نفس السلسلة للرقم ده</div>';
      return;
    }

    // نعرض قايمة الفواتير — يدوس على الفاتورة اللي عايز يرجّع منها
    document.getElementById('returnInvoiceBody').innerHTML = `
      <div style="font-size:13px; color:var(--muted); margin-bottom:8px;">📱 ${clean} — ${invoices.length} فاتورة · اختار الفاتورة:</div>
      <div style="max-height:360px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">
        ${invoices.map(s=>{
          const d = new Date(s.ts||Date.now());
          const dateTxt = d.toLocaleDateString('ar-EG',{day:'2-digit',month:'short',year:'numeric'}) + ' · ' + d.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
          const itemCount = (s.items||[]).length;
          const total = Number(s.total||0).toFixed(2);
          return `<button onclick="openInvoiceForReturn('${(s.invoiceCode||'').replace(/'/g,"")}')" style="text-align:right; background:var(--panel2); border:1px solid var(--border); border-radius:12px; padding:12px; cursor:pointer; font-family:'Cairo';">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:800; color:var(--text); font-size:13px;">${s.invoiceCode||'—'}</span>
              <span style="font-weight:800; color:var(--accent);">${total} ج</span>
            </div>
            <div style="font-size:11px; color:var(--muted); margin-top:4px;">${dateTxt} · ${itemCount} صنف · ${s.branch||''}</div>
          </button>`;
        }).join('')}
      </div>`;
  }catch(e){
    document.getElementById('returnInvoiceBody').innerHTML = '<div class="empty-cart">تعذر جلب الفواتير: '+e.message+'</div>';
  }
};

// 📋 نسخ رقم العملية — الكاشير محتاجه في لوحة Paymob
function copyTxnId(id){
  const done = ()=> showToast('📋 رقم العملية اتنسخ: ' + id, 'ok');
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(String(id)).then(done).catch(fallback);
    } else fallback();
  }catch(e){ fallback(); }
  function fallback(){
    // متصفحات قديمة أو صفحة مش https — بنستخدم الطريقة اليدوية
    try{
      const ta = document.createElement('textarea');
      ta.value = String(id); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      done();
    }catch(e2){ showToast('انسخه يدوي: ' + id, 'err'); }
  }
}
window.copyTxnId = copyTxnId;

async function openInvoiceForReturn(code){
  if(!hasPerm('canRefund')){ showToast('المرتجع للمشرف/المدير بس', 'err'); return; }
  if(!window._lastReturnMethod) window._lastReturnMethod = 'invoice';
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

    // 🏬 الفاتورة من نفس الفرع ولا من فرع تاني؟
    const sameBranch = (s.branch || '') === currentBranch;
    const branchBanner = sameBranch
      ? `<div style="background:#eafaf0; border:1.5px solid #86efac; color:#15803d; padding:8px 10px; border-radius:8px; font-size:12.5px; font-weight:800; margin-bottom:8px;">
           🏬 اتشرت من نفس الفرع (${currentBranch})
         </div>`
      : `<div style="background:#fff6e6; border:1.5px solid var(--warn); color:#b45309; padding:9px 11px; border-radius:8px; font-size:12.5px; font-weight:800; margin-bottom:8px;">
           🏬 اتشرت من فرع تاني: <span style="font-size:14px;">${s.branch || 'غير معروف'}</span>
           <div style="font-weight:600; font-size:11.5px; margin-top:3px;">راجع سياسة المرتجع بين الفروع قبل ما تكمّل.</div>
         </div>`;

    // 💳 بيانات الدفع بالكارت — لازمة عشان تعمل المرتجع من Paymob
    // 💳💳 الفاتورة ممكن تكون اتدفعت بكارتين — كل عملية بترجع لوحدها من Paymob،
    // فبنعرض العمليتين بمبلغ كل واحدة عشان الكاشير ما يرجّعش المبلغ كله على كارت واحد
    const _cts = (s.cardTxns && s.cardTxns.length) ? s.cardTxns : (s.cardTxn ? [s.cardTxn] : []);
    const cardBanner = _cts.length ? `
      <div style="background:#0f1a2e; border:1.5px solid #3b82f6; border-radius:10px; padding:10px 12px; margin-bottom:8px; color:#dbeafe;">
        <div style="font-weight:800; font-size:12.5px; margin-bottom:6px;">💳 اتدفعت بالكارت — المرتجع من Paymob${_cts.length > 1 ? ` (${_cts.length} كروت)` : ''}</div>
        ${_cts.map(function(ct, i){ return `
        <div style="${i ? 'margin-top:8px; border-top:1px dashed #3b82f688; padding-top:7px;' : ''}">
          ${_cts.length > 1 ? `<div style="font-weight:800; font-size:12px; margin-bottom:3px;">كارت ${ct.seq || (i+1)}${ct.amount != null ? ' — ' + Math.abs(ct.amount).toFixed(2) + ' ج.م' : ''}</div>` : ''}
          <div dir="ltr" style="font-family:monospace; font-size:13px; text-align:left; line-height:1.7;">
            ${ct.scheme || 'CARD'} **** ${ct.last4 || '----'}<br>
            ${ct.approvalCode ? ('APPROVAL: ' + ct.approvalCode + '<br>') : ''}
            <b style="font-size:14.5px;">TXN ID: ${ct.transactionId || '—'}</b>
          </div>
          ${ct.transactionId ? `<button onclick="copyTxnId('${String(ct.transactionId).replace(/'/g,'')}')"
            style="margin-top:8px; width:100%; padding:8px; border-radius:8px; border:1px solid #3b82f6;
                   background:#1e3a8a; color:#fff; font-family:'Cairo'; font-weight:800; font-size:12.5px; cursor:pointer;">
            📋 انسخ رقم العملية${_cts.length > 1 ? ' ' + (ct.seq || (i+1)) : ''}</button>` : ''}
        </div>`; }).join('')}
      </div>` : '';

    const alreadyReversed = s.reversed ? '<div style="background:#fdecec; color:#b91c1c; padding:8px 10px; border-radius:8px; font-size:12px; margin-bottom:8px;">⚠️ الفاتورة دي اترجعت بالكامل قبل كده.</div>' : '';
    returnInvoiceData._saleMs = saleMs;
    const sameDayBanner = _isSameLocalDay(saleMs) ? '<div style="background:#fff6e6; border:1.5px solid var(--warn); color:#b45309; padding:8px 10px; border-radius:8px; font-size:12px; font-weight:800; margin-bottom:8px;">⏰ الفاتورة دي متباعة النهارده — المرتجع هيتسجل كملاحظة يوم-بيوم.</div>' : '';

    const _returnedMap = s.returnedQty || {};
    const itemsHtml = (s.items||[]).filter(it=> !it.isRedemption).map((it, i)=>{
      const isRet = it.isReturn || (it.price||0) < 0;
      const _key = (it.barcode||'') + '|' + it.name;
      const alreadyRet = _returnedMap[_key] || 0;              // اترجّع قبل كده (جلسات سابقة)
      const remaining = Math.max(0, (it.qty||0) - alreadyRet); // المتاح للمرتجع
      const fullyReturned = !isRet && remaining <= 0;
      let btn;
      if(isRet){ btn = '<span style="color:var(--muted); font-size:11px;">—</span>'; }
      else if(fullyReturned){ btn = '<span style="background:#fdecec; color:#b91c1c; font-size:11px; font-weight:800; padding:4px 9px; border-radius:8px;">✓ اترجّع كله</span>'; }
      else{ btn = `<button onclick="returnItemFromInvoice(${i})" style="flex-shrink:0; padding:8px 12px; border-radius:8px; border:none; background:var(--minus); color:#fff; font-weight:800; font-size:12px; cursor:pointer;">↩️ ارجع ده</button>`; }
      const retNote = alreadyRet > 0 && !isRet ? ` <span style="color:#b91c1c; font-size:10px;">(اترجّع ${alreadyRet} قبل كده)</span>` : '';
      return `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--border);">
        <div style="min-width:0;">
          <div style="font-weight:700; font-size:13px;">${it.name}${isRet?' <span style="color:var(--warn); font-size:10px;">(مرتجع أصلاً)</span>':''}${retNote}</div>
          <div style="color:var(--muted); font-size:11px;">${it.qty} × ${Math.abs(it.price||0).toFixed(2)} ج.م${remaining<it.qty&&!isRet?` · متاح للمرتجع: ${remaining}`:''}${it.barcode?' · كود '+it.barcode:''}</div>
        </div>
        ${btn}
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
      ${branchBanner}
      ${cardBanner}
      ${customerBanner}
      ${alreadyReversed}
      ${sameDayBanner}
      <div style="font-weight:800; font-size:13px; margin-bottom:4px;">اختار الصنف اللي عايز ترجعه:</div>
      ${itemsHtml || '<div class="empty-cart">مفيش أصناف</div>'}
      <div style="color:var(--muted); font-size:11px; margin-top:8px;">هيتحط في الفاتورة الحالية كمرتجع (بالأحمر) — كمّل واختار طريقة رجوع الفلوس.</div>`;
  }catch(e){
    document.getElementById('returnInvoiceBody').innerHTML = '<div class="empty-cart">تعذّر التحميل: '+e.message+'</div>';
  }
}


// >>> RETCAP_START
// ↩️ سقف المرتجع: مينفعش ترجّع من الصنف أكتر من اللي اتباع فعلًا في الفاتورة دي.
// الدوسات المتكررة بتزوّد الكمية واحدة واحدة في نفس السطر لحد السقف — مش سطور جديدة.
function _retFindLine(cartArr, invoiceNo, it){
  return (cartArr||[]).find(c => c.isReturn && c.fromInvoice === (invoiceNo||'') &&
    (c.barcode||'') === (it.barcode||'') && c.name === it.name) || null;
}
function _retCanAdd(currentQty, soldQty){ return (currentQty||0) < (soldQty||0); }
// نفس اليوم المحلي؟ (لتنبيه "الفاتورة دي متباعة النهارده")
function _isSameLocalDay(ms, now){
  if(!ms) return false;
  // 🕕 المقارنة بيوم الشغل مش باليوم التقويمي — فاتورة الساعة 2 الفجر
  // لسه "النهاردة" طول ما إحنا في نفس يوم الشغل.
  if(typeof isSameBizDay === 'function') return isSameBizDay(ms, now);
  const a = new Date(ms), b = new Date(now || Date.now());
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
// <<< RETCAP_END

// يضيف صنف من الفاتورة الممسوحة كمرتجع (بالسالب) في السلة الحالية
function returnItemFromInvoice(itemIdx){
  if(blockCartEditAfterCard()) return;
  if(!returnInvoiceData) return;
  const items = returnInvoiceData.items || [];
  const it = items[itemIdx];
  if(!it){ return; }
  const invoiceNo = returnInvoiceData.invoiceNo || '';
  const soldQty = it.qty || 1;
  // اللي اترجّع في جلسات سابقة من الصنف ده
  const _key = (it.barcode||'') + '|' + it.name;
  const prevReturned = (returnInvoiceData.returnedQty || {})[_key] || 0;
  /* ============================================================
     🎁🔴 كارت الهدية **ممنوع** يترجّع من مسار المرتجع العادي
     ------------------------------------------------------------
     الباج اللي المالك شافه: مرتجع سطر الكارت كان بيرجّع الفلوس
     كاش **والكارت القديم يفضل شغّال بقيمته** — يعني نفس الفلوس
     طلعت مرتين: مرة كاش للعميلة، ومرة رصيد في إيد أي حد معاه
     الكود. ولو الكود اتصرف خلاص، الخسارة مضاعفة.
     ⚠️ الكارت مش بضاعة: قيمته **دين علينا** لحد ما يتصرف، وإلغاؤه
        لازم يحصل على السيرفر (الدوال بس بتكتب في `gift_cards`).
        لحد ما دالة الإلغاء تتنشر، المسار ده مقفول صراحةً — والمنع
        أرخص بكتير من فلوس بتطلع مرتين.
     ============================================================ */
  if(it && (it.isGiftCard || it.giftCardId || /كارت هدية/.test(String(it.name || '')))){
    showToast('⛔ كارت الهدية مايترجعش من هنا — لازم يتلغي من سجل الكروت الأول', 'err');
    if(typeof _logActivity === 'function'){
      try{ _logActivity('gift_card_return_blocked', {
        invoiceNo: invoiceNo, cardId: it.giftCardId || '', value: Math.abs(Number(it.price) || 0)
      }); }catch(e){}
    }
    return;
  }

  const availableToReturn = Math.max(0, soldQty - prevReturned);
  // ↩️ السقف: (اللي في السلة دلوقتي + اللي اترجّع قبل كده) لازم ميعدّيش المتباع
  const line = _retFindLine(cart, invoiceNo, it);
  const currentQty = line ? (line.qty || 0) : 0;
  if((currentQty + prevReturned) >= soldQty){
    if(prevReturned > 0){ showToast('⛔ "'+it.name+'" اترجّع كله قبل كده ('+prevReturned+' من '+soldQty+')', 'err'); }
    else{ showToast('⛔ وصلت للحد الأقصى — المتباع من "'+it.name+'" '+soldQty+' بس', 'err'); }
    return;
  }
  // نوزّع أي خصم/مكافأة على مستوى الفاتورة بالنسبة → الصنف يرجع بحصته من اللي اتدفع فعلاً
  const gross = items.filter(x=> !x.isRedemption && !x.isRewardDiscount && (x.price||0) > 0)
                     .reduce((s,x)=> s + (x.price||0)*(x.qty||1), 0);
  const net = (returnInvoiceData.total != null) ? returnInvoiceData.total : gross;
  const ratio = gross > 0 ? Math.min(1, net / gross) : 1;
  const refundEach = Math.round((Math.abs(it.price||0) * ratio) * 100) / 100;
  if(line){
    line.qty += 1;
  }else{
    cart.push({
      id: it.id || '__ret__'+itemIdx,
      name: it.name,
      barcode: it.barcode || '',
      price: -refundEach,
      qty: 1,
      isReturn: true,
      fromInvoice: invoiceNo
    });
    // ⏰ أول إضافة مرتجع من فاتورة متباعة النهارده → تنبيه + تسجيل للصندوق الأسود
    if(_isSameLocalDay(returnInvoiceData._saleMs)){
      showToast('⏰ خد بالك: الفاتورة دي متباعة النهارده', 'err');
      if(typeof _logActivity === 'function') _logActivity('same_day_return', { invoiceNo, item: it.name, soldQty });
    }
  }
  renderCart();
  const cur = (line ? line.qty : 1);
  const note = ratio < 1 ? ` (بعد توزيع الخصم: ${refundEach} ج.م للقطعة)` : '';
  showToast('↩️ "'+it.name+'" مرتجع: '+cur+' من '+soldQty+note);
}

function closeReturnInvoiceModal(){
  document.getElementById('returnInvoiceModal').classList.remove('active');
  // 🔄 التبديل: بعد اختيار المرتجع، الكاشير غالبًا هيمسح منتج جديد.
  // بننضّف البار من أي بقايا (كود الفاتورة اللي اتمسح) ونرجّع التركيز —
  // من غير كده البار بيبان "معلّق" لأن الكتابة بتروح لحتة تانية.
  setTimeout(function(){
    const sb = document.getElementById('searchBar');
    const box = document.getElementById('suggestBox');
    if(box) box.innerHTML = '';
    if(sb && !document.querySelector('.modal-overlay.active')){
      try{ sb.value = ''; sb.focus(); sb.select && sb.select(); }catch(e){}
    }
  }, 60);
}
// Escape بيقفل نافذة المرتجع — مخرج سريع لو الكاشير اتلغبط
document.addEventListener('keydown', function(e){
  if(e.key !== 'Escape') return;
  const m = document.getElementById('returnInvoiceModal');
  if(m && m.classList.contains('active')) closeReturnInvoiceModal();
});

// 🔄 خلصت المرتجع وكمّل بيع — بيقفل النافذة ويجهّز الشاشة للمسح
function finishReturnAndSell(){
  const retLines = (cart||[]).filter(function(c){ return c.isReturn; });
  closeReturnInvoiceModal();
  if(!retLines.length){
    showToast('متختارش أي صنف للمرتجع — امسح المنتجات عادي', 'err');
    return;
  }
  const retTotal = retLines.reduce(function(n,c){ return n + Math.abs((c.price||0) * (c.qty||0)); }, 0);
  showToast('↩️ اترجع ' + retLines.length + ' صنف بـ ' + retTotal.toFixed(2) +
            ' ج.م — امسح المنتج الجديد دلوقتي', 'ok');
}
window.finishReturnAndSell = finishReturnAndSell;
// ✏️ تعديل صنف في السلة — شاشة واحدة فيها السعر والكمية والخصم
// (كانت 3 نوافذ ورا بعض، وده اللي كان بيعمل إحساس بالبطء)
// الصلاحية: المدير والأدمن بس.
function canEditCartItem(){
  const role = (typeof currentEmployeeRole !== 'undefined') ? currentEmployeeRole : '';
  return role === 'manager' || role === 'admin';
}
window.canEditCartItem = canEditCartItem;

function qbxEditSel(){
  if(!requireSelection()) return;
  const line = cart[selectedCartIdx];
  if(!line){ showToast('اختار صنف الأول', 'err'); return; }
  if(!canEditCartItem()){ showToast('تعديل الصنف للمدير والأدمن بس', 'err'); return; }
  if(line.isRedemption){ showToast('الصنف المستبدل بالنقط ماينفعش يتعدّل', 'err'); return; }

  const base = Math.abs(Number(line.origPrice != null ? line.origPrice : line.price) || 0);
  const cur  = Math.abs(Number(line.price) || 0);

  const old = document.getElementById('editItemOverlay');
  if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'editItemOverlay';
  ov.style.cssText = 'position:fixed; inset:0; z-index:12800; background:rgba(0,0,0,.82);'
    + 'display:flex; align-items:center; justify-content:center; padding:18px;';
  const fld = 'width:100%; padding:13px; border-radius:10px; border:1.5px solid var(--border);'
            + 'background:var(--panel2); color:var(--text); font-family:\'Cairo\'; font-weight:800;'
            + 'font-size:18px; text-align:center;';
  ov.innerHTML = `
    <div style="background:var(--panel); border:2px solid var(--border); border-radius:16px;
                padding:20px; max-width:440px; width:100%; max-height:88vh; overflow-y:auto;">
      <div style="font-weight:900; font-size:15.5px; margin-bottom:3px;">✏️ ${line.name}</div>
      <div style="color:var(--muted); font-size:11.5px; margin-bottom:14px;">
        السعر الأصلي: ${base.toFixed(2)} ج.م${line.barcode ? (' · ' + line.barcode) : ''}
      </div>

      <div style="display:flex; gap:10px; margin-bottom:11px;">
        <div style="flex:1;">
          <div style="font-size:12px; font-weight:700; margin-bottom:4px;">سعر القطعة</div>
          <input type="number" id="eiPrice" step="0.01" min="0" value="${cur.toFixed(2)}" style="${fld}">
        </div>
        <div style="width:110px;">
          <div style="font-size:12px; font-weight:700; margin-bottom:4px;">الكمية</div>
          <input type="number" id="eiQty" min="1" step="1" value="${line.qty || 1}" style="${fld}">
        </div>
      </div>

      <div style="margin-bottom:11px;">
        <div style="font-size:12px; font-weight:700; margin-bottom:4px;">خصم على الصنف ده بس (%)</div>
        <input type="number" id="eiPct" min="0" max="100" step="1" value="${line.editPct || 0}" style="${fld}">
        <div style="display:flex; gap:6px; margin-top:7px;">
          ${[0,5,10,15,20,25,50].map(p=>
            `<button type="button" data-pct="${p}" style="flex:1; padding:8px 0; border-radius:8px;
              border:1px solid var(--border); background:var(--panel2); color:var(--text);
              font-family:'Cairo'; font-weight:800; font-size:12px; cursor:pointer;">${p}%</button>`).join('')}
        </div>
      </div>

      <div id="eiPreview" style="background:var(--panel2); border:1.5px solid var(--good);
           border-radius:10px; padding:11px 13px; margin-bottom:14px; font-size:13px; font-weight:800;
           display:flex; justify-content:space-between; align-items:center;"></div>

      <div id="eiErr" style="color:var(--minus); font-size:12px; margin-bottom:8px; min-height:16px;"></div>

      <div style="display:flex; gap:8px;">
        <button id="eiSave" style="flex:2; padding:14px; border:none; border-radius:11px;
          background:linear-gradient(#16a34a,#15803d); color:#fff; font-family:'Cairo';
          font-weight:900; font-size:15px; cursor:pointer;">احفظ التعديل</button>
        <button id="eiCancel" style="flex:1; padding:14px; border-radius:11px; background:var(--panel2);
          border:1px solid var(--border); color:var(--muted); font-family:'Cairo';
          font-weight:700; font-size:13.5px; cursor:pointer;">إلغاء</button>
      </div>
    </div>`;
  document.body.appendChild(ov);

  const $p = ov.querySelector('#eiPrice'), $q = ov.querySelector('#eiQty'),
        $c = ov.querySelector('#eiPct'), $prev = ov.querySelector('#eiPreview'),
        $err = ov.querySelector('#eiErr');

  function read(){
    const price = parseFloat($p.value);
    const qty   = parseInt($q.value, 10);
    const pct   = parseFloat($c.value) || 0;
    return { price, qty, pct };
  }
  function refresh(){
    const v = read();
    let msg = '';
    if(isNaN(v.price) || v.price < 0) msg = 'سعر مش مظبوط';
    else if(isNaN(v.qty) || v.qty <= 0) msg = 'الكمية لازم تكون 1 على الأقل';
    else if(v.pct < 0 || v.pct > 100) msg = 'نسبة الخصم لازم تكون من 0 لـ100';
    $err.textContent = msg;
    if(msg){ $prev.style.display = 'none'; return null; }
    $prev.style.display = 'flex';
    const unit  = +(v.price * (1 - v.pct/100)).toFixed(2);
    const total = +(unit * v.qty).toFixed(2);
    $prev.innerHTML = '<span>' + v.qty + ' × ' + unit.toFixed(2) + ' ج.م'
      + (v.pct ? ('<span style="color:var(--warn); font-weight:700;"> (بعد خصم ' + v.pct + '%)</span>') : '')
      + '</span><span style="font-size:17px; color:var(--good);">' + total.toFixed(2) + ' ج.م</span>';
    return { unit: unit, total: total, v: v };
  }
  [$p, $q, $c].forEach(function(el){ el.addEventListener('input', refresh); });
  ov.querySelectorAll('[data-pct]').forEach(function(b){
    b.addEventListener('click', function(){ $c.value = b.dataset.pct; refresh(); });
  });
  refresh();

  const close = ()=>{ const el = document.getElementById('editItemOverlay'); if(el) el.remove(); };
  ov.querySelector('#eiCancel').addEventListener('click', close);
  ov.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){ close(); }
    if(e.key === 'Enter'){ e.preventDefault(); save(); }
  });

  function save(){
    const out = refresh();
    if(!out) return;
    if(blockCartEditAfterCard()) return;
    const v = out.v;
    if(line.origPrice == null) line.origPrice = base;   // الأصلي بيتحفظ مرة واحدة
    line.price   = line.isReturn ? -out.unit : out.unit;
    line.qty     = v.qty;
    line.edited  = true;
    line.editPct = v.pct || null;
    if(typeof _logActivity === 'function'){
      _logActivity('cart_item_edited', {
        name: line.name, barcode: line.barcode || null,
        from: base, to: out.unit, qty: v.qty, pct: v.pct || 0
      });
    }
    // 🕵️ v297: تعديل سعر/كمية بعد سحب الكارت بيقلّل الفاتورة كمان —
    //    القيمة = النقص الفعلي (لو زاد مش سبب لفرق)
    try{
      const _drop = +((base * (line.qty || 1)) - (out.unit * (v.qty || 1))).toFixed(2);
      if(_drop > 0) _trackEditAfterCard('تعديل', line.name || '', v.qty || 1, _drop);
    }catch(e){}
    close();
    renderCart();
    showToast('✏️ اتعدّل: ' + line.name + ' → ' + out.unit.toFixed(2) + ' × ' + v.qty
      + (v.pct ? (' (خصم ' + v.pct + '%)') : ''), 'ok');
  }
  ov.querySelector('#eiSave').addEventListener('click', save);
  setTimeout(function(){ try{ $p.focus(); $p.select(); }catch(e){} }, 60);
}
window.qbxEditSel = qbxEditSel;

function qbxDeleteSel(){
  if(!requireSelection()) return;
  removeFromCart(selectedCartIdx);
  selectedCartIdx = null;
  renderCart();
}

// تحويل الفاتورة كلها لمرتجع بتأكيد واحد بس — بدل ما تدوس مرتجع على كل صنف لوحده
function qbxReturnWholeInvoice(){
  if(blockCartEditAfterCard()) return;
  if(!hasPerm('canRefund')){ showToast('المرتجع للمشرف/المدير بس — مش مسموح للكاشير', 'err'); return; }
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
  if(blockCartEditAfterCard()) return;
  const item = cart[idx];
  if(item.isReturn){
    // دوس تاني على نفس الصنف يرجّعه لبيع عادي (تراجع)
    item.price = Math.abs(item.price);
    item.isReturn = false;
    renderCart();
    showToast('رجع بيع عادي ✅');
    return;
  }
  // مفيش تأكيد: الإجراء بيترد بضغطة تانية على نفس الصنف، فالتأكيد كان بيعطّل بس
  item.price = -Math.abs(item.price);
  item.isReturn = true;
  renderCart();
  showToast('↩️ "' + item.name + '" بقى مرتجع — دوس تاني عليه لو عايز ترجعه بيع', 'ok');
}
// ✂️ فصل قطعة واحدة من سطر كميته أكتر من واحدة
// ------------------------------------------------------------
// المشكلة: عميلة بتاخد قطعتين نفس الشكل، وواحدة فيهم فيها عيب. السلة
// بتدمج المتشابهين في **سطر واحد بكمية 2**، فأي خصم أو تعديل سعر بينزل
// على الاتنين — مفيش طريقة تخصم على واحدة بس.
// الحل: نفصل قطعة في سطر لوحدها، والسطر المفصول بيتعلّم `noMerge` عشان
// الضربة الجاية لنفس الباركود ماترجعش تدمجهم.
// ✅ باقي النظام مش محتاج تعديل: كل عمليات السلة (تعديل/خصم/حذف/مرتجع)
//    شغالة بـ**رقم السطر** مش بكود المنتج، وخصم المخزون بيجمع الكميات،
//    فسطرين بنفس الكود بيخصموا صح.
function splitCartLine(idx){
  if(blockCartEditAfterCard()) return;
  const line = cart[idx];
  if(!line) return;
  if(line.isRedemption || line.isRewardDiscount){ showToast('السطر ده مينفعش يتفصل', 'err'); return; }
  if((line.qty || 0) <= 1){ showToast('السطر ده قطعة واحدة أصلًا', 'err'); return; }
  line.qty -= 1;
  const copy = Object.assign({}, line, { qty: 1, noMerge: true });
  cart.splice(idx + 1, 0, copy);
  selectedCartIdx = idx + 1;               // القطعة المفصولة هي المحددة
  renderCart();
  showToast('✂️ اتفصلت قطعة لوحدها — التعديل والخصم دلوقتي عليها بس', 'ok');
}
if(typeof window !== 'undefined') window.splitCartLine = splitCartLine;

function changeQty(idx, delta){
  if(blockCartEditAfterCard()) return;
  const line = cart[idx];
  line.qty += delta;   // مسموح بأي كمية حتى لو أكبر من المخزون
  if(line.qty <= 0){ cart.splice(idx,1); selectedCartIdx = null; }
  renderCart();
}
function removeFromCart(idx){
  if(blockCartEditAfterCard()) return;
  if(cart[idx] && cart[idx].isRedemption) pendingRedemption = null;
  // 🔴 باج التركيز (AI_HANDOFF §0، مسار ١) — نفس منطق cartRemove بالظبط:
  // فوكس searchBar قبل ما renderCart تمسح الزرار المفوكس.
  if(searchBar) searchBar.focus();
  cart.splice(idx,1);
  // 🛡️ لو حذف المنتج ساب سطر الاستبدال أكبر من باقي الفاتورة (إجمالي سالب)
  // بنشيل الاستبدال تلقائي — وإلا السلة بتتحول "مرتجع" بيطلّع كاش مقابل نقط
  if(pendingRedemption && cartTotal() < 0){
    const ri = cart.findIndex(c=> c.isRedemption);
    if(ri >= 0) cart.splice(ri, 1);
    pendingRedemption = null;
    showToast('اتشال استبدال النقط — قيمته بقت أكبر من الفاتورة بعد الحذف', 'err');
  }
  renderCart();
}

// ---------- 🎫 وضع شراء الموظف ----------
let staffPurchase = null;   // {empId, name, pct, usedThisMonth, maxTimes, salaryUsed, salaryCap} لما موظفة تمسح كارتها
function cartSubtotal(){ return cart.reduce((s,c)=> s + c.price*c.qty, 0); }
function staffDiscountAmount(){
  if(!staffPurchase) return 0;
  const sub = cartSubtotal();
  if(sub <= 0) return 0;   // مفيش خصم موظف على المرتجعات
  return +(sub * staffPurchase.pct / 100).toFixed(2);
}
function cartTotal(){ return +(cartSubtotal() - staffDiscountAmount()).toFixed(2); }

async function activateStaffPurchase(code){
  try{
    if(typeof loadStaffCardsConfig === 'function' && !staffCardsConfig) await loadStaffCardsConfig();
    const cfg = (typeof staffCardsConfig !== 'undefined' && staffCardsConfig) ? staffCardsConfig : null;
    if(!cfg || !cfg.enabled){ showToast('خصم شراء الموظفين مش مفعّل (شاشة بطاقات الموظفين)', 'err'); return; }
    const snap = await db.collection('sales_employees').where('cardCode','==',code).limit(1).get();
    if(snap.empty){ showToast('الكارت ده مش متسجّل', 'err'); return; }
    const emp = { id: snap.docs[0].id, ...snap.docs[0].data() };

    // 🚚 أولوية: لو الموظفة دي حاملة تحويلة جاية للفرع ده — نفتح الاستلام بدل الشراء
    if(typeof checkIncomingTransferFor === 'function'){
      const hasTransfer = await checkIncomingTransferFor(emp.id);
      if(hasTransfer) return;
    }

    // استخدامات الشهر (المعلّقة والمعتمدة بتتحسب — المرفوضة لأ)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const os = await db.collection('sales_staff_orders').where('employeeId','==',emp.id).get();
    const monthOrders = os.docs.map(d=>d.data()).filter(o=> o.ts >= monthStart && o.status !== 'rejected');
    const used = monthOrders.length;
    const salaryUsed = monthOrders.filter(o=> o.payMethod==='salary').reduce((s,o)=> s + (o.total||0), 0);

    if(used >= (cfg.maxTimesPerMonth||0)){
      showToast('⛔ ' + emp.name + ' استخدمت كل مرات الشهر (' + cfg.maxTimesPerMonth + ')', 'err');
      return;
    }
    staffPurchase = {
      empId: emp.id, name: emp.name || '', pct: cfg.discountPct || 0,
      usedThisMonth: used, maxTimes: cfg.maxTimesPerMonth || 0,
      salaryUsed: salaryUsed, salaryCap: cfg.maxSalaryEGP || 0
    };
    renderStaffPurchaseBar();
    renderCart();
    showToast('🎫 وضع شراء موظف: ' + emp.name + ' — خصم ' + staffPurchase.pct + '%');
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}
function cancelStaffPurchase(){
  staffPurchase = null;
  renderStaffPurchaseBar();
  renderCart();
}
function renderStaffPurchaseBar(){
  let bar = document.getElementById('staffPurchaseBar');
  if(!staffPurchase){ if(bar) bar.remove(); _syncSalaryPayBtn(); return; }
  const salaryLeft = Math.max(0, staffPurchase.salaryCap - staffPurchase.salaryUsed);
  const html = `
    <span>🎫 <b>شراء موظف: ${staffPurchase.name}</b> · خصم ${staffPurchase.pct}% · المرة ${staffPurchase.usedThisMonth+1} من ${staffPurchase.maxTimes} · متاح خصم راتب: ${salaryLeft.toFixed(0)} ج.م</span>
    <button onclick="cancelStaffPurchase()" style="border:none; background:rgba(255,255,255,.25); color:inherit; border-radius:7px; padding:4px 10px; cursor:pointer; font-weight:800;">✖ إلغاء</button>`;
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'staffPurchaseBar';
    bar.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px; background:linear-gradient(90deg,#7c3aed,#a855f7); color:#fff; padding:9px 14px; font-size:12.5px; border-radius:10px; margin:6px 10px;';
    const sb = document.getElementById('searchBar');
    if(sb && sb.parentNode) sb.parentNode.insertBefore(bar, sb);
    else document.getElementById('saleScreen').prepend(bar);
  }
  bar.innerHTML = html;
  _syncSalaryPayBtn();
}
function _syncSalaryPayBtn(){
  const box = document.querySelector('.qbx-pay-btns');
  if(!box) return;
  let btn = document.getElementById('pmSalary');
  if(staffPurchase && !btn){
    btn = document.createElement('button');
    btn.id = 'pmSalary';
    btn.innerHTML = '<span class="pm-icon">📄</span>خصم من الراتب';
    btn.onclick = ()=> togglePayMethod('salary');
    box.appendChild(btn);
  }
  if(!staffPurchase && btn){
    btn.remove();
    if(selectedPayMethods && selectedPayMethods.has('salary')){ selectedPayMethods.delete('salary'); delete paymentAmounts.salary; updatePaySummary(); }
  }
}

// ⏳ صلاحية طلب الاستبدال — العميل بيطلب وهو واقف على الكاشير، فساعة
//    مدة كريمة. المدة بتتظبط من إعدادات الولاء (`redeemRequestTtlMin`).
function redeemReqTtlMs(){
  const m = Number((typeof loyaltyRedemptionConfig !== 'undefined' && loyaltyRedemptionConfig)
    ? loyaltyRedemptionConfig.redeemRequestTtlMin : 0);
  return (m > 0 ? m : 60) * 60000;
}
function redeemReqFresh(req, now){
  if(!req) return false;
  const ts = Number(req.ts);
  // 🔴 طلب من غير وقت = طلب قديم من نسخة قبل ما نسجّل الوقت → بيتجاهل
  if(!ts) return false;
  return (Number(now) || Date.now()) - ts <= redeemReqTtlMs();
}
window.redeemReqFresh = redeemReqFresh;
window.redeemReqTtlMs = redeemReqTtlMs;

// ---------------- Customer lookup (loyalty - test) ----------------
// لو الرقم متسجلش، بيوري صف "إضافة عميل جديد" عشان الكاشير يكتب الاسم ويسجله على طول.
const RATING_PREVIEW_MAP = {1:'😠 مضايقني جدًا', 2:'🙁 مش عاجبني', 3:'🙂 كويس', 4:'😍 عجبني جدًا'};
// ✕ شيل العميل من الفاتورة بضغطة.
// 🔴 قبل كده كان لازم تمسح الرقم كله وتدوس Enter أو تدوس في مكان تاني —
//    ومحدش بيعرف ده. الزرار بيظهر بس لما يكون فيه رقم مكتوب.
// 🎨 خانة العميل — **٣ حالات بلون واحد لكل واحدة** (مكان ما كان فيه لون واحد
//    غامض والاسم مخفي خالص):
//    · 'found' 🟢 أخضر — العميل متسجّل: الاسم **والرقم** بينوا جنب الخانة
//    · 'new'   🟠 برتقالي — الرقم كامل ومش مسجّل: خانة الاسم بتفتح للتسجيل
//    · ''      ⚪ رمادي — فاضية
// 🔴 الباج اللي بيقفله: الحالة كانت `custBox.on` بس (نوّر/مطفي) — الكاشير
//    مش عارف هل العميل اترّبط بالفاتورة ولا لأ، والاسم مش ظاهر في أي حالة.
let _custMatchedPhone = '';   // آخر رقم اتربط فعليًا بالفاتورة
function setCustState(state, name, phone){
  const st = (state === 'found' || state === 'new' || state === 'bad') ? state : '';
  const box  = document.getElementById('custBox');
  const ph   = document.getElementById('customerPhone');
  const info = document.getElementById('customerInfo');
  const pts  = document.getElementById('custPts');
  const btn  = document.getElementById('custClearBtn');
  const nm   = document.getElementById('customerName');
  if(box){
    box.classList.remove('st-found', 'st-new', 'st-bad');
    if(st) box.classList.add('st-' + st);
    box.classList.toggle('on', st === 'found');   // متوافق مع القديم
  }
  // 👤 الاسم في نفس السطر جنب الرقم
  if(info){
    info.textContent = st === 'found' ? ('👤 ' + (String(name || '').trim() || 'بدون اسم'))
      : st === 'new'  ? '🆕 مش مسجّل'
      : st === 'bad'  ? '⚠️ الرقم ناقص'
      : '';
  }
  if(pts && st !== 'found') pts.textContent = '';
  // 🛡️ خانة الاسم بتتقفل بالـCSS لما الحالة تتغيّر. لو التركيز كان عليها،
  //    بيروح لـbody والكتابة/المسح بيقفوا. بنحوّله بنفسنا قبل ما تتقفل.
  if(nm && st !== 'new' && document.activeElement === nm){
    try{
      const _sb = document.getElementById('searchBar');
      const _ph = document.getElementById('customerPhone');
      const _to = (_sb && _sb.offsetParent !== null) ? _sb : _ph;
      if(_to) _to.focus(); else nm.blur();
    }catch(e){}
  }
  // 📝 الرقم مش مسجّل → المؤشر بينط لخانة الاسم لوحده
  if(nm && st === 'new' && document.activeElement !== nm){
    try{ setTimeout(function(){ try{ nm.focus(); }catch(e){} }, 30); }catch(e){}
  }
  if(btn) btn.classList.toggle('on', !!(ph && String(ph.value || '').trim()));
  // زرار «سجّل» بيبان بالحالة — بكلاس صريح مش بـ:has (فيه متصفحات قديمة)
  const act = document.getElementById('custAction');
  if(act) act.classList.toggle('reg', st === 'new');
  if(st !== 'found') setCustAction('');
  return st;
}
window.setCustState = setCustState;

// 🎁 زرار الاستبدال/المكافأة — نفس السطر، وبيبان وقت الحاجة بس.
//    صف التسجيل الجديد بيفضل جواه دايمًا والـCSS هو اللي بيوريه بالحالة.
function setCustAction(html){
  const a = document.getElementById('custAction');
  if(!a) return;
  const reg = document.getElementById('newCustomerRow');
  a.innerHTML = '';
  if(reg) a.appendChild(reg);
  if(html){
    const d = document.createElement('div');
    d.innerHTML = html;
    if(d.firstElementChild) a.appendChild(d.firstElementChild);
  }
}
window.setCustAction = setCustAction;

// ✕ شيل العميل من الفاتورة بضغطة — بيمسح الرقم والاسم وسياق العميل كله
//   (استبدال/مكافأة/عروض) من غير أي دوسة زيادة.
function clearCustomer(){
  _custInvalidate();          // 🛡️ أي قراءة في الطريق تتلغي — مايرجعش لوحده
  const ph = document.getElementById('customerPhone');
  const nm = document.getElementById('customerName');
  if(ph) ph.value = '';
  // 🔴 كان `nm.style.display = 'none'` — والستايل السطري بيغلب قاعدة الـCSS
  //    `#custBox.st-new #customerName{display:block}`. فبعد أول دوسة على ✕،
  //    خانة الاسم مكانتش بترجع تبان **خالص** لأي رقم مش مسجّل لحد ما الصفحة
  //    تتقفل وتتفتح. بنسيب العرض للـCSS بالكامل.
  if(nm){ nm.value = ''; nm.style.display = ''; }
  _custMatchedPhone = '';
  if(typeof clearCustomerContext === 'function') clearCustomerContext();
  const rp = document.getElementById('resetPinRow'); if(rp) rp.style.display = 'none';
  if(typeof revertCustomerOffers === 'function') revertCustomerOffers();
  if(typeof custPointsBalance !== 'undefined') custPointsBalance = 0;
  setCustState('');
  if(typeof renderCart === 'function') renderCart();
  if(ph) try{ ph.focus(); }catch(e){}
}
window.clearCustomer = clearCustomer;

// 👁️ زرار المسح يظهر/يختفي حسب وجود رقم
function _custBtnSync(){
  const ph = document.getElementById('customerPhone');
  const btn = document.getElementById('custClearBtn');
  if(btn) btn.classList.toggle('on', !!(ph && ph.value.trim()));
}
window._custBtnSync = _custBtnSync;

// ✏️ أول ما الكاشير تغيّر رقم عميل **متربط**، اللون الأخضر لازم يقع فورًا
//    وسياق العميل يتفك — عشان ما تفضلش الفاتورة شايلة عميل غير اللي مكتوب.
function _custDetachIfChanged(){
  const ph = document.getElementById('customerPhone');
  if(!ph) return false;
  const v = String(ph.value || '').trim();
  if(!_custMatchedPhone || v === _custMatchedPhone) return false;
  _custInvalidate();          // 🛡️ نفس الحكاية مع تغيير الرقم
  _custMatchedPhone = '';
  if(typeof clearCustomerContext === 'function') clearCustomerContext();
  const rp = document.getElementById('resetPinRow'); if(rp) rp.style.display = 'none';
  if(typeof revertCustomerOffers === 'function') revertCustomerOffers();
  if(typeof custPointsBalance !== 'undefined') custPointsBalance = 0;
  setCustState('');
  if(typeof renderCart === 'function') renderCart();
  return true;
}
window._custDetachIfChanged = _custDetachIfChanged;

// 🔢 عدّاد الطلبات — بيمنع "العميل بيرجع لوحده".
//    القراءة من الداتابيز غير متزامنة. لو الكاشير مسحت العميل (أو غيّرت
//    الرقم) والقراءة القديمة لسه في الطريق، بترجع بعد المسح **وتكتب
//    العميل تاني**. فبنرقّم كل طلب، وأي نتيجة مش من آخر طلب بتتجاهل.
let _custReqSeq = 0;
function _custInvalidate(){ _custReqSeq++; }
window._custInvalidate = _custInvalidate;

async function refreshCustomerInfo(){
  const _req = ++_custReqSeq;
  const _stale = function(){
    // اتغيّر الطلب؟ أو الكاشير غيّرت الرقم وإحنا بنقرا؟
    const el = document.getElementById('customerPhone');
    return _req !== _custReqSeq || !el || el.value.trim() !== phone;
  };
  const phone = document.getElementById('customerPhone').value.trim();
  const infoBox = document.getElementById('customerInfo');
  _custBtnSync();
  if(!phone){
    const _nm0 = document.getElementById('customerName');
    if(_nm0) _nm0.value = '';
    _custMatchedPhone = '';
    setCustState(''); custActivatedOffers={}; revertCustomerOffers(); custReward=null;
    custPendingRedeem=null; custPointsBalance=0; window.custCreditBalance=0; window.custRequestHit=null; custBaseText=''; renderCart(); return; }
  // 🔴 الرقم الناقص مبقاش يعدّي: قبل كده أي رقم (٤ أرقام مثلاً) كان بيتعامل
  //    معاملة "مش مسجّل" ويفتح التسجيل — فتتسجّل عميلة بمفتاح غلط ونقطها
  //    تروح لمستند مش بتاعها ومفيش رجوع.
  {
    const _bad = (typeof phoneRejectReason === 'function')
      ? phoneRejectReason(typeof normalizePhone === 'function' ? normalizePhone(phone) : phone) : null;
    if(_bad){
      _custMatchedPhone = '';
      clearCustomerContext(); revertCustomerOffers(); custPointsBalance = 0; window.custCreditBalance = 0; window.custRequestHit = null;
      setCustState('bad');
      renderCart();
      return;
    }
  }
  try{
    const doc = await db.collection(TEST_CUSTOMERS).doc(phone).get();
    if(_stale()) return;                      // الكاشير مسحت أو غيّرت الرقم وإحنا بنقرا
    custExists = doc.exists;
    { const _d = doc.exists ? (doc.data()||{}) : {};
      // "معاه التطبيق" = عنده PIN أو كود ولاء أو مصدره التطبيق
      custHasApp = !!(_d.loyaltyPin || _d.loyaltyCode || _d.loyaltyCode_glow || String(_d.source||'').indexOf('app')>=0);
    }
    let ratingLine = '';
    try{
      // 1) لو العميل ده عنده تقييمات مرتبطة فعليًا من زيارات سابقة (دقيقة 100%)
      const linkedSnap = await db.collection('entries').where('customerPhone','==', phone).get();
      if(_stale()) return;
      const linked = linkedSnap.docs.map(d=>d.data()).sort((a,b)=> b.ts-a.ts);
      if(linked.length){
        ratingLine = ` | آخر تقييمه: ${RATING_PREVIEW_MAP[linked[0].r]||'—'}`;
      }else{
        // 2) مفيش تقييم متربط بيه قبل كده — نديله تخمين تقريبي (تقييم قريب في نفس الفرع في آخر دقيقتين)
        // 💸 كان بيسحب **كل** تقييمات الفرع مع كل بحث عن عميل، ويفلتر
        //    آخر دقيقتين على الجهاز. مع آلاف التقييمات ده مئات الآلاف من
        //    القراءات في اليوم. دلوقتي الفلترة الزمنية على السيرفر —
        //    `ts` حقل واحد فمفيش index مركّب مطلوب — والفرع بيتفلتر محليًا
        //    على نتيجة صغيرة (تقييمات آخر دقيقتين في كل الفروع).
        const twoMinAgo = Date.now() - (2*60*1000);
        const branchSnap = await db.collection('entries').where('ts','>=', twoMinAgo).get();
        if(_stale()) return;
        const recent = branchSnap.docs.map(d=>d.data())
          .filter(e=> e.branch === currentBranch).sort((a,b)=> b.ts-a.ts);
        if(recent.length) ratingLine = ` | تقييم قريب (تخمين مش مؤكد): ${RATING_PREVIEW_MAP[recent[0].r]||'—'}`;
      }
    }catch(e){}

    if(doc.exists){
      const d = doc.data();
      const _nm2 = document.getElementById('customerName');
      if(_nm2) _nm2.value = d.name || '';   // الاسم بيبان في الشريط
      custActivatedOffers = d.activatedOffers || {};   // عروض العميل المفعّلة
      custPointsBalance = Number(d[pointsFieldFor(currentBranch)]) || 0;   // 🛡️ الرصيد الحقيقي
      // 💳 رصيد الفلوس — منفصل تمامًا عن النقط. للعرض بس؛
      //    الفنكشن بتتأكد من الرصيد الحقيقي وقت الصرف.
      window.custCreditBalance = Number(d.credit) || 0;
      // 🔖 طلب مسجّل ليها ووصل؟ (حساب محلي — صفر قراءات)
      try{ if(typeof refreshCustRequestHit === 'function') refreshCustRequestHit(phone); }catch(e){}
      if(Object.keys(custActivatedOffers).length){ await _loadOfficialOffers(); if(_stale()) return; }   // 🛡️ الشروط الرسمية قبل أي خصم
      revertCustomerOffers(); applyCustomerOffers(); renderCart();
      const _brand = pointsFieldFor(currentBranch)==='points_glow' ? 'glow' : 'echarpe';
      const _now = Date.now();
      // 🛡️ نتأكد إن طلب الاستبدال اللي العميل بعته من التطبيق ≤ رصيده الحقيقي (منع تلاعب)
      // ⏳ الطلب لازم يكون **جديد**. الباج: `pendingRedeem` مبيتمسحش غير
      //    لما الفاتورة تتقفل والاستبدال مطبّق فيها. فلو العميل طلب
      //    وماخدش، الطلب بيفضل في مستنده **للأبد** — وكل ما تكتب رقمه
      //    الزرار يظهر، فيبان كإن النظام بيقترح الاستبدال من نفسه.
      //    دلوقتي الطلب بيسقط بعد المدة، والقديم اللي من غير وقت بيتجاهل.
      custPendingRedeem = (d.pendingRedeem && d.pendingRedeem.brand === _brand
        && d.pendingRedeem.points > 0
        && d.pendingRedeem.points <= custPointsBalance
        && redeemReqFresh(d.pendingRedeem, _now)) ? d.pendingRedeem : null;
      if(d.pendingRedeem && d.pendingRedeem.points > custPointsBalance){
        showToast('⚠️ طلب استبدال العميل أكبر من رصيده — اتجاهل. اعمل الاستبدال يدوي بالرصيد الصح', 'warn');
      }
      custReward = (d.rewards||[]).find(r=> r && !r.used && r.brand===_brand && (!r.expiry || r.expiry>_now)) || null;
      custBaseText = 'loaded';   // مؤشر إن فيه عميل متحمّل — العرض في الشريط
      _custMatchedPhone = phone;
      setCustState('found', d.name || '', phone);
      refreshCustomerActionUI();
      const rp = document.getElementById('resetPinRow');
      if(rp) rp.style.display = (d.loyaltyPin && hasPerm('canResetCustomerPin')) ? 'block' : 'none';   // بيان لو العميل حاطط رقم + الموظف عنده صلاحية
    }else{
      // 🟠 الرقم مش مسجّل → خانة الاسم بتفتح والمؤشر بينط فيها لوحده
      _custMatchedPhone = '';
      setCustState('new', '', phone);
      const rp = document.getElementById('resetPinRow'); if(rp) rp.style.display = 'none';
    }
  }catch(e){ _custMatchedPhone=''; setCustState(''); }
}
// تلوين مربع العميل — باقية للتوافق مع النداءات القديمة (app.js/clearSaleState)
function setCustBox(on){
  if(!on) _custMatchedPhone = '';
  setCustState(on ? 'found' : '', (document.getElementById('customerName')||{}).value || '',
    (document.getElementById('customerPhone')||{}).value || '');
}
document.getElementById('customerPhone').addEventListener('blur', refreshCustomerInfo);
// دوس Enter في خانة رقم العميل يظهر العميل على طول (من غير ما تحتاج تدوس في مكان تاني)
document.getElementById('customerPhone').addEventListener('keydown', function(e){
  if(e.key === 'Enter'){ e.preventDefault(); refreshCustomerInfo(); }
});
// ✕ زرار المسح يبان أول ما تكتب رقم — مش مستني blur
// ✏️ ولو غيّرت رقم عميل متربط، الأخضر يقع فورًا وسياق العميل يتفك
document.getElementById('customerPhone').addEventListener('input', function(){
  _custDetachIfChanged();
  _custBtnSync();
});
// 📱 11 رقم = بحث تلقائي، من غير Enter ولا نقرة برّه
document.getElementById('customerPhone').addEventListener('input', function(){
  const v = this.value.replace(/[^0-9]/g, '');
  if(v.length === 11) refreshCustomerInfo();
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
// 📱 تطبيع رقم الموبايل + التحقق منه.
// 🔴 المشكلة: الرقم ده **مفتاح المستند** في pos_test_customers، والفحص الوحيد
//    كان إن الخانة مش فاضية. يعني:
//    · رقم ناقص أو فيه حروف = عميلة جديدة بنقط منفصلة
//    · نفس العميلة بـ"0101 234 5678" و"01012345678" = مستندين مختلفين
//    والنقط بتروح للمستند الغلط ومفيش تراجع.
// ⚠️ التحقق على **الجديد بس** — العملاء المتسجلين قبل كده بأرقام غلط
//    بيفضلوا يفتحوا ويصرفوا نقطهم عادي (refreshCustomerInfo ماتلمستش).
function normalizePhone(raw){
  let v = String(raw == null ? '' : raw);
  // أرقام هندية/فارسية → إنجليزي (الكيبورد العربي)
  v = v.replace(/[\u0660-\u0669]/g, function(d){ return String(d.charCodeAt(0) - 0x0660); })
       .replace(/[\u06F0-\u06F9]/g, function(d){ return String(d.charCodeAt(0) - 0x06F0); });
  v = v.replace(/[^0-9+]/g, '');           // مسافات وشرطات وأقواس
  if(v.indexOf('+20') === 0) v = '0' + v.slice(3);   // +201… → 01…
  else if(v.indexOf('0020') === 0) v = '0' + v.slice(4);
  else if(v.indexOf('20') === 0 && v.length === 12) v = '0' + v.slice(2);
  v = v.replace(/\+/g, '');
  if(v.length === 10 && v.indexOf('1') === 0) v = '0' + v;   // نسيت الصفر
  return v;
}
// بترجّع رسالة المنع أو null لو الرقم سليم
function phoneRejectReason(p){
  if(!p) return 'اكتب رقم التليفون الأول';
  if(!/^[0-9]+$/.test(p)) return 'الرقم لازم يكون أرقام بس';
  if(p.length !== 11) return 'رقم الموبايل لازم 11 رقم — اللي كتبته ' + p.length;
  if(!/^01[0125]/.test(p)) return 'رقم الموبايل لازم يبدأ بـ010 أو 011 أو 012 أو 015';
  return null;
}
window.normalizePhone = normalizePhone;
window.phoneRejectReason = phoneRejectReason;

async function registerNewCustomer(){
  const raw = document.getElementById('customerPhone').value.trim();
  const phone = normalizePhone(raw);
  const name = document.getElementById('customerName').value.trim();
  const _bad = phoneRejectReason(phone);
  if(_bad){ showToast('❌ ' + _bad, 'err'); return; }
  if(!name){ showToast('اكتب اسم العميل', 'err'); return; }
  // 🔄 لو التطبيع غيّر الرقم، نوريه للكاشير قبل ما نسجّل — عشان تتأكد
  if(phone !== raw){
    if(!confirm('الرقم هيتسجل كده:\n\n' + phone + '\n\nصح؟')) return;
    document.getElementById('customerPhone').value = phone;
  }
  try{
    await db.collection(TEST_CUSTOMERS).doc(phone).set({ name, phone, points:0, branch: currentBranch, createdAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge:true });
    document.getElementById('customerInfo').textContent = `اتسجل عميل جديد: ${name}`;
    document.getElementById('newCustomerRow').style.display = 'none';
    showToast('اتسجل العميل ✅');
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}

// ---------------- Sidebar actions (Give Discount / Accept Return / Cashier / Ship) ----------------
async function openGiveDiscount(){
  if(blockCartEditAfterCard()) return;
  if(cart.length === 0){ showToast('الفاتورة فاضية', 'err'); return; }
  if(!hasPerm('canDiscount')){ showToast('الخصم للمشرف/المدير بس — مش مسموح للكاشير', 'err'); return; }
  const maxPct = Number(myPerms().maxDiscountPct);
  const cap = isNaN(maxPct) ? 0 : maxPct;
  const pct = await askText({
    title: '🏷️ خصم على إجمالي الفاتورة',
    message: cap < 100 ? ('الحد الأقصى المسموح ليك: ' + cap + '%') : '',
    type: 'number', value: '0', okText: 'طبّق الخصم'
  });
  if(pct === null) return;
  const p = parseFloat(pct);
  if(isNaN(p) || p < 0 || p > 100){ showToast('نسبة غير صحيحة', 'err'); return; }
  if(p > cap){ showToast(`⛔ الحد الأقصى للخصم المسموح ليك ${cap}% — اطلب مدير لو محتاج أكتر`, 'err'); return; }
  // الخصم على المنتجات بس — سطور الاستبدال/المكافأة السالبة متتلمسش
  // (خصم نسبة من سطر سالب بيقلل قيمة الاستبدال والعميل خصم نقطه كاملة)
  cart.forEach(c=>{ if(!c.isRedemption && !c.isRewardDiscount) c.price = c.price * (1 - p/100); });
  renderCart();
  showToast(`اتحط خصم ${p}% ✅`);
  // 📋 تسجيل الخصم في سجل النشاط
  try{ if(typeof _logActivity === 'function') _logActivity('manual_discount', { pct: p, by: currentEmployee.name||'', cartCount: cart.length }); }catch(e){}
}
function focusAddCustomer(){
  document.getElementById('customerPhone').focus();
}
function showCashierInfo(){
  showToast('مسجّل دخول: ' + (currentEmployee.name||'') + ' — ' + (myPerms().label||''));
  // 🔒 نخفي أزرار المرتجع لو الموظف مالوش صلاحية (كاشير عادي)
  try{
    const canRet = hasPerm('canRefund');
    ['io_returnitem','io_returnall'].forEach(uid=>{
      const el = document.querySelector('[data-uid="'+uid+'"]');
      if(el) el.style.display = canRet ? '' : 'none';
    });
    // 🔒 نخفي الخصم وفتح الدرج لو مفيش صلاحية
    const dEl = document.querySelector('[data-uid="sa_discount"]');
    if(dEl) dEl.style.display = hasPerm('canDiscount') ? '' : 'none';
    const drEl = document.querySelector('[data-uid="sa_drawer"]');
    if(drEl) drEl.style.display = hasPerm('canOpenDrawer') ? '' : 'none';
  }catch(e){}
}

// ---------------- استبدال نقاط الولاء بخصم ----------------
let pendingRedemption = null; // {points, value} — بيتثبّت فعليًا (خصم النقط) بس لما الفاتورة تتحفظ

async function openRedeemPoints(){
  if(blockCartEditAfterCard()) return;
  // 🔐 الاستبدال اليدوي (من غير طلب من التطبيق) بقى بصلاحية —
  //    الطريق الطبيعي إن العميل يطلب من التطبيق والكاشير تأكّد بس.
  if(typeof hasPerm === 'function' && !hasPerm('canRedeemManual')){
    showToast('🎁 الاستبدال اليدوي للمشرف/المدير بس — العميل يطلب من التطبيق والكاشير تأكّد', 'err');
    return;
  }
  const phone = document.getElementById('customerPhone').value.trim();
  if(!phone){ showToast('لازم تكتب رقم تليفون العميل الأول', 'err'); return; }
  if(cart.length === 0){ showToast('الفاتورة فاضية', 'err'); return; }
  if(pendingRedemption){ showToast('في استبدال نقط مطبّق بالفعل على الفاتورة دي', 'err'); return; }

  try{
    const doc = await db.collection(TEST_CUSTOMERS).doc(phone).get();
    if(_stale()) return;                      // الكاشير مسحت أو غيّرت الرقم وإحنا بنقرا
    custExists = doc.exists;
    { const _d = doc.exists ? (doc.data()||{}) : {};
      // "معاه التطبيق" = عنده PIN أو كود ولاء أو مصدره التطبيق
      custHasApp = !!(_d.loyaltyPin || _d.loyaltyCode || _d.loyaltyCode_glow || String(_d.source||'').indexOf('app')>=0);
    }
    const balance = doc.exists ? (doc.data()[pointsFieldFor(currentBranch)] || 0) : 0;
    const rate = loyaltyRedemptionConfig;
    if(balance < rate.pointsPerRedemption){
      showToast(`رصيد العميل ${balance} نقطة بس — محتاج ${rate.pointsPerRedemption} نقطة على الأقل للاستبدال`, 'err');
      return;
    }
    const maxRedemptions = _redeemMaxUnits(balance, cartTotal(), rate.pointsPerRedemption, rate.redemptionValueEGP);
    if(maxRedemptions <= 0){
      showToast('قيمة الفاتورة أقل من أصغر وحدة استبدال (' + rate.redemptionValueEGP + ' ج.م) — الاستبدال خصم على الفاتورة مش فلوس بتترد', 'err');
      return;
    }
    const input = await askText({
      title: '🎁 استبدال نقط',
      message: 'رصيد العميل: ' + balance + ' نقطة\nكل ' + rate.pointsPerRedemption + ' نقطة = '
             + rate.redemptionValueEGP + ' ج.م خصم\nالحد الأقصى (بالرصيد وقيمة الفاتورة): ' + maxRedemptions,
      type: 'number', value: '1', okText: 'استبدل'
    });
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
let custExists = false, custHasApp = false;
// ⭐ إعدادات نقاط البيع (بيحددها المدير من شاشة البطاقات) — بديل الرقم الثابت القديم
let staffPointsConfig = null;
async function loadStaffPointsConfig(){
  try{
    const d = await db.collection(TEST_SETTINGS).doc('staff_points').get();
    staffPointsConfig = d.exists ? d.data() : {};
  }catch(e){ staffPointsConfig = {}; }
  return staffPointsConfig;
}
// 🕵️ العلبة السودا: تسجيل صامت لأحداث السلة (لتبويب نشاط غريب لاحقًا) — صفر تأثير على الشغل
let _cartFirstItemAt = null;   // وقت أول قطعة في السلة الحالية
let _cartSid = null;           // 🕵️ معرّف السلة الحالية (بيربط أحداثها بالفاتورة)
let _cardMoneyAtRiskAt = null;    // 🕵️ لحظة أول رنين ماكينة (الفلوس بقت معرّضة)
let _cardFirstApprovedAt = null;  // 🕵️ لحظة أول موافقة كارت في السلة دي
let _cartEditsAfterCard = [];     // 🕵️ التعديلات اللي حصلت **بعد** السحب = سبب الفرق
// 🕵️ v297: تعديل بعد سحب الكارت = سبب محتمل لفرق مسحوب زيادة.
//    الفلترة بالوقت: تعديل قبل السحب مالوش علاقة بالفرق.
function _trackEditAfterCard(kind, name, qty, value){
  // 🔑 المرجع هو **رنين الماكينة** مش الموافقة: بين الاتنين ثواني
  //    والعميلة ممكن تكون حاطة الكارت خلاص. تعديل قبل الرنين =
  //    بيع عادي ومالوش علاقة بأي فرق.
  if(!_cardMoneyAtRiskAt) return;
  const now = Date.now();
  _cartEditsAfterCard.push({ kind: kind, name: String(name || ''),
    qty: Number(qty) || 0, value: +(Number(value) || 0).toFixed(2), ts: now,
    // بعد الموافقة = مؤكد إن الفلوس اتسحبت. بين الرنين والموافقة =
    // الأغلب اتسحبت برضه بس مش مؤكد — بيتعرض بصيغة أهدى.
    afterApproval: !!(_cardFirstApprovedAt && now >= _cardFirstApprovedAt) });
}
window._trackEditAfterCard = _trackEditAfterCard;

// وصف السبب بالمصري: "حرير سادة سواريه ×1 (350)" — والمجموع بيتقارن
// بالفرق: لو مطابق يبقى ده السبب الكامل، لو مش مطابق فيه حاجة تانية.
function cardOverCause(edits, diff){
  const list = (edits || []).filter(function(e){ return e && e.value > 0; });
  if(!list.length) return null;
  const sum = +list.reduce(function(n, e){ return n + e.value; }, 0).toFixed(2);
  const anyBefore = list.some(function(e){ return e.afterApproval === false; });
  return {
    text: list.map(function(e){
      return e.kind + ' ' + e.name + (e.qty > 1 ? ' ×' + e.qty : '') + ' (' + e.value + ')'
        + (e.afterApproval === false ? ' — أثناء ما الماكينة شغالة' : '');
    }).join(' · '),
    beforeApproval: anyBefore,
    sum: sum,
    exact: Math.abs(sum - (Number(diff) || 0)) <= 0.005,
    items: list
  };
}
window.cardOverCause = cardOverCause;

function _newCartSid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
window._newCartSid = _newCartSid;
let _saleJustSaved = false;    // عشان نفرّق مسح-بعد-حفظ (طبيعي) عن مسح-وهروب
/* 💳↩️ v295: فاتورة 1444 (فيزا 1610 على 1260) — التحذير كان موجود
   والكاشير أكّد والدنيا مشيت. الفرق بيتسجل دلوقتي في مجموعة متابعة
   ظاهرة في Office لحد ما يترد فعلًا — مش سطر في لوج محدش بيفتحه. */
function cardRefundDuePayload(legs, total, ctx){
  const charged = Math.abs(cardApprovedSum(legs));
  const t = Math.abs(Number(total) || 0);
  const diff = +(charged - t).toFixed(2);
  if(diff <= 0.005) return null;
  ctx = ctx || {};
  return {
    status: 'due',
    branch: ctx.branch || '',
    invoiceCode: ctx.invoiceCode || '',
    customerPhone: ctx.phone || '',
    customerName: ctx.name || '',
    charged: charged, invoiceTotal: t, diff: diff,
    // كل عملية Paymob بمبلغها — الرد بيتم على العملية نفسها من الداشبورد
    txns: (legs || []).filter(function(l){ return l.status === 'approved'; })
      .map(function(l){
        const t2 = l.txn || {};
        return { seq: l.seq, amount: Math.abs(l.amount || 0),
                 txnId: t2.txnId || t2.id || null, last4: t2.last4 || null };
      }),
    employeeId: ctx.employeeId || '', employeeName: ctx.employeeName || '',
    ts: Date.now()
  };
}
window.cardRefundDuePayload = cardRefundDuePayload;

function _logActivity(type, data){
  try{
    db.collection('pos_activity_log').add({
      type, branch: currentBranch,
      employeeId: (currentEmployee&&currentEmployee.id)||'',
      employeeName: (currentEmployee&&currentEmployee.name)||'',
      // 🕵️ معرّف السلة على كل حدث — من غيره الأحداث أيتام مش معروف
      //    تخص أنهي فاتورة (وقت وقوعها الفاتورة لسه مالهاش رقم)
      sid: _cartSid || null,
      ts: Date.now(), ...data
    }).catch(()=>{});
  }catch(e){}
}   // لعرض QR التطبيق في الفاتورة للغير مسجّل/غير مثبّت
let custPendingRedeem = null, custBaseText = '';
let custPointsBalance = 0;       // رصيد العميل الفعلي (من المستند) — مصدر الحقيقة للاستبدال
let _offCatalog = null;          // شروط العروض الرسمية من كتالوج المحل {barcode: item}

// >>> SEC3_START
// 🛡️ فاز 3أ: الكاشير مبيصدّقش أي أرقام جاية من جهاز العميل — بيعيد حسابها من إعدادات المحل.
// الاستبدال: بنتجاهل القيمة المكتوبة في الطلب ونحسبها إحنا، مقيّدة بالرصيد الفعلي
function _redeemSanitize(reqPoints, balance, per, valPer){
  per = Number(per) || 10; valPer = Number(valPer) || 5;
  const maxUnits = Math.floor(Math.max(0, Number(balance) || 0) / per);
  const reqUnits = Math.floor(Math.max(0, Number(reqPoints) || 0) / per);
  const units = Math.min(maxUnits, reqUnits);
  return { points: units * per, value: units * valPer, units };
}
// 🛡️ سقف الاستبدال بقيمة الفاتورة نفسها — ثغرة تحويل النقط لكاش:
// من غير السقف ده، سلة بـ50 ج + استبدال بـ100 ج = إجمالي −50 → السيستم
// بيعاملها مرتجع ويطلّع كاش من الدرج. النقط خصم على فاتورة، مش فلوس بتترد.
function _redeemMaxUnits(balance, cartTot, per, valPer){
  per = Number(per) || 10; valPer = Number(valPer) || 5;
  const byBalance = Math.floor(Math.max(0, Number(balance) || 0) / per);
  const byCart = Math.floor(Math.max(0, Number(cartTot) || 0) / valPer);
  return Math.min(byBalance, byCart);
}
window._redeemMaxUnits = _redeemMaxUnits;
// شروط العرض الرسمية من بند الكتالوج (اللي انت كاتبه) — مش من كتابة العميل
function _offerOfficial(catItem){
  if(!catItem || !catItem.discountType || !(Number(catItem.discountValue) > 0)) return null;
  return { type: catItem.discountType, value: Number(catItem.discountValue),
           maxUses: Number(catItem.usesPerCustomer) || 1, validDays: Number(catItem.validDays) || 0 };
}
// تفعيل العميل بيثبت حاجتين بس: إنه فعّل + استهلك كام مرة — كل الشروط التانية من الرسمي
function _offerSanitize(activated, official, now){
  if(!activated || !official) return null;                 // مش مفعّل، أو العرض مش موجود رسميًا أصلًا
  now = now || Date.now();
  const actAt = Number(activated.activatedAt) || 0;
  if(official.validDays > 0){
    if(actAt){ if(now > actAt + official.validDays * 86400000) return null; }
    else if(activated.expiry && Number(activated.expiry) < now) return null;   // توافق مع تفعيلات قديمة
  }
  if((Number(activated.uses) || 0) >= official.maxUses) return null;           // سقف المرات الرسمي
  return { type: official.type, value: official.value };
}
// <<< SEC3_END

async function _loadOfficialOffers(){
  if(_offCatalog !== null) return;
  try{
    const _brand = pointsFieldFor(currentBranch) === 'points_glow' ? 'glow' : 'echarpe';
    const d = await db.collection(TEST_SETTINGS).doc('catalog_' + _brand).get();
    const items = (d.exists && Array.isArray(d.data().items)) ? d.data().items : [];
    _offCatalog = {};
    items.forEach(it => { if(it && it.barcode) _offCatalog[it.barcode] = it; });
  }catch(e){ _offCatalog = {}; console.warn('official offers load', e && e.code); }
}

// بيحدّث صندوق العميل (المكافأة/الاستبدال) حسب إجمالي الفاتورة الحالي — بيتنادى مع كل تغيّر في السلة
function refreshCustomerActionUI(){
  const infoBox = document.getElementById('customerInfo');
  if(!infoBox) return;
  if(!custBaseText){ return; }   // مفيش عميل متحمّل
  const cartTot = cart.reduce((s,c)=> s + c.price*c.qty, 0);
  // 💳 النقط بتتضاف لسطر الهوية — مش سطر لوحده
  const _ptsEl = document.getElementById('custPts');
  if(_ptsEl){
    // 💳 النقط · 💰 ورصيد الفلوس لو عندها.
    //    ⚠️ الاتنين متفصولين في العرض عن قصد: النقط بتتكسب بقاعدة
    //       والرصيد فلوس دفعتها — خلطهم بيلخبط العميلة والكاشير.
    const _cr = Number(window.custCreditBalance) || 0;
    _ptsEl.textContent = '💳 ' + (Number(custPointsBalance) || 0)
      + (_cr > 0 ? '  ·  💰 ' + _cr.toFixed(2) + ' ج.م' : '');
  }

  // 💰 زرار استخدام الرصيد — بيظهر بس لما يكون فيه رصيد وفاتورة موجبة
  //    ومفيش خصم رصيد متطبّق خلاص على الفاتورة دي.
  if((Number(window.custCreditBalance) || 0) > 0 && cartTot > 0
     && !cart.some(l => l.isCreditSpend) && !window.pendingCreditSpend){
    const _use = Math.min(Number(window.custCreditBalance) || 0, cartTot);
    setCustAction('<button class="act-redeem" onclick="useCustomerCredit()">💰 استخدمي الرصيد ('
      + _use.toFixed(2) + ' ج.م)</button>');
    return;
  }

  if(custPendingRedeem && !pendingRedemption){
    // 🛡️ نعيد الحساب من إعدادات المحل والرصيد الفعلي — ولو أرقام الطلب مش مطابقة نعلّم 🚩
    const _rr = loyaltyRedemptionConfig || {};
    const _sane = _redeemSanitize(custPendingRedeem.points, custPointsBalance, _rr.pointsPerRedemption, _rr.redemptionValueEGP);
    const _tampered = (Number(custPendingRedeem.valueEGP) !== _sane.value) || (Number(custPendingRedeem.points) !== _sane.points);
    if(_tampered && _sane._flagged !== true){
      _sane._flagged = true;
      if(typeof _logActivity === 'function') _logActivity('redeem_value_mismatch', {
        phone: document.getElementById('customerPhone').value.trim(),
        reqPoints: custPendingRedeem.points, reqValue: custPendingRedeem.valueEGP,
        sanePoints: _sane.points, saneValue: _sane.value, balance: custPointsBalance
      });
    }
    custPendingRedeem._sane = _sane; custPendingRedeem._tampered = _tampered;
    if(_tampered && _ptsEl) _ptsEl.textContent += ' 🚩';
    // 🎁 الزرار في مكانه الثابت — كبير ومقروء
    setCustAction('<button class="act-redeem" onclick="applyPendingRedeem()">🎁 استبدال '
      + _sane.points + ' نقطة (' + _sane.value + ' ج.م)</button>');
    return;
  }
  if(custReward && !cart.some(l=> l.isRewardDiscount)){
    const okMin = cartTot >= (custReward.minInvoice||0);
    const rTxt = custReward.type==='percent' ? `${custReward.value}%` : `${custReward.value} ج.م`;
    if(okMin){
      setCustAction('<button class="act-reward" onclick="applyCustomerReward()">🎁 مكافأة '
        + rTxt + '</button>');
    }else{
      setCustAction('<button class="act-wait" disabled>🎁 مكافأة من '
        + custReward.minInvoice + ' ج.م</button>');
    }
    return;
  }
  /* 🧠 شريط الفرصة
     ------------------------------------------------------------
     ⚠️ السلسلة فوق **متسابة زي ما هي عن قصد**: جواها منطق أمني
        (كشف التلاعب في طلب الاستبدال + التعقيم بالرصيد الحقيقي)،
        وأزرار حقيقية بتنفّذ. استبدالها بمحرك عام كان هيخاطر بمسار
        فلوس شغّال عشان تنظيم شكلي.

     ✅ اللي المحرك بيضيفه هو اللي **مفيش مكانه دلوقتي**: التلميحات
        اللي مالهاش زرار — "ناقصها ١٠٠ وتفتح مكافأة" و"كانت طالبة".
        يعني بيملا الفراغ مش بيزاحم. */
  try{
    if(typeof oppTop === 'function'){
      const _opp = oppTop({
        phone: (document.getElementById('customerPhone')||{value:''}).value.trim(),
        loyalty: loyaltyRedemptionConfig || {},
        cartTotal: cartTot,
        pointsBalance: custPointsBalance,
        creditBalance: Number(window.custCreditBalance) || 0,
        creditApplied: cart.some(function(l){ return l.isCreditSpend; }),
        redeemApplied: !!pendingRedemption,
        reward: custReward,
        rewardApplied: cart.some(function(l){ return l.isRewardDiscount; }),
        requestHit: window.custRequestHit || null
      });
      // ⭐ التلميحات بس — اللي ليها زرار اتعرض فوق خلاص
      if(_opp && !_opp.action){
        setCustAction('<span class="act-hint">' + _opp.icon + ' ' + esc(_opp.text) + '</span>');
        return;
      }
    }
  }catch(e){ console.warn('opportunity', e); }
  setCustAction('');
}

function applyCustomerReward(){
  if(blockCartEditAfterCard()) return;
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
function applyPendingRedeem(){
  if(blockCartEditAfterCard()) return;
  if(pendingRedemption){ showToast('في استبدال مطبّق بالفعل على الفاتورة', 'err'); return; }
  // 🛡️ فاز 3أ: بنحسب من إعدادات المحل والرصيد الفعلي — مش من أرقام الطلب
  const _rr = loyaltyRedemptionConfig || {};
  const _sane = _redeemSanitize(custPendingRedeem ? custPendingRedeem.points : 0, custPointsBalance, _rr.pointsPerRedemption, _rr.redemptionValueEGP);
  // 🛡️ وسقف تاني بقيمة الفاتورة (ثغرة تحويل النقط لكاش)
  const _capUnits = _redeemMaxUnits(custPointsBalance, cartTotal(), _rr.pointsPerRedemption, _rr.redemptionValueEGP);
  const _units = Math.min(_sane.units, _capUnits);
  const points = _units * (Number(_rr.pointsPerRedemption) || 10);
  const value = _units * (Number(_rr.redemptionValueEGP) || 5);
  if(points <= 0 || value <= 0){ showToast('رصيد العميل أو قيمة الفاتورة مش كافيين للاستبدال ده', 'err'); return; }
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
  if(!hasPerm('canOpenDrawer')){ showToast('فتح الدرج للمشرف/المدير بس', 'err'); return; }
  // 📋 نسجّل فتح الدرج اليدوي (من غير بيع) — عشان المراقبة
  try{ if(typeof _logActivity === 'function') _logActivity('manual_drawer_open', { by: currentEmployee.name||'' }); }catch(e){}
  // لو داخل الـexe: نبعت أمر فتح الدرج مباشرة (من غير نافذة طباعة)
  if(typeof window.posShell !== 'undefined' && typeof testCashDrawer === 'function'){
    testCashDrawer();
    return;
  }
  try{
    const w = window.open('', '_blank', 'width=200,height=100');
    w.document.write('<html><body onload="window.print(); setTimeout(()=>window.close(), 300);"></body></html>');
    w.document.close();
    if(typeof reclaimWindowFocus === 'function') reclaimWindowFocus(300);
    showToast('اتبعت أمر فتح الدرج للطابعة', 'warn');
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
  if(!hasPerm('canReverse') && !hasPerm('canRefund')){ showToast('عكس الفاتورة للمشرف/المدير بس', 'err'); return; }
  if(_busyOps.has('reverse_'+saleId)) return;
  if(!confirm('متأكد إنك عايز تعكس الفاتورة دي؟ الكمية هترجع للمخزون، والإجراء ده نهائي.')) return;
  _busyOps.add('reverse_'+saleId);
  _offlineQueued = false;
  try{
    const saleDoc = await db.collection(TEST_SALES).doc(saleId).get();
    if(!saleDoc.exists){ showToast('الفاتورة مش موجودة', 'err'); return; }
    const sale = saleDoc.data();

    // ⏰ عكس فاتورة في نفس يوم بيعها → تأكيد إضافي + تسجيل للصندوق الأسود
    const _rvMs = sale.createdAt && sale.createdAt.toMillis ? sale.createdAt.toMillis() : (sale.createdAt && sale.createdAt.seconds ? sale.createdAt.seconds*1000 : 0);
    if(_isSameLocalDay(_rvMs)){
      if(!confirm('⏰ الفاتورة دي متسجلة النهارده — عكسها هيتسجل كملاحظة يوم-بيوم. متأكد؟')) return;
      if(typeof _logActivity === 'function') _logActivity('same_day_reversal', { invoiceNo: sale.invoiceNo||'', total: sale.total||0 });
    }

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
    const _rvW = await _waitWrite(batch.commit());
    if(_rvW.error) throw _rvW.error;
    (sale.items||[]).forEach(it=>{ logStockMovement(it.id, it.name, it.isReturn ? -it.qty : it.qty, 'reversal', 'عكس فاتورة كاملة'); });

    // 2) سجل عملية عكس منفصلة (رقم سالب) عشان التقارير تفضل دقيقة
    const _rvW2 = await _waitWrite(db.collection(TEST_SALES).add({
      isReversal: true,
      // 💳 مدفوعات سالبة بنفس طرق الفاتورة الأصلية — من غيرها كاش/فيزا التقفيل
      // كانوا بيفضلوا شايلين مبلغ فاتورة اتعكست (الإجمالي بس اللي كان بيتصفّر)
      payments: (function(p){ const o = {}; Object.entries(p||{}).forEach(([k,v])=>{ o[k] = -(+v||0); }); return o; })(sale.payments),
      originalSaleId: saleId,
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name || '',
      branch: currentBranch,
      items: sale.items,
      itemCount: -(sale.itemCount||0),
      total: -(sale.total||0),
      cartSid: _cartSid || null,             // 🕵️ رابط أحداث السلة دي بالفاتورة
      createdAtMs: Date.now(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }));
    if(_rvW2.error) console.error('سجل العكس', _rvW2.error);

    showToast(_offlineQueued ? '📴 اتعكست أوفلاين ✅ — هتترفع لما النت يرجع' : 'اتعكست الفاتورة ✅ والكمية رجعت للمخزون', 'ok');
    renderReverseList();
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
  finally{ _busyOps.delete('reverse_'+saleId); }
}


// >>> CAP_POS_START
// 📱 «يسجّل بنفسه»: الكاشير بيدوس زر → شاشة التقييم قدام العميل بتتحول لكيبورد
// يكتب رقمه (واسمه لو جديد) → البيانات بتنط هنا في خانة العميل تلقائي.
// التواصل عبر مستند واحد لكل فرع: pos_capture/{branch} — قراءات شبه صفرية.
const CAP_COL = 'pos_capture';
const CAP_FRESH_MS = 300 * 1000;   // 5 دقايق (العميلة بتاخد وقتها في كتابة رقمها)
let _capUnsub = null, _capAskId = null;

// رقم موبايل مصري سليم؟ (11 رقم بيبدأ 01)
function _capValidPhone(p){
  var d = String(p||'').replace(/\D/g,'');
  return /^01\d{9}$/.test(d) ? d : null;
}
// الطلب لسه طازة؟
function _capFresh(data, now){ return !!(data && data.ts && ((now||Date.now()) - data.ts) < CAP_FRESH_MS); }
// POS بيقرر يعمل إيه مع تحديث المستند (منطق صافي قابل للاختبار)
function _capNextAction(data, myAskId, now){
  if(!data || data.askId !== myAskId || !_capFresh(data, now)) return null;
  if(data.mode === 'phone'  && _capValidPhone(data.phone)) return { act:'lookup', phone:_capValidPhone(data.phone) };
  if(data.mode === 'named' && _capValidPhone(data.phone)) return { act:'fill', phone:_capValidPhone(data.phone), name:String(data.name||'').trim() };
  return null;
}
// <<< CAP_POS_END

function _capDocRef(){ return db.collection(CAP_COL).doc(currentBranch); }

// 💚 الإطار الأخضر = الشاشة **ظاهرة فعلًا** قدام العميل دلوقتي
// مش تخمين ولا مؤشر اتصال: شاشة التقييم بتكتب تأكيد لما تعرض الشاشة فعلًا،
// والإطار بيتبني على التأكيد ده. يظهر ويختفي في نفس اللحظة.
let _capAliveUnsub = null;
function capShowing(data, askId){
  if(!data) return false;
  const shown = data.shownAskId;
  if(!shown) return false;                       // اتقفلت أو اتلغت
  if(askId && shown !== askId && shown !== 'on') return false;  // طلب تاني مش بتاعنا
  return true;
}
window.capShowing = capShowing;

function capPaintBtn(showing){
  const btn = document.querySelector('[onclick="capAskCustomer()"]');
  if(btn){
    if(showing){
      btn.style.border = '2px solid #22c55e';
      btn.style.boxShadow = '0 0 10px #22c55e66';
      btn.title = '✅ الشاشة ظاهرة قدام العميل دلوقتي';
    } else {
      btn.style.border = '1px solid var(--border)';
      btn.style.boxShadow = 'none';
      btn.title = 'العميل يكتب رقمه بنفسه على شاشة التقييم';
    }
  }
  // زرار إلغاء بيظهر تحت الزرار طول ما الشاشة شغالة
  let c = document.getElementById('capCancelBtn');
  if(showing){
    if(!c && btn && btn.parentNode){
      c = document.createElement('button');
      c.id = 'capCancelBtn';
      c.type = 'button';
      c.textContent = '✖ إلغاء';
      // زرار صغير جنب الزرار الأصلي — كان سطر كامل وواخد مساحة كبيرة
      c.style.cssText = 'display:inline-block; margin-right:5px; padding:5px 9px;'
        + 'border-radius:7px; border:1px solid var(--minus); background:transparent;'
        + "color:var(--minus); font-family:'Cairo'; font-weight:800; font-size:10.5px;"
        + 'cursor:pointer; white-space:nowrap; line-height:1.3;';
      c.title = 'إلغاء طلب التسجيل';
      c.addEventListener('click', capCancelAsk);
      btn.parentNode.insertBefore(c, btn.nextSibling);
    }
  } else if(c){ c.remove(); }
}

// ✖ إلغاء الطلب من الكاشير — الشاشة بتتقفل عند العميل فورًا
async function capCancelAsk(){
  try{
    await _capDocRef().set({ mode:'idle', ts: Date.now(), askId:null }, { merge:true });
    _capAskId = null;
    capPaintBtn(false);
    showToast('اتلغى طلب التسجيل', 'ok');
  }catch(e){ showToast('تعذر الإلغاء: ' + e.message, 'err'); }
}
window.capCancelAsk = capCancelAsk;

function capWatchAlive(){
  if(_capAliveUnsub || !currentBranch) return;
  try{
    _capAliveUnsub = _capDocRef().onSnapshot(function(d){
      const data = d.exists ? d.data() : null;
      capPaintBtn(capShowing(data, _capAskId));
    }, function(e){
      console.warn('cap watch', e && e.code);
      _capAliveUnsub = null;
      capPaintBtn(false);
    });
  }catch(e){ console.warn('cap watch start', e); }
}
window.capWatchAlive = capWatchAlive;

// ⭐ قيمة نقطة البياعة للفاتورة الواحدة
// بترجّع صفر لو الفاتورة مش مستوفية الشروط، وإلا 1 + كسور القطع الزيادة.
function calcStaffPoint(itemCount, total, minItems, minInvoice, enabled, isRefund){
  if(enabled === false) return 0;
  if(isRefund) return 0;                                   // المرتجع مبياخدش نقط
  const need = Number(minItems);
  const gate = (isNaN(need) || need <= 0) ? 1 : need;      // الحد الأدنى للقطع
  const n = Number(itemCount) || 0;
  if(n < gate) return 0;                                   // لازم توصل الحد الأول
  if(Number(total) < (Number(minInvoice) || 0)) return 0;   // بوابة القيمة (مش بتدي كسور)
  const extra = n - gate;                                   // القطع الزيادة
  return +(1 + extra / gate).toFixed(3);                    // نقطة + كسور
}
if(typeof window !== 'undefined') window.calcStaffPoint = calcStaffPoint;

/* ============================================================
   ⭐ نقط إضافية على منتج بعينه — «حملة»
   ------------------------------------------------------------
   نظام النقط العادي بيكافئ **عدد القطع**: كل (الحد) قطع = نقطة.
   ده كويس للمجهود العام، بس مش بيحرّك منتج معيّن. الحملة بتقول
   للموظفة: «القطعة دي لوحدها بنقطة» — فبتعرضها فعلًا.

   ⚠️ **بتتزاد فوق** النقطة العادية مش بديلها. لو بديل، الموظفة
      اللي بتبيع منتج الحملة بتخسر نقط القطع التانية، فتبقى الحملة
      عقاب مش حافز.
   ⚠️ **تاريخ انتهاء إجباري.** حملة من غير نهاية بتفضل شغالة نسيان،
      والموظفة تاخد نقط على منتج المالك بطّل يهتم بيه من شهور.
   ⚠️ المرتجع = صفر. ولو مفيش تاريخ (بيانات قديمة) بتتعامل كمنتهية —
      **الافتراضي الآمن هو مفيش نقط**، مش نقط للأبد.
   ============================================================ */
function calcStaffBonus(cart, boosts, nowMs, isRefund){
  if(isRefund) return 0;
  const list = (boosts && boosts.items) || [];
  if(!list.length) return 0;
  const now = Number(nowMs) || Date.now();

  const active = {};
  list.forEach(function(b){
    if(!b || b.active === false) return;
    const until = Number(b.until) || 0;
    if(!until || until < now) return;            // منتهية أو من غير تاريخ
    const pts = Number(b.points) || 0;
    if(pts <= 0) return;
    active[String(b.barcode)] = pts;
  });

  let sum = 0;
  (cart || []).forEach(function(c){
    if(!c || c.isReturn || c.isRedemption || c.isRewardDiscount) return;
    const pts = active[String(c.barcode)];
    if(!pts) return;
    const q = Math.max(0, Math.floor(Number(c.qty) || 0));
    sum += pts * q;
  });
  return +sum.toFixed(3);
}
if(typeof window !== 'undefined') window.calcStaffBonus = calcStaffBonus;

/* 🔎 الحملات الشغالة دلوقتي — للعرض على الكاشير. */
function activeBoosts(boosts, nowMs){
  const now = Number(nowMs) || Date.now();
  return (((boosts && boosts.items) || [])).filter(function(b){
    return b && b.active !== false && Number(b.points) > 0
        && Number(b.until) > now;
  });
}
if(typeof window !== 'undefined') window.activeBoosts = activeBoosts;

/* ⭐ حملات نقط الموظفين — مستند واحد بيتقري مع إعدادات النقط. */
let staffBoosts = null;
async function loadStaffBoosts(){
  try{
    const id = 'staff_point_boosts_' + (typeof catalogBrand === 'function' ? catalogBrand() : 'echarpe');
    const d = await db.collection(TEST_SETTINGS).doc(id).get();
    staffBoosts = d.exists ? d.data() : { items: [] };
  }catch(e){ staffBoosts = { items: [] }; }
  if(typeof window !== 'undefined') window.staffBoosts = staffBoosts;
  return staffBoosts;
}
if(typeof window !== 'undefined') window.loadStaffBoosts = loadStaffBoosts;

async function capAskCustomer(){
  if(!currentBranch){ showToast('سجّل دخول الأول', 'err'); return; }
  _capAskId = Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  try{
    await _waitWrite(_capDocRef().set({ mode:'ask', ts: Date.now(), askId:_capAskId }));
    showToast('📱 اطلب من العميل يكتب رقمه على شاشة التقييم', 'ok');
    _capStartListener();
  }catch(e){ showToast('تعذر إرسال الطلب: ' + e.message, 'err'); }
}

function _capStartListener(){
  if(_capUnsub) return;
  _capUnsub = _capDocRef().onSnapshot(async (d)=>{
    const data = d.exists ? d.data() : null;
    if(!data || !_capAskId) return;
    // نتجاهل طلباتنا اللي احنا كتبناها (need_name/greet) — نرد بس على رد الكشك
    if(data.askId !== _capAskId) return;
    if(!_capFresh(data)) return;

    // 1) العميلة كتبت رقمها → نلاقيها ولا نطلب اسمها
    if(data.mode === 'phone'){
      const phone = _capValidPhone(data.phone);
      if(!phone) return;
      let cust = null;
      try{ const cd = await db.collection(TEST_CUSTOMERS).doc(phone).get(); cust = cd.exists ? cd.data() : null; }catch(e){}
      if(cust){
        _capFill(phone, cust.name || '');
        _capDocRef().set({ mode:'greet', greetName: cust.name || '', isNew:false, ts:Date.now(), askId:_capAskId }).catch(()=>{});
        showToast('🙋‍♀️ ' + (cust.name || phone) + ' — اتسجلت في الفاتورة', 'ok');
        _capAskId = null;   // اكتمل
      }else{
        // عميلة جديدة → نطلب اسمها، والطلب يفضل مفتوح
        _capDocRef().set({ mode:'need_name', phone: phone, ts:Date.now(), askId:_capAskId }).catch(()=>{});
      }
      return;
    }

    // 2) العميلة الجديدة كتبت اسمها → نكمّل التسجيل
    if(data.mode === 'named'){
      const phone = _capValidPhone(data.phone);
      if(!phone) return;
      _capFill(phone, String(data.name||'').trim());
      _capDocRef().set({ mode:'greet', greetName: String(data.name||'').trim(), isNew:true, ts:Date.now(), askId:_capAskId }).catch(()=>{});
      showToast('🆕 ' + (String(data.name||'').trim() || phone) + ' — عميل جديد اتسجل في الفاتورة', 'ok');
      _capAskId = null;   // اكتمل
      return;
    }
  }, (e)=> console.warn('cap listener', e));
}

function _capFill(phone, name){
  const pEl = document.getElementById('customerPhone');
  const nEl = document.getElementById('customerName');
  if(pEl) pEl.value = phone;
  if(nEl && name) nEl.value = name;
  if(typeof refreshCustomerInfo === 'function') refreshCustomerInfo();
}

// ---------------- Hold / Unhold ----------------
async function holdInvoice(){
  if(cart.length === 0){ showToast('الفاتورة فاضية', 'err'); return; }
  try{
    _offlineQueued = false;
    const _hw = await _waitWrite(db.collection(TEST_HELD).add({
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name || '',
      branch: currentBranch,
      customerPhone: document.getElementById('customerPhone').value.trim(),
      customerName: document.getElementById('customerName').value.trim(),
      items: cart,
      total: cartTotal(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }));
    if(_hw.error) throw _hw.error;
    showToast(_offlineQueued ? '📴 اتعلّقت أوفلاين ✔ — هتترفع لما النت يرجع' : 'اتحفظت كـ فاتورة معلّقة ✔', 'ok');
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
    await _waitWrite(db.collection(TEST_HELD).doc(heldId).delete());
    closeHeldModal();
    renderCart();
    showScreen('saleScreen');
  }catch(e){ showToast('فشل الاسترجاع: ' + e.message, 'err'); }
}

// ---------------- Payment ----------------
function resetPaymentUI(_force){
  // 💳 كارت اتسحب فعلًا: مسح المدفوعات بيلغي أثره من الشاشة بس — الفلوس عند العميل
  // مسحوبة. لازم تأكيد صريح، وإلا هيتحفظ نقص في الفاتورة وأوفر في التقفيل.
  const _appr = Math.abs(cardApprovedSum(cardLegs));
  if(!_force && _appr > 0){
    const ok = confirm('⚠️ فيه ' + _appr.toFixed(2) + ' ج.م اتسحبوا فعلًا من الكارت.\n'
      + 'مسح المدفوعات مش بيرجّع الفلوس — لازم مرتجع من Paymob.\nتكمّل المسح؟');
    if(!ok) return;
    if(typeof _logActivity === 'function') _logActivity('card_payments_cleared', { amount: _appr });
  }
  selectedPayMethods = new Set();
  paymentAmounts = {};
  cardLegs = []; window.cardLegs = cardLegs;
  const _ob = document.getElementById('cardOverBanner'); if(_ob) _ob.remove();
  document.querySelectorAll('.qbx-pay-btns button').forEach(el=>el.classList.remove('selected', 'filled'));
  // 🔄 إلغاء طلب الفيزا المعلّق — من غير كده الطلب بيفضل مستني ويعطّل أي طريقة دفع تانية
  try{
    if(typeof paymobPending !== 'undefined' && paymobPending){
      paymobCancelPending();
    } else if(typeof paymobReset === 'function'){ paymobReset(); }
  }catch(e){ console.warn('paymob cancel', e); }
  updatePaySummary();
}

// ❌ إلغاء طلب الفيزا المعلّق
// ⚠️ Paymob مفيهاش أمر يسحب الطلب من الماكينة بعد ما يوصلها. لو سبناه،
// عميل تاني ممكن يدفع عليه فتدخل فلوس من غير فاتورة مقابلة —
// فبنوقف الكاشير بشاشة تأكيد إجبارية قبل ما نكمّل.
function paymobCancelPending(){
  // ✅ لو الدفع اتقبل خلاص، مفيش طلب معلّق على الماكينة أصلًا —
  // فالتنضيف بعد الفاتورة الناجحة بيعدّي بصمت من غير أي شاشة.
  if(!paymobPending || paymobApproved){ paymobReset(); return; }
  const amount = paymobPending.amount || 0;
  showCancelTerminalConfirm(amount, function(){
    paymobReset();
    paymobShow('❌ اتلغى طلب الفيزا', 'err');
    setTimeout(function(){
      const box = document.getElementById('paymobStatus');
      if(box) box.style.display = 'none';
    }, 5000);
    if(typeof _logActivity === 'function') _logActivity('paymob_cancelled', { amount: amount });
  });
}
window.paymobCancelPending = paymobCancelPending;

// 🛑 شاشة تأكيد إلغاء الطلب من الماكينة — إجبارية، مفيش تخطي
function showCancelTerminalConfirm(amount, onConfirm){
  const old = document.getElementById('cancelTerminalOverlay');
  if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'cancelTerminalOverlay';
  ov.style.cssText = 'position:fixed; inset:0; z-index:12500; background:rgba(0,0,0,.86);'
    + 'display:flex; align-items:center; justify-content:center; padding:20px;';
  ov.innerHTML = `
    <div style="background:var(--panel); border:3px solid #e5484d; border-radius:18px;
                padding:26px 22px; max-width:460px; width:100%; text-align:center;">
      <div style="font-size:40px; line-height:1; margin-bottom:10px;">🛑</div>
      <div style="font-size:17px; font-weight:900; color:#ff9a9d; margin-bottom:8px;">
        راجع طلب الفيزا على الماكينة
      </div>
      <div style="color:var(--muted); font-size:13.5px; line-height:1.8; margin-bottom:6px;">
        فيه محاولة بمبلغ <b style="color:var(--text);">${Number(amount).toFixed(2)} ج.م</b> نتيجتها مش مؤكدة عند السيستم.
        لو الطلب ظاهر على الماكينة الغيه. لو مش ظاهر أصلًا، تأكد إن مفيش عملية شغالة قبل ما تنظف المحاولة.
      </div>
      <div style="background:#2a1416; border:1px solid #e5484d55; border-radius:10px;
                  padding:10px 12px; margin:12px 0; color:#ffd9da; font-size:12.5px; font-weight:700;">
        راجع شاشة الماكينة دلوقتي: مفيش طلب حي / أو ألغيت الطلب، وبعدين دوس تحت
      </div>
      <button id="cancelTermOk" disabled style="width:100%; padding:15px; border:none; border-radius:12px;
              background:#4b1c1e; color:#ffffff66; font-family:'Cairo'; font-weight:900; font-size:15px;
              cursor:not-allowed;">اتأكد… (<span id="cancelTermCount">3</span>)</button>
      <button id="cancelTermBack" style="margin-top:8px; width:100%; padding:11px; border-radius:10px;
              background:var(--panel2); border:1px solid var(--border); color:var(--muted);
              font-family:'Cairo'; font-weight:700; font-size:13px; cursor:pointer;">
        رجوع — سيب الطلب زي ما هو</button>
    </div>`;
  document.body.appendChild(ov);
  const ok = ov.querySelector('#cancelTermOk');
  const cnt = ov.querySelector('#cancelTermCount');
  // 3 ثواني قبل ما الزرار يشتغل — عشان محدش يدوس بسرعة من غير ما يروح للماكينة
  let left = 3;
  const tick = setInterval(function(){
    left--;
    if(left > 0){ if(cnt) cnt.textContent = left; return; }
    clearInterval(tick);
    ok.disabled = false;
    ok.style.cssText = 'width:100%; padding:15px; border:none; border-radius:12px;'
      + 'background:linear-gradient(#dc2626,#b91c1c); color:#fff; font-family:\'Cairo\';'
      + 'font-weight:900; font-size:15px; cursor:pointer;';
    ok.textContent = 'راجعت الماكينة — مفيش طلب حي ✅';
  }, 1000);
  const close = ()=>{ clearInterval(tick); const el = document.getElementById('cancelTerminalOverlay'); if(el) el.remove(); };
  ok.addEventListener('click', function(){ if(ok.disabled) return; close(); onConfirm(); });
  ov.querySelector('#cancelTermBack').addEventListener('click', close);
  // مفيش قفل بالضغط برة ولا بـ Escape — لازم قرار واضح
}
window.showCancelTerminalConfirm = showCancelTerminalConfirm;

let paymentAmounts = {}; // {cash: 50, visa: 120, ...} — filled in via the popup
let pendingPayMethod = null;

// ============================================================
// 💳💳 الدفع بكارتين — «شرائح الكارت» (card legs)
// الفاتورة ممكن تتقسم على كارتين (كارت 1 و كارت 2). القاعدة الأساسية:
//   ❗ مفيش مفتاح دفع جديد في الفاتورة — payments.visa يفضل **مجموع** الكروت،
//     عشان التقارير والتقفيل (بيقروا p.visa) ما يتلمسوش خالص.
//   ❗ التفاصيل (كل كارت لوحده بمبلغه ورقم عمليته) بتتحفظ في cardTxns[].
// كل شريحة: { seq, amount, ref, status, txn }
//   status: 'entered' (اتسجل من غير ماكينة) · 'pending' (على الماكينة)
//           · 'approved' (اتأكد) · 'failed' (اترفض)
// ============================================================
const MAX_CARD_LEGS = 2;              // قرار المالك: كارتين بس
let cardLegs = [];
window.cardLegs = cardLegs;

// 💰 مجموع الكروت الحيّة (المسجّل + المعلّق + المؤكد) — ده اللي بيتحط في payments.visa
function cardLegsSum(legs){
  return +((legs || []).filter(function(l){ return l && l.status !== 'failed'; })
    .reduce(function(n, l){ return n + (Number(l.amount) || 0); }, 0)).toFixed(2);
}
// ✅ مجموع اللي اتسحب فعلًا من الماكينة (ده اللي مايتلغيش إلا بمرتجع من Paymob)
function cardApprovedSum(legs){
  return +((legs || []).filter(function(l){ return l && l.status === 'approved'; })
    .reduce(function(n, l){ return n + (Number(l.amount) || 0); }, 0)).toFixed(2);
}
function cardLegsPending(legs){
  return (legs || []).some(function(l){ return l && l.status === 'pending'; });
}
function cardLegBySeq(legs, seq){
  return (legs || []).filter(function(l){ return l && l.seq === seq; })[0] || null;
}
// ⚠️ اتسحب من الكروت أكتر من الفاتورة بكام؟ (بيحصل بس لو السلة اتعدّلت بعد السحب)
function cardOvercharge(legs, total){
  const d = +(Math.abs(cardApprovedSum(legs)) - Math.abs(Number(total) || 0)).toFixed(2);
  return d > 0.005 ? d : 0;
}
// 🔎 لقّي الشريحة اللي التأكيد ده بتاعها.
// 🔴 الباج الأصلي: التأكيد كان بيدور بالـseq **بس**، ولو مالقاش كان بيعدي بصمت
// (`if(_leg)` من غير else). النتيجة: Paymob يأكد والفلوس تتسحب، والشريحة تفضل
// pending للأبد → زرار الحفظ مقفول، و cardTxns بتتبني من approved بس →
// الفاتورة تطلع من غير بيانات كارت. العرضين من إصابة واحدة.
// دلوقتي 3 طبقات: الرقم ← مرجع الطلب (فريد لكل محاولة) ← الشريحة المعلّقة الوحيدة.
function findCardLeg(legs, seq, ref){
  const arr = (legs || []).filter(function(l){ return !!l; });
  let hit = arr.filter(function(l){ return l.seq === seq; })[0];
  if(hit) return hit;
  if(ref){
    hit = arr.filter(function(l){ return l.ref && String(l.ref) === String(ref); })[0];
    if(hit) return hit;
  }
  // تأكيد واحد + شريحة واحدة لسه على الماكينة = هي هي بالضرورة
  const pend = arr.filter(function(l){ return l.status === 'pending'; });
  return (pend.length === 1) ? pend[0] : null;
}
window.findCardLeg = findCardLeg;

// 💳 الشرائح اللي لسه على الماكينة (مبعوتة ومستنية رد)
// ⚠️ الحالة دي كانت بتقفل زرار الحفظ للأبد: لو التأكيد ماوصلش خالص (الـwebhook
// اتأخر أو الشبكة بلعته) والماكينة تكون طبعت وسحبت فعلًا — الكاشير كان محبوس
// في الفاتورة، ورسالة الـ10 دقايق بتقوله «احفظ يدوي» وهو مش قادر.
function cardPendingLegs(legs){
  return (legs || []).filter(function(l){ return l && l.status === 'pending'; });
}
function cardPendingSum(legs){
  return +cardPendingLegs(legs).reduce(function(n, l){
    return n + Math.abs(Number(l.amount) || 0); }, 0).toFixed(2);
}
// ✍️ تحويل شريحة معلّقة لتسجيل يدوي — الكاشير شاف إيصال الماكينة بعينه.
// الفلوس بتتسجل في الفاتورة عادي، بس **من غير رقم عملية** وبعلامة manual
// عشان مراجعة كشف Paymob تعرف اللي اتسجل بإيد مين. مش بتلمس المؤكد (approved).
function cardLegToManual(leg, terminalId, now){
  if(!leg || leg.status !== 'pending') return null;
  leg.status = 'manual';
  leg.manualAt = now || Date.now();
  if(!leg.txn){
    leg.txn = {
      seq: leg.seq,
      amount: +Math.abs(Number(leg.amount) || 0).toFixed(2),
      manual: true,                       // 🔑 علامة المراجعة
      orderRef: leg.ref || null,
      terminalId: terminalId || null,
      transactionId: null, approvalCode: null, rrn: null,
      last4: null, scheme: null, amountCents: null
    };
  }
  return leg.txn;
}
window.cardPendingLegs = cardPendingLegs;
window.cardPendingSum = cardPendingSum;
window.cardLegToManual = cardLegToManual;

// 🚧 هل مسموح أفتح شريحة الكارت رقم seq دلوقتي؟ (بترجّع سبب المنع أو null)
function cardLegBlockReason(legs, seq, isRefund, maxLegs){
  const max = maxLegs || 2;
  if(seq > max) return 'أقصى عدد كروت في الفاتورة الواحدة ' + max;
  // ⛔ الأهم: Paymob مفيهاش سحب طلب من الماكينة — طلبين على نفس الماكينة = كارثة
  if(cardLegsPending(legs)) return 'استنى رد الماكينة على الكارت اللي قبله';
  const ex = cardLegBySeq(legs, seq);
  if(ex && ex.status === 'approved'){
    return 'الكارت ده اتسحب خلاص (' + Math.abs(ex.amount).toFixed(2) + ' ج.م) — مايتعدلش';
  }
  if(seq > 1){
    if(isRefund) return 'المرتجع بكارت واحد بس';
    const prev = cardLegBySeq(legs, seq - 1);
    if(!prev) return 'ابدأ بالكارت الأول';
    if(prev.status !== 'approved') return 'لازم الكارت الأول يتأكد الأول';
  }
  return null;
}
// 💳 الكارت مفيهوش فكة: ممنوع المبلغ يزيد عن الباقي
function cardAmountReject(val, remainingAbs){
  if(!(Number(val) > 0)) return 'اكتب مبلغ صحيح';
  if(Number(val) > Number(remainingAbs) + 0.005){
    return 'الكارت مفيهوش فكة — أقصى مبلغ ' + Number(remainingAbs).toFixed(2) + ' ج.م';
  }
  return null;
}
// 🔢 أنهي شريحة كارت المفروض تتفتح من زر «فيزا» العام
function nextCardSeq(legs, maxLegs){
  const max = maxLegs || 2;
  for(let s = 1; s <= max; s++){
    const l = cardLegBySeq(legs, s);
    if(!l || l.status === 'failed') return s;
  }
  return 0;   // كله اتسحب
}
window.cardLegsSum = cardLegsSum;
window.cardApprovedSum = cardApprovedSum;
window.cardLegsPending = cardLegsPending;
window.cardLegBySeq = cardLegBySeq;
window.cardOvercharge = cardOvercharge;
window.cardLegBlockReason = cardLegBlockReason;
window.cardAmountReject = cardAmountReject;
window.nextCardSeq = nextCardSeq;

// 🔄 بيزامن paymentAmounts.visa مع الشرائح + بيشيل الفيزا خالص لو مفيش شريحة حيّة
function syncCardPayment(){
  const live = (cardLegs || []).filter(function(l){ return l && l.status !== 'failed'; });
  const total = cartTotal();
  if(!live.length){
    delete paymentAmounts.visa;
    if(selectedPayMethods && selectedPayMethods.delete) selectedPayMethods.delete('visa');
  } else {
    const sum = cardLegsSum(cardLegs);
    paymentAmounts.visa = total < 0 ? -Math.abs(sum) : Math.abs(sum);
    selectedPayMethods.add('visa');
  }
  window.cardLegs = cardLegs;
}
window.syncCardPayment = syncCardPayment;

let pendingCardSeq = 0;   // 💳 شريحة الكارت المفتوحة في البوب-أب (1 أو 2)

function togglePayMethod(method){
  const total = cartTotal();
  const isRefund = total < 0;
  const isCard = (method === 'visa' || method === 'visa1' || method === 'visa2');
  // 💳 زر «فيزا» العام يروح لأول كارت متاح، لكن visa1 (F3) ثابت على كارت 1.
  let seq = 0;
  if(isCard){
    seq = (method === 'visa2') ? 2 : (method === 'visa1' ? 1 : nextCardSeq(cardLegs, MAX_CARD_LEGS));
    if(!seq){ showToast('⛔ الكارتين اتسحبوا خلاص', 'err'); return; }
    const block = cardLegBlockReason(cardLegs, seq, isRefund, MAX_CARD_LEGS);
    if(block){ showToast('⛔ ' + block, 'err'); return; }
    method = 'visa';        // 🔑 المفتاح في الفاتورة يفضل visa دايمًا (مجموع الكروت)
  }
  pendingCardSeq = seq;
  pendingPayMethod = method;
  const requiredAbs = Math.abs(total);
  // شرائح الكارت **بتتجمع** مش بتستبدل بعضها — فمجموع الفيزا الحالي محسوب ضمن المدفوع
  const alreadyEnteredAbs = Object.keys(paymentAmounts).reduce((s,m)=> (!isCard && m===method) ? s : s + Math.abs(paymentAmounts[m]||0), 0);
  const remaining = Math.max(0, +(requiredAbs - alreadyEnteredAbs).toFixed(2));
  if(isCard && remaining <= 0.005){ showToast('✅ الفاتورة اتغطت بالكامل', 'err'); return; }
  const labels = {cash:'💵 كاش', visa:'💳 فيزا', instapay:'📱 انستا باي', salary:'📄 خصم من الراتب'};

  document.getElementById('payAmountTitle').textContent =
    (isCard ? ('💳 كارت ' + seq + (seq > 1 ? ' — باقي ' + remaining.toFixed(2) + ' ج.م' : '')) : labels[method])
    + (isRefund ? ' (إرجاع للعميل)' : '');
  const input = document.getElementById('payAmountInput');
  // بيع عادي + كاش: فاضية عشان الكاشير يكتب المبلغ اللي استلمه فعليًا (والباقي بيتحسب تلقائي).
  // بيع عادي + فيزا/انستا باي: مقترحة تلقائي بباقي الفاتورة.
  // فاتورة مرتجع (الإجمالي بالسالب): مقترحة تلقائي بقيمة المبلغ المطلوب إرجاعه للعميل، بأي وسيلة.
  let _suggest = remaining;
  if(method === 'salary' && staffPurchase){
    const salaryLeft = Math.max(0, staffPurchase.salaryCap - staffPurchase.salaryUsed);
    _suggest = Math.min(remaining, salaryLeft);
    if(salaryLeft <= 0){ showToast('⛔ وصلت للحد الأقصى لخصم الراتب الشهر ده (' + staffPurchase.salaryCap + ' ج.م)', 'err'); return; }
  }
  input.value = (method === 'cash' && !isRefund) ? '' : _suggest.toFixed(2);
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

// 🖲️ زرار كل طريقة دفع — كان فيه باج: 'salary' كان بيلوّن زرار الانستا باي
function payBtnId(method, seq){
  if(method === 'visa') return (seq > 1) ? 'pmVisa2' : 'pmVisa';
  return { cash:'pmCash', instapay:'pmInsta', salary:'pmSalary' }[method] || '';
}
window.payBtnId = payBtnId;

function confirmPayAmount(){
  const method = pendingPayMethod;
  if(!method) return;
  const seq = pendingCardSeq;
  const isCard = (method === 'visa');
  const val = parseFloat(document.getElementById('payAmountInput').value) || 0;
  if(val <= 0){ showToast('اكتب مبلغ صحيح', 'err'); return; }
  // في فاتورة المرتجع (إجمالي بالسالب) المبلغ بيتسجل بالسالب (فلوس خارجة)، وفي البيع العادي بالموجب.
  const total = cartTotal();
  const requiredAbs = Math.abs(total);
  const alreadyAbs = Object.keys(paymentAmounts).reduce((s,m)=> (!isCard && m===method) ? s : s + Math.abs(paymentAmounts[m]||0), 0);
  const remaining = Math.max(0, +(requiredAbs - alreadyAbs).toFixed(2));
  let sentToTerminal = false;
  if(isCard){
    // 💳 سقف صارم: الكارت مفيهوش فكة — لو سحبنا أكتر من الفاتورة هيطلع أوفر في التقفيل
    const bad = cardAmountReject(val, remaining);
    if(bad){ showToast('⛔ ' + bad, 'err'); return; }
    // محاولة قديمة مرفوضة بنفس الرقم بتتشال ومكانها المحاولة الجديدة
    cardLegs = cardLegs.filter(function(l){ return !(l.seq === seq && l.status !== 'approved'); });
    cardLegs.push({ seq: seq, amount: total < 0 ? -val : val, ref: null, status: 'entered', txn: null });
    cardLegs.sort(function(a,b){ return a.seq - b.seq; });
    syncCardPayment();
  } else {
    paymentAmounts[method] = total < 0 ? -val : val;
    selectedPayMethods.add(method);
  }
  const _btn = document.getElementById(payBtnId(method, seq));
  if(_btn) _btn.classList.add('selected','filled');
  document.getElementById('payAmountModal').classList.remove('active');
  pendingPayMethod = null;
  pendingCardSeq = 0;
  updatePaySummary();
  // 📟 فيزا في بيع عادي → المبلغ يروح لماكينة Paymob تلقائيًا (لو الربط متفعّل)
  if(isCard && val > 0 && total > 0){ sentToTerminal = true; sendToPaymobTerminal(val, seq); }
  // ⚡ دفع مقسّم (فيزا + كاش): الماكينة أكدت الأول والكاشير كمّل الباقي دلوقتي —
  // قبل كده فرصة الطباعة التلقائية كانت بتضيع (بتتفحص مرة واحدة وقت تأكيد
  // الماكينة بس) وكان لازم يدوس حفظ بنفسه. دلوقتي بنعيد الفحص بعد كل تسجيل دفع.
  if(!sentToTerminal
     && typeof paymobApproved !== 'undefined' && paymobApproved
     && typeof paymobAutoPrint === 'function' && paymobAutoPrint()
     && paymobPending
     && paymobCanAutoFinish(paymobPending.amount,
          { amountCents: (paymobCardInfo && paymobCardInfo.amountCents) || Math.round((paymobPending.amount || 0) * 100) },
          paymobPending.ref)){
    _paymobAutoFired = paymobPending.ref;   // 🔑 قفل الطلب ده بس
    paymobShow('✅ المدفوعات كملت — بيحفظ ويطبع…', 'ok');
    try{ confirmPayment(); }catch(e){ console.warn('auto print (split)', e); }
  }
}

// ============================================================
// 📟 Paymob POS Terminal — المبلغ بيظهر على الماكينة لوحده
// الكاشير مش بيشوف ولا يلمس أي مفاتيح: الطلب بيروح لـ Cloud Function
// (paymobTerminalOrder) اللي شايلة API Key وبتكلم Paymob:
//   1) auth token   2) order registration + terminal_id + card
// الإعداد في pos_test_settings/paymob: { enabled, terminalIdByBranch: {فرع: رقم} }
// ============================================================
// ⚠️ الباج اللي وقف الطباعة التلقائية:
// المستمع لو فشل مرة (سباق دخول الفرع مثلًا) كان بيفضل فاضي طول الجلسة،
// و paymobAutoPrint() بترجع false لو الإعداد فاضي → الطباعة التلقائية تقف
// **من غير أي رسالة**. دلوقتي: إعادة محاولة + الإعداد مبيتصفّرش.
let paymobCfg = null;
let _pmCfgUnsub = null, _pmCfgLoaded = false;
function watchPaymobCfg(){
  if(_pmCfgUnsub) return;
  try{
    _pmCfgUnsub = db.collection(TEST_SETTINGS).doc('paymob').onSnapshot(function(snap){
      _pmCfgLoaded = true;
      if(snap.exists) paymobCfg = snap.data();
      // المستند مش موجود → بنسيب اللي محمّل زي ما هو (مش بنصفّره)
    }, function(e){
      console.warn('paymob cfg', e && e.code);
      _pmCfgUnsub = null;
      setTimeout(watchPaymobCfg, 3000);      // إعادة المحاولة
    });
  }catch(e){ _pmCfgUnsub = null; setTimeout(watchPaymobCfg, 3000); }
}
// (بيشتغل في المتصفح بس — الاختبارات بتقرا الملف من غير بيئة متصفح)
if(typeof window !== 'undefined' && typeof setInterval === 'function'){
  watchPaymobCfg();
  setInterval(function(){ if(!_pmCfgUnsub) watchPaymobCfg(); }, 10000);   // شبكة أمان
}
window.paymobCfgLoaded = function(){ return _pmCfgLoaded; };

function paymobTerminalId(){
  if(!paymobCfg || !paymobCfg.enabled) return null;
  const byBr = paymobCfg.terminalIdByBranch || {};
  return byBr[currentBranch] || paymobCfg.terminalId || null;
}

// 🔒 حالة الدفع بالكارت للعملية الحالية — بتتصفّر مع كل سلة جديدة
let paymobPending = null;     // { ref, unsub, amount }
let paymobApproved = false;   // بيبقى true بس لما Paymob يأكد النجاح
const PM_PENDING_RECOVERY_MS = 8000; // لو الماكينة طبعت قبل وصول الويبهوك، نظهر مخرج واضح بسرعة
window.paymobApproved = false;

// 🔌 بيقفل المتابعة الحالية بس (شريحة كارت خلصت أو اتلغت) —
// الشرائح المؤكدة وبياناتها بتفضل زي ما هي عشان الكارت التاني يكمّل عليها
function paymobResetActive(){
  try{ paymobStuckClear(); }catch(e){}
  try{ paymobPendingRecoveryClear(); }catch(e){}
  // 🔴 باج: الكود القديم كان بينادي paymobReset() كامل مع كل إرسال للماكينة،
  // وهي كانت بتصفّر _paymobAutoFired. لما اتقسمت الدالة عشان الكارتين، التصفير
  // ده ضاع — فأول ما الحارس يعلق على true (لو حصل خطأ بعد الطباعة)، كل الفواتير
  // اللي بعده بتترفض بـ«اتنفذت قبل كده» للأبد لحد ما التطبيق يقفل ويفتح.
  // طلب جديد للماكينة = محاولة دفع جديدة، يبقى الحارس لازم يتصفّر.
  _paymobAutoFired = false;
  _pmPollFails = 0;              // 📴 محاولة جديدة = عداد فشل الشبكة يبدأ من الأول
  try{ paymobWaitBar(false); }catch(e){}
  if(paymobPending && paymobPending.unsub){ try{ paymobPending.unsub(); }catch(e){} }
  if(paymobPending && paymobPending.poll){ try{ clearInterval(paymobPending.poll); }catch(e){} }
  paymobPending = null;
  paymobApproved = false;
  window.paymobApproved = false;
}
window.paymobResetActive = paymobResetActive;

function paymobReset(){
  _paymobAutoFired = false;
  paymobResetActive();
  // لو مفيش موافقة حصلت فعلًا، إلغاء طلب الفيزا يرجّع السلة قابلة للتعديل.
  // لو فيه موافقة، تفضل مقفولة لحد حفظ/إنهاء الفاتورة عشان الفلوس اتسحبت بالفعل.
  if(!_cardFirstApprovedAt){ _cardMoneyAtRiskAt = null; _cartEditsAfterCard = []; _cardAdjustmentMode = false; _cardAdjustmentApprovedAmount = 0; }
  paymobCardInfo = null; window.paymobCardInfo = null;
  paymobCardTxns = []; window.paymobCardTxns = paymobCardTxns;
  cardLegs = []; window.cardLegs = cardLegs;
  const box = document.getElementById('paymobStatus');
  if(box){ box.style.display = 'none'; box.textContent = ''; }
  if(typeof updatePaySummary === 'function') updatePaySummary();
}
window.paymobReset = paymobReset;

// ✅ v353 — نهاية فاتورة ناجحة = مفيش أي حالة كارت من الفاتورة القديمة
// ينفع نمسح الـrisk هنا فقط لأن الفاتورة اتحفظت بالفعل. أثناء الفاتورة الحالية
// paymobReset() يفضل محافظ على القفل لو فيه كارت Approved لحماية فرق المبلغ.
function clearCardSaleCompleteState(){
  _cardFirstApprovedAt = null;
  _cardMoneyAtRiskAt = null;
  _cartEditsAfterCard = [];
  _cardAdjustmentMode = false;
  _cardAdjustmentApprovedAmount = 0;
}
window.clearCardSaleCompleteState = clearCardSaleCompleteState;

// ⏳ شريط متحرك أثناء انتظار رد Paymob
// التأخير نفسه من عندهم ومش في إيدنا — بس الشاشة الواقفة بتحسّس بضعف البطء الحقيقي.
function paymobWaitBar(on){
  let bar = document.getElementById('paymobWaitBar');
  if(!on){ if(bar) bar.remove(); return; }
  if(bar) return;
  const box = document.getElementById('paymobStatus');
  if(!box || !box.parentNode) return;
  const st = document.createElement('style');
  st.id = 'paymobWaitStyle';
  if(!document.getElementById('paymobWaitStyle')){
    st.textContent = '@keyframes pmSlide{0%{transform:translateX(-100%);}100%{transform:translateX(400%);}}';
    document.head.appendChild(st);
  }
  bar = document.createElement('div');
  bar.id = 'paymobWaitBar';
  bar.style.cssText = 'height:4px; border-radius:99px; margin:6px 0 0; overflow:hidden;'
    + 'background:rgba(255,255,255,.08);';
  bar.innerHTML = '<div style="height:100%; width:25%; border-radius:99px;'
    + 'background:linear-gradient(90deg,#f59e0b,#fcd34d,#f59e0b);'
    + 'animation:pmSlide 1.1s linear infinite;"></div>';
  box.parentNode.insertBefore(bar, box.nextSibling);
}

function paymobPendingRecoveryClear(){
  const box = document.getElementById('paymobStuckBox');
  if(box && box.dataset && box.dataset.mode === 'pending-recovery'){
    box.style.display = 'none'; box.innerHTML = ''; delete box.dataset.mode;
  }
}
window.paymobPendingRecoveryClear = paymobPendingRecoveryClear;

function paymobPendingRecoveryRender(orderRef, amountEGP, seq){
  const box = document.getElementById('paymobStuckBox');
  if(!box || paymobApproved || !paymobPending || paymobPending.ref !== orderRef) return;
  const leg = findCardLeg(cardLegs, seq || 1, orderRef);
  if(!leg || leg.status !== 'pending') return;
  box.dataset.mode = 'pending-recovery';
  box.style.display = 'block';
  box.innerHTML = '<div style="background:#3a2c0e;color:#fff;border-radius:12px;padding:13px 15px;text-align:center;">'
    + '<div style="font-weight:900;font-size:16px;">📟 الماكينة لسه سابقه السيستم</div>'
    + '<div style="font-size:13px;font-weight:700;margin-top:5px;line-height:1.7;">لو إيصال الماكينة طلع ومكتوب عليه APPROVED، متستناش الويبهوك.</div>'
    + '<button id="pmPendingApprovedBtn" style="margin-top:10px;width:100%;padding:12px;border:none;border-radius:10px;background:#fff;color:#7c2d12;font-family:Cairo;font-weight:900;font-size:15px;cursor:pointer;">✅ الإيصال APPROVED — احفظ واطبع</button>'
    + '<button id="pmPendingWaitBtn" style="margin-top:7px;width:100%;padding:9px;border:1px solid rgba(255,255,255,.35);border-radius:10px;background:transparent;color:#fff;font-family:Cairo;font-weight:800;cursor:pointer;">⏳ لسه مستني</button>'
    + '</div>';
  const saveBtn = document.getElementById('pmPendingApprovedBtn');
  if(saveBtn) saveBtn.addEventListener('click', function(){
    try{ if(typeof _logActivity === 'function') _logActivity('paymob_stuck_rescue', { ref:orderRef, amount:Number(amountEGP)||0, seq:seq||1 }); }catch(e){}
    try{ confirmPayment(); }catch(e){ console.warn('pending rescue', e); }
  });
  const waitBtn = document.getElementById('pmPendingWaitBtn');
  if(waitBtn) waitBtn.addEventListener('click', function(){ paymobPendingRecoveryClear(); });
}
window.paymobPendingRecoveryRender = paymobPendingRecoveryRender;

function paymobShow(text, kind){
  let box = document.getElementById('paymobStatus');
  if(!box){
    box = document.createElement('div');
    box.id = 'paymobStatus';
    box.style.cssText = 'margin:8px 0; padding:10px 12px; border-radius:10px; font-size:13px; font-weight:700; text-align:center;';
    const list = document.getElementById('qbxPayList');
    if(list && list.parentNode) list.parentNode.insertBefore(box, list);
    else return;
  }
  const colors = {
    wait: 'background:#3a2c0e; border:1px solid #f59e0b66; color:#f5c451;',
    ok:   'background:#0f2e18; border:1px solid #22c55e66; color:#7ee2a0;',
    err:  'background:#3a1416; border:1px solid #e5484d66; color:#ff9a9d;'
  };
  box.style.cssText = box.style.cssText.replace(/background:[^;]*;|border:[^;]*;|color:[^;]*;/g,'') + (colors[kind] || colors.wait);
  box.style.display = 'block';
  box.textContent = text;
}

async function sendToPaymobTerminal(amountEGP, seq){
  seq = seq || 1;
  const legTag = (MAX_CARD_LEGS > 1) ? ('كارت ' + seq + ': ') : '';
  const tid = paymobTerminalId();
  if(!tid){
    // الربط مش متفعّل للفرع ده — نقولها صراحةً بدل الصمت، عشان الكاشير
    // ميستناش طباعة تلقائية مش جاية (ده الوضع الحالي في فروع echarpe
    // لحد ما Paymob يحلوا "You haven't set up a POS")
    paymobShow('ℹ️ الماكينة مش مربوطة بالسيستم في الفرع ده — بعد ما الماكينة تطبع التأكيد، دوس «حفظ وطباعة» بنفسك', 'wait');
    return;
  }
  const orderRef = currentBranch + '-' + Date.now();   // مرجع فريد لكل محاولة
  // 🔌 بنقفل متابعة الشريحة اللي فاتت بس — الكارت الأول المؤكد بيفضل محفوظ
  paymobResetActive();
  paymobShow('📟 ' + legTag + 'بنبعت المبلغ للماكينة…', 'wait');
  // 👂 المتابعة بتبدأ **قبل** الإرسال — لو رد HTTP ضاع لكن الطلب وصل فعلًا
  // لازم نفضل قادرين نلتقط نتيجة Paymob ونسمح بمسار التأكيد اليدوي الآمن.
  // 🔴 v352: الشريحة لازم تبقى pending **قبل fetch**، مش بعد نجاح رد HTTP.
  // نجاح/فشل رد الشبكة مش دليل إن الماكينة استلمت أو ما استلمتش الطلب.
  // لو سيبناها entered وقت timeout، manual confirmation مش هيشوفها أصلًا.
  const _sendingLeg = cardLegBySeq(cardLegs, seq);
  if(_sendingLeg){ _sendingLeg.ref = orderRef; _sendingLeg.status = 'pending'; }
  paymobWatch(orderRef, amountEGP, 0, seq);
  // 🕵️ v298: **من هنا** الفلوس معرّضة — المبلغ راح للماكينة والعميلة
  //    ممكن تحط الكارت في أي ثانية. أي تعديل في السلة بعد اللحظة دي
  //    ممكن يخلّي المسحوب أكبر من الفاتورة.
  //    ⚠️ كان مربوط بالموافقة (approvedAt) — والفجوة بين الرنين
  //       والموافقة (ثواني إلى دقيقة) كانت هتفوّت السبب الحقيقي.
  if(!_cardMoneyAtRiskAt) _cardMoneyAtRiskAt = Date.now();
  try{
    const res = await fetch(PAYMOB_FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount_cents: Math.round(amountEGP * 100),
        terminal_id: Number(tid),
        merchant_order_id: orderRef,
        branch: currentBranch
      })
    });
    const out = await res.json().catch(function(){ return {}; });
    if(res.ok && out.ok){
      // الشريحة already pending من قبل الإرسال؛ الرد هنا يثبت بس إن خدمة الطلب ردّت نجاح.
      const leg = cardLegBySeq(cardLegs, seq);
      if(leg){ leg.ref = orderRef; leg.status = 'pending'; }
      paymobShow('📟 ' + legTag + 'المبلغ على الماكينة (' + amountEGP.toFixed(2) + ' ج.م) — العميل يحط الكارت…', 'wait');
      paymobWaitBar(true);
      if(typeof updatePaySummary === 'function') updatePaySummary();
    } else {
      // الرد رفض — بس المتابعة فاضلة شغالة: لو الطلب كان وصل الماكينة رغم الرفض
      // الظاهري، التأكيد هيتلقط لوحده ويطبع عادي
      paymobShow('⚠️ ' + legTag + 'الماكينة مستجابتش (' + (out.error || res.status) + ') — لو المبلغ ظهر عليها كمّل عادي وهتاكد لوحدها، ولو لأ جرّب تاني', 'err');
    }
  }catch(e){
    // 🔴 نفس الفجوة: انقطاع لحظة الرد ≠ إن الطلب موصلش — المتابعة شغالة والتأكيد مش هيضيع
    paymobShow('⚠️ ' + legTag + 'مفيش اتصال بخدمة الماكينة — لو المبلغ ظهر عليها كمّل عادي وهتاكد لوحدها', 'err');
  }
}

// ⚡ الطباعة التلقائية شغّالة؟ (من إعدادات Paymob — المالك بيقفلها لو حب)
function paymobAutoPrint(){
  // 🔑 الافتراضي **شغّالة** فعلًا — الإعداد الفاضي (لسه محمّلش) مايوقفهاش.
  // بتتقفل بس لو الأدمن كتب autoPrint:false صراحةً.
  return !paymobCfg || paymobCfg.autoPrint !== false;
}
// ⛔ حارس الطباعة المكررة — 🔑 مربوط برقم الطلب نفسه، مش مفتاح عام:
// المفتاح العام (true/false) علق مرتين وعطّل الطباعة لكل الفواتير اللي بعده.
// دلوقتي بيخزّن orderRef بتاع الطلب اللي اتطبع — فأسوأ حاجة يمنعها هي تكرار
// طباعة **نفس الطلب**، وعمره ما يقدر يمنع طلب جديد (رقم جديد ≠ المخزّن).
let _pmPollFails = 0;           // 📴 محاولات متتالية فشلت في الوصول للسيرفر
let _pmPrintMark = null;        // ⏱️ طوابع قياس زمن الطباعة (بتتصفّر بعد كل فاتورة)
window._pmPrintMark = null;
let _paymobAutoFired = false;   // false أو orderRef بتاع الطلب اللي اتطبع
let paymobCardInfo = null;      // 💳 بيانات أول كارت (توافق مع الفواتير القديمة)
window.paymobCardInfo = null;
let paymobCardTxns = [];        // 💳💳 بيانات كل الكروت المؤكدة في الفاتورة الحالية
window.paymobCardTxns = paymobCardTxns;

// 🔒 الشروط اللي لازم تتحقق قبل ما نحفظ ونطبع من غير الكاشير
// بترجّع سبب المنع بالاسم عشان نعرف ليه مطبعتش (بدل ما نخمّن)
function paymobAutoSkipReason(amountEGP, txn, orderRef){
  // 🔑 بيمنع بس لو **نفس الطلب** اتطبع قبل كده — طلب جديد مايتمنعش أبدًا
  if(_paymobAutoFired && orderRef && String(_paymobAutoFired) === String(orderRef)) return 'اتنفذت قبل كده';
  if(!cart || !cart.length) return 'السلة فضيت قبل ما التأكيد يوصل';
  const paidCents = Number(txn && txn.amountCents) || 0;
  const wantCents = Math.round(amountEGP * 100);
  if(wantCents !== paidCents){
    return 'المبلغ مش مطابق — اتبعت ' + (wantCents/100).toFixed(2)
         + ' واتدفع ' + (paidCents/100).toFixed(2);
  }
  let entered = 0;
  try{ selectedPayMethods.forEach(function(m){ entered += paymentAmounts[m] || 0; }); }
  catch(e){ return 'تعذر قراءة المدفوعات'; }
  const need = Math.abs(cartTotal());
  if(Math.abs(entered) + 0.001 < need){
    return 'المدفوعات ناقصة — مسجّل ' + Math.abs(entered).toFixed(2)
         + ' من ' + need.toFixed(2) + ' (كمّل الباقي)';
  }
  return null;   // مفيش مانع
}
function paymobCanAutoFinish(amountEGP, txn, orderRef){
  const why = paymobAutoSkipReason(amountEGP, txn, orderRef);
  window._paymobLastSkip = why;   // بيفضل محفوظ للتشخيص
  return why === null;
}
window.paymobAutoSkipReason = paymobAutoSkipReason;

// 🩺 ليه الفاتورة الأخيرة مطبعتش لوحدها؟ اكتب payDiag() في الـ console
window.payDiag = function(){
  console.log('آخر سبب منع الطباعة التلقائية:', window._paymobLastSkip || '— مفيش (طبعت عادي)');
  console.log('الطباعة التلقائية مفعّلة؟', (typeof paymobAutoPrint === 'function' && paymobAutoPrint()) ? 'أيوه' : 'لأ');
  console.log('طلب معلّق؟', paymobPending ? paymobPending.ref : 'مفيش');
  console.log('اتأكد الدفع؟', paymobApproved ? 'أيوه' : 'لأ');
  console.log('حارس الطباعة (_paymobAutoFired):', _paymobAutoFired
    ? ('مقفول على الطلب ' + _paymobAutoFired + ' بس — الطلبات الجديدة مش بتتأثر')
    : 'سليم (false)');
  console.log('شرائح الكارت:', JSON.stringify((cardLegs||[]).map(function(l){
    return { كارت: l.seq, مبلغ: l.amount, حالة: l.status }; })));
  console.log('السلة:', (cart||[]).length, 'صنف · الإجمالي:', cartTotal());
  const e = {}; try{ selectedPayMethods.forEach(function(m){ e[m] = paymentAmounts[m] || 0; }); }catch(x){}
  console.log('المدفوعات المسجّلة:', e);
};

// ============================================================
// 🕵️ إنقاذ المعاملة اليتيمة
// ------------------------------------------------------------
// الحالة الصامتة الوحيدة اللي كانت فاضلة: لو الويبهوك كتب المعاملة
// **برقم طلب مختلف** عن اللي السيستم مستنيه، كل طبقات المتابعة
// (المستمع + الاستعلام الاحتياطي + إعادة الاشتراك) بتفضل مستنية رقم
// عمره ما هيجي. الفلوس اتسحبت والفاتورة مش بتتقفل.
//
// الحل: بعد انتظار طويل بنبص على المعاملات الناجحة الجديدة ونشوف فيه
// واحدة **مطابقة** للطلب بتاعنا. المطابقة صارمة عشان ما ناخدش معاملة
// عميل تاني بالغلط:
//   • نفس الفرع  • نفس الماكينة  • نفس المبلغ بالقرش بالظبط
//   • ناجحة      • بعد ما بعتنا الطلب  • مش مستهلكة في فاتورة تانية
// وحتى بعد كل ده — **الكاشير هي اللي تأكّد**، مش السيستم.
// ============================================================
const PM_RESCUE_AFTER_MS = 25000;   // مبنبصش قبل ما الانتظار يطوّل فعلًا
const _pmUsedRefs = {};             // أرقام اتستهلكت في الجلسة دي

function findOrphanTxn(docs, opts){
  const o = opts || {};
  const want = Math.round(Number(o.amountEGP || 0) * 100);
  const list = (docs || []).filter(function(d){
    if(!d || d.status !== 'success') return false;
    if(o.orderRef && String(d.orderRef || d.id) === String(o.orderRef)) return false;  // ده طلبنا نفسه
    if(d.branch !== o.branch) return false;                       // فرع تاني
    if(o.terminalId && d.terminalId && String(d.terminalId) !== String(o.terminalId)) return false;
    if(Number(d.amountCents) !== want) return false;              // المبلغ بالقرش بالظبط
    var ts = Number(d.createdAt) || 0;
    if(!(ts >= (o.sinceMs || 0))) return false;                   // اتعملت بعد ما بعتنا
    if(o.usedRefs && o.usedRefs[String(d.orderRef || d.id)]) return false;
    if(d.consumedByInvoice) return false;                         // اترصدت في فاتورة قبل كده
    return true;
  });
  // ⚠️ أكتر من واحدة مطابقة = مفيش ترجيح آمن — منختارش ونسيب الكاشير
  if(list.length !== 1) return null;
  return list[0];
}
if(typeof window !== 'undefined') window.findOrphanTxn = findOrphanTxn;

// 👂 بنراقب نتيجة العملية اللي الـ webhook بيكتبها — الكاشير مش بيقرر بنفسه
// 🔁 المستمع اللحظي بيموت نهائيًا لو النت اتنفض ثانية في نص العملية —
// وده كان سبب "فاتورة أو اتنين في اليوم مش بيطبعوا لوحدهم": الماكينة بتأكد
// والسيستم أصم. دلوقتي: إعادة اتصال تلقائية + استعلام احتياطي كل 4 ثواني.
function paymobWatch(orderRef, amountEGP, _retry, seq){
  _retry = _retry || 0;
  seq = seq || 1;
  const legTag = (MAX_CARD_LEGS > 1) ? ('كارت ' + seq + ': ') : '';
  function handleResult(d){
    if(!d) return false;
    if(d.status === 'success'){
      if(paymobApproved) return true;   // اتعالجت خلاص — منع التكرار
      try{ paymobPendingRecoveryClear(); }catch(e){}
      // v374 — متقفّليش المتابعة على success ناقص تفاصيل المبلغ. في تدفقات
      // PIN/auth+capture ممكن المستند يتحدّث على مراحل؛ إيقاف المستمع هنا كان
      // يحوّل موافقة حقيقية إلى "احفظ يدوي" للأبد. المبلغ لازم يفضل مؤكد
      // من مستند Paymob نفسه قبل أي auto-save/print.
      const _paidCentsReady = Number(d.amountCents);
      if(!Number.isFinite(_paidCentsReady) || _paidCentsReady <= 0){
        paymobShow('⏳ ' + legTag + 'الدفع اتقبل — بنستنى تفاصيل التأكيد عشان نحفظ ونطبع بأمان…', 'wait');
        return false;
      }
      paymobApproved = true; window.paymobApproved = true;
      paymobWaitBar(false);
      // 🛟 من لحظة القبول: لو الفاتورة ماتحفظتش خلال 20 ثانية، الكاشير هتعرف ليه
      try{ paymobStuckStart(orderRef); }catch(e){}
      // 💳 بنحتفظ ببيانات الكارت عشان تتطبع في الفاتورة وتتسجل مع البيعة
      const _txn = {
        seq: seq,
        amount: +Number(amountEGP).toFixed(2),
        last4: d.cardLast4 ? String(d.cardLast4).slice(-4) : null,
        scheme: d.cardScheme || null,
        transactionId: d.transactionId || null,
        approvalCode: d.approvalCode || null,
        rrn: d.rrn || null,
        terminalId: paymobTerminalId() || null,
        orderRef: orderRef,
        amountCents: d.amountCents || null
      };
      // 💳💳 الشريحة اتأكدت — الفلوس اتسحبت فعلًا وبقت مقفولة (مفيش تعديل إلا بمرتجع)
      let _leg = findCardLeg(cardLegs, seq, orderRef);
      if(!_leg){
        // 🔴 تأكيد وصل ومفيش شريحة تستقبله. قبل كده كان بيتجاهل بصمت والفلوس
        // تضيع من الفاتورة. دلوقتي بننشئ الشريحة — التأكيد من Paymob دليل كافٍ.
        _leg = { seq: seq, amount: +Number(amountEGP).toFixed(2), ref: orderRef, status: 'pending', txn: null };
        cardLegs.push(_leg);
        cardLegs.sort(function(a, b){ return a.seq - b.seq; });
        if(typeof _logActivity === 'function') _logActivity('card_leg_recovered', {
          seq: seq, ref: orderRef, amount: +Number(amountEGP).toFixed(2)
        });
      }
      _leg.status = 'approved'; _leg.txn = _txn; _leg.ref = orderRef;
      _leg.approvedAt = Date.now();
      // 🕵️ v297: من اللحظة دي الفلوس اتسحبت فعلًا — أي تعديل في السلة
      //    بعدها هو **سبب** أي فرق. بنسجّل اللحظة عشان نعرف نفرّق بين
      //    تعديل قبل السحب (عادي) وتعديل بعده (بيخلي العميلة دافعة زيادة).
      if(!_cardFirstApprovedAt) _cardFirstApprovedAt = _leg.approvedAt;
      // فولباك: كارت اتسجل يدوي من غير ما يعدّي على الرنين
      if(!_cardMoneyAtRiskAt) _cardMoneyAtRiskAt = _leg.approvedAt;
      paymobCardTxns = (cardLegs || []).filter(function(l){ return l.status === 'approved' && l.txn; })
                                       .map(function(l){ return l.txn; });
      window.paymobCardTxns = paymobCardTxns;
      paymobCardInfo = paymobCardTxns[0] || _txn;   // أول كارت — للتوافق مع الفواتير القديمة
      window.paymobCardInfo = paymobCardInfo;
      try{ syncCardPayment(); }catch(e){}
      const last4 = d.cardLast4 ? (' •' + String(d.cardLast4).slice(-4)) : '';
      if(typeof updatePaySummary === 'function') updatePaySummary();
      // ⚡ الحفظ والطباعة تلقائيًا — بس لو الشروط كلها سليمة
      // 💳 لسه فيه باقي؟ نقول للكاشير صراحةً إن الكارت التاني هو الخطوة الجاية
      const _dueNow = +(Math.abs(cartTotal()) - Math.abs(cardLegsSum(cardLegs)
                        + Object.keys(paymentAmounts).reduce(function(s,m){
                            return m === 'visa' ? s : s + Math.abs(paymentAmounts[m]||0); }, 0))).toFixed(2);
      const _nextHint = (_dueNow > 0.005 && nextCardSeq(cardLegs, MAX_CARD_LEGS))
        ? (' — باقي ' + _dueNow.toFixed(2) + ' ج.م، دوس «فيزا ' + nextCardSeq(cardLegs, MAX_CARD_LEGS) + '»') : '';
      const _skip = paymobAutoSkipReason(amountEGP, d, orderRef);
      if(_skip && paymobAutoPrint()){
        // 🩺 السبب بيظهر للكاشير — قبل كده كان بيسكت والكاشير مش عارف ليه
        paymobShow('✅ ' + legTag + 'الدفع اتقبل' + last4 + (_nextHint || (' — احفظ يدوي (' + _skip + ')')), 'ok');
      }
      if(paymobAutoPrint() && paymobCanAutoFinish(amountEGP, d, orderRef)){
        paymobShow('✅ ' + legTag + 'الدفع اتقبل' + last4 + ' — بيحفظ ويطبع…', 'ok');
        _paymobAutoFired = orderRef;   // 🔑 بيقفل الطلب ده بس — مش الدنيا كلها
        // ⏱️ قياس: الفرق بين ورقة الماكينة وورقتنا. الجزء الأول (موافقة البنك ←
        // كتابة Firestore) بيتحسب من طوابع المستند نفسه، والجزء التاني (وصول
        // التأكيد للجهاز ← الطباعة) مكانش متقاس خالص. الاتنين بيتسجلوا هنا.
        _pmPrintMark = {
          gotAtMs: Date.now(),
          decidedAt: (d && d.decidedAt) || null,     // إمتى الـwebhook كتب
          authorizedAt: (d && d.authorizedAt) || null, // إمتى البنك وافق
          ref: orderRef
        };
        window._pmPrintMark = _pmPrintMark;
        // من غير أي تأخير — كل جزء من الثانية بيفرق قدام العميل
        // 🎯 Visa auto-finish بيبدأ من callback مش من ضغطة كاشير، وده بالذات
        // المسار اللي ويندوز كان ساعات يسيب بعده نافذة الـPOS من غير focus.
        // نعلّم فترة الخطر قبل الحفظ، وبعد اكتمال دورة الحفظ/الطباعة نعمل
        // استرجاع إضافي. لا بنغيّر قرار الدفع ولا auto-print نفسه.
        try{
          if(typeof markWindowFocusRisk === 'function') markWindowFocusRisk('paymob-auto-finish', 10000);
          Promise.resolve(confirmPayment())
            .then(function(){ if(typeof reclaimWindowFocus === 'function') reclaimWindowFocus(250); })
            .catch(function(e){ console.warn('auto print', e); });
        }catch(e){ console.warn('auto print', e); }
      } else if(!_skip){
        const why = window._paymobLastSkip;
        paymobShow('✅ ' + legTag + 'الدفع اتقبل' + last4 + ' — دوس حفظ وطباعة'
          + (why ? (' (' + why + ')') : ''), 'ok');
      }
      return true;
    } else if(d.status === 'failed' || d.status === 'voided' || d.status === 'refunded'){
      try{ paymobPendingRecoveryClear(); }catch(e){}
      paymobApproved = false; window.paymobApproved = false;
      paymobWaitBar(false);
      // ❌ الشريحة دي اترفضت: بتتشال من المدفوعات عشان الكاشير يعيد المحاولة على طول
      // ↩️ والمرتجع/الإلغاء كمان: العملية اترجعت عند Paymob فمينفعش تتسجل كبيع.
      // 🔴 قبل كده `refunded` ماكانتش متعالجة خالص — المتابعة تفضل مستنية للأبد.
      const _leg = findCardLeg(cardLegs, seq, orderRef);
      if(_leg && _leg.status !== 'approved'){ _leg.status = 'failed'; }
      cardLegs = cardLegs.filter(function(l){ return l.status !== 'failed'; });
      try{ syncCardPayment(); }catch(e){}
      stopAll();                 // ⚠️ نقفل المتابعة **قبل** ما نصفّر المؤشر
      paymobPending = null;
      paymobShow((d.status === 'refunded' ? '↩️ ' : '❌ ') + legTag
        + (d.status === 'refunded'
            ? 'العملية دي اترجعت من Paymob — متسجلهاش كبيع'
            : ('الدفع اترفض' + (d.declineReason ? (' (' + d.declineReason + ')') : '') + ' — جرّب تاني')), 'err');
      if(typeof updatePaySummary === 'function') updatePaySummary();
      return true;
    } else if(d.status === 'pending'){
      // ⏳ البنك بيشتغل على مرحلتين (حجز ثم تحصيل) — دي المرحلة الأولى.
      // بنفضل مستنيين، بس الكاشير تشوف إن فيه حركة بدل شاشة ساكتة.
      paymobShow('⏳ ' + legTag + 'الماكينة استلمت الطلب — مستنيين تأكيد البنك…', 'wait');
      return false;
    }
    return false;
  }
  /* 🔴 باج: الدالة دي كانت بتقفل المتابعة **عن طريق `paymobPending`** —
     ومسار الرفض/المرتجع جوه handleResult بيعمل `paymobPending = null`
     وبعدين بيرجّع true، فـstopAll بتلاقيها فاضية و**المستمع مبيتقفلش خالص**.
     يعني كل كارت مرفوض بيسيب مستمع Firestore حي للأبد على مستند الطلب
     القديم. ولو الويبهوك حدّث المستند ده بعدين (Paymob بيبعت أكتر من حدث
     لنفس العملية)، المستمع الزومبي بينده handleResult على **السلة الحالية**:
     paymobApproved بترجع true وحارس التعليق بيشتغل على فاتورة مالهاش دعوة.
     الحل: نمسك المقابض المحلية مباشرة — مش من متغيّر ممكن يكون اتصفّر. */
  let _stopped = false;
  function stopAll(){
    if(_stopped) return;
    _stopped = true;
    try{ if(unsub) unsub(); }catch(e){}
    try{ clearInterval(poll); }catch(e){}
    try{ clearInterval(rescue); }catch(e){}
    try{ clearTimeout(_manualRecoveryT); }catch(e){}
    try{ clearTimeout(_warnT); }catch(e){}
    try{ clearTimeout(_giveUpT); }catch(e){}
  }
  const unsub = db.collection('pos_paymob_txns').doc(orderRef).onSnapshot(function(snap){
    if(!snap.exists) return;
    if(handleResult(snap.data() || {})) stopAll();
  }, function(err){
    console.warn('paymob watch', err);
    // 🔁 المستمع وقع — نعيد الاشتراك (الاستعلام الاحتياطي شغال في الخلفية برضه)
    if(_retry < 6 && paymobPending && paymobPending.ref === orderRef && !paymobApproved){
      setTimeout(function(){
        if(paymobPending && paymobPending.ref === orderRef && !paymobApproved){
          paymobWatch(orderRef, amountEGP, _retry + 1, seq);
        }
      }, 2000);
    } else {
      paymobShow('⚠️ مش قادر أتابع نتيجة الدفع — راجع الماكينة', 'err');
    }
  });
  // 🕵️ كشف صامت للمعاملة اليتيمة — **تسجيل بس، مفيش أي تدخل**
  // ⚠️ قرار المالك: ممنوع نعرض للكاشير شاشة تسألها تربط معاملة برقم طلب
  //    مختلف. كاشير مستعجلة قدام عميل ممكن تدوس «أيوه» على معاملة عميل
  //    تاني بنفس المبلغ — والضرر ده أكبر من الحالة اللي بنحلها (لسه ما
  //    حصلتش أصلًا). فبنسجّل بس، والفاتورة ما بتتلمسش خالص.
  const _sentAt = Date.now();
  let _orphanLogged = false;
  const rescue = setInterval(async function(){
    if(!paymobPending || paymobPending.ref !== orderRef || paymobApproved){ clearInterval(rescue); return; }
    if(_orphanLogged) return;                       // مرة واحدة لكل طلب
    if(Date.now() - _sentAt < PM_RESCUE_AFTER_MS) return;
    try{
      const snap = await db.collection('pos_paymob_txns')
        .where('createdAt', '>=', _sentAt - 60000).get({ source: 'server' });
      const docs = snap.docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); });
      const hit = findOrphanTxn(docs, {
        amountEGP: amountEGP, branch: currentBranch,
        terminalId: paymobTerminalId(), orderRef: orderRef,
        sinceMs: _sentAt - 60000, usedRefs: _pmUsedRefs
      });
      if(!hit) return;
      _orphanLogged = true;
      // 🗄️ تسجيل للتشخيص بس — مفيش شاشة ومفيش ربط تلقائي
      if(typeof _logActivity === 'function') _logActivity('paymob_orphan_detected', {
        expected: orderRef,
        matched: String(hit.orderRef || hit.id),
        amount: amountEGP,
        last4: hit.cardLast4 || null,
        branch: currentBranch
      });
      console.warn('🕵️ معاملة ناجحة بنفس المبلغ برقم طلب مختلف:',
        { expected: orderRef, matched: String(hit.orderRef || hit.id) });
    }catch(e){ console.warn('paymob orphan scan', e && e.message); }
  }, 8000);

  // 🛟 شبكة الأمان: استعلام مباشر كل 4 ثواني — حتى لو المستمع مات في لحظة
  // نت وحشة، النتيجة بتتلقط في أول استعلام ناجح بعد رجوع النت.
  const poll = setInterval(async function(){
    if(!paymobPending || paymobPending.ref !== orderRef || paymobApproved){ clearInterval(poll); return; }
    try{
      // 🔴 كانت .get() عادية — و enablePersistence شغّالة، فالقراءة كانت ممكن
      //    ترد **من الكاش المحلي**. لما الاتصال يتعب: الـonSnapshot مبيوصلش،
      //    والـpoll يقرا كاش قديم فاضي، والخطأ يتبلع في catch فاضي.
      //    يعني الشبكة الاحتياطية بتفشل في نفس الحالة اللي اتعملت عشانها.
      //    { source: 'server' } بتجبرها تروح السيرفر — ولو مقدرتش بترمي خطأ
      //    وده بالظبط اللي عايزينه نعرفه.
      const snap = await db.collection('pos_paymob_txns').doc(orderRef).get({ source: 'server' });
      _pmPollFails = 0;
      if(snap.exists && handleResult(snap.data() || {})) stopAll();
    }catch(e){
      // 📴 مفيش وصول للسيرفر — نقول للكاشير بدل ما تفضل تبص على شاشة ساكتة.
      //    3 محاولات ≈ 12 ثانية قبل ما نتكلم، عشان الوميض العابر ميزعّجش.
      _pmPollFails++;
      if(_pmPollFails === 3 && paymobPending && paymobPending.ref === orderRef){
        paymobShow('📴 ' + legTag + 'النت مش واصل للسيرفر — الماكينة ممكن تكون أكدت خلاص. '
          + 'لو إيصال الموافقة طلع، دوس «حفظ وطباعة» وأكّد.', 'err');
      }
    }
  }, 4000);
  paymobPending = { ref: orderRef, unsub: unsub, poll: poll, rescue: rescue, amount: amountEGP, seq: seq };
  // 🛟 الماكينة ممكن تطبع APPROVED قبل وصول الويبهوك بثواني. بدل ما الكاشير تفضل
  // معلّقة أو تطبع من برّه، نظهر مسار استرداد واضح من نفس شاشة الـPOS.
  const _manualRecoveryT = setTimeout(function(){
    if(paymobPending && paymobPending.ref === orderRef && !paymobApproved){
      paymobPendingRecoveryRender(orderRef, amountEGP, seq);
    }
  }, PM_PENDING_RECOVERY_MS);
  // ⏳ 3 دقايق = تحذير بس — 🔴 كانت بتقتل المتابعة نهائيًا: عميل اتلكّع وأكّد
  // في الدقيقة الرابعة كان تأكيده بيضيع رغم إن الماكينة طبعت. دلوقتي المتابعة
  // مستمرة لحد 10 دقايق، وبعدها بس بتقف بمسح كامل.
  const _warnT = setTimeout(function(){
    if(paymobPending && paymobPending.ref === orderRef && !paymobApproved){
      paymobShow('⏳ ' + legTag + 'الماكينة مردتش خلال 3 دقايق — لسه بتابع لحد 10 دقايق. لو الإيصال طلع من الماكينة تقدر تدوس «حفظ وطباعة» وتأكّد، ولو الطلب اتلغى دوس «مسح المدفوعات»', 'err');
    }
  }, 180000);
  const _giveUpT = setTimeout(function(){
    if(paymobPending && paymobPending.ref === orderRef && !paymobApproved){
      stopAll();
      // 🔴 v352: ما نمسحش paymobPending هنا. ده كان سبب القفل الوهمي الدائم:
      // _cardMoneyAtRiskAt يفضل موجود، لكن مرجع المحاولة يضيع، فمفيش recovery
      // غير قفل وفتح التطبيق. نخلي المحاولة unresolved/timedOut لحد قرار الموظف:
      // إيصال Approved → حفظ وطباعة (manual confirmation)، أو مفيش طلب حي → مسح المدفوعات.
      paymobPending.timedOut = true;
      paymobPending.stoppedAt = Date.now();
      paymobShow('⏹️ ' + legTag + 'مفيش رد بعد 10 دقايق — راجع الماكينة: لو إيصال APPROVED طلع دوس «حفظ وطباعة» وأكّد. لو مفيش طلب ظاهر/الطلب اتلغى دوس «مسح المدفوعات» ونظّف المحاولة من غير ما تقفل السيستم.', 'err');
      if(typeof updatePaySummary === 'function') updatePaySummary();
    }
  }, 600000);
}
// رابط الدالة — بيتفعّل مع خطوة النشر الأخيرة
const PAYMOB_FN_URL = 'https://us-central1-customer-feedback-8ac1d.cloudfunctions.net/paymobTerminalOrder';
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
  // 💵 الفكة بتترد كاش بس (نفس قاعدة normalizePayments) — زيادة الكارت مش فكة،
  // دي فلوس اتسحبت زيادة ولازم ترجع بمرتجع من Paymob
  const change = (!isRefund && (paymentAmounts.cash || 0) > 0)
    ? Math.max(0, +(enteredAbs - requiredAbs).toFixed(2)) : 0;
  const confirmBtn = document.getElementById('confirmPayBtn');

  const labels = {cash:'💵 كاش', visa:'💳 فيزا', instapay:'📱 انستا باي', salary:'📄 خصم من الراتب'};
  const payList = document.getElementById('qbxPayList');
  if(payList){
    const rows = [];
    Array.from(selectedPayMethods).forEach(function(m){
      if(m === 'visa'){
        // 💳💳 كل كارت في سطر لوحده بحالته — الكاشير لازم يشوف أنهي كارت اتأكد
        (cardLegs || []).filter(function(l){ return l.status !== 'failed'; }).forEach(function(l){
          const st = l.status === 'approved'
            ? '<span style="color:#15803d; font-weight:900;">✅</span>'
            : l.status === 'pending'
              ? '<span style="color:#b45309; font-weight:900;">⏳</span>'
              : l.status === 'manual'
                ? '<span style="color:#b45309; font-weight:900;">✍️</span>'
                : '<span style="color:#6b7280;">•</span>';
          const t = l.txn || {};
          const last4 = t.last4 ? ` <span style="color:#6b7280; font-size:10.5px;" dir="ltr">${(t.scheme||'CARD')} ••${t.last4}</span>` : '';
          rows.push(`<div class="pl-row"><span>${st} 💳 كارت ${l.seq}${last4}</span><span>${Math.abs(l.amount||0).toFixed(2)} ج.م</span></div>`);
        });
      } else {
        rows.push(`<div class="pl-row"><span>${labels[m]}</span><span>${Math.abs(paymentAmounts[m]||0).toFixed(2)} ج.م</span></div>`);
      }
    });
    payList.innerHTML = rows.join('')
      || `<div style="color:#999; font-size:11px; padding:6px 0;">${isRefund ? 'اختار طريقة إرجاع المبلغ للعميل' : 'لسه مفيش مدفوعات — دوس كاش/فيزا/انستا باي'}</div>`;
  }
  // 🖲️ حالة زراير الكروت: الكارت التاني مايفتحش قبل ما الأول يتأكد
  (function(){
    for(let s = 1; s <= MAX_CARD_LEGS; s++){
      const b = document.getElementById(s > 1 ? 'pmVisa2' : 'pmVisa');
      if(!b) continue;
      const leg = cardLegBySeq(cardLegs, s);
      const blocked = !!cardLegBlockReason(cardLegs, s, isRefund, MAX_CARD_LEGS);
      b.classList.toggle('pm-locked', blocked);
      b.classList.toggle('pm-done', !!(leg && leg.status === 'approved'));
      b.classList.toggle('selected', !!leg && leg.status !== 'failed');
      b.title = blocked ? cardLegBlockReason(cardLegs, s, isRefund, MAX_CARD_LEGS) : '';
    }
  })();
  // ⚠️ اتسحب من الكروت أكتر من الفاتورة (السلة اتعدّلت بعد السحب) — تحذير ظاهر
  (function(){
    const over = cardOvercharge(cardLegs, total);
    let box = document.getElementById('cardOverBanner');
    const holder = document.getElementById('qbxPayList');
    if(!over){ if(box) box.remove(); return; }
    if(!box){
      box = document.createElement('div');
      box.id = 'cardOverBanner';
      box.style.cssText = 'background:#fdecec; border:1.5px solid #dc2626; color:#991b1b;'
        + 'border-radius:8px; padding:7px 9px; margin:6px 0; font-size:11.5px; font-weight:800; line-height:1.6;';
      if(holder && holder.parentNode) holder.parentNode.insertBefore(box, holder);
    }
    box.innerHTML = '💳 <b>تعديل بعد الدفع:</b> اتسحب ' + Math.abs(cardApprovedSum(cardLegs)).toFixed(2)
      + ' ج.م · الإجمالي الجديد ' + requiredAbs.toFixed(2)
      + ' ج.م · <b>لازم نرجّع ' + over.toFixed(2) + ' ج.م</b>.<br>'
      + 'هيتسجل تلقائيًا في Office: مستحق الرد ← جارٍ الرد ← تم الرد. الرد يكون على نفس عملية Paymob، مش من الدرج.';
  })();

  const dueLabel = document.getElementById('qbxDueLabel')
    || document.querySelector('.qbx-totals .t-row:nth-child(3) span:first-child');
  if(dueLabel) dueLabel.textContent = isRefund ? 'ناقص إرجاعه' : 'ناقص';

  const paidEl = document.getElementById('qbxPaid');
  const dueEl = document.getElementById('qbxDue');
  const changeEl = document.getElementById('qbxChange');
  if(paidEl) paidEl.textContent = enteredAbs.toFixed(2);
  if(dueEl){
    dueEl.textContent = due.toFixed(2);
    // برتقالي لما يبقى فيه ناقص، ورمادي هادي لما يخلص
    dueEl.classList.toggle('t-zero', !(due > 0));
  }
  if(changeEl) changeEl.textContent = change.toFixed(2);

  // زرار الحفظ بيتفعّل لما المبلغ المُدخل (بصرف النظر عن الاتجاه) يغطي المطلوب بالكامل
  // 🔒 القفل بيشتغل بس لو الفيزا لسه مختارة فعلًا كطريقة دفع.
  // من غير الشرط ده، طلب فيزا اتلغى كان بيفضل معطّل الحفظ ويمنع الانستا باي.
  // 💳💳 مع الكارتين: القفل بقى من حالة الشرائح نفسها — أي شريحة لسه على الماكينة
  // بتقفل الحفظ. الشريحة المرفوضة بتتشال فورًا فمش بتقفل حاجة (كان الزرار بيفضل
  // معطّل بعد رفض الفيزا لحد ما الكاشير يمسح المدفوعات).
  const cardPending = cardLegsPending(cardLegs) ||
    (selectedPayMethods.has('visa') && !cardLegs.length &&
     (typeof paymobPending !== 'undefined') && paymobPending && !paymobApproved);
  // 🔄 التبديل المتساوي: الإجمالي صفر فمفيش دفع مطلوب أصلًا.
  // الشرط القديم كان بيطلب طريقة دفع دايمًا، فالزرار كان بيفضل مقفول
  // والكاشير مش قادر يحفظ عملية تبديل سليمة.
  const isEvenSwap = cart.length > 0 && requiredAbs < 0.005;
  const paidOk = isEvenSwap || (selectedPayMethods.size > 0 && enteredAbs >= requiredAbs);
  // 💳 الشريحة المعلّقة **مابقتش تقفل الحفظ**: الماكينة ممكن تكون سحبت وطبعت
  // والتأكيد اتأخر أو ضاع — الكاشير لازم يقدر يقفل الفاتورة. الحماية اتنقلت
  // لشاشة تأكيد إجبارية جوه confirmPayment بدل قفل أعمى بلا مخرج.
  confirmBtn.disabled = !(cart.length > 0 && paidOk);
  if(isEvenSwap && !confirmBtn.disabled){
    confirmBtn.title = 'تبديل متساوي — مفيش فلوس بتتحصّل ولا تترد';
  }
  if(cardPending && !confirmBtn.disabled){
    confirmBtn.title = '⚠️ الماكينة لسه ماأكدتش — الحفظ هيسألك تأكيد الأول';
    confirmBtn.style.outline = '2px solid #f59e0b';
    confirmBtn.style.outlineOffset = '2px';
  } else {
    confirmBtn.style.outline = '';
    confirmBtn.style.outlineOffset = '';
  }
}

// >>> OFFLINE_SAVE_START
// 📴 حفظ الفواتير أوفلاين: الكتابة بتتسجل محليًا فورًا (offline persistence)،
// لكن وعد Firestore مش بيتأكد غير برد السيرفر — فبنستنى ثواني معدودة بس،
// ولو النت قاطع/بطيء بنكمّل عادي (طباعة + سلة جديدة) والرفع بيحصل في الخلفية لوحده.
const _WRITE_WAIT_MS = 4000;
let _offlineQueued = false;   // بتتعلّم لو أي كتابة اتأجلت في العملية الحالية

// بيستنى تأكيد السيرفر لمدة ms: {ok} اتأكدت · {queued} اتأجلت (أوفلاين/بطء) · {error} فشل حقيقي
function _waitWrite(p, ms){
  return new Promise(function(res){
    var done = false;
    var t = setTimeout(function(){ if(!done){ done = true; _offlineQueued = true; res({ queued:true }); } }, ms || _WRITE_WAIT_MS);
    Promise.resolve(p).then(function(v){
      if(!done){ done = true; clearTimeout(t); res({ ok:true, value:v }); }
    }).catch(function(e){
      if(!done){ done = true; clearTimeout(t); res({ error:e }); }
      else console.warn('كتابة مؤجلة فشلت بعدين', e);
    });
  });
}

// سباق مع مهلة: بيرمي خطأ لو العملية خدت أكتر من ms (للمعاملات اللي محتاجة نت)
function _raceTimeout(p, ms){
  return Promise.race([ p, new Promise(function(_ignore, rej){ setTimeout(function(){ rej(new Error('timeout')); }, ms); }) ]);
}
// <<< OFFLINE_SAVE_END

// رقم فاتورة متسلسل ومميز (زي INV-000123) — بيتولّد بمعاملة Firestore آمنة
// عشان لو جهازين بيبيعوا في نفس اللحظة، كل واحد ياخد رقم مختلف من غير تعارض.
// 📴 المعاملات محتاجة نت: لو أوفلاين أو اتأخرت عن 2.5 ثانية → رقم بديل فورًا
// (كود الفاتورة نفسه فيه لاحقة وقت + رمز الفرع فمفيش خوف من تعارض الأرقام).
async function generateInvoiceNumber(){
  const counterRef = db.collection(TEST_SETTINGS).doc('invoice_counter_' + currentBranch);
  if(typeof navigator !== 'undefined' && navigator.onLine === false) return Date.now().toString().slice(-8);
  try{
    const newNumber = await _raceTimeout(db.runTransaction(async (tx)=>{
      const doc = await tx.get(counterRef);
      const current = doc.exists ? (doc.data().value || 0) : 0;
      const next = current + 1;
      tx.set(counterRef, { value: next }, { merge:true });
      return next;
    }), 2500);
    return String(newNumber);
  }catch(e){
    console.warn('تعذر توليد رقم فاتورة متسلسل، هيتستخدم رقم بديل', e);
    return Date.now().toString().slice(-8);
  }
}

// 💵 شاشة الباقي — بتظهر **بعد** الطباعة وفتح الدرج، عشان الكاشير
// يعدّ الفكة وهو شايف الرقم قدامه. مش بتعطّل أي حاجة، وبتقفل بأي زرار
// أو بمجرد ما يبدأ يمسح المنتج اللي بعده.
function showChangeAfterPrint(change, ctx){
  const old = document.getElementById('changeConfirmOverlay');
  if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'changeConfirmOverlay';
  ov.style.cssText = 'position:fixed; inset:0; z-index:12000; background:rgba(0,0,0,.82);'
    + 'display:flex; align-items:center; justify-content:center; padding:20px;';
  ov.innerHTML = `
    <div style="background:var(--panel); border:3px solid #22c55e; border-radius:20px;
                padding:30px 24px; text-align:center; max-width:460px; width:100%;">
      <div style="color:var(--muted); font-size:16px; font-weight:800; margin-bottom:10px;">💵 الباقي للعميل</div>
      <div style="font-size:76px; font-weight:900; color:#22c55e; line-height:1;
                  direction:ltr; unicode-bidi:isolate;">${Number(change).toFixed(2)}</div>
      <div style="color:var(--muted); font-size:15px; margin-top:6px;">جنيه</div>
      ${(ctx && ctx.phone) ? `
      <button id="keepChangeBtn" style="margin-top:20px; width:100%; padding:15px; border:none;
              border-radius:12px; background:#1d4ed8; color:#fff;
              font-family:'Cairo'; font-weight:800; font-size:15px; cursor:pointer;">
        💳 سيبي الباقي في حسابها</button>
      <div style="color:var(--muted); font-size:11.5px; margin-top:6px;">
        تصرفه في أي فاتورة جاية</div>` : ''}
      <button id="changeCloseBtn" style="margin-top:${(ctx && ctx.phone) ? '10px' : '22px'}; width:100%; padding:15px; border:none;
              border-radius:12px; background:var(--panel2); border:1px solid var(--border);
              color:var(--text); font-family:'Cairo'; font-weight:800; font-size:15px; cursor:pointer;">
        ${(ctx && ctx.phone) ? 'ادّيتها كاش — إغلاق' : 'إغلاق'}</button>
      <div style="color:var(--muted); font-size:11.5px; margin-top:8px;">دوس <b>Enter</b> تقفل — أو امسح المنتج اللي بعده</div>
    </div>`;
  document.body.appendChild(ov);
  const close = ()=>{ const el = document.getElementById('changeConfirmOverlay'); if(el) el.remove(); };
  ov.querySelector('#changeCloseBtn').addEventListener('click', close);
  // 💳 "سيبي الباقي في الحساب"
  //    ⚠️ الزرار بيتقفل فورًا بعد الضغط — من غير كده ضغطتين سريعتين
  //       بيبعتوا نداءين، ومفتاح التكرار بيمسك الثاني بس ده هدر وقت
  //       والكاشير بتفتكر إن الأولى فشلت.
  const _keep = ov.querySelector('#keepChangeBtn');
  if(_keep){
    _keep.addEventListener('click', async function(){
      _keep.disabled = true; _keep.textContent = 'بيتحفظ...';
      try{
        const r = await keepChangeAsCredit(change, (ctx && ctx.invoiceCode) || '', (ctx && ctx.phone) || '');
        if(r){ showToast('اتحفظ ' + Number(change).toFixed(2) + ' ج.م في حسابها ✅'); close(); }
        else { _keep.disabled = false; _keep.textContent = '💳 سيبي الباقي في حسابها'; }
      }catch(e){
        _keep.disabled = false; _keep.textContent = '💳 سيبي الباقي في حسابها';
      }
    });
  }
  ov.addEventListener('click', (e)=>{ if(e.target === ov) close(); });
  // أي مسح/كتابة في بار البحث بيقفلها — الكاشير مش هيحتاج يدوس حاجة
  const sb = document.getElementById('searchBar');
  if(sb){
    const onType = ()=>{ close(); sb.removeEventListener('input', onType); };
    sb.addEventListener('input', onType);
    setTimeout(function(){ try{ sb.focus(); }catch(e){} }, 80);
  }
  // ⌨️ Enter بيقفلها — الكاشير إيده على الكيبورد أو الماسح، مش على الماوس.
  //    (وEscape برضه.) بنمسك الحدث في مرحلة الالتقاط ونمنع انتشاره عشان
  //    الـEnter ما يروحش لبار البحث ويعمل بحث على الفاضي.
  const onKey = function(e){
    if(e.key === 'Enter' || e.key === 'Escape' || e.key === 'NumpadEnter'){
      e.preventDefault(); e.stopPropagation();
      close();
      document.removeEventListener('keydown', onKey, true);
      try{ const b = document.getElementById('searchBar'); if(b) b.focus(); }catch(_e){}
    }
  };
  document.addEventListener('keydown', onKey, true);
}
window.showChangeAfterPrint = showChangeAfterPrint;


let _confirmSaving = false;
async function confirmPayment(){
  if(_confirmSaving){ showToast('الفاتورة بتتحفظ... استنى ثانية', 'err'); return; }   // منع التكرار
  // 💵 بنحسب الباقي دلوقتي قبل ما السلة تتفضّى — وبنعرضه بعد الطباعة
  let _pendingChange = 0;
  // 💵 رقم العميلة ورقم الفاتورة لازم يتمسكوا **قبل** ما السلة تتفضّى —
  //    شاشة الباقي بتظهر بعد كده والخانات بتكون اتمسحت خلاص.
  let _changeCtx = { phone:'', invoiceCode:'' };
  try{
    _changeCtx.phone = (document.getElementById('customerPhone') || {value:''}).value.trim();
  }catch(e){}
  try{
    const _total = cartTotal();
    let _entered = 0;
    selectedPayMethods.forEach(m=> _entered += paymentAmounts[m] || 0);
    const _diff = +(Math.abs(_entered) - Math.abs(_total)).toFixed(2);
    if(_total > 0 && (paymentAmounts.cash || 0) > 0 && _diff > 0) _pendingChange = _diff;
  }catch(e){}
  const _btn = document.getElementById('confirmPayBtn');
  // حماية: نفس شروط الزرار بالظبط — لو معطّل يبقى السلة فاضية أو المدفوعات ناقصة
  // (مهم للاختصار Shift+Enter اللي كان بيتخطى الزرار ويطبع فاتورة فاضية)
  if(_btn && _btn.disabled){
    showToast(cart.length ? '💳 كمّل المدفوعات الأول (F2 كاش · F3 فيزا · F4 انستا)' : '🛒 السلة فاضية — ضيف منتجات الأول', 'err');
    return;
  }
  // 💳 الماكينة لسه ماأكدتش والكاشير عايز يقفل الفاتورة يدوي.
  // ⚠️ ده المكان الوحيد اللي بيحوّل شريحة معلّقة لتسجيل يدوي — وبتأكيد صريح،
  // لأن الغلط هنا بيطلع عجز في التقفيل (فاتورة متسجلة وفلوس ماسحبتش).
  try{
    const _pend = cardPendingLegs(cardLegs);
    if(_pend.length){
      const _sum = cardPendingSum(cardLegs);
      const ok = confirm('⚠️ الماكينة لسه ماأكدتش ' + _sum.toFixed(2) + ' ج.م.\n\n'
        + 'متحفظش غير لو إيصال الماكينة طلع فعلًا ومكتوب عليه موافقة/APPROVED.\n'
        + 'لو الماكينة مطبعتش أو رفضت العملية، الفاتورة دي هتطلع عجز في التقفيل.\n\n'
        + 'إيصال الموافقة طلع من الماكينة؟');
      if(!ok) return;
      const _tid = (typeof paymobTerminalId === 'function') ? paymobTerminalId() : null;
      const _added = [];
      _pend.forEach(function(l){
        const t = cardLegToManual(l, _tid);
        if(t) _added.push(t);
      });
      // 💳 التسجيل اليدوي بيدخل الفاتورة زي المؤكد، بعلامة manual للمراجعة
      if(_added.length){
        paymobCardTxns = (paymobCardTxns || []).concat(_added);
        window.paymobCardTxns = paymobCardTxns;
        if(!paymobCardInfo){ paymobCardInfo = paymobCardTxns[0] || null; window.paymobCardInfo = paymobCardInfo; }
      }
      try{ syncCardPayment(); }catch(e){}
      if(typeof _logActivity === 'function') _logActivity('card_saved_manual', {
        amount: _sum, legs: _pend.length,
        refs: _pend.map(function(l){ return l.ref || null; })
      });
    }
  }catch(e){ console.warn('manual card save', e); }
  // ⚠️ الكروت اتسحب منها أكتر من الفاتورة (السلة اتعدّلت بعد السحب) — قرار الكاشير
  // بس لازم يبقى واعي: الفرق ده هيطلع أوفر في التقفيل لحد ما يترد من Paymob.
  try{
    const _over = cardOvercharge(cardLegs, cartTotal());
    if(_over > 0){
      const ok = confirm('⚠️ اتسحب من الكروت ' + Math.abs(cardApprovedSum(cardLegs)).toFixed(2)
        + ' ج.م والفاتورة ' + Math.abs(cartTotal()).toFixed(2) + ' ج.م.\n'
        + 'زيادة ' + _over.toFixed(2) + ' ج.م لازم تترد بمرتجع من Paymob — مش من الدرج.\n\n'
        + 'تحفظ الفاتورة بالمبلغ ده؟');
      if(!ok) return;
      // ⚠️ ده وقت **التأكيد** (قبل الحفظ) — الفاتورة لسه مالهاش رقم.
      //    الحدث اللي فيه الرقم بيتسجل بعد الحفظ باسم card_overcharge_saved.
      if(typeof _logActivity === 'function') _logActivity('card_overcharge_ok', {
        charged: Math.abs(cardApprovedSum(cardLegs)), total: Math.abs(cartTotal()), diff: _over
      });
    }
  }catch(e){ console.warn('overcharge check', e); }
  _confirmSaving = true;
  if(_btn){ _btn.dataset.lbl = _btn.textContent; _btn.disabled = true; _btn.textContent = '⏳ بيحفظ...'; }
  let _saved = false;
  try{
    await _doConfirmPayment();
    _saved = true;
  }catch(e){
    console.error('confirmPayment', e);
    showToast('فشل حفظ الفاتورة: ' + (e && e.message ? e.message : e), 'err');
  }finally{
    // 💵 الفاتورة اتطبعت والدرج فتح — دلوقتي بس بنعرض الباقي عشان تعدّه
    if(_saved && _pendingChange > 0){
      try{
        _changeCtx.invoiceCode = window._lastInvoiceCode || '';
        showChangeAfterPrint(_pendingChange, _changeCtx);
      }catch(e){ console.warn('change', e); }
    }
    // 📟 تنضيف حالة Paymob بعد أي حفظ ناجح — بيانات كارت فاتورة اتحفظت يدوي
    // كانت بتفضل معلّقة وتلوث الفاتورة اللي بعدها (cardTxn قديم على فاتورة كاش)
    if(_saved && typeof paymobReset === 'function'){
      try{
        if(typeof clearCardSaleCompleteState === 'function') clearCardSaleCompleteState();
        paymobReset();
      }catch(e){}
    }
    _confirmSaving = false;
    if(_btn){ _btn.textContent = _btn.dataset.lbl || 'حفظ وطباعة'; }
    if(typeof updatePaySummary === 'function') updatePaySummary();   // بيظبط تفعيل/تعطيل الزر حسب السلة
  }
}

// 💵 تطبيع المدفوعات قبل الحفظ — سبب رئيسي لاختلاف أرقام الكاش:
// الكاشير بيكتب المبلغ اللي **استلمه** (مثلًا 600 لفاتورة 500) والفكة بترجع للعميل،
// لكن الفاتورة كانت بتتسجل payments.cash=600 → كاش السيستم أعلى من الدرج الحقيقي
// في كل فاتورة فيها فكة، وتقارير المدفوعات مجموعها أكبر من صافي المبيعات.
// القاعدة: الفكة بتترد كاش بس، فبتتخصم من الكاش المسجّل. المستلم الفعلي بيتحفظ
// في cashReceived/changeGiven (للفاتورة المطبوعة والمراجعة).
function normalizePayments(payments, total){
  const applied = {};
  Object.entries(payments || {}).forEach(([k, v]) => { applied[k] = +v || 0; });
  let changeGiven = 0;
  if(total > 0 && (applied.cash || 0) > 0){
    const paid = Object.values(applied).reduce((n, v) => n + v, 0);
    changeGiven = Math.max(0, +(paid - total).toFixed(2));
    if(changeGiven > 0) applied.cash = Math.max(0, +(applied.cash - changeGiven).toFixed(2));
  }
  return { applied, changeGiven };
}
window.normalizePayments = normalizePayments;

async function _doConfirmPayment(){
  _offlineQueued = false;   // 📴 نبدأ صفحة جديدة لكل فاتورة
  const total = cartTotal();
  const isRefundInvoice = total < 0;
  // 🛡️ خط الدفاع الأخير لثغرة النقط→كاش: أي مسار وصّل السلة لإجمالي سالب
  // وفيها استبدال نقط بيترفض قبل الحفظ (تغيير كمية، تحويل صنف لمرتجع، ...)
  if(isRefundInvoice && pendingRedemption){
    showToast('⛔ الاستبدال أكبر من قيمة الفاتورة — شيل سطر الاستبدال أو زوّد منتجات (النقط خصم، مش فلوس بتترد)', 'err');
    return;
  }
  const paymentsEntered = {};
  selectedPayMethods.forEach(m=> paymentsEntered[m] = paymentAmounts[m] || 0);
  // المحفوظ في الفاتورة = المطبّق فعلًا (بعد خصم الفكة من الكاش)
  const { applied: payments, changeGiven } = normalizePayments(paymentsEntered, total);
  const phone = document.getElementById('customerPhone').value.trim();
  const custName = document.getElementById('customerName').value.trim();
  const itemCount = cart.reduce((s,c)=>s+c.qty, 0);
  const _spCfg = staffPointsConfig || {};
  const _spMinItems = (_spCfg.minItems!=null && _spCfg.minItems!=='') ? +_spCfg.minItems : MIN_ITEMS_FOR_STAFF_POINT;
  const _spMinInvoice = +_spCfg.minInvoice || 0;
  // ⭐ حساب نقطة البياعة:
  //   • الفاتورة لازم تعدّي البوابتين: عدد القطع الأدنى + قيمة الفاتورة الأدنى
  //   • أول (الحد) قطع = نقطة كاملة
  //   • وكل قطعة زيادة = كسر من نقطة (1 ÷ الحد)
  // كان قبل كده: نقطة واحدة مهما زادت القطع — فالموظفة اللي بتبيع 20 قطعة
  // بتاخد زي اللي بتبيع 5، والزيادة كلها بتضيع.
  const staffBaseValue = calcStaffPoint(itemCount, total, _spMinItems, _spMinInvoice,
                                         _spCfg.enabled !== false, isRefundInvoice);
  /* ⭐ نقط الحملة — **فوق** النقطة العادية مش بدلها (شوف calcStaffBonus). */
  const staffBonusValue = calcStaffBonus(cart, staffBoosts, Date.now(), isRefundInvoice);
  const staffPointValue = +(staffBaseValue + staffBonusValue).toFixed(3);
  const earnsStaffPoint = staffPointValue > 0;
/* ============================================================
   ↩️🎁 خصم نقط المرتجع — إصلاح "مولّد النقط"
   ------------------------------------------------------------
   🔴 الباج القديم: النقط كانت بتتخصم بـfloor على قيمة كل مرتجع
      لوحده. floor بيرمي الكسر **كل مرة**، فتقسيم المرتجع بيقلّل
      الخصم — ولو التقسيم صغير كفاية الخصم بيبقى صفر خالص:

        اشترت بـ٩٩٠  → كسبت ٩ نقط
        رجّعتها ١٠ مرات × ٩٩ → floor(99/100) = صفر كل مرة
        النتيجة: البضاعة رجعت كلها وفضل معاها ٩ نقط من العدم.

      وده مش خطأ حسابي بسيط — ده باب مفتوح: أي حد يعرف الحيلة
      يقدر يطلّع نقط بلا حدود ويحوّلها كاش من خصم الاستبدال.

   ✅ الإصلاح: مبنحسبش الخصم من قيمة المرتجع. بنحسبه من **نصيب
      المرتجع في نقط الفاتورة الأصلية**، وبنطرح اللي اتخصم قبل كده:

        الواجب كليًا = نقط الفاتورة × (المرجّع كله ÷ إجمالي الفاتورة)
        اللي يتخصم دلوقتي = الواجب كليًا − اللي اتخصم قبل كده

      كده التقسيم مبيغيّرش النتيجة النهائية أبدًا، والمرتجع الكامل
      بيرجّع كل النقط بالظبط. الكسور بتتجمّع بدل ما تترمى.

   ⚠️ `refundedSoFar` بيتقرا من الفاتورة الأصلية (مصدر الحقيقة)
      مش من السلة — عشان يشتغل صح عبر الجلسات والأجهزة.
   ============================================================ */
function returnPointsDeduction(origEarned, origTotal, refundedBefore, thisRefund, pointsRefundedSoFar){
  const earned = Number(origEarned) || 0;
  const total  = Math.abs(Number(origTotal) || 0);
  if(earned <= 0 || total <= 0) return 0;          // فاتورة مكسبتش نقط = مفيش خصم
  const before = Math.max(0, Number(refundedBefore) || 0);
  const now    = Math.max(0, Number(thisRefund) || 0);
  const already = Math.max(0, Number(pointsRefundedSoFar) || 0);
  // المرجّع عمره ما يزيد عن قيمة الفاتورة (حارس ضد بيانات بايظة)
  const returnedAll = Math.min(total, before + now);
  const dueAll = Math.round(earned * (returnedAll / total));
  const due = dueAll - already;
  // مبنرجّعش نقط أكتر من اللي اتكسبت، ومبنضيفش نقط من مرتجع
  return Math.max(0, Math.min(due, earned - already));
}
window.returnPointsDeduction = returnPointsDeduction;

  const _rate = loyaltyRedemptionConfig.pointsPerEGP || 100;
  const _rawPts = Math.floor(Math.abs(total) / _rate);
  const loyaltyPointsEarned = phone ? (total < 0 ? -_rawPts : _rawPts) : 0;   // المرتجع بيخصم نقط بالسالب
  const invoiceNo = await generateInvoiceNumber();
  // بادئة الفرع في كود الفاتورة (FT + رمز الفرع) — عشان الكود يقول الفرع فورًا ويمنع تعارض الأوفلاين
  const invoiceCode = 'FT' + branchCode(currentBranch) + invoiceNo + '-' + Date.now().toString(36).slice(-4).toUpperCase();
  // 💵 شاشة الباقي بتظهر بعد ما الدالة دي تخلص، ومحتاجة رقم الفاتورة
  //    عشان "سيبي الباقي في الحساب" تربط الحركة بفاتورة حقيقية.
  window._lastInvoiceCode = invoiceCode;

  // الموظف اللي فعليًا باع للعميل (ممكن يكون مختلف عن اللي مسجّل دخول في جهاز الـPOS نفسه)
  // 👤 البياعة: من غير اختيار = **مش بتتحسب لحد** (قرار المالك).
  // قبل كده كانت بتروح للي فاتح الجهاز — والكاشير مش بيبيع أصلًا.
  const sellerSel = document.getElementById('sellerEmployeeSelect');
  const _hasSeller = !!(sellerSel && sellerSel.value);
  const sellerEmployeeId = _hasSeller ? sellerSel.value : null;
  const sellerEmployeeName = _hasSeller
    ? (sellerSel.options[sellerSel.selectedIndex].dataset.name || '') : '';

  try{
    // 🎫 تحقق شراء الموظف: خصم الراتب في حدود السقف الشهري + سلة مش مرتجع
    if(staffPurchase && payments.salary){
      const salaryLeft = Math.max(0, staffPurchase.salaryCap - staffPurchase.salaryUsed);
      if(payments.salary > salaryLeft + 0.01){
        showToast('⛔ خصم الراتب المتاح للموظفة الشهر ده: ' + salaryLeft.toFixed(0) + ' ج.م بس', 'err');
        return;
      }
    }
    if(payments.salary && !staffPurchase){ showToast('خصم الراتب متاح في وضع شراء الموظف بس', 'err'); return; }

    // 💰 v372: بعد اكتمال كل التحقق، افتح الدرج فورًا قبل أي انتظار شبكة/Firestore.
    // لو الشِل قديم ومفيهوش openDrawer مستقل، printReceipt يحتفظ بالفولباك المعتاد.
    try{ if(typeof preOpenCashDrawerForSale === 'function') preOpenCashDrawerForSale(invoiceCode, payments); }catch(e){}

    // 1) سجل البيع (📴 مش بنستنى السيرفر أكتر من ثواني — أوفلاين بتتسجل محليًا وبتترفع بعدين)
    const _saleW = await _waitWrite(db.collection(TEST_SALES).add({
      invoiceNo,
      invoiceCode,
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name || '',
      sellerEmployeeId, sellerEmployeeName,
      branch: currentBranch,
      items: cart,
      itemCount, total, payments,
      cashReceived: paymentsEntered.cash || 0,   // 💵 اللي اتسلّم فعلًا من العميل
      changeGiven,                                // 💵 الفكة اللي رجعت له
      customerPhone: phone || null,
      customerName: custName || null,
      onlineOrder:(typeof _ordDelivering!=='undefined'&&_ordDelivering)?{code:_ordDelivering.code||'',source:_ordDelivering.funnelSource||'',entryBarcode:_ordDelivering.funnelEntryBarcode||''}:null,
      loyaltyPointsEarned,
      pointsRedeemed: (pendingRedemption ? pendingRedemption.points : 0),
      staffPointEarned: earnsStaffPoint,
      staffPointValue,                       // ⭐ القيمة بالكسور (1 = الحد الأدنى بالظبط)
      staffBaseValue,                        // ⭐ نقط القطع العادية
      staffBonusValue,                       // ⭐ نقط الحملة (منتج بعينه) — متفصّلة عشان تتراجع
      firstItemAt: _cartFirstItemAt || null,   // 🕵️ متى بدأت السلة (لكشف التأخير غير الطبيعي)
      staffPurchase: staffPurchase ? { empId: staffPurchase.empId, name: staffPurchase.name, pct: staffPurchase.pct, discountAmount: staffDiscountAmount() } : null,
      cardTxn: paymobCardInfo || null,   // 💳 بيانات أول كارت (توافق مع الفواتير القديمة)
      // 💳💳 كل الكروت المستخدمة في الفاتورة بمبالغها وأرقام عملياتها —
      // ضروري للمرتجع: كل عملية بترجع لوحدها من Paymob
      cardTxns: (paymobCardTxns && paymobCardTxns.length) ? paymobCardTxns : null,
      // 📴 طابع وقت محلي: serverTimestamp بيفضل null لحد ما فاتورة الأوفلاين تترفع،
      // فكانت بتختفي من التقفيل والتقارير وهي كاشها في الدرج. ده البديل الفوري.
      cartSid: _cartSid || null,             // 🕵️ رابط أحداث السلة دي بالفاتورة
      createdAtMs: Date.now(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }));
    if(_saleW.error) throw _saleW.error;   // فشل حقيقي (مش أوفلاين) → رسالة خطأ عادية

    // 🕵️ v296: حدث الربط — بيدي لكل أحداث السلة دي رقم فاتورتها.
    //    لازم **بعد** الحفظ: قبل كده الفاتورة مالهاش رقم من الأساس.
    try{
      _logActivity('sale_saved', {
        invoiceCode: invoiceCode, invoiceNo: invoiceNo,
        total: total, itemCount: itemCount
      });
    }catch(e){}

    /* 🛍️ أوردر أونلاين اتسلّم؟ الحالة بتتقفل **بعد** نجاح الحفظ بس.
       ⚠️ لو اتقفلت وقت تحميل السلة، وكاشير لغت البيع → أوردر
          «اتسلّم» والبضاعة لسه في المحل.
       ⚠️ best-effort: فشلها ميوقفش الفاتورة. */
    try{ if(typeof ordMarkCollected === 'function') ordMarkCollected(invoiceCode); }catch(e){}

    // 💳↩️ v295: اتسحب من الكروت أكتر من الفاتورة (اتأكد صراحةً فوق) —
    //    مستند متابعة ظاهر في Office لحد ما الفرق يترد لصاحبته من Paymob.
    //    الكتابة best-effort: فشلها ميوقفش الفاتورة (اللوج القديم شغال برضه).
    try{
      const _due = cardRefundDuePayload(cardLegs, total, {
        branch: currentBranch, invoiceCode: invoiceCode,
        phone: phone, name: custName,
        employeeId: (currentEmployee && currentEmployee.id) || '',
        employeeName: (currentEmployee && currentEmployee.name) || ''
      });
      if(_due){
        _due.adjustmentMode = !!_cardAdjustmentMode;
        _due.adjustmentStartedCharged = _cardAdjustmentApprovedAmount || _due.charged;
        _due.status = 'due';
        _due.statusLabel = 'مستحق الرد';
        const _c0 = cardOverCause(_cartEditsAfterCard, _due.diff);
        if(_c0){ _due.cause = _c0.text; _due.causeExact = _c0.exact; }
        db.collection('pos_card_refunds_due').add(_due).catch(function(){});
        // ونفس المعلومة في سجل النشاط بالرقم — الحدث القديم كان بيتسجل
        //    قبل الحفظ فطلع من غير رقم فاتورة (اتشاف في Office فعلًا)
        const _cause = cardOverCause(_cartEditsAfterCard, _due.diff);
        _logActivity('card_overcharge_saved', {
          charged: _due.charged, total: _due.invoiceTotal, diff: _due.diff,
          invoiceCode: invoiceCode,
          customerPhone: _due.customerPhone || '',
          txnId: (_due.txns[0] && _due.txns[0].txnId) || null,
          // 🕵️ v297: **ليه** حصل الفرق — التعديلات اللي بعد السحب
          cause: _cause ? _cause.text : null,
          causeSum: _cause ? _cause.sum : null,
          causeExact: _cause ? _cause.exact : null
        });
      }
    }catch(e){ console.warn('refund due', e); }

    // ============================================================
    // 🖨️ الورقة الأول — قبل باقي الكتابات
    // ------------------------------------------------------------
    // 🔴 الباج: الطباعة كانت **آخر سطر** بعد سلسلة كتابات كل واحدة فيها
    //    بتستنى الشبكة لحد 4 ثواني: المخزون · النقط · العميل · ربط التقييم.
    //    في نت تقيل ده يوصل لـ16 ثانية والعميل واقف مستني الورقة —
    //    وده سبب إن الكاشير كانت بتطبع يدوي في الفيزا.
    //    الكتابات دي **مالهاش أي لازمة للورقة**: الورقة محتاجة رقم الفاتورة
    //    والمدفوعات والإجمالي، وكلهم جاهزين هنا.
    // ✅ آمن: الفاتورة اتسجلت خلاص (محليًا على الأقل — offline persistence
    //    بتضمن رفعها)، فالورقة مش بتسبق الحفظ.
    // ============================================================
    let _didPrint = false;
    const _printNow = function(){
      if(_didPrint) return;
      _didPrint = true;
      // 🎁 بيانات نقط العميلة للورقة — بتتحط **جوه** لحظة الطباعة بالظبط
      //    عشان مايبقاش فيه أي مسافة تسيبها معلّقة على window.
      //    ⚠️ نفس درس `paymobCardInfo`: أي بيانات بتتخزّن على window
      //       بتلوّث الفاتورة اللي بعدها لو ماتصفرتش.
      try{
        window.receiptCustPoints = phone ? {
          phone: phone,
          name: custName || '',
          earned: loyaltyPointsEarned,
          redeemed: pendingRedemption ? pendingRedemption.points : 0,
          balanceBefore: custPointsBalance
        } : null;
      }catch(e){ window.receiptCustPoints = null; }
      try{
        const _mk = _pmPrintMark;
        if(_mk && _mk.gotAtMs){
          const _now = Date.now();
          const _rec = {
            ref: _mk.ref || null,
            saveMs: _now - _mk.gotAtMs            // وصول التأكيد ← الطباعة (اللي عندنا)
          };
          // موافقة البنك ← كتابة Firestore (اللي عند Paymob) — لو الطوابع موجودة
          if(_mk.decidedAt && _mk.authorizedAt){
            const _a = Date.parse(String(_mk.authorizedAt).indexOf('+') > 0
              ? _mk.authorizedAt : (_mk.authorizedAt + '+03:00'));
            if(!isNaN(_a)) _rec.paymobMs = _mk.decidedAt - _a;
          }
          if(_mk.decidedAt) _rec.deliverMs = _mk.gotAtMs - _mk.decidedAt;  // Firestore ← الجهاز
          if(_rec.paymobMs != null) _rec.totalMs = _rec.paymobMs + _rec.saveMs;
          if(typeof _logActivity === 'function') _logActivity('print_latency', _rec);
          console.log('⏱️ زمن الطباعة', _rec);
        }
      }catch(e){ console.warn('print latency', e); }
      _pmPrintMark = null; window._pmPrintMark = null;   // فاتورة واحدة لكل قياس
      // ⚠️ حارس حرج: الطباعة بقت **قبل** خصم المخزون، فلو رمت استثناء كانت
      //    هتوقف الدالة والمخزون ما يتخصمش. الورقة ممكن تتأجل — المخزون لأ.
      try{ printReceipt(paymentsEntered, total, invoiceNo, invoiceCode); }
      catch(e){
        console.error('فشل الطباعة — الفاتورة والمخزون كملوا عادي', e);
        try{ showToast('⚠️ الطباعة فشلت — الفاتورة اتسجلت، اطبعها من سجل المبيعات', 'err'); }catch(e2){}
      }
      // 🧹 تصفير فوري — حتى لو الطباعة وقعت. البيانات دي لفاتورة واحدة بس،
      //    ولو فضلت هتتطبع نقط عميلة على فاتورة عميلة تانية.
      finally{ try{ window.receiptCustPoints = null; }catch(e){} }

      // 💳 الرصيد وكروت الهدايا — **بعد** الطباعة عشان الورقة
      //    ماتستناش الشبكة (نفس سبب تقديم الطباعة أصلًا).
      //    ⚠️ ومش داخل try الطباعة: لو الطباعة وقعت، الرصيد
      //       لازم يتخصم برضه — الفلوس أهم من الورقة.
      (async function(){
        try{
          if(typeof commitCreditSpend === 'function')
            await commitCreditSpend(invoiceCode, total);
          if(typeof activatePendingGiftCards === 'function'){
            const _cards = await activatePendingGiftCards(invoiceCode);
            if(_cards && _cards.length && typeof printGiftCardSlips === 'function')
              await printGiftCardSlips(_cards);
            /* 📤 عرض المشاركة — **دلوقتي بس**. الكود مش متخزّن عندنا
               (بصمته بس)، فبعد ما الشاشة تتقفل مفيش طريقة نولّد
               الكارت تاني. لو اتأجّل، بيضيع. */
            if(_cards && _cards.length && typeof offerGiftShare === 'function')
              offerGiftShare(_cards);
          }
        }catch(e){ console.error('credit post-sale', e); }
      })();
    };

    // ↩️🔒 منع تكرار المرتجع عبر الجلسات: نسجّل الكميات المرجّعة على الفاتورة الأصلية
    // + سجل مراقَب لكل مرتجع (مين، إمتى، أنهي فاتورة، كام)
    // ↩️🎁 لازم يعيش بره الـtry: بيتحسب هنا وبيتخصم تحت في كتلة النقط.
    //    لو جوه، أي استثناء بيضيّعه والنقط مبتتخصمش.
    let _retPointsDeduct = 0;
    const _retInvoiceUpdates = [];
    try{
      const retLines = cart.filter(c=> c.isReturn && c.fromInvoice);
      if(retLines.length){
        // نجمّع المرجّع لكل فاتورة أصلية
        const byInvoice = {};
        retLines.forEach(c=>{
          (byInvoice[c.fromInvoice] = byInvoice[c.fromInvoice] || []).push(c);
        });
        for(const invCode of Object.keys(byInvoice)){
          try{
            const oq = await db.collection(TEST_SALES).where('invoiceCode','==', invCode).limit(1).get();
            if(!oq.empty){
              const origRef = oq.docs[0].ref;
              const orig = oq.docs[0].data();
              // نحدّث returnedQty على مستوى كل صنف (باركود+اسم)
              const returnedMap = orig.returnedQty || {};
              byInvoice[invCode].forEach(c=>{
                const key = (c.barcode||'') + '|' + c.name;
                returnedMap[key] = (returnedMap[key] || 0) + (c.qty||0);
              });
              // ↩️🎁 نصيب المرتجع ده من نقط الفاتورة الأصلية
              const _thisRefund = byInvoice[invCode]
                .reduce((n,c)=> n + Math.abs(c.price||0) * (c.qty||0), 0);
              const _ptsDeduct = returnPointsDeduction(
                orig.loyaltyPointsEarned, orig.total,
                orig.refundedValue, _thisRefund, orig.pointsRefunded);
              _retPointsDeduct += _ptsDeduct;
              _retInvoiceUpdates.push({
                ref: origRef,
                refundedValue: (Number(orig.refundedValue)||0) + _thisRefund,
                pointsRefunded: (Number(orig.pointsRefunded)||0) + _ptsDeduct
              });
              // ⏱️ مهلة: نفس سبب نقط البياعة — كتابة من غير آك سيرفر بتفضل
              //    معلّقة ومبترميش خطأ. ودي **قبل** الطباعة، فتعليقها كان
              //    بيوقف المرتجع كله قبل ما الورقة تطلع أصلًا.
              // 🔒 المرجّع والنقط المخصومة بيتحفظوا على الفاتورة الأصلية —
              //    دي مصدر الحقيقة اللي بيمنع التقسيم من إنه يقلّل الخصم.
              const _upd = { returnedQty: returnedMap };
              const _last = _retInvoiceUpdates[_retInvoiceUpdates.length - 1];
              if(_last && _last.ref === origRef){
                _upd.refundedValue = _last.refundedValue;
                _upd.pointsRefunded = _last.pointsRefunded;
              }
              const _rqW = await _waitWrite(origRef.update(_upd));
              if(_rqW.error) console.warn('update returnedQty', invCode, _rqW.error);
            }
          }catch(e){ console.warn('update returnedQty', invCode, e); }
        }
        // 📋 سجل المرتجعات المراقَب
        try{
          await _waitWrite(db.collection('pos_return_log').add({
            branch: currentBranch,
            employeeId: currentEmployee.id,
            employeeName: currentEmployee.name || '',
            invoiceCode,                          // فاتورة المرتجع الجديدة
            customerPhone: phone || null,
            customerName: custName || null,
            method: window._lastReturnMethod || 'invoice',   // phone | invoice
            items: retLines.map(c=>({ name:c.name, barcode:c.barcode||'', qty:c.qty, refund:Math.abs(c.price||0)*(c.qty||0), fromInvoice:c.fromInvoice })),
            totalRefund: retLines.reduce((s,c)=> s + Math.abs(c.price||0)*(c.qty||0), 0),
            ts: Date.now()
          }));
        }catch(e){ console.warn('return log', e); }
        window._lastReturnMethod = null;
      }
    }catch(e){ console.warn('return tracking', e); }

    // 🎫 أوردر الموظف → بيتسجل "مستني اعتماد" في برنامج الحضور (خانة أوردرات الموظفين)
    if(staffPurchase){
      try{
        await _waitWrite(db.collection('sales_staff_orders').add({
          employeeId: staffPurchase.empId,
          employeeName: staffPurchase.name,
          branch: currentBranch,
          invoiceNo, invoiceCode,
          total,                                   // بعد الخصم
          fullTotal: +(cartSubtotal()).toFixed(2), // قبل الخصم
          discountPct: staffPurchase.pct,
          discountAmount: staffDiscountAmount(),
          payMethod: payments.salary ? 'salary' : 'cash',
          payments,
          status: 'pending',
          ts: Date.now()
        }));
      }catch(e){ console.error('staff order log', e); }
      cancelStaffPurchase();
    }

    // 2) خصم من المخزون التجريبي (باستثناء سطور مش منتجات فعلية: استبدال نقط، مكافأة، أي id محجوز)
    const stockLines = cart.filter(c=> !c.isRedemption && !c.isRewardDiscount && c.id && !String(c.id).startsWith('__'));
    const batch = db.batch();
    stockLines.forEach(c=>{
      const ref = db.collection(TEST_INVENTORY).doc(c.id);
      batch.update(ref, { ['qtyByBranch.'+currentBranch]: firebase.firestore.FieldValue.increment(c.isReturn ? c.qty : -c.qty) });
    });
    /* ⭐🔴🔴🔴 نقطة الموظف بقت **جوه نفس الـbatch** بتاع خصم المخزون —
       مش نداء منفصل بعد الطباعة زي ما كانت. السبب: كانت بتتسجل في
       نداء لوحده بعد الطباعة (شوف التعليق التاريخي تحت)، وأي مقاطعة
       (قفل التاب، طفي الجهاز، تحديث الصفحة) في اللحظة دي بين الطباعة
       ونداء النقطة كانت بتضيّعها بصمت — الفاتورة والمخزون يفضلوا
       سليمين لأن خصم المخزون في batch منفصل بيتقيّد أوفلاين فورًا
       (شوف الشرح تحت)، لكن النقطة كانت بره الحماية دي. دلوقتي النقطة
       بتتقيّد **في نفس لحظة** المخزون بالظبط (نفس الـbatch الواحد) —
       نفس مستوى الموثوقية، صفر نافذة مقاطعة بينهم. */
    let pointsRef = null;
    if(earnsStaffPoint && sellerEmployeeId){
      // 🔒 من غير بياعة = مفيش نقط لحد (الشرط فوق بيحميها)
      pointsRef = db.collection('sales_points').doc();
      batch.set(pointsRef, {
        employeeId: sellerEmployeeId, employeeName: sellerEmployeeName,
        invoiceNumber: String(invoiceNo), branch: currentBranch,
        itemCount, invoiceTotal: total, auto: true, ts: Date.now(),
        value: staffPointValue,            // ⭐ الوزن الحقيقي للنقطة (كسور للقطع الزيادة)
        base: staffBaseValue, bonus: staffBonusValue   // ⭐ التفصيل — الحملة متميّزة
      });
      const ptRef = db.collection(TEST_EMPLOYEE_POINTS).doc(sellerEmployeeId);
      batch.set(ptRef, {
        employeeName: sellerEmployeeName,
        points: firebase.firestore.FieldValue.increment(1),
        salesCount: firebase.firestore.FieldValue.increment(1)
      }, { merge: true });
    }
    /* 🔴🔴🔴⭐ نفس الحماية لنقط ولاء العميل — نفس فئة "فلوس حقيقية"
       بالظبط زي نقطة البياعة (نقط قابلة للاستبدال فعليًا)، وكانت في
       نداء منفصل بعد الطباعة بنفس الثغرة القديمة. بقت جوه نفس الـbatch،
       وتحديثات العروض المفعّلة (activatedOffers) بقت حقول جوه نفس
       التحديث الواحد بدل ٣ نداءات منفصلة على نفس المستند. */
    let custRef = null, custUpdate = null;
    if(phone){
      custRef = db.collection(TEST_CUSTOMERS).doc(phone);
      // ↩️🎁 نقط المرتجع: بتتخصم بنصيبها من الفاتورة الأصلية (مش floor على
      //    قيمة المرتجع) — الإصلاح اللي بيقفل باب تقسيم المرتجع.
      //    ⚠️ `loyaltyPointsEarned` على فاتورة فيها مرتجع بس بتبقى سالبة
      //       بالحساب القديم، فبناخد الموجب منها بس عشان مايتخصمش مرتين.
      const _earnedPart = Math.max(0, loyaltyPointsEarned);
      const netPointsChange = _earnedPart
        - (pendingRedemption ? pendingRedemption.points : 0)
        - _retPointsDeduct;
      const pf = pointsFieldFor(currentBranch);
      custUpdate = {
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
            custUpdate['activatedOffers.'+l.barcode] = firebase.firestore.FieldValue.delete();   // خلصت مرّاته → يتشال
          }else{
            custUpdate['activatedOffers.'+l.barcode+'.uses'] = firebase.firestore.FieldValue.increment(1);   // لسه ليه مرّات → نزوّد العدّاد
          }
        }
      });
      if(custName) custUpdate.name = custName;
      batch.set(custRef, custUpdate, { merge: true });
    }
    // 🖨️ الورقة هنا بالظبط — بعد ما خصم المخزون (ونقطة الموظف ونقط العميلة
    //    دلوقتي) **اتقيّدوا** وقبل ما نستنى تأكيد السيرفر.
    // ⚠️ الترتيب ده مقصود ومهم للكل مع بعض دلوقتي:
    //   • commit() بمجرد ما تتنادى، الكل بيتقيّد محليًا وFirestore بترفعه
    //     لوحده حتى لو النت قطع — فالورقة عمرها ما تطلع والباقي لسه
    //     ما اتخصمش/اتسجلش.
    //   • وفي نفس الوقت مش بنستنى تأكيد السيرفر (4 ثواني) قبل الطباعة، ولا
    //     ربط التقييم اللي بعدها (12 ثانية كمان) —
    //     دي كانت بتخلي الورقة تتأخر لحد 16 ثانية في النت التقيل.
    const _stockP = batch.commit();
    _printNow();
    const _stockW = await _waitWrite(_stockP);
    if(_stockW.error) console.error('خصم المخزون + نقطة الموظف + نقط العميلة', _stockW.error);
    // سجل الحركة: من غير انتظار (جواه catch بتاعه) — أوفلاين بيتقيد محليًا ويترفع بعدين
    stockLines.forEach(c=>{ logStockMovement(c.id, c.name, c.isReturn ? c.qty : -c.qty, c.isReturn ? 'return' : 'sale', c.isReturn ? 'مرتجع داخل فاتورة بيع' : 'بيع'); });

    // 3) نقطة الموظف — اتنقلت فوق (خطوة 2) جوه نفس الـbatch بتاع خصم
    //    المخزون، عشان تتقيّد أوفلاين معاه في نفس اللحظة بالظبط ومتفقدش
    //    لو حصلت مقاطعة بين الطباعة ونداء منفصل زي ما كان بيحصل قبل كده.

    // 4) نقاط ولاء العميل — اتنقلت فوق كمان (خطوة 2) لنفس السبب بالظبط.
    //    ⚠️ تصفير pendingRedemption/appliedReward **مش هنا** — بره القاعدة
    //    تحت (السطر اللي فيه إحصائيات العروض) لسه محتاجة تقرا appliedReward
    //    قبل ما يتصفّر.
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
      await _waitWrite(tryLinkFeedbackToCustomer(phone, custName, sellerEmployeeName));
    }

    // 🖨️ اتطبعت فوق بعد حفظ الفاتورة على طول — ده احتياطي مش أكتر
    // (الحارس `_didPrint` بيمنع ورقتين لنفس الفاتورة)
    _printNow();
    if(_offlineQueued){
      showToast('📴 اتحفظت أوفلاين ✔ — هتترفع لوحدها أول ما النت يرجع (متمسحش بيانات البرنامج)', 'ok');
    }else{
      showToast('تم حفظ الفاتورة ✔ — متبقى تقييم العميل من صفحة التقييم', 'ok');
    }
    _saleJustSaved = true;   // 🕵️ المسح الجاي طبيعي (بعد حفظ)
    try{ _saleDraftClear(); }catch(e){}   // ✅ الفاتورة اتحفظت؛ ممنوع ترجع كمسودة بعد restart
    // 💳 الفاتورة اتحفظت واتطبعت وبيانات الكروت اتسجلت جواها — الشرائح بتتصفّر هنا
    // (قبل goToSale) عشان شاشة الفاتورة الجديدة ما تسألش عن كارت اتسحب خلاص
    try{ clearCardSaleCompleteState(); paymobReset(); }catch(e){}
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
      // 💸 نفس الحكاية: النافذة ٥ دقايق، فمفيش داعي نسحب تقييمات الفرع كلها
      const snap = await db.collection('entries')
        .where('ts','>=', windowStart).where('ts','<=', windowEnd).get();
      const candidates = snap.docs
        .map(d=>({id:d.id, ...d.data()}))
        .filter(e=> e.branch === currentBranch && !e.customerPhone)
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


/* ============================================================
   ☕🔔 تنبيه رجوع البريك في شاشة البيع (POS)
   ------------------------------------------------------------
   المشكلة: الموظفة بتنسى تسجّل رجوعها من البريك على كشك sales،
   والنظام بيقفله تلقائي بعد ضعف المدة **وبيتخصم عليها** حتى لو رجعت
   في ميعادها. الكشك بعيد عنها — بس الـPOS ده اللي هي واقفة قدامه.

   فبنعرض مربع فوق خالص في صفحة البيع أول ما مدة البريك تخلص.
   ⚠️ من غير صوت هنا عن قصد (قرار المالك): الكاشير بتكون قدام عميلة،
      الرنين على كشك sales. هنا تنبيه بصري بس.

   المصدر: مجموعة `sales_breaks` (تطبيق sales) — بنشترك على البريكات
   **المفتوحة في الفرع ده بس** (شرطين تساوي = مستند أو اتنين على الأكثر،
   يعني قراءات شبه معدومة، ومفيش index مركب مطلوب).

   لو القواعد رفضت القراءة → بنسكت تمامًا (مفيش رسالة للكاشير) والبيع
   بيكمّل عادي — الميزة دي مساعدة، مش شرط لأي عملية.
   ============================================================ */
var POS_BREAK_CFG_DEFAULT = { breakMin: 30, breakGraceMin: 5, breakAlertBeeps: 4, autoCloseBreakMult: 2 };
var _posBreakCfg = POS_BREAK_CFG_DEFAULT;
var _posBreaks = [];
var _posBreakUnsub = null, _posBreakBranch = '';

// نفس دالة sales بالحرف (breakAlertState) — الاختبار بيقارن الاتنين على نفس الحالات
function posBreakAlertState(brk, cfg, nowTs){
  cfg = cfg || POS_BREAK_CFG_DEFAULT;
  if(!brk || brk.endTs) return { phase:'none', elapsedMin:0, beep:false };
  var start = Number(brk.startTs);
  if(!start) return { phase:'none', elapsedMin:0, beep:false };
  var now = Number(nowTs) || Date.now();
  var elapsedMin = Math.floor((now - start) / 60000);
  if(elapsedMin < 0) return { phase:'none', elapsedMin:0, beep:false };

  var allowed = Number(cfg.breakMin) || 30;
  var grace   = Math.max(0, Number(cfg.breakGraceMin) || 0);
  var beeps   = Math.max(0, cfg.breakAlertBeeps == null ? 4 : Number(cfg.breakAlertBeeps));
  var staleAfter = allowed * (Number(cfg.autoCloseBreakMult) || 2) + 120;
  if(elapsedMin > staleAfter) return { phase:'stale', elapsedMin, beep:false };

  if(elapsedMin < allowed){
    return { phase:'ok', elapsedMin, leftMin: allowed - elapsedMin, overMin:0, graceLeftMin: grace, beep:false };
  }
  var overMin = elapsedMin - allowed;
  var inGrace = overMin < grace;
  return {
    phase: inGrace ? 'alert' : 'over',
    elapsedMin: elapsedMin, leftMin: 0, overMin: overMin,
    graceLeftMin: Math.max(0, grace - overMin),
    beep: inGrace && overMin < beeps
  };
}
window.posBreakAlertState = posBreakAlertState;

function watchBranchBreaks(){
  if(!currentBranch || typeof db === 'undefined' || !db) return;
  if(_posBreakUnsub && _posBreakBranch === currentBranch) return;
  if(_posBreakUnsub){ try{ _posBreakUnsub(); }catch(e){} _posBreakUnsub = null; _posBreaks = []; }
  _posBreakBranch = currentBranch;
  // إعدادات وقت الفرع (مدة البريك والسماح) — قراءة واحدة، وفولباك للافتراضي
  try{
    db.collection('sales_settings').doc(currentBranch).get().then(function(d){
      var t = d && d.exists && d.data() ? d.data().timeCfg : null;
      if(t) _posBreakCfg = Object.assign({}, POS_BREAK_CFG_DEFAULT, t);
    }).catch(function(){});
  }catch(e){}
  try{
    _posBreakUnsub = db.collection('sales_breaks')
      .where('branch','==', currentBranch)
      .where('endTs','==', null)
      .onSnapshot(function(snap){
        _posBreaks = snap.docs.map(function(d){ var o = d.data()||{}; o.id = d.id; return o; });
        renderPosBreakAlert();
      }, function(e){
        // القواعد رافضة أو النت قاطع — بنسيبها بهدوء، والبيع مش بيتأثر
        console.warn('breaks watch', e && e.code);
        _posBreakUnsub = null; _posBreaks = []; renderPosBreakAlert();
      });
  }catch(e){ _posBreakUnsub = null; }
}
window.watchBranchBreaks = watchBranchBreaks;

function renderPosBreakAlert(){
  var host = document.getElementById('posBreakAlert');
  if(!host) return;
  var now = Date.now();
  var rows = [];
  (_posBreaks || []).forEach(function(b){
    var st = posBreakAlertState(b, _posBreakCfg, now);
    if(st.phase !== 'alert' && st.phase !== 'over') return;
    var over = st.phase === 'over';
    rows.push(
      '<div style="background:' + (over ? '#7f1d1d' : '#b45309') + '; color:#fff; border-radius:10px;'
      + 'padding:11px 14px; margin-bottom:8px; font-weight:800; font-size:15px; text-align:center;">'
      + '⏰ ' + _bkEsc(b.employeeName || 'الموظفة') + ' — البريك خلص من ' + st.overMin + ' دقيقة'
      + '<div style="font-size:12.5px; font-weight:600; opacity:.95; margin-top:3px;">'
      + (over ? 'الوقت الزيادة بيتحسب رصيد دلوقتي — لازم تسجّل رجوعها على جهاز الحضور'
              : 'تسجّل رجوعها خلال ' + st.graceLeftMin + ' دقيقة قبل ما يتحسب خصم')
      + '</div></div>'
    );
  });
  if(!rows.length){ host.style.display = 'none'; host.innerHTML = ''; return; }
  host.style.display = 'block';
  host.innerHTML = rows.join('');
}
window.renderPosBreakAlert = renderPosBreakAlert;

function _bkEsc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
  });
}

if(typeof window !== 'undefined' && typeof setInterval === 'function'){
  setInterval(function(){
    try{ watchBranchBreaks(); renderPosBreakAlert(); }catch(e){}
  }, 10000);
}

/* ============================================================
   🛟 حارس الفاتورة المعلّقة بعد قبول الدفع
   ------------------------------------------------------------
   حصلت مرتين: الدفع بالفيزا اتقبل (الماكينة طبعت موافقة) والشاشة
   فضلت ساكتة — لا فاتورة اتحفظت ولا ورقة طلعت، والكاشير قدام عميلة
   مش عارفة تعمل إيه.

   ⚠️ الحارس ده **مش إصلاح للسبب** — السبب لسه بيتحدد من البيانات.
   ده بيحوّل التعليق الصامت لحاجة قابلة للتصرف: بعد 10 ثواني من
   القبول والفاتورة لسه ماتحفظتش → بانر أحمر بيقول إيه اللي واقف
   بالظبط + زرار حفظ يدوي + تسجيل الحالة في pos_activity_log عشان
   نعرف أنهي مسار من التلاتة بيحصل فعلًا.

   الزرار بينادي confirmPayment() العادية — بكل حراسها (منع التكرار،
   تأكيد الشرائح المعلّقة، تطبيع المدفوعات). مفيش أي مسار جديد للفلوس.
   ============================================================ */
/* ⏱️ 10 ثواني. مينفعش أقل من كده: أبطأ حفظ **طبيعي** بياخد ~6.5 ثانية
   (رقم الفاتورة 2.5 + كتابة البيعة 4) — لو نزّلناها تحت كده الكاشير
   هتشوف بانر أحمر على فواتير سليمة كل ما النت يتقل، وتبطّل تصدّقه. */
/* 🛟 حارس "الدفع اتقبل والفاتورة ماتحفظتش"
   🔴 كان 10 ثواني **من لحظة قبول الدفع** — والعدّاد بيبدأ قبل ما الحفظ
      يبدأ أصلًا. الحفظ الطبيعي (كتابة Firestore + طابور الطباعة + النقط)
      على نت الفرع بياخد أكتر من كده كتير، فالكاشير كانت بتشوف مربع أحمر
      مفزع "الفاتورة لسه ماتحفظتش" **بعد كل عملية فيزا تقريبًا** رغم إن
      كل حاجة تمام — وبعدين تدوس عليه فتحفظ مرتين أو تعيد على الماكينة.
      إنذار بيرن كل مرة = إنذار محدش بيسمعه.
   دلوقتي: طول ما الحفظ **شغال فعلًا** بنديله مهلة كاملة وبنعرض رسالة
      هادية مش حمرا؛ الإنذار الأحمر للحالات اللي الحفظ فيها واقف بجد. */
var PM_STUCK_MS = 20000;          // مفيش حفظ شغال → 20 ثانية
var PM_SAVING_GRACE_MS = 60000;   // الحفظ شغال على الشبكة → دقيقة كاملة
var _pmStuck = null;      // { ref, at, timer, logged }

function paymobStuckStart(orderRef){
  paymobStuckClear();
  _pmStuck = { ref: orderRef || null, at: Date.now(), timer: null, logged: false };
  _pmStuck.timer = setInterval(paymobStuckTick, 1000);
}
window.paymobStuckStart = paymobStuckStart;

function paymobStuckClear(){
  if(_pmStuck && _pmStuck.timer){ try{ clearInterval(_pmStuck.timer); }catch(e){} }
  _pmStuck = null;
  var box = document.getElementById('paymobStuckBox');
  if(box){ box.style.display = 'none'; box.innerHTML = ''; }
}
window.paymobStuckClear = paymobStuckClear;

/* ليه الفاتورة لسه واقفة؟ — دالة نقية عشان تتختبر
   بترجع null لو مفيش مشكلة، أو { reason, canSave } */
function paymobStuckReason(st){
  if(!st) return null;
  if(!st.approved) return null;              // الدفع لسه ماتقبلش — ده مسار تاني
  if(!st.cartCount) return null;             // السلة اتفضّت = الفاتورة اتحفظت
  // 💳 Split payment: قبول أول كارت والباقي لسه مطلوب حالة طبيعية، مش فاتورة معلّقة.
  // الحارس يبدأ فقط بعد اكتمال إجمالي المدفوعات؛ قبل كده الكاشير ببساطة بتكمل الكارت/الطريقة التالية.
  if(st.paymentsComplete === false) return null;
  // ⏳ الحفظ شغال دلوقتي؟ يبقى مفيش تعليق — ده انتظار عادي، مش عطل
  if(st.saving){
    if(st.elapsedMs < PM_SAVING_GRACE_MS) return null;
    return { reason:'الحفظ لسه شغال على الشبكة — استنى شوية', canSave:false, calm:true };
  }
  if(st.elapsedMs < PM_STUCK_MS) return null;
  if(st.autoFired) return { reason:'الطباعة التلقائية اتنفذت بس الفاتورة ماكملتش الحفظ', canSave:true };
  if(st.skipReason) return { reason:'الحفظ التلقائي اتوقف: ' + st.skipReason, canSave:true };
  return { reason:'الدفع اتقبل والحفظ التلقائي ما اشتغلش', canSave:true };
}
window.paymobStuckReason = paymobStuckReason;

function paymobStuckTick(){
  if(!_pmStuck) return;
  var st = {
    approved: !!window.paymobApproved,
    cartCount: (typeof cart !== 'undefined' && cart) ? cart.length : 0,
    elapsedMs: Date.now() - _pmStuck.at,
    saving: !!_confirmSaving,
    autoFired: !!_paymobAutoFired,
    skipReason: window._paymobLastSkip || null,
    paymentsComplete: (function(){
      try{
        var paid = Object.keys(paymentAmounts || {}).reduce(function(sum, method){
          return sum + Math.abs(Number(paymentAmounts[method]) || 0);
        }, 0);
        var need = Math.abs(Number(cartTotal()) || 0);
        return paid + 0.005 >= need;
      }catch(e){ return true; } // لو التشخيص نفسه فشل، ما نخفيش إنذار حقيقي محتمل
    })()
  };
  // ✅ الفاتورة خلصت (السلة اتفضّت) → الحارس بيقفل نفسه
  if(!st.cartCount || !st.approved){ paymobStuckClear(); return; }
  var r = paymobStuckReason(st);
  if(!r) return;

  // 📝 بيتسجل مرة واحدة بس — ده الدليل اللي هيحدد السبب الجذري
  if(!_pmStuck.logged && typeof _logActivity === 'function'){
    _pmStuck.logged = true;
    try{ _logActivity('paymob_stuck', {
      ref: _pmStuck.ref, waitedMs: st.elapsedMs, reason: r.reason,
      saving: st.saving, autoFired: st.autoFired, skip: st.skipReason,
      legs: (typeof cardLegs !== 'undefined' && cardLegs) ? cardLegs.length : 0,
      online: (typeof navigator !== 'undefined') ? navigator.onLine : null
    }); }catch(e){}
  }
  paymobStuckRender(r);
}

function paymobStuckRender(r){
  var box = document.getElementById('paymobStuckBox');
  if(!box) return;
  var info = (window.paymobCardInfo || {});
  var tail = info.last4 ? (' •' + info.last4) : '';
  var ref  = (_pmStuck && _pmStuck.ref) ? _pmStuck.ref : (info.orderRef || '');
  box.style.display = 'block';
  // 🎨 الهادي (الحفظ شغال) ≠ الإنذار (الحفظ واقف) — الكاشير لازم تفرّق بينهم
  var calm = !!r.calm;
  box.innerHTML =
    '<div style="background:' + (calm ? '#3a2c0e' : '#7f1d1d') + '; color:#fff; border-radius:12px; padding:13px 15px; text-align:center;">'
    + '<div style="font-weight:900; font-size:16px;">'
      + (calm ? ('⏳ الدفع اتقبل' + _bkEsc(tail) + ' — بيحفظ…')
              : ('🛟 الدفع اتقبل' + _bkEsc(tail) + ' — بس الفاتورة لسه ماتحفظتش')) + '</div>'
    + '<div style="font-size:13px; font-weight:700; margin-top:5px; opacity:.95;">' + _bkEsc(r.reason) + '</div>'
    + (ref ? '<div style="font-size:11.5px; margin-top:4px; opacity:.85; direction:ltr;">' + _bkEsc(ref) + '</div>' : '')
    + '<div style="font-size:12px; margin-top:7px; opacity:.9;">متعملش العملية تاني على الماكينة — الفلوس اتسحبت خلاص</div>'
    + (r.canSave
        ? '<button id="pmStuckSaveBtn" style="margin-top:10px; width:100%; padding:12px; border:none;'
          + ' border-radius:10px; background:#fff; color:#7f1d1d; font-family:\'Cairo\'; font-weight:900;'
          + ' font-size:15px; cursor:pointer;">💾 احفظ واطبع دلوقتي</button>'
        : '')
    + '</div>';
  var btn = document.getElementById('pmStuckSaveBtn');
  if(btn) btn.addEventListener('click', function(){
    if(typeof _logActivity === 'function'){
      try{ _logActivity('paymob_stuck_rescue', { ref: ref }); }catch(e){}
    }
    // نفس مسار الحفظ العادي بكل حراسه — مفيش طريق جانبي للفلوس
    try{ confirmPayment(); }catch(e){ console.warn('rescue save', e); }
  });
}
