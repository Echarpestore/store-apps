/* 🧪 مرحلة ٣ — الجرد بالباركود (23-09)
   بتشغّل `countStart` و`countAdd` و`countReview` و`countApprove` الحقيقيين مع `stockApply`
   على Firestore وهمي. أهم فحصين: (1) البيع أثناء العد ميطلّعش عجز وهمي،
   (2) الاعتماد المكرر ميعملش تسوية مرتين. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let P = 0, F = 0;
async function t(n, fn){ try{ await fn(); P++; console.log('  ✅ ' + n); }catch(e){ F++; console.log('  ❌ ' + n + ' → ' + e.message); } }
const ok = (c, m) => { if(!c) throw Error(m || 'fail'); };

/* ---------- Firestore وهمي (مجموعات فرعية + استعلامات + معاملات ذرية) ---------- */
function fakeDb(){
  const store = {};
  const INC = (n) => ({ __inc: n });
  const col = (name) => {
    store[name] = store[name] || {};
    const apply = (target, upd) => Object.keys(upd).forEach(k => {
      const v = upd[k], parts = k.split('.');
      let o = target;
      for(let i = 0; i < parts.length - 1; i++){ o[parts[i]] = o[parts[i]] || {}; o = o[parts[i]]; }
      const last = parts[parts.length - 1];
      o[last] = (v && v.__inc != null) ? (Number(o[last]) || 0) + v.__inc : v;
    });
    const docRef = (id) => ({
      id, _colName: name,
      get: async () => ({ id, exists: !!store[name][id], data: () => store[name][id], ref: docRef(id) }),
      set: async (d, o) => { if(!(o && o.merge)) store[name][id] = {}; store[name][id] = store[name][id] || {}; apply(store[name][id], d); },
      update: async (d) => { if(!store[name][id]) throw new Error('No document to update: ' + name + '/' + id); apply(store[name][id], d); },
      collection: (sub) => col(name + '/' + id + '/' + sub)
    });
    const all = () => Object.keys(store[name]).map(id => ({ id, data: () => store[name][id], ref: docRef(id) }));
    const q = (preds) => ({
      where: (f, op, v) => q(preds.concat([[f, op, v]])),
      limit: () => q(preds),
      get: async () => {
        const docs = all().filter(d => preds.every(([f, op, v]) => {
          const x = (d.data() || {})[f];
          if(op === '==') return x === v;
          if(op === '>=') return (Number(x) || 0) >= v;
          if(op === 'array-contains') return Array.isArray(x) && x.includes(v);
          return true;
        }));
        return { empty: !docs.length, size: docs.length, docs };
      }
    });
    return { doc: docRef, where: (f, op, v) => q([[f, op, v]]), get: async () => ({ docs: all() }), add: async () => ({}) };
  };
  return {
    store, INC, col,
    db: {
      collection: col,
      runTransaction: async (fn) => {
        const writes = [];
        const tx = { get: (ref) => ref.get(), set: (r, d, o) => writes.push(() => r.set(d, o)), update: (r, d) => writes.push(() => r.update(d)) };
        const out = await fn(tx);
        const backup = JSON.parse(JSON.stringify(store));
        try{ for(const w of writes) await w(); }
        catch(e){ Object.keys(store).forEach(k => delete store[k]); Object.assign(store, backup); throw e; }
        return out;
      }
    }
  };
}

function load(role){
  const env = fakeDb();
  const win = {};
  const els = {};
  const el = (id) => (els[id] = els[id] || { id, value: '', innerHTML: '', style: {}, focus(){}, remove(){} });
  const ctx = {
    db: env.db, window: win,
    TEST_INVENTORY: 'pos_test_inventory', TEST_SALES: 'pos_test_sales',
    BRANCHES: ['El Rehab', 'Madinaty', 'Glow'],
    currentBranch: 'El Rehab',
    currentEmployee: { id: 'e1', name: 'سارة', _admin: role === 'admin' },
    currentEmployeeRole: role || 'cashier',
    branchCode: () => 'REH',
    allInventory: [],
    showToast: () => {}, showScreen: () => {}, loadInventory: () => {},
    askText: async () => '',
    document: { getElementById: (id) => els[id], createElement: () => el('_t'), addEventListener: () => {} },
    firebase: { firestore: { FieldValue: { increment: env.INC } } },
    console: { warn(){}, log(){}, error(){} }
  };
  const names = Object.keys(ctx);
  const code = rd('pos/stock-move.js') + '\n' + rd('pos/stock-count.js')
    + '\nreturn { countStart, countAdd, countReview, countApprove, countRecount, countCancel, canApproveCount, stockApply, countMovementsSince, scFindItem, scReportHTML };';
  const api = new Function(...names, code)(...names.map(n => ctx[n]));
  return { env, api, ctx, els };
}

const item = (id, name) => ({ id, name: name || 'طرحة', barcode: '111' });
function seedItem(env, id, qty){ env.store['pos_test_inventory'] = env.store['pos_test_inventory'] || {};
  env.store['pos_test_inventory'][id] = { name: 'طرحة', barcode: '111', qtyByBranch: { 'El Rehab': qty } }; }
function seedSale(env, o){ env.store['pos_test_sales'] = env.store['pos_test_sales'] || {};
  env.store['pos_test_sales']['S' + Math.random().toString(36).slice(2)] = o; }

(async () => {
  console.log('\n🧮 الجرد');

  await t('العد الأعمى مبيرجّعش رصيد السيستم', async () => {
    const L = load('manager'); seedItem(L.env, 'i1', 50);
    await L.api.countStart({ scope: 'full' });
    const line = await L.api.countAdd(item('i1'), 47, { replace: true });
    ok(!('systemQty' in line) && !('system' in line), 'الرد فيه رصيد السيستم: ' + JSON.stringify(line));
    ok(line.counted === 47 && line.countedAt > 0, JSON.stringify(line));
  });

  await t('🔴 تقرير الفرق: عجز 3 وزيادة 2', async () => {
    const L = load('manager'); seedItem(L.env, 'i1', 50); seedItem(L.env, 'i2', 30);
    await L.api.countStart({ scope: 'full' });
    await L.api.countAdd(item('i1', 'طرحة سودا'), 47, { replace: true });
    await L.api.countAdd(item('i2', 'بندانة بيضا'), 32, { replace: true });
    const rows = await L.api.countReview();
    const a = rows.find(r => r.itemId === 'i1'), b = rows.find(r => r.itemId === 'i2');
    ok(a.systemAtCount === 50 && a.diff === -3, JSON.stringify(a));
    ok(b.systemAtCount === 30 && b.diff === 2, JSON.stringify(b));
  });

  await t('🔴 بيع أثناء العد مايطلّعش عجز وهمي', async () => {
    const L = load('manager'); seedItem(L.env, 'i1', 50);
    await L.api.countStart({ scope: 'full' });
    await L.api.countAdd(item('i1'), 50, { replace: true });     // العدّاد شاف 50 وهي صح
    // بعد العد اتباع 4: الرصيد بقى 46 والفاتورة متسجلة
    L.env.store['pos_test_inventory']['i1'].qtyByBranch['El Rehab'] = 46;
    seedSale(L.env, { branch: 'El Rehab', createdAtMs: Date.now() + 10, items: [{ id: 'i1', qty: 4 }] });
    const rows = await L.api.countReview();
    ok(rows[0].diff === 0, 'طلع فرق ' + rows[0].diff + ' والمفروض صفر (اتباع 4 بعد العد)');
    ok(rows[0].systemAtCount === 50, 'رصيد لحظة العد = ' + rows[0].systemAtCount);
  });

  await t('🔴 مرتجع أثناء العد كمان بيتحسب', async () => {
    const L = load('manager'); seedItem(L.env, 'i1', 50);
    await L.api.countStart({ scope: 'full' });
    await L.api.countAdd(item('i1'), 50, { replace: true });
    L.env.store['pos_test_inventory']['i1'].qtyByBranch['El Rehab'] = 52;
    seedSale(L.env, { branch: 'El Rehab', createdAtMs: Date.now() + 10, items: [{ id: 'i1', qty: 2, isReturn: true }] });
    const rows = await L.api.countReview();
    ok(rows[0].diff === 0, 'طلع فرق ' + rows[0].diff);
  });

  await t('🔴 تحويلة وصلت أثناء العد بتتحسب من سجل الحركة', async () => {
    const L = load('manager'); seedItem(L.env, 'i1', 50);
    await L.api.countStart({ scope: 'full' });
    await L.api.countAdd(item('i1'), 50, { replace: true });
    await new Promise(r => setTimeout(r, 2));
    await L.api.stockApply({ docType: 'transfer', docId: 'TRX', phase: 'in',
      lines: [{ itemId: 'i1', qty: 10, from: null, to: 'El Rehab' }] });
    const rows = await L.api.countReview();
    ok(rows[0].diff === 0, 'طلع فرق ' + rows[0].diff + ' بعد استلام 10 أثناء العد');
  });

  console.log('\n🔐 الاعتماد');
  await t('🔴 الكاشير مايعتمدش', async () => {
    const L = load('cashier'); seedItem(L.env, 'i1', 50);
    await L.api.countStart({ scope: 'full' });
    await L.api.countAdd(item('i1'), 47, { replace: true });
    let msg = '';
    try{ await L.api.countApprove('جرد'); }catch(e){ msg = e.message; }
    ok(/مالك.*مدير/.test(msg), 'الرسالة: ' + JSON.stringify(msg));
    ok(L.env.store['pos_test_inventory']['i1'].qtyByBranch['El Rehab'] === 50, 'الرصيد اتغيّر رغم رفض الاعتماد');
  });

  await t('🔴 المدير يعتمد ← الرصيد يتسوّى والحركة تتسجل', async () => {
    const L = load('manager'); seedItem(L.env, 'i1', 50);
    await L.api.countStart({ scope: 'full' });
    await L.api.countAdd(item('i1'), 47, { replace: true });
    await L.api.countReview();
    const r = await L.api.countApprove('جرد آخر الشهر');
    ok(r.ok && r.adjusted === 1, JSON.stringify(r));
    ok(L.env.store['pos_test_inventory']['i1'].qtyByBranch['El Rehab'] === 47, 'الرصيد = '
      + L.env.store['pos_test_inventory']['i1'].qtyByBranch['El Rehab']);
    const mv = Object.values(L.env.store['pos_stock_moves'])[0];
    ok(mv && mv.docType === 'count' && mv.lines[0].qty === 3 && mv.lines[0].from === 'El Rehab', JSON.stringify(mv));
    ok(/تسوية جرد/.test(mv.reason), 'التسوية من غير سبب موثق');
    const c = Object.values(L.env.store['pos_stock_counts'])[0];
    ok(c.status === 'approved' && c.approvedByName === 'سارة' && c.approveReason === 'جرد آخر الشهر', JSON.stringify(c));
  });

  await t('🔴 الزيادة بتترفع للرصيد برضه', async () => {
    const L = load('admin'); seedItem(L.env, 'i2', 30);
    await L.api.countStart({ scope: 'full' });
    await L.api.countAdd(item('i2'), 32, { replace: true });
    await L.api.countApprove('');
    ok(L.env.store['pos_test_inventory']['i2'].qtyByBranch['El Rehab'] === 32);
  });

  await t('🔴 اعتماد مكرر (نت قاطع/دوسة تانية) مايسوّيش مرتين', async () => {
    const L = load('manager'); seedItem(L.env, 'i1', 50);
    await L.api.countStart({ scope: 'full' });
    await L.api.countAdd(item('i1'), 47, { replace: true });
    const first = await L.api.countApprove('');
    // نفس الجرد يتعاد اعتماده بنفس المعرّف
    await L.api.stockApply({ docType: 'count', docId: first.countId, phase: 'adjust',
      lines: [{ itemId: 'i1', qty: 3, from: 'El Rehab', to: null }] });
    ok(L.env.store['pos_test_inventory']['i1'].qtyByBranch['El Rehab'] === 47,
       'اتسوّى مرتين: ' + L.env.store['pos_test_inventory']['i1'].qtyByBranch['El Rehab']);
  });

  await t('مفيش فرق = مفيش حركة تسوية', async () => {
    const L = load('manager'); seedItem(L.env, 'i1', 50);
    await L.api.countStart({ scope: 'full' });
    await L.api.countAdd(item('i1'), 50, { replace: true });
    await L.api.countApprove('');
    ok(!Object.keys(L.env.store['pos_stock_moves'] || {}).length, 'اتكتبت حركة من غير داعي');
  });

  await t('إعادة العد بترجّع الجرد لحالة العد', async () => {
    const L = load('manager'); seedItem(L.env, 'i1', 50);
    await L.api.countStart({ scope: 'full' });
    await L.api.countAdd(item('i1'), 47, { replace: true });
    await L.api.countReview();
    await L.api.countRecount('i1');
    const c = Object.values(L.env.store['pos_stock_counts'])[0];
    ok(c.status === 'counting', 'الحالة: ' + c.status);
  });

  await t('🔴 فشل قراية فواتير الفترة بيوقف المقارنة مش بيعتبرها صفر', async () => {
    const L = load('manager'); seedItem(L.env, 'i1', 50);
    await L.api.countStart({ scope: 'full' });
    await L.api.countAdd(item('i1'), 47, { replace: true });
    const orig = L.ctx.db.collection;
    L.ctx.db.collection = (n) => (n === 'pos_test_sales'
      ? { where: () => ({ where: () => ({ get: async () => { throw new Error('permission-denied'); } }) }) }
      : orig(n));
    let msg = '';
    try{ await L.api.countReview(); }catch(e){ msg = e.message; }
    L.ctx.db.collection = orig;
    ok(/فواتير فترة الجرد/.test(msg), 'الرسالة: ' + msg);
  });

  console.log('\n🛡️ الربط والرولز');
  console.log('\n🔎 v734 — السكانر في الجرد');
  const INV = [{ id: 'a', name: 'طرحة', barcode: 'ECH-TR7' }, { id: 'b', name: 'بندانة', barcode: '00123' },
               { id: 'c', name: 'إسدال', barcode: '4567', code: 'ISD1' }];
  await t('باركود عادي · كود الصنف · من غير فرق حروف كبيرة وصغيرة', () => {
    const L = load('manager'); L.ctx.allInventory.push(...INV);
    ok(L.api.scFindItem('ECH-TR7').id === 'a' && L.api.scFindItem('ech-tr7').id === 'a' && L.api.scFindItem('ISD1').id === 'c', 'مالقاش');
  });
  await t('🔴 سكانر على كيبورد عربي بيعدّي من normalizeScan', () => {
    const L = load('manager'); L.ctx.allInventory.push(...INV);
    L.ctx.window.normalizeScan = (x) => x === 'ثؤا-فق7' ? 'ECH-TR7' : x;   // نفس دور دالة شاشة البيع
    ok((L.api.scFindItem('ثؤا-فق7') || {}).id === 'a', 'الكيبورد العربي لسه بيرفض');
  });
  await t('🔴 الأصفار البادئة — بس لو صنف واحد بالظبط', () => {
    const L = load('manager'); L.ctx.allInventory.push(...INV);
    ok((L.api.scFindItem('123') || {}).id === 'b' && (L.api.scFindItem('000123') || {}).id === 'b', 'الأصفار');
    L.ctx.allInventory.push({ id: 'd', name: 'تانية', barcode: '0123' });
    ok(L.api.scFindItem('123') === null, 'خمّن بين صنفين');
    ok(L.api.scFindItem('XYZ') === null, 'لقى حاجة مش موجودة');
  });
  await t('🔴 المسحة في الجرد متروحش للبيع (لاقط capture بيوقف الانتشار)', () => {
    const src = rd('pos/stock-count.js');
    ok(/document\.addEventListener\('keydown', _scKeydown, true\)/.test(src), 'اللاقط مش capture');
    ok(/e\.stopImmediatePropagation\(\)/.test(src) && /scScan\(typed\.trim\(\) \? typed : buf, buf\)/.test(src), 'مبيوقفش اللاقط العام / مبيبعتش البديل');
    ok(!/onkeydown="if\(event\.key==='Enter'\) scScan/.test(src), 'الـEnter بيتنادى مرتين');
  });

  console.log('\n📦 v734 — طبّق على السيستم كله');
  const seed3 = (L) => { seedItem(L.env, 'i1', 10); seedItem(L.env, 'i2', 7); seedItem(L.env, 'i3', 0);
    L.ctx.allInventory.push({ id: 'i1', name: 'أ', qtyByBranch: { 'El Rehab': 10 } }, { id: 'i2', name: 'ب', qtyByBranch: { 'El Rehab': 7 } },
                            { id: 'i3', name: 'ج', qtyByBranch: { 'El Rehab': 0 } }); };
  await t('جرد كامل: اللي ماتعدّش بيظهر لوحده ومبيتلمسش من غير الاختيار', async () => {
    const L = load('manager'); seed3(L);
    await L.api.countStart({ scope: 'full' });
    await L.api.countAdd(item('i1'), 9, { replace: true });
    const rows = await L.api.countReview();
    ok(rows.uncounted.length === 1 && rows.uncounted[0].itemId === 'i2' && rows.uncounted[0].qtyNow === 7, JSON.stringify(rows.uncounted));
    const r = await L.api.countApprove('جرد');
    ok(r.zeroed === 0 && L.env.store.pos_test_inventory.i2.qtyByBranch['El Rehab'] === 7 && L.env.store.pos_test_inventory.i1.qtyByBranch['El Rehab'] === 9, 'اتلمس من غير اختيار');
  });
  await t('🔴 مع «طبّق على السيستم كله»: اللي ماتعدّش يتصفّر بحركة موثقة', async () => {
    const L = load('manager'); seed3(L);
    await L.api.countStart({ scope: 'full' });
    await L.api.countAdd(item('i1'), 9, { replace: true });
    await L.api.countReview();
    const r = await L.api.countApprove('جرد آخر الشهر', { zeroUncounted: true });
    const q = (id) => L.env.store.pos_test_inventory[id].qtyByBranch['El Rehab'];
    ok(r.zeroed === 1 && q('i2') === 0 && q('i1') === 9 && q('i3') === 0, JSON.stringify({ r, i1: q('i1'), i2: q('i2') }));
    const mv = Object.values(L.env.store.pos_stock_moves || {})[0];
    ok(mv && mv.lines.some(l => l.itemId === 'i2' && l.qty === 7 && l.from === 'El Rehab' && l.to === null), 'التصفير من غير حركة');
  });
  await t('🔴 جرد قسم عمره ما يصفّر حاجة برّه القسم', async () => {
    const L = load('manager'); seed3(L);
    await L.api.countStart({ scope: 'section', sectionName: 'طرح' });
    await L.api.countAdd(item('i1'), 9, { replace: true });
    const rows = await L.api.countReview();
    const r = await L.api.countApprove('', { zeroUncounted: true });
    ok(rows.uncounted.length === 0 && r.zeroed === 0 && L.env.store.pos_test_inventory.i2.qtyByBranch['El Rehab'] === 7, 'صفّر برّه القسم');
  });
  await t('🖨️ تقرير مطبوع فيه الفرق والأصناف اللي ماتعدّتش ومهرّب', () => {
    const L = load('manager');
    const rows = [{ name: '<b>x</b>', barcode: '1', systemAtCount: 10, counted: 7, diff: -3 }, { name: 'ب', barcode: '2', systemAtCount: 2, counted: 4, diff: 2 }];
    rows.uncounted = [{ name: 'ج', barcode: '3', qtyNow: 5 }];
    const h = L.api.scReportHTML('CNT1', rows, { branch: 'El Rehab' });
    ok(h.includes('CNT1') && h.includes('عجز 3') && h.includes('زيادة 2') && h.includes('ماتعدّتش') && h.includes('&lt;b&gt;') && !h.includes('<b>x</b>'), 'التقرير ناقص/مش مهرّب');
  });

  await t('الشاشة والزرار متوصلين والإصدار اترفع', () => {
    const idx = rd('pos/index.html');
    ok(/stock-count\.js\?v=\d+/.test(idx), 'الملف مش متحمّل');
    ok(idx.includes('id="stockCountScreen"') && idx.includes('goToStockCount()'), 'الشاشة أو الزرار ناقص');
    ok(idx.indexOf('stock-move.js') < idx.indexOf('stock-count.js'), 'stock-count محتاج stock-move قبله');
    const c = rd('pos/sw.js').match(/CACHE_NAME = 'pos-shell-v(\d+)'/);
    ok(c && Number(c[1]) >= 732, 'الكاش ماترفعش');
  });
  await t('🔴 الرولز بتسمح بمستند الجرد وسطوره ومبتسمحش بالمسح', () => {
    const r = rd('security/firestore-phase2.rules');
    const i = r.indexOf('match /pos_stock_counts/');
    ok(i > 0, 'المجموعة مش في الرولز — الجرد هيترفض');
    const block = r.slice(i, i + 400);
    ok(/allow read, create, update: if isStaff\(\)/.test(block), 'الكتابة مقفولة');
    ok(/match \/lines\/\{itemId\}/.test(block), 'سطور الجرد مش مغطّاة');
    ok((block.match(/allow delete: if false/g) || []).length >= 2, 'المسح مسموح');
  });

  console.log(`\nالنتيجة: ${P} ناجح · ${F} فاشل`);
  if(typeof assert === 'function') assert(F === 0, 'test-stock-count: ' + F + ' فحص فشل');
  else if(F) process.exitCode = 1;
})();
