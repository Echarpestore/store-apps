/* ============================================================
   🕒 chat-time.js — تواريخ الشات زي واتساب (v679)
   ------------------------------------------------------------
   الشات كان بيكتب الساعة بس (٠٢:١٥ م) — مفيش يوم ولا تاريخ، فرسالة
   من أسبوع شكلها زي رسالة النهاردة. الملف ده منطق خالص من غير DOM:
   - chatDayLabel(ts, now)  → فاصل اليوم جوه المحادثة:
        «النهاردة» · «إمبارح» · «الثلاثاء ٢٩ سبتمبر» · «١٢ يناير ٢٠٢٥» (سنة تانية)
   - chatListStamp(ts, now) → الطابع في قايمة المحادثات:
        النهاردة = الساعة · إمبارح = «إمبارح» · آخر ٧ أيام = اسم اليوم · أقدم = «٢٩/٩»
   - chatDayKey(ts)         → مفتاح اليوم بتوقيت القاهرة (عشان نعرف اليوم اتغيّر بين رسالتين)
   كل الحسابات بتوقيت **القاهرة** مهما كانت ساعة الجهاز (المالك بيفتح من بره أحيانًا).
   ملف مشترك: pos · Office · sales (نفس قرار chat-staff-ui — نسخة واحدة).
   ============================================================ */
(function(){
  'use strict';
  var TZ = 'Africa/Cairo';
  var DAY_MS = 86400000;

  function parts(ts){
    var d = new Date(Number(ts) || 0);
    var f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
    var o = {};
    f.forEach(function(p){ if(p.type !== 'literal') o[p.type] = p.value; });
    return { y: +o.year, m: +o.month, d: +o.day };
  }

  // مفتاح يوم القاهرة — رقم صحيح بيزيد ١ كل يوم، فالفرق بين مفتاحين = عدد الأيام
  function chatDayKey(ts){
    var p = parts(ts);
    return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / DAY_MS);
  }

  function arDate(ts, withYear){
    return new Intl.DateTimeFormat('ar-EG', Object.assign({ timeZone: TZ, day: 'numeric', month: 'long' },
      withYear ? { year: 'numeric' } : {})).format(new Date(Number(ts)));
  }
  function arWeekday(ts){
    return new Intl.DateTimeFormat('ar-EG', { timeZone: TZ, weekday: 'long' }).format(new Date(Number(ts)));
  }
  function arTime(ts){
    return new Intl.DateTimeFormat('ar-EG', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(Number(ts)));
  }

  function chatDayLabel(ts, nowTs){
    if(!ts) return '';
    var now = Number(nowTs) || Date.now();
    var diff = chatDayKey(now) - chatDayKey(ts);
    if(diff === 0) return 'النهاردة';
    if(diff === 1) return 'إمبارح';
    var sameYear = parts(ts).y === parts(now).y;
    if(diff > 1 && diff < 7) return arWeekday(ts) + ' ' + arDate(ts, false);
    return arDate(ts, !sameYear);
  }

  function chatListStamp(ts, nowTs){
    if(!ts) return '';
    var now = Number(nowTs) || Date.now();
    var diff = chatDayKey(now) - chatDayKey(ts);
    if(diff === 0) return arTime(ts);
    if(diff === 1) return 'إمبارح';
    if(diff > 1 && diff < 7) return arWeekday(ts);
    var p = parts(ts), pn = parts(now);
    return p.d + '/' + p.m + (p.y === pn.y ? '' : '/' + p.y);
  }

  var api = { chatDayKey: chatDayKey, chatDayLabel: chatDayLabel, chatListStamp: chatListStamp, chatTime: arTime };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  if(typeof window !== 'undefined'){
    window.chatDayKey = chatDayKey;
    window.chatDayLabel = chatDayLabel;
    window.chatListStamp = chatListStamp;
  }
})();
