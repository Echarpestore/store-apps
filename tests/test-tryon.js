// ============================================================
// 🧕 test-tryon — محرك التجربة الافتراضية (tryon-core.js)
//
// 🔑 التركيز على الحتت اللي غلطها **بيبان على وش العميلة**:
//    مصفوفة column-major مقلوبة · أفيني غلط · تنعيم بيهنّج ·
//    توسيع بينزل بدل ما يطلع. كل قسم فيه نيجاتيف بالتعليق:
//    إيه الباج اللي الاختبار ده بيمسكه لو حد رجّعه.
// ============================================================
'use strict';
const path = require('path');
const T = require(path.resolve(__dirname, '..', 'tryon', 'tryon-core.js'));

const near = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 1e-6 : eps);

// مصفوفة دوران column-major (زي ما MediaPipe بيسلّمها بالظبط)
function colMajor(R){
  const d = new Array(16).fill(0); d[15] = 1;
  for(let r=0;r<3;r++) for(let c=0;c<3;c++) d[c*4+r] = R[r][c];
  return d;
}
const Ry = (t) => [[Math.cos(t),0,Math.sin(t)],[0,1,0],[-Math.sin(t),0,Math.cos(t)]];
const Rx = (t) => [[1,0,0],[0,Math.cos(t),-Math.sin(t)],[0,Math.sin(t),Math.cos(t)]];
const Rz = (t) => [[Math.cos(t),-Math.sin(t),0],[Math.sin(t),Math.cos(t),0],[0,0,1]];

// ============================================================
// ١) 🧭 وضع الراس من المصفوفة — column-major مش row-major
// ============================================================
(function(){
  const p1 = T.poseFromMatrix(colMajor(Ry(20 * Math.PI/180)));
  assert(near(p1.yaw, 20, 0.01), 'لفّة ٢٠° يمين = yaw ٢٠');
  assert(near(p1.pitch, 0, 0.01) && near(p1.roll, 0, 0.01),
    'ومن غير ما تلوّث pitch أو roll');

  const p2 = T.poseFromMatrix(colMajor(Rx(15 * Math.PI/180)));
  assert(near(p2.pitch, 15, 0.01), 'رفع الراس ١٥° = pitch ١٥');
  assert(near(p2.yaw, 0, 0.01), 'من غير yaw وهمي');

  const p3 = T.poseFromMatrix(colMajor(Rz(-10 * Math.PI/180)));
  assert(near(p3.roll, -10, 0.01), 'ميل الراس -١٠° = roll -١٠');

  // 🔴 نيجاتيف: قراءة row-major كانت هتخلّي لفّة يمين تطلع "بص لفوق"
  //    والطرحة تتحرّك عمودي مع اللفّة الأفقية. الفحص: نفس بيانات
  //    Ry مقروءة غلط (منقولة) لازم تدي نتيجة **مختلفة** عن الصح.
  const transposed = colMajor(Ry(20*Math.PI/180).map((row,r) =>
    row.map((_,c) => Ry(20*Math.PI/180)[c][r])));
  const pT = T.poseFromMatrix(transposed);
  assert(!near(pT.yaw, 20, 0.01) || !near(pT.pitch, 0, 0.01),
    '🔴 المصفوفة المنقولة مش بتدي نفس النتيجة — يعني الاتجاه فعلًا بيفرق');

  const p0 = T.poseFromMatrix(null);
  assert(p0.yaw === 0 && p0.pitch === 0 && p0.roll === 0,
    'مفيش مصفوفة = صفر مش انهيار');
})();

// ============================================================
// ٢) 📐 الأفيني — الصورة لازم تقع على النقط **بالظبط**
// ============================================================
(function(){
  const src = [[150,560],[850,560],[500,120]];       // نقط طرحة الكتالوج
  const dst = [[210,400],[470,430],[350,205]];       // وش مايل ومتحرّك
  const A = T.affineFrom3(src, dst);
  assert(!!A, 'فيه حل');
  for(let i=0;i<3;i++){
    const p = T.applyAffine(A, src[i]);
    assert(near(p[0], dst[i][0], 1e-6) && near(p[1], dst[i][1], 1e-6),
      'النقطة ' + i + ' وقعت في مكانها بالظبط');
  }
  // نقطة رابعة (مش من الحل) بتتنقل خطيًا — منتصف l/r → منتصف الهدف
  const mid = T.applyAffine(A, [500,560]);
  assert(near(mid[0], 340, 1e-6) && near(mid[1], 415, 1e-6),
    'والخطية محفوظة للنقط اللي بين الأنكرز');

  // 🔴 نيجاتيف: ٣ نقط على خط واحد = مالهاش حل — لو رجّعنا حاجة
  //    بدل null الطرحة هتتفرد لمالانهاية في فريم واحد
  assert(T.affineFrom3([[0,0],[1,1],[2,2]], dst) === null,
    '🔴 نقط على خط واحد بترجع null مش أرقام مجنونة');
})();

// ============================================================
// ٣) 🫨 التنعيم — يمسك الرعشة من غير ما يهنّج
// ============================================================
(function(){
  const s = T.Smoother();
  assertEq(s.push(100), 100, 'أول قيمة بتتاخد زي ما هي');
  const jitter = s.push(101);                        // رعشة بكسل
  assert(Math.abs(jitter - 100) < 0.5, 'الرعشة الصغيرة بتتبلع');

  const s2 = T.Smoother();
  s2.push(100);
  const jump = s2.push(300);                          // حركة حقيقية كبيرة
  assert(jump > 220, 'الحركة الكبيرة بتتتبّع بسرعة (مفيش إحساس تهنيج)');

  // 🔴 نيجاتيف: alpha ثابت صغير كان هيخلي القفزة الكبيرة تزحف —
  //    الفحص فوق (jump > 220) هو اللي بيقع لو حد ثبّت alpha على 0.15

  let v = 100; const s3 = T.Smoother();
  for(let i=0;i<50;i++) v = s3.push(250);
  assert(near(v, 250, 1), 'وبيوصل للقيمة الثابتة مش بيحوم حواليها');

  const s2d = T.Smoother2D();
  const p = s2d.push([10,20]);
  assert(p[0] === 10 && p[1] === 20, 'النسخة الثنائية شغالة');
  s2d.reset();
  const p2 = s2d.push([99,99]);
  assert(p2[0] === 99, 'وreset بيبدأ من أول وجديد (تبديل لايف/صورة)');
})();

// ============================================================
// ٤) 📍 التوسيع — الطرحة أوسع وأعلى من الوش، ومع الميل
// ============================================================
(function(){
  // وش عمودي عادي: y بينقص لفوق (إحداثيات شاشة)
  const an = { top:[500,200], chin:[500,700],
               l:[380,420], r:[620,420],
               cheekL:[440,520], cheekR:[560,520] };
  const ex = T.expandAnchors(an);

  assert(ex.r[0] - ex.l[0] > an.r[0] - an.l[0],
    'الجوانب اتوسّعت — الطرحة بتغطي الشعر مش الوش بس');
  assert(ex.l[1] < an.l[1] && ex.top[1] < an.top[1],
    'وكل النقط اتحركت **لفوق** (y أصغر)');
  // 🔴 نيجاتيف: غلطة إشارة في up كانت هتنزّل الطرحة على الحواجب —
  //    الفحص اللي فوق بيقع فورًا لو up اتعكس

  assert(near(ex.faceW, 240, 1e-6) && near(ex.faceH, 500, 1e-6),
    'مقاسات الوش متحسبة صح');
  assert(near(ex.up[0], 0, 1e-6) && near(ex.up[1], -1, 1e-6),
    'اتجاه فوق = (0,-1) للوش العمودي');

  // وش مايل ٩٠° (نايم على جنبه): "فوق" بقى أفقي
  const an2 = { top:[200,500], chin:[700,500],
                l:[420,380], r:[420,620],
                cheekL:[520,440], cheekR:[520,560] };
  const ex2 = T.expandAnchors(an2);
  assert(near(ex2.up[0], -1, 1e-6) && near(ex2.up[1], 0, 1e-6),
    'الميل بيلف اتجاه التوسيع معاه — مش ثابت على محور الشاشة');
})();

// ============================================================
// ٥) 👗 الانسدال — تحت الدقن مش فوقها
// ============================================================
(function(){
  const an = { top:[500,200], chin:[500,700],
               l:[380,420], r:[620,420] };
  const ex = T.expandAnchors(an);
  const dp = T.drapePlacement(an, ex);
  assert(dp.y > an.chin[1], 'الانسدال **تحت** الدقن (y أكبر)');
  assert(dp.w > ex.faceW, 'وأوسع من الوش — بيغطي الكتفين');
  assert(near(dp.rot, 0, 1e-6), 'ومن غير ميل لما الراس مظبوطة');
  // 🔴 نيجاتيف: خلط اتجاه up هنا كان هيرسم الانسدال على الجبهة
})();

// ============================================================
// ٦) 🚦 بوابة الجودة + الإضاءة + حاكم الفريمات
// ============================================================
(function(){
  assert(T.fitQuality({yaw:0, pitch:0, roll:0}).ok, 'وش قدام = تمام');
  const q1 = T.fitQuality({yaw:35, pitch:0, roll:0});
  assert(!q1.ok && !q1.fade, 'لفّة ٣٥° = تنبيه من غير إخفاء');
  assert(T.fitQuality({yaw:60, pitch:0, roll:0}).fade,
    'لفّة ٦٠° = إخفاء — أحسن من تشويه (القرار المتسجّل في HANDOFF §6)');
  assert(T.fitQuality({yaw:0, pitch:30, roll:0}).hint.length > 0,
    'وفيه رسالة إرشاد مش صمت');

  assertEq(T.lumaToBrightness(-5), 1, 'قيمة إضاءة عبيطة = معامل محايد');
  assert(T.lumaToBrightness(0) >= 0.75, 'ضلمة خالص مش بتسوّد الطرحة أكتر من 0.75');
  assert(T.lumaToBrightness(255) <= 1.15, 'ونور جامد مش بيحرقها فوق 1.15');
  assert(T.lumaToBrightness(200) > T.lumaToBrightness(80),
    'والعلاقة طردية — نور أكتر = طرحة أنور');

  const gov = T.FrameGovernor();
  for(let i=0;i<30;i++) gov.report(12);
  let all = true;
  for(let i=0;i<10;i++) all = all && gov.shouldProcess();
  assert(all, 'جهاز سريع = كل فريم بيتعالج');
  for(let i=0;i<60;i++) gov.report(80);
  let cnt = 0;
  for(let i=0;i<10;i++) if(gov.shouldProcess()) cnt++;
  assert(cnt >= 4 && cnt <= 6, 'جهاز بطيء = فريم وفريم (نص المعالجة)');
  // 🔴 نيجاتيف: من غير الحاكم، الموبايل الضعيف كان هيهنّج ويسخن
})();


// ============================================================
// ٧) 🔗 الديب لينك من الشات — ?scarf=..&color=..
// ============================================================
(function(){
  const cat = [ {id:'crepe-basic'}, {id:'chiffon-01'} ];
  const cols = [ {id:'black'}, {id:'rose'} ];
  const q = (o) => (k) => o[k];

  const p1 = T.pickByQuery(cat, cols, q({scarf:'chiffon-01', color:'rose'}));
  assertEq(p1.scarf.id, 'chiffon-01', 'اللينك بيفتح على الطرحة المطلوبة');
  assertEq(p1.color.id, 'rose', 'وباللون المطلوب');
  assert(p1.matchedScarf && p1.matchedColor, 'ومعلّم إنه لقاهم');

  const p2 = T.pickByQuery(cat, cols, q({scarf:'ChIfFoN-01'}));
  assertEq(p2.scarf.id, 'chiffon-01', 'حروف كبيرة/صغيرة مش بتفرق');

  // 🔴 نيجاتيف: طرحة اتشالت من الكتالوج ولينكها لسه في شات قديم —
  //    لو رمينا خطأ، العميلة الجاية من الشات هتشوف شاشة مكسورة
  const p3 = T.pickByQuery(cat, cols, q({scarf:'deleted-99', color:'xx'}));
  assertEq(p3.scarf.id, 'crepe-basic', 'لينك بايظ = أول طرحة، مش انهيار');
  assert(!p3.matchedScarf, 'بس معلّم إنه ملقاهوش (للتشخيص)');

  const p4 = T.pickByQuery(cat, cols, q({}));
  assertEq(p4.scarf.id, 'crepe-basic', 'ومن غير لينك خالص = الافتراضي');
})();

// ============================================================
// ٨) 🖼️ لون المنتج من صورة واحدة — قلب "نفس الخطوة"
// ============================================================
(function(){
  // ٣ حمرا + أبيض نقي (خلفية) → الوسيط أحمر والأبيض متجاهل
  const px = new Uint8ClampedArray([
    200,30,40,255,  201,31,41,255,  199,28,38,255,  250,250,250,255
  ]);
  const d = T.dominantColor(px);
  assert(d.hex && parseInt(d.hex.slice(1,3),16) === 200, 'الوسيط أحمر');
  assert(parseInt(d.hex.slice(3,5),16) < 60, 'مش متلوث بالأبيض');
  assert(near(d.confidence, 0.75, 0.01), 'الثقة = نسبة بكسلات المنتج (٣ من ٤)');

  // ⭐ ريجريشن صورة المالك الحقيقية: خلفية استوديو **كريمي** (مش أبيض
  //   نقي — 236) أكتر من القماش. القاعدة القديمة (>235 بس) كانت
  //   بتطلّع "أوف وايت" بدل الروز. 🔴 النيجاتيف بيرجّع القاعدة القديمة.
  const studio = [];
  for(let i=0;i<6;i++) studio.push(236,234,232,255);   // خلفية كريمي غالبة
  for(let i=0;i<4;i++) studio.push(153+i,104,92,255);  // قماش روز أقلية
  const ds = T.dominantColor(new Uint8ClampedArray(studio));
  assert(parseInt(ds.hex.slice(1,3),16) < 200 && parseInt(ds.hex.slice(1,3),16) > 120,
    '⭐ الروز كسب رغم إن الخلفية الكريمي أكتر عددًا');
  assert(near(ds.confidence, 0.4, 0.01), 'والثقة بتعكس نسبة القماش الفعلية');

  // نسيج حقيقي متدرج + حافة مشغولة غامقة أقلية → الوسيط من القماش
  const tex = [];
  for(let i=0;i<7;i++) tex.push(150+i*4,105+i*3,92+i*3,255); // درجات القماش
  tex.push(60,35,30,255); tex.push(55,30,25,255);            // حافة غامقة
  const dt = T.dominantColor(new Uint8ClampedArray(tex));
  assert(parseInt(dt.hex.slice(1,3),16) > 120,
    'الحافة الغامقة الأقلية مش خاطفة اللون (متانة الوسيط)');

  // صورة كلها أبيض/شفاف = مفيش لون — المتصل يفضل على الافتراضي
  const w = new Uint8ClampedArray([250,250,250,255, 255,255,255,255, 10,10,10,50]);
  const dw = T.dominantColor(w);
  assert(dw.hex === null && dw.confidence === 0, 'كلها خلفية = null مش لون وهمي');

  assertEq(T.dominantColor(new Uint8ClampedArray(0)).hex, null,
    'صورة فاضية مش بتكسر');
})();

// ============================================================
// ٩) 🎨 إعادة تلوين القالب (recolor-core) — الظل يفضل ظل
// ============================================================
const R = require(path.resolve(__dirname, '..', 'tryon', 'recolor-core.js'));
(function(){
  // roundtrip الألوان
  const [h,s,l] = R.rgbToHsl(125, 90, 110);
  const back = R.hslToRgb(h, s, l);
  assert(Math.abs(back[0]-125) <= 1 && Math.abs(back[1]-90) <= 1
      && Math.abs(back[2]-110) <= 1, 'HSL رايح جاي من غير ما اللون يتحرّف');

  const mauve = [150, 110, 115];                   // قماش القالب
  const mauveDark = [90, 62, 66];                  // نفس القماش في الضل
  const stitch = [235, 228, 210];                  // تطريز فاتح
  const skin = [225, 180, 160];                    // بشرة

  // الماسك: الضل بياخد وزن قريب من الفاتح (المسافة من غير L)
  const wLight = R.maskWeight(mauve, mauve, 0.35);
  const wDark = R.maskWeight(mauveDark, mauve, 0.35);
  assertEq(wLight, 1, 'نقطة الدوس نفسها = وزن كامل');
  assert(wDark > 0.5, 'وطيّة الضل من نفس القماش داخلة في الماسك');
  // 🔴 نيجاتيف: مسافة بتحسب L كانت هتسيب الطيّات الغامقة باللون
  //    القديم — بقع بنّي جوا الطرحة الكحلي. فحص wDark بيقع ساعتها

  const wStitch = R.maskWeight(stitch, mauve, 0.35);
  assert(wStitch < 0.35, 'التطريز الفاتح وزنه واطي — بينجّي نفسه');
  const wSkin = R.maskWeight(skin, mauve, 0.35);
  assert(wSkin < wLight, 'والبشرة أبعد من القماش نفسه');

  // إعادة التلوين لكحلي مع نقل الإضاءة (مركز القماش 0.42):
  const navyHsl = R.rgbToHsl(43, 53, 80);
  const medL = 0.42;
  const nLight = R.recolorPixel(mauve, navyHsl, medL);
  const nDark = R.recolorPixel(mauveDark, navyHsl, medL);
  const lum = (p) => 0.299*p[0] + 0.587*p[1] + 0.114*p[2];
  assert(lum(nDark) < lum(nLight), 'الظل فضل أغمق — الطيّات محفوظة');
  assert(nLight[2] > nLight[0], 'واللون فعلًا بقى ناحية الأزرق');
  // ⭐ ريجريشن صورة القالب: قماش **فاتح** (L≈0.75) + هدف كحلي غامق —
  //    من غير نقل الإضاءة كان بيطلع بيبي بلو فاتح.
  //    🔴 النيجاتيف: شيل fabricL من recolorPixel والفحص ده بيقع.
  const lightFabric = [210, 201, 185];
  const nv = R.recolorPixel(lightFabric, navyHsl, 0.75);
  assert(lum(nv) < 120, '⭐ الكحلي طلع غامق بجد مش بيبي بلو');
  const med = R.fabricMedianL(
    new Uint8ClampedArray([210,201,185,255, 140,128,110,255, 20,20,20,255]),
    new Float32Array([1, 1, 0]));
  assert(med > 0.4 && med < 0.8, 'وسيط إضاءة القماش من الماسك بس (الأسود برا)');

  // applyRecolor: وزن صفر = البكسل ميتلمسش خالص
  const px = new Uint8ClampedArray([150,110,115,255, 235,228,210,255]);
  const mask = new Float32Array([1, 0]);
  R.applyRecolor(px, mask, '#2b3550');
  assert(px[2] > px[0], 'بكسل القماش اتلوّن');
  assert(px[4] === 235 && px[5] === 228 && px[6] === 210,
    'وبكسل التطريز (وزن ٠) زي ما هو بالبكسل');
})();

// ============================================================
// ١٠) 🤝 مصدر صورة المنتج — التسليم المباشر قبل اللينك
// ============================================================
(function(){
  const q = (o) => (k) => o[k] || null;
  const store = (o) => (k) => o[k] || null;

  const s1 = T.imageSourceFromQuery(q({imgkey:'1'}),
                store({echarpe_tryon_img:'data:image/jpeg;base64,AAA'}));
  assertEq(s1.kind, 'handoff', 'الشات سلّم صورة = تسليم مباشر');
  assert(s1.value.indexOf('data:') === 0, 'والقيمة هي الداتا نفسها');

  // 🔴 نيجاتيف: العميلة فتحت اللينك في تاب جديد — sessionStorage فاضي.
  //    لو رمينا خطأ أو استخدمنا null كصورة، الصفحة تقع. لازم نكمل عادي.
  const s2 = T.imageSourceFromQuery(q({imgkey:'1'}), store({}));
  assertEq(s2.kind, 'none', 'مفتاح من غير صورة = نكمل عادي مش نقع');

  const s3 = T.imageSourceFromQuery(q({imgkey:'1', img:'https://x/a.jpg'}),
                store({}));
  assertEq(s3.kind, 'url', 'ولو فيه لينك احتياطي جنب المفتاح بنستخدمه');

  const s4 = T.imageSourceFromQuery(q({img:'https://x/a.jpg'}), store({}));
  assertEq(s4.kind, 'url', 'لينك بس = url');

  assertEq(T.imageSourceFromQuery(q({}), store({})).kind, 'none',
    'ومن غير حاجة خالص = none');
})();

// ============================================================
// ١٢) 🧕 الأصل الحقيقي الأول — التوصيلات
// ============================================================
(function(){
  const fs = require('fs');
  const cat = fs.readFileSync(path.resolve(__dirname, '..', 'tryon', 'assets', 'catalog.js'), 'utf8');
  const app = fs.readFileSync(path.resolve(__dirname, '..', 'tryon', 'tryon-app.js'), 'utf8');
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'tryon', 'index.html'), 'utf8');

  assert(cat.indexOf("id: 'template-01'") > -1
      && cat.indexOf('template-01-head.png') > -1,
    'الأصل الحقيقي أول عنصر في الكتالوج (= الافتراضي)');
  assert(fs.existsSync(path.resolve(__dirname, '..', 'tryon', 'assets', 'template-01-head.png')),
    'وملف الصورة موجود فعلًا (درس frames.js: مرجع من غير ملف = ميزة ميتة)');
  assert(cat.indexOf('recolor: { seeds:') > -1, 'وعيّنات إعادة التلوين معرّفة');

  assert(html.indexOf('<script src="recolor-core.js"></script>') > -1,
    'محرك إعادة التلوين متحمّل في الصفحة');
  assert(app.indexOf('RECOLOR.buildMask') > -1 && app.indexOf('RECOLOR.applyRecolor') > -1,
    'والتلوين موصّل في التطبيق');
  // 🔴 نيجاتيف: الرسم لازم يستخدم النسخة الملونة — لو رجع لـasset.head
  //    مباشرة، لون المنتج من الشات بيتطنّش بصمت
  assert(app.indexOf('asset.headTinted || asset.head') > -1
      && app.indexOf('ctx.drawImage(headImg, 0, 0)') > -1,
    '🔴 الرسم بيستخدم الملونة الأول');
  assert(app.indexOf("asset.failed") > -1 && app.indexOf("x.type === 'procedural'") > -1,
    '🛟 فولباك الرسمة لو الصورة ماتحملتش');
})();

// ============================================================
// ١٣) 🧊 AR-1 — حسابات الرندرر (tryon-3d-core)
// ============================================================
const D3 = require(path.resolve(__dirname, '..', 'tryon', 'tryon-3d-core.js'));
(function(){
  // ١) شباك الوش: قدام مفتوح · فوق/ورا/الجناب قماش
  assert(D3.inFaceWindow(0, 0.1, 0.95), 'قدام بالظبط = جوه الشباك (الوش بيبان)');
  assert(!D3.inFaceWindow(0, 0.95, 0.1), 'فوق الراس = قماش');
  assert(!D3.inFaceWindow(0, 0, -0.9), 'ورا الراس = قماش');
  assert(!D3.inFaceWindow(0.9, 0, 0.3), 'الجنب = قماش');
  assert(!D3.inFaceWindow(0, -0.8, 0.5), 'تحت الدقن بمسافة = قماش (اللفة بتقفل)');
  // 🔴 نيجاتيف: عكس شرط الشباك = الطرحة تترسم على الوش نفسه
  //    وتسيب فتحة في القمة — الفحوصات دي كلها بتقع فورًا

  // ٢) طيّات مقيدة — طيّة أكبر من الحد بتخرم جوه راس العميلة
  let mx = 0;
  for(let t = 0; t < 3; t += 0.11)
    for(let p = -3.14; p < 3.14; p += 0.09)
      mx = Math.max(mx, Math.abs(D3.foldNoise(t, p)));
  assert(mx <= D3.FOLD_MAX + 1e-9, 'الطيّات جوه الحد الصارم');
  assert(mx > 0.3, 'وموجودة فعلًا مش قماش مسطح');
  assert(D3.foldNoise(1, 1) === D3.foldNoise(1, 1), 'ومحددة (نفس المدخل = نفس الطيّة، مفيش رعشة)');

  // ٣) قرار اتجاه Z من أول مصفوفة حقيقية
  assertEq(D3.zFlipSign(-42), 1, 'وش على Z سالب = نظام Three زي ما هو');
  assertEq(D3.zFlipSign(35), -1, 'وش على Z موجب = لازم قلب');

  // ٤) تنعيم متكيّف: رعشة صغيرة تتبلع وحركة كبيرة تتلحق
  assert(D3.adaptAlpha(0.05) < 0.3, 'رعشة ملّي = تنعيم قوي');
  assert(D3.adaptAlpha(3) > 0.85, 'حركة ٣ سم = تتبّع شبه فوري');
  assert(D3.adaptAlpha(100) <= 0.90 + 1e-9, 'ومسقوف — عمره ما يتخطى الحد');

  // ٥) الهندسة: القشرة حوالين الراس والانسدال تحته وأوسع منه
  const top = D3.hoodPoint(0, 0);
  assert(top.y > 10, 'قمة القشرة فوق الراس');
  const side = D3.hoodPoint(Math.PI / 2, Math.PI / 2);
  assert(Math.abs(side.x) < Math.abs(D3.hoodPoint(Math.PI / 2, 0).z) + 3
      && Math.abs(side.x) > 8, 'الجنب حوالين الراس بعرض معقول');
  const sTop = D3.skirtPoint(0, 0), sBot = D3.skirtPoint(1, 0);
  assert(sTop.y < -8 && sBot.y < sTop.y, 'الانسدال من الرقبة لتحت');
  assert(Math.abs(sBot.z) > Math.abs(sTop.z), 'وبيوسع على الصدر');
})();

// ============================================================
// ١٤) 🔌 توصيلات AR-1
// ============================================================
(function(){
  const fs = require('fs');
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'tryon', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.resolve(__dirname, '..', 'tryon', 'tryon-app.js'), 'utf8');
  const r3d = fs.readFileSync(path.resolve(__dirname, '..', 'tryon', 'tryon-3d.js'), 'utf8');

  assert(html.indexOf('id="stage3d"') > -1
      && html.indexOf('<script src="tryon-3d.js"></script>') > -1,
    'كانفاس وسكريبتات الـ3D متوصلين في الصفحة');
  assert(app.indexOf('TRYON3D.init') > -1 && app.indexOf('TRYON3D.update(mat.data') > -1,
    'واللوب بيبعت المصفوفة للرندرر');
  assert(app.indexOf("get('ar')") > -1,
    '?ar=1 بتفعّل الوضع التجريبي — الافتراضي القالب المصوّر (قرار الشكل)');
  assert(app.indexOf('if(S.r3d) TRYON3D.clear();') > -1,
    'مفيش وش = الطبقة الـ3D بتتمسح (مش لفة معلقة في الهوا)');
  assert(r3d.indexOf('colorWrite: false') > -1 && r3d.indexOf('renderOrder = -1') > -1,
    '👤 occluder الراس: عمق من غير لون وبيترسم الأول');
  assert(r3d.indexOf('preserveDrawingBuffer: true') > -1,
    'الالتقاط شغال (من غيرها الصورة بتطلع فاضية)');
  assert(app.indexOf("drawImage($('stage3d')") > -1,
    'والالتقاط بيركّب طبقة الـ3D فوق الفيديو');
})();

// ============================================================
// ١٥) 🧵 فيزياء الشبكة القماشية (tryon-mesh-core)
// ============================================================
const TM = require(path.resolve(__dirname, '..', 'tryon', 'tryon-mesh-core.js'));
(function(){
  const grid = TM.buildGrid(640, 1124, 8, 12, 480);
  const n = grid.pts.length;
  assertEq(n, 9 * 13, 'الشبكة كاملة');
  assert(grid.pts[0].rigid && grid.pts[0].free === 0, 'أول صف صلب (على الوش)');
  assert(grid.pts[n-1].free > 0.8, 'وآخر صف حر (آخر الانسدال)');

  const targets = grid.pts.map(p => ({ x: p.ax, y: p.ay }));
  const st = TM.initState(targets);

  // ١) قماش ساكن على هدف ثابت = بيفضل مكانه (مفيش رعشة ذاتية)
  for(let i = 0; i < 30; i++) TM.step(st, targets, grid, 1);
  assert(TM.isSettled(st), 'هدف ثابت = الشبكة بتهدى');

  // ٢) الراس اتحرك فجأة: الصف الصلب فورًا، والانسدال بيلحق **متأخر**
  //    (ده التمايل نفسه) وبعدين يهدى على الهدف
  const moved = grid.pts.map(p => ({ x: p.ax + 60, y: p.ay }));
  TM.step(st, moved, grid, 1);
  const C = grid.cols + 1;
  assert(Math.abs(st[0].x - moved[0].x) < 1e-9, 'الصلب على الوش فورًا');
  const lag1 = Math.abs(st[n-1].x - moved[n-1].x);
  assert(lag1 > 25, 'وآخر الانسدال متأخر (قصور ذاتي = تمايل)');
  for(let i = 0; i < 90; i++) TM.step(st, moved, grid, 1);
  assert(Math.abs(st[n-1].x - moved[n-1].x) < 2, 'وبيهدى على مكانه الجديد');
  // 🔴 نيجاتيف: من غير القصور الذاتي (k=1) القماش يبقى لزقة جامدة —
  //    فحص lag1 > 25 بيقع فورًا

  // ٣) قيد المسافات: أثناء الحركة العنيفة نفسها، المسافة بين كل
  //    نقطة واللي فوقها متقيدة بطول القماش الطبيعي (±12٪) — يعني
  //    القماش بيتمايل من غير ما "يتمزّع" صفوف بعيدة عن بعض
  const jump = grid.pts.map(p => ({ x: p.ax + 200, y: p.ay + 80 }));
  const st2 = TM.initState(grid.pts.map(p => ({ x: p.ax, y: p.ay })));
  TM.step(st2, jump, grid, 1);                 // أول فريم بعد نطة كبيرة
  let worst = 0;
  for(let i = C; i < n; i++){
    if(grid.pts[i].free <= 0) continue;
    const rest = Math.hypot(jump[i].x - jump[i-C].x, jump[i].y - jump[i-C].y) || 1;
    const got = Math.hypot(st2[i].x - st2[i-C].x, st2[i].y - st2[i-C].y);
    worst = Math.max(worst, got / rest);
  }
  assert(worst <= 1.13, 'المسافة مقيدة أثناء الحركة — مفيش تمزيع (worst=' + worst.toFixed(2) + ')');
  assert(worst > 0.85, 'ومش منهارة على بعضها');

  // ٤) لفّة الراس: الجانب البعيد بينضغط ويتلاشى، والقريب لأ
  const t3 = grid.pts.map(p => ({ x: p.ax, y: p.ay }));
  const a3 = TM.yawWarp(t3, grid, 45, 320);
  const leftI = 12 * C, rightI = 12 * C + grid.cols;   // آخر صف: أول وآخر عمود
  assert(t3[leftI].x > grid.pts[leftI].ax, 'لفة يمين = الجانب الشمال (البعيد) اتضغط للمركز');
  assert(Math.abs(t3[rightI].x - grid.pts[rightI].ax) < 1e-6, 'والقريب ثابت');
  assert(a3[leftI] < 1 && a3[rightI] === 1, 'والتلاشي على البعيد بس');
  const a0 = TM.yawWarp(grid.pts.map(p => ({x:p.ax,y:p.ay})), grid, 3, 320);
  assert(a0.every(v => v === 1), 'لفة خفيفة = مفيش أي تدخل');
})();

// ============================================================
// ١٦) 🔌 توصيلات الشبكة
// ============================================================
(function(){
  const fs = require('fs');
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'tryon', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.resolve(__dirname, '..', 'tryon', 'tryon-app.js'), 'utf8');
  assert(html.indexOf('tryon-mesh-core.js') > -1 && html.indexOf('tryon-mesh.js') > -1,
    'سكريبتات الشبكة متحملة');
  assert(app.indexOf('TRYON_MESH.init') > -1 && app.indexOf('TRYON_MESH.update(') > -1,
    'واللايف بيرندر بيها');
  // v22: الشبكة بقت في الوضعين (الصورة الثابتة هي الأولوية) —
  //      القيد الباقي إنها لأصل مصوّر بس (الطرحة المرسومة بالمسطح)
  assert(app.indexOf("Tr && S.mesh && S.scarf.type === 'photo'") > -1
      && app.indexOf("S.scarf.type === 'photo' && S.mode === 'live'") === -1,
    'الشبكة للوضعين على أصل الصورة بس — والطرحة المرسومة بالمسطح');
  assert(app.indexOf('if(S.mesh) TRYON_MESH.clear();') > -1,
    'مفيش وش = الشبكة بتتمسح');
})();

// ============================================================
// ١٧) 🖼️ AR-2 — الإسقاط الأمامي (حسابات tryon-3d-core)
// ============================================================
(function(){
  // نقط الصورة الحقيقية من الكتالوج — أي تغيير فيها لازم يفضل شغّال
  const IMG = { l:[213,190], r:[396,190], top:[304,52] };
  const AW = 640, AH = 1124;

  /* ١) نقط التثبيت ثلاثية الأبعاد */
  const h3 = D3.faceAnchors3D();
  assert(Math.abs(h3.l[0] + h3.r[0]) < 1e-9 && h3.l[1] === h3.r[1],
    'الصدغين متماثلين حوالين المركز');
  assert(h3.l[0] > 0 && h3.r[0] < 0,
    'نقطة الصورة الشمال (l) = يمين الراس (+X) — تصوير قدامي مش مرايا');
  assert(h3.top[1] > h3.l[1] + 3, 'الجبهة فوق الصدغ');
  // مربوطة بالهندسة نفسها مش أرقام مكتوبة بالإيد
  assert(Math.abs(h3.l[0] - D3.FACE_WINDOW.maxAbsX * D3.SHAPE.hoodR * D3.SHAPE.hoodSquashX) < 1e-9,
    'ونصف عرض الفتحة مأخوذ من شباك الوش نفسه (يتحرك معاه تلقائي)');

  /* ٢) عكس الأفيني */
  const A = { a:2, b:0.5, c:10, d:-1, e:3, f:-4 };
  const iA = D3.invertAffine(A);
  const fwd = (T,x,y) => [T.a*x + T.b*y + T.c, T.d*x + T.e*y + T.f];
  const [u1,v1] = fwd(A, 7, -2);
  const [x1,y1] = fwd(iA, u1, v1);
  assert(near(x1, 7, 1e-9) && near(y1, -2, 1e-9), 'العكس بيرجّع نفس النقطة');
  assertEq(D3.invertAffine({a:1,b:2,c:0,d:2,e:4,f:0}), null,
    'أفيني منهار (محدد صفر) = null مش أرقام لانهاية');

  /* ٣) الإسقاط: فتحة الوش في الصورة بتقع على شباك الوش بالظبط */
  const P = D3.buildProjector(IMG, AW, AH);
  assert(!!P, 'الإسقاط اتبنى');
  const pl = P.uvAt(h3.l[0], h3.l[1]), pr = P.uvAt(h3.r[0], h3.r[1]),
        pt = P.uvAt(h3.top[0], h3.top[1]);
  assert(near(pl.px, IMG.l[0], 0.01) && near(pl.py, IMG.l[1], 0.01)
      && near(pr.px, IMG.r[0], 0.01) && near(pr.py, IMG.r[1], 0.01)
      && near(pt.px, IMG.top[0], 0.01) && near(pt.py, IMG.top[1], 0.01),
    '🔑 النقط الثلاثة بتقع على بكسلها بالظبط — الفتحة على الفتحة');
  // 🔴 نيجاتيف: لو الأفيني اتبنى بنقط مقلوبة (l مع r) النقط دي
  //    هتبعد مئات البكسلات — يعني الوش هيتغطى بالقماش
  const Pf = D3.buildProjector(IMG, AW, AH, { flipU: true });
  const plf = Pf.uvAt(h3.l[0], h3.l[1]);
  assert(Math.abs(plf.px - IMG.l[0]) > 100,
    '🔴 قلب الاتجاه بينقل الصدغ لنص الصورة التاني (الفرق مش تجميلي)');

  /* ٤) اتجاه V مقلوب لـWebGL (أصل الصورة فوق وأصل الخامة تحت) */
  assert(pt.v > 0.9, 'أعلى الصورة = v قريبة من ١');
  assert(P.uvAt(0, -40).v < 0.15, 'وأسفلها = v قريبة من صفر');
  // 🔴 نيجاتيف: من غير القلب الطرحة بتتركب مقلوبة رأسًا على عقب

  /* ٥) الرجوع بالعكس: بكسل → سم */
  const back = P.cmAt(IMG.top[0], IMG.top[1]);
  assert(near(back.x, h3.top[0], 1e-6) && near(back.y, h3.top[1], 1e-6),
    'cmAt عكس uvAt بالظبط');

  assertEq(D3.buildProjector(null, AW, AH), null, 'من غير نقط = null (مفيش كراش)');
  assertEq(D3.buildProjector(IMG, 0, AH), null, 'ومن غير مقاس صورة = null');

  /* ٦) وزن الإسقاط: قدام صورة · جنب وضهر ملمس مكرر */
  assertEq(D3.projWeight(1, 0.5, 0.5), 1, 'مواجه للكاميرا = صورة ١٠٠٪');
  assertEq(D3.projWeight(-1, 0.5, 0.5), 0, 'ضهر الراس = صفر (ملمس مكرر)');
  assertEq(D3.projWeight(0.02, 0.5, 0.5), 0, 'والسيلويت (سطح موازي للنظر) = صفر');
  const wMid = D3.projWeight(0.3, 0.5, 0.5);
  assert(wMid > 0 && wMid < 1, 'وبينهم انتقال متدرّج مش قطع حاد');
  // 🔴 نيجاتيف: لو الانتقال بقى شرط واحد (nz>0) هيبقى خط قطع بيّن
  //    على الجنب — الفحص ده بيقع

  /* ٧) برّه الصورة = ملمس مكرر (مش تمديد حافة) */
  assertEq(D3.projWeight(1, 1.4, 0.5), 0, 'UV برّه الصورة أفقيًا = صفر');
  assertEq(D3.projWeight(1, 0.5, -0.2), 0, 'وبرّاها رأسيًا = صفر');
  assert(D3.projWeight(1, 0.004, 0.5) < 0.3, 'وعند الحافة بالظبط بيتلاشى');
  // 🔴 نيجاتيف: من غير edgeFade الحافة بتتمطط (ClampToEdge) وتعمل
  //    شريط لون واقف على القماش

  /* ٨) على الهندسة الحقيقية: قدام بياخد صورة وورا لأ */
  (function(){
    const pos = [], nor = [];
    const push = (th, ph) => {
      const p = D3.hoodPoint(th, ph);
      pos.push(p.x, p.y, p.z); nor.push(p.dir.x, p.dir.y, p.dir.z);
    };
    push(1.2, 0);            // ٠: قدام (جنب الفتحة)
    push(1.2, Math.PI);      // ١: ورا الراس
    push(1.2, Math.PI/2);    // ٢: الجنب
    push(0.2, 0);            // ٣: قمة الراس مايلة لقدام
    const res = D3.projectVertices(pos, nor, P);
    assert(res.w[0] > 0.5, 'قدام = صورة');
    assertEq(res.w[1], 0, 'ورا = ملمس مكرر');
    assertEq(res.w[2], 0, 'الجنب = ملمس مكرر');
    assert(res.uv[0] >= 0 && res.uv[0] <= 1 && res.uv[1] >= 0 && res.uv[1] <= 1,
      'وUV القدام جوه الصورة');
    // النورمال مش موحّد الطول؟ لازم يتطبّع قبل الحكم.
    // بنجرّب على رأس **في منطقة الانتقال** (وزن كسري) — لأن اللي
    // وزنه ١ أصلًا بيفضل ١ حتى من غير تطبيع فمبيمسكش الباج.
    const g0 = D3.hoodPoint(1.2, 0);
    const posG = [g0.x, g0.y, g0.z];
    const norG = [0, 0.92, 0.34];                 // nz في نص المدى
    const wG = D3.projectVertices(posG, norG, P).w[0];
    assert(wG > 0.05 && wG < 0.95, 'الرأس ده فعلًا في منطقة الانتقال');
    const wG7 = D3.projectVertices(posG, norG.map((v) => v * 7), P).w[0];
    assert(Math.abs(wG7 - wG) < 1e-6,
      '🔴 طول النورمال مبيغيّرش الوزن (متطبّع جوه)');
    // 🔴 نيجاتيف: من غير التطبيع أي سكيل في الجيوميتري بيشبّع الأوزان
    //    ويحوّل الجناب كلها لصورة ممطوطة

    const none = D3.projectVertices(pos, nor, null);
    assert(none.w.every((v) => v === 0),
      'مفيش صورة لسه = وزن صفر = شكل AR-1 بالظبط (مش شاشة سودا)');
  })();

  /* ٩) ملف الصورة من الألفا */
  (function(){
    const w = 40, h = 20, rgba = new Uint8ClampedArray(w * h * 4);
    for(let y = 0; y < h; y++){
      const half = 4 + y;                       // بيوسع لتحت زي الانسدال
      for(let x = 0; x < w; x++){
        if(Math.abs(x - w/2) <= half) rgba[(y*w + x)*4 + 3] = 255;
      }
    }
    const prof = D3.assetProfile(rgba, w, h, 10);
    assertEq(prof.length, 10, 'عيّنة لكل صف مطلوب');
    assert(prof[0].halfW < prof[prof.length-1].halfW, 'والعرض بيزيد لتحت');
    assert(near(prof[0].cx, w/2, 1), 'والمركز في النص');
    const empty = new Uint8ClampedArray(w * h * 4);
    assertEq(D3.assetProfile(empty, w, h, 6).length, 0,
      'صورة شفافة بالكامل = ملف فاضي (مش صفوف وهمية)');
  })();

  /* ١٠) تفصيل الانسدال على مقاس الصورة */
  (function(){
    // القالب أطول من جسم AR-1 بكتير — ده سبب وجود الخطوة دي أصلًا
    const imgBottomY = P.cmAt(AW/2, AH - 6).y;
    assert(imgBottomY < D3.SHAPE.skirtBotY - 10,
      '🔎 قاع الصورة أنزل بكتير من قاع انسدال AR-1 (من غير تفصيل نص الصورة بيتقطع)');

    const prof = [];
    for(let k = 0; k < 12; k++)
      prof.push({ py: (k + 0.5) * AH / 12, cx: AW/2, halfW: 40 + k * 20 });
    const before = { botY: D3.SHAPE.skirtBotY, botR: D3.SHAPE.skirtBotR };
    const fit = D3.fitSkirtToAsset(P, prof);
    assert(!!fit, 'التفصيل رجّع أرقام');
    assert(fit.skirtBotY < before.botY, 'الانسدال بقى أطول');
    assert(fit.skirtBotY >= -D3.PROJ.maxDropCm - 1e-9,
      'ومسقوف بحد أقصى (مش لحد الركبة لو الصورة طويلة)');
    assert(fit.skirtBotY <= D3.SHAPE.skirtTopY - 4,
      'وعمره ما يطلع فوق بداية الانسدال (جسم مقلوب)');
    assert(fit.skirtBotR > fit.skirtTopR && fit.skirtBotR <= 30,
      'وعرض القاع أوسع من أعلاه وجوه حد معقول');
    assertEq(D3.fitSkirtToAsset(P, []), null, 'ملف فاضي = null (نسيب هندسة AR-1)');
    assertEq(D3.fitSkirtToAsset(null, prof), null, 'ومن غير إسقاط = null');

    // سقف الطول: صورة خيالية الطول متخليش الطرحة تلف الجسم كله
    const tall = D3.fitSkirtToAsset(P, prof, { maxDropCm: 12 });
    assert(near(tall.skirtBotY, -12, 1e-6), 'السقف بيتطبّق فعلًا');

    // setShape بيدمج ويرجّع — وبنرجّع الحالة عشان مانلوّثش باقي الاختبارات
    D3.setShape({ skirtBotY: fit.skirtBotY });
    assertEq(D3.SHAPE.skirtBotY, fit.skirtBotY, 'setShape بيعدّل الهندسة فعلًا');
    D3.setShape({ skirtBotY: before.botY, skirtBotR: before.botR });
    assertEq(D3.SHAPE.skirtBotY, before.botY, 'ورجّعناها');
  })();
})();

// ============================================================
// ١٨) 🔌 توصيلات AR-2
// ============================================================
(function(){
  const fs = require('fs');
  const p = (f) => path.resolve(__dirname, '..', 'tryon', f);
  const r3d = fs.readFileSync(p('tryon-3d.js'), 'utf8');
  const app = fs.readFileSync(p('tryon-app.js'), 'utf8');
  const sw  = fs.readFileSync(p('sw.js'), 'utf8');
  const html = fs.readFileSync(p('index.html'), 'utf8');
  // ⚠️ الفحص النصي على الكود بعد شيل التعليقات (الدرس المتسجل:
  //    تعليق بيشرح المنع بيوقّع الفحص)
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const r3dC = code(r3d), appC = code(app);

  assert(r3dC.indexOf('attribute vec2 aProjUv;') > -1
      && r3dC.indexOf('attribute float aProjW;') > -1,
    'الشيدر بياخد UV الإسقاط ووزنه لكل رأس');
  assert(r3dC.indexOf('#include <map_fragment>') > -1
      && r3dC.indexOf('texture2D(uProjMap, vProjUv)') > -1,
    'والمزج متحقون في MeshStandardMaterial (بنكسب إضاءته)');
  assert(r3dC.indexOf('pc.a') > -1,
    'وألفا الصورة داخلة في الوزن — الفاضي في الصورة بيرجع ملمس مش أسود');
  assert(r3dC.indexOf("geo.setAttribute('aProjUv'") > -1
      && r3dC.indexOf('C.projectVertices(') > -1,
    'والأوزان محسوبة من الكور مش من أرقام في الرندرر');

  // 🔴 نيجاتيف: لو اللون رجع على material.color هيتضرب في بكسل
  //    الصورة الملوّنة أصلًا = اللون مرتين (الكحلي يطلع أسود)
  assert(r3dC.indexOf('R.uni.uTint.value.set(opts.hex)') > -1
      && r3dC.indexOf('fabricMat.color.set(opts.hex)') === -1,
    '🔴 لون المنتج على uTint بس — مش على material.color');
  assert(r3dC.indexOf('color: 0xffffff') > -1, 'وخامة القماش بيضا (اللون من الشيدر)');

  assert(r3dC.indexOf('opts.assetKey !== R.projKey') > -1,
    'إعادة بناء الإسقاط بمفتاح — مش كل فريم (قراءة بكسلات غالية)');
  assert(r3dC.indexOf('C.fitSkirtToAsset(') > -1
      && r3dC.indexOf('R.skirt.geometry = buildSkirt(') > -1,
    'وتفصيل الانسدال بيعيد بناء الجسم فعلًا');
  assert(r3dC.indexOf('reproject') > -1 && r3dC.indexOf('window.T3D_TUNE.proj') > -1,
    '🎛️ معايرة حية: إطفاء الإسقاط + إعادة حساب من الكونسول');

  assert(appC.indexOf('asset: p3 && p3.img') > -1
      && appC.indexOf('anchors: p3 && p3.anchors') > -1,
    'التطبيق بيسلّم الصورة ونقطها للرندرر');
  // 🔴 نيجاتيف: لو سلّم asset.head مباشرة، لون المنتج من الشات
  //    هيتطنّش في الـ3D بالظبط زي باج المسار 2D القديم.
  //    ⚠️ الفحص لازم يبقى **جوه projSource** — النص ده موجود في
  //    مسار الـ2D كمان، ففحص على الملف كله بيعدّي وهو مكسور (§0).
  const extractFn = (src, sig) => {
    const i = src.indexOf(sig);
    if(i < 0) return '';
    let j = src.indexOf('{', i), depth = 0;
    for(let k = j; k < src.length; k++){
      if(src[k] === '{') depth++;
      else if(src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
    }
    return '';
  };
  const ps = extractFn(appC, 'function projSource()');
  assert(ps.length > 40, 'دالة projSource اتلقت (البلوك اتقرا صح)');
  assert(ps.indexOf('asset.headTinted || asset.head') > -1
      && ps.indexOf('ensureTint(asset, scarf, S.color)') > -1,
    '🔴 والمسقّط هو النسخة الملوّنة — نفس أصل المسار 2D');
  assert(appC.indexOf("scarf.type !== 'photo'") > -1,
    'والطرحة المرسومة بالكود مالهاش إسقاط (نقطها مش من تصوير)');

  assert(html.indexOf('<script src="tryon-3d-core.js"></script>') > -1
      && html.indexOf('tryon-core.js') < html.indexOf('tryon-3d-core.js'),
    'ترتيب التحميل: الكور قبل كور الـ3D (بيستعمل أفيني ٣ نقط بتاعه)');

  assert(sw.indexOf("echarpe-tryon-v22") > -1 && appC.indexOf("'v22'") > -1,
    'النسخة اتحدّثت في sw والكونسول (من غيرها الجهاز يفضل على القديم)');
})();

// ============================================================
// ١٩) 🩺 الإقلاع: فشل الرندرر ≠ موت الصفحة + شاشة خطأ بتقول إيه
// ------------------------------------------------------------
// شاشة سودا + "حصلت مشكلة في التحميل" على موبايل = صفر معلومات
// (مفيش كونسول). الدرس: أي شاشة خطأ لازم تحمل النسخة والمرحلة
// ونص الخطأ، وأي طبقة زيادة (3D/شبكة) متسقّطش اللي قبلها.
// ============================================================
(function(){
  const fs = require('fs');
  const app = fs.readFileSync(path.resolve(__dirname, '..', 'tryon', 'tryon-app.js'), 'utf8');
  const code = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const extractFn = (src, sig) => {
    const i = src.indexOf(sig);
    if(i < 0) return '';
    let depth = 0;
    for(let k = src.indexOf('{', i); k < src.length; k++){
      if(src[k] === '{') depth++;
      else if(src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
    }
    return '';
  };

  const bootFn = extractFn(code, 'async function boot()');
  assert(bootFn.length > 100, 'بلوك boot اتلقى (لو الاستخراج فشل باقي الفحوصات وهمية)');

  // ١) تهيئة الرندرر جوه try/catch **جواني** — مش نفس catch الكاميرا
  const initIdx = bootFn.indexOf('TRYON3D.init');
  const meshIdx = bootFn.indexOf('TRYON_MESH.init');
  assert(initIdx > -1 && meshIdx > -1, 'الاتنين بيتنادوا في الإقلاع');
  const guard = bootFn.slice(0, initIdx);
  assert((guard.match(/try\{|try \{/g) || []).length >= 2,
    '🔴 فيه try تانية جوانية قبل تهيئة الرندرر — فشل WebGL/CDN بيكمّل مسطح');
  assert(bootFn.indexOf('كمّلنا بالمسار المسطح') > -1,
    'ومكتوب صراحة إننا بنكمّل (مش catch فاضي بيبلع الخطأ بصمت)');
  // 🔴 نيجاتيف: لو الـtry الجوانية اتشالت، TRYON3D مش معرّف (سكريبت
  //    ماتحملش) = TypeError = الصفحة كلها شاشة خطأ والكاميرا شغالة

  // ٢) المرحلة بتتسجل قبل كل خطوة — عشان نعرف وقع فين
  ['S.stage = \'model\'', 'S.stage = \'camera\'', 'S.stage = \'renderer\'', 'S.stage = \'live\'']
    .forEach((m) => assert(bootFn.indexOf(m) > -1, 'مرحلة متسجلة: ' + m));

  // ٣) شاشة الخطأ بتقول النسخة والمرحلة ونص الخطأ
  const errFn = extractFn(code, 'function errLine(e)');
  assert(errFn.indexOf('TRYON_VER') > -1 && errFn.indexOf('S.stage') > -1
      && errFn.indexOf('e.name') > -1 && errFn.indexOf('e.message') > -1,
    '🔴 السطر التقني فيه النسخة + المرحلة + نوع الخطأ + نصه');
  // v19: صندوق الرسالة اتوحّد (msgBox) واختيار النص اتنقل للكور
  //      (TRYON.failureAdvice) — الفحوصات بتتبع مكانها الجديد
  const boxFn = extractFn(code, 'function msgBox(');
  assert(boxFn.indexOf('p2.textContent = errLine(e);') > -1
      && boxFn.indexOf('box.appendChild(p2)') > -1,
    'وشاشة الخطأ بتعرضه فعلًا (مش بس بتحسبه)');
  const fatalFn = extractFn(code, 'function showFatal(e)');
  assert(fatalFn.indexOf('T.failureAdvice(S.stage, e && e.name)') > -1,
    'ورسالة الخطأ بتتقرر من الكور بالمرحلة ونوع الخطأ');
  // نسخ للمشاركة في الشات
  assert(boxFn.indexOf('clipboard.writeText') > -1, 'واللمس بينسخ التفاصيل');
  // ⚠️ بناء العناصر بـcreateElement مش innerHTML — نص الخطأ ممكن
  //    يجي من مصدر خارجي (رسالة CDN)
  assert(boxFn.indexOf('innerHTML') === -1 && boxFn.indexOf('createElement') > -1,
    '🔴 مفيش innerHTML في شاشة الخطأ (نص الخطأ مش موثوق)');
  assert(boxFn.indexOf('location.reload()') > -1,
    'وفيه زرار "جرّبي تاني" — الحل الأول لأي فشل عابر');

  // ٤) التشخيص من الكونسول بيقول نفس الحكاية
  const diag = extractFn(code, 'window.tryonDiag =');
  assert(diag.indexOf('stage') > -1 && diag.indexOf('err') > -1
      && diag.indexOf('r3d') > -1 && diag.indexOf('mesh') > -1,
    'tryonDiag() فيه المرحلة والخطأ وحالة الطبقتين');
})();

// ============================================================
// ٢٠) 🌐 المتصفح اللي مبيدّيش كاميرا (WebView) — v19
// ============================================================
(function(){
  /* ١) فحص دعم الكاميرا قبل أي لمس */
  const good = { mediaDevices: { getUserMedia(){} } };
  assertEq(T.cameraSupport(good, true).ok, true, 'متصفح عادي = مدعوم');
  assertEq(T.cameraSupport({}, true).reason, 'no-api',
    'WebView من غير mediaDevices = no-api مش كراش');
  assertEq(T.cameraSupport({ mediaDevices: {} }, true).reason, 'no-api',
    'وmediaDevices موجودة من غير getUserMedia برضه no-api');
  assertEq(T.cameraSupport(null, true).reason, 'no-api', 'ومن غير navigator خالص');
  assertEq(T.cameraSupport(good, false).reason, 'insecure',
    'وhttp (مش https) = insecure — الكاميرا ممنوعة أصلًا');
  // 🔴 نيجاتيف: من غير الفحص ده، `navigator.mediaDevices.getUserMedia`
  //    بترمي TypeError غامض والصفحة كلها بتقع بشاشة سودا

  /* ٢) الرسالة الصح حسب مكان الفشل */
  const denied = T.failureAdvice('camera', 'NotAllowedError');
  assertEq(denied.kind, 'denied', 'رفض الإذن ليه رسالته');
  assertEq(denied.canPhoto, true, 'ووضع الصورة لسه شغّال');
  const nocam = T.failureAdvice('camera', 'NoCameraAPI');
  assertEq(nocam.kind, 'nocam', 'ومتصفح مش بيدعم الكاميرا ليه رسالة تانية');
  assertEq(nocam.canPhoto, true, 'وبرضه الصورة شغّالة');
  assert(nocam.text !== denied.text, 'والرسالتين مختلفتين فعلًا');
  assertEq(T.failureAdvice('camera', 'NotReadableError').kind, 'nocam',
    'وكاميرا مشغولة بتطبيق تاني = نفس المعاملة');
  const model = T.failureAdvice('model', 'TypeError');
  assertEq(model.kind, 'model', 'وفشل تحميل الموديل ليه رسالة نت/حاجب إعلانات');
  assertEq(model.canPhoto, false, '🔴 وده مفيش معاه وضع صورة — الموديل نفسه ناقص');
  assertEq(T.failureAdvice('renderer', 'Error').kind, 'generic', 'وأي حاجة تانية = عامة');
  assert(model.text.length > 20 && nocam.text.length > 20,
    'وكل الرسايل مكتوبة للعميلة مش أكواد');

  /* ٣) التوصيلات */
  const fs = require('fs');
  const app = fs.readFileSync(path.resolve(__dirname, '..', 'tryon', 'tryon-app.js'), 'utf8');
  const code = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const extractFn = (src, sig) => {
    const i = src.indexOf(sig);
    if(i < 0) return '';
    let j = src.indexOf('{', i), depth = 0;
    for(let k = j; k < src.length; k++){
      if(src[k] === '{') depth++;
      else if(src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
    }
    return '';
  };

  // الفحص **قبل** الاستدعاء — الترتيب هو الميزة كلها
  const cam = extractFn(code, 'async function startCamera()');
  assert(cam.length > 40, 'دالة startCamera اتلقت');
  const iChk = cam.indexOf('T.cameraSupport(navigator');
  const iUse = cam.indexOf('navigator.mediaDevices.getUserMedia(');
  assert(iChk > -1 && iUse > -1 && iChk < iUse,
    '🔴 فحص الدعم بيسبق أول لمس لـmediaDevices');
  assert(cam.indexOf("err.name = 'NoCameraAPI'") > -1,
    'والخطأ متسمّى — عشان الرسالة تتوجّه صح');

  // فشل الكاميرا مبيقفلش الصفحة
  const boot = extractFn(code, 'async function boot()');
  assert(boot.indexOf('photoOnly(e)') > -1,
    '🔴 فشل الكاميرا = وضع الصورة، مش شاشة خطأ ميتة');
  assert(boot.indexOf('showFatal(e)') > -1, 'والفشل الحقيقي لسه ليه شاشته');
  const iCam = boot.indexOf('await startCamera()');
  const iFatal = boot.indexOf('showFatal(e)');
  assert(iCam < iFatal, 'وترتيب المراحل زي ما هو');

  // الرجوع للايف من وضع الصورة لو الكاميرا لسه مش متاحة
  const back = extractFn(code, 'async function backToLive()');
  assert(back.indexOf('photoOnly(e)') > -1 && back.indexOf('return;') > -1,
    '🔴 زرار لايف مبيرجعش على كانفاس مقاسه undefined');
  assert(back.indexOf("S.mode = 'live';") > -1
      && back.indexOf("S.mode = 'live';") > back.indexOf('await startCamera()'),
    'والوضع مبيتغيّرش غير بعد ما الكاميرا تفتح فعلًا');

  // زرار الصورة جوه الرسالة نفسها
  const po = extractFn(code, 'function photoOnly(e)');
  assert(po.indexOf("$('photoInput').click()") > -1,
    'ورسالة الكاميرا فيها زرار بيفتح الصور على طول');
  assert(po.indexOf("S.running = false") > -1,
    'واللوب بيقف (مفيش رسم على فيديو مقفول)');

  // الصورة لما تتفتح بتشيل الرسالة
  const tp = extractFn(code, 'async function tryOnPhoto(file)');
  assert(tp.indexOf("$('fatal').style.display = 'none'") > -1,
    'واختيار صورة بيشيل الرسالة');
  assert(tp.indexOf('S.fatalShown') > -1,
    'إلا لو كان فشل حقيقي — ساعتها الرسالة بتفضل');
})();

// ============================================================
// ٢١) 🕳️🌗🌡️ v20 — واقعية الفلتر المجانية (حافة الفتحة/الظل/الحرارة)
// ============================================================
(function(){
  /* ١) البلور المفصول */
  (function(){
    const w = 9, h = 9;
    const flat = new Float32Array(w * h).fill(0.5);
    const bf = T.blurChannel(flat, w, h, 2);
    assert(near(bf[4*w+4], 0.5, 1e-6), 'سطح ثابت يفضل ثابت');
    const spike = new Float32Array(w * h); spike[4*w+4] = 1;
    const bs = T.blurChannel(spike, w, h, 2);
    assert(bs[4*w+4] < 1 && bs[4*w+5] > 0 && bs[4*w+6] > 0,
      'النبضة بتتوزع على الجيران (تدرّج)');
    assert(bs[0] < bs[4*w+5], 'وبتضعف بالبعد');
  })();

  /* ٢) تدرّج حافة الفتحة — على صورة صناعية */
  const mk = (w, h) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for(let i = 3; i < d.length; i += 4) d[i] = 255;   // كله قماش معتم
    return d;
  };
  const hole = (d, w, cx, cy, r) => {
    for(let y = 0; y < Math.floor(d.length/4/w); y++)
      for(let x = 0; x < w; x++)
        if(Math.hypot(x-cx, y-cy) <= r) d[(y*w+x)*4+3] = 0;
  };
  (function(){
    const w = 60, h = 60;
    const d = mk(w, h);
    hole(d, w, 30, 30, 10);
    const res = T.featherHoleEdge(d, w, h, [30, 30], { feather: 3 });
    assert(res.holePx > 250 && res.holePx < 400, 'الفتحة اتلقت بحجمها الصح');
    assertEq(d[(30*w+30)*4+3], 0, 'مركز الفتحة زي ما هو');
    assertEq(d[(5*w+5)*4+3], 255, '🔴 القماش البعيد ماتلمسش (درس الـflood الأبيض)');
    // التدرّج: بكسلات وسيطة على خط من المركز للقماش
    let mids = 0;
    for(let x = 30; x < 55; x++){
      const a = d[(30*w+x)*4+3];
      if(a > 15 && a < 240) mids++;
    }
    assert(mids >= 3, '🔴 الحافة متدرّجة مش قطع حاد — دي الميزة كلها');
  })();
  (function(){
    // بذرة على قماش معتم = مفيش لمس خالص
    const w = 40, h = 40;
    const d = mk(w, h);
    const before = d.slice();
    assertEq(T.featherHoleEdge(d, w, h, [20, 20]).holePx, 0,
      'بذرة مش على فتحة = صفر');
    assert(d.every((v, i) => v === before[i]), 'والصورة ماتغيرتش بكسل واحد');
  })();
  (function(){
    // 🛟 فتحة "مفتوحة" على الخلفية الخارجية = flood هياكل الدنيا — الحارس بيلغي
    const w = 50, h = 50;
    const d = new Uint8ClampedArray(w * h * 4);   // كله شفاف (خلفية)
    for(let x = 0; x < w; x++) d[(25*w+x)*4+3] = 255;  // خط قماش واحد بس
    const before = d.slice();
    assertEq(T.featherHoleEdge(d, w, h, [10, 10]).holePx, 0,
      '🔴 flood أكبر من الحارس = إلغاء (مش تدرّج على حواف الطرحة الخارجية)');
    assert(d.every((v, i) => v === before[i]), 'ومفيش لمس');
  })();

  /* ٣) ظل التلامس */
  (function(){
    const an = { l:[100,200], r:[220,200], top:[160,120], chin:[160,320],
                 cheekL:[120,240], cheekR:[200,240] };
    const ex = T.expandAnchors(an);
    const sh = T.contactShadowSpec(an, ex);
    assertEq([sh.x, sh.y], [ex.top[0], ex.top[1]],
      'الشريط بيبدأ من حافة الطرحة العلوية (المرفوعة) مش من معلم الوش');
    assert(sh.w > ex.faceW, 'وأعرض من الوش (يغطي الجناب)');
    assert(sh.h > 0 && sh.h < ex.faceH * 0.5, 'ونازل على الجبهة مش الوش كله');
    assert(sh.alpha >= 0.05 && sh.alpha <= 0.3, 'وناعم — ضل مش حرق');
    assertEq(sh.rot, 0, 'راس مظبوطة = مفيش ميل');
    const anT = { l:[100,190], r:[220,210], top:[160,120], chin:[160,320],
                  cheekL:[120,240], cheekR:[200,240] };
    const shT = T.contactShadowSpec(anT, T.expandAnchors(anT));
    assert(Math.abs(shT.rot) > 0.05, 'وراس مايلة = الظل بيميل معاها');
  })();

  /* ٤) حرارة اللون */
  assertEq(T.tempTintColor(3, -2), null, 'إضاءة محايدة = مفيش تلوين (القماش زي ما هو)');
  const warm = T.tempTintColor(22, -12);
  assert(!!warm && warm.r > 128 && warm.b < 128, 'إضاءة دافية = تلوين دافي بنفس الاتجاه');
  assert(warm.alpha >= 0.05 && warm.alpha <= 0.13, 'والشدة مسقوفة — القماش مش مراية');
  const cool = T.tempTintColor(-15, 20);
  assert(!!cool && cool.r < 128 && cool.b > 128, 'وإضاءة باردة = بارد');
  const extreme = T.tempTintColor(300, -300);
  assert(extreme.alpha <= 0.13 && extreme.r <= 188 && extreme.b >= 68,
    '🔴 قيمة مجنونة (وش قدام لمبة حمرا) متطلعش تلوين مجنون');
  assertEq(T.tempBucket(2, 3), T.tempBucket(1, 4), 'رعشة صغيرة = نفس مفتاح الكاش');
  assert(T.tempBucket(2, 3) !== T.tempBucket(20, 3), 'وتغيير حقيقي = مفتاح جديد');

  /* ٥) التوصيلات */
  const fs = require('fs');
  const app = fs.readFileSync(path.resolve(__dirname, '..', 'tryon', 'tryon-app.js'), 'utf8');
  const cat = fs.readFileSync(path.resolve(__dirname, '..', 'tryon', 'assets', 'catalog.js'), 'utf8');
  const code = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const extractFn = (src, sig) => {
    const i = src.indexOf(sig);
    if(i < 0) return '';
    let j = src.indexOf('{', i), depth = 0;
    for(let k = j; k < src.length; k++){
      if(src[k] === '{') depth++;
      else if(src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
    }
    return '';
  };

  // 📐 الفتحة بتحضن الوش: fit في الكتالوج + استخدامه في الرسم
  const mFit = cat.match(/fit:\s*\{\s*widen:\s*([\d.]+)/);
  assert(!!mFit && parseFloat(mFit[1]) < 1.2,
    '🔴 fit القالب أضيق من الافتراضي 1.28 — من غيره خلفية صورة العميلة بتبان إطار حوالين وشها');
  assert(code.indexOf('T.expandAnchors(an, S.scarf.fit)') > -1,
    'والرسم بيستخدم fit بتاع الأصل نفسه');

  // 🕳️ معالجة الفتحة وقت التحميل
  const ph = extractFn(code, 'function processHeadImage(');
  assert(ph.indexOf('T.featherHoleEdge(') > -1, 'التدرّج من الكور');
  assert(ph.indexOf('clearFaceHole') === -1,
    '🔴 والطريقة الخطرة (flood على الأبيض بياكل القماش البيج) مش موجودة');
  assert(ph.indexOf('if(!res.holePx) return img;') > -1,
    'مفيش فتحة تحت البذرة = الأصل يرجع زي ما هو');
  assert(code.indexOf('asset.head = processHeadImage(hi, scarf, asset);') > -1,
    'والمعالجة على مسار التحميل فعلًا');
  // الأصل بقى ممكن يبقى كانفاس — naturalWidth مش موجودة فيه
  const et = extractFn(code, 'function ensureTint(');
  assert(et.indexOf('asset.head.naturalWidth || asset.head.width') > -1,
    '🔴 ensureTint بيتعامل مع الكانفاس (naturalWidth||width) — من غيرها التلوين بيقع بصمت');

  // 🌡️ الحرارة: مخبوزة بكاش متكمّي مش كل فريم
  const etp = extractFn(code, 'function ensureTemp(');
  assert(etp.indexOf('T.tempTintColor(') > -1 && etp.indexOf('T.tempBucket(') > -1,
    'الحرارة من الكور والمفتاح متكمّي');
  assert(etp.indexOf('if(asset.tempKey === key) return;') > -1,
    '🔴 نفس المفتاح = مفيش إعادة خبز (كانفاس كل فريم = سخونة موبايل)');
  assert(etp.indexOf("'source-atop'") > -1, 'والتلوين على القماش بس مش الشفاف');
  assert(code.indexOf('asset.headTemp = null; asset.tempKey = null;   ') > -1
      || code.indexOf('asset.headTemp = null; asset.tempKey = null;') > -1,
    'وتغيير لون المنتج بيبطّل الحرارة المخبوزة القديمة');
  assert(code.indexOf('return asset.headTemp || asset.headTinted || asset.head;') > -1,
    'وسلسلة الشكل: حرارة ← لون ← أصل');

  // 🌗 الظل: قبل القماش وقبل فلتر السطوع وبمزج multiply
  const dr = extractFn(code, 'function draw(result, srcEl)');
  const iShadow = dr.indexOf('T.contactShadowSpec(');
  const iFilter = dr.indexOf("ctx.filter = 'brightness(");
  const iHead = dr.indexOf('ctx.drawImage(headImg');
  assert(iShadow > -1 && iFilter > -1 && iHead > -1, 'العناصر التلاتة موجودة في الرسم');
  assert(iShadow < iFilter,
    '🔴 الظل قبل فلتر السطوع — الضل مش بياخد سطوع الطرحة');
  assert(iShadow < iHead, '🔴 والظل تحت القماش مش فوقه');
  assert(dr.indexOf("globalCompositeOperation = 'multiply'") > -1,
    'وبمزج multiply (تغميق حقيقي مش طبقة رمادية)');

  // إضاءة الوضعين مفصولة + مسار عيّنة واحد
  const rs = extractFn(code, 'function resetSmooth()');
  assert(rs.indexOf('S.smDr.reset(); S.smDb.reset();') > -1,
    'تبديل الوضع بيصفّر الحرارة (إضاءة الصورة غير اللايف)');
  const sl = extractFn(code, 'function sampleLuma(');
  assert(sl.indexOf('sampleSkin(ctx, an).luma') > -1,
    'sampleLuma غلاف على sampleSkin — مسار عيّنة واحد مش اتنين بيفرقوا');
})();

// ============================================================
// ٢٢) 🧰 v21 — أداة تجهيز الأصول (prep-core)
// ============================================================
const PR = require(path.resolve(__dirname, '..', 'tryon', 'prep-core.js'));
(function(){
  const mkImg = (w, h, fill) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for(let p = 0; p < w * h; p++){
      d[p*4] = fill[0]; d[p*4+1] = fill[1]; d[p*4+2] = fill[2]; d[p*4+3] = 255;
    }
    return d;
  };
  const paint = (d, w, x0, y0, x1, y1, c) => {
    for(let y = y0; y <= y1; y++)
      for(let x = x0; x <= x1; x++){
        const i = (y*w+x)*4;
        d[i]=c[0]; d[i+1]=c[1]; d[i+2]=c[2]; d[i+3]=255;
      }
  };
  const BG = [236, 232, 226];        // خلفية استوديو كريمي (مش أبيض نقي — درس dominantColor)
  const FABRIC = [200, 186, 176];    // القماش البيج — فرقه عن الخلفية ~٣٦

  /* ١) لون الخلفية من الأركان */
  (function(){
    const w = 40, h = 40, d = mkImg(w, h, BG);
    paint(d, w, 10, 10, 29, 29, FABRIC);
    const bg = PR.cornerBg(d, w, h);
    assert(Math.abs(bg.r - BG[0]) < 3 && Math.abs(bg.b - BG[2]) < 3,
      'لون الخلفية من الأركان مش من نص الصورة');
  })();

  /* ٢) إزالة الخلفية — flood من الحواف بس */
  (function(){
    const w = 60, h = 60, d = mkImg(w, h, BG);
    paint(d, w, 15, 15, 44, 44, FABRIC);            // الطرحة
    paint(d, w, 27, 25, 33, 33, BG);                // "فتحة" بلون الخلفية جوه الطرحة
    const res = PR.removeStudioBg(d, w, h, { tol: 20, feather: 2 });
    assert(res.removed > 1000, 'الخلفية الخارجية اتشالت');
    assertEq(d[(3*w+3)*4+3], 0, 'ركن الصورة بقى شفاف');
    assertEq(d[(30*w+30)*4+3], 255,
      '🔴 المنطقة اللي بنفس لون الخلفية **جوه** الطرحة ماتلمستش (مش متوصلة بالحواف)');
    assertEq(d[(29*w+29)*4+3], 255, 'والقماش نفسه سليم — درس v20: البيج مش أبيض');
    // تدرّج على الحافة الخارجية
    let mids = 0;
    for(let x = 5; x < 30; x++){ const a = d[(30*w+x)*4+3]; if(a > 15 && a < 240) mids++; }
    assert(mids >= 2, 'وحافة القص متدرّجة مش حادة');
  })();

  /* ٣) تفريغ الفتحة من نقرة */
  (function(){
    const w = 60, h = 60, d = mkImg(w, h, BG);
    paint(d, w, 10, 10, 49, 49, FABRIC);
    paint(d, w, 24, 22, 36, 34, BG);                // فتحة المانيكان
    PR.removeStudioBg(d, w, h, { tol: 20, feather: 1 });
    const res = PR.clearHoleAt(d, w, h, [30, 28], { tol: 20 });
    assert(res.holePx > 100, 'الفتحة اتفرّغت من النقرة');
    assertEq(d[(28*w+30)*4+3], 0, 'ومركزها شفاف');
    assertEq(d[(12*w+12)*4+3], 255, 'والقماش سليم');
    // نقرة على قماش = صفر لمس
    const before = d.slice();
    assertEq(PR.clearHoleAt(d, w, h, [12, 12], { tol: 20 }).holePx, 0,
      '🔴 نقرة على قماش = مفيش تفريغ (فرقه عن الخلفية أكبر من التسامح)');
    assert(d.every((v, i) => v === before[i]), 'ولا بكسل اتغير');
  })();

  /* ٤) القص التلقائي */
  (function(){
    const w = 50, h = 50;
    const d = new Uint8ClampedArray(w * h * 4);     // شفاف
    paint(d, w, 20, 10, 34, 40, FABRIC);
    const box = PR.autoCrop(d, w, h, 3);
    assertEq([box.x, box.y], [17, 7], 'القص على الحدود + الهامش');
    assertEq([box.w, box.h], [21, 37], 'وبالمقاس الصح');
    const empty = new Uint8ClampedArray(w * h * 4);
    assertEq(PR.autoCrop(empty, w, h), null, 'صورة شفافة = null مش قص وهمي');
  })();

  /* ٥) فحص النقط */
  const V = (an) => PR.validateAnchors(an, 600, 800);
  assert(V({ l:[150,300], r:[450,300], top:[300,180] }).ok, 'نقط سليمة بتعدي');
  assert(!V({ l:[450,300], r:[150,300], top:[300,180] }).ok, 'الشمال يمين اليمين = رفض');
  assert(!V({ l:[150,300], r:[190,300], top:[170,180] }).ok, 'مسافة صغيرة أوي = رفض');
  assert(!V({ l:[150,300], r:[450,300], top:[300,500] }).ok, 'الجبهة تحت الصدغين = رفض');
  assert(!V({ l:[150,300], r:[450,300], top:[550,180] }).ok, 'الجبهة برّه ما بينهم = رفض');
  assert(!V({ l:[150,300], r:[450,300] }).ok, 'نقطة ناقصة = رفض');
  assert(!V({ l:[-5,300], r:[450,300], top:[300,180] }).ok, 'نقطة برّه الصورة = رفض');

  /* ٦) المعرّف */
  assertEq(PR.slugId('Chiffon 02'), 'chiffon-02', 'مسافات وحروف كبيرة بتتظبط');
  assertEq(PR.slugId('طرحة!!'), PR.slugId('طرحة!!').match(/^scarf-/) ? PR.slugId('طرحة!!') : 'x',
    PR.slugId('طرحة!!'), 'عربي بس = معرّف تلقائي (مش فاضي)');
  assert(PR.slugId('') !== '', 'وفاضي برضه مش بيرجع فاضي');

  /* ٧) سطر الكتالوج — لازم يبقى JS صالح فعلًا */
  (function(){
    const an = { l:[150,300], r:[450,300], top:[300,180] };
    const sn = PR.catalogSnippet("chiffon-02", "شيفون مطرّزة 'جديدة'", an,
      [[200,186,176],[150,138,124]]);
    let obj = null;
    try{ obj = eval('(' + sn + ')'); }catch(e){}
    assert(!!obj, '🔴 السطر بيتبلع كـJS — الاقتباسة في الاسم متهربة صح');
    assertEq(obj.id, 'chiffon-02', 'والمعرّف صح');
    assertEq(obj.head.anchors.l, [150,300], 'والنقط زي ما اتنقرت');
    assertEq(obj.head.url, 'assets/chiffon-02-head.png',
      'واسم الملف من المعرّف — نفس اللي زرار التنزيل بيسميه');
    assert(obj.fit && obj.fit.widen < 1.2,
      '🔴 الأصل الجديد بياخد fit الضيق تلقائي — درس القالب (1.28 بيبين الخلفية)');
    assertEq(obj.recolor.seeds.length, 2, 'وعيّنات التلوين موجودة');
    const noSeeds = eval('(' + PR.catalogSnippet('x', 'y', an, null) + ')');
    assert(!noSeeds.recolor, 'ومن غير عيّنات = مفيش recolor (مش seeds فاضية تكسر التلوين)');
  })();

  /* ٨) نقرة الشاشة → إحداثي صورة */
  const rect = { left: 20, top: 40, width: 360, height: 480 };
  assertEq(PR.tapToImage(200, 280, rect, 720, 960), [360, 480],
    'النص على الشاشة = النص في الصورة (مقاس العرض ≠ مقاس الصورة)');
  assertEq(PR.tapToImage(10, 30, rect, 720, 960), [0, 0], 'برّه الحدود بيتقصقص جوه');

  /* ٩) التوصيلات */
  const fs = require('fs');
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'tryon', 'prep.html'), 'utf8');
  const sw = fs.readFileSync(path.resolve(__dirname, '..', 'tryon', 'sw.js'), 'utf8');
  assert(html.indexOf('<script src="tryon-core.js"></script>') > -1
      && html.indexOf('tryon-core.js') < html.indexOf('prep-core.js'),
    'الكور قبل prep-core (بيستعمل بلوره وأفينيه)');
  assert(html.indexOf('T.expandAnchors(an, fit)') > -1
      && html.indexOf('T.affineFrom3(') > -1,
    '🔴 المعاينة بنفس محرك التطبيق بالظبط — مش رسمة تانية بتكدّب');
  assert(html.indexOf('P.tapToImage(') > -1, 'واللمس بيتحوّل بإحداثيات الكور');
  assert(html.indexOf('أداة داخلية') > -1, 'ومكتوب عليها إنها مش للعميلات');
  assert(sw.indexOf("'./prep.html', './prep-core.js'") > -1,
    'والأداة في كاش الـsw (تشتغل أوفلاين في المخزن)');
})();

// ============================================================
// ٢٣) 🫥 v22 — الفتحة العضوية (الفتحة بتاخد شكل وش العميلة)
// ============================================================
const TMC = require(path.resolve(__dirname, '..', 'tryon', 'tryon-mesh-core.js'));
(function(){
  /* ١) محيط الوش من المعالم */
  const lm = new Array(478).fill(0).map((_, i) => ({ x: (i % 100) / 100, y: (i % 77) / 77 }));
  const fc = T.faceContourFromLandmarks(lm, 200, 100);
  assertEq(fc.length, 9, '٩ نقط على محيط الوش (جبهة/صدغ/خد/فك/دقن ×٢)');
  assertEq(fc[0], [ lm[103].x * 200, lm[103].y * 100 ], 'وبمعالم MediaPipe الصح');
  assert(T.FACE_CONTOUR.indexOf(152) > -1 && T.FACE_CONTOUR.indexOf(172) > -1
      && T.FACE_CONTOUR.indexOf(397) > -1,
    'الدقن والفكين جوه المحيط — منطقة تحت الدقن (أهم مشكلة) متغطية');

  /* ٢) عكس الأفيني في الكور */
  const A2 = { a: 1.4, b: -0.3, c: 20, d: 0.2, e: 1.7, f: -8 };
  const I2 = T.invertAffine(A2);
  const fx = A2.a * 5 + A2.b * 9 + A2.c, fy = A2.d * 5 + A2.e * 9 + A2.f;
  assert(near(I2.a * fx + I2.b * fy + I2.c, 5, 1e-9)
      && near(I2.d * fx + I2.e * fy + I2.f, 9, 1e-9), 'ذهاب ورجوع = نفس النقطة');
  assertEq(T.invertAffine({ a:2, b:4, c:0, d:1, e:2, f:0 }), null, 'منهار = null');

  /* ٣) محيط الفتحة من featherHoleEdge */
  (function(){
    const w = 80, h = 80;
    const d = new Uint8ClampedArray(w * h * 4);
    for(let i = 3; i < d.length; i += 4) d[i] = 255;
    for(let y = 0; y < h; y++)
      for(let x = 0; x < w; x++)
        if(Math.hypot(x - 40, y - 40) <= 14) d[(y*w+x)*4+3] = 0;   // فتحة دايرة
    const res = T.featherHoleEdge(d, w, h, [40, 40], { feather: 2, contourK: 16 });
    assert(res.holePx > 500, 'الفتحة اتلقت');
    assert(near(res.centroid[0], 40, 1.5) && near(res.centroid[1], 40, 1.5),
      'المركز في مكانه');
    assertEq(res.radii.length, 16, 'ونصف قطر لكل زاوية');
    for(let k = 0; k < 16; k++)
      assert(near(res.radii[k], 14, 2.5), 'فتحة دايرة = أنصاف أقطار متساوية تقريبًا');
    // من غير contourK = مفيش شغل زيادة
    const d2 = new Uint8ClampedArray(w * h * 4);
    for(let i = 3; i < d2.length; i += 4) d2[i] = 255;
    for(let y = 30; y < 50; y++) for(let x = 30; x < 50; x++) d2[(y*w+x)*4+3] = 0;
    const r2 = T.featherHoleEdge(d2, w, h, [40, 40], { feather: 2 });
    assert(r2.holePx > 0 && !r2.radii, 'من غير الطلب = مفيش محيط (مفيش حساب ببلاش)');
  })();

  /* ٤) الاستيفاء الدائري */
  const cont = { radii: new Float32Array([10, 20, 10, 20]) };
  assert(near(T.holeRadiusAt(cont, 0), 10, 1e-6), 'على العيّنة نفسها');
  assert(near(T.holeRadiusAt(cont, Math.PI / 4), 15, 1e-6), 'وبين عيّنتين = النص');
  assert(near(T.holeRadiusAt(cont, 2 * Math.PI - Math.PI / 4), 15, 1e-6),
    '🔴 واللفة بتقفل — آخر عيّنة بتستوفي مع الأولى مش بتقف');
  assert(near(T.holeRadiusAt(cont, -Math.PI / 4), 15, 1e-6), 'وزاوية سالبة شغالة');

  /* ٥) شد الشبكة (contourWarp) */
  (function(){
    const grid = TMC.buildGrid(100, 100, 4, 4, 50);
    const mk = () => grid.pts.map((p) => ({ x: p.ax, y: p.ay }));
    const t1 = mk();
    // شد نقطة (50,50) عشرين بكسل يمين
    TMC.contourWarp(t1, grid, [{ from: { x: 50, y: 50 }, to: { x: 70, y: 50 } }], 60);
    const iMid = grid.pts.findIndex((p) => p.ax === 50 && p.ay === 50);
    const iFar = grid.pts.findIndex((p) => p.ax === 0 && p.ay === 0);
    assert(near(t1[iMid].x, 70, 0.5), 'الرأس على نقطة الشد بيوصل للهدف بالظبط');
    assert(near(t1[iFar].x, 0, 3), 'والبعيد (برّه نصف قطر التأثير تقريبًا) ولا هو حاسس');
    const iNear = grid.pts.findIndex((p) => p.ax === 50 && p.ay === 25);
    assert(t1[iNear].x > 52 && t1[iNear].x < 69, 'وبينهم انتقال متدرّج');
    // من غير أزواج = مفيش لمس
    const t2 = mk();
    TMC.contourWarp(t2, grid, [], 60);
    assert(t2.every((p, i) => p.x === grid.pts[i].ax), 'أزواج فاضية = no-op');
    TMC.contourWarp(t2, grid, null, 60);
    assert(t2.every((p, i) => p.x === grid.pts[i].ax), 'وnull برضه');
  })();

  /* ٦) التوصيلات */
  const fs = require('fs');
  const app = fs.readFileSync(path.resolve(__dirname, '..', 'tryon', 'tryon-app.js'), 'utf8');
  const mesh = fs.readFileSync(path.resolve(__dirname, '..', 'tryon', 'tryon-mesh.js'), 'utf8');
  const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const code = strip(app), meshC = strip(mesh);
  const extractFn = (src, sig) => {
    const i = src.indexOf(sig);
    if(i < 0) return '';
    let j = src.indexOf('{', i), depth = 0;
    for(let k = j; k < src.length; k++){
      if(src[k] === '{') depth++;
      else if(src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
    }
    return '';
  };

  // الشبكة بقت في الوضعين — ده جوهر "الصورة الأول"
  assert(code.indexOf("S.scarf.type === 'photo' && S.mode === 'live'") === -1,
    "🔴 قيد اللايف اتشال — وضع الصورة كان واخد الأفيني المسطح وهو الأولوية");
  const iw = meshC.indexOf('TM.contourWarp(targets, M.grid, pairs, warpR);');
  assert(iw > -1, 'الرندرر بيطبّق الشد');
  assert(iw < meshC.indexOf('TM.yawWarp(') && iw < meshC.indexOf('TM.step('),
    '🔴 الشد قبل اللفة والفيزياء — جزء من المكان الطبيعي مش تأثير فوقه');

  const cp = extractFn(code, 'function contourPairs(');
  assert(cp.indexOf('T.invertAffine(Tr)') > -1 && cp.indexOf('T.holeRadiusAt(') > -1,
    'الأزواج: عكس الأفيني + حافة الفتحة عند نفس الزاوية');
  assert(cp.indexOf('S.smContour[i].push(raw[i])') > -1,
    '🔴 محيط الوش متنعّم — من غيره الفتحة ترعش مع كل فريم في اللايف');
  const mOut = cp.match(/const OUT = ([\d.]+)/);
  assert(!!mOut && parseFloat(mOut[1]) > 1.0 && parseFloat(mOut[1]) <= 1.12,
    '🔴 الهدف موسّع فعلًا للبرّه (>1) — القماش يركب على حرف الوش مش يقف عنده بالظبط');
  assert(code.indexOf('asset.holeContour = { c: res.centroid, radii: res.radii }') > -1
      && code.indexOf('contourK: 32') > -1,
    'ومحيط الفتحة بيتخزن على الأصل وقت التحميل');
  assert(code.indexOf('S.smContour.forEach((sm) => sm.reset());') > -1,
    'وتبديل الوضع بيصفّر تنعيم المحيط');
  assert(code.indexOf('window.TRYON_DEBUG') > -1
      && extractFn(code, 'function debugContour(').indexOf('p.from.x') > -1,
    '§ديبج: TRYON_DEBUG بيرسم أزواج الشد للمعايرة');
})();
