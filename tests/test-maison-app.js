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
assert(/if\(mxTiersOn\(\)\) mxTier = /.test(rc) && /\(mxTier \? '<span class="mx-edge"><\/span>' : ''\)/.test(rc), 'الحافة المعدن بس لو المستويات مفتوحة');
assert(!/data-tier="silver"\]\{[^}]*--card-grad/.test(L), 'المستوى مش بيغيّر لون الكارت');
assert(!/Tiers\.sectionHtml\(/.test(L), 'مفيش كارت مستوى تاني (القديم) في التطبيق');
assert(/mxPerkSel = \(mxPerkSel === t\) \? null : t/.test(L) && /if\(mxPerkSel\)\{/.test(L), 'المميزات بتظهر لما تدوسي على المستوى بس');
const iCash = rc.indexOf('show-cashier'), iRed = rc.indexOf('id="mxRedeem"'), iStories = rc.indexOf('StoriesApp.storiesHtml');
assert(iCash > 0 && iRed > iCash && iRed < iStories, 'الاستبدال تحت الكارت على طول');
assert(/r\.classList\.toggle\('open', f\.classList\.contains\('flipped'\)/.test(L), 'الاستبدال بيفتح مع لفّة الكارت');
assert(/pendingRedeem\.points>0\)\) \? ' open'/.test(rc), 'طلب استبدال معلّق = ظاهر دايمًا');
assert(/id="mxSplash"/.test(L) && /sp\.classList\.add\('gone'\)/.test(L) && /removeChild\(sp\)/.test(L), 'الافتتاحية بتتشال بعد ما تخلص (مش بتقفل التطبيق)');
// ---- MAISON v2: نفس شكل صفحة التجربة + رقم التجربة
assert(!/progress-wrap|info-grid|goal-wrap|pts-worth/.test(rc), 'v2: الكارت نظيف — مفيش بوكسات الشرح ولا شريط الهدف');
assert(/class="mx-pts"/.test(rc) && /class="mx-meta"/.test(rc) && /عضوة من/.test(rc), 'v2: الرقم الكبير + الاسم وتاريخ العضوية');
assert(/\.topbar \.badge\{display:none\}/.test(L) && /'صباح الخير'/.test(L), 'v2: الهيدر «صباح الخير / الاسم» من غير مربع اللوجو');
assert(/class="mx-send"/.test(L) && /<b>طلبك وصل<\/b>/.test(L), 'v2: الاستبدال بشكل التجربة (ابعتي الطلب / طلبك وصل)');
assert(/Tiers\.enabled\(loyaltyCfg\) \|\| \(currentCustomer && currentCustomer\.mxPreview === true\)/.test(L), 'v2: المستويات بتظهر لو مفتوحة أو لرقم التجربة بس');
assert(/class="mx-ladder"/.test(L) && /onclick="mxPerk\(/.test(L), 'v2: سلّم المستويات والمميزات بالضغط');
assert(/StoriesApp\.init\(db, CATALOG_BRAND, function\(\)\{[^}]*\}, currentCustomer\.mxPreview === true\)/.test(rc), 'v2: علامة التجربة بتتبعت للستوري');
const SA = fs.readFileSync(path.join(__dirname, '..', 'pos', 'stories-app.js'), 'utf8');
assert(/S\.live = c\['live_' \+ S\.brand\] === true \|\| S\.preview;/.test(SA) && /S\.preview = preview === true;/.test(SA), 'v2: الستوري مفتوحة لرقم التجربة بس');
const O2S = fs.readFileSync(path.join(__dirname, '..', 'office2', 'stories.js'), 'utf8');
assert(/update\(\{ mxPreview: true \}\)/.test(O2S) && /preview: savePreview/.test(O2S) && !/stories_cfg'\)\.set\(\{ preview_phones/.test(O2S), 'v2: Office 2 بيعلّم مستند العميلة (مش مستند الإعدادات اللي بيرفض)');

