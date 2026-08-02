// ============================================================
// 👤 test-customer-box — خانة العميل في شاشة البيع
// الشكوى: الاسم اتشال خالص، والكاشير مش عارفة هل العميل اترّبط بالفاتورة
// ولا لأ. المطلوب: ٣ حالات بألوان واضحة + الاسم والرقم بينوا لما يكون
// متسجّل + ✕ بيشيل العميل من غير Enter ولا نقرة برّه.
//
// ⚠️ الاختبار ده **سلوكي**: بيشغّل الدوال الحقيقية على DOM وهمي ويقرا
//    النتيجة — مش بيدوّر على نصوص في المصدر (النصوص بتنجح حتى والباج راجع).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const POS = path.resolve(__dirname, '..', 'pos');
const saleSrc = fs.readFileSync(path.join(POS, 'pos-sale.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(POS, 'index.html'), 'utf8');

// ---------- استخراج دالة بالأقواس المتوازنة ----------
function extractFn(src, name){
  const start = src.indexOf('function ' + name + '(');
  if(start < 0) return '';
  const open = src.indexOf('{', start);
  let depth = 0;
  for(let i = open; i < src.length; i++){
    if(src[i] === '{') depth++;
    else if(src[i] === '}'){ depth--; if(depth === 0) return src.slice(start, i + 1); }
  }
  return '';
}

// ---------- DOM وهمي بس **بيسجّل** فعلًا (مش no-op) ----------
function makeEl(){
  const cls = new Set();
  return {
    value: '', textContent: '', innerHTML: '', style: { display: '' }, focused: false,
    classList: {
      add(c){ cls.add(c); }, remove(){ for(const c of arguments) cls.delete(c); },
      contains(c){ return cls.has(c); },
      toggle(c, on){ if(on === undefined) on = !cls.has(c); if(on) cls.add(c); else cls.delete(c); return on; },
      _all(){ return Array.from(cls); }
    },
    focus(){ this.focused = true; },
    children: [],
    appendChild(c){ this.children.push(c); return c; },
    get firstElementChild(){ return this.children[0] || makeEl(); }
  };
}
function makeCtx(){
  const els = {};
  const sb = {
    document: {
      getElementById(id){ return els[id] || (els[id] = makeEl()); },
      createElement(){ return makeEl(); },
      activeElement: null
    },
    setTimeout(fn){ try{ fn(); }catch(e){} return 0; },
    window: {}, String, Number, Object, Date, JSON, Math, console,
    _custMatchedPhone: '', _custReqSeq: 0
  };
  vm.createContext(sb);
  ['setCustState', 'setCustAction', '_custInvalidate', 'clearCustomer',
   '_custBtnSync', '_custDetachIfChanged'].forEach(n=>{
    const code = extractFn(saleSrc, n);
    assert(code.length > 0, `الدالة ${n} موجودة في pos-sale.js`);
    vm.runInContext(code, sb);
  });
  sb._els = els;
  return sb;
}
const run = (sb, expr)=> vm.runInContext(expr, sb);
const el = (sb, id)=> sb.document.getElementById(id);

// ============================================================
// ١) الحالة الخضرا — عميل متسجّل
// ============================================================
{
  const sb = makeCtx();
  el(sb, 'customerPhone').value = '01012345678';
  run(sb, `setCustState('found', 'سارة أحمد', '01012345678')`);

  assert(el(sb, 'custBox').classList.contains('st-found'), '🟢 المربع بياخد st-found');
  assert(el(sb, 'custBox').classList.contains('on'), 'وعلامة on القديمة فضلت (توافق)');
  assert(el(sb, 'custBox').classList.contains('st-found'),
    '🟢 اللون بيتحدد بحالة واحدة على المربع — والـCSS بيلوّن الخانة والشريط');

  const info = el(sb, 'customerInfo');
  assert(info.textContent.indexOf('سارة أحمد') >= 0, '👤 الاسم ظاهر');
  assertEq(el(sb, 'customerPhone').value, '01012345678',
    '📱 والرقم فاضل في خانته على نفس السطر — مش متكرر في الاسم');
  assert(el(sb, 'custClearBtn').classList.contains('on'),
    '✕ ظاهر طول ما فيه رقم — من غير Enter ولا نقرة برّه');
}

// عميل من غير اسم: لازم يفضل واضح إنه متسجّل + الرقم ظاهر
{
  const sb = makeCtx();
  el(sb, 'customerPhone').value = '01112223334';
  run(sb, `setCustState('found', '', '01112223334')`);
  assert(el(sb, 'custBox').classList.contains('st-found'), 'عميل من غير اسم لسه متسجّل (أخضر)');
  assert(el(sb, 'customerInfo').textContent.indexOf('بدون اسم') >= 0,
    'وعميل من غير اسم بيقول كده صراحة');
}

// ============================================================
// ٢) الحالة البرتقالي — رقم مش مسجّل
// ============================================================
{
  const sb = makeCtx();
  el(sb, 'customerPhone').value = '01098765432';
  run(sb, `setCustState('new', '', '01098765432')`);
  assert(el(sb, 'custBox').classList.contains('st-new'), '🟠 st-new اتحطت');
  assert(!el(sb, 'custBox').classList.contains('st-found'), 'ومفيش أخضر معاها');
  assert(!el(sb, 'custBox').classList.contains('on'),
    '🔴 المهم: مش مسجّل ≠ مربوط — علامة on لازم تفضل مقفولة');
  assert(el(sb, 'customerInfo').textContent.indexOf('مش مسجّل') >= 0, 'والشريط بيقول مش مسجّل');
  assert(el(sb, 'customerName').focused, '📝 والمؤشر نطّ لخانة الاسم لوحده');
}

// ============================================================
// ٣) الحالة الفاضية + إن الحالات **مبتتراكمش**
// ============================================================
{
  const sb = makeCtx();
  el(sb, 'customerPhone').value = '01012345678';
  run(sb, `setCustState('found', 'منى', '01012345678')`);
  run(sb, `setCustState('new', '', '01012345678')`);
  assert(!el(sb, 'custBox').classList.contains('st-found'),
    '🔴 الأخضر بيتشال لما الحالة تتغيّر لبرتقالي (مش بيتراكموا)');
  assert(el(sb, 'custBox').classList.contains('st-new'),
    'والحالة الجديدة بس هي اللي فاضلة');

  el(sb, 'customerPhone').value = '';
  run(sb, `setCustState('')`);
  assert(!el(sb, 'custBox').classList.contains('st-found')
      && !el(sb, 'custBox').classList.contains('st-new'), '⚪ الحالة الفاضية بتشيل الاتنين');
  assertEq(el(sb, 'customerInfo').textContent, '', 'والشريط بيتفضّى');
  assertEq(el(sb, 'custClearBtn').classList.contains('on'), false, '✕ بيختفي لما مفيش رقم');
}

// حالة غلط/مش معروفة = فاضية (مش بتزرع كلاس عشوائي)
{
  const sb = makeCtx();
  const out = run(sb, `setCustState('حاجة تانية', 'x', '1')`);
  assertEq(out, '', 'أي حالة مش معروفة بتترجّع فاضية');
  assert(!el(sb, 'custBox').classList.contains('st-حاجة تانية'), 'ومفيش كلاس غريب اتحط');
  assertEq(run(sb, `setCustState('bad')`), 'bad', '⚠️ وفيه حالة تالتة للرقم الناقص');
}

// ============================================================
// ٤) ✕ بيشيل العميل بضغطة واحدة
// ============================================================
{
  const sb = makeCtx();
  el(sb, 'customerPhone').value = '01012345678';
  el(sb, 'customerName').value = 'سارة';
  run(sb, `setCustState('found', 'سارة', '01012345678'); _custMatchedPhone = '01012345678';`);
  run(sb, `clearCustomer()`);

  assertEq(el(sb, 'customerPhone').value, '', 'الرقم اتمسح');
  assertEq(el(sb, 'customerName').value, '', 'والاسم اتمسح');
  assert(!el(sb, 'custBox').classList.contains('st-found'), 'واللون الأخضر وقع');
  assertEq(el(sb, 'custClearBtn').classList.contains('on'), false, 'و✕ اختفى');
  assertEq(run(sb, '_custMatchedPhone'), '',
    '🔴 والربط اتفك جوّه — مش بس الشكل (وإلا الفاتورة تفضل شايلة العميل)');
  assert(el(sb, 'customerPhone').focused, 'والمؤشر رجع لخانة الرقم على طول');
  assertEq(el(sb, 'customerInfo').textContent, '', 'والشريط اتفضّى');
}

// ============================================================
// ٥) تغيير رقم عميل متربط = فك الربط فورًا
//    (من غير ده الفاتورة تفضل على العميل القديم والرقم مكتوب غيره)
// ============================================================
{
  const sb = makeCtx();
  el(sb, 'customerPhone').value = '01012345678';
  run(sb, `setCustState('found', 'سارة', '01012345678'); _custMatchedPhone = '01012345678';`);

  assertEq(run(sb, `_custDetachIfChanged()`), false, 'نفس الرقم = مفيش فك ربط');
  assert(el(sb, 'custBox').classList.contains('st-found'), 'والأخضر باقي');

  el(sb, 'customerPhone').value = '0101234567';   // مسحت رقم
  assertEq(run(sb, `_custDetachIfChanged()`), true, '✏️ أول ما الرقم يتغيّر بيتفك الربط');
  assert(!el(sb, 'custBox').classList.contains('st-found'), 'واللون الأخضر وقع فورًا');
  assertEq(run(sb, '_custMatchedPhone'), '', 'والربط الداخلي اتصفّر');
}

// مفيش عميل متربط أصلًا → مبيعملش حاجة
{
  const sb = makeCtx();
  el(sb, 'customerPhone').value = '0101';
  assertEq(run(sb, `_custDetachIfChanged()`), false, 'من غير ربط قايم، مفيش تدخّل');
}

// ============================================================
// ٦) الوصل بالإنتاج: refreshCustomerInfo لازم تنادي الحالتين
// ============================================================
{
  const rc = extractFn(saleSrc, 'refreshCustomerInfo');
  assert(rc.length > 0, 'refreshCustomerInfo موجودة');
  assert(/setCustState\('found'/.test(rc),
    '🔗 فرع «العميل موجود» بينادي الحالة الخضرا');
  assert(/setCustState\('found',\s*d\.name[^,]*,\s*phone\)/.test(rc),
    '🔗 وبيبعت **الاسم والرقم** — مش بس بينوّر');
  assert(/setCustState\('new'/.test(rc), '🔗 وفرع «مش مسجّل» بينادي الحالة البرتقالي');
  assert(!/setCustBox\(true\)/.test(rc),
    '🔴 مبقاش فيه نداء للطريقة القديمة (نوّر/طفّي) جوه الدالة');
  assert(/_custMatchedPhone\s*=\s*phone/.test(rc),
    'وبيسجّل الرقم المتربط عشان فك الربط يشتغل');
}

// ============================================================
// ٧) الشكل: **خط واحد** ومفيش أي سطر بياكل من مساحة البيع
// ============================================================
{
  assert(/class="cust-line"/.test(htmlSrc), 'السطر الواحد موجود');
  const line = (htmlSrc.match(/\.cust-line\{[^}]*\}/) || [''])[0];
  assert(/display:flex/.test(line) && line.indexOf('flex-wrap') < 0,
    '🔴 كله في سطر واحد — مفيش لفّ لسطر تاني');
  assert(htmlSrc.indexOf('cust-band') < 0, 'والشريط اللي كان تحت اتشال');

  // الترتيب: المربع ← الزرار ← الأيقونة. الأيقونة آخر السطر فمكانها ثابت
  const box = htmlSrc.indexOf('id="custBox"');
  const act = htmlSrc.indexOf('id="custAction"');
  const cap = htmlSrc.indexOf('id="custCapBtn"');
  assert(box < act && act < cap,
    '🎯 الأيقونة آخر السطر — فمكانها مبيتغيّرش لما زرار الاستبدال يظهر');
  const boxHtml = htmlSrc.slice(box, act);
  assert(boxHtml.indexOf('id="custCapBtn"') < 0,
    '📱 وأيقونة «يكتب رقمه» **برّه** الخلفية الملوّنة');
  assert(boxHtml.indexOf('id="customerInfo"') > 0 && boxHtml.indexOf('id="custPts"') > 0,
    'والاسم والنقط جوه المربع مع الرقم');

  // خانة الرقم طويلة وهي فاضية وبتقصر لما العميل يبان
  assert(/#customerPhone\{[\s\S]{0,260}flex:1 1 auto/.test(htmlSrc),
    '📏 خانة الرقم طويلة وهي فاضية');
  assert(/#custBox\.st-found #customerPhone,[\s\S]{0,160}flex:0 0 \d+px/.test(htmlSrc),
    '🔴 وبتقصر أول ما العميل يبان — عشان تفسح للاسم والنقط في نفس السطر');

  const clr = (htmlSrc.match(/#custClearBtn\{[^}]*\}/) || [''])[0];
  assert(/visibility:hidden/.test(clr), '✕ بيتخفي بـvisibility — اللي جنبه مبيتحركش');
  assert(/#custAction:empty\{ display:none/.test(htmlSrc),
    '🎁 ومكان الزرار مبياخدش عرض وهو فاضي — مفيش مساحة ضايعة');
  assert(/#custPts\{[^}]*display:none/.test(htmlSrc) && /st-found #custPts\{ display:inline-block/.test(htmlSrc),
    '💳 والنقط بتبان بس مع العميل المتسجّل');
}

// ============================================================
// ٨) الكاش لازم يترفع مع أي تعديل
// ============================================================
{
  const sw = fs.readFileSync(path.join(POS, 'sw.js'), 'utf8');
  const v = (sw.match(/store-apps-shell-v(\d+)/) || [])[1];
  assert(!!v && Number(v) >= 253, 'CACHE_NAME بتاع POS ≥ v253 (الحالي v' + (v || '?') + ')');
}

// ============================================================
// ٩) 🎁 الزرار بيظهر وقت الحاجة بس — ومفيش زرار بيفضل من عميل فات
// ============================================================
{
  const sb = makeCtx();
  el(sb, 'customerPhone').value = '01012345678';
  run(sb, `setCustState('found', 'سارة', '01012345678')`);
  run(sb, `setCustAction('<button class="act-redeem">استبدال</button>')`);
  assert(el(sb, 'custAction').children.length >= 1, 'الزرار بيتحط في مكانه');

  el(sb, 'customerPhone').value = '';
  run(sb, `setCustState('')`);
  assertEq(el(sb, 'custAction').innerHTML, '',
    '🔴 والمكان بيتفضّى لوحده مع تصفير العميل');
  assertEq(el(sb, 'custPts').textContent, '', 'والنقط بتتمسح معاه');
}

// النقط شارة مستقلة — مش نص بيتلزق في سطر الاسم
{
  const ui = extractFn(saleSrc, 'refreshCustomerActionUI');
  assert(ui.length > 0, 'refreshCustomerActionUI موجودة');
  assert(/getElementById\('custPts'\)/.test(ui),
    '💳 النقط ليها عنصرها الخاص — فمفيش تكرار مع كل تحديث');
  assert(!/infoBox\.textContent = _base/.test(ui), '🔴 ومفيش لزق في سطر الاسم');
  assert(/setCustAction\('<button class="act-redeem"/.test(ui),
    '🎁 وزرار الاستبدال بيروح لمكانه في نفس السطر');
  assert(!/margin-top:8px; background:#fff6e6/.test(ui), 'والبلوك الكبير القديم اتشال');
}


// زرار «سجّل» بيبان بكلاس صريح — مش بـ:has (مش مدعومة في كل المتصفحات)
{
  const sb = makeCtx();
  el(sb, 'customerPhone').value = '01098765432';
  run(sb, `setCustState('new', '', '01098765432')`);
  assert(el(sb, 'custAction').classList.contains('reg'),
    '➕ زرار «سجّل» بيبان بالحالة عن طريق كلاس صريح');
  run(sb, `setCustState('found', 'منى', '01098765432')`);
  assert(!el(sb, 'custAction').classList.contains('reg'),
    '🔴 وبيختفي أول ما العميل يبقى متسجّل — مفيش زرار تسجيل على عميل موجود');
  assert(/#custAction\.reg #newCustomerRow\{ display:block/.test(htmlSrc),
    'والستايل موصّل بالكلاس ده');
}

// ============================================================
// ⏳ طلب الاستبدال لازم يكون **جديد**
// الشكوى: الزرار بيظهر لمجرد ما تكتب رقم عميل عنده نقط.
// السبب: `pendingRedeem` مبيتمسحش غير لما الفاتورة تتقفل والاستبدال
// مطبّق فيها — فالطلب اللي ماخدش بيفضل في المستند للأبد.
// ============================================================
{
  const vm3 = require('vm');
  const sb = { window:{}, Number, Date, loyaltyRedemptionConfig:{} };
  vm3.createContext(sb);
  ['redeemReqTtlMs', 'redeemReqFresh'].forEach(n=>{
    const c = extractFn(saleSrc, n);
    assert(c.length > 0, `الدالة ${n} موجودة`);
    vm3.runInContext(c, sb);
  });
  const now = 1700000000000;
  const fresh = (req)=> vm3.runInContext(`redeemReqFresh(${JSON.stringify(req)}, ${now})`, sb);

  assertEq(fresh({ ts: now - 60000 }), true, 'طلب من دقيقة = جديد');
  assertEq(fresh({ ts: now - 59*60000 }), true, 'وطلب من ٥٩ دقيقة لسه ماشي');
  assertEq(fresh({ ts: now - 61*60000 }), false,
    '🔴 وطلب من أكتر من ساعة **سقط** — مش هيظهر تاني كل ما تكتب الرقم');
  assertEq(fresh({ ts: now - 30*86400000 }), false, 'وطلب من شهر أكيد ساقط');
  assertEq(fresh({}), false,
    '🔴 وطلب من غير وقت (من نسخة قديمة) بيتجاهل — ده اللي بينضّف القديم');
  assertEq(fresh(null), false, 'ومفيش طلب أصلًا = مفيش زرار');

  // المدة بتتظبط من الإعدادات
  sb.loyaltyRedemptionConfig = { redeemRequestTtlMin: 5 };
  assertEq(fresh({ ts: now - 6*60000 }), false, 'والمدة بتتظبط من إعدادات الولاء');
  assertEq(fresh({ ts: now - 4*60000 }), true, 'وبتحترم الرقم المظبوط');

  // الوصلة في الإنتاج
  const rci = extractFn(saleSrc, 'refreshCustomerInfo');
  assert(/redeemReqFresh\(d\.pendingRedeem, _now\)/.test(rci),
    '🔗 والفحص متوصّل فعلًا في قراءة العميل');
}

// 🔐 الاستبدال اليدوي بصلاحية
{
  const core = fs.readFileSync(path.join(POS, 'pos-core.js'), 'utf8');
  const orp = extractFn(saleSrc, 'openRedeemPoints');
  assert(/hasPerm\('canRedeemManual'\)/.test(orp),
    '🔐 الاستبدال اليدوي بقى بصلاحية — مش أي كاشير');
  const guardAt = orp.indexOf("canRedeemManual");
  assert(guardAt > 0 && guardAt < orp.indexOf('TEST_CUSTOMERS'),
    '🔴 والفحص أول حاجة — قبل أي قراءة من الداتابيز');
  assert(/canRedeemManual: false/.test(core), 'والكاشير مقفولة عليها افتراضيًا');
  assert((core.match(/canRedeemManual: true/g) || []).length >= 3,
    'والمشرف والمدير والأدمن مفتوحة ليهم');
  assert(/data-uid="sa_redeem"[\s\S]{0,160}canRedeemManual/.test(core),
    '👁️ والزرار نفسه بيتخفي لو مفيش صلاحية — مش بس بيرفض عند الدوس');
}

// ============================================================
// 🎯 حارس التركيز — مسح شامل
// ============================================================
{
  const core = fs.readFileSync(path.join(POS, 'pos-core.js'), 'utf8');
  const vm4 = require('vm');
  const mk = (tag, extra)=> Object.assign({ tagName: tag, isContentEditable:false }, extra || {});

  // ---- إيه اللي بيتحسب "تركيز ضايع" ----
  const sb2 = { document:{ activeElement:null, body:{}, documentElement:{} }, String, window:{} };
  vm4.createContext(sb2);
  vm4.runInContext(extractFn(core, '_focusIsLost'), sb2);
  const lost = ()=> vm4.runInContext('_focusIsLost()', sb2);
  sb2.document.activeElement = null;                assertEq(lost(), true,  'مفيش تركيز = ضايع');
  sb2.document.activeElement = sb2.document.body;   assertEq(lost(), true,  '🔴 التركيز على body = ضايع (ده اللي بيوقف الكتابة)');
  sb2.document.activeElement = mk('INPUT');         assertEq(lost(), false, 'خانة إدخال = تمام');
  sb2.document.activeElement = mk('TEXTAREA');      assertEq(lost(), false, 'وخانة نص كبيرة');
  sb2.document.activeElement = mk('SELECT');        assertEq(lost(), false, 'وقايمة اختيار');
  sb2.document.activeElement = mk('DIV', { isContentEditable:true });
  assertEq(lost(), false, 'وعنصر قابل للكتابة');
  sb2.document.activeElement = mk('BUTTON');        assertEq(lost(), true,  'زرار مش خانة كتابة → يرجّع التركيز');

  // ---- مبيخطفش التركيز من نافذة مفتوحة ----
  const sb3 = { document:{ querySelectorAll(){ return sb3._els; } }, _els:[] };
  vm4.createContext(sb3);
  vm4.runInContext(extractFn(core, '_focusBlocked'), sb3);
  const blocked = ()=> vm4.runInContext('_focusBlocked()', sb3);
  sb3._els = [];                                    assertEq(blocked(), false, 'مفيش نوافذ = مفيش مانع');
  sb3._els = [{ offsetParent:null }];               assertEq(blocked(), false, 'نافذة مقفولة مش مانع');
  sb3._els = [{ offsetParent:{} }];                  assertEq(blocked(), true,
    '🔴 نافذة مفتوحة → الحارس بيسيبها — مبيخطفش التركيز من موديل');
  sb3._els = [{ offsetParent:null }, { offsetParent:{} }];
  assertEq(blocked(), true, 'وواحدة مفتوحة من كذا واحدة بتكفي');
  assert(/\[id\$="Modal"\], \[id\$="Overlay"\]/.test(core),
    '🔎 والفحص بالاصطلاح المتّبع (Modal/Overlay) — فأي نافذة جديدة بتتغطى تلقائي');

  // ---- الطرق الخمسة اللي التركيز بيضيع بيها ----
  assert(/addEventListener\('focus'[\s\S]{0,140}_focusRescue/.test(core),
    '① رجوع النافذة (طباعة · ماكينة كارت · حوار ويندوز)');
  assert(/visibilitychange[\s\S]{0,160}_focusRescue/.test(core), '② رجوع الصفحة');
  assert(/pointerdown[\s\S]{0,220}_focusRescue/.test(core), '③ دوسة في مكان مش خانة');
  assert(/addEventListener\('focusout'[\s\S]{0,200}_focusRescue/.test(core),
    '④ عنصر عليه التركيز اتشال أو اتخفى');
  assert(/setInterval\([\s\S]{0,240}_focusRescue/.test(core),
    '⑤ شبكة أمان دورية — بتغطي أي طريق جديد مالناش خبر بيه');
  assert(/document\.hasFocus\(\)/.test(core),
    '🛡️ والدورية بتسكت لو النافذة نفسها مش نشطة — مبتسحبش التركيز من برنامج تاني');

  // ---- الضربة الأولى نفسها مش بتضيع ----
  assert(/e\.key && e\.key\.length === 1/.test(core),
    '⌨️ الحرف اللي اتضرب والتركيز ضايع **بيتحط** في البحث — مش بيضيع');
  assert(/dispatchEvent\(new Event\('input'/.test(core),
    'وبيتبعت كأنه اتكتب — فالبحث بيشتغل عليه');
  assert(/e\.ctrlKey \|\| e\.altKey \|\| e\.metaKey/.test(core),
    '🛡️ واختصارات الكيبورد مبتتلمسش');

  const tgt = extractFn(core, '_focusTarget');
  assert(/saleScreen/.test(tgt), '🛡️ والإنقاذ في شاشة البيع بس');
  const rescue = extractFn(core, '_focusRescue');
  assert(/_focusBlocked\(\)/.test(rescue),
    '🔴 والإنقاذ نفسه بيسأل عن النوافذ المفتوحة — مش بس الدالة موجودة');
  assert(/_focusIsLost\(\)/.test(rescue), 'وبيتأكد إن التركيز ضايع فعلًا الأول');
}

// ============================================================
// 🔃 آخر قطعة اتسجلت تبقى **فوق** ومختارة
// المطلوب: الكاشير تضرب الباركود وتلاقي الصنف أول السطر ومحدد،
// فتقدر تدوس + أو − على طول من غير ما تدوّر على صفه.
// ⚠️ الخطر: لو الترتيب اتغيّر في **المصفوفة** نفسها، الفاتورة المطبوعة
//    وفاتورة العكس وأرقام السطور كلها تتقلب. فالعكس في **العرض بس**.
// ============================================================
{
  const rc = extractFn(saleSrc, 'renderCart');
  assert(rc.length > 0, 'renderCart موجودة');
  assert(/cart\.map\(\(c, idx\)=> \(\{ c, idx \}\)\)\.reverse\(\)/.test(rc),
    '🔃 العرض معكوس — الأحدث فوق');
  assert(!/cart\.reverse\(\)/.test(rc) && !/cart\.unshift\(/.test(saleSrc),
    '🔴 والمصفوفة نفسها ماتقلبتش — الفاتورة المطبوعة وأرقام السطور زي ما هي');
  // الفهرس المستعمل في الأزرار لازم يكون الحقيقي مش ترتيب العرض
  assert(/cartQty\(\$\{idx\},-1\)/.test(rc) && /cartRemove\(\$\{idx\}\)/.test(rc)
      && /selectCartRow\(\$\{idx\}\)/.test(rc),
    '🔴 وكل زرار شايل الفهرس الحقيقي — وإلا + و− هيشتغلوا على الصنف الغلط');
  assert(/<td>\$\{idx\+1\}<\/td>/.test(rc),
    'ورقم السطر هو الحقيقي كمان — مطابق للفاتورة المطبوعة');

  // 🎯 التحديد التلقائي — سلوكيًا
  const vm5 = require('vm');
  const sb = { cart:[], selectedCartIdx:null, lastAddedId:null, renderCart(){}, item:null };
  vm5.createContext(sb);
  const add = extractFn(saleSrc, 'addToCart') || '';
  assert(/selectedCartIdx = _i/.test(saleSrc),
    '🎯 آخر صنف اتضاف بيتحدد تلقائي');
  const blk = saleSrc.slice(saleSrc.indexOf('lastAddedId = item.id;'),
                            saleSrc.indexOf('renderCart();', saleSrc.indexOf('lastAddedId = item.id;')));
  vm5.runInContext('function pick(cart, id){ let selectedCartIdx = null; const item = { id:id }; '
    + blk + ' return selectedCartIdx; }', sb);
  const pick = (c, id)=> vm5.runInContext(`pick(${JSON.stringify(c)}, ${JSON.stringify(id)})`, sb);

  assertEq(pick([{id:'a'},{id:'b'},{id:'c'}], 'c'), 2, 'الصنف اللي لسه اتضاف آخر واحد');
  assertEq(pick([{id:'a'},{id:'b'},{id:'a'}], 'a'), 2,
    '🔴 وصنف مكرر → بيتحدد **آخر نسخة** مش أول واحدة');
  assertEq(pick([{id:'a'},{id:'b'}], 'a'), 0, 'وزيادة كمية صنف موجود بتحدده هو');
  // 🛡️ نفس الصنف موجود كمرتجع كمان (فاتورة تبديل) — لازم يتحدد سطر البيع
  assertEq(pick([{id:'a'},{id:'a', isReturn:true}], 'a'), 0,
    '🛡️ سطر المرتجع مبيتحددش — التحديد بيروح لسطر البيع');
  assertEq(pick([{id:'a'},{id:'a', isRedemption:true}], 'a'), 0, 'ولا سطر الاستبدال');
  assertEq(pick([{id:'a'},{id:'a', isRewardDiscount:true}], 'a'), 0, 'ولا سطر المكافأة');
  assertEq(pick([{id:'a'}], 'zz'), null, 'وصنف مش موجود = مفيش تحديد');
}

// ============================================================
// ⌨️ شاشة الباقي بتتقفل بـEnter — إيد الكاشير على الكيبورد مش الماوس
// ============================================================
{
  const fn = extractFn(saleSrc, 'showChangeAfterPrint');
  assert(fn.length > 0, 'شاشة الباقي موجودة');
  assert(/e\.key === 'Enter'/.test(fn), '⌨️ Enter بيقفلها');
  assert(/e\.key === 'Escape'/.test(fn), 'وEscape كمان');
  assert(/addEventListener\('keydown', onKey, true\)/.test(fn),
    '🔴 الحدث بيتمسك في مرحلة الالتقاط — قبل ما يوصل لأي خانة');
  assert(/e\.stopPropagation\(\)/.test(fn) && /e\.preventDefault\(\)/.test(fn),
    '🔴 والـEnter مبيعديش لبار البحث — وإلا بيعمل بحث على الفاضي');
  assert(/removeEventListener\('keydown', onKey, true\)/.test(fn),
    '🧹 والمستمع بيتشال بعد القفل — مفيش تراكم مع كل فاتورة');
  assert(/searchBar[\s\S]{0,40}focus\(\)/.test(fn), 'والمؤشر بيرجع لبار البحث بعدها');
}

// ============================================================
// 🔢 «العميل بيرجع لوحده بعد ما أمسحه»
// السبب: القراءة من الداتابيز غير متزامنة. الكاشير تمسح العميل والقراءة
// القديمة لسه في الطريق — بترجع بعد المسح **وتكتب العميل تاني**، فيبان
// كأنه راجع لوحده مع لاج. الحل: ترقيم الطلبات وتجاهل أي نتيجة متأخرة.
// ============================================================
{
  const rci = extractFn(saleSrc, 'refreshCustomerInfo');
  assert(/const _req = \+\+_custReqSeq/.test(rci), '🔢 كل قراءة بتاخد رقم');
  assert(/_req !== _custReqSeq/.test(rci), 'والنتيجة المتأخرة بتتجاهل');
  assert(/el\.value\.trim\(\) !== phone/.test(rci),
    '🔴 وكمان لو الرقم في الخانة اتغيّر وإحنا بنقرا — النتيجة مش بتاعته');

  // ⚠️ العدّ لوحده مش كفاية — لازم **كل** await وراه فحص بالاسم.
  //    (شيل فحص واحد بس والعدّ لسه بيعدّي.)
  const lines = rci.split('\n');
  const missed = [];
  lines.forEach(function(ln, i){
    if(ln.indexOf('await ') < 0) return;
    if(ln.indexOf('_stale()') >= 0) return;                  // الفحص في نفس السطر
    const nxt = (lines[i+1] || '') + (lines[i+2] || '');
    if(nxt.indexOf('_stale()') < 0) missed.push(ln.trim().slice(0, 46));
  });
  assertEq(missed, [],
    '🔴 كل قراءة غير متزامنة وراها فحص — من غيره النتيجة المتأخرة بتكتب العميل تاني');

  const cc = extractFn(saleSrc, 'clearCustomer');
  assert(/_custInvalidate\(\)/.test(cc),
    '🔴 و✕ بيلغي أي قراءة في الطريق — ده أصل الشكوى');
  const dc = extractFn(saleSrc, '_custDetachIfChanged');
  assert(/_custInvalidate\(\)/.test(dc), 'وتغيير الرقم كمان بيلغيها');

  // سلوكيًا: العدّاد بيلغي الطلب القديم
  const vm6 = require('vm');
  const sb = { _custReqSeq: 0 };
  vm6.createContext(sb);
  const inv = saleSrc.match(/function _custInvalidate\(\)\{[^}]*\}/);
  assert(!!inv, 'دالة الإلغاء موجودة');
  vm6.runInContext(inv[0], sb);
  const a = vm6.runInContext('++_custReqSeq', sb);      // طلب قديم بدأ
  vm6.runInContext('_custInvalidate()', sb);            // الكاشير مسحت
  assert(a !== vm6.runInContext('_custReqSeq', sb),
    '🔢 الطلب القديم مبقاش هو الأخير → نتيجته بتترمي');
}

// ============================================================
// 🛡️ الأسباب البنيوية: عنصر عليه التركيز بيتخفي أو بيتشال
// دول اللي بيصنعوا الحالة اللي الحارس بيصلحها — فبنقفلهم من المنبع كمان
// ============================================================
{
  // ③ خانة الاسم بتتقفل بالـCSS مع تغيّر الحالة
  const scs = extractFn(saleSrc, 'setCustState');
  assert(/st !== 'new' && document\.activeElement === nm/.test(scs),
    '🛡️ لو التركيز على خانة الاسم وهي على وشك تتقفل → بيتحوّل قبلها');
  const moveAt = scs.indexOf("st !== 'new' && document.activeElement === nm");
  const focusAt = scs.indexOf("st === 'new' && document.activeElement !== nm");
  assert(moveAt > 0 && moveAt < focusAt,
    '🔴 والتحويل **قبل** ما ننقل المؤشر للاسم — الترتيب مهم');
  assert(/searchBar/.test(scs.slice(moveAt, focusAt)), 'وبيروح لبار البحث');

  // ④ إعادة رسم السلة بتشيل خانة الكمية اللي بتتكتب
  const rc = extractFn(saleSrc, 'renderCart');
  assert(/qn-input/.test(rc) && /_focusQty/.test(rc),
    '🛡️ إعادة رسم السلة بتحفظ خانة الكمية اللي عليها التركيز');
  assert(/selectionStart/.test(rc) && /setSelectionRange/.test(rc),
    'وبترجّع مكان المؤشر جوه الخانة — مش بس التركيز');
  const saveAt = rc.indexOf('_focusQty = Number');
  const htmlAt = rc.indexOf('tbody.innerHTML =');
  const restoreAt = rc.indexOf('_in.focus()');
  assert(saveAt > 0 && saveAt < htmlAt && restoreAt > htmlAt,
    '🔴 الحفظ قبل إعادة الرسم والإرجاع بعدها');
}

// ============================================================
// 💸 القراءات — الفلترة الزمنية على السيرفر مش على الجهاز
// الواقع: 963 ألف قراءة مقابل 4.4 ألف كتابة في اليوم (النسبة الطبيعية
// 5-10، وهنا 219). السبب: استعلامات بتسحب `entries` بتاعة الفرع **كلها**
// وتفلتر آخر دقيقتين على الجهاز — مع كل بحث عن عميل ومع كل فاتورة.
// ⚠️ الفلترة بـ`ts` لوحدها عن قصد: حقل واحد = مفيش index مركّب مطلوب،
//    والفرع بيتفلتر محليًا على نتيجة صغيرة أصلًا.
// ============================================================
{
  const rep = fs.readFileSync(path.join(POS, 'pos-reports.js'), 'utf8');
  const files = [['pos-sale.js', saleSrc], ['pos-reports.js', rep]];
  files.forEach(function(f){
    const bad = (f[1].match(/collection\('entries'\)\s*\.where\('branch'[^\n]*\)\.get\(\)/g) || []);
    assertEq(bad, [],
      '🔴 ' + f[0] + ' — مفيش استعلام بيسحب تقييمات الفرع كلها من غير حد زمني');
  });

  // كل استعلام على entries لازم يكون مقيّد: بالرقم · بالوقت · أو بمستند واحد
  files.forEach(function(f){
    const lines = f[1].split('\n');
    lines.forEach(function(ln, i){
      if(ln.indexOf("collection('entries')") < 0) return;
      const chunk = ln + (lines[i+1] || '') + (lines[i+2] || '');
      const ok = /where\('ts'/.test(chunk) || /where\('customerPhone'/.test(chunk)
              || /\.doc\(/.test(chunk) || /q = db\.collection\('entries'\)/.test(ln)
              || /_eq = db\.collection\('entries'\)/.test(ln);
      assert(ok, '💸 ' + f[0] + ':' + (i+1) + ' — الاستعلام مقيّد (' + ln.trim().slice(0, 44) + ')');
    });
  });

  // التخمين القريب: نافذة دقيقتين على السيرفر والفرع محليًا
  const rci = extractFn(saleSrc, 'refreshCustomerInfo');
  assert(/where\('ts','>=', twoMinAgo\)/.test(rci),
    '🔴 تخمين التقييم القريب بقى بنافذة دقيقتين على السيرفر');
  assert(/e\.branch === currentBranch/.test(rci),
    'والفرع بيتفلتر محليًا على النتيجة الصغيرة');

  // ربط التقييم بالفاتورة
  const link = extractFn(saleSrc, 'tryLinkFeedbackToCustomer');
  assert(/where\('ts','>=', windowStart\)\.where\('ts','<=', windowEnd\)/.test(link),
    '🔴 وربط التقييم بالفاتورة بنافذته هو كمان — مش الفرع كله');

  // التقارير بتحترم الفترة المطلوبة
  assert(/if\(from\) q = q\.where\('ts','>=', from\.getTime\(\)\)/.test(rep),
    '📊 وتقرير التقييمات بيسحب الفترة المطلوبة بس');
  // ⚠️ الفحص ده كان بيثبّت `from`/`to` في renderLiveSalesHistory — وهما
  //    أصلًا **مش معرّفين في الدالة دي** (محليين جوه renderReportsScreen).
  //    يعني كان بيحرس على كود بيرمي ReferenceError كل مرة. النافذة دلوقتي
  //    متحسوبة من الفواتير المتحمّلة نفسها، وبرضه مسقوفة من الطرفين.
  const hist = extractFn(rep, 'renderLiveSalesHistory');
  const histCode = hist.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert(histCode.indexOf("collection('entries')") >= 0, 'سجل الفواتير بيسحب التقييمات');
  assert(/\.where\('ts','>=',/.test(histCode) && /\.where\('ts','<=',/.test(histCode),
    'وتقرير الربط بنافذة مسقوفة من الطرفين — مش سحب المجموعة كلها');
  assert(!/\bfrom\.getTime\(\)/.test(histCode) && !/\bto\.getTime\(\)/.test(histCode),
    '🔴 ومن غير from/to (المتغيرين اللي مش موجودين في نطاق الدالة دي)');
}

// ============================================================
// ٧) 🔴 خانة اسم العميل لازم ترجع تبان بعد ✕
//    الشكوى (المالك، صورة من الفرع): رقم مش مسجّل والخانة مش موجودة.
//    السبب: clearCustomer كانت بتحط `style="display:none"` سطري على
//    #customerName، والستايل السطري بيغلب قاعدة الـCSS اللي بتوريها.
//    فبعد أول دوسة على ✕ الخانة مبتبانش تاني **لحد ما الصفحة تتقفل**.
//    ⚠️ اختبار **متسلسل**: عملية واحدة لوحدها بتعدّي — الباج بيبان في
//       التتابع (امسح ← اكتب رقم تاني).
// ============================================================
{
  const sb = makeCtx();

  // (١) عميل متسجّل، والكاشير دوست ✕
  el(sb, 'customerPhone').value = '01012345678';
  el(sb, 'customerName').value = 'سارة';
  run(sb, `setCustState('found', 'سارة', '01012345678'); _custMatchedPhone = '01012345678';`);
  run(sb, `clearCustomer()`);

  assertEq(el(sb, 'customerName').style.display, '',
    '🔴 ✕ مبيزرعش display:none سطري على خانة الاسم — العرض شغلة الـCSS');

  // (٢) الكاشير كتبت رقم تاني مش مسجّل — الخانة لازم تبان
  el(sb, 'customerPhone').value = '01098765432';
  run(sb, `setCustState('new', '', '01098765432')`);
  assert(el(sb, 'customerName').style.display !== 'none',
    '🔴 بعد ✕ ورقم جديد مش مسجّل، خانة الاسم مش مخفية بستايل سطري');
  assert(el(sb, 'customerName').focused,
    'والمؤشر نطّ لها — يعني هي فعلًا موجودة وشغّالة');

  // (٣) وتفضل شغّالة بعد دورة كاملة تانية
  run(sb, `clearCustomer()`);
  el(sb, 'customerPhone').value = '01555555555';
  run(sb, `setCustState('new', '', '01555555555')`);
  assert(el(sb, 'customerName').style.display !== 'none',
    'وبعد دورة تانية كمان (الباج كان بيتراكم مش بيتصلح لوحده)');
}

// والقاعدة نفسها لازم تكون محصّنة ضد أي ستايل سطري جاي بعدين
{
  const m = htmlSrc.match(/#custBox\.st-new\s+#customerName\s*\{([^}]*)\}/);
  assert(!!m, 'قاعدة إظهار خانة الاسم في حالة «مش مسجّل» موجودة');
  assert(m && /display\s*:\s*block\s*!important/.test(m[1]),
    '🛡️ وعليها !important — من غيرها أي display:none سطري بيغلبها ويرجّع الباج');
}

// وخانة الاسم على **نفس السطر** جوه المربع — مش سطر تاني
{
  const line = htmlSrc.match(/<div class="cust-line">([\s\S]*?)<\/div>\s*<div id="resetPinRow"/);
  assert(!!line, 'سطر العميل (.cust-line) اتلقى');
  const box = line && line[1].match(/<div id="custBox">([\s\S]*?)<\/div>/);
  assert(!!box, 'ومربع العميل جواه');
  assert(box && /id="customerName"/.test(box[1]),
    '🎯 خانة الاسم جوه #custBox — يعني نفس السطر مع الرقم، مش سطر تحته');
  const rule = htmlSrc.match(/#customerName\s*\{([^}]*)\}/);
  assert(rule && /flex\s*:\s*1 1 auto/.test(rule[1]),
    'وبتاخد الباقي من السطر (flex) فمفيش لفّ لسطر تاني');
}
