const fs = require('fs');
function must(cond, msg){ if(!cond){ console.error('FAIL:', msg); process.exitCode=1; } else console.log('PASS:', msg); }
const chat = fs.readFileSync(__dirname + '/../pos/chat-staff-ui.js','utf8');
const sales = fs.readFileSync(__dirname + '/../sales/sales-app.js','utf8');
const psw = fs.readFileSync(__dirname + '/../pos/sw.js','utf8');
const ssw = fs.readFileSync(__dirname + '/../sales/sw.js','utf8');
must(chat.includes("ccPickImage(\\'camera\\')"), 'camera button exists in shared chat composer');
must(chat.includes('id="ccCamera"') && chat.includes('capture="environment"'), 'camera uses dedicated capture input');
must(chat.includes("document.getElementById('ccCamera').onchange = onPickImage"), 'camera image uses existing compression/preview flow');
must(chat.includes("ccPickImage(\\'gallery\\')") && chat.includes('id="ccFile"'), 'gallery button still exists');
must(chat.includes('ccOutfitToggle()'), 'outfit button still exists');
must(chat.includes('onclick="ccSend()"'), 'send button still exists');
must(chat.includes("#ccCompose{flex:0 1 auto") && chat.includes('overflow-y:auto'), 'the complete composer remains vertically scrollable');
var bandCss=(chat.match(/#ccBandRow\{[^}]*\}/)||[''])[0];
must(bandCss && !/overflow-y\s*:\s*auto|max-height/.test(bandCss), 'bandana row does not trap mobile touch in nested scrolling');
must(sales.includes('getEmployees: function(col, branch)'), 'Sales bridge exposes employee names');
must(sales.includes("where('barcode','==',bc)"), 'new barcode lookup remains field-based');
must(Number((psw.match(/store-apps-shell-v(\d+)/)||[])[1])>=545, 'POS SW ships v545 or newer');
must(ssw.includes('store-apps-shell-v545'), 'Sales SW ships the v545 mobile composer fix');
// ⚠️ إصلاح: process.exit() هنا كان بيقفل عملية run.js كلها عند أول فشل،
// فيوقف تنفيذ كل ملفات الاختبار اللي بعده أبجديًا. الحل: throw عادي.
if(process.exitCode){
  throw new Error('test-chat-camera-stability-v384: فيه فحص فشل فوق');
}
console.log('v384 camera stability regression checks passed');
