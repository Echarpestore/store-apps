# فيديو شرح الشات — نسخة «استلام من الفرع أو توصيل»

`echarpe-chat-pickup-delivery.mp4` — طولي 1080×1920، 30fps، 73 ثانية، بمزيكا ومؤثرات صوت. كل الرسومات SVG.

نسخة عامة تنفع لكل المحافظات: من غير طرق دفع، ومن غير «المندوب مستني» أو «المرتجع مع المندوب».

المشاهد: ابعتيلنا صورة فستانك ← ستايليست بتختارلك ← جرّبيها عليكي ← صورتك بتفضل على موبايلك ← اطلبيها (اختيار طريقة الاستلام) ← استلمي من أي فرع أو المندوب يوصلك لحد البيت ← حمّلي التطبيق / خطوات الآيفون ← الخاتمة.

## إعادة الرندر
```bash
cd promo/chat-video-delivery/source
node render.js frames frames 30
python3 audio.py track.wav
ffmpeg -framerate 30 -i frames/f_%05d.jpg -i track.wav -c:v libx264 -crf 19 -pix_fmt yuv420p \
  -af loudnorm=I=-15:TP=-1.5 -c:a aac -b:a 192k -shortest -movflags +faststart ../echarpe-chat-pickup-delivery.mp4
```
