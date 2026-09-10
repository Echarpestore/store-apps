const fs=require('fs'),assert=require('assert');
const c=fs.readFileSync(__dirname+'/../Office/cctv.js','utf8');
const i=fs.readFileSync(__dirname+'/../Office/index.html','utf8');
const sw=fs.readFileSync(__dirname+'/../Office/sw.js','utf8');

assert(c.includes("var useMse=b().id==='glow'?false:"),'Glow camera wall bypasses black MSE viewer');
assert(c.includes("useMse=x.id==='glow'?false:"),'Glow all-branches card bypasses black MSE viewer');
assert(c.includes("data-live-branch"),'JPEG player receives branch identity');
assert(c.includes("delay=branchId==='glow'?500:900"),'Glow JPEG refresh is ~2fps');
assert(c.includes("/api/frame.jpeg?src="),'proven JPEG endpoint preserved');
assert(c.includes("((q===480&&x.id!=='glow')?'&mode=fast':'')"),'v630 playback fix preserved');
assert(c.includes("var valid=localBranch?order.slice()"),'v629 snapshot fix preserved');
assert(i.includes('cctv.js?v=633'),'Office cctv ref bumped');
assert(sw.includes("echarpe-office-v633"),'Office SW cache bumped');
console.log('GLOW_LIVE_JPEG_FALLBACK_V633=PASS');
