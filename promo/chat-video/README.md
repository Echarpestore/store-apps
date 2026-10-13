# فيديو شرح شات إيشارب

`echarpe-chat-explainer.mp4` — موشن جرافيك طولي 1080×1920، 30fps، مدته 56 ثانية (مناسب للريلز والستوري والتيك توك).

المشاهد: افتحي الشات ← جرّبي الطرحة ← جرّبي البندانة ← اطلبي ← المندوب في الطريق ← المندوب مستني تجربي ← كاش / كارت / مرتجع / استلام من الفرع ← الخاتمة.

## التعديل وإعادة الرندر
الفيديو معمول كصفحة HTML (`source/index.html`) فيها دالة `seek(t)` بترسم كل لحظة. عشان تعدّلي نص أو توقيت:

```bash
cd promo/chat-video/source
node render.js frames frames 30          # بيطلع 1680 صورة
ffmpeg -framerate 30 -i frames/f_%05d.jpg -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart ../echarpe-chat-explainer.mp4
```
(محتاج `playwright` و `ffmpeg`.) الفيديو من غير صوت — ضيفي مزيكا أو تعليق صوتي في أي برنامج مونتاج.
