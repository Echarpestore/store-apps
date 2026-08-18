/* ============================================================
   🧰 prep-core.js — تجهيز أصول الطرح المصوّرة (الحسابات بس)
   ------------------------------------------------------------
   الهدف: المالك يصوّر الطرحة على المانيكان → الأداة تشيل خلفية
   الاستوديو وتقص وتطلّع نقط التثبيت وسطر الكتالوج جاهز — من غير
   ما كل أصل جديد يستنى جلسة تطوير.

   كل الرياضة هنا (بتشتغل في Node = قابلة للاختبار بالهارنس)،
   وكل الرسم واللمس في prep.html.

   ⚠️ درس v20 محفور هنا: القماش البيج فرقه عن الأبيض ~٢٤ درجة —
   فإزالة الخلفية لازم تكون flood **متواصل من الحواف** بمقارنة
   بلون الخلفية المعيّن نفسه، مش "أي بكسل فاتح" (ده بياكل القماش).
   ============================================================ */
'use strict';

const PREP = {};

// نفس أفيني/بلور المحرك — مش نسخة تانية تفضل تفرق عنه
const CORE = (typeof require === 'function' && typeof module !== 'undefined')
  ? require('./tryon-core.js')
  : (typeof window !== 'undefined' ? window.TRYON : null);

/* ---------- ١) لون الخلفية من أركان الصورة ---------- */
// الاستوديو خلفيته موحّدة — أركان الصورة الأربعة عيّنة مضمونة.
// الوسيط لكل قناة (نفس درس dominantColor: متين ضد الشوائب).
PREP.cornerBg = function(data, w, h, patch){
  patch = patch || 8;
  const rs = [], gs = [], bs = [];
  const grab = (x0, y0) => {
    for(let y = y0; y < y0 + patch && y < h; y++)
      for(let x = x0; x < x0 + patch && x < w; x++){
        const i = (y * w + x) * 4;
        if(data[i + 3] < 200) continue;
        rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
      }
  };
  grab(0, 0); grab(w - patch, 0); grab(0, h - patch); grab(w - patch, h - patch);
  if(!rs.length) return null;
  const med = (a) => { a.sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  return { r: med(rs), g: med(gs), b: med(bs) };
};

/* ---------- ٢) إزالة الخلفية — flood من الحواف ---------- */
// tol = أقصى فرق قناة عن لون الخلفية. flood بيبدأ من كل بكسلات
// الإطار الخارجي — فمنطقة بنفس اللون **جوه** الطرحة (فتحة الوش لو
// المانيكان أبيض) مش بتتلمس هنا (ليها زرار مخصوص في الأداة).
PREP.removeStudioBg = function(data, w, h, opts){
  opts = opts || {};
  const tol = opts.tol != null ? opts.tol : 34;
  const feather = opts.feather != null ? opts.feather : 4;
  const bg = opts.bg || PREP.cornerBg(data, w, h);
  if(!bg) return { removed: 0, bg: null };
  const near = (i) => Math.abs(data[i] - bg.r) <= tol
                   && Math.abs(data[i + 1] - bg.g) <= tol
                   && Math.abs(data[i + 2] - bg.b) <= tol;
  const mask = new Float32Array(w * h);
  const stack = [];
  const push = (p) => { if(!mask[p] && near(p * 4)){ mask[p] = 1; stack.push(p); } };
  for(let x = 0; x < w; x++){ push(x); push((h - 1) * w + x); }
  for(let y = 0; y < h; y++){ push(y * w); push(y * w + w - 1); }
  let removed = 0;
  while(stack.length){
    const p = stack.pop(); removed++;
    const x = p % w, y = (p - x) / w;
    if(x > 0) push(p - 1);
    if(x < w - 1) push(p + 1);
    if(y > 0) push(p - w);
    if(y < h - 1) push(p + w);
  }
  if(!removed) return { removed: 0, bg: bg };
  // تدرّج على الحافة — نفس فلسفة فتحة الوش: القص الحاد بيبان لزقة
  let m = mask;
  if(CORE && CORE.blurChannel)
    for(let pass = 0; pass < 2; pass++) m = CORE.blurChannel(m, w, h, feather);
  for(let p = 0; p < w * h; p++){
    const cut = Math.min(1, m[p] * 1.25);
    if(cut > 0.01) data[p * 4 + 3] = Math.round(data[p * 4 + 3] * (1 - cut));
  }
  return { removed: removed, bg: bg };
};

/* ---------- ٣) فتحة الوش — flood من نقرة المالك ---------- */
// المانيكان جوه الفتحة بنفس لون الخلفية غالبًا لكن **مش متوصّل**
// بالحواف — فالمالك بينقر جوه الفتحة والأداة بتفرّغها بنفس منطق
// المقارنة. بيرجع صفر لو النقرة على قماش (فرقه عن الخلفية أكبر
// من tol) — أأمن قرار.
PREP.clearHoleAt = function(data, w, h, seed, opts){
  opts = opts || {};
  const tol = opts.tol != null ? opts.tol : 34;
  const feather = opts.feather != null ? opts.feather : 5;
  const sx = Math.max(0, Math.min(w - 1, Math.round(seed[0])));
  const sy = Math.max(0, Math.min(h - 1, Math.round(seed[1])));
  const bg = opts.bg || { r: data[(sy*w+sx)*4], g: data[(sy*w+sx)*4+1], b: data[(sy*w+sx)*4+2] };
  const near = (i) => data[i + 3] >= 40
                   && Math.abs(data[i] - bg.r) <= tol
                   && Math.abs(data[i + 1] - bg.g) <= tol
                   && Math.abs(data[i + 2] - bg.b) <= tol;
  const start = sy * w + sx;
  if(!near(start * 4)) return { holePx: 0 };
  const mask = new Float32Array(w * h);
  const stack = [start]; mask[start] = 1;
  let holePx = 0;
  const cap = Math.floor(w * h * 0.35);      // 🛟 نفس حارس v20
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
      if(!mask[q] && near(q * 4)){ mask[q] = 1; stack.push(q); }
    }
  }
  let m = mask;
  if(CORE && CORE.blurChannel)
    for(let pass = 0; pass < 2; pass++) m = CORE.blurChannel(m, w, h, feather);
  for(let p = 0; p < w * h; p++){
    const i = p * 4 + 3;
    if(mask[p]){ data[i] = 0; continue; }    // جوه الفتحة = شفاف بالكامل
    const cut = Math.min(1, m[p] * 1.25);    // والتدرّج على القماش الملاصق بس
    if(cut > 0.01) data[i] = Math.round(data[i] * (1 - cut));
  }
  return { holePx: holePx };
};

/* ---------- ٤) القص التلقائي على حدود الطرحة ---------- */
PREP.autoCrop = function(data, w, h, pad){
  pad = pad != null ? pad : 10;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for(let y = 0; y < h; y++)
    for(let x = 0; x < w; x++)
      if(data[(y * w + x) * 4 + 3] > 8){
        if(x < x0) x0 = x; if(x > x1) x1 = x;
        if(y < y0) y0 = y; if(y > y1) y1 = y;
      }
  if(x1 < 0) return null;                    // صورة شفافة بالكامل
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};

/* ---------- ٥) فحص نقط التثبيت ---------- */
// النقط بإحداثيات الصورة: l = صدغ يمين **الصورة**... لأ — بنفس
// اصطلاح الكتالوج: l أصغر x (شمال الصورة) وr أكبر x وtop فوقهم.
PREP.validateAnchors = function(an, w, h){
  if(!an || !an.l || !an.r || !an.top)
    return { ok: false, msg: 'النقط التلاتة لسه ماتحددوش' };
  const inb = (p) => p[0] >= 0 && p[0] < w && p[1] >= 0 && p[1] < h;
  if(!inb(an.l) || !inb(an.r) || !inb(an.top))
    return { ok: false, msg: 'فيه نقطة برّه الصورة' };
  if(an.l[0] >= an.r[0])
    return { ok: false, msg: 'الصدغ الشمال لازم يكون شمال اليمين — اتلغبطوا؟' };
  if(an.r[0] - an.l[0] < w * 0.12)
    return { ok: false, msg: 'المسافة بين الصدغين صغيرة أوي — النقط مش على الفتحة؟' };
  if(an.top[1] >= Math.min(an.l[1], an.r[1]))
    return { ok: false, msg: 'نقطة الجبهة لازم تكون فوق الصدغين' };
  if(an.top[0] <= an.l[0] || an.top[0] >= an.r[0])
    return { ok: false, msg: 'نقطة الجبهة لازم تكون بين الصدغين' };
  return { ok: true, msg: '' };
};

/* ---------- ٦) معرّف الأصل ---------- */
PREP.slugId = function(s){
  const t = String(s || '').toLowerCase().trim()
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return t || 'scarf-' + Date.now().toString(36).slice(-4);
};

/* ---------- ٧) سطر الكتالوج الجاهز ---------- */
// fit الافتراضي بتاع القالب المتظبط (v20) — النقط على حافة الفتحة.
// seeds = عيّنات القماش لإعادة التلوين (نقرتين: فاتح + ضل) أو null.
// 🛒 v42: opts = { barcode, brand, kind } — الباركود هو اللي بيخلّي
//    "ضيفيها للسلة" تشتغل. من غيره الأصل بيتعرض بس من غير شراء.
PREP.catalogSnippet = function(id, name, anchors, seeds, fit, opts){
  const f = fit || { widen: 1.08, lift: 0.05, liftTop: 0.14 };
  const o = opts || {};
  const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const pt = (p) => '[' + Math.round(p[0]) + ', ' + Math.round(p[1]) + ']';
  let out = "{\n"
    + "    id: '" + esc(PREP.slugId(id)) + "',\n"
    + "    name: '" + esc(name || 'طرحة جديدة') + "',\n";
  // الباركود قبل النوع — أهم حقل، يبان أول حاجة لما تراجع السطر
  if(o.barcode) out += "    barcode: '" + esc(String(o.barcode).trim()) + "',\n";
  if(o.brand)   out += "    brand: '" + esc(String(o.brand).trim()) + "',\n";
  if(o.kind === 'bandana') out += "    kind: 'bandana',\n";
  out += "    type: 'photo',\n"
    + "    head: { url: 'assets/" + esc(PREP.slugId(id)) + "-head.png',\n"
    + "            anchors: { l: " + pt(anchors.l) + ", r: " + pt(anchors.r)
    + ", top: " + pt(anchors.top) + " } },\n"
    + "    fit: { widen: " + f.widen + ", lift: " + f.lift
    + ", liftTop: " + f.liftTop + " }";
  if(seeds && seeds.length)
    out += ",\n    recolor: { seeds: ["
        + seeds.map((s) => '[' + s.map((v) => Math.round(v)).join(', ') + ']').join(', ')
        + "], tol: 0.35 }";
  out += "\n  }";
  return out;
};

/* ---------- ٨) تحويل نقرة الشاشة لإحداثي صورة ---------- */
// الكانفاس معروض بمقاس CSS مختلف عن مقاس الصورة الحقيقي.
PREP.tapToImage = function(clientX, clientY, rect, imgW, imgH){
  const x = (clientX - rect.left) / rect.width * imgW;
  const y = (clientY - rect.top) / rect.height * imgH;
  return [ Math.max(0, Math.min(imgW - 1, Math.round(x))),
           Math.max(0, Math.min(imgH - 1, Math.round(y))) ];
};

/* ---------- التصدير (§18) ---------- */
if(typeof module !== 'undefined' && module.exports){ module.exports = PREP; }
if(typeof window !== 'undefined'){ window.TRYON_PREP = PREP; }
