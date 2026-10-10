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
const D = { employees:[], shifts:[], breaks:[], points:[], ratings:[], leaves:[], bonus:[], sales:[], settings:{}, credits:[], staffOrders:[], advances:[], deductions:[], salaryPays:[], commPays:[], expenses:[], advCfg:{} };
let booted = false, screenName = 'today', screenArg = null; const unsub = [];
function salesCfg(branch){ const s = D.settings[branch] || D.settings[Object.keys(D.settings)[0]] || {}; return s; }
function timeCfg(branch){ return Object.assign({}, (salesCfg(branch).timeCfg)||{}); }
function shiftDefs(branch){ return ((salesCfg(branch).compliance||{}).shifts) || {}; }
function brandOf(branch){ return GLOW.includes(branch) ? 'glow' : 'echarpe'; }
function branches(){ return [...new Set(D.employees.map(e=>e.branch).concat(D.sales.map(s=>s.branch)).filter(b=> b && b !== 'الإدارة'))].sort(); }
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
  // 💼 المرتبات والفلوس — نافذة 75 يوم (شهر حالي + سابق + دورة القبض)
  watch('sales_advances', 'ts', Date.now() - 75*DAY, 'advances');
  watch('sales_deductions', 'ts', Date.now() - 75*DAY, 'deductions');
  watch('sales_salary_payments', 'paidAt', Date.now() - 75*DAY, 'salaryPays');
  watch('sales_commission_payments', 'paidAt', Date.now() - 75*DAY, 'commPays');
  watch('office_expenses', 'ts', Date.now() - 75*DAY, 'expenses');
  db.collection('pos_test_settings').doc('advances_cfg').get().then(d=>{ D.advCfg = d.exists ? (d.data()||{}) : {}; render(); }).catch(()=>{});
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
// 💳 ملخص طرق الدفع ليوم: المبلغ · عدد الفواتير · النسبة · المرتجع
function paymentSummaryHtml(list){
  const ok = list.filter(s=> !s.reversed && !s.isReversal); const pos = ok.filter(s=> Number(s.total) >= 0); const ret = ok.filter(s=> Number(s.total) < 0);
  const agg = {}; pos.forEach(s=>{ Object.entries(s.payments||{}).forEach(([k,v])=>{ if(!(Number(v)>0)) return; agg[k] = agg[k] || { amt:0, n:0 }; agg[k].amt += Number(v); agg[k].n++; }); });
  const gross = Object.values(agg).reduce((n,x)=> n + x.amt, 0); const retSum = ret.reduce((n,s)=> n + (Number(s.total)||0), 0);
  const order = ['cash','visa','instapay','wallet','credit','points'];
  const rows = Object.entries(agg).sort((a,b)=> (order.indexOf(a[0])+1||99) - (order.indexOf(b[0])+1||99)).map(([k,x])=>{ const pct = gross ? Math.round(x.amt/gross*100) : 0; return `<div class="row" style="cursor:default"><div class="n"><b>${esc(PAY_AR[k]||k)}</b><small>${x.n} فاتورة · ${pct}%</small></div><div class="bar" style="width:34%;height:7px;margin-inline-end:8px"><i style="width:${pct}%"></i></div><b class="money">${n0(x.amt)}</b></div>`; }).join('');
  return `<div class="card"><h3>💳 طرق الدفع <small>${pos.length} فاتورة${ret.length?' · '+ret.length+' مرتجع':''}</small></h3>${rows || '<div class="empty">مفيش مبيعات</div>'}${ret.length?`<div class="row" style="cursor:default"><div class="n"><b>↩️ مرتجعات</b><small>${ret.length} فاتورة</small></div><b class="money dn">${n0(retSum)}</b></div>`:''}<div class="row" style="cursor:default;border-top:2px solid var(--ink)"><div class="n"><b>الصافي</b></div><b class="money" style="font-size:17px">${n0(gross + retSum)}</b></div></div>`;
}
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
function go(name, arg){ screenName = name; screenArg = arg || null; window.scrollTo(0,0); document.querySelectorAll('#tabbar button').forEach(b=> b.classList.toggle('on', b.dataset.s === (name==='emp' ? 'staff' : (name==='branch' ? 'today' : (name==='activity' ? 'more' : name))))); render(); }
function head(t, sub){ document.getElementById('hTitle').innerHTML = t; document.getElementById('hSub').textContent = sub || ''; }
function render(){
  if(!booted) return;
  const el = document.getElementById('screen'); if(!el) return;
  try{
    const fn = { today: rToday, staff: rStaff, emp: rEmp, inbox: rInbox, money: rMoney, more: rMore, branch: rBranch, activity: rActivity }[screenName] || rToday;
    el.innerHTML = fn();
  }catch(e){ console.error(e); el.innerHTML = '<div class="card"><b>حصل خطأ في العرض</b><div class="hint">' + esc(e.message) + '</div></div>'; }
  const n = inboxItems().length; const b = document.getElementById('inboxN'); b.style.display = n ? '' : 'none'; b.textContent = n;
}

/* ---------- ١) اليوم ---------- */
function lateList(){
  const now = Date.now(); const out = [];
  activeEmps().forEach(e=>{ const al = TimeBank.lateAlerts(D.shifts.filter(x=> x.employeeId===e.id), timeCfg(e.branch), now); if(al.length) out.push({ e, count: al[0].count, avgMin: al[0].avgMin }); });
  return out.sort((x,y)=> y.count - x.count || y.avgMin - x.avgMin);
}
function alerts(){
  const out = []; const now = Date.now();
  const late = lateList();
  if(late.length === 1) out.push({ k:'bad', t:`⏰ <b>${esc(late[0].e.name)}</b> اتأخرت ${late[0].count} مرات في 14 يوم (متوسط ${late[0].avgMin} د)`, go:()=>go('emp', late[0].e.id) });
  else if(late.length) out.push({ k:'bad', t:`⏰ <b>${late.length} موظفين</b> بيتأخروا كتير في آخر 14 يوم`, go: lateSheet });
  const forgot = D.shifts.filter(x=> x.bankAutoEnd && x.bankAutoAt > now - 2*DAY);
  if(forgot.length === 1){ const e = empById(forgot[0].employeeId)||{}; out.push({ k:'w', t:`🕐 شيفت <b>${esc(e.name)}</b> اتقفل تلقائي على ${hm(forgot[0].clockOutTs)} — نسيت الانصراف`, go:()=>go('emp', e.id) }); }
  else if(forgot.length) out.push({ k:'w', t:`🕐 <b>${forgot.length} شيفتات</b> اتقفلت تلقائي (نسيان انصراف) في آخر يومين`, go:()=>{ inboxTab='auto'; go('inbox'); } });
  const n = inboxItems().length; if(n) out.push({ k:'i', t:`📩 ${n} حاجة مستنية قرارك`, go:()=>go('inbox') });
  return out;
}
function lateSheet(){
  const late = lateList();
  sheet(`<h2>⏰ التأخير المتكرر · آخر 14 يوم</h2>${late.map(x=>`<div class="row" onclick="O2.closeSheet();O2.go('emp','${x.e.id}')"><div class="n"><b>${esc(x.e.name)}</b><small>${esc(String(x.e.branch||'').replace('echarpe ',''))}</small></div><span class="pill p-bad">${x.count} مرات · متوسط ${x.avgMin} د</span></div>`).join('')}`);
}
function rToday(){
  const now = Date.now(); head('اليوم · ' + dayName(now) + ' ' + caiParts(now).d, 'كل الفروع');
  const al = alerts().map((a,i)=>`<div class="alert ${a.k}" onclick="O2.alert(${i})">${a.t}<span class="go">افتح ›</span></div>`).join('');
  window._alerts = alerts();
  const t0 = caiDayStart(now), y0 = t0 - DAY;
  const kp = branches().map(b=>{ const t = sumTotal(todaySales(b, t0)); const ySame = sumTotal(todaySales(b, y0).filter(x=> saleMs(x) <= now - DAY)); const d = ySame>0 ? Math.round((t-ySame)/ySame*100) : 0; return `<div class="kpi" onclick="O2.go('branch','${esc(b)}')"><small>${esc(b.replace('echarpe ',''))}</small><b>${n0(t)}</b><span class="d ${d>=0?'up':'dn'}">${ySame>0?(d>=0?'▲':'▼')+' '+Math.abs(d)+'% عن امبارح نفس الوقت':'—'}</span></div>`; }).join('');
  const emps = activeEmps().filter(e=>!isSetup(e)); const present = emps.filter(e=> openShift(e.id));
  const rows = emps.sort((a,b)=> (openShift(b.id)?1:0) - (openShift(a.id)?1:0) || String(a.branch).localeCompare(String(b.branch))).map(e=>{
    const s = openShift(e.id); const brk = s && onBreak(e.id); const bm = bankMonth(e);
    const st = s ? (brk ? `بريك من ${hm(brk.startTs)}` : (Number(s.lateMinutes)>TimeBank.cfgOf(timeCfg(e.branch)).bankGraceMin ? `من ${hm(s.clockInTs)} · متأخرة ${s.lateMinutes} د` : `من ${hm(s.clockInTs)} · في الميعاد`)) : (todayShift(e) ? `مشيت ${hm(todayShift(e).clockOutTs)}` : 'مش موجودة');
    const pill = bm.balanceMin ? `<span class="pill ${bm.balanceMin<0?'p-bad':'p-good'}">${TimeBank.fmtMin(bm.balanceMin)}</span>` : '<span class="pill p-gray">0</span>';
    return `<div class="row" onclick="O2.go('emp','${e.id}')"><span class="sdot ${s?(brk?'brk':''):'off'}"></span><div class="n"><b>${esc(e.name)} · ${esc(String(e.branch||'').replace('echarpe ',''))}</b><small>${st} · ${pointsIn(e.id, t0, now)} نقطة النهاردة</small></div>${pill}</div>`;
  }).join('');
  return `<div class="full">${al}</div>
    <div class="card"><h3>💰 مبيعات النهاردة · <span class="money">${n0(branches().reduce((n,b)=> n + sumTotal(todaySales(b, t0)), 0))}</span> <small>لحد ${hm(now)} · اضغط الفرع للتفاصيل</small></h3><div class="kpis">${kp || '<div class="empty">—</div>'}</div></div>
    <div class="card"><h3>👥 مين موجود دلوقتي <small>${present.length} من ${emps.length}</small></h3>${rows || '<div class="empty">لسه مفيش موظفين</div>'}</div>`;
}
function todayShift(e){ const t0 = caiDayStart(Date.now()); return D.shifts.find(s=> s.employeeId===e.id && s.clockInTs >= t0 && s.clockOutTs); }

/* ---------- ١ب) صفحة الفرع — مبيعات أي يوم · السجل · الأكثر مبيعًا ---------- */
let branchDay = null; const dayCache = {};
async function loadDay(dayKey){
  if(dayCache[dayKey] && dayCache[dayKey].done) return dayCache[dayKey].rows;
  const a = dayKey.split('-').map(Number); const from = caiStamp(a[0],a[1],a[2],0,0), to = from + DAY - 1;
  dayCache[dayKey] = dayCache[dayKey] || { rows:[], done:false, loading:true };
  try{
    const [s1, s2] = await Promise.all([
      db.collection('pos_test_sales').where('createdAtMs','>=',from).where('createdAtMs','<=',to).get(),
      db.collection('pos_test_sales').where('createdAt','>=',firebase.firestore.Timestamp.fromMillis(from)).where('createdAt','<=',firebase.firestore.Timestamp.fromMillis(to)).get() ]);
    const m = {}; s1.forEach(d=>{ m[d.id] = Object.assign({ id:d.id }, d.data()); }); s2.forEach(d=>{ m[d.id] = Object.assign({ id:d.id }, d.data()); });
    dayCache[dayKey] = { rows: Object.values(m), done: dayKey !== caiKey(Date.now()), loading:false };   // النهاردة بيتحمّل تاني كل مرة
  }catch(e){ dayCache[dayKey] = { rows:[], done:false, loading:false, err: e && e.code }; }
  return dayCache[dayKey].rows;
}
function daySales(branch, dayKey){
  const today = caiKey(Date.now());
  if(dayKey === today) return D.sales.filter(s=> s.branch===branch && saleMs(s) >= caiDayStart(Date.now()));
  const c = dayCache[dayKey]; if(!c || c.loading){ loadDay(dayKey).then(render); return null; }
  return c.rows.filter(s=> s.branch===branch);
}
function topItems(list){
  const agg = {};
  list.forEach(s=>{ if(s.reversed || s.isReversal) return; (s.items||[]).forEach(it=>{ if(!it || it.isRedemption || it.isRewardDiscount) return; const k = String(it.barcode||it.name||''); if(!k) return; agg[k] = agg[k] || { name: it.name||k, barcode: it.barcode||'', pieces:0, revenue:0 }; const q = Number(it.qty)||0, sign = it.isReturn ? -1 : 1; agg[k].pieces += sign*q; agg[k].revenue += sign*q*(Number(it.price)||0); }); });
  return Object.values(agg).filter(x=> x.pieces !== 0).sort((a,b)=> b.pieces - a.pieces);
}
function rBranch(){
  const b = screenArg; const dayKey = branchDay || caiKey(Date.now()); branchDay = dayKey;
  head(`<button class="back" onclick="O2.go('today')">‹</button> ${esc(b)}`, 'مبيعات أي يوم · السجل · الأكثر مبيعًا');
  const list = daySales(b, dayKey);
  const a = dayKey.split('-').map(Number); const dayMs = caiStamp(a[0],a[1],a[2],12,0);
  const nav = `<div class="card full" style="display:flex;align-items:center;gap:8px"><button class="back" onclick="O2.day(-1)">‹</button><input type="date" value="${dayKey}" max="${caiKey(Date.now())}" onchange="O2.dayPick(this.value)" style="flex:1;padding:9px;border:1px solid var(--line);border-radius:10px;font-family:inherit;font-weight:800;text-align:center"><button class="back" onclick="O2.day(1)" ${dayKey>=caiKey(Date.now())?'disabled':''}>›</button><span class="tag">${dayName(dayMs)}</span></div>`;
  if(list === null) return nav + '<div class="card"><div class="skel"></div><div class="skel" style="width:60%;margin-top:8px"></div></div>';
  const ok = list.filter(s=> !s.reversed && !s.isReversal); const ret = list.filter(s=> Number(s.total) < 0); const pb = payBreak(ok);
  const pieces = ok.reduce((n,s)=> n + (s.items||[]).reduce((m,it)=> m + (it && !it.isRedemption ? (it.isReturn?-1:1)*(Number(it.qty)||0) : 0), 0), 0);
  const kpis = `<div class="card"><h3>💰 ${dayKey===caiKey(Date.now())?'النهاردة':'اليوم ده'} <small>${ok.length} فاتورة${ret.length?' · '+ret.length+' مرتجع':''}</small></h3><div class="kpis"><div class="kpi"><small>المبيعات</small><b>${n0(sumTotal(ok))}</b></div><div class="kpi"><small>القطع</small><b>${n0(pieces)}</b></div><div class="kpi"><small>متوسط الفاتورة</small><b>${ok.length?n0(sumTotal(ok)/ok.length):'—'}</b></div></div></div>` + paymentSummaryHtml(list);
  const top = topItems(ok).slice(0, 12).map((x,i)=>`<div class="row" style="cursor:default"><div class="n"><b>${i+1}. ${esc(x.name)}</b><small>${esc(x.barcode)}</small></div><span class="pill p-acc">${x.pieces} قطعة</span><b class="money">${n0(x.revenue)}</b></div>`).join('');
  const bySeller = {}; ok.forEach(s=>{ const k = s.employee || s.seller || '—'; bySeller[k] = bySeller[k] || { n:0, t:0 }; bySeller[k].n++; bySeller[k].t += Number(s.total)||0; });
  const sellers = Object.entries(bySeller).sort((x,y)=> y[1].t - x[1].t).map(([k,v])=>`<div class="row" style="cursor:default"><div class="n"><b>${esc(k)}</b><small>${v.n} فاتورة</small></div><b class="money">${n0(v.t)}</b></div>`).join('');
  const log = list.slice().sort((x,y)=> saleMs(y) - saleMs(x)).map(s=>{ const pm = Object.entries(s.payments||{}).filter(([k,v])=>v).map(([k])=> PAY_AR[k]||k).join('+'); const cnt = (s.items||[]).filter(it=> it && !it.isRedemption).reduce((m,it)=> m + (Number(it.qty)||0), 0); return `<div class="row" onclick="O2.invoice('${dayKey}','${s.id}')"><div class="n"><b>#${esc(s.invoiceNo||'')} · ${hm(saleMs(s))}${s.reversed?' <span class="pill p-gray">معكوسة</span>':''}${Number(s.total)<0?' <span class="pill p-bad">مرتجع</span>':''}</b><small>${esc(s.employee||s.seller||'')}${s.customerName?' · '+esc(s.customerName):''} · ${cnt} قطعة · ${esc(pm)}</small></div><b class="money ${Number(s.total)<0?'dn':''}">${n0(s.total)}</b></div>`; }).join('');
  return nav + kpis + `<div class="card"><h3>🏆 الأكثر مبيعًا <small>بالقطع</small></h3>${top || '<div class="empty">مفيش مبيعات</div>'}</div><div class="card"><h3>👩‍💼 البياعات</h3>${sellers || '<div class="empty">—</div>'}</div><div class="card full"><h3>🧾 سجل الفواتير <small>اضغط الفاتورة للأصناف</small></h3>${log || '<div class="empty">مفيش فواتير اليوم ده</div>'}</div>`;
}
function invoiceSheet(dayKey, id){
  const src = dayKey === caiKey(Date.now()) ? D.sales : ((dayCache[dayKey]||{}).rows||[]); const s = src.find(x=> x.id===id); if(!s) return;
  const items = (s.items||[]).map(it=>`<div class="row" style="cursor:default"><div class="n"><b>${esc(it.name||it.barcode||'')}${it.isReturn?' <span class="pill p-bad">مرتجع</span>':''}${it.isRedemption?' <span class="pill p-gray">استبدال نقط</span>':''}</b><small>${esc(it.barcode||'')}${it.attribute?' · '+esc(it.attribute):''}${it.size?' · '+esc(it.size):''}</small></div><span class="pill p-acc">×${it.qty||1}</span><b class="money">${n0((Number(it.price)||0)*(Number(it.qty)||1))}</b></div>`).join('');
  sheet(`<h2>🧾 فاتورة #${esc(s.invoiceNo||'')}</h2><div class="hint">${esc(s.branch||'')} · ${dayName(saleMs(s))} ${caiKey(saleMs(s))} ${hm(saleMs(s))} · ${esc(s.employee||s.seller||'')}${s.customerName?' · '+esc(s.customerName):''}${s.customerPhone?' · '+esc(s.customerPhone):''}</div>${items}<div class="row" style="cursor:default;border-top:2px solid var(--ink)"><div class="n"><b>الإجمالي</b><small>${Object.entries(s.payments||{}).filter(([k,v])=>v).map(([k,v])=> (PAY_AR[k]||k)+' '+n0(v)).join(' · ')}</small></div><b class="money" style="font-size:18px">${n0(s.total)}</b></div>`);
}

/* ---------- ٢) الموظفين ---------- */
let staffQ = '', staffBranch = '';
function rStaff(){
  head('الموظفين', activeEmps().length + ' موظف · ' + branches().length + ' فروع');
  const range = caiMonthRange(Date.now()); const w = TimeBank.currentWeek(Date.now());
  const q = staffQ.trim().toLowerCase();
  const tools = `<div class="card full" style="display:flex;gap:6px;align-items:center"><input value="${esc(staffQ)}" placeholder="🔍 ابحث بالاسم" oninput="O2.staffQ(this.value)" style="flex:1;padding:9px;border:1px solid var(--line);border-radius:10px;font-family:inherit"><select onchange="O2.staffBranch(this.value)" style="padding:9px;border:1px solid var(--line);border-radius:10px;font-family:inherit;font-weight:800"><option value="">كل الفروع</option>${branches().map(b=>`<option value="${esc(b)}" ${staffBranch===b?'selected':''}>${esc(b.replace('echarpe ',''))}</option>`).join('')}</select></div>`;
  if(!D.employees.length) return tools + '<div class="card"><div class="skel"></div><div class="skel" style="width:70%;margin-top:8px"></div></div>';
  return tools + branches().filter(b=> !staffBranch || b===staffBranch).map(b=>{
    const list = activeEmps().filter(e=> e.branch===b && (!q || String(e.name||'').toLowerCase().includes(q))).map(e=>{
      const s = openShift(e.id); const bm = bankMonth(e, range); const wb = isSetup(e) ? null : weekBonus(e, w); const r = ratingIn(e, range.start, range.end);
      return `<div class="row" onclick="O2.go('emp','${e.id}')"><span class="sdot ${s?'':'off'}"></span><div class="n"><b>${esc(e.name)}</b><small>${esc(SHIFT_AR[e.shift]||e.shift||'')} ${startEndHM(e).s?startEndHM(e).s+'–'+startEndHM(e).e:''} · ${bm.lateCount} تأخير · ${r.avg!=null?'⭐ '+r.avg.toFixed(1):'بدون تقييم'} · ${pointsIn(e.id, range.start, range.end)} نقطة</small></div>${wb?`<span class="pill ${wb.score>=TimeBank.cfgOf(timeCfg(e.branch)).bonusMinScore?'p-good':'p-warn'}">${wb.score}/100</span>`:''}<span class="pill ${bm.balanceMin<0?'p-bad':(bm.balanceMin>0?'p-good':'p-gray')}">${TimeBank.fmtMin(bm.balanceMin)}</span></div>`;
    }).join('');
    if(!list) return '';
    return `<div class="card"><h3>📍 ${esc(b)} <small>${activeEmps().filter(e=>e.branch===b).length}</small></h3>${list}</div>`;
  }).join('') || '<div class="empty">مفيش نتائج</div>';
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
    <div class="card full"><div class="btns">${openShift(e.id)?`<button class="btn" onclick="O2.closeOpen('${e.id}')">🕐 اقفل الشيفت المفتوح</button>`:''}<button class="btn" onclick="O2.addAdvance('${e.id}')">➕ سلفة</button><button class="btn" onclick="O2.addDeduction('${e.id}')">➖ خصم</button><button class="btn p" onclick="O2.moneyTab('pay');O2.go('money');setTimeout(function(){O2.paySheet('${e.id}')},50)">💰 المرتب</button></div></div>`;
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
  async order(id, ok){
    const o = D.staffOrders.find(x=> x.id===id); if(!o) return;
    // نفس منطق sales بالظبط: الاعتماد بسلفة لو من المرتب · الرفض بيسجّل الفرق (السعر الكامل أو الخصم) — معاملة ذرية
    const adv = ok ? (o.payMethod==='salary' ? (Number(o.total)||0) : 0) : (o.payMethod==='salary' ? (Number(o.fullTotal)||0) : (Number(o.discountAmount)||0));
    const note = ok ? '' : (prompt('سبب الرفض (اختياري):') || '');
    if(!confirm((ok ? 'اعتماد' : 'رفض') + ' أوردر ' + o.employeeName + '؟' + (adv ? '\nهتتسجل سلفة ' + n0(adv) + ' ج' : ''))) return;
    try{ await db.runTransaction(async tx=>{ const ref = db.collection('sales_staff_orders').doc(id); const snap = await tx.get(ref); if(!snap.exists) throw new Error('مش موجود'); if((snap.data().status||'pending') !== 'pending') throw new Error('اتقرر من جهاز تاني');
      if(adv > 0) tx.set(db.collection('sales_advances').doc(), { employeeId:o.employeeId, employeeName:o.employeeName, branch:o.branch, amount:adv, date: caiKey(Date.now()), ts: Date.now(), source: ok ? 'staff_order' : 'staff_order_reject', invoiceNo:o.invoiceNo||'', note });
      tx.update(ref, ok ? { status:'approved', decidedAt: Date.now() } : { status:'rejected', decidedAt: Date.now(), note }); }); toast(ok ? 'اتعتمد ✅' : 'اترفض'); }catch(e){ toast('تعذر: ' + (e && (e.message||e.code))); }
  },
  staffQ(v){ staffQ = v; const el = document.activeElement; render(); try{ const i = document.querySelector('#screen input[placeholder^="🔍"]'); if(i && el && el.tagName==='INPUT'){ i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }catch(e){} }, staffBranch(v){ staffBranch = v; render(); },
  actFilter(g){ actFilter = g; render(); }, actMore(){ actDays += 7; loadActivity(actDays); },
  inboxTab(t){ inboxTab = t; render(); }, moneyTab(t){ moneyTab = t; render(); }, payMonth(d){ payOffset += d; render(); },
  paySheet, paySalary, payComm, addAdvance, addDeduction, addExpense, invoice: invoiceSheet,
  day(d){ const a = branchDay.split('-').map(Number); branchDay = caiKey(caiStamp(a[0],a[1],a[2],12,0) + d*DAY); if(branchDay > caiKey(Date.now())) branchDay = caiKey(Date.now()); render(); }, dayPick(v){ if(v) { branchDay = v; render(); } },
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
    if(it.kind==='order'){ const o = it.o; const adv = o.payMethod==='salary' ? (Number(o.total)||0) : 0; return `<div class="card"><div class="row first"><div class="n"><b>🛍️ أوردر موظفة · ${esc(o.employeeName)}</b><small>${n0(o.total||o.amount)} ج · ${esc(o.payMethod==='salary'?'من المرتب (هتتسجل سلفة '+n0(adv)+')':'كاش')} · فاتورة ${esc(o.invoiceNo||'')}${o.discountAmount?' · خصم موظفين '+n0(o.discountAmount):''}</small></div></div><div class="btns"><button class="btn g" onclick="O2.order('${o.id}',true)">✅ اعتمد</button><button class="btn r" onclick="O2.order('${o.id}',false)">✖ رفض</button></div></div>`; }
    return '';
  }).join('');
  return seg + (cards || '<div class="empty">مفيش حاجة مستنية قرارك 🎉</div>');
}
function leaveIcon(t){ return { dayoff:'🏖️', changeDayoff:'🔁', shiftSwap:'🔄' }[t] || '📩'; }
function leaveLabel(l){ return { dayoff:'إجازة', changeDayoff:'تغيير يوم الإجازة', shiftSwap:'تبديل شيفت ' + (l.fromShift||'') + ' ← ' + (l.toShift||'') }[l.type] || l.type; }
function dateKeyMs(k){ const a = String(k||'').split('-').map(Number); return a.length===3 ? caiStamp(a[0],a[1],a[2],12,0) : Date.now(); }

/* ---------- ٤) الفلوس ---------- */
let moneyTab = 'today', payOffset = 0;
function payDay(){ return Number(D.advCfg.closeDay) > 0 ? Number(D.advCfg.closeDay) : 6; }
function payPeriod(){ const d = new Date(); d.setMonth(d.getMonth() + payOffset); return O2Pay.monthDateRange(d); }
function salaryOf(e, r){
  return O2Pay.compute(e, r.start, r.end, { shifts: D.shifts, timeCredit: D.credits, deductions: D.deductions.filter(d=>!d.deleted), advances: D.advances, leaves: D.leaves, timeCfg: timeCfg(e.branch), shiftDefs: shiftDefs(e.branch), payDay: payDay() });
}
function bonusesOf(e, r){ return isSetup(e) ? 0 : monthBonuses(e, { start: r.start.getTime(), end: r.end.getTime() }).reduce((n,x)=> n + x.paid, 0); }
function commOf(e, r){ const label = O2Pay.monthLabel(r.start); const rate = Number(salesCfg(e.branch).commissionPerPoint) || 0; return Object.assign({ label, rate }, O2Pay.commission(D.points, D.commPays, e.id, r.start.getTime(), r.end.getTime(), label, rate)); }
function paidOf(e, label){ return D.salaryPays.find(p=> p.employeeId===e.id && p.periodLabel===label); }
function rMoney(){
  head('الفلوس', 'المبيعات · المصاريف · المرتبات');
  const now = Date.now(); const t0 = caiDayStart(now), y0 = t0 - DAY;
  const seg = `<div class="seg full"><button class="${moneyTab==='today'?'on':''}" onclick="O2.moneyTab('today')">اليوم</button><button class="${moneyTab==='pay'?'on':''}" onclick="O2.moneyTab('pay')">المرتبات</button><button class="${moneyTab==='exp'?'on':''}" onclick="O2.moneyTab('exp')">المصاريف</button></div>`;
  if(moneyTab==='pay'){
    const r = payPeriod(); const label = O2Pay.monthLabel(r.start); const mLabel = new Intl.DateTimeFormat('ar-EG', { month:'long', year:'numeric' }).format(r.start);
    let total = 0, paidN = 0;
    const rows = activeEmps().filter(e=> Number(e.baseSalary)>0).map(e=>{ const c = salaryOf(e, r); const bon = bonusesOf(e, r); const net = Math.round((c.netSalary + bon)*100)/100; const cm = commOf(e, r); const paid = paidOf(e, label); total += net; if(paid) paidN++;
      return `<div class="row" onclick="O2.paySheet('${e.id}')"><div class="n"><b>${esc(e.name)} ${paid?'<span class="pill p-good">اتصرف</span>':''}</b><small>أساسي ${n0(c.proratedBase)}${c.timeCreditDeduction?' · وقت −'+n0(c.timeCreditDeduction):''}${c.deductionAmount?' · غياب −'+n0(c.deductionAmount):''}${c.overtimePay?' · أوفرتايم +'+n0(c.overtimePay):''}${bon?' · حوافز +'+n0(bon):''}${c.advancesTotal?' · سلف −'+n0(c.advancesTotal):''}${c.adminDeductions?' · خصومات −'+n0(c.adminDeductions):''}${cm.newAmount?' · عمولة '+n0(cm.newAmount):''}</small></div><b class="money">${n0(net)}</b></div>`; }).join('');
    return seg + `<div class="card"><h3><span><button class="back" onclick="O2.payMonth(-1)">‹</button> ${mLabel} <button class="back" onclick="O2.payMonth(1)">›</button></span><small>${paidN} اتصرف · إجمالي ${n0(total)} ج</small></h3>${rows || '<div class="empty">مفيش موظفين بمرتب</div>'}<div class="hint">نفس محرك sales وOffice بالظبط (الغياب · رصيد الوقت · الأوفرتايم · الحوافز · السلف · الخصومات) — اضغط الموظف للتفاصيل والصرف</div></div>`;
  }
  if(moneyTab==='exp'){
    const r = caiMonthRange(now); const list = D.expenses.filter(x=> x.ts >= r.start && x.ts <= r.end).sort((a,b)=> b.ts-a.ts);
    const rows = list.map(x=>`<div class="row"><div class="n"><b>${esc(x.note||'مصروف')}</b><small>${esc(String(x.branch||'عام').replace('echarpe ',''))} · ${dayName(x.ts)} ${caiParts(x.ts).d} · ${hm(x.ts)}</small></div><b class="money">${n0(x.amount)}</b></div>`).join('');
    return seg + `<div class="card"><h3>🧾 مصاريف الشهر <small>${n0(list.reduce((n,x)=>n+(Number(x.amount)||0),0))} ج</small></h3><div class="btns" style="margin:0 0 8px"><button class="btn p" onclick="O2.addExpense()">➕ مصروف جديد</button></div>${rows || '<div class="empty">مفيش مصاريف الشهر ده</div>'}</div>`;
  }
  const allToday = branches().reduce((arr,b)=> arr.concat(todaySales(b, t0)), []);
  const summary = `<div class="card"><h3>📊 كل الفروع النهاردة <small>${n0(sumTotal(allToday.filter(s=>!s.reversed&&!s.isReversal)))} ج</small></h3><div class="hint">اضغط أي فرع تحت لتفاصيل يومه وأي يوم تاني</div></div>` + paymentSummaryHtml(allToday);
  const cards = branches().map(b=>{ const t = todaySales(b, t0); const y = todaySales(b, y0); const pb = payBreak(t);
    const exp = D.expenses.filter(x=> x.branch===b && x.ts >= t0).reduce((n,x)=> n + (Number(x.amount)||0), 0);
    const adv = D.advances.filter(x=> x.branch===b && x.ts >= t0 && String(x.source||'').indexOf('staff_order')!==0).reduce((n,x)=> n + (Number(x.amount)||0), 0);
    const cash = Number(pb.cash)||0; const drawer = cash - exp - adv;
    const parts = Object.entries(pb).filter(([k,v])=> v).map(([k,v])=> (PAY_AR[k]||k)+' '+n0(v)).join(' · ');
    return `<div class="card" onclick="O2.go('branch','${esc(b)}')" style="cursor:pointer"><h3>📍 ${esc(b)} <small>${t.length} فاتورة · افتح ›</small></h3><div class="grid2"><div class="kpi"><small>النهاردة</small><b>${n0(sumTotal(t))}</b></div><div class="kpi"><small>امبارح كله</small><b>${n0(sumTotal(y))}</b></div></div><div class="hint">${parts || '—'}</div>
      <div class="hint">💵 الكاش المتوقع في الدرج: <b class="money">${n0(drawer)}</b> = كاش ${n0(cash)}${exp?' − مصاريف '+n0(exp):''}${adv?' − سلف '+n0(adv):''}</div></div>`; }).join('');
  return seg + summary + cards;
}
function paySheet(empId){
  const e = empById(empId); if(!e) return; const r = payPeriod(); const label = O2Pay.monthLabel(r.start); const c = salaryOf(e, r); const bon = bonusesOf(e, r); const cm = commOf(e, r); const paid = paidOf(e, label); const net = Math.round((c.netSalary + bon)*100)/100;
  const row = (l, v, cls)=>`<div class="row" style="cursor:default"><div class="n"><small style="font-size:12.5px;color:var(--ink)">${l}</small></div><b class="money ${cls||''}">${v}</b></div>`;
  const bankLine = c.bank ? `رصيد الوقت ${TimeBank.fmtMin(c.bank.balanceMin)} · ${c.bank.lateCount} تأخير${c.bank.otherDays?' · '+c.timeCreditDays+' يوم بريك/تبديل':''}` : `رصيد وقت ${c.timeCreditHours} س = ${c.timeCreditDays} يوم`;
  sheet(`<h2>💼 ${esc(e.name)} · ${esc(label)}</h2><div class="hint">${esc(e.branch||'')} · أساسي ${n0(e.baseSalary)} · أيام العمل ${c.elapsedWorkDays} · حضور ${c.attendedDays}${c.incompleteShifts&&c.incompleteShifts.length?' · ⚠️ '+c.incompleteShifts.length+' شيفت مفتوح':''}</div>
    ${row('الأساسي للفترة', n0(c.proratedBase))}
    ${c.overtimePay?row('أوفرتايم '+TimeBank.fmtMin(c.overtimeMinutes), '+'+n0(c.overtimePay), 'up'):''}
    ${c.dayOffBonusAmount?row('شغل يوم الإجازة', '+'+n0(c.dayOffBonusAmount), 'up'):''}
    ${bon?row('حوافز أسبوعية معتمدة', '+'+n0(bon), 'up'):''}
    ${c.deductionAmount?row('غياب '+c.extraOffDays+' يوم'+(c.absenceDates&&c.absenceDates.length?' ('+c.absenceDates.map(x=>x.date||x).join('، ')+')':''), '−'+n0(c.deductionAmount), 'dn'):''}
    ${c.timeCreditDeduction?row(bankLine, '−'+n0(c.timeCreditDeduction), 'dn'):row(bankLine, '0')}
    ${c.adminDeductions?row('خصومات إدارية', '−'+n0(c.adminDeductions), 'dn'):''}
    ${c.advancesTotal?row('سلف'+(c.advOrders?' (كاش '+n0(c.advCash)+' · مشتريات '+n0(c.advOrders)+')':''), '−'+n0(c.advancesTotal), 'dn'):''}
    <div class="row" style="cursor:default;border-top:2px solid var(--ink)"><div class="n"><b>صافي المرتب</b></div><b class="money" style="font-size:20px">${n0(net)}</b></div>
    ${cm.rate?row('⭐ عمولة الشهر · '+cm.pointsMonth+' نقطة × '+cm.rate+(cm.pointsAlreadyPaid?' (اتدفع '+cm.pointsAlreadyPaid+')':''), (cm.newAmount?'+':'')+n0(cm.newAmount), 'up'):'<div class="hint">⚠️ سعر النقطة مش متظبط للفرع (من sales → الإعدادات)</div>'}
    <div class="btns">${paid?`<span class="pill p-good">✅ اتصرف ${n0(paid.amount)} ج · ${caiKey(paid.paidAt)}</span>`:`<button class="btn g" onclick="O2.paySalary('${e.id}',${net})">💵 صرف المرتب ${n0(net)}</button>`}
      ${cm.newAmount>0?`<button class="btn p" onclick="O2.payComm('${e.id}',${cm.newPoints},${cm.newAmount},'${label}')">⭐ ادفع العمولة ${n0(cm.newAmount)}</button>`:''}
      <button class="btn" onclick="O2.addAdvance('${e.id}')">➕ سلفة</button><button class="btn" onclick="O2.addDeduction('${e.id}')">➖ خصم</button><button class="btn" onclick="O2.go('emp','${e.id}');O2.closeSheet()">👤 الملف</button></div>`);
}
async function paySalary(empId, amount){
  const e = empById(empId); if(!e) return; const r = payPeriod(); const label = O2Pay.monthLabel(r.start);
  if(new Date() < r.end && !confirm('الشهر لسه مخلصش — تصرف دلوقتي؟')) return;
  if(!confirm('تأكيد صرف ' + n0(amount) + ' ج لـ ' + e.name + ' عن ' + label + '؟')) return;
  const ref = db.collection('sales_salary_payments').doc(String(e.id).replace(/[^A-Za-z0-9_-]/g,'_') + '_' + label.replace(/[^A-Za-z0-9_-]/g,'_'));
  try{ await db.runTransaction(async tx=>{ const s = await tx.get(ref); if(s.exists) throw new Error('__PAID__'); tx.set(ref, { employeeId:e.id, employeeName:e.name, branch:e.branch, periodLabel:label, amount, paidAt: Date.now(), paidFrom:'office2' }); }); toast('اتصرف ✅'); closeSheet(); }
  catch(err){ toast(err && err.message==='__PAID__' ? 'اتصرف قبل كده — مش هيتسجل مرتين' : 'تعذر: ' + (err && err.code)); }
}
async function payComm(empId, pts, amount, label){ const e = empById(empId); if(!e) return; if(!confirm('دفع ' + n0(amount) + ' ج عمولة لـ ' + e.name + ' عن ' + pts + ' نقطة (' + label + ')؟')) return; try{ await db.collection('sales_commission_payments').add({ employeeId:e.id, employeeName:e.name, branch:e.branch, monthLabel:label, pointsCount:pts, commissionAmount:amount, paidAt: Date.now(), paidFrom:'office2' }); toast('اتدفعت ✅'); closeSheet(); }catch(err){ toast('تعذر: ' + (err && err.code)); } }
function addAdvance(empId){ const e = empById(empId); if(!e) return; const v = prompt('مبلغ السلفة لـ ' + e.name + ':'); if(v===null) return; const amount = Math.round((Number(v)||0)*100)/100; if(!(amount>0)){ toast('مبلغ مش صح'); return; } const reason = prompt('السبب:') || ''; if(!reason){ toast('لازم سبب'); return; }
  db.collection('sales_advances').add({ employeeId:e.id, employeeName:e.name, branch:e.branch, amount, date: caiKey(Date.now()), ts: Date.now(), reason, manual:true, source:'owner_manual' }).then(()=>{ toast('اتسجلت السلفة ✅'); closeSheet(); }).catch(err=> toast('تعذر: ' + (err && err.code))); }
function addDeduction(empId){ const e = empById(empId); if(!e) return; const v = prompt('مبلغ الخصم بالجنيه لـ ' + e.name + ':'); if(v===null) return; const amount = Math.round((Number(v)||0)*100)/100; if(!(amount>0)){ toast('مبلغ مش صح'); return; } const reason = prompt('السبب (بيظهر في كشف المرتب):') || ''; if(!reason){ toast('لازم سبب'); return; }
  db.collection('sales_deductions').add({ employeeId:e.id, employeeName:e.name, branch:e.branch, type:'manual_money', mode:'money', amount, date: caiKey(Date.now()), ts: Date.now(), reason, manual:true, source:'owner_manual' }).then(()=>{ toast('اتسجل الخصم ✅'); closeSheet(); }).catch(err=> toast('تعذر: ' + (err && err.code))); }
function addExpense(){ const amount = Math.round((Number(prompt('المبلغ:'))||0)*100)/100; if(!(amount>0)) return; const note = prompt('إيه المصروف؟') || ''; if(!note) return; const bs = branches(); const bi = bs.length>1 ? prompt('الفرع: ' + bs.map((b,i)=> (i+1)+' = '+b).join(' · ') + ' (فاضي = عام)') : '1'; const branch = bi && bs[Number(bi)-1] ? bs[Number(bi)-1] : null;
  const now = Date.now(); const p = caiParts(now); db.collection('office_expenses').add({ amount, note, branch, ts: now, month: p.y + '-' + String(p.m).padStart(2,'0'), source:'office2' }).then(()=> toast('اتسجل ✅')).catch(err=> toast('تعذر: ' + (err && err.code))); }

/* ---------- ٦) 🕵️ النشاط — اللي يستاهل تعرفه، مش لوج تقني ----------
   قرار المالك 10-10: السجل القديم (54 نوع حدث تقني) محدش بيفتحه. هنا: أحداث الفلوس والتلاعب بس،
   بالعربي وبالمبلغ والموظفة، مع ملخص الأسبوع ومين فيه خروج عن المعتاد. */
let actDays = 7, actFilter = 'all'; const act = { rows:[], loadedSince:0, loading:false, err:null };
const ACT_TYPES = ['same_day_return','same_day_reversal','manual_discount','cart_item_edited','manual_drawer_open','cart_abandoned','customer_points_edit','customer_name_edit','card_overcharge_saved','card_saved_manual','paymob_stuck','paymob_cancelled','credit_spend_failed','credit_spend_blocked','gift_card_return_blocked','inventory_wiped','inventory_merge','inventory_merge_bulk','inventory_full_reconcile','inventory_branch_catalog_replace','import_qty_adjusted','import_qty_moved','redeem_value_mismatch'];
const ACT_GROUP = { returns:['same_day_return','same_day_reversal'], discounts:['manual_discount','cart_item_edited'], drawer:['manual_drawer_open'], cart:['cart_abandoned'], customers:['customer_points_edit','customer_name_edit','redeem_value_mismatch'], card:['card_overcharge_saved','card_saved_manual','paymob_stuck','paymob_cancelled','credit_spend_failed','credit_spend_blocked','gift_card_return_blocked'], stock:['inventory_wiped','inventory_merge','inventory_merge_bulk','inventory_full_reconcile','inventory_branch_catalog_replace','import_qty_adjusted','import_qty_moved'] };
const ACT_LABEL = { all:'الكل', returns:'↩️ مرتجعات', discounts:'🏷️ خصومات', drawer:'🗄️ الدرج', cart:'🛒 سلة اتمسحت', customers:'👤 عملاء', card:'💳 دفع', stock:'📦 مخزون', attendance:'⏰ حضور' };
async function loadActivity(days){
  const since = Date.now() - days*DAY; if(act.loading || (act.loadedSince && act.loadedSince <= since)) return;
  act.loading = true; render();
  try{
    let last = null; const rows = []; const until = act.loadedSince || null;
    for(let i = 0; i < 30; i++){
      let q = db.collection('pos_activity_log').where('ts','>=',since).orderBy('ts','desc'); if(until) q = q.where('ts','<',until); if(last) q = q.startAfter(last); q = q.limit(500);
      const snap = await q.get(); if(snap.empty) break; snap.docs.forEach(d=> rows.push(Object.assign({ id:d.id }, d.data()))); last = snap.docs[snap.docs.length-1]; if(snap.size < 500) break;
    }
    const seen = new Set(act.rows.map(r=>r.id)); rows.forEach(r=>{ if(!seen.has(r.id) && ACT_TYPES.includes(r.type)) act.rows.push(r); });
    act.rows.sort((a,b)=> (b.ts||0)-(a.ts||0)); act.loadedSince = since; act.err = null;
  }catch(e){ act.err = e && (e.code||e.message); }
  act.loading = false; render();
}
function actGroupOf(type){ return Object.keys(ACT_GROUP).find(g=> ACT_GROUP[g].includes(type)) || 'other'; }
function actText(r){
  const who = esc(r.employeeName||'—'); const m = (v)=> n0(v) + ' ج';
  switch(r.type){
    case 'same_day_return': return `↩️ <b>${who}</b> عملت مرتجع نفس اليوم: ${esc(r.item||'')} (فاتورة #${esc(r.invoiceNo||'')})`;
    case 'same_day_reversal': return `↩️ <b>${who}</b> عكست فاتورة #${esc(r.invoiceNo||'')} بالكامل — ${m(r.total)}`;
    case 'manual_discount': return `🏷️ <b>${who}</b> خصم يدوي ${r.pct}% على سلة ${r.cartCount||''} صنف`;
    case 'cart_item_edited': return `🏷️ <b>${who}</b> غيّرت سعر «${esc(r.name||'')}» من ${m(r.from)} لـ ${m(r.to)}${r.pct?' ('+r.pct+'%)':''}`;
    case 'manual_drawer_open': return `🗄️ <b>${who}</b> فتحت الدرج من غير بيع`;
    case 'cart_abandoned': return `🛒 <b>${who}</b> مسحت سلة ${r.itemCount||0} صنف بقيمة ${m(r.value)}`;
    case 'customer_points_edit': return `👤 <b>${who}</b> عدّلت نقط عميلة ${esc(r.phone||'')}: ${r.from} ← ${r.to} (${r.diff>0?'+':''}${r.diff})${r.reason?' · '+esc(r.reason):''}`;
    case 'customer_name_edit': return `👤 <b>${who}</b> غيّرت اسم عميلة ${esc(r.phone||'')}: «${esc(r.from||'')}» ← «${esc(r.to||'')}»`;
    case 'redeem_value_mismatch': return `👤 ⚠️ قيمة استبدال نقط مش مطابقة (${esc(r.employeeName||'')})`;
    case 'card_overcharge_saved': return `💳 ⚠️ <b>${who}</b> الماكينة خدت ${m(r.charged)} على فاتورة ${m(r.total)} (فرق ${m(r.diff)})`;
    case 'card_saved_manual': return `💳 <b>${who}</b> سجّلت فيزا يدوي${r.amount?' '+m(r.amount):''}`;
    case 'paymob_stuck': return `💳 ⚠️ الماكينة علّقت (${esc(r.reason||'')}) عند <b>${who}</b>`;
    case 'paymob_cancelled': return `💳 <b>${who}</b> لغت عملية فيزا`;
    case 'credit_spend_failed': case 'credit_spend_blocked': return `💰 ⚠️ صرف رصيد عميلة فشل/اتمنع عند <b>${who}</b>`;
    case 'gift_card_return_blocked': return `🎁 <b>${who}</b> حاولت ترجّع كارت هدايا ${m(r.value)} (اتمنع)`;
    case 'inventory_wiped': return `📦 🚨 <b>${who}</b> مسحت مخزون الفرع (${r.count||0} صنف)`;
    case 'inventory_merge': case 'inventory_merge_bulk': return `📦 <b>${who}</b> دمجت أصناف في المخزون`;
    case 'inventory_full_reconcile': return `📦 <b>${who}</b> عملت جرد كامل`;
    case 'inventory_branch_catalog_replace': return `📦 🚨 <b>${who}</b> استبدلت كتالوج الفرع`;
    case 'import_qty_adjusted': case 'import_qty_moved': return `📦 <b>${who}</b> عدّلت كميات بالاستيراد`;
    default: return `${esc(r.type)} · ${who}`;
  }
}
function actWeight(r){ return ['inventory_wiped','inventory_branch_catalog_replace','card_overcharge_saved','same_day_reversal','redeem_value_mismatch'].includes(r.type) ? 'bad' : (['manual_discount','cart_item_edited','manual_drawer_open','customer_points_edit','same_day_return'].includes(r.type) ? 'w' : 'i'); }
function attendanceEvents(since){
  const out = [];
  D.shifts.filter(s=> s.clockInTs >= since).forEach(s=>{ const e = empById(s.employeeId)||{}; const g = TimeBank.cfgOf(timeCfg(e.branch)).bankGraceMin;
    if((Number(s.lateMinutes)||0) > Math.max(g, 15)) out.push({ id:'late_'+s.id, ts:s.clockInTs, branch:s.branch, employeeName:s.employeeName||e.name, group:'attendance', w:'w', html:`⏰ <b>${esc(s.employeeName||e.name||'')}</b> اتأخرت ${s.lateMinutes} د` });
    if(s.bankAutoEnd) out.push({ id:'forgot_'+s.id, ts:s.bankAutoAt||s.clockOutTs, branch:s.branch, employeeName:s.employeeName||e.name, group:'attendance', w:'w', html:`🕐 <b>${esc(s.employeeName||e.name||'')}</b> نسيت الانصراف — اتقفل على ${hm(s.clockOutTs)}` });
  });
  return out;
}
function rActivity(){
  head(`<button class="back" onclick="O2.go('more')">‹</button> النشاط`, 'اللي يستاهل تعرفه · آخر ' + actDays + ' يوم');
  const since = Date.now() - actDays*DAY;
  if(!act.loading && (!act.loadedSince || act.loadedSince > since)) setTimeout(()=> loadActivity(actDays), 0);
  const rows = act.rows.filter(r=> r.ts >= since).map(r=> ({ id:r.id, ts:r.ts, branch:r.branch, employeeName:r.employeeName, group: actGroupOf(r.type), w: actWeight(r), html: actText(r), type:r.type }));
  const all = rows.concat(attendanceEvents(since)).sort((a,b)=> (b.ts||0)-(a.ts||0));
  // ملخص: عدد كل مجموعة + أكتر موظفة في كل مجموعة
  const groups = Object.keys(ACT_LABEL).filter(g=> g!=='all');
  const chips = ['all'].concat(groups).map(g=>{ const n = g==='all' ? all.length : all.filter(x=>x.group===g).length; return n || g==='all' ? `<button class="${actFilter===g?'on':''}" onclick="O2.actFilter('${g}')">${ACT_LABEL[g]}${n?' '+n:''}</button>` : ''; }).join('');
  const outl = groups.map(g=>{ const by = {}; all.filter(x=> x.group===g && x.employeeName).forEach(x=>{ by[x.employeeName] = (by[x.employeeName]||0) + 1; }); const top = Object.entries(by).sort((a,b)=> b[1]-a[1])[0]; const total = Object.values(by).reduce((n,v)=>n+v,0); return (top && top[1] >= 3 && top[1] >= total*0.4) ? `<div class="row" style="cursor:default"><div class="n"><b>${ACT_LABEL[g]}</b><small>${esc(top[0])} عندها ${top[1]} من ${total}</small></div><span class="pill p-warn">خروج عن المعتاد</span></div>` : ''; }).join('');
  const sum = `<div class="card"><h3>📊 ملخص ${actDays} يوم <small>${all.length} حدث</small></h3><div class="kpis">${groups.filter(g=> all.some(x=>x.group===g)).slice(0,6).map(g=>`<div class="kpi" onclick="O2.actFilter('${g}')"><small>${ACT_LABEL[g]}</small><b>${all.filter(x=>x.group===g).length}</b></div>`).join('') || '<div class="empty">مفيش أحداث</div>'}</div>${outl?`<div class="sec">🚩 مين أكتر من الطبيعي</div>${outl}`:''}</div>`;
  const list = all.filter(x=> actFilter==='all' || x.group===actFilter);
  let lastDay = ''; const feed = list.map(x=>{ const k = caiKey(x.ts); const hd = k !== lastDay ? `<div class="sec">${dayName(x.ts)} ${k.slice(5)}</div>` : ''; lastDay = k; return hd + `<div class="alert ${x.w==='bad'?'':x.w}" style="cursor:default"><span style="flex:1">${x.html}<br><small class="tag">${esc(String(x.branch||'').replace('echarpe ',''))} · ${hm(x.ts)}</small></span></div>`; }).join('');
  return `<div class="seg full" style="flex-wrap:wrap">${chips}</div>` + sum + `<div class="full">${act.loading?'<div class="card"><div class="skel"></div></div>':''}${act.err?`<div class="card"><b style="color:var(--bad)">تعذر التحميل: ${esc(act.err)}</b></div>`:''}${feed || (act.loading?'':'<div class="empty">مفيش أحداث في الفترة دي 🎉</div>')}<div class="btns"><button class="btn w" onclick="O2.actMore()">⏮ حمّل أسبوع أقدم</button></div></div>`;
}

/* ---------- ٥) المزيد ---------- */
function rMore(){
  head('المزيد', '');
  return `<div class="card"><div class="row first" onclick="O2.go('activity')"><div class="n"><b>🕵️ النشاط</b><small>مرتجعات · خصومات يدوية · الدرج · سلة اتمسحت · تعديل نقط عملاء · دفع · مخزون · حضور — بالعربي وبالمبلغ</small></div><span class="pill p-acc">افتح ›</span></div>
    <div class="row" onclick="O2.oldOffice()"><div class="n"><b>📷 الكاميرات</b><small>بتفتح من الشاشة القديمة لحد ما تتنقل هنا</small></div><span class="pill p-acc">افتح ›</span></div>
    <div class="row" onclick="O2.oldOffice()"><div class="n"><b>📦 المخزون والتقارير التفصيلية</b><small>الشاشة القديمة</small></div><span class="pill p-acc">افتح ›</span></div>
    <div class="row" onclick="O2.logout()"><div class="n"><b>🚪 خروج</b></div></div></div>
    <div class="hint">Office 2 · v1 · البيانات من نفس القاعدة — أي تعديل هنا بيظهر في sales وOffice فورًا</div>`;
}
})();
