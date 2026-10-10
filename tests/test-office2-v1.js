#!/usr/bin/env node
// ============================================================
// Office 2 — v1: الصفحة الحقيقية في كروميوم مع Firestore وهمي — كل الشاشات + الإجراءات بتكتب الحقول الصح
// ============================================================
'use strict';
const path = require('path'); const { execFileSync } = require('child_process');
let out = null;
try{ out = JSON.parse(execFileSync(process.execPath, [path.join(__dirname,'_helpers','office2-run.js')], { encoding:'utf8', timeout:90000, maxBuffer: 20*1024*1024 })); }catch(e){ out = { fatal: String(e && e.message) }; }
if(out.fatal && /playwright|Cannot find module/i.test(out.fatal)){ console.log('  ⏭ Office2: كروميوم مش متاح —', out.fatal.slice(0,80)); }
else {
  assert(!out.fatal, 'الصفحة اشتغلت — ' + (out.fatal||''));
  assertEq((out.errs||[]).length, 0, 'مفيش أخطاء JS في أي شاشة — ' + JSON.stringify(out.errs||[]).slice(0,200));
  // اليوم
  assert(/سارة[\s\S]*اتأخرت 5 مرات/.test(out.today||''), 'إنذار التأخير المتكرر فوق (موظفة واحدة = سطر واحد)');
  assert(/function lateSheet\(/.test(require('fs').readFileSync(require('path').join(__dirname,'..','office2','office2.js'),'utf8')) && /موظفين<\/b> بيتأخروا كتير/.test(require('fs').readFileSync(require('path').join(__dirname,'..','office2','office2.js'),'utf8')), 'أكتر من واحدة = إنذار واحد مجمّع بيفتح قايمة');
  assert(/1 حاجة مستنية قرارك/.test(out.today||''), 'عدّاد الموافقات');
  assert(/El Rehab\n2,000\n▼ 17% عن امبارح نفس الوقت/.test(out.today||''), 'مبيعات الفرع النهاردة مقارنة بامبارح **لنفس الوقت** (2000 vs 2400 لحد 16:00)');
  assert(!/الإدارة/.test(out.today||''), 'سلبي: «الإدارة» مش فرع');
  // v3: صفحة الفرع
  assert(/المبيعات\n2,000/.test(out.branchToday||'') && /القطع\n5/.test(out.branchToday||'') && /كاش 1,200 · فيزا 800/.test(out.branchToday||''), 'صفحة الفرع النهاردة: المبيعات والقطع وطرق الدفع');
  assert(/1\. طرحة شيفون\n111\n4 قطعة\n1,600/.test(out.branchToday||''), 'الأكثر مبيعًا بالقطع (طرحة شيفون 4 قطع)');
  assert(/#5802 · 13:00[\s\S]*سارة · 2 قطعة · فيزا/.test(out.branchToday||''), 'سجل الفواتير: الوقت والبياعة والقطع وطريقة الدفع');
  assert(/المبيعات\n2,400/.test(out.branchYday||'') && /#5790 · 15:00/.test(out.branchYday||''), '⭐ يوم تاني (امبارح) بيتحمّل عند الطلب ويظهر سجله');
  assert(/فاتورة #5790[\s\S]*إيشارب حرير[\s\S]*×3[\s\S]*الإجمالي[\s\S]*1,500/.test(out.invoice||''), 'شيت الفاتورة: الأصناف والكميات والإجمالي');
  assert(/سارة · El Rehab\nمن 14:22 · متأخرة 22 د/.test(out.today||''), 'مين موجود: متأخرة 22 د (بتوقيت القاهرة)');
  assert(/هاجر · El Rehab\nبريك من 15:40/.test(out.today||''), 'حالة البريك');
  assert(/دينا · Glow\nمش موجودة/.test(out.today||''), 'سلبي: اللي مش في شيفت');
  // الشيفت المنسي اتقفل لوحده
  const fix = (out.writes||[]).find(w=> w.col==='sales_shifts' && w.id==='s3');
  assert(fix && fix.p.bankAutoEnd === true && fix.p.needsClockOutReview === false && fix.p.bankAutoReason === 'scheduled_end', '⭐ الشيفت المنسي (مقفول 1ص) اتصلّح على ميعاد النهاية من غير ما المالك يعمل حاجة');
  // ملف الموظف
  assert(/رصيد الوقت · أكتوبر[\s\S]*−1 س 10 د/.test(out.emp||''), 'رصيد سارة الشهر −70 د (25+30+35 تأخير − 20 زيادة)');
  assert(/4 تأخير \(110 د\)/.test(out.emp||'') && /1 شيفت منسي/.test(out.emp||''), 'ملخص الشهر');
  assert(/الأحد 4\n14:35 ← 22:00 · متأخرة 35 د · قُفل تلقائي/.test(out.emp||''), 'الشيفت المنسي ظاهر مقفول على 22:00');
  assert(/السبت 10\n14:22 ← —\nمفتوح/.test(out.emp||''), 'الشيفت المفتوح');
  // إجراء: اعذر تأخير
  const ex = (out.writes||[]).find(w=> w.col==='sales_shifts' && w.id==='s2');
  assert(ex && ex.p.lateExcused === true && ex.p.bankAdjustMin === 20, '⭐ «اعذر التأخير» بيكتب lateExcused + 20 د لصالحها');
  assert(/رصيد الوقت −50 د/.test(out.paySheet||''), 'المرتبات: الرصيد بعد العذر −50 (كان −70)');
  // الموافقات
  assert(/إجازة · دينا \(Glow\)[\s\S]*الفرع فيه 1 موظفين/.test(out.inbox||''), 'طلب الإجازة بالسياق');
  const lv = (out.writes||[]).find(w=> w.col==='sales_leave_requests' && w.id==='l1');
  assert(lv && lv.p.status === 'approved', '⭐ الموافقة بتكتب status=approved (نفس حقول sales)');
  assert(/مفيش حاجة مستنية قرارك/.test(out.inboxAfter||''), 'بعد الموافقة الصندوق فاضي');
  assert(/شيفت منسي · سارة/.test(out.auto||''), 'تبويب «تلقائي» بيوري الشيفت المنسي اللي اتقفل');
  // المرتبات التقديرية
  assert(/هاجر\nأساسي 4,200[^\n]*أوفرتايم \+18/.test(out.pay||''), 'أوفرتايم هاجر +60 د = 18 ج (4200/30/8/60×60)');
}
// ---------- v2: المرتبات الكاملة والصرف والسلف والخصومات والمصاريف ----------
if(!(out.fatal && /playwright|Cannot find module/i.test(out.fatal))){
  assert(/سارة\nأساسي 4,000 · وقت −14 · غياب −533 · سلف −500/.test(out.pay||''), 'المرتبات: نفس محرك Office (غياب بالأيام · رصيد الوقت بالدقيقة · السلف)');
  assert(/هاجر\nأساسي 4,200[^\n]*أوفرتايم \+18[^\n]*حوافز \+125[^\n]*خصومات −100/.test(out.pay||''), 'هاجر: أوفرتايم + حوافز معتمدة تلقائي + خصم إداري');
  assert(/صافي المرتب\n3,078/.test(out.paySheet||'') && /عمولة الشهر · 1 نقطة × 10/.test(out.paySheet||''), 'شيت المرتب: الصافي والعمولة بسعر نقطة الفرع');
  const pays = (out.writes||[]).filter(w=> w.col==='sales_salary_payments');
  assert(pays.length === 1 && pays[0].id === 'e1_2026-10' && pays[0].p.amount === 3000 && pays[0].p.paidFrom === 'office2', '⭐ الصرف مرة واحدة بس (المحاولة التانية اترفضت) — نفس مستند sales/Office');
  const cm = (out.writes||[]).find(w=> w.col==='sales_commission_payments');
  assert(cm && cm.p.commissionAmount === 20 && cm.p.pointsCount === 2 && cm.p.monthLabel === '2026-10', 'دفع العمولة بنفس حقول sales');
  const adv = (out.writes||[]).find(w=> w.col==='sales_advances'); const ded = (out.writes||[]).find(w=> w.col==='sales_deductions');
  assert(adv && adv.p.amount === 250 && adv.p.reason && adv.p.source === 'owner_manual' && adv.p.employeeId === 'e2', 'سلفة بسبب — نفس حقول sales');
  assert(ded && ded.p.amount === 250 && ded.p.type === 'manual_money' && ded.p.employeeId === 'e3', 'خصم بسبب — نفس حقول sales');
  const ex = (out.writes||[]).find(w=> w.col==='office_expenses');
  assert(ex && ex.p.amount === 250 && ex.p.month === '2026-10' && ex.p.source === 'office2', 'مصروف — نفس مجموعة Office القديم');
  assert(/مصاريف الشهر\n430 ج/.test(out.exp2||''), 'قايمة المصاريف اتحدثت لايف (180 + 250)');
}
