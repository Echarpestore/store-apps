// ============================================================
// 🗄️ test-no-orphans — منع رجوع الملفات اليتيمة
//
// 🔴 ليه الملف ده موجود:
//    كان في جذر الريبو `sales-app.js` — نسخة قديمة من تطبيق الحضور
//    محدش بيحمّلها. ٦٥٣١ سطر مقابل ٧٥٦٢ في الشغالة، و**مفيهاش ولا
//    إصلاح من جلسة أغسطس** (صفر caiStamp، صفر earlyLeaveFromWorked).
//
//    الخطر مش إنها موجودة — الخطر إن أي جلسة جاية تفتحها بالغلط
//    وتعدّل فيها، أو تسلّمها للمالك فيرفعها فوق الشغالة، فترجع كل
//    باجات التوقيت والانصراف بدري مرة واحدة.
//
//    ودي مش نظرية: §0 مسجّل فيه إن "ملف من فرع أقدم كان هيلغي
//    إصلاحات" حصل **مرتين**، والاختبارات هي اللي مسكته.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ملفات اتشالت عن قصد — رجوعها لأي واحد من الأماكن دي = مشكلة
const BANNED = [
  { file: 'sales-app.js',
    why: 'نسخة قديمة من تطبيق الحضور — الشغالة هي sales/sales-app.js' },
  { file: 'loyalty/app.js',
    why: 'ملف يتيم مفيش أي <script src> بيشاور عليه' },
  { file: 'sales/sales-sw.js',
    why: 'سيرفس ووركر قديم (v75) — الشغال هو sales/sw.js' },
  { file: 'Office/office-sw.js',
    why: 'سيرفس ووركر قديم (v8) — الشغال هو Office/sw.js' }
];

BANNED.forEach(function(b){
  assert(!fs.existsSync(path.join(ROOT, b.file)),
    '🗄️ ' + b.file + ' مرجعش — ' + b.why);
});

// ============================================================
// 🔎 كاشف يتامى عام — أي .js في مجلد تطبيق مش متحمّل من الـHTML
//    بيتقال عليه. مش فشل (فيه ملفات ليها أسباب)، بس بيتسجّل.
// ============================================================
(function(){
  const APPS = ['pos', 'sales', 'Office', 'loyalty', 'glow', 'feedback'];
  const orphans = [];
  APPS.forEach(function(dir){
    const d = path.join(ROOT, dir);
    if(!fs.existsSync(d)) return;
    const htmls = fs.readdirSync(d).filter(function(f){ return /\.html$/.test(f); });
    const loaded = new Set();
    htmls.forEach(function(h){
      const src = fs.readFileSync(path.join(d, h), 'utf8');
      const re = /src\s*=\s*["']([^"']+\.js)["']/g;
      let m;
      while((m = re.exec(src))){
        if(!/^https?:/.test(m[1])) loaded.add(path.basename(m[1]));
      }
    });
    fs.readdirSync(d)
      .filter(function(f){ return /\.js$/.test(f); })
      .forEach(function(f){
        // sw.js بيتسجّل بـregister() مش بـ<script src>، و test-*.js اختبارات
        if(f === 'sw.js' || /^test-/.test(f)) return;
        // مكتبات خارجية بتتحمّل بشكل تاني
        if(/\.min\.js$/.test(f)) return;
        if(!loaded.has(f)) orphans.push(dir + '/' + f);
      });
  });
  // ده تقرير مش حارس — الفشل هنا هيبقى مزعج من غير فايدة.
  // الحراسة الحقيقية في قايمة BANNED فوق.
  if(orphans.length){
    console.log('  ℹ️ ملفات مش متحمّلة من أي HTML: ' + orphans.join(' · '));
  }
  assert(true, '🔎 فحص اليتامى اشتغل (' + orphans.length + ' ملف مش متحمّل)');
})();

// ============================================================
// ⚠️ والنسخة الشغالة لسه فيها إصلاحات أغسطس
//    (لو حد رفع القديمة فوقها، ده بيقع فورًا)
// ============================================================
(function(){
  const live = path.join(ROOT, 'sales', 'sales-app.js');
  assert(fs.existsSync(live), 'sales/sales-app.js موجودة');
  if(!fs.existsSync(live)) return;
  const src = fs.readFileSync(live, 'utf8');
  assert(/caiStamp/.test(src),
    '⭐⭐ وفيها إصلاح توقيت القاهرة (caiStamp) — لو وقع ده يبقى حد رفع النسخة القديمة');
  assert(/earlyLeaveFromWorked/.test(src),
    '⭐⭐ وإصلاح الانصراف بدري');
  assert(/commissionDueFor/.test(src), 'وحساب العمولات');
})();

// ============================================================
// 🖼️ frames.js متحمّل فعلًا — الباج اللي الكاشف مسكه
//
// 🔴 الملف كان في الريبو، ومتختبر في test-frames.js، و**مش متحمّل
//    من pos/index.html خالص**. يعني نظام الإطارات والتارجت كان ميت
//    على كل الأجهزة والاختبار بيقول "تمام" لأنه بيقرا الملف مباشرة.
//
//    والأوحش: `pos_test_settings/shift_status_<branch>` — تطبيق
//    الحضور بيسمعها عشان يحوّل شاشة الشيفت، و frames.js هو **الكاتب
//    الوحيد** ليها في المشروع كله. فالعقد كان مقطوع من ناحية POS.
//
// 📚 الدرس: اختبار بيقرا ملف ≠ الملف شغّال. أي ملف فيه ميزة حية
//    لازم يتفحص إنه متحمّل، مش إن الكود جواه صح بس.
// ============================================================
(function(){
  const html = fs.readFileSync(path.join(ROOT, 'pos', 'index.html'), 'utf8');
  assert(/<script src="frames\.js"><\/script>/.test(html),
    '⭐⭐ frames.js متحمّل في pos/index.html');

  // ⚠️ لازم يبقى **بعد** pos-core.js — بيعتمد على db و currentBranch
  const core = html.indexOf('src="pos-core.js"');
  const fr = html.indexOf('src="frames.js"');
  assert(core > 0 && fr > core, '⭐ وبعد pos-core.js (بيحتاج db و currentBranch)');

  // 🔗 والعقد مع تطبيق الحضور سليم من الطرفين
  const frames = fs.readFileSync(path.join(ROOT, 'pos', 'frames.js'), 'utf8');
  const sales = fs.readFileSync(path.join(ROOT, 'sales', 'sales-app.js'), 'utf8');
  assert(/shift_status_/.test(frames), 'POS بيكتب shift_status_<branch>');
  assert(/shift_status_/.test(sales), '⭐⭐ وتطبيق الحضور بيسمعها — العقد متوصّل من الناحيتين');
})();
