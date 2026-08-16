/* ============================================================
   🧕 tryon-app.js — الكاميرا والرسم والواجهة
   ------------------------------------------------------------
   الرياضة كلها في tryon-core.js. هنا: MediaPipe + canvas + UI.

   🔒 الخصوصية: **كل المعالجة على الجهاز.** مفيش فريم واحد بيترفع
      لأي سيرفر. الحاجة الوحيدة اللي بتتحمّل من النت هي موديل
      MediaPipe نفسه (تنزيل، مش رفع).

   ⚠️ قاعدة pos/chat.js نفسها: لو التجربة وقعت، الصفحة بتقول
      رسالة مؤدبة — مش شاشة بيضا.
   ============================================================ */
'use strict';
(function(){

  const TRYON_VER = 'v39';
  console.log('echarpe tryon', TRYON_VER);

  const $ = (id) => document.getElementById(id);
  const T = window.TRYON;

  /* 🧪 v30: مفاتيح الطبقات — تشخيص من غير تخمين.
     من الكونسول:  TRYON_OFF.shadow = true
     أو من الرابط: ?off=shadow,hair,bandana,drape,scarf
     أي طبقة بتتشال لوحدها فنعرف مين اللي رسم إيه في ثانية. */
  const TRYON_OFF = window.TRYON_OFF = window.TRYON_OFF || {};
  try{
    (new URLSearchParams(location.search).get('off') || '')
      .split(',').filter(Boolean).forEach((k) => { TRYON_OFF[k.trim()] = true; });
  }catch(e){}
  // 🧪 v32: `all` بيطفّي كل طبقات الرسم — الصورة/الفيديو بس.
  //    لو حاجة فضلت ظاهرة بعد `?off=all` يبقى **مش من كانفاس
  //    الرسم أصلًا** — يبقى من كانفاس الشبكة (WebGL) اللي فوقه،
  //    وده بيقسم مساحة البحث نص في ثانية بدل تخمين تاني.
  const layerOn = (k) => !(TRYON_OFF[k] || TRYON_OFF.all);

  /* 🩺 v31: شريحة النسخة — بتتكتب **فورًا**، قبل أي تحميل أو كاميرا.
     السبب: تلات إصلاحات ورا بعض والمالك بيقول "زي ما هي" — لازم
     نحسم الأول إن الملف الجديد واصل للجهاز أصلًا (سيرفس ووركر/كاش).
     لو الشريحة بتقول نسخة قديمة، المشكلة في الرفع مش في الكود. */
  function chip(extra){
    const el = document.getElementById('verChip');
    if(el) el.textContent = TRYON_VER + (extra ? ' · ' + extra : '');
  }
  chip();

  // ---------- الحالة ----------
  const S = {
    landmarker: null,
    running: false,
    mode: 'live',                 // live | photo
    video: null, canvas: null, ctx: null,
    stillImg: null, stillResult: null,
    scarf: null, color: null,
    smTop: T.Smoother2D(), smL: T.Smoother2D(), smR: T.Smoother2D(),
    smChin: T.Smoother2D(), smYaw: T.Smoother(), smBright: T.Smoother({minAlpha:0.05, maxAlpha:0.2}),
    smDr: T.Smoother({minAlpha:0.04, maxAlpha:0.15}), smDb: T.Smoother({minAlpha:0.04, maxAlpha:0.15}),
    smContour: T.FACE_CONTOUR.map(() => T.Smoother2D()),
    gov: T.FrameGovernor(),
    assetCache: {},               // (scarfId|colorId) → {head, drape, anchors}
    lastHint: '', lostFrames: 0, r3d: false, mesh: false, lastFrameT: 0,
    camErr: null, fatalShown: false,
    bandana: null,                 // v23: null = من غير بندانة (الافتراضي)
    bandanaHinted: false,
    plain: false,                   // v26: سادة — تلقائي بس من صورة المنتج
    pendingPhoto: null,             // v34: الأصل المصوّر اللي بيترقّى في الخلفية
    seg: null, segFailed: false,    // v25: مقطّع الشعر — lazy
    hairZone: null,                 // v25: {mask,w,h} — أنهي شعر يتغطى
    hairCoverCanvas: null, hairCoverKey: null,
    hairT: 0, segBusy: false, lastSegT: 0,   // v28: عمر الماسك + خنق اللايف
    stab: T.StabilityMeter(),       // v28: مقياس الثبات (بند ١٢)
    stabState: { stable: false, score: Infinity },
    stage: 'boot', lastErr: null,     // 🩺 تشخيص: فين وقفنا وإيه الخطأ
    delegate: null, switching: false  // 🩺 v35: GPU ولا CPU
  };

  /* ============================================================
     ١) تحميل MediaPipe — GPU والفولباك CPU
     ============================================================ */
  async function loadLandmarker(){
    setLoad('بنجهّز… ٠٪');
    const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
    const vision = await import(CDN + '/+esm');
    const files = await vision.FilesetResolver.forVisionTasks(CDN + '/wasm');

    // 📦 الموديل: من echarpe.store لو مرفوع، وإلا من جوجل — ومرة
    //    واحدة في العمر: بيتخزن في Cache Storage والفتحات الجاية فورية.
    const buffer = await fetchModelBuffer((pct) =>
      setLoad('بنحمّل موديل الوش… ' + pct + '٪ (أول مرة بس)'));

    const opts = (delegate) => ({
      baseOptions: { modelAssetBuffer: buffer, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFacialTransformationMatrixes: true
    });
    /* 🩺 v35: الفولباك القديم كان بيشتغل **لو الإنشاء رمى خطأ** بس.
       والمشكلة اللي ظهرت على جهاز المالك مختلفة تمامًا: الإنشاء
       بينجح على GPU، والكشف بيرجّع **صفر وشوش** على وش واضح وقريب
       ومضوّي. ده عيب معروف في بعض كروت أندرويد: MediaPipe بتشتغل
       من غير أي خطأ وبترجّع نتيجة فاضية.
       عشان كده احتفظنا بأدوات إعادة البناء — الفولباك بقى ممكن
       **بعد التشغيل** مش وقت الإنشاء بس. */
    S._rebuild = (delegate) => vision.FaceLandmarker.createFromOptions(files, opts(delegate));
    const forced = /[?&]cpu=1/.test(location.search) ? 'CPU' : null;
    try {
      S.delegate = forced || 'GPU';
      S.landmarker = await S._rebuild(S.delegate);
    } catch(e) {
      console.warn('GPU فشل — CPU:', e);
      S.delegate = 'CPU';
      S.landmarker = await S._rebuild('CPU');
    }
    S.setImageMode = async () => { try{ await S.landmarker.setOptions({ runningMode:'IMAGE' }); }catch(e){} };
    S.setVideoMode = async () => { try{ await S.landmarker.setOptions({ runningMode:'VIDEO' }); }catch(e){} };
  }

  const MODEL_LOCAL = 'assets/face_landmarker.task';
  const MODEL_REMOTE = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  const MODEL_CACHE = 'echarpe-tryon-model-v1';

  async function fetchModelBuffer(onPct){
    // ١) من الكاش الدايم — تحميل واحد في العمر
    try{
      const cache = await caches.open(MODEL_CACHE);
      const hit = await cache.match('model');
      if(hit) return new Uint8Array(await hit.arrayBuffer());
    }catch(e){}
    // ٢) المحلي الأول (نفس الدومين = أسرع في مصر)، وإلا جوجل
    let buf = await fetchWithProgress(MODEL_LOCAL, onPct).catch(() => null);
    if(!buf) buf = await fetchWithProgress(MODEL_REMOTE, onPct);
    try{
      const cache = await caches.open(MODEL_CACHE);
      await cache.put('model', new Response(buf.slice(0)));
    }catch(e){}
    return buf;
  }

  async function fetchWithProgress(url, onPct){
    const res = await fetch(url);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const total = Number(res.headers.get('content-length')) || 0;
    if(!res.body || !total){
      onPct && onPct('…');
      return new Uint8Array(await res.arrayBuffer());
    }
    const reader = res.body.getReader();
    const out = new Uint8Array(total);
    let got = 0, lastPct = -1;
    for(;;){
      const { done, value } = await reader.read();
      if(done) break;
      out.set(value, got); got += value.length;
      const pct = Math.min(99, Math.round(got / total * 100));
      if(pct !== lastPct && onPct){ onPct(pct); lastPct = pct; }
    }
    return out;
  }

  /* ============================================================
     ١ب) 💇 v25: مقطّع الشعر — lazy، وضع الصورة بس
     ------------------------------------------------------------
     خطة Hybrid Pipeline بند (أ): ماسك شعر → تغطية الشعر الشارد
     حوالين الفتحة وتحت الجناب. **مش بيتحمّل مع الإقلاع** — أول
     صورة بتحمّله، وفشله = التجربة تكمل عادي من غيره (صفر شاشات
     خطأ — دي طبقة تجميل مش أساس).
     ============================================================ */
  const SEG_LOCAL = 'assets/selfie_multiclass.tflite';
  const SEG_REMOTE = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';
  const SEG_CACHE = 'echarpe-tryon-seg-v1';

  async function loadSegmenter(){
    if(S.seg || S.segFailed) return S.seg;
    try{
      const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
      const vision = await import(CDN + '/+esm');
      const files = await vision.FilesetResolver.forVisionTasks(CDN + '/wasm');
      // نفس فلسفة موديل الوش: كاش دايم = تحميل واحد في العمر،
      // ومحلي الأول لو المالك رفعه على echarpe.store
      let buffer = null;
      try{
        const cache = await caches.open(SEG_CACHE);
        const hit = await cache.match('model');
        if(hit) buffer = new Uint8Array(await hit.arrayBuffer());
      }catch(e){}
      if(!buffer){
        buffer = await fetchWithProgress(SEG_LOCAL, null).catch(() => null);
        if(!buffer) buffer = await fetchWithProgress(SEG_REMOTE, null);
        try{
          const cache = await caches.open(SEG_CACHE);
          await cache.put('model', new Response(buffer.slice(0)));
        }catch(e){}
      }
      const mk = (delegate) => vision.ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetBuffer: buffer, delegate },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: false
      });
      try{ S.seg = await mk('GPU'); }
      catch(e){ console.warn('seg GPU فشل — CPU:', e); S.seg = await mk('CPU'); }
    }catch(e){
      // 🛟 صامت عمدًا: مفيش showFatal ولا photoOnly — الطرحة شغالة
      //    من غير الماسك، والعميلة مش لازم تعرف أصلًا
      console.warn('seg', e);
      S.segFailed = true;
    }
    return S.seg;
  }

  /* حساب منطقة التغطية للصورة الحالية — مرة واحدة لكل صورة.
     التقطيع على نسخة مصغّرة (≤512 عرض): الماسك بيتدرّج أصلًا
     فالتكبير مش بيبان، والتقطيع بيبقى أسرع بكتير على الموبايل. */
  /* المشترك: مصدر (صورة/فريم) + معالم → منطقة تغطية. بيستعمله وضع
     الصورة واللايف المستقر واللقطة عالية الجودة — مسار واحد للتلاتة. */
  async function hairZoneFor(srcEl, lm){
    if(!lm) return null;
    const seg = await loadSegmenter();
    if(!seg) return null;
    try{
      const iw = srcEl.naturalWidth || srcEl.videoWidth || srcEl.width;
      const ih = srcEl.naturalHeight || srcEl.videoHeight || srcEl.height;
      const sc = Math.min(1, 512 / iw);
      const w = Math.max(1, Math.round(iw * sc)), h = Math.max(1, Math.round(ih * sc));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(srcEl, 0, 0, w, h);
      const res = seg.segment(c);
      const cm = res.categoryMask;
      if(!cm) return null;
      const hm = T.hairMaskFromCategories(cm.getAsUint8Array(), w, h);
      try{ cm.close(); }catch(e){}
      // المعالم منسّبة (0..1) — نفس النقط بمقاس الماسك مباشرة
      const an = T.anchorsFromLandmarks(lm, w, h);
      const ex = T.expandAnchors(an, S.scarf && S.scarf.fit);
      const zone = T.hairCoverZone(hm.mask, w, h, an, ex);
      if(!zone) return null;
      return { mask: zone.mask, w: w, h: h };
    }catch(e){ console.warn('hairZone', e); return null; }
  }

  async function computeHairCover(img){
    if(!S.stillResult || !S.stillResult.faceLandmarks
       || !S.stillResult.faceLandmarks.length) return;
    const myImg = img;                        // العميلة ممكن تغيّر الصورة والتقطيع شغال
    const z = await hairZoneFor(img, S.stillResult.faceLandmarks[0]);
    if(!z || S.stillImg !== myImg) return;    // اتغيّرت = النتيجة القديمة تترمي
    S.hairZone = z;
    S.hairT = performance.now();
    S.hairCoverCanvas = null; S.hairCoverKey = null;
    if(S.mode === 'photo' && S.stillImg) draw(S.stillResult, S.stillImg);
  }

  /* 💇 v28: اللايف — الماسك بيتحسب **بس** لما الراس ثابتة (بند ١٢)
     وبخنق زمني، مش كل فريم: segmentation كل فريم بيقتل الموبايل،
     وأثناء الحركة الماسك القديم بيبقى في المكان الغلط أصلًا. */
  async function liveHairPass(){
    if(S.segBusy || S.mode !== 'live' || !S.stabState.stable) return;
    if(!S.lastLm || S.segFailed) return;
    const now = performance.now();
    if(now - S.lastSegT < 700) return;         // خنق: مرة كل ~٠٫٧ ثانية وهي ثابتة
    S.segBusy = true; S.lastSegT = now;
    try{
      const z = await hairZoneFor(S.video, S.lastLm);
      if(z && S.mode === 'live'){
        S.hairZone = z;
        S.hairT = performance.now();
        S.hairCoverCanvas = null; S.hairCoverKey = null;
      }
    }finally{ S.segBusy = false; }
  }

  /* كانفاس التغطية بلون القماش الحالي — بيتبني بس لما اللون يتغيّر
     (المفتاح)، مش كل رسمة. لون التغطية = لون المنتج مغمّق شوية:
     الشعر المتغطي واقع في **ضل** الطرحة فوقه، مش على وشّها. */
  function hairCoverCanvas(hex){
    const z = S.hairZone;
    if(!z) return null;
    const key = hex + '|' + z.w + 'x' + z.h;
    if(S.hairCoverCanvas && S.hairCoverKey === key) return S.hairCoverCanvas;
    try{
      const n = parseInt(hex.slice(1), 16);
      const dim = (v) => Math.max(0, v - 24);
      const r = dim(n >> 16), g = dim((n >> 8) & 255), b = dim(n & 255);
      const c = document.createElement('canvas'); c.width = z.w; c.height = z.h;
      const gc = c.getContext('2d');
      const im = gc.createImageData(z.w, z.h);
      for(let p = 0; p < z.w * z.h; p++){
        const a = Math.round(Math.min(1, z.mask[p]) * 255);
        if(!a) continue;
        const i = p * 4;
        im.data[i] = r; im.data[i+1] = g; im.data[i+2] = b; im.data[i+3] = a;
      }
      gc.putImageData(im, 0, 0);
      S.hairCoverCanvas = c; S.hairCoverKey = key;
      return c;
    }catch(e){ console.warn('hairCanvas', e); return null; }
  }

  /* ============================================================
     ٢) الكاميرا
     ============================================================ */
  async function startCamera(){
    if(S.stream) return;                       // شغالة خلاص
    setLoad('بنفتح الكاميرا…');
    // 🌐 الفحص **قبل** اللمس — الوصول لـmediaDevices الغير موجودة
    //    بيرمي TypeError غامض بيتحوّل لشاشة خطأ مالهاش معنى
    const sup = T.cameraSupport(navigator,
      typeof window.isSecureContext === 'boolean' ? window.isSecureContext : true);
    if(!sup.ok){
      const err = new Error('camera unavailable: ' + sup.reason);
      err.name = 'NoCameraAPI';
      throw err;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode:'user', width:{ideal:1280}, height:{ideal:720} },
      audio: false
    });
    S.stream = stream;
    S.video.srcObject = stream;
    await S.video.play();
    // مقاس الرسم = مقاس الفيديو الحقيقي (مش مقاس الشاشة)
    S.canvas.width = S.video.videoWidth || 720;
    S.canvas.height = S.video.videoHeight || 960;
    const c3 = $('stage3d');
    c3.width = S.canvas.width; c3.height = S.canvas.height;
    if(S.r3d) TRYON3D.resize(S.canvas.width, S.canvas.height);
    if(S.mesh) TRYON_MESH.resize(S.canvas.width, S.canvas.height);
    setLoad('');
  }

  // 🟢 قفل حقيقي للكاميرا — من غيره النقطة الخضرا بتفضل نور طول
  //    ما التاب مفتوح، حتى والعميلة في تطبيق تاني
  function stopCamera(){
    if(!S.stream) return;
    try{ S.stream.getTracks().forEach((t) => t.stop()); }catch(e){}
    S.stream = null;
    S.video.srcObject = null;
  }

  // التاب اتخبى (رجعت للشات مثلًا) = الكاميرا تتقفل فورًا،
  // ورجوعها = تشتغل تاني لوحدها لو إحنا في وضع اللايف
  document.addEventListener('visibilitychange', () => {
    if(document.hidden){ stopCamera(); return; }
    if(S.mode === 'live' && S.running)
      startCamera().catch(() => {});
  });
  window.addEventListener('pagehide', stopCamera);

  /* ============================================================
     ٣) أصول الطرحة — procedural أو صور
     ============================================================ */
  function getAsset(scarf, color){
    const key = scarf.id + '|' + (scarf.tintable ? color.id : '-');
    if(S.assetCache[key]) return S.assetCache[key];
    let asset;
    if(scarf.type === 'procedural'){
      asset = makeProceduralScarf(color.hex);
    } else {
      asset = loadPhotoScarf(scarf, color);   // بيرجع فورًا وبيكمل تحميل
    }
    S.assetCache[key] = asset;
    return asset;
  }

  // 🖌️ طرحة مرسومة بالكود — بديل مؤقت لحد التصوير (شكلها مقبول
  //    عشان اختبار التتبّع، ومش هدفها تبيع)
  function makeProceduralScarf(hex){
    const W = 1000, H = 1200;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');

    const dark = shade(hex, -28), light = shade(hex, 22);

    // جسم الطرحة: قبة فوق + جناب نازلة لآخر الصورة (مش دايرة/خاتم —
    // الشكل ده بيقرا "حجاب" حتى وهو مرسوم)
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, light); grad.addColorStop(0.5, hex); grad.addColorStop(1, dark);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(60, H);
    g.lineTo(60, 620);
    g.bezierCurveTo(60, 220, 250, 60, 500, 60);
    g.bezierCurveTo(750, 60, 940, 220, 940, 620);
    g.lineTo(940, H);
    g.closePath();
    g.fill();

    // 🕳️ فتحة الوش — شفافة
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.ellipse(500, 660, 262, 350, 0, 0, Math.PI*2);
    g.fill();
    g.globalCompositeOperation = 'source-over';

    // طيّات قماش خفيفة
    g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 7;
    for(let i=0;i<6;i++){
      g.beginPath();
      g.ellipse(500, 600, 300+i*28, 400+i*26, 0, Math.PI*1.15, Math.PI*1.85);
      g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 4;
    for(let i=0;i<5;i++){
      g.beginPath();
      g.ellipse(500, 590, 314+i*30, 414+i*28, 0, Math.PI*1.2, Math.PI*1.8);
      g.stroke();
    }

    // الانسدال
    const d = document.createElement('canvas'); d.width = 1000; d.height = 620;
    const dg = d.getContext('2d');
    const dgrad = dg.createLinearGradient(0,0,0,620);
    dgrad.addColorStop(0, hex); dgrad.addColorStop(1, dark);
    dg.fillStyle = dgrad;
    dg.beginPath();
    dg.moveTo(180, 0);
    dg.bezierCurveTo(60, 220, 40, 460, 130, 610);
    dg.lineTo(870, 610);
    dg.bezierCurveTo(960, 460, 940, 220, 820, 0);
    dg.closePath(); dg.fill();
    dg.strokeStyle = 'rgba(0,0,0,0.15)'; dg.lineWidth = 6;
    for(let i=0;i<5;i++){
      dg.beginPath();
      dg.moveTo(280 + i*95, 10);
      dg.bezierCurveTo(255 + i*95, 220, 300 + i*95, 420, 275 + i*95, 600);
      dg.stroke();
    }

    return { ready:true, head:c, drape:d,
             anchors:{ l:[150,560], r:[850,560], top:[500,120] } };
  }

  /* 🕳️ v20: تدرّج حافة فتحة الوش — مرة واحدة وقت التحميل. الفتحة
     في الأصل شفافة أصلًا؛ اللي كان بيبان "لوحة بيضا" هو خلفية
     صورة العميلة من فتحة أوسع من الوش (اتصلحت بالـfit في الكتالوج).
     هنا بنعمل الجزء التاني: حافة القماش تدوب في الجلد بدل قطع حاد. */
  function processHeadImage(img, scarf, asset){
    try{
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const im = g.getImageData(0, 0, w, h);
      const A = scarf.head.anchors;
      const seed = [ Math.round((A.l[0] + A.r[0]) / 2),
                     Math.round(A.l[1] + (A.r[0] - A.l[0]) * 0.5) ];
      // v22: contourK = محيط الفتحة — الفتحة العضوية بتتشد منه
      const res = T.featherHoleEdge(im.data, w, h, seed, { feather: 7, contourK: 32 });
      if(!res.holePx) return img;              // مفيش فتحة تحت البذرة = سيبها
      if(asset) asset.holeContour = { c: res.centroid, radii: res.radii };
      g.putImageData(im, 0, 0);
      return c;
    }catch(e){ console.warn('faceHole', e); return img; }
  }

  /* 🔴 v33: **الباج الأصلي.** الأصل بيتحمّل غير متزامن، وفي وضع
     الصورة الرسم بيحصل **مرة واحدة** — فلو الصورة ماكانتش جاهزة
     في اللحظة دي، مفيش حاجة تعيد الرسم لما تخلص. النتيجة: وش من
     غير طرحة و`asset:loading` للأبد (الشريحة أكدتها على جهاز المالك).
     ⚠️ وحارس المهلة اللي في draw مكانش بيشتغل لنفس السبب: draw
        نفسها مش بتتنادى تاني في وضع الصورة. فالحارس اتنقل هنا
        كـsetTimeout مستقل عن دورة الرسم. */
  /* 🔼 v34: الترقية — بنجهّز الأصل المصوّر في الخلفية، وأول ما
     يبقى جاهز بنبدّل عليه ونعيد الرسم. فشله = مفيش أي أثر على
     العميلة (فاضلة على المرسومة). */
  function tryUpgradeToPhoto(){
    if(!S.pendingPhoto) return;
    const target = S.pendingPhoto;
    const a = getAsset(target, S.color);
    if(a.failed){ S.pendingPhoto = null; console.warn('الأصل المصوّر فشل:', a.why); return; }
    if(!a.ready){ setTimeout(tryUpgradeToPhoto, 400); return; }
    S.pendingPhoto = null;
    S.scarf = target;
    console.log('✅ اترقّى للأصل المصوّر');
    repaintStill();
  }

  function repaintStill(){
    try{
      if(S.mode === 'photo' && S.stillResult && S.stillImg)
        draw(S.stillResult, S.stillImg);
    }catch(e){ console.warn('repaint', e); }
  }

  function loadPhotoScarf(scarf, color){
    const asset = { ready:false, failed:false, head:null, drape:null,
                    headTinted:null, tintHex:null, _mask:null,
                    headTemp:null, tempKey:null,
                    startedAt: performance.now(), why: '',   // 🩺 v29: تشخيص
                    anchors: scarf.head.anchors };
    const hi = new Image();
    hi.onload = () => {
      try{
        asset.head = processHeadImage(hi, scarf, asset);
        if(!asset.head){ asset.failed = true; asset.why = 'معالجة الصورة رجّعت فاضي'; return; }
        asset.ready = !!(!scarf.drape || asset.drape);
        if(!asset.ready) asset.why = 'مستني الانسدال';
        if(asset.ready) repaintStill();       // 🔴 v33: جاهز؟ ارسم تاني
      }catch(e){
        // 🔴 v29: كان أي خطأ في المعالجة بيسيب ready=false للأبد =
        //    شاشة من غير طرحة ومن غير أي تفسير
        asset.failed = true; asset.why = 'خطأ في المعالجة: ' + (e && e.message || e);
      }
    };
    // 🛟 الصورة ماتحملتش (لسه ماترفعتش؟) = الرسمة بدل شاشة فاضية
    hi.onerror = () => {
      asset.failed = true; asset.why = 'ملف الصورة مش موجود أو مرفوض';
      repaintStill();
    };
    // ⏱️ حارس مستقل عن دورة الرسم: تحميل معلّق (لا load ولا error)
    //    بيتحوّل لفشل معلن بعد ٦ ثواني، والشاشة بتتحدّث لوحدها.
    setTimeout(() => {
      if(!asset.ready && !asset.failed){
        asset.failed = true;
        asset.why = 'التحميل اتأخر أكتر من ٦ ثواني';
        repaintStill();
      }
    }, 6000);
    hi.src = scarf.head.url;
    if(scarf.drape && scarf.drape.url){
      const di = new Image();
      di.onload = () => { asset.drape = di; asset.ready = !!asset.head;
                          if(asset.ready) repaintStill(); };
      di.onerror = () => { asset.failed = true; asset.why = 'الانسدال مش موجود'; repaintStill(); };
      di.onerror = () => {};
      di.src = scarf.drape.url;
    }
    return asset;
  }

  /* 🎨 تلوين الأصل الحقيقي بلون المنتج — محرك recolor-core نفسه:
     ماسك من عيّنات القماش (بيتحسب مرة) + نقل إضاءة، والحواف
     المشغولة بتفضل زي ما هي. من غير لون منتج = الصورة الأصلية. */
  function ensureTint(asset, scarf, color){
    if(!asset.ready || !scarf.recolor) return;
    if(color.id !== 'from-img'){ asset.headTinted = null; asset.tintHex = null; asset.headTemp = null; asset.tempKey = null; return; }
    if(asset.tintHex === color.hex && asset.tintPlain === S.plain) return;
    try{
      const c = document.createElement('canvas');
      // الأصل ممكن يبقى كانفاس (بعد تنضيف الفتحة) — مالوش naturalWidth
      c.width = asset.head.naturalWidth || asset.head.width;
      c.height = asset.head.naturalHeight || asset.head.height;
      const g = c.getContext('2d');
      g.drawImage(asset.head, 0, 0);
      const im = g.getImageData(0, 0, c.width, c.height);
      if(!asset._mask)
        asset._mask = RECOLOR.buildMask(im.data, scarf.recolor.seeds, scarf.recolor.tol);
      // 🧵 v24: سادة = الكنار بيتملى بإضاءة القماش المجاور وبيتلون معاه
      const mask = S.plain
        ? RECOLOR.plainify(im.data, asset._mask, c.width, c.height, T.blurChannel)
        : asset._mask;
      RECOLOR.applyRecolor(im.data, mask, color.hex);
      g.putImageData(im, 0, 0);
      asset.headTinted = c;
      asset.tintHex = color.hex;
      asset.tintPlain = S.plain;
      asset.headTemp = null; asset.tempKey = null;   // اللون اتغير = الحرارة تتخبز تاني
    }catch(e){ console.warn('tint', e); asset.headTinted = null; }
  }

  /* 🖼️ AR-2: مصدر الصورة المسقّطة — **نفس** أصل المسار 2D وبنفس
     التلوين، عشان اللي العميلة بتشوفه في الـ3D هو نفس القالب مش
     نسخة تانية بتفرق عنه. مفيش صورة جاهزة = null (الرندرر بيفضل
     على الملمس المكرر بلون المنتج). */
  function projSource(){
    const scarf = S.scarf;
    if(!scarf || scarf.type !== 'photo') return null;
    const asset = getAsset(scarf, S.color);
    if(!asset.ready || asset.failed) return null;
    ensureTint(asset, scarf, S.color);
    const img = asset.headTinted || asset.head;
    if(!img) return null;
    return { img: img, anchors: asset.anchors,
             key: scarf.id + '|' + (asset.tintHex || 'raw') };
  }

  /* 🌡️ v20: خبز حرارة اللون على نسخة كاش — مش كل فريم. المفتاح
     متكمّي (tempBucket) فرعشة الإضاءة مش بتعيد البناء، والتغيير
     الحقيقي (دخلت أوضة لمبتها صفرا) بيتلحق في ثانية. */
  function ensureTemp(asset, dr, db){
    if(!asset.ready) return;
    const tint = T.tempTintColor(dr, db);
    const key = (asset.tintHex || 'raw') + '|' + (tint ? T.tempBucket(dr, db) : 'neutral');
    if(asset.tempKey === key) return;
    if(!tint){ asset.headTemp = null; asset.tempKey = key; return; }
    try{
      const base = asset.headTinted || asset.head;
      const c = document.createElement('canvas');
      c.width = base.naturalWidth || base.width;
      c.height = base.naturalHeight || base.height;
      const g = c.getContext('2d');
      g.drawImage(base, 0, 0);
      g.globalCompositeOperation = 'source-atop';    // اللون على القماش بس مش الشفاف
      g.fillStyle = 'rgba(' + tint.r + ',' + tint.g + ',' + tint.b + ',' + tint.alpha + ')';
      g.fillRect(0, 0, c.width, c.height);
      asset.headTemp = c;
      asset.tempKey = key;
    }catch(e){ console.warn('temp', e); asset.headTemp = null; asset.tempKey = key; }
  }

  // سلسلة الشكل النهائي: حرارة ← لون منتج ← أصل
  function lookImg(asset){
    return asset.headTemp || asset.headTinted || asset.head;
  }

  // عيّنة لون الجلد من الخدود — إضاءة + انحراف الحرارة (v20)
  function sampleSkin(ctx, an){
    try{
      const px = (p) => ctx.getImageData(Math.max(0,p[0]-2), Math.max(0,p[1]-2), 4, 4).data;
      const acc = (d) => {
        let r=0, g=0, b=0;
        for(let i=0; i<d.length; i+=4){ r+=d[i]; g+=d[i+1]; b+=d[i+2]; }
        const n = d.length/4; return { r:r/n, g:g/n, b:b/n };
      };
      const a = acc(px(an.cheekL)), c = acc(px(an.cheekR));
      const r=(a.r+c.r)/2, g=(a.g+c.g)/2, b=(a.b+c.b)/2;
      return { r:r, g:g, b:b, luma: 0.299*r + 0.587*g + 0.114*b };
    }catch(e){ return { r:128, g:128, b:128, luma:128 }; }
  }

  /* 🫥 v22: أزواج شد الفتحة العضوية.
     لكل معلم من الـ٩ على محيط الوش: بنرجّع بالعكس (عكس الأفيني)
     لفضاء القالب، بنقيس زاوية النقطة حوالين مركز الفتحة، بنجيب
     حافة الفتحة عند نفس الزاوية، بنرجّعها للشاشة = "from"، والمعلم
     نفسه (موسّع شوية للبرّه عشان القماش يركب على حرف الوش مش
     يقف عنده بالظبط) = "to". */
  function contourPairs(lm, w, h, asset, Tr, ex){
    const hc = asset.holeContour;
    if(!hc || !lm) return null;
    const inv = T.invertAffine(Tr);
    if(!inv) return null;
    const raw = T.faceContourFromLandmarks(lm, w, h);
    const fcx = (ex.l[0] + ex.r[0]) / 2, fcy = (ex.top[1] + ex.chin[1]) / 2;
    const OUT = 1.05;                       // القماش يركب على حرف الوش
    const pairs = [];
    for(let i = 0; i < raw.length; i++){
      const sm = S.smContour[i].push(raw[i]);
      const to = { x: fcx + (sm[0] - fcx) * OUT, y: fcy + (sm[1] - fcy) * OUT };
      const tx = inv.a * to.x + inv.b * to.y + inv.c;
      const ty = inv.d * to.x + inv.e * to.y + inv.f;
      const th = Math.atan2(ty - hc.c[1], tx - hc.c[0]);
      const rad = T.holeRadiusAt(hc, th);
      const hx = hc.c[0] + Math.cos(th) * rad;
      const hy = hc.c[1] + Math.sin(th) * rad;
      pairs.push({
        from: { x: Tr.a * hx + Tr.b * hy + Tr.c, y: Tr.d * hx + Tr.e * hy + Tr.f },
        to: to
      });
    }
    return { pairs: pairs, radius: ex.faceW * 0.9 };
  }

  // §ديبج: window.TRYON_DEBUG = true من الكونسول — بيرسم الشد نفسه
  function debugContour(warp){
    ctx.save();
    ctx.filter = 'none';
    warp.pairs.forEach((p) => {
      ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.from.x, p.from.y); ctx.lineTo(p.to.x, p.to.y); ctx.stroke();
      ctx.fillStyle = '#ff3d7f';
      ctx.beginPath(); ctx.arc(p.to.x, p.to.y, 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath(); ctx.arc(p.from.x, p.from.y, 3, 0, 7); ctx.fill();
    });
    ctx.restore();
  }

  function shade(hex, amt){
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, v + amt));
    return 'rgb(' + f(n>>16) + ',' + f((n>>8)&255) + ',' + f(n&255) + ')';
  }

  /* ============================================================
     ٤) الرسم — قلب الموضوع
     ============================================================ */
  function draw(result, srcEl){
    const ctx = S.ctx, w = S.canvas.width, h = S.canvas.height;
    ctx.clearRect(0,0,w,h);
    ctx.drawImage(srcEl, 0, 0, w, h);

    const faces = result && result.faceLandmarks;
    if(!faces || !faces.length){
      S.lostFrames++;
      /* 🩺 v36: الأرقام على الشاشة مباشرة — مفيش كونسول على الموبايل،
         والتخمين اتجرب عشر مرات. المقاس والحالة وعدد الفريمات
         بيقولوا إذا كانت الكاميرا بتدي صورة أصلًا ولا لأ. */
      chip('no-face·' + (S.delegate || '?').toLowerCase()
        + '·' + (S.video.videoWidth || 0) + 'x' + (S.video.videoHeight || 0)
        + '·rs' + (S.video.readyState || 0)
        + '·f' + (S.frames || 0)
        + (S.detectErr ? ('·⚠️' + S.detectErr) : ''));
      /* 🔁 v35: مفيش وش لمدة ٤٥ فريم ولسه على GPU؟ الأرجح إن الكارت
         بيرجّع نتيجة فاضية بصمت. بنعيد البناء على CPU **مرة واحدة**.
         ⚠️ مرة واحدة بالظبط: إعادة البناء تقيلة، ولو اتكررت مع كل
            فريم التطبيق بيقف خالص — وده أوحش من مفيش طرحة. */
      if(S.lostFrames === 45 && S.delegate === 'GPU' && !S.switching && S._rebuild){
        S.switching = true;
        hint('بنجرّب طريقة تانية… 🔄');
        (async () => {
          try{
            const cpu = await S._rebuild('CPU');
            S.landmarker = cpu; S.delegate = 'CPU'; S.lostFrames = 0;
            console.warn('اتحوّلنا لـCPU — GPU كان بيرجّع صفر وشوش');
          }catch(e){ console.warn('CPU rebuild failed', e); S.lastErr = String(e); }
          S.switching = false;
        })();
      }
      if(S.r3d) TRYON3D.clear();
      if(S.mesh) TRYON_MESH.clear();
      /* ⚠️ كانت «قرّبي وشّك» — نصيحة بالعكس: الوش المالي الكادر
         بحدود مقصوصة هو أكتر سبب لعدم الكشف. */
      if(S.lostFrames > 20) hint('خلّي الوش والكتافين باينين في الكادر 🙂');
      return;
    }
    S.lostFrames = 0;

    const lm = faces[0];
    S.lastLm = lm;                            // v28: للماسك في اللايف واللقطة
    if(S.mode === 'live')
      S.stabState = S.stab.push(T.faceContourFromLandmarks(lm, w, h));
    const mat = result.facialTransformationMatrixes
             && result.facialTransformationMatrixes[0];
    const pose = T.poseFromMatrix(mat && mat.data);

    if(S.r3d && mat){
      // 🧊 المسار 3D: occluder الراس بيتكفل باللفّات — حد الإخفاء أوسع
      const an3 = T.anchorsFromLandmarks(lm, w, h);
      const br3 = S.smBright.push(sampleLuma(ctx, an3));
      // 🖼️ AR-2: نفس صورة القالب (وبعد التلوين) بتتسقّط على الجسم
      const p3 = projSource();
      TRYON3D.update(mat.data, {
        hex: S.color.hex,
        bright: T.lumaToBrightness(br3),
        fade: Math.abs(pose.yaw) > 62 || Math.abs(pose.pitch) > 45,
        asset: p3 && p3.img, anchors: p3 && p3.anchors, assetKey: p3 && p3.key
      });
      hint('');
      return;
    }

    const q = T.fitQuality(pose);
    hint(q.hint);
    // 🖼️ v26: الإخفاء **للايف بس** — في اللايف العميلة بتعدّل وضعها
    //    في ثانية، إنما صورة ثابتة بوضع صعب = شاشة فاضية من غير أي
    //    تفسير (حصلت فعلًا: صورة بالراحة على المخدة → "مافيش حاجة").
    //    في الصورة بنرسم بأفضل تقدير + الرسالة بتقول إن الوضع صعب.
    if(q.fade && S.mode === 'live') return;  // لفّة جامدة في اللايف = نخفي بدل ما نشوّه
    if(q.fade) hint('الوضع في الصورة دي صعب — النتيجة تقريبية، جرّبي صورة وشّك فيها قدام 📷');

    // نقط التثبيت + تنعيم (في وضع الصورة الثابتة مفيش تنعيم)
    let an = T.anchorsFromLandmarks(lm, w, h);
    if(S.mode === 'live'){
      an = { top: S.smTop.push(an.top), chin: S.smChin.push(an.chin),
             l: S.smL.push(an.l), r: S.smR.push(an.r),
             cheekL: an.cheekL, cheekR: an.cheekR };
    }
    // 📐 v20: توسيع النقط بمقاس الأصل نفسه — أصل نقطه على حافة
    //    الفتحة (fit في الكتالوج) بياخد توسيع أقل فالفتحة تحضن
    //    الوش، والطرحة المرسومة بتفضل على الافتراضي
    const ex = T.expandAnchors(an, S.scarf.fit);

    let asset = getAsset(S.scarf, S.color);
    // ⏳ v29: أصل عالق (مش ready ومش failed) — كان بيفضل كده للأبد
    //    والشاشة من غير طرحة من غير أي تفسير. دلوقتي مهلة ٦ ثواني.
    if(!asset.ready && !asset.failed && asset.startedAt
       && performance.now() - asset.startedAt > 6000){
      asset.failed = true;
      asset.why = asset.why || 'التحميل اتأخر أكتر من ٦ ثواني';
    }
    if(asset.failed){
      // 🛟 الأصل الحقيقي مش متاح — نرجع للرسمة بدل ما الشاشة تفضى
      const fb = window.TRYON_CATALOG.find((x) => x.type === 'procedural');
      if(fb && S.scarf.id !== fb.id){
        console.warn('أصل الطرحة فشل:', S.scarf.id, asset.why);
        S.lastErr = 'أصل «' + (S.scarf.name || S.scarf.id) + '»: ' + asset.why;
        hint('⚠️ صورة الطرحة مش متاحة — بنعرض شكل مبدئي');
        S.scarf = fb; asset = getAsset(S.scarf, S.color);
        // ⚠️ مفيش صف اختيار طرح في الواجهة (أصل واحد بس لحد التصوير) —
        //    فمفيش حاجة تتزامن هنا. أول ما الصف يتضاف يتنادى من هنا.
      }
    }
    if(!asset.ready){
      // بيحمّل لسه — رسالة بدل صمت (العميلة بتفتكر إن الشاشة بايظة)
      if(!asset.failed) hint('⏳ بنجهّز الطرحة…');
      chip('asset:' + (asset.failed ? ('failed·' + (asset.why || '')) : 'loading'));
      return;
    }
    ensureTint(asset, S.scarf, S.color);

    // 💡🌡️ عيّنة الجلد: إضاءة + حرارة لون (v20) — كله متنعّم
    const sk = sampleSkin(ctx, an);
    const bright = S.smBright.push(sk.luma);
    const drS = S.smDr.push(sk.r - sk.luma);
    const dbS = S.smDb.push(sk.b - sk.luma);
    ensureTemp(asset, drS, dbS);
    const headImg = lookImg(asset);

    // 💇 v25 (وضع الصورة بس): تغطية الشعر الشارد — **أول** طبقة فوق
    //    الصورة وتحت كل حاجة (بندانة/ضل/قماش). الماسك محسوب مرة
    //    واحدة للصورة، واللون بيتبع لون المنتج. اللايف من غيرها
    //    عمدًا: التقطيع كل فريم بيقتل الفريمات على الموبايل.
    //    v28: في اللايف بتتطبق **بس** والراس ثابتة والماسك لسه طازة —
    //    أول حركة = الحارس بيقع فورًا والتغطية بتختفي (رجوع فوري
    //    للـAR الخام، بند ١١) بدل ما ماسك قديم يتلزق في المكان الغلط.
    const hairOK = S.scarf.type === 'photo' && S.hairZone &&
      (S.mode === 'photo'
        || (S.stabState.stable && performance.now() - S.hairT < 2000));
    if(hairOK && layerOn('hair')){
      const hc = hairCoverCanvas(S.color.hex);
      if(hc){
        ctx.save();
        if(window.TRYON_DEBUG) ctx.globalAlpha = 0.55;   // شفافة للمعايرة
        ctx.drawImage(hc, 0, 0, w, h);
        ctx.restore();
      }
    }

    // 🧕 v23: البندانة — **تحت** القماش وفوق الوش: بتغطي منابت
    //    الشعر والجبهة فمفيش شعر ولا خلفية باينة بين الوش والطرحة
    //    (سر واقعية الفلاتر الاحترافية). قماشها له ظل خفيف عند
    //    حافتها على الجلد + لمعة بسيطة — مش لون مصمت.
    if(S.bandana && S.bandana.hex && S.scarf.type === 'photo' && layerOn('bandana')){
      const bd = T.bandanaSpec(an, ex);
      ctx.save();
      ctx.beginPath();
      bd.poly.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.closePath();
      const gb = ctx.createLinearGradient(bd.bottomMid[0], bd.bottomMid[1],
                                          bd.top[0], bd.top[1]);
      gb.addColorStop(0, shade(S.bandana.hex, -18));   // أغمق عند الجلد
      gb.addColorStop(0.35, S.bandana.hex);
      gb.addColorStop(1, shade(S.bandana.hex, 10));    // لمعة خفيفة فوق
      ctx.fillStyle = gb;
      ctx.fill();
      // ضل تلامس رفيع عند الحافة على الجبهة
      ctx.globalCompositeOperation = 'multiply';
      ctx.strokeStyle = 'rgba(60,45,38,0.22)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    const Tr = T.affineFrom3(
      [A.l, A.r, A.top],
      [squash(dstL), squash(dstR), dstT]
    );

    // 🔴 v30: **الظل مش بيترسم إلا لو الطرحة نفسها هتترسم.**
    //    الباج اللي شافه المالك: الطرحة وقعت والظل فضل — و`fillRect`
    //    بتاعه مستطيل بـmultiply، فبان **مستطيل رمادي** عند الجبهة
    //    (باين على الحيطة، مش باين على الشعر). ظل حاجة مش موجودة.
    const willPaintScarf = !!(headImg && Tr);

    // 🌗 ظل التلامس (v20): على الوش نفسه **قبل** ما القماش يترسم
    //    فوقه، وقبل فلتر السطوع (الضل مش بياخد سطوع الطرحة).
    //    multiply = تغميق حقيقي مش طبقة رمادية.
    if(S.scarf.type === 'photo' && willPaintScarf && layerOn('shadow')){
      const sh = T.contactShadowSpec(an, ex);
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.translate(sh.x, sh.y);
      ctx.rotate(sh.rot);
      const gr = ctx.createLinearGradient(0, 0, 0, sh.h);
      gr.addColorStop(0, 'rgba(72,52,42,' + sh.alpha + ')');
      gr.addColorStop(1, 'rgba(72,52,42,0)');
      ctx.fillStyle = gr;
      // 🔴 v30: كان `fillRect` — أركان حادة ممكن تبان برّه حافة
      //    الطرحة (وبانت فعلًا لما الطرحة وقعت). الظل الحقيقي
      //    مالوش أركان: بنقصّه بقطع ناقص فحوافه بتدوب.
      ctx.beginPath();
      ctx.ellipse(0, sh.h * 0.5, sh.w / 2, sh.h * 0.62, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillRect(-sh.w / 2, 0, sh.w, sh.h);
      ctx.restore();
    }

    // 💡 مطابقة الإضاءة — من نفس العيّنة
    ctx.filter = 'brightness(' + T.lumaToBrightness(bright).toFixed(3) + ')';

    // (أ) الانسدال تحت الدقن
    if(asset.drape){
      const dp = T.drapePlacement(an, ex);
      ctx.save();
      ctx.translate(dp.x, dp.y);
      ctx.rotate(dp.rot);
      ctx.drawImage(asset.drape, -dp.w/2, -dp.h*0.06, dp.w, dp.h);
      ctx.restore();
    }

    // (ب) الجزء اللي على الراس — أفيني من ٣ نقط الصورة → ٣ نقط الوش
    const A = asset.anchors;
    const yawSquash = Math.cos(Math.min(0.9, Math.abs(pose.yaw) * Math.PI/180));
    const dstL = ex.l, dstR = ex.r, dstT = ex.top;
    // لفّة جانبية: نضيّق الجانب البعيد شوية (تقريب لطيف مش محاكاة)
    const cx2 = (dstL[0]+dstR[0])/2;
    const squash = (p) => [ cx2 + (p[0]-cx2)*(0.75 + 0.25*yawSquash), p[1] ];
    // v22: الشبكة في **الوضعين** — الصورة الثابتة كانت واخدة الأفيني
    //    المسطح، وهي أصلًا الأولوية (§ الشكل النهائي قبل اللايف)
    if(!layerOn('mesh') && S.mesh) TRYON_MESH.clear();   // 🧪 v32
    if(Tr && S.mesh && S.scarf.type === 'photo'){
      // 🧵 الراس ثابت على الوش والانسدال بيتمايل ويهدى — قماش
      const now2 = performance.now();
      const dt = S.lastFrameT ? now2 - S.lastFrameT : 16.7;
      S.lastFrameT = now2;
      const hw = headImg.naturalWidth || headImg.width;
      const hh = headImg.naturalHeight || headImg.height;
      const chinY = A.l[1] + (A.r[0] - A.l[0]) * 1.15;   // خط الدقن في الأصل
      const warp = contourPairs(lm, w, h, asset, Tr, ex);
      // 🔴 v29: قيمة update كانت مرمية — الشبكة تفشل والتطبيق مكمّل
      //    كأن كله تمام، والنتيجة مستطيل مصمت مكان الطرحة. دلوقتي
      //    الفشل بيرجّعنا للمسار المسطح في نفس الفريم.
      const meshOK = layerOn('mesh') && TRYON_MESH.update(headImg, hw, hh, chinY, Tr, pose.yaw,
                        (ex.l[0] + ex.r[0]) / 2, dt,
                        warp && warp.pairs, warp && warp.radius);
      if(!meshOK){
        TRYON_MESH.clear();
        S.meshFails = (S.meshFails || 0) + 1;
        // فشل متكرر = الشبكة مش هتشتغل على الجهاز ده — نقفلها خالص
        if(S.meshFails > 30){ S.mesh = false; console.warn('الشبكة اتقفلت — المسار المسطح'); }
        ctx.save();
        ctx.setTransform(Tr.a, Tr.d, Tr.b, Tr.e, Tr.c, Tr.f);
        ctx.drawImage(headImg, 0, 0);
        ctx.restore();
      }
      chip(meshOK ? 'mesh' : 'flat(mesh✖)');
      if(window.TRYON_DEBUG && warp) debugContour(warp);
    } else if(Tr && layerOn('scarf')){
      if(S.mesh) TRYON_MESH.clear();
      ctx.save();
      ctx.setTransform(Tr.a, Tr.d, Tr.b, Tr.e, Tr.c, Tr.f);
      ctx.drawImage(headImg, 0, 0);
      ctx.restore();
      chip('flat');
    }
    ctx.filter = 'none';

    // 🧪 v28: Debug Overlay (بند ٢٣) — TRYON_DEBUG=true من الكونسول.
    //    الكانفاس مراية في اللايف — بنعكس الكتابة عشان تتقري صح.
    if(window.TRYON_DEBUG){
      const fps = Math.round(1000 / Math.max(1, S.gov.avg()));
      const lines = [
        'fps ' + fps + ' (' + Math.round(S.gov.avg()) + 'ms)',
        'yaw ' + pose.yaw.toFixed(0) + '° pitch ' + pose.pitch.toFixed(0)
          + '° roll ' + pose.roll.toFixed(0) + '°',
        'stab ' + (S.stabState.stable ? 'STABLE' : 'moving') + ' '
          + (S.stabState.score === Infinity ? '—' : S.stabState.score.toFixed(1)),
        'scarf ' + (S.scarf && S.scarf.id) + ' · ' + (window.tryonDiag ? tryonDiag().asset : '?'),
        'mesh ' + (S.mesh ? 'on' : 'off') + ' fails ' + (S.meshFails || 0),
        'seg ' + (S.seg ? 'ready' : (S.segFailed ? 'failed' : 'idle'))
          + ' hair ' + (S.hairZone ? 'on' : '—')
          + ' mesh ' + (S.mesh ? 'on' : 'off')
      ];
      ctx.save();
      if(S.mode === 'live'){ ctx.translate(w, 0); ctx.scale(-1, 1); }
      ctx.font = '600 13px monospace';
      ctx.textAlign = 'left'; ctx.direction = 'ltr';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(6, 6, 232, lines.length * 18 + 10);
      ctx.fillStyle = '#7CFC9A';
      lines.forEach((t, i) => ctx.fillText(t, 12, 24 + i * 18));
      ctx.restore();
    }
  }

  // متوسط إضاءة الخدود — دلوقتي غلاف على sampleSkin (مسار عيّنة واحد)
  function sampleLuma(ctx, an){
    return sampleSkin(ctx, an).luma;
  }

  /* ============================================================
     ٥) اللوب
     ============================================================ */
  /* 🩺 v36: الكاشف بياخد **كانفاس مصغّر** بدل الفيديو الخام.
     السبب: v35 أثبت إن GPU وCPU الاتنين بيرجّعوا صفر وشوش على وش
     واضح — يعني المشكلة مش في المندوب، وأقرب تفسير باقي هو **حجم
     الفريم**: كاميرات أندرويد الحديثة بتدي 1080×1920 وأكتر، وبعض
     الأجهزة بتفشل في تحويل الفريم الكبير ده لتنسور من غير أي خطأ.
     ⚠️ المعالم بترجع **نسبية (0–1)** فالتصغير مبيأثرش على الرسم
        خالص — الحسابات كلها بتتضرب في مقاس كانفاس العرض زي ما هي. */
  function detectSrc(){
    const vw = S.video.videoWidth || 0, vh = S.video.videoHeight || 0;
    if(!vw || !vh) return S.video;
    if(!S._inCv){ S._inCv = document.createElement('canvas'); S._inCtx = S._inCv.getContext('2d', { willReadFrequently:true }); }
    const target = 480;                       // عرض ثابت — أسرع وأأمن
    const sc = Math.min(1, target / Math.max(vw, vh));
    const w = Math.max(2, Math.round(vw * sc)), h = Math.max(2, Math.round(vh * sc));
    if(S._inCv.width !== w || S._inCv.height !== h){ S._inCv.width = w; S._inCv.height = h; }
    S._inCtx.drawImage(S.video, 0, 0, w, h);
    return S._inCv;
  }

  function loop(){
    if(!S.running || S.mode !== 'live') return;
    const t0 = performance.now();
    if(S.gov.shouldProcess() && S.video.readyState >= 2){
      try{
        S.frames = (S.frames || 0) + 1;
        const res = S.landmarker.detectForVideo(detectSrc(), t0);
        draw(res, S.video);
        liveHairPass().catch(() => {});     // v28: ثابتة + مخنوق — مش كل فريم
      }catch(e){
        /* ⚠️ الخطأ ده كان بيتبلع في console.warn — والمالك على موبايل
           مفيهوش كونسول، فكان بيشوف «مفيش طرحة» من غير أي سبب. */
        S.detectErr = String((e && e.message) || e).slice(0, 60);
        console.warn(e);
      }
    }
    S.gov.report(performance.now() - t0);
    requestAnimationFrame(loop);
  }

  /* ============================================================
     ٦) وضع الصورة الثابتة — نفس المحرك، دقة أعلى
     ============================================================ */
  async function tryOnPhoto(file){
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    // اختارت صورة = رسالة "الكاميرا مش شغالة" خلاص عملت شغلها
    if(!S.fatalShown) $('fatal').style.display = 'none';
    S.mode = 'photo'; S.running = false;
    stopCamera();                              // 🟢 الدوت الأخضر يطفي في وضع الصورة
    $('btnPhoto').classList.add('on'); $('btnLive').classList.remove('on');
    S.canvas.classList.remove('mirror');
    S.canvas.width = img.naturalWidth; S.canvas.height = img.naturalHeight;
    const c3p = $('stage3d'); c3p.width = S.canvas.width; c3p.height = S.canvas.height;
    // 🔴 stage3d (اللي الطرحة نفسها عليه) كان بيفضل مقلوب مراية في
    //    وضع الصورة — وش مش في النص بالظبط = الطرحة في الناحية المعكوسة
    c3p.classList.remove('mirror');
    if(S.r3d) TRYON3D.resize(S.canvas.width, S.canvas.height);
    if(S.mesh){ TRYON_MESH.resize(S.canvas.width, S.canvas.height); TRYON_MESH.clear(); }
    await S.setImageMode();
    S.stillResult = S.landmarker.detect(img);
    S.stillImg = img;
    // 💇 v25: ماسك الصورة اللي فاتت ميتلبسش على الجديدة —
    //    التصفير **قبل** أول رسمة، والحساب الجديد بيكمل في الخلفية
    S.hairZone = null; S.hairCoverCanvas = null; S.hairCoverKey = null;
    resetSmooth();
    draw(S.stillResult, img);
    if(!S.stillResult.faceLandmarks || !S.stillResult.faceLandmarks.length)
      hint('مش لاقيين وش واضح في الصورة دي');
    else{
      maybeBandanaHint();               // v23: اقتراح البندانة — مرة واحدة بس
      computeHairCover(img).catch(() => {});   // 💇 مش بنستنّاه — بيرسم لما يخلص
    }
  }

  async function backToLive(){
    // 🛟 الكاميرا ممكن تفضل مش متاحة (WebView) — منرجعش للايف على
    //    كانفاس مقاسه undefined، بنفضل على الصورة ونقول السبب.
    try{
      await startCamera();
    }catch(e){
      S.camErr = e; S.lastErr = e;
      photoOnly(e);
      return;
    }
    S.mode = 'live';
    $('btnLive').classList.add('on'); $('btnPhoto').classList.remove('on');
    S.canvas.classList.add('mirror');
    S.canvas.width = S.video.videoWidth; S.canvas.height = S.video.videoHeight;
    const c3l = $('stage3d'); c3l.width = S.canvas.width; c3l.height = S.canvas.height;
    c3l.classList.add('mirror');           // اللايف مراية — الاتنين مع بعض دايمًا
    if(S.r3d) TRYON3D.resize(S.canvas.width, S.canvas.height);
    if(S.mesh) TRYON_MESH.resize(S.canvas.width, S.canvas.height);
    await S.setVideoMode();
    resetSmooth();
    S.running = true; loop();
  }

  function resetSmooth(){
    S.smTop.reset(); S.smChin.reset(); S.smL.reset(); S.smR.reset();
    // v20: إضاءة الصورة الثابتة غير إضاءة اللايف — من غير reset
    // الحرارة القديمة بتتنقل للوضع الجديد وتاخد ثواني تصحّح
    S.smDr.reset(); S.smDb.reset();
    S.smContour.forEach((sm) => sm.reset());
    S.stab.reset();
    S.stabState = { stable: false, score: Infinity };
  }

  /* ============================================================
     ٧) التقاط ومشاركة — المشاركة إعلان مجاني
     ============================================================ */
  /* 📸 v28 (بند ١٨): اللقطة في اللايف بتاخد مسار الصورة الكامل —
     فريم كامل من الفيديو + كشف IMAGE (أدق من فريم فيديو عابر) +
     ماسك شعر متزامن — وبعد الحفظ اللايف بيرجع لوحده. اللقطة ممكن
     تاخد نص ثانية زيادة، ومقبول: الصورة النهائية أهم من اللاتنسي. */
  async function captureStillPass(){
    if(S.mode !== 'live' || !S.video || S.video.readyState < 2) return;
    const frame = document.createElement('canvas');
    frame.width = S.video.videoWidth; frame.height = S.video.videoHeight;
    frame.getContext('2d').drawImage(S.video, 0, 0);
    S.running = false;                        // اللوب واقف مؤقتًا — مش مقفول
    try{
      await S.setImageMode();
      const res = S.landmarker.detect(frame);
      const lm = res.faceLandmarks && res.faceLandmarks[0];
      if(lm){
        const z = await hairZoneFor(frame, lm);
        if(z){
          S.hairZone = z; S.hairT = performance.now();
          S.hairCoverCanvas = null; S.hairCoverKey = null;
        }
        S.stabState = { stable: true, score: 0 };   // اللقطة ثابتة بحكم التعريف
        draw(res, frame);
      }
    }catch(e){ console.warn('hq', e); }
  }

  async function resumeLive(){
    if(S.mode !== 'live') return;
    try{ await S.setVideoMode(); }catch(e){}
    S.running = true; loop();
  }

  async function capture(){
    // في اللايف: باص جودة عالية الأول — وفشله مش بيمنع اللقطة العادية
    if(S.mode === 'live') await captureStillPass().catch(() => {});
    const out = document.createElement('canvas');
    out.width = S.canvas.width; out.height = S.canvas.height;
    const g = out.getContext('2d');
    if(S.mode === 'live'){ g.translate(out.width, 0); g.scale(-1, 1); }  // زي ما هي شايفة نفسها
    g.drawImage(S.canvas, 0, 0);
    // 🔴 كان `if(S.r3d)` بس — والشبكة (الافتراضي!) بترسم **الطرحة
    //    نفسها** على stage3d برضه. النتيجة: كل لقطة من غير طرحة خالص.
    if(S.r3d || S.mesh){
      try{ g.drawImage($('stage3d'), 0, 0, out.width, out.height); }catch(e){}
    }
    // ختم البراند خفيف
    g.setTransform(1,0,0,1,0,0);
    g.font = '600 ' + Math.round(out.width*0.045) + 'px Tajawal, sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.shadowColor = 'rgba(0,0,0,0.4)'; g.shadowBlur = 8;
    g.textAlign = 'left';
    g.fillText('echarpe ✿', out.width*0.04, out.height*0.96);

    const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.92));
    const file = new File([blob], 'echarpe-tryon.jpg', { type:'image/jpeg' });
    if(navigator.canShare && navigator.canShare({ files:[file] })){
      try{ await navigator.share({ files:[file], title:'echarpe' }); return; }catch(e){}
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'echarpe-tryon.jpg'; a.click();
  }

  async function captureAndResume(){
    try{ await capture(); }
    finally{ if(S.mode === 'live') resumeLive(); }   // اللايف بيرجع مهما حصل
  }

  /* ============================================================
     ٨) الواجهة
     ============================================================ */
  function hint(msg){
    if(msg === S.lastHint) return;
    S.lastHint = msg;
    const el = $('hint');
    el.textContent = msg;
    el.classList.toggle('show', !!msg);
  }
  function setLoad(msg){
    const el = $('loader');
    el.querySelector('p').textContent = msg;
    el.style.display = msg ? 'flex' : 'none';
  }

  function buildUI(){
    // 🎨 قرار المالك: مفيش لوحة ألوان — اللون بييجي من **صورة المنتج**
    //    اللي الشات بيسلّمها. من غير صورة = بيج محايد (مجرد معاينة).
    S.color = { id:'default', name:'', hex:'#c9ac86' };
    // 🔴 v34 (تغيير استراتيجية): الشاشة **مش بتعتمد على ملف** خالص.
    //    الطرحة المرسومة بالكود بترسم فورًا (صفر تحميل، صفر انتظار)،
    //    والأصل المصوّر بيتحمّل في الخلفية وبيحلّ محلها لما يجهز.
    //    السبب: تسع نسخ كانت بتصلّح في *تحميل* الملف، والعميلة كانت
    //    بتشوف شاشة فاضية طول الوقت ده. مفيش شاشة فاضية تاني — أسوأ
    //    حالة شكل مبدئي.
    const _photoFirst = window.TRYON_CATALOG.find((x) => x.type === 'photo');
    const _drawn = window.TRYON_CATALOG.find((x) => x.type === 'procedural');
    S.scarf = _drawn || window.TRYON_CATALOG[0];
    S.pendingPhoto = _photoFirst || null;

    const qs = new URLSearchParams(location.search);
    const src = T.imageSourceFromQuery(
      (k) => qs.get(k),
      (k) => { try{ return sessionStorage.getItem(k); }catch(e){ return null; } }
    );
    if(src.kind !== 'none') colorFromProductImage(src.value).catch(() => {});

    buildBandanaRow();

    $('btnShot').onclick = () => captureAndResume().catch(console.warn);
    $('btnLive').onclick = () => backToLive().catch(console.warn);
    $('btnPhoto').onclick = () => $('photoInput').click();
    $('photoInput').onchange = (e) => {
      if(e.target.files && e.target.files[0])
        tryOnPhoto(e.target.files[0]).catch(console.warn);
      e.target.value = '';
    };
  }

  /* 🧵 v26: زراير "بالكنار/سادة" اتشالت من واجهة العميلة (قرار
     المالك): دي كانت بتكشف عيب داخلي — إن عندنا قالب واحد بنلوّنه.
     الستايل بقى **تلقائي بس** من صورة المنتج (لون غالب جدًا = ساده).
     والحل الحقيقي لتنوّع الطرح (مسجر/ساده/كنار/مطرزة) هو أصل مصوّر
     لكل موديل — prep.html جاهزة ليه، والكتالوج بياخد أي عدد أصول. */

  /* 🧕 v23: صف اختيار البندانة — أول زرار "من غير بندانة" (الافتراضي)
     وبعده الألوان. الرسم بيتحدث فورًا في وضع الصورة. */
  function buildBandanaRow(){
    const row = $('bandanaRow');
    if(!row) return;
    T.BANDANA_COLORS.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'bnd' + (c.hex ? '' : ' none') + (S.bandana === null && !c.hex ? ' on' : '');
      b.title = c.name;
      b.setAttribute('aria-label', c.name);
      if(c.hex) b.style.background = c.hex;
      else b.textContent = '✕';
      b.onclick = () => {
        S.bandana = c.hex ? c : null;
        row.querySelectorAll('.bnd').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        if(S.mode === 'photo' && S.stillImg) draw(S.stillResult, S.stillImg);
      };
      row.appendChild(b);
    });
  }

  // اقتراح لطيف مرة واحدة: أول ما الطرحة تلبس صح والعميلة من غير
  // بندانة — مش إجبار، مجرد لفت نظر إن دي اللي بتكمّل الشكل
  function maybeBandanaHint(){
    if(S.bandanaHinted || S.bandana) return;
    S.bandanaHinted = true;
    hint('جرّبي بندانة تحتها من الألوان اللي فوق 🧕 — بتغطي الشعر وبتكمّل اللبسة');
  }

  /* ============================================================
     ٨ب) لون من صورة المنتج — ?img=
     ============================================================ */
  async function colorFromProductImage(url){
    const img = new Image();
    img.crossOrigin = 'anonymous';           // لازم للينكات برا echarpe.store
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 64, 64);
    const px = g.getImageData(0, 0, 64, 64).data;   // canvas ملوث = بيرمي هنا
    const dom = T.dominantColor(px);
    if(!dom.hex || dom.confidence < 0.08) return;    // كلها خلفية = البيج المحايد
    S.color = { id:'from-img', name:'لون المنتج', hex:dom.hex };
    // 🧵 v26: منتج لونه غالب جدًا = غالبًا ساده — تلقائي بالكامل،
    //    مفيش زراير قدام العميلة (الستايل من صورة المنتج نفسها)
    S.plain = dom.confidence >= 0.4;
    S.assetCache = {};                               // اللون اتغير = الرسمة تتبني تاني
    if(S.mode === 'photo' && S.stillImg) draw(S.stillResult, S.stillImg);
  }

  /* ============================================================
     ٩) الإقلاع
     ============================================================ */
  async function boot(){
    S.video = $('cam'); S.canvas = $('stage');
    S.ctx = S.canvas.getContext('2d', { willReadFrequently:true });
    buildUI();
    try{
      S.stage = 'model';
      await loadLandmarker();
      S.stage = 'camera';
      // 🛟 فشل الكاميرا **مش** نهاية الصفحة: وضع الصورة شغّال من
      //    غيرها خالص. الشاشة السودا + رسالة خطأ كانت بتضيّع
      //    العميلة وهي قادرة تجرّب بصورة.
      try{
        await startCamera();
      }catch(e){
        S.camErr = e; S.lastErr = e;
        S.canvas.width = S.canvas.width || 720;
        S.canvas.height = S.canvas.height || 960;
        photoOnly(e);
        return;
      }
      S.stage = 'renderer';
      // 🛟 فشل الرندرر (3D أو الشبكة) عمره ما ياخد الصفحة معاه —
      //    الكاميرا شغالة خلاص، فبنكمّل بالمسار المسطح بدل شاشة خطأ.
      try{
        // 🧊 وضع الـAR التجريبي خلف ?ar=1 — قرار: العميلة تشوف القالب
        //    المصوّر (شكل طرحة حقيقية) لحد ما الـ3D ياخد شكله النهائي
        const qsb = new URLSearchParams(location.search);
        if(qsb.get('ar'))
          S.r3d = await TRYON3D.init(S.canvas.width, S.canvas.height);
        else if(!qsb.get('flat'))
          // 🧵 الشبكة القماشية: نفس صورة القالب + فيزياء تمايل — الافتراضي
          S.mesh = await TRYON_MESH.init(S.canvas.width, S.canvas.height);
      }catch(e){
        S.lastErr = e;
        console.warn('الرندرر فشل — كمّلنا بالمسار المسطح:', e);
      }
      S.stage = 'live';
      setLoad('');
      tryUpgradeToPhoto();       // 🔼 v34: الأصل المصوّر في الخلفية
      S.running = true;
      loop();
    }catch(e){
      console.error(e);
      S.lastErr = e;
      setLoad('');
      showFatal(e);
    }
  }

  /* 🩺 شاشة الخطأ: رسالة مؤدبة للعميلة + سطر تقني صغير (النسخة
     والمرحلة ونص الخطأ) — من غيره التشخيص على الموبايل مستحيل،
     مفيش كونسول. اللمس عليه بينسخه عشان تبعته في الشات. */
  function showFatal(e){
    const adv = T.failureAdvice(S.stage, e && e.name);
    msgBox(adv.text, e, true);
  }

  /* 📷 الكاميرا وقعت بس التجربة لسه ممكنة: بنفضل واقفين على وضع
     الصورة بدل شاشة خطأ — وزرار الصورة بيتفتح من الرسالة نفسها. */
  function photoOnly(e){
    const adv = T.failureAdvice(S.stage, e && e.name);
    S.mode = 'photo'; S.running = false;
    S.stage = 'photo-only';
    setLoad('');
    $('btnPhoto').classList.add('on');
    $('btnLive').classList.remove('on');
    S.canvas.classList.remove('mirror');
    $('stage3d').classList.remove('mirror');
    msgBox(adv.text, e, false, '📷 اختاري صورة', () => $('photoInput').click());
  }

  // صندوق رسالة واحد للحالتين — زرار إجراء + السطر التقني
  function msgBox(text, e, isFatal, btnText, onBtn){
    const box = $('fatal');
    box.textContent = '';
    const p1 = document.createElement('div');
    p1.textContent = text;
    box.appendChild(p1);

    const b = document.createElement('button');
    b.textContent = btnText || '🔄 جرّبي تاني';
    b.style.cssText = 'margin-top:10px; padding:8px 18px; border:0; border-radius:99px;'
                    + 'font-family:inherit; font-weight:700; font-size:14px;'
                    + 'background:var(--gold-deep,#b8912f); color:#fff;';
    b.onclick = onBtn || (() => location.reload());
    box.appendChild(b);

    const p2 = document.createElement('div');
    p2.style.cssText = 'margin-top:10px; font-size:11px; opacity:.7; direction:ltr;'
                     + 'text-align:left; word-break:break-word; line-height:1.5;';
    p2.textContent = errLine(e);
    p2.title = 'المس للنسخ';
    p2.addEventListener('click', () => {
      const t = errLine(e);
      try{ navigator.clipboard.writeText(t); }catch(x){}
      p2.textContent = t + '  ✓ اتنسخ';
    });
    box.appendChild(p2);
    box.style.display = 'block';
    if(isFatal) S.fatalShown = true;
  }

  function errLine(e){
    return TRYON_VER + ' · ' + (S.stage || '?') + ' · '
         + ((e && e.name) || 'Error') + ': '
         + String((e && e.message) || e || '').slice(0, 200);
  }

  if(document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // للقاعدة الذهبية §18 + التشخيص من الكونسول
  window.tryonDiag = () => ({ ver: TRYON_VER, delegate: S.delegate, lostFrames: S.lostFrames,
    vw: S.video && S.video.videoWidth, vh: S.video && S.video.videoHeight,
    frames: S.frames, detectErr: S.detectErr,
    mode:S.mode, running:S.running,
    stage: S.stage, r3d: S.r3d, mesh: S.mesh, meshFails: S.meshFails || 0,
    off: Object.keys(TRYON_OFF).filter((k) => TRYON_OFF[k]),
    scarf: S.scarf && S.scarf.id, scarfType: S.scarf && S.scarf.type,
    asset: (function(){
      try{
        const a = S.assetCache[S.scarf.id + '|' + (S.scarf.tintable ? S.color.id : '-')];
        if(!a) return 'none';
        return a.failed ? ('failed: ' + a.why) : (a.ready ? 'ready' : 'loading');
      }catch(e){ return 'err'; }
    })(),
    seg: S.seg ? 'ready' : (S.segFailed ? 'failed' : 'idle'),
    hairZone: !!S.hairZone,
    stable: S.stabState.stable, stabScore: S.stabState.score,
    fps: Math.round(1000 / Math.max(1, S.gov.avg())),
    err: S.lastErr ? errLine(S.lastErr) : null,
    frameMs: Math.round(S.gov.avg()), scarf:S.scarf && S.scarf.id,
    color:S.color && S.color.id });
})();
