/* ============================================================
   💬 chat-core.js — شات العميلة ↔ الفرع (المنطق الصافي)
   ------------------------------------------------------------
   ⚠️ **معزول تمامًا عن مسار البيع** — نفس قاعدة `pos/chat.js`:
      "لو أي حاجة هنا وقعت، الكاشير شغال عادي."

   🔴 أخطر حاجة في الشات مش تقنية — **الرسالة اللي محدش يرد عليها**.
      شات متساب من غير رد أوحش من إنه مايبقاش موجود، لأن العميلة
      بتحس إنها اتجاهلت. عشان كده نص الملف ده عن المواعيد والتنبيه.
   ============================================================ */

/* 🕐 مواعيد الرد — نفس مواعيد المحل (قرار المالك: ١٠ لـ١٠)
   ⚠️ بتوقيت القاهرة إجباري: المالك بيتابع من البرازيل، ولو حسبنا
      بساعة الجهاز الرد الآلي هيشتغل في عز الشغل. */
const CHAT_HOURS = { open: 10, close: 22 };

function chatCairoHour(ts){
  try{
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo', hour: 'numeric', hour12: false });
    return Number(f.format(new Date(Number(ts) || Date.now())));
  }catch(e){ return new Date(Number(ts) || Date.now()).getHours(); }
}

function chatIsOpen(ts, cfg){
  const c = cfg || {};
  const o = Number(c.open != null ? c.open : CHAT_HOURS.open);
  const cl = Number(c.close != null ? c.close : CHAT_HOURS.close);
  const h = chatCairoHour(ts);
  return h >= o && h < cl;
}

/* 🤖 رد آلي بره المواعيد
   ⚠️ بيتبعت **مرة واحدة لكل فترة إغلاق** — مش مع كل رسالة.
      العميلة اللي بتبعت ٥ رسايل بالليل متستحقش ٥ ردود آلية،
      دي بتبان كأن النظام بيتريّق. */
function chatAutoReply(conv, ts, cfg){
  if(chatIsOpen(ts, cfg)) return null;
  const last = Number(conv && conv.autoReplyAt) || 0;
  // اتبعت خلاص في نفس فترة الإغلاق دي؟
  if(last && chatIsOpen(last, cfg) === false
     && (Number(ts) - last) < 12 * 3600000) return null;
  const c = cfg || {};
  const o = Number(c.open != null ? c.open : CHAT_HOURS.open);
  return 'أهلاً بيكي في echarpe 🤍 بنرد من الساعة '
    + o + ' الصبح لـ' + (Number(c.close != null ? c.close : CHAT_HOURS.close) - 12)
    + ' بالليل. سيبي رسالتك وأول ما نفتح نرد عليكي فورًا 🌸';
}

/* ⏰ الرسالة مستنية بقالها كتير؟
   بترجّع مستوى التنبيه — ده اللي بيمنع الرسالة من إنها تتنسى.
     'ok'   → لسه بدري
     'warn' → عدّى وقت الرد المتوقع
     'late' → متأخرة قوي، لازم تصعيد للمالك
   ⚠️ الوقت بيتحسب **بساعات الشغل بس**. رسالة جت ١١ بالليل مش
      متأخرة الساعة ٩ الصبح — المحل كان قافل. من غير الحسبة دي،
      كل رسالة بتيجي بالليل بتبان حمرا الصبح والتنبيه بيفقد معناه. */
const CHAT_WARN_MIN = 20;
const CHAT_LATE_MIN = 60;

function chatOpenMinutesBetween(from, to, cfg){
  const c = cfg || {};
  const o = Number(c.open != null ? c.open : CHAT_HOURS.open);
  const cl = Number(c.close != null ? c.close : CHAT_HOURS.close);
  let mins = 0;
  const step = 5 * 60000;              // كل ٥ دقايق — دقة كفاية ورخيصة
  for(let t = Number(from); t < Number(to); t += step){
    const h = chatCairoHour(t);
    if(h >= o && h < cl) mins += 5;
  }
  return mins;
}

function chatWaitLevel(conv, nowTs, cfg){
  if(!conv || !conv.unreadStaff) return { level:'ok', mins:0 };
  const since = Number(conv.lastAt) || 0;
  if(!since) return { level:'ok', mins:0 };
  const now = Number(nowTs) || Date.now();
  const mins = chatOpenMinutesBetween(since, now, cfg);
  if(mins >= CHAT_LATE_MIN) return { level:'late', mins: mins };
  if(mins >= CHAT_WARN_MIN) return { level:'warn', mins: mins };
  return { level:'ok', mins: mins };
}

/* 🏢 الفرع الافتراضي للعميلة
   قرار المالك: **آخر فرع اشترت منه** — قابل للتغيير.
   ⚠️ لو مفيش تاريخ شرا، بنرجّع null مش أول فرع في القايمة —
      التخمين هنا معناه رسالة بتروح لفرع مالوش علاقة. */
function chatDefaultBranch(sales, phone){
  if(!phone) return null;
  let best = null, bestTs = 0;
  (sales || []).forEach(function(s){
    if(!s || s.customerPhone !== phone) return;
    const ts = Number(s.createdAtMs)
      || (s.createdAt && s.createdAt.toMillis ? s.createdAt.toMillis() : 0);
    if(ts > bestTs && s.branch){ bestTs = ts; best = s.branch; }
  });
  return best;
}

/* ✅ الرسالة صالحة للإرسال؟ */
const CHAT_MAX_LEN = 500;
function chatValidate(text, conv){
  const t = String(text == null ? '' : text).trim();
  if(!t) return { ok:false, msg:'اكتبي رسالة' };
  if(t.length > CHAT_MAX_LEN) return { ok:false, msg:'الرسالة طويلة قوي' };
  // 🚫 الحظر — الموظفة معرّضة للأذى في شات مباشر، والمالك لازم
  //    يقدر يقفل رقم. الفحص هنا عشان يشتغل في الطرفين.
  if(conv && conv.blocked === true) return { ok:false, msg:'مش متاح' };
  return { ok:true, text: t };
}

/* 🧹 التنضيف التلقائي — TTL زي `pos_chat`
   ⚠️ الشات بيكبر بلا حدود، والقراءات بتكبر معاه. */
const CHAT_TTL_DAYS = 60;
function chatExpireAt(ts){
  return (Number(ts) || Date.now()) + CHAT_TTL_DAYS * 86400000;
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = { chatIsOpen, chatCairoHour, chatAutoReply, chatWaitLevel,
    chatOpenMinutesBetween, chatDefaultBranch, chatValidate, chatExpireAt,
    CHAT_HOURS, CHAT_WARN_MIN, CHAT_LATE_MIN, CHAT_MAX_LEN, CHAT_TTL_DAYS };
}
if(typeof window !== 'undefined'){
  window.chatIsOpen = chatIsOpen;
  window.chatAutoReply = chatAutoReply;
  window.chatWaitLevel = chatWaitLevel;
  window.chatDefaultBranch = chatDefaultBranch;
  window.chatValidate = chatValidate;
  window.chatExpireAt = chatExpireAt;
}
