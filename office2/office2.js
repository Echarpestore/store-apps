/* ============================================================
   🏢 Office 2 — v1 — واجهة المالك من الصفر (قرار المالك 10-10)
   ------------------------------------------------------------
   5 شاشات: اليوم · الموظفين (+ ملف الموظف) · الموافقات · الفلوس · المزيد
   نفس البيانات ونفس المحركات (sales/time-bank.js) — من غير أي تغيير في Office القديم.
   · كل الاستعلامات بحقل واحد (قاعدة الريبو) ونافذة زمنية محدودة.
   · التوقيت القاهرة دايمًا (المالك ممكن يكون بره مصر).
   ============================================================ */
(function(){
'use strict';
const CFG = { apiKey:"AIzaSyCa6Qho3IKoKE_jCNHYuFX6rtaV88jekQs", authDomain:"customer-feedback-8ac1d.firebaseapp.com", projectId:"customer-feedback-8ac1d", storageBucket:"customer-feedback-8ac1d.firebasestorage.app", messagingSenderId:"408860081491", appId:"1:408860081491:web:c5fa8b8e757c13196375a6" };
const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(CFG);
const auth = firebase.auth(app); const db = firebase.firestore(app);
try{ db.settings({ cacheSizeBytes: 60*1024*1024, merge:true }); db.enablePersistence({ synchronizeTabs:true }).catch(()=>{}); }catch(e){}
const GATE_DOC = 'office_gate', SESS_KEY = 'office2_gate_sess', SESS_HOURS = 10;
const DAY = 86400000; const WINDOW_DAYS = 45;
const GLOW = ['Glow'];

/* ---------- 🕒 القاهرة ---------- */
const _fmt = new Intl.DateTimeFormat('en-GB', { timeZone:'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
function caiParts(ms){ const o = {}; _fmt.formatToParts(new Date(ms)).forEach(p=>{ o[p.type] = p.value; }); return { y:+o.year, m:+o.month, d:+o.day, h:+o.hour % 24, mi:+o.minute }; }
function caiKey(ms){ const p = caiParts(ms); return p.y + '-' + String(p.m).padStart(2,'0') + '-' + String(p.d).padStart(2,'0'); }
function caiOffsetMs(ms){ const p = caiParts(ms); return Date.UTC(p.y, p.m-1, p.d, p.h, p.mi, 0) - Math.floor(ms/60000)*60000; }
function caiStamp(y, m, d, h, mi){ const guess = Date.UTC(y, m-1, d, h||0, mi||0); return guess - caiOffsetMs(guess); }
function caiDayStart(ms){ const p = caiParts(ms); return caiStamp(p.y, p.m, p.d, 0, 0); }
function caiMonthRange(ms){ const p = caiParts(ms); const last = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate(); return { start: caiStamp(p.y,p.m,1,0,0), end: caiStamp(p.y,p.m,last,23,59) + 59999, y:p.y, m:p.m, days:last }; }
function hm(ms){ if(!ms) return '—'; const p = caiParts(ms); return String(p.h).padStart(2,'0') + ':' + String(p.mi).padStart(2,'0'); }
const AR_DAYS = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
function dayName(ms){ return AR_DAYS[new Date(caiDayStart(ms) + 12*3600000).getUTCDay()]; }
function caiDow(ms){ return new Date(caiDayStart(ms) + 12*3600000).getUTCDay(); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function n0(v){ return Math.round(Number(v)||0).toLocaleString('en-US'); }
function hm2min(x){ const a = String(x||'').split(':').map(Number); return (a[0]||0)*60 + (a[1]||0); }

/* ---------- 🔐 البوابة ---------- */
async function sha(code){ const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('echarpe-office:' + String(code||''))); return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join(''); }
let gateHash = null;
function sessOk(){ try{ const o = JSON.parse(sessionStorage.getItem(SESS_KEY)||'null'); return !!(o && o.exp > Date.now() && (!gateHash || o.h === gateHash)); }catch(e){ return false; } }
async function gateFlow(user){
  const g = document.getElementById('gate'), a = document.getElementById('app');
  if(!user){ g.style.display = ''; a.style.display = 'none'; document.getElementById('gateLogin').style.display = ''; document.getElementById('gateCode').style.display = 'none'; return; }
  try{ const d = await db.collection('pos_test_settings').doc(GATE_DOC).get(); gateHash = (d.exists && d.data().hash) || null; }catch(e){ gateHash = null; }
  if(!gateHash || sessOk()){ g.style.display = 'none'; a.style.display = ''; boot(); return; }
  document.getElementById('gateLogin').style.display = 'none'; document.getElementById('gateCode').style.display = '';
  setTimeout(()=>{ try{ document.getElementById('gCode').focus(); }catch(e){} }, 100);
}
document.getElementById('gLogin').onclick = async ()=>{
  const em = document.getElementById('gEmail').value.trim(), pw = document.getElementById('gPass').value; const err = document.getElementById('gateErr'); err.textContent = '';
  if(!em || !pw){ err.textContent = 'اكتب الإيميل والباسورد'; return; }
  try{ await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); await auth.signInWithEmailAndPassword(em, pw); document.getElementById('gPass').value = ''; }catch(e){ err.textContent = 'دخول غلط: ' + (e.code||''); }
};
document.getElementById('gCodeBtn').onclick = async ()=>{
  const h = await sha(document.getElementById('gCode').value.trim()); const err = document.getElementById('gateErr');
  if(h !== gateHash){ err.textContent = 'الكود غلط'; return; }
  try{ sessionStorage.setItem(SESS_KEY, JSON.stringify({ h, exp: Date.now() + SESS_HOURS*3600000 })); }catch(e){}
  document.getElementById('gCode').value = ''; gateFlow(auth.currentUser);
};
document.getElementById('gCode').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('gCodeBtn').click(); });
document.getElementById('gPass').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('gLogin').click(); });
try{ document.getElementById('gEmail').value = localStorage.getItem('office_email') || ''; }catch(e){}
auth.onAuthStateChanged(u=>{ try{ if(u && u.email) localStorage.setItem('office_email', u.email); }catch(e){} gateFlow(u); });

/* ---------- 📦 البيانات ---------- */
const D = { employees:[], shifts:[], breaks:[], points:[], ratings:[], leaves:[], bonus:[], sales:[], settings:{}, credits:[], staffOrders:[] };
let booted = false, screenName = 'today', screenArg = null; const unsub = [];
function salesCfg(branch){ const s = D.settings[branch] || D.settings[Object.keys(D.settings)[0]] || {}; return s; }
function timeCfg(branch){ return Object.assign({}, (salesCfg(branch).timeCfg)||{}); }
function shiftDefs(branch){ return ((salesCfg(branch).compliance||{}).shifts) || {}; }
function brandOf(branch){ return GLOW.includes(branch) ? 'glow' : 'echarpe'; }
function branches(){ return [...new Set(D.employees.map(e=>e.branch).filter(Boolean))].sort(); }
function activeEmps(){ return D.employees.filter(e=> e && !e.deletedAt && e.active !== false); }
function empById(id){ return D.employees.find(e=> e.id===id); }
function isSetup(e){ const d = shiftDefs(e.branch)[e.shift]; return !!(d && d.noBonus) || e.shift === 'setup'; }
function watch(col, field, sinceMs, key, after){
  const q = db.collection(col).where(field, '>=', sinceMs);
  unsub.push(q.onSnapshot(s=>{ D[key] = s.docs.map(d=> Object.assign({ id:d.id }, d.data())); setSync(true); if(after) after(); render(); }, e=>{ console.warn(col, e && e.code); setSync(false); }));
}
function boot(){
  if(booted) return; booted = true;
  const since = Date.now() - WINDOW_DAYS*DAY;
  db.collection('sales_settings').get().then(s=>{ s.forEach(d=>{ D.settings[d.id] = d.data(); }); render(); }).catch(()=>{});
  unsub.push(db.collection('sales_employees').onSnapshot(s=>{ D.employees = s.docs.map(d=> Object.assign({ id:d.id }, d.data())); render(); }));
  watch('sales_shifts', 'clockInTs', since, 'shifts', fixForgotten);
  watch('sales_breaks', 'startTs', Date.now() - 2*DAY, 'breaks');
  watch('sales_points', 'ts', Date.now() - 75*DAY, 'points');
  watch('entries', 'ts', since, 'ratings');
  watch('sales_leave_requests', 'ts', since, 'leaves');
  watch('sales_bonus_week', 'ts', Date.now() - 120*DAY, 'bonus');
  watch('sales_time_credit', 'ts', since, 'credits');
  watch('sales_staff_orders', 'ts', since, 'staffOrders');
  // 💰 فواتير النهاردة وامبارح — استعلامين (createdAt للسيرفر + createdAtMs للأوفلاين) ودمج بالمعرّف
  const from = caiDayStart(Date.now()) - DAY; const salesMap = {};
  const mergeSales = (s)=>{ s.docs.forEach(d=>{ salesMap[d.id] = Object.assign({ id:d.id }, d.data()); }); D.sales = Object.values(salesMap); render(); };
  unsub.push(db.collection('pos_test_sales').where('createdAtMs', '>=', from).onSnapshot(mergeSales, ()=>{}));
  unsub.push(db.collection('pos_test_sales').where('createdAt', '>=', firebase.firestore.Timestamp.fromMillis(from)).onSnapshot(mergeSales, ()=>{}));
  document.querySelectorAll('#tabbar button').forEach(b=> b.onclick = ()=> go(b.dataset.s));
  document.getElementById('btnOld').onclick = ()=> go('more');
  setInterval(()=>{ if(screenName==='today') render(); }, 60000);
}
function setSync(ok){ const d = document.getElementById('syncDot'); if(d) d.className = 'dot ' + (ok ? 'ok' : 'off'); }
function toast(t){ const el = document.getElementById('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(()=> el.classList.remove('on'), 2200); }

/* ---------- 🧮 حسابات مشتركة ---------- */
function saleMs(s){ return (s.createdAt && typeof s.createdAt.toMillis==='function') ? s.createdAt.toMillis() : (Number(s.createdAtMs)||0); }
function shiftEmp(shift, emp){ const d = shiftDefs(emp && emp.branch)[shift.attendanceShiftKey] || {}; return shift.scheduledStartTime ? Object.assign({}, emp||{}, { scheduledStartTime: shift.scheduledStartTime, scheduledEndTime: shift.scheduledEndTime || d.end || (emp&&emp.scheduledEndTime) }) : (emp||{}); }
function startEndHM(emp){ const d = shiftDefs(emp.branch)[emp.shift] || {}; return { s: emp.scheduledStartTime || d.start || '', e: emp.scheduledEndTime || d.end || '' }; }
function requiredMin(shift, emp){
  const se = startEndHM(shiftEmp(shift, emp)); if(!/^\d{1,2}:\d{2}$/.test(se.s) || !/^\d{1,2}:\d{2}$/.test(se.e)) return 0;
  let m = hm2min(se.e) - hm2min(se.s); if(m <= 0) m += 1440; return m > 16*60 ? 0 : m;
}
function expectedEnd(shift, emp){
  const se = startEndHM(shiftEmp(shift, emp)); if(!/^\d{1,2}:\d{2}$/.test(se.e)) return null;
  const p = caiParts(shift.clockInTs); const [h, mi] = se.e.split(':').map(Number);
  let ts = caiStamp(p.y, p.m, p.d, h, mi); if(ts <= shift.clockInTs) ts += DAY; return ts;
}
function empShifts(emp, from, to){ return D.shifts.filter(s=> s.employeeId===emp.id && s.clockInTs >= from && s.clockInTs <= to && !s.voided).sort((a,b)=> a.clockInTs - b.clockInTs); }
function bankMonth(emp, range){ range = range || caiMonthRange(Date.now()); return TimeBank.monthSummary(empShifts(emp, range.start, range.end), timeCfg(emp.branch), s=> requiredMin(s, emp)); }
function pointsIn(empId, from, to){ return Math.round(D.points.filter(p=> p.employeeId===empId && p.ts>=from && p.ts<=to).reduce((n,p)=>{ const v = Number(p.value); return n + ((isNaN(v)||v<=0) ? 1 : v); }, 0)*10)/10; }
function ratingIn(emp, from, to){
  const pts = D.points.filter(p=> p.employeeId===emp.id && p.ts>=from && p.ts<=to);
  const fb = D.ratings.filter(f=> f.branch===emp.branch && f.ts>=from && f.ts<=to);
  let sum = 0, n = 0; const used = new Set();
  fb.forEach((f,i)=>{ if(f.servedByEmployeeId || f.servedByEmployeeName){ if(f.servedByEmployeeId===emp.id || f.servedByEmployeeName===emp.name){ sum += Number(f.r)||0; n++; } used.add(i); } });
  pts.forEach(p=>{ let best=-1, bd=Infinity; fb.forEach((f,i)=>{ if(used.has(i)) return; const d = Math.abs(f.ts - p.ts); if(d <= 120000 && d < bd){ bd = d; best = i; } }); if(best>=0){ used.add(best); sum += Number(fb[best].r)||0; n++; } });
  return n ? { avg: sum/n, n } : { avg: null, n: 0 };
}
function weekTarget(emp, weekStart){
  const cfg = timeCfg(emp.branch); const c = TimeBank.cfgOf(cfg);
  if(c.bonusPointsMode !== 'auto') return c.bonusPointsWeek;
  const ids = activeEmps().filter(e=> e.branch===emp.branch && !isSetup(e)).map(e=>e.id);
  return TimeBank.targetFor(cfg, TimeBank.weeklyPointStats(D.points, D.shifts, ids, weekStart, cfg), emp.id);
}
function weekStats(emp, w){
  const sum = TimeBank.monthSummary(empShifts(emp, w.start, w.end), timeCfg(emp.branch), s=> requiredMin(s, emp));
  const r = ratingIn(emp, w.start, w.end);
  return { lateMinTotal: sum.lateMinTotal, lateCount: sum.lateCount, forgotCount: sum.forgotCount, absences: 0, avgRating: r.avg, ratingCount: r.n, points: pointsIn(emp.id, w.start, w.end), shifts: sum.countedShifts, target: weekTarget(emp, w.start) };
}
function weekBonus(emp, w){ const st = weekStats(emp, w); const cfg = timeCfg(emp.branch); const b = TimeBank.weekBonus(st, Object.assign({}, cfg, { bonusPointsWeek: st.target })); const d = D.bonus.find(x=> x.employeeId===emp.id && x.weekKey===w.key); const autoOk = TimeBank.cfgOf(cfg).bonusApproval !== 'manual'; const decision = d ? d.status : (b.amount>0 ? (autoOk?'approved':'pending') : 'none'); return Object.assign({ st, decision, paid: decision==='approved' ? (d && d.status==='approved' ? (Number(d.amount)||b.amount) : b.amount) : 0, auto: !d && decision==='approved' }, b); }
function monthBonuses(emp, range){
  const bf = String(TimeBank.cfgOf(timeCfg(emp.branch)).bankFrom||'').slice(0,10);
  return TimeBank.weeksInPeriod(range.start, range.end, Date.now()).filter(w=> !bf || TimeBank.keyOf(w.start) >= bf).map(w=> Object.assign({ w }, weekBonus(emp, w))).filter(x=> x.st.shifts > 0);
}
function openShift(empId){ return D.shifts.find(s=> s.employeeId===empId && !s.clockOutTs && !s.voided); }
function onBreak(empId){ return D.breaks.find(b=> b.employeeId===empId && !b.endTs); }
function todaySales(branch, dayStartMs){ const end = dayStartMs + DAY - 1; return D.sales.filter(s=> s.branch===branch && !s.reversed && !s.isReversal && saleMs(s) >= dayStartMs && saleMs(s) <= end); }
function sumTotal(list){ return list.reduce((n,s)=> n + (Number(s.total)||0), 0); }
function payBreak(list){ const o = {}; list.forEach(s=>{ Object.entries(s.payments||{}).forEach(([k,v])=>{ o[k] = (o[k]||0) + (Number(v)||0); }); }); return o; }
const SHIFT_AR = { morning:'صباحي', evening:'مسائي', setup:'تجهيز' };
const PAY_AR = { cash:'كاش', visa:'فيزا', instapay:'إنستاباي', wallet:'محفظة', credit:'رصيد', points:'نقط' };
function lastSaleTs(empId, from, to){ let b = 0; D.points.forEach(p=>{ if(p.employeeId===empId && p.ts>=from && p.ts<=to && p.ts>b) b = p.ts; }); return b; }
/* 🧹 الشيفت المنسي يتقفل لوحده (نفس منطق sales) */
const fixed = new Set();
async function fixForgotten(){
  const now = Date.now();
  for(const s of D.shifts){
    const emp = empById(s.employeeId); if(!emp || fixed.has(s.id) || s.bankAutoEnd || s.voided) continue;
    const cfg = timeCfg(emp.branch); if(!TimeBank.enabledFor(cfg, s.clockInTs)) continue;
    if(!(TimeBank.isForgottenOpen(s, now, cfg) || (s.clockOutTs && s.needsClockOutReview && s.autoClosedAt1))) continue;
    fixed.add(s.id);
    const fix = TimeBank.forgottenFix(s, expectedEnd(s, emp), lastSaleTs(s.employeeId, s.clockInTs, s.clockInTs + 16*3600000), cfg); if(!fix) continue;
    const patch = { clockOutTs: fix.clockOutTs, shiftMinutes: fix.shiftMinutes, overtimeMinutes:0, overtimeApprovedMin:0, overtimeDecision:'none', earlyMin:0, earlyHours:0, forgotClockOut:true, needsClockOutReview:false, bankAutoEnd:true, bankAutoReason: fix.reason, bankAutoAt: now, bankAutoFrom:'office2' };
    try{ await db.collection('sales_shifts').doc(s.id).update(patch); Object.assign(s, patch); }catch(e){ console.warn('fix', e && e.code); }
  }
}

/* ---------- 🧭 التنقل ---------- */
function go(name, arg){ screenName = name; screenArg = arg || null; window.scrollTo(0,0); document.querySelectorAll('#tabbar button').forEach(b=> b.classList.toggle('on', b.dataset.s === (name==='emp' ? 'staff' : name))); render(); }
function head(t, sub){ document.getElementById('hTitle').innerHTML = t; document.getElementById('hSub').textContent = sub || ''; }
function render(){
  if(!booted) return;
  const el = document.getElementById('screen'); if(!el) return;
  try{
    const fn = { today: rToday, staff: rStaff, emp: rEmp, inbox: rInbox, money: rMoney, more: rMore }[screenName] || rToday;
    el.innerHTML = fn();
  }catch(e){ console.error(e); el.innerHTML = '<div class="card"><b>حصل خطأ في العرض</b><div class="hint">' + esc(e.message) + '</div></div>'; }
  const n = inboxItems().length; const b = document.getElementById('inboxN'); b.style.display = n ? '' : 'none'; b.textContent = n;
}

/* ---------- ١) اليوم ---------- */
function alerts(){
  const out = []; const now = Date.now();
  activeEmps().forEach(e=>{ const al = TimeBank.lateAlerts(D.shifts.filter(s=> s.employeeId===e.id), timeCfg(e.branch), now); if(al.length) out.push({ k:'bad', t:`⏰ <b>${esc(e.name)}</b> اتأخرت ${al[0].count} مرات في ${TimeBank.cfgOf(timeCfg(e.branch)).alertWindowDays} يوم (متوسط ${al[0].avgMin} د)`, go:()=>go('emp', e.id) }); });
  D.shifts.filter(s=> s.bankAutoEnd && s.bankAutoAt > now - 2*DAY).forEach(s=>{ const e = empById(s.employeeId); if(e) out.push({ k:'w', t:`🕐 شيفت <b>${esc(e.name)}</b> اتقفل تلقائي على ${hm(s.clockOutTs)} (${s.bankAutoReason==='last_sale'?'آخر فاتورة ليها':'ميعاد شيفتها'}) — نسيت الانصراف`, go:()=>go('emp', e.id) }); });
  const n = inboxItems().length; if(n) out.push({ k:'i', t:`📩 ${n} حاجة مستنية قرارك`, go:()=>go('inbox') });
  return out;
}
function rToday(){
  const now = Date.now(); head('اليوم · ' + dayName(now) + ' ' + caiParts(now).d, 'كل الفروع');
  const al = alerts().map((a,i)=>`<div class="alert ${a.k}" onclick="O2.alert(${i})">${a.t}<span class="go">افتح ›</span></div>`).join('');
  window._alerts = alerts();
  const t0 = caiDayStart(now), y0 = t0 - DAY;
  const kp = branches().map(b=>{ const t = sumTotal(todaySales(b, t0)), y = sumTotal(todaySales(b, y0)); const d = y>0 ? Math.round((t-y)/y*100) : 0; return `<div class="kpi" onclick="O2.go('money')"><small>${esc(b.replace('echarpe ',''))}</small><b>${n0(t)}</b><span class="d ${d>=0?'up':'dn'}">${y>0?(d>=0?'▲':'▼')+' '+Math.abs(d)+'% عن امبارح':'—'}</span></div>`; }).join('');
  const emps = activeEmps().filter(e=>!isSetup(e)); const present = emps.filter(e=> openShift(e.id));
  const rows = emps.sort((a,b)=> (openShift(b.id)?1:0) - (openShift(a.id)?1:0) || String(a.branch).localeCompare(String(b.branch))).map(e=>{
    const s = openShift(e.id); const brk = s && onBreak(e.id); const bm = bankMonth(e);
    const st = s ? (brk ? `بريك من ${hm(brk.startTs)}` : (Number(s.lateMinutes)>TimeBank.cfgOf(timeCfg(e.branch)).bankGraceMin ? `من ${hm(s.clockInTs)} · متأخرة ${s.lateMinutes} د` : `من ${hm(s.clockInTs)} · في الميعاد`)) : (todayShift(e) ? `مشيت ${hm(todayShift(e).clockOutTs)}` : 'مش موجودة');
    const pill = bm.balanceMin ? `<span class="pill ${bm.balanceMin<0?'p-bad':'p-good'}">${TimeBank.fmtMin(bm.balanceMin)}</span>` : '<span class="pill p-gray">0</span>';
    return `<div class="row" onclick="O2.go('emp','${e.id}')"><span class="sdot ${s?(brk?'brk':''):'off'}"></span><div class="n"><b>${esc(e.name)} · ${esc(String(e.branch||'').replace('echarpe ',''))}</b><small>${st} · ${pointsIn(e.id, t0, now)} نقطة النهاردة</small></div>${pill}</div>`;
  }).join('');
  return `<div class="full">${al}</div>
    <div class="card"><h3>💰 مبيعات النهاردة <small>لحد ${hm(now)}</small></h3><div class="kpis">${kp || '<div class="empty">—</div>'}</div></div>
    <div class="card"><h3>👥 مين موجود دلوقتي <small>${present.length} من ${emps.length}</small></h3>${rows || '<div class="empty">لسه مفيش موظفين</div>'}</div>`;
}
function todayShift(e){ const t0 = caiDayStart(Date.now()); return D.shifts.find(s=> s.employeeId===e.id && s.clockInTs >= t0 && s.clockOutTs); }

/* ---------- ٢) الموظفين ---------- */
function rStaff(){
  head('الموظفين', activeEmps().length + ' موظف · ' + branches().length + ' فروع');
  const range = caiMonthRange(Date.now()); const w = TimeBank.currentWeek(Date.now());
  return branches().map(b=>{
    const list = activeEmps().filter(e=> e.branch===b).map(e=>{
      const s = openShift(e.id); const bm = bankMonth(e, range); const wb = isSetup(e) ? null : weekBonus(e, w); const r = ratingIn(e, range.start, range.end);
      return `<div class="row" onclick="O2.go('emp','${e.id}')"><span class="sdot ${s?'':'off'}"></span><div class="n"><b>${esc(e.name)}</b><small>${esc(SHIFT_AR[e.shift]||e.shift||'')} ${startEndHM(e).s?startEndHM(e).s+'–'+startEndHM(e).e:''} · ${bm.lateCount} تأخير · ${r.avg!=null?'⭐ '+r.avg.toFixed(1):'بدون تقييم'} · ${pointsIn(e.id, range.start, range.end)} نقطة</small></div>${wb?`<span class="pill ${wb.score>=TimeBank.cfgOf(timeCfg(e.branch)).bonusMinScore?'p-good':'p-warn'}">${wb.score}/100</span>`:''}<span class="pill ${bm.balanceMin<0?'p-bad':(bm.balanceMin>0?'p-good':'p-gray')}">${TimeBank.fmtMin(bm.balanceMin)}</span></div>`;
    }).join('');
    return `<div class="card"><h3>📍 ${esc(b)} <small>${activeEmps().filter(e=>e.branch===b).length}</small></h3>${list}</div>`;
  }).join('') || '<div class="empty">لسه بيحمّل…</div>';
}

/* ---------- ٢ب) ملف الموظف ---------- */
let empMonthOffset = 0;
function rEmp(){
  const e = empById(screenArg); if(!e) return '<div class="empty">الموظف مش موجود</div>';
  const base = new Date(); base.setMonth(base.getMonth() + empMonthOffset); const range = caiMonthRange(base.getTime());
  const se = startEndHM(e);
  head(`<button class="back" onclick="O2.go('staff')">‹</button> ${esc(e.name)}`, `${esc(e.branch||'')} · ${esc(SHIFT_AR[e.shift]||e.shift||'')} ${se.s?se.s+'–'+se.e:''}${e.hireDate?' · من '+e.hireDate:''}`);
  const bm = bankMonth(e, range); const cfg = TimeBank.cfgOf(timeCfg(e.branch)); const w = TimeBank.currentWeek(Date.now()); const wb = weekBonus(e, w); const r = ratingIn(e, range.start, range.end);
  const rate = (Number(e.baseSalary)||0)/30/8; const money = TimeBank.money(bm.balanceMin, rate); const bonuses = monthBonuses(e, range);
  // تقويم
  const byDay = {}; empShifts(e, range.start, range.end).forEach(s=>{ byDay[caiKey(s.clockInTs)] = s; });
  const firstDow = caiDow(range.start); let cal = ['ح','ن','ث','ر','خ','ج','س'].map(d=>`<div class="hd">${d}</div>`).join('') + '<div class="hd"></div>'.repeat(firstDow);
  const todayKey = caiKey(Date.now());
  for(let d=1; d<=range.days; d++){
    const k = range.y + '-' + String(range.m).padStart(2,'0') + '-' + String(d).padStart(2,'0'); const s = byDay[k];
    const dow = (firstDow + d - 1) % 7; const isOff = Number(e.dayOff) === dow;
    let cls = 'fut'; if(k <= todayKey){ cls = s ? (!s.clockOutTs ? 'open' : ((Number(s.lateMinutes)||0) > cfg.bankGraceMin ? 'late' : 'ok')) : (isOff ? 'off' : 'miss'); }
    if(s && s.forgotClockOut) cls += ' late';
    cal += `<div class="${cls}" ${s?`onclick="O2.shift('${s.id}')"`:''}>${d}</div>`;
  }
  const rows = bm.rows.slice().reverse().map(x=>{ const s = D.shifts.find(z=> z.id===x.id) || {}; const tag = x.counted ? `<span class="pill ${x.delta<0?'p-bad':(x.delta>0?'p-good':'p-gray')}">${TimeBank.fmtMin(x.delta)}</span>` : `<span class="pill p-warn">${({open:'مفتوح',needs_review:'مراجعة',voided:'ملغي'})[x.reason]||x.reason}</span>`;
    return `<div class="row" onclick="O2.shift('${x.id}')"><div class="n"><b>${dayName(x.clockInTs)} ${caiParts(x.clockInTs).d}</b><small>${hm(x.clockInTs)} ← ${hm(x.clockOutTs)}${x.lateMin?' · متأخرة '+x.lateMin+' د':''}${s.lateExcused?' · معذور':''}${s.forgotClockOut?' · قُفل تلقائي':''}${s.bankAdjustMin?' · تعديل '+TimeBank.fmtMin(s.bankAdjustMin):''}</small></div>${tag}</div>`; }).join('');
  const bonusRows = bonuses.map(x=>`<div class="row"><div class="n"><b>أسبوع ${x.w.key.slice(5)}</b><small>${x.score}/100 · التزام ${x.parts.commit} · تقييم ${x.parts.rating} · مبيعات ${x.parts.sales}${x.st.target?' (هدف '+x.st.target+')':''}</small></div><span class="pill ${x.decision==='approved'?'p-good':(x.decision==='pending'?'p-warn':'p-gray')}">${x.decision==='approved'?x.paid+' ج':(x.decision==='pending'?'مستني':(x.decision==='rejected'?'ملغي':'—'))}</span></div>`).join('');
  const mLabel = new Intl.DateTimeFormat('ar-EG', { timeZone:'Africa/Cairo', month:'long', year:'numeric' }).format(new Date(range.start + 5*DAY));
  return `
    <div class="card"><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:8px"><div><small class="tag">🏦 رصيد الوقت · ${mLabel}</small><div class="big" style="color:${bm.balanceMin<0?'var(--bad)':(bm.balanceMin>0?'var(--good)':'var(--ink)')}">${TimeBank.fmtMin(bm.balanceMin)}</div></div><div style="text-align:left"><small class="tag">حافز الأسبوع ده</small><div class="big" style="font-size:22px">${isSetup(e)?'—':wb.score+'<small style="font-size:12px">/100</small>'}</div></div></div>
      <div class="hint">${bm.lateCount} تأخير (${bm.lateMinTotal} د) · ${bm.plusMin} د زيادة · ${bm.forgotCount} شيفت منسي · ${bm.countedShifts} شيفت · ${r.avg!=null?'تقييم '+r.avg.toFixed(1)+'/4 ('+r.n+')':'بدون تقييم'} · ${pointsIn(e.id, range.start, range.end)} نقطة</div>
      <div class="hint">${bm.balanceMin<0?'لو فضل كده: خصم <b class="money">'+n0(money.deduction)+' ج</b>':(bm.balanceMin>0?'أوفرتايم <b class="money">'+n0(money.overtimePay)+' ج</b>':'')} · حوافز معتمدة <b class="money">${n0(bonuses.reduce((n,x)=>n+x.paid,0))} ج</b></div></div>
    <div class="card"><h3><span><button class="back" onclick="O2.month(-1)">‹</button> ${mLabel} <button class="back" onclick="O2.month(1)">›</button></span><small>✅ في الميعاد · 🟡 تأخير/منسي · 🔴 مفيش شيفت · ⬜ إجازة</small></h3><div class="cal">${cal}</div></div>
    <div class="card"><h3>الشيفتات <small>اضغط أي شيفت للتفاصيل والتعديل</small></h3>${rows || '<div class="empty">مفيش شيفتات الشهر ده</div>'}</div>
    ${isSetup(e)?'':`<div class="card"><h3>🎁 الحوافز الأسبوعية</h3>${bonusRows || '<div class="empty">لسه مفيش أسبوع مكتمل</div>'}</div>`}
    <div class="card full"><div class="btns">${openShift(e.id)?`<button class="btn" onclick="O2.closeOpen('${e.id}')">🕐 اقفل الشيفت المفتوح</button>`:''}<button class="btn" onclick="O2.oldOffice('emp')">💵 سلفة / خصم / المرتب (Office القديم)</button></div></div>`;
}
/* تفاصيل شيفت + إجراءات */
function shiftSheet(id){
  const s = D.shifts.find(x=> x.id===id); if(!s) return; const e = empById(s.employeeId) || {}; const x = TimeBank.shiftDelta(s, requiredMin(s, e), timeCfg(e.branch));
  sheet(`<h2>${esc(e.name)} · ${dayName(s.clockInTs)} ${caiParts(s.clockInTs).d}</h2>
    <div class="hint">حضور ${hm(s.clockInTs)} · انصراف ${hm(s.clockOutTs)} · المطلوب ${x.requiredMin?Math.round(x.requiredMin/60*10)/10+' س':'—'} · اشتغلت ${Math.round(x.workedMin/60*10)/10} س</div>
    <div class="hint">تأخير ${Number(s.lateMinutes)||0} د${s.lateExcused?' (معذور)':''} · الرصيد ${x.counted?TimeBank.fmtMin(x.delta):'مش محسوب'}${s.forgotClockOut?' · قُفل تلقائي ('+(s.bankAutoReason||'')+')':''}${s.bankAdjustMin?' · تعديل المالك '+TimeBank.fmtMin(s.bankAdjustMin):''}${s.bankNote?' · '+esc(s.bankNote):''}</div>
    <div class="btns">
      ${Number(s.lateMinutes)>0 && !s.lateExcused ? `<button class="btn g" onclick="O2.excuse('${s.id}')">✅ اعذر التأخير (${s.lateMinutes} د)</button>` : ''}
      ${s.lateExcused ? `<button class="btn" onclick="O2.unexcuse('${s.id}')">↩ رجّع التأخير</button>` : ''}
      <button class="btn" onclick="O2.adjust('${s.id}')">✏️ تعديل الرصيد بالدقيقة</button>
      ${!s.clockOutTs ? `<button class="btn" onclick="O2.closeAt('${s.id}')">🕐 اقفل على ميعاد النهاية</button>` : ''}
      <button class="btn r" onclick="O2.voidShift('${s.id}')">🗑️ إلغاء الشيفت</button>
    </div>`);
}
async function patchShift(id, patch, msg){ try{ await db.collection('sales_shifts').doc(id).update(patch); const s = D.shifts.find(x=>x.id===id); if(s) Object.assign(s, patch); closeSheet(); toast(msg||'اتحفظ ✅'); render(); }catch(e){ toast('تعذر الحفظ: ' + (e && e.code)); } }
const O2 = {
  go, closeSheet, month(d){ empMonthOffset += d; render(); }, shift: shiftSheet,
  alert(i){ const a = (window._alerts||[])[i]; if(a) a.go(); },
  oldOffice(){ location.href = '../Office/'; },
  excuse(id){ const s = D.shifts.find(x=>x.id===id); if(!s) return; if(!confirm('تعذر تأخير ' + s.lateMinutes + ' دقيقة؟ (مش هيتحسب على رصيدها)')) return; patchShift(id, { lateExcused:true, bankAdjustMin: (Number(s.bankAdjustMin)||0) + (Number(s.lateMinutes)||0), bankNote:'المالك عذر التأخير', bankEditedAt: Date.now() }, 'اتعذر ✅'); },
  unexcuse(id){ const s = D.shifts.find(x=>x.id===id); if(!s) return; patchShift(id, { lateExcused:false, bankAdjustMin: (Number(s.bankAdjustMin)||0) - (Number(s.lateMinutes)||0), bankNote:'', bankEditedAt: Date.now() }, 'رجع ✅'); },
  adjust(id){ const s = D.shifts.find(x=>x.id===id); if(!s) return; const v = prompt('تعديل رصيد الشيفت بالدقيقة (موجب = لصالحها · سالب = عليها)\nالحالي: ' + (Number(s.bankAdjustMin)||0), String(Number(s.bankAdjustMin)||0)); if(v===null) return; const n = Math.round(Number(v)||0); const note = prompt('السبب (بيظهر في التفاصيل):', s.bankNote||'') || ''; patchShift(id, { bankAdjustMin:n, bankNote:note, bankEditedAt: Date.now() }); },
  closeAt(id){ const s = D.shifts.find(x=>x.id===id); if(!s) return; const e = empById(s.employeeId)||{}; const fix = TimeBank.forgottenFix(s, expectedEnd(s, e), lastSaleTs(s.employeeId, s.clockInTs, s.clockInTs+16*3600000), timeCfg(e.branch)); if(!fix) return; if(!confirm('يتقفل على ' + hm(fix.clockOutTs) + '؟')) return; patchShift(id, { clockOutTs: fix.clockOutTs, shiftMinutes: fix.shiftMinutes, overtimeMinutes:0, overtimeApprovedMin:0, overtimeDecision:'none', earlyMin:0, earlyHours:0, forgotClockOut:true, needsClockOutReview:false, bankAutoEnd:true, bankAutoReason: fix.reason, bankAutoAt: Date.now(), closedByOwner:true }, 'اتقفل ✅'); },
  closeOpen(empId){ const s = openShift(empId); if(s) shiftSheet(s.id); },
  async voidShift(id){ const s = D.shifts.find(x=>x.id===id); if(!s) return; const reason = prompt('سبب إلغاء الشيفت:'); if(!reason) return; try{ const b = db.batch(); b.set(db.collection('sales_shifts_voided').doc(id), Object.assign({}, s, { voidedAt: Date.now(), voidedBy:'office2', voidReason: reason })); b.delete(db.collection('sales_shifts').doc(id)); b.delete(db.collection('sales_time_credit').doc('att_late_' + s.employeeId + '_' + id)); await b.commit(); D.shifts = D.shifts.filter(x=>x.id!==id); closeSheet(); toast('اتلغى'); render(); }catch(e){ toast('تعذر: ' + (e&&e.code)); } },
  async leave(id, ok){ try{ await db.collection('sales_leave_requests').doc(id).update({ status: ok?'approved':'rejected', decidedAt: Date.now(), decidedBy:'office2' }); toast(ok?'اتوافق ✅':'اترفض'); }catch(e){ toast('تعذر: '+(e&&e.code)); } },
  async overtime(id, ok){ const s = D.shifts.find(x=>x.id===id); if(!s) return; try{ await db.collection('sales_shifts').doc(id).update({ overtimeApprovedMin: ok ? (Number(s.overtimeMinutes)||0) : 0, overtimeDecision: ok?'approved':'rejected', overtimeAutoApproved:false, overtimeDecidedAt: Date.now(), overtimeDecidedBy:'office2' }); toast(ok?'اتعتمد ✅':'اترفض'); }catch(e){ toast('تعذر: '+(e&&e.code)); } },
  async bonus(empId, weekKey, ok, amount, score){ const e = empById(empId); if(!e) return; try{ await db.collection('sales_bonus_week').doc('bw_'+empId+'_'+weekKey).set({ employeeId:empId, employeeName:e.name||'', branch:e.branch||'', weekKey, amount: ok?amount:0, score, status: ok?'approved':'rejected', decidedAt: Date.now(), decidedBy:'office2', ts: Date.now() }, { merge:true }); toast(ok?'اتعتمد ✅':'اتلغى'); }catch(e){ toast('تعذر: '+(e&&e.code)); } },
  inboxTab(t){ inboxTab = t; render(); }, moneyTab(t){ moneyTab = t; render(); },
  logout(){ try{ sessionStorage.removeItem(SESS_KEY); }catch(e){} auth.signOut(); location.reload(); }
};
window.O2 = O2;
function sheet(html){ document.getElementById('sheetBody').innerHTML = html; document.getElementById('sheet').style.display = ''; }
function closeSheet(){ document.getElementById('sheet').style.display = 'none'; }

/* ---------- ٣) الموافقات ---------- */
let inboxTab = 'pending';
function inboxItems(){
  const out = []; const now = Date.now();
  D.leaves.filter(l=> l.status==='pending').forEach(l=> out.push({ kind:'leave', ts:l.ts, l }));
  D.shifts.filter(s=> s.clockOutTs && s.otRequiresApproval && s.overtimeDecision==='pending' && !s.bankAutoEnd && (Number(s.overtimeMinutes)||0) > 120 && !TimeBank.enabledFor(timeCfg((empById(s.employeeId)||{}).branch), s.clockInTs)).forEach(s=> out.push({ kind:'ot', ts:s.clockOutTs, s }));
  activeEmps().filter(e=>!isSetup(e)).forEach(e=>{ const cfg = TimeBank.cfgOf(timeCfg(e.branch)); if(cfg.bonusApproval !== 'manual') return; const r = caiMonthRange(now); monthBonuses(e, { start: r.start - 31*DAY, end: r.end }).filter(x=> x.decision==='pending').forEach(x=> out.push({ kind:'bonus', ts:x.w.end, e, x })); });
  D.staffOrders.filter(o=> (o.status||'pending')==='pending').forEach(o=> out.push({ kind:'order', ts:o.ts, o }));
  return out.sort((a,b)=> (b.ts||0)-(a.ts||0));
}
function rInbox(){
  const items = inboxItems(); head('الموافقات', items.length + ' مستنية · كل الفروع');
  const seg = `<div class="seg full"><button class="${inboxTab==='pending'?'on':''}" onclick="O2.inboxTab('pending')">مستنية ${items.length}</button><button class="${inboxTab==='done'?'on':''}" onclick="O2.inboxTab('done')">اتقرر</button><button class="${inboxTab==='auto'?'on':''}" onclick="O2.inboxTab('auto')">تلقائي</button></div>`;
  if(inboxTab==='auto'){
    const now = Date.now(); const r = caiMonthRange(now); const rows = [];
    activeEmps().filter(e=>!isSetup(e)).forEach(e=> monthBonuses(e, { start: r.start - 31*DAY, end: r.end }).filter(x=> x.decision==='approved' && x.w.end > now - 21*DAY).forEach(x=> rows.push(`<div class="card"><div class="row first"><div class="n"><b>🎁 حافز أسبوع ${x.w.key.slice(5)} · ${esc(e.name)}</b><small>${x.auto?'اتعتمد تلقائي':'اعتمدته'} ${x.paid} ج · ${x.score}/100 (التزام ${x.parts.commit} · تقييم ${x.parts.rating} · مبيعات ${x.parts.sales})</small></div></div><div class="btns"><button class="btn r" onclick="O2.bonus('${e.id}','${x.w.key}',false,0,${x.score})">✖ إلغاء</button></div></div>`)));
    D.shifts.filter(s=> s.bankAutoEnd && s.bankAutoAt > now - 21*DAY).forEach(s=>{ const e = empById(s.employeeId)||{}; rows.push(`<div class="card"><div class="row first" onclick="O2.shift('${s.id}')"><div class="n"><b>🕐 شيفت منسي · ${esc(e.name)}</b><small>${dayName(s.clockInTs)} ${caiParts(s.clockInTs).d} · ${hm(s.clockInTs)} ← اتقفل ${hm(s.clockOutTs)} (${s.bankAutoReason==='last_sale'?'آخر فاتورة':'ميعاد الشيفت'})</small></div><span class="pill p-acc">عدّل ›</span></div></div>`); });
    return seg + (rows.join('') || '<div class="empty">مفيش حاجة اتقررت تلقائي في آخر 3 أسابيع</div>');
  }
  if(inboxTab==='done'){
    const rows = D.leaves.filter(l=> l.status && l.status!=='pending').sort((a,b)=>(b.decidedAt||b.ts||0)-(a.decidedAt||a.ts||0)).slice(0,30).map(l=>`<div class="row"><div class="n"><b>${leaveIcon(l.type)} ${esc(l.empName)}</b><small>${esc(l.dateKey)} · ${esc(leaveLabel(l))}</small></div><span class="pill ${l.status==='approved'?'p-good':'p-bad'}">${l.status==='approved'?'موافق':'مرفوض'}</span></div>`).join('');
    return seg + `<div class="card">${rows || '<div class="empty">—</div>'}</div>`;
  }
  const cards = items.map(it=>{
    if(it.kind==='leave'){ const l = it.l; const e = D.employees.find(x=>x.id===l.empId)||{}; const same = activeEmps().filter(x=> x.branch===l.branch).length; return `<div class="card"><div class="row first"><div class="n"><b>${leaveIcon(l.type)} ${esc(leaveLabel(l))} · ${esc(l.empName)} (${esc(String(l.branch||'').replace('echarpe ',''))})</b><small>${dayName(dateKeyMs(l.dateKey))} ${esc(l.dateKey)}${l.reason?' · «'+esc(l.reason)+'»':''} · الفرع فيه ${same} موظفين</small></div></div><div class="btns"><button class="btn g" onclick="O2.leave('${l.id}',true)">✅ موافق</button><button class="btn r" onclick="O2.leave('${l.id}',false)">✖ رفض</button><button class="btn" onclick="O2.go('emp','${l.empId}')">👤</button></div></div>`; }
    if(it.kind==='ot'){ const s = it.s; const e = empById(s.employeeId)||{}; const ls = lastSaleTs(s.employeeId, s.clockInTs, s.clockOutTs); return `<div class="card"><div class="row first"><div class="n"><b>⏱️ أوفرتايم ${TimeBank.fmtMin(s.overtimeMinutes).replace('+','')} · ${esc(e.name)}</b><small>${dayName(s.clockInTs)} ${caiParts(s.clockInTs).d} · ${hm(s.clockInTs)} ← ${hm(s.clockOutTs)} · ${ls?'فيه فواتير لحد '+hm(ls)+' ✅':'مفيش فواتير بعد الميعاد ⚠️'}</small></div></div><div class="btns"><button class="btn g" onclick="O2.overtime('${s.id}',true)">✅ صح</button><button class="btn r" onclick="O2.overtime('${s.id}',false)">✖ مش شغل</button></div></div>`; }
    if(it.kind==='bonus'){ const x = it.x; return `<div class="card"><div class="row first"><div class="n"><b>🎁 حافز أسبوع ${x.w.key.slice(5)} · ${esc(it.e.name)}</b><small>${x.score}/100 (التزام ${x.parts.commit} · تقييم ${x.parts.rating} · مبيعات ${x.parts.sales}) → ${x.amount} ج</small></div></div><div class="btns"><button class="btn g" onclick="O2.bonus('${it.e.id}','${x.w.key}',true,${x.amount},${x.score})">✅ اعتمد</button><button class="btn r" onclick="O2.bonus('${it.e.id}','${x.w.key}',false,0,${x.score})">✖ رفض</button></div></div>`; }
    if(it.kind==='order'){ const o = it.o; return `<div class="card"><div class="row first"><div class="n"><b>🛍️ أوردر موظفة · ${esc(o.employeeName)}</b><small>${n0(o.total||o.amount)} ج · ${esc(o.payMethod==='salary'?'من المرتب':'كاش')} · فاتورة ${esc(o.invoiceNo||'')}</small></div></div><div class="btns"><button class="btn" onclick="O2.oldOffice()">القرار من Office القديم (بيسجّل السلفة)</button></div></div>`; }
    return '';
  }).join('');
  return seg + (cards || '<div class="empty">مفيش حاجة مستنية قرارك 🎉</div>');
}
function leaveIcon(t){ return { dayoff:'🏖️', changeDayoff:'🔁', shiftSwap:'🔄' }[t] || '📩'; }
function leaveLabel(l){ return { dayoff:'إجازة', changeDayoff:'تغيير يوم الإجازة', shiftSwap:'تبديل شيفت ' + (l.fromShift||'') + ' ← ' + (l.toShift||'') }[l.type] || l.type; }
function dateKeyMs(k){ const a = String(k||'').split('-').map(Number); return a.length===3 ? caiStamp(a[0],a[1],a[2],12,0) : Date.now(); }

/* ---------- ٤) الفلوس ---------- */
let moneyTab = 'today';
function rMoney(){
  head('الفلوس', 'المبيعات والمرتبات');
  const now = Date.now(); const t0 = caiDayStart(now), y0 = t0 - DAY;
  const seg = `<div class="seg full"><button class="${moneyTab==='today'?'on':''}" onclick="O2.moneyTab('today')">اليوم</button><button class="${moneyTab==='pay'?'on':''}" onclick="O2.moneyTab('pay')">المرتبات</button></div>`;
  if(moneyTab==='pay'){
    const range = caiMonthRange(now); const mLabel = new Intl.DateTimeFormat('ar-EG', { timeZone:'Africa/Cairo', month:'long', year:'numeric' }).format(new Date(range.start + 5*DAY));
    const rows = activeEmps().filter(e=> Number(e.baseSalary)>0).map(e=>{ const bm = bankMonth(e, range); const rate = (Number(e.baseSalary)||0)/30/8; const m = TimeBank.money(bm.balanceMin, rate); const bon = isSetup(e)?0:monthBonuses(e, range).reduce((n,x)=>n+x.paid,0); const est = Math.round((Number(e.baseSalary)||0) - m.deduction + m.overtimePay + bon);
      return `<div class="row" onclick="O2.go('emp','${e.id}')"><div class="n"><b>${esc(e.name)}</b><small>أساسي ${n0(e.baseSalary)}${m.deduction?' · رصيد '+TimeBank.fmtMin(bm.balanceMin)+' (−'+n0(m.deduction)+')':''}${m.overtimePay?' · أوفرتايم +'+n0(m.overtimePay):''}${bon?' · حوافز +'+n0(bon):''}</small></div><b class="money">${n0(est)}</b></div>`; }).join('');
    return seg + `<div class="card"><h3>💼 مرتبات ${mLabel} <small>تقديري: الأساسي ± رصيد الوقت + الحوافز</small></h3>${rows}<div class="hint">الغياب والسلف والخصومات الإدارية والصرف الفعلي — من Office القديم أو تطبيق sales لحد ما تتنقل هنا (المرحلة الجاية).</div><div class="btns"><button class="btn p" onclick="O2.oldOffice()">فتح المرتبات الكاملة</button></div></div>`;
  }
  const cards = branches().map(b=>{ const t = todaySales(b, t0); const y = todaySales(b, y0); const pb = payBreak(t); const parts = Object.entries(pb).filter(([k,v])=> v).map(([k,v])=> (PAY_AR[k]||k)+' '+n0(v)).join(' · ');
    return `<div class="card"><h3>📍 ${esc(b)} <small>${t.length} فاتورة</small></h3><div class="grid2"><div class="kpi"><small>النهاردة</small><b>${n0(sumTotal(t))}</b></div><div class="kpi"><small>امبارح كله</small><b>${n0(sumTotal(y))}</b></div></div><div class="hint">${parts || '—'}</div></div>`; }).join('');
  return seg + cards;
}

/* ---------- ٥) المزيد ---------- */
function rMore(){
  head('المزيد', '');
  return `<div class="card"><div class="row first" onclick="O2.oldOffice()"><div class="n"><b>📷 الكاميرات</b><small>Office القديم (نفس الصفحة)</small></div><span class="pill p-acc">افتح ›</span></div>
    <div class="row" onclick="O2.oldOffice()"><div class="n"><b>🏢 Office القديم</b><small>المخزون · التقارير · المصاريف · النظافة · كل اللي لسه ما اتنقلش</small></div><span class="pill p-acc">افتح ›</span></div>
    <div class="row" onclick="location.href='../sales/'"><div class="n"><b>📱 تطبيق sales</b><small>إعدادات الوقت والحافز · المرتبات والصرف</small></div><span class="pill p-acc">افتح ›</span></div>
    <div class="row" onclick="O2.logout()"><div class="n"><b>🚪 خروج</b></div></div></div>
    <div class="hint">Office 2 · v1 · البيانات من نفس القاعدة — أي تعديل هنا بيظهر في sales وOffice فورًا</div>`;
}
})();
