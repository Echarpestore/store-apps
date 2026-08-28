// ============================================================
// 🎯 v371 — استرجاع تحكم POS بعد Visa/الطباعة الصامتة
// المشكلة الحقيقية: نافذة البرنامج نفسها تفقد Windows focus بعد auto-finish
// في Visa؛ الشاشة تفضل ظاهرة لكن لا كتابة/ضغط حتى taskbar.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const core = fs.readFileSync(path.join(ROOT, 'pos', 'pos-core.js'), 'utf8');
const sale = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');
const sw   = fs.readFileSync(path.join(ROOT, 'pos', 'sw.js'), 'utf8');

function extractFn(s, name){
  const st = s.indexOf('function ' + name + '(');
  if(st < 0) return '';
  const op = s.indexOf('{', st);
  let d = 0;
  for(let i=op;i<s.length;i++){
    if(s[i] === '{') d++;
    else if(s[i] === '}'){ d--; if(d === 0) return s.slice(st, i+1); }
  }
  return '';
}

const reclaim = extractFn(core, 'reclaimWindowFocus');
const risk    = extractFn(core, 'markWindowFocusRisk');
assert(reclaim.length > 500, 'v371: reclaimWindowFocus موجودة وموسعة لاسترجاع Windows focus');
assert(risk.length > 150, 'v371: فترة خطر focus حوالين الطباعة/Paymob موجودة');
assert(reclaim.includes("typeof window.posShell !== 'undefined'"), 'الإنقاذ المكثف مخصوص لبرنامج Windows مش المتصفح العادي');
assert(reclaim.includes('6000'), 'فيه محاولات recovery ممتدة بعد الطباعة البطيئة');
assert(reclaim.includes('_shellBringToFront'), 'بيحاول أمر shell صريح لو النسخة بتدعمه');
assert(reclaim.includes('window.focus()'), 'fallback يرجع تركيز نافذة البرنامج');
assert(/window\.addEventListener\('blur',[\s\S]{0,500}_windowFocusRiskUntil[\s\S]{0,500}reclaimWindowFocus/.test(core),
  'لو focus ضاع أثناء فترة Visa/print يبدأ recovery تلقائي');
assert(/document\.addEventListener\('pointerdown',[\s\S]{0,600}window\.focus\(\)/.test(core),
  'أول ضغطة داخل POS تبقى recovery path من غير desktop/taskbar');

// Visa auto-finish نفسه لازم يعلّم فترة الخطر ويعمل recovery بعد دورة الحفظ.
assert(/markWindowFocusRisk\('paymob-auto-finish',[\s\S]{0,500}Promise\.resolve\(confirmPayment\(\)\)[\s\S]{0,500}reclaimWindowFocus/.test(sale),
  'Visa auto-finish مربوط باسترجاع focus بعد الحفظ والطباعة');

// الحماية لا تغيّر حالة الدفع/السلة — هي focus فقط.
assert(!/paymobReset|cardLegs|cart\s*=/.test(risk + reclaim),
  'focus recovery لا يمس Paymob أو السلة أو lifecycle الدفع');

// Regression guards للحالات الحساسة القديمة: timeout + نجاح ثم فاتورة جديدة.
assert(sale.includes('paymobPending.timedOut = true;'), 'timeout يفضل له recovery path من غير restart');
assert(sale.includes('clearCardSaleCompleteState(); paymobReset();'), 'بعد نجاح البيع حالة الكارت تتنضف قبل المعاملة الجديدة');
assert(sale.includes('goToSale();'), 'بعد الحفظ يبدأ بيع جديد طبيعي');

assert(/store-apps-shell-v371/.test(sw), 'Service Worker اتزوّد لـv371');

console.log('PASS test-visa-focus-recovery-v371');
