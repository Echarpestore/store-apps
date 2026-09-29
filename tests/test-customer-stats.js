/* 🧪 إحصائيات العميلة — أهم اختبار فيهم: النتيجة **مطابقة** للحساب القديم. */
'use strict';
const C = require('../functions/customerStatsCore');
let P = 0, F = 0;
const ok = (c, m) => { if (c) { P++; console.log('  ✅ ' + m); } else { F++; console.log('  ❌ ' + m); } };

const sale = (o) => Object.assign({ branch: 'echarpe El Rehab', customerPhone: '01000000001', total: 100, createdAtMs: 1000 }, o);

console.log('\n🔑 مفتاح الفرع');
ok(C.branchKey('echarpe El Rehab') === 'echarpe_El_Rehab', 'المسافات بتبقى شرطة سفلية');
ok(C.branchKey('a.b') === 'a_b' && C.branchKey('x/y') === 'x_y', '🔴 النقطة والشرطة المايلة بيتشالوا — Firestore بيقراهم كمسار حقول');
ok(C.branchKey('') === '_none' && C.branchKey(null) === '_none', 'فرع فاضي (عميلة التطبيق) ليه مفتاح ثابت');

console.log('\n🕐 وقت الفاتورة');
ok(C.saleMs({ createdAt: { toMillis: () => 5000 } }) === 5000, 'Timestamp');
ok(C.saleMs({ createdAt: { seconds: 7 } }) === 7000, 'seconds');
ok(C.saleMs({ createdAt: new Date(9000) }) === 9000, 'Date');
ok(C.saleMs({ createdAtMs: 3000 }) === 3000, '🔴 فاتورة أوفلاين (createdAt لسه null) بتتقري من createdAtMs');
ok(C.saleMs({}) === 0, 'من غير وقت = 0');

console.log('\n➕ الجمع');
{
  let s = C.applySale(null, sale({ total: 250 }), 1);
  ok(s.spend === 250 && s.count === 1 && s.lastTs === 1000, 'أول فاتورة');
  s = C.applySale(s, sale({ total: 100, createdAtMs: 2000 }), 1);
  ok(s.spend === 350 && s.count === 2 && s.lastTs === 2000, 'فاتورة تانية');
  s = C.applySale(s, sale({ total: -60, isReversal: true, createdAtMs: 3000 }), 1);
  ok(s.spend === 290 && s.count === 2, '🔴 المرتجع بيخصم من الإنفاق لكن **مش** زيارة');
  const cancelled = C.applySale(s, sale({ total: 100, createdAtMs: 2000 }), -1);
  ok(cancelled.spend === 190 && cancelled.count === 1, 'شيل فاتورة اتلغت');
  ok(C.applySale({ spend: 0, count: 0, lastTs: 0 }, sale({}), -1).count === 0, 'العدّاد عمره ما ينزل تحت الصفر');
  ok(C.applySale(null, sale({ total: 10.1 }), 1).spend === 10.1
    && C.applySale({ spend: 0.1, count: 0, lastTs: 0 }, sale({ total: 0.2 }), 1).spend === 0.3,
  '🔴 الكسور من غير أخطاء عائمة (0.1 + 0.2 = 0.3 مش 0.30000000000000004)');
}

console.log('\n🚫 اللي متتحسبش');
ok(C.saleTarget(sale({ customerPhone: '' })) === null, 'فاتورة من غير عميلة');
ok(C.saleTarget(sale({ reversed: true })) === null, '🔴 فاتورة ملغية (reversed) — زي الحساب القديم بالظبط');
ok(C.saleTarget(sale({})).key === 'echarpe_El_Rehab', 'فاتورة عادية');

console.log('\n🔄 تغيّر مستند الفاتورة');
ok(C.saleWriteOps(null, sale({})).length === 1, 'فاتورة جديدة = إضافة');
ok(C.saleWriteOps(sale({}), sale({ reversed: true })).map((o) => o.sign).join() === '-1', '🔴 إلغاء فاتورة = خصم');
ok(C.saleWriteOps(sale({}), sale({ note: 'x' })).length === 0, '🔴 تعديل مالوش علاقة (ملاحظة) مبيغيرش حاجة — من غير كده كل كتابة تحسب مرتين');
ok(C.saleWriteOps(sale({}), sale({ total: 300 })).length === 2, 'تغيير المبلغ = شيل القديم وضيف الجديد');
{
  const ops = C.saleWriteOps(sale({ customerPhone: '01000000001' }), sale({ customerPhone: '01000000002' }));
  ok(ops.length === 2 && ops[0].sign === -1 && ops[0].phone === '01000000001' && ops[1].phone === '01000000002',
    'الفاتورة اتنقلت لعميلة تانية = خصم من الأولى وإضافة للتانية');
}
ok(C.saleWriteOps(sale({ reversed: true }), sale({ reversed: true })).length === 0, 'فاتورة ملغية بتتعدّل = مفيش حاجة');

console.log('\n🎯 المطابقة مع الحساب القديم (أهم اختبار)');
{
  // نسخة حرفية من الحساب اللي كان في pos-reports.js قبل التغيير
  const oldWay = (sales, branch) => {
    const agg = {};
    sales.filter((s) => s.branch === branch).forEach((s) => {
      if (!s.customerPhone || s.reversed) return;
      const p = s.customerPhone;
      if (!agg[p]) agg[p] = { spend: 0, count: 0, lastTs: 0 };
      agg[p].spend += (s.total || 0);
      if (!s.isReversal) agg[p].count += 1;
      const t = C.saleMs(s); if (t > agg[p].lastTs) agg[p].lastTs = t;
    });
    return agg;
  };
  const B = 'echarpe El Rehab';
  const data = [
    sale({ total: 250, createdAtMs: 1000 }),
    sale({ total: 120, createdAtMs: 2000, customerPhone: '01000000002' }),
    sale({ total: 90, createdAtMs: 3000 }),
    sale({ total: -50, isReversal: true, createdAtMs: 4000 }),
    sale({ total: 999, createdAtMs: 5000, reversed: true }),
    sale({ total: 777, createdAtMs: 6000, customerPhone: '' }),
    sale({ total: 60, createdAtMs: 7000, branch: 'echarpe Madinaty' }),
    sale({ total: 40, createdAt: { toMillis: () => 8000 }, createdAtMs: 0, customerPhone: '01000000002' }),
  ];
  const oldAgg = oldWay(data, B);
  const built = C.buildFromSales(data);
  const key = C.branchKey(B);
  const same = Object.keys(oldAgg).every((p) => {
    const a = oldAgg[p]; const b = built[p][key];
    return a.spend === b.spend && a.count === b.count && a.lastTs === b.lastTs;
  }) && Object.keys(oldAgg).length === 2;
  ok(same, '🔴 الطريقتين بيطلعوا **نفس** الإنفاق والزيارات وآخر زيارة بالظبط');
  ok(built['01000000001'][key].spend === 290 && built['01000000001'][key].count === 2, 'عميلة 1: 250+90−50 = 290 · زيارتين');
  ok(built['01000000001']['echarpe_Madinaty'].spend === 60, '🔴 كل فرع لوحده — فرع مدينتي مبيدخلش في حساب الرحاب');
  ok(C.statsFor({ stats: built['01000000002'] }, B).spend === 160, 'القراءة من مستند العميلة');
  ok(C.statsFor({}, B).spend === 0 && C.statsFor(null, B).count === 0, 'عميلة من غير إحصائيات = أصفار مش خطأ');
}

console.log('\n🔗 العميل والسيرفر بيتكلموا نفس اللغة');
{
  // بنسحب الدالتين من pos-reports.js نفسه — لو حد غيّر واحدة من غير التانية الاختبار بيقع
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'pos', 'pos-reports.js'), 'utf8');
  const grab = (name) => {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return null;
    let d = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') d++;
      else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
    }
    return null;
  };
  const code = grab('custBranchKey') + '\n' + grab('custStatsFor');
  ok(!!grab('custBranchKey') && !!grab('custStatsFor'), 'الدالتين موجودين في pos-reports.js');
  const client = new Function(code + '; return { custBranchKey: custBranchKey, custStatsFor: custStatsFor };')();

  const branches = ['echarpe El Rehab', 'echarpe Madinaty', 'Glow City Centre', '', 'a.b', 'x/y  z'];
  ok(branches.every((b) => client.custBranchKey(b) === C.branchKey(b)),
    '🔴 مفتاح الفرع واحد في العميل والسيرفر — لو اختلف، الشاشة تقرا خانة فاضية وتعرض أصفار');

  const doc = { stats: { 'echarpe_El_Rehab': { spend: 290, count: 2, lastTs: 4000 } } };
  ok(branches.every((b) => JSON.stringify(client.custStatsFor(doc, b)) === JSON.stringify(C.statsFor(doc, b))),
    '🔴 القراءة بتطلع نفس الأرقام بالظبط من الجهتين');
  ok(JSON.stringify(client.custStatsFor({}, 'x')) === JSON.stringify({ spend: 0, count: 0, lastTs: 0 }),
    'عميلة لسه ماتجردتش = أصفار (مش undefined يكسر العرض)');
}

console.log('\n🔐 أمان التشغيل');
{
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'pos', 'pos-reports.js'), 'utf8');
  ok(/doc\('customer_stats'\)/.test(src) && /_statsReady/.test(src),
    'الشاشة بتشوف علم الجرد قبل ما تعتمد على الأرقام المخزّنة');
  ok(/_statsReady \? Promise\.resolve\(\[\]\) : getBranchSales\(\)/.test(src),
    '🔴 قراءة كل فواتير الفرع بتتلغي **بس** لما العلم يكون مرفوع — غير كده الطريقة القديمة شغالة زي ما هي');
  ok(/agg\[c\.phone\] \|\| \{ spend:0, count:0, lastTs:0 \}/.test(src),
    '🔴 الحساب القديم لسه موجود كـfallback — نقدر نرجّع في ثانية بعلم واحد');
}

console.log('\n' + (F ? '❌ ' + F + ' فشل' : '✅ كل الاختبارات عدّت') + ' (' + P + ' نجاح)');
process.exit(F ? 1 : 0);
