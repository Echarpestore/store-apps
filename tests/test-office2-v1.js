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
  assert(/سارة[\s\S]*اتأخرت 5 مرات/.test(out.today||''), 'إنذار التأخير المتكرر فوق');
  assert(/1 حاجة مستنية قرارك/.test(out.today||''), 'عدّاد الموافقات');
  assert(/El Rehab\n2,000\n▲ 33% عن امبارح/.test(out.today||''), 'مبيعات الفرع النهاردة ومقارنة امبارح (2000 vs 1500)');
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
  assert(/رصيد −50 د/.test(out.pay||''), 'المرتبات: الرصيد بعد العذر −50 (كان −70)');
  // الموافقات
  assert(/إجازة · دينا \(Glow\)[\s\S]*الفرع فيه 1 موظفين/.test(out.inbox||''), 'طلب الإجازة بالسياق');
  const lv = (out.writes||[]).find(w=> w.col==='sales_leave_requests' && w.id==='l1');
  assert(lv && lv.p.status === 'approved', '⭐ الموافقة بتكتب status=approved (نفس حقول sales)');
  assert(/مفيش حاجة مستنية قرارك/.test(out.inboxAfter||''), 'بعد الموافقة الصندوق فاضي');
  assert(/شيفت منسي · سارة/.test(out.auto||''), 'تبويب «تلقائي» بيوري الشيفت المنسي اللي اتقفل');
  // المرتبات التقديرية
  assert(/هاجر\nأساسي 4,200 · أوفرتايم \+18/.test(out.pay||''), 'أوفرتايم هاجر +60 د = 18 ج (4200/30/8/60×60)');
}
