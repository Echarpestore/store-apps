// ============================================================
// اختبار الإقلاع: sales-app.js يتنفذ كامل بدون crash،
// والدوال اللي الـ inline handlers محتاجاها متعرّضة على window
// (حماية من باج الـ cross-block scope المتكرر)
// ============================================================
'use strict';
const { loadSalesApp, loadSalesUi } = require('./helpers/load-sales');
const { sandbox: S } = loadSalesApp();

// أهم التعريضات اللي الـ HTML بيعتمد عليها — لو واحدة اختفت في تعديل جاي الاختبار يقع
// (اللي بيتظبط جوه onSnapshot زي allShifts مش هنا — بيتملي وقت التشغيل الحقيقي بس)
const mustExpose = [
  'coverageOnDate','complianceCfg','approveReg','checkLeaveRequest',
  'closeLeaveReq','closeDaySummary','currentBranch',
  'avatarOf','AVATAR_CHOICES','openAvatarPicker',
];
for(const k of mustExpose){
  assert(S.window[k] !== undefined, `window.${k} متعرّض (cross-block safety)`);
}

// sales-ui.js يتنفذ في نفس السياق من غير crash ويعلّم اكتمال التحميل
loadSalesUi(S);
assert(S.window.__scriptFullyLoaded === true, '__scriptFullyLoaded = true بعد الـ UI block');
assert(typeof S.renderAnnouncementBanner === 'function', 'دوال الـ UI بتوصل للـ global scope');
