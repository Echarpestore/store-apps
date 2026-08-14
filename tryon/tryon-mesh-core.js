/* ============================================================
   🧵 tryon-mesh-core.js — فيزياء الشبكة القماشية (بدون رندر)
   ------------------------------------------------------------
   الفكرة: صورة القالب بتتقطع شبكة نقط. صفوف الراس "صلبة" (بتتبع
   الوش مباشرة — ثبات على الوش أهم من أي حركة)، وصفوف الانسدال
   Verlet: قصور ذاتي + شدّ نحو مكانها الطبيعي + قيد مسافات —
   فالقماش بيتمايل ورا الحركة ويهدى، زي القماش.
   ============================================================ */
'use strict';

const TM = {};

/* ---------- ١) بناء الشبكة ---------- */
// cols×rows نقطة على مساحة الأصل (بيكسل الأصل). بيرجع نقط uv
// + علامة صلب/قماشي لكل صف حسب خط الدقن في الأصل.
TM.buildGrid = function(assetW, assetH, cols, rows, chinY){
  const pts = [];
  for(let r = 0; r <= rows; r++){
    const ay = assetH * r / rows;
    for(let c = 0; c <= cols; c++){
      pts.push({
        ax: assetW * c / cols, ay: ay,
        u: c / cols, v: r / rows,
        rigid: ay <= chinY,
        // حرية الحركة بتزيد بالنزول تحت الدقن (0 = صلب تمامًا)
        free: ay <= chinY ? 0 :
              Math.min(1, (ay - chinY) / (assetH - chinY) * 1.6)
      });
    }
  }
  return { pts, cols, rows };
};

/* ---------- ٢) خطوة الفيزياء ---------- */
// state: {x,y,px,py} لكل نقطة · targets: مكان كل نقطة لو القماش
// جامد (من الأفيني). بيرجع نفس state متعدّل في مكانه.
// dtScale ~1 عند 60fps — بيتقاس من زمن الفريم الحقيقي.
TM.step = function(state, targets, grid, dtScale){
  const d = Math.max(0.4, Math.min(2, dtScale || 1));
  const DAMP = Math.pow(0.90, d);
  const n = grid.pts.length;
  for(let i = 0; i < n; i++){
    const g = grid.pts[i], s = state[i], t = targets[i];
    if(g.free <= 0){                       // صلب: على الوش بالظبط
      s.px = s.x; s.py = s.y;
      s.x = t.x; s.y = t.y;
      continue;
    }
    // قصور ذاتي + شدّ نحو الهدف (الشدّ بيضعف بالنزول = تمايل أكتر)
    const k = (0.34 - 0.26 * g.free) * d;
    const vx = (s.x - s.px) * DAMP, vy = (s.y - s.py) * DAMP;
    s.px = s.x; s.py = s.y;
    s.x += vx + (t.x - s.x) * k;
    s.y += vy + (t.y - s.y) * k;
  }
  // قيد المسافات رأسيًا: القماش مش بيتمطط — كل نقطة مربوطة باللي فوقها
  const C = grid.cols + 1;
  for(let pass = 0; pass < 2; pass++){
    for(let i = C; i < n; i++){
      const g = grid.pts[i];
      if(g.free <= 0) continue;
      const s = state[i], up = state[i - C];
      const tRest = targets[i], tUp = targets[i - C];
      const rest = Math.hypot(tRest.x - tUp.x, tRest.y - tUp.y) || 1;
      const dx = s.x - up.x, dy = s.y - up.y;
      const len = Math.hypot(dx, dy) || 1;
      const lim = Math.max(rest * 0.92, Math.min(rest * 1.12, len));
      if(lim !== len){
        const f = lim / len;
        s.x = up.x + dx * f;
        s.y = up.y + dy * f;
      }
    }
  }
  return state;
};

TM.initState = function(targets){
  return targets.map((t) => ({ x: t.x, y: t.y, px: t.x, py: t.y }));
};

/* ---------- ٣) لفّة الراس — الالتفاف والتلاشي ---------- */
// yaw بالدرجات. الجانب البعيد بيتضغط أفقيًا نحو مركز الوش (بيدي
// إحساس إن القماش بيلف ورا الراس) وبيرجع alpha للجانب ده يتلاشى
// في اللفّات الجامدة بدل ما يقف مسطح.
TM.yawWarp = function(targets, grid, yawDeg, cx){
  const y = Math.max(-60, Math.min(60, yawDeg)) / 60;   // -1..1
  const wrap = Math.abs(y) * 0.34;
  const n = grid.pts.length;
  const alphas = new Array(n).fill(1);
  if(Math.abs(yawDeg) < 6) return alphas;
  for(let i = 0; i < n; i++){
    const g = grid.pts[i], t = targets[i];
    // side: -1 شمال الأصل .. +1 يمينه — الجانب البعيد عكس اتجاه اللفة
    const side = g.u * 2 - 1;
    const far = Math.max(0, side * (y > 0 ? -1 : 1));   // 0..1 بُعد
    t.x = cx + (t.x - cx) * (1 - wrap * far);
    if(Math.abs(yawDeg) > 34)
      alphas[i] = Math.max(0, 1 - (Math.abs(yawDeg) - 34) / 22 * far * 1.5);
  }
  return alphas;
};

/* ---------- ٤) هل الشبكة هادية؟ (توفير معالجة) ---------- */
TM.isSettled = function(state){
  for(let i = 0; i < state.length; i++){
    const s = state[i];
    if(Math.abs(s.x - s.px) > 0.08 || Math.abs(s.y - s.py) > 0.08) return false;
  }
  return true;
};

/* ---------- ٥) 🫥 شد الفتحة على محيط الوش (v22) ---------- */
// pairs = [{ from:{x,y}, to:{x,y} }] بإحداثيات الشاشة: from = نقطة
// حافة الفتحة (بعد الأفيني) · to = المعلم المقابل على محيط الوش.
// كل رأس بياخد إزاحة موزونة بقربه من نقط الشد (تلاشي على radius) —
// فحافة الفتحة بتقع على الوش بالظبط، والقماش البعيد ولا هو حاسس.
TM.contourWarp = function(targets, grid, pairs, radius){
  if(!pairs || !pairs.length || !(radius > 0)) return targets;
  const n = targets.length, m = pairs.length;
  for(let i = 0; i < n; i++){
    const t = targets[i];
    let wx = 0, wy = 0, ws = 0;
    for(let j = 0; j < m; j++){
      const p = pairs[j];
      const d = Math.hypot(t.x - p.from.x, t.y - p.from.y);
      const f = Math.max(0, 1 - d / radius);
      if(f <= 0) continue;
      const w2 = f * f;
      wx += (p.to.x - p.from.x) * w2;
      wy += (p.to.y - p.from.y) * w2;
      ws += w2;
    }
    if(ws > 0){
      // مزيج: قرب الحافة (ws كبير) = شد كامل · بعيد = تلاشي
      const k = Math.min(1, ws);
      t.x += wx / ws * k;
      t.y += wy / ws * k;
    }
  }
  return targets;
};

/* ---------- التصدير (§18) ---------- */
if(typeof module !== 'undefined' && module.exports){ module.exports = TM; }
if(typeof window !== 'undefined'){ window.TRYON_MESH_CORE = TM; }
