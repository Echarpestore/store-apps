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
  basketStat('accepted');
}
window.basketAdd = basketAdd;

function basketDismiss(barcode){
  _basketDismissed[String(barcode)] = true;
  basketStat('dismissed');
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

    + basketInsightsHTML(m.insights)

    + basketInsightsHTML(m, byBc)

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


/* ============================================================
   📊 لوحة المعلومات — الأرقام اللي بتتصرّف عليها
   ⚠️ كل رقم هنا **معاه تصرّف**. رقم من غير تصرّف بيتقري مرة واحدة
      وبعدين بيتجاهل — نفس درس الشريط المليان.
   ============================================================ */
function basketInsightsHTML(m, byBc){
  const ins = m && m.insights;
  if(!ins) return '';
  const nm = function(bc){ return (byBc[bc] && byBc[bc].name) || bc; };
  const card = function(title, big, sub, color){
    return '<div style="flex:1; min-width:130px; background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:11px 13px;">'
      + '<div style="font-size:11px; color:var(--muted); font-weight:700;">' + title + '</div>'
      + '<div style="font-size:20px; font-weight:900; color:' + (color || 'var(--text)') + ';">' + big + '</div>'
      + '<div style="font-size:10.5px; color:var(--muted);">' + (sub || '') + '</div></div>';
  };

  const peakH = basketPeak(ins.byHour);
  const peakD = basketPeak(ins.byDow);
  const hourTxt = peakH.value ? (peakH.idx + ':00 – ' + ((peakH.idx + 1) % 24) + ':00') : '—';

  /* 📉 الفواتير بصنف واحد — ده **الرقم اللي بيتحوّل فلوس**: كل
     فاتورة بصنف واحد فرصة ضايعة لصنف تاني. */
  const singleColor = ins.singlePct >= 60 ? 'var(--warn)' : 'var(--text)';

  let html = '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">'
    + card('متوسط القطع في الفاتورة', ins.avgBasket, ins.invoices + ' فاتورة')
    + card('متوسط الفاتورة', ins.avgTicket + ' ج', 'إجمالي ' + ins.money.toLocaleString('en-US') + ' ج')
    + card('فواتير بصنف واحد', ins.singlePct + '٪', 'كل واحدة فرصة صنف تاني', singleColor)
    + card('ساعة الذروة', hourTxt, 'بتوقيت القاهرة · ' + (BASKET_DOW_AR[peakD.idx] || ''))
    + '</div>';

  // 🕒 الساعات — شريط نسبي بسيط
  const maxH = peakH.value || 1;
  html += '<div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:12px 13px; margin-bottom:14px;">'
    + '<div style="font-weight:800; font-size:13px; margin-bottom:8px;">🕒 البيع على مدار اليوم <span style="font-size:11px; color:var(--muted); font-weight:700;">(القاهرة)</span></div>'
    + '<div style="display:flex; align-items:flex-end; gap:2px; height:64px;">'
    + ins.byHour.map(function(v, h){
        const pct = Math.round((v / maxH) * 100);
        const on = v === peakH.value && v > 0;
        return '<div title="' + h + ':00 — ' + v + ' فاتورة" style="flex:1; display:flex; flex-direction:column; justify-content:flex-end; height:100%;">'
          + '<div style="height:' + Math.max(pct, 2) + '%; background:' + (on ? 'var(--accent)' : 'var(--border)') + '; border-radius:3px 3px 0 0;"></div></div>';
      }).join('')
    + '</div>'
    + '<div style="display:flex; justify-content:space-between; font-size:10px; color:var(--muted); margin-top:4px;"><span>12ص</span><span>6ص</span><span>12ظ</span><span>6م</span><span>11م</span></div>'
    + '</div>';

  // 📅 الأيام
  const maxD = peakD.value || 1;
  html += '<div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:12px 13px; margin-bottom:14px;">'
    + '<div style="font-weight:800; font-size:13px; margin-bottom:8px;">📅 أيام الأسبوع</div>'
    + BASKET_DOW_AR.map(function(d, i){
        const pct = Math.round((ins.byDow[i] / maxD) * 100);
        return '<div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">'
          + '<span style="width:52px; font-size:11.5px; font-weight:700;">' + d + '</span>'
          + '<div style="flex:1; height:9px; background:var(--panel2); border-radius:99px; overflow:hidden;">'
            + '<div style="width:' + Math.max(pct, 1) + '%; height:100%; background:' + (ins.byDow[i] === peakD.value ? 'var(--accent)' : 'var(--border)') + ';"></div></div>'
          + '<span style="width:64px; text-align:left; font-size:11px; color:var(--muted); font-weight:700;">' + (ins.dowMoney[i] || 0).toLocaleString('en-US') + ' ج</span>'
        + '</div>';
      }).join('')
    + '</div>';

  /* 🎯 فرص العرض — أنفع جدول في الشاشة: راكد **مربوط** بماشي.
     الراكد لوحده معلومة محبطة، والماشي لوحده معلومة معروفة. */
  if(ins.opportunities && ins.opportunities.length){
    html += '<div style="background:var(--panel); border:1.5px solid var(--plus); border-radius:12px; padding:12px 13px; margin-bottom:16px;">'
      + '<div style="font-weight:800; font-size:13px; margin-bottom:3px;">🎯 فرص عرض</div>'
      + '<div style="font-size:11.5px; color:var(--muted); margin-bottom:9px;">صنف بطيء ليه علاقة قوية بصنف ماشي — حطهم جنب بعض وقول للبياعات تعرضهم مع بعض.</div>'
      + ins.opportunities.slice(0, 8).map(function(r){
          return '<div style="padding:7px 0; border-top:1px solid var(--border); font-size:12.5px;">'
            + '<b>' + nm(r.slow) + '</b> <span style="color:var(--muted);">(اتباع ' + r.slowSold + ')</span>'
            + ' ← اعرضه مع <b>' + nm(r.fast) + '</b> <span style="color:var(--muted);">(اتباع ' + r.fastSold + ')</span>'
            + ' <span style="color:var(--plus); font-weight:800;">×' + r.lift + '</span></div>';
        }).join('')
      + '</div>';
  }

  // 💡 قبول الاقتراحات
  const st = m.suggestStats || {};
  const acc = Number(st.accepted) || 0, dis = Number(st.dismissed) || 0;
  if(acc + dis > 0){
    const pct = Math.round((acc / (acc + dis)) * 100);
    html += '<div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:11px 13px; margin-bottom:16px; font-size:12.5px;">'
      + '<b>💡 اقتراحات الكاشير:</b> اتقبل <b>' + acc + '</b> من ' + (acc + dis)
      + ' (<b style="color:' + (pct >= 25 ? 'var(--plus)' : 'var(--warn)') + ';">' + pct + '٪</b>)'
      + (pct < 15 ? ' — نسبة قليلة: يا إما الاقتراحات مش مناسبة يا إما محدش بيبص على الشريط.' : '')
      + '</div>';
  }

  return html;
}
window.basketInsightsHTML = basketInsightsHTML;

/* 📈 عدّاد قبول/رفض الاقتراح — كتابة واحدة صغيرة، صفر قراءات.
   ⚠️ من غير الرقم ده مفيش طريقة نعرف إذا كانت الميزة بتشتغل ولا
      الشريط بقى خلفية بيضا. */
function basketStat(field){
  try{
    const inc = firebase.firestore.FieldValue.increment(1);
    const patch = { suggestStats: {} };
    patch.suggestStats[field] = inc;
    db.collection(TEST_SETTINGS).doc(basketDocId()).set(patch, { merge:true }).catch(function(){});
  }catch(e){}
}
window.basketStat = basketStat;

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
    /* 📊 المعلومات بتتحسب من **نفس** المسحة — تقرير منفصل معناه
       قراءة تانية لنفس الفواتير مقابل صفر معلومة جديدة. */
    m.insights = basketInsights(sales, m, { now: Date.now() });
    /* 📊 معلومات المالك — بتتحسب من **نفس** القراءة دي، صفر قراءة زيادة.
       ⚠️ بتتخزّن جوه نفس المستند: مستند تاني معناه قراءة تانية كل
          فتحة مقابل معلومة كانت في إيدنا أصلًا. */
    try{
      m.insights = insBuild(sales, m, (typeof allInventory !== 'undefined' ? allInventory : []),
                            currentBranch, { now: Date.now() });
    }catch(e){ console.warn('insights', e); }

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


/* 📊 عرض المعلومات — كل رقم معاه **التصرّف** المترتب عليه.
   ⚠️ رقم من غير تصرّف بيتقري مرة وبعدين بيتساب. */
function basketInsightsHTML(ins){
  if(!ins) return '';
  const card = function(title, body){
    return '<div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:12px 14px; margin-bottom:10px;">'
      + '<div style="font-weight:800; font-size:13.5px; margin-bottom:6px;">' + title + '</div>'
      + '<div style="font-size:12.5px; line-height:2; color:var(--muted);">' + body + '</div></div>';
  };
  const money = function(n){ return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-US'); };
  let html = '';

  // ⏰ الذروة
  const p = ins.peak || {};
  if(p.topHour){
    const h = p.topHour.hour;
    const h2 = ((h + 1) % 24);
    html += card('⏰ وقت الذروة',
      'أقوى ساعة: <b style="color:var(--text);">' + h + ':00 – ' + h2 + ':00</b> '
      + '(' + p.topHour.count + ' فاتورة · ' + money(p.topHour.total) + ' ج.م)<br>'
      + (p.topDay ? 'أقوى يوم: <b style="color:var(--text);">' + p.topDay.name + '</b> · ' : '')
      + (p.slowDay ? 'أهدى يوم: <b style="color:var(--text);">' + p.slowDay.name + '</b>' : '')
      + '<br><span style="opacity:.85;">👉 خلي أقوى بياعة في الساعة دي، والجرد والتنضيف في اليوم الهادي.</span>');
  }

  // 🧾 المتوسطات
  const a = ins.avg || {};
  if(a.invoices){
    html += card('🧾 متوسط الفاتورة',
      '<b style="color:var(--text);">' + money(a.avgTotal) + ' ج.م</b> · '
      + '<b style="color:var(--text);">' + a.avgPieces + '</b> قطعة في الفاتورة<br>'
      + 'الفواتير المربوطة بعميلة: <b style="color:var(--text);">' + a.custRate + '٪</b>'
      + '<br><span style="opacity:.85;">👉 النسبة دي سقف الولاء والإشعارات كلها — '
      + (a.custRate < 50 ? 'نصّ عملائك مجهولين، وأي عرض بيوصل لنصهم بس.' : 'كويسة — كمّل عليها.')
      + '</span>');
  }

  // 💡 فرص العرض
  const ops = ins.opportunities || [];
  if(ops.length){
    html += card('💡 فرص عرض — راكد بيتشري مع ماشي',
      ops.slice(0, 6).map(function(r){
        return '• <b style="color:var(--text);">' + reqEscSafe(r.slowName) + '</b> '
          + '(واقف ' + r.stock + ' قطعة) بيتاخد مع <b style="color:var(--text);">' + reqEscSafe(r.fastName) + '</b>';
      }).join('<br>')
      + '<br><span style="opacity:.85;">👉 حطهم جنب بعض، والكاشير تعرض الراكد مع الماشي.</span>');
  }

  return html;
}
window.basketInsightsHTML = basketInsightsHTML;

function reqEscSafe(x){
  return (typeof reqEsc === 'function') ? reqEsc(x) : String(x == null ? '' : x);
}
