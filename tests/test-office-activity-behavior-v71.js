const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../Office/office.js','utf8');
const start=src.indexOf('function ofActBehaviorInsights');
const end=src.indexOf('window.ofActBehaviorInsights=ofActBehaviorInsights;',start);
assert(start>=0&&end>start,'behavior intelligence function missing');
const code=src.slice(start,end)+'\nthis.ofActBehaviorInsights=ofActBehaviorInsights;';
const ctx={ofActLabel:(t)=>t}; vm.createContext(ctx); vm.runInContext(code,ctx);
const DAY=86400000, now=10*DAY;
function e(daysAgo,type,employee,branch){return {ts:now-daysAgo*DAY,type,employeeName:employee,branch};}
// Baseline: 3 discounts over six prior days => ~0.6/day; today 3 => > 2x.
let rows=[e(2,'manual_discount','Mona','Rehab'),e(4,'manual_discount','Mona','Rehab'),e(6,'manual_discount','Mona','Rehab'),
 e(.1,'manual_discount','Mona','Rehab'),e(.2,'manual_discount','Mona','Rehab'),e(.3,'manual_discount','Mona','Rehab')];
let out=ctx.ofActBehaviorInsights(rows,now);
assert(out.some(x=>x.dimension==='employee'&&x.name==='Mona'&&x.type==='manual_discount'),'employee spike not detected');
assert(out.some(x=>x.dimension==='branch'&&x.name==='Rehab'),'branch spike not detected');
// One isolated event must not accuse/flag behavior.
rows=[e(3,'manual_drawer_open','Sara','City'),e(.1,'manual_drawer_open','Sara','City')];
out=ctx.ofActBehaviorInsights(rows,now);
assert.strictEqual(out.length,0,'single event should not create behavioral alert');
// New pattern requires 3 occurrences.
rows=[e(3,'sale_saved','Sara','City'),e(.1,'manual_drawer_open','Sara','City'),e(.2,'manual_drawer_open','Sara','City'),e(.3,'manual_drawer_open','Sara','City')];
out=ctx.ofActBehaviorInsights(rows,now);
assert(out.some(x=>x.type==='manual_drawer_open'),'new repeated pattern not detected');
// Ordinary sales are intentionally excluded.
rows=[e(3,'sale_saved','Sara','City'),e(.1,'sale_saved','Sara','City'),e(.2,'sale_saved','Sara','City'),e(.3,'sale_saved','Sara','City')];
assert.strictEqual(ctx.ofActBehaviorInsights(rows,now).length,0,'ordinary sales should not be behavioral alerts');
console.log('PASS test-office-activity-behavior-v71');
