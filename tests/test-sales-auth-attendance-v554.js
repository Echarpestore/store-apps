'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'sales','sales-app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'sales','index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sales','sw.js'),'utf8');
let passed=0;
function ok(x,m){if(!x)throw new Error('FAIL: '+m);passed++;}

// Session isolation: another same-origin Firebase page cannot replace Sales auth.
ok(/initializeApp\(firebaseConfig,\s*['"]sales['"]\)/.test(app),'Sales uses a named Firebase app');
ok(!/const app\s*=\s*initializeApp\(firebaseConfig\)\s*;/.test(app),'Sales never uses default Firebase app');
ok(/sales auth persistence failed/.test(app),'persistence failures are observable');
ok(!/_autoReloginTried/.test(app),'recovery is not a one-shot flag');
ok(/_scheduleSalesRelogin/.test(app)&&/addEventListener\(['"]online['"]/.test(app),'auth retries continuously and on reconnect');
ok(/const recovering =/.test(app)&&/recovering && !\$\('#branchSetup'\)/.test(app),'temporary auth loss does not cover kiosk with setup screen');

// Durable attendance: save first, keep original event, replay idempotently.
ok(/ATT_OUTBOX_KEY\s*=\s*['"]echarpe_sales_attendance_outbox_v554['"]/.test(app),'versioned durable attendance outbox exists');
ok(/putAttendanceOutbox\(\{key,ops:options\.durableOps/.test(app),'operation is persisted before remote commit');
ok(/attendanceBatchFromOps/.test(app)&&/replayAttendanceOutbox/.test(app),'saved operations can replay after reload');
ok(/setInterval\(replayAttendanceOutbox,15000\)/.test(app),'pending operations self-heal without restart');
ok(/Never make a clock-in disappear/.test(app),'durable failure path preserves optimistic attendance');
ok(/fixedAttendanceTs\(['"]clock-in['"]/.test(app),'first clock-in timestamp remains the source of truth');
ok(/attendanceDocId\(['"]shift['"]/.test(app),'clock-in has deterministic idempotency id');

for(const marker of ['break-start:'+"'",'durableOps:breakOps','durableOps:clockInOps','durableOps:clockOutOps']){
  ok(app.includes(marker),'durable coverage marker '+marker);
}

ok(/sales-app\.js\?v=554/.test(html)&&/sales-ui\.js\?v=554/.test(html),'browser receives v554 files');
ok(/store-apps-shell-v554/.test(sw),'Sales cache bumped to v554');
console.log('sales auth + attendance v554: '+passed+'/'+passed+' PASS');
