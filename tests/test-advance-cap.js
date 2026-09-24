#!/usr/bin/env node
// ============================================================
// test-advance-cap.js (sales v619) — سقف السلف: موظف «ماخدش ولا سلفة» واتقاله «عدّيت الليميت»
// سلوك فعلي على دوال السلف الحقيقية. يتشغّل لوحده: node tests/test-advance-cap.js
// ============================================================
'use strict';
require('./helpers/swv');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'sales', 'sales-app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'sales', 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; } else { fail++; console.error('  ❌ ' + m); } };
function extractFn(src, header){
  const at = src.indexOf(header);
  if(at < 0) throw new Error('extractFn: مش لاقي «' + header + '»');
  let i = src.indexOf('{', at + header.length - 1), depth = 0, q = null;
  for(; i < src.length; i++){
    const c = src[i];
    if(q){
      if(c === '\\'){ i++; continue; }
      if(q === '`' && c === '$' && src[i+1] === '{'){ let d = 1; i += 2; while(i < src.length && d){ if(src[i] === '{') d++; else if(src[i] === '}') d--; i++; } i--; continue; }
      if(c === q) q = null; continue;
    }
    if(c === '/' && src[i+1] === '/'){ while(i < src.length && src[i] !== '\n') i++; continue; }
    if(c === '/' && src[i+1] === '*'){ i = src.indexOf('*/', i) + 1; continue; }
    if(c === '"' || c === "'" || c === '`'){ q = c; continue; }
    if(c === '{') depth++;
    else if(c === '}'){ depth--; if(depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error('extractFn: أقواس مش متوازنة «' + header + '»');
}
// توقيت القاهرة مبسّط للاختبار (UTC+3 صيفي) — نفس واجهة cai/caiStamp في التطبيق
const pre = 'function cai(t){ return new Date(new Date(t).getTime() + 3*3600e3 + new Date(t).getTimezoneOffset()*60e3); }\n'
          + 'function caiStamp(y,m,d,h,mi,s,ms){ return Date.UTC(y, m-1, d, (h||0)-3, mi||0, s||0, ms||0); }\n';
const ctx = { window:{}, Date, Math, Number, String, Object, Array };
vm.createContext(ctx);
vm.runInContext(pre + ['function advWindowOpen(', 'function advCycleStartDay(', 'function advCycleKey(', 'function advKeyOf(', 'function advMonthTotal(', 'function advMonthBreakdown(', 'function advLimitMessage(', 'function advCheck(']
  .map(h => extractFn(app, h)).join('\n'), ctx);

const CFG = { maxPerMonth:3000, openDay:12, closeDay:6 };          // إعدادات المالك: تفتح 12 وتقفل 6
const NOW = new Date(Date.UTC(2026, 8, 18, 12, 0, 0));              // 18 سبتمبر — جوّه دورة 2026-09
const order = (amt, o) => Object.assign({ employeeId:'e1', amount:amt, date:'2026-09-14', ts:1, source:'staff_order', invoiceNo:'4100' }, o || {});
const cash  = (amt, o) => Object.assign({ employeeId:'e1', amount:amt, date:'2026-09-15', ts:2, cycleKey:'2026-09' }, o || {});

console.log('\n🧾 1) الحالة اللي المالك بلّغ عنها');
let r = ctx.advCheck(CFG, [order(1800), order(900, { source:'staff_order_reject' })], 'e1', 500, NOW);
ok(r.ok === false && r.reason === 'limit', 'موظف ماخدش ولا سلفة كاش، بس اشترى بـ2700 على المرتب ← طلب 500 بيترفض (ده اللي حصل)');
ok(r.cash === 0 && r.orders === 2700 && r.used === 2700 && r.left === 300, 'والتفصيلة واضحة: كاش 0 · مشتريات 2700 · فاضل 300');
let msg = ctx.advLimitMessage(r);
ok(/فاضلك 300/.test(msg) && /مشتريات على المرتب 2700/.test(msg) && !/سلف \d/.test(msg), '⭐ الرسالة بقت بتقول **ليه**: «فاضلك 300 … محسوب عليك: مشتريات على المرتب 2700» — ' + msg);
ok(!/تعدّيت|واخد/.test(msg), 'ومبقتش تقول «واخد 2700» لواحد ماخدش سلف');
ok(/staff_order_reject/.test(app), 'الأوردر **المرفوض** كمان بيتحسب (بالسعر الكامل) — مصدره `staff_order_reject`');

console.log('💬 2) الرسايل');
r = ctx.advCheck(CFG, [], 'e1', 3500, NOW);
ok(r.ok === false && r.used === 0, 'مفيش أي حاجة عليه وطلب 3500');
ok(/أقصى سلفة 3000/.test(ctx.advLimitMessage(r)) && !/فاضلك|خلص/.test(ctx.advLimitMessage(r)), '← «المبلغ أكبر من سقف الشهر — أقصى سلفة 3000» (مش «تعدّيت»)');
r = ctx.advCheck(CFG, [cash(1000), order(800)], 'e1', 1500, NOW);
ok(/سلف 1000/.test(ctx.advLimitMessage(r)) && /مشتريات على المرتب 800/.test(ctx.advLimitMessage(r)) && /فاضلك 1200/.test(ctx.advLimitMessage(r)), 'كاش + مشتريات = الاتنين مكتوبين');
r = ctx.advCheck(CFG, [cash(3000)], 'e1', 100, NOW);
ok(/خلص/.test(ctx.advLimitMessage(r)), 'السقف خلص = «خلص» مش «فاضلك 0»');

console.log('⚙️ 3) قرار المالك: المشتريات تتحسب ولا لأ');
ok(ctx.advCheck(CFG, [order(2700)], 'e1', 500, NOW).ok === false, 'الافتراضي (من غير الحقل) = زي ما كان: محسوبة');
ok(ctx.advCheck(Object.assign({}, CFG, { ordersCountInCap:true }), [order(2700)], 'e1', 500, NOW).ok === false, 'شغّالة صراحة = محسوبة');
const OFF = Object.assign({}, CFG, { ordersCountInCap:false });
r = ctx.advCheck(OFF, [order(2700)], 'e1', 500, NOW);
ok(r.ok === true && r.left === 2500, 'مقفولة = السقف للكاش بس ← الـ500 بتعدّي وفاضله 2500');
r = ctx.advCheck(OFF, [order(2700), cash(2800)], 'e1', 500, NOW);
ok(r.ok === false && r.used === 2800 && !/مشتريات/.test(ctx.advLimitMessage(r)), 'ومقفولة: الكاش لسه مسقوف، والرسالة متجيبش سيرة المشتريات');
ok(/ordersCountInCap: d\.ordersCountInCap !== false/.test(app), 'الإعداد بيتقري من `advances_cfg` والافتراضي true');
ok(/id="advOrdersInCapInput"[^>]*checked/.test(html) && /ordersCountInCap: _oc \? !!_oc\.checked : true/.test(app), 'وفيه اختيار في شاشة إعدادات السلف بيتحفظ');

console.log('🗓️ 4) قاعدة الدورة ماتكسرتش');
// v622: الشهر بقى من **التاريخ** (زي المرتب) — «دورة تانية» = تاريخ في أغسطس
ok(ctx.advMonthTotal([cash(500), order(700), cash(900, { date:'2026-08-20', cycleKey:'2026-08' })], 'e1', '2026-09', 12, 6) === 1200, '`advMonthTotal` زي ما هي (الاختبارات القديمة معتمدة عليها)');
let bd = ctx.advMonthBreakdown([cash(500), order(700), cash(900, { date:'2026-08-20', cycleKey:'2026-08' }), cash(400, { employeeId:'e2' })], 'e1', '2026-09', 12, 6);
ok(bd.cash === 500 && bd.orders === 700 && bd.total === 1200, 'التفصيلة = نفس المجموع، ومن غير دورة تانية ولا موظف تاني');
bd = ctx.advMonthBreakdown([order(600, { date:'2026-09-03' })], 'e1', '2026-09', 12, 6);
ok(bd.total === 0, 'مشتريات 3 سبتمبر (من غير cycleKey) = دورة أغسطس مش سبتمبر');
ok(ctx.advMonthBreakdown([order(600, { date:'2026-09-03' })], 'e1', '2026-08', 12, 6).orders === 600, 'وبتتحسب على أغسطس صح');
ok(ctx.advCheck(CFG, [], 'e1', 100, new Date(Date.UTC(2026, 8, 9, 12))).reason === 'closed', 'يوم 9 (بين 6 و12) = النافذة مقفولة زي الأول');
ok(ctx.advCheck({ maxPerMonth:0, openDay:0, closeDay:0 }, [order(9999)], 'e1', 5000, NOW).ok === true, 'سقف 0 = من غير حد');

console.log('🔎 4ب) v620 — «أنا ماخدتش حاجة»: الرسالة بتعرض البنود نفسها');
r = ctx.advCheck(CFG, [cash(3000, { date:'2026-09-15' })], 'e1', 500, NOW);
msg = ctx.advLimitMessage(r);
ok(/• 2026-09-15 — سلفة 3000 ج\.م/.test(msg), 'كل بند محسوب بيظهر بتاريخه ومبلغه — ' + JSON.stringify(msg.split('\n')[1] || ''));
/* v622: بلاغ المالك 23-09 (حبيبة) — سلف 2 و5 سبتمبر محفوظة `cycleKey:'2026-09'` واتخصمت من مرتب أغسطس
   (المرتب بيقرا التاريخ)، وبرضه كانت بتاكل سقف سبتمبر ← «سقف 3000 خلص» وهي واخدة 1000 بس في سبتمبر. */
r = ctx.advCheck(CFG, [cash(3000, { date:'2026-09-03', cycleKey:'2026-09' })], 'e1', 500, NOW);
ok(r.ok === true, '⭐ سلفة 3 سبتمبر محفوظة غلط على سبتمبر = بتتحسب على أغسطس بتاريخها (زي المرتب) ومبتاكلش سقف سبتمبر');
r = ctx.advCheck(CFG, [cash(3000, { date:'2026-09-03', cycleKey:'2026-08' })], 'e1', 500, NOW);
ok(r.ok === true, 'ونفس السلفة محفوظة صح (دورة أغسطس) = مبتأثرش على سبتمبر');
r = ctx.advCheck(CFG, [cash(2800, { date:'2026-09-16', manual:true, source:'owner_manual' })], 'e1', 500, NOW);
ok(/سلفة سجّلها المالك 2800/.test(ctx.advLimitMessage(r)), 'سلفة المالك سجّلها بإيده = مكتوب إنها كده (الموظف ممكن ميكونش عارف بيها)');
r = ctx.advCheck(OFF, [order(900), cash(2900)], 'e1', 500, NOW);
ok(!/مشتريات/.test(ctx.advLimitMessage(r)) && /سلفة 2900/.test(ctx.advLimitMessage(r)), 'والمشتريات مبتتعرضش في القايمة لو مش محسوبة');
ok(/if\(!window\.advCfgLoaded\)\{[^}]*return; \}/.test(app) && app.indexOf('if(!window.advCfgLoaded)') < app.indexOf('const chk = advCheck(window.advCfg'), '🔒 مفيش سلفة تتسجّل قبل ما الإعدادات توصل (من غيرها: السقف = من غير حد، والدورة بتتحفظ غلط)');
ok(/window\.advCfgLoaded = false;/.test(app) && /\(snap\)=>\{\s*\n\s*window\.advCfgLoaded = true;/.test(app), 'والعلامة بتتقلب أول ما الإعدادات توصل (حتى لو المستند مش موجود)');
ok(/id="advAmountErr" style="white-space:pre-line/.test(html), 'وخانة الخطأ بتعرض السطور تحت بعض');
ok(/window\.advDiag = function/.test(app), 'و`advDiag(\'الاسم\')` من الكونسول للمالك');

console.log('📅 4ج) v622 — يوم بداية شهر السلف (إعداد المالك)');
const CFG7 = { maxPerMonth:3000, openDay:0, closeDay:0, cycleStartDay:7 };
const at = (d) => new Date(Date.UTC(2026, 8, d, 9, 0, 0));
ok(ctx.advCycleKey(at(6), 0, 0, 7) === '2026-08' && ctx.advCycleKey(at(7), 0, 0, 7) === '2026-09', 'بداية 7: يوم 6 = أغسطس · يوم 7 = سبتمبر');
ok(ctx.advCycleKey(new Date(Date.UTC(2026, 0, 3, 9)), 0, 0, 7) === '2025-12', 'أول يناير بيرجع لديسمبر السنة اللي فاتت');
ok(ctx.advCycleKey(at(2), 0, 0, 1) === '2026-09', 'بداية 1 = الشهر التقويمي');
ok(ctx.advCycleKey(at(8), 12, 6, 10) === '2026-08', 'يوم البداية بيكسب على حسبة الفتح/القفل القديمة');
ok(ctx.advCycleKey(at(8), 12, 6, 0) === '2026-09' && ctx.advCycleKey(at(5), 12, 6, 0) === '2026-08', 'من غير إعداد = السلوك القديم بالظبط');
const habiba = [cash(200, { date:'2026-09-02' }), cash(220, { date:'2026-09-05', manual:true }), cash(1300, { date:'2026-09-05', manual:true }),
                cash(100, { date:'2026-09-05', manual:true }), cash(1000, { date:'2026-09-13' })];
r = ctx.advCheck(CFG7, habiba, 'e1', 200, at(23));
ok(r.ok === true && r.used === 1000, '⭐ حالة حبيبة: سبتمبر فيه 1000 بس ← سلفة 200 تعدّي (كانت: «خلص — محسوب 3320»)' + JSON.stringify(r));
r = ctx.advCheck(CFG7, habiba, 'e1', 2100, at(23));
ok(r.ok === false && r.left === 2000, 'والسقف لسه شغال: 2100 فوق الـ2000 الباقيين = مرفوض');
ok(ctx.advMonthBreakdown(habiba, 'e1', '2026-08', 0, 0, 7).total === 1820, 'وسلف 2 و5 سبتمبر في شهر أغسطس (1820)');
ok(!/شهر غلط/.test(ctx.advLimitMessage(ctx.advCheck(CFG7, habiba.concat([cash(1900, { date:'2026-09-20' })]), 'e1', 500, at(23)))), 'ومفيش تحذير «شهر غلط» تاني');
ok(/id="advCycleStartInput"/.test(html) && /cycleStartDay: sdv/.test(app) && /cycleStartDay: Number\(d\.cycleStartDay\)\|\|0/.test(app), 'فيه خانة في الإعدادات بتتحفظ وبتتقري');
ok(/const _sd = advCycleStartDay\(\);\s*\n\s*if\(_sd >= 1\) return _sd - 1;/.test(app), 'ونفس الرقم بيحدد دورة الخصم من المرتب (payDayOfMonth)');

console.log('🔌 5) التوصيل');
ok(/window\.allAdvancesAll=allAdvances;window\.allAdvances=allAdvances;/.test(app), '⭐ `window.allAdvances` بيتحدّث مع كل تحميل — كان بيفضل على القايمة القديمة، فالسقف بيتحسب على بيانات ناقصة');
ok(/: advLimitMessage\(chk\);/.test(app) && !/تعدّيت سقف الشهر/.test(app), 'شاشة طلب السلفة بتستخدم الرسالة الجديدة');
['advKeyOf', 'advMonthBreakdown', 'advLimitMessage', 'advCycleStartDay'].forEach(n => ok(new RegExp('window\\.' + n + ' = ' + n + ';').test(app), '`' + n + '` متعرّضة على window (القاعدة الذهبية §18)'));
ok(swAtLeast(fs.readFileSync(path.join(ROOT, 'sales', 'sw.js'), 'utf8'), 620) && assetAtLeast(html, 'sales-app.js', 620), 'sales ≥ v620');

console.log('\n' + (fail ? '❌' : '✅') + ' test-advance-cap: ' + pass + ' ناجح · ' + fail + ' فاشل');
if(fail) process.exitCode = 1;
