// v777 — 🤍 الجمعة البيضاء (26–29 نوفمبر 2026): بانر الفيديو على رئيسية تطبيق إيشارب + 📣 إشعار عرض لكل العميلات من Office 2
// سلوكي: بنشغّل الكود الحقيقي (بانر التطبيق · فرع الفانكشن · شاشة Office) في VM ونشوف بيعمل إيه.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

/* ---------- 1) بانر التطبيق: شغال لحد آخر الأحد بتوقيت القاهرة وبيقف لوحده ---------- */
const html = read('loyalty/index.html');
const a = html.indexOf('var WF_END'), b = html.indexOf('تبويب العروض (الخصومات السارية من الكاشير)');
assert(a > 0 && b > a, 'كود الجمعة البيضاء موجود قبل تبويب العروض');
const wfSrc = html.slice(a, html.lastIndexOf('/* ====', b));
function wfAt(ms){
  const calls = [];
  const ctx = { Date: { now: () => ms, UTC: Date.UTC }, document: { getElementById: () => null, createElement: () => { calls.push('create'); return { classList: { add(){} }, querySelector: () => ({ play(){ } }), set innerHTML(v){} }; }, body: { appendChild(){} } }, switchTab: t => calls.push('tab:' + t) };
  vm.createContext(ctx); vm.runInContext(wfSrc, ctx);
  return { html: ctx.wfBannerHtml(), on: ctx.wfOn(), ctx, calls };
}
const THU = Date.UTC(2026, 10, 26, 7, 0), SUN_LATE = Date.UTC(2026, 10, 29, 21, 59), MON = Date.UTC(2026, 10, 29, 22, 0), DEC = Date.UTC(2026, 11, 5);
assert(wfAt(THU).on && /wf26-loop\.mp4/.test(wfAt(THU).html), 'الخميس: البانر ظاهر بالفيديو');
assert(/muted/.test(wfAt(THU).html) && /playsinline/.test(wfAt(THU).html) && /loop/.test(wfAt(THU).html), 'فيديو البانر صامت وبيلف جوّه الصفحة (شرط التشغيل التلقائي على الموبايل)');
assert(/الجمعة البيضاء/.test(wfAt(THU).html) && /خصومات على كل المنتجات/.test(wfAt(THU).html) && /من الخميس للأحد/.test(wfAt(THU).html), 'كلام العرض زي ما المالك طلب');
assert(wfAt(SUN_LATE).on, 'الأحد 23:59 القاهرة: لسه شغال');
assertEq(wfAt(MON).html, '', 'الإثنين 00:00 القاهرة: البانر اختفى لوحده (سلبي)');
assertEq(wfAt(DEC).html, '', 'بعد العرض: مفيش بانر (سلبي)');
{ const r = wfAt(MON); r.ctx.wfOpen(); assert(!r.calls.includes('create'), 'بعد العرض: لينك الإشعار القديم مبيفتحش الفيديو (سلبي)'); }
assert(/wfBannerHtml\(\)\+\s*\n\s*tiersSectionHtml\(\)/.test(html), 'البانر على الرئيسية تحت الكارت على طول');
assert(/go === 'wf'\)\{[^}]*wfOpen/.test(html), 'لينك الإشعار ‎?go=wf‎ بيفتح الفيديو');
assert(/isOn\('wfOverlay','on'\)\) return 'wf'/.test(html) && /kind==='wf'[^;]*wfClose\(\)/.test(html) && /wrapOpen\('wfOpen','wf'\)/.test(html), 'زرار الرجوع بيقفل الفيديو (مش بيخرج من التطبيق)');
['wf26-loop.mp4', 'wf26.mp4', 'wf26-poster.jpg', 'wf26-full-poster.jpg'].forEach(f => assert(fs.existsSync(path.join(root, 'loyalty', f)), 'الملف موجود: loyalty/' + f));
assert(fs.statSync(path.join(root, 'loyalty', 'wf26-loop.mp4')).size < 600 * 1024, 'فيديو البانر خفيف (< 600KB) عشان الرئيسية متتقلش');
assert(fs.statSync(path.join(root, 'loyalty', 'wf26.mp4')).size < 5 * 1024 * 1024, 'الفيديو الكامل < 5MB');
const sw = read('loyalty/sw.js');
assert(+sw.match(/loyalty-shell-v(\d+)/)[1] >= 777, 'كاش التطبيق اترفع');
assert(/\.mp4\$\/i\.test\(url\.pathname\)\) return;/.test(sw), 'الفيديو بيعدّي من غير كاش الـSW (طلبات Range)');

/* ---------- 2+3) الفانكشن و Office 2 — بيتشغّلوا في عملية منفصلة (async والهارنس متزامن) ---------- */
const R = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, '_helpers', 'white-friday-run.js')], { encoding: 'utf8' }));
assert(!R.crash, 'المشغّل الفرعي اشتغل' + (R.crash ? ': ' + R.crash : ''));
const fn = read('functions/index.js');
const OKT = 'الجمعة البيضاء في إيشارب 🤍', OKB = 'الحقي عروض الجمعة البيضاء من الخميس للأحد';
assert(R.fnFound, 'فرع promo_push جوّه onCatalogUpdated قبل الكتالوج');
assertEq(R.fn.ok.sent.length, 1, 'إرسال جديد = إشعار واحد');
assertEq(R.fn.ok.sent[0], ['echarpe', OKT, OKB, 'promo', './?go=wf'], 'بيتبعت للبراند بالعنوان والكلام واللينك');
assertEq(R.fn.sameSeq.sent.length, 0, 'تعديل من غير seq جديد = مفيش إرسال (سلبي)');
assertEq(R.fn.sameDay.sent.length, 0, 'إرسال تاني في نفس اليوم = مرفوض (سلبي)');
assertEq(R.fn.nextDay.sent.length, 1, 'اليوم اللي بعده = مسموح');
assertEq(R.fn.empty.sent.length, 0, 'عنوان فاضي = مفيش إرسال (سلبي)');
assertEq(R.fn.badLink.sent[0][4], './', 'لينك برّه التطبيق بيتجاهل ويفتح الرئيسية (سلبي)');
assertEq(R.fn.badLink.sent[0][0], 'glow', 'Glow بيتبعت لعميلات Glow بس');
assertEq(R.fn.otherDoc.r, 'next', 'مستند الكتالوج بيكمّل لمساره العادي');
assertEq(R.fn.otherBrand.r, 'next', 'براند مش معروف = مش إشعار عرض (سلبي)');
assertEq(R.fn.otherBrand.sent.length, 0, 'ومبيبعتش حاجة (سلبي)');
assert(/broadcastBrand\(brand, title, body, tag, link\)/.test(fn) && (fn.match(/tag, null, link\)/g) || []).length === 2, 'broadcastBrand بيوصّل اللينك للدفعتين');

const W = R.office.ok.writes;
assertEq(W.length, 1, 'المالك وافق = كتابة واحدة');
assertEq([W[0].c, W[0].d], ['pos_test_settings', 'promo_push_echarpe'], 'بيكتب مستند إشعار إيشارب');
assertEq(W[0].data.day, '2026-11-26', 'اليوم بتوقيت القاهرة');
assert(W[0].data.seq && W[0].data.seq.inc === 1 && W[0].o.merge === true, 'seq بيزيد واحد (ده اللي بيشغّل الفانكشن)');
assert(/الجمعة البيضاء/.test(W[0].data.title) && /من الخميس للأحد/.test(W[0].data.body) && /خصومات على كل المنتجات/.test(W[0].data.body), 'الكلام الجاهز = عرض الجمعة البيضاء');
assertEq(W[0].data.link, './?go=wf', 'الدوسة بتفتح فيديو العرض');
assert(W[0].data.title.length <= 60 && W[0].data.body.length <= 180, 'الطول جوّه حدود الفانكشن');
assertEq(R.office.ok.asked, 1, 'سؤال تأكيد قبل الإرسال');
assertEq(R.office.declined.writes.length, 0, 'المالك رجع في كلامه = مفيش إرسال (سلبي)');
assertEq(R.office.sentToday.writes.length, 0, 'اتبعت النهارده خلاص = مفيش تاني (سلبي)');
assertEq(R.office.sentToday.asked, 0, 'ومن غير حتى ما يسأل');
assertEq(R.office.glow.writes.map(w => w.d), ['promo_push_glow'], 'Glow له حد يومي لوحده');
assert(/Glow/.test(R.office.glow.writes[0].data.title) && /Glow/.test(R.office.glow.writes[0].data.body) && !/إيشارب/.test(R.office.glow.writes[0].data.title + R.office.glow.writes[0].data.body), 'إشعار Glow بيتكلم عن Glow مش إيشارب (سلبي)');
assertEq(R.office.short.writes.length, 0, 'كلام فاضي/قصير = مفيش إرسال (سلبي)');
/* v778 — ستوري التطبيق مفتوحة → نفس طريق إشعار الفيديو المنشور (من غير نشر فانكشن) · طريق واحد بس في المرة */
const L = R.office.live.writes;
assertEq(L.map(w => w.d), ['stories_push_echarpe'], 'ستوري مفتوحة = بيكتب مستند إشعار الستوري بس (مش الاتنين)');
assertEq([L[0].data.kind, L[0].data.day, L[0].data.seq.inc], ['video', '2026-11-26', 1], 'بنفس شكل إشعار الفيديو اللي الفانكشن المنشورة بتفهمه');
assert(/الجمعة البيضاء/.test(L[0].data.title) && /من الخميس للأحد/.test(L[0].data.title) && L[0].data.title.length <= 200, 'العنوان والكلام في سطر واحد');
assertEq(R.office.liveStoryToday.writes.length, 0, 'ستوري اتبعت إشعارها النهارده = مفيش إشعار تاني (سلبي)');
assertEq(R.office.liveOtherBrand.writes.map(w => w.d), ['promo_push_glow'], 'Glow مقفول = الطريق الجديد لـGlow');
const off = read('Office/index.html');
assert(off.indexOf('office2/promo-push.js?v=') > off.indexOf('office2/stories.js?v='), 'Office بيحمّل promo-push بعد stories');
assert(+read('Office/sw.js').match(/echarpe-office-v(\d+)/)[1] >= 778, 'كاش Office اترفع');
