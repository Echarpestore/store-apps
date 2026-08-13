/* ============================================================
   🧕 tryon-core.js — محرك التجربة الافتراضية (الحسابات بس)
   ------------------------------------------------------------
   🔑 القاعدة: كل الرياضة هنا، وكل الكاميرا والرسم في tryon-app.js.
      الملف ده بيشتغل في Node زي ما هو → قابل للاختبار بالهارنس.

   ⚠️ مصفوفة MediaPipe جاية **column-major** (عمود ورا عمود).
      قراءتها row-major بتقلب yaw مع pitch — والاختبار بيمسك ده.
   ============================================================ */
'use strict';

const TRYON = {};

/* ---------- ١) وضع الراس من مصفوفة التحويل ---------- */
// data = Float32Array(16) column-major من facialTransformationMatrixes
// بيرجع درجات: yaw (يمين/شمال) · pitch (فوق/تحت) · roll (ميل)
TRYON.poseFromMatrix = function(data){
  if(!data || data.length < 16) return { yaw:0, pitch:0, roll:0 };
  const R = (r,c) => data[c*4 + r];               // column-major
  const clamp1 = (v) => Math.max(-1, Math.min(1, v));
  const deg = (v) => v * 180 / Math.PI;
  return {
    yaw:   deg(Math.atan2(R(0,2), R(2,2))),
    pitch: deg(-Math.asin(clamp1(R(1,2)))),
    roll:  deg(Math.atan2(R(1,0), R(1,1)))
  };
};

/* ---------- ٢) تحويل أفيني من ٣ نقط لـ٣ نقط ---------- */
// src/dst = [[x,y],[x,y],[x,y]] → {a,b,c,d,e,f} بحيث:
//   u = a*x + b*y + c  ·  v = d*x + e*y + f
// دي اللي بتلبّس صورة الطرحة على الوش مهما اتحرّك أو مال.
TRYON.affineFrom3 = function(src, dst){
  const [p1,p2,p3] = src, [q1,q2,q3] = dst;
  const det = p1[0]*(p2[1]-p3[1]) - p1[1]*(p2[0]-p3[0])
            + (p2[0]*p3[1] - p3[0]*p2[1]);
  if(Math.abs(det) < 1e-9) return null;           // نقط على خط واحد = مفيش حل
  const solve = (r1,r2,r3) => {
    const A = (r1*(p2[1]-p3[1]) - p1[1]*(r2-r3) + (r2*p3[1]-r3*p2[1])) / det;
    const B = (p1[0]*(r2-r3) - r1*(p2[0]-p3[0]) + (p2[0]*r3-p3[0]*r2)) / det;
    const C = (p1[0]*(p2[1]*r3-p3[1]*r2) - p1[1]*(p2[0]*r3-p3[0]*r2)
            + r1*(p2[0]*p3[1]-p3[0]*p2[1])) / det;
    return [A,B,C];
  };
  const [a,b,c] = solve(q1[0], q2[0], q3[0]);
  const [d,e,f] = solve(q1[1], q2[1], q3[1]);
  return { a,b,c,d,e,f };
};

TRYON.applyAffine = function(T, p){
  return [ T.a*p[0] + T.b*p[1] + T.c,
           T.d*p[0] + T.e*p[1] + T.f ];
};

/* ---------- ٣) التنعيم — عشان الطرحة متترعشش ---------- */
// أساسه exponential smoothing بمعامل متكيّف: حركة سريعة = تتبّع
// سريع (مفيش تهنيج)، وثبات = تنعيم قوي (مفيش رعشة).
TRYON.Smoother = function(opts){
  opts = opts || {};
  const minA = opts.minAlpha != null ? opts.minAlpha : 0.15;
  const maxA = opts.maxAlpha != null ? opts.maxAlpha : 0.85;
  const speed = opts.speed != null ? opts.speed : 0.05;
  let v = null;
  return {
    push(x){
      if(v == null){ v = x; return v; }
      const a = Math.min(maxA, minA + Math.abs(x - v) * speed);
      v = v + (x - v) * a;
      return v;
    },
    value(){ return v; },
    reset(){ v = null; }
  };
};

TRYON.Smoother2D = function(opts){
  const sx = TRYON.Smoother(opts), sy = TRYON.Smoother(opts);
  return {
    push(p){ return [sx.push(p[0]), sy.push(p[1])]; },
    reset(){ sx.reset(); sy.reset(); }
  };
};

/* ---------- ٤) نقط التثبيت من معالم الوش ---------- */
// أرقام معالم FaceMesh (468 نقطة):
TRYON.LM = { TOP:10, CHIN:152, L:127, R:356, CHEEK_L:50, CHEEK_R:280 };

// lm = مصفوفة معالم منسّبة (0..1) · w,h = مقاس الفيديو بالبكسل
TRYON.anchorsFromLandmarks = function(lm, w, h){
  const px = (i) => [ lm[i].x * w, lm[i].y * h ];
  return { top: px(TRYON.LM.TOP), chin: px(TRYON.LM.CHIN),
           l: px(TRYON.LM.L), r: px(TRYON.LM.R),
           cheekL: px(TRYON.LM.CHEEK_L), cheekR: px(TRYON.LM.CHEEK_R) };
};

/* ---------- ٥) توسيع النقط عشان الطرحة تغطي الشعر ---------- */
// معالم الوش على حدود **الوش** — والطرحة لازم تلبس أوسع وأعلى منه.
// widen = توسيع جانبي (١.٠ = زي ما هو) · lift = رفع لفوق كنسبة من طول الوش
TRYON.expandAnchors = function(an, opts){
  opts = opts || {};
  const widen = opts.widen != null ? opts.widen : 1.28;
  const lift = opts.lift != null ? opts.lift : 0.10;
  const liftTop = opts.liftTop != null ? opts.liftTop : 0.18;

  const cx = (an.l[0] + an.r[0]) / 2, cy = (an.l[1] + an.r[1]) / 2;
  // اتجاه "فوق" من الدقن للجبهة — بيلف مع ميل الراس تلقائي
  let ux = an.top[0] - an.chin[0], uy = an.top[1] - an.chin[1];
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul; uy /= ul;
  const faceH = ul;

  const out = (p) => [ cx + (p[0]-cx)*widen + ux*lift*faceH,
                       cy + (p[1]-cy)*widen + uy*lift*faceH ];
  return {
    l: out(an.l), r: out(an.r),
    top: [ an.top[0] + ux*liftTop*faceH, an.top[1] + uy*liftTop*faceH ],
    faceW: Math.hypot(an.r[0]-an.l[0], an.r[1]-an.l[1]),
    faceH: faceH, up: [ux, uy]
  };
};

/* ---------- ٦) مكان طبقة الانسدال (تحت الدقن) ---------- */
// الانسدال على الصدر بيترسم مستطيل مدوّر مايل بميل الراس.
TRYON.drapePlacement = function(an, ex){
  const down = 0.30 * ex.faceH;
  return {
    x: an.chin[0] - ex.up[0]*down,
    y: an.chin[1] - ex.up[1]*down,        // "تحت" = عكس اتجاه up
    w: ex.faceW * 1.9,
    h: ex.faceH * 1.35,
    rot: Math.atan2(an.r[1]-an.l[1], an.r[0]-an.l[0])
  };
};

/* ---------- ٧) بوابة الجودة — امتى نقول "بصي قدام" ---------- */
TRYON.fitQuality = function(pose){
  if(Math.abs(pose.yaw) > 28)
    return { ok:false, hint:'بصي قدام شوية 👀', fade: Math.abs(pose.yaw) > 45 };
  if(pose.pitch > 22)
    return { ok:false, hint:'نزّلي راسك شوية', fade: pose.pitch > 40 };
  if(pose.pitch < -25)
    return { ok:false, hint:'ارفعي راسك شوية', fade: pose.pitch < -45 };
  return { ok:true, hint:'', fade:false };
};

/* ---------- ٨) مطابقة الإضاءة ---------- */
// متوسط إضاءة الخدود (0..255) → معامل brightness للطرحة عشان
// متبانش لزقة جاية من صورة تانية.
TRYON.lumaToBrightness = function(luma){
  if(!(luma >= 0)) return 1;
  const v = 0.6 + (luma / 255) * 0.7;              // 0.6 .. 1.3
  return Math.max(0.75, Math.min(1.15, v));
};

/* ---------- ٩) مقاس رسم متكيّف — الأجهزة الضعيفة ---------- */
// بيقيس زمن الفريم وبيقرر نعالج كل فريم ولا فريم وفريم.
TRYON.FrameGovernor = function(){
  let ema = 16, skip = false, tick = 0;
  return {
    report(ms){ ema = ema + (ms - ema) * 0.1; skip = ema > 45; },
    shouldProcess(){ tick++; return !skip || (tick % 2 === 0); },
    avg(){ return ema; }
  };
};

/* ---------- ١٠) الديب لينك — ?scarf=..&color=.. من الشات ---------- */
// getParam = دالة بترجع قيمة باراميتر (URLSearchParams.get في المتصفح)
// بيرجع دايمًا اختيار صالح: مش لاقي = أول عنصر، مش رسالة خطأ للعميلة.
TRYON.pickByQuery = function(catalog, colors, getParam){
  const sid = String((getParam && getParam('scarf')) || '').toLowerCase().trim();
  const cid = String((getParam && getParam('color')) || '').toLowerCase().trim();
  const scarf = catalog.find((s) => s.id.toLowerCase() === sid) || catalog[0];
  const color = colors.find((c) => c.id.toLowerCase() === cid) || colors[0];
  return { scarf, color,
           matchedScarf: !!sid && scarf.id.toLowerCase() === sid,
           matchedColor: !!cid && color.id.toLowerCase() === cid };
};

/* ---------- ١١) لون الطرحة من صورة المنتج — نفس الخطوة ---------- */
// pixels = RGBA (من canvas مصغّر 64×64).
// ⭐ اتصلحت على صورة منتج **حقيقية** من المالك، وطلّعت باجين:
//   ١) الخلفية الاستوديو مش أبيض نقي (كريمي ~236) — شرط >235 كان
//      بيسيبها تعدي وتكسب كأنها "اللون". الرفض بقى: فاتح + باهت.
//   ٢) القماش الحقيقي مليان درجات (نسيج/إضاءة) — الباكت الواحد
//      بيتفتت والغالب بيطلع غلط. الحل: **الوسيط** لكل قناة —
//      متين ضد الحواف المشغولة والديكور في الصورة.
// confidence = نسبة بكسلات المنتج. واطي = الصورة كلها خلفية.
TRYON.dominantColor = function(pixels){
  const rs = [], gs = [], bs = [];
  let total = 0;
  for(let i = 0; i < pixels.length; i += 4){
    total++;
    const r = pixels[i], g = pixels[i+1], b = pixels[i+2], a = pixels[i+3];
    if(a < 128) continue;                                   // شفاف
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if(mx > 200 && (mx - mn) < 18) continue;                // خلفية فاتحة باهتة
    rs.push(r); gs.push(g); bs.push(b);
  }
  if(!total || !rs.length) return { hex:null, confidence:0 };
  const med = (arr) => {
    arr.sort((x, y) => x - y);
    return arr[Math.floor(arr.length / 2)];
  };
  const h = (v) => v.toString(16).padStart(2, '0');
  return {
    hex: '#' + h(med(rs)) + h(med(gs)) + h(med(bs)),
    confidence: Math.round((rs.length / total) * 100) / 100
  };
};

/* ---------- ١٢) مصدر صورة المنتج — تسليم مباشر ولا لينك ---------- */
// الشات (نفس الدومين) بيسلّم الصورة مباشرة في sessionStorage —
// صفر CORS وصفر رفع إضافي. اللينك (?img=) فولباك للحالات التانية.
// getParam = قراءة باراميتر · getStore = قراءة من المخزن
TRYON.imageSourceFromQuery = function(getParam, getStore){
  if(getParam && getParam('imgkey')){
    const data = getStore && getStore('echarpe_tryon_img');
    if(data) return { kind:'handoff', value:data };
    // المفتاح موجود والصورة لأ (تاب جديد/انتهت الجلسة) → نكمل عادي
  }
  const url = getParam && getParam('img');
  if(url) return { kind:'url', value:url };
  return { kind:'none', value:null };
};

/* ---------- التصدير (القاعدة الذهبية §18) ---------- */
if(typeof module !== 'undefined' && module.exports){ module.exports = TRYON; }
if(typeof window !== 'undefined'){
  window.TRYON = TRYON;
}
