/* ============================================================
   🧕 tryon-3d.js — رندرر الـAR (Three.js)
   ------------------------------------------------------------
   AR-1: جسم لفة 3D حوالين الراس + occluder للراس (اللي ورا
   الراس بيختفي وراه فعلًا) + تتبّع مصفوفة MediaPipe كاملة
   (position/scale/rotation XYZ) بتنعيم متكيّف.

   المعمار المتفق عليه: geometry ثابتة + material متغيرة —
   AR-2 هتركّب خامة صورة المنتج على نفس الجسم ده.

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
    sp: null, sq: null, tmp: null
  };

  // 🎛️ لو اللفة محتاجة تظبيطة على وش حقيقي — أرقام من غير deploy
  window.T3D_TUNE = { fov: 63, exposure: 1.0 };

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

      // 🧵 القماش — AR-2 هتبدل اللون بخامة صورة المنتج
      R.fabricMat = new THREE.MeshStandardMaterial({
        color: 0xc9ac86, roughness: 0.88, metalness: 0,
        side: THREE.DoubleSide
      });
      R.rig.add(new THREE.Mesh(buildHood(THREE), R.fabricMat));
      R.rig.add(new THREE.Mesh(buildSkirt(THREE), R.fabricMat));
      loadFabricTexture(THREE);   // 🧵 ملمس القماش الحقيقي من صورة القالب

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
    return g;
  }

  /* ---------- التحديث لكل فريم ---------- */
  // matData = Float32Array(16) column-major أو null (مفيش وش)
  // opts = { hex, bright (0.75..1.15), fade }
  function update(matData, opts){
    if(!R.ready) return false;
    opts = opts || {};
    if(!matData || opts.fade){
      R.group.visible = false;
      R.renderer.render(R.scene, R.camera);
      return true;
    }
    R.group.visible = true;

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
      try{ R.fabricMat.color.set(opts.hex); }catch(e){}
    }
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

  window.TRYON3D = { init, update, resize, clear,
    isReady: () => R.ready,
    diag: () => ({ ready: R.ready, failed: R.failed, zFlip: R.zFlip }) };
})();
