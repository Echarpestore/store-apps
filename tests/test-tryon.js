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
  // صورة 4 بكسل: 3 حمرا + 1 أبيض (خلفية) → الغالب أحمر والأبيض متجاهل
  const px = new Uint8ClampedArray([
    200,30,40,255,  201,31,41,255,  199,28,38,255,  250,250,250,255
  ]);
  const d = T.dominantColor(px);
  assert(d.hex && parseInt(d.hex.slice(1,3),16) > 180, 'اللون الغالب أحمر');
  assert(parseInt(d.hex.slice(3,5),16) < 60, 'مش متلوث بالأبيض');
  assert(near(d.confidence, 0.75, 0.01), 'الثقة = نسبة بكسلات اللون (٣ من ٤)');

  // 🔴 نيجاتيف: من غير تجاهل الخلفية، طرحة كحلي على خلفية بيضا كانت
  //    هتطلع "بيبي بلو" — الفحص (مش متلوث بالأبيض) بيقع لو التجاهل اتشال

  // صورة كلها أبيض/شفاف = مفيش لون — المتصل يفضل على الافتراضي
  const w = new Uint8ClampedArray([250,250,250,255, 255,255,255,255, 10,10,10,50]);
  const dw = T.dominantColor(w);
  assert(dw.hex === null && dw.confidence === 0, 'كلها خلفية = null مش لون وهمي');

  // لونين والأغلبية بتكسب: 2 كحلي + 1 بيج → كحلي
  const mix = new Uint8ClampedArray([
    43,53,80,255,  45,55,82,255,  201,172,134,255
  ]);
  const dm = T.dominantColor(mix);
  assert(parseInt(dm.hex.slice(5,7),16) > parseInt(dm.hex.slice(1,3),16),
    'الباكت الأكبر (الكحلي) هو اللي بيكسب مش المتوسط الكلي');

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

  // إعادة التلوين لكحلي: الغامق يفضل أغمق من الفاتح (L محفوظة)
  const navyHsl = R.rgbToHsl(43, 53, 80);
  const nLight = R.recolorPixel(mauve, navyHsl);
  const nDark = R.recolorPixel(mauveDark, navyHsl);
  const lum = (p) => 0.299*p[0] + 0.587*p[1] + 0.114*p[2];
  assert(lum(nDark) < lum(nLight), 'الظل فضل أغمق — الطيّات محفوظة');
  assert(nLight[2] > nLight[0], 'واللون فعلًا بقى ناحية الأزرق');

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
