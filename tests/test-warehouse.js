/* 🧪 دورة المخزون · مرحلة ٢ (warehouse.js) — 23-09
   بتشغّل الكود الحقيقي: الإرسال ← الاستلام بفرق ← حسم الفرق من شاشة المخزن،
   على Firestore وهمي بيحاكي المعاملات. الشرط الأهم: الحسم مايحرّكش المخزون مرتين
   حتى لو النت قطع في النص أو اتداس مرتين، والقرار مايتغيّرش بعد ما يتسجل. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let P = 0, F = 0;
async function t(n, fn){ try{ await fn(); P++; console.log('  ✅ ' + n); }catch(e){ F++; console.log('  ❌ ' + n + ' → ' + e.message); } }
const ok = (c, m) => { if(!c) throw Error(m || 'fail'); };

/* ---------- Firestore وهمي: increment + معاملات + فشل نت اختياري ---------- */
function fakeDb(){
  const store = { pos_test_inventory: {}, pos_stock_moves: {}, pos_test_transfers: {} };
  const INC = (n) => ({ __inc: n });
  let offline = false, txRuns = 0; const failUpdates = {};
  const applyUpdate = (target, upd) => {
    Object.keys(upd).forEach(k => {
      const v = upd[k], parts = k.split('.');
      let o = target;
      for(let i = 0; i < parts.length - 1; i++){ o[parts[i]] = o[parts[i]] || {}; o = o[parts[i]]; }
      const last = parts[parts.length - 1];
      o[last] = (v && v.__inc != null) ? (Number(o[last]) || 0) + v.__inc : v;
    });
  };
  const col = (name) => ({
    doc: (id) => ({
      id,
      get: async () => { if(offline) throw new Error('Failed to get document because the client is offline'); return snap(name, id); },
      set: async (d, o) => { store[name][id] = (o && o.merge) ? Object.assign({}, store[name][id], d) : d; applyUpdate(store[name][id], d); },
      update: async (d) => {
        if(failUpdates[name] > 0){ failUpdates[name]--; throw new Error('حصل خطأ في الشبكة'); }
        // زي Firestore بالظبط: update على مستند مش موجود بترمي
        if(!store[name][id]) throw new Error('No document to update: ' + name + '/' + id);
        applyUpdate(store[name][id], d);
      }
    }),
    where: () => ({ where: function(){ return this; }, limit: () => ({ get: async () => ({ empty: true, docs: [] }) }),
                    get: async () => ({ docs: [] }) })
  });
  const snap = (c, id) => ({ id, exists: !!store[c][id], data: () => store[c][id], ref: col(c).doc(id) });
  const db = {
    collection: col,
    batch: () => ({ _w: [], update(ref, d){ this._w.push([ref, d]); }, set(ref, d){ this._w.push([ref, d]); },
                    commit: async function(){ for(const [r, d] of this._w) await r.update(d); } }),
    runTransaction: async (fn) => {
      txRuns++;
      if(offline) throw new Error('Failed to get document because the client is offline');
      const writes = [];
      const tx = {
        get: async (ref) => {
          const c = Object.keys(store).find(k => store[k] === store[k] && ref._col === k) || ref._col;
          return ref._snap ? ref._snap() : snap(ref._colName, ref.id);
        },
        set: (ref, d, o) => writes.push(() => ref.set(d, o)),
        update: (ref, d) => writes.push(() => ref.update(d))
      };
      const out = await fn(tx);
      // ذرية زي Firestore: لو أي كتابة وقعت، كل حاجة بترجع زي ما كانت
      const backup = JSON.parse(JSON.stringify(store));
      try{ for(const w of writes) await w(); }
      catch(e){ Object.keys(store).forEach(k => { store[k] = backup[k]; }); throw e; }
      return out;
    }
  };
  // نربط كل ref باسم مجموعته عشان tx.get يعرف يقرا
  const origCol = db.collection;
  db.collection = (name) => {
    const c = origCol(name);
    const origDoc = c.doc;
    c.doc = (id) => { const r = origDoc(id); r._colName = name; return r; };
    return c;
  };
  const seed = (id, map) => { store.pos_test_inventory[id] = { name: 'طرحة', barcode: '111', qtyByBranch: map || {} }; };
  return { db, store, INC, seed, setOffline: (v) => { offline = v; }, failNextUpdate: (c, n) => { failUpdates[c] = n; }, txCount: () => txRuns };
}


function loadAll(extra){
  const env = fakeDb();
  const els = {};
  const el = (id) => (els[id] = els[id] || { id, value: '', disabled: false, remove(){}, innerHTML: '', dataset: {},
    style: {}, offsetParent: {}, classList: { add(){}, remove(){}, toggle(){} }, options: [],
    addEventListener(){}, querySelector: () => null, querySelectorAll: () => [], appendChild(){}, focus(){} });
  const toasts = [];
  const win = {};
  let role = 'manager';
  const ctx = {
    db: env.db, window: win,
    TEST_INVENTORY: 'pos_test_inventory',
    BRANCHES: ['El Rehab', 'Madinaty', 'City Centre', 'Glow'],
    currentBranch: 'El Rehab',
    currentEmployee: { id: 'e1', name: 'سارة' },
    get currentEmployeeRole(){ return role; },
    branchCode: () => 'REH',
    showToast: (m, k) => toasts.push([m, k]), showScreen: () => {}, loadInventory: () => {},
    document: { getElementById: (id) => el(id), addEventListener: () => {}, activeElement: null,
                createElement: () => el('_tmp' + Math.random()), body: el('_body') },
    localStorage: { getItem: () => null, setItem: () => {} },
    firebase: { firestore: { FieldValue: { increment: env.INC } } },
    confirmForeignBranchAction: async () => true,
    renderTransfersScreen: async () => {}, loadTransfers: async () => {},
    allInventory: [{ id: 'it1', name: 'طرحة', barcode: '111' }, { id: 'it2', name: 'بيجامة', barcode: '222' }, { id: 'it9', name: 'غريبة', barcode: '999' }],
    console: { warn(){}, log(){}, error(){} }
  };
  Object.assign(ctx, extra || {});
  const names = Object.keys(ctx).filter(n => n !== 'currentEmployeeRole');
  let code = 'let currentEmployeeRole = __role();\n' + ['pos/stock-move.js', 'pos/transfers.js', 'pos/stock-count.js', 'pos/warehouse.js'].map(f => rd(f)).join('\n');
  code += '\nreturn { stockApply, sendTransfer, confirmTransfer, whResolveDiff, whPlanResolution, trCountScan, trOpenByCode, trManifestHTML,'
        + ' _setCart: (items, carrier) => { _trNewItems = items; _trCarrier = carrier; }, _docId: () => _trDocId,'
        + ' _setList: (l) => { _trList = l; }, _setRole: (r) => { currentEmployeeRole = r; }, _setBranch: (b) => { currentBranch = b; } };';
  const api = new Function('__role', ...names, code)(() => role, ...names.map(n => ctx[n]));
  return { env, api, ctx, els, el, toasts, win };
}

/* إذن اتبعت 100 ووصل منه 98 — نفس سيناريو المالك بالظبط */
async function shipped98(L){
  L.env.seed('it1', { 'El Rehab': 100 });
  L.el('trDestSel').value = 'Madinaty';
  L.api._setCart([{ id: 'it1', name: 'طرحة', barcode: '111', qty: 100 }], { id: 'c1', name: 'منى' });
  await L.api.sendTransfer();
  const id = Object.keys(L.env.store.pos_test_transfers)[0];
  const doc = L.env.store.pos_test_transfers[id];
  L.api._setList([Object.assign({ id }, doc)]);
  L.api._setBranch('Madinaty');
  L.el('trCf_0').value = '98';
  L.el('trCfNote').value = 'ناقص قطعتين';
  await L.api.confirmTransfer(id, { id: 'e7', name: 'هبة' });
  return id;
}
const Q = (L) => L.env.store.pos_test_inventory.it1.qtyByBranch;

(async () => {
  console.log('\n🔎 العد بالمسح');
  await t('كل مسحة بتزوّد سطرها — ومتعدّيش المُرسل', async () => {
    const L = loadAll();
    const items = [{ id: 'it1', name: 'طرحة', barcode: '111', qty: 2 }, { id: 'it2', name: 'بيجامة', barcode: '222', qty: 1 }];
    const c = [0, 0], inv = L.ctx.allInventory;
    ok(L.api.trCountScan(items, c, '111', inv).ok && L.api.trCountScan(items, c, '111', inv).ok, 'المسح ماعدّش');
    const over = L.api.trCountScan(items, c, '111', inv);
    ok(!over.ok && over.reason === 'over' && c[0] === 2, 'عدّى المُرسل: ' + c[0]);
    ok(L.api.trCountScan(items, c, '222', inv).ok && c[1] === 1, 'السطر التاني');
  });
  await t('🔴 قطعة مش في الإذن مبتتعدّش على صنف تاني', async () => {
    const L = loadAll();
    const items = [{ id: 'it1', name: 'طرحة', barcode: '111', qty: 5 }];
    const c = [0];
    const r = L.api.trCountScan(items, c, '999', L.ctx.allInventory);
    ok(!r.ok && r.reason === 'notInPermit' && c[0] === 0, JSON.stringify(r));
    ok(L.api.trCountScan(items, c, 'XXX', L.ctx.allInventory).reason === 'unknown', 'باركود مجهول');
  });

  console.log('\n⚖️ حسم الفروق');
  await t('الاستلام بفرق: 98 دخلوا · 2 فضلوا في الطريق والفرق مفتوح', async () => {
    const L = loadAll();
    const id = await shipped98(L);
    const q = Q(L), d = L.env.store.pos_test_transfers[id];
    ok(q['El Rehab'] === 0 && q['Madinaty'] === 98 && q['في الطريق'] === 2, JSON.stringify(q));
    ok(d.openDiffStatus === 'open' && d.openDiff[0].missing === 2, 'الفرق مش مفتوح');
  });
  await t('«اتلقت» ← القطعتين يدخلوا الفرع و«في الطريق» يرجع صفر', async () => {
    const L = loadAll();
    const id = await shipped98(L);
    await L.api.whResolveDiff(id, ['found'], '');
    const q = Q(L), d = L.env.store.pos_test_transfers[id];
    ok(q['Madinaty'] === 100 && q['في الطريق'] === 0, JSON.stringify(q));
    ok(d.openDiffStatus === 'resolved' && d.diffResolution.byName === 'سارة', 'الحسم ماتسجلش');
    ok(L.env.store.pos_stock_moves['transfer__' + id + '__resolve'], 'مفيش سطر حركة للحسم');
  });
  await t('«رجعت» ← للمرسل · «عجز» ← يخرج من المخزون خالص', async () => {
    let L = loadAll(); let id = await shipped98(L);
    await L.api.whResolveDiff(id, ['back'], '');
    ok(Q(L)['El Rehab'] === 2 && Q(L)['في الطريق'] === 0, JSON.stringify(Q(L)));
    L = loadAll(); id = await shipped98(L);
    await L.api.whResolveDiff(id, ['lost'], 'الحاملة قالت وقعت');
    const q = Q(L);
    ok(q['في الطريق'] === 0 && q['Madinaty'] === 98 && q['El Rehab'] === 0, JSON.stringify(q));
    const mv = L.env.store.pos_stock_moves['transfer__' + id + '__resolve'];
    ok(mv && mv.lines[0].to === null && /منى/.test(mv.reason), 'العجز لازم يتسجل على عهدة الحاملة');
  });
  await t('🔴 العجز من غير سبب مرفوض', async () => {
    const L = loadAll(); const id = await shipped98(L);
    let err = '';
    try{ await L.api.whResolveDiff(id, ['lost'], ''); }catch(e){ err = e.message; }
    ok(/السبب/.test(err) && Q(L)['في الطريق'] === 2, 'اتشطب من غير سبب');
  });
  await t('🔴 الحسم مرتين = حركة واحدة', async () => {
    const L = loadAll(); const id = await shipped98(L);
    await L.api.whResolveDiff(id, ['found'], '');
    let err = '';
    try{ await L.api.whResolveDiff(id, ['found'], ''); }catch(e){ err = e.message; }
    ok(/اتحسم/.test(err), 'التاني ماترفضش');
    ok(Q(L)['Madinaty'] === 100, 'اتضاف مرتين: ' + Q(L)['Madinaty']);
  });
  await t('🔴 النت قطع بعد الحركة ← الإعادة بتكمّل بنفس القرار ومبتحرّكش تاني', async () => {
    const L = loadAll(); const id = await shipped98(L);
    // القفل الأخير بس اللي بيقع (بعد ما القرار اتسجل والمخزون اتحرك)
    let fired = false;
    const origCol = L.env.db.collection;
    L.env.db.collection = (n) => {
      const c = origCol(n);
      if(n !== 'pos_test_transfers') return c;
      const od = c.doc;
      c.doc = (docId) => { const r = od(docId); const u = r.update;
        r.update = async (d) => { if(d && d.openDiffStatus === 'resolved' && !fired){ fired = true; throw new Error('حصل خطأ في الشبكة'); } return u(d); };
        return r; };
      return c;
    };
    let err = '';
    try{ await L.api.whResolveDiff(id, ['found'], ''); }catch(e){ err = e.message; }
    ok(err, 'المفروض الأولى تقع');
    ok(Q(L)['Madinaty'] === 100, 'الحركة الأولى ماحصلتش');
    // المدير رجع وغيّر رأيه — القرار المسجّل هو اللي يمشي
    const r = await L.api.whResolveDiff(id, ['back'], '');
    ok(r.resumed === true, 'ماكمّلش بالقرار المسجّل');
    const q = Q(L);
    ok(q['Madinaty'] === 100 && q['El Rehab'] === 0 && q['في الطريق'] === 0, 'حركة مزدوجة/مختلفة: ' + JSON.stringify(q));
    ok(L.env.store.pos_test_transfers[id].openDiffStatus === 'resolved', 'الفرق لسه مفتوح');
  });
  await t('🔴 الكاشير مبتحسمش — المالك أو المدير بس', async () => {
    const L = loadAll(); const id = await shipped98(L);
    L.api._setRole('cashier');
    let err = '';
    try{ await L.api.whResolveDiff(id, ['found'], ''); }catch(e){ err = e.message; }
    ok(/للمالك أو المدير/.test(err) && Q(L)['في الطريق'] === 2, 'اتحسم بصلاحية كاشير: ' + err + ' ' + JSON.stringify(Q(L)));
  });
  await t('تحويلة قديمة (قبل «في الطريق»): الحسم مبيخصمش من الطريق', () => {
    const L = loadAll();
    const old = { fromBranch: 'El Rehab', toBranch: 'Madinaty', openDiff: [{ itemId: 'it1', name: 'طرحة', missing: 3 }] };
    const f = L.api.whPlanResolution(old, ['found']);
    ok(f.length === 1 && f[0].from === null && f[0].to === 'Madinaty', JSON.stringify(f));
    ok(L.api.whPlanResolution(old, ['lost']).length === 0, 'العجز القديم عمل حركة على الفاضي');
  });
  await t('قرار ناقص = رفض قبل أي حاجة', () => {
    const L = loadAll();
    let err = '';
    try{ L.api.whPlanResolution({ code: 'X', openDiff: [{ itemId: 'it1', name: 'طرحة', missing: 1 }] }, []); }catch(e){ err = e.message; }
    ok(/اختار قرار/.test(err), 'عدّى من غير قرار');
  });

  console.log('\n📇 الإذن والكشف');
  await t('🔴 مسح إذن رايح فرع تاني مبيفتحوش', async () => {
    const L = loadAll();
    L.env.seed('it1', { 'El Rehab': 5 });
    L.el('trDestSel').value = 'Madinaty';
    L.api._setCart([{ id: 'it1', name: 'طرحة', barcode: '111', qty: 1 }], { id: 'c1', name: 'منى' });
    await L.api.sendTransfer();
    const id = Object.keys(L.env.store.pos_test_transfers)[0];
    L.api._setList([]);
    L.api._setBranch('City Centre');
    ok(await L.api.trOpenByCode(id) === false, 'فتح إذن مش بتاعه');
    ok(L.toasts.some(x => /رايح Madinaty/.test(x[0])), 'الرسالة مش واضحة');
    L.api._setBranch('Madinaty');
    ok(await L.api.trOpenByCode(id) === true, 'مافتحش الإذن الصح');
  });
  await t('🔴 القطع الزيادة بتتسجل على الإذن ومبتدخلش الرصيد', async () => {
    const L = loadAll();
    L.el('trConfirmOv')._extras = [{ code: '999', name: 'غريبة', qty: 1 }];
    const id = await shipped98(L);
    const d = L.env.store.pos_test_transfers[id];
    ok(Array.isArray(d.extras) && d.extras[0].code === '999', 'الزيادة ماتسجلتش');
    ok(!L.env.store.pos_test_inventory.it9, 'الزيادة دخلت المخزون');
  });
  await t('الكشف فيه رقم الإذن والأصناف والإجمالي والتوقيعات — ومهرّب', () => {
    const L = loadAll();
    const h = L.api.trManifestHTML({ id: 'TRX1', code: 'TRX1', fromBranch: 'المخزن', toBranch: 'Madinaty', carrierName: 'منى',
      items: [{ name: '<b>طرحة</b>', barcode: '111', qty: 7 }, { name: 'بيجامة', barcode: '222', qty: 3 }] }, '');
    ok(h.includes('TRX1') && h.includes('10') && h.includes('المستلم') && h.includes('الحاملة'), 'الكشف ناقص');
    ok(!h.includes('<b>طرحة</b>') && h.includes('&lt;b&gt;'), 'اسم الصنف مش مهرّب');
  });

  console.log('\n🏬 جهاز المخزن والربط');
  await t('🔴 جهاز المخزن مبيبعش', () => {
    const calls = [];
    const win = { resumeOrStartSale: () => calls.push('sale'), goToSale: () => calls.push('sale') };
    const L = loadAll({ window: win, currentBranch: 'المخزن' });
    win.resumeOrStartSale();
    ok(calls.length === 0 && L.toasts.some(x => /مبيبعش/.test(x[0])), 'البيع اشتغل على جهاز المخزن');
    L.api._setBranch('El Rehab');
    win.resumeOrStartSale();
    ok(calls.length === 1, 'الحارس وقّف البيع في فرع عادي');
  });
  await t('الملف متحمّل بعد transfers وstock-count وبرقم إصدار · الكاش اترفع', () => {
    const idx = rd('pos/index.html');
    const a = idx.indexOf('transfers.js'), b = idx.indexOf('stock-count.js'), c = idx.indexOf('warehouse.js?v=');
    ok(c > a && c > b, 'warehouse.js مش متحمّل أو قبل اللي بيعتمد عليهم');
    ok(idx.includes('id="warehouseScreen"') && idx.includes('id="warehouseWrap"') && /goToWarehouse\(\)/.test(idx), 'الشاشة/الزرار ناقصين');
    const m = rd('pos/sw.js').match(/pos-shell-v(\d+)/);
    ok(m && Number(m[1]) >= 733, 'الكاش ماترفعش');
  });
  await t('القاعدة الذهبية: كل الدوال المستخدمة من onclick على window', () => {
    const s = rd('pos/warehouse.js');
    ['goToWarehouse', 'renderWarehouse', 'whResolveUI', 'trPrintManifest', 'trOpenByCode', '_trCfScan'].forEach(n =>
      ok(new RegExp('window\\.' + n + '\\s*=').test(s), n + ' مش على window'));
    const tr = rd('pos/transfers.js');
    ok(/trPrintManifest\('\$\{t\.id\}'\)/.test(tr) && /id="trPermitInput"/.test(tr) && /id="trCfScan"/.test(tr), 'ربط transfers.js ناقص');
  });

  console.log(`\nالنتيجة: ${P} ناجح · ${F} فاشل`);
  if(typeof assert === 'function') assert(F === 0, 'test-warehouse: ' + F + ' فحص فشل');
  else if(F) process.exitCode = 1;
})();
