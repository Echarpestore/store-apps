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
