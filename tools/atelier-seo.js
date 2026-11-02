#!/usr/bin/env node
/* 🔎 بيكتب بيانات المنتجات لجوجل (JSON-LD) جوّه atelier/index.html
   من مجموعة الدار (atelier-core.js) — نسخة ثابتة يقراها جوجل من غير
   ما يشغّل الصفحة. الصفحة نفسها بتحدّثها بالمنتجات الحيّة كمان.
   شغّليه بعد أي تعديل في HOUSE:  node tools/atelier-seo.js
   (الاختبار test-atelier-lookbook بيفشل لو نسيتي). */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const AC = require(path.join(ROOT, "atelier", "atelier-core.js"));
function build() {
  const prods = AC.houseCollection("collection/").map((p) => AC.localizeProduct(p, "en"));
  const ld = AC.productJsonLd(prods, (p) => AC.SITE_URL + "/atelier/" + p.img, "en");
  return '<script type="application/ld+json" id="ldjson">' + JSON.stringify(ld) + "</script>";
}
const FILE = path.join(ROOT, "atelier", "index.html");
const RE = /<!-- seo:ld -->[\s\S]*?<!-- \/seo:ld -->/;
function expected(html) { return html.replace(RE, "<!-- seo:ld -->" + build() + "<!-- /seo:ld -->"); }
if (require.main === module) {
  const html = fs.readFileSync(FILE, "utf8");
  if (!RE.test(html)) { console.error("markers <!-- seo:ld --> missing in atelier/index.html"); process.exit(1); }
  fs.writeFileSync(FILE, expected(html));
  console.log("atelier/index.html: JSON-LD updated");
}
module.exports = { build, expected, RE };
