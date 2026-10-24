/* ============================================================
   🔔 spendNotice.js — إشعار العميلة لما نقطها أو رصيدها يتصرف (21 سبتمبر 2026)
   ------------------------------------------------------------
   طلب المالك: «لو العميل استبدل رصيد أو نقاط يروح له إشعار على التطبيق بالمبلغ اللي اتسحب والباقي،
   ولما يدوس على الإشعار يوديه للمكان المطلوب بالظبط».

   ⚠️ **مش دالة سحابية جديدة** — موديول داخلي بيتنادى من دالتين موجودين:
        • `onSaleForReferral` (تريجر الفاتورة)  → استبدال النقط
        • `creditSpend` (giftCredit.js)          → صرف الرصيد (هي اللي عارفة الرصيد بعد الخصم بالظبط)
      درس كوتة 18 سبتمبر: أي دالة جديدة = خطر. الملف ده **مبيتعملوش** `Object.assign(exports, …)`.
   🛡️ الإشعار ده فايدته الأولى أمنية: عميلة جالها «اتسحب 300 ج.م من رصيدك» وهي في البيت = عرفت فورًا إن حد صرف رصيدها.
   🔗 اللينك: `?inv=<كود الفاتورة>` — التطبيق بيفتح الفاتورة نفسها (نفس آلية `?rate=`).
   كل حاجة هنا best-effort: فشل الإشعار عمره ما يفشّل فاتورة ولا خصم.
   ============================================================ */
'use strict';

const BRAND_NAMES = { echarpe: 'echarpe 🌸', glow: 'Glow 🖤' };
const TOKEN_FIELDS = { echarpe: 'fcmTokens_echarpe', glow: 'fcmTokens_glow' };
const GLOW_BRANCHES = ['Glow'];   // ⚠️ = pos/pos-core.js (عليها اختبار)
function brandOfBranch(branch){ return GLOW_BRANCHES.includes(String(branch || '')) ? 'glow' : 'echarpe'; }

function fmtNum(n){ const v = Math.round((Number(n) || 0) * 100) / 100; return String(v % 1 === 0 ? v : v.toFixed(2)); }
function invLink(invoiceCode){
  const c = String(invoiceCode || '');
  return /^[A-Za-z0-9-]{4,60}$/.test(c) ? './?inv=' + encodeURIComponent(c) : './?go=points';   // نفس شكل `./?rate=` الشغّال
}

/* 🎁 نقط اتستبدلت في فاتورة. بيرجّع null لو مفيش حاجة تتبعت. */
function buildPointsNotice(sale){
  const s = sale || {};
  const redeemed = Math.round(Number(s.pointsRedeemed) || 0);
  if(!s.customerPhone || !(redeemed > 0)) return null;
  if(s.isReversal || s.reversed) return null;
  const brand = brandOfBranch(s.branch);
  const earned = Math.round(Number(s.loyaltyPointsEarned) || 0);
  const hasBefore = typeof s.pointsBalanceBefore === 'number' && isFinite(s.pointsBalanceBefore);
  const after = hasBefore ? Math.max(0, Math.round(s.pointsBalanceBefore) - redeemed + earned) : null;
  let body = 'اتخصم ' + fmtNum(redeemed) + ' نقطة' + (s.invoiceNo ? ' في فاتورة #' + s.invoiceNo : '');
  if(after !== null) body += ' · رصيدك دلوقتي ' + fmtNum(after) + ' نقطة';
  return { brand, tag: 'redeem', title: '🎁 استبدلتي نقط — ' + (BRAND_NAMES[brand] || brand), body,
           link: invLink(s.invoiceCode) };
}

/* 💰 رصيد اتصرف. `spent` و`balanceAfter` جايين من معاملة `creditSpend` نفسها — أرقام مؤكدة مش تقدير. */
function buildCreditNotice(o){
  const x = o || {};
  const spent = Number(x.spent) || 0;
  if(!x.phone || !(spent > 0)) return null;
  const brand = x.brand === 'glow' ? 'glow' : 'echarpe';
  let body = 'اتسحب ' + fmtNum(spent) + ' ج.م من رصيدك';
  if(typeof x.balanceAfter === 'number' && isFinite(x.balanceAfter)) body += ' · الباقي ' + fmtNum(Math.max(0, x.balanceAfter)) + ' ج.م';
  body += '. لو مش إنتِ، كلّمي الفرع فورًا.';
  return { brand, tag: 'credit_spend', title: '💰 استخدمتي رصيدك — ' + (BRAND_NAMES[brand] || brand), body,
           link: x.invoiceCode ? invLink(x.invoiceCode) : './?go=credit' };
}

/* 💵 رصيد **اتضاف** لحساب العميلة (باقي محفوظ · مرتجع · إضافة من الإدارة · كارت هدية). نفس قاعدة «الأرقام من المعاملة نفسها». */
const ADD_KIND = {
  change_kept: 'باقي فاتورتك اتحفظ رصيد',
  refund:      'مرتجعك اتحط رصيد',
  gift:        'كارت الهدية اتضاف لرصيدك',
  manual:      'اتضاف رصيد لحسابك',
};
function buildCreditAddNotice(o){
  const x = o || {};
  const added = Number(x.added) || 0;
  if(!x.phone || !(added > 0)) return null;
  const brand = x.brand === 'glow' ? 'glow' : 'echarpe';
  let body = (ADD_KIND[x.kind] || ADD_KIND.manual) + ': +' + fmtNum(added) + ' ج.م';
  if(typeof x.balanceAfter === 'number' && isFinite(x.balanceAfter)) body += ' · رصيدك دلوقتي ' + fmtNum(Math.max(0, x.balanceAfter)) + ' ج.م';
  return { brand, tag: 'credit_add', title: '💵 رصيد جديد — ' + (BRAND_NAMES[brand] || brand), body, link: './?go=credit' };
}

/* توكنات **البراند ده بس** — إشعار Glow ميروحش لتطبيق echarpe */
function tokensFor(data, brand){
  const d = data || {}, out = [];
  const arr = d[TOKEN_FIELDS[brand]];
  if(Array.isArray(arr)) out.push(...arr);
  const map = d.fcmTokens;
  if(map && typeof map === 'object' && !Array.isArray(map)){
    Object.keys(map).forEach((t) => { const m = map[t]; if(m && (m.brand || 'echarpe') === brand) out.push(t); });
  }
  return [...new Set(out)].filter((t) => typeof t === 'string' && t.length > 100);
}

/* الإرسال. `deps` = { db, messaging } — متحقونين عشان الاختبار ومن غير ما الموديول يعمل init لوحده. */
async function sendNotice(deps, phone, notice){
  try{
    if(!deps || !deps.db || !deps.messaging || !phone || !notice) return { sent: 0, reason: 'skip' };
    const ref = deps.db.collection('pos_test_customers').doc(String(phone));
    const snap = await ref.get();
    if(!snap.exists) return { sent: 0, reason: 'no-customer' };
    const tokens = tokensFor(snap.data(), notice.brand);
    if(!tokens.length) return { sent: 0, reason: 'no-tokens' };
    const res = await deps.messaging.sendEachForMulticast({
      tokens,
      notification: { title: notice.title, body: notice.body },
      // data.url = اللي الـService Worker بيقراه في notificationclick (نفس `?rate=`)
      data: { url: notice.link, tag: notice.tag },
      webpush: {
        notification: { title: notice.title, body: notice.body, dir: 'rtl', lang: 'ar', tag: notice.tag, data: { url: notice.link } },
        fcmOptions: { link: notice.link },
      },
    });
    return { sent: (res && res.successCount) || 0, reason: 'ok' };
  }catch(e){
    console.error('spendNotice', e && e.message);
    return { sent: 0, reason: 'error' };
  }
}

module.exports = { buildPointsNotice, buildCreditNotice, buildCreditAddNotice, tokensFor, sendNotice, brandOfBranch, invLink, GLOW_BRANCHES };
