'use strict';
const fs=require('fs'), path=require('path');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'pos','chat-staff-ui.js'),'utf8');
const sales=fs.readFileSync(path.join(root,'sales','index.html'),'utf8');
const ssw=fs.readFileSync(path.join(root,'sales','sw.js'),'utf8');
const psw=fs.readFileSync(path.join(root,'pos','sw.js'),'utf8');

assert(ui.includes('id="ccCamera"') && ui.includes('capture="environment"'), 'v370: مدخل كاميرا مستقل يفتح الكاميرا الخلفية على الموبايل');
assert(ui.includes('id="ccFile"') && /id="ccFile" accept="image\/\*"/.test(ui), 'v370: اختيار الصور من الجهاز ما زال مستقلًا');
assert(ui.includes("ccPickImage(\\'camera\\')") && ui.includes("ccPickImage(\\'gallery\\')"), 'v370: زران منفصلان للكاميرا والمعرض');
assert(ui.includes('معاينة الصورة قبل الإرسال') && ui.includes('ccImgPreviewBox'), 'v370: الصورة المختارة تظهر في معاينة واضحة قبل الإرسال');
assert(ui.includes('🖼️ تغيير الصورة') && ui.includes('✖ إلغاء'), 'v370: يمكن تغيير الصورة أو إلغاؤها من المعاينة');
assert(/function onPickImage[\s\S]*CST\.imgData = data[\s\S]*ccImgPrev'\)\.style\.display = 'flex'/.test(ui), 'v370: اختيار/تصوير الصورة يجهز المعاينة فقط');
const pickBlock=(ui.match(/function onPickImage\(e\)[\s\S]*?\n  function ccImgClear\(\)/)||[''])[0];
assert(!/ccSend\s*\(/.test(pickBlock), 'v370: الصورة لا تُرسل تلقائيًا بعد التصوير أو الاختيار');
assert(sales.includes('../pos/chat-staff-ui.js?v=370'), 'v370: Sales يجبر تحميل واجهة الشات الجديدة');
assert(ssw.includes('store-apps-shell-v370'), 'v370: Sales service worker مرفوع لـ v370');
assert(psw.includes('store-apps-shell-v370'), 'v370: POS service worker مرفوع لـ v370 لأن ملف الشات مشترك');
