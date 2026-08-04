// ============================================================
// 🎁 test-reward-budget — ميزانية المكافآت
//
// الباج: `randomReward()` كان `Math.random()*(1000-200)+200` — مبلغ
// عشوائي حرفيًا لكل مستحق، **من غير أي سقف**. 20 موظف × 4 أسابيع
// كان ممكن يوصل ~30,000 ج في الشهر (نص كشف المرتبات) من غير ما
// حد ياخد باله.
//
// القرار (المالك): تفضل مكافأة التزام بياخدها كل مستحق — بس بميزانية
// مقفولة 4000 أسبوعي (للشهر كله) + 4000 شهري، على كل الفروع،
// بسقف 400 للواحدة وحد أدنى 100. والزيادة تستنى موافقته.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { loadSalesApp } = require('./helpers/load-sales');

const ROOT = path.resolve(__dirname, '..');
const { sandbox: S } = loadSalesApp();
const appSrc = fs.readFileSync(path.join(ROOT,'sales','sales-app.js'),'utf8');
const htmlSrc = fs.readFileSync(path.join(ROOT,'sales','index.html'),'utf8');
const CFG = S.window.REWARD_CFG;

// ============================================================
// ١) ⛔ العشوائية اتشالت خالص
// ============================================================
(function(){
  assert(!/randomReward/.test(appSrc), '⛔ randomReward اتشالت من الكود');
  assert(!/Math\.random\(\)\s*\*\s*\(1000/.test(appSrc), '⛔ ومفيش أي مبلغ عشوائي');
  assertEq(CFG.weeklyBudgetMonth, 4000, 'ميزانية الأسبوعي في الشهر = 4000');
  assertEq(CFG.monthlyBudget, 4000, 'وميزانية الشهري = 4000');
  assertEq(CFG.maxWeeklyAward, 200, 'وسقف المكافأة الأسبوعية 200');
  assertEq(CFG.maxMonthlyAward, 400, 'وسقف الشهرية 400');
  assertEq(CFG.minPerAward, 100, 'والحد الأدنى 100');
})();

// ============================================================
// ٢) 💰 النصيب: الميزانية بتتقسّم بالتساوي
// ============================================================
(function(){
  const w = (n)=> S.window.rewardShare(n, 'weekly', CFG);   // ميزانية الأسبوع = 1000
  assertEq(w(1).amount, 200, 'مستحق واحد: بياخد السقف 200 مش الـ1000 كلها');
  assertEq(w(2).amount, 200, 'اتنين: 200 للواحد');
  assertEq(w(3).amount, 200, 'تلاتة: 200 (السقف لسه شغال)');
  assertEq(w(5).amount, 200, 'خمسة: 200 للواحد = الميزانية بالظبط');
  assertEq(w(6).amount, 166, 'ستة: 166 — من هنا القسمة هي الحاكمة مش السقف');
  assertEq(w(10).amount, 100, 'عشرة: 100 للواحد (بالظبط الميزانية)');

  const m = (n)=> S.window.rewardShare(n, 'monthly', CFG);  // 4000
  assertEq(m(10).amount, 400, 'الشهري: 10 مستحقين = 400 للواحد (السقف)');
  assertEq(m(20).amount, 200, 'و20 مستحق = 200 للواحد');
  assertEq(m(40).amount, 100, 'و40 = 100 (الحد الأدنى)');
})();

// ============================================================
// ٣) 🧢 السقف والحد الأدنى — الحمايتين
// ============================================================
(function(){
  // مستحق واحد مياخدش الميزانية كلها
  assertEq(S.window.rewardShare(1, 'monthly', CFG).amount, 400,
    '⭐ مستحق واحد في الشهري بياخد 400 مش 4000');
  assertEq(S.window.rewardShare(1, 'monthly', CFG).total, 400, 'والباقي مبيتصرفش');
  assertEq(S.window.rewardShare(1, 'weekly', CFG).amount, 200,
    '⭐ والأسبوعية سقفها أقل — 200 مهما قلّ عدد المستحقين');
  // 💰 أقصى حاجة ممكن شخص واحد ياخدها في الشهر كله
  const maxPerson = 4 * S.window.rewardShare(1,'weekly',CFG).amount
                      + S.window.rewardShare(1,'monthly',CFG).amount;
  assertEq(maxPerson, 1200, '⭐⭐ أقصى نصيب فردي في الشهر = 1200 ج مهما حصل');
  // ⭐ الحالة اللي كانت بتفجّر الميزانية قبل كده
  const big = S.window.rewardShare(20, 'weekly', CFG);
  assertEq(big.amount, 100, '⭐ 20 مستحق في أسبوع: 100 للواحد (الحد الأدنى)');
  assertEq(big.total, 2000, 'الإجمالي 2000');
  assertEq(big.overBudget, true, '⭐⭐ ومتعلّم إنه عدّى ميزانية الأسبوع (1000)');
  assertEq(S.window.rewardShare(10, 'weekly', CFG).overBudget, false,
    'و10 مستحقين بالظبط = في الميزانية، مفيش استئذان');
})();

// ============================================================
// ٤) مقارنة بالقديم — حجم الفرق
// ============================================================
(function(){
  // القديم: متوسط 600 × 20 موظف × 4 أسابيع = 48,000 (والأقصى 80,000)
  // الجديد: مهما كان العدد، الأسبوعي في الشهر مبيعديش 4×الميزانية الأسبوعية
  // 60 مستحق في أسبوع واحد: القديم كان ممكن يوصل 60×1000 = 60,000
  const many = S.window.rewardShare(60, 'weekly', CFG);
  assertEq(many.amount, 100, 'حتى مع 60 مستحق: 100 للواحد مش 1000');
  assertEq(many.total, 6000, 'الإجمالي 6000');
  assertEq(many.overBudget, true, '⭐ ومستحيل يتصرف من غير موافقتك');
  // الأهم: أي حالة فوق الميزانية بتبقى **مستأذنة** مش تلقائية
  for(let n = 1; n <= 60; n++){
    const r = S.window.rewardShare(n,'weekly',CFG);
    assert(r.total <= r.budget || r.overBudget,
      'أي تجاوز للميزانية لازم يبقى متعلّم (n=' + n + ')');
  }
})();

// ============================================================
// ٥) 🚧 المستنية موافقة متظهرش للموظفة
// ============================================================
(function(){
  const list = [
    { id:'r1', status:'pending',  amount:100 },
    { id:'r2', status:'approved', amount:200 },
    { id:'r3', amount:300 },                      // قديمة من غير status
    { id:'r4', status:'rejected', amount:400 }
  ];
  assertEq(S.window.visibleRewards(list).map(r=> r.id), ['r2','r3'],
    '⭐ الموظفة بتشوف المعتمد والقديم بس — لا المستني ولا المرفوض');
  assertEq(S.window.pendingBudgetRewards(list).map(r=> r.id), ['r1'],
    'ولوحة المالك بتشوف المستني');
  // نيجاتيف سلوكي: صندوق الهدية بيمرّ على visibleRewards
  assert(/visibleRewards\(rewards\)/.test(appSrc),
    '⭐ صندوق الهدية بيفلتر المستني — وعد بمكافأة ممكن ترفض أسوأ من صمت');
})();

// ============================================================
// ٦) 🔒 معرّف ثابت للمستند — جهازين مايصرفوش المكافأة مرتين
// ============================================================
(function(){
  const r1 = { start: new Date(2026, 6, 6) };   // الاتنين 6 يوليو
  const k1 = S.window.rewardPeriodKey('weekly', r1);
  assertEq(k1, 'weekly_20260706', 'مفتاح الفترة ثابت ومشتق من تاريخها');
  assertEq(S.window.rewardPeriodKey('weekly', { start: new Date(2026,6,6) }), k1,
    '⭐ نفس الفترة = نفس المفتاح مهما اتحسبت كام مرة');
  assert(S.window.rewardPeriodKey('monthly', r1) !== k1, 'والنوع بيغيّر المفتاح');
  // الكتابة بمعرّف مبني على المفتاح مش addDoc عشوائي
  assert(/setDoc\(doc\(db,'sales_rewards', key \+ '_' \+ e\.id\)/.test(appSrc),
    '⭐⭐ الكتابة بمعرّف ثابت (setDoc) — addDoc كان هيصرفها مرتين من جهازين');
  assert(!/addDoc\(rewardsCol/.test(appSrc), '⛔ مفيش addDoc عشوائي على المكافآت');
})();

// ============================================================
// ٧) المبلغ بيتحسب مرة واحدة للفترة كلها (مش موظف موظف)
//    — لازم نعرف عدد المستحقين قبل ما نحدد النصيب
// ============================================================
(function(){
  assert(!/maybeAwardPeriod/.test(appSrc), '⛔ الدالة القديمة (موظف موظف) اتشالت');
  assert(/function qualifiesForReward\(/.test(appSrc), 'الفحص اتفصل عن الصرف');
  assert(/const winners = emps\.filter\(e=> qualifiesForReward/.test(appSrc),
    '⭐ بنجمع المستحقين الأول');
  assert(/rewardShare\(winners\.length/.test(appSrc), 'وبعدين نحسب النصيب من عددهم');
  assert(/allEmployees \|\| \[\]/.test(appSrc), '⭐ وعلى كل الفروع مش فرع الجهاز بس');
  // الفحص مبيكتبش أي حاجة
  const i = appSrc.indexOf('function qualifiesForReward(');
  const body = appSrc.slice(i, appSrc.indexOf('window.qualifiesForReward'));
  assert(!/setDoc|addDoc|updateDoc/.test(body), '⛔ الفحص قراءة بس — مفيش كتابة جواه');
})();

// ============================================================
// ٨) عدّاد المصروف الشهري
// ============================================================
(function(){
  const now = new Date(2026, 6, 20).getTime();
  const inMonth = (d)=> new Date(2026, 6, d).getTime();
  const sp = S.window.rewardMonthSpend([
    { type:'weekly',  amount:100, earnedAt: inMonth(6),  status:'approved' },
    { type:'weekly',  amount:100, earnedAt: inMonth(13), status:'approved' },
    { type:'monthly', amount:400, earnedAt: inMonth(2),  status:'approved' },
    { type:'weekly',  amount:900, earnedAt: inMonth(13), status:'pending'  },  // مش متصرفة
    { type:'weekly',  amount:800, earnedAt: new Date(2026,5,10).getTime(), status:'approved' } // شهر فات
  ], now);
  assertEq(sp.weekly, 200, 'الأسبوعي الشهر ده = 200 (المستني مش محسوب)');
  assertEq(sp.monthly, 400, 'والشهري 400');
  assertEq(sp.total, 600, 'الإجمالي 600');
  assertEq(sp.weeklyBudget, 4000, 'مقابل ميزانية 4000');
})();

// ============================================================
// ٩) اللوحة والصلاحية والتنبيه
// ============================================================
(function(){
  assert(/id="rewardBudgetPanel"/.test(htmlSrc), 'لوحة الميزانية موجودة');
  assertEq(S.window.permOfPanelTitle('🎁 ميزانية المكافآت'), 'money',
    '⭐ تحت صلاحية الفلوس — المدير مبيشوفهاش');
  assert(/pendingBudgetRewards\(window\.allRewards/.test(appSrc),
    'وشريط "محتاج منك" بينبّه على المستني');
  const dec = appSrc.slice(appSrc.indexOf('async function decideRewardBudget('));
  assert(/confirm\(/.test(dec.slice(0, 1500)), 'وفيه تأكيد قبل الاعتماد أو الرفض');
})();

// ============================================================
// ١٠) القاعدة الذهبية + الكاش
// ============================================================
(function(){
  ['rewardShare','rewardPeriodKey','qualifiesForReward','awardPeriod',
   'visibleRewards','pendingBudgetRewards','rewardMonthSpend','renderRewardBudget']
    .forEach(function(n){
      assert(new RegExp('window\\.' + n + ' *= *' + n).test(appSrc), n + ' معروضة على window');
    });
  const sw = fs.readFileSync(path.join(ROOT,'sales','sw.js'),'utf8');
  const m = sw.match(/store-apps-shell-v(\d+)/);
  assert(!!m && Number(m[1]) >= 93, 'sales: CACHE_NAME v93+');
})();
