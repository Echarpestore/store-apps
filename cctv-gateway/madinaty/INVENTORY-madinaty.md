# INVENTORY — مدينتي CCTV (11-10-2026)

المصدر: terminal على الجهاز (قراءة بس) + فحص الـendpoints من برّه.

## الجهاز
- `DESKTOP-UFT7HFJ` · Intel i5-9400 · هارد واحد C: 119GB · Windows · حساب `HP` (Admin بـUAC).
- Root: `C:\ProgramData\ECHARPE\MadinatyCCTV`
- Sleep على الكهربا معطّل. إغلاق غير نظيف (قطع كهربا): 27-09 و02-10 — التسجيل وقف من 02-10 بعده.

## اللي شغال
| جزء | إزاي بيشتغل |
|---|---|
| go2rtc 1.9.14 | Scheduled Task `ECHARPE CCTV Gateway` (SYSTEM) · config في `gateway-v682\go2rtc.runtime.yaml` |
| الـrecorder/agent (1985) | `ECHARPE-MADINATY-RECORDER.ps1` + ffmpeg لكل كاميرا · بيتشغّل من الـsupervisor |
| Supervisor v700 | Task `ECHARPE Madinaty CCTV Supervisor v700` (SYSTEM، AtStartup) · لوج `logs\supervisor-v700.log` · حالة `cctv-status-v700.json` |
| كاشف الأشخاص | Task `ECHARPE Madinaty Person Detector` · Python 3.11 في حساب HP |
| NVR bridge | Task `ECHARPE Madinaty NVR Bridge v690` |
| Tunnel | خدمة `Cloudflared` (Automatic) · token-file · الـrouting من Cloudflare dashboard |

## الكاميرات (الفعلي)
| stream | المصدر |
|---|---|
| camera4 (الكاشير) | NVR `192.168.0.9` channel 4 main (H265) |
| camera5 | NVR channel 5 sub |
| camera7 | مباشر `192.168.0.103` main |
| camera8 (الباب) | NVR channel 8 sub |
| `cameraN_live` | ffmpeg → H264 (QSV) من الـsub stream |

التسجيل لكاميرتين بس: 4 و8. ساعة الـNVR سابقة ساعة الكمبيوتر ~17 دقيقة (التسجيل ماشي على ساعة الكمبيوتر).

## السبب الجذري للوقوع
`$RetentionHours = 168` مسح بالوقت بس + كاميرا الكاشير main H265 (~21GB في اليوم) على هارد 119GB → الهارد بيتملي في ~يومين → التسجيل يقف.
وقبل v700: الـself-heal القديم كان بيعمل ريستارت للـgateway كله كل دقيقتين لما كاميرا واحدة تقع (428 ريستارت في 16 ساعة).

## v710 (08:23) و v711 (08:45) — 11-10
- Backups: `backup-before-v710-20261011-082300` · `backup-before-v711-20261011-084524`.
- النتيجة من اللوج: `MADINATY_CCTV_V710=OK CLIP=OK` ثم `MADINATY_CCTV_V711=OK CLIP=OK`.
- التسجيل: الكاشير ~500kbps (~320KB كل 5-6ث) · الباب ~250-320kbps → ~9GB في اليوم.
- الفاضي: من 6.3GB لـ15GB (حارس المساحة).
- فيديو 30ث: محليًا 3.1ث · من برّه ~10ث (كان 51ث) · المدة الفعلية 00:00:30 · `playback_h264_repack` في `agent.log`.
- CPU ~10%. `/health` محلي: 2.4ث، `ok:true`، `version:711`.

## فحص الذكاء (والفرع قافل)
- `staff-state`: المصدر `pos_firestore`، 0 موظفين — صح.
- `activity-status`: `customersInside=2` والفرع فاضي — **غلط**. `doorEntries=2321` مقابل `doorExits=1878`.
- `alerts`: فاضية.

## لسه مفتوح
- عدّ العملاء / تنبيه «فاتورة من غير عميل».
- `/health` من برّه 404 (routing الـtunnel).
- الـagent single-threaded.
- ffprobe مش موجود على الجهاز.
- فولدرات مؤقتة على الجهاز: `C:\Users\HP\0-v710` · `0-v711` · `0-pull`.
