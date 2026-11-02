/* ============================================================
   🤖 atelierAssistant.js — مساعدين غرفة القياس (Gemini — نفس المفتاح)
   ------------------------------------------------------------
   · atelierAdminAssistant (للموظفين بس): شات جوّه صفحة الإدارة.
     بتكتبي «الكينار كله ب 700» أو بترفعي صور، وهو بيرد ويقترح
     تعديلات (اسم/لون/سعر/موديل/إنجليزي/نصوص الموقع). **التعديلات
     بترجع للصفحة كاقتراح** — مفيش حاجة بتتحفظ غير لما تدوسي «حفظ».
   · atelierStylist (للعميلات، دخول مجهول كفاية): منسّقة بتساعد
     العميلة تختار — بتقترح قطع من المجموعة بس، وبترد على أسئلة
     التوصيل والفروع. سقف رسايل لكل عميلة/يوم وسقف للمتجر.
   🔒 مفيش صور عملاء هنا خالص. صور المنتجات بس (للإدارة).
   النشر:
     firebase deploy --only functions:atelierAdminAssistant,functions:atelierStylist
   ============================================================ */
"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { requireAtelierAdmin } = require("./atelierAdmins");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const COL_SETTINGS = "pos_test_settings";
const DOC_SETTINGS = "tryon_ai";
const COL_GUARD = "tryon_ai_guard";
// الموديل بيتغيّر من tryon_ai.assistantModel — ولو مش موجود بنجرّب البديل
const MODELS = ["gemini-2.5-flash", "gemini-flash-latest"];
const LINES = ["crepe", "plisse", "mono", "zebre", "kinar", "chiffon", "isdal", "other"];
const ITEM_FIELDS = ["name", "nameEn", "colorName", "colorEn", "family", "familyEn", "price", "line", "active", "barcode"];
const SITE_FIELDS = ["eyebrow", "title1", "title2", "sub", "statement", "marquee", "chatText",
  "eyebrowEn", "title1En", "title2En", "subEn", "statementEn", "marqueeEn", "chatTextEn"];
/* 📣 إعدادات التسويق اللي المساعد يقدر يحطها — بنفس فحص marketing.js بالظبط */
const MKT_RX = {
  metaPixelId: /^\d{10,20}$/, ga4Id: /^G-[A-Z0-9]{4,14}$/, tiktokPixelId: /^[A-Z0-9]{12,30}$/,
  googleAdsId: /^AW-\d{6,14}$/, googleAdsPurchaseLabel: /^[\w-]{4,40}$/, whatsapp: /^\d{10,15}$/
};
const SOCIAL_HOSTS = { instagramUrl: ["instagram.com"], facebookUrl: ["facebook.com", "fb.com"], tiktokUrl: ["tiktok.com"] };
const MKT_FIELDS = Object.keys(MKT_RX).concat(Object.keys(SOCIAL_HOSTS));
function cleanSocial(k, v) {
  let u; try { u = new URL(String(v || "").trim()); } catch (e) { return ""; }
  const h = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || !SOCIAL_HOSTS[k].some((d) => h === d || h.endsWith("." + d))) return "";
  return (u.origin + u.pathname).replace(/\/+$/, "").slice(0, 200);
}
function cleanMkt(fields) {
  const f = {};
  MKT_FIELDS.forEach((k) => {
    if (!(k in (fields || {}))) return;
    let v = String(fields[k] == null ? "" : fields[k]).trim();
    if (SOCIAL_HOSTS[k]) { v = cleanSocial(k, v); if (v) f[k] = v; return; }
    if (k === "ga4Id" || k === "tiktokPixelId" || k === "googleAdsId") v = v.toUpperCase();
    if (k === "whatsapp") { v = v.replace(/[^\d]/g, ""); if (/^0\d{10}$/.test(v)) v = "2" + v; }
    if (MKT_RX[k].test(v)) f[k] = v;
  });
  return f;
}

const STYLIST_CAP_USER = 25, STYLIST_CAP_GLOBAL = 3000, ADMIN_CAP_DAY = 300;

/* ============================================================
   دوال نقية — بتتختبر
   ============================================================ */
function clean(v, max) {
  return String(v == null ? "" : v).replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max || 200);
}
function cleanHistory(h) {
  return (Array.isArray(h) ? h : []).slice(-8).map((m) => ({
    role: m && m.role === "model" ? "model" : "user", text: clean(m && m.text, 1500)
  })).filter((m) => m.text);
}

/* القايمة اللي جاية من الصفحة — بنحتفظ بالحقول المعروفة بس */
function cleanItems(list) {
  return (Array.isArray(list) ? list : []).slice(0, 200).map((it) => ({
    id: String(it && it.id || "").replace(/[^\w-]/g, "").slice(0, 60),
    isNew: !!(it && it.isNew),
    name: clean(it.name, 60), nameEn: clean(it.nameEn, 60), colorName: clean(it.colorName, 30), colorEn: clean(it.colorEn, 40),
    family: clean(it.family, 40), familyEn: clean(it.familyEn, 40), price: Math.max(0, Math.round(Number(it.price) || 0)),
    line: LINES.includes(it.line) ? it.line : "other", active: it.active !== false, barcode: clean(it.barcode, 40)
  })).filter((it) => it.id);
}

function buildAdminPrompt(items, site, imageIds, mkt) {
  return [
    "You are the in-house assistant of echarpe, an Egyptian hijab store, inside its website admin page.",
    "The owner talks to you in Egyptian Arabic (sometimes English). ALWAYS reply in short, friendly Egyptian Arabic.",
    "You help add and edit products of the try-on website: names, colour names (Arabic + English), prices in EGP, model (family) names, line, visibility, and the website texts.",
    "Products of the same model share the same 'family' (that is how colours of one model are grouped on the site).",
    "Lines: crepe, plisse, mono, zebre, kinar (Kuwaiti linen with border), chiffon, isdal (prayer dress), other.",
    "When the owner asks for a change, return it in 'actions'. Use op 'set' with the item id and ONLY the fields to change; op 'site' for website texts.",
    "Never invent item ids — only use ids from the CURRENT ITEMS list. If something is ambiguous, ask in 'reply' and return no actions.",
    "If photos are attached, they are product photos of NEW items (ids listed below in the same order). Look at each one and suggest colourName (Arabic, the usual Egyptian shop name, e.g. أسود، أوف وايت، بيج، موكا، كحلي، روز، زيتي…), colorEn, and if clear the family and line.",
    "English colour names are short and elegant (e.g. 'Black with White Border', 'Stone Beige'). English model names are title case.",
    "MARKETING (op 'mkt'): you can set metaPixelId (digits), ga4Id (G-XXXX), tiktokPixelId, googleAdsId (AW-digits), googleAdsPurchaseLabel, whatsapp (international digits, e.g. 2010…), instagramUrl, facebookUrl, tiktokUrl (full https profile links).",
    "If the owner pastes a whole tracking snippet or a page URL, EXTRACT only the ID (e.g. from fbq('init', '123…') take 123…; from gtag/js?id=G-ABC take G-ABC; from ttq.load('C…') take C…; from a Google Ads snippet AW-…/label take both).",
    "If she asks where to find an ID, explain briefly in Egyptian Arabic: Meta → Events Manager → Data sources → the Pixel → ID; Google Analytics → Admin → Data streams → the web stream → Measurement ID (G-…); TikTok → Ads Manager → Assets → Events → Web events → the pixel ID; Google Ads → Goals → Conversions → the purchase action → Tag setup (AW-… and the label).",
    "Keep 'reply' under 80 words. Summarise what you changed so the owner can review. Product/site changes need «حفظ»; marketing settings are saved automatically when she taps apply.",
    "",
    "CURRENT ITEMS (JSON): " + JSON.stringify(items.map((it) => {
      const o = { id: it.id, name: it.name, colorName: it.colorName, family: it.family, price: it.price, line: it.line };
      if (it.nameEn) o.nameEn = it.nameEn; if (it.colorEn) o.colorEn = it.colorEn; if (it.familyEn) o.familyEn = it.familyEn;
      if (!it.active) o.active = false; if (it.isNew) o.isNew = true;
      return o;
    })),
    "WEBSITE TEXTS (JSON): " + JSON.stringify(site || {}),
    "CURRENT MARKETING SETTINGS (JSON): " + JSON.stringify(mkt || {}),
    imageIds.length ? "ATTACHED PHOTOS belong to these new item ids, in order: " + JSON.stringify(imageIds) : "No photos attached."
  ].join("\n");
}

const ADMIN_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    actions: { type: "ARRAY", items: { type: "OBJECT", properties: {
      op: { type: "STRING", enum: ["set", "site", "mkt"] },
      id: { type: "STRING" },
      fields: { type: "OBJECT", properties: {
        name: { type: "STRING" }, nameEn: { type: "STRING" }, colorName: { type: "STRING" }, colorEn: { type: "STRING" },
        family: { type: "STRING" }, familyEn: { type: "STRING" }, price: { type: "NUMBER" }, line: { type: "STRING" },
        active: { type: "BOOLEAN" }, barcode: { type: "STRING" },
        eyebrow: { type: "STRING" }, title1: { type: "STRING" }, title2: { type: "STRING" }, sub: { type: "STRING" },
        statement: { type: "STRING" }, marquee: { type: "STRING" }, chatText: { type: "STRING" },
        eyebrowEn: { type: "STRING" }, title1En: { type: "STRING" }, title2En: { type: "STRING" }, subEn: { type: "STRING" },
        statementEn: { type: "STRING" }, marqueeEn: { type: "STRING" }, chatTextEn: { type: "STRING" },
        metaPixelId: { type: "STRING" }, ga4Id: { type: "STRING" }, tiktokPixelId: { type: "STRING" }, googleAdsId: { type: "STRING" },
        googleAdsPurchaseLabel: { type: "STRING" }, whatsapp: { type: "STRING" },
        instagramUrl: { type: "STRING" }, facebookUrl: { type: "STRING" }, tiktokUrl: { type: "STRING" }
      } }
    }, required: ["op", "fields"] } }
  },
  required: ["reply", "actions"]
};

/* التعديلات اللي رجعت من الموديل — بنقبل بس id موجود وحقول معروفة وقيم نضيفة */
function sanitizeAdminActions(raw, items) {
  const ids = new Set(items.map((it) => it.id));
  const out = [];
  (Array.isArray(raw) ? raw : []).slice(0, 120).forEach((a) => {
    if (!a || typeof a.fields !== "object" || !a.fields) return;
    const f = {};
    if (a.op === "set") {
      if (!ids.has(a.id)) return;
      ITEM_FIELDS.forEach((k) => {
        if (!(k in a.fields)) return;
        const v = a.fields[k];
        if (k === "price") { const n = Math.round(Number(v)); if (Number.isFinite(n) && n >= 0 && n <= 100000) f.price = n; }
        else if (k === "active") { if (typeof v === "boolean") f.active = v; }
        else if (k === "line") { if (LINES.includes(v)) f.line = v; }
        else if (k === "barcode") { const b = String(v || "").replace(/[^\w-]/g, "").slice(0, 40); f.barcode = b; }
        else f[k] = clean(v, /En$/.test(k) || k === "name" ? 60 : 40);
      });
      if (Object.keys(f).length) out.push({ op: "set", id: a.id, fields: f });
    } else if (a.op === "site") {
      SITE_FIELDS.forEach((k) => { if (k in a.fields) f[k] = clean(a.fields[k], 400); });
      if (Object.keys(f).length) out.push({ op: "site", fields: f });
    } else if (a.op === "mkt") {
      const m = cleanMkt(a.fields);
      if (Object.keys(m).length) out.push({ op: "mkt", fields: m });
    }
  });
  return out;
}

/* 🧕 المنسّقة — الكتالوج من الصفحة (أسماء وألوان وأسعار بس) */
function cleanCatalog(list) {
  return (Array.isArray(list) ? list : []).slice(0, 120).map((p) => ({
    id: String(p && p.id || "").replace(/[^\w-]/g, "").slice(0, 60),
    name: clean(p.name, 70), color: clean(p.color, 40), price: Math.max(0, Math.round(Number(p.price) || 0)),
    tried: !!p.tried
  })).filter((p) => p.id && p.name);
}
function buildStylistPrompt(catalog, info, lang) {
  const en = lang !== "ar";
  return [
    "You are the personal stylist of echarpe, an Egyptian hijab boutique, chatting with a customer on its try-on website.",
    en ? "Reply in warm, elegant, concise English." : "Reply in warm, elegant, concise Egyptian Arabic, addressing a woman (feminine forms).",
    "Help her choose hijabs: colours that suit her outfit, skin tone, occasion or season; how to style them; fabric feel (linen and chiffon are light summer fabrics).",
    "Only recommend pieces from the CATALOG below, by id, in 'picks' (max 4). Never invent products, prices or discounts.",
    "Pieces marked tried=true were already tried on her photo; you may mention she can compare them.",
    "To see a piece on herself she taps it and presses 'Try it on'. To buy: add to bag, then complete the order (home delivery or pickup from a branch).",
    "STORE INFO: " + JSON.stringify(info || {}),
    "If she asks something you don't know (stock of a specific branch, exact delivery day, custom orders), tell her kindly to message the team in the chat, and set handoff=true.",
    "Stay on topic (hijabs, styling, the store). Keep replies under 70 words. No markdown.",
    "CATALOG (JSON): " + JSON.stringify(catalog)
  ].join("\n");
}
const STYLIST_SCHEMA = {
  type: "OBJECT",
  properties: { reply: { type: "STRING" }, picks: { type: "ARRAY", items: { type: "STRING" } }, handoff: { type: "BOOLEAN" } },
  required: ["reply"]
};
function sanitizeStylist(raw, catalog) {
  const ids = new Set(catalog.map((p) => p.id));
  const r = raw || {};
  return {
    reply: String(r.reply || "").replace(/[<>]/g, "").trim().slice(0, 900),
    picks: (Array.isArray(r.picks) ? r.picks : []).map(String).filter((id) => ids.has(id)).slice(0, 4),
    handoff: r.handoff === true
  };
}

function capDecide(count, cap) {
  const c = Math.max(0, Number(count) || 0);
  return { allow: c < cap, next: c + 1 };
}
function cairoDay(nowMs) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(nowMs || Date.now()));
}

/* نداء Gemini بنص (وصور منتجات اختياري) ورد JSON بشكل محدد */
async function callGeminiJson({ apiKey, models, system, history, message, images, schema }) {
  const parts = [{ text: message }];
  (images || []).forEach((im) => parts.push({ inline_data: { mime_type: im.mime, data: im.b64 } }));
  const contents = (history || []).map((m) => ({ role: m.role, parts: [{ text: m.text }] }))
    .concat([{ role: "user", parts }]);
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.4 }
  };
  let lastErr = null;
  for (const model of models) {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(body) });
    if (res.status === 404) { lastErr = new Error("GEMINI_HTTP_404"); continue; }      // الموديل مش متاح → البديل
    if (!res.ok) { const t = await res.text().catch(() => ""); console.error("assistant gemini", res.status, t.slice(0, 300)); throw new Error("GEMINI_HTTP_" + res.status); }
    const api = await res.json();
    const txt = (((api.candidates || [])[0] || {}).content || {}).parts || [];
    const s = txt.map((p) => p.text || "").join("");
    try { return JSON.parse(s); } catch (e) { throw new Error("BAD_JSON"); }
  }
  throw lastErr || new Error("NO_MODEL");
}

async function bumpGuard(db, key, cap) {
  const ref = db.collection(COL_GUARD).doc(key);
  return db.runTransaction(async (tx) => {
    const g = await tx.get(ref);
    const dec = capDecide(g.exists ? g.data().count : 0, cap);
    if (!dec.allow) return false;
    tx.set(ref, { count: dec.next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
}
async function modelList(db) {
  try {
    const d = await db.collection(COL_SETTINGS).doc(DOC_SETTINGS).get();
    const m = d.exists && d.data().assistantModel;
    if (typeof m === "string" && /^[\w.-]{3,60}$/.test(m)) return [m].concat(MODELS.filter((x) => x !== m));
  } catch (e) { }
  return MODELS;
}
function isStaff(req) {
  const t = req && req.auth && req.auth.token;
  return !!(t && t.firebase && t.firebase.sign_in_provider === "password");
}
function productImages(list) {
  return (Array.isArray(list) ? list : []).slice(0, 12).map((im) => {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(im && im.image || ""));
    if (!m || m[2].length > 400000) return null;          // صور مصغّرة بس (~300KB)
    return { id: String(im.id || "").replace(/[^\w-]/g, "").slice(0, 60), mime: m[1], b64: m[2] };
  }).filter(Boolean);
}

/* ============================================================
   ☁️ الدوال
   ============================================================ */
exports.atelierAdminAssistant = onCall(
  { region: "us-central1", secrets: [GEMINI_API_KEY], memory: "512MiB", timeoutSeconds: 120 },
  async (req) => {
    if (!isStaff(req)) throw new HttpsError("permission-denied", "للموظفين بس");
    const db = getFirestore();
    await requireAtelierAdmin(req, db);
    const data = (req && req.data) || {};
    const message = clean(data.message, 2000);
    const imgs = productImages(data.images);
    if (!message && !imgs.length) throw new HttpsError("invalid-argument", "اكتبي رسالة");
    const items = cleanItems(data.items);
    const site = {};
    SITE_FIELDS.forEach((k) => { if (data.site && data.site[k]) site[k] = clean(data.site[k], 300); });
    const mkt = {};
    MKT_FIELDS.forEach((k) => { if (data.mkt && data.mkt[k]) mkt[k] = clean(data.mkt[k], 200); });
    if (!(await bumpGuard(db, "asst_admin_" + cairoDay(), ADMIN_CAP_DAY)))
      throw new HttpsError("resource-exhausted", "المساعد خلّص رسايل النهاردة — نكمّل بكرة");
    try {
      const out = await callGeminiJson({
        apiKey: GEMINI_API_KEY.value(), models: await modelList(db),
        system: buildAdminPrompt(items, site, imgs.map((i) => i.id), mkt),
        history: cleanHistory(data.history), message: message || "اقترحي أسماء وألوان للصور دي",
        images: imgs, schema: ADMIN_SCHEMA
      });
      return { reply: clean(out && out.reply, 1200) || "تمام", actions: sanitizeAdminActions(out && out.actions, items) };
    } catch (e) {
      console.error("admin assistant", e && e.message);
      throw new HttpsError("unavailable", "المساعد مش متاح دلوقتي — جرّبي تاني كمان شوية");
    }
  }
);

exports.atelierStylist = onCall(
  { region: "us-central1", secrets: [GEMINI_API_KEY], memory: "256MiB", timeoutSeconds: 60 },
  async (req) => {
    const uid = req && req.auth && req.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "سجّلي دخول");
    const db = getFirestore();
    const data = (req && req.data) || {};
    const lang = data.lang === "ar" ? "ar" : "en";
    const message = clean(data.message, 600);
    if (!message) throw new HttpsError("invalid-argument", "EMPTY");
    const catalog = cleanCatalog(data.catalog);
    const info = {
      branches: (Array.isArray(data.info && data.info.branches) ? data.info.branches : []).slice(0, 8).map((b) => clean(b, 40)),
      shippingFee: Math.max(0, Math.round(Number(data.info && data.info.shippingFee) || 0)),
      currency: "EGP", tryOnPerDay: "1 free round of 6 looks, plus 1 more after adding a piece to the bag"
    };
    const day = cairoDay(), u = String(uid).replace(/[^\w]/g, "").slice(0, 40);
    const okUser = await bumpGuard(db, "asst_st_" + u + "_" + day, STYLIST_CAP_USER);
    const okAll = okUser && await bumpGuard(db, "asst_st_all_" + day, STYLIST_CAP_GLOBAL);
    if (!okUser || !okAll) throw new HttpsError("resource-exhausted", lang === "ar"
      ? "اتكلمنا كتير النهاردة 🤍 كلّمي الفريق في الشات وهيساعدوكِ على طول." : "We’ve chatted a lot today 🤍 Message our team in the chat and they’ll help right away.");
    try {
      const out = await callGeminiJson({
        apiKey: GEMINI_API_KEY.value(), models: await modelList(db),
        system: buildStylistPrompt(catalog, info, lang), history: cleanHistory(data.history), message, schema: STYLIST_SCHEMA
      });
      return sanitizeStylist(out, catalog);
    } catch (e) {
      console.error("stylist", e && e.message);
      throw new HttpsError("unavailable", lang === "ar" ? "المنسّقة مش متاحة دلوقتي — جرّبي تاني كمان شوية" : "Your stylist is unavailable right now — please try again shortly");
    }
  }
);

if (typeof module !== "undefined" && module.exports) {
  Object.assign(module.exports, { buildAdminPrompt, sanitizeAdminActions, cleanItems, cleanHistory, buildStylistPrompt,
    sanitizeStylist, cleanCatalog, cleanMkt, MKT_FIELDS, capDecide, productImages, ADMIN_SCHEMA, STYLIST_SCHEMA, MODELS });
}
