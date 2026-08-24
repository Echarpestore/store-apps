const fs = require('fs');
const nodeAssert = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const search = fs.readFileSync(path.join(ROOT,'pos','search.js'),'utf8');
const cache = fs.readFileSync(path.join(ROOT,'pos','local-search-cache.js'),'utf8');
const sale = fs.readFileSync(path.join(ROOT,'pos','pos-sale.js'),'utf8');
const profiles = fs.readFileSync(path.join(ROOT,'pos','profiles.js'),'utf8');
const index = fs.readFileSync(path.join(ROOT,'pos','index.html'),'utf8');
const sw = fs.readFileSync(path.join(ROOT,'pos','sw.js'),'utf8');
const mod = require(path.join(ROOT,'pos','local-search-cache.js'));
function ok(cond,msg){ if(typeof global.assert==='function') global.assert(cond,msg); else nodeAssert.ok(cond,msg); console.log('PASS',msg); }

ok(/allowRemoteFallback:false/.test(search), 'الكتابة في البحث local-only');
ok(/keydown[\s\S]*Enter[\s\S]*allowRemoteFallback:true/.test(search), 'السيرفر fallback فقط عند Enter');
ok(!/db\.collection\(/.test(search), 'search.js نفسه لا يعمل Firestore query أثناء الكتابة');
ok(/indexedDB\.open/.test(cache) && /customers/.test(cache) && /invoices/.test(cache), 'IndexedDB search index موجود');
ok(/SYNC_EVERY_MS = 10 \* 60 \* 1000/.test(cache), 'background delta sync كل 10 دقائق');
ok(/FULL_CUSTOMER_REFRESH_MS = 24 \* 60 \* 60 \* 1000/.test(cache), 'full customer refresh يومي فقط');
ok(/where\('updatedAt','>',new Date\(from\)\)/.test(cache), 'customer delta يعتمد server updatedAt');
ok(/where\('createdAt','>',new Date\(from\)\)/.test(cache), 'invoice delta يعتمد server createdAt');
ok(/Merge فقط/.test(cache) && !/await _deleteBranch\(INVOICE_STORE,branch\)/.test(cache), 'full sync لا يمسح فاتورة أوفلاين محلية');
ok(/POSLocalSearchCache\?\.upsertInvoice/.test(sale), 'الفاتورة تدخل local search فور حفظها محليًا');
ok(/POSLocalSearchCache\?\.upsertCustomer/.test(sale), 'العميل يدخل local search بدون انتظار sync');
ok(/updatedAt: firebase\.firestore\.FieldValue\.serverTimestamp\(\)/.test(sale), 'customer writes لها server delta timestamp');
ok(/updatedAt: firebase\.firestore\.FieldValue\.serverTimestamp\(\)/.test(profiles), 'تعديل اسم العميل له server delta timestamp');
ok(index.indexOf('local-search-cache.js') >= 0 && index.indexOf('local-search-cache.js') < index.indexOf('search.js'), 'local cache يتحمل قبل search.js');
ok(/store-apps-shell-v340/.test(sw), 'POS service worker v340');

const vars = mod._phoneVariants('01144155987');
ok(vars.includes('01144155987') && vars.includes('201144155987'), 'phone variants محليًا');
ok(mod._normText('إيشارب أسود') === 'ايشارب اسود', 'Arabic normalization محليًا');
console.log('Local search cache v340: all checks passed');
