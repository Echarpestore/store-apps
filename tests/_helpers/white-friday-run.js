// مشغّل فرعي لـ test-white-friday-v777 — الأجزاء الـasync (الهارنس متزامن) · بيطبع JSON
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const out = { fn: {}, office: {} };
const fn = read('functions/index.js');
const p1 = fn.indexOf('const pm = docId.match'), p2 = fn.indexOf('const m = docId.match(/^catalog_');
out.fnFound = p1 > 0 && p2 > p1;
const run = new Function('docId', 'before', 'after', 'broadcastBrand', 'return (async () => {' + fn.slice(p1, p2) + ' return "next"; })();');
async function fire(docId, before, after){ const sent = []; const r = await run(docId, before, after, async (...x) => { sent.push(x); }); return { sent, r }; }
const OK = { seq: 1, day: '2026-11-26', title: 'الجمعة البيضاء في إيشارب 🤍', body: 'الحقي عروض الجمعة البيضاء من الخميس للأحد', link: './?go=wf' };
function office(opts){
  const writes = []; const els = {};
  const el = id => (els[id] = els[id] || { id, value: '', textContent: '', classList: { add(){}, remove(){} }, style: {}, set innerHTML(v){ this._h = v; }, get innerHTML(){ return this._h; }, appendChild(){}, querySelector: () => null });
  const ctx = { console, setTimeout: () => 0, clearTimeout(){}, Date: class extends Date { constructor(...a){ if(a.length) super(...a); else super(opts.now); } static now(){ return opts.now; } }, _asked: 0,
    confirm: () => { ctx._asked++; return opts.confirm !== false; },
    MutationObserver: function(){ this.observe = () => {}; },
    document: { readyState: 'complete', getElementById: id => (id === 'screen' || id === 'hTitle') ? null : ((id === 'o2Pp' && !els.o2Pp) ? null : el(id)), createElement: () => { const e = { classList: { add(){}, remove(){} }, style: {}, set innerHTML(v){}, onclick: null }; Object.defineProperty(e, 'id', { set(v){ els[v] = Object.assign(el(v), { made: true }); }, get(){ return ''; } }); return e; }, head: { appendChild(){} }, body: { appendChild(){} }, addEventListener(){} },
    firebase: { firestore: Object.assign(() => ({ collection: c => ({ doc: d => ({ onSnapshot: (cb) => { cb({ exists: !!(opts.last && opts.last[d]), data: () => (opts.last || {})[d] }); }, get: async () => ({ exists: !!(opts.last && opts.last[d]), data: () => (opts.last || {})[d] }), set: async (data, o) => { writes.push({ c, d, data, o }); } }) }) }), { FieldValue: { increment: n => ({ inc: n }) } }) } };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(read('office2/promo-push.js'), ctx);
  return { ctx, writes, els };
}
/* الـDOM الوهمي مبيفهمش innerHTML — بنقرا قيم الخانات من الـHTML اللي الشاشة رسمته فعلًا */
function hydrate(o){
  const h = String(o.els.o2PpBody && o.els.o2PpBody._h || '');
  const un = x => x.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const t = h.match(/id="ppT"[^>]*value="([^"]*)"/), b = h.match(/<textarea id="ppB"[^>]*>([^<]*)<\/textarea>/);
  o.ctx.document.getElementById('ppT').value = t ? un(t[1]) : '';
  o.ctx.document.getElementById('ppB').value = b ? un(b[1]) : '';
  return o;
}
const NOWMS = Date.UTC(2026, 10, 26, 9, 0);
(async () => {
  out.fn.ok = await fire('promo_push_echarpe', {}, OK);
  out.fn.sameSeq = await fire('promo_push_echarpe', OK, Object.assign({}, OK, { title: 'تعديل' }));
  out.fn.sameDay = await fire('promo_push_echarpe', OK, Object.assign({}, OK, { seq: 2 }));
  out.fn.nextDay = await fire('promo_push_echarpe', OK, Object.assign({}, OK, { seq: 2, day: '2026-11-27' }));
  out.fn.empty = await fire('promo_push_echarpe', {}, { seq: 1, day: 'x', title: '  ', body: 'كلام' });
  out.fn.badLink = await fire('promo_push_glow', {}, Object.assign({}, OK, { link: 'https://evil.example/x' }));
  out.fn.otherDoc = await fire('catalog_echarpe', {}, OK);
  out.fn.otherBrand = await fire('promo_push_other', {}, OK);

  let o = office({ now: NOWMS }); o.ctx.O2Promo.open(); hydrate(o); await o.ctx.O2Promo.send();
  out.office.ok = { writes: o.writes, asked: o.ctx._asked };
  o = office({ now: NOWMS, confirm: false }); o.ctx.O2Promo.open(); hydrate(o); await o.ctx.O2Promo.send();
  out.office.declined = { writes: o.writes, asked: o.ctx._asked };
  o = office({ now: NOWMS, last: { promo_push_echarpe: { day: '2026-11-26', title: 'x' } } }); o.ctx.O2Promo.open(); hydrate(o); await o.ctx.O2Promo.send();
  out.office.sentToday = { writes: o.writes, asked: o.ctx._asked };
  o = office({ now: NOWMS, last: { promo_push_echarpe: { day: '2026-11-26' } } }); o.ctx.O2Promo.open(); hydrate(o); o.ctx.O2Promo.brand('glow'); hydrate(o); await o.ctx.O2Promo.send();
  out.office.glow = { writes: o.writes, asked: o.ctx._asked };
  o = office({ now: NOWMS }); o.ctx.O2Promo.open(); hydrate(o); o.els.ppT.value = '  '; o.els.ppB.value = 'قصير'; await o.ctx.O2Promo.send();
  out.office.short = { writes: o.writes, asked: o.ctx._asked };
  const LIVE = { stories_cfg: { live_echarpe: true } };
  o = office({ now: NOWMS, last: LIVE }); o.ctx.O2Promo.open(); hydrate(o); await o.ctx.O2Promo.send();
  out.office.live = { writes: o.writes, asked: o.ctx._asked };
  o = office({ now: NOWMS, last: Object.assign({ stories_push_echarpe: { day: '2026-11-26', title: 'ستوري', ts: 5 } }, LIVE) }); o.ctx.O2Promo.open(); hydrate(o); await o.ctx.O2Promo.send();
  out.office.liveStoryToday = { writes: o.writes, asked: o.ctx._asked };
  o = office({ now: NOWMS, last: LIVE }); o.ctx.O2Promo.open(); hydrate(o); o.ctx.O2Promo.brand('glow'); hydrate(o); await o.ctx.O2Promo.send();
  out.office.liveOtherBrand = { writes: o.writes, asked: o.ctx._asked };
  process.stdout.write(JSON.stringify(out));
})().catch(e => { process.stdout.write(JSON.stringify({ crash: String(e && e.stack || e) })); });
