/* 🧪 مرحلة ١ من دورة المخزون — طبقة حركة المخزون (23-09)
   بتشغّل `stockApply` و`sendTransfer` و`confirmTransfer` **الحقيقيين** على Firestore وهمي
   بيحاكي المعاملات والـincrement، وبتتأكد من الشرط الأهم: التكرار وانقطاع النت
   مايخصموش مرتين ومايستلموش مرتين. */
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
        store[name][id] = store[name][id] || {}; applyUpdate(store[name][id], d);
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
      for(const w of writes) await w();
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
  return { db, store, INC, setOffline: (v) => { offline = v; }, failNextUpdate: (c, n) => { failUpdates[c] = n; }, txCount: () => txRuns };
}

/* ---------- تحميل الكود الحقيقي في بيئة POS وهمية ---------- */
function loadPos(files, extra){
  const env = fakeDb();
  const win = {};
  const ctx = {
    db: env.db, window: win,
    TEST_INVENTORY: 'pos_test_inventory',
    BRANCHES: ['El Rehab', 'Madinaty', 'City Centre', 'Glow'],
    currentBranch: 'El Rehab',
    currentEmployee: { id: 'e1', name: 'سارة' },
    branchCode: () => 'REH',
    showToast: () => {}, showScreen: () => {}, loadInventory: () => {},
    document: { getElementById: () => null, addEventListener: () => {}, activeElement: null },
    localStorage: { getItem: () => null, setItem: () => {} },
    firebase: { firestore: { FieldValue: { increment: env.INC } } },
    console: { warn(){}, log(){}, error(){} }
  };
  Object.assign(ctx, extra || {});
  const names = Object.keys(ctx);
  let code = files.map(f => rd(f)).join('\n');
  code += '\nreturn { stockApply, stockHistory, stockMoveId, isStockPlace, WAREHOUSE, IN_TRANSIT'
        + (files.some(f => f.includes('transfers'))
            ? ', sendTransfer, confirmTransfer, _setCart: (items, carrier) => { _trNewItems = items; _trCarrier = carrier; }, _docId: () => _trDocId'
            : '') + ' };';
  const api = new Function(...names, code)(...names.map(n => ctx[n]));
  return { env, api, ctx, win };
}

const LINE = (q) => [{ itemId: 'it1', name: 'طرحة سودا', barcode: '111', qty: q, from: 'El Rehab', to: 'Madinaty' }];

(async () => {
  console.log('\n📦 طبقة الحركة');
  await t('الحركة بتخصم من مكان وتزوّد التاني وبتسيب سطر', async () => {
    const { env, api } = loadPos(['pos/stock-move.js']);
    await api.stockApply({ docType: 'transfer', docId: 'TR1', phase: 'out', reason: 'تحويل', lines: LINE(10) });
    const inv = env.store.pos_test_inventory.it1.qtyByBranch;
    ok(inv['El Rehab'] === -10 && inv['Madinaty'] === 10, JSON.stringify(inv));
    const mv = env.store.pos_stock_moves['transfer__TR1__out'];
    ok(mv && mv.lines.length === 1 && mv.byName === 'سارة' && mv.itemIds[0] === 'it1', 'السطر ناقص');
  });
  await t('🔴 نفس النداء 5 مرات = خصم واحد', async () => {
    const { env, api } = loadPos(['pos/stock-move.js']);
    for(let i = 0; i < 5; i++) await api.stockApply({ docType: 'transfer', docId: 'TR2', phase: 'out', lines: LINE(10) });
    ok(env.store.pos_test_inventory.it1.qtyByBranch['El Rehab'] === -10,
       'اتخصم ' + env.store.pos_test_inventory.it1.qtyByBranch['El Rehab']);
  });
  await t('🔴 النداء المكرر بيرجّع repeat مش خطأ', async () => {
    const { api } = loadPos(['pos/stock-move.js']);
    await api.stockApply({ docType: 'x', docId: 'D1', lines: LINE(3) });
    const r = await api.stockApply({ docType: 'x', docId: 'D1', lines: LINE(3) });
    ok(r.ok && r.repeat === true, JSON.stringify(r));
  });
  await t('مرحلتين مختلفتين على نفس الإذن = حركتين', async () => {
    const { env, api } = loadPos(['pos/stock-move.js']);
    await api.stockApply({ docType: 'transfer', docId: 'TR3', phase: 'out', lines: LINE(4) });
    await api.stockApply({ docType: 'transfer', docId: 'TR3', phase: 'in',
      lines: [{ itemId: 'it1', qty: 4, from: 'في الطريق', to: 'Madinaty' }] });
    ok(Object.keys(env.store.pos_stock_moves).length === 2, 'المرحلتين اتلغبطوا');
  });
  await t('🔴 من غير نت: الحركة بترفض برسالة واضحة ومبتكتبش حاجة', async () => {
    const { env, api } = loadPos(['pos/stock-move.js']);
    env.setOffline(true);
    let msg = '';
    try{ await api.stockApply({ docType: 'transfer', docId: 'TR4', lines: LINE(7) }); }catch(e){ msg = e.message; }
    ok(/نت/.test(msg), 'الرسالة: ' + msg);
    ok(!Object.keys(env.store.pos_stock_moves).length && !env.store.pos_test_inventory.it1, 'اتكتبت حركة وهي أوفلاين');
  });
  await t('مكان مش معروف بيترفض', async () => {
    const { api } = loadPos(['pos/stock-move.js']);
    let threw = false;
    try{ await api.stockApply({ docType: 'x', docId: 'D9', lines: [{ itemId: 'i', qty: 1, from: 'مكان وهمي', to: 'Madinaty' }] }); }
    catch(e){ threw = /مكان مش معروف/.test(e.message); }
    ok(threw, 'عدّى مكان مش في القايمة');
  });
  await t('المخزن مكان صالح زي الفرع', async () => {
    const { api } = loadPos(['pos/stock-move.js']);
    ok(api.isStockPlace(api.WAREHOUSE) && api.WAREHOUSE === 'المخزن');
  });

  console.log('\n🚚 التحويلة بتعدّي من الطبقة دي');
  function transferEnv(){
    const els = {};
    const el = (id) => (els[id] = els[id] || { id, value: '', disabled: false, remove(){}, innerHTML: '',
      style: {}, offsetParent: {}, classList: { add(){}, remove(){}, toggle(){} },
      addEventListener(){}, querySelector: () => null, querySelectorAll: () => [], appendChild(){}, focus(){} });
    const ctx = {
      document: { getElementById: (id) => el(id), addEventListener: () => {}, activeElement: null,
                  createElement: () => el('_tmp' + Math.random()), body: el('_body') },
      confirmForeignBranchAction: async () => true,
      renderTransfersScreen: async () => {}, loadTransfers: async () => {},
      _els: els, _el: el
    };
    const L = loadPos(['pos/stock-move.js', 'pos/transfers.js'], ctx);
    L.els = els; L.el = el;
    return L;
  }
  await t('🔴 الإرسال وقع بعد الخصم ← إعادة المحاولة متخصمش تاني', async () => {
    const L = transferEnv();
    L.el('trDestSel').value = 'Madinaty';
    L.api._setCart([{ id: 'it1', name: 'طرحة', barcode: '111', qty: 100 }], { id: 'c1', name: 'منى' });
    L.env.failNextUpdate('pos_test_transfers', 1);       // الشبكة بتقطع بعد الخصم
    await L.api.sendTransfer();
    const first = L.api._docId();
    ok(first, 'رقم الإذن ضاع بعد الفشل');
    ok(L.env.store.pos_test_inventory.it1.qtyByBranch['El Rehab'] === -100, 'الخصم الأول ماحصلش');
    await L.api.sendTransfer();                           // الكاشير دوست تاني
    const inv = L.env.store.pos_test_inventory.it1.qtyByBranch;
    ok(inv['El Rehab'] === -100, 'اتخصم ' + inv['El Rehab'] + ' — المفروض 100 مرة واحدة');
    ok(inv['في الطريق'] === 100, 'البضاعة مش في الطريق: ' + JSON.stringify(inv));
    ok(Object.keys(L.env.store.pos_test_transfers).length === 1, 'اتعمل أكتر من إذن');
    const tr = Object.values(L.env.store.pos_test_transfers)[0];
    ok(tr.status === 'in_transit' && tr.code, 'الإذن مش في الطريق: ' + tr.status);
  });
  await t('🔴 الاستلام: 98 من 100 ← 98 بس تدخل الفرع والفرق يفضل مفتوح', async () => {
    const L = transferEnv();
    L.el('trDestSel').value = 'Madinaty';
    L.api._setCart([{ id: 'it1', name: 'طرحة', barcode: '111', qty: 100 }], { id: 'c1', name: 'منى' });
    await L.api.sendTransfer();
    const id = Object.keys(L.env.store.pos_test_transfers)[0];
    // استلام 98: بننادي طبقة الحركة بنفس مدخلات شاشة الاستلام
    await L.api.stockApply({ docType: 'transfer', docId: id, phase: 'in',
      lines: [{ itemId: 'it1', qty: 98, from: 'في الطريق', to: 'Madinaty' }] });
    await L.api.stockApply({ docType: 'transfer', docId: id, phase: 'in',
      lines: [{ itemId: 'it1', qty: 98, from: 'في الطريق', to: 'Madinaty' }] });   // دوسة تانية
    const inv = L.env.store.pos_test_inventory.it1.qtyByBranch;
    ok(inv['Madinaty'] === 98, 'دخل الفرع ' + inv['Madinaty']);
    ok(inv['في الطريق'] === 2, 'الناقص مش متعلّق في الطريق: ' + inv['في الطريق']);
  });
  await t('🔴 الإرسال بيكتب الإذن الأول وبعدين يخصم (مش العكس)', () => {
    const src = rd('pos/transfers.js');
    const i = src.indexOf('async function sendTransfer');
    const body = src.slice(i, src.indexOf('async function', i + 10));
    const iDoc = body.indexOf('trRef.set('), iApply = body.indexOf('stockApply('), iBatch = body.indexOf('db.batch()');
    ok(iDoc > 0 && iApply > iDoc, 'الخصم قبل الإذن');
    ok(iBatch === -1, 'لسه بيخصم بدفعة من غير حماية تكرار');
    ok(/_trDocId \|\| \(_trDocId = _trNewId\(\)\)/.test(body), 'رقم الإذن بيتولّد كل ضغطة');
    ok(/to: IN_TRANSIT/.test(body), 'البضاعة بتتخصم للعدم مش لـ«في الطريق»');
  });
  await t('🔴 الاستلام بيزوّد من «في الطريق» ومش بيلمس المخزون جوّه المعاملة', () => {
    const src = rd('pos/transfers.js');
    const i = src.indexOf('async function confirmTransfer');
    const body = src.slice(i, i + 9000);
    ok(/from: IN_TRANSIT, to: t\.toBranch/.test(body), 'الاستلام مش جاي من «في الطريق»');
    ok(!/tx\.update\(db\.collection\(TEST_INVENTORY\)/.test(body), 'لسه بيكتب على المخزون جوّه المعاملة = خصم مزدوج محتمل');
    ok(/openDiffStatus/.test(body), 'الفرق مش بيتسجل كبند مفتوح');
  });
  await t('الفرق بيفضل مفتوح باسم مسؤول', () => {
    const src = rd('pos/transfers.js');
    ok(/openDiffOwner: t\.carrierName/.test(src) && /missing: it\.qty/.test(src));
  });
  await t('POS بيحمّل الملف الجديد والإصدار اترفع', () => {
    const idx = rd('pos/index.html');
    ok(/stock-move\.js\?v=\d+/.test(idx), 'الملف مش متحمّل في الصفحة');
    ok(idx.indexOf('stock-move.js') < idx.indexOf('transfers.js'), 'الترتيب غلط — transfers محتاجه قبله');
    const c = rd('pos/sw.js').match(/CACHE_NAME = 'pos-shell-v(\d+)'/);
    ok(c && Number(c[1]) >= 731, 'الكاش ماترفعش');
  });

  console.log(`\nالنتيجة: ${P} ناجح · ${F} فاشل`);
  if(typeof assert === 'function') assert(F === 0, 'test-stock-moves: ' + F + ' فحص فشل');
  else if(F) process.exitCode = 1;
})();
