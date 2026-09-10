const fs=require('fs'),assert=require('assert');
const c=fs.readFileSync(__dirname+'/../Office/cctv.js','utf8');
const i=fs.readFileSync(__dirname+'/../Office/index.html','utf8');
const sw=fs.readFileSync(__dirname+'/../Office/sw.js','utf8');

assert(c.includes("function playbackUrl("),'playbackUrl preserved');
assert(c.includes("/echarpe-playback/video?camera="),'direct video endpoint preserved');
assert(!c.includes("data-pb-glow"),'normal Glow iframe removed');
assert(!c.includes("data-day-glow"),'day Glow iframe removed');
assert(!c.includes("glowDayViewerUrl"),'broken day viewer helper removed');
assert(!c.includes("glowViewerUrl"),'broken normal viewer helper removed');
assert(!c.includes("/echarpe-playback/view?camera="),'Office no longer depends on malformed Glow viewer');
assert(c.includes("<video data-day-master controls autoplay playsinline></video>"),'Glow day playback uses direct video');
assert(c.includes("master?chunkStart+(Number(master.currentTime)||0)*1000"),'basket sync follows direct Glow video clock');
assert(i.includes('cctv.js?v=627'),'Office cctv cache ref bumped');
assert(sw.includes("echarpe-office-v627"),'Office SW cache bumped');
console.log('GLOW_PLAYBACK_DIRECT_VIDEO_V627=PASS');
