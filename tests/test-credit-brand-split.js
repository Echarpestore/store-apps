/* 🧪 فصل الرصيد لكل براند — node tests/test-credit-brand-split.js (من جذر الريبو) */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const srv = rd('functions/giftCredit.js'), rules = rd('security/firestore-phase2.rules');
const core = require(path.join(ROOT, 'pos/credit-core.js')), mig = require(path.join(ROOT, 'pos/credit-brand-migrate.js'));
let p = 0, f = 0;
const t = async (n, fn) => { try { await fn(); p++; console.log('  ✅ ' + n); } catch (e) { f++; console.log('  ❌ ' + n + ' → ' + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw Error((m || '') + ' وجه ' + JSON.stringify(a) + ' والمتوقع ' + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) throw Error(m || 'شرط فشل'); };
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
function extractFn(s, head) { const i = s.indexOf(head); if (i < 0) throw Error('البلوك مش موجود: ' + head);
  const o = s.indexOf('{', i); let d = 0; for (let k = o; k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}') { d--; if (!d) return s.slice(i, k + 1); } } throw Error('أقواس'); }

/* ☁️ السيرفر الحقيقي (postCredit + moveCreditBrand) على Firestore وهمي في الذاكرة */
function server(custDoc) {
  const store = { cust: Object.assign({}, custDoc), ledger: [] };
  let wrote = false;
  const tx = {
    get: async () => { if (wrote) throw Error('قراءة بعد كتابة — Firestore هيرفض المعاملة'); return { data: () => Object.assign({}, store.cust) }; },
    set: (ref, data, o) => { wrote = true; if (ref.__k === 'cust') Object.assign(store.cust, data); else store.ledger.push(data); }
  };
  const ctx = vm.createContext({
    admin: { firestore: Object.assign(() => ({ collection: n => ({ doc: () => ({ __k: n === 'pos_test_customers' ? 'cust' : 'ledger' }) }) }),
      { FieldValue: { serverTimestamp: () => 'TS' } }) },
    HttpsError: class extends Error { constructor(c, m) { super(m); this.code = c; } },
    CUSTOMERS: 'pos_test_customers', LEDGER: 'credit_ledger', Date, Math, Object, String, Number
  });
  const glow = srv.match(/const GLOW_BRANCHES = \[[^\]]*\];/)[0];
  vm.runInContext([glow, extractFn(srv, 'function brandOf'), extractFn(srv, 'function creditFieldOf'), extractFn(srv, 'function branchFor'),
    extractFn(srv, 'async function postCredit'), extractFn(srv, 'async function moveCreditBrand')].join('\n'), ctx);
  return { store, tx, fresh: () => { wrote = false; }, fn: n => vm.runInContext(n, ctx) };
}

(async () => {
  console.log('\n☁️ السيرفر — postCredit');
  await t('⭐⭐ حركة في Glow بتكتب credit_glow ومبتلمسش credit', async () => {
    const s = server({ credit: 500 }); const r = await s.fn('postCredit')(s.tx, '010', 350, { type: 'change_kept', branch: 'Glow' });
    eq(s.store.cust.credit_glow, 350); eq(s.store.cust.credit, 500); eq(r.brand, 'glow'); eq(s.store.ledger[0].brand, 'glow'); eq(s.store.ledger[0].balanceAfter, 350);
  });
  await t('⭐⭐ حركة في الرحاب بتكتب credit ومبتلمسش credit_glow', async () => {
    const s = server({ credit: 100, credit_glow: 900 }); await s.fn('postCredit')(s.tx, '010', 50, { type: 'manual', branch: 'الرحاب' });
    eq(s.store.cust.credit, 150); eq(s.store.cust.credit_glow, 900); eq(s.store.ledger[0].brand, 'echarpe');
  });
  await t('⭐⭐ رصيد echarpe مايتصرفش في Glow (ده سبب الفصل كله)', async () => {
    const s = server({ credit: 500, credit_glow: 0 }); let err = null;
    try { await s.fn('postCredit')(s.tx, '010', -100, { type: 'spend', branch: 'Glow' }); } catch (e) { err = e; }
    ok(err && err.code === 'failed-precondition', 'الصرف عدّى!'); eq(s.store.cust.credit, 500); eq(s.store.ledger.length, 0);
  });
  await t('فرع فاضي/مجهول = echarpe (الحقل القديم — مفيش رصيد يضيع)', async () => {
    const s = server({}); await s.fn('postCredit')(s.tx, '010', 10, { type: 'manual', branch: '' }); eq(s.store.cust.credit, 10);
  });
  await t('⭐ brand صريح (كارت هدية) بيغلب الفرع', async () => {
    const s = server({}); await s.fn('postCredit')(s.tx, '010', 200, { type: 'gift_card', brand: 'glow', branch: 'الرحاب' });
    eq(s.store.cust.credit_glow, 200); eq(s.store.ledger[0].brand, 'glow');
  });
  await t('🔒 meta.brand غلط مايتكتبش في الدفتر ولا يحدد حقل', async () => {
    const s = server({}); await s.fn('postCredit')(s.tx, '010', 5, { brand: 'credit; drop', branch: 'Glow' });
    eq(s.store.ledger[0].brand, 'glow'); ok(!('credit; drop' in s.store.cust));
  });
  await t('branchFor: فرع POS الحالي الأول، وبعده فرع الموظف', () => {
    const bf = server({}).fn('branchFor'); eq(bf({ branch: 'الرحاب' }, { branch: 'Glow' }), 'Glow'); eq(bf({ branch: 'Glow' }, {}), 'Glow'); eq(bf({}, {}), '');
  });

  console.log('\n🔀 السيرفر — نقل بين البراندين');
  await t('⭐⭐ المجموع قبل = المجموع بعد، وحركتين في الدفتر', async () => {
    const s = server({ credit: 325, credit_glow: 40 }); const r = await s.fn('moveCreditBrand')(s.tx, '010', 300, 'echarpe', 'glow', { by: 'o' });
    eq(s.store.cust.credit, 25); eq(s.store.cust.credit_glow, 340); eq(s.store.cust.credit + s.store.cust.credit_glow, 365);
    eq(s.store.ledger.length, 2); eq(s.store.ledger[0].amount, -300); eq(s.store.ledger[0].brand, 'echarpe'); eq(s.store.ledger[1].amount, 300); eq(s.store.ledger[1].brand, 'glow');
    eq(s.store.ledger[0].balanceAfter, 25); eq(s.store.ledger[1].balanceAfter, 340); ok(s.store.ledger[1].at > s.store.ledger[0].at, 'الترتيب');
  });
  await t('⭐⭐ قراءة واحدة قبل كل الكتابات (وإلا Firestore يرفض المعاملة)', async () => {
    const s = server({ credit: 100 }); await s.fn('moveCreditBrand')(s.tx, '010', 100, 'echarpe', 'glow', {});   // الـtx الوهمي بيرمي لو قرا بعد كتابة
    eq(s.store.cust.credit, 0);
  });
  await t('🔴 سلبي: نداءين postCredit في معاملة واحدة كانوا هيترفضوا', async () => {
    const s = server({ credit: 100 }); await s.fn('postCredit')(s.tx, '010', -100, { brand: 'echarpe' }); let err = null;
    try { await s.fn('postCredit')(s.tx, '010', 100, { brand: 'glow' }); } catch (e) { err = e; } ok(err, 'المفروض يترفض');
  });
  await t('نقل أكبر من الرصيد مرفوض ومفيش أي كتابة', async () => {
    const s = server({ credit: 50 }); let err = null; try { await s.fn('moveCreditBrand')(s.tx, '010', 80, 'echarpe', 'glow', {}); } catch (e) { err = e; }
    ok(err && err.code === 'failed-precondition'); eq(s.store.cust.credit, 50); eq(s.store.ledger.length, 0);
  });
  const srvC = strip(srv);
  await t('⭐⭐ النقل للمالك بس', () => { const b = extractFn(srvC, "if(data && data.action === 'brandMove')"); ok(/who\.role !== 'owner'\)\s*throw new HttpsError\('permission-denied'/.test(b)); ok(/from === to/.test(b)); ok(/idemRef\('move:'/.test(b)); });
  await t('كل النداءات بتاخد الفرع من branchFor (مفيش who.branch لوحده)', () => ok(!/branch:\s*who\.branch\s*\|\|\s*''/.test(srvC), 'لسه فيه نداء بياخد فرع الموظف بس'));
  await t('كارت الهدية بيتختم ببراند فرع الإصدار، والاستلام بيمشي عليه', () => { ok(/brand: brandOf\(branchFor\(who, data\)\)/.test(srvC)); ok(/const cardBrand = \(c\.brand === 'glow' \|\| c\.brand === 'echarpe'\) \? c\.brand : brandOf\(c\.branch\)/.test(srvC)); });
  await t('طلب الموافقة بيتختم بالبراند والقرار بيمشي عليه', () => { ok(/brand:brandOf\(branchFor\(who,data\)\),status:'pending'/.test(srvC)); ok(/brand:\(d\.brand\|\|brandOf\(d\.branch\)\)/.test(srvC)); });

  console.log('\n🔗 تطابق POS مع السيرفر');
  await t('⭐⭐ GLOW_BRANCHES واحدة في السيرفر وpos-core.js', () => {
    const a = srv.match(/const GLOW_BRANCHES = (\[[^\]]*\]);/)[1], b = rd('pos/pos-core.js').match(/const GLOW_BRANCHES = (\[[^\]]*\]);/)[1];
    eq(JSON.stringify(eval(a)), JSON.stringify(eval(b)));
  });
  await t('creditFieldFor = creditFieldOf', () => { eq(core.creditFieldFor('Glow', ['Glow']), 'credit_glow'); eq(core.creditFieldFor('الرحاب', ['Glow']), 'credit'); eq(core.creditFieldFor('', ['Glow']), 'credit'); });
  await t('حركة قديمة من غير brand = echarpe', () => { eq(core.creditRowBrand({}), 'echarpe'); eq(core.creditRowBrand({ brand: 'glow' }), 'glow'); eq(core.creditRowBrand(null), 'echarpe'); });
  await t('⭐ callCredit بيبعت الفرع الحالي مع كل نداء', () => { const b = extractFn(strip(rd('pos/credit-ui.js')), 'async function callCredit'); ok(/_pl\.branch = \(window\.currentBranch \|\| currentBranch\)/.test(b)); ok(/await fn\(_pl\)/.test(b), 'لسه بيبعت payload الأصلي'); });
  await t('⭐ POS بيقرا رصيد براند الفرع (pos-sale سطر واحد)', () => ok(/custCreditBalance = Number\(d\[\(typeof creditFieldFor === 'function'\) \? creditFieldFor\(currentBranch\) : 'credit'\]\)/.test(rd('pos/pos-sale.js'))));
  await t('الكشف والقايمة ببراند الفرع', () => { const l = strip(rd('pos/credit-ledger-ui.js')); ok(/byBrand\(snap\.docs/.test(l)); ok(/c\[creditFieldFor\(/.test(l)); ok(!/Number\(c\.credit\)/.test(rd('pos/pos-reports.js'))); });

  console.log('\n📱 التطبيقات');
  const lo = strip(rd('loyalty/index.html')), gl = strip(rd('glow/index.html'));
  await t('⭐⭐ Glow بيقرا credit_glow بس', () => { ok(!/currentCustomer\.credit\b(?!_glow)/.test(gl), 'لسه بيقرا credit'); eq((gl.match(/currentCustomer\.credit_glow/g) || []).length, 4); });
  await t('⭐⭐ echarpe بيقرا credit بس', () => ok(!/credit_glow/.test(lo)));
  await t('كل تطبيق بيعرض حركات براندو بس', () => { ok(/return r\.brand === 'glow';/.test(gl)); ok(/return r\.brand !== 'glow';/.test(lo)); });

  console.log('\n🔐 قواعد الأمان');
  const ru = strip(rules);
  await t('⭐⭐ الموظف ممنوع يلمس credit_glow (كان credit بس = كاشير يزوّد رصيد Glow لنفسه)', () => ok(/hasAny\(\['credit', 'credit_glow', 'creditAt'\]\)/.test(ru)));
  await t('⭐⭐ العميلة ماتسجّلش نفسها ومعاها credit_glow', () => ok(/!\('credit_glow' in request\.resource\.data\)/.test(ru)));
  await t('وcredit_glow مش في قايمة حقول العميلة المسموحة', () => { const i = ru.indexOf("hasOnly("); ok(i > 0); ok(!/credit/.test(ru.slice(i, ru.indexOf(']))', i)))); });

  console.log('\n🔀 خطة الترحيل');
  const G = ['Glow'];
  await t('⭐⭐ رصيد اتولد في Glow بيتنقل، واللي في الرحاب يفضل', () => {
    const plan = mig.creditBrandMigratePlan([{ phone: 'A', credit: 325 }, { phone: 'B', credit: 100 }],
      { A: [{ amount: 350, branch: 'Glow' }, { amount: -25, branch: 'Glow' }], B: [{ amount: 100, branch: 'الرحاب' }] }, G);
    eq(plan[0].move, 325); eq(plan[1].move, 0);
  });
  await t('مختلط: اللي من Glow بس', () => eq(mig.creditBrandMigratePlan([{ phone: 'A', credit: 300 }], { A: [{ amount: 200, branch: 'الرحاب' }, { amount: 100, branch: 'Glow' }] }, G)[0].move, 100));
  await t('⭐ عمره ما ينقل أكتر من الرصيد ولا بالسالب', () => {
    eq(mig.creditBrandMigratePlan([{ phone: 'A', credit: 50 }], { A: [{ amount: 400, branch: 'Glow' }] }, G)[0].move, 50);
    eq(mig.creditBrandMigratePlan([{ phone: 'A', credit: 50 }], { A: [{ amount: -30, branch: 'Glow' }, { amount: 80, branch: 'الرحاب' }] }, G)[0].move, 0);
  });
  await t('⭐⭐ إعادة التشغيل بعد النقل = صفر (مفيش نقل مرتين)', () => {
    const rows = [{ amount: 350, branch: 'Glow' }, { type: 'brand_move', brand: 'echarpe', movedTo: 'glow', amount: -350 }, { type: 'brand_move', brand: 'glow', movedFrom: 'echarpe', amount: 350 }];
    eq(mig.creditBrandMigratePlan([{ phone: 'A', credit: 0.01 }], { A: rows }, G)[0].move, 0);
  });
  await t('حركات ما بعد الفصل (فيها brand) مابتتحسبش', () => eq(mig.creditBrandMigratePlan([{ phone: 'A', credit: 100 }], { A: [{ amount: 100, branch: 'Glow', brand: 'glow' }] }, G)[0].move, 0));
  await t('حركات من غير فرع بتبان للمراجعة ومابتتنقلش', () => { const r = mig.creditBrandMigratePlan([{ phone: 'A', credit: 200 }], { A: [{ amount: 200, branch: '' }] }, G)[0]; eq(r.move, 0); eq(r.noBranch, 200); });
  await t('المعاينة هي الافتراضي — التنفيذ محتاج go:true', () => { const b = extractFn(strip(rd('pos/credit-brand-migrate.js')), 'window.creditBrandMigrate = async function'); const i = b.indexOf('if(!opts.go){'), j = b.indexOf('return plan;', i), k = b.indexOf("action: 'brandMove'"); ok(i > 0 && j > i, 'مفيش خروج للمعاينة'); ok(k > j, 'النقل قبل فحص go'); });

  console.log('\n===============================\nالنتيجة: ' + p + ' ناجح · ' + f + ' فاشل\n===============================\n');
  process.exit(f ? 1 : 0);
})();
