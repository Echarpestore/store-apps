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
  hoodR: 10.8,        // نصف قطر القشرة حوالين الراس
  hoodSquashX: 0.86,  // الراس أضيق من طولها
  hoodLift: 0.8,      // رفع مركز القشرة فوق مركز الوش
  hoodBack: -0.5,     // وسحبها لورا شوية
  thetaEnd: 2.75,     // القشرة نازلة لتحت الدقن (راديان من فوق)
  skirtTopY: -9.5,    // بداية الانسدال (الرقبة)
  skirtBotY: -30,     // نهايته (الصدر)
  skirtTopR: 8.2,
  skirtBotR: 19.5,
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
    z: Math.cos(phi) * r * 0.80   // الصدر أفلطح من دايرة
  };
};

/* ---------- التصدير (§18) ---------- */
if(typeof module !== 'undefined' && module.exports){ module.exports = T3D; }
if(typeof window !== 'undefined'){ window.TRYON3D_CORE = T3D; }
