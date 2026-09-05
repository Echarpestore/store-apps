'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const rd=p=>fs.readFileSync(path.join(root,p),'utf8');
const config=rd('cctv-config.js'),pos=rd('pos/cctv-invoice.js'),office=rd('Office/cctv.js');
const agent=rd('branch-tools/madinaty/cctv-recorder/ECHARPE-MADINATY-RECORDER.ps1');
const watch=rd('branch-tools/madinaty/cctv-recorder/WATCH-MADINATY-RECORDER.ps1');
const install=rd('branch-tools/madinaty/cctv-recorder/INSTALL-MADINATY-v510.ps1');
const pidx=rd('pos/index.html'),oidx=rd('Office/index.html'),psw=rd('pos/sw.js'),osw=rd('Office/sw.js');

const local={};
const ctx={window:{},localStorage:{getItem:k=>local[k]||null,setItem:(k,v)=>local[k]=String(v)},console};
vm.createContext(ctx);vm.runInContext(config,ctx);
const mad=ctx.window.echarpeCctvProfile('مدينتي');
assert(mad&&mad.id==='madinaty','Madinaty profile resolves');
assert.strictEqual(mad.cashierCamera,'4','cashier camera is camera4');
assert.strictEqual(mad.playback,true,'Madinaty playback is enabled');
assert.strictEqual(mad.localEvidence,false,'working Firestore snapshots stay unchanged');

assert(pos.includes("doc.video='pc_ring_recording'"),'invoice points to PC ring recording');
assert(pos.includes("doc.clockSource='pos_pc'"),'invoice playback anchor explicitly uses POS PC clock');
assert(/videoAtMs=Number\(meta\.atMs\)/.test(pos),'sale timestamp is preferred over any DVR timestamp');
assert(/madinaty[\s\S]{0,260}cameraId:'4'[\s\S]{0,260}playback:true/.test(pos),'mixed-cache fallback also enables camera4 playback');
assert(/id:'madinaty'[\s\S]{0,220}playback:true[\s\S]{0,80}playbackCamera:'4'/.test(office),'Office fallback exposes Madinaty playback');
assert(office.includes('🎥 30 ثانية قبل + 30 بعد'),'invoice review has exact 30+30 action');
assert(office.includes('🎬 الكاميرا + السلة')&&office.includes("video.addEventListener('timeupdate',renderAt)"),'basket follows video time and seeking');

assert(agent.includes("$Stream = 'rtsp://127.0.0.1:8554/camera4'"),'recorder consumes already-working local camera4 stream');
assert(agent.includes("$RetentionHours = 168"),'one week ring retention is configured');
assert(agent.includes("-c:v copy -f segment")&&agent.includes('-segment_time 2'),'continuous capture is segmented without re-encoding sale flow');
assert(agent.includes("$StartMs - 6000")&&agent.includes("$endMs + 4000"),'clip includes safe segment boundaries around requested POS time');
assert(agent.includes("if ($DurationSec -gt 1800)"),'full basket playback supports up to 30 minutes');
assert(agent.includes("Content-Range")&&agent.includes("Accept-Ranges"),'MP4 supports browser seeking for basket synchronization');
assert(agent.includes("libx264")&&agent.includes("yuv420p"),'clips are browser-compatible H.264');
assert(agent.includes("clockSource='pos_pc'"),'health reports the authoritative clock');
assert(!/password|2418Mm/i.test(agent+watch+install),'package contains no NVR/camera credentials');
assert(watch.includes('ECHARPE-MADINATY-RECORDER.ps1')&&install.includes("/SC MINUTE /MO 1"),'watchdog restarts agent every minute if needed');

for(const pair of [[pidx,'cctv-config.js?v=510'],[pidx,'cctv-invoice.js?v=510'],[oidx,'cctv-config.js?v=510'],[oidx,'cctv.js?v=510'],[psw,"store-apps-shell-v510"],[osw,"echarpe-office-v510"]]) assert(pair[0].includes(pair[1]),'cache bust '+pair[1]);
console.log('Madinaty PC-clock 30+30 + synchronized basket v510: PASS');
