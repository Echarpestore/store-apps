#!/usr/bin/env node
// ============================================================
// Office 2 — v7: 💰 فلوسي — الصفحة الحقيقية في كروميوم مع Firestore وهمي
// الملف بيشغّل نفسه كطفل (O2_CASH_CHILD=1) عشان الجزء غير المتزامن، وبيرجّع JSON
// حالة محسوبة بالإيد: بداية 5,000 (الخميس 10-08 7ص) · الجمعة 10-09: كاش 1,000 + فاتورة 2 الفجر 300 (= لسه الجمعة
// بالساعة الفاصلة 6) − مصروف 200 · السبت 10-10 (النهاردة): كاش 500 − دفعة تاجر 300 (cashTracked) · فيزا 800 (مش كاش)
// ⇒ المؤكد = 5,000 + 1,100 + 200 = 6,300 · Paymob المنتظر 800 − 2% = 784 · دهب 10 × 5,000
// ============================================================
'use strict';
const { execFileSync } = require('child_process');
if(process.env.O2_CASH_CHILD){
  const { open, D } = require('./_helpers/office2-page');
  (async()=>{
    const out = {};
    try{
      const pg = await open({
        dialog: (m)=>{
          if(/مصاريف تشغيل/.test(m)) return '250';
          if(/راجع السيولة/.test(m)) return '6200';
          if(/ملاحظة على يوم/.test(m)) return 'سبب اختبار';
          if(/المبلغ الإجمالي/.test(m)) return '500';
          if(/المبلغ الصافي اللي نزل/.test(m)) return '490';
          if(/الأسبوع المنتهي/.test(m)) return '950';
          if(/ملاحظة \(اختياري\)/.test(m)) return 'سبب اختبار';
          if(/جرام دهب/.test(m)) return '12';
          if(/سعر شراء جرام/.test(m)) return '5100';
          if(/إجمالي السيولة المؤكدة عندك دلوقتي/.test(m)) return '7000';
          if(/وعند Paymob/.test(m)) return '300';
          if(/كروت هدايا/.test(m)) return '0';
          return 'true';
        },
        data: {
        pos_test_settings: [
          { id:'office_gate', hash:null }, { id:'advances_cfg', closeDay:6, openDay:12 }, { id:'day_cfg', startHour:6 },
          { id:'office_cash', amount:5000, paymobOpening:0, giftLiabilityOpening:0, atMs:D(2026,10,8,7,0), by:'office' },
          { id:'office_cash_cfg', goldGrams:10, goldBuyPrice:5000, goldPriceAt:D(2026,10,10,10,0), goldSource:'يدوي' } ],
        pos_test_sales: [
          { id:'c1', branch:'echarpe El Rehab', total:1000, invoiceNo:1, employee:'هاجر', createdAtMs:D(2026,10,9,15,0), payments:{ cash:1000 }, items:[{ barcode:'111', name:'طرحة', qty:1, price:1000 }] },
          { id:'c5', branch:'echarpe El Rehab', total:300, invoiceNo:2, employee:'سارة', createdAtMs:D(2026,10,10,2,0), payments:{ cash:300 }, items:[{ barcode:'111', name:'طرحة', qty:1, price:300 }] },   // 2 الفجر = لسه الخميس
          { id:'c2', branch:'echarpe El Rehab', total:500, invoiceNo:3, employee:'هاجر', createdAtMs:D(2026,10,10,12,0), payments:{ cash:500 }, items:[{ barcode:'111', name:'طرحة', qty:1, price:500 }] },
          { id:'c3', branch:'echarpe El Rehab', total:800, invoiceNo:4, employee:'سارة', createdAtMs:D(2026,10,10,13,0), payments:{ visa:800 }, items:[{ barcode:'111', name:'طرحة', qty:1, price:800 }] },
          { id:'c4', branch:'Glow', total:1000, invoiceNo:5, employee:'دينا', createdAtMs:D(2026,10,4,15,0), payments:{ visa:1000 }, items:[{ barcode:'444', name:'سكارف', qty:1, price:1000 }] } ],   // الأحد → تحويل الثلاثاء 10-06 (مستحق)
        office_expenses: [ { id:'x1', amount:200, note:'مياه', branch:'echarpe El Rehab', ts:D(2026,10,9,12,0), month:'2026-10' } ],
        sales_advances: [], sales_salary_payments: [],
        sales_rewards: [ { id:'rw1', employeeId:'e1', amount:150, status:'pending', earnedAt:D(2026,10,9,20,0) } ],   // لسه ماتعتمدتش
        office_merchant_txns: [
          { id:'m1', merchantId:'mm', type:'payment', amount:300, cashTracked:true, ts:D(2026,10,10,11,0) },
          { id:'m2', merchantId:'mm', type:'payment', amount:999, cashTracked:false, ts:D(2026,10,10,11,30) },   // قديم مش متتبع
          { id:'m3', merchantId:'mm', type:'order', amount:777, cashTracked:true, ts:D(2026,10,10,11,40) } ],      // بضاعة مش دفعة
        office_paymob_settlements: [ { id:'st1', gross:2000, net:1960, deductions:40, feePct:2, ts:D(2026,9,29,10,0), forDay:'2026-09-28', by:'office' } ],
        office_cash_days: [ { id:'2026-10-08', note:'يوم البداية' } ],
        office_cash_epochs: []
      } });
      out.more0 = await pg.go('more');
      out.cash = await pg.go('cash', null, 900);
      out.sub = await pg.p.evaluate(()=> document.getElementById('hSub').textContent);
      out.moreMid = await pg.go('more');
      await pg.go('cash', null, 300);
      await pg.call(()=> O2.cash.toggle('2026-10-09')); out.open9 = await pg.text();
      await pg.call(()=> O2.cash.toggle('2026-10-08')); out.open8 = await pg.text(); await pg.call(()=> O2.cash.toggle('2026-10-09'));   // نرجع نفتح الجمعة
      await pg.call(()=> O2.cash.edit('2026-10-09','expenses'), 400); out.afterEdit = await pg.text();
      await pg.call(()=> O2.cash.count('2026-10-10'), 400); out.afterCount = await pg.text();
      await pg.call(()=> O2.cash.reset('2026-10-08'), 200);                 // يوم من غير تعديل = مفيش كتابة
      out.wBeforeReset = (await pg.writes()).length;
      await pg.call(()=> O2.cash.reset('2026-10-10'), 400); out.afterReset = await pg.text();
      await pg.call(()=> O2.cash.note('2026-10-09'), 300);
      await pg.call(()=> O2.cash.addSettlement(), 400); out.afterSettle = await pg.text();
      await pg.call(()=> O2.cash.confirmWeekly('2026-10-05'), 400); out.afterWeekly = await pg.text();
      await pg.call(()=> O2.cash.confirmWeekly('2026-10-05'), 200);        // متأكد خلاص = مفيش كتابة تانية
      await pg.call(()=> O2.cash.goldGrams(), 300);
      await pg.call(()=> O2.cash.goldPrice(), 300); out.afterGold = await pg.text();
      await pg.call(()=> O2.cash.startFresh(), 500); out.afterFresh = await pg.text();
      out.more2 = await pg.go('more');
      out.writes = await pg.writes(); out.errs = pg.errs;
      await pg.close();
    }catch(e){ out.fatal = String(e && e.stack || e); }
    process.stdout.write(JSON.stringify(out));
  })();
  return;
}
let out = null;
try{ out = JSON.parse(execFileSync(process.execPath, [__filename], { encoding:'utf8', timeout:120000, maxBuffer: 20*1024*1024, env: Object.assign({}, process.env, { O2_CASH_CHILD:'1' }) })); }catch(e){ out = { fatal: String(e && e.message) }; }
if(out.fatal && /playwright|Cannot find module/i.test(out.fatal)){ console.log('  ⏭ Office2 cash: كروميوم مش متاح —', out.fatal.slice(0,80)); }
else {
  assert(!out.fatal, 'الصفحة اشتغلت — ' + (out.fatal||''));
  assertEq((out.errs||[]).length, 0, 'مفيش أخطاء JS — ' + JSON.stringify(out.errs||[]).slice(0,300));
  const W = (out.writes || []).filter(w=> w.col !== 'sales_shifts');   // النواة بتقفل شيفت منسي — مش بتاعنا
  const t = out.cash || '';
  assert(/💰 فلوسي/.test(out.more0||''), 'الموديول ظاهر في «المزيد»');
  assert(/معايا كام دلوقتي؟[\s\S]*من الخميس 08\/10[\s\S]*\n6,300 ج\n/.test(t), '⭐⭐ الرقم الرئيسي = المؤكد بس: 5,000 + (1,300 − 200) + (500 − 300) = 6,300');
  assert(/🟠 محتاج مراجعة فعلية/.test(out.sub||''), 'جودة الرقم: لسه مفيش عدّ فعلي');
  assert(/عند Paymob — لسه ماوصلش\n784\nفيزا السبت 10\/10/.test(t), '⭐ Paymob المنتظر = فيزا 800 × (1 − 2% نسبة فعلية من التحويل المسجّل) = 784 · ومعروف من أنهي يوم');
  assert(/🥇 دهب\n50,000\n10 جم × 5,000/.test(t), 'الدهب = 10 جرام × 5,000 (يدوي)');
  assert(/اللي ليك فعلًا\n57,084 ج/.test(t), 'إجمالي الثروة = 6,300 + 784 + 50,000 − 0 كروت = 57,084');
  assert(/تحويل Paymob الأسبوعي\n⏳ مستني تأكيدك · الثلاثاء 06\/10[\s\S]*إجمالي الفيزا\n1,000\nالثلاثاء 29\/09 → الإثنين 05\/10[\s\S]*المتوقع ينزل\n980\nعمولة متوقعة 20 \(2%\)/.test(t), '⭐ الدورة الأسبوعية: فيزا الأحد 10-04 → الثلاثاء 10-06 · مستحق · 1,000 − 2% = 980');
  assert(/✅ أكد المبلغ اللي وصل/.test(t), 'زرار تأكيد التحويل المستحق');
  assert(/▸ السبت 10\/10 النهاردة[^\n]*\n💵 500 ج · 💳 800 ج · 📤 −300 ج\n6,300 ج/.test(t), 'سطر النهاردة: كاش 500 · فيزا 800 · منصرف 300 (دفعة التاجر المتتبعة بس) · الرصيد 6,300');
  assert(/▸ الجمعة 09\/10[\s\S]*💵 1,300 ج · 📤 −200 ج\n6,100 ج/.test(t), '⭐ فاتورة 2 الفجر محسوبة على الجمعة (الساعة الفاصلة 6) · 1,300 − 200 · الرصيد 6,100');
  assert(/▸ الثلاثاء 13\/10\s*جاي\n[\s\S]*🔮 متوقّع ينزل 784 ج \(فيزا السبت 10\/10\)/.test(t), 'التوقّع بيبان في يوم الثلاثاء الجاي بالخط المنقّط');
  assert(!/999|777|150 ج/.test(t), 'سلبي: دفعة التاجر غير المتتبعة والبضاعة والمكافأة المعلّقة مش داخلين الحساب');
  assert(/💰 فلوسي[\s\S]*\n1\n/.test(out.moreMid||''), 'شارة «المزيد» = 1 تحويل أسبوعي مستني');
  assert(/▾ الجمعة 09\/10[\s\S]*💵 كاش الفروع\n1,300 ج[\s\S]*🧾 مصاريف تشغيل\n200 ج[\s\S]*الرصيد آخر اليوم\n6,100 ج[\s\S]*🔍 عدّيت كام؟/.test(out.open9||''), 'فتح اليوم: الخانات (كاش · مصاريف) والرصيد والأزرار');
  assert(!/رجّع المحسوب/.test(out.open9||''), 'سلبي: «رجّع المحسوب» مش ظاهر ليوم من غير تعديل');
  assert(/▾ الخميس 08\/10[\s\S]*📝 يوم البداية/.test(out.open8||''), 'ملاحظة اليوم من office_cash_days بتتعرض');
  // ✏️ تعديل خانة
  const ed = W.find(w=> w.col==='office_cash_days' && w.id==='2026-10-09' && w.p.ov && w.p.ov.expenses===250);
  assert(ed && ed.op==='set' && Array.isArray(ed.p.audit) && ed.p.audit[0].field==='expenses' && ed.p.audit[0].from===200 && ed.p.audit[0].to===250 && ed.p.audit[0].by==='office' && typeof ed.p.updatedAt==='number', '⭐ تعديل الخانة بيكتب office_cash_days/{dayKey} set/merge: ov.expenses + audit (from/to/by) + updatedAt');
  assert(/\n6,250 ج\n/.test(out.afterEdit||'') && /🧾 مصاريف تشغيل ✏️\nمحسوب 200 ج\n250 ج/.test(out.afterEdit||'') && /رجّع المحسوب/.test(out.afterEdit||''), 'بعد التعديل: الرقم 6,250 والخانة معلّمة ✏️ مع المحسوب الأصلي');
  // 🔍 العدّ
  const ct = W.find(w=> w.col==='office_cash_days' && w.id==='2026-10-10' && w.p.counted===6200);
  assert(ct && ct.op==='set' && ct.p.countedDiff===-50 && typeof ct.p.countedAt==='number' && ct.p.by==='office', '⭐ العدّ بيكتب counted · countedAt · countedDiff (6,200 − 6,250 = −50) · by');
  assert(/\n6,200 ج\n/.test(out.afterCount||'') && /🔻 عجز 50 ج \(عدّيت 6,200 ج\)/.test(out.afterCount||''), 'بعد العدّ: الرصيد بيكمّل من المعدود 6,200 والعجز 50 ظاهر');
  assert(!/محتاج مراجعة/.test(out.afterCount||''), 'جودة الرقم اتغيرت بعد العدّ');
  // ↩️ الرجوع
  assert(!W.some(w=> w.col==='office_cash_days' && w.id==='2026-10-08'), 'سلبي: «رجّع المحسوب» ليوم من غير تعديل ولا عدّ = مفيش كتابة');
  const rs = W.find(w=> w.col==='office_cash_days' && w.id==='2026-10-10' && w.p.counted===null);
  assert(rs && rs.op==='set' && JSON.stringify(rs.p.ov)==='{}' && typeof rs.p.updatedAt==='number', '⭐ الرجوع بيكتب ov:{} + counted:null (set/merge — مش مسح)');
  assert(/\n6,250 ج\n/.test(out.afterReset||'') && !/عجز 50/.test(out.afterReset||''), 'بعد الرجوع: 6,250 ومفيش عجز');
  const nt = W.find(w=> w.col==='office_cash_days' && w.id==='2026-10-09' && w.p.note==='سبب اختبار');
  assert(nt && nt.op==='set', 'الملاحظة بتتحفظ على يوم الدفتر');
  // 🏦 تحويل استثنائي
  const st = W.find(w=> w.col==='office_paymob_settlements' && w.op==='add');
  assert(st && st.p.gross===500 && st.p.net===490 && st.p.deductions===10 && st.p.feePct===2 && typeof st.p.ts==='number' && st.p.by==='office', '⭐ التحويل بيكتب office_paymob_settlements add: gross · net · deductions · feePct · ts · by');
  assert(/\n6,740 ج\n/.test(out.afterSettle||'') && /🏦 \+490 ج/.test(out.afterSettle||''), 'الصافي 490 اتضاف للمؤكد (6,250 + 490 = 6,740) وظاهر في سطر النهاردة');
  // ✅ التأكيد الأسبوعي
  const wk = W.filter(w=> w.col==='office_paymob_settlements' && w.id==='weekly_2026-10-05');
  assert(wk.length===1 && wk[0].op==='set' && wk[0].p.weekly===true && wk[0].p.weeklyCycleStart==='2026-09-29' && wk[0].p.weeklyCycleEnd==='2026-10-05' && wk[0].p.payoutDay==='2026-10-06' && wk[0].p.forDay==='2026-10-05' && wk[0].p.gross===1000 && wk[0].p.net===950 && wk[0].p.deductions===50 && wk[0].p.feePct===5 && wk[0].p.expectedNet===980 && wk[0].p.expectedFee===20 && wk[0].p.expectedPct===2 && wk[0].p.note==='سبب اختبار' && wk[0].p.by==='office_weekly_v65', '⭐ التأكيد الأسبوعي بيكتب weekly_{end} بنفس حقول Office القديم · ومرة واحدة بس');
  assert(!/مستني تأكيدك/.test(out.afterWeekly||'') && /الثلاثاء 13\/10/.test(out.afterWeekly||''), 'بعد التأكيد: الدورة الجاية (الثلاثاء 13/10) بدل المستحقة');
  // 🥇 الدهب
  const gg = W.find(w=> w.col==='pos_test_settings' && w.id==='office_cash_cfg' && w.p.goldGrams===12);
  const gp = W.find(w=> w.col==='pos_test_settings' && w.id==='office_cash_cfg' && w.p.goldBuyPrice===5100);
  assert(gg && gg.op==='set' && typeof gg.p.updatedAt==='number', '⭐ الجرامات بتتكتب في office_cash_cfg (set/merge)');
  assert(gp && gp.p.goldAuto===false && typeof gp.p.goldPriceAt==='number' && gp.p.goldManualUntil > gp.p.goldPriceAt && /يدوي/.test(gp.p.goldSource), '⭐ السعر اليدوي: goldBuyPrice · goldPriceAt · goldAuto:false · goldManualUntil (Office القديم مش هيدوس عليه 24 ساعة)');
  assert(/🥇 دهب\n61,200\n12 جم × 5,100/.test(out.afterGold||''), 'الدهب بقى 12 × 5,100 = 61,200');
  assert(!W.some(w=> w.col==='pos_test_settings' && w.id==='office_cash_cfg' && (w.p.goldXauUsd || w.p.goldUsdEgp)), 'سلبي: مفيش جلب سعر من الإنترنت (goldXauUsd/goldUsdEgp مش بيتكتبوا)');
  // 🆕 نقطة بداية جديدة
  const ep = W.find(w=> w.col==='office_cash_epochs' && w.op==='add');
  assert(ep && ep.p.amount===5000 && ep.p.atMs===Date.UTC(2026,9,8,4,0) && typeof ep.p.closedAt==='number', '⭐ النقطة القديمة بتتأرشف في office_cash_epochs قبل ما تتبدل');
  const nb = W.find(w=> w.col==='pos_test_settings' && w.id==='office_cash');
  assert(nb && nb.op==='set' && nb.p.amount===7000 && nb.p.paymobOpening===300 && nb.p.giftLiabilityOpening===0 && typeof nb.p.atMs==='number' && nb.p.by==='office', '⭐ النقطة الجديدة: amount · paymobOpening · giftLiabilityOpening · atMs · by');
  assert(/من السبت 10\/10[\s\S]*\n8,640 ج\n/.test(out.afterFresh||'') && /🏦 \+1,440 ج/.test(out.afterFresh||''), 'بعد البداية الجديدة: الدفتر بيبدأ من النهاردة = 7,000 + كاش 500 − تاجر 300 + تحويلات النهاردة (490 + 950 الأسبوعي) = 8,640');
  // 🛡️ سلبيات عامة
  assert(!W.some(w=> w.op==='delete'), '⭐ سلبي: مفيش أي مسح — office_cash_days عمرها ما بتتمسح');
  assert(!W.some(w=> w.col==='office_cash_days' && w.p && w.p.frozen), 'سلبي: مفيش تجميد لأيام لسه جوه الـ20 يوم');
  assert(W.filter(w=> w.col==='office_cash_days').length === 4, 'عدد كتابات office_cash_days = 4 بالظبط (تعديل · عدّ · رجوع · ملاحظة)');
  assert(!/💰 فلوسي[\s\S]*\n1\n/.test(out.more2||''), 'الشارة اختفت بعد تأكيد التحويل الأسبوعي');
}
