'use strict';
const fs=require('fs'), path=require('path');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'pos','chat-staff-ui.js'),'utf8');
const sales=fs.readFileSync(path.join(root,'sales','index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sales','sw.js'),'utf8');

assert(ui.includes("unreadHint.id = 'ccUnreadHint'"), 'v369: مؤشر دائم للرسائل غير المقروءة موجود');
assert(ui.includes("fab.classList.toggle('ccUnread', n > 0)"), 'v369: زر الشات ينبض طالما فيه رسائل غير مقروءة');
assert(ui.includes('ccAlertUnread(rows)'), 'v369: listener المحادثات يطلق تنبيه الرسالة الجديدة');
assert(ui.includes('n > prev') && ui.includes("c.lastFrom === 'cust'"), 'v369: التنبيه الفوري يحصل فقط عند زيادة unread من العميلة');
assert(ui.includes('120000'), 'v369: تذكير دوري كل دقيقتين طالما الرسائل لسه غير مقروءة');
assert(ui.includes("Notification.permission !== 'granted'") && ui.includes('new Notification('), 'v369: إشعار نظام عند السماح بإشعارات المتصفح');
assert(ui.includes('ccMaybeAskNotifications();'), 'v369: طلب إذن إشعارات النظام يحصل من ضغطة المستخدم على الشات');
assert(/weekday:\s*'long'/.test(ui) && /year:\s*'numeric'/.test(ui) && /month:\s*'2-digit'/.test(ui) && /day:\s*'2-digit'/.test(ui), 'v369: كل رسالة تعرض اليوم والتاريخ الكامل');
assert(/\.\.\/pos\/chat-staff-ui\.js\?v=(?:369|3[7-9]\d|[4-9]\d\d|\d{4,})/.test(sales), 'v369: Sales يحمل v369 أو أحدث من واجهة الشات');
assert(/store-apps-shell-v(?:369|3[7-9]\d|[4-9]\d\d|\d{4,})/.test(sw), 'v369: Sales service worker v369 أو أحدث');
