const fs = require('fs');
function must(cond, msg){ if(!cond){ console.error('FAIL:', msg); process.exitCode=1; } else console.log('PASS:', msg); }
const chat = fs.readFileSync(__dirname + '/../pos/chat-staff-ui.js','utf8');
const sales = fs.readFileSync(__dirname + '/../sales/sales-app.js','utf8');
const psw = fs.readFileSync(__dirname + '/../pos/sw.js','utf8');
const ssw = fs.readFileSync(__dirname + '/../sales/sw.js','utf8');
must(chat.includes('id="ccCameraBtn"'), 'camera button exists in shared chat composer');
must(chat.includes('id="ccCameraFile"') && chat.includes('capture="environment"'), 'camera uses dedicated capture input');
must(chat.includes("document.getElementById('ccCameraFile').onchange = onPickImage"), 'camera image uses existing compression/preview flow');
must(chat.includes("document.getElementById(\\'ccFile\\').click()") || chat.includes("document.getElementById('ccFile').click()"), 'gallery button still exists');
must(chat.includes('ccOutfitToggle()'), 'outfit button still exists');
must(chat.includes('onclick="ccSend()"'), 'send button still exists');
must(chat.includes("#ccBandRow{display:none") && chat.includes('overflow-y:auto'), 'bandana area remains vertically scrollable');
must(sales.includes('getEmployees: function(col, branch)'), 'Sales bridge exposes employee names');
must(sales.includes("where('barcode','==',bc)"), 'new barcode lookup remains field-based');
must(psw.includes('store-apps-shell-v385'), 'POS SW is v385 (camera/chat stability preserved)');
must(ssw.includes('store-apps-shell-v384'), 'Sales SW is v384');
// ⚠️ إصلاح: process.exit() هنا كان بيقفل عملية run.js كلها عند أول فشل،
// فيوقف تنفيذ كل ملفات الاختبار اللي بعده أبجديًا. الحل: throw عادي.
if(process.exitCode){
  throw new Error('test-chat-camera-stability-v384: فيه فحص فشل فوق');
}
console.log('v384 camera stability regression checks passed');
