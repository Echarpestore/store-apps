if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}

// ==================== ANNOUNCEMENT + DAILY TARGET ====================
function renderAnnouncementBanner(){
  const el = document.querySelector('#announcementBanner');
  if(!el) return;
  if(!window.currentAnnouncement || !window.currentAnnouncement.trim()){
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = 'flex';
  el.innerHTML = `<span>📢</span><span>${window.currentAnnouncement}</span>`;
}

function renderDailyTargetCard(){
  const el = document.querySelector('#dailyTargetCard');
  if(!el) return;
  if(!window.dailyTarget || window.dailyTarget <= 0){
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  const dayStart = new Date(); dayStart.setHours(0,0,0,0);
  const empIds = new Set(window.employees.map(e=> e.id));
  const achieved = window.points.filter(p=> empIds.has(p.employeeId) && p.ts >= dayStart.getTime()).length;
  const pct = Math.min(100, Math.round(achieved/window.dailyTarget*100));
  const remaining = Math.max(0, window.dailyTarget - achieved);
  const isDone = achieved >= window.dailyTarget;

  el.style.display = 'block';
  el.innerHTML = `
    <div class="targetHead">
      <span>🎯 التارجت اليومي</span>
      <span style="color:${isDone?'var(--good)':'var(--gold)'};">${achieved}/${window.dailyTarget}</span>
    </div>
    <div class="targetBarTrack"><div class="targetBarFill${isDone?' done':''}" style="width:${pct}%;"></div></div>
    <div class="targetSub">${isDone ? '✅ تم تحقيق التارجت — شكرًا لمجهودكم!' : 'باقي ' + remaining + ' نقطة'}</div>
  `;

  if(isDone){
    const today = window.todayStr();
    const otherScreenOpen = document.querySelector('#admin').classList.contains('show') || document.querySelector('#attendance').classList.contains('show') || document.querySelector('#leaderboard').classList.contains('show');
    if(targetCelebrationShownFor !== today && !otherScreenOpen){
      targetCelebrationShownFor = today;
      document.querySelector('#targetCelebration').classList.add('show');
    }
  }
}
document.querySelector('#targetCelebrationClose')?.addEventListener('click', ()=> document.querySelector('#targetCelebration').classList.remove('show'));

// ⚙️ نموذج إعدادات الالتزام والمكافآت (أدمن)
window.renderComplianceSettingsForm = function(){
  window.applyRegButtonVisibility();
  const wrap = document.querySelector('#complianceSettingsForm'); if(!wrap) return;
  if(wrap.dataset.editing === '1') return;   // ما نكتبش فوق المستخدم وهو بيكتب
  const c = window.complianceCfg;
  const fld = (label, id, val, suffix)=>`
    <label style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:9px; font-size:13px;">
      <span>${label}</span>
      <span style="display:flex; align-items:center; gap:6px;">
        <input id="${id}" value="${val}" inputmode="numeric"
          onfocus="this.closest('#complianceSettingsForm').dataset.editing='1'"
          onblur="this.closest('#complianceSettingsForm').dataset.editing='0'"
          style="width:64px; padding:8px; border-radius:9px; border:1px solid var(--line); background:var(--panel2); color:var(--ink); font-family:'Cairo'; font-weight:800; text-align:center;">
        <span style="color:var(--sub); font-size:11px;">${suffix||''}</span>
      </span>
    </label>`;
  const wsum = c.weights.commitment + c.weights.sales + c.weights.rating;
  wrap.innerHTML = `
    <div style="display:flex; flex-direction:column;">
      ${fld('💰 الخصم للمخالفة', 'csPenalty', c.penalty, 'ج.م')}
      ${fld('⏰ سماح التأخير', 'csGrace', c.lateGraceMin, 'دقيقة')}
      <div style="height:1px; background:var(--line); margin:8px 0 12px;"></div>
      <div style="font-size:12px; color:var(--sub); margin-bottom:8px;">أوزان المكافأة (المجموع لازم = 100)</div>
      ${fld('🎯 وزن الالتزام', 'csWc', c.weights.commitment, '%')}
      ${fld('🛒 وزن المبيعات', 'csWs', c.weights.sales, '%')}
      ${fld('⭐ وزن التقييم', 'csWr', c.weights.rating, '%')}
      <div id="csWsum" style="font-size:11.5px; color:${wsum===100?'var(--sub)':'#e0796b'}; margin:2px 0 12px;">المجموع الحالي: ${wsum}${wsum===100?' ✅':' — لازم يبقى 100'}</div>
      <div style="height:1px; background:var(--line); margin:0 0 12px;"></div>
      <div style="font-size:12px; color:var(--sub); margin-bottom:8px;">مواعيد الشيفتات (HH:MM بنظام 24 ساعة)</div>
      <label style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:9px; font-size:13px;">
        <span>🌅 صباحي</span>
        <span style="display:flex; gap:6px;">
          <input id="csMorningStart" value="${c.shifts.morning.start}" onfocus="this.closest('#complianceSettingsForm').dataset.editing='1'" onblur="this.closest('#complianceSettingsForm').dataset.editing='0'" style="width:64px; padding:8px; border-radius:9px; border:1px solid var(--line); background:var(--panel2); color:var(--ink); font-family:'Cairo'; text-align:center;">
          <input id="csMorningEnd" value="${c.shifts.morning.end}" onfocus="this.closest('#complianceSettingsForm').dataset.editing='1'" onblur="this.closest('#complianceSettingsForm').dataset.editing='0'" style="width:64px; padding:8px; border-radius:9px; border:1px solid var(--line); background:var(--panel2); color:var(--ink); font-family:'Cairo'; text-align:center;">
        </span>
      </label>
      <label style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:14px; font-size:13px;">
        <span>🌆 مسائي</span>
        <span style="display:flex; gap:6px;">
          <input id="csEveningStart" value="${c.shifts.evening.start}" onfocus="this.closest('#complianceSettingsForm').dataset.editing='1'" onblur="this.closest('#complianceSettingsForm').dataset.editing='0'" style="width:64px; padding:8px; border-radius:9px; border:1px solid var(--line); background:var(--panel2); color:var(--ink); font-family:'Cairo'; text-align:center;">
          <input id="csEveningEnd" value="${c.shifts.evening.end}" onfocus="this.closest('#complianceSettingsForm').dataset.editing='1'" onblur="this.closest('#complianceSettingsForm').dataset.editing='0'" style="width:64px; padding:8px; border-radius:9px; border:1px solid var(--line); background:var(--panel2); color:var(--ink); font-family:'Cairo'; text-align:center;">
        </span>
      </label>
      <button onclick="saveComplianceSettings()" style="width:100%; padding:13px; border:none; border-radius:12px; background:linear-gradient(180deg,var(--gold),#d9a838); color:#1b1400; font-family:'Cairo'; font-weight:800; font-size:14px; cursor:pointer;">💾 حفظ الإعدادات</button>
    </div>`;
}

// 🔍 لوحة مراجعة المخالفات المكتشفة (آخر 14 يوم)
function renderViolationsReview(){
  const wrap = document.querySelector('#violationsReview'); if(!wrap) return;
  const badge = document.querySelector('#vioBadge');
  const to = new Date(); to.setDate(to.getDate()-1);           // لحد امبارح (النهاردة لسه شغال)
  const from = new Date(); from.setDate(from.getDate()-14);
  const emps = (window.employees||[]).filter(e=> e.active !== false);

  let all = [];
  emps.forEach(emp=>{
    // أيام حضوره
    const byDay = {};
    (window.allShifts||[]).filter(sh=> sh.employeeId===emp.id).forEach(sh=>{
      if(sh.clockInTs) byDay[window.todayStr(sh.clockInTs)] = true;
    });
    // الأيام اللي الأدمن حسمها
    const resolved = {};
    allVioReviews.filter(v=> v.employeeId===emp.id).forEach(v=>{ resolved[v.date] = v.decision; });
    // ما نرجعش لأيام قبل ما الموظف يتسجّل
    const createdAt = emp.createdAt ? new Date(emp.createdAt) : from;
    const realFrom = createdAt > from ? createdAt : from;
    detectViolations(emp, realFrom, to, byDay, resolved, todayStrFromDate)
      .forEach(v=> all.push({ ...v, empId: emp.id, empName: emp.name, gender: emp.gender }));
  });

  all.sort((a,b)=> (a.date < b.date ? 1 : -1));
  if(badge){ badge.textContent = all.length; badge.style.display = all.length ? 'inline-flex' : 'none'; }
  if(!all.length){ wrap.innerHTML = '<p style="color:var(--sub); font-size:12px;">مفيش مخالفات محتاجة مراجعة ✅</p>'; return; }

  wrap.innerHTML = all.map(v=>{
    const dLabel = _rwDayNames[new Date(v.date+'T00:00:00').getDay()] || '';
    const extra = v.type==='dayoffSwap' && v.workedOn ? ` (اشتغل يوم ${_rwDayNames[new Date(v.workedOn+'T00:00:00').getDay()]||''} بدل إجازته)` : '';
    return `<div style="background:var(--panel); border:1px solid #5a3a3a; border-radius:13px; padding:13px; margin-bottom:9px;">
      <div style="font-weight:800; font-size:14.5px;">${v.empName}</div>
      <div style="color:var(--sub); font-size:12.5px; margin:4px 0 11px; line-height:1.6;">
        ${v.type==='dayoffSwap' ? '📅' : '🚫'} ${v.label} — ${dLabel} ${v.date}${extra}
      </div>
      <div style="display:flex; gap:8px;">
        <button onclick="resolveViolation('${v.empId}','${v.date}','${v.type}','deducted')" style="flex:1; padding:11px; border:none; border-radius:10px; background:linear-gradient(180deg,#5a3a3a,#3a2422); color:#f0b0a0; font-family:'Cairo'; font-weight:800; cursor:pointer;">خصم ${window.complianceCfg.penalty} ج</button>
        <button onclick="resolveViolation('${v.empId}','${v.date}','${v.type}','excused')" style="flex:1; padding:11px; border:1px solid var(--line); border-radius:10px; background:var(--panel2); color:var(--sub); font-family:'Cairo'; font-weight:700; cursor:pointer;">إجازة بموافقتي</button>
      </div>
    </div>`;
  }).join('');
}

// مفتاح يوم من كائن تاريخ (نفس صيغة todayStr)
function todayStrFromDate(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

window.resolveViolation = async function(empId, date, type, decision){
  const emp = (window.employees||[]).find(e=> e.id===empId);
  const name = emp ? emp.name : '';
  if(decision==='deducted' && !confirm('تأكيد خصم ' + window.complianceCfg.penalty + ' ج على ' + name + '؟')) return;
  try{
    await window.fbAddDoc(window.fbCollection(window.db,'sales_violation_reviews'), {
      employeeId: empId, employeeName: name, branch: window.currentBranch,
      date, type, decision, ts: Date.now()
    });
    if(decision==='deducted'){
      await window.fbAddDoc(window.fbCollection(window.db,'sales_deductions'), {
        employeeId: empId, employeeName: name, branch: window.currentBranch,
        type: (type==='dayoffSwap' ? 'dayoffSwap' : 'absence'),
        amount: window.complianceCfg.penalty, date, ts: Date.now()
      });
    }
  }catch(e){ alert('تعذر الحفظ: ' + e.message); }
};

// 🔍 لوحة المخالفات المكتشفة — الأدمن بيقرر
window.renderAttIssues = function(){
  const wrap = document.querySelector('#attIssuesList'); if(!wrap) return;
  const emps = (window.employees||[]).filter(e=> e.branch === window.currentBranch);
  const shifts = (window.allShifts||[]).filter(sh=> sh.branch === window.currentBranch);
  // قرارات سابقة → عشان متظهرش تاني
  const decided = {};
  (window.allAttDecisions||[]).forEach(d=>{ decided[d.empId + '|' + d.dateKey] = d.decision; });
  // آخر 30 يوم
  const to = Date.now(), from = to - 30*86400000;
  const raw = window.detectAttendanceIssues(emps, shifts, from, to, decided, Date.now());
  const { swaps, singles } = window.pairSwaps(raw);
  const all = [...swaps, ...singles].sort((a,b)=> a.dateKey < b.dateKey ? 1 : -1);

  const badge = document.querySelector('#issuesBadge');
  if(badge){ badge.textContent = all.length; badge.style.display = all.length ? 'inline-flex' : 'none'; }

  if(!all.length){ wrap.innerHTML = '<p style="color:var(--sub); font-size:12px;">مفيش مخالفات محتاجة مراجعة ✅</p>'; return; }

  const dayName = ['الأحد','الاتنين','التلات','الأربع','الخميس','الجمعة','السبت'];
  const meta = {
    absent:       { icon:'🚫', title:'غياب في يوم شغل',     kind:'absent'      },
    workedDayOff: { icon:'📅', title:'اشتغل في يوم إجازته', kind:'dayoffSwap'  },
    dayoffSwap:   { icon:'🔄', title:'بدّل يوم إجازته',      kind:'dayoffSwap'  }
  };
  wrap.innerHTML = all.map(i=>{
    const m = meta[i.type] || meta.absent;
    const extra = i.pairedWith ? ` (اشتغل بدلها ${i.pairedWith})` : '';
    return `<div style="background:var(--panel); border:1px solid #5a3a3a; border-radius:13px; padding:12px 13px; margin-bottom:9px;">
      <div style="font-weight:800; font-size:14px;">${m.icon} ${i.empName}</div>
      <div style="color:var(--sub); font-size:12.5px; margin:4px 0 11px;">${m.title} — ${dayName[i.dow]} ${i.dateKey}${extra}</div>
      <div style="display:flex; gap:8px;">
        <button onclick="decideIssue('${i.empId}','${i.empName}','${i.dateKey}','${m.kind}','charge')" style="flex:1; padding:10px; border:none; border-radius:10px; background:linear-gradient(180deg,#5a3a3a,#3a2422); color:#ffb4a6; font-family:'Cairo'; font-weight:800; cursor:pointer;">خصم ${window.complianceCfg.penalty} ج</button>
        <button onclick="decideIssue('${i.empId}','${i.empName}','${i.dateKey}','${m.kind}','ignore')" style="flex:1; padding:10px; border:1px solid var(--line); border-radius:10px; background:var(--panel2); color:var(--sub); font-family:'Cairo'; font-weight:700; cursor:pointer;">تجاهل (بموافقتي)</button>
      </div>
    </div>`;
  }).join('');
}

// قرار الأدمن على مخالفة: خصم أو تجاهل — الاتنين بيتسجّلوا فمش هتظهر تاني
window.decideIssue = async function(empId, empName, dateKey, kind, action){
  try{
    await window.fbAddDoc(window.fbCollection(window.db,'sales_att_decisions'), {
      empId, empName, dateKey, type: kind, branch: window.currentBranch,
      decision: action === 'charge' ? 'charged' : 'ignored',
      ts: Date.now()
    });
    if(action === 'charge'){
      await window.fbAddDoc(window.fbCollection(window.db,'sales_deductions'), {
        employeeId: empId, employeeName: empName, branch: window.currentBranch,
        type: kind, amount: window.complianceCfg.penalty, date: dateKey, ts: Date.now()
      });
    }
  }catch(e){ alert('تعذر تسجيل القرار: ' + e.message); }
};

// 💰 كشف الخصومات (الشهر الحالي)
// ⏳ كشف رصيد الوقت الشهري لكل موظف + زر العذر
// 📩 لوحة طلبات الإذن (أدمن) — بحساب التغطية
function updateLeaveBadge(){
  const pend = (window.allLeaveReqs||[]).filter(l=> l.status==='pending' && l.branch===window.currentBranch).length;
  const el = document.querySelector('#leaveBadge');
  if(el){ el.textContent = pend; el.style.display = pend ? 'inline-flex' : 'none'; }
}

window.renderLeaveRequests = function(){
  const wrap = document.querySelector('#leaveRequestsList'); if(!wrap) return;
  const cfg = window.timeCfg || window.timeCfgDefaults;
  const pend = (window.allLeaveReqs||[]).filter(l=> l.status==='pending' && l.branch===window.currentBranch)
                  .sort((a,b)=>(a.dateKey<b.dateKey?-1:1));
  updateLeaveBadge();
  if(!pend.length){ wrap.innerHTML='<p style="color:var(--sub); font-size:12px;">مفيش طلبات مستنية ✅</p>'; return; }

  const emps = (window.employees||[]).filter(e=> e.branch===window.currentBranch);
  const approved = (window.allLeaveReqs||[]).filter(l=> l.status==='approved');
  const minStaff = Number(cfg.minStaffPerDay)||2;
  const typeLabel = { dayoff:'🌴 إجازة يوم', changeDayoff:'📅 تغيير يوم الإجازة', shiftSwap:'🔄 تبديل شيفت' };
  const dayName = ['الأحد','الاتنين','التلات','الأربع','الخميس','الجمعة','السبت'];

  wrap.innerHTML = pend.map(l=>{
    const chk = window.checkLeaveRequest(emps, approved, l.dateKey, minStaff);
    const d = new Date(l.dateKey+'T00:00:00');
    const cov = chk.safe
      ? `<div style="color:#5ec88a; font-size:12px;">🟢 لو وافقت هيتبقى ${chk.availableAfter} في الفرع (الحد ${minStaff}) — تغطية كويسة</div>`
      : `<div style="color:#e0796b; font-size:12px;">🔴 تحذير: هيتبقى ${chk.availableAfter} بس (الحد ${minStaff}) — ناقص ${chk.shortBy}</div>`;
    return `<div style="background:var(--panel); border:1px solid ${chk.safe?'var(--line)':'#5a3a3a'}; border-radius:13px; padding:13px; margin-bottom:9px;">
      <div style="font-weight:800; font-size:14px;">${l.empName} — ${typeLabel[l.type]||l.type}${
        (l.type==='shiftSwap' && l.toShift)
          ? ` <small style="color:var(--gold); font-weight:700;">(${l.fromShift==='evening'?'🌆 مسائي':'🌅 صباحي'} ← ${l.toShift==='evening'?'🌆 مسائي':'🌅 صباحي'})</small>`
          : ''}</div>
      <div style="color:var(--sub); font-size:12.5px; margin:4px 0;">${dayName[d.getDay()]} ${l.dateKey}${l.reason?(' · '+l.reason):''}</div>
      ${cov}
      <div style="display:flex; gap:8px; margin-top:11px;">
        <button onclick="decideLeave('${l.id}','approved')" style="flex:1; padding:10px; border:none; border-radius:10px; background:linear-gradient(180deg,#3fbf60,#1f9440); color:#fff; font-family:'Cairo'; font-weight:800; cursor:pointer;">${chk.safe?'✅ موافقة':'موافقة برغم التحذير'}</button>
        <button onclick="decideLeave('${l.id}','rejected')" style="padding:10px 16px; border:1px solid var(--line); border-radius:10px; background:var(--panel2); color:var(--sub); font-family:'Cairo'; font-weight:700; cursor:pointer;">رفض</button>
      </div>
    </div>`;
  }).join('');
};

window.decideLeave = async function(id, decision){
  const l = (window.allLeaveReqs||[]).find(x=> x.id===id); if(!l) return;
  try{
    await window.fbUpdateDoc(window.fbDoc(window.db,'sales_leave_requests', id), { status: decision, decidedAt: Date.now() });
  }catch(e){ alert('تعذر الحفظ: '+e.message); }
};

window.renderTimeCreditLog = function(){
  const wrap = document.querySelector('#timeCreditLog'); if(!wrap) return;
  const cfg = window.timeCfg || window.timeCfgDefaults;
  const now = new Date();
  const mk = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const rows = (window.allTimeCredit||[]).filter(x=> x.branch===window.currentBranch && String(x.date||'').startsWith(mk));
  const emps = (window.employees||[]).filter(e=> e.branch===window.currentBranch && e.active!==false);
  if(!emps.length){ wrap.innerHTML='<p style="color:var(--sub); font-size:12px;">مفيش موظفين.</p>'; return; }

  const typeLabel = { late:'⏰ تأخير', break:'☕ بريك', swap:'🔄 تبديل', early:'🚪 انصراف بدري', absence:'🚫 غياب' };
  const perDay = Number(cfg.hoursPerDay)||7;

  wrap.innerHTML = emps.map(emp=>{
    const mine = rows.filter(r=> r.employeeId===emp.id && !r.excused);
    const totalH = mine.reduce((x,r)=> x+(Number(r.hours)||0), 0);
    const days = Math.floor(totalH/perDay);
    const eligible = totalH <= (Number(cfg.allowedHoursMonth)||7);
    const statusColor = eligible ? '#5ec88a' : '#e0796b';
    const detail = mine.length
      ? mine.sort((a,b)=>(b.ts||0)-(a.ts||0)).map(r=>`
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 0; border-bottom:1px solid var(--line); font-size:12.5px;">
            <span>${typeLabel[r.type]||r.type} · ${r.hours} ساعة <span style="color:var(--sub);">${r.note?('· '+r.note):''} · ${r.date}</span></span>
            <button onclick="excuseTimeCredit('${r.id}')" style="flex-shrink:0; border:1px solid var(--line); background:var(--panel2); color:var(--sub); border-radius:8px; padding:5px 10px; font-family:'Cairo'; font-size:11px; cursor:pointer;">🩺 بعذر</button>
          </div>`).join('')
      : '<div style="color:var(--sub); font-size:12px; padding:6px 0;">مفيش رصيد الشهر ده ✅</div>';

    return `<div style="background:var(--panel); border:1px solid var(--line); border-radius:13px; padding:13px; margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
        <div style="font-weight:800; font-size:14px;">${emp.name}</div>
        <div style="text-align:left;">
          <div style="font-weight:900; color:${statusColor}; font-size:15px;">${totalH} ساعة</div>
          <div style="font-size:11px; color:var(--sub);">${eligible?'✅ في المكافأة':'❌ خارج المكافأة'}${days>0?(' · 💰 '+days+' يوم خصم'):''}</div>
        </div>
      </div>
      ${detail}
    </div>`;
  }).join('');
};

// 🩺 عذر بند رصيد وقت — بيصفّر ساعاته ويحتفظ بالسجل
window.excuseTimeCredit = async function(id){
  const reason = prompt('سبب العذر؟ (مرض / ظرف / بأمر مني ...)');
  if(reason===null) return;
  const item = (window.allTimeCredit||[]).find(x=> x.id===id); if(!item) return;
  try{
    await window.fbUpdateDoc(window.fbDoc(window.db,'sales_time_credit', id), {
      hours: 0, originalHours: item.hours, excused: true, excuseReason: reason || 'بعذر', excusedAt: Date.now()
    });
  }catch(e){ alert('تعذر تسجيل العذر: '+e.message); }
};

window.renderDeductionsLog = function(){
  const wrap = document.querySelector('#deductionsLog'); if(!wrap) return;
  const now = new Date();
  const mk = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const rows = (window.deductions||[]).filter(d=> String(d.date||'').startsWith(mk)).sort((a,b)=> (b.ts||0)-(a.ts||0));
  if(!rows.length){ wrap.innerHTML = '<p style="color:var(--sub); font-size:12px;">مفيش خصومات الشهر ده ✅</p>'; return; }
  // إجمالي لكل موظف
  const byEmp = {};
  rows.forEach(d=>{ byEmp[d.employeeName] = (byEmp[d.employeeName]||0) + (Number(d.amount)||0); });
  const total = rows.reduce((x,d)=> x + (Number(d.amount)||0), 0);
  const label = { late:'⏰ تأخير', shiftSwap:'🔄 تبديل شيفت', dayoffSwap:'📅 تبديل إجازة', absence:'🚫 غياب' };
  wrap.innerHTML = `
    <div style="display:flex; flex-wrap:wrap; gap:7px; margin-bottom:12px;">
      ${Object.entries(byEmp).map(([n,v])=>`<span style="background:var(--panel2); border:1px solid var(--line); border-radius:99px; padding:6px 12px; font-size:12px; font-weight:700;">${n}: <b style="color:#e0796b;">${v} ج</b></span>`).join('')}
      <span style="background:linear-gradient(180deg,#3a1e1a,var(--panel2)); border:1px solid #5a3a3a; border-radius:99px; padding:6px 12px; font-size:12px; font-weight:800;">الإجمالي: ${total} ج</span>
    </div>
    ${rows.map(d=>`
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:9px 11px; border-bottom:1px solid var(--line); font-size:13px;">
        <span><b>${(d.employeeName||'—')}</b> · ${label[d.type]||d.type}${d.lateMin?(' ('+d.lateMin+'د)'):''}</span>
        <span style="display:flex; align-items:center; gap:10px;">
          <span style="color:#e0796b; font-weight:800;">-${d.amount} ج</span>
          <span style="color:var(--sub); font-size:11px;">${d.date||''}</span>
          <button onclick="deleteDeduction('${d.id}')" title="حذف" style="border:1px solid var(--line); background:var(--panel2); color:var(--sub); border-radius:8px; padding:4px 9px; cursor:pointer; font-family:'Cairo';">✖</button>
        </span>
      </div>`).join('')}`;
}

window.deleteDeduction = async function(id){
  if(!confirm('تشيل الخصم ده؟')) return;
  try{ await window.fbDeleteDoc(window.fbDoc(window.db,'sales_deductions', id)); }catch(e){ alert('تعذر الحذف: '+e.message); }
};

// ➕ تسجيل تبديل (شيفت / يوم إجازة) — بيتسجل ساعات رصيد وقت مش غرامة ثابتة:
// أول تبديل في الشهر مجاني وبعده كل تبديل بساعاته (قرار المالك — swapHoursFrom)
window.openSwapDeduction = function(){
  const emps = (window.employees||[]).filter(e=> e.active !== false);
  if(!emps.length){ alert('مفيش موظفين في الفرع ده'); return; }
  const names = emps.map((e,i)=> (i+1)+') '+e.name).join('\n');
  const pick = prompt('اختار رقم الموظف:\n'+names);
  const idx = parseInt(pick,10)-1;
  if(isNaN(idx) || !emps[idx]) return;
  const emp = emps[idx];
  const t = prompt('نوع التبديل:\n1) تبديل شيفت\n2) تبديل يوم إجازة');
  if(t!=='1' && t!=='2'){ return; }
  const cfg = window.timeCfg || window.timeCfgDefaults;
  const mk = new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0');
  const priorSwaps = (window.allTimeCredit||[]).filter(x=>
    x.employeeId===emp.id && x.type==='swap' && !x.excused && String(x.date||'').startsWith(mk)).length;
  const hours = window.swapHoursFrom(priorSwaps + 1, cfg) - window.swapHoursFrom(priorSwaps, cfg);
  const note = t==='1' ? 'تبديل شيفت' : 'تبديل يوم إجازة';
  window.fbAddDoc(window.fbCollection(window.db,'sales_time_credit'), {
    employeeId: emp.id, employeeName: emp.name, branch: window.currentBranch,
    type:'swap', hours, date: window.todayStr(), note, ts: Date.now()
  }).then(()=> alert(hours > 0
      ? ('اتسجّل تبديل بـ'+hours+' ساعة رصيد على '+emp.name+' ✅')
      : ('اتسجّل التبديل — الأول في الشهر مجاني لـ'+emp.name+' ✅'))
  ).catch(e=> alert('تعذر التسجيل: '+e.message));
};

window.applyRegButtonVisibility = function(){
  const btn = document.querySelector('#openRegBtn');
  if(btn) btn.style.display = window.regButtonOn ? '' : 'none';
  const t = document.querySelector('#regBtnToggle');
  if(t){
    t.textContent = window.regButtonOn ? '🟢 ظاهر — اضغط للإخفاء' : '⚪ مخفي — اضغط للإظهار';
    t.style.background = window.regButtonOn ? 'linear-gradient(180deg,#1e3a2a,#16241c)' : 'var(--panel)';
    t.style.color = window.regButtonOn ? '#5ec88a' : 'var(--sub)';
    t.style.border = '1px solid ' + (window.regButtonOn ? '#2e5a42' : 'var(--line)');
  }
}
window.toggleRegButton = async function(){
  const next = !window.regButtonOn;
  try{
    const b = window.currentBranch;
    if(!b){ alert('اختار فرع الجهاز الأول'); return; }
    await window.fbSetDoc(window.fbDoc(window.db,'sales_settings', b), { regButtonOn: next }, { merge:true });
    window.regButtonOn = next;
    window.applyRegButtonVisibility();
  }catch(e){ alert('تعذر الحفظ: ' + e.message); }
};

// 🏬 إدارة الفروع: عرض + حذف الفروع الفاضية
window.renderBranchManage = function(){
  const wrap = document.querySelector('#branchManageList'); if(!wrap) return;
  const set = new Set();
  (window.allEmployeesAll||[]).forEach(e=> e.branch && set.add(e.branch));
  (window.allShifts||[]).forEach(x=> x.branch && set.add(x.branch));
  (window.allSettingsDocs||[]).forEach(id=> id && set.add(id));
  (window.allAdvancesAll||[]).forEach(x=> x.branch && set.add(x.branch));
  if(window.currentBranch) set.add(window.currentBranch);
  try{ (JSON.parse(localStorage.getItem('sales_branch_list')||'[]')||[]).forEach(b=> b && set.add(b)); }catch(e){}
  const branches=[...set].filter(Boolean).sort();
  if(!branches.length){ wrap.innerHTML='<p style="color:var(--sub); font-size:12px;">مفيش فروع.</p>'; return; }

  wrap.innerHTML = branches.map(b=>{
    // بنعدّ البيانات المرتبطة بالفرع — لو فيه حاجة مبنسمحش بالحذف
    const emps  = (window.allEmployeesAll||[]).filter(e=> e.branch===b).length;
    const shf   = (window.allShifts||[]).filter(x=> x.branch===b).length;
    const adv   = (window.allAdvancesAll||[]).filter(x=> x.branch===b).length;
    const used  = emps + shf + adv;
    const isCur = b === window.currentBranch;
    const safe  = b.replace(/'/g, "\\'");
    return `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; background:var(--panel2); border:1px solid ${isCur?'var(--gold-dim)':'var(--line)'}; border-radius:12px; padding:12px 14px; margin-bottom:9px;">
      <div style="min-width:0;">
        <div style="font-weight:800; font-size:14px;">${b} ${isCur?'<span style="color:var(--gold); font-size:11px;">(فرع الجهاز ده)</span>':''}</div>
        <div style="color:var(--sub); font-size:11.5px; margin-top:2px;">
          ${used ? `${emps} موظف · ${shf} حضور · ${adv} سلفة` : 'فاضي — مفيش أي بيانات'}
        </div>
      </div>
      ${used || isCur
        ? `<span style="color:var(--sub); font-size:11px; flex-shrink:0;">${isCur?'مش هيتشال':'فيه بيانات'}</span>`
        : `<button onclick="deleteBranch('${safe}')" style="flex-shrink:0; border:1px solid #5a3a3a; background:var(--panel); color:#e0796b; border-radius:9px; padding:8px 14px; font-family:'Cairo'; font-weight:700; font-size:12.5px; cursor:pointer;">🗑️ شيله</button>`}
    </div>`;
  }).join('');
};

window.deleteBranch = async function(name){
  if(!confirm('تشيل فرع "'+name+'" من القايمة؟')) return;
  try{
    // نشيل مستند إعداداته (لو موجود) + من القايمة المحفوظة محليًا
    try{ await window.fbDeleteDoc(window.fbDoc(window.db,'sales_settings', name)); }catch(e){}
    try{
      const list = JSON.parse(localStorage.getItem('sales_branch_list')||'[]').filter(b=> b!==name);
      localStorage.setItem('sales_branch_list', JSON.stringify(list));
    }catch(e){}
    window.allSettingsDocs = (window.allSettingsDocs||[]).filter(id=> id!==name);
    window.renderBranchManage();
    alert('اتشال الفرع من القايمة ✅');
  }catch(e){ alert('تعذر الحذف: '+e.message); }
};

// ⚙️ لوحة إعدادات رصيد الوقت
window.renderTimeSettings = function(){
  const wrap = document.querySelector('#timeSettingsForm'); if(!wrap) return;
  if(wrap.dataset.editing === '1') return;
  const c = window.timeCfg || window.timeCfgDefaults;
  const row = (label, id, val, hint)=>`
    <label style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; font-size:13px;">
      <span style="flex:1;">${label}${hint?`<br><small style="color:var(--sub); font-size:10.5px;">${hint}</small>`:''}</span>
      <input id="${id}" value="${val}" inputmode="numeric"
        onfocus="this.closest('#timeSettingsForm').dataset.editing='1'"
        onblur="this.closest('#timeSettingsForm').dataset.editing='0'"
        style="width:60px; padding:8px; border-radius:9px; border:1px solid var(--line); background:var(--panel2); color:var(--ink); font-family:'Cairo'; font-weight:800; text-align:center; flex-shrink:0;">
    </label>`;
  wrap.innerHTML = `
    <div style="font-size:12px; color:var(--sub); margin-bottom:8px;">⏰ التأخير والانصراف بدري</div>
    ${row('كل كام دقيقة = ساعة رصيد', 'tsLatePer', c.lateMinPerHour, 'أقل من الرقم ده = سماح مجاني')}
    ${row('سقف ساعات التأخير في اليوم', 'tsLateCap', c.maxLateHoursPerDay, '0 = مفيش سقف')}
    <div style="height:1px; background:var(--line); margin:12px 0;"></div>
    <div style="font-size:12px; color:var(--sub); margin-bottom:8px;">☕ البريك</div>
    ${row('مدة البريك (دقيقة)', 'tsBreakMin', c.breakMin)}
    ${row('سماح إضافي بعد المدة (دقيقة)', 'tsBreakGrace', c.breakGraceMin)}
    ${row('كل كام دقيقة زيادة = ساعة', 'tsBreakPer', c.breakMinPerHour)}
    ${row('كام بريك في اليوم', 'tsBreakPerDay', c.breakPerDay)}
    ${row('كام موظف بريك مع بعض', 'tsMaxOnBreak', c.maxOnBreak)}
    <div style="height:1px; background:var(--line); margin:12px 0;"></div>
    <div style="font-size:12px; color:var(--sub); margin-bottom:8px;">🔄 التبديل والغياب</div>
    ${row('تبديل مجاني في الشهر', 'tsSwapFree', c.swapFreePerMonth)}
    ${row('ساعات التبديل بعد المجاني', 'tsSwapHours', c.swapHours)}
    ${row('ساعات الغياب بدون عذر', 'tsAbsence', c.absenceHours, 'الغياب = خروج من المكافأة')}
    <div style="height:1px; background:var(--line); margin:12px 0;"></div>
    <div style="font-size:12px; color:var(--sub); margin-bottom:8px;">💰 الخصم والمكافأة</div>
    ${row('كل كام ساعة = يوم خصم', 'tsHoursPerDay', c.hoursPerDay)}
    ${row('سقف أيام الخصم شهريًا', 'tsMaxDays', c.maxDaysPerMonth, '0 = مفتوح')}
    ${row('الرصيد المسموح أسبوعيًا (ساعة)', 'tsAllowWeek', c.allowedHoursWeek)}
    ${row('الرصيد المسموح شهريًا (ساعة)', 'tsAllowMonth', c.allowedHoursMonth, 'أكتر منه = خارج المكافأة')}
    ${row('أقل عدد موظفين في الفرع', 'tsMinStaff', c.minStaffPerDay, 'لموافقة الأذونات')}
    <button onclick="saveTimeSettings()" style="width:100%; margin-top:8px; padding:13px; border:none; border-radius:12px; background:linear-gradient(180deg,var(--gold),#d9a838); color:#1b1400; font-family:'Cairo'; font-weight:800; font-size:14px; cursor:pointer;">💾 حفظ إعدادات الوقت</button>`;
};

window.saveTimeSettings = async function(){
  const n = (id, def)=>{ const v = parseInt(document.querySelector('#'+id).value,10); return isNaN(v)?def:v; };
  const c = window.timeCfg || window.timeCfgDefaults;
  const payload = {
    lateMinPerHour: n('tsLatePer', c.lateMinPerHour),
    maxLateHoursPerDay: n('tsLateCap', c.maxLateHoursPerDay),
    breakMin: n('tsBreakMin', c.breakMin),
    breakGraceMin: n('tsBreakGrace', c.breakGraceMin),
    breakMinPerHour: n('tsBreakPer', c.breakMinPerHour),
    breakPerDay: n('tsBreakPerDay', c.breakPerDay),
    maxOnBreak: n('tsMaxOnBreak', c.maxOnBreak),
    swapFreePerMonth: n('tsSwapFree', c.swapFreePerMonth),
    swapHours: n('tsSwapHours', c.swapHours),
    absenceHours: n('tsAbsence', c.absenceHours),
    hoursPerDay: n('tsHoursPerDay', c.hoursPerDay),
    maxDaysPerMonth: n('tsMaxDays', c.maxDaysPerMonth),
    allowedHoursWeek: n('tsAllowWeek', c.allowedHoursWeek),
    allowedHoursMonth: n('tsAllowMonth', c.allowedHoursMonth),
    minStaffPerDay: n('tsMinStaff', c.minStaffPerDay)
  };
  try{
    const b = window.currentBranch;
    if(!b){ alert('اختار فرع الجهاز الأول'); return; }
    await window.fbSetDoc(window.fbDoc(window.db,'sales_settings', b), { timeCfg: payload }, { merge:true });
    window.timeCfg = { ...window.timeCfgDefaults, ...payload };
    const f = document.querySelector('#timeSettingsForm'); if(f) f.dataset.editing='0';
    alert('اتحفظت إعدادات رصيد الوقت ✅');
  }catch(e){ alert('تعذر الحفظ: ' + e.message); }
};

window.saveComplianceSettings = async function(){
  const num = (id, def)=>{ const v = parseInt(document.querySelector('#'+id).value, 10); return isNaN(v) ? def : v; };
  const hhmm = (id, def)=>{ const v = (document.querySelector('#'+id).value||'').trim(); return /^\d{1,2}:\d{2}$/.test(v) ? v : def; };
  const wc = num('csWc', 40), ws = num('csWs', 30), wr = num('csWr', 30);
  if(wc + ws + wr !== 100){ alert('مجموع أوزان المكافأة لازم يساوي 100 (دلوقتي ' + (wc+ws+wr) + ')'); return; }
  const payload = {
    penalty: num('csPenalty', 50),
    lateGraceMin: num('csGrace', 20),
    weights: { commitment: wc, sales: ws, rating: wr },
    shifts: {
      morning: { label: '🌅 صباحي', start: hhmm('csMorningStart','10:00'), end: hhmm('csMorningEnd','18:00') },
      evening: { label: '🌆 مسائي', start: hhmm('csEveningStart','14:00'), end: hhmm('csEveningEnd','22:00') }
    }
  };
  try{
    const b = window.currentBranch;
    if(!b){ alert('اختار فرع الجهاز الأول'); return; }
    await window.fbSetDoc(window.fbDoc(window.db,'sales_settings', b), { compliance: payload }, { merge:true });
    const f = document.querySelector('#complianceSettingsForm'); if(f) f.dataset.editing='0';
    alert('اتحفظت إعدادات الالتزام ✅');
  }catch(e){ alert('تعذر الحفظ: ' + e.message); }
};

function renderAdminSettingsForm(){
  const annInput = document.querySelector('#announcementInput');
  const targetInput = document.querySelector('#dailyTargetInput');
  if(annInput && document.activeElement !== annInput) annInput.value = window.currentAnnouncement || '';
  if(targetInput && document.activeElement !== targetInput) targetInput.value = window.dailyTarget || '';
}

// If we reach this final line, the ENTIRE script downloaded and executed
// successfully — not just the beginning. If this never runs (script got cut
// off partway through a slow/unstable connection), the safety-net banner
// below will catch it and prompt a reload instead of leaving buttons silently broken.
window.__scriptFullyLoaded = true;
console.log('%c✅ Script fully loaded (all ' + document.querySelectorAll('script').length + ' script tags parsed)', 'color:lime');
