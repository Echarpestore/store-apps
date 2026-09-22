#!/usr/bin/env node
// ============================================================
// test-critical-functions.js (v708) — «حارس الرفع فوق الأحدث»
// السبب: 4 إصلاحات فلوس اتمسحت من GitHub لأن جلسة سلّمت pos-sale.js مبني على نسخة أقدم
// (LOST-FIXES-AUDIT.md). الملف ده قايمة بالدوال اللي غيابها = إصلاح ضاع. لو ملف قديم اترفع فوق
// الجديد، الاختبار ده بيقع ويقول **أنهي دالة من أنهي إصلاح**.
// 👉 أي إصلاح فلوس جديد يضيف دواله هنا. الحذف من القايمة = قرار مالك مكتوب في الـHANDOFF.
// ============================================================
'use strict';
const fs = require('fs'), path = require('path');
const POS = path.join(__dirname, '..', 'pos');
const src = {};
const rd = f => src[f] || (src[f] = fs.readFileSync(path.join(POS, f), 'utf8'));
const MUST = [
  // [الملف, الدالة, الإصلاح اللي بتحميه]
  ['pos-sale.js', 'offlineInvoiceNumberFromSaleId', 'v339/v708 رقم الأوفلاين من معرّف المستند'],
  ['pos-sale.js', 'buildInvoiceCode',               'v339/v708 كود الفاتورة من معرّف المستند'],
  ['pos-core.js', 'posFlushPendingWrites',          'v708 متابعة الفواتير المعلّقة'],
  ['pos-core.js', 'posConfirm',                     'v707 مفيش نوافذ ويندوز'],
  ['pos-core.js', 'confirmForeignBranchAction',     'حارس الفرع المختلف'],
  ['pos-core.js', 'bizDayStartMs',                  '§7 يوم الشغل'],
  ['pos-sale.js', 'paymobReconcileCardTxnsBeforeSale', 'v434/v709 مطابقة Paymob قبل الحفظ'],
  ['pos-sale.js', 'paymobCardLegIntegrity',          'v435/v709 سلامة شريحة الكارت'],
  ['pos-sale.js', 'paymobCardLegNeedsServerCheck',   'v435/v709 المسار السريع'],
  ['pos-sale.js', '_cartLogRemoval',                 'v710 سجل تدقيق السلة (كشف شيل الأصناف)'],
  ['pos-sale.js', '_cartStamp',                      'v710 عمر القطعة في السلة'],
  ['pos-sale.js', 'buildScanCode',                   'v711 باركود الفاتورة القصير'],
  ['pos-sale.js', 'capAutoRegister',                'v715 عميلة التابلت بتتسجّل تلقائي'],
  ['pos-sale.js', 'capInviteIfNoApp',               'v716 دعوة التطبيق للعميلة المسجّلة'],
  ['pos-sale.js', 'custHasBrandApp',                'v716 «عندها التطبيق» بالبراند'],
  ['pos-sale.js', 'custLiveStart',                  'v717 العميلة المربوطة لايف (طلب الاستبدال يوصل فورًا)'],
  ['pos-sale.js', 'custPickPendingRedeem',          'v717 فحوصات أمان طلب الاستبدال — مصدر واحد'],
  ['pos-sale.js', 'invTs',                          'v719 وقت الفاتورة في قايمة المرتجع (مش Date.now)'],
  ['pos-sale.js', 'retPayInfo',                     'v723 طريقة الدفع في شاشة المرتجع'],
  ['pos-sale.js', 'retRequiredCredit',              'v723 فاتورة مدفوعة رصيد مرتجعها يرجع رصيد'],
  ['pos-sale.js', 'askConfirm',                     '§10 بديل confirm'],
  ['pos-sale.js', 'askText',                        '§10 بديل prompt'],
  ['pos-sale.js', 'normalizePayments',              '4أ-1 الفكة مش مدفوعات'],
  ['pos-sale.js', '_redeemMaxUnits',                '4أ-7 ثغرة النقط→كاش'],
  ['pos-sale.js', 'blockCartEditAfterCard',         'v346 قفل السلة بعد سحب الكارت'],
  ['pos-sale.js', 'cardApprovedSum',                'مدفوعات الكارت المؤكدة'],
  ['pos-sale.js', 'reverseReceipt',                 'عكس الفاتورة'],
  ['pos-reports.js', 'shFullAccess',                'v712 سجل المبيعات بيحترم canViewLogs'],
  ['pos-reports.js', 'clearProtectedScreenData',    'v713 الخروج بيمسح بيانات الشاشات المحمية'],
  ['pos-admin.js', 'rewardSendBlockReason',         'v714 المكافآت: صلاحية + سقف'],
  ['credit-ui.js', 'creditPreflight',               'v720 فحص السيرفر قبل خصم الرصيد (فاتورة بخصم ورصيد مااتخصمش)'],
  ['credit-ui.js', 'callCreditEx',                  'v720 نداء بيرجّع نوع الخطأ'],
  ['credit-ui.js', 'creditRetryRun',                'v722 إعادة خصم الرصيد المعلّق لوحده'],
  ['credit-ui.js', 'creditOtpFlow',                 'v718 كود تأكيد صرف الرصيد (جهة الكاشير)'],
  ['credit-ui.js', 'creditOtpRequired',             'v718 إعداد «الكود إجباري»'],
  ['pos-reports.js', 'dcAggregate',                 '4أ التقفيل'],
  ['pos-reports.js', 'repAggregate',                '4أ-3 التقارير متخصمش العكس مرتين'],
  ['pos-reports.js', 'saleTs',                      '4أ-6 طابع فواتير الأوفلاين'],
  ['pos-reports.js', 'loadReportSales',             '4أ-6 استعلام بنطاق زمني'],
];
const MARKERS = [
  ['pos-sale.js', 'await _waitWrite(saleRef.set({', 'v708 الحفظ بمعرّف ثابت (مش add)'],
  ['pos-sale.js', 'await paymobReconcileCardTxnsBeforeSale(1200)', 'v709 الحارس متنادى قبل الحفظ'],
  ['pos-sale.js', 'bankTransactionIds: Array.from(new Set(', 'v432/v709 البحث برقم عملية البنك'],
  ['pos-sale.js', "'زرار «حذف» / مفتاح Delete'", 'v710 مفتاح Delete بيسيب أثر'],
  ['pos-sale.js', "where(_short ? 'scanCode' : 'invoiceCode'", 'v711 المسح بيقرا القصير والقديم'],
  ['app.js', 'scanCode: scanCode||invoiceCode||invoiceNo', 'v711 الفاتورة بتطبع الكود القصير'],
  ['pos-reports.js', "hasPerm('canViewLogs')", 'v712 الصلاحية بتتفحص فعلًا'],
  ['pos-reports.js', "hasPerm('canViewCustomers')", 'v713 قايمة العملاء بصلاحية'],
  ['pos-admin.js', "_logActivity('reward_sent'", 'v714 كل مكافأة بتسيب أثر'],
  ['profiles.js', "hasPerm('canEditPoints')", 'v714 تعديل النقط بصلاحية مستقلة'],
  ['pos-sale.js', "setCustAction('<div class=\"act-row\">'", 'v717 كل أزرار العميلة مع بعض'],
  ['credit-ui.js', 'approvalId: p.approvalId || null', 'v718 الخصم بيتبعت بموافقة العميلة'],
  ['refund-credit.js', 'chosen + 0.01 < _reqCredit.need', 'v723 منع رجوع الرصيد كاش'],
  ['credit-ui.js', "_logActivity('credit_spend_orphan_dropped'", 'v724 خصم لسلة اتمسحت مبيتخصمش'],
  ['pos-sale.js', 'clientSaleId: saleRef.id',       'v708 هوية الفاتورة'],
  ['pos-sale.js', "await confirmForeignBranchAction('حفظ الفاتورة والبيع')", 'v707 الحارس await'],
];
let pass = 0, fail = 0;
MUST.forEach(([f, fn, why]) => {
  const ok = new RegExp('(^|\\n)\\s*(async\\s+)?function\\s+' + fn.replace(/[$]/g, '\\$') + '\\s*\\(').test(rd(f));
  if(ok) pass++; else { fail++; console.error('  ❌ ' + f + ' ناقصه `' + fn + '` — ' + why + ' ← غالبًا ملف قديم اترفع فوق الأحدث'); }
});
MARKERS.forEach(([f, m, why]) => {
  if(rd(f).includes(m)) pass++; else { fail++; console.error('  ❌ ' + f + ' ناقصه «' + m + '» — ' + why); }
});
console.log((fail ? '❌' : '✅') + ' test-critical-functions: ' + pass + ' ناجح · ' + fail + ' فاشل');
if(fail) process.exitCode = 1;
