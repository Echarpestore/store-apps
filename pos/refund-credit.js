/* ============================================================
   💳 refund-credit.js — المرتجع لرصيد العميلة
   ------------------------------------------------------------
   بيتحط في: pos/refund-credit.js
   وبيتحمّل من pos/index.html بعد instapay-pos.js:
     <script src="refund-credit.js?v=692"></script>

   الفكرة: «رصيد العميلة» بقت **طريقة دفع عادية** زي الكاش والفيزا،
   فبتمشي لوحدها في كل مسارات الحفظ والتقارير والفاتورة المطبوعة.
   الملف ده بيعمل تلات حاجات بس:
     1. يوري الزرار في المرتجع ويخفيه في البيع العادي
     2. يمنع الاستخدام الغلط (من غير رقم عميلة)
     3. يكتب الرصيد في حساب العميلة بعد ما الفاتورة تتحفظ

   ⚠️ التقفيل: `payments.credit` اتضاف في `dcAggregate` وفي حساب
      التسوية في `pos-reports.js`. من غير ده كل مرتجع بالرصيد كان
      هيطلّع **أوفر وهمي** بنفس قيمته كل يوم.

   🔴 الرصيد بيتكتب **بعد** الحفظ مش قبله. لو اتكتب قبله وفشل
      الحفظ، العميلة تاخد رصيد من غير ما ترجّع بضاعة.
   ============================================================ */
(function () {
  'use strict';

  const BTN = 'pmCredit';
  let lastCtx = null;   // بيانات الفاتورة قبل ما السلة تتفضّى

  const fnCall = (name, payload) =>
    firebase.app().functions('us-central1').httpsCallable(name)(payload).then(r => r.data || {});

  function btn() { return document.getElementById(BTN); }
  function phoneNow() {
    const el = document.getElementById('customerPhone');
    return el ? String(el.value || '').trim() : '';
  }

  /* 👁️ الزرار بيظهر في المرتجع بس.
     البيع العادي مفيش فيه معنى إن العميلة "تدفع لنا رصيد" — الصرف
     من الرصيد ليه مساره الخاص (زرار «استخدمي الرصيد»). */
  function sync() {
    const b = btn(); if (!b) return;
    let isRefund = false;
    try { isRefund = (typeof cartTotal === 'function') && cartTotal() < 0; } catch (e) {}
    b.style.display = isRefund ? '' : 'none';
    if (!isRefund) {
      try {
        if (typeof selectedPayMethods !== 'undefined' && selectedPayMethods.has('credit')) {
          selectedPayMethods.delete('credit');
          if (typeof paymentAmounts !== 'undefined') delete paymentAmounts.credit;
          b.classList.remove('selected', 'filled');
          if (typeof updatePaySummary === 'function') updatePaySummary();
        }
      } catch (e) {}
    }
  }
  setInterval(sync, 700);
  sync();

  /* 🔒 البوابة: رصيد من غير رقم عميلة = فلوس رايحة في الهوا.
     بنمنعها عند اختيار الطريقة، مش عند الحفظ، عشان الكاشير تعرف
     بدري وهي لسه قدام العميلة. */
  const _origToggle = window.togglePayMethod;
  if (typeof _origToggle === 'function') {
    window.togglePayMethod = function (method) {
      if (method === 'credit') {
        let already = false;
        try { already = (typeof selectedPayMethods !== 'undefined') && selectedPayMethods.has('credit'); } catch (e) {}
        if (!already && !phoneNow()) {
          if (typeof showToast === 'function')
            showToast('⛔ اكتبي رقم العميلة الأول — الرصيد بيتحط في حسابها', 'err');
          return;
        }
      }
      return _origToggle.apply(this, arguments);
    };
  }

  /* 🧾 مسك السياق قبل الحفظ.
     ⚠️ `confirmPayment` بتفضّي السلة وبتمسح خانة الرقم، فأي قراءة
        بعد الحفظ بترجع فاضية. لازم نمسك الأرقام قبلها — نفس الدرس
        اللي اتسجّل في شاشة الباقي. */
  const _origConfirm = window.confirmPayment;
  window.confirmPayment = async function () {
    lastCtx = null;
    /* 💰↩️ v723 — فاتورة اتدفعت **رصيد** لازم مرتجعها يرجع **رصيد** (بلاغ المالك 21-09).
       قبل كده الكاشير كانت تختار كاش لمرتجع فاتورة مدفوعة رصيد = الرصيد بيتحوّل فلوس في الإيد. دلوقتي:
       الجزء اللي اتدفع رصيد (ولسه مارجعش) **لازم** يتحط على طريقة «رصيد العميلة»، والباقي بأي طريقة. */
    let _reqCredit = { need: 0, alloc: {} };
    try {
      if (typeof window.retRequiredCredit === 'function') {
        _reqCredit = window.retRequiredCredit(cart, window._retCredit || {}, (typeof cartTotal === 'function') ? cartTotal() : 0);
        let chosen = 0;
        try { if (selectedPayMethods.has('credit')) chosen = Math.abs(Number(paymentAmounts.credit) || 0); } catch (e) {}
        if (_reqCredit.need > 0.009 && chosen + 0.01 < _reqCredit.need) {
          const msg = 'الفاتورة الأصلية اتدفع منها رصيد — لازم <b>' + _reqCredit.need.toFixed(2) + ' ج.م</b> يرجعوا <b>رصيد</b> مش كاش.<br><br>'
            + 'اختاري «💳 رصيد العميلة» واكتبي ' + _reqCredit.need.toFixed(2) + (chosen > 0 ? ' (مكتوب دلوقتي ' + chosen.toFixed(2) + ')' : '') + '.';
          if (typeof askConfirm === 'function') await askConfirm({ icon:'💰', danger:true, waitSec:0, title:'المرتجع ده لازم يرجع رصيد', message: msg, okText:'تمام', cancelText:'قفل' });
          else if (typeof showToast === 'function') showToast('⛔ لازم ' + _reqCredit.need.toFixed(2) + ' ج.م يرجعوا رصيد', 'err');
          return;
        }
      }
    } catch (e) { console.warn('[refund-credit] required', e); }
    try {
      const use = (typeof selectedPayMethods !== 'undefined') && selectedPayMethods.has('credit');
      if (use) {
        const amt = Math.abs(Number((typeof paymentAmounts !== 'undefined' ? paymentAmounts.credit : 0)) || 0);
        const ph = phoneNow();
        if (!ph) {
          if (typeof showToast === 'function') showToast('⛔ رقم العميلة ناقص', 'err');
          return;
        }
        if (!(amt > 0)) {
          if (typeof showToast === 'function') showToast('⛔ مبلغ الرصيد مش مكتوب', 'err');
          return;
        }
        lastCtx = { phone: ph, amount: amt, branch: (window.currentBranch || currentBranch), alloc: _reqCredit.alloc || {} };
      }
    } catch (e) { console.warn('[refund-credit] ctx', e); }

    const out = await _origConfirm.apply(this, arguments);

    if (lastCtx) {
      const ctx = lastCtx; lastCtx = null;
      const code = window._lastInvoiceCode || '';
      try {
        /* 🔑 `idem` = مفتاح منع التكرار، **إجباري** في `creditAdjust`.
           🔴 نسيته في أول نسخة فالدالة رفضت بـ"مفتاح التكرار ناقص" —
              وده رفض صح: من غيره لو الاتصال اتكرر (نت متقطع، ضغط
              مرتين) الرصيد كان هيتحط مرتين على نفس المرتجع.
           بنبنيه من رقم الفاتورة + الرقم + المبلغ، فأي إعادة إرسال
           لنفس المرتجع بتتعرف وتترفض. */
        const idem = 'refund:' + (code || 'nocode') + ':' + ctx.phone + ':' + ctx.amount.toFixed(2);
        const _pl = {
          phone: ctx.phone,
          amount: ctx.amount,          // موجب — ده رصيد بيتضاف
          source: 'refund',
          branch: ctx.branch,
          invoiceCode: code,
          idem: idem,
          reason: 'مرتجع بضاعة — فاتورة ' + (code || '—')
        };
        /* v724: نفس معاملة خصم الرصيد — نداء بيرجّع السبب + طابور إعادة لو الفشل مؤقت (المالك شاف «الرصيد ماتحطش» في الرحاب 21-09 من غير سبب) */
        if (typeof callCreditEx === 'function') {
          const r = await callCreditEx('creditAdjust', _pl);
          if (!r.ok) { const e = new Error(r.message || r.code || 'creditAdjust'); e.code = r.code; e._payload = _pl; throw e; }
        } else await fnCall('creditAdjust', _pl);
        if (typeof showToast === 'function')
          showToast('✅ اتحط ' + ctx.amount.toFixed(2) + ' ج.م في رصيد العميلة', 'ok');
        /* نعلّم على الفاتورة الأصلية إن الجزء ده من رصيدها رجع — عشان مرتجع تاني منها ميطلبش نفس الرصيد مرتين */
        try {
          Object.keys(ctx.alloc || {}).forEach(function (inv) {
            const info = (window._retCredit || {})[inv];
            if (!info || !info.docId) return;
            info.left = Math.max(0, Math.round((info.left - ctx.alloc[inv]) * 100) / 100);
            db.collection(TEST_SALES).doc(info.docId).update({ creditRefunded: firebase.firestore.FieldValue.increment(ctx.alloc[inv]) }).catch(function () {});
          });
        } catch (e) {}
      } catch (e) {
        /* ⚠️ الفاتورة اتحفظت خلاص ومبنرجّعش فيها. بنبلّغ بصوت عالي
           عشان المالك يضيف الرصيد يدوي — أهون بكتير من إننا نسكت
           والعميلة ترجع تسأل على رصيد مش موجود. */
        console.error('[refund-credit] adjust', e);
        const why = (e && e.message) || (e && e.code) || '';
        try { if (typeof _logActivity === 'function') _logActivity('credit_refund_failed', { phone: ctx.phone, amount: ctx.amount, invoiceCode: code, code: (e && e.code) || '', message: why }); } catch (_) {}
        try { if (e && e._payload && typeof creditRetryPush === 'function') creditRetryPush(e._payload, { code: e.code }, 'creditAdjust'); } catch (_) {}
        if (typeof showToast === 'function')
          showToast('⚠️⚠️ الفاتورة اتحفظت بس الرصيد ماتحطش (' + (code || '؟') + ')' + (why ? ' — السبب: ' + why : '') + ' — هيتعاد لوحده لو مؤقت، وبلّغ المالك', 'err');
      }
    }
    return out;
  };

  // 🩺 تشخيص
  window.refundCreditDiag = function () {
    console.log('الزرار ظاهر؟', btn() ? btn().style.display !== 'none' : 'مش موجود');
    console.log('رقم العميلة:', phoneNow() || '— فاضي');
    try { console.log('مختارة؟', selectedPayMethods.has('credit')); } catch (e) {}
  };
})();
