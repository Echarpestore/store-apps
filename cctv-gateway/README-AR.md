# ECHARPE CCTV Gateway

الجزء اللي بيشتغل على كمبيوتر الفرع ويربط الكاميرات بالـPOS والـOffice: لايف، تسجيل، فيديو الفاتورة، لقطات، وتنبيهات.

> **الحالة (11-10-2026):** الكود ده هو اللي شغال فعلًا في فرع **مدينتي** (recorder v711 + supervisor v700).
> **لسه مش موجود:** تثبيت بخطوة واحدة لفرع جديد. الـrecorder لسه مكتوب لمدينتي (اسم الفرع والكاميرات 4 و8 جوّه الكود). شوف «الناقص» تحت.

## الأجزاء

| الجزء | الملف | بيعمل إيه |
|---|---|---|
| go2rtc | (برنامج خارجي 1.9.14) + `madinaty/go2rtc.example.yaml` | اللايف واللقطات — `127.0.0.1:1984` |
| الـagent / الـrecorder | `madinaty/ECHARPE-MADINATY-RECORDER.ps1` | التسجيل + API الفيديو والأحداث — `127.0.0.1:1985` |
| Supervisor | `madinaty/MADINATY-CCTV-SUPERVISOR-v700.ps1` + `INSTALL-v700.ps1` | بيرجّع أي جزء يقع (go2rtc / agent / tunnel) من غير ما يوقّع الباقي |
| كاشف الأشخاص | `madinaty/ECHARPE-MADINATY-PERSON-DETECTOR.py` + `activity-config.json` | عدّ الباب والتنبيهات (Python + mediapipe) |
| Tunnel | cloudflared (خدمة Windows) | `https://cctv-<branch>.echarpe.store` |
| فحص | `status.ps1` | حالة كل حاجة في شاشة واحدة (قراءة بس) |
| جرد | `COLLECT-BRANCH-CCTV.ps1` | بيجمع إعدادات أي فرع في ZIP للمراجعة (قراءة بس، الأسرار متغطية) |
| ترقيع | `madinaty/patches/APPLY-v710.ps1` · `APPLY-v711.ps1` | بيحوّل recorder v690 لـv711 على الجهاز مع backup ورجوع تلقائي |
| قديم | `legacy-v420/` | السكربت القديم (نافذة PowerShell مفتوحة) — **ماتستخدموش**، كان سبب الوقوع |

## إيه اللي اتغيّر في v710 / v711 وليه

المشكلة الأصلية في مدينتي: الهارد (119GB) كان بيتملي، لأن كاميرا الكاشير بتتسجل H265 بالجودة الكاملة (~24GB في اليوم) والمسح بالوقت بس (7 أيام). لما الهارد يتملي التسجيل يقف.

- التسجيل من `cameraN_live` (الـsub stream) ومعاد ترميزه H264 بـbitrate ثابت: الكاشير 500k، الباب 250k → حوالي 9GB في اليوم.
- **حارس مساحة:** بيمسح الأقدم كل ما الفاضي يقل عن 15GB. الهارد مابيتمليش مهما حصل.
- الفيديو بيتجهز **نسخ مباشر** من غير إعادة ترميز: 30 ثانية في ~3 ثواني (كان 51).
- البحث عن التسجيل بالساعة بدل عدّ كل الملفات (كان بيعدّ 128 ألف ملف كل 5 ثواني).
- ملفات 6 ثواني بدل ثانيتين.

## تشغيل فحص الحالة

على كمبيوتر الفرع (مش محتاج Admin):

```powershell
powershell -ExecutionPolicy Bypass -File status.ps1 -PublicUrl https://cctv-madinaty.echarpe.store
```

كل سطر `OK` معناه متأكد منه فعلًا (segment اتكتب في آخر دقيقة، والـagent ردّ)، مش بس إن البورت مفتوح.

## ترقية جهاز عليه recorder v690

1. انسخ `madinaty/patches/` للجهاز.
2. شغّل `APPLY-v710.ps1` كـAdministrator، واستنى `MADINATY_CCTV_V710=OK`.
3. شغّل `APPLY-v711.ps1` كـAdministrator، واستنى `MADINATY_CCTV_V711=OK`.

كل واحد بياخد backup في `backup-before-v71x-<التاريخ>`، وبيرجّع القديم لوحده لو التسجيل ماقامش في 4 دقايق، وبيرفض يشتغل لو النسخة اللي على الجهاز مش المتوقعة.

للرجوع يدوي: انسخ `ECHARPE-MADINATY-RECORDER.ps1` من فولدر الـbackup فوق الأصلي، واقفل عملية الـrecorder — الـsupervisor بيرجّعها.

## عقد الـAPI (اللي الويب بيستخدمه)

- لايف (go2rtc): `/stream.html?src=` · `/api/frame.jpeg?src=` · `/api/stream.mp4?src=`
- تسجيل: `/echarpe-playback/video?camera=&atMs=&durationSec=&quality=&mode=fast` · `/echarpe-playback/range` · `/echarpe-playback/alerts` · `/echarpe-playback/activity-status` · `/echarpe-playback/staff-state`
- محلي من الـPOS بس: `POST /echarpe-events/event` · `POST /echarpe-playback/staff-state` · `POST /echarpe-playback/session-signal` · `/echarpe-presence/status`
- صحة: `/health` على الـagent (1985).

## قواعد

- **ولا باسورد في الريبو.** باسورد الكاميرات والـNVR وملف الـtunnel على الجهاز بس.
- الـtunnel لازم يعدّي للنت المسارات اللي فوق بس. باقي `/api/*` بتاع go2rtc (الإعدادات وقايمة الـstreams) لازم يتقفل من برّه.
- كل ملفات `.ps1` ASCII بس — UTF-8 بيكسر PowerShell 5.1.
- الكاميرات best-effort: عمرها ما توقّف بيع أو دفع أو طباعة في الـPOS.
- أي تثبيت مايتقالش عليه نجح غير لما segment حقيقي يتكتب وفيديو حقيقي يرجع.

## الناقص

- [ ] **تثبيت بخطوة واحدة لفرع جديد** (`install.ps1` + `config.json`): الـrecorder لازم ياخد اسم الفرع والكاميرات من ملف إعدادات بدل ما يكونوا جوّه الكود. لسه ماتعملش وماتجربش على جهاز نضيف.
- [ ] **عدّ العملاء:** معتمد على حركة الباب (دخول − خروج) وبينحرف — قال 2 عملاء والفرع فاضي. فتنبيه «فاتورة من غير عميل» مش موثوق لحد ما يتصلّح.
- [ ] الـagent بيخدم طلب واحد في المرة (PowerShell HttpListener).
- [ ] `/health` من برّه: الـtunnel في مدينتي بيعدّي `/echarpe-playback/*` بس للـagent. Office بيجرّب `/health` وبعدين `/echarpe-playback/health` وبعدين `/echarpe-playback/alerts`.
- [ ] ffprobe مش موجود على جهاز مدينتي؛ الـrecorder بيعتمد على تاريخ ثابت (`$H264Since`) عشان يعرف إن التسجيل H264.
