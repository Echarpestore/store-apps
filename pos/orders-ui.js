/* ============================================================
   🛍️ orders-ui.js — أوردرات أونلاين في POS
   ------------------------------------------------------------
   ⚠️ المنطق كله في `orders-core.js` المتختبر. الملف ده **عرض
      وكتابة حالة بس** — مفيش حساب فلوس ولا مخزون هنا.

   📌 المصادر التلاتة (قرار المالك — الموقع جاي):
        `app`  = تطبيق إيشارب · `glow` = تطبيق Glow · `web` = echarpe.store
      ⚠️ الاسم «أوردرات أونلاين» مش «أوردرات التطبيق»: الموقع هيبعت
         على **نفس المجموعة**، والشاشة دي هي المستقبِل الوحيد.
      ⚠️ ولأن الموقع فيه زباين **من غير حساب ولاء**، ممنوع أي شيء هنا
         يفترض وجود مستند عميلة: البحث بالكود والتليفون والاسم،
         والتسليم شغال حتى لو الرقم مش مسجّل عندنا.

   🔴 القاعدة اللي الشاشة دي موجودة عشانها:
      **ممنوع ترفع أي واجهة عميلة قبل الشاشة دي.** لو العميلة طلبت
      ومفيش حد شايف الطلب، هي تروح الفرع تلاقي محدش عارف حاجة —
      أوحش من إن الميزة مش موجودة أصلًا.

   🔴 والتسليم **مش مسار حفظ تاني**: الأوردر بيتحمّل في السلة العادية
      وبيتحفظ من نفس دالة البيع (مخزون ونقط وكاش زي أي فاتورة).
      درس فاتورة العكس: أي مسار حفظ موازي بيتعفن بعد شهرين.
   ============================================================ */

const ORD_COL = 'online_orders';

/* 🛡️ تهريب HTML — نفس درس `reqEsc`: اسم خاص بالملف مش `esc` العام،
   والملف بينادي عليه بنفسه مش على دالة موجودة في ملف تاني. */
function ordEsc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
window.ordEsc = ordEsc;

var ORD_SOURCE_BADGE = {
  app:  { t:'📱 التطبيق', c:'#7C3AED' },
  glow: { t:'🖤 Glow',    c:'#111827' },
  web:  { t:'🌐 الموقع',  c:'#0E7490' }
};
function ordSource(o){
  var s = String((o && o.source) || 'app').toLowerCase();
  return ORD_SOURCE_BADGE[s] || ORD_SOURCE_BADGE.app;
}
window.ORD_SOURCE_BADGE = ORD_SOURCE_BADGE;
window.ordSource = ordSource;

let _ordCache = [];
let _ordUnsub = null;
let _ordDelivering = null;   // { id, code } — الأوردر اللي في السلة دلوقتي

/* 📡 المستمع — الأوردرات **المفتوحة بس**.
   ⚠️ فلتر واحد على `status` عن قصد: فلترين تساوي (فرع + حالة) بيحتاجوا
      فهرس مركّب لازم يتعمل بالإيد، ولو اتنسي المستمع بيرمي
      failed-precondition والشاشة تفضل فاضية من غير سبب ظاهر.
      الفرع بيتفلتر محليًا، والمفتوحة عددها صغير بطبيعتها (المتسلّمة
      بتخرج من الاستعلام فورًا) فالقراءات محدودة.
   ⚠️ والمتسلّمة والملغية **مش بتتحمّل خالص** — دي بتتراكم للأبد. */
function startOrdersListener(){
  if(_ordUnsub) return;
  try{
    _ordUnsub = db.collection(ORD_COL)
      .where('status','in',['placed','preparing','ready'])
      .limit(150)
      .onSnapshot(function(s){
        _ordCache = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
        window.onlineOrdersOpen = _ordCache;
        try{ renderOrdersBadge(); }catch(e){ console.warn('ord badge', e); }
        try{ renderOrdersScreen(); }catch(e){ console.warn('ord screen', e); }
      }, function(e){ console.warn('orders sync', e && e.code); _ordUnsub = null; });
  }catch(e){ console.warn('orders listen', e); }
}
window.startOrdersListener = startOrdersListener;

/* 🔴 البادچ — بيعدّ **فرعك** بس.
   ⚠️ نفس درس بادچ الطلبات: بادچ بيعدّ كل الفروع بيخلي الكاشير تفتح
      الشاشة تلاقي مفيش حاجة ليها، وبعد مرتين تبطّل تفتحها خالص. */
function renderOrdersBadge(){
  try{
    var now = Date.now();
    var n = _ordCache.filter(function(o){
      return o.branch === currentBranch && !orderIsExpired(o, now);
    }).length;
    ['navOrdBadge','sideOrdBadge'].forEach(function(id){
      var el = document.getElementById(id);
      if(!el) return;
      el.textContent = n > 99 ? '99+' : String(n);
      el.style.display = n ? 'inline-flex' : 'none';
    });
  }catch(e){ console.warn('ord badge', e); }
}
window.renderOrdersBadge = renderOrdersBadge;

function goToOnlineOrders(){
  showScreen('onlineOrdersScreen');
  startOrdersListener();
  renderOrdersScreen();
}
window.goToOnlineOrders = goToOnlineOrders;

function ordChip(label, n, color){
  return '<span style="display:inline-flex; align-items:center; gap:6px; padding:6px 12px;'
    + ' border-radius:99px; border:1.5px solid ' + color + '; font-size:12.5px; font-weight:800;">'
    + ordEsc(label) + ' <b>' + n + '</b></span>';
}

function ordRows(){
  var now = Date.now();
  var q = ((document.getElementById('ordSearch') || {}).value || '').trim().toLowerCase();
  var scope = (document.getElementById('ordScope') || {}).value || 'mine';
  var rows = _ordCache.slice();
  if(scope === 'mine') rows = rows.filter(function(o){ return o.branch === currentBranch; });
  if(q) rows = rows.filter(function(o){
    return String(o.code || '').indexOf(q) >= 0
        || String(o.phone || '').indexOf(q) >= 0
        || String(o.name || '').toLowerCase().indexOf(q) >= 0;
  });
  /* الجاهز الأول (العميلة واقفة قدامك)، وبعده اللي قرب ينتهي حجزه. */
  var rank = { ready:0, preparing:1, placed:2 };
  rows.sort(function(a,b){
    var ra = rank[orderEffectiveStatus(a, now)], rb = rank[orderEffectiveStatus(b, now)];
    if(ra !== rb) return (ra == null ? 9 : ra) - (rb == null ? 9 : rb);
    return (Number(a.reservedUntil)||0) - (Number(b.reservedUntil)||0);
  });
  return rows;
}

function renderOrdersScreen(){
  var wrap = document.getElementById('ordersScreenWrap');
  if(!wrap) return;
  var now = Date.now();
  var rows = ordRows();

  var sum = document.getElementById('ordSummary');
  if(sum){
    var ready = rows.filter(function(o){ return orderEffectiveStatus(o, now) === 'ready'; }).length;
    var soon  = rows.filter(function(o){ return orderNearExpiry(o, now); }).length;
    sum.innerHTML = ordChip('🛍️ مفتوح', rows.length, 'var(--accent)')
      + ordChip('✅ جاهز للتسليم', ready, ready ? 'var(--plus)' : 'var(--border)')
      + ordChip('⏳ حجزه بيخلص', soon, soon ? 'var(--warn)' : 'var(--border)');
  }

  if(!rows.length){
    wrap.innerHTML = '<div style="padding:30px; text-align:center; color:var(--muted);">'
      + 'مفيش أوردرات مفتوحة 🌸</div>';
    return;
  }

  wrap.innerHTML = rows.map(function(o){
    var st = orderEffectiveStatus(o, now);
    var lab = ORDER_LABEL[st] || ORDER_LABEL.placed;
    var src = ordSource(o);
    var soon = orderNearExpiry(o, now);
    var items = (o.items || []).map(function(it){
      return '<div style="display:flex; justify-content:space-between; gap:10px; font-size:13px; padding:3px 0;">'
        + '<span>' + ordEsc(it.name || 'صنف') + ' × ' + (Number(it.qty)||0) + '</span>'
        + '<span style="font-weight:700;">' + ((Number(it.price)||0) * (Number(it.qty)||0)).toFixed(2) + '</span>'
        + '</div>';
    }).join('');

    /* 💳 طريقة الدفع اللي **هي اختارتها** — بتتعرض بوضوح عشان الكاشير
       متسألهاش تاني. ⚠️ «فيزا» هنا معناها هتدفع بالفيزا **في الفرع**،
       مش إن الفلوس اتدفعت أونلاين. اللبس ده بيخلي الكاشير تسلّم من
       غير ما تاخد فلوس. */
    var payTxt = (o.payMethod === 'visa')
      ? '💳 هتدفع فيزا في الفرع'
      : '💵 هتدفع كاش في الفرع';

    var btns = '';
    if(st === 'placed')    btns += '<button class="btn-newsale" onclick="ordMove(\'' + o.id + '\',\'preparing\')">🎁 بدأنا التجهيز</button>';
    if(st === 'preparing') btns += '<button class="btn-newsale" onclick="ordMove(\'' + o.id + '\',\'ready\')">✅ جاهز</button>';
    if(st === 'ready')     btns += '<button class="btn-newsale" onclick="ordDeliver(\'' + o.id + '\')">🛍️ تسليم — حمّل السلة</button>';
    if(st !== 'expired')   btns += '<button class="logout-btn" onclick="ordCancel(\'' + o.id + '\')">✖️ إلغاء</button>';

    return '<div style="border:1.5px solid ' + (soon ? 'var(--warn)' : 'var(--border)') + '; border-radius:12px;'
      + ' padding:14px; margin-bottom:12px; background:var(--panel2);">'
      + '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px;">'
        + '<b style="font-size:16px;">#' + ordEsc(o.code || '—') + '</b>'
        + '<span style="background:' + src.c + '; color:#fff; border-radius:99px; padding:3px 10px; font-size:11.5px; font-weight:800;">' + src.t + '</span>'
        + '<span style="border:1.5px solid var(--border); border-radius:99px; padding:3px 10px; font-size:11.5px; font-weight:800;">' + lab.icon + ' ' + lab.t + '</span>'
        + '<span style="margin-inline-start:auto; font-size:12px; color:' + (soon ? 'var(--warn)' : 'var(--muted)') + '; font-weight:800;">'
          + ordEsc(orderTimeLeft(o, now)) + '</span>'
      + '</div>'
      + '<div style="font-size:13.5px; margin-bottom:6px;">👤 <b>' + ordEsc(o.name || 'عميلة') + '</b>'
        + ' — <span style="direction:ltr; unicode-bidi:embed;">' + ordEsc(o.phone || '') + '</span>'
        + ' · 🏬 ' + ordEsc(o.branch || '') + '</div>'
      + '<div style="border-top:1px dashed var(--border); padding:6px 0; margin:6px 0;">' + items + '</div>'
      + '<div style="display:flex; justify-content:space-between; font-size:14px; font-weight:900; margin-bottom:10px;">'
        + '<span>' + ordEsc(payTxt) + '</span>'
        + '<span>' + orderTotal(o.items).toFixed(2) + ' ج.م</span>'
      + '</div>'
      + '<div style="display:flex; gap:8px; flex-wrap:wrap;">' + btns + '</div>'
      + '</div>';
  }).join('');
}
window.renderOrdersScreen = renderOrdersScreen;

/* ➡️ تحريك الحالة — **للأمام بس** عن طريق `orderCanMove` المتختبر.
   ⚠️ من غير الجدول ده، دوسة غلط (أو مستند اتعدّل من بره) تقدر ترجّع
      أوردر متسلّم لـ«جاهز» ويتسلّم تاني. */
function ordMove(id, to){
  var o = _ordCache.filter(function(x){ return x.id === id; })[0];
  if(!o){ showToast('الأوردر مش موجود', 'err'); return; }
  var from = orderEffectiveStatus(o, Date.now());
  if(!orderCanMove(from, to)){ showToast('الحركة دي مش مسموحة', 'err'); return; }
  var patch = { status: to };
  if(to === 'preparing'){
    patch.preparedBy = (typeof currentEmployee !== 'undefined' && currentEmployee) ? (currentEmployee.name || '') : '';
    patch.preparedAt = Date.now();
  }
  return db.collection(ORD_COL).doc(id).set(patch, { merge:true })
    .then(function(){ showToast('اتحدّث ✅', 'ok'); })
    .catch(function(e){ showToast('مانفعش: ' + (e && e.code || ''), 'err'); });
}
window.ordMove = ordMove;

function ordCancel(id){
  var o = _ordCache.filter(function(x){ return x.id === id; })[0];
  if(!o) return;
  if(!confirm('إلغاء أوردر #' + (o.code || '') + '؟\nالكمية هترجع للبيع والعميلة هتشوف إنه اتلغى.')) return;
  return db.collection(ORD_COL).doc(id).set({ status:'cancelled', cancelledAt: Date.now() }, { merge:true })
    .then(function(){ showToast('اتلغى', 'ok'); })
    .catch(function(e){ showToast('مانفعش: ' + (e && e.code || ''), 'err'); });
}
window.ordCancel = ordCancel;

/* 🛍️ التسليم — بيحمّل الأوردر في السلة العادية وخلاص.
   ⚠️ الفحص بيتعاد هنا على المخزون **دلوقتي**: بين لحظة الطلب ولحظة
      الاستلام ممكن القطعة تكون اتباعت في المحل. الفحص وقت الطلب
      بيمنع الطلب الغلط، مش بيضمن التسليم.
   ⚠️ الحالة **مبتتحركش لـcollected هنا** — بتتحرك بعد ما الفاتورة
      تتحفظ فعلًا (`ordMarkCollected`). لو اتحركت هنا والكاشير لغت
      البيع، الأوردر يبقى «اتسلّم» والبضاعة في المحل. */
function ordDeliver(id){
  var o = _ordCache.filter(function(x){ return x.id === id; })[0];
  if(!o){ showToast('الأوردر مش موجود', 'err'); return; }
  if(orderIsExpired(o, Date.now())){ showToast('الأوردر انتهى حجزه', 'err'); return; }
  if(o.branch !== currentBranch){
    if(!confirm('الأوردر ده لفرع ' + (o.branch || '؟') + ' مش فرعك.\nتكمّل؟')) return;
  }
  if(cart && cart.length){
    if(!confirm('فيه سلة مفتوحة هتتمسح. تكمّل؟')) return;
  }

  var chk = orderValidateCart(
    (o.items || []).map(function(it){ return { barcode: it.barcode, qty: it.qty }; }),
    (typeof allInventory !== 'undefined' ? allInventory : []),
    o.branch, Date.now()
  );
  if(!chk.ok){
    showToast('⚠️ ' + chk.errors[0], 'err');
    if(!confirm('المخزون اتغيّر:\n\n' + chk.errors.join('\n')
      + '\n\nتحمّل اللي متاح بس وتكمّلي؟')) return;
  }

  cart = [];
  (chk.items.length ? chk.items : (o.items || [])).forEach(function(it){
    var p = (typeof allInventory !== 'undefined' ? allInventory : [])
      .filter(function(x){ return String(x.barcode) === String(it.barcode); })[0];
    cart.push({
      id: p ? p.id : String(it.barcode),
      name: it.name || (p && p.name) || 'صنف',
      barcode: String(it.barcode),
      price: Number(it.price) || 0,
      qty: Math.max(1, Math.floor(Number(it.qty) || 1)),
      attribute: (p && p.attribute) || '', size: (p && p.size) || ''
    });
  });

  var ph = document.getElementById('customerPhone');
  if(ph){ ph.value = o.phone || ''; }
  var ci = document.getElementById('customerInfo');
  if(ci){ ci.textContent = '🛍️ أوردر أونلاين #' + (o.code || '') + ' — ' + (o.name || ''); }
  try{ if(o.phone && typeof refreshCustomerInfo === 'function') refreshCustomerInfo(); }catch(e){}

  _ordDelivering = { id: o.id, code: o.code || '' };
  window._ordDelivering = _ordDelivering;

  try{ renderCart(); }catch(e){}
  showScreen('saleScreen');
  showToast('اتحمّل — ' + (o.payMethod === 'visa' ? 'هتدفع فيزا' : 'هتدفع كاش'), 'ok');
}
window.ordDeliver = ordDeliver;

/* ✅ بعد ما الفاتورة تتحفظ بنجاح — بتتنادى من `pos-sale.js`.
   ⚠️ best-effort: فشلها **ميوقفش** الفاتورة. الفلوس اتاخدت والبضاعة
      اتسلّمت — تعليق حالة أوردر مش سبب لرسالة خطأ للكاشير. */
function ordMarkCollected(invoiceCode){
  if(!_ordDelivering) return;
  var id = _ordDelivering.id;
  _ordDelivering = null; window._ordDelivering = null;
  try{
    db.collection(ORD_COL).doc(id).set({
      status: 'collected',
      collectedAt: Date.now(),
      invoiceCode: invoiceCode || '',
      collectedBy: (typeof currentEmployee !== 'undefined' && currentEmployee) ? (currentEmployee.name || '') : ''
    }, { merge:true }).catch(function(e){ console.warn('ord collect', e && e.code); });
  }catch(e){ console.warn('ord collect', e); }
}
window.ordMarkCollected = ordMarkCollected;

/* 🧹 لو الكاشير سابت البيع من غير حفظ، الأوردر لازم يفضل «جاهز».
   بتتنادى من زرار «إلغاء البيع» لو موجود، وكمان بتتصفّر مع أي تحميل
   أوردر تاني. */
function ordClearDelivering(){ _ordDelivering = null; window._ordDelivering = null; }
window.ordClearDelivering = ordClearDelivering;

if(typeof module !== 'undefined' && module.exports){
  module.exports = { ORD_SOURCE_BADGE, ordSource, ordEsc };
}
