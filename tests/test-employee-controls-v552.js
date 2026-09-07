'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.join(__dirname,'..');
const sales=fs.readFileSync(path.join(root,'sales','sales-ui.js'),'utf8');
const app=fs.readFileSync(path.join(root,'sales','sales-app.js'),'utf8');
const office=fs.readFileSync(path.join(root,'Office','office.js'),'utf8');
const salesHtml=fs.readFileSync(path.join(root,'sales','index.html'),'utf8');
const officeHtml=fs.readFileSync(path.join(root,'Office','index.html'),'utf8');

function ok(v,m){assert.ok(v,m);console.log('PASS',m);}
ok(!sales.includes('csPenalty'),'legacy cash-penalty setting is removed');
ok(!sales.includes('complianceCfg.penalty'),'violation UI no longer reads a cash penalty');
ok(!app.includes('penalty: 50'),'legacy fixed 50 EGP policy is removed');
ok((sales.match(/hours:\s*4/g)||[]).length>=4,'both review paths write four-hour time credit');
ok(sales.includes("'sales_time_credit'") && !sales.slice(sales.indexOf('window.resolveViolation'),sales.indexOf('window.renderAttIssues')).includes("'sales_deductions'"),'violation review writes time credit, not money deduction');
ok(sales.includes("window.attendanceDocId('violation-credit'") && sales.includes("window.attendanceDocId('attendance-credit'"),'review credits have deterministic ids');

ok(sales.includes('window.closeShiftNow = async function'),'Sales has close-now action');
ok(sales.includes('data-close-now=') && sales.includes('🚪 إغلاق الآن'),'Sales exposes a clear close-now button');
ok(office.includes('window.ofHubCloseNow = async function'),'Office has close-now action');
ok(office.includes('🚪 إغلاق الشيفت الآن'),'Office employee sheet exposes close-now');
ok(office.includes("ofAttendanceDocId('early',empId,shiftId)"),'Office and Sales share deterministic early-credit identity policy');
ok(office.includes('batch.update') && office.includes('batch.set'),'Office closes shift and writes credit atomically');

ok(office.includes('window.ofHubEmployeeSettings = function'),'Office has focused employee management');
['ofEmpSalary','ofEmpStart','ofEmpEnd','ofEmpDayOff','ofEmpFlexible','ofEmpHire','ofEmpTrack'].forEach(id=>ok(office.includes(id),'Office employee form contains '+id));
ok(office.includes("db.collection('sales_employees').doc(empId).update(patch)"),'Office saves into authoritative employee record');
ok(office.includes('salaryHistory') && office.includes('salaryUpdatedAt'),'Office preserves salary change history');

ok(salesHtml.includes('sales-app.js?v=554')&&salesHtml.includes('sales-ui.js?v=554'),'Sales cache-busting version updated');
ok(officeHtml.includes('office.js?v=552'),'Office cache-busting version updated');

// Execute the pure Office close calculator against a normal 10:00-18:00 shift.
const start=office.indexOf('function ofCloseNowCalc('),end=office.indexOf('window.ofCloseNowCalc = ofCloseNowCalc;');
const box={window:{}};vm.createContext(box);vm.runInContext(office.slice(start,end)+'\nwindow.calc=ofCloseNowCalc;',box);
const inTs=new Date(2026,8,7,10,0).getTime(),outTs=new Date(2026,8,7,14,0).getTime();
const c=box.window.calc({clockInTs:inTs,scheduledStartTime:'10:00',scheduledEndTime:'18:00',lateMinutes:0},{},{timeCfg:{earlyGraceMin:0,earlyMinPerHour:10,maxEarlyHoursPerDay:24},shifts:{}},outTs);
assert.deepStrictEqual(JSON.parse(JSON.stringify(c)),{now:outTs,worked:240,required:480,earlyMin:240,earlyHours:24,overtimeMinutes:0});
console.log('PASS close-now calculator records actual duration and capped time credit');
console.log('employee controls v552: PASS');
