/* ============================================================
   🎨 recolor-core.js — إعادة تلوين القالب (الحسابات بس)
   ------------------------------------------------------------
   الفكرة: صورة **واحدة من تصويرك** بطرحة ملبوسة باللفة المعتمدة
   ← ماسك للطرحة من نقطة بتدوس عليها ← إعادة تلوين بكل ألوانك
   مع الحفاظ على الظلال والطيّات والتطريز زي ما هم.

   🔑 القاعدتين:
   ١) الإضاءة (L) بتتحفظ زي ما هي — الطيّة الغامقة تفضل غامقة
      واللمعة تفضل لامعة. اللي بيتغير الـhue/sat بس.
   ٢) التطريز بينجّي نفسه: لونه بعيد عن لون القماش → وزنه في
      الماسك واطي → بيتعاد تلوينه بالكاد.
   ============================================================ */
'use strict';

const RECOLOR = {};

/* ---------- ١) تحويلات اللون ---------- */
RECOLOR.rgbToHsl = function(r, g, b){
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  const l = (max + min) / 2;
  if(max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if(max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if(max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
};

RECOLOR.hslToRgb = function(h, s, l){
  if(s === 0){ const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = ((t % 1) + 1) % 1;
    if(t < 1/6) return p + (q - p) * 6 * t;
    if(t < 1/2) return q;
    if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  return [ Math.round(f(h + 1/3) * 255),
           Math.round(f(h) * 255),
           Math.round(f(h - 1/3) * 255) ];
};

RECOLOR.hexToRgb = function(hex){
  const n = parseInt(String(hex).replace('#',''), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};

/* ---------- ٢) الماسك من نقطة الدوس ---------- */
// المسافة اللونية بتتحسب في hue/sat **من غير** الإضاءة — عشان
// الطيّة الغامقة والفاتحة من نفس القماش ياخدوا نفس الوزن.
// tol (0..1): سماحية — بترجع وزن 0..1 ناعم مش قص حاد.
RECOLOR.chromaDist = function(rgb1, rgb2){
  const [h1, s1] = RECOLOR.rgbToHsl(rgb1[0], rgb1[1], rgb1[2]);
  const [h2, s2] = RECOLOR.rgbToHsl(rgb2[0], rgb2[1], rgb2[2]);
  let dh = Math.abs(h1 - h2);
  if(dh > 0.5) dh = 1 - dh;                       // الدايرة بتلف
  // sat واطي = الـhue مش موثوق — بنوزن بمتوسط الـsat (مش الأصغر:
  // قماش باهت كان بيلغي فرق الـhue مع التطريز والاختبار مسكها)
  const ws = (s1 + s2) / 2;
  return Math.min(1, dh * 2 * ws + Math.abs(s1 - s2) * 0.8);
};

RECOLOR.maskWeight = function(pxRgb, seedRgb, tol){
  const d = RECOLOR.chromaDist(pxRgb, seedRgb);
  if(d >= tol) return 0;
  const w = 1 - d / tol;                          // انحدار ناعم
  return Math.round(w * 1000) / 1000;
};

// pixels = RGBA · بيرجع Float32Array وزن لكل بكسل
RECOLOR.buildMask = function(pixels, seeds, tol){
  const n = pixels.length / 4;
  const mask = new Float32Array(n);
  for(let i = 0; i < n; i++){
    const px = [pixels[i*4], pixels[i*4+1], pixels[i*4+2]];
    if(pixels[i*4+3] < 128) continue;             // شفاف = برا
    let best = 0;
    for(let s = 0; s < seeds.length; s++){
      const w = RECOLOR.maskWeight(px, seeds[s], tol);
      if(w > best) best = w;
    }
    mask[i] = best;
  }
  return mask;
};

/* ---------- ٣) إعادة التلوين ---------- */
// ⭐ اتصلحت على صورة قالب حقيقية: الحفاظ الحرفي على L كان بيخلي
//    قالب فاتح (بيج) مستحيل يطلع منه كحلي — بيطلع "بيبي بلو".
//    الحل: **نقل الإضاءة**: مركز إضاءة القماش بيتنقل لإضاءة اللون
//    الهدف، وتباين الطيّات حواليه بيتحفظ (×0.8).
RECOLOR.recolorPixel = function(rgb, targetHsl, fabricL){
  const [, s0, l0] = RECOLOR.rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const mid = (fabricL == null) ? l0 : fabricL;   // من غير مركز = سلوك قديم
  const l = Math.max(0.04, Math.min(0.96, targetHsl[2] + (l0 - mid) * 0.8));
  const s = targetHsl[1] * (0.55 + 0.45 * Math.min(1, s0 * 2.2));
  return RECOLOR.hslToRgb(targetHsl[0], s, l);
};

// وسيط إضاءة البكسلات الماسكة — مركز القماش
RECOLOR.fabricMedianL = function(pixels, mask){
  const ls = [];
  const n = pixels.length / 4;
  for(let i = 0; i < n; i++){
    if(mask[i] <= 0.3) continue;
    ls.push(RECOLOR.rgbToHsl(pixels[i*4], pixels[i*4+1], pixels[i*4+2])[2]);
  }
  if(!ls.length) return null;
  ls.sort((a, b) => a - b);
  return ls[Math.floor(ls.length / 2)];
};

// بيعدّل pixels في مكانها حسب الماسك (وزن 0 = مفيش لمس)
RECOLOR.applyRecolor = function(pixels, mask, targetHex){
  const t = RECOLOR.hexToRgb(targetHex);
  const targetHsl = RECOLOR.rgbToHsl(t[0], t[1], t[2]);
  const medL = RECOLOR.fabricMedianL(pixels, mask);
  const n = pixels.length / 4;
  for(let i = 0; i < n; i++){
    const w = mask[i];
    if(w <= 0.02) continue;
    const r = pixels[i*4], g = pixels[i*4+1], b = pixels[i*4+2];
    const nc = RECOLOR.recolorPixel([r,g,b], targetHsl, medL);
    pixels[i*4]   = Math.round(r + (nc[0] - r) * w);
    pixels[i*4+1] = Math.round(g + (nc[1] - g) * w);
    pixels[i*4+2] = Math.round(b + (nc[2] - b) * w);
  }
  return pixels;
};


/* ---------- ٤) 🧵 نقل ملمس صورة المنتج إلى القالب (v37) ---------- */
// surface = رقعة القماش المستخرجة من صورة المنتج. بننقل *تفاصيل الإضاءة*
// الصغيرة إلى القالب، لا هندسة الطية الكبيرة؛ لذلك طيات القالب تفضل صحيحة.
RECOLOR.applyProductSurface = function(pixels, mask, w, h, surface, sw, sh, opts){
  opts=opts||{}; const strength=opts.strength==null?.7:opts.strength;
  const sl=[];
  for(let i=0;i<sw*sh;i++){
    if(surface[i*4+3]<64)continue;
    sl.push(RECOLOR.rgbToHsl(surface[i*4],surface[i*4+1],surface[i*4+2])[2]);
  }
  if(!sl.length)return pixels; sl.sort((a,b)=>a-b); const sm=sl[Math.floor(sl.length/2)];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=y*w+x, mw=mask[i]; if(mw<.08 || pixels[i*4+3]<40)continue;
    const sx=x%sw, sy=y%sh, si=(sy*sw+sx)*4;
    const shsl=RECOLOR.rgbToHsl(surface[si],surface[si+1],surface[si+2]);
    const th=RECOLOR.rgbToHsl(pixels[i*4],pixels[i*4+1],pixels[i*4+2]);
    // high-pass luminance تقريبية: فروق صغيرة حوالين وسيط الرقعة
    const detail=Math.max(-.16,Math.min(.16,shsl[2]-sm));
    const nl=Math.max(.02,Math.min(.98,th[2]+detail*strength));
    // نسبة صغيرة من تشبع المنتج تحفظ weave/print الخفيف من غير ما تغيّر اللون الأساسي
    const ns=Math.max(0,Math.min(1,th[1]*(1-.18*strength)+shsl[1]*.18*strength));
    const rgb=RECOLOR.hslToRgb(th[0],ns,nl), a=mw*strength;
    pixels[i*4]=Math.round(pixels[i*4]*(1-a)+rgb[0]*a);
    pixels[i*4+1]=Math.round(pixels[i*4+1]*(1-a)+rgb[1]*a);
    pixels[i*4+2]=Math.round(pixels[i*4+2]*(1-a)+rgb[2]*a);
  }
  return pixels;
};

/* ---------- ٥) 🧵 وضع "سادة" (v24) ---------- */
// المشكلة: قالب واحد مكنّر — أي منتج ساده بياخد لونه ومعاه كنار
// مش بتاعه. الحل: بكسلات الكنار/التطريز (وزنها في الماسك واطي)
// بتتملي بإضاءة القماش المجاور (ملو ناعم بالبلور) — فالكنار
// بيختفي والطيات والضل بيكملوا طبيعي، وبعدها الكل بيتلون كقماش.
// blur = دالة بلور القناة (بتتحقن من برّه — نفس بتاعة المحرك).
RECOLOR.plainify = function(pixels, mask, w, h, blur){
  const n = w * h;
  const L = new Float32Array(n), M = new Float32Array(n);
  for(let i = 0; i < n; i++){
    if(pixels[i*4 + 3] < 40) continue;              // الشفاف برّه اللعبة
    L[i] = RECOLOR.rgbToHsl(pixels[i*4], pixels[i*4+1], pixels[i*4+2])[2];
    M[i] = mask[i] > 0.6 ? 1 : 0;
  }
  // ملو الإضاءة: blur(L×M)/blur(M) — بيمدّد إضاءة القماش على الفجوات
  const r = Math.max(6, Math.round(Math.min(w, h) * 0.03));
  let LM = new Float32Array(n), MM = new Float32Array(n);
  for(let i = 0; i < n; i++){ LM[i] = L[i] * M[i]; MM[i] = M[i]; }
  for(let pass = 0; pass < 2; pass++){ LM = blur(LM, w, h, r); MM = blur(MM, w, h, r); }
  const out = new Float32Array(n);                  // الماسك الجديد: كله قماش
  for(let i = 0; i < n; i++){
    if(pixels[i*4 + 3] < 40){ out[i] = 0; continue; }
    out[i] = 1;
    if(mask[i] > 0.6) continue;                     // قماش أصلي = زي ما هو
    const lf = MM[i] > 0.02 ? LM[i] / MM[i] : 0.5;  // إضاءة القماش المجاور
    const v = Math.round(Math.max(0.04, Math.min(0.96, lf)) * 255);
    pixels[i*4] = v; pixels[i*4+1] = v; pixels[i*4+2] = v;
  }
  return out;
};

/* ---------- التصدير (القاعدة الذهبية §18) ---------- */
if(typeof module !== 'undefined' && module.exports){ module.exports = RECOLOR; }
if(typeof window !== 'undefined'){ window.RECOLOR = RECOLOR; }
