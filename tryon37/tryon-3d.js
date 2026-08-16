/* ============================================================
   🧕 tryon-3d.js — رندرر الـAR (Three.js)
   ------------------------------------------------------------
   AR-1: جسم لفة 3D حوالين الراس + occluder للراس (اللي ورا
   الراس بيختفي وراه فعلًا) + تتبّع مصفوفة MediaPipe كاملة
   (position/scale/rotation XYZ) بتنعيم متكيّف.

   AR-2 (الجديد): **إسقاط صورة القالب** من قدام على نفس الجسم —
   كل رأس بياخد UV إسقاطي (aProjUv) ووزن (aProjW). الشيدر بيمزج:
   وزن عالي = بكسل الصورة الحقيقي · وزن واطي (الجناب/الضهر/برّه
   الصورة) = الملمس المكرر بلون المنتج. النتيجة الصورة نفسها 3D.
   + تفصيل طول الانسدال على مقاس الصورة (القالب أطول من جسم AR-1).

   🛟 أي فشل (WebGL ضعيف/CDN واقع) = false → التطبيق بيكمل
   بالمسار 2D القديم زي ما هو. و`?flat=1` بتجبر الـ2D للتشخيص.

   🎛️ معايرة حية من الكونسول: window.T3D_TUNE
   ============================================================ */
'use strict';
(function(){

  const C = window.TRYON3D_CORE;
  const R = {
    THREE: null, renderer: null, scene: null, camera: null,
    group: null, fabricMat: null, hemi: null, dirLight: null,
    ready: false, failed: false, zFlip: 0,
    sp: null, sq: null, tmp: null,
    // AR-2
    uni: null, hood: null, skirt: null, projector: null,
    projKey: null, projTex: null, fitted: null,
    // v38: موديل OBJ الحقيقي المرفوع من المالك
    objRoot: null, objWrap: null, objMeshes: [], objReady: false, objFailed: false
  };

  // 🎛️ لو اللفة محتاجة تظبيطة على وش حقيقي — أرقام من غير deploy
  //    (بعد أي تغيير في أرقام الإسقاط: TRYON3D.reproject())
  window.T3D_TUNE = {
    fov: 63, exposure: 1.0,
    proj: 1,            // 0 = اطفي الإسقاط وشوف AR-1 بالملمس المكرر
    frontFull: null, frontNone: null, edge: null,   // null = قيمة الكور
    flipU: null,        // اقلبها لو الصورة طالعة معكوسة على الجسم
    templeDirY: null,   // ارتفاع نقطة الصدغ — أهم رقم لو الفتحة مش مظبوطة
    autoFit: 1,         // فصّل طول الانسدال على مقاس الصورة

    // 🧕 v38 — موديل الـOBJ الحقيقي. 1 = استخدمه، 0 = ارجع للهندسة الإجرائية القديمة.
    obj: 1,
    objScale: 1.28,
    objX: 0.0,
    objY: 3.5,
    objZ: 0.0,
    objRx: 0.0,
    objRy: Math.PI,
    objRz: 0.0,
    // v44: compensate model scale relative to MediaPipe head scale
    objSX: 1.18,
    objSY: 0.92,
    objSZ: 1.08
  };

  // خد أرقام المعايرة الحية لو المالك غيّرها، وإلا سيب الكور يقرر
  function tuneOpts(){
    const t = window.T3D_TUNE, o = {};
    ['frontFull','frontNone','edge','flipU','templeDirY'].forEach((k) => {
      if(t[k] != null) o[k] = t[k];
    });
    return o;
  }

  async function init(w, h){
    if(R.ready) return true;
    if(R.failed) return false;
    try{
      const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
      R.THREE = THREE;
      const cv = document.getElementById('stage3d');
      R.renderer = new THREE.WebGLRenderer({
        canvas: cv, alpha: true, antialias: true,
        preserveDrawingBuffer: true      // لازم لزرار الالتقاط
      });
      R.renderer.setPixelRatio(1);
      R.renderer.setSize(w, h, false);

      R.camera = new THREE.PerspectiveCamera(window.T3D_TUNE.fov, w / h, 1, 1000);
      R.scene = new THREE.Scene();
      R.hemi = new THREE.HemisphereLight(0xffffff, 0x9a9285, 1.05);
      R.scene.add(R.hemi);
      R.dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      R.dirLight.position.set(0.4, 1, 0.7);
      R.scene.add(R.dirLight);

      R.group = new THREE.Group();
      R.group.matrixAutoUpdate = false;
      R.scene.add(R.group);
      // ⭐ كل الأجسام جوه rig متزحزح لمركز الجمجمة (المصفوفة أصلها عند الوش)
      R.rig = new THREE.Group();
      R.rig.position.set(0, 0, C.SHAPE.rigDz);
      R.group.add(R.rig);

      // 👤 occluder الراس: بيكتب في العمق بس (colorWrite=false) —
      //    أي قماش وراه بيختفي، والوش بيبان من الشباك لأن مفيش لون
      //    بيترسم مكانه (الفيديو تحتنا في canvas الـ2D)
      const occ = C.SHAPE.occluder;
      const om = new THREE.MeshBasicMaterial({ colorWrite: false });
      const oc = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 24), om);
      oc.scale.set(occ.x, occ.y, occ.z);
      oc.position.set(0, occ.dy, occ.dz);
      oc.renderOrder = -1;
      R.rig.add(oc);

      // 🧵 القماش — اللون بييجي من uTint (مش من material.color) عشان
      //    الشيدر يقدر يمزج بين الملمس الملوّن وبكسل الصورة المسقّطة
      //    اللي جاي ملوّن أصلًا من محرك recolor.
      R.uni = {
        uProjMap: { value: null },
        uHasProj: { value: 0 },
        uProjMix: { value: 1 },
        uTint:    { value: new THREE.Color(0xc9ac86) }
      };
      R.fabricMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.88, metalness: 0,
        side: THREE.DoubleSide
      });
      R.fabricMat.onBeforeCompile = injectProjection;
      R.hood = new THREE.Mesh(buildHood(THREE), R.fabricMat);
      R.skirt = new THREE.Mesh(buildSkirt(THREE), R.fabricMat);
      R.rig.add(R.hood);
      R.rig.add(R.skirt);
      loadFabricTexture(THREE);   // 🧵 ملمس القماش الحقيقي من صورة القالب

      // 🧕 v38: حمّل الموديل الحقيقي في الخلفية. لو فشل، الهندسة القديمة
      // تفضل شغالة تلقائيًا. الموديل بياخد نفس material/shader ونفس
      // مصفوفة MediaPipe، فصورة المنتج والإضاءة والـocclusion يفضلوا موحدين.
      loadObjHijab(THREE);

      R.sp = new THREE.Vector3();
      R.sq = new THREE.Quaternion();
      R.tmp = {
        m: new THREE.Matrix4(), p: new THREE.Vector3(),
        q: new THREE.Quaternion(), s: new THREE.Vector3(),
        flip: new THREE.Matrix4().makeScale(1, 1, -1),
        first: true
      };
      R.ready = true;
      console.log('tryon 3D جاهز');
    }catch(e){
      console.warn('3D init فشل — رجوع للمسار 2D:', e);
      R.failed = true;
    }
    return R.ready;
  }


  /* ============================================================
     🧕 v38 — الموديل الحقيقي OBJ
     ------------------------------------------------------------
     - بيستخدم نفس rig ومصفوفة MediaPipe الموجودة أصلًا.
     - كل Mesh بياخد نفس fabricMat وبالتالي نفس إضاءة/تلوين/Projection.
     - بنعمل normalize آلي لحجم تقريبي بالسم ثم بنسيب fine tuning من
       T3D_TUNE من غير deploy.
     - ?obj=0 يرجّع فورًا للهندسة القديمة للتشخيص.
     ============================================================ */
  async function loadObjHijab(THREE){
    if(R.objReady || R.objFailed) return;
    if(/[?&]obj=0(?:&|$)/.test(location.search)){
      window.T3D_TUNE.obj = 0;
      return;
    }
    try{
      const mod = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/OBJLoader.js');
      const loader = new mod.OBJLoader();
      const obj = await new Promise((resolve, reject) =>
        loader.load('assets/hijab-out.obj', resolve, undefined, reject));

      const wrap = new THREE.Group();
      R.objRoot = obj;
      R.objWrap = wrap;
      R.objMeshes = [];

      // أولًا: material واحد للمشروع كله + attributes بتاعة الإسقاط.
      obj.traverse((ch) => {
        if(!ch.isMesh) return;
        let g = ch.geometry;
        // OBJLoader أحيانًا يشارك geometry؛ clone عشان attributes تبقى آمنة.
        g = g.clone();
        if(!g.getAttribute('normal')) g.computeVertexNormals();
        applyProjTo(g);
        ch.geometry = g;
        ch.material = R.fabricMat;
        ch.frustumCulled = false;
        R.objMeshes.push(ch);
      });

      // Normalize حول مركز الـbbox. الارتفاع المستهدف ~44 سم كلفة كاملة.
      const box = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3(), center = new THREE.Vector3();
      box.getSize(size); box.getCenter(center);
      obj.position.sub(center);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const targetCm = 44;
      obj.scale.setScalar(targetCm / maxDim);

      wrap.add(obj);
      R.rig.add(wrap);
      R.objReady = true;
      applyObjTune();
      syncGeometryMode();
      // لو صورة منتج اتحملت قبل ما الـOBJ يخلص تحميل، طبّق projection الآن.
      if(R.projector) reproject();
      console.log('v43 OBJ hijab جاهز', { meshes: R.objMeshes.length, size });
    }catch(e){
      R.objFailed = true;
      console.warn('OBJ hijab فشل — استمرار بالهندسة القديمة:', e);
      syncGeometryMode();
    }
  }

  function applyObjTune(){
    if(!R.objWrap) return;
    const t = window.T3D_TUNE;
    R.objWrap.position.set(t.objX || 0, t.objY || 0, t.objZ || 0);
    R.objWrap.rotation.set(t.objRx || 0, t.objRy || 0, t.objRz || 0);
    const s = (t.objScale == null ? 1 : t.objScale);
    R.objWrap.scale.set(
      s * (t.objSX == null ? 1 : t.objSX),
      s * (t.objSY == null ? 1 : t.objSY),
      s * (t.objSZ == null ? 1 : t.objSZ)
    );
  }

  function syncGeometryMode(){
    const useObj = !!(window.T3D_TUNE.obj && R.objReady && !R.objFailed);
    if(R.objWrap) R.objWrap.visible = useObj;
    // procedural = fallback، أو تقدر تقفله/تشغله حيًا من T3D_TUNE.obj
    if(R.hood) R.hood.visible = !useObj;
    if(R.skirt) R.skirt.visible = !useObj;
    return useObj;
  }


  /* ============================================================
     🖼️ AR-2 — الإسقاط الأمامي
     ============================================================ */

  // حقن المزج في MeshStandardMaterial (بنكسب الإضاءة والظل بتوعه
  // بدل ما نكتب شيدر من الصفر ونخسرهم).
  function injectProjection(sh){
    Object.assign(sh.uniforms, R.uni);
    sh.vertexShader =
      'attribute vec2 aProjUv;\nattribute float aProjW;\n' +
      'varying vec2 vProjUv;\nvarying float vProjW;\n' + sh.vertexShader
        .replace('#include <begin_vertex>',
                 '#include <begin_vertex>\n  vProjUv = aProjUv;\n  vProjW = aProjW;');
    sh.fragmentShader =
      'uniform sampler2D uProjMap;\nuniform float uHasProj;\nuniform float uProjMix;\n' +
      'uniform vec3 uTint;\nvarying vec2 vProjUv;\nvarying float vProjW;\n' + sh.fragmentShader
        .replace('#include <map_fragment>',
                 '#include <map_fragment>\n' +
                 '  diffuseColor.rgb *= uTint;\n' +
                 '  if(uHasProj > 0.5){\n' +
                 '    vec4 pc = texture2D(uProjMap, vProjUv);\n' +
                 '    float w = clamp(vProjW, 0.0, 1.0) * pc.a * uProjMix;\n' +
                 '    diffuseColor.rgb = mix(diffuseColor.rgb, pc.rgb, w);\n' +
                 '  }');
  }

  // حساب UV والوزن لكل رأس في جسم واحد (وتحديثهم في مكانهم)
  function applyProjTo(geo){
    const THREE = R.THREE;
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    const n = pos.count;
    const on = window.T3D_TUNE.proj ? R.projector : null;
    const res = C.projectVertices(pos.array, nor && nor.array, on, tuneOpts());
    let au = geo.getAttribute('aProjUv'), aw = geo.getAttribute('aProjW');
    if(!au || au.count !== n){
      au = new THREE.Float32BufferAttribute(res.uv, 2);
      aw = new THREE.Float32BufferAttribute(res.w, 1);
      geo.setAttribute('aProjUv', au);
      geo.setAttribute('aProjW', aw);
    } else {
      au.array.set(res.uv); aw.array.set(res.w);
      au.needsUpdate = true; aw.needsUpdate = true;
    }
  }

  function reproject(){
    if(!R.ready) return false;
    try{
      if(R.hood) applyProjTo(R.hood.geometry);
      if(R.skirt) applyProjTo(R.skirt.geometry);
      if(R.objMeshes && R.objMeshes.length)
        R.objMeshes.forEach((m) => { if(m && m.geometry) applyProjTo(m.geometry); });
      R.uni.uHasProj.value = (R.projector && R.projTex && window.T3D_TUNE.proj) ? 1 : 0;
      return true;
    }catch(e){ console.warn('reproject', e); return false; }
  }

  // 📏 تفصيل الانسدال على مقاس الصورة: بنقرا ألفا الصورة، نطلّع ملف
  //    العرض، ونعيد بناء الانسدال بالطول والعرض الحقيقيين.
  //    أي فشل (كانفاس ملوّث/صورة غريبة) = نسيب هندسة AR-1 زي ما هي.
  function fitSkirt(src, w, h){
    if(!window.T3D_TUNE.autoFit) return false;
    try{
      const c = document.createElement('canvas');
      c.width = Math.min(160, w); c.height = Math.round(c.width * h / w);
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(src, 0, 0, c.width, c.height);
      const data = g.getImageData(0, 0, c.width, c.height).data;
      const prof = C.assetProfile(data, c.width, c.height, 28);
      // الملف مقاس مصغّر — نرجّعه لبكسل الأصل عشان يتكلم مع الإسقاط
      const kx = w / c.width, ky = h / c.height;
      const scaled = prof.map((p) => ({
        py: p.py * ky, cx: p.cx * kx, halfW: p.halfW * kx,
        xMin: p.xMin * kx, xMax: p.xMax * kx
      }));
      const fit = C.fitSkirtToAsset(R.projector, scaled);
      if(!fit) return false;
      const cur = C.SHAPE;
      if(R.fitted && Math.abs(R.fitted.skirtBotY - fit.skirtBotY) < 0.3
                  && Math.abs(R.fitted.skirtBotR - fit.skirtBotR) < 0.3) return false;
      if(Math.abs(cur.skirtBotY - fit.skirtBotY) < 0.3
      && Math.abs(cur.skirtBotR - fit.skirtBotR) < 0.3){ R.fitted = fit; return false; }
      C.setShape(fit);
      R.fitted = fit;
      const old = R.skirt.geometry;
      R.skirt.geometry = buildSkirt(R.THREE);
      old.dispose();
      return true;
    }catch(e){ console.warn('fitSkirt', e); return false; }
  }

  // src = صورة/كانفاس القالب **بعد التلوين** · anchors = نقط الكتالوج
  function setProjection(src, anchors, w, h){
    if(!R.ready || !src || !anchors) return false;
    try{
      const THREE = R.THREE;
      R.projector = C.buildProjector(anchors, w, h, tuneOpts());
      if(!R.projector) return false;
      if(!syncGeometryMode()) fitSkirt(src, w, h);
      const tex = (typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement)
        ? new THREE.CanvasTexture(src) : new THREE.Texture(src);
      tex.needsUpdate = true;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      if(THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      if(R.projTex) R.projTex.dispose();
      R.projTex = tex;
      R.uni.uProjMap.value = tex;
      reproject();
      return true;
    }catch(e){ console.warn('setProjection', e); return false; }
  }

  /* ---------- 🧵 خامة القماش من صورة القالب ---------- */
  // رقعة قماش سادة من الأصل المصوّر → إزالة اللون وتوحيد السطوع →
  // خريطة ملمس مكررة. اللون نفسه بييجي من fabricMat.color (لون
  // المنتج من الشات) — فنفس الملمس بيشتغل بكل الألوان.
  function loadFabricTexture(THREE){
    const img = new Image();
    img.onload = () => {
      try{
        const P = 256;
        const c = document.createElement('canvas'); c.width = P; c.height = P;
        const g = c.getContext('2d');
        // رقعة من منتصف القماش الشمال (منطقة سادة في الأصل 640×1124)
        g.drawImage(img, 60, 520, 220, 220, 0, 0, P, P);
        const im = g.getImageData(0, 0, P, P);
        let sum = 0;
        for(let i = 0; i < im.data.length; i += 4){
          const l = 0.299*im.data[i] + 0.587*im.data[i+1] + 0.114*im.data[i+2];
          im.data[i] = im.data[i+1] = im.data[i+2] = l;
          im.data[i+3] = 255;
          sum += l;
        }
        const mean = sum / (im.data.length / 4);
        const k = 208 / Math.max(1, mean);        // توحيد السطوع حوالين درجة فاتحة
        for(let i = 0; i < im.data.length; i += 4){
          const v = Math.max(0, Math.min(255, im.data[i] * k));
          im.data[i] = im.data[i+1] = im.data[i+2] = v;
        }
        g.putImageData(im, 0, 0);
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(5, 7);
        R.fabricMat.map = tex;
        R.fabricMat.needsUpdate = true;
      }catch(e){ console.warn('fabric tex', e); }
    };
    img.onerror = () => {};
    img.src = 'assets/template-01-head.png';
  }

  /* ---------- بناء القشرة (بفتحة الوش) ---------- */
  function buildHood(THREE){
    const SEG = 72, RINGS = 52, TH1 = C.SHAPE.thetaEnd;
    const pos = [], uv = [], idx = [], dirs = [];
    for(let i = 0; i <= RINGS; i++){
      const th = TH1 * i / RINGS;
      for(let j = 0; j <= SEG; j++){
        const ph = j / SEG * Math.PI * 2 - Math.PI;   // -π..π و0 = قدام
        const p = C.hoodPoint(th, ph);
        pos.push(p.x, p.y, p.z);
        dirs.push(p.dir);
        uv.push(j / SEG, 1 - i / RINGS);
      }
    }
    const at = (i, j) => i * (SEG + 1) + j;
    for(let i = 0; i < RINGS; i++){
      for(let j = 0; j < SEG; j++){
        const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d2 = at(i, j + 1);
        // مركز الخلية — لو جوه شباك الوش، الخلية متترسمش
        const dd = dirs[a];
        if(C.inFaceWindow(dd.x, dd.y, dd.z)) continue;
        idx.push(a, b, d2, b, c, d2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    applyProjTo(g);                 // AR-2: UV إسقاطي + وزن لكل رأس
    return g;
  }

  /* ---------- الانسدال ---------- */
  function buildSkirt(THREE){
    const SEG = 72, ROWS = 26;
    const pos = [], uv = [], idx = [];
    for(let i = 0; i <= ROWS; i++){
      const v = i / ROWS;
      for(let j = 0; j <= SEG; j++){
        const ph = j / SEG * Math.PI * 2 - Math.PI;
        const p = C.skirtPoint(v, ph);
        pos.push(p.x, p.y, p.z);
        uv.push(j / SEG, 1 - v);
      }
    }
    const at = (i, j) => i * (SEG + 1) + j;
    for(let i = 0; i < ROWS; i++)
      for(let j = 0; j < SEG; j++)
        idx.push(at(i,j), at(i+1,j), at(i,j+1), at(i+1,j), at(i+1,j+1), at(i,j+1));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    applyProjTo(g);                 // AR-2: نفس الإسقاط بيكمّل على الانسدال
    return g;
  }

  /* ---------- التحديث لكل فريم ---------- */
  // matData = Float32Array(16) column-major أو null (مفيش وش)
  // opts = { hex, bright (0.75..1.15), fade,
  //          asset, assetKey, anchors, assetW, assetH }  ← AR-2
  function update(matData, opts){
    if(!R.ready) return false;
    opts = opts || {};

    // 🖼️ صورة القالب (الملوّنة) وصلت أو اتغيّرت → نعيد بناء الإسقاط.
    //    المفتاح بيمنع إعادة البناء كل فريم (بناء = قراءة بكسلات).
    if(opts.asset && opts.anchors && opts.assetKey !== R.projKey){
      if(setProjection(opts.asset, opts.anchors,
                       opts.assetW || opts.asset.naturalWidth || opts.asset.width,
                       opts.assetH || opts.asset.naturalHeight || opts.asset.height))
        R.projKey = opts.assetKey;
    }
    if(!matData || opts.fade){
      // v44: brief detector misses should not make the hijab flash/disappear.
      // Keep the last valid pose for a short grace period.
      const now = performance.now();
      if(!R.lastFaceAt || now - R.lastFaceAt > 350) R.group.visible = false;
      R.renderer.render(R.scene, R.camera);
      return true;
    }
    R.lastFaceAt = performance.now();
    R.group.visible = true;
    applyObjTune();
    syncGeometryMode();

    const t = R.tmp;
    t.m.fromArray(matData);
    if(R.zFlip === 0) R.zFlip = C.zFlipSign(matData[14]);
    if(R.zFlip === -1) t.m.premultiply(t.flip);
    t.m.decompose(t.p, t.q, t.s);

    if(t.first){
      R.sp.copy(t.p); R.sq.copy(t.q); t.first = false;
    } else {
      const aP = C.adaptAlpha(R.sp.distanceTo(t.p));
      R.sp.lerp(t.p, aP);
      const aQ = C.adaptAlpha(R.sq.angleTo(t.q), 0.25, 0.92, 2.2);
      R.sq.slerp(t.q, aQ);
    }
    R.group.matrix.compose(R.sp, R.sq, t.s);

    if(opts.hex){
      // ⚠️ اللون على uTint مش على material.color — لأن material.color
      //    بيضرب في الكل، وبكسل الصورة المسقّطة ملوّن أصلًا (يتلوّن مرتين).
      try{ R.uni.uTint.value.set(opts.hex); }catch(e){}
    }
    R.uni.uProjMix.value = window.T3D_TUNE.proj ? 1 : 0;
    // 💡 مطابقة الإضاءة: نفس عيّنة الخدود بتاعة المسار 2D
    const br = (opts.bright || 1) * window.T3D_TUNE.exposure;
    R.hemi.intensity = 1.05 * br;
    R.dirLight.intensity = 0.8 * br;
    if(R.camera.fov !== window.T3D_TUNE.fov){
      R.camera.fov = window.T3D_TUNE.fov;
      R.camera.updateProjectionMatrix();
    }
    R.renderer.render(R.scene, R.camera);
    return true;
  }

  function resize(w, h){
    if(!R.ready) return;
    R.renderer.setSize(w, h, false);
    R.camera.aspect = w / h;
    R.camera.updateProjectionMatrix();
  }

  function clear(){
    if(!R.ready) return;
    R.group.visible = false;
    R.renderer.render(R.scene, R.camera);
  }

  window.TRYON3D = { init, update, resize, clear, reproject,
    isReady: () => R.ready,
    diag: () => ({ ready: R.ready, failed: R.failed, zFlip: R.zFlip,
      proj: !!(R.projector && R.projTex), projKey: R.projKey,
      fitted: R.fitted,
      obj: { ready:R.objReady, failed:R.objFailed, meshes:R.objMeshes.length,
             active:!!(window.T3D_TUNE.obj && R.objReady && !R.objFailed) },
      tune: window.T3D_TUNE }) };
})();
