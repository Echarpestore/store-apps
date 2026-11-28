// 🎨 «ألوانك» v1 — الألوان اللي تليق على العميلة (إيشارب · Glow) — منطق color-match-core + واجهة color-match-app + الربط
// سلوكي: بنشغّل المنطق الحقيقي والواجهة في VM (DOM وهمي صغير) ونشوف النتيجة.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const C = require(path.join(root, 'pos', 'color-match-core.js'));

/* ---------- ١) المواسم من الأسئلة ---------- */
const A = (veins, metal, white, depth) => C.analyze({ veins, metal, white, depth });
assertEq(A('green', 'gold', 'off', 'light').season, 'spring', 'دافي + فاتحة = ربيع');
assertEq(A('green', 'gold', 'off', 'medium').season, 'autumn', 'دافي + قمحي = خريف');
assertEq(A('green', 'gold', 'both', 'deep').season, 'autumn', 'دافي + سمرا = خريف');
assertEq(A('blue', 'silver', 'pure', 'light').season, 'summer', 'بارد + فاتحة = صيف');
assertEq(A('blue', 'silver', 'both', 'medium').season, 'summer', 'بارد + قمحي = صيف');
assertEq(A('blue', 'silver', 'pure', 'deep').season, 'winter', 'بارد + سمرا = شتا');
assertEq(A('mix', 'both', 'both', 'light').season, 'neutral_soft', 'محايد + فاتحة = محايد هادي');
assertEq(A('green', 'silver', 'both', 'deep').season, 'neutral_deep', 'إجابات متعاكسة + سمرا = محايد عميق');
assertEq(A('green', 'both', 'both', 'medium').undertone, 'warm', 'إجابة دافية واحدة والباقي محايد = دافي');
assertEq(C.analyze({}, null), null, 'من غير إجابات ولا صورة = مفيش نتيجة (سلبي)');
assertEq(C.analyze({ depth: 'light' }, null), null, 'العمق لوحده مش كفاية (سلبي)');
assertEq(C.analyze({ veins: 'xx', metal: 'gold' }).score, 1, 'إجابة مش معروفة بتتجاهل (سلبي)');

/* ---------- ٢) قراية البشرة من الصورة ---------- */
const warmSkin = C.readSkin([214, 160, 112]), coolSkin = C.readSkin([232, 190, 180]);
assert(warmSkin.ok && warmSkin.warm > 0.3 && warmSkin.lean === 'warm', 'بشرة مصفرّة = دافي');
assert(coolSkin.ok && coolSkin.warm < -0.3 && coolSkin.lean === 'cool', 'بشرة موردة = بارد');
assertEq(C.readSkin([70, 46, 36]).depth, 'deep', 'بشرة غامقة = سمرا');
assertEq(C.readSkin([236, 200, 178]).depth, 'light', 'بشرة فاتحة = فاتحة');
[[120, 130, 160], [128, 128, 128], [20, 60, 30], [255, 255, 255], [5, 5, 5]].forEach(c => assert(!C.readSkin(c).ok, 'لون مش بشرة بيترفض: ' + c.join(',') + ' (سلبي)'));
assert(!C.readSkin(null).ok, 'من غير لون = مرفوض (سلبي)');
// الصورة وزنها أقل من الأسئلة: ٣ إجابات باردة متتقلبش بصورة دافية
assertEq(C.analyze({ veins: 'blue', metal: 'silver', white: 'pure', depth: 'light' }, warmSkin).season, 'summer', 'الأسئلة أقوى من قراية الصورة');
assertEq(C.analyze({ veins: 'mix', metal: 'both', white: 'off', depth: 'medium' }, warmSkin).undertone, 'warm', 'الصورة بترجّح لما الأسئلة محايدة');
assertEq(C.analyze({ veins: 'mix', metal: 'both', white: 'both' }, coolSkin).depth, 'light', 'العمق من الصورة لو سؤاله ناقص');
assertEq(C.analyze({ veins: 'green', metal: 'gold', white: 'off', depth: 'deep' }, C.readSkin([120, 130, 160])).usedPhoto, false, 'صورة مرفوضة مبتدخلش في الحساب (سلبي)');
assert(C.PHOTO_WEIGHT < 1, 'وزن الصورة أقل من سؤال');
// عيّنة الدايرة: متوسط البشرة، واللمعة/الشعرة (أطراف الإضاءة) بتترمي
{
  const w = 40, h = 40, d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[i * 4] = 210; d[i * 4 + 1] = 160; d[i * 4 + 2] = 120; d[i * 4 + 3] = 255; }
  for (let i = 0; i < 30; i++) { const k = (20 * w + 10 + i) * 4; d[k] = d[k + 1] = d[k + 2] = (i % 2 ? 255 : 0); }
  assertEq(C.sampleCircle(d, w, h, 20, 20, 12), [210, 160, 120], 'العيّنة = لون البشرة من غير اللمعة والشعرة');
  assertEq(C.sampleCircle(d, w, h, 500, 500, 5), null, 'دوسة برّه الصورة = مفيش عيّنة (سلبي)');
}

/* ---------- ٣) النتايج والكتالوج ---------- */
const TONE_IDS = ['black', 'grey', 'white', 'beige', 'brown', 'navy', 'green', 'pink', 'purple'];
Object.keys(C.SEASONS).forEach(k => {
  const P = C.SEASONS[k];
  assert(P.ar && P.line && P.best.length === 8 && P.avoid.length === 3, k + ': اسم + ٨ ألوان + ٣ تتجنبها');
  assert(P.best.concat(P.avoid).every(c => c[0] && /^#[0-9A-F]{6}$/i.test(c[1])), k + ': كل لون له اسم وكود صحيح');
  assert(P.tones.length >= 5 && P.tones.every(t => TONE_IDS.includes(t)) && new Set(P.tones).size === P.tones.length, k + ': عائلات الكتالوج معروفة ومن غير تكرار');
});
assert(!C.SEASONS.spring.tones.includes('black') && C.SEASONS.winter.tones[0] === 'black', 'الأسود للشتا مش للربيع');
assertEq([C.toneFromName('ميسي شيفون كويتي بيج حجري'), C.toneFromName('زيتي غامق'), C.toneFromName('طرحة كحلي'), C.toneFromName('روز')], ['beige', 'green', 'navy', 'pink'], 'عائلة اللون من الاسم');
assertEq([C.toneFromName('شال كشمير'), C.toneFromName('تايلاندي'), C.toneFromName('')], ['', '', ''], 'اسم خامة مش لون = من غير عائلة (سلبي)');
const items = [
  { id: 1, title: 'جل سادة', toneText: 'أسود' }, { id: 2, title: 'جل سادة', toneText: 'زيتي' }, { id: 3, title: 'قطن كويتي', toneText: 'موكا' },
  { id: 4, title: 'قطن كويتي', toneText: 'موكا غامق' }, { id: 5, title: 'شيفون', toneText: 'لافندر' }, { id: 6, title: 'شال', toneText: '' }, null
];
assertEq(C.pick(items, 'autumn').map(x => x.id), [3, 2], 'الخريف: بني الأول وبعدين الأخضر · من غير أسود ولا لافندر · لون واحد لكل موديل');
assertEq(C.pick(items, 'winter').map(x => x.id), [1, 5, 2], 'الشتا: الأسود الأول');
assertEq(C.pick(items, 'summer', 1).map(x => x.id), [5], 'الحد الأقصى بيتحترم');
assertEq(C.pick(items, 'nope'), [], 'موسم مش معروف = فاضي (سلبي)');
assertEq(C.pick(null, 'autumn'), [], 'من غير كتالوج = فاضي (سلبي)');

/* ---------- ٤) الواجهة: كارت الرئيسية + الاختبار + الحفظ ---------- */
function app(store, opts) {
  const els = {}, opened = [];
  const mk = id => (els[id] = els[id] || { id, style: {}, _h: '', scrollTop: 0, classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } }, set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }, appendChild() {}, querySelector: () => null });
  const ctx = { console, ColorMatch: C, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { getElementById: id => (id === 'cmCss' ? els.cmCss || null : (id === 'cmWrap' && !els.cmWrap ? null : (id === 'cmFile' || id === 'cmCanvas' ? null : mk(id)))),
      createElement: () => { const e = { style: {}, classList: mk('_tmp').classList, appendChild() {}, set innerHTML(v) { this._h = v; } }; Object.defineProperty(e, 'id', { set(v) { const n = mk(v); n.classList = { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } }; e.classList = n.classList; e._node = n; }, get() { return ''; } }); return e; },
      head: { appendChild() {} }, body: { appendChild() {} } } };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(read('pos/color-match-app.js'), ctx);
  ctx.ColorMatchApp.init(Object.assign({ brand: 'echarpe', phone: '01000000000', getItems: () => items.filter(Boolean).map(x => Object.assign({ img: 'x.jpg', price: 199 }, x)), openItem: id => opened.push(id), rerender: () => opened.push('rerender') }, opts || {}));
  return { A: ctx.ColorMatchApp, els, opened, store };
}
let st = {}, a = app(st);
assert(/اعرفي ألوانك/.test(a.A.homeHtml()) && /ColorMatchApp\.open\(\)/.test(a.A.homeHtml()), 'قبل الاختبار: كارت «اعرفي ألوانك»');
a.A.open(); assert(a.A.isOpen() && /ابدئي بصورة/.test(a.els.cmBd._h) && /مبتترفعش/.test(a.els.cmBd._h), 'البداية: صورة اختيارية ومكتوب إنها مبتترفعش');
a.A.quiz(); assert(/سؤال 1 من 4/.test(a.els.cmBd._h), 'الأسئلة ٤');
a.A.answer('zzz'); assert(/سؤال 1 من 4/.test(a.els.cmBd._h), 'إجابة مش من الاختيارات بتتجاهل (سلبي)');
a.A.answer('green'); a.A.answer('gold'); a.A.back(); assert(/سؤال 2 من 4/.test(a.els.cmBd._h), 'رجوع للسؤال اللي فات');
a.A.answer('gold'); a.A.answer('off'); assertEq(Object.keys(st).length, 0, 'مفيش حفظ قبل آخر سؤال (سلبي)');
a.A.answer('medium');
const saved = JSON.parse(st['cm_v1_echarpe_01000000000']);
assertEq([saved.season, saved.undertone, saved.depth, saved.usedPhoto], ['autumn', 'warm', 'medium', false], 'النتيجة اتحفظت على الجهاز للعميلة والبراند');
assert(/الخريف الدافي/.test(a.els.cmBd._h) && /ألوان تنوّر وشّك/.test(a.els.cmBd._h) && /خلّيها بعيد عن وشّك/.test(a.els.cmBd._h) && /قطع بألوانك/.test(a.els.cmBd._h), 'شاشة النتيجة: الموسم + ألوانك + اللي تتجنبيه + قطع');
assert(/مش قاعدة/.test(a.els.cmBd._h), 'النتيجة مكتوب إنها دليل مش قاعدة');
assert(/ألوانك: الخريف الدافي/.test(a.A.homeHtml()) && /قطن كويتي/.test(a.A.homeHtml()) && !/اعرفي ألوانك/.test(a.A.homeHtml()), 'بعد الاختبار: الرئيسية فيها ألوانها وقطع بيها');
a.A.homeHtml(); a.A.openItem(0); assertEq(a.opened.filter(x => x !== 'rerender'), [3], 'الدوسة على قطعة بتفتح صفحتها');
a.A.openItem(99); assertEq(a.opened.filter(x => x !== 'rerender').length, 1, 'قطعة مش موجودة = مفيش فتح (سلبي)');
a.A.close(); assert(!a.A.isOpen() && a.opened.includes('rerender'), 'القفل بيحدّث الرئيسية');
// عميلة تانية / براند تاني على نفس الجهاز = من غير نتيجة
assert(/اعرفي ألوانك/.test(app(st, { phone: '01111111111' }).A.homeHtml()), 'عميلة تانية على نفس الجهاز مبتاخدش نتيجة غيرها (سلبي)');
assert(/اعرفي ألوانك/.test(app(st, { brand: 'glow' }).A.homeHtml()), 'Glow نتيجته لوحده (سلبي)');
assert(/ألوانك: الخريف الدافي/.test(app(st).A.homeHtml()), 'نفس العميلة بتلاقي نتيجتها لما تفتح تاني');
assert(/اعرفي ألوانك/.test(app({ 'cm_v1_echarpe_01000000000': '{"season":"hack"}' }).A.homeHtml()), 'نتيجة محفوظة بايظة بتتجاهل (سلبي)');
assert(/اعرفي ألوانك/.test(app({ 'cm_v1_echarpe_01000000000': '<<<' }).A.homeHtml()), 'حفظ مكسور ميوقّعش الرئيسية (سلبي)');
assert(!/cm-rail/.test(app({ 'cm_v1_echarpe_01000000000': '{"season":"summer"}' }, { getItems: () => { throw new Error('x'); } }).A.homeHtml()), 'كتالوج واقع = الكارت من غير قطع ومن غير كراش (سلبي)');

/* ---------- ٥) الربط في التطبيقين ---------- */
[['loyalty/index.html', 'shopOpenModel'], ['glow/index.html', 'shopOpenItem']].forEach(([f, opener]) => {
  const h = read(f);
  const i1 = h.indexOf('color-match-core.js?v='), i2 = h.indexOf('color-match-app.js?v=');
  assert(i1 > 0 && i2 > i1, f + ': بيحمّل core قبل app');
  assert(/cmHomeHtml\(\)\+/.test(h) && h.includes('function cmHomeHtml()') && h.includes('function cmItems()'), f + ': الكارت على الرئيسية');
  assert(new RegExp('openItem: function\\(id\\)\\{[^}]*' + opener).test(h), f + ': القطعة بتفتح بـ' + opener);
  assert(/phone: currentCustomer\.phone/.test(h.slice(h.indexOf('function cmHomeHtml()'), h.indexOf('function cmHomeHtml()') + 700)), f + ': النتيجة مربوطة برقم العميلة');
});
assert(/isOn\('cmWrap','on'\)\) return 'cm'/.test(read('loyalty/index.html')) && /kind==='cm'[^;]*ColorMatchApp\.close\(\)/.test(read('loyalty/index.html')), 'إيشارب: زرار الرجوع بيقفل الاختبار');
const appSrc = read('pos/color-match-app.js');
assert(!/fetch\(|XMLHttpRequest|httpsCallable|firestore|\.collection\(/.test(appSrc + read('pos/color-match-core.js')), 'مفيش أي اتصال بسيرفر أو AI — كله على الموبايل');
assert(/revokeObjectURL/.test(appSrc) && /IMG = null/.test(appSrc), 'الصورة بتترمي بعد القراية');
assert(+read('loyalty/sw.js').match(/loyalty-shell-v(\d+)/)[1] >= 780 && +read('glow/sw.js').match(/glow-loyalty-v(\d+)/)[1] >= 95, 'الكاش اترفع في التطبيقين');
