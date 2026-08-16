/* ============================================================
   🧕 tryon-3d-core.js — حسابات رندرر الـAR (بدون Three.js)
   ------------------------------------------------------------
   كل اللي ينفع يتختبر في Node عايش هنا؛ tryon-3d.js بيستهلكه.
   وحدات القياس: سنتيمتر في فضاء الراس القياسي بتاع MediaPipe
   (X يمين · Y فوق · Z قدام خارج من الوش).
   ============================================================ */
'use strict';

const T3D = {};

/* ---------- ١) فتحة الوش في جسم اللفة ---------- */
// بنبني اللفة كقشرة كروية حوالين الراس ونقص منها "شباك" الوش.
// dir = اتجاه وحدة (x,y,z) لنقطة على القشرة من مركز الراس.
// جوه الشباك = المثلث ده مش بيترسم (الوش بيبان منه).
T3D.FACE_WINDOW = { minZ: 0.55, maxAbsX: 0.62, minY: -0.60, maxY: 0.74 };

T3D.inFaceWindow = function(x, y, z){
  const w = T3D.FACE_WINDOW;
  return z > w.minZ && Math.abs(x) < w.maxAbsX && y > w.minY && y < w.maxY;
};

/* ---------- ٢) طيّات القماش ---------- */
// إزاحة نصف قطرية ناعمة (سم) — عشان القشرة تقرا "قماش" مش بالونة.
// مربوطة بحد أقصى صارم عشان الطيّة متخرمش جوه راس العميلة.
T3D.FOLD_MAX = 0.55;
T3D.foldNoise = function(theta, phi){
  const v = 0.30 * Math.sin(3 * phi + 1.7)
          + 0.22 * Math.sin(7 * phi + theta * 2.3)
          + 0.14 * Math.sin(11 * phi + 0.9)
          + 0.10 * Math.sin(5 * theta + 2 * phi);
  return Math.max(-T3D.FOLD_MAX, Math.min(T3D.FOLD_MAX, v));
};

/* ---------- ٣) اتجاه محور Z بتاع MediaPipe ---------- */
// فيه نسختين من فضاء الكاميرا في الدنيا (Z للقدام/للورا). بدل ما
// نفترض ونغلط، بنقرر من أول مصفوفة حقيقية: الوش قدام الكاميرا،
// فلو إزاحة Z موجبة يبقى النظام معكوس عن كاميرا Three (اللي بتبص
// على -Z) ولازم نقلب.
T3D.zFlipSign = function(tz){
  return tz > 0 ? -1 : 1;
};

/* ---------- ٤) تنعيم الوضع — نفس فلسفة اللايف 2D ---------- */
// حركة كبيرة = تتبّع سريع (مفيش تهنيج) · ثبات = تنعيم قوي (مفيش رعشة)
// dist بوحدات سم (إزاحة) أو راديان (دوران).
T3D.adaptAlpha = function(dist, minA, maxA, speed){
  minA = minA == null ? 0.22 : minA;
  maxA = maxA == null ? 0.90 : maxA;
  speed = speed == null ? 0.35 : speed;
  return Math.min(maxA, minA + Math.abs(dist) * speed);
};

/* ---------- ٥) هندسة اللفة (البارامترات المرجعية) ---------- */
// أنصاف أقطار بالسم حوالين راس بالغة نموذجية — قابلة للمعايرة
// من الكونسول وقت الاختبار الحي (window.T3D_TUNE في الرندرر).
T3D.SHAPE = {
  // ⭐ معايرة من أول سكرين حي: أصل مصفوفة MediaPipe عند **سطح الوش** —
  //    التمركز عليه خلّى القشرة خاتم على الوش والشعر ظاهر وراها.
  //    rigDz بيرجّع الجسم كله لمركز الجمجمة.
  rigDz: -3.2,
  hoodR: 10.4,
  hoodSquashX: 0.86,
  hoodLift: 0.8,
  hoodBack: -0.5,
  thetaEnd: 2.75,
  // الانسدال كان مريلة عملاقة قدام الصدر — أنحف ولازق بالجسم وأقصر
  skirtTopY: -9.5,
  skirtBotY: -25,
  skirtTopR: 7.4,
  skirtBotR: 14.5,
  skirtSquashZ: 0.62,
  skirtBack: -1.5,
  occluder: { x: 7.6, y: 10.6, z: 9.4, dy: 0.6, dz: -0.6 }
};

// نقطة على القشرة: theta من فوق (0=قمة) · phi حوالين المحور (0=قدام +Z)
T3D.hoodPoint = function(theta, phi){
  const s = T3D.SHAPE;
  const st = Math.sin(theta);
  const dir = { x: st * Math.sin(phi), y: Math.cos(theta), z: st * Math.cos(phi) };
  const r = s.hoodR + T3D.foldNoise(theta, phi);
  return {
    x: dir.x * r * s.hoodSquashX,
    y: dir.y * r + s.hoodLift,
    z: dir.z * r + s.hoodBack,
    dir: dir
  };
};

// نقطة على الانسدال: v من 0 (رقبة) لـ1 (حافة سفلية متموجة)
T3D.skirtPoint = function(v, phi){
  const s = T3D.SHAPE;
  const wave = v > 0.85 ? Math.sin(6 * phi + 1.2) * 1.4 * (v - 0.85) / 0.15 : 0;
  const r = s.skirtTopR + (s.skirtBotR - s.skirtTopR) * v
          + T3D.foldNoise(2.6 + v, phi) * 1.6;
  return {
    x: Math.sin(phi) * r * 0.94,
    y: s.skirtTopY + (s.skirtBotY - s.skirtTopY) * v + wave,
    z: Math.cos(phi) * r * s.skirtSquashZ + s.skirtBack   // لازق بالجسم
  };
};

/* ============================================================
   ٦) AR-2 — الإسقاط الأمامي (Projection Mapping)
   ------------------------------------------------------------
   الفكرة: صورة القالب اتصوّرت **من قدام**. فبدل ما نلف ملمس مكرر
   حوالين الجسم، بنسقّط الصورة نفسها عليه بنفس اتجاه التصوير:
   كل رأس في الجسم بياخد UV = مكانه (x,y) بالسم مضروب في أفيني
   بيحوّل السنتيمتر لبكسل الصورة. النص الأمامي بياخد الصورة،
   والجناب/الضهر بياخدوا الملمس المكرر — والانتقال بينهم متدرّج
   حسب اتجاه السطح، عشان مايبانش خط قطع.

   ⚠️ الأفيني مبني على **نفس ٣ نقط التثبيت** بتاعة المسار 2D
   (حافة فتحة الوش في الصورة) — يعني فتحة الوش في الصورة بتقع
   بالظبط على شباك الوش في الجسم. أي انحراف هنا = بق متغطي.
   ============================================================ */

// tryon-core عنده أفيني ٣ نقط متختبر — بنعيد استخدامه بدل ما
// نكتب نسخة تانية تفضل تفرق عنه (درس التكرار).
const CORE2D = (typeof require === 'function' && typeof module !== 'undefined')
  ? require('./tryon-core.js')
  : (typeof window !== 'undefined' ? window.TRYON : null);

T3D.PROJ = {
  templeDirY: 0.07,     // ارتفاع نقطة الصدغ على حافة الشباك (وحدة اتجاه)
  flipU: false,         // false = شمال الصورة ↔ يمين الراس (+X) — تصوير قدامي عادي
  frontFull: 0.52,      // سطح مواجه للكاميرا بالقدر ده = صورة ١٠٠٪
  frontNone: 0.06,      // وتحت كده = ملمس مكرر بس
  edge: 0.035,          // تلاشي عند حواف الصورة (نسبة من UV)
  maxDropCm: 46         // أقصى امتداد للانسدال لو الصورة أطول من الجسم
};

/* ---------- ٦أ) نقط التثبيت في فضاء الراس (سم) ---------- */
// المقابل ثلاثي الأبعاد لنقط الصورة: حافة شباك الوش نفسها.
// ⚠️ الاتجاه: +X = يمين **الراس**، واللي بيظهر في صورة قدامية على
//    شمال الصورة — فنقطة الصورة الشمال (l) بتقابل +X.
T3D.faceAnchors3D = function(opts){
  opts = opts || {};
  const s = T3D.SHAPE, w = T3D.FACE_WINDOW;
  const ty = opts.templeDirY != null ? opts.templeDirY : T3D.PROJ.templeDirY;
  const hx = w.maxAbsX * s.hoodR * s.hoodSquashX;      // نصف عرض الفتحة
  return {
    l:  [ hx, ty * s.hoodR + s.hoodLift ],
    r:  [-hx, ty * s.hoodR + s.hoodLift ],
    top:[ 0,  w.maxY * s.hoodR + s.hoodLift ]
  };
};

/* ---------- ٦ب) عكس الأفيني ---------- */
T3D.invertAffine = function(A){
  if(!A) return null;
  const det = A.a * A.e - A.b * A.d;
  if(Math.abs(det) < 1e-12) return null;
  return {
    a:  A.e / det, b: -A.b / det, c: (A.b * A.f - A.e * A.c) / det,
    d: -A.d / det, e:  A.a / det, f: (A.d * A.c - A.a * A.f) / det
  };
};

/* ---------- ٦ج) بنّاء الإسقاط ---------- */
// imgAnchors = نقط الصورة بالبكسل {l,r,top} (نفس اللي في الكتالوج)
// بيرجع { uvAt(xCm,yCm) , cmAt(px,py) } — أو null لو النقط باظت.
T3D.buildProjector = function(imgAnchors, assetW, assetH, opts){
  opts = opts || {};
  if(!imgAnchors || !assetW || !assetH) return null;
  const solve = (opts.affine3 || (CORE2D && CORE2D.affineFrom3));
  if(!solve) return null;
  const flip = opts.flipU != null ? opts.flipU : T3D.PROJ.flipU;
  const h3 = T3D.faceAnchors3D(opts);
  const src = flip ? [h3.r, h3.l, h3.top] : [h3.l, h3.r, h3.top];
  const aff = solve(src, [imgAnchors.l, imgAnchors.r, imgAnchors.top]);
  if(!aff) return null;
  const inv = T3D.invertAffine(aff);
  if(!inv) return null;
  return {
    aff: aff, inv: inv, assetW: assetW, assetH: assetH,
    // سم → UV (v مقلوبة لأن WebGL أصله تحت والصورة أصلها فوق)
    uvAt: function(x, y){
      const px = aff.a * x + aff.b * y + aff.c;
      const py = aff.d * x + aff.e * y + aff.f;
      return { px: px, py: py, u: px / assetW, v: 1 - py / assetH };
    },
    // بكسل → سم (بنحتاجها عشان نفصّل طول الانسدال على الصورة)
    cmAt: function(px, py){
      return { x: inv.a * px + inv.b * py + inv.c,
               y: inv.d * px + inv.e * py + inv.f };
    }
  };
};

/* ---------- ٦د) وزن الإسقاط لكل رأس ---------- */
T3D.smoothstep = function(a, b, t){
  if(b <= a) return t >= b ? 1 : 0;
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

// تلاشي عند حواف الصورة — من غيره الحافة بتتمطط (ClampToEdge)
// وتعمل خط لون واقف على القماش.
T3D.edgeFade = function(t, e){
  if(!(t > 0) || t >= 1) return 0;                 // برّه الصورة خالص
  if(!(e > 0)) return 1;
  return Math.max(0, Math.min(1, Math.min(t, 1 - t) / e));
};

// nz = مركّبة Z للنورمال (بعد التطبيع): 1 = مواجه للكاميرا تمامًا
T3D.projWeight = function(nz, u, v, opts){
  opts = opts || {};
  const P = T3D.PROJ;
  const full = opts.frontFull != null ? opts.frontFull : P.frontFull;
  const none = opts.frontNone != null ? opts.frontNone : P.frontNone;
  const edge = opts.edge != null ? opts.edge : P.edge;
  let w = T3D.smoothstep(none, full, nz);
  if(w <= 0) return 0;                              // الجناب والضهر: ملمس مكرر
  w *= T3D.edgeFade(u, edge) * T3D.edgeFade(v, edge);
  return Math.max(0, Math.min(1, w));
};

// positions/normals = (x,y,z) متتالية. بيرجع UV ووزن لكل رأس.
T3D.projectVertices = function(positions, normals, projector, opts){
  const n = Math.floor(positions.length / 3);
  const uv = new Float32Array(n * 2), w = new Float32Array(n);
  if(!projector) return { uv: uv, w: w };           // مفيش صورة = وزن صفر = AR-1
  for(let i = 0; i < n; i++){
    const p = projector.uvAt(positions[i*3], positions[i*3+1]);
    uv[i*2] = p.u; uv[i*2+1] = p.v;
    let nz = 1;
    if(normals){
      const nx = normals[i*3], ny = normals[i*3+1], nzr = normals[i*3+2];
      const len = Math.sqrt(nx*nx + ny*ny + nzr*nzr) || 1;
      nz = nzr / len;
    }
    w[i] = T3D.projWeight(nz, p.u, p.v, opts);
  }
  return { uv: uv, w: w };
};

/* ---------- ٦هـ) تفصيل الانسدال على مقاس الصورة ---------- */
// الصورة أطول من جسم AR-1 بكتير (القالب بينزل لحد الوسط) — من غير
// التفصيل ده نص الصورة السفلي مبيتشافش والانسدال بيتقطع ع الصدر.

// ملف عرض الصورة: لكل صف عيّنة، أول وآخر بكسل غير شفاف.
T3D.assetProfile = function(rgba, w, h, rows){
  rows = rows || 24;
  const out = [];
  for(let k = 0; k < rows; k++){
    const py = Math.min(h - 1, Math.floor((k + 0.5) * h / rows));
    let xMin = -1, xMax = -1;
    for(let x = 0; x < w; x++){
      if(rgba[(py * w + x) * 4 + 3] >= 128){ if(xMin < 0) xMin = x; xMax = x; }
    }
    if(xMin >= 0)
      out.push({ py: py, xMin: xMin, xMax: xMax,
                 cx: (xMin + xMax) / 2, halfW: (xMax - xMin) / 2 });
  }
  return out;
};

// بيرجع أرقام هندسة الانسدال الجديدة (مش بيغيّر SHAPE بنفسه).
T3D.fitSkirtToAsset = function(projector, profile, opts){
  opts = opts || {};
  const s = T3D.SHAPE;
  const maxDrop = Math.abs(opts.maxDropCm != null ? opts.maxDropCm : T3D.PROJ.maxDropCm);
  if(!projector || !profile || !profile.length) return null;
  const last = profile[profile.length - 1];
  const rawY = projector.cmAt(last.cx, last.py).y;
  // مسقوف من تحت (مش هننزل لحد الركبة) ومن فوق (لازم يفضل انسدال)
  const botY = Math.max(-maxDrop, Math.min(s.skirtTopY - 4, rawY));
  // عرض القاع من الصورة نفسها عند الصف اللي بيقابل الطول المقصوص
  let cut = last, best = Infinity;
  for(let i = 0; i < profile.length; i++){
    const d = Math.abs(projector.cmAt(profile[i].cx, profile[i].py).y - botY);
    if(d < best){ best = d; cut = profile[i]; }
  }
  const a = projector.cmAt(cut.cx, cut.py).x;
  const b = projector.cmAt(cut.cx + cut.halfW, cut.py).x;
  const halfCm = Math.abs(b - a);
  const botR = Math.max(s.skirtTopR + 1, Math.min(30, halfCm / 0.94));
  return { skirtTopY: s.skirtTopY, skirtBotY: botY,
           skirtTopR: s.skirtTopR, skirtBotR: botR };
};

// دمج أرقام هندسة جديدة (المعايرة الحية + التفصيل بيعدّوا من هنا بس)
T3D.setShape = function(patch){
  if(patch) for(const k in patch) if(patch[k] != null) T3D.SHAPE[k] = patch[k];
  return T3D.SHAPE;
};

/* ---------- التصدير (§18) ---------- */
if(typeof module !== 'undefined' && module.exports){ module.exports = T3D; }
if(typeof window !== 'undefined'){ window.TRYON3D_CORE = T3D; }
