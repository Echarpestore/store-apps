#!/usr/bin/env node
// ============================================================
// TIERS-v1 — مستويات العميلة: المنطق الخالص + الكتابة الشهرية في POS + الإخفاء لحد الإطلاق
// ============================================================
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; } else { fail++; console.error('  ❌ ' + m); } };
const T = require(path.join(ROOT, 'pos', 'tiers-core.js'));
const NOW = Date.UTC(2026, 9, 9, 12);   // 9 أكتوبر 2026

// ---- الشهور
ok(T.monthKey(NOW) === '2026-10', 'مفتاح الشهر بتوقيت القاهرة 2026-10');
ok(T.monthKey(Date.UTC(2026, 0, 31, 22, 30)) === '2026-02', 'آخر يناير 22:30 UTC = 1 فبراير القاهرة');
const keys = T.monthKeys(NOW, 12);
ok(keys.length === 12 && keys[0] === '2026-10' && keys[11] === '2025-11', 'نافذة 12 شهر من 2025-11 لـ2026-10');
// ---- المجموع في النافذة
const map = { '2026-10': 10, '2026-05': 20, '2025-11': 30, '2025-10': 999, '2024-01': 500 };
ok(T.pointsInWindow(map, NOW, 12) === 60, 'بيجمع 12 شهر بس (2025-10 برّه)');
ok(T.pointsInWindow(null, NOW, 12) === 0 && T.pointsInWindow({ '2026-10': -5 }, NOW, 12) === 0, 'سلبي: فاضي/سالب = صفر');
ok(T.pointsFor({ tierPts_glow: { '2026-10': 70 }, tierPts_echarpe: { '2026-10': 5 } }, 'glow', NOW, {}) === 70, 'نقط Glow منفصلة عن echarpe');
ok(T.fieldFor('glow') === 'tierPts_glow' && T.fieldFor('echarpe') === 'tierPts_echarpe' && T.fieldFor('x') === 'tierPts_echarpe', 'اسم الحقل لكل براند');
// ---- المستويات (قرار المالك: برونز الكل · 60 · 120 · 200)
ok(T.tierFor(0) === 'bronze' && T.tierFor(59) === 'bronze' && T.tierFor(60) === 'silver' && T.tierFor(119) === 'silver' && T.tierFor(120) === 'gold' && T.tierFor(200) === 'platinum' && T.tierFor(9999) === 'platinum', 'الحدود الافتراضية 60/120/200');
ok(T.tierFor(60, { silver: 100 }) === 'bronze' && T.tierFor(100, { silver: 100 }) === 'silver', 'الحدود من الإعدادات');
const c2 = T.cfgOf({ silver: 100, gold: 50, platinum: 10 });
ok(c2.silver === 100 && c2.gold === 101 && c2.platinum === 102, 'سلبي: حدود غير تصاعدية بتتصلّح');
ok(T.cfgOf({}).enabled === false && T.cfgOf({ enabled: 'yes' }).enabled === false && T.cfgOf({ enabled: true }).enabled === true, 'مقفولة إلا لو enabled === true بالظبط');
ok(T.enabled({ tiers: { enabled: true } }) && !T.enabled({ tiers: { enabled: 1 } }) && !T.enabled({}) && !T.enabled(null), 'Tiers.enabled على إعدادات الولاء');
// ---- التقدّم
let p = T.progress(24);
ok(p.tier === 'bronze' && p.next === 'silver' && p.need === 36 && p.pct === 40, 'برونز 24: فاضل 36 لسيلفر، 40%');
p = T.progress(150);
ok(p.tier === 'gold' && p.next === 'platinum' && p.need === 50 && p.pct === 38, 'جولد 150: فاضل 50، 38%');
p = T.progress(262);
ok(p.tier === 'platinum' && p.next === null && p.need === 0 && p.pct === 100, 'بلاتينيوم: مفيش مستوى جاي');
ok(T.egpToNext(24, {}, 35) === 1260 && T.egpToNext(262, {}, 35) === 0, 'الجنيه الناقص = النقط × سعر النقطة');
// ---- HTML
const h = T.sectionHtml({ pts: 88, cfg: {}, brand: 'glow', pointsPerEGP: 35, since: 'عضوة من مارس 2026' });
ok(/tr-card tr-silver/.test(h) && /GLOW MEMBER/.test(h) && /فاضل لك 32 نقطة توصلي Gold/.test(h) && !/ج\.م/.test(h), 'كارت سيلفر: 88 نقطة، فاضل 32 — ومفيش ذكر لمبلغ بالجنيه (قرار المالك)');
ok(/هتفتحي في Gold/.test(h) && /tr-perk locked/.test(h) && /تقيسي في البيت/.test(h), 'مميزات الحالية + المقفولة في الجاي');
ok(!/<script/i.test(T.sectionHtml({ pts: 1, cfg: { perks: { bronze: [{ icon: '<script>', t: '<b>x</b>' }] } } })), 'سلبي: نصوص المميزات بتتهرّب');
ok(/tr-chip tr-platinum/.test(T.chipHtml('platinum')) && /tr-bronze/.test(T.chipHtml('zzz')), 'الشارة');
// ---- POS: الكتابة الشهرية + الشارة بس لو مفعّلة
const sale = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');
ok(/custUpdate\[Tiers\.fieldFor\(pf === 'points_glow' \? 'glow' : 'echarpe'\) \+ '\.' \+ Tiers\.monthKey\(Date\.now\(\)\)\] = firebase\.firestore\.FieldValue\.increment\(_tierDelta\)/.test(sale), 'POS بيزوّد tierPts_<brand>.<شهر> مع كل فاتورة');
ok(/const _tierDelta = _earnedPart - _retPointsDeduct - _unlinkedDeduct;/.test(sale), 'الدلتا = المكتسب − المرتجع (من غير الاستبدال)');
ok(/Tiers\.enabled\(loyaltyRedemptionConfig\) && window\._custDocForTier/.test(sale), 'الشارة في POS مشروطة بالتفعيل');
// ---- التطبيقات: القسم مشروط بالتفعيل
['glow/index.html', 'loyalty/index.html'].forEach(f => {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  ok(/tiers-core\.js\?v=1/.test(s) && /tiersSectionHtml\(\)\+\n\s*'<div class="progress-wrap">'\+/.test(s) && /!Tiers\.enabled\(loyaltyCfg\)\) return ''/.test(s), f + ': القسم موجود ومشروط بالتفعيل');
});
ok(/'glow', Date\.now\(\), loyaltyCfg\.tiers/.test(fs.readFileSync(path.join(ROOT, 'glow/index.html'), 'utf8')) && /'echarpe', Date\.now\(\), loyaltyCfg\.tiers/.test(fs.readFileSync(path.join(ROOT, 'loyalty/index.html'), 'utf8')), 'كل تطبيق بيقرا نقط برانده');
// ---- loyalty.js: التجميع من الفواتير
const loy = fs.readFileSync(path.join(ROOT, 'pos', 'loyalty.js'), 'utf8');
const ctx = { Tiers: T, GLOW_BRANCHES: ['Glow'], window: {} };
vm.runInNewContext(loy.slice(loy.indexOf('function tiersAggregate('), loy.indexOf('window.tiersAggregate')), ctx);
const ts = ms => ({ toMillis: () => ms });
const docs = [
  { id: 'a', data: () => ({ customerPhone: '0100', loyaltyPointsEarned: 10, branch: 'Glow', createdAt: ts(NOW) }) },
  { id: 'a', data: () => ({ customerPhone: '0100', loyaltyPointsEarned: 10, branch: 'Glow', createdAt: ts(NOW) }) },   // مكرر (جه من الاستعلامين)
  { id: 'b', data: () => ({ customerPhone: '0100', loyaltyPointsEarned: -3, branch: 'Glow', createdAtMs: NOW }) },   // مرتجع أوفلاين
  { id: 'c', data: () => ({ customerPhone: '0100', loyaltyPointsEarned: 7, branch: 'echarpe El Rehab', createdAt: ts(Date.UTC(2026, 4, 2)) }) },
  { id: 'd', data: () => ({ customerPhone: '0100', loyaltyPointsEarned: 99, branch: 'Glow', createdAt: ts(Date.UTC(2024, 1, 1)) }) },   // قديم برّه النافذة
  { id: 'e', data: () => ({ customerPhone: '', loyaltyPointsEarned: 9, branch: 'Glow', createdAt: ts(NOW) }) },   // من غير عميلة
];
const agg = ctx.tiersAggregate(docs, NOW, 12);
ok(agg['0100'] && agg['0100'].tierPts_glow['2026-10'] === 7 && agg['0100'].tierPts_echarpe['2026-05'] === 7 && !agg['0100'].tierPts_glow['2024-02'] && Object.keys(agg).length === 1, 'التجميع: بدون تكرار، المرتجع بيخصم، البراند من الفرع، القديم برّه، بدون رقم بيتجاهل');
ok(/where\('createdAtMs', '>=', from\)/.test(loy) && /where\('createdAt', '>=', firebase\.firestore\.Timestamp\.fromMillis\(from\)\)/.test(loy), 'الحساب بيقرا createdAt وcreatedAtMs (فواتير الأوفلاين)');
ok(/id="tiers_on"/.test(loy) && /config\.tiers = tiers/.test(loy) && /المستويات لازم تصاعدية/.test(loy) && /id="tiers_silver"/.test(loy), 'إعدادات التفعيل والحدود (المالك بيحدد نقط كل مرحلة)');
ok(/function tiersPerksEditorHtml/.test(loy) && /tiersPerkAdd/.test(loy) && /querySelectorAll\('#tiersPerksEditor \.tp-row/.test(loy) && !/tiers_perks_/.test(loy), 'محرّر المميزات صف بصف (إضافة/حذف) — المالك بيحدد المميزات');
// ---- النسخ
ok(/tiers-core\.js\?v=1/.test(fs.readFileSync(path.join(ROOT,'pos','index.html'),'utf8')) && /pos-shell-v763/.test(fs.readFileSync(path.join(ROOT,'pos','sw.js'),'utf8')) && /glow-loyalty-v92/.test(fs.readFileSync(path.join(ROOT,'glow','sw.js'),'utf8')) && /loyalty-shell-v707/.test(fs.readFileSync(path.join(ROOT,'loyalty','sw.js'),'utf8')), 'النسخ اترفعت');


// ---- طلب المالك 09-10: المصطلحات على الكارت إنجليزي
(function(){
  const h = T.sectionHtml({ pts: 150, cfg: {}, brand: 'echarpe', pointsPerEGP: 35, since: 'Member since Mar 2026' });
  const card = h.slice(0, h.indexOf('tr-prog'));
  ok(/<b>Gold<\/b>/.test(card) && /Current tier · Member since Mar 2026/.test(card) && /pts · last 12 months/.test(card), 'الكارت: Gold · Current tier · pts');
  ok(!/[؀-ۿ]/.test(card.replace(/ECHARPE/g, '')), 'سلبي: مفيش عربي جوه الكارت');
  ok(/<b class="me">🥇 Gold<\/b>/.test(h) && /توصلي Platinum/.test(h), 'السلم وسطر التقدم بأسماء إنجليزي');
  ok(/💎 Platinum/.test(T.chipHtml('platinum')), 'شارة POS إنجليزي');
})();
console.log(`  ${pass} ناجح · ${fail} فاشل`); if(fail) process.exitCode = 1;
