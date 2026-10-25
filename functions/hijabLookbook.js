/* ============================================================
   ✨👑 hijabLookbook.js — «الأتيليه»: لحد ٤ طرح في نداء واحد
   ------------------------------------------------------------
   الفكرة: العميلة ترفع صورتها مرة واحدة في صفحة الأتيليه، والموقع
   كله "يصحى" — كل كارت منتج يتحوّل لصورتها وهي لابسة الطرحة.
   بدل نداء لكل منتج (hijabTryOn)، بنبعت الوش + ٤ منتجات في نداء
   واحد ونرجّع **صورة واحدة فيها شبكة ٢×٢**، والصفحة بتقصّها على
   الجهاز (نفس sliceGridProportional بتاع شبكة البندانة).

   💰 ليه: التكلفة بالصورة الخارجة مش بعدد المنتجات — ٤ منتجات في
      صورة 2K ≈ ربع تمن ٤ نداءات منفصلة. الجودة العالية لمنتج واحد
      لسه بـhijabTryOn لما العميلة تدوس «جودة عالية».

   🔴 نفس قواعد النشر بتاعت hijabTryOn (v2 بس، من غير initializeApp):
         Object.assign(exports, require("./hijabLookbook"));
         firebase deploy --only functions:hijabLookbook

   🔐 الحماية — أشد من hijabTryOn عن قصد (الصفحة عامة للموقع كله):
     · لازم `req.auth` (تسجيل مجهول من الصفحة) — العدّاد على الـuid
       مش على تليفون جاي من العميل.
     · سقف لكل uid في اليوم + **سقف يومي للمتجر كله** — من غيره لوب
       بسيط بعدة حسابات مجهولة يحرق الفلوس.
     · نفس الخصوصية: الصورة متتخزّنش عندنا، الحارس عدّاد بس.
   ============================================================ */
"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const core = require("./hijabTryOn");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

const COL_SETTINGS = "pos_test_settings";
const DOC_SETTINGS = "tryon_ai";
const COL_GUARD = "tryon_ai_guard";

/* الإعدادات من نفس مستند tryon_ai — حقول إضافية:
     lookbookEnabled      (افتراضي true)
     lookbookCapPerUser   شبكات/يوم لكل عميلة (الشبكة = ٤ منتجات)
     lookbookCapGlobal    شبكات/يوم للمتجر كله — سقف الميزانية */
const LOOKBOOK_DEFAULTS = {
  lookbookEnabled: true,
  lookbookCapPerUser: 2,     // تجربة ببلاش + 🎁 تجربة لما تحط قطعة في الحقيبة = نداءين (١٢ إطلالة) بالكتير
  lookbookCapGlobal: 400,    // سقف المتجر كله في اليوم
  // ✨ توضيح قطعة واحدة بجودة كاملة لما العميلة تفتحها — عدّاد لوحده
  lookbookHqCapPerUser: 4
};
const MAX_PRODUCTS = 9;

/* 📐 شبكة الأتيليه — لحد ٩ قطع في صورة واحدة. الخانة بورتريه ٣:٤،
   فنسبة الصورة كلها = (أعمدة×٣):(صفوف×٤) وبنقرّبها لأقرب نسبة
   بيدعمها Gemini. ⚠️ لازم تطابق gridLayout في atelier-core.js
   بالظبط — الصفحة بتقصّ على نفس الأعمدة والصفوف. */
function lookbookLayout(n) {
  const k = Math.max(1, Math.min(MAX_PRODUCTS, Number(n) || 1));
  if (k <= 3) return { cols: k, rows: 1 };
  if (k === 4) return { cols: 2, rows: 2 };
  if (k <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}
const ASPECTS = [["1:1", 1], ["3:4", .75], ["4:3", 4 / 3], ["2:3", 2 / 3], ["3:2", 1.5],
  ["4:5", .8], ["5:4", 1.25], ["9:16", 9 / 16], ["16:9", 16 / 9], ["21:9", 21 / 9]];
function lookbookImageConfig(n) {
  const l = lookbookLayout(n), want = (l.cols * 3) / (l.rows * 4);
  let best = ASPECTS[0];
  for (const a of ASPECTS) if (Math.abs(Math.log(a[1] / want)) < Math.abs(Math.log(best[1] / want))) best = a;
  // 2K عشان كل خانة تفضل واضحة بعد القص (٦ خانات ≈ ٦٨٠ بكسل عرض)
  return { aspectRatio: best[0], imageSize: "2K" };
}

function resolveLookbookConfig(doc) {
  const d = (doc && typeof doc === "object") ? doc : {};
  const base = core.resolveConfig(d);
  const posInt = (v, def) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : def);
  return {
    enabled: base.enabled && d.lookbookEnabled !== false,
    model: base.model,
    quality: base.quality,
    capPerUser: posInt(d.lookbookCapPerUser, LOOKBOOK_DEFAULTS.lookbookCapPerUser),
    capGlobal: posInt(d.lookbookCapGlobal, LOOKBOOK_DEFAULTS.lookbookCapGlobal),
    hqCapPerUser: posInt(d.lookbookHqCapPerUser, LOOKBOOK_DEFAULTS.lookbookHqCapPerUser)
  };
}

/* يوم القاهرة YYYY-MM-DD — نفس حسبة phoneDayKeyCairo من غير التليفون */
function cairoDay(nowMs) {
  return core.phoneDayKeyCairo("0", nowMs).split("_")[1];
}

/* الـuid ممكن يكون فيه حروف — بننظّفه لمفتاح مستند آمن */
function userDayKey(uid, nowMs) {
  const u = String(uid || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 40) || "anon";
  return "lb_" + u + "_" + cairoDay(nowMs);
}
function hqDayKey(uid, nowMs) {
  return userDayKey(uid, nowMs).replace(/^lb_/, "lbhq_");
}
function globalDayKey(nowMs) {
  return "lb_all_" + cairoDay(nowMs);
}

/* تنظيف قائمة المنتجات: ١ لـ٤، كل واحد { id, image } والصورة
   data-URL سليمة. أي منتج بايظ = الطلب كله يترفض (ترتيب الخانات
   لازم يفضل مطابق للي العميل هيقصّه). */
function sanitizeProducts(list) {
  if (!Array.isArray(list) || !list.length) throw new Error("NO_PRODUCTS");
  if (list.length > MAX_PRODUCTS) throw new Error("TOO_MANY_PRODUCTS");
  return list.map((p, i) => {
    const img = core.validateImageInput(p && p.image, "product" + (i + 1));
    const id = (p && typeof p.id === "string") ? p.id.slice(0, 80) : String(i);
    return { id, mime: img.mime, b64: img.b64 };
  });
}

/* البرومبت — نفس قواعد الحفاظ على العميلة ولفّة الطرحة بتاعت
   hijabTryOn، بس كل خانة بطرحة **مختلفة** وممنوع الخلط بينهم. */
/* 🧥 الإسدال: قطعة صلاة طويلة بغطاء راس متصل — لفّة الطرحة (الطرفين
   الطوال) ملهاش معنى هنا، فبنبدّل جزء الشكل بس وباقي القواعد زي ما هي. */
const GARMENTS = ["hijab", "isdal"];
function cleanGarment(g) { return GARMENTS.includes(g) ? g : "hijab"; }

function buildLookbookPrompt(n, garment) {
  const count = Math.max(1, Math.min(MAX_PRODUCTS, Number(n) || 1));
  const layout = lookbookLayout(count);
  if (cleanGarment(garment) === "isdal") return buildIsdalPrompt(count, layout);
  const lines = [
    "Create a photorealistic virtual hijab try-on lookbook.",
    "IMAGE 1 is the customer and the immutable base photograph.",
    "IMAGES 2 to " + (count + 1) + " are " + count + " DIFFERENT hijab products, used ONLY as product references.",
    "Preserve the customer's identity exactly in every cell: face, facial proportions, skin texture and tone, expression, body, clothes, background, pose, camera perspective and lighting.",
    "Do not beautify, reshape, retouch, zoom, or change the customer.",
    "Replace only the hair/head-covering area and add the hijab naturally around the head, neck and shoulders.",
    "HAIR COVERAGE IS MANDATORY: the hijab fully covers the top, back and sides of the head, the hairline, all of the hair and the ears. Not a single strand of hair is visible. Never wear the product as a neck scarf, bandana, shawl or wrap only around the neck or shoulders.",
    "The product photos may show the scarf folded or crumpled on a table: it is a large rectangular hijab. Unfold it mentally and keep its exact fabric, color, border pattern and fringe.",
    "WRAP GEOMETRY: style each rectangular scarf like a contemporary two-long-ends hijab. Frame the face with a smooth, close-fitting single layer, bring the fabric under the chin, wrap it loosely ONCE around the neck, and let both long ends hang down the left and right front of the torso.",
    "No cape, poncho, khimar, sculpted turban, stacked neck coils or broad bib across the chest.",
    "FABRIC WEIGHT: these are LIGHTWEIGHT summer hijabs (thin linen, voile and chiffon), not shawls. Render thin, airy, slightly translucent fabric that drapes softly and clings lightly to the head and shoulders, with many fine, small, soft folds and a gentle natural fall. Never make it look thick, heavy, knitted, woolly, padded, stiff or bulky like a winter shawl or blanket, and never add extra volume around the neck.",
    "The hijab must look physically worn with realistic folds, shadows, depth and occlusion.",
    "OUTPUT FORMAT IS STRICT:",
    "Return ONE image arranged as a grid of " + layout.rows + " row(s) by " + layout.cols +
      " column(s) of equal portrait cells, filled left-to-right then top-to-bottom. Exactly " + count +
      " cells contain the customer" + (layout.rows * layout.cols > count
        ? "; the remaining " + (layout.rows * layout.cols - count) + " cell(s) at the end are plain warm ivory background with nothing in them."
        : "."),
    "Every cell shows the SAME customer portrait with the SAME framing, camera distance and lighting. The ONLY difference between cells is which hijab product is worn."
  ];
  for (let i = 0; i < count; i++) {
    lines.push("cell " + (i + 1) + ": the customer wearing EXACTLY the hijab from IMAGE " + (i + 2) +
      " (same color, print, texture, border and fringe).");
  }
  lines.push(
    "Each cell uses ONLY its own product. Never mix, swap, blend or repeat colors or prints between cells.",
    "Never output a product-only image, flat lay, mannequin or fabric close-up in any cell.",
    "Use only very thin uniform separators between cells. No labels, text, numbers, borders or watermarks."
  );
  return lines.join("\n");
}

function buildIsdalPrompt(count, layout) {
  const lines = [
    "Create a photorealistic virtual try-on lookbook of an isdal (a one-piece Muslim prayer garment with an attached head cover that flows down over the body).",
    "IMAGE 1 is the customer and the immutable base photograph.",
    "IMAGES 2 to " + (count + 1) + " are " + count + " DIFFERENT isdal products, used ONLY as product references.",
    "Preserve the customer's identity exactly in every cell: face, facial proportions, skin texture and tone, expression, background, pose, camera perspective and lighting.",
    "Do not beautify, reshape, retouch, zoom, or change the customer.",
    "Dress the customer in the isdal: the attached hood frames the face closely, and the garment falls loosely and modestly over the shoulders, arms and body to the full visible length of the photo, with natural folds and realistic weight.",
    "Keep the exact cut of each isdal (hood shape, sleeves or cape, length, trims, lace, embroidery and closures) as shown in its product image.",
    "OUTPUT FORMAT IS STRICT:",
    "Return ONE image arranged as a grid of " + layout.rows + " row(s) by " + layout.cols +
      " column(s) of equal portrait cells, filled left-to-right then top-to-bottom. Exactly " + count +
      " cells contain the customer" + (layout.rows * layout.cols > count
        ? "; the remaining " + (layout.rows * layout.cols - count) + " cell(s) at the end are plain warm ivory background with nothing in them."
        : "."),
    "Every cell shows the SAME customer with the SAME framing, camera distance and lighting. The ONLY difference between cells is which isdal is worn."
  ];
  for (let i = 0; i < count; i++) {
    lines.push("cell " + (i + 1) + ": the customer wearing EXACTLY the isdal from IMAGE " + (i + 2) +
      " (same color, print, fabric, trims and cut).");
  }
  lines.push(
    "Each cell uses ONLY its own product. Never mix, swap, blend or repeat colors, prints or cuts between cells.",
    "Never output a product-only image, flat lay, mannequin or fabric close-up in any cell.",
    "Use only very thin uniform separators between cells. No labels, text, numbers, borders or watermarks."
  );
  return lines.join("\n");
}

/* قرار الحارسين مع بعض — المساواة بتترفض زي guardDecide */
function lookbookGuardDecide(userCount, globalCount, cfg) {
  const u = core.guardDecide(userCount, cfg.capPerUser);
  const g = core.guardDecide(globalCount, cfg.capGlobal);
  return { allow: u.allow && g.allow, userOk: u.allow, globalOk: g.allow,
           nextUser: u.next, nextGlobal: g.next };
}

exports.hijabLookbook = onCall(
  { region: "us-central1", secrets: [GEMINI_API_KEY], memory: "1GiB", timeoutSeconds: 180 },
  async (req) => {
    const FRIENDLY = core.FRIENDLY_ERR;
    const uid = req && req.auth && req.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", FRIENDLY);

    const db = getFirestore();
    const data = (req && req.data) || {};

    let cfg;
    try {
      const snap = await db.collection(COL_SETTINGS).doc(DOC_SETTINGS).get();
      cfg = resolveLookbookConfig(snap.exists ? snap.data() : null);
    } catch (e) { cfg = resolveLookbookConfig(null); }
    if (!cfg.enabled) throw new HttpsError("unavailable", FRIENDLY);

    let customer, products;
    try {
      customer = core.validateImageInput(data.customerImage, "customer");
      products = sanitizeProducts(data.products);
    } catch (e) {
      console.error("lookbook validate", e.message);
      throw new HttpsError("invalid-argument", FRIENDLY);
    }

    // ✨ قطعة واحدة «توضيح» (hq) = عدّاد لوحده، مبياكلش من تجارب الشبكة
    const hq = data.hq === true && products.length === 1;
    const now = Date.now();
    const uref = db.collection(COL_GUARD).doc(hq ? hqDayKey(uid, now) : userDayKey(uid, now));
    const gref = db.collection(COL_GUARD).doc(globalDayKey(now));
    try {
      await db.runTransaction(async (tx) => {
        const [us, gs] = await Promise.all([tx.get(uref), tx.get(gref)]);
        const dec = lookbookGuardDecide(
          us.exists ? (us.data().count || 0) : 0,
          gs.exists ? (gs.data().count || 0) : 0, hq ? Object.assign({}, cfg, { capPerUser: cfg.hqCapPerUser }) : cfg);
        if (!dec.allow) throw new HttpsError("resource-exhausted",
          "اكتفينا بهذا القدر اليوم 🤍 يسعدنا أن تكملي غداً.");
        // 🔒 عدّادات بس — لا صورة ولا وش
        tx.set(uref, { count: dec.nextUser, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        tx.set(gref, { count: dec.nextGlobal, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      console.error("lookbook guard", e.message);
      throw new HttpsError("unavailable", FRIENDLY);
    }

    try {
      const req = {
        apiKey: GEMINI_API_KEY.value(),
        model: cfg.model,
        quality: cfg.quality,
        cellCount: products.length,
        imageConfig: lookbookImageConfig(products.length),
        prompt: buildLookbookPrompt(products.length, cleanGarment(data.garment)),
        images: [{ mime: customer.mime, b64: customer.b64 }]
          .concat(products.map((p) => ({ mime: p.mime, b64: p.b64 })))
      };
      let out;
      try { out = await core.callGeminiImage(req); }
      catch (e) {
        // الموديل رفض إعداد الحجم/النسبة (400) → نعيد مرة من غيره بدل ما نفشل
        if (!/GEMINI_HTTP_400/.test(String(e && e.message))) throw e;
        console.warn("lookbook: imageConfig rejected, retrying without it");
        out = await core.callGeminiImage(Object.assign({}, req, { imageConfig: null }));
      }
      return {
        image: "data:" + out.mime + ";base64," + out.b64,
        mime: out.mime,
        // ترتيب الخانات = ترتيب المنتجات اللي اتبعتت بالظبط
        cells: products.map((p) => p.id),
        layout: lookbookLayout(products.length),
        hqSupported: true          // الصفحة بتطلب «التوضيح» بس من نسخة بتعرفه
      };
    } catch (e) {
      console.error("lookbook generate", e && e.message);
      throw new HttpsError("unavailable", FRIENDLY);
    }
  }
);

if (typeof module !== "undefined" && module.exports) {
  module.exports.resolveLookbookConfig = resolveLookbookConfig;
  module.exports.sanitizeProducts = sanitizeProducts;
  module.exports.buildLookbookPrompt = buildLookbookPrompt;
  module.exports.cleanGarment = cleanGarment;
  module.exports.lookbookGuardDecide = lookbookGuardDecide;
  module.exports.userDayKey = userDayKey;
  module.exports.globalDayKey = globalDayKey;
  module.exports.hqDayKey = hqDayKey;
  module.exports.cairoDay = cairoDay;
  module.exports.LOOKBOOK_DEFAULTS = LOOKBOOK_DEFAULTS;
  module.exports.MAX_PRODUCTS = MAX_PRODUCTS;
  module.exports.lookbookLayout = lookbookLayout;
  module.exports.lookbookImageConfig = lookbookImageConfig;
}
