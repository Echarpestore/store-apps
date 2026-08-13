/* ============================================================
   🔖 requests-ui.js — طلبات الزباين في POS
   ------------------------------------------------------------
   ⚠️ الحساب كله في `requests-core.js` المتختبر. الملف ده عرض
      وكتابة بس.

   ⚠️ **ممنوع يعطّل الاستلام.** الاستلام عملية شغل يومية، والتنبيه
      لازم يبقى **بعدها** مش شرط فيها. لو التنبيه وقع أو النت قطع،
      البضاعة تدخل عادي — نفس مبدأ عزل الشات عن مسار البيع.
   ============================================================ */

const REQ_COL = 'customer_requests';
let _reqCache = [];          // الطلبات المفتوحة (للمطابقة السريعة)
let _reqUnsub = null;

/* 📡 مستمع الطلبات المفتوحة
   ⚠️ **المفتوحة بس** — المقفولة بتتراكم للأبد ومالهاش لازمة في
      المطابقة. من غير الشرط ده الاستهلاك بيكبر كل شهر. */
function startRequestsListener(){
  if(_reqUnsub) return;
  try{
    _reqUnsub = db.collection(REQ_COL).where('status','==','open')
      .onSnapshot(function(s){
        _reqCache = s.docs.map(function(d){ return Object.assign({ id:d.id }, d.data()); });
        window.custRequestsOpen = _reqCache;
        try{ renderRequestsTab(); }catch(e){}
      }, function(e){ console.warn('requests sync', e && e.code); });
  }catch(e){ console.warn('requests listen', e); }
}
window.startRequestsListener = startRequestsListener;

/* ➕ تسجيل طلب للعميلة اللي واقفة دلوقتي */
async function addCustomerRequest(){
  const phone = (document.getElementById('customerPhone') || {value:''}).value.trim();
  if(!phone){ showToast('اكتبي رقم العميلة الأول', 'err'); return; }
  const name = (document.getElementById('customerName') || {value:''}).value.trim();

  const text = await askText({
    title:'🔖 طلب خاص',
    message:'العميلة بتدوّر على إيه؟\n\n'
      + 'اكتبي وصف واضح — كل ما الوصف يبقى مميز، المطابقة تبقى أدق.\n'
      + 'مثال: "طرحة بيضا شيفون" أحسن من "طرحة".',
    placeholder:'طرحة بيضا شيفون'
  });
  if(text === null) return;
  const t = String(text).trim();
  if(t.length < 3){ showToast('الوصف قصير قوي', 'err'); return; }

  // ⭐ الكود اختياري — بس لو اتكتب، المطابقة بتبقى **مؤكدة** بدل
  //    اقتراح. فبنسأل عنه، ومبنجبرش عليه.
  const code = await askText({
    title:'🏷️ الكود (اختياري)',
    message:'لو الصنف موجود في النظام بس خلصان، امسحي الباركود أو اكتبي الكود.\n\n'
      + 'كده لما يوصل، النظام هيقولك **بالتأكيد** — مش تخمين.\n'
      + 'سيبيها فاضية لو مش عارفة.',
    placeholder:'اختياري'
  });
  if(code === null) return;

  const kws = (typeof reqKeywords === 'function') ? reqKeywords(t) : [];
  if(!kws.length && !String(code||'').trim()){
    showToast('الوصف كله كلام عام — اكتبي حاجة مميزة (لون/خامة/نوع)', 'err');
    return;
  }

  try{
    await db.collection(REQ_COL).add({
      phone: phone, name: name || '',
      branch: currentBranch,
      barcode: String(code || '').trim() || null,
      text: t,
      textNorm: (typeof reqNormalize === 'function') ? reqNormalize(t) : t,
      keywords: kws,
      status: 'open',
      createdAt: Date.now(),
      by: (currentEmployee && currentEmployee.id) || '',
      byName: (currentEmployee && currentEmployee.name) || ''
    });
    showToast('اتسجّل الطلب ✅ — هنقولك أول ما يوصل');
  }catch(e){ showToast('ماتسجّلش: ' + (e.code || e.message), 'err'); }
}
window.addCustomerRequest = addCustomerRequest;

/* 📦 بعد الاستلام — مين كان طالب حاجة وصلت؟
   ⚠️ بتتنادى **بعد** ما الاستلام يخلص، وجوّه try — الاستلام
      عمره ما يقف عشان التنبيه. */
function checkRequestsAfterReceive(rows){
  try{
    if(typeof reqMatchBatch !== 'function') return;
    const prods = (rows || []).map(function(r){
      const p = (allInventory || []).find(function(x){ return x.id === r.id; });
      return { barcode: (p && p.barcode) || r.barcode || '', name: r.name || (p && p.name) || '' };
    });
    const matches = reqMatchBatch(_reqCache, prods);
    if(!matches.length) return;
    const groups = reqGroupByProduct(matches);
    showRequestMatches(groups);
  }catch(e){ console.warn('request match', e); }
}
window.checkRequestsAfterReceive = checkRequestsAfterReceive;

/* 🔔 شاشة "فيه ناس كانوا طالبين ده"
   ⚠️ **مفيش حجز ولا اختيار آلي** — قرار المالك. الشاشة بتعرض
      العميلات مرتبين بالأقدم ومعاهم زرار واتساب، وهو بيقرر. */
function showRequestMatches(groups){
  const old = document.getElementById('reqMatchOverlay');
  if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'reqMatchOverlay';
  ov.style.cssText = 'position:fixed; inset:0; z-index:12500; background:rgba(0,0,0,.82);'
    + 'display:flex; align-items:center; justify-content:center; padding:16px;';

  const body = groups.map(function(g){
    const sure = g.level === 'exact';
    return '<div style="border:2px solid ' + (sure ? '#22c55e' : '#f59e0b') + ';'
      + ' border-radius:12px; padding:12px; margin-bottom:10px; text-align:right;">'
      + '<div style="font-weight:900; font-size:14px;">'
      +   (sure ? '🟢 ' : '🟡 ') + esc(g.product.name || '')
      +   (sure ? '' : ' <span style="font-size:11px; font-weight:700;">(اقتراح — اتأكد)</span>')
      + '</div>'
      + '<div style="font-size:11.5px; opacity:.75; margin:3px 0 8px;">'
      +   g.count + ' ' + (g.count === 1 ? 'عميلة كانت طالبة' : 'عميلات كانوا طالبين')
      +   ' — الأقدم الأول</div>'
      + g.requests.map(function(r, i){
          const q = r.request;
          const days = q.createdAt ? Math.floor((Date.now() - q.createdAt) / 86400000) : 0;
          return '<div style="display:flex; justify-content:space-between; align-items:center;'
            + ' gap:8px; padding:7px 0; border-top:1px solid rgba(255,255,255,.12);">'
            + '<div style="min-width:0;">'
            +   '<div style="font-size:12.5px; font-weight:700;">'
            +     (i + 1) + '. ' + esc(q.name || q.phone) + '</div>'
            +   '<div style="font-size:11px; opacity:.7;">' + esc(q.text || '')
            +     ' · من ' + days + ' يوم</div>'
            + '</div>'
            + '<div style="display:flex; gap:5px; flex-shrink:0;">'
            +   '<button onclick="reqWhatsApp(\'' + q.id + '\')"'
            +     ' style="padding:7px 10px; border-radius:8px; border:none; background:#25d366;'
            +     ' color:#fff; font-family:Cairo; font-weight:800; font-size:12px;">💬</button>'
            +   '<button onclick="reqSold(\'' + q.id + '\')" title="اتباعت لها"'
            +     ' style="padding:7px 10px; border-radius:8px; border:none;'
            +     ' background:#2563eb; color:#fff; font-family:Cairo; font-weight:800; font-size:12px;">💰</button>'
            +   '<button onclick="reqClose(\'' + q.id + '\')" title="اقفل الطلب"'
            +     ' style="padding:7px 10px; border-radius:8px; border:1px solid #888;'
            +     ' background:transparent; color:#ddd; font-family:Cairo; font-size:12px;">✓</button>'
            + '</div></div>';
        }).join('')
      + '</div>';
  }).join('');

  ov.innerHTML = '<div style="background:var(--panel); border:2px solid var(--border);'
    + ' border-radius:18px; padding:18px 15px; max-width:520px; width:100%;'
    + ' max-height:85vh; overflow-y:auto; color:var(--text);">'
    + '<div style="font-weight:900; font-size:16px; margin-bottom:4px;">🔖 فيه ناس كانوا طالبين ده</div>'
    + '<div style="font-size:11.5px; opacity:.7; margin-bottom:12px;">'
    +   'كلّمهم بنفسك — النظام مش بيبعت ولا بيحجز</div>'
    + body
    + '<button onclick="document.getElementById(\'reqMatchOverlay\').remove()"'
    +   ' style="width:100%; margin-top:6px; padding:13px; border-radius:11px; border:none;'
    +   ' background:var(--panel2); color:var(--text); font-family:Cairo; font-weight:800;">'
    +   'بعدين</button>'
    + '</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
}

/* 💬 واتساب برسالة جاهزة — المالك بيبص ويبعت
   ⚠️ مش إرسال آلي: ده قرار المالك ("يفكرني وأنا أكلمها")، وكمان
      الإرسال الآلي محتاج WhatsApp Business API وقوالب معتمدة. */
function reqWhatsApp(reqId){
  const r = _reqCache.filter(function(x){ return x.id === reqId; })[0];
  if(!r) return;
  const first = String(r.name || '').trim().split(/\s+/)[0] || '';
  const msg = (first ? ('أهلًا ' + first + ' 👋\n') : 'أهلًا 👋\n')
    + 'الحاجة اللي كنتي بتدوّري عليها ("' + (r.text || '') + '") وصلت عندنا في '
    + (r.branch || '') + '.\n'
    + 'لو لسه عايزاها، قوليلنا ونحجزهالك 🌸';
  const phone = String(r.phone || '').replace(/\D/g, '').replace(/^0/, '20');
  window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), '_blank');
}
window.reqWhatsApp = reqWhatsApp;

/* 💰 نسبة الموظفة — الطلب اتحوّل بيعة
   ------------------------------------------------------------
   ⚠️ ليه دي مهمة: لو الموظفة سجّلت الطلب وتعبت في متابعته، وبعدين
      البيعة اتحسبت لموظفة تانية (اللي كانت واقفة يوم ما العميلة
      جت)، الموظفين هيبطّلوا يسجّلوا طلبات خالص — والميزة تموت مش
      لأنها وحشة، لأن محدش مستفيد منها.

   ⚠️ ودي **نسبة مش تحويل**: الموظفة اللي باعت فعلًا بتاخد بيعتها
      زي ما هي. اللي بيتسجّل هنا إن الطلب ده كان سببه — سجل منفصل
      عشان المالك يقرر يكافئ إزاي.
   ⚠️ ومبنكتبش في `sales_points` مباشرة — دي فلوس، والقرار للمالك. */
async function reqCreditSeller(reqId, invoiceCode){
  try{
    const r = _reqCache.filter(function(x){ return x.id === reqId; })[0];
    if(!r || !r.by) return;
    await db.collection('request_attributions').add({
      requestId: reqId,
      requestText: r.text || '',
      phone: r.phone || '',
      // 👤 اللي سجّلت الطلب
      byId: r.by, byName: r.byName || '',
      requestedAt: r.createdAt || 0,
      // 🧾 البيعة اللي اتقفل عليها
      invoiceCode: invoiceCode || '',
      soldBranch: currentBranch,
      soldById: (currentEmployee && currentEmployee.id) || '',
      soldByName: (currentEmployee && currentEmployee.name) || '',
      ts: Date.now()
    });
  }catch(e){ console.warn('req attribution', e); }
}
window.reqCreditSeller = reqCreditSeller;

/* ✓ قفل الطلب */
async function reqClose(reqId, reason){
  try{
    await db.collection(REQ_COL).doc(reqId).set({
      status:'done', closedAt: Date.now(),
      closeReason: reason || 'اتقفل من الاستلام',
      closedBy: (currentEmployee && currentEmployee.name) || ''
    }, { merge: true });
    showToast('اتقفل الطلب ✅');
  }catch(e){ showToast('ماتقفلش: ' + (e.code || e.message), 'err'); }
}
window.reqClose = reqClose;

/* 💰 الطلب اتباع — بيقفل وبيسجّل نسبة الموظفة */
async function reqSold(reqId){
  const inv = await askText({
    title:'💰 الطلب اتباع',
    message:'اكتبي رقم الفاتورة (اختياري) — عشان النسبة تبقى مربوطة ببيعة حقيقية.',
    placeholder:'اختياري'
  });
  if(inv === null) return;
  await reqCreditSeller(reqId, String(inv || '').trim());
  await reqClose(reqId, 'اتباعت');
  showToast('اتسجّلت النسبة للموظفة اللي سجّلت الطلب ✅');
}
window.reqSold = reqSold;

/* 📋 تبويب الطلبات */
function renderRequestsTab(){
  const host = document.getElementById('requestsBody');
  if(!host) return;
  const stale = (typeof reqIsStale === 'function') ? reqIsStale : function(){ return false; };
  const rows = _reqCache.slice().sort(function(a, b){
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  if(!rows.length){
    host.innerHTML = '<div class="empty">مفيش طلبات مفتوحة</div>';
    return;
  }
  host.innerHTML = rows.map(function(r){
    const old = stale(r, Date.now());
    const days = r.createdAt ? Math.floor((Date.now() - r.createdAt) / 86400000) : 0;
    return '<div style="border-bottom:1px solid var(--border); padding:10px 4px;">'
      + '<div style="display:flex; justify-content:space-between; gap:8px;">'
      +   '<div style="min-width:0;">'
      +     '<div style="font-weight:800; font-size:13px;">' + esc(r.text || '') + '</div>'
      +     '<div style="font-size:11.5px; opacity:.72; margin-top:2px;">'
      +       esc(r.name || r.phone) + ' · ' + esc(r.branch || '') + ' · من ' + days + ' يوم'
      +       (r.barcode ? ' · 🏷️ ' + esc(r.barcode) : '')
      +       (old ? ' · <span style="color:var(--warn);">⏳ قديم</span>' : '')
      +     '</div>'
      +   '</div>'
      +   '<div style="display:flex; gap:5px; flex-shrink:0;">'
      +     '<button class="btn" onclick="reqWhatsApp(\'' + r.id + '\')" style="font-size:12px;">💬</button>'
      +     '<button class="btn" onclick="reqClose(\'' + r.id + '\')" style="font-size:12px;">✓</button>'
      +   '</div>'
      + '</div></div>';
  }).join('');
}
window.renderRequestsTab = renderRequestsTab;

/* 🧠 تغذية شريط الفرصة: العميلة اللي واقفة دلوقتي طلبها وصل؟
   ⚠️ بيتحسب **محليًا** من الطلبات المحمّلة — صفر قراءات جديدة. */
function refreshCustRequestHit(phone){
  try{
    window.custRequestHit = null;
    if(!phone || typeof reqMatch !== 'function') return;
    const mine = _reqCache.filter(function(r){ return r.phone === phone; });
    if(!mine.length) return;
    for(const r of mine){
      for(const p of (allInventory || [])){
        // 🟢 المؤكد بس — الاقتراح مينفعش يتقال قدام العميلة
        //    كأنه حقيقة. لو غلط، الكاشير بتتحرج.
        if(reqMatch(r, p).level === 'exact' && (p.qtyByBranch || {})[currentBranch] > 0){
          window.custRequestHit = r.text || '';
          return;
        }
      }
    }
  }catch(e){ console.warn('req hit', e); }
}
window.refreshCustRequestHit = refreshCustRequestHit;
