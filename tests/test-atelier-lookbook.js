// ============================================================
// 🧪 test-atelier-lookbook.js — الأتيليه (hijabLookbook + atelier-core)
// ------------------------------------------------------------
// اللي بيقفله:
//   ١) الدالة بتطلب req.auth — العدّاد على الـuid مش تليفون من العميل.
//   ٢) فيه سقف يومي للمتجر كله غير سقف العميلة (حماية الميزانية).
//   ٣) الحارس عدّاد بس — مفيش صورة بتتكتب في Firestore.
//   ٤) لحد ٤ منتجات بس، وأي صورة بايظة = رفض الطلب كله.
//   ٥) البرومبت: خانة لكل منتج بترتيبه + ممنوع الخلط بين الخانات.
//   ٦) الدالة مربوطة في index.js (من غير الربط مش منشورة).
//   ٧) الصفحة: نفس شرط منتجات البيع أونلاين، والنزول لـhijabTryOn
//      لما hijabLookbook مش منشورة — بس مش لما السقف يخلص.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const LB_PATH = path.join(ROOT, 'functions', 'hijabLookbook.js');
const CORE_PATH = path.join(ROOT, 'functions', 'hijabTryOn.js');
const IDX_PATH = path.join(ROOT, 'functions', 'index.js');

function loadFn(file, extraStubs) {
  class FakeHttpsError extends Error { constructor(c, m){ super(m); this.code = c; } }
  const stubs = Object.assign({
    'firebase-functions/v2/https': { onCall: () => 'ONCALL', HttpsError: FakeHttpsError },
    'firebase-functions/params': { defineSecret: (n) => ({ value: () => 'STUB_' + n }) },
    'firebase-admin/firestore': { getFirestore: () => ({}), FieldValue: { serverTimestamp: () => 0 } }
  }, extraStubs || {});
  const module = { exports: {} };
  const sandbox = {
    require: (id) => { if (stubs[id]) return stubs[id]; throw new Error('unexpected require ' + id); },
    module, exports: module.exports, console,
    Object, Array, Math, Number, String, JSON, Date, Set, RegExp, Error, Promise,
    Intl, encodeURIComponent, fetch: () => { throw new Error('no-net-in-test'); }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: path.basename(file) });
  return module.exports;
}

const SRC = fs.readFileSync(LB_PATH, 'utf8');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/[^\n]*/gm, ' ');

let core = null, M = null;
try {
  core = loadFn(CORE_PATH);
  M = loadFn(LB_PATH, { './hijabTryOn': core });
} catch (e) { assert(false, 'hijabLookbook لازم يتحمّل من غير firebase-functions — ' + e.message); }

if (M) {
  // ١) الإعدادات + السقفين
  const c0 = M.resolveLookbookConfig(null);
  assert(c0.enabled === true, 'الافتراضي: الأتيليه مفعّل');
  assert(c0.capPerUser === M.LOOKBOOK_DEFAULTS.lookbookCapPerUser, 'سقف العميلة الافتراضي');
  assert(c0.capGlobal === M.LOOKBOOK_DEFAULTS.lookbookCapGlobal, 'سقف المتجر الافتراضي');
  assert(M.resolveLookbookConfig({ lookbookEnabled: false }).enabled === false, 'lookbookEnabled:false بيقفل الأتيليه');
  assert(M.resolveLookbookConfig({ enabled: false }).enabled === false, 'قفل التجربة كلها بيقفل الأتيليه كمان');
  assert(M.resolveLookbookConfig({ lookbookCapGlobal: -3 }).capGlobal === M.LOOKBOOK_DEFAULTS.lookbookCapGlobal, 'سقف سالب → الافتراضي');

  const cfg = { capPerUser: 2, capGlobal: 3 };
  assert(M.lookbookGuardDecide(1, 0, cfg).allow === true, 'تحت السقفين = مسموح');
  assert(M.lookbookGuardDecide(2, 0, cfg).allow === false, 'سقف العميلة: المساواة بتترفض');
  assert(M.lookbookGuardDecide(0, 3, cfg).allow === false, 'سقف المتجر كله بيوقف حتى عميلة جديدة');

  // مفاتيح الحارس: الـuid بيتنضّف، وسقف المتجر مستند واحد لليوم
  const t = Date.UTC(2026, 9, 14, 12);
  assert(M.userDayKey('a/b..c$', t) === 'lb_abc_2026-10-14', 'مفتاح العميلة نضيف + يوم القاهرة');
  assert(M.globalDayKey(t) === 'lb_all_2026-10-14', 'مفتاح المتجر لليوم');

  // ٤) المنتجات
  const img = 'data:image/jpeg;base64,' + Buffer.from('xxxxxxxx').toString('base64');
  const ok = M.sanitizeProducts([{ id: 'a', image: img }, { id: 'b', image: img }]);
  assert(ok.length === 2 && ok[0].id === 'a' && ok[1].id === 'b', 'الترتيب محفوظ');
  let threw = false;
  try { M.sanitizeProducts([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => ({ id: 'p' + i, image: img }))); } catch (e) { threw = true; }
  assert(threw, 'أكتر من ٩ منتجات = رفض');
  threw = false;
  try { M.sanitizeProducts([{ id: 'a', image: img }, { id: 'b', image: 'http://x/y.jpg' }]); } catch (e) { threw = true; }
  assert(threw, 'صورة مش data-URL = رفض الطلب كله');
  threw = false;
  try { M.sanitizeProducts([]); } catch (e) { threw = true; }
  assert(threw, 'من غير منتجات = رفض');

  // ٥) البرومبت
  const p4 = M.buildLookbookPrompt(4);
  assert(/2 row\(s\) by 2 column\(s\)/.test(p4), '٤ منتجات = شبكة ٢×٢ (نفس اللي الصفحة بتقصّه)');
  assert(p4.includes('cell 1:') && p4.includes('IMAGE 5') && !p4.includes('cell 5:'), 'خانة لكل منتج بالترتيب');
  assert(/Never mix, swap, blend or repeat/.test(p4), 'ممنوع الخلط بين الخانات');
  assert(/Preserve the customer's identity exactly/.test(p4), 'الحفاظ على العميلة');
  assert(/1 row\(s\) by 2 column\(s\)/.test(M.buildLookbookPrompt(2)), 'منتجين = صف ١×٢');
}

// ١ + ٣) فحوص الكود نفسه
assert(/req\.auth\s*&&\s*req\.auth\.uid/.test(CODE) && /"unauthenticated"/.test(CODE), 'الدالة بترفض من غير req.auth');
assert(!/customerImage[^;\n]*tx\.set|tx\.set\([^)]*(image|b64)/.test(CODE), 'الحارس مبيكتبش صور');
assert(!/getStorage|\.bucket\(/.test(CODE), 'مفيش Storage — الصورة متتخزّنش');
assert(!/initializeApp\s*\(/.test(CODE), 'مفيش initializeApp في ملف الدالة');
assert(/GEMINI_API_KEY\.value\(\)/.test(CODE) && !/AIza[0-9A-Za-z_-]{20,}/.test(SRC), 'المفتاح من Secret Manager بس');
assert(/require\("\.\/hijabLookbook"\)/.test(fs.readFileSync(IDX_PATH, 'utf8')), 'hijabLookbook مربوطة في index.js');

// ٧) منطق الصفحة
const AC = require(path.join(ROOT, 'atelier', 'atelier-core.js'));
const dataImg = 'data:image/jpeg;base64,AAAA';
const items = AC.shopItemsFrom({ items: [
  { id: '1', barcode: 'b1', name: 'أ', price: 300, onlineQty: 2, active: true, img: dataImg },
  { id: '2', barcode: 'b2', name: 'ب', price: 300, onlineQty: 0, active: true, img: dataImg },
  { id: '3', barcode: 'b3', name: 'ج', price: 300, onlineQty: 2, active: false, img: dataImg },
  { id: '4', barcode: '', name: 'د', price: 300, onlineQty: 2, active: true, img: dataImg },
  { id: '5', barcode: 'b5', name: 'ه', price: 300, onlineQty: 2, active: true, img: 'https://x/y.jpg' }
] });
assert(items.map((p) => p.id).join(',') === '1,5', 'نفس شرط shopItems بتاع loyalty');
assert(items[0].tryable === true && items[1].tryable === false, 'المنتج من غير صورة data-URL بيتعرض بس مش بيتجرّب');
assert(AC.buildBatches([1, 2, 3, 4, 5, 6], 4).map((b) => b.length).join() === '4,2', 'دفعات ٤ بالترتيب');
// منتجات وهمية للاختبار: موديل بـ٦ ألوان، وموديل بـ٣، وقطع تانية
const mk = (id, line, fam) => ({ id, line, family: fam || line, kind: 'hijab', tryable: true });
const prods = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((i) => mk(i, 'mono'))
  .concat(['c1', 'c2', 'c3'].map((i) => mk(i, 'crepe')), ['z1', 'z2', 'z3', 'z4'].map((i) => mk(i, 'zebre')));
const r1 = AC.buildRound(null, prods, {}, {});
assert(r1.length === AC.ROUND_SIZE && r1.every((p) => p.kind === 'hijab'), 'أول تجربة = ٦ طرح (من غير إسدال)');
const mono = prods[3];
const rm = AC.buildRound(mono, prods, {}, {});
assert(rm[0] === mono && rm.length === 6 && rm.every((p) => p.line === 'mono'), '«جرّبيها» على موديل = القطعة + ألوانها من نفس الموديل');
const crepe = prods[7];
const rc = AC.buildRound(crepe, prods, {}, {});
assert(rc[0] === crepe && rc.filter((p) => p.line === 'crepe').length === 3 && rc.length === 6, 'لو ألوانها أقل من ٦ بنكمّل من الباقي');
assert(AC.buildRound(mono, prods, { [mono.id]: 'x' }, {}).indexOf(mono) < 0, 'اللي إطلالته جاهزة مش بتتولّد تاني');
const isd = { id: 'is1', kind: 'isdal', line: 'isdal', tryable: true };
assert(AC.buildRound(isd, prods.concat([isd, { id: 'is2', kind: 'isdal', line: 'isdal', tryable: true }]), {}, {}).every((p) => p.kind === 'isdal'), 'الإسدال مبيتخلطش مع الطرح');
const fam = AC.buildRound({ id: 'f', kind: 'hijab', line: 'other', family: 'كوري', tryable: true },
  [{ id: 'f', kind: 'hijab', line: 'other', family: 'كوري', tryable: true }, { id: 'z', kind: 'hijab', line: 'other', family: 'تاني', tryable: true }, { id: 'g', kind: 'hijab', line: 'crepe', family: 'كوري', tryable: true }], {}, {});
assert(fam.map((p) => p.id).join() === 'f,g,z', 'الموديل من صفحة الإدارة بيسبق النوع');
const t0 = AC.roundsState(null, '2026-10-24');
assert(t0.allowed === 1 && t0.left === 1, 'تجربة واحدة ببلاش في اليوم');
assert(AC.roundsState({ day: '2026-10-24', n: 1 }, '2026-10-24').left === 0, 'بعد التجربة الأولى مفيش غير لو حطّت حاجة في الحقيبة');
assert(AC.roundsState({ day: '2026-10-24', n: 1, bonus: true }, '2026-10-24').left === 1, '🎁 الحقيبة بتدّي تجربة كمان');
assert(AC.roundsState({ day: '2026-10-23', n: 2, bonus: true }, '2026-10-24').left === 1, 'العدّاد بيتصفّر كل يوم');
assert(AC.MAX_ROUNDS === 2, 'أقصى حاجة نداءين = سقف السيرفر');
assert(AC.shouldFallbackToSingle({ code: 'functions/internal' }) === true, 'دالة مش منشورة → ننزل لمنتج واحد');
assert(AC.shouldFallbackToSingle({ code: 'functions/resource-exhausted' }) === false, 'خلص السقف ≠ ننزل (مش هنحرق نداءات أكتر)');
assert(AC.cacheProductId({ id: 'x' }, true) !== AC.cacheProductId({ id: 'x' }, false), 'كاش الجودة العالية منفصل عن الشبكة');

// ٨) الإسدال + مجموعة الدار
if (M) {
  const pi = M.buildLookbookPrompt(2, 'isdal');
  assert(/isdal/.test(pi) && !/two-long-ends/.test(pi), 'برومبت الإسدال منفصل عن لفّة الطرحة');
  assert(/1 row\(s\) by 2 column\(s\)/.test(pi), 'الإسدال بنفس هندسة الشبكة');
  assert(M.cleanGarment('<script>') === 'hijab' && M.cleanGarment('isdal') === 'isdal', 'نوع القطعة من قائمة مسموحة بس');
}
assert(AC.kindOf({ name: 'إسدال صلاة كحلي' }) === 'isdal' && AC.kindOf({ name: 'طرحة كريب' }) === 'hijab', 'الإسدال بيتعرف من الاسم');
const tb = AC.takeBatch([{ id: 1, kind: 'hijab' }, { id: 2, kind: 'isdal' }, { id: 3, kind: 'hijab' }], 4);
assert(tb.batch.map((p) => p.id).join() === '1,3' && tb.rest.map((p) => p.id).join() === '2', 'الطرح والإسدال مبيتخلطوش في شبكة واحدة');
const house = AC.houseCollection('collection/');
assert(house.length === 9 && house.every((p) => p.tryable && p.line === 'chiffon' && AC.lineName(p.line)), 'المجموعة = ميسي شيفون كويتي بس (٩ ألوان)');
assert(house.every((p) => fs.existsSync(path.join(ROOT, 'atelier', p.img))), 'كل صورة في مجموعة الدار موجودة فعلاً');
assert(!house.some((p) => p.kind === 'isdal'), 'الإسدالات اتشالت من المجموعة');
const linen = house.filter((p) => p.line === 'chiffon');
assert(linen.length === 9 && linen.every((p) => p.colorName && p.price === 490) && linen.find((p) => p.colorName === 'رمادي دخاني').gallery.length === 2, 'ميسي شيفون كويتي: موديل واحد بـ٥ ألوان بـ٤٩٠ وصورهم الزيادة');
assert(house.every((p) => (p.gallery || []).every((g) => fs.existsSync(path.join(ROOT, 'atelier', g)))), 'كل الصور الزيادة موجودة');

// ٩) ٦ قطع في النداء: نفس الشبكة على السيرفر والصفحة + 2K
if (M) {
  for (let n = 1; n <= 9; n++) {
    const a = M.lookbookLayout(n), b = AC.gridLayout(n);
    assert(a.cols === b.cols && a.rows === b.rows && a.cols * a.rows >= n, 'شبكة ' + n + ' قطع متطابقة بين السيرفر والصفحة');
  }
  assert(M.lookbookImageConfig(6).imageSize === '2K' && M.lookbookImageConfig(6).aspectRatio === '5:4', '٦ قطع = 3×2 بحجم 2K');
  const p6 = M.buildLookbookPrompt(6);
  assert(/2 row\(s\) by 3 column\(s\)/.test(p6) && p6.includes('cell 6:') && p6.includes('IMAGE 7'), 'برومبت ٦ قطع');
  assert(/remaining 1 cell/.test(M.buildLookbookPrompt(5)), 'الخانة الفاضية متوصوفة لما القطع أقل من الشبكة');
}
assert(AC.ROUND_SIZE === 6, 'التجربة ٦ قطع');
const gc = AC.gridCells(1500, 1200, 5, 0);
assert(gc.length === 5 && gc[3].x === 0 && gc[3].y === 600 && gc[2].x === 1000, 'القص بالترتيب: شمال لليمين ومن فوق لتحت');

// ١٠) صفحة الإدارة: تجميع الصور المتشابهة + أسماء من اللون + التنظيف
const AD = require(path.join(ROOT, 'atelier', 'admin-core.js'));
const H0 = '0'.repeat(64), H1 = '0'.repeat(60) + '1111', HX = '01'.repeat(32);
const groups = AD.groupSimilar([
  { hash: H0, color: [40, 48, 82] }, { hash: HX, color: [200, 30, 40] },
  { hash: H1, color: [42, 50, 80] }, { hash: H0, color: [230, 225, 215] }
]);
assert(JSON.stringify(groups) === '[[0,2],[1],[3]]', 'الصور المتشابهة بتتجمّع، ونفس الشكل بلون مختلف (إسدالين على نفس المانيكان) لأ');
assert(AD.colorName([30, 29, 30]) === 'أسود' && AD.colorName([41, 49, 80]) === 'كحلي', 'اسم اللون من القماش');
assert(AD.defaultName('isdal', [120, 70, 140]) === 'إسدال بنفسجي' && AD.defaultName('crepe', [128, 128, 128]) === 'طرحة رمادي', 'اسم مبدئي حسب النوع');
assert(AD.uniqueNames(['طرحة كحلي', 'طرحة كحلي'])[1] !== 'طرحة كحلي', 'الأسماء المكررة بتتميّز');
const ci = AD.cleanItem({ id: 'a/b', name: ' x ', price: '349.6', line: 'ISDAL!', barcode: '12 34<', active: false, thumb: 'data:...' });
assert(ci.id === 'ab' && ci.price === 350 && ci.line === 'other' && ci.barcode === '1234' && ci.active === false && !('thumb' in ci), 'العنصر بيتنضّف قبل الحفظ (ومفيش صور في القايمة)');
const ai = AC.atelierItemsFrom({ items: [{ id: 'k1', name: 'إسدال', price: 600, line: 'isdal', barcode: '55' }, { id: 'k2', active: false }] });
assert(ai.length === 1 && ai[0].kind === 'isdal' && ai[0].admin && ai[0].barcode === '55', 'الأتيليه بيقرا قطع صفحة الإدارة الظاهرة بس');
const LOY = fs.readFileSync(path.join(ROOT, 'loyalty', 'index.html'), 'utf8');
assert(/atelierBannerHTML\(\) \+ grid/.test(LOY) && /d\.type === 'atelier-order'/.test(LOY), 'غرفة القياس مربوطة بـ«اطلبي» وسلة التطبيق');
assert(AD.cleanItem({ family: ' كريب "كوري" ' }).family === 'كريب كوري', 'الموديل بيتحفظ نضيف');
assert(AC.atelierItemsFrom({ items: [{ id: 'm', line: 'crepe', family: 'كوري' }] })[0].family === 'كوري', 'الأتيليه بيقرا الموديل');

// ١١) أوردرات غرفة القياس: إشعار للمالك من غير POS
const ORD_PATH = path.join(ROOT, 'functions', 'atelierOrders.js');
let O = null;
try { O = loadFn(ORD_PATH, { 'firebase-admin/messaging': { getMessaging: () => ({}) },
  'firebase-functions/v2/https': { onCall: () => 'ONCALL', onRequest: () => 'ONREQ', HttpsError: class extends Error { constructor(c, m) { super(m); this.code = c; } } } }); }
catch (e) { assert(false, 'atelierOrders لازم يتحمّل — ' + e.message); }
if (O) {
  assert(O.cleanPhone('+20 114 866 4485') === '01148664485' && O.cleanPhone('1148664485') === '01148664485' && O.cleanPhone('0123') === '', 'رقم الموبايل المصري بيتنضّف ويترفض لو غلط');
  assert(O.validateOrder({ name: 'سارة', phone: '01148664485', fulfillment: 'delivery', governorate: 'القاهرة', address: 'التجمع شارع ٩٠' }).phone === '01148664485', 'طلب توصيل سليم');
  assert(O.validateOrder({ name: 'سارة', phone: '01148664485', fulfillment: 'delivery' }).error === 'ADDRESS', 'التوصيل من غير عنوان بيترفض');
  assert(O.validateOrder({ name: 'سارة', phone: '01148664485', fulfillment: 'pickup' }).error === 'BRANCH', 'الاستلام من غير فرع بيترفض');
  const pi = O.priceItems([{ docId: 'a1', price: 1, name: 'x' }, { barcode: 'B9', price: 5 }, { img: 'collection/linen-rose.jpg', name: 'ميسي' }, { img: 'https://evil/x.jpg' }],
    [{ id: 'a1', name: 'كريب', price: 350, family: 'كوري' }], [{ barcode: 'B9', name: 'شال', price: 500 }]);
  assert(pi[0].price === 350 && pi[1].price === 500 && pi[2].price === 490 && pi[3].price === 0, 'الأسعار من السيرفر مش من الموبايل');
  assert(/atelierImg\?id=a1$/.test(pi[0].imgUrl) && /\/atelier\/collection\/linen-rose\.jpg$/.test(pi[2].imgUrl) && pi[3].imgUrl === '', 'صورة الإشعار: لينك المنتج بس (مفيش لينكات من برّه)');
  assert(!('img' in pi[0]), 'مفيش صور بتتخزّن في الأوردر — لينكات بس');
  assert(O.shippingFor({ shippingFee: 50, freeOver: 1000 }, 'delivery', 400) === 50 && O.shippingFor({ shippingFee: 50, freeOver: 1000 }, 'delivery', 1200) === 0 && O.shippingFor({}, 'pickup', 10) === 0, 'الشحن على السيرفر');
  const g1 = O.guardDecide(null, 1000);
  assert(g1.allow && O.guardDecide({ count: 5, windowStart: 1000 }, 2000).allow === false && O.guardDecide({ count: 5, windowStart: 1000 }, 1000 + 3600001).allow, 'سقف ٥ طلبات للرقم في الساعة');
  assert(O.pushText({ name: 'سارة', items: [{ name: 'كريب' }, { name: 'زيبرا' }], fulfillment: 'delivery', governorate: 'الجيزة', total: 700 }).title.indexOf('700') > 0, 'نص الإشعار فيه الإجمالي');
  assert(O.isStaff({ auth: { token: { firebase: { sign_in_provider: 'password' } } } }) && !O.isStaff({ auth: { token: { firebase: { sign_in_provider: 'anonymous' } } } }), 'الأوردرات للموظفين بس');
}
const OSRC = fs.readFileSync(ORD_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
assert(!/online_orders|pos_test_sales/.test(OSRC), 'أوردرات غرفة القياس مبتكتبش في الـPOS');
assert(/require\("\.\/atelierOrders"\)/.test(fs.readFileSync(IDX_PATH, 'utf8')), 'atelierOrders مربوطة في index.js');
assert(!/match \/atelier_orders/.test(fs.readFileSync(path.join(ROOT, 'security', 'firestore-phase2.rules'), 'utf8')), 'الأوردرات مقفولة على الموبايلات (القاعدة الافتراضية)');

// ١٢) الموديلات + رف الألوان
const models = AC.groupModels(AC.houseCollection('collection/'));
assert(models.length === 1 && models[0].title === 'ميسي شيفون كويتي' && models[0].items.length === 9, 'القطع بتتجمّع في موديلات (كارت واحد + ألوان)');
assert(AC.groupModels(prods).length === 3, 'كل موديل كارت واحد');
assert(AC.toneOf([40, 48, 82]) === 'navy' && AC.toneOf([28, 28, 28]) === 'black' && AC.toneOf([200, 176, 140]) === 'beige', 'عائلة اللون من لون القماش');
assert(/d\.type === 'atelier-chat'/.test(LOY) && /chat=1/.test(LOY), '«كلّمينا في الشات» بيفتح شات التطبيق');
assert(AC.groupModels(AC.atelierItemsFrom({ items: [{ id: 'a', line: 'crepe' }, { id: 'b', line: 'crepe' }, { id: 'c', line: 'crepe', family: 'كوري' }, { id: 'd', line: 'crepe', family: 'كوري' }] })).length === 3, 'قطع الإدارة من غير موديل كل واحدة لوحدها، واللي ليها نفس الموديل كارت واحد');
if (O) {
  // سعر صور الموقع على السيرفر = نفس السعر اللي العميلة شايفاه
  house.filter((p) => p.price).forEach((p) => {
    const k = p.img.replace(/^collection\//, '').replace(/\.jpg$/, '');
    assert(O.HOUSE_PRICES[k] === p.price, 'سعر ' + p.name + ' متطابق بين الصفحة والسيرفر');
  });
  assert(O.priceItems([{ img: 'collection/linen-rose.jpg', name: 'x' }], [], [])[0].price === 490, 'طلب ميسي شيفون بيتحسب بـ٤٩٠ على السيرفر');
}
assert(['أسود', 'بنفسجي', 'رمادي توب', 'رمادي دخاني', 'روز'].map(AC.toneFromName).join() === 'black,purple,grey,grey,pink', 'عائلة اللون من الاسم لما يكون معروف');
assert(['كاكي', 'بيج حجري', 'أوف وايت', 'رمادي فحمي'].map(AC.toneFromName).join() === 'beige,beige,white,grey', 'ألوان الدفعة التانية في رف الألوان الصح');
assert(AD.cleanItem({ colorName: ' كاكي ', extras: 9 }).colorName === 'كاكي' && AD.cleanItem({ extras: 9 }).extras === 4, 'اسم اللون وعدد الصور الزيادة بيتحفظوا نضاف');
const ac = AC.atelierItemsFrom({ items: [{ id: 'q', family: 'ميسي', colorName: 'كاكي', extras: 2 }] })[0];
assert(ac.colorName === 'كاكي' && ac.extras === 2, 'الأتيليه بيقرا اسم اللون والصور الزيادة من الإدارة');
// كاش المتصفح: ملفات الصفحة بنسخة في اللينك عشان التحديث يوصل على طول
['index.html', 'admin.html'].forEach((f) => {
  const h = fs.readFileSync(path.join(ROOT, 'atelier', f), 'utf8');
  const local = (h.match(/(?:src|href)="(?:\.\.?\/)?[\w./-]+\.(?:js|css)[^"]*"/g) || []).filter((x) => !/https?:/.test(x));
  assert(local.length && local.every((x) => /\?v=\w+"/.test(x)), 'atelier/' + f + ': كل ملف js/css بنسخة (?v=) — من غيرها الموبايل بيفضل على القديم');
});
