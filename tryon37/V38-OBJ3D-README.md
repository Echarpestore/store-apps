# v38 OBJ 3D integration

تم دمج `assets/hijab-out.obj` داخل نفس Three.js renderer الموجود في نسخة tryon المتقدمة.

## ما اتغير
- الموديل الحقيقي يستخدم نفس MediaPipe transformation matrix.
- نفس occluder، الإضاءة، اللون، وProduct Projection shader.
- fallback تلقائي للهندسة القديمة لو OBJ/CDN فشل.
- `?obj=0` يجبر النسخة القديمة للمقارنة.
- `TRYON3D.diag()` يعرض حالة الموديل.
- معايرة حيّة من الكونسول:
  - `T3D_TUNE.objScale`
  - `T3D_TUNE.objX / objY / objZ`
  - `T3D_TUNE.objRx / objRy / objRz`

بعد تغيير قيمة، حرّك الرأس أو انتظر frame؛ التعديل يطبق Live.

## مهم
الدمج تقنيًا مكتمل، لكن المقاس/اتجاه الموديل يحتاج معايرة بصرية على وجه حقيقي لأن OBJ نفسه لا يحمل تعريفًا لموضع الوجه بالنسبة إلى MediaPipe.
