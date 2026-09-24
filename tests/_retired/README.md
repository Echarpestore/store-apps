# اختبارات متقاعدة — متتشغّلش
اختبارات منظومة finance/InstaPay بتاعة ChatGPT (v679–v684). المنظومة نفسها **اتشالت**
بعد كارثة الكوتة 18 سبتمبر (62 دالة ← 29) وملفاتها في `functions/_disabled-reference/`.
إنستاباي الحالي (دالتين) ليه اختباراته: `test-instapay-core` · `test-instapay-pos` · `test-instapay-tablet`.
محفوظين كمرجع بس. `run.js` بيشغّل `tests/test-*.js` في الجذر فقط.

- `test-paymob-delayed-webhook-recovery-v386` — زرار إنقاذ Paymob بعد 8ث. اتشال 06-09 و**قرار المالك 20-09 إنه ميرجعش**.
- `test-time-credit-1` — نسخة مطابقة بايت ببايت لـ`test-time-credit` (اسم «-1» = ملف اتنزّل مرتين واترفع بالغلط).

## test-tryon.js (23-09)
بيفحص صفحة البروفة **الحية** (كاميرا + 3D + إعادة التلوين) في `tryon/index.html`. الصفحة دي اتبطّلت:
البروفة الحالية = `tryon/photo.html` (الـAI) وليها اختباراتها (`test-tryon-photo` · `test-tryon-ai` · `test-tryon-outfit` · …).
`tryon/index.html` بقى تحويل لنادي العملاء (كان نسخة غلط من تطبيق العملاء). الصفحة الحية القديمة محفوظة في `tryon37/`.
