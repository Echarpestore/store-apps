/* 🔎 paymobProbe — اختبار مؤقت (01-10-2026): Paymob بيرد 403 من nginx على سيرفرنا في us-central1
   وبيرد عادي من مصر. الدالة دي بتتنشر في كذا منطقة وبتجرّب /auth/tokens **بمفتاح وهمي**
   (مفيش أي مفتاح حقيقي ولا فلوس) وبترجّع: المنطقة + كود الرد + أول جزء منه.
   JSON ({"detail":"incorrect credentials"}) = المنطقة دي مقبولة · <html>403 = محجوبة.
   تتمسح بعد ما ننقل paymobTerminalOrder:  firebase functions:delete paymobProbe */
const { onRequest } = require("firebase-functions/v2/https");

exports.paymobProbe = onRequest(
  { region: ["us-central1", "europe-west1", "me-central1"], cors: true, maxInstances: 1 },
  async (req, res) => {
    const region = process.env.FUNCTION_REGION || process.env.GCLOUD_REGION || "?";
    try {
      const r = await fetch("https://accept.paymob.com/api/auth/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: "probe-not-a-real-key" })
      });
      const text = await r.text();
      const blocked = /^\s*</.test(text);
      res.json({ region, status: r.status, verdict: blocked ? "❌ محجوبة" : "✅ مقبولة", body: text.replace(/\s+/g, " ").slice(0, 120) });
    } catch (e) {
      res.json({ region, verdict: "❌ خطأ اتصال", error: String(e.message || e) });
    }
  }
);
