/* ============================================================
   💰 Office 2 — فلوسي (منقول من Office/office.js — تبويب «معايا كام»)
   ------------------------------------------------------------
   المحرك الحسابي (ofDayKeyOf … ofWealth · دورة Paymob الأسبوعية) منسوخ **زي ما هو**
   من Office القديم من غير أي تغيير في الرياضة — الشاشة بس اللي اتبنت من جديد.
   البيانات: pos_test_settings/office_cash (نقطة البداية) · office_cash_cfg (الدهب)
   · office_cash_days (تعديلات/عدّ/تجميد كل يوم) · office_paymob_settlements
   · office_cash_epochs (أرشيف نقاط البداية) + المبيعات والمصاريف والسلف والرواتب
   ودفعات التجار والمكافآت اللي الدفتر بيستهلكها (نافذة 30 يوم).
   ⚠️ عمرنا ما بنمسح office_cash_days — التعديل دايمًا set/merge.
   🥇 الدهب: جرامات وسعر يدوي بس (السعر الآلي من الإنترنت اتشال عن قصد).
   ============================================================ */
(function(){
'use strict';
const u = O2.u;
const OF_TZ = 'Africa/Cairo';
let dayCut = 6;   // الساعة الفاصلة — بتتقرا من pos_test_settings/day_cfg (نفس POS)

/* ================= المحرك — منسوخ حرفيًا من Office/office.js ================= */
function _ofShopParts(ts){
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: OF_TZ, year:'numeric',
    month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false });
  const o = {};
  f.formatToParts(new Date(ts)).forEach(function(p){ o[p.type] = p.value; });
  return { y:+o.year, m:+o.month, d:+o.day, hh:+(o.hour === '24' ? '0' : o.hour), mm:+o.minute };
}
function _ofOffsetMs(ts){
  const p = _ofShopParts(ts);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - (Math.floor(ts / 60000) * 60000);
}
function ofBizDayRange(dateStr){
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 12, 0);
  const off = _ofOffsetMs(guess);
  const start = Date.UTC(y, m - 1, d, dayCut, 0) - off;
  return { start: start, end: start + 24 * 3600 * 1000 };
}
function _saleMs(x){ return u.saleMs(x); }
function _ohTs(x){
  if(!x) return 0;
  if(x.ts) return Number(x.ts) || 0;
  if(x.paidAt) return Number(x.paidAt) || 0;
  if(x.earnedAt) return Number(x.earnedAt) || 0;
  if(x.date){ const t = Date.parse(String(x.date) + 'T12:00:00'); return isNaN(t) ? 0 : t; }
  return 0;
}
const PAYMOB_FEE_PCT = 1.94;
function paymobFeeOn(gross, pct){
  const p = (pct == null ? PAYMOB_FEE_PCT : Number(pct)) / 100;
  return Math.round((Number(gross) || 0) * p * 100) / 100;
}
function paymobGrossFromNet(net, pct){
  const p = (pct == null ? PAYMOB_FEE_PCT : Number(pct)) / 100;
  if(p >= 1) return 0;
  return Math.round(((Number(net) || 0) / (1 - p)) * 100) / 100;
}
function paymobEffectivePct(settlements, fallback){
  let g = 0, d = 0;
  (settlements || []).forEach(function(x){
    const gr = Number(x && x.gross) || 0;
    if(gr <= 0) return;
    const nt = Number(x.net) || 0;
    if(nt <= 0 || nt > gr) return;
    g += gr; d += (gr - nt);
  });
  if(g <= 0) return (fallback == null ? PAYMOB_FEE_PCT : Number(fallback));
  return Math.round((d / g) * 10000) / 100;
}
function ofDayKeyOf(ts){
  const cut = Number(dayCut) || 0;
  const p = _ofShopParts(Number(ts) || 0);
  let y = p.y, m = p.m, d = p.d;
  if(p.hh < cut){
    const back = new Date(Date.UTC(y, m - 1, d) - 86400000);
    y = back.getUTCFullYear(); m = back.getUTCMonth() + 1; d = back.getUTCDate();
  }
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
function ofDayShift(key, n){
  const [y, m, d] = String(key).split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + (Number(n) || 0) * 86400000;
  const x = new Date(t);
  return x.getUTCFullYear() + '-' + String(x.getUTCMonth() + 1).padStart(2, '0')
    + '-' + String(x.getUTCDate()).padStart(2, '0');
}
function ofDowOf(key){
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
const OF_WEEKEND_DEFAULT = [5, 6];
function ofIsWeekend(key, cfg){
  const w = (cfg && Array.isArray(cfg.weekendDays) && cfg.weekendDays.length)
    ? cfg.weekendDays : OF_WEEKEND_DEFAULT;
  return w.indexOf(ofDowOf(key)) >= 0;
}
function ofSettleDayFor(saleDayKey, cfg){
  let k = ofDayShift(String(saleDayKey), 1), guard = 0;
  while(ofDowOf(k) !== 2 && guard++ < 8) k = ofDayShift(k, 1);
  return k;
}
function ofPaymobCycleForPayout(payoutKey){
  const payout = String(payoutKey);
  return { payout:payout, start:ofDayShift(payout,-7), end:ofDayShift(payout,-1) };
}
function ofCollectDays(data, fromKey, toKey){
  const days = {};
  const touch = function(k){
    if(!k || k < fromKey || k > toKey) return null;
    if(!days[k]) days[k] = { key:k, cashSales:0, visaSales:0, expenses:0,
      supplierPayments:0, salaries:0, advances:0, rewards:0, pmActual:0, pmGross:0,
      gcSold:0, gcSpent:0 };
    return days[k];
  };
  for(let k = fromKey; k <= toKey; k = ofDayShift(k, 1)) touch(k);
  (data.sales || []).forEach(function(s){
    const r = touch(ofDayKeyOf(_saleMs(s)));
    if(!r) return;
    const p = s.payments || {};
    r.cashSales += Number(p.cash) || 0;
    r.visaSales += Number(p.visa) || 0;
    (s.items || []).forEach(function(it){
      if(!it) return;
      const line = Math.abs(Number(it.price) || 0) * (Number(it.qty) || 0);
      if(it.isGiftCard)    r.gcSold  += line;
      if(it.isCreditSpend) r.gcSpent += line;
    });
    if((Number(p.credit) || 0) > 0) r.gcSpent += Number(p.credit);
  });
  const bucket = function(arr, field, filter, valueOf){
    (arr || []).forEach(function(x){
      if(filter && !filter(x)) return;
      const r = touch(ofDayKeyOf(_ohTs(x)));
      if(r) r[field] += valueOf ? (Number(valueOf(x))||0) : (Number(x.amount)||0);
    });
  };
  bucket(data.expenses,   'expenses');
  bucket(data.mtxns, 'supplierPayments', function(t){
    return !!t && t.type !== 'order' && t.cashTracked === true;
  });
  bucket(data.salaryPays, 'salaries', function(p){return !!p&&(!p.status||p.status==='paid');}, function(p){return p.payoutTotal!=null?p.payoutTotal:p.amount;});
  bucket(data.advances, 'advances', function(a){return String(a&&a.source||'').indexOf('staff_order')!==0;});
  bucket(data.rewards,    'rewards', function(r){
    return !!r && (!r.status || r.status === 'approved');
  });
  (data.settlements || []).forEach(function(x){
    const r = touch(ofDayKeyOf(_ohTs(x)));
    if(!r) return;
    const net = Number(x.net) || 0;
    r.pmActual += net;
    r.pmGross  += Number(x.gross) || paymobGrossFromNet(net, x.feePct);
  });
  return days;
}
function ofPredictSettlements(days, data, cfg, lastSettledKey, todayKey){
  const pct = paymobEffectivePct(data.settlements, PAYMOB_FEE_PCT);
  const keys = Object.keys(days).sort();
  let room = 0;
  keys.forEach(function(k){
    const v = Number(days[k].visaSales) || 0;
    if(v <= 0) return;
    if(lastSettledKey && k <= lastSettledKey) return;
    room += v;
  });
  const outstanding = Math.round(room * 100) / 100;
  const out = {};
  keys.forEach(function(k){
    const v = days[k].visaSales;
    if(v <= 0) return;
    if(lastSettledKey && k <= lastSettledKey) return;
    const gross = Math.min(v, room);
    if(gross <= 0) return;
    room -= gross;
    const land = ofSettleDayFor(k, cfg);
    if(!out[land]) out[land] = { net:0, gross:0, from:[] };
    out[land].gross += gross;
    out[land].net   += Math.round(gross * (1 - pct / 100) * 100) / 100;
    out[land].from.push(k);
  });
  Object.keys(out).forEach(function(k){
    out[k].net   = Math.round(out[k].net * 100) / 100;
    out[k].gross = Math.round(out[k].gross * 100) / 100;
  });
  const fromDays = [];
  Object.keys(out).sort().forEach(function(k){ out[k].from.forEach(function(d){ fromDays.push(d); }); });
  return { byDay: out, pct: pct, outstanding: outstanding, fromDays: fromDays.sort() };
}
const OF_LEDGER_FIELDS = ['cashSales','visaSales','pmIn','expenses','supplierPayments','salaries',
                          'advances','rewards','otherIn','otherOut'];
function ofCashLedger(base, data, overrides, cfg, nowTs, aheadDays){
  cfg = cfg || {};
  const now = Number(nowTs) || Date.now();
  const openAt = Number(base && base.atMs) || 0;
  const opening = Number(base && base.amount) || 0;
  const fromKey = ofDayKeyOf(openAt);
  const todayKey = ofDayKeyOf(now);
  const ahead = Math.max(0, Number(aheadDays == null ? 5 : aheadDays));
  const toKey = ofDayShift(todayKey, ahead);
  const days = ofCollectDays(data, fromKey, toKey);
  let lastSettledKey = '';
  (data.settlements || []).forEach(function(x){
    const k = ofDayKeyOf(_ohTs(x));
    const sk = String(x && x.forDay || '') || ofDayShift(k, -1);
    if(sk > lastSettledKey) lastSettledKey = sk;
  });
  const pred = ofPredictSettlements(days, data, cfg, lastSettledKey, todayKey);
  if(cfg.predict === false) pred.byDay = {};
  const ovAll = overrides || {};
  const rows = Object.keys(days).sort().map(function(k){
    const d = days[k];
    const o = ovAll[k] || {};
    const ov = o.ov || {};
    const p = pred.byDay[k] || null;
    const fz = o.frozen || null;
    const raw = fz ? {
      cashSales: Number(fz.cashSales) || 0, visaSales: Number(fz.visaSales) || 0,
      pmIn: Number(fz.pmIn) || 0,
      expenses: Number(fz.expenses) || 0, supplierPayments:Number(fz.supplierPayments)||0,
      salaries: Number(fz.salaries) || 0,
      advances: Number(fz.advances) || 0, rewards: Number(fz.rewards) || 0,
      otherIn: 0, otherOut: 0
    } : {
      cashSales: d.cashSales, visaSales: d.visaSales,
      pmIn: d.pmActual,
      expenses: d.expenses, supplierPayments:d.supplierPayments, salaries: d.salaries,
      advances: d.advances, rewards: d.rewards,
      otherIn: 0, otherOut: 0
    };
    const val = {}, edited = {};
    OF_LEDGER_FIELDS.forEach(function(f){
      const has = Object.prototype.hasOwnProperty.call(ov, f) && ov[f] !== null && ov[f] !== '';
      val[f] = has ? (Number(ov[f]) || 0) : raw[f];
      edited[f] = has;
    });
    const showPred = !!p && val.pmIn === 0 && !edited.pmIn;
    const pmExp = showPred ? p.net : 0;
    const inConf  = val.cashSales + val.pmIn + val.otherIn;
    const outAll  = val.expenses + val.supplierPayments + val.salaries + val.advances + val.rewards + val.otherOut;
    const counted = (o.counted === 0 || o.counted) ? Number(o.counted) : null;
    return {
      key: k,
      gcSold: Math.round(d.gcSold * 100) / 100,
      gcSpent: Math.round(d.gcSpent * 100) / 100,
      frozen: !!fz,
      untrusted: !fz && k < ofDayShift(todayKey, -OF_SALES_WINDOW_DAYS),
      dayMs: ofBizDayRange(k).start,
      weekend: ofIsWeekend(k, cfg),
      future: k > todayKey,
      isToday: k === todayKey,
      raw: raw, val: val, edited: edited,
      pmExpected: pmExp,
      pmExpectedGross: showPred ? p.gross : 0,
      pmFrom: showPred ? p.from : [],
      inConf: Math.round(inConf * 100) / 100,
      out: Math.round(outAll * 100) / 100,
      net: Math.round((inConf - outAll) * 100) / 100,
      netExp: Math.round((inConf + pmExp - outAll) * 100) / 100,
      counted: counted,
      note: o.note || ''
    };
  });
  let run = opening, runExp = opening;
  let liab = Number(base && base.giftLiabilityOpening) || 0;
  rows.forEach(function(r){
    liab = Math.round((liab + r.gcSold - r.gcSpent) * 100) / 100;
    r.giftLiability = Math.max(0, liab);
    r.giftLiabilityRaw = liab;
    run += r.net; runExp += r.netExp;
    r.balance = Math.round(run * 100) / 100;
    r.balanceExp = Math.round(runExp * 100) / 100;
    if(r.counted !== null){
      r.variance = Math.round((r.counted - r.balance) * 100) / 100;
      if(cfg.carryCount !== false){
        const diff = r.counted - run;
        run = r.counted; runExp += diff;
        r.balance = Math.round(run * 100) / 100;
        r.balanceExp = Math.round(runExp * 100) / 100;
      }
    } else { r.variance = null; }
  });
  const lastRow = rows.length ? rows[rows.length - 1] : null;
  const openDayKey = ofDayKeyOf(openAt);
  const openLanded = !!lastSettledKey && lastSettledKey >= openDayKey;
  const pmOpenRaw  = Number(base && base.paymobOpening) || 0;
  return { rows: rows, opening: opening, openKey: fromKey, todayKey: todayKey,
           giftLiability: lastRow ? lastRow.giftLiability : 0,
           giftLiabilityRaw: lastRow ? lastRow.giftLiabilityRaw : 0,
           effPct: pred.pct, outstanding: pred.outstanding,
           paymobOpening: openLanded ? 0 : pmOpenRaw,
           pmPendingDays: pred.fromDays || [],
           paymobOpeningLanded: openLanded && pmOpenRaw > 0,
           now: rows.length ? rows[rows.length - 1].balance : opening };
}
const OF_FREEZE_AFTER_DAYS = 20;
const OF_SALES_WINDOW_DAYS = 30;
function ofFreezeDue(ledger, overrides, nowTs){
  const now = Number(nowTs) || Date.now();
  const todayKey = ofDayKeyOf(now);
  const cutKey = ofDayShift(todayKey, -OF_FREEZE_AFTER_DAYS);
  const floorKey = ofDayShift(todayKey, -(OF_SALES_WINDOW_DAYS - 2));
  const ov = overrides || {};
  return (ledger && ledger.rows ? ledger.rows : []).filter(function(r){
    if(r.key >= todayKey) return false;
    if(r.key > cutKey) return false;
    if(r.key < floorKey) return false;
    if(r.frozen) return false;
    if((ov[r.key] || {}).frozen) return false;
    return true;
  }).map(function(r){
    return { key: r.key, frozen: {
      cashSales: r.raw.cashSales, visaSales: r.raw.visaSales, pmIn: r.raw.pmIn,
      expenses: r.raw.expenses, supplierPayments:r.raw.supplierPayments,
      salaries: r.raw.salaries, advances: r.raw.advances, rewards: r.raw.rewards, at: now } };
  });
}
const OF_GOLD_STALE_MS = 26 * 3600 * 1000;
function ofGoldValue(cfg, nowTs){
  const g = Number(cfg && cfg.goldGrams) || 0;
  const price = Number(cfg && cfg.goldBuyPrice) || 0;
  const at = Number(cfg && cfg.goldPriceAt) || 0;
  const now = Number(nowTs) || Date.now();
  return {
    grams: g, price: price, at: at,
    stale: !at || (now - at) > OF_GOLD_STALE_MS,
    value: Math.round(g * price * 100) / 100,
    source: (cfg && cfg.goldSource) || ''
  };
}
function ofWealth(ledger, cfg, nowTs){
  const cash = ledger ? ledger.now : 0;
  const pm = (ledger ? ledger.outstanding : 0) + (ledger ? ledger.paymobOpening : 0);
  const pmNet = Math.round(pm * (1 - (ledger ? ledger.effPct : 0) / 100) * 100) / 100;
  const gold = ofGoldValue(cfg, nowTs);
  const giftLiab = Math.max(0, Number(ledger && ledger.giftLiability) || 0);
  const owned = Math.round((cash + pmNet + gold.value - giftLiab) * 100) / 100;
  return {
    cash: cash, paymobGross: Math.round(pm * 100) / 100, paymobNet: pmNet,
    gold: gold.value, goldInfo: gold,
    giftLiability: giftLiab,
    pmDayKeys: (ledger && ledger.pmPendingDays) || [],
    pmOpeningLanded: !!(ledger && ledger.paymobOpeningLanded),
    gross: Math.round((cash + pmNet + gold.value) * 100) / 100,
    total: owned
  };
}
function ofPaymobWeeklyCycles(data, todayKey){
  const pct=paymobEffectivePct((data&&data.settlements)||[],PAYMOB_FEE_PCT);
  const map={};
  (data&&data.sales||[]).forEach(function(x){
    if(!x || x.reversed || x.isReversal) return;
    const visa=Number(x.payments&&x.payments.visa)||0;
    if(visa<=0) return;
    const saleKey=ofDayKeyOf(_saleMs(x));
    const payout=ofSettleDayFor(saleKey,{});
    const c=ofPaymobCycleForPayout(payout);
    if(!map[payout]) map[payout]={ payout:payout,start:c.start,end:c.end,gross:0,pct:pct };
    map[payout].gross += visa;
  });
  const confirmed={};
  (data&&data.settlements||[]).forEach(function(x){
    const end=String(x.weeklyCycleEnd||x.forDay||'');
    if(end) confirmed[end]=x;
  });
  return Object.keys(map).sort().map(function(k){
    const c=map[k];
    c.gross=Math.round(c.gross*100)/100;
    c.expectedFee=paymobFeeOn(c.gross,pct);
    c.expectedNet=Math.round((c.gross-c.expectedFee)*100)/100;
    c.confirmed=confirmed[c.end]||null;
    c.due=!!todayKey && c.payout<=todayKey && !c.confirmed;
    c.future=!!todayKey && c.payout>todayKey;
    return c;
  });
}
function ofPaymobWeeklyDue(data,todayKey){
  return ofPaymobWeeklyCycles(data,todayKey).filter(function(c){return c.due&&c.gross>0;});
}
function ofPaymobNextCycle(data,todayKey){
  const all=ofPaymobWeeklyCycles(data,todayKey).filter(function(c){return !c.confirmed&&c.gross>0;});
  if(!all.length) return null;
  const due=all.filter(function(c){return c.due;});
  if(due.length) return due[0];
  return all[0];
}
/* ================= نهاية المحرك ================= */

const CELL = {
  cashSales: { ic:'💵', name:'كاش الفروع',  dir:1  },
  visaSales: { ic:'💳', name:'فيزا اتباعت', dir:0  },
  pmIn:      { ic:'🏦', name:'نزل من Paymob', dir:1 },
  otherIn:   { ic:'➕', name:'وارد تاني',    dir:1  },
  expenses:  { ic:'🧾', name:'مصاريف تشغيل', dir:-1 },
  supplierPayments:{ic:'📦',name:'دفعات تجار', dir:-1},
  salaries:  { ic:'💼', name:'رواتب',       dir:-1 },
  advances:  { ic:'🤝', name:'سلف',         dir:-1 },
  rewards:   { ic:'🎁', name:'مكافآت',      dir:-1 },
  otherOut:  { ic:'➖', name:'منصرف تاني',  dir:-1 }
};
const S = { base:null, cfg:{}, days:{}, settlements:[], mtxns:[], rewards:[], sales:[], docsLoaded:false, dataLoaded:false, loading:false, err:'' };
const frozenOnce = {};
let showDays = 14, openKey = '';
const money = v=> u.n0(v) + ' ج';
function dname(key){ return u.AR_DAYS[ofDowOf(key)] + ' ' + String(key).slice(8) + '/' + String(key).slice(5,7); }
function salesWindowMs(){ return ofBizDayRange(ofDayShift(ofDayKeyOf(Date.now()), -OF_SALES_WINDOW_DAYS)).start; }
function docs(d){ return d.docs.map(x=> Object.assign({ id:x.id }, x.data())); }

/* ---- التحميل: المستندات الصغيرة أولًا (البداية · الإعدادات · الساعة الفاصلة · أيام الدفتر) وبعدين بيانات النافذة ---- */
async function loadDocs(){
  const db = u.db;
  try{
    const [b, c, dc, dd] = await Promise.all([
      db.collection('pos_test_settings').doc('office_cash').get(),
      db.collection('pos_test_settings').doc('office_cash_cfg').get(),
      db.collection('pos_test_settings').doc('day_cfg').get(),
      db.collection('office_cash_days').get() ]);
    S.base = b.exists ? (b.data()||null) : null; S.cfg = c.exists ? (c.data()||{}) : {};
    const h = dc.exists ? Number((dc.data()||{}).startHour) : NaN; if(!isNaN(h) && h >= 0 && h <= 23) dayCut = h;
    const m = {}; dd.forEach(d=>{ m[d.id] = Object.assign({ id:d.id }, d.data()||{}); }); S.days = m;
    S.err = '';
  }catch(e){ S.err = String(e && (e.code||e.message)); }
  S.docsLoaded = true;
}
async function loadData(){
  const db = u.db; const since = salesWindowMs();
  try{
    const [s1, s2, mt, rw] = await Promise.all([
      db.collection('pos_test_sales').where('createdAtMs','>=',since).get(),
      db.collection('pos_test_sales').where('createdAt','>=',firebase.firestore.Timestamp.fromMillis(since)).get(),
      db.collection('office_merchant_txns').where('ts','>=',since).get(),
      db.collection('sales_rewards').where('earnedAt','>=',since).get() ]);
    const m = {}; s1.forEach(d=>{ m[d.id] = Object.assign({ id:d.id }, d.data()); }); s2.forEach(d=>{ m[d.id] = Object.assign({ id:d.id }, d.data()); });
    S.sales = Object.values(m); S.mtxns = docs(mt); S.rewards = docs(rw);
    // 🏦 التحويلات لايف — قليلة ومهمة (التأكيد الأسبوعي بيغيّر الرقم فورًا)
    db.collection('office_paymob_settlements').where('ts','>=', since - 120*u.DAY).onSnapshot(s=>{ S.settlements = docs(s); u.render(); }, ()=>{});
  }catch(e){ S.err = S.err || String(e && (e.code||e.message)); }
  S.dataLoaded = true;
}
async function start(){
  if(S.loading || S.dataLoaded) return; S.loading = true;
  await loadDocs(); u.render(); await loadData(); S.loading = false; u.render();
}
async function refreshDocs(){ await loadDocs(); u.render(); }
function data(){
  // المبيعات: نافذة الـ30 يوم المحمّلة + فواتير النهاردة وامبارح اللايف من النواة (دمج بالمعرّف)
  const m = {}; S.sales.forEach(s=>{ m[s.id] = s; }); u.D.sales.forEach(s=>{ m[s.id] = s; });
  return { sales: Object.values(m), expenses: u.D.expenses, advances: u.D.advances, salaryPays: u.D.salaryPays, mtxns: S.mtxns, rewards: S.rewards, settlements: S.settlements };
}
function ledger(ahead){ return ofCashLedger(S.base, data(), S.days, S.cfg, Date.now(), ahead == null ? 5 : ahead); }
function autoFreeze(L){
  try{
    ofFreezeDue(L, S.days, Date.now()).forEach(x=>{
      if(frozenOnce[x.key]) return; frozenOnce[x.key] = 1;
      u.db.collection('office_cash_days').doc(x.key).set({ frozen: x.frozen, updatedAt: Date.now() }, { merge:true }).catch(e=> console.warn('freeze ' + x.key, e && e.code));
    });
  }catch(e){ console.warn('autofreeze', e); }
}

/* ---- الشاشة ---- */
function rowHtml(r){
  const open = openKey === r.key; const anyEdit = Object.keys(r.edited).some(k=> r.edited[k]);
  const tags = (r.isToday ? ' <span class="pill p-good">النهاردة</span>' : '') + (r.weekend ? ' <span class="pill p-gray">إجازة بنك</span>' : '') + (anyEdit ? ' ✏️' : '') + (r.frozen ? ' <span class="pill p-gray">🧊 مقفول</span>' : '') + (r.untrusted ? ' <span class="pill p-warn">🚧 أرقام ناقصة</span>' : '') + (r.future ? ' <span class="pill p-gray">جاي</span>' : '');
  const bits = [];
  if(r.val.cashSales) bits.push('💵 ' + money(r.val.cashSales));
  if(r.val.visaSales) bits.push('💳 ' + money(r.val.visaSales));
  if(r.val.pmIn) bits.push('🏦 +' + money(r.val.pmIn));
  if(r.gcSold) bits.push('🎁 ' + money(r.gcSold));
  if(r.gcSpent) bits.push('💳 −' + money(r.gcSpent));
  if(r.out) bits.push('📤 −' + money(r.out));
  let h = `<div class="row" onclick="O2.cash.toggle('${r.key}')"><div class="n"><b>${open?'▾':'▸'} ${dname(r.key)}${tags}</b><small>${bits.join(' · ') || 'مفيش حركة'}</small>${r.pmExpected>0?`<small>🔮 متوقّع ينزل ${money(r.pmExpected)}${r.pmFrom.length?' (فيزا '+r.pmFrom.map(dname).join(' و')+')':''}</small>`:''}${(r.variance!==null && r.variance!==0)?`<small style="color:${r.variance<0?'var(--bad)':'var(--warn)'}">${r.variance<0?'🔻 عجز ':'🔺 أوفر '}${money(Math.abs(r.variance))} (عدّيت ${money(r.counted)})</small>`:''}</div><b class="money">${money(r.balance)}</b></div>`;
  if(!open) return h;
  const cells = Object.keys(CELL).map(f=>{ const m = CELL[f]; const v = r.val[f]; if(!v && !r.edited[f] && f !== 'cashSales' && f !== 'expenses') return ''; const col = m.dir < 0 ? 'var(--bad)' : (m.dir > 0 ? 'var(--good)' : 'var(--muted)');
    return `<div class="row" onclick="O2.cash.edit('${r.key}','${f}')"><div class="n"><b style="font-weight:600">${m.ic} ${m.name}${r.edited[f]?' ✏️':''}</b>${r.edited[f]?`<small>محسوب ${money(r.raw[f])}</small>`:''}</div><b class="money" style="color:${col}">${money(v)}</b></div>`; }).join('');
  return h + `<div style="padding:4px 8px 10px;border-bottom:1px solid var(--line)">${cells}
    <div class="row" style="cursor:default;border-top:2px solid var(--ink)"><div class="n"><b>الرصيد آخر اليوم</b>${r.pmExpected>0?`<small>لو التوقّع نزل: ${money(r.balanceExp)}</small>`:''}</div><b class="money">${money(r.balance)}</b></div>
    ${r.note?`<div class="hint">📝 ${u.esc(r.note)}</div>`:''}
    <div class="btns"><button class="btn p" onclick="O2.cash.count('${r.key}')">🔍 عدّيت كام؟</button><button class="btn" onclick="O2.cash.note('${r.key}')">📝 ملاحظة</button>${(anyEdit || r.counted !== null)?`<button class="btn" onclick="O2.cash.reset('${r.key}')">↩️ رجّع المحسوب</button>`:''}</div></div>`;
}
function render(){
  start();
  if(!S.docsLoaded){ u.head('💰 فلوسي', 'بيحمّل…'); return '<div class="card"><div class="skel"></div></div>'; }
  if(S.err && !S.base){ u.head('💰 فلوسي', ''); return `<div class="card"><b style="color:var(--bad)">تعذر التحميل: ${u.esc(S.err)}</b></div>`; }
  if(!S.base || !S.base.atMs){
    u.head('💰 فلوسي', 'لسه مفيش نقطة بداية');
    return `<div class="card full"><h3>حدد نقطة البداية</h3><div class="hint">أول مرة؟ خلّي «معايا كام» رقم حقيقي من البداية: اكتب السيولة المؤكدة (كاش + حساب بنكي تشغيلي)، وبعدها اللي لسه عند Paymob، وكروت الهدايا المباعة.</div><div class="btns"><button class="btn p w" onclick="O2.cash.startFresh()">🆕 ابدأ من الصفر — نقطة واضحة</button></div></div>`;
  }
  if(!S.dataLoaded){ u.head('💰 فلوسي', 'بيقرا مبيعات ومصاريف 30 يوم…'); return '<div class="card"><div class="skel"></div></div>'; }
  const now = Date.now(); const L = ledger(5); autoFreeze(L); const W = ofWealth(L, S.cfg, now); const g = W.goldInfo;
  // 🔍 جودة الرقم
  const real = L.rows.filter(r=> !r.future && r.key <= L.todayKey); const counted = real.filter(r=> r.counted !== null); const last = counted.length ? counted[counted.length-1] : null;
  let conf = '🟠 محتاج مراجعة فعلية';
  if(real.some(r=> r.untrusted)) conf = '🔴 في أيام قديمة بياناتها ناقصة';
  else if(last && last.key === L.todayKey) conf = '🟢 مراجع النهاردة';
  else if(last){ const age = Math.round((Date.parse(L.todayKey) - Date.parse(last.key))/u.DAY); conf = age <= 3 ? '🟡 آخر مراجعة من ' + age + ' يوم' : '🟠 المراجعة قديمة — ' + age + ' يوم'; }
  u.head('💰 فلوسي', conf);
  const hero = `<div class="card full"><h3>💰 معايا كام دلوقتي؟ <small>من ${dname(L.openKey)}</small></h3><div class="big money" style="font-size:34px;text-align:center;margin:6px 0">${money(L.now)}</div><div class="hint" style="text-align:center">السيولة المؤكدة بالنظام: كاش + بنك تشغيلي مسجل − المصاريف والمدفوعات. ده الرقم اللي تعتمد عليه للصرف، مش المتوقع.</div><div class="btns"><button class="btn p" onclick="O2.cash.count('${L.todayKey}')">🔍 راجع الرقم</button><button class="btn" onclick="O2.cash.addSettlement()">🏦 تحويل وصل / تصحيح</button></div></div>`;
  const pendLabel = W.pmDayKeys.length ? 'فيزا ' + W.pmDayKeys.map(dname).join(' و') : 'حسب دورة التحويل';
  const kp = `<div class="card"><h3>🧮 اللي ليك فعلًا <small>${money(W.total)}</small></h3><div class="kpis">
    <div class="kpi"><small>🏦 عند Paymob — لسه ماوصلش</small><b>${u.n0(W.paymobNet)}</b><span class="d">${u.esc(pendLabel)}</span></div>
    <div class="kpi"><small>🎁 التزامات كروت</small><b style="color:${W.giftLiability>0?'var(--bad)':'var(--good)'}">${W.giftLiability>0?'− '+u.n0(W.giftLiability):'0'}</b><span class="d">فلوس في إيدك مش بتاعتك</span></div>
    <div class="kpi" onclick="O2.cash.goldGrams()"><small>🥇 دهب</small><b>${u.n0(W.gold)}</b><span class="d">${g.grams?g.grams+' جم × '+u.n0(g.price)+(g.stale&&g.grams?' · السعر قديم':''):'مش متسجل'}</span></div>
    <div class="kpi"><small>المؤكد + Paymob + الدهب − الكروت</small><b>${u.n0(W.total)}</b></div></div>
    ${W.pmOpeningLanded?'<div class="alert w" style="cursor:default">⚠️ رصيد Paymob الافتتاحي لسه غير مؤكد — أول تحويل أسبوعي تأكده هيقفل الجزء القديم.</div>':''}
    <div class="btns"><button class="btn" onclick="O2.cash.goldGrams()">⚖️ جرامات الدهب</button><button class="btn" onclick="O2.cash.goldPrice()">✍️ سعر الجرام</button><button class="btn r" onclick="O2.cash.startFresh()">🆕 نقطة بداية جديدة</button></div></div>`;
  const c = ofPaymobNextCycle(data(), L.todayKey);
  const weekly = c ? `<div class="card"><h3>🏦 تحويل Paymob الأسبوعي <small>${c.due?'⏳ مستني تأكيدك':'التحويل الجاي'} · ${dname(c.payout)}</small></h3><div class="kpis"><div class="kpi"><small>إجمالي الفيزا</small><b>${u.n0(c.gross)}</b><span class="d">${dname(c.start)} → ${dname(c.end)}</span></div><div class="kpi"><small>المتوقع ينزل</small><b>${u.n0(c.expectedNet)}</b><span class="d">عمولة متوقعة ${u.n0(c.expectedFee)} (${c.pct}%)</span></div></div>${c.due?`<div class="btns"><button class="btn g w" onclick="O2.cash.confirmWeekly('${c.end}')">✅ أكد المبلغ اللي وصل</button></div>`:''}</div>` : '<div class="card"><h3>🏦 تحويل Paymob الأسبوعي</h3><div class="empty">مفيش فيزا مستنية تحويل</div></div>';
  const rows = L.rows.slice(-showDays).reverse().map(rowHtml).join('');
  const sheet = `<div class="card full"><h3>📒 يوم بيوم <small>اضغط اليوم تفهم أو تعدّل · الرقم = معاك آخر اليوم</small></h3>${rows || '<div class="empty">لسه مفيش حركة</div>'}${L.rows.length > showDays ? '<div class="btns"><button class="btn w" onclick="O2.cash.more()">📆 أيام أكتر</button></div>' : ''}<div class="hint">⚠️ النظام مش متصل بحساب البنك نفسه — أي حركة بنكية خارج المبيعات/المصاريف المسجلة لازم تدخلها أو تعمل مراجعة، وإلا «معايا كام» مش هيعرفها لوحده. الفيزا مش كاش: بتنزل من Paymob الثلاثاء بالصافي.</div></div>`;
  return hero + kp + weekly + sheet;
}

/* ---- الأكشنات — نفس كتابات Office القديم بالظبط ---- */
function num(v, allowZero){ const n = Math.round((Number(v)||0)*100)/100; if(!isFinite(n) || n < 0 || (!allowZero && n === 0)) return null; return n; }
async function saveDay(key, patch){ await u.db.collection('office_cash_days').doc(key).set(Object.assign({}, patch, { updatedAt: Date.now() }), { merge:true }); }
async function saveCfg(patch){ await u.db.collection('pos_test_settings').doc('office_cash_cfg').set(Object.assign({}, patch, { updatedAt: Date.now() }), { merge:true }); }
O2.cash = {
  toggle(k){ openKey = openKey === k ? '' : k; u.render(); },
  more(){ showDays += 14; u.render(); },
  async edit(key, field){
    const m = CELL[field]; if(!m) return; const r = ledger(5).rows.find(x=> x.key===key); if(!r) return;
    const v = prompt(m.ic + ' ' + m.name + ' — ' + dname(key) + '\n\nالنظام حسبها: ' + money(r.raw[field]) + '\nاكتب المبلغ الصح (سيبها فاضية عشان ترجع للمحسوب):', r.edited[field] ? String(r.val[field]) : '');
    if(v === null) return;
    try{
      const cur = (S.days[key] || {}).ov || {};
      if(String(v).trim() === ''){ const ov = Object.assign({}, cur); delete ov[field]; await saveDay(key, { ov }); }
      else {
        const n = num(v, true); if(n === null){ u.toast('رقم مش صح'); return; }
        const entry = { field, from: r.raw[field], to: n, at: Date.now(), by:'office' };
        const FV = firebase.firestore.FieldValue;
        await saveDay(key, { ov: Object.assign({}, cur, { [field]: n }), audit: (FV && FV.arrayUnion) ? FV.arrayUnion(entry) : [entry] });
      }
      u.toast('اتحفظ ✅'); await refreshDocs();
    }catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  },
  async count(key){
    const r = ledger(5).rows.find(x=> x.key===key); if(!r) return;
    const v = prompt('🔍 راجع السيولة الفعلية — ' + dname(key) + '\n\nالنظام حاسب: ' + money(r.balance) + '\nاكتب المبلغ: إجمالي السيولة المؤكدة عندك (كاش + رصيد الحساب التشغيلي).\nفاضي = امسح المراجعة:', r.counted !== null ? String(r.counted) : '');
    if(v === null) return;
    try{
      if(String(v).trim() === ''){ await saveDay(key, { counted: null }); }
      else {
        const n = num(v, true); if(n === null){ u.toast('رقم مش صح'); return; }
        const diff = Math.round((n - r.balance)*100)/100;
        if(diff !== 0 && !confirm((diff < 0 ? '🔻 عجز ' : '🔺 أوفر ') + money(Math.abs(diff)) + '\n\nالنظام حاسب ' + money(r.balance) + ' وإنت عدّيت ' + money(n) + '\n\nالفرق هيتسجّل، والأيام اللي بعده هتكمّل من ' + money(n) + '. تكمّل؟')) return;
        await saveDay(key, { counted: n, countedAt: Date.now(), countedDiff: diff, by:'office' });
      }
      u.toast('اتسجلت المراجعة ✅'); await refreshDocs();
    }catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  },
  async note(key){
    const cur = (S.days[key] || {}).note || ''; const v = prompt('📝 ملاحظة على يوم ' + dname(key) + ':', cur); if(v === null) return;
    try{ await saveDay(key, { note: String(v).trim() }); u.toast('اتحفظت ✅'); await refreshDocs(); }catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  },
  async reset(key){
    const cur = S.days[key] || {}; const hasOv = Object.keys(cur.ov || {}).length > 0; const hasCount = cur.counted === 0 || !!cur.counted;
    if(!hasOv && !hasCount){ u.toast('اليوم ده على المحسوب أصلًا'); return; }
    if(!confirm('ترجّع يوم ' + dname(key) + ' للأرقام المحسوبة؟\n\nالتعديلات اليدوية والعدّ هيتشالوا.')) return;
    try{ await saveDay(key, { ov: {}, counted: null }); u.toast('رجع للمحسوب ✅'); await refreshDocs(); }catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  },
  async addSettlement(){
    const g = prompt('من شاشة التحويل في Paymob:\n\n💠 المبلغ الإجمالي كام؟'); if(g === null) return;
    const gross = num(g); if(gross === null){ u.toast('رقم مش صح'); return; }
    const n = prompt('💚 والمبلغ الصافي اللي نزل في حسابك كام؟'); if(n === null) return;
    const net = num(n); if(net === null){ u.toast('رقم مش صح'); return; }
    if(net > gross){ u.toast('الصافي ماينفعش يبقى أكبر من الإجمالي'); return; }
    const ded = Math.round((gross - net)*100)/100; const pct = gross > 0 ? Math.round((ded/gross)*10000)/100 : 0;
    if(!confirm('إجمالي: ' + money(gross) + '\nخصومات (رسوم + تسويات): ' + money(ded) + ' (' + pct + '%)\nنزل في حسابك: ' + money(net) + '\n\nالصافي هيتضاف للكاش اللي في إيدك. تكمّل؟')) return;
    try{ await u.db.collection('office_paymob_settlements').add({ gross, net, deductions: ded, feePct: pct, ts: Date.now(), by:'office' }); u.toast('اتسجل التحويل ✅'); }
    catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  },
  async confirmWeekly(cycleEnd){
    const c = ofPaymobWeeklyCycles(data(), ofDayKeyOf(Date.now())).find(x=> x.end===cycleEnd);
    if(!c){ u.toast('مش لاقي الأسبوع ده في المبيعات المحمّلة'); return; }
    if(c.confirmed){ u.toast('الأسبوع ده متأكد بالفعل: ' + money(c.confirmed.net||0)); return; }
    const v = prompt('🏦 تحويل Paymob — الأسبوع المنتهي ' + dname(c.end) + '\n\nإجمالي مبيعات الفيزا: ' + money(c.gross) + '\nالعمولة المتوقعة (' + c.pct + '%): ' + money(c.expectedFee) + '\nالمتوقع ينزل: ' + money(c.expectedNet) + '\n\nراجع حساب البنك واكتب المبلغ الصافي اللي وصل فعلًا:', String(c.expectedNet));
    if(v === null) return;
    const net = num(v); if(net === null){ u.toast('اكتب مبلغ صحيح'); return; }
    if(net > c.gross){ u.toast('الصافي أكبر من إجمالي مبيعات الفيزا — راجع الرقم'); return; }
    const note = prompt('ملاحظة (اختياري):', '') || '';
    const ded = Math.round((c.gross - net)*100)/100; const pct = c.gross > 0 ? Math.round((ded/c.gross)*10000)/100 : 0;
    try{
      await u.db.collection('office_paymob_settlements').doc('weekly_' + c.end).set({
        weekly:true, weeklyCycleStart:c.start, weeklyCycleEnd:c.end, payoutDay:c.payout, forDay:c.end,
        gross:c.gross, net, deductions:ded, feePct:pct, expectedNet:c.expectedNet, expectedFee:c.expectedFee, expectedPct:c.pct,
        note, ts: Date.now(), by:'office_weekly_v65' }, { merge:true });
      u.toast('اتأكد التحويل ✅');
    }catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  },
  async goldGrams(){
    const cur = Number(S.cfg.goldGrams) || 0; const v = prompt('⚖️ عندك كام جرام دهب عيار ٢٤؟', cur ? String(cur) : ''); if(v === null) return;
    const n = Math.round((Number(v)||0)*1000)/1000; if(!isFinite(n) || n < 0){ u.toast('رقم مش صح'); return; }
    try{ await saveCfg({ goldGrams: n }); u.toast('اتحفظ ✅'); await refreshDocs(); }catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  },
  async goldPrice(){
    const cur = Number(S.cfg.goldBuyPrice) || 0; const v = prompt('✍️ سعر شراء جرام 24K (اللي التاجر بيشتري بيه منك)\n\nاكتب المبلغ بالجنيه:', cur ? String(cur) : ''); if(v === null) return;
    const n = num(v); if(n === null){ u.toast('رقم مش صح'); return; }
    try{ await saveCfg({ goldBuyPrice: n, goldPriceAt: Date.now(), goldSource:'يدوي · override 24h', goldAuto:false, goldManualUntil: Date.now() + 24*3600*1000 }); u.toast('اتحفظ السعر ✅'); await refreshDocs(); }
    catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  },
  async startFresh(){
    const c = prompt('💰 اكتب المبلغ: إجمالي السيولة المؤكدة عندك دلوقتي.\n\nيعني: الكاش + رصيد الحساب البنكي المخصص للشغل.\nما تدخلش فلوس Paymob اللي لسه مانزلتش — هنسألك عنها بعدين.\n\nكل حاجة قبل كده هتتنسى، والحساب هيبدأ من الرقم ده.'); if(c === null) return;
    const cash = num(c, true); if(cash === null){ u.toast('رقم مش صح'); return; }
    const p = prompt('🏦 وعند Paymob لسه ليك كام؟ (المبلغ)\n\nده مبيعات الفيزا اللي اتباعت ولسه فلوسها مانزلتش.\nلو مش عارف اكتب صفر.', '0'); if(p === null) return;
    const pmOpen = num(p, true); if(pmOpen === null){ u.toast('رقم مش صح'); return; }
    const gl = prompt('🎁 وكروت هدايا مباعة ولسه ماتصرفتش بكام؟ (المبلغ)\n\nدي فلوس قبضتها والعميلات لسه ماخدوش بضاعتها. لو مفيش اكتب صفر.', '0'); if(gl === null) return;
    const giftOpen = num(gl, true); if(giftOpen === null){ u.toast('رقم مش صح'); return; }
    if(!confirm('💰 السيولة المؤكدة: ' + money(cash) + '\n🏦 عند Paymob ولسه ماوصلش: ' + money(pmOpen) + '\n🎁 دين كروت: ' + money(giftOpen) + '\n\nالحساب هيبدأ من دلوقتي. الأيام اللي فاتت هتختفي من الشيت (البيانات نفسها مش بتتمسح). تكمّل؟')) return;
    try{
      if(S.base && S.base.atMs) await u.db.collection('office_cash_epochs').add(Object.assign({}, S.base, { closedAt: Date.now() }));
      await u.db.collection('pos_test_settings').doc('office_cash').set({ amount: cash, paymobOpening: pmOpen, giftLiabilityOpening: giftOpen, atMs: Date.now(), by:'office' }, { merge:true });
      u.toast('بدأنا من نقطة جديدة ✅'); showDays = 14; await refreshDocs(); if(!S.dataLoaded && !S.loading) start();
    }catch(e){ u.toast('تعذر: ' + (e && (e.code||e.message))); }
  }
};
O2.register('cash', { icon:'💰', title:'فلوسي', desc:'معايا كام دلوقتي؟ السيولة المؤكدة · Paymob المنتظر · الدهب · ويوم بيوم بالتعديل والمراجعة', order:61, tab:'more',
  badge(){ try{ return (S.dataLoaded && S.base && S.base.atMs) ? ofPaymobWeeklyDue(data(), ofDayKeyOf(Date.now())).length : 0; }catch(e){ return 0; } }, enter(){ start(); }, render });
})();
