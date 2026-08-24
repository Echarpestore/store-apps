const fs=require('fs'), assert=require('assert');
const s=fs.readFileSync('pos/search.js','utf8');
[
  ['reads more results', s.includes('const GLOBAL_SEARCH_MAX = 15') && s.includes('.slice(0, GLOBAL_SEARCH_MAX)')],
  ['numeric search skips full customer cache', s.includes('_searchCustomersByPhone(phoneVariants)')],
  ['phone normalization variants', s.includes("add('20'+d.slice(1))") && s.includes("add('+20'+d.slice(1))")],
  ['customers and invoices parallel', s.includes('Promise.all([customersPromise, invoicesPromise])')],
  ['invoice phone variants queried', s.includes(".where('customerPhone','==', v)")],
  ['search sw v339', fs.readFileSync('pos/sw.js','utf8').includes('store-apps-shell-v339')]
].forEach(([name,ok])=>{assert.ok(ok,name); console.log('PASS',name)});
