const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const sales = fs.readFileSync(path.join(root,'sales','sales-app.js'),'utf8');
const pos = fs.readFileSync(path.join(root,'pos','app.js'),'utf8');
const salesSw = fs.readFileSync(path.join(root,'sales','sw.js'),'utf8');
const posSw = fs.readFileSync(path.join(root,'pos','sw.js'),'utf8');

function ok(cond, msg){ if(!cond){ console.error('FAIL:', msg); process.exitCode=1; } else console.log('PASS:', msg); }

ok(sales.includes('function _firestoreSafeReceiptPayload(payload)'), 'salary print payload is normalized before Firestore');
ok(/lines:\s*\(Array\.isArray\(p\.lines\).*\.map\(row\)/s.test(sales), 'salary receipt lines become object rows, not nested arrays');
ok(/extra:\s*\(Array\.isArray\(p\.extra\).*\.map\(row\)/s.test(sales), 'salary receipt extra rows become object rows, not nested arrays');
ok(sales.includes('payload: _firestoreSafeReceiptPayload(buildSalaryReceiptPayload(emp, calc, periodLabel))'), 'queue writes only Firestore-safe salary payload');
ok(pos.includes('function _genericReceiptRowParts(row)'), 'POS generic receipt supports normalized rows');
ok(pos.includes("if(Array.isArray(row)) return [row[0] ?? '', row[1] ?? ''];"), 'POS keeps legacy array-row compatibility');
ok(pos.includes("return [row.label ?? '', row.value ?? ''];"), 'POS renders new object-row format');
ok(salesSw.includes("store-apps-shell-v367"), 'Sales SW is v367');
ok(posSw.includes("store-apps-shell-v367"), 'POS SW is v367');
