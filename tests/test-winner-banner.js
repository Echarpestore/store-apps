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
  'function todaysRewardWinners(', 'function renderWinnerBanner(',
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
// ٣) 🖼️ البانر فيه الاسم والمبلغ وصندوق الهدية
// ============================================================
(function(){
  const { ctx, host } = build([ R({ amount: 175 }) ]);
  ctx.renderWinnerBanner();
  const h = host.innerHTML;
  assert(host.style.display === 'block', 'البانر ظاهر');
  assert(h.indexOf('سارة') >= 0, '⭐ اسم الفايزة');
  assert(h.indexOf('175') >= 0 && h.indexOf('ج.م') >= 0, '⭐ والمبلغ');
  assert(h.indexOf('🎁') >= 0, '⭐ وصندوق الهدية');
  assert(h.indexOf('winFrame') >= 0 && h.indexOf('winShine') >= 0, 'وإطار بلمعة متحركة');
  assert(h.indexOf('2026-08-03') >= 0, 'والفترة اللي فازت عنها');

  // أكتر من فايزة = الأسماء كلها والمجموع
  const many = build([ R({ id:'a', amount:100 }), R({ id:'b', employeeName:'هند', amount:150 }) ]);
  many.ctx.renderWinnerBanner();
  const h2 = many.host.innerHTML;
  assert(h2.indexOf('سارة') >= 0 && h2.indexOf('هند') >= 0, '⭐ الفايزتين الاتنين بالاسم');
  assert(h2.indexOf('250') >= 0, 'والمجموع 250');
  assert(h2.indexOf('فايزين') >= 0, 'وبصيغة الجمع');
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
  ['winFrame','winShine','winGift','winAmount','giftOkBtn'].forEach(c=>{
    assert(new RegExp('\\.' + c + '\\{').test(html), 'ستايل .' + c + ' موجود');
  });
  ['winIn','winShine','winBob','confFall','giftShake','giftPop','revealUp'].forEach(k=>{
    assert(new RegExp('@keyframes ' + k + '\\{').test(html), 'أنيميشن ' + k);
  });
  // البانر لازم يترسم مع تحديث المكافآت مش مرة واحدة عند التحميل
  const bare = stripComments(src);
  assert(/try\{ renderWinnerBanner\(\); \}catch/.test(bare),
    '⭐ الرسم معزول في try — دالة تانية تقع مبتوقفهاش');
  ['todaysRewardWinners','renderWinnerBanner'].forEach(n=>{
    assert(new RegExp('window\\.' + n + ' *= *' + n).test(bare), '§18 ' + n + ' على window');
  });
  const sw = fs.readFileSync(path.join(ROOT, 'sales', 'sw.js'), 'utf8');
  const m = sw.match(/store-apps-shell-v(\d+)/);
  assert(!!m && Number(m[1]) >= 107, 'sales/sw.js: v107+ (لقينا ' + (m ? m[1] : '—') + ')');
})();
