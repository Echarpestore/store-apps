#!/usr/bin/env node
// ============================================================
// test-credit-otp.js — كود تأكيد صرف الرصيد (السيرفر)
// سلوك فعلي على موديول السيرفر الحقيقي بـFirestore وهمي. يتشغّل لوحده: node tests/test-credit-otp.js
// ============================================================
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const OTP = require(path.join(ROOT, 'functions', 'creditOtp.js'));
const { makeDb } = require('./helpers/fake-firestore');
const gift = fs.readFileSync(path.join(ROOT, 'functions', 'giftCredit.js'), 'utf8');
const rules = fs.readFileSync(path.join(ROOT, 'security', 'firestore-phase2.rules'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; } else { fail++; console.error('  ❌ ' + m); } };
const throwsCode = async (fn, code) => { try{ await fn(); return false; }catch(e){ return e instanceof OTP.OtpError && e.code === code; } };
const P = '01011111111', T0 = 1758450000000, KEY = 'k'.repeat(40);
const cust = (o) => ({ ['pos_test_customers/' + P]: Object.assign({ name:'منى', credit:325, credit_glow:60, loyaltyPin:'4321' }, o || {}) });

(async function(){
  console.log('\n🔐 1) طلب الكود');
  let db = makeDb(cust());
  let r = await OTP.request(db, { phone:P, amount:300, brand:'echarpe', branch:'echarpe El Rehab', by:'staff1' }, T0);
  ok(r.ok === true && /^\d{4}$/.test(r.code) && r.expAt === T0 + 3 * 60000, 'كود 4 أرقام صالح 3 دقايق');
  ok(db._store['credit_otp/' + P].code === r.code && db._store['credit_otp/' + P].amount === 300, 'متخزّن في `credit_otp` (سيرفر بس)');
  const cdoc = db._store['pos_test_customers/' + P];
  ok(cdoc.creditOtpAt === T0 && JSON.stringify(cdoc).indexOf(r.code) < 0, '⛔⭐ مستند العميلة (اللي POS بيقراه) فيه **التوقيت بس** — الكود مش فيه');
  // v718: القاعدتين اتكتبوا صراحة `if false` (توثيق) — المهم إن **مفيش** قاعدة بتفتحهم
  ok(/match \/\{document=\*\*\} \{\s*\n\s*allow read, write: if false;/.test(rules) && !/match \/credit_(otp|keys)\/\{id\}\s*\{(?! allow read, write: if false; \})/.test(rules), 'والرولز: `credit_otp`/`credit_keys` واقعين تحت الرفض الافتراضي (مفيش قاعدة بتفتحهم)');
  db = makeDb(cust({ loyaltyPin:undefined }));
  delete db._store['pos_test_customers/' + P].loyaltyPin;
  r = await OTP.request(db, { phone:P, amount:100, brand:'echarpe' }, T0);
  ok(r.ok === false && r.reason === 'no_app' && !db._store['credit_otp/' + P], 'قرار المالك (ب): معندهاش التطبيق = `no_app` ومفيش كود بيتعمل');
  db = makeDb(cust({ loyaltyPin:undefined, loyaltyCode:'ECH 1234 5678' })); delete db._store['pos_test_customers/' + P].loyaltyPin;
  ok((await OTP.request(db, { phone:P, amount:100 }, T0)).reason === 'no_app', '`loyaltyCode` لوحده مش دليل (استيراد QuickBooks)');
  db = makeDb(cust());
  ok(await throwsCode(() => OTP.request(db, { phone:P, amount:400, brand:'echarpe' }, T0), 'failed-precondition'), 'مبلغ أكبر من الرصيد = مرفوض قبل ما كود يتعمل');
  ok((await OTP.request(db, { phone:P, amount:60, brand:'glow' }, T0)).ok === true && await throwsCode(() => OTP.request(db, { phone:P, amount:61, brand:'glow' }, T0), 'failed-precondition'), 'والرصيد بالبراند (Glow = 60)');
  db = makeDb(cust()); for(let i = 0; i < 5; i++) await OTP.request(db, { phone:P, amount:10 }, T0 + i);
  ok(await throwsCode(() => OTP.request(db, { phone:P, amount:10 }, T0 + 9), 'resource-exhausted'), '5 طلبات/10 دقايق — السادس مرفوض');
  ok((await OTP.request(db, { phone:P, amount:10 }, T0 + 11 * 60000)).ok === true, 'وبعد 10 دقايق يتفتح تاني');
  ok(await throwsCode(() => OTP.request(makeDb({}), { phone:P, amount:10 }, T0), 'not-found'), 'عميلة مش موجودة');

  console.log('✅ 2) التحقق');
  db = makeDb(cust()); r = await OTP.request(db, { phone:P, amount:300 }, T0); const CODE = r.code;
  const wrong = CODE === '0000' ? '1111' : '0000';
  let v = await OTP.verify(db, { phone:P, code:wrong }, T0 + 1000);
  ok(v.ok === false && v.reason === 'wrong' && v.left === 2, 'كود غلط = فاضل محاولتين');
  v = await OTP.verify(db, { phone:P, code:CODE }, T0 + 2000);
  ok(v.ok === true && v.approvalId.length >= 20 && v.amount === 300, 'الكود الصح = `approvalId` لمرة واحدة');
  ok(db._store['credit_otp/' + P].code === null, 'والكود بيتمسح فورًا (ميتستخدمش مرتين)');
  ok((await OTP.verify(db, { phone:P, code:CODE }, T0 + 3000)).reason === 'none', 'نفس الكود تاني = مفيش');
  db = makeDb(cust()); r = await OTP.request(db, { phone:P, amount:300 }, T0);
  const w2 = r.code === '0000' ? '1111' : '0000';
  await OTP.verify(db, { phone:P, code:w2 }, T0 + 1); await OTP.verify(db, { phone:P, code:w2 }, T0 + 2);
  v = await OTP.verify(db, { phone:P, code:w2 }, T0 + 3);
  ok(v.reason === 'locked' && (await OTP.verify(db, { phone:P, code:r.code }, T0 + 4)).ok === false, '⛔ 3 محاولات غلط = الكود يموت — حتى الصح بعدها مرفوض');
  db = makeDb(cust()); r = await OTP.request(db, { phone:P, amount:300 }, T0);
  ok((await OTP.verify(db, { phone:P, code:r.code }, T0 + 3 * 60000 + 1)).reason === 'expired', 'بعد 3 دقايق = منتهي');
  ok((await OTP.verify(db, { phone:P, code:'12' }, T0)).ok === false, 'كود ناقص = مرفوض');
  db = makeDb(cust()); r = await OTP.request(db, { phone:P, amount:300 }, T0); db._store['credit_otp/' + P].tries = 3;
  ok((await OTP.verify(db, { phone:P, code:r.code }, T0 + 5)).reason === 'locked', 'عدّاد المحاولات وصل 3 والكود لسه موجود (حالة شاذة) = برضه مقفول');

  console.log('💰 3) الموافقة جوّه معاملة الخصم');
  db = makeDb(cust()); r = await OTP.request(db, { phone:P, amount:300 }, T0); v = await OTP.verify(db, { phone:P, code:r.code }, T0 + 1000);
  const D = () => db._store['credit_otp/' + P];
  ok(OTP.checkApproval(D(), { approvalId:v.approvalId, amount:300 }, T0 + 5000) === true, 'الموافقة الصح بالمبلغ الصح = تعدّي');
  ok(OTP.checkApproval(D(), { approvalId:v.approvalId, amount:250 }, T0 + 5000) === true, 'مبلغ **أقل** (الفاتورة قلّت) = تعدّي');
  const bad = (o, now) => { try{ OTP.checkApproval(D(), o, now); return null; }catch(e){ return e.code; } };
  ok(bad({ approvalId:v.approvalId, amount:301 }, T0 + 5000) === 'permission-denied', '⛔ مبلغ **أكبر** من اللي العميلة وافقت عليه = مرفوض');
  ok(bad({ approvalId:'x'.repeat(24), amount:300 }, T0 + 5000) === 'permission-denied', '⛔ موافقة مزوّرة = مرفوض');
  ok(bad({ amount:300 }, T0 + 5000) === 'permission-denied', '⛔ من غير موافقة خالص (POS قديم/متلاعب فيه) = مرفوض');
  ok(bad({ approvalId:v.approvalId, amount:300 }, T0 + 31 * 60000) === 'deadline-exceeded', 'بعد 30 دقيقة = انتهت');
  db._store['credit_otp/' + P].used = true;
  ok(bad({ approvalId:v.approvalId, amount:300 }, T0 + 5000) === 'permission-denied', '⛔ موافقة اتستخدمت = مرفوض (فاتورة واحدة بس)');

  console.log('📱 4) التطبيق: تسجيل الجهاز + عرض الكود');
  db = makeDb(cust());
  ok(await throwsCode(() => OTP.enroll(db, { phone:P, pin:'0000', deviceKey:KEY }, T0), 'permission-denied'), 'رقم سري غلط = الجهاز ميتسجّلش');
  ok((await OTP.enroll(db, { phone:P, pin:'4321', deviceKey:KEY }, T0)).ok === true, 'الرقم السري الصح = الجهاز اتسجّل');
  const kd = db._store['credit_keys/' + P];
  ok(kd.keys.length === 1 && kd.keys[0].h.length === 64 && JSON.stringify(kd).indexOf(KEY) < 0, 'السيرفر مخزّن **hash** المفتاح مش المفتاح');
  for(let i = 0; i < 5; i++) await OTP.enroll(db, { phone:P, pin:'9999', deviceKey:KEY }, T0 + 100 + i).catch(() => {});
  ok(await throwsCode(() => OTP.enroll(db, { phone:P, pin:'4321', deviceKey:KEY }, T0 + 200), 'resource-exhausted'), '5 محاولات رقم سري غلط = قفل ربع ساعة (حتى الصح)');
  db = makeDb(cust()); await OTP.enroll(db, { phone:P, pin:'4321', deviceKey:KEY }, T0);
  ok((await OTP.myCode(db, { phone:P, deviceKey:KEY }, T0)).code === null, 'مفيش طلب = مفيش كود');
  r = await OTP.request(db, { phone:P, amount:300, branch:'echarpe El Rehab' }, T0);
  let mc = await OTP.myCode(db, { phone:P, deviceKey:KEY }, T0 + 1000);
  ok(mc.ok && mc.code === r.code && mc.amount === 300 && mc.expAt === r.expAt, '⭐ الجهاز المسجّل بياخد الكود (اللي قافلة الإشعارات بتشوفه جوّه التطبيق)');
  mc = await OTP.myCode(db, { phone:P, deviceKey:'z'.repeat(40) }, T0 + 1000);
  ok(mc.ok === false && mc.reason === 'enroll' && mc.code === undefined, '⛔⭐ جهاز **مش مسجّل** (حد عارف الرقم بس) = مفيش كود — بيتطلب منه الرقم السري');
  ok((await OTP.myCode(db, { phone:P, deviceKey:KEY }, T0 + 4 * 60000)).code === null, 'كود منتهي مبيتعرضش');
  await OTP.verify(db, { phone:P, code:r.code }, T0 + 2000);
  ok((await OTP.myCode(db, { phone:P, deviceKey:KEY }, T0 + 3000)).code === null, 'وكود اتستخدم مبيتعرضش');
  const n = OTP.buildCodeNotice({ code:'4827', brand:'glow' });
  ok(n.brand === 'glow' && /4827/.test(n.title) && /متديش الكود لحد/.test(n.body) && n.link === './?go=code', 'إشعار الكود: الكود في العنوان + تحذير + بيفتح شاشة الكود');

  console.log('🔌 5) التوصيل جوّه `creditSpend`');
  const cs = gift.slice(gift.indexOf('exports.creditSpend'));
  ok(!/exports\.(otp|creditOtp|deviceEnroll|myCode)[A-Za-z]* = onCall\(/.test(gift) && !/Object\.assign\(exports, require\(['"]\.\/creditOtp/.test(gift + fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8')), 'مفيش دالة سحابية جديدة للكود — كله `action` جوّه `creditSpend`');
  ok(!/onCall|onRequest|onDocument/.test(fs.readFileSync(path.join(ROOT, 'functions', 'creditOtp.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), '`creditOtp.js` مفيهوش أي تعريف دالة سحابية (الكوتة)');
  ok(cs.indexOf("if(action === 'device_enroll' || action === 'my_code'){") > 0 && cs.indexOf("if(action === 'device_enroll' || action === 'my_code'){") < cs.indexOf('const who = await requireStaff(context);'), 'فعلين العميلة **قبل** `requireStaff` (هي مش موظفة)');
  ok(cs.indexOf("action === 'otp_request'") > cs.indexOf('const who = await requireStaff(context);') && cs.indexOf("action === 'otp_verify'") > cs.indexOf('const who = await requireStaff(context);'), 'وطلب/تحقق الكود **بعده** (موظف بس)');
  ok(/return \{ ok:true, expAt: r\.expAt \};\s*\/\/ ⛔ الكود \*\*مبيرجعش\*\* لـPOS/.test(cs) && !/return r;\s*\n\s*\}\s*\n\s*return \{ ok:true, expAt: r\.expAt, code/.test(cs), '⛔⭐ رد `otp_request` لـPOS **مفيهوش الكود**');
  const txn = cs.slice(cs.indexOf('db.runTransaction'), cs.indexOf('// 🔔 إشعار العميلة'));
  ok(txn.indexOf('tx.get(_oref)') > 0 && txn.indexOf('tx.get(_oref)') < txn.indexOf('postCredit(tx'), 'الموافقة بتتقري **قبل** أي كتابة (قاعدة معاملات Firestore)');
  const iChk = txn.indexOf('OTP.checkApproval(os.exists ? os.data() : null, { approvalId: data.approvalId, amount })');
  ok(iChk > txn.indexOf('tx.get(_oref)') && iChk < txn.indexOf('postCredit(tx'), '⛔⭐ `checkApproval` بيتنادى جوّه المعاملة **قبل الخصم** — من غير موافقة مفيش `postCredit`');
  ok(txn.indexOf('tx.update(_oref, { used: true') > txn.indexOf('postCredit(tx'), 'وبتتعلّم «اتستخدمت» **جوّه نفس معاملة الخصم**');
  ok(/_mustOtp = await OTP\.otpRequired\(db\);/.test(cs) && /if\(_mustOtp\)\{\s*\n\s*const os = await tx\.get\(_oref\);/.test(cs), 'والفرض من **إعداد على السيرفر** — POS مقدرش يتخطّاه');
  ok((await OTP.otpRequired(makeDb({}))) === false && (await OTP.otpRequired(makeDb({ 'pos_test_settings/credit_cfg':{ otpRequired:true } }))) === true, 'الافتراضي مقفول (المرحلة 1: القديم شغال لحد ما المالك يفعّل)');

  console.log('\n' + (fail ? '❌' : '✅') + ' test-credit-otp: ' + pass + ' ناجح · ' + fail + ' فاشل');
  if(fail) process.exitCode = 1;
})().catch(e => { console.error('💥', e); process.exitCode = 1; });
