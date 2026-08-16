# v42 BROWFIX

إصلاح الخطأ:
`Cannot read properties of undefined (reading '1')`

السبب الحقيقي كان في وضع Live:
بعد تنعيم نقاط الوجه، الكود كان يعيد بناء `an` من دون `brow`.
بعدها `bandanaSpec()` يقرأ `an.brow[1]` فينهار الرسم.

تم:
- الحفاظ على `brow` بعد smoothing.
- تحديث اسم التشخيص إلى v42.
- مسح الخطأ القديم بعد أول detect ناجح.

Face detection / GPU boot fix من v40 وTDZ fix من v41 ما زالوا موجودين.
