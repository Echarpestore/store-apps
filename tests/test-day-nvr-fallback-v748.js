const fs=require('fs'),assert=require('assert');
const s=fs.readFileSync(__dirname+'/../Office/cctv.js','utf8');
assert(s.includes("var nvrHistorical=(canTryHistoricalNvr&&"),'Madinaty Camera 4 historical fallback missing');
assert(s.includes("coverageStart=dayReviewBounds.start;coverageEnd=dayReviewBounds.end"),'old day must not be rejected by local range');
assert(s.includes("range8=null; // Camera 8 historical NVR mapping is not verified yet."),'must not pretend historical Camera 8 works');
assert(s.includes("var duration=nvrHistorical?30:"),'historical fetch should use compact 30s clip');
assert(s.includes("NVR مدينتي · تحميل عند الطلب"),'UI must identify on-demand NVR mode');
assert(s.includes("Number(firstEvent.atMs)-(nvrHistorical?5000:10000)"),'old basket day should start near first basket event');
console.log('DAY_NVR_FALLBACK_V748=PASS');
