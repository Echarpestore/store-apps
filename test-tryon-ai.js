// ============================================================
// 🧪 test-tryon-ai.js — دالة تجربة الطرحة بالـAI (hijabTryOn)
// ------------------------------------------------------------
// كل فحص هنا **سلبي**: لو رجّعت الإصلاح، الفحص لازم يقع.
//
// اللي بيقفله:
//   ١) الخصوصية: الصورة **متتخزّنش** — لا Storage ولا كتابة في
//      Firestore. لو حد كتب الصورة في مستند، الفحص يقع.
//   ٢) الحارس بيخزّن **عدّاد بس** — مفيش صورة/وش في الكتابة.
//   ٣) سقف التكلفة: المساواة بتترفض (السقف N = N تجارب بالظبط).
//   ٤) الأخطاء الخام **مبتتسرّبش** للعميلة — رسالة ودّية واحدة.
//   ٥) التحقق من الصورة: نوع مسموح + حجم تحت السقف + data-URL سليم.
//   ٦) البرومبت بيحافظ على العميلة + المنتج + **صورة واحدة** (مفيش كولاج).
//   ٧) مفتاح الـAPI عن طريق Secret Manager — **مش مكتوب في الكود**.
//   ٨) مفيش `initializeApp()` في ملف الدالة (بتتنادى في index.js).
//   ٩) الملف **مربوط** في index.js — من غير الربط الدالة مش منشورة.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FN_PATH = path.join(ROOT, 'functions', 'hijabTryOn.js');
const IDX_PATH = path.join(ROOT, 'functions', 'index.js');

if (!fs.existsSync(FN_PATH)) {
  console.log('  ⏭️  functions/hijabTryOn.js مش موجود — الاختبار اتخطى');
} else {

const SRC = fs.readFileSync(FN_PATH, 'utf8');
// فحص الكود من غير الكومنتات (فخ الفحص الفضفاض: نص زي initializeApp
// مكتوب في كومنت بيشرح المنع نفسه — لازم نشيله الأول).
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/[^\n]*/gm, ' ');

// ---- تحميل الدوال النقية: نشغّل الملف كله في vm بـrequire مزيّف ----
//      عشان مانشغّلش firebase-functions (مش متسطّب في بيئة الاختبار).
function loadModule() {
  class FakeHttpsError extends Error { constructor(c, m){ super(m); this.code = c; } }
  const stubs = {
    'firebase-functions/v2/https': { onCall: () => 'ONCALL', HttpsError: FakeHttpsError },
    'firebase-functions/params': { defineSecret: (n) => ({ value: () => 'STUB_' + n }) },
    'firebase-admin/firestore': {
      getFirestore: () => ({}),
      FieldValue: { serverTimestamp: () => 0 }
    }
  };
  const module = { exports: {} };
  const sandbox = {
    require: (id) => { if (stubs[id]) return stubs[id]; throw new Error('unexpected require ' + id); },
    module, exports: module.exports, console,
    Object, Array, Math, Number, String, JSON, Date, Set, RegExp, Error,
    Intl, encodeURIComponent, fetch: () => { throw new Error('no-net-in-test'); }
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'hijabTryOn.js' });
  return module.exports;
}

let M = null;
try { M = loadModule(); }
catch (e) { assert(false, 'الملف لازم يتحمّل من غير firebase-functions — ' + e.message); }

if (M) {
  // ====================== ١) إعدادات السيرفر ======================
  const d0 = M.resolveConfig(null);
  assertEq(d0.model, M.DEFAULTS.model, 'الافتراضي: الموديل');
  assertEq(d0.quality, 'low', 'الافتراضي: الجودة low');
  assert(d0.enabled === true, 'الافتراضي: مفعّل');
  // الجودة الغلط بترجع للافتراضي (مش بتعدّي كأي string)
  assertEq(M.resolveConfig({ quality: 'ultra' }).quality, 'low', 'جودة غير مسموحة → افتراضي');
  assertEq(M.resolveConfig({ quality: 'high' }).quality, 'high', 'high مسموحة');
  // التفعيل ينطفي بس بـfalse صريح
  assert(M.resolveConfig({ enabled: false }).enabled === false, 'enabled:false بيتحترم');
  assert(M.resolveConfig({ enabled: 'no' }).enabled === true, 'أي قيمة تانية = مفعّل');
  // السقف لازم موجب صحيح
  assertEq(M.resolveConfig({ dailyCapPerPhone: 0 }).dailyCapPerPhone, M.DEFAULTS.dailyCapPerPhone, 'سقف صفر → افتراضي');
  assertEq(M.resolveConfig({ dailyCapPerPhone: 3 }).dailyCapPerPhone, 3, 'سقف صحيح بيتاخد');

  // ====================== ٢) سقف التكلفة ======================
  const cap = 5;
  assert(M.guardDecide(0, cap).allow === true, 'أول تجربة مسموحة');
  assert(M.guardDecide(cap - 1, cap).allow === true, 'التجربة رقم N مسموحة');
  // 🔴 المساواة **بتترفض** — لو حد غيّرها لـ<= بدل < بيبقى N+1 تجربة
  assert(M.guardDecide(cap, cap).allow === false, 'عند السقف بالظبط → ترفض');
  assert(M.guardDecide(cap + 3, cap).allow === false, 'فوق السقف → ترفض');
  assertEq(M.guardDecide(2, cap).next, 3, 'العدّاد بيزيد واحد');

  // ====================== ٣) التحقق من الصورة ======================
  const tiny = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
  const okPng = 'data:image/png;base64,' + tiny;
  const v = M.validateImageInput(okPng, 'x');
  assertEq(v.mime, 'image/png', 'PNG سليم');
  assert(v.bytes > 0, 'بايتات موجبة');
  // jpeg و webp مسموحين، gif لأ
  assert(M.validateImageInput('data:image/jpeg;base64,' + tiny, 'x').mime === 'image/jpeg', 'jpeg مسموح');
  assert(M.validateImageInput('data:image/webp;base64,' + tiny, 'x').mime === 'image/webp', 'webp مسموح');
  let threw;
  threw = false; try { M.validateImageInput('data:image/gif;base64,' + tiny, 'x'); } catch (e) { threw = /BAD_IMAGE_MIME/.test(e.message); }
  assert(threw, 'gif مرفوض');
  threw = false; try { M.validateImageInput('', 'x'); } catch (e) { threw = /MISSING_IMAGE/.test(e.message); }
  assert(threw, 'صورة فاضية مرفوضة');
  threw = false; try { M.validateImageInput('hello world', 'x'); } catch (e) { threw = /BAD_IMAGE_FORMAT/.test(e.message); }
  assert(threw, 'نص مش data-URL مرفوض');
  // 🔴 سقف الحجم من المصدر — لو حد شاله، دي بتعدّي وهي المفروض تقع
  const bigLen = Math.ceil((M.MAX_IMAGE_BYTES + 1) * 4 / 3) + 8;
  const big = 'data:image/png;base64,' + 'A'.repeat(bigLen);
  threw = false; try { M.validateImageInput(big, 'x'); } catch (e) { threw = /IMAGE_TOO_BIG/.test(e.message); }
  assert(threw, 'صورة أكبر من السقف مرفوضة');

  // ====================== ٤) البرومبت ======================
  const p = M.buildTryOnPrompt();
  assert(/same face/i.test(p) && /skin tone/i.test(p), 'البرومبت بيحافظ على هوية العميلة');
  assert(/do not beautify/i.test(p), 'البرومبت بيمنع التجميل/التعديل');
  assert(/border|stripes|embroidery/i.test(p), 'البرومبت بيحافظ على تفاصيل المنتج (حواف/تطريز)');
  assert(/pasted/i.test(p), 'البرومبت بيمنع الشكل الملزوق');
  // 🔴 صورة **واحدة** بس — مفيش كولاج/مقارنة
  assert(/one finished/i.test(p), 'البرومبت بيطلب صورة واحدة');
  assert(/no collage/i.test(p) && /side-by-side/i.test(p), 'البرومبت بيمنع الكولاج والمقارنة');

  // ====================== ٥) استخراج الصورة من الرد ======================
  const resp = { candidates: [{ content: { parts: [
    { text: 'x' }, { inlineData: { mimeType: 'image/png', data: 'ZZZ' } }
  ] } }] };
  const ex = M.extractImageFromResponse(resp);
  assertEq(ex.b64, 'ZZZ', 'بيستخرج بيانات الصورة');
  // snake_case برضه (inline_data)
  const snake = { candidates: [{ content: { parts: [{ inline_data: { mime_type: 'image/webp', data: 'QQQ' } }] } }] };
  assertEq(M.extractImageFromResponse(snake).b64, 'QQQ', 'inline_data snake مدعوم');
  threw = false; try { M.extractImageFromResponse({ candidates: [] }); } catch (e) { threw = true; }
  assert(threw, 'رد من غير صورة بيرمي خطأ');
  threw = false; try { M.extractImageFromResponse({ candidates: [{ content: { parts: [{ text: 'no image' }] } }] }); } catch (e) { threw = true; }
  assert(threw, 'رد فيه نص بس (بلوك أمان) بيرمي خطأ');

  // ====================== ٦) الأخطاء الخام مبتتسرّبش ======================
  const raw = 'GEMINI_HTTP_403 quota billing leak-XYZ';
  const friendly = M.mapError(new Error(raw));
  assertEq(friendly, M.FRIENDLY_ERR, 'الخطأ بيتحوّل للرسالة الودّية');
  assert(friendly.indexOf('GEMINI') === -1 && friendly.indexOf('leak-XYZ') === -1, 'الخطأ الخام مش بيظهر للعميلة');

  // ====================== ٧) مفتاح يوم القاهرة ======================
  const k1 = M.phoneDayKeyCairo('0100-123 4567', 1718000000000);
  const k2 = M.phoneDayKeyCairo('0100-123 4567', 1718000000000 + 3600000); // بعدها بساعة نفس اليوم
  assertEq(k1, k2, 'نفس يوم القاهرة → نفس المفتاح');
  assert(/^01001234567_\d{4}-\d{2}-\d{2}$/.test(k1), 'التليفون بيتنضّف والصيغة يوم/قاهرة');
  const k3 = M.phoneDayKeyCairo('0100-123 4567', 1718000000000 + 2 * 86400000); // بعد يومين
  assert(k1 !== k3, 'يوم مختلف → مفتاح مختلف');
}

// ====================== ٨) الخصوصية (فحوصات هيكلية على المصدر) ======================
// 🔒 مفيش Storage خالص
assert(!/getStorage|\.bucket\s*\(|admin\.storage/.test(CODE), 'ممنوع أي Storage — الصورة متتخزّنش');
// 🔒 مفيش كتابة Firestore بتحمل الصورة (set/add/update فيها صورة/b64)
assert(!/\.(set|add|update)\s*\([^;]*?(customerImage|productImage|customer\.b64|product\.b64|\.b64)/s.test(CODE),
  'ممنوع تخزين الصورة في أي كتابة Firestore');
// 🔒 كتابة الحارس بتخزّن عدّاد (count) — مش صورة
assert(/tx\.set\s*\(\s*gref\s*,\s*\{[^}]*count/s.test(CODE), 'الحارس بيخزّن عدّاد count');

// ====================== ٩) المفتاح سيرفر-سايد بس ======================
assert(/defineSecret\(\s*["']GEMINI_API_KEY["']\s*\)/.test(CODE), 'المفتاح عن طريق defineSecret');
// 🔴 مفيش مفتاح Google مكتوب صريح في الكود
assert(!/AIza[0-9A-Za-z_\-]{10,}/.test(SRC), 'ممنوع مفتاح API مكتوب في الكود');

// ====================== ١٠) مفيش initializeApp في ملف الدالة ======================
assert(CODE.indexOf('initializeApp(') === -1, 'ممنوع initializeApp في ملف الدالة (بتتنادى في index.js)');

// ====================== ١١) الربط في index.js ======================
if (fs.existsSync(IDX_PATH)) {
  const IDX = fs.readFileSync(IDX_PATH, 'utf8');
  // 🔴 ملف موجود ومش مربوط = دالة **مش منشورة أصلًا** (درس goldPriceUpdate)
  assert(/require\(\s*["']\.\/hijabTryOn["']\s*\)/.test(IDX), 'hijabTryOn مربوط في index.js (Object.assign)');
} else {
  assert(false, 'functions/index.js لازم يكون موجود عشان نتأكد إن الدالة مربوطة');
}

}
