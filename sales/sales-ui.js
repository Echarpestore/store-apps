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
  // v492: الشغل في يوم الإجازة لوحده مش مخالفة؛ محرك المرتب بيحسبه إضافة تلقائيًا.
  const all = [...swaps, ...singles.filter(i=>i.type!=='workedDayOff')].sort((a,b)=> a.dateKey < b.dateKey ? 1 : -1);

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
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button onclick="decideIssue('${i.empId}','${i.empName}','${i.dateKey}','${m.kind}','normal')" style="flex:1; min-width:145px; padding:10px; border:1px solid var(--line); border-radius:10px; background:var(--panel2); color:var(--ink); font-family:'Cairo'; font-weight:800; cursor:pointer;">${i.type==='dayoffSwap'?'✅ اعتمد كتبديل':'📅 غياب عادي — خصم يوم'}</button>
        <button onclick="decideIssue('${i.empId}','${i.empName}','${i.dateKey}','${m.kind}','unauthorized')" style="flex:1; min-width:145px; padding:10px; border:none; border-radius:10px; background:linear-gradient(180deg,#5a3a3a,#3a2422); color:#ffb4a6; font-family:'Cairo'; font-weight:800; cursor:pointer;">🚫 بدون إذن — +4س رصيد</button>
      </div>
      ${i.type==='absent'?'<div style="font-size:10.5px;color:var(--sub);margin-top:7px;">في الحالتين يوم الغياب نفسه بيتخصم من المرتب. «بدون إذن» يضيف 4 ساعات رصيد كجزاء.</div>':''}
    </div>`;
  }).join('');
}

// v492: مفيش غرامة 5 جنيه. يوم الغياب بيتخصم أصلًا من محرك المرتب.
// «بدون إذن» = نفس خصم اليوم + 4 ساعات رصيد إضافية. الكتابتين atomic + idempotent.
const _attDecisionBusy = new Set();
window.decideIssue = async function(empId, empName, dateKey, kind, action){
  const key = empId + '|' + dateKey;
  if(_attDecisionBusy.has(key)) return;
  const unauthorized = action === 'unauthorized';
  const extraHours = unauthorized ? (window.absenceHoursFrom ? window.absenceHoursFrom(window.timeCfg||window.timeCfgDefaults) : 4) : 0;
  const msg = unauthorized
    ? ('تأكيد غياب بدون إذن لـ ' + empName + '?\n\nيوم الغياب هيتخصم عادي + ' + extraHours + ' ساعات رصيد إضافية.')
    : (kind === 'absent' ? ('تأكيد غياب عادي لـ ' + empName + '?\n\nهيتخصم يوم الغياب فقط من المرتب.') : ('اعتماد التبديل لـ ' + empName + '؟'));
  if(!confirm(msg)) return;
  _attDecisionBusy.add(key);
  const wrap = document.querySelector('#attIssuesList'); if(wrap) wrap.style.opacity='.65';
  try{
    const safe = String(empId).replace(/[^a-zA-Z0-9_-]/g,'_') + '_' + String(dateKey).replace(/[^0-9-]/g,'');
    const decisionRef = window.fbDoc(window.db,'sales_att_decisions','att_'+safe);
    const creditRef = window.fbDoc(window.db,'sales_time_credit','absence_'+safe);
    const batch = window.fbWriteBatch(window.db);
    batch.set(decisionRef, {
      empId, empName, dateKey, type: kind, branch: window.currentBranch,
      decision: unauthorized ? 'unauthorized' : 'normal', unauthorizedHours: extraHours, ts: Date.now()
    }, {merge:true});
    if(unauthorized && extraHours > 0){
      batch.set(creditRef, {
        employeeId: empId, employeeName: empName, branch: window.currentBranch,
        type:'absence', hours:extraHours, date:dateKey,
        note:'غياب بدون إذن — جزاء إضافي', ts:Date.now(), source:'attendance_review'
      }, {merge:true});
    }else{
      // لو القرار اتعاد كعادي بعد محاولة سابقة، صفّر البند الحتمي بدل ما يفضل جزاء قديم.
      batch.set(creditRef, {
        employeeId: empId, employeeName: empName, branch: window.currentBranch,
        type:'absence', hours:0, originalHours:0, date:dateKey,
        note:'غياب عادي — بدون جزاء ساعات', excused:true, excuseReason:'غياب عادي', ts:Date.now(), source:'attendance_review'
      }, {merge:true});
    }
    const timeout = new Promise((_,rej)=>setTimeout(()=>rej(new Error('__SAVE_TIMEOUT__')),12000));
    await Promise.race([batch.commit(), timeout]);
  }catch(e){
    if(e && e.message === '__SAVE_TIMEOUT__') alert('الاتصال بطيء والقرار لسه ما اتأكدش. لو ضغطت تاني مش هيتكرر الخصم لأن الحفظ محمي من التكرار.');
    else alert('تعذر تسجيل القرار: ' + (e&&e.message?e.message:e));
  }finally{
    _attDecisionBusy.delete(key); if(wrap) wrap.style.opacity='';
    try{ window.renderAttIssues(); }catch(e){}
  }
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
    const mine = rows.filter(r=> r.employeeId===emp.id && (window.tcCounts ? window.tcCounts(r) : !r.excused));
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
    try{ if(typeof window.refreshOpenPayrollEmployee==='function') window.refreshOpenPayrollEmployee(); }catch(_e){}
    try{ if(typeof window.renderTimeCreditLog==='function') window.renderTimeCreditLog(); }catch(_e){}
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
    x.employeeId===emp.id && x.type==='swap' && (window.tcCounts ? window.tcCounts(x) : !x.excused) && String(x.date||'').startsWith(mk)).length;
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

  // 1️⃣ مستند الإعدادات — 🔴 كان الخطأ بيتبلع في catch فاضي والرسالة تقول
  //    "اتشال ✅" حتى لو القواعد رفضت الحذف. دلوقتي بيتبلّغ صراحةً.
  let docErr = null;
  try{
    await window.fbDeleteDoc(window.fbDoc(window.db,'sales_settings', name));
  }catch(e){ docErr = e; }

  // 2️⃣ 🔴 القاعدة الذهبية: `window.allSettingsDocs = [...].filter()` كان بيعمل
  //    **مصفوفة جديدة** على window بس، و sales-app.js بيقرا نسخة البلوك بتاعته
  //    اللي لسه شايلة الفرع. فالقايمة المحلية بترجع تكتبه تاني من هناك —
  //    ويفضل يرجع للأبد. الحل: تعديل **نفس المصفوفة في مكانها** (splice)
  //    عشان المرجعين يشوفوا التغيير.
  try{
    const arr = window.allSettingsDocs;
    if(Array.isArray(arr)){
      for(let i = arr.length - 1; i >= 0; i--){ if(arr[i] === name) arr.splice(i, 1); }
    }
  }catch(e){}

  // 3️⃣ القايمة المحلية
  try{
    const list = JSON.parse(localStorage.getItem('sales_branch_list')||'[]').filter(b=> b!==name);
    localStorage.setItem('sales_branch_list', JSON.stringify(list));
  }catch(e){}

  window.renderBranchManage();

  // 4️⃣ نقول الحقيقة — مش "اتشال ✅" على طول
  if(docErr){
    alert('❌ الفرع ماتشالش من السيرفر.\n\n' + (docErr.code || docErr.message)
      + '\n\nاتشال من الجهاز ده بس، وهيرجع يظهر أول ما البيانات تتحدّث.'
      + (String(docErr.code||'').indexOf('permission') >= 0
          ? '\n\nالسبب على الأرجح قواعد الأمان — محتاجة تسمح بالحذف من sales_settings.' : ''));
    return;
  }
  // 🔎 فيه مصادر تانية ممكن ترجّع الفرع — نقولها بدل ما يستغرب
  const others = [];
  if((window.allEmployeesAll||[]).some(function(e){ return e.branch === name; })) others.push('موظفين');
  if((window.allShifts||[]).some(function(x){ return x.branch === name; })) others.push('حضور');
  if((window.allAdvancesAll||[]).some(function(x){ return x.branch === name; })) others.push('سلف');
  if(others.length){
    alert('⚠️ اتشال مستند الإعدادات، بس الفرع لسه مربوط بـ: ' + others.join(' · ')
      + '\nهيفضل ظاهر لحد ما البيانات دي تتنقل أو تتمسح.');
  } else {
    alert('اتشال الفرع ✅\n\nملحوظة: الأجهزة التانية محتفظة بنسخة محلية من القايمة —'
      + ' هتتحدّث لوحدها أول ما تفتح البرنامج.');
  }
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
    ${row('جزاء الغياب بدون إذن (ساعات رصيد)', 'tsAbsence', (c.unauthorizedAbsenceHours==null?4:c.unauthorizedAbsenceHours), 'يوم الغياب نفسه بيتخصم عادي؛ دي ساعات جزاء إضافية')}
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
    unauthorizedAbsenceHours: n('tsAbsence', (c.unauthorizedAbsenceHours==null?4:c.unauthorizedAbsenceHours)),
    hoursPerDay: n('tsHoursPerDay', c.hoursPerDay),
    maxDaysPerMonth: n('tsMaxDays', c.maxDaysPerMonth),
    allowedHoursWeek: n('tsAllowWeek', c.allowedHoursWeek),
    allowedHoursMonth: n('tsAllowMonth', c.allowedHoursMonth),
    minStaffPerDay: n('tsMinStaff', c.minStaffPerDay)
  };
  try{
    const b = window.currentBranch;
    if(!b){ alert('اختار فرع الجهاز الأول'); return; }
    // 🔴 باج: Firestore merge:true بيستبدل كائن timeCfg **كامل** مش بيدمج
    // جواه — لو بعتنا payload بس، أي حقل زي weeklyStartFloor مش موجود فيه
    // بيتمسح. الحل: ندمج مع القيم الحالية (window.timeCfg) *قبل* الكتابة.
    const _fullTimeCfg = { ...(window.timeCfg || window.timeCfgDefaults), ...payload };
    await window.fbSetDoc(window.fbDoc(window.db,'sales_settings', b), { timeCfg: _fullTimeCfg }, { merge:true });
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

// ============================================================
// 🩺 يوم السماح — قفل الشيفتات المفتوحة + عذر جماعي
// ------------------------------------------------------------
// الحالة: أول يوم تشغيل — كل الموظفين سجّلوا حضور ومشيوا من غير انصراف،
// والمطلوب يوم تجميع بيانات من غير أي عقوبة.
// ⚠️ **مش بتغيير الإعدادات**: الكود بيسجّل بند الرصيد بس لو الساعات > 0
//    (`if(overHours > 0)`), فتقليل العقوبات من الإعدادات = يوم من غير بيانات
//    أصلًا — عكس المطلوب. الصح: يشتغل عادي، وبعدين نعذر.
// 🔑 العذر مش مسح: بيصفّر hours ويحفظ originalHours ويعلّم excused —
//    البند بيفضل في السجل، ومحرك المرتب وبوابة الـ90% بيستبعدوا excused.
// ============================================================
// اليوم اللي بعد تاريخ مكتوب YYYY-MM-DD
function _nextDayStr(d){
  const p = String(d||'').split('-').map(Number);
  const x = new Date(Date.UTC(p[0], (p[1]||1)-1, p[2]||1) + 86400000);
  return x.getUTCFullYear() + '-' + String(x.getUTCMonth()+1).padStart(2,'0')
       + '-' + String(x.getUTCDate()).padStart(2,'0');
}
window._nextDayStr = _nextDayStr;

// 🕐 وقت القفل الإداري = نهاية شيفت الموظف المجدولة (مش دلوقتي) —
// عشان الوقت الإضافي ميتحسبش غلط لو اتقفل بعد نص الليل.
// دالة نقية عشان القفل الفردي والجماعي يشتغلوا بنفس الحساب بالظبط.
window.graceCloseTsFor = function(shift, emp, cfg){
  if(!shift || !shift.clockInTs) return null;
  const sdef = (cfg && cfg.shifts) ? cfg.shifts[emp && emp.shift] : null;
  const endHM = (emp && emp.scheduledEndTime) || (sdef && sdef.end) || '';
  let endTs = null;
  if(/^\d{1,2}:\d{2}$/.test(endHM)){
    const parts = String(endHM).split(':').map(Number);
    const base = new Date(shift.clockInTs);
    const e = new Date(base.getFullYear(), base.getMonth(), base.getDate(), parts[0], parts[1], 0, 0);
    if(e.getTime() <= shift.clockInTs) e.setDate(e.getDate() + 1);   // شيفت بيعدّي نص الليل
    endTs = e.getTime();
  }
  if(!endTs) endTs = shift.clockInTs + (8*60 + 15) * 60000;          // فولباك: الشيفت القياسي
  return endTs;
};

// 🚪 قفل شيفت **موظف واحد** — نفس حساب القفل الجماعي بالظبط
window.graceCloseShift = async function(shiftId){
  const s = (window.allShifts||[]).filter(function(x){ return x && x.id === shiftId; })[0];
  if(!s){ alert('مش لاقي الشيفت ده'); return; }
  if(s.clockOutTs){ alert('الشيفت ده مقفول خلاص'); window.renderGraceDay(); return; }
  const emp = (window.employees||[]).filter(function(e){ return e.id === s.employeeId; })[0];
  const endTs = window.graceCloseTsFor(s, emp, window.complianceCfg);
  const tTxt = new Date(endTs).toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit' });
  if(!confirm('🚪 قفل شيفت: ' + ((emp && emp.name) || 'الموظف') + '\n\n'
    + 'الانصراف هيتسجل الساعة ' + tTxt + ' (نهاية شيفته الرسمية) — مش وقت دلوقتي.\n'
    + 'مفيش وقت إضافي ومفيش خصم انصراف بدري.\n\nتكمّل؟')) return;
  try{
    await window.fbUpdateDoc(window.fbDoc(window.db,'sales_shifts', s.id), {
      clockOutTs: endTs,
      overtimeMinutes: 0,          // مفيش وقت إضافي على قفل إداري
      earlyMin: 0, earlyHours: 0,  // ومفيش انصراف بدري
      autoClosedBy: 'grace_day', autoClosedAt: Date.now()
    });
    alert('اتقفل ✅ — ' + ((emp && emp.name) || '') + ' الساعة ' + tTxt);
  }catch(e){
    console.warn('grace close one', e);
    alert('تعذر القفل: ' + (e && e.message ? e.message : e));
  }
  window.renderGraceDay();
};

window.renderGraceDay = function(){
  const wrap = document.querySelector('#graceDayPanel'); if(!wrap) return;
  // 🕕 يوم الشغل مش اليوم التقويمي: الساعة 5 الفجر إحنا لسه في يوم امبارح
  //    شغلًا، والشيفتات المفتوحة بتاعته. الافتراضي كان بيفتح على تاريخ اليوم
  //    التقويمي فيطلّع صفر.
  //    (الفاصلة 6 — نفس اللي ماشي عليه التقفيل والتقارير في الـPOS.)
  const _bizToday = function(){
    const n = new Date();
    if(n.getHours() < 6) n.setDate(n.getDate() - 1);
    return window.todayStr(n);
  };
  const d = wrap.dataset.day || _bizToday();
  const br = window.currentBranch;

  // 🔴 مستند الشيفت **مفيهوش dateKey** — التاريخ بيتحسب من clockInTs.
  //    (dateKey موجود في البريكات مش الشيفتات.) الفلترة بحقل مش موجود
  //    كانت بترجّع صفر دايمًا.
  const _dayOf = function(ts){
    try{ return window.todayStr(new Date(ts)); }
    catch(e){
      const x = new Date(ts);
      return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0')
           + '-' + String(x.getDate()).padStart(2,'0');
    }
  };
  const open = (window.allShifts||[]).filter(function(s){
    return s && s.branch === br && s.clockInTs && !s.clockOutTs && _dayOf(s.clockInTs) === d;
  });
  const credits = (window.allTimeCredit||[]).filter(function(x){
    return x && x.branch === br && x.date === d && (window.tcCounts ? window.tcCounts(x) : !x.excused);
  });
  const hours = credits.reduce(function(n,x){ return n + (Number(x.hours)||0); }, 0);
  // 🩹 العفو الشامل: كل رصيد **غير معذور** بتاريخ ≤ اليوم المختار
  const _cfg = window.timeCfg || window.timeCfgDefaults || {};
  const amnUntil = String(_cfg.timeAmnestyUntil || '');
  const allPast = (window.allTimeCredit||[]).filter(function(x){
    return x && x.branch === br && !x.excused && String(x.date||'') && String(x.date) <= d
        && !(amnUntil && String(x.date) <= amnUntil);
  });
  const allPastHours = allPast.reduce(function(n,x){ return n + (Number(x.hours)||0); }, 0);
  const allPastEmps = Object.keys(allPast.reduce(function(o,x){ o[x.employeeId]=1; return o; }, {})).length;
  const byType = {};
  credits.forEach(function(x){ byType[x.type] = (byType[x.type]||0) + 1; });
  const LBL = { late:'⏰ تأخير', break:'☕ بريك', swap:'🔄 تبديل', early:'🚪 انصراف بدري', absence:'🚫 غياب' };
  const chips = Object.keys(byType).map(function(t){
    return '<span style="display:inline-block; background:var(--panel2); border:1px solid var(--line); border-radius:8px; padding:3px 9px; margin:2px 3px 2px 0; font-size:11.5px;">'
      + (LBL[t]||t) + ' × ' + byType[t] + '</span>'; }).join('');

  wrap.innerHTML =
    '<label style="display:flex; align-items:center; gap:8px; font-size:13px; margin-bottom:11px;">'
    + '<span>اليوم:</span>'
    + '<input type="date" id="gdDate" value="' + d + '" style="flex:1; padding:8px; border-radius:9px;'
    + ' border:1px solid var(--line); background:var(--panel2); color:var(--ink); font-family:\'Cairo\';">'
    + '</label>'
    + '<div style="background:var(--panel2); border:1px solid var(--line); border-radius:11px; padding:12px; margin-bottom:11px;">'
    +   '<div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:5px;">'
    +     '<span>شيفتات مفتوحة (منسيش انصراف)</span><b style="color:' + (open.length?'#e0796b':'#5ec88a') + ';">' + open.length + '</b></div>'
    +   '<div style="display:flex; justify-content:space-between; font-size:13px;">'
    +     '<span>بنود رصيد غير معذورة</span><b style="color:' + (hours?'#e0796b':'#5ec88a') + ';">'
    +       credits.length + ' بند · ' + hours + ' ساعة</b></div>'
    +   (chips ? ('<div style="margin-top:7px;">' + chips + '</div>') : '')
    + '</div>'
    + (open.length
        ? (
            // 👤 قفل فردي: كل شيفت مفتوح بصف لوحده — مش لازم تقفل الكل
            '<div style="margin-bottom:9px;">' + open.map(function(s){
              const emp = (window.employees||[]).filter(function(e){ return e.id === s.employeeId; })[0];
              const inT = new Date(s.clockInTs).toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit' });
              const outTs = window.graceCloseTsFor(s, emp, window.complianceCfg);
              const outT = outTs ? new Date(outTs).toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit' }) : '—';
              return '<div style="display:flex; align-items:center; gap:8px; background:var(--panel2);'
                + ' border:1px solid var(--line); border-radius:10px; padding:9px 10px; margin-bottom:6px;">'
                + '<div style="flex:1; min-width:0;">'
                +   '<div style="font-weight:800; font-size:13px;">' + ((emp && emp.name) || 'موظف') + '</div>'
                +   '<div style="font-size:11px; color:var(--sub);">حضور ' + inT + ' → هيقفل ' + outT + '</div>'
                + '</div>'
                + '<button data-close-shift="' + s.id + '" style="padding:8px 13px; border:none; border-radius:9px;'
                + ' background:linear-gradient(180deg,#3fbf60,#1f9440); color:#fff; font-family:\'Cairo\';'
                + ' font-weight:800; cursor:pointer; white-space:nowrap;">🚪 اقفل</button>'
                + '</div>';
            }).join('') + '</div>'
          + (open.length > 1
              ? ('<button id="gdCloseBtn" style="width:100%; padding:12px; margin-bottom:8px; border:none; border-radius:11px;'
                 + ' background:var(--panel); border:1px solid #1f9440; color:#5ec88a; font-family:\'Cairo\'; font-weight:800; cursor:pointer;">'
                 + '🚪 اقفلهم كلهم (' + open.length + ')</button>')
              : ''))
        : '<div style="color:#5ec88a; font-size:12.5px; margin-bottom:8px;">✅ مفيش شيفتات مفتوحة في اليوم ده</div>')
    + (credits.length
        ? ('<button id="gdExcuseBtn" style="width:100%; padding:12px; border:1px solid #5a4a2a; border-radius:11px;'
           + ' background:var(--panel); color:var(--gold); font-family:\'Cairo\'; font-weight:800; cursor:pointer;">'
           + '🩺 اعذر الـ' + credits.length + ' بند كلهم</button>')
        : '<div style="color:#5ec88a; font-size:12.5px;">✅ مفيش بنود محتاجة عذر</div>')
    + '<div style="font-size:11px; color:var(--sub); margin-top:10px; line-height:1.8;">'
    +   'العذر بيصفّر الساعات وبيحتفظ بالأصلي — البند بيفضل في السجل للمراجعة،'
    +   ' ومش بيتخصم من المرتب ولا بيأثر على بوابة الالتزام.</div>'
    // 🩹 عفو شامل — «اللي فات كله، ومن بكرا نحسب»
    + '<div style="border-top:1px solid var(--line); margin-top:13px; padding-top:12px;">'
    +   '<div style="font-weight:800; font-size:13px; margin-bottom:6px;">🩹 عفو شامل عن كل اللي فات</div>'
    +   (amnUntil
        ? ('<div style="background:var(--panel2); border:1px solid #5a4a2a; border-radius:10px; padding:10px; font-size:12.5px; color:var(--gold);">'
           + 'سارٍ دلوقتي: كل رصيد لحد <b>' + amnUntil + '</b> ملغي — الحساب بيبدأ من اليوم اللي بعده.'
           + '<button id="gdAmnUndo" style="display:block; width:100%; margin-top:9px; padding:8px; border:1px solid var(--line);'
           + ' border-radius:9px; background:var(--panel); color:var(--sub); font-family:\'Cairo\'; font-weight:700; cursor:pointer;">'
           + '↩️ ألغِ العفو ورجّع الحساب</button></div>')
        : (allPast.length
           ? ('<div style="font-size:12.5px; color:var(--sub); margin-bottom:9px;">'
              + 'المتراكم لحد ' + d + ': <b style="color:#e0796b;">' + allPast.length + ' بند · '
              + allPastHours + ' ساعة · ' + allPastEmps + ' موظف</b></div>'
              + '<button id="gdAmnBtn" style="width:100%; padding:12px; border:none; border-radius:11px;'
              + ' background:linear-gradient(180deg,#e0a23f,#b87a1c); color:#241a05; font-family:\'Cairo\';'
              + ' font-weight:800; cursor:pointer;">🩹 سماح عن الـ' + allPastHours + ' ساعة كلها</button>')
           : '<div style="color:#5ec88a; font-size:12.5px;">✅ مفيش رصيد متراكم</div>'))
    +   '<div style="font-size:11px; color:var(--sub); margin-top:9px; line-height:1.8;">'
    +     'بيتسجّل كتاريخ في الإعدادات — فأي بند قديم يتسجّل متأخر بيتغطّى كمان.'
    +     ' البنود بتفضل في السجل، والحساب بيبدأ من أول اليوم اللي بعده.</div>'
    + '</div>';

  const dt = wrap.querySelector('#gdDate');
  if(dt) dt.onchange = function(){ wrap.dataset.day = dt.value; window.renderGraceDay(); };

  // أزرار القفل الفردي
  Array.prototype.forEach.call(wrap.querySelectorAll('[data-close-shift]'), function(b){
    b.onclick = function(){ window.graceCloseShift(b.getAttribute('data-close-shift')); };
  });

  const cb = wrap.querySelector('#gdCloseBtn');
  if(cb) cb.onclick = async function(){
    if(!confirm('هتقفل ' + open.length + ' شيفت مفتوح ليوم ' + d + '.\n\n'
      + 'الانصراف هيتسجل بوقت نهاية الشيفت الرسمي — مش بوقت دلوقتي.\n'
      + 'مش هيتسجل أي "انصراف بدري" على الشيفتات دي.\n\nتكمّل؟')) return;
    cb.disabled = true; cb.textContent = 'بيقفل…';
    let ok = 0, fail = 0;
    for(const s of open){
      try{
        // 🕐 وقت الانصراف = نهاية الشيفت الرسمي، مش دلوقتي — عشان الوقت
        //    الإضافي ميتحسبش غلط لو اتقفل بعد نص الليل.
        const emp = (window.employees||[]).find(function(e){ return e.id === s.employeeId; });
        const endTs = window.graceCloseTsFor(s, emp, window.complianceCfg);   // نفس حساب القفل الفردي
        await window.fbUpdateDoc(window.fbDoc(window.db,'sales_shifts', s.id), {
          clockOutTs: endTs,
          overtimeMinutes: 0,          // مفيش وقت إضافي على قفل إداري
          earlyMin: 0, earlyHours: 0,  // ومفيش انصراف بدري
          autoClosedBy: 'grace_day', autoClosedAt: Date.now()
        });
        ok++;
      }catch(e){ fail++; console.warn('grace close', e); }
    }
    alert('اتقفل ' + ok + ' شيفت' + (fail ? (' · فشل ' + fail) : '') + ' ✅');
    cb.disabled = false;
    window.renderGraceDay();
  };

  const ab = wrap.querySelector('#gdAmnBtn');
  if(ab) ab.onclick = async function(){
    if(!confirm('🩹 سماح شامل عن كل رصيد الوقت لحد ' + d + '\n\n'
      + allPast.length + ' بند · ' + allPastHours + ' ساعة · ' + allPastEmps + ' موظف\n\n'
      + 'مش هيتخصم أي حاجة منهم، ومش هيأثروا على بوابة الالتزام.\n'
      + 'الحساب بيبدأ من أول ' + _nextDayStr(d) + '.\n\nتكمّل؟')) return;
    ab.disabled = true; ab.textContent = 'بيتسجّل…';
    try{
      // التاريخ في الإعدادات هو الحاسم — بيغطي حتى البنود اللي هتتسجّل بعدين
      // 🔴 نفس باج الاستبدال الكامل لـtimeCfg — ندمج مع القيم الحالية قبل الكتابة.
      await window.fbSetDoc(window.fbDoc(window.db,'sales_settings', br),
        { timeCfg: { ...(window.timeCfg || window.timeCfgDefaults), timeAmnestyUntil: d } }, { merge:true });
      // وبنعلّم البنود الموجودة كمان — عشان السجل واللوحات تبان متسقة
      let ok = 0;
      for(const x of allPast){
        try{
          await window.fbUpdateDoc(window.fbDoc(window.db,'sales_time_credit', x.id), {
            hours: 0, originalHours: (x.originalHours != null ? x.originalHours : x.hours),
            excused: true, excuseReason: 'سماح شامل لحد ' + d, excusedAt: Date.now(),
            excusedBy: 'amnesty'
          });
          ok++;
        }catch(_e){ console.warn('amnesty mark', _e); }
      }
      alert('اتسجّل السماح ✅\nاتعلّم ' + ok + ' بند من ' + allPast.length
        + (ok < allPast.length ? '\n(الباقي مش هيتخصم برضه — التاريخ في الإعدادات هو الحاسم)' : ''));
    }catch(e){ alert('ماتسجّلش: ' + (e.code || e.message)); }
    ab.disabled = false;
    window.renderGraceDay();
  };

  const au = wrap.querySelector('#gdAmnUndo');
  if(au) au.onclick = async function(){
    if(!confirm('هترجّع حساب رصيد الوقت من أول الأيام تاني؟\n\n'
      + 'البنود اللي اتعلّمت «معذورة» بالسماح هتفضل معذورة — دي محتاجة رفع يدوي.')) return;
    try{
      // 🔴 نفس باج الاستبدال الكامل لـtimeCfg — ندمج مع القيم الحالية قبل الكتابة.
      await window.fbSetDoc(window.fbDoc(window.db,'sales_settings', br),
        { timeCfg: { ...(window.timeCfg || window.timeCfgDefaults), timeAmnestyUntil: '' } }, { merge:true });
    }catch(e){ alert('ماتغيّرش: ' + (e.code || e.message)); }
    window.renderGraceDay();
  };

  const eb = wrap.querySelector('#gdExcuseBtn');
  if(eb) eb.onclick = async function(){
    const reason = prompt('سبب العذر للكل:', 'أول يوم تشغيل — تجميع بيانات');
    if(reason === null) return;
    if(!confirm('هتعذر ' + credits.length + ' بند (' + hours + ' ساعة) ليوم ' + d + '.\n\n'
      + 'البنود هتفضل في السجل بس من غير أي خصم أو تأثير على المكافأة.\n\nتكمّل؟')) return;
    eb.disabled = true; eb.textContent = 'بيتعذر…';
    let ok = 0, fail = 0;
    for(const x of credits){
      try{
        await window.fbUpdateDoc(window.fbDoc(window.db,'sales_time_credit', x.id), {
          hours: 0, originalHours: (x.originalHours != null ? x.originalHours : x.hours),
          excused: true, excuseReason: reason || 'يوم سماح', excusedAt: Date.now(),
          excusedBy: 'grace_day'
        });
        ok++;
      }catch(e){ fail++; console.warn('grace excuse', e); }
    }
    alert('اتعذر ' + ok + ' بند' + (fail ? (' · فشل ' + fail) : '') + ' ✅');
    eb.disabled = false;
    window.renderGraceDay();
  };
};



// ==================== SALES ADMIN CONTROL CENTER v17 ====================
// UI-only organization layer: existing panels, IDs and business handlers stay intact.
(function(){
  const sectionMeta = {
    team:       {label:'الموظفين', icon:'👥', desc:'الموظفين والجداول والمهام'},
    approvals:  {label:'الموافقات', icon:'✅', desc:'طلبات وقرارات محتاجة مراجعتك'},
    payroll:    {label:'الفلوس', icon:'💵', desc:'رواتب وعمولات وسلف وخصومات'},
    performance:{label:'التقارير', icon:'📊', desc:'نتائج وأداء وتقييمات'},
    settings:   {label:'المزيد', icon:'⚙️', desc:'الفروع والقواعد والإعدادات'},
  };
  let activeSection = 'team';

  function panelSection(panel){
    const has = (sel)=> !!panel.querySelector(sel);
    // Team / people
    if(has('#newEmpName') || has('#empList') || has('#pendingRegsList') ||
       has('#staffOverviewList') || has('#scheduleList') || has('#taskAssignList')) return 'team';
    // Approvals / inbox-like work
    if(has('#leaveRequestsList') || has('#attIssuesList') || has('#graceDayPanel') ||
       has('#rewardBudgetPanel') || has('#overtimeApprovals') || has('#pendingSubmissionsList') ||
       has('#shortagesList') || has('#staffOrdersPending')) return 'approvals';
    // Payroll / money
    if(has('#timeCreditLog') || has('#commissionList') || has('#commissionPaymentLogList') ||
       has('#salaryList') || has('#salaryPaymentLogList') || has('#terminateEmpList') ||
       has('#terminationLogList') || has('#advancesLogList')) return 'payroll';
    // Performance / reports
    if(has('#perfList') || has('#confirmedSubmissionsList') || has('#rewardsList') ||
       has('#attendanceHistoryList') || has('#weeklyAggregateList') || has('#perfHistoryList') ||
       has('#fullReportList')) return 'performance';
    // Settings
    if(has('#managerCodeInput') || has('#advMaxInput') || has('#branchManageList') ||
       has('#complianceSettingsForm') || has('#shiftTargetMorning') || has('#framesSaleMode') ||
       has('#commissionPerPointInput') || has('#referralList')) return 'settings';
    return 'settings';
  }

  function directPanels(){
    const admin = document.getElementById('admin');
    if(!admin) return [];
    return Array.from(admin.children || []).filter(x=>x.classList && x.classList.contains('panel'));
  }

  function tagPanels(){
    directPanels().forEach((p, i)=>{
      if(!p.dataset.salesSection) p.dataset.salesSection = panelSection(p);
      p.dataset.salesPanelIndex = String(i);
      const h = p.querySelector('h3,h4');
      if(h && !p.dataset.salesTitle) p.dataset.salesTitle = (h.textContent || '').replace(/\s+/g,' ').trim();
    });
  }

  function badgeNum(id){
    const el = document.getElementById(id);
    if(!el) return 0;
    const n = Number(String(el.textContent || '').replace(/[^\d.-]/g,''));
    return Number.isFinite(n) ? n : 0;
  }

  function pendingOvertime(){
    const el = document.getElementById('overtimeApprovals');
    if(!el) return 0;
    // buttons are only rendered for rows waiting for approval
    return el.querySelectorAll('button').length ? Math.ceil(el.querySelectorAll('button').length / 2) : 0;
  }

  function currentPeriod(){
    const s = document.getElementById('salaryPeriodSelect');
    return s && s.options && s.selectedIndex >= 0 ? (s.options[s.selectedIndex].textContent || '') : '—';
  }

  function _pendingCounts(){
    const approvals = badgeNum('leaveBadge') + badgeNum('issuesBadge') + badgeNum('regPendBadge') + pendingOvertime();
    const tasks = badgeNum('pendingBadge') + badgeNum('staffOrdersBadge');
    return { approvals, tasks, total: approvals + tasks };
  }

  function refreshNavBadges(){
    const c = _pendingCounts();
    document.querySelectorAll('[data-sales-nav-count]').forEach(el=>{
      const key = el.dataset.salesNavCount;
      const n = key === 'approvals' ? c.total : 0;
      el.textContent = n > 99 ? '99+' : String(n);
      el.style.display = n > 0 ? 'inline-flex' : 'none';
    });
  }
  window.refreshSalesAdminNavBadges = refreshNavBadges;

  function renderSummary(){
    const host = document.getElementById('salesAdminSummary');
    if(host){ host.innerHTML=''; host.style.display='none'; }
    refreshNavBadges();
  }

  function renderNav(){
    const host = document.getElementById('salesAdminUx');
    if(!host) return;
    host.innerHTML = `
      <div class="sales-admin-shell">
        <div class="sales-admin-nav">
          ${Object.entries(sectionMeta).map(([k,v])=>`<button type="button" data-sales-section-btn="${k}">${v.icon} ${v.label}${k==='approvals'?'<span class="sales-nav-badge" data-sales-nav-count="approvals" style="display:none;"></span>':''}</button>`).join('')}
        </div>
        <div class="sales-admin-tools">
          <input id="salesAdminSearch" type="search" placeholder="ابحث: راتب، سلفة، حضور، موظف، تارجت…">
          <select id="salesAdminJump">
            <option value="">اذهب مباشرة إلى…</option>
          </select>
        </div>
      </div>`;
    host.querySelectorAll('[data-sales-section-btn]').forEach(b=>{
      b.onclick=()=>showSection(b.dataset.salesSectionBtn);
    });
    const q = host.querySelector('#salesAdminSearch');
    if(q) q.oninput=()=>applySearch(q.value);
    const jump = host.querySelector('#salesAdminJump');
    if(jump){
      const opts = directPanels().map(p=>({i:p.dataset.salesPanelIndex,title:p.dataset.salesTitle||'قسم'}));
      jump.innerHTML = '<option value="">اذهب مباشرة إلى…</option>' +
        opts.map(x=>`<option value="${x.i}">${x.title}</option>`).join('');
      jump.onchange=()=>{
        const p = directPanels().find(x=>x.dataset.salesPanelIndex===jump.value);
        if(!p) return;
        activeSection = p.dataset.salesSection || 'settings';
        setNavState();
        directPanels().forEach(x=>x.classList.toggle('sales-panel-hidden', x!==p));
        document.getElementById('salesAdminSummary').style.display='none';
        document.getElementById('salesAdminSectionLabel').textContent='فتح مباشر: '+(p.dataset.salesTitle||'');
        p.scrollIntoView({behavior:'smooth',block:'start'});
      };
    }
  }

  function setNavState(){
    document.querySelectorAll('[data-sales-section-btn]').forEach(b=>{
      b.classList.toggle('on', b.dataset.salesSectionBtn===activeSection);
    });
  }

  function syncRoleNav(){
    const panels=directPanels();
    document.querySelectorAll('[data-sales-section-btn]').forEach(b=>{
      const sec=b.dataset.salesSectionBtn;
      const hasAllowed=panels.some(p=>p.dataset.salesSection===sec && p.dataset.roleHidden!=='1');
      b.style.display = hasAllowed ? '' : 'none';
    });
    const activeBtn=document.querySelector('[data-sales-section-btn="'+activeSection+'"]');
    if(!activeBtn || activeBtn.style.display==='none'){
      const first=[...document.querySelectorAll('[data-sales-section-btn]')].find(b=>b.style.display!=='none');
      if(first) activeSection=first.dataset.salesSectionBtn;
    }
    setNavState(); refreshNavBadges();
  }
  window.syncSalesAdminRoleNav = syncRoleNav;

  function showSection(section){
    if(!sectionMeta[section]) section='team';
    activeSection=section;
    const search = document.getElementById('salesAdminSearch');
    if(search) search.value='';
    const jump = document.getElementById('salesAdminJump');
    if(jump) jump.value='';
    setNavState();
    const panels=directPanels();
    const summary=document.getElementById('salesAdminSummary');
    const label=document.getElementById('salesAdminSectionLabel');
    const empty=document.getElementById('salesAdminEmpty');
    panels.forEach(p=>{
      p.classList.remove('sales-search-match');
      const allowed = p.dataset.roleHidden !== '1';
      const show = allowed && p.dataset.salesSection===section;
      p.classList.toggle('sales-panel-hidden', !show);
    });
    if(summary) summary.style.display = 'none';
    if(label) label.textContent = `${sectionMeta[section].icon} ${sectionMeta[section].label} — ${sectionMeta[section].desc}`;
    const shown = panels.filter(p=>p.dataset.roleHidden!=='1' && !p.classList.contains('sales-panel-hidden')).length;
    if(empty) empty.style.display = shown ? 'none' : 'block';
    try{ window.scrollTo({top:0,behavior:'smooth'}); }catch(e){ try{window.scrollTo(0,0);}catch(_){} }
  }
  window.showSalesAdminSection = showSection;

  function norm(s){return String(s||'').toLowerCase().replace(/\s+/g,' ').trim();}
  function applySearch(raw){
    const q=norm(raw);
    const panels=directPanels();
    const summary=document.getElementById('salesAdminSummary');
    const label=document.getElementById('salesAdminSectionLabel');
    const empty=document.getElementById('salesAdminEmpty');
    if(!q){ showSection(activeSection); return; }
    if(summary) summary.style.display='none';
    let found=0;
    panels.forEach(p=>{
      const hay=norm((p.dataset.salesTitle||'')+' '+(p.textContent||'').slice(0,1200));
      const ok=hay.includes(q);
      p.classList.toggle('sales-panel-hidden',!ok);
      p.classList.toggle('sales-search-match',ok);
      if(ok) found++;
    });
    if(label) label.textContent=`🔎 نتائج البحث عن «${raw}» — ${found}`;
    if(empty){ empty.style.display=found?'none':'block'; empty.textContent='مفيش نتيجة. جرّب كلمة أبسط زي: راتب، حضور، سلفة، تقييم.'; }
  }

  function observeCounters(){
    if(typeof MutationObserver !== 'function') return;
    const ids=['empCountCurrent','leaveBadge','issuesBadge','regPendBadge','pendingBadge','staffOrdersBadge','salaryPeriodSelect','overtimeApprovals'];
    const mo=new MutationObserver(()=>renderSummary());
    ids.forEach(id=>{ const el=document.getElementById(id); if(el) mo.observe(el,{childList:true,subtree:true,characterData:true,attributes:true}); });
    const sal=document.getElementById('salaryPeriodSelect');
    if(sal) sal.addEventListener('change',renderSummary);
  }

  function init(){
    const admin=document.getElementById('admin');
    if(!admin || document.getElementById('salesAdminUx')?.dataset.ready==='1') return;
    tagPanels();
    renderNav();
    const host=document.getElementById('salesAdminUx'); if(host) host.dataset.ready='1';
    renderSummary();
    observeCounters();
    syncRoleNav();
    const firstSection = _pendingCounts().total > 0 ? 'approvals' : 'team';
    showSection(firstSection);

    // كل مرة الأدمن يفتح: افتح المطلوب مباشرة، من غير شاشة رئيسية أو طبقة تنقل ثانية.
    if(typeof MutationObserver !== 'function') return;
    const mo=new MutationObserver(()=>{
      if(admin.classList.contains('show')){
        renderSummary();
        syncRoleNav();
        if(!document.activeElement || document.activeElement.tagName!=='INPUT'){
          showSection(_pendingCounts().total > 0 ? 'approvals' : 'team');
        }
      }
    });
    mo.observe(admin,{attributes:true,attributeFilter:['class']});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();



/* ============================================================
   📊 Online Sales Funnel Dashboard v20
   Data source = customer_chat funnel metadata from customer app v42.
   No extra listener: manual/on-open read, capped by fsChatApi.getFunnelConvs.
   ============================================================ */
(function(){
  var FR={view:1,chat:2,tryon:3,cart:4,checkout:5,order:6,collected:7};
  var FLABEL={view:'شاهدت',chat:'شات',tryon:'Try-On',cart:'السلة',checkout:'Checkout',order:'أوردر',collected:'تم البيع'};
  var _rows=[],_loadedAt=0,_days=30,_brand='all',_busy=false;

  function escF(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');}
  function pct(a,b){return b>0?Math.round((a/b)*100):0;}
  function nfmt(n){return Number(n||0).toLocaleString('en-US');}
  function money(n){return Math.round(Number(n)||0).toLocaleString('en-US')+' ج';}
  function rowsNow(){return _brand==='all'?_rows:_rows.filter(function(x){return String(x.brand||'echarpe')===_brand;});}
  function rank(x){return FR[String((x&&x.funnelStage)||'')]||0;}
  function stageCount(stage){var r=FR[stage];return rowsNow().filter(function(x){return rank(x)>=r;}).length;}
  function hot(x){var r=rank(x);return r>=3&&r<6;}
  function overdue(x){return hot(x)&&Number(x.followUpDueAt)>0&&Number(x.followUpDueAt)<=Date.now();}
  function age(ms){
    var d=Math.max(0,Date.now()-Number(ms||0)),m=Math.floor(d/60000);
    if(m<60)return m+' د';var h=Math.floor(m/60);if(h<24)return h+' س';return Math.floor(h/24)+' يوم';
  }
  function ensureStyle(){
    if(document.getElementById('salesFunnelStyle'))return;
    var st=document.createElement('style');st.id='salesFunnelStyle';st.textContent=`
      #salesFunnelDash .fd-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}
      #salesFunnelDash .fd-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
      #salesFunnelDash .fd-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px;margin-top:11px}
      #salesFunnelDash .fd-kpi{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:10px;min-width:0}
      #salesFunnelDash .fd-kpi b{display:block;font-size:20px}#salesFunnelDash .fd-kpi span{font-size:9.8px;color:var(--sub)}
      #salesFunnelDash .fd-bar{height:5px;background:#282a31;border-radius:99px;margin-top:6px;overflow:hidden}
      #salesFunnelDash .fd-bar i{display:block;height:100%;background:var(--gold);border-radius:inherit}
      #salesFunnelDash .fd-grid{display:grid;grid-template-columns:1.25fr 1fr;gap:9px;margin-top:10px}
      #salesFunnelDash .fd-card{background:var(--panel2);border:1px solid var(--line);border-radius:13px;padding:11px;min-width:0}
      #salesFunnelDash .fd-title{font-weight:900;font-size:12.5px;margin-bottom:7px}
      #salesFunnelDash table{width:100%;border-collapse:collapse;font-size:10.5px}
      #salesFunnelDash th,#salesFunnelDash td{padding:7px 5px;border-bottom:1px solid var(--line);text-align:right}
      #salesFunnelDash th{color:var(--sub);font-size:9.5px}
      #salesFunnelDash .fd-lead{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)}
      #salesFunnelDash .fd-stage{display:inline-block;padding:3px 7px;border-radius:99px;background:#362d16;color:#f2cf69;font-size:9px;font-weight:900}
      #salesFunnelDash .fd-danger{color:#ff9b8d;font-weight:900}
      #salesFunnelDash .fd-good{color:#7de0a7;font-weight:900}
      #salesFunnelDash .fd-empty{color:var(--sub);padding:14px;text-align:center}
      @media(max-width:850px){#salesFunnelDash .fd-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}#salesFunnelDash .fd-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(st);
  }
  function ensurePanel(){
    var admin=document.getElementById('admin');if(!admin)return null;
    var p=document.getElementById('salesFunnelDash');
    if(p)return p;
    p=document.createElement('div');p.className='panel';p.id='salesFunnelDash';
    p.innerHTML='<div class="fd-head"><div><h3 style="margin:0;">🛍️ Funnel البيع الأونلاين</h3>'
      +'<div class="muted" style="font-size:10.5px;">من مشاهدة المنتج لحد الأوردر — مبني على منتجات البيع أونلاين</div></div>'
      +'<div class="fd-actions"><select id="fdBrand" class="f" style="min-width:120px;"><option value="all">كل البراندات</option><option value="echarpe">echarpe</option><option value="glow">Glow</option></select>'
      +'<select id="fdDays" class="f" style="min-width:110px;"><option value="7">7 أيام</option><option value="30" selected>30 يوم</option><option value="90">90 يوم</option></select>'
      +'<button class="btn" id="fdRefresh" style="margin:0;">↻ تحديث</button></div></div>'
      +'<div id="fdBody"><div class="fd-empty">افتح قسم الأداء لتحميل Funnel.</div></div>';
    admin.appendChild(p);
    var br=p.querySelector('#fdBrand');if(br)br.onchange=function(){_brand=br.value||'all';render();};
    var d=p.querySelector('#fdDays');if(d)d.onchange=function(){_days=Number(d.value)||30;load(true);};
    var b=p.querySelector('#fdRefresh');if(b)b.onclick=function(){load(true);};
    return p;
  }
  function productStats(){
    var map={};
    rowsNow().forEach(function(x){
      var bc=String(x.funnelBarcode||'');if(!bc)return;
      var k=bc,n=map[k]||(map[k]={barcode:bc,name:x.funnelProductName||bc,leads:0,orders:0,checkout:0,hot:0});
      if(rank(x)>=3)n.leads++;if(rank(x)>=5)n.checkout++;if(rank(x)>=6)n.orders++;if(hot(x))n.hot++;
    });
    return Object.values(map).sort(function(a,b){return b.orders-a.orders||b.checkout-a.checkout||b.leads-a.leads;}).slice(0,8);
  }
  function ownerStats(){
    var map={};
    rowsNow().forEach(function(x){
      var name=String(x.funnelOwnerName||'').trim();if(!name||rank(x)<3)return;
      var o=map[name]||(map[name]={name:name,branch:x.funnelOwnerBranch||'',leads:0,orders:0,checkout:0});
      o.leads++;if(rank(x)>=5)o.checkout++;if(rank(x)>=6)o.orders++;
    });
    return Object.values(map).sort(function(a,b){return pct(b.orders,b.leads)-pct(a.orders,a.leads)||b.orders-a.orders;});
  }
  function openLead(id){
    try{
      if(typeof window.ccOpenPanel==='function')window.ccOpenPanel();
      setTimeout(function(){if(typeof window.ccOpenConv==='function')window.ccOpenConv(id);},80);
    }catch(e){}
  }
  window.salesFunnelOpenLead=openLead;

  function render(){
    var host=document.getElementById('fdBody');if(!host)return;
    var stages=['view','tryon','cart','checkout','order'];
    var counts={};stages.forEach(function(k){counts[k]=stageCount(k);});
    var max=Math.max(1,counts.view);
    var lost=rowsNow().filter(overdue).sort(function(a,b){return Number(a.followUpDueAt)-Number(b.followUpDueAt);});
    var active=rowsNow().filter(hot);
    var products=productStats(),owners=ownerStats();
    var kpis=stages.map(function(k){
      var prev=k==='view'?counts.view:counts[stages[stages.indexOf(k)-1]];
      return '<div class="fd-kpi"><b>'+nfmt(counts[k])+'</b><span>'+FLABEL[k]+'</span>'
        +(k!=='view'?'<div style="font-size:9px;color:var(--sub);margin-top:2px;">'+pct(counts[k],prev)+'% من السابق</div>':'')
        +'<div class="fd-bar"><i style="width:'+Math.max(3,Math.round(counts[k]/max*100))+'%"></i></div></div>';
    }).join('');
    kpis+='<div class="fd-kpi"><b class="'+(lost.length?'fd-danger':'fd-good')+'">'+nfmt(lost.length)+'</b><span>متابعة متأخرة</span>'
      +'<div style="font-size:9px;color:var(--sub);margin-top:2px;">'+nfmt(active.length)+' فرصة نشطة</div></div>';

    var lostHtml=lost.slice(0,10).map(function(x){
      return '<div class="fd-lead"><div style="min-width:0;"><b>'+escF(x.name||x.phone||'عميلة')+'</b> <span class="fd-stage">'+(x.brand==='glow'?'Glow · ':'echarpe · ')+escF(FLABEL[x.funnelStage]||x.funnelStage)+'</span>'
        +'<div class="muted" style="font-size:9.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+escF(x.funnelProductName||'')+' · متأخرة '+age(x.followUpDueAt)+'</div></div>'
        +'<button class="btn" style="margin:0;padding:6px 9px;font-size:10px;" data-fd-lead="'+escF(x.id)+'">افتح الشات</button></div>';
    }).join('')||'<div class="fd-empty">مفيش Follow-up متأخر 👌</div>';

    var prodHtml=products.map(function(x){
      return '<tr><td>'+escF(x.name)+'</td><td>'+x.leads+'</td><td>'+x.checkout+'</td><td>'+x.orders+'</td><td>'+pct(x.orders,x.leads)+'%</td></tr>';
    }).join('')||'<tr><td colspan="5" class="fd-empty">لسه مفيش بيانات منتجات كفاية</td></tr>';

    var ownerHtml=owners.map(function(x){
      return '<tr><td>'+escF(x.name)+(x.branch?'<div class="muted" style="font-size:8.5px;">'+escF(x.branch)+'</div>':'')+'</td><td>'+x.leads+'</td><td>'+x.orders+'</td><td>'+pct(x.orders,x.leads)+'%</td></tr>';
    }).join('')||'<tr><td colspan="4" class="fd-empty">التحويلات الجديدة هتبدأ تتنسب للموظفة اللي بتتعامل مع الـLead.</td></tr>';

    host.innerHTML='<div class="fd-kpis">'+kpis+'</div>'
      +'<div style="margin-top:8px;font-size:10px;color:var(--sub);">Conversion مشاهدة → أوردر: <b style="color:var(--ink);">'+pct(counts.order,counts.view)+'%</b>'
      +' · Try-On → أوردر: <b style="color:var(--ink);">'+pct(counts.order,counts.tryon)+'%</b>'
      +' · آخر تحديث: '+new Date(_loadedAt).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})+'</div>'
      +'<div class="fd-grid"><div class="fd-card"><div class="fd-title">🔥 محتاج متابعة دلوقتي</div>'+lostHtml+'</div>'
      +'<div class="fd-card"><div class="fd-title">🏆 منتجات بتحوّل لبيع</div><table><thead><tr><th>المنتج</th><th>Leads</th><th>Checkout</th><th>Orders</th><th>Conv.</th></tr></thead><tbody>'+prodHtml+'</tbody></table></div></div>'
      +'<div class="fd-card" style="margin-top:9px;"><div class="fd-title">👩‍💼 تحويل الشات لطلب حسب آخر موظفة تعاملت مع الفرصة</div>'
      +'<table><thead><tr><th>الموظفة</th><th>Leads تعاملت معها</th><th>Orders</th><th>Conversion</th></tr></thead><tbody>'+ownerHtml+'</tbody></table></div>';
    host.querySelectorAll('[data-fd-lead]').forEach(function(b){
      b.addEventListener('click',function(){openLead(b.getAttribute('data-fd-lead'));});
    });
  }
  function load(force){
    var p=ensurePanel();if(!p||_busy)return Promise.resolve(false);
    if(!force&&_loadedAt&&Date.now()-_loadedAt<120000){render();return Promise.resolve(true);}
    var host=document.getElementById('fdBody');if(host)host.innerHTML='<div class="fd-empty">بيحمّل Funnel…</div>';
    if(!window.fsChatApi||typeof window.fsChatApi.getFunnelConvs!=='function'){
      if(host)host.innerHTML='<div class="fd-empty">الشات لسه ماجهزش — جرّب تحديث بعد ثواني.</div>';
      return Promise.resolve(false);
    }
    _busy=true;
    return window.fsChatApi.getFunnelConvs('customer_chat',Date.now()-_days*86400000).then(function(rows){
      _rows=Array.isArray(rows)?rows:[];_loadedAt=Date.now();render();return true;
    }).catch(function(e){
      if(host)host.innerHTML='<div class="fd-empty">تعذر تحميل Funnel. '+escF(e&&e.code||'')+'</div>';return false;
    }).then(function(x){_busy=false;return x;});
  }
  window.salesFunnelLoad=load;

  function boot(){
    ensureStyle();var p=ensurePanel();if(!p)return;
    p.dataset.salesSection='performance';p.dataset.salesTitle='Funnel البيع الأونلاين';
    // Control Center الأساسي يكون خلص init قبل البلوك ده، فابدأ مخفي على الرئيسية.
    p.classList.add('sales-panel-hidden');
    document.addEventListener('click',function(e){
      var b=e.target&&e.target.closest&&e.target.closest('[data-sales-section-btn="performance"],[data-go-sales-section="performance"]');
      if(b)setTimeout(function(){load(false);},80);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();

  // Hook section navigation without replacing its current behavior.
  var tries=0,t=setInterval(function(){
    tries++;if(typeof window.showSalesAdminSection==='function'){
      clearInterval(t);
      var old=window.showSalesAdminSection;
      window.showSalesAdminSection=function(section,fromHistory){
        var r=old(section,fromHistory);
        if(section==='performance')setTimeout(function(){load(false);},50);
        return r;
      };
    }else if(tries>40)clearInterval(t);
  },100);
})();
