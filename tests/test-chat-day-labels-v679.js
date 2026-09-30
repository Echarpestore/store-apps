// v679 — تواريخ الشات زي واتساب: فاصل يوم + طابع القايمة (بتوقيت القاهرة)
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const T = require(path.join(root, 'pos', 'chat-time.js'));

// الأربعاء 30-09-2026 16:56 القاهرة (UTC+3) = 13:56Z
const NOW = Date.UTC(2026, 8, 30, 13, 56);
const H = 3600000, D = 86400000;

assertEq(T.chatDayLabel(NOW - 2 * H, NOW), 'النهاردة', 'نفس اليوم = النهاردة');
assertEq(T.chatDayLabel(NOW - 1 * D, NOW), 'إمبارح', 'أمس = إمبارح');
// 00:30 القاهرة النهاردة = 21:30Z إمبارح — لازم يتحسب «النهاردة» بتوقيت القاهرة مش UTC
assertEq(T.chatDayLabel(Date.UTC(2026, 8, 29, 21, 30), NOW), 'النهاردة', 'حد اليوم بتوقيت القاهرة مش UTC');
// 23:30 القاهرة إمبارح = 20:30Z إمبارح
assertEq(T.chatDayLabel(Date.UTC(2026, 8, 29, 20, 30), NOW), 'إمبارح', 'قبل نص الليل بالقاهرة = إمبارح');
const twoDays = T.chatDayLabel(NOW - 2 * D, NOW);
assert(/الاثنين|الإثنين/.test(twoDays) && /28/.test(twoDays.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))), 'خلال الأسبوع = اسم اليوم + التاريخ: ' + twoDays);
const tenDays = T.chatDayLabel(NOW - 10 * D, NOW);
assert(!/الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت|الإثنين/.test(tenDays) && /سبتمبر/.test(tenDays), 'أقدم من أسبوع = تاريخ من غير اسم يوم: ' + tenDays);
assert(!/2026|٢٠٢٦/.test(tenDays), 'نفس السنة = من غير سنة');
const lastYear = T.chatDayLabel(Date.UTC(2025, 0, 12, 10), NOW);
assert(/2025|٢٠٢٥/.test(lastYear), 'سنة تانية = بالسنة: ' + lastYear);
assertEq(T.chatDayLabel(0, NOW), '', 'من غير وقت = فاضي (سلبي)');
assertEq(T.chatDayLabel(null, NOW), '', 'null = فاضي (سلبي)');

// طابع القايمة
assertEq(T.chatListStamp(NOW - 2 * H, NOW), '٠٢:٥٦ م', 'القايمة النهاردة = الساعة بس');
assertEq(T.chatListStamp(NOW - D, NOW), 'إمبارح', 'القايمة أمس = إمبارح');
assert(/الاثنين|الإثنين/.test(T.chatListStamp(NOW - 2 * D, NOW)), 'القايمة خلال الأسبوع = اسم اليوم بس');
assertEq(T.chatListStamp(NOW - 10 * D, NOW), '20/9', 'القايمة أقدم = يوم/شهر');
assertEq(T.chatListStamp(Date.UTC(2025, 0, 12, 10), NOW), '12/1/2025', 'القايمة سنة تانية = يوم/شهر/سنة');
assertEq(T.chatListStamp(undefined, NOW), '', 'القايمة من غير وقت = فاضي (سلبي)');

// مفتاح اليوم: فرق يوم واحد = ١ بالظبط، ونفس اليوم = نفس المفتاح
assertEq(T.chatDayKey(NOW) - T.chatDayKey(NOW - D), 1, 'مفتاح اليوم بيزيد ١ كل يوم');
assertEq(T.chatDayKey(NOW), T.chatDayKey(Date.UTC(2026, 8, 29, 21, 30)), 'نفس يوم القاهرة = نفس المفتاح');
assert(T.chatDayKey(NOW) !== T.chatDayKey(Date.UTC(2026, 8, 29, 20, 30)), 'يوم قاهرة مختلف = مفتاح مختلف (سلبي)');

// التوصيل في الواجهة
const ui = fs.readFileSync(path.join(root, 'pos', 'chat-staff-ui.js'), 'utf8');
assert(ui.includes('class="ccDay"') && ui.includes('window.chatDayLabel('), 'renderThread بيحط فاصل اليوم');
assert(ui.includes('window.chatListStamp('), 'renderList بيستخدم طابع القايمة');
assert(ui.includes('.ccDay{'), 'ستايل الفاصل موجود');
for(const f of ['pos/index.html', 'Office/index.html', 'sales/index.html']){
  const h = fs.readFileSync(path.join(root, f), 'utf8');
  const i1 = h.indexOf('chat-time.js?v=679'), i2 = h.indexOf('chat-staff-ui.js?v=680');
  assert(i1 > 0 && i2 > i1, f + ': chat-time.js?v=679 قبل chat-staff-ui.js?v=680');
}
assert(/pos-shell-v75[2-9]|pos-shell-v7[6-9]\d/.test(fs.readFileSync(path.join(root, 'pos', 'sw.js'), 'utf8')), 'POS CACHE_NAME اترفع');
assert(/echarpe-office-v75\d/.test(fs.readFileSync(path.join(root, 'Office', 'sw.js'), 'utf8')), 'Office CACHE_NAME اترفع');
assert(/store-apps-shell-v62[4-9]/.test(fs.readFileSync(path.join(root, 'sales', 'sw.js'), 'utf8')), 'Sales CACHE_NAME اترفع');
