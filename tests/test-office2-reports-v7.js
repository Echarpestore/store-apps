#!/usr/bin/env node
// ============================================================
// Office 2 — v7: 📊 التقارير (مبيعات فترة · الأكثر مبيعًا · فرص الزيادة · نشاط التطبيق · مين قيّم)
// الصفحة الحقيقية في كروميوم مع Firestore وهمي — الملف بيشغّل نفسه كطفل (O2_REPORTS_CHILD=1) وبيرجّع JSON
// ============================================================
'use strict';
const path = require('path'); const { execFileSync } = require('child_process');
if(process.env.O2_REPORTS_CHILD){
  const { open, D } = require('./_helpers/office2-page');
  (async()=>{
    const out = {};
    try{
      const R = 'echarpe El Rehab', G = 'Glow';
      const A = (q, price)=> ({ barcode:'111', name:'طرحة شيفون', qty:q, price }); const B = (q, price)=> ({ barcode:'222', name:'بيجامة قطن', qty:q, price });
      const sales = [
        // النهاردة 10/10
        { id:'r1', branch:R, total:1000, invoiceNo:5801, employee:'هاجر', sellerEmployeeId:'e2', sellerEmployeeName:'هاجر', customerPhone:'01011111111', loyaltyPointsEarned:10, createdAtMs:D(2026,10,10,12,30), payments:{ cash:1000 }, items:[A(2,400), B(1,200)] },
        { id:'r2', branch:R, total:800, invoiceNo:5802, employee:'سارة', sellerEmployeeId:'e1', sellerEmployeeName:'سارة', customerPhone:'01022222222', loyaltyPointsEarned:8, createdAtMs:D(2026,10,10,13,0), payments:{ visa:800 }, items:[A(2,400)] },
        { id:'g1', branch:G, total:600, invoiceNo:7001, employee:'دينا', sellerEmployeeId:'e3', sellerEmployeeName:'دينا', createdAtMs:D(2026,10,10,14,0), payments:{ instapay:600 }, items:[{ barcode:'444', name:'سكارف', qty:1, price:600 }] },
        // 9/10
        { id:'r3', branch:R, total:1500, invoiceNo:5790, employee:'هاجر', sellerEmployeeId:'e2', sellerEmployeeName:'هاجر', createdAtMs:D(2026,10,9,15,0), payments:{ cash:1500 }, items:[{ barcode:'333', name:'إيشارب حرير', qty:3, price:500 }] },
        { id:'r4', branch:R, total:600, invoiceNo:5789, employee:'سارة', sellerEmployeeId:'e1', sellerEmployeeName:'سارة', createdAtMs:D(2026,10,9,12,15), payments:{ cash:600 }, items:[A(1,400), B(1,200)] },
        // 8/10 — فاتورة صالحة + فاتورة معكوسة + العكس نفسه (الاتنين لازم يتستبعدوا)
        { id:'r5', branch:R, total:600, invoiceNo:5780, employee:'هاجر', sellerEmployeeId:'e2', sellerEmployeeName:'هاجر', createdAtMs:D(2026,10,8,12,0), payments:{ cash:600 }, items:[A(1,400), B(1,200)] },
        { id:'rX', branch:R, total:5000, invoiceNo:5781, employee:'سارة', sellerEmployeeId:'e1', sellerEmployeeName:'سارة', reversed:true, createdAtMs:D(2026,10,8,13,0), payments:{ cash:5000 }, items:[{ barcode:'999', name:'صنف معكوس', qty:5, price:1000 }] },
        { id:'rY', branch:R, total:-5000, invoiceNo:5782, employee:'سارة', isReversal:true, originalSaleId:'rX', createdAtMs:D(2026,10,8,13,5), payments:{ cash:-5000 }, items:[{ barcode:'999', name:'صنف معكوس', qty:5, price:-1000 }] },
        { id:'g2', branch:G, total:450, invoiceNo:6990, employee:'دينا', sellerEmployeeId:'e3', sellerEmployeeName:'دينا', createdAtMs:D(2026,10,8,16,0), payments:{ cash:450 }, items:[{ barcode:'444', name:'سكارف', qty:1, price:450 }] },
        // 7/10 — مرتجع بس
        { id:'r6', branch:R, total:-300, invoiceNo:5770, employee:'سارة', sellerEmployeeId:'e1', sellerEmployeeName:'سارة', createdAtMs:D(2026,10,7,17,0), payments:{ cash:-300 }, items:[{ barcode:'555', name:'شال صوف', qty:1, price:300, isReturn:true }] },
        // 1/10 → 6/10 — فاتورة واحدة كل يوم 500 ج (3 الساعة 18 لسارة · 3 الساعة 20 لهاجر)
        ...[1,2,3,4,5,6].map(d=> ({ id:'d'+d, branch:R, total:500, invoiceNo:5700+d, employee: d%2 ? 'سارة' : 'هاجر', sellerEmployeeId: d%2 ? 'e1' : 'e2', sellerEmployeeName: d%2 ? 'سارة' : 'هاجر', createdAtMs:D(2026,10,d, d%2 ? 18 : 20, 0), payments:{ cash:500 }, items:[A(1,500)] })),
        // قديم — بره الـ30 يوم
        { id:'old', branch:R, total:9000, invoiceNo:5000, employee:'سارة', createdAtMs:D(2026,8,20,12,0), payments:{ cash:9000 }, items:[{ barcode:'777', name:'صنف قديم', qty:9, price:1000 }] }
      ];
      const pg = await open({ data: {
        pos_test_sales: sales,
        pos_test_inventory: [
          { id:'i1', barcode:'111', name:'طرحة شيفون', qtyByBranch:{ 'echarpe El Rehab':2, 'Glow':9 } },
          { id:'i2', barcode:'222', name:'بيجامة قطن', quantity:7 },
          { id:'i3', barcode:'333', name:'إيشارب حرير', status:'merged', qtyByBranch:{ 'echarpe El Rehab':99 } },
          { id:'i4', barcode:'333', name:'إيشارب حرير', qtyByBranch:{ 'echarpe El Rehab':5 } } ],
        pos_test_customers: [
          { id:'01011111111', name:'منى علي', phone:'01011111111', source:'loyalty_app', createdAt:D(2026,10,10,11,0), welcomeGranted_echarpe:D(2026,10,10,11,5) },
          { id:'01022222222', name:'هدى', phone:'01022222222', source:'glow_app_ios', createdAt:D(2026,10,9,12,0), welcomeGranted_glow:D(2026,10,9,12,1) },
          { id:'01033333333', name:'عميل كاشير', phone:'01033333333', source:'pos', createdAt:D(2026,10,10,12,0) },
          { id:'01055555555', name:'قديمة', phone:'01055555555', source:'loyalty_app', createdAt:D(2026,9,1,12,0), welcomeGranted_echarpe:D(2026,9,1,12,1) } ],
        entries: [
          { id:'q1', branch:R, ts:D(2026,10,10,12,35), r:1, note:'الخدمة بطيئة جدًا', customerPhone:'01011111111', saleId:'r1', source:'app_after_visit', servedByEmployeeName:'هاجر' },
          { id:'q2', branch:G, ts:D(2026,10,9,18,0), r:4 },
          { id:'q3', branch:R, ts:D(2026,10,8,13,0), r:2, customerPhone:'01044444444', saleId:'r5' },
          { id:'q4', branch:R, ts:D(2026,10,7,13,0), r:5 },
          { id:'q5', branch:R, ts:D(2026,9,1,13,0), r:3 } ]
      } });
      out.more = await pg.go('more');
      out.period = await pg.go('reports', null, 900); out.sub = await pg.p.evaluate(()=> document.getElementById('hSub').textContent);
      await pg.call(()=> O2.reports.quick('7'), 600); out.p7 = await pg.text();
      await pg.call(()=> O2.reports.pBranch('Glow'), 200); out.p7Glow = await pg.text();
      await pg.call(()=> O2.reports.pBranch(''), 200);
      await pg.call(()=> O2.reports.from('2026-10-08'), 400); await pg.call(()=> O2.reports.to('2026-10-09'), 400); out.p89 = await pg.text();
      await pg.call(()=> O2.reports.from('2026-08-01'), 400); out.pLong = await pg.text();
      await pg.call(()=> O2.reports.view('top'), 300); await pg.call(()=> O2.reports.topBranch('echarpe El Rehab'), 500); out.top = await pg.text();
      await pg.call(()=> O2.reports.topBranch('Glow'), 500); out.topGlow = await pg.text();
      await pg.call(()=> O2.reports.view('growth'), 300); await pg.call(()=> O2.reports.gxBranch('echarpe El Rehab'), 300); out.growth = await pg.text();
      await pg.call(()=> O2.reports.gxBranch('Glow'), 300); out.growthGlow = await pg.text();
      await pg.call(()=> O2.reports.view('activity'), 300); out.act = await pg.text();
      await pg.call(()=> O2.reports.view('rated'), 500); out.rated = await pg.text();
      await pg.call(()=> O2.reports.ratBranch('Glow'), 200); out.ratedGlow = await pg.text();
      await pg.call(()=> O2.reports.ratFilter('all'), 200); out.ratedGlowAll = await pg.text();
      await pg.call(()=> O2.reports.ratBranch(''), 200); await pg.call(()=> O2.reports.ratFilter('notes'), 200); out.ratedNotes = await pg.text();
      await pg.call(()=> O2.reports.invoice('r1'), 300); out.inv = await pg.sheet(); await pg.call(()=> O2.closeSheet());
      await pg.call(()=> O2.reports.invoice('ghost'), 300); out.invGhost = await pg.p.evaluate(()=> document.getElementById('sheet').style.display);
      // الدخول تاني مبيحمّلش من أول وجديد
      out.go2 = await pg.go('reports', null, 300); out.sub2 = await pg.p.evaluate(()=> document.getElementById('hSub').textContent);
      out.writes = await pg.writes(); out.errs = pg.errs;
      await pg.close();
    }catch(e){ out.fatal = String(e && e.stack || e); }
    process.stdout.write(JSON.stringify(out));
  })();
  return;
}
let out = null;
try{ out = JSON.parse(execFileSync(process.execPath, [__filename], { encoding:'utf8', timeout:120000, maxBuffer: 20*1024*1024, env: Object.assign({}, process.env, { O2_REPORTS_CHILD:'1' }) })); }catch(e){ out = { fatal: String(e && e.message) }; }
if(out.fatal && /playwright|Cannot find module/i.test(out.fatal)){ console.log('  ⏭ Office2 reports: كروميوم مش متاح —', out.fatal.slice(0,80)); }
else {
  assert(!out.fatal, 'الصفحة اشتغلت — ' + (out.fatal||''));
  assertEq((out.errs||[]).length, 0, 'مفيش أخطاء JS في كل التبويبات — ' + JSON.stringify(out.errs||[]).slice(0,300));
  assert(/📊 التقارير/.test(out.more||''), 'الموديول ظاهر في «المزيد»');
  assertEq((out.writes||[]).filter(w=> w.col!=='sales_shifts').length, 0, 'سلبي: التقارير قراءة بس — مفيش أي كتابة (غير قفل الشيفت المنسي بتاع النواة)');
  // 💰 مبيعات فترة
  const p = out.period || '';
  assert(/💰 مبيعات فترة[\s\S]*🔥 الأكثر مبيعًا[\s\S]*📈 فرص الزيادة[\s\S]*📱 نشاط التطبيق[\s\S]*🔎 مين قيّم/.test(p), 'الخمس تبويبات ظاهرة');
  assert(/النهاردة[\s\S]*3 فاتورة[\s\S]*المبيعات\n2,400[\s\S]*الفواتير\n3[\s\S]*متوسط الفاتورة\n800/.test(p), 'اليوم: 2,400 ج · 3 فواتير · متوسط 800 (1000+800+600)');
  assert(/🏬 echarpe El Rehab[\s\S]*2 فاتورة · 75\.0%[\s\S]*1,800[\s\S]*🏬 Glow[\s\S]*1 فاتورة · 25\.0%[\s\S]*600/.test(p), 'الفروع بالنسبة: El Rehab 1,800 (75%) · Glow 600 (25%)');
  assert(/💳 طرق الدفع[\s\S]*كاش[\s\S]*1,000[\s\S]*فيزا[\s\S]*800[\s\S]*إنستاباي[\s\S]*600/.test(p), 'ملخص طرق الدفع (u.paymentSummaryHtml): كاش 1,000 · فيزا 800 · إنستاباي 600');
  assert(/👩‍💼 البياعات[\s\S]*هاجر[\s\S]*1,000[\s\S]*سارة[\s\S]*800[\s\S]*دينا[\s\S]*600/.test(p), 'البياعات مرتبين بالإجمالي');
  const p7 = out.p7 || '';
  assert(/10-04 → 10-10[\s\S]*10 فاتورة · 1 مرتجع[\s\S]*المبيعات\n7,050[\s\S]*الفواتير\n10[\s\S]*متوسط الفاتورة\n705/.test(p7), '⭐ 7 أيام: 7,050 ج · 10 فواتير · متوسط 705 (محسوبة يدوي)');
  assert(/مرتجعات -300 ج · الصافي 6,750 ج/.test(p7), '7 أيام: المرتجع -300 والصافي 6,750');
  assert(!/صنف معكوس/.test(p7) && !/5,000/.test(p7) && !/12,050/.test(p7), 'سلبي: الفاتورة المعكوسة والعكس مستبعدين من الإجمالي');
  assert(/📅 يوم بيوم[\s\S]*السبت 10-10[\s\S]*3 فاتورة[\s\S]*2,400[\s\S]*الجمعة 10-09[\s\S]*2 فاتورة[\s\S]*2,100[\s\S]*الخميس 10-08[\s\S]*2 فاتورة[\s\S]*1,050[\s\S]*الأربعاء 10-07[\s\S]*0 فاتورة[\s\S]*-300/.test(p7), 'يوم بيوم: 10/10=2,400 · 9/10=2,100 · 8/10=1,050 · 7/10=-300');
  assert(/Glow[\s\S]*المبيعات\n1,050[\s\S]*الفواتير\n2/.test(out.p7Glow||'') && !/El Rehab[\s\S]*1,800/.test(out.p7Glow||'') && !/هاجر/.test(out.p7Glow||''), 'فلتر الفرع Glow: 1,050 ج · 2 فواتير — من غير بيانات El Rehab');
  assert(/10-08 → 10-09[\s\S]*المبيعات\n3,150[\s\S]*الفواتير\n4/.test(out.p89||''), 'فترة يدوية 8→9/10: 3,150 ج · 4 فواتير (600+450+1500+600)');
  assert(/أقصى فترة 31 يوم/.test(out.pLong||''), 'سلبي: فترة أطول من 31 يوم بترفض من غير تحميل');
  // 🔥 الأكثر مبيعًا
  const t = out.top || '';
  assert(/1\. طرحة شيفون[\s\S]*كود 111[\s\S]*المخزون:\n2\n⚠️\n12 قطعة/.test(t), '⭐ الأكثر مبيعًا El Rehab: طرحة شيفون 12 قطعة ومخزون الفرع 2 (qtyByBranch) مع تحذير');
  assert(/إيشارب حرير[\s\S]*المخزون:\n5\n3 قطعة/.test(t) && !/المخزون:\n99/.test(t), 'المخزون من المستند الصح — مستند merged متجاهَل');
  assert(/بيجامة قطن[\s\S]*المخزون:\n7\n3 قطعة/.test(t), 'مخزون quantity لما مفيش qtyByBranch');
  assert(!/شال صوف/.test(t) && !/صنف معكوس/.test(t) && !/صنف قديم/.test(t), 'سلبي: المرتجع والمعكوس والأقدم من 30 يوم مش في القايمة');
  assert(/1\. سكارف[\s\S]*المخزون: —|1\. سكارف[\s\S]*2 قطعة/.test(out.topGlow||'') && !/طرحة شيفون/.test(out.topGlow||''), 'فرع Glow: سكارف 2 قطعة بس');
  // 📈 فرص الزيادة
  const g = out.growth || '';
  assert(/📊 الصورة دلوقتي[\s\S]*آخر 9 يوم شغل[\s\S]*متوسط اليوم\n833[\s\S]*متوسط الفاتورة\n682[\s\S]*فواتير في اليوم\n1\.2/.test(g), '⭐ الصورة: 9 أيام شغل · متوسط اليوم 833 · متوسط الفاتورة 682 · 1.2 فاتورة/يوم');
  assert(/🎚️ الرافعتين[\s\S]*متوسط الفاتورة[\s\S]*500 ← 7[0-9][0-9][\s\S]*عدد الفواتير في اليوم[\s\S]*1\.0 ← 1\.3/.test(g), 'الرافعتين: آخر 7 أيام شغل مقارنة باللي قبلهم');
  assert(/💰 الفرصة[\s\S]*متوسط الفاتورة يزيد 10٪[\s\S]*\+2,500[\s\S]*فاتورة واحدة زيادة كل يوم[\s\S]*\+20,455/.test(g), 'الفرصة: +2,500 (10% من 25,000) · +20,455 (682×30)');
  assert(/🕐 الساعات[\s\S]*💪 أقوى ساعات[\s\S]*12 م[\s\S]*3 فاتورة[\s\S]*244[\s\S]*🥱 أضعف ساعات/.test(g), 'الساعات: 12 م أقوى ساعة (2,200÷9=244)');
  assert(/📅 أيام الأسبوع[\s\S]*الجمعة\n29٪ من الأسبوع · 2 يوم\n1,300[\s\S]*السبت\n26٪[\s\S]*1,150[\s\S]*الأربعاء\nمفيش شغل/.test(g), 'أيام الأسبوع بالمتوسط ووزن اليوم: الجمعة (2,100+500)/2 = 1,300 · 29% · الأربعاء مفيش شغل (المرتجع بس)');
  assert(/👗 البياعات[\s\S]*هاجر 🏆[\s\S]*6 فاتورة[\s\S]*767[\s\S]*سارة[\s\S]*5 فاتورة[\s\S]*580/.test(g), '⭐ البياعات بمتوسط الفاتورة: هاجر 767 (6 فواتير) قبل سارة 580 (5)');
  assert(/🔗 بيتباعوا مع بعض[\s\S]*طرحة شيفون \+ بيجامة قطن\n3 مرة/.test(g), 'الأزواج: بيجامة + طرحة 3 مرات');
  assert(/مفيش مبيعات متسجلة|📊 الصورة دلوقتي[\s\S]*آخر 2 يوم شغل/.test(out.growthGlow||'') && !/هاجر/.test(out.growthGlow||''), 'فرع Glow: يومين شغل ومفيش بيانات El Rehab');
  // 📱 نشاط التطبيق
  const a = out.act || '';
  assert(/📱 تحميلات التطبيق[\s\S]*النهاردة 1 · 14 يوم 2/.test(a), '⭐ التحميلات: النهاردة 1 · 14 يوم 2 (الكاشير والأقدم من 14 يوم مش محسوبين)');
  assert(/🎁 مكافأة أول تحميل[\s\S]*النهاردة 1 · 14 يوم 2/.test(a), 'مكافأة الترحيب: 1 النهاردة · 2 في 14 يوم');
  assert(/⭐ النقط المكتسبة[\s\S]*النهاردة 18 · 14 يوم 18[\s\S]*10\/10[\s\S]*18 نقطة · 2 عميل/.test(a), 'النقط: 18 نقطة لـ2 عميل النهاردة');
  assert(/⭐ تقييمات العملاء[\s\S]*المتوسط\n2\.33[\s\S]*التقييمات\n3[\s\S]*سيّئة \(1-2\)\n2/.test(a), 'ملخص التقييمات 30 يوم: متوسط 2.33 · 3 تقييمات · 2 سيّئ (الـ5 والأقدم مستبعدين)');
  assert(/حسب الفرع[\s\S]*echarpe El Rehab[\s\S]*2 تقييم · 2 سيّئ[\s\S]*1\.50[\s\S]*Glow[\s\S]*1 تقييم[\s\S]*4\.00/.test(a), 'التقييم حسب الفرع');
  assert(/10\/10[\s\S]*1 تحميل/.test(a) && /10\/09[\s\S]*1 تحميل/.test(a), 'أعمدة يوم بيوم بالعدد');
  // 🔎 مين قيّم
  const r = out.rated || '';
  assert(/😠 محتاج متابعة 2[\s\S]*💬 كتبوا كلام 1[\s\S]*📱 التطبيق 2[\s\S]*🖥️ شاشة الفرع 2[\s\S]*الكل 4/.test(r), 'عدّادات الفلاتر: 2 سيّئ · 1 بكلام · 2 تطبيق · 2 كشك · الكل 4 (الـ5 مستبعد)');
  assert(/😠[\s\S]*منى علي[\s\S]*01011111111[\s\S]*📱 التطبيق[\s\S]*El Rehab · السبت 10-10 12:35 · مع هاجر[\s\S]*💬 الخدمة بطيئة جدًا[\s\S]*🧾 الفاتورة/.test(r), '⭐ التقييم السيّئ بالاسم من pos_test_customers (المستند = الرقم) والنوت والبياعة وزرار الفاتورة');
  assert(/🙁[\s\S]*01044444444/.test(r), 'رقم من غير عميل مسجّل بيظهر بالرقم');
  assert(!/مجهول/.test(r), 'سلبي: فلتر «محتاج متابعة» مش بيعرض الكشك الكويس');
  assert(/مفيش تقييمات في الفلتر ده/.test(out.ratedGlow||''), 'فرع Glow مفيهوش تقييمات سيّئة');
  assert(/مجهول[\s\S]*🖥️ شاشة الفرع[\s\S]*Glow · الجمعة 10-09/.test(out.ratedGlowAll||'') && !/منى علي/.test(out.ratedGlowAll||''), 'Glow · الكل: تقييم الكشك مجهول — من غير تقييمات El Rehab');
  assert(/منى علي/.test(out.ratedNotes||'') && !/01044444444/.test(out.ratedNotes||''), 'فلتر «كتبوا كلام»');
  assert(/فاتورة #5801[\s\S]*طرحة شيفون[\s\S]*بيجامة قطن[\s\S]*1,000/.test(out.inv||''), 'زرار الفاتورة بيفتح فاتورة التقييم بأصنافها');
  assertEq(out.invGhost, 'none', 'سلبي: فاتورة مش موجودة مبتفتحش شيت');
  assert(!/بيقرا/.test(out.sub2||'') && /💰 مبيعات فترة/.test(out.go2||''), 'الدخول تاني مبيعيدش تحميل الـ30 يوم (loadedUntil)');
}
