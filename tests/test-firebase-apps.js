// ============================================================
// 🔐 test-firebase-apps — عزل جلسة Firebase بين التطبيقات
//
// الباج (§20 في هاندوف أغسطس): كل التطبيقات على `echarpe.store`،
// وFirebase Auth بيخزّن الجلسة بمفتاح فيه **اسم التطبيق**. كل التطبيقات
// كانت على التطبيق الافتراضي `[DEFAULT]` → مفتاح واحد مشترك بين الكل.
// فأي تطبيق يعمل `signInAnonymously()` كان **بيكتب فوق جلسة الإيميل
// بتاعت office** والمالك يلاقي نفسه اتسجّل خروج.
//
// ⚠️ الاختبار ده **سلوكي مش نصوص**: بيشغّل بلوك التهيئة الحقيقي من
//    الـHTML جوه VM، بمحاكي بيموديل التخزين المشترك بالظبط (مساحة لكل
//    اسم تطبيق + استعادة الجلسة متأخرة زي الواقع)، وبعدين بيبص على
//    الحالة النهائية للمساحات. لو حد رجّع البلوك للتطبيق الافتراضي،
//    جلسة office بتتمسح في المحاكي والاختبار بيقع.
//
// النيجاتيف تحت (٦) بيشغّل النمط القديم على **نفس المحاكي** ويتأكد إنه
// بيمسح فعلًا — من غير كده كنا هنبقى بنختبر محاكي أعمى.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

// needsDefault: التطبيق مضطر يهيّئ `[DEFAULT]` عشان توكن FCM يفضل زي ما هو.
//               اللي مش بيستخدم FCM أنضف — مبيهيّأش الافتراضي أصلًا.
// modular:     بيستورد من gstatic (SDK v10) بدل compat.
// file:        مسار الملف من جذر الريبو (الصفحة الرئيسية في الجذر مش في فولدر).
const APPS = [
  { dir: 'loyalty',  file: 'loyalty/index.html',  appName: 'loyalty',  needsDefault: true,  sw: 'echarpe-loyalty-v', minVer: 43 },
  { dir: 'glow',     file: 'glow/index.html',     appName: 'glow',     needsDefault: true,  sw: 'glow-loyalty-v',    minVer: 36 },
  // ⬇️ الأربعة بتوع §20 المعلّقين — مفيش واحد فيهم بيستخدم FCM
  { dir: 'root',     file: 'index.html',          appName: 'site',     needsDefault: false, sw: 'store-apps-shell-v', minVer: 96, swFile: 'sw.js' },
  { dir: 'feedback', file: 'feedback/index.html', appName: 'feedback', needsDefault: false, sw: 'store-apps-shell-v', minVer: 20, modular: true },
  { dir: 'apply',    file: 'apply/index.html',    appName: 'apply',    needsDefault: false },
  { dir: 'join',     file: 'join/index.html',     appName: 'join',     needsDefault: false },
];

// ---------- شيل التعليقات قبل أي فحص على المصدر ----------
// (§0: فحص نصّي بيعدّي بالغلط لو النص موجود في تعليق — حصل قبل كده)
function stripComments(s){
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function extractBlock(src){
  const a = src.indexOf('/* FB-APP-INIT-START */');
  const b = src.indexOf('/* FB-APP-INIT-END */');
  if(a < 0 || b < 0 || b < a) return null;
  return src.slice(a, b + '/* FB-APP-INIT-END */'.length);
}

// ============================================================
// المحاكي — بيموديل التخزين المشترك للدومين
//   persisted[appName] = اللي متخزّن على الجهاز (ده اللي office بيقرا منه)
//   live[appName]      = currentUser في الذاكرة (فاضي لحد ما تحصل استعادة)
// ============================================================
function makeFirebase(seed){
  const persisted = Object.assign({}, seed);
  const live = {};
  const listeners = {};
  const calls = { anonBy: [], initialized: [], authFor: [], firestoreFor: [], messagingFor: [] };

  const nameOf = (app) => (app && app.name) || '[DEFAULT]';
  const fire = (n) => (listeners[n] || []).forEach((cb) => { try{ cb(live[n] || null); }catch(e){} });

  const firebase = {
    initializeApp(cfg, name){
      const app = { name: name || '[DEFAULT]', cfg: cfg };
      calls.initialized.push(app.name);
      return app;
    },
    auth(app){
      const n = nameOf(app);
      calls.authFor.push(n);
      return {
        get currentUser(){ return live[n] || null; },
        signInAnonymously(){
          calls.anonBy.push(n);
          const u = { uid: 'anon_' + n, isAnonymous: true };
          live[n] = u; persisted[n] = u;      // الكتابة متزامنة عمدًا (الهارنس متزامن)
          fire(n);
          const p = { then(f){ try{ f({ user: u }); }catch(e){} return p; }, catch(){ return p; } };
          return p;
        },
        onAuthStateChanged(cb){
          (listeners[n] = listeners[n] || []).push(cb);
          try{ cb(live[n] || null); }catch(e){}
          return function(){};
        },
      };
    },
    firestore(app){
      calls.firestoreFor.push(nameOf(app));
      const noop = { then(){ return noop; }, catch(){ return noop; } };
      return {
        settings(){}, enablePersistence(){ return noop; },
        collection(){ return { doc(){ return { get(){ return noop; }, onSnapshot(){ return function(){}; } }; } }; },
      };
    },
    messaging(app){ calls.messagingFor.push(nameOf(app)); return {}; },
  };
  firebase.firestore.CACHE_SIZE_UNLIMITED = 1;
  firebase.firestore.FieldValue = { arrayUnion(){}, serverTimestamp(){} };

  // استعادة الجلسة المتأخرة — ده اللي بيحصل في الواقع بعد تحميل الصفحة
  function restore(){
    Object.keys(persisted).forEach((n) => { if(!live[n]) live[n] = persisted[n]; });
    Object.keys(listeners).forEach(fire);
  }
  return { firebase, persisted, live, calls, restore };
}

const OFFICE = { uid: 'owner_uid', email: 'owner@echarpe.store', isAnonymous: false };

function runBlock(code, mock, modular){
  const win = {
    addEventListener(){}, removeEventListener(){},
    localStorage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
  };
  const sandbox = {
    firebase: mock.firebase, window: win, console: { warn(){}, log(){}, error(){} },
    firebaseConfig: { apiKey: 'k', projectId: 'p', messagingSenderId: 's', appId: 'a' },
    setTimeout(){}, setInterval(){}, navigator: { onLine: true }, document: { getElementById(){ return null; } },
  };
  // 🧩 SDK المودولار (feedback/sales): نفس المحاكي بالظبط، بس الدوال بتتقدّم
  //    كـglobals بدل ما تتنده من الكائن `firebase`. مهم إنه **نفس** المحاكي
  //    عشان النيجاتيف يقيس على نفس المسطرة.
  if(modular){
    sandbox.initializeApp     = (cfg, name) => mock.firebase.initializeApp(cfg, name);
    sandbox.getAuth           = (app) => mock.firebase.auth(app);
    sandbox.signInAnonymously = (auth) => auth.signInAnonymously();
    sandbox.onAuthStateChanged= (auth, cb) => auth.onAuthStateChanged(cb);
    sandbox.getFirestore      = (app) => mock.firebase.firestore(app);
    sandbox.enableIndexedDbPersistence = () => ({ then(){ return this; }, catch(){ return this; } });
    sandbox.collection = () => ({});
  }
  sandbox.self = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { timeout: 5000 });
  return sandbox;
}

APPS.forEach(function(app){
  const file = path.join(ROOT, app.file);
  const src = fs.readFileSync(file, 'utf8');
  const bare = stripComments(src);
  const block = extractBlock(src);

  // ============================================================
  // ١) البلوك موجود ومتعلّم (gate.py بيدوّر على العلامة دي)
  // ============================================================
  assert(!!block, app.dir + ': بلوك FB-APP-INIT موجود بعلامتيه');
  if(!block) return;

  const mock = makeFirebase({ '[DEFAULT]': OFFICE });   // المالك داخل بإيميله في office
  let sandbox = null;
  try{ sandbox = runBlock(block, mock, app.modular); }catch(e){ assert(false, app.dir + ': البلوك اشتغل من غير خطأ — ' + e.message); return; }
  mock.restore();                                        // الاستعادة المتأخرة زي الواقع

  // ============================================================
  // ٢) ⭐⭐ جلسة office ما اتلمستش — ده كل الموضوع
  // ============================================================
  assert(mock.persisted['[DEFAULT]'] === OFFICE,
    app.dir + ': ⭐⭐ جلسة office في المساحة الافتراضية زي ما هي بالظبط');
  assert(mock.persisted['[DEFAULT]'].email === 'owner@echarpe.store',
    app.dir + ': المالك لسه داخل بإيميله (مش مجهول)');
  assert(mock.calls.authFor.indexOf('[DEFAULT]') < 0,
    app.dir + ': ⭐⭐ خدمة auth عمرها ما اتطلبت على التطبيق الافتراضي أصلًا');
  assert(mock.calls.anonBy.indexOf('[DEFAULT]') < 0,
    app.dir + ': ⛔ مفيش أي دخول مجهول على المساحة المشتركة');

  // ============================================================
  // ٣) والتطبيق نفسه داخل — بمساحته هو
  // ============================================================
  // بعض الصفحات بتدخل **فورًا** (loyalty/glow/feedback شغّالين طول الوقت)،
  // وبعضها بيأجّل الدخول لحد أول عملية محتاجة قراءة/كتابة (apply/join
  // استمارات بتتقدّم مرة واحدة) — الاتنين مقبولين. اللي مش مقبول إن الدخول
  // يحصل على المساحة المشتركة. فبنشغّل السيناريو الكامل: لو ماحصلش دخول
  // تلقائي، بنعمل اللي المستخدم بيعمله وننده الدالة بنفسنا.
  if(mock.calls.anonBy.length === 0){
    const fn = sandbox.window && sandbox.window.ensureAnonAuth;
    assert(typeof fn === 'function',
      app.dir + ': ensureAnonAuth معروضة على window عشان باقي الملف يستعملها');
    if(typeof fn === 'function'){ try{ fn(); }catch(e){} }
  }

  const own = mock.persisted[app.appName];
  assert(!!own && own.isAnonymous === true,
    app.dir + ': التطبيق عامل دخول مجهول في مساحته (' + app.appName + ')');
  assert(mock.calls.anonBy.length === 1,
    app.dir + ': ⭐ دخول واحد بس — مش مستخدمين مجهولين اتنين من onAuthStateChanged (' + mock.calls.anonBy.length + ')');

  // ⭐ الحارس الأهم بعد الدخول: **حتى بعد ما اتسجّل دخول فعلي**، المساحة
  //    المشتركة زي ما هي. (الفحص فوق كان قبل الدخول في حالة الصفحات الكسولة.)
  assert(mock.persisted['[DEFAULT]'] === OFFICE,
    app.dir + ': ⭐⭐ بعد الدخول المجهول كمان — جلسة office زي ما هي');
  assert(mock.calls.anonBy.every((n) => n === app.appName),
    app.dir + ': كل الدخولات على المساحة المسمّاة بس');

  // 🔁 idempotent — نداء تاني مايعملش مستخدم مجهول جديد
  //    (apply كان فيه نداءين مستقلين في الملف)
  if(sandbox.window && typeof sandbox.window.ensureAnonAuth === 'function'){
    try{ sandbox.window.ensureAnonAuth(); }catch(e){}
    assert(mock.calls.anonBy.length === 1,
      app.dir + ': 🔁 نداء تاني لـensureAnonAuth مابيعملش دخول جديد (' + mock.calls.anonBy.length + ')');
  }
  assert(mock.calls.firestoreFor.length > 0 && mock.calls.firestoreFor.every((n) => n === app.appName),
    app.dir + ': ⭐ Firestore مربوط بنفس التطبيق المسمّى (وإلا القراءات هتشتغل بجلسة تانية)');

  // ============================================================
  // ٤) 🔔 التطبيق الافتراضي — بيتهيّأ **بس** لو التطبيق محتاج FCM
  // ============================================================
  assert(mock.calls.initialized.indexOf(app.appName) >= 0,
    app.dir + ': التطبيق المسمّى متهيّأ (' + app.appName + ')');
  if(app.needsDefault){
    // loyalty/glow: لازم يفضل متهيّأ وإلا FCM هيتسجّل من الأول
    // والعميلات اللي على أجهزتهم توكن دلوقتي ممكن يفقدوا الإشعارات
    assert(mock.calls.initialized.indexOf('[DEFAULT]') >= 0,
      app.dir + ': ⭐ التطبيق الافتراضي متهيّأ (الإشعارات بنفس التوكن)');
    assert(/firebase\.messaging\(\s*\)/.test(bare),
      app.dir + ': messaging لسه على الافتراضي من غير تطبيق (التوكن مايتغيرش)');
  } else {
    // الباقي مبيستخدمش FCM → أنضف وأأمن إنه مايهيّئش الافتراضي أصلًا.
    // ⭐ ده أقوى من مجرد "مايستخدمهوش": المساحة المشتركة مش بتتفتح خالص.
    assert(mock.calls.initialized.indexOf('[DEFAULT]') < 0,
      app.dir + ': ⭐⭐ التطبيق الافتراضي معمرش اتهيّأ (الصفحة مش بتستخدم FCM)');
    assert(!/firebase\.messaging\s*\(/.test(bare) && !/getMessaging\s*\(/.test(bare),
      app.dir + ': وفعلًا مفيش أي استخدام لـmessaging في الملف');
  }

  // ============================================================
  // ٥) مفيش استدعاء ناجي على الافتراضي في باقي الملف
  //    (التعليقات متشالة فوق — §0: نص في تعليق كان بيعدّي غلط)
  // ============================================================
  if(app.modular){
    // المودولار: الخطر إن `initializeApp` تتنادى من غير اسم في أي مكان
    assert(!/initializeApp\s*\(\s*firebaseConfig\s*\)/.test(bare),
      app.dir + ': ⛔ مفيش `initializeApp(firebaseConfig)` من غير اسم');
    assert(!/getAuth\s*\(\s*\)/.test(bare),
      app.dir + ': ⛔ مفيش `getAuth()` من غير تطبيق (بترجع الافتراضي)');
    assert(!/getFirestore\s*\(\s*\)/.test(bare),
      app.dir + ': ⛔ مفيش `getFirestore()` من غير تطبيق');
  } else {
    assert(!/firebase\.auth\(\s*\)/.test(bare),
      app.dir + ': ⛔ مفيش `firebase.auth()` من غير تطبيق في أي مكان في الملف');
    assert(!/firebase\.firestore\(\s*\)/.test(bare),
      app.dir + ': ⛔ مفيش `firebase.firestore()` من غير تطبيق');
    assert(!/firebase\.initializeApp\s*\([^)]*\)\s*;/.test(bare.replace(/firebase\.initializeApp\s*\([^)]*,\s*['"][^'"]*['"]\s*\)/g, '__NAMED__')) || app.needsDefault,
      app.dir + ': ⛔ مفيش تهيئة من غير اسم');
  }
  assert(/window\.fbAuth *= *(fbAuth|_auth)/.test(bare) && /window\.ensureAnonAuth *= *ensureAnonAuth/.test(bare),
    app.dir + ': §18 معروضين على window (الملف فيه أكتر من <script>)');

  // ============================================================
  // ٦) 🔴 نيجاتيف — النمط القديم لازم يقع في نفس المحاكي
  // ============================================================
  (function(){
    const m2 = makeFirebase({ '[DEFAULT]': OFFICE });
    const oldPattern = app.modular
      ? "const a2 = initializeApp(firebaseConfig);\n" +
        "const au2 = getAuth(a2);\n" +
        "signInAnonymously(au2);\n"
      : "firebase.initializeApp(firebaseConfig);\n" +
        "var db = firebase.firestore();\n" +
        "firebase.auth().signInAnonymously();\n";
    runBlock(oldPattern, m2, app.modular);
    m2.restore();
    assert(m2.persisted['[DEFAULT]'] !== OFFICE && m2.persisted['[DEFAULT]'].isAnonymous === true,
      app.dir + ': 🔴 نيجاتيف — النمط القديم بيمسح جلسة office فعلًا (المحاكي شايف الباج)');
  })();

  // ============================================================
  // ٧) نسخة الكاش اترفعت — بس للتطبيقات اللي عندها sw.js أصلًا
  //    (apply وjoin استمارات مرة واحدة، مفيش لهم service worker)
  // ============================================================
  if(app.sw){
    const swPath = path.join(ROOT, app.swFile || (app.dir + '/sw.js'));
    const sw = fs.readFileSync(swPath, 'utf8');
    const m = sw.match(new RegExp(app.sw + '(\\d+)'));
    assert(!!m && Number(m[1]) >= app.minVer,
      app.dir + ': CACHE_NAME v' + app.minVer + '+ (لقينا ' + (m ? m[1] : 'ولا حاجة') + ')');
  }
});
