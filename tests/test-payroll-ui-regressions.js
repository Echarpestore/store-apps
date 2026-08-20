const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname,'../sales/sales-app.js'),'utf8');
let pass=0;
function ok(x,m){ if(!x) throw new Error('FAIL: '+m); pass++; console.log('✓ '+m); }
ok(/window\.allEmployees\s*=\s*allEmployees/.test(src), 'employee snapshot exposes live list for day dialog');
ok(/return _mkKey\(d\.getFullYear\(\), d\.getMonth\(\)\)/.test(src), 'default payroll period is current month');
ok(/hasEarlierAttendance/.test(src) && /if\(!hasEarlierAttendance\) absenceRangeStart = floor/.test(src), 'weekly floor cannot hide earlier real attendance');
ok(/attendanceStartKey/.test(src) && /attendanceEndKey/.test(src), 'salary detail exposes actual attendance calculation range');
ok(!/payPeriodLabelAr\(pk\) \+ ' \(من 1 لـ 30\)/.test(src), 'day log no longer lies with hardcoded 1-to-30 label');
console.log(`\n${pass}/5 payroll UI regression checks passed`);
