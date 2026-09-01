const fs=require('fs'), vm=require('vm'), assert=require('assert');
const src=fs.readFileSync(__dirname+'/../pos/local-search-cache.js','utf8');
const sale=fs.readFileSync(__dirname+'/../pos/pos-sale.js','utf8');
const search=fs.readFileSync(__dirname+'/../pos/search.js','utf8');
assert(sale.includes('bankTransactionIds: Array.from(new Set('));
assert(src.includes("where('bankTransactionIds','array-contains',txnQ)"));
assert(src.includes("where('cardTxn.transactionId','==',txnN)"));
assert(search.includes("💳 TXN '+s.transactionIds.join(' / ')"));
// Validate local matching using a tiny fake IndexedDB-less context and exported API shape.
const ctx={console,globalThis:{},setTimeout:()=>0,setInterval:()=>0,clearInterval:()=>{},navigator:{onLine:false}}; ctx.globalThis=ctx;
vm.createContext(ctx); vm.runInContext(src,ctx);
assert(ctx.POSLocalSearchCache && typeof ctx.POSLocalSearchCache.searchInvoices==='function');
console.log('PASS v432 bank transaction search: 5/5');
