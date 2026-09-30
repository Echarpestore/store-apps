// v625 — تشغيل sales-receive.js فعليًا (DOM مصغّر + API وهمي): موظفة → كود → سكان/كتابة → تأكيد
// ⚠️ المسار async والـrunner متزامن، فبيتشغّل في process منفصل ونتايجه بتتعد هنا.
'use strict';
const path = require('path');
const out = require('child_process').execFileSync(process.execPath,
  [path.join(__dirname, '_helpers', 'sales-receive-flow-run.js')], { encoding:'utf8' });
const res = JSON.parse(out);
assert(res.length >= 25, 'المسار اتشغّل كله (' + res.length + ' فحص)');
res.forEach(function(r){ assert(r[0], r[1]); });
