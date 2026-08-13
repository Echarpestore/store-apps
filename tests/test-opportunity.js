// ============================================================
// 🧠 test-opportunity — شريط الفرصة
//
// 🔑 قاعدتين الملف ده كله قايم عليهم:
//    ١. **اقتراح واحد بس** — الشريط المليان كلام بيتحوّل خلفية
//       بيضا في يومين والكاشير تبطّل تبص.
//    ٢. **مصلحة العميلة قبل البيعة** — "معاها رصيد" فوق "قرّبت
//       على مكافأة"، مع إن الأولى بتقلل الفاتورة والتانية بتزوّدها.
// ============================================================
'use strict';
const path = require('path');
const O = require(path.resolve(__dirname, '..', 'pos', 'opportunity-core.js'));

const L = { pointsPerRedemption: 10, redemptionValueEGP: 50, pointsPerEGP: 100 };
const base = (x) => Object.assign({
  phone:'01000000000', loyalty:L, cartTotal:400,
  pointsBalance:0, creditBalance:0
}, x || {});

// ============================================================
// ١) 🎯 هدف الشراية الجاية
// ============================================================
(function(){
  // فاتورة ٤٠٠ = ٤ نقط · رصيدها ٣ = ٧ · الوحدة ١٠ → ناقص ٣ نقط = ٣٠٠ ج.م
  const g = O.oppGoal(base({ pointsBalance: 3 }));
  assert(!!g && g.kind === 'close', '🎯 قرّبت على المكافأة');
  assertEq(g.needPoints, 3, 'وناقصها ٣ نقط');
  assertEq(g.needEGP, 300, 'يعني ٣٠٠ ج.م');
  assertEq(g.value, 50, 'والمكافأة ٥٠ ج.م');

  // ⭐ النقط اللي هتكسبها من الفاتورة **اللي في إيدها** داخلة في الحسبة
  const noCart = O.oppGoal(base({ pointsBalance: 3, cartTotal: 0 }));
  assert(!noCart || noCart.needPoints === 7,
    '⭐ من غير فاتورة، الناقص أكبر (نقط الفاتورة مش موجودة)');

  const reached = O.oppGoal(base({ pointsBalance: 9 }));
  assert(!!reached && reached.kind === 'reached', '✅ ووصلت الوحدة الكاملة');
  assertEq(reached.value, 50, 'وقيمتها ٥٠');

  // ⚠️ الباقي البعيد **مبيتقالش** — إحباط مش تحفيز
  assertEq(O.oppGoal(base({ pointsBalance: 0, cartTotal: 0 })), null,
    '⚠️⭐⭐ ناقص ١٠٠٠ ج.م مبيتقالش — ده إحباط والشريط يبان كإعلان');
  const wide = O.oppGoal(base({ pointsBalance: 0, cartTotal: 0,
    loyalty: Object.assign({}, L, { goalMaxGapEGP: 5000 }) }));
  assert(!!wide, '⭐ والحد قابل للتغيير من الإعدادات');

  // 🔒 حراس
  assertEq(O.oppGoal(base({ phone: '' })), null, '🔒 مفيش عميلة = مفيش هدف');
  assertEq(O.oppGoal({ loyalty:{}, phone:'01' }), null, 'ومفيش نظام نقط = مفيش هدف');
  assertEq(O.oppGoal(null), null, 'وقيم فاضية مبتكسرش');
})();

// ============================================================
// ٢) ⭐⭐ واحدة بس — أهم فحص في الملف
// ============================================================
(function(){
  // موقف فيه **كل** الفرص مع بعض
  const rich = base({
    pointsBalance: 25, creditBalance: 75,
    reward: { type:'percent', value:10, minInvoice: 100 },
    requestHit: 'طرحة بيضا شيفون'
  });
  const all = O.oppRank(rich);
  assert(all.length >= 4, 'فيه فرص كتير في الموقف ده (' + all.length + ')');

  const top = O.oppTop(rich);
  assert(!!top, 'وفيه واحدة على الأقل');
  assert(!Array.isArray(top), '⭐⭐ والمعروض **واحدة** مش قايمة');
  assertEq(top.id, 'reward',
    '⭐⭐ والأولوية للمكافأة المستحقة — دي فلوس العميلة اللي هتضيع لو مشيت');
})();

// ============================================================
// ٣) ⭐⭐ الترتيب: مصلحة العميلة قبل البيعة
// ============================================================
(function(){
  // رصيد (بيقلل الفاتورة) ضد هدف (بيزوّدها)
  const both = base({ creditBalance: 75, pointsBalance: 3 });
  assertEq(O.oppTop(both).id, 'credit',
    '⭐⭐ "معاها رصيد" فوق "قرّبت على مكافأة" — مع إن الرصيد بيقلل الفاتورة');

  // نقط جاهزة ضد هدف
  const pts = base({ pointsBalance: 25 });
  assertEq(O.oppTop(pts).id, 'redeem',
    '⭐ والنقط الجاهزة فوق الهدف — دي مستحقة وممكن تنساها');

  // الترتيب الكامل
  const order = O.oppRank(base({
    pointsBalance: 25, creditBalance: 75,
    reward: { type:'fixed', value:30, minInvoice: 100 },
    requestHit: 'حاجة'
  })).map(function(x){ return x.id; });
  assertEq(order[0], 'reward',  '١) المكافأة');
  assertEq(order[1], 'credit',  '٢) الرصيد');
  assertEq(order[2], 'redeem',  '٣) النقط');
  assert(order.indexOf('request') > order.indexOf('redeem'), '٥) الطلبات في الآخر');
})();

// ============================================================
// ٤) 🔒 مبيقولش حاجة مش أكيدة
// ============================================================
(function(){
  assertEq(O.oppTop(base()), null,
    '🔒 عميلة من غير رصيد ولا نقط ولا مكافأة وفاتورة صغيرة = **شريط فاضي**');
  assertEq(O.oppTop({}), null, 'ومفيش سياق خالص = فاضي');
  assertEq(O.oppTop(null), null, 'و null كمان');

  // 🔒 المطبّق خلاص مبيتعرضش تاني
  assertEq(O.oppTop(base({ creditBalance: 75, creditApplied: true })), null,
    '🔒⭐ الرصيد المطبّق خلاص مبيتقالش تاني');
  assertEq(O.oppTop(base({ pointsBalance: 25, redeemApplied: true })), null,
    '🔒 والاستبدال المطبّق كمان');
  assertEq(O.oppTop(base({ reward:{type:'fixed',value:30,minInvoice:0}, rewardApplied:true })), null,
    '🔒 والمكافأة المطبّقة');

  // 🔒 فاتورة فاضية = مفيش صرف ولا استبدال
  assert(O.oppRank(base({ cartTotal: 0, creditBalance: 75 }))
    .every(function(x){ return x.id !== 'credit'; }),
    '🔒⭐ فاتورة فاضية = مفيش اقتراح صرف رصيد');
})();

// ============================================================
// ٥) 🎁 المكافأة تحت الحد الأدنى
// ============================================================
(function(){
  // فاتورة ٤٠٠ والمكافأة محتاجة ٥٠٠ → "ناقص ١٠٠"
  const near = O.oppTop(base({ reward:{ type:'fixed', value:30, minInvoice:500 } }));
  assert(!!near && near.id === 'reward_near', '🎁 قرّبت على حد المكافأة');
  assert(/ناقص 100/.test(near.text), 'ومكتوب ناقص كام بالظبط');

  // بعيدة قوي → مبتتقالش
  const far = O.oppRank(base({ reward:{ type:'fixed', value:30, minInvoice:5000 } }));
  assert(far.every(function(x){ return x.id !== 'reward_near'; }),
    '⚠️⭐ وبعيدة قوي مبتتقالش');
})();

// ============================================================
// ٦) 📱 نص العميلة مختلف عن نص الكاشير
// ============================================================
(function(){
  const ctx = base({ creditBalance: 75 });
  const opp = O.oppTop(ctx);
  const staff = opp.text;
  const cust = O.oppCustomerText(opp, ctx);
  assert(/معاها/.test(staff), 'الكاشير بتقرا "معاها" (معلومة تشغيلية)');
  assert(/معاكي/.test(cust), '⭐ والعميلة بتقرا "معاكي" (كلام ليها)');
  assert(staff !== cust, '⭐⭐ والنصين مختلفين فعلًا');

  // 🔖 الطلبات مش بتتعرض للعميلة
  const req = { id:'request', icon:'🔖', text:'كانت طالبة: طرحة' };
  assertEq(O.oppCustomerText(req, ctx), '',
    '🔖⭐ الطلب المسجّل مبيظهرش للعميلة — أحلى لما الكاشير تقوله بصوتها');
  assertEq(O.oppCustomerText(null, ctx), '', 'ومفيش فرصة = مفيش نص');
})();

// ============================================================
// ٧) 🔌 التوصيل في POS
// ============================================================
(function(){
  const fs = require('fs');
  const ROOT = path.resolve(__dirname, '..');
  const sale = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'pos', 'index.html'), 'utf8');

  assert(/<script src="opportunity-core\.js"><\/script>/.test(html),
    '🔌 الملف متحمّل في POS');
  const core = html.indexOf('src="pos-core.js"');
  const opp = html.indexOf('src="opportunity-core.js"');
  assert(core > 0 && opp > core, 'وبعد pos-core.js');
  assert(/act-hint/.test(html), '🎨 وتنسيق التلميح موجود');
  assert(/cursor:default/.test(html.slice(html.indexOf('.act-hint'))),
    '⭐ والتلميح شكله مش زرار (وإلا الكاشير تدوس ومايحصلش حاجة)');

  assert(/oppTop\(/.test(sale), '⭐⭐ والمحرك بيتنادى فعلًا (مش دالة ميتة)');

  // ⭐⭐ السلسلة الأمنية الموجودة **ماتلمستش**
  assert(/_tampered/.test(sale) && /_redeemSanitize/.test(sale),
    '⭐⭐ منطق كشف التلاعب والتعقيم لسه موجود — المحرك مازاحمش مسار فلوس شغّال');
  assert(/applyPendingRedeem\(\)/.test(sale), 'وزرار الاستبدال زي ما هو');
  assert(/applyCustomerReward\(\)/.test(sale), 'وزرار المكافأة');

  // ⭐ التلميحات بس — اللي ليها زرار اتعرض فوق
  assert(/if\(_opp && !_opp\.action\)/.test(sale),
    '⭐⭐ اللي ليه زرار مبيتعرضش كتلميح — مفيش تكرار لنفس الحاجة');
})();
