/* ============================================================
   🔴 Office 2 — POS Live (منقول من Office/office.js ofLiveRender) — قراءة بس
   ------------------------------------------------------------
   office_pos_live/{branch}: الكاشير بيكتب حالته (السلة الحالية · الدفع · آخر بيع · إحصائيات اليوم) + نبضة كل 5 دقايق
   · listener واحد على المجموعة الصغيرة — بيفضل شغّال بعد أول دخول (مفيش استعلامات تانية)
   · لو آخر نبضة أقدم من 7 دقايق = الجهاز غير متصل (pill رمادي)
   ============================================================ */
(function(){
'use strict';
const u = O2.u;
const STALE_MS = 7*60*1000;
const PAY = Object.assign({}, u.PAY_AR, { salary:'راتب', gift:'كارت هدية' });
let docs = [], started = false, loaded = false, err = '';
function start(){
  if(started) return; started = true;
  u.db.collection('office_pos_live').onSnapshot(s=>{ docs = s.docs.map(d=> Object.assign({ id:d.id }, d.data())); loaded = true; err = ''; u.render(); }, e=>{ err = String(e && (e.code||e.message)); loaded = true; u.render(); });
}
function todayKey(){ return u.caiKey(Date.now()).replace(/-/g,''); }
function dayKeyOf(ms){ return u.caiKey(ms||0).replace(/-/g,''); }
function money(v){ return u.n0(v) + ' ج'; }
function payChips(obj){ return Object.keys(obj||{}).filter(k=> Math.abs(Number(obj[k])||0) > .001).map(k=> `<span class="pill p-gray" style="margin:2px">${u.esc(PAY[k]||k)} <b>${money(obj[k])}</b></span>`).join(''); }
function online(x){ return (Date.now() - (Number(x.updatedAtMs)||0)) < STALE_MS; }
function whenTs(ms){ return dayKeyOf(ms)===todayKey() ? u.hm(ms) : (u.dayName(ms) + ' ' + u.caiKey(ms).slice(5) + ' ' + u.hm(ms)); }
function card(x){
  const on = online(x); const st = (x.statsDayKey===todayKey() && x.stats) ? x.stats : {};
  const n = Number(st.salesCount)||0, gross = Number(st.grossSales)||0, net = Number(st.netSales)||0;
  const status = on ? '<span class="pill p-good">● LIVE</span>' : `<span class="pill p-gray">● غير متصل${x.updatedAtMs ? ' · آخر إشارة ' + whenTs(x.updatedAtMs) : ''}</span>`;
  const items = Array.isArray(x.cart) ? x.cart : []; const cart = items.map(c=> `<div class="row" style="cursor:default"><div class="n"><b>${u.esc(c.name||c.barcode||'')}${c.isReturn ? ' <span class="pill p-bad">مرتجع</span>' : ''}</b><small>${u.esc(c.barcode||'')} · × ${Number(c.qty)||0}</small></div><b class="money">${money((Number(c.price)||0)*(Number(c.qty)||0))}</b></div>`).join('');
  const livePays = (x.payments||[]).map(q=> `<span class="pill p-warn" style="margin:2px">${u.esc(PAY[q.method]||q.method||'')}${q.method==='visa' && q.seq ? ' ' + Number(q.seq) : ''}${q.status==='approved' ? ' ✅' : q.status==='pending' ? ' ⏳' : ''} · ${money(q.amount)}</span>`).join('');
  const last = x.lastSale || null;
  const lastHtml = last ? `<div class="alert ${Number(last.total)>=0 ? 'i' : 'w'}" style="cursor:default;flex-wrap:wrap"><span style="flex:1;min-width:0"><b>${Number(last.total)>=0 ? '✅ آخر بيع' : '↩️ آخر مرتجع'} · ${money(last.total)}</b><br><small class="tag">${whenTs(last.atMs)}${last.invoiceNo ? ' · #' + u.esc(last.invoiceNo) : ''}${(last.seller||last.employee) ? ' · ' + u.esc(last.seller||last.employee) : ''}</small><br>${payChips(last.payments)}</span></div>` : '';
  return `<div class="card"><h3>📍 ${u.esc(x.branch||x.id||'فرع')} <small>${u.esc(x.employee||'بدون موظف')}</small> ${status}</h3>
    <div class="kpis"><div class="kpi"><small>صافي النهاردة</small><b>${u.n0(net)}</b></div><div class="kpi"><small>فواتير</small><b>${n}</b></div><div class="kpi"><small>متوسط الفاتورة</small><b>${n ? u.n0(gross/n) : '—'}</b></div></div>
    ${Object.keys(st.paymentTotals||{}).length ? `<div class="hint">طرق الدفع النهاردة</div><div>${payChips(st.paymentTotals)}</div>` : ''}
    ${lastHtml}
    <div class="sec">🛒 السلة دلوقتي ${items.length ? '· ' + x.cart.length + ' صنف' : '— فاضية'}</div>${cart}${(x.cart||[]).length ? `<div class="row" style="cursor:default;border-top:2px solid var(--ink)"><div class="n"><b>إجمالي السلة</b></div><b class="money">${money(x.total)}</b></div>` : ''}${livePays ? `<div style="margin-top:4px">${livePays}</div>` : ''}
    ${Number(st.returnCount)>0 ? `<div class="hint">↩️ مرتجعات النهاردة: ${Number(st.returnCount)} · ${money(st.returnTotal)}</div>` : ''}</div>`;
}
function render(){
  start();
  const list = docs.slice().sort((a,b)=> (b.updatedAtMs||0)-(a.updatedAtMs||0));
  const live = list.filter(online).length;
  u.head('🔴 POS Live', loaded ? (live + ' فرع متصل من ' + list.length + ' · قراءة بس') : 'بيتصل بالفروع…');
  if(!loaded) return '<div class="card"><div class="skel"></div></div>';
  if(err) return `<div class="card"><b style="color:var(--bad)">تعذر تشغيل POS Live: ${u.esc(err)}</b></div>`;
  if(!list.length) return '<div class="empty">مفيش كاشير بعت حالة Live لسه</div>';
  const tk = todayKey(); let net = 0, cnt = 0, gross = 0, latest = null;
  list.forEach(x=>{ if(x.statsDayKey===tk){ const st = x.stats||{}; net += Number(st.netSales)||0; cnt += Number(st.salesCount)||0; gross += Number(st.grossSales)||0; } if(x.lastSale && dayKeyOf(x.lastSale.atMs)===tk && (!latest || Number(x.lastSale.atMs)>Number(latest.sale.atMs))) latest = { branch: x.branch||x.id, sale: x.lastSale }; });
  const sum = `<div class="card full"><h3>📊 كل الفروع النهاردة <small>${live} LIVE</small></h3><div class="kpis"><div class="kpi"><small>صافي المبيعات</small><b>${u.n0(net)}</b></div><div class="kpi"><small>فواتير البيع</small><b>${cnt}</b></div><div class="kpi"><small>متوسط الفاتورة</small><b>${cnt ? u.n0(gross/cnt) : '—'}</b></div></div>${latest ? `<div class="alert ${Number(latest.sale.total)>=0?'i':'w'}" style="cursor:default"><b>${Number(latest.sale.total)>=0 ? '✅ آخر عملية بيع' : '↩️ آخر عملية مرتجع'}</b>&nbsp;· ${u.esc(latest.branch)} · ${u.hm(latest.sale.atMs)} · <b class="money">${money(latest.sale.total)}</b></div>` : ''}</div>`;
  return sum + list.map(card).join('');
}
O2.live = {};
O2.register('live', { icon:'🔴', title:'POS Live', desc:'كل فرع دلوقتي: السلة والدفع وآخر بيع ومبيعات النهاردة · ومين متصل', order:41, tab:'more', enter(){ start(); }, render });
})();
