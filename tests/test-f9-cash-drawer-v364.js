const fs=require('fs'), assert=require('assert');
const app=fs.readFileSync('pos/app.js','utf8');
const sw=fs.readFileSync('pos/sw.js','utf8');
assert(app.includes("if(e.key === 'F9')"), 'F9 shortcut missing');
assert(app.includes("if(typeof openCashDrawer === 'function') openCashDrawer();"), 'F9 must reuse openCashDrawer');
assert(app.indexOf("if(e.key === 'F9')") > app.indexOf("if(!_onSaleScreen()) return;"), 'F9 must be sale-screen scoped');
assert(sw.includes('store-apps-shell-v364'), 'SW must be v364');
console.log('PASS F9 cash drawer v364');
