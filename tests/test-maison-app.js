// ============================================================
// 🧪 test-maison-app.js — التصميم الجديد لتطبيق إيشارب (10-10-2026)
//   قرار المالك: بينك + لوجو أسود · الكارت بينك في كل المستويات (المستوى = حافة معدن بس)
//   · الاستبدال يظهر تحت الكارت لما يلف · المميزات تظهر لما تدوسي على المستوى بس
// ============================================================
'use strict';
const fs = require('fs'), path = require('path');
const L = fs.readFileSync(path.join(__dirname, '..', 'loyalty', 'index.html'), 'utf8');
const rc = L.slice(L.indexOf('function renderCard(){'), L.indexOf('function renderCard(){') + 9000);
assert(/id="maisonCss"/.test(L) && /--card-grad:linear-gradient\(135deg,#EDB9C9/.test(L), 'ألوان البينك الجديدة');
assert(/class="mx-logo"/.test(rc) && !/<img src="'\+logoSrc\+'" alt="">/.test(rc), 'اللوجو أسود (ماسك) مش الصورة البيضا');
assert(/Tiers\.enabled\(loyaltyCfg\)\) mxTier = /.test(rc) && /\(mxTier \? '<span class="mx-edge"><\/span>' : ''\)/.test(rc), 'الحافة المعدن بس لو المستويات مفتوحة');
assert(!/data-tier="silver"\]\{[^}]*--card-grad/.test(L), 'المستوى مش بيغيّر لون الكارت');
assert(!/Tiers\.sectionHtml\(/.test(L), 'مفيش كارت مستوى تاني (القديم) في التطبيق');
assert(/mxPerkSel = \(mxPerkSel === t\) \? null : t/.test(L) && /if\(mxPerkSel\)\{/.test(L), 'المميزات بتظهر لما تدوسي على المستوى بس');
const iCash = rc.indexOf('show-cashier'), iRed = rc.indexOf('id="mxRedeem"'), iStories = rc.indexOf('StoriesApp.storiesHtml');
assert(iCash > 0 && iRed > iCash && iRed < iStories, 'الاستبدال تحت الكارت على طول');
assert(/r\.classList\.toggle\('open', f\.classList\.contains\('flipped'\)/.test(L), 'الاستبدال بيفتح مع لفّة الكارت');
assert(/pendingRedeem\.points>0\)\) \? ' open'/.test(rc), 'طلب استبدال معلّق = ظاهر دايمًا');
assert(/id="mxSplash"/.test(L) && /sp\.classList\.add\('gone'\)/.test(L) && /removeChild\(sp\)/.test(L), 'الافتتاحية بتتشال بعد ما تخلص (مش بتقفل التطبيق)');
