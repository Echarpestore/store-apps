/* ============================================================
   💳 credit-ui.js — شاشات الرصيد وكروت الهدايا في POS
   ------------------------------------------------------------
   ⚠️ الملف ده **مبيحسبش فلوس ومبيكتبش رصيد**. كل عملية بتروح
      لـCloud Function، والفنكشن هي اللي بتقرر. الشاشة بتعرض بس.
      لو أي حساب فلوس ظهر هنا، يبقى فيه نسختين من الحقيقة.

   ⚠️ **أونلاين إجباري.** POS بيشتغل أوفلاين عادي، بس الرصيد لأ:
      لو الشيك محلي، نفس الرصيد يتصرف في الرحاب ومدينتي في نفس
      اللحظة والاتنين ينجحوا. الرسالة بتقول ده للكاشير بوضوح.
   ============================================================ */

// 🔑 مفتاح تكرار: نفس العملية = نفس المفتاح مهما اتكرر الضغط.
//    ⚠️ مش عشوائي بالكامل — مبني على محتوى العملية، عشان لو
//       الشبكة قطعت وضغطت تاني يبقى **نفس** المفتاح فترجع نفس
//       النتيجة بدل ما تتنفذ مرتين.
function creditIdem(kind, parts){
  return kind + ':' + [].concat(parts || []).join(':');
}

let _creditBusy = false;
async function callCredit(name, payload){
  if(_creditBusy){ showToast('استنى العملية اللي شغالة تخلص', 'err'); return null; }
  if(!navigator.onLine){
    // 🔴 مفيش fallback أوفلاين هنا **عن قصد** — الأوفلاين هو
    //    بالظبط اللي بيخلي نفس الرصيد يتصرف مرتين.
    showToast('الرصيد محتاج نت — العملية دي مبتشتغلش أوفلاين', 'err');
    return null;
  }
  _creditBusy = true;
  try{
    const fn = firebase.app().functions('us-central1').httpsCallable(name);
    /* 🏷️ الفرع الحالي بيتبعت مع **كل** نداء — السيرفر بيحدد منه البراند
       (`credit` ولا `credit_glow`). مكان واحد بدل ما كل نداء يفتكر يبعته،
       ونداء ينسى = رصيد Glow يتصرف من echarpe بصمت. */
    const _pl = Object.assign({}, payload || {});
    if(!_pl.branch){ try{ _pl.branch = (window.currentBranch || currentBranch) || ''; }catch(e){} }
    const res = await fn(_pl);
    return res.data;
  }catch(e){
    // رسائل الفنكشن بالعربي خلاص — بنعرضها زي ما هي
    showToast(e && e.message ? e.message : 'العملية فشلت', 'err');
    return null;
  }finally{ _creditBusy = false; }
}

/* نفس `callCredit` بس بيرجّع الخطأ بدل ما يبلعه — للمسارات اللي لازم **تقرر** حسب نوع الفشل.
   مفيش توست هنا، واللي بينادي هو اللي يقول للكاشير. مبيتأثرش بقفل `_creditBusy` (بيستنى دوره). */
async function callCreditEx(name, payload){
  if(!navigator.onLine) return { ok:false, code:'offline', message:'مفيش نت' };
  for(let i = 0; _creditBusy && i < 40; i++) await new Promise(function(r){ setTimeout(r, 250); });   // لحد 10 ثواني
  _creditBusy = true;
  try{
    const fn = firebase.app().functions('us-central1').httpsCallable(name);
    const _pl = Object.assign({}, payload || {});
    if(!_pl.branch){ try{ _pl.branch = (window.currentBranch || currentBranch) || ''; }catch(e){} }
    const res = await fn(_pl);
    return { ok:true, data: res.data };
  }catch(e){
    return { ok:false, code: String((e && e.code) || '').replace(/^functions\//, ''), message: (e && e.message) || 'العملية فشلت' };
  }finally{ _creditBusy = false; }
}
window.callCreditEx = callCreditEx;

/* ============================================================
   🎁 بيع كارت هدية
   ------------------------------------------------------------
   الكارت بيتصدر **مقفول** دلوقتي، وبيتفعّل لما الفاتورة تتقفل.
   ⚠️ الترتيب ده مش تفصيلة: لو فعّلناه دلوقتي والعميلة مشيت من
      غير ما تدفع، يبقى طلعنا فلوس من العدم.
   ============================================================ */
let pendingGiftCards = [];      // كروت الفاتورة الحالية (لسه مقفولة)

async function sellGiftCard(){
  if(!navigator.onLine){ showToast('بيع الكروت محتاج نت', 'err'); return; }
  const v = await askText({
    title:'🎁 كارت هدية',
    message:'اكتبي قيمة الكارت بالجنيه.\n\nالعميلة هتدفعها عادي مع الفاتورة،\nوالكارت هيتطبع بكود تديه لأي حد.',
    type:'number', placeholder:'500'
  });
  if(v === null) return;
  const value = Math.round((Number(v) || 0) * 100) / 100;
  if(!(value > 0)){ showToast('المبلغ غلط', 'err'); return; }

  /* 👤 ربط الكارت برقم العميلة (لو موجود على الفاتورة).
     ⚠️ الربط **مش ملكية**: الكارت بيتصرف بالكود، وأي حد معاه
        يقدر يستخدمه. الرقم هنا عشان الكارت يظهر في «كروتي» عندها
        بقيمته وحالته — تعرف إنها اشترته ولحد فين اتصرف.
     ⚠️ والكود **مش بيتخزّن ولا بيظهر في التطبيق**: إحنا مخزّنين
        بصمته بس. عرضه في تطبيق دخوله مجهول معناه إن أي حد يعرف
        رقم موبايل يسحب كودات كروته. */
  const _buyer = ((document.getElementById('customerPhone') || {}).value || '').trim();
  const idem = creditIdem('issue', [currentBranch, value, Date.now()]);
  const r = await callCredit('giftCardIssue', {
    value: value, branch: currentBranch, idem: idem,
    buyerPhone: _buyer || null
  });
  if(!r) return;

  // 💵 الكارت بيدخل السلة كسطر عادي بقيمته — العميلة بتدفعه
  //    زي أي حاجة. وبيتعلّم `isGiftCard` عشان التقارير تفرّقه
  //    عن البضاعة (بيع كارت **مش إيراد** — ده دين لحد ما يتصرف).
  cart.push({
    id: '__gift_card__' + r.cardId,
    name: '🎁 كارت هدية ' + value + ' ج.م',
    price: value, qty: 1, isGiftCard: true, giftCardId: r.cardId
  });
  pendingGiftCards.push({ cardId: r.cardId, code: r.code, display: r.display, value: value });
  renderCart();
  showToast('الكارت اتضاف للفاتورة — هيتفعّل بعد الدفع ✅');
}
window.sellGiftCard = sellGiftCard;

/* ✅ تفعيل كروت الفاتورة — بيتنادى بعد ما الفاتورة تتقفل بنجاح */
async function activatePendingGiftCards(invoiceCode){
  if(!pendingGiftCards.length) return [];
  const done = [];
  for(const g of pendingGiftCards){
    const r = await callCredit('giftCardActivate', {
      cardId: g.cardId, invoiceCode: invoiceCode
    });
    if(r && r.ok) done.push(g);
    else {
      // ⚠️ الفاتورة اتقفلت والفلوس دخلت، بس الكارت مااتفعّلش.
      //    مبنسكتش: الكاشير لازم تعرف عشان تعيد المحاولة من
      //    سجل الكروت، وإلا العميلة دفعت وماخدتش حاجة.
      showToast('⚠️ الكارت ' + g.display + ' مااتفعّلش — فعّليه من سجل الكروت', 'err');
    }
  }
  pendingGiftCards = [];
  return done;
}
window.activatePendingGiftCards = activatePendingGiftCards;

/* ============================================================
   💸 صرف رصيد على الفاتورة
   ============================================================ */
let pendingCreditSpend = null;   // { phone, amount }
// §18 القاعدة الذهبية — الملفات منفصلة، فـ`let` مبتعديش بينهم.
//    من غير السطر ده الزرار في pos-sale.js بيقرا undefined دايمًا.
Object.defineProperty(window, 'pendingCreditSpend', {
  get(){ return pendingCreditSpend; }, set(v){ pendingCreditSpend = v; }
});

async function useCustomerCredit(){
  const phone = (document.getElementById('customerPhone') || {value:''}).value.trim();
  if(!phone){ showToast('اكتبي رقم العميلة الأول', 'err'); return; }
  if(pendingCreditSpend){ showToast('فيه رصيد متطبّق خلاص على الفاتورة دي', 'err'); return; }

  const total = cartTotal();
  if(!(total > 0)){ showToast('مفيش فاتورة تتخصم منها', 'err'); return; }

  const bal = Number(window.custCreditBalance) || 0;
  if(bal <= 0){ showToast('العميلة دي مالهاش رصيد', 'err'); return; }

  // 🛡️ السقف: الأقل من الرصيد وقيمة الفاتورة.
  //    من غيره الإجمالي يبقى سالب والفاتورة تتحوّل "مرتجع"
  //    يطلّع كاش — نفس ثغرة النقط §4أ٧ بالظبط.
  const max = Math.min(bal, total);
  const ok = await askConfirm({
    title:'💳 استخدام الرصيد',
    message:'رصيد العميلة: ' + bal.toFixed(2) + ' ج.م\n'
      + 'الفاتورة: ' + total.toFixed(2) + ' ج.م\n\n'
      + 'هيتخصم ' + max.toFixed(2) + ' ج.م من رصيدها.',
    okText:'اخصمي ' + max.toFixed(2)
  });
  if(!ok) return;

  // 🛑 v720 — **فحص السيرفر قبل ما الخصم يتحط على الفاتورة.**
  //    بلاغ المالك 21-09: «دفعت بالرصيد عادي، الفاتورة اتعملت، والرصيد متخصمش». السبب في التصميم: الخصم الحقيقي بيحصل
  //    **بعد** حفظ الفاتورة — فلو دالة `creditSpend` مرفوضة (نسخة قديمة منشورة · الجهاز مش داخل بحساب موظف · الكود إجباري
  //    وPOS فاكره لأ) الفاتورة بتتقفل بالخصم والرصيد يفضل زي ما هو، ومفيش غير توست بيختفي. والعميلة تصرف نفس الرصيد كل يوم.
  //    دلوقتي: بنسأل السيرفر الأول. **مش قادر يرد = مفيش خصم رصيد على الفاتورة دي.** والسيرفر هو اللي بيقول الكود إجباري ولا لأ.
  const _pf = await creditPreflight();
  if(!_pf.ok){
    try{ if(typeof _logActivity === 'function') _logActivity('credit_spend_blocked', { phone: phone, amount: max, code: _pf.code || '', message: _pf.message || '' }); }catch(e){}
    await askConfirm({ icon:'🛑', danger:true, waitSec:0, title:'مينفعش نستخدم الرصيد دلوقتي',
      message:'خدمة الرصيد على السيرفر رفضت أو مش بترد:<br><b>' + esc(_pf.message || _pf.code || 'خطأ غير معروف') + '</b><br><br>'
        + 'لو كمّلنا، الفاتورة هتتقفل بالخصم و**الرصيد مش هيتخصم** من حساب العميلة.<br>حصّلي المبلغ بطريقة تانية وبلّغي المالك.',
      okText:'فهمت', cancelText:'قفل' });
    return;
  }
  let _approvalId = null;
  if(_pf.required){
    const ap = await creditOtpFlow(phone, max);
    if(!ap) return;                              // اتلغى / معندهاش التطبيق / الكود غلط 3 مرات
    _approvalId = ap.approvalId;
    if(Math.abs(cartTotal() - total) > 0.005 || cart.some(l => l.isCreditSpend)){   // السلة اتغيّرت والعميلة بتكتب الكود
      showToast('الفاتورة اتغيّرت — دوسي «استخدمي الرصيد» تاني', 'err'); return;
    }
  }

  cart.push({
    id: '__credit_spend__',
    name: '💳 خصم من الرصيد',
    price: -max, qty: 1, isReturn: false, isRedemption: true, isCreditSpend: true
  });
  pendingCreditSpend = { phone: phone, amount: max, approvalId: _approvalId };
  renderCart();
  showToast('اتخصم ' + max.toFixed(2) + ' ج.م من الرصيد ✅');
}
window.useCustomerCredit = useCustomerCredit;

/* ============================================================
   🔐 v718 — كود تأكيد صرف الرصيد (جهة الكاشير)
   ------------------------------------------------------------
   الثغرة: «استخدمي الرصيد» كانت بتخصم رصيد **أي** عميلة من غير علمها. دلوقتي (لما المالك يفعّل الإعداد):
     1) السيرفر يعمل كود ويوصّله لتطبيق العميلة (إشعار + جوّه التطبيق). **الكود مبيرجعش لـPOS أبدًا.**
     2) التابلت يقلب على «اكتبي الكود» — العميلة تكتبه **بنفسها**.
     3) POS يمرّره للسيرفر يتأكد، وياخد `approvalId` لمرة واحدة ← وبعدين بس الخصم يتحط على الفاتورة.
   قرار المالك: اللي معندهاش التطبيق **متصرفش** ← رسالة + دعوة تحميل التطبيق على التابلت.
   الإدخال اليدوي للكود هنا = فولباك لو التابلت واقع (الكود لسه جاي من موبايلها هي).
   الفرض الحقيقي على **السيرفر** (`credit_cfg.otpRequired`) — الملف ده واجهة بس.
   ============================================================ */
/* هل السيرفر جاهز يخصم؟ وهل الكود إجباري؟ — إجابة واحدة من `creditSpend` نفسها (`otp_status` بيعدّي على `requireStaff`،
   فنجاحه = الدالة منشورة + الجهاز داخل بحساب موظف مقبول).
   سيرفر **قديم** (قبل v718) ميعرفش `action` ← بيرفض بـ`invalid-argument` (رقم ناقص) **بعد** ما عدّى فحص الموظف ← ده معناه
   «شغّال بس قديم»: نكمّل من غير كود زي الأول. أي رفض تاني (صلاحية · مش منشورة · خطأ داخلي · نت) = **نوقف**. */
async function creditPreflight(){
  const r = await callCreditEx('creditSpend', { action:'otp_status' });
  if(r.ok) return { ok:true, required: !!(r.data && r.data.required) };
  if(r.code === 'invalid-argument') return { ok:true, required:false, oldServer:true };
  return { ok:false, code: r.code, message: r.message };
}
window.creditPreflight = creditPreflight;

let _otpCfgCache = { at: 0, required: false };
async function creditOtpRequired(){
  if(Date.now() - _otpCfgCache.at < 60000) return _otpCfgCache.required;
  try{
    const d = await db.collection(TEST_SETTINGS).doc('credit_cfg').get();
    _otpCfgCache = { at: Date.now(), required: !!(d.exists && (d.data() || {}).otpRequired === true) };
  }catch(e){ /* القراءة فشلت: نمشي على آخر قيمة — والسيرفر هيرفض لو الكود إجباري */ }
  return _otpCfgCache.required;
}
window.creditOtpRequired = creditOtpRequired;

function _otpCapRef(){ return db.collection('pos_capture').doc(currentBranch); }

function creditOtpFlow(phone, amount){
  return new Promise(async function(resolve){
    const req = await callCredit('creditSpend', { action:'otp_request', phone: phone, amount: amount });
    if(!req){ resolve(null); return; }
    if(req.ok === false && req.reason === 'no_app'){
      // قرار المالك (ب): من غير التطبيق مفيش صرف — ونعرض عليها التحميل على التابلت
      try{ _otpCapRef().set({ mode:'greet', greetName:'', isNew:false, invite:true, ts:Date.now(), askId:'inv_' + Date.now() }).catch(function(){}); }catch(e){}
      try{ if(typeof _logActivity === 'function') _logActivity('credit_otp_no_app', { phone: phone, amount: amount }); }catch(e){}
      await askConfirm({ icon:'📲', title:'العميلة لازم تنزّل التطبيق',
        message:'استخدام الرصيد بقى بكود بيوصل على تطبيق العميلة.<br>شاشة التحميل ظهرت على التابلت — تنزّله وتدخل برقمها، وبعدين دوسي «استخدمي الرصيد» تاني.',
        okText:'تمام', cancelText:'قفل', waitSec:0 });
      resolve(null); return;
    }
    if(!req.ok){ resolve(null); return; }

    const askId = 'otp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    let done = false, unsub = null, tick = null, busy = false;
    window._capOtpBusy = true;
    const old = document.getElementById('otpWaitOverlay'); if(old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'otpWaitOverlay';
    ov.style.cssText = 'position:fixed; inset:0; z-index:13600; background:rgba(8,12,24,.72); display:flex; align-items:center; justify-content:center; padding:20px; direction:rtl; font-family:Tajawal,Arial,sans-serif;';
    ov.innerHTML = '<div style="background:#fff; color:#111827; border-radius:20px; max-width:440px; width:100%; padding:22px; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,.35);">'
      + '<div style="font-size:40px; margin-bottom:6px;">🔐</div>'
      + '<div style="font-size:19px; font-weight:900; margin-bottom:6px;">مستنيين العميلة تكتب الكود على التابلت</div>'
      + '<div style="font-size:13px; line-height:1.8; color:#4b5563; margin-bottom:12px;">الكود وصلها على التطبيق (إشعار + جوّه التطبيق).<br>المبلغ: <b>' + Number(amount).toFixed(2) + ' ج.م</b> · <span id="otpLeft">3:00</span></div>'
      + '<div id="otpMsg" style="min-height:22px; font-size:13px; font-weight:800; color:#b91c1c; margin-bottom:8px;"></div>'
      + '<div style="display:flex; gap:8px; margin-bottom:10px;"><input id="otpManual" inputmode="numeric" maxlength="4" placeholder="أو اكتبي الكود هنا لو التابلت واقع" style="flex:1; padding:12px; border-radius:12px; border:1.5px solid #d1d5db; font-size:15px; text-align:center; font-family:inherit;">'
      + '<button type="button" id="otpManualBtn" style="padding:12px 16px; border:none; border-radius:12px; background:#111827; color:#fff; font-weight:900; cursor:pointer;">تأكيد</button></div>'
      + '<button type="button" id="otpCancelBtn" style="width:100%; padding:12px; border:1.5px solid #d1d5db; border-radius:12px; background:#f9fafb; font-weight:800; cursor:pointer;">إلغاء</button></div>';
    document.body.appendChild(ov);
    const msg = ov.querySelector('#otpMsg');

    function finish(result, capMode, extra){
      if(done) return; done = true;
      try{ if(unsub) unsub(); }catch(e){}
      clearInterval(tick); window._capOtpBusy = false;
      try{ _otpCapRef().set(Object.assign({ mode: capMode || 'idle', ts: Date.now(), askId: askId }, extra || {})).catch(function(){}); }catch(e){}
      try{ ov.remove(); }catch(e){}
      try{ if(typeof reclaimWindowFocus === 'function') reclaimWindowFocus(300); }catch(e){}
      resolve(result);
    }
    async function tryCode(code){
      if(done || busy) return;
      code = String(code || '').replace(/\D/g, '');
      if(code.length !== 4){ msg.textContent = 'الكود 4 أرقام'; return; }
      busy = true; msg.style.color = '#374151'; msg.textContent = 'بنتأكد…';
      const r = await callCredit('creditSpend', { action:'otp_verify', phone: phone, code: code });
      busy = false;
      if(done) return;
      if(r && r.ok){
        try{ if(typeof _logActivity === 'function') _logActivity('credit_otp_ok', { phone: phone, amount: amount }); }catch(e){}
        finish({ approvalId: r.approvalId }, 'otp_ok'); return;
      }
      const reason = (r && r.reason) || 'error';
      if(reason === 'wrong'){
        msg.style.color = '#b91c1c'; msg.textContent = 'الكود غلط — فاضل ' + r.left + ' محاولة';
        _otpCapRef().set({ mode:'otp', ts: Date.now(), askId: askId, amount: amount, err:'wrong', left: r.left }).catch(function(){});
        return;
      }
      try{ if(typeof _logActivity === 'function') _logActivity('credit_otp_failed', { phone: phone, amount: amount, reason: reason }); }catch(e){}
      showToast(reason === 'locked' ? '⛔ الكود اتقفل بعد 3 محاولات غلط — اطلبي كود جديد'
              : reason === 'expired' ? '⏱️ الكود انتهى — اطلبي كود جديد' : 'تعذّر التأكد من الكود', 'err');
      finish(null, 'otp_fail', { reason: reason });
    }

    ov.querySelector('#otpCancelBtn').onclick = function(){ finish(null, 'idle'); };
    ov.querySelector('#otpManualBtn').onclick = function(){ tryCode(ov.querySelector('#otpManual').value); };
    ov.querySelector('#otpManual').addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); tryCode(this.value); } });

    const expAt = Number(req.expAt) || (Date.now() + 180000);
    tick = setInterval(function(){
      const left = Math.max(0, Math.round((expAt - Date.now()) / 1000));
      const el = ov.querySelector('#otpLeft'); if(el) el.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
      if(left <= 0){ showToast('⏱️ الكود انتهى — اطلبي كود جديد', 'err'); finish(null, 'otp_fail', { reason:'expired' }); }
    }, 1000);

    try{
      await _otpCapRef().set({ mode:'otp', ts: Date.now(), askId: askId, amount: amount, left: 3 });
      unsub = _otpCapRef().onSnapshot(function(d){
        const x = d.exists ? d.data() : null;
        if(!x || x.askId !== askId) return;
        if(x.mode === 'otp_code' && x.code) tryCode(x.code);
        else if(x.mode === 'idle' && x.by === 'kiosk') finish(null, 'idle');       // العميلة داست «إلغاء» على التابلت
      }, function(e){ console.warn('otp listen', e && e.code); });
    }catch(e){ msg.textContent = 'التابلت مش متصل — اكتبي الكود هنا'; }
  });
}
window.creditOtpFlow = creditOtpFlow;

/* ✅ تثبيت الخصم — بعد ما الفاتورة تتقفل
   ⚠️ الترتيب مقصود: الخصم بيتثبّت **بعد** الفاتورة. لو ثبّتناه
      قبلها والفاتورة فشلت، الرصيد اتخصم والعميلة ماخدتش حاجة. */
async function commitCreditSpend(invoiceCode, invoiceTotal, savedItems, savedPayments){
  if(!pendingCreditSpend) return null;
  const p = pendingCreditSpend;
  pendingCreditSpend = null;
  // 🛡️ v724 — الفاتورة المحفوظة **لازم يكون فيها سطر الخصم بنفس المبلغ**. غير كده الخصم ده بتاع سلة اتمسحت — مبيتخصمش.
  //    (المالك 21-09: كتب الكود، مسح الفاتورة، وباع فاتورة تانية عادي — الرصيد اتخصم عليها وجاله إشعار «اتسحب».)
  if(Array.isArray(savedItems)){
    // 🔴 v727: فاتورة الرصيد في مسار الدفع (tender-pos) **مفيهاش سطر** — السطر بيتحوّل لـ`payments.credit` لحظة الحفظ.
    //    الفحص القديم كان بيدوّر على السطر بس ← كل فاتورة برصيد اتعلّمت «يتيمة» واتلغى خصمها (3 فواتير المالك 22-09).
    const inSale = savedItems.some(function(l){ return l && l.isCreditSpend && Math.abs(Math.abs(Number(l.price) || 0) * (Number(l.qty) || 1) - p.amount) < 0.01; })
                || (savedPayments && Math.abs((Number(savedPayments.credit) || 0) - p.amount) < 0.01);
    if(!inSale){
      try{ if(typeof _logActivity === 'function') _logActivity('credit_spend_orphan_dropped', { phone: p.phone, amount: p.amount, invoiceCode: invoiceCode }); }catch(e){}
      return null;
    }
  }                      // الفاتورة اتقفلت — السطر ده مبقاش «معلّق» على السلة
  const payload = {
    phone: p.phone, amount: p.amount,
    invoiceTotal: Math.abs(Number(invoiceTotal) || 0) + p.amount,
    invoiceCode: invoiceCode,
    approvalId: p.approvalId || null,            // 🔐 v718: موافقة العميلة — السيرفر بيستهلكها جوّه معاملة الخصم
    idem: creditIdem('spend', [invoiceCode, p.phone, p.amount])
  };
  // 🔁 v720: 3 محاولات (نفس `idem` ← السيرفر مبيخصمش مرتين). نت وقع لحظة = ميبقاش خسارة.
  let r = null;
  const waits = [0, 2500, 6000];
  for(let i = 0; i < waits.length; i++){
    if(waits[i]) await new Promise(function(res){ setTimeout(res, waits[i]); });
    r = await callCreditEx('creditSpend', payload);
    if(r.ok){
      try{ setTimeout(function(){ creditRetryRun(); }, 1500); }catch(e){}
      try{ db.collection(TEST_SALES).where('invoiceCode','==', invoiceCode).limit(1).get().then(function(q){ if(!q.empty) q.docs[0].ref.update({ creditSpendCommittedAt: Date.now() }).catch(function(){}); }).catch(function(){}); }catch(e){}
      return r.data;
    }
    if(['permission-denied','invalid-argument','failed-precondition','deadline-exceeded','not-found','unauthenticated'].indexOf(r.code) >= 0) break;   // رفض نهائي — الإعادة مش هتغيّر حاجة
  }
  // ⚠️ الفاتورة اتقفلت بخصم والرصيد مااتخصمش = خسارة على المالك. لازم تسيب **أثر دائم** مش توست بيختفي.
  const fail = { phone: p.phone, amount: p.amount, invoiceCode: invoiceCode, code: (r && r.code) || '', message: (r && r.message) || '', at: Date.now() };
  try{ if(typeof _logActivity === 'function') _logActivity('credit_spend_failed', fail); }catch(e){}
  creditRetryPush(payload, fail);                // 🔁 v722: يتعاد لوحده أول ما الاتصال يرجع
  try{
    const q = await db.collection(TEST_SALES).where('invoiceCode','==', invoiceCode).limit(1).get();
    if(!q.empty) await q.docs[0].ref.update({ creditSpendFailed: fail });
  }catch(e){ console.warn('mark creditSpendFailed', e); }
  try{
    await askConfirm({ icon:'🚨', danger:true, waitSec:3, title:'الرصيد مااتخصمش من حساب العميلة',
      message:'الفاتورة <b>' + esc(invoiceCode || '') + '</b> اتقفلت بخصم <b>' + Number(p.amount).toFixed(2) + ' ج.م</b> من الرصيد — بس السيرفر رفض يخصمه:<br><b>'
        + esc(fail.message || fail.code || 'خطأ') + '</b><br><br>بلّغي المالك دلوقتي. اتسجّلت في نشاط Office.',
      okText:'بلّغت المالك', cancelText:'قفل' });
  }catch(e){ showToast('⚠️⚠️ الرصيد مااتخصمش من حساب العميلة — بلّغ المالك فورًا', 'err'); }
  return null;
}
window.commitCreditSpend = commitCreditSpend;

/* ============================================================
   🔁 v722 — طابور إعادة خصم الرصيد
   ------------------------------------------------------------
   الحالة المؤكدة (كشف حساب المالك 21-09): فاتورة #4471 اتقفلت بـ325 رصيد **ومفيش سطر ليها في الكشف**، والفاتورة اللي
   بعدها بدقايق (#4472) اتخصمت عادي بنفس الكود ونفس السيرفر. يعني فشل **لحظي** (اتصال الجلسة كان معلّق — نفس الجلسة اللي
   قالت «مفيش فاتورة» لحد ما البرنامج اتقفل واتفتح). 3 محاولات في 9 ثواني مش كفاية لجلسة معلّقة.
   فالخصم اللي فشل بيتحفظ على الجهاز ويتعاد: عند فتح البرنامج · لما النت يرجع · بعد كل خصم ناجح.
   آمن: نفس `idem` ← السيرفر مبيخصمش مرتين أبدًا. الرفض النهائي (صلاحية/موافقة انتهت) بيقف ويفضل متسجّل للمالك.
   ============================================================ */
const CREDIT_RETRY_KEY = 'pos_credit_retry_v1';
const CREDIT_RETRY_FINAL = ['permission-denied','invalid-argument','failed-precondition','deadline-exceeded','not-found','unauthenticated'];
function creditRetryLoad(){ try{ const a = JSON.parse(localStorage.getItem(CREDIT_RETRY_KEY) || '[]'); return Array.isArray(a) ? a : []; }catch(e){ return []; } }
function creditRetrySave(list){ try{ localStorage.setItem(CREDIT_RETRY_KEY, JSON.stringify((list || []).slice(-30))); }catch(e){} }
function creditRetryPush(payload, fail, fnName){
  if(!payload || !payload.idem) return;
  payload = Object.assign({}, payload, { _fn: fnName || 'creditSpend' });
  if(CREDIT_RETRY_FINAL.indexOf(String(fail && fail.code)) >= 0) return;      // رفض نهائي — الإعادة مش هتغيّر حاجة
  const list = creditRetryLoad().filter(function(x){ return x && x.payload && x.payload.idem !== payload.idem; });
  list.push({ payload: payload, at: Date.now(), tries: 0 });
  creditRetrySave(list);
}
let _creditRetryRunning = false;
async function creditRetryRun(){
  if(_creditRetryRunning) return 0;
  let list = creditRetryLoad();
  if(!list.length || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 0;
  _creditRetryRunning = true;
  let recovered = 0;
  try{
    const WEEK = 7 * 24 * 3600 * 1000;
    for(const it of list.slice()){
      if(!it || !it.payload || Date.now() - (it.at || 0) > WEEK){ list = list.filter(function(x){ return x !== it; }); continue; }
      const _fn = it.payload._fn || 'creditSpend'; const _pl = Object.assign({}, it.payload); delete _pl._fn;
      const r = await callCreditEx(_fn, _pl);
      if(r.ok){
        recovered++;
        list = list.filter(function(x){ return x !== it; });
        try{ if(typeof _logActivity === 'function') _logActivity(_fn === 'creditAdjust' ? 'credit_refund_recovered' : 'credit_spend_recovered', { phone: it.payload.phone, amount: it.payload.amount, invoiceCode: it.payload.invoiceCode, afterMin: Math.round((Date.now() - it.at) / 60000) }); }catch(e){}
        try{
          const q = await db.collection(TEST_SALES).where('invoiceCode','==', it.payload.invoiceCode).limit(1).get();
          if(!q.empty) await q.docs[0].ref.update({ creditSpendFailed: null, creditSpendRecoveredAt: Date.now() });
        }catch(e){}
      } else if(CREDIT_RETRY_FINAL.indexOf(r.code) >= 0){
        list = list.filter(function(x){ return x !== it; });                   // هيفضل متسجّل `credit_spend_failed` — قرار المالك
      } else { it.tries = (it.tries || 0) + 1; }
      creditRetrySave(list);
    }
    creditRetrySave(list);                        // لو كل اللي اتشال عناصر قديمة (continue) — الحفظ جوّه اللفة مكانش بيتنادى
    if(recovered) showToast('✅ اتخصم رصيد ' + recovered + ' فاتورة كانت معلّقة', 'ok');
  }catch(e){ console.warn('credit retry', e); }
  finally{ _creditRetryRunning = false; }
  return recovered;
}
window.creditRetryRun = creditRetryRun;

/* ============================================================
   🩹 v726 — استرجاع الخصومات اللي ضاعت بسبب باج v724/v725 (`sale.items` مش متعرّف)
   فواتير الفرع آخر 4 أيام فيها سطر `isCreditSpend` ومتعلّمش `creditSpendCommittedAt` ← نبعت الخصم بنفس `idem` بالظبط
   اللي كان المفروض يتبعت ← السيرفر: اتخصم قبل كده = `repeat` (مفيش خصم تاني أبدًا) · لو لأ = يتخصم دلوقتي. آمن يتعاد.
   ============================================================ */
async function creditRecoverMissing(days){
  const out = { checked:0, recovered:0, already:0, failed:[] };
  try{
    const br = window.currentBranch || currentBranch; if(!br) return out;
    const since = new Date(Date.now() - (days || 4) * 86400000);
    let snap;
    try{ snap = await db.collection(TEST_SALES).where('branch','==', br).where('createdAt','>=', since).get(); }
    catch(e){ console.warn('credit recover query', e && e.code); return out; }
    for(const d of snap.docs){
      const s = d.data() || {};
      if(s.creditSpendCommittedAt || s.isReversal || s.reversed || !s.customerPhone || !s.invoiceCode) continue;
      const line = (s.items || []).find(function(l){ return l && l.isCreditSpend; });
      const payCredit = Math.abs(Number(s.payments && s.payments.credit) || 0);
      if(!line && !(payCredit > 0)) continue;                       // v727: مسار الدفع = payments.credit من غير سطر
      const amount = Math.round((line ? Math.abs((Number(line.price) || 0) * (Number(line.qty) || 1)) : payCredit) * 100) / 100;
      if(!(amount > 0)) continue;
      out.checked++;
      const payload = { phone: String(s.customerPhone), amount: amount, invoiceTotal: Math.abs(Number(s.total) || 0) + amount,
                        invoiceCode: s.invoiceCode, approvalId: null, idem: creditIdem('spend', [s.invoiceCode, String(s.customerPhone), amount]) };
      const r = await callCreditEx('creditSpend', payload);
      if(r.ok){
        if(r.data && r.data.repeat) out.already++; else out.recovered++;
        try{ await d.ref.update({ creditSpendCommittedAt: Date.now(), creditSpendFailed: null }); }catch(e){}
      } else out.failed.push(s.invoiceCode + ': ' + (r.message || r.code));
    }
    if(out.recovered){ try{ if(typeof _logActivity === 'function') _logActivity('credit_spend_recovered', { bulk:true, recovered: out.recovered, invoices: out.checked }); }catch(e){} }
    if(out.failed.length){ try{ if(typeof _logActivity === 'function') _logActivity('credit_spend_failed', { bulk:true, list: out.failed.slice(0, 10).join(' | ') }); }catch(e){} }
    if(out.recovered || out.failed.length) showToast('💰 استرجاع الرصيد: اتخصم ' + out.recovered + ' فاتورة كانت ناقصة' + (out.failed.length ? ' · ' + out.failed.length + ' فشلوا (Office)' : ''), out.failed.length ? 'warn' : 'ok');
  }catch(e){ console.warn('credit recover', e); }
  console.log('creditRecoverMissing', out);
  return out;
}
window.creditRecoverMissing = creditRecoverMissing;
try{ setTimeout(function(){ creditRecoverMissing(4); }, 30000); }catch(e){} window.creditRetryPush = creditRetryPush; window.creditRetryLoad = creditRetryLoad;
try{
  setTimeout(function(){ creditRetryRun(); }, 20000);                        // بعد ما الجهاز يدخل بحسابه
  window.addEventListener('online', function(){ setTimeout(function(){ creditRetryRun(); }, 3000); });
}catch(e){}


/* ============================================================
   🎁 استلام كارت هدية **من الكاشير**
   ------------------------------------------------------------
   🔴 الفجوة اللي المالك وقع فيها: الكارت بيتباع من POS، والاستلام
      كان في **تطبيق العميلة بس**. الكاشير تمسح الكود في شريط
      البحث فتلاقي «لا يوجد صنف بهذا الكود» — والكارت اللي إحنا
      بايعينه مالوش أي مسار في نفس البرنامج اللي باعه.
   ⚠️ الرصيد بيروح **لحساب العميلة** مش للفاتورة: الكارت رصيد
      مش خصم. لو اتحسب خصم على الفاتورة، الباقي بيضيع.
   ⚠️ والدالة السحابية هي اللي بتتحقق وبتخصم — العميل ما بيكتبش
      رصيد أبدًا (نفس قاعدة `credit`).
   ============================================================ */
async function claimGiftForCustomer(code){
  if(!navigator.onLine){ showToast('استلام الكارت محتاج نت', 'err'); return; }
  const phone = ((document.getElementById('customerPhone') || {}).value || '').trim();
  if(!phone){ showToast('اكتبي رقم العميلة الأول', 'err'); return; }
  const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if(clean.length < 8){ showToast('الكود ناقص', 'err'); return; }

  const r = await callCredit('giftCardClaim', {
    code: clean, phone: phone,
    idem: creditIdem('claim', [clean, phone])
  });
  if(!r) return;
  const val = Number(r.value || r.amount || 0);
  showToast('🎉 اتضاف ' + val.toFixed(2) + ' ج.م لرصيد العميلة', 'ok');
  /* 🔄 تحديث بيانات العميلة على الشاشة — الكاشير لازم تشوف الرصيد
     الجديد فورًا عشان تقدر تصرف منه في نفس الفاتورة. */
  try{ if(typeof refreshCustomerInfo === 'function') refreshCustomerInfo(); }catch(e){}
}
window.claimGiftForCustomer = claimGiftForCustomer;

/* ============================================================
   💵 "سيبي الباقي في الحساب"
   ------------------------------------------------------------
   الفلوس **دخلت الدرج فعلًا** مع فاتورة حقيقية، فمش بتخلق فلوس
   من العدم → الكاشير تعملها على طول من غير موافقة المالك.
   ============================================================ */
async function keepChangeAsCredit(changeAmount, invoiceCode, phoneArg){
  // ⚠️ الرقم بيتبعت كوسيط لأن الدالة دي بتتنادى من **شاشة الباقي**،
  //    اللي بتظهر بعد ما الفاتورة تتحفظ والسلة تتفضّى — يعني خانة
  //    الرقم اتمسحت خلاص. القراءة من الشاشة هنا كانت هترجع فاضي
  //    دايمًا والزرار يقول "محتاج رقم العميلة" وهو موجود.
  const phone = String(phoneArg || '').trim()
    || (document.getElementById('customerPhone') || {value:''}).value.trim();
  if(!phone){ showToast('محتاج رقم العميلة عشان نحفظ الباقي', 'err'); return null; }
  const amt = Math.round((Number(changeAmount) || 0) * 100) / 100;
  if(!(amt > 0)) return null;

  const ok = await askConfirm({
    title:'💵 الباقي في الحساب',
    message:'الباقي: ' + amt.toFixed(2) + ' ج.م\n\n'
      + 'هيتحفظ في حساب العميلة بدل ما تاخده كاش.\n'
      + 'تقدر تصرفه في أي فاتورة جاية.',
    okText:'احفظي في الحساب'
  });
  if(!ok) return null;

  return callCredit('creditAdjust', {
    phone: phone, amount: amt, source:'change', invoiceCode: invoiceCode,
    reason:'باقي فاتورة ' + (invoiceCode || ''),
    idem: creditIdem('change', [invoiceCode, phone, amt])
  });
}
window.keepChangeAsCredit = keepChangeAsCredit;

/* ============================================================
   🖨️ قسيمة الكارت
   ⚠️ الكود بيتعرض **مرة واحدة بس** — إحنا مخزّنين بصمته مش هو،
      فمفيش طريقة نطبعه تاني. لازم الكاشير تاخد بالها.
   ============================================================ */
/* 🔡 الكود الخام للباركود — من غير شرط ولا مسافات.
   ⚠️ الشكل المعروض (`GC-XXXX-XXXX`) للعين بس. الماسح بيبعت اللي
      **جوه** الباركود بالظبط، ولو فيه شرط الكاشير هتلاقي كود
      مش متطابق ومفيش سبب واضح. */
function giftBarcodeValue(g){
  return String((g && g.code) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
window.giftBarcodeValue = giftBarcodeValue;

function giftCardSlipHtml(g){
  /* 🏷️ الباركود — الكاشير تمسحه بدل ما تكتب ١٦ حرف بإيدها.
     ⚠️ لو المكتبة مش متحمّلة بيرجع فاضي، والكود المكتوب فوق بيفضل
        هو المسار — الكارت **مايطلعش من غير طريقة استعمال**. */
  var _bc = '';
  try{ if(typeof receiptBarcodeImg === 'function') _bc = receiptBarcodeImg(giftBarcodeValue(g)); }catch(e){}

  return '<div style="font-family:Arial; text-align:center; padding:10px 6px; width:100%;">'
    + '<div style="font-size:15px; font-weight:900;">🎁 كارت هدية</div>'
    + '<div style="font-size:12px; margin-top:2px;">' + (currentBranch || '') + '</div>'
    + '<div style="font-size:26px; font-weight:900; margin:8px 0;">' + g.value + ' ج.م</div>'
    + '<div style="border:2px dashed #000; border-radius:6px; padding:8px 4px; margin:6px 0;">'
    +   '<div style="font-size:10px;">الكود</div>'
    +   '<div dir="ltr" style="font-size:17px; font-weight:900; letter-spacing:1.5px;'
    +     ' font-family:monospace; margin-top:3px;">' + g.display + '</div>'
    +   (_bc ? '<img src="' + _bc + '" alt="" style="width:92%; margin-top:6px; image-rendering:pixelated;">' : '')
    + '</div>'
    + '<div style="font-size:10.5px; line-height:1.7; margin-top:6px;">'
    +   'اكتبي الكود في تطبيقنا عشان يتحوّل رصيد في حسابك،<br>'
    +   'أو قوليه للكاشير وإنتي بتشتري.'
    + '</div>'
    + '<div style="font-size:9.5px; margin-top:6px; border-top:1px dashed #000; padding-top:5px;">'
    +   '⚠️ الكود ده زي الفلوس — أي حد معاه يقدر يستخدمه'
    + '</div></div>';
}
window.giftCardSlipHtml = giftCardSlipHtml;

async function printGiftCardSlips(cards){
  for(const g of (cards || [])){
    try{
      const holder = document.createElement('div');
      holder.innerHTML = giftCardSlipHtml(g);
      if(window.posShell && window.posShell.printReceipt){
        const cfg = (window.shellCfg || {});
        await window.posShell.printReceipt({ printer: cfg.invoicePrinter,
          paperWidth: (window.receiptDesignConfig && receiptDesignConfig.paperWidth) || '80',
          html: holder.outerHTML, openDrawer: null });
      }
    }catch(e){ console.warn('gift slip', e); }
  }
}
window.printGiftCardSlips = printGiftCardSlips;

/* ============================================================
   📤 كارت الهدية للمشاركة — صورة شيك تتبعت واتساب
   ------------------------------------------------------------
   العميلة بتشتري الكارت **لحد تاني**، والقسيمة الحرارية وحشة
   وبتتقطع. الكارت ده صورة ملوّنة فيها اسم البراند والقيمة
   والباركود — تتبعت زي ما هي.
   ⚠️ بتتولّد **على الجهاز** — الكود عمره ما بيتبعت لأي سيرفر
      (نفس قاعدة صورة التجربة في tryon).
   ⚠️ ومتاحة **مرة واحدة وقت البيع بس**: الكود مش متخزّن عندنا
      (بصمته بس)، فمفيش طريقة نولّدها تاني بعد ما الشاشة تتقفل.
      التنبيه ده مكتوب للكاشير صراحةً.
   ============================================================ */
function giftShareCardHtml(g, brand){
  var _bc = '';
  try{ if(typeof receiptBarcodeImg === 'function') _bc = receiptBarcodeImg(giftBarcodeValue(g)); }catch(e){}
  var isGlow = String(brand || '').toLowerCase() === 'glow';
  var bg = isGlow ? '#1a1414' : '#FFF6FA';
  var ink = isGlow ? '#F4E7C3' : '#3A2233';
  var accent = isGlow ? '#E6B450' : '#EC4899';
  var name = isGlow ? 'Glow' : 'echarpe';

  return '<div style="width:600px; box-sizing:border-box; background:' + bg + '; color:' + ink + ';'
    + ' font-family:Tajawal,Arial,sans-serif; text-align:center; padding:34px 28px; border-radius:26px;">'
    + '<div style="font-size:30px; font-weight:900; letter-spacing:1px; color:' + accent + ';">' + name + '</div>'
    + '<div style="font-size:15px; opacity:.75; margin-top:4px;">كارت هدية 🎁</div>'
    + '<div style="font-size:64px; font-weight:900; margin:20px 0 4px;">' + g.value + '</div>'
    + '<div style="font-size:17px; opacity:.8;">جنيه</div>'
    + '<div style="background:#fff; border-radius:16px; padding:14px 10px; margin:22px 0 10px;">'
    +   (_bc ? '<img src="' + _bc + '" alt="" style="width:94%; display:block; margin:0 auto;">'
           : '<div dir="ltr" style="font-family:monospace; font-size:22px; font-weight:900; color:#000;">' + g.display + '</div>')
    + '</div>'
    + '<div dir="ltr" style="font-family:monospace; font-size:16px; font-weight:800; letter-spacing:2px;">' + g.display + '</div>'
    + '<div style="font-size:13px; line-height:1.9; margin-top:18px; opacity:.85;">'
    +   'ورّي الباركود ده للكاشير في أي فرع،<br>أو اكتبي الكود في التطبيق يتحوّل رصيد.'
    + '</div></div>';
}
window.giftShareCardHtml = giftShareCardHtml;

/* 🖼️ التحويل لصورة — بـSVG داخل canvas (مفيش مكتبة خارجية).
   ⚠️ الصور جوه الـSVG لازم تكون base64 وهي كده أصلًا (الباركود
      بيترسم canvas)، وإلا الرسم بيطلع فاضي بصمت. */
async function giftShareCardPng(g, brand){
  const html = giftShareCardHtml(g, brand);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="760">'
    + '<foreignObject width="100%" height="100%">'
    + '<div xmlns="http://www.w3.org/1999/xhtml">' + html + '</div>'
    + '</foreignObject></svg>';
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return await new Promise(function(resolve){
    const img = new Image();
    img.onload = function(){
      const cv = document.createElement('canvas');
      cv.width = 600; cv.height = 760;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cv.width, cv.height);
      cx.drawImage(img, 0, 0);
      cv.toBlob(function(b){ resolve(b); }, 'image/png');
    };
    img.onerror = function(){ resolve(null); };
    img.src = url;
  });
}
window.giftShareCardPng = giftShareCardPng;

/* 📲 المشاركة — Web Share لو متاح، وإلا تنزيل الصورة.
   ⚠️ الفولباك مش رفاهية: Electron والويندوز مفيهمش Web Share،
      ومن غيره الزرار بيدوس ومفيش حاجة بتحصل. */
async function shareGiftCard(cardId){
  const g = (pendingGiftCards || []).find(function(x){ return x.cardId === cardId; })
         || (pendingGiftCards || [])[0];
  if(!g){ showToast('الكارت مش متاح للمشاركة دلوقتي', 'err'); return; }
  const brand = (typeof catalogBrand === 'function') ? catalogBrand() : 'echarpe';
  const blob = await giftShareCardPng(g, brand);
  if(!blob){ showToast('تعذر تجهيز الصورة', 'err'); return; }
  const file = new File([blob], 'gift-card-' + g.value + '.png', { type:'image/png' });
  try{
    if(navigator.canShare && navigator.canShare({ files:[file] })){
      await navigator.share({ files:[file], title:'كارت هدية' });
      return;
    }
  }catch(e){ /* المستخدم قفل الشير — منكملش للتنزيل */ return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name; a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
  showToast('الصورة اتحفظت — ابعتيها واتساب 📲');
}
window.shareGiftCard = shareGiftCard;

/* ============================================================
   📤 عرض المشاركة بعد البيع
   ⚠️ **مرة واحدة وقت البيع**: الكود مش متخزّن عندنا، فبعد ما
      الشاشة تتقفل مفيش طريقة نولّد الكارت تاني — والتنبيه ده
      مكتوب للكاشير في الشاشة نفسها مش في التوثيق.
   ============================================================ */
function offerGiftShare(cards){
  const list = (cards || []).filter(Boolean);
  if(!list.length) return;
  const host = document.createElement('div');
  host.id = 'giftShareBox';
  host.style.cssText = 'position:fixed; inset-inline-end:18px; bottom:18px; z-index:9999;'
    + ' background:var(--panel,#fff); border:1.5px solid var(--accent,#c9a227); border-radius:14px;'
    + ' padding:14px 16px; box-shadow:0 8px 28px rgba(0,0,0,.25); max-width:320px; font-family:inherit;';
  host.innerHTML = '<div style="font-weight:800; font-size:14px; margin-bottom:4px;">🎁 كارت الهدية جاهز</div>'
    + '<div style="font-size:12px; opacity:.8; line-height:1.7; margin-bottom:10px;">'
    +   'ابعتي كارت شيك للعميلة على واتساب.<br><b>⚠️ دلوقتي بس — بعد ما تقفلي مش هيرجع.</b></div>'
    + list.map(function(g){
        return '<button onclick="shareGiftCard(\'' + g.cardId + '\')" '
          + 'style="width:100%; margin-bottom:6px; padding:10px; border:none; border-radius:9px;'
          + ' background:var(--accent,#c9a227); color:#fff; font-weight:800; cursor:pointer;">'
          + '📤 ابعتي كارت ' + g.value + ' ج.م</button>';
      }).join('')
    + '<button onclick="document.getElementById(\'giftShareBox\').remove()" '
    + 'style="width:100%; padding:8px; border:1px solid var(--border,#ccc); border-radius:9px;'
    + ' background:transparent; color:var(--muted,#777); font-size:12px; cursor:pointer;">تمام، قفل</button>';
  const old = document.getElementById('giftShareBox'); if(old) old.remove();
  document.body.appendChild(host);
}
window.offerGiftShare = offerGiftShare;


