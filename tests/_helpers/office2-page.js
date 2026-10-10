// Office 2 — فتح الصفحة الحقيقية في كروميوم مع Firebase وهمي (compat). مشترك بين كل اختبارات Office 2.
// open({ data:{col:[rows]}, now }) → { p, b, errs, text(), sheet(), writes(), close() }. بيانات data بتتضاف/بتستبدل مجموعات الـDATA الافتراضية.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const D = (y,m,d,h,mi)=> Date.UTC(y, m-1, d, (h||0)-3, mi||0);   // القاهرة = UTC+3 في أكتوبر
const NOW = D(2026,10,10,16,0);
function baseData(){ return {
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
  pos_test_sales: [ { id:'v1', branch:'echarpe El Rehab', total:1200, invoiceNo:5801, employee:'هاجر', createdAtMs:D(2026,10,10,12,30), payments:{ cash:1200 }, items:[{ barcode:'111', name:'طرحة شيفون', qty:2, price:400 }, { barcode:'222', name:'بيجامة قطن', qty:1, price:400 }] }, { id:'v2', branch:'echarpe El Rehab', total:800, invoiceNo:5802, employee:'سارة', cartSid:'c1', createdAtMs:D(2026,10,10,13,0), payments:{ visa:800 }, items:[{ barcode:'111', name:'طرحة شيفون', qty:2, price:400 }] }, { id:'v3', branch:'echarpe El Rehab', total:1500, invoiceNo:5790, employee:'هاجر', cartSid:'c2', customerPhone:'01011111111', createdAtMs:D(2026,10,9,15,0), payments:{ cash:1500 }, items:[{ barcode:'333', name:'إيشارب حرير', qty:3, price:500 }] }, { id:'v5', branch:'echarpe El Rehab', total:900, invoiceNo:5789, employee:'هاجر', createdAtMs:D(2026,10,9,11,0), payments:{ cash:900 }, items:[{ barcode:'111', name:'طرحة شيفون', qty:1, price:900 }] }, { id:'v4', branch:'Glow', total:600, invoiceNo:7001, employee:'دينا', createdAtMs:D(2026,10,10,14,0), payments:{ instapay:600 }, items:[{ barcode:'444', name:'سكارف', qty:1, price:600 }] } ,
    { id:'v6', branch:'Glow', total:450, invoiceNo:6990, employee:'دينا', customerPhone:'01022222222', pointsRedeemed:50, createdAtMs:D(2026,10,8,16,0), payments:{ cash:450 }, items:[{ barcode:'444', name:'سكارف', qty:1, price:450 }] },
    { id:'v7', branch:'echarpe El Rehab', total:-300, invoiceNo:5770, employee:'سارة', createdAtMs:D(2026,10,7,17,0), payments:{ cash:-300 }, items:[{ barcode:'555', name:'شال صوف', qty:1, price:-300, isReturn:true }] },
    { id:'v8', branch:'echarpe El Rehab', total:200, invoiceNo:5771, employee:'سارة', customerPhone:'01099999999', createdAtMs:D(2026,10,6,12,0), payments:{ cash:200 }, items:[{ barcode:'111', name:'طرحة شيفون', qty:1, price:200 }] },
    { id:'v9', branch:'echarpe El Rehab', total:200, invoiceNo:5772, employee:'سارة', customerPhone:'01099999999', createdAtMs:D(2026,10,6,13,0), payments:{ cash:200 }, items:[{ barcode:'111', name:'طرحة شيفون', qty:1, price:200 }] },
    { id:'v10', branch:'echarpe El Rehab', total:200, invoiceNo:5773, employee:'سارة', customerPhone:'01099999999', createdAtMs:D(2026,10,5,12,0), payments:{ cash:200 }, items:[{ barcode:'111', name:'طرحة شيفون', qty:1, price:200 }] },
    { id:'v11', branch:'echarpe El Rehab', total:200, invoiceNo:5774, employee:'سارة', customerPhone:'01099999999', createdAtMs:D(2026,10,5,13,0), payments:{ cash:200 }, items:[{ barcode:'111', name:'طرحة شيفون', qty:1, price:200 }] } ],
  sales_advances: [ { id:'a1', employeeId:'e1', employeeName:'سارة', branch:'echarpe El Rehab', amount:500, date:'2026-10-08', ts:D(2026,10,8,12,0), source:'cash' } ],
  sales_deductions: [ { id:'d1', employeeId:'e2', employeeName:'هاجر', branch:'echarpe El Rehab', amount:100, type:'manual_money', date:'2026-10-05', ts:D(2026,10,5,12,0), reason:'كسر' } ],
  sales_salary_payments: [], sales_commission_payments: [],
  office_expenses: [ { id:'x1', amount:180, note:'مياه', branch:'echarpe El Rehab', ts:D(2026,10,10,11,0), month:'2026-10', source:'office_manual' } ],
  pos_activity_log: [
    { id:'l1', type:'manual_discount', branch:'echarpe El Rehab', employeeName:'سارة', ts:D(2026,10,10,12,58), pct:15, cartCount:3, sid:'c1', cctvEventId:'ev1' },
    { id:'l2', type:'manual_discount', branch:'echarpe El Rehab', employeeName:'هاجر', ts:D(2026,10,9,14,58), pct:10, cartCount:2, sid:'c2' },
    { id:'l3', type:'manual_discount', branch:'echarpe El Rehab', employeeName:'سارة', ts:D(2026,10,8,13,10), pct:20, cartCount:1 },
    { id:'l4', type:'manual_discount', branch:'echarpe El Rehab', employeeName:'هاجر', ts:D(2026,10,7,13,10), pct:5, cartCount:1 },
    { id:'l5', type:'cart_abandoned', branch:'Glow', employeeName:'دينا', ts:D(2026,10,10,15,0), itemCount:2, value:900 },
    { id:'l6', type:'same_day_reversal', branch:'echarpe El Rehab', employeeName:'هاجر', ts:D(2026,10,9,18,0), invoiceNo:5790, total:1500 },
    { id:'l7', type:'customer_points_edit', branch:'echarpe El Rehab', employeeName:'سارة', ts:D(2026,10,6,12,0), phone:'0100', from:10, to:40, diff:30, reason:'تصحيح' },
    { id:'l8', type:'sale_saved', branch:'echarpe El Rehab', employeeName:'هاجر', ts:D(2026,10,10,12,30) },
    { id:'l9', type:'print_latency', branch:'echarpe El Rehab', ts:D(2026,10,10,12,31), ms:900 },
    { id:'l10', type:'manual_drawer_open', branch:'echarpe El Rehab', employeeName:'سارة', ts:D(2026,10,10,16,0), cctvEventId:'ev10' },
    { id:'l11', type:'manual_drawer_open', branch:'echarpe El Rehab', employeeName:'هاجر', ts:D(2026,10,10,12,31) },
    { id:'l12', type:'cart_abandoned', branch:'echarpe El Rehab', employeeName:'هاجر', ts:D(2026,10,10,12,25), itemCount:3, value:1200 },
    { id:'l13', type:'cart_abandoned', branch:'Glow', employeeName:'دينا', ts:D(2026,10,9,15,0), itemCount:1, value:30 }
  ],
  office_cases: [], pos_cctv_invoice_snapshots: [],
  pos_test_settings: [ { id:'office_gate', hash:null }, { id:'advances_cfg', closeDay:6, openDay:12 } ]
}; }
function stubFor(data, now){
  return `
window.__writes = []; window.__now = ${now}; Date.now = ()=> window.__now;
const DATA = ${JSON.stringify(data)};
function snapOf(rows){ const docs = rows.map(r=>{ const d = Object.assign({}, r); delete d.id; return { id:r.id, data:()=>d, exists:true }; }); return { docs, forEach:f=>docs.forEach(f), size:docs.length, empty:!docs.length }; }
function col(name){ let filters = []; const q = {
  where(f, op, v){ filters.push([f,op,v]); return q; }, orderBy(){ return q; }, startAfter(){ return q; }, limit(){ return q; },
  rows(){ return (DATA[name]||[]).filter(r=> filters.every(([f,op,v])=>{ const x = r[f]; const vv = (v && typeof v.toMillis==='function') ? v.toMillis() : v; if(op==='>=') return (Number(x)||0) >= vv; if(op==='<=') return (Number(x)||0) <= vv; if(op==='<') return (Number(x)||0) < vv; if(op==='==') return x===vv; return true; })); },
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
}
function htmlFor(data, now){
  let html = fs.readFileSync(path.join(ROOT,'office2','index.html'),'utf8');
  html = html.replace(/<script src="https:\/\/www\.gstatic\.com[^>]*><\/script>\n?/g, '').replace(/<link href="https:\/\/fonts[^>]*>/, '')
    .replace(/<link rel="stylesheet" href="office2\.css\?v=\d+">/, '<style>' + fs.readFileSync(path.join(ROOT,'office2','office2.css'),'utf8') + '</style>')
    .replace(/<script src="\.\.\/sales\/time-bank\.js\?v=\d+"><\/script>/, '<script>' + stubFor(data, now) + '</script><script>' + fs.readFileSync(path.join(ROOT,'sales','time-bank.js'),'utf8') + '</script>')
    .replace(/<script src="([a-z0-9\-]+\.js)\?v=\d+"><\/script>/g, (m, f)=> '<script>' + fs.readFileSync(path.join(ROOT,'office2',f),'utf8') + '</script>');
  return html;
}
async function open(opt){
  opt = opt || {}; const data = Object.assign(baseData(), opt.data||{}); const now = opt.now || NOW;
  const b = await chromium.launch(); const p = await b.newPage({ viewport:{ width:390, height:844 } });
  const errs = []; p.on('pageerror', e=> errs.push(String(e.message))); p.on('console', m=>{ if(m.type()==='error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  p.on('dialog', d=>{ const m = d.message(); d.accept(opt.dialog ? opt.dialog(m) : (/مبلغ|المبلغ|الفرع/.test(m) ? '250' : 'سبب اختبار')); });
  await p.setContent(htmlFor(data, now)); await p.waitForTimeout(700);
  const text = ()=> p.evaluate(()=> document.getElementById('screen').innerText);
  const sheet = ()=> p.evaluate(()=> document.getElementById('sheetBody').innerText);
  const sheetHtml = ()=> p.evaluate(()=> document.getElementById('sheetBody').innerHTML);
  const writes = ()=> p.evaluate(()=> window.__writes);
  const go = async (name, arg, ms)=>{ await p.evaluate(([n,a])=> O2.go(n, a), [name, arg||null]); await p.waitForTimeout(ms||300); return text(); };
  const call = async (js, ms)=>{ await p.evaluate(js); await p.waitForTimeout(ms||120); };
  return { p, b, errs, text, sheet, sheetHtml, writes, go, call, close: ()=> b.close() };
}
module.exports = { open, D, NOW, baseData, htmlFor };
