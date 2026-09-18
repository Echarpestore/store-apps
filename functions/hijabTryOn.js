/* ============================================================
   🧕✨ hijabTryOn.js — تجربة الطرحة بالـAI (صورة العميلة + صورة المنتج)
   ------------------------------------------------------------
   الفكرة: العميلة تدوس "جرّبيها ✨" تحت صورة الطرحة في الشات، تختار
   صورتها، والسيرفر يبعت الصورتين لموديل صور (Gemini 2.5 Flash Image /
   nano-banana) ويرجّع **صورة واحدة** واقعية للعميلة وهي لابسة نفس
   الطرحة — من غير ما نطلب منها ترفع صورة المنتج تاني.

   🔴 قواعد النشر (زي onlineOrderPlace بالظبط — مش بتتفاوض):
     · **v2 بس.** خلط v1/v2 في نفس النشر بيفشّل النشر كله.
     · **متندهش `initializeApp()` هنا** — بتتنادى في `index.js`.
     · الربط في index.js:
         Object.assign(exports, require("./hijabTryOn"));
       ملف موجود ومش مربوط = دالة **مش منشورة أصلًا**
       (درس goldPriceUpdate: فضل شهور في الريبو وهو مش منشور).
     · النشر:
         firebase deploy --only functions:hijabTryOn

   🔐 المفتاح سيرفر-سايد بس — ممنوع في أي جافاسكريبت أو GitHub:
     firebase functions:secrets:set GEMINI_API_KEY
     ⚠️ لازم مفتاح **مدفوع (billing متفعّل)** — التير المجاني بتاع
     Google AI Studio بيستخدم اللي بتبعته في التدريب وبيشوفه بشر،
     وده عكس خصوصية صور العميلات. المدفوع (أو Vertex AI) مش بيتدرّب
     على بياناتك.

   🕵️ الخصوصية (الحتة اللي إحنا متحكمين فيها ١٠٠٪):
     · صورة العميلة **متتخزّنش في أي حتة عندنا** — لا Firestore ولا
       Storage. بتتعالج في الذاكرة وترجع النتيجة وخلاص.
     · الحارس (سقف التكلفة) بيخزّن **عدّاد بس** — لا صورة ولا وش.
     · اللحظة اللي الصورة توصل جوجل دي تحت شروط جوجل (المدفوعة) —
       المالك راجعها. إحنا مسؤولين عن إن حاجة متتخزّنش عندنا.

   💰 التحكم في التكلفة: سقف عدد تجارب لكل تليفون في اليوم (قاهرة).
   ============================================================ */
"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

const COL_SETTINGS = "pos_test_settings";
const DOC_SETTINGS = "tryon_ai";
const COL_GUARD = "tryon_ai_guard";

/* الإعدادات الافتراضية — كلها **قابلة للتعديل من السيرفر** (مستند
   pos_test_settings/tryon_ai) من غير ما نلمس الفرونت. الجودة low
   للبداية (تجربة التكلفة) وبتطلع medium/high من نفس المكان. */
const DEFAULTS = {
  enabled: true,
 model: "gemini-3.1-flash-lite-image", // Nano Banana 2 — أفضل توازن جودة/سرعة حاليًا
  quality: "high",                 // low | medium | high  (high = 2K للـgrid)
  dailyCapPerPhone: 15             // سقف تجارب لكل تليفون/يوم قاهرة
};

const MIME_ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // ٨ ميجا للصورة الواحدة

/* الرسالة الودّية الوحيدة اللي بتوصل العميلة لو حصل أي خطأ — الخطأ
   الخام من الـAPI **عمره ما بيتسرّب**. */
const FRIENDLY_ERR = "مقدرناش نجهّز التجربة دلوقتي. جرّبي مرة تانية ❤️";

/* ============================================================
   دوال نقية — بتتختبر بالهارنس (استخراج بالأقواس المتوازنة + vm)
   ============================================================ */

/* دمج إعدادات السيرفر فوق الافتراضي — أي حقل ناقص بياخد الافتراضي،
   والجودة بتتقيّد في القيم المسموحة بس. */
function resolveConfig(doc) {
  const d = (doc && typeof doc === "object") ? doc : {};
  const q = ["low", "medium", "high"].includes(d.quality) ? d.quality : DEFAULTS.quality;
  const cap = Number.isFinite(d.dailyCapPerPhone) && d.dailyCapPerPhone > 0
    ? Math.floor(d.dailyCapPerPhone) : DEFAULTS.dailyCapPerPhone;
  let model = (typeof d.model === "string" && d.model.trim()) ? d.model.trim() : DEFAULTS.model;
  // ترقية تلقائية للإعداد القديم فقط: 2.5 محدود تقريبًا لـ1K، وده قليل لصور grid.
  if (model === "gemini-2.5-flash-image") model = DEFAULTS.model;
  return {
    enabled: d.enabled === false ? false : true,
    model: model,
    quality: q,
    dailyCapPerPhone: cap
  };
}

/* التحقق من صورة data-URL: النوع مسموح + الحجم تحت السقف + base64
   سليم. بيرجّع { mime, bytes, b64 } أو بيرمي كود خطأ داخلي واضح
   (بيتحوّل لرسالة ودّية بره — الكود الداخلي للّوجز بس). */
function validateImageInput(dataUrl, label) {
  if (typeof dataUrl !== "string" || !dataUrl) {
    throw new Error("MISSING_IMAGE:" + (label || ""));
  }
  const m = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!m) throw new Error("BAD_IMAGE_FORMAT:" + (label || ""));
  const mime = m[1].toLowerCase();
  if (!MIME_ALLOWED.includes(mime)) throw new Error("BAD_IMAGE_MIME:" + mime);
  const b64 = m[2].replace(/\s+/g, "");
  // طول base64 → عدد بايتات تقريبي (٤ أحرف = ٣ بايت، ناقص الحشو)
  const pad = (b64.endsWith("==") ? 2 : (b64.endsWith("=") ? 1 : 0));
  const bytes = Math.floor(b64.length * 3 / 4) - pad;
  if (bytes <= 0) throw new Error("EMPTY_IMAGE:" + (label || ""));
  if (bytes > MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_BIG:" + bytes);
  return { mime, bytes, b64 };
}

/* 🚫 خلية "بدون بندانة" — بتتحط الأول دايمًا لما فيه بندانة مطلوبة.
   الموظفة تختار من 1 إلى 3 ألوان فقط. مفيش ألوان fallback ولا توليد
   إضافي: نفس النداء يرجّع none + الألوان المطلوبة بالترتيب. */
const NO_BANDANA_TOKEN = "none";
const BANDANA_CELLS = 3;
function computeGridCells(withBandana, bandanaColors) {
  if (!withBandana) return null;
  const real = (Array.isArray(bandanaColors) ? bandanaColors : [])
    .filter((c) => typeof c === "string" && c.length >= 2)
    .slice(0, BANDANA_CELLS);
  return [NO_BANDANA_TOKEN].concat(real);
}

/* هندسة الشبكة الوحيدة المستخدمة في السيرفر والفرونت:
   2 خانات = صف 1×2، 3 خانات = صف 1×3، 4 خانات = 2×2.
   كده مفيش أبدًا 3 صور جوه 2×2 ناقصة؛ ده كان تناقض يربك الموديل. */
function computeGridLayout(n) {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n === 3) return { cols: 3, rows: 1 };
  return { cols: 2, rows: 2 };
}

function outputImageConfig(model, quality, cellCount) {
  const modern = /^(gemini-3\.1-flash-image|gemini-3-pro-image)/.test(String(model || ""));
  if (!modern) return null;
  const n = Math.max(1, Number(cellCount) || 1);
  const aspectRatio = n === 4 ? "1:1" : n === 3 ? "21:9" : n === 2 ? "3:2" : "3:4";
  // التجربة التجارية هنا لازم تفضل حادة بعد القص؛ 2K هو الحد المستخدم دائمًا.
  // في 2×2 كل خانة تقارب 1K بدل ~512px من خرج 1K.
  const imageSize = "2K";
  return { aspectRatio, imageSize };
}

/* البرومبت — الحفاظ على العميلة زي ما هي + الحفاظ على المنتج بالظبط
   + شكل ملبوس واقعي + **صورة واحدة بس** (مفيش كولاج/مقارنة).

   🧢 withBandana: لما العميلة تختار بندانة، بنطلب من الموديل يرسمها
      **تحت** الطرحة وباينة عند الجبهة. الشبكة دلوقتي دايمًا بتضم خانة
      "بدون بندانة" الأول + كل الألوان المطلوبة (computeGridCells) —
      يعني أي طلب بندانة = وضع شبكة تلقائيًا، حتى لو لون واحد بس.
      ⚠️ ليه في البرومبت مش تركيب بالكود: جربنا نركّب PNG بندانة فوق
         صورة جاهزة — الطرحة المولّدة بتغطي الجبهة بالكامل تقريبًا
         فمفيش مساحة تبان فيها، والنتيجة مالهاش قيمة تجارية.
      💰 اللون **مش** في البرومبت عن قصد: بنولّد بلون فاتح محايد مرة
         واحدة، وكل الألوان التانية بتتعمل بالكود على الجهاز مجانًا
         (تغيير اللون بيحافظ على الطيّات والظلال — اتجرّب فعليًا). */
function buildTryOnPrompt(opts) {
  const withBandana = !!(opts && opts.withBandana);
  const cells = computeGridCells(withBandana, opts && opts.bandanaColors);
  const gridMode = !!(cells && cells.length > 1);
  const lines = [
    "Create a photorealistic virtual hijab try-on using IMAGE 1 as the immutable base photograph.",
    "IMAGE 1 is the customer. IMAGE 2 is ONLY the exact hijab product reference.",
    "The final output must show the customer from IMAGE 1 wearing the hijab from IMAGE 2.",
    "NEVER output a product-only image, fabric swatch, flat lay, mannequin, scarf-only crop, or close-up of fabric.",
    "Preserve the customer's identity exactly: face, facial proportions, skin texture and tone, expression, body, clothes, background, pose, camera perspective and lighting.",
    "Do not beautify, reshape, retouch, zoom, crop closer, or change the customer.",
    "Replace only the hair/head-covering area and add the hijab naturally around the head, neck and shoulders.",
    "WRAP GEOMETRY: style this rectangular scarf like a contemporary two-long-ends hijab. Frame the face with a smooth, close-fitting single layer, bring the fabric under the chin, and wrap it loosely ONCE around the neck.",
    "Bring BOTH distinct scarf ends forward: one long loose end hanging vertically down the left front of the torso and the other long loose end hanging vertically down the right front. Keep both ends visibly separate and let the actual product fringe and borders appear only where present in IMAGE 2.",
    "Keep the central chest area between the two hanging ends partly visible. No broad triangular bib across the chest, no cape, shawl, poncho, khimar, one-sided diagonal blanket, or fabric covering the whole chest.",
    "No stacked neck coils, oversized folds, sculpted turban, or extra fabric bulk. The two ends must remain long, soft, natural, and physically continuous with the scarf around the head.",
    "This is a WRAPPING STYLE reference only: do not copy another model, face, outfit, background, scarf color, print, border or fabric. The ONLY scarf product is IMAGE 2; preserve its actual dimensions, color, pattern, texture, opacity, border and fringe.",
    "Reproduce the exact hijab product from IMAGE 2: same color, fabric texture, weave, pattern, embroidery, border, stripes, trim and edge details.",
    "The hijab must look physically worn with realistic folds, shadows, depth and occlusion."
  ];

  if (gridMode) {
    const n = cells.length;
    const layout = computeGridLayout(n);
    lines.push(
      "Only the colored-bandana cells have a separate under-scarf bandana. In the NO-bandana cell, the scarf touches the forehead directly: NO undercap, black line, contrasting strip, hidden headband, or extra inner layer.",
      "Only a narrow 3 to 4 cm strip of bandana may be visible along the forehead hairline.",
      "Do not pull the hijab back and do not let the bandana become the main head covering.",
      "OUTPUT FORMAT IS STRICT:",
      "Return ONE image containing exactly " + n + " equal cells arranged as " + layout.rows + " row(s) by " + layout.cols + " column(s).",
      "There are exactly " + n + " cells and every cell is filled. Do not invent any extra cell.",
      "FIRST create one canonical finished portrait of the customer wearing the EXACT hijab from IMAGE 2. Then duplicate that finished portrait unchanged into every cell.",
      "EVERY cell must contain the FULL SAME CUSTOMER PORTRAIT from IMAGE 1 wearing the SAME HIJAB from IMAGE 2.",
      "LOCK THE HIJAB PRODUCT before making variants: its base color, print, border, texture, folds and drape are immutable and must remain identical pixel-for-pixel in appearance across all cells.",
      "Bandana color words refer ONLY to the small under-scarf strip visible at the forehead. They NEVER describe the hijab, scarf border, scarf edge, scarf shadow, clothes or background. Do not draw a colored line along the scarf border or on either hanging end.",
      "ANATOMICAL BOUNDARY: the bandana is a short forehead-only insert ending at the left and right temples, completely hidden beneath the hijab elsewhere. It does NOT continue down the cheeks, beneath the chin, around the neck, onto the shoulders, or along either hanging scarf end. In ALL cells the fabric immediately under the chin and around the neck is ONLY the original hijab from IMAGE 2, with its original color and print; never add a contrasting neck ring, piping, collar, undercap edge, or colored trim.",
      "Never recolor any part of the hijab to white, black, beige, off-white or any requested bandana color unless that exact color is already part of IMAGE 2.",
      "The face, body, clothes, background, hijab drape, framing, camera distance, zoom and lighting must be visually identical in every cell.",
      "The ONLY intended difference between cells is the small visible forehead bandana strip: absent in the no-bandana cell, colored only inside that strip in the other cells.",
      "Fill cells left-to-right, then top-to-bottom in this exact order:",
      cells.map(function(c, i){
        return "cell " + (i + 1) + ": " + (c === NO_BANDANA_TOKEN
          ? "NO bandana or undercap exists at all; no dark forehead line or inner fabric; the exact scarf from IMAGE 2 directly frames the forehead."
          : "bandana strip color = " + c + ".");
      }).join("\n"),
      "Do not swap, repeat, merge, or reorder colors.",
      "Use only very thin uniform separators between cells. No labels, text, numbers, decorative borders, or watermarks."
    );
  } else {
    lines.push(
      "Return ONE finished realistic customer photograph only.",
      "No grid, collage, side-by-side, before/after, labels, product-only view, or alternate angle."
    );
  }
  return lines.join("\n");
}

/* مفتاح يوم القاهرة لتليفون — الحارس بيتصفّر كل يوم قاهرة (المالك
   أحيانًا بره مصر، فمينفعش نعتمد على ساعة السيرفر المحلية). */
function phoneDayKeyCairo(phone, nowMs) {
  const p = String(phone || "anon").replace(/[^\d+]/g, "").slice(0, 20) || "anon";
  const d = new Date(typeof nowMs === "number" ? nowMs : Date.now());
  // en-CA بيدّي YYYY-MM-DD، والـtimeZone بيثبّته على القاهرة
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(d);
  return p + "_" + day;
}

/* قرار السقف: العدّاد الحالي (قبل التجربة دي) لازم يكون **أقل** من
   السقف. المساواة = اترفض (يعني السقف N معناه N تجارب بالظبط). */
function guardDecide(currentCount, cap) {
  const c = Number.isFinite(currentCount) ? currentCount : 0;
  const k = Number.isFinite(cap) && cap > 0 ? cap : DEFAULTS.dailyCapPerPhone;
  return { allow: c < k, next: c + 1, cap: k };
}

/* استخراج الصورة من رد Gemini — بيدوّر على أول جزء فيه inlineData
   (صورة). مفيش صورة = خطأ (بيتحوّل لرسالة ودّية). */
function extractImageFromResponse(api) {
  const cands = api && api.candidates;
  if (!Array.isArray(cands) || !cands.length) throw new Error("NO_CANDIDATES");
  const parts = cands[0] && cands[0].content && cands[0].content.parts;
  if (!Array.isArray(parts)) throw new Error("NO_PARTS");
  for (const p of parts) {
    const inl = p && (p.inlineData || p.inline_data);
    if (inl && inl.data) {
      const mime = (inl.mimeType || inl.mime_type || "image/png").toLowerCase();
      return { mime, b64: inl.data };
    }
  }
  throw new Error("NO_IMAGE_IN_RESPONSE");
}

/* تحويل أي خطأ داخلي لرسالة ودّية — **الخام عمره ما بيخرج**. */
function mapError(err) {
  // كل الأخطاء بتوصل العميلة بنفس الرسالة الودّية. التفصيل للّوجز بس.
  return FRIENDLY_ERR;
}

/* ============================================================
   🌐 نداء الموديل — **معزول** عن اللوجيك عشان لو Google غيّرت اسم
   الموديل أو شكل الرد نعدّل مكان واحد بس. مش بيتشغّل في اختبارات
   node (شبكة). ⚠️ أكّد اسم الموديل ومسار الرد من دوكس Google الحالية
   (nano-banana ممكن تبقى gemini-3.1-flash-image بعدين).
   ============================================================ */
async function callGeminiImage(opts) {
  const { apiKey, model, prompt, images, quality, cellCount } = opts;
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) + ":generateContent";
  const parts = [{ text: prompt }];
  for (const img of images) {
    parts.push({ inline_data: { mime_type: img.mime, data: img.b64 } });
  }
  const generationConfig = { responseModalities: ["IMAGE"] };
  const imageConfig = outputImageConfig(model, quality, cellCount);
  if (imageConfig) generationConfig.imageConfig = imageConfig;
  const body = {
    contents: [{ role: "user", parts }],
    generationConfig
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("gemini http", res.status, t.slice(0, 300));
    throw new Error("GEMINI_HTTP_" + res.status);
  }
  const api = await res.json();
  return extractImageFromResponse(api);
}

/* ============================================================
   ☁️ الدالة السحابية — onCall (Admin SDK)
   ------------------------------------------------------------
   🔴 زي درس onlineOrderPlace: onCall بتشتغل بـAdmin SDK يعني قواعد
   الأمان **مبتتطبّقش**. فالحماية لازم تكون **جوه الدالة**: سقف لكل
   تليفون في transaction. من غيره لوب بسيط بيحرق التكلفة.
   ============================================================ */
exports.hijabTryOn = onCall(
  { region: "us-central1", secrets: [GEMINI_API_KEY], memory: "512MiB", timeoutSeconds: 120 },
  async (req) => {
    const db = getFirestore();
    const data = (req && req.data) || {};

    // ١) الإعدادات (سيرفر-سايد) — الموديل/الجودة/السقف/التفعيل
    let cfg = DEFAULTS;
    try {
      const snap = await db.collection(COL_SETTINGS).doc(DOC_SETTINGS).get();
      cfg = resolveConfig(snap.exists ? snap.data() : null);
    } catch (e) { cfg = resolveConfig(null); }

    if (!cfg.enabled) {
      throw new HttpsError("unavailable", FRIENDLY_ERR);
    }

    // ٢) التحقق من الصورتين (النوع + الحجم) — الأخطاء ودّية دايمًا
    let customer, product;
    try {
      customer = validateImageInput(data.customerImage, "customer");
      product = validateImageInput(data.productImage, "product");
    } catch (e) {
      console.error("validate", e.message);
      throw new HttpsError("invalid-argument", FRIENDLY_ERR);
    }

    // ٣) سقف التكلفة لكل تليفون/يوم — transaction. بيخزّن **عدّاد بس**،
    //    لا صورة ولا وش. الرفض بسبب واضح للعميلة.
    const phone = (typeof data.phone === "string" && data.phone) ? data.phone : "anon";
    // 🧢 طلب البندانة — بوليان بس. الموديل/اللون **مش** بيوصلوا هنا:
    //    التوليد بيطلّع بندانة فاتحة محايدة، والألوان بتتعمل بالكود
    //    على جهاز العميلة مجانًا. أقل مدخلات = أقل سطح خطأ.
    const withBandana = data.withBandana === true;
    /* 🎨 ألوان البندانة المتاحة — البايعة بتحددها مع المنتج.
       بنقيّدها ونظّفها: نصوص قصيرة، ٣ بالظبط (شبكة ٢×٢ مليانة —
       شوف computeGridCells)، ومن غير محارف غريبة تلخبط
       البرومبت أو تسمح بحقن تعليمات. */
    const bandanaColors = Array.isArray(data.bandanaColors)
      ? data.bandanaColors
          .filter((c) => typeof c === "string")
          .map((c) => c.replace(/[^a-zA-Z \-]/g, "").trim().slice(0, 24))
          .filter((c) => c.length >= 2)
          .slice(0, BANDANA_CELLS)   // 🔴 ٣ بالظبط — computeGridCells بتكمّل لو أقل
      : null;
    const gkey = phoneDayKeyCairo(phone, Date.now());
    const gref = db.collection(COL_GUARD).doc(gkey);
    try {
      await db.runTransaction(async (tx) => {
        const g = await tx.get(gref);
        const cur = g.exists ? (g.data().count || 0) : 0;
        const dec = guardDecide(cur, cfg.dailyCapPerPhone);
        if (!dec.allow) throw new HttpsError("resource-exhausted",
          "جرّبتي عدد كبير النهاردة 🙏 جرّبي بكرة تاني.");
        tx.set(gref, {
          count: dec.next,
          updatedAt: FieldValue.serverTimestamp()
          // 🔒 عمدًا: مفيش صورة/تليفون كامل/وش هنا — عدّاد بس
        }, { merge: true });
      });
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      console.error("guard", e.message);
      throw new HttpsError("unavailable", FRIENDLY_ERR);
    }

    // ٤) نداء الموديل — المفتاح من Secret Manager. النتيجة بترجع
    //    للعميلة على طول. **مفيش أي كتابة للصورة في Firestore/Storage.**
    try {
      const out = await callGeminiImage({
        apiKey: GEMINI_API_KEY.value(),
        model: cfg.model,
        quality: cfg.quality,
        cellCount: withBandana ? computeGridCells(true, bandanaColors).length : 1,
        prompt: buildTryOnPrompt({ withBandana: withBandana,
                                    bandanaColors: bandanaColors }),
        images: [
          { mime: customer.mime, b64: customer.b64 },
          { mime: product.mime, b64: product.b64 }
        ]
      });
      return {
        image: "data:" + out.mime + ";base64," + out.b64,
        mime: out.mime,
        productId: (typeof data.productId === "string") ? data.productId : null,
        /* 🎨 خانات الشبكة **بترتيبها** — "none" الأول دايمًا (بدون
           بندانة) وبعدها الألوان المطلوبة. العميل بيقص الخانات على
           أساس الترتيب ده بالظبط. null = صورة عادية مش شبكة (مفيش
           بندانة اتطلبت خالص). */
        bandanaColors: computeGridCells(withBandana, bandanaColors)
        // 🔒 بنرجّع الصورة وخلاص. متتخزّنش عندنا.
      };
    } catch (e) {
      console.error("generate", e && e.message);
      throw new HttpsError("unavailable", mapError(e));
    }
  }
);

/* ============================================================
   تصدير الدوال النقية للاختبار — من غير ما نشغّل firebase-functions
   ============================================================ */
if (typeof module !== "undefined" && module.exports) {
  module.exports.resolveConfig = resolveConfig;
  module.exports.validateImageInput = validateImageInput;
  module.exports.buildTryOnPrompt = buildTryOnPrompt;
  module.exports.computeGridCells = computeGridCells;
  module.exports.computeGridLayout = computeGridLayout;
  module.exports.outputImageConfig = outputImageConfig;
  module.exports.NO_BANDANA_TOKEN = NO_BANDANA_TOKEN;
  module.exports.phoneDayKeyCairo = phoneDayKeyCairo;
  module.exports.guardDecide = guardDecide;
  module.exports.extractImageFromResponse = extractImageFromResponse;
  module.exports.mapError = mapError;
  module.exports.DEFAULTS = DEFAULTS;
  module.exports.MIME_ALLOWED = MIME_ALLOWED;
  module.exports.MAX_IMAGE_BYTES = MAX_IMAGE_BYTES;
  module.exports.FRIENDLY_ERR = FRIENDLY_ERR;
}
