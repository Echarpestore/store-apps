'use strict';
const fs=require('fs'),assert=require('assert');
const o=fs.readFileSync('Office/office.js','utf8');
const oh=fs.readFileSync('Office/index.html','utf8');
const s=fs.readFileSync('sales/sales-ui.js','utf8');
const sh=fs.readFileSync('sales/index.html','utf8');

assert(o.includes('Office Back UX v64'),'Office back manager');
assert(o.includes("officeNavV64:'page'"),'Office page history');
assert(o.includes("officeNavV64:'more'"),'Office More history');
assert(o.includes("ofGoPage('day',{fromHistory:true})"),'Office falls back to الرئيسية');
assert(oh.includes('office.js?v=71'),'Office cache bust v71');

assert(s.includes('SALES BACK UX v19'),'Sales back manager');
assert(s.includes("'invoiceOverlay'"),'Sales invoice layer covered');
assert(s.includes("'scannerOverlay'"),'Sales scanner layer covered');
assert(s.includes("'attendance'"),'Sales attendance layer covered');
assert(s.includes("'leaderboard'"),'Sales leaderboard layer covered');
assert(s.includes("'adminLoginGate'"),'Sales admin login layer covered');
assert(s.includes("window.showSalesAdminSection('overview',true)"),'Sales section back -> overview');
assert(s.includes("window.lockAdmin"),'Sales admin back closes/locks admin');
assert(s.includes("{[KEY]:'home'}"),'Sales stable home anchor');
assert(sh.includes('sales-ui.js?v=19'),'Sales UI cache bust');

console.log('Sales + Office Back UX: PASS');
