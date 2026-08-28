const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(ROOT,'pos/app.js'),'utf8');
const sale=fs.readFileSync(path.join(ROOT,'pos/pos-sale.js'),'utf8');
const sw=fs.readFileSync(path.join(ROOT,'pos/sw.js'),'utf8');
function ok(v,m){ if(!v) throw new Error(m); }
ok(/function preOpenCashDrawerForSale\(invoiceCode, payments\)/.test(app),'early drawer helper missing');
ok(/preOpenCashDrawerForSale\(invoiceCode, payments\)[\s\S]{0,250}db\.collection\(TEST_SALES\)\.add/.test(sale),'drawer must be requested before sale Firestore write');
ok(/_drawerViaPrint = drawerTarget && !_hasDrawerApi/.test(app),'print fallback must be limited to old shells');
ok(/openDrawer: _drawerViaPrint/.test(app) && /openCashDrawer: _drawerViaPrint/.test(app),'print fallback flags missing');
ok(/_cashDrawerPreopenedInvoiceCode/.test(app),'per-invoice duplicate drawer guard missing');
ok(sw.includes('store-apps-shell-v372'),'service worker not v372');
console.log('PASS cash drawer immediate v372');
