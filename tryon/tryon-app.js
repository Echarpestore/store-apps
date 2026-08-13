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

  const TRYON_VER = 'v19';
  console.log('echarpe tryon', TRYON_VER);

  const $ = (id) => document.getElementById(id);
  const T = window.TRYON;

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
    gov: T.FrameGovernor(),
    assetCache: {},               // (scarfId|colorId) → {head, drape, anchors}
    lastHint: '', lostFrames: 0, r3d: false, mesh: false, lastFrameT: 0,
    camErr: null, fatalShown: false,
    stage: 'boot', lastErr: null      // 🩺 تشخيص: فين وقفنا وإيه الخطأ
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
    try {
      S.landmarker = await vision.FaceLandmarker.createFromOptions(files, opts('GPU'));
    } catch(e) {
      console.warn('GPU فشل — CPU:', e);
      S.landmarker = await vision.FaceLandmarker.createFromOptions(files, opts('CPU'));
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

  function loadPhotoScarf(scarf, color){
    const asset = { ready:false, failed:false, head:null, drape:null,
                    headTinted:null, tintHex:null, _mask:null,
                    anchors: scarf.head.anchors };
    const hi = new Image();
    hi.onload = () => { asset.head = hi; asset.ready = !!(!scarf.drape || asset.drape); };
    // 🛟 الصورة ماتحملتش (لسه ماترفعتش؟) = الرسمة بدل شاشة فاضية
    hi.onerror = () => { asset.failed = true; };
    hi.src = scarf.head.url;
    if(scarf.drape && scarf.drape.url){
      const di = new Image(); di.onload = () => { asset.drape = di; asset.ready = !!asset.head; };
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
    if(color.id !== 'from-img'){ asset.headTinted = null; asset.tintHex = null; return; }
    if(asset.tintHex === color.hex) return;
    try{
      const c = document.createElement('canvas');
      c.width = asset.head.naturalWidth; c.height = asset.head.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(asset.head, 0, 0);
      const im = g.getImageData(0, 0, c.width, c.height);
      if(!asset._mask)
        asset._mask = RECOLOR.buildMask(im.data, scarf.recolor.seeds, scarf.recolor.tol);
      RECOLOR.applyRecolor(im.data, asset._mask, color.hex);
      g.putImageData(im, 0, 0);
      asset.headTinted = c;
      asset.tintHex = color.hex;
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
      if(S.r3d) TRYON3D.clear();
      if(S.mesh) TRYON_MESH.clear();
      if(S.lostFrames > 20) hint('قرّبي وشّك للكاميرا 📷');
      return;
    }
    S.lostFrames = 0;

    const lm = faces[0];
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
    if(q.fade) return;                       // لفّة جامدة = نخفي بدل ما نشوّه

    // نقط التثبيت + تنعيم (في وضع الصورة الثابتة مفيش تنعيم)
    let an = T.anchorsFromLandmarks(lm, w, h);
    if(S.mode === 'live'){
      an = { top: S.smTop.push(an.top), chin: S.smChin.push(an.chin),
             l: S.smL.push(an.l), r: S.smR.push(an.r),
             cheekL: an.cheekL, cheekR: an.cheekR };
    }
    const ex = T.expandAnchors(an);

    let asset = getAsset(S.scarf, S.color);
    if(asset.failed){
      // 🛟 الأصل الحقيقي مش متاح — نرجع للرسمة بدل ما الشاشة تفضى
      const fb = window.TRYON_CATALOG.find((x) => x.type === 'procedural');
      if(fb){ S.scarf = fb; asset = getAsset(S.scarf, S.color); }
    }
    if(!asset.ready) return;
    ensureTint(asset, S.scarf, S.color);
    const headImg = asset.headTinted || asset.head;

    // 💡 مطابقة الإضاءة — عيّنة من الخدود
    const bright = S.smBright.push(sampleLuma(ctx, an));
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
    const Tr = T.affineFrom3(
      [A.l, A.r, A.top],
      [squash(dstL), squash(dstR), dstT]
    );
    if(Tr && S.mesh && S.scarf.type === 'photo' && S.mode === 'live'){
      // 🧵 الراس ثابت على الوش والانسدال بيتمايل ويهدى — قماش
      const now2 = performance.now();
      const dt = S.lastFrameT ? now2 - S.lastFrameT : 16.7;
      S.lastFrameT = now2;
      const hw = headImg.naturalWidth || headImg.width;
      const hh = headImg.naturalHeight || headImg.height;
      const chinY = A.l[1] + (A.r[0] - A.l[0]) * 1.15;   // خط الدقن في الأصل
      TRYON_MESH.update(headImg, hw, hh, chinY, Tr, pose.yaw,
                        (ex.l[0] + ex.r[0]) / 2, dt);
    } else if(Tr){
      if(S.mesh) TRYON_MESH.clear();
      ctx.save();
      ctx.setTransform(Tr.a, Tr.d, Tr.b, Tr.e, Tr.c, Tr.f);
      ctx.drawImage(headImg, 0, 0);
      ctx.restore();
    }
    ctx.filter = 'none';
  }

  // متوسط إضاءة الخدود — عيّنة صغيرة مش الصورة كلها (أداء)
  function sampleLuma(ctx, an){
    try{
      const px = (p) => ctx.getImageData(Math.max(0,p[0]-2), Math.max(0,p[1]-2), 4, 4).data;
      const avg = (d) => { let s=0; for(let i=0;i<d.length;i+=4) s += 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; return s/(d.length/4); };
      return (avg(px(an.cheekL)) + avg(px(an.cheekR))) / 2;
    }catch(e){ return 128; }
  }

  /* ============================================================
     ٥) اللوب
     ============================================================ */
  function loop(){
    if(!S.running || S.mode !== 'live') return;
    const t0 = performance.now();
    if(S.gov.shouldProcess() && S.video.readyState >= 2){
      try{
        const res = S.landmarker.detectForVideo(S.video, t0);
        draw(res, S.video);
      }catch(e){ console.warn(e); }
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
    if(S.r3d) TRYON3D.resize(S.canvas.width, S.canvas.height);
    if(S.mesh){ TRYON_MESH.resize(S.canvas.width, S.canvas.height); TRYON_MESH.clear(); }
    await S.setImageMode();
    S.stillResult = S.landmarker.detect(img);
    S.stillImg = img;
    resetSmooth();
    draw(S.stillResult, img);
    if(!S.stillResult.faceLandmarks || !S.stillResult.faceLandmarks.length)
      hint('مش لاقيين وش واضح في الصورة دي');
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
    if(S.r3d) TRYON3D.resize(S.canvas.width, S.canvas.height);
    if(S.mesh) TRYON_MESH.resize(S.canvas.width, S.canvas.height);
    await S.setVideoMode();
    resetSmooth();
    S.running = true; loop();
  }

  function resetSmooth(){
    S.smTop.reset(); S.smChin.reset(); S.smL.reset(); S.smR.reset();
  }

  /* ============================================================
     ٧) التقاط ومشاركة — المشاركة إعلان مجاني
     ============================================================ */
  async function capture(){
    const out = document.createElement('canvas');
    out.width = S.canvas.width; out.height = S.canvas.height;
    const g = out.getContext('2d');
    if(S.mode === 'live'){ g.translate(out.width, 0); g.scale(-1, 1); }  // زي ما هي شايفة نفسها
    g.drawImage(S.canvas, 0, 0);
    if(S.r3d){
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
    S.scarf = window.TRYON_CATALOG[0];

    const qs = new URLSearchParams(location.search);
    const src = T.imageSourceFromQuery(
      (k) => qs.get(k),
      (k) => { try{ return sessionStorage.getItem(k); }catch(e){ return null; } }
    );
    if(src.kind !== 'none') colorFromProductImage(src.value).catch(() => {});

    $('btnShot').onclick = () => capture().catch(console.warn);
    $('btnLive').onclick = () => backToLive().catch(console.warn);
    $('btnPhoto').onclick = () => $('photoInput').click();
    $('photoInput').onchange = (e) => {
      if(e.target.files && e.target.files[0])
        tryOnPhoto(e.target.files[0]).catch(console.warn);
      e.target.value = '';
    };
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
  window.tryonDiag = () => ({ ver: TRYON_VER, mode:S.mode, running:S.running,
    stage: S.stage, r3d: S.r3d, mesh: S.mesh,
    err: S.lastErr ? errLine(S.lastErr) : null,
    frameMs: Math.round(S.gov.avg()), scarf:S.scarf && S.scarf.id,
    color:S.color && S.color.id });
})();
