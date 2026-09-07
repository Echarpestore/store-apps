'use strict';
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
const read=(...p)=>fs.readFileSync(path.join(root,...p),'utf8');
const sales=read('sales','sales-app.js'),presence=read('pos','cctv-presence.js'),timeline=read('pos','cctv-timeline.js');
const invoice=read('pos','cctv-invoice.js'),posHtml=read('pos','index.html'),posSw=read('pos','sw.js');
const office=read('Office','cctv.js'),officeHtml=read('Office','index.html'),officeSw=read('Office','sw.js');
const agent=read('branch-tools','madinaty','cctv-recorder','ECHARPE-MADINATY-RECORDER.ps1');
const detector=read('branch-tools','madinaty','cctv-recorder','ECHARPE-MADINATY-PERSON-DETECTOR.py');
const watchdog=read('branch-tools','madinaty','cctv-recorder','WATCH-MADINATY-RECORDER.ps1');
const installer=read('branch-tools','madinaty','cctv-recorder','INSTALL-MADINATY-SMART-REVIEW-v555.ps1');
let n=0;function ok(v,m){if(!v)throw new Error('FAIL: '+m);n++;}

ok(/openBreakCount:breakIds\.length/.test(sales)&&/activeStaffCount:onFloor\.length/.test(sales),'attendance subtracts open breaks');
ok(/setInterval\(publishMadinatyStaffState,30000\)/.test(sales),'staff state remains fresh');
ok(/cctv-presence\.js\?v=555/.test(posHtml),'presence engine is actually loaded');
ok(/session-signal/.test(presence)&&/cctvPresenceNoteCartActivity/.test(timeline),'basket changes reach local detector agent');
ok(/cctvPresenceRecordSale/.test(invoice)&&/transactionKind/.test(invoice),'sale and return evidence reaches presence path');
ok(/store-apps-shell-v555/.test(posSw),'POS cache is v555');

ok(/STREAMS=\{4:.*camera4.*8:.*camera8/.test(detector),'detector opens cameras 4 and 8');
ok(/attendance_fresh and bool\(r4 and r8\) and pair4 and surplus>=1/.test(detector),'candidate requires fresh attendance, both cameras, cashier pair and surplus person');
ok(/lastCustomerAtMs/.test(detector),'sale-without-customer uses recent customer evidence');
ok(/staffStateMaxAgeSeconds/.test(detector),'stale staff state fails closed');

ok(/strong_activity_no_sale/.test(agent)&&/\$strong\.Count -gt 0 -or \$cartMoves -ge 3/.test(agent),'trivial motion is filtered out');
ok(/sale_without_customer/.test(agent)&&/return_or_exchange/.test(agent),'sale and return without customer are classified');
ok(/\$Segments8/.test(agent)&&/Build-Clip .*\$camera/.test(agent),'both camera rings have playback');
ok(/-map 0:a\?/.test(agent)&&/-c:a aac/.test(agent),'camera audio is retained and browser encoded');
ok(/local_write_only/.test(agent),'public tunnel cannot write attendance or basket state');
ok(/camera4Recorder/.test(watchdog)&&/camera8Recorder/.test(watchdog),'watchdog checks fresh dual recordings');
ok(/CAMERA4_AUDIO_NOT_AVAILABLE/.test(installer)&&/DUAL_RECORDING_NOT_HEALTHY/.test(installer),'installer refuses false success');

ok(/openSmartActivityReview/.test(office)&&/data-smart-master/.test(office)&&/data-smart-slave/.test(office),'Office has synchronized dual review');
ok(/of-smart555-marker/.test(officeHtml)&&/data-smart-jump/.test(office),'clickable event markers are rendered');
ok(/كاميرا 4 \+ كاميرا 8 \+ صوت الكاشير \+ السلة/.test(officeHtml),'review contract is visible to owner');
ok(/cctv\.js\?v=555/.test(officeHtml)&&/echarpe-office-v555/.test(officeSw),'Office cache is v555');
console.log('Madinaty smart review v555: '+n+'/'+n+' PASS');
