/* ============================================================
   🧾 Office 2 — الحسابات (منقولة من Office/office.js: page-money)
   ------------------------------------------------------------
   💹 بنكسب ولا بنخسر؟  نفس معادلة profitReport القديمة لشهر مختار:
      مبيعات الشهر (pos_test_sales بالشهر) − المرتبات المصروفة فعليًا (sales_salary_payments)
      − السلف ومشتريات الموظفين (sales_advances) − البضاعة (office_merchant_txns type:order)
      − المصاريف (office_expenses). كل حركة بتتحسب في شهر تسجيلها (بتوقيت القاهرة).
   🧾 حسابات التجار   office_merchants + office_merchant_txns (order بيزوّد · payment بيخصم).
      الدفعة بتتكتب cashTracked:true → بتتخصم لوحدها من «فلوسي» (ماتسجلهاش تاني كمصروف).
      «تسجيل بضاعة بسرعة» = أوردر بـ source:'office_quick_goods' (نفس qgAdd القديم، من غير صوت).
   🔁 المصاريف الثابتة  قوالب office_recurring، والدفع بيكتب office_expenses بنفس الشكل القديم
      (amount · note · ts · month · recurringId · branch) — ومفيش دفع مرتين في نفس الشهر.
   💳↩️ فيزا مسحوبة زيادة  pos_card_refunds_due — القواعد بتسمح بس بقفل الحالة لـ refunded.
   💳 الرصيد وكروت الهدايا  credit_requests (قرار المالك عن طريق دالة creditRequestDecision —
      القواعد بتمنع أي كتابة مباشرة) · gift_cards_public (قراءة) · credit_ledger (آخر الحركات).
   ============================================================ */
(function(){
'use strict';
const u = O2.u;
const FN_BASE = 'https://us-central1-customer-feedback-8ac1d.cloudfunctions.net/';
const MON = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
let tab = 'pl';
const S = { merchants:[], mtxns:[], recurring:[], refunds:[], creditReqs:[], giftCards:[], ledger:[],
            mStarted:false, mLoaded:0, rStarted:false, rLoaded:false, fStarted:false, fLoaded:false, cStarted:false, cLoaded:false, gLoaded:false, gLoading:false, err:{} };
const PL = { mk:'', branch:'', cache:{} };   // cache[mk] = { done, loading, at, err, sales, salaryPays, advances, expenses }
const mOpen = {}; const qg = { m:'', a:'', n:'', last:null };
const rows = (s)=> s.docs.map(d=> Object.assign({ id:d.id }, d.data()));
function mkOf(ms){ return u.caiKey(ms).slice(0,7); }
function mkLabel(mk){ const a = String(mk).split('-').map(Number); return (MON[a[1]-1]||'') + ' ' + a[0]; }
function months(){ const p = u.caiParts(Date.now()); const out = []; for(let i=0;i<6;i++){ let y = p.y, m = p.m - i; while(m <= 0){ m += 12; y--; } out.push(y + '-' + String(m).padStart(2,'0')); } return out; }
function money(v){ return u.n0(v) + ' ج'; }
function when(ms){ return ms ? u.dayName(ms) + ' ' + u.caiKey(ms).slice(5) + ' · ' + u.hm(ms) : '—'; }
function fail(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
const inp = 'style="width:100%;padding:10px;border:1px solid var(--line);border-radius:12px;font-family:inherit;font-weight:700"';

/* ---------- 📡 التحميل ---------- */
function startMerchants(){
  if(S.mStarted) return; S.mStarted = true;
  u.db.collection('office_merchants').onSnapshot(s=>{ S.merchants = rows(s); S.mLoaded |= 1; u.render(); }, e=>{ S.err.m = String(e && (e.code||e.message)); S.mLoaded |= 1; u.render(); });
  u.db.collection('office_merchant_txns').onSnapshot(s=>{ S.mtxns = rows(s); S.mLoaded |= 2; u.render(); }, e=>{ S.err.m = String(e && (e.code||e.message)); S.mLoaded |= 2; u.render(); });
}
function startRecurring(){
  if(S.rStarted) return; S.rStarted = true;
  u.db.collection('office_recurring').onSnapshot(s=>{ S.recurring = rows(s); S.rLoaded = true; u.render(); }, e=>{ S.err.r = String(e && (e.code||e.message)); S.rLoaded = true; u.render(); });
}
function startRefunds(){
  if(S.fStarted) return; S.fStarted = true;
  u.db.collection('pos_card_refunds_due').where('ts','>=', Date.now() - 60*u.DAY).onSnapshot(s=>{ S.refunds = rows(s); S.fLoaded = true; u.render(); }, e=>{ S.err.f = String(e && (e.code||e.message)); S.fLoaded = true; u.render(); });
}
function startCredit(){
  if(S.cStarted) return; S.cStarted = true;
  u.db.collection('credit_requests').where('status','==','pending').onSnapshot(s=>{ S.creditReqs = rows(s); S.cLoaded = true; u.render(); }, e=>{ S.err.c = String(e && (e.code||e.message)); S.cLoaded = true; u.render(); });
}
async function loadGift(){
  if(S.gLoaded || S.gLoading) return; S.gLoading = true;
  try{ const [g, l] = await Promise.all([ u.db.collection('gift_cards_public').get(), u.db.collection('credit_ledger').orderBy('at','desc').limit(50).get() ]);
    S.giftCards = rows(g); S.ledger = rows(l).sort((a,b)=> (b.at||0) - (a.at||0)).slice(0, 50); }
  catch(e){ S.err.g = String(e && (e.code||e.message)); }
  S.gLoaded = true; S.gLoading = false; u.render();
}
async function loadPl(mk){
  const c = PL.cache[mk]; const cur = mk === months()[0];
  if(c && (c.loading || (c.done && !(cur && Date.now() - c.at > 2*60000)))) return;
  PL.cache[mk] = Object.assign({}, c||{}, { loading:true });
  const a = mk.split('-').map(Number); const r = u.caiMonthRange(u.caiStamp(a[0], a[1], 15, 12, 0)); const T = firebase.firestore.Timestamp;
  try{
    const [s1, s2, sp, ad, ex] = await Promise.all([
      u.db.collection('pos_test_sales').where('createdAtMs','>=',r.start).where('createdAtMs','<=',r.end).get(),
      u.db.collection('pos_test_sales').where('createdAt','>=',T.fromMillis(r.start)).where('createdAt','<=',T.fromMillis(r.end)).get(),
      u.db.collection('sales_salary_payments').where('paidAt','>=',r.start).where('paidAt','<=',r.end).get(),
      u.db.collection('sales_advances').where('ts','>=',r.start).where('ts','<=',r.end).get(),
      u.db.collection('office_expenses').where('ts','>=',r.start).where('ts','<=',r.end).get() ]);
    const m = {}; s1.forEach(d=>{ m[d.id] = Object.assign({ id:d.id }, d.data()); }); s2.forEach(d=>{ m[d.id] = Object.assign({ id:d.id }, d.data()); });
    PL.cache[mk] = { done:true, loading:false, at: Date.now(), sales: Object.values(m), salaryPays: rows(sp), advances: rows(ad), expenses: rows(ex) };
  }catch(e){ PL.cache[mk] = { done:true, loading:false, at: Date.now(), err: String(e && (e.code||e.message)), sales:[], salaryPays:[], advances:[], expenses:[] }; }
  u.render();
}

/* ---------- 🧮 نفس حسابات Office القديم ---------- */
function merchantBalance(txns){ return (txns||[]).reduce((n,t)=>{ if(!t) return n; const a = Number(t.amount)||0; if(t.type==='order') return n + a; if(t.type==='payment') return n - a; return n; }, 0); }
function txnsOf(mid){ return S.mtxns.filter(t=> t.merchantId===mid).sort((a,b)=> (b.ts||0) - (a.ts||0)); }
// 💹 profitReport — الإيراد صافي المبيعات (من غير المعكوس وصف العكس) − المصروف الفعلي
function plReport(c, mk, branch){
  const byBranch = {}; let revenue = 0;
  (c.sales||[]).forEach(s=>{ if(!s || s.reversed || s.isReversal) return; if(branch && s.branch !== branch) return; const t = Number(s.total)||0; const br = s.branch || '—'; byBranch[br] = (byBranch[br]||0) + t; revenue += t; });
  const salaryPaid = (c.salaryPays||[]).reduce((n,p)=>{ if(!p || (p.status && p.status !== 'paid')) return n; if(branch && p.branch !== branch) return n; const ts = Number(p.paidAt||p.ts||0); if(!ts || mkOf(ts) !== mk) return n; const paid = p.payoutTotal != null ? Number(p.payoutTotal) : Number(p.amount); return n + (paid||0); }, 0);
  const adv = { cash:0, orders:0, count:0 };
  (c.advances||[]).forEach(a=>{ if(!a) return; if(branch && a.branch !== branch) return; const ts = Number(a.ts||0); const am = ts ? mkOf(ts) : String(a.date||'').slice(0,7); if(am !== mk) return; const amount = Number(a.amount)||0; if(String(a.source||'').indexOf('staff_order')===0) adv.orders += amount; else adv.cash += amount; adv.count++; });
  const goods = branch ? 0 : S.mtxns.reduce((n,t)=>{ if(!t || t.type !== 'order') return n; if(mkOf(Number(t.ts)||0) !== mk) return n; return n + (Number(t.amount)||0); }, 0);
  const expenseBranches = {}; let expenses = 0;
  (c.expenses||[]).forEach(e=>{ if(!e || e.voided === true) return; const em = String(e.month||'') || (Number(e.ts) > 0 ? mkOf(Number(e.ts)) : ''); if(em !== mk) return; const br = String(e.branch||'عام'); if(branch && br !== branch) return; const a = Number(e.amount)||0; expenseBranches[br] = (expenseBranches[br]||0) + a; expenses += a; });
  const salaries = salaryPaid + adv.cash + adv.orders;
  return { byBranch, revenue, salaries, salaryPaid, advances: adv.cash, advanceOrders: adv.orders, advanceCount: adv.count, goods, expenses, expenseBranches, profit: revenue - salaries - goods - expenses };
}
function recurPaid(t, mk){ return (u.D.expenses||[]).find(e=> e && e.month === mk && e.recurringId === t.id) || null; }
function pendingCount(){ return S.creditReqs.length + S.refunds.filter(x=> x.status !== 'refunded').length; }

/* ---------- 💹 بنكسب ولا بنخسر؟ ---------- */
function rPl(){
  const list = months(); const mk = list.includes(PL.mk) ? PL.mk : list[0]; PL.mk = mk; const c = PL.cache[mk];
  if(!c || !c.done || (mk === list[0] && Date.now() - c.at > 2*60000)) setTimeout(()=> loadPl(mk), 0);
  startMerchants();
  const sel = `<div class="card full" style="display:flex;gap:8px;align-items:center"><span class="tag">الشهر</span><select onchange="O2.accounts.plMonth(this.value)" style="flex:1;padding:9px;border:1px solid var(--line);border-radius:10px;font-family:inherit;font-weight:800">${list.map((k,i)=>`<option value="${k}" ${k===mk?'selected':''}>${mkLabel(k)}${i===0?' (الحالي)':''}</option>`).join('')}</select></div>`;
  const brs = u.branches(); const chips = `<div class="seg full" style="flex-wrap:wrap"><button class="${!PL.branch?'on':''}" onclick="O2.accounts.plBranch('')">كل الفروع</button>${brs.map(b=>`<button class="${PL.branch===b?'on':''}" onclick="O2.accounts.plBranch('${u.esc(b)}')">${u.esc(b.replace('echarpe ',''))}</button>`).join('')}</div>`;
  if(!c || !c.done) return sel + chips + '<div class="card"><div class="skel"></div><div class="skel" style="width:60%;margin-top:8px"></div></div>';
  if(c.err) return sel + chips + `<div class="card"><b style="color:var(--bad)">تعذر تحميل الشهر: ${u.esc(c.err)}</b></div>`;
  const r = plReport(c, mk, PL.branch);
  const row = (l, v, cls, sub)=>`<div class="row" style="cursor:default"><div class="n"><b>${l}</b>${sub?`<small>${sub}</small>`:''}</div><b class="money ${cls||''}">${v}</b></div>`;
  const salesRows = Object.keys(r.byBranch).sort().map(b=> row('🏬 ' + u.esc(b), money(r.byBranch[b]), 'up')).join('') || '<div class="empty">مفيش مبيعات متسجلة للشهر ده</div>';
  const expBr = Object.keys(r.expenseBranches).sort().map(b=> u.esc(b) + ' ' + money(r.expenseBranches[b])).join(' · ');
  const good = r.profit >= 0;
  const res = `<div class="card full" style="text-align:center;border:2px solid var(--${good?'good':'bad'});background:${good?'#e6f7ee':'#fdecea'}"><div class="hint" style="margin:0">${mkLabel(mk)}${PL.branch?' · '+u.esc(PL.branch):' · كل الفروع'}</div><b class="big money" style="font-size:26px;color:var(--${good?'good':'bad'})">${good?'✅ مكسب ':'🔻 خسارة '}${money(Math.abs(r.profit))}</b></div>`;
  return sel + chips + `<div class="card"><h3>🏬 مبيعات الفروع <small>${money(r.revenue)}</small></h3>${salesRows}${c.loading?'<div class="hint">بيحدّث…</div>':''}</div>
    <div class="card"><h3>🧮 الحساب</h3>
      ${row('إجمالي المبيعات', money(r.revenue), 'up')}
      ${row('👥 المرتبات والعمولات المصروفة فعليًا', '− ' + money(r.salaries), 'dn', 'المسجل صرفه من Sales ' + money(r.salaryPaid) + ' · سلف كاش ' + money(r.advances) + ' · مشتريات موظفين ' + money(r.advanceOrders))}
      ${PL.branch ? row('📦 البضاعة (أوردرات التجار)', '—', '', 'مش موزعة على الفروع — بتظهر في «كل الفروع» بس') : row('📦 البضاعة (أوردرات التجار)', '− ' + money(r.goods), 'dn')}
      ${row('💸 مصاريف الفروع والإيجارات', '− ' + money(r.expenses), 'dn', expBr)}
      <div class="hint">كل حركة بتتحسب في شهر تسجيلها · نفس معادلة Office القديم بالظبط</div></div>` + res;
}

/* ---------- 🧾 حسابات التجار ---------- */
function rMerchants(){
  startMerchants();
  if(S.mLoaded !== 3) return '<div class="card"><div class="skel"></div></div>';
  if(S.err.m) return `<div class="card"><b style="color:var(--bad)">تعذر التحميل: ${u.esc(S.err.m)}</b></div>`;
  const sorted = S.merchants.slice().sort((a,b)=> merchantBalance(txnsOf(b.id)) - merchantBalance(txnsOf(a.id)));
  const totalDue = sorted.reduce((n,m)=>{ const b = merchantBalance(txnsOf(m.id)); return n + (b > 0 ? b : 0); }, 0);
  const byName = S.merchants.slice().sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''),'ar'));
  const quick = `<div class="card"><h3>📦 تسجيل بضاعة بسرعة</h3><div class="hint" style="margin-top:0">الأوردر هنا بيتحسب «تكلفة بضاعة» في الأرباح. ولما تسجل دفعة للتاجر من حسابه، بتتخصم لوحدها من «فلوسي» — ماتسجلهاش تاني كمصروف.</div>
      <div class="grid2" style="margin-bottom:8px"><select id="qgM" onchange="O2.accounts.qg('m',this.value)" ${inp}><option value="">اختار التاجر</option>${byName.map(m=>`<option value="${u.esc(m.id)}" ${qg.m===m.id?'selected':''}>${u.esc(m.name||'تاجر')}</option>`).join('')}</select><input id="qgA" type="number" inputmode="decimal" placeholder="المبلغ" value="${u.esc(qg.a)}" oninput="O2.accounts.qg('a',this.value)" ${inp}></div>
      <input id="qgN" placeholder="ملاحظة / رقم فاتورة (اختياري)" value="${u.esc(qg.n)}" oninput="O2.accounts.qg('n',this.value)" ${inp}>
      <div class="btns"><button class="btn p w" onclick="O2.accounts.quickGoods()">➕ بضاعة</button></div>
      ${qg.last ? `<div class="hint">✅ اتسجل ${money(qg.last.amount)} على ${u.esc(qg.last.name)} كتكلفة بضاعة <span class="link" onclick="O2.accounts.undoQuick('${u.esc(qg.last.id)}')">تراجع</span></div>` : ''}</div>`;
  const head = `<div class="card"><h3>🧾 التجار <small>${S.merchants.length} تاجر</small></h3><div class="kpis" style="grid-template-columns:1fr"><div class="kpi" style="cursor:default"><small>إجمالي اللي عليك للتجار</small><b class="dn">${money(totalDue)}</b></div></div><div class="btns"><button class="btn p w" onclick="O2.accounts.addMerchant()">➕ تاجر جديد</button></div><div class="hint">أوردر جديد بيزوّد اللي عليك، والدفعة بتخصم. الرصيد بيتحسب لوحده.</div></div>`;
  const cards = sorted.map(m=>{
    const txns = txnsOf(m.id); const bal = merchantBalance(txns); const orders = txns.filter(t=> t.type==='order'), pays = txns.filter(t=> t.type!=='order');
    const sumO = orders.reduce((n,t)=> n + (Number(t.amount)||0), 0), sumP = pays.reduce((n,t)=> n + (Number(t.amount)||0), 0); const open = !!mOpen[m.id];
    const log = open ? (txns.map(t=>{ const o = t.type==='order'; return `<div class="row" style="cursor:default"><div class="n"><b>${o?'🧾 أوردر':'💵 دفعة'}${t.note?' <small style="display:inline">· '+u.esc(t.note)+'</small>':''}</b><small>${when(t.ts)}${t.source==='office_quick_goods'?' · تسجيل سريع':''}</small></div><b class="money ${o?'dn':'up'}">${o?'+':'−'}${u.n0(t.amount)}</b><button class="btn r" style="padding:4px 8px;margin-inline-start:6px" onclick="O2.accounts.delTxn('${u.esc(t.id)}')">🗑️</button></div>`; }).join('') || '<div class="empty">مفيش حركات لسه</div>') : '';
    return `<div class="card" style="border-right:4px solid var(--${bal>0?'bad':'good'})"><div class="row first" style="cursor:default"><div class="n"><b>${u.esc(m.name)}</b><small>${orders.length} أوردر · ${pays.length} دفعة · إجمالي الأوردرات ${money(sumO)} · المدفوع ${money(sumP)}</small></div><span class="pill ${bal>0?'p-bad':(bal<0?'p-good':'p-gray')}">${bal>0?'عليك':(bal<0?'ليك':'متساوي')} ${u.n0(Math.abs(bal))}</span></div>
      <div class="btns"><button class="btn" onclick="O2.accounts.txn('${u.esc(m.id)}','order')">🧾 أوردر</button><button class="btn g" onclick="O2.accounts.txn('${u.esc(m.id)}','payment')">💵 دفعة</button><button class="btn" onclick="O2.accounts.toggle('${u.esc(m.id)}')">${open?'▲ اقفل':'📜 السجل ('+txns.length+')'}</button><button class="btn r" onclick="O2.accounts.delMerchant('${u.esc(m.id)}')">🗑️</button></div>${log}</div>`;
  }).join('');
  return head + quick + (cards || '<div class="empty">لسه مفيش تجار — ضيف تاجر من الزرار فوق</div>');
}

/* ---------- 🔁 المصاريف الثابتة ---------- */
function rRecurring(){
  startRecurring();
  if(!S.rLoaded) return '<div class="card"><div class="skel"></div></div>';
  if(S.err.r) return `<div class="card"><b style="color:var(--bad)">تعذر التحميل: ${u.esc(S.err.r)}</b></div>`;
  const mk = mkOf(Date.now());
  const tpls = S.recurring.slice().sort((a,b)=> String(a.branch||'').localeCompare(String(b.branch||''),'ar') || String(a.note||'').localeCompare(String(b.note||''),'ar'));
  const due = tpls.filter(t=> !recurPaid(t, mk)); const dueTotal = due.reduce((n,t)=> n + (t.kind==='fixed' ? (Number(t.amount)||0) : 0), 0);
  const list = tpls.map(t=>{ const paid = recurPaid(t, mk); const fixed = t.kind==='fixed';
    return `<div class="row" style="cursor:default;flex-wrap:wrap"><div class="n"><b>${u.esc(t.note||'مصروف')} <span class="pill ${paid?'p-good':'p-warn'}">${paid?'✅ اتدفع '+u.caiKey(paid.ts).slice(5)+' · '+money(paid.amount):'⏳ لسه'}</span></b><small>${u.esc(t.branch||'الشركة')} · ${fixed?'ثابت '+money(t.amount):'متغيّر — بيسألك المبلغ'}</small></div>
      <span class="btns" style="margin:0;width:100%">${paid?'':`<button class="btn g" onclick="O2.accounts.payRecur('${u.esc(t.id)}')">💰 اتدفع الشهر ده</button>`}<button class="btn" onclick="O2.accounts.editRecur('${u.esc(t.id)}')">✏️</button><button class="btn r" onclick="O2.accounts.delRecur('${u.esc(t.id)}')">🗑️</button></span></div>`; }).join('');
  return `<div class="card"><h3>🔁 المصاريف الثابتة · ${mkLabel(mk)} <small>${due.length ? due.length + ' لسه ماتدفعش' + (dueTotal ? ' · المستحق الثابت ' + money(dueTotal) : '') : '✅ الشهر ده كامل'}</small></h3>
    <div class="btns" style="margin:0 0 8px"><button class="btn p" onclick="O2.accounts.editRecur('')">➕ قالب جديد</button></div>
    ${list || '<div class="empty">مفيش قوالب — ضيف الإيجار والكهربا مرة واحدة وهيفضلوا يتكرروا كل شهر</div>'}
    <div class="hint">الدفع بيتسجل كمصروف عادي في office_expenses (بيظهر في المصاريف والأرباح) · مفيش تسجيل تلقائي — انت اللي بتأكد</div></div>`;
}

/* ---------- 💳↩️ فيزا مسحوبة زيادة ---------- */
function rRefunds(){
  startRefunds();
  if(!S.fLoaded) return '<div class="card"><div class="skel"></div></div>';
  const open = S.refunds.filter(x=> x.status !== 'refunded').sort((a,b)=> (b.ts||0) - (a.ts||0));
  const done = S.refunds.filter(x=> x.status === 'refunded').sort((a,b)=> (b.refundedAt||0) - (a.refundedAt||0)).slice(0, 5);
  const card = (x)=>{ const txn = (x.txns && x.txns[0]) || {}; return `<div class="row" style="cursor:default;flex-wrap:wrap"><div class="n"><b>${money(x.diff||0)} <span class="pill p-bad">● مستحق الرد</span></b><small>مسحوب ${money(x.charged||0)} على فاتورة ${money(x.invoiceTotal||0)}${x.adjustmentMode?' · ✏️ السلة اتعدّلت بعد قبول الكارت':''}${x.cause?' · '+u.esc(x.cause):''}</small><small>🏬 ${u.esc(x.branch||'—')} · 🧾 ${u.esc(x.invoiceCode||'—')} · 👤 ${u.esc(x.customerName||'')} ${x.customerPhone?'<span dir="ltr">'+u.esc(x.customerPhone)+'</span>':'<b style="color:var(--bad)">من غير رقم!</b>'}${txn.txnId?' · 💳 TXN '+u.esc(String(txn.txnId)):''} · 🧑‍💼 ${u.esc(x.employeeName||'')} · ${when(x.ts)}</small></div><span class="btns" style="margin:0;width:100%"><button class="btn g" onclick="O2.accounts.refunded('${u.esc(x.id)}')">✅ اترد فعلًا</button>${x.invoiceCode?`<button class="btn" onclick="O2.accounts.invoiceByCode('${u.esc(x.invoiceCode)}')">🧾 الفاتورة</button>`:''}</span></div>`; };
  const doneRows = done.map(x=>`<div class="row" style="cursor:default"><div class="n"><b>${money(x.diff||0)} · ${u.esc(x.branch||'')}</b><small>${u.esc(x.customerPhone||'')} · رده ${u.esc(x.refundedBy||'')} ${when(x.refundedAt)}</small></div><span class="pill p-good">✅</span></div>`).join('');
  return `<div class="card" ${open.length?'style="border:2px solid var(--bad)"':''}><h3>💳↩️ فيزا مسحوبة زيادة <small>${open.length ? open.length + ' مستحقة الرد' : 'مفيش حاجة مستحقة'}</small></h3><div class="hint" style="margin-top:0">اتسحب من كارت العميلة أكتر من الفاتورة. الرد بيتم على نفس العملية من داشبورد Paymob — مش من الدرج. بعد ما ترد فعلًا دوس «اترد».</div>${open.map(card).join('') || '<div class="empty">مفيش فروق فيزا مستحقة 🎉</div>'}${done.length?'<div class="sec">✅ اترد مؤخرًا</div>'+doneRows:''}</div>`;
}

/* ---------- 💳 الرصيد وكروت الهدايا ---------- */
function kindLabel(x){ const t = x && x.type; if(t==='gift_card') return '🎁 كارت هدية'; if(t==='change_kept') return '💵 باقي محفوظ'; if(t==='spend') return '🛍️ صرف على فاتورة'; if(t==='manual') return '✏️ ' + u.esc(x.reason||'تعديل'); return 'حركة'; }
function rCredit(){
  startCredit(); if(!S.gLoaded) setTimeout(loadGift, 0);
  if(!S.cLoaded) return '<div class="card"><div class="skel"></div></div>';
  const reqs = S.creditReqs.slice().sort((a,b)=> (b.at||0) - (a.at||0));
  let sold = 0, spent = 0, pending = 0, live = 0;
  S.giftCards.forEach(c=>{ const v = Number(c.value)||0; if(c.status==='pending'){ pending += v; return; } if(c.status==='void') return; sold += v; const rem = Number(c.remaining)||0; spent += (v - rem); live += rem; });
  const reqRows = reqs.map(r=>`<div class="row" style="cursor:default;flex-wrap:wrap"><div class="n"><b>${money(r.amount)} · 📱 <span dir="ltr">${u.esc(r.phone)}</span></b><small>${u.esc(r.reason||'')} · ${u.esc(r.branch||'')} · طلبتها ${u.esc(r.byName||'—')} · ${when(r.at)}</small></div><span class="btns" style="margin:0;width:100%"><button class="btn g" onclick="O2.accounts.credit('${u.esc(r.id)}','approved')">✅ وافق</button><button class="btn r" onclick="O2.accounts.credit('${u.esc(r.id)}','rejected')">✖ ارفض</button></span></div>`).join('');
  const led = S.ledger.slice(0, 12).map(x=>{ const a = Number(x.amount)||0; return `<div class="row" style="cursor:default"><div class="n"><b>${kindLabel(x)}</b><small><span dir="ltr">${u.esc(x.phone||'')}</span> · ${when(x.at)}</small></div><b class="money ${a<0?'dn':'up'}">${a<0?'−':'+'}${u.n0(Math.abs(a))}</b></div>`; }).join('');
  return `<div class="card"><h3>📝 طلبات رصيد مستنية موافقتك <small>${reqs.length}</small></h3>${reqs.length?'<div class="hint" style="margin-top:0">دي فلوس هتتضاف من العدم — راجعها كويس قبل ما توافق. الموافقة بتتم عن طريق السيرفر (مفيش كتابة رصيد من هنا).</div>':''}${reqRows || '<div class="empty">مفيش طلبات مستنية ✅</div>'}${S.err.c?`<div class="hint" style="color:var(--bad)">تعذر التحميل: ${u.esc(S.err.c)}</div>`:''}</div>
    <div class="card"><h3>🎁 كروت الهدايا <small>${S.giftCards.length} كارت</small></h3>${S.gLoaded?`<div class="kpis"><div class="kpi" style="cursor:default"><small>🎁 كروت مباعة</small><b>${u.n0(sold)}</b></div><div class="kpi" style="cursor:default"><small>💳 اتصرف</small><b class="up">${u.n0(spent)}</b></div><div class="kpi" style="cursor:default"><small>📕 لسه عليك</small><b style="color:#9a6500">${u.n0(live)}</b></div></div>${pending>0?`<div class="hint">⏳ كروت اتصدرت ومااتدفعتش: ${money(pending)} — مش محسوبة عليك (مش شغّالة)</div>`:''}<div class="hint">📕 «لسه عليك» = فلوس قبضتها والعميلات لسه ماخدوش بضاعتها</div>${S.err.g?`<div class="hint" style="color:var(--bad)">تعذر: ${u.esc(S.err.g)}</div>`:''}`:'<div class="skel"></div>'}</div>
    <div class="card full"><h3>📒 آخر حركات الرصيد <small>آخر 12</small></h3>${S.gLoaded ? (led || '<div class="empty">لسه مفيش حركات رصيد</div>') : '<div class="skel"></div>'}</div>`;
}

/* ---------- 🧭 الشاشة ---------- */
const TABS = [ ['pl','💹 بنكسب ولا بنخسر؟'], ['merchants','🧾 التجار'], ['recurring','🔁 الثابتة'], ['refunds','💳↩️ فيزا'], ['credit','💳 الرصيد'] ];
function render(arg){
  if(arg && arg.view && TABS.some(t=> t[0]===arg.view)) tab = arg.view;
  const n = pendingCount();
  u.head('🧾 الحسابات', n ? n + ' حاجة محتاجة قرارك (رصيد · فيزا)' : 'الأرباح · التجار · المصاريف الثابتة · فيزا · الرصيد');
  const seg = `<div class="seg full" style="flex-wrap:wrap">${TABS.map(t=>{ const b = t[0]==='refunds' ? S.refunds.filter(x=> x.status !== 'refunded').length : (t[0]==='credit' ? S.creditReqs.length : 0); return `<button class="${tab===t[0]?'on':''}" onclick="O2.accounts.tab('${t[0]}')">${t[1]}${b?' <span class="pill p-bad">'+b+'</span>':''}</button>`; }).join('')}</div>`;
  const body = { pl: rPl, merchants: rMerchants, recurring: rRecurring, refunds: rRefunds, credit: rCredit }[tab] || rPl;
  return seg + body();
}

/* ---------- ☁️ نداء دالة سحابية (callable) — بدون SDK الدوال ---------- */
async function callFn(name, data){
  const app = firebase.app();
  if(app && typeof app.functions === 'function'){ const r = await app.functions('us-central1').httpsCallable(name)(data); return r && r.data; }
  // SDK الدوال مش متحمّل في Office 2 — نفس بروتوكول onCall بالظبط: POST {data} + توكن الدخول
  const cu = u.auth.currentUser; const tok = cu && typeof cu.getIdToken === 'function' ? await cu.getIdToken() : '';
  const res = await fetch(FN_BASE + name, { method:'POST', headers: Object.assign({ 'Content-Type':'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: JSON.stringify({ data }) });
  let j = null; try{ j = await res.json(); }catch(e){}
  if(!res.ok || (j && j.error)){ const er = new Error((j && j.error && j.error.message) || ('HTTP ' + res.status)); er.code = j && j.error && j.error.status; throw er; }
  return j && j.result;
}

/* ---------- ⚡ الإجراءات ---------- */
O2.accounts = {
  tab(t){ tab = t; u.render(); },
  plMonth(mk){ PL.mk = mk; u.render(); }, plBranch(b){ PL.branch = b; u.render(); },
  qg(k, v){ qg[k] = v; },
  toggle(id){ mOpen[id] = !mOpen[id]; u.render(); },
  async addMerchant(){ const name = String(prompt('اسم التاجر الجديد:')||'').trim(); if(!name) return;
    try{ await u.db.collection('office_merchants').add({ name, ts: Date.now() }); u.toast('اتضاف ✅'); }catch(e){ fail(e); } },
  async txn(mid, type){
    const m = S.merchants.find(x=> x.id===mid); if(!m) return; const o = type === 'order';
    const v = prompt((o ? '🧾 أوردر جديد' : '💵 دفعة') + ' — ' + m.name + '\nالمبلغ بالجنيه:'); if(v === null) return;
    const amount = Math.round((Number(v)||0)*100)/100; if(!(amount > 0)){ u.toast('اكتب مبلغ صحيح'); return; }
    const note = String(prompt('ملاحظة / رقم فاتورة (اختياري):')||'').trim();
    if(!confirm((o ? '🧾 أوردر' : '💵 دفعة') + ' لـ' + m.name + '\n\nالمبلغ: ' + money(amount) + '\n' + (o ? 'هيزوّد اللي عليك للتاجر' : 'هيخصم من اللي عليك — وهيتخصم لوحده من «فلوسي»') + '\n\nمتأكد؟')) return;
    try{ await u.db.collection('office_merchant_txns').add({ merchantId: mid, type, amount, note, ts: Date.now(), cashTracked: !o, cashTrackedFrom: 'office2' }); u.toast('اتسجل ✅'); }catch(e){ fail(e); }
  },
  async quickGoods(){
    const mid = qg.m; const amount = Math.round((Number(qg.a)||0)*100)/100; const note = String(qg.n||'').trim();
    if(!mid){ u.toast('اختار التاجر'); return; } if(!(amount > 0)){ u.toast('اكتب مبلغ صحيح'); return; }
    const m = S.merchants.find(x=> x.id===mid) || {};
    try{ const ref = await u.db.collection('office_merchant_txns').add({ merchantId: mid, type:'order', amount, note, ts: Date.now(), source:'office_quick_goods' });
      qg.a = ''; qg.n = ''; qg.last = { id: ref.id, amount, name: m.name || 'التاجر' }; u.toast('اتسجل ' + money(amount) + ' كتكلفة بضاعة ✅'); u.render(); }catch(e){ fail(e); }
  },
  async undoQuick(id){ if(!id) return; try{ await u.db.collection('office_merchant_txns').doc(id).delete(); qg.last = null; u.toast('↩️ اتلغى التسجيل'); u.render(); }catch(e){ fail(e); } },
  async delTxn(id){ if(!confirm('تمسح الحركة دي؟')) return; try{ await u.db.collection('office_merchant_txns').doc(id).delete(); u.toast('اتمسحت'); }catch(e){ fail(e); } },
  async delMerchant(id){
    const m = S.merchants.find(x=> x.id===id); if(!m) return; const txns = txnsOf(id); const bal = merchantBalance(txns);
    let msg = 'هتمسح التاجر «' + m.name + '» نهائيًا'; if(txns.length) msg += '\nومعاه ' + txns.length + ' حركة مسجّلة'; if(bal > 0) msg += '\n⚠️ لسه عليك ' + money(bal) + ' للتاجر ده!'; msg += '\n\nالإجراء مفيهوش رجوع. متأكد؟';
    if(!confirm(msg)) return;
    try{ for(let i = 0; i < txns.length; i += 400){ const b = u.db.batch(); txns.slice(i, i+400).forEach(t=> b.delete(u.db.collection('office_merchant_txns').doc(t.id))); await b.commit(); }
      await u.db.collection('office_merchants').doc(id).delete(); u.toast('اتمسح'); }catch(e){ fail(e); }
  },
  // 🔁 المتكرر
  editRecur(id){
    const t = S.recurring.find(x=> x.id===id) || {}; const brs = u.branches();
    u.sheet(`<h2>${id ? '✏️ تعديل القالب' : '➕ قالب مصروف متكرر'}</h2>
      <div class="sec">اسم المصروف</div><input id="rcNote" placeholder="إيجار / كهربا / نت …" value="${u.esc(t.note||'')}">
      <div class="sec">الفرع</div><select id="rcBranch"><option value="">الشركة (عام)</option>${brs.map(b=>`<option value="${u.esc(b)}" ${t.branch===b?'selected':''}>${u.esc(b)}</option>`).join('')}</select>
      <div class="sec">النوع</div><select id="rcKind"><option value="fixed" ${t.kind!=='variable'?'selected':''}>ثابت — المبلغ محفوظ (زي الإيجار)</option><option value="variable" ${t.kind==='variable'?'selected':''}>متغيّر — بيسألك المبلغ كل مرة (زي الكهربا)</option></select>
      <div class="sec">المبلغ الثابت</div><input id="rcAmount" type="number" inputmode="decimal" placeholder="المبلغ" value="${t.amount!=null?u.esc(t.amount):''}">
      <div class="btns"><button class="btn p w" onclick="O2.accounts.saveRecur('${u.esc(id||'')}')">💾 حفظ</button></div>`);
  },
  async saveRecur(id){
    const g = (k)=> document.getElementById(k); const note = String(g('rcNote').value||'').trim(); const branch = g('rcBranch').value || null; const kind = g('rcKind').value === 'variable' ? 'variable' : 'fixed'; const amount = Math.round((Number(g('rcAmount').value)||0)*100)/100;
    if(!note){ u.toast('اكتب اسم المصروف'); return; } if(kind === 'fixed' && !(amount > 0)){ u.toast('اكتب المبلغ الثابت'); return; }
    const doc = { note, branch, kind, amount: kind === 'fixed' ? amount : null };
    try{ if(id) await u.db.collection('office_recurring').doc(id).update(Object.assign({ updatedAt: Date.now() }, doc)); else await u.db.collection('office_recurring').add(Object.assign({ createdAt: Date.now() }, doc)); u.closeSheet(); u.toast('اتحفظ ✅'); }catch(e){ fail(e); }
  },
  async delRecur(id){ const t = S.recurring.find(x=> x.id===id); if(!t) return;
    if(!confirm('تمسح قالب «' + (t.note||'') + '»؟\n\nالمصاريف اللي اتسجلت منه قبل كده هتفضل زي ما هي — ده بيوقف التذكير الشهري بس.')) return;
    try{ await u.db.collection('office_recurring').doc(id).delete(); u.toast('اتمسح'); }catch(e){ fail(e); } },
  async payRecur(id){
    const t = S.recurring.find(x=> x.id===id); if(!t) return; const mk = mkOf(Date.now());
    if(recurPaid(t, mk)){ u.toast('المصروف ده اتسجل خلاص الشهر ده'); u.render(); return; }
    let amount = Number(t.amount)||0;
    if(t.kind !== 'fixed'){ const v = prompt('مبلغ ' + (t.note||'المصروف') + ' لشهر ' + mkLabel(mk) + ':'); if(v === null) return; amount = Math.round((Number(v)||0)*100)/100; }
    if(!(amount > 0)){ u.toast('اكتب مبلغ صحيح'); return; }
    if(!confirm('تسجيل دفع «' + (t.note||'مصروف') + '» ' + money(amount) + ' عن ' + mkLabel(mk) + (t.branch ? ' — ' + t.branch : '') + '؟')) return;
    if(recurPaid(t, mk)){ u.toast('المصروف ده اتسجل خلاص الشهر ده'); u.render(); return; }
    try{ await u.db.collection('office_expenses').add({ amount, note: (t.note||'مصروف') + (t.branch ? ' — ' + t.branch : ''), ts: Date.now(), month: mk, recurringId: t.id, branch: t.branch || null }); u.toast('اتسجل الدفع ✅'); }catch(e){ fail(e); }
  },
  // 💳↩️ الفيزا
  async refunded(id){
    const x = S.refunds.find(r=> r.id===id); if(!x || x.status === 'refunded') return;
    if(!confirm('تأكيد: ' + money(x.diff||0) + ' اتردوا فعلًا للعميلة من Paymob؟\n\nالزرار ده تسجيل بس — مش هو اللي بيرد الفلوس.')) return;
    try{ await u.db.collection('pos_card_refunds_due').doc(id).update({ status:'refunded', refundedAt: Date.now(), refundedBy:'office2' }); u.toast('اتسجل إنه اترد ✅'); }catch(e){ fail(e); }
  },
  async invoiceByCode(code){
    const all = u.windowSales(0); let s = all.find(x=> x.invoiceCode === code);
    if(!s){ try{ const q = await u.db.collection('pos_test_sales').where('invoiceCode','==',code).limit(1).get(); if(!q.empty){ const d = q.docs[0]; s = Object.assign({ id:d.id }, d.data()); const k = u.caiKey(u.saleMs(s)); if(!u.dayCache[k]) u.dayCache[k] = { rows:[], done:false }; u.dayCache[k].rows.push(s); } }catch(e){} }
    if(!s){ u.toast('الفاتورة مش لاقيها'); return; } u.invoiceAny(s.id);
  },
  // 💳 الرصيد — القرار من السيرفر (creditRequestDecision): مفيش كتابة رصيد ولا كتابة على الطلب من هنا
  async credit(id, decision){
    const r = S.creditReqs.find(x=> x.id===id); if(!r) return;
    const ok = decision === 'approved'
      ? confirm('توافق على إضافة ' + money(r.amount) + ' لحساب ' + r.phone + '؟\n\nالسبب: ' + (r.reason||'—') + '\nطالبها: ' + (r.byName||'—') + '\n\n⚠️ دي فلوس بتتضاف من العدم.')
      : confirm('ترفض طلب ' + money(r.amount) + ' لـ' + r.phone + '؟');
    if(!ok) return;
    try{ await callFn('creditRequestDecision', { requestId: id, decision }); u.toast(decision === 'approved' ? 'اتوافق واتضاف الرصيد ✅' : 'اترفض'); }
    catch(e){ u.toast('ماتمّتش: ' + (e && (e.message||e.code))); }
  }
};
O2.register('accounts', { icon:'🧾', title:'الحسابات', desc:'بنكسب ولا بنخسر؟ · حسابات التجار والبضاعة · المصاريف الثابتة · فيزا مسحوبة زيادة · الرصيد وكروت الهدايا', order:50, tab:'more',
  badge(){ startRefunds(); startCredit(); return pendingCount(); }, enter(arg){ startRefunds(); startCredit(); if(arg && arg.view) tab = arg.view; }, render });
})();
