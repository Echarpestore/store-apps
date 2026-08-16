# v41 TDZFIX
تم إصلاح الخطأ الظاهر على الهاتف:
`Cannot access 'A' before initialization`

السبب: `A`, `dstL`, `dstR`, `dstT`, و`squash` كانوا يُستخدموا في حساب `Tr`
قبل تعريفهم لاحقًا في نفس الـscope. تم نقل التعريفات قبل `affineFrom3`.
Face detection من v40 يظل كما هو.
