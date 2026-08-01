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
  // الصف التالت
  'ئ':'z','ء':'x','ؤ':'c','ر':'v','لا':'b','ى':'n','ة':'m','و':',','ز':'.','ظ':'/',
  // مع Shift
  'َ':'Q','ً':'W','ُ':'E','ٌ':'R','لإ':'T','إ':'Y','÷':'I','×':'O','؛':'P',
  'ِ':'A','ٍ':'S','لأ':'G','أ':'H','ـ':'J','،':'K',
  'ْ':'X','لآ':'B','آ':'N','ذ':'`'
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
  if(!/[\u0600-\u06FF]/.test(raw)) return raw;      // مفيش عربي = زي ما هو
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

function findByBarcode(code){
  const usable = (it)=> it && it.status !== 'hidden' && it.status !== 'outofstock' && inMyBranch(it);
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
    const match = findByBarcode(code);
    if(match){
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
  if(!cart.length) _cartFirstItemAt = Date.now();   // 🕵️ بداية السلة
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
  if(selectedCartIdx !== null && selectedCartIdx >= cart.length) selectedCartIdx = null;
  if(cart.length === 0){
    selectedCartIdx = null;
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cart">لسه مفيش أصناف في الفاتورة</td></tr>';
  }else{
    tbody.innerHTML = cart.map((c, idx)=>`
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
    pendingRedemption: (typeof pendingRedemption !== 'undefined') ? pendingRedemption : null,
    appliedReward:     (typeof appliedReward     !== 'undefined') ? appliedReward     : null
  };
}
function clearSaleState(){
  _cartFirstItemAt = null;
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
  const _rm = cart[idx];
  _logActivity('item_removed', { name:_rm.name||'', qty:_rm.qty||1, price:_rm.price||0, cartCountAfter: cart.length-1 });
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
  if(!returnInvoiceData) return;
  const items = returnInvoiceData.items || [];
  const it = items[itemIdx];
  if(!it){ return; }
  const invoiceNo = returnInvoiceData.invoiceNo || '';
  const soldQty = it.qty || 1;
  // اللي اترجّع في جلسات سابقة من الصنف ده
  const _key = (it.barcode||'') + '|' + it.name;
  const prevReturned = (returnInvoiceData.returnedQty || {})[_key] || 0;
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
function changeQty(idx, delta){
  const line = cart[idx];
  line.qty += delta;   // مسموح بأي كمية حتى لو أكبر من المخزون
  if(line.qty <= 0){ cart.splice(idx,1); selectedCartIdx = null; }
  renderCart();
}
function removeFromCart(idx){
  if(cart[idx] && cart[idx].isRedemption) pendingRedemption = null;
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
  const st   = (state === 'found' || state === 'new') ? state : '';
  const box  = document.getElementById('custBox');
  const ph   = document.getElementById('customerPhone');
  const pill = document.getElementById('custNamePill');
  const btn  = document.getElementById('custClearBtn');
  if(box){
    box.classList.remove('st-found', 'st-new');
    if(st) box.classList.add('st-' + st);
    box.classList.toggle('on', st === 'found');   // متوافق مع القديم
    // 🔲 المستطيل التاني بيظهر بس لما يكون فيه حالة — ومعاه خانة الرقم
    //    بتنزل لنص العرض بدل ما تفضل مفرودة على الصفحة كلها.
    box.classList.toggle('has-side', !!st);
  }
  const side = document.getElementById('custSide');
  if(side) side.style.display = st ? 'flex' : 'none';
  if(ph){
    ph.classList.remove('st-found', 'st-new');
    if(st) ph.classList.add('st-' + st);
  }
  if(pill){
    if(st === 'found'){
      // 👤 الاسم **والرقم** — ده اللي المالك طلبه: يشوف مين اللي متربط بالفاتورة
      pill.textContent = '👤 ' + (String(name || '').trim() || 'بدون اسم')
        + ' · 📱 ' + String(phone || '').trim();
      pill.style.display = 'inline-flex';
    }else if(st === 'new'){
      pill.textContent = '🆕 رقم مش مسجّل';
      pill.style.display = 'inline-flex';
    }else{
      pill.textContent = '';
      pill.style.display = 'none';
    }
  }
  // ✕ بيبان طول ما فيه رقم مكتوب — مش مستني Enter ولا نقرة برّه
  if(btn) btn.style.display = (ph && String(ph.value || '').trim()) ? 'inline-flex' : 'none';
  return st;
}
window.setCustState = setCustState;

// ✕ شيل العميل من الفاتورة بضغطة — بيمسح الرقم والاسم وسياق العميل كله
//   (استبدال/مكافأة/عروض) من غير أي دوسة زيادة.
function clearCustomer(){
  const ph = document.getElementById('customerPhone');
  const nm = document.getElementById('customerName');
  if(ph) ph.value = '';
  if(nm){ nm.value = ''; nm.style.display = 'none'; }
  _custMatchedPhone = '';
  if(typeof clearCustomerContext === 'function') clearCustomerContext();
  const ci = document.getElementById('customerInfo'); if(ci) ci.innerHTML = '';
  const nr = document.getElementById('newCustomerRow'); if(nr) nr.style.display = 'none';
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
  if(btn) btn.style.display = (ph && ph.value.trim()) ? 'inline-flex' : 'none';
}
window._custBtnSync = _custBtnSync;

// ✏️ أول ما الكاشير تغيّر رقم عميل **متربط**، اللون الأخضر لازم يقع فورًا
//    وسياق العميل يتفك — عشان ما تفضلش الفاتورة شايلة عميل غير اللي مكتوب.
function _custDetachIfChanged(){
  const ph = document.getElementById('customerPhone');
  if(!ph) return false;
  const v = String(ph.value || '').trim();
  if(!_custMatchedPhone || v === _custMatchedPhone) return false;
  _custMatchedPhone = '';
  if(typeof clearCustomerContext === 'function') clearCustomerContext();
  const ci = document.getElementById('customerInfo'); if(ci) ci.innerHTML = '';
  const nr = document.getElementById('newCustomerRow'); if(nr) nr.style.display = 'none';
  const rp = document.getElementById('resetPinRow'); if(rp) rp.style.display = 'none';
  if(typeof revertCustomerOffers === 'function') revertCustomerOffers();
  if(typeof custPointsBalance !== 'undefined') custPointsBalance = 0;
  setCustState('');
  if(typeof renderCart === 'function') renderCart();
  return true;
}
window._custDetachIfChanged = _custDetachIfChanged;

async function refreshCustomerInfo(){
  const phone = document.getElementById('customerPhone').value.trim();
  const infoBox = document.getElementById('customerInfo');
  const newRow = document.getElementById('newCustomerRow');
  _custBtnSync();
  if(!phone){
    const _nm0 = document.getElementById('customerName');
    if(_nm0){ _nm0.value = ''; _nm0.style.display = 'none'; }
    _custMatchedPhone = '';
    infoBox.innerHTML=''; newRow.style.display='none'; setCustState(''); custActivatedOffers={}; revertCustomerOffers(); custReward=null; custPendingRedeem=null; custPointsBalance=0; custBaseText=''; renderCart(); return; }
  try{
    const doc = await db.collection(TEST_CUSTOMERS).doc(phone).get();
    custExists = doc.exists;
    { const _d = doc.exists ? (doc.data()||{}) : {};
      // "معاه التطبيق" = عنده PIN أو كود ولاء أو مصدره التطبيق
      custHasApp = !!(_d.loyaltyPin || _d.loyaltyCode || _d.loyaltyCode_glow || String(_d.source||'').indexOf('app')>=0);
    }
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
      const _nm2 = document.getElementById('customerName');
      if(_nm2){ _nm2.value = d.name || ''; _nm2.style.display = 'none'; }   // الاسم بيبان في سطر المعلومات
      custActivatedOffers = d.activatedOffers || {};   // عروض العميل المفعّلة
      custPointsBalance = Number(d[pointsFieldFor(currentBranch)]) || 0;   // 🛡️ الرصيد الحقيقي
      if(Object.keys(custActivatedOffers).length) await _loadOfficialOffers();   // 🛡️ الشروط الرسمية قبل أي خصم
      revertCustomerOffers(); applyCustomerOffers(); renderCart();
      const _brand = pointsFieldFor(currentBranch)==='points_glow' ? 'glow' : 'echarpe';
      const _now = Date.now();
      // 🛡️ نتأكد إن طلب الاستبدال اللي العميل بعته من التطبيق ≤ رصيده الحقيقي (منع تلاعب)
      custPendingRedeem = (d.pendingRedeem && d.pendingRedeem.brand === _brand
        && d.pendingRedeem.points > 0
        && d.pendingRedeem.points <= custPointsBalance) ? d.pendingRedeem : null;
      if(d.pendingRedeem && d.pendingRedeem.points > custPointsBalance){
        showToast('⚠️ طلب استبدال العميل أكبر من رصيده — اتجاهل. اعمل الاستبدال يدوي بالرصيد الصح', 'warn');
      }
      custReward = (d.rewards||[]).find(r=> r && !r.used && r.brand===_brand && (!r.expiry || r.expiry>_now)) || null;
      custBaseText = `<span style="font-weight:800;">💳 ${d[pointsFieldFor(currentBranch)] || 0} نقطة</span>${ratingLine}`;
      refreshCustomerActionUI();
      newRow.style.display = 'none';
      // 🟢 عميل متسجّل ومربوط بالفاتورة → الخانة خضرا والاسم والرقم بينوا
      _custMatchedPhone = phone;
      setCustState('found', d.name || '', phone);
      const rp = document.getElementById('resetPinRow');
      if(rp) rp.style.display = (d.loyaltyPin && hasPerm('canResetCustomerPin')) ? 'block' : 'none';   // بيان لو العميل حاطط رقم + الموظف عنده صلاحية
    }else{
      infoBox.textContent = ratingLine ? ratingLine.replace(' | ','') : '';
      newRow.style.display = 'flex';
      // 🟠 الرقم مش مسجّل → لون تاني واضح + خانة الاسم بتفتح للتسجيل
      _custMatchedPhone = '';
      setCustState('new', '', phone);
      // 📝 الاسم بيظهر **هنا بس** — لما الرقم مش مسجّل ومحتاجين نضيفه
      const _nm = document.getElementById('customerName');
      if(_nm){ _nm.style.display = ''; if(!_nm.value) try{ _nm.focus(); }catch(e){} }
      const rp = document.getElementById('resetPinRow'); if(rp) rp.style.display = 'none';
    }
  }catch(e){ infoBox.textContent=''; _custMatchedPhone=''; setCustState(''); }
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
  const phone = document.getElementById('customerPhone').value.trim();
  if(!phone){ showToast('لازم تكتب رقم تليفون العميل الأول', 'err'); return; }
  if(cart.length === 0){ showToast('الفاتورة فاضية', 'err'); return; }
  if(pendingRedemption){ showToast('في استبدال نقط مطبّق بالفعل على الفاتورة دي', 'err'); return; }

  try{
    const doc = await db.collection(TEST_CUSTOMERS).doc(phone).get();
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
let _saleJustSaved = false;    // عشان نفرّق مسح-بعد-حفظ (طبيعي) عن مسح-وهروب
function _logActivity(type, data){
  try{
    db.collection('pos_activity_log').add({
      type, branch: currentBranch,
      employeeId: (currentEmployee&&currentEmployee.id)||'',
      employeeName: (currentEmployee&&currentEmployee.name)||'',
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
  let html = custBaseText;
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
    // 🔲 شريط مضغوط جوه المستطيل — قبل كده كان بلوك كبير بيزقّ الشاشة لتحت
    html += `<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:3px; background:#fff6e6; border:1px solid var(--warn); border-radius:8px; padding:4px 7px; width:100%;">
       <span style="font-weight:800; color:#b45309; font-size:11.5px;">🎁 طلب استبدال ${custPendingRedeem._sane.points} نقطة (${custPendingRedeem._sane.value} ج.م)</span>
       <button onclick="applyPendingRedeem()" style="padding:4px 10px; border-radius:6px; border:none; background:var(--plus); color:#062; font-weight:800; font-size:11.5px; cursor:pointer;">✔️ طبّق</button>
       ${custPendingRedeem._tampered ? '<div style="color:var(--minus); font-size:10.5px; font-weight:800; width:100%;">🚩 أرقام الطلب مش مطابقة لحسابات المحل — اتصححت واتسجلت</div>' : ''}
     </div>`;
  }
  if(custReward && !cart.some(l=> l.isRewardDiscount)){
    const okMin = cartTot >= (custReward.minInvoice||0);
    const rTxt = custReward.type==='percent' ? `${custReward.value}% خصم` : `${custReward.value} ج.م خصم`;
    const cond = custReward.minInvoice ? ` (لفاتورة ${custReward.minInvoice} ج.م أو أكتر)` : '';
    html += `<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:3px; background:#fdeef5; border:1px solid var(--warn); border-radius:8px; padding:4px 7px; width:100%;">
       <span style="font-weight:800; color:#b45309; font-size:11.5px;">🎁 مكافأة: ${rTxt}${cond}</span>
       ${okMin
         ? `<button onclick="applyCustomerReward()" style="padding:4px 10px; border-radius:6px; border:none; background:var(--plus); color:#062; font-weight:800; font-size:11.5px; cursor:pointer;">✔️ طبّق</button>`
         : `<span style="font-size:10.5px; color:var(--muted);">لسه محتاج ${custReward.minInvoice} ج.م — الحالي ${cartTot.toFixed(0)}</span>`}
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
function applyPendingRedeem(){
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
        الغي الطلب من الماكينة الأول
      </div>
      <div style="color:var(--muted); font-size:13.5px; line-height:1.8; margin-bottom:6px;">
        فيه طلب بمبلغ <b style="color:var(--text);">${Number(amount).toFixed(2)} ج.م</b> لسه على الماكينة.
        لو سيبته، أي عميل جاي ممكن يدفعه بالغلط وتدخل فلوس من غير فاتورة.
      </div>
      <div style="background:#2a1416; border:1px solid #e5484d55; border-radius:10px;
                  padding:10px 12px; margin:12px 0; color:#ffd9da; font-size:12.5px; font-weight:700;">
        روح للماكينة دلوقتي والغي الطلب، وبعدين ارجع دوس تحت
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
    ok.textContent = 'الغيته من الماكينة ✅ — كمّل';
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
// 🔢 أنهي شريحة كارت المفروض تتفتح لما الكاشير يدوس «فيزا» أو F3
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
  const isCard = (method === 'visa' || method === 'visa2');
  // 💳 «فيزا» (والاختصار F3) بيروح لأول كارت متاح: لو الأول اتأكد يفتح التاني على طول
  let seq = 0;
  if(isCard){
    seq = (method === 'visa2') ? 2 : nextCardSeq(cardLegs, MAX_CARD_LEGS);
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
window.paymobApproved = false;

// 🔌 بيقفل المتابعة الحالية بس (شريحة كارت خلصت أو اتلغت) —
// الشرائح المؤكدة وبياناتها بتفضل زي ما هي عشان الكارت التاني يكمّل عليها
function paymobResetActive(){
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
  paymobCardInfo = null; window.paymobCardInfo = null;
  paymobCardTxns = []; window.paymobCardTxns = paymobCardTxns;
  cardLegs = []; window.cardLegs = cardLegs;
  const box = document.getElementById('paymobStatus');
  if(box){ box.style.display = 'none'; box.textContent = ''; }
  if(typeof updatePaySummary === 'function') updatePaySummary();
}
window.paymobReset = paymobReset;

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
  // 👂 المتابعة بتبدأ **قبل** الإرسال — 🔴 كانت فجوة حقيقية: لو رد الخدمة ضاع
  // في الشبكة بس الطلب وصل الماكينة فعلًا، العميل يدفع والماكينة تطبع والتأكيد
  // يتكتب في مستند محدش بيراقبه. دلوقتي الأذن مفتوحة قبل ما الطلب يخرج أصلًا.
  paymobWatch(orderRef, amountEGP, 0, seq);
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
      paymobApproved = true; window.paymobApproved = true;
      paymobWaitBar(false);
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
        try{ confirmPayment(); }catch(e){ console.warn('auto print', e); }
      } else if(!_skip){
        const why = window._paymobLastSkip;
        paymobShow('✅ ' + legTag + 'الدفع اتقبل' + last4 + ' — دوس حفظ وطباعة'
          + (why ? (' (' + why + ')') : ''), 'ok');
      }
      return true;
    } else if(d.status === 'failed' || d.status === 'voided' || d.status === 'refunded'){
      paymobApproved = false; window.paymobApproved = false;
      paymobWaitBar(false);
      // ❌ الشريحة دي اترفضت: بتتشال من المدفوعات عشان الكاشير يعيد المحاولة على طول
      // ↩️ والمرتجع/الإلغاء كمان: العملية اترجعت عند Paymob فمينفعش تتسجل كبيع.
      // 🔴 قبل كده `refunded` ماكانتش متعالجة خالص — المتابعة تفضل مستنية للأبد.
      const _leg = findCardLeg(cardLegs, seq, orderRef);
      if(_leg && _leg.status !== 'approved'){ _leg.status = 'failed'; }
      cardLegs = cardLegs.filter(function(l){ return l.status !== 'failed'; });
      try{ syncCardPayment(); }catch(e){}
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
  function stopAll(){
    try{ if(paymobPending && paymobPending.unsub) paymobPending.unsub(); }catch(e){}
    if(paymobPending && paymobPending.poll) clearInterval(paymobPending.poll);
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
  paymobPending = { ref: orderRef, unsub: unsub, poll: poll, amount: amountEGP, seq: seq };
  // ⏳ 3 دقايق = تحذير بس — 🔴 كانت بتقتل المتابعة نهائيًا: عميل اتلكّع وأكّد
  // في الدقيقة الرابعة كان تأكيده بيضيع رغم إن الماكينة طبعت. دلوقتي المتابعة
  // مستمرة لحد 10 دقايق، وبعدها بس بتقف بمسح كامل.
  setTimeout(function(){
    if(paymobPending && paymobPending.ref === orderRef && !paymobApproved){
      paymobShow('⏳ ' + legTag + 'الماكينة مردتش خلال 3 دقايق — لسه بتابع لحد 10 دقايق. لو الإيصال طلع من الماكينة تقدر تدوس «حفظ وطباعة» وتأكّد، ولو الطلب اتلغى دوس «مسح المدفوعات»', 'err');
    }
  }, 180000);
  setTimeout(function(){
    if(paymobPending && paymobPending.ref === orderRef && !paymobApproved){
      stopAll();
      paymobPending = null;
      paymobShow('⏹️ ' + legTag + 'مفيش رد بعد 10 دقايق — لو إيصال الموافقة طلع من الماكينة دوس «حفظ وطباعة» وأكّد، ولو مطبعتش دوس «مسح المدفوعات»', 'err');
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
    box.innerHTML = '⚠️ اتسحب من الكروت ' + Math.abs(cardApprovedSum(cardLegs)).toFixed(2)
      + ' ج.م والفاتورة بقت ' + requiredAbs.toFixed(2)
      + ' ج.م — زيادة ' + over.toFixed(2) + ' ج.م.<br>الفرق ده لازم يترد للعميل بمرتجع من Paymob، مش من الدرج.';
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
function showChangeAfterPrint(change){
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
      <button id="changeCloseBtn" style="margin-top:22px; width:100%; padding:15px; border:none;
              border-radius:12px; background:var(--panel2); border:1px solid var(--border);
              color:var(--text); font-family:'Cairo'; font-weight:800; font-size:15px; cursor:pointer;">
        إغلاق</button>
      <div style="color:var(--muted); font-size:11.5px; margin-top:8px;">بتتقفل لوحدها أول ما تمسح المنتج اللي بعده</div>
    </div>`;
  document.body.appendChild(ov);
  const close = ()=>{ const el = document.getElementById('changeConfirmOverlay'); if(el) el.remove(); };
  ov.querySelector('#changeCloseBtn').addEventListener('click', close);
  ov.addEventListener('click', (e)=>{ if(e.target === ov) close(); });
  // أي مسح/كتابة في بار البحث بيقفلها — الكاشير مش هيحتاج يدوس حاجة
  const sb = document.getElementById('searchBar');
  if(sb){
    const onType = ()=>{ close(); sb.removeEventListener('input', onType); };
    sb.addEventListener('input', onType);
    setTimeout(function(){ try{ sb.focus(); }catch(e){} }, 80);
  }
  document.addEventListener('keydown', function esc(e){
    if(e.key === 'Escape'){ close(); document.removeEventListener('keydown', esc); }
  });
}
window.showChangeAfterPrint = showChangeAfterPrint;


let _confirmSaving = false;
async function confirmPayment(){
  if(_confirmSaving){ showToast('الفاتورة بتتحفظ... استنى ثانية', 'err'); return; }   // منع التكرار
  // 💵 بنحسب الباقي دلوقتي قبل ما السلة تتفضّى — وبنعرضه بعد الطباعة
  let _pendingChange = 0;
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
      if(typeof _logActivity === 'function') _logActivity('card_overcharge_saved', {
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
      try{ showChangeAfterPrint(_pendingChange); }catch(e){ console.warn('change', e); }
    }
    // 📟 تنضيف حالة Paymob بعد أي حفظ ناجح — بيانات كارت فاتورة اتحفظت يدوي
    // كانت بتفضل معلّقة وتلوث الفاتورة اللي بعدها (cardTxn قديم على فاتورة كاش)
    if(_saved && typeof paymobReset === 'function'){ try{ paymobReset(); }catch(e){} }
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
  const staffPointValue = calcStaffPoint(itemCount, total, _spMinItems, _spMinInvoice,
                                         _spCfg.enabled !== false, isRefundInvoice);
  const earnsStaffPoint = staffPointValue > 0;
  const _rate = loyaltyRedemptionConfig.pointsPerEGP || 100;
  const _rawPts = Math.floor(Math.abs(total) / _rate);
  const loyaltyPointsEarned = phone ? (total < 0 ? -_rawPts : _rawPts) : 0;   // المرتجع بيخصم نقط بالسالب
  const invoiceNo = await generateInvoiceNumber();
  // بادئة الفرع في كود الفاتورة (FT + رمز الفرع) — عشان الكود يقول الفرع فورًا ويمنع تعارض الأوفلاين
  const invoiceCode = 'FT' + branchCode(currentBranch) + invoiceNo + '-' + Date.now().toString(36).slice(-4).toUpperCase();

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
      loyaltyPointsEarned,
      pointsRedeemed: (pendingRedemption ? pendingRedemption.points : 0),
      staffPointEarned: earnsStaffPoint,
      staffPointValue,                       // ⭐ القيمة بالكسور (1 = الحد الأدنى بالظبط)
      firstItemAt: _cartFirstItemAt || null,   // 🕵️ متى بدأت السلة (لكشف التأخير غير الطبيعي)
      staffPurchase: staffPurchase ? { empId: staffPurchase.empId, name: staffPurchase.name, pct: staffPurchase.pct, discountAmount: staffDiscountAmount() } : null,
      cardTxn: paymobCardInfo || null,   // 💳 بيانات أول كارت (توافق مع الفواتير القديمة)
      // 💳💳 كل الكروت المستخدمة في الفاتورة بمبالغها وأرقام عملياتها —
      // ضروري للمرتجع: كل عملية بترجع لوحدها من Paymob
      cardTxns: (paymobCardTxns && paymobCardTxns.length) ? paymobCardTxns : null,
      // 📴 طابع وقت محلي: serverTimestamp بيفضل null لحد ما فاتورة الأوفلاين تترفع،
      // فكانت بتختفي من التقفيل والتقارير وهي كاشها في الدرج. ده البديل الفوري.
      createdAtMs: Date.now(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }));
    if(_saleW.error) throw _saleW.error;   // فشل حقيقي (مش أوفلاين) → رسالة خطأ عادية

    // ↩️🔒 منع تكرار المرتجع عبر الجلسات: نسجّل الكميات المرجّعة على الفاتورة الأصلية
    // + سجل مراقَب لكل مرتجع (مين، إمتى، أنهي فاتورة، كام)
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
              await origRef.update({ returnedQty: returnedMap });
            }
          }catch(e){ console.warn('update returnedQty', invCode, e); }
        }
        // 📋 سجل المرتجعات المراقَب
        try{
          await db.collection('pos_return_log').add({
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
          });
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
    const _stockW = await _waitWrite(batch.commit());
    if(_stockW.error) console.error('خصم المخزون', _stockW.error);
    // سجل الحركة: من غير انتظار (جواه catch بتاعه) — أوفلاين بيتقيد محليًا ويترفع بعدين
    stockLines.forEach(c=>{ logStockMovement(c.id, c.name, c.isReturn ? c.qty : -c.qty, c.isReturn ? 'return' : 'sale', c.isReturn ? 'مرتجع داخل فاتورة بيع' : 'بيع'); });

    // 3) نقطة الموظف (تجريبي - منفصل عن رصيد الـ HR الحقيقي) — بتتحسب للبائع الفعلي
    // 🔒 من غير بياعة = مفيش نقط لحد. (من غير الشرط ده، الكتابة بمعرّف فاضي
    //    كانت هتفشل أو تعمل مستند غلط.)
    if(earnsStaffPoint && sellerEmployeeId){
      // ⭐ النقطة بتتسجل أوتوماتيك في برنامج الحضور (sales_points) — البياعة مش محتاجة تعمل سكان للفاتورة تاني
      try{
        await db.collection('sales_points').add({
          employeeId: sellerEmployeeId, employeeName: sellerEmployeeName,
          invoiceNumber: String(invoiceNo), branch: currentBranch,
          itemCount, invoiceTotal: total, auto: true, ts: Date.now(),
          value: staffPointValue             // ⭐ الوزن الحقيقي للنقطة (كسور للقطع الزيادة)
        });
      }catch(e){ console.warn('auto point', e); }
      const ptRef = db.collection(TEST_EMPLOYEE_POINTS).doc(sellerEmployeeId);
      await _waitWrite(ptRef.set({
        employeeName: sellerEmployeeName,
        points: firebase.firestore.FieldValue.increment(1),
        salesCount: firebase.firestore.FieldValue.increment(1)
      }, { merge: true }));
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
      await _waitWrite(custRef.set(custUpdate, { merge: true }));
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
      await _waitWrite(tryLinkFeedbackToCustomer(phone, custName, sellerEmployeeName));
    }

    // ⏱️ قبل الطباعة على طول — القياس بيقفل هنا
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
    printReceipt(paymentsEntered, total, invoiceNo, invoiceCode);
    if(_offlineQueued){
      showToast('📴 اتحفظت أوفلاين ✔ — هتترفع لوحدها أول ما النت يرجع (متمسحش بيانات البرنامج)', 'ok');
    }else{
      showToast('تم حفظ الفاتورة ✔ — متبقى تقييم العميل من صفحة التقييم', 'ok');
    }
    _saleJustSaved = true;   // 🕵️ المسح الجاي طبيعي (بعد حفظ)
    // 💳 الفاتورة اتحفظت واتطبعت وبيانات الكروت اتسجلت جواها — الشرائح بتتصفّر هنا
    // (قبل goToSale) عشان شاشة الفاتورة الجديدة ما تسألش عن كارت اتسحب خلاص
    try{ paymobReset(); }catch(e){}
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

