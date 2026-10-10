/* ============================================================
   📊 Office 2 — التقارير (منقولة من Office/office.js #page-reports)
   ------------------------------------------------------------
   💰 مبيعات فترة (ofSales665…) · 🔥 الأكثر مبيعًا 30 يوم (topSellers · ofTopStock) ·
   📈 فرص الزيادة (growth…) · 📱 نشاط التطبيق (daily… · ratingsSummary) · 🔎 مين قيّم (renderWhoRated)
   · القراءة يوم بيوم من u.loadDay (كاش مشترك) — مفيش استعلام مفتوح على المبيعات كلها
   · العملاء بيتقروا بنافذة 14 يوم بس (createdAt / welcomeGranted_*) مش الكل زي Office القديم
   · اليوم = يوم القاهرة التقويمي (نفس صفحة الفرع في Office 2) مش ساعة القفل بتاعة Office القديم
   ============================================================ */
(function(){
'use strict';
const u = O2.u;
const DAY = u.DAY, WIN = 30;
let view = 'period';
/* ---------- 📦 نافذة 30 يوم (مرة واحدة لكل دخول) ---------- */
const win = { loading:false, loadedUntil:0, progress:0, err:'' };
function winSince(){ return u.caiDayStart(Date.now()) - (WIN-1)*DAY; }
async function load30(){
  const since = winSince(); if(win.loading || (win.loadedUntil && win.loadedUntil <= since)) return;
  win.loading = true; win.progress = 0; win.err = ''; u.render();
  try{
    const today = u.caiKey(Date.now());
    for(let d = 0; d < WIN; d++){ const k = u.caiKey(since + d*DAY + 3600000); if(k !== today) await u.loadDay(k); win.progress = d+1; if(d % 6 === 5) u.render(); }
    win.loadedUntil = since;
  }catch(e){ win.err = String(e && (e.code||e.message)); }
  win.loading = false; u.render();
}
function sales30(){ return u.windowSales(winSince()); }
function okSale(s){ return s && !s.reversed && !s.isReversal; }
function loadingCard(){ return `<div class="card full"><div class="skel"></div><div class="hint">بيقرا فواتير ${WIN} يوم… ${win.progress}/${WIN}</div></div>`; }
function brName(b){ return u.esc(String(b||'').replace('echarpe ','')); }
function bar(pct, color){ return `<span style="flex:1;height:10px;background:var(--soft);border-radius:99px;overflow:hidden"><span style="display:block;height:100%;width:${Math.max(0,Math.min(100,pct))}%;background:${color||'var(--acc)'}"></span></span>`; }
function branchSel(cur, fn, all){ return `<select onchange="O2.reports.${fn}(this.value)" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:12px;font-family:inherit;font-weight:800">${all?`<option value="">كل الفروع</option>`:''}${u.branches().map(b=>`<option value="${u.esc(b)}" ${b===cur?'selected':''}>${u.esc(b)}</option>`).join('')}</select>`; }

/* ---------- ١) 💰 مبيعات فترة ---------- */
const per = { from:'', to:'', branch:'', quick:'today', loading:false, loadedKey:'', err:'', progress:0 };
function perKeys(){ if(!per.from || !per.to || per.from > per.to) return null; const a = per.from.split('-').map(Number); let ms = u.caiStamp(a[0],a[1],a[2],12,0); const out = []; while(u.caiKey(ms) <= per.to && out.length <= 40){ out.push(u.caiKey(ms)); ms += DAY; } return out; }
function perSetQuick(kind){ const now = Date.now(); per.quick = kind; per.to = u.caiKey(now); per.from = kind==='today' ? per.to : u.caiKey(now - (Number(kind)-1)*DAY); perLoad(); }
async function perLoad(){
  const keys = perKeys(); per.err = '';
  if(!keys){ per.err = 'راجع تاريخ البداية والنهاية'; u.render(); return; }
  if(keys.length > 31){ per.err = 'أقصى فترة 31 يوم في المرة'; u.render(); return; }
  const k = per.from + '|' + per.to; if(per.loading || per.loadedKey === k) { u.render(); return; }
  per.loading = true; per.progress = 0; u.render();
  try{ const today = u.caiKey(Date.now()); for(const key of keys){ if(key !== today) await u.loadDay(key); per.progress++; if(per.progress % 6 === 0) u.render(); } per.loadedKey = k; }
  catch(e){ per.err = String(e && (e.code||e.message)); }
  per.loading = false; u.render();
}
function perRows(){ const keys = perKeys() || []; const today = u.caiKey(Date.now()); const out = []; keys.forEach(k=>{ const rows = k===today ? u.D.sales.filter(s=> u.caiKey(u.saleMs(s))===k) : ((u.dayCache[k]||{}).rows||[]); rows.forEach(s=>{ if(okSale(s) && (!per.branch || s.branch===per.branch)) out.push(s); }); }); return out; }
function rPeriod(){
  const today = u.caiKey(Date.now());
  const ctl = `<div class="card full"><div class="seg" style="margin-bottom:8px"><button class="${per.quick==='today'?'on':''}" onclick="O2.reports.quick('today')">اليوم</button><button class="${per.quick==='7'?'on':''}" onclick="O2.reports.quick('7')">7 أيام</button><button class="${per.quick==='30'?'on':''}" onclick="O2.reports.quick('30')">30 يوم</button></div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><label style="flex:1;min-width:120px;font-size:11px;font-weight:800;color:var(--sub)">من<input type="date" value="${per.from}" max="${today}" onchange="O2.reports.from(this.value)" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:10px;font-family:inherit;font-weight:800"></label><label style="flex:1;min-width:120px;font-size:11px;font-weight:800;color:var(--sub)">إلى<input type="date" value="${per.to}" max="${today}" onchange="O2.reports.to(this.value)" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:10px;font-family:inherit;font-weight:800"></label></div>
    <div style="margin-top:6px">${branchSel(per.branch, 'pBranch', true)}</div></div>`;
  if(per.err) return ctl + `<div class="card full"><div class="empty">${u.esc(per.err)}</div></div>`;
  if(per.loading || !per.loadedKey) return ctl + `<div class="card full"><div class="skel"></div><div class="hint">بيقرا فواتير الفترة… ${per.progress}/${(perKeys()||[]).length}</div></div>`;
  const rows = perRows(); const pos = rows.filter(s=> Number(s.total) >= 0); const ret = rows.filter(s=> Number(s.total) < 0);
  const total = u.sumTotal(pos), retSum = u.sumTotal(ret);
  const byBr = {}; pos.forEach(s=>{ const b = s.branch || 'غير محدد'; byBr[b] = byBr[b] || { t:0, n:0 }; byBr[b].t += Number(s.total)||0; byBr[b].n++; });
  const brs = Object.keys(byBr).sort((a,b)=> byBr[b].t - byBr[a].t);
  const byDay = {}; rows.forEach(s=>{ const k = u.caiKey(u.saleMs(s)); byDay[k] = byDay[k] || { net:0, n:0 }; byDay[k].net += Number(s.total)||0; if(Number(s.total) >= 0) byDay[k].n++; });
  const bySeller = {}; pos.forEach(s=>{ const k = s.sellerEmployeeName || s.employeeName || s.employee || s.seller || '—'; bySeller[k] = bySeller[k] || { n:0, t:0 }; bySeller[k].n++; bySeller[k].t += Number(s.total)||0; });
  const kpis = `<div class="card"><h3>💰 ${per.from===per.to ? (per.from===today ? 'النهاردة' : u.dayName(u.caiStamp(...per.from.split('-').map(Number),12,0)) + ' ' + per.from.slice(5)) : per.from.slice(5) + ' → ' + per.to.slice(5)} <small>${pos.length} فاتورة${ret.length?' · '+ret.length+' مرتجع':''}${per.branch?' · '+brName(per.branch):' · كل الفروع'}</small></h3><div class="kpis"><div class="kpi"><small>المبيعات</small><b>${u.n0(total)}</b></div><div class="kpi"><small>الفواتير</small><b>${pos.length}</b></div><div class="kpi"><small>متوسط الفاتورة</small><b>${pos.length?u.n0(total/pos.length):'—'}</b></div></div>${ret.length?`<div class="hint">مرتجعات ${u.n0(retSum)} ج · الصافي ${u.n0(total+retSum)} ج</div>`:''}</div>`;
  const brHtml = brs.map(b=>{ const share = total ? byBr[b].t/total*100 : 0; return `<div class="row" style="cursor:default"><div class="n"><b>🏬 ${u.esc(b)}</b><small>${byBr[b].n} فاتورة · ${share.toFixed(1)}%</small></div>${bar(share)}<b class="money" style="margin-inline-start:8px">${u.n0(byBr[b].t)}</b></div>`; }).join('');
  const dayHtml = Object.keys(byDay).sort().reverse().map(k=>{ const ms = u.caiStamp(...k.split('-').map(Number),12,0); return `<div class="row" style="cursor:default"><div class="n"><b>${u.dayName(ms)} ${k.slice(5)}</b><small>${byDay[k].n} فاتورة</small></div><b class="money ${byDay[k].net<0?'dn':''}">${u.n0(byDay[k].net)}</b></div>`; }).join('');
  const sellHtml = Object.entries(bySeller).sort((a,b)=> b[1].t - a[1].t).map(([k,v])=>`<div class="row" style="cursor:default"><div class="n"><b>${u.esc(k)}</b><small>${v.n} فاتورة · متوسط ${u.n0(v.t/v.n)}</small></div><b class="money">${u.n0(v.t)}</b></div>`).join('');
  if(!rows.length) return ctl + kpis + '<div class="card"><div class="empty">مفيش مبيعات في الفترة دي</div></div>';
  return ctl + kpis + `<div class="card"><h3>🏬 الفروع</h3>${brHtml || '<div class="empty">—</div>'}</div>` + u.paymentSummaryHtml(rows) + `<div class="card"><h3>📅 يوم بيوم <small>الصافي</small></h3>${dayHtml}</div><div class="card"><h3>👩‍💼 البياعات</h3>${sellHtml || '<div class="empty">—</div>'}</div>`;
}

/* ---------- ٢) 🔥 الأكثر مبيعًا 30 يوم ---------- */
let topBranch = ''; const stock = {}; const stockAt = {}; let stockBusy = false;
function topSellers(sales, branch, limit){
  const agg = {};
  (sales||[]).forEach(s=>{ if(!okSale(s) || s.branch !== branch) return; (s.items||[]).forEach(it=>{ if(!it || it.isRedemption) return; const key = String(it.barcode || it.name || ''); if(!key) return; if(!agg[key]) agg[key] = { barcode:String(it.barcode||''), name: it.name || key, pieces:0, revenue:0 }; const q = Number(it.qty)||0, sign = it.isReturn ? -1 : 1; agg[key].pieces += sign*q; agg[key].revenue += sign*q*(Number(it.price)||0); }); });
  return Object.values(agg).filter(x=> x.pieces > 0).sort((a,b)=> b.pieces - a.pieces).slice(0, limit || 10);
}
function branchQtyOf(p, br){ if(p && p.qtyByBranch) return Number(p.qtyByBranch[br]) || 0; return Number(p && p.quantity) || 0; }
function loadStock(barcodes){
  const need = (barcodes||[]).map(String).filter(b=> b && !(Date.now() - (stockAt[b]||0) < 10*60000)); if(!need.length || stockBusy) return;
  stockBusy = true; need.forEach(b=>{ stockAt[b] = Date.now(); });
  const chunks = []; for(let i = 0; i < need.length; i += 10) chunks.push(need.slice(i, i+10));
  Promise.all(chunks.map(c=> u.db.collection('pos_test_inventory').where('barcode','in',c).get())).then(snaps=>{ snaps.forEach(s=>{ s.docs.forEach(d=>{ const o = d.data()||{}; if(o.status==='merged') return; if(need.includes(String(o.barcode||''))) stock[String(o.barcode||'')] = o; }); }); stockBusy = false; u.render(); }).catch(e=>{ stockBusy = false; console.warn('top stock', e && e.code); });
}
function rTop(){
  const brs = u.branches(); topBranch = topBranch || brs[0] || '';
  const ctl = `<div class="card full">${branchSel(topBranch, 'topBranch')}<div class="hint">بعدد القطع في آخر ${WIN} يوم · ومعاه مخزون الفرع الحالي من الصنف</div></div>`;
  if(win.loading) return ctl + loadingCard();
  if(!topBranch) return ctl + '<div class="empty">مفيش فروع</div>';
  const top = topSellers(sales30(), topBranch, 10);
  if(!top.length) return ctl + `<div class="card full"><div class="empty">مفيش مبيعات متسجلة للفرع ده آخر ${WIN} يوم</div></div>`;
  loadStock(top.map(t=> t.barcode));
  return ctl + `<div class="card full"><h3>🔥 ${brName(topBranch)} <small>أعلى ${top.length}</small></h3>` + top.map((t,i)=>{ const inv = stock[String(t.barcode||'')]; const st = inv ? branchQtyOf(inv, topBranch) : null; const low = st != null && st <= 3; return `<div class="row" style="cursor:default"><div class="n"><b>${i+1}. ${u.esc(t.name)}</b><small>${t.barcode?'كود '+u.esc(t.barcode)+' · ':''}${u.n0(t.revenue)} ج${st==null?'':' · المخزون: <b style="color:'+(low?'var(--bad)':'var(--good)')+'">'+st+'</b>'+(low?' ⚠️':'')}</small></div><span class="pill p-acc">${t.pieces} قطعة</span></div>`; }).join('') + '</div>';
}

/* ---------- ٣) 📈 فرص الزيادة — نفس حسابات Office القديم ---------- */
let gxBranch = '';
function gxSales(branch){ return sales30().filter(s=> okSale(s) && s.branch===branch); }
function gxNet(s){ let n = 0; (s.items||[]).forEach(it=>{ if(!it || it.isRedemption) return; n += (it.isReturn?-1:1)*(Number(it.qty)||0)*(Number(it.price)||0); }); return n; }
function gxPieces(s){ let q = 0; (s.items||[]).forEach(it=>{ if(!it || it.isRedemption) return; q += (it.isReturn?-1:1)*(Number(it.qty)||0); }); return q; }
function growthAggregate(branch){
  const byDay = {}, byDow = {}, byHour = {}, bySeller = {}; let totalRev = 0, totalInv = 0, totalPieces = 0;
  gxSales(branch).forEach(s=>{
    const ms = u.saleMs(s); if(!ms) return; const net = gxNet(s); if(net <= 0) return;
    const dk = u.caiKey(ms), p = u.caiParts(ms); const dp = dk.split('-').map(Number); const dow = new Date(Date.UTC(dp[0], dp[1]-1, dp[2])).getUTCDay();
    byDay[dk] = byDay[dk] || { rev:0, inv:0, pieces:0 }; byDay[dk].rev += net; byDay[dk].inv++; byDay[dk].pieces += gxPieces(s);
    byDow[dow] = byDow[dow] || { rev:0, inv:0, days:{} }; byDow[dow].rev += net; byDow[dow].inv++; byDow[dow].days[dk] = 1;
    byHour[p.h] = byHour[p.h] || { rev:0, inv:0 }; byHour[p.h].rev += net; byHour[p.h].inv++;
    const sid = s.sellerEmployeeId || ''; if(sid){ bySeller[sid] = bySeller[sid] || { name: s.sellerEmployeeName || '—', rev:0, inv:0, pieces:0 }; bySeller[sid].rev += net; bySeller[sid].inv++; bySeller[sid].pieces += gxPieces(s); }
    totalRev += net; totalInv++; totalPieces += gxPieces(s);
  });
  const dayKeys = Object.keys(byDay).sort();
  return { branch, byDay, byDow, byHour, bySeller, dayKeys, totalRev, totalInv, totalPieces, avgTicket: totalInv ? totalRev/totalInv : 0, avgPerInv: totalInv ? totalPieces/totalInv : 0, daysCount: dayKeys.length };
}
function growthDowWeights(agg){ const w = {}; let sum = 0; for(let d = 0; d < 7; d++){ const e = agg.byDow[d]; const days = e ? Object.keys(e.days).length : 0; const avg = (e && days) ? e.rev/days : 0; w[d] = avg; sum += avg; } for(const k in w) w[k] = sum > 0 ? w[k]/sum : 1/7; return w; }
function growthLevers(agg){
  const keys = agg.dayKeys; if(keys.length < 8) return null; const last7 = keys.slice(-7), prev = keys.slice(0, -7);
  const roll = list=>{ let r = 0, i = 0; list.forEach(k=>{ r += agg.byDay[k].rev; i += agg.byDay[k].inv; }); return { rev:r, inv:i, days:list.length, perDay: list.length ? r/list.length : 0, invPerDay: list.length ? i/list.length : 0, ticket: i ? r/i : 0 }; };
  const a = roll(last7), b = roll(prev);
  return { last7:a, before:b, dTicketPct: b.ticket ? (a.ticket-b.ticket)/b.ticket*100 : 0, dInvPct: b.invPerDay ? (a.invPerDay-b.invPerDay)/b.invPerDay*100 : 0 };
}
function growthWeakHours(agg){ let rows = []; for(const h in agg.byHour){ const e = agg.byHour[h]; rows.push({ hour:+h, rev:e.rev, inv:e.inv, revPerDay: agg.daysCount ? e.rev/agg.daysCount : 0 }); } rows = rows.filter(r=> r.inv >= Math.max(2, agg.daysCount/3)); rows.sort((a,b)=> a.revPerDay - b.revPerDay); return rows; }
function growthPairs(branch, limit){
  const pair = {}, nameOf = {};
  gxSales(branch).forEach(s=>{ const bcs = []; (s.items||[]).forEach(it=>{ if(!it || it.isRedemption || it.isReturn) return; const bc = String(it.barcode || it.name || ''); if(!bc) return; if(!bcs.includes(bc)) bcs.push(bc); nameOf[bc] = it.name || bc; }); if(bcs.length < 2) return; bcs.sort(); for(let i = 0; i < bcs.length; i++) for(let j = i+1; j < bcs.length; j++){ const k = bcs[i] + '|' + bcs[j]; pair[k] = (pair[k]||0) + 1; } });
  return Object.keys(pair).map(k=>{ const p = k.split('|'); return { a: nameOf[p[0]]||p[0], b: nameOf[p[1]]||p[1], n: pair[k] }; }).filter(x=> x.n >= 3).sort((a,b)=> b.n - a.n).slice(0, limit || 6);
}
function growthSellers(agg){ return Object.keys(agg.bySeller).map(id=>{ const e = agg.bySeller[id]; return { id, name:e.name, rev:e.rev, inv:e.inv, ticket: e.inv ? e.rev/e.inv : 0, perInv: e.inv ? e.pieces/e.inv : 0 }; }).filter(x=> x.inv >= 5).sort((a,b)=> b.ticket - a.ticket); }
function growthUpside(agg){
  const perDay = agg.daysCount ? agg.totalRev/agg.daysCount : 0, monthly = perDay*30;
  const ss = growthSellers(agg); let lift = 0; if(ss.length >= 2){ const best = ss[0].ticket; let gain = 0; ss.slice(1).forEach(s=>{ gain += Math.max(0, best - s.ticket)*s.inv; }); lift = agg.daysCount ? gain/agg.daysCount*30 : 0; }
  return { perDay, monthly, ticketUp10: monthly*0.10, oneMoreInvPerDay: agg.avgTicket*30, bestSellerLift: lift };
}
function gxHours(h){ return (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? ' ص' : ' م'); }
function tip(t){ return `<div class="alert i" style="cursor:default;margin-top:8px">${t}</div>`; }
function rGrowth(){
  const brs = u.branches(); gxBranch = gxBranch || brs[0] || '';
  const ctl = `<div class="card full">${branchSel(gxBranch, 'gxBranch')}<div class="hint">تحليل مبيعات آخر ${WIN} يوم — فين الفلوس الضايعة وإزاي تتكسب</div></div>`;
  if(win.loading) return ctl + loadingCard();
  if(!gxBranch) return ctl + '<div class="empty">مفيش فروع</div>';
  const agg = growthAggregate(gxBranch);
  if(!agg.totalInv) return ctl + `<div class="card full"><div class="empty">مفيش مبيعات متسجلة للفرع ده آخر ${WIN} يوم</div></div>`;
  const up = growthUpside(agg), lev = growthLevers(agg), weak = growthWeakHours(agg), sellers = growthSellers(agg), pairs = growthPairs(gxBranch, 6);
  let H = `<div class="card"><h3>📊 الصورة دلوقتي <small>آخر ${agg.daysCount} يوم شغل</small></h3><div class="kpis"><div class="kpi"><small>متوسط اليوم</small><b>${u.n0(up.perDay)}</b></div><div class="kpi"><small>متوسط الفاتورة</small><b>${u.n0(agg.avgTicket)}</b></div><div class="kpi"><small>فواتير في اليوم</small><b>${(agg.totalInv/Math.max(1,agg.daysCount)).toFixed(1)}</b></div></div><div class="hint">${agg.avgPerInv.toFixed(2)} قطعة في الفاتورة · ${agg.totalInv} فاتورة · ${u.n0(agg.totalRev)} ج</div></div>`;
  if(lev){
    let diag, act;
    if(lev.dInvPct < -8 && lev.dTicketPct > -3){ diag = 'الزباين قلّت، والفاتورة زي ما هي.'; act = 'المشكلة في الزيارات مش في البيع — دور على السبب بره المحل (موسم، إعلان واقف، منافس فتح جنبك).'; }
    else if(lev.dTicketPct < -8 && lev.dInvPct > -3){ diag = 'الزباين زي ما هم، بس بيشتروا أقل.'; act = 'دي مشكلة عرض وupselling جوّه المحل — شوف قسم «بيتباعوا مع بعض» تحت واشتغل عليه مع البياعات.'; }
    else if(lev.dInvPct > 5 && lev.dTicketPct > 5){ diag = 'الاتنين بيزيدوا — الشهر ماشي كويس.'; act = 'ثبّت اللي بيحصل دلوقتي وشوف إيه اتغيّر عشان تكرّره.'; }
    else if(lev.dInvPct < -5 && lev.dTicketPct < -5){ diag = 'الاتنين نازلين مع بعض.'; act = 'ده مؤشر يستاهل وقفة — راجع المخزون (حاجات ناقصة؟) وجدول الشيفتات في الساعات القوية.'; }
    else { diag = 'الوضع مستقر — مفيش تغيّر كبير في أي رافعة.'; act = 'الزيادة هتيجي من شغل مقصود مش من الانتظار — ابدأ بأكبر فرصة تحت.'; }
    const pct = (v)=> `<span class="pill ${v>=0?'p-good':'p-bad'}">${v>=0?'▲':'▼'} ${Math.abs(v).toFixed(1)}٪</span>`;
    H += `<div class="card"><h3>🎚️ الرافعتين <small>آخر 7 أيام مقارنة باللي قبلهم</small></h3><div class="row" style="cursor:default"><div class="n"><b>متوسط الفاتورة</b><small>${u.n0(lev.before.ticket)} ← ${u.n0(lev.last7.ticket)}</small></div>${pct(lev.dTicketPct)}</div><div class="row" style="cursor:default"><div class="n"><b>عدد الفواتير في اليوم</b><small>${lev.before.invPerDay.toFixed(1)} ← ${lev.last7.invPerDay.toFixed(1)}</small></div>${pct(lev.dInvPct)}</div>${tip('<b>' + diag + '</b><br>' + act)}</div>`;
  }
  H += `<div class="card"><h3>💰 الفرصة <small>لو اتحرّكت، تجيب كام في الشهر؟</small></h3><div class="row" style="cursor:default"><div class="n"><b>متوسط الفاتورة يزيد 10٪</b><small>قطعة صغيرة زيادة مع كل فاتورة تقريبًا</small></div><b class="money up">+${u.n0(up.ticketUp10)}</b></div><div class="row" style="cursor:default"><div class="n"><b>فاتورة واحدة زيادة كل يوم</b><small>عميلة واحدة إضافية يوميًا</small></div><b class="money up">+${u.n0(up.oneMoreInvPerDay)}</b></div>${up.bestSellerLift>0?`<div class="row" style="cursor:default"><div class="n"><b>لو كل البياعات وصلوا لمتوسط أحسن واحدة</b><small>سقف واقعي — حد منهم بيحققه فعلًا دلوقتي</small></div><b class="money up">+${u.n0(up.bestSellerLift)}</b></div>`:''}<div class="hint">أرقام محسوبة من مبيعاتك إنت، مش تقديرات عامة</div></div>`;
  if(weak.length >= 3){
    const worst = weak.slice(0,3), best = weak.slice(-3).reverse();
    H += `<div class="card"><h3>🕐 الساعات <small>متوسط مبيعات الساعة في اليوم</small></h3><div class="sec">💪 أقوى ساعات</div>${best.map(r=>`<div class="row" style="cursor:default"><div class="n"><b>${gxHours(r.hour)}</b><small>${r.inv} فاتورة</small></div><b class="money">${u.n0(r.revPerDay)}</b></div>`).join('')}<div class="sec">🥱 أضعف ساعات</div>${worst.map(r=>`<div class="row" style="cursor:default"><div class="n"><b>${gxHours(r.hour)}</b><small>${r.inv} فاتورة</small></div><b class="money" style="color:var(--sub)">${u.n0(r.revPerDay)}</b></div>`).join('')}${tip('الساعات القوية = حط فيها أكتر عدد بياعات وأحسنهم. الساعات الضعيفة = وقت الترتيب والجرد والبريكات، أو جرّب فيها عرض محدود بوقت.')}</div>`;
  }
  const wts = growthDowWeights(agg); const dowRows = []; for(let d = 0; d < 7; d++){ const e = agg.byDow[d]; const days = e ? Object.keys(e.days).length : 0; dowRows.push({ d, avg: (e && days) ? e.rev/days : 0, w: wts[d], days }); }
  const maxAvg = Math.max.apply(null, dowRows.map(r=> r.avg)) || 1;
  H += `<div class="card"><h3>📅 أيام الأسبوع <small>متوسط اليوم — أساس التارجت اليومي العادل</small></h3>${dowRows.sort((a,b)=> b.avg - a.avg).map(r=>`<div class="row" style="cursor:default"><div class="n"><b>${u.AR_DAYS[r.d]}</b><small>${r.days ? Math.round(r.w*100) + '٪ من الأسبوع · ' + r.days + ' يوم' : 'مفيش شغل'}</small></div>${bar(r.avg/maxAvg*100)}<b class="money" style="margin-inline-start:8px">${u.n0(r.avg)}</b></div>`).join('')}</div>`;
  if(sellers.length >= 2){
    H += `<div class="card"><h3>👗 البياعات <small>بمتوسط الفاتورة مش بالإجمالي</small></h3>${sellers.map((s,i)=>`<div class="row" style="cursor:default"><div class="n"><b>${u.esc(s.name)}${i===0?' 🏆':''}</b><small>${s.inv} فاتورة · ${s.perInv.toFixed(2)} قطعة/فاتورة · إجمالي ${u.n0(s.rev)}</small></div><b class="money">${u.n0(s.ticket)}</b></div>`).join('')}${tip('الفرق بين الأولى والأخيرة مش موهبة — غالبًا عادات بسيطة (بتعرض حاجة تانية، بتسأل سؤال). اقعد مع الأولى واعرف بتعمل إيه بالظبط.')}</div>`;
  }
  if(pairs.length){
    H += `<div class="card"><h3>🔗 بيتباعوا مع بعض <small>من فواتيرك إنت</small></h3>${pairs.map(p=>`<div class="row" style="cursor:default"><div class="n"><b>${u.esc(p.a)} <span style="color:var(--sub)">+</span> ${u.esc(p.b)}</b></div><span class="pill p-acc">${p.n} مرة</span></div>`).join('')}${tip('اعمل منهم ورقة صغيرة عند الكاشير: «اللي بياخد ده، اعرضي عليه ده» — أسهل بكتير على البياعة من «حاولي تبيعي أكتر».')}</div>`;
  }
  return ctl + H;
}

/* ---------- ٤) 📱 نشاط التطبيق — آخر 14 يوم ---------- */
const ACT_DAYS = 14; const act = { loading:false, loaded:false, err:'', customers:[] };
async function loadCustomers(){
  if(act.loading || act.loaded) return; act.loading = true;
  const since = u.caiDayStart(Date.now()) - (ACT_DAYS-1)*DAY; const m = {};
  const put = s=>{ s.forEach(d=>{ m[d.id] = Object.assign({ _id:d.id }, d.data()); }); };
  try{
    // 📥 اتسجّل في النافذة (createdAt Timestamp) + 🎁 اتمنح مكافأة ترحيب في النافذة (ms) — تلات استعلامات محدودة بدل قراءة كل العملاء
    const [a, b, c] = await Promise.all([
      u.db.collection('pos_test_customers').where('createdAt','>=', firebase.firestore.Timestamp.fromMillis(since)).get(),
      u.db.collection('pos_test_customers').where('welcomeGranted_echarpe','>=', since).get(),
      u.db.collection('pos_test_customers').where('welcomeGranted_glow','>=', since).get() ]);
    put(a); put(b); put(c); act.customers = Object.values(m); act.loaded = true;
  }catch(e){ act.err = String(e && (e.code||e.message)); }
  act.loading = false; u.render();
}
function dayKeyOf(v){ if(v == null) return null; let ms = null; if(typeof v === 'number') ms = v; else if(v.toMillis) ms = v.toMillis(); else if(v.seconds) ms = v.seconds*1000; else { const t = new Date(v).getTime(); if(!isNaN(t)) ms = t; } return ms ? u.caiKey(ms) : null; }
function lastDays(map, n){ const out = []; const t0 = u.caiDayStart(Date.now()); for(let i = 0; i < n; i++){ const k = u.caiKey(t0 - i*DAY + 3600000); out.push({ day:k, count: map[k]||0 }); } return out; }
function dailyDownloads(customers, days){ const out = {}; (customers||[]).forEach(c=>{ if(!c) return; if(!/^(loyalty_app|glow_app)/.test(String(c.source||''))) return; const k = dayKeyOf(c.createdAt); if(k) out[k] = (out[k]||0) + 1; }); return lastDays(out, days||ACT_DAYS); }
function dailyWelcome(customers, days){ const out = {}; (customers||[]).forEach(c=>{ if(!c) return; const k = dayKeyOf(c.welcomeGranted_echarpe || c.welcomeGranted_glow); if(k) out[k] = (out[k]||0) + 1; }); return lastDays(out, days||ACT_DAYS); }
function dailyPoints(sales, days){ const pts = {}, custs = {}; (sales||[]).forEach(sl=>{ if(!okSale(sl)) return; const earned = Number(sl.loyaltyPointsEarned)||0; if(earned <= 0) return; const k = dayKeyOf(u.saleMs(sl)); if(!k) return; pts[k] = (pts[k]||0) + earned; custs[k] = custs[k] || {}; if(sl.customerPhone) custs[k][sl.customerPhone] = 1; }); const rows = lastDays(pts, days||ACT_DAYS); rows.forEach(r=>{ r.people = custs[r.day] ? Object.keys(custs[r.day]).length : 0; }); return rows; }
const RATING_MAX = 4; const FACE = { 1:'😠', 2:'🙁', 3:'🙂', 4:'😍' }; const FACE_T = { 1:'😠 وحش', 2:'🙁 عادي', 3:'🙂 كويس', 4:'😍 ممتاز' };
function ratingsSummary(entries, sinceMs){
  const out = { total:0, avg:0, dist:{1:0,2:0,3:0,4:0}, bad:0, good:0, byBranch:{} }; let sum = 0;
  (entries||[]).forEach(e=>{ if(!e) return; const r = Number(e.r); if(!(r >= 1 && r <= RATING_MAX)) return; if(sinceMs && !(Number(e.ts) >= sinceMs)) return; out.total++; sum += r; out.dist[r] = (out.dist[r]||0) + 1; if(r <= 2) out.bad++; if(r >= 4) out.good++; const b = e.branch || '—'; out.byBranch[b] = out.byBranch[b] || { n:0, sum:0, bad:0 }; out.byBranch[b].n++; out.byBranch[b].sum += r; if(r <= 2) out.byBranch[b].bad++; });
  out.avg = out.total ? +(sum/out.total).toFixed(2) : 0; Object.keys(out.byBranch).forEach(b=>{ const x = out.byBranch[b]; x.avg = x.n ? +(x.sum/x.n).toFixed(2) : 0; }); return out;
}
function dailyRatings(entries, days){ const map = {}, sums = {}; (entries||[]).forEach(e=>{ if(!e) return; const r = Number(e.r); if(!(r >= 1 && r <= 5)) return; const k = dayKeyOf(e.ts); if(!k) return; map[k] = (map[k]||0) + 1; sums[k] = (sums[k]||0) + r; }); const rows = lastDays(map, days||ACT_DAYS); rows.forEach(x=>{ x.avg = x.count ? +(sums[x.day]/x.count).toFixed(1) : 0; }); return rows; }
function miniBars(rows, unit, color){ const max = rows.reduce((m,r)=> Math.max(m, r.count), 0) || 1; return rows.map(r=> `<div style="display:flex;align-items:center;gap:8px;padding:3px 0"><span class="tag" style="min-width:42px;font-size:11px">${r.day.slice(5).replace('-','/')}</span>${bar(r.count/max*100, color)}<b class="num" style="min-width:70px;text-align:left;font-size:12px">${r.count} ${unit}${r.people != null ? ' <span style="color:var(--sub);font-weight:600">· ' + r.people + ' عميل' : ''}${r.avg ? ' <span style="color:var(--sub);font-weight:600">· ' + r.avg + '</span>' : ''}</b></div>`).join(''); }
function rActivity(){
  const ctl = `<div class="card full"><div class="hint">تحميلات التطبيق · مكافأة أول تحميل · النقط المكتسبة · التقييمات — آخر ${ACT_DAYS} يوم</div></div>`;
  if(act.err) return ctl + `<div class="card full"><b style="color:var(--bad)">تعذر تحميل العملاء: ${u.esc(act.err)}</b></div>`;
  if(act.loading || !act.loaded || win.loading) return ctl + loadingCard();
  const sum = rows=> rows.reduce((n,r)=> n + r.count, 0); const today = rows=> rows.length ? rows[0].count : 0;
  const dl = dailyDownloads(act.customers), wl = dailyWelcome(act.customers), pt = dailyPoints(sales30());
  const card = (t, rows, unit, color)=> `<div class="card"><h3>${t} <small>النهاردة ${today(rows)} · ${ACT_DAYS} يوم ${sum(rows)}</small></h3>${miniBars(rows, unit, color)}</div>`;
  const rt = dailyRatings(u.D.ratings), sm = ratingsSummary(u.D.ratings, Date.now() - 30*DAY);
  const col = r=> r >= 4 ? 'var(--good)' : (r >= 3 ? 'var(--warn)' : 'var(--bad)');
  const dist = [4,3,2,1].map(r=>{ const c = sm.dist[r]||0; const pct = sm.total ? Math.round(c/sm.total*100) : 0; return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0"><span style="min-width:74px;font-size:12px;font-weight:800;color:${col(r)}">${FACE_T[r]}</span>${bar(pct, col(r))}<b class="num" style="min-width:60px;text-align:left;font-size:12px">${c} <span style="color:var(--sub);font-weight:600">(${pct}%)</span></b></div>`; }).join('');
  const brRows = Object.keys(sm.byBranch).sort((a,b)=> sm.byBranch[b].n - sm.byBranch[a].n).map(b=>{ const x = sm.byBranch[b]; return `<div class="row" style="cursor:default"><div class="n"><b>${u.esc(b)}</b><small>${x.n} تقييم${x.bad?' · '+x.bad+' سيّئ':''}</small></div><b class="num" style="color:${col(x.avg)}">${x.avg.toFixed(2)}</b></div>`; }).join('');
  const rating = `<div class="card"><h3>⭐ تقييمات العملاء <small>آخر 30 يوم · من ${RATING_MAX}</small></h3><div class="kpis"><div class="kpi"><small>المتوسط</small><b style="color:${col(sm.avg)}">${sm.avg.toFixed(2)}</b></div><div class="kpi"><small>التقييمات</small><b>${sm.total}</b></div><div class="kpi"><small>سيّئة (1-2)</small><b style="color:${sm.bad?'var(--bad)':'var(--good)'}">${sm.bad}</b></div></div>${dist}${brRows?`<div class="sec">حسب الفرع</div>${brRows}`:''}<div class="sec">يوم بيوم</div>${miniBars(rt, 'تقييم', '#a855f7')}</div>`;
  return ctl + card('📱 تحميلات التطبيق', dl, 'تحميل', '#3b82f6') + card('🎁 مكافأة أول تحميل', wl, 'مكافأة', 'var(--warn)') + card('⭐ النقط المكتسبة', pt, 'نقطة', 'var(--good)') + rating;
}

/* ---------- ٥) 🔎 مين قيّم ---------- */
let ratFilter = 'bad', ratBranch = ''; const custName = {}; let namesBusy = false;
function ratSource(e){ return (e && (e.source === 'app_after_visit' || e.saleId)) ? 'app' : 'kiosk'; }
function ratRows(list, filter, branch){
  const rows = (list||[]).filter(e=>{ if(!e || !(Number(e.r) >= 1 && Number(e.r) <= RATING_MAX)) return false; if(branch && e.branch !== branch) return false; if(filter==='bad') return Number(e.r) <= 2; if(filter==='notes') return !!(e.note && String(e.note).trim()); if(filter==='app') return ratSource(e)==='app'; if(filter==='kiosk') return ratSource(e)==='kiosk'; return true; });
  rows.sort((a,b)=> (Number(a.r) - Number(b.r)) || (Number(b.ts) - Number(a.ts))); return rows;
}
function nameOf(e){ const ph = e.customerPhone || ''; if(e.customerName) return e.customerName; return ph && custName[ph] ? custName[ph] : ''; }
// 👤 الأسماء: مستند العميل = رقم التليفون — بنقرا الأرقام اللي ظاهرة بس (مش كل العملاء)
async function loadNames(rows){
  const phones = [...new Set(rows.map(e=> e.customerPhone).filter(p=> p && !e_has(p)))].slice(0, 60); if(!phones.length || namesBusy) return; namesBusy = true;
  try{ const docs = await Promise.all(phones.map(p=> u.db.collection('pos_test_customers').doc(String(p)).get().catch(()=> null))); docs.forEach((d,i)=>{ custName[phones[i]] = (d && d.exists && d.data() && d.data().name) || '—'; }); }catch(e){}
  namesBusy = false; u.render();
}
function e_has(p){ return Object.prototype.hasOwnProperty.call(custName, p); }
function rRated(){
  const all = u.D.ratings || []; const counts = {}; ['bad','notes','app','kiosk','all'].forEach(k=>{ counts[k] = ratRows(all, k, ratBranch).length; });
  const seg = `<div class="seg full" style="flex-wrap:wrap"><button class="${ratFilter==='bad'?'on':''}" onclick="O2.reports.ratFilter('bad')">😠 محتاج متابعة ${counts.bad}</button><button class="${ratFilter==='notes'?'on':''}" onclick="O2.reports.ratFilter('notes')">💬 كتبوا كلام ${counts.notes}</button><button class="${ratFilter==='app'?'on':''}" onclick="O2.reports.ratFilter('app')">📱 التطبيق ${counts.app}</button><button class="${ratFilter==='kiosk'?'on':''}" onclick="O2.reports.ratFilter('kiosk')">🖥️ شاشة الفرع ${counts.kiosk}</button><button class="${ratFilter==='all'?'on':''}" onclick="O2.reports.ratFilter('all')">الكل ${counts.all}</button></div>`;
  const chips = `<div class="seg full" style="flex-wrap:wrap"><button class="${!ratBranch?'on':''}" onclick="O2.reports.ratBranch('')">كل الفروع</button>${u.branches().map(b=>`<button class="${b===ratBranch?'on':''}" onclick="O2.reports.ratBranch('${u.esc(b)}')">${brName(b)}</button>`).join('')}</div>`;
  const rows = ratRows(all, ratFilter, ratBranch).slice(0, 120); loadNames(rows);
  const COL = { 1:'var(--bad)', 2:'var(--warn)', 3:'#84cc16', 4:'var(--good)' };
  const body = rows.map(e=>{ const r = Number(e.r); const ph = e.customerPhone || ''; const nm = nameOf(e); const who = ph ? `<a class="link" href="tel:${u.esc(ph)}" style="font-weight:800">${u.esc(nm && nm !== '—' ? nm : ph)}</a>${nm && nm !== '—' ? ' <span class="tag" style="direction:ltr">' + u.esc(ph) + '</span>' : ''}` : '<span style="color:var(--sub)">مجهول</span>';
    return `<div class="row" style="cursor:default;flex-wrap:wrap;border-inline-start:3px solid ${COL[r]};padding-inline-start:8px"><span style="font-size:20px">${FACE[r]}</span><div class="n"><b>${who} <span class="pill ${ratSource(e)==='app'?'p-acc':'p-gray'}">${ratSource(e)==='app'?'📱 التطبيق':'🖥️ شاشة الفرع'}</span></b><small>${brName(e.branch||'—')} · ${u.dayName(e.ts||0)} ${u.caiKey(e.ts||0).slice(5)} ${u.hm(e.ts||0)}${e.servedByEmployeeName?' · مع '+u.esc(e.servedByEmployeeName):''}</small>${e.note && String(e.note).trim() ? `<small style="white-space:pre-wrap;color:var(--ink);font-weight:600">💬 ${u.esc(e.note)}</small>` : ''}</div>${e.saleId?`<button class="btn" onclick="O2.reports.invoice('${u.esc(e.saleId)}')">🧾 الفاتورة</button>`:''}</div>`; }).join('');
  return seg + chips + `<div class="card full"><h3>🔎 مين قيّم <small>آخر 45 يوم · السيّئ الأول — دوس على الاسم تتصل</small></h3>${body || '<div class="empty">مفيش تقييمات في الفلتر ده</div>'}</div>`;
}
async function openInvoice(id){
  if(u.windowSales(0).some(s=> s.id===id)){ u.invoiceAny(id); return; }
  try{ const d = await u.db.collection('pos_test_sales').doc(id).get(); if(!d.exists){ u.toast('الفاتورة مش موجودة'); return; } const s = Object.assign({ id:d.id }, d.data()); const k = u.caiKey(u.saleMs(s)); u.dayCache[k] = u.dayCache[k] || { rows:[], done:false }; u.dayCache[k].rows.push(s); u.invoiceAny(id); }
  catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
}

/* ---------- 🖥️ الشاشة ---------- */
const TABS = [ ['period','💰 مبيعات فترة'], ['top','🔥 الأكثر مبيعًا'], ['growth','📈 فرص الزيادة'], ['activity','📱 نشاط التطبيق'], ['rated','🔎 مين قيّم'] ];
function enter(){ if(!per.from) perSetQuick('today'); setTimeout(()=>{ load30(); loadCustomers(); }, 0); }
function render(){
  u.head('📊 التقارير', win.loading ? 'بيقرا ' + WIN + ' يوم… ' + win.progress + '/' + WIN : 'مبيعات · الأكثر مبيعًا · فرص الزيادة · التطبيق · التقييمات');
  const seg = `<div class="seg full" style="flex-wrap:wrap">${TABS.map(([k,t])=>`<button class="${view===k?'on':''}" onclick="O2.reports.view('${k}')">${t}</button>`).join('')}</div>`;
  if(win.err) return seg + `<div class="card full"><b style="color:var(--bad)">تعذر التحميل: ${u.esc(win.err)}</b></div>`;
  return seg + ({ period:rPeriod, top:rTop, growth:rGrowth, activity:rActivity, rated:rRated }[view] || rPeriod)();
}
O2.reports = {
  view(v){ view = v; u.render(); },
  quick: perSetQuick, from(v){ if(!v) return; per.from = v; per.quick = ''; perLoad(); }, to(v){ if(!v) return; per.to = v; per.quick = ''; perLoad(); }, pBranch(b){ per.branch = b; u.render(); },
  topBranch(b){ topBranch = b; u.render(); }, gxBranch(b){ gxBranch = b; u.render(); },
  ratFilter(f){ ratFilter = f; u.render(); }, ratBranch(b){ ratBranch = b; u.render(); }, invoice: openInvoice
};
O2.register('reports', { icon:'📊', title:'التقارير', desc:'مبيعات أي فترة · الأكثر مبيعًا 30 يوم · فرص الزيادة · نشاط التطبيق · مين قيّم', order:20, tab:'more', enter, render });
})();
