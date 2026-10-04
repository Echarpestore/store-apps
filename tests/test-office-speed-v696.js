// v696 — Office بطيء: كاش بلا حدود + كل البيانات بتتحمّل مع بعض أول ما يفتح
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const O = fs.readFileSync(path.join(__dirname, '..', 'Office', 'office.js'), 'utf8');
assert(!/CACHE_SIZE_UNLIMITED/.test(O) && /cacheSizeBytes: 150 \* 1024 \* 1024/.test(O), 'الكاش محدود (150MB) وبيتنضف لوحده — مش بلا حدود');
const sd = O.slice(O.indexOf('function startData(){'), O.indexOf('function loadSales(){'));
const deferred = ["collection('job_applications')", "collection('staff_docs')", "collection('staff_invites')", "collection('office_merchants')", "collection('office_merchant_txns')", "collection('sales_rewards')", "collection('gift_cards_public')", "collection('credit_ledger')", "collection('pos_test_inventory')"];
// كل واحدة جوّه ofLater: آخر «ofLater(function(){» قبلها أقرب من آخر «}, \d+);» قبلها
for(const k of deferred){
  const i = sd.indexOf(k), before = sd.slice(0, i);
  const open = before.lastIndexOf('ofLater(function(){'), close = before.search(/\}, \d{3,4}\);[^]*$/) ;
  const lastClose = (function(){ const m = [...before.matchAll(/\}, \d{3,4}\);/g)]; return m.length ? m[m.length - 1].index : -1; })();
  assert(open > -1 && open > lastClose, 'مؤجّلة لبعد أول شاشة: ' + k);
}
for(const k of ["collection('sales_leave_requests')", "collection('sales_shortages')", "collection('office_expenses')", "collection('sales_shifts').where('clockOutTs'", "collection('credit_requests')", "collection('sales_employees')"]){
  const i = sd.indexOf(k), before = sd.slice(0, i);
  const open = before.lastIndexOf('ofLater(function(){');
  const lastClose = (function(){ const m = [...before.matchAll(/\}, \d{3,4}\);/g)]; return m.length ? m[m.length - 1].index : -1; })();
  assert(open === -1 || lastClose > open, 'سلبي: الحاجات المهمة (الوارد، الفلوس، الحاضرين، الموظفين) على طول: ' + k);
}
assert(/loadSales\(\);/.test(sd), 'المبيعات على طول');
assert(/\$\('#hdrSub'\)\.onclick = function\(\)\{ ofPerfShow\(\); \}/.test(O), 'الضغط على «متوصّل ✅» بيفتح تقرير السرعة');
assert(/ofPerfAdd\('activity_log', 'server'/.test(O) && /ofPerfAdd\('sales30', 'cache'/.test(O), 'سجل النشاط والمبيعات بيتقاسوا');


// ===== v697: مؤشر التحميل =====
const OH = fs.readFileSync(path.join(__dirname, '..', 'Office', 'index.html'), 'utf8');
assert(/<div id="bootWait"><div class="bw-logo">/.test(OH) && /id="ofLoadBar"/.test(OH) && /id="ofLoadPill"/.test(OH), 'شاشة فتح + شريط + كبسولة');
assert(!/<div id="bootWait">⏳ لحظة…<\/div>/.test(OH), 'سلبي: «⏳ لحظة…» القديمة اتشالت');
assert(/prefers-reduced-motion:reduce\)\{ #bootWait \.bw-logo/.test(OH), 'الحركة بتقف لو الجهاز طالب حركة أقل');
// تشغيل حقيقي للمتابع: بيبان مع أول تحميل، بيعد صح، وبيختفي لما كله يخلص
const tr = O.slice(O.indexOf('var OF_LOAD_NAMES'), O.indexOf('})();', O.indexOf('window.ofLoad = (function(){')) + 5);
const els = {}; const mk = id => (els[id] = els[id] || { id, textContent:'', style:{}, classList:{ s:new Set(), add(c){ this.s.add(c); }, remove(c){ this.s.delete(c); }, contains(c){ return this.s.has(c); } }, querySelector(){ return mk(id + '_i'); } });
const timers = [];
const ctx2 = { window:{}, document:{ getElementById: mk }, Math, Object, setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout(){} };
vm.createContext(ctx2); vm.runInContext(tr, ctx2);
const L = ctx2.window.ofLoad;
L.begin('sales30'); L.begin('inventory'); L.begin('inventory');
assert(els.ofLoadBar.classList.contains('on') && els.ofLoadPill.classList.contains('on'), 'أول تحميل = الشريط والكبسولة ظاهرين');
assert(els.ofLoadTxt.textContent === 'بيجهّز: المخزون' && els.ofLoadN.textContent === '0/2', 'الكبسولة بالعربي والعدد صح (نفس البيانات مرتين = مرة)');
L.end('sales30');
assert(els.ofLoadN.textContent === '1/2' && els.ofLoadBar_i.style.width === '50%', 'الشريط اتملا لنصه');
L.end('inventory'); L.end('inventory');
assert(els.ofLoadBar_i.style.width === '100%', 'كله خلص = 100%');
timers.forEach(f => f());
assert(!els.ofLoadBar.classList.contains('on') && !els.ofLoadPill.classList.contains('on'), 'وبيختفوا بعدها');
assert(/window\.ofLoad\.begin\(key\);/.test(O) && /\.then\(function\(\)\{ window\.ofLoad\.end\(key\); \}\);/.test(O), 'كل تحميل «من الجهاز الأول» متتبَّع (ومبيعلقش لو فشل)');
assert(/\} finally \{ window\.ofLoad\.end\('activity_log'\); \}/.test(O), 'سجل النشاط: المؤشر بيخلص حتى لو التحميل وقع');
