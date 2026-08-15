/* ============================================================
   💬 wa-compose.js — ابعت للعميلة على واتساب (أسعار · خصم · وصل جديد)
   ------------------------------------------------------------
   الفكرة: المالك عايز يبعت "بمزاجه" — منتج جه، خصم، مكافأة —
   من غير ما يقعد يكتب الأسعار بإيده ويغلط فيها.

   🔴 تلات قواعد الملف ده مبني عليها:

   ١) **مفيش إرسال آلي.** الملف بيفتح واتساب برسالة جاهزة، والمالك
      هو اللي بيدوس «إرسال». الإرسال الآلي محتاج WhatsApp Business
      API وقوالب معتمدة من Meta وتكلفة لكل رسالة — ده اشتراك مش كود.

   ٢) **الأسعار من المخزون الحي، مش بالإيد.** أكبر خطر في الميزة دي
      إنك تبعت سعر قديم وتلتزم بيه قدام العميلة. السعر بيتقري من
      `allInventory` لحظة الكتابة، ولو الصنف **مش موجود في فرعك**
      بيظهر تحذير أحمر قبل ما تبعت — وعد بحاجة مش عندك أوحش من
      إنك ما بعتّش أصلًا.

   ٣) **الرسالة تتعدّل قبل ما تتبعت.** القوالب بتملا الصندوق وبس.
      "بمزاجي" معناها إن آخر كلمة للمالك مش للقالب.

   ⚠️ **الخصم اللي بتكتبه هنا مجرد نص** — النظام مش عارف عنه حاجة،
      والكاشير في الفرع مش هتلاقي أي أثر ليه. لو عايز خصم **حقيقي**
      بيتطبّق على الفاتورة لوحده، ده نظام المكافآت (`openRewardModal`)
      وفيه زرار هنا بيوديك له. البانر جوه الشاشة بيقول ده صراحةً.

   ⚠️ معزول عن مسار البيع: كله جوه try — لو أي حاجة هنا وقعت، البيع
      شغال عادي (نفس قاعدة chat.js).
   ============================================================ */
'use strict';

var WA_MAX = 900;              // حد عملي للرسالة — واتساب بيقبل أكتر بس الطويل مبيتقراش
var WAC = { phone:'', name:'', picked:[], kind:'new' };

/* 🏷️ القوالب. النص ده **بداية** مش نهاية — بيتكتب في صندوق قابل للتعديل.
   🔴 مفيش قالب "أسعار": المالك مش بيبعت أسعار على واتساب (قرار). */
var WA_KINDS = {
  new:    { icon:'🆕', label:'وصل جديد',
            head: function(n){ return (n ? 'أهلًا ' + n + ' 🌸\n' : 'أهلًا 🌸\n')
              + 'وصلنا حاجات جديدة افتكرناكي معاها:'; },
            tail: 'موجودين في {branch} — تحبي نحجزلك؟' },
  back:   { icon:'🔖', label:'طلبك وصل',
            head: function(n){ return (n ? 'أهلًا ' + n + ' 🌸\n' : 'أهلًا 🌸\n')
              + 'الحاجة اللي كنتي بتدوّري عليها وصلت:'; },
            tail: 'موجودة في {branch} — تحبي نحجزهالك؟' },
  sale:   { icon:'💸', label:'خصم',
            head: function(n){ return (n ? 'أهلًا ' + n + ' 🌸\n' : 'أهلًا 🌸\n')
              + 'عندنا عرض خاص ليكي:'; },
            tail: 'العرض لحد {days} — استني إيه؟ 🌸' },
  reward: { icon:'🎁', label:'مكافأة',
            head: function(n){ return (n ? 'مبروك ' + n + ' 🎁\n' : 'مبروك 🎁\n')
              + 'بعتنالك مكافأة على التطبيق:'; },
            tail: 'هتتخصم لوحدها من فاتورتك الجاية 🌸' },
  free:   { icon:'✍️', label:'حر', head: function(){ return ''; }, tail:'' }
};

function waDigits(s){ return String(s || '').replace(/[^0-9]/g, ''); }

/* 📞 رقم واتساب مصري: 01xxxxxxxxx → 201xxxxxxxxx
   ⚠️ الصفر البادئ لازم يتشال — wa.me بيرفض الرقم بيه بصمت
      (بيفتح واتساب على شاشة "الرقم غير صحيح"). */
function waPhoneIntl(phone){
  var d = waDigits(phone);
  if(d.indexOf('20') === 0 && d.length >= 12) return d;    // متكتب دولي خلاص
  if(d.indexOf('0') === 0) d = d.slice(1);
  return '20' + d;
}
function waPhoneValid(phone){
  var d = waDigits(phone);
  if(d.indexOf('20') === 0) d = d.slice(2);
  if(d.indexOf('0') === 0) d = d.slice(1);
  return /^1[0125][0-9]{8}$/.test(d);      // موبايل مصري
}

/* 💰 سعر الصنف ومخزونه في الفرع الحالي — من المصدر الحي */
function waItemInfo(p){
  var qty = 0;
  try{ qty = Number((p.qtyByBranch || {})[currentBranch]) || 0; }catch(e){}
  return { name: p.name || '', price: Number(p.price) || 0, qty: qty,
           barcode: p.barcode || '', id: p.id };
}

/* 🧾 بناء نص الرسالة من الاختيارات
   ------------------------------------------------------------
   🔴 **الرسالة مفيهاش أسعار — قرار المالك.** الأصناف بتتكتب بأسماءها
      وبس. الأسعار بتفضل ظاهرة في **شاشة الاختيار** عشان المالك يقرر
      وهو شايفها، لكنها عمرها ما بتخرج للعميلة.
      السبب: رسالة "الطرحة اللي كنتي عايزاها وصلت" لطيفة — نفس الرسالة
      ومعاها سعر بتبقى إعلان. والسعر بيتقال في المحل.
   ⚠️ الخصم بقى **سطر مذكور** مش حساب سعر: "خصم 25%" من غير ما نكتب
      كان بكام وبقى بكام. أول ما ترجع تكتب الرقمين، رجعت للأسعار.
   ⚠️ دالة نقية عشان تتختبر بالـharness — مفيش DOM جواها.
   ============================================================ */
function waBuildMessage(o){
  o = o || {};
  var kind = WA_KINDS[o.kind] || WA_KINDS.free;
  var lines = [];
  // ⚠️ الاسم الأول بس: الاسم الكامل في رسالة زي دي بيبان زي قاعدة
  //    بيانات مش زي محل بيكلم عميلته (نفس سبب بلوك نقط الفاتورة).
  var first = String(o.name || '').trim().split(/\s+/)[0] || '';
  var head = kind.head(first);
  if(head) lines.push(head);
  (o.items || []).forEach(function(it){
    lines.push('• ' + it.name);          // 🔴 الاسم وبس — مفيش سعر
  });
  // 💸 الخصم على نوع «خصم» بس، ومذكور كنسبة/مبلغ من غير أسعار
  if(o.kind === 'sale'){
    var off = Number(o.discount) || 0;
    if(off > 0){
      lines.push(o.discountType === 'pct'
        ? ('خصم ' + waNum(off) + '% ' + ((o.items || []).length ? 'على اللي فوق' : 'على المحل'))
        : ('خصم ' + waNum(off) + ' ج.م ' + ((o.items || []).length ? 'على اللي فوق' : 'على فاتورتك')));
    }
  }
  if(o.note) lines.push(o.note);
  var tail = kind.tail
    .replace('{branch}', o.branch || '')
    .replace('{days}', o.days || 'آخر الأسبوع');
  if(tail && (o.items || []).length) lines.push(tail);
  return lines.join('\n').trim();
}

/* 🔒 حارس الأسعار — بيتنادى قبل الإرسال
   ------------------------------------------------------------
   ⚠️ ليه حارس زيادة على إن الباني أصلًا مش بيكتب أسعار: الرسالة
      **قابلة للتعديل** (وده المقصود)، والأصناف اتسمّت بإيد المالك في
      المخزون. لو اسم صنف نفسه فيه سعر ("طرحة 250")، أو المالك كتب
      رقم بالغلط، الرسالة بتخرج بسعر.
   ⚠️ الحارس **مبيمنعش الإرسال** — بيحذّر وبس. المالك ممكن يكون قاصد
      يكتب رقم (مقاس، تاريخ، رقم تليفون). منعه كان هيبقى وصاية.
   بيرجّع نص السبب أو null. */
function waPriceWarning(msg){
  var t = String(msg || '');
  if(/ج\.?م|جنيه|EGP/i.test(t)) return 'فيه عملة في الرسالة';
  // رقم من 3 خانات أو أكتر، أو رقم بكسور — الشكل الغالب للسعر.
  // ⚠️ بنستثني الأرقام الملزوقة بـ% (خصم 25%) والأرقام القصيرة.
  var m = t.match(/(?:^|[^\d%])(\d{3,}(?:\.\d+)?)(?!\s*%)/);
  if(m) return 'فيه رقم شكله سعر (' + m[1] + ')';
  return null;
}
function waNum(n){
  n = Number(n) || 0;
  return (Math.round(n * 100) / 100).toLocaleString('en-US');
}

/* ============================================================
   الشاشة
   ============================================================ */
function openWaCompose(phone, name){
  try{
    WAC.phone = String(phone || '');
    WAC.name = String(name || '');
    WAC.picked = [];
    WAC.kind = 'new';
    if(!WAC.name && WAC.phone){
      // الاسم من قايمة العملاء لو متحمّلة — الاسم الأول بس في الرسالة
      try{
        var c = (window.custListData || []).filter(function(x){ return x.phone === WAC.phone; })[0];
        if(c) WAC.name = c.name || '';
      }catch(e){}
    }
    waRenderModal();
  }catch(e){ console.warn('wa compose', e); showToast('تعذر فتح الشاشة', 'err'); }
}
if(typeof window !== 'undefined') window.openWaCompose = openWaCompose;

function waRenderModal(){
  var old = document.getElementById('waComposeOverlay');
  if(old) old.remove();
  var ov = document.createElement('div');
  ov.id = 'waComposeOverlay';
  ov.style.cssText = 'position:fixed; inset:0; z-index:12800; background:rgba(0,0,0,.8);'
    + 'display:flex; align-items:center; justify-content:center; padding:14px;';
  ov.innerHTML =
    '<div style="background:var(--panel); border:2px solid var(--border); border-radius:16px;'
    + ' padding:15px 14px; max-width:540px; width:100%; max-height:90vh; overflow-y:auto; color:var(--text);">'
    + '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px;">'
    +   '<div style="font-weight:900; font-size:16px;">💬 ابعت واتساب</div>'
    +   '<button onclick="waClose()" style="background:none; border:none; color:var(--muted); font-size:22px; cursor:pointer;">✕</button>'
    + '</div>'
    // 📞 المستلمة
    + '<div style="display:flex; gap:7px; margin-bottom:9px;">'
    +   '<input id="waName" placeholder="الاسم (اختياري)" value="' + reqEsc(WAC.name) + '" oninput="waSet(\'name\', this.value)"'
    +     ' style="flex:1; padding:10px; border-radius:9px; border:1.5px solid var(--border); background:var(--panel2); color:var(--text); font-size:13px;">'
    +   '<input id="waPhone" inputmode="numeric" placeholder="01xxxxxxxxx" value="' + reqEsc(WAC.phone) + '" oninput="waSet(\'phone\', this.value)"'
    +     ' style="flex:1; padding:10px; border-radius:9px; border:1.5px solid var(--border); background:var(--panel2); color:var(--text); font-size:13px; direction:ltr; text-align:left;">'
    + '</div>'
    // 🏷️ النوع
    + '<div id="waKinds" style="display:flex; gap:5px; flex-wrap:wrap; margin-bottom:9px;"></div>'
    // ⚠️ بانر الخصم الحقيقي
    + '<div id="waRewardNote" style="display:none; border:1.5px solid var(--warn); border-radius:10px;'
    +   ' padding:8px 10px; margin-bottom:9px; font-size:11.5px; line-height:1.6;">'
    +   '⚠️ <b>الخصم اللي بتكتبه هنا نص وبس</b> — النظام مش عارف عنه حاجة،'
    +   ' والكاشير مش هتلاقي أي أثر ليه.<br>'
    +   '<button onclick="waOpenReward()" style="margin-top:6px; padding:7px 12px; border-radius:8px; border:none;'
    +     ' background:var(--warn); color:#3a2600; font-weight:800; font-size:11.5px; cursor:pointer;">'
    +     '🎁 ابعت مكافأة حقيقية بدل كده</button>'
    + '</div>'
    // 🔍 اختيار الأصناف
    + '<div style="position:relative; margin-bottom:7px;">'
    +   '<input id="waSearch" placeholder="🔍 دوّر على صنف بالاسم أو الباركود..." autocomplete="off" oninput="waSearchItems(this.value)"'
    +     ' style="width:100%; padding:11px; border-radius:9px; border:1.5px solid var(--accent); background:var(--panel2); color:var(--text); font-size:13.5px; box-sizing:border-box;">'
    +   '<div id="waSuggest" style="position:absolute; top:calc(100% + 3px); left:0; right:0; background:var(--panel);'
    +     ' border:1px solid var(--border); border-radius:9px; max-height:210px; overflow-y:auto; z-index:30; display:none;"></div>'
    + '</div>'
    + '<div id="waPicked" style="margin-bottom:9px;"></div>'
    // 💸 الخصم
    + '<div id="waDiscountRow" style="display:none; gap:7px; margin-bottom:9px; align-items:center;">'
    +   '<input id="waDiscount" inputmode="decimal" placeholder="قيمة الخصم" oninput="waPreview()"'
    +     ' style="flex:1; padding:10px; border-radius:9px; border:1.5px solid var(--border); background:var(--panel2); color:var(--text); font-size:13px;">'
    +   '<select id="waDiscountType" onchange="waPreview()" style="padding:10px; border-radius:9px; border:1.5px solid var(--border); background:var(--panel2); color:var(--text); font-size:13px; font-weight:700;">'
    +     '<option value="pct">%</option><option value="amount">ج.م</option></select>'
    + '</div>'
    // ✍️ الرسالة النهائية
    + '<div style="font-size:11.5px; font-weight:800; margin-bottom:4px;">✍️ الرسالة (عدّل فيها زي ما تحب)</div>'
    + '<textarea id="waText" rows="7" maxlength="' + WA_MAX + '" oninput="waCount()"'
    +   ' style="width:100%; padding:11px; border-radius:10px; border:1.5px solid var(--border);'
    +   ' background:var(--panel2); color:var(--text); font-size:13px; font-family:Cairo, sans-serif;'
    +   ' line-height:1.7; resize:vertical; box-sizing:border-box;"></textarea>'
    + '<div id="waCounter" style="font-size:10.5px; color:var(--muted); text-align:left; margin:3px 0 9px;"></div>'
    + '<div id="waWarn" style="margin-bottom:9px;"></div>'
    + '<button onclick="waSend()" style="width:100%; padding:14px; border-radius:12px; border:none;'
    +   ' background:#25d366; color:#fff; font-weight:900; font-size:15px; cursor:pointer; font-family:Cairo, sans-serif;">'
    +   '💬 افتح واتساب</button>'
    + '<div style="font-size:10.5px; color:var(--muted); text-align:center; margin-top:7px;">'
    +   'واتساب هيفتح بالرسالة جاهزة — <b>إنت</b> اللي بتدوس إرسال</div>'
    + '</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target === ov) waClose(); });
  waRenderKinds();
  waPreview();
}

function waClose(){
  var o = document.getElementById('waComposeOverlay');
  if(o) o.remove();
}
if(typeof window !== 'undefined') window.waClose = waClose;

function waSet(k, v){ WAC[k] = v; if(k === 'name') waPreview(); else waCheckPhone(); }
if(typeof window !== 'undefined') window.waSet = waSet;

function waRenderKinds(){
  var box = document.getElementById('waKinds');
  if(!box) return;
  box.innerHTML = Object.keys(WA_KINDS).map(function(k){
    var on = WAC.kind === k;
    return '<button onclick="waPickKind(\'' + k + '\')" style="padding:8px 12px; border-radius:99px;'
      + ' border:1.5px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';'
      + ' background:' + (on ? 'var(--accent)' : 'var(--panel2)') + ';'
      + ' color:' + (on ? '#fff' : 'var(--text)') + '; font-weight:800; font-size:12px;'
      + ' cursor:pointer; font-family:Cairo, sans-serif;">'
      + WA_KINDS[k].icon + ' ' + WA_KINDS[k].label + '</button>';
  }).join('');
}

function waPickKind(k){
  WAC.kind = k;
  waRenderKinds();
  var dr = document.getElementById('waDiscountRow');
  if(dr) dr.style.display = (k === 'sale') ? 'flex' : 'none';
  var rn = document.getElementById('waRewardNote');
  // ⚠️ البانر بيظهر على «خصم» و«مكافأة»: الاتنين بيوعدوا بفلوس،
  //    والاتنين نص لو مااتعملوش من نظام المكافآت.
  if(rn) rn.style.display = (k === 'sale' || k === 'reward') ? 'block' : 'none';
  waPreview();
}
if(typeof window !== 'undefined') window.waPickKind = waPickKind;

/* 🔍 البحث في المخزون */
function waSearchItems(q){
  var box = document.getElementById('waSuggest');
  if(!box) return;
  q = String(q || '').trim().toLowerCase();
  if(q.length < 2){ box.style.display = 'none'; box.innerHTML = ''; return; }
  var inv = [];
  try{ inv = allInventory || []; }catch(e){ inv = []; }
  var hits = inv.filter(function(p){
    return String(p.name || '').toLowerCase().indexOf(q) >= 0
        || String(p.barcode || '').toLowerCase().indexOf(q) >= 0;
  }).slice(0, 25);
  if(!hits.length){
    box.innerHTML = '<div style="padding:11px; color:var(--muted); font-size:12px;">مفيش صنف بالاسم ده</div>';
    box.style.display = 'block';
    return;
  }
  box.innerHTML = hits.map(function(p){
    var i = waItemInfo(p);
    // ⚠️ المخزون بيبان في الاختيار نفسه — عشان ما تبعتش سعر حاجة مش عندك
    var stock = i.qty > 0
      ? '<span style="color:var(--plus); font-weight:800;">' + i.qty + ' في فرعك</span>'
      : '<span style="color:var(--minus); font-weight:800;">⚠️ مش في فرعك</span>';
    return '<div onclick="waAddItem(\'' + reqEsc(String(p.id)) + '\')" style="padding:9px 11px; cursor:pointer;'
      + ' border-bottom:1px solid var(--border); display:flex; justify-content:space-between; gap:8px; align-items:center;">'
      + '<div style="min-width:0;"><div style="font-size:12.5px; font-weight:700;">' + reqEsc(i.name) + '</div>'
      + '<div style="font-size:10.5px; color:var(--muted);">' + stock + '</div></div>'
      + '<div style="font-weight:900; font-size:13px; color:var(--plus); flex-shrink:0;">' + waNum(i.price) + '</div>'
      + '</div>';
  }).join('');
  box.style.display = 'block';
}
if(typeof window !== 'undefined') window.waSearchItems = waSearchItems;

function waAddItem(id){
  try{
    var p = (allInventory || []).filter(function(x){ return String(x.id) === String(id); })[0];
    if(!p) return;
    if(WAC.picked.some(function(x){ return String(x.id) === String(id); })){
      showToast('الصنف ده مضاف خلاص'); return;
    }
    WAC.picked.push(waItemInfo(p));
    var s = document.getElementById('waSearch'); if(s) s.value = '';
    var b = document.getElementById('waSuggest'); if(b){ b.style.display = 'none'; b.innerHTML = ''; }
    waPreview();
  }catch(e){ console.warn('wa add', e); }
}
if(typeof window !== 'undefined') window.waAddItem = waAddItem;

function waRemoveItem(id){
  // ⚠️ splice مش filter+إعادة تعيين — إعادة التعيين مبتوصلش لمراجع
  //    المستوى الأعلى (درس متكرر §18).
  for(var i = WAC.picked.length - 1; i >= 0; i--){
    if(String(WAC.picked[i].id) === String(id)) WAC.picked.splice(i, 1);
  }
  waPreview();
}
if(typeof window !== 'undefined') window.waRemoveItem = waRemoveItem;

/* 🔄 إعادة بناء النص + التحذيرات */
function waPreview(){
  var picked = document.getElementById('waPicked');
  if(picked){
    picked.innerHTML = WAC.picked.length ? WAC.picked.map(function(i){
      var warn = i.qty > 0 ? '' : ' <span style="color:var(--minus); font-weight:800;">⚠️ مش في فرعك</span>';
      return '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px;'
        + ' padding:7px 9px; border:1px solid var(--border); border-radius:9px; margin-bottom:5px;">'
        + '<div style="min-width:0; font-size:12.5px; font-weight:700;">' + reqEsc(i.name) + warn + '</div>'
        + '<div style="display:flex; gap:7px; align-items:center; flex-shrink:0;">'
        +   '<span style="font-weight:900; color:var(--plus);">' + waNum(i.price) + '</span>'
        +   '<button onclick="waRemoveItem(\'' + reqEsc(String(i.id)) + '\')" style="background:none; border:none;'
        +     ' color:var(--minus); font-size:16px; cursor:pointer;">✕</button>'
        + '</div></div>';
    }).join('') : '';
  }
  var txt = document.getElementById('waText');
  if(txt){
    var dEl = document.getElementById('waDiscount');
    var tEl = document.getElementById('waDiscountType');
    txt.value = waBuildMessage({
      kind: WAC.kind, name: String(WAC.name || '').trim().split(/\s+/)[0] || '',
      items: WAC.picked,
      discount: (WAC.kind === 'sale' && dEl) ? dEl.value : 0,
      discountType: tEl ? tEl.value : 'pct',
      branch: (typeof currentBranch !== 'undefined' ? currentBranch : '')
    });
  }
  waCount();
  waCheckPhone();
}
if(typeof window !== 'undefined') window.waPreview = waPreview;

function waCount(){
  var t = document.getElementById('waText');
  var c = document.getElementById('waCounter');
  if(t && c) c.textContent = t.value.length + ' / ' + WA_MAX;
  // 🔒 تحذير الأسعار بيتحدّث مع كل حرف — التعديل اليدوي هو أرجح
  //    طريق يدخل بيها سعر للرسالة.
  try{ waCheckPhone(); }catch(e){}
}
if(typeof window !== 'undefined') window.waCount = waCount;

function waCheckPhone(){
  var box = document.getElementById('waWarn');
  if(!box) return;
  var out = [];
  if(!waPhoneValid(WAC.phone))
    out.push('<div style="border:1.5px solid var(--minus); border-radius:9px; padding:8px 10px;'
      + ' font-size:11.5px; font-weight:700; color:var(--minus);">⚠️ الرقم مش شكل موبايل مصري صحيح</div>');
  var noStock = WAC.picked.filter(function(i){ return i.qty <= 0; });
  if(noStock.length)
    out.push('<div style="border:1.5px solid var(--warn); border-radius:9px; padding:8px 10px;'
      + ' font-size:11.5px; font-weight:700; margin-top:5px;">⚠️ فيه ' + noStock.length
      + ' صنف مش موجود في فرعك — لو قلتي إنه وصل وجت تاخده مش هتلاقيه</div>');
  // 🔒 تحذير الأسعار — بيقرا **النص النهائي** بعد أي تعديل يدوي
  try{
    var t = document.getElementById('waText');
    var w = waPriceWarning(t ? t.value : '');
    if(w)
      out.push('<div style="border:1.5px solid var(--warn); border-radius:9px; padding:8px 10px;'
        + ' font-size:11.5px; font-weight:700; margin-top:5px;">💰 ' + reqEsc(w)
        + ' — إنت مش بتبعت أسعار عادةً. لو مقصود كمّل عادي.</div>');
  }catch(e){}
  box.innerHTML = out.join('');
}

/* 🎁 المكافأة الحقيقية — بنسيبه لنظام المكافآت الموجود */
function waOpenReward(){
  if(!waPhoneValid(WAC.phone)){ showToast('اكتب رقم صحيح الأول', 'err'); return; }
  if(typeof openRewardModal !== 'function'){ showToast('نظام المكافآت مش متاح هنا', 'err'); return; }
  waClose();
  openRewardModal(waDigits(WAC.phone).replace(/^20/, '0'));
}
if(typeof window !== 'undefined') window.waOpenReward = waOpenReward;

/* 📤 فتح واتساب */
function waSend(){
  var t = document.getElementById('waText');
  var msg = t ? String(t.value || '').trim() : '';
  if(!msg){ showToast('الرسالة فاضية', 'err'); return; }
  if(!waPhoneValid(WAC.phone)){ showToast('الرقم مش صحيح', 'err'); return; }
  try{
    // 🕵️ نسجّل إن رسالة اتجهّزت — مين وإمتى ولمين وبكام صنف.
    //    ⚠️ **مش بنسجّل نص الرسالة**: ممكن يكون فيه كلام شخصي، والسجل
    //       بيتقري من Office. اللي يهم إن فيه أثر لوعد اتوعد للعميلة.
    if(typeof _logActivity === 'function'){
      _logActivity('wa_message', {
        phone: waDigits(WAC.phone),
        kind: WAC.kind,
        itemCount: WAC.picked.length,
        items: WAC.picked.map(function(i){ return { name:i.name, price:i.price, qty:i.qty }; }).slice(0, 10)
      });
    }
  }catch(e){ console.warn('wa log', e); }
  var url = 'https://wa.me/' + waPhoneIntl(WAC.phone) + '?text=' + encodeURIComponent(msg);
  window.open(url, '_blank');
  waClose();
  showToast('واتساب اتفتح — دوس إرسال 💬');
}
if(typeof window !== 'undefined') window.waSend = waSend;

/* §18 — التعريض على window إجباري */
if(typeof window !== 'undefined') window.waBuildMessage = waBuildMessage;
if(typeof window !== 'undefined') window.waPhoneIntl = waPhoneIntl;
if(typeof window !== 'undefined') window.waPhoneValid = waPhoneValid;
if(typeof window !== 'undefined') window.waItemInfo = waItemInfo;
if(typeof window !== 'undefined') window.waPriceWarning = waPriceWarning;
if(typeof window !== 'undefined') window.WA_KINDS = WA_KINDS;

if(typeof module !== 'undefined' && module.exports){
  module.exports = { waBuildMessage, waPhoneIntl, waPhoneValid, waNum, waPriceWarning, WA_KINDS };
}
