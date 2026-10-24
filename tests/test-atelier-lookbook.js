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
const prods = AC.houseCollection('collection/');
const r1 = AC.firstRound(prods, {});
assert(r1.length === AC.ROUND_SIZE && r1.every((p) => p.kind === 'hijab'), 'الجولة الأولى = ٤ طرح (من غير إسدال)');
assert(AC.firstRound(prods, { [r1[0].id]: 'x' })[0].id !== r1[0].id, 'الجولة الأولى بتتخطّى اللي إطلالته جاهزة');
assert(AC.ROUNDS_PER_DAY === 2, 'جولتين بس في اليوم = نداءين توليد');
assert(AC.roundsUsedToday({ day: '2026-10-14', n: 2 }, '2026-10-14') === 2 && AC.roundsUsedToday({ day: '2026-10-13', n: 2 }, '2026-10-14') === 0, 'عدّاد الجولات بيتصفّر كل يوم');
const isd = prods.find((p) => p.kind === 'isdal');
assert(AC.canSelect([r1[0]], isd, {}) === 'kind', 'الإسدال مبيتخلطش مع الطرح في نفس الجولة');
assert(AC.canSelect(r1, prods[10], {}) === 'full', 'الجولة ٤ قطع بالكتير');
assert(AC.canSelect([], r1[0], { [r1[0].id]: 'x' }) === 'done', 'القطعة الجاهزة مبتتختارش تاني');
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
assert(house.length >= 12 && house.every((p) => p.tryable && p.line && AC.lineName(p.line)), 'مجموعة الدار كاملة وقابلة للقياس');
assert(house.every((p) => fs.existsSync(path.join(ROOT, 'atelier', p.img))), 'كل صورة في مجموعة الدار موجودة فعلاً');
assert(house.some((p) => p.kind === 'isdal') && house.filter((p) => p.kind === 'isdal').every((p) => p.line === 'isdal'), 'الإسدال في المجموعة بنوعه الصح');

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
assert(AC.ROUND_SIZE === 6, 'الجولة ٦ قطع');
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
