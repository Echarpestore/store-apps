const fs=require('fs'), assert=require('assert');
const s=fs.readFileSync('pos/search.js','utf8');
const c=fs.readFileSync('pos/local-search-cache.js','utf8');
[
  ['reads more results', s.includes('const GLOBAL_SEARCH_MAX = 15')],
  ['typing is local-only', s.includes('allowRemoteFallback:false') && !s.includes('db.collection(')],
  ['phone normalization lives in local cache', c.includes('function _phoneVariants')],
  ['Enter-only remote fallback', s.includes("e.key !== 'Enter'") && s.includes('allowRemoteFallback:true')],
  ['invoice/customer local search', s.includes('searchCustomers(q, GLOBAL_SEARCH_MAX)') && s.includes('searchInvoices(q, GLOBAL_SEARCH_MAX)')],
  ['search sw v340', fs.readFileSync('pos/sw.js','utf8').includes('store-apps-shell-v340')]
].forEach(([name,ok])=>{assert.ok(ok,name); console.log('PASS',name)});
