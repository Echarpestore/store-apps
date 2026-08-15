/* ============================================================
   🛒 shop-admin.js — منتجات البيع أونلاين (POS)
   ------------------------------------------------------------
   الشاشة اللي المالك بيحدّد منها **إيه اللي يتباع أونلاين**:
   يختار الصنف من المخزون، يحط صورة ووصف وسعر وعدد مخصّص للبيع
   أونلاين، ويقدر يوقفه ويشغّله في أي وقت.

   🔴 ليه ملف ومجموعة لوحدهم مش «كتالوج العرض»؟
      الكتالوج **عرض وعروض**: صور وخصومات وبانرات، وأي حاجة فيه
      ممكن تكون مش متاحة للبيع أصلًا. البيع أونلاين **التزام**:
      كمية محجوزة وسعر وعميلة هتيجي تستلم. خلطهم في مستند واحد
      معناه إن تعديل بانر يقدر يلمس كمية بيع.
      ⚠️ وقبل كده كانت خانة `online` على الكتالوج نفسه — اتشالت
         عن قصد: **مصدر واحد للحقيقة**، وإلا حاجة متفعّلة هنا
         ومتشالة هناك ومحدش عارف مين الصح.

   ⚠️ `onlineQty` = العدد اللي المالك **خصّصه** للبيع أونلاين، مش
      مخزون الفرع. الاتنين بيتفحصوا: العدد ده بيحدد السقف، ومخزون
      الفرع بيتفحص وقت الطلب **ووقت التسليم** (القطعة ممكن تكون
      اتباعت في المحل).
   ============================================================ */

const SHOP_DOC_PREFIX = 'online_shop_';   // pos_test_settings/online_shop_<brand>

let shopData = { items: [] };
/* ⚙️ إعدادات التسليم والشحن — مستند منفصل عن المنتجات.
   ⚠️ منفصل عن قصد: التطبيق بيقرا الإعدادات **مع كل فتحة للتبويب**،
      والمنتجات فيها صور base64 تقيلة. دمجهم = تحميل صور عشان نعرف
      سعر الشحن. */
let shopCfg = { pickupEnabled:true, deliveryEnabled:false, shippingFee:0, freeOver:0, governorates:[] };
let shopPendingImg = '';
let shopEditId = null;

function shopDocId(){
  return SHOP_DOC_PREFIX + (typeof catalogBrand === 'function' ? catalogBrand() : 'echarpe');
}
function shopCfgDocId(){ return shopDocId() + '_cfg'; }

async function goToOnlineShopAdmin(){
  if(typeof hasPerm === 'function' && !hasPerm('canEditInventory')){
    showToast('مفيش صلاحية', 'err'); return;
  }
  showScreen('onlineShopScreen');
  document.getElementById('shopAdminWrap').innerHTML = '<div class="empty-cart">بيتحمّل...</div>';
  try{
    const doc = await db.collection(TEST_SETTINGS).doc(shopDocId()).get();
    shopData = doc.exists ? Object.assign({ items:[] }, doc.data()) : { items:[] };
    if(!Array.isArray(shopData.items)) shopData.items = [];
    const c = await db.collection(TEST_SETTINGS).doc(shopCfgDocId()).get();
    if(c.exists) shopCfg = Object.assign(shopCfg, c.data());
    if(!Array.isArray(shopCfg.governorates)) shopCfg.governorates = [];
  }catch(e){ shopData = { items:[] }; }
  renderShopAdmin();
}
window.goToOnlineShopAdmin = goToOnlineShopAdmin;

async function saveShopDoc(){
  await db.collection(TEST_SETTINGS).doc(shopDocId()).set(shopData, { merge:true });
}
async function saveShopCfg(){
  await db.collection(TEST_SETTINGS).doc(shopCfgDocId()).set(shopCfg, { merge:true });
}

/* ⚙️ حفظ إعدادات التسليم.
   ⚠️ قفل الاتنين مع بعض = تبويب «اطلبي» يبقى موجود ومفيش طريقة
      تكمّلي بيه — أوحش من إنه مقفول. فبنمنعه صراحةً. */
async function shopSaveCfg(){
  const pickup = document.getElementById('cfgPickup').checked;
  const delivery = document.getElementById('cfgDelivery').checked;
  if(!pickup && !delivery){
    showToast('لازم تسيب طريقة واحدة على الأقل — استلام أو شحن', 'err');
    document.getElementById('cfgPickup').checked = true;
    return;
  }
  const before = JSON.stringify(shopCfg);
  shopCfg.pickupEnabled = pickup;
  shopCfg.deliveryEnabled = delivery;
  shopCfg.shippingFee = Math.max(0, parseFloat(document.getElementById('cfgFee').value) || 0);
  shopCfg.freeOver = Math.max(0, parseFloat(document.getElementById('cfgFreeOver').value) || 0);
  /* 🗺️ سطر لكل محافظة: «الاسم = الرسم». اللي مش مكتوب بياخد الرسم
     الموحّد — مش بيتمنع من الطلب. */
  shopCfg.governorates = String(document.getElementById('cfgGovs').value || '')
    .split('\n').map(function(line){
      const parts = line.split('=');
      if(parts.length < 2) return null;
      const name = parts[0].trim();
      const fee = parseFloat(parts[1]);
      if(!name || isNaN(fee)) return null;
      return { name: name, fee: Math.max(0, fee) };
    }).filter(Boolean);
  try{ await saveShopCfg(); showToast('الإعدادات اتحفظت ✅'); renderShopAdmin(); }
  catch(e){ shopCfg = JSON.parse(before); showToast('خطأ: ' + e.message, 'err'); }
}
window.shopSaveCfg = shopSaveCfg;

/* 🔍 اختيار الصنف من المخزون — الباركود والاسم والسعر بيتملوا لوحدهم.
   ⚠️ الاختيار من المخزون **مش اختياري**: الباركود هو الرابط اللي
      بيخلي فحص الكمية ممكن، ومن غيره الأوردر بيترفض عند التسليم. */
function shopInvSuggest(q){
  const box = document.getElementById('shInvSuggest');
  q = (q || '').trim().toLowerCase();
  if(!q){ box.innerHTML = ''; return; }
  const ms = (allInventory || []).filter(function(p){
    return String(p.name || '').toLowerCase().includes(q)
        || String(p.barcode || '').toLowerCase().includes(q);
  }).slice(0, 8);
  box.innerHTML = ms.map(function(p){
    const branchQty = (p.qtyByBranch || {})[currentBranch] || 0;
    return '<div onclick="shopPickInv(\'' + p.id + '\')" style="padding:9px 10px; border-bottom:1px solid var(--border); cursor:pointer; font-size:13px;">'
      + (p.name || '') + ' <span style="color:var(--muted); font-size:11px;">'
      + (p.barcode || '') + ' · ' + (p.price || 0) + 'ج · فرعك: ' + branchQty + '</span></div>';
  }).join('');
}
window.shopInvSuggest = shopInvSuggest;

function shopPickInv(id){
  const p = (allInventory || []).find(function(x){ return x.id === id; });
  if(!p) return;
  document.getElementById('shBarcode').value = p.barcode || '';
  document.getElementById('shName').value = p.name || '';
  document.getElementById('shPrice').value = p.price || '';
  document.getElementById('shInvSuggest').innerHTML = '';
  document.getElementById('shSearch').value = '';
  shopRenderStockHint();
}
window.shopPickInv = shopPickInv;

/* 📦 الكمية المتاحة فعليًا في الفروع — بتتعرض جنب خانة العدد.
   ⚠️ من غيرها المالك بيخصّص ١٠ للبيع أونلاين وعنده ٢ في المخزن،
      والعميلة تطلب وتيجي تلاقي مفيش. */
function shopRenderStockHint(){
  const el = document.getElementById('shStockHint');
  if(!el) return;
  const bc = (document.getElementById('shBarcode') || {}).value || '';
  const p = (allInventory || []).find(function(x){ return String(x.barcode) === String(bc).trim(); });
  if(!p){ el.textContent = ''; return; }
  const by = p.qtyByBranch || {};
  const parts = Object.keys(by).filter(function(b){ return Number(by[b]) > 0; })
    .map(function(b){ return b + ': ' + Number(by[b]); });
  el.innerHTML = parts.length
    ? '📦 المتاح في المخزون — ' + parts.join(' · ')
    : '<span style="color:var(--minus);">⚠️ الصنف ده مفيهوش كمية في أي فرع دلوقتي</span>';
}
window.shopRenderStockHint = shopRenderStockHint;

function shopPickImage(input){
  const f = input.files && input.files[0];
  if(!f) return;
  resizeImageFile(f, 620, function(dataUrl){
    shopPendingImg = dataUrl;
    document.getElementById('shImgPreview').innerHTML =
      '<img src="' + dataUrl + '" style="width:100%; border-radius:10px; margin-bottom:8px;">';
  });
}
window.shopPickImage = shopPickImage;

function shopClearForm(){
  ['shBarcode','shName','shPrice','shDesc','shQty','shSearch'].forEach(function(id){
    const el = document.getElementById(id); if(el) el.value = '';
  });
  shopPendingImg = ''; shopEditId = null;
  const pv = document.getElementById('shImgPreview'); if(pv) pv.innerHTML = '';
  const hint = document.getElementById('shStockHint'); if(hint) hint.textContent = '';
  const btn = document.getElementById('shSaveBtn'); if(btn) btn.textContent = '➕ ضيفه للبيع أونلاين';
}
window.shopClearForm = shopClearForm;

async function shopSaveItem(){
  if(_busyOps.has('shopItem')) return;
  const barcode = (document.getElementById('shBarcode').value || '').trim();
  const name = (document.getElementById('shName').value || '').trim();
  const price = parseFloat(document.getElementById('shPrice').value) || 0;
  const qty = Math.max(0, parseInt(document.getElementById('shQty').value) || 0);
  const desc = (document.getElementById('shDesc').value || '').trim();

  /* ⚠️ التلات فحوصات دي هي الفرق بين أوردر شغّال وأوردر بيترفض
     قدام العميلة: من غير باركود مفيش فحص كمية، ومن غير سعر الأوردر
     بيتحسب بصفر، ومن غير عدد مفيش حاجة تتباع أصلًا. */
  if(!barcode){ showToast('اختار الصنف من المخزون الأول (لازم باركود)', 'err'); return; }
  if(!name){ showToast('اكتب الاسم اللي هيبان للعميلة', 'err'); return; }
  if(price <= 0){ showToast('السعر لازم يكون أكبر من صفر', 'err'); return; }
  if(qty <= 0){ showToast('حدّد عدد القطع المتاحة للبيع أونلاين', 'err'); return; }

  _busyOps.add('shopItem');
  const existing = shopEditId
    ? shopData.items.find(function(x){ return x.id === shopEditId; })
    : shopData.items.find(function(x){ return String(x.barcode) === barcode; });

  const before = JSON.stringify(shopData.items);
  if(existing){
    existing.barcode = barcode; existing.name = name; existing.price = price;
    existing.onlineQty = qty; existing.desc = desc;
    if(shopPendingImg) existing.img = shopPendingImg;
    existing.active = true;
  }else{
    shopData.items.push({
      id: 's' + Date.now().toString(36),
      barcode: barcode, name: name, price: price,
      onlineQty: qty, desc: desc, img: shopPendingImg || '',
      active: true, addedAt: Date.now()
    });
  }
  try{
    await saveShopDoc();
    shopClearForm();
    showToast(existing ? 'اتحدّث ✅' : 'اتضاف للبيع أونلاين ✅');
    renderShopAdmin();
  }catch(e){
    // ⚠️ الرجوع للحالة القديمة: من غيره الشاشة بتقول «اتحفظ» وهو ماتحفظش
    shopData.items = JSON.parse(before);
    showToast('خطأ (يمكن الصورة كبيرة): ' + e.message, 'err');
  }finally{ _busyOps.delete('shopItem'); }
}
window.shopSaveItem = shopSaveItem;

function shopEditItem(id){
  const it = shopData.items.find(function(x){ return x.id === id; });
  if(!it) return;
  shopEditId = id;
  document.getElementById('shBarcode').value = it.barcode || '';
  document.getElementById('shName').value = it.name || '';
  document.getElementById('shPrice').value = it.price || '';
  document.getElementById('shQty').value = it.onlineQty || 0;
  document.getElementById('shDesc').value = it.desc || '';
  document.getElementById('shImgPreview').innerHTML = it.img
    ? '<img src="' + it.img + '" style="width:100%; border-radius:10px; margin-bottom:8px;">' : '';
  document.getElementById('shSaveBtn').textContent = '💾 احفظ التعديل';
  shopRenderStockHint();
  window.scrollTo(0, 0);
}
window.shopEditItem = shopEditItem;

/* ⏸️ إيقاف مؤقت — أحسن من الحذف: التاريخ والصورة والوصف بيفضلوا،
   والرجوع دوسة واحدة. */
async function shopToggleActive(id){
  const it = shopData.items.find(function(x){ return x.id === id; });
  if(!it) return;
  it.active = !it.active;
  try{ await saveShopDoc(); renderShopAdmin();
       showToast(it.active ? 'اترجّع للبيع ✅' : 'اتوقف مؤقتًا'); }
  catch(e){ it.active = !it.active; showToast('خطأ: ' + e.message, 'err'); }
}
window.shopToggleActive = shopToggleActive;

async function shopDelItem(id){
  const it = shopData.items.find(function(x){ return x.id === id; });
  if(!it) return;
  if(!confirm('تشيل «' + (it.name || '') + '» من البيع أونلاين خالص؟')) return;
  const before = shopData.items.slice();
  shopData.items = shopData.items.filter(function(x){ return x.id !== id; });
  try{ await saveShopDoc(); renderShopAdmin(); }
  catch(e){ shopData.items = before; showToast('خطأ: ' + e.message, 'err'); }
}
window.shopDelItem = shopDelItem;

function renderShopAdmin(){
  const w = document.getElementById('shopAdminWrap');
  if(!w) return;
  const inp = 'width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); margin-bottom:8px;';
  const brand = (typeof catalogBrand === 'function' && catalogBrand() === 'glow') ? 'Glow' : 'echarpe';
  const live = shopData.items.filter(function(x){ return x.active && Number(x.onlineQty) > 0; }).length;

  const cfgPanel =
    '<div style="background:var(--panel); border:1px solid var(--border); border-radius:14px; padding:14px; margin-bottom:16px;">'
      + '<div style="font-weight:800; margin-bottom:10px;">🚚 التسليم والشحن</div>'
      + '<label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700; margin-bottom:8px; cursor:pointer;">'
        + '<input type="checkbox" id="cfgPickup" ' + (shopCfg.pickupEnabled ? 'checked' : '') + ' style="width:17px; height:17px;"> 🏬 استلام من الفرع</label>'
      + '<label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700; margin-bottom:10px; cursor:pointer;">'
        + '<input type="checkbox" id="cfgDelivery" ' + (shopCfg.deliveryEnabled ? 'checked' : '') + ' style="width:17px; height:17px;"> 🚚 شحن للبيت</label>'
      + '<div style="display:flex; gap:8px;">'
        + '<input id="cfgFee" type="number" placeholder="مصاريف الشحن الموحّدة" value="' + (shopCfg.shippingFee || '') + '" style="' + inp + ' flex:1;">'
        + '<input id="cfgFreeOver" type="number" placeholder="شحن مجاني فوق (فاضي=لأ)" value="' + (shopCfg.freeOver || '') + '" style="' + inp + ' flex:1;">'
      + '</div>'
      + '<label style="display:block; font-size:12px; font-weight:700; color:var(--muted); margin-bottom:4px;">🗺️ رسم مختلف لمحافظات معيّنة — سطر لكل واحدة: <b>الاسم = الرسم</b></label>'
      + '<textarea id="cfgGovs" placeholder="القاهرة = 60&#10;الجيزة = 60&#10;أسوان = 110" style="' + inp + ' min-height:70px; direction:rtl;">'
        + (shopCfg.governorates || []).map(function(g){ return g.name + ' = ' + g.fee; }).join('\n') + '</textarea>'
      + '<div style="font-size:11px; color:var(--muted); margin-bottom:8px;">⚠️ المحافظة اللي مش مكتوبة بتاخد الرسم الموحّد — مش بتتمنع من الطلب.</div>'
      + '<button onclick="shopSaveCfg()" style="width:100%; padding:11px; border-radius:9px; border:none; background:var(--accent); color:#fff; font-weight:800; cursor:pointer;">💾 احفظ إعدادات التسليم</button>'
    + '</div>';

  w.innerHTML =
    '<div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:8px 12px; margin-bottom:14px; font-size:12px; color:var(--muted);">'
      + 'بتعدّل منتجات البيع أونلاين لـ<b style="color:var(--text);">' + brand + '</b> — '
      + 'دي اللي العميلة بتشوفها في تبويب «اطلبي» في التطبيق وعلى الموقع. '
      + '<b style="color:var(--text);">' + live + '</b> منتج معروض دلوقتي.'
    + '</div>'

    + cfgPanel

    + '<div style="background:var(--panel); border:1px solid var(--border); border-radius:14px; padding:14px; margin-bottom:16px;">'
      + '<div style="font-weight:800; margin-bottom:10px;">🛒 ضيف منتج للبيع أونلاين</div>'
      + '<input id="shSearch" placeholder="🔍 اختار من المخزون (اسم أو باركود)" oninput="shopInvSuggest(this.value)" style="' + inp + '">'
      + '<div id="shInvSuggest" style="background:var(--panel2); border-radius:8px; margin-top:-4px; margin-bottom:8px; overflow:hidden;"></div>'
      + '<input id="shBarcode" placeholder="الباركود (بيتملأ لوحده)" oninput="shopRenderStockHint()" style="' + inp + '">'
      + '<input id="shName" placeholder="الاسم اللي هيبان للعميلة" style="' + inp + '">'
      + '<div style="display:flex; gap:8px;">'
        + '<input id="shPrice" type="number" placeholder="السعر" style="' + inp + ' flex:1;">'
        + '<input id="shQty" type="number" placeholder="عدد البيع أونلاين" style="' + inp + ' flex:1;">'
      + '</div>'
      + '<div id="shStockHint" style="font-size:11.5px; color:var(--muted); font-weight:700; margin:-2px 0 10px;"></div>'
      + '<textarea id="shDesc" placeholder="الوصف — الخامة، المقاس، التفصيلة اللي بتفرق" style="' + inp + ' min-height:70px;"></textarea>'
      + '<label style="display:block; font-size:12px; font-weight:700; color:var(--muted); margin-bottom:4px;">📷 صورة المنتج</label>'
      + '<input type="file" id="shImgFile" accept="image/*" onchange="shopPickImage(this)" style="' + inp + '">'
      + '<div id="shImgPreview"></div>'
      + '<div style="display:flex; gap:8px;">'
        + '<button id="shSaveBtn" onclick="shopSaveItem()" style="flex:2; padding:11px; border-radius:9px; border:none; background:var(--plus); color:#062; font-weight:800; cursor:pointer;">➕ ضيفه للبيع أونلاين</button>'
        + '<button onclick="shopClearForm()" style="flex:1; padding:11px; border-radius:9px; border:1px solid var(--border); background:var(--panel2); color:var(--muted); font-weight:800; cursor:pointer;">تفريغ</button>'
      + '</div>'
    + '</div>'

    + '<div style="font-weight:800; margin-bottom:10px;">🛍️ المعروض أونلاين (' + shopData.items.length + ')</div>'
    + '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px;">'
    + (shopData.items.map(function(it){
        const p = (allInventory || []).find(function(x){ return String(x.barcode) === String(it.barcode); });
        const total = p ? Object.keys(p.qtyByBranch || {}).reduce(function(a, b){ return a + (Number(p.qtyByBranch[b]) || 0); }, 0) : null;
        /* ⚠️ التحذير ده هو اللي بيمنع أكتر غلطة متوقعة: عدد أونلاين
           أكبر من المخزون الحقيقي = وعد مش هنقدر نوفيه. */
        const over = (total !== null && Number(it.onlineQty) > total);
        return '<div style="background:var(--panel); border:1px solid ' + (it.active ? 'var(--border)' : 'var(--warn)') + '; border-radius:12px; overflow:hidden; opacity:' + (it.active ? '1' : '.65') + ';">'
          + '<div style="width:100%; height:120px; background:#eee center/cover no-repeat; background-image:url(\'' + String(it.img || '').replace(/'/g, '') + '\');"></div>'
          + '<div style="padding:8px 10px;">'
            + '<div style="font-weight:700; font-size:13px;">' + (it.name || '') + '</div>'
            + '<div style="color:var(--plus); font-weight:800; font-size:13px;">' + (it.price || 0) + ' ج.م</div>'
            + '<div style="font-size:11px; font-weight:800; color:' + (over ? 'var(--minus)' : 'var(--muted)') + ';">'
              + '🛒 للبيع أونلاين: ' + (it.onlineQty || 0)
              + (total !== null ? ' · بالمخزون: ' + total : '') + '</div>'
            + (over ? '<div style="color:var(--minus); font-size:10.5px; font-weight:800;">⚠️ العدد أكبر من المخزون</div>' : '')
            + (it.barcode ? '<div style="color:var(--muted); font-size:10px;">كود: ' + it.barcode + '</div>' : '')
            + '<div style="display:flex; gap:5px; margin-top:6px;">'
              + '<button onclick="shopEditItem(\'' + it.id + '\')" style="flex:1; padding:6px; border-radius:7px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-size:11px; cursor:pointer;">تعديل</button>'
              + '<button onclick="shopToggleActive(\'' + it.id + '\')" style="flex:1; padding:6px; border-radius:7px; border:1px solid var(--border); background:var(--panel2); color:' + (it.active ? 'var(--warn)' : 'var(--plus)') + '; font-size:11px; font-weight:800; cursor:pointer;">' + (it.active ? '⏸️ وقف' : '▶️ شغّل') + '</button>'
              + '<button onclick="shopDelItem(\'' + it.id + '\')" style="flex:0 0 34px; padding:6px; border-radius:7px; border:1px solid var(--border); background:var(--panel2); color:var(--minus); font-size:11px; cursor:pointer;">✖</button>'
            + '</div>'
          + '</div></div>';
      }).join('') || '<div style="color:var(--muted); font-size:13px;">لسه مفيش منتجات معروضة للبيع أونلاين.</div>')
    + '</div>';
}
window.renderShopAdmin = renderShopAdmin;

if(typeof module !== 'undefined' && module.exports){
  module.exports = { SHOP_DOC_PREFIX };
}
