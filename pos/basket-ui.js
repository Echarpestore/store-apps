/* ============================================================
   🧺 basket-ui.js — «اللي بيتاخد مع» في POS
   ------------------------------------------------------------
   الحساب كله في `basket-core.js` المتختبر. الملف ده:
     · بيقرا الموديل المحفوظ (مستند واحد) عند فتح POS
     · بيرسم **اقتراح واحد** فوق السلة، بدوسة واحدة يتضاف
     · شاشة للمالك بأقوى الارتباطات + زرار إعادة بناء

   💰 القراءات — ده المكان اللي ممكن يولّع الفاتورة لو اتساب:
     · الموديل **مستند واحد** بيتقري مرة واحدة عند فتح البرنامج.
       الاقتراح بعد كده حساب في الذاكرة — **صفر قراءة** لكل فاتورة.
     · إعادة البناء بتقرا الفواتير مرة واحدة، **بأمر المالك** بس،
       وبنافذة زمنية وسقف. مش بتشتغل لوحدها في الخلفية.
   ⚠️ الفرق بين ده وبين حساب الاقتراح لحظيًا من الفواتير: التاني
      بيقرا مئات المستندات **مع كل صنف بيتضاف** — ده اللي بيخلي
      فاتورة Firestore تتضاعف من غير ما حد يلاحظ.
   ============================================================ */

const BASKET_DOC_PREFIX = 'basket_model_';

let basketModel = null;
let _basketBuilding = false;
let _basketDismissed = {};   // اقتراح الكاشير قفلته — ميرجعش في نفس السلة

function basketDocId(){
  return BASKET_DOC_PREFIX + (typeof catalogBrand === 'function' ? catalogBrand() : 'echarpe');
}

/* 📥 التحميل — مرة واحدة لكل جلسة.
   ⚠️ الفشل صامت عن قصد: الاقتراحات ميزة إضافية، وسقوطها **ممنوع**
      يعطّل البيع. نفس مبدأ عزل الشات عن مسار الفاتورة. */
function basketLoadModel(){
  try{
    return db.collection(TEST_SETTINGS).doc(basketDocId()).get()
      .then(function(d){
        basketModel = d.exists ? d.data() : null;
        try{ basketRenderStrip(); }catch(e){}
      })
      .catch(function(e){ console.warn('basket load', e && e.code); });
  }catch(e){ console.warn('basket load', e); return null; }
}
window.basketLoadModel = basketLoadModel;

/* 💡 الشريط — اقتراح واحد بس.
   ⚠️ لو مفيش اقتراح مؤكد، الشريط **بيختفي** مش بيعرض كلام عام.
      شريط دايمًا مليان = الكاشير تبطّل تبص عليه في يومين. */
function basketRenderStrip(){
  const box = document.getElementById('basketStrip');
  if(!box) return;
  if(!basketModel || !cart || !cart.length){ box.style.display = 'none'; box.innerHTML = ''; return; }

  const s = basketSuggest(basketModel, {
    cart: cart.filter(function(c){ return !c.isReturn && !c.isRedemption && !c.isRewardDiscount; }),
    products: (typeof allInventory !== 'undefined' ? allInventory : []),
    branch: currentBranch
  });

  if(!s || _basketDismissed[s.barcode]){ box.style.display = 'none'; box.innerHTML = ''; return; }

  box.style.display = 'flex';
  box.innerHTML =
      '<div style="flex:1; min-width:0;">'
      + '<div style="font-size:11px; font-weight:800; color:var(--muted);">🧺 ' + ordEscSafe(s.reason) + '</div>'
      + '<div style="font-weight:800; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">'
        + ordEscSafe(s.name) + ' — ' + s.price.toFixed(2) + ' ج.م</div>'
    + '</div>'
    + '<button onclick="basketAdd(\'' + s.barcode + '\')" style="flex:0 0 auto; padding:9px 16px; border-radius:9px; border:none; background:var(--accent); color:#fff; font-weight:800; font-size:13px; cursor:pointer;">➕ ضيفه</button>'
    + '<button onclick="basketDismiss(\'' + s.barcode + '\')" title="مش دلوقتي" style="flex:0 0 auto; padding:9px 11px; border-radius:9px; border:1px solid var(--border); background:var(--panel2); color:var(--muted); font-size:13px; cursor:pointer;">✖</button>';
}
window.basketRenderStrip = basketRenderStrip;

function ordEscSafe(x){
  return (typeof reqEsc === 'function') ? reqEsc(x) : String(x == null ? '' : x);
}

/* ➕ الإضافة — بتعدّي على `addToCart` العادية.
   ⚠️ ممنوع تضيف على السلة بإيدها: `addToCart` فيها الخصومات
      وتوليد `sid` وتحديد الصف — تخطّيها بيكسر تلات حاجات بصمت. */
function basketAdd(barcode){
  const p = (allInventory || []).find(function(x){ return String(x.barcode) === String(barcode); });
  if(!p){ showToast('الصنف مش موجود', 'err'); return; }
  addToCart(p);
  if(typeof _logActivity === 'function'){
    // 📈 عشان نعرف بعدين: الاقتراحات دي بتتقبل ولا الكاشير بتقفلها
    try{ _logActivity('basket_suggest_added', { barcode: String(barcode), name: p.name || '' }); }catch(e){}
  }
}
window.basketAdd = basketAdd;

function basketDismiss(barcode){
  _basketDismissed[String(barcode)] = true;
  basketRenderStrip();
}
window.basketDismiss = basketDismiss;

/* 🧹 سلة جديدة = اقتراحات جديدة. بتتنادى من مسار بدء بيع جديد. */
function basketResetDismissed(){ _basketDismissed = {}; }
window.basketResetDismissed = basketResetDismissed;

/* ============================================================
   📊 شاشة المالك — «اللي بيتباع مع بعضه»
   ============================================================ */
function goToBasketInsights(){
  showScreen('basketScreen');
  renderBasketScreen();
}
window.goToBasketInsights = goToBasketInsights;

function renderBasketScreen(){
  const w = document.getElementById('basketWrap');
  if(!w) return;
  const m = basketModel;

  if(!m || !m.pairs){
    w.innerHTML = '<div style="padding:24px; text-align:center; color:var(--muted); font-size:14px; line-height:2;">'
      + 'لسه مفيش تحليل.<br>دوس «إعادة البناء» وهو هيقرا فواتير آخر '
      + BASKET_DEFAULTS.windowDays + ' يوم ويطلّع الأنماط.</div>';
    return;
  }

  const pairs = basketTopPairs(m, 40);
  const byBc = {};
  (allInventory || []).forEach(function(p){ if(p && p.barcode) byBc[String(p.barcode)] = p; });
  const nm = function(bc){ return (byBc[bc] && byBc[bc].name) || bc; };
  const stale = basketIsStale(m, Date.now(), 14);
  const built = m.builtAt ? new Date(Number(m.builtAt)).toLocaleDateString('ar-EG', { day:'numeric', month:'long' }) : '—';

  w.innerHTML =
    '<div style="background:var(--panel); border:1px solid ' + (stale ? 'var(--warn)' : 'var(--border)') + '; border-radius:12px; padding:10px 12px; margin-bottom:14px; font-size:12.5px; color:var(--muted);">'
      + 'اتبنى من <b style="color:var(--text);">' + (m.invoices || 0) + '</b> فاتورة · آخر تحديث <b style="color:var(--text);">' + built + '</b>'
      + (stale ? ' · <b style="color:var(--warn);">⚠️ بقاله فترة — الموسم بيتغيّر</b>' : '')
    + '</div>'

    + (pairs.length
      ? '<div style="display:grid; gap:8px; margin-bottom:20px;">'
        + pairs.map(function(r){
            /* 🗣️ العرض بالنسبة المئوية مش بالـlift: «٦٣٪ من اللي
               اشتروا ده اشتروا ده» بتتفهم فورًا، و«lift 2.25» لأ. */
            return '<div style="background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:11px 13px;">'
              + '<div style="font-weight:800; font-size:13.5px;">' + ordEscSafe(nm(r.a)) + ' <span style="color:var(--muted);">+</span> ' + ordEscSafe(nm(r.b)) + '</div>'
              + '<div style="font-size:11.5px; color:var(--muted); font-weight:700; margin-top:3px;">'
                + 'اتشروا مع بعض في <b>' + r.n + '</b> فاتورة · '
                + '<b>' + Math.round(r.conf * 100) + '٪</b> من اللي أخدوا الأول أخدوا التاني · '
                + 'قوة العلاقة <b>×' + r.lift + '</b></div>'
            + '</div>';
          }).join('')
        + '</div>'
      : '<div style="padding:24px; text-align:center; color:var(--muted);">مفيش أنماط مؤكدة لسه — محتاج فواتير أكتر.</div>');
}
window.renderBasketScreen = renderBasketScreen;

/* 🔨 إعادة البناء — **بأمر المالك بس**.
   ⚠️ القراءة محكومة: نافذة زمنية + سقف. من غيرهم الزرار ده بيقرا
      كل فواتير المحل من أول يوم في كل ضغطة. */
async function basketRebuild(){
  if(_basketBuilding) return;
  if(typeof hasPerm === 'function' && !hasPerm('canViewReports')){
    showToast('مفيش صلاحية', 'err'); return;
  }
  _basketBuilding = true;
  const btn = document.getElementById('basketBuildBtn');
  if(btn){ btn.disabled = true; btn.textContent = '⏳ بيقرا الفواتير...'; }
  try{
    const from = Date.now() - BASKET_DEFAULTS.windowDays * 86400000;
    const snap = await db.collection(TEST_SALES)
      .where('createdAt', '>=', firebase.firestore.Timestamp.fromMillis(from))
      .limit(4000)
      .get();
    const sales = snap.docs.map(function(d){ return d.data(); });
    const model = basketBuildModel(sales, { now: Date.now() });

    /* ⚠️ حد الحجم: مستند Firestore أقصاه ١ ميجا. لو الموديل كبر،
       بنقلّم بدل ما الحفظ يفشل والمالك يفتكر إنه اتحفظ. */
    let m = model;
    if(basketModelSize(m) > 700000){
      m = basketBuildModel(sales, { now: Date.now(), maxAnchors: 250, topPerItem: 3 });
    }
    await db.collection(TEST_SETTINGS).doc(basketDocId()).set(m);
    basketModel = m;
    showToast('اتحدّث ✅ — ' + (m.invoices || 0) + ' فاتورة');
    renderBasketScreen();
    basketRenderStrip();
  }catch(e){
    console.warn('basket build', e);
    showToast('مانفعش: ' + (e && e.message || ''), 'err');
  }finally{
    _basketBuilding = false;
    const b = document.getElementById('basketBuildBtn');
    if(b){ b.disabled = false; b.textContent = '🔨 إعادة البناء'; }
  }
}
window.basketRebuild = basketRebuild;

/* ============================================================
   ⭐ حملات نقط الموظفين — الشاشة
   ------------------------------------------------------------
   «المنتج ده بنقطة للموظفة» — عشان نحرّك صنف بعينه.
   الحساب في `calcStaffBonus` (pos-sale) والاختبارات عليه.
   ============================================================ */
function boostDocId(){
  return 'staff_point_boosts_' + (typeof catalogBrand === 'function' ? catalogBrand() : 'echarpe');
}

async function goToStaffBoosts(){
  if(typeof hasPerm === 'function' && !hasPerm('canEditInventory')){
    showToast('مفيش صلاحية', 'err'); return;
  }
  showScreen('boostScreen');
  document.getElementById('boostWrap').innerHTML = '<div class="empty-cart">بيتحمّل...</div>';
  try{
    const d = await db.collection(TEST_SETTINGS).doc(boostDocId()).get();
    staffBoosts = d.exists ? Object.assign({ items:[] }, d.data()) : { items:[] };
    if(!Array.isArray(staffBoosts.items)) staffBoosts.items = [];
    window.staffBoosts = staffBoosts;
  }catch(e){ staffBoosts = { items:[] }; }
  renderBoostScreen();
}
window.goToStaffBoosts = goToStaffBoosts;

async function saveBoostDoc(){
  await db.collection(TEST_SETTINGS).doc(boostDocId()).set(staffBoosts, { merge:true });
}

function boostInvSuggest(q){
  const box = document.getElementById('bstInvSuggest');
  q = (q || '').trim().toLowerCase();
  if(!q){ box.innerHTML = ''; return; }
  const ms = (allInventory || []).filter(function(p){
    return String(p.name || '').toLowerCase().includes(q)
        || String(p.barcode || '').toLowerCase().includes(q);
  }).slice(0, 8);
  box.innerHTML = ms.map(function(p){
    return '<div onclick="boostPickInv(\'' + p.id + '\')" style="padding:9px 10px; border-bottom:1px solid var(--border); cursor:pointer; font-size:13px;">'
      + (p.name || '') + ' <span style="color:var(--muted); font-size:11px;">' + (p.barcode || '') + '</span></div>';
  }).join('');
}
window.boostInvSuggest = boostInvSuggest;

function boostPickInv(id){
  const p = (allInventory || []).find(function(x){ return x.id === id; });
  if(!p) return;
  document.getElementById('bstBarcode').value = p.barcode || '';
  document.getElementById('bstName').value = p.name || '';
  document.getElementById('bstInvSuggest').innerHTML = '';
  document.getElementById('bstSearch').value = '';
}
window.boostPickInv = boostPickInv;

async function boostAdd(){
  if(_busyOps.has('boost')) return;
  const barcode = (document.getElementById('bstBarcode').value || '').trim();
  const name = (document.getElementById('bstName').value || '').trim();
  const points = Number(document.getElementById('bstPoints').value) || 0;
  const days = parseInt(document.getElementById('bstDays').value) || 0;

  if(!barcode){ showToast('اختار الصنف من المخزون الأول', 'err'); return; }
  if(points <= 0){ showToast('اكتب نقط القطعة (مثلاً 1)', 'err'); return; }
  /* ⚠️ المدة **إجبارية**: حملة من غير نهاية بتفضل شغالة نسيان،
     والموظفة تاخد نقط على منتج بطّلت تهتم بيه من شهور. */
  if(days <= 0){ showToast('حدّد الحملة بتقف بعد كام يوم', 'err'); return; }

  _busyOps.add('boost');
  const before = JSON.stringify(staffBoosts.items);
  const until = Date.now() + days * 86400000;
  const ex = staffBoosts.items.find(function(x){ return String(x.barcode) === barcode; });
  if(ex){ ex.name = name; ex.points = points; ex.until = until; ex.active = true; }
  else staffBoosts.items.push({
    id: 'b' + Date.now().toString(36), barcode: barcode, name: name,
    points: points, until: until, active: true, addedAt: Date.now()
  });
  try{
    await saveBoostDoc();
    ['bstBarcode','bstName','bstPoints','bstDays','bstSearch'].forEach(function(id){
      const el = document.getElementById(id); if(el) el.value = '';
    });
    showToast('الحملة بدأت ⭐');
    renderBoostScreen();
  }catch(e){
    staffBoosts.items = JSON.parse(before);
    showToast('خطأ: ' + e.message, 'err');
  }finally{ _busyOps.delete('boost'); }
}
window.boostAdd = boostAdd;

async function boostStop(id){
  const it = staffBoosts.items.find(function(x){ return x.id === id; });
  if(!it) return;
  if(!confirm('توقف حملة «' + (it.name || '') + '»؟')) return;
  const before = staffBoosts.items.slice();
  staffBoosts.items = staffBoosts.items.filter(function(x){ return x.id !== id; });
  try{ await saveBoostDoc(); renderBoostScreen(); showToast('اتوقفت'); }
  catch(e){ staffBoosts.items = before; showToast('خطأ: ' + e.message, 'err'); }
}
window.boostStop = boostStop;

function renderBoostScreen(){
  const w = document.getElementById('boostWrap');
  if(!w) return;
  const inp = 'width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); margin-bottom:8px;';
  const now = Date.now();
  const items = (staffBoosts && staffBoosts.items) || [];
  const live = activeBoosts(staffBoosts, now).length;

  w.innerHTML =
    '<div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:10px 12px; margin-bottom:14px; font-size:12.5px; color:var(--muted); line-height:1.9;">'
      + 'النقط دي <b style="color:var(--text);">بتتزاد فوق</b> نظام «كل ' + MIN_ITEMS_FOR_STAFF_POINT + ' قطع = نقطة» مش بدله — '
      + 'يعني الموظفة اللي بتبيع منتج الحملة مبتخسرش نقط القطع التانية. '
      + '<b style="color:var(--text);">' + live + '</b> حملة شغالة دلوقتي.'
    + '</div>'

    + '<div style="background:var(--panel); border:1px solid var(--border); border-radius:14px; padding:14px; margin-bottom:16px;">'
      + '<div style="font-weight:800; margin-bottom:10px;">⭐ ابدأ حملة على منتج</div>'
      + '<input id="bstSearch" placeholder="🔍 اختار من المخزون (اسم أو باركود)" oninput="boostInvSuggest(this.value)" style="' + inp + '">'
      + '<div id="bstInvSuggest" style="background:var(--panel2); border-radius:8px; margin-top:-4px; margin-bottom:8px; overflow:hidden;"></div>'
      + '<input id="bstBarcode" placeholder="الباركود (بيتملأ لوحده)" style="' + inp + '">'
      + '<input id="bstName" placeholder="اسم المنتج" style="' + inp + '">'
      + '<div style="display:flex; gap:8px;">'
        + '<input id="bstPoints" type="number" step="0.25" placeholder="نقط القطعة (مثلاً 1)" style="' + inp + ' flex:1;">'
        + '<input id="bstDays" type="number" placeholder="تقف بعد كام يوم" style="' + inp + ' flex:1;">'
      + '</div>'
      + '<button onclick="boostAdd()" style="width:100%; padding:11px; border-radius:9px; border:none; background:var(--plus); color:#062; font-weight:800; cursor:pointer;">⭐ ابدأ الحملة</button>'
    + '</div>'

    + '<div style="font-weight:800; margin-bottom:10px;">الحملات (' + items.length + ')</div>'
    + (items.map(function(b){
        const over = !(Number(b.until) > now);
        const left = over ? 0 : Math.ceil((Number(b.until) - now) / 86400000);
        return '<div style="background:var(--panel); border:1px solid ' + (over ? 'var(--warn)' : 'var(--border)') + '; border-radius:10px; padding:11px 13px; margin-bottom:8px; display:flex; align-items:center; gap:10px; opacity:' + (over ? '.6' : '1') + ';">'
          + '<div style="flex:1; min-width:0;">'
            + '<div style="font-weight:800; font-size:13.5px;">' + (b.name || b.barcode) + '</div>'
            + '<div style="font-size:11.5px; color:' + (over ? 'var(--warn)' : 'var(--muted)') + '; font-weight:700;">'
              + '⭐ ' + b.points + ' نقطة للقطعة · '
              + (over ? 'انتهت' : 'باقي ' + left + ' يوم') + '</div>'
          + '</div>'
          + '<button onclick="boostStop(\'' + b.id + '\')" style="flex:0 0 auto; padding:7px 12px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--minus); font-size:11.5px; font-weight:800; cursor:pointer;">' + (over ? 'امسح' : '⏹️ وقف') + '</button>'
        + '</div>';
      }).join('') || '<div style="color:var(--muted); font-size:13px;">مفيش حملات.</div>');
}
window.renderBoostScreen = renderBoostScreen;

/* 👀 الكاشير لازم تشوف الحافز **وهي بتبيع** — الشاشة اللي المالك
   بيظبط منها مبتوصلش لحد. الشريط بيبان فوق السلة لما يكون في
   السلة منتج حملة. */
function boostRenderStrip(){
  const el = document.getElementById('boostStrip');
  if(!el) return;
  const bonus = (typeof calcStaffBonus === 'function')
    ? calcStaffBonus(cart, staffBoosts, Date.now(), false) : 0;
  if(!bonus){ el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'block';
  el.innerHTML = '⭐ نقط إضافية ليكي من الفاتورة دي: <b>' + bonus + '</b>';
}
window.boostRenderStrip = boostRenderStrip;
