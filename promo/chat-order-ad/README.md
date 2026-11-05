# إعلان «اطلبي طرحتك من الشات»

`echarpe-chat-order-ad.mp4`: إعلان موشن جرافيك طولي 1080×1920، 30fps، 31 ثانية، بمزيكا ومؤثرات صوت. لونه وردي زي شات تطبيق إيشارب، وصور الطرح حقيقية من `atelier/collection`. الفستان والعارضة رسومات، مفيش صور أشخاص.

المشاهد:
1. «لسه بتلفّي على المحلات؟» مع صور طرح بتظهر بسرعة.
2. اطلبي طرحتك من الشات: التطبيق ← «اطلبي من الشات».
3. «عندي فرح ولابسة الفستان ده» ← ستايليست إيشارب تقترح ٣ طرح بأسعارها.
4. جرّبيها عليكِ: الطرحة بتغيّر ألوانها على العارضة.
5. أكّدي طلبك: توصيل للبيت أو استلام من الفرع ← «طلبك اتأكد».
6. لحد باب البيت 🛵، أو من الفروع: الرحاب، مدينتي، سيتي سنتر.
7. «آلاف الطرح… في شات واحد»، Google Play، آيفون من Safari، echarpe.store/loyalty.

## إعادة الرندر
```bash
cd promo/chat-order-ad/source
node render.js frames frames 30
python3 audio.py track.wav
ffmpeg -framerate 30 -i frames/f_%05d.jpg -i track.wav -c:v libx264 -crf 20 -pix_fmt yuv420p \
  -af loudnorm=I=-15:TP=-1.5 -c:a aac -b:a 192k -shortest -movflags +faststart ../echarpe-chat-order-ad.mp4
```
