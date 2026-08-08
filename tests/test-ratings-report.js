// ============================================================
// ⭐ test-ratings-report — مين قيّم + مقياس التقييم
//
// الحاجتين اللي الاختبار ده بيحرسهم:
//
// ١) 🔴 **المقياس**: تطبيق الولاء فيه 4 وشوش بس (😠🙁🙂😍) وPOS بيحسب
//    من 4 — وoffice كان بيعرض \"من 5\" ويرسم صف ★★★★★ فاضي على طول.
//    يعني فرع متوسطه 3.6 من 4 (90%) كان بيبان 72% للمالك. رقم غلط في
//    تقرير بيتاخد عليه قرارات.
//
// ٢) 🔎 **الهوية**: رقم العميلة واسم البياعة ورقم الفاتورة كانوا متسجلين
//    مع كل تقييم من التطبيق ومحدش بيعرضهم — المالك يشوف \"3 تقييمات
//    سيّئة\" ومايعرفش مين يكلم.
//    ⚠️ وفي POS الهوية **مقفولة على المالك** (canManageRoles): لو كل
//       بياعة تعرف مين إدتها تقييم واطي، التقييم نفسه يبقى خطر على
//       العميلة. الاختبار بيتأكد إن مفيش أي تسريب للرقم بره البوابة.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const officeSrc = fs.readFileSync(path.join(ROOT, 'Office', 'office.js'), 'utf8');
const officeHtml = fs.readFileSync(path.join(ROOT, 'Office', 'index.html'), 'utf8');
const posSrc = fs.readFileSync(path.join(ROOT, 'pos', 'pos-reports.js'), 'utf8');

function stripComments(s){
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
function extractFn(s, header){
  const i = s.indexOf(header);
  if(i < 0) return null;
  let d = 0, st = false;
  for(let j = s.indexOf('{', i); j < s.length; j++){
    if(s[j] === '{'){ d++; st = true; }
    else if(s[j] === '}'){ d--; if(st && d === 0) return s.slice(i, j + 1); }
  }
  return null;
}

const WANTED = ['function esc(', 'function ratingsSummary(', 'function _ratSource(', 'function _ratCustName(',
                'function _ratRows(', 'function renderWhoRated('];
const parts = [];
let missing = null;
WANTED.forEach(h=>{
  const f = extractFn(officeSrc, h);
  if(!f && !missing) missing = h;
  if(f) parts.push(f);
});
assert(!missing, 'دوال office اتلقت' + (missing ? ' — ناقص: ' + missing : ''));

const maxM = officeSrc.match(/var RATING_MAX = (\d+);/);
assert(!!maxM && Number(maxM[1]) === 4,
  '⭐⭐ المقياس متعرّف من 4 زي تطبيق الولاء (لقينا ' + (maxM ? maxM[1] : 'ولا حاجة') + ')');

function build(ratings, customers){
  const box = { innerHTML: '' };
  const ctx = {
    D: { ratings: ratings || [], customers: customers || [] },
    window: {},
    console: { warn(){}, log(){} },
    document: { getElementById: (id)=> (id === 'whoRated' ? box : null) },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext('var RATING_MAX = ' + Number(maxM[1]) + ';\n' + parts.join('\n'), ctx, { timeout: 5000 });
  return { ctx, box };
}

const R = (r, o)=> Object.assign({ r, ts: Date.now() - 3600000, branch: 'الرحاب' }, o || {});

// ============================================================
// ١) ⭐ المقياس من 4 — والـ5 تقييم مش صالح
// ============================================================
(function(){
  const { ctx } = build([]);
  const sm = ctx.ratingsSummary([ R(4), R(4), R(3), R(1) ]);
  assert(sm.total === 4, 'اتحسبوا 4 تقييمات');
  assert(sm.avg === 3, 'المتوسط 3 من 4');
  assert(sm.dist[4] === 2 && sm.dist[3] === 1 && sm.dist[1] === 1, 'التوزيع صح');
  assert(sm.dist[5] === undefined, '⭐ مفيش خانة 5 أصلًا (كانت بتفضل صفر للأبد)');
  assert(sm.bad === 1 && sm.good === 2, 'السيّئ 1 والكويس 2');

  const bad = ctx.ratingsSummary([ R(5), R(0), R(4) ]);
  assert(bad.total === 1, '⭐⭐ تقييم بقيمة 5 مرفوض (كان بيتحسب ويرفع المتوسط غلط)');
  assert(bad.avg === 4, 'والمتوسط من الصالح بس');

  const br = ctx.ratingsSummary([ R(4, {branch:'مدينتي'}), R(2, {branch:'مدينتي'}), R(4, {branch:'الرحاب'}) ]);
  assert(br.byBranch['مدينتي'].n === 2 && br.byBranch['مدينتي'].avg === 3, 'متوسط الفرع');
  assert(br.byBranch['مدينتي'].bad === 1, 'وعدد السيّئ في الفرع');
})();

// ============================================================
// ٢) 🔎 الفلاتر والترتيب — الأسوأ الأول (ترتيب متابعة مش عرض)
// ============================================================
(function(){
  const list = [
    R(4, { customerPhone: '01000000001', ts: 5000 }),
    R(1, { customerPhone: '01000000002', ts: 1000, note: 'الخدمة وحشة' }),
    R(2, { ts: 4000 }),                                  // كشك مجهول
    R(1, { customerPhone: '01000000003', ts: 9000 }),
    R(3, { customerPhone: '01000000004', ts: 2000, note: 'كويس' }),
  ];
  const { ctx } = build(list);
  const all = ctx._ratRows(list, 'all');
  assert(all.length === 5, 'الكل = 5');
  assert(all[0].r === 1 && all[1].r === 1, '⭐ الأسوأ الأول');
  assert(all[0].ts === 9000, 'وجوه نفس التقييم الأحدث الأول');
  assert(all[all.length-1].r === 4, 'والأحسن في الآخر');

  assert(ctx._ratRows(list, 'bad').length === 3, 'فلتر محتاج متابعة (1 و2) = 3');
  assert(ctx._ratRows(list, 'notes').length === 2, 'فلتر اللي كتبوا كلام = 2');
  assert(ctx._ratRows(list, 'named').length === 4, 'فلتر المعروفين = 4 (الكشك بره)');
  // 📱/🖥️ المصدر: تقييم التطبيق ليه saleId أو source=app_after_visit
  const mixed = [
    R(4, { customerPhone:'011', saleId:'INV1' }),          // تطبيق (بفاتورة)
    R(3, { source:'app_after_visit', customerPhone:'012' }),// تطبيق (بالمصدر)
    R(2, {}),                                              // شاشة الفرع
    R(1, { source:'kiosk' }),                              // شاشة الفرع
  ];
  const c2 = build(mixed).ctx;
  assert(c2._ratSource(mixed[0]) === 'app' && c2._ratSource(mixed[1]) === 'app', 'تقييم التطبيق متعرّف بالاتنين');
  assert(c2._ratSource(mixed[2]) === 'kiosk' && c2._ratSource(mixed[3]) === 'kiosk', 'وتقييم شاشة الفرع');
  assert(c2._ratRows(mixed, 'app').length === 2, '⭐ فلتر 📱 التطبيق = 2');
  assert(c2._ratRows(mixed, 'kiosk').length === 2, '⭐ فلتر 🖥️ شاشة الفرع = 2');
  assert(ctx._ratRows(list, 'bad').every(e=> e.r <= 2), '⛔ مفيش تقييم كويس متسرّب لقايمة المتابعة');
  assert(ctx._ratRows([R(5, {customerPhone:'01'}), R(4)], 'all').length === 1, 'القيم الغلط مستبعدة من القوايم كمان');
})();

// ============================================================
// ٣) 👤 الاسم بيتجاب من ملف العميلة — والمجهول يفضل مجهول
// ============================================================
(function(){
  const list = [
    R(1, { customerPhone: '01234567890', note: 'استنيت كتير', servedByEmployeeName: 'سارة', saleId: 'INV123456' }),
    R(2, {}),   // كشك
  ];
  const custs = [{ _id: '01234567890', name: 'منى أحمد' }];
  const { ctx, box } = build(list, custs);
  assert(ctx._ratCustName('01234567890') === 'منى أحمد', 'الاسم اتجاب بالرقم');
  assert(ctx._ratCustName('09999999999') === '', 'ورقم مش معروف = من غير اسم');
  assert(ctx._ratCustName('') === '', 'ومن غير رقم = من غير اسم');

  ctx.window._ratFilter = 'all';
  ctx.renderWhoRated();
  const h = box.innerHTML;
  assert(h.indexOf('منى أحمد') >= 0, '⭐⭐ الاسم ظاهر في الشاشة');
  assert(h.indexOf('tel:01234567890') >= 0, '⭐ ورقمها لينك اتصال (دوسة واحدة تكلمها)');
  assert(h.indexOf('استنيت كتير') >= 0, 'وكلامها ظاهر');
  assert(h.indexOf('سارة') >= 0, 'واسم البياعة اللي كانت معاها');
  assert(h.indexOf('مجهول') >= 0, '⭐ وتقييم الكشك متعلّم مجهول — مش بنخمّنله هوية');
  // ⚠️ فخ الأسيرشن الرخم: نفس الكلمتين موجودين في **أزرار الفلتر** كمان،
  //    فمجرد وجودهم في الصفحة مش دليل إن الشارة اتحطت على السطر. بنعدّ.
  const cnt = (t)=> h.split(t).length - 1;
  assert(cnt('📱 التطبيق') >= 2 && cnt('🖥️ شاشة الفرع') >= 2,
    '⭐⭐ الشارة على السطر نفسه مش بس في زرار الفلتر (تطبيق ' + cnt('📱 التطبيق') + ' · فرع ' + cnt('🖥️ شاشة الفرع') + ')');

  // تهريب HTML — الكلام جاي من العميلة
  const evil = [R(1, { customerPhone: '011', note: '<img src=x onerror=alert(1)>' })];
  const b2 = build(evil, [{ _id:'011', name: '<script>bad</script>' }]);
  b2.ctx.window._ratFilter = 'all';
  b2.ctx.renderWhoRated();
  assert(b2.box.innerHTML.indexOf('<img src=x') < 0 && b2.box.innerHTML.indexOf('<script>bad') < 0,
    '⛔ كلام العميلة واسمها متعقّمين (تهريب HTML)');
})();

// ============================================================
// ٤) 🔒 POS — الهوية للمالك بس، ومفيش تسريب بره البوابة
// ============================================================
(function(){
  const fn = extractFn(posSrc, 'async function buildRatingsReport(');
  assert(!!fn, 'اتلقت دالة تقرير التقييمات في POS');
  if(!fn) return;
  const bare = stripComments(fn);

  assert(/hasPerm\('canManageRoles'\)/.test(bare), '⭐⭐ البوابة على صلاحية المالك');
  const gate = extractFn(bare, 'if(_canSeeWho){');
  assert(!!gate, 'اتلقى بلوك البوابة');
  if(gate){
    assert(gate.indexOf('customerPhone') >= 0, 'الهوية جوه البوابة');
    // 🔴 التسريب اللي بندوّر عليه هو **العرض** مش العدّ: أي `${…customerPhone}`
    //    أو لينك tel: بره البوابة معناه إن الكاشير هيشوف الرقم.
    const outside = bare.replace(gate, ' ');
    assert(!/\$\{[^}]*customerPhone/.test(outside),
      '⛔⛔ مفيش أي عرض لرقم العميلة بره بوابة المالك');
    assert(outside.indexOf('tel:') < 0, '⛔ ومفيش لينك اتصال بره البوابة');
    assert(/tel:/.test(gate), 'ولينك الاتصال جوه البوابة');
    // 👤 الدوسة على الاسم لازم تفتح **ملف العميلة** مش تفتح الاتصال
    assert(/openCustomerProfile\('/.test(gate),
      '⭐⭐ اسم العميلة بيفتح ملفها (كان بيفتح الاتصال بالغلط)');
    assert(/<td>\$\{srcTag\}<\/td>/.test(gate),
      '⭐⭐ شارة المصدر متحطوطة في خانة في الجدول (مش متعرّفة وبس)');
    assert(/شاشة الفرع/.test(gate) && /التطبيق/.test(gate), 'والشارتين موجودين');
    assert(/e\.source === 'app_after_visit' \|\| e\.saleId/.test(gate),
      '⭐ نفس تصنيف المصدر المستخدم في باقي التقرير (مصدر واحد للحقيقة)');
    assert(/TEST_CUSTOMERS/.test(gate), 'والأسماء بتتجاب من ملفات العملاء');
    assert(/\[\.\.\.new Set\(/.test(gate),
      '⭐ الأرقام بتتجاب مرة واحدة لكل عميلة — مش استعلام لكل تقييم');
  }
  assert(/whoRatedHtml/.test(bare) && /let whoRatedHtml = '';/.test(bare),
    'المتغيّر بيبدأ فاضي — الكاشير بيشوف التقرير من غير الجزء ده');
})();

// ============================================================
// ٥) الوصلات ونسخ الكاش
// ============================================================
(function(){
  assert(/id="whoRated"/.test(officeHtml), 'مكان اللوحة موجود في شاشة office');
  const bare = stripComments(officeSrc);
  assert(/renderWhoRated\(\)/.test(bare) && /window\.renderWhoRated/.test(bare),
    'اللوحة بتترسم مع تقارير النشاط ومعروضة على window');
  assert(/window\.setRatFilter/.test(bare), 'وأزرار الفلتر موصّلة');

  const osw = fs.readFileSync(path.join(ROOT, 'Office', 'sw.js'), 'utf8');
  const om = osw.match(/echarpe-office-v(\d+)/);
  assert(!!om && Number(om[1]) >= 37, 'Office/sw.js: v37+ (لقينا ' + (om ? om[1] : '—') + ')');

  const psw = fs.readFileSync(path.join(ROOT, 'pos', 'sw.js'), 'utf8');
  const pm = psw.match(/store-apps-shell-v(\d+)/);
  assert(!!pm && Number(pm[1]) >= 284, 'pos/sw.js: v284+ (لقينا ' + (pm ? pm[1] : '—') + ')');
})();
