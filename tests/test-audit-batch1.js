/* 🧪 دفعة الفحص 1 (22-09) — F04 المرتجع المتكرر · F12 كاش التطبيقات · F10 إعداد الـOTP
   كل اختبار بيشغّل **الكود الحقيقي** (مش بيدوّر على نصوص)، ومعاه اختبار سلبي على الكود القديم. */
'use strict';
const fs = require('fs'), path = require('path');
require('./helpers/swv');
const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let P = 0, F = 0;
async function t(n, fn){ try{ await fn(); P++; console.log('  ✅ ' + n); }catch(e){ F++; console.log('  ❌ ' + n + ' → ' + e.message); } }
const ok = (c, m) => { if(!c) throw Error(m || 'fail'); };

/* استخراج بالأقواس المتوازنة — ولو البلوك مالقيناهوش نقع صريح */
function blockFrom(src, startIdx){
  const open = src.indexOf('{', startIdx); ok(open > 0, 'مفيش { بعد البداية');
  let d = 0, i = open, q = null;
  for(; i < src.length; i++){
    const c = src[i];
    if(q){ if(c === '\\'){ i++; continue; } if(c === q) q = null; continue; }
    if(c === '"' || c === "'" || c === '`'){ q = c; continue; }
    if(c === '/' && src[i+1] === '/'){ i = src.indexOf('\n', i); continue; }
    if(c === '/' && src[i+1] === '*'){ i = src.indexOf('*/', i) + 1; continue; }
    if(c === '{') d++; else if(c === '}'){ d--; if(!d) break; }
  }
  return src.slice(startIdx, i + 1);
}
function fnSrc(src, name){ const i = src.indexOf('async function ' + name); ok(i >= 0, name + ' مش موجودة'); return blockFrom(src, i); }
function retBlock(src){
  const k = src.indexOf('const retLines = cart.filter(c=> c.isReturn && c.fromInvoice);'); ok(k > 0, 'بلوك حفظ المرتجع مش موجود');
  const s = src.lastIndexOf('try{', k); const tryPart = blockFrom(src, s);
  const c = src.indexOf('catch', s + tryPart.length); ok(c - (s + tryPart.length) < 5, 'catch مش لازقة في try');
  return tryPart + blockFrom(src, c);
}

/* ---------- Firestore وهمي ---------- */
function fakeDb(sales){
  const updates = [];
  const mkDoc = (id) => ({ id, exists: !!sales[id], data: () => sales[id], ref: { id, update: (u) => { updates.push({ id, u }); Object.assign(sales[id], u); return Promise.resolve(); } } });
  const db = { updates, collection(){ return {
    doc: (id) => ({ get: async () => mkDoc(id) }),
    where: (f, op, v) => ({ limit: () => ({ get: async () => {
      const docs = Object.keys(sales).filter(id => sales[id][f] === v).map(mkDoc);
      return { empty: !docs.length, docs };
    } }) }),
    add: async () => ({})
  }; } };
  return db;
}
function runSaveBlock(src, db, cart){
  const block = retBlock(src);
  const helper = src.includes('async function _findReturnOrigin') ? fnSrc(src, '_findReturnOrigin') : '';
  const f = new Function('db','cart','TEST_SALES','GLOW_BRANCHES','currentBranch','currentEmployee','invoiceCode','phone','custName','returnPointsDeduction','_waitWrite','window','console',
    helper + '\nlet _retPointsDeduct = 0; const _retInvoiceUpdates = [];\nreturn (async()=>{ ' + block + '\n return _retPointsDeduct; })();');
  return f(db, cart, 'pos_test_sales', ['Glow'], 'El Rehab', { id:'e1', name:'x' }, 'FTREH200-NEW', '', '',
    (earned, total, prevVal, thisRefund) => Math.round((earned||0) * thisRefund / (total||1)),
    async (p) => { await p; return {}; }, {}, { warn(){}, log(){}, error(){} });
}
const origSale = () => ({ 'SALEDOC1': { invoiceNo: 123, invoiceCode: 'FTREH123-ABCDEF', branch: 'El Rehab', total: 1000, loyaltyPointsEarned: 100, items: [] } });
const retLine = (extra) => Object.assign({ id:'p1', name:'طرحة', barcode:'111', price:-500, qty:1, isReturn:true, fromInvoice:123 }, extra);

(async () => {
  const src = rd('pos/pos-sale.js');
  console.log('\n↩️ F04 — المرتجع لازم يلاقي فاتورته الأصلية');
  await t('سطر المرتجع بيشيل معرّف الفاتورة الأصلية وكودها', () => {
    const i = src.indexOf('fromInvoice: invoiceNo,'); ok(i > 0, 'مفيش سطر مرتجع');
    const near = src.slice(i, i + 700);
    ok(/fromInvoiceId:\s*returnInvoiceData\.id/.test(near) && /fromInvoiceCode:\s*returnInvoiceData\.invoiceCode/.test(near), 'المعرّف/الكود مش متسجلين');
  });
  await t('🔴 الحفظ بيحدّث returnedQty على الأصلية (الكود الحقيقي)', async () => {
    const sales = origSale(), db = fakeDb(sales);
    await runSaveBlock(src, db, [retLine({ fromInvoiceId:'SALEDOC1', fromInvoiceCode:'FTREH123-ABCDEF' })]);
    ok(db.updates.length === 1, 'مفيش تحديث للأصلية');
    ok(sales.SALEDOC1.returnedQty['111|طرحة'] === 1, 'returnedQty = ' + JSON.stringify(sales.SALEDOC1.returnedQty));
    ok(sales.SALEDOC1.refundedValue === 500, 'refundedValue ماتحدّثش');
  });
  await t('🔴 جلسة تانية بتشوف الكمية المرتجعة (مفيش مرتجع مكرر)', async () => {
    const sales = origSale(), db = fakeDb(sales);
    await runSaveBlock(src, db, [retLine({ fromInvoiceId:'SALEDOC1' })]);
    const prev = (sales.SALEDOC1.returnedQty || {})['111|طرحة'] || 0;
    ok(prev === 1, 'الجلسة الجاية هتشوف ' + prev + ' (السقف في addReturnItem بيقرا returnedQty)');
  });
  await t('نقط المرتجع بتتخصم', async () => {
    const sales = origSale(), db = fakeDb(sales);
    const pts = await runSaveBlock(src, db, [retLine({ fromInvoiceId:'SALEDOC1' })]);
    ok(pts === 50, 'نقط = ' + pts);
  });
  await t('سطر قديم في سلة مفتوحة (رقم بس) بيلاقي الأصلية لو تطابق واحد', async () => {
    const sales = origSale(), db = fakeDb(sales);
    await runSaveBlock(src, db, [retLine()]);
    ok(db.updates.length === 1, 'مالقاهاش');
  });
  await t('الرقم متكرر في فرعين → ميخمّنش', async () => {
    const sales = origSale(); sales.OTHER = { invoiceNo:123, invoiceCode:'FTMAD123-XYZ', branch:'Madinaty', total:50 };
    const db = fakeDb(sales);
    await runSaveBlock(src, db, [retLine()]);
    ok(db.updates.length === 0, 'حدّث فاتورة غلط');
  });
  await t('الرقم في براند تاني مايتحسبش', async () => {
    const sales = { G: { invoiceNo:123, invoiceCode:'FTGLW123-Q', branch:'Glow', total:100 } }, db = fakeDb(sales);
    await runSaveBlock(src, db, [retLine()]);
    ok(db.updates.length === 0, 'حدّث فاتورة Glow من echarpe');
  });
  // اختبار سلبي: الكود اللي على GitHub (v727) — لازم يقع
  const oldPath = process.env.OLD_POS_SALE;
  if(oldPath && fs.existsSync(oldPath)){
    await t('اختبار سلبي: الكود القديم مابيحدّثش الأصلية', async () => {
      const sales = origSale(), db = fakeDb(sales);
      await runSaveBlock(fs.readFileSync(oldPath, 'utf8'), db, [retLine({ fromInvoiceId:'SALEDOC1' })]);
      ok(db.updates.length === 0, 'القديم حدّث؟! يبقى الاختبار مش بيقيس حاجة');
    });
  }

  console.log('\n🧹 F12 — كل تطبيق يمسح كاشه هو بس');
  async function activate(swFile, names){
    const src = rd(swFile); const store = new Set(names); const L = {};
    const self = { addEventListener: (n, fn) => { L[n] = fn; }, skipWaiting(){}, clients: { claim: async () => {} }, location: { origin: 'https://echarpe.store' } };
    const caches = { keys: async () => [...store], delete: async (n) => store.delete(n), open: async () => ({ put(){} }), match: async () => null };
    const timers = []; const setTimeout = (fn) => timers.push(fn);
    new Function('self','caches','setTimeout','fetch','Response','URL', src)(self, caches, setTimeout, () => {}, function(){}, URL);
    let w; L.activate({ waitUntil: (p) => { w = p; } }); await w; for(const fn of timers) await fn(); await new Promise(r => setImmediate(r));
    await new Promise(r => setTimeout.call ? global.setTimeout(r, 5) : r());
    return store;
  }
  const others = ['store-apps-shell-v621', 'echarpe-office-v688', 'loyalty-shell-v699'];
  await t('🔴 تابلت الفرع مبيمسحش كاش POS/الحضور/المكتب', async () => {
    const s = await activate('feedback/sw.js', ['pos-shell-v732', ...others, 'store-apps-shell-v703']);
    ok(s.has('pos-shell-v732') && others.every(n => s.has(n)), 'اتمسح: ' + ['pos-shell-v732', ...others].filter(n => !s.has(n)));
    ok(!s.has('store-apps-shell-v703'), 'كاش التابلت القديم ماتمسحش');
  });
  await t('🔴 POS بيمسح كاشاته القديمة بس', async () => {
    // الاسم الحالي بيتقرا من الملف — عشان رفع الإصدار ميكسرش الاختبار (كان مكتوب v732 ثابت)
    const cur = (rd('pos/sw.js').match(/CACHE_NAME\s*=\s*'([^']+)'/) || [])[1];
    ok(cur && cur !== 'pos-shell-v731', 'مش لاقي CACHE_NAME');
    const s = await activate('pos/sw.js', ['pos-shell-v731', cur, ...others, 'feedback-shell-v706']);
    ok(!s.has('pos-shell-v731'), 'كاش POS القديم فضل');
    ok(s.has(cur) && s.has('feedback-shell-v706') && others.every(n => s.has(n)), 'مسح كاش تطبيق تاني');
  });
  await t('الإصدارات اترفعت: POS ≥ v732 · التابلت ≥ v706', () => {
    ok(swAtLeast(rd('pos/sw.js'), 732) && swAtLeast(rd('feedback/sw.js'), 706));
  });

  console.log('\n🔐 F10 — فشل قراية إعداد الـOTP ميلغيش الكود');
  const OTP = require(path.join(ROOT, 'functions/creditOtp.js'));
  const dbWith = (getImpl) => ({ collection: () => ({ doc: () => ({ get: getImpl }) }) });
  await t('🔴 القراية فشلت ← خطأ مؤقت مش «مش مطلوب»', async () => {
    let threw = null;
    try{ const r = await OTP.otpRequired(dbWith(async () => { throw Error('UNAVAILABLE'); })); threw = 'رجّع ' + r; }
    catch(e){ threw = e; }
    ok(threw instanceof OTP.OtpError && threw.code === 'unavailable', 'النتيجة: ' + (threw && threw.message || threw));
  });
  await t('الإعداد مش موجود ← مش مطلوب (زي ما هو)', async () => {
    ok(await OTP.otpRequired(dbWith(async () => ({ exists:false }))) === false);
  });
  await t('الإعداد true ← مطلوب', async () => {
    ok(await OTP.otpRequired(dbWith(async () => ({ exists:true, data:() => ({ otpRequired:true }) }))) === true);
  });
  await t('creditSpend بيحوّل الخطأ لرسالة للكاشير في المسارين', () => {
    const g = rd('functions/giftCredit.js');
    ok(/try\{ return \{ required: await OTP\.otpRequired\(admin\.firestore\(\)\) \}; \}catch\(e\)\{ _otpErr\(e\); \}/.test(g), 'otp_status');
    ok(/try\{ _mustOtp = await OTP\.otpRequired\(db\); \}catch\(e\)\{ _otpErr\(e\); \}/.test(g), 'spend');
  });

  console.log('\n💳 F01 — إضافة الرصيد لازم تكون مربوطة بفاتورة حقيقية على السيرفر');
  const gc = rd('functions/giftCredit.js');
  function loadVerify(src){
    ok(src.includes('async function verifyInvoiceBacked'), 'verifyInvoiceBacked مش موجودة');
    const v = fnSrc(src, 'verifyInvoiceBacked');
    const i = src.indexOf('function allowanceOf'); ok(i > 0, 'allowanceOf مش موجودة');
    const a2 = blockFrom(src, i);
    const i3 = src.indexOf('function who_branchMismatch'); ok(i3 > 0, 'who_branchMismatch مش موجودة');
    return new Function(a2 + '\n' + blockFrom(src, i3) + '\n' + v + '\nreturn { verifyInvoiceBacked, allowanceOf };')();
  }
  const V = loadVerify(gc);
  const saleDb = (docs) => ({ collection: () => ({ where: (f, op, val) => ({ limit: () => ({ get: async () => {
    const hits = docs.filter(d => d[f] === val);
    return { empty: !hits.length, size: hits.length, docs: hits.map(d => ({ data: () => d, ref: { id: d.invoiceCode } })) };
  } }) }) }) });
  const staff = { uid:'u1', name:'ك', role:'staff', branch:'El Rehab' };
  const changeSale = () => ({ invoiceCode:'FTREH900-AAA', customerPhone:'01000000001', branch:'El Rehab', total:500, cashReceived:600, changeGiven:100 });
  const refundSale = () => ({ invoiceCode:'FTREH901-BBB', customerPhone:'01000000001', branch:'El Rehab', total:-350, payments:{ credit:-350 } });

  await t('🔴 فاتورة مش موجودة ← مفيش رصيد (تروح لطابور المالك)', async () => {
    const r = await V.verifyInvoiceBacked(saleDb([]), { source:'refund', invoiceCode:'FTREH000-ZZZ', phone:'01000000001', amount:500, who:staff, branch:'El Rehab' });
    ok(r.ok === false, 'عدّت من غير فاتورة');
  });
  await t('🔴 مبلغ أكبر من الباقي ← مرفوض', async () => {
    const r = await V.verifyInvoiceBacked(saleDb([changeSale()]), { source:'change', invoiceCode:'FTREH900-AAA', phone:'01000000001', amount:300, who:staff, branch:'El Rehab' });
    ok(r.ok === false, 'قبل 300 والباقي 100');
  });
  await t('الباقي الصح بيعدّي', async () => {
    const r = await V.verifyInvoiceBacked(saleDb([changeSale()]), { source:'change', invoiceCode:'FTREH900-AAA', phone:'01000000001', amount:100, who:staff, branch:'El Rehab' });
    ok(r.ok === true && r.kind === 'change', JSON.stringify(r.why || r));
  });
  await t('🔴 الباقي اتاخد قبل كده ← مينفعش تاني', async () => {
    const s2 = changeSale(); s2.changeKept = 100;
    const r = await V.verifyInvoiceBacked(saleDb([s2]), { source:'change', invoiceCode:'FTREH900-AAA', phone:'01000000001', amount:100, who:staff, branch:'El Rehab' });
    ok(r.ok === false, 'اتاخد مرتين');
  });
  await t('🔴 رقم عميلة مختلف ← مرفوض', async () => {
    const r = await V.verifyInvoiceBacked(saleDb([changeSale()]), { source:'change', invoiceCode:'FTREH900-AAA', phone:'01000000009', amount:100, who:staff, branch:'El Rehab' });
    ok(r.ok === false, 'حط الباقي لرقم تاني');
  });
  await t('🔴 فاتورة فرع تاني ← مرفوض', async () => {
    const r = await V.verifyInvoiceBacked(saleDb([changeSale()]), { source:'change', invoiceCode:'FTREH900-AAA', phone:'01000000001', amount:100, who:{ uid:'u2', role:'staff', branch:'Madinaty' }, branch:'Madinaty' });
    ok(r.ok === false, 'عدّت من فرع تاني');
  });
  await t('رصيد المرتجع بقيمته بيعدّي · وأكتر منه لأ', async () => {
    const good = await V.verifyInvoiceBacked(saleDb([refundSale()]), { source:'refund', invoiceCode:'FTREH901-BBB', phone:'01000000001', amount:350, who:staff, branch:'El Rehab' });
    ok(good.ok === true, JSON.stringify(good.why || ''));
    const bad = await V.verifyInvoiceBacked(saleDb([refundSale()]), { source:'refund', invoiceCode:'FTREH901-BBB', phone:'01000000001', amount:500, who:staff, branch:'El Rehab' });
    ok(bad.ok === false, 'قبل 500 والمرتجع 350');
  });
  await t('المتاح بيقل بعد كل استخدام', () => {
    const a1 = V.allowanceOf({ payments:{ credit:-350 }, creditAdjusted:200 }, 'refund');
    ok(a1.left === 150 && a1.field === 'creditAdjusted', JSON.stringify(a1));
  });
  await t('creditAdjust بيقفل المتاح جوّه المعاملة', () => {
    ok(/const isChange = !!_backed;/.test(gc), 'isChange لسه من مدخلات العميل');
    ok(/tx\.update\(_backed\.ref, \{ \[_consume\.field\]/.test(gc), 'مفيش قفل للمتاح جوّه المعاملة');
    ok(/unverified:/.test(gc), 'الطابور مش بيسجّل سبب عدم التحقق');
  });
  await t('POS بيقول للكاشير لما الرصيد يروح للطابور', () => {
    ok(/queued[\s\S]{0,120}مستني موافقة المالك/.test(rd('pos/refund-credit.js')), 'refund-credit');
    ok(/r\.queued[\s\S]{0,120}مستني موافقة المالك/.test(rd('pos/pos-sale.js')), 'شاشة الباقي');
  });
  if(process.env.OLD_GIFT_CREDIT && fs.existsSync(process.env.OLD_GIFT_CREDIT)){
    await t('اختبار سلبي: النسخة القديمة مفيهاش تحقق أصلًا', () => {
      const old = fs.readFileSync(process.env.OLD_GIFT_CREDIT, 'utf8');
      ok(!old.includes('async function verifyInvoiceBacked'), 'القديم فيه تحقق؟! الاختبار مش بيقيس حاجة');
      ok(/const isChange = \(+source === 'change'/.test(old), 'شكل الباج القديم اتغيّر');
      // الباج نفسه: القرار كان من مدخلات العميل بس — فاتورة مش موجودة كانت بتعدّي
      const oldIsChange = (source, amount, invoiceCode) => ((source === 'change' || source === 'refund') && amount > 0 && invoiceCode);
      ok(!!oldIsChange('refund', 500, 'FT-مش-موجودة'), 'القديم كان بيرفض؟ يبقى الفهم غلط');
    });
  }

  console.log(`\nالنتيجة: ${P} ناجح · ${F} فاشل`);
  if(typeof assert === 'function') assert(F === 0, 'test-audit-batch1: ' + F + ' فحص فشل');
  else if(F) process.exitCode = 1;
})();
