#!/usr/bin/env node
// ============================================================
// Office v12 — 👆 الفتح بالبصمة / Face ID (WebAuthn) + 🎁 الاستبدال: اليدوي بس هو الحالة
// ============================================================
'use strict';
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m){ if(c){ pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

// ---------- ثابت (من غير متصفح) ----------
const O2 = fs.readFileSync(path.join(ROOT,'office2','office2.js'),'utf8');
const HTML = fs.readFileSync(path.join(ROOT,'Office','index.html'),'utf8');
const POS = fs.readFileSync(path.join(ROOT,'pos','pos-sale.js'),'utf8');
ok(/const BIO_KEY = 'office_bio_cred'/.test(O2), 'نفس مفتاح Office القديم — البصمة المربوطة قبل كده تشتغل على طول');
ok(/authenticatorAttachment: 'platform'/.test(O2) && /userVerification: 'required'/.test(O2), 'بصمة/وش الجهاز نفسه مع تحقق فعلي');
ok(/r\.h !== gateHash/.test(O2), 'لو كود المالك اتغيّر البصمة بتبطل');
ok(/id="gBio"/.test(HTML) && /Face ID/.test(HTML), 'زرار Face ID / البصمة في البوابة');
ok(/id="gateWait"/.test(HTML) && /<div id="gateLogin" style="display:none">/.test(HTML), 'v13 سلبي: شاشة الإيميل والباسورد مش بتظهر وهو لسه بيتأكد من الدخول');
ok(/redeemSource: 'manual'/.test(POS) && /redeemSource: 'app'/.test(POS) && /redeemSource: \(pendingRedemption \? \(pendingRedemption\.source \|\| 'manual'\) : null\)/.test(POS), 'POS بيسجل مصدر الاستبدال (تطبيق / يدوي) في الفاتورة');
ok(/_logActivity\('manual_redeem'/.test(POS), 'الاستبدال اليدوي بيتسجل في سجل النشاط');
ok(/s\.redeemSource === 'manual'\) push\('redeem'/.test(O2), 'Office: الحالة بس للاستبدال اليدوي');

// ---------- متصفح ----------
const RUN = `
const { open } = require(${JSON.stringify(path.join(ROOT,'tests','_helpers','office2-page.js'))});
(async()=>{
  const out = {};
  // سيناريو ١: فيه كود مالك + بصمة مربوطة → زرار البصمة يظهر، والدوس يفتح من غير كود
  const pre = "window.__ls = { office_bio_cred: JSON.stringify({ id:'AQID', h:'HASH1', at:1 }) }; Object.defineProperty(window, 'localStorage', { value: { getItem:k=> (k in window.__ls ? window.__ls[k] : null), setItem:(k,v)=>{ window.__ls[k]=String(v); }, removeItem:k=>{ delete window.__ls[k]; } } }); Object.defineProperty(window, 'sessionStorage', { value: { _s:{}, getItem(k){ return this._s[k]||null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } } }); window.PublicKeyCredential = function(){}; window.__bioCalls = []; Object.defineProperty(navigator, 'credentials', { value: { create: async (o)=>{ window.__bioCalls.push('create'); return { rawId: new Uint8Array([9,9,9]).buffer }; }, get: async (o)=>{ window.__bioCalls.push('get:' + o.publicKey.userVerification); return { id:'x' }; } } });";
  let pg = await open({ pre, data: { pos_test_settings: [ { id:'office_gate', hash:'HASH1' }, { id:'advances_cfg', closeDay:6, openDay:12 } ] } });
  await pg.p.waitForTimeout(400);   // v13: البصمة بتتطلب لوحدها من غير دوس
  out.appShown = await pg.p.evaluate(()=> document.getElementById('app').style.display !== 'none' && document.getElementById('gate').style.display === 'none');
  out.calls = await pg.p.evaluate(()=> window.__bioCalls); out.cachedHash = await pg.p.evaluate(()=> window.__ls.office_gate_hash_v1);
  out.more = await pg.go('more');
  out.errs1 = pg.errs; await pg.close();
  // سيناريو ٢: الكود اتغيّر بعد الربط → البصمة تبطل وتتشال
  pg = await open({ pre, data: { pos_test_settings: [ { id:'office_gate', hash:'HASH2' } ] } });
  out.bioHidden2 = await pg.p.evaluate(()=> document.getElementById('gBio').style.display === 'none');
  out.removed2 = await pg.p.evaluate(()=> !('office_bio_cred' in window.__ls));
  await pg.close();
  // سيناريو ٣: مفيش بصمة → فعّل من «المزيد»
  const pre3 = pre.replace("office_bio_cred: JSON.stringify({ id:'AQID', h:'HASH1', at:1 })", "x:1").replace("window.__ls = {", "window.__ls = {").replace("Object.defineProperty(window, 'sessionStorage', { value: { _s:{},", "Object.defineProperty(window, 'sessionStorage', { value: { _s:{ office2_gate_sess: JSON.stringify({ h:'HASH1', exp: 9e15 }) },");
  pg = await open({ pre: pre3, data: { pos_test_settings: [ { id:'office_gate', hash:'HASH1' } ] } });
  out.more3 = await pg.go('more');
  await pg.call(()=> O2.bioEnroll(), 300);
  out.saved3 = await pg.p.evaluate(()=> { try{ return JSON.parse(window.__ls.office_bio_cred); }catch(e){ return null; } });
  out.more3b = await pg.text();
  out.errs3 = pg.errs; await pg.close();
  process.stdout.write(JSON.stringify(out));
})().catch(e=>{ process.stdout.write(JSON.stringify({ fatal:String(e && e.stack || e) })); process.exit(0); });`;
let out;
try{ out = JSON.parse(execFileSync(process.execPath, ['-e', RUN], { encoding:'utf8', timeout:90000, maxBuffer: 20*1024*1024 })); }catch(e){ out = { fatal: String(e && e.message) }; }
if(out.fatal && /playwright|Cannot find module/i.test(out.fatal)) console.log('  ⏭ كروميوم مش متاح');
else {
  ok(!out.fatal, 'الصفحة اشتغلت ' + (out.fatal||''));
  ok(out.appShown, 'v13: Face ID / البصمة اتطلبت لوحدها وفتحت البرنامج من غير دوس ولا كود');
  ok(out.cachedHash === 'HASH1', 'v13: بصمة الكود اتخزنت على الجهاز — المرة الجاية البوابة مش هتستنى Firestore');
  ok(JSON.stringify(out.calls) === '["get:required"]', 'اتطلب تحقق فعلي (userVerification required) — مرة واحدة');
  ok(/👆 الدخول بالبصمة \/ Face ID\n?مفعّل على الجهاز ده/.test(out.more||''), '«المزيد»: البصمة مفعّلة على الجهاز ده (وتتشال منه)');
  ok(out.bioHidden2 && out.removed2, 'سلبي: الكود اتغيّر → البصمة اتشالت وزرارها مش ظاهر');
  ok(/فعّل ›/.test(out.more3||''), '«المزيد»: زرار تفعيل البصمة لو مش مربوطة');
  ok(out.saved3 && out.saved3.id === 'CQkJ' && out.saved3.h === 'HASH1', 'التفعيل بيحفظ معرّف البصمة وبصمة الكود الحالي');
  ok(/مفعّل/.test(out.more3b||''), 'بعد التفعيل بقت مفعّلة');
  ok(!(out.errs1||[]).length && !(out.errs3||[]).length, 'مفيش أخطاء JS ' + JSON.stringify((out.errs1||[]).concat(out.errs3||[])).slice(0,200));
}
console.log('\n  ' + pass + ' ناجح · ' + fail + ' فاشل');
if(fail) process.exitCode = 1;
