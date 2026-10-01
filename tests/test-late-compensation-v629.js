// v629 — «الشغل الزيادة يسد التأخير الأول» (قرار المالك 01-10-2026)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const app = fs.readFileSync(path.join(__dirname, '..', 'sales', 'sales-app.js'), 'utf8');
function extractFn(src, header){ const at = src.indexOf(header); if(at < 0) throw new Error('مش لاقي ' + header); let i = src.indexOf('{', at + header.length - 1), d = 0, q = null;
  for(; i < src.length; i++){ const c = src[i]; if(q){ if(c === '\\'){ i++; continue; } if(c === q) q = null; continue; }
    if(c === '/' && src[i+1] === '/'){ while(src[i] !== '\n') i++; continue; } if(c === '"' || c === "'" || c === '`'){ q = c; continue; }
    if(c === '{') d++; else if(c === '}'){ d--; if(!d) return src.slice(at, i + 1); } } throw new Error('أقواس'); }
const ctx = { Math, Number }; vm.createContext(ctx);
vm.runInContext('const timeCfgDefaults={lateMinPerHour:10,maxLateHoursPerDay:0};' + extractFn(app, 'function lateHoursFrom(') + '\n' + extractFn(app, 'function lateCompensation(') + ';this.C=lateCompensation;', ctx);
const cfg = { lateMinPerHour:10, maxLateHoursPerDay:0 };
const C = (w, r, l) => JSON.stringify(ctx.C(w, r, l, cfg));

// مثال المالك: معادها 10–6 (480)، جت 12 (تأخير 120)، مشيت 10 بالليل (600 شغل)
assertEq(C(600, 480, 120), JSON.stringify({ coveredMin:120, remainingMin:0, hours:0 }), 'جت 12 ومشيت 10 بالليل = التأخير اتسد كله');
assertEq(C(480, 480, 120), JSON.stringify({ coveredMin:120, remainingMin:0, hours:0 }), 'مشيت 8 بالليل بالظبط (كمّلت 8 ساعات) = اتسد كله');
assertEq(C(420, 480, 120), JSON.stringify({ coveredMin:60, remainingMin:60, hours:6 }), 'مشيت 7 = عوّضت ساعة، الباقي ساعة = 6 ساعات رصيد بدل 12');
assertEq(C(360, 480, 120), JSON.stringify({ coveredMin:0, remainingMin:120, hours:12 }), 'سلبي: مشيت في معادها (6) = مفيش تعويض، 12 ساعة زي ما هي');
assertEq(C(300, 480, 120), JSON.stringify({ coveredMin:0, remainingMin:120, hours:12 }), 'سلبي: مشيت بدري = مفيش تعويض (والانصراف البدري حسابه لوحده)');
assertEq(C(475, 480, 44), JSON.stringify({ coveredMin:39, remainingMin:5, hours:0 }), 'باقي أقل من 10 دقايق = صفر ساعات (نفس معدل التأخير)');
assertEq(C(600, 480, 0), JSON.stringify({ coveredMin:0, remainingMin:0, hours:0 }), 'سلبي: مفيش تأخير = مفيش حاجة تتعوّض');
assertEq(C(600, 0, 120), JSON.stringify({ coveredMin:120, remainingMin:0, hours:0 }), 'ملهاش شيفت مجدول = المرجع 8:15');
assertEq(C(450, 0, 120), JSON.stringify({ coveredMin:75, remainingMin:45, hours:4 }), 'ملهاش شيفت مجدول + تعويض جزئي');

// التوصيل في الانصراف
const co = extractFn(app, 'async function clockOut(');
assert(/if\(!forgotten && _lateRow && !_lateRow\.excused/.test(co), 'الانصراف المنسي والبند المعذور مش بيتلمسوا');
assert(/lateCompensation\(totalMin, _reqMin, Number\(shift\.lateMinutes\)\|\|0, cfg\)/.test(co), 'بيستخدم مدة الشيفت المجدولة بتاعتها');
assert(/comp\.coveredMin > 0 && comp\.hours < curH/.test(co), 'سلبي: مفيش تعديل لو التعويض مقلّلش العقوبة (ولا بيزوّدها أبدًا)');
assert(/originalHours:orig/.test(co) && /excuseReason:'عوّضت التأخير/.test(co), 'التاريخ محفوظ (originalHours) والتعويض الكامل بيبان «معذور — عوّضت التأخير»');
assert(/if\(lateFix\) batch\.update\(doc\(db,'sales_time_credit',_lateId\),lateFix\)/.test(co), 'التعديل في نفس batch الانصراف');
assert(/if\(lateFix\) clockOutOps\.push\(\{mode:'update',collection:'sales_time_credit',id:_lateId/.test(co), 'ومحفوظ في الـoutbox لو النت فاصل');
assert(/mode:'update'/.test(co) && !/mode:'set',collection:'sales_time_credit',id:_lateId/.test(co), 'سلبي: update مش set — مفيش مستند ناقص يتعمل');
const otIdx = co.indexOf('const overtimeMinutes = Math.max(0, totalMin - STANDARD_SHIFT_MINUTES);');
assert(otIdx > 0, 'الأوفرتايم زي ما هو: المدة − 8:15 (وقت التعويض مبيتدفعش مرتين)');
const H = fs.readFileSync(path.join(__dirname, '..', 'sales', 'index.html'), 'utf8');
assert(/sales-app\.js\?v=6(29|[3-9]\d)/.test(H) && /store-apps-shell-v6(29|[3-9]\d)/.test(fs.readFileSync(path.join(__dirname, '..', 'sales', 'sw.js'), 'utf8')), 'Sales v629');

// ===== تشغيل clockOut الحقيقية (نفس harness اختبار الأوفرتايم) =====
// بناخد الـRUNNER من test-overtime-guard.js نفسه ونغيّر بس: الشيفت متأخر 120 دقيقة،
// ومعادها 10–6، وبند التأخير موجود في الذاكرة — فبنختبر الكود الفعلي مش نسخة.
(function(){
  const og = fs.readFileSync(path.join(__dirname, 'test-overtime-guard.js'), 'utf8');
  const a = og.indexOf('const RUNNER = `') + 'const RUNNER = `'.length, b = og.indexOf('`;\nconst runnerPath');
  let R = og.slice(a, b).replace(/\\\\/g, '\\');
  const rep = (x, y) => { if(R.indexOf(x) < 0) throw new Error('harness changed: ' + x.slice(0, 40)); R = R.replace(x, y); };
  rep("'function overtimeReviewInfo(', 'function overtimeReviewReasonLabel(' ]",
      "'function overtimeReviewInfo(', 'function overtimeReviewReasonLabel(', 'function lateHoursFrom(', 'function lateCompensation(' ]");
  rep("getOpenShift: function(){ return { id:'s1', clockInTs: IN }; },",
      "getOpenShift: function(){ return { id:'s1', clockInTs: IN, lateMinutes: Number(process.env.LATE||0) }; },");
  rep("window: { employees:[{ id:'e1', name:'سارة', scheduledEndTime:'22:00' }],",
      "window: { employees:[{ id:'e1', name:'سارة', scheduledStartTime:'10:00', scheduledEndTime:'18:00' }], allTimeCredit: JSON.parse(process.env.TC||'[]'),");
  rep("overtimeReviewReasonLabel: box0.overtimeReviewReasonLabel,",
      "overtimeReviewReasonLabel: box0.overtimeReviewReasonLabel, lateHoursFrom: box0.lateHoursFrom, lateCompensation: box0.lateCompensation,");
  rep("else (written._credits = written._credits || []).push(op.data);",
      "else (written._credits = written._credits || []).push(Object.assign({ _id: op.id, _mode: op.mode }, op.data));");
  const rp = path.join(require('os').tmpdir(), 'late-comp-' + process.pid + '.js');
  fs.writeFileSync(rp, R);
  const CFG = { lateMinPerHour:10, maxLateHoursPerDay:0, earlyMinPerHour:10, earlyGraceMin:5, maxShiftHours:14, autoOvertimeMaxMin:120 };
  const run = (inTs, outTs, late, tc) => JSON.parse(require('child_process').execFileSync(process.execPath,
    [rp, path.join(__dirname, '..', 'sales', 'sales-app.js'), JSON.stringify(CFG), String(inTs), String(outTs)],
    { encoding:'utf8', timeout:15000, env:Object.assign({}, process.env, { LATE:String(late), TC:JSON.stringify(tc) }) }));
  const T = (d, h, m) => Date.UTC(2026, 9, d, h - 3, m);   // القاهرة
  const lateRow = { id:'late_e1_s1', employeeId:'e1', type:'late', hours:12, date:'2026-10-01' };

  // مثال المالك: جت 12، مشيت 10 بالليل
  let w = run(T(1,12,0), T(1,22,0), 120, [lateRow]);
  assert(!w.error, 'clockOut اشتغلت — ' + (w.error || ''));
  const fix = (w._credits || []).find(c => c._id === 'late_e1_s1');
  assert(fix && fix._mode === 'update' && fix.hours === 0 && fix.excused === true && fix.originalHours === 12 && fix.compensatedMin === 120, 'جت 12 ومشيت 10: بند التأخير اتصفّر «عوّضت» والأصل 12 محفوظ');
  assertEq(w.overtimeMinutes, 105, 'والأوفرتايم 1:45 (المدة − 8:15) زي ما هو');

  // تعويض جزئي: مشيت 7
  w = run(T(1,12,0), T(1,19,0), 120, [lateRow]);
  const part = (w._credits || []).find(c => c._id === 'late_e1_s1');
  assert(part && part.hours === 6 && !part.excused && part.originalHours === 12, 'مشيت 7: 6 ساعات بدل 12');
  assertEq(w.overtimeMinutes, 0, 'ومفيش أوفرتايم');

  // سلبي: مشيت في معادها
  w = run(T(1,12,0), T(1,18,0), 120, [lateRow]);
  assert(!(w._credits || []).some(c => c._id === 'late_e1_s1'), 'سلبي: مشيت 6 = بند التأخير متلمسش');
  // سلبي: البند معذور قبل كده
  w = run(T(1,12,0), T(1,22,0), 120, [Object.assign({}, lateRow, { excused:true, hours:0 })]);
  assert(!(w._credits || []).some(c => c._id === 'late_e1_s1'), 'سلبي: بند معذور مش بيتعدّل تاني');
  // سلبي: البند مش في الذاكرة = مفيش مستند يتعمل
  w = run(T(1,12,0), T(1,22,0), 120, []);
  assert(!(w._credits || []).some(c => c._id === 'late_e1_s1'), 'سلبي: بند مش موجود = مفيش كتابة');
  // سلبي: نسيان انصراف (أكتر من 14 ساعة)
  w = run(T(1,12,0), T(2,12,0), 120, [lateRow]);
  assert(!(w._credits || []).some(c => c._id === 'late_e1_s1') && w.forgotClockOut === true, 'سلبي: نسيان الانصراف مبيعوّضش التأخير');
  try{ fs.unlinkSync(rp); }catch(e){}
})();

// ===== v630: جت إمتى ومشيت إمتى جنب كل بند =====
(function(){
  const c2 = { Date, Math, Number, String, Intl }; vm.createContext(c2);
  vm.runInContext("const _f=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'});function caiDayKey(ms){return _f.format(new Date(ms));}"
    + extractFn(app, 'function tcShiftFor(') + '\n' + extractFn(app, 'function tcShiftLine(') + ';this.F=tcShiftFor;this.L=tcShiftLine;', c2);
  const T = (d, h, m) => Date.UTC(2026, 8, d, h - 3, m);
  const sh = [
    { id:'s24', employeeId:'e1', clockInTs:T(24,11,48), clockOutTs:T(24,19,10), scheduledStartTime:'10:00', scheduledEndTime:'18:00' },
    { id:'s24b', employeeId:'e1', clockInTs:T(24,20,0), clockOutTs:T(24,21,0) },
    { id:'x', employeeId:'e2', clockInTs:T(22,10,0), clockOutTs:T(22,18,0) },
    { id:'s20', employeeId:'e1', clockInTs:T(20,10,24) }
  ];
  assertEq(c2.F({ sourceShiftId:'s24', employeeId:'e1', date:'2026-09-24' }, sh).id, 's24', 'البند مربوط بشيفته');
  assertEq(c2.F({ employeeId:'e1', date:'2026-09-24' }, sh).id, 's24', 'بند قديم من غير sourceShiftId = أول حضور في اليوم');
  assertEq(c2.F({ employeeId:'e1', date:'2026-09-22' }, sh), null, 'سلبي: حضور موظفة تانية مش بيتربط');
  assertEq(c2.F({ sourceShiftId:'gone', employeeId:'e1', date:'2026-09-24' }, sh).id, 's24', 'شيفت اتمسح = يرجع لنفس اليوم');
  const l = c2.L(sh[0], {});
  assert(/جت/.test(l) && /مشيت/.test(l) && /اشتغلت 7:22/.test(l) && /معادها 10:00–18:00/.test(l), 'السطر فيه جت/مشيت/المدة/المعاد: ' + l);
  assert(/لسه مفتوح/.test(c2.L(sh[3], { scheduledStartTime:'10:00' })) && /معادها 10:00/.test(c2.L(sh[3], { scheduledStartTime:'10:00' })), 'شيفت مفتوح + معاد الموظفة لو الشيفت ملهوش');
  assertEq(c2.L(null, {}), '', 'سلبي: مفيش شيفت = مفيش سطر');
  const ov = extractFn(app, 'window.openPayrollTimeCreditDetails = function(');
  assert(/x\.type==='absence' \? '' : tcShiftLine\(tcShiftFor\(x, window\.allShifts\|\|\[\]\), emp\)/.test(ov), 'التفاصيل بتعرض السطر (والغياب مالوش حضور)');
})();
