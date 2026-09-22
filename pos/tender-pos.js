/* ============================================================
   💳 tender-pos.js — ربط tender-core.js بحفظ الفاتورة
   ------------------------------------------------------------
   بيتحمّل من pos/index.html بعد refund-credit.js:
     <script src="tender-core.js?v=696"></script>
     <script src="tender-pos.js?v=696"></script>

   الفكرة (§4هـ): الكاشير لسه بتشوف «خصم من الرصيد / استبدال نقط /
   مكافأة» سطر سالب في السلة، والمطلوب من العميلة بيتحسب زي ما هو.
   **لحظة الحفظ بس** السطور دي بتتحوّل لطرق دفع:

        قبل:  items=[طرحة 350, رصيد −350]  total=0    payments={}
        بعد:  items=[طرحة 350]             total=350  payments={credit:350}

   ⚠️ طبقة فوق — `pos-sale.js` **ماتلمسش**. بنغلّف `_doConfirmPayment`:
      نشيل سطور الدفع من السلة ونحطها في المدفوعات، وبعدين الدالة
      الأصلية بتحسب كل حاجة (الإجمالي · النقط · نقطة البياعة · الفاتورة
      المطبوعة · المخزون) على السلة النضيفة. صفر حساب فلوس هنا.

   🔴 لو الحفظ فشل أو اترفض (السلة لسه مليانة) بنرجّع السلة والمدفوعات
      زي ما كانوا بالظبط — وإلا الكاشير تلاقي سطر الرصيد اختفى والمطلوب
      رجع 350.

   ⚠️ الرصيد نفسه لسه بيتخصم **بعد** الحفظ من `commitCreditSpend`
      (credit-ui.js) زي ما هو — بيقرا `pendingCreditSpend` مش السلة.
      والنقط والمكافأة بيتخصموا من `pendingRedemption`/`appliedReward`
      جوّه الدالة الأصلية. مفيش حاجة من دي اتغيّرت.
   ============================================================ */
(function () {
  'use strict';

  const _orig = window._doConfirmPayment;
  if (typeof _orig !== 'function' || typeof window.tenderSplit !== 'function') {
    console.warn('[tender] مش متركّب — _doConfirmPayment أو tender-core ناقص');
    return;
  }

  function toast(m) { try { if (typeof showToast === 'function') showToast(m, 'err'); } catch (e) {} }

  window._doConfirmPayment = async function () {
    let split;
    try { split = window.tenderSplit(cart); } catch (e) { split = null; }
    // مفيش سطور دفع = الفاتورة العادية، ولا لمسة.
    if (!split || !(split.sum > 0)) return _orig.apply(this, arguments);

    let net = 0, hasStaff = false;
    try { net = cartTotal(); } catch (e) {}
    try { hasStaff = !!staffPurchase; } catch (e) {}
    let online = true;
    try { online = navigator.onLine !== false; } catch (e) {}
    const why = window.tenderBlockReason(split, net, hasStaff, online);
    if (why) { toast(why); return; }

    /* 💳↩️ حالة نادرة: اتسحب من الكارت أكتر من المطلوب (السلة اتعدّلت بعد
       السحب). منظومة «مستحق الرد» جوّه الدالة الأصلية بتقارن المسحوب
       بـ`total` — ولو كبّرنا `total` الفرق هيستخبى والعميلة ماتاخدش حقها.
       فالفاتورة دي بالذات بتتحفظ بالشكل القديم (سطر سالب) — كل التقارير
       لسه بتفهمه — وبنسجّلها عشان تتراجع. */
    let over = 0;
    try { over = (typeof cardOvercharge === 'function') ? cardOvercharge(cardLegs, net) : 0; } catch (e) {}
    if (over > 0) {
      console.warn('[tender] كارت مسحوب زيادة ' + over + ' — الفاتورة هتتحفظ بالشكل القديم');
      try { if (typeof _logActivity === 'function') _logActivity('tender_legacy_save', { over: over, tender: split.payments }); } catch (e) {}
      return _orig.apply(this, arguments);
    }

    // 📸 لقطة عشان نرجّع كل حاجة لو الحفظ ماتمّش
    const savedCart = cart;
    const hadKey = {}, hadAmt = {};
    window.TENDER_KEYS.forEach(function (k) {
      hadKey[k] = selectedPayMethods.has(k);
      hadAmt[k] = paymentAmounts[k];
    });

    // 🔄 التحويل: السطور تطلع من السلة وتدخل المدفوعات
    const cleanCart = split.items;
    cart = cleanCart;
    Object.keys(split.payments).forEach(function (k) {
      selectedPayMethods.add(k);
      // لو نفس المفتاح مكتوب أصلًا (مايحصلش في البيع، بس للأمان) بنجمع
      paymentAmounts[k] = +(((hadKey[k] ? Number(hadAmt[k]) : 0) || 0) + split.payments[k]).toFixed(2);
    });

    window._paySplitSaving = true;   // v728: أثناء الحفظ سطر الرصيد بيبقى في المدفوعات مش السلة — reconcilePendingTenders متلمسش الحالة
    try {
      return await _orig.apply(this, arguments);
    } finally {
      window._paySplitSaving = false;
      // ✅ النجاح = `goToSale()` فضّت السلة (cart = []).
      //    لو السلة لسه هي هي ومليانة يبقى الحفظ فشل/اترفض → رجّع.
      let failed = false;
      try { failed = (cart === cleanCart && cart.length > 0); } catch (e) {}
      if (failed) {
        cart = savedCart;
        window.TENDER_KEYS.forEach(function (k) {
          if (hadKey[k]) { paymentAmounts[k] = hadAmt[k]; }
          else { selectedPayMethods.delete(k); delete paymentAmounts[k]; }
        });
        try { if (typeof renderCart === 'function') renderCart(); } catch (e) {}
        try { if (typeof updatePaySummary === 'function') updatePaySummary(); } catch (e) {}
      }
    }
  };

  // 🩺 تشخيص من الكونسول
  window.tenderDiag = function () {
    const s = window.tenderSplit(cart);
    console.log('المطلوب من العميلة (cartTotal):', cartTotal());
    console.log('هيتحفظ كطرق دفع:', s.payments, '· مجموع', s.sum);
    console.log('إجمالي الفاتورة اللي هيتسجّل:', +(cartTotal() + s.sum).toFixed(2));
    console.log('سطور البضاعة:', s.items.length, 'من', cart.length);
  };
})();
