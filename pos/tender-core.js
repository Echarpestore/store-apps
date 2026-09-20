/* ============================================================
   💳 tender-core.js — الخصومات السالبة بقت طرق دفع (منطق خام)
   ------------------------------------------------------------
   🔴 العيب (§4هـ): صرف الرصيد · استبدال النقط · المكافأة كانوا
      بيتسجّلوا **سطر سالب جوّه الفاتورة**. فاتورة 350 مدفوعة كلها
      من الرصيد = `total: 0`. التقفيل كان سليم (الطرفين بينزلوا
      مع بعض) بس **رقم المبيعات غلط**: مرتجع 350 بالرصيد + بيع 350
      بنفس الرصيد = السيستم يقول −350 والحقيقة صفر.

   ✅ الحل: أي حاجة بتقلّل المطلوب من العميلة = **طريقة دفع**:
        payments.credit  ← صرف الرصيد
        payments.points  ← استبدال النقط
        payments.reward  ← المكافأة الخاصة
      والفاتورة تفضل بقيمتها الكاملة (total = قيمة البضاعة).

   الملف ده **منطق خام بس** — مفيش DOM ولا Firebase — عشان يتختبر
   بـnode مباشرة. الربط بـPOS في tender-pos.js.
   ============================================================ */

/* 🔴 تصحيح 20 سبتمبر (المالك شاف «مكافأة خاصة 120» و«استبدال نقط 60» في ملخص
   المدفوعات كأنهم مبيعات): **الرصيد بس** هو اللي طريقة دفع.
     • الرصيد  = فلوس حقيقية دخلت قبل كده (مرتجع/كارت هدية) → دفع، والفاتورة بقيمتها.
     • النقط والمكافأة = **خصم** من جيب المحل، مفيش مقابلهم فلوس دخلت ولا هتدخل →
       بيفضلوا سطر سالب والفاتورة بتنزل بقيمتهم. دي المبيعات الحقيقية، وده اللي
       السيستم كان بيعمله صح قبل v696. عيب 4هـ الأصلي كان في **الرصيد بس**.
   v696→v704 حوّلت التلاتة (اتجاه المستند القديم) — غلط في النقط والمكافأة. */
const TENDER_KEYS = ['credit'];
const TENDER_LABELS = {
  credit: '💳 رصيد العميلة',
  points: '🎁 استبدال نقط',
  reward: '🎁 مكافأة خاصة'
};

function _r2(n){ return Math.round((Number(n) || 0) * 100) / 100; }

/* السطر ده طريقة دفع؟ ولو آه، أنهي واحدة؟
   ⚠️ الترتيب مهم: سطر الرصيد عليه `isRedemption:true` **و**
      `isCreditSpend:true` مع بعض، فلازم الرصيد يتفحص الأول وإلا
      هيتسجّل نقط. */
function tenderKeyOf(line){
  if(!line) return '';
  if(line.isReturn) return '';                       // سطر مرتجع بضاعة ≠ طريقة دفع
  if(!((Number(line.price) || 0) < 0)) return '';    // لازم يكون سالب
  if(line.isCreditSpend) return 'credit';
  return '';   // النقط (isRedemption) والمكافأة (isRewardDiscount) خصومات — بيفضلوا في السلة
}

/* بيفصل السلة: سطور بضاعة + مدفوعات.
   بيرجّع: { items, payments:{credit,points,reward}, sum }
   • items   — السلة من غير سطور الدفع (نفس كائنات السطور، مش نسخ)
   • payments — الموجود بس (مفيش مفاتيح بصفر)
   • sum     — مجموع المدفوعات دي (موجب) */
function tenderSplit(cart){
  const items = [], payments = {};
  (cart || []).forEach(function(line){
    const k = tenderKeyOf(line);
    if(!k){ items.push(line); return; }
    const amt = _r2(Math.abs((Number(line.price) || 0) * (Number(line.qty) || 1)));
    if(amt > 0) payments[k] = _r2((payments[k] || 0) + amt);
  });
  const sum = _r2(Object.keys(payments).reduce(function(s, k){ return s + payments[k]; }, 0));
  return { items: items, payments: payments, sum: sum };
}

/* 🛡️ ينفع الفاتورة دي تتحفظ بالمدفوعات دي؟
   netTotal = cartTotal() **قبل** الفصل (المطلوب من العميلة فعلًا).
   بيرجّع '' لو تمام، أو رسالة الرفض. */
function tenderBlockReason(split, netTotal, hasStaffPurchase, isOnline){
  if(!split || !(split.sum > 0)) return '';
  // 📴 الرصيد بيتخصم من السيرفر بعد الحفظ. أوفلاين = الفاتورة تتحفظ بخصم
  //    والرصيد يفضل زي ما هو = فلوس ببلاش. (النقط والمكافأة بيتكتبوا
  //    في نفس دفعة الفاتورة فبيمشوا أوفلاين عادي.)
  if((split.payments.credit || 0) > 0 && isOnline === false)
    return '⛔ النت قاطع — صرف الرصيد محتاج نت. شيلي سطر الرصيد أو استني النت';
  // نفس ثغرة النقط→كاش (§4أ٧) بس لكل الأنواع: لو الصافي سالب يبقى
  // الرصيد/النقط أكبر من البضاعة والفرق هيطلع كاش من الدرج.
  if((Number(netTotal) || 0) < -0.005)
    return '⛔ الرصيد أكبر من قيمة الفاتورة — شيلي سطر الرصيد أو زوّدي منتجات';
  // خصم الموظف نسبة من الإجمالي؛ لما سطور الدفع تتشال الإجمالي بيكبر
  // والخصم بيتغيّر بعد ما الكاشير حسبت الفلوس. أندر من إننا نخاطر بيه.
  if(hasStaffPurchase)
    return '⛔ شراء الموظف مينفعش مع صرف رصيد في نفس الفاتورة';
  return '';
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = { TENDER_KEYS, TENDER_LABELS, tenderKeyOf, tenderSplit, tenderBlockReason };
}
if(typeof window !== 'undefined'){
  window.TENDER_KEYS = TENDER_KEYS;
  window.TENDER_LABELS = TENDER_LABELS;
  window.tenderKeyOf = tenderKeyOf;
  window.tenderSplit = tenderSplit;
  window.tenderBlockReason = tenderBlockReason;
}
