# فيديو شرح شات إيشارب

`echarpe-chat-explainer.mp4` — موشن جرافيك طولي 1080×1920، 30fps، 64 ثانية، بمزيكا ومؤثرات صوت. كل الرسومات SVG (مفيش صور حقيقية).

المشاهد:
1. ابعتيلنا صورة طقمك (أو اكتبي الخامة واللون)
2. ستايليست متخصصة بتختارلك من بين آلاف المنتجات
3. جرّبيها عليكي — شاشة التجربة مرسومة SVG + تغيير لون البندانة
4. خصوصيتك: صورتك بتفضل على موبايلك، مش بتتبعت ولا بتتخزن
5. اطلبيها من الشات ← المندوب في الطريق ← المندوب مستني تجربي
6. كاش / كارت / مرتجع سهل / استلام من الفرع ← الخاتمة

## إعادة الرندر
```bash
cd promo/chat-video/source
node render.js frames frames 30              # 1920 صورة (محتاج playwright)
python3 audio.py track.wav                   # المزيكا والمؤثرات (numpy)
ffmpeg -framerate 30 -i frames/f_%05d.jpg -i track.wav -c:v libx264 -crf 19 -pix_fmt yuv420p \
  -af loudnorm=I=-15:TP=-1.5 -c:a aac -b:a 192k -shortest -movflags +faststart ../echarpe-chat-explainer.mp4
```
النصوص والتوقيتات كلها في `source/index.html` (دالة `seek(t)`).
