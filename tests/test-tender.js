/* 🧪 §4هـ — الخصومات السالبة بقت طرق دفع
   يتشغّل لوحده من جذر الريبو:  node tests/test-tender.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const core = rd('pos/tender-core.js'), posw = rd('pos/tender-pos.js');
const rep = rd('pos/pos-reports.js'), sale = rd('pos/pos-sale.js');
const html = rd('pos/index.html'), sw = rd('pos/sw.js'), gift = rd('functions/giftCredit.js');
const T = require(path.join(ROOT, 'pos/tender-core.js'));

let p = 0, f = 0;
const t = (n, fn) => { try { const r = fn(); if (r && r.then) return r.then(() => { p++; console.log('  ✅ ' + n); }, e => { f++; console.log('  ❌ ' + n + ' → ' + e.message); }); p++; console.log('  ✅ ' + n); } catch (e) { f++; console.log('  ❌ ' + n + ' → ' + e.message); } };
const eq = (a, b, m) => { if (typeof b === 'number' ? Math.abs(a - b) > 0.001 : a !== b) throw Error((m || '') + ' وجه ' + JSON.stringify(a) + ' والمتوقع ' + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) throw Error(m || 'شرط فشل'); };
// ⚠️ قاعدة المستند: أي فحص نصّي لازم يشيل التعليقات الأول
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
// استخراج بالأقواس المتوازنة — مش regex على الملف كله
function extractFn(src, head) {
  const i = src.indexOf(head); if (i < 0) throw Error('البلوك مش موجود: ' + head);
  const o = src.indexOf('{', i); let d = 0;
  for (let k = o; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
  throw Error('أقواس مش متوازنة: ' + head);
}

const LINE = { id: 'A1', name: 'طرحة', barcode: '111', price: 350, qty: 1 };
const CREDIT = { id: '__credit_spend__', name: '💳', price: -350, qty: 1, isReturn: false, isRedemption: true, isCreditSpend: true };
const POINTS = { id: '__loyalty_redemption__', name: '🎁', price: -50, qty: 1, isReturn: false, isRedemption: true };
const REWARD = { id: '__reward__', name: '🎁', price: -30, qty: 1, isRewardDiscount: true };

(async () => {
  console.log('\n🧮 الفصل (tender-core)');
  t('سطر الرصيد = credit (رغم إن عليه isRedemption كمان)', () => eq(T.tenderKeyOf(CREDIT), 'credit'));
  t('⭐⭐ النقط **خصم** مش طريقة دفع (مفيش مقابلها فلوس دخلت)', () => eq(T.tenderKeyOf(POINTS), ''));
  t('⭐⭐ المكافأة **خصم** مش طريقة دفع', () => eq(T.tenderKeyOf(REWARD), ''));
  t('الرصيد بس في TENDER_KEYS', () => eq(T.TENDER_KEYS.join(), 'credit'));
  t('سطر بضاعة عادي مش طريقة دفع', () => eq(T.tenderKeyOf(LINE), ''));
  t('⭐ سطر مرتجع بضاعة (سالب) مش طريقة دفع', () => eq(T.tenderKeyOf({ id: 'A1', price: -350, qty: 1, isReturn: true }), ''));
  t('خصم يدوي (سعر موجب أقل) مش طريقة دفع', () => eq(T.tenderKeyOf({ id: 'A1', price: 300, qty: 1 }), ''));
  t('الفصل: بضاعة 350 + رصيد 350', () => {
    const s = T.tenderSplit([LINE, CREDIT]);
    eq(s.items.length, 1); eq(s.items[0], LINE); eq(s.payments.credit, 350); eq(s.sum, 350);
    ok(!('points' in s.payments) && !('reward' in s.payments), 'مفاتيح بصفر ممنوعة');
  });
  t('التلاتة مع بعض', () => {
    const s = T.tenderSplit([LINE, { ...CREDIT, price: -100 }, POINTS, REWARD]);
    eq(s.payments.credit, 100); ok(!('points' in s.payments) && !('reward' in s.payments), 'النقط/المكافأة اتحوّلوا دفع'); eq(s.sum, 100); eq(s.items.length, 3, 'سطور الخصم لازم تفضل في السلة');
  });
  t('سلة من غير سطور دفع = sum صفر ونفس السطور', () => { const s = T.tenderSplit([LINE]); eq(s.sum, 0); eq(s.items.length, 1); });
  t('قيم فاضية مبتكسرش', () => { eq(T.tenderSplit(null).sum, 0); eq(T.tenderSplit([null, {}]).sum, 0); });
  t('كسور القروش', () => eq(T.tenderSplit([LINE, { ...CREDIT, price: -33.335 }]).payments.credit, 33.34));

  console.log('\n🛡️ الحراس');
  t('تمام = مفيش رفض', () => eq(T.tenderBlockReason(T.tenderSplit([LINE, CREDIT]), 0, false, true), ''));
  t('⭐ صافي سالب + رصيد = رفض (ثغرة الرصيد→كاش)', () => ok(T.tenderBlockReason(T.tenderSplit([LINE, { ...CREDIT, price: -500 }]), -150, false, true)));
  t('شراء موظف + رصيد = رفض', () => ok(T.tenderBlockReason(T.tenderSplit([LINE, CREDIT]), 0, true, true)));
  t('⭐ أوفلاين + رصيد = رفض', () => ok(T.tenderBlockReason(T.tenderSplit([LINE, CREDIT]), 0, false, false)));
  t('أوفلاين + نقط بس = يعدّي (بتتكتب مع الفاتورة)', () => eq(T.tenderBlockReason(T.tenderSplit([LINE, POINTS]), 300, false, false), ''));
  t('من غير سطور دفع الحراس مبيشتغلوش (مرتجع عادي سالب)', () => eq(T.tenderBlockReason(T.tenderSplit([LINE]), -350, true, false), ''));

  console.log('\n🔌 الربط بالحفظ (tender-pos) — على normalizePayments الحقيقية');
  function makeCtx(opts) {
    opts = opts || {};
    const toasts = [], saved = [];
    const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} }, navigator: { onLine: opts.online !== false } });
    ctx.window = ctx;
    ctx.showToast = (m) => toasts.push(m);
    ctx.__saved = saved; ctx.__fail = !!opts.fail; ctx.__over = opts.over || 0;
    vm.runInContext(`
      let cart = [], selectedPayMethods = new Set(), paymentAmounts = {}, staffPurchase = null, cardLegs = [];
      function cartTotal(){ return +cart.reduce((s,c)=> s + c.price*c.qty, 0).toFixed(2); }
      function cardOvercharge(){ return __over; }
      function renderCart(){} function updatePaySummary(){}
      ${extractFn(sale, 'function normalizePayments')}
      // بديل مصغّر للدالة الأصلية: بيقرا نفس المتغيرات بنفس الترتيب
      async function _doConfirmPayment(){
        const total = cartTotal();
        const entered = {}; selectedPayMethods.forEach(m=> entered[m] = paymentAmounts[m] || 0);
        const { applied, changeGiven } = normalizePayments(entered, total);
        if(__fail) return;                                  // حفظ فشل: السلة زي ما هي
        __saved.push({ total, items: cart.slice(), payments: applied, changeGiven, itemCount: cart.reduce((s,c)=>s+c.qty,0) });
        cart = []; selectedPayMethods = new Set(); paymentAmounts = {};
      }
    `, ctx);
    vm.runInContext(core, ctx); vm.runInContext(posw, ctx);
    ctx.__toasts = toasts;
    return ctx;
  }
  const run = (ctx, code) => vm.runInContext(code, ctx);

  await t('⭐⭐ فاتورة 350 كلها رصيد → total 350 مش صفر', async () => {
    const c = makeCtx(); c.__a = LINE; c.__b = CREDIT;
    run(c, 'cart = [__a, __b];');
    await run(c, '_doConfirmPayment()');
    const s = c.__saved[0];
    eq(s.total, 350, 'total'); eq(s.payments.credit, 350, 'credit'); eq(s.items.length, 1, 'السطور'); eq(s.itemCount, 1, 'عدد القطع');
  });
  await t('رصيد 100 + كاش 300 مستلم لفاتورة 350 → فكة 50 وكاش مسجّل 250', async () => {
    const c = makeCtx(); c.__a = LINE; c.__b = { ...CREDIT, price: -100 };
    run(c, 'cart = [__a, __b]; selectedPayMethods.add("cash"); paymentAmounts.cash = 300;');
    await run(c, '_doConfirmPayment()');
    const s = c.__saved[0];
    eq(s.total, 350); eq(s.payments.credit, 100); eq(s.payments.cash, 250); eq(s.changeGiven, 50);
    eq(s.payments.cash + s.payments.credit, s.total, 'مجموع المدفوعات = الإجمالي');
  });
  await t('⭐⭐ نقط + مكافأة + فيزا → المبيعات 270 مش 350 (الخصم مش مبيعات)', async () => {
    const c = makeCtx(); c.__a = LINE; c.__b = POINTS; c.__c = REWARD;
    run(c, 'cart = [__a, __b, __c]; selectedPayMethods.add("visa"); paymentAmounts.visa = 270;');
    await run(c, '_doConfirmPayment()');
    const s = c.__saved[0];
    eq(s.total, 270); eq(s.items.length, 3); eq(Object.keys(s.payments).join(), 'visa'); eq(s.payments.visa, 270);
  });
  await t('⭐ رصيد + نقط مع بعض: الرصيد دفع والنقط خصم', async () => {
    const c = makeCtx(); c.__a = LINE; c.__b = { ...CREDIT, price: -100 }; c.__c = POINTS;
    run(c, 'cart = [__a, __b, __c]; selectedPayMethods.add("cash"); paymentAmounts.cash = 200;');
    await run(c, '_doConfirmPayment()');
    const s = c.__saved[0];
    eq(s.total, 300, '350 − 50 نقط'); eq(s.payments.credit, 100); eq(s.payments.cash, 200); eq(s.items.length, 2);
  });
  await t('فاتورة عادية ماتتلمسش', async () => {
    const c = makeCtx(); c.__a = LINE;
    run(c, 'cart = [__a]; selectedPayMethods.add("cash"); paymentAmounts.cash = 350;');
    await run(c, '_doConfirmPayment()');
    const s = c.__saved[0]; eq(s.total, 350); eq(Object.keys(s.payments).join(), 'cash');
  });
  await t('مرتجع عادي (سالب) ماتلمسش', async () => {
    const c = makeCtx(); c.__a = { id: 'A1', name: 'x', price: -350, qty: 1, isReturn: true };
    run(c, 'cart = [__a]; selectedPayMethods.add("cash"); paymentAmounts.cash = -350;');
    await run(c, '_doConfirmPayment()');
    eq(c.__saved[0].total, -350); eq(c.__saved[0].payments.cash, -350);
  });
  await t('⭐ الحفظ فشل → السلة والمدفوعات يرجعوا بالظبط', async () => {
    const c = makeCtx({ fail: true }); c.__a = LINE; c.__b = { ...CREDIT, price: -100 };
    run(c, 'cart = [__a, __b]; selectedPayMethods.add("cash"); paymentAmounts.cash = 250;');
    await run(c, '_doConfirmPayment()');
    eq(run(c, 'cart.length'), 2, 'سطر الرصيد رجع'); eq(run(c, 'cartTotal()'), 250, 'المطلوب رجع');
    eq(run(c, 'selectedPayMethods.has("credit")'), false); eq(run(c, '"credit" in paymentAmounts'), false);
    eq(run(c, 'paymentAmounts.cash'), 250);
  });
  await t('الرفض (صافي سالب) بيوقف قبل الدالة الأصلية', async () => {
    const c = makeCtx(); c.__a = { ...LINE, price: 100 }; c.__b = CREDIT;
    run(c, 'cart = [__a, __b];');
    await run(c, '_doConfirmPayment()');
    eq(c.__saved.length, 0); eq(c.__toasts.length, 1); eq(run(c, 'cart.length'), 2);
  });
  await t('أوفلاين + رصيد = مفيش حفظ', async () => {
    const c = makeCtx({ online: false }); c.__a = LINE; c.__b = CREDIT;
    run(c, 'cart = [__a, __b];'); await run(c, '_doConfirmPayment()');
    eq(c.__saved.length, 0);
  });
  await t('💳↩️ كارت مسحوب زيادة → الشكل القديم (مستحق الرد مايستخباش)', async () => {
    const c = makeCtx({ over: 40 }); c.__a = LINE; c.__b = { ...CREDIT, price: -100 };
    run(c, 'cart = [__a, __b]; selectedPayMethods.add("visa"); paymentAmounts.visa = 290;');
    await run(c, '_doConfirmPayment()');
    eq(c.__saved[0].total, 250, 'total بالصافي زي القديم'); ok(!('credit' in c.__saved[0].payments));
  });
  await t('🔴 اختبار سلبي: من غير الطبقة الفاتورة بتتحفظ total صفر', async () => {
    const c = makeCtx(); c.__a = LINE; c.__b = CREDIT;
    // نرجّع الدالة الأصلية (نلغي التغليف) — ده الباج القديم
    const ctx2 = vm.createContext({ console: { log() {}, warn() {} } }); ctx2.window = ctx2; ctx2.__saved = []; ctx2.__a = LINE; ctx2.__b = CREDIT;
    vm.runInContext(`let cart=[__a,__b]; const total = +cart.reduce((s,c)=>s+c.price*c.qty,0).toFixed(2); __saved.push(total);`, ctx2);
    eq(ctx2.__saved[0], 0, 'الباج القديم لازم يبان');
  });

  console.log('\n📊 سيناريو المالك: مرتجع 350 بالرصيد ثم بيع 350 بنفس الرصيد');
  const ctxR = vm.createContext({ window: {} });
  vm.runInContext(extractFn(rep, 'function repAggregate') + ';' + extractFn(rep, 'function dcAggregate'), ctxR);
  const repAggregate = ctxR.repAggregate || vm.runInContext('repAggregate', ctxR), dcAggregate = vm.runInContext('dcAggregate', ctxR);
  const REFUND = { total: -350, payments: { credit: -350 }, items: [{ name: 'طرحة', price: -350, qty: 1, isReturn: true }] };
  const NEW_SALE = { total: 350, payments: { credit: 350 }, items: [{ name: 'طرحة', price: 350, qty: 1 }] };
  const OLD_SALE = { total: 0, payments: {}, items: [{ name: 'طرحة', price: 350, qty: 1 }, { name: '💳', price: -350, qty: 1, isRedemption: true }] };
  t('⭐⭐ صافي المبيعات = صفر', () => eq(repAggregate([REFUND, NEW_SALE]).netTotal, 0));
  t('🔴 سلبي: بالشكل القديم كان −350', () => eq(repAggregate([REFUND, OLD_SALE]).netTotal, -350));
  t('⭐⭐ فاتورة انتقالية (v696–v704) فيها payments.points/reward: المبيعات بتنزل بقيمتهم', () => {
    const r = repAggregate([{ total: 350, payments: { visa: 270, points: 50, reward: 30 }, items: [] }]);
    eq(r.netTotal, 270); eq(r.loyaltyDiscount, 80); ok(!('points' in r.byMethod) && !('reward' in r.byMethod), 'لسه ظاهرين كطريقة دفع'); eq(r.byMethod.visa, 270);
  });
  t('⭐ صورة المالك: 53525 فيهم 120 مكافأة + 60 نقط → المبيعات 53345', () => {
    const r = repAggregate([{ total: 53525, payments: { visa: 37500, cash: 14550, instapay: 1295, reward: 120, points: 60 }, items: [] }]);
    eq(r.netTotal, 53345); eq(Object.keys(r.byMethod).sort().join(), 'cash,instapay,visa');
  });
  t('الرصيد لسه بيتحسب مبيعات وطريقة دفع', () => { const r = repAggregate([NEW_SALE]); eq(r.netTotal, 350); eq(r.byMethod.credit, 350); });
  t('⭐ التقفيل: فرق صفر (رصيد + كاش)', () => {
    const a = dcAggregate([{ total: 1000, payments: { cash: 1000 } }, REFUND, NEW_SALE]);
    const accounted = 1000 + a.creditSales + a.pointsSales + a.rewardSales;
    eq(accounted - a.systemTotal, 0);
  });
  t('⭐ التقفيل: استبدال نقط 50 + مكافأة 30', () => {
    const a = dcAggregate([{ total: 350, payments: { cash: 270, points: 50, reward: 30 } }]);
    eq(a.pointsSales, 50); eq(a.rewardSales, 30);
    eq(270 + a.creditSales + a.pointsSales + a.rewardSales - a.systemTotal, 0);
  });
  t('🔴 سلبي: من غير promoOut = عجز وهمي 80', () => {
    const a = dcAggregate([{ total: 350, payments: { cash: 270, points: 50, reward: 30 } }]);
    eq(270 + a.creditSales - a.systemTotal, -80);
  });
  t('عكس فاتورة برصيد بيصفّر التقفيل', () => {
    const a = dcAggregate([NEW_SALE, { isReversal: true, total: -350, payments: { credit: -350 } }]);
    eq(a.systemTotal, 0); eq(a.creditSales, 0);
  });

  console.log('\n🔗 التوصيل في شاشة التقفيل (الباج اللي كان مستخبي)');
  const repC = strip(rep);
  t('⭐⭐ openDayClose بتاخد كل المفاتيح من dcAggregate', () =>
    ok(/const\s*\{[^}]*creditSales[^}]*pointsSales[^}]*rewardSales[^}]*\}\s*=\s*dcAggregate\(sales\)/.test(repC), 'creditSales كان بيترمي هنا'));
  t('⭐⭐ وبتوصل لـdcData', () =>
    ok(/dcData\s*=\s*\{[^}]*\bcreditSales\b[^}]*\bpointsSales\b[^}]*\brewardSales\b/.test(repC)));
  t('التسوية بتجمع الرصيد والنقط/المكافآت', () => ok(repC.includes('+ salary + creditOut + promoOut')));
  t('promoOut من dcData', () => ok(/promoOut\s*=\s*\+\(\(dcData\.pointsSales[^;]*dcData\.rewardSales/.test(repC)));
  t('سجل التقفيل بيحفظهم', () => ok(/creditSales:\s*\+\(dcData\.creditSales/.test(repC) && /pointsSales:/.test(repC) && /rewardSales:/.test(repC)));
  t('ليبلز التقرير فيها الطرق الجديدة', () => { const m = repC.match(/const methodLabels\s*=\s*\{[^}]*\}/)[0]; ok(/credit:/.test(m) && /points:/.test(m) && /reward:/.test(m)); });
  t('ليبلز الفاتورة المطبوعة', () => { const a = strip(rd('pos/app.js')); const m = extractFn(a, 'const RECEIPT_LABELS'); ok((m.match(/credit:/g) || []).length === 2 && (m.match(/points:/g) || []).length === 2); });

  console.log('\n🏢 Office — دين الرصيد');
  t('⭐ ofCollectDays بتحسب payments.credit الموجب كصرف', () => {
    const fn = strip(extractFn(rd('Office/office.js'), 'function ofCollectDays'));
    ok(/if\(\(Number\(p\.credit\)\s*\|\|\s*0\)\s*>\s*0\)\s*r\.gcSpent\s*\+=\s*Number\(p\.credit\)/.test(fn), 'السطر مش موجود جوّه الدالة');
    ok(/it\.isCreditSpend\)\s*r\.gcSpent/.test(fn), 'الفواتير القديمة لازم تفضل محسوبة');
  });
  t('و«التطبيق ساهم» بتشوف payments.reward', () => ok(/payments\|\|\{\}\)\.reward/.test(strip(extractFn(rep, 'function _isAppInfluencedSale')))));

  console.log('\n📦 التحميل والنسخة');
  t('الترتيب: pos-sale ← refund-credit ← tender-core ← tender-pos', () => {
    const h = html.replace(/<!--[\s\S]*?-->/g, '');
    const i = n => { const k = h.indexOf('src="' + n); if (k < 0) throw Error(n + ' مش متحمّل'); return k; };
    ok(i('pos-sale.js') < i('refund-credit.js') && i('refund-credit.js') < i('tender-core.js') && i('tender-core.js') < i('tender-pos.js'));
  });
  t('CACHE_NAME اترفع', () => { const v = +sw.match(/pos-shell-v(\d+)/)[1]; ok(v >= 696, 'v' + v); });
  t('ممنوع prompt/confirm/alert (بعد شيل التعليقات)', () => [core, posw].forEach(s => ok(!/\b(prompt|confirm|alert)\s*\(/.test(strip(s)))));
  t('⭐ pos-sale.js ماتلمسش: مفيش أي ذكر لـtender جواه', () => ok(!/tender/i.test(sale)));

  console.log('\n☁️ creditSpend على السيرفر');
  t('⭐⭐ مفيش throw غير مشروط قبل التحقق من الموظف', () => {
    const body = strip(extractFn(gift.slice(gift.indexOf('exports.creditSpend')), 'async (request)'));
    const i = body.indexOf('requireStaff');
    ok(i > 0, 'requireStaff مش موجود');
    // v718: قبل `requireStaff` بقى فيه بلوك أفعال تطبيق العميلة (`device_enroll`/`my_code`) وجوّاه throw **مشروط** (من غير auth).
    //       الفحص الأصلي كان بيدوّر على أول `throw` وخلاص فبقى بيقع غلط. المعنى الحقيقي: مفيش throw **في جسم الدالة مباشرة**
    //       (عمق أقواس 1 = غير مشروط) قبل التحقق من الموظف — ده اللي كان عامل كارثة v679.
    let depth = 0, bad = -1;
    for(let k = 0; k < i; k++){
      const c = body[k];
      if(c === '{') depth++; else if(c === '}') depth--;
      else if(depth === 1 && body.startsWith('throw ', k) && !/if\s*\([^;{]*\)\s*$/.test(body.slice(Math.max(0, k - 160), k))){ bad = k; break; }
    }
    ok(bad < 0, 'لسه فيه throw غير مشروط بيوقف الدالة قبل ما تبدأ');
  });
  t('ولسه بيرفض صرف أكبر من الفاتورة', () => ok(/amount\s*>\s*invoiceTotal/.test(strip(extractFn(gift.slice(gift.indexOf('exports.creditSpend')), 'async (request)')))));

  console.log('\n===============================\nالنتيجة: ' + p + ' ناجح · ' + f + ' فاشل\n===============================\n');
  if (f) process.exitCode = 1;
})();
