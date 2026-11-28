// «راضي؟» — منطق التقييم: المؤشر، يوم الشغل، الموبايل المصري، منع التلاعب، التنبيه
'use strict';
const C = require('../rady/rady-core.js');

// مؤشر الرضا
assertEq(C.satisfactionIndex({1:0,2:0,3:0,4:0}), null, 'مفيش تقييمات = null مش صفر');
assertEq(C.satisfactionIndex({1:0,2:0,3:0,4:5}), 100, 'كله ممتاز = 100');
assertEq(C.satisfactionIndex({1:5,2:0,3:0,4:0}), 0, 'كله وحش جدًا = 0');
assertEq(C.satisfactionIndex({1:1,2:1,3:1,4:1}), 50, 'متوزّع بالتساوي = 50');
assertEq(C.happyShare({1:1,2:1,3:1,4:1}), 50, 'نسبة الراضيين');

// يوم الشغل (القاهرة، الساعة الفاصلة 6ص) — نوفمبر القاهرة +2
const t = (iso) => Date.parse(iso);
assertEq(C.workday(t('2026-11-27T23:30:00Z'), 6), '2026-11-27', '1:30 بالليل القاهرة تبع امبارح');
assertEq(C.workday(t('2026-11-28T03:59:00Z'), 6), '2026-11-27', '5:59ص تبع امبارح');
assertEq(C.workday(t('2026-11-28T04:00:00Z'), 6), '2026-11-28', '6ص يوم جديد');
assertEq(C.workday(t('2026-11-27T23:30:00Z'), 0), '2026-11-28', 'من غير ساعة فاصلة = التاريخ العادي');
assertEq(C.cairoHour(t('2026-11-28T12:00:00Z')), 14, 'الساعة بتوقيت القاهرة');
assertEq(C.workday(t('2026-07-01T21:30:00Z'), 0), '2026-07-02', 'الصيف: 12:30 بالليل القاهرة (+3) = اليوم الجديد');
assertEq(C.dayRange('2026-02-27', '2026-03-02').length, 4, 'مدى الأيام بيعدّي آخر الشهر');
assertEq(C.weekdayAr('2026-11-27'), 'الجمعة', 'اسم اليوم');

// الموبايل المصري
assertEq(C.normalizeEgPhone('01012345678'), '01012345678', 'رقم عادي');
assertEq(C.normalizeEgPhone('+20 112 345 6789'), '01123456789', '+20 بمسافات');
assertEq(C.normalizeEgPhone('٠١٢٣٤٥٦٧٨٩٠'), '01234567890', 'أرقام عربي');
assertEq(C.normalizeEgPhone('00201512345678'), '01512345678', '0020');
assertEq(C.normalizeEgPhone('01312345678'), null, '013 مش شبكة');
assertEq(C.normalizeEgPhone('0101234567'), null, 'ناقص رقم');
assertEq(C.waLink('01012345678', 'أهلًا'), 'https://wa.me/201012345678?text=' + encodeURIComponent('أهلًا'), 'لينك واتساب');

// منع التلاعب
assertEq(C.spamFlag([], 10000), null, 'أول ضغطة سليمة');
assertEq(C.spamFlag([10000], 10800), 'fast', 'ضغطتين ورا بعض في أقل من ثانية ونص');
assertEq(C.spamFlag([1000, 4000, 7000, 10000, 13000], 16000), 'burst', '6 في 20 ثانية = كتير');
assertEq(C.spamFlag([1000, 4000, 7000, 10000], 16000), null, '5 في 20 ثانية لسه طبيعي');

// buildVote
const now = t('2026-11-28T16:00:00Z');
const v = C.buildVote({ v: 1, reason: 'التعامل', phone: '+201001234567' }, { now, pointId: 'p1', cutoffHour: 6, recentTs: [] });
assertEq([v.v, v.workday, v.hour, v.phone, v.reason, v.flag], [1, '2026-11-28', 18, '01001234567', 'التعامل', undefined], 'بناء التقييم');
let threw = false; try { C.buildVote({ v: 5 }, { now, pointId: 'p1' }); } catch (e) { threw = true; }
assert(threw, 'تقييم 5 مرفوض');
const bad = C.buildVote({ v: 2, phone: '123' }, { now, pointId: 'p1', recentTs: [now - 500] });
assertEq([bad.phone, bad.flag], [undefined, 'fast'], 'رقم غلط مبيتحفظش + ضغطة سريعة متعلّمة');

// التنبيه
const mk = (v, ago, extra) => Object.assign({ pointId: 'p1', v, ts: now - ago * 60000 }, extra || {});
assertEq(C.checkAlert([mk(1, 1), mk(2, 3), mk(1, 5), mk(4, 6)], 'p1', now), { bad: 3, all: 4 }, '3 وحشين من 4 في 10 دقايق = تنبيه');
assertEq(C.checkAlert([mk(1, 1), mk(2, 3), mk(1, 15)], 'p1', now), null, 'القديم مش محسوب');
assertEq(C.checkAlert([mk(1, 1), mk(1, 2), mk(1, 3), mk(4, 4), mk(4, 4), mk(4, 4), mk(3, 5)], 'p1', now), null, 'وحشين قليلين وسط كتير حلوين = مفيش تنبيه');
assertEq(C.checkAlert([mk(1, 1, { flag: 'fast' }), mk(1, 1, { flag: 'fast' }), mk(1, 2)], 'p1', now), null, 'الضغط السريع مبيعملش تنبيه');
assertEq(C.checkAlert([mk(1, 1), mk(1, 2), mk(1, 3)], 'p2', now), null, 'نقطة تانية');

// التجميع
const votes = [
  { pointId: 'a', v: 4, ts: now, workday: '2026-11-28', hour: 18, reason: 'التعامل' },
  { pointId: 'a', v: 1, ts: now, workday: '2026-11-28', hour: 18, reason: 'الأسعار', phone: '01012345678' },
  { pointId: 'b', v: 3, ts: now, workday: '2026-11-27', hour: 20 },
  { pointId: 'a', v: 4, ts: now, workday: '2026-11-28', hour: 18, flag: 'burst' }
];
const a = C.aggregate(votes, { fromDay: '2026-11-28', toDay: '2026-11-28' });
assertEq([a.total, a.flagged, a.index, a.counts[4], a.callbacks.length], [2, 1, 50, 1, 1], 'تجميع يوم واحد والمستبعد لوحده');
assertEq([a.reasonsBad['الأسعار'], a.reasonsGood['التعامل']], [1, 1], 'الأسباب بتتقسم زعل/رضا');
assertEq(C.aggregate(votes, { pointId: 'b' }).total, 1, 'فلتر النقطة');
assertEq(C.topReasons({ x: 1, y: 3, z: 2 }, 2).map(r => r.reason), ['y', 'z'], 'أكتر الأسباب');

// التصدير: BOM عشان Excel يقرا العربي + الفاصلة جوه السبب
const csv = C.toCSV([{ pointId: 'a', v: 2, ts: now, workday: '2026-11-28', reason: 'زحمة، وكمان "انتظار", طويل' }], { a: { name: 'المدخل' } });
assert(csv.charCodeAt(0) === 0xFEFF, 'CSV فيه BOM');
assert(csv.indexOf('"زحمة، وكمان ""انتظار"", طويل"') > 0, 'CSV بيهرب الفاصلة والتنصيص');

// البيانات التجريبية
const demo = C.demoVotes([{ id: 'p1', type: 'shop' }, { id: 'p2', type: 'restaurant' }], 7, now, 3);
assert(demo.length > 200, 'بيانات تجريبية كفاية: ' + demo.length);
assert(demo.every(x => x.v >= 1 && x.v <= 4 && x.ts <= now && x.workday), 'البيانات التجريبية سليمة');
