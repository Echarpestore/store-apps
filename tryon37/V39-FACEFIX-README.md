# v39 FACEFIX

الهدف من النسخة دي إصلاح سبب `no-face` قبل أي شغل إضافي على الطرحة.

## الجديد
- شاشة diagnostics فوق الصفحة: model / delegate / running / faces / detect ms / last error.
- محاولة GPU أولًا ثم CPU fallback عند فشل إنشاء FaceLandmarker.
- صفحة مستقلة `face-diagnostic.html` تختبر الكاميرا وMediaPipe بعيدًا عن باقي التطبيق.
- نسخة v38 والـOBJ ما زالت موجودة كأساس، لكن التشخيص الآن أولوية.

## طريقة الاختبار على الموبايل
1. ارفع المجلد على HTTPS في مسار تجريبي.
2. افتح `/face-diagnostic.html`.
3. لو ظهر `faces:1` فـMediaPipe نفسه سليم، والمشكلة في integration داخل صفحة try-on.
4. بعدها افتح `index.html` وابعت screenshot للـdiagnostic overlay.

لو `faces:0` حتى في صفحة diagnostic، ابعت screenshot كما هو؛ كده نعرف إن المشكلة في MediaPipe/camera environment وليس في 3D.
