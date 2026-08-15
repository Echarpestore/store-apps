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
    const res = await fn(payload);
    return res.data;
  }catch(e){
    // رسائل الفنكشن بالعربي خلاص — بنعرضها زي ما هي
    showToast(e && e.message ? e.message : 'العملية فشلت', 'err');
    return null;
  }finally{ _creditBusy = false; }
}

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

  const idem = creditIdem('issue', [currentBranch, value, Date.now()]);
  const r = await callCredit('giftCardIssue', {
    value: value, branch: currentBranch, idem: idem
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

  cart.push({
    id: '__credit_spend__',
    name: '💳 خصم من الرصيد',
    price: -max, qty: 1, isReturn: false, isRedemption: true, isCreditSpend: true
  });
  pendingCreditSpend = { phone: phone, amount: max };
  renderCart();
  showToast('اتخصم ' + max.toFixed(2) + ' ج.م من الرصيد ✅');
}
window.useCustomerCredit = useCustomerCredit;

/* ✅ تثبيت الخصم — بعد ما الفاتورة تتقفل
   ⚠️ الترتيب مقصود: الخصم بيتثبّت **بعد** الفاتورة. لو ثبّتناه
      قبلها والفاتورة فشلت، الرصيد اتخصم والعميلة ماخدتش حاجة. */
async function commitCreditSpend(invoiceCode, invoiceTotal){
  if(!pendingCreditSpend) return null;
  const p = pendingCreditSpend;
  const r = await callCredit('creditSpend', {
    phone: p.phone, amount: p.amount,
    invoiceTotal: Math.abs(Number(invoiceTotal) || 0) + p.amount,
    invoiceCode: invoiceCode,
    idem: creditIdem('spend', [invoiceCode, p.phone, p.amount])
  });
  if(!r){
    // ⚠️ الفاتورة اتقفلت بخصم والرصيد مااتخصمش = خسارة عليك.
    //    لازم تبان بصوت عالي مش تعدّي في اللوج.
    showToast('⚠️⚠️ الرصيد مااتخصمش من حساب العميلة — بلّغ المالك فورًا', 'err');
  }
  pendingCreditSpend = null;
  return r;
}
window.commitCreditSpend = commitCreditSpend;


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
function giftCardSlipHtml(g){
  return '<div style="font-family:Arial; text-align:center; padding:10px 6px; width:100%;">'
    + '<div style="font-size:15px; font-weight:900;">🎁 كارت هدية</div>'
    + '<div style="font-size:12px; margin-top:2px;">' + (currentBranch || '') + '</div>'
    + '<div style="font-size:26px; font-weight:900; margin:8px 0;">' + g.value + ' ج.م</div>'
    + '<div style="border:2px dashed #000; border-radius:6px; padding:8px 4px; margin:6px 0;">'
    +   '<div style="font-size:10px;">الكود</div>'
    +   '<div dir="ltr" style="font-size:17px; font-weight:900; letter-spacing:1.5px;'
    +     ' font-family:monospace; margin-top:3px;">' + g.display + '</div>'
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
