const fs=require('fs'), assert=require('assert');
const app=fs.readFileSync('pos/app.js','utf8');
const sw=fs.readFileSync('pos/sw.js','utf8');
assert(app.includes("if(e.key === 'F9')"), 'F9 shortcut missing');
assert(app.includes("if(typeof openCashDrawer === 'function') openCashDrawer();"), 'F9 must reuse openCashDrawer');
assert(app.indexOf("if(e.key === 'F9')") > app.indexOf("if(!_onSaleScreen()) return;"), 'F9 must be sale-screen scoped');
const _swv=Number((sw.match(/store-apps-shell-v(\d+)/)||[])[1]||0); assert(_swv>=364,'SW must be v364 or newer');
console.log('PASS F9 cash drawer v364');
