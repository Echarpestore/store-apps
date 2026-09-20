'use strict';
require('./helpers/swv');   // إصدار الكاش ≥ N بدل رقم مثبّت
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const sale = fs.readFileSync(path.join(ROOT,'pos','pos-sale.js'),'utf8');
const core = fs.readFileSync(path.join(ROOT,'pos','pos-core.js'),'utf8');
const rep  = fs.readFileSync(path.join(ROOT,'pos','pos-reports.js'),'utf8');
const sw   = fs.readFileSync(path.join(ROOT,'pos','sw.js'),'utf8');

function assert(ok, msg){ if(!ok) throw new Error(msg); console.log('PASS', msg); }
function extractFn(src, header){
  const i=src.indexOf(header); if(i<0) return '';
  const o=src.indexOf('{',i); let d=0;
  for(let k=o;k<src.length;k++){
    if(src[k]==='{') d++; else if(src[k]==='}'){ d--; if(d===0) return src.slice(i,k+1); }
  }
  return '';
}

// 1) Offline invoice number derives from Firestore-local random doc id, not Date.now only.
const offFn = extractFn(sale,'function offlineInvoiceNumberFromSaleId(');
assert(!!offFn, 'offline invoice helper موجود');
const sb={window:{},String}; vm.createContext(sb); vm.runInContext(offFn,sb);
const a=vm.runInContext("offlineInvoiceNumberFromSaleId('abcdefghijklmnopqrst')",sb);
const b=vm.runInContext("offlineInvoiceNumberFromSaleId('abcdefghijklmnopqrsZ')",sb);
assert(/^O[A-Z0-9]{10}$/.test(a), 'رقم الأوفلاين شكله ثابت ومقروء');
assert(a!==b, 'Document IDs مختلفة تطلع أرقام أوفلاين مختلفة');

const genFn = extractFn(sale,'async function generateInvoiceNumber(');
assert(/offlineInvoiceNumberFromSaleId\(fallbackSaleId\)/.test(genFn), 'fallback الأوفلاين مربوط بالـsale document id');
assert(!/Date\.now\(\)\.toString\(\)\.slice\(-8\)/.test(genFn), 'مفيش fallback مبني على Date.now فقط');

// 2) Sale document id generated before invoice identity and reused with set() (idempotent).
const savePos = sale.indexOf('const saleRef = db.collection(TEST_SALES).doc();');
const noPos = sale.indexOf('const invoiceNo = await generateInvoiceNumber(saleRef.id);');
const setPos = sale.indexOf('const _saleW = await _waitWrite(saleRef.set({');
assert(savePos>0 && noPos>savePos && setPos>noPos, 'هوية الفاتورة تتولد قبل الحفظ ويعاد استخدام نفس المستند');
assert(sale.includes('clientSaleId: saleRef.id'), 'clientSaleId محفوظ داخل الفاتورة للمراجعة');
assert(!sale.includes('db.collection(TEST_SALES).add({\n      invoiceNo,'), 'الحفظ الأساسي مش add عشوائي جديد كل retry');

// 3) Invoice code includes same sale id entropy.
assert(sale.includes('const invoiceCode = buildInvoiceCode(currentBranch, invoiceNo, saleRef.id);'), 'كود الفاتورة مربوط بنفس saleRef.id');

// 4) v708 — متابعة الكتابات المعلّقة: **تحذير مش منع** (قرار موثّق في pos-core + الـHANDOFF 4أ-6).
//    النسخة الأصلية كانت بتمنع الخروج والتقفيل؛ المنع مارجعش عمدًا، والتقفيل الأوفلاين له بانره وتأكيده.
const flush = extractFn(core,'async function posFlushPendingWrites(');
assert(/db\.waitForPendingWrites\(\)/.test(flush), 'المتابعة بتستعمل Firestore waitForPendingWrites');
assert(/__posPendingWritesKnown = false/.test(flush) && /__posPendingWritesKnown = true/.test(flush), 'العلامة بتتصفّر لما توصل وبتتعلّم لو لسه');
const logout = extractFn(core,'function logout(');
assert(!!logout && /__posPendingWritesKnown/.test(logout) && /showToast\(/.test(logout), 'الخروج بيحذّر لو فيه فواتير مترفعتش');
assert(!/^\s*async function logout/m.test(core) && !/if\(!sync\.ok\) return;/.test(logout), 'الخروج **مبيتمنعش** (فرع النت قاطع فيه مايتحبسش)');
// سلوك فعلي (الفحص النصي عدّى `return;` بعد التحذير في الاختبار السلبي — فبقى تشغيل حقيقي)
(function(){
  const st = { toasts:[], screen:'' };
  const c = { window:{ __posPendingWritesKnown:true }, currentEmployee:{id:'x'}, cart:[1], currentBranch:'Rehab',
    localStorage:{ getItem: () => 'Rehab' }, showToast: m => st.toasts.push(m), posFlushPendingWrites: () => Promise.resolve({ok:false}),
    refreshForeignBranchWarning(){}, backToEmployeePicker(){}, showScreen: x => { st.screen = x; } };
  vm.createContext(c); vm.runInContext(logout, c); c.logout();
  assert(st.toasts.length === 1, 'الخروج وفيه فواتير معلّقة: تحذير واحد');
  assert(c.currentEmployee === null && st.screen === 'loginScreen', 'والخروج **بيكمّل فعلًا** لشاشة الدخول (مبيتحبسش)');
  c.window.__posPendingWritesKnown = false; c.currentEmployee = {id:'y'}; st.toasts.length = 0; c.logout();
  assert(st.toasts.length === 0 && c.currentEmployee === null, 'من غير معلّق: خروج عادي من غير تحذير');
})();
assert(/addEventListener\('online'/.test(core) && /posFlushPendingWrites\(30000\)/.test(core), 'رجوع النت بيصفّر العلامة لوحده');
const close = extractFn(rep,'async function dcFinish(');
assert(/dcData\.fromCache/.test(close) && /await posConfirm\(/.test(close) && /return;/.test(close), 'تقفيل والنت قاطع = تأكيد إجباري جوّه الصفحة (4أ-6)');
// Electron: preventDefault في beforeunload بيمنع قفل النافذة بصمت — ممنوع يتربط بعلامة الـpending
const coreNC = core.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');   // §0: شيل التعليقات قبل أي فحص منع
const _bu = coreNC.split("addEventListener('beforeunload'").slice(1).map(function(x){ return extractFn(x, 'function('); });
assert(_bu.length >= 1 && _bu.every(function(h){ return h && !/preventDefault|returnValue/.test(h); }),
  'مفيش beforeunload فيه preventDefault/returnValue (بيحبس نافذة Electron بصمت)');

// 5) العلامة بتتعلّم من أي كتابة اتأجلت
assert(sale.includes('window.__posPendingWritesKnown = true;'), 'أي كتابة queued تعلّم pending state');
assert(swAtLeast(sw, 708), 'POS service worker v708+');

// 6) سلوك فعلي: الحفظ بمعرّف ثابت + رقم الأوفلاين — مش فحص نصوص بس
(async function(){
  const gen = extractFn(sale,'async function generateInvoiceNumber(');
  const bic = extractFn(sale,'function buildInvoiceCode(');
  function mk(online, txFails){
    const c = { window:{}, String, Promise, console:{warn(){}}, navigator:{ onLine: online }, currentBranch:'Rehab', TEST_SETTINGS:'s',
      branchCode: () => 'R', _raceTimeout: p => p,
      db:{ collection: () => ({ doc: () => ({}) }), runTransaction: async () => { if(txFails) throw new Error('net'); return 1234; } } };
    vm.createContext(c); vm.runInContext(offFn + '\n' + bic + '\n' + gen, c); return c;
  }
  let c = mk(true,false);
  assert((await c.generateInvoiceNumber('abcDEF123456xyz')) === '1234', 'أونلاين: الرقم المتسلسل زي ما هو');
  c = mk(false,false);
  const n1 = await c.generateInvoiceNumber('AAAAAAAAAAAAAAAAAAA1'), n2 = await c.generateInvoiceNumber('AAAAAAAAAAAAAAAAAAA2');
  assert(n1 !== n2 && /^O[A-Z0-9]{10}$/.test(n1), 'أوفلاين: جهازين في نفس اللحظة = رقمين مختلفين (مش من الساعة)');
  assert((await c.generateInvoiceNumber('AAAAAAAAAAAAAAAAAAA1')) === n1, 'نفس المستند = نفس الرقم (إعادة المحاولة ثابتة)');
  c = mk(true,true);
  assert(/^O/.test(await c.generateInvoiceNumber('zzzzzzzzzzQ9')), 'المعاملة فشلت والنت شكله شغال → برضه رقم من المعرّف');
  const code = c.buildInvoiceCode('Rehab', n1, 'AAAAAAAAAAAAAAAAAAA1');
  assert(/^FT[A-Z0-9-]+$/.test(code), 'كود الفاتورة لسه بيعدّي فلتر السكانر /^FT[A-Z0-9-]+$/ — ' + code);
  assert(!/Date\.now\(\)/.test(gen) && !/Date\.now\(\)/.test(bic), 'مفيش أي اعتماد على الساعة في الهوية');
  assert(/saleId: saleRef\.id/.test(sale) && !/_saleW\.value\.id/.test(sale), 'ربط الكاميرات بياخد المعرّف من saleRef (set مبيرجّعش مرجع)');
  assert(/POSLocalSearchCache\.upsertInvoice\(\{\s*id:saleRef\.id/.test(sale), 'الفاتورة بتدخل فهرس البحث المحلي بنفس المعرّف');
  console.log('Offline sale safety v339 (restored v708): all checks passed');
})().catch(function(e){ console.error('FAIL', e.message); process.exitCode = 1; });
