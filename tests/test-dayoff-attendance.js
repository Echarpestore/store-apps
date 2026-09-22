#!/usr/bin/env node
// test-dayoff-attendance.js (sales v621) — مفتاح منع البصمة في الإجازة · تسجيل يوم يدوي · إلغاء حضور بالغلط
'use strict';
require('./helpers/swv');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'sales', 'sales-app.js'), 'utf8'), html = fs.readFileSync(path.join(ROOT, 'sales', 'index.html'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if(c){ pass++; } else { fail++; console.error('  ❌ ' + m); } };
function extractFn(src, header){ const at = src.indexOf(header); if(at < 0) throw new Error('مش لاقي ' + header); let i = src.indexOf('{', at + header.length - 1), d = 0, q = null;
  for(; i < src.length; i++){ const c = src[i]; if(q){ if(c === '\\'){ i++; continue; } if(c === q) q = null; continue; }
    if(c === '/' && src[i+1] === '/'){ while(src[i] !== '\n') i++; continue; } if(c === '"' || c === "'" || c === '`'){ q = c; continue; }
    if(c === '{') d++; else if(c === '}'){ d--; if(!d) return src.slice(at, i + 1); } } throw new Error('أقواس'); }
const pre = "const CAI_TZ='Africa/Cairo'; const _caiFmt=new Intl.DateTimeFormat('en-GB',{timeZone:CAI_TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});"
 + "function caiDayKey(ms){const p={};_caiFmt.formatToParts(new Date(ms)).forEach(x=>p[x.type]=x.value);return p.year+'-'+p.month+'-'+p.day;}"
 + "function caiStamp(y,m,d,h,mi,s,ms){return Date.UTC(y,m-1,d,(h||0)-3,mi||0,s||0,ms||0);}"
 + "function attendanceIdPart(x){return String(x).replace(/[^A-Za-z0-9_-]/g,'_');}\n";
const ctx = { window:{ allSettingsByBranch:{} }, Date, String, Number, Intl, RegExp, Object, Math }; vm.createContext(ctx);
vm.runInContext(pre + "const FACE_GLOBAL_DOC='_global';\n" + ['function attendanceDocId(', 'function approvedLeaveFor(', 'function approvedLeaveBlocksClockIn(', 'function leaveWorkAllowed(', 'function closedShiftToday(', 'function secondShiftAllowed(', 'function dayOffClockInBlockOn(', 'function clockInBlockReason(', 'function manualShiftPlan('].map(h => extractFn(app, h)).join('\n') + ';let allShifts=[];this.setLeaves=l=>{leaveRequests=l;};let leaveRequests=[];', ctx);

console.log('\n🗓️ 1) المفتاح');
const emp = { id:'e1', name:'روان', branch:'Rehab' };
const leaveSrc = extractFn(app, 'function approvedLeaveFor(');
ok(/window\.allLeaveReqs/.test(leaveSrc), 'approvedLeaveFor بتقرا window.allLeaveReqs');
{
  ctx.window.allLeaveReqs = [{ empId:'e1', dateKey:'2026-09-20', status:'approved', type:'dayoff' }];
  ok(ctx.clockInBlockReason(emp, '2026-09-20') === 'leave', 'الافتراضي: إجازة معتمدة النهاردة = ممنوع (زي ما كان)');
  ctx.window.allSettingsByBranch._global = { dayOffClockInBlock:false };
  ok(ctx.clockInBlockReason(emp, '2026-09-20') === '', '⭐ المالك قفل المفتاح = بتبصم عادي');
  ctx.window.allSettingsByBranch._global = { dayOffClockInBlock:true };
  ok(ctx.clockInBlockReason(emp, '2026-09-20') === 'leave', 'رجّعه = ممنوع تاني');
  ok(ctx.clockInBlockReason(Object.assign({}, emp, { leaveWorkOverrideDateKey:'2026-09-20' }), '2026-09-20') === '', 'والسماح الفردي من ملف الموظف لسه شغّال');
}
ok(/id="dayOffBlockInput"[^>]*checked/.test(html) && /dayOffClockInBlock:dayOffBlock/.test(app), 'الاختيار في الإعدادات وبيتحفظ في _global (كل الفروع)');

console.log('✍️ 2) تسجيل يوم يدوي');
let p = ctx.manualShiftPlan(emp, '2026-09-20', '10:00', '18:00', 'جت في إجازتها والجهاز رفض', []);
ok(!p.error && p.data.manual === true && p.data.manualReason && p.data.employeeId === 'e1', 'بيتسجّل كشيفت عادي متعلّم manual + السبب');
ok(ctx.caiDayKey(p.data.clockInTs) === '2026-09-20' && (p.data.clockOutTs - p.data.clockInTs) === 8 * 3600e3, 'الأوقات بتوقيت القاهرة و8 ساعات');
ok(p.data.lateMinutes === 0 && p.data.latePenalized === false, 'من غير تأخير (المالك هو اللي سجّله)');
ok(ctx.manualShiftPlan(emp, '2026-09-20', '22:00', '02:00', 'x', []).data.clockOutTs > ctx.manualShiftPlan(emp, '2026-09-20', '22:00', '02:00', 'x', []).data.clockInTs, 'شيفت بيعدّي نص الليل');
ok(/السبب/.test(ctx.manualShiftPlan(emp, '2026-09-20', '10:00', '18:00', '', []).error || ''), 'من غير سبب = لأ');
ok(/لسه مجاش/.test(ctx.manualShiftPlan(emp, '2099-01-01', '10:00', '18:00', 'x', []).error || ''), 'يوم في المستقبل = لأ');
ok(/16 ساعة/.test(ctx.manualShiftPlan(emp, '2026-09-20', '01:00', '00:00', 'x', []).error || ''), 'أطول من 16 ساعة = لأ');
ok(/مسجّل لليوم ده/.test(ctx.manualShiftPlan(emp, '2026-09-20', '10:00', '18:00', 'x', [{ employeeId:'e1', clockInTs: p.data.clockInTs }]).error || ''), 'يوم فيه حضور أصلًا = لأ (ألغيه الأول)');
ok(p.id === ctx.manualShiftPlan(emp, '2026-09-20', '11:00', '19:00', 'y', []).id, 'نفس المعرّف لنفس اليوم (ضغطتين = مستند واحد)');

console.log('✖ 3) إلغاء حضور بالغلط');
const vs = extractFn(app, 'async function voidShift(');
ok(/sales_shifts_voided/.test(vs) && vs.indexOf("setDoc(doc(db,'sales_shifts_voided'") < vs.indexOf("deleteDoc(doc(db,'sales_shifts'"), 'نسخة في sales_shifts_voided **قبل** الحذف');
ok(/attendanceDocId\('late',emp\.id,shiftId\)/.test(vs) && /deleteDoc\(doc\(db,'sales_time_credit',lateId\)\)/.test(vs), 'ورصيد التأخير المربوط بيه بيتشال معاه');
ok(/confirm\(/.test(vs) && /_employeeAudit\(emp,'void_shift'/.test(vs), 'بتأكيد + أثر في سجل الموظف');
ok(/adminRole==='owner'\?`<div style="margin:10px 0 4px;font-weight:900;font-size:13px">🗓️ الحضور/.test(app), 'الزرارين للمالك بس');
ok(swAtLeast(fs.readFileSync(path.join(ROOT, 'sales', 'sw.js'), 'utf8'), 621) && assetAtLeast(html, 'sales-app.js', 621), 'sales ≥ v621');
console.log('\n' + (fail ? '❌' : '✅') + ' test-dayoff-attendance: ' + pass + ' ناجح · ' + fail + ' فاشل');
if(fail) process.exitCode = 1;
