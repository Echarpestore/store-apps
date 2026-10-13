# فيديو تطبيق إيشارب ونادي النقاط

`echarpe-app-loyalty.mp4` — موشن جرافيك طولي 1080×1920، 30fps، 56 ثانية، بمزيكا ومؤثرات صوت. كل الرسومات SVG.

المشاهد:
1. آلاف القطع في فروعنا (رفوف مليانة طرح وبندانات)
2. منتجات أصلية
3. اطلبي من التطبيق (تبويب «اطلبي» والشنطة)
4. مع كل شراء بتجمعي نقاط (كارت «نادي إيشارب»)
5. استبدلي نقاطك بخصم — الكود للكاشير في أي فرع
6. عروضي / فواتيري / اطلبي / تواصل
7. أندرويد من Google Play، آيفون نسخة الويب ← الخاتمة

> رقم «١٠٠ نقطة = خصم ٥٠ ج.م» مثال مبني على الإعدادات الافتراضية في الكود (١٠ نقاط = ٥ ج.م)؛ عدّليه لو القيم الفعلية مختلفة.

## إعادة الرندر
```bash
cd promo/app-video/source
node render.js frames frames 30
python3 audio.py track.wav
ffmpeg -framerate 30 -i frames/f_%05d.jpg -i track.wav -c:v libx264 -crf 19 -pix_fmt yuv420p \
  -af loudnorm=I=-15:TP=-1.5 -c:a aac -b:a 192k -shortest -movflags +faststart ../echarpe-app-loyalty.mp4
```
