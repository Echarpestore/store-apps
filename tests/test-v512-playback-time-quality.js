'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),rd=p=>fs.readFileSync(path.join(root,p),'utf8');
const office=rd('Office/cctv.js'),html=rd('Office/index.html'),sw=rd('Office/sw.js');

assert(office.includes('function playbackUrl(atMs,durationMin,cameraId,offsetMs,quality)'), 'normal playback URL accepts quality');
assert(office.includes("q===480?'&mode=fast':''"), '480p is the default fast-copy path while 720p uses quality conversion');
assert(office.includes('<option value="480" selected>480p سريع</option><option value="720">720p</option>'), 'normal playback exposes 480p and 720p with fast 480p default');
assert(office.includes("quality.onchange=function(){loadAt(start,Number(video.currentTime)||0);}"), 'quality changes preserve the current playback position');
assert(html.includes('id="ofCctvDayDate"')&&html.includes('id="ofCctvDayTime"'), 'day review exposes date and time inputs');
assert(office.includes("currentBounds=dayBounds(dayInput&&dayInput.value)"), 'day bounds are refreshed from the visible date at playback click');
assert(office.includes('chosenStart=tq.length>1?new Date('), 'synchronized day review starts from the selected time');
assert(/cctv\.js\?v=51[23]/.test(html)&&/echarpe-office-v51[23]/.test(sw), 'Office cache is safely busted at or after v512');
console.log('Madinaty selectable day/time + 480/720 playback v512: PASS');
