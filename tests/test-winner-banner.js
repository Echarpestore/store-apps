// ============================================================
// 🎁 test-winner-banner — الفوز مايعديش من غير ما حد يشوفه
//
// اللي كان بيحصل: شاشة الاحتفال بتظهر و**تمشي لوحدها بعد 4 ثواني**
// (setTimeout)، وبتعلّم المكافأة `seen: true` أول ما تظهر. يعني لو
// الشاشة كانت في إيد حد بيخدم عميلة، الفوز يعدّي، يتعلّم إنه اتشاف،
// وميرجعش تاني أبدًا — ومفيش أي أثر ليه في الشاشة بعد كده.
//
// دلوقتي:
//   ١) الاحتفال **مبيمشيش لوحده** — الدوسة هي اللي بتعلّم seen
//   ٢) و**بانر بيفضل طول اليوم** باسم الفايزة والمبلغ
//
// ⚠️ نقطة الفلوس هنا: البانر بيعرض **المعتمد بس**. مكافأة فوق
//    الميزانية لسه مستنية قرار المالك مينفعش الفريق يشوفها كأنها فوز.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'sales', 'sales-app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'sales', 'index.html'), 'utf8');

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

const tzc = src.match(/const CAI_TZ = '([^']+)'/);
const WANTED = [
  'function caiParts(', 'function caiOffsetMs(', 'function cai(', 'function caiStamp(',
  'function _fmtKey(', 'function caiDayKey(', 'function visibleRewards(',
  'function _esc(', 'function todaysRewardWinners(', 'function todaysRewardFor(', 'function renderWinnerBanner(',
];
const parts = [];
let missing = null;
WANTED.forEach(h=>{
  const f = extractFn(src, h);
  if(!f && !missing) missing = h;
  if(f) parts.push(f);
});
assert(!missing, 'دوال البانر اتلقت' + (missing ? ' — ناقص: ' + missing : ''));

function build(list){
  const host = { style: {}, innerHTML: '' };
  const ctx = {
    window: { allRewards: list || [] }, rewards: list || [],
    console: { warn(){}, log(){} },
    document: { getElementById: (id)=> (id === 'winnerBanner' ? host : null) },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(
    "const CAI_TZ='" + (tzc ? tzc[1] : 'Africa/Cairo') + "';" +
    "const _caiFmt=new Intl.DateTimeFormat('en-GB',{timeZone:CAI_TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});\n"
    + parts.join('\n'), ctx, { timeout: 5000 });
  return { ctx, host };
}

const NOW = Date.now();
const DAY = 86400000;
const R = (o)=> Object.assign({ id:'r1', employeeName:'سارة', amount:200, type:'weekly',
                                periodLabel:'2026-08-03', earnedAt: NOW, status:'approved' }, o || {});

// ============================================================
// ١) 🗓️ اللي فاز النهاردة بس
// ============================================================
(function(){
  const { ctx } = build([
    R({ id:'a' }),
    R({ id:'b', earnedAt: NOW - DAY * 2, employeeName:'هبة' }),   // من يومين
  ]);
  const w = ctx.todaysRewardWinners();
  assert(w.length === 1 && w[0].id === 'a', '⭐ فايز النهاردة بس (' + w.length + ')');
  assert(!w.some(x=> x.employeeName === 'هبة'), 'ومكافأة من يومين مش بتفضل معلقة على الشاشة');
})();

// ============================================================
// ٢) ⭐⭐ المستنية موافقة الميزانية **متظهرش**
// ============================================================
(function(){
  const { ctx, host } = build([ R({ id:'p', status:'pending', employeeName:'منى' }) ]);
  assert(ctx.todaysRewardWinners().length === 0,
    '⭐⭐ مكافأة فوق الميزانية مش بتتعرض كفوز قبل ما المالك يوافق');
  ctx.renderWinnerBanner();
  assert(host.style.display === 'none' && host.innerHTML === '',
    'والبانر بيتخفي خالص مش بيفضل فاضي');
  // القديمة من غير status = معتمدة (توافق مع البيانات القديمة)
  const old = build([ R({ id:'o', status: undefined }) ]);
  assert(old.ctx.todaysRewardWinners().length === 1, 'المكافآت القديمة من غير status = معتمدة');
})();

// ============================================================
// ٣) 🏅 الفوز بيتعرض **على كارت الموظفة** — مش بانر فوق
//    (البانر الفوقاني كان بيركب على الهيدر ويغطّي الترس)
// ============================================================
(function(){
  const grid = extractFn(src, 'function renderEmpGrid(');
  assert(!!grid, 'اتلقى راسم الكروت');
  if(!grid) return;
  const bare = stripComments(grid);

  assert(/const win = todaysRewardFor\(e\.id\)/.test(bare),
    '⭐ كل كارت بيسأل: الموظفة دي فازت النهاردة؟');
  assert(/win\?' winnerTile'/.test(bare) || /win \? ' winnerTile'/.test(bare),
    '⭐⭐ الكارت بياخد كلاس الإطار المتحرك');
  assert(/winPrize/.test(bare) && /Number\(win\.amount\)/.test(bare),
    '⭐⭐ ومبلغها هي على كارتها هي (مش مجموع في بانر)');
  assert(/winAvatar/.test(bare) && /'🎁'/.test(bare),
    '⭐ الدايرة بتتحول صندوق هدية (نفس المقاس — الكارت مايكبرش)');
  assert(/winShine/.test(bare), 'ولمعة بتعدّي على الكارت');
  // ⚠️ نفس عدد العناصر: دايرة + اسم + سطر واحد — أي سطر زيادة بيكبّر الكارت
  //    ويبوّظ صف الشبكة كله (الكروت جنبه بتتمطّ معاه).
  assert(/emp-count/.test(bare) && /winPrize/.test(bare),
    'الفايزة بتاخد المبلغ **بدل** سطر النقط مش زيادة عليه');
  const winBranch = bare.slice(bare.indexOf('${win'), bare.indexOf('`;}).join'));
  assert(winBranch.indexOf('winPrizeSub') < 0,
    '⭐⭐ مفيش سطر رابع في الكارت الفايز (الطول لازم يفضل زي باقي الكروت)');

  // ⛔ الفوز مايتلزقش على كارت غير صاحبته
  const one = build([ R({ employeeId:'e1', employeeName:'سارة', amount:175 }) ]);
  assert(!!one.ctx.todaysRewardFor('e1'), 'صاحبة المكافأة بتلاقيها');
  assert(one.ctx.todaysRewardFor('e2') === null, '⛔⛔ وموظفة تانية مبتلاقيش حاجة');
  assert(one.ctx.todaysRewardFor('e1').amount === 175, 'وبمبلغها الصح');

  // اتنين فايزين = كل واحد بمبلغه
  const two = build([
    R({ id:'a', employeeId:'e1', amount:100 }),
    R({ id:'b', employeeId:'e2', employeeName:'هند', amount:150 }),
  ]);
  assert(two.ctx.todaysRewardFor('e1').amount === 100
      && two.ctx.todaysRewardFor('e2').amount === 150,
    '⭐⭐ كل واحدة بمبلغها هي — مفيش أي جمع (100 و150 مش 250)');

  // والبانر الفوقاني اتقفل خالص
  const b = build([ R({}) ]);
  b.ctx.renderEmpGrid = function(){};
  b.ctx.renderWinnerBanner();
  assert(b.host.style.display === 'none' && b.host.innerHTML === '',
    '⭐ البانر الفوقاني مبقاش بيرسم حاجة');
})();

// ============================================================
// ٤) ⭐⭐ الاحتفال بيستنى الدوسة — والدوسة هي اللي بتعلّم seen
// ============================================================
(function(){
  const fn = extractFn(src, 'function showUnseenRewardsIfAny(');
  assert(!!fn, 'اتلقت دالة الاحتفال');
  if(!fn) return;
  const bare = stripComments(fn);

  assert(!/setTimeout\([^)]*classList\.remove\('show'\)/.test(bare)
      && !/setTimeout\(\(\)=> \$\('#giftBoxToast'\)\.classList\.remove/.test(bare),
    '⭐⭐ مفيش مؤقت بيقفل الاحتفال لوحده (كان 4 ثواني وخلاص)');
  assert(/#giftBoxOk/.test(bare), 'فيه زرار تأكيد');
  assert(/const close = \(\)=>/.test(bare) && /classList\.remove\('show'/.test(bare),
    'والقفل بالدوسة');

  // seen لازم تتكتب **جوه** القفل مش عند العرض
  const iClose = bare.indexOf('const close');
  const iSeen  = bare.indexOf("{ seen: true }");
  assert(iSeen > iClose && iClose > 0,
    '⭐⭐ `seen` بتتكتب مع الدوسة — مش أول ما الشاشة تظهر (وإلا الفوز يضيع لو محدش شاف)');
  assert(/renderWinnerBanner\(\)/.test(bare), 'وبعد القفل البانر بيتحدّث');
  assert(/showUnseenRewardsIfAny\(\)/.test(bare), 'ولو فيه فايزة تانية بتظهر بعدها');
  assert(/classList\.add\('opened'\)/.test(bare),
    '⭐ الصندوق بيترج الأول وبعدين يتفتح — مش بيبان مفتوح من أول لحظة');
  assert(/giftBoxFx/.test(bare) && /Math\.random\(\)/.test(bare), 'وقصاصات ورق للاحتفال');
})();

// ============================================================
// ٥) 🎨 الشكل والوصلات
// ============================================================
(function(){
  assert(/id="winnerBanner"/.test(html), 'مكان البانر في الشاشة');
  assert(/id="giftBoxOk"/.test(html) && /id="giftBoxFx"/.test(html), 'زرار الاحتفال والقصاصات');
  ['winPrize','winNameWrap','giftOkBtn'].forEach(c=>{
    assert(new RegExp('\\.' + c + '\\{').test(html), 'ستايل .' + c + ' موجود');
  });
  assert(/\.emp-tile\.winnerTile\{/.test(html), '⭐ إطار الكارت الفايز');
  assert(/\.emp-avatar\.winAvatar\{/.test(html), 'وستايل صندوق الهدية بدل الحروف');
  // 🔒 نفس المقاس: الكارت الفايز padding قريب من العادي (2px إطار − 1px بادينج)
  const base = (html.match(/\.emp-tile\{[\s\S]*?padding:(\d+)px (\d+)px/) || []);
  const win  = (html.match(/\.emp-tile\.winnerTile\{[\s\S]*?padding:(\d+)px (\d+)px/) || []);
  assert(base[1] && win[1] && Math.abs(Number(base[1]) - Number(win[1])) <= 1
      && Math.abs(Number(base[2]) - Number(win[2])) <= 1,
    '⭐⭐ البادينج معوّض بفرق الإطار — الكارت الفايز بنفس المقاس بالظبط');
  ['winBob','confFall','giftShake','giftPop','revealUp','winRing','winGlow'].forEach(k=>{
    assert(new RegExp('@keyframes ' + k + '\\{').test(html), 'أنيميشن ' + k);
  });
  // البانر لازم يترسم مع تحديث المكافآت مش مرة واحدة عند التحميل
  const bare = stripComments(src);
  assert(/try\{ renderWinnerBanner\(\); \}catch/.test(bare),
    '⭐ الرسم معزول في try — دالة تانية تقع مبتوقفهاش');
  ['todaysRewardWinners','todaysRewardFor','renderWinnerBanner'].forEach(n=>{
    assert(new RegExp('window\\.' + n + ' *= *' + n).test(bare), '§18 ' + n + ' على window');
  });
  const sw = fs.readFileSync(path.join(ROOT, 'sales', 'sw.js'), 'utf8');
  const m = sw.match(/store-apps-shell-v(\d+)/);
  assert(!!m && Number(m[1]) >= 109, 'sales/sw.js: v109+ (لقينا ' + (m ? m[1] : '—') + ')');
})();

/* ============================================================
   🔁 الفوز بيتكرر كل يوم — الإصلاح
   ------------------------------------------------------------
   🔴 اللي المالك شافه: نفس الموظفة بتكسب مكافأة الأسبوع، والاحتفال
      بيتعاد **كل يوم** والكارت بيفضل ظاهر كل يوم.
   السبب: `awardPeriod` كانت بتتأكد إن المكافأة اتصرفت من **الكاش
   المحلي** (`allRewards`). أي لحظة تشتغل فيها والقايمة لسه ماوصلتش
   (أول فتح · جهاز جديد · نت بطيء) بتفتكر إنها مااتصرفتش وتكتب
   `earnedAt: Date.now()` و`seen:false` من الأول.
   الأثر: الاحتفال يتعاد · «اتشاف» عمره ما يثبت · الفريق يتعوّد
   يتجاهل الفوز — والمكافأة بتفقد معناها كله.
   ============================================================ */
(function(){
  const fs2 = require('fs'), p2 = require('path');
  const SRC = fs2.readFileSync(p2.join(__dirname, '..', 'sales', 'sales-app.js'), 'utf8');

  // ⏳ الحارس: مفيش صرف قبل ما اللقطة توصل
  assert(/window\.rewardsLoaded = true;/.test(SRC), 'علامة وصول لقطة المكافآت');
  const chk = SRC.slice(SRC.indexOf('async function checkAndAwardRewards'),
                        SRC.indexOf('async function checkAndAwardRewards') + 700);
  assert(/if\(!window\.rewardsLoaded\) return;/.test(chk),
    '⭐⭐ مفيش صرف قبل ما المكافآت تتحمّل (وإلا القايمة الفاضية = «مااتصرفتش»)');

  // 🌐 الحقيقة من السيرفر
  const ap = SRC.slice(SRC.indexOf('async function awardPeriod'),
                       SRC.indexOf('window.awardPeriod'));
  assert(/getDoc\(doc\(db,'sales_rewards', id\)\)/.test(ap),
    '⭐⭐ التأكد من السيرفر مش من الكاش المحلي');
  assert(/if\(snapDoc\.exists\(\)\) existing = /.test(ap),
    '⭐ والمستند الموجود بيمنع إعادة الطابع');

  // 🛑 فشل القراءة = مانكتبش
  assert(/console\.warn\('تعذر التأكد من المكافأة — اتأجلت', err\);\s*continue;/.test(ap),
    '⭐⭐ فشل القراءة بيأجّل الصرف — الكتابة على الشك بترجّع الطابع لليوم');

  // 🔒 الطابع بيتكتب مرة واحدة بس
  assert(/existing \? money : Object\.assign\(\{\}, money, \{ earnedAt: Date\.now\(\), seen: false \}\)/.test(ap),
    '⭐⭐ `earnedAt` و`seen` عند الإنشاء بس — والمبلغ لسه بيتحدّث (القسمة بتتغيّر لو حد جديد أهّل)');
  assert(/setDoc\(doc\(db,'sales_rewards', id\)/.test(ap),
    '⭐ معرّف ثابت — جهازين بيكتبوا نفس المستند مش اتنين');

  // 📅 والعرض ليوم واحد بس
  assert(/caiDayKey\(r\.earnedAt\) === today/.test(SRC),
    '⭐ الكارت بيظهر يوم الفوز بس — بتوقيت القاهرة');
})();
