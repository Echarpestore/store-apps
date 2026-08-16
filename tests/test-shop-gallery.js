// ============================================================
// 🧪 test-shop-gallery.js — صور المنتج في البيع أونلاين
// ------------------------------------------------------------
// 🔴 الحد اللي الميزة اتبنت حواليه: مستند Firestore **١ ميجا**،
//    والصور base64 جوه المستند. صورة ≈ ٦٠–١٠٠ كيلو، يعني حط ٤ صور
//    للمنتج في المستند الرئيسي = الحفظ بيفشل عند المنتج التالت —
//    **وبيفشل بعد ما المالك يكون رفع الصور كلها**.
//
// اللي الاختبار ده بيقفله:
//   ١) الصور الإضافية في المستند الرئيسي (السقف فوق)
//   ٢) تحميل صور كل المنتجات مع فتح «اطلبي» — بيانات موبايل بتتحرق
//      على صور محدش بصّ عليها
//   ٣) حفظ الصور قبل المنتج → مستند صور يتيم لو المنتج فشل
//   ٤) حذف المنتج من غير صوره → مستندات يتيمة بتاكل مساحة
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..');
const SHOP = fs.readFileSync(path.join(R, 'pos', 'shop-admin.js'), 'utf8');

/* ============================================================
   ١) ⭐⭐ الصور في مستند منفصل
   ============================================================ */
(function(){
  assert(/function shopImgDocId\(itemId\)/.test(SHOP), 'فيه مستند صور مستقل لكل منتج');
  assert(/shopDocId\(\) \+ '_img_' \+ itemId/.test(SHOP), 'باسم مشتق من مستند الفرع');

  // ⭐⭐ المستند الرئيسي مالوش دعوة بالصور الإضافية
  const saveItem = SHOP.slice(SHOP.indexOf('async function shopSaveItem'),
                              SHOP.indexOf('window.shopSaveItem'));
  assert(!/images:/.test(saveItem),
    '⭐⭐ المنتج نفسه مبيتحفظش ومعاه مصفوفة صور (حد المستند ١ ميجا)');
  assert(/shopSaveGallery\(_savedId\)/.test(saveItem), 'والصور بتتحفظ في مستندها');

  // ⭐ الغلاف أصغر — بيتحمّل مع كل المنتجات
  assert(/resizeImageFile\(f, 420,/.test(SHOP),
    '⭐⭐ الغلاف ٤٢٠ بكسل — بيتضرب في عدد المنتجات كلها');
  assert(/resizeImageFile\(f, 720,/.test(SHOP),
    '⭐ وصور التفاصيل ٧٢٠ (بتتحمّل بالطلب بس)');
  assert(/Math\.max\(0, 5 - shopPendingGallery\.length\)/.test(SHOP),
    '⭐ سقف ٥ صور — المستند المنفصل حدّه ١ ميجا برضه');
})();

/* ============================================================
   ٢) ⭐⭐ الترتيب: المنتج الأول والصور بعده
   ============================================================ */
(function(){
  /* ⚠️ لازم نلقط نداء `shopSaveGallery(` **جوه دالة الحفظ** مش أول
     ذكر للاسم في الملف — الاسم بيظهر الأول في تعريف الدالة نفسها
     قبل ما يتنادى، فمقارنة `indexOf` عادية كانت بتقع على تعريف
     سليم مش على ترتيب الحفظ الفعلي. */
  const si = SHOP.indexOf('async function shopSaveItem');
  const se = SHOP.indexOf('window.shopSaveItem');
  const saveBody = SHOP.slice(si, se);
  const i = saveBody.indexOf('await saveShopDoc();');
  const j = saveBody.indexOf('shopSaveGallery(_savedId)');
  assert(i > 0 && j > i,
    '⭐⭐ الصور بعد المنتج — العكس بيسيب مستند صور يتيم لو المنتج فشل');
  assert(/showToast\('⚠️ المنتج اتحفظ بس الصور الإضافية لأ/.test(SHOP),
    '⭐⭐ وفشل الصور بيتقال بصوت — المالك لازم يعرف عشان يعيد');
})();

/* ============================================================
   ٣) 🧹 حذف المنتج بيشيل صوره
   ============================================================ */
(function(){
  const del = SHOP.slice(SHOP.indexOf('async function shopDelItem'),
                         SHOP.indexOf('window.shopDelItem'));
  assert(/shopImgDocId\(id\)\)\.delete\(\)/.test(del),
    '⭐⭐ صور المنتج بتتمسح معاه (وإلا مستندات يتيمة بتاكل مساحة)');
  assert(/\.catch\(function\(\)\{\}\)/.test(del),
    '⭐ وفشل مسح الصور مبيكسرش حذف المنتج');
})();

/* ============================================================
   ٤) ⭐⭐ التطبيقين — التحميل بالطلب بس
   ============================================================ */
(function(){
  [['loyalty'], ['glow']].forEach(function(a){
    const src = fs.readFileSync(path.join(R, a[0], 'index.html'), 'utf8');
    assert(/function shopOpenItem\(bc\)/.test(src), a[0] + ': صفحة المنتج موجودة');
    assert(/_img_' \+ \(p\.id \|\| ''\)/.test(src),
      '⭐⭐ ' + a[0] + ': الصور بتتقري من المستند المنفصل');

    /* 🔴 الصور **مش** بتتحمّل مع الكتالوج — الفحص على **استدعاء
       shopOpenItem** جوه تحميل التبويب، مش على وجود النص `_img_`
       حرفيًا (الاستدعاء `shopOpenItem(bc)` مالوش النص ده أصلًا،
       فمكتبة استبدال بسيطة كانت هتعدّي من غير ما تمسك التحميل
       المبكر الحقيقي). */
    const iShop = src.indexOf("if(tab==='shop'){");
    const iEndLazy = src.indexOf("if(tab==='offers' || tab==='shop'){", iShop);
    const lazy = src.slice(iShop, iEndLazy > 0 ? iEndLazy : iShop + 900);
    assert(!/shopOpenItem\(/.test(lazy),
      '⭐⭐ ' + a[0] + ': فتح تبويب «اطلبي» مبيناديش shopOpenItem لكل منتج (بيانات موبايل)');

    assert(/_shopImgCache\[key\]/.test(src),
      '⭐ ' + a[0] + ': وكل منتج بيتحمّل مرة واحدة في الجلسة');
    assert(/\(p\.img \? \[p\.img\] : \[\]\)\.concat\(extra\)/.test(src),
      '⭐⭐ ' + a[0] + ': الغلاف أول صورة — العميلة دوست عليه فلازم تلاقيه');
    assert(/onclick="event\.stopPropagation\(\); shopAdd/.test(src),
      '⭐⭐ ' + a[0] + ': زرار «ضيفي» مش بيفتح صفحة المنتج معاه');
    assert(/_shopImgCache = \{\}; _shopOpenItem = null;/.test(src),
      '⭐ ' + a[0] + ': الصور بتتصفّر مع الخروج');
  });
})();
