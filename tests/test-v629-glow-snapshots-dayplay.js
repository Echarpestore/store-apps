const fs=require('fs'),assert=require('assert');
const c=fs.readFileSync(__dirname+'/../Office/cctv.js','utf8');
const i=fs.readFileSync(__dirname+'/../Office/index.html','utf8');
const sw=fs.readFileSync(__dirname+'/../Office/sw.js','utf8');

assert(c.includes('var valid=localGlow?order.slice()'),'Glow legacy snapshots use branch-local endpoint as source of truth');
assert(c.includes('var valid=localBranch?order.slice()'),'authoritative local snapshots use endpoint as source of truth');
assert(c.includes('Math.max(coverageStart,coverageEnd-90000)'),'day playback avoids empty day-boundary start');
assert(c.includes('لا يوجد تسجيل في هذه الدقيقة — الانتقال تلقائيًا لأقرب جزء متاح'),'Glow day gap recovery present');
assert(c.includes("data-pb-latest"),'Glow normal playback has latest-recording recovery');
assert(c.includes("endMs-step-10000"),'latest playback uses range end');
assert(i.includes('cctv.js?v=629'),'Office cctv version bumped');
assert(sw.includes("echarpe-office-v629"),'Office SW cache bumped');
console.log('GLOW_SNAPSHOTS_DAYPLAY_V629=PASS');
