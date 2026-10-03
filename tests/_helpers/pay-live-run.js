// مساعد: بيشغّل pos/pay-live.js الحقيقي بـDOM وFirestore وهميين (async)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..', '..');
const out = { writes: [], ring: [], calls: [] };
function el(){ const e = { style:{ setProperty(){} }, classList:{ _s:new Set(), add(c){ this._s.add(c); }, remove(c){ this._s.delete(c); }, contains(c){ return this._s.has(c); } }, textContent:'', innerHTML:'', className:'', appendChild(){},
  querySelector(){ return el.cache[arguments[0]] || (el.cache[arguments[0]] = el()); } }; return e; }
el.cache = {};
let docCb = null;
const fakeDb = { collection(c){ return { doc(id){ return {
  get(){ return Promise.resolve({ exists: c === 'pos_test_settings' && id.startsWith('payeta_'), data: () => ({ card:[20000, 22000, 24000] }) }); },
  set(d){ out.writes.push({ c, id, d }); return Promise.resolve(); },
  onSnapshot(cb){ docCb = cb; return () => {}; } }; } }; } };
const win = {
  currentBranch:'echarpe Madinaty',
  PayLiveCore: require(path.join(root, 'pos', 'pay-live-core.js')),
  PayRing:{ create(){ return { idle(){ out.ring.push('idle'); }, set(p){ out.ring.push(p); }, done(ok){ out.ring.push(ok ? 'OK' : 'BAD'); } }; } },
  sendToPaymobTerminal(a){ out.calls.push('send:' + a); return Promise.resolve(); },
  paymobWatch(r, a){ out.calls.push('watch:' + r); },
  paymobCancelPending(){ out.calls.push('cancel'); }
};
let _off = 0; class FDate extends Date { static now(){ return Date.now() + _off; } }
const ctx = { window: win, db: fakeDb, TEST_SETTINGS:'pos_test_settings', paymobTerminalId: () => '123', console:{ warn(){} },
  document:{ readyState:'complete', createElement: el, head:{ appendChild(){} }, body:{ appendChild(){} }, addEventListener(){} },
  setTimeout: (f, ms) => (ms > 3000 ? 0 : setTimeout(f, Math.min(ms, 20))), clearTimeout, setInterval: (f) => 0, clearInterval(){}, Date: FDate, Math, Number, String, Object, Array, Promise };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'pos', 'pay-live.js'), 'utf8'), ctx);
const mode = process.argv[2];
(async () => {
  await new Promise(r => setTimeout(r, 1600));   // تحميل المدة المعتادة
  await win.sendToPaymobTerminal(350);
  win.paymobWatch('echarpe Madinaty-1', 350);
  win.paymobWatch('echarpe Madinaty-1', 350);
  _off = 21000;   // العميلة حطّت الكارت والبنك رد بعد 21 ثانية    // نفس المرجع (إعادة محاولة) — مفيش مستمع تاني
  if(mode === 'ok') docCb({ exists:true, data: () => ({ status:'success', cardScheme:'Visa', cardLast4:'4417' }) });
  if(mode === 'bad') docCb({ exists:true, data: () => ({ status:'failed', declineReason:'51' }) });
  if(mode === 'cancel') win.paymobCancelPending();
  if(mode === 'ok') docCb({ exists:true, data: () => ({ status:'failed', declineReason:'51' }) });   // رد متأخر بعد النجاح — يتجاهل
  await new Promise(r => setTimeout(r, 50));
  out.st = (el.cache['.st'] || {}).textContent; out.sub = (el.cache['.sub'] || {}).textContent;
  process.stdout.write(JSON.stringify(out));
})();
