#!/usr/bin/env node
// v766 — الكاشير ميطلبش الإيميل والباسورد أبدًا لو الجهاز عنده دخول فرع محفوظ؛ وصفحات الصور مبتمسحش دخول الموظف
'use strict';
const fs = require('fs'), path = require('path'); const ROOT = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(ROOT,'pos','pos-core.js'),'utf8');
let pass = 0, fail = 0; const ok = (c, m)=>{ if(c){ pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
ok(/try\{ if\(currentBranch && localStorage\.getItem\('pos_branch_login'\)\) posQuietSetup\(true\); \}catch\(e\)\{\}/.test(core), 'أول ما الصفحة تفتح: فرع + دخول محفوظ = «بيدخّل الفرع…» بس (من غير الفورم)');
ok(/#branchSetupScreen\.pos-auto \.pin-box > \*:not\(#branchSetupAuto\):not\(\.pos-auto-title\)\{display:none!important\}/.test(core), 'الفورم (الفرع/الإيميل/الباسورد) مخفي في الوضع الهادي');
ok(/if\(currentBranch && getBranchLogin\(\)\) posQuietSetup\(true\);/.test(core), 'لو الدخول ضاع وسط الشغل: نفس الوضع الهادي');
ok((core.match(/posQuietSetup\(false\); _posAutoStatus\('🔑 باسورد حساب الفرع اتغيّر/g)||[]).length === 2 && /if\(!getBranchLogin\(\)\)\{ posQuietSetup\(false\);/.test(core), 'سلبي: الفورم بيظهر بس لو مفيش دخول محفوظ أو الباسورد اتغيّر فعلًا');
ok(/if\(u && !u\.isAnonymous\)\{\n      posQuietSetup\(false\);/.test(core), 'أول ما الدخول يرجع: على شاشة اختيار الموظف');
for(const f of ['photo.html', 'tryon/photo.html']){ const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  ok(/onAuthStateChanged\(function\(u\)\{ try\{ _u0\(\); \}catch\(e\)\{\} if\(!u\) firebase\.auth\(\)\.signInAnonymously\(\)/.test(s) && !/\n  try\{ firebase\.auth\(\)\.signInAnonymously\(\)\.catch/.test(s), f + ': الدخول المجهول بس لو مفيش دخول محفوظ (مايمسحش دخول الكاشير)'); }
const at = fs.readFileSync(path.join(ROOT,'atelier','atelier.js'),'utf8');
ok(/if \(u\) \{ fin\(\); return; \} if \(_first\) \{ _first = false; fb\.auth\(\)\.signInAnonymously\(\)/.test(at), 'atelier: نفس الحماية');
console.log('\n  ' + pass + ' ناجح · ' + fail + ' فاشل'); if(fail) process.exitCode = 1;
