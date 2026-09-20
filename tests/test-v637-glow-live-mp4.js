require('./helpers/swv');   // إصدار الكاش ≥ N بدل رقم مثبّت
const fs=require('fs'),assert=require('assert');
const c=fs.readFileSync(__dirname+'/../Office/cctv.js','utf8');
const i=fs.readFileSync(__dirname+'/../Office/index.html','utf8');
const sw=fs.readFileSync(__dirname+'/../Office/sw.js','utf8');
assert(c.includes("function liveMode(x){return x&&x.id==='glow'?'mp4':'mse';}"),'Glow uses HTTP MP4 live transport');
assert(!c.includes("x&&x.id==='glow'?'webrtc':'mse'"),'WebRTC regression removed');
assert(c.includes("/stream.html?src="),'go2rtc universal viewer preserved');
assert(c.includes("&mode='+liveMode(b())"),'live mode remains branch-aware');
assert(c.includes("((q===480&&x.id!=='glow')?'&mode=fast':'')"),'v630 playback protection preserved');
assert(c.includes("var valid=localBranch?order.slice()"),'v629 snapshot protection preserved');
assert(assetAtLeast(i, 'cctv.js', 637),'Office ref bumped to 637');
assert(swAtLeast(sw, 637),'Office cache bumped to 637');
console.log('GLOW_SMOOTH_LIVE_MP4_V637=PASS');
