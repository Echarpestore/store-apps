/* ============================================================
   ↩️💳 reverse-credit.js — عكس فاتورة فيها رصيد بيرجّع الرصيد
   ------------------------------------------------------------
   بيتحمّل من pos/index.html بعد tender-pos.js:
     <script src="reverse-credit.js?v=698"></script>

   🔴 الباج: `reverseReceipt` بيعكس المخزون والنقط والمدفوعات (فالتقفيل
      سليم) بس **مبيلمسش رصيد العميلة**:
      • فاتورة اتدفعت برصيد 350 واتعكست → الـ350 راحوا على العميلة.
      • مرتجع اتحط رصيد 350 واتعكس → العميلة فضل معاها 350 مش من حقها.

   ✅ بعد ما العكس يتم فعلًا بنصلّح الرصيد:
      • صرف اتعكس  → +المبلغ  (source:'refund' + رقم فاتورة = بيعدّي فورًا)
      • مرتجع لرصيد اتعكس → −المبلغ (خصم = بيروح لطابور موافقة المالك
        لو اللي عكست مش المالك — ده قرار السيرفر ومش بنلف عليه)

   ⚠️ طبقة فوق — `pos-sale.js` ماتلمسش. بنغلّف `reverseReceipt`.
   ⚠️ مبنعملش حاجة غير لو الفاتورة **اتعكست فعلًا** (بنقراها تاني بعد
      الدالة الأصلية) — الكاشير ممكن تدوس "إلغاء" في التأكيد.
   🔑 `idem` من رقم الفاتورة **الأصلية** → نفس العكس مايتحسبش مرتين.
   ============================================================ */

/* المبلغ اللي لازم يرجع (+) أو يتسحب (−) من رصيد العميلة لما الفاتورة
   دي تتعكس. صفر = ملهاش علاقة بالرصيد. بيفهم الشكلين:
   • الجديد (v696+): payments.credit
   • القديم: سطر سالب isCreditSpend جوّه items */
function reverseCreditAmount(sale){
  if(!sale) return 0;
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const pc = r2((sale.payments || {}).credit);
  if(pc) return pc;                       // +صرف يرجع · −مرتجع يتسحب
  const legacy = (sale.items || []).reduce(function(s, it){
    return (it && it.isCreditSpend) ? s + Math.abs((Number(it.price) || 0) * (Number(it.qty) || 1)) : s;
  }, 0);
  return r2(legacy);
}

function reverseCreditPhone(sale){
  const p = String((sale && sale.customerPhone) || '').replace(/\D/g, '');
  return /^01\d{9}$/.test(p) ? p : '';
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = { reverseCreditAmount, reverseCreditPhone };
}

(function(){
  'use strict';
  if(typeof window === 'undefined') return;
  window.reverseCreditAmount = reverseCreditAmount;
  window.reverseCreditPhone = reverseCreditPhone;

  const _orig = window.reverseReceipt;
  if(typeof _orig !== 'function'){ console.warn('[reverse-credit] reverseReceipt مش موجودة'); return; }

  const fnCall = (name, payload) =>
    firebase.app().functions('us-central1').httpsCallable(name)(payload).then(r => r.data || {});
  const toast = (m, k) => { try{ if(typeof showToast === 'function') showToast(m, k); }catch(e){} };

  window.reverseReceipt = async function(saleId){
    // 📸 الفاتورة **قبل** العكس
    let before = null;
    try{
      const s = await db.collection(TEST_SALES).doc(saleId).get();
      before = s.exists ? s.data() : null;
    }catch(e){ console.warn('[reverse-credit] read', e); }

    const out = await _orig.apply(this, arguments);

    try{
      if(!before || before.reversed || before.isReversal) return out;
      const amt = reverseCreditAmount(before);
      if(!amt) return out;

      // ✅ اتعكست فعلًا؟ (الكاشير ممكن تكون لغت التأكيد)
      const s2 = await db.collection(TEST_SALES).doc(saleId).get();
      if(!s2.exists || !s2.data().reversed) return out;

      const code = String(before.invoiceCode || saleId);
      const phone = reverseCreditPhone(before);
      if(!phone){
        toast('⚠️⚠️ الفاتورة اتعكست بس مفيهاش رقم عميلة — رصيد ' + Math.abs(amt).toFixed(2) + ' ج.م محتاج تعديل يدوي (' + code + ')', 'err');
        return out;
      }
      const r = await fnCall('creditAdjust', {
        phone: phone, amount: amt, source: 'refund',
        branch: (window.currentBranch || currentBranch),
        invoiceCode: code,
        idem: 'reverse:' + code + ':' + phone + ':' + amt.toFixed(2),
        reason: (amt > 0 ? 'عكس فاتورة مدفوعة برصيد — ' : 'عكس مرتجع لرصيد — ') + code
      });
      if(r && r.queued)
        toast('🕓 سحب ' + Math.abs(amt).toFixed(2) + ' ج.م من رصيد العميلة مستني موافقة المالك', 'ok');
      else if(amt > 0)
        toast('✅ رجع ' + amt.toFixed(2) + ' ج.م لرصيد العميلة', 'ok');
      else
        toast('✅ اتسحب ' + Math.abs(amt).toFixed(2) + ' ج.م من رصيد العميلة', 'ok');
    }catch(e){
      // ⚠️ العكس تم خلاص ومبنرجّعش فيه — بنبلّغ بصوت عالي
      console.error('[reverse-credit] adjust', e);
      toast('⚠️⚠️ الفاتورة اتعكست بس رصيد العميلة مااتظبطش — بلّغ المالك فورًا', 'err');
    }
    return out;
  };
})();
