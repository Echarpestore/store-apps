// ============================================================
// discounts.js — محرك الخصومات (المرحلة 3)
// خصم عام على المحل كله أو على منتج معين، نسبة % أو مبلغ ثابت،
// مجدول بتاريخ بداية ونهاية، بحد أقصى اختياري للخصم.
// قاعدة التعارض: لو أكتر من خصم ينطبق على نفس المنتج،
// العميل بياخد الأفضل ليه بس (الأكبر توفيرًا) — مش بيتجمعوا.
// بيعتمد على العام من app.js: db, showScreen, showToast, hasPerm,
// currentBranch, allInventory, TEST_INVENTORY
// ============================================================

const TEST_DISCOUNTS = "pos_test_discounts";

let activeDiscountsCache = [];
let discountsCacheAt = 0;

function todayISO(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// تحميل الخصومات السارية دلوقتي (نشطة + جوه فترة التاريخ) — بكاش 60 ثانية
async function loadActiveDiscounts(force){
  const now = Date.now();
  if(!force && activeDiscountsCache.length >= 0 && (now - discountsCacheAt) < 60000 && discountsCacheAt > 0) return activeDiscountsCache;
  try{
    const snap = await db.collection(TEST_DISCOUNTS).where('branch','==', currentBranch).get();
    const today = todayISO();
    activeDiscountsCache = snap.docs.map(d=>({id:d.id, ...d.data()}))
      .filter(dc => dc.active !== false
        && (!dc.startDate || dc.startDate <= today)
        && (!dc.endDate || dc.endDate >= today));
    discountsCacheAt = now;
  }catch(e){ console.warn('تعذر تحميل الخصومات', e); }
  return activeDiscountsCache;
}

// حساب أفضل خصم ساري لمنتج معين — بيرجع null لو مفيش خصم ينطبق
function bestDiscountFor(product){
  const applicable = activeDiscountsCache.filter(dc =>
    dc.scope === 'all' || (dc.scope === 'product' && dc.productId === product.id)
  );
  if(applicable.length === 0) return null;

  let best = null;
  applicable.forEach(dc=>{
    let saving = 0;
    if(dc.type === 'percent'){
      saving = product.price * (dc.value / 100);
      // الحد الأقصى للخصم (اختياري) — بيمنع خصم النسبة يعدي مبلغ معين
      if(dc.maxDiscount && saving > dc.maxDiscount) saving = dc.maxDiscount;
    }else{
      saving = Math.min(dc.value, product.price); // خصم ثابت مينفعش يعدي سعر المنتج نفسه
    }
    if(saving <= 0) return;
    // قاعدة "الأفضل للعميل": بناخد الخصم صاحب أكبر توفير بس
    if(!best || saving > best.saving) best = { discount: dc, saving: +saving.toFixed(2) };
  });
  return best;
}

// ---------------- شاشة إدارة الخصومات (مدير بس) ----------------
function goToDiscounts(){
  if(!hasPerm('canChangePrices')){ showToast('الصلاحية دي للمدير بس', 'err'); return; }
  showScreen('discountsScreen');
  renderDiscountsScreen();
}

async function renderDiscountsScreen(){
  await loadLoyaltyRedemptionConfig();
  document.getElementById('discountAddCard').innerHTML = `
    <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:14px; margin-bottom:12px;">
      <div style="font-weight:800; margin-bottom:10px;">🎁 معدل استبدال نقاط الولاء بخصم</div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:13px;">
        <span>كل</span>
        <input id="loyaltyPointsInput" type="number" value="${loyaltyRedemptionConfig.pointsPerRedemption}" style="width:70px; padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); text-align:center;">
        <span>نقطة = </span>
        <input id="loyaltyValueInput" type="number" value="${loyaltyRedemptionConfig.redemptionValueEGP}" style="width:70px; padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); text-align:center;">
        <span>جنيه خصم</span>
        <button onclick="saveLoyaltyRedemptionConfig()" style="padding:8px 16px; border-radius:8px; border:none; background:var(--plus); color:#062; font-weight:700; cursor:pointer;">حفظ</button>
      </div>
    </div>`;

  // نموذج الإضافة
  const productOptions = allInventory
    .filter(p=> p.status !== 'hidden')
    .map(p=> `<option value="${p.id}" data-name="${p.name}">${p.name}</option>`).join('');

  document.getElementById('discountAddCard').innerHTML += `
    <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:14px; margin-bottom:12px;">
      <div style="font-weight:800; margin-bottom:10px;">➕ خصم جديد</div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        <input id="dcName" placeholder="اسم الخصم (مثلاً: عرض الجمعة)" style="padding:10px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <select id="dcScope" onchange="document.getElementById('dcProductWrap').style.display = this.value==='product' ? 'block' : 'none';" style="flex:1; min-width:130px; padding:10px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">
            <option value="all">🏪 على المحل كله</option>
            <option value="product">📦 على منتج معين</option>
          </select>
          <div id="dcProductWrap" style="flex:2; min-width:160px; display:none;">
            <select id="dcProduct" style="width:100%; padding:10px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">
              ${productOptions}
            </select>
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <select id="dcType" style="flex:1; min-width:110px; padding:10px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">
            <option value="percent">نسبة %</option>
            <option value="fixed">مبلغ ثابت ج.م</option>
          </select>
          <input id="dcValue" type="number" placeholder="القيمة" style="flex:1; min-width:90px; padding:10px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">
          <input id="dcMax" type="number" placeholder="حد أقصى للخصم ج.م (اختياري)" style="flex:1.5; min-width:150px; padding:10px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <span style="color:var(--muted); font-size:12px;">من</span>
          <input id="dcStart" type="date" style="flex:1; padding:9px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">
          <span style="color:var(--muted); font-size:12px;">إلى</span>
          <input id="dcEnd" type="date" style="flex:1; padding:9px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">
        </div>
        <button onclick="addDiscount()" style="padding:12px; border-radius:10px; border:none; background:var(--plus); color:#062; font-weight:800; cursor:pointer;">إضافة الخصم</button>
      </div>
    </div>`;

  renderDiscountsList();
}

async function renderDiscountsList(){
  const wrap = document.getElementById('discountListCard');
  wrap.innerHTML = '<div class="empty-cart">بيتحمّل...</div>';
  try{
    const snap = await db.collection(TEST_DISCOUNTS).where('branch','==', currentBranch).get();
    const discounts = snap.docs.map(d=>({id:d.id, ...d.data()}));
    const today = todayISO();
    if(discounts.length === 0){ wrap.innerHTML = '<div class="empty-cart">لسه مفيش خصومات</div>'; return; }
    wrap.innerHTML = discounts.map(dc=>{
      const expired = dc.endDate && dc.endDate < today;
      const notStarted = dc.startDate && dc.startDate > today;
      let statusBadge;
      if(dc.active === false) statusBadge = '<span style="color:var(--muted);">⏸ موقوف</span>';
      else if(expired) statusBadge = '<span style="color:var(--minus);">⌛ منتهي</span>';
      else if(notStarted) statusBadge = '<span style="color:var(--warn);">🕓 لسه هيبدأ</span>';
      else statusBadge = '<span style="color:var(--plus);">✅ ساري دلوقتي</span>';
      const valueStr = dc.type === 'percent' ? dc.value + '%' + (dc.maxDiscount ? ` (بحد أقصى ${dc.maxDiscount} ج.م)` : '') : dc.value + ' ج.م';
      const scopeStr = dc.scope === 'all' ? '🏪 المحل كله' : '📦 ' + (dc.productName||'منتج');
      return `
      <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:12px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
          <div>
            <div style="font-weight:800; font-size:13px;">${dc.name} — ${valueStr}</div>
            <div style="color:var(--muted); font-size:11px;">${scopeStr} · ${dc.startDate||'من غير بداية'} ← ${dc.endDate||'من غير نهاية'} · ${statusBadge}</div>
          </div>
          <div style="display:flex; gap:6px;">
            <button onclick="toggleDiscount('${dc.id}', ${dc.active === false})" style="padding:7px 12px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:${dc.active === false ? 'var(--plus)' : 'var(--warn)'}; font-size:11px; cursor:pointer;">${dc.active === false ? '▶ تفعيل' : '⏸ إيقاف'}</button>
            <button onclick="deleteDiscount('${dc.id}')" style="padding:7px 12px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--minus); font-size:11px; cursor:pointer;">حذف</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }catch(e){ wrap.innerHTML = '<div class="empty-cart">تعذر التحميل: ' + e.message + '</div>'; }
}

async function saveLoyaltyRedemptionConfig(){
  if(!hasPerm('canChangePrices')){ showToast('مفيش صلاحية', 'err'); return; }
  const pointsPerRedemption = parseInt(document.getElementById('loyaltyPointsInput').value) || 10;
  const redemptionValueEGP = parseFloat(document.getElementById('loyaltyValueInput').value) || 5;
  try{
    await db.collection(TEST_SETTINGS).doc('loyalty').set({ pointsPerRedemption, redemptionValueEGP }, { merge:true });
    loyaltyRedemptionConfig = { pointsPerRedemption, redemptionValueEGP };
    showToast('اتحفظ ✅');
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}

async function addDiscount(){
  if(!hasPerm('canChangePrices')){ showToast('مفيش صلاحية', 'err'); return; }
  const name = document.getElementById('dcName').value.trim();
  const scope = document.getElementById('dcScope').value;
  const type = document.getElementById('dcType').value;
  const value = parseFloat(document.getElementById('dcValue').value) || 0;
  const maxDiscount = parseFloat(document.getElementById('dcMax').value) || 0;
  const startDate = document.getElementById('dcStart').value || null;
  const endDate = document.getElementById('dcEnd').value || null;

  if(!name){ showToast('اكتب اسم الخصم', 'err'); return; }
  if(value <= 0){ showToast('اكتب قيمة صحيحة', 'err'); return; }
  if(type === 'percent' && value > 100){ showToast('النسبة مينفعش تعدي 100%', 'err'); return; }
  if(startDate && endDate && startDate > endDate){ showToast('تاريخ البداية بعد النهاية!', 'err'); return; }

  const dc = { name, scope, type, value, startDate, endDate, active:true, branch: currentBranch,
    createdAt: firebase.firestore.FieldValue.serverTimestamp() };
  if(maxDiscount > 0 && type === 'percent') dc.maxDiscount = maxDiscount;
  if(scope === 'product'){
    const sel = document.getElementById('dcProduct');
    if(!sel.value){ showToast('اختار المنتج', 'err'); return; }
    dc.productId = sel.value;
    dc.productName = sel.options[sel.selectedIndex].dataset.name;
  }

  try{
    await db.collection(TEST_DISCOUNTS).add(dc);
    showToast('اتضاف الخصم ✅');
    discountsCacheAt = 0; // إجبار إعادة تحميل الكاش
    renderDiscountsScreen();
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}

async function toggleDiscount(id, activate){
  try{
    await db.collection(TEST_DISCOUNTS).doc(id).update({ active: activate });
    discountsCacheAt = 0;
    showToast(activate ? 'اتفعّل ✅' : 'اتوقف ⏸');
    renderDiscountsList();
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}

async function deleteDiscount(id){
  if(!confirm('متأكد إنك عايز تمسح الخصم ده؟')) return;
  try{
    await db.collection(TEST_DISCOUNTS).doc(id).delete();
    discountsCacheAt = 0;
    showToast('اتمسح ✅');
    renderDiscountsList();
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}
