/* 🧪 خصومات الولاء في التقارير — node tests/test-loyalty-discounts.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const src = rd('pos/loyalty-discounts.js'), rep = rd('pos/pos-reports.js'), html = rd('pos/index.html');
const M = require(path.join(ROOT, 'pos/loyalty-discounts.js'));
let p = 0, f = 0;
const t = (n, fn) => { try { fn(); p++; console.log('  ✅ ' + n); } catch (e) { f++; console.log('  ❌ ' + n + ' → ' + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw Error((m || '') + ' وجه ' + JSON.stringify(a) + ' والمتوقع ' + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) throw Error(m || 'شرط فشل'); };
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

const ITEM = { name: 'طرحة', price: 350, qty: 1 };
const S = {
  pts:    { id: 'a', _t: 5, total: 300, pointsRedeemed: 100, customerPhone: '0101', customerName: 'منى', employeeName: 'سارة', items: [ITEM, { price: -50, qty: 1, isRedemption: true }] },
  rew:    { id: 'b', _t: 9, total: 330, customerPhone: '0102', items: [ITEM, { price: -20, qty: 1, isRewardDiscount: true }] },
  credit: { id: 'c', _t: 7, total: 350, payments: { credit: 350 }, items: [ITEM] },
  legacyCredit: { id: 'd', _t: 3, total: 0, items: [ITEM, { price: -350, qty: 1, isRedemption: true, isCreditSpend: true }] },
  trans:  { id: 'e', _t: 8, total: 350, payments: { visa: 270, points: 50, reward: 30 }, pointsRedeemed: 100, items: [ITEM] },
  ret:    { id: 'g', _t: 2, total: -350, items: [{ price: -350, qty: 1, isReturn: true }] }
};

console.log('\n🧮 الحساب');
t('استبدال نقط: المبلغ + عدد النقط + العميلة والكاشير', () => { const d = M.loyaltyDiscountRows([S.pts]); eq(d.points.total, 50); eq(d.points.count, 1); eq(d.points.pts, 100); eq(d.points.rows[0].customerName, 'منى'); eq(d.points.rows[0].employeeName, 'سارة'); eq(d.reward.count, 0); });
t('مكافأة خاصة', () => { const d = M.loyaltyDiscountRows([S.rew]); eq(d.reward.total, 20); eq(d.reward.rows[0].id, 'b'); eq(d.points.count, 0); });
t('⭐⭐ صرف الرصيد **مش** خصم ولاء (الشكلين)', () => { const d = M.loyaltyDiscountRows([S.credit, S.legacyCredit]); eq(d.total, 0); });
t('⭐⭐ الفواتير الانتقالية (payments.points/reward) محسوبة', () => { const d = M.loyaltyDiscountRows([S.trans]); eq(d.points.total, 50); eq(d.reward.total, 30); eq(d.points.pts, 100); });
t('سطر مرتجع سالب مش خصم', () => eq(M.loyaltyDiscountRows([S.ret]).total, 0));
t('⭐ المعكوس وفاتورة العكس مستبعدين (زي repAggregate)', () => eq(M.loyaltyDiscountRows([{ ...S.pts, reversed: true }, { ...S.rew, isReversal: true }]).total, 0));
t('الإجمالي والترتيب (الأحدث فوق)', () => { const d = M.loyaltyDiscountRows([S.pts, S.rew, S.trans]); eq(d.total, 150); eq(d.points.rows.map(r => r.id).join(), 'e,a'); eq(d.reward.rows.map(r => r.id).join(), 'b,e'); });
t('⭐ صورة المالك: 6 مكافآت = 120 و2 استبدال = 60', () => {
  const sales = []; for (let i = 0; i < 6; i++) sales.push({ id: 'r' + i, total: 350, payments: { cash: 330, reward: 20 }, items: [ITEM] });
  for (let i = 0; i < 2; i++) sales.push({ id: 'p' + i, total: 350, payments: { cash: 320, points: 30 }, items: [ITEM] });
  const d = M.loyaltyDiscountRows(sales); eq(d.reward.count, 6); eq(d.reward.total, 120); eq(d.points.count, 2); eq(d.points.total, 60); eq(d.total, 180);
});
t('قيم فاضية مبتكسرش', () => { eq(M.loyaltyDiscountRows(null).total, 0); eq(M.loyaltyDiscountRows([null, {}]).total, 0); });

console.log('\n🖥️ العرض');
function ui() {
  const ctx = vm.createContext({ console, document: { getElementById: () => null, createElement: () => ({ style: {}, addEventListener() {} }), body: { appendChild() {} } } });
  ctx.window = ctx; ctx.saleTs = s => s._ts || 0; vm.runInContext(src, ctx); return ctx;
}
t('مفيش خصومات = مفيش بطاقة خالص', () => eq(ui().loyaltyDiscountCardHTML([S.credit]), ''));
t('⭐ البطاقة فيها السطرين والإجمالي، وكل سطر بيفتح تفاصيله', () => { const h = ui().loyaltyDiscountCardHTML([S.pts, S.rew]); ok(/openLoyaltyDiscounts\('points'\)/.test(h) && /openLoyaltyDiscounts\('reward'\)/.test(h)); ok(/−70\.00 ج\.م/.test(h), 'الإجمالي'); ok(/100 نقطة/.test(h)); });
t('⭐⭐ اسم العميلة/الكاشير بيتهرّب (HTML) قبل العرض', () => { const c = strip(src); ok(/esc\(r\.customerName \|\| r\.customerPhone\)/.test(c)); ok(/esc\(r\.employeeName\)/.test(c)); ok(/safeId\(r\.customerPhone\)/.test(c) && /safeId\(r\.id\)/.test(c), 'القيم جوّه onclick لازم تتنضّف'); });
t('⭐ فاتورة خصم من غير عميلة بتتعلّم بتحذير', () => ok(/من غير عميلة/.test(src)));
t('🔒 قراءة بس — مفيش كتابة ولا نداء سيرفر', () => { const c = strip(src); ['.set(', '.update(', '.add(', '.delete(', 'httpsCallable', 'collection('].forEach(x => ok(c.indexOf(x) < 0, 'لقيت ' + x)); });
t('ممنوع prompt/confirm/alert', () => ok(!/\b(prompt|confirm|alert)\s*\(/.test(strip(src))));

console.log('\n🔗 التوصيل');
t('⭐⭐ تبويب المدفوعات بينادي البطاقة بنفس فواتير التقرير، وجوّه منطقة الطباعة', () => {
  const c = strip(rep); const i = c.indexOf("currentReportType === 'payments'"); const j = c.indexOf("currentReportType === 'invoices'", i); const b = c.slice(i, j);
  ok(/loyaltyDiscountCardHTML\(sales\)/.test(b), 'مش متنادية'); ok(b.indexOf('loyaltyDiscountCardHTML') < b.lastIndexOf('printReportArea'), 'بره منطقة الطباعة');
  ok(/typeof loyaltyDiscountCardHTML === 'function'/.test(b), 'لو الملف وقع التقرير لازم يكمّل');
});
t('متحمّل في index.html', () => ok(/src="loyalty-discounts\.js\?v=\d+"/.test(html.replace(/<!--[\s\S]*?-->/g, ''))));
t('CACHE_NAME اترفع', () => ok(+rd('pos/sw.js').match(/pos-shell-v(\d+)/)[1] >= 706));

console.log('\n===============================\nالنتيجة: ' + p + ' ناجح · ' + f + ' فاشل\n===============================\n');
process.exit(f ? 1 : 0);
