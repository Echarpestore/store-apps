/* ============================================================
   🧠 opportunity-core.js — شريط الفرصة (المنطق الصافي)
   ------------------------------------------------------------
   بيجاوب سؤال واحد: **إيه أنفع حاجة تتقال دلوقتي؟**

   🔑 القاعدة الحاكمة: **اقتراح واحد بس.**
      لو الشريط قال تلات حاجات، الكاشير بتبطّل تبص عليه خالص —
      نفس درس اقتراحات طلبات الزباين. الشريط اللي بيتقال عنه
      "مليان كلام" بيتحول لخلفية بيضا في يومين.

   🔑 والقاعدة التانية: **ماتقولش حاجة مش أكيدة.**
      اقتراح غلط قدام العميلة أوحش من مفيش اقتراح. لو مش متأكدين،
      الشريط بيفضل فاضي.
   ============================================================ */

/* 🎯 هدف الشراية الجاية — "ناقصك كام للمكافأة؟"
   ------------------------------------------------------------
   ⚠️ الحسبة دي **مش** بتقول للعميلة تشتري أكتر عشان تكسب أكتر.
      بتقول لها إنها **قرّبت** على حاجة مستحقة أصلًا. الفرق مش
      لغوي: الأولى ضغط، والتانية معلومة كانت مخفية عنها.

   بيرجّع null لو:
     · مفيش رقم عميلة (مفيش حساب أصلًا)
     · ولا نظام نقط مفعّل
     · أو الباقي بعيد قوي (مالوش لازمة يتقال) */
function oppGoal(ctx){
  const cfg = (ctx && ctx.loyalty) || {};
  const per = Number(cfg.pointsPerRedemption) || 0;   // نقط الوحدة
  const val = Number(cfg.redemptionValueEGP) || 0;    // قيمتها بالجنيه
  const rate = Number(cfg.pointsPerEGP) || 0;         // كام جنيه = نقطة
  if(!(per > 0) || !(val > 0) || !(rate > 0)) return null;
  if(!ctx || !ctx.phone) return null;

  const bal = Math.max(0, Number(ctx.pointsBalance) || 0);
  const cart = Math.max(0, Number(ctx.cartTotal) || 0);
  // النقط اللي هتكسبها من الفاتورة اللي في إيدها دلوقتي
  const earning = Math.floor(cart / rate);
  const after = bal + earning;

  // خلصت وحدة كاملة؟ يبقى مفيش "ناقص" — فيه "عندك"
  const unitsAfter = Math.floor(after / per);
  if(unitsAfter >= 1){
    return { kind:'reached', units: unitsAfter,
             value: unitsAfter * val, points: after };
  }

  const needPoints = per - after;
  const needEGP = Math.ceil(needPoints * rate);
  // ⚠️ الباقي البعيد مبيتقالش. "ناقصك ٩٠٠ جنيه" مش تحفيز — ده إحباط،
  //    وبيخلّي الشريط يبان كأنه إعلان. النسبة قابلة للتغيير.
  const maxGap = Number(cfg.goalMaxGapEGP) || 300;
  if(needEGP > maxGap) return null;

  return { kind:'close', needPoints: needPoints, needEGP: needEGP,
           value: val, points: after };
}

/* 🧠 ترتيب الفرص — الأنفع الأول، وواحدة بس بتتعرض
   ------------------------------------------------------------
   الترتيب مش عشوائي — مبني على **إيه اللي بيضيع لو ماتقالش**:

   ١. 🎁 مكافأة مستحقة دلوقتي   → فلوس العميلة هتضيع لو مشيت
   ٢. 💰 رصيد قابل للصرف        → فلوس دفعتها خلاص
   ٣. ⭐ نقط جاهزة للاستبدال     → مستحقة وممكن تنساها
   ٤. 🎯 قرّبت على مكافأة        → فرصة بيعة أكبر
   ٥. 🔖 طلب مسجّل وصل           → حاجة كانت بتدوّر عليها

   ⚠️ الترتيب ده بيحط **مصلحة العميلة قبل مصلحة البيعة** عن قصد.
      "معاكي رصيد" بتقلل الفاتورة، و"قرّبتي على مكافأة" بتزوّدها —
      والأولى فوق. لأن الكاشير اللي بتخفي رصيد العميلة عشان تبيع
      أكتر بتكسب فاتورة وتخسر عميلة. */
function oppRank(ctx){
  const out = [];
  const c = ctx || {};

  // ١) 🎁 مكافأة مستحقة على الفاتورة دي
  if(c.reward && !c.rewardApplied){
    const min = Number(c.reward.minInvoice) || 0;
    const cart = Number(c.cartTotal) || 0;
    if(cart >= min){
      out.push({ id:'reward', pri:1, icon:'🎁',
        text:'مكافأة جاهزة — ' + (c.reward.type === 'percent'
          ? c.reward.value + '%' : c.reward.value + ' ج.م'),
        action:'applyCustomerReward' });
    } else if(min > 0 && (min - cart) <= (Number(c.nearGap) || 200)){
      // ⭐ قربت على حد المكافأة — دي فرصة بيعة حقيقية
      out.push({ id:'reward_near', pri:4, icon:'🎁',
        text:'ناقص ' + Math.ceil(min - cart) + ' ج.م وتفتح مكافأة '
          + (c.reward.type === 'percent' ? c.reward.value + '%' : c.reward.value + ' ج.م'),
        action:null });
    }
  }

  // ٢) 💰 رصيد فلوس
  const credit = Number(c.creditBalance) || 0;
  if(credit > 0 && (Number(c.cartTotal) || 0) > 0 && !c.creditApplied){
    out.push({ id:'credit', pri:2, icon:'💰',
      text:'معاها رصيد ' + credit.toFixed(2) + ' ج.م',
      action:'useCustomerCredit' });
  }

  // ٣) ⭐ نقط جاهزة للاستبدال
  const cfg = c.loyalty || {};
  const per = Number(cfg.pointsPerRedemption) || 0;
  const bal = Number(c.pointsBalance) || 0;
  if(per > 0 && bal >= per && !c.redeemApplied && (Number(c.cartTotal) || 0) > 0){
    const units = Math.floor(bal / per);
    out.push({ id:'redeem', pri:3, icon:'⭐',
      text:'عندها ' + bal + ' نقطة — تستبدل '
        + (units * (Number(cfg.redemptionValueEGP) || 0)) + ' ج.م',
      action:'openRedeem' });
  }

  // ٤) 🎯 هدف الشراية الجاية
  const g = oppGoal(c);
  if(g && g.kind === 'close'){
    out.push({ id:'goal', pri:5, icon:'🎯',
      text:'ناقصها ' + g.needEGP + ' ج.م وتفتح مكافأة ' + g.value + ' ج.م',
      action:null });
  }

  // ٥) 🔖 طلب مسجّل ليها وصل
  if(c.requestHit){
    out.push({ id:'request', pri:6, icon:'🔖',
      text:'كانت طالبة: ' + String(c.requestHit).slice(0, 40),
      action:null });
  }

  out.sort(function(a, b){ return a.pri - b.pri; });
  return out;
}

/* 🎬 الفرصة اللي هتتعرض — **واحدة بس**
   ⚠️ الدالة دي هي كل الميزة. لو رجّعت أكتر من واحدة، الشريط
      بيتحول لضوضاء والكاشير بتبطّل تبص. */
function oppTop(ctx){
  const all = oppRank(ctx);
  return all.length ? all[0] : null;
}

/* 📱 نص العميلة — نفس اللحظة بس بلغتها
   ⚠️ مختلف عن نص الكاشير عن قصد:
      الكاشير بتقرا "معاها رصيد ٥٠" (معلومة تشغيلية)
      والعميلة بتقرا "معاكي رصيد ٥٠" (كلام ليها)
      وفي حاجات الكاشير بتشوفها والعميلة لأ (زي طلب مسجّل —
      دي مفاجأة أحلى لما الكاشير تقولها بصوتها). */
function oppCustomerText(opp, ctx){
  if(!opp) return '';
  const c = ctx || {};
  switch(opp.id){
    case 'reward':      return '🎁 مكافأتك جاهزة على الفاتورة دي';
    case 'credit':      return '💰 معاكي رصيد ' + (Number(c.creditBalance)||0).toFixed(2) + ' ج.م';
    case 'redeem':      return '⭐ عندك ' + (Number(c.pointsBalance)||0) + ' نقطة تقدري تستبدليها';
    case 'goal':        return '🎯 ' + opp.text.replace('ناقصها', 'ناقصك');
    case 'reward_near': return '🎁 ' + opp.text.replace('ناقص', 'ناقصك');
    default:            return '';    // 🔖 الطلبات مش بتتعرض للعميلة
  }
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = { oppGoal, oppRank, oppTop, oppCustomerText };
}
if(typeof window !== 'undefined'){
  window.oppGoal = oppGoal;
  window.oppRank = oppRank;
  window.oppTop = oppTop;
  window.oppCustomerText = oppCustomerText;
}
