'use strict';
process.env.TZ = 'Africa/Cairo';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadSalesApp } = require('./helpers/load-sales');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root,'sales','sales-app.js'),'utf8');
const ui = fs.readFileSync(path.join(root,'sales','sales-ui.js'),'utf8');
const office = fs.readFileSync(path.join(root,'Office','office.js'),'utf8');
const salesHtml = fs.readFileSync(path.join(root,'sales','index.html'),'utf8');
const salesSw = fs.readFileSync(path.join(root,'sales','sw.js'),'utf8');
const officeHtml = fs.readFileSync(path.join(root,'Office','index.html'),'utf8');
const officeSw = fs.readFileSync(path.join(root,'Office','sw.js'),'utf8');
const { sandbox:S } = loadSalesApp();
let passed=0;
function ok(v,m){ assert(v,m); passed++; }
function eq(a,b,m){ assert.deepStrictEqual(JSON.parse(JSON.stringify(a)),b,m); passed++; }

const cfg={lateGraceMin:10,shifts:{
  morning:{label:'صباحي',start:'10:00',end:'18:00'},
  evening:{label:'مسائي',start:'14:00',end:'22:00'}
}};
const flex={id:'e-flex',shift:'morning',scheduledStartTime:'10:00',scheduledEndTime:'18:00',flexibleMorningEvening:true};
const fixed={id:'e-fixed',shift:'morning',scheduledStartTime:'10:00',scheduledEndTime:'18:00'};
const at=(h,m)=>new Date(2026,8,6,h,m,0,0);

ok(typeof S.window.resolveAttendanceShift==='function','flexible shift resolver is exported');
eq(S.window.resolveAttendanceShift(at(10,0),flex,cfg),{key:'morning',label:'صباحي',start:'10:00',end:'18:00',mode:'auto'},'10:00 selects morning');
eq(S.window.resolveAttendanceShift(at(14,0),flex,cfg),{key:'evening',label:'مسائي',start:'14:00',end:'22:00',mode:'auto'},'14:00 selects evening');
eq(S.window.resolveAttendanceShift(at(12,0),flex,cfg),{key:'evening',label:'مسائي',start:'14:00',end:'22:00',mode:'auto'},'midpoint belongs to the later shift');
eq(S.window.computeLate(at(14,15),flex,cfg),{lateMin:15,penalized:true},'14:15 means only 15 minutes late');
eq(S.window.computeLate(new Date(Date.UTC(2026,8,6,11,15)),flex,cfg),{lateMin:15,penalized:true},'14:15 Cairo is stable regardless of device timezone');
eq(S.window.computeLate(at(13,50),flex,cfg),{lateMin:0,penalized:false},'early for evening is not late');
eq(S.window.computeLate(at(11,59),flex,cfg),{lateMin:119,penalized:true},'before midpoint still belongs to morning');
eq(S.window.computeLate(at(14,15),fixed,cfg),{lateMin:255,penalized:true},'employees not selected keep their fixed schedule');

const endTs=S.window.shiftEndTsForDay(flex,at(18,30),cfg);
ok(new Date(endTs).getHours()===22,'absence is not judged before the later flexible shift ends');

ok(app.includes('id="erFlexibleMorningEvening"'),'employee record has owner-controlled flexible toggle');
ok(app.includes('data-act="flexshift"'),'schedule list has a quick per-employee flexible toggle');
ok(app.includes('flexibleMorningEvening:!!ov.querySelector'),'employee setting is persisted');
ok(app.includes('attendanceShiftKey:shiftChoice.key'),'chosen shift is snapshotted on attendance record');
ok(app.includes('scheduledStartTime:shiftChoice.start'),'chosen start is saved with the shift');
ok(app.includes('scheduledEndTime:shiftChoice.end'),'chosen end is saved with the shift');
ok(app.includes('const shiftEmp = shift.scheduledStartTime'),'clock-out uses the chosen shift snapshot');
ok(ui.includes("shift.scheduledEndTime") && ui.indexOf('shift.scheduledEndTime') < ui.indexOf('emp && emp.scheduledEndTime'),'Sales administrative close prefers the chosen shift end');
ok(office.includes("shift.scheduledEndTime") && office.indexOf('shift.scheduledEndTime',office.indexOf('function ofGraceCloseTs')) < office.indexOf('emp && emp.scheduledEndTime',office.indexOf('function ofGraceCloseTs')),'Office close prefers the chosen shift end');

ok(/sales-app\.js\?v=544/.test(salesHtml)&&/sales-ui\.js\?v=544/.test(salesHtml),'Sales assets are cache-busted to v544');
ok(Number((salesSw.match(/store-apps-shell-v(\d+)/)||[])[1]||0)>=544,'Sales service worker includes v544 or newer');
ok(/office\.js\?v=544/.test(officeHtml),'Office asset is cache-busted to v544');
ok(Number((officeSw.match(/echarpe-office-v(\d+)/)||[])[1]||0)>=544,'Office service worker includes v544 or newer');

console.log(`flexible shift v544: ${passed}/${passed} PASS`);
