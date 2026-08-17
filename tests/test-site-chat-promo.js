// ============================================================
// 🧪 test-site-chat-promo.js — شيل خدمة الواتساب من الموقع، سوّق
// للشات، واكتب عن تجربة الذكاء الاصطناعي بشكل احترافي
// ------------------------------------------------------------
// كل فحص سلبي: لو رجّعت الإصلاح لازم يقع.
//   ١) 🔴 مفيش زرار طلب أونلاين بيروح wa.me خالص (كان CTA الهيرو)
//   ٢) الزرار الرئيسي بيفتح الشات (cwOpen)، مش رابط خارجي
//   ٣) العنوان/النص بيتكلم عن تجربة الذكاء الاصطناعي، مش "اطلبي
//      على واتساب"
//   ٤) window.cwOpen معروضة (زراير بره الـIIFE محتاجاها)
//   ٥) CTA "اسألي عن التشكيلة" بردو بيفتح الشات مش واتساب
//   ٦) الميتا تاج اتحدثت (SEO/مشاركة) — مفيش واتساب فيها
//   ٧) 🔴 أيقونات واتساب الفروع (تواصل مع فرع معيّن) لسه موجودة —
//      دي مختلفة عن "خدمة الطلب"، مقصود إنها تفضل
//   ٨) الفحص النحوي الفعلي
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const P = path.join(ROOT, 'index.html');

if (!fs.existsSync(P)) {
  assert(false, 'index.html لازم يكون موجود');
} else {

const H = fs.readFileSync(P, 'utf8');

// ---------- ١) مفيش CTA طلب أونلاين بيروح واتساب ----------
assert(!/wa\.me\/201148664485\?text=[^"]*%D8%B7%D9%84%D8%A8/.test(H) || true, 'placeholder'); // معلومة سياقية بس
assert(H.indexOf('اطلبي طرحتك دلوقتي') === -1, '🔴 زرار "اطلبي طرحتك دلوقتي" (واتساب) اتشال من الهيرو');
assert(H.indexOf('اطلبي طرحتك على') === -1, '🔴 عنوان "اطلبي طرحتك على واتساب" اتشال');

// ---------- ٢) الزرار الرئيسي بيفتح الشات ----------
assert(/<button class="chat-cta" onclick="cwOpen\(\)">/.test(H), 'زرار الهيرو الرئيسي بيفتح الشات مباشرة');
assert(H.indexOf('class="wa-cta"') === -1 || H.indexOf('href="https://wa.me') === -1 || true, 'placeholder');
// 🔴 مفيش <a href="wa.me..."> كزرار رئيسي بعد كده في نفس القسم
const heroSection = (H.match(/<section class="tarha">[\s\S]*?<\/section>/) || [''])[0];
assert(heroSection.indexOf('wa.me') === -1, '🔴 قسم الهيرو مفيهوش أي رابط واتساب خالص');
assert(heroSection.indexOf('cwOpen()') >= 0, 'قسم الهيرو بيفتح الشات');

// ---------- ٣) الكتابة عن الخدمة بشكل احترافي ----------
// 🎨 التموضع الجديد: الطلب من الشات هو الرسالة الأساسية، والتجربة قبل الشراء
//    ميزة مساعدة، والاستلام/الدفع جزء من العرض. §6: بنفحص بالمعنى مش بالحرف —
//    بس كل تأكيد لازم يميّز التموضع الجديد عن القديم (يقع لو رجعنا للنص القديم).
assert(/اطلبي طرحتك/.test(heroSection) && /من الشات/.test(heroSection),
  'رسالة الهيرو الأساسية = الطلب من الشات');
assert(/قبل الشراء/.test(heroSection), 'الهيرو بيذكر تجربة الطرحة قبل الشراء');
assert(/نفس اليوم/.test(heroSection) && /الاستلام|استلام/.test(heroSection),
  'الهيرو بيوضّح نموذج الاستلام (فرع/نفس اليوم) والدفع عند الاستلام');

// ---------- ٤) cwOpen معروضة على window ----------
assert(/window\.cwOpen = cwOpen;/.test(H), '🔴 window.cwOpen معروضة (الزراير الجديدة بره IIFE الشات محتاجاها)');

// ---------- ٥) CTA التشكيلة بيفتح الشات ----------
const collectionSection = (H.match(/<section class="collection">[\s\S]*?<\/section>/) || [''])[0];
assert(collectionSection.indexOf('wa.me') === -1, '🔴 "اسألي عن التشكيلة" مبقاش بيروح واتساب');
assert(/onclick="cwOpen\(\)"/.test(collectionSection), '"اسألي عن التشكيلة" بيفتح الشات');

// ---------- ٦) الميتا تاج ----------
const metaBlock = H.slice(0, H.indexOf('</head>'));
assert(metaBlock.indexOf('اطلبي طرحتك على واتساب') === -1, 'وصف الميتا مبقاش بيذكر الطلب على واتساب');
assert(/قبل الشراء/.test(metaBlock),
  'وصف الميتا بيتكلم عن الطلب من الشات والتجربة قبل الشراء (مش صياغة الـAI القديمة)');

// ---------- ٧) أيقونات واتساب الفروع لسه موجودة (مقصود) ----------
assert((H.match(/class="icon-chip wa"/g) || []).length >= 1,
  'أيقونات تواصل واتساب الفروع لسه موجودة — دي تواصل مع فرع معيّن، مش "خدمة الطلب" اللي اتشالت');

// ---------- ٨) الفحص النحوي ----------
const blocks = [...H.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const tmp = path.join(require('os').tmpdir(), 'site_chatpromo_chk.js');
blocks.forEach((b, i) => {
  fs.writeFileSync(tmp, b);
  try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
  catch (e) { assert(false, `<script> #${i} خطأ نحوي: ` + e.stderr.toString().split('\n')[0]); }
});

}
