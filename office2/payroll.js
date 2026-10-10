/* ============================================================
   💼 office2/payroll.js — v1 — محرك المرتبات لـ Office 2
   ------------------------------------------------------------
   ⚠️ نسخة **حرفية** من الدوال اللي في Office/office.js (ofComputeSalary ومساعداتها)
   — نفس الرقم اللي بيطلع في Office القديم وsales (test-office-money بيقارنهم).
   لما تتعدل هناك تتعدل هنا. مستقبلًا: ملف واحد مشترك.
   ============================================================ */
(function(){
'use strict';
function ofMonthDateRange(d){
  // فترة الحضور = الشهر التقويمي الحقيقي كله (28/29/30/31).
  // قيمة اليوم في المرتب تفضل ÷30 داخل ofComputeSalary.
  const dt = d || new Date();
  return { start: new Date(dt.getFullYear(), dt.getMonth(), 1, 0, 0, 0, 0),
           end: new Date(dt.getFullYear(), dt.getMonth() + 1, 0, 23, 59, 59, 999) };
}
function ofMonthRange(d){
  // شهر العمولة = الشهر التقويمي كامل (زي sales بالظبط — مختلف عن فترة المرتب)
  const dt = new Date(d || Date.now());
  return { start: new Date(dt.getFullYear(), dt.getMonth(), 1, 0, 0, 0, 0),
           end: new Date(dt.getFullYear(), dt.getMonth() + 1, 0, 23, 59, 59, 999) };
}
function ofMonthLabel(d){
  const dt = d || new Date();
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
}
function ofCountDayOffInRange(emp, start, end){
  if(emp.dayOff === undefined || emp.dayOff === null || emp.dayOff === '') return 0;
  let count = 0;
  const cur = new Date(start);
  while(cur <= end){
    if(cur.getDay() === Number(emp.dayOff)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
function ofCountRequiredInRange(emp, start, end){
  let count = 0;
  const cur = new Date(start);
  while(cur <= end){
    const isDayOff = (emp.dayOff !== undefined && emp.dayOff !== null && emp.dayOff !== '') && cur.getDay() === Number(emp.dayOff);
    if(!isDayOff) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/* ============================================================
   🗓️ محرك الإجازات الأسبوعي — **نسخة طبق الأصل من sales-app.js**
   ------------------------------------------------------------
   ⚠️⚠️ القاعدة: `ofComputeSalary` لازم تدّي **نفس الرقم** اللي بتدّيه
      `computeSalary` في تطبيق الحضور — رقمين مختلفين لنفس الموظفة
      معناه إن المالك مش عارف يصدّق مين. `test-office-money.js` بيقارن
      الاتنين رقم برقم وبيقع لو اختلفوا.
   🔴 أي تعديل هنا لازم يتعمل في `sales/sales-app.js` كمان، والعكس.

   القاعدة (قرار المالك): يوم إجازة لكل أسبوع، الأسبوع سبت→جمعة،
   وكل أسبوع بيتحاسب لوحده. الأسبوع بيتحاسب في الشهر اللي بيخلص فيه.
   ============================================================ */
function ofWeekStartKey(d, startDow){
  const dow = d.getDay();
  const back = (dow - (Number(startDow) || 0) + 7) % 7;
  const s = new Date(d.getTime());
  s.setDate(s.getDate() - back);
  return s.getFullYear() + '-' + String(s.getMonth() + 1).padStart(2, '0')
    + '-' + String(s.getDate()).padStart(2, '0');
}
function ofShiftCountsAsDay(sh, minHours, graceMin){
  if(!sh) return false;
  const min = Number(minHours);
  if(!(min > 0)) return true;
  if(!sh.clockOutTs) return true;
  const mins = Math.round((Number(sh.clockOutTs) - Number(sh.clockInTs)) / 60000);
  const g = (graceMin == null) ? 15 : Number(graceMin);
  return mins >= Math.round(min * 60) - g;
}
function ofWeeklyOffBalance(emp, start, end, shifts, cfg, opts){
  cfg = cfg || {};
  const perWeek = Number(cfg.weekOffDays);
  const offPerWeek = isNaN(perWeek) ? 1 : perWeek;
  const startDow = (cfg.weekStartDow == null) ? 6 : Number(cfg.weekStartDow);
  const minHours = Number(cfg.minShiftHours) || 0;
  const graceMin = (cfg.minShiftGraceMin == null) ? 15 : Number(cfg.minShiftGraceMin);
  const live = !!(opts && opts.live);

  const realStart = new Date(start);
  const backDays = (realStart.getDay() - startDow + 7) % 7;
  const scanStart = new Date(realStart.getTime());
  scanStart.setDate(scanStart.getDate() - backDays);
  if(opts && opts.hardStart){
    const hs = new Date(opts.hardStart);
    if(scanStart < hs) scanStart.setTime(hs.getTime());
  }
  const dk = function(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0'); };

  const scanFrom = new Date(scanStart.getFullYear(), scanStart.getMonth(), scanStart.getDate()).getTime();
  const attended = {}, full = {};
  (shifts || []).forEach(function(sh){
    if(!sh || sh.employeeId !== emp.id) return;
    if(sh.clockInTs < scanFrom || sh.clockInTs > end.getTime()) return;
    const k = dk(new Date(sh.clockInTs));
    attended[k] = 1;
    if(ofShiftCountsAsDay(sh, minHours, graceMin)) full[k] = 1;
  });

  const weeks = {};
  const cur = new Date(scanStart.getTime()), endC = new Date(end);
  while(cur <= endC){
    const wk = ofWeekStartKey(cur, startDow);
    if(!weeks[wk]) weeks[wk] = { days: 0, attended: 0, full: 0 };
    weeks[wk].days++;
    const k = dk(cur);
    if(attended[k]) weeks[wk].attended++;
    if(full[k]) weeks[wk].full++;
    cur.setDate(cur.getDate() + 1);
  }

  let requiredDays = 0, attendedDays = 0, shortfallDays = 0, surplusDays = 0;
  const weekRows = [];
  const keys = Object.keys(weeks).sort();
  keys.forEach(function(k, i){
    const w = weeks[k];
    const complete = w.days >= 7;
    const deferred = (i === keys.length - 1) && !complete && !live;
    if(deferred){
      weekRows.push({ week: k, days: w.days, entitled: 0, required: 0,
                      attended: w.attended, full: w.full, complete: false,
                      deferred: true, shortfall: 0, surplus: 0 });
      return;
    }
    const entitled = Math.min(offPerWeek, w.days);
    const req = Math.max(0, w.days - entitled);
    const short = Math.max(0, req - w.attended);
    const extra = complete ? Math.max(0, w.full - req) : 0;
    requiredDays += req; attendedDays += w.attended;
    shortfallDays += short; surplusDays += extra;
    weekRows.push({ week: k, days: w.days, entitled: entitled, required: req,
                    attended: w.attended, full: w.full, complete: complete,
                    deferred: false, shortfall: short, surplus: extra });
  });
  return { requiredDays: requiredDays, attendedDays: attendedDays,
           shortfallDays: shortfallDays, surplusDays: surplusDays, weeks: weekRows };
}

function ofCountAttendedInRange(shifts, empId, start, end){
  const daySet = {};
  (shifts || []).filter(function(sh){ return sh.employeeId === empId && sh.clockInTs >= start.getTime() && sh.clockInTs <= end.getTime(); })
    .forEach(function(sh){
      const d = new Date(sh.clockInTs);
      daySet[d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate()] = 1;
    });
  return Object.keys(daySet).length;
}
function ofTcAmnestied(dateStr, cfg){
  const until = String((cfg && cfg.timeAmnestyUntil) || '').trim();
  const d = String(dateStr || '').trim();
  if(!until || !d) return false;   // بند من غير تاريخ **بيتحسب** — مش بيفلت بالعفو
  return d <= until;
}
function ofTcCounts(x, cfg){
  return !!x && !x.excused && !ofTcAmnestied(x.date, cfg);
}
function ofMonthlyTimeSummary(entries, cfg){
  cfg = cfg || {};
  const totalHours = (entries || []).reduce(function(x, e){ return x + (Number(e.hours) || 0); }, 0);
  const perDay = Number(cfg.hoursPerDay) || 8;
  let days = Math.floor(totalHours / perDay);
  const cap = Number(cfg.maxDaysPerMonth) || 0;
  if(cap > 0 && days > cap) days = cap;
  return { totalHours: totalHours, days: days };
}
function ofIsSetupShift(emp, shiftDefs){
  if(!emp) return false;
  const sh = shiftDefs ? shiftDefs[emp.shift] : null;
  return !!(sh && sh.noBonus) || emp.shift === 'setup';
}

function ofDateKey(d){
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function ofEffectiveDayOffKey(emp, dateKey, reqs){
  if(!emp || !dateKey) return '';
  const p = String(dateKey).slice(0,10).split('-').map(Number);
  if(p.length!==3 || p.some(function(n){ return !Number.isFinite(n); })) return '';
  const d = new Date(p[0],p[1]-1,p[2],12,0,0,0);
  const back = (d.getDay()-6+7)%7;
  const ws = new Date(d); ws.setDate(ws.getDate()-back);
  const we = new Date(ws); we.setDate(we.getDate()+6);
  const a=ofDateKey(ws), b=ofDateKey(we);
  const changes=(reqs||[]).filter(function(l){ return l && l.empId===emp.id && l.status==='approved' && l.type==='changeDayoff' && String(l.dateKey||'')>=a && String(l.dateKey||'')<=b; })
    .sort(function(x,y){ return (Number(x.decidedAt||x.approvedAt||x.ts)||0)-(Number(y.decidedAt||y.approvedAt||y.ts)||0); });
  if(changes.length) return String(changes[changes.length-1].dateKey||'').slice(0,10);
  if(emp.dayOff===undefined || emp.dayOff===null || emp.dayOff==='') return '';
  const off=new Date(ws); off.setDate(off.getDate()+((Number(emp.dayOff)-6+7)%7));
  return ofDateKey(off);
}
function ofApprovedLeaveFor(empId,dateKey,reqs){
  return (reqs||[]).find(function(l){ return l && l.empId===empId && l.status==='approved' && l.dateKey===dateKey; }) || null;
}
function ofPayrollAttendanceBalance(emp,start,end,shifts,reqs){
  const byDay={};
  (shifts||[]).forEach(function(sh){
    if(!sh || sh.employeeId!==emp.id || !sh.clockInTs || sh.clockInTs<start.getTime() || sh.clockInTs>end.getTime()) return;
    const k=ofDateKey(new Date(sh.clockInTs)); (byDay[k]=byDay[k]||[]).push(sh);
  });
  const absenceDates=[], dayOffDates=[], workedDayOffDates=[], incompleteShifts=[];
  let requiredDays=0, attendedDays=0, attendedWorkDays=0, workedDayOffMinutes=0;
  const cur=new Date(start.getFullYear(),start.getMonth(),start.getDate(),12), last=new Date(end.getFullYear(),end.getMonth(),end.getDate(),12);
  while(cur<=last){
    const key=ofDateKey(cur), arr=byDay[key]||[], came=arr.length>0;
    if(came) attendedDays++;
    let mins=0;
    arr.forEach(function(sh){
      if(sh.clockInTs && !sh.clockOutTs){ incompleteShifts.push({date:key,shiftId:sh.id||'',clockInTs:sh.clockInTs}); return; }
      if(Number(sh.clockOutTs)>Number(sh.clockInTs)) mins += Math.max(0,Math.round((Number(sh.clockOutTs)-Number(sh.clockInTs))/60000));
    });
    mins=Math.min(480,mins);
    const isOff=ofEffectiveDayOffKey(emp,key,reqs)===key;
    const leave=ofApprovedLeaveFor(emp.id,key,reqs);
    if(isOff){
      dayOffDates.push(key);
      if(came && mins>0){ workedDayOffMinutes+=mins; workedDayOffDates.push({date:key,minutes:mins}); }
    } else {
      requiredDays++;
      if(came) attendedWorkDays++;
      else absenceDates.push({date:key,approved:!!(leave&&leave.type==='dayoff')});
    }
    cur.setDate(cur.getDate()+1);
  }
  return { requiredDays:requiredDays, attendedDays:attendedDays, attendedWorkDays:attendedWorkDays,
    absenceDays:absenceDates.length, absenceDates:absenceDates, dayOffDays:dayOffDates.length, dayOffDates:dayOffDates,
    workedDayOffHours:Math.round(workedDayOffMinutes/60*100)/100, workedDayOffDates:workedDayOffDates,
    incompleteShifts:incompleteShifts };
}
function ofPayCycleKeyOfAdvance(a,payDay){
  if(!a) return '';
  let d=null;
  const ds=String(a.date||'');
  if(ds.length>=10){ const p=ds.slice(0,10).split('-').map(Number); if(p.length===3&&p.every(Number.isFinite)) d=new Date(p[0],p[1]-1,p[2],12); }
  if(!d && a.ts) d=new Date(a.ts);
  if(!d) return '';
  let y=d.getFullYear(), m=d.getMonth();
  if(Number(payDay)>0 && d.getDate()<=Number(payDay)){ m--; if(m<0){m=11;y--;} }
  return y+'-'+String(m+1).padStart(2,'0');
}

// المحرك — نفس computeSalary في sales سطر بسطر، والبيانات في data:
// data = { shifts, timeCredit, deductions, advances, timeCfg, shiftDefs }
function ofComputeSalary(emp, periodStart, end, data){
  data = data || {};
  const baseSalary = emp.baseSalary || 0;
  const dailyRate = baseSalary / 30;
  const hourlyRate = dailyRate / 8;
  const naturalMonthEnd = ofMonthDateRange(periodStart).end;
  let start = periodStart, notYetHired = false, isPartialPeriod = end < naturalMonthEnd;
  if(emp.hireDate){
    const h=new Date(emp.hireDate+'T00:00:00');
    if(h>end) notYetHired=true; else if(h>start){ start=h; isPartialPeriod=true; }
  }
  if(notYetHired) return { proratedBase:0,overtimeMinutes:0,overtimePay:0,dayOffOccurrences:0,extraOffDays:0,deductionAmount:0,timeCreditHours:0,timeCreditDays:0,timeCreditDeduction:0,adminDeductions:0,dayOffBonusDays:0,dayOffBonusHours:0,dayOffBonusAmount:0,advancesTotal:0,advCash:0,advOrders:0,netSalary:0,daysInCalc:0,attendedDays:0,elapsedWorkDays:0,absenceDays:0,absenceDates:[],dayOffDates:[],workedDayOffDates:[],incompleteShifts:[],notYetHired:true };
  let daysInCalc=0; for(let d=new Date(start.getFullYear(),start.getMonth(),start.getDate(),12),e=new Date(end.getFullYear(),end.getMonth(),end.getDate(),12);d<=e;d.setDate(d.getDate()+1)) daysInCalc++;
  daysInCalc=Math.max(1,daysInCalc);
  const proratedBase=isPartialPeriod?Math.round(dailyRate*daysInCalc*100)/100:baseSalary;
  const allShifts=data.shifts||[];
  const rangeShifts=allShifts.filter(function(sh){ return sh.employeeId===emp.id&&sh.clockInTs>=start.getTime()&&sh.clockInTs<=end.getTime(); });
  const overtimeMinutes=rangeShifts.reduce(function(sum,sh){ return sum+(sh.otRequiresApproval?(Number(sh.overtimeApprovedMin)||0):(Number(sh.overtimeMinutes)||0)); },0);
  const overtimePay=Math.round((overtimeMinutes/60)*hourlyRate*100)/100;
  let absenceRangeStart=start;
  if(emp.attendanceTrackingStart){ const t=new Date(emp.attendanceTrackingStart+'T00:00:00'); if(t>absenceRangeStart) absenceRangeStart=t; }
  const cfg=data.timeCfg||{};
  if(cfg.weeklyStartFloor){ const f=new Date(cfg.weeklyStartFloor+'T00:00:00'); if(f>absenceRangeStart) absenceRangeStart=f; }
  let elapsedEnd=new Date()<end?new Date():end;
  // Office للمتابعة فقط: اليوم الجاري لا يتحكم عليه غياب قبل ما يخلص.
  if(elapsedEnd<end){ const today=new Date(); elapsedEnd=new Date(today.getFullYear(),today.getMonth(),today.getDate()-1,23,59,59,999); }
  const att=elapsedEnd<absenceRangeStart?{requiredDays:0,attendedDays:0,attendedWorkDays:0,absenceDays:0,absenceDates:[],dayOffDays:0,dayOffDates:[],workedDayOffHours:0,workedDayOffDates:[],incompleteShifts:[]}:ofPayrollAttendanceBalance(emp,absenceRangeStart,elapsedEnd,allShifts,data.leaves||[]);
  const elapsedWorkDays=att.requiredDays, attendedDays=att.attendedDays, absenceDays=att.absenceDays;
  const dayOffOccurrences=att.dayOffDays, extraOffDays=absenceDays;
  const deductionAmount=Math.round(extraOffDays*dailyRate*100)/100;
  const dayOffBonusHours=att.workedDayOffHours;
  const dayOffBonusDays=Math.round(dayOffBonusHours/8*1000)/1000;
  const dayOffBonusAmount=Math.round(dayOffBonusHours*hourlyRate*100)/100;
  const tcEntries=(data.timeCredit||[]).filter(function(x){
    if(ofIsSetupShift(emp,data.shiftDefs)) return false;
    if(x.employeeId!==emp.id||!ofTcCounts(x,cfg)) return false;
    const t=new Date((x.date||'')+'T00:00:00').getTime(); return t>=start.getTime()&&t<=end.getTime();
  });
  // 🏦 v640 — رصيد الوقت (نفس محرك sales/time-bank.js): السالب يتخصم بسعر الدقيقة، الموجب أوفرتايم.
  //    الحافز الأسبوعي بيتحسب في تطبيق sales (محتاج تقييمات العملاء) — Office بيعرض الرصيد بس.
  let bank=null, _otMin=overtimeMinutes, _otPay=overtimePay;
  const _bankOnHere = (typeof TimeBank!=='undefined') && TimeBank.enabledFor(cfg, start.getTime()) && !ofIsSetupShift(emp,data.shiftDefs);
  let tcSummary;
  if(_bankOnHere){
    const _req=function(sh){ const d=((data.shiftDefs||{})[sh.attendanceShiftKey])||{}; const st=sh.scheduledStartTime||d.start, en=sh.scheduledEndTime||d.end;
      if(!/^\d{1,2}:\d{2}$/.test(String(st))||!/^\d{1,2}:\d{2}$/.test(String(en))) return 0;
      const m=function(x){ const a=String(x).split(':').map(Number); return a[0]*60+(a[1]||0); }; let v=m(en)-m(st); if(v<=0) v+=1440; return v>16*60?0:v; };
    bank=TimeBank.monthSummary(rangeShifts,cfg,_req); const bm=TimeBank.money(bank.balanceMin,hourlyRate); bank.money=bm;
    _otMin=bm.overtimeMin; _otPay=bm.overtimePay;
    tcSummary=ofMonthlyTimeSummary(tcEntries.filter(function(x){ return x.type!=='late'&&x.type!=='early'; }),cfg);
  } else tcSummary=ofMonthlyTimeSummary(tcEntries,cfg);
  const timeCreditHours=bank?Math.round(bank.minusMin/60*100)/100:tcSummary.totalHours,timeCreditDays=tcSummary.days;
  const timeCreditDeduction=Math.round(((bank?bank.money.deduction:0)+timeCreditDays*dailyRate)*100)/100;
  const adminDeductions=(data.deductions||[]).filter(function(d){ const t=d.ts||new Date((d.date||'')+'T00:00:00').getTime(); return d.employeeId===emp.id&&t>=start.getTime()&&t<=end.getTime(); }).reduce(function(x,d){return x+(Number(d.amount)||0);},0);
  const full=end>=naturalMonthEnd;
  const payDay=Number(data.payDay)||6;
  const periodKey=ofMonthLabel(periodStart);
  const periodAdvances=(data.advances||[]).filter(function(a){
    if(a.employeeId!==emp.id) return false;
    if(full&&payDay>0) return ofPayCycleKeyOfAdvance(a,payDay)===periodKey;
    return a.ts>=start.getTime()&&a.ts<=end.getTime();
  });
  const advancesTotal=periodAdvances.reduce(function(sum,a){return sum+(Number(a.amount)||0);},0);
  const advCash=periodAdvances.filter(function(a){return String(a.source||'').indexOf('staff_order')!==0;}).reduce(function(x,a){return x+(Number(a.amount)||0);},0);
  const advOrders=Math.round((advancesTotal-advCash)*100)/100;
  const netSalary=Math.round((proratedBase-deductionAmount-timeCreditDeduction-adminDeductions+_otPay+dayOffBonusAmount-advancesTotal)*100)/100;
  return { bank:bank, proratedBase:proratedBase,overtimeMinutes:_otMin,overtimePay:_otPay,dayOffOccurrences:dayOffOccurrences,extraOffDays:extraOffDays,deductionAmount:deductionAmount,
    timeCreditHours:timeCreditHours,timeCreditDays:timeCreditDays,timeCreditDeduction:timeCreditDeduction,adminDeductions:adminDeductions,
    dayOffBonusDays:dayOffBonusDays,dayOffBonusHours:dayOffBonusHours,dayOffBonusAmount:dayOffBonusAmount,advancesTotal:advancesTotal,advCash:advCash,advOrders:advOrders,
    netSalary:netSalary,daysInCalc:daysInCalc,attendedDays:attendedDays,elapsedWorkDays:elapsedWorkDays,absenceDays:absenceDays,
    absenceDates:att.absenceDates,dayOffDates:att.dayOffDates,workedDayOffDates:att.workedDayOffDates,incompleteShifts:att.incompleteShifts,notYetHired:false };
}

// ⭐ عمولة النقط — نفس حساب لوحة sales: وزن الشهر − المدفوع (تنزيلات التطبيق
//    ليها نوعها المنفصل type='referrals' ومش بتتحسب هنا)
function ofCommissionCalc(points, payments, empId, startMs, endMs, monthLabel, rate){
  let pointsMonth = 0;
  (points || []).forEach(function(pp){
    if(!pp || pp.employeeId !== empId) return;
    if(!(pp.ts >= startMs && pp.ts <= endMs)) return;
    const v = Number(pp.value);
    pointsMonth += (isNaN(v) || v <= 0) ? 1 : v;
  });
  pointsMonth = Math.round(pointsMonth * 1000) / 1000;
  const paid = (payments || []).filter(function(pm){ return pm.employeeId === empId && pm.monthLabel === monthLabel && pm.type !== 'referrals'; });
  const pointsAlreadyPaid = paid.reduce(function(x, pm){ return x + (pm.pointsCount || 0); }, 0);
  const amountAlreadyPaid = paid.reduce(function(x, pm){ return x + (pm.commissionAmount || 0); }, 0);
  const newPoints = Math.max(0, Math.round((pointsMonth - pointsAlreadyPaid) * 1000) / 1000);
  const newAmount = Math.round(newPoints * (Number(rate) || 0) * 100) / 100;
  return { pointsMonth: pointsMonth, pointsAlreadyPaid: pointsAlreadyPaid,
           amountAlreadyPaid: amountAlreadyPaid, newPoints: newPoints, newAmount: newAmount };
}

window.O2Pay = { compute: ofComputeSalary, commission: ofCommissionCalc, monthLabel: ofMonthLabel, monthDateRange: ofMonthDateRange, monthRange: ofMonthRange, isSetupShift: ofIsSetupShift };
})();
