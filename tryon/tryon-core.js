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
           cheekL: px(TRYON.LM.CHEEK_L), cheekR: px(TRYON.LM.CHEEK_R),
           brow: px(TRYON.LM.BROW) };        // v23: للبندانة
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

/* ---------- ١٣) 🌐 هل الكاميرا متاحة أصلًا في المتصفح ده؟ ---------- */
// متصفح جوّه تطبيق (WebView) كتير مبيدّيش `navigator.mediaDevices`
// خالص — والوصول ليها من غير فحص بيرمي TypeError غامض بيوقّع
// الصفحة كلها بشاشة "حصلت مشكلة في التحميل" واللي مالهاش أي معنى
// للعميلة. الفحص بيفرّق بين "المتصفح مش بيدعم" و"النت/الإذن".
TRYON.cameraSupport = function(nav, secure){
  if(secure === false) return { ok:false, reason:'insecure' };   // مش https
  if(!nav || !nav.mediaDevices || typeof nav.mediaDevices.getUserMedia !== 'function')
    return { ok:false, reason:'no-api' };
  return { ok:true, reason:'' };
};

/* ---------- ١٤) 🩺 الرسالة الصح حسب مكان الفشل ---------- */
// stage = المرحلة اللي وقفنا فيها · name = اسم الخطأ.
// canPhoto = الكاميرا هي اللي فشلت بس، ووضع الصورة لسه شغّال —
// ساعتها ممنوع نقفل الصفحة، بنحوّلها لوضع الصورة.
TRYON.failureAdvice = function(stage, name){
  if(name === 'NotAllowedError' || name === 'PermissionDeniedError')
    return { kind:'denied', canPhoto:true,
      text:'محتاجين إذن الكاميرا عشان اللايف يشتغل — اسمحي بيه من إعدادات المتصفح، أو جرّبي على صورة 📷' };
  if(name === 'NoCameraAPI' || name === 'NotFoundError' || name === 'NotReadableError')
    return { kind:'nocam', canPhoto:true,
      text:'المتصفح اللي فاتحة منه مش بيشغّل الكاميرا — افتحي اللينك في متصفح الموبايل، أو كمّلي على صورة من زرار 📷' };
  if(stage === 'model')
    return { kind:'model', canPhoto:false,
      text:'مشكلة في تحميل ملفات التجربة — اتأكدي إن النت شغال وإن مفيش حاجب إعلانات مقفّل الصفحة، وجرّبي تاني 🔄' };
  return { kind:'generic', canPhoto:false,
    text:'حصلت مشكلة في التحميل — جرّبي تاني، ولو اتكررت كلّمينا من التطبيق 💬' };
};

/* ---------- ١٥) 🕳️ حافة فتحة الوش (v20) ---------- */
// اكتشاف من الفحص على الصورة الحقيقية: الفتحة **شفافة أصلًا** —
// الأبيض اللي بيبان حوالين الوش هو خلفية صورة العميلة نفسها، لأن
// الفتحة أوسع من الوش (توسيع 1.28 معمول للطرحة المرسومة، مش لأصل
// نقطه على حافة الفتحة). الحل جزئين: (أ) fit خاص بكل أصل بيضيّق
// الفتحة على الوش (في الكتالوج) · (ب) تدرّج شفاف على حافة الفتحة
// عشان القماش يدوب في الجلد بدل قطع حاد.
// ⚠️ الطريقة الأولانية (flood على الأبيض) كانت **بتاكل القماش
// البيج نفسه** (فرقه عن الأبيض ٢٤ درجة) — اتشالت.

// بلور قناة واحدة (مفصول أفقي/رأسي) — للتدرّج على حافة الفتحة
TRYON.blurChannel = function(src, w, h, r){
  if(!(r > 0)) return src;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  const win = r * 2 + 1;
  for(let y = 0; y < h; y++){
    let sum = 0;
    for(let x = -r; x <= r; x++) sum += src[y*w + Math.max(0, Math.min(w-1, x))];
    for(let x = 0; x < w; x++){
      tmp[y*w + x] = sum / win;
      const xo = Math.max(0, Math.min(w-1, x - r));
      const xi = Math.max(0, Math.min(w-1, x + r + 1));
      sum += src[y*w + xi] - src[y*w + xo];
    }
  }
  for(let x = 0; x < w; x++){
    let sum = 0;
    for(let y = -r; y <= r; y++) sum += tmp[Math.max(0, Math.min(h-1, y))*w + x];
    for(let y = 0; y < h; y++){
      out[y*w + x] = sum / win;
      const yo = Math.max(0, Math.min(h-1, y - r));
      const yi = Math.max(0, Math.min(h-1, y + r + 1));
      sum += tmp[yi*w + x] - tmp[yo*w + x];
    }
  }
  return out;
};

// data = RGBA في مكانه · seed = مركز الفتحة تقريبًا (من نقط التثبيت)
// flood على **الشفاف** (alpha < 40) من البذرة = منطقة الفتحة بس —
// الخلفية الشفافة برّه الطرحة مش متوصلة بيها فمش بتتلمس.
// بعدها بلور للماسك وتخفيض ألفا القماش الملاصق بالتدريج.
// بيرجع {holePx} — صفر لو البذرة مش على شفاف (أصل مقصوص غريب =
// مفيش لمس خالص، أأمن قرار).
TRYON.featherHoleEdge = function(data, w, h, seed, opts){
  opts = opts || {};
  const feather = opts.feather != null ? opts.feather : 7;
  const sx = Math.max(0, Math.min(w - 1, Math.round(seed[0])));
  const sy = Math.max(0, Math.min(h - 1, Math.round(seed[1])));
  if(data[(sy * w + sx) * 4 + 3] >= 40) return { holePx: 0 };

  const mask = new Float32Array(w * h);
  const stack = [sy * w + sx];
  mask[sy * w + sx] = 1;
  let holePx = 0;
  // 🛟 حارس: لو الفتحة "مفتوحة" على الخلفية الخارجية الـflood هيكبر
  //    جدًا — نلغي بدل ما نتدرّج على حواف الطرحة الخارجية كلها
  const cap = Math.floor(w * h * 0.35);
  while(stack.length){
    const p = stack.pop();
    if(++holePx > cap) return { holePx: 0 };
    const x = p % w, y = (p - x) / w;
    const nbs = [];
    if(x > 0) nbs.push(p - 1);
    if(x < w - 1) nbs.push(p + 1);
    if(y > 0) nbs.push(p - w);
    if(y < h - 1) nbs.push(p + w);
    for(let k = 0; k < nbs.length; k++){
      const q = nbs[k];
      if(mask[q]) continue;
      if(data[q * 4 + 3] < 40){ mask[q] = 1; stack.push(q); }
    }
  }

  // v22: استخراج محيط الفتحة (اختياري) — مركزها + نصف القطر عند
  // K زاوية. ده اللي الفتحة العضوية بتتشد منه على محيط الوش.
  let centroid = null, radii = null;
  if(opts.contourK){
    let sx2 = 0, sy2 = 0, cnt = 0;
    for(let p = 0; p < w * h; p++)
      if(mask[p]){ sx2 += p % w; sy2 += Math.floor(p / w); cnt++; }
    centroid = [sx2 / cnt, sy2 / cnt];
    const K = opts.contourK;
    radii = new Float32Array(K);
    const maxR = Math.hypot(w, h);
    for(let k = 0; k < K; k++){
      const th = k / K * 2 * Math.PI;
      const dx = Math.cos(th), dy = Math.sin(th);
      let r = 0;
      for(; r < maxR; r += 1){
        const x = Math.round(centroid[0] + dx * r), y = Math.round(centroid[1] + dy * r);
        if(x < 0 || y < 0 || x >= w || y >= h) break;
        if(!mask[y * w + x]) break;
      }
      radii[k] = r;
    }
  }

  // التدرّج: بلور الماسك مرتين → القماش الملاصق للفتحة ألفته بتنزل
  // بالتدريج ناحية الحافة. 🔴 من غيره حافة الفتحة قطع حاد والوش
  // يبان "ملزوق في شباك" — نفس الشكوى.
  let m = mask;
  for(let pass = 0; pass < 2; pass++) m = TRYON.blurChannel(m, w, h, feather);
  for(let p = 0; p < w * h; p++){
    if(mask[p]) continue;                    // جوه الفتحة أصلًا شفاف
    const cut = Math.min(1, m[p] * 1.3);
    if(cut > 0.01){
      const i = p * 4 + 3;
      data[i] = Math.round(data[i] * (1 - cut));
    }
  }
  return { holePx: holePx, centroid: centroid, radii: radii };
};

/* ---------- ١٦) 🌗 ظل التلامس (v20) ---------- */
// الطرحة الحقيقية بترمي ضل ناعم على الجبهة تحت حافتها — من غيره
// اللفة "عايمة" فوق الوش. بنرسم شريط تدرّج مايل بميل الراس، من
// حافة الطرحة العلوية ونازل، بمزج multiply (ضل مش لون).
TRYON.contactShadowSpec = function(an, ex){
  return {
    x: ex.top[0], y: ex.top[1],           // مركز الشريط عند حافة الطرحة
    w: ex.faceW * 1.30,
    h: ex.faceH * 0.30,
    rot: Math.atan2(an.r[1] - an.l[1], an.r[0] - an.l[0]),
    alpha: 0.16                            // ناعم — ضل مش حرق
  };
};

/* ---------- ١٧) 🌡️ حرارة اللون (v20) ---------- */
// مطابقة السطوع لوحدها مش كفاية: صورة دافية (لمبة تنجستن) والقماش
// جاي من استوديو محايد = القماش يبان "لزقة". بنقيس انحراف لون
// الجلد عن الرمادي (dr = أحمر−إضاءة · db = أزرق−إضاءة) ونلوّن
// القماش بنفس الاتجاه — بس خفيف، القماش مش مراية.
TRYON.tempTintColor = function(dr, db){
  const mag = Math.max(Math.abs(dr || 0), Math.abs(db || 0));
  if(mag < 7) return null;                 // إضاءة محايدة = سيبه زي ما هو
  const k = Math.min(1, (mag - 7) / 30);
  const clip = (v) => Math.round(Math.max(-60, Math.min(60, v * 1.2)));
  return {
    r: 128 + clip(dr), g: 128, b: 128 + clip(db),
    alpha: Math.round((0.05 + 0.08 * k) * 100) / 100   // 0.05 .. 0.13
  };
};

// مفتاح كاش متكمّي — عشان الكانفاس الملوّن ميتبنيش كل فريم على
// رعشة عُشر درجة، بس يتبني لما الإضاءة تتغير فعلًا
TRYON.tempBucket = function(dr, db){
  const q = (v) => Math.round((v || 0) / 6) * 6;
  return q(dr) + '_' + q(db);
};

/* ---------- ١٨) 🫥 محيط الوش الحقيقي (v22) ---------- */
// الفتحة العضوية: بدل ٣ نقط، ٩ معالم على محيط الوش نفسه (جبهة/
// صدغ/خد/فك/دقن ×٢) — الفتحة بتتشد عليهم فبتاخد **شكل وش
// العميلة** مش شكل فتحة المانيكان.
TRYON.FACE_CONTOUR = [103, 127, 132, 172, 152, 397, 361, 356, 332];

TRYON.faceContourFromLandmarks = function(lm, w, h){
  return TRYON.FACE_CONTOUR.map((i) => [ lm[i].x * w, lm[i].y * h ]);
};

// عكس الأفيني — محتاجينه عشان نرجّع من الشاشة لفضاء القالب
TRYON.invertAffine = function(A){
  if(!A) return null;
  const det = A.a * A.e - A.b * A.d;
  if(Math.abs(det) < 1e-12) return null;
  return {
    a:  A.e / det, b: -A.b / det, c: (A.b * A.f - A.e * A.c) / det,
    d: -A.d / det, e:  A.a / det, f: (A.d * A.c - A.a * A.f) / det
  };
};

// نصف قطر الفتحة عند زاوية معيّنة — استيفاء دائري بين العيّنات
TRYON.holeRadiusAt = function(contour, theta){
  const K = contour.radii.length;
  let t = theta % (2 * Math.PI);
  if(t < 0) t += 2 * Math.PI;
  const f = t / (2 * Math.PI) * K;
  const i0 = Math.floor(f) % K, i1 = (i0 + 1) % K, k = f - Math.floor(f);
  return contour.radii[i0] * (1 - k) + contour.radii[i1] * k;
};

/* ---------- ١٩) 🧕 البندانة (v23) ---------- */
// المرجع: لبس الطرحة الحقيقي بيبقى فيه بندانة تحتها بتغطي منابت
// الشعر والجبهة — دي اللي بتخلي الفلاتر الاحترافية واقعية: مفيش
// شعر ولا خلفية باينة بين الوش والقماش. بترسم بالكود على معالم
// الجبهة نفسها — مش محتاجة صورة أصل ولا تصوير.
TRYON.LM.BROW = 9;                    // بين الحاجبين — حافة البندانة بتتحسب منه

TRYON.BANDANA_COLORS = [
  { id: 'none',     name: 'من غير بندانة', hex: null },
  { id: 'black',    name: 'أسود',      hex: '#1c1c1e' },
  { id: 'navy',     name: 'كحلي',      hex: '#1f2a44' },
  { id: 'brown',    name: 'بني',       hex: '#5b4632' },
  { id: 'beige',    name: 'بيج',       hex: '#cbb59a' },
  { id: 'white',    name: 'أبيض',      hex: '#f5f2ec' },
  { id: 'offwhite', name: 'أوف وايت',  hex: '#e9e0cf' }
];

// شكل البندانة: قبة فوق الراس + حافة سفلية قوس على الجبهة بين
// الصدغين. الحافة بتقع بين منابت الشعر (top) وبين الحاجبين (brow)
// — drop = قد إيه نازلة على الجبهة (0 = عند المنابت، 1 = عند الحواجب).
// بيرجع مضلّع نقط جاهز للرسم — كله متبني بمتجهات الوش نفسه
// (up/side) فبيميل مع الراس تلقائي.
TRYON.bandanaSpec = function(an, ex, opts){
  opts = opts || {};
  const drop = opts.drop != null ? opts.drop : 0.42;
  const segs = opts.segs != null ? opts.segs : 14;
  const upX = ex.up[0], upY = ex.up[1];
  const sdX = -upY, sdY = upX;                     // متجه جانبي (عمودي على up)
  const cx = (ex.l[0] + ex.r[0]) / 2, cy = (ex.l[1] + ex.r[1]) / 2;
  // نقطة منتصف الحافة السفلية: بين منابت الشعر وبين الحاجبين
  const bm = [ an.top[0] + (an.brow[0] - an.top[0]) * drop,
               an.top[1] + (an.brow[1] - an.top[1]) * drop ];
  // طرفا الحافة: عند الصدغين الموسّعين، منزّلين شوية (يغطوا السوالف)
  const down = ex.faceH * 0.10;
  const bl = [ ex.l[0] - upX * down, ex.l[1] - upY * down ];
  const br = [ ex.r[0] - upX * down, ex.r[1] - upY * down ];
  // ارتفاع القبة فوق منابت الشعر — تغطي الجمجمة اللي الطرحة هتلفها
  const domeTop = ex.faceH * 0.34;
  const rx = Math.hypot(br[0] - bl[0], br[1] - bl[1]) / 2 * 1.06;

  const poly = [];
  // الحافة السفلية: قوس تربيعي bl → bm → br
  for(let i = 0; i <= segs; i++){
    const t = i / segs, mt = 1 - t;
    poly.push([ mt*mt*bl[0] + 2*mt*t*bm[0] + t*t*br[0],
                mt*mt*bl[1] + 2*mt*t*bm[1] + t*t*br[1] ]);
  }
  // القبة: نص قطع ناقص من br راجع لـ bl فوق الراس
  const topC = [ an.top[0] + upX * domeTop, an.top[1] + upY * domeTop ];
  const ry = Math.hypot(topC[0] - cx, topC[1] - cy);
  for(let i = 1; i < segs; i++){
    const th = i / segs * Math.PI;                  // 0..π: من جنب r للجنب l
    const off = Math.cos(th) * rx, lift = Math.sin(th) * ry;
    poly.push([ cx + sdX * off + upX * lift, cy + sdY * off + upY * lift ]);
  }
  return { poly: poly, bottomMid: bm, top: topC };
};

/* ---------- التصدير (القاعدة الذهبية §18) ---------- */
if(typeof module !== 'undefined' && module.exports){ module.exports = TRYON; }
if(typeof window !== 'undefined'){
  window.TRYON = TRYON;
}
