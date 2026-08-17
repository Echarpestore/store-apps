// ============================================================
// 🧪 test-css-comments.js — حارس تعليقات الـCSS
// ------------------------------------------------------------
// 🔴 الباج اللي وُلد منه الاختبار ده: `*/ */` (علامة قفل زيادة) في
//    كومنت قبل `.cart-fab` مباشرة. النتيجة: المتصفح بلع القاعدة
//    كاملة، فالزرار طلع مربع رمادي من غير خلفية ولا شكل — **من غير
//    أي خطأ في الكونسول ولا فشل في أي اختبار**. اتصرف فيه وقت طويل
//    قبل ما يتلقى بالـDevTools.
//
// الفحص: كل بلوك <style> لازم تكون علامات /* و*/ متوازنة، ومفيش
// علامة قفل يتيمة (*/ من غير /* مفتوحة قبلها).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const FILES = [
  'loyalty/index.html',
  'glow/index.html',
  'index.html',
  'tryon/photo.html',
  'tryon/index.html',
  'Office/index.html',
  'pos/index.html',
  'sales/index.html'
];

function checkCss(css, label) {
  let depth = 0;
  const stray = [];
  for (let i = 0; i < css.length - 1; i++) {
    if (css[i] === '/' && css[i + 1] === '*') { depth++; i++; continue; }
    if (css[i] === '*' && css[i + 1] === '/') {
      if (depth === 0) stray.push(css.slice(0, i).split('\n').length);
      else depth--;
      i++;
      continue;
    }
  }
  // 🔴 علامة قفل يتيمة = قاعدة كاملة هتتبلع بصمت
  assert(stray.length === 0,
    `${label}: 🔴 علامة قفل تعليق يتيمة (*/ زيادة) في السطر ${stray.join(', ')} — بتبلع القاعدة اللي بعدها بصمت`);
  // كومنت مفتوح من غير قفل = باقي الملف كله هيتبلع
  assert(depth === 0,
    `${label}: 🔴 كومنت CSS مفتوح ومقفلش (${depth}) — باقي الاستايل كله بيتبلع`);
}

FILES.forEach(function (rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return;   // مش كل الملفات موجودة في كل الفروع
  const H = fs.readFileSync(p, 'utf8');
  const blocks = [...H.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];
  blocks.forEach(function (m, i) {
    checkCss(m[1], `${rel} <style> #${i}`);
  });
});

// ---------- فحص إضافي: القواعد الحرجة موجودة فعليًا بعد أي كومنت ----------
// (لو كومنت مكسور بلعها، الفحص ده بيقع كمان — طبقة تانية للأمان)
[['loyalty/index.html', 'loyalty'], ['glow/index.html', 'glow']].forEach(function (t) {
  const p = path.join(ROOT, t[0]);
  if (!fs.existsSync(p)) { assert(false, t[0] + ' لازم يكون موجود'); return; }
  const H = fs.readFileSync(p, 'utf8');
  assert(/\.cart-fab\{[^}]*border-radius:50%/.test(H),
    t[1] + ': قاعدة .cart-fab موجودة وفيها شكل الدايرة (مش مبلوعة بكومنت)');
  assert(/\.cart-fab\{[^}]*background:linear-gradient/.test(H),
    t[1] + ': .cart-fab فيها الخلفية المتدرجة');
});
