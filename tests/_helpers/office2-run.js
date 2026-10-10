// Office 2 — بيفتح الصفحة الحقيقية في كروميوم مع Firebase وهمي (compat) وبيانات واقعية، ويدوس على كل الشاشات والإجراءات
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const D = (y,m,d,h,mi)=> Date.UTC(y, m-1, d, (h||0)-3, mi||0);   // القاهرة = UTC+3 في أكتوبر
const NOW = D(2026,10,10,16,0);
const data = {
  sales_employees: [ { id:'e1', name:'سارة', branch:'echarpe El Rehab', shift:'evening', baseSalary:4000, dayOff:5 }, { id:'e2', name:'هاجر', branch:'echarpe El Rehab', shift:'morning', baseSalary:4200, dayOff:4 }, { id:'e3', name:'دينا', branch:'Glow', shift:'evening', baseSalary:3800, dayOff:5 } ],
  sales_settings: [ { id:'echarpe El Rehab', commissionPerPoint:10, timeCfg:{ bankEnabled:true, bankFrom:'2026-10-01' }, compliance:{ shifts:{ morning:{ start:'10:00', end:'18:00' }, evening:{ start:'14:00', end:'22:00' } } } }, { id:'Glow', timeCfg:{ bankEnabled:true, bankFrom:'2026-10-01' }, compliance:{ shifts:{ evening:{ start:'14:00', end:'22:00' } } } } ],
  sales_shifts: [
    { id:'s1', employeeId:'e1', employeeName:'سارة', branch:'echarpe El Rehab', clockInTs:D(2026,10,10,14,22), clockOutTs:null, lateMinutes:22, attendanceShiftKey:'evening', scheduledStartTime:'14:00', scheduledEndTime:'22:00' },
    { id:'s2', employeeId:'e1', employeeName:'سارة', branch:'echarpe El Rehab', clockInTs:D(2026,10,6,14,20), clockOutTs:D(2026,10,6,22,40), shiftMinutes:500, lateMinutes:20, attendanceShiftKey:'evening', scheduledStartTime:'14:00', scheduledEndTime:'22:00' },
    { id:'s3', employeeId:'e1', employeeName:'سارة', branch:'echarpe El Rehab', clockInTs:D(2026,10,4,14,35), clockOutTs:D(2026,10,5,14,0), shiftMinutes:1405, lateMinutes:35, forgotClockOut:true, needsClockOutReview:true, autoClosedAt1:true, attendanceShiftKey:'evening', scheduledStartTime:'14:00', scheduledEndTime:'22:00' },
    { id:'s4', employeeId:'e2', employeeName:'هاجر', branch:'echarpe El Rehab', clockInTs:D(2026,10,10,10,0), clockOutTs:null, lateMinutes:0, attendanceShiftKey:'morning', scheduledStartTime:'10:00', scheduledEndTime:'18:00' },
    { id:'s5', employeeId:'e2', employeeName:'هاجر', branch:'echarpe El Rehab', clockInTs:D(2026,10,7,10,0), clockOutTs:D(2026,10,7,19,0), shiftMinutes:540, lateMinutes:0, attendanceShiftKey:'morning', scheduledStartTime:'10:00', scheduledEndTime:'18:00' },
    { id:'s6', employeeId:'e1', employeeName:'سارة', branch:'echarpe El Rehab', clockInTs:D(2026,10,1,14,25), clockOutTs:D(2026,10,1,22,0), shiftMinutes:455, lateMinutes:25, attendanceShiftKey:'evening', scheduledStartTime:'14:00', scheduledEndTime:'22:00' },
    { id:'s7', employeeId:'e1', employeeName:'سارة', branch:'echarpe El Rehab', clockInTs:D(2026,10,2,14,30), clockOutTs:D(2026,10,2,22,0), shiftMinutes:450, lateMinutes:30, attendanceShiftKey:'evening', scheduledStartTime:'14:00', scheduledEndTime:'22:00' },
  ],
  sales_breaks: [ { id:'b1', employeeId:'e2', branch:'echarpe El Rehab', startTs:D(2026,10,10,15,40), endTs:null } ],
  sales_points: [ { id:'p1', employeeId:'e2', ts:D(2026,10,10,12,0), value:1 }, { id:'p2', employeeId:'e2', ts:D(2026,10,10,13,0), value:1 }, { id:'p3', employeeId:'e1', ts:D(2026,10,6,20,0), value:1 } ],
  entries: [ { id:'r1', branch:'echarpe El Rehab', ts:D(2026,10,10,12,0)+30000, r:4 } ],
  sales_leave_requests: [ { id:'l1', empId:'e3', empName:'دينا', branch:'Glow', type:'dayoff', dateKey:'2026-10-16', reason:'ظرف عائلي', status:'pending', ts:D(2026,10,9,20,0) } ],
  sales_bonus_week: [], sales_time_credit: [], sales_staff_orders: [],
  pos_test_sales: [ { id:'v1', branch:'echarpe El Rehab', total:1200, createdAtMs:D(2026,10,10,12,30), payments:{ cash:1200 } }, { id:'v2', branch:'echarpe El Rehab', total:800, createdAtMs:D(2026,10,10,13,0), payments:{ visa:800 } }, { id:'v3', branch:'echarpe El Rehab', total:1500, createdAtMs:D(2026,10,9,15,0), payments:{ cash:1500 } }, { id:'v4', branch:'Glow', total:600, createdAtMs:D(2026,10,10,14,0), payments:{ instapay:600 } } ],
  sales_advances: [ { id:'a1', employeeId:'e1', employeeName:'سارة', branch:'echarpe El Rehab', amount:500, date:'2026-10-08', ts:D(2026,10,8,12,0), source:'cash' } ],
  sales_deductions: [ { id:'d1', employeeId:'e2', employeeName:'هاجر', branch:'echarpe El Rehab', amount:100, type:'manual_money', date:'2026-10-05', ts:D(2026,10,5,12,0), reason:'كسر' } ],
  sales_salary_payments: [], sales_commission_payments: [],
  office_expenses: [ { id:'x1', amount:180, note:'مياه', branch:'echarpe El Rehab', ts:D(2026,10,10,11,0), month:'2026-10', source:'office_manual' } ],
  pos_test_settings: [ { id:'office_gate', hash:null }, { id:'advances_cfg', closeDay:6, openDay:12 } ]
};
const STUB = `
window.__writes = []; window.__now = ${NOW}; Date.now = ()=> window.__now;
const DATA = ${JSON.stringify(data)};
function snapOf(rows){ const docs = rows.map(r=>{ const d = Object.assign({}, r); delete d.id; return { id:r.id, data:()=>d, exists:true }; }); return { docs, forEach:f=>docs.forEach(f), size:docs.length, empty:!docs.length }; }
function col(name){ let filters = []; const q = {
  where(f, op, v){ filters.push([f,op,v]); return q; },
  rows(){ return (DATA[name]||[]).filter(r=> filters.every(([f,op,v])=>{ const x = r[f]; const vv = (v && typeof v.toMillis==='function') ? v.toMillis() : v; if(op==='>=') return (Number(x)||0) >= vv; if(op==='==') return x===vv; return true; })); },
  onSnapshot(ok){ ok(snapOf(q.rows())); window.__listeners = (window.__listeners||[]); window.__listeners.push(()=> ok(snapOf(q.rows()))); return ()=>{}; },
  get(){ return Promise.resolve(snapOf(q.rows())); },
  add(p){ const id = name + '_' + Math.random().toString(36).slice(2,8); window.__writes.push({ col:name, id, op:'add', p }); (DATA[name] = DATA[name]||[]).push(Object.assign({ id }, p)); (window.__listeners||[]).forEach(f=>f()); return Promise.resolve({ id }); },
  doc(id){ return { get(){ const r = (DATA[name]||[]).find(x=>x.id===id); const d = r ? Object.assign({}, r) : null; return Promise.resolve({ exists: !!r, data:()=>d }); },
    update(p){ window.__writes.push({ col:name, id, op:'update', p }); const r = (DATA[name]||[]).find(x=>x.id===id); if(r) Object.assign(r, p); (window.__listeners||[]).forEach(f=>f()); return Promise.resolve(); },
    set(p, o){ window.__writes.push({ col:name, id, op:'set', p }); const list = DATA[name] = DATA[name]||[]; const r = list.find(x=>x.id===id); if(r && o && o.merge) Object.assign(r, p); else list.push(Object.assign({ id }, p)); (window.__listeners||[]).forEach(f=>f()); return Promise.resolve(); },
    delete(){ window.__writes.push({ col:name, id, op:'delete' }); DATA[name] = (DATA[name]||[]).filter(x=>x.id!==id); return Promise.resolve(); } }; } }; return q; }
const dbStub = { collection: col, settings(){}, enablePersistence(){ return Promise.resolve(); }, runTransaction(fn){ const tx = { get(ref){ return ref.get(); }, set(ref,p){ return ref.set(p); }, update(ref,p){ return ref.update(p); } }; return fn(tx); }, batch(){ const ops=[]; return { set(ref,p){ ops.push(()=>ref.set(p)); }, delete(ref){ ops.push(()=>ref.delete()); }, update(ref,p){ ops.push(()=>ref.update(p)); }, commit(){ ops.forEach(f=>f()); return Promise.resolve(); } }; } };
let authCb = null; const authStub = { currentUser:{ email:'owner@test' }, onAuthStateChanged(cb){ authCb = cb; setTimeout(()=>cb({ email:'owner@test' }), 10); }, setPersistence(){ return Promise.resolve(); }, signInWithEmailAndPassword(){ return Promise.resolve(); }, signOut(){ return Promise.resolve(); } };
window.firebase = { apps:[{}], app:()=>({}), initializeApp:()=>({}), auth: Object.assign(()=>authStub, { Auth:{ Persistence:{ LOCAL:'local' } } }), firestore: Object.assign(()=>dbStub, { Timestamp:{ fromMillis:(ms)=>({ toMillis:()=>ms }) } }) };
`;
(async()=>{
  const b = await chromium.launch(); const p = await b.newPage({ viewport:{ width:390, height:844 } });
  const errs = []; p.on('pageerror', e=> errs.push(String(e.message))); p.on('console', m=>{ if(m.type()==='error') errs.push('console: ' + m.text()); });
  let html = fs.readFileSync(path.join(ROOT,'office2','index.html'),'utf8');
  html = html.replace(/<script src="https:\/\/www\.gstatic\.com[^>]*><\/script>\n?/g, '').replace('<script src="../sales/time-bank.js?v=647"></script>', '<script>' + STUB + '</script><script>' + fs.readFileSync(path.join(ROOT,'sales','time-bank.js'),'utf8') + '</script>')
    .replace('<script src="payroll.js?v=2"></script>', '<script>' + fs.readFileSync(path.join(ROOT,'office2','payroll.js'),'utf8') + '</script>').replace('<script src="office2.js?v=2"></script>', '<script>' + fs.readFileSync(path.join(ROOT,'office2','office2.js'),'utf8') + '</script>')
    .replace('<link rel="stylesheet" href="office2.css?v=2">', '<style>' + fs.readFileSync(path.join(ROOT,'office2','office2.css'),'utf8') + '</style>')
    .replace(/<link href="https:\/\/fonts[^>]*>/, '');
  await p.setContent(html); await p.waitForTimeout(700);
  const out = {}; const step = (n)=> process.stderr.write(n + ' ');
  const shots = process.argv[2] || '';
  out.today = await p.evaluate(()=> document.getElementById('screen').innerText);
  if(shots) await p.screenshot({ path: shots + '-today.png' });
  step('staff'); await p.evaluate(()=> O2.go('staff')); await p.waitForTimeout(100); out.staff = await p.evaluate(()=> document.getElementById('screen').innerText);
  if(shots) await p.screenshot({ path: shots + '-staff.png' });
  await p.evaluate(()=> O2.go('emp','e1')); await p.waitForTimeout(100); out.emp = await p.evaluate(()=> document.getElementById('screen').innerText);
  if(shots) await p.screenshot({ path: shots + '-emp.png', fullPage:true });
  // إجراء: اعذر تأخير شيفت s2
  p.on('dialog', d=>{ const m = d.message(); d.accept(/مبلغ|المبلغ|الفرع/.test(m) ? '250' : 'سبب اختبار'); });
  await p.evaluate(()=> O2.shift('s2')); await p.waitForTimeout(80); out.sheet = await p.evaluate(()=> document.getElementById('sheetBody').innerText);
  await p.evaluate(()=> O2.excuse('s2')); await p.waitForTimeout(150);
  await p.evaluate(()=> O2.go('inbox')); await p.waitForTimeout(100); out.inbox = await p.evaluate(()=> document.getElementById('screen').innerText);
  if(shots) await p.screenshot({ path: shots + '-inbox.png' });
  await p.evaluate(()=> O2.leave('l1', true)); await p.waitForTimeout(150); out.inboxAfter = await p.evaluate(()=> document.getElementById('screen').innerText);
  await p.evaluate(()=> O2.inboxTab('auto')); await p.waitForTimeout(80); out.auto = await p.evaluate(()=> document.getElementById('screen').innerText);
  step('money'); await p.evaluate(()=> O2.go('money')); await p.waitForTimeout(100); out.money = await p.evaluate(()=> document.getElementById('screen').innerText);
  await p.evaluate(()=> O2.moneyTab('pay')); await p.waitForTimeout(80); out.pay = await p.evaluate(()=> document.getElementById('screen').innerText);
  if(shots) await p.screenshot({ path: shots + '-pay.png' });
  step('paysheet'); await p.evaluate(()=> O2.paySheet('e1')); await p.waitForTimeout(80); out.paySheet = await p.evaluate(()=> document.getElementById('sheetBody').innerText);
  if(shots) await p.screenshot({ path: shots + '-paysheet.png' });
  // صرف المرتب مرتين = مرة واحدة بس
  step('pay1'); await p.evaluate(()=> O2.paySalary('e1', 3000)); await p.waitForTimeout(150);
  step('pay2'); await p.evaluate(()=> O2.paySalary('e1', 3000)); await p.waitForTimeout(150);
  await p.evaluate(()=> O2.payComm('e2', 2, 20, '2026-10')); await p.waitForTimeout(120);
  // سلفة + خصم + مصروف (prompt بيرجع '250' للرقم و'سبب اختبار' للنص عبر الـdialog handler)
  step('adv'); await p.evaluate(()=> O2.addAdvance('e2')); await p.waitForTimeout(120);
  await p.evaluate(()=> O2.addDeduction('e3')); await p.waitForTimeout(120);
  await p.evaluate(()=> O2.moneyTab('exp')); await p.waitForTimeout(80); out.exp = await p.evaluate(()=> document.getElementById('screen').innerText);
  step('exp'); await p.evaluate(()=> O2.addExpense()); await p.waitForTimeout(120);
  out.exp2 = await p.evaluate(()=> document.getElementById('screen').innerText);
  out.writes = await p.evaluate(()=> window.__writes); out.errs = errs;
  process.stdout.write(JSON.stringify(out)); await b.close();
})().catch(e=>{ process.stdout.write(JSON.stringify({ fatal: String(e && e.stack || e) })); process.exit(0); });
