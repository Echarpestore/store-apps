/* ============================================================
   🧵 tryon-mesh.js — رندر الشبكة القماشية (Three.js, screen-space)
   ------------------------------------------------------------
   بياخد **نفس صورة القالب** اللي عجبت المالك، ويرندرها كشبكة
   مثلثات بتتحرك بفيزياء tryon-mesh-core: الراس ثابت على الوش،
   والانسدال بيتمايل ويهدى كأنه قماش. + التفاف/تلاشي مع اللفة.

   🛟 فشل WebGL = false → المسار المسطح القديم بيكمل زي ما هو.
   ============================================================ */
'use strict';
(function(){

  const TM = window.TRYON_MESH_CORE;
  const M = {
    THREE: null, renderer: null, scene: null, camera: null,
    mesh: null, tex: null, texSrc: null,
    grid: null, state: null, geo: null, alphaAttr: null,
    ready: false, failed: false, lastT: 0,
    assetW: 0, assetH: 0
  };
  const COLS = 14, ROWS = 22;

  async function init(w, h){
    if(M.ready) return true;
    if(M.failed) return false;
    try{
      const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
      M.THREE = THREE;
      const cv = document.getElementById('stage3d');
      M.renderer = new THREE.WebGLRenderer({
        canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true
      });
      M.renderer.setPixelRatio(1);
      M.renderer.setSize(w, h, false);
      M.camera = new THREE.OrthographicCamera(0, w, 0, h, -10, 10);
      M.scene = new THREE.Scene();
      M.ready = true;
      console.log('tryon mesh جاهز');
    }catch(e){ console.warn('mesh init', e); M.failed = true; }
    return M.ready;
  }

  function ensureMesh(imgEl, assetW, assetH, chinY){
    const THREE = M.THREE;
    if(!M.mesh){
      M.grid = TM.buildGrid(assetW, assetH, COLS, ROWS, chinY);
      M.assetW = assetW; M.assetH = assetH;
      const n = M.grid.pts.length;
      const pos = new Float32Array(n * 3);
      const uv = new Float32Array(n * 2);
      const al = new Float32Array(n).fill(1);
      M.grid.pts.forEach((p, i) => { uv[i*2] = p.u; uv[i*2+1] = 1 - p.v; });
      const idx = [];
      const C = COLS + 1;
      for(let r = 0; r < ROWS; r++)
        for(let c = 0; c < COLS; c++){
          const a = r*C + c, b = (r+1)*C + c;
          idx.push(a, b, a+1, b, b+1, a+1);
        }
      M.geo = new THREE.BufferGeometry();
      M.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      M.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      M.alphaAttr = new THREE.BufferAttribute(al, 1);
      M.geo.setAttribute('vAlpha', M.alphaAttr);
      M.geo.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({
        transparent: true, depthTest: false, side: THREE.DoubleSide
      });
      // alpha لكل نقطة (التلاشي في اللفة) — حقنة شيدر صغيرة
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = 'attribute float vAlpha;\nvarying float fA;\n' +
          sh.vertexShader.replace('#include <uv_vertex>',
            '#include <uv_vertex>\nfA = vAlpha;');
        sh.fragmentShader = 'varying float fA;\n' +
          sh.fragmentShader.replace('#include <dithering_fragment>',
            '#include <dithering_fragment>\ngl_FragColor.a *= fA;');
      };
      M.mesh = new THREE.Mesh(M.geo, mat);
      // 🔴 v29: MeshBasicMaterial من غير map لونه **أبيض** — يعني
      //    الشبكة كلها بترسم مستطيل مصمت مكان الطرحة (المالك شافه).
      //    فبنخبّيها لحد ما الخامة تتربط فعلًا.
      M.mesh.visible = false;
      M.scene.add(M.mesh);
    }
    if(M.texSrc !== imgEl){
      if(M.tex) M.tex.dispose();
      M.tex = new M.THREE.CanvasTexture(imgEl);
      M.tex.colorSpace = M.THREE.SRGBColorSpace;
      M.mesh.material.map = M.tex;
      M.mesh.material.needsUpdate = true;
      M.texSrc = imgEl;
    } else if(M.tex && imgEl.getContext){
      M.tex.needsUpdate = true;   // كانفاس اتلون من جديد
    }
    // الخامة موجودة؟ يبقى نرسم. مش موجودة؟ نفضل مخفيين والتطبيق
    // بيرجع للمسار المسطح — أي حاجة أحسن من مستطيل أبيض على الوش.
    M.mesh.visible = !!(M.mesh.material && M.mesh.material.map);
    return M.mesh.visible;
  }

  // T = الأفيني أصل→شاشة (نفس اللي بيرسم المسطح) · yaw بالدرجات
  // v22: pairs/warpR = شد حافة الفتحة على محيط الوش الحقيقي (اختياري)
  function update(imgEl, assetW, assetH, chinY, T, yawDeg, faceCx, dtMs, pairs, warpR){
    if(!M.ready || !T) return false;
    if(!imgEl) return false;                    // 🛟 من غير صورة مفيش شبكة
    // 🔴 v29: الخامة ماتربطتش = مستطيل أبيض. بنقول للتطبيق "أنا مش
    //    قادر" بدل ما نرسم حاجة غلط، وهو بيرجع للمسار المسطح.
    if(!ensureMesh(imgEl, assetW, assetH, chinY)) return false;

    const n = M.grid.pts.length;
    const targets = new Array(n);
    for(let i = 0; i < n; i++){
      const p = M.grid.pts[i];
      targets[i] = { x: T.a*p.ax + T.b*p.ay + T.c,
                     y: T.d*p.ax + T.e*p.ay + T.f };
    }
    // 🫥 الفتحة العضوية **قبل** yawWarp والفيزياء — الشد جزء من
    //    "المكان الطبيعي" اللي القماش بينجذب ليه، مش تأثير فوقه
    TM.contourWarp(targets, M.grid, pairs, warpR);
    const alphas = TM.yawWarp(targets, M.grid, yawDeg, faceCx);
    if(!M.state) M.state = TM.initState(targets);
    TM.step(M.state, targets, M.grid, (dtMs || 16.7) / 16.7);

    const pos = M.geo.attributes.position.array;
    for(let i = 0; i < n; i++){
      pos[i*3] = M.state[i].x;
      pos[i*3+1] = M.state[i].y;
      pos[i*3+2] = 0;
      M.alphaAttr.array[i] = alphas[i];
    }
    M.geo.attributes.position.needsUpdate = true;
    M.alphaAttr.needsUpdate = true;
    M.renderer.render(M.scene, M.camera);
    return true;
  }

  function resize(w, h){
    if(!M.ready) return;
    M.renderer.setSize(w, h, false);
    M.camera.right = w; M.camera.bottom = h;
    M.camera.updateProjectionMatrix();
    M.state = null;                 // مقاس جديد = الشبكة تبدأ من مكانها
  }

  function clear(){
    if(!M.ready) return;
    M.scene.visible = false;
    M.renderer.render(M.scene, M.camera);
    M.scene.visible = true;
    M.state = null;
  }

  window.TRYON_MESH = { init, update, resize, clear,
    isReady: () => M.ready,
    diag: () => ({ ready: M.ready, failed: M.failed, settled: M.state ? TM.isSettled(M.state) : null }) };
})();
