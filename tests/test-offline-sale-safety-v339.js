'use strict';
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

// 4) Pending-write guard exists and blocks logout/day-close until server ack.
const flush = extractFn(core,'async function posFlushPendingWrites(');
assert(/db\.waitForPendingWrites\(\)/.test(flush), 'Sync Guard يستعمل Firestore waitForPendingWrites');
const logout = extractFn(core,'async function logout(');
assert(/await posRequireSynced\('الخروج'/.test(logout), 'Logout يستنى تأكيد المزامنة');
assert(/if\(!sync\.ok\) return;/.test(logout), 'Logout يتوقف لو المزامنة لم تتأكد');
const close = extractFn(rep,'async function dcFinish(');
assert(/await posRequireSynced\('تقفيل اليوم'/.test(close), 'تقفيل اليوم يستنى تأكيد المزامنة');
assert(/if\(!sync\.ok\) return;/.test(close), 'تقفيل اليوم يتوقف مع pending writes');
assert(/dcData\.fromCache/.test(close) && /return;/.test(close), 'تقفيل اليوم لا يعتمد على أرقام cache ناقصة');

// 5) Browser-close warning + pending marker from queued writes.
assert(core.includes("window.addEventListener('beforeunload'"), 'فيه تحذير قبل قفل التاب لو pending معروف');
assert(sale.includes('window.__posPendingWritesKnown = true;'), 'أي كتابة queued تعلّم pending state');
assert(/store-apps-shell-v339/.test(sw), 'POS service worker v339');

console.log('Offline sale safety v339: all checks passed');
