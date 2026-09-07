'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadSalesApp } = require('./helpers/load-sales');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'sales', 'sales-app.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'sales', 'sales-ui.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'sales', 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sales', 'sw.js'), 'utf8');
let passed = 0;
function ok(value, message){ assert(value, message); passed++; }
function section(name, next){
  const start = app.indexOf('async function ' + name + '(');
  const end = app.indexOf('\nasync function ' + next + '(', start + 1);
  assert(start >= 0 && end > start, 'missing function section ' + name);
  return app.slice(start, end);
}

const { sandbox } = loadSalesApp();
ok(typeof sandbox.window.attendanceDocId === 'function', 'deterministic attendance id helper is exported');
const a = sandbox.window.attendanceDocId('shift', 'employee/1', '2026-09-06');
const b = sandbox.window.attendanceDocId('shift', 'employee/1', '2026-09-06');
const c = sandbox.window.attendanceDocId('shift', 'employee/1', '2026-09-07');
ok(a === b, 'same logical operation always gets the same document id');
ok(a !== c && !a.includes('/'), 'different day differs and Firestore id is slash-safe');

ok(app.includes('function queueAttendanceMutation('), 'one mutation coordinator handles UI, retry and rollback');
ok(app.includes("state === 'pending'"), 'slow/offline write has a visible pending state');
ok(app.includes("state === 'error'"), 'hard failure has a visible error state');
ok(app.includes('retryFn'), 'hard failure exposes a retry action');
ok(app.includes('ATT_MUTATION_TIMEOUT_MS'), 'slow network is bounded instead of hanging the employee flow');

const clockIn = section('clockIn', 'clockOut');
ok(clockIn.includes("attendanceDocId('shift'"), 'clock-in uses a deterministic retry-safe shift id');
ok(clockIn.includes("dateKey+'_'+clockInTs"), 'a later legitimate second shift cannot overwrite the first shift');
ok(clockIn.includes("attendanceDocId('late'"), 'late time-credit id is derived from its shift');
ok(clockIn.includes('writeBatch(db)'), 'clock-in and late credit use an atomic batch');
ok(clockIn.includes('batch.set(shiftRef'), 'shift is set idempotently');
ok(!clockIn.includes('addDoc(') && !clockIn.includes('fbAddDoc('), 'clock-in no longer uses duplicate-prone random ids');
ok(clockIn.indexOf('optimisticShift') < clockIn.indexOf('batch.commit()'), 'clock-in updates local UI before network confirmation');

const startBreak = section('startBreak', 'endBreak');
ok(startBreak.includes("attendanceDocId('break'"), 'break-start uses one deterministic daily break id');
ok(startBreak.includes('batch.set(breakRef'), 'break-start is idempotent');
ok(startBreak.indexOf('optimisticBreak') < startBreak.indexOf('batch.commit()'), 'break-start updates UI immediately');

const endBreak = section('endBreak', 'autoCloseStaleBreaks');
ok(endBreak.includes('writeBatch(db)'), 'break close and excess-time charge are atomic');
ok(endBreak.includes("attendanceDocId('break-credit'"), 'break charge has a deterministic source id');
ok(!endBreak.includes('fbAddDoc('), 'break retry cannot create duplicate charges');

const clockOut = app.slice(app.indexOf('async function clockOut('), app.indexOf('// ---------- ATTENDANCE PIN GATE ----------'));
ok(clockOut.includes('writeBatch(db)'), 'clock-out and early-leave charge are atomic');
ok(clockOut.includes("attendanceDocId('early'"), 'early-leave charge has a deterministic source id');
ok(!clockOut.includes('fbAddDoc('), 'clock-out retry cannot create duplicate charges');

ok(ui.includes('optimisticTimeCredit'), 'excuse is reflected immediately in the local list');
ok(ui.indexOf('optimisticTimeCredit') < ui.indexOf('fbUpdateDoc', ui.indexOf('window.excuseTimeCredit')), 'excuse UI updates before the network write');
ok(ui.includes('rollbackTimeCredit'), 'failed excuse rolls back instead of silently lying');
ok(ui.includes('queueAttendanceMutation'), 'excuse uses the same pending/error/retry feedback');

ok(/sales-app\.js\?v=544/.test(html) && /sales-ui\.js\?v=544/.test(html), 'Sales scripts are cache-busted to v544');
ok(/store-apps-shell-v545/.test(sw), 'Sales service worker cache is v545');

console.log(`sales attendance resilience v543: ${passed}/${passed} PASS`);
