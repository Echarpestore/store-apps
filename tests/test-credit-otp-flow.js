#!/usr/bin/env node
// ============================================================
// test-credit-otp-flow.js — كود صرف الرصيد: POS + التابلت + التطبيقين
// POS بيتشغّل فعليًا جوّه jsdom (محتاج `npm i`). يتشغّل لوحده: node tests/test-credit-otp-flow.js
// ============================================================
'use strict';
require('./helpers/swv');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const office = fs.readFileSync(path.join(ROOT, 'Office', 'office.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; } else { fail++; console.error('  ❌ ' + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let JSDOM = null; try{ JSDOM = require('jsdom').JSDOM; }catch(e){}

function mkPos(o){
  o = o || {};
  const dom = new JSDOM('<!doctype html><body><input id="customerPhone" value="01011111111"></body>', { runScripts:'outside-only', url:'http://localhost/' });   // url ← عشان localStorage يشتغل (طابور إعادة الخصم)
  const w = dom.window;
  const st = { calls:[], cap:[], capListeners:[], confirms:[], toasts:[], logs:[] };
  const capDoc = { set: d => { st.cap.push(JSON.parse(JSON.stringify(d))); st.capNow = d; return Promise.resolve(); },
                   onSnapshot: cb => { st.capListeners.push(cb); return () => { st.unsub = (st.unsub || 0) + 1; }; } };
  Object.assign(w, {
    TEST_SETTINGS:'pos_test_settings', currentBranch:'echarpe El Rehab',
    cart: o.cart || [{ price:500, qty:1 }], cartTotal: () => w.cart.reduce((s, c) => s + c.price * c.qty, 0), renderCart(){},
    showToast: (m) => st.toasts.push(m), _logActivity: (t, d) => st.logs.push(t),
    askConfirm: (opt) => { st.confirms.push(opt); return Promise.resolve(o.confirm !== false); },
    esc: x => String(x), TEST_SALES:'pos_test_sales',
    // v720: `otp_status` = فحص السيرفر قبل الخصم. بيتسجّل لوحده في `st.status` عشان باقي الفحوصات تفضل على نداءات الكود/الخصم.
    firebase: { app: () => ({ functions: () => ({ httpsCallable: (name) => async (payload) => {
      if(payload && payload.action === 'otp_status'){
        st.status = (st.status || 0) + 1;
        if(o.statusError){ const e = new Error(o.statusError.message); e.code = 'functions/' + o.statusError.code; throw e; }
        return { data: { required: o.required !== false } };
      }
      st.calls.push(Object.assign({ _fn:name }, payload));
      const out = o.server(payload, st);
      if(out && out.__throw){ const e = new Error(out.__throw.message); e.code = 'functions/' + out.__throw.code; throw e; }
      return { data: out };
    } }) }) },
    db: { collection: (c) => ({ doc: (id) => (c === 'pos_capture' ? capDoc : { get: async () => ({ exists:true, data: () => ({ otpRequired: o.required !== false }) }) }),
      where: () => ({ limit: () => ({ get: async () => ({ empty:false, docs:[{ ref:{ update: async (d) => { st.saleMarks = (st.saleMarks || []).concat([d]); } } }] }) }) }) }) }
  });
  w.custCreditBalance = o.balance == null ? 325 : o.balance;
  w.eval(rd('pos/credit-ui.js'));
  w.__st = st;
  return w;
}
const tablet = (w, doc) => w.__st.capListeners.forEach(cb => cb({ exists:true, data: () => doc }));

(async function(){
  if(!JSDOM){ console.log('  ⏭️  تخطّي تشغيل POS — jsdom مش متسطّب (`npm i`)'); }
  else{
    console.log('\n🔓 1) الإعداد مقفول = المسار القديم بالحرف');
    let w = mkPos({ required:false, server: () => ({}) });
    await w.useCustomerCredit();
    ok(w.__st.status === 1 && w.__st.calls.length === 0 && w.cart.some(l => l.isCreditSpend) && w.pendingCreditSpend.approvalId === null, 'من غير كود: الخصم بيتحط زي الأول (المرحلة 1 — مفيش حاجة بتتكسر قبل ما المالك يفعّل)');

    console.log('📵 2) معندهاش التطبيق (قرار المالك ب)');
    w = mkPos({ server: p => p.action === 'otp_request' ? { ok:false, reason:'no_app' } : {} });
    await w.useCustomerCredit();
    ok(!w.cart.some(l => l.isCreditSpend) && !w.pendingCreditSpend, '⛔ مفيش خصم بيتحط على الفاتورة');
    ok(w.__st.cap.some(d => d.mode === 'greet' && d.invite === true), 'والتابلت بيعرض دعوة تحميل التطبيق');
    ok(w.__st.confirms.some(c => /تنزّل التطبيق/.test(c.title)), 'والكاشير بتشوف السبب');

    console.log('🔐 3) المسار الكامل: غلط ← صح');
    w = mkPos({ server: (p) => p.action === 'otp_request' ? { ok:true, expAt: Date.now() + 180000 }
      : p.action === 'otp_verify' ? (p.code === '4827' ? { ok:true, approvalId:'a'.repeat(24), amount:325 } : { ok:false, reason:'wrong', left:2 })
      : { repeat:false, balance:0, spent:325 } });
    const flow = w.useCustomerCredit();
    await sleep(30);
    const first = w.__st.cap.find(d => d.mode === 'otp');
    ok(!!first && /^otp_/.test(first.askId) && first.amount === 325, 'التابلت بياخد طلب `otp` بالمبلغ');
    ok(!!w.document.getElementById('otpWaitOverlay') && !w.cart.some(l => l.isCreditSpend), 'الكاشير على شاشة انتظار — و**الخصم لسه متحطش**');
    ok(w.__st.calls[0].action === 'otp_request' && JSON.stringify(w.__st.calls[0]).indexOf('code') < 0, 'طلب الكود راح للسيرفر');
    tablet(w, { mode:'otp_code', code:'1111', askId:first.askId, ts:Date.now() }); await sleep(30);
    const retry = w.__st.cap.filter(d => d.mode === 'otp').pop();
    ok(retry.err === 'wrong' && retry.left === 2 && !w.cart.some(l => l.isCreditSpend), 'كود غلط من التابلت = التابلت ياخد «غلط، فاضل 2» ومفيش خصم');
    tablet(w, { mode:'otp_code', code:'9999', askId:'otp_someone_else', ts:Date.now() }); await sleep(20);
    ok(w.__st.calls.filter(c => c.action === 'otp_verify').length === 1, 'كود بـaskId مش بتاعنا = بيتجاهل');
    tablet(w, { mode:'otp_code', code:'4827', askId:first.askId, ts:Date.now() }); await flow;
    ok(w.cart.some(l => l.isCreditSpend && l.price === -325) && w.pendingCreditSpend.approvalId === 'a'.repeat(24), '⭐ الكود الصح = الخصم يتحط ومعاه `approvalId`');
    ok(w.__st.cap[w.__st.cap.length - 1].mode === 'otp_ok' && !w.document.getElementById('otpWaitOverlay') && w.__st.unsub === 1, 'التابلت ياخد «تمام» · الشاشة تتقفل · المستمع يتقفل');
    await w.commitCreditSpend('FTR1-ABCDEF', 175);
    const sp = w.__st.calls[w.__st.calls.length - 1];
    ok(!sp.action && sp.approvalId === 'a'.repeat(24) && sp.amount === 325, 'وتثبيت الخصم بعد الفاتورة بيبعت `approvalId` للسيرفر');

    console.log('🧯 4) الحالات الجانبية');
    w = mkPos({ server: p => p.action === 'otp_request' ? { ok:true, expAt: Date.now() + 180000 } : { ok:false, reason:'locked' } });
    let f2 = w.useCustomerCredit(); await sleep(30);
    tablet(w, { mode:'otp_code', code:'0000', askId:w.__st.cap.find(d => d.mode === 'otp').askId }); await f2;
    ok(!w.cart.some(l => l.isCreditSpend) && w.__st.cap[w.__st.cap.length - 1].mode === 'otp_fail', '3 محاولات غلط (locked) = مفيش خصم والتابلت يقول اتقفل');
    w = mkPos({ server: p => ({ ok:true, expAt: Date.now() + 180000 }) });
    f2 = w.useCustomerCredit(); await sleep(30); w.document.getElementById('otpCancelBtn').click(); await f2;
    ok(!w.cart.some(l => l.isCreditSpend) && w.__st.cap[w.__st.cap.length - 1].mode === 'idle' && w._capOtpBusy === false, 'الكاشير لغت = التابلت يتقفل ومفيش خصم');
    w = mkPos({ server: p => ({ ok:true, expAt: Date.now() + 180000 }) });
    f2 = w.useCustomerCredit(); await sleep(30);
    tablet(w, { mode:'idle', by:'kiosk', askId:w.__st.cap.find(d => d.mode === 'otp').askId }); await f2;
    ok(!w.cart.some(l => l.isCreditSpend), 'العميلة لغت من التابلت = مفيش خصم');
    w = mkPos({ server: p => p.action === 'otp_verify' ? { ok:true, approvalId:'b'.repeat(24) } : { ok:true, expAt: Date.now() + 180000 } });
    f2 = w.useCustomerCredit(); await sleep(30); w.cart.push({ price:200, qty:1 });
    tablet(w, { mode:'otp_code', code:'4827', askId:w.__st.cap.find(d => d.mode === 'otp').askId }); await f2;
    ok(!w.cart.some(l => l.isCreditSpend) && w.__st.toasts.some(t => /الفاتورة اتغيّرت/.test(t)), 'السلة اتغيّرت والعميلة بتكتب الكود = مفيش خصم، تتعاد');
    w = mkPos({ server: p => p.action === 'otp_verify' ? { ok:true, approvalId:'c'.repeat(24) } : { ok:true, expAt: Date.now() + 180000 } });
    f2 = w.useCustomerCredit(); await sleep(30);
    w.document.getElementById('otpManual').value = '4827'; w.document.getElementById('otpManualBtn').click(); await f2;
    ok(w.cart.some(l => l.isCreditSpend), 'فولباك: التابلت واقع = الكود يتكتب في POS (لسه جاي من موبايل العميلة)');
  }

  console.log('🖥️ 5) التابلت');
  const kiosk = rd('feedback/index.html');
  const K = { Date, String, Number }; vm.createContext(K);
  vm.runInContext(kiosk.slice(kiosk.indexOf('/* >>> CAP_KIOSK_START */'), kiosk.indexOf('/* <<< CAP_KIOSK_END */')), K);
  const NOW = Date.now();
  let v = K.capKioskView({ mode:'otp', askId:'otp_1', ts:NOW, amount:325, left:3 }, null, NOW + 10, '');
  ok(v.view === 'otp' && v.askId === 'otp_1' && v.amount === 325 && v.err === '', 'طلب كود = شاشة الكود');
  v = K.capKioskView({ mode:'otp', askId:'otp_1', ts:NOW + 5, err:'wrong', left:2 }, null, NOW + 10, '');
  ok(v.err === 'wrong' && v.left === 2 && v.key !== K.capKioskView({ mode:'otp', askId:'otp_1', ts:NOW }, null, NOW + 10, '').key, 'محاولة غلط = رسالة + مفتاح جديد (الخانة تفضى)');
  ok(K.capKioskView({ mode:'otp_code', askId:'otp_1', code:'1234', ts:NOW }, null, NOW + 10, '').view === 'otp_wait', 'بعد ما تكتب = انتظار (الشاشة متتقفلش)');
  v = K.capKioskView({ mode:'otp_ok', askId:'otp_1', ts:NOW }, null, NOW + 10, '');
  ok(v.view === 'otp_done' && v.ok === true && K.capKioskView({ mode:'otp_ok', askId:'otp_1', ts:NOW }, null, NOW + 10, v.key).view === 'hide', '«تمام» مرة واحدة (النبضة متعيدهاش)');
  ok(K.capKioskView({ mode:'otp_fail', askId:'otp_1', ts:NOW, reason:'locked' }, null, NOW + 10, '').reason === 'locked', 'والفشل بسببه');
  ok(K.capKioskView({ mode:'otp', askId:'otp_1', ts:NOW - 6 * 60000 }, null, NOW, '').view === 'hide', 'طلب قديم (6 دقايق) = مخفي');
  ok(K.capKioskView({ mode:'ask', askId:'a1', ts:NOW }, null, NOW + 10, '').view === 'phone', 'ومسار تسجيل الرقم زي ما هو');
  ok(/_capOtp\.replace\(\/\.\/g, '●'\)/.test(kiosk), 'الكود بيظهر **نقط** على التابلت (اللي واقف وراها ميشوفش)');
  ok(/_capWrite\(\{ mode:'otp_code', code: code, ts: Date\.now\(\), askId: _capOtpAsk \}\)/.test(kiosk) && /window\.__capInvite = false;/.test(kiosk), 'بيبعت الكود بنفس askId · ومفيش دعوة تحميل بعد «تمام»');
  ok(/const _capPanes = \['capPanePhone','capPaneName','capPaneGreet','capPaneOtp'\];/.test(kiosk) && /id="capPaneOtp"/.test(kiosk), 'الشاشة متسجّلة في قايمة الشاشات');

  console.log('📱 6) التطبيقين');
  ['loyalty', 'glow'].forEach(app => {
    const a = rd(app + '/index.html');
    const blk = a.slice(a.lastIndexOf('🔐 كود استخدام الرصيد — جهة العميلة'));
    ok(new RegExp("var APP = '" + app + "'").test(blk) && /httpsCallable\('creditSpend'\)/.test(blk), app + ': بينادي `creditSpend` على تطبيق Firebase بتاعه');
    ok(/action:'my_code', phone: phoneNow\(\), deviceKey: devKey\(\)/.test(blk) && /action:'device_enroll'/.test(blk), app + ': بيجيب الكود بمفتاح الجهاز، وبيسجّل الجهاز بالرقم السري');
    ok(/r\.reason === 'enroll'\)\{ askPin\(\); return; \}/.test(blk), app + ': جهاز مش مسجّل = بيسأل عن الرقم السري مرة');
    ok(/getRandomValues/.test(blk) && !/localStorage\.setItem\([^)]*pin/i.test(blk) && /window\.__crPin = '';/.test(blk), app + ': مفتاح الجهاز عشوائي قوي، و**الرقم السري ميتخزّنش**');
    ok(/if\(Date\.now\(\) - at < 3 \* 60 \* 1000\) fetchCode\(false\);/.test(blk), app + ': إشارة كود طازة = بيتعرض فورًا (الإشعارات المقفولة مش مشكلة)');
    ok(/crOtpSignal\(currentCustomer\)/.test(a) && (a.match(/crStashPin\(pin\)/g) || []).length === 2, app + ': متوصّل في تحديث العميلة اللايف وفي خطوتين الرقم السري');
    ok(/go === 'code'\)\{ if\(window\.crFetchCode\) crFetchCode\(true\); \}/.test(a) && /onclick="crFetchCode\(true\)">🔐 كود استخدام الرصيد/.test(a), app + ': إشعار الكود بيفتحه + زرار في «حسابي»');
    ok(/متديش الكود لحد/.test(blk), app + ': تحذير «متديش الكود لحد»');
  });

  console.log('🔢 7) الإصدارات');
  ok(swAtLeast(rd('pos/sw.js'), 718) && swAtLeast(rd('feedback/sw.js'), 699) && swAtLeast(rd('loyalty/sw.js'), 694) && swAtLeast(rd('glow/sw.js'), 79), 'POS ≥ 718 · kiosk ≥ 699 · loyalty ≥ 694 · glow ≥ 79');

  
console.log('🛑 7ب) v720 — «دفعت بالرصيد والفاتورة اتعملت والرصيد متخصمش» (بلاغ المالك 21-09)');
await (async function(){
  if(!JSDOM) return;
  // (أ) السيرفر بيرفض ← الخصم **ميتحطش** على الفاتورة أصلًا
  for(const [code, msg] of [['permission-denied', 'الحساب ده مش موظف'], ['failed-precondition', 'استخدم تابلت العميلة'], ['not-found', 'function not found'], ['internal', 'INTERNAL'], ['unavailable', 'network']]){
    const w = mkPos({ statusError:{ code, message: msg }, server: () => ({}) });
    await w.useCustomerCredit();
    ok(!w.cart.some(l => l.isCreditSpend) && !w.pendingCreditSpend, '⛔ السيرفر رد `' + code + '` ← **مفيش خصم رصيد على الفاتورة**');
    if(code === 'permission-denied'){
      ok(w.__st.confirms.some(c => /مينفعش نستخدم الرصيد/.test(c.title) && c.message.indexOf(msg) >= 0), 'والكاشير بتشوف **السبب بالنص** + «حصّلي المبلغ بطريقة تانية»');
      ok(w.__st.logs.indexOf('credit_spend_blocked') >= 0, 'وبيتسجّل للمالك');
    }
  }
  // (ب) سيرفر قديم (ميعرفش action) بس شغّال ← المسار القديم من غير كود — مفيش حاجة بتقف قبل ما المالك ينشر
  let w = mkPos({ statusError:{ code:'invalid-argument', message:'رقم غلط' }, server: () => ({}) });
  await w.useCustomerCredit();
  ok(w.cart.some(l => l.isCreditSpend) && w.pendingCreditSpend.approvalId === null, 'سيرفر قديم شغّال (`invalid-argument`) ← زي الأول من غير كود');
  // (ج) الخصم بعد الحفظ: نت وقع لحظة ← إعادة المحاولة بنفس المفتاح
  let n = 0;
  w = mkPos({ required:false, server: (p) => { if(p.action) return {}; n++; return n < 2 ? { __throw:{ code:'unavailable', message:'network' } } : { repeat:false, balance:25, spent:300 }; } });
  w.setTimeout = (fn) => { fn(); return 0; };
  await w.useCustomerCredit();
  let r = await w.commitCreditSpend('FTGLO1-AAAAAA', 25);
  const spends = w.__st.calls.filter(c => !c.action);
  ok(r && r.balance === 25 && spends.length === 2 && spends[0].idem === spends[1].idem, '🔁 فشل مؤقت ← محاولة تانية **بنفس `idem`** (السيرفر مبيخصمش مرتين) ← نجح');
  ok(!w.__st.logs.includes('credit_spend_failed'), 'ومفيش إنذار كاذب');
  // (د) رفض نهائي ← أثر دائم مش توست
  w = mkPos({ required:false, server: (p) => p.action ? {} : { __throw:{ code:'permission-denied', message:'الحساب ده مش موظف' } } });
  w.setTimeout = (fn) => { fn(); return 0; };
  await w.useCustomerCredit(); w.__st.confirms.length = 0;
  r = await w.commitCreditSpend('FTGLO2-BBBBBB', 25);
  ok(r === null && w.__st.calls.filter(c => !c.action).length === 1, 'رفض نهائي (صلاحية) ← مفيش إعادة محاولات عبثية');
  ok(w.__st.logs.includes('credit_spend_failed'), '🚨 بيتسجّل `credit_spend_failed` في نشاط Office');
  ok((w.__st.saleMarks || []).length === 1 && w.__st.saleMarks[0].creditSpendFailed.amount === 325 && w.__st.saleMarks[0].creditSpendFailed.message === 'الحساب ده مش موظف', 'والفاتورة نفسها بتتعلّم `creditSpendFailed` بالمبلغ والسبب — المالك يلاقيها بعدين');
  ok(w.__st.confirms.some(c => /الرصيد مااتخصمش/.test(c.title) && c.waitSec === 3), 'وشاشة حمرا بعدّاد للكاشير (مش توست بيختفي في ثانيتين)');
  ok(w.pendingCreditSpend === null, 'والسطر المعلّق بيتصفّر (ميتسحبش على فاتورة العميلة اللي بعدها)');
  ok(/credit_spend_failed:\s*\{ t:'[^']+', g:'money', hot:true \}/.test(office) && /credit_spend_blocked:\s*\{ t:'[^']+', g:'money', hot:true \}/.test(office), 'والاتنين 🔥 في Office بشرح');
})();

console.log('🔁 7ج) v722 — الحالة المؤكدة من كشف الحساب: #4471 فشل لحظي، و#4472 بعدها اتخصمت');
await (async function(){
  if(!JSDOM) return;
  let up = false, spendCalls = 0;
  const w = mkPos({ required:false, server: (p) => { if(p.action) return {}; spendCalls++; return up ? { repeat:false, balance:0, spent:325 } : { __throw:{ code:'unavailable', message:'connection hung' } }; } });
  w.setTimeout = (fn) => { return 0; };                                  // منشغّلش المؤقتات التلقائية — بنناديها بإيدنا
  const realST = w.setTimeout; w.setTimeout = (fn, ms) => { if(ms && ms <= 6000 && ms >= 2000) fn(); return 0; };   // انتظار المحاولات بس
  await w.useCustomerCredit();
  const r1 = await w.commitCreditSpend('FTGLO4471-SRDDHQ', 25);
  ok(r1 === null && spendCalls === 3, 'الجلسة معلّقة: 3 محاولات فشلوا');
  let q = w.creditRetryLoad();
  ok(q.length === 1 && q[0].payload.invoiceCode === 'FTGLO4471-SRDDHQ' && q[0].payload.amount === 325, '⭐ الخصم الفاشل **اتحفظ على الجهاز** (مش توست واختفى)');
  const idem0 = q[0].payload.idem;
  ok((await w.creditRetryRun()) === 0 && w.creditRetryLoad().length === 1, 'الاتصال لسه واقع ← بيفضل في الطابور');
  up = true; w.__st.logs.length = 0; w.__st.saleMarks = [];
  const n = await w.creditRetryRun();
  const last = w.__st.calls.filter(c => !c.action).pop();
  ok(n === 1 && w.creditRetryLoad().length === 0, '⭐ الاتصال رجع ← الرصيد اتخصم **لوحده** والطابور فضي');
  ok(last.idem === idem0, 'بنفس `idem` بالظبط (السيرفر مستحيل يخصم مرتين)');
  ok(w.__st.logs.includes('credit_spend_recovered') && w.__st.saleMarks.some(m => m.creditSpendFailed === null && m.creditSpendRecoveredAt), 'وبيتسجّل إنه اتصلّح، وعلامة الفشل بتتشال من الفاتورة');
  // رفض نهائي ميدخلش الطابور أصلًا
  const w2 = mkPos({ required:false, server: (p) => p.action ? {} : { __throw:{ code:'permission-denied', message:'x' } } });
  w2.setTimeout = (fn, ms) => { if(ms >= 2000 && ms <= 6000) fn(); return 0; };
  await w2.useCustomerCredit(); await w2.commitCreditSpend('FTGLO9-ZZZZZZ', 25);
  ok(w2.creditRetryLoad().length === 0, 'رفض نهائي (صلاحية) = مبيدخلش الطابور — مفيش إعادة عبثية للأبد');
  // عنصر قديم أوي بيتشال
  const w3 = mkPos({ required:false, server: () => ({}) });
  w3.localStorage.setItem('pos_credit_retry_v1', JSON.stringify([{ payload:{ idem:'x', phone:'1', amount:5, invoiceCode:'A' }, at: Date.now() - 9 * 24 * 3600e3 }]));
  await w3.creditRetryRun();
  ok(w3.creditRetryLoad().length === 0 && w3.__st.calls.filter(c => !c.action).length === 0, 'خصم معلّق أقدم من أسبوع = بيتشال من غير محاولة');
  const cuSrc = rd('pos/credit-ui.js');
  ok(/addEventListener\('online'[\s\S]{0,120}creditRetryRun\(\)/.test(cuSrc) && /setTimeout\(function\(\)\{ creditRetryRun\(\); \}, 20000\)/.test(cuSrc), 'بيشتغل عند فتح البرنامج ولما النت يرجع');
})();

console.log('🧹 7د) v724 — كتب الكود ثم مسح الفاتورة ← الرصيد اتخصم على الفاتورة اللي بعدها (بلاغ المالك 21-09)');
await (async function(){
  if(!JSDOM) return;
  const w = mkPos({ required:false, server: (p) => p.action ? {} : { repeat:false, balance:0, spent:325 } });
  await w.useCustomerCredit();
  ok(!!w.pendingCreditSpend, 'الخصم معلّق على السلة');
  // الكاشير مسحت الفاتورة (السلة اتفضّت) وباعت فاتورة تانية كاش من غير سطر رصيد
  const r = await w.commitCreditSpend('FTGLO4520-0WJRLD', 350, [{ name:'قطن', price:350, qty:1 }]);
  ok(r === null && w.__st.calls.filter(c => !c.action).length === 0, '⭐ الفاتورة المحفوظة **مفيهاش** سطر الخصم ← ولا خصم ولا إشعار (كان: بيتخصم 325 على فاتورة الـ350)');
  ok(w.__st.logs.includes('credit_spend_orphan_dropped') && w.pendingCreditSpend === null, 'وبيتسجّل إنه اتلغى، والمعلّق بيتصفّر');
  const w2 = mkPos({ required:false, server: (p) => p.action ? {} : { repeat:false, balance:0, spent:325 } });
  await w2.useCustomerCredit();
  const line = w2.cart.find(l => l.isCreditSpend);
  const r2 = await w2.commitCreditSpend('FTGLO4521-WVFTOP', 25, [{ name:'قطن', price:350, qty:1 }, line]);
  ok(r2 && r2.balance === 0, 'والفاتورة اللي فيها السطر فعلًا = بيتخصم عادي');
  const w3 = mkPos({ required:false, server: (p) => p.action ? {} : { repeat:false, balance:0, spent:325 } });
  await w3.useCustomerCredit();
  const r3 = await w3.commitCreditSpend('FTGLO4522-XXXXXX', 25, [{ name:'قطن', price:350, qty:1 }, { name:'خصم رصيد', price:-100, qty:1, isCreditSpend:true }]);
  ok(r3 === null, 'سطر رصيد بمبلغ مختلف (100 مش 325) = مش هو ← مبيتخصمش');
  ok(/pendingCreditSpend = null; \}/.test(rd('pos/pos-sale.js').slice(rd('pos/pos-sale.js').indexOf('function clearSaleState('), rd('pos/pos-sale.js').indexOf('function clearSaleState(') + 900)), 'ومسح السلة نفسه بيصفّر المعلّق');
  ok(/commitCreditSpend\(invoiceCode, total, _savedItemsForCredit, _savedPaymentsForCredit\)/.test(rd('pos/pos-sale.js')), 'والحفظ بيبعت أصناف الفاتورة المحفوظة للفحص (v726: كان `sale.items` = متغيّر مش موجود — والاختبار ده كان بيثبّت الباج)');
})();

console.log('↩️ 7هـ) v724 — مرتجع الرصيد: السبب + إعادة');
{
  const rc = rd('pos/refund-credit.js');
  ok(/callCreditEx\('creditAdjust', _pl\)/.test(rc), 'creditAdjust بينادي بالنسخة اللي بترجّع السبب');
  ok(/creditRetryPush\(e\._payload, \{ code: e\.code \}, 'creditAdjust'\)/.test(rc), 'وبيدخل طابور الإعادة');
  ok(/السبب: ' \+ why/.test(rc) && /_logActivity\('credit_refund_failed'/.test(rc), 'والتوست بيقول السبب + بيتسجّل للمالك');
  const cu = rd('pos/credit-ui.js');
  ok(/const _fn = it\.payload\._fn \|\| 'creditSpend';/.test(cu) && /callCreditEx\(_fn, _pl\)/.test(cu), 'والطابور بيعرف يعيد creditAdjust مش creditSpend بس');
}

console.log('🧱 8) الرولز');
{
  const rules = fs.readFileSync(path.join(ROOT, 'security', 'firestore-phase2.rules'), 'utf8');
  ok(/match \/credit_otp\/\{id\}\s*\{ allow read, write: if false; \}/.test(rules) && /match \/credit_keys\/\{id\}\s*\{ allow read, write: if false; \}/.test(rules), 'الكود وبصمات الأجهزة: **ولا عميل ولا موظف** يقرا أو يكتب');
  ok(/return id == 'staff_access' \|\| id == 'credit_cfg';/.test(rules), '⭐ مفتاح «الكود إجباري» مقفول على الموظفين — كاشير متقدرش تطفيه من الكونسول');
  ok(/allow create, update: if !settingsLocked\(id\) && \(/.test(rules), 'والقفل على **كل** فروع شرط الكتابة');
}
console.log('\n' + (fail ? '❌' : '✅') + ' test-credit-otp-flow: ' + pass + ' ناجح · ' + fail + ' فاشل');
  if(fail) process.exitCode = 1;
  setTimeout(() => process.exit(process.exitCode || 0), 50);   // jsdom intervals
})().catch(e => { console.error('💥', e); process.exit(1); });
