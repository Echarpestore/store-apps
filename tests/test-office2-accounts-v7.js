#!/usr/bin/env node
// ============================================================
// Office 2 — v7: 🧾 الحسابات — الأرباح · التجار · المصاريف الثابتة · فيزا مسحوبة زيادة · الرصيد
// الصفحة الحقيقية في كروميوم مع Firestore وهمي. بيشغّل نفسه كطفل (O2_ACC_CHILD=1) للجزء غير المتزامن
// ============================================================
'use strict';
const path = require('path'); const { execFileSync } = require('child_process');
if(process.env.O2_ACC_CHILD){
  const { open, D } = require('./_helpers/office2-page');
  (async()=>{
    const out = {};
    try{
      const pg = await open({ data: {
        // 💰 مبيعات أكتوبر: الرحاب 1200+800+1500+900−300+200 = 4300 · Glow 600+450 = 1050 → 5350. المعكوسة والسبتمبر مش محسوبين
        pos_test_sales: [
          { id:'v1', branch:'echarpe El Rehab', total:1200, invoiceNo:5801, invoiceCode:'R-5801', employee:'هاجر', createdAtMs:D(2026,10,10,12,30), payments:{ cash:1200 }, items:[{ barcode:'111', name:'طرحة شيفون', qty:2, price:400 }, { barcode:'222', name:'بيجامة قطن', qty:1, price:400 }] },
          { id:'v2', branch:'echarpe El Rehab', total:800, invoiceNo:5802, employee:'سارة', createdAtMs:D(2026,10,10,13,0), payments:{ visa:800 }, items:[{ barcode:'111', name:'طرحة شيفون', qty:2, price:400 }] },
          { id:'v3', branch:'echarpe El Rehab', total:1500, invoiceNo:5790, employee:'هاجر', createdAtMs:D(2026,10,9,15,0), payments:{ cash:1500 }, items:[{ barcode:'333', name:'إيشارب حرير', qty:3, price:500 }] },
          { id:'v5', branch:'echarpe El Rehab', total:900, invoiceNo:5789, employee:'هاجر', createdAtMs:D(2026,10,3,11,0), payments:{ cash:900 }, items:[] },
          { id:'v7', branch:'echarpe El Rehab', total:-300, invoiceNo:5770, employee:'سارة', createdAtMs:D(2026,10,7,17,0), payments:{ cash:-300 }, items:[{ barcode:'555', name:'شال صوف', qty:1, price:-300, isReturn:true }] },
          { id:'v8', branch:'echarpe El Rehab', total:200, invoiceNo:5771, employee:'سارة', createdAtMs:D(2026,10,1,12,0), payments:{ cash:200 }, items:[] },
          { id:'vRev', branch:'echarpe El Rehab', total:5000, invoiceNo:5700, employee:'سارة', reversed:true, createdAtMs:D(2026,10,2,12,0), payments:{ cash:5000 }, items:[] },
          { id:'vRevRow', branch:'echarpe El Rehab', total:-5000, invoiceNo:5701, employee:'سارة', isReversal:true, createdAtMs:D(2026,10,2,12,5), payments:{ cash:-5000 }, items:[] },
          { id:'v4', branch:'Glow', total:600, invoiceNo:7001, employee:'دينا', createdAtMs:D(2026,10,10,14,0), payments:{ instapay:600 }, items:[] },
          { id:'v6', branch:'Glow', total:450, invoiceNo:6990, employee:'دينا', createdAtMs:D(2026,10,8,16,0), payments:{ cash:450 }, items:[] },
          { id:'vSep', branch:'Glow', total:7000, invoiceNo:6900, employee:'دينا', createdAtMs:D(2026,9,20,16,0), payments:{ cash:7000 }, items:[] } ],
        // 👥 مرتبات مصروفة: أكتوبر payoutTotal 2800 (بيتفضّل على amount) · الملغي مش محسوب · سبتمبر 3100 بيظهر في شهره بس
        sales_salary_payments: [
          { id:'sp1', employeeId:'e2', employeeName:'هاجر', branch:'echarpe El Rehab', periodLabel:'2026-09', amount:3000, payoutTotal:2800, paidAt:D(2026,10,7,12,0) },
          { id:'spVoid', employeeId:'e1', employeeName:'سارة', branch:'echarpe El Rehab', periodLabel:'2026-09', amount:4000, status:'void', paidAt:D(2026,10,8,12,0) },
          { id:'spSep', employeeId:'e3', employeeName:'دينا', branch:'Glow', periodLabel:'2026-08', amount:3100, paidAt:D(2026,9,7,12,0) } ],
        // 💵 سلف: كاش 500 (الرحاب) · مشتريات موظفين 300 (Glow) · سبتمبر 400 مش محسوب
        sales_advances: [
          { id:'a1', employeeId:'e1', employeeName:'سارة', branch:'echarpe El Rehab', amount:500, date:'2026-10-08', ts:D(2026,10,8,12,0), source:'cash' },
          { id:'a2', employeeId:'e3', employeeName:'دينا', branch:'Glow', amount:300, date:'2026-10-09', ts:D(2026,10,9,12,0), source:'staff_order_x9' },
          { id:'aSep', employeeId:'e1', employeeName:'سارة', branch:'echarpe El Rehab', amount:400, date:'2026-09-20', ts:D(2026,9,20,12,0), source:'cash' } ],
        // 💸 مصاريف: 180 الرحاب + 100 Glow = 280 · الملغي 999 والسبتمبر 50 مش محسوبين · ومصروف من قالب الإيجار (اتدفع الشهر ده)
        office_expenses: [
          { id:'x1', amount:180, note:'مياه', branch:'echarpe El Rehab', ts:D(2026,10,10,11,0), month:'2026-10', source:'office_manual' },
          { id:'x2', amount:100, note:'نت', branch:'Glow', ts:D(2026,10,5,11,0), month:'2026-10' },
          { id:'xVoid', amount:999, note:'غلط', branch:'Glow', voided:true, ts:D(2026,10,6,11,0), month:'2026-10' },
          { id:'xSep', amount:50, note:'قديم', branch:'Glow', ts:D(2026,9,6,11,0), month:'2026-09' },
          { id:'xRent', amount:6000, note:'إيجار — echarpe El Rehab', branch:'echarpe El Rehab', ts:D(2026,10,2,10,0), month:'2026-10', recurringId:'rc1' } ],
        // 🧾 التجار: أحمد عليه 2000+1500+700−500 = 3700 · كريم اتدفع له زيادة 200 (ليك) · أوردر سبتمبر 700 مش في بضاعة أكتوبر
        office_merchants: [ { id:'m1', name:'أحمد للأقمشة', ts:D(2026,8,1,10,0) }, { id:'m2', name:'كريم', ts:D(2026,8,2,10,0) } ],
        office_merchant_txns: [
          { id:'t1', merchantId:'m1', type:'order', amount:2000, note:'فاتورة 77', ts:D(2026,10,3,12,0) },
          { id:'t2', merchantId:'m1', type:'payment', amount:500, note:'', ts:D(2026,10,5,12,0), cashTracked:true },
          { id:'t3', merchantId:'m1', type:'order', amount:1500, note:'', ts:D(2026,10,8,12,0), source:'office_quick_goods' },
          { id:'tSep', merchantId:'m1', type:'order', amount:700, note:'', ts:D(2026,9,8,12,0) },
          { id:'t4', merchantId:'m2', type:'payment', amount:200, note:'مقدم', ts:D(2026,10,4,12,0), cashTracked:true } ],
        // 🔁 قوالب: الإيجار ثابت (اتدفع) · الكهربا متغيّر (لسه) · نت Glow ثابت (لسه)
        office_recurring: [
          { id:'rc1', note:'إيجار', branch:'echarpe El Rehab', kind:'fixed', amount:6000, createdAt:D(2026,8,1,10,0) },
          { id:'rc2', note:'كهربا', branch:'echarpe El Rehab', kind:'variable', amount:null, createdAt:D(2026,8,1,10,0) },
          { id:'rc3', note:'نت', branch:'Glow', kind:'fixed', amount:350, createdAt:D(2026,8,1,10,0) } ],
        // 💳↩️ فيزا: مستحقة · جارٍ الرد · اتردت · وقديمة أكتر من 60 يوم
        pos_card_refunds_due: [
          { id:'rf1', status:'due', diff:350, charged:1610, invoiceTotal:1260, branch:'echarpe El Rehab', invoiceCode:'R-5801', customerName:'منى', customerPhone:'01055555555', employeeName:'هاجر', ts:D(2026,10,9,13,0), txns:[{ txnId:'99887' }], adjustmentMode:true },
          { id:'rf2', status:'refunding', diff:120, charged:620, invoiceTotal:500, branch:'Glow', invoiceCode:'G-7000', customerName:'', customerPhone:'', employeeName:'دينا', ts:D(2026,10,8,13,0) },
          { id:'rfDone', status:'refunded', diff:80, charged:580, invoiceTotal:500, branch:'Glow', invoiceCode:'G-6990', customerPhone:'01066666666', employeeName:'دينا', ts:D(2026,10,1,13,0), refundedAt:D(2026,10,2,13,0), refundedBy:'Office' },
          { id:'rfOld', status:'due', diff:900, charged:1900, invoiceTotal:1000, branch:'Glow', invoiceCode:'G-6000', employeeName:'دينا', ts:D(2026,7,1,13,0) } ],
        // 💳 الرصيد: طلبين معلّقين + واحد اتقرر
        credit_requests: [
          { id:'cr1', phone:'01011111111', amount:150, reason:'تعويض تأخير', byName:'هاجر', branch:'echarpe El Rehab', status:'pending', at:D(2026,10,10,12,0) },
          { id:'cr2', phone:'01022222222', amount:50, reason:'باقي', byName:'دينا', branch:'Glow', status:'pending', at:D(2026,10,9,12,0) },
          { id:'crOld', phone:'01033333333', amount:999, reason:'قديم', byName:'سارة', branch:'Glow', status:'approved', at:D(2026,10,1,12,0) } ],
        gift_cards_public: [
          { id:'g1', value:500, remaining:200, status:'active' }, { id:'g2', value:300, remaining:300, status:'active' },
          { id:'g3', value:1000, remaining:1000, status:'pending' }, { id:'g4', value:250, remaining:250, status:'void' } ],
        credit_ledger: [
          { id:'l1', type:'gift_card', amount:500, phone:'01011111111', at:D(2026,10,9,12,0) },
          { id:'l2', type:'spend', amount:-300, phone:'01011111111', at:D(2026,10,10,12,0) },
          { id:'l3', type:'manual', amount:40, reason:'تعويض', phone:'01022222222', at:D(2026,10,8,12,0) } ]
      } });
      out.more = await pg.go('more');
      // ---------- 💹 بنكسب ولا بنخسر؟ ----------
      out.pl = await pg.go('accounts', null, 600); out.plSub = await pg.p.evaluate(()=> document.getElementById('hSub').textContent);
      await pg.call(()=> O2.accounts.plBranch('Glow'), 300); out.plGlow = await pg.text();
      await pg.call(()=> O2.accounts.plBranch(''), 100); await pg.call(()=> O2.accounts.plMonth('2026-09'), 600); out.plSep = await pg.text();
      await pg.call(()=> O2.accounts.plMonth('2026-10'), 300);
      // ---------- 🧾 التجار ----------
      await pg.call(()=> O2.accounts.tab('merchants'), 300); out.m = await pg.text();
      await pg.call(()=> O2.accounts.toggle('m1'), 200); out.mLog = await pg.text();
      await pg.call(()=> O2.accounts.txn('m1','order'), 300);
      await pg.call(()=> O2.accounts.txn('m2','payment'), 300); out.mAfter = await pg.text();
      await pg.call(()=> O2.accounts.txn('ghost','order'), 100);
      await pg.call(()=>{ O2.accounts.qg('m','m2'); O2.accounts.qg('a','1200.5'); O2.accounts.qg('n','فاتورة 12'); return O2.accounts.quickGoods(); }, 300); out.quick = await pg.text();
      await pg.call(()=>{ O2.accounts.qg('m',''); O2.accounts.qg('a','100'); return O2.accounts.quickGoods(); }, 100);
      await pg.call(()=>{ O2.accounts.qg('m','m2'); O2.accounts.qg('a','0'); return O2.accounts.quickGoods(); }, 100);
      await pg.call(()=> O2.accounts.addMerchant(), 300); out.mAdded = await pg.text();
      await pg.call(()=> O2.accounts.delTxn('tSep'), 200);
      // ---------- 🔁 المصاريف الثابتة ----------
      await pg.call(()=> O2.accounts.tab('recurring'), 300); out.rc = await pg.text();
      await pg.call(()=> O2.accounts.payRecur('rc3'), 300); out.rcAfter = await pg.text();
      await pg.call(()=> O2.accounts.payRecur('rc3'), 200);      // تاني مرة نفس الشهر — لازم ميكتبش
      await pg.call(()=> O2.accounts.payRecur('rc1'), 200);      // اتدفع خلاص
      await pg.call(()=> O2.accounts.payRecur('rc2'), 300);      // متغيّر — المبلغ من prompt (250)
      await pg.call(()=> O2.accounts.editRecur(''), 200); out.rcSheet = await pg.sheetHtml();
      await pg.call(()=>{ document.getElementById('rcNote').value = 'تأمين'; document.getElementById('rcBranch').value = 'Glow'; document.getElementById('rcKind').value = 'fixed'; document.getElementById('rcAmount').value = '900'; return O2.accounts.saveRecur(''); }, 300);
      await pg.call(()=> O2.accounts.editRecur('rc2'), 200); out.rcEdit = await pg.sheetHtml();
      await pg.call(()=>{ document.getElementById('rcNote').value = 'كهربا ومياه'; return O2.accounts.saveRecur('rc2'); }, 300);
      await pg.call(()=> O2.accounts.delRecur('rc3'), 200); out.rcEnd = await pg.text();
      // ---------- 💳↩️ فيزا ----------
      await pg.call(()=> O2.accounts.tab('refunds'), 300); out.rf = await pg.text();
      await pg.call(()=> O2.accounts.refunded('rf1'), 300); out.rfAfter = await pg.text();
      await pg.call(()=> O2.accounts.refunded('rfDone'), 100);
      await pg.call(()=> O2.accounts.invoiceByCode('R-5801'), 300); out.rfInv = await pg.sheet(); await pg.call(()=> O2.closeSheet());
      // ---------- 💳 الرصيد ----------
      await pg.call(()=> O2.accounts.tab('credit'), 500); out.cr = await pg.text();
      await pg.call(()=>{ window.__fetches = []; window.fetch = async (url, o)=>{ window.__fetches.push({ url, method:o.method, body: JSON.parse(o.body), headers:o.headers }); const d = JSON.parse(o.body).data; const p = (window.__DATA_CR = window.__DATA_CR||[]); return { ok:true, status:200, json: async()=>({ result:{ ok:true, balance:150 } }) }; }; });
      await pg.call(()=> O2.accounts.credit('cr1','approved'), 300);
      await pg.call(()=> O2.accounts.credit('cr2','rejected'), 300);
      await pg.call(()=> O2.accounts.credit('ghost','approved'), 100);
      out.fetches = await pg.p.evaluate(()=> window.__fetches);
      out.more2 = await pg.go('more');
      out.writes = await pg.writes(); out.errs = pg.errs;
      await pg.close();
    }catch(e){ out.fatal = String(e && e.stack || e); }
    process.stdout.write(JSON.stringify(out));
  })();
  return;
}
let out = null;
try{ out = JSON.parse(execFileSync(process.execPath, [__filename], { encoding:'utf8', timeout:120000, maxBuffer: 20*1024*1024, env: Object.assign({}, process.env, { O2_ACC_CHILD:'1' }) })); }catch(e){ out = { fatal: String(e && e.message) }; }
if(out.fatal && /playwright|Cannot find module/i.test(out.fatal)){ console.log('  ⏭ Office2 accounts: كروميوم مش متاح —', out.fatal.slice(0,80)); }
else {
  assert(!out.fatal, 'الصفحة اشتغلت — ' + (out.fatal||''));
  assertEq((out.errs||[]).length, 0, 'مفيش أخطاء JS في كل التبويبات — ' + JSON.stringify(out.errs||[]).slice(0,300));
  const W = out.writes || [];
  assert(/🧾 الحسابات[\s\S]*\n4\n/.test(out.more||''), 'في «المزيد»: الحسابات بشارة 4 (طلبين رصيد + فيزا مستحقة + جارٍ الرد)');
  assert(/4 حاجة محتاجة قرارك/.test(out.plSub||''), 'عنوان الشاشة بيقول عدد اللي محتاج قرار');
  // 💹 الأرباح — الأرقام محسوبة باليد فوق
  const p = out.pl || '';
  assert(/أكتوبر 2026 \(الحالي\)/.test(p) && /مايو 2026/.test(p) && !/أبريل 2026/.test(p), 'اختيار الشهر: آخر 6 شهور (أكتوبر → مايو) والحالي معلّم');
  assert(/🏬 echarpe El Rehab\n4,300/.test(p) && /🏬 Glow\n1,050/.test(p), '⭐ مبيعات الفروع للشهر: الرحاب 4,300 · Glow 1,050 (المرتجع بيخصم · المعكوسة وصف العكس وسبتمبر مش محسوبين)');
  assert(/إجمالي المبيعات\n5,350/.test(p), 'إجمالي المبيعات 5,350');
  assert(/المرتبات والعمولات المصروفة فعليًا\nالمسجل صرفه من Sales 2,800 ج · سلف كاش 500 ج · مشتريات موظفين 300 ج\n− 3,600/.test(p), '⭐ المرتبات = payoutTotal 2,800 (مش amount 3,000 · الملغي وسبتمبر مش محسوبين) + سلف كاش 500 + مشتريات موظفين 300 = 3,600');
  assert(/البضاعة \(أوردرات التجار\)\n− 3,500/.test(p), '⭐ البضاعة = أوردرات أكتوبر 2,000 + 1,500 (الدفعة وأوردر سبتمبر مش محسوبين) = 3,500');
  assert(/مصاريف الفروع والإيجارات\nGlow 100 ج · echarpe El Rehab 6,180 ج\n− 6,280/.test(p), '⭐ المصاريف = 180 + 6,000 إيجار + 100 (الملغي voided وسبتمبر مش محسوبين) = 6,280 مع تفصيل الفروع');
  assert(/🔻 خسارة 8,030/.test(p), '⭐⭐ النتيجة: 5,350 − 3,600 − 3,500 − 6,280 = خسارة 8,030 (كارت أحمر)');
  const g = out.plGlow || '';
  assert(/إجمالي المبيعات\n1,050/.test(g) && /المسجل صرفه من Sales 0 ج · سلف كاش 0 ج · مشتريات موظفين 300 ج\n− 300/.test(g) && /Glow 100 ج\n− 100/.test(g) && !/El Rehab 6,180/.test(g), 'فلتر فرع Glow: مبيعاته 1,050 · مشتريات موظفيه 300 · مصاريفه 100 بس');
  assert(/البضاعة[\s\S]*مش موزعة على الفروع/.test(g) && /✅ مكسب 650/.test(g), 'بالفرع: البضاعة مش بتتوزع (بتظهر في كل الفروع بس) → Glow مكسب 1,050 − 300 − 100 = 650');
  const s = out.plSep || '';
  assert(/🏬 Glow\n7,000/.test(s) && !/🏬 echarpe El Rehab/.test(s) && /المسجل صرفه من Sales 3,100 ج · سلف كاش 400 ج/.test(s) && /البضاعة[\s\S]*\n− 700/.test(s) && /Glow 50 ج\n− 50/.test(s) && /✅ مكسب 2,750/.test(s), '⭐ شهر تاني (سبتمبر) بيتحمّل بنفس المعادلة: 7,000 − 3,500 − 700 − 50 = مكسب 2,750');
  // 🧾 التجار
  const m = out.m || '';
  assert(/إجمالي اللي عليك للتجار\n3,700/.test(m) && /2 تاجر/.test(m), '⭐ إجمالي اللي عليك = أحمد 3,700 بس (كريم ليك 200 مش بيتخصم)');
  assert(/أحمد للأقمشة\n3 أوردر · 1 دفعة · إجمالي الأوردرات 4,200 ج · المدفوع 500 ج\nعليك 3,700/.test(m), '⭐ كارت أحمد: 2,000 + 1,500 + 700 − 500 = عليك 3,700');
  assert(/كريم\n0 أوردر · 1 دفعة[\s\S]*ليك 200/.test(m), 'كريم: دفعة من غير أوردر = ليك 200');
  assert(m.indexOf('أحمد للأقمشة') < m.indexOf('كريم'), 'الترتيب: اللي عليه أكتر الأول');
  assert(!/فاتورة 77/.test(m), 'سلبي: السجل مقفول افتراضيًا');
  assert(/🧾 أوردر · فاتورة 77[\s\S]*\+2,000/.test(out.mLog||'') && /تسجيل سريع[\s\S]*\+1,500/.test(out.mLog||'') && /💵 دفعة[\s\S]*−500/.test(out.mLog||''), 'السجل بعد الفتح: الأوردرات والدفعة بعلاماتهم ومصدر التسجيل السريع');
  const ord = W.find(w=> w.col==='office_merchant_txns' && w.op==='add' && w.p.merchantId==='m1');
  assert(ord && ord.p.type==='order' && ord.p.amount===250 && ord.p.note==='سبب اختبار' && typeof ord.p.ts==='number' && ord.p.cashTracked===false, '⭐ أوردر يدوي بيكتب نفس حقول officeMtxn (merchantId · type · amount · note · ts · cashTracked:false)');
  const pay = W.find(w=> w.col==='office_merchant_txns' && w.op==='add' && w.p.merchantId==='m2' && w.p.type==='payment');
  assert(pay && pay.p.amount===250 && pay.p.cashTracked===true && pay.p.cashTrackedFrom, '⭐⭐ الدفعة بتتكتب cashTracked:true → بتتخصم لوحدها من «فلوسي» (قاعدة Office v65)');
  assert(/أحمد للأقمشة\n4 أوردر · 1 دفعة[\s\S]*عليك 3,950/.test(out.mAfter||'') && /كريم\n0 أوردر · 2 دفعة[\s\S]*ليك 450/.test(out.mAfter||''), 'الأرصدة اتحدثت لايف: أحمد 3,950 · كريم ليك 450');
  assert(!W.some(w=> w.col==='office_merchant_txns' && w.p && w.p.merchantId==='ghost'), 'سلبي: تاجر مش موجود = مفيش كتابة');
  const qk = W.find(w=> w.col==='office_merchant_txns' && w.op==='add' && w.p.source==='office_quick_goods');
  assert(qk && qk.p.merchantId==='m2' && qk.p.type==='order' && qk.p.amount===1200.5 && qk.p.note==='فاتورة 12' && typeof qk.p.ts==='number' && !('cashTracked' in qk.p), '⭐ «تسجيل بضاعة بسرعة» بيكتب بالظبط اللي qgAdd كان بيكتبه (source:office_quick_goods · من غير cashTracked)');
  assert(/اتسجل 1,201 ج على كريم كتكلفة بضاعة[\s\S]*تراجع/.test(out.quick||'') && /كريم\n1 أوردر · 2 دفعة[\s\S]*عليك 751/.test(out.quick||''), 'بعد التسجيل السريع: رسالة بزرار تراجع ورصيد كريم بقى عليك 1,200.5 − 450 = 751');
  assert(W.filter(w=> w.col==='office_merchant_txns' && w.op==='add').length === 3, 'سلبي: من غير تاجر أو بمبلغ صفر مفيش كتابة (3 حركات بس)');
  const nm = W.find(w=> w.col==='office_merchants' && w.op==='add');
  assert(nm && nm.p.name==='سبب اختبار' && typeof nm.p.ts==='number' && Object.keys(nm.p).length===2, '⭐ تاجر جديد = { name, ts } بس (نفس Office)');
  assert(/3 تاجر/.test(out.mAdded||'') && /سبب اختبار\n0 أوردر · 0 دفعة[\s\S]*متساوي 0/.test(out.mAdded||''), 'التاجر الجديد ظهر برصيد متساوي');
  assert(W.some(w=> w.col==='office_merchant_txns' && w.op==='delete' && w.id==='tSep'), 'مسح حركة بيمسح المستند نفسه');
  // 🔁 المصاريف الثابتة
  const r = out.rc || '';
  assert(/المصاريف الثابتة · أكتوبر 2026\n2 لسه ماتدفعش · المستحق الثابت 350 ج/.test(r), '⭐ الملخص: 2 لسه (كهربا متغيّر + نت 350) · المستحق الثابت بيحسب الثابت بس');
  assert(/إيجار ✅ اتدفع 10-02 · 6,000 ج/.test(r) && !/إيجار[\s\S]*اتدفع الشهر ده[\s\S]*كهربا/.test(r), 'الإيجار معلّم إنه اتدفع (من recurringId في office_expenses) ومن غير زرار دفع');
  assert(/كهربا ⏳ لسه\necharpe El Rehab · متغيّر — بيسألك المبلغ/.test(r) && /نت ⏳ لسه\nGlow · ثابت 350 ج/.test(r), 'الكهربا متغيّر · النت ثابت 350');
  const px = W.filter(w=> w.col==='office_expenses' && w.op==='add');
  const p3 = px.find(w=> w.p.recurringId==='rc3');
  assert(p3 && p3.p.amount===350 && p3.p.note==='نت — Glow' && p3.p.month==='2026-10' && p3.p.branch==='Glow' && typeof p3.p.ts==='number', '⭐⭐ «اتدفع الشهر ده» بيكتب office_expenses بنفس شكل Office (amount · note «نت — Glow» · ts · month · recurringId · branch)');
  assert(/نت ✅ اتدفع 10-10 · 350 ج/.test(out.rcAfter||'') && /1 لسه ماتدفعش/.test(out.rcAfter||''), 'بعد الدفع: النت معلّم والعدّاد نزل لـ1');
  assert(px.filter(w=> w.p.recurringId==='rc3').length === 1 && !px.some(w=> w.p.recurringId==='rc1'), '⭐ سلبي: الدفع مرتين في نفس الشهر مش بيكتب مرتين · واللي اتدفع خلاص مفيش كتابة');
  const p2 = px.find(w=> w.p.recurringId==='rc2');
  assert(p2 && p2.p.amount===250 && p2.p.note==='كهربا — echarpe El Rehab', 'المتغيّر بياخد المبلغ من السؤال (250)');
  assert(/rcNote/.test(out.rcSheet||'') && /Glow/.test(out.rcSheet||'') && /متغيّر/.test(out.rcSheet||''), 'شيت القالب: الاسم والفرع والنوع والمبلغ');
  const nr = W.find(w=> w.col==='office_recurring' && w.op==='add');
  assert(nr && nr.p.note==='تأمين' && nr.p.branch==='Glow' && nr.p.kind==='fixed' && nr.p.amount===900 && typeof nr.p.createdAt==='number', '⭐ قالب جديد = { note, branch, kind, amount, createdAt } (نفس Office)');
  assert(/value="كهربا"/.test(out.rcEdit||'') && /value="variable" selected/.test(out.rcEdit||''), 'تعديل القالب بيفتح الشيت ببياناته');
  const ur = W.find(w=> w.col==='office_recurring' && w.op==='update' && w.id==='rc2');
  assert(ur && ur.p.note==='كهربا ومياه' && ur.p.kind==='variable' && ur.p.amount===null, 'تعديل القالب بيحدّث المستند (المتغيّر مبلغه null)');
  assert(W.some(w=> w.col==='office_recurring' && w.op==='delete' && w.id==='rc3'), 'مسح القالب');
  assert(/تأمين[\s\S]*Glow · ثابت 900 ج/.test(out.rcEnd||'') && /كهربا ومياه/.test(out.rcEnd||'') && !/\nنت\n/.test(out.rcEnd||''), 'الشاشة بعدها: القالب الجديد والمعدّل ظاهرين والممسوح اختفى');
  // 💳↩️ فيزا
  const f = out.rf || '';
  assert(/2 مستحقة الرد/.test(f) && /350 ج[\s\S]*مسحوب 1,610 ج على فاتورة 1,260 ج · ✏️ السلة اتعدّلت بعد قبول الكارت/.test(f) && /R-5801 · 👤 منى 01055555555 · 💳 TXN 99887 · 🧑‍💼 هاجر/.test(f), 'كارت الفرق: المبلغ والمسحوب والفاتورة والعميلة والعملية والموظفة');
  assert(/120 ج[\s\S]*من غير رقم!/.test(f), 'اللي من غير رقم عميلة متعلّم بالأحمر (وحالة refunding لسه مستحقة)');
  assert(/اترد مؤخرًا[\s\S]*80 ج · Glow[\s\S]*رده Office/.test(f), 'اللي اترد ظاهر تحت');
  assert(!/900 ج/.test(f), 'سلبي: الأقدم من 60 يوم مش بيتحمّل');
  const rfw = W.find(w=> w.col==='pos_card_refunds_due' && w.id==='rf1');
  assert(rfw && rfw.op==='update' && rfw.p.status==='refunded' && typeof rfw.p.refundedAt==='number' && rfw.p.refundedBy==='office2' && Object.keys(rfw.p).length===3, '⭐⭐ «اترد» بيكتب { status:refunded, refundedAt, refundedBy } بس — اللي القواعد بتسمح بيه (diff/charged/invoiceCode مش بيتلمسوا)');
  assert(/1 مستحقة الرد/.test(out.rfAfter||'') && !/منى/.test(out.rfAfter||'') && /اترد مؤخرًا[\s\S]*350 ج/.test(out.rfAfter||''), 'بعد «اترد»: اختفى من المستحق وظهر في اللي اترد');
  assert(W.filter(w=> w.col==='pos_card_refunds_due').length === 1, 'سلبي: اللي اترد خلاص مش بيتكتب تاني');
  assert(/فاتورة #5801[\s\S]*طرحة شيفون[\s\S]*الإجمالي/.test(out.rfInv||''), '🧾 زرار الفاتورة بيفتح فاتورة الفرق بكودها');
  // 💳 الرصيد
  const c = out.cr || '';
  assert(/طلبات رصيد مستنية موافقتك\n2/.test(c) && /150 ج · 📱 01011111111\nتعويض تأخير · echarpe El Rehab · طلبتها هاجر/.test(c) && !/01033333333/.test(c), 'طلبات الرصيد المعلّقة بس (المقرر مش ظاهر)');
  assert(/🎁 كروت مباعة\n800/.test(c) && /💳 اتصرف\n300/.test(c) && /📕 لسه عليك\n500/.test(c) && /كروت اتصدرت ومااتدفعتش: 1,000 ج/.test(c), '⭐ ملخص الكروت: مباعة 500+300 · اتصرف 300 · لسه عليك 500 · المعلّق 1,000 مش محسوب · الملغي مستبعد');
  assert(/🛍️ صرف على فاتورة[\s\S]*−300[\s\S]*🎁 كارت هدية[\s\S]*\+500[\s\S]*✏️ تعويض[\s\S]*\+40/.test(c), 'دفتر الرصيد: آخر الحركات بالأحدث الأول وبأنواعها');
  const F = out.fetches || [];
  assert(F.length === 2 && F.every(x=> /cloudfunctions\.net\/creditRequestDecision$/.test(x.url) && x.method==='POST'), '⭐⭐ الموافقة والرفض بيناديا دالة creditRequestDecision (بروتوكول callable بـfetch — SDK الدوال مش متحمّل)');
  assert(F[0] && JSON.stringify(F[0].body)==='{"data":{"requestId":"cr1","decision":"approved"}}' && F[1] && JSON.stringify(F[1].body)==='{"data":{"requestId":"cr2","decision":"rejected"}}', '⭐ البيانات { requestId, decision } بالظبط — مفتاح التكرار من رقم الطلب على السيرفر');
  assert(!W.some(w=> w.col==='credit_requests' || w.col==='credit_ledger' || w.col==='pos_test_customers'), '⭐⭐ سلبي: مفيش أي كتابة مباشرة على الطلبات أو الرصيد أو الدفتر من Office 2 (القواعد بتمنعها)');
  assert(!/كهربا|إيجار|سلف|مصروف جديد/.test(c), 'سلبي: التبويب ده مفيهوش تكرار لمصاريف/مرتبات «الفلوس»');
}
