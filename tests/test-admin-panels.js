// ============================================================
// 🛡️ حماية دائمة: كل لوحة أدمن بترسم محتواها عند فتح الأدمن
// الباج الأصلي: الشارة بتقول 3 واللوحة فاضية، وبتظهر بعد خروج ودخول —
// لأن المحتوى كان بيترسم من الـ snapshot بس مش وقت الفتح.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const SALES = path.resolve(__dirname, '..', 'sales');
const appSrc = fs.existsSync(path.join(SALES,'sales-app.js'))
  ? fs.readFileSync(path.join(SALES,'sales-app.js'),'utf8')
  : fs.readFileSync(path.join(SALES,'index.html'),'utf8');

// 🔴 كان: regex بينتهي عند `renderViolationsReview();` — والكود اتعمله
// refactor لـ`_safe(()=> renderViolationsReview(), 'violations')` فالregex
// اتكسر وطلّع 13 فشل وهمي شكلهم باجات حقيقية. البلوك والدوال الـ12 كانوا
// موجودين طول الوقت.
// الحل (قاعدة §0): استخراج بالأقواس المتوازنة — البلوك بيمتد لآخر الدالة
// الحاوية مهما اتغيّر جواها.
function extractFn(src, name){
  const at = src.indexOf('function ' + name + '(');
  if(at < 0) return '';
  const open = src.indexOf('{', at);
  if(open < 0) return '';
  let depth = 0;
  for(let i = open; i < src.length; i++){
    const c = src[i];
    if(c === '{') depth++;
    else if(c === '}'){ depth--; if(depth === 0) return src.slice(at, i + 1); }
  }
  return '';
}
const block = extractFn(appSrc, 'doAdminLogin');
assert(block.length > 0, 'بلوك فتح الأدمن موجود');
assert(/adminUnlocked = true;/.test(block), 'وبيفتح الجلسة فعلًا');

// اللوحات اللي محتواها بيتقرا من بيانات حية — لازم كلها تترسم وقت الفتح
[
  'renderLeaveRequests',   // 📩 طلبات الإذن (ده اللي كان باظ)
  'renderTimeCreditLog',   // ⏳ رصيد الوقت
  'renderAttIssues',       // 🔍 المخالفات
  'renderPendingRegs',     // 🔒 طلبات التسجيل
  'renderDeductionsLog',   // 💸 الخصومات
  'renderStaffOverview',   // 👥 نظرة عامة
  'renderScheduleList',    // 🕐 المواعيد
  'renderCommissionPanel', // 💰 العمولات
  'renderSalaryPanel',     // 🧾 المرتبات
  'renderAdvancesLog',     // 💵 السلف
].forEach(fn=>{
  assert(block.includes(fn), `${fn} بيترسم عند فتح الأدمن`);
});

// الشارات لازم تتحدث وقت الفتح كمان (مش من الـ snapshot بس)
['updateLeaveBadge','updateRegBadge'].forEach(fn=>{
  assert(block.includes(fn), `${fn} بيتحدث عند فتح الأدمن`);
});

// 🚫 مفيش لوحتين ظاهرين بنفس العنوان
const html = fs.readFileSync(path.join(SALES,'index.html'),'utf8');
const panels = html.split('<div class="panel"');
const visibleWithTitle = panels.filter(p=>
  p.includes('🔍 مخالفات محتاجة مراجعتك') && !p.slice(0,60).includes('display:none'));
assert(visibleWithTitle.length === 1,
  `لوحة واحدة بس ظاهرة بعنوان "مخالفات محتاجة مراجعتك" (لقينا ${visibleWithTitle.length})`);
