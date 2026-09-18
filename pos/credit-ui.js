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


