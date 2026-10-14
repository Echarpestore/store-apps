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
  try { M.sanitizeProducts([1, 2, 3, 4, 5].map((i) => ({ id: 'p' + i, image: img }))); } catch (e) { threw = true; }
  assert(threw, 'أكتر من ٤ منتجات = رفض');
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
assert(AC.autoPolicy(0, 0, false) === 'auto' && AC.autoPolicy(AC.AUTO_LIMIT, 0, false) === 'wait' &&
       AC.autoPolicy(AC.AUTO_LIMIT, 0, true) === 'auto' && AC.autoPolicy(0, AC.SESSION_LIMIT, true) === 'manual',
       'التوليد التلقائي محدود (أول ١٢ + اللي بيبان، وبعد السقف يدوي)');
assert(AC.shouldFallbackToSingle({ code: 'functions/internal' }) === true, 'دالة مش منشورة → ننزل لمنتج واحد');
assert(AC.shouldFallbackToSingle({ code: 'functions/resource-exhausted' }) === false, 'خلص السقف ≠ ننزل (مش هنحرق نداءات أكتر)');
assert(AC.cacheProductId({ id: 'x' }, true) !== AC.cacheProductId({ id: 'x' }, false), 'كاش الجودة العالية منفصل عن الشبكة');
