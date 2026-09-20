#!/usr/bin/env node
// ============================================================
// run.js — مشغّل الاختبارات: node tests/run.js
// بيلاقي كل ملفات test-*.js ويشغّلها بالترتيب ويطبع ملخص
// ============================================================
'use strict';
// 🕒 كل حسابات الوقت في التطبيق مثبّتة على القاهرة، وأجهزة الفروع في مصر.
//    الهارنس لازم يشتغل على نفس التوقيت وإلا نتايج الاختبارات تتغيّر حسب
//    ساعة الجهاز اللي بيشغّلها (المالك بيشغّلها من بره مصر أحيانًا).
//    ⚠️ test-timezone.js بيغيّر TZ عمدًا جوه نفسه وبيرجّعه — ده مقصود.
process.env.TZ = process.env.TZ || 'Africa/Cairo';
const fs = require('fs');
const path = require('path');

// الرفع على GitHub من المتصفح مبيمسحش ملفات — فالاختبار المتقاعد بيفضل له نسخة قديمة في الجذر.
// أي ملف له توأم في tests/_retired/ بيتخطّى، من غير ما المالك يمسح حاجة بإيده.
const _retiredDir = path.join(__dirname, '_retired');
const _retired = new Set(fs.existsSync(_retiredDir) ? fs.readdirSync(_retiredDir) : []);
// تشغيل ملف/ملفات بعينها: `node tests/run.js test-payroll-cycle.js` (الملفات اللي بتعتمد على assert بتاع الـrunner مبتشتغلش لوحدها)
const _only = process.argv.slice(2).map(a => path.basename(a));
const files = fs.readdirSync(__dirname).filter(f=>/^test-.*\.js$/.test(f) && !_retired.has(f) && (!_only.length || _only.includes(f))).sort();
let pass=0, fail=0; const failures=[]; const skipped=[];
const EXTERNAL_ASSETS = ['branch-tools/', 'cctv-gateway/INSTALL-AUTOSTART.ps1'];
const realExit = process.exit.bind(process);
process.exit = function(code){ const e = new Error('exit'); e.__exitStub = true; e.__exitCode = code || 0; throw e; };

global.assert = function(cond, msg){
  if(cond){ pass++; }
  else { fail++; failures.push(msg); console.error('  ❌', msg); }
};
global.assertEq = function(actual, expected, msg){
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if(ok){ pass++; }
  else { fail++; const m = `${msg} — expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`; failures.push(m); console.error('  ❌', m); }
};

console.log(`🧪 تشغيل ${files.length} ملف اختبار...\n`);
for(const f of files){
  const before = fail; const failuresBefore = failures.length;
  process.exitCode = 0;
  console.log('▶ ' + f);
  try { require(path.join(__dirname, f)); }
  catch(e){
    // ⏭️ ملفات تشغيل الفروع (سكريبتات PowerShell بتاعة الكاميرات) عايشة على أجهزة الفروع مش في الريبو.
    //    غيابها = تخطّي **معلن ومعدود**، مش فشل يغطّي على الفشل الحقيقي. القايمة ضيقة عمدًا:
    //    أي ENOENT على ملف من ملفات التطبيق نفسه لسه فشل.
    if(e && e.code === 'ENOENT' && EXTERNAL_ASSETS.some(p => String(e.path || e.message).replace(/\\/g,'/').includes(p))){
      skipped.push(f); fail = before; failures.length = failuresBefore;
      console.log('  ⏭️  تخطّي — ملف فرع مش في الريبو: ' + String(e.path || '').split('/').slice(-1)[0]);
    }
    else if(!e.__exitStub || e.__exitCode !== 0){ fail++; failures.push(`${f} crashed: ${e.message}`); console.error('  💥 crash:', e.message); }
  }
  if(process.exitCode){ fail++; failures.push(`${f} set exitCode=${process.exitCode}`); console.error('  💥 exitCode:', process.exitCode); process.exitCode = 0; }
  console.log(before===fail ? '  ✅ تمام\n' : '  ⚠️ فيه فشل فوق\n');
}
console.log('===============================');
console.log(`النتيجة: ${pass} ناجح · ${fail} فاشل` + (skipped.length ? ` · ${skipped.length} ملف متخطّى (ملفات فروع)` : ''));
if(skipped.length) console.log('المتخطّى: ' + skipped.join(' · '));
process.exit = realExit;
if(fail){ console.log('الفشل:'); failures.forEach(m=>console.log(' -', m)); realExit(1); }
realExit(0); // أي مؤقتات باقية متمنعش الخروج
