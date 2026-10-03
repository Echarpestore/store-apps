// v710 — تابلت التقييم بالعرض: الكيبورد كان مغطّي خانة الاسم
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = path.join(__dirname, '..', 'feedback');
const html = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(R, 'cap-name.js'), 'utf8');
const css = fs.readFileSync(path.join(R, 'cap-name.css'), 'utf8');
require('child_process').execFileSync(process.execPath, ['--check', path.join(R, 'cap-name.js')]);

// الدالة الحقيقية للتحقق من الاسم
const ctx = { window:{}, document:{ readyState:'loading', addEventListener(){} }, String, Math, setTimeout, MutationObserver: function(){ return { observe(){} }; } };
vm.createContext(ctx); vm.runInContext(js, ctx);
const valid = ctx.window.capNameValid;
assert(valid('منة') && valid('Ali') && valid('  نور  '), 'اسم من حرفين أو أكتر مقبول');
assert(!valid('م') && !valid('   ') && !valid(''), 'سلبي: حرف واحد أو فاضي = مرفوض (هزة بدل الإرسال)');
assert(valid('م ن'), 'حرفين بينهم مسافة = مقبول');

// الكيبورد
assert(/interactive-widget=resizes-content/.test(html), 'أندرويد: الصفحة بتتقاس على الجزء الظاهر فوق الكيبورد');
assert(/visualViewport\.addEventListener\('resize', fit\)/.test(js) && /ov\.style\.height = vv\.height \+ 'px'/.test(js), 'الشاشة بتاخد ارتفاع الجزء الظاهر بالظبط');
assert(/_refH = Math\.max\(_refH, vv\.height, window\.innerHeight \|\| 0\)/.test(js) && /if\(w !== _refW\)\{ _refW = w; _refH = 0; \}/.test(js), 'كشف الكيبورد بيقارن بأطول ارتفاع لنفس العرض (والتلفيف بيصفّر)');
assert(/#capOverlay\.cn-kb \.cn-row\{ flex-direction:row;/.test(css), 'بالكيبورد: الخانة والزرار جنب بعض في سطر واحد');
assert(/#capOverlay\.cn-kb \.cn-flower, #capOverlay\.cn-kb #capPaneName \.cap-sub\{ display:none; \}/.test(css), 'بالكيبورد: الحاجات الزيادة بتختفي');

// الاسم الكبير والزرار
assert(/id="capNamePreview"/.test(html) && /id="capNamePreviewTxt"/.test(html), 'الاسم بيظهر كبير وهي بتكتب');
assert(/id="capNameOk"[^>]*disabled/.test(html), 'الزرار مقفول لحد ما الاسم يبقى صح');
assert(/window\.capNameTrySubmit \? capNameTrySubmit\(\) : capSubmitName\(\)/.test(html), 'لو الملف مااتحمّلش، الزرار لسه بيبعت بالطريقة القديمة');
assert(/e\.key === 'Enter'/.test(js), 'Enter = تم');
assert(/setAttribute\('data-pane', id \|\| ''\)/.test(html), 'الشاشة بتعرف هي على أنهي جزء (ستايل البراند)');
assert(/maxlength="40"/.test(html), 'سقف 40 حرف');

// منطق الإرسال نفسه متغيّرش
assert(/window\.capSubmitName = function\(\)\{\s*const nm = document\.getElementById\('capNameInput'\)\.value\.trim\(\);\s*if\(!nm \|\| !_capAskId\) return;/.test(html), 'سلبي: منطق الإرسال للكاشير زي ما هو');
assert(/'capPaneName'/.test(html) && /const _capPanes = \['capPanePhone','capPaneName','capPaneGreet','capPaneOtp'\];/.test(html), 'نفس قايمة الشاشات');

// التحميل والكاش
assert(html.indexOf('cap-name.css?v=710') > html.indexOf('kiosk-theme.css'), 'الستايل بعد ألوان البراند');
assert(/<script src="cap-name\.js\?v=710"><\/script>\s*<\/body>/.test(html), 'السكريبت آخر الصفحة');
assert(/feedback-shell-v7(1\d|[2-9]\d)/.test(fs.readFileSync(path.join(R, 'sw.js'), 'utf8')), 'كاش التابلت اترفع');
assert(/prefers-reduced-motion/.test(css) && !/animation:[^;]*(width|height|top|left)/.test(css.replace(/left:-50%|left:130%/g, '')), 'الحركة transform/opacity + احترام تقليل الحركة');
