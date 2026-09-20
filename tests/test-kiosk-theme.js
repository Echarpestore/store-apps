#!/usr/bin/env node
// ============================================================
// test-kiosk-theme.js (feedback v696) — هوية شاشة التقييم
// يتشغّل لوحده: node tests/test-kiosk-theme.js
// ============================================================
'use strict';
require('./helpers/swv');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'feedback', 'index.html'), 'utf8');
const cssRaw = fs.readFileSync(path.join(ROOT, 'feedback', 'kiosk-theme.css'), 'utf8');
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');            // §0: من غير التعليقات
let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; } else { fail++; console.error('  ❌ ' + m); } };
const block = sel => { const i = css.indexOf(sel + '{'); if(i < 0) return null; return css.slice(i + sel.length + 1, css.indexOf('}', i)); };

console.log('\n🔌 1) التوصيل — من غير ما نكسر الكشك');
ok(assetAtLeast(html, 'kiosk-theme.css', 697), 'ملف الهوية متحمّل');
ok(html.indexOf('kiosk-theme.css') > html.indexOf('</style>'), 'وبعد الـstyle الأصلي (عشان يغلبه)');
const btns = [...html.matchAll(/<button class="face-btn b(\d)" data-r="(\d)">/g)];
ok(btns.length === 4 && btns.every((m, i) => m[1] === String(i + 1) && m[2] === String(i + 1)), 'الأربع زراير بنفس `class` و`data-r` وبنفس الترتيب — كود التقييم مربوط بيهم');
ok(/querySelectorAll\('\.face-btn'\)[\s\S]{0,120}submitRating\(parseInt\(btn\.dataset\.r\)\)/.test(html), 'و`submitRating` لسه مربوط');
const faces = [...html.matchAll(/<button class="face-btn b\d"[^>]*>\s*(<svg[\s\S]*?<\/svg>)/g)].map(m => m[1]);
ok(faces.length === 4 && faces.every(f => /stroke="currentColor"/.test(f) && !/#0b0c0f/i.test(f)), 'الوشوش مرسومة بـcurrentColor (مفيش أسود ثابت على خلفية غامقة)');
ok(new Set(faces).size === 4, 'وأربع وشوش مختلفة فعلًا');

console.log('⚖️ 2) الحياد — الأربع زراير بنفس الوزن (ده جهاز قياس)');
[1, 2, 3, 4].forEach(n => {
  const b = block('.face-btn.b' + n);
  const props = (b || '').split(';').map(x => x.split(':')[0].trim()).filter(Boolean);
  const bad = props.filter(p => !/^--f[abs]$/.test(p) && p !== 'color');
  ok(!!b && bad.length === 0, 'الزرار ' + n + ' بيفرق عن إخواته في **اللون بس** — لقيت: ' + bad.join(','));
});
ok(!/\.face-btn\.b\d[^{]*\{[^}]*(opacity|filter|transform|font-size|width|height|aspect-ratio)\s*:/.test(css), 'مفيش زرار أصغر/أبهت/أكبر من التاني');
const delays = [...css.matchAll(/\.face-btn\.b(\d)::after\{animation-delay:([\d.]+)s\}/g)].map(m => +m[2]);
ok(delays.length === 4 && delays.every((d, i) => i === 0 || d > delays[i - 1]), 'اللمعة بتعدّي على الأربعة بالدور (مش على «عجبني» بس)');

console.log('📐 2ب) مقاسات جوّه الزرار = نسبة من الزرار (باج v696: حلقة بيضاوية ومقصوصة على الموبايل)');
const svgRule = block('.face-btn svg') || '';
ok(/width:\d+%/.test(svgRule) && /height:auto/.test(svgRule) && /aspect-ratio:1\/1/.test(svgRule), 'دايرة الوش: عرض بالـ٪ + height:auto + aspect-ratio 1/1 = دايرة حقيقية على أي مقاس');
ok(/flex:none/.test(svgRule), 'ومبتتضغطش جوّه الـflex (ده اللي خلّاها بيضاوية)');
ok(!/(width|height)\s*:[^;]*\d(vh|vw)/.test(svgRule), 'ومفيش vh/vw في مقاس الدايرة — الكارت بالـvw والدايرة كانت بالـvh فاتلخبطوا');
const btnRule = block('.face-btn') || '';
ok(/padding:\d+% \d+% \d+%/.test(btnRule) && /gap:\d+%/.test(btnRule), 'والحشو والمسافة جوّه الكارت بالـ٪ برضه');
const port = css.slice(css.indexOf('@media (orientation:portrait){'));
ok(/\.face-btn\{[^}]*font-size:clamp\([^)]*vw/.test(port), 'بالطول: حجم الخط تابع لعرض الشاشة (زي الكارت) مش ارتفاعها');

console.log('🔒 3) قفل التقييم المكرر لسه شغال');
ok(/isolation:isolate/.test(block('#kiosk') || ''), '`#kiosk` عامل stacking context — وإلا z-index الزراير يطلع فوق طبقة الشكر');
ok(/#thanks\{z-index:5;/.test(css), 'وطبقة الشكر فوق الزراير (هي اللي بتمنع الدوسة التانية)');
ok(!/#kiosk\s*>\s*\*\s*\{[^}]*position/.test(css), 'مفيش `#kiosk > *{position}` (كان بيكسر مكان الترس واسم الفرع)');
ok(!/#thanks[^{]*\{[^}]*pointer-events/.test(css), 'والهوية مبتلمسش `pointer-events` بتاعة القفل');

console.log('🏷️ 4) هوية الفرع');
const posList = fs.readFileSync(path.join(ROOT, 'pos', 'pos-core.js'), 'utf8').match(/const GLOW_BRANCHES = (\[[^\]]*\]);/)[1];
ok(html.includes('var GLOW_BRANCHES = ' + posList + ';'), 'نفس قايمة فروع Glow بتاعة POS: ' + posList);
ok(/html\[data-brand="glow"\]\{[^}]*--k-bg3:#F4B9C6/.test(css), 'Glow ليه ألوانه');
ok(/localStorage\.setItem\('feedback_branch', val\);\s*\n\s*if\(window\.applyKioskBrand\) window\.applyKioskBrand\(\);/.test(html), 'اختيار الفرع على الجهاز بيغيّر الهوية فورًا');
['invite/app-icon.png', 'invite/glow-icon.png'].forEach(f => ok(fs.existsSync(path.join(ROOT, 'feedback', f)), 'الأيقونة موجودة: ' + f));
ok(/id="kioskBrandIcon"[^>]*onerror=/.test(html), 'ولو الأيقونة متحمّلتش بتختفي (مش صورة مكسورة)');

console.log('🧱 5) النطاق والحركة');
const sels = [...css.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map(m => m[2].trim()).filter(s => !/^(from|to|\d+%|[\d%,\s]+)$/.test(s));
const outside = sels.filter(s => !/(#kiosk|#thanks|\.face-btn|\.b[1-4]|\.grid|\.k-brand|#branchTag|#gear|#fsBtn|:root|html\[data-brand)/.test(s));
ok(outside.length === 0, 'الملف بيلمس شاشة التقييم بس — لقيت: ' + outside.slice(0, 4).join(' | '));
ok(!/--(bg|panel|panel2|ink|sub|line|r[1-4])\s*:/.test(css), 'ومغيّرش متغيّرات لوحة النتائج (`--bg` · `--r1`…)');
const kf = (css.match(/@keyframes \w+\{[^@]*?\}\}/g) || []).join(' ');
ok(kf.length > 0 && !/(^|[;{\s])(width|height|top|left|right|bottom|margin[\w-]*|padding[\w-]*|box-shadow|filter)\s*:/.test(kf), 'الحركة transform/opacity بس');
ok(/@media \(prefers-reduced-motion:reduce\)/.test(css) && /@media \(orientation:portrait\)/.test(css), 'تقليل الحركة + التابلت بالطول متغطّيين');
ok(swAtLeast(fs.readFileSync(path.join(ROOT, 'feedback', 'sw.js'), 'utf8'), 697), 'CACHE_NAME ≥ v697');

console.log('\n' + (fail ? '❌' : '✅') + ' test-kiosk-theme: ' + pass + ' ناجح · ' + fail + ' فاشل');
if(fail) process.exitCode = 1;
