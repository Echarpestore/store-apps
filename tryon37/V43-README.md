# v43 3DDEFAULT

سبب إنك كنت شايف `flat` رغم إن الـOBJ متدمج:
الـ3D كان لا يبدأ إلا لو الرابط فيه `?ar=1`.

تم تغيير ذلك:
- الـ3D الحقيقي يبدأ افتراضيًا على الرابط العادي.
- `?flat=1` فقط يرجع للمسار القديم.
- لو 3D initialization فشل، التطبيق يجرب cloth mesh fallback بدل شاشة فاضية.
- الـdiagnostic overlay يعرض الآن `renderer:3D / mesh / flat`.

المطلوب في الاختبار:
افتح نفس رابط try-on العادي بدون أي query string.
المربع الأخضر لازم يعرض `renderer:3D`.
