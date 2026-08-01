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
    focus(){ this.focused = true; }
  };
}
function makeCtx(){
  const els = {};
  const sb = {
    document: { getElementById(id){ return els[id] || (els[id] = makeEl()); } },
    window: {}, String, Number, Object, Date, JSON, Math, console,
    _custMatchedPhone: ''
  };
  vm.createContext(sb);
  ['setCustState', 'clearCustomer', '_custBtnSync', '_custDetachIfChanged'].forEach(n=>{
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
  assert(el(sb, 'customerPhone').classList.contains('st-found'),
    '🟢 **خانة الرقم نفسها** بتاخد اللون — مش المربع بس (ده اللي المالك طلبه)');

  const pill = el(sb, 'custNamePill');
  assert(pill.textContent.indexOf('سارة أحمد') >= 0, '👤 الاسم ظاهر');
  assert(pill.textContent.indexOf('01012345678') >= 0, '📱 و**الرقم** ظاهر جنبه');
  assert(pill.style.display !== 'none', 'وشريط الهوية ظاهر مش مخفي');
  assert(el(sb, 'custClearBtn').style.display !== 'none',
    '✕ ظاهر طول ما فيه رقم — من غير Enter ولا نقرة برّه');
}

// عميل من غير اسم: لازم يفضل واضح إنه متسجّل + الرقم ظاهر
{
  const sb = makeCtx();
  el(sb, 'customerPhone').value = '01112223334';
  run(sb, `setCustState('found', '', '01112223334')`);
  assert(el(sb, 'custBox').classList.contains('st-found'), 'عميل من غير اسم لسه متسجّل (أخضر)');
  assert(el(sb, 'custNamePill').textContent.indexOf('01112223334') >= 0,
    'والرقم ظاهر حتى لو الاسم فاضي');
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
  assert(el(sb, 'customerPhone').classList.contains('st-new'), 'وخانة الرقم بتاخد اللون البرتقالي');
  assert(el(sb, 'custNamePill').style.display !== 'none', 'وفيه لافتة بتقول مش مسجّل');
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
  assert(!el(sb, 'customerPhone').classList.contains('st-found'),
    'وخانة الرقم كمان بتتنضّف من الحالة القديمة');

  el(sb, 'customerPhone').value = '';
  run(sb, `setCustState('')`);
  assert(!el(sb, 'custBox').classList.contains('st-found')
      && !el(sb, 'custBox').classList.contains('st-new'), '⚪ الحالة الفاضية بتشيل الاتنين');
  assertEq(el(sb, 'custNamePill').textContent, '', 'وشريط الهوية بيتفضّى');
  assertEq(el(sb, 'custNamePill').style.display, 'none', 'وبيختفي');
  assertEq(el(sb, 'custClearBtn').style.display, 'none', '✕ بيختفي لما مفيش رقم');
}

// حالة غلط/مش معروفة = فاضية (مش بتزرع كلاس عشوائي)
{
  const sb = makeCtx();
  const out = run(sb, `setCustState('حاجة تانية', 'x', '1')`);
  assertEq(out, '', 'أي حالة مش معروفة بتترجّع فاضية');
  assert(!el(sb, 'custBox').classList.contains('st-حاجة تانية'), 'ومفيش كلاس غريب اتحط');
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
  assertEq(el(sb, 'custClearBtn').style.display, 'none', 'و✕ اختفى');
  assertEq(run(sb, '_custMatchedPhone'), '',
    '🔴 والربط اتفك جوّه — مش بس الشكل (وإلا الفاتورة تفضل شايلة العميل)');
  assert(el(sb, 'customerPhone').focused, 'والمؤشر رجع لخانة الرقم على طول');
  assertEq(el(sb, 'newCustomerRow').style.display, 'none', 'وصف «مش مسجل» اتقفل');
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
// ٧) الـHTML والـCSS: العناصر والألوان موجودة فعلًا
// ============================================================
{
  assert(/id="custNamePill"/.test(htmlSrc), 'عنصر شريط الهوية موجود في index.html');
  assert(/id="custClearBtn"/.test(htmlSrc), 'وزرار ✕ موجود');
  assert(/#custBox\.st-new\{/.test(htmlSrc), 'وستايل الحالة البرتقالي متعرّف');
  assert(/#customerPhone\.st-found\{/.test(htmlSrc),
    '🎨 وخانة الرقم نفسها ليها ستايل أخضر (مش المربع بس)');
  assert(/#customerPhone\.st-new\{/.test(htmlSrc), 'وليها ستايل برتقالي كمان');
  // الترتيب مهم: الشريط جوه المربع عشان الألوان المتوارثة تشتغل
  const box = htmlSrc.slice(htmlSrc.indexOf('<div id="custBox">'));
  assert(box.indexOf('custNamePill') > 0 && box.indexOf('custNamePill') < box.indexOf('newCustomerRow'),
    'شريط الهوية جوه مربع العميل نفسه');
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
// ٩) 🔲 مستطيلين جنب بعض — مساحة السلة متتغيّرش
// الشكوى: خانة العميل واخدة عرض الصفحة كله من غير فايدة، وأول ما يظهر
// طلب استبدال أو مكافأة الشاشة بتنزل لتحت وتاكل من مساحة الشغل.
// ============================================================
{
  const sb = makeCtx();
  el(sb, 'customerPhone').value = '01012345678';
  run(sb, `setCustState('found', 'سارة', '01012345678')`);
  assertEq(el(sb, 'custSide').style.display, 'flex', '🔲 المستطيل التاني بيظهر مع العميل');
  assert(el(sb, 'custBox').classList.contains('has-side'),
    'وخانة الرقم بتنزل لنص العرض (has-side)');

  run(sb, `setCustState('new', '', '01012345678')`);
  assertEq(el(sb, 'custSide').style.display, 'flex', 'وبيظهر كمان مع الرقم المش مسجّل');

  el(sb, 'customerPhone').value = '';
  run(sb, `setCustState('')`);
  assertEq(el(sb, 'custSide').style.display, 'none', '⚪ وبيختفي لما مفيش عميل');
  assert(!el(sb, 'custBox').classList.contains('has-side'),
    'وخانة الرقم بترجع تاخد العرض كله');
}

// الشكل نفسه: سقف ارتفاع ثابت + العناصر جوه المستطيل مش تحته
{
  assert(/\.cust-grid\{[^}]*display:flex/.test(htmlSrc), 'الاتنين جنب بعض بـflex');
  const side = (htmlSrc.match(/\.cust-side\{[^}]*\}/) || [''])[0];
  assert(/max-height:\s*\d+px/.test(side),
    '🔴 سقف ارتفاع ثابت للمستطيل — ده اللي بيمنع الشاشة تنزل لما يظهر استبدال');
  assert(/overflow-y:\s*auto/.test(side), 'واللي زيادة بيتزحلق جواه بدل ما يزقّ');

  // customerInfo و newCustomerRow لازم يكونوا **جوه** المستطيل مش تحته
  const sideStart = htmlSrc.indexOf('id="custSide"');
  const sideEnd = htmlSrc.indexOf('</div>\n        </div>', sideStart);
  const inside = htmlSrc.slice(sideStart, sideEnd);
  assert(inside.indexOf('id="customerInfo"') > 0, 'سطر النقط جوه المستطيل');
  assert(inside.indexOf('id="newCustomerRow"') > 0, 'وصف التسجيل الجديد جواه كمان');
  assert(inside.indexOf('id="resetPinRow"') < 0,
    '🔑 ماعدا «مسح الرقم السري» — ده تحت زي ما المالك طلب');
  assert(htmlSrc.indexOf('id="resetPinRow"') > sideStart, 'وموقعه فعلًا بعد المستطيل');
}

// بطاقات الاستبدال والمكافأة بقت أشرطة مضغوطة مش بلوكات
{
  const ui = extractFn(saleSrc, 'refreshCustomerActionUI');
  assert(ui.length > 0, 'refreshCustomerActionUI موجودة');
  assert(!/margin-top:8px; background:#fff6e6/.test(ui),
    '🔴 بلوك الاستبدال الكبير اتشال');
  assert(!/padding:10px 12px/.test(ui), 'ومفيش حشو كبير فاضل في أي بطاقة');
  assert((ui.match(/flex-wrap:wrap/g) || []).length >= 2,
    'الاتنين بقوا أشرطة بتلفّ جوه المستطيل');
}
